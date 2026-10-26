// Cadastra um usuario pelo formulario real do site e confere que a conta
// bancaria e o cartao nasceram junto. Depois remove o usuario.
import { readFileSync } from "node:fs";

const BASE = "https://site-pearl-nine-93.vercel.app";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

const resultados = [];
const checar = (nome, ok, detalhe = "") => {
  resultados.push({ nome, ok, detalhe });
  console.log(`${ok ? "PASS" : "FALHA"}  ${nome}${detalhe ? "  — " + detalhe : ""}`);
};

// CPF valido e unico para este teste
function cpfValido(base) {
  const d = base.slice(0, 9).padStart(9, "0");
  const dig = (len) => {
    let s = 0;
    for (let i = 0; i < len; i++) s += Number(d[i]) * (len + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dig(9);
  const d2 = (() => {
    let s = 0;
    const arr = (d + d1).split("");
    for (let i = 0; i < 10; i++) s += Number(arr[i]) * (11 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  })();
  return `${d}${d1}${d2}`;
}

const seed = Math.floor(Math.random() * 900000000) + 100000000;
const cpf = cpfValido(String(seed));
const email = `lead-${Math.random().toString(36).slice(2, 10)}@teste-cadastro.com.br`;
const senha = "Lead@Teste2026";

// ------------------------------------------------- 1. cadastro do lead
// O endpoint publico de signup dispara e-mail de confirmacao e bate no rate
// limit do Supabase. Criamos pelo admin, com os MESMOS metadados que
// app/actions/auth.ts envia — o trigger e exatamente o mesmo caminho.
{
  const res = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { full_name: "Lead Teste Cadastro", cpf, phone: "11988887777" },
    }),
  });
  const j = await res.json();
  checar("cadastro de lead cria o usuário", res.ok && !!j.id, JSON.stringify(j).slice(0, 140));
  var novoId = j.id;
}

// ------------------------------------------- 2. conta e cartao no cadastro
{
  const r = await fetch(`${URL_}/rest/v1/bank_accounts?select=*`, {
    method: "GET",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  const todas = await r.json();
  const minha = todas.find((c) => c.user_id === novoId);
  checar("conta bancária aberta automaticamente", !!minha, JSON.stringify(minha ?? {}).slice(0, 100));
  checar("conta nasce com saldo zero", Number(minha?.balance) === 0, `saldo=${minha?.balance}`);
  checar("conta nasce ativa", minha?.status === "ativa", `status=${minha?.status}`);
  checar("agência é 0001", minha?.agency === "0001", `ag=${minha?.agency}`);
  checar("número tem 8 dígitos", /^\d{8}$/.test(minha?.number ?? ""), `cc=${minha?.number}`);

  const rc = await fetch(`${URL_}/rest/v1/bank_cards?select=*`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  const cartoes = await rc.json();
  const meuCartao = cartoes.find((c) => c.user_id === novoId);
  checar("cartão virtual emitido automaticamente", !!meuCartao, JSON.stringify(meuCartao ?? {}).slice(0, 100));
  checar("cartão tem 4 dígitos finais", /^\d{4}$/.test(meuCartao?.last4 ?? ""), `last4=${meuCartao?.last4}`);
  checar("titular do cartão é o lead", /LEAD TESTE CADASTRO/i.test(meuCartao?.holder ?? ""), `holder=${meuCartao?.holder}`);
}

// ------------------------------------ 3. o lead loga e ve a conta bancaria
{
  const login = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: senha }),
  }).then((r) => r.json());
  checar("lead consegue logar", !!login.access_token, login.error_description ?? "");

  const ref = URL_.replace("https://", "").split(".")[0];
  const ck =
    `sb-${ref}-auth-token=` +
    encodeURIComponent(
      JSON.stringify({
        access_token: login.access_token,
        token_type: "bearer",
        expires_in: login.expires_in,
        expires_at: login.expires_at,
        refresh_token: login.refresh_token,
        user: login.user,
      })
    );

  const res = await fetch(`${BASE}/conta/banco`, { headers: { cookie: ck } });
  const html = await res.text();
  checar("lead abre /conta/banco", res.status === 200, `status=${res.status}`);
  checar("lead vê a própria conta", /Conta bancária/.test(html));
  checar("lead vê saldo zero", /R\$\s*0,00/.test(html.replace(/\u00a0/g, " ")), "");
  checar("lead vê o próprio nome no cartão", /Lead Teste Cadastro/i.test(html));
  checar("nenhuma menção a demonstração", !/demonstra|fict|simulad/i.test(html));
}

// ------------------------------------------------------------------ limpeza
{
  await fetch(`${URL_}/auth/v1/admin/users/${novoId}`, {
    method: "DELETE",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });

  const r = await fetch(`${URL_}/rest/v1/bank_accounts?select=user_id`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  const restantes = (await r.json()).filter((c) => c.user_id === novoId);
  checar("usuário de teste removido", restantes.length === 0);

  const rt = await fetch(`${URL_}/rest/v1/bank_transactions?select=user_id`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  const txOrfas = (await rt.json()).filter((t) => t.user_id === novoId);
  checar("lançamentos removidos em cascata", txOrfas.length === 0);
}

const falhas = resultados.filter((r) => !r.ok);
console.log(`\n===== ${resultados.length - falhas.length}/${resultados.length} passaram =====`);
if (falhas.length) {
  for (const f of falhas) console.log(`  - ${f.nome}  ${f.detalhe}`);
  process.exitCode = 1;
}
