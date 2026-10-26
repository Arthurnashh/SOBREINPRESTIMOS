/**
 * Confere o cartão: número com Luhn válido, estável entre chamadas,
 * CVV de 3 dígitos e coerência com o last4 guardado.
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

const login = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@sobreimprestimos.com.br", password: "Sobre@Admin2026" }),
});
const s = await login.json();

async function rpc(nome, args = {}, token = s.access_token) {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: {
      apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
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

/** Validação de Luhn. */
function luhnValido(numero) {
  const d = numero.replace(/\D/g, "");
  let soma = 0;
  let dobrar = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i]);
    if (dobrar) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    soma += n;
    dobrar = !dobrar;
  }
  return soma % 10 === 0;
}

console.log("\n=== DADOS COMPLETOS DO CARTÃO ===\n");

const r = await rpc("bank_card_full");
ok("bank_card_full respondeu", r.ok, r.erro);

const c = r.data;
if (!c) {
  console.log("sem dados; abortando");
  process.exit(1);
}

const digitos = (c.number ?? "").replace(/\D/g, "");
ok("número tem 16 dígitos", digitos.length === 16, `${digitos.length}`);
ok("número formatado em 4 grupos", /^\d{4} \d{4} \d{4} \d{4}$/.test(c.number ?? ""), c.number);
ok("começa com 4 (Visa)", digitos.startsWith("4"), c.number?.slice(0, 1));
ok("Luhn válido", luhnValido(c.number ?? ""), c.number);
ok("last4 confere com o número", c.last4 === digitos.slice(-4), `${c.last4} vs ${digitos.slice(-4)}`);
ok("CVV tem 3 dígitos", /^\d{3}$/.test(c.cvv ?? ""), c.cvv);
ok("validade no formato MM/AAAA", /^\d{2}\/\d{4}$/.test(c.expiry ?? ""), c.expiry);
ok("titular preenchido", typeof c.holder === "string" && c.holder.length > 2, c.holder);
ok("bandeira Visa", c.brand === "Visa", c.brand);

// estabilidade: o mesmo titular deve ver sempre o mesmo número
const r2 = await rpc("bank_card_full");
ok("segunda chamada devolve o mesmo número", r2.data?.number === c.number);
ok("segunda chamada devolve o mesmo CVV", r2.data?.cvv === c.cvv);

// o segredo não pode ser legível pelo cliente: RLS deve negar (42501) ou devolver vazio
const seg = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/bank_secrets?select=valor`, {
  headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${s.access_token}` },
});
const segTexto = await seg.text();
let segOk = seg.status === 401 || seg.status === 403 || seg.status === 404;
if (!segOk) {
  try {
    const j = JSON.parse(segTexto);
    segOk = Array.isArray(j) && j.length === 0;
  } catch {
    segOk = false;
  }
}
ok("cliente não lê bank_secrets", segOk, `status ${seg.status}: ${segTexto.slice(0, 70)}`);

console.log("\n  número:", c.number);
console.log("  validade:", c.expiry, "| cvv:", c.cvv, "| titular:", c.holder);

console.log(`\n=== ${passou} passaram, ${falhou} falharam ===\n`);
process.exit(falhou ? 1 : 0);
