"use client";

import { createBrowserClient } from "@supabase/ssr";
import { comprimirImagem, TAMANHO_MAX, mb } from "@/lib/comprimir";
import type { KycSlot } from "@/lib/kyc/service";

/**
 * Envio de arquivo do KYC direto do navegador para o Supabase Storage.
 *
 * Por que não pela Server Action: o Next.js limita o corpo de Server Actions a
 * 1 MB por padrão, e foto de celular tem 3–8 MB. O envio estourva o limite e
 * ficava pendurado — a barra "Enviando…" que nunca terminava.
 *
 * Aqui o arquivo vai do cliente ao Storage sem passar pelo servidor da
 * aplicação. A policy do bucket exige que o caminho comece com o id do dono,
 * então ninguém grava na pasta de outra pessoa.
 */

const TIPOS = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

let cliente: ReturnType<typeof createBrowserClient> | null = null;
function sb() {
  if (!cliente) {
    cliente = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return cliente;
}

export type ResultadoEnvio = {
  ok: boolean;
  error?: string;
  path?: string;
  /** Quanto foi economizado, para mostrar ao usuário. */
  detalhe?: string;
};

export async function enviarArquivoDireto(
  slot: KycSlot,
  arquivoOriginal: File
): Promise<ResultadoEnvio> {
  if (arquivoOriginal.size === 0) return { ok: false, error: "O arquivo está vazio." };
  if (arquivoOriginal.size > TAMANHO_MAX) {
    return { ok: false, error: `O arquivo tem ${mb(arquivoOriginal.size)} e passa de 10 MB.` };
  }
  if (!TIPOS.includes(arquivoOriginal.type)) {
    return { ok: false, error: "Formato não aceito. Use JPG, PNG, WEBP ou PDF." };
  }

  // Reduz a foto antes de enviar — é o que faz o envio ser rápido no 4G.
  const { arquivo, comprimido, originalBytes, finalBytes } =
    await comprimirImagem(arquivoOriginal);

  const { data: sessao } = await sb().auth.getUser();
  const userId = sessao?.user?.id;
  if (!userId) return { ok: false, error: "Sessão expirada. Entre novamente." };

  const ext = (arquivo.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${userId}/${slot}-${Date.now()}.${ext || "jpg"}`;

  const { error } = await sb()
    .storage.from("kyc")
    .upload(path, arquivo, { upsert: true, contentType: arquivo.type });

  if (error) {
    // Mensagem útil em vez de "falha ao enviar": o caso mais comum é o bucket
    // não existir ou a policy recusar.
    const m = error.message || "";
    if (/bucket/i.test(m) && /not found/i.test(m)) {
      return { ok: false, error: "O armazenamento de documentos não está configurado." };
    }
    if (/row-level security|policy|unauthorized|403/i.test(m)) {
      return { ok: false, error: "Sem permissão para enviar. Faça login novamente." };
    }
    if (/exceeded|too large|maximum/i.test(m)) {
      return { ok: false, error: "O arquivo é grande demais para o servidor." };
    }
    return { ok: false, error: `Falha ao enviar: ${m || "erro desconhecido"}` };
  }

  return {
    ok: true,
    path,
    detalhe: comprimido
      ? `Imagem reduzida de ${mb(originalBytes)} para ${mb(finalBytes)}.`
      : undefined,
  };
}
