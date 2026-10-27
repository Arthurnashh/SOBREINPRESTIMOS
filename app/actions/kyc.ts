"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { getKyc, type FaceAngle, type KycDocType, type KycProofType } from "@/lib/kyc";
import type { KycSlot } from "@/lib/kyc/service";

async function ctx() {
  const { user } = await requireSession();
  const supabase = await createClient();
  return { user, supabase, kyc: getKyc(supabase) };
}

export type KycState = { error?: string; ok?: string } | undefined;

/* ------------------------------ etapas ------------------------------ */

export async function salvarDadosKyc(_p: KycState, formData: FormData): Promise<KycState> {
  const { kyc } = await ctx();

  const fullName = String(formData.get("full_name") ?? "").trim().replace(/\s+/g, " ");
  const birthDate = String(formData.get("birth_date") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").replace(/\D/g, "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const motherName = String(formData.get("mother_name") ?? "").trim().replace(/\s+/g, " ");

  const r = await kyc.salvarDados({ fullName, birthDate, phone, email, motherName });
  if (!r.ok) return { error: r.error };

  revalidatePath("/conta/verificacao");
  return { ok: "Dados salvos." };
}

export async function salvarEnderecoKyc(_p: KycState, formData: FormData): Promise<KycState> {
  const { kyc } = await ctx();

  const r = await kyc.salvarEndereco({
    cep: String(formData.get("cep") ?? "").replace(/\D/g, ""),
    address: String(formData.get("address") ?? "").trim(),
    number: String(formData.get("address_number") ?? "").trim(),
    extra: String(formData.get("address_extra") ?? "").trim(),
    neighborhood: String(formData.get("neighborhood") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    state: String(formData.get("state") ?? "").trim().toUpperCase(),
  });
  if (!r.ok) return { error: r.error };

  revalidatePath("/conta/verificacao");
  return { ok: "Endereço salvo." };
}

export async function salvarDocumentoKyc(_p: KycState, formData: FormData): Promise<KycState> {
  const { kyc } = await ctx();

  const tipo = String(formData.get("doc_type") ?? "") as KycDocType;
  const r = await kyc.salvarDocumento({
    type: tipo,
    number: String(formData.get("doc_number") ?? "").trim(),
    issuer: String(formData.get("doc_issuer") ?? "").trim(),
    state: String(formData.get("doc_state") ?? "").trim().toUpperCase(),
  });
  if (!r.ok) return { error: r.error };

  revalidatePath("/conta/verificacao");
  return { ok: "Documento salvo." };
}

export async function salvarProvaTipo(tipo: KycProofType): Promise<{ ok: boolean; error?: string }> {
  const { kyc } = await ctx();
  const r = await kyc.salvarComprovanteTipo(tipo);
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath("/conta/verificacao");
  return { ok: true };
}

/* ------------------------------ arquivos ----------------------------- */

/**
 * Registra no banco o caminho de um arquivo JÁ enviado ao Storage.
 *
 * O envio em si acontece no navegador (lib/kyc/enviar-direto.ts), porque o
 * Next.js limita o corpo de Server Actions a 1 MB e foto de celular tem 3–8 MB.
 * Aqui só gravamos o caminho, que é uma operação leve.
 */
export async function registrarArquivoKyc(
  slot: KycSlot,
  path: string,
  detalhe?: string
): Promise<{ ok: boolean; error?: string; detalhe?: string }> {
  const { kyc } = await ctx();

  if (!path) return { ok: false, error: "Caminho do arquivo ausente." };

  const r = await kyc.registrarArquivo(slot, path);
  if (!r.ok) return { ok: false, error: r.error };

  revalidatePath("/conta/verificacao");
  return { ok: true, detalhe };
}

export async function enviarArquivoKyc(
  slot: KycSlot,
  arquivo: File
): Promise<{ ok: boolean; error?: string }> {
  const { user, kyc } = await ctx();

  const r = await kyc.enviarArquivo(slot, arquivo, user.id);
  if (!r.ok) return { ok: false, error: r.error };

  revalidatePath("/conta/verificacao");
  return { ok: true };
}

export async function enviarFaceKyc(
  angle: FaceAngle,
  arquivo: File
): Promise<{ ok: boolean; error?: string }> {
  const { user, kyc } = await ctx();

  const r = await kyc.enviarFace(angle, arquivo, user.id);
  if (!r.ok) return { ok: false, error: r.error };

  return { ok: true };
}

export async function registrarBiometriaKyc(dados: {
  livenessPassed: boolean;
  livenessScore: number;
  qualityScore: number;
}): Promise<{ ok: boolean; error?: string }> {
  const { kyc } = await ctx();
  const r = await kyc.registrarBiometria(dados);
  if (!r.ok) return { ok: false, error: r.error };

  revalidatePath("/conta/verificacao");
  return { ok: true };
}

export async function urlArquivoKyc(path: string): Promise<string | null> {
  const { kyc } = await ctx();
  return kyc.urlAssinada(path);
}

/* ------------------------------- envio ------------------------------- */

export async function enviarKycParaAnalise(): Promise<{ ok: boolean; error?: string }> {
  const { kyc } = await ctx();
  const r = await kyc.enviarParaAnalise();
  if (!r.ok) return { ok: false, error: r.error };

  // Triagem automática, depois de o envio ter sido aceito.
  //
  // Falha aqui NÃO desfaz o envio: a verificação já está na fila e o admin
  // consegue analisar manualmente. O `catch` existe porque a triagem faz
  // chamada de rede, e uma falha dela não pode aparecer como erro para o
  // cliente que acabou de enviar os documentos.
  try {
    const { triarKyc } = await import("./kyc-ia");
    await triarKyc();
  } catch {
    // silêncio proposital: o caso fica na fila manual
  }

  revalidatePath("/conta/verificacao");
  revalidatePath("/conta/banco");
  revalidatePath("/conta");
  return { ok: true };
}

/* ------------------------------- admin ------------------------------- */

export async function decidirKyc(
  userId: string,
  decisao: "aprovado" | "recusado" | "pendente",
  nota?: string
): Promise<{ ok: boolean; error?: string }> {
  const { supabase } = await requireSession();
  const kyc = getKyc(supabase);

  const r = await kyc.decidir(userId, decisao, nota);
  if (!r.ok) return { ok: false, error: r.error };

  revalidatePath("/admin/kyc");
  revalidatePath("/admin");
  return { ok: true };
}

export async function urlArquivoKycAdmin(path: string): Promise<string | null> {
  const { supabase } = await requireSession();
  const kyc = getKyc(supabase);
  return kyc.urlAssinada(path, 600);
}
