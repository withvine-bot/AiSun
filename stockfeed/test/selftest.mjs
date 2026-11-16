// 네트워크 없이 도는 자체 점검. `npm test`
import assert from 'node:assert/strict';
import { classify, describe, josa } from '../server/forms.mjs';
import { parseEntity, toFiling, startPoller, enrich, tickerByCik } from '../server/edgar.mjs';
import { startReactionTracker } from '../server/prices.mjs';
import { session, etDate } from '../server/market.mjs';
import { htmlToText, parseAnswer } from '../server/summarize.mjs';

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('  ✓', name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const realFetch = globalThis.fetch;
const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });

await t('서식 분류', () => {
  assert.equal(classify('8-K').cat, 'event');
  assert.equal(classify('8-K/A').amended, true);
  assert.equal(classify('10-Q').cat, 'earnings');
  assert.equal(classify('424B5').cat, 'offering');
  assert.equal(classify('SCHEDULE 13G/A').cat, 'ownership');
  assert.equal(classify('SC 13D').cat, 'ownership');
  assert.equal(classify('4').cat, 'insider');
  assert.equal(classify('144').cat, 'insider');
  assert.equal(classify('DEF 14A').cat, 'proxy');
  assert.equal(classify('XYZ').cat, 'other');
});

await t('조사 선택', () => {
  assert.equal(josa('애플', '이', '가'), '이');
  assert.equal(josa('테슬라', '이', '가'), '가');
  assert.equal(josa('Apple Inc.', '이', '가'), '이(가)');
});

await t('8-K 항목 해석과 신호', () => {
  const d = describe({ form: '8-K', name: 'ACME', items: ['2.02', '9.01'] });
  assert.deepEqual(d.tags, ['실적 발표']);
  assert.equal(d.signal, 0);
  assert.match(d.text, /실적 발표/);
  assert.equal(describe({ form: '8-K', name: 'ACME', items: ['3.01'] }).signal, -1);
  assert.equal(describe({ form: '8-K', name: 'ACME', items: ['1.03', '1.02'] }).signal, -1);
});

await t('엔터티 파싱', () => {
  assert.deepEqual(parseEntity('Teamshares Inc  (TMS, TMSWW)  (CIK 0002048951)'), { name: 'Teamshares Inc', tickers: ['TMS', 'TMSWW'], cik: '2048951' });
  assert.deepEqual(parseEntity('Lee Tae  (CIK 0002125533)'), { name: 'Lee Tae', tickers: [], cik: '2125533' });
  assert.equal(parseEntity('Columbia Financial, Inc./MD/  (CLBK)  (CIK 0002115119)').tickers[0], 'CLBK');
  assert.equal(parseEntity('BRK Holdings  (BRK-B)  (CIK 0000000001)').tickers[0], 'BRK-B');
});

await t('검색 결과 → 피드 항목', () => {
  const hit = {
    _id: '0001907982-26-000050:qbts-20261110.htm',
    _source: { adsh: '0001907982-26-000050', form: '8-K', file_date: '2026-11-10', items: ['2.02', '9.01'], display_names: ['D-Wave Quantum Inc.  (QBTS)  (CIK 0001907982)'] },
  };
  const f = toFiling(hit, 1000, true);
  assert.equal(f.id, '0001907982-26-000050');
  assert.equal(f.ticker, 'QBTS');
  assert.equal(f.cat, 'event');
  assert.equal(f.ts, 1000);
  assert.equal(f.url, 'https://www.sec.gov/Archives/edgar/data/1907982/000190798226000050/0001907982-26-000050-index.htm');
  assert.equal(f.docUrl, 'https://www.sec.gov/Archives/edgar/data/1907982/000190798226000050/qbts-20261110.htm');
  assert.equal(f.ents, undefined);
  // 초기 적재분은 포착 시각 대신 접수일을 쓴다
  assert.equal(toFiling(hit, 1000, false).live, false);
  assert.notEqual(toFiling(hit, 1000, false).ts, 1000);
});

await t('내부자 신고: 보고자와 발행회사 구분', () => {
  const f = toFiling({ _id: '0002152228-26-000004:x.xml', _source: { adsh: '0002152228-26-000004', form: '4', file_date: '2026-11-16', display_names: ['Waits Julian Wendell Sr.  (CIK 0002152228)', 'Rapid7, Inc.  (RPD)  (CIK 0001560327)'] } });
  assert.equal(f.ticker, 'RPD');
  assert.equal(f.reporter, 'Waits Julian Wendell Sr.');
  assert.equal(f.cat, 'insider');
  // 티커가 없으면 나중에 찾을 수 있게 후보를 남긴다
  const g = toFiling({ _id: 'a:b', _source: { adsh: 'a', form: '4', file_date: '2026-11-16', display_names: ['Doe John  (CIK 0000000011)', 'Acme Inc  (CIK 0000000022)'] } });
  assert.equal(g.ticker, null);
  assert.deepEqual(g.ents.map((e) => e.cik), ['11', '22']);
});

