-- =====================================================================
-- KYC — CONHECIMENTO DO CLIENTE
--
--   Cadastro em três etapas, no padrão de banco digital:
--     1. dados pessoais (nome completo, CPF, celular, e-mail)
--     2. documentos  — CNH (frente e verso) OU RG (frente e verso),
--                      comprovante de endereço e selfie segurando o documento
--     3. biometria   — 5 ângulos do rosto com prova de vida por movimento
--
--   Enquanto a análise não aprova, a conta abre e o cliente vê o saldo,
--   mas NÃO movimenta nem pede empréstimo.
--
--   Arquivos ficam num bucket PRIVADO. O cliente só acessa os próprios;
--   o admin acessa todos para analisar. Nada é público.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. BUCKET PRIVADO
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kyc', 'kyc', false,
  10485760,  -- 10 MB por arquivo
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- O nome do arquivo começa pelo uuid do dono: "<uid>/documento-frente.jpg".
-- Assim a policy consegue decidir pelo primeiro segmento do caminho.
drop policy if exists "kyc: dono lê os próprios arquivos" on storage.objects;
create policy "kyc: dono lê os próprios arquivos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'kyc'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "kyc: dono envia os próprios arquivos" on storage.objects;
create policy "kyc: dono envia os próprios arquivos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'kyc'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "kyc: dono substitui os próprios arquivos" on storage.objects;
create policy "kyc: dono substitui os próprios arquivos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'kyc'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Admin lê tudo (para analisar)
drop policy if exists "kyc: admin lê todos os arquivos" on storage.objects;
create policy "kyc: admin lê todos os arquivos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'kyc'
    and exists (
      select 1 from public.profiles p
       where p.id = auth.uid() and p.is_admin
    )
  );

-- ---------------------------------------------------------------------
-- 2. TABELA PRINCIPAL
-- ---------------------------------------------------------------------
create table if not exists public.kyc_submissions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references auth.users (id) on delete cascade,

  status        text not null default 'nao_iniciado'
                check (status in ('nao_iniciado','em_analise','aprovado','recusado','pendente')),

  -- etapa 1: dados pessoais
  full_name     text,
  cpf           text,
  birth_date    date,
  phone         text,
  email         text,
  mother_name   text,

  -- etapa 2: endereço
  cep           text,
  address       text,
  address_number text,
  address_extra text,
  neighborhood  text,
  city          text,
  state         text,

  -- etapa 2: documentos
  doc_type      text check (doc_type in ('cnh','rg')),
  doc_number    text,
  doc_issuer    text,
  doc_state     text,
  doc_front_path text,
  doc_back_path  text,

  -- etapa 2: comprovante de endereço
  proof_type    text check (proof_type in ('luz','agua','telefone','internet','banco','outro')),
  proof_path    text,

  -- etapa 2: selfie segurando o documento
  selfie_doc_path text,

  -- etapa 3: biometria
  face_front_path  text,
  face_right_path  text,
  face_left_path   text,
  face_smile_path  text,
  face_near_path   text,
  liveness_passed  boolean not null default false,
  liveness_score   numeric(4,2),
  quality_score    numeric(4,2),

  -- análise
  reviewer_id   uuid references auth.users (id) on delete set null,
  review_note   text,
  submitted_at  timestamptz,
  reviewed_at   timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.kyc_submissions enable row level security;

drop policy if exists "kyc: dono lê o próprio envio" on public.kyc_submissions;
create policy "kyc: dono lê o próprio envio"
  on public.kyc_submissions for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "kyc: admin lê todos os envios" on public.kyc_submissions;
create policy "kyc: admin lê todos os envios"
  on public.kyc_submissions for select
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- Escrita só pelas funções SECURITY DEFINER abaixo — o cliente não faz
-- insert/update direto, senão poderia se auto-aprovar.
revoke insert, update, delete on public.kyc_submissions from anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. TRILHA DE AUDITORIA
--    Toda mudança de status fica registrada: quem, quando, de que para quê.
-- ---------------------------------------------------------------------
create table if not exists public.kyc_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  ator_id    uuid references auth.users (id) on delete set null,
  de         text,
  para       text not null,
  nota       text,
  criado_em  timestamptz not null default now()
);

