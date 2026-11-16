// 외부 API 호출 공통부: 타임아웃, 동시성 제한, TTL 캐시.

// SEC는 자동화 클라이언트에 연락처가 담긴 User-Agent 를 요구한다(sec.gov/os/accessing-edgar-data).
// 운영 시 SEC_USER_AGENT="회사명 연락처이메일" 로 지정할 것.
export const SEC_UA = process.env.SEC_USER_AGENT || 'Mozilla/5.0 (compatible; gongsi-radar/0.1)';
const GENERIC_UA = 'Mozilla/5.0 (compatible; gongsi-radar/0.1)';

export async function getJSON(url, { timeout = 15000, sec = false, headers = {} } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': sec ? SEC_UA : GENERIC_UA, Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${new URL(url).host}`);
  return res.json();
}

export async function getText(url, { timeout = 20000, sec = false } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': sec ? SEC_UA : GENERIC_UA },
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${new URL(url).host}`);
  return res.text();
}

export function limiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => { active--; next(); });
  };
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
}

// 같은 키의 동시 요청은 하나로 합치고, 실패는 짧게만 기억한다.
export function ttlCache(ttlMs, maxSize = 2000) {
  const map = new Map();
  return async (key, loader) => {
    const hit = map.get(key);
    const now = Date.now();
    if (hit && hit.exp > now) return hit.p;
    const p = loader();
    map.set(key, { p, exp: now + ttlMs });
    p.catch(() => { const cur = map.get(key); if (cur && cur.p === p) cur.exp = Date.now() + Math.min(ttlMs, 5000); });
    if (map.size > maxSize) for (const [k, v] of map) { if (v.exp <= now) map.delete(k); }
    return p;
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
