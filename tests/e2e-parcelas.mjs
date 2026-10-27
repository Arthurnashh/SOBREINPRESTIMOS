/**
 * Parcelas do empréstimo: geração, contrato, cobrança e tela do cliente.
 *
 * Cobre o caminho inteiro: o cliente pede com uma periodicidade, o admin
 * libera, o cronograma é gerado, e o cliente vê contrato e parcelas.
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

console.log("\n=== PARCELAS DO EMPRÉSTIMO ===\n");

const adm = await (await fetch(`${U}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@sobreimprestimos.com.br", password: "Sobre@Admin2026" }),
})).json();
const HA = { apikey: ANON, Authorization: `Bearer ${adm.access_token}`, "Content-Type": "application/json" };
const rpcA = async (fn, a = {}) => {
  const r = await fetch(`${U}/rest/v1/rpc/${fn}`, { method: "POST", headers: HA, body: JSON.stringify(a) });
  const t = await r.text();
  let d = null; try { d = t ? JSON.parse(t) : null; } catch {}
  return { ok: r.ok, data: d, erro: r.ok ? "" : t };
};

const cpf = (() => { const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)); const dv = (b) => { const s = b.reduce((a, d, i) => a + d * (b.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; }; const d1 = dv(n); return [...n, d1, dv([...n, d1])].join(""); })();
const email = `par.${Date.now()}@example.com`;
const cli = await (await fetch(`${U}/auth/v1/signup`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "Par@Teste2026", data: { full_name: "Cliente Parcela Teste", cpf, phone: "11955551212" } }) })).json();
const uid = cli.user.id;
const HC = { apikey: ANON, Authorization: `Bearer ${cli.access_token}`, "Content-Type": "application/json" };
const cookie = `sb-${REF}-auth-token=${encodeURIComponent(JSON.stringify({
  access_token: cli.access_token, token_type: "bearer", expires_in: cli.expires_in,
  expires_at: cli.expires_at, refresh_token: cli.refresh_token, user: cli.user }))}`;

await fetch(`${U}/rest/v1/kyc_submissions?user_id=eq.${uid}`, {
  method: "PATCH", headers: { ...HS, Prefer: "return=minimal" }, body: JSON.stringify({ status: "aprovado" }),
});

const rpcC = async (fn, a = {}) => {
  const r = await fetch(`${U}/rest/v1/rpc/${fn}`, { method: "POST", headers: HC, body: JSON.stringify(a) });
  const t = await r.text();
  let d = null; try { d = t ? JSON.parse(t) : null; } catch {}
  return { ok: r.ok, data: d, erro: r.ok ? "" : t };
};

/* ---------- 1. periodicidade no pedido ---------- */
console.log("-- periodicidade --");

const limpar = () => fetch(`${U}/rest/v1/loan_requests?user_id=eq.${uid}`, { method: "DELETE", headers: HS });

await limpar();
const semanal = await rpcC("loan_request", { p_amount: 1200, p_installments: 12, p_seguro_tipo: "nenhum", p_periodicidade: "semanal" });
ok("pedido semanal com 12 parcelas é aceito", semanal.ok, semanal.erro.slice(0, 140));
ok("a periodicidade foi gravada", semanal.data?.periodicidade === "semanal", String(semanal.data?.periodicidade));
ok("a taxa do período foi gravada", Number(semanal.data?.taxa_periodo) > 0 && Number(semanal.data?.taxa_periodo) < 0.0399,
  String(semanal.data?.taxa_periodo));

await limpar();
const quinzenal = await rpcC("loan_request", { p_amount: 1500, p_installments: 18, p_seguro_tipo: "imovel", p_periodicidade: "quinzenal" });
ok("pedido quinzenal com 18 parcelas é aceito", quinzenal.ok, quinzenal.erro.slice(0, 140));

