/**
 * O servidor não pode confiar na tela.
 *
 * O trilho de etapas da verificação deixava pular direto para o envio. Isso já
 * era barrado no banco (kyc_enviar recusa o que falta), mas não havia teste
 * provando — então uma regressão no SQL passaria despercebida.
 *
 * Aqui criamos uma conta de verdade, preenchemos só PARTE da verificação e
 * tentamos enviar. O servidor tem de recusar, dizendo o que falta.
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
const HS = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

let passou = 0, falhou = 0;
const ok = (n, c, d = "") => { if (c) { passou++; console.log(`  ✔ ${n}`); } else { falhou++; console.log(`  ✘ ${n}${d ? ` — ${d}` : ""}`); } };

function cpfValido() {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (b) => { const s = b.reduce((a, d, i) => a + d * (b.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(n);
  return [...n, d1, dv([...n, d1])].join("");
}

console.log("\n=== O SERVIDOR BARRA VERIFICAÇÃO INCOMPLETA ===\n");

const email = `inc.${Date.now()}@example.com`;
const cpf = cpfValido();
const up = await fetch(`${U}/auth/v1/signup`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "Inc@Teste2026", data: { full_name: "Inc Teste KYC", cpf, phone: "11955551111" } }),
}).then((r) => r.json());

const TK = up.access_token;
const uid = up.user?.id;
if (!TK) { console.log("não consegui criar a conta de teste"); process.exit(1); }

const H = { apikey: ANON, Authorization: `Bearer ${TK}`, "Content-Type": "application/json" };
const rpc = async (fn, args = {}) => {
  const r = await fetch(`${U}/rest/v1/rpc/${fn}`, { method: "POST", headers: H, body: JSON.stringify(args) });
  const t = await r.text();
  let data = null;
  try { data = JSON.parse(t); } catch { /* erro em texto */ }
  return { ok: r.ok, status: r.status, data, erro: r.ok ? "" : t };
};

/* 1. enviar sem nada preenchido é recusado */
const vazio = await rpc("kyc_enviar");
ok("envio vazio é recusado", !vazio.ok, `status ${vazio.status}`);
ok("a recusa diz o que falta", /falta concluir/i.test(vazio.erro), vazio.erro.slice(0, 160));

/* 2. preencher só os dados pessoais não basta */
await rpc("kyc_salvar_dados", {
  p_full_name: "Inc Teste KYC",
  p_birth_date: "1990-05-10",
  p_mother_name: "Maria Teste da Silva",
  p_phone: "11955551111",
  p_email: email,
});
const soDados = await rpc("kyc_enviar");
ok("só com dados pessoais ainda é recusado", !soDados.ok, `status ${soDados.status}`);
ok("aponta endereço como faltante", /endere/i.test(soDados.erro), soDados.erro.slice(0, 200));

/* 3. com endereço, mas sem documentos, continua recusado */
// Nomes reais dos parâmetros: p_number / p_extra / p_neighborhood.
// Passar nome errado não dá erro no PostgREST — ele ignora em silêncio e o
// campo fica nulo, o que já me fez escrever um teste que não testava nada.
await rpc("kyc_salvar_endereco", {
  p_cep: "01310100", p_address: "Avenida Paulista", p_number: "1000",
  p_extra: null, p_neighborhood: "Bela Vista", p_city: "São Paulo", p_state: "SP",
});
const comEndereco = await rpc("kyc_enviar");
ok("com endereço mas sem documento é recusado", !comEndereco.ok, `status ${comEndereco.status}`);
ok("aponta o documento como faltante", /documento/i.test(comEndereco.erro), comEndereco.erro.slice(0, 200));
ok("o endereço foi realmente gravado", (await rpc("kyc_meu_status")).data?.city === "São Paulo");

/* 4. documentos registrados, mas SEM os cinco ângulos: recusado */
await rpc("kyc_salvar_documento", {
  p_doc_type: "cnh", p_doc_number: "12345678901", p_doc_issuer: "SSP", p_doc_state: "SP",
});
for (const slot of ["doc_frente", "doc_verso", "comprovante", "selfie_doc"]) {
  await rpc("kyc_registrar_arquivo", {
    p_slot: slot,
    p_path: `${uid}/${slot}-${Date.now()}.jpg`,
  });
}
const semFace = await rpc("kyc_enviar");
ok("com documentos mas SEM biometria é recusado", !semFace.ok, `status ${semFace.status}`);
ok("aponta a prova de vida como faltante", /prova de vida/i.test(semFace.erro), semFace.erro.slice(0, 240));

/* 5. os cinco ângulos são exigidos de fato */
const st = await rpc("kyc_meu_status");
// `kyc_meu_status` devolve sinalizadores, não os caminhos crus.
ok("status traz os sinalizadores de documento", ["tem_doc_frente", "tem_doc_verso", "tem_comprovante", "tem_selfie_doc"].every((c) => c in (st.data ?? {})), Object.keys(st.data ?? {}).join(","));
ok("ainda não tem biometria registrada", st.data?.tem_biometria === false, String(st.data?.tem_biometria));

/* 6. registrar só TRÊS ângulos ainda é recusado */
// Os slots de rosto usam os nomes em português: face_frontal, face_direita...
for (const slot of ["face_frontal", "face_direita", "face_esquerda"]) {
  const r = await rpc("kyc_registrar_arquivo", { p_slot: slot, p_path: `${uid}/${slot}-${Date.now()}.jpg` });
  ok(`ângulo ${slot} registrado`, r.ok, r.erro.slice(0, 120));
}
const tresAngulos = await rpc("kyc_enviar");
ok("com apenas 3 dos 5 ângulos é recusado", !tresAngulos.ok, `status ${tresAngulos.status}`);

/* 7. biometria sem prova de vida é recusada */
for (const slot of ["face_sorriso", "face_perto"]) {
  const r = await rpc("kyc_registrar_arquivo", { p_slot: slot, p_path: `${uid}/${slot}-${Date.now()}.jpg` });
  ok(`ângulo ${slot} registrado`, r.ok, r.erro.slice(0, 120));
}
await rpc("kyc_registrar_biometria", { p_liveness_passed: false, p_liveness_score: 0.1, p_quality_score: 0.5 });
const semLiveness = await rpc("kyc_enviar");
ok("com os 5 ângulos mas sem prova de vida é recusado", !semLiveness.ok, `status ${semLiveness.status}`);

/* 8. completo e com prova de vida: aceito */
await rpc("kyc_registrar_biometria", { p_liveness_passed: true, p_liveness_score: 1, p_quality_score: 0.8 });
const completo = await rpc("kyc_enviar");
ok("completo e com prova de vida é aceito", completo.ok, `status ${completo.status}`);

const depois = await rpc("kyc_meu_status");
ok("status vira em_analise", depois.data?.status === "em_analise", depois.data?.status);

/* 9. não dá para movimentar antes da aprovação */
const mov = await fetch(`${U}/rest/v1/rpc/bank_move`, {
  method: "POST", headers: H,
  body: JSON.stringify({ p_kind: "saque", p_description: "t", p_amount: -10, p_counterparty: null, p_document_id: null }),
});
ok("não movimenta enquanto está em análise", !mov.ok, `status ${mov.status}`);

/* ------------------------------- limpeza ------------------------------- */
await fetch(`${U}/auth/v1/admin/users/${uid}`, { method: "DELETE", headers: HS });
const ainda = await fetch(`${U}/auth/v1/admin/users/${uid}`, { headers: HS });
ok("conta de teste removida", !ainda.ok, `status ${ainda.status}`);

console.log(`\n=== ${passou} passaram, ${falhou} falharam ===\n`);
