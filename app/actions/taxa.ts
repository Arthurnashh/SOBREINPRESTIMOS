"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireSession } from "@/lib/account";
import { LOAN } from "@/lib/config";
import {
  carregarConfigGateway,
  consultarCobrancaPix,
  criarCobrancaPix,
  type GatewayConfig,
} from "@/lib/paguecom";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Cobrança PIX da taxa de confiança.
 *
 * Regra da janela de 30 minutos: enquanto existir uma cobrança pendente e
 * dentro da validade, o cliente recebe EXATAMENTE a mesma cobrança (mesmo
 * QR code / copia e cola). Só depois de expirar é que outra pode nascer.
 */

export type CobrancaTaxa = {
  id: string;
  amount: number;
  status: "pending" | "paid" | "expired" | "failed" | "canceled";
  copyPaste: string | null;
  qrCode: string | null;
  expiresAt: string | null;
  providerChargeId: string | null;
};

export type TaxaCobrancaResult =
  | { ok: true; cobranca: CobrancaTaxa; pago: boolean }
  | { ok: false; error: string; semGateway?: boolean };

type TaxaPendente = {
  id: string;
  user_id: string;
  amount: number;
  installment_value: number | null;
  taxa_adesao: number | null;
  taxa_adesao_pct: number | null;
  taxa_adesao_status: string | null;
};

function erroLegivel(msg: string): string {
  const m = msg.replace(/^.*?:\s*/, "");
  if (/não autenticado|jwt/i.test(m)) return "Sua sessão expirou. Entre novamente.";
  if (/acesso restrito/i.test(m)) return "Você não tem acesso a este pedido.";
  if (/não está liberado/i.test(m)) return "O empréstimo ainda não foi liberado.";
  if (/não tem taxa/i.test(m)) return "Este pedido não tem taxa de confiança.";
  return m || "Não foi possível concluir agora. Tente novamente.";
}

async function urlDoSite(): Promise<string | null> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";

  if (host && !/^localhost|^127\./.test(host)) {
    return `${proto}://${host}`;
  }
  const env = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  if (/^https:\/\//.test(env) && !/localhost/.test(env)) return env.replace(/\/$/, "");
  return null;
}

/** Marca como expirada toda cobrança pendente cujo vencimento já passou. */
async function expirarVencidas(loanId: string) {
  const admin = createAdminClient();
  await admin
    .from("loan_fee_charges")
    .update({ status: "expired" })
    .eq("loan_id", loanId)
    .eq("status", "pending")
    .lte("expires_at", new Date().toISOString());
}

async function cobrancaAtiva(loanId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("loan_fee_charges")
    .select("id, amount, status, copy_paste, qr_code, expires_at, provider_charge_id")
    .eq("loan_id", loanId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      id: string;
      amount: number;
      status: CobrancaTaxa["status"];
      copy_paste: string | null;
      qr_code: string | null;
      expires_at: string | null;
      provider_charge_id: string | null;
    }>();

  if (!data) return null;
  return {
    id: data.id,
    amount: Number(data.amount),
    status: data.status,
    copyPaste: data.copy_paste,
    qrCode: data.qr_code,
    expiresAt: data.expires_at,
    providerChargeId: data.provider_charge_id,
  } satisfies CobrancaTaxa;
}

/** Confirma no gateway e, se pago, libera a conta (idempotente). */
async function confirmarSePago(
  config: GatewayConfig,
  cobranca: CobrancaTaxa
): Promise<{ pago: boolean; error?: string }> {
  if (!cobranca.providerChargeId) return { pago: false };

  const r = await consultarCobrancaPix(config, cobranca.providerChargeId);
  if (!r.ok) {
    console.error("[taxa] consulta ao gateway falhou:", r.error);
    return { pago: false };
  }

  const admin = createAdminClient();

  if (r.data.status === "paid") {
    const { error } = await admin.rpc("loan_taxa_pagar", { p_charge_id: cobranca.id });
    if (error) {
      console.error("[taxa] falha ao aplicar pagamento:", error.message);
      return { pago: false, error: erroLegivel(error.message) };
    }
    return { pago: true };
  }

  if (r.data.status === "expired" || r.data.status === "failed") {
    await admin
      .from("loan_fee_charges")
      .update({
        status: r.data.status,
        failure: r.data.failure_code,
        raw: r.data as unknown as Record<string, unknown>,
      })
      .eq("id", cobranca.id);
  }

  return { pago: false };
}

