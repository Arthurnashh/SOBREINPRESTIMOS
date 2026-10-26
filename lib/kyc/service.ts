import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mensagemKyc,
  type FaceAngle,
  type KycDetalhe,
  type KycDocType,
  type KycFilaItem,
  type KycProofType,
  type KycResumo,
  type KycStatus,
  type KycSubmission,
} from "./types";

export type Result<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Slot de arquivo aceito pelo banco. */
export type KycSlot =
  | "doc_frente"
  | "doc_verso"
  | "comprovante"
  | "selfie_doc"
  | "face_frontal"
  | "face_direita"
  | "face_esquerda"
  | "face_sorriso"
  | "face_perto";

const SLOT_BY_ANGLE: Record<FaceAngle, KycSlot> = {
  frontal: "face_frontal",
  direita: "face_direita",
  esquerda: "face_esquerda",
  sorriso: "face_sorriso",
  perto: "face_perto",
};

export class KycService {
  constructor(private supabase: SupabaseClient) {}

  /* ------------------------------ leitura ------------------------------ */

  async meuStatus(): Promise<Result<KycSubmission>> {
    const { data, error } = await this.supabase.rpc("kyc_meu_status");
    if (error) return { ok: false, error: mensagemKyc(error.message) };

    const k = data as Record<string, unknown>;
    return {
      ok: true,
      data: {
        status: k.status as KycStatus,
        fullName: (k.full_name as string) ?? null,
        cpf: (k.cpf as string) ?? null,
        birthDate: (k.birth_date as string) ?? null,
        phone: (k.phone as string) ?? null,
        email: (k.email as string) ?? null,
        motherName: (k.mother_name as string) ?? null,
        cep: (k.cep as string) ?? null,
        address: (k.address as string) ?? null,
        addressNumber: (k.address_number as string) ?? null,
        addressExtra: (k.address_extra as string) ?? null,
        neighborhood: (k.neighborhood as string) ?? null,
        city: (k.city as string) ?? null,
        state: (k.state as string) ?? null,
        docType: (k.doc_type as KycDocType) ?? null,
        docNumber: (k.doc_number as string) ?? null,
        docIssuer: (k.doc_issuer as string) ?? null,
        docState: (k.doc_state as string) ?? null,
        proofType: (k.proof_type as KycProofType) ?? null,
        temDocFrente: Boolean(k.tem_doc_frente),
        temDocVerso: Boolean(k.tem_doc_verso),
        temComprovante: Boolean(k.tem_comprovante),
        temSelfieDoc: Boolean(k.tem_selfie_doc),
        temBiometria: Boolean(k.tem_biometria),
        livenessPassed: Boolean(k.liveness_passed),
        livenessScore: k.liveness_score === null ? null : Number(k.liveness_score),
        qualityScore: k.quality_score === null ? null : Number(k.quality_score),
        reviewNote: (k.review_note as string) ?? null,
        submittedAt: (k.submitted_at as string) ?? null,
        reviewedAt: (k.reviewed_at as string) ?? null,
        podeMovimentar: Boolean(k.pode_movimentar),
      },
    };
  }

  /* ------------------------------- escrita ------------------------------ */

  async salvarDados(dados: {
    fullName: string;
    birthDate: string;
    phone: string;
    email: string;
    motherName: string;
  }): Promise<Result> {
    const { error } = await this.supabase.rpc("kyc_salvar_dados", {
      p_full_name: dados.fullName,
      p_birth_date: dados.birthDate,
      p_phone: dados.phone,
      p_email: dados.email,
      p_mother_name: dados.motherName,
    });
    if (error) return { ok: false, error: mensagemKyc(error.message) };
    return { ok: true, data: undefined };
  }

  async salvarEndereco(dados: {
    cep: string;
    address: string;
    number: string;
    extra?: string;
    neighborhood: string;
    city: string;
    state: string;
  }): Promise<Result> {
    const { error } = await this.supabase.rpc("kyc_salvar_endereco", {
      p_cep: dados.cep,
      p_address: dados.address,
      p_number: dados.number,
      p_extra: dados.extra ?? "",
      p_neighborhood: dados.neighborhood,
      p_city: dados.city,
      p_state: dados.state,
    });
    if (error) return { ok: false, error: mensagemKyc(error.message) };
    return { ok: true, data: undefined };
  }

