-- =====================================================================
-- Taxa de confiança (adesão) na liberação do empréstimo
--
-- Regra do produto:
--   1. Ao liberar o pedido, o valor integral cai na conta do cliente, mas
--      o saldo fica BLOQUEADO — ele vê o dinheiro e não consegue movimentar.
--   2. A taxa de confiança é uma fração do valor da parcela (50% por
--      padrão). Ex.: parcela de R$ 100,00 -> taxa de R$ 50,00.
--   3. O cliente confirma a taxa na tela. A taxa é debitada do valor que
--      estava bloqueado, o restante é liberado e o valor da taxa é abatido
--      na PRIMEIRA parcela — ou seja, ela já vem descontada no 1º mês.
--
-- Resultado financeiro: cliente recebe (valor - taxa) e paga
-- (nº de parcelas * parcela - taxa). O custo do crédito não muda; a taxa
-- é uma antecipação da 1ª parcela, não uma cobrança extra.
--
-- A fração padrão (0.5) precisa ficar igual a LOAN.taxaAdesaoPct em
-- lib/config.ts. A coluna `taxa_adesao_pct` grava o valor usado em cada
-- pedido, então mudar a constante depois NÃO altera pedidos antigos.
--
-- Rode DEPOIS de loan5.sql e loan6.sql.
-- =====================================================================

-- ------------------- 1. saldo bloqueado na conta ---------------------
-- `bloqueado` é a parte do saldo que o cliente enxerga mas não pode usar.
-- disponível = balance - bloqueado + overdraft (ver bank_move).
alter table public.bank_accounts
  add column if not exists bloqueado numeric(14,2) not null default 0;

alter table public.bank_accounts
  drop constraint if exists bank_accounts_bloqueado_check;

alter table public.bank_accounts
  add constraint bank_accounts_bloqueado_check check (bloqueado >= 0);

-- ------------------- 2. taxa gravada no pedido -----------------------
-- Nullable de propósito: pedidos anteriores a esta migração não têm taxa e
-- não devem ser cobrados retroativamente.
alter table public.loan_requests
  add column if not exists taxa_adesao numeric(14,2),
  add column if not exists taxa_adesao_pct numeric(6,4),
  add column if not exists taxa_adesao_status text,
  add column if not exists taxa_adesao_ciente_em timestamptz,
  add column if not exists taxa_adesao_aplicada_em timestamptz;

alter table public.loan_requests
  drop constraint if exists loan_requests_taxa_adesao_status_check;

alter table public.loan_requests
  add constraint loan_requests_taxa_adesao_status_check
  check (taxa_adesao_status is null or taxa_adesao_status in ('pendente', 'aplicada', 'cancelada'));

-- ------------------- 3. bank_move respeita o bloqueio ----------------
-- Versão vigente: kyc.sql (todos os tipos + gate de verificação de
-- identidade). Só muda o cálculo de `v_avail`, que agora desconta o
-- bloqueio. O gate do KYC é preservado — sem ele qualquer cliente sem
-- verificação voltaria a movimentar.
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

  -- Verificação de identidade antes de deixar o dinheiro sair.
  if public.bank_exige_kyc(p_kind, p_amount)
     and not public.kyc_pode_movimentar(uid) then
    raise exception 'verificação de identidade pendente: conclua sua verificação para movimentar a conta';
  end if;

  select * into acct from public.bank_accounts where user_id = uid for update;
  if not found then raise exception 'conta não encontrada'; end if;
  if acct.status <> 'ativa' then raise exception 'conta não está ativa'; end if;

  -- O bloqueio da taxa de confiança não entra no disponível.
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

-- ------------------- 4. bank_move_for idem ---------------------------
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

