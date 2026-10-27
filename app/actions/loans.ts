"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LOAN } from "@/lib/config";
import { ehPeriodicidade, isValidRequest, PERIODO } from "@/lib/loan";
import { ehSeguroTipo } from "@/lib/seguro";

export type LoanFormState = { error?: string } | undefined;

export async function requestLoan(_prev: LoanFormState, formData: FormData): Promise<LoanFormState> {
  const amount = Number(formData.get("amount"));
  const installments = Number(formData.get("installments"));
  const periodicidadeBruta = String(formData.get("periodicidade") ?? "mensal");
  const periodicidade = ehPeriodicidade(periodicidadeBruta) ? periodicidadeBruta : "mensal";

  const faixa = `R$ ${LOAN.min.toLocaleString("pt-BR")} e R$ ${LOAN.max.toLocaleString("pt-BR")}`;
  if (!isValidRequest(amount, installments, periodicidade)) {
    const opcoes = PERIODO[periodicidade].opcoes.join(", ");
    return {
      error: `Escolha um valor entre ${faixa} e um prazo válido (${opcoes} ${PERIODO[periodicidade].unidade}).`,
    };
  }
  if (formData.get("confirm") !== "on") {
    return { error: "Confirme que leu as condições da simulação." };
  }

  // Declaração de garantias. É obrigatória: sem ela a análise não tem como
  // diferenciar quem tem garantia de quem não tem.
  const seguroTipo = String(formData.get("seguro_tipo") ?? "").trim();
  const seguroDescricao = String(formData.get("seguro_descricao") ?? "").trim().slice(0, 300);

  if (!seguroTipo) {
    return { error: "Informe se você possui algum tipo de seguro ou garantia." };
  }
  if (!ehSeguroTipo(seguroTipo)) {
    return { error: "Opção de seguro inválida." };
  }  if (seguroTipo === "outro" && seguroDescricao.length < 3) {
    return { error: "Descreva a sua situação no campo indicado." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/entrar?next=/conta/emprestimo");

  /*
   * A criação passa pela função `loan_request`, e não por `.insert()` direto.
   *
   * Motivo: `authenticated` não tem INSERT em nenhuma tabela deste sistema —
   * toda escrita passa por função SECURITY DEFINER, que valida as regras no
   * banco. O insert direto sempre falhava com "permission denied", e o cliente
   * não conseguia pedir empréstimo. A função valida faixa, prazo, garantia e o
   * KYC de uma vez.
   */
  const { error } = await supabase.rpc("loan_request", {
    p_amount: amount,
    p_installments: installments,
    p_seguro_tipo: seguroTipo,
    p_seguro_descricao: seguroTipo === "outro" ? seguroDescricao : null,
    p_periodicidade: periodicidade,
  });

  if (error) {
    // A função devolve mensagens legíveis; só não vazamos erro cru do banco.
    const msg = error.message.replace(/^.*?:\s*/, "");
    return { error: msg || "Não foi possível enviar o pedido. Tente novamente." };
  }

  revalidatePath("/conta");
  redirect("/conta?pedido=enviado");
}

export async function cancelLoan(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  await supabase
    .from("loan_requests")
    .update({ status: "cancelado" })
    .eq("id", id)
    .eq("status", "em_analise");
  revalidatePath("/conta");
}

/* =====================================================================
   Taxa de confiança (adesão)

   A taxa é criada pelo banco no ato da liberação (supabase/loan7.sql) e
   nasce com o valor liberado bloqueado na conta. As duas ações abaixo são
   a ponte para as funções SECURITY DEFINER: uma registra o "ciente" do
   aviso, a outra debita a taxa, libera o saldo e abate a 1ª parcela.
   ===================================================================== */

export type TaxaResult = { ok?: true; taxa?: number; error?: string };

function erroTaxa(msg: string): string {
  const m = msg.replace(/^.*?:\s*/, "");
  if (/saldo insuficiente/i.test(m)) return "Saldo insuficiente para aplicar a taxa.";
  if (/não autenticado|jwt/i.test(m)) return "Sua sessão expirou. Entre novamente.";
  if (/acesso restrito|não autorizado/i.test(m)) return "Você não tem acesso a este pedido.";
  if (/não está liberado/i.test(m)) return "O empréstimo ainda não foi liberado.";
  if (/não tem taxa/i.test(m)) return "Este pedido não tem taxa de confiança.";
  return m || "Não foi possível concluir agora. Tente novamente.";
}

/** Cliente leu o aviso. Não move dinheiro; o saldo continua bloqueado. */
export async function dispensarTaxaAdesao(loanId: string): Promise<TaxaResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("loan_taxa_confirmar", { p_loan_id: loanId });
  if (error) return { error: erroTaxa(error.message) };

  revalidatePath("/conta");
  revalidatePath("/conta/emprestimos");
  return { ok: true };
}

/** Debita a taxa, libera o saldo e abate o valor na primeira parcela. */
export async function aplicarTaxaAdesao(loanId: string): Promise<TaxaResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("loan_taxa_aplicar", { p_loan_id: loanId });
  if (error) return { error: erroTaxa(error.message) };

  revalidatePath("/conta");
  revalidatePath("/conta/emprestimos");
  revalidatePath("/conta/banco");
  return { ok: true, taxa: Number((data as { taxa?: number } | null)?.taxa ?? 0) };
}
