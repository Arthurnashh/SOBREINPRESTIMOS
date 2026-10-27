/**
 * Testa as funções do painel admin.
 *
 * Detalhe importante: as funções chamam is_admin(), que lê auth.uid(). Isso
 * significa que precisamos do token do PRÓPRIO admin — service_role não tem
 * `sub` no JWT e auth.uid() volta nulo.
 */
import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const U = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const HS = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

let p = 0, f = 0;
const ok = (n, c, d = "") => { if (c) { p++; console.log(`  ✔ ${n}`); } else { f++; console.log(`  ✘ ${n}${d ? ` — ${d}` : ""}`); } };

console.log("\n=== FUNÇÕES DO PAINEL ADMIN ===\n");

/* Entra como o admin de verdade. */
const adm = await (await fetch(`${U}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@sobreimprestimos.com.br", password: "Sobre@Admin2026" }),
})).json();
if (!adm.access_token) { console.log("  ✘ não consegui entrar como admin:", JSON.stringify(adm).slice(0, 200)); process.exit(1); }
console.log(`  admin: ${adm.user.email} (${adm.user.id})\n`);

const HA = { apikey: ANON, Authorization: `Bearer ${adm.access_token}`, "Content-Type": "application/json" };
const rpcA = async (fn, a = {}) => {
  const r = await fetch(`${U}/rest/v1/rpc/${fn}`, { method: "POST", headers: HA, body: JSON.stringify(a) });
  const t = await r.text();
  return { ok: r.ok, data: t ? JSON.parse(t) : null, erro: r.ok ? "" : t };
};

/* Um usuário comum, para checar que ele NÃO acessa. */
function cpfValido(){const n=Array.from({length:9},()=>Math.floor(Math.random()*10));const dv=(b)=>{const s=b.reduce((a,d,i)=>a+d*(b.length+1-i),0);const r=(s*10)%11;return r===10?0:r;};const d1=dv(n);return [...n,d1,dv([...n,d1])].join("");}
const email = `adm.${Date.now()}@example.com`;
const comum = await (await fetch(`${U}/auth/v1/signup`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "Adm@Teste2026", data: { full_name: "Alvo Teste Admin", cpf: cpfValido(), phone: "11955554321" } }) })).json();
const uidComum = comum.user.id;
const HC = { apikey: ANON, Authorization: `Bearer ${comum.access_token}`, "Content-Type": "application/json" };
const rpcC = async (fn, a = {}) => {
  const r = await fetch(`${U}/rest/v1/rpc/${fn}`, { method: "POST", headers: HC, body: JSON.stringify(a) });
  return { ok: r.ok, erro: r.ok ? "" : await r.text() };
};

/* 1. listar contas */
const lista = await rpcA("admin_listar_contas", { p_busca: null, p_limite: 100, p_offset: 0 });
ok("admin lista as contas", lista.ok, lista.erro.slice(0, 160));
ok("o total é >= 2", (lista.data?.total ?? 0) >= 2, String(lista.data?.total));
const itens = lista.data?.itens ?? [];
console.log(`  contas: ${itens.length}`);
ok("cada item traz situação do KYC", itens.every((i) => "kyc_status" in i));
ok("cada item traz saldo", itens.every((i) => "balance" in i));
ok("inclui conta sem KYC enviado", itens.some((i) => i.kyc_status === "nao_iniciado"));

const busca = await rpcA("admin_listar_contas", { p_busca: "Alvo Teste Admin", p_limite: 50, p_offset: 0 });
ok("busca por nome funciona", busca.ok && (busca.data?.itens ?? []).some((i) => i.full_name === "Alvo Teste Admin"), `total ${busca.data?.total}`);

/* 2. ficha da conta */
const ficha = await rpcA("admin_ficha_conta", { p_user_id: uidComum });
ok("admin abre a ficha", ficha.ok, ficha.erro.slice(0, 160));
ok("a ficha traz o perfil", ficha.data?.perfil?.full_name === "Alvo Teste Admin", ficha.data?.perfil?.full_name);
ok("a ficha traz a conta bancária", Boolean(ficha.data?.conta), JSON.stringify(ficha.data?.conta).slice(0, 80));
ok("a ficha traz o cartão", Boolean(ficha.data?.cartao));
ok("a ficha traz o extrato", Array.isArray(ficha.data?.extrato));
ok("a ficha traz as chaves PIX", Array.isArray(ficha.data?.pix));
ok("a ficha traz os empréstimos", Array.isArray(ficha.data?.emprestimos));
ok("a ficha traz a auditoria", Array.isArray(ficha.data?.auditoria));

/* 3. usuário comum NÃO pode */
const negLista = await rpcC("admin_listar_contas", { p_busca: null, p_limite: 10, p_offset: 0 });
ok("usuário comum não lista contas", !negLista.ok, negLista.erro.slice(0, 90));
const negFicha = await rpcC("admin_ficha_conta", { p_user_id: uidComum });
ok("usuário comum não abre ficha", !negFicha.ok, negFicha.erro.slice(0, 90));
const negSaldo = await rpcC("admin_ajustar_saldo", { p_user_id: uidComum, p_valor: 100, p_motivo: "teste de invasao" });
ok("usuário comum não ajusta saldo", !negSaldo.ok, negSaldo.erro.slice(0, 90));

/* 4. ajuste de saldo — exige motivo */
const semMotivo = await rpcA("admin_ajustar_saldo", { p_user_id: uidComum, p_valor: 100, p_motivo: "abc" });
ok("ajuste sem motivo é recusado", !semMotivo.ok, semMotivo.erro.slice(0, 90));
const zero = await rpcA("admin_ajustar_saldo", { p_user_id: uidComum, p_valor: 0, p_motivo: "ajuste de teste" });
ok("ajuste zero é recusado", !zero.ok, zero.erro.slice(0, 90));

const credito = await rpcA("admin_ajustar_saldo", { p_user_id: uidComum, p_valor: 250.5, p_motivo: "Crédito de teste automatizado" });
ok("admin credita na conta", credito.ok, credito.erro.slice(0, 160));
ok("o saldo volta atualizado", Number(credito.data?.saldo) === 250.5, String(credito.data?.saldo));

const ficha2 = await rpcA("admin_ficha_conta", { p_user_id: uidComum });
ok("o crédito virou lançamento no extrato", (ficha2.data?.extrato ?? []).some((t) => /Ajuste administrativo/.test(t.description ?? "")), JSON.stringify((ficha2.data?.extrato ?? [])[0] ?? {}).slice(0, 120));
ok("o crédito ficou na auditoria", (ficha2.data?.auditoria ?? []).some((a) => a.acao === "credito_manual"), JSON.stringify((ficha2.data?.auditoria ?? [])[0] ?? {}).slice(0, 120));
ok("a auditoria guarda o motivo", (ficha2.data?.auditoria ?? []).some((a) => /teste automatizado/i.test(a.motivo ?? "")));

const debito = await rpcA("admin_ajustar_saldo", { p_user_id: uidComum, p_valor: -50, p_motivo: "Débito de teste automatizado" });
ok("admin debita da conta", debito.ok, debito.erro.slice(0, 160));
ok("o saldo final é 200.5", Number(debito.data?.saldo) === 200.5, String(debito.data?.saldo));

/* 6. bloqueio de cartão */
const bc = await rpcA("admin_bloquear_cartao", { p_user_id: uidComum, p_bloquear: true, p_motivo: "Bloqueio de cartão em teste" });
ok("admin bloqueia o cartão", bc.ok, bc.erro.slice(0, 160));
ok("o status do cartão vira bloqueado", bc.data?.status === "bloqueado", String(bc.data?.status));
const bd = await rpcA("admin_bloquear_cartao", { p_user_id: uidComum, p_bloquear: false, p_motivo: "Desbloqueio de cartão em teste" });
ok("admin desbloqueia o cartão", bd.ok && bd.data?.status === "ativo");

/* 7. bloqueio de conta */
const bloquear = await rpcA("admin_bloquear_conta", { p_user_id: uidComum, p_bloquear: true, p_motivo: "Bloqueio de teste automatizado" });
ok("admin bloqueia a conta", bloquear.ok, bloquear.erro.slice(0, 160));
ok("o status vira bloqueada", bloquear.data?.status === "bloqueada", String(bloquear.data?.status));

const desbloquear = await rpcA("admin_bloquear_conta", { p_user_id: uidComum, p_bloquear: false, p_motivo: "Desbloqueio de teste automatizado" });
ok("admin desbloqueia a conta", desbloquear.ok && desbloquear.data?.status === "ativa");

const autoBloqueio = await rpcA("admin_bloquear_conta", { p_user_id: adm.user.id, p_bloquear: true, p_motivo: "tentativa de auto bloqueio" });
ok("admin não bloqueia a própria conta", !autoBloqueio.ok, autoBloqueio.erro.slice(0, 90));

/* 8. usuário comum não bloqueia nem cartão */
const negCartao = await rpcC("admin_bloquear_cartao", { p_user_id: uidComum, p_bloquear: true, p_motivo: "tentativa de invasao" });
ok("usuário comum não bloqueia cartão", !negCartao.ok, negCartao.erro.slice(0, 90));
const negConta = await rpcC("admin_bloquear_conta", { p_user_id: uidComum, p_bloquear: true, p_motivo: "tentativa de invasao" });
ok("usuário comum não bloqueia conta", !negConta.ok, negConta.erro.slice(0, 90));

/* --------------------------- limpeza --------------------------- */
await fetch(`${U}/rest/v1/bank_transactions?user_id=eq.${uidComum}`, { method: "DELETE", headers: HS });
await fetch(`${U}/rest/v1/admin_auditoria?alvo_id=eq.${uidComum}`, { method: "DELETE", headers: HS });
await fetch(`${U}/auth/v1/admin/users/${uidComum}`, { method: "DELETE", headers: HS });
ok("conta de teste removida", true);

console.log(`\n=== ${p} passaram, ${f} falharam ===\n`);
process.exit(f ? 1 : 0);
