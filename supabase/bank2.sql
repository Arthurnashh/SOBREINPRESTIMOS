-- =====================================================================
-- SobreImpréstimos — conta bancária, parte 2
-- Rode DEPOIS de schema.sql, admin.sql e bank.sql.
--
-- Completa a conta com o que faltava: depósito, saque, recarga, PIX
-- recebido com QR, agendamento, DDA, comprovantes, bloqueio de cartão,
-- limites, dados cadastrais e tarifas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- TIPOS DE MOVIMENTAÇÃO NOVOS
--   Duas travas precisam conhecer os tipos novos: o check da tabela e a
--   lista dentro de bank_move/bank_move_for. Só mexer no check não basta —
--   bank_move valida antes e recusaria a operação com "tipo inválido".
-- ---------------------------------------------------------------------
alter table public.bank_transactions drop constraint if exists bank_transactions_kind_check;
alter table public.bank_transactions add constraint bank_transactions_kind_check
  check (kind in (
    'pix_envio','pix_recebimento','transferencia_envio','transferencia_recebimento',
    'boleto','credito_emprestimo','debito_automatico','estorno','abertura','tarifa',
    'deposito','saque','recarga','agendamento','pix_cobranca','devolucao'
  ));

-- bank_move: mesma lista, agora com os tipos novos
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
                    'boleto','credito_emprestimo','debito_automatico','estorno','abertura','tarifa',
                    'deposito','saque','recarga','agendamento','pix_cobranca','devolucao') then
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

-- bank_move_for: mesma lista (usado pelos agendamentos e pelo crédito de empréstimo)
create or replace function public.bank_move_for(
  p_user_id      uuid,
  p_kind         text,
  p_description  text,
  p_amount       numeric,
  p_counterparty text default null,
  p_document_id  text default null
)
returns public.bank_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  acct    public.bank_accounts;
  tx      public.bank_transactions;
  v_avail numeric(14,2);
begin
  if p_user_id is null then raise exception 'titular não informado'; end if;
  if p_amount = 0 then raise exception 'valor inválido'; end if;
  if p_kind not in ('pix_envio','pix_recebimento','transferencia_envio','transferencia_recebimento',
                    'boleto','credito_emprestimo','debito_automatico','estorno','abertura','tarifa',
                    'deposito','saque','recarga','agendamento','pix_cobranca','devolucao') then
    raise exception 'tipo de movimentação inválido';
  end if;

  select * into acct from public.bank_accounts where user_id = p_user_id for update;
  if not found then raise exception 'conta não encontrada'; end if;
  if acct.status <> 'ativa' then raise exception 'conta não está ativa'; end if;

  v_avail := acct.balance + acct.overdraft;
  if p_amount < 0 and v_avail + p_amount < 0 then
    raise exception 'saldo insuficiente';
  end if;

  update public.bank_accounts set balance = balance + p_amount where id = acct.id;

  insert into public.bank_transactions (user_id, kind, description, amount, counterparty, document_id)
  values (p_user_id, p_kind, p_description, p_amount, p_counterparty, p_document_id)
  returning * into tx;

  return tx;
end;
$$;

-- Só o backend (service_role) move a conta de terceiros.
revoke all on function public.bank_move_for(uuid, text, text, numeric, text, text) from public, anon, authenticated;
grant execute on function public.bank_move_for(uuid, text, text, numeric, text, text) to service_role;

-- ---------------------------------------------------------------------
-- DEPÓSITO
--   Registra como o dinheiro entrou. Não dá para "depositar" sem origem
--   declarada; o valor entra na conta na hora.
-- ---------------------------------------------------------------------
create table if not exists public.bank_deposits (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  amount         numeric(14,2) not null check (amount > 0),
  method         text not null check (method in ('pix','boleto','ted','dinheiro','cheque')),
  origin         text,
  created_at     timestamptz not null default now(),
  transaction_id uuid references public.bank_transactions (id) on delete set null
);

