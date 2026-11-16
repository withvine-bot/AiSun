// SEC EDGAR 전문검색(efts) 폴링. 오늘 날짜의 감시 서식을 훑어 새 접수번호를 찾아낸다.
import { getJSON, sleep, limiter } from './http.mjs';
import { WATCH_GROUPS, describe } from './forms.mjs';
import { etDate } from './market.mjs';

const EFTS = 'https://efts.sec.gov/LATEST/search-index';
const PAGE = 100;

// "Teamshares Inc  (TMS, TMSWW)  (CIK 0002048951)" → { name, tickers, cik }
export function parseEntity(display) {
  const m = /^(.*?)\s*(?:\(([^()]*)\)\s*)?\(CIK (\d+)\)\s*$/.exec(display || '');
  if (!m) return { name: (display || '').trim(), tickers: [], cik: null };
  const tickers = m[2] ? m[2].split(',').map((s) => s.trim()).filter((s) => /^[A-Z][A-Z0-9.\-]{0,6}$/.test(s)) : [];
  // 괄호 안이 티커가 아니면(예: "(Delaware)") 회사명의 일부로 본다
  const name = (tickers.length || !m[2] ? m[1] : `${m[1]} (${m[2]})`).replace(/\s+/g, ' ').trim();
  return { name, tickers, cik: String(Number(m[3])) };
}

// efts hit 하나를 피드 항목으로 변환
export function toFiling(hit, now = Date.now(), live = true) {
  const s = hit._source || {};
  const adsh = s.adsh || String(hit._id).split(':')[0];
  const ents = (s.display_names || []).map(parseEntity);
  // 티커가 있는 쪽이 발행회사, 나머지는 보고자(내부자·대량보유자)
  const subject = ents.find((e) => e.tickers.length) || ents[ents.length - 1] || { name: '알 수 없음', tickers: [], cik: null };
  const reporter = ents.find((e) => e !== subject && !e.tickers.length);
  const form = s.form || s.file_type || '';
  const d = describe({ form, name: subject.name, reporter: reporter?.name, items: s.items || [] });
  const doc = String(hit._id).split(':')[1] || '';
  const base = subject.cik ? `https://www.sec.gov/Archives/edgar/data/${subject.cik}/${adsh.replace(/-/g, '')}` : null;
  return {
    id: adsh,
    form,
    cat: d.cat,
    label: d.label,
    ticker: subject.tickers[0] || null,
    tickers: subject.tickers,
    name: subject.name,
    cik: subject.cik,
    reporter: reporter?.name || null,
    items: s.items || [],
    tags: d.tags,
    signal: d.signal,
    summary: d.text,
    ai: false,
    fileDate: s.file_date,
    period: s.period_ending || null,
    url: base ? `${base}/${adsh}-index.htm` : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&filenum=${adsh}`,
    docUrl: base && doc ? `${base}/${doc}` : null,
    // live=true 는 서버가 가동 중에 직접 포착한 공시. 그때만 포착 시각과 주가 반응을 기록한다.
    live,
    ts: live ? now : Date.parse(`${s.file_date}T12:00:00-05:00`) || now,
    reaction: null,
    // 티커를 못 찾은 공시는 나중에 CIK 로 다시 찾아본다 (Form 4 등은 검색 결과에 티커가 빠져 있다)
    ents: subject.tickers.length ? undefined : ents.filter((e) => e.cik).map(({ name, cik }) => ({ name, cik })),
  };
}

// ── CIK → 티커 ───────────────────────────────────────
// 값이 '' 이면 '조회했지만 티커 없음'.
export const tickerByCik = new Map();
const lookupLim = limiter(3);

// 전 종목 표를 한 번에 받는다. www.sec.gov 는 연락처가 담긴 User-Agent 가 없으면 거절하므로 실패해도 넘어간다.
export async function loadTickerTable() {
  try {
    const j = await getJSON('https://www.sec.gov/files/company_tickers.json', { sec: true });
    for (const r of Object.values(j)) if (!tickerByCik.get(String(r.cik_str))) tickerByCik.set(String(r.cik_str), r.ticker);
    console.log(`[edgar] 티커 표 ${Object.keys(j).length}건 적재`);
  } catch (e) {
    console.warn(`[edgar] 티커 표를 받지 못했습니다(${e.message}). 필요한 종목만 개별 조회합니다. SEC_USER_AGENT 를 지정하면 해결됩니다.`);
  }
}

async function tickerOf(cik) {
  if (tickerByCik.has(cik)) return tickerByCik.get(cik);
  return lookupLim(async () => {
    if (tickerByCik.has(cik)) return tickerByCik.get(cik);
    const j = await getJSON(`https://data.sec.gov/submissions/CIK${cik.padStart(10, '0')}.json`, { sec: true });
    const t = (j.tickers || [])[0] || '';
    tickerByCik.set(cik, t);
    return t;
  });
}

