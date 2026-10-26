// Varre todas as paginas publicas e autenticadas procurando qualquer vestigio
// de linguagem de demonstracao. Falha se encontrar.
import { readFileSync } from "node:fs";

const BASE = "https://site-pearl-nine-93.vercel.app";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

// "simulação de empréstimos" é o simulador de crédito da landing page — um
// recurso legítimo. O que não pode existir é linguagem de ambiente de teste.
const PROIBIDO =
  /demonstra[çc][aã]o|demonstrativ|fict[íi]ci|sem valor financeiro|modo demo|ambiente demo|saldo fict|cart[aã]o fict|DEMO-|simula[çc][aã]o de pix|pix simulado|saldo fictício/i;

const login = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@sobreimprestimos.com.br", password: "Sobre@Admin2026" }),
}).then((r) => r.json());

const ref = env.NEXT_PUBLIC_SUPABASE_URL.replace("https://", "").split(".")[0];
const ck =
  `sb-${ref}-auth-token=` +
  encodeURIComponent(
    JSON.stringify({
      access_token: login.access_token,
      token_type: "bearer",
      expires_in: login.expires_in,
      expires_at: login.expires_at,
      refresh_token: login.refresh_token,
      user: login.user,
    })
  );

const publicas = ["/", "/termos", "/privacidade", "/entrar", "/cadastro", "/esqueci-senha"];
const privadas = ["/conta", "/conta/banco", "/conta/emprestimo", "/admin", "/admin/usuarios"];

let problemas = 0;
const varrer = async (caminho, autenticado) => {
  const res = await fetch(`${BASE}${caminho}`, {
    headers: autenticado ? { cookie: ck } : {},
    redirect: "manual",
  });
  const html = await res.text();
  const m = html.match(PROIBIDO);
  const ok = res.status === 200 && !m;
  console.log(
    `${ok ? "OK   " : "PROBLEMA"} ${caminho.padEnd(22)} status=${res.status}${m ? `  achou "${m[0]}"` : ""}`
  );
  if (!ok) problemas++;
};

console.log("--- paginas publicas ---");
for (const p of publicas) await varrer(p, false);
console.log("--- paginas da conta (autenticado) ---");
for (const p of privadas) await varrer(p, true);

console.log(problemas ? `\n${problemas} pagina(s) com problema` : "\nnenhuma linguagem de demonstração em nenhuma página");
process.exitCode = problemas ? 1 : 0;
