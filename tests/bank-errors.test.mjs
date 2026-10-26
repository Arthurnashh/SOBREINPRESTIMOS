import assert from "node:assert/strict";
import { test } from "node:test";
import { mensagemBanco, KIND_LABEL } from "../lib/banking/types.ts";

test("saldo insuficiente tem mensagem própria", () => {
  assert.equal(
    mensagemBanco('new row violates check constraint "saldo insuficiente"'),
    "Saldo insuficiente para esta operação."
  );
  assert.equal(
    mensagemBanco("ERROR: saldo insuficiente"),
    "Saldo insuficiente para esta operação."
  );
});

test("destino inválido é distinguido de saldo insuficiente", () => {
  const destino = mensagemBanco("conta de destino não encontrada");
  assert.match(destino, /destino não encontrada/i);
  assert.doesNotMatch(destino, /saldo/i);

  const mesma = mensagemBanco("a conta de destino é a mesma da origem");
  assert.match(mesma, /mesma da origem/i);
});

test("boleto recusa código curto com mensagem clara", () => {
  assert.match(mensagemBanco("código de barras inválido"), /44 dígitos/);
});

test("chave duplicada é explicada sem jargão de banco", () => {
  const msg = mensagemBanco('duplicate key value violates unique constraint, esta chave já está registrada');
  assert.equal(msg, "Esta chave PIX já está registrada.");
});

test("sessão expirada não vaza detalhe de JWT", () => {
  for (const raw of ["não autenticado", "invalid JWT", "JWT expired"]) {
    const msg = mensagemBanco(raw);
    assert.doesNotMatch(msg, /jwt|token|claim/i, raw);
    assert.match(msg, /sessão|expirou/i, raw);
  }
});

test("erro desconhecido não vaza SQL nem nome de tabela", () => {
  for (const raw of [undefined, "", 'relation "bank_accounts" does not exist', "permission denied for function bank_move"]) {
    const msg = mensagemBanco(raw);
    assert.doesNotMatch(msg, /bank_|relation|permission|pg_|sql/i, String(raw));
    assert.match(msg, /Tente novamente/, String(raw));
  }
});

test("todo tipo de movimentação tem rótulo legível", () => {
  for (const [kind, label] of Object.entries(KIND_LABEL)) {
    assert.ok(label.length > 3, kind);
    assert.doesNotMatch(label, /_/, kind);
  }
});