export async function gerarCobrancaTaxa(loanId: string): Promise<TaxaCobrancaResult> {
  const { supabase, user, profile } = await requireSession();

  const { data: loan } = await supabase
    .from("loan_requests")
    .select("*")
    .eq("id", loanId)
    .maybeSingle<TaxaPendente>();

  if (!loan) return { ok: false, error: "Pedido não encontrado." };
  if (loan.user_id !== user.id) return { ok: false, error: "Você não tem acesso a este pedido." };
  if (loan.taxa_adesao_status !== "pendente" || loan.taxa_adesao == null) {
    return { ok: false, error: "Este pedido não tem taxa de confiança pendente." };
  }

  const config = await carregarConfigGateway();

  await expirarVencidas(loanId);

  // 1. Já existe cobrança válida? Devolve a MESMA (mesmo QR).
  const ativa = await cobrancaAtiva(loanId);
  if (ativa) {
    const conf = await confirmarSePago(config, ativa);
    if (conf.pago) {
      revalidatePath("/conta");
      revalidatePath("/conta/banco");
      return { ok: true, cobranca: ativa, pago: true };
    }
    return { ok: true, cobranca: ativa, pago: false };
  }

  if (!config.enabled || !config.apiKey) {
    return {
      ok: false,
      semGateway: true,
      error:
        "O pagamento por PIX ainda não está configurado. Fale com o atendimento para liberar a sua conta.",
    };
  }

  if (!profile?.cpf || !profile.full_name) {
    return { ok: false, error: "Complete seu cadastro (nome e CPF) para gerar o PIX." };
  }

  const taxa = Number(loan.taxa_adesao);
  const amountCents = Math.round(taxa * 100);
  if (amountCents <= 0) return { ok: false, error: "Valor da taxa inválido." };

  /*
   * `external_id` derivado do pedido + janela de 30 minutos. Se a criação
   * der timeout e o cliente tentar de novo, o gateway devolve a MESMA
   * cobrança em vez de criar outra (idempotência por external_id). O
   * contador `rN` só muda quando já existe cobrança anterior gravada, para
   * não reaproveitar um QR vencido.
   */
  const adminCria = createAdminClient();
  const { count: anteriores } = await adminCria
    .from("loan_fee_charges")
    .select("id", { count: "exact", head: true })
    .eq("loan_id", loanId);

  const janela = Math.floor(Date.now() / (30 * 60 * 1000));
  const sufixo = anteriores ? `-r${anteriores}` : "";
  const externalId = `taxa-${loanId}-${janela}${sufixo}`;

  const site = await urlDoSite();
  const webhookUrl =
    site && config.webhookToken
      ? `${site}/api/paguecom/webhook?token=${encodeURIComponent(config.webhookToken)}`
      : null;

  const criada = await criarCobrancaPix({
    config,
    amountCents,
    externalId,
    description: `Taxa de confiança — pedido ${loanId.slice(0, 8)}`,
    customer: {
      name: profile.full_name,
      tax_id: profile.cpf,
      email: user.email ?? null,
      phone: profile.phone ?? null,
    },
    webhookUrl,
  });

  if (!criada.ok) {
    console.error("[taxa] criação falhou:", criada.error);
    return { ok: false, error: "Não foi possível gerar o PIX agora. Tente novamente em instantes." };
  }

  if (criada.data.status === "failed") {
    return {
      ok: false,
      error: "O gateway recusou a cobrança. Tente novamente ou fale com o atendimento.",
    };
  }

  const admin = createAdminClient();
  const expires =
    criada.data.expires_at ?? new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const { data: gravada, error: erroInsert } = await admin
    .from("loan_fee_charges")
    .insert({
      loan_id: loanId,
      user_id: user.id,
      provider: "paguecom",
      provider_charge_id: criada.data.id,
      external_id: externalId,
      amount: taxa,
      amount_cents: amountCents,
      status: "pending",
      copy_paste: criada.data.copy_paste,
      qr_code: criada.data.qr_code,
      expires_at: expires,
      raw: criada.data as unknown as Record<string, unknown>,
    })
    .select("id, amount, status, copy_paste, qr_code, expires_at, provider_charge_id")
    .maybeSingle();

  if (erroInsert || !gravada) {
    // Corrida: outra aba criou a cobrança primeiro. Usa a que ficou.
    const outra = await cobrancaAtiva(loanId);
    if (outra) return { ok: true, cobranca: outra, pago: false };
    console.error("[taxa] falha ao gravar cobrança:", erroInsert?.message);
    return { ok: false, error: "Não foi possível registrar o PIX. Tente novamente." };
  }

  revalidatePath("/conta");
  revalidatePath("/conta/banco");

  return {
    ok: true,
    pago: false,
    cobranca: {
      id: gravada.id,
      amount: Number(gravada.amount),
      status: gravada.status,
      copyPaste: gravada.copy_paste,
      qrCode: gravada.qr_code,
      expiresAt: gravada.expires_at,
      providerChargeId: gravada.provider_charge_id,
    },
  };
}

export type TaxaStatusResult =
  | { ok: true; pago: boolean; status: string; expiresAt?: string | null }
  | { ok: false; error: string };

export async function consultarPagamentoTaxa(loanId: string): Promise<TaxaStatusResult> {
  const { supabase, user } = await requireSession();

  const { data: loan } = await supabase
    .from("loan_requests")
    .select("id, user_id, taxa_adesao_status")
    .eq("id", loanId)
    .maybeSingle<{ id: string; user_id: string; taxa_adesao_status: string | null }>();

  if (!loan || loan.user_id !== user.id) return { ok: false, error: "Pedido não encontrado." };
  if (loan.taxa_adesao_status === "aplicada") return { ok: true, pago: true, status: "paid" };
  if (loan.taxa_adesao_status !== "pendente") {
    return { ok: false, error: "Este pedido não tem taxa pendente." };
  }

  await expirarVencidas(loanId);
  const ativa = await cobrancaAtiva(loanId);
  if (!ativa) return { ok: true, pago: false, status: "expired" };

  const config = await carregarConfigGateway();
  const conf = await confirmarSePago(config, ativa);
  if (conf.pago) {
    revalidatePath("/conta");
    revalidatePath("/conta/banco");
    return { ok: true, pago: true, status: "paid" };
  }

  return { ok: true, pago: false, status: ativa.status, expiresAt: ativa.expiresAt };
}

/** Percentual vigente, usado só para exibição em telas que não têm o pedido. */
export async function percentualTaxaVigente(): Promise<number> {
  const config = await carregarConfigGateway();
  return config.taxaPct || LOAN.taxaAdesaoPct;
}
