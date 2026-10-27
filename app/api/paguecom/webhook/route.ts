import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { carregarConfigGateway, consultarCobrancaPix } from "@/lib/paguecom";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function tokenIgual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  if (x.length !== y.length) return false;
  try {
    return timingSafeEqual(x, y);
  } catch {
    return false;
  }
}

/**
 * Webhook do PagueCom.
 *
 * Por `charge.*`, o aviso não chega com `X-Signature`: a URL da cobrança leva
 * o token (?token=...) e quem a registrou identifica a origem. Antes de agir,
 * o estado é sempre reconfirmado em GET /v1/charges/{id} com a chave da loja —
 * assim o aviso é validado contra a verdade do gateway, não só contra o token.
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token") ?? "";
  const config = await carregarConfigGateway();

  if (!config.webhookToken || !tokenIgual(token, config.webhookToken)) {
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

  // Localiza a cobrança desta loja pelo provider_charge_id ou external_id.
  const { data: porProvider } = await admin
    .from("loan_fee_charges")
    .select("id, status, provider_charge_id")
    .eq("provider_charge_id", providerId)
    .maybeSingle<{ id: string; status: string; provider_charge_id: string | null }>();

  const cobranca =
    porProvider ??
    (await admin
      .from("loan_fee_charges")
      .select("id, status, provider_charge_id")
      .eq("external_id", externalId)
      .maybeSingle<{ id: string; status: string; provider_charge_id: string | null }>()
    ).data;

  if (!cobranca) {
    // Evento de outra cobrança da mesma loja (ou de outra integração).
    return NextResponse.json({ ok: true, ignored: true });
  }

  // A verdade vem sempre da consulta autenticada ao gateway.
  const confirmada = await consultarCobrancaPix(config, cobranca.provider_charge_id || providerId);
  if (!confirmada.ok) {
    console.error("[webhook] consulta falhou:", confirmada.error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  if (evento === "charge.paid") {
    const { error } = await admin.rpc("loan_taxa_pagar", { p_charge_id: cobranca.id });
    if (error) {
      console.error("[webhook] falha ao aplicar pagamento:", error.message);
      return NextResponse.json({ ok: false }, { status: 500 });
    }
    return NextResponse.json({ ok: true, pago: true });
  }

  if (evento === "charge.expired" || evento === "charge.failed") {
    if (confirmada.data.status === "expired" || confirmada.data.status === "failed") {
      await admin
        .from("loan_fee_charges")
        .update({
          status: confirmada.data.status,
          failure: confirmada.data.failure_code,
        })
        .eq("id", cobranca.id)
        .eq("status", "pending");
    }
  }

  // charge.created / charge.refunded / outros: nada a fazer no backend local.
  // O estado pago/expirado/falhou é sempre confirmado pela consulta acima.
  return NextResponse.json({ ok: true, ignored: evento, status: confirmada.data.status });
}
