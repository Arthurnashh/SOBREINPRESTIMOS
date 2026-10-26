import fs from 'node:fs';
import path from 'node:path';
const ROOT = process.cwd();
const BASE = 'https://site-pearl-nine-93.vercel.app';

function readEnvLocal() {
  const raw = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  const o = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    o[m[1]] = v;
  }
  return o;
}
const dec = (s) => s.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#x27;/gi, "'").replace(/&#39;/g, "'")
  .replace(/&quot;/gi, '"').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
function clean(html) {
  let s = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<\/(br|p|div|li|h[1-6]|section|header|footer|nav|tr|td|th|table|main|article|aside|button|span|label|form|ul|ol)>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  return dec(s).replace(/[ \t\u00a0]+/g, ' ').split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
}

(async () => {
  const env = readEnvLocal();
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@sobreimprestimos.com.br', password: 'Sobre@Admin2026' }),
  });
  const s = await r.json();
  const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
  const cookie = `sb-${ref}-auth-token=` + encodeURIComponent(JSON.stringify({
    access_token: s.access_token, token_type: 'bearer', expires_in: s.expires_in,
    expires_at: s.expires_at, refresh_token: s.refresh_token, user: s.user }));

  console.log('### 1. SEM COOKIE: /entrar, /cadastro, /esqueci-senha (seguindo redirect) ###');
  for (const p of ['/entrar', '/cadastro', '/esqueci-senha']) {
    const res = await fetch(BASE + p, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0' } });
    console.log(`${p} -> HTTP ${res.status} final=${res.url}`);
  }

  console.log('\n### 2. COM COOKIE: redirect real de /entrar e /cadastro ###');
  for (const p of ['/entrar', '/cadastro', '/esqueci-senha']) {
    const res = await fetch(BASE + p, { redirect: 'manual', headers: { cookie, 'user-agent': 'Mozilla/5.0' } });
    const loc = res.headers.get('location');
    const body = await res.text();
    console.log(`${p} -> HTTP ${res.status} location=${loc} corpoLen=${body.length} primeirasLinhas=${JSON.stringify(clean(body).split('\n').slice(2, 6))}`);
  }

  console.log('\n### 3. BOLETOS em /conta/banco — busca bruta no HTML ###');
  const res = await fetch(BASE + '/conta/banco', { headers: { cookie, 'user-agent': 'Mozilla/5.0' } });
  const html = await res.text();
  for (const kw of ['boleto', 'Boleto', 'linha digitável', 'codigo de barras', 'código de barras', 'Pagar', 'pagar', 'Vencimento', 'beneficiário']) {
    const n = (html.match(new RegExp(kw, 'g')) || []).length;
    console.log(`  HTML "${kw}": ${n}`);
  }
  console.log('\n-- contextos de "boleto" no HTML renderizado --');
  const re = /boleto/gi; let m;
  while ((m = re.exec(html))) {
    const seg = html.slice(Math.max(0, m.index - 300), m.index + 300);
    console.log('   >>>', clean(seg).replace(/\n+/g, ' | '));
  }
  console.log('\n-- procurando painel/seção de boletos (elementos com role=tab, headings, h2/h3) --');
  const hs = [...html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)].map((x) => clean(x[1]));
  console.log('  headings /conta/banco:', JSON.stringify(hs));
  const tabs = [...html.matchAll(/role="tab"[^>]*>([\s\S]*?)<\//gi)].map((x) => clean(x[1]));
  console.log('  role=tab:', JSON.stringify(tabs));
  const btns = [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/gi)].map((x) => clean(x[1]));
  console.log('  botões:', JSON.stringify(btns));

  console.log('\n### 4. Valores numéricos presentes em /conta/banco (salário, agência, conta) ###');
  const t = clean(html);
  console.log('  "Ag." linha      :', t.split('\n').find((l) => l.includes('Ag.')));
  console.log('  linha Saldo+valor:', JSON.stringify(t.split('\n').slice(t.split('\n').findIndex((l) => l === 'Saldo disponível'), t.split('\n').findIndex((l) => l === 'Saldo disponível') + 3)));
  console.log('  contém "salário"?:', /sal[aá]rio/i.test(t), '| no HTML:', /sal[aá]rio/i.test(html));
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
