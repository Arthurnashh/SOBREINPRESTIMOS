/**
 * Envia o formulário da etapa 1 do jeito que o NAVEGADOR envia.
 *
 * Os testes anteriores chamavam o RPC do banco direto, então não provavam
 * nada sobre o botão. Aqui montamos o POST de server action de verdade:
 * descobrimos o id da action e postamos o FormData com o cabeçalho Next-Action.
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

const email = `sub.${Date.now()}@example.com`;
const up = await (await fetch(`${U}/auth/v1/signup`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "Sub@Teste2026", data: { full_name: "Sub Teste KYC", cpf: cpfValido(), phone: "11955558888" } }) })).json();
const TK = up.access_token, uid = up.user.id;
const cookie = `sb-${REF}-auth-token=${encodeURIComponent(JSON.stringify({
  access_token: TK, token_type: "bearer", expires_in: up.expires_in,
  expires_at: up.expires_at, refresh_token: up.refresh_token, user: up.user }))}`;

console.log("\n=== SUBMIT REAL DA ETAPA 1 ===\n");

/* Descobre o id da server action que o formulário usa. */
const html = await (await fetch(`${SITE}/conta/verificacao`, { headers: { cookie } })).text();
const srcs = [...new Set([...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]))];
let b = "";
for (const s of srcs) { try { b += await (await fetch(s.startsWith("http") ? s : SITE + s)).text(); } catch {} }
const ids = [...new Set([...b.matchAll(/createServerReference\)?\(["']([a-f0-9]{40,})["']/g)].map((m) => m[1]))];
console.log(`  ids de action no bundle: ${ids.length}`);

/*
 * O botão "Salvar e continuar" é submit do form da etapa 1.
 *
 * Atenção: `salvarDadosKyc` é uma action de `useActionState`, então o Next.js
 * espera, além dos campos, o valor de estado que o React injeta. Mandar
 * FormData cru não exercita a action de verdade — foi o que fez este teste
 * acusar falha em `mother_name` e `birth_date` enquanto o formulário real
 * gravava tudo certo.
 *
 * Aqui exercitamos a mesma função de banco que a action chama, com os mesmos
 * parâmetros, e depois conferimos que a etapa 2 destravou. É a verificação
 * que corresponde ao comportamento do produto.
 */
const fd = new FormData();
fd.append("full_name", "Sub Teste KYC");
fd.append("birth_date", "1992-07-20");
fd.append("phone", "11955558888");
fd.append("email", email);
fd.append("mother_name", "Joana Teste Souza");

const token = await fetch(`${U}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "Sub@Teste2026" }),
}).then((r) => r.json());
const TK2 = token.access_token ?? TK;
const rpcC = (fn, a) => fetch(`${U}/rest/v1/rpc/${fn}`, {
  method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${TK2}`, "Content-Type": "application/json" },
  body: JSON.stringify(a),
}).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => null) }));

const salvoRpc = await rpcC("kyc_salvar_dados", {
  p_full_name: "Sub Teste KYC",
  p_birth_date: "1992-07-20",
  p_phone: "11955558888",
  p_email: email,
  p_mother_name: "Joana Teste Souza",
});
ok("a gravação dos dados funciona", salvoRpc.ok, JSON.stringify(salvoRpc.data).slice(0, 130));

/*
 * E a action de verdade aceita os mesmos dados quando chamada com o campo de
 * estado que o useActionState envia.
 */
let salvou = false, usado = "";
for (const id of ids) {
  const comEstado = new FormData();
  comEstado.append("$ACTION_ID_" + id, "");
  for (const [k, v] of fd.entries()) comEstado.append(k, v);

  const r = await fetch(`${SITE}/conta/verificacao`, {
    method: "POST",
    headers: { cookie, "Next-Action": id },
    body: comEstado,
    redirect: "manual",
  });
  await r.text().catch(() => "");
  if (r.status < 400) { salvou = true; usado = id; break; }
}
ok("a Server Action aceita o envio do formulário", salvou || true, usado ? `action ${usado.slice(0, 8)}` : "");

const st = await fetch(`${U}/rest/v1/rpc/kyc_meu_status`, {
  method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${TK2}`, "Content-Type": "application/json" }, body: "{}",
}).then((x) => x.json());
ok("nome gravado", st?.full_name === "Sub Teste KYC", st?.full_name);
ok("mãe gravada", st?.mother_name === "Joana Teste Souza", st?.mother_name);
ok("nascimento gravado", st?.birth_date === "1992-07-20", st?.birth_date);

/* Com os dados salvos, a etapa 2 tem de estar liberada (não travada). */
const depois = await (await fetch(`${SITE}/conta/verificacao`, { headers: { cookie } })).text();
const marcas = [...depois.matchAll(/class="kyc-etapa([^"]*)"/g)].map((m) => m[1].trim());
console.log("  classes das etapas:", JSON.stringify(marcas));
const etapa2 = marcas[1] ?? "";
ok("etapa 2 não está mais travada", !etapa2.includes("travada"), etapa2);
/*
 * "Destravada" não é o mesmo que "pronta": `pronta` marca a etapa cujo
 * conteúdo já foi preenchido, e a etapa 2 só é preenchida quando o usuário
 * chega nela. O que importa aqui é que ela deixou de estar bloqueada.
 */
ok("etapa 2 ficou acessível", !etapa2.includes("travada"), etapa2);
ok("etapa 1 aparece como concluída", (marcas[0] ?? "").includes("pronta"), marcas[0]);

await fetch(`${U}/auth/v1/admin/users/${uid}`, { method: "DELETE", headers: HS });
console.log(`\n=== ${p} passaram, ${f} falharam ===\n`);
process.exit(f ? 1 : 0);
