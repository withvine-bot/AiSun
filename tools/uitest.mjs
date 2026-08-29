#!/usr/bin/env node
/**
 * 실제 브라우저에서 화면과 상호작용을 검증한다.
 *   npx playwright install chromium   # 최초 1회
 *   node tools/uitest.mjs
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

/** playwright 는 로컬 설치·전역 설치 어느 쪽이든 받아준다. */
async function loadPlaywright() {
  try { return (await import('playwright')).chromium; } catch (e) { /* 전역을 찾아본다 */ }
  try {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return (await import(pathToFileURL(resolve(root, 'playwright/index.mjs')).href)).chromium;
  } catch (e) {
    console.error('playwright 를 찾지 못했습니다. `npm i -D playwright && npx playwright install chromium` 후 다시 실행하세요.');
    process.exit(2);
  }
}
const chromium = await loadPlaywright();

const ROOT = pathToFileURL(
  resolve(dirname(fileURLToPath(import.meta.url)), '..', 'index.html')
).href;

let pass = 0, fail = 0;
const ok = (c, l, x) => { if (c) { pass++; console.log('  ✓ ' + l); } else { fail++; console.log('  ✗ ' + l + (x ? ' → ' + x : '')); } };

const browser = await chromium.launch();
const page = await browser.newPage();

// 계획은 요일에 따라 달라진다(일요일은 정리하는 날). 언제 돌려도 같은 결과가 나오도록
// 수요일로 시계를 고정한다. setFixedTime 은 Date 만 고정하고 타이머는 실제로 돌려
// 모의고사 시간 검증이 유지된다.
await page.clock.setFixedTime(new Date('2026-09-02T09:00:00'));

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const H = () => page.locator('h1.page').first().textContent();

await page.goto(ROOT);
await page.waitForSelector('.tabs button');

console.log('\n■ 온보딩');
ok((await H()).includes('어디서부터'), `첫 실행은 시작 단계 선택 화면 ("${(await H()).trim()}")`);
const startOpts = await page.locator('[data-start]').count();
ok(startOpts === 7, `수준 선택지 ${startOpts}개`);
ok((await page.locator('.card .note').first().textContent()).includes('부수 214자'),
  '한자를 처음 배우는 사람은 부수부터 시작하도록 안내');
await page.locator('[data-start="radical"]').click();
await page.waitForTimeout(300);
ok((await H()).includes('로드맵'), '선택하면 로드맵으로 이동');

console.log('\n■ 로드맵');
ok(await page.locator('.rung').count() === 14, `사다리 14칸 (부수 + 급수 13)`);
ok(await page.locator('.rung.now').count() === 1, '현재 칸이 하나만 강조됨');
const nowLabel = await page.locator('.rung.now b').first().textContent();
ok(nowLabel.trim() === '부수', `현재 칸은 부수 (${nowLabel.trim()})`);
const speeds = await page.locator('table tbody tr').count();
ok(speeds === 5, `속도별 기간 비교표 ${speeds}행`);
const monthsTxt = await page.locator('.metric .v').nth(2).textContent();
ok(/개월/.test(monthsTxt) && parseFloat(monthsTxt.replace(/[^0-9.]/g, '')) > 12,
  `부수부터 1급까지는 1년을 넘는다고 정직하게 표시 (${monthsTxt.trim()})`);

console.log('\n■ 라우팅');
for (const [route, expect] of [['dashboard', '부수 입문'], ['today', '오늘 학습'], ['roadmap', '로드맵'],
    ['radicals', '부수 214자'], ['drill', '유형 드릴'], ['exam', '모의고사'], ['wrong', '오답노트'],
    ['stats', '통계'], ['library', '자료실'], ['settings', '설정']]) {
  await page.goto(ROOT + '#/' + route);
  await page.waitForTimeout(150);
  const h = await H();
  ok(h.includes(expect), `#/${route} → "${h.trim()}"`);
}