// 티커 없는 공시의 발행회사를 찾아 채운다. 바뀌었으면 true.
export async function enrich(f) {
  if (f.ticker || !f.ents?.length) { delete f.ents; return false; }
  for (const e of f.ents) {
    let t;
    try { t = await tickerOf(e.cik); } catch { return false; } // 일시 오류면 다음 기회에
    if (!t) continue;
    const reporter = f.ents.find((x) => x !== e)?.name || null;
    const d = describe({ form: f.form, name: e.name, reporter, items: f.items });
    const adsh = f.id.replace(/-/g, '');
    Object.assign(f, {
      ticker: t, tickers: [t], name: e.name, cik: e.cik, reporter, summary: f.ai ? f.summary : d.text,
      url: `https://www.sec.gov/Archives/edgar/data/${e.cik}/${adsh}/${f.id}-index.htm`,
      docUrl: f.docUrl ? f.docUrl.replace(/\/data\/\d+\//, `/data/${e.cik}/`) : null,
    });
    delete f.ents;
    return true;
  }
  delete f.ents;
  return false;
}

// efts 는 간헐적으로 500 을 낸다. 짧게 물러났다가 다시 시도한다.
async function fetchPage(forms, date, from) {
  const q = new URLSearchParams({ forms: forms.join(','), dateRange: 'custom', startdt: date, enddt: date, from: String(from) });
  for (let attempt = 0; ; attempt++) {
    try { return await getJSON(`${EFTS}?${q}`, { sec: true }); }
    catch (e) { if (attempt >= 3) throw e; await sleep(800 * 2 ** attempt); }
  }
}

// 한 묶음의 하루치 전체를 훑는다. 정렬 키가 접수 시각이 아니라서 새 공시가 목록 중간에도 끼어든다.
export async function sweep(forms, date, { onHit, first, maxPages = 80, delay = 150 } = {}) {
  let j = first || await fetchPage(forms, date, 0);
  const total = j.hits?.total?.value ?? 0;
  for (let from = 0, pages = 0; pages < maxPages; pages++) {
    const hits = j.hits?.hits || [];
    if (!hits.length) break;
    for (const h of hits) onHit(h);
    from += PAGE;
    if (from >= total) break;
    await sleep(delay);
    j = await fetchPage(forms, date, from);
  }
  return total;
}

export function startPoller({ has, onNew, intervalMs = 90000 }) {
  let stopped = false, round = 0;
  const last = {}; // 묶음별 { date, total, sweeps }
  const tick = async () => {
    const date = etDate();
    const fresh = [];
    const seen = new Set();
    let grand = 0;
    round++;
    for (const [group, forms] of Object.entries(WATCH_GROUPS)) {
      try {
        // 첫 페이지로 건수를 확인하고, 변했을 때만 그 묶음을 끝까지 훑는다.
        // 건수 변화 없이 바뀌는 경우에 대비해 10번에 한 번은 무조건 훑는다.
        const head = await fetchPage(forms, date, 0);
        const total = head.hits?.total?.value ?? 0;
        grand += total;
        const prev = last[group];
        if (prev && prev.sweeps >= 2 && prev.date === date && prev.total === total && round % 10) continue;
        // 이 묶음을 한 번이라도 끝까지 훑은 뒤에 새로 보이는 공시만 '실시간 포착'으로 본다.
        // 그래야 서버를 켜기 전에 접수된 공시를 방금 나온 것으로 오인하지 않는다.
        // efts 색인이 회차마다 조금씩 다른 결과를 주기도 해서, 두 번 훑은 뒤부터 인정한다.
        const live = (prev?.sweeps || 0) >= 2;
        const now = Date.now();
        await sweep(forms, date, { first: head, onHit: (h) => {
          const id = h._source?.adsh || String(h._id).split(':')[0];
          if (seen.has(id) || has(id)) return;
          seen.add(id);
          fresh.push(toFiling(h, now, live));
        } });
        last[group] = { date, total, sweeps: (prev?.sweeps || 0) + 1 };
      } catch (e) {
        console.error(`[edgar] ${group} 폴링 실패:`, e.message);
      }
      await sleep(200);
    }
    if (fresh.length) {
      onNew(fresh);
      const liveN = fresh.filter((f) => f.live).length;
      console.log(`[edgar] ${date} 총 ${grand}건 · 실시간 포착 ${liveN}건 · 초기 적재 ${fresh.length - liveN}건`);
    }
    if (!stopped) setTimeout(tick, intervalMs).unref?.();
  };
  tick();
  return () => { stopped = true; };
}

// 종목 검색 (EDGAR 엔터티 자동완성)
export async function searchEntities(q) {
  const j = await getJSON(`${EFTS}?keysTyped=${encodeURIComponent(q)}`, { sec: true });
  return (j.hits?.hits || []).map((h) => ({
    cik: String(h._id),
    name: String(h._source?.entity || '').replace(/\s*\([A-Z0-9,.\- ]+\)\s*$/, ''),
    tickers: String(h._source?.tickers || '').split(',').map((s) => s.trim()).filter(Boolean),
  }));
}

// 종목별 최근 공시 (data.sec.gov)
export async function companyFilings(cik, limit = 40) {
  const j = await getJSON(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, '0')}.json`, { sec: true });
  const r = j.filings?.recent || {};
  const out = [];
  for (let i = 0; i < (r.form || []).length && out.length < limit; i++) {
    const adsh = r.accessionNumber[i];
    const items = r.items[i] ? r.items[i].split(',') : [];
    const d = describe({ form: r.form[i], name: j.name, items });
    out.push({
      id: adsh, form: r.form[i], cat: d.cat, label: d.label, tags: d.tags, signal: d.signal, summary: d.text,
      ts: Date.parse(r.acceptanceDateTime[i]) || Date.parse(r.filingDate[i]), fileDate: r.filingDate[i],
      url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${adsh.replace(/-/g, '')}/${adsh}-index.htm`,
    });
  }
  return { name: j.name, tickers: j.tickers || [], exchanges: j.exchanges || [], industry: j.sicDescription || '', filings: out };
}
