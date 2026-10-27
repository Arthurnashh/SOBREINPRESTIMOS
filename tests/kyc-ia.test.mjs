/**
 * Triagem automática do KYC.
 *
 * O que estes testes protegem: a aprovação automática só pode acontecer quando
 * TUDO bate e a confiança é alta. O custo de errar para mais é um humano
 * conferir algo óbvio; o custo de errar para menos é liberar crédito para um
 * golpista. Por isso os casos de borda aqui são exaustivos do lado do "não
 * aprove".
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CONFIANCA_MINIMA_APROVAR,
  decidir,
  interpretarResposta,
  montarPedido,
  nomeCompativel,
} from "../lib/kyc/ia.ts";

const HOJE = "2026-10-27";

const docBom = {
  ehDocumento: true,
  tipoAparente: "cnh",
  legivel: true,
  nomeNoDocumento: "MARIA DA SILVA SOUZA",
  cpfNoDocumento: "52998224725",
  validoAte: "2030-01-01",
  sinaisAdulteracao: [],
};

/** Caso ideal: tudo bate, confiança alta. Deve aprovar. */
const ideal = {
  confianca: 0.97,
  documento: docBom,
  nomeCadastro: "Maria da Silva Souza",
  cpfCadastro: "529.982.247-25",
  faceBate: true,
  hoje: HOJE,
};

test("aprova quando tudo bate e a confiança é alta", () => {
  const r = decidir(ideal);
  assert.equal(r.decisao, "aprovar");
  assert.equal(r.alertas.length, 0);
});

test("não aprova com confiança abaixo do mínimo", () => {
  const r = decidir({ ...ideal, confianca: CONFIANCA_MINIMA_APROVAR - 0.01 });
  assert.equal(r.decisao, "revisar");
  assert.match(r.motivos.join(" "), /abaixo do mínimo/i);
});

/* --------------------- o que NUNCA pode aprovar sozinho ---------------- */

test("face que não bate vai para revisão", () => {
  const r = decidir({ ...ideal, faceBate: false });
  assert.equal(r.decisao, "revisar");
  assert.match(r.alertas.join(" "), /selfie não confere/i);
});

test("face não verificada NÃO aprova sozinho, mesmo com confiança alta", () => {
  // O provedor gratuito pode não conseguir comparar. Sem esse sinal, a
  // aprovação automática abriria a porta para qualquer foto de documento.
  const r = decidir({ ...ideal, faceBate: null });
  assert.equal(r.decisao, "revisar");
  assert.match(r.motivos.join(" "), /comparação facial/i);
});

test("CPF divergente vai para revisão", () => {
  const r = decidir({
    ...ideal,
    documento: { ...docBom, cpfNoDocumento: "11144477735" },
  });
  assert.equal(r.decisao, "revisar");
  assert.match(r.alertas.join(" "), /CPF do documento não confere/i);
});

test("nome divergente vai para revisão", () => {
  const r = decidir({
    ...ideal,
    documento: { ...docBom, nomeNoDocumento: "JOAO PEREIRA LIMA" },
  });
  assert.equal(r.decisao, "revisar");
  assert.match(r.alertas.join(" "), /nome do documento não confere/i);
});

test("documento vencido vai para revisão", () => {
  const r = decidir({ ...ideal, documento: { ...docBom, validoAte: "2020-01-01" } });
  assert.equal(r.decisao, "revisar");
  assert.match(r.alertas.join(" "), /vencido/i);
});

test("sinal de adulteração vai para revisão, mesmo com confiança máxima", () => {
  const r = decidir({
    ...ideal,
    confianca: 1,
    documento: { ...docBom, sinaisAdulteracao: ["fonte inconsistente no campo de validade"] },
  });
  assert.equal(r.decisao, "revisar");
  assert.match(r.alertas.join(" "), /adulteração/i);
});

test("documento ilegível vai para revisão", () => {
  const r = decidir({ ...ideal, confianca: 1, documento: { ...docBom, legivel: false } });
  assert.equal(r.decisao, "revisar");
  assert.match(r.alertas.join(" "), /ilegível/i);
});

/* ------------------------------- recusa -------------------------------- */

test("imagem que não é documento é recusada", () => {
  const r = decidir({
    ...ideal,
    documento: { ...docBom, ehDocumento: false },
  });
  assert.equal(r.decisao, "recusar");
});

test("sem leitura do documento, manda para revisão e não recusa", () => {
  // Falha do provedor não é culpa do cliente.
  const r = decidir({ ...ideal, documento: null });
  assert.equal(r.decisao, "revisar");
  assert.equal(r.confianca, 0);
  assert.match(r.alertas.join(" "), /indisponível/i);
});

/* --------------------------- travessão de nomes ------------------------ */

test("nomeCompativel aceita variação de ordem, caixa e acento", () => {
  assert.equal(nomeCompativel("MARIA DA SILVA SOUZA", "Maria da Silva Souza"), true);
  assert.equal(nomeCompativel("Souza, Maria Silva", "Maria Silva Souza"), true);
  assert.equal(nomeCompativel("JOSE CARLOS DOS SANTOS", "Jose Carlos Santos"), true);
});

