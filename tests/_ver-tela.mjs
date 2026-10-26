/** O que a tela de verificação REALMENTE renderiza no HTML. */
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

const email = `tela.${Date.now()}@example.com`;
const up = await (await fetch(`${U}/auth/v1/signup`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "Tela@Teste2026", data: { full_name: "Tela Teste KYC", cpf: cpfValido(), phone: "11955556666" } }) })).json();
const cookie = `sb-${REF}-auth-token=${encodeURIComponent(JSON.stringify({
  access_token: up.access_token, token_type: "bearer", expires_in: up.expires_in,
  expires_at: up.expires_at, refresh_token: up.refresh_token, user: up.user }))}`;

const html = await (await fetch(`${SITE}/conta/verificacao`, { headers: { cookie } })).text();
console.log("bytes:", html.length);

console.log("\n--- tudo que aparece como <button> ---");
for (const m of html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)) {
  const tag = m[0].slice(0, m[0].indexOf(">") + 1);
  const txt = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  console.log(`  [${txt || "(vazio)"}]  ${tag.includes("disabled") ? "DESABILITADO" : "ok"}`);
}

console.log("\n--- textos importantes ---");
for (const f of ["Salvar e continuar", "Salvar", "Continuar", "Seus dados", "Ir para", "kyc-acoes", "kyc-trilha"]) {
  console.log(`  ${html.includes(f) ? "ACHOU   " : "faltando"} "${f}"`);
}

console.log("\n--- a etapa 1 esta no HTML? ---");
console.log("  name=full_name :", /name="full_name"/.test(html));
console.log("  <form>         :", (html.match(/<form/g) ?? []).length, "form(s)");
const main = (html.match(/<main[\s\S]*?<\/main>/) ?? [""])[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
console.log("  main:", main.slice(0, 400));

await fetch(`${U}/auth/v1/admin/users/${up.user.id}`, { method: "DELETE", headers: HS });
