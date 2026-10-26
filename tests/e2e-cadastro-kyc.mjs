/**
 * Testa a lógica do cadastro pelo lado do servidor, chamando a API do Supabase
 * exatamente como `signUp` faz — sem depender de reproduzir o protocolo RSC
 * do Next, que um fetch cru não consegue simular.
 *
 * Prova o que interessa:
 *  - com a confirmação desligada, signUp devolve sessão na hora;
 *  - a conta nasce com e-mail já confirmado;
 *  - o perfil e o registro de KYC são criados no cadastro.
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

console.log("\n=== CADASTRO: SESSÃO IMEDIATA E KYC NA SEQUÊNCIA ===\n");

/* ---- 1. a configuração do projeto está com a confirmação desligada ---- */
const cfg = await fetch(`https://api.supabase.com/v1/projects/${new URL(U).host.split(".")[0]}/config/auth`, {
  headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN ?? ""}` },
}).then((r) => (r.ok ? r.json() : null)).catch(() => null);

if (cfg) {
  ok("confirmação de e-mail desligada no projeto", cfg.mailer_autoconfirm === true, `mailer_autoconfirm=${cfg.mailer_autoconfirm}`);
  ok("site_url aponta para produção", /vercel\.app/.test(cfg.site_url ?? ""), cfg.site_url);
  ok("callback de produção está nas Redirect URLs", /vercel\.app\/auth\/callback/.test(cfg.uri_allow_list ?? ""), cfg.uri_allow_list);
} else {
  console.log("  (sem token da API de gestão — pulando checagem de configuração)");
}

/* ---- 2. signUp devolve sessão, sem etapa de e-mail ---- */
const email = `sig.${Date.now()}@example.com`;
const senha = "Sig@Teste2026";
const cpf = cpfValido();

const r = await fetch(`${U}/auth/v1/signup`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: senha, data: { full_name: "Sig Cadastro Teste", cpf, phone: "11955558888" } }),
});
const j = await r.json();

ok("signup respondeu", r.ok, `${r.status} ${JSON.stringify(j).slice(0, 120)}`);
ok("SESSÃO veio na hora (nenhuma confirmação pendente)", Boolean(j.access_token), j.access_token ? "tem access_token" : JSON.stringify(j).slice(0, 160));

const uid = j.user?.id;
if (!uid) { console.log("\nabortando: sem usuário\n"); process.exit(1); }

/* ---- 3. e-mail já confirmado + perfil + KYC criados ---- */
const adm = await fetch(`${U}/auth/v1/admin/users/${uid}`, { headers: HS }).then((x) => x.json());
ok("e-mail já vem confirmado", Boolean(adm.email_confirmed_at), `email_confirmed_at=${adm.email_confirmed_at}`);

const perfil = await fetch(`${U}/rest/v1/profiles?id=eq.${uid}&select=id,full_name,cpf`, {
  headers: { apikey: ANON, Authorization: `Bearer ${j.access_token}` },
}).then((x) => x.json());
ok("perfil criado pelo trigger", Array.isArray(perfil) && perfil.length === 1, JSON.stringify(perfil));
ok("perfil guardou nome e CPF", perfil?.[0]?.cpf === cpf, perfil?.[0]?.cpf);

const kyc = await fetch(`${U}/rest/v1/kyc_submissions?user_id=eq.${uid}&select=status`, {
  headers: { apikey: ANON, Authorization: `Bearer ${j.access_token}` },
}).then((x) => x.json());
ok("KYC criado como nao_iniciado (verificação vem na sequência)", kyc?.[0]?.status === "nao_iniciado", JSON.stringify(kyc));

const conta = await fetch(`${U}/rest/v1/bank_accounts?user_id=eq.${uid}&select=agency,number`, {
  headers: { apikey: ANON, Authorization: `Bearer ${j.access_token}` },
}).then((x) => x.json());
ok("conta bancária aberta no cadastro", conta?.[0]?.agency === "0001", JSON.stringify(conta));

/* ---- 4. enquanto não verifica, não movimenta ---- */
const gate = await fetch(`${U}/rest/v1/rpc/kyc_pode_movimentar`, {
  method: "POST",
  headers: { apikey: ANON, Authorization: `Bearer ${j.access_token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ p_user_id: null }),
}).then((x) => x.json());
ok("recém-cadastrado NÃO pode movimentar", gate === false, String(gate));

const saida = await fetch(`${U}/rest/v1/rpc/bank_move`, {
  method: "POST",
  headers: { apikey: ANON, Authorization: `Bearer ${j.access_token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ p_kind: "saque", p_description: "teste", p_amount: -5, p_counterparty: null, p_document_id: null }),
});
const txt = await saida.text();
ok("saque recusado até verificar", !saida.ok && /verifica/i.test(txt), txt.slice(0, 120));

/* ---- 5. e-mail de domínio inexistente também entra (efeito aceito) ---- */
const falso = `naoexiste.${Date.now()}@dominio-que-nao-existe-xyz.com`;
const rf = await fetch(`${U}/auth/v1/signup`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: falso, password: "Falso@Teste2026", data: { full_name: "Falso Teste", cpf: cpfValido(), phone: "11955557777" } }),
});
const jf = await rf.json();
ok("e-mail inexistente também cria conta com sessão", Boolean(jf.access_token), JSON.stringify(jf).slice(0, 140));

/* ------------------------------ limpeza ------------------------------ */
for (const id of [uid, jf.user?.id].filter(Boolean)) {
  await fetch(`${U}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: HS });
}
const restam = await fetch(`${U}/auth/v1/admin/users?per_page=300`, { headers: HS }).then((x) => x.json());
const sobraram = (restam.users ?? []).filter((u) => u.email === email || u.email === falso);
ok("contas de teste removidas", sobraram.length === 0, `${sobraram.length} restaram`);

console.log(`\n=== ${passou} passaram, ${falhou} falharam ===\n`);
process.exit(falhou ? 1 : 0);
