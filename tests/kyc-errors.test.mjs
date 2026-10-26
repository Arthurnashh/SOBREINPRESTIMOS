import assert from "node:assert/strict";
import { test } from "node:test";
import { mensagemKyc, KYC_STATUS_LABEL, DOC_LABEL, PROOF_LABEL, FACE_SHOTS } from "../lib/kyc/types.ts";

test("a recusa de movimentação manda o cliente verificar a identidade", () => {
  const msg = mensagemKyc(
    "verificação de identidade pendente: conclua sua verificação para movimentar a conta"
  );
  assert.match(msg, /verificação de identidade/i);
  assert.match(msg, /movimentar/i);
  assert.doesNotMatch(msg, /pendente:/i, "não deve vazar o texto cru do banco");
});

test("agendar sem KYC tem mensagem própria, não a de movimentar", () => {
  const msg = mensagemKyc(
    "verificação de identidade pendente: conclua sua verificação para agendar"
  );
  assert.match(msg, /agendar/i);
  assert.doesNotMatch(msg, /movimentar/i);
});

test("pedir empréstimo sem KYC tem mensagem própria", () => {
  const msg = mensagemKyc("verificação de identidade pendente para empréstimo");
  assert.match(msg, /empréstimo/i);
  assert.doesNotMatch(msg, /movimentar/i);
});

test("erro de RLS do pedido vira orientação, não jargão", () => {
  const msg = mensagemKyc(
    'new row violates row-level security policy for table "loan_requests"'
  );
  assert.match(msg, /verificação de identidade/i);
  assert.doesNotMatch(msg, /row-level/i);
});

test("validações de cadastro continuam com mensagem clara", () => {
  assert.match(mensagemKyc("nome completo obrigatório"), /nome completo/i);
  assert.match(mensagemKyc("data de nascimento inválida"), /nascimento/i);
  assert.match(mensagemKyc("celular inválido"), /[Cc]elular/);
  assert.match(mensagemKyc("cep inválido"), /CEP/);
  assert.match(mensagemKyc("escolha cnh ou rg"), /CNH ou RG/);
  assert.match(mensagemKyc("órgão emissor obrigatório"), /órgão emissor/i);
});

test("erro desconhecido não vaza detalhe técnico", () => {
  const msg = mensagemKyc("deadlock detected on relation pg_catalog");
  assert.equal(msg, "Não foi possível concluir. Tente novamente.");
});

test("os cinco ângulos do rosto estão definidos e são únicos", () => {
  assert.equal(FACE_SHOTS.length, 5);
  const angulos = FACE_SHOTS.map((f) => f.angle);
  assert.equal(new Set(angulos).size, 5, `ângulos repetidos: ${angulos.join(", ")}`);
  for (const f of FACE_SHOTS) {
    assert.ok(f.label, `ângulo ${f.angle} sem rótulo`);
    assert.ok(f.instrucao, `ângulo ${f.angle} sem instrução`);
    assert.ok(f.label.length > 2 && f.instrucao.length > 5, `ângulo ${f.angle} com texto curto demais`);
  }
  // os ângulos que a prova de vida usa precisam existir
  for (const esperado of ["frontal", "direita", "esquerda", "sorriso", "perto"]) {
    assert.ok(angulos.includes(esperado), `falta o ângulo ${esperado}`);
  }
});

test("todo status de KYC tem rótulo em português", () => {
  for (const s of ["nao_iniciado", "em_analise", "aprovado", "recusado", "pendente"]) {
    assert.ok(KYC_STATUS_LABEL[s], `status ${s} sem rótulo`);
    assert.doesNotMatch(KYC_STATUS_LABEL[s], /_/, "rótulo não deve ter underline");
  }
});

test("documento aceita CNH e RG, com rótulos legíveis", () => {
  assert.ok(DOC_LABEL.cnh && DOC_LABEL.rg);
  assert.match(DOC_LABEL.cnh, /CNH/);
  assert.match(DOC_LABEL.rg, /RG/);
});

test("todo tipo de comprovante tem rótulo", () => {
  for (const [k, v] of Object.entries(PROOF_LABEL)) {
    assert.ok(v && typeof v === "string", `comprovante ${k} sem rótulo`);
  }
});
