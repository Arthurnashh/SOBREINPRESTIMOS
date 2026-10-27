-- =====================================================================
-- loan_request passa a aceitar a periodicidade
--
-- O cliente escolhe pagar por semana, a cada 15 dias ou por mês. O prazo
-- aceito depende da modalidade, e a taxa do período é derivada da taxa
-- mensal por juros compostos, ficando gravada no pedido para o contrato não
-- depender de recálculo futuro.
-- =====================================================================

-- Remove a versão antiga (4 argumentos) antes de recriar a nova. Ela tinha
-- `default` em p_seguro_descricao, o que impede o CREATE OR REPLACE de mudar
-- a assinatura. O DROP é seguro porque nenhum dado depende da função.
drop function if exists public.loan_request(numeric, int, text, text);

create or replace function public.loan_request(
  p_amount numeric,
  p_installments int,
  p_seguro_tipo text,
  p_seguro_descricao text default null,
  p_periodicidade text default 'mensal'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  novo public.loan_requests;
  descricao text := nullif(btrim(coalesce(p_seguro_descricao, '')), '');
  per text := coalesce(nullif(btrim(p_periodicidade), ''), 'mensal');
  taxa_mensal numeric;
  taxa_per numeric;
  por_mes numeric;
begin
  if uid is null then raise exception 'não autenticado'; end if;

  if per not in ('semanal', 'quinzenal', 'mensal') then
    raise exception 'Periodicidade inválida: escolha semanal, quinzenal ou mensal';
  end if;

  -- Faixa de valor. Espelha lib/config.ts: de R$ 500 a R$ 20.000.
  if p_amount is null or p_amount < 500 or p_amount > 20000 then
    raise exception 'Escolha um valor entre R$ 500 e R$ 20.000';
  end if;

  -- O prazo aceito depende da modalidade, como no app (PERIODO em lib/loan.ts).
  if p_installments is null
     or (per = 'semanal'   and p_installments not in (12, 24))
     or (per = 'quinzenal' and p_installments not in (12, 18))
     or (per = 'mensal'    and p_installments not in (6, 12, 18, 24)) then
    raise exception 'Prazo inválido para pagamento %', per;
  end if;

  -- Garantia: obrigatória, e quem marca "outro" precisa descrever.
  if p_seguro_tipo is null or btrim(p_seguro_tipo) = '' then
    raise exception 'Informe se você possui algum tipo de seguro ou garantia';
  end if;
  if p_seguro_tipo not in ('veiculo','imovel','vida','residencial','consignado','fiador','nenhum','outro') then
    raise exception 'Opção de seguro inválida';
  end if;
  if p_seguro_tipo = 'outro' and (descricao is null or length(descricao) < 3) then
    raise exception 'Descreva a sua situação no campo indicado';
  end if;
  if descricao is not null and length(descricao) > 300 then
    raise exception 'A descrição deve ter no máximo 300 caracteres';
  end if;

  -- Crédito só para identidade verificada (admin é isento).
  if not public.kyc_pode_movimentar(uid) then
    raise exception 'Conclua sua verificação de identidade para pedir empréstimo';
  end if;

  -- Taxa do período a partir da taxa mensal do produto (3,99% a.m., a mesma
  -- de NEXT_PUBLIC_TAXA_MENSAL). O app recalcula o mesmo valor para exibir a
  -- simulação; aqui fica gravado para o contrato não depender de recálculo.
  taxa_mensal := 0.0399;
  por_mes := case per when 'semanal' then 4.345 when 'quinzenal' then 2.174 else 1 end;
  taxa_per := power(1 + taxa_mensal, 1 / por_mes) - 1;

  insert into public.loan_requests
    (user_id, amount, installments, status, seguro_tipo, seguro_descricao, periodicidade, taxa_periodo)
  values (
    uid,
    p_amount,
    p_installments,
    'em_analise',
    p_seguro_tipo,
    -- Só guarda descrição quando faz sentido, para não poluir quem marcou
    -- uma opção objetiva.
    case when p_seguro_tipo = 'outro' then descricao else null end,
    per,
    taxa_per
  )
  returning * into novo;

  return to_jsonb(novo);
exception
  -- Um pedido em andamento por vez. O índice único garante; traduzimos o erro
  -- para algo que o cliente entenda.
  when unique_violation then
    raise exception 'Você já tem um pedido em andamento. Aguarde a análise.';
end;
$$;

revoke all on function public.loan_request(numeric, int, text, text, text) from public, anon;
grant execute on function public.loan_request(numeric, int, text, text, text) to authenticated;

-- A chamada com quatro argumentos continua válida pelo `default` de
-- p_periodicidade, então nenhum chamador antigo quebra.
