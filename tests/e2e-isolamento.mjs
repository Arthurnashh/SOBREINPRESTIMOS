// Verifica que uma conta nao enxerga nem movimenta a conta de outra pessoa.
// Cria dois usuarios descartaveis, confirma que cada um so ve o proprio
// extrato, e que ninguem consegue debitar a conta alheia. Limpa tudo no fim.
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

const admin = (p, init = {}) =>
  fetch(`${URL_}${p}`, {
    ...init,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

const rpc = async (token, fn, args) =>
  (
    await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    })
  ).json();

const sel = async (token, tabela, query = "select=*") =>
  (
    await fetch(`${URL_}/rest/v1/${tabela}?${query}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${token}` },
    })
  ).json();

const rnd = () => Math.random().toString(36).slice(2, 10);
const criados = [];

// CPF valido e unico, exigido pelo trigger de perfil
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

async function criarUsuario(nome) {
  const email = `teste-${rnd()}@teste-isolamento.com.br`;
  const senha = `Teste@${rnd()}A1`;
  const res = await admin("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: {
        full_name: nome,
        cpf: cpfValido(Math.floor(Math.random() * 900000000) + 100000000),
        phone: "11977776666",
      },
    }),
  });
  const u = await res.json();
  if (!u.id) {
    console.log("  (falha ao criar usuário:", JSON.stringify(u).slice(0, 120), ")");
    return { id: null, email, token: "" };
  }
  criados.push(u.id);

  const login = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: senha }),
  }).then((r) => r.json());

  return { id: u.id, email, token: login.access_token };
}

// ------------------------------------------------------------------ setup
const a = await criarUsuario("Titular A");
const b = await criarUsuario("Titular B");
checar("dois usuários de teste criados", !!a.token && !!b.token);

// --------------------------------------------------- conta aberta no trigger
{
  const contasA = await sel(a.token, "bank_accounts");
  const contasB = await sel(b.token, "bank_accounts");
  checar("conta de A foi aberta no cadastro", Array.isArray(contasA) && contasA.length === 1, JSON.stringify(contasA).slice(0, 80));
  checar("conta de B foi aberta no cadastro", Array.isArray(contasB) && contasB.length === 1, JSON.stringify(contasB).slice(0, 80));
  checar(
    "números de conta são diferentes",
    contasA[0]?.number !== contasB[0]?.number,
    `${contasA[0]?.number} vs ${contasB[0]?.number}`
  );
  checar("saldo inicial é zero", Number(contasA[0]?.balance) === 0 && Number(contasB[0]?.balance) === 0);
}

// cartao emitido
{
  const cartoes = await sel(a.token, "bank_cards");
  checar("cartão virtual emitido no cadastro", cartoes.length === 1, JSON.stringify(cartoes[0] ?? {}).slice(0, 80));
}

// --------------------------------------------------- A movimenta, B nao ve
{
  await rpc(a.token, "bank_move", {
    p_kind: "estorno",
    p_description: "Credito exclusivo do titular A",
    p_amount: 3000,
    p_counterparty: null,
    p_document_id: null,
  });

  const extratoA = await sel(a.token, "bank_transactions");
  const extratoB = await sel(b.token, "bank_transactions");
  checar("A vê o próprio lançamento", extratoA.length === 1, `A=${extratoA.length}`);
  checar("B NÃO vê o lançamento de A", extratoB.length === 0, `B=${extratoB.length}`);

  const saldoB = await rpc(b.token, "bank_summary", {});
  checar("resumo de B continua zerado", Number(saldoB.balance) === 0, `saldo B=${saldoB.balance}`);
  const saldoA = await rpc(a.token, "bank_summary", {});
  checar("saldo de A é R$ 3.000", Number(saldoA.balance) === 3000, `saldo A=${saldoA.balance}`);
}

// ------------------------------------------------ B nao debita a conta de A
{
  const contasA = await sel(a.token, "bank_accounts");
  const ag = contasA[0].agency;
  const num = contasA[0].number;

  // B tenta transferir para A: isso credita A e debita B. B esta zerado,
  // entao tem de falhar por saldo, nao por falta de permissao.
  const semSaldo = await rpc(b.token, "bank_transfer", {
    p_agency: ag,
    p_number: num,
    p_amount: 500,
    p_message: "tentativa de B",
  });
  checar(
    "B sem saldo não consegue transferir para A",
    /saldo insuficiente/i.test(JSON.stringify(semSaldo)),
    JSON.stringify(semSaldo).slice(0, 70)
  );

  const saldoA = await rpc(a.token, "bank_summary", {});
  checar("saldo de A não mudou com a tentativa de B", Number(saldoA.balance) === 3000, `saldo A=${saldoA.balance}`);
}

// ------------------------------------------------- escrita direta bloqueada
{
  const patch = await fetch(`${URL_}/rest/v1/bank_accounts?id=eq.${(await sel(b.token, "bank_accounts"))[0].id}`, {
    method: "PATCH",
    headers: { apikey: ANON, Authorization: `Bearer ${b.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ balance: 999999 }),
  });
  checar("B não altera o próprio saldo por UPDATE direto", patch.status >= 400, `status=${patch.status}`);

  const ins = await fetch(`${URL_}/rest/v1/bank_transactions`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${b.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: b.id, kind: "estorno", description: "forjado", amount: 1 }),
  });
  checar("B não insere lançamento à mão", ins.status >= 400, `status=${ins.status}`);
}

// ------------------------------------------------------------------- limpeza
{
  for (const id of criados) {
    await admin(`/auth/v1/admin/users/${id}`, { method: "DELETE" });
  }
  checar("usuários de teste removidos", true);
}

const falhas = resultados.filter((r) => !r.ok);
console.log(`\n===== ${resultados.length - falhas.length}/${resultados.length} passaram =====`);
if (falhas.length) {
  for (const f of falhas) console.log(`  - ${f.nome}  ${f.detalhe}`);
  process.exitCode = 1;
}
