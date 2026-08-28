#!/usr/bin/env node
/**
 * DOM 없이 엔진(core/curriculum/quiz/exam)만 검증한다.
 * `node tools/selftest.mjs`
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// 최소한의 브라우저 흉내 — localStorage 와 window 만 있으면 엔진은 돈다
const memory = new Map();
const sandbox = {
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  localStorage: {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, String(v)),
    removeItem: (k) => memory.delete(k),
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const f of ['assets/data/corpus.js', 'assets/js/core.js', 'assets/js/curriculum.js',
                 'assets/js/quiz.js', 'assets/js/exam.js']) {
  vm.runInContext(readFileSync(resolve(ROOT, f), 'utf8'), sandbox, { filename: f });
}

const { AiSun, AISUN_DATA } = sandbox;
let pass = 0, fail = 0;
const ok = (cond, label, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra ? '  → ' + extra : '')); }
};

console.log('\n■ 부트');
AiSun.store.load();
AiSun.curriculum.init(AISUN_DATA);
AiSun.quiz.init(AISUN_DATA);
const deck = AiSun.curriculum.deck;
ok(deck.all.length > 900, `카드 덱 ${deck.all.length}장 생성`);
ok(deck.all.length === new Set(deck.all.map((c) => c.id)).size, '카드 id 중복 없음');

console.log('\n■ 급수 체계');
const byLv = {};
for (const h of AISUN_DATA.hanja) byLv[h.lv] = (byLv[h.lv] || 0) + 1;
ok(AISUN_DATA.hanja.length === 3500, `배정한자 3,500자 (${AISUN_DATA.hanja.length})`);
const CUM = { '8': 50, '7II': 100, '7': 150, '6II': 225, '6': 300, '5II': 400, '5': 500,
  '4II': 750, '4': 1000, '3II': 1500, '3': 1817, '2': 2355, '1': 3500 };
let run = 0, cumOk = true, cumMsg = '';
for (const lv of AiSun.LEVELS) {
  run += byLv[lv] || 0;
  if (run !== CUM[lv]) { cumOk = false; cumMsg = `${lv}급 누계 ${run} ≠ ${CUM[lv]}`; break; }
}
ok(cumOk, '급수별 누계가 한국어문회 공식 배정과 일치 (3급 1,817 / 2급 2,355 / 1급 3,500)', cumMsg);
const wt = AISUN_DATA.hanja.filter((h) => h.wtier === 1).length;
ok(wt === 1817, `쓰기 확정 대상 1,817자 = 3급까지 누계 (${wt})`);
ok(AISUN_DATA.hanja.filter((h) => h.wtier === 2).length === 538, '쓰기 확장 대상 538자 = 2급');
ok(AISUN_DATA.hanja.every((h) => h.rad), '전 한자에 부수 수록');
ok(AISUN_DATA.hanja.every((h) => h.str > 0), '전 한자에 총획 수록');
const noWords = AISUN_DATA.hanja.filter((h) => !h.words.length).length;
ok(noWords < 120, `대표 어휘가 없는 한자 ${noWords}자 (독음·쓰기 문항 재료 없음)`);

console.log('\n■ 26주 커리큘럼');
let assigned = 0;
const seen = new Set();
for (let w = 1; w <= AiSun.curriculum.NEW_WEEKS; w++) {
  const items = AiSun.curriculum.weekNew(w);
  assigned += items.length;
  for (const c of items) {
    if (seen.has(c.id)) { fail++; console.log('  ✗ 주차 배정 중복: ' + c.id); }
    seen.add(c.id);
  }
}
ok(assigned === AiSun.curriculum.assignable.length,
  `18주 배정 합계 ${assigned} = 배정 대상 ${AiSun.curriculum.assignable.length} (덱 전체 ${deck.all.length})`);

console.log('\n■ 기지 급수 건너뛰기');
const loadNone = AiSun.curriculum.load('');
const load4 = AiSun.curriculum.load('4');
const load2 = AiSun.curriculum.load('2');
ok(loadNone.total > load4.total && load4.total > load2.total,
  `아는 급수가 높을수록 배정이 준다: 없음 ${loadNone.total} > 4급 ${load4.total} > 2급 ${load2.total}`);
ok(loadNone.total === deck.all.length, `제외 없음이면 덱 전체와 같다 (${loadNone.total})`);
AiSun.store.state.settings.knownLevel = '2';
AiSun.curriculum.refresh();
const skipped = AiSun.curriculum.assignable
  .filter((c) => c.kind === 'hanja' && AiSun.curriculum.levelIdx(c.ref.lv) <= AiSun.curriculum.levelIdx('2'));
ok(skipped.length === 0, '2급까지 안다고 설정하면 그 이하 한자는 배정되지 않는다');
ok(AiSun.curriculum.assignable.every((c) => c.kind !== 'hanja' || c.ref.lv === '1'),
  '남는 한자는 1급뿐');
const stillDrillable = AiSun.quiz.byType('훈음', 20, { rand: AiSun.util.rng('skip') });
ok(stillDrillable.length === 20, '제외한 급수도 드릴·모의고사 출제 범위에는 남는다');
AiSun.store.state.settings.knownLevel = '4';
AiSun.curriculum.refresh();
ok(AiSun.curriculum.weekNew(19).length === 0, '19주차부터 신규 배정 없음');
const w1 = AiSun.curriculum.weekSummary(1);
ok(w1.writeCount > 0, `1주차에 쓰기 카드 ${w1.writeCount}장 포함 (1단계 설계대로)`);
const w12 = AiSun.curriculum.weekSummary(12);
ok(w12.newCount > 0 && w12.phase.no === 2, `12주차는 2단계, 신규 ${w12.newCount}장`);

console.log('\n■ 일일 계획');
const start = AiSun.store.state.settings.startDate;
let daysWithNew = 0, restDays = 0, tests = 0;
for (let d = 0; d < 182; d++) {
  const date = AiSun.util.addDays(start, d);
  const p = AiSun.curriculum.plan(date);
  if (p.newCards.length) daysWithNew++;
  if (p.isRestDay) restDays++;
  if (p.test) tests++;
  if (p.week <= 18 && [1, 2, 3, 4, 5].includes(p.dow)) {
    if (!p.drill.length) { fail++; console.log('  ✗ 평일인데 드릴 초점 없음: ' + date); }
  }
}
ok(daysWithNew > 60, `신규 학습일 ${daysWithNew}일`);
ok(restDays >= 18, `일요일 정리일 ${restDays}일`);
ok(tests >= 26, `테스트 배치 ${tests}회`);

// 한 주 안에서 11개 유형이 모두 한 번은 드릴 초점이 되는지
const weekTypes = new Set();
for (let d = 0; d < 7; d++) {
  const p = AiSun.curriculum.plan(AiSun.util.addDays(start, 7 * 3 + d));
  p.drill.forEach((t) => weekTypes.add(t));
}
const missing = AiSun.TYPES.map((t) => t.k).filter((k) => !weekTypes.has(k));
ok(missing.length === 0, '한 주에 11개 유형 모두 드릴 초점에 포함', missing.join(','));

console.log('\n■ 문항 생성 (11개 유형)');
const rand = AiSun.util.rng('selftest');
for (const t of AiSun.TYPES) {
  const qs = AiSun.quiz.byType(t.k, t.n, { rand, forceChoice: true });
  const good = qs.length === t.n
    && qs.every((q) => q.answer && q.choices && q.choices.length >= 2
      && q.choices.filter((c) => AiSun.util.norm(c) === AiSun.util.norm(q.answer)).length === 1);
  ok(good, `${t.k}: ${qs.length}/${t.n}문항, 정답 정확히 1개 포함`,
    qs.length !== t.n ? '문항 수 부족' : '보기 구성 오류');
}

console.log('\n■ 훈음 대체 정답');
{
  const withAlts = AISUN_DATA.hanja.find((h) => h.alts && h.alts.length);
  const card = deck.byId.get('h:' + withAlts.c + '#read');
  const q = AiSun.quiz.make('훈음', card, AiSun.util.rng('alt'));
  ok(AiSun.quiz.check(q, `${withAlts.hun} ${withAlts.eum}`), `대표훈 정답 인정 (${withAlts.c}: ${withAlts.hun} ${withAlts.eum})`);
  ok(AiSun.quiz.check(q, withAlts.alts[0]), `통용훈도 정답 인정 (${withAlts.alts[0]})`);
  ok(!AiSun.quiz.check(q, '아무말 앙'), '틀린 답은 인정하지 않음');
  ok(AISUN_DATA.hanja.filter((h) => h.alts && h.alts.length).length > 1000,
    `통용훈이 수록된 한자 ${AISUN_DATA.hanja.filter((h) => h.alts && h.alts.length).length}자`);
}

console.log('\n■ 모의고사');
const mock = AiSun.exam.build(200, { seed: 'test' });
ok(mock.items.length === 200, `200문항 조립 (${mock.items.length})`);
const specSum = {};
mock.items.forEach((q) => { specSum[q.type] = (specSum[q.type] || 0) + 1; });
const specOk = AiSun.TYPES.every((t) => specSum[t.k] === t.n);
ok(specOk, '유형별 문항 수가 공식 배점과 일치', JSON.stringify(specSum));
ok(mock.items.every((q, i) => q.no === i + 1), '문항 번호 1~200 연속');
const order = mock.items.map((q) => AiSun.TYPES.findIndex((t) => t.k === q.type));
ok(order.every((v, i) => i === 0 || v >= order[i - 1]), '시험지 유형 순서대로 정렬');

const perfect = mock.items.map((q) => q.answer);
const r1 = AiSun.exam.grade(mock, perfect, { applySrs: false });
ok(r1.score === 200 && r1.pass, `전 문항 정답 시 200점 (${r1.score})`);

const mock2 = AiSun.exam.build(200, { seed: 'test2' });
const half = mock2.items.map((q, i) => (i % 10 < 8 ? q.answer : '틀린답'));
const r2 = AiSun.exam.grade(mock2, half);
ok(r2.score === 160 && r2.pass, `80% 정답 시 정확히 합격선 160점 (${r2.score})`);
ok(AiSun.exam.weakness(r2).length > 0, '약점 분석 산출');

const mini = AiSun.exam.build(100, { seed: 'm' });
ok(mini.items.length === 100, `100문항 축소 조립 (${mini.items.length})`);

console.log('\n■ 간격반복(SRS)');
const cid = deck.all[0].id;
AiSun.store.reset();
const G = AiSun.GRADE;
let last = null;
for (let i = 0; i < 5; i++) last = AiSun.srs.review(cid, G.GOOD, { type: '훈음' });
ok(last.ivl >= 10, `연속 정답 5회 후 간격 ${last.ivl}일로 확장`);
const before = AiSun.srs.get(cid).ivl;
AiSun.srs.review(cid, G.AGAIN, { type: '훈음' });
ok(AiSun.srs.get(cid).due === AiSun.util.today(), '오답 시 당일 재출제로 되돌림');
ok(AiSun.srs.get(cid).ivl < before, '오답 시 간격 축소');
ok(!!AiSun.store.state.wrong[cid], '오답노트 자동 편입');
for (let i = 0; i < AiSun.srs.LEECH_AT; i++) AiSun.srs.review(cid, G.AGAIN, { type: '훈음' });
ok(AiSun.srs.isLeech(cid), '반복 실패 카드는 고질(leech)로 표시');

const wcard = deck.all.find((c) => c.track === 'write');
AiSun.store.reset();
for (let i = 0; i < 5; i++) AiSun.srs.review(wcard.id, G.GOOD, { type: '한자쓰기', write: true });
const wIvl = AiSun.srs.get(wcard.id).ivl;
AiSun.store.reset();
for (let i = 0; i < 5; i++) AiSun.srs.review(cid, G.GOOD, { type: '훈음', write: false });
ok(wIvl < AiSun.srs.get(cid).ivl, `쓰기 트랙 간격이 읽기보다 짧음 (${wIvl} < ${AiSun.srs.get(cid).ivl})`);

console.log('\n■ 예상 점수 · 진도');
AiSun.store.reset();
for (const t of AiSun.TYPES) {
  for (let i = 0; i < 10; i++) AiSun.srs._log(t.k, i < 9);   // 모든 유형 90%
}
const proj = AiSun.curriculum.projectedScore();
ok(proj.projected >= 175 && proj.projected <= 185, `전 유형 90% → 예상 ${proj.projected}점`);
ok(proj.covered === 100, '표본이 전 유형에 있으면 신뢰도 100%');
ok(proj.pass, '합격 판정');
AiSun.store.reset();
ok(AiSun.curriculum.projectedScore().projected === null, '기록이 없으면 예상 점수는 산출하지 않음');

console.log('\n■ 저장 · 백업');
AiSun.srs.review(cid, G.GOOD, { type: '독음' });
const dump = AiSun.store.export();
AiSun.store.reset();
ok(Object.keys(AiSun.store.state.srs).length === 0, '초기화 동작');
AiSun.store.import(dump);
ok(!!AiSun.store.state.srs[cid], '백업 복원 동작');
let threw = false;
try { AiSun.store.import('{"nope":1}'); } catch (e) { threw = true; }
ok(threw, '잘못된 백업 파일은 거부');

console.log(`\n결과: ${pass}건 통과, ${fail}건 실패\n`);
process.exit(fail ? 1 : 0);
