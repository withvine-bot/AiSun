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
const U = AiSun.util;
let pass = 0, fail = 0;
const ok = (cond, label, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra ? '  → ' + extra : '')); }
};
const boot = () => {
  AiSun.store.load();
  AiSun.curriculum.init(AISUN_DATA);
  AiSun.quiz.init(AISUN_DATA);
};

console.log('\n■ 부트');
boot();
const C = AiSun.curriculum;
const deck = C.deck;
ok(deck.all.length > 6000, `카드 덱 ${deck.all.length}장 생성`);
ok(deck.all.length === new Set(deck.all.map((c) => c.id)).size, '카드 id 중복 없음');

console.log('\n■ 원본 데이터');
ok(AISUN_DATA.hanja.length === 3500, `배정한자 3,500자 (${AISUN_DATA.hanja.length})`);
ok(AISUN_DATA.radicals.length === 214, `강희부수 214자 (${AISUN_DATA.radicals.length})`);
ok(AISUN_DATA.levels.length === 13, `급수 규격 13개 (${AISUN_DATA.levels.length})`);
{
  const CUM = { '8': 50, '7II': 100, '7': 150, '6II': 225, '6': 300, '5II': 400, '5': 500,
    '4II': 750, '4': 1000, '3II': 1500, '3': 1817, '2': 2355, '1': 3500 };
  const byLv = {};
  for (const h of AISUN_DATA.hanja) byLv[h.lv] = (byLv[h.lv] || 0) + 1;
  let run = 0, good = true, msg = '';
  for (const l of AISUN_DATA.levels) {
    run += byLv[l.lv] || 0;
    if (run !== CUM[l.lv]) { good = false; msg = `${l.label} 누계 ${run} ≠ ${CUM[l.lv]}`; break; }
    if (run !== l.read) { good = false; msg = `${l.label} 규격 read ${l.read} ≠ 실제 누계 ${run}`; break; }
  }
  ok(good, '급수 누계가 공식 배정 및 규격 파일과 모두 일치 (3급 1,817 / 2급 2,355 / 1급 3,500)', msg);
  const bad = AISUN_DATA.levels.filter((l) => l.types.reduce((s, t) => s + t.n, 0) !== l.items);
  ok(bad.length === 0, '급수마다 유형별 문항 합계 = 총 문항수', bad.map((l) => l.label).join(','));
  ok(AISUN_DATA.levels.every((l) => l.passItems === Math.ceil(l.items * l.pass / 100)), '합격 문항수 계산 일치');
  const one = AISUN_DATA.levels[12];
  ok(one.items === 200 && one.passItems === 160 && one.minutes === 90,
    `1급 = 200문항 / 160문항 합격 / 90분 (${one.items}·${one.passItems}·${one.minutes})`);
}
{
  const compat = AISUN_DATA.hanja.filter((h) => h.c.codePointAt(0) >= 0xF900 && h.c.codePointAt(0) <= 0xFAFF);
  ok(compat.length === 0, '호환 한자 없이 통합 코드로 정규화됨', compat.map((h) => h.c).join(''));
  const gold = AISUN_DATA.hanja.find((h) => h.c === '金');
  ok(!!gold && gold.lv === '8' && gold.words.length > 0,
    `金이 8급으로 정상 수록되고 어휘가 연결됨 (${gold ? gold.words.map((w) => w.w).join(',') : '없음'})`);
}
{
  const noEx = AISUN_DATA.radicals.filter((r) => !r.examples.length).length;
  ok(noEx <= 10, `부수마다 배정한자 용례가 붙음 (용례 없는 부수 ${noEx}자)`);
  const water = AISUN_DATA.radicals.find((r) => r.c === '水');
  ok(water && water.variants.includes('氵'), `부수 변형 수록 (水 → ${water ? water.variants.join(' ') : '?'})`);
}

