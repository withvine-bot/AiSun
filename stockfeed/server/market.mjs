// 장 구간, 지수, 환율, 급등락 랭킹.
import { getJSON, ttlCache } from './http.mjs';
import { quote } from './prices.mjs';

const etFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
});

function etParts(t = Date.now()) {
  const p = Object.fromEntries(etFmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, mins: Number(p.hour) * 60 + Number(p.minute), wd: p.weekday };
}

export const etDate = (t) => etParts(t).date;

// 휴장일(공휴일)은 반영하지 않는다. 요일과 시각만 본다.
export function session(t = Date.now()) {
  const { mins, wd } = etParts(t);
  if (wd === 'Sat' || wd === 'Sun') return { key: 'closed', label: '주말 휴장' };
  if (mins >= 240 && mins < 570) return { key: 'pre', label: '프리마켓' };
  if (mins >= 570 && mins < 960) return { key: 'regular', label: '정규장' };
  if (mins >= 960 && mins < 1200) return { key: 'post', label: '애프터마켓' };
  return { key: 'overnight', label: '데이마켓' };
}

const cache = ttlCache(60_000);

export async function fx() {
  return cache('fx', async () => {
    const j = await getJSON('https://open.er-api.com/v6/latest/USD');
    return { krw: j.rates?.KRW ?? null, asOf: j.time_last_update_utc || null };
  }).catch(() => ({ krw: null, asOf: null }));
}
const fxHourly = ttlCache(3600_000);
export const fxCached = () => fxHourly('fx', fx);

const INDICES = [['QQQ', '나스닥100'], ['SPY', 'S&P500'], ['DIA', '다우존스']];
export async function indices() {
  return Promise.all(INDICES.map(async ([t, label]) => {
    try { const q = await quote(t); return { ticker: t, label, price: q.price, pct: q.pct }; }
    catch { return { ticker: t, label, price: null, pct: null }; }
  }));
}

const num = (s) => Number(String(s ?? '').replace(/[$,%]/g, '')) || 0;
const rankCache = ttlCache(120_000);

// 나스닥 스크리너 전 종목에서 등락률 상·하위를 뽑는다. 거래가 거의 없는 종목은 뺀다.
export async function ranking() {
  return rankCache('rank', async () => {
    const j = await getJSON('https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=25&offset=0&download=true', { timeout: 30000 });
    const rows = (j.data?.rows || []).map((r) => ({
      ticker: String(r.symbol || '').trim(), name: String(r.name || '').replace(/\s+(Common Stock|Ordinary Shares?|Class [A-Z] .*|American Depositary .*)$/i, ''),
      price: num(r.lastsale), pct: num(r.pctchange), volume: num(r.volume), cap: num(r.marketCap), sector: r.sector || '',
    })).filter((r) => r.ticker && !/[\^\/]/.test(r.ticker) && r.price >= 0.5 && r.volume >= 200_000 && r.price * r.volume >= 1_000_000);
    const sorted = [...rows].sort((a, b) => b.pct - a.pct);
    return { asOf: Date.now(), up: sorted.slice(0, 40), down: sorted.slice(-40).reverse(), universe: rows.length };
  });
}
