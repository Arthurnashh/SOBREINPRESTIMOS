/**
 * O analisador de quadro é o que decide se o botão de captura funciona.
 *
 * O bug relatado ("não consigo clicar para tirar a foto") veio daqui: com os
 * limites antigos, um quadro normal de webcam nunca era considerado bom e o
 * botão vivia desabilitado. Pior: contra parede bege ou marrom — comuns em
 * casa — o quadro inteiro era lido como pele e a tela pedia "afaste-se" para
 * sempre, sem jeito de satisfazer.
 *
 * Estes testes desenham quadros sintéticos e exigem que a análise aprove o que
 * é aproveitável e reprove o que é reprovável, com instrução acionável.
 *
 * `analisarQuadro` espera um CanvasRenderingContext2D, mas só usa
 * getImageData. Passamos um objeto mínimo com essa forma.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { analisarQuadro, diferencaEntreQuadros, deslocamentoHorizontal, qualidadeParaNota } from "../lib/kyc/visao.ts";

const LADO = 320;
const FUNDO = [110, 118, 126];

/** Contexto falso: devolve o ImageData que montamos à mão. */
const contextoFalso = (data) => ({ getImageData: () => ({ data, width: LADO, height: LADO }) });

function quadroVazio() {
  return new Uint8ClampedArray(LADO * LADO * 4);
}

/**
 * Cena: fundo liso e um rosto elíptico de tom de pele no centro.
 * Uma elipse, e não um quadrado, porque `tamanho` mede a caixa que envolve os
 * pixels de pele — um quadrado sólido gigante não existe na vida real.
 */
function cenaRosto({ tomPele = [196, 150, 122], fundo = FUNDO, tamanho = 0.34, deslocX = 0 } = {}) {
  const data = quadroVazio();

  for (let y = 0; y < LADO; y++) {
    for (let x = 0; x < LADO; x++) {
      const i = (y * LADO + x) * 4;
      data[i] = fundo[0];
      data[i + 1] = fundo[1];
      data[i + 2] = fundo[2];
      data[i + 3] = 255;
    }
  }

  const lado = LADO * tamanho;
  const cx = LADO / 2 + deslocX;
  const cy = LADO / 2;
  for (let y = 0; y < LADO; y++) {
    for (let x = 0; x < LADO; x++) {
      const dx = (x - cx) / (lado / 2);
      const dy = (y - cy) / (lado / 2.2);
      if (dx * dx + dy * dy <= 1) {
        const i = (y * LADO + x) * 4;
        data[i] = tomPele[0];
        data[i + 1] = tomPele[1];
        data[i + 2] = tomPele[2];
      }
    }
  }
  return data;
}

/**
 * Textura só no rosto, como a pele real tem. A versão anterior tingia também
 * o fundo e fazia uma parede cinza virar "pele".
 */
function comTextura(data, fundo = FUNDO, amplitude = 22) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] === fundo[0] && data[i + 1] === fundo[1] && data[i + 2] === fundo[2]) continue;
    const ruido = ((i / 4) % 7) * amplitude - amplitude * 3;
    data[i] = Math.max(0, Math.min(255, data[i] + ruido));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + ruido * 0.6));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + ruido * 0.4));
  }
  return data;
}

/** Cena de webcam normal: rosto texturizado sobre fundo liso. */
const cena = (opcoes = {}) => comTextura(cenaRosto(opcoes), opcoes.fundo ?? FUNDO);

const analisar = (data) => analisarQuadro(contextoFalso(data), LADO, LADO);

/* ------------------------- o que DEVE ser aprovado ------------------------- */

test("um rosto comum de webcam é aprovado — o botão de captura libera", () => {
  const m = analisar(cena());
  assert.equal(m.ok, true, `reprovou um quadro normal: ${JSON.stringify(m.problemas)}`);
  assert.equal(m.problemas.length, 0);
});

test("funciona em tons de pele variados", () => {
  const tons = [
    [240, 205, 180], // claro
    [196, 150, 122], // médio
    [140, 100, 74],  // moreno
    [92, 64, 48],    // retinto
  ];
  for (const tomPele of tons) {
    const m = analisar(cena({ tomPele }));
    assert.equal(m.ok, true, `reprovou o tom ${tomPele.join(",")}: ${JSON.stringify(m.problemas)}`);
  }
});

