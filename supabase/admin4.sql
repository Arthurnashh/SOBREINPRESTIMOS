-- =====================================================================
--  admin4.sql — desativar e excluir conta
-- =====================================================================
--
--  Duas ações distintas, de propósito:
--
--    DESATIVAR  encerra a conta e suspende o acesso. O cliente continua
--               autenticado e vê o aviso de conta suspensa. NADA é apagado,
--               então é reversível — é a alternativa branda ao excluir.
--
--    EXCLUIR    apaga o usuário de auth.users. Todas as FKs do schema são
--               ON DELETE CASCADE, então some tudo junto: conta, cartão,
--               chaves PIX, extrato, KYC (documentos e selfies), pedidos,
--               parcelas e cobranças. Irreversível.
--
--  Rode depois de: schema.sql, bank.sql, bank2.sql, kyc.sql, admin.sql,
--  admin2.sql, loan3..loan8.sql.
--
--  Como o CASCADE leva junto as linhas de admin_auditoria com alvo_id
--  apontando para o usuário (a coluna é ON DELETE SET NULL), o snapshot dos
--  dados vai gravado em `detalhe` ANTES do delete. Assim a trilha sobrevive
--  legível mesmo depois de a conta deixar de existir.
-- =====================================================================

-- ------------------- 1. estado de suspensão da conta ------------------
-- Reaproveita `bank_accounts.status`, que já aceita 'encerrada' no check.
-- Não inventa tabela nem coluna nova.

