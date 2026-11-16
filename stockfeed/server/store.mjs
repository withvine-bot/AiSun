// 메모리 저장소 + JSON 스냅샷. 재시작해도 피드와 반응 추적이 이어진다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tickerByCik } from './edgar.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = process.env.DATA_FILE || path.join(here, '..', 'data', 'state.json');
const MAX = 12000;

export const store = {
  filings: [],          // 최신순
  byId: new Map(),
  cikByTicker: new Map(),
  startedAt: Date.now(),
};

export function load() {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    for (const [c, t] of j.tickerByCik || []) tickerByCik.set(c, t);
    for (const f of j.filings || []) { store.filings.push(f); store.byId.set(f.id, f); indexTicker(f); }
  } catch { /* 첫 실행 */ }
}

export function indexTicker(f) { if (f.ticker && f.cik) { store.cikByTicker.set(f.ticker, f.cik); if (!tickerByCik.get(f.cik)) tickerByCik.set(f.cik, f.ticker); } }

export function add(f) {
  if (store.byId.has(f.id)) return false;
  store.byId.set(f.id, f);
  indexTicker(f);
  // ts 내림차순 유지 (새 공시는 대부분 맨 앞)
  let i = 0;
  while (i < store.filings.length && store.filings[i].ts > f.ts) i++;
  store.filings.splice(i, 0, f);
  while (store.filings.length > MAX) store.byId.delete(store.filings.pop().id);
  dirty = true;
  return true;
}

let dirty = false;
export const touch = () => { dirty = true; };

export function save() {
  if (!dirty) return;
  dirty = false;
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ savedAt: Date.now(), tickerByCik: [...tickerByCik], filings: store.filings }));
    fs.renameSync(tmp, FILE);
  } catch (e) { console.error('[store] 저장 실패:', e.message); }
}
