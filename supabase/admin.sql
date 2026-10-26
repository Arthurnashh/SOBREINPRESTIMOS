-- =====================================================================
-- SobreImpréstimos — camada de administração
-- Rode DEPOIS de schema.sql. Adiciona papel de admin, leitura total e
-- a função de decisão dos pedidos. Writes de admin passam por função
-- SECURITY DEFINER, então os grants restritivos do cliente continuam valendo.
-- =====================================================================

-- Marca quem é administrador. Definido manualmente (veja o fim do arquivo).
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- Checagem de admin sem recursão de RLS (roda como owner, ignora as policies).
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

grant execute on function public.is_admin() to authenticated;

-- Admin enxerga todos os perfis e todos os pedidos (policies permissivas são OR).
drop policy if exists "perfil: admin lê todos" on public.profiles;
create policy "perfil: admin lê todos"
  on public.profiles for select
  using (public.is_admin());

drop policy if exists "pedido: admin lê todos" on public.loan_requests;
create policy "pedido: admin lê todos"
  on public.loan_requests for select
  using (public.is_admin());

-- Decisão do pedido. Só admin executa; recalcule as condições no app antes.
create or replace function public.admin_set_decision(
  p_id          uuid,
  p_status      text,
  p_monthly_rate numeric default null,
  p_iof         numeric default null,
  p_installment numeric default null,
  p_cet         numeric default null,
  p_note        text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'não autorizado';
  end if;
  if p_status not in ('em_analise', 'aprovado', 'recusado', 'liberado', 'cancelado') then
    raise exception 'status inválido';
  end if;
  -- Limite do produto: taxa acima do teto configurado não é gravada.
  if p_monthly_rate is not null and p_monthly_rate > 0.20 then
    raise exception 'taxa mensal acima do teto permitido';
  end if;

  update public.loan_requests
     set status            = p_status,
         monthly_rate      = coalesce(p_monthly_rate, monthly_rate),
         iof               = coalesce(p_iof, iof),
         installment_value = coalesce(p_installment, installment_value),
         cet_yearly        = coalesce(p_cet, cet_yearly),
         decision_note     = p_note
   where id = p_id;

  if not found then
    raise exception 'pedido não encontrado';
  end if;
end;
$$;

grant execute on function public.admin_set_decision(uuid, text, numeric, numeric, numeric, numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- Tornar um usuário administrador (rode manualmente, trocando o e-mail):
--
--   update public.profiles set is_admin = true
--   where id = (select id from auth.users where email = 'admin@suaempresa.com');
-- ---------------------------------------------------------------------
