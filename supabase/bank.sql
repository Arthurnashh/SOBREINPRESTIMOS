-- =====================================================================
-- SobreImpréstimos — conta bancária
-- Rode DEPOIS de schema.sql e admin.sql.
--
-- Saldo, extrato, cartão, chaves PIX e boletos vivem no Postgres.
-- Nada de saldo em cookie: toda movimentação é atômica e auditável.
-- =====================================================================

-- ---------------------------------------------------------------------
-- CONTA
-- ---------------------------------------------------------------------
create table if not exists public.bank_accounts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null unique references auth.users (id) on delete cascade,
  agency         text not null,
  number         text not null,
  check_digit    text not null,
  balance        numeric(14,2) not null default 0 check (balance >= 0),
  -- limite de crédito pré-aprovado somado ao saldo disponível
  overdraft      numeric(14,2) not null default 0 check (overdraft >= 0),
  status         text not null default 'ativa' check (status in ('ativa','bloqueada','encerrada')),
  opened_at      timestamptz not null default now(),
  unique (agency, number)
);

-- ---------------------------------------------------------------------
-- CHAVES PIX
-- ---------------------------------------------------------------------
create table if not exists public.bank_pix_keys (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  key_type    text not null check (key_type in ('cpf','email','telefone','aleatoria')),
  key_value   text not null unique,
  created_at  timestamptz not null default now()
);

create index if not exists bank_pix_keys_user_idx on public.bank_pix_keys (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- EXTRATO
--   amount > 0 = entrada · amount < 0 = saída
-- ---------------------------------------------------------------------
create table if not exists public.bank_transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  kind         text not null check (kind in (
                 'pix_envio','pix_recebimento','transferencia_envio','transferencia_recebimento',
                 'boleto','credito_emprestimo','debito_automatico','estorno','abertura','tarifa'
               )),
  description  text not null,
  amount       numeric(14,2) not null check (amount <> 0),
  counterparty text,
  document_id  text,
  created_at   timestamptz not null default now()
);

