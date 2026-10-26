/**
 * Verifica a nova área bancária em produção.
 * Faz login, abre /conta/banco e confere as abas e o texto renderizado.
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

const SITE = "https://site-pearl-nine-93.vercel.app";
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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

const login = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@sobreimprestimos.com.br", password: "Sobre@Admin2026" }),
});
const s = await login.json();
const cookie = `sb-${REF}-auth-token=${encodeURIComponent(
  JSON.stringify({
    access_token: s.access_token,
    token_type: "bearer",
    expires_in: s.expires_in,
    expires_at: s.expires_at,
    refresh_token: s.refresh_token,
    user: s.user,
  })
)}`;

async function pegar(caminho, comCookie = true) {
  const r = await fetch(SITE + caminho, {
    headers: comCookie ? { cookie } : {},
    redirect: "manual",
  });
  const html = r.status >= 300 && r.status < 400 ? "" : await r.text();
  return { status: r.status, html };
}

function texto(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

console.log("\n=== ÁREA BANCÁRIA EM PRODUÇÃO ===\n");

const banco = await pegar("/conta/banco");
ok("/conta/banco responde 200", banco.status === 200, `status ${banco.status}`);

const t = texto(banco.html);

// navegação estilo app (as abas ficam no bundle do cliente; ver e2e-banco-paineis)
for (const rotulo of ["Início", "Área PIX", "Cartões", "Extrato", "Perfil", "Config"]) {
  ok(`aba "${rotulo}" presente`, t.includes(rotulo));
}
// Aqui só o que aparece no texto visível. Os painéis que vivem no payload
// RSC e as abas do cliente são cobertos por e2e-banco-paineis.mjs.
ok("saldo disponível visível", /Saldo disponível/i.test(t));
ok("botão de ocultar saldo presente", /Ocultar saldo|Mostrar saldo/.test(banco.html));
ok("agência e conta reais", /Ag\. 0001/.test(t) && /71987210/.test(t));
ok("extrato vazio explicado", /Nenhuma movimentação ainda|Movimentação em/i.test(t));

// linguagem proibida
const proibidas = [/demonstra[çc][ãa]o/i, /fict[íi]ci/i, /\bsimulado\b/i, /sem valor financeiro/i, /\bplaceholder\b/i];
const achadas = proibidas.filter((r) => r.test(t)).map((r) => r.source);
ok("nenhuma linguagem de demonstração", achadas.length === 0, achadas.join(", "));
ok("sem undefined/NaN", !/undefined|NaN|\[object Object\]/.test(t));

// outras páginas
for (const p of ["/", "/conta", "/termos", "/privacidade"]) {
  const r = await pegar(p);
  ok(`${p} responde 200`, r.status === 200, `status ${r.status}`);
  const tt = texto(r.html);
  ok(`${p} sem linguagem de demonstração`, !/demonstra[çc][ãa]o|fict[íi]ci|sem valor financeiro/i.test(tt));
}

// o CNPJ placeholder nao pode aparecer
const home = await pegar("/");
ok("CNPJ placeholder não aparece", !texto(home.html).includes("00.000.000/0001-00"));
ok("frase de ambiente não-pronto removida", !texto((await pegar("/privacidade")).html).includes("não está preparado"));

// cron protegido
const semSegredo = await fetch(`${SITE}/api/cron/agendamentos`);
ok("cron recusa quem não tem o segredo", semSegredo.status === 401 || semSegredo.status === 403, `status ${semSegredo.status}`);

console.log(`\n=== ${passou} passaram, ${falhou} falharam ===\n`);
process.exit(falhou ? 1 : 0);
