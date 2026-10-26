/**
 * KYC de ponta a ponta: etapas, upload, bloqueio, aprovação e segregação.
 *
 * Cria um cliente de teste com CPF válido, percorre as etapas, confirma que
 * a movimentação está travada, aprova como admin e confirma que liberou.
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

const U = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

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

const H = (t) => ({ apikey: ANON, Authorization: `Bearer ${t}`, "Content-Type": "application/json" });
const HS = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

async function rpc(nome, args = {}, token) {
  const r = await fetch(`${U}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: H(token),
    body: JSON.stringify(args),
  });
  const t = await r.text();
  let j = null;
  try {
    j = t ? JSON.parse(t) : null;
  } catch {
    j = t;
  }
  return { ok: r.ok, status: r.status, data: j, erro: r.ok ? null : (j?.message ?? t) };
}

async function logar(email, senha) {
  const r = await fetch(`${U}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: senha }),
  });
  return await r.json();
}

/** CPF com dígitos verificadores corretos. */
function cpfValido() {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (base) => {
    const soma = base.reduce((a, d, i) => a + d * (base.length + 1 - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(n);
  return [...n, d1, dv([...n, d1])].join("");
}

/** JPEG mínimo válido, para o upload ter conteúdo real. */
function jpegFalso(tamanho = 2048) {
  const cabecalho = [0xff, 0xd8, 0xff, 0xe0];
  const corpo = Array.from({ length: tamanho }, (_, i) => (i * 7) % 256);
  const rodape = [0xff, 0xd9];
  return new Uint8Array([...cabecalho, ...corpo, ...rodape]);
}

console.log("\n=== KYC — VERIFICAÇÃO DE IDENTIDADE ===\n");

/* --------------------------- prepara o cliente --------------------------- */
const EMAIL = `kyc.${Date.now()}@example.com`;
const SENHA = "Kyc@Teste2026";
const CPF = cpfValido();

const criado = await fetch(`${U}/auth/v1/admin/users`, {
  method: "POST",
  headers: HS,
  body: JSON.stringify({
    email: EMAIL,
    password: SENHA,
    email_confirm: true,
    user_metadata: { full_name: "Cliente Kyc Teste", cpf: CPF, phone: "11988887777" },
    data: { full_name: "Cliente Kyc Teste", cpf: CPF, phone: "11988887777" },
  }),
});
const criadoJson = await criado.json();
const uid = criadoJson.id;
ok("cliente de teste criado", criado.ok && Boolean(uid), JSON.stringify(criadoJson).slice(0, 90));

if (!uid) {
  console.log("\nabortando: sem usuário de teste\n");
  process.exit(1);
}

// garante o perfil (o trigger pode não receber o metadata)
await fetch(`${U}/rest/v1/profiles?id=eq.${uid}`, {
  method: "PATCH",
  headers: { ...HS, Prefer: "return=minimal" },
  body: JSON.stringify({ full_name: "Cliente Kyc Teste", cpf: CPF, phone: "11988887777" }),
});

const s = await logar(EMAIL, SENHA);
const TK = s.access_token;
ok("login do cliente funcionou", Boolean(TK), s.error_description ?? "");

if (!TK) {
  console.log("\nabortando: sem token\n");
  process.exit(1);
}

/* ------------------------------- estado --------------------------------- */
console.log("\n--- estado inicial ---\n");
const st0 = await rpc("kyc_meu_status", {}, TK);
ok("kyc_meu_status responde", st0.ok, st0.erro);
ok("começa em nao_iniciado", st0.data?.status === "nao_iniciado", st0.data?.status);
ok("não pode movimentar", st0.data?.pode_movimentar === false);

/* -------------------------------- etapa 1 -------------------------------- */
console.log("\n--- etapa 1: dados pessoais ---\n");
const ruim = await rpc("kyc_salvar_dados", {
  p_full_name: "So", p_birth_date: "1990-05-10", p_phone: "11988887777",
  p_email: "a@b.com", p_mother_name: "Maria Teste Silva",
}, TK);
ok("nome incompleto recusado", !ruim.ok, ruim.erro);

const menor = await rpc("kyc_salvar_dados", {
  p_full_name: "Cliente Kyc Teste", p_birth_date: "2015-05-10", p_phone: "11988887777",
  p_email: "cliente@exemplo.com", p_mother_name: "Maria Teste Silva",
}, TK);
ok("menor de 18 recusado", !menor.ok && /18 anos/i.test(menor.erro ?? ""), menor.erro);

const tel = await rpc("kyc_salvar_dados", {
  p_full_name: "Cliente Kyc Teste", p_birth_date: "1990-05-10", p_phone: "123",
  p_email: "cliente@exemplo.com", p_mother_name: "Maria Teste Silva",
}, TK);
ok("celular inválido recusado", !tel.ok, tel.erro);

const d1 = await rpc("kyc_salvar_dados", {
  p_full_name: "Cliente Kyc Teste", p_birth_date: "1990-05-10", p_phone: "11988887777",
  p_email: "cliente@exemplo.com", p_mother_name: "Maria Teste Silva",
}, TK);
ok("dados válidos aceitos", d1.ok, d1.erro);

/* -------------------------------- etapa 2 -------------------------------- */
console.log("\n--- etapa 2: endereço ---\n");
const cep = await rpc("kyc_salvar_endereco", {
  p_cep: "123", p_address: "Rua Teste", p_number: "10", p_extra: "",
  p_neighborhood: "Centro", p_city: "São Paulo", p_state: "SP",
}, TK);
ok("CEP inválido recusado", !cep.ok, cep.erro);

const uf = await rpc("kyc_salvar_endereco", {
  p_cep: "01310100", p_address: "Av Paulista", p_number: "1000", p_extra: "sala 5",
  p_neighborhood: "Bela Vista", p_city: "São Paulo", p_state: "XX",
}, TK);
ok("UF inexistente recusada", !uf.ok && /UF/i.test(uf.erro ?? ""), uf.erro);

const end = await rpc("kyc_salvar_endereco", {
  p_cep: "01310100", p_address: "Av Paulista", p_number: "1000", p_extra: "sala 5",
  p_neighborhood: "Bela Vista", p_city: "São Paulo", p_state: "SP",
}, TK);
ok("endereço válido aceito", end.ok, end.erro);

console.log("\n--- etapa 2: documento ---\n");
const dtipo = await rpc("kyc_salvar_documento", {
  p_doc_type: "titulo", p_doc_number: "12345", p_doc_issuer: "SSP", p_doc_state: "SP",
}, TK);
ok("tipo de documento inválido recusado", !dtipo.ok, dtipo.erro);

const doc = await rpc("kyc_salvar_documento", {
  p_doc_type: "cnh", p_doc_number: "12345678901", p_doc_issuer: "ssp", p_doc_state: "sp",
}, TK);
ok("documento CNH aceito", doc.ok, doc.erro);

const prova = await rpc("kyc_salvar_comprovante_tipo", { p_proof_type: "luz" }, TK);
ok("tipo de comprovante aceito", prova.ok, prova.erro);

/* ------------------------- uploads no bucket ----------------------------- */
console.log("\n--- etapa 2: arquivos ---\n");

async function subir(slot, nome) {
  const path = `${uid}/${slot}-${Date.now()}.jpg`;
  const r = await fetch(`${U}/storage/v1/object/kyc/${path}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${TK}`, "Content-Type": "image/jpeg" },
    body: jpegFalso(),
  });
  if (!r.ok) return { ok: false, erro: `${r.status} ${await r.text()}` };

  const reg = await rpc("kyc_registrar_arquivo", { p_slot: slot, p_path: path }, TK);
  return { ok: reg.ok, path, erro: reg.erro };
}

for (const [slot, rotulo] of [
  ["doc_frente", "frente do documento"],
  ["doc_verso", "verso do documento"],
  ["comprovante", "comprovante de endereço"],
  ["selfie_doc", "selfie com documento"],
  ["face_frontal", "rosto frontal"],
  ["face_direita", "rosto à direita"],
  ["face_esquerda", "rosto à esquerda"],
  ["face_sorriso", "rosto sorrindo"],
  ["face_perto", "rosto aproximado"],
]) {
  const r = await subir(slot, rotulo);
  ok(`upload: ${rotulo}`, r.ok, r.erro);
}

// caminho de outro dono deve ser recusado
const alheio = await rpc(
  "kyc_registrar_arquivo",
  { p_slot: "doc_frente", p_path: "00000000-0000-0000-0000-000000000000/x.jpg" },
  TK
);
ok("caminho de outro dono recusado", !alheio.ok, alheio.erro);

/* -------------------------------- etapa 3 -------------------------------- */
console.log("\n--- etapa 3: biometria ---\n");
const bio = await rpc(
  "kyc_registrar_biometria",
  { p_liveness_passed: true, p_liveness_score: 0.93, p_quality_score: 0.81 },
  TK
);
ok("biometria registrada", bio.ok, bio.erro);

const stBio = await rpc("kyc_meu_status", {}, TK);
ok("tem_biometria = true", stBio.data?.tem_biometria === true);
ok("liveness_passed = true", stBio.data?.liveness_passed === true);

/* --------------------------- envio incompleto ---------------------------- */
console.log("\n--- envio e bloqueio ---\n");
const env1 = await rpc("kyc_enviar", {}, TK);
ok("envio aceito com tudo preenchido", env1.ok, env1.erro);

const stEnv = await rpc("kyc_meu_status", {}, TK);
ok("status vira em_analise", stEnv.data?.status === "em_analise", stEnv.data?.status);
ok("ainda NÃO pode movimentar (em análise)", stEnv.data?.pode_movimentar === false);

// movimentação barrada enquanto em análise
const saida = await rpc(
  "bank_move",
  { p_kind: "saque", p_description: "Teste", p_amount: -5, p_counterparty: null, p_document_id: null },
  TK
);
ok("saque barrado em análise", !saida.ok, saida.ok ? "passou" : saida.erro);

const entrada = await rpc(
  "bank_move",
  { p_kind: "deposito", p_description: "Teste entrada", p_amount: 100, p_counterparty: null, p_document_id: null },
  TK
);
ok("depósito liberado mesmo em análise", entrada.ok, entrada.erro);

/* -------------------------------- admin ---------------------------------- */
console.log("\n--- análise pelo admin ---\n");
const sAdmin = await logar("admin@sobreimprestimos.com.br", "Sobre@Admin2026");
const TKA = sAdmin.access_token;

const filaCliente = await rpc("kyc_fila", {}, TK);
ok("cliente NÃO acessa a fila", !filaCliente.ok && /restrito/i.test(filaCliente.erro ?? ""), filaCliente.erro);

const fila = await rpc("kyc_fila", {}, TKA);
ok("admin acessa a fila", fila.ok, fila.erro);
ok("cliente aparece na fila", Array.isArray(fila.data) && fila.data.some((x) => x.user_id === uid));

const detalhe = await rpc("kyc_detalhe", { p_user_id: uid }, TKA);
ok("admin vê o detalhe", detalhe.ok, detalhe.erro);
ok("detalhe traz os 9 caminhos", detalhe.ok && Object.keys(detalhe.data?.paths ?? {}).length === 9);
ok("detalhe NÃO expõe hash do CVV nem senha", !JSON.stringify(detalhe.data ?? {}).includes("cvv"));

const semNota = await rpc("kyc_decidir", { p_user_id: uid, p_decisao: "recusado", p_nota: "" }, TKA);
ok("recusa sem motivo é barrada", !semNota.ok, semNota.erro);

const decisaoCliente = await rpc("kyc_decidir", { p_user_id: uid, p_decisao: "aprovado", p_nota: null }, TK);
ok("cliente NÃO se auto-aprova", !decisaoCliente.ok && /restrito/i.test(decisaoCliente.erro ?? ""), decisaoCliente.erro);

const aprova = await rpc("kyc_decidir", { p_user_id: uid, p_decisao: "aprovado", p_nota: "Documentos conferidos" }, TKA);
ok("admin aprova", aprova.ok, aprova.erro);

const stFinal = await rpc("kyc_meu_status", {}, TK);
ok("status vira aprovado", stFinal.data?.status === "aprovado", stFinal.data?.status);
ok("agora PODE movimentar", stFinal.data?.pode_movimentar === true);

// saque precisa funcionar agora
await rpc(
  "bank_move",
  { p_kind: "deposito", p_description: "Saldo para o saque", p_amount: 200, p_counterparty: null, p_document_id: null },
  TK
);
const saida2 = await rpc(
  "bank_move",
  { p_kind: "saque", p_description: "Saque liberado", p_amount: -10, p_counterparty: null, p_document_id: null },
  TK
);
ok("saque funciona após aprovação", saida2.ok, saida2.erro);

/* ------------------------------ auditoria -------------------------------- */
console.log("\n--- trilha de auditoria ---\n");
const eventos = await fetch(`${U}/rest/v1/kyc_events?user_id=eq.${uid}&select=de,para,nota`, {
  headers: H(TK),
});
const listaEventos = await eventos.json();
ok("eventos registrados", Array.isArray(listaEventos) && listaEventos.length >= 1, JSON.stringify(listaEventos).slice(0, 100));
ok(
  "evento de aprovação registrado",
  Array.isArray(listaEventos) && listaEventos.some((e) => e.para === "aprovado")
);

/* ----------------------------- segregação -------------------------------- */
console.log("\n--- segregação entre clientes ---\n");
const outroCli = await fetch(`${U}/rest/v1/kyc_submissions?select=user_id`, { headers: H(TK) });
const outroJson = await outroCli.json();
ok(
  "cliente só vê o próprio envio",
  Array.isArray(outroJson) && outroJson.every((x) => x.user_id === uid),
  JSON.stringify(outroJson).slice(0, 90)
);

const outroDet = await rpc("kyc_detalhe", { p_user_id: "00000000-0000-0000-0000-000000000000" }, TKA);
ok("detalhe de inexistente devolve erro limpo", !outroDet.ok, outroDet.erro);

/* ------------------------------- limpeza --------------------------------- */
console.log("\n--- limpeza ---\n");
await fetch(`${U}/storage/v1/object/kyc`, {
  method: "DELETE",
  headers: { ...HS, "Content-Type": "application/json" },
  body: JSON.stringify({ prefixes: [`${uid}/`] }),
});
const del = await fetch(`${U}/auth/v1/admin/users/${uid}`, { method: "DELETE", headers: HS });
ok("cliente de teste removido", del.ok, `status ${del.status}`);

console.log(`\n=== ${passou} passaram, ${falhou} falharam ===\n`);
process.exit(falhou ? 1 : 0);
