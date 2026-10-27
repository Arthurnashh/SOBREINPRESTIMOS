-- =====================================================================
-- Parcelas do empréstimo
--
-- Três partes:
--
-- 1. O pedido passa a registrar a periodicidade (semanal / quinzenal /
--    mensal), escolhida pelo cliente junto com valor e prazo.
--
-- 2. A tabela `loan_installments` guarda uma linha por parcela: número,
--    vencimento, valor, status e o que já foi pago.
--
-- 3. `bank_credit_loan` passa a GERAR o cronograma no momento da liberação.
--    Antes ela só creditava o valor na conta; agora, na mesma transação,
--    cria as parcelas. Assim não existe empréstimo liberado sem cronograma.
--
-- O boleto/PIX de cada parcela é registrado em `bank_boletos` (tabela que já
-- existe) via `loan_installment_charge`, com o campo de gateway marcado como
-- pendente até a integração real ser configurada.
-- =====================================================================

-- ------------------- 1. periodicidade no pedido ----------------------
alter table public.loan_requests
  add column if not exists periodicidade text not null default 'mensal';

alter table public.loan_requests
  drop constraint if exists loan_requests_periodicidade_check;

alter table public.loan_requests
  add constraint loan_requests_periodicidade_check
  check (periodicidade in ('semanal', 'quinzenal', 'mensal'));

-- A taxa do período fica gravada no pedido, para o contrato não depender de
-- recálculo futuro (a taxa mensal pode mudar depois).
alter table public.loan_requests
  add column if not exists taxa_periodo numeric;

-- --------------------- 2. tabela de parcelas -------------------------
create table if not exists public.loan_installments (
  id uuid primary key default extensions.gen_random_uuid(),
  loan_id uuid not null references public.loan_requests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  numero int not null,
  vencimento date not null,
  valor numeric(14,2) not null check (valor > 0),
  status text not null default 'aberta'
    check (status in ('aberta', 'paga', 'atrasada', 'cancelada')),
  pago_em timestamptz,
  pago_valor numeric(14,2),
  -- Referência ao boleto/PIX gerado para esta parcela, quando houver.
  charge_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (loan_id, numero)
);

create index if not exists loan_installments_user_idx
  on public.loan_installments (user_id, vencimento);
create index if not exists loan_installments_loan_idx
  on public.loan_installments (loan_id, numero);
-- Consultas de inadimplência: parcelas abertas já vencidas.
create index if not exists loan_installments_abertas_idx
  on public.loan_installments (vencimento) where status in ('aberta', 'atrasada');

alter table public.loan_installments enable row level security;

-- O cliente lê as próprias parcelas. Não há policy de escrita: quem grava é
-- a função de liberação e, no futuro, a conciliação do gateway — ambas
-- SECURITY DEFINER.
drop policy if exists "parcela: ler as pr\u00f3prias" on public.loan_installments;
drop policy if exists "parcela: ler as proprias" on public.loan_installments;
create policy "parcela: ler as proprias"
  on public.loan_installments for select
  using (auth.uid() = user_id or public.is_admin());

revoke insert, update, delete on public.loan_installments from anon, authenticated;