test("rosto um pouco fora do centro ainda passa", () => {
  const m = analisar(cena({ deslocX: 40 }));
  assert.equal(m.ok, true, `reprovou com deslocamento leve: ${JSON.stringify(m.problemas)}`);
});

test("rosto mais próximo também passa", () => {
  const m = analisar(cena({ tamanho: 0.6 }));
  assert.equal(m.ok, true, `reprovou rosto próximo: ${JSON.stringify(m.problemas)}`);
});

/* ------------------------ o que DEVE ser reprovado ------------------------ */

test("quadro escuro é reprovado com instrução clara", () => {
  const m = analisar(cena({ fundo: [12, 12, 14], tomPele: [30, 22, 18] }));
  assert.equal(m.ok, false);
  assert.match(m.problemas.join(" "), /escuro/i);
});

test("quadro estourado é reprovado", () => {
  const m = analisar(cena({ fundo: [250, 250, 250], tomPele: [252, 250, 248] }));
  assert.equal(m.ok, false);
});

test("sem ninguém no quadro, avisa que não achou rosto", () => {
  const semRosto = quadroVazio();
  for (let i = 0; i < semRosto.length; i += 4) {
    semRosto[i] = FUNDO[0];
    semRosto[i + 1] = FUNDO[1];
    semRosto[i + 2] = FUNDO[2];
    semRosto[i + 3] = 255;
  }
  const m = analisar(semRosto);
  assert.equal(m.ok, false);
  assert.match(m.problemas.join(" "), /rosto/i);
});

test("rosto minúsculo pede para aproximar", () => {
  const m = analisar(cena({ tamanho: 0.14 }));
  assert.equal(m.ok, false);
  assert.match(m.problemas.join(" "), /aproxime/i);
});

/**
 * Parede bege é, em RGB, praticamente igual a pele. Nenhuma regra de cor
 * separa as duas — o que separa é a forma: fundo encosta nas bordas.
 * O essencial é que a orientação seja ACIONÁVEL, não o impossível "afaste-se".
 */
test("fundo de tom parecido com pele dá orientação acionável, não beco sem saída", () => {
  for (const fundo of [[196, 170, 150], [150, 120, 95]]) {
    const m = analisar(cena({ fundo }));
    assert.equal(m.ok, false, `aceitou parede ${fundo.join(",")} como rosto`);
    const texto = m.problemas.join(" ");
    assert.match(texto, /fundo/i, `sem explicação do fundo: ${texto}`);
    assert.doesNotMatch(texto, /[Aa]faste-se/, `mandou afastar num quadro sem rosto: ${texto}`);
  }
});

/* ----------------------------- prova de vida ----------------------------- */

// `diferencaEntreQuadros` e `deslocamentoHorizontal` recebem ImageData
// (com .data/.width/.height), não o array cru.
const comoImageData = (data) => ({ data, width: LADO, height: LADO });

test("mover o rosto produz diferença entre quadros (base da prova de vida)", () => {
  const d = diferencaEntreQuadros(
    comoImageData(cenaRosto({ deslocX: 0 })),
    comoImageData(cenaRosto({ deslocX: 30 }))
  );
  assert.ok(d > 1, `quadros diferentes tiveram diferença ${d}`);
});

test("quadro parado tem diferença quase nula", () => {
  const d = diferencaEntreQuadros(comoImageData(cena()), comoImageData(cena()));
  assert.ok(d < 1, `quadros iguais tiveram diferença ${d}`);
});

test("virar o rosto passa do limite da prova de vida (0.025)", () => {
  const desl = deslocamentoHorizontal(
    comoImageData(comTextura(cenaRosto({ deslocX: 0 }))),
    comoImageData(comTextura(cenaRosto({ deslocX: 26 }))),
    LADO
  );
  assert.ok(
    Math.abs(desl) >= 0.025,
    `virar o rosto deu deslocamento ${desl}, abaixo do limite de 0.025`
  );
});

/* ------------------------------- nota ---------------------------------- */

test("a nota de qualidade fica entre 0 e 100", () => {
  const nota = qualidadeParaNota(analisar(cena()));
  assert.ok(nota >= 0 && nota <= 100, `nota fora da faixa: ${nota}`);
  assert.ok(nota > 40, `quadro bom tirou nota baixa: ${nota}`);
});
