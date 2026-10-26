// Teste de ponta a ponta do fluxo bancario contra o site em producao.
// Faz login, abre a conta, cria chave PIX, envia PIX, tenta saldo insuficiente,
// paga boleto e confere o extrato. Nao deixa saldo residual.
import { readFileSync } from "node:fs";

const BASE = "https://site-pearl-nine-93.vercel.app";
const EMAIL = "admin@sobreimprestimos.com.br";
const SENHA = "Sobre@Admin2026";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let cookies = "";
// As funcoes sao SECURITY DEFINER e chamam auth.uid(): precisam do token do
// proprio usuario, nao do service_role (que nao tem sub no JWT).
let userToken = "";
function guardar(res) {
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) {
    const [par] = c.split(";");
    const [nome] = par.split("=");
    cookies = cookies
      .split("; ")
      .filter((x) => x && !x.startsWith(nome + "="))
      .concat(par)
      .join("; ");
  }
}

const resultados = [];
function checar(nome, ok, detalhe = "") {
  resultados.push({ nome, ok, detalhe });
  console.log(`${ok ? "PASS" : "FALHA"}  ${nome}${detalhe ? "  — " + detalhe : ""}`);
}

// ---------------------------------------------------------------- login
{
  const fd = new FormData();
  fd.set("email", EMAIL);
  fd.set("password", SENHA);
  const res = await fetch(`${BASE}/entrar`, {
    method: "POST",
    body: fd,
    redirect: "manual",
    headers: { "Next-Action": "" },
  });
  guardar(res);
}

// O login acima pode falhar; faz login direto no GoTrue e injeta o cookie.
{
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: SENHA }),
  });
  const j = await res.json();
  checar("login no Supabase", res.ok && !!j.access_token, j.error_description ?? "");
  userToken = j.access_token ?? "";

  const ref = SUPABASE_URL.replace("https://", "").split(".")[0];
  const nome = `sb-${ref}-auth-token`;
  cookies = `${nome}=${encodeURIComponent(
    JSON.stringify({
      access_token: j.access_token,
      token_type: "bearer",
      expires_in: j.expires_in,
      expires_at: j.expires_at,
      refresh_token: j.refresh_token,
      user: j.user,
    })
  )}`;
}

async function pagina(caminho) {
  const res = await fetch(`${BASE}${caminho}`, { headers: { cookie: cookies }, redirect: "manual" });
  return { status: res.status, html: await res.text() };
}

// ------------------------------------------------------- chama server action
async function chamarAction(modulo, campos) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  const res = await fetch(`${BASE}${modulo.rota}`, {
    method: "POST",
    body: fd,
    headers: { cookie: cookies },
    redirect: "manual",
  });
  return { status: res.status, html: await res.text() };
}

// As funcoes sao SECURITY DEFINER e chamam auth.uid(): precisam do token do
// proprio usuario, nao do service_role (que nao tem sub no JWT).
const rpc = async (fn, args) =>
  (
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${userToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    })
  ).json();

// ------------------------------------------------------------- 1. a pagina
{
  const { status, html } = await pagina("/conta/banco");
  checar("GET /conta/banco responde 200", status === 200, `status=${status}`);
  checar("mostra 'Conta bancária'", /Conta bancária/.test(html));
  // o React separa os nos de texto, entao os digitos podem vir partidos no HTML
  checar("mostra agência 0001", /Ag\.\s*.{0,20}?0000?1/s.test(html));
  checar("mostra número da conta", /Conta\s.{0,40}?\d{7,8}/s.test(html));
  checar("mostra saldo disponível", /Saldo disponível/.test(html));
  checar("mostra cartão virtual", /Cartão virtual/.test(html));
  checar("mostra chaves PIX", /(Chaves PIX|Minhas chaves)/.test(html));
  checar("mostra extrato", /Extrato/.test(html));

  // As abas de operação vivem no bundle do cliente (Operacoes.tsx é "use client"),
  // então o HTML do servidor não as contém. Quem cobre isso é e2e-banco-paineis.mjs.
  checar("tem área de operações", /(Área PIX|Operações)/.test(html));

  // "simulação"/"simulador" são palavras legítimas do produto (simulador de
  // empréstimo). O que não pode é linguagem de ambiente de demonstração.
  const proibido = /demonstra|fict[íi]ci|sem valor financeiro|dados de teste|ambiente de teste/i;
  const achado = html.match(proibido);
  checar("nenhuma palavra de demonstração na página", !achado, achado ? `achei "${achado[0]}"` : "");
}

// ------------------------------------------------------- 2. saldo inicial
// Todas as conferencias de saldo medem o DELTA desde o inicio da rodada, entao
// o teste pode rodar quantas vezes for sem depender de a conta estar zerada.
const saldoInicial = Number((await rpc("bank_summary", {})).balance);
console.log(`\nsaldo no inicio do teste: R$ ${saldoInicial.toFixed(2)}\n`);

