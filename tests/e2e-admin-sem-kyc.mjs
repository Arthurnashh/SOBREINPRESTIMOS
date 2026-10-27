/**
 * O administrador NÃO precisa fazer verificação de identidade.
 *
 * Motivo: o admin é quem aprova as verificações. Exigir a dele cria um ciclo
 * fechado — ninguém aprova o admin, e ele fica preso fora do próprio painel e
 * sem poder movimentar a conta.
 *
 * Este teste prova que:
 *   1. o admin movimenta sem KYC aprovado (o gate do banco o dispensa)
 *   2. o admin vê o menu completo, mesmo com KYC não aprovado
 *   3. o cliente comum CONTINUA barrado — a exceção não vazou
 *
 * Para o item 3 de verdade, o teste rebaixa o KYC do admin e confere, e depois
 * restaura. Um cliente comum recém-criado serve de controle.
 */
import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const SITE = "https://site-pearl-nine-93.vercel.app";
const U = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const REF = new URL(U).host.split(".")[0];
const HS = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

let p = 0, f = 0;
const ok = (n, c, d = "") => { if (c) { p++; console.log(`  ✔ ${n}`); } else { f++; console.log(`  ✘ ${n}${d ? ` — ${d}` : ""}`); } };

console.log("\n=== ADMIN NÃO FAZ VERIFICAÇÃO ===\n");

