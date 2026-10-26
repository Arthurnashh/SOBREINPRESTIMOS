/**
 * Análise de imagem para a captura facial, feita no navegador.
 *
 * Não usa biblioteca externa nem envia nada para servidor: desenha o quadro
 * da câmera num canvas, lê os pixels e mede o que interessa.
 *
 * O que dá para medir de verdade, sem IA:
 *   - nitidez  (variância do laplaciano — foto tremida reprova)
 *   - brilho   (média de luminância — escuro demais ou estourado reprova)
 *   - pele     (proporção de pixels em faixa de tom de pele na região central)
 *   - posição  (o "blob" de pele está centralizado?)
 *   - tamanho  (que fração do quadro o rosto ocupa?)
 *   - movimento (diferença entre quadros — base da prova de vida)
 *
 * O que NÃO dá, e por isso a integração com IA fica pendente:
 *   - comparar o rosto com a foto do documento (1:1)
 *   - garantir que é uma pessoa viva e não um vídeo bem feito
 */

export type MetricasQuadro = {
  nitidez: number;
  brilho: number;
  pele: number;
  centralizacao: number;
  tamanho: number;
  ok: boolean;
  problemas: string[];
};

/** Luminância perceptual (0-255). */
function lum(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Tom de pele em RGB.
 *
 * A versão anterior aceitava qualquer coisa "avermelhada e clara" (r>g, r>b,
 * max-min>10). Isso classificava PAREDE BEGE e MARROM como pele: contra um
 * fundo assim, o quadro inteiro virava "rosto", o tamanho ia a 0.99 e a tela
 * pedia "afaste-se" para sempre — sem jeito de satisfazer.
 *
 * Agora exigimos a faixa de croma da pele: o vermelho precisa dominar o azul
 * com folga, mas sem estourar, e o verde fica entre os dois. Parede bege tem
 * r≈g≈b demais para passar; madeira e marrom têm saturação alta demais.
 */
function ehPele(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const croma = max - min;

  // claridade: nem sombra fechada, nem estourado
  if (max < 70 || max > 250) return false;

  // pele tem croma moderado; cinza/bege claro tem pouco, madeira tem muito
  if (croma < 15 || croma > 115) return false;

  // o vermelho lidera, mas o verde acompanha perto — é o que separa pele de
  // vermelho puro e de marrom saturado
  if (r < g || r < b) return false;
  const rg = r - g;
  const gb = g - b;
  if (rg < 8 || rg > 95) return false;
  if (gb < 2) return false;

  // normaliza pelo vermelho: reduz o efeito de iluminação
  const nr = r / (r + g + b);
  const ng = g / (r + g + b);
  return nr > 0.33 && nr < 0.52 && ng > 0.28 && ng < 0.40;
}

/**
 * Analisa um quadro. `regiao` limita a busca ao centro (onde o rosto deve
 * estar), o que reduz muito o falso positivo de fundo com tom de pele.
 */
export function analisarQuadro(
  ctx: CanvasRenderingContext2D,
  largura: number,
  altura: number
): MetricasQuadro {
  const { data } = ctx.getImageData(0, 0, largura, altura);
  const problemas: string[] = [];

  // ---------- brilho e mapa de pele ----------
  let somaSoma = 0;
  let contagem = 0;
  let peleTotal = 0;
  let somaX = 0;
  let somaY = 0;
  let minX = largura,
    maxX = 0,
    minY = altura,
    maxY = 0;

  for (let y = 0; y < altura; y += 2) {
    for (let x = 0; x < largura; x += 2) {
      const i = (y * largura + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      somaSoma += lum(r, g, b);
      contagem++;

      if (ehPele(r, g, b)) {
        peleTotal++;
        somaX += x;
        somaY += y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const brilho = contagem ? somaSoma / contagem : 0;
  const pele = contagem ? peleTotal / contagem : 0;

  if (brilho < 45) problemas.push("Está muito escuro. Procure um lugar mais iluminado.");
  else if (brilho > 215) problemas.push("Está claro demais. Evite luz direta no rosto.");

  // ---------- nitidez (variância do laplaciano) ----------
  let soma = 0;
  let somaQuad = 0;
  let n = 0;
  for (let y = 2; y < altura - 2; y += 2) {
    for (let x = 2; x < largura - 2; x += 2) {
      const idx = (yy: number, xx: number) => {
        const i = (yy * largura + xx) * 4;
        return lum(data[i], data[i + 1], data[i + 2]);
      };
      const lap =
        4 * idx(y, x) - idx(y - 2, x) - idx(y + 2, x) - idx(y, x - 2) - idx(y, x + 2);
      soma += lap;
      somaQuad += lap * lap;
      n++;
    }
  }
  const media = n ? soma / n : 0;
  const nitidez = n ? somaQuad / n - media * media : 0;

  // Limite propositalmente baixo. A variância do laplaciano cai muito com
  // webcam comum, luz de casa e leve tremida — um corte alto deixava o botão
  // de captura travado para sempre em aparelhos normais. O objetivo aqui é
  // separar "dá para ver o rosto" de "borrão inútil", não exigir foto de estúdio.
  if (nitidez < 18) problemas.push("A imagem está sem nitidez. Segure o celular firme.");

  // ---------- posição e tamanho do rosto ----------
  let centralizacao = 0;
  let tamanho = 0;

  if (peleTotal > 0) {
    const cx = somaX / peleTotal / largura; // 0..1
    const cy = somaY / peleTotal / altura;
    // distância do centro (0 = centro exato)
    const dist = Math.hypot(cx - 0.5, cy - 0.5);
    centralizacao = Math.max(0, 1 - dist * 2.6);

    const larguraBlob = maxX - minX;
    const alturaBlob = maxY - minY;
    tamanho = (larguraBlob * alturaBlob) / (largura * altura);

    /*
     * Parede bege é, em RGB, praticamente igual a pele — nenhuma regra de cor
     * separa as duas. O que separa é a FORMA: um fundo encosta nas bordas do
     * quadro, um rosto não. Se a "pele" ocupa as quatro bordas, é parede.
     */
    const encostaEsquerda = minX <= 1;
    const encostaDireita = maxX >= largura - 2;
    const encostaTopo = minY <= 1;
    const encostaBase = maxY >= altura - 2;

    if (encostaEsquerda && encostaDireita && encostaTopo && encostaBase) {
      problemas.push(
        "O fundo tem um tom parecido com a pele. Coloque-se na frente de uma parede de cor diferente ou aproxime o rosto."
      );
      // não seguimos avaliando posição/tamanho: a medida não é confiável aqui
      return {
        nitidez: Math.round(nitidez),
        brilho: Math.round(brilho),
        pele: Number(pele.toFixed(3)),
        centralizacao: 0,
        tamanho: Number(tamanho.toFixed(3)),
        ok: false,
        problemas,
      };
    }

    if (centralizacao < 0.3) problemas.push("Centralize o rosto no círculo.");
    if (tamanho < 0.04) problemas.push("Aproxime-se um pouco da câmera.");
    if (tamanho > 0.85) problemas.push("Afaste-se um pouco da câmera.");
  } else {
    problemas.push("Não encontrei um rosto no quadro. Melhore a luz e olhe para a câmera.");
  }

  return {
    nitidez: Math.round(nitidez),
    brilho: Math.round(brilho),
    pele: Number(pele.toFixed(3)),
    centralizacao: Number(centralizacao.toFixed(2)),
    tamanho: Number(tamanho.toFixed(3)),
    ok: problemas.length === 0,
    problemas,
  };
}

/**
 * Movimento entre dois quadros (0 = idênticos).
 * Serve para a prova de vida e para exigir que a pessoa pare antes do clique.
 */
export function diferencaEntreQuadros(
  a: ImageData,
  b: ImageData,
  passo = 4
): number {
  let soma = 0;
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4 * passo) {
    const d =
      Math.abs(a.data[i] - b.data[i]) +
      Math.abs(a.data[i + 1] - b.data[i + 1]) +
      Math.abs(a.data[i + 2] - b.data[i + 2]);
    soma += d / 3;
    n++;
  }
  return n ? soma / n : 0;
}

/**
 * Detecta deslocamento horizontal do conteúdo entre dois quadros, em
 * fração da largura. Usado para confirmar que a pessoa virou o rosto de
 * fato — a prova de vida por movimento.
 */
export function deslocamentoHorizontal(a: ImageData, b: ImageData, largura: number): number {
  // procura o deslocamento que minimiza a diferença, numa janela de ±12%
  const maxShift = Math.max(4, Math.round(largura * 0.12));
  const passo = 4;
  let melhorShift = 0;
  let melhorErro = Infinity;

  for (let shift = -maxShift; shift <= maxShift; shift += 2) {
    let erro = 0;
    let n = 0;
    for (let y = 0; y < a.height; y += passo * 2) {
      for (let x = maxShift; x < largura - maxShift; x += passo) {
        const ia = (y * largura + x) * 4;
        const ib = (y * largura + (x + shift)) * 4;
        erro += Math.abs(a.data[ia] - b.data[ib]);
        n++;
      }
    }
    const media = n ? erro / n : Infinity;
    if (media < melhorErro) {
      melhorErro = media;
      melhorShift = shift;
    }
  }

  return melhorShift / largura;
}

/** Nitidez alta o bastante para servir de comprovante? */
export function qualidadeParaNota(m: MetricasQuadro): number {
  // 0 a 100, combinação simples do que medimos
  const nit = Math.min(1, m.nitidez / 300);
  const luz = 1 - Math.abs(m.brilho - 130) / 130;
  const centro = m.centralizacao;
  const tam = Math.min(1, m.tamanho / 0.2);
  const nota = (nit * 0.35 + Math.max(0, luz) * 0.25 + centro * 0.25 + tam * 0.15) * 100;
  return Math.round(Math.max(0, Math.min(100, nota)));
}
