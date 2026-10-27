-- =====================================================================
-- Pedido de empréstimo passa a ser criado por função
--
-- O BUG: o app fazia `.insert()` direto em `loan_requests`, mas
-- `authenticated` não tem INSERT nessa tabela — nem em nenhuma outra. Isso é
-- proposital: toda escrita neste sistema passa por função SECURITY DEFINER,
-- que valida as regras no banco. O INSERT direto sempre dava
-- "permission denied for table loan_requests", e o cliente não conseguia
-- pedir empréstimo.
--
-- A CORREÇÃO: `loan_request()`, no mesmo padrão de `bank_deposit`,
-- `bank_add_pix_key` e das demais. Ela valida faixa, prazo, garantia e o KYC
-- dentro do banco, e devolve o pedido criado.
--
-- Por que não simplesmente dar GRANT INSERT na tabela: a policy sozinha não
-- valida faixa de valor nem a declaração de garantia. Com a função, as regras
-- ficam num lugar só e valem para qualquer caminho.
-- =====================================================================

create or replace function public.loan_request(
  p_amount numeric,
  p_installments int,
  p_seguro_tipo text,
  p_seguro_descricao text default null
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
begin
  if uid is null then raise exception 'não autenticado'; end if;

  -- Faixa e prazo. Espelha lib/config.ts: de R$ 500 a R$ 20.000.
  if p_amount is null or p_amount < 500 or p_amount > 20000 then
    raise exception 'Escolha um valor entre R$ 500 e R$ 20.000';
  end if;
  if p_installments is null or p_installments not in (6, 12, 18, 24) then
    raise exception 'Prazo inválido: escolha 6, 12, 18 ou 24 parcelas';
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

  insert into public.loan_requests (user_id, amount, installments, status, seguro_tipo, seguro_descricao)
  values (
    uid,
    p_amount,
    p_installments,
    'em_analise',
    p_seguro_tipo,
    -- Só guarda descrição quando faz sentido, para não poluir quem marcou
    -- uma opção objetiva.
    case when p_seguro_tipo = 'outro' then descricao else null end
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

revoke all on function public.loan_request(numeric, int, text, text) from public, anon;
grant execute on function public.loan_request(numeric, int, text, text) to authenticated;
