"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type CobrancaState =
  | {
      error?: string;
      cobranca?: {
        linha_digitavel: string;
        nosso_numero: string;
        valor: number;
        vencimento: string;
        qr_code: string;
      };
    }
  | undefined;

/**
 * Gera (ou recupera) o boleto/PIX de uma parcela.
 *
 * IMPORTANTE: a cobrança é marcada como `pendente` no banco — ela existe para
 * consulta e NÃO é pagável até a integração com o meio de pagamento ser
 * configurada. O PIX copia-e-cola abaixo é montado apenas para exibição; não é
 * um BR Code registrado e nenhum valor será recebido por ele.
 */
export async function gerarCobrancaParcela(installmentId: string): Promise<CobrancaState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Entre novamente." };

  const { data, error } = await supabase.rpc("loan_installment_charge", {
    p_installment_id: installmentId,
  });

  if (error) {
    const msg = error.message.replace(/^.*?:\s*/, "");
    return { error: msg || "Não foi possível gerar a cobrança." };
  }

  const d = data as Record<string, unknown>;
  revalidatePath("/conta/emprestimos");

  return {
    cobranca: {
      linha_digitavel: String(d.linha_digitavel ?? ""),
      nosso_numero: String(d.nosso_numero ?? ""),
      valor: Number(d.valor ?? 0),
      vencimento: String(d.vencimento ?? ""),
      // PIX demonstrativo: identificador legível, sem valor transacionável.
      qr_code: `PIX-DEMONSTRATIVO|${d.nosso_numero ?? ""}|${Number(d.valor ?? 0).toFixed(2)}|SEM-GATEWAY-CONFIGURADO`,
    },
  };
}
