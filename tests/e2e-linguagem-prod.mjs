// Verificação TEXTUAL das páginas renderizadas em produção.
// Não lê arquivos salvos: faz fetch real das páginas e limpa o HTML.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const BASE = 'https://site-pearl-nine-93.vercel.app';

// ---------- 1. .env.local ----------
function readEnvLocal() {
  const p = path.join(ROOT, '.env.local');
  const raw = fs.readFileSync(p, 'utf8');
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

// ---------- 2. login GoTrue ----------
async function login(url, anon) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@sobreimprestimos.com.br',
      password: 'Sobre@Admin2026',
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`login falhou HTTP ${res.status}: ${JSON.stringify(body).slice(0, 500)}`);
  }
  return body;
}

// ---------- 3. cookie ----------
function buildCookie(session) {
  const ref = new URL(process.env.__SUPA_URL).hostname.split('.')[0];
  const name = `sb-${ref}-auth-token`;
  const payload = {
    access_token: session.access_token,
    token_type: 'bearer',
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  };
  return { name, value: encodeURIComponent(JSON.stringify(payload)) };
}

// ---------- limpeza do HTML ----------
function decodeEntities(s) {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

function clean(html) {
  let s = html;
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ');
  // marca boundaries de bloco para não colar palavras
  s = s.replace(/<\/?(br|p|div|li|h[1-6]|section|header|footer|nav|tr|td|th|table|main|article|aside|button|span|label|form|ul|ol)\b[^>]*>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  s = s.replace(/[ \t\u00a0]+/g, ' ');
  s = s.split('\n').map((l) => l.trim()).filter((l) => l.length > 0).join('\n');
  return s;
}

const PUBLIC = ['/', '/termos', '/privacidade', '/entrar', '/cadastro', '/esqueci-senha'];
const PRIVATE = ['/conta', '/conta/banco', '/conta/emprestimo', '/admin', '/admin/usuarios'];

async function getPage(url, cookie) {
  const headers = {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) text-verifier',
    accept: 'text/html,application/xhtml+xml',
  };
  if (cookie) headers.cookie = `${cookie.name}=${cookie.value}`;
  const res = await fetch(url, { headers, redirect: 'follow' });
  const html = await res.text();
  return { status: res.status, finalUrl: res.url, html, text: clean(html) };
}

// ---------- termos proibidos ----------
const TERMS = [
  'demonstração', 'demonstrativo', 'fictício', 'fictícia', 'simulado', 'simulada',
  'sem valor financeiro', 'demo', 'DEMO', 'teste', 'exemplo', 'placeholder', 'lorem',
];

const UNFINISHED = [/\bundefined\b/i, /\bNaN\b/, /\[object Object\]/i, /\bInfinity\b/];

function snippet(text, idx, len) {
  const start = Math.max(0, idx - 160);
  const end = Math.min(text.length, idx + len + 160);
  return text.slice(start, end).replace(/\n+/g, ' | ');
}

(async () => {
  const env = readEnvLocal();
  const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
  const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.__SUPA_URL = SUPA;
  console.log('=== CONFIG ===');
  console.log('supabase url :', SUPA);
  console.log('anon key len :', (ANON || '').length);

  const session = await login(SUPA, ANON);
  console.log('login OK     : user =', session?.user?.email, '| role =', session?.user?.role);
  const cookie = buildCookie(session);
  console.log('cookie name  :', cookie.name);
  console.log('cookie len   :', cookie.value.length);

  const pages = {};

  for (const p of PUBLIC) {
    try {
      pages[p] = await getPage(BASE + p, null);
    } catch (e) {
      pages[p] = { status: 'ERR', finalUrl: BASE + p, html: '', text: 'FETCH ERROR: ' + e.message };
    }
  }
  for (const p of PRIVATE) {
    try {
      pages[p] = await getPage(BASE + p, cookie);
    } catch (e) {
      pages[p] = { status: 'ERR', finalUrl: BASE + p, html: '', text: 'FETCH ERROR: ' + e.message };
    }
  }

  console.log('\n=== STATUS / TAMANHO ===');
  for (const [p, r] of Object.entries(pages)) {
    console.log(
      `${p.padEnd(20)} HTTP ${String(r.status).padEnd(5)} html=${String(r.html.length).padEnd(8)} texto=${String(r.text.length).padEnd(7)} final=${r.finalUrl}`
    );
  }

  console.log('\n\n=== TEXTO VISÍVEL LIMPO (STEP 2) ===');
  for (const [p, r] of Object.entries(pages)) {
    const limit = p === '/conta' || p === '/conta/banco' ? 4000 : 2500;
    console.log(`\n${'#'.repeat(70)}`);
    console.log(`# PÁGINA ${p}   (HTTP ${r.status})`);
    console.log('#'.repeat(70));
    console.log(r.text.slice(0, limit));
    if (r.text.length > limit) console.log(`\n[...truncado: ${r.text.length - limit} chars restantes...]`);
  }

  console.log('\n\n=== STEP 3a: TERMOS PROIBIDOS ===');
  let anyHit = false;
  for (const [p, r] of Object.entries(pages)) {
    const t = r.text;
    for (const term of TERMS) {
      let idx = t.indexOf(term);
      if (idx === -1) continue;
      anyHit = true;
      console.log(`\n[OCORRÊNCIA] página=${p} termo="${term}"`);
      while (idx !== -1) {
        console.log('   ...' + snippet(t, idx, term.length) + '...');
        idx = t.indexOf(term, idx + 1);
        if (idx > 0 && t.indexOf(term, idx) === -1) break;
      }
    }
  }
  if (!anyHit) console.log('NENHUMA ocorrência de nenhum termo proibido em nenhuma página.');

  console.log('\n\n=== STEP 3e: SINAIS DE INACABADO ===');
  for (const [p, r] of Object.entries(pages)) {
    for (const re of UNFINISHED) {
      const m = r.text.match(re);
      if (m) {
        const idx = r.text.indexOf(m[0]);
        console.log(`[${p}] ${re} -> ...${snippet(r.text, idx, m[0].length)}...`);
      }
    }
    const lone = r.text.split('\n').filter((l) => l === '—' || l === '-' || l === '–');
    if (lone.length) console.log(`[${p}] linhas isoladas de travessão: ${lone.length} (valor vazio aparente)`);
  }

  console.log('\n=== FIM ===');
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
