// =====================================================================
// Promove uma conta existente a administrador.
//
// Uso:  node scripts/promover-admin.mjs email@exemplo.com
//   ou  duplo clique em promover-admin.bat
//
// Requer no .env.local:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   (secreta — nunca vai para a Vercel)
//
// A conta precisa existir (cadastro pelo site). Este script nao cria
// usuario: criar usuario com service role fora do fluxo normal de
// cadastro deixa perfil sem CPF e fura a validacao do produto.
// =====================================================================

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  let raw;
  try {
    raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    console.error("ERRO: .env.local nao encontrado.");
    process.exit(1);
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const value = m[2].replace(/^["']|["']$/g, "");
    if (!(m[1] in process.env)) process.env[m[1]] = value;
  }
}

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("ERRO: informe o e-mail. Ex: node scripts/promover-admin.mjs admin@site.com");
  process.exit(1);
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || url.includes("SEU-PROJETO")) {
  console.error("ERRO: NEXT_PUBLIC_SUPABASE_URL nao configurada no .env.local.");
  process.exit(1);
}
if (!serviceKey || serviceKey.includes("sua-service")) {
  console.error(
    "ERRO: SUPABASE_SERVICE_ROLE_KEY ausente no .env.local.\n" +
      "      Copie em Supabase > Project Settings > API > service_role.\n" +
      "      Essa chave e secreta: fica so na sua maquina."
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 1. Localiza o usuario pelo e-mail (a Admin API nao busca por e-mail direto).
const { data: list, error: listErr } = await supabase.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});
if (listErr) {
  console.error("ERRO ao listar usuarios:", listErr.message);
  process.exit(1);
}

const user = list.users.find((u) => (u.email ?? "").toLowerCase() === email);
if (!user) {
  console.error(`ERRO: nenhuma conta com o e-mail ${email}.`);
  console.error("      Cadastre-se primeiro pelo site (/cadastro).");
  process.exit(1);
}

// 2. Confirma que o perfil existe (o trigger do schema cria no cadastro).
const { data: profile, error: profErr } = await supabase
  .from("profiles")
  .select("id, full_name, cpf, is_admin")
  .eq("id", user.id)
  .maybeSingle();

if (profErr) {
  console.error("ERRO ao ler o perfil:", profErr.message);
  process.exit(1);
}
if (!profile) {
  console.error(
    "ERRO: perfil inexistente para este usuario.\n" +
      "      Rode supabase/schema.sql no SQL Editor e refaca o cadastro."
  );
  process.exit(1);
}

if (profile.is_admin) {
  console.log(`OK: ${email} ja e administrador. Nada a fazer.`);
  process.exit(0);
}

// 3. Promove.
const { error: updErr } = await supabase
  .from("profiles")
  .update({ is_admin: true })
  .eq("id", user.id);

if (updErr) {
  console.error("ERRO ao promover:", updErr.message);
  console.error("      Rode supabase/admin.sql no SQL Editor (coluna is_admin).");
  process.exit(1);
}

console.log("");
console.log("  Administrador promovido com sucesso.");
console.log("  ------------------------------------");
console.log(`  e-mail : ${email}`);
console.log(`  nome   : ${profile.full_name || "(sem nome)"}`);
console.log(`  id     : ${user.id}`);
console.log(`  e-mail confirmado em: ${user.email_confirmed_at ?? "NAO CONFIRMADO"}`);
console.log("");
console.log("  Saia e entre de novo no site para o menu Administracao aparecer.");
console.log("  Painel: http://localhost:3000/admin");
console.log("");

if (!user.email_confirmed_at) {
  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    email_confirm: true,
  });
  console.log(
    error
      ? `  AVISO: nao foi possivel confirmar o e-mail automaticamente (${error.message}).`
      : "  E-mail confirmado automaticamente."
  );
}