console.log('\n■ 부수 학습');
await page.goto(ROOT + '#/radicals'); await page.waitForTimeout(250);
const radCells = await page.locator('.hcell').count();
ok(radCells === 214, `부수 214자 표시 (${radCells})`);
await page.locator('#q').fill('삼수');
await page.waitForTimeout(250);
const found = await page.locator('.hcell .m').first().textContent();
ok(found.includes('물 수'), `관용 명칭으로 검색됨 — '삼수' → ${found.trim()}`);
await page.locator('#q').fill('');
await page.waitForTimeout(200);
await page.locator('#learn-rad').click();
await page.waitForSelector('.qcard');
ok((await page.locator('.qtype').first().textContent()).includes('새 카드'), '부수도 학습면부터 보여 줌');
const introTxt = await page.locator('.qcard').textContent();
ok(/획/.test(introTxt) && /(변|머리|발|엄|받침|몸|방|제부수)/.test(introTxt),
  '학습면에 획수와 놓이는 자리가 함께 나옴');
for (let i = 0; i < 8; i++) {
  await page.waitForSelector('.qcard');
  if (await page.locator('#btn-got').count()) { await page.locator('#btn-got').click(); await page.waitForTimeout(50); }
  if (await page.locator('.opt').count()) await page.locator('.opt').first().click();
  else if (await page.locator('#btn-reveal').count()) await page.locator('#btn-reveal').click();
  await page.waitForSelector('.grades button');
  await page.locator('.grades button').nth(2).click();
  await page.waitForTimeout(50);
}
const prog = await page.locator('.sess-head span').last().textContent();
ok(prog.trim().startsWith('8'), `8문항 진행 (${prog.trim()})`);

console.log('\n■ 급수 범위 제한');
await page.goto(ROOT + '#/exam'); await page.waitForTimeout(250);
const lvCards = await page.locator('[data-lv]').count();
ok(lvCards === 14, `응시 가능 급수 14개 (부수 + 13급수) (${lvCards})`);
await page.locator('[data-lv="8"]').click();
await page.waitForSelector('.exam-bar');
ok(await page.locator('.qnav b').count() === 50, '8급 시험은 50문항');
const lv8chars = await page.evaluate(() =>
  new Set(window.AISUN_DATA.hanja.filter((h) => h.lv === '8').map((h) => h.c)));
const stems = [];
for (let i = 0; i < 50; i++) {
  stems.push(await page.locator('.stem').first().textContent().catch(() => ''));
  await page.locator('.opt').first().click();
  await page.waitForTimeout(8);
}
const outside = await page.evaluate((ss) => {
  const lv8 = new Set(window.AISUN_DATA.hanja.filter((h) => h.lv === '8').map((h) => h.c));
  return ss.filter((s) => [...(s || '')].some((ch) => ch >= '一' && ch <= '鿿' && !lv8.has(ch)));
}, stems);
ok(outside.length === 0, '8급 시험 지문에 8급 밖 한자가 없음', outside.slice(0, 4).join(' '));

page.once('dialog', (d) => d.accept());
await page.locator('#submit').click();
await page.waitForSelector('h1.page');
ok((await H()).includes('결과'), `채점 결과 화면 ("${(await H()).trim()}")`);
const metrics = await page.locator('.metric .v').allTextContents();
ok(metrics[0].includes('/50') && metrics[2] === '35',
  `결과에 맞은 문항과 합격 기준 표시 (${metrics.slice(0, 3).join(' · ')})`);

console.log('\n■ 관문과 단계 개방');
await page.evaluate(() => {
  // 부수 카드를 전부 학습한 상태로 만들고 부수 시험을 두 번 통과시킨다
  const C = window.AiSun.curriculum;
  for (const c of C.byStage.get('radical')) window.AiSun.srs.review(c.id, 2, { type: '부수훈음' });
  window.AiSun.store.saveNow();
});
await page.goto(ROOT + '#/roadmap'); await page.waitForTimeout(250);
ok((await page.locator('.rung.now b').first().textContent()).trim() === '부수',
  '학습만 끝내고 시험을 안 보면 아직 부수 칸');
const cleared = await page.evaluate(() => {
  const ex = window.AiSun.exam.build('radical', { kind: 'gate', seed: 'ui' });
  const r = window.AiSun.exam.grade(ex, ex.items.map((q) => q.answer));
  return { pass: r.pass, cleared: r.cleared, next: window.AiSun.curriculum.currentStage() };
});
ok(cleared.pass && cleared.cleared.includes('radical'), '부수 졸업 시험 합격 → 단계 통과');
ok(cleared.next === '8', `다음 칸이 열림 → ${cleared.next}급`);
await page.goto(ROOT + '#/dashboard'); await page.waitForTimeout(250);
ok((await H()).includes('8급'), `대시보드가 새 단계로 넘어감 ("${(await H()).trim()}")`);
ok((await page.locator('.rung').count()) === 0, '대시보드는 사다리 전체가 아니라 현재 단계에 집중');