console.log('\n■ 사다리 구조');
const order = C.order();
ok(order[0] === 'radical' && order.length === 14, `단계 14칸: 부수 + 급수 13 (${order.join(' → ')})`);
ok(C.byStage.get('radical').length === 214, `부수 단계 214장 (${C.byStage.get('radical').length})`);
{
  const s8 = C.byStage.get('8');
  ok(s8.length === 50 && s8.every((c) => c.track === 'read'),
    `8급 단계는 읽기 50장, 쓰기 없음 (${s8.length}장)`);
  const w6II = C.byStage.get('6II').filter((c) => c.track === 'write');
  ok(w6II.length === 50, `6급Ⅱ에서 쓰기 50자 시작 = 8급 배정 (${w6II.length}장)`);
  const allWrite = deck.all.filter((c) => c.track === 'write').length;
  ok(allWrite === 2005, `쓰기 카드 총계 2,005장 = 1급 쓰기 배정 (${allWrite})`);
  const covered = deck.all.every((c) => order.includes(c.stage));
  ok(covered, '모든 카드가 어느 단계엔가 배정됨');
}
{
  // 하위 단계에 상위 급수 한자가 섞이면 안 된다
  let leak = null;
  for (const s of C.stages) {
    if (s.key === 'radical') continue;
    const si = C.stageIndex(s.key);
    for (const c of s.cards) {
      if (c.kind !== 'hanja') continue;
      if (C.stageIndex(c.ref.lv) > si) { leak = `${s.key} 단계에 ${c.ref.lv}급 ${c.ref.c}`; break; }
    }
    if (leak) break;
  }
  ok(!leak, '단계마다 그 급수까지의 한자만 배정됨', leak);
}
{
  const sizes = order.slice(1).map((k) => C.scope(k).length);
  const rising = sizes.every((v, i) => i === 0 || v > sizes[i - 1]);
  ok(rising, `출제 범위가 급수마다 넓어짐 (8급 ${sizes[0]}장 → 1급 ${sizes[sizes.length - 1]}장)`);
}

console.log('\n■ 급수별 모의고사');
for (const l of AISUN_DATA.levels) {
  const ex = AiSun.exam.build(l.lv, { seed: 'test-' + l.lv });
  const inScope = new Set(C.scope(l.lv));
  const outOfScope = ex.items.filter((q) => q.cardId && !inScope.has(q.cardId)).length;
  const good = ex.items.length === l.items && outOfScope === 0
    && ex.passItems === l.passItems && ex.minutes === l.minutes;
  ok(good, `${l.label}: ${ex.items.length}/${l.items}문항 · 합격 ${ex.passItems} · ${ex.minutes}분` +
    (ex.shortfall.length ? ` · 대체 ${ex.shortfall.map((s) => s.type + s.missing).join(',')}` : ''),
    outOfScope ? `범위 밖 문항 ${outOfScope}개` : '문항수 또는 규격 불일치');
}
{
  const ex = AiSun.exam.build('8', { seed: 'scope' });
  const lv8 = new Set(AISUN_DATA.hanja.filter((h) => h.lv === '8').map((h) => h.c));
  const bad = ex.items.filter((q) => q.stem && [...q.stem].some((ch) => ch >= '一' && ch <= '鿿' && !lv8.has(ch)));
  ok(bad.length === 0, '8급 시험 지문에 8급 밖 한자가 없음', bad.slice(0, 3).map((q) => q.stem).join(' '));
  const perfect = ex.items.map((q) => q.answer);
  const r = AiSun.exam.grade(ex, perfect, { applySrs: false });
  ok(r.correct === 50 && r.pass, `8급 전 문항 정답 → ${r.correct}/50 합격`);
}
{
  const one = AiSun.exam.build('1', { seed: 'one' });
  const answers = one.items.map((q, i) => (i % 10 < 8 ? q.answer : '틀린답'));
  const r = AiSun.exam.grade(one, answers, { applySrs: false });
  ok(r.correct === 160 && r.pass, `1급 80% 정답 → ${r.correct}/200, 합격선 160 통과`);
  const answers2 = one.items.map((q, i) => (i % 100 < 79 ? q.answer : '틀린답'));
  const r2 = AiSun.exam.grade(one, answers2, { applySrs: false });
  ok(!r2.pass, `1급 79% 정답 → ${r2.correct}/200, 불합격 (합격선 80%)`);
  const three = AiSun.exam.build('3', { seed: 'three' });
  const a3 = three.items.map((q, i) => (i % 100 < 71 ? q.answer : 'x'));
  const r3 = AiSun.exam.grade(three, a3, { applySrs: false });
  ok(r3.pass, `3급 71% 정답 → 합격 (합격선 70%)`);
}
{
  const rad = AiSun.exam.build('radical', { seed: 'rad' });
  ok(rad.items.length === 60 && rad.items.every((q) => ['부수훈음', '부수찾기', '획수'].includes(q.type)),
    `부수 졸업 시험 60문항, 부수 유형만 출제 (${rad.items.length})`);
}

