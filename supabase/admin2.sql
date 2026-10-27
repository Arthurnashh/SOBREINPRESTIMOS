-- =====================================================================
-- Painel administrativo — visão total das contas
--
-- O que este arquivo entrega:
--   1. admin_listar_contas()  — todas as contas, com ou sem KYC
--   2. admin_ficha_conta()    — tudo de uma conta: dados, KYC com as fotos,
--                               saldo, cartão, extrato, PIX, limites e empréstimos
--   3. admin_ajustar_saldo()  — crédito/débito manual, com motivo obrigatório
--   4. admin_bloquear_conta() — bloquear/desbloquear movimentação
--   5. admin_auditoria       — registro de quem fez o quê, quando e por quê
--
-- Regras de segurança:
--   * Todas são SECURITY DEFINER e conferem is_admin() na primeira linha.
--   * Nenhuma delas confia em RLS para escopar conta alheia (o admin lê tudo
--     de propósito), então cada uma filtra explicitamente por p_user_id.
--   * Escrita exige motivo: fica na trilha de auditoria.
-- =====================================================================

-- ---------------------------- auditoria ------------------------------
create table if not exists public.admin_auditoria (
  id          bigserial primary key,
  admin_id    uuid not null references auth.users (id) on delete cascade,
  alvo_id     uuid references auth.users (id) on delete set null,
  acao        text not null,
  detalhe     jsonb not null default '{}'::jsonb,
  motivo      text,
  created_at  timestamptz not null default now()
);

create index if not exists admin_auditoria_alvo_idx on public.admin_auditoria (alvo_id, created_at desc);
create index if not exists admin_auditoria_admin_idx on public.admin_auditoria (admin_id, created_at desc);

alter table public.admin_auditoria enable row level security;

-- Só o admin lê a trilha; ninguém escreve direto (só pelas funções abaixo).
drop policy if exists "auditoria: admin lê" on public.admin_auditoria;
create policy "auditoria: admin lê" on public.admin_auditoria
  for select using (public.is_admin());

revoke insert, update, delete on public.admin_auditoria from anon, authenticated;

