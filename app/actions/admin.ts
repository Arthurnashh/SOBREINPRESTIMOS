"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/account";
import { LOAN } from "@/lib/config";
import { brl } from "@/lib/format";
import { isValidRequest, simulate } from "@/lib/loan";
import { createClient } from "@/lib/supabase/server";

export type AdminFormState = { error?: string; success?: string } | undefined;

/**
 * Decide um pedido de empréstimo.
 *
 * Recebe os valores como argumentos, e não lê de um FormData.
 *
 * Por quê: o formulário usa `useActionState`, e nesse modo o React envia o
 * FormData capturado no momento da renderização. O `value` do botão clicado
 * (`<button name="decision" value="aprovar">`) NÃO entra nesse FormData — o
 * navegador só anexa o valor do botão no envio nativo, que aqui não acontece.
 * O resultado era `decision` vazio e a resposta "Ação inválida." em todo
 * clique de aprovar/recusar/liberar.
 *
 * Passando por argumento, o valor vem do clique e não tem como se perder.
 */
export async function decideLoan(
  decision: "aprovar" | "recusar" | "liberar",
  id: string,
  monthlyRate: number | null,
  note: string | null
): Promise<AdminFormState> {
  const { supabase } = await requireAdmin();

  const nota = note ? String(note).slice(0, 200) || null : null;

  if (!id) return { error: "Pedido inválido." };
  if (!["aprovar", "recusar", "liberar"].includes(decision)) return { error: "Ação inválida." };

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
      p_note: nota,
    });
    if (error) return { error: "Não foi possível recusar." };
    revalidatePath("/admin");
    revalidatePath("/admin/pedido/" + id);
    return { success: "Pedido recusado." };
  }

  if (decision === "liberar") {
    const { error } = await supabase.rpc("admin_set_decision", {
      p_id: id,
      p_status: "liberado",
      p_note: nota,
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
    return { success: "Pedido liberado e valor creditado na conta do cliente. O saldo fica bloqueado até a confirmação da taxa de confiança." };
  }

  if (decision === "aprovar") {
    const rate = Number(monthlyRate);
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
      p_note: nota,
    });
    if (error) return { error: "Não foi possível aprovar." };
    revalidatePath("/admin");
    revalidatePath("/admin/pedido/" + id);
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
  if (/conta de administrador/i.test(msg)) return "Contas de administrador não podem ser suspensas nem excluídas.";
  if (/tem saldo/i.test(msg)) return "A conta tem saldo. Zere o saldo antes de excluir.";
  if (/em andamento/i.test(msg)) return "Há empréstimo em andamento. Resolva antes de excluir.";
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

/* =====================================================================
   Suspender e excluir conta
   =====================================================================
   Duas ações bem diferentes:

     desativarContaAdmin  → status 'encerrada'. O cliente continua logado e
                            vê o aviso de conta suspensa. Reversível.
     excluirContaAdmin    → apaga o usuário. O CASCADE leva junto conta,
                            cartão, extrato, KYC e pedidos. Irreversível.

   Como nas demais, quem autoriza é o banco (is_admin() dentro do RPC).
*/

export type PreviaExclusao = {
  error?: string;
  dados?: {
    nome: string | null;
    cpf: string | null;
    ehAdmin: boolean;
    saldo: number;
    bloqueado: number;
    emprestimos: number;
    emprestimosAtivos: number;
    kyc: number;
    taxasPagas: number;
    transacoes: number;
    impedimentos: string[];
  };
};

type PreviaRow = {
  ok: boolean;
  nome: string | null;
  cpf: string | null;
  eh_admin: boolean;
  saldo: number | string;
  bloqueado: number | string;
  emprestimos: number;
  emprestimos_ativos: number;
  kyc: number;
  taxas_pagas: number;
  transacoes: number;
  impedimentos: string[];
};

/** O que será perdido, para o admin confirmar com número na mão. */
export async function previaExclusaoAdmin(userId: string): Promise<PreviaExclusao> {
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("admin_previa_exclusao", { p_user_id: userId });
  if (error) return { error: traduzirErro(error.message) };

  const row = data as PreviaRow | null;
  if (!row?.ok) return { error: "Não foi possível montar a prévia." };

  return {
    dados: {
      nome: row.nome,
      cpf: row.cpf,
      ehAdmin: row.eh_admin === true,
      saldo: Number(row.saldo ?? 0),
      bloqueado: Number(row.bloqueado ?? 0),
      emprestimos: Number(row.emprestimos ?? 0),
      emprestimosAtivos: Number(row.emprestimos_ativos ?? 0),
      kyc: Number(row.kyc ?? 0),
      taxasPagas: Number(row.taxas_pagas ?? 0),
      transacoes: Number(row.transacoes ?? 0),
      impedimentos: Array.isArray(row.impedimentos) ? row.impedimentos : [],
    },
  };
}

export async function desativarContaAdmin(
  userId: string,
  desativar: boolean,
  motivo: string
): Promise<AcaoConta> {
  await requireAdmin();
  if (motivo.trim().length < 5) return { error: "Informe o motivo (mínimo 5 caracteres)." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_desativar_conta", {
    p_user_id: userId,
    p_motivo: motivo.trim(),
    p_reativar: !desativar,
  });
  if (error) return { error: traduzirErro(error.message) };

  revalidatePath(`/admin/contas/${userId}`);
  revalidatePath("/admin/contas");
  revalidatePath("/conta");
  return {
    ok: desativar
      ? "Conta suspensa. O acesso do cliente fica bloqueado até a reativação."
      : "Conta reativada. O cliente volta a ter acesso normal.",
  };
}

export async function excluirContaAdmin(
  userId: string,
  motivo: string,
  forcar: boolean,
  confirmacao: string
): Promise<AcaoConta> {
  await requireAdmin();

  // Exclusão é irreversível: exigimos o motivo longo E o CPF/nome digitado.
  // O RPC também confere o motivo; aqui é para dar erro claro antes da ida ao
  // banco e evitar clique acidental.
  if (motivo.trim().length < 10) {
    return { error: "Informe o motivo com pelo menos 10 caracteres." };
  }
  if (confirmacao.trim().length < 3) {
    return { error: "Digite o CPF ou o nome do cliente para confirmar." };
  }

  const supabase = await createClient();

  // Confere a confirmação contra o cadastro real — não confiamos só no que
  // foi digitado, senão a trava vira um campo decorativo.
  const { data: previa } = await supabase.rpc("admin_previa_exclusao", { p_user_id: userId });
  const row = previa as PreviaRow | null;
  if (!row?.ok) return { error: "Conta não encontrada." };

  const digitado = confirmacao.replace(/\D/g, "");
  const cpfReal = (row.cpf ?? "").replace(/\D/g, "");
  const nomeReal = (row.nome ?? "").trim().toLowerCase();
  const bateCpf = digitado.length >= 11 && cpfReal && digitado === cpfReal;
  const bateNome = nomeReal.length >= 3 && confirmacao.trim().toLowerCase() === nomeReal;

  if (!bateCpf && !bateNome) {
    return { error: "A confirmação não bate com o CPF nem com o nome completo do cliente." };
  }

  const { error } = await supabase.rpc("admin_excluir_conta", {
    p_user_id: userId,
    p_motivo: motivo.trim(),
    p_forcar: forcar,
  });
  if (error) return { error: traduzirErro(error.message) };

  revalidatePath("/admin/contas");
  revalidatePath("/admin");
  return { ok: "Conta excluída. O registro ficou na trilha de auditoria." };
}