console.log('\n■ 문항 생성 (전 유형)');
for (const t of C.allTypes().concat(['부수훈음', '부수찾기'])) {
  const qs = AiSun.quiz.byType(t, 10, { rand: U.rng('gen-' + t), forceChoice: true });
  const good = qs.length === 10 && qs.every((q) => q.answer && q.choices
    && q.choices.filter((c) => U.norm(c) === U.norm(q.answer)).length === 1);
  ok(good, `${t}: 10문항, 정답 정확히 1개 포함 (${qs.length})`);
}

console.log('\n■ 관문과 진행');
AiSun.store.reset(); boot();
AiSun.store.state.settings.startStage = 'radical';
ok(C.currentStage() === 'radical', `처음에는 부수 단계부터 (${C.currentStage()})`);
{
  // 부수 카드를 90% 학습시키면 학습 관문은 채워지고, 시험 관문은 아직이다
  const radCards = C.byStage.get('radical');
  radCards.slice(0, 200).forEach((c) => AiSun.srs.review(c.id, AiSun.GRADE.GOOD, { type: '부수훈음' }));
  let g = C.gate('radical');
  ok(g.learned && !g.tested, `학습 ${g.learnedPct}% 달성, 시험 관문은 아직 (합격 ${g.passes}/${g.passesNeeded})`);
  ok(C.currentStage() === 'radical', '관문을 못 넘으면 다음 칸으로 안 간다');

  const rad = AiSun.exam.build('radical', { seed: 'g1', kind: 'gate' });
  const r = AiSun.exam.grade(rad, rad.items.map((q) => q.answer));
  ok(r.pass && r.cleared.includes('radical'), `부수 시험 합격 → 단계 통과 (${r.correct}/${r.total})`);
  ok(C.currentStage() === '8', `다음 칸이 열림 → ${C.label(C.currentStage())}`);
}
{
  // 8급은 시험을 두 번 통과해야 열린다
  C.byStage.get('8').forEach((c) => AiSun.srs.review(c.id, AiSun.GRADE.GOOD, { type: '독음' }));
  const ex1 = AiSun.exam.build('8', { seed: 'a', kind: 'gate' });
  AiSun.exam.grade(ex1, ex1.items.map((q) => q.answer));
  ok(C.currentStage() === '8', '한 번 합격으로는 넘어가지 않는다');
  const ex2 = AiSun.exam.build('8', { seed: 'b', kind: 'gate' });
  const r2 = AiSun.exam.grade(ex2, ex2.items.map((q) => q.answer));
  ok(r2.cleared.includes('8') && C.currentStage() === '7II',
    `두 번째 합격에 통과 → ${C.label(C.currentStage())}`);
}

console.log('\n■ 오늘의 계획');
{
  const p = C.plan();
  ok(p.stageKey === '7II', `현재 단계 ${C.label(p.stageKey)}`);
  ok(p.newCards.length > 0 && p.newCards.length <= AiSun.store.state.settings.dailyNew,
    `신규 배정이 하루 목표를 넘지 않음 (${p.newCards.length} ≤ ${AiSun.store.state.settings.dailyNew})`);
  ok(p.newCards.every((c) => c.stage === '7II'), '신규는 현재 단계 카드만');
  const types = new Set();
  for (let d = 0; d < 7; d++) C.drillTypes('1', d).forEach((t) => types.add(t));
  const oneTypes = C.spec('1').types.map((t) => t.k);
  ok(oneTypes.every((t) => types.has(t)), '한 주에 그 급수의 모든 출제 유형이 드릴에 나옴',
    oneTypes.filter((t) => !types.has(t)).join(','));
  const d8 = C.drillTypes('8', 1);
  ok(d8.every((t) => ['독음', '훈음'].includes(t)), `8급 드릴은 8급 출제 유형만 (${d8.join(',')})`);
}

