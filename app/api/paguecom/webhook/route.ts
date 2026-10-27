import { NextResponse } from "next/server";
import { carregarConfigGateway, consultarCobrancaPix } from "@/lib/paguecom";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Webhook do PagueCom.
 *
 * A `webhook_url` informada por cobrança não é assinada (não pertence a um
 * endpoint do painel), então o token na própria URL identifica a origem e,
 * antes de agir, o estado é confirmado em GET /v1/charges/{id}. Assim um
 * aviso forjado não libera conta nenhuma.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token") ?? "";
  const config = await carregarConfigGateway();

  if (!config.webhookToken || token !== config.webhookToken) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const evento = String(corpo.event ?? "");
  const data = (corpo.data ?? {}) as Record<string, unknown>;
  const providerId = String(data.id ?? "");
  const externalId = String(data.external_id ?? "");

  if (!providerId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const admin = createAdminClient();
  const { data: porProvider } = await admin
    .from("loan_fee_charges")
    .select("id, status, provider_charge_id")
    .eq("provider_charge_id", providerId)
    .maybeSingle<{ id: string; status: string; provider_charge_id: string | null }>();

  const cobranca =
    porProvider ??
    (
      await admin
        .from("loan_fee_charges")
        .select("id, status, provider_charge_id")
        .eq("external_id", externalId)
        .maybeSingle<{ id: string; status: string; provider_charge_id: string | null }>()
    ).data;

  if (!cobranca) {
    // Evento de outra cobrança (outra integração da mesma loja).
    return NextResponse.json({ ok: true, ignored: true });
  }

  // A verdade vem sempre da consulta autenticada ao gateway.
  const confirmada = await consultarCobrancaPix(
    config,
    cobranca.provider_charge_id || providerId
  );
  if (!confirmada.ok) {
    console.error("[webhook] consulta falhou:", confirmada.error);
    // 5xx faz o gateway reenviar depois.
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  if (confirmada.data.status === "paid") {
    const { error } = await admin.rpc("loan_taxa_pagar", { p_charge_id: cobranca.id });
    if (error) {
      console.error("[webhook] falha ao aplicar pagamento:", error.message);
      return NextResponse.json({ ok: false }, { status: 500 });
    }
    return NextResponse.json({ ok: true, pago: true });
  }

  if (confirmada.data.status === "expired" || confirmada.data.status === "failed") {
    await admin
      .from("loan_fee_charges")
      .update({ status: confirmada.data.status, failure: confirmada.data.failure_code })
      .eq("id", cobranca.id)
      .eq("status", "pending");
  }

  return NextResponse.json({ ok: true, evento, status: confirmada.data.status });
}