const adm = await (await fetch(`${U}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@sobreimprestimos.com.br", password: "Sobre@Admin2026" }),
})).json();
if (!adm.access_token) { console.log("  ✘ sem login de admin"); process.exit(1); }
const uidAdm = adm.user.id;
const HA = { apikey: ANON, Authorization: `Bearer ${adm.access_token}`, "Content-Type": "application/json" };
const cookieAdm = `sb-${REF}-auth-token=${encodeURIComponent(JSON.stringify({
  access_token: adm.access_token, token_type: "bearer", expires_in: adm.expires_in,
  expires_at: adm.expires_at, refresh_token: adm.refresh_token, user: adm.user }))}`;
const rpcA = async (fn, a = {}) => {
  const r = await fetch(`${U}/rest/v1/rpc/${fn}`, { method: "POST", headers: HA, body: JSON.stringify(a) });
  const t = await r.text();
  return { ok: r.ok, data: t ? JSON.parse(t) : null, erro: r.ok ? "" : t };
};

/* Guarda o status original do KYC do admin para restaurar no fim. */
const original = (await fetch(`${U}/rest/v1/kyc_submissions?user_id=eq.${uidAdm}&select=status`, { headers: HS })).json
  ? await (await fetch(`${U}/rest/v1/kyc_submissions?user_id=eq.${uidAdm}&select=status`, { headers: HS })).json()
  : [];
const statusOriginal = original[0]?.status ?? "nao_iniciado";
console.log(`  KYC original do admin: ${statusOriginal}\n`);

/* 1. Rebaixa o KYC do admin — o pior caso — e confere que ele segue liberado. */
await fetch(`${U}/rest/v1/kyc_submissions?user_id=eq.${uidAdm}`, {
  method: "PATCH", headers: { ...HS, "Content-Type": "application/json", Prefer: "return=minimal" },
  body: JSON.stringify({ status: "nao_iniciado" }),
});
const rebaixado = (await (await fetch(`${U}/rest/v1/kyc_submissions?user_id=eq.${uidAdm}&select=status`, { headers: HS })).json())[0]?.status;
ok("KYC do admin foi rebaixado para o teste", rebaixado === "nao_iniciado", rebaixado);

const podeAdm = await rpcA("kyc_pode_movimentar", { p_user_id: uidAdm });
ok("admin pode movimentar mesmo sem KYC aprovado", podeAdm.data === true, JSON.stringify(podeAdm.data));

/* O menu da conta precisa continuar completo. */
const contaAdm = await (await fetch(`${SITE}/conta`, { headers: { cookie: cookieAdm } })).text();
ok("menu do admin tem Conta bancária", /Conta bancária/.test(contaAdm));
ok("menu do admin tem Empréstimo", /Empréstimo/.test(contaAdm));
ok("menu do admin tem Administração", /Administração/.test(contaAdm));
ok("admin NÃO fica preso na verificação", !/Minha verificação<\/a>\s*<form[^>]*>\s*<button[^>]*>Sair/.test(contaAdm));

/* O admin consegue abrir o painel. */
const painel = await fetch(`${SITE}/admin/contas`, { headers: { cookie: cookieAdm } });
ok("admin abre o painel", painel.ok, `status ${painel.status}`);

/* 2. Controle: cliente comum com KYC não aprovado CONTINUA barrado. */
function cpfValido(){const n=Array.from({length:9},()=>Math.floor(Math.random()*10));const dv=(b)=>{const s=b.reduce((a,d,i)=>a+d*(b.length+1-i),0);const r=(s*10)%11;return r===10?0:r;};const d1=dv(n);return [...n,d1,dv([...n,d1])].join("");}
const email = `sem.${Date.now()}@example.com`;
const cli = await (await fetch(`${U}/auth/v1/signup`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "Sem@Teste2026", data: { full_name: "Cliente Sem Kyc", cpf: cpfValido(), phone: "11955557878" } }) })).json();
const uidCli = cli.user.id;
const HC = { apikey: ANON, Authorization: `Bearer ${cli.access_token}`, "Content-Type": "application/json" };
const cookieCli = `sb-${REF}-auth-token=${encodeURIComponent(JSON.stringify({
  access_token: cli.access_token, token_type: "bearer", expires_in: cli.expires_in,
  expires_at: cli.expires_at, refresh_token: cli.refresh_token, user: cli.user }))}`;

const podeCli = await (await fetch(`${U}/rest/v1/rpc/kyc_pode_movimentar`, { method: "POST", headers: HC, body: JSON.stringify({ p_user_id: uidCli }) })).json();
ok("cliente comum sem KYC NÃO pode movimentar", podeCli === false, JSON.stringify(podeCli));

const saque = await fetch(`${U}/rest/v1/rpc/bank_withdraw`, {
  method: "POST", headers: HC, body: JSON.stringify({ p_amount: 10, p_method: "pix" }),
});
ok("saque do cliente sem KYC é recusado", !saque.ok, `status ${saque.status}`);

const menuCli = await (await fetch(`${SITE}/conta`, { headers: { cookie: cookieCli } })).text();
ok("menu do cliente comum segue travado", !/Conta bancária/.test(menuCli) && /Minha verificação/.test(menuCli));

/* 3. A permissão é por is_admin de verdade, não pelo id. */
await fetch(`${U}/rest/v1/profiles?id=eq.${uidCli}`, {
  method: "PATCH", headers: { ...HS, "Content-Type": "application/json", Prefer: "return=minimal" },
  body: JSON.stringify({ is_admin: true }),
});
const virouAdmin = await (await fetch(`${U}/rest/v1/rpc/kyc_pode_movimentar`, { method: "POST", headers: HC, body: JSON.stringify({ p_user_id: uidCli }) })).json();
ok("promover a admin passa a dispensar o KYC", virouAdmin === true, JSON.stringify(virouAdmin));
await fetch(`${U}/rest/v1/profiles?id=eq.${uidCli}`, {
  method: "PATCH", headers: { ...HS, "Content-Type": "application/json", Prefer: "return=minimal" },
  body: JSON.stringify({ is_admin: false }),
});
const voltou = await (await fetch(`${U}/rest/v1/rpc/kyc_pode_movimentar`, { method: "POST", headers: HC, body: JSON.stringify({ p_user_id: uidCli }) })).json();
ok("voltar a cliente comum volta a exigir KYC", voltou === false, JSON.stringify(voltou));

/* ------------------------------ limpeza ------------------------------ */
await fetch(`${U}/rest/v1/kyc_submissions?user_id=eq.${uidAdm}`, {
  method: "PATCH", headers: { ...HS, "Content-Type": "application/json", Prefer: "return=minimal" },
  body: JSON.stringify({ status: statusOriginal }),
});
const restaurado = (await (await fetch(`${U}/rest/v1/kyc_submissions?user_id=eq.${uidAdm}&select=status`, { headers: HS })).json())[0]?.status;
ok("KYC do admin restaurado ao original", restaurado === statusOriginal, restaurado);

await fetch(`${U}/auth/v1/admin/users/${uidCli}`, { method: "DELETE", headers: HS });
ok("cliente de teste removido", true);

console.log(`\n=== ${p} passaram, ${f} falharam ===\n`);
process.exit(f ? 1 : 0);
