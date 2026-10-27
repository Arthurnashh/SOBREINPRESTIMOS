-- =====================================================================
-- Empréstimo: faixa de 500 a 20.000 e declaração de seguro
--
-- Duas correções e uma novidade:
--
-- 1. A faixa estava INCONSISTENTE. O site oferecia até R$ 20.000
--    (lib/config.ts), mas o banco só aceitava até R$ 10.000. Quem pedisse
--    R$ 15.000 pelo site tomava erro na gravação. Agora o check do banco
--    acompanha o produto: 500 a 20.000.
--
-- 2. O cliente passa a declarar se tem seguro/garantia, com a opção de
--    descrever outras situações. Isso alimenta a análise: quem tem garantia
--    real representa menos risco.
-- =====================================================================

-- ------------------------- 1. faixa de valores -----------------------
alter table public.loan_requests
  drop constraint if exists loan_requests_amount_check;

alter table public.loan_requests
  add constraint loan_requests_amount_check
  check (amount >= 500 and amount <= 20000);

-- --------------------- 2. declaração de seguro ------------------------
-- tipo: qual situação o cliente marcou. `outro` cobre o que não está na lista.
-- descricao: texto livre, obrigatório quando o tipo é `outro`.
alter table public.loan_requests
  add column if not exists seguro_tipo text,
  add column if not exists seguro_descricao text;

alter table public.loan_requests
  drop constraint if exists loan_requests_seguro_tipo_check;

alter table public.loan_requests
  add constraint loan_requests_seguro_tipo_check
  check (
    seguro_tipo is null
    or seguro_tipo in (
      'veiculo',        -- veículo quitado ou financiado em seu nome
      'imovel',         -- imóvel próprio
      'vida',           -- seguro de vida
      'residencial',    -- seguro residencial
      'consignado',     -- margem consignável / convênio
      'fiador',         -- tem fiador
      'nenhum',         -- não possui nada disso
      'outro'           -- outra situação, descrita em seguro_descricao
    )
  );

-- Quem marca "outro" precisa dizer o quê. Sem isso a análise não sabe o que é.
alter table public.loan_requests
  drop constraint if exists loan_requests_seguro_descricao_check;

alter table public.loan_requests
  add constraint loan_requests_seguro_descricao_check
  check (
    seguro_tipo is distinct from 'outro'
    or (seguro_descricao is not null and length(btrim(seguro_descricao)) >= 3)
  );

-- A descrição nunca deve virar depósito de texto gigante.
alter table public.loan_requests
  drop constraint if exists loan_requests_seguro_descricao_tam;

alter table public.loan_requests
  add constraint loan_requests_seguro_descricao_tam
  check (seguro_descricao is null or length(seguro_descricao) <= 300);
