import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BASE = 'https://site-pearl-nine-93.vercel.app';

function readEnvLocal() {
  const raw = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}
function decodeEntities(s) {
  return s.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'").replace(/&quot;/gi, '"').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}
function clean(html) {
  let s = html;
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<\/(br|p|div|li|h[1-6]|section|header|footer|nav|tr|td|th|table|main|article|aside|button|span|label|form|ul|ol)>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  s = s.replace(/[ \t\u00a0]+/g, ' ');
  return s.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
}
const WORD = {
  demo: /\bdemos?\b/i,
  teste: /\btestes?\b/i,
  exemplo: /\bexemplos?\b/i,
  lorem: /\blorem\b/i,
  placeholder: /\bplaceholders?\b/i,
  simulad: /\bsimulad[oa]s?\b/i,
  demonstr: /\bdemonstr\w*/i,
  fictic: /\bfict\w*/i,
  unconfigured: /(?:ainda n[aã]o|n[aã]o)\s+(?:foi|est[aá])\s+(?:configurad|preparad|finalizad|implementad|definid|conclu[ií]d)\w*|em breve|indispon[ií]vel|n[aã]o configurad|not configured|TODO|FIXME/i,
  semvalor: /sem valor financeiro/i,
};

(async () => {
  const env = readEnvLocal();
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@sobreimprestimos.com.br', password: 'Sobre@Admin2026' }),
  });
  const s = await res.json();
  const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
  const cookie = `sb-${ref}-auth-token=` + encodeURIComponent(JSON.stringify({
    access_token: s.access_token, token_type: 'bearer', expires_in: s.expires_in,
    expires_at: s.expires_at, refresh_token: s.refresh_token, user: s.user,
  }));
  console.log('login HTTP', res.status, '| user', s.user?.email);

  const pages = {};
  for (const p of ['/', '/termos', '/privacidade', '/entrar', '/cadastro', '/esqueci-senha', '/conta', '/conta/banco', '/conta/emprestimo', '/admin', '/admin/usuarios']) {
    const r = await fetch(BASE + p, { headers: { cookie, 'user-agent': 'Mozilla/5.0 text-verifier' }, redirect: 'follow' });
    const html = await r.text();
    pages[p] = { status: r.status, html, text: clean(html) };
  }

  console.log('\n=== A) TERMOS POR PALAVRA INTEIRA + FRASES ===');
  let hits = 0;
  for (const [p, r] of Object.entries(pages)) {
    for (const [k, re] of Object.entries(WORD)) {
      const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
      let m;
      while ((m = g.exec(r.text))) {
        hits++;
        const a = Math.max(0, m.index - 150), b = Math.min(r.text.length, m.index + m[0].length + 150);
        console.log(`\n[${p}] "${m[0]}" (${k})\n   ...${r.text.slice(a, b).replace(/\n+/g, ' | ')}...`);
      }
    }
  }
  if (!hits) console.log('Nenhum hit.');
  console.log(`\nTOTAL hits: ${hits}`);

  console.log('\n=== B) BANNER DE DEMONSTRAÇÃO NO TOPO DO BODY ===');
  for (const [p, r] of Object.entries(pages)) {
    const bm = r.html.match(/<body[^>]*>/i);
    const head = bm ? r.html.slice(bm.index + bm[0].length, bm.index + bm[0].length + 4000) : r.html.slice(0, 4000);
    const headText = clean(head).split('\n').slice(0, 8);
    console.log(`\n[${p}] primeiros 8 nós de texto após <body>:`);
    headText.forEach((l, i) => console.log(`   ${i + 1}. ${l}`));
  }

  console.log('\n=== C) /conta/banco — SEÇÕES ===');
  const banco = pages['/conta/banco'];
  console.log('--- TEXTO COMPLETO (visível) ---');
  console.log(banco.text);
  console.log('--- FIM TEXTO COMPLETO ---');
  console.log('comprimento total:', banco.text.length);
  for (const kw of ['boleto', 'Boleto', 'PIX', 'Cartão', 'Extrato', 'Saldo', 'Ag.', 'Conta ']) {
    console.log(`ocorrências de "${kw}":`, (banco.text.match(new RegExp(kw, 'g')) || []).length);
  }
  console.log('html contém "boleto"?', /boleto/i.test(banco.html));
  console.log('html contém "Boleto"?', /Boleto/.test(banco.html));

  console.log('\n=== D) /conta — HEADINGS E SALDO ===');
  const c = pages['/conta'];
  console.log(c.text);
  const hs = [...c.html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)].map((m) => clean(m[1]));
  console.log('HEADINGS h1-h6:', JSON.stringify(hs));

  console.log('\n=== E) SAÚDE GERAL: undefined/NaN/objeto/vazio ===');
  for (const [p, r] of Object.entries(pages)) {
    for (const re of [/\bundefined\b/i, /\bNaN\b/, /\[object Object\]/i, /\bInfinity\b/i, /\bnull\b/i, /Error:/i, /\bR\$ ?—/]) {
      const m = r.text.match(re);
      if (m) console.log(`[${p}] ${re} -> ...${r.text.slice(Math.max(0, m.index - 120), m.index + 120).replace(/\n+/g, ' | ')}...`);
    }
    for (const line of r.text.split('\n')) {
      if (/^[—–-]$/.test(line)) console.log(`[${p}] LINHA ISOLADA DE TRAVESSÃO: "${line}"`);
    }
  }
  console.log('\n=== FIM ===');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
