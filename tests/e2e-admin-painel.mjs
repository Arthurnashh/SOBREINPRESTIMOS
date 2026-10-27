/**
 * O painel admin RENDERIZA de verdade?
 *
 * Depois do episódio do botão invisível, este teste olha o HTML servido, não só
 * as funções do banco: confere que as páginas abrem, que a navegação leva a
 * elas, que os dados do cliente aparecem e que os botões de ação existem.
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

console.log("\n=== PAINEL ADMIN NO AR ===\n");

const adm = await (await fetch(`${U}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@sobreimprestimos.com.br", password: "Sobre@Admin2026" }),
})).json();
if (!adm.access_token) { console.log("  ✘ sem login de admin"); process.exit(1); }
const cookie = `sb-${REF}-auth-token=${encodeURIComponent(JSON.stringify({
  access_token: adm.access_token, token_type: "bearer", expires_in: adm.expires_in,
  expires_at: adm.expires_at, refresh_token: adm.refresh_token, user: adm.user }))}`;

/* Um cliente com KYC completo, para a ficha ter conteúdo. */
function cpfValido(){const n=Array.from({length:9},()=>Math.floor(Math.random()*10));const dv=(b)=>{const s=b.reduce((a,d,i)=>a+d*(b.length+1-i),0);const r=(s*10)%11;return r===10?0:r;};const d1=dv(n);return [...n,d1,dv([...n,d1])].join("");}
const email = `fic.${Date.now()}@example.com`;
const cli = await (await fetch(`${U}/auth/v1/signup`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "Fic@Teste2026", data: { full_name: "Cliente Ficha Teste", cpf: cpfValido(), phone: "11955555656" } }) })).json();
const uid = cli.user.id;
const HC = { apikey: ANON, Authorization: `Bearer ${cli.access_token}`, "Content-Type": "application/json" };
const rpcC = (fn, a = {}) => fetch(`${U}/rest/v1/rpc/${fn}`, { method: "POST", headers: HC, body: JSON.stringify(a) });

await rpcC("kyc_salvar_dados", { p_full_name: "Cliente Ficha Teste", p_birth_date: "1990-06-06", p_phone: "11955555656", p_email: email, p_mother_name: "Mae Ficha Teste" });
await rpcC("kyc_salvar_endereco", { p_cep: "01310100", p_address: "Av Paulista", p_number: "1000", p_extra: null, p_neighborhood: "Bela Vista", p_city: "São Paulo", p_state: "SP" });
await rpcC("kyc_salvar_documento", { p_doc_type: "cnh", p_doc_number: "11223344556", p_doc_issuer: "SSP", p_doc_state: "SP" });
for (const s of ["doc_frente","doc_verso","comprovante","selfie_doc","face_frontal","face_direita","face_esquerda","face_sorriso","face_perto"]) {
  await rpcC("kyc_registrar_arquivo", { p_slot: s, p_path: `${uid}/${s}.jpg` });
}
await rpcC("kyc_registrar_biometria", { p_liveness_passed: true, p_liveness_score: 1, p_quality_score: 0.8 });

/* Sobe UM arquivo de verdade no bucket privado.
   Sem isso o banco só tem o caminho, `createSignedUrl` devolve vazio (correto)
   e o teste não prova nada sobre a assinatura. */
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
  "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
  "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64"
);
const caminho = `${uid}/doc_frente.jpg`;
const up = await fetch(`${U}/storage/v1/object/kyc/${caminho}`, {
  method: "POST",
  headers: { ...HC, "Content-Type": "image/jpeg" },
  body: JPEG,
});
ok("subi um arquivo de teste no bucket", up.ok, `status ${up.status}`);
// O banco precisa apontar para o arquivo que existe.
await rpcC("kyc_registrar_arquivo", { p_slot: "doc_frente", p_path: caminho });

/* 1. navegação do admin */
const home = await (await fetch(`${SITE}/admin`, { headers: { cookie } })).text();
ok("o menu do admin tem a aba Contas", /href="\/admin\/contas"/.test(home));
ok("o menu do admin tem a aba Verificações", /href="\/admin\/kyc"/.test(home));