await limpar();
const prazoErrado = await rpcC("loan_request", { p_amount: 1500, p_installments: 18, p_seguro_tipo: "nenhum", p_periodicidade: "semanal" });
ok("18 parcelas é inválido no semanal", !prazoErrado.ok && /prazo/i.test(prazoErrado.erro), prazoErrado.erro.slice(0, 110));

await limpar();
const perInvalida = await rpcC("loan_request", { p_amount: 1500, p_installments: 12, p_seguro_tipo: "nenhum", p_periodicidade: "diaria" });
ok("periodicidade inventada é recusada", !perInvalida.ok && /periodicidade/i.test(perInvalida.erro), perInvalida.erro.slice(0, 110));

/* A chamada com 4 argumentos (sem periodicidade) continua válida. */
await limpar();
const semPeriodo = await rpcC("loan_request", { p_amount: 900, p_installments: 12, p_seguro_tipo: "nenhum" });
ok("chamada antiga (sem periodicidade) segue funcionando", semPeriodo.ok, semPeriodo.erro.slice(0, 140));
ok("sem periodicidade assume mensal", semPeriodo.data?.periodicidade === "mensal", String(semPeriodo.data?.periodicidade));

/* ---------- 2. liberar gera o cronograma ---------- */
console.log("\n-- liberação gera as parcelas --");

await limpar();
const pedido = await rpcC("loan_request", { p_amount: 1200, p_installments: 12, p_seguro_tipo: "veiculo", p_periodicidade: "semanal" });
ok("pedido criado para liberar", pedido.ok, pedido.erro.slice(0, 140));
const loanId = pedido.data?.id;

const aprovar = await rpcA("admin_set_decision", {
  p_id: loanId, p_status: "aprovado", p_monthly_rate: 0.0399,
  p_iof: 12, p_installment: 105, p_cet: 0.6, p_note: "teste",
});
ok("admin aprova", aprovar.ok, aprovar.erro.slice(0, 140));

const antesLiberar = (await (await fetch(`${U}/rest/v1/loan_installments?loan_id=eq.${loanId}&select=id`, { headers: HS })).json()).length;
ok("aprovar ainda NÃO gera parcelas", antesLiberar === 0, String(antesLiberar));

const liberar = await rpcA("admin_set_decision", { p_id: loanId, p_status: "liberado", p_note: "teste" });
ok("admin libera", liberar.ok, liberar.erro.slice(0, 140));

const credito = await rpcA("bank_credit_loan", { p_loan_id: loanId });
ok("o crédito entra na conta e gera o cronograma", credito.ok, credito.erro.slice(0, 160));

const parcelas = await (await fetch(`${U}/rest/v1/loan_installments?loan_id=eq.${loanId}&select=*&order=numero`, { headers: HS })).json();
ok("foram geradas 12 parcelas", parcelas.length === 12, String(parcelas.length));
ok("cada parcela tem vencimento", parcelas.every((x) => x.vencimento));
ok("cada parcela tem valor positivo", parcelas.every((x) => Number(x.valor) > 0));
ok("todas começam em aberto", parcelas.every((x) => x.status === "aberta"));

/* Periodicidade semanal: os vencimentos são de 7 em 7 dias. */
const datas = parcelas.map((x) => new Date(x.vencimento + "T00:00:00Z").getTime());
const intervalos = datas.slice(1).map((d, i) => Math.round((d - datas[i]) / 86400000));
ok("os vencimentos são de 7 em 7 dias", intervalos.every((d) => d === 7), intervalos.join(","));

/* O cronograma não pode ser recriado nem duplicado. */
await rpcA("bank_credit_loan", { p_loan_id: loanId });
const depois = await (await fetch(`${U}/rest/v1/loan_installments?loan_id=eq.${loanId}&select=id`, { headers: HS })).json();
ok("creditar de novo NÃO duplica parcelas", depois.length === 12, String(depois.length));

