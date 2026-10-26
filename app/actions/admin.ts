"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/account";
import { LOAN } from "@/lib/config";
import { isValidRequest, simulate } from "@/lib/loan";

export type AdminFormState = { error?: string; success?: string } | undefined;

export async function decideLoan(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const { supabase } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").slice(0, 200) || null;

  if (!id) return { error: "Pedido inválido." };

  // Lê o pedido (admin tem leitura total por RLS).
  const { data: loan } = await supabase
    .from("loan_requests")
    .select("amount, installments, status")
    .eq("id", id)
    .single<{ amount: number; installments: number; status: string }>();

  if (!loan) return { error: "Pedido não encontrado." };

  if (decision === "recusar") {
    const { error } = await supabase.rpc("admin_set_decision", {
      p_id: id,
      p_status: "recusado",
      p_note: note,
    });
    if (error) return { error: "Não foi possível recusar." };
    revalidatePath("/admin");
    return { success: "Pedido recusado." };
  }

  if (decision === "liberar") {
    const { error } = await supabase.rpc("admin_set_decision", {
      p_id: id,
      p_status: "liberado",
      p_note: note,
    });
    if (error) return { error: "Não foi possível marcar como liberado." };

    // O valor liberado entra na conta bancária do cliente. A função é
    // idempotente: uma segunda chamada para o mesmo pedido não credita de novo.
    const { error: erroCredito } = await supabase.rpc("bank_credit_loan", { p_loan_id: id });
    revalidatePath("/admin");
    revalidatePath("/admin/pedido/" + id);

    if (erroCredito) {
      return {
        success:
          "Pedido marcado como liberado, mas o crédito na conta falhou. Rode o crédito novamente pelo pedido.",
      };
    }
    return { success: "Pedido liberado e valor creditado na conta do cliente." };
  }

  if (decision === "aprovar") {
    const rate = Number(String(formData.get("monthly_rate") ?? "").replace(",", "."));
    if (!Number.isFinite(rate) || rate <= 0) return { error: "Informe a taxa mensal." };
    if (rate > LOAN.maxMonthlyRate) {
      return {
        error: `Taxa acima do teto de ${(LOAN.maxMonthlyRate * 100).toFixed(0)}% a.m. Acima disso caracteriza usura e não é permitido.`,
      };
    }
    if (!isValidRequest(Number(loan.amount), loan.installments)) {
      return { error: "Valores do pedido fora da faixa permitida." };
    }

    const sim = simulate(Number(loan.amount), loan.installments, rate);
    const { error } = await supabase.rpc("admin_set_decision", {
      p_id: id,
      p_status: "aprovado",
      p_monthly_rate: rate,
      p_iof: sim.iof,
      p_installment: sim.installmentValue,
      p_cet: sim.cetYearly,
      p_note: note,
    });
    if (error) return { error: "Não foi possível aprovar." };
    revalidatePath("/admin");
    return { success: "Pedido aprovado com as condições calculadas." };
  }

  return { error: "Ação inválida." };
}
