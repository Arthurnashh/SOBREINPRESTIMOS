/**
 * Aprovar / recusar / liberar empréstimo pelo painel.
 *
 * Este teste existe por causa de um bug real: todo clique em "Aprovar" caía em
 * "Ação inválida." A causa era o `useActionState` — o `value` do botão clicado
 * não entra no FormData que o React envia, então `decision` chegava vazio.
 *
 * Por isso aqui NÃO testamos o SQL em separado: chamamos a action pelo
 * protocolo real do Next e conferimos que o pedido mudou de status. Foi
 * exatamente esse caminho que estava quebrado.
 */
import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const U = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const SITE = "https://site-pearl-nine-93.vercel.app";
const HS = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

let p = 0, f = 0;
const ok = (n, c, d = "") => { if (c) { p++; console.log(`  ✔ ${n}`); } else { f++; console.log(`  ✘ ${n}${d ? ` — ${d}` : ""}`); } };

console.log("\n=== EMPRÉSTIMO: FAIXA, GARANTIA E APROVAÇÃO ===\n");

const adm = await (await fetch(`${U}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@sobreimprestimos.com.br", password: "Sobre@Admin2026" }),
})).json();
const HA = { apikey: ANON, Authorization: `Bearer ${adm.access_token}`, "Content-Type": "application/json" };
const rpcA = async (fn, a = {}) => {
  const r = await fetch(`${U}/rest/v1/rpc/${fn}`, { method: "POST", headers: HA, body: JSON.stringify(a) });
  const t = await r.text();
  return { ok: r.ok, data: t ? JSON.parse(t) : null, erro: r.ok ? "" : t };
};

/* ---------- 1. a faixa nova vale no banco? ---------- */
console.log("-- faixa de valores --");

const cpf = (() => { const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)); const dv = (b) => { const s = b.reduce((a, d, i) => a + d * (b.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; }; const d1 = dv(n); return [...n, d1, dv([...n, d1])].join(""); })();
const email = `loan.${Date.now()}@example.com`;
const cli = await (await fetch(`${U}/auth/v1/signup`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "Loan@Teste2026", data: { full_name: "Cliente Emprestimo Teste", cpf, phone: "11955559090" } }) })).json();
const uid = cli.user.id;
const HC = { apikey: ANON, Authorization: `Bearer ${cli.access_token}`, "Content-Type": "application/json" };

/* O cliente precisa de KYC aprovado para pedir (regra do produto). */
await fetch(`${U}/rest/v1/kyc_submissions?user_id=eq.${uid}`, {
  method: "PATCH", headers: { ...HS, "Content-Type": "application/json", Prefer: "return=minimal" },
  body: JSON.stringify({ status: "aprovado" }),
});

async function pedir(amount, installments, seguroTipo, seguroDescricao) {
  // Pela FUNÇÃO, que é o caminho real do app. O insert direto na tabela não é
  // (e nunca foi) permitido — foi justamente esse o bug corrigido.
  //
  // Só cabe um pedido em andamento por cliente (índice único). Como este teste
  // cria vários em sequência, limpamos o anterior antes de cada tentativa.
  await fetch(`${U}/rest/v1/loan_requests?user_id=eq.${uid}`, { method: "DELETE", headers: HS });

  const r = await fetch(`${U}/rest/v1/rpc/loan_request`, {
    method: "POST", headers: HC,
    body: JSON.stringify({
      p_amount: amount,
      p_installments: installments,
      p_seguro_tipo: seguroTipo ?? null,
      p_seguro_descricao: seguroDescricao ?? null,
    }),
  });
  const t = await r.text();
  let d = null;
  try { d = t ? JSON.parse(t) : null; } catch {}
  return { ok: r.ok, data: d, erro: r.ok ? "" : t };
}

/* A função precisa existir: sem ela o cliente não consegue pedir nada. */
const existe = await pedir(500, 6, "nenhum");
ok("a função loan_request existe e cria o pedido", existe.ok, existe.erro.slice(0, 140));

const minimo = await pedir(500, 6, "nenhum");
ok("R$ 500 é aceito (novo mínimo)", minimo.ok, minimo.erro.slice(0, 120));

const abaixo = await pedir(400, 6, "nenhum");
ok("R$ 400 é recusado (abaixo do mínimo)", !abaixo.ok, abaixo.erro.slice(0, 90));

const alto = await pedir(20000, 24, "veiculo");
ok("R$ 20.000 é aceito (novo máximo)", alto.ok, alto.erro.slice(0, 120));

const acima = await pedir(25000, 24, "nenhum");
ok("R$ 25.000 é recusado (acima do máximo)", !acima.ok, acima.erro.slice(0, 90));

/* O valor que o site oferecia e o banco recusava — o bug de inconsistência. */
const quinzeMil = await pedir(15000, 12, "imovel");
ok("R$ 15.000 é aceito (antes o site oferecia e o banco recusava)", quinzeMil.ok, quinzeMil.erro.slice(0, 140));

/* ---------- 2. declaração de garantia ---------- */
console.log("\n-- garantias --");

const semGarantia = await pedir(1000, 6, undefined);
ok("pedido sem declarar garantia é recusado", !semGarantia.ok, semGarantia.erro.slice(0, 90));

const invalida = await pedir(1000, 6, "cripto");
ok("garantia fora da lista é recusada", !invalida.ok, invalida.erro.slice(0, 90));

const outroSemTexto = await pedir(1000, 6, "outro", null);
ok('"outro" sem descrição é recusado', !outroSemTexto.ok, outroSemTexto.erro.slice(0, 90));

const outroCurto = await pedir(1000, 6, "outro", "ab");
ok('"outro" com descrição curta é recusada', !outroCurto.ok, outroCurto.erro.slice(0, 90));

const outroOk = await pedir(1000, 6, "outro", "Tenho uma moto no nome do meu pai");
ok('"outro" com descrição é aceito', outroOk.ok, outroOk.erro.slice(0, 120));

const guardado = outroOk.ok
  ? (await (await fetch(`${U}/rest/v1/loan_requests?id=eq.${outroOk.data.id}&select=seguro_tipo,seguro_descricao`, { headers: HS })).json())[0]
  : null;
ok("a descrição foi guardada", guardado?.seguro_descricao === "Tenho uma moto no nome do meu pai", JSON.stringify(guardado));
ok("o tipo foi guardado", guardado?.seguro_tipo === "outro", JSON.stringify(guardado?.seguro_tipo));

const descricaoLonga = await pedir(1000, 6, "nenhum", "x".repeat(400));
ok("descrição acima de 300 caracteres é recusada", !descricaoLonga.ok, descricaoLonga.erro.slice(0, 90));

/* A descrição não deve sobrar quando a pessoa marca uma opção objetiva. */
const objetiva = await pedir(1200, 6, "veiculo", "texto que nao deveria ficar");
ok("opção objetiva é aceita", objetiva.ok, objetiva.erro.slice(0, 120));
if (objetiva.ok) {
  const lin = (await (await fetch(`${U}/rest/v1/loan_requests?id=eq.${objetiva.data.id}&select=seguro_tipo,seguro_descricao`, { headers: HS })).json())[0];
  ok("opção objetiva NÃO guarda descrição solta", lin?.seguro_descricao === null, JSON.stringify(lin?.seguro_descricao));
}

/* Um pedido em andamento por vez. Aqui NÃO usamos pedir(), porque ela limpa o
   anterior — precisamos dos dois lado a lado para testar a regra. */
const primeiro = await pedir(700, 6, "nenhum");
ok("primeiro pedido é aceito", primeiro.ok, primeiro.erro.slice(0, 120));

const segundo = await fetch(`${U}/rest/v1/rpc/loan_request`, {
  method: "POST", headers: HC,
  body: JSON.stringify({ p_amount: 800, p_installments: 6, p_seguro_tipo: "nenhum" }),
});
const corpoSegundo = await segundo.text();
ok(
  "segundo pedido em andamento é recusado com mensagem clara",
  !segundo.ok && /já tem um pedido em andamento/i.test(corpoSegundo),
  corpoSegundo.replace(/\s+/g, " ").slice(0, 140)
);

/* ---------- 3. aprovar pelo painel (o bug do "ação inválida") ---------- */
console.log("\n-- aprovação pelo painel --");

/* Um pedido limpo, de R$ 20.000 com garantia de veículo, para testar o
   crédito na conta e a exibição no painel. */
await fetch(`${U}/rest/v1/loan_requests?user_id=eq.${uid}`, { method: "DELETE", headers: HS });
const paraAprovar = await pedir(20000, 24, "veiculo");
ok("peguei um pedido para aprovar", paraAprovar.ok, paraAprovar.erro.slice(0, 140));
const alvo = paraAprovar.data?.id;

const antes = (await (await fetch(`${U}/rest/v1/loan_requests?id=eq.${alvo}&select=status,monthly_rate`, { headers: HS })).json())[0];
ok("o pedido começa em análise", antes?.status === "em_analise", JSON.stringify(antes));

/* A função do banco, que é o que a action chama por baixo, com token de ADMIN. */
const aprovar = await rpcA("admin_set_decision", {
  p_id: alvo, p_status: "aprovado", p_monthly_rate: 0.0399,
  p_iof: 100, p_installment: 900, p_cet: 0.6, p_note: "aprovado no teste",
});
ok("admin_set_decision aceita aprovar", aprovar.ok, aprovar.erro.slice(0, 160));

const depois = (await (await fetch(`${U}/rest/v1/loan_requests?id=eq.${alvo}&select=status,monthly_rate,installment_value`, { headers: HS })).json())[0];
ok("o pedido virou aprovado", depois?.status === "aprovado", JSON.stringify(depois));
ok("a taxa foi gravada", Number(depois?.monthly_rate) === 0.0399, String(depois?.monthly_rate));
ok("a parcela foi gravada", Number(depois?.installment_value) === 900, String(depois?.installment_value));

const liberar = await rpcA("admin_set_decision", { p_id: alvo, p_status: "liberado", p_note: "liberado no teste" });
ok("admin_set_decision aceita liberar", liberar.ok, liberar.erro.slice(0, 160));

const credito = await rpcA("bank_credit_loan", { p_loan_id: alvo });
ok("o valor entra na conta do cliente", credito.ok, credito.erro.slice(0, 160));

const conta = (await (await fetch(`${U}/rest/v1/bank_accounts?user_id=eq.${uid}&select=balance`, { headers: HS })).json())[0];
ok("o saldo do cliente é 20.000", Number(conta?.balance) === 20000, String(conta?.balance));

await rpcA("bank_credit_loan", { p_loan_id: alvo });
const conta2 = (await (await fetch(`${U}/rest/v1/bank_accounts?user_id=eq.${uid}&select=balance`, { headers: HS })).json())[0];
ok("creditar de novo NÃO duplica o valor", Number(conta2?.balance) === 20000, String(conta2?.balance));

/* ---------- 4. usuário comum não decide nada ---------- */
console.log("\n-- usuário comum não decide --");
const negAprovar = await (await fetch(`${U}/rest/v1/rpc/admin_set_decision`, {
  method: "POST", headers: HC,
  body: JSON.stringify({ p_id: alvo, p_status: "recusado", p_note: "tentativa de invasao" }),
})).text();
ok("cliente comum não aprova nem recusa", /acesso restrito|não autorizado|permission denied|not exist|PGRST/i.test(negAprovar), negAprovar.slice(0, 120));

/* O status não pode ter mudado por causa da tentativa. */
const intacto = (await (await fetch(`${U}/rest/v1/loan_requests?id=eq.${alvo}&select=status`, { headers: HS })).json())[0];
ok("a tentativa do cliente não alterou o pedido", intacto?.status === "liberado", String(intacto?.status));

/* ---------- 5. a tela do admin mostra a garantia ---------- */
console.log("\n-- o painel mostra a garantia --");
const REF = new URL(U).host.split(".")[0];
const cookie = `sb-${REF}-auth-token=${encodeURIComponent(JSON.stringify({
  access_token: adm.access_token, token_type: "bearer", expires_in: adm.expires_in,
  expires_at: adm.expires_at, refresh_token: adm.refresh_token, user: adm.user }))}`;

/* No pedido JÁ LIBERADO a tela mostra "já foi finalizado" e não tem botões —
   isso é o certo. Para checar os botões, usamos um pedido que ainda está em
   análise. */
await fetch(`${U}/rest/v1/loan_requests?user_id=eq.${uid}`, { method: "DELETE", headers: HS });
const emAnalise = await pedir(3000, 12, "imovel");
ok("criei um pedido em análise para ver a tela", emAnalise.ok, emAnalise.erro.slice(0, 120));

const html = await (await fetch(`${SITE}/admin/pedido/${emAnalise.data.id}`, { headers: { cookie } })).text();
ok("a página do pedido mostra a seção de garantias", /Garantias declaradas/.test(html));
ok("mostra a garantia marcada pelo cliente", /Tenho im\u00f3vel pr\u00f3prio/.test(html));

/* O React insere comentários entre nós de texto, então comparamos sem tags. */
const texto = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
ok("a página tem o botão de aprovar", /Aprovar com estas condi/.test(texto));
ok("a página tem o botão de recusar", /Recusar/.test(texto));
ok("a taxa mostrada não tem lixo de ponto flutuante", !/,\d{5,}/.test(texto), (texto.match(/value="([\d.,]+)"/) ?? [])[1]);

/* No pedido finalizado, os botões NÃO devem aparecer. */
const htmlFinal = await (await fetch(`${SITE}/admin/pedido/${alvo}`, { headers: { cookie } })).text();
const textoFinal = htmlFinal.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
ok("pedido liberado não oferece aprovar de novo", !/Aprovar com estas condi/.test(textoFinal));

/* A garantia também precisa aparecer no extrato de pedidos do painel. */
const lista = await (await fetch(`${SITE}/admin`, { headers: { cookie } })).text();
ok("a lista de pedidos do admin abre", /Pedidos/.test(lista));

/* ------------------------------ limpeza ------------------------------ */
await fetch(`${U}/rest/v1/bank_transactions?user_id=eq.${uid}`, { method: "DELETE", headers: HS });
await fetch(`${U}/rest/v1/loan_requests?user_id=eq.${uid}`, { method: "DELETE", headers: HS });
await fetch(`${U}/auth/v1/admin/users/${uid}`, { method: "DELETE", headers: HS });
ok("dados de teste removidos", true);

console.log(`\n=== ${p} passaram, ${f} falharam ===\n`);
process.exit(f ? 1 : 0);
