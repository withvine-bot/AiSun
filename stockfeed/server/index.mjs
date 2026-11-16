// 공시레이더 서버: 정적 파일 + JSON API + SSE 실시간 스트림. 의존성 없이 node:http 만 쓴다.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { store, load, add, save, touch, indexTicker } from './store.mjs';
import { startPoller, searchEntities, companyFilings, enrich, loadTickerTable } from './edgar.mjs';
import { quote, startReactionTracker } from './prices.mjs';
import { session, indices, fxCached, ranking, etDate } from './market.mjs';
import { CATEGORIES } from './forms.mjs';
import { createSummarizer } from './summarize.mjs';
import { ttlCache } from './http.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, '..', 'public');
const PORT = Number(process.env.PORT || 3000);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

// ── SSE ──────────────────────────────────────────────
const clients = new Set();
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25000).unref();

// 클라이언트에 내보낼 형태 (내부 필드 제거)
const pub = ({ docUrl, tickers, ents, ...f }) => f;

// ── 조회 ─────────────────────────────────────────────
function feed({ cat, tickers, q, after, limit }) {
  const set = tickers != null ? new Set(tickers.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)) : null;
  const needle = q ? q.toLowerCase() : null;
  const max = Math.min(Number(limit) || 30, 100);
  // 커서는 마지막으로 받은 공시의 id. 같은 시각의 공시가 많아 시각만으로는 이어 읽을 수 없다.
  let i = after && store.byId.has(after) ? store.filings.indexOf(store.byId.get(after)) + 1 : 0;
  const out = [];
  for (; i < store.filings.length && out.length < max; i++) {
    const f = store.filings[i];
    if (cat && cat !== 'all' && f.cat !== cat) continue;
    if (set && !(f.ticker && set.has(f.ticker))) continue;
    if (needle && !(`${f.ticker || ''} ${f.name} ${f.form} ${f.summary}`.toLowerCase().includes(needle))) continue;
    out.push(pub(f));
  }
  return { items: out, hasMore: i < store.filings.length };
}

function todayReport() {
  const date = etDate();
  const todays = store.filings.filter((f) => f.fileDate === date);
  const byCat = {};
  for (const f of todays) byCat[f.cat] = (byCat[f.cat] || 0) + 1;
  const reacted = store.filings
    .filter((f) => f.reaction?.marks && Object.keys(f.reaction.marks).length)
    .map((f) => { const m = f.reaction.marks; return { ...pub(f), move: m[60] ?? m[30] ?? m[5], mark: m[60] != null ? 60 : m[30] != null ? 30 : 5 }; });
  const counts = new Map();
  for (const f of todays) if (f.ticker) counts.set(f.ticker, { ticker: f.ticker, name: f.name, n: (counts.get(f.ticker)?.n || 0) + 1 });
  const flagged = todays.filter((f) => f.signal < 0 && f.ticker).slice(0, 12).map(pub);
  return {
    date, total: todays.length, byCat, categories: CATEGORIES,
    topUp: [...reacted].sort((a, b) => b.move - a.move).filter((f) => f.move > 0).slice(0, 8),
    topDown: [...reacted].sort((a, b) => a.move - b.move).filter((f) => f.move < 0).slice(0, 8),
    busiest: [...counts.values()].filter((c) => c.n > 1).sort((a, b) => b.n - a.n).slice(0, 10),
    flagged,
  };
}

const marketCache = ttlCache(20_000);
const stockCache = ttlCache(60_000);

async function stock(ticker) {
  const t = ticker.toUpperCase();
  const [q, co] = await Promise.all([
    quote(t).catch(() => null),
    stockCache(t, async () => {
      let cik = store.cikByTicker.get(t);
      if (!cik) cik = (await searchEntities(t)).find((e) => e.tickers.includes(t))?.cik;
      return cik ? companyFilings(cik) : null;
    }).catch(() => null),
  ]);
  if (!q && !co) return null;
  // 서버가 직접 포착한 건은 반응 기록을 덧붙인다
  const filings = (co?.filings || []).map((f) => ({ ...f, reaction: store.byId.get(f.id)?.reaction || null }));
  return { ticker: t, name: co?.name || q?.name || t, industry: co?.industry || '', exchange: co?.exchanges?.[0] || q?.exchange || '', quote: q, filings };
}

