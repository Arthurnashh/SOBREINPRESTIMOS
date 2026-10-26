/**
 * KYC em produção: as telas respondem, o menu tem o atalho e o gate está ativo.
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);

const SITE = "https://site-pearl-nine-93.vercel.app";
const U = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.NEXT_PUBLIC_SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY;
const REF = new URL(U).host.split(".")[0];
const HS = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

let passou = 0, falhou = 0;
const ok = (n, c, d = "") => { if (c) { passou++; console.log(`  ✔ ${n}`); } else { falhou++; console.log(`  ✘ ${n}${d ? ` — ${d}` : ""}`); } };

/**
 * Usa um cliente PRÓPRIO, sem KYC aprovado: as outras suítes aprovam o KYC do
 * admin, e aí a tela mostraria "Identidade verificada" em vez do formulário.
 */
function cpfValido() {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (b) => { const s = b.reduce((a, d, i) => a + d * (b.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(n);
  return [...n, d1, dv([...n, d1])].join("");
}

const emailNovo = `prod.${Date.now()}@example.com`;
const senhaNova = "Prod@Teste2026";
const cpf = cpfValido();
const novo = await (await fetch(`${U}/auth/v1/admin/users`, {
  method: "POST", headers: HS,
  body: JSON.stringify({ email: emailNovo, password: senhaNova, email_confirm: true,
    user_metadata: { full_name: "Cliente Prod Teste", cpf, phone: "11944443333" },
    data: { full_name: "Cliente Prod Teste", cpf, phone: "11944443333" } }),
})).json();
await fetch(`${U}/rest/v1/profiles?id=eq.${novo.id}`, {
  method: "PATCH", headers: { ...HS, Prefer: "return=minimal" },
  body: JSON.stringify({ full_name: "Cliente Prod Teste", cpf, phone: "11944443333" }),
});

const s = await (await fetch(`${U}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: emailNovo, password: senhaNova }) })).json();

const admin = await (await fetch(`${U}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@sobreimprestimos.com.br", password: "Sobre@Admin2026" }) })).json();

const cookie = `sb-${REF}-auth-token=${encodeURIComponent(JSON.stringify({
  access_token: s.access_token, token_type: "bearer", expires_in: s.expires_in,
  expires_at: s.expires_at, refresh_token: s.refresh_token, user: s.user }))}`;
const cookieAdmin = `sb-${REF}-auth-token=${encodeURIComponent(JSON.stringify({
  access_token: admin.access_token, token_type: "bearer", expires_in: admin.expires_in,
  expires_at: admin.expires_at, refresh_token: admin.refresh_token, user: admin.user }))}`;

console.log("\n=== KYC EM PRODUÇÃO ===\n");
ok("cliente de teste criado e logado", Boolean(novo.id) && Boolean(s.access_token));

// tela de verificação
const v = await fetch(`${SITE}/conta/verificacao`, { headers: { cookie } });
const html = await v.text();
ok("/conta/verificacao responde 200", v.status === 200, `status ${v.status}`);
// A página abre na etapa 1; CNH/RG e comprovante vivem na etapa 2, que é
// client-side. Procuramos no bundle do cliente, não no HTML do servidor.
const scripts = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]);
let bundles = "";
for (const src of scripts) {
  const url = src.startsWith("http") ? src : SITE + src;
  try { bundles += await (await fetch(url)).text(); } catch {}
}

ok("título presente", /Verificação de identidade/.test(html));
ok("etapa de dados presente", /Seus dados|Nome completo/.test(html));
ok("fala de biometria", /[Bb]iometria|prova de vida/.test(html + bundles));
ok("menciona CNH ou RG", /CNH/.test(bundles) && /RG/.test(bundles), `bundle ${bundles.length} bytes`);
// O minificador parte strings longas no acento ("Comprovante de endere" + "ço"),
// então procuramos o prefixo estável em vez da frase inteira.
ok("menciona comprovante de endereço", /Comprovante de endere/.test(bundles));
ok("menciona selfie com documento", /[Ss]elfie/.test(html + bundles));
ok("fala da prova de vida", /Prova de vida/.test(bundles));
ok("fala dos cinco ângulos", /Vamos capturar/.test(bundles) && /cinco/.test(bundles));
// A dica ao vivo mudou de "Enquadramento bom" para "Tudo certo — <ação>",
// justamente para não sumir com a instrução do ângulo quando o quadro fica bom.
ok("mostra o enquadramento ao vivo e o que fazer", /Tudo certo/.test(bundles));
// E a orientação por ângulo continua no bundle (virar, sorrir, aproximar).
ok("diz para virar a cabeça", /[Vv]ire/.test(bundles));
ok("diz para sorrir", /[Ss]orria|sorriso confirmado/.test(bundles));
ok("diz para aproximar", /[Aa]proxime/.test(bundles));
ok("tem o botão de escolher arquivo", /Escolher arquivo/.test(bundles));

// menu
// Enquanto a verificação não é aprovada, o menu fica travado de propósito:
// só a própria verificação e o sair. Este cliente é recém-criado.
const menu = (html.match(/<nav class="side"[\s\S]*?<\/nav>/) ?? [""])[0];
ok("menu tem 'Minha verificação'", /Minha verificação/.test(menu));
ok("menu travado esconde 'Conta bancária' antes de aprovar", !/Conta bancária/.test(menu));
ok("menu travado mantém 'Sair'", /Sair/.test(menu));

// painel admin (usa o token do admin)
const a = await fetch(`${SITE}/admin/kyc`, { headers: { cookie: cookieAdmin } });
const htmlA = await a.text();
ok("/admin/kyc responde 200", a.status === 200, `status ${a.status}`);
ok("painel admin com título", /Verificações de identidade/.test(htmlA));
ok("painel admin tem contadores", /Aguardando análise/.test(htmlA));
ok("painel admin explica o bloqueio", /não movimenta/.test(htmlA));

// API de status
const st = await fetch(`${SITE}/api/kyc/status`, { headers: { cookie } });
const stJson = await st.json();
ok("/api/kyc/status responde", st.status === 200, `status ${st.status}`);
ok("cliente novo começa em nao_iniciado", stJson.status === "nao_iniciado", stJson.status);
ok("cliente novo não pode movimentar", stJson.podeMovimentar === false, String(stJson.podeMovimentar));

// API admin de detalhe
const det = await fetch(`${SITE}/api/kyc/admin/${novo.id}`, { headers: { cookie: cookieAdmin } });
ok("/api/kyc/admin responde", det.status === 200, `status ${det.status}`);
const detJson = await det.json();
ok("detalhe traz os 9 slots de arquivo", Object.keys(detJson.urls ?? {}).length === 9, String(Object.keys(detJson.urls ?? {}).length));

// cliente comum NÃO acessa a API do admin
const semAdmin = await fetch(`${SITE}/api/kyc/admin/${novo.id}`, { headers: { cookie }, redirect: "manual" });
ok("cliente comum barrado na API do admin", semAdmin.status >= 300 || semAdmin.status === 403, `status ${semAdmin.status}`);

// cliente anônimo é barrado
const anon = await fetch(`${SITE}/api/kyc/status`, { redirect: "manual" });
ok("anônimo barrado no status", anon.status >= 300 && anon.status < 400, `status ${anon.status}`);

// a tela de verificação anônima manda para o login
const anonV = await fetch(`${SITE}/conta/verificacao`, { redirect: "manual" });
ok("anônimo barrado na verificação", anonV.status >= 300 && anonV.status < 400, `status ${anonV.status}`);

// pedido de empréstimo bloqueado
const emp = await fetch(`${SITE}/conta/emprestimo`, { headers: { cookie } });
ok("/conta/emprestimo responde", emp.status === 200, `status ${emp.status}`);

// limpeza
await fetch(`${U}/auth/v1/admin/users/${novo.id}`, { method: "DELETE", headers: HS });
const aindaExiste = await fetch(`${U}/auth/v1/admin/users/${novo.id}`, { headers: HS });
ok("cliente de teste removido", !aindaExiste.ok, `status ${aindaExiste.status}`);

console.log(`\n=== ${passou} passaram, ${falhou} falharam ===\n`);
process.exit(falhou ? 1 : 0);
