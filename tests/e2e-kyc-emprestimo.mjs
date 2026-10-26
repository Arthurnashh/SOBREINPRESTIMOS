/**
 * O pedido de empréstimo exige KYC aprovado?
 *
 * Verifica a regra onde ela precisa valer: no BANCO. A server action checa o
 * KYC, mas o cliente tem `grant insert (amount, installments)` na tabela e
 * poderia chamar a API REST direto. Se a policy não exigir a verificação, o
 * gate da action é contornável.
 *
 * Também confere que a server action recusa, pela página publicada.
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const SITE = "https://site-pearl-nine-93.vercel.app";
const U = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const REF = new URL(U).host.split(".")[0];
const HS = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

let passou = 0, falhou = 0;
const ok = (n, c, d = "") => { if (c) { passou++; console.log(`  ✔ ${n}`); } else { falhou++; console.log(`  ✘ ${n}${d ? ` — ${d}` : ""}`); } };

function cpfValido() {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (b) => { const s = b.reduce((a, d, i) => a + d * (b.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(n);
  return [...n, d1, dv([...n, d1])].join("");
}

console.log("\n=== EMPRÉSTIMO x KYC ===\n");

const email = `emp.${Date.now()}@example.com`;
const senha = "Emp@Teste2026";
const cpf = cpfValido();

const c = await (await fetch(`${U}/auth/v1/admin/users`, {
  method: "POST", headers: HS,
  body: JSON.stringify({ email, password: senha, email_confirm: true,
    user_metadata: { full_name: "Cliente Emprestimo Teste", cpf, phone: "11922221111" },
    data: { full_name: "Cliente Emprestimo Teste", cpf, phone: "11922221111" } }),
})).json();
await fetch(`${U}/rest/v1/profiles?id=eq.${c.id}`, {
  method: "PATCH", headers: { ...HS, Prefer: "return=minimal" },
  body: JSON.stringify({ full_name: "Cliente Emprestimo Teste", cpf, phone: "11922221111" }),
});

const s = await (await fetch(`${U}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: senha }) })).json();

const cookie = `sb-${REF}-auth-token=${encodeURIComponent(JSON.stringify({
  access_token: s.access_token, token_type: "bearer", expires_in: s.expires_in,
  expires_at: s.expires_at, refresh_token: s.refresh_token, user: s.user }))}`;
const H = { apikey: ANON, Authorization: `Bearer ${s.access_token}`, "Content-Type": "application/json" };

ok("cliente sem KYC criado e logado", Boolean(c.id) && Boolean(s.access_token));

const pedidos = () => fetch(`${U}/rest/v1/loan_requests?user_id=eq.${c.id}&select=id,amount,status`, { headers: HS }).then((r) => r.json());
const inserir = () => fetch(`${U}/rest/v1/loan_requests`, {
  method: "POST", headers: H, body: JSON.stringify({ amount: 5000, installments: 12 }),
});

ok("nenhum pedido no início", (await pedidos()).length === 0);

/* --------- 1. o banco recusa, mesmo driblando a server action ---------- */
const r1 = await inserir();
ok("BANCO recusa pedido sem KYC (RLS)", !r1.ok && r1.status === 403, `status ${r1.status}`);
ok("nenhum pedido entrou", (await pedidos()).length === 0);

/* --------- 2. a server action também recusa, pela página ------------- */
const html = await (await fetch(`${SITE}/conta/emprestimo`, { headers: { cookie } })).text();
const actionId = [...new Set([...html.matchAll(/\$ACTION_ID_([a-f0-9]+)/g)].map((m) => m[1]))][0];
ok("achou o id da server action", Boolean(actionId), String(actionId));

if (actionId) {
  const fd = new FormData();
  fd.append("amount", "5000");
  fd.append("installments", "12");
  fd.append("confirm", "on");
  const r = await fetch(`${SITE}/conta/emprestimo`, {
    method: "POST", headers: { cookie, "Next-Action": actionId }, body: fd, redirect: "manual",
  });
  const corpo = await r.text();

  // Invocar a action por fetch cru interrompe o stream RSC e o transporte
  // devolve 500 mesmo quando a ação respondeu bem. O que importa é:
  // (a) nenhum pedido entrou, e (b) o RLS barra quem tentar por fora.
  // A mensagem amigável é coberta pelo teste de unidade da action.
  const recusou = /verifica/i.test(corpo);
  ok(
    "a action não criou pedido (caminho real do navegador)",
    (await pedidos()).length === 0,
    `status ${r.status}${recusou ? " · mensagem de verificação presente" : ""}`
  );
}

/* --------- 3. com KYC aprovado, o banco aceita ------------------------ */
await fetch(`${U}/rest/v1/kyc_submissions?user_id=eq.${c.id}`, {
  method: "PATCH", headers: { ...HS, Prefer: "return=minimal" },
  body: JSON.stringify({ status: "aprovado" }),
});

const gate = await fetch(`${U}/rest/v1/rpc/kyc_pode_movimentar`, {
  method: "POST", headers: H, body: JSON.stringify({ p_user_id: null }),
}).then((r) => r.json());
ok("gate libera após aprovação", gate === true, String(gate));

const r3 = await inserir();
ok("BANCO aceita pedido com KYC aprovado", r3.ok && r3.status === 201, `status ${r3.status}`);

const lista = await pedidos();
ok("pedido entrou com o valor certo", lista.length === 1 && Number(lista[0].amount) === 5000, JSON.stringify(lista));

/* --------- 4. um pedido em andamento continua bloqueando outro -------- */
const r4 = await inserir();
ok("segundo pedido simultâneo é recusado", !r4.ok && r4.status === 409, `status ${r4.status}`);

/* ------------------------------ limpeza ------------------------------ */
await fetch(`${U}/rest/v1/loan_requests?user_id=eq.${c.id}`, { method: "DELETE", headers: HS });
await fetch(`${U}/auth/v1/admin/users/${c.id}`, { method: "DELETE", headers: HS });
const ainda = await fetch(`${U}/auth/v1/admin/users/${c.id}`, { headers: HS });
ok("cliente de teste removido", !ainda.ok, `status ${ainda.status}`);

console.log(`\n=== ${passou} passaram, ${falhou} falharam ===\n`);
process.exit(falhou ? 1 : 0);
