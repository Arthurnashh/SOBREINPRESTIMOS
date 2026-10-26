/**
 * O fluxo pós-cadastro no site publicado: menu travado, verificação em
 * destaque, destino respeitado e destravamento após aprovação.
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
const U = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const REF = new URL(U).host.split(".")[0];
const HS = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

let passou = 0, falhou = 0;
const ok = (n, c, d = "") => { if (c) { passou++; console.log(`  ✔ ${n}`); } else { falhou++; console.log(`  ✘ ${n}${d ? ` — ${d}` : ""}`); } };

function cpfValido() {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (b) => { const s = b.reduce((a, d, i) => a + d * (b.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(n);
  return [...n, d1, dv([...n, d1])].join("");
}

console.log("\n=== PÓS-CADASTRO NO SITE PUBLICADO ===\n");

// cria a conta como o cadastro cria (signup com autoconfirm ligado)
const email = `pos.${Date.now()}@example.com`;
const senha = "Pos@Teste2026";
const cpf = cpfValido();

const r = await fetch(`${U}/auth/v1/signup`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: senha, data: { full_name: "Pos Cadastro Teste", cpf, phone: "11955554444" } }),
});
const j = await r.json();
const uid = j.user?.id;
ok("conta criada com sessão", Boolean(uid) && Boolean(j.access_token));

if (!uid) { console.log("\nabortando\n"); process.exit(1); }

const cookie = `sb-${REF}-auth-token=${encodeURIComponent(JSON.stringify({
  access_token: j.access_token, token_type: "bearer", expires_in: j.expires_in,
  expires_at: j.expires_at, refresh_token: j.refresh_token, user: j.user }))}`;

/* --------------- menu travado enquanto não verifica --------------- */
const conta = await fetch(`${SITE}/conta`, { headers: { cookie } });
const html = await conta.text();
ok("a conta responde", conta.status === 200, `status ${conta.status}`);
ok("menu travado: sem 'Conta bancária'", !/Conta bancária/.test(html));
ok("menu travado: sem link de 'Empréstimo'", !/>Empréstimo</.test(html));
ok("menu travado: sem 'Administração'", !/Administração/.test(html));
ok("menu travado: mantém 'Minha verificação'", /Minha verificação/.test(html));
ok("menu travado: mantém 'Sair'", /Sair/.test(html));

/* --------------- a verificação abre e é a etapa 1 --------------- */
const ver = await fetch(`${SITE}/conta/verificacao`, { headers: { cookie } });
const hv = await ver.text();
ok("verificação abre", ver.status === 200 && /Verificação de identidade/.test(hv), `status ${ver.status}`);
ok("abre na etapa de dados", /Seus dados/.test(hv));
// A trilha é renderizada no servidor; o rótulo da etapa 2 é composto.
ok("mostra a trilha de etapas", /Endereço e documentos/.test(hv) && /Biometria/.test(hv));

/* --------------- destino do pedido é respeitado --------------- */
const destino = "/conta/emprestimo?valor=5000&parcelas=12";
const comDestino = await fetch(`${SITE}/conta/verificacao?depois=${encodeURIComponent(destino)}`, { headers: { cookie } });
const hd = await comDestino.text();
ok("respeita o destino do pedido", /Continuar para o pedido/.test(hd));

// O destino externo não pode virar LINK. Ele pode aparecer como texto inerte
// dentro da própria query string da URL, então o que se checa é o href —
// e só os hrefs, sem confundir com as fontes do Google no <head>.
const externo = await fetch(`${SITE}/conta/verificacao?depois=${encodeURIComponent("https://malicioso.example.com")}`, { headers: { cookie } });
const he = await externo.text();
const linksMaliciosos = [...he.matchAll(/href="([^"]*)"/g)]
  .map((m) => m[1])
  .filter((h) => /malicioso/i.test(h));
ok("destino externo NÃO vira link (anti open-redirect)", linksMaliciosos.length === 0, linksMaliciosos.join(" | "));
ok("cai no destino seguro quando o informado é inválido", /href="\/conta\/banco"/.test(he));

/* --------------- após aprovar, o menu destrava --------------- */
await fetch(`${U}/rest/v1/kyc_submissions?user_id=eq.${uid}`, {
  method: "PATCH", headers: { ...HS, Prefer: "return=minimal" },
  body: JSON.stringify({ status: "aprovado" }),
});

const conta2 = await fetch(`${SITE}/conta`, { headers: { cookie } });
const html2 = await conta2.text();
ok("após aprovação: mostra 'Conta bancária'", /Conta bancária/.test(html2));
ok("após aprovação: mostra 'Empréstimo'", /Empréstimo/.test(html2));

const ver2 = await fetch(`${SITE}/conta/verificacao`, { headers: { cookie } });
const hv2 = await ver2.text();
ok("verificação mostra 'Identidade verificada'", /Identidade verificada/.test(hv2));

/* --------------- o login também não pede e-mail --------------- */
const login = await fetch(`${U}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: senha }),
});
ok("login direto funciona", login.ok, `${login.status}`);

/* ------------------------------ limpeza ------------------------------ */
await fetch(`${U}/auth/v1/admin/users/${uid}`, { method: "DELETE", headers: HS });
const ainda = await fetch(`${U}/auth/v1/admin/users/${uid}`, { headers: HS });
ok("conta de teste removida", !ainda.ok, `status ${ainda.status}`);

console.log(`\n=== ${passou} passaram, ${falhou} falharam ===\n`);
process.exit(falhou ? 1 : 0);