async function rankingWithFilings() {
  const r = await ranking();
  const recent = new Map();
  for (const f of store.filings) if (f.ticker && !recent.has(f.ticker)) recent.set(f.ticker, { form: f.form, ts: f.ts, live: f.live, label: f.label });
  const deco = (rows) => rows.map((x) => ({ ...x, filing: recent.get(x.ticker) || null }));
  return { asOf: r.asOf, universe: r.universe, up: deco(r.up), down: deco(r.down) };
}

// ── 라우팅 ───────────────────────────────────────────
const routes = {
  '/api/feed': (p) => feed(Object.fromEntries(p)),
  '/api/market': () => marketCache('m', async () => {
    const [idx, f] = await Promise.all([indices(), fxCached()]);
    const date = etDate();
    return { session: session(), indices: idx, fx: f, today: store.filings.filter((x) => x.fileDate === date).length, categories: CATEGORIES };
  }),
  '/api/ranking': () => rankingWithFilings(),
  '/api/today': () => todayReport(),
  '/api/search': async (p) => {
    const q = (p.get('q') || '').trim().slice(0, 40);
    return q.length < 1 ? { items: [] } : { items: (await searchEntities(q)).filter((e) => e.tickers.length).slice(0, 12) };
  },
  '/api/prices': async (p) => {
    const ts = (p.get('tickers') || '').split(',').map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z][A-Z0-9.\-]{0,6}$/.test(s)).slice(0, 40);
    const out = {};
    await Promise.all(ts.map(async (t) => { try { const q = await quote(t); out[t] = { price: q.price, pct: q.pct }; } catch { out[t] = null; } }));
    return out;
  },
};

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method not allowed' });
  try {
    if (p === '/api/stream') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 5000\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    const m = /^\/api\/stock\/([A-Za-z][A-Za-z0-9.\-]{0,6})$/.exec(p);
    if (m) {
      const s = await stock(m[1]);
      return s ? send(res, 200, s) : send(res, 404, { error: '종목을 찾지 못했습니다.' });
    }
    if (routes[p]) return send(res, 200, await routes[p](url.searchParams));
    if (p.startsWith('/api/')) return send(res, 404, { error: 'not found' });

    // 정적 파일. 그 밖의 경로는 SPA 진입점으로 돌려보낸다.
    const file = path.normalize(path.join(PUBLIC, p === '/' ? 'index.html' : p));
    if (file.startsWith(PUBLIC + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      return send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
    }
    return send(res, 200, fs.readFileSync(path.join(PUBLIC, 'index.html')), MIME['.html']);
  } catch (e) {
    console.error('[http]', p, e.message);
    send(res, 502, { error: '데이터를 불러오지 못했습니다.' });
  }
});

// ── 기동 ─────────────────────────────────────────────
load();
await loadTickerTable();
const summarize = await createSummarizer();

startPoller({
  has: (id) => store.byId.has(id),
  intervalMs: Number(process.env.POLL_MS || 90000),
  onNew: async (all) => {
    for (const f of all) add(f);
    const fresh = all.filter((f) => f.live);
    // 실시간 포착분은 티커를 먼저 채운 뒤 내보낸다 (관심종목 알림이 티커로 걸리기 때문)
    await Promise.all(fresh.map((f) => enrich(f).then((ok) => { if (ok) indexTicker(f); })));
    touch();
    // 한꺼번에 몰려도 화면이 넘치지 않게 최신 60건만 방송
    for (const f of fresh.slice(0, 60)) broadcast('filing', pub(f));
    if (summarize) {
      for (const f of fresh) summarize(f).then((r) => {
        if (!r) return;
        Object.assign(f, { summary: r.summary, signal: r.signal, ai: true });
        touch();
        broadcast('update', pub(f));
      });
    }
    backfillTickers();
  },
});

// 초기 적재분의 빠진 티커는 뒤에서 천천히 채운다.
let backfilling = false;
async function backfillTickers() {
  if (backfilling) return;
  backfilling = true;
  try {
    for (const f of [...store.filings]) {
      if (!f.ents) continue;
      if (await enrich(f)) { indexTicker(f); touch(); }
    }
  } finally { backfilling = false; }
}

startReactionTracker({
  filings: () => store.filings,
  onUpdate: (f) => { touch(); if (f.reaction?.marks && Object.keys(f.reaction.marks).length) broadcast('update', pub(f)); },
});

setInterval(save, 60000).unref();
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { save(); process.exit(0); });

server.listen(PORT, () => console.log(`공시레이더 http://localhost:${PORT}  (AI 요약: ${summarize ? '켜짐' : '꺼짐'})`));