await t('장 구간 (미 동부 시각)', () => {
  const at = (iso) => session(Date.parse(iso)).key;
  assert.equal(at('2026-11-16T08:00:00-05:00'), 'pre');
  assert.equal(at('2026-11-16T09:30:00-05:00'), 'regular');
  assert.equal(at('2026-11-16T15:59:00-05:00'), 'regular');
  assert.equal(at('2026-11-16T16:00:00-05:00'), 'post');
  assert.equal(at('2026-11-16T21:00:00-05:00'), 'overnight');
  assert.equal(at('2026-11-14T12:00:00-05:00'), 'closed');
  assert.equal(at('2026-07-01T09:45:00-04:00'), 'regular'); // 서머타임
  assert.equal(etDate(Date.parse('2026-11-17T03:00:00Z')), '2026-11-16');
});

await t('AI 요약 응답 해석', () => {
  assert.deepEqual(parseAnswer('판단: 호재\n요약: 회사가 5천만 달러 계약을 체결했습니다.'), { summary: '회사가 5천만 달러 계약을 체결했습니다.', signal: 1 });
  assert.equal(parseAnswer('판단: 악재\n요약: 상장폐지 통지.').signal, -1);
  assert.equal(parseAnswer('형식을 벗어난 답'), null);
  assert.equal(htmlToText('<p>Hello&nbsp;<b>World</b></p><script>x()</script><p>A &amp; B</p>'), 'Hello World\nA & B');
});

await t('티커 보강: 조회 표에서 발행회사를 찾아 채운다', async () => {
  tickerByCik.set('11', ''); tickerByCik.set('22', 'ACME');
  const g = toFiling({ _id: '0000000011-26-000001:b.xml', _source: { adsh: '0000000011-26-000001', form: '4', file_date: '2026-11-16', display_names: ['Doe John  (CIK 0000000011)', 'Acme Inc  (CIK 0000000022)'] } });
  assert.equal(await enrich(g), true);
  assert.equal(g.ticker, 'ACME');
  assert.equal(g.name, 'Acme Inc');
  assert.equal(g.reporter, 'Doe John');
  assert.match(g.url, /\/data\/22\/000000001126000001\//);
  assert.equal(g.ents, undefined);
});

await t('폴러: 두 번 훑은 뒤 새로 보이는 공시만 실시간으로 본다', async () => {
  // 묶음마다 같은 목록을 돌려주는 가짜 검색 서버. 3회차부터 공시 하나가 추가된다.
  const hit = (n) => ({ _id: `0000000001-26-00000${n}:d.htm`, _source: { adsh: `0000000001-26-00000${n}`, form: '8-K', file_date: '2026-11-16', display_names: ['Acme Inc  (ACME)  (CIK 0000000022)'] } });
  let extra = false;
  globalThis.fetch = async (url) => {
    const isEvent = new URL(url).searchParams.get('forms').startsWith('8-K');
    const hits = isEvent ? (extra ? [hit(1), hit(2)] : [hit(1)]) : [];
    return json({ hits: { total: { value: hits.length }, hits } });
  };
  const seen = new Map();
  const batches = [];
  const stop = startPoller({ has: (id) => seen.has(id), intervalMs: 40, onNew: (all) => { for (const f of all) seen.set(f.id, f); batches.push(all); } });
  await sleep(2200);          // 1·2회차: 초기 적재
  assert.equal(seen.size, 1);
  assert.equal(seen.get('0000000001-26-000001').live, false);
  extra = true;
  await sleep(2200);          // 이후 회차: 새 공시 등장
  stop();
  globalThis.fetch = realFetch;
  assert.equal(seen.size, 2);
  assert.equal(seen.get('0000000001-26-000002').live, true);
  assert.equal(batches.length, 2);
});

await t('주가 반응: 기준가를 잡고 5분 뒤 등락률을 채운다', async () => {
  let price = 10;
  globalThis.fetch = async () => json({ chart: { result: [{ meta: { chartPreviousClose: 9 }, timestamp: [1, 2], indicators: { quote: [{ close: [9.5, price] }] } }] } });
  const now = Date.now();
  const fresh = { id: 'a', ticker: 'AAA', live: true, ts: now, reaction: null };
  const older = { id: 'b', ticker: 'BBB', live: true, ts: now - 6 * 60_000, reaction: { base: 8, at: now - 6 * 60_000, marks: {} } };
  const backfill = { id: 'c', ticker: 'CCC', live: false, ts: now - 60_000, reaction: null };
  const updates = [];
  const stop = startReactionTracker({ filings: () => [fresh, backfill, older], onUpdate: (f) => updates.push(f.id), intervalMs: 30 });
  await sleep(400);
  stop();
  globalThis.fetch = realFetch;
  assert.equal(fresh.reaction.base, 10);
  assert.deepEqual(fresh.reaction.marks, {});
  assert.equal(older.reaction.marks[5], 25);       // 8 → 10
  assert.equal(older.reaction.marks[30], undefined);
  assert.equal(backfill.reaction, null);           // 초기 적재분은 추적하지 않는다
  assert.ok(updates.includes('a') && updates.includes('b'));
});

console.log(`\n${n}개 항목 통과`);