create index if not exists bank_transactions_user_idx on public.bank_transactions (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- CARTÃO VIRTUAL
--   Só os últimos 4 dígitos e o hash do número completo. O número cheio
--   não é persistido: é derivado no servidor a partir do segredo abaixo.
-- ---------------------------------------------------------------------
create table if not exists public.bank_cards (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null unique references auth.users (id) on delete cascade,
  last4             text not null,
  brand             text not null default 'Visa',
  holder            text not null,
  expiry_month      int not null check (expiry_month between 1 and 12),
  expiry_year       int not null check (expiry_year between 2026 and 2099),
  cvv_hash          text not null,
  status            text not null default 'ativo' check (status in ('ativo','bloqueado','cancelado')),
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- BOLETOS PAGOS
-- ---------------------------------------------------------------------
create table if not exists public.bank_boletos (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  barcode        text not null,
  beneficiary    text not null,
  amount         numeric(14,2) not null check (amount > 0),
  due_date       date,
  paid_at        timestamptz not null default now(),
  transaction_id uuid references public.bank_transactions (id) on delete set null
);

create index if not exists bank_boletos_user_idx on public.bank_boletos (user_id, paid_at desc);

-- ---------------------------------------------------------------------
-- RLS: cada cliente vê e move apenas a própria conta
-- ---------------------------------------------------------------------
alter table public.bank_accounts     enable row level security;
alter table public.bank_pix_keys     enable row level security;
alter table public.bank_transactions enable row level security;
alter table public.bank_cards        enable row level security;
alter table public.bank_boletos      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['bank_accounts','bank_pix_keys','bank_transactions','bank_cards','bank_boletos'] loop
    execute format('drop policy if exists "banco: ler o próprio" on public.%I', t);
    execute format('create policy "banco: ler o próprio" on public.%I for select using (auth.uid() = user_id)', t);
    execute format('drop policy if exists "banco: admin lê tudo" on public.%I', t);
    execute format('create policy "banco: admin lê tudo" on public.%I for select using (public.is_admin())', t);
    -- nenhuma escrita direta pelo cliente: tudo passa pelas funções abaixo
    execute format('revoke insert, update, delete on public.%I from authenticated, anon', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- ABERTURA AUTOMÁTICA DA CONTA
--   Chamada no cadastro (e de forma idempotente no primeiro acesso).
-- ---------------------------------------------------------------------
create or replace function public.bank_open_account()
returns public.bank_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  acct  public.bank_accounts;
  v_agency text := '0001';
  v_number text;
  v_digit  text;
  attempt  int := 0;
begin
  if uid is null then raise exception 'não autenticado'; end if;

  select * into acct from public.bank_accounts where user_id = uid;
  if found then return acct; end if;

  loop
    attempt := attempt + 1;
    -- número com 8 dígitos, sem sequências repetidas
    v_number := lpad(((extract(epoch from clock_timestamp()) * 1000)::bigint % 90000000 + 10000000)::text, 8, '0');
    v_number := substr(v_number, 1, 8);
    v_digit  := (substr(v_number, 1, 1)::int + substr(v_number, 8, 1)::int) % 10;
    exit when not exists (select 1 from public.bank_accounts where agency = v_agency and number = v_number);
    if attempt > 20 then raise exception 'não foi possível gerar número de conta'; end if;
  end loop;

  insert into public.bank_accounts (user_id, agency, number, check_digit, balance)
  values (uid, v_agency, v_number, v_digit::text, 0)
  returning * into acct;

  return acct;
end;
$$;

grant execute on function public.bank_open_account() to authenticated;

-- ---------------------------------------------------------------------
-- ABERTURA DO CARTÃO
-- ---------------------------------------------------------------------
create or replace function public.bank_open_card()
returns public.bank_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  card  public.bank_cards;
  v_holder text;
  v_last4  text;
  v_seed   text;
begin
  if uid is null then raise exception 'não autenticado'; end if;

  select * into card from public.bank_cards where user_id = uid;
  if found then return card; end if;

  select coalesce(full_name, '') into v_holder from public.profiles where id = uid;

  v_seed  := uid::text || clock_timestamp()::text;
  v_last4 := lpad((abs(hashtext(v_seed)) % 10000)::text, 4, '0');

  insert into public.bank_cards (user_id, last4, holder, expiry_month, expiry_year, cvv_hash, brand)
  values (
    uid, v_last4, upper(v_holder), 12, extract(year from now())::int + 5,
    encode(digest(v_seed, 'sha256'), 'hex'), 'Visa'
  )
  returning * into card;

  return card;
end;
$$;

grant execute on function public.bank_open_card() to authenticated;

-- ---------------------------------------------------------------------
-- MOVIMENTAÇÃO ATÔMICA
--   Uma única porta de entrada para débito/crédito. Trava a linha da
--   conta (FOR UPDATE), valida saldo+limite e grava o lançamento.
-- ---------------------------------------------------------------------
create or replace function public.bank_move(
  p_kind         text,
  p_description  text,
  p_amount       numeric,           -- positivo = entrada, negativo = saída
  p_counterparty text default null,
  p_document_id  text default null
)
returns public.bank_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  acct   public.bank_accounts;
  tx     public.bank_transactions;
  v_avail numeric(14,2);
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if p_amount = 0 then raise exception 'valor inválido'; end if;
  if p_kind not in ('pix_envio','pix_recebimento','transferencia_envio','transferencia_recebimento',
                    'boleto','credito_emprestimo','debito_automatico','estorno','abertura','tarifa') then
    raise exception 'tipo de movimentação inválido';
  end if;

  select * into acct from public.bank_accounts where user_id = uid for update;
  if not found then raise exception 'conta não encontrada'; end if;
  if acct.status <> 'ativa' then raise exception 'conta não está ativa'; end if;

  v_avail := acct.balance + acct.overdraft;

  if p_amount < 0 and v_avail + p_amount < 0 then
    raise exception 'saldo insuficiente';
  end if;

  update public.bank_accounts
     set balance = balance + p_amount
   where id = acct.id;

  insert into public.bank_transactions (user_id, kind, description, amount, counterparty, document_id)
  values (uid, p_kind, p_description, p_amount, p_counterparty, p_document_id)
  returning * into tx;

  return tx;
end;
$$;

grant execute on function public.bank_move(text, text, numeric, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- CHAVE PIX: criar e remover
-- ---------------------------------------------------------------------
create or replace function public.bank_add_pix_key(p_type text, p_value text)
returns public.bank_pix_keys
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  k   public.bank_pix_keys;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if p_type not in ('cpf','email','telefone','aleatoria') then raise exception 'tipo inválido'; end if;

  insert into public.bank_pix_keys (user_id, key_type, key_value)
  values (uid, p_type, p_value)
  returning * into k;

  return k;
exception
  when unique_violation then raise exception 'esta chave já está registrada';
end;
$$;

grant execute on function public.bank_add_pix_key(text, text) to authenticated;

create or replace function public.bank_remove_pix_key(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.bank_pix_keys where id = p_id and user_id = auth.uid();
end;
$$;

grant execute on function public.bank_remove_pix_key(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- PIX: enviar e receber
-- ---------------------------------------------------------------------
create or replace function public.bank_send_pix(
  p_key     text,
  p_amount  numeric,
  p_message text default null
)
returns public.bank_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_desc text;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'valor inválido'; end if;
  if p_amount > 50000 then raise exception 'valor acima do limite por operação'; end if;

  v_desc := 'PIX enviado';
  if p_message is not null and length(trim(p_message)) > 0 then
    v_desc := v_desc || ' · ' || left(trim(p_message), 80);
  end if;

  return public.bank_move('pix_envio', v_desc, -p_amount, p_key, null);
end;
$$;

grant execute on function public.bank_send_pix(text, numeric, text) to authenticated;

create or replace function public.bank_receive_pix(p_amount numeric, p_from text default null)
returns public.bank_transactions
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_amount is null or p_amount <= 0 then raise exception 'valor inválido'; end if;
  return public.bank_move('pix_recebimento', 'PIX recebido', p_amount, p_from, null);
end;
$$;

grant execute on function public.bank_receive_pix(numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- TRANSFERÊNCIA ENTRE CONTAS DA MESMA INSTITUIÇÃO
-- ---------------------------------------------------------------------
create or replace function public.bank_transfer(
  p_agency  text,
  p_number  text,
  p_amount  numeric,
  p_message text default null
)
returns public.bank_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  target   public.bank_accounts;
  v_desc   text;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'valor inválido'; end if;

  select * into target from public.bank_accounts
   where agency = p_agency and number = p_number;

  if not found then raise exception 'conta de destino não encontrada'; end if;
  if target.user_id = uid then raise exception 'a conta de destino é a mesma da origem'; end if;
  if target.status <> 'ativa' then raise exception 'conta de destino não está ativa'; end if;

  v_desc := 'Transferência enviada · Ag ' || p_agency || ' Cc ' || p_number;
  if p_message is not null and length(trim(p_message)) > 0 then
    v_desc := v_desc || ' · ' || left(trim(p_message), 80);
  end if;

  perform public.bank_move('transferencia_envio', v_desc, -p_amount, 'Ag ' || p_agency || ' Cc ' || p_number, null);

  -- crédito no destino
  update public.bank_accounts set balance = balance + p_amount where id = target.id;
  insert into public.bank_transactions (user_id, kind, description, amount, counterparty)
  values (target.user_id, 'transferencia_recebimento',
          'Transferência recebida', p_amount, 'Ag ' || (select agency from public.bank_accounts where user_id = uid));

  return (select * from public.bank_transactions where user_id = uid order by created_at desc limit 1);
end;
$$;

grant execute on function public.bank_transfer(text, text, numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- BOLETO: pagar
-- ---------------------------------------------------------------------
create or replace function public.bank_pay_boleto(
  p_barcode     text,
  p_beneficiary text,
  p_amount      numeric,
  p_due_date    date default null
)
returns public.bank_boletos
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  tx  public.bank_transactions;
  bl  public.bank_boletos;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'valor inválido'; end if;
  if length(regexp_replace(p_barcode, '\D', '', 'g')) < 44 then
    raise exception 'código de barras inválido';
  end if;

  tx := public.bank_move('boleto', 'Pagamento de boleto · ' || left(p_beneficiary, 60), -p_amount, p_beneficiary, p_barcode);

  insert into public.bank_boletos (user_id, barcode, beneficiary, amount, due_date, transaction_id)
  values (uid, p_barcode, p_beneficiary, p_amount, p_due_date, tx.id)
  returning * into bl;

  return bl;
end;
$$;

grant execute on function public.bank_pay_boleto(text, text, numeric, date) to authenticated;

-- ---------------------------------------------------------------------
-- CRÉDITO DO EMPRÉSTIMO LIBERADO
--   Quando o admin marca o pedido como liberado, o valor cai na conta.
-- ---------------------------------------------------------------------
create or replace function public.bank_credit_loan(p_loan_id uuid)
returns public.bank_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  loan public.loan_requests;
  uid  uuid;
begin
  select * into loan from public.loan_requests where id = p_loan_id;
  if not found then raise exception 'pedido não encontrado'; end if;
  if loan.status <> 'liberado' then raise exception 'pedido não está liberado'; end if;

  uid := loan.user_id;
  if uid <> auth.uid() and not public.is_admin() then raise exception 'não autorizado'; end if;

  -- idempotente: não credita duas vezes
  if exists (select 1 from public.bank_transactions
              where user_id = uid and kind = 'credito_emprestimo' and document_id = p_loan_id::text) then
    return (select * from public.bank_transactions
             where user_id = uid and kind = 'credito_emprestimo' and document_id = p_loan_id::text limit 1);
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);

  return public.bank_move('credito_emprestimo',
    'Crédito de empréstimo liberado', loan.amount, 'SobreImpréstimos', p_loan_id::text);
end;
$$;

grant execute on function public.bank_credit_loan(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- RESUMO PARA O PAINEL (saldo, entradas e saídas do mês)
-- ---------------------------------------------------------------------
create or replace function public.bank_summary()
returns json
language sql
security definer
stable
set search_path = public
as $$
  select json_build_object(
    'balance',      coalesce((select balance   from public.bank_accounts where user_id = auth.uid()), 0),
    'overdraft',    coalesce((select overdraft from public.bank_accounts where user_id = auth.uid()), 0),
    'inflow',       coalesce((select sum(amount) from public.bank_transactions
                               where user_id = auth.uid() and amount > 0
                                 and created_at >= date_trunc('month', now())), 0),
    'outflow',      coalesce((select sum(amount) from public.bank_transactions
                               where user_id = auth.uid() and amount < 0
                                 and created_at >= date_trunc('month', now())), 0),
    'transactions', coalesce((select count(*) from public.bank_transactions where user_id = auth.uid()), 0)
  );
$$;

grant execute on function public.bank_summary() to authenticated;

-- ---------------------------------------------------------------------
-- Abertura no cadastro: estende o trigger existente
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text := coalesce(new.raw_user_meta_data ->> 'full_name', '');
  v_agency text := '0001';
  v_number text;
  v_digit  text;
  v_seed  text;
  attempt int := 0;
begin
  insert into public.profiles (id, full_name, cpf, phone)
  values (new.id, v_name, new.raw_user_meta_data ->> 'cpf', new.raw_user_meta_data ->> 'phone');

  -- conta bancária
  loop
    attempt := attempt + 1;
    v_number := lpad(((extract(epoch from clock_timestamp()) * 1000)::bigint % 90000000 + 10000000)::text, 8, '0');
    v_digit  := ((substr(v_number,1,1)::int + substr(v_number,8,1)::int) % 10)::text;
    exit when not exists (select 1 from public.bank_accounts where agency = v_agency and number = v_number);
    if attempt > 20 then exit; end if;
  end loop;

  insert into public.bank_accounts (user_id, agency, number, check_digit, balance)
  values (new.id, v_agency, v_number, v_digit, 0)
  on conflict (user_id) do nothing;

  -- cartão virtual
  v_seed := new.id::text || clock_timestamp()::text;
  insert into public.bank_cards (user_id, last4, holder, expiry_month, expiry_year, cvv_hash, brand)
  values (new.id, lpad((abs(hashtext(v_seed)) % 10000)::text, 4, '0'), upper(v_name),
          12, extract(year from now())::int + 5, encode(digest(v_seed, 'sha256'), 'hex'), 'Visa')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