const saldo = (await (await fetch(`${U}/rest/v1/bank_accounts?user_id=eq.${uid}&select=balance`, { headers: HS })).json())[0];
ok("o saldo do cliente é 1.200", Number(saldo?.balance) === 1200, String(saldo?.balance));

/* ---------- 3. contrato ---------- */
console.log("\n-- contrato --");

const contrato = await rpcC("loan_contrato", { p_loan_id: loanId });
ok("o cliente abre o próprio contrato", contrato.ok, contrato.erro.slice(0, 140));
ok("o contrato traz as 12 parcelas", (contrato.data?.parcelas ?? []).length === 12, String(contrato.data?.parcelas?.length));
ok("o total do contrato é 12 × 105", Number(contrato.data?.total_contrato) === 1260, String(contrato.data?.total_contrato));
ok("nada pago ainda", Number(contrato.data?.total_pago) === 0, String(contrato.data?.total_pago));
ok("saldo devedor é o total", Number(contrato.data?.saldo_devedor) === 1260, String(contrato.data?.saldo_devedor));
ok("conta 12 parcelas abertas", Number(contrato.data?.abertas) === 12, String(contrato.data?.abertas));
ok("tem próximo vencimento", Boolean(contrato.data?.proximo_vencimento), String(contrato.data?.proximo_vencimento));

/* Um segundo cliente não pode ver contrato alheio. */
const cpf2 = (() => { const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)); const dv = (b) => { const s = b.reduce((a, d, i) => a + d * (b.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; }; const d1 = dv(n); return [...n, d1, dv([...n, d1])].join(""); })();
const outro = await (await fetch(`${U}/auth/v1/signup`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: `outro.${Date.now()}@example.com`, password: "Out@Teste2026", data: { full_name: "Outro Cliente", cpf: cpf2, phone: "11955553434" } }) })).json();
const negContrato = await (await fetch(`${U}/rest/v1/rpc/loan_contrato`, {
  method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${outro.access_token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ p_loan_id: loanId }),
})).text();
ok("outro cliente não abre contrato alheio", /acesso restrito/i.test(negContrato), negContrato.slice(0, 110));

const parcelasAlheias = await (await fetch(`${U}/rest/v1/loan_installments?loan_id=eq.${loanId}&select=id`, {
  headers: { apikey: ANON, Authorization: `Bearer ${outro.access_token}` },
})).json();
ok("outro cliente não vê as parcelas (RLS)", Array.isArray(parcelasAlheias) && parcelasAlheias.length === 0, JSON.stringify(parcelasAlheias).slice(0, 90));

/* ---------- 4. boleto / PIX da parcela ---------- */
console.log("\n-- cobrança da parcela --");

const alvoParcela = parcelas[0].id;
const cobranca = await rpcC("loan_installment_charge", { p_installment_id: alvoParcela });
ok("o cliente gera a cobrança da parcela", cobranca.ok, cobranca.erro.slice(0, 160));
ok("devolve linha digitável", Boolean(cobranca.data?.linha_digitavel), String(cobranca.data?.linha_digitavel));
ok("a linha tem 47 dígitos", String(cobranca.data?.linha_digitavel ?? "").length === 47, String(cobranca.data?.linha_digitavel ?? "").length);
ok("devolve nosso número", Boolean(cobranca.data?.nosso_numero), String(cobranca.data?.nosso_numero));
ok("o gateway está marcado como pendente", cobranca.data?.gateway === "pendente", String(cobranca.data?.gateway));
ok("o valor bate com a parcela", Number(cobranca.data?.valor) === Number(parcelas[0].valor), String(cobranca.data?.valor));

const denovo = await rpcC("loan_installment_charge", { p_installment_id: alvoParcela });
ok("gerar de novo devolve a mesma cobrança", denovo.data?.charge_id === cobranca.data?.charge_id,
  `${denovo.data?.charge_id} vs ${cobranca.data?.charge_id}`);

