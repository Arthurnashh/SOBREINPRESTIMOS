/**
 * A área bancária é um app com abas no cliente: o SSR entrega só a aba
 * "Início". Então procuro os outros painéis no payload RSC (que o Next
 * embute no HTML) em vez do texto visível.
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
const REF = new URL(env.NEXT_PUBLIC_SUPABASE_URL).host.split(".")[0];

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
const cookie = `sb-${REF}-auth-token=${encodeURIComponent(
  JSON.stringify({
    access_token: s.access_token,
    token_type: "bearer",
    expires_in: s.expires_in,
    expires_at: s.expires_at,
    refresh_token: s.refresh_token,
    user: s.user,
  })
)}`;

const r = await fetch(`${SITE}/conta/banco`, { headers: { cookie } });
const html = await r.text();

// decodifica escapes do payload RSC para procurar texto legível
const bruto = html
  .replace(/\\u003c/g, "<")
  .replace(/\\u003e/g, ">")
  .replace(/\\"/g, '"')
  .replace(/\\n/g, "\n");

console.log("\n=== PAINÉIS ENTREGUES PELO SERVIDOR ===\n");
console.log(`HTML de /conta/banco: ${html.length} bytes\n`);

// Cada painel é renderizado no servidor e enviado no payload.
const paineis = {
  Recarga: /Recarga/,
  "Meus cartões": /Meus cartões/,
  "Meu perfil": /Meu perfil/,
  "Limites da conta": /Limites da conta/,
  "Segurança": /Segurança/,
  "Dados cadastrais": /Dados cadastrais/,
  "Minhas chaves": /Minhas chaves/,
  "Comprovantes guardados": /Comprovantes guardados/,
  "Meus agendamentos": /Meus agendamentos/,
  "Códigos de retirada": /Códigos de retirada/,
  "Movimentação em": /Movimentação em/,
  "Extrato": /Extrato/,
  "Área PIX": /Área PIX/,
  "Início": /Início/,
};

for (const [nome, re] of Object.entries(paineis)) {
  ok(`painel "nome" renderizado no servidor`.replace("nome", nome), re.test(bruto));
}

// Os rótulos das abas de operação vivem no bundle do cliente (Operacoes.tsx
// é "use client"), então confiro lá em vez do HTML do servidor.
console.log("\n=== ABAS DE OPERAÇÃO (bundle do cliente) ===\n");
const scripts = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]);
let bundleAbas = "";
for (const src of scripts) {
  const url = src.startsWith("http") ? src : SITE + src;
  try {
    const js = await (await fetch(url)).text();
    if (js.includes("Enviar PIX") && js.includes("Depositar")) {
      bundleAbas = js;
      break;
    }
  } catch {}
}
ok("bundle com as abas foi encontrado", bundleAbas.length > 0);
for (const op of ["Enviar PIX", "Receber PIX", "Transferir", "Depositar", "Sacar", "Pagar boleto", "Recarga", "Agendar"]) {
  ok(`operação "${op}" no bundle`, bundleAbas.includes(op));
}

console.log("\n=== AVISOS E SEGURANÇA ===\n");
ok("aviso anti-golpe presente", /nunca[\s\S]{0,40}pedimos depósito/i.test(bruto));
ok("texto sobre não cobrar tarifa", /Não cobramos tarifa/i.test(bruto));
// "$undefined" é o sentinela do protocolo RSC do React, não conteúdo renderizado.
ok("nenhum undefined renderizado (fora do protocolo RSC)", !/(?<!\$)undefined/.test(bruto));
ok("nenhum 'NaN'", !/NaN/.test(html));
ok("nenhum '[object Object]'", !/\[object Object\]/.test(html));

console.log("\n=== ÍCONES SVG (sem emoji) ===\n");
// A shell e as abas usam <svg> desenhado à mão. Emoji em texto seria o sintoma
// de interface genérica.
const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
ok("HTML não tem emoji", !emoji.test(html), (html.match(emoji) ?? [])[0] ?? "");

const svgsServidor = (bruto.match(/<svg/g) ?? []).length;
ok("ícones SVG no HTML do servidor", svgsServidor >= 6, `${svgsServidor} <svg>`);

// as abas de operação trazem ícone próprio no bundle
const svgsBundle = (bundleAbas.match(/createElement\("svg"|jsx\("svg"/g) ?? []).length;
ok("ícones das operações no bundle", svgsBundle >= 8, `${svgsBundle} ocorrências`);

console.log("\n=== CARTÃO: VER E COPIAR DADOS ===\n");
for (const alvo of [
  ["Ver dados do cartão", /Ver dados do cartão/],
  ["Copiar número", /Copiar número/],
  ["Copiar CVV", /Copiar CVV/],
  ["Copiar todos os dados", /Copiar todos os dados/],
  ["Esconder dados", /Esconder dados/],
]) {
  ok(`"${alvo[0]}" no bundle do cliente`, alvo[1].test(bundleAbas));
}
ok("rótulo 'Meus cartões' no HTML", /Meus cartões/.test(bruto));

console.log(`\n=== ${passou} passaram, ${falhou} falharam ===\n`);
process.exit(falhou ? 1 : 0);