  async salvarDocumento(dados: {
    type: KycDocType;
    number: string;
    issuer: string;
    state: string;
  }): Promise<Result> {
    const { error } = await this.supabase.rpc("kyc_salvar_documento", {
      p_doc_type: dados.type,
      p_doc_number: dados.number,
      p_doc_issuer: dados.issuer,
      p_doc_state: dados.state,
    });
    if (error) return { ok: false, error: mensagemKyc(error.message) };
    return { ok: true, data: undefined };
  }

  /**
   * Envia um arquivo ao bucket privado e registra o caminho.
   * O caminho começa com o id do dono, exigência da policy do Storage.
   */
  async enviarArquivo(
    slot: KycSlot,
    arquivo: File,
    userId: string
  ): Promise<Result<{ path: string }>> {
    if (arquivo.size === 0) return { ok: false, error: "O arquivo está vazio." };
    if (arquivo.size > 10 * 1024 * 1024) return { ok: false, error: "O arquivo passa de 10 MB." };

    const tipos = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!tipos.includes(arquivo.type)) {
      return { ok: false, error: "Formato não aceito. Use JPG, PNG, WEBP ou PDF." };
    }

    const ext = (arquivo.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${userId}/${slot}-${Date.now()}.${ext || "jpg"}`;

    const { error: upErr } = await this.supabase.storage
      .from("kyc")
      .upload(path, arquivo, { upsert: true, contentType: arquivo.type });

    if (upErr) return { ok: false, error: "Falha ao enviar o arquivo. Tente novamente." };

    const { error: regErr } = await this.supabase.rpc("kyc_registrar_arquivo", {
      p_slot: slot,
      p_path: path,
    });
    if (regErr) return { ok: false, error: mensagemKyc(regErr.message) };

    return { ok: true, data: { path } };
  }

  /** Envia uma foto de um ângulo do rosto. */
  async enviarFace(
    angle: FaceAngle,
    arquivo: File,
    userId: string
  ): Promise<Result<{ path: string }>> {
    return this.enviarArquivo(SLOT_BY_ANGLE[angle], arquivo, userId);
  }

  async salvarComprovanteTipo(type: KycProofType): Promise<Result> {
    const { error } = await this.supabase.rpc("kyc_salvar_comprovante_tipo", {
      p_proof_type: type,
    });
    if (error) return { ok: false, error: mensagemKyc(error.message) };
    return { ok: true, data: undefined };
  }

  async registrarBiometria(dados: {
    livenessPassed: boolean;
    livenessScore: number;
    qualityScore: number;
  }): Promise<Result> {
    const { error } = await this.supabase.rpc("kyc_registrar_biometria", {
      p_liveness_passed: dados.livenessPassed,
      p_liveness_score: dados.livenessScore,
      p_quality_score: dados.qualityScore,
    });
    if (error) return { ok: false, error: mensagemKyc(error.message) };
    return { ok: true, data: undefined };
  }

  async enviarParaAnalise(): Promise<Result<{ status: KycStatus }>> {
    const { data, error } = await this.supabase.rpc("kyc_enviar");
    if (error) return { ok: false, error: mensagemKyc(error.message) };
    const d = data as { status: KycStatus };
    return { ok: true, data: { status: d.status } };
  }

  /* ---------------------- URL assinada para ver o arquivo ---------------- */

  async urlAssinada(path: string, segundos = 300): Promise<string | null> {
    const { data, error } = await this.supabase.storage.from("kyc").createSignedUrl(path, segundos);
    if (error) return null;
    return data?.signedUrl ?? null;
  }

  /* ------------------------------- admin -------------------------------- */

  async fila(): Promise<Result<KycFilaItem[]>> {
    const { data, error } = await this.supabase.rpc("kyc_fila");
    if (error) return { ok: false, error: mensagemKyc(error.message) };

    const linhas = (data ?? []) as Record<string, unknown>[];
    return {
      ok: true,
      data: linhas.map((r) => ({
        userId: r.user_id as string,
        nome: (r.nome as string) ?? "—",
        cpf: (r.cpf as string) ?? null,
        status: r.status as KycStatus,
        docType: (r.doc_type as KycDocType) ?? null,
        cidade: (r.cidade as string) ?? null,
        state: (r.state as string) ?? null,
        livenessScore: r.liveness_score === null ? null : Number(r.liveness_score),
        qualityScore: r.quality_score === null ? null : Number(r.quality_score),
        submittedAt: (r.submitted_at as string) ?? null,
        reviewedAt: (r.reviewed_at as string) ?? null,
        reviewNote: (r.review_note as string) ?? null,
      })),
    };
  }

  async detalhe(userId: string): Promise<Result<KycDetalhe>> {
    const { data, error } = await this.supabase.rpc("kyc_detalhe", { p_user_id: userId });
    if (error) return { ok: false, error: mensagemKyc(error.message) };

    const d = data as Record<string, unknown>;
    return {
      ok: true,
      data: {
        userId: d.user_id as string,
        status: d.status as KycStatus,
        fullName: (d.full_name as string) ?? null,
        cpf: (d.cpf as string) ?? null,
        birthDate: (d.birth_date as string) ?? null,
        phone: (d.phone as string) ?? null,
        email: (d.email as string) ?? null,
        motherName: (d.mother_name as string) ?? null,
        cep: (d.cep as string) ?? null,
        address: (d.address as string) ?? null,
        addressNumber: (d.address_number as string) ?? null,
        addressExtra: (d.address_extra as string) ?? null,
        neighborhood: (d.neighborhood as string) ?? null,
        city: (d.city as string) ?? null,
        state: (d.state as string) ?? null,
        docType: (d.doc_type as KycDocType) ?? null,
        docNumber: (d.doc_number as string) ?? null,
        docIssuer: (d.doc_issuer as string) ?? null,
        docState: (d.doc_state as string) ?? null,
        proofType: (d.proof_type as KycProofType) ?? null,
        paths: (d.paths ?? {}) as KycDetalhe["paths"],
        livenessPassed: Boolean(d.liveness_passed),
        livenessScore: d.liveness_score === null ? null : Number(d.liveness_score),
        qualityScore: d.quality_score === null ? null : Number(d.quality_score),
        submittedAt: (d.submitted_at as string) ?? null,
        reviewedAt: (d.reviewed_at as string) ?? null,
        reviewNote: (d.review_note as string) ?? null,
      },
    };
  }

  async decidir(
    userId: string,
    decisao: "aprovado" | "recusado" | "pendente",
    nota?: string
  ): Promise<Result<{ status: KycStatus }>> {
    const { data, error } = await this.supabase.rpc("kyc_decidir", {
      p_user_id: userId,
      p_decisao: decisao,
      p_nota: nota ?? null,
    });
    if (error) return { ok: false, error: mensagemKyc(error.message) };
    return { ok: true, data: { status: (data as { status: KycStatus }).status } };
  }

  async reabrir(userId: string, nota: string): Promise<Result<{ status: KycStatus }>> {
    const { data, error } = await this.supabase.rpc("kyc_reabrir", {
      p_user_id: userId,
      p_nota: nota,
    });
    if (error) return { ok: false, error: mensagemKyc(error.message) };
    return { ok: true, data: { status: (data as { status: KycStatus }).status } };
  }

  async resumo(): Promise<Result<KycResumo>> {
    const { data, error } = await this.supabase.rpc("kyc_resumo");
    if (error) return { ok: false, error: mensagemKyc(error.message) };

    const d = data as Record<string, unknown>;
    return {
      ok: true,
      data: {
        emAnalise: Number(d.em_analise ?? 0),
        aprovado: Number(d.aprovado ?? 0),
        recusado: Number(d.recusado ?? 0),
        pendente: Number(d.pendente ?? 0),
        naoIniciado: Number(d.nao_iniciado ?? 0),
      },
    };
  }
}
