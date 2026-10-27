"use server";

import { requireAdmin, requireSession } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { getKyc } from "@/lib/kyc";
import { analisar, iaConfigurada, type ResultadoIA } from "@/lib/kyc/ia";

/**
 * Triagem automática do KYC.
 *
 * O cliente envia a verificação, o sistema analisa os documentos e decide:
 *
 *   aprovar  → o KYC do cliente é aprovado sozinho (só com confiança alta)
 *   revisar  → entra na fila manual, com os alertas anexados à nota
 *   recusar  → imagem que nem é documento
 *
 * O resultado SEMPRE vai para a auditoria, inclusive quando aprova sozinho.
 * Sem isso não haveria como revisar depois o que a IA liberou.
 */

export type ResultadoTriagem = {
  ok: boolean;
  decisao?: ResultadoIA["decisao"];
  confianca?: number;
  motivos?: string[];
  alertas?: string[];
  error?: string;
};

/** O provedor está configurado? Usado pela tela do admin. */
export async function iaDisponivel(): Promise<boolean> {
  await requireAdmin();
  return iaConfigurada();
}

/**
 * Baixa um arquivo do Storage e devolve em base64.
 *
 * O provedor de visão precisa da imagem no corpo da requisição; a URL assinada
 * do Supabase expiraria e não seria aceita de qualquer forma.
 */
async function baixarBase64(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string
): Promise<{ base64: string; mime: string } | null> {
  const { data, error } = await supabase.storage.from("kyc").download(path);
  if (error || !data) return null;

  const buf = Buffer.from(await data.arrayBuffer());
  // Teto de segurança: documento de KYC não passa disso, e sem limite um
  // arquivo grande estouraria o corpo da requisição e a memória da função.
  if (buf.byteLength > 6 * 1024 * 1024) return null;

  const mime = data.type || "image/jpeg";
  // PDF não é aceito por provedores de visão no formato de imagem. Só
  // analisamos imagem; quando o documento é PDF, a triagem vai para a mão
  // do admin, que tem o visualizador próprio.
  if (!mime.startsWith("image/")) return null;

  return { base64: buf.toString("base64"), mime };
}

/**
 * Analisa o KYC de um cliente e aplica o resultado.
 *
 * `userId` vazio significa "o próprio usuário logado" — é o caminho do envio
 * automático pelo cliente. Um admin pode forçar a reanálise passando o id.
 */
export async function triarKyc(userId?: string): Promise<ResultadoTriagem> {
  // O cliente pode disparar para si mesmo; para outra conta, só admin.
  const { user, supabase: sbSessao } = await requireSession();
  const alvo = userId && userId !== user.id ? userId : user.id;

  if (alvo !== user.id) {
    const { supabase: sbAdmin } = await requireAdmin();
    void sbAdmin;
  }

  if (!iaConfigurada()) {
    return { ok: false, error: "Análise automática não configurada." };
  }

  const supabase = await createClient();
  const kyc = getKyc(supabase);

  const det = await kyc.detalhe(alvo);
  if (!det.ok) return { ok: false, error: det.error };

  const d = det.data;
  const paths = d.paths ?? {};

  const frente = paths.doc_frente;
  const selfie = paths.selfie_doc;
  if (!frente) return { ok: false, error: "Documento ainda não enviado." };

  const imgFrente = await baixarBase64(supabase, frente);
  if (!imgFrente) {
    return { ok: false, error: "Não foi possível ler o documento enviado." };
  }

  const imgSelfie = selfie ? await baixarBase64(supabase, selfie) : null;

  const r = await analisar({
    documentoFrente: imgFrente,
    selfie: imgSelfie,
    nomeCadastro: d.fullName ?? null,
    cpfCadastro: d.cpf ?? null,
    hoje: new Date().toISOString().slice(0, 10),
  });

  if (!r.ok) return { ok: false, error: r.error };

  const res = r.resultado;

  // A nota que fica registrada no KYC e na auditoria. Vai legível de propósito:
  // quem revisar depois precisa entender por que a IA decidiu.
  const nota = [
    `Triagem automática: ${res.decisao} (confiança ${(res.confianca * 100).toFixed(0)}%).`,
    res.motivos.length ? `Motivos: ${res.motivos.join(" ")}` : "",
    res.alertas.length ? `Alertas: ${res.alertas.join(" ")}` : "",
    res.naoVerificado.length ? `Não verificado: ${res.naoVerificado.join(", ")}.` : "",
    r.observacoes ? `Observações: ${r.observacoes}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  // A decisão no banco. `aprovar` só chega aqui quando a confiança passou do
  // limiar alto — a trava está em lib/kyc/ia.ts, que é testado.
  const decisaoBanco =
    res.decisao === "aprovar" ? "aprovado" : res.decisao === "recusar" ? "recusado" : "pendente";

  const decisao = await kyc.decidir(alvo, decisaoBanco, nota);
  if (!decisao.ok) return { ok: false, error: decisao.error };

  // Registro próprio na auditoria, para o admin ver o que a IA fez sem
  // precisar garimpar a nota do KYC.
  await supabase.rpc("kyc_registrar_triagem", {
    p_user_id: alvo,
    p_decisao: res.decisao,
    p_confianca: res.confianca,
    p_motivos: res.motivos,
    p_alertas: res.alertas,
    p_nao_verificado: res.naoVerificado,
  });

  return {
    ok: true,
    decisao: res.decisao,
    confianca: res.confianca,
    motivos: res.motivos,
    alertas: res.alertas,
  };
}

/**
 * Reanalisa pelo painel do admin.
 *
 * Separada de `triarKyc` porque aqui a permissão é explícita e a resposta
 * inclui o que foi registrado, para a tela mostrar o resultado na hora.
 */
export async function reanalisarKycAdmin(userId: string): Promise<ResultadoTriagem> {
  await requireAdmin();
  if (!userId) return { ok: false, error: "Conta inválida." };
  return triarKyc(userId);
}
