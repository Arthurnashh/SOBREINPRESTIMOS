/**
 * Navegação do modal de fotos do KYC.
 *
 * Estado puro, separado do componente React, porque é aqui que moram os casos
 * de borda que já causaram defeito em telas parecidas: índice fora da lista,
 * galeria vazia, uma foto só, e o "voltar" na primeira foto (que precisa dar a
 * volta em vez de travar).
 */

export type FotoGaleria = { chave: string; legenda: string; url: string };

/**
 * O arquivo é um PDF?
 *
 * O cliente pode enviar o documento como foto da câmera (JPEG/PNG) ou como
 * PDF baixado do banco. Um PDF dentro de `<img>` não renderiza: o navegador
 * não tem como decodificar, e o palco do modal ficava em branco.
 *
 * A extensão precisa ser lida do CAMINHO, não da URL inteira: a URL assinada
 * do Supabase carrega `?token=...` no fim, e testar a string toda daria falso
 * positivo em qualquer arquivo cujo token terminasse em "pdf".
 */
export function ehPdf(url: string): boolean {
  const semQuery = url.split("?")[0].split("#")[0];
  return /\.pdf$/i.test(semQuery);
}

/** O arquivo é uma imagem que o navegador consegue exibir direto? */
export function ehImagem(url: string): boolean {
  const semQuery = url.split("?")[0].split("#")[0];
  return /\.(jpe?g|png|webp|gif|avif|heic|heif|bmp)$/i.test(semQuery);
}

/**
 * Monta a lista de fotos navegáveis a partir do que veio do servidor.
 *
 * O servidor devolve TODAS as chaves conhecidas, com `null` nas não enviadas.
 * Se as não enviadas entrassem na lista, as setas do modal parariam em telas
 * vazias. Por isso filtramos, preservando a ordem de `rotulos`.
 */
export function montarGaleria(
  rotulos: Record<string, string>,
  urls: Record<string, string | null> | null
): FotoGaleria[] {
  if (!urls) return [];
  return Object.entries(rotulos)
    .filter(([chave]) => Boolean(urls[chave]))
    .map(([chave, legenda]) => ({ chave, legenda, url: urls[chave] as string }));
}

/** Índice válido para abrir, ou null se a foto não está na galeria. */
export function indiceValido(galeria: FotoGaleria[], chave: string): number | null {
  const i = galeria.findIndex((g) => g.chave === chave);
  return i >= 0 ? i : null;
}

/**
 * Passo da navegação, com volta nas pontas.
 *
 * `direcao` +1 avança, -1 retrocede. Numa galeria de 1 foto devolve o mesmo
 * índice (não há para onde ir). Em galeria vazia devolve null.
 */
export function passo(
  total: number,
  atual: number | null,
  direcao: 1 | -1
): number | null {
  if (total <= 0) return null;
  if (atual === null || atual < 0 || atual >= total) return 0;
  if (total === 1) return 0;
  return (atual + direcao + total) % total;
}

/** O modal só deve renderizar com índice dentro da lista. */
export function modalAberto(total: number, indice: number | null): boolean {
  return indice !== null && Number.isInteger(indice) && indice >= 0 && indice < total;
}