console.log('\n■ 로드맵과 기간 추정');
{
  AiSun.store.reset(); boot();
  const st = AiSun.store.state;
  st.settings.startStage = 'radical'; st.settings.targetLevel = '1';
  st.settings.dailyNew = 20;
  const r20 = C.roadmap();
  st.settings.dailyNew = 40;
  const r40 = C.roadmap();
  ok(r20.totalWeeks > r40.totalWeeks,
    `속도를 올리면 기간이 준다: 20장/일 ${r20.totalMonths}개월 → 40장/일 ${r40.totalMonths}개월`);
  ok(r20.totalMonths > 12, `부수부터 1급까지는 하루 20장이면 ${r20.totalMonths}개월 — 6개월로는 안 된다`);
  ok(r20.rows.length === 14 && r20.rows.every((x) => x.inPath), '로드맵이 14칸 전부를 경로에 포함');
  st.settings.startStage = '3';
  const r3 = C.roadmap();
  ok(r3.rows.filter((x) => x.inPath).length === 3,
    `3급 보유자로 시작하면 남은 칸은 3칸 (${r3.rows.filter((x) => x.inPath).map((x) => x.label).join(' → ')})`);
  ok(r3.totalWeeks < r20.totalWeeks, `그만큼 기간도 준다 (${r3.totalMonths}개월)`);
}

console.log('\n■ 예상 점수');
{
  AiSun.store.reset(); boot();
  const st = AiSun.store.state;
  st.settings.startStage = '5';
  for (const t of C.spec('5').types) {
    for (let i = 0; i < 10; i++) AiSun.srs._log(t.k, i < 9);   // 전 유형 90%
  }
  const pj = C.projectedScore('5');
  ok(pj.projected >= 88 && pj.projected <= 92, `5급 전 유형 90% → 예상 ${pj.projected}/100문항`);
  ok(pj.pass, '5급 합격선(70%) 통과 판정');
  ok(pj.covered === 100, '표본이 전 유형에 있으면 신뢰도 100%');
  AiSun.store.reset(); boot();
  ok(C.projectedScore('5').projected === null, '기록이 없으면 예상 점수를 내지 않음');
}

console.log('\n■ 간격반복(SRS)');
{
  AiSun.store.reset(); boot();
  const cid = deck.all[0].id;
  const G = AiSun.GRADE;
  let last = null;
  for (let i = 0; i < 5; i++) last = AiSun.srs.review(cid, G.GOOD, { type: '부수훈음' });
  ok(last.ivl >= 10, `연속 정답 5회 후 간격 ${last.ivl}일로 확장`);
  const before = AiSun.srs.get(cid).ivl;
  AiSun.srs.review(cid, G.AGAIN, { type: '부수훈음' });
  ok(AiSun.srs.get(cid).due === U.today(), '오답 시 당일 재출제로 되돌림');
  ok(AiSun.srs.get(cid).ivl < before, '오답 시 간격 축소');
  ok(!!AiSun.store.state.wrong[cid], '오답노트 자동 편입');
  for (let i = 0; i < AiSun.srs.LEECH_AT; i++) AiSun.srs.review(cid, G.AGAIN, { type: '부수훈음' });
  ok(AiSun.srs.isLeech(cid), '반복 실패 카드는 고질(leech)로 표시');

  const wcard = deck.all.find((c) => c.track === 'write');
  AiSun.store.reset();
  for (let i = 0; i < 5; i++) AiSun.srs.review(wcard.id, G.GOOD, { type: '한자쓰기', write: true });
  const wIvl = AiSun.srs.get(wcard.id).ivl;
  AiSun.store.reset();
  for (let i = 0; i < 5; i++) AiSun.srs.review(cid, G.GOOD, { type: '훈음', write: false });
  ok(wIvl < AiSun.srs.get(cid).ivl, `쓰기 트랙 간격이 읽기보다 짧음 (${wIvl} < ${AiSun.srs.get(cid).ivl})`);
}

console.log('\n■ 저장 · 백업');
{
  AiSun.store.reset(); boot();
  AiSun.srs.review(deck.all[0].id, AiSun.GRADE.GOOD, { type: '부수훈음' });
  AiSun.store.state.stages['radical'] = { cleared: true, clearedAt: U.today() };
  const dump = AiSun.store.export();
  AiSun.store.reset();
  ok(Object.keys(AiSun.store.state.srs).length === 0, '초기화 동작');
  AiSun.store.import(dump);
  ok(!!AiSun.store.state.srs[deck.all[0].id], '백업 복원 동작');
  ok(AiSun.store.state.stages.radical.cleared === true, '단계 통과 기록도 함께 복원');
  let threw = false;
  try { AiSun.store.import('{"nope":1}'); } catch (e) { threw = true; }
  ok(threw, '잘못된 백업 파일은 거부');
}

console.log(`\n결과: ${pass}건 통과, ${fail}건 실패\n`);
process.exit(fail ? 1 : 0);
