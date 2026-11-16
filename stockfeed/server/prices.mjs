// 시세(야후 파이낸스 차트 API)와 공시 후 주가 반응 추적.
import { getJSON, limiter, ttlCache } from './http.mjs';

const lim = limiter(4);
const cache = ttlCache(30_000);

export async function quote(ticker) {
  const t = String(ticker).toUpperCase();
  return cache(t, () => lim(async () => {
    const j = await getJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?interval=5m&range=1d&includePrePost=true`);
    const r = j.chart?.result?.[0];
    if (!r) throw new Error(`시세 없음: ${t}`);
    const m = r.meta || {};
    const ts = r.timestamp || [];
    const cl = r.indicators?.quote?.[0]?.close || [];
    const series = [];
    for (let i = 0; i < ts.length; i++) if (cl[i] != null) series.push([ts[i] * 1000, cl[i]]);
    const prev = m.chartPreviousClose ?? m.previousClose ?? null;
    // 시간외 체결까지 포함한 마지막 가격
    const price = series.length ? series[series.length - 1][1] : m.regularMarketPrice ?? null;
    return {
      ticker: t, name: m.longName || m.shortName || t, exchange: m.fullExchangeName || '',
      price, prev, pct: price != null && prev ? ((price - prev) / prev) * 100 : null,
      regular: m.regularMarketPrice ?? null, high: m.regularMarketDayHigh ?? null, low: m.regularMarketDayLow ?? null,
      volume: m.regularMarketVolume ?? null, hi52: m.fiftyTwoWeekHigh ?? null, lo52: m.fiftyTwoWeekLow ?? null,
      series, asOf: Date.now(),
    };
  }));
}

export const REACTION_MARKS = [5, 30, 60]; // 분

// 포착 직후 기준가를 잡고, 5·30·60분 뒤 등락률을 채운다.
export function startReactionTracker({ filings, onUpdate, intervalMs = 30_000 }) {
  const work = async () => {
    const now = Date.now();
    for (const f of filings()) {
      if (now - f.ts > 75 * 60_000) break; // 최신순이므로 이후는 모두 만료
      if (!f.live || !f.ticker) continue;
      const r = f.reaction;
      if (r && r.failed) continue;
      try {
        if (!r) {
          const q = await quote(f.ticker);
          if (q.price == null) { f.reaction = { failed: true }; continue; }
          f.reaction = { base: q.price, at: now, marks: {} };
          onUpdate(f);
          continue;
        }
        for (const m of REACTION_MARKS) {
          if (r.marks[m] != null || now - f.ts < m * 60_000) continue;
          const q = await quote(f.ticker);
          if (q.price == null) continue;
          r.marks[m] = Number((((q.price - r.base) / r.base) * 100).toFixed(2));
          onUpdate(f);
        }
      } catch {
        if (!r) f.reaction = { failed: true };
      }
    }
  };
  let running = false;
  const timer = setInterval(async () => { if (running) return; running = true; try { await work(); } finally { running = false; } }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
