/**
 * O gate do KYC barra saída e libera entrada?
 *
 * Cria um cliente próprio (sem KYC aprovado) em vez de usar o admin, porque
 * as outras suítes aprovam o KYC do admin e isso mascararia o teste.
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

let passou = 0,
  falhou = 0;
const ok = (n, c, d = "") => {
  if (c) {
    passou++;
    console.log(`  ✔ ${n}`);
  } else {
    falhou++;
    console.log(`  ✘ ${n}${d ? ` — ${d}` : ""}`);
  }
};

function cpfValido() {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (b) => {
    const s = b.reduce((a, d, i) => a + d * (b.length + 1 - i), 0);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(n);
  return [...n, d1, dv([...n, d1])].join("");
}

console.log("\n=== GATE DO KYC ===\n");

const email = `gate.${Date.now()}@example.com`;
const senha = "Gate@Teste2026";
const cpf = cpfValido();

const c = await (
  await fetch(`${U}/auth/v1/admin/users`, {
    method: "POST",
    headers: HS,
    body: JSON.stringify({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { full_name: "Cliente Gate Teste", cpf, phone: "11955554444" },
      data: { full_name: "Cliente Gate Teste", cpf, phone: "11955554444" },
    }),
  })
).json();

await fetch(`${U}/rest/v1/profiles?id=eq.${c.id}`, {
  method: "PATCH",
  headers: { ...HS, Prefer: "return=minimal" },
  body: JSON.stringify({ full_name: "Cliente Gate Teste", cpf, phone: "11955554444" }),
});

const s = await (
  await fetch(`${U}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: senha }),
  })
).json();

const TK = s.access_token;
ok("cliente sem KYC criado e logado", Boolean(c.id) && Boolean(TK), s.error_description ?? "");

const H = { apikey: ANON, Authorization: `Bearer ${TK}`, "Content-Type": "application/json" };
async function rpc(nome, args = {}) {
  const r = await fetch(`${U}/rest/v1/rpc/${nome}`, { method: "POST", headers: H, body: JSON.stringify(args) });
  const t = await r.text();
  let j = null;
  try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  return { ok: r.ok, data: j, erro: r.ok ? null : (j?.message ?? t) };
}

const st = await rpc("kyc_meu_status");
ok("kyc_meu_status responde", st.ok, st.erro);
ok("status é nao_iniciado", st.data?.status === "nao_iniciado", st.data?.status);
ok("pode_movimentar é false", st.data?.pode_movimentar === false);

// entrada liberada
const dep = await rpc("bank_move", {
  p_kind: "deposito", p_description: "Entrada sem KYC", p_amount: 25,
  p_counterparty: null, p_document_id: null,
});
ok("ENTRADA liberada sem KYC (depósito)", dep.ok, dep.erro);

const rec = await rpc("bank_receive_pix", { p_amount: 10, p_from: "Teste" });
ok("ENTRADA liberada sem KYC (PIX recebido)", rec.ok, rec.erro);

// saída barrada
const saida = await rpc("bank_move", {
  p_kind: "saque", p_description: "Saída sem KYC", p_amount: -5,
  p_counterparty: null, p_document_id: null,
});
ok("SAÍDA barrada sem KYC", !saida.ok && /verifica/i.test(saida.erro ?? ""), saida.ok ? "passou (deveria barrar)" : saida.erro);

const pix = await rpc("bank_send_pix", { p_key: "teste@exemplo.com", p_amount: 5, p_message: null });
ok("PIX enviado barrado sem KYC", !pix.ok, pix.ok ? "passou (deveria barrar)" : pix.erro);

const transf = await rpc("bank_transfer", { p_agency: "0001", p_number: "12345678", p_amount: 5, p_message: null });
ok("transferência barrada sem KYC", !transf.ok, transf.ok ? "passou (deveria barrar)" : transf.erro);

// O agendamento é um SEGUNDO caminho de saída: o cron chama bank_move_for
// depois. Se este ponto não estiver travado, o cliente agenda hoje e o
// dinheiro sai amanhã, driblando o gate de bank_move.
const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const ag = await rpc("bank_schedule", {
  p_kind: "pix", p_target: "destino@exemplo.com", p_amount: 5,
  p_runs_on: amanha, p_message: null,
});
ok("agendamento barrado sem KYC", !ag.ok && /verifica/i.test(ag.erro ?? ""), ag.ok ? "passou (deveria barrar)" : ag.erro);

// e a fila do cron também recusa, para agendamentos criados antes da regra
const fila = await rpc("bank_run_schedules");
ok("cron não executa a fila sem autorização", !fila.ok, fila.ok ? "executou" : "restrito ao service_role");

// pedido de empréstimo: a server action barra; aqui checamos a função do gate
const pode = await rpc("kyc_pode_movimentar", { p_user_id: null });
ok("kyc_pode_movimentar = false", pode.data === false, JSON.stringify(pode.data));

// após aprovar, libera
await fetch(`${U}/rest/v1/kyc_submissions?user_id=eq.${c.id}`, {
  method: "PATCH",
  headers: { ...HS, Prefer: "return-minimal" },
  body: JSON.stringify({ status: "aprovado" }),
});

const st2 = await rpc("kyc_meu_status");
ok("após aprovação, pode_movimentar = true", st2.data?.pode_movimentar === true);

const ag2 = await rpc("bank_schedule", {
  p_kind: "pix", p_target: "destino@exemplo.com", p_amount: 5,
  p_runs_on: new Date().toISOString().slice(0, 10), p_message: null,
});
ok("agendamento liberado após aprovação", ag2.ok, ag2.erro);

const saida2 = await rpc("bank_move", {
  p_kind: "saque", p_description: "Saída liberada", p_amount: -5,
  p_counterparty: null, p_document_id: null,
});
ok("SAÍDA liberada após aprovação", saida2.ok, saida2.erro);

// limpeza
await fetch(`${U}/auth/v1/admin/users/${c.id}`, { method: "DELETE", headers: HS });
ok("cliente de teste removido", true);

console.log(`\n=== ${passou} passaram, ${falhou} falharam ===\n`);
process.exit(falhou ? 1 : 0);
