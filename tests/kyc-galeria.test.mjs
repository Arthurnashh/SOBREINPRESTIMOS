/**
 * Navegação do modal de fotos do KYC.
 *
 * O modal substituiu o `<a target="_blank">`: a URL assinada do Supabase
 * expirava enquanto o admin conferia os outros documentos, e sair da ficha
 * para ver uma selfie atrapalhava a análise.
 *
 * A lógica de índice foi separada do componente React justamente para poder
 * ser testada aqui — foi onde apareceram os defeitos de telas parecidas:
 * abrir índice -1 (modal em branco) e travar na ponta em vez de dar a volta.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  indiceValido,
  modalAberto,
  montarGaleria,
  passo,
} from "../lib/kyc/galeria.ts";

const ROTULOS = {
  doc_frente: "Documento — frente",
  doc_verso: "Documento — verso",
  comprovante: "Comprovante",
  selfie_doc: "Selfie com documento",
};

test("montarGaleria ignora as fotos não enviadas", () => {
  const g = montarGaleria(ROTULOS, {
    doc_frente: "https://x/frente.jpg",
    doc_verso: null,
    comprovante: "https://x/comprovante.jpg",
    selfie_doc: null,
  });

  // Se as nulas entrassem, as setas do modal parariam em telas vazias.
  assert.equal(g.length, 2);
  assert.deepEqual(
    g.map((f) => f.chave),
    ["doc_frente", "comprovante"]
  );
  assert.equal(g[0].url, "https://x/frente.jpg");
});

test("montarGaleria preserva a ordem dos rótulos", () => {
  const g = montarGaleria(ROTULOS, {
    selfie_doc: "https://x/s.jpg",
    doc_frente: "https://x/f.jpg",
  });
  // A ordem é a do formulário (documento antes de selfie), não a do objeto.
  assert.deepEqual(
    g.map((f) => f.chave),
    ["doc_frente", "selfie_doc"]
  );
});

test("montarGaleria devolve vazio sem resposta do servidor ou sem foto", () => {
  assert.deepEqual(montarGaleria(ROTULOS, null), []);
  assert.deepEqual(montarGaleria(ROTULOS, {}), []);
  // String vazia também não é foto: o servidor pode devolver "" no lugar de null.
  assert.deepEqual(montarGaleria(ROTULOS, { doc_frente: null, doc_verso: "" }), []);
});

test("indiceValido recusa foto fora da galeria em vez de devolver -1", () => {
  const g = montarGaleria(ROTULOS, { doc_frente: "https://x/f.jpg" });

  assert.equal(indiceValido(g, "doc_frente"), 0);
  // -1 abriria o modal sem imagem. Tem de ser null.
  assert.equal(indiceValido(g, "doc_verso"), null);
  assert.equal(indiceValido(g, "inexistente"), null);
  assert.equal(indiceValido([], "doc_frente"), null);
});

test("passo dá a volta nas pontas em vez de travar", () => {
  // 3 fotos: 0 -> 1 -> 2 -> volta para 0
  assert.equal(passo(3, 0, 1), 1);
  assert.equal(passo(3, 1, 1), 2);
  assert.equal(passo(3, 2, 1), 0);
  // e o inverso: 0 -> volta para 2
  assert.equal(passo(3, 0, -1), 2);
  assert.equal(passo(3, 2, -1), 1);
});

test("passo com uma foto só fica nela", () => {
  assert.equal(passo(1, 0, 1), 0);
  assert.equal(passo(1, 0, -1), 0);
});

test("passo não quebra com galeria vazia ou índice inválido", () => {
  assert.equal(passo(0, null, 1), null);
  assert.equal(passo(0, 0, -1), null);
  // Índice corrompido cai na primeira foto em vez de estourar.
  assert.equal(passo(3, 99, 1), 0);
  assert.equal(passo(3, -1, 1), 0);
});

test("modalAberto só aceita índice dentro da lista", () => {
  assert.equal(modalAberto(3, 0), true);
  assert.equal(modalAberto(3, 2), true);
  // Casos que produziriam tela em branco:
  assert.equal(modalAberto(3, 3), false);
  assert.equal(modalAberto(3, -1), false);
  assert.equal(modalAberto(3, null), false);
  assert.equal(modalAberto(0, 0), false);
  assert.equal(modalAberto(3, 1.5), false);
});
