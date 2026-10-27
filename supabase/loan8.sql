-- =====================================================================
-- Taxa de confiança paga por PIX (gateway PagueCom) + bloqueio da conta
--
-- Substitui o fluxo do loan7.sql, em que a taxa era debitada do saldo e a
-- confirmação era um clique. Agora:
--
--   1. Ao liberar o pedido, o valor cai na conta e fica BLOQUEADO.
--   2. O cliente precisa pagar a taxa de confiança por PIX (PagueCom)
--      para destravar a conta bancária.
--   3. Enquanto a taxa estiver pendente, TODA saída da conta é recusada
--      no banco (bank_move/bank_move_for), além do bloqueio da interface.
--   4. O pagamento é confirmado pelo gateway (webhook e/ou consulta) e a
--      função loan_taxa_pagar() libera o saldo e abate a taxa na 1ª
--      parcela — a taxa é antecipação da parcela, não custo extra.
--
-- A taxa é uma fração da parcela (padrão 50%), configurável no painel
-- admin (app_settings.gateway.taxa_pct). O valor usado em cada pedido fica
-- gravado em loan_requests.taxa_adesao_pct.
--
-- Rode DEPOIS de loan7.sql.
-- =====================================================================

-- ------------------- 1. configuração do gateway ----------------------
-- Tabela sem policy para `authenticated`: só o service_role (servidor) lê
-- as credenciais. O painel admin usa as RPCs admin_gateway_* abaixo, que
-- devolvem a chave mascarada.
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.app_settings enable row level security;

revoke all on public.app_settings from public, anon, authenticated;
grant all on public.app_settings to service_role;

insert into public.app_settings (key, value)
values ('gateway', jsonb_build_object(
  'provider',       'paguecom',
  'environment',    'producao',
  'enabled',        false,
  'api_key',        '',
  'webhook_secret', '',
  'taxa_pct',       0.5,
  'webhook_token',  md5(random()::text || clock_timestamp()::text || 'paguecom')
))
on conflict (key) do nothing;

-- ------------------- 2. cobranças PIX da taxa ------------------------
create table if not exists public.loan_fee_charges (
  id                 uuid primary key default gen_random_uuid(),
  loan_id            uuid not null references public.loan_requests(id) on delete cascade,
  user_id            uuid not null references public.profiles(id) on delete cascade,
  provider           text not null default 'paguecom',
  provider_charge_id text,
  external_id        text not null unique,
  amount             numeric(14,2) not null check (amount > 0),
  amount_cents       integer not null check (amount_cents > 0),
  status             text not null default 'pending'
                       check (status in ('pending', 'paid', 'expired', 'failed', 'canceled')),
  copy_paste         text,
  qr_code            text,
  expires_at         timestamptz,
  paid_at            timestamptz,
  failure            text,
  raw                jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists loan_fee_charges_loan_idx
  on public.loan_fee_charges (loan_id, created_at desc);

-- Uma cobrança pendente por pedido: é o que garante que o cliente que fecha
-- a página e volta vê o MESMO QR code, e não um segundo PIX.
create unique index if not exists loan_fee_charges_um_pendente
  on public.loan_fee_charges (loan_id) where status = 'pending';

alter table public.loan_fee_charges enable row level security;

drop policy if exists "taxa: ler a própria" on public.loan_fee_charges;
create policy "taxa: ler a própria" on public.loan_fee_charges
  for select using (auth.uid() = user_id);

drop policy if exists "taxa: admin lê tudo" on public.loan_fee_charges;
create policy "taxa: admin lê tudo" on public.loan_fee_charges
  for select using (public.is_admin());

revoke insert, update, delete on public.loan_fee_charges from public, anon, authenticated;
grant select on public.loan_fee_charges to authenticated;

create or replace function public.tg_loan_fee_charges_updated()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists loan_fee_charges_updated on public.loan_fee_charges;
create trigger loan_fee_charges_updated
  before update on public.loan_fee_charges
  for each row execute function public.tg_loan_fee_charges_updated();

-- ------------------- 3. taxa pendente do cliente ---------------------
-- Usada pela interface para travar toda a área da conta bancária.
-- Devolve o pedido mais antigo com taxa pendente e a cobrança ativa (se
-- ainda estiver dentro da validade).
create or replace function public.loan_taxa_pendente()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  l    public.loan_requests;
  c    public.loan_fee_charges;
begin
  if uid is null then raise exception 'não autenticado'; end if;

  select * into l
    from public.loan_requests
   where user_id = uid
     and taxa_adesao_status = 'pendente'
     and taxa_adesao is not null
   order by created_at
   limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'pendente', false);
  end if;

  select * into c
    from public.loan_fee_charges
   where loan_id = l.id
     and status = 'pending'
     and expires_at > now()
   order by created_at desc
   limit 1;

  return jsonb_build_object(
    'ok',            true,
    'pendente',      true,
    'loan_id',       l.id,
    'parcela',       l.installment_value,
    'taxa',          l.taxa_adesao,
    'pct',           l.taxa_adesao_pct,
    'status',        l.taxa_adesao_status,
    'cobranca',      case when c.id is null then null else jsonb_build_object(
                       'id',          c.id,
                       'amount',      c.amount,
                       'status',      c.status,
                       'copy_paste',  c.copy_paste,
                       'qr_code',     c.qr_code,
                       'expires_at',  c.expires_at,
                       'created_at',  c.created_at
                     ) end
  );
