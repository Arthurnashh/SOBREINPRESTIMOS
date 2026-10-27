"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/account";

export type GatewayFormState = { error?: string; success?: string } | undefined;

/**
 * Salva a configuração do gateway (PagueCom) no banco.
 *
 * A chave nunca volta para o navegador: o campo em branco mantém a que já
 * está gravada. A leitura/gravação passa por RPC SECURITY DEFINER, que
 * confere `is_admin()` antes de tocar em app_settings.
 */
export async function salvarGateway(
  _prev: GatewayFormState,
  formData: FormData
): Promise<GatewayFormState> {
  const { supabase } = await requireAdmin();

  const apiKey = String(formData.get("api_key") ?? "").trim();
  const segredo = String(formData.get("webhook_secret") ?? "").trim();
  const environment = String(formData.get("environment") ?? "producao");
  const enabled = formData.get("enabled") === "on";
  const pctBruto = Number(String(formData.get("taxa_pct") ?? "50").replace(",", "."));

  if (!["producao", "sandbox"].includes(environment)) {
    return { error: "Ambiente inválido." };
  }
  if (!Number.isFinite(pctBruto) || pctBruto <= 0 || pctBruto > 100) {
    return { error: "O percentual da taxa deve ficar entre 0,01% e 100%." };
  }
  if (enabled && !apiKey) {
    // Só barra quando ainda não existe chave gravada; nesse caso a leitura
    // abaixo devolve tem_chave = false.
    const { data } = await supabase.rpc("admin_gateway_config_get");
    const cfg = (data ?? {}) as { tem_chave?: boolean };
    if (!cfg.tem_chave) {
      return { error: "Para ativar o pagamento, informe a chave de API do PagueCom." };
    }
  }

  const { error } = await supabase.rpc("admin_gateway_config_set", {
    p_api_key: apiKey || null,
    p_webhook_secret: segredo || null,
    p_environment: environment,
    p_enabled: enabled,
    p_taxa_pct: pctBruto / 100,
  });

  if (error) {
    const msg = error.message.replace(/^.*?:\s*/, "");
    return { error: msg || "Não foi possível salvar a configuração." };
  }

  revalidatePath("/admin/config");
  revalidatePath("/conta");
  revalidatePath("/conta/banco");
  return { success: "Configuração salva." };
}
