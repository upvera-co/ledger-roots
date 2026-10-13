// Upvera günlük kökleri — çek · doğrula · yaz (bu depo ile birlikte yayımlanır; bağımlılık yok, Node 20+).
//
//   node tools/days.mjs fetch    okuma kapısından (core_block_days_v1) yeni günleri çeker; her günü yazmadan ÖNCE doğrular:
//                                kayıt kanonik · tam 8 alan, sürüm 2 (yalnız kökler — sayı yok) · özet = sha256("upvera/day/v1\n" ‖
//                                JCS(kayıt)) · prev = bir önceki günün özeti (ilk gün genesis'e) · gün ardışık. Var olan dosya ASLA
//                                değiştirilmez (farklıysa hata).
//   node tools/days.mjs verify   depodaki bütün günleri baştan doğrular (aynı kurallar, ağ yok).
//
// Ortam: UPVERA_API (ör. https://api.upvera.co) · UPVERA_ANON_KEY (herkese açık anon anahtar — uygulamada da duruyor).
// Biçim: docs/features/ranks/blocks.md §3.6 · §3.8 (Upvera ana deposu; block@1): gün {t:"d", v:2, day, prev, root, tip, checkpoint,
// rules_hash} · genesis {hash, header:{t:"genesis", v:2, anchor, rule, at}}. Coin/token yok: dosyalar yalnız özettir, zaman damgası OpenTimestamps.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
// Kanonik serileştirme (CC-N-4: JCS alt kümesi — ASCII anahtarlar sıralı, yalnız |n| < 2^53 tamsayı)
const jcs = (v) => {
  if (v === null || typeof v === 'boolean') return JSON.stringify(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') { if (!Number.isInteger(v) || Math.abs(v) >= 2 ** 53) throw new Error('kanonik değil: sayı'); return String(v); }
  if (Array.isArray(v)) return '[' + v.map(jcs).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + jcs(v[k])).join(',') + '}';
};
const dayHash = (rec) => sha('upvera/day/v1\n' + jcs(rec));
const next = (d) => new Date(Date.parse(d + 'T00:00:00Z') + 86_400_000).toISOString().slice(0, 10);
const pathOf = (d) => join('days', d.slice(0, 4), d.slice(5, 7), `${d}.json`);
const DAY_KEYS = 'checkpoint,day,prev,root,rules_hash,t,tip,v';
const GEN_KEYS = 'anchor,at,rule,t,v';
const keysOf = (o) => Object.keys(o).sort().join(',');
const fail = (m) => { console.error(`::error::${m}`); process.exit(1); };

function localDays() {
  if (!existsSync('days')) return [];
  const out = [];
  for (const y of readdirSync('days').sort()) for (const m of readdirSync(join('days', y)).sort())
    for (const f of readdirSync(join('days', y, m)).filter((x) => x.endsWith('.json')).sort()) out.push(f.slice(0, 10));
  return out;
}
function check(rec, text, prevHash, expectDay) {
  if (rec.t !== 'd' || rec.v !== 2 || keysOf(rec) !== DAY_KEYS) fail(`${expectDay}: biçim (gün kaydı v2 — yalnız kökler)`);
  if (text !== jcs(rec) + '\n') fail(`${rec.day}: dosya kanonik değil`);
  if (rec.day !== expectDay) fail(`gün ${rec.day}, beklenen ${expectDay}`);
  if (rec.prev !== prevHash) fail(`${rec.day}: prev zinciri kopuk`);
  return dayHash(rec);
}

function verifyAll() {
  if (!existsSync('genesis.json')) {   // yayın henüz başlamadı (okuma kapısı 'off') — doğrulanacak gün yok
    if (localDays().length) fail('gün dosyaları var ama genesis.json yok');
    return { n: 0, tip: null, next: null };
  }
  const gen = JSON.parse(readFileSync('genesis.json', 'utf8'));
  if (gen.header?.t !== 'genesis' || gen.header.v !== 2 || keysOf(gen.header) !== GEN_KEYS || gen.header.anchor !== gen.hash) fail('genesis biçimi');
  let prev = gen.hash, expect = gen.header.at.slice(0, 10), n = 0;
  for (const d of localDays()) {
    const text = readFileSync(pathOf(d), 'utf8');
    prev = check(JSON.parse(text), text, prev, expect);
    expect = next(d); n++;
  }
  return { n, tip: prev, next: expect };
}

const cmd = process.argv[2];
if (cmd === 'verify') {
  const r = verifyAll();
  console.log(r.tip ? `✓ ${r.n} gün · uç ${r.tip}` : '✓ henüz gün yok (yayın başlamadı)');
} else if (cmd === 'fetch') {
  const api = process.env.UPVERA_API, key = process.env.UPVERA_ANON_KEY;
  if (!api || !key) fail('UPVERA_API ve UPVERA_ANON_KEY gerekli');
  const have = localDays();
  const after = have.length ? have[have.length - 1] : null;
  const url = `${api.replace(/\/$/, '')}/rest/v1/rpc/core_block_days_v1?p_limit=366${after ? `&p_after=${after}` : ''}`;
  const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) fail(`okuma kapısı ${res.status}`);
  const j = await res.json();
  if (j.state !== 'ok') { console.log(`yayın kapalı (${j.state}) — yazılacak gün yok`); process.exit(0); }
  if (!existsSync('genesis.json')) writeFileSync('genesis.json', jcs({ hash: j.genesis.hash, header: j.genesis.header }) + '\n');
  const gen = JSON.parse(readFileSync('genesis.json', 'utf8'));
  if (gen.hash !== j.genesis.hash) fail('genesis değişmiş — ASLA');
  let { tip: prev, next: expect } = verifyAll();
  let wrote = 0;
  for (const d of j.days) {
    if (d.jcs + '\n' !== jcs(d.record) + '\n' || d.hash !== dayHash(d.record)) fail(`${d.day}: kapının verdiği kayıt kendi özetiyle tutmuyor`);
    const p = pathOf(d.day);
    if (existsSync(p)) { if (readFileSync(p, 'utf8') !== d.jcs + '\n') fail(`${d.day}: yayımlanmış gün değişmiş — ASLA`); continue; }
    prev = check(d.record, d.jcs + '\n', prev, expect);
    mkdirSync(join('days', d.day.slice(0, 4), d.day.slice(5, 7)), { recursive: true });
    writeFileSync(p, d.jcs + '\n');
    expect = next(d.day); wrote++;
  }
  console.log(`✓ ${wrote} yeni gün yazıldı · uç ${prev}`);
} else {
  fail('kullanım: node tools/days.mjs fetch|verify');
}