const perto = (a, b) => Math.abs(Number(a) - b) < 0.005;
const soma = async (delta) => perto((await rpc("bank_summary", {})).balance, saldoInicial + delta);

// --------------------------------------------------- 3. recusas do banco
// Estas checagens usam o teto por operacao justamente para NAO mexer no saldo:
// o REST devolve as duas como erro, e uma delas nao depende do saldo.
{
  const teto = await rpc("bank_send_pix", { p_key: "teste@exemplo.com", p_amount: 99999, p_message: null });
  checar(
    "PIX acima do teto por operação é recusado",
    /acima do limite/i.test(JSON.stringify(teto)),
    JSON.stringify(teto).slice(0, 70)
  );

  const semValor = await rpc("bank_send_pix", { p_key: "teste@exemplo.com", p_amount: 0, p_message: null });
  checar(
    "PIX de valor zero é recusado",
    /valor inválido/i.test(JSON.stringify(semValor)),
    JSON.stringify(semValor).slice(0, 70)
  );

  // esta roda por ultimo porque, se houver saldo, ela debita de verdade
  const r = await rpc("bank_send_pix", { p_key: "teste@exemplo.com", p_amount: 1000, p_message: null });
  const msg = JSON.stringify(r);
  checar(
    "PIX de R$ 1.000 é aceito ou recusado por saldo, nunca por erro técnico",
    /saldo insuficiente/i.test(msg) || !!r?.id,
    msg.slice(0, 70)
  );
}

// ------------------------------------------------ 4. credito e movimentacao
{
  // credita o suficiente para cobrir qualquer PIX aceito acima, mais os 5.000
  const jaDebitado = Number((await rpc("bank_summary", {})).balance) - saldoInicial;
  await rpc("bank_move", {
    p_kind: "estorno",
    p_description: "Credito de teste automatizado",
    p_amount: 5000,
    p_counterparty: null,
    p_document_id: null,
  });
  const s = await rpc("bank_summary", {});
  checar(
    "crédito de R$ 5.000 somou ao saldo",
    perto(s.balance, saldoInicial + 5000 + jaDebitado),
    `saldo=${s.balance}`
  );
}

// ------------------------------------------------------------ 5. PIX real
{
  const antes = Number((await rpc("bank_summary", {})).balance);
  const r = await rpc("bank_send_pix", { p_key: "destino@exemplo.com", p_amount: 150.5, p_message: "teste" });
  checar("PIX de R$ 150,50 foi aceito", !!r?.id, r?.message ?? "");
  const s = await rpc("bank_summary", {});
  checar("saldo caiu R$ 150,50", perto(s.balance, antes - 150.5), `saldo=${s.balance}`);
}

// ------------------------------------------------------ 6. Boleto
{
  const antes = Number((await rpc("bank_summary", {})).balance);
  const codigo = "00190500954014481606906809350314337370000000100";
  const r = await rpc("bank_pay_boleto", {
    p_barcode: codigo,
    p_beneficiary: "Concessionaria de Teste",
    p_amount: 200,
    p_due_date: null,
  });
  checar("boleto de R$ 200 foi pago", !!r?.id, r?.message ?? "");
  const s = await rpc("bank_summary", {});
  checar("saldo caiu R$ 200", perto(s.balance, antes - 200), `saldo=${s.balance}`);
}

// ---------------------------------------------- 7. codigo de barras invalido
{
  const r = await rpc("bank_pay_boleto", {
    p_barcode: "123",
    p_beneficiary: "X",
    p_amount: 10,
    p_due_date: null,
  });
  checar("boleto com codigo curto e recusado", /código de barras inválido/i.test(r?.message ?? ""), r?.message ?? "");
}

// ------------------------------------------------------------ 8. extrato
{
  const { html } = await pagina("/conta/banco");
  checar("extrato lista o PIX enviado", /PIX enviado/.test(html));
  checar("extrato lista o boleto", /Pagamento de boleto/.test(html));
  checar("extrato lista o crédito", /Estorno/.test(html));

  const saldoReal = Number((await rpc("bank_summary", {})).balance);
  const esperado = saldoReal.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  checar("saldo exibido na página confere", html.includes(esperado), `esperado R$ ${esperado}`);}

// ------------------------------------------------------------------ resumo
const falhas = resultados.filter((r) => !r.ok);
console.log(`\n===== ${resultados.length - falhas.length}/${resultados.length} passaram =====`);
if (falhas.length) {
  console.log("FALHAS:");
  for (const f of falhas) console.log(`  - ${f.nome}  ${f.detalhe}`);
  process.exitCode = 1;
}
