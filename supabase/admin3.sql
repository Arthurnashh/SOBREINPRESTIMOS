-- =====================================================================
-- Admin não faz verificação de identidade
--
-- Por quê: o admin é quem APROVA as verificações. Obrigá-lo a se verificar
-- cria um ciclo fechado — ninguém aprova o admin, então ele fica preso fora
-- do próprio painel e sem poder movimentar a conta.
--
-- O que muda: `kyc_pode_movimentar` passa a devolver true para administrador,
-- sem consultar o KYC. Como TODOS os gates passam por essa função (bank_move,
-- bank_schedule, bank_run_schedules e a policy de criar pedido de empréstimo),
-- isentar aqui destrava tudo de uma vez, sem espalhar exceção pelo código.
--
-- O que NÃO muda: cliente comum continua precisando de KYC aprovado. A
-- verificação em si (a tela, o envio, a fila de análise) segue igual para
-- todo mundo — o admin simplesmente não é obrigado a passar por ela.
-- =====================================================================

create or replace function public.kyc_pode_movimentar(p_user_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Administrador dispensa verificação: ele é quem analisa as dos outros.
    exists (
      select 1 from public.profiles p
       where p.id = coalesce(p_user_id, auth.uid())
         and p.is_admin
    )
    or coalesce(
      (select k.status = 'aprovado'
         from public.kyc_submissions k
        where k.user_id = coalesce(p_user_id, auth.uid())),
      false
    );
$$;

grant execute on function public.kyc_pode_movimentar(uuid) to authenticated;
