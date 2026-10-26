/**
 * Segurança do bucket KYC: um cliente não pode ler nem gravar no espaço
 * de outro, e o admin precisa conseguir ler tudo para analisar.
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

let passou = 0, falhou = 0;
const ok = (n, c, d = "") => {
  if (c) { passou++; console.log(`  ✔ ${n}`); }
  else { falhou++; console.log(`  ✘ ${n}${d ? ` — ${d}` : ""}`); }
};

function cpfValido() {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (b) => { const s = b.reduce((a, d, i) => a + d * (b.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(n);
  return [...n, d1, dv([...n, d1])].join("");
}

async function criar(tag) {
  const email = `seg.${tag}.${Date.now()}@example.com`;
  const senha = "Seg@Teste2026";
  const cpf = cpfValido();
  const r = await fetch(`${U}/auth/v1/admin/users`, {
    method: "POST", headers: HS,
    body: JSON.stringify({ email, password: senha, email_confirm: true,
      user_metadata: { full_name: `Cliente ${tag}`, cpf, phone: "11977776666" },
      data: { full_name: `Cliente ${tag}`, cpf, phone: "11977776666" } }),
  });
  const j = await r.json();
  await fetch(`${U}/rest/v1/profiles?id=eq.${j.id}`, {
    method: "PATCH", headers: { ...HS, Prefer: "return=minimal" },
    body: JSON.stringify({ full_name: `Cliente ${tag}`, cpf, phone: "11977776666" }),
  });
  const login = await fetch(`${U}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: senha }),
  });
  const s = await login.json();
  return { id: j.id, email, token: s.access_token };
}

const H = (t) => ({ apikey: ANON, Authorization: `Bearer ${t}`, "Content-Type": "application/json" });
const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: 512 }, (_, i) => (i * 5) % 256), 0xff, 0xd9]);

console.log("\n=== SEGURANÇA DO BUCKET KYC ===\n");

const a = await criar("a");
const b = await criar("b");
const admin = await (await fetch(`${U}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@sobreimprestimos.com.br", password: "Sobre@Admin2026" }),
})).json();

ok("dois clientes de teste criados", Boolean(a.id) && Boolean(b.id));
ok("login do admin", Boolean(admin.access_token));

// A envia um arquivo no próprio espaço.
// O Content-Type precisa ser declarado: o bucket só aceita os tipos da
// lista permitida, e sem o cabeçalho o Storage recusa com 400.
const pathA = `${a.id}/doc_frente.jpg`;
const upA = await fetch(`${U}/storage/v1/object/kyc/${pathA}`, {
  method: "POST",
  headers: { ...H(a.token), "Content-Type": "image/jpeg" },
  body: jpeg(),
});
ok("A envia no próprio espaço", upA.ok, `${upA.status} ${upA.ok ? "" : await upA.text()}`);

// A lê o próprio
const lerA = await fetch(`${U}/storage/v1/object/kyc/${pathA}`, { headers: H(a.token) });
ok("A lê o próprio arquivo", lerA.ok, `${lerA.status}`);

// B tenta ler o de A
const bLeA = await fetch(`${U}/storage/v1/object/kyc/${pathA}`, { headers: H(b.token) });
ok("B NÃO lê o arquivo de A", !bLeA.ok, `status ${bLeA.status} (esperado 400/403/404)`);
// se o arquivo não existisse, o teste acima passaria por engano
ok("o arquivo de A existe de fato", lerA.ok, `status ${lerA.status}`);

// B tenta gravar no espaço de A
const bEscreveA = await fetch(`${U}/storage/v1/object/kyc/${a.id}/invasao.jpg`, {
  method: "POST",
  headers: { ...H(b.token), "Content-Type": "image/jpeg" },
  body: jpeg(),
});
ok("B NÃO grava no espaço de A", !bEscreveA.ok, `status ${bEscreveA.status}`);

// admin lê o de A
const adminLe = await fetch(`${U}/storage/v1/object/kyc/${pathA}`, { headers: H(admin.access_token) });
ok("admin lê o arquivo de A", adminLe.ok, `status ${adminLe.status}`);

// anônimo não lê
const anonLe = await fetch(`${U}/storage/v1/object/kyc/${pathA}`, { headers: { apikey: ANON } });
ok("anônimo NÃO lê", !anonLe.ok, `status ${anonLe.status}`);

// URL pública não deve servir (bucket privado)
const pub = await fetch(`${U}/storage/v1/object/public/kyc/${pathA}`);
ok("URL pública NÃO serve o arquivo", !pub.ok, `status ${pub.status}`);

// URL assinada funciona para o dono
const assinada = await fetch(`${U}/storage/v1/object/sign/kyc/${pathA}`, {
  method: "POST", headers: H(a.token), body: JSON.stringify({ expiresIn: 60 }),
});
const assinadaJson = await assinada.json();
ok("dono gera URL assinada", assinada.ok && Boolean(assinadaJson.signedURL), JSON.stringify(assinadaJson).slice(0, 80));
if (assinadaJson.signedURL) {
  const viaAssinada = await fetch(`${U}/storage/v1${assinadaJson.signedURL}`);
  ok("URL assinada abre o arquivo", viaAssinada.ok, `status ${viaAssinada.status}`);
}

// limpeza
for (const u of [a, b]) {
  await fetch(`${U}/storage/v1/object/kyc`, {
    method: "DELETE", headers: HS, body: JSON.stringify({ prefixes: [`${u.id}/`] }),
  });
  await fetch(`${U}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: HS });
}
ok("clientes de teste removidos", true);

console.log(`\n=== ${passou} passaram, ${falhou} falharam ===\n`);
process.exit(falhou ? 1 : 0);
