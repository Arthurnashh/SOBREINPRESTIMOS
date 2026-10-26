/**
 * Cadastro sem confirmação de e-mail.
 *
 * Prova que:
 *  - criar conta devolve sessão na hora (sem link de e-mail);
 *  - a conta nasce com KYC 'nao_iniciado', então a verificação vem na sequência;
 *  - o menu fica travado até a verificação ser aprovada;
 *  - com o e-mail desligado, um endereço inexistente também entra
 *    (é o efeito colateral aceito dessa escolha).
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

/** Faz o cadastro pelo site, como o navegador faz. */
async function cadastrar(email, senha, cpf, nome = "Cliente Cadastro Teste") {
  const pagina = await fetch(`${SITE}/cadastro`);
  const html = await pagina.text();
  const actionId = [...new Set([...html.matchAll(/\$ACTION_ID_([a-f0-9]+)/g)].map((m) => m[1]))][0];
  if (!actionId) return { erro: "sem action id" };

  const fd = new FormData();
  fd.append("full_name", nome);
  fd.append("cpf", cpf);
  fd.append("phone", "11955558888");
  fd.append("email", email);
  fd.append("password", senha);
  fd.append("terms", "on");

  const r = await fetch(`${SITE}/cadastro`, {
    method: "POST",
    headers: { "Next-Action": actionId },
    body: fd,
    redirect: "manual",
  });
  return { status: r.status, corpo: await r.text() };
}

console.log("\n=== CADASTRO SEM CONFIRMAÇÃO DE E-MAIL ===\n");

/* --------------- 1. o cadastro cria a conta e já dá sessão -------------- */
const email = `cad.${Date.now()}@example.com`;
const senha = "Cad@Teste2026";
const cpf = cpfValido();

const r1 = await cadastrar(email, senha, cpf);
ok("cadastro respondeu", r1.status > 0, `status ${r1.status}`);

// a sessão deve existir: login imediato funciona
const login = await fetch(`${U}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: senha }),
});
const s = await login.json();
ok("conta criada e login imediato funciona (sem clicar em e-mail)", login.ok && Boolean(s.access_token), s.error_description ?? "");

const uid = s.user?.id;
if (!uid) { console.log("\nabortando: sem usuário\n"); process.exit(1); }

const confirmado = await fetch(`${U}/rest/v1/profiles?id=eq.${uid}&select=id`, {
  headers: { apikey: ANON, Authorization: `Bearer ${s.access_token}` },
}).then((r) => r.json());
ok("perfil criado pelo trigger", Array.isArray(confirmado) && confirmado.length === 1);

// e-mail confirmado automaticamente?
const adm = await fetch(`${U}/auth/v1/admin/users/${uid}`, { headers: HS }).then((r) => r.json());
ok("e-mail já vem confirmado (autoconfirm)", Boolean(adm.email_confirmed_at), `email_confirmed_at=${adm.email_confirmed_at}`);

/* ------------- 2. a conta nasce sem KYC, então verifica ------------- */
const kyc = await fetch(`${U}/rest/v1/kyc_submissions?user_id=eq.${uid}&select=status`, {
  headers: { apikey: ANON, Authorization: `Bearer ${s.access_token}` },
}).then((r) => r.json());
ok("KYC criado como nao_iniciado no cadastro", kyc?.[0]?.status === "nao_iniciado", JSON.stringify(kyc));

/* --------------- 3. o menu fica travado até verificar --------------- */
const cookie = `sb-${REF}-auth-token=${encodeURIComponent(JSON.stringify({
  access_token: s.access_token, token_type: "bearer", expires_in: s.expires_in,
  expires_at: s.expires_at, refresh_token: s.refresh_token, user: s.user }))}`;

const bloqueada = await fetch(`${SITE}/conta`, { headers: { cookie } });
const htmlBloq = await bloqueada.text();
ok("a página da conta responde", bloqueada.status === 200, `status ${bloqueada.status}`);
ok("menu travado: NÃO mostra 'Conta bancária'", !/Conta bancária/.test(htmlBloq));
ok("menu travado: NÃO mostra 'Empréstimo'", !/Empréstimo<\/a>/.test(htmlBloq));
ok("menu travado: oferece 'Minha verificação'", /Minha verificação/.test(htmlBloq));
ok("menu travado: mantém 'Sair'", /Sair/.test(htmlBloq));

const verif = await fetch(`${SITE}/conta/verificacao`, { headers: { cookie } });
const htmlVer = await verif.text();
ok("a verificação abre normalmente", verif.status === 200 && /Verificação de identidade/.test(htmlVer), `status ${verif.status}`);
ok("a verificação abre na etapa 1 (dados)", /Seus dados/.test(htmlVer));

/* --------- 4. 'depois' devolve o destino do pedido de empréstimo ------- */
const comDestino = await fetch(`${SITE}/conta/verificacao?depois=%2Fconta%2Femprestimo%3Fvalor%3D5000%26parcelas%3D12`, { headers: { cookie } });
const htmlDest = await comDestino.text();
ok("aceita destino interno e mostra 'Continuar para o pedido'", /Continuar para o pedido/.test(htmlDest));

const externo = await fetch(`${SITE}/conta/verificacao?depois=https%3A%2F%2Fmalicioso.example.com`, { headers: { cookie } });
const htmlExt = await externo.text();
ok("destino externo é ignorado (anti open-redirect)", !/malicioso\.example\.com/.test(htmlExt));

/* --------- 5. aprovado, o menu destrava ------------------------------- */
await fetch(`${U}/rest/v1/kyc_submissions?user_id=eq.${uid}`, {
  method: "PATCH", headers: { ...HS, Prefer: "return=minimal" },
  body: JSON.stringify({ status: "aprovado" }),
});

const liberada = await fetch(`${SITE}/conta`, { headers: { cookie } });
const htmlLib = await liberada.text();
ok("após aprovação: mostra 'Conta bancária'", /Conta bancária/.test(htmlLib));
ok("após aprovação: mostra 'Empréstimo'", /Empréstimo/.test(htmlLib));

/* ------------- 6. o efeito colateral aceito: e-mail falso ------------- */
const falso = `naoexiste.${Date.now()}@dominio-que-nao-existe-xyz.com`;
const rFalso = await cadastrar(falso, "Falso@Teste2026", cpfValido(), "Cliente Falso Teste");
ok("e-mail inexistente também cadastra (efeito de desligar a confirmação)", rFalso.status > 0, `status ${rFalso.status}`);

const achouFalso = await fetch(`${U}/auth/v1/admin/users?per_page=200`, { headers: HS }).then((r) => r.json());
const usuarioFalso = (achouFalso.users ?? []).find((u) => u.email === falso);
ok("conta com e-mail falso existe e está confirmada", Boolean(usuarioFalso?.email_confirmed_at), usuarioFalso ? "confirmada" : "não encontrada");

/* ------------------------------- limpeza ----------------------------- */
await fetch(`${U}/auth/v1/admin/users/${uid}`, { method: "DELETE", headers: HS });
if (usuarioFalso?.id) await fetch(`${U}/auth/v1/admin/users/${usuarioFalso.id}`, { method: "DELETE", headers: HS });

const restam = await fetch(`${U}/auth/v1/admin/users?per_page=200`, { headers: HS }).then((r) => r.json());
const sobraram = (restam.users ?? []).filter((u) => u.email === email || u.email === falso);
ok("contas de teste removidas", sobraram.length === 0, `${sobraram.length} restaram`);

console.log(`\n=== ${passou} passaram, ${falhou} falharam ===\n`);
process.exit(falhou ? 1 : 0);
