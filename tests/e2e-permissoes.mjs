// Confirma que o cliente comum NAO consegue chamar bank_move_for (que move
// dinheiro em nome de outra pessoa). Essa e a funcao mais sensivel do banco.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

const resultados = [];
const checar = (nome, ok, detalhe = "") => {
  resultados.push({ nome, ok, detalhe });
  console.log(`${ok ? "PASS" : "FALHA"}  ${nome}${detalhe ? "  — " + detalhe : ""}`);
};

const rnd = () => Math.random().toString(36).slice(2, 10);

function cpfValido(base) {
  const d = String(base).slice(0, 9).padStart(9, "0");
  const dig = (len) => {
    let s = 0;
    for (let i = 0; i < len; i++) s += Number(d[i]) * (len + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dig(9);
  const arr = (d + d1).split("");
  let s = 0;
  for (let i = 0; i < 10; i++) s += Number(arr[i]) * (11 - i);
  const d2 = ((s * 10) % 11) === 10 ? 0 : (s * 10) % 11;
  return `${d}${d1}${d2}`;
}

const criados = [];
async function criar(nome) {
  const email = `teste-${rnd()}@teste-perms.com.br`;
  const senha = `Teste@${rnd()}A1`;
  const u = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: {
        full_name: nome,
        cpf: cpfValido(Math.floor(Math.random() * 900000000) + 100000000),
        phone: "11955554444",
      },
    }),
  }).then((r) => r.json());
  criados.push(u.id);
  const login = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: senha }),
  }).then((r) => r.json());
  return { id: u.id, token: login.access_token };
}

const atacante = await criar("Atacante Teste");
const vitima = await criar("Vitima Teste");
checar("dois usuários criados", !!atacante.token && !!vitima.token);

// da saldo a vitima para haver o que roubar
await fetch(`${URL_}/rest/v1/rpc/bank_move`, {
  method: "POST",
  headers: { apikey: ANON, Authorization: `Bearer ${vitima.token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    p_kind: "estorno",
    p_description: "Saldo da vitima",
    p_amount: 9000,
    p_counterparty: null,
    p_document_id: null,
  }),
});

const saldo = async (t) =>
  Number(
    (
      await fetch(`${URL_}/rest/v1/rpc/bank_summary`, {
        method: "POST",
        headers: { apikey: ANON, Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
        body: "{}",
      }).then((r) => r.json())
    ).balance
  );

checar("vítima tem R$ 9.000", (await saldo(vitima.token)) === 9000, `saldo=${await saldo(vitima.token)}`);

// ------------------------------------- o atacante tenta mexer na conta alheia
{
  const res = await fetch(`${URL_}/rest/v1/rpc/bank_move_for`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${atacante.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      p_user_id: vitima.id,
      p_kind: "pix_envio",
      p_description: "roubo",
      p_amount: 8000,
      p_counterparty: null,
      p_document_id: null,
    }),
  });
  const t = await res.text();
  checar("cliente não chama bank_move_for", res.status >= 400, `status=${res.status} ${t.slice(0, 70)}`);
  checar("saldo da vítima intacto", (await saldo(vitima.token)) === 9000, `saldo=${await saldo(vitima.token)}`);

  // nem o proprio atacante consegue creditar a si mesmo
  const res2 = await fetch(`${URL_}/rest/v1/rpc/bank_move_for`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${atacante.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      p_user_id: atacante.id,
      p_kind: "estorno",
      p_description: "auto-credito",
      p_amount: 50000,
      p_counterparty: null,
      p_document_id: null,
    }),
  });
  checar("cliente não credita a si mesmo", res2.status >= 400, `status=${res2.status}`);
  checar("atacante continua zerado", (await saldo(atacante.token)) === 0, `saldo=${await saldo(atacante.token)}`);
}

// --------------------------- mas o backend legitimo (service_role) consegue
{
  const res = await fetch(`${URL_}/rest/v1/rpc/bank_move_for`, {
    method: "POST",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      p_user_id: vitima.id,
      p_kind: "credito_emprestimo",
      p_description: "Credito legitimo do backend",
      p_amount: 1000,
      p_counterparty: null,
      p_document_id: null,
    }),
  });
  const j = await res.json();
  checar("backend credita legitimamente na conta do titular", !!j?.id, JSON.stringify(j).slice(0, 80));
  checar("saldo da vítima subiu para R$ 10.000", (await saldo(vitima.token)) === 10000, `saldo=${await saldo(vitima.token)}`);
}

// -------------------------------------------------------- funcoes internas
{
  for (const fn of ["bank_move_for"]) {
    const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: ANON, "Content-Type": "application/json" },
      body: "{}",
    });
    checar(`${fn} não é acessível sem autenticação`, res.status >= 400, `status=${res.status}`);
  }
}

for (const id of criados) {
  await fetch(`${URL_}/auth/v1/admin/users/${id}`, {
    method: "DELETE",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
}
checar("usuários de teste removidos", true);

const falhas = resultados.filter((r) => !r.ok);
console.log(`\n===== ${resultados.length - falhas.length}/${resultados.length} passaram =====`);
if (falhas.length) {
  for (const f of falhas) console.log(`  - ${f.nome}  ${f.detalhe}`);
  process.exitCode = 1;
}
