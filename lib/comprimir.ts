/**
 * Compressão de imagem no navegador, antes do envio.
 *
 * Foto de celular tem 3–8 MB. Enviar isso inteiro é lento no 4G e estoura o
 * limite de corpo das Server Actions do Next.js (1 MB), que é a causa do
 * envio que "fica carregando para sempre".
 *
 * Redimensionar para no máximo 1600px no maior lado e recomprimir em JPEG
 * derruba para ~200–400 KB sem perda visível para conferência de documento.
 * PDF não é tocado: já costuma ser pequeno e recomprimir quebraria o arquivo.
 */

const LADO_MAX = 1600;
const QUALIDADE = 0.82;
/** Acima disso nem tenta comprimir no cliente — melhor recusar com clareza. */
export const TAMANHO_MAX = 10 * 1024 * 1024;

export type ResultadoCompressao = {
  arquivo: File;
  /** true quando o arquivo foi de fato reduzido. */
  comprimido: boolean;
  originalBytes: number;
  finalBytes: number;
};

export async function comprimirImagem(arquivo: File): Promise<ResultadoCompressao> {
  const base = {
    arquivo,
    comprimido: false,
    originalBytes: arquivo.size,
    finalBytes: arquivo.size,
  };

  // PDF e formatos que não são imagem seguem intactos.
  if (!arquivo.type.startsWith("image/")) return base;
  // Já é pequeno: não vale o custo de reprocessar.
  if (arquivo.size <= 400 * 1024) return base;

  try {
    const bitmap = await carregar(arquivo);

    const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * escala));
    const h = Math.max(1, Math.round(bitmap.height * escala));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) return base;
    // Fundo branco: JPEG não tem transparência, e PNG transparente viraria
    // preto, deixando o documento ilegível.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", QUALIDADE)
    );
    // Só ImageBitmap tem close(); o fallback <img> não precisa liberar.
    if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();
    if (!blob) return base;
    // Se comprimir não ajudou, mantém o original.
    if (blob.size >= arquivo.size) return base;

    const nome = arquivo.name.replace(/\.[^.]+$/, "") + ".jpg";
    return {
      arquivo: new File([blob], nome, { type: "image/jpeg", lastModified: Date.now() }),
      comprimido: true,
      originalBytes: arquivo.size,
      finalBytes: blob.size,
    };
  } catch {
    // Se o navegador não conseguir processar, envia o original — o servidor
    // ainda valida tamanho e formato.
    return base;
  }
}

async function carregar(arquivo: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return await createImageBitmap(arquivo);
  }
  // Fallback para navegadores sem createImageBitmap (Safari antigo).
  return await new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(arquivo);
    img.onload = () => {
      URL.revokeObjectURL(url);
      res(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      rej(new Error("imagem ilegível"));
    };
    img.src = url;
  });
}

export function mb(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
