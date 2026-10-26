select
  (select count(*) from public.bank_transactions) as lancamentos,
  (select count(*) from public.bank_topups)       as recargas,
  (select count(*) from public.bank_schedules)    as agendamentos,
  (select count(*) from public.bank_withdrawals)  as saques,
  (select count(*) from public.bank_receipts)     as comprovantes;
