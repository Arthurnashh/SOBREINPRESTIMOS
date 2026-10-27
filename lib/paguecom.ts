import { createAdminClient } from "./supabase/admin";

/**
 * Integração com o gateway PagueCom (https://app.paguecom.link/docs).
 *
 * Endpoints usados:
 *   POST /v1/charges        cria a cobrança Pix e devolve copia e cola + QR
 *   GET  /v1/charges/{id}   consulta o estado atual (pending/paid/expired)
 *
 * A credencial é única para a loja e fica em `app_settings.gateway`, editável
 * no painel admin (/admin/config). Nada de chave no código ou no cliente.
 */

export type GatewayConfig = {
  apiKey: string;
  environment: "producao" | "sandbox";
  enabled: boolean;
  taxaPct: number;
  webhookToken: string;
};

export type CobrancaPix = {
  id: string;
  status: "pending" | "paid" | "expired" | "failed";
  amount_cents: number;
  external_id: string;
  copy_paste: string | null;
  qr_code: string | null;
  expires_at: string | null;
  paid_at: string | null;
  failure_code: string | null;
};

export const GATEWAY_PADRAO: GatewayConfig = {
  apiKey: "",
  environment: "producao",
  enabled: false,
  taxaPct: 0.5,
  webhookToken: "",
};

export async function carregarConfigGateway(): Promise<GatewayConfig> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", "gateway")
      .maybeSingle<{ value: Record<string, unknown> }>();

    const v = (data?.value ?? {}) as Record<string, unknown>;
    const env = v.environment === "sandbox" ? "sandbox" : "producao";
    const pct = Number(v.taxa_pct ?? 0.5);

    return {
      apiKey: String(v.api_key ?? ""),
      environment: env,
      enabled: v.enabled === true,
      taxaPct: Number.isFinite(pct) && pct > 0 && pct <= 1 ? pct : 0.5,
      webhookToken: String(v.webhook_token ?? ""),
    };
  } catch (e) {
    console.error("[paguecom] falha ao ler a configuração:", e);
    return GATEWAY_PADRAO;
  }
}

function baseUrl(environment: GatewayConfig["environment"]) {
  return environment === "sandbox"
    ? "https://sandbox.paguecom.link/v1"
    : "https://api.paguecom.link/v1";
}

type CriarArgs = {
  config: GatewayConfig;
  amountCents: number;
  externalId: string;
  description: string;
  customer: { name: string; tax_id: string; email?: string | null; phone?: string | null };
  webhookUrl?: string | null;
};

type Resultado<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Cria a cobrança. O `external_id` é a chave de idempotência do gateway:
 * repetir o pedido com o mesmo valor/documento devolve a mesma cobrança em
 * vez de gerar outra. Por isso quem chama deve reutilizar o mesmo id.
 */
export async function criarCobrancaPix({
  config,
  amountCents,
  externalId,
  description,
  customer,
  webhookUrl,
}: CriarArgs): Promise<Resultado<CobrancaPix>> {
  if (!config.apiKey) {
    return { ok: false, error: "gateway sem chave de API configurada" };
  }

  const body: Record<string, unknown> = {
    payment_method: "pix",
    amount_cents: amountCents,
    description: description.slice(0, 140),
    external_id: externalId.slice(0, 128),
    expires_in: 1800, // 30 minutos: mesma janela de reutilização do QR
    customer: {
      name: customer.name.slice(0, 100),
      tax_id: customer.tax_id.replace(/\D/g, ""),
      ...(customer.email ? { email: customer.email } : {}),
      ...(customer.phone ? { phone: customer.phone } : {}),
    },
    metadata: { origem: "taxa_confianca", external_id: externalId },
  };
  if (webhookUrl) body.webhook_url = webhookUrl;

  let res: Response;
  try {
    res = await fetch(`${baseUrl(config.environment)}/charges`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, error: `falha de rede com o gateway: ${(e as Error).message}` };
  }

  const texto = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(texto) as Record<string, unknown>;
  } catch {
    /* resposta não-JSON: tratada abaixo */
  }

  if (!res.ok) {
    const err = (json.error ?? {}) as Record<string, unknown>;
    const code = String(err.code ?? "");
    const msg = String(err.message ?? texto.slice(0, 200));
    console.error("[paguecom] criação recusada:", res.status, code, msg);
    return { ok: false, error: `gateway recusou (${res.status}${code ? ` ${code}` : ""}): ${msg}` };
  }

  const pix = (json.pix ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    data: {
      id: String(json.id ?? ""),
      status: String(json.status ?? "pending") as CobrancaPix["status"],
      amount_cents: Number(json.amount_cents ?? amountCents),
      external_id: String(json.external_id ?? externalId),
      copy_paste: (pix.copy_paste as string) ?? null,
      qr_code: (pix.qr_code_base64 as string) ?? null,
      expires_at: (pix.expires_at as string) ?? null,
      paid_at: (json.paid_at as string) ?? null,
      failure_code: (json.failure_code as string) ?? null,
    },
  };
}

export async function consultarCobrancaPix(
  config: GatewayConfig,
  providerChargeId: string
): Promise<Resultado<CobrancaPix>> {
  if (!config.apiKey) return { ok: false, error: "gateway sem chave de API configurada" };

  let res: Response;
  try {
    res = await fetch(
      `${baseUrl(config.environment)}/charges/${encodeURIComponent(providerChargeId)}`,
      {
        headers: { Authorization: `Bearer ${config.apiKey}` },
        cache: "no-store",
      }
    );
  } catch (e) {
    return { ok: false, error: `falha de rede com o gateway: ${(e as Error).message}` };
  }

  const texto = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(texto) as Record<string, unknown>;
  } catch {
    /* resposta não-JSON */
  }

  if (!res.ok) {
    const err = (json.error ?? {}) as Record<string, unknown>;
    return {
      ok: false,
      error: `gateway respondeu ${res.status} ${String(err.code ?? "")}: ${String(
        err.message ?? texto.slice(0, 200)
      )}`,
    };
  }

  const pix = (json.pix ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    data: {
      id: String(json.id ?? providerChargeId),
      status: String(json.status ?? "pending") as CobrancaPix["status"],
      amount_cents: Number(json.amount_cents ?? 0),
      external_id: String(json.external_id ?? ""),
      copy_paste: (pix.copy_paste as string) ?? null,
      qr_code: (pix.qr_code_base64 as string) ?? null,
      expires_at: (pix.expires_at as string) ?? null,
      paid_at: (json.paid_at as string) ?? null,
      failure_code: (json.failure_code as string) ?? null,
    },
  };
}
