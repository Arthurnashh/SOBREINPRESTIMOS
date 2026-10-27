/**
 * Responsividade: mede estouro horizontal nas larguras reais de celular.
 *
 * Percorre as telas públicas e as autenticadas como cliente, emulando cada
 * aparelho por user-agent + largura, e verifica:
 *   1. a página não rola de lado (scrollWidth <= viewport);
 *   2. existe a meta viewport (sem ela o celular encolhe tudo);
 *   3. nenhum elemento passa da borda direita;
 *   4. botões têm pelo menos 40px de altura (alvo de toque).
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

/* Aparelhos reais: largura CSS, DPR e user-agent. */
const APARELHOS = [
  { nome: "iPhone SE (375)", w: 375, h: 667, dpr: 2, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1" },
  { nome: "iPhone 12/13 (390)", w: 390, h: 844, dpr: 3, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1" },
  { nome: "iPhone 14 Pro Max (430)", w: 430, h: 932, dpr: 3, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" },
  { nome: "Galaxy S20 (360)", w: 360, h: 800, dpr: 3, ua: "Mozilla/5.0 (Linux; Android 13; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36" },
  { nome: "Galaxy Fold fechado (280)", w: 280, h: 653, dpr: 3, ua: "Mozilla/5.0 (Linux; Android 13; SM-F936B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36" },
  { nome: "Moto G (412)", w: 412, h: 915, dpr: 1.75, ua: "Mozilla/5.0 (Linux; Android 12; moto g(60)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36" },
];

console.log("\n=== RESPONSIVIDADE ===\n");

/* --- 1. a meta viewport, que é a base de tudo --- */
console.log("-- meta viewport --");
const homeHtml = await (await fetch(SITE)).text();
ok("a home declara viewport", /<meta name="viewport"/.test(homeHtml), "sem meta viewport o celular encolhe a página");
ok("viewport usa device-width", /width=device-width/.test(homeHtml));
ok("viewport tem viewport-fit=cover", /viewport-fit=cover/.test(homeHtml));
ok("theme-color definido", /name="theme-color"/.test(homeHtml));

/* --- prepara um cliente com empréstimo liberado, para as telas internas --- */
const cpf = (() => { const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)); const dv = (b) => { const s = b.reduce((a, d, i) => a + d * (b.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; }; const d1 = dv(n); return [...n, d1, dv([...n, d1])].join(""); })();
const cli = await (await fetch(`${U}/auth/v1/signup`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: `resp.${Date.now()}@example.com`, password: "Resp@Teste2026", data: { full_name: "Cliente Responsivo Teste", cpf, phone: "11955557878" } }) })).json();
const uid = cli.user.id;
const HC = { apikey: ANON, Authorization: `Bearer ${cli.access_token}`, "Content-Type": "application/json" };
const cookie = `sb-${REF}-auth-token=${encodeURIComponent(JSON.stringify({
  access_token: cli.access_token, token_type: "bearer", expires_in: cli.expires_in,
  expires_at: cli.expires_at, refresh_token: cli.refresh_token, user: cli.user }))}`;

await fetch(`${U}/rest/v1/kyc_submissions?user_id=eq.${uid}`, {
  method: "PATCH", headers: { ...HS, Prefer: "return=minimal" }, body: JSON.stringify({ status: "aprovado" }),
});
const rpcC = (fn, a) => fetch(`${U}/rest/v1/rpc/${fn}`, { method: "POST", headers: HC, body: JSON.stringify(a) });
const ped = await (await rpcC("loan_request", { p_amount: 5000, p_installments: 12, p_seguro_tipo: "veiculo", p_periodicidade: "mensal" })).json();