-- ------------------- 5. resumo com bloqueio --------------------------
create or replace function public.bank_summary()
returns json
language sql
security definer
stable
set search_path = public
as $$
  select json_build_object(
    'balance',      coalesce((select balance   from public.bank_accounts where user_id = auth.uid()), 0),
    'blocked',      coalesce((select bloqueado from public.bank_accounts where user_id = auth.uid()), 0),
    'overdraft',    coalesce((select overdraft from public.bank_accounts where user_id = auth.uid()), 0),
    'available',    coalesce((select balance - bloqueado + overdraft
                                from public.bank_accounts where user_id = auth.uid()), 0),
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

-- ------------------- 6. liberação credita e bloqueia ----------------
-- Mesma assinatura e mesma idempotência de loan5.sql. Acrescenta:
--   * cálculo da taxa (fração da parcela);
--   * bloqueio do valor integral na conta do titular.
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
  v_pct numeric := 0.5;   -- fração da parcela: manter igual a LOAN.taxaAdesaoPct
  v_taxa numeric(14,2);
begin
  select * into loan from public.loan_requests where id = p_loan_id for update;
  if not found then raise exception 'pedido não encontrado'; end if;
  if loan.status <> 'liberado' then raise exception 'pedido não está liberado'; end if;

  uid := loan.user_id;
  if uid <> auth.uid() and not public.is_admin() then raise exception 'não autorizado'; end if;

  -- idempotente: não credita duas vezes o mesmo pedido
  select * into tx from public.bank_transactions
   where user_id = uid and kind = 'credito_emprestimo' and document_id = p_loan_id::text
   order by created_at asc
   limit 1;

  if not found then
    -- o credito entra sempre na conta do titular do pedido, nao na de quem chamou
    tx := public.bank_move_for(uid, 'credito_emprestimo',
      'Crédito de empréstimo liberado', loan.amount, 'SobreImpréstimos', p_loan_id::text);
  end if;

  -- Taxa de confiança: só é criada uma vez, na primeira liberação.
  -- Se o pedido não tem parcela definida, não há base de cálculo e a taxa
  -- fica nula — sem bloqueio, sem cobrança.
  if loan.taxa_adesao is null and loan.installment_value is not null then
    v_taxa := round(loan.installment_value * v_pct, 2);

    update public.loan_requests
       set taxa_adesao          = v_taxa,
           taxa_adesao_pct      = v_pct,
           taxa_adesao_status   = 'pendente'
     where id = p_loan_id;

    -- Bloqueia o valor integral liberado. O cliente vê o saldo, mas
    -- bank_move não deixa movimentar enquanto o bloqueio existir.
    update public.bank_accounts
       set bloqueado = bloqueado + loan.amount
     where user_id = uid;
  end if;

  -- Gera o cronograma na MESMA transação: se falhar, o crédito e o bloqueio
  -- são desfeitos juntos.
  perform public.loan_gerar_parcelas(p_loan_id);

  return tx;
end;
$$;

revoke all on function public.bank_credit_loan(uuid) from public, anon;
grant execute on function public.bank_credit_loan(uuid) to authenticated;

-- ------------------- 7. leitura da taxa para a tela ------------------
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
begin
  if uid is null then raise exception 'não autenticado'; end if;

  select * into l from public.loan_requests where id = p_loan_id;
  if not found then raise exception 'pedido não encontrado'; end if;
  if l.user_id <> uid and not public.is_admin() then raise exception 'acesso restrito'; end if;

  select * into acct from public.bank_accounts where user_id = l.user_id;

  return jsonb_build_object(
    'ok',              true,
    'loan_id',         l.id,
    'status',          l.status,
    'parcela_valor',   l.installment_value,
    'taxa',            l.taxa_adesao,
    'pct',             l.taxa_adesao_pct,
    'taxa_status',     l.taxa_adesao_status,
    'ciente_em',       l.taxa_adesao_ciente_em,
    'aplicada_em',     l.taxa_adesao_aplicada_em,
    'bloqueado',       coalesce(acct.bloqueado, 0),
    'disponivel',      coalesce(acct.balance - acct.bloqueado + acct.overdraft, 0)
  );
end;
$$;

revoke all on function public.loan_taxa_adesao(uuid) from public, anon;
grant execute on function public.loan_taxa_adesao(uuid) to authenticated;

-- ------------------- 8. cliente confirma que leu ---------------------
-- Não move dinheiro. Só registra o "ciente" para o aviso não reabrir a
-- cada carregamento. O saldo continua bloqueado até loan_taxa_aplicar.
create or replace function public.loan_taxa_confirmar(p_loan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  l public.loan_requests;
begin
  if uid is null then raise exception 'não autenticado'; end if;

  select * into l from public.loan_requests where id = p_loan_id for update;
  if not found then raise exception 'pedido não encontrado'; end if;
  if l.user_id <> uid and not public.is_admin() then raise exception 'acesso restrito'; end if;
  if l.taxa_adesao is null then raise exception 'este pedido não tem taxa de confiança'; end if;
  if l.status <> 'liberado' then raise exception 'pedido não está liberado'; end if;

  if l.taxa_adesao_ciente_em is null then
    update public.loan_requests
       set taxa_adesao_ciente_em = now()
     where id = p_loan_id
    returning * into l;
  end if;

  return jsonb_build_object('ok', true, 'ciente_em', l.taxa_adesao_ciente_em);
end;
$$;

revoke all on function public.loan_taxa_confirmar(uuid) from public, anon;
grant execute on function public.loan_taxa_confirmar(uuid) to authenticated;

-- ------------------- 9. aplica a taxa e libera o saldo ---------------
-- Sequência atômica:
--   * debita a taxa do saldo;
--   * libera o bloqueio do valor do pedido;
--   * registra a saída no extrato (tarifa);
--   * abate a taxa na primeira parcela;
--   * marca a taxa como aplicada.
--
-- A ordem importa: o débito acontece antes de liberar o bloqueio, então
-- nunca existe uma janela em que o cliente possa gastar o valor da taxa.
create or replace function public.loan_taxa_aplicar(p_loan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  l public.loan_requests;
  acct public.bank_accounts;
  v_taxa numeric(14,2);
  v_parcela_1 uuid;
begin
  if uid is null then raise exception 'não autenticado'; end if;

  select * into l from public.loan_requests where id = p_loan_id for update;
  if not found then raise exception 'pedido não encontrado'; end if;
  if l.user_id <> uid and not public.is_admin() then raise exception 'acesso restrito'; end if;
  if l.status <> 'liberado' then raise exception 'pedido não está liberado'; end if;
  if l.taxa_adesao is null then raise exception 'este pedido não tem taxa de confiança'; end if;
  if l.taxa_adesao_status = 'cancelada' then raise exception 'taxa cancelada'; end if;

  -- Idempotência: chamar de novo devolve o estado, sem debitar outra vez.
  if l.taxa_adesao_status = 'aplicada' then
    return jsonb_build_object('ok', true, 'ja_aplicada', true, 'taxa', l.taxa_adesao);
  end if;

  v_taxa := l.taxa_adesao;

  select * into acct from public.bank_accounts where user_id = l.user_id for update;
  if not found then raise exception 'conta não encontrada'; end if;
  if acct.balance < v_taxa then raise exception 'saldo insuficiente'; end if;

  -- A taxa é antecipação da próxima parcela em aberto. Sem parcela aberta
  -- não existe abatimento, e cobrar seria custo extra — então não cobra.
  select id into v_parcela_1
    from public.loan_installments
   where loan_id = p_loan_id
     and status in ('aberta', 'atrasada')
   order by numero
   limit 1;

  if v_parcela_1 is null then
    raise exception 'não há parcela em aberto para abater a taxa';
  end if;

  -- 1. debita a taxa
  update public.bank_accounts
     set balance = balance - v_taxa
   where id = acct.id;

  -- 2. libera o bloqueio referente a este pedido
  update public.bank_accounts
     set bloqueado = greatest(bloqueado - l.amount, 0)
   where id = acct.id;

  -- 3. lança a saída no extrato
  insert into public.bank_transactions
    (user_id, kind, description, amount, counterparty, document_id)
  values (
    l.user_id, 'tarifa', 'Taxa de confiança — abatida na 1ª parcela',
    -v_taxa, 'SobreImpréstimos', p_loan_id::text
  );

  -- 4. abate na primeira parcela em aberto (o valor é antecipação, não custo)
  update public.loan_installments
     set valor = greatest(round(valor - v_taxa, 2), 0.01),
         updated_at = now()
   where id = v_parcela_1;

  -- 5. marca como aplicada
  update public.loan_requests
     set taxa_adesao_status      = 'aplicada',
         taxa_adesao_aplicada_em = now(),
         taxa_adesao_ciente_em   = coalesce(taxa_adesao_ciente_em, now())
   where id = p_loan_id
  returning * into l;

  return jsonb_build_object(
    'ok', true,
    'ja_aplicada', false,
    'taxa', v_taxa,
    'disponivel', acct.balance - v_taxa - greatest(acct.bloqueado - l.amount, 0) + acct.overdraft
  );
end;
$$;

revoke all on function public.loan_taxa_aplicar(uuid) from public, anon;
grant execute on function public.loan_taxa_aplicar(uuid) to authenticated;

-- ------------------- 10. contrato soma as parcelas reais ------------
-- Antes o total era `parcela * nº`. Com o abatimento da taxa na 1ª
-- parcela, o valor real do contrato passa a ser a soma das parcelas.
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

  -- Fallback para pedido liberado antes do cronograma existir.
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
