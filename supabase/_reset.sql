-- Devolve a conta de teste ao estado limpo, sem apagar a conta nem o cartao.
-- Rode com: npx supabase db query --linked -f supabase/_reset.sql
delete from public.bank_boletos;
delete from public.bank_deposits;
delete from public.bank_withdrawals;
delete from public.bank_topups;
delete from public.bank_schedules;
delete from public.bank_dda;
delete from public.bank_pix_charges;
delete from public.bank_receipts;
delete from public.bank_fees;
delete from public.bank_transactions;

update public.bank_accounts set balance = 0, overdraft = 0;
update public.bank_cards set status = 'ativo';

-- limites de volta ao padrão do produto
update public.bank_limits
   set pix_per_tx = 5000, pix_per_day = 10000,
       transfer_per_tx = 5000, withdraw_per_day = 3000,
       updated_at = now();

-- chaves PIX e dados cadastrais de teste
delete from public.bank_pix_keys;
delete from public.bank_profiles;

select
  (select count(*) from public.bank_accounts)     as contas,
  (select count(*) from public.bank_transactions) as lancamentos,
  (select count(*) from public.bank_deposits)     as depositos,
  (select count(*) from public.bank_schedules)    as agendamentos,
  (select count(*) from public.bank_pix_keys)     as chaves;
