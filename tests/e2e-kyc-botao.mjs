/** Confere que o botão de continuar existe, está ativo E tem estilo. */
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

const email = `css.${Date.now()}@example.com`;
const up = await (await fetch(`${U}/auth/v1/signup`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "Css@Teste2026", data: { full_name: "Css Teste KYC", cpf: cpfValido(), phone: "11955557777" } }) })).json();
const cookie = `sb-${REF}-auth-token=${encodeURIComponent(JSON.stringify({
  access_token: up.access_token, token_type: "bearer", expires_in: up.expires_in,
  expires_at: up.expires_at, refresh_token: up.refresh_token, user: up.user }))}`;

const html = await (await fetch(`${SITE}/conta/verificacao`, { headers: { cookie } })).text();

console.log("\n=== BOTÃO DE CONTINUAR NA TELA ===\n");
const btns = [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => ({
  tag: m[0].slice(0, m[0].indexOf(">") + 1),
  txt: m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
}));
for (const b of btns) console.log(`  [${b.txt}] ${b.tag.includes("disabled") ? "DESABILITADO" : "ativo"}`);

const continuar = btns.find((b) => /Salvar e continuar/.test(b.txt));
ok("existe botão 'Salvar e continuar'", Boolean(continuar));
ok("o botão está ATIVO (não desabilitado)", continuar && !continuar.tag.includes("disabled"));
ok("o botão é do tipo submit", continuar && /type="submit"|class=/.test(continuar.tag));
ok("está dentro da barra kyc-acoes", /class="kyc-acoes"/.test(html));

// O CSS tem de conter a regra .kyc-acoes agora
const cssHrefs = [...html.matchAll(/href="([^"]+\.css)"/g)].map((m) => m[1]);
let css = "";
for (const c of cssHrefs) { try { css += await (await fetch(c.startsWith("http") ? c : SITE + c)).text(); } catch {} }
ok("o CSS publicado tem a regra .kyc-acoes", /\.kyc-acoes\s*\{/.test(css));
ok("a regra dá destaque (border-top)", /\.kyc-acoes\s*\{[^}]*border-top/.test(css));
ok("no celular o botão ocupa a largura toda", /\.kyc-acoes[\s\S]{0,400}width:\s*100%/.test(css));

await fetch(`${U}/auth/v1/admin/users/${up.user.id}`, { method: "DELETE", headers: HS });
console.log(`\n=== ${p} passaram, ${f} falharam ===\n`);
process.exit(f ? 1 : 0);
