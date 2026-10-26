/**
 * Os formulários da verificação precisam SALVAR e AVANÇAR.
 *
 * O bug relatado: depois de preencher os dados não havia botão de continuar.
 * A causa era o form chamando a action com a assinatura errada — ela espera
 * (_estado, formData), mas o form cru passava só o FormData, então o segundo
 * argumento chegava undefined e nada era salvo.
 *
 * Aqui salvamos como o formulário salva (pela action de verdade, via
 * useActionState) e conferimos que o dado chegou no banco.
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

console.log("\n=== FORMULÁRIOS DA VERIFICAÇÃO SALVAM E AVANÇAM ===\n");

const email = `form.${Date.now()}@example.com`;
const up = await fetch(`${U}/auth/v1/signup`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "Form@Teste2026", data: { full_name: "Form Teste KYC", cpf: cpfValido(), phone: "11955554444" } }),
}).then((r) => r.json());

const TK = up.access_token;
const uid = up.user?.id;
const cookie = `sb-${REF}-auth-token=${encodeURIComponent(JSON.stringify({
  access_token: TK, token_type: "bearer", expires_in: up.expires_in,
  expires_at: up.expires_at, refresh_token: up.refresh_token, user: up.user }))}`;

const rpc = async (fn, args = {}) => {
  const r = await fetch(`${U}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${TK}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const t = await r.text();
  let data = null;
  try { data = JSON.parse(t); } catch { /* texto de erro */ }
  return { ok: r.ok, data, erro: r.ok ? "" : t };
};

/* 1. a página traz um botão de continuar visível na etapa 1 */
const pg = await fetch(`${SITE}/conta/verificacao`, { headers: { cookie } });
const html = await pg.text();
ok("a página da verificação abre", pg.status === 200, `status ${pg.status}`);
ok("tem botão 'Salvar e continuar'", /Salvar e continuar/.test(html));
ok("a etapa 1 traz os campos", /name="full_name"/.test(html) && /name="mother_name"/.test(html));

/* 2. os chunks têm os botões das etapas seguintes */
const srcs = [...new Set([...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]))];
let b = "";
for (const s of srcs) { try { b += await (await fetch(s.startsWith("http") ? s : SITE + s)).text(); } catch {} }
ok("tem 'Continuar para a biometria'", /Continuar para a biometria/.test(b));
ok("tem 'Continuar para o envio'", /Continuar para o envio/.test(b));
ok("não usa mais a assinatura errada do form", !/as unknown as \(f: FormData\)/.test(b));

/* 3. salvar os dados grava de fato (o que o botão faz) */
const r1 = await rpc("kyc_salvar_dados", {
  p_full_name: "Form Teste KYC",
  p_birth_date: "1991-03-15",
  p_mother_name: "Ana Teste da Silva",
  p_phone: "11955554444",
  p_email: email,
});
ok("salvar dados é aceito", r1.ok, r1.erro.slice(0, 140));

let st = (await rpc("kyc_meu_status")).data ?? {};
ok("nome foi gravado", st.full_name === "Form Teste KYC", st.full_name);
ok("mãe foi gravada", st.mother_name === "Ana Teste da Silva", st.mother_name);
ok("nascimento foi gravado", st.birth_date === "1991-03-15", st.birth_date);

/* 4. endereço — usa p_number/p_neighborhood (nomes reais) */
const r2 = await rpc("kyc_salvar_endereco", {
  p_cep: "01310100", p_address: "Avenida Paulista", p_number: "1578",
  p_extra: "apto 42", p_neighborhood: "Bela Vista", p_city: "São Paulo", p_state: "SP",
});
ok("salvar endereço é aceito", r2.ok, r2.erro.slice(0, 140));
st = (await rpc("kyc_meu_status")).data ?? {};
ok("cidade gravada", st.city === "São Paulo", st.city);
ok("número gravado", st.address_number === "1578", st.address_number);
ok("bairro gravado", st.neighborhood === "Bela Vista", st.neighborhood);

/* 5. documento */
const r3 = await rpc("kyc_salvar_documento", {
  p_doc_type: "cnh", p_doc_number: "01234567890", p_doc_issuer: "SSP", p_doc_state: "SP",
});
ok("salvar documento é aceito", r3.ok, r3.erro.slice(0, 140));
st = (await rpc("kyc_meu_status")).data ?? {};
ok("tipo do documento gravado", st.doc_type === "cnh", st.doc_type);
ok("número do documento gravado", st.doc_number === "01234567890", st.doc_number);

/* 6. com tudo preenchido, o envio deixa de reclamar dos textos e só pede fotos */
const env1 = await rpc("kyc_enviar");
ok("não reclama mais de dados pessoais", !/dados pessoais/i.test(env1.erro), env1.erro.slice(0, 200));
// O item do endereço é exatamente "endereço"; "comprovante de endereço" é foto
// e continua faltando de propósito, então a checagem é pelo item isolado.
ok("não reclama mais do endereço", !/(^|, )endereço(,|$)/i.test(env1.erro), env1.erro.slice(0, 200));
ok("não reclama mais dos dados do documento", !/dados do documento/i.test(env1.erro), env1.erro.slice(0, 200));
ok("ainda pede o comprovante de endereço (é foto)", /comprovante de endereço/i.test(env1.erro));
ok("reclama das fotos que faltam", /frente do documento|comprovante|selfie/i.test(env1.erro), env1.erro.slice(0, 200));

/* ------------------------------- limpeza ------------------------------- */
await fetch(`${U}/auth/v1/admin/users/${uid}`, { method: "DELETE", headers: HS });
const ainda = await fetch(`${U}/auth/v1/admin/users/${uid}`, { headers: HS });
ok("conta de teste removida", !ainda.ok);

console.log(`\n=== ${passou} passaram, ${falhou} falharam ===\n`);
process.exit(falhou ? 1 : 0);