end;
$$;

revoke all on function public.loan_taxa_pendente() from public, anon;
grant execute on function public.loan_taxa_pendente() to authenticated;

-- ------------------- 4. bank_move bloqueia a conta -------------------
-- Versão vigente: loan7.sql (KYC + saldo bloqueado). Acrescenta o gate da
-- taxa: nenhuma SAÍDA passa enquanto existir taxa de confiança pendente.
create or replace function public.bank_move(
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

  if public.bank_exige_kyc(p_kind, p_amount)
     and not public.kyc_pode_movimentar(uid) then
    raise exception 'verificação de identidade pendente: conclua sua verificação para movimentar a conta';
  end if;

  -- Conta travada até a taxa de confiança ser paga pelo PIX.
  if p_amount < 0 and exists (
    select 1 from public.loan_requests
     where user_id = uid
       and taxa_adesao_status = 'pendente'
       and taxa_adesao is not null
  ) then
    raise exception 'taxa de confiança pendente: pague a taxa para liberar a conta';
  end if;

  select * into acct from public.bank_accounts where user_id = uid for update;
  if not found then raise exception 'conta não encontrada'; end if;
  if acct.status <> 'ativa' then raise exception 'conta não está ativa'; end if;

  v_avail := acct.balance - acct.bloqueado + acct.overdraft;

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

-- ------------------- 5. bank_move_for idem ---------------------------
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

  if p_amount < 0 and exists (
    select 1 from public.loan_requests
     where user_id = p_user_id
       and taxa_adesao_status = 'pendente'
       and taxa_adesao is not null
  ) then
    raise exception 'taxa de confiança pendente: pague a taxa para liberar a conta';
  end if;

  select * into acct from public.bank_accounts where user_id = p_user_id for update;
  if not found then raise exception 'conta não encontrada'; end if;
  if acct.status <> 'ativa' then raise exception 'conta não está ativa'; end if;

  v_avail := acct.balance - acct.bloqueado + acct.overdraft;
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

revoke all on function public.bank_move_for(uuid, text, text, numeric, text, text) from public, anon, authenticated;
grant execute on function public.bank_move_for(uuid, text, text, numeric, text, text) to service_role;

-- ------------------- 6. liberação credita e bloqueia ----------------
-- Mantém a assinatura e a idempotência do loan7.sql. A fração da taxa vem
-- do painel (app_settings.gateway.taxa_pct), com 0.5 como padrão.
create or replace function public.bank_credit_loan(p_loan_id uuid)
returns public.bank_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  loan public.loan_requests;
  uid  uuid;
  tx   public.bank_transactions;
  v_pct numeric := 0.5;
  v_taxa numeric(14,2);
begin
  select * into loan from public.loan_requests where id = p_loan_id for update;
  if not found then raise exception 'pedido não encontrado'; end if;
  if loan.status <> 'liberado' then raise exception 'pedido não está liberado'; end if;

  uid := loan.user_id;
  if uid <> auth.uid() and not public.is_admin() then raise exception 'não autorizado'; end if;

  begin
    v_pct := coalesce(
      (select (value->>'taxa_pct')::numeric from public.app_settings where key = 'gateway'),
      0.5
    );
  exception when others then
    v_pct := 0.5;
  end;
  if v_pct <= 0 or v_pct > 1 then v_pct := 0.5; end if;

  select * into tx from public.bank_transactions
   where user_id = uid and kind = 'credito_emprestimo' and document_id = p_loan_id::text
   order by created_at asc
   limit 1;

  if not found then
    tx := public.bank_move_for(uid, 'credito_emprestimo',
      'Crédito de empréstimo liberado', loan.amount, 'SobreImpréstimos', p_loan_id::text);
  end if;

  if loan.taxa_adesao is null and loan.installment_value is not null then
    v_taxa := round(loan.installment_value * v_pct, 2);

    update public.loan_requests
       set taxa_adesao          = v_taxa,
           taxa_adesao_pct      = v_pct,
           taxa_adesao_status   = 'pendente'
     where id = p_loan_id;

    -- O valor liberado fica bloqueado até o PIX da taxa ser confirmado.
    update public.bank_accounts
       set bloqueado = bloqueado + loan.amount
     where user_id = uid;
  end if;

  perform public.loan_gerar_parcelas(p_loan_id);

  return tx;
end;
$$;

revoke all on function public.bank_credit_loan(uuid) from public, anon;
grant execute on function public.bank_credit_loan(uuid) to authenticated;

-- ------------------- 7. pagamento confirmado -------------------------
-- Chamada SOMENTE pelo servidor (service_role), depois de o gateway
-- confirmar o pagamento (webhook ou consulta). Idempotente: repetir não
-- libera nem abate duas vezes.
create or replace function public.loan_taxa_pagar(
  p_charge_id uuid,
  p_paid_at   timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c    public.loan_fee_charges;
  l    public.loan_requests;
  acct public.bank_accounts;
  v_taxa numeric(14,2);
  v_parcela uuid;
begin
  select * into c from public.loan_fee_charges where id = p_charge_id for update;
  if not found then raise exception 'cobrança não encontrada'; end if;

  if c.status = 'paid' then
    return jsonb_build_object('ok', true, 'ja_pago', true, 'loan_id', c.loan_id);
  end if;

  select * into l from public.loan_requests where id = c.loan_id for update;
  if not found then raise exception 'pedido não encontrado'; end if;
  if l.taxa_adesao is null then raise exception 'este pedido não tem taxa de confiança'; end if;
  if l.taxa_adesao_status = 'aplicada' then
    update public.loan_fee_charges
       set status = 'paid', paid_at = coalesce(paid_at, p_paid_at)
     where id = c.id;
    return jsonb_build_object('ok', true, 'ja_pago', true, 'loan_id', l.id, 'taxa', l.taxa_adesao);
  end if;
  if l.taxa_adesao_status = 'cancelada' then raise exception 'taxa cancelada'; end if;

  v_taxa := l.taxa_adesao;

  select * into acct from public.bank_accounts where user_id = l.user_id for update;
  if not found then raise exception 'conta não encontrada'; end if;

  -- Abate na primeira parcela ainda em aberto. Sem parcela em aberto não
  -- há como abater; nesse caso a taxa não é aplicada e o pagamento fica
  -- registrado para conferência manual.
  select id into v_parcela
    from public.loan_installments
   where loan_id = l.id
     and status in ('aberta', 'atrasada')
   order by numero
   limit 1;

  update public.loan_fee_charges
     set status = 'paid', paid_at = coalesce(paid_at, p_paid_at)
   where id = c.id;

  if v_parcela is not null then
    update public.loan_installments
       set valor = greatest(round(valor - v_taxa, 2), 0.01),
           updated_at = now()
     where id = v_parcela;
  end if;

  -- Libera o valor do empréstimo que estava bloqueado.
  update public.bank_accounts
     set bloqueado = greatest(bloqueado - l.amount, 0)
   where id = acct.id
  returning * into acct;

  update public.loan_requests
     set taxa_adesao_status      = 'aplicada',
         taxa_adesao_aplicada_em = coalesce(taxa_adesao_aplicada_em, p_paid_at),
         taxa_adesao_ciente_em   = coalesce(taxa_adesao_ciente_em, p_paid_at)
   where id = l.id;

  return jsonb_build_object(
    'ok',         true,
    'ja_pago',    false,
    'loan_id',    l.id,
    'taxa',       v_taxa,
    'abatida',    v_parcela is not null,
    'disponivel', acct.balance - acct.bloqueado + acct.overdraft
  );
end;
$$;

revoke all on function public.loan_taxa_pagar(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.loan_taxa_pagar(uuid, timestamptz) to service_role;

-- ------------------- 8. caminho antigo desativado --------------------
-- O fluxo do loan7 (debitar a taxa do próprio saldo) não vale mais. A
-- função fica no banco apenas para não quebrar chamadas antigas; agora
-- ela recusa e orienta o pagamento pelo PIX.
create or replace function public.loan_taxa_aplicar(p_loan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'a taxa de confiança deve ser paga pelo PIX; o saldo é liberado automaticamente após a confirmação';
end;
$$;

revoke all on function public.loan_taxa_aplicar(uuid) from public, anon, authenticated;
grant execute on function public.loan_taxa_aplicar(uuid) to service_role;

-- ------------------- 9. leitura da taxa (contrato) -------------------
create or replace function public.loan_taxa_adesao(p_loan_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  l public.loan_requests;
  acct public.bank_accounts;
  c public.loan_fee_charges;
begin
  if uid is null then raise exception 'não autenticado'; end if;

  select * into l from public.loan_requests where id = p_loan_id;
  if not found then raise exception 'pedido não encontrado'; end if;
  if l.user_id <> uid and not public.is_admin() then raise exception 'acesso restrito'; end if;

  select * into acct from public.bank_accounts where user_id = l.user_id;

  select * into c from public.loan_fee_charges
   where loan_id = l.id and status = 'pending' and expires_at > now()
   order by created_at desc limit 1;

  return jsonb_build_object(
    'ok',            true,
    'loan_id',       l.id,
    'status',        l.status,
    'parcela_valor', l.installment_value,
    'taxa',          l.taxa_adesao,
    'pct',           l.taxa_adesao_pct,
    'taxa_status',   l.taxa_adesao_status,
    'ciente_em',     l.taxa_adesao_ciente_em,
    'aplicada_em',   l.taxa_adesao_aplicada_em,
    'bloqueado',     coalesce(acct.bloqueado, 0),
    'disponivel',    coalesce(acct.balance - acct.bloqueado + acct.overdraft, 0),
    'cobranca',      case when c.id is null then null else to_jsonb(c) end
  );
end;
$$;

revoke all on function public.loan_taxa_adesao(uuid) from public, anon;
grant execute on function public.loan_taxa_adesao(uuid) to authenticated;

-- ------------------- 10. painel: configuração do gateway -------------
create or replace function public.admin_gateway_config_get()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
  k text;
begin
  if not public.is_admin() then raise exception 'acesso restrito'; end if;

  select value into v from public.app_settings where key = 'gateway';
  v := coalesce(v, '{}'::jsonb);
  k := coalesce(v->>'api_key', '');

  return jsonb_build_object(
    'provider',       coalesce(v->>'provider', 'paguecom'),
    'environment',    coalesce(v->>'environment', 'producao'),
    'enabled',        coalesce((v->>'enabled')::boolean, false),
    'taxa_pct',       coalesce((v->>'taxa_pct')::numeric, 0.5),
    'webhook_token',  coalesce(v->>'webhook_token', ''),
    'tem_chave',      length(k) > 0,
    'chave_final',    case when length(k) >= 4 then right(k, 4) else '' end,
    'tem_segredo',    length(coalesce(v->>'webhook_secret', '')) > 0,
    'updated_at',     (select updated_at from public.app_settings where key = 'gateway')
  );
end;
$$;

revoke all on function public.admin_gateway_config_get() from public, anon;
grant execute on function public.admin_gateway_config_get() to authenticated;

create or replace function public.admin_gateway_config_set(
  p_api_key        text default null,
  p_webhook_secret text default null,
  p_environment    text default 'producao',
  p_enabled        boolean default false,
  p_taxa_pct       numeric default 0.5
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.is_admin() then raise exception 'acesso restrito'; end if;
  if p_environment not in ('producao', 'sandbox') then
    raise exception 'ambiente inválido';
  end if;
  if p_taxa_pct is null or p_taxa_pct <= 0 or p_taxa_pct > 1 then
    raise exception 'percentual da taxa deve ficar entre 0 e 1 (0,5 = 50%%)';
  end if;

  select value into v from public.app_settings where key = 'gateway';
  v := coalesce(v, '{}'::jsonb);
  v := jsonb_set(v, '{environment}', to_jsonb(p_environment), true);
  v := jsonb_set(v, '{enabled}', to_jsonb(p_enabled), true);
  v := jsonb_set(v, '{taxa_pct}', to_jsonb(p_taxa_pct), true);
  v := jsonb_set(v, '{provider}', to_jsonb('paguecom'::text), true);

  -- Chave em branco significa "manter a atual": o painel nunca recebe a
  -- chave inteira de volta, então não pode reenviá-la.
  if p_api_key is not null and length(btrim(p_api_key)) > 0 then
    v := jsonb_set(v, '{api_key}', to_jsonb(btrim(p_api_key)), true);
  end if;
  if p_webhook_secret is not null and length(btrim(p_webhook_secret)) > 0 then
    v := jsonb_set(v, '{webhook_secret}', to_jsonb(btrim(p_webhook_secret)), true);
  end if;

  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('gateway', v, now(), auth.uid())
  on conflict (key) do update
    set value = excluded.value,
        updated_at = now(),
        updated_by = excluded.updated_by;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_gateway_config_set(text, text, text, boolean, numeric) from public, anon;
grant execute on function public.admin_gateway_config_set(text, text, text, boolean, numeric) to authenticated;

-- ------------------- 11. contrato soma as parcelas reais ------------
create or replace function public.loan_contrato(p_loan_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  l public.loan_requests;
  parcelas jsonb;
  total_pago numeric;
  total_contrato numeric;
  saldo numeric;
  pagas int;
  abertas int;
  atrasadas int;
  proxima date;
begin
  if uid is null then raise exception 'não autenticado'; end if;

  select * into l from public.loan_requests where id = p_loan_id;
  if not found then raise exception 'pedido não encontrado'; end if;
  if l.user_id <> uid and not public.is_admin() then raise exception 'acesso restrito'; end if;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.numero), '[]'::jsonb)
    into parcelas
    from public.loan_installments p where p.loan_id = p_loan_id;

  select
    coalesce(sum(valor), 0),
    coalesce(sum(valor) filter (where status = 'paga'), 0),
    count(*) filter (where status = 'paga'),
    count(*) filter (where status in ('aberta', 'atrasada')),
    count(*) filter (where status = 'atrasada' or (status = 'aberta' and vencimento < current_date)),
    min(vencimento) filter (where status in ('aberta', 'atrasada'))
  into total_contrato, total_pago, pagas, abertas, atrasadas, proxima
  from public.loan_installments where loan_id = p_loan_id;

  if total_contrato = 0 then
    total_contrato := coalesce(l.installment_value, 0) * l.installments;
  end if;

  saldo := total_contrato - total_pago;

  return jsonb_build_object(
    'pedido', to_jsonb(l),
    'parcelas', parcelas,
    'total_pago', total_pago,
    'total_contrato', total_contrato,
    'saldo_devedor', greatest(saldo, 0),
    'pagas', pagas,
    'abertas', abertas,
    'atrasadas', atrasadas,
    'proximo_vencimento', proxima
  );
end;
$$;

revoke all on function public.loan_contrato(uuid) from public, anon;
grant execute on function public.loan_contrato(uuid) to authenticated;
