/**
 * O gate do KYC barra saída e libera entrada?
 * Roda com o token do admin (KYC ainda não aprovado).
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
const K = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const login = await fetch(`${U}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: K, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@sobreimprestimos.com.br", password: "Sobre@Admin2026" }),
});
const s = await login.json();
const H = { apikey: K, Authorization: `Bearer ${s.access_token}`, "Content-Type": "application/json" };

async function rpc(nome, args = {}) {
  const r = await fetch(`${U}/rest/v1/rpc/${nome}`, { method: "POST", headers: H, body: JSON.stringify(args) });
  const t = await r.text();
  let j = null;
  try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  return { ok: r.ok, data: j, erro: r.ok ? null : (j?.message ?? t) };
}

let passou = 0, falhou = 0;
const ok = (n, c, d = "") => { c ? (passou++, console.log(`  ✔ ${n}`)) : (falhou++, console.log(`  ✘ ${n}${d ? ` — ${d}` : ""}`)); };

console.log("\n=== GATE DO KYC ===\n");

const st = await rpc("kyc_meu_status");
ok("kyc_meu_status responde", st.ok, st.erro);
console.log(`  status atual: ${st.data?.status} | pode_movimentar: ${st.data?.pode_movimentar}`);

// entrada deve continuar liberada
const dep = await rpc("bank_move", {
  p_kind: "deposito", p_description: "Teste de entrada", p_amount: 25, p_counterparty: null, p_document_id: null,
});
ok("ENTRADA liberada sem KYC (depósito)", dep.ok, dep.erro);

const rec = await rpc("bank_receive_pix", { p_amount: 10, p_from: "Teste" });
ok("ENTRADA liberada sem KYC (PIX recebido)", rec.ok, rec.erro);

// saída deve ser barrada
const saida = await rpc("bank_move", {
  p_kind: "saque", p_description: "Teste de saída", p_amount: -5, p_counterparty: null, p_document_id: null,
});
ok("SAÍDA barrada sem KYC", !saida.ok && /verifica/i.test(saida.erro ?? ""), saida.ok ? "passou (deveria barrar)" : saida.erro);

const pix = await rpc("bank_send_pix", { p_key: "teste@exemplo.com", p_amount: 5, p_message: null });
ok("PIX enviado barrado sem KYC", !pix.ok, pix.ok ? "passou (deveria barrar)" : pix.erro);

const boleto = await rpc("bank_pay_dda", { p_barcode: "00190500954014481606906809350314337370000000100" });
ok("boleto barrado sem KYC", !boleto.ok, boleto.ok ? "passou (deveria barrar)" : boleto.erro);

// o gate reconhece o status
const pode = await rpc("kyc_pode_movimentar", { p_user_id: null });
ok("kyc_pode_movimentar = false", pode.data === false, JSON.stringify(pode.data));

console.log(`\n=== ${passou} passaram, ${falhou} falharam ===\n`);
process.exit(falhou ? 1 : 0);
