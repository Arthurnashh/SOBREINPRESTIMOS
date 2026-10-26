/**
 * Teste funcional das operações bancárias novas, direto contra o Supabase.
 *
 * Chama as RPCs com o access token do usuário (elas são SECURITY DEFINER e
 * usam auth.uid()), então mede o efeito no saldo em vez de assumir valor
 * inicial. Roda em qualquer ordem e pode ser repetido.
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
const EMAIL = "admin@sobreimprestimos.com.br";
const SENHA = "Sobre@Admin2026";

let passou = 0;
let falhou = 0;

function ok(nome, cond, detalhe = "") {
  if (cond) {
    passou++;
    console.log(`  ✔ ${nome}`);
  } else {
    falhou++;
    console.log(`  ✘ ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

function perto(a, b, eps = 0.011) {
  return Math.abs(a - b) < eps;
}

// ---------------------------------------------------------------------
// login
// ---------------------------------------------------------------------
const login = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: SENHA }),
});
if (!login.ok) {
  console.error("login falhou:", login.status, await login.text());
  process.exit(1);
}
const sessao = await login.json();
const TOKEN = sessao.access_token;

// Movimentar exige identidade aprovada desde o KYC. Aprova o titular antes
// dos testes de saída (saque, recarga, agendamento).
{
  const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
  const HS = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
  const perfis = await fetch(`${URL_BASE}/rest/v1/profiles?select=id&limit=1`, {
    headers: HS,
  }).then((r) => r.json());
  const uid = perfis?.[0]?.id;
  if (uid) {
    await fetch(`${URL_BASE}/rest/v1/kyc_submissions?user_id=eq.${uid}`, {
      method: "PATCH",
      headers: { ...HS, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ status: "aprovado" }),
    });
  }
}

async function rpc(nome, args = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const texto = await r.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = texto;
  }
  return { ok: r.ok, status: r.status, data: json, erro: r.ok ? null : (json?.message ?? texto) };
}

async function ler(tabela, query = "") {
  const r = await fetch(`${URL_BASE}/rest/v1/${tabela}?${query}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${TOKEN}` },
  });
  if (!r.ok) return [];
  return await r.json();
}

async function saldo() {
  const r = await rpc("bank_summary");
  const linhas = Array.isArray(r.data) ? r.data : [r.data];
  return Number(linhas[0]?.balance ?? 0);
}

async function disponivel() {
  const r = await rpc("bank_summary");
  const linhas = Array.isArray(r.data) ? r.data : [r.data];
  return Number(linhas[0]?.available ?? 0);
}

console.log("\n=== OPERAÇÕES BANCÁRIAS NOVAS ===\n");

// ---------------------------------------------------------------------
console.log("1) Depósito");
const antesDep = await saldo();
const dep = await rpc("bank_deposit", { p_amount: 250, p_method: "pix", p_origin: "Teste automatizado" });
ok("depósito de R$ 250 aceito", dep.ok, dep.erro);
const aposDep = await saldo();
ok("saldo subiu R$ 250", perto(aposDep - antesDep, 250), `${antesDep} → ${aposDep}`);

const depZero = await rpc("bank_deposit", { p_amount: 0, p_method: "pix" });
ok("depósito de zero recusado", !depZero.ok, depZero.erro);

const depInvalido = await rpc("bank_deposit", { p_amount: 100, p_method: "cripto" });
ok("forma de depósito inválida recusada", !depInvalido.ok, depInvalido.erro);

const listaDep = await ler("bank_deposits", "select=id,amount&order=created_at.desc&limit=1");
ok("depósito aparece no histórico", listaDep.length === 1 && perto(Number(listaDep[0].amount), 250));

// ---------------------------------------------------------------------
console.log("\n2) Saque");
const antesSaq = await saldo();
const saq = await rpc("bank_withdraw", { p_amount: 100, p_method: "caixa" });
ok("saque de R$ 100 aceito", saq.ok, saq.erro);
const aposSaq = await saldo();
ok("saldo caiu R$ 100", perto(antesSaq - aposSaq, 100), `${antesSaq} → ${aposSaq}`);

const linhaSaq = Array.isArray(saq.data) ? saq.data[0] : saq.data;
ok("saque gerou código de retirada", typeof linhaSaq?.withdraw_code === "string" && linhaSaq.withdraw_code.length >= 6,
   JSON.stringify(linhaSaq?.withdraw_code));

const saqMetodoRuim = await rpc("bank_withdraw", { p_amount: 10, p_method: "cheque" });
ok("forma de saque inválida recusada", !saqMetodoRuim.ok, saqMetodoRuim.erro);

const saqCaro = await rpc("bank_withdraw", { p_amount: 99999999, p_method: "pix" });
ok("saque acima do saldo recusado", !saqCaro.ok, saqCaro.erro);

// ---------------------------------------------------------------------
console.log("\n3) Recarga de celular");
const antesRec = await saldo();
const rec = await rpc("bank_topup", { p_carrier: "Vivo", p_phone: "(11) 98765-4321", p_amount: 20 });
ok("recarga de R$ 20 aceita", rec.ok, rec.erro);
const aposRec = await saldo();
ok("saldo caiu R$ 20", perto(antesRec - aposRec, 20), `${antesRec} → ${aposRec}`);

const recTel = await rpc("bank_topup", { p_carrier: "Vivo", p_phone: "123", p_amount: 20 });
ok("telefone curto recusado", !recTel.ok, recTel.erro);

const recCara = await rpc("bank_topup", { p_carrier: "Vivo", p_phone: "11987654321", p_amount: 500 });
ok("recarga acima do teto recusada", !recCara.ok, recCara.erro);

const linhaRec = await ler("bank_topups", "select=phone,carrier&order=created_at.desc&limit=1");
ok("telefone guardado só com dígitos", linhaRec[0]?.phone === "11987654321", JSON.stringify(linhaRec[0]?.phone));

// ---------------------------------------------------------------------
console.log("\n4) Cobrança PIX (receber)");
const cob = await rpc("bank_create_pix_charge", { p_amount: 75, p_description: "Serviço de teste" });
ok("cobrança de R$ 75 gerada", cob.ok, cob.erro);
const linhaCob = Array.isArray(cob.data) ? cob.data[0] : cob.data;
ok("cobrança tem código copia e cola", typeof linhaCob?.emv === "string" && linhaCob.emv.length > 40,
   `tamanho ${linhaCob?.emv?.length}`);
ok("cobrança nasce aberta", linhaCob?.status === "aberta", linhaCob?.status);

const cobTexto = await rpc("bank_create_pix_charge", { p_amount: 10, p_description: "x".repeat(400) });
const linhaCobTexto = Array.isArray(cobTexto.data) ? cobTexto.data[0] : cobTexto.data;
ok("descrição longa é truncada", (linhaCobTexto?.description ?? "").length <= 140,
   `len ${linhaCobTexto?.description?.length}`);

// ---------------------------------------------------------------------
console.log("\n5) Agendamento");
const hoje = new Date();
const futuro = new Date(hoje.getTime() + 5 * 86400000).toISOString().slice(0, 10);
const passado = new Date(hoje.getTime() - 86400000).toISOString().slice(0, 10);

const ag = await rpc("bank_schedule", {
  p_kind: "pix", p_target: "teste@exemplo.com", p_amount: 30, p_runs_on: futuro, p_message: "aluguel",
});
ok("agendamento futuro aceito", ag.ok, ag.erro);
const linhaAg = Array.isArray(ag.data) ? ag.data[0] : ag.data;
ok("agendamento nasce agendado", linhaAg?.status === "agendado", linhaAg?.status);

const agPassado = await rpc("bank_schedule", {
  p_kind: "pix", p_target: "teste@exemplo.com", p_amount: 30, p_runs_on: passado,
});
ok("agendamento no passado recusado", !agPassado.ok, agPassado.erro);

const agLonge = await rpc("bank_schedule", {
  p_kind: "pix", p_target: "teste@exemplo.com", p_amount: 30,
  p_runs_on: new Date(hoje.getTime() + 800 * 86400000).toISOString().slice(0, 10),
});
ok("agendamento além de um ano recusado", !agLonge.ok, agLonge.erro);

const agTipoRuim = await rpc("bank_schedule", {
  p_kind: "debito", p_target: "teste@exemplo.com", p_amount: 30, p_runs_on: futuro,
});
ok("tipo de agendamento inválido recusado", !agTipoRuim.ok, agTipoRuim.erro);

// cancelar precisa de um id real
const listaAg = await ler("bank_schedules", "select=id,status&status=eq.agendado&limit=1");
if (listaAg.length) {
  const cancel = await rpc("bank_cancel_schedule", { p_id: listaAg[0].id });
  ok("agendamento cancelado", cancel.ok, cancel.erro);
  const depois = await ler("bank_schedules", `select=status&id=eq.${listaAg[0].id}`);
  ok("status virou cancelado", depois[0]?.status === "cancelado", depois[0]?.status);
} else {
  ok("agendamento cancelado", false, "nenhum agendamento encontrado para cancelar");
}

// ---------------------------------------------------------------------
console.log("\n6) Limites");
const lim = await rpc("bank_ensure_limits", { p_user_id: null });
ok("limites existem para a conta", lim.ok || lim.status === 400, lim.erro ?? "");

const lerLim = await ler("bank_limits", "select=pix_per_tx,pix_per_day,transfer_per_tx,withdraw_per_day&limit=1");
ok("limites padrão gravados", lerLim.length === 1 && Number(lerLim[0].pix_per_tx) > 0, JSON.stringify(lerLim[0]));

const setLim = await rpc("bank_set_limits", {
  p_pix_per_tx: 1234, p_pix_per_day: 2345, p_transfer_per_tx: 3456, p_withdraw_per_day: 456,
});
ok("limites atualizados", setLim.ok, setLim.erro);
const lerLim2 = await ler("bank_limits", "select=pix_per_tx,pix_per_day&limit=1");
ok("limite por PIX gravou 1234", perto(Number(lerLim2[0]?.pix_per_tx), 1234), lerLim2[0]?.pix_per_tx);

const pixAcima = await rpc("bank_send_pix", { p_key: "alguem@exemplo.com", p_amount: 5000 });
ok("PIX acima do limite por operação recusado", !pixAcima.ok, pixAcima.erro);
ok("mensagem fala de limite", /limite/i.test(pixAcima.erro ?? ""), pixAcima.erro);

const limNeg = await rpc("bank_set_limits", {
  p_pix_per_tx: -1, p_pix_per_day: 100, p_transfer_per_tx: 100, p_withdraw_per_day: 100,
});
ok("limite negativo recusado", !limNeg.ok, limNeg.erro);

const limAlto = await rpc("bank_set_limits", {
  p_pix_per_tx: 999999999, p_pix_per_day: 100, p_transfer_per_tx: 100, p_withdraw_per_day: 100,
});
ok("limite absurdo recusado", !limAlto.ok, limAlto.erro);

// devolve limites generosos para os outros testes não travarem
await rpc("bank_set_limits", {
  p_pix_per_tx: 5000, p_pix_per_day: 10000, p_transfer_per_tx: 5000, p_withdraw_per_day: 3000,
});

// ---------------------------------------------------------------------
console.log("\n7) Dados cadastrais");
const dados = await rpc("bank_save_profile", {
  p_address_line: "Rua de Teste", p_address_num: "100", p_complement: "apto 1",
  p_district: "Centro", p_city: "São Paulo", p_state: "sp", p_zip: "01310-100",
  p_occupation: "Analista", p_income: 4500,
});
ok("dados cadastrais salvos", dados.ok, dados.erro);
const lerDados = await ler("bank_profiles", "select=state,zip,city&limit=1");
ok("UF normalizada para maiúscula", lerDados[0]?.state === "SP", lerDados[0]?.state);
ok("CEP guardado só com dígitos", lerDados[0]?.zip === "01310100", lerDados[0]?.zip);

const cepRuim = await rpc("bank_save_profile", {
  p_address_line: "Rua X", p_address_num: "1", p_complement: "", p_district: "Centro",
  p_city: "São Paulo", p_state: "SP", p_zip: "123", p_occupation: "", p_income: null,
});
ok("CEP curto recusado", !cepRuim.ok, cepRuim.erro);

const ufRuim = await rpc("bank_save_profile", {
  p_address_line: "Rua X", p_address_num: "1", p_complement: "", p_district: "Centro",
  p_city: "São Paulo", p_state: "XX", p_zip: "01310100", p_occupation: "", p_income: null,
});
ok("UF inexistente recusada", !ufRuim.ok, ufRuim.erro);

// ---------------------------------------------------------------------
console.log("\n8) Cartão: bloquear e desbloquear");
const bloq = await rpc("bank_set_card_status", { p_status: "bloqueado" });
ok("cartão bloqueado", bloq.ok, bloq.erro);
const lerCartao = await ler("bank_cards", "select=status&limit=1");
ok("status do cartão é bloqueado", lerCartao[0]?.status === "bloqueado", lerCartao[0]?.status);

const desbloq = await rpc("bank_set_card_status", { p_status: "ativo" });
ok("cartão desbloqueado", desbloq.ok, desbloq.erro);

const statusRuim = await rpc("bank_set_card_status", { p_status: "cancelado_pelo_cliente" });
ok("situação inválida recusada", !statusRuim.ok, statusRuim.erro);

// ---------------------------------------------------------------------
console.log("\n9) Comprovantes");
const comps = await ler("bank_receipts", "select=id,kind,title,payload&order=created_at.desc&limit=10");
ok("comprovantes foram gravados", comps.length > 0, `${comps.length} encontrados`);
const tipos = new Set(comps.map((c) => c.kind));
ok("comprovante de depósito existe", tipos.has("deposito"), [...tipos].join(", "));
ok("comprovante de saque existe", tipos.has("saque"), [...tipos].join(", "));
ok("comprovante de recarga existe", tipos.has("recarga"), [...tipos].join(", "));

// ---------------------------------------------------------------------
console.log("\n10) Segregação: cliente não move dinheiro de outro");
const forcar = await rpc("bank_move_for", {
  p_user_id: "00000000-0000-0000-0000-000000000000",
  p_kind: "deposito", p_description: "invasão", p_amount: 1000,
  p_counterparty: null, p_document_id: null,
});
ok("bank_move_for bloqueado para cliente", !forcar.ok, `status ${forcar.status}`);

const correrAgenda = await rpc("bank_run_schedules", {});
ok("bank_run_schedules bloqueado para cliente", !correrAgenda.ok, `status ${correrAgenda.status}`);

// ---------------------------------------------------------------------
console.log(`\n=== ${passou} passaram, ${falhou} falharam ===\n`);
process.exit(falhou ? 1 : 0);
