-- =====================================================================
--  TRIAGEM AUTOMÁTICA DO KYC POR IA
-- =====================================================================
--
--  O que este arquivo faz:
--
--    * cria a tabela `kyc_triagem`, que guarda o que a IA decidiu
--    * cria `kyc_registrar_triagem()`, chamada pela aplicação depois de
--      analisar os documentos
--    * acrescenta a coluna `triagem_ia` em `kyc_submissions`, para a ficha
--      do admin mostrar o resultado sem consulta extra
--
--  Por que uma tabela e não só a nota do KYC:
--
--    A nota (`review_note`) é texto livre e o admin pode sobrescrevê-la ao
--    decidir. A triagem precisa sobreviver a isso: é o registro de que a IA
--    aprovou sozinha, com qual confiança e por quê. Se der problema depois,
--    é aqui que se apura.
--
--  Por que a função NÃO decide nada:
--
--    A decisão é tomada em lib/kyc/ia.ts, que é testado sem rede. Aqui só
--    se grava. Deixar regra de crédito em plpgsql seria mais difícil de
--    testar e de auditar.
-- =====================================================================

-- ---------------------------- tabela ---------------------------------
create table if not exists public.kyc_triagem (
  id             bigserial primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  decisao        text not null check (decisao in ('aprovar', 'revisar', 'recusar')),
  confianca      numeric(4, 3) not null default 0 check (confianca between 0 and 1),
  motivos        text[] not null default '{}',
  alertas        text[] not null default '{}',
  nao_verificado text[] not null default '{}',
  created_at     timestamptz not null default now()
);

create index if not exists kyc_triagem_user_idx on public.kyc_triagem (user_id, created_at desc);

alter table public.kyc_triagem enable row level security;

-- O cliente vê a própria triagem (transparência: ele pode contestar), o admin
-- vê todas. Ninguém escreve direto: só pela função abaixo.
drop policy if exists "triagem: dono ou admin lê" on public.kyc_triagem;
create policy "triagem: dono ou admin lê" on public.kyc_triagem
  for select using (auth.uid() = user_id or public.is_admin());

revoke insert, update, delete on public.kyc_triagem from anon, authenticated;

-- ------------------- coluna de apoio na submissão ---------------------
-- Guarda o resumo da última triagem para a ficha não precisar de join.
alter table public.kyc_submissions
  add column if not exists triagem_ia jsonb;

-- --------------------------- registrar -------------------------------
create or replace function public.kyc_registrar_triagem(
  p_user_id        uuid,
  p_decisao        text,
  p_confianca      numeric,
  p_motivos        text[],
  p_alertas        text[],
  p_nao_verificado text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  -- `bigint`, não `bigserial`: bigserial é pseudo-tipo de COLUNA (cria
  -- sequence), e usá-lo em variável de plpgsql faz o CREATE FUNCTION falhar
  -- com 400 sem mensagem pela API de gerenciamento.
  nova_id bigint;
begin
  if uid is null then raise exception 'não autenticado'; end if;

  -- Quem grava é o dono da verificação (no envio automático) ou um admin
  -- (na reanálise pelo painel).
  if auth.uid() <> p_user_id and not public.is_admin() then
    raise exception 'acesso restrito';
  end if;

  if p_decisao not in ('aprovar', 'revisar', 'recusar') then
    raise exception 'decisão inválida: %', p_decisao;
  end if;

  if p_confianca is null or p_confianca < 0 or p_confianca > 1 then
    raise exception 'confiança fora da faixa';
  end if;

  insert into public.kyc_triagem (user_id, decisao, confianca, motivos, alertas, nao_verificado)
  values (
    p_user_id,
    p_decisao,
    round(p_confianca, 3),
    coalesce(p_motivos, '{}'),
    coalesce(p_alertas, '{}'),
    coalesce(p_nao_verificado, '{}')
  )
  returning id into nova_id;

  -- Resumo para a ficha.
  update public.kyc_submissions
     set triagem_ia = jsonb_build_object(
           'decisao',        p_decisao,
           'confianca',      round(p_confianca, 3),
           'motivos',        to_jsonb(coalesce(p_motivos, '{}')),
           'alertas',        to_jsonb(coalesce(p_alertas, '{}')),
           'nao_verificado', to_jsonb(coalesce(p_nao_verificado, '{}')),
           'em',             now()
         ),
         updated_at = now()
   where user_id = p_user_id;

  -- Trilha de auditoria: a IA é um "ator" do sistema, então fica registrada
  -- junto com as ações humanas. `admin_id` recebe o próprio uid (o dono no
  -- envio automático), e o detalhe diz que foi automático.
  insert into public.admin_auditoria (admin_id, alvo_id, acao, detalhe, motivo)
  values (
    uid,
    p_user_id,
    'kyc_triagem_ia',
    jsonb_build_object(
      'decisao',        p_decisao,
      'confianca',      round(p_confianca, 3),
      'alertas',        to_jsonb(coalesce(p_alertas, '{}')),
      'nao_verificado', to_jsonb(coalesce(p_nao_verificado, '{}')),
      'automatico',     uid = p_user_id
    ),
    left(array_to_string(coalesce(p_motivos, '{}'), ' '), 500)
  );

  return jsonb_build_object('ok', true, 'id', nova_id);
end;
$$;

-- ---------------------------- permissões ------------------------------
revoke all on function public.kyc_registrar_triagem(uuid, text, numeric, text[], text[], text[])
  from public, anon;

grant execute on function public.kyc_registrar_triagem(uuid, text, numeric, text[], text[], text[])
  to authenticated;
