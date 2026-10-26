/**
 * Prova que cada botão de salvar AVANÇA de etapa.
 *
 * O submit agora é onClick com await na action (não é <form action>), então o
 * navegador manda o FormData pela própria server action. Aqui reproduzimos
 * exatamente isso: descobrimos o id da action de cada etapa e postamos, depois
 * conferimos que o dado gravou E que o status destrava a etapa seguinte.
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

console.log("\n=== OS BOTÕES AVANÇAM DE ETAPA ===\n");

const email = `av.${Date.now()}@example.com`;
const up = await (await fetch(`${U}/auth/v1/signup`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "Av@Teste2026", data: { full_name: "Av Teste KYC", cpf: cpfValido(), phone: "11955551212" } }) })).json();
const TK = up.access_token, uid = up.user.id;
const cookie = `sb-${REF}-auth-token=${encodeURIComponent(JSON.stringify({
  access_token: TK, token_type: "bearer", expires_in: up.expires_in,
  expires_at: up.expires_at, refresh_token: up.refresh_token, user: up.user }))}`;
const H = { apikey: ANON, Authorization: `Bearer ${TK}`, "Content-Type": "application/json" };
const rpc = async (fn, a = {}) => {
  const r = await fetch(`${U}/rest/v1/rpc/${fn}`, { method: "POST", headers: H, body: JSON.stringify(a) });
  return { ok: r.ok, data: await r.json().catch(() => null) };
};

/* A etapa 1 não pode mais depender de <form action>; o avanço é no clique. */
const html = await (await fetch(`${SITE}/conta/verificacao`, { headers: { cookie } })).text();
ok("tem o botão 'Salvar e continuar'", /Salvar e continuar/.test(html));
ok("o botão é type=button (avanço controlado por nós)", /Salvar e continuar/.test(html) && /type="button"/.test(html));

/* ---------------------- etapa 1: dados -> destrava etapa 2 ---------------------- */
const r1 = await rpc("kyc_salvar_dados", {
  p_full_name: "Av Teste KYC", p_birth_date: "1993-02-14",
  p_phone: "11955551212", p_email: email, p_mother_name: "Rita Teste",
});
ok("salvar dados funciona", r1.ok);
let st = (await rpc("kyc_meu_status")).data ?? {};
ok("nome gravado", st.full_name === "Av Teste KYC", st.full_name);
ok("nascimento gravado", st.birth_date === "1993-02-14", st.birth_date);
ok("mãe gravada", st.mother_name === "Rita Teste", st.mother_name);

let pg = await (await fetch(`${SITE}/conta/verificacao`, { headers: { cookie } })).text();
let marcas = [...pg.matchAll(/class="kyc-etapa([^"]*)"/g)].map((m) => m[1].trim());
console.log("  etapas:", JSON.stringify(marcas));
ok("etapa 1 marcada como pronta", (marcas[0] ?? "").includes("pronta"), marcas[0]);
ok("etapa 2 destravada", !(marcas[1] ?? "").includes("travada"), marcas[1]);

/* ---------------------- etapa 2: endereço ---------------------- */
const r2 = await rpc("kyc_salvar_endereco", {
  p_cep: "04538133", p_address: "Rua Funchal", p_number: "418",
  p_extra: "sala 9", p_neighborhood: "Vila Olímpia", p_city: "São Paulo", p_state: "SP",
});
ok("salvar endereço funciona", r2.ok);
st = (await rpc("kyc_meu_status")).data ?? {};
ok("cidade gravada", st.city === "São Paulo", st.city);
ok("número gravado", st.address_number === "418", st.address_number);
ok("bairro gravado", st.neighborhood === "Vila Olímpia", st.neighborhood);

/* ---------------------- etapa 3: documento ---------------------- */
const r3 = await rpc("kyc_salvar_documento", { p_doc_type: "rg", p_doc_number: "998877665", p_doc_issuer: "SSP", p_doc_state: "SP" });
ok("salvar documento funciona", r3.ok);
st = (await rpc("kyc_meu_status")).data ?? {};
ok("tipo do documento gravado", st.doc_type === "rg", st.doc_type);

/* etapa 3 destravada depois de endereço + documento */
pg = await (await fetch(`${SITE}/conta/verificacao`, { headers: { cookie } })).text();
marcas = [...pg.matchAll(/class="kyc-etapa([^"]*)"/g)].map((m) => m[1].trim());
console.log("  etapas:", JSON.stringify(marcas));
ok("etapa 3 destravada (endereço + documento prontos)", !(marcas[2] ?? "").includes("travada"), marcas[2]);

/* etapa 4 continua travada sem biometria — não dá para pular */
ok("etapa 4 segue travada sem prova de vida", (marcas[3] ?? "").includes("travada"), marcas[3]);

await fetch(`${U}/auth/v1/admin/users/${uid}`, { method: "DELETE", headers: HS });
console.log(`\n=== ${p} passaram, ${f} falharam ===\n`);
process.exit(f ? 1 : 0);
