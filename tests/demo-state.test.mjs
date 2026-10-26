import assert from "node:assert/strict";
import { test } from "node:test";
import { addDemoTransfer, DEMO_BALANCE_CENTS, readDemoState, parsePixAmount } from "../lib/banking/demo-state.ts";

const owner = "test-user-a";
const initial = () => readDemoState(undefined, owner);
const transfer = (cents = 2500) => ({ id: `DEMO-${crypto.randomUUID()}`, date: "2026-10-26T12:00:00.000Z", cents });

test("aceita valores em reais com vírgula, ponto e milhar brasileiro", () => {
  for (const [input, expected] of [["1.000,50", 1000.5], ["1000.50", 1000.5], ["0,01", 0.01], [" 25 ", 25], ["25,5", 25.5]]) {
    assert.equal(parsePixAmount(input), expected);
  }
});

test("recusa negativos, expoentes, frações de centavo e valores ambíguos", () => {
  for (const input of ["", "0", "-1", "1e3", "Infinity", "NaN", "0.001", "1.000", "1,000.00", "1,23,45", "R$ 20", "9999999999999999999999"]) {
    assert.equal(parsePixAmount(input), null, input);
  }
});

test("PIX simulado debita centavos e mantém o extrato consistente", () => {
  const tx = transfer();
  const state = addDemoTransfer(initial(), tx);
  assert.equal(state.spent, 2500);
  assert.equal(DEMO_BALANCE_CENTS - state.spent, 422500);
  assert.deepEqual(readDemoState(JSON.stringify(state), owner), state);
  assert.deepEqual(state.transfers, [tx]);
});

test("não permite saldo negativo, NaN ou centavos fracionários", () => {
  for (const cents of [0, -1, 1.5, NaN, Infinity, DEMO_BALANCE_CENTS + 1]) {
    assert.equal(addDemoTransfer(initial(), transfer(cents)), null);
  }
  const state = addDemoTransfer(initial(), transfer(DEMO_BALANCE_CENTS));
  assert.equal(state.spent, DEMO_BALANCE_CENTS);
  assert.equal(addDemoTransfer(state, transfer(1)), null);
});

test("troca de usuário não revela a demonstração de outra conta", () => {
  const state = addDemoTransfer(initial(), transfer());
  assert.deepEqual(readDemoState(JSON.stringify(state), "test-user-b"), { owner: "test-user-b", spent: 0, transfers: [] });
});

test("cookies inválidos são descartados e nunca produzem saldo negativo", () => {
  for (const raw of ["invalid", "null", "[]", "{}", JSON.stringify({ owner, spent: -1, transfers: [] }), JSON.stringify({ owner, spent: DEMO_BALANCE_CENTS + 1, transfers: [] }), JSON.stringify({ owner, spent: 1, transfers: [transfer(2)] })]) {
    assert.deepEqual(readDemoState(raw, owner), initial());
  }
});

test("limita histórico e tamanho do cookie sem restaurar o valor já gasto", () => {
  let state = initial();
  for (let i = 0; i < 20; i++) state = addDemoTransfer(state, transfer(100));
  assert.equal(state.spent, 2000);
  assert.equal(state.transfers.length, 8);
  assert.ok(encodeURIComponent(JSON.stringify(state)).length < 3500);
  assert.deepEqual(readDemoState(JSON.stringify(state), owner), state);
});

test("descarta dados adicionais para não persistir chaves ou mensagens", () => {
  const state = addDemoTransfer(initial(), { ...transfer(), key: "private@example.com", description: "privada" });
  const clean = readDemoState(JSON.stringify(state), owner);
  assert.ok(!JSON.stringify(clean).includes("private@example.com"));
  assert.ok(!JSON.stringify(clean).includes("privada"));
});