create or replace function public.admin_desativar_conta(
  p_user_id uuid,
  p_motivo text,
  p_reativar boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  antes    text;
  novo     text;
  saldo    numeric;
  tem_card text;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if not public.is_admin() then raise exception 'acesso restrito'; end if;
  if p_motivo is null or length(btrim(p_motivo)) < 5 then
    raise exception 'Informe o motivo (mínimo 5 caracteres)';
  end if;

  -- Um admin não desativa a si mesmo: evita ficar trancado fora do painel.
  if p_user_id = uid then
    raise exception 'Você não pode desativar a própria conta';
  end if;

  -- Nem a outro admin: sem isso, um admin desativado perde o painel e
  -- ninguém consegue reverter pelo próprio sistema.
  if exists (select 1 from public.profiles where id = p_user_id and is_admin) then
    raise exception 'Não é possível desativar uma conta de administrador';
  end if;

  select status, balance into antes, saldo
    from public.bank_accounts where user_id = p_user_id;

  -- Quem nunca abriu conta bancária também pode ser suspenso: o perfil basta.
  if not found then
    if not exists (select 1 from public.profiles where id = p_user_id) then
      raise exception 'conta não encontrada';
    end if;
    antes := null;
  end if;

  if p_reativar then
    if antes = 'ativa' then
      return jsonb_build_object('ok', true, 'status', 'ativa', 'ja_estava', true);
    end if;
    novo := 'ativa';
  else
    if antes = 'encerrada' then
      return jsonb_build_object('ok', true, 'status', 'encerrada', 'ja_estava', true);
    end if;
    novo := 'encerrada';
  end if;

  if antes is not null then
    update public.bank_accounts set status = novo where user_id = p_user_id;
  end if;

  -- Cartão acompanha a conta: cancelado ao desativar, ativo ao reativar.
  -- Cartão já cancelado antes não é ressuscitado por esta via.
  select status into tem_card from public.bank_cards where user_id = p_user_id;
  if found and tem_card <> 'cancelado' then
    update public.bank_cards
       set status = case when p_reativar then 'ativo' else 'cancelado' end
     where user_id = p_user_id;
  end if;

  insert into public.admin_auditoria (admin_id, alvo_id, acao, detalhe, motivo)
  values (
    uid, p_user_id,
    case when p_reativar then 'conta_reativada' else 'conta_desativada' end,
    jsonb_build_object(
      'status_antes',  antes,
      'status_depois', novo,
      'saldo',         coalesce(saldo, 0)
    ),
    btrim(p_motivo)
  );

  return jsonb_build_object('ok', true, 'status', novo, 'saldo', coalesce(saldo, 0));
end;
$$;

revoke all on function public.admin_desativar_conta(uuid, text, boolean) from public, anon;
grant execute on function public.admin_desativar_conta(uuid, text, boolean) to authenticated;


-- ---------------------- 2. prévia antes de excluir ---------------------
-- Mostra o que será perdido, para o admin confirmar com número na mão em vez
-- de um "tem certeza?" genérico.

create or replace function public.admin_previa_exclusao(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  perfil record;
  conta  record;
  loans  int;
  ativos int;
  kyc    int;
  taxas  int;
  tx     int;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if not public.is_admin() then raise exception 'acesso restrito'; end if;

  select id, full_name, cpf, is_admin into perfil
    from public.profiles where id = p_user_id;
  if not found then raise exception 'conta não encontrada'; end if;

  select status, balance, bloqueado into conta
    from public.bank_accounts where user_id = p_user_id;

  select count(*) into loans  from public.loan_requests    where user_id = p_user_id;
  select count(*) into ativos from public.loan_requests    where user_id = p_user_id
                                 and status in ('em_analise', 'aprovado', 'liberado');
  select count(*) into kyc    from public.kyc_submissions  where user_id = p_user_id;
  select count(*) into taxas  from public.loan_fee_charges where user_id = p_user_id and status = 'paid';
  select count(*) into tx     from public.bank_transactions where user_id = p_user_id;

  return jsonb_build_object(
    'ok',               true,
    'nome',             perfil.full_name,
    'cpf',              perfil.cpf,
    'eh_admin',         coalesce(perfil.is_admin, false),
    'conta_status',     conta.status,
    'saldo',            coalesce(conta.balance, 0),
    'bloqueado',        coalesce(conta.bloqueado, 0),
    'emprestimos',      loans,
    'emprestimos_ativos', ativos,
    'kyc',              kyc,
    'taxas_pagas',      taxas,
    'transacoes',       tx,
    -- O que impede a exclusão direta. Vazio = pode excluir.
    -- Valores formatados com ::text e vírgula trocada à mão: to_char com
    -- máscara G/D depende do lc_numeric do servidor e quebrava aqui.
    'impedimentos',     to_jsonb(array_remove(array[
      case when coalesce(perfil.is_admin, false)
           then 'É uma conta de administrador' end,
      case when coalesce(conta.balance, 0) <> 0
           then 'Tem saldo de R$ ' || replace(coalesce(conta.balance, 0)::text, '.', ',') end,
      case when coalesce(conta.bloqueado, 0) <> 0
           then 'Tem valor bloqueado de R$ ' || replace(coalesce(conta.bloqueado, 0)::text, '.', ',') end,
      case when ativos > 0
           then 'Tem ' || ativos || ' empréstimo(s) em andamento' end,
      case when taxas > 0
           then 'Tem ' || taxas || ' taxa(s) de confiança paga(s) — guarde o comprovante' end
    ], null))
  );
end;
$$;

revoke all on function public.admin_previa_exclusao(uuid) from public, anon;
grant execute on function public.admin_previa_exclusao(uuid) to authenticated;


-- ------------------------ 3. excluir a conta --------------------------
-- Apaga o usuário. O CASCADE limpa as 20 tabelas filhas.
--
-- `p_forcar` libera a exclusão quando há saldo ou empréstimo em andamento.
-- O padrão é recusar: apagar um CPF com dinheiro dentro não tem volta, e o
-- erro explica o que travar antes.

create or replace function public.admin_excluir_conta(
  p_user_id uuid,
  p_motivo text,
  p_forcar boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  perfil   record;
  conta    record;
  ativos   int;
  taxas    int;
  loans    int;
  kyc      int;
  tx       int;
  snapshot jsonb;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if not public.is_admin() then raise exception 'acesso restrito'; end if;

  -- Exclusão é mais grave que bloqueio: exigimos motivo mais longo.
  if p_motivo is null or length(btrim(p_motivo)) < 10 then
    raise exception 'Informe o motivo (mínimo 10 caracteres)';
  end if;

  if p_user_id = uid then raise exception 'Você não pode excluir a própria conta'; end if;

  select id, full_name, cpf, phone, is_admin into perfil
    from public.profiles where id = p_user_id;
  if not found then raise exception 'conta não encontrada'; end if;

  if coalesce(perfil.is_admin, false) then
    raise exception 'Não é possível excluir uma conta de administrador';
  end if;

  select status, balance, bloqueado into conta
    from public.bank_accounts where user_id = p_user_id;

  select count(*) into loans from public.loan_requests where user_id = p_user_id;
  select count(*) into ativos from public.loan_requests where user_id = p_user_id
                               and status in ('em_analise', 'aprovado', 'liberado');
  select count(*) into kyc   from public.kyc_submissions  where user_id = p_user_id;
  select count(*) into taxas from public.loan_fee_charges where user_id = p_user_id and status = 'paid';
  select count(*) into tx    from public.bank_transactions where user_id = p_user_id;

  if not p_forcar then
    if coalesce(conta.balance, 0) <> 0 then
      raise exception 'A conta tem saldo. Zere o saldo antes de excluir, ou confirme a exclusão forçada.';
    end if;
    if ativos > 0 then
      raise exception 'Há empréstimo em andamento. Cancele ou conclua antes de excluir.';
    end if;
  end if;

  -- Snapshot ANTES do delete. É o que sobrevive ao CASCADE: depois, alvo_id
  -- vira null e o nome/CPF não existem mais em lugar nenhum.
  snapshot := jsonb_build_object(
    'nome',               perfil.full_name,
    'cpf',                perfil.cpf,
    'telefone',           perfil.phone,
    'conta_status',       conta.status,
    'saldo',              coalesce(conta.balance, 0),
    'bloqueado',          coalesce(conta.bloqueado, 0),
    'emprestimos',        loans,
    'emprestimos_ativos', ativos,
    'kyc_enviados',       kyc,
    'taxas_pagas',        taxas,
    'transacoes',         tx,
    'forcado',            p_forcar,
    'excluido_em',        now()
  );

  insert into public.admin_auditoria (admin_id, alvo_id, acao, detalhe, motivo)
  values (uid, p_user_id, 'conta_excluida', snapshot, btrim(p_motivo));

  -- A exclusão de auth.users dispara o CASCADE em public.profiles e em todas
  -- as tabelas com user_id. É o único delete necessário.
  delete from auth.users where id = p_user_id;

  if not found then
    raise exception 'Usuário não encontrado em auth.users';
  end if;

  return jsonb_build_object('ok', true, 'excluido', true, 'detalhe', snapshot);
end;
$$;

revoke all on function public.admin_excluir_conta(uuid, text, boolean) from public, anon;
grant execute on function public.admin_excluir_conta(uuid, text, boolean) to authenticated;


-- ------------- 4. estado da conta para a tela do cliente --------------
-- Usada pelo layout da conta para decidir entre o aviso de suspensão e o
-- conteúdo normal. SECURITY DEFINER não é preciso aqui (a RLS de
-- bank_accounts já limita ao dono), mas mantemos o padrão das demais.

create or replace function public.minha_conta_estado()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  st  text;
  sal numeric;
  blo numeric;
begin
  if uid is null then raise exception 'não autenticado'; end if;

  select status, balance, bloqueado into st, sal, blo
    from public.bank_accounts where user_id = uid;

  if not found then
    return jsonb_build_object('ok', true, 'existe', false, 'status', null);
  end if;

  return jsonb_build_object(
    'ok',        true,
    'existe',    true,
    'status',    st,
    'suspensa',  st = 'encerrada',
    'saldo',     coalesce(sal, 0),
    'bloqueado', coalesce(blo, 0)
  );
end;
$$;

revoke all on function public.minha_conta_estado() from public, anon;
grant execute on function public.minha_conta_estado() to authenticated;