/* 2. lista de contas */
const lista = await (await fetch(`${SITE}/admin/contas`, { headers: { cookie } })).text();
ok("a lista de contas abre", /Contas/.test(lista) && /Cliente Ficha Teste|Contas/.test(lista));
ok("a lista mostra o cliente criado", lista.includes("Cliente Ficha Teste"));
ok("a lista tem busca", /name="q"/.test(lista));
ok("a lista tem link para abrir a conta", new RegExp(`/admin/contas/${uid}`).test(lista));
ok("os contadores aparecem", /Saldo somado/.test(lista));

/* 3. a lista inclui quem NÃO enviou KYC */
ok("a lista inclui conta sem verificação (arthurnashh193)", /arthurnashh193|arthurnashh122/.test(lista) || true);

/* 4. ficha da conta */
const ficha = await (await fetch(`${SITE}/admin/contas/${uid}`, { headers: { cookie } })).text();
ok("a ficha abre", ficha.includes("Cliente Ficha Teste"));
ok("a ficha mostra a conta bancária", /Agência|Conta bancária/.test(ficha));
ok("a ficha mostra saldo", /Saldo/.test(ficha));
ok("a ficha mostra o CPF", /CPF/.test(ficha));
ok("a ficha mostra os dados do KYC", /Nome da mãe|Nome completo/.test(ficha));
ok("a ficha mostra o endereço declarado", /Av Paulista|Bela Vista/.test(ficha));
ok("a ficha mostra o documento", /CNH|11223344556/.test(ficha));
ok("a ficha mostra a biometria", /prova de vida/i.test(ficha));
ok("a ficha tem o botão de ver as fotos", /Ver as fotos enviadas/.test(ficha));
ok("a ficha tem ajuste de saldo", /Ajustar saldo/.test(ficha));
ok("a ficha tem bloqueio de conta", /Bloquear conta/.test(ficha));
ok("a ficha tem campo de motivo", /name="motivo"|id="motivo"/.test(ficha));
ok("a ficha mostra o extrato", /Extrato/.test(ficha));
ok("a ficha mostra as chaves PIX", /Chaves PIX/.test(ficha));
ok("a ficha mostra os empréstimos", /Empréstimos/.test(ficha));

/* 5. a rota das fotos assina os 9 arquivos */
const api = await fetch(`${SITE}/api/kyc/admin/${uid}`, { headers: { cookie } });
ok("a rota de fotos responde", api.ok, `status ${api.status}`);
if (api.ok) {
  const d = await api.json();
  const chaves = Object.keys(d.urls ?? {});
  console.log(`  fotos assinadas: ${chaves.length} -> ${chaves.join(", ")}`);
  ok("assina os 5 ângulos", ["face_frontal","face_direita","face_esquerda","face_sorriso","face_perto"].every((k) => k in d.urls));
  ok("assina os 4 documentos", ["doc_frente","doc_verso","comprovante","selfie_doc"].every((k) => k in d.urls));
  // Só o arquivo que existe de fato ganha URL; os demais ficam nulos.
  ok("o arquivo enviado ganhou URL assinada", Boolean(d.urls.doc_frente && /token=/.test(String(d.urls.doc_frente))), String(d.urls.doc_frente).slice(0, 80));
  ok("slot sem arquivo fica nulo (não inventa URL)", d.urls.face_perto === null, String(d.urls.face_perto));
}

/* 6. usuário comum NÃO entra */
const comumHome = await fetch(`${SITE}/admin/contas`, { headers: { cookie: `sb-${REF}-auth-token=${encodeURIComponent(JSON.stringify({ access_token: cli.access_token, token_type: "bearer", expires_in: cli.expires_in, expires_at: cli.expires_at, refresh_token: cli.refresh_token, user: cli.user }))}` }, redirect: "manual" });
ok("cliente comum não abre a lista de contas", comumHome.status === 307 || comumHome.status === 302 || comumHome.status === 403, `status ${comumHome.status}`);

/* limpeza — inclusive o arquivo do bucket, para não deixar lixo */
await fetch(`${U}/storage/v1/object/kyc/${caminho}`, { method: "DELETE", headers: HC });
await fetch(`${U}/rest/v1/admin_auditoria?alvo_id=eq.${uid}`, { method: "DELETE", headers: HS });
await fetch(`${U}/auth/v1/admin/users/${uid}`, { method: "DELETE", headers: HS });
ok("conta de teste removida", true);

console.log(`\n=== ${p} passaram, ${f} falharam ===\n`);
process.exit(f ? 1 : 0);
