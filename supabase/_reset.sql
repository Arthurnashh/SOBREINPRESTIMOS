-- Zera o saldo e apaga os lancamentos gerados pelos testes automatizados.
-- Mantem a conta, o cartao e as chaves PIX.
delete from public.bank_boletos;
delete from public.bank_transactions;
update public.bank_accounts set balance = 0, overdraft = 0;
select count(*) as contas, coalesce(sum(balance),0) as saldo_total from public.bank_accounts;