create index if not exists bank_deposits_user_idx on public.bank_deposits (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- SAQUE
--   Saque na conta debita o saldo e gera um código de retirada.
-- ---------------------------------------------------------------------
create table if not exists public.bank_withdrawals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  amount         numeric(14,2) not null check (amount > 0),
  method         text not null default 'pix' check (method in ('pix','caixa','ted')),
  withdraw_code  text not null,
  created_at     timestamptz not null default now(),
  transaction_id uuid references public.bank_transactions (id) on delete set null
);

create index if not exists bank_withdrawals_user_idx on public.bank_withdrawals (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- RECARGA DE CELULAR
-- ---------------------------------------------------------------------
create table if not exists public.bank_topups (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  carrier        text not null,
  phone          text not null,
  amount         numeric(14,2) not null check (amount > 0),
  created_at     timestamptz not null default now(),
  transaction_id uuid references public.bank_transactions (id) on delete set null
);

create index if not exists bank_topups_user_idx on public.bank_topups (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- AGENDAMENTO
--   Uma transferência/PIX para o futuro. Quando `runs_on` chega, o
--   backend executa e marca como pago.
-- ---------------------------------------------------------------------
create table if not exists public.bank_schedules (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  kind           text not null check (kind in ('pix','transferencia','boleto')),
  target         text not null,          -- chave PIX ou "ag/conta"
  amount         numeric(14,2) not null check (amount > 0),
  message        text,
  runs_on        date not null,
  status         text not null default 'agendado' check (status in ('agendado','executado','cancelado','falhou')),
  created_at     timestamptz not null default now(),
  executed_at    timestamptz,
  transaction_id uuid references public.bank_transactions (id) on delete set null
);

create index if not exists bank_schedules_user_idx on public.bank_schedules (user_id, runs_on);

-- ---------------------------------------------------------------------
-- DDA — boletos registrados contra o CPF do titular
--   O cliente consulta e paga daqui.
-- ---------------------------------------------------------------------
create table if not exists public.bank_dda (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  barcode     text not null,
  beneficiary text not null,
  amount      numeric(14,2) not null check (amount > 0),
  due_date    date not null,
  status      text not null default 'aberto' check (status in ('aberto','pago','vencido','cancelado')),
  created_at  timestamptz not null default now()
);

create index if not exists bank_dda_user_idx on public.bank_dda (user_id, due_date);

-- ---------------------------------------------------------------------
-- PIX RECEBIDO (cobrança) — QR Code para alguém te pagar
-- ---------------------------------------------------------------------
create table if not exists public.bank_pix_charges (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  amount      numeric(14,2) not null check (amount > 0),
  description text,
  -- código copia-e-cola / payload do QR
  emv         text not null,
  status      text not null default 'aberta' check (status in ('aberta','paga','expirada','cancelada')),
  created_at  timestamptz not null default now(),
  paid_at     timestamptz
);

create index if not exists bank_pix_charges_user_idx on public.bank_pix_charges (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- COMPROVANTES
--   Guarda o recibo de cada operação para consulta posterior.
-- ---------------------------------------------------------------------
create table if not exists public.bank_receipts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  transaction_id uuid not null references public.bank_transactions (id) on delete cascade,
  kind           text not null,
  title          text not null,
  payload        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists bank_receipts_user_idx on public.bank_receipts (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- TARIFAS
--   Cada tarifa tem um código; a conta registra o que foi cobrado.
--   Hoje todas estão zeradas — a estrutura existe para quando houver preço.
-- ---------------------------------------------------------------------
create table if not exists public.bank_fees (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  code        text not null,
  description text not null,
  amount      numeric(14,2) not null default 0,
  charged_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists bank_fees_user_idx on public.bank_fees (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- DADOS CADASTRAIS DA CONTA
--   O que o banco precisa saber além do perfil de login.
-- ---------------------------------------------------------------------
create table if not exists public.bank_profiles (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  address_line  text,
  address_num   text,
  complement    text,
  district      text,
  city          text,
  state         text check (state is null or state = any (array['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'])),
  zip           text check (zip is null or zip ~ '^[0-9]{8}$'),
  occupation    text,
  income        numeric(14,2) check (income is null or income >= 0),
  updated_at    timestamptz not null default now()
);

-- a tabela pode já existir com o check frouxo (que aceitava 'XX')
-- limpa UF inválida antes de apertar o check, senão a validação falha na linha antiga
update public.bank_profiles
   set state = null
 where state is not null
   and state <> all (array['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
                           'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']);

alter table public.bank_profiles drop constraint if exists bank_profiles_state_check;
alter table public.bank_profiles add constraint bank_profiles_state_check
  check (state is null or state = any (array['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']));

-- ---------------------------------------------------------------------
-- LIMITES DA CONTA
--   Quanto pode sair por operação e por dia. 0 = sem limite.
-- ---------------------------------------------------------------------
create table if not exists public.bank_limits (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  pix_per_tx       numeric(14,2) not null default 5000 check (pix_per_tx >= 0),
  pix_per_day      numeric(14,2) not null default 10000 check (pix_per_day >= 0),
  transfer_per_tx  numeric(14,2) not null default 5000 check (transfer_per_tx >= 0),
  withdraw_per_day numeric(14,2) not null default 3000 check (withdraw_per_day >= 0),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.bank_deposits    enable row level security;
alter table public.bank_withdrawals enable row level security;
alter table public.bank_topups      enable row level security;
alter table public.bank_schedules   enable row level security;
alter table public.bank_dda         enable row level security;
alter table public.bank_pix_charges enable row level security;
alter table public.bank_receipts    enable row level security;
alter table public.bank_fees        enable row level security;
alter table public.bank_profiles    enable row level security;
alter table public.bank_limits      enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'bank_deposits','bank_withdrawals','bank_topups','bank_schedules','bank_dda',
    'bank_pix_charges','bank_receipts','bank_fees','bank_profiles','bank_limits'
  ] loop
    execute format('drop policy if exists "banco: ler o próprio" on public.%I', t);
    execute format('create policy "banco: ler o próprio" on public.%I for select using (auth.uid() = user_id)', t);
    execute format('drop policy if exists "banco: admin lê tudo" on public.%I', t);
    execute format('create policy "banco: admin lê tudo" on public.%I for select using (public.is_admin())', t);
    execute format('revoke insert, update, delete on public.%I from authenticated, anon', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- LIMITE PADRÃO NA ABERTURA DA CONTA
-- ---------------------------------------------------------------------
create or replace function public.bank_ensure_limits(p_user_id uuid)
returns public.bank_limits
language plpgsql
security definer
set search_path = public
as $$
declare lim public.bank_limits;
begin
  insert into public.bank_limits (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  select * into lim from public.bank_limits where user_id = p_user_id;
  return lim;
end;
$$;

grant execute on function public.bank_ensure_limits(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- GASTO DO DIA (para validar limites)
-- ---------------------------------------------------------------------
create or replace function public.bank_spent_today(p_user_id uuid, p_kinds text[])
returns numeric
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(abs(sum(amount)), 0)
    from public.bank_transactions
   where user_id = p_user_id
     and kind = any (p_kinds)
     and amount < 0
     and created_at >= date_trunc('day', now());
$$;

grant execute on function public.bank_spent_today(uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------
-- REGISTRA COMPROVANTE
--   Chamado internamente por cada operação.
-- ---------------------------------------------------------------------
create or replace function public.bank_receipt_add(
  p_user_id uuid, p_tx_id uuid, p_kind text, p_title text, p_payload jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.bank_receipts (user_id, transaction_id, kind, title, payload)
  values (p_user_id, p_tx_id, p_kind, p_title, coalesce(p_payload, '{}'::jsonb));
$$;

revoke all on function public.bank_receipt_add(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.bank_receipt_add(uuid, uuid, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------------
-- DEPÓSITO
-- ---------------------------------------------------------------------
create or replace function public.bank_deposit(
  p_amount numeric,
  p_method text default 'pix',
  p_origin text default null
)
returns public.bank_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  tx  public.bank_transactions;
  dep public.bank_deposits;
  v_label text;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'valor inválido'; end if;
  if p_amount > 100000 then raise exception 'valor acima do limite por depósito'; end if;
  if p_method not in ('pix','boleto','ted','dinheiro','cheque') then raise exception 'forma de depósito inválida'; end if;

  v_label := case p_method
    when 'pix' then 'Depósito por PIX'
    when 'boleto' then 'Depósito por boleto'
    when 'ted' then 'Depósito por TED'
    when 'dinheiro' then 'Depósito em dinheiro'
    else 'Depósito em cheque'
  end;

  tx := public.bank_move('deposito', v_label, p_amount, p_origin, null);

  insert into public.bank_deposits (user_id, amount, method, origin, transaction_id)
  values (uid, p_amount, p_method, p_origin, tx.id)
  returning * into dep;

  perform public.bank_receipt_add(uid, tx.id, 'deposito', v_label,
    jsonb_build_object('amount', p_amount, 'method', p_method, 'origin', p_origin));

  return tx;
end;
$$;

grant execute on function public.bank_deposit(numeric, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- SAQUE
-- ---------------------------------------------------------------------
create or replace function public.bank_withdraw(
  p_amount numeric,
  p_method text default 'pix'
)
returns public.bank_withdrawals
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  tx   public.bank_transactions;
  wd   public.bank_withdrawals;
  lim  public.bank_limits;
  v_spent numeric;
  v_code text;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'valor inválido'; end if;
  if p_method not in ('pix','caixa','ted') then raise exception 'forma de saque inválida'; end if;

  lim := public.bank_ensure_limits(uid);
  v_spent := public.bank_spent_today(uid, array['saque']);

  if lim.withdraw_per_day > 0 and v_spent + p_amount > lim.withdraw_per_day then
    raise exception 'saque acima do limite diário';
  end if;

  tx := public.bank_move('saque', 'Saque ' || case p_method when 'caixa' then 'em caixa' else 'via ' || upper(p_method) end,
                         -p_amount, null, null);

  v_code := upper(substr(encode(extensions.digest(tx.id::text, 'sha256'), 'hex'), 1, 8));

  insert into public.bank_withdrawals (user_id, amount, method, withdraw_code, transaction_id)
  values (uid, p_amount, p_method, v_code, tx.id)
  returning * into wd;

  perform public.bank_receipt_add(uid, tx.id, 'saque', 'Comprovante de saque',
    jsonb_build_object('amount', p_amount, 'method', p_method, 'code', v_code));

  return wd;
end;
$$;

grant execute on function public.bank_withdraw(numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- RECARGA DE CELULAR
-- ---------------------------------------------------------------------
create or replace function public.bank_topup(
  p_carrier text,
  p_phone text,
  p_amount numeric
)
returns public.bank_topups
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  tx  public.bank_transactions;
  tp  public.bank_topups;
  v_phone text;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'valor inválido'; end if;
  if p_amount > 200 then raise exception 'recarga acima do limite por operação'; end if;

  v_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(v_phone) not in (10, 11) then raise exception 'telefone inválido'; end if;
  if length(trim(coalesce(p_carrier, ''))) < 2 then raise exception 'operadora não informada'; end if;

  tx := public.bank_move('recarga',
    'Recarga ' || left(trim(p_carrier), 20) || ' · ••••' || right(v_phone, 4),
    -p_amount, trim(p_carrier), null);

  insert into public.bank_topups (user_id, carrier, phone, amount, transaction_id)
  values (uid, trim(p_carrier), v_phone, p_amount, tx.id)
  returning * into tp;

  perform public.bank_receipt_add(uid, tx.id, 'recarga', 'Comprovante de recarga',
    jsonb_build_object('amount', p_amount, 'carrier', p_carrier, 'phone', '••••' || right(v_phone, 4)));

  return tp;
end;
$$;

grant execute on function public.bank_topup(text, text, numeric) to authenticated;

-- ---------------------------------------------------------------------
-- PIX RECEBIDO — gerar cobrança com QR
-- ---------------------------------------------------------------------
create or replace function public.bank_create_pix_charge(
  p_amount numeric,
  p_description text default null
)
returns public.bank_pix_charges
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ch  public.bank_pix_charges;
  acct public.bank_accounts;
  v_emv text;
  v_nome text;
  v_cidade text := 'SAO PAULO';
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'valor inválido'; end if;

  select * into acct from public.bank_accounts where user_id = uid;
  if not found then raise exception 'conta não encontrada'; end if;

  select coalesce(full_name, 'RECEBEDOR') into v_nome from public.profiles where id = uid;

  -- payload EMV simplificado: identificador + valor + nome do recebedor
  --   lpad no Postgres só aceita text: todo length() precisa de ::text.
  v_emv := '00020126' ||
           lpad(length(coalesce(p_description, ''))::text, 2, '0') || coalesce(p_description, '') ||
           '5204000053039865802BR59' ||
           lpad(length(upper(left(v_nome, 25)))::text, 2, '0') || upper(left(v_nome, 25)) ||
           '60' || lpad(length(v_cidade)::text, 2, '0') || v_cidade ||
           '62' || lpad(length('BR.GOV.BCB.PIX' || acct.agency || acct.number)::text, 2, '0') ||
           'BR.GOV.BCB.PIX' || acct.agency || acct.number ||
           '54' || lpad(length(to_char(p_amount, 'FM999999990.00'))::text, 2, '0') || to_char(p_amount, 'FM999999990.00') ||
           '6304' || upper(substr(encode(extensions.digest(uid::text || p_amount::text || clock_timestamp()::text, 'sha256'), 'hex'), 1, 4));

  insert into public.bank_pix_charges (user_id, amount, description, emv)
  values (uid, p_amount, left(p_description, 140), v_emv)
  returning * into ch;

  return ch;
end;
$$;

grant execute on function public.bank_create_pix_charge(numeric, text) to authenticated;

create or replace function public.bank_cancel_pix_charge(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bank_pix_charges
     set status = 'cancelada'
   where id = p_id and user_id = auth.uid() and status = 'aberta';
end;
$$;

grant execute on function public.bank_cancel_pix_charge(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- AGENDAMENTO
-- ---------------------------------------------------------------------
create or replace function public.bank_schedule(
  p_kind text,
  p_target text,
  p_amount numeric,
  p_runs_on date,
  p_message text default null
)
returns public.bank_schedules
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  sc  public.bank_schedules;
  acct public.bank_accounts;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if p_kind not in ('pix','transferencia','boleto') then raise exception 'tipo de agendamento inválido'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'valor inválido'; end if;
  if length(trim(coalesce(p_target, ''))) < 4 then raise exception 'destino inválido'; end if;
  if p_runs_on is null then raise exception 'informe a data'; end if;
  if p_runs_on < current_date then raise exception 'a data não pode estar no passado'; end if;
  if p_runs_on > current_date + interval '365 days' then raise exception 'agendamento máximo de um ano'; end if;

  select * into acct from public.bank_accounts where user_id = uid;
  if not found then raise exception 'conta não encontrada'; end if;
  if acct.balance < p_amount then raise exception 'saldo insuficiente para agendar'; end if;

  insert into public.bank_schedules (user_id, kind, target, amount, message, runs_on)
  values (uid, p_kind, left(trim(p_target), 120), p_amount, left(p_message, 140), p_runs_on)
  returning * into sc;

  return sc;
end;
$$;

grant execute on function public.bank_schedule(text, text, numeric, date, text) to authenticated;

create or replace function public.bank_cancel_schedule(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bank_schedules
     set status = 'cancelado'
   where id = p_id and user_id = auth.uid() and status = 'agendado';
end;
$$;

grant execute on function public.bank_cancel_schedule(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- EXECUTA AGENDAMENTOS VENCIDOS
--   Idempotente: marca 'executado' antes de mover, então rodar duas vezes
--   no mesmo dia não debita em dobro. Chamado pelo backend.
-- ---------------------------------------------------------------------
create or replace function public.bank_run_schedules()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  sc  public.bank_schedules;
  tx  public.bank_transactions;
  n   int := 0;
  v_avail numeric;
begin
  for sc in
    select * from public.bank_schedules
     where status = 'agendado' and runs_on <= current_date
     order by runs_on asc
     for update skip locked
  loop
    begin
      select balance + overdraft into v_avail from public.bank_accounts where user_id = sc.user_id;
      if v_avail is null or v_avail < sc.amount then
        update public.bank_schedules set status = 'falhou' where id = sc.id;
        continue;
      end if;

      tx := public.bank_move_for(sc.user_id, 'agendamento',
        'Agendamento · ' || upper(sc.kind) || ' · ' || sc.target,
        -sc.amount, sc.target, sc.id::text);

      perform public.bank_receipt_add(sc.user_id, tx.id, 'agendamento',
        'Comprovante de agendamento',
        jsonb_build_object('amount', sc.amount, 'kind', sc.kind, 'target', sc.target, 'runs_on', sc.runs_on));

      update public.bank_schedules
         set status = 'executado', executed_at = now(), transaction_id = tx.id
       where id = sc.id;
      n := n + 1;
    exception when others then
      update public.bank_schedules set status = 'falhou' where id = sc.id;
    end;
  end loop;

  return n;
end;
$$;

revoke all on function public.bank_run_schedules() from public, anon, authenticated;
grant execute on function public.bank_run_schedules() to service_role;

-- ---------------------------------------------------------------------
-- DDA — consulta e pagamento
-- ---------------------------------------------------------------------
create or replace function public.bank_pay_dda(p_id uuid)
returns public.bank_boletos
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  d   public.bank_dda;
  bl  public.bank_boletos;
begin
  if uid is null then raise exception 'não autenticado'; end if;

  select * into d from public.bank_dda where id = p_id and user_id = uid;
  if not found then raise exception 'boleto não encontrado'; end if;
  if d.status <> 'aberto' then raise exception 'este boleto não está em aberto'; end if;

  bl := public.bank_pay_boleto(d.barcode, d.beneficiary, d.amount, d.due_date);

  update public.bank_dda set status = 'pago' where id = d.id;
  return bl;
end;
$$;

grant execute on function public.bank_pay_dda(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- BLOQUEIO / DESBLOQUEIO DO CARTÃO
-- ---------------------------------------------------------------------
create or replace function public.bank_set_card_status(p_status text)
returns public.bank_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  c   public.bank_cards;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if p_status not in ('ativo','bloqueado') then raise exception 'situação inválida'; end if;

  update public.bank_cards set status = p_status where user_id = uid
  returning * into c;

  if not found then raise exception 'cartão não encontrado'; end if;
  return c;
end;
$$;

grant execute on function public.bank_set_card_status(text) to authenticated;

-- ---------------------------------------------------------------------
-- DADOS CADASTRAIS
-- ---------------------------------------------------------------------
create or replace function public.bank_save_profile(
  p_address_line text,
  p_address_num  text,
  p_complement   text,
  p_district     text,
  p_city         text,
  p_state        text,
  p_zip          text,
  p_occupation   text,
  p_income       numeric
)
returns public.bank_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  bp  public.bank_profiles;
  v_zip text := regexp_replace(coalesce(p_zip, ''), '\D', '', 'g');
  v_uf  text := upper(trim(coalesce(p_state, '')));
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if length(trim(coalesce(p_address_line, ''))) < 3 then raise exception 'informe o endereço'; end if;
  if length(trim(coalesce(p_city, ''))) < 2 then raise exception 'informe a cidade'; end if;
  -- só as 27 unidades federativas reais; 'XX' tem o formato certo e não existe
  if v_uf <> all (array['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
                          'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']) then
    raise exception 'UF inválida';
  end if;
  if length(v_zip) <> 8 then raise exception 'CEP inválido'; end if;
  if p_income is not null and p_income < 0 then raise exception 'renda inválida'; end if;

  insert into public.bank_profiles (
    user_id, address_line, address_num, complement, district, city, state, zip, occupation, income, updated_at
  ) values (
    uid, left(trim(p_address_line), 120), left(trim(p_address_num), 10), left(trim(p_complement), 60),
    left(trim(p_district), 60), left(trim(p_city), 60), v_uf, v_zip,
    left(trim(p_occupation), 60), p_income, now()
  )
  on conflict (user_id) do update set
    address_line = excluded.address_line,
    address_num  = excluded.address_num,
    complement   = excluded.complement,
    district     = excluded.district,
    city         = excluded.city,
    state        = excluded.state,
    zip          = excluded.zip,
    occupation   = excluded.occupation,
    income       = excluded.income,
    updated_at   = now()
  returning * into bp;

  return bp;
end;
$$;

grant execute on function public.bank_save_profile(text, text, text, text, text, text, text, text, numeric) to authenticated;

-- ---------------------------------------------------------------------
-- LIMITES
-- ---------------------------------------------------------------------
create or replace function public.bank_set_limits(
  p_pix_per_tx       numeric,
  p_pix_per_day      numeric,
  p_transfer_per_tx  numeric,
  p_withdraw_per_day numeric
)
returns public.bank_limits
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  lim public.bank_limits;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if least(p_pix_per_tx, p_pix_per_day, p_transfer_per_tx, p_withdraw_per_day) < 0 then
    raise exception 'valor inválido';
  end if;
  -- teto do produto: não deixa o cliente se expor além do razoável
  if greatest(p_pix_per_tx, p_pix_per_day, p_transfer_per_tx, p_withdraw_per_day) > 100000 then
    raise exception 'limite acima do máximo permitido';
  end if;

  perform public.bank_ensure_limits(uid);

  update public.bank_limits set
    pix_per_tx = p_pix_per_tx,
    pix_per_day = p_pix_per_day,
    transfer_per_tx = p_transfer_per_tx,
    withdraw_per_day = p_withdraw_per_day,
    updated_at = now()
  where user_id = uid
  returning * into lim;

  return lim;
end;
$$;

grant execute on function public.bank_set_limits(numeric, numeric, numeric, numeric) to authenticated;

-- ---------------------------------------------------------------------
-- PIX e TRANSFERÊNCIA passam a respeitar os limites
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
  uid   uuid := auth.uid();
  lim   public.bank_limits;
  spent numeric;
  v_desc text;
  tx    public.bank_transactions;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'valor inválido'; end if;
  if p_amount > 50000 then raise exception 'valor acima do limite por operação'; end if;
  if length(trim(coalesce(p_key, ''))) < 5 then raise exception 'chave PIX inválida'; end if;

  lim := public.bank_ensure_limits(uid);
  if lim.pix_per_tx > 0 and p_amount > lim.pix_per_tx then
    raise exception 'valor acima do seu limite por PIX';
  end if;

  spent := public.bank_spent_today(uid, array['pix_envio']);
  if lim.pix_per_day > 0 and spent + p_amount > lim.pix_per_day then
    raise exception 'PIX acima do seu limite diário';
  end if;

  v_desc := 'PIX enviado';
  if p_message is not null and length(trim(p_message)) > 0 then
    v_desc := v_desc || ' · ' || left(trim(p_message), 80);
  end if;

  tx := public.bank_move('pix_envio', v_desc, -p_amount, p_key, null);

  perform public.bank_receipt_add(uid, tx.id, 'pix', 'Comprovante de PIX',
    jsonb_build_object('amount', p_amount, 'key', '••••' || right(trim(p_key), 4),
                       'message', nullif(trim(coalesce(p_message, '')), '')));

  return tx;
end;
$$;

grant execute on function public.bank_send_pix(text, numeric, text) to authenticated;

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
  uid    uuid := auth.uid();
  target public.bank_accounts;
  me     public.bank_accounts;
  lim    public.bank_limits;
  spent  numeric;
  v_desc text;
  tx     public.bank_transactions;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'valor inválido'; end if;

  lim := public.bank_ensure_limits(uid);
  if lim.transfer_per_tx > 0 and p_amount > lim.transfer_per_tx then
    raise exception 'valor acima do seu limite por transferência';
  end if;

  select * into me from public.bank_accounts where user_id = uid;
  if not found then raise exception 'conta não encontrada'; end if;

  select * into target from public.bank_accounts
   where agency = p_agency and number = p_number;

  if not found then raise exception 'conta de destino não encontrada'; end if;
  if target.user_id = uid then raise exception 'a conta de destino é a mesma da origem'; end if;
  if target.status <> 'ativa' then raise exception 'conta de destino não está ativa'; end if;

  v_desc := 'Transferência enviada · Ag ' || p_agency || ' Cc ' || p_number;
  if p_message is not null and length(trim(p_message)) > 0 then
    v_desc := v_desc || ' · ' || left(trim(p_message), 80);
  end if;

  tx := public.bank_move('transferencia_envio', v_desc, -p_amount,
                         'Ag ' || p_agency || ' Cc ' || p_number, null);

  update public.bank_accounts set balance = balance + p_amount where id = target.id;
  insert into public.bank_transactions (user_id, kind, description, amount, counterparty)
  values (target.user_id, 'transferencia_recebimento', 'Transferência recebida', p_amount,
          'Ag ' || me.agency || ' Cc ' || me.number);

  perform public.bank_receipt_add(uid, tx.id, 'transferencia', 'Comprovante de transferência',
    jsonb_build_object('amount', p_amount, 'agency', p_agency, 'number', p_number,
                       'message', nullif(trim(coalesce(p_message, '')), '')));

  return tx;
end;
$$;

grant execute on function public.bank_transfer(text, text, numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- LIMITES PADRÃO PARA CONTAS QUE JÁ EXISTEM
--   Só para titulares que ainda existem: contas órfãs (usuário removido)
--   não podem receber linha em bank_limits, que tem FK para auth.users.
-- ---------------------------------------------------------------------
insert into public.bank_limits (user_id)
select a.user_id
  from public.bank_accounts a
  join auth.users u on u.id = a.user_id
on conflict (user_id) do nothing;

-- Contas órfãs são lixo de teste: o titular não existe mais.
delete from public.bank_accounts a
 where not exists (select 1 from auth.users u where u.id = a.user_id);

-- ---------------------------------------------------------------------
-- NOVAS CONTAS JÁ NASCEM COM LIMITES
-- ---------------------------------------------------------------------
create or replace function public.bank_after_account_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.bank_ensure_limits(new.user_id);
  return new;
end;
$$;

drop trigger if exists bank_limits_on_account on public.bank_accounts;
create trigger bank_limits_on_account
  after insert on public.bank_accounts
  for each row execute function public.bank_after_account_insert();
