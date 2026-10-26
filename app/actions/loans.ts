"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isValidRequest } from "@/lib/loan";

export type LoanFormState = { error?: string } | undefined;

export async function requestLoan(_prev: LoanFormState, formData: FormData): Promise<LoanFormState> {
  const amount = Number(formData.get("amount"));
  const installments = Number(formData.get("installments"));

  if (!isValidRequest(amount, installments)) {
    return { error: "Escolha um valor entre R$ 1.000 e R$ 10.000 e um prazo válido." };
  }
  if (formData.get("confirm") !== "on") {
    return { error: "Confirme que leu as condições da simulação." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/entrar?next=/conta/emprestimo");

  // Crédito só para identidade verificada — mesma regra da conta bancária.
  const { data: podeMovimentar } = await supabase.rpc("kyc_pode_movimentar", { p_user_id: null });
  if (podeMovimentar !== true) {
    return {
      error:
        "Conclua sua verificação de identidade para pedir empréstimo. Leva poucos minutos em Minha verificação.",
    };
  }

  const { error } = await supabase.from("loan_requests").insert({ amount, installments });

  if (error) {
    if (error.code === "23505") {
      return { error: "Você já tem um pedido em andamento. Aguarde a análise." };
    }
    return { error: "Não foi possível enviar o pedido. Tente novamente." };
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
