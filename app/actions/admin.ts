"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/account";
import { LOAN } from "@/lib/config";
import { brl } from "@/lib/format";
import { isValidRequest, simulate } from "@/lib/loan";
import { createClient } from "@/lib/supabase/server";

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

/* =====================================================================
   Ficha da conta — ações administrativas
   =====================================================================

   As funções do banco (supabase/admin2.sql) já conferem is_admin() na
   primeira linha e exigem motivo. Estas actions são só a ponte: validam o
   formato, chamam o RPC e traduzem o erro. A autorização de verdade NÃO mora
   aqui — mora no banco, que é o único lugar confiável.
*/

export type AcaoConta = { error?: string; ok?: string } | undefined;

function traduzirErro(msg: string): string {
  if (/acesso restrito/i.test(msg)) return "Acesso restrito a administradores.";
  if (/conta não encontrada/i.test(msg)) return "Conta não encontrada.";
  if (/usuário não encontrado/i.test(msg)) return "Usuário não encontrado.";
  if (/motivo/i.test(msg)) return "Informe o motivo (mínimo 5 caracteres).";
  if (/diferente de zero/i.test(msg)) return "Informe um valor diferente de zero.";
  if (/limite de segurança/i.test(msg)) return "Valor acima do limite permitido.";
  if (/própria conta/i.test(msg)) return "Você não pode fazer isso na própria conta.";
  if (/cartão não encontrado/i.test(msg)) return "Este cliente não tem cartão.";
  return msg;
}

export async function ajustarSaldoAdmin(
  userId: string,
  valorTexto: string,
  motivo: string
): Promise<AcaoConta> {
  await requireAdmin();

  // Aceita "1.234,56" e "1234.56".
  const limpo = valorTexto.trim().replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const valor = Number(limpo);
  if (!valorTexto.trim() || !Number.isFinite(valor) || valor === 0) {
    return { error: "Informe um valor diferente de zero. Use o sinal negativo para debitar." };
  }
  if (motivo.trim().length < 5) return { error: "Informe o motivo (mínimo 5 caracteres)." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_ajustar_saldo", {
    p_user_id: userId,
    p_valor: valor,
    p_motivo: motivo.trim(),
  });
  if (error) return { error: traduzirErro(error.message) };

  revalidatePath(`/admin/contas/${userId}`);
  revalidatePath("/admin/contas");
  return {
    ok:
      valor > 0
        ? `Crédito de ${brl(valor)} aplicado.`
        : `Débito de ${brl(Math.abs(valor))} aplicado.`,
  };
}

export async function bloquearContaAdmin(
  userId: string,
  bloquear: boolean,
  motivo: string
): Promise<AcaoConta> {
  await requireAdmin();
  if (motivo.trim().length < 5) return { error: "Informe o motivo (mínimo 5 caracteres)." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_bloquear_conta", {
    p_user_id: userId,
    p_bloquear: bloquear,
    p_motivo: motivo.trim(),
  });
  if (error) return { error: traduzirErro(error.message) };

  revalidatePath(`/admin/contas/${userId}`);
  revalidatePath("/admin/contas");
  return { ok: bloquear ? "Conta bloqueada." : "Conta desbloqueada." };
}

export async function bloquearCartaoAdmin(
  userId: string,
  bloquear: boolean,
  motivo: string
): Promise<AcaoConta> {
  await requireAdmin();
  if (motivo.trim().length < 5) return { error: "Informe o motivo (mínimo 5 caracteres)." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_bloquear_cartao", {
    p_user_id: userId,
    p_bloquear: bloquear,
    p_motivo: motivo.trim(),
  });
  if (error) return { error: traduzirErro(error.message) };

  revalidatePath(`/admin/contas/${userId}`);
  return { ok: bloquear ? "Cartão bloqueado." : "Cartão desbloqueado." };
}
