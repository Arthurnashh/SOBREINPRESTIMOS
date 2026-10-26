/**
 * O cron de agendamentos respeita o KYC?
 *
 * Este é o caminho indireto: o cliente agenda (bank_schedule), e dias depois o
 * cron chama bank_run_schedules() com service_role — que por sua vez chama
 * bank_move_for(). Se o gate existisse só em bank_move, o dinheiro sairia
 * de uma conta sem verificação sem nunca passar pelo gate.
 *
 * Cria um cliente sem KYC, tenta agendar (deve ser barrado), e depois força
 * um agendamento antigo direto no banco para provar que a fila também recusa.
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

const U = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const HS = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
const H = (t) => ({ apikey: ANON, Authorization: `Bearer ${t}`, "Content-Type": "application/json" });

let passou = 0, falhou = 0;
const ok = (n, c, d = "") => { if (c) { passou++; console.log(`  ✔ ${n}`); } else { falhou++; console.log(`  ✘ ${n}${d ? ` — ${d}` : ""}`); } };

function cpfValido() {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (b) => { const s = b.reduce((a, d, i) => a + d * (b.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(n);
  return [...n, d1, dv([...n, d1])].join("");
}

async function rpc(nome, args, token) {
  const r = await fetch(`${U}/rest/v1/rpc/${nome}`, { method: "POST", headers: H(token), body: JSON.stringify(args) });
  const t = await r.text();
  let j = null;
  try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  return { ok: r.ok, data: j, erro: r.ok ? null : (j?.message ?? t) };
}

console.log("\n=== CRON DE AGENDAMENTOS x KYC ===\n");

const email = `cron.${Date.now()}@example.com`;
const senha = "Cron@Teste2026";
const cpf = cpfValido();

const c = await (await fetch(`${U}/auth/v1/admin/users`, {
  method: "POST", headers: HS,
  body: JSON.stringify({ email, password: senha, email_confirm: true,
    user_metadata: { full_name: "Cliente Cron Teste", cpf, phone: "11933332222" },
    data: { full_name: "Cliente Cron Teste", cpf, phone: "11933332222" } }),
})).json();
await fetch(`${U}/rest/v1/profiles?id=eq.${c.id}`, {
  method: "PATCH", headers: { ...HS, Prefer: "return=minimal" },
  body: JSON.stringify({ full_name: "Cliente Cron Teste", cpf, phone: "11933332222" }),
});

const s = await (await fetch(`${U}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: senha }) })).json();
const TK = s.access_token;
ok("cliente sem KYC criado", Boolean(c.id) && Boolean(TK));

// dá saldo via service_role para o agendamento não falhar por saldo
await fetch(`${U}/rest/v1/bank_accounts?user_id=eq.${c.id}`, {
  method: "PATCH", headers: { ...HS, Prefer: "return=minimal" },
  body: JSON.stringify({ balance: 500 }),
});
const saldoAntes = await fetch(`${U}/rest/v1/bank_accounts?user_id=eq.${c.id}&select=balance`, { headers: HS }).then((r) => r.json());
ok("saldo semeado para o teste", Number(saldoAntes?.[0]?.balance) === 500, JSON.stringify(saldoAntes));

// 1) agendar pelo app deve ser barrado pelo gate
const ag = await rpc("bank_schedule", {
  p_kind: "pix", p_target: "destino@exemplo.com", p_amount: 100,
  p_runs_on: new Date().toISOString().slice(0, 10), p_message: null,
}, TK);
ok("app barra agendamento sem KYC", !ag.ok && /verifica/i.test(ag.erro ?? ""), ag.ok ? "agendou" : ag.erro);

// 2) um agendamento que já existia (criado direto no banco, driblando o gate)
//    não pode ser executado pela fila
await fetch(`${U}/rest/v1/bank_schedules`, {
  method: "POST", headers: { ...HS, Prefer: "return=minimal" },
  body: JSON.stringify({ user_id: c.id, kind: "pix", target: "destino@exemplo.com",
    amount: 100, runs_on: new Date().toISOString().slice(0, 10), status: "agendado" }),
});

const antes = await fetch(`${U}/rest/v1/bank_schedules?user_id=eq.${c.id}&select=id,status,amount`, { headers: HS }).then((r) => r.json());
ok("agendamento antigo existe e está agendado", antes?.[0]?.status === "agendado", JSON.stringify(antes));

// roda a fila como o cron roda
const fila = await fetch(`${U}/rest/v1/rpc/bank_run_schedules`, {
  method: "POST", headers: HS, body: JSON.stringify({}),
});
ok("cron executou a fila", fila.ok, `${fila.status}`);

const depois = await fetch(`${U}/rest/v1/bank_schedules?user_id=eq.${c.id}&select=status,executed_at,transaction_id`, { headers: HS }).then((r) => r.json());
ok("agendamento virou 'falhou' em vez de executar", depois?.[0]?.status === "falhou", JSON.stringify(depois));
ok("não gerou lançamento", depois?.[0]?.transaction_id === null, String(depois?.[0]?.transaction_id));

const saldoDepois = await fetch(`${U}/rest/v1/bank_accounts?user_id=eq.${c.id}&select=balance`, { headers: HS }).then((r) => r.json());
ok("SALDO INTACTO — o dinheiro não saiu", Number(saldoDepois?.[0]?.balance) === 500, `saldo=${saldoDepois?.[0]?.balance}`);

// 3) com KYC aprovado, a fila executa normalmente
await fetch(`${U}/rest/v1/kyc_submissions?user_id=eq.${c.id}`, {
  method: "PATCH", headers: { ...HS, Prefer: "return=minimal" },
  body: JSON.stringify({ status: "aprovado" }),
});

await fetch(`${U}/rest/v1/bank_schedules`, {
  method: "POST", headers: { ...HS, Prefer: "return=minimal" },
  body: JSON.stringify({ user_id: c.id, kind: "pix", target: "destino@exemplo.com",
    amount: 100, runs_on: new Date().toISOString().slice(0, 10), status: "agendado" }),
});

const fila2 = await fetch(`${U}/rest/v1/rpc/bank_run_schedules`, { method: "POST", headers: HS, body: JSON.stringify({}) });
const res2 = await fila2.json();
ok("cron libera e executa após aprovação", res2 >= 1, `executados=${JSON.stringify(res2)}`);

const saldoFinal = await fetch(`${U}/rest/v1/bank_accounts?user_id=eq.${c.id}&select=balance`, { headers: HS }).then((r) => r.json());
ok("saldo caiu R$ 100 agora", Number(saldoFinal?.[0]?.balance) === 400, `saldo=${saldoFinal?.[0]?.balance}`);

// limpeza
await fetch(`${U}/rest/v1/bank_schedules?user_id=eq.${c.id}`, { method: "DELETE", headers: HS });
await fetch(`${U}/auth/v1/admin/users/${c.id}`, { method: "DELETE", headers: HS });
ok("cliente de teste removido", true);

console.log(`\n=== ${passou} passaram, ${falhou} falharam ===\n`);
process.exit(falhou ? 1 : 0);
