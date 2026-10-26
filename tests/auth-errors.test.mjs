import assert from "node:assert/strict";
import { test } from "node:test";
import { mensagemDeErroDeLogin } from "../lib/auth-errors.ts";

test("senha errada diz que a senha está errada", () => {
  for (const raw of [
    "Invalid login credentials",
    "invalid_grant",
    "Invalid credentials",
  ]) {
    assert.equal(mensagemDeErroDeLogin(raw), "E-mail ou senha incorretos.", raw);
  }
});

test("e-mail não confirmado pede a confirmação", () => {
  for (const raw of ["Email not confirmed", "email_not_confirmed"]) {
    assert.match(mensagemDeErroDeLogin(raw), /Confirme seu e-mail/, raw);
  }
});

test("excesso de tentativas pede espera em vez de culpar a senha", () => {
  for (const raw of ["Too many requests", "over_email_send_rate_limit", "Rate limit exceeded"]) {
    assert.match(mensagemDeErroDeLogin(raw), /Aguarde um minuto/, raw);
  }
});

test("falha de chave ou serviço NÃO acusa senha errada", () => {
  for (const raw of [
    "Invalid API key",
    "No API key found in request",
    "invalid JWT",
    "Unauthorized",
    "Forbidden",
    "fetch failed",
    "ECONNREFUSED",
    "502 Bad Gateway",
    "503 Service Unavailable",
  ]) {
    const msg = mensagemDeErroDeLogin(raw);
    assert.doesNotMatch(msg, /senha incorretos/i, `não deve culpar a senha: ${raw}`);
    assert.match(msg, /indispon|instantes/i, raw);
  }
});

test("erro desconhecido e vazio não vazam detalhe interno", () => {
  for (const raw of [undefined, "", "algo novo que o SDK inventou"]) {
    const msg = mensagemDeErroDeLogin(raw);
    assert.match(msg, /instantes/, String(raw));
    assert.doesNotMatch(msg, /undefined|null|\[object/i, String(raw));
  }
});

test("usuário inexistente não revela que a conta não existe", () => {
  assert.equal(mensagemDeErroDeLogin("User not found"), "E-mail ou senha incorretos.");
});
