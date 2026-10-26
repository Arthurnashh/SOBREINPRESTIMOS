/**
 * Garante que "Administração" só aparece para contas admin.
 *
 * Cria um usuário comum temporário, confere que o menu dele NÃO tem o link
 * e que /admin devolve redirect — depois apaga o usuário.
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

const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const SITE = "https://site-pearl-nine-93.vercel.app";
const REF = new URL(URL_BASE).host.split(".")[0];

let passou = 0,
  falhou = 0;
const ok = (n, c, d = "") => {
  if (c) {
    passou++;
    console.log(`  ✔ ${n}`);
  } else {
    falhou++;
    console.log(`  ✘ ${n}${d ? ` — ${d}` : ""}`);
  }
};

const EMAIL = `comum.${Date.now()}@example.com`;
const SENHA = "Comum@Teste2026";

/** Cria usuário já confirmado. */
async function criar(email, senha) {
  const r = await fetch(`${URL_BASE}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: senha, email_confirm: true }),
  });
  return { ok: r.ok, data: await r.json() };
}

async function logar(email, senha) {
  const r = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: senha }),
  });
  return await r.json();
}

function cookieDe(s) {
  return `sb-${REF}-auth-token=${encodeURIComponent(
    JSON.stringify({
      access_token: s.access_token,
      token_type: "bearer",
      expires_in: s.expires_in,
      expires_at: s.expires_at,
      refresh_token: s.refresh_token,
      user: s.user,
    })
  )}`;
}

const menuDe = (html) => (html.match(/<nav class="side"[\s\S]*?<\/nav>/) ?? [""])[0];

console.log("\n=== MENU: ADMINISTRAÇÃO SÓ PARA ADMIN ===\n");

// ---------- conta admin ----------
const sAdmin = await logar("admin@sobreimprestimos.com.br", "Sobre@Admin2026");
ok("login de admin funcionou", Boolean(sAdmin.access_token));

const rAdmin = await fetch(`${SITE}/conta/banco`, {
  headers: { cookie: cookieDe(sAdmin) },
  redirect: "manual",
});
const htmlAdmin = await rAdmin.text();
const menuAdmin = menuDe(htmlAdmin);

ok("admin VÊ 'Administração' no menu", /Administração/.test(menuAdmin));
ok("admin vê link para /admin", /href="\/admin"/.test(menuAdmin));

// menu do admin está limpo (sem PIX/Cartões duplicados)
ok("menu do admin não repete 'Área PIX'", !/Área PIX/.test(menuAdmin));
ok("menu do admin não repete 'Cartões'", !/Cartões/.test(menuAdmin));
ok(
  "menu do admin tem só um link para /conta/banco",
  (menuAdmin.match(/href="\/conta\/banco"/g) ?? []).length === 1,
  `${(menuAdmin.match(/href="\/conta\/banco"/g) ?? []).length}`
);

// ---------- conta comum ----------
const criado = await criar(EMAIL, SENHA);
ok("usuário comum criado", criado.ok, JSON.stringify(criado.data).slice(0, 90));
const uidComum = criado.data?.id;

const sComum = await logar(EMAIL, SENHA);
ok("login do usuário comum funcionou", Boolean(sComum.access_token), sComum.error_description ?? "");

const rComum = await fetch(`${SITE}/conta/banco`, {
  headers: { cookie: cookieDe(sComum) },
  redirect: "manual",
});
const htmlComum = await rComum.text();
const menuComum = menuDe(htmlComum);

ok("comum NÃO vê 'Administração' no menu", !/Administração/.test(menuComum));
ok("comum não tem link /admin no menu", !/href="\/admin"/.test(menuComum));
ok("comum vê 'Conta bancária'", /Conta bancária/.test(menuComum));
ok("comum vê 'Empréstimo'", /Empréstimo/.test(menuComum));

// tentar entrar na força
const rForca = await fetch(`${SITE}/admin`, {
  headers: { cookie: cookieDe(sComum) },
  redirect: "manual",
});
const loc = rForca.headers.get("location") ?? "";
ok(
  "comum é barrado em /admin",
  rForca.status === 307 || rForca.status === 302 || rForca.status === 303 || loc.includes("/conta") || loc.includes("/entrar"),
  `status ${rForca.status} location ${loc}`
);

// sem cookie nenhum
const rAnon = await fetch(`${SITE}/admin`, { redirect: "manual" });
ok(
  "anônimo é barrado em /admin",
  rAnon.status >= 300 && rAnon.status < 400,
  `status ${rAnon.status}`
);

// ---------- limpeza ----------
if (uidComum) {
  const del = await fetch(`${URL_BASE}/auth/v1/admin/users/${uidComum}`, {
    method: "DELETE",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  ok("usuário comum de teste removido", del.ok, `status ${del.status}`);
}

console.log(`\n=== ${passou} passaram, ${falhou} falharam ===\n`);
process.exit(falhou ? 1 : 0);
