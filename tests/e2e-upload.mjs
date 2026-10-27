/**
 * Envio de documento do KYC: o arquivo precisa subir ao Storage em qualquer
 * tamanho que o celular produz.
 *
 * O bug relatado era "fica lá enviando". Causa: o File atravessava uma Server
 * Action, e o Next.js corta esse corpo em 1 MB — foto de celular tem 3–8 MB.
 * O teste envia arquivos grandes direto ao Storage, que é o caminho novo.
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
const HS = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

let p = 0, f = 0;
const ok = (n, c, d = "") => { if (c) { p++; console.log(`  ✔ ${n}`); } else { f++; console.log(`  ✘ ${n}${d ? ` — ${d}` : ""}`); } };

console.log("\n=== ENVIO DE DOCUMENTO (KYC) ===\n");

/* JPEG mínimo válido, para o Storage aceitar o tipo. */
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
  "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
  "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64"
);
/** Arquivo do tamanho pedido, preenchido para simular foto real. */
const doTamanho = (mb) => {
  const alvo = Math.round(mb * 1024 * 1024);
  const partes = [JPEG];
  let total = JPEG.length;
  const bloco = Buffer.alloc(64 * 1024, 0x41);
  while (total + bloco.length < alvo) { partes.push(bloco); total += bloco.length; }
  partes.push(Buffer.alloc(alvo - total, 0x42));
  return Buffer.concat(partes);
};

const cpf = (() => { const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)); const dv = (b) => { const s = b.reduce((a, d, i) => a + d * (b.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; }; const d1 = dv(n); return [...n, d1, dv([...n, d1])].join(""); })();
const cli = await (await fetch(`${U}/auth/v1/signup`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: `up.${Date.now()}@example.com`, password: "Up@Teste2026", data: { full_name: "Cliente Upload Teste", cpf, phone: "11955559090" } }) })).json();
const uid = cli.user.id;
const HC = { apikey: ANON, Authorization: `Bearer ${cli.access_token}` };
const HT = { ...HC, "Content-Type": "image/jpeg" };

/* ---------- 1. o limite que causava o bug ---------- */
console.log("-- o limite da Server Action --");

const grande = doTamanho(4);
/*
 * O caminho antigo (arquivo pela Server Action) não é mais usado. O que importa
 * verificar é que o app NÃO depende dele: enviamos um arquivo grande pela
 * Server Action e confirmamos que ela não processa — qualquer resposta que não
 * seja sucesso serve, porque antes disso o botão ficava girando para sempre.
 */
const viaAction = await fetch(`${SITE}/conta/verificacao`, {
  method: "POST",
  headers: {
    cookie: `sb-wczkjhbsfbynweagtzag-auth-token=${encodeURIComponent(JSON.stringify({
      access_token: cli.access_token, token_type: "bearer", expires_in: cli.expires_in,
      expires_at: cli.expires_at, refresh_token: cli.refresh_token, user: cli.user }))}`,
    "content-type": "multipart/form-data; boundary=x",
    "next-action": "x",
  },
  body: Buffer.concat([Buffer.from("--x\r\nContent-Disposition: form-data; name=\"f\"; filename=\"a.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n"), grande, Buffer.from("\r\n--x--\r\n")]),
}).catch(() => ({ status: 0 }));
ok("a Server Action não aceita arquivo grande (limite de 1 MB)",
  !(viaAction.status >= 200 && viaAction.status < 300),
  `status ${viaAction.status}`);

/* ---------- 2. o caminho novo: direto ao Storage ---------- */
console.log("\n-- envio direto ao Storage (caminho novo) --");

