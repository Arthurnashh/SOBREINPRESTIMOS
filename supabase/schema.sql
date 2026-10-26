-- =====================================================================
-- Lumen Crédito — schema do Supabase
-- Rode este arquivo inteiro no SQL Editor do Supabase (uma vez).
-- =====================================================================

-- ---------------------------------------------------------------------
-- PERFIS (1:1 com auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  full_name            text not null,
  cpf                  text not null unique check (cpf ~ '^[0-9]{11}$'),
  phone                text,
  -- id da conta no provedor BaaS; preenchido só pelo backoffice (service role)
  external_account_id  text,
  created_at           timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "perfil: ler o próprio" on public.profiles;
create policy "perfil: ler o próprio"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "perfil: editar o próprio" on public.profiles;
create policy "perfil: editar o próprio"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- O usuário só pode alterar nome e telefone. CPF e conta externa ficam travados.
revoke insert, update, delete on public.profiles from authenticated, anon;
grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- Cria o perfil automaticamente no cadastro, a partir dos metadados do signUp.
-- O CPF é obrigatório no perfil: normalizamos os dígitos e, se faltar, falhamos
-- com mensagem clara em vez de estourar um NOT NULL cru.
-- (A versão completa, que também abre conta e cartão, está em bank.sql.)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cpf   text := nullif(regexp_replace(coalesce(new.raw_user_meta_data ->> 'cpf', ''), '\D', '', 'g'), '');
  v_phone text := nullif(regexp_replace(coalesce(new.raw_user_meta_data ->> 'phone', ''), '\D', '', 'g'), '');
begin
  if v_cpf is null or v_cpf !~ '^[0-9]{11}$' then
    raise exception 'CPF ausente ou inválido no cadastro';
  end if;

  insert into public.profiles (id, full_name, cpf, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    v_cpf,
    v_phone
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- PEDIDOS DE EMPRÉSTIMO
-- O cliente só informa valor e prazo. Taxa, IOF, parcela e CET definitivos
-- são gravados pela análise (backoffice / service role) na aprovação.
-- ---------------------------------------------------------------------
create table if not exists public.loan_requests (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  amount             numeric(12,2) not null check (amount between 1000 and 10000),
  installments       int not null check (installments in (6, 12, 18, 24)),
  status             text not null default 'em_analise'
                     check (status in ('em_analise', 'aprovado', 'recusado', 'liberado', 'cancelado')),
  -- condições contratadas (preenchidas na aprovação)
  monthly_rate       numeric(8,6),
  iof                numeric(12,2),
  installment_value  numeric(12,2),
  cet_yearly         numeric(8,6),
  decision_note      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists loan_requests_user_idx on public.loan_requests (user_id, created_at desc);

-- No máximo um pedido em aberto por cliente
create unique index if not exists loan_requests_one_open_per_user
  on public.loan_requests (user_id)
  where status in ('em_analise', 'aprovado');

alter table public.loan_requests enable row level security;

drop policy if exists "pedido: ler os próprios" on public.loan_requests;
create policy "pedido: ler os próprios"
  on public.loan_requests for select
  using (auth.uid() = user_id);

drop policy if exists "pedido: criar o próprio" on public.loan_requests;
create policy "pedido: criar o próprio"
  on public.loan_requests for insert
  with check (auth.uid() = user_id and status = 'em_analise');

-- Cliente pode cancelar enquanto está em análise
drop policy if exists "pedido: cancelar o próprio" on public.loan_requests;
create policy "pedido: cancelar o próprio"
  on public.loan_requests for update
  using (auth.uid() = user_id and status = 'em_analise')
  with check (auth.uid() = user_id and status = 'cancelado');

revoke insert, update, delete on public.loan_requests from authenticated, anon;
grant select on public.loan_requests to authenticated;
grant insert (amount, installments) on public.loan_requests to authenticated;
grant update (status) on public.loan_requests to authenticated;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists loan_requests_touch on public.loan_requests;
create trigger loan_requests_touch
  before update on public.loan_requests
  for each row execute function public.touch_updated_at();