alter table public.kyc_events enable row level security;

drop policy if exists "kyc eventos: dono lê os próprios" on public.kyc_events;
create policy "kyc eventos: dono lê os próprios"
  on public.kyc_events for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "kyc eventos: admin lê todos" on public.kyc_events;
create policy "kyc eventos: admin lê todos"
  on public.kyc_events for select
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

revoke insert, update, delete on public.kyc_events from anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. GATILHO: toda conta nova começa com KYC não iniciado
-- ---------------------------------------------------------------------
create or replace function public.kyc_after_profile_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.kyc_submissions (user_id, full_name, cpf, phone, email)
  values (new.id, new.full_name, new.cpf, new.phone, null)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists kyc_after_profile on public.profiles;
create trigger kyc_after_profile
  after insert on public.profiles
  for each row execute function public.kyc_after_profile_insert();

-- preenche quem já existe
insert into public.kyc_submissions (user_id, full_name, cpf, phone)
select p.id, p.full_name, p.cpf, p.phone
  from public.profiles p
 where exists (select 1 from auth.users u where u.id = p.id)
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------
-- 5. FUNÇÕES DO CLIENTE
-- ---------------------------------------------------------------------

/** Estado do KYC de quem está logado. Cria a linha se ainda não existir. */
create or replace function public.kyc_meu_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  k   public.kyc_submissions;
begin
  if uid is null then raise exception 'não autenticado'; end if;

  select * into k from public.kyc_submissions where user_id = uid;
  if not found then
    insert into public.kyc_submissions (user_id) values (uid) returning * into k;
  end if;

  return jsonb_build_object(
    'status',        k.status,
    'full_name',     k.full_name,
    'cpf',           k.cpf,
    'birth_date',    k.birth_date,
    'phone',         k.phone,
    'email',         k.email,
    'mother_name',   k.mother_name,
    'cep',           k.cep,
    'address',       k.address,
    'address_number', k.address_number,
    'address_extra', k.address_extra,
    'neighborhood',  k.neighborhood,
    'city',          k.city,
    'state',         k.state,
    'doc_type',      k.doc_type,
    'doc_number',    k.doc_number,
    'doc_issuer',    k.doc_issuer,
    'doc_state',     k.doc_state,
    'proof_type',    k.proof_type,
    'tem_doc_frente',   k.doc_front_path is not null,
    'tem_doc_verso',    k.doc_back_path is not null,
    'tem_comprovante',  k.proof_path is not null,
    'tem_selfie_doc',   k.selfie_doc_path is not null,
    'tem_biometria',    k.face_front_path is not null and k.face_right_path is not null
                        and k.face_left_path is not null and k.face_smile_path is not null
                        and k.face_near_path is not null,
    'liveness_passed',  k.liveness_passed,
    'liveness_score',   k.liveness_score,
    'quality_score',    k.quality_score,
    'review_note',      k.review_note,
    'submitted_at',     k.submitted_at,
    'reviewed_at',      k.reviewed_at,
    'pode_movimentar',  k.status = 'aprovado'
  );
end;
$$;