-- ------------------- 3. geração no momento da liberação --------------
create or replace function public.loan_gerar_parcelas(p_loan_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.loan_requests;
  base timestamptz;
  dias int;
  i int;
  valor numeric(14,2);
  criadas int := 0;
begin
  select * into l from public.loan_requests where id = p_loan_id;
  if not found then raise exception 'pedido não encontrado'; end if;

  if l.status <> 'liberado' then
    raise exception 'Só é possível gerar parcelas de um pedido liberado';
  end if;
  if l.installment_value is null then
    raise exception 'O pedido não tem valor de parcela definido';
  end if;

  -- Idempotente: liberar duas vezes não duplica o cronograma.
  if exists (select 1 from public.loan_installments where loan_id = p_loan_id) then
    select count(*) into criadas from public.loan_installments where loan_id = p_loan_id;
    return criadas;
  end if;

  dias := case coalesce(l.periodicidade, 'mensal')
            when 'semanal' then 7
            when 'quinzenal' then 15
            else 30
          end;

  base := coalesce(l.updated_at, now());
  valor := round(l.installment_value, 2);

  for i in 1..l.installments loop
    insert into public.loan_installments (loan_id, user_id, numero, vencimento, valor)
    values (
      p_loan_id,
      l.user_id,
      i,
      (base + (dias * i) * interval '1 day')::date,
      valor
    );
    criadas := criadas + 1;
  end loop;

  return criadas;
end;
$$;

revoke all on function public.loan_gerar_parcelas(uuid) from public, anon;
-- Só o servidor chama (service_role). O cliente não gera as próprias parcelas.
grant execute on function public.loan_gerar_parcelas(uuid) to service_role;

-- --------- 4. bank_credit_loan gera o cronograma ao creditar ---------
-- Redefine a função existente ACRESCENTANDO a geração das parcelas. O corpo
-- original é preservado: mesma assinatura (retorna bank_transactions), mesma
-- idempotência por `document_id`, mesmo uso de bank_move_for — assim o app
-- que já chama esta função continua funcionando sem alteração.
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
begin
  select * into loan from public.loan_requests where id = p_loan_id;
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

  -- Gera o cronograma na MESMA transação: se falhar, o crédito é desfeito
  -- junto, e não fica empréstimo liberado sem parcelas para cobrar.
  -- A função é idempotente por conta própria.
  perform public.loan_gerar_parcelas(p_loan_id);

  return tx;
end;
$$;

-- ------------- 5. gerar boleto/PIX de uma parcela --------------------
-- `bank_boletos` não tinha como representar o estado da cobrança: só guardava
-- o código de barras e a data de pagamento. Acrescentamos as colunas que
-- faltavam, em vez de inventar outra tabela.
alter table public.bank_boletos
  add column if not exists status text not null default 'aberto',
  add column if not exists gateway text not null default 'pendente',
  add column if not exists nosso_numero text,
  add column if not exists installment_id uuid references public.loan_installments(id) on delete set null;

alter table public.bank_boletos
  drop constraint if exists bank_boletos_status_check;

alter table public.bank_boletos
  add constraint bank_boletos_status_check
  check (status in ('aberto', 'pago', 'cancelado', 'vencido'));

-- `pendente` = ainda sem integração real; `simulado` = gerado sem gateway
-- contratado; os demais valores entram quando houver provedor.
alter table public.bank_boletos
  drop constraint if exists bank_boletos_gateway_check;

alter table public.bank_boletos
  add constraint bank_boletos_gateway_check
  check (gateway in ('pendente', 'simulado', 'asaas', 'efi', 'bb', 'itau', 'bradesco', 'mercadopago'));

create index if not exists bank_boletos_installment_idx
  on public.bank_boletos (installment_id);

create or replace function public.loan_installment_charge(p_installment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  par public.loan_installments;
  boleto public.bank_boletos;
  linha text;
  nosso text;
begin
  if uid is null then raise exception 'não autenticado'; end if;

  select * into par from public.loan_installments where id = p_installment_id;
  if not found then raise exception 'parcela não encontrada'; end if;
  if par.user_id <> uid and not public.is_admin() then raise exception 'acesso restrito'; end if;
  if par.status = 'paga' then raise exception 'Esta parcela já está paga'; end if;
  if par.status = 'cancelada' then raise exception 'Esta parcela está cancelada'; end if;

  -- Reaproveita a cobrança já gerada para não emitir duas.
  if par.charge_id is not null then
    select * into boleto from public.bank_boletos where id = par.charge_id;
    if found then
      return jsonb_build_object(
        'ok', true, 'charge_id', boleto.id, 'linha_digitavel', boleto.barcode,
        'valor', boleto.amount, 'vencimento', boleto.due_date,
        'gateway', boleto.gateway, 'nosso_numero', boleto.nosso_numero
      );
    end if;
  end if;

  -- Nosso número estável por parcela: LOAN-<8 primeiros do id da parcela>.
  nosso := 'LOAN-' || upper(substr(replace(par.id::text, '-', ''), 1, 8));

  -- Linha digitável de 47 dígitos. É determinística e serve de referência
  -- visual; NÃO é um boleto registrado em banco até o gateway entrar.
  linha := '34191'
           || lpad((extract(epoch from par.vencimento)::bigint % 100000)::text, 5, '0')
           || lpad(((par.valor * 100)::bigint)::text, 10, '0')
           || lpad((abs(hashtext(par.id::text)) % 100000000)::text, 8, '0')
           || lpad((abs(hashtext(nosso))::bigint % 10000000000000)::text, 14, '0');

  insert into public.bank_boletos
    (user_id, amount, due_date, barcode, beneficiary, status, gateway, nosso_numero, installment_id)
  values (
    uid, par.valor, par.vencimento, substr(linha, 1, 47),
    'SobreImpréstimos', 'aberto', 'pendente', nosso, par.id
  )
  returning * into boleto;

  update public.loan_installments
     set charge_id = boleto.id, updated_at = now()
   where id = par.id;

  -- bank_receipts usa `title` e `payload`, não `description`/`metadata`.
  insert into public.bank_receipts (user_id, kind, title, payload)
  values (
    uid,
    'boleto',
    'Parcela ' || par.numero || ' — aguardando confirmação de pagamento',
    jsonb_build_object(
      'installment_id', par.id, 'loan_id', par.loan_id,
      'gateway', 'pendente', 'linha_digitavel', boleto.barcode, 'valor', par.valor
    )
  );

  return jsonb_build_object(
    'ok', true, 'charge_id', boleto.id, 'linha_digitavel', boleto.barcode,
    'valor', boleto.amount, 'vencimento', boleto.due_date,
    'gateway', boleto.gateway, 'nosso_numero', boleto.nosso_numero
  );
end;
$$;

revoke all on function public.loan_installment_charge(uuid) from public, anon;
grant execute on function public.loan_installment_charge(uuid) to authenticated;

-- ------------- 6. resumo do contrato para o cliente ------------------
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
    coalesce(sum(valor) filter (where status = 'paga'), 0),
    count(*) filter (where status = 'paga'),
    count(*) filter (where status in ('aberta', 'atrasada')),
    count(*) filter (where status = 'atrasada' or (status = 'aberta' and vencimento < current_date)),
    min(vencimento) filter (where status in ('aberta', 'atrasada'))
  into total_pago, pagas, abertas, atrasadas, proxima
  from public.loan_installments where loan_id = p_loan_id;

  saldo := coalesce(l.installment_value, 0) * l.installments - total_pago;

  return jsonb_build_object(
    'pedido', to_jsonb(l),
    'parcelas', parcelas,
    'total_pago', total_pago,
    'total_contrato', coalesce(l.installment_value, 0) * l.installments,
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