test("nomeCompativel rejeita pessoas diferentes", () => {
  assert.equal(nomeCompativel("MARIA SILVA SOUZA", "JOAO PEREIRA LIMA"), false);
  // Só o primeiro nome em comum não basta — e nome de DUAS partes é o caso
  // mais comum no Brasil, então é aqui que a regra precisa segurar.
  assert.equal(nomeCompativel("JOAO SILVA", "JOAO PEREIRA"), false);
  assert.equal(nomeCompativel("ANA SOUZA", "ANA LIMA"), false);
  // Uma parte em comum em nomes de três partes também não basta.
  assert.equal(nomeCompativel("MARIA SILVA SOUZA", "MARIA PEREIRA LIMA"), false);
});

test("nomeCompativel aceita duas partes em comum", () => {
  // O que deve passar: sobrenome repetido e variação de composição.
  assert.equal(nomeCompativel("JOAO SILVA SOUZA", "JOAO SILVA PEREIRA"), true);
  assert.equal(nomeCompativel("MARIA SOUZA", "MARIA SOUZA"), true);
  // Nome de uma parte só precisa bater inteiro.
  assert.equal(nomeCompativel("MARIANA", "MARIANA"), true);
  assert.equal(nomeCompativel("MARIANA", "JULIANA"), false);
});

test("nomeCompativel não quebra com vazio", () => {
  assert.equal(nomeCompativel("", "Maria Silva"), false);
  assert.equal(nomeCompativel("Maria Silva", ""), false);
  assert.equal(nomeCompativel("de da dos", "Maria Silva"), false);
});

/* ------------------------- leitura da resposta ------------------------- */

test("interpretarResposta lê o JSON limpo", () => {
  const r = interpretarResposta(
    JSON.stringify({
      ehDocumento: true,
      tipoAparente: "rg",
      legivel: true,
      nomeNoDocumento: "ANA LIMA",
      cpfNoDocumento: "52998224725",
      validoAte: "2030-05-01",
      sinaisAdulteracao: [],
      faceBate: true,
      confianca: 0.95,
    })
  );
  assert.equal(r.documento?.tipoAparente, "rg");
  assert.equal(r.faceBate, true);
  assert.equal(r.confianca, 0.95);
});

test("interpretarResposta aceita JSON dentro de cerca markdown", () => {
  const r = interpretarResposta('```json\n{"ehDocumento":true,"confianca":0.9}\n```');
  assert.equal(r.documento?.ehDocumento, true);
  assert.equal(r.confianca, 0.9);
});

test("interpretarResposta aceita JSON com texto em volta", () => {
  // Modelos pequenos às vezes escrevem antes de obedecer ao formato.
  const r = interpretarResposta('Claro! Aqui está:\n{"ehDocumento":true,"confianca":0.8}\nEspero ajudar.');
  assert.equal(r.documento?.ehDocumento, true);
});

test("interpretarResposta não estoura com resposta inválida", () => {
  const r = interpretarResposta("desculpe, não consegui analisar");
  assert.equal(r.documento, null);
  assert.equal(r.confianca, 0);
});

test("interpretarResposta normaliza confiança em escala 0-100", () => {
  assert.equal(interpretarResposta('{"confianca":95}').confianca, 0.95);
});

test("interpretarResposta descarta confiança não numérica", () => {
  assert.equal(interpretarResposta('{"confianca":"alta"}').confianca, 0);
});

test("interpretarResposta ignora data de validade fora do formato", () => {
  assert.equal(interpretarResposta('{"validoAte":"01/01/2030"}').documento?.validoAte, null);
});

test("interpretarResposta filtra sinais de adulteração não textuais", () => {
  const r = interpretarResposta('{"sinaisAdulteracao":["recorte",123,null,"  "]}');
  assert.deepEqual(r.documento?.sinaisAdulteracao, ["recorte"]);
});

test("interpretarResposta trata tipo desconhecido como indeterminado", () => {
  assert.equal(interpretarResposta('{"tipoAparente":"passaporte"}').documento?.tipoAparente, "indeterminado");
});

/* --------------------------- corpo do pedido --------------------------- */

test("montarPedido manda as imagens e as instruções", () => {
  const p = montarPedido({
    modelo: "modelo-teste",
    imagens: [
      { rotulo: "Frente do documento", base64: "AAA", mime: "image/jpeg" },
      { rotulo: "Selfie", base64: "BBB", mime: "image/png" },
    ],
    nomeCadastro: "Maria Silva",
    cpfCadastro: "52998224725",
    hoje: HOJE,
  });

  const conteudo = p.messages[0].content;
  const imgs = conteudo.filter((c) => c.type === "image_url");
  assert.equal(imgs.length, 2, "as duas imagens devem ir no pedido");
  assert.match(String(imgs[0].image_url.url), /^data:image\/jpeg;base64,AAA$/);
  assert.match(String(imgs[1].image_url.url), /^data:image\/png;base64,BBB$/);
  assert.equal(p.temperature, 0, "temperatura 0 para não variar a decisão");
});