/** Etapa 1: dados pessoais. */
create or replace function public.kyc_salvar_dados(
  p_full_name   text,
  p_birth_date  date,
  p_phone       text,
  p_email       text,
  p_mother_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  k   public.kyc_submissions;
  v_uf text;
begin
  if uid is null then raise exception 'não autenticado'; end if;

  if p_full_name is null or length(btrim(p_full_name)) < 5
     or array_length(string_to_array(btrim(p_full_name), ' '), 1) < 2 then
    raise exception 'Informe o nome completo (nome e sobrenome)';
  end if;

  if p_birth_date is null then
    raise exception 'Informe a data de nascimento';
  end if;
  if p_birth_date > current_date then
    raise exception 'Data de nascimento no futuro';
  end if;
  if p_birth_date > current_date - interval '18 years' then
    raise exception 'É preciso ter 18 anos ou mais';
  end if;
  if p_birth_date < current_date - interval '120 years' then
    raise exception 'Data de nascimento inválida';
  end if;

  if p_phone is null or p_phone !~ '^[0-9]{10,11}$' then
    raise exception 'Celular inválido';
  end if;
  if p_email is null or p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'E-mail inválido';
  end if;
  if p_mother_name is null or length(btrim(p_mother_name)) < 5 then
    raise exception 'Informe o nome completo da mãe';
  end if;

  insert into public.kyc_submissions (user_id) values (uid)
  on conflict (user_id) do nothing;

  update public.kyc_submissions
     set full_name   = btrim(p_full_name),
         birth_date  = p_birth_date,
         phone       = p_phone,
         email       = lower(btrim(p_email)),
         mother_name = btrim(p_mother_name),
         status      = case when status = 'nao_iniciado' then 'nao_iniciado' else status end,
         updated_at  = now()
   where user_id = uid
  returning * into k;

  return jsonb_build_object('ok', true, 'status', k.status);
end;
$$;

/** Etapa 2a: endereço. */
create or replace function public.kyc_salvar_endereco(
  p_cep        text,
  p_address    text,
  p_number     text,
  p_extra      text,
  p_neighborhood text,
  p_city       text,
  p_state      text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_uf text := upper(btrim(coalesce(p_state, '')));
begin
  if uid is null then raise exception 'não autenticado'; end if;

  if p_cep is null or replace(p_cep, '-', '') !~ '^[0-9]{8}$' then
    raise exception 'CEP inválido';
  end if;
  if p_address is null or length(btrim(p_address)) < 3 then
    raise exception 'Informe o logradouro';
  end if;
  if p_number is null or length(btrim(p_number)) < 1 then
    raise exception 'Informe o número';
  end if;
  if p_neighborhood is null or length(btrim(p_neighborhood)) < 2 then
    raise exception 'Informe o bairro';
  end if;
  if p_city is null or length(btrim(p_city)) < 2 then
    raise exception 'Informe a cidade';
  end if;
  if v_uf <> all (array['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
                          'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']) then
    raise exception 'UF inválida';
  end if;

  insert into public.kyc_submissions (user_id) values (uid)
  on conflict (user_id) do nothing;

  update public.kyc_submissions
     set cep          = replace(p_cep, '-', ''),
         address      = btrim(p_address),
         address_number = btrim(p_number),
         address_extra  = nullif(btrim(coalesce(p_extra, '')), ''),
         neighborhood = btrim(p_neighborhood),
         city         = btrim(p_city),
         state        = v_uf,
         updated_at   = now()
   where user_id = uid;

  return jsonb_build_object('ok', true);
end;
$$;

/** Etapa 2b: dados do documento (CNH ou RG). */
create or replace function public.kyc_salvar_documento(
  p_doc_type   text,
  p_doc_number text,
  p_doc_issuer text,
  p_doc_state  text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_uf text := upper(btrim(coalesce(p_doc_state, '')));
begin
  if uid is null then raise exception 'não autenticado'; end if;

  if p_doc_type not in ('cnh','rg') then
    raise exception 'Escolha CNH ou RG';
  end if;
  if p_doc_number is null or length(btrim(p_doc_number)) < 4 then
    raise exception 'Informe o número do documento';
  end if;
  if p_doc_issuer is null or length(btrim(p_doc_issuer)) < 2 then
    raise exception 'Informe o órgão emissor';
  end if;
  if v_uf <> all (array['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
                          'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']) then
    raise exception 'UF do documento inválida';
  end if;

  insert into public.kyc_submissions (user_id) values (uid)
  on conflict (user_id) do nothing;

  update public.kyc_submissions
     set doc_type   = p_doc_type,
         doc_number = btrim(p_doc_number),
         doc_issuer = upper(btrim(p_doc_issuer)),
         doc_state  = v_uf,
         updated_at = now()
   where user_id = uid;

  return jsonb_build_object('ok', true);
end;
$$;

/** Etapa 2c: tipo do comprovante de endereço. */
create or replace function public.kyc_salvar_comprovante_tipo(p_proof_type text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'não autenticado'; end if;

  if p_proof_type not in ('luz','agua','telefone','internet','banco','outro') then
    raise exception 'Tipo de comprovante inválido';
  end if;

  insert into public.kyc_submissions (user_id) values (uid)
  on conflict (user_id) do nothing;

  update public.kyc_submissions
     set proof_type = p_proof_type, updated_at = now()
   where user_id = uid;

  return jsonb_build_object('ok', true);
end;
$$;

/** Etapa 2d: registra o caminho de um arquivo já enviado ao bucket. */
create or replace function public.kyc_registrar_arquivo(
  p_slot text,
  p_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  k   public.kyc_submissions;
begin
  if uid is null then raise exception 'não autenticado'; end if;

  -- o caminho tem de pertencer a quem está chamando
  if p_path is null or p_path not like uid::text || '/%' then
    raise exception 'Caminho de arquivo inválido';
  end if;

  insert into public.kyc_submissions (user_id) values (uid)
  on conflict (user_id) do nothing;

  update public.kyc_submissions
     set doc_front_path  = case when p_slot = 'doc_frente'   then p_path else doc_front_path  end,
         doc_back_path   = case when p_slot = 'doc_verso'    then p_path else doc_back_path   end,
         proof_path      = case when p_slot = 'comprovante'  then p_path else proof_path      end,
         selfie_doc_path = case when p_slot = 'selfie_doc'   then p_path else selfie_doc_path end,
         face_front_path = case when p_slot = 'face_frontal' then p_path else face_front_path end,
         face_right_path = case when p_slot = 'face_direita' then p_path else face_right_path end,
         face_left_path  = case when p_slot = 'face_esquerda' then p_path else face_left_path end,
         face_smile_path = case when p_slot = 'face_sorriso' then p_path else face_smile_path end,
         face_near_path  = case when p_slot = 'face_perto'   then p_path else face_near_path   end,
         updated_at = now()
   where user_id = uid;

  if p_slot not in ('doc_frente','doc_verso','comprovante','selfie_doc',
                    'face_frontal','face_direita','face_esquerda','face_sorriso','face_perto') then
    raise exception 'Tipo de arquivo desconhecido: %', p_slot;
  end if;

  select * into k from public.kyc_submissions where user_id = uid;
  return jsonb_build_object('ok', true, 'slot', p_slot);
end;
$$;

/** Etapa 3: resultado da biometria, medido no navegador. */
create or replace function public.kyc_registrar_biometria(
  p_liveness_passed boolean,
  p_liveness_score  numeric,
  p_quality_score   numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'não autenticado'; end if;

  insert into public.kyc_submissions (user_id) values (uid)
  on conflict (user_id) do nothing;

  update public.kyc_submissions
     set liveness_passed = coalesce(p_liveness_passed, false),
         liveness_score  = p_liveness_score,
         quality_score   = p_quality_score,
         updated_at      = now()
   where user_id = uid;

  return jsonb_build_object('ok', true);
end;
$$;

/**
 * Envia para análise.
 * Só aceita com tudo preenchido — é a checagem de completude do cadastro.
 */
create or replace function public.kyc_enviar()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  k   public.kyc_submissions;
  faltas text[] := '{}';
begin
  if uid is null then raise exception 'não autenticado'; end if;

  select * into k from public.kyc_submissions where user_id = uid;
  if not found then raise exception 'Cadastro não iniciado'; end if;

  if k.status = 'em_analise' then raise exception 'Sua verificação já está em análise'; end if;
  if k.status = 'aprovado'   then raise exception 'Sua verificação já foi aprovada'; end if;

  if k.full_name is null or k.birth_date is null or k.mother_name is null then
    faltas := faltas || 'dados pessoais';
  end if;
  if k.phone is null or k.email is null then faltas := faltas || 'contato'; end if;
  if k.cep is null or k.address is null or k.city is null then faltas := faltas || 'endereço'; end if;
  if k.doc_type is null or k.doc_number is null or k.doc_issuer is null then
    faltas := faltas || 'dados do documento';
  end if;

  if k.doc_front_path is null then faltas := faltas || 'foto da frente do documento'; end if;
  if k.doc_back_path  is null then faltas := faltas || 'foto do verso do documento'; end if;
  if k.proof_path     is null then faltas := faltas || 'comprovante de endereço'; end if;
  if k.selfie_doc_path is null then faltas := faltas || 'selfie segurando o documento'; end if;

  if k.face_front_path is null or k.face_right_path is null or k.face_left_path is null
     or k.face_smile_path is null or k.face_near_path is null then
    faltas := faltas || 'captura facial (5 ângulos)';
  end if;

  if not k.liveness_passed then faltas := faltas || 'prova de vida'; end if;

  if array_length(faltas, 1) > 0 then
    raise exception 'Falta concluir: %', array_to_string(faltas, ', ');
  end if;

  update public.kyc_submissions
     set status = 'em_analise', submitted_at = now(), updated_at = now(),
         review_note = null
   where user_id = uid;

  insert into public.kyc_events (user_id, ator_id, de, para, nota)
  values (uid, uid, k.status, 'em_analise', 'Enviado pelo cliente');

  return jsonb_build_object('ok', true, 'status', 'em_analise');
end;
$$;

-- ---------------------------------------------------------------------
-- 6. FUNÇÕES DO ADMIN
-- ---------------------------------------------------------------------

/** Fila de análise. */
create or replace function public.kyc_fila()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r   record;
  out_json jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if not exists (select 1 from public.profiles p where p.id = uid and p.is_admin) then
    raise exception 'acesso restrito';
  end if;

  for r in
    select k.*, p.full_name as perfil_nome
      from public.kyc_submissions k
      join public.profiles p on p.id = k.user_id
     where k.status in ('em_analise','pendente','aprovado','recusado')
     order by
       case k.status when 'em_analise' then 0 when 'pendente' then 1 else 2 end,
       k.submitted_at desc nulls last
     limit 200
  loop
    out_json := out_json || jsonb_build_object(
      'user_id',      r.user_id,
      'nome',         coalesce(r.full_name, r.perfil_nome),
      'cpf',          r.cpf,
      'status',       r.status,
      'doc_type',     r.doc_type,
      'cidade',       r.city,
      'state',        r.state,
      'liveness_score', r.liveness_score,
      'quality_score',  r.quality_score,
      'submitted_at', r.submitted_at,
      'reviewed_at',  r.reviewed_at,
      'review_note',  r.review_note
    );
  end loop;

  return out_json;
end;
$$;

/** Detalhe completo de um envio, com URLs assinadas dos arquivos. */
create or replace function public.kyc_detalhe(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  k   public.kyc_submissions;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if not exists (select 1 from public.profiles p where p.id = uid and p.is_admin) then
    raise exception 'acesso restrito';
  end if;

  select * into k from public.kyc_submissions where user_id = p_user_id;
  if not found then raise exception 'envio não encontrado'; end if;

  return jsonb_build_object(
    'user_id', k.user_id,
    'status', k.status,
    'full_name', k.full_name, 'cpf', k.cpf, 'birth_date', k.birth_date,
    'phone', k.phone, 'email', k.email, 'mother_name', k.mother_name,
    'cep', k.cep, 'address', k.address, 'address_number', k.address_number,
    'address_extra', k.address_extra, 'neighborhood', k.neighborhood,
    'city', k.city, 'state', k.state,
    'doc_type', k.doc_type, 'doc_number', k.doc_number,
    'doc_issuer', k.doc_issuer, 'doc_state', k.doc_state,
    'proof_type', k.proof_type,
    'paths', jsonb_build_object(
      'doc_frente',  k.doc_front_path,
      'doc_verso',   k.doc_back_path,
      'comprovante', k.proof_path,
      'selfie_doc',  k.selfie_doc_path,
      'face_frontal', k.face_front_path,
      'face_direita', k.face_right_path,
      'face_esquerda', k.face_left_path,
      'face_sorriso', k.face_smile_path,
      'face_perto',   k.face_near_path
    ),
    'liveness_passed', k.liveness_passed,
    'liveness_score', k.liveness_score,
    'quality_score', k.quality_score,
    'submitted_at', k.submitted_at,
    'reviewed_at', k.reviewed_at,
    'review_note', k.review_note
  );
end;
$$;

/** Aprova ou recusa. */
create or replace function public.kyc_decidir(
  p_user_id uuid,
  p_decisao text,
  p_nota    text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  k   public.kyc_submissions;
  v_novo text;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if not exists (select 1 from public.profiles p where p.id = uid and p.is_admin) then
    raise exception 'acesso restrito';
  end if;

  if p_decisao not in ('aprovado','recusado','pendente') then
    raise exception 'Decisão inválida';
  end if;
  if p_decisao = 'recusado' and (p_nota is null or length(btrim(p_nota)) < 5) then
    raise exception 'Explique o motivo da recusa';
  end if;

  select * into k from public.kyc_submissions where user_id = p_user_id;
  if not found then raise exception 'envio não encontrado'; end if;
  if k.status = 'nao_iniciado' then raise exception 'O cliente ainda não enviou a verificação'; end if;

  v_novo := p_decisao;

  update public.kyc_submissions
     set status = v_novo,
         reviewer_id = uid,
         review_note = nullif(btrim(coalesce(p_nota, '')), ''),
         reviewed_at = now(),
         updated_at = now()
   where user_id = p_user_id;

  insert into public.kyc_events (user_id, ator_id, de, para, nota)
  values (p_user_id, uid, k.status, v_novo, nullif(btrim(coalesce(p_nota,'')), ''));

  return jsonb_build_object('ok', true, 'status', v_novo);
end;
$$;

/** Reabre para o cliente corrigir. */
create or replace function public.kyc_reabrir(p_user_id uuid, p_nota text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  k   public.kyc_submissions;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if not exists (select 1 from public.profiles p where p.id = uid and p.is_admin) then
    raise exception 'acesso restrito';
  end if;

  select * into k from public.kyc_submissions where user_id = p_user_id;
  if not found then raise exception 'envio não encontrado'; end if;

  update public.kyc_submissions
     set status = 'pendente', review_note = btrim(p_nota),
         reviewer_id = uid, reviewed_at = now(), updated_at = now()
   where user_id = p_user_id;

  insert into public.kyc_events (user_id, ator_id, de, para, nota)
  values (p_user_id, uid, k.status, 'pendente', btrim(p_nota));

  return jsonb_build_object('ok', true, 'status', 'pendente');
end;
$$;

/** Contadores para o painel. */
create or replace function public.kyc_resumo()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if not exists (select 1 from public.profiles p where p.id = uid and p.is_admin) then
    raise exception 'acesso restrito';
  end if;

  return jsonb_build_object(
    'em_analise', (select count(*) from public.kyc_submissions where status = 'em_analise'),
    'aprovado',   (select count(*) from public.kyc_submissions where status = 'aprovado'),
    'recusado',   (select count(*) from public.kyc_submissions where status = 'recusado'),
    'pendente',   (select count(*) from public.kyc_submissions where status = 'pendente'),
    'nao_iniciado', (select count(*) from public.kyc_submissions where status = 'nao_iniciado')
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 7. GATE: a movimentação bancária exige KYC aprovado
-- ---------------------------------------------------------------------

/** Verdadeiro quando o cliente pode movimentar dinheiro. */
create or replace function public.kyc_pode_movimentar(p_user_id uuid default null)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select k.status = 'aprovado'
       from public.kyc_submissions k
      where k.user_id = coalesce(p_user_id, auth.uid())),
    false
  );
$$;

-- ---------------------------------------------------------------------
-- 7b. GATE nos agendamentos
--
-- `bank_move` é o caminho direto, mas o dinheiro também sai por um segundo
-- caminho: o cliente agenda ('bank_schedule', liberada para authenticated) e
-- o cron chama `bank_move_for` depois. Sem gate nos dois pontos, um cliente
-- sem KYC agenda hoje e o dinheiro sai amanhã, sem passar por `bank_move`.
-- ---------------------------------------------------------------------

/** Não deixa agendar sem verificação aprovada. */
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

  if not public.kyc_pode_movimentar(uid) then
    raise exception 'verificação de identidade pendente: conclua sua verificação para agendar';
  end if;

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

/**
 * Rede de segurança na execução da fila. Um agendamento criado antes desta
 * regra existir ainda estaria 'agendado'; aqui ele não executa e vira
 * 'falhou', em vez de debitar uma conta sem verificação.
 *
 * Só barra SAÍDA: crédito de empréstimo e estorno seguem liberados.
 */
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
      if not public.kyc_pode_movimentar(sc.user_id) then
        update public.bank_schedules set status = 'falhou' where id = sc.id;
        continue;
      end if;

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
-- 7c. GATE no pedido de empréstimo
--
-- A server action já checa o KYC, mas isso é uma trava de aplicação: o
-- cliente tem `grant insert (amount, installments)` na tabela e pode chamar
-- a API REST direto, driblando a action. A regra tem de viver no banco,
-- como acontece com `bank_move`.
--
-- A policy antiga só exigia `auth.uid() = user_id and status = 'em_analise'`.
-- Aqui ela passa a exigir também a verificação aprovada.
-- ---------------------------------------------------------------------

drop policy if exists "pedido: criar o próprio" on public.loan_requests;
create policy "pedido: criar o próprio"
  on public.loan_requests for insert
  with check (
    auth.uid() = user_id
    and status = 'em_analise'
    and public.kyc_pode_movimentar(auth.uid())
  );

-- ---------------------------------------------------------------------
-- 8. PERMISSÕES
-- ---------------------------------------------------------------------
revoke all on function public.kyc_meu_status() from public, anon;
revoke all on function public.kyc_salvar_dados(text, date, text, text, text) from public, anon;
revoke all on function public.kyc_salvar_endereco(text, text, text, text, text, text, text) from public, anon;
revoke all on function public.kyc_salvar_documento(text, text, text, text) from public, anon;
revoke all on function public.kyc_salvar_comprovante_tipo(text) from public, anon;
revoke all on function public.kyc_registrar_arquivo(text, text) from public, anon;
revoke all on function public.kyc_registrar_biometria(boolean, numeric, numeric) from public, anon;
revoke all on function public.kyc_enviar() from public, anon;
revoke all on function public.kyc_fila() from public, anon;
revoke all on function public.kyc_detalhe(uuid) from public, anon;
revoke all on function public.kyc_decidir(uuid, text, text) from public, anon;
revoke all on function public.kyc_reabrir(uuid, text) from public, anon;
revoke all on function public.kyc_resumo() from public, anon;

grant execute on function public.kyc_meu_status() to authenticated;
grant execute on function public.kyc_salvar_dados(text, date, text, text, text) to authenticated;
grant execute on function public.kyc_salvar_endereco(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.kyc_salvar_documento(text, text, text, text) to authenticated;
grant execute on function public.kyc_salvar_comprovante_tipo(text) to authenticated;
grant execute on function public.kyc_registrar_arquivo(text, text) to authenticated;
grant execute on function public.kyc_registrar_biometria(boolean, numeric, numeric) to authenticated;
grant execute on function public.kyc_enviar() to authenticated;
grant execute on function public.kyc_fila() to authenticated;
grant execute on function public.kyc_detalhe(uuid) to authenticated;
grant execute on function public.kyc_decidir(uuid, text, text) to authenticated;
grant execute on function public.kyc_reabrir(uuid, text) to authenticated;
grant execute on function public.kyc_resumo() to authenticated;
grant execute on function public.kyc_pode_movimentar(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 9. LIGA O GATE NA MOVIMENTAÇÃO
--
--    Entrada de dinheiro continua liberada (depósito, PIX recebido,
--    crédito de empréstimo, estorno) — travar a entrada não protege
--    ninguém e deixaria o cliente sem conseguir se regularizar.
--
--    Saída de dinheiro exige KYC aprovado: PIX enviado, transferência,
--    boleto, saque, recarga, agendamento, débito automático e tarifa.
-- ---------------------------------------------------------------------
create or replace function public.bank_exige_kyc(p_kind text, p_amount numeric)
returns boolean
language sql
immutable
as $$
  select
    -- só saída
    p_amount < 0
    -- e só as naturezas que representam o cliente dispondo do próprio dinheiro
    and p_kind in ('pix_envio','transferencia_envio','boleto','saque','recarga',
                   'agendamento','debito_automatico','tarifa');
$$;

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
-- 10. PERMISSÕES DAS FUNÇÕES DE GATE
-- ---------------------------------------------------------------------
revoke all on function public.bank_exige_kyc(text, numeric) from public, anon;
grant execute on function public.bank_exige_kyc(text, numeric) to authenticated;