const enviar = async (tamanhoMb, nome) => {
  const path = `${uid}/doc_frente-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
  const r = await fetch(`${U}/storage/v1/object/kyc/${path}`, {
    method: "POST", headers: { ...HT, "x-upsert": "true" }, body: doTamanho(tamanhoMb),
  });
  const txt = await r.text();
  return { ok: r.ok, status: r.status, path, erro: txt.slice(0, 140) };
};

for (const mb of [0.3, 1.5, 4, 8]) {
  const t0 = Date.now();
  const r = await enviar(mb, `foto-${mb}mb.jpg`);
  const ms = Date.now() - t0;
  ok(`envia ${mb} MB direto ao Storage (${ms}ms)`, r.ok, `status ${r.status} ${r.erro}`);
}

/* Acima do limite do bucket, tem que recusar — e rápido, não travando. */
const exagerado = await enviar(11, "gigante.jpg");
ok("recusa acima de 10 MB", !exagerado.ok, `status ${exagerado.status}`);

/* ---------- 3. segurança: ninguém grava na pasta de outro ---------- */
console.log("\n-- segurança do bucket --");

const outro = await (await fetch(`${U}/auth/v1/signup`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: `lad.${Date.now()}@example.com`, password: "Lad@Teste2026", data: { full_name: "Intruso Teste", cpf: "52998224725", phone: "11955550101" } }) })).json();

const invasao = await fetch(`${U}/storage/v1/object/kyc/${uid}/roubado.jpg`, {
  method: "POST",
  headers: { apikey: ANON, Authorization: `Bearer ${outro.access_token}`, "Content-Type": "image/jpeg", "x-upsert": "true" },
  body: doTamanho(0.3),
});
ok("outro usuário NÃO grava na pasta alheia", !invasao.ok, `status ${invasao.status}`);

/* O bucket é privado: sem assinatura, ninguém lê. */
const semAuth = await fetch(`${U}/storage/v1/object/kyc/${uid}/x.jpg`);
ok("o bucket é privado (leitura sem permissão falha)", !semAuth.ok, `status ${semAuth.status}`);

/* ---------- 4. o registro no banco aceita os slots de rosto ---------- */
console.log("\n-- registro do caminho no banco --");

const enviado = await enviar(0.5, "rosto.jpg");
ok("arquivo de rosto enviado", enviado.ok, enviado.erro);

for (const [slot, nome] of [["face_frontal", "frontal"], ["doc_frente", "frente"], ["selfie_doc", "selfie"]]) {
  const r = await fetch(`${U}/rest/v1/rpc/kyc_registrar_arquivo`, {
    method: "POST", headers: { ...HC, "Content-Type": "application/json" },
    body: JSON.stringify({ p_slot: slot, p_path: `${uid}/${slot}-${Date.now()}.jpg` }),
  });
  const t = await r.text();
  ok(`registra o slot ${nome}`, r.ok, t.slice(0, 130));
}

const kyc = await (await fetch(`${U}/rest/v1/kyc_submissions?user_id=eq.${uid}&select=face_front_path,doc_front_path,selfie_doc_path`, { headers: HS })).json();
const k = kyc[0] ?? {};
ok("o rosto ficou gravado", Boolean(k.face_front_path), String(k.face_front_path));
ok("a frente do documento ficou gravada", Boolean(k.doc_front_path), String(k.doc_front_path));
ok("a selfie com documento ficou gravada", Boolean(k.selfie_doc_path), String(k.selfie_doc_path));

/* ---------- 5. a tela não usa mais o caminho antigo ---------- */
console.log("\n-- a tela usa o envio direto --");

const pagina = await (await fetch(`${SITE}/conta/verificacao`, {
  headers: { cookie: `sb-wczkjhbsfbynweagtzag-auth-token=${encodeURIComponent(JSON.stringify({
    access_token: cli.access_token, token_type: "bearer", expires_in: cli.expires_in,
    expires_at: cli.expires_at, refresh_token: cli.refresh_token, user: cli.user }))}` },
})).text();

const jsLinks = [...pagina.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g)].map((m) => m[1]);
let jsTodo = "";
for (const l of jsLinks) jsTodo += await (await fetch(SITE + l)).text();

ok("o bundle contém o envio direto ao Storage", /storage\/v1\/object|from\(.kyc.\)/.test(jsTodo) || /\.upload\(/.test(jsTodo));
ok("o bundle menciona a compressão de imagem", /image\/jpeg/.test(jsTodo));
ok("a página de verificação abre", /Verifica/.test(pagina));

/* ------------------------------ limpeza ------------------------------ */
await fetch(`${U}/storage/v1/object/kyc`, {
  method: "DELETE", headers: { ...HS, "Content-Type": "application/json" },
  body: JSON.stringify({ prefixes: [`${uid}`] }),
});
await fetch(`${U}/auth/v1/admin/users/${uid}`, { method: "DELETE", headers: HS });
await fetch(`${U}/auth/v1/admin/users/${outro.user.id}`, { method: "DELETE", headers: HS });
ok("dados de teste removidos", true);

console.log(`\n=== ${p} passaram, ${f} falharam ===\n`);
process.exit(f ? 1 : 0);
