// Ciclo completo do emprestimo: o lead pede, o admin aprova e libera, e o
// valor cai na conta bancaria do lead. Usa um usuario descartavel.
import { readFileSync } from "node:fs";

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

const rnd = () => Math.random().toString(36).slice(2, 10);

function cpfValido(base) {
  const d = String(base).slice(0, 9).padStart(9, "0");
  const dig = (len) => {
    let s = 0;
    for (let i = 0; i < len; i++) s += Number(d[i]) * (len + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dig(9);
  const arr = (d + d1).split("");
  let s = 0;
  for (let i = 0; i < 10; i++) s += Number(arr[i]) * (11 - i);
  const d2 = ((s * 10) % 11) === 10 ? 0 : (s * 10) % 11;
  return `${d}${d1}${d2}`;
}

const rpc = async (token, fn, args) =>
  (
    await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    })
  ).json();

let novoId = "";
let token = "";

// ------------------------------------------------------------- 1. o lead
{
  const email = `lead-${rnd()}@teste-emprestimo.com.br`;
  const senha = `Teste@${rnd()}A1`;
  const res = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: {
        full_name: "Lead Teste Emprestimo",
        cpf: cpfValido(Math.floor(Math.random() * 900000000) + 100000000),
        phone: "11966665555",
      },
    }),
  });
  const u = await res.json();
  novoId = u.id;
  checar("lead criado", !!novoId, JSON.stringify(u).slice(0, 100));

  const login = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: senha }),
  }).then((r) => r.json());
  token = login.access_token;
  checar("lead logado", !!token);
}

// -------------------------------------------------- 2. pedido de emprestimo
// O cliente nao insere em loan_requests direto: quem grava e a server action
// requestLoan, com service_role. Fazemos igual.
let pedidoId = "";
{
  const res = await fetch(`${URL_}/rest/v1/loan_requests`, {
    method: "POST",
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ user_id: novoId, amount: 5000, installments: 12, status: "em_analise" }),
  });
  const j = await res.json();
  pedidoId = Array.isArray(j) ? j[0]?.id : j?.id;
  checar("lead registra pedido de R$ 5.000 em 12x", !!pedidoId, JSON.stringify(j).slice(0, 120));

  const saldoInicial = await rpc(token, "bank_summary", {});
  checar("conta continua zerada antes da liberação", Number(saldoInicial.balance) === 0, `saldo=${saldoInicial.balance}`);
}

// ------------------------------------------- 3. emprestimo nao liberado
{
  // bank_credit_loan so credita pedido com status 'liberado'
  const r = await fetch(`${URL_}/rest/v1/rpc/bank_credit_loan`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_loan_id: pedidoId }),
  });
  const corpo = await r.json();
  checar(
    "crédito é recusado enquanto o pedido não está liberado",
    /não está liberado/i.test(JSON.stringify(corpo)),
    JSON.stringify(corpo).slice(0, 80)
  );
}

// --------------------------------------- 4. admin aprova e libera o pedido
{
  const admin = (p, body) =>
    fetch(`${URL_}/rest/v1/${p}`, {
      method: "PATCH",
      headers: {
        apikey: SERVICE,
        Authorization: `Bearer ${SERVICE}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
    });

  // aprova com taxa, como faz o painel
  const aprova = await admin(`loan_requests?id=eq.${pedidoId}`, {
    status: "aprovado",
    monthly_rate: 0.0399,
    iof: 100,
    installment_value: 540.5,
    cet_yearly: 0.6,
    decision_note: "Aprovado no teste automatizado",
  });
  checar("admin aprova o pedido", aprova.ok, `status=${aprova.status}`);

  // libera
  const libera = await admin(`loan_requests?id=eq.${pedidoId}`, {
    status: "liberado",
    decision_note: "Liberado no teste automatizado",
  });
  checar("admin marca o pedido como liberado", libera.ok, `status=${libera.status}`);

  // credita na conta — e o mesmo que app/actions/admin.ts faz
  const credito = await fetch(`${URL_}/rest/v1/rpc/bank_credit_loan`, {
    method: "POST",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_loan_id: pedidoId }),
  });
  const c = await credito.json();
  checar("valor liberado é creditado na conta", !!c?.id, JSON.stringify(c).slice(0, 100));
}

// -------------------------------------------------- 5. saldo do lead
{
  const s = await rpc(token, "bank_summary", {});
  checar("lead vê R$ 5.000 na conta", Number(s.balance) === 5000, `saldo=${s.balance}`);

  const extrato = await fetch(`${URL_}/rest/v1/bank_transactions?select=kind,description,amount`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  const credito = extrato.find((t) => t.kind === "credito_emprestimo");
  checar("extrato mostra o crédito do empréstimo", !!credito, JSON.stringify(credito ?? {}).slice(0, 100));
  checar("descrição do crédito é legível", /Crédito de empréstimo liberado/i.test(credito?.description ?? ""), credito?.description ?? "");
}

// -------------------------------------------------- 6. idempotência
{
  const r = await fetch(`${URL_}/rest/v1/rpc/bank_credit_loan`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_loan_id: pedidoId }),
  });
  const c = await r.json();
  checar("segunda chamada devolve o mesmo lançamento", !!c?.id, JSON.stringify(c).slice(0, 80));

  const s = await rpc(token, "bank_summary", {});
  checar("saldo NÃO dobrou (crédito é idempotente)", Number(s.balance) === 5000, `saldo=${s.balance}`);
}

// -------------------------------------- 7. o lead gasta o dinheiro liberado
{
  // Desde o KYC, gastar exige identidade aprovada. Aprova direto no banco,
  // como o painel admin faz — o crédito em si já entrou sem KYC.
  await fetch(`${URL_}/rest/v1/kyc_submissions?user_id=eq.${novoId}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ status: "aprovado" }),
  });

  const r = await rpc(token, "bank_send_pix", {
    p_key: "loja@teste-emprestimo.com.br",
    p_amount: 1200,
    p_message: "compra",
  });
  checar("lead usa o valor liberado para um PIX", !!r?.id, JSON.stringify(r).slice(0, 80));

  const s = await rpc(token, "bank_summary", {});
  checar("saldo final é R$ 3.800", Number(s.balance) === 3800, `saldo=${s.balance}`);
}

// ------------------------------------------------------------------ limpeza
{
  await fetch(`${URL_}/auth/v1/admin/users/${novoId}`, {
    method: "DELETE",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  const pedidos = await fetch(`${URL_}/rest/v1/loan_requests?select=id&user_id=eq.${novoId}`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  }).then((r) => r.json());
  checar("usuário e pedidos de teste removidos", pedidos.length === 0, `restaram ${pedidos.length}`);
}

const falhas = resultados.filter((r) => !r.ok);
console.log(`\n===== ${resultados.length - falhas.length}/${resultados.length} passaram =====`);
if (falhas.length) {
  for (const f of falhas) console.log(`  - ${f.nome}  ${f.detalhe}`);
  process.exitCode = 1;
}
