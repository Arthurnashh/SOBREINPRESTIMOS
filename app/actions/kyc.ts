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