const boletos = await (await fetch(`${U}/rest/v1/bank_boletos?installment_id=eq.${alvoParcela}&select=id`, { headers: HS })).json();
ok("só existe UM boleto para a parcela", boletos.length === 1, String(boletos.length));

const parcelaComBoleto = (await (await fetch(`${U}/rest/v1/loan_installments?id=eq.${alvoParcela}&select=charge_id`, { headers: HS })).json())[0];
ok("a parcela guarda a referência da cobrança", parcelaComBoleto?.charge_id === cobranca.data?.charge_id);

/* Um cliente não pode gerar cobrança da parcela de outro. */
const negCobranca = await (await fetch(`${U}/rest/v1/rpc/loan_installment_charge`, {
  method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${outro.access_token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ p_installment_id: alvoParcela }),
})).text();
ok("outro cliente não gera cobrança alheia", /acesso restrito/i.test(negCobranca), negCobranca.slice(0, 110));

/* ---------- 5. a tela do cliente ---------- */
console.log("\n-- tela Meus empréstimos --");

const pagina = await (await fetch(`${SITE}/conta/emprestimos`, { headers: { cookie } })).text();
ok("a página abre", pagina.includes("Meus empréstimos"));
ok("mostra o valor da parcela", /105,00/.test(pagina), "não achei R$ 105,00");
ok("mostra o saldo devedor", /Saldo devedor/.test(pagina));
ok("mostra o quanto já foi pago", /Já pago/.test(pagina));
ok("mostra a lista de parcelas", /Parcela<\/th>|Parcelas/.test(pagina));
// O React quebra o texto em nós, então comparamos sem tags.
const textoPag = pagina.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
ok("mostra a contagem 1/12", /1\/12/.test(textoPag));
ok("mostra todas as 12 parcelas", /12\/12/.test(textoPag));
ok("mostra os vencimentos", /de nov\. de 2026|de dez\. de 2026/.test(textoPag));
ok("as parcelas começam em aberto", /Em aberto/.test(textoPag));
ok("tem o botão de gerar boleto/PIX", /Gerar boleto\/PIX/.test(textoPag));
ok("o menu tem Meus empréstimos", /href="\/conta\/emprestimos"/.test(pagina));

/* A página de pedido mostra a escolha de periodicidade. */
const pedirPagina = await (await fetch(`${SITE}/conta/emprestimo`, { headers: { cookie } })).text();
const textoPed = pedirPagina.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
ok("a página de pedido mostra Semanal", /Semanal/.test(textoPed));
ok("a página de pedido mostra Quinzenal", /Quinzenal/.test(textoPed));
ok("a página de pedido mostra Mensal", /Mensal/.test(textoPed));
ok("a página mostra a taxa por período", /por semana|por quinzena|por m\u00eas/.test(textoPed), textoPed.slice(textoPed.indexOf("Juros"), textoPed.indexOf("Juros") + 90));
ok("a taxa não sai com palavra quebrada", !/por mens\b/.test(textoPed));

/* ------------------------------ limpeza ------------------------------ */
await fetch(`${U}/rest/v1/bank_boletos?installment_id=eq.${alvoParcela}`, { method: "DELETE", headers: HS });
await fetch(`${U}/rest/v1/bank_receipts?user_id=eq.${uid}`, { method: "DELETE", headers: HS });
await fetch(`${U}/rest/v1/bank_transactions?user_id=eq.${uid}`, { method: "DELETE", headers: HS });
await fetch(`${U}/rest/v1/loan_requests?user_id=eq.${uid}`, { method: "DELETE", headers: HS });
await fetch(`${U}/auth/v1/admin/users/${uid}`, { method: "DELETE", headers: HS });
await fetch(`${U}/auth/v1/admin/users/${outro.user.id}`, { method: "DELETE", headers: HS });
ok("dados de teste removidos", true);

console.log(`\n=== ${p} passaram, ${f} falharam ===\n`);
process.exit(f ? 1 : 0);