-- ---------------------- bloqueio de conta ----------------------------
-- `status` já existe em bank_accounts; a trilha guarda o porquê.
create or replace function public.admin_bloquear_conta(
  p_user_id uuid,
  p_bloquear boolean,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  novo text := case when p_bloquear then 'bloqueada' else 'ativa' end;
  antes text;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if not public.is_admin() then raise exception 'acesso restrito'; end if;
  if p_motivo is null or length(btrim(p_motivo)) < 5 then
    raise exception 'Informe o motivo (mínimo 5 caracteres)';
  end if;
  if p_user_id = uid then raise exception 'Você não pode bloquear a própria conta'; end if;

  select status into antes from public.bank_accounts where user_id = p_user_id;
  if not found then raise exception 'conta não encontrada'; end if;

  update public.bank_accounts
     set status = novo
   where user_id = p_user_id;

  insert into public.admin_auditoria (admin_id, alvo_id, acao, detalhe, motivo)
  values (uid, p_user_id, case when p_bloquear then 'conta_bloqueada' else 'conta_desbloqueada' end,
          jsonb_build_object('antes', antes, 'depois', novo), btrim(p_motivo));

  return jsonb_build_object('ok', true, 'status', novo);
end;
$$;

-- ------------------------- ajuste de saldo ---------------------------
-- Crédito/débito manual na conta. Usa bank_move_for para manter o extrato
-- consistente: toda alteração de saldo precisa virar lançamento.
create or replace function public.admin_ajustar_saldo(
  p_user_id uuid,
  p_valor numeric,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  saldo_antes numeric;
  saldo_depois numeric;
  tx public.bank_transactions;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if not public.is_admin() then raise exception 'acesso restrito'; end if;
  if p_motivo is null or length(btrim(p_motivo)) < 5 then
    raise exception 'Informe o motivo (mínimo 5 caracteres)';
  end if;
  if p_valor is null or p_valor = 0 then
    raise exception 'Informe um valor diferente de zero';
  end if;
  if abs(p_valor) > 1000000 then
    raise exception 'Valor acima do limite de segurança (R$ 1.000.000)';
  end if;
  if p_user_id = uid then raise exception 'Use a própria conta para operar o seu saldo'; end if;

  select balance into saldo_antes from public.bank_accounts where user_id = p_user_id;
  if not found then raise exception 'conta não encontrada'; end if;

  -- Lançamento no extrato do cliente, para o saldo nunca mudar "sozinho".
  -- `kind` tem lista fechada (constraint), então usamos rótulos existentes:
  -- estorno para entrada, tarifa para saída. A descrição diz que foi ajuste.
  insert into public.bank_transactions (user_id, kind, description, amount, counterparty)
  values (
    p_user_id,
    case when p_valor > 0 then 'estorno' else 'tarifa' end,
    case when p_valor > 0 then 'Ajuste administrativo (crédito)' else 'Ajuste administrativo (débito)' end,
    abs(p_valor),
    null
  )
  returning * into tx;

  update public.bank_accounts
     set balance = balance + p_valor
   where user_id = p_user_id
  returning balance into saldo_depois;

  insert into public.admin_auditoria (admin_id, alvo_id, acao, detalhe, motivo)
  values (uid, p_user_id, case when p_valor > 0 then 'credito_manual' else 'debito_manual' end,
          jsonb_build_object(
            'valor', p_valor,
            'saldo_antes', saldo_antes,
            'saldo_depois', saldo_depois,
            'transacao_id', tx.id
          ), btrim(p_motivo));

  return jsonb_build_object('ok', true, 'saldo', saldo_depois, 'transacao_id', tx.id);
end;
$$;

-- ------------------------- bloqueio de cartão ------------------------
create or replace function public.admin_bloquear_cartao(
  p_user_id uuid,
  p_bloquear boolean,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  novo text := case when p_bloquear then 'bloqueado' else 'ativo' end;
  antes text;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if not public.is_admin() then raise exception 'acesso restrito'; end if;
  if p_motivo is null or length(btrim(p_motivo)) < 5 then
    raise exception 'Informe o motivo (mínimo 5 caracteres)';
  end if;
  if p_user_id = uid then raise exception 'Você não pode bloquear o próprio cartão por aqui'; end if;

  select status into antes from public.bank_cards where user_id = p_user_id;
  if not found then raise exception 'cartão não encontrado'; end if;
  -- Cartão cancelado não volta a ativo por esta via.
  if antes = 'cancelado' then raise exception 'Cartão cancelado não pode ser reativado'; end if;

  update public.bank_cards set status = novo where user_id = p_user_id;

  insert into public.admin_auditoria (admin_id, alvo_id, acao, detalhe, motivo)
  values (uid, p_user_id, case when p_bloquear then 'cartao_bloqueado' else 'cartao_desbloqueado' end,
          jsonb_build_object('antes', antes, 'depois', novo), btrim(p_motivo));

  return jsonb_build_object('ok', true, 'status', novo);
end;
$$;

-- ------------------------ listar as contas ---------------------------
-- Traz TODAS as contas, tenham enviado KYC ou não.
create or replace function public.admin_listar_contas(
  p_busca text default null,
  p_limite int default 100,
  p_offset int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  termo text := nullif(btrim(coalesce(p_busca, '')), '');
  digitos text;
  limite int := least(greatest(coalesce(p_limite, 100), 1), 500);
  desloc int := greatest(coalesce(p_offset, 0), 0);
  itens jsonb;
  total int;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if not public.is_admin() then raise exception 'acesso restrito'; end if;

  digitos := regexp_replace(coalesce(termo, ''), '\D', '', 'g');

  with base as (
    select
      p.id,
      p.full_name,
      p.cpf,
      p.phone,
      p.is_admin,
      p.created_at,
      a.id            as conta_id,
      a.agency,
      a.number,
      a.check_digit,
      a.balance,
      a.overdraft,
      a.status        as conta_status,
      c.last4         as cartao_last4,
      c.status        as cartao_status,
      coalesce(k.status, 'nao_iniciado') as kyc_status,
      (select count(*) from public.bank_transactions t where t.user_id = p.id) as lancamentos,
      (select count(*) from public.loan_requests l where l.user_id = p.id)     as pedidos
    from public.profiles p
    left join public.bank_accounts a  on a.user_id = p.id
    left join public.bank_cards    c  on c.user_id = p.id
    left join public.kyc_submissions k on k.user_id = p.id
    where termo is null
       or p.full_name ilike '%' || replace(replace(termo, '%', ''), '_', '') || '%'
       or (digitos <> '' and (p.cpf like '%' || digitos || '%' or coalesce(p.phone,'') like '%' || digitos || '%'))
  )
  select
    coalesce(jsonb_agg(to_jsonb(b) order by b.created_at desc, b.id), '[]'::jsonb),
    count(*)
  into itens, total
  from (
    select * from base order by created_at desc, id limit limite offset desloc
  ) b;

  return jsonb_build_object('total', total, 'itens', itens);
end;
$$;

-- ------------------------- ficha da conta ----------------------------
-- Tudo de uma conta, em uma chamada.
create or replace function public.admin_ficha_conta(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  perfil public.profiles;
  conta  public.bank_accounts;
  cartao public.bank_cards;
  kyc    public.kyc_submissions;
  bp     public.bank_profiles;
  lim    public.bank_limits;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if not public.is_admin() then raise exception 'acesso restrito'; end if;

  select * into perfil from public.profiles where id = p_user_id;
  if not found then raise exception 'usuário não encontrado'; end if;

  select * into conta  from public.bank_accounts  where user_id = p_user_id;
  select * into cartao from public.bank_cards     where user_id = p_user_id;
  select * into kyc    from public.kyc_submissions where user_id = p_user_id;
  select * into bp     from public.bank_profiles  where user_id = p_user_id;
  select * into lim    from public.bank_limits    where user_id = p_user_id;

  return jsonb_build_object(
    'perfil', jsonb_build_object(
      'id', perfil.id, 'full_name', perfil.full_name, 'cpf', perfil.cpf,
      'phone', perfil.phone, 'is_admin', perfil.is_admin, 'created_at', perfil.created_at
    ),
    'conta', case when conta.id is null then null else jsonb_build_object(
      'id', conta.id, 'agency', conta.agency, 'number', conta.number,
      'check_digit', conta.check_digit, 'balance', conta.balance,
      'overdraft', conta.overdraft, 'status', conta.status, 'opened_at', conta.opened_at
    ) end,
    'cartao', case when cartao.id is null then null else jsonb_build_object(
      'last4', cartao.last4, 'brand', cartao.brand, 'holder', cartao.holder,
      'expiry_month', cartao.expiry_month, 'expiry_year', cartao.expiry_year,
      'status', cartao.status, 'created_at', cartao.created_at
    ) end,
    -- Dados bancários declarados (endereço, ocupação, renda).
    'dados_bancarios', case when bp.user_id is null then null else to_jsonb(bp) end,
    -- Limites de movimentação.
    'limites', case when lim.user_id is null then null else to_jsonb(lim) end,
    -- KYC: dados completos + caminhos das 9 fotos (5 ângulos + documentos).
    'kyc', case when kyc.user_id is null then null else jsonb_build_object(
      'status', kyc.status,
      'full_name', kyc.full_name, 'cpf', kyc.cpf, 'birth_date', kyc.birth_date,
      'phone', kyc.phone, 'email', kyc.email, 'mother_name', kyc.mother_name,
      'cep', kyc.cep, 'address', kyc.address, 'address_number', kyc.address_number,
      'address_extra', kyc.address_extra, 'neighborhood', kyc.neighborhood,
      'city', kyc.city, 'state', kyc.state,
      'doc_type', kyc.doc_type, 'doc_number', kyc.doc_number,
      'doc_issuer', kyc.doc_issuer, 'doc_state', kyc.doc_state,
      'proof_type', kyc.proof_type,
      'liveness_passed', kyc.liveness_passed,
      'liveness_score', kyc.liveness_score,
      'quality_score', kyc.quality_score,
      'submitted_at', kyc.submitted_at, 'reviewed_at', kyc.reviewed_at,
      'review_note', kyc.review_note,
      'paths', jsonb_build_object(
        'doc_frente',    kyc.doc_front_path,
        'doc_verso',     kyc.doc_back_path,
        'comprovante',   kyc.proof_path,
        'selfie_doc',    kyc.selfie_doc_path,
        'face_frontal',  kyc.face_front_path,
        'face_direita',  kyc.face_right_path,
        'face_esquerda', kyc.face_left_path,
        'face_sorriso',  kyc.face_smile_path,
        'face_perto',    kyc.face_near_path
      )
    ) end,
    'extrato', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.created_at desc)
      from (select * from public.bank_transactions where user_id = p_user_id
            order by created_at desc limit 200) t
    ), '[]'::jsonb),
    'pix', coalesce((
      select jsonb_agg(to_jsonb(k) order by k.created_at)
      from public.bank_pix_keys k where k.user_id = p_user_id
    ), '[]'::jsonb),
    'depositos', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.created_at desc)
      from (select * from public.bank_deposits where user_id = p_user_id
            order by created_at desc limit 50) d
    ), '[]'::jsonb),
    'saques', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at desc)
      from (select * from public.bank_withdrawals where user_id = p_user_id
            order by created_at desc limit 50) s
    ), '[]'::jsonb),
    'emprestimos', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.created_at desc)
      from public.loan_requests l where l.user_id = p_user_id
    ), '[]'::jsonb),
    'auditoria', coalesce((
      select jsonb_agg(to_jsonb(au) order by au.created_at desc)
      from (select * from public.admin_auditoria where alvo_id = p_user_id
            order by created_at desc limit 50) au
    ), '[]'::jsonb)
  );
end;
$$;

-- ------------------------- permissões ---------------------------------
-- Somente usuários autenticados podem chamar; a checagem de admin é interna.
revoke all on function public.admin_listar_contas(text, int, int) from public, anon;
revoke all on function public.admin_ficha_conta(uuid)               from public, anon;
revoke all on function public.admin_ajustar_saldo(uuid, numeric, text) from public, anon;
revoke all on function public.admin_bloquear_conta(uuid, boolean, text) from public, anon;
revoke all on function public.admin_bloquear_cartao(uuid, boolean, text) from public, anon;

grant execute on function public.admin_listar_contas(text, int, int) to authenticated;
grant execute on function public.admin_ficha_conta(uuid)               to authenticated;
grant execute on function public.admin_ajustar_saldo(uuid, numeric, text) to authenticated;
grant execute on function public.admin_bloquear_conta(uuid, boolean, text) to authenticated;
grant execute on function public.admin_bloquear_cartao(uuid, boolean, text) to authenticated;