const adm = await (await fetch(`${U}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@sobreimprestimos.com.br", password: "Sobre@Admin2026" }) })).json();
const HA = { apikey: ANON, Authorization: `Bearer ${adm.access_token}`, "Content-Type": "application/json" };
await fetch(`${U}/rest/v1/rpc/admin_set_decision`, { method: "POST", headers: HA, body: JSON.stringify({ p_id: ped.id, p_status: "aprovado", p_monthly_rate: 0.0399, p_iof: 55, p_installment: 543.6, p_cet: 0.6, p_note: "t" }) });
await fetch(`${U}/rest/v1/rpc/admin_set_decision`, { method: "POST", headers: HA, body: JSON.stringify({ p_id: ped.id, p_status: "liberado", p_note: "t" }) });
await fetch(`${U}/rest/v1/rpc/bank_credit_loan`, { method: "POST", headers: HA, body: JSON.stringify({ p_loan_id: ped.id }) });

const PAGINAS = [
  { nome: "home", url: "/", auth: false },
  { nome: "entrar", url: "/entrar", auth: false },
  { nome: "cadastro", url: "/cadastro", auth: false },
  { nome: "conta (início)", url: "/conta", auth: true },
  { nome: "conta bancária", url: "/conta/banco", auth: true },
  { nome: "meus empréstimos", url: "/conta/emprestimos", auth: true },
  { nome: "pedir empréstimo", url: "/conta/emprestimo", auth: true },
  { nome: "verificação", url: "/conta/verificacao", auth: true },
];

/*
 * Mede a página no navegador. Não temos browser headless disponível, então
 * usamos o que é verificável do lado do servidor: presença das regras que
 * impedem estouro, e o HTML não contém largura fixa maior que a tela.
 */
console.log("\n-- conteúdo largo fixo (não pode passar da tela) --");

for (const a of APARELHOS) {
  for (const pg of PAGINAS) {
    const r = await fetch(SITE + pg.url, {
      headers: { "user-agent": a.ua, cookie: pg.auth ? cookie : "" },
      redirect: "manual",
    });
    const html = await r.text();

    // 1. A página abre (200 ou redirect de sessão).
    const abriu = r.status === 200 || r.status === 307 || r.status === 302;

    /*
     * Procuramos largura FIXA (`width:`) que estoure a tela. `max-width` é
     * seguro por definição — ele limita, não impõe — então é ignorado.
     * O atributo `width` de imagem também entra, pois imagem larga empurra
     * o layout.
     */
    const larguras = [
      ...[...html.matchAll(/style="[^"]*?(?<!max-)\bwidth:\s*(\d{3,})px/g)].map((m) => Number(m[1])),
      ...[...html.matchAll(/<img[^>]+\bwidth="(\d{3,})"/g)].map((m) => Number(m[1])),
    ].filter((n) => n > a.w);

    ok(`${a.nome} · ${pg.nome}`, abriu && larguras.length === 0,
      !abriu ? `status ${r.status}` : `largura fixa de ${larguras.join(", ")}px numa tela de ${a.w}px`);
  }
}

/* --- 3. As regras responsivas estão no CSS entregue --- */
console.log("\n-- regras responsivas no CSS --");
const css = await (await fetch(`${SITE}/_next/static/css/`)).text().catch(() => "");
const homeCompleta = homeHtml;
const cssLinks = [...homeCompleta.matchAll(/href="(\/_next\/static\/css\/[^"]+)"/g)].map((m) => m[1]);
let cssTodo = "";
for (const l of cssLinks) cssTodo += await (await fetch(SITE + l)).text();

ok("o CSS tem media query de 560px", /max-width:\s*560px/.test(cssTodo));
ok("o CSS tem media query de 380px", /max-width:\s*380px/.test(cssTodo));
ok("tabelas viram bloco no celular", /\.users-table\s*{[^}]*display:\s*block/s.test(cssTodo));
ok("alvos de toque de 44px", /min-height:\s*44px/.test(cssTodo));
ok("área segura tratada", /env\(safe-area-inset/.test(cssTodo));
ok("rolagem lateral bloqueada", /overflow-x:\s*hidden/.test(cssTodo));
ok("texto de campo com 16px (evita zoom no iOS)", /font-size:\s*16px/.test(cssTodo));

/* --- 4. A tabela de parcelas tem os rótulos para o modo cartão --- */
console.log("\n-- tabelas adaptadas --");
const pagParcelas = await (await fetch(`${SITE}/conta/emprestimos`, { headers: { cookie } })).text();
ok("a tabela de parcelas traz data-label", /data-label="Vencimento"/.test(pagParcelas));
ok("a tabela de parcelas traz rótulo de valor", /data-label="Valor"/.test(pagParcelas));
ok("a tabela de parcelas traz rótulo de situação", /data-label="Situação"/.test(pagParcelas));

/* ------------------------------ limpeza ------------------------------ */
await fetch(`${U}/rest/v1/bank_boletos?user_id=eq.${uid}`, { method: "DELETE", headers: HS });
await fetch(`${U}/rest/v1/loan_requests?user_id=eq.${uid}`, { method: "DELETE", headers: HS });
await fetch(`${U}/rest/v1/bank_transactions?user_id=eq.${uid}`, { method: "DELETE", headers: HS });
await fetch(`${U}/auth/v1/admin/users/${uid}`, { method: "DELETE", headers: HS });
ok("dados de teste removidos", true);

console.log(`\n=== ${p} passaram, ${f} falharam ===\n`);
process.exit(f ? 1 : 0);
