/**
 * O botão principal está VISÍVEL?
 *
 * O bug: `.bank-acao.principal` usa `background: var(--bk)` e `color: #fff`,
 * mas as variáveis --bk* só existiam dentro de `.bank-shell`. Fora dele (KYC,
 * admin, cartões) a variável não resolvia, o fundo ficava transparente e o
 * texto branco sumia: botão branco no fundo branco, invisível.
 *
 * Este teste lê o CSS publicado e confirma que as variáveis estão em :root,
 * que o botão tem cor de reserva, e que a página de verificação carrega a folha.
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
function cpfValido(){const n=Array.from({length:9},()=>Math.floor(Math.random()*10));const dv=(b)=>{const s=b.reduce((a,d,i)=>a+d*(b.length+1-i),0);const r=(s*10)%11;return r===10?0:r;};const d1=dv(n);return [...n,d1,dv([...n,d1])].join("");}

let p=0,f=0;
const ok=(n,c,d="")=>{ if(c){p++;console.log(`  ✔ ${n}`);} else {f++;console.log(`  ✘ ${n}${d?` — ${d}`:""}`);} };

console.log("\n=== O BOTÃO PRINCIPAL ESTÁ VISÍVEL? ===\n");

const email = `vis.${Date.now()}@example.com`;
const up = await (await fetch(`${U}/auth/v1/signup`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "Vis@Teste2026", data: { full_name: "Vis Teste KYC", cpf: cpfValido(), phone: "11955553434" } }) })).json();
const cookie = `sb-${REF}-auth-token=${encodeURIComponent(JSON.stringify({
  access_token: up.access_token, token_type: "bearer", expires_in: up.expires_in,
  expires_at: up.expires_at, refresh_token: up.refresh_token, user: up.user }))}`;

const html = await (await fetch(`${SITE}/conta/verificacao`, { headers: { cookie } })).text();
const cssHrefs = [...new Set([...html.matchAll(/href="([^"]+\.css)"/g)].map((m) => m[1]))];
let css = "";
for (const c of cssHrefs) { try { css += await (await fetch(c.startsWith("http") ? c : SITE + c)).text(); } catch {} }
console.log(`  folhas de estilo: ${cssHrefs.length}, ${css.length} bytes`);

/* 1. as variáveis precisam existir fora de .bank-shell.
   Existem DOIS blocos :root no bundle (o do tema e o do banco), e o
   minificador junta tudo numa linha — então procuramos o que declara --bk. */
const roots = [...css.matchAll(/:root\s*\{[^}]*\}/g)].map((m) => m[0]);
const rootBk = roots.find((r) => /--bk\s*:/.test(r)) ?? "";
console.log(`  blocos :root no bundle: ${roots.length}`);
ok("existe um :root declarando --bk", Boolean(rootBk));
ok(":root define --bk-deep", /--bk-deep\s*:/.test(rootBk));
ok(":root define --bk-line", /--bk-line\s*:/.test(rootBk));
ok("--bk aponta para a cor da marca", /--bk\s*:\s*var\(--brand\)/.test(rootBk), rootBk.slice(0, 100));

/* 2. o botão principal tem cor de reserva (nunca fica transparente) */
const principal = (css.match(/\.bank-acao\.principal\s*\{[^}]*\}/) ?? [""])[0];
console.log("  regra:", principal.replace(/\s+/g, " ").slice(0, 130));
ok(".bank-acao.principal define um fundo", /background\s*:/.test(principal));
ok("o fundo tem cor de reserva (não depende só da variável)", /var\(--bk\s*,\s*#/.test(principal));
ok("o texto é branco", /color\s*:\s*#fff/.test(principal));

/* 3. a página de verificação não tem .bank-shell, então o :root é o que salva */
ok("a página de verificação NÃO usa .bank-shell", !/bank-shell/.test(html));
ok("ainda assim o botão existe na página", /Salvar e continuar/.test(html));

/* 4. verificar a página do banco e a de admin também */
for (const [nome, rota] of [["/conta/banco", "/conta/banco"], ["/admin/kyc", "/admin/kyc"]]) {
  const r = await fetch(`${SITE}${rota}`, { headers: { cookie } });
  const t = await r.text();
  console.log(`  ${nome}: status ${r.status}${/bank-acao/.test(t) ? ", usa bank-acao" : ""}`);
}

await fetch(`${U}/auth/v1/admin/users/${up.user.id}`, { method: "DELETE", headers: HS });
console.log(`\n=== ${p} passaram, ${f} falharam ===\n`);
process.exit(f ? 1 : 0);