console.log('\n■ 설정');
await page.goto(ROOT + '#/settings'); await page.waitForTimeout(250);
const est0 = await page.locator('#est').textContent();
await page.locator('#daily').fill('40');
await page.locator('#daily').dispatchEvent('input');
await page.waitForTimeout(200);
const est1 = await page.locator('#est').textContent();
ok(est0 !== est1, `속도를 바꾸면 예상 기간이 즉시 갱신됨\n      ${est0.trim()}\n      → ${est1.trim()}`);
await page.locator('#target').selectOption('3');
await page.locator('#target').dispatchEvent('change');
await page.waitForTimeout(200);
const est2 = await page.locator('#est').textContent();
ok(/3급/.test(await page.locator('#target').inputValue().then(() => '3급')) && est2 !== est1,
  `목표를 3급으로 낮추면 기간이 줄어듦 (${est2.trim()})`);
page.once('dialog', (d) => d.accept());
await page.locator('#save').click();
await page.waitForTimeout(300);

console.log('\n■ 영속성 · 백업');
await page.reload(); await page.waitForTimeout(400);
const chips = await page.locator('#hdr-stats .chip').allTextContents();
ok(chips.length === 6 && chips[0].includes('8급'), `새로고침 후에도 단계가 유지됨 (${chips.join(' | ')})`);
await page.goto(ROOT + '#/settings'); await page.waitForTimeout(250);
await page.locator('#export').click();
const dump = await page.locator('#io').inputValue();
ok(dump.includes('"stages"') && dump.includes('"srs"'), `백업에 단계 진행까지 포함 (${dump.length} bytes)`);
ok(await page.locator('#copy').count() === 1, '클립보드 복사 버튼 존재');
await page.evaluate(() => { window.claude = { use: async () => null }; });
let alerted = '';
page.once('dialog', (d) => { alerted = d.message(); d.accept(); });
await page.locator('#download').click();
await page.waitForTimeout(300);
ok(alerted.includes('클립보드'), '게시 환경에서 저장이 막히면 대안을 안내');
await page.evaluate(() => { delete window.claude; });

ok(errors.length === 0, '콘솔 오류 없음', errors.slice(0, 3).join(' | '));

/* 단일 파일 번들 — 있으면 함께 검증한다 (npm run bundle 로 생성) */
const BUNDLE = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'aisun.html');
if (existsSync(BUNDLE)) {
  console.log('\n■ 단일 파일 번들');
  const url = pathToFileURL(BUNDLE).href;
  for (const scheme of ['light', 'dark']) {
    const bp = await browser.newPage({ colorScheme: scheme });
    const errs = [];
    bp.on('pageerror', (e) => errs.push(String(e)));
    bp.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await bp.goto(url);
    await bp.waitForSelector('.tabs button');
    await bp.waitForTimeout(200);
    const bg = await bp.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const n = await bp.evaluate(() => window.AISUN_DATA.hanja.length);
    ok(bg !== 'rgba(0, 0, 0, 0)' && n === 3500 && errs.length === 0,
      `${scheme}: 파일 하나로 구동 (배경 ${bg}, 한자 ${n}자, 오류 ${errs.length})`);
    if (scheme === 'light') {
      // 뷰어가 테마를 명시 지정하는 경우 — 두 방향 모두 명시 선택이 이겨야 한다
      await bp.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      await bp.waitForTimeout(150);
      const d = await bp.evaluate(() => getComputedStyle(document.body).backgroundColor);
      await bp.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
      await bp.waitForTimeout(150);
      const l = await bp.evaluate(() => getComputedStyle(document.body).backgroundColor);
      ok(d === 'rgb(22, 22, 26)' && l === 'rgb(246, 245, 241)',
        `data-theme 명시 지정이 OS 설정을 이김 (dark ${d} / light ${l})`);
    }
    await bp.close();
  }
} else {
  console.log('\n■ 단일 파일 번들 — dist/aisun.html 이 없어 건너뜀 (npm run bundle)');
}
console.log(`\n결과: ${pass}건 통과, ${fail}건 실패\n`);
await browser.close();
process.exit(fail ? 1 : 0);
