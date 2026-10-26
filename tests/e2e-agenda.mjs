/**
 * Testa bank_run_schedules com service_role: agenda para hoje, executa,
 * confere o débito, e confirma que rodar de novo não debita em dobro.
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

const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = "admin@sobreimprestimos.com.br";
const SENHA = "Sobre@Admin2026";

let passou = 0;
let falhou = 0;
const ok = (n, c, d = "") => {
  if (c) {
    passou++;
    console.log(`  ✔ ${n}`);
  } else {
    falhou++;
    console.log(`  ✘ ${n}${d ? ` — ${d}` : ""}`);
  }
};
const perto = (a, b, e = 0.011) => Math.abs(a - b) < e;
const hoje = () => new Date().toISOString().slice(0, 10);

const login = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: SENHA }),
});
const sessao = await login.json();
const TOKEN = sessao.access_token;
const USER_ID = sessao.user.id;

async function rpc(nome, args, token = TOKEN, key = ANON) {
  const r = await fetch(`${URL_BASE}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const t = await r.text();
  let j = null;
  try {
    j = t ? JSON.parse(t) : null;
  } catch {
    j = t;
  }
  return { ok: r.ok, status: r.status, data: j, erro: r.ok ? null : (j?.message ?? t) };
}

async function ler(tabela, query, token = TOKEN, key = ANON) {
  const r = await fetch(`${URL_BASE}/rest/v1/${tabela}?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  });
  return r.ok ? await r.json() : [];
}

async function saldo() {
  const r = await rpc("bank_summary", {});
  const l = Array.isArray(r.data) ? r.data[0] : r.data;
  return Number(l?.balance ?? 0);
}

console.log("\n=== AGENDAMENTO EXECUTADO PELO BACKEND ===\n");

// garante saldo
await rpc("bank_deposit", { p_amount: 500, p_method: "ted", p_origin: "Preparo do teste" });

const antes = await saldo();
const ag = await rpc("bank_schedule", {
  p_kind: "pix",
  p_target: "cobranca@exemplo.com",
  p_amount: 40,
  p_runs_on: hoje(),
  p_message: "vence hoje",
});
ok("agendou para hoje", ag.ok, ag.erro);
const agId = (Array.isArray(ag.data) ? ag.data[0] : ag.data)?.id;

// service_role roda a fila
const run = await rpc("bank_run_schedules", {}, SERVICE, SERVICE);
ok("backend executou a fila", run.ok, run.erro);
ok("executou 1 agendamento", Number(run.data) === 1, `retornou ${JSON.stringify(run.data)}`);

const depois = await saldo();
ok("saldo caiu R$ 40", perto(antes - depois, 40), `${antes} → ${depois}`);

const linha = await ler("bank_schedules", `select=status,transaction_id&id=eq.${agId}`);
ok("agendamento marcado como executado", linha[0]?.status === "executado", linha[0]?.status);
ok("agendamento tem lançamento vinculado", !!linha[0]?.transaction_id);

// idempotência: rodar de novo não pode debitar outra vez
const saldoAntes2 = await saldo();
const run2 = await rpc("bank_run_schedules", {}, SERVICE, SERVICE);
const saldoDepois2 = await saldo();
ok("segunda execução não debita de novo", perto(saldoAntes2, saldoDepois2), `${saldoAntes2} → ${saldoDepois2}`);
ok("segunda execução não reprocessa nada", Number(run2.data) === 0, `retornou ${JSON.stringify(run2.data)}`);

// agendamento sem saldo vira 'falhou' em vez de travar a fila
// agendamento que vai falhar por falta de saldo na execução:
// precisa de saldo agora para ser aceito, e de saldo zero depois para falhar.
const saldoAntesDeAgendar = await saldo();
if (saldoAntesDeAgendar < 10) {
  await rpc("bank_deposit", { p_amount: 50, p_method: "pix", p_origin: "Preparo do teste de falha" });
}
const semSaldo = await rpc("bank_schedule", {
  p_kind: "pix", p_target: "x@y.com", p_amount: 10, p_runs_on: hoje(),
});
const semSaldoId = (Array.isArray(semSaldo.data) ? semSaldo.data[0] : semSaldo.data)?.id;
// Agendamento sem saldo NA HORA DE EXECUTAR vira 'falhou' em vez de travar a fila.
//
// bank_schedule exige saldo no momento de agendar, então o caminho é:
// agendar com saldo, zerar saldo + limite, e só então rodar a fila.
// Usamos service_role para zerar, porque bank_withdraw respeita o saldo
// disponível e não deixaria a conta exatamente em zero.
if (semSaldo.ok) {
  const zerar = await fetch(`${URL_BASE}/rest/v1/bank_accounts?user_id=eq.${USER_ID}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ balance: 0, overdraft: 0 }),
  });
  ok("conta zerada para o teste de falha", zerar.ok, `status ${zerar.status}`);

  const run3 = await rpc("bank_run_schedules", {}, SERVICE, SERVICE);
  ok("fila roda mesmo com agendamento sem saldo", run3.ok, run3.erro);

  const estaLinha = await ler("bank_schedules", `select=status&id=eq.${semSaldoId}`);
  ok("agendamento sem saldo marcado como falhou", estaLinha[0]?.status === "falhou", estaLinha[0]?.status);

  // devolve saldo para o teste de PIX recebido
  await rpc("bank_deposit", { p_amount: 100, p_method: "pix", p_origin: "Restaura saldo do teste" });
} else {
  ok("conta zerada para o teste de falha", false, `não consegui agendar: ${semSaldo.erro}`);
  ok("fila roda mesmo com agendamento sem saldo", false, "dependência falhou");
  ok("agendamento sem saldo marcado como falhou", false, "dependência falhou");
}

// PIX recebido credita quem recebe
console.log("\n=== PIX RECEBIDO ===\n");
const antesRec = await saldo();
const rec = await rpc("bank_receive_pix", {
  p_amount: 60, p_from: "Pagador Teste",
});
ok("PIX recebido aceito", rec.ok, rec.erro);
const depoisRec = await saldo();
ok("saldo subiu R$ 60", perto(depoisRec - antesRec, 60), `${antesRec} → ${depoisRec}`);

console.log(`\n=== ${passou} passaram, ${falhou} falharam ===\n`);
process.exit(falhou ? 1 : 0);
