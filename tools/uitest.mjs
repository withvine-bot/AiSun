#!/usr/bin/env node
/**
 * 실제 브라우저에서 화면과 상호작용을 검증한다.
 *   npx playwright install chromium   # 최초 1회
 *   node tools/uitest.mjs
 */
import { execSync } from 'node:child_process';
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
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(ROOT);
await page.waitForSelector('.tabs button');

console.log('\n■ 부트 · 라우팅');
ok(await page.locator('#hdr-stats .chip').count() === 6, '헤더 지표 6개 렌더');
const tabs = await page.locator('.tabs button').allTextContents();
ok(tabs.length === 9, `탭 ${tabs.length}개`);

for (const [route, expect] of [['dashboard','대시보드'],['today','오늘 학습'],['plan','26주 합격 플랜'],
    ['drill','유형 드릴'],['exam','모의고사'],['wrong','오답노트'],['stats','통계'],
    ['library','자료실'],['settings','설정']]) {
  await page.goto(ROOT + '#/' + route);
  await page.waitForTimeout(120);
  const h = await page.locator('h1.page').first().textContent();
  ok(h.includes(expect), `#/${route} → "${h.trim()}"`);
}

console.log('\n■ 26주 플랜 표');
await page.goto(ROOT + '#/plan'); await page.waitForTimeout(150);
ok(await page.locator('table tbody tr').count() >= 26, '주차별 배정 26행');

console.log('\n■ 학습 세션 (신규 학습)');
await page.goto(ROOT + '#/today'); await page.waitForTimeout(150);
await page.locator('button[data-act="learn"]').click();
await page.waitForSelector('.qcard');
ok((await page.locator('.qtype').first().textContent()).includes('새 카드'), '신규 카드는 학습면부터 표시');
ok(await page.locator('#btn-got').count() === 1, '학습면에 「익혔습니다」 버튼');
// 학습면 → 문제 → 자기평가 를 6회 반복
for (let i = 0; i < 6; i++) {
  await page.waitForSelector('.qcard');
  if (await page.locator('#btn-got').count()) { await page.locator('#btn-got').click(); await page.waitForTimeout(50); }
  if (await page.locator('.opt').count()) await page.locator('.opt').first().click();
  else if (await page.locator('#btn-reveal').count()) await page.locator('#btn-reveal').click();
  await page.waitForSelector('.grades button');
  await page.locator('.grades button').nth(2).click();   // 맞음
  await page.waitForTimeout(60);
}
const prog = await page.locator('.sess-head span').last().textContent();
ok(prog.trim().startsWith('6'), `6문항 진행됨 (${prog.trim()})`);

console.log('\n■ 키보드 조작');
if (await page.locator('#btn-got').count()) { await page.keyboard.press('Enter'); await page.waitForTimeout(60); }
if (await page.locator('#inp').count()) { await page.keyboard.press('Enter'); }
else if (await page.locator('.opt').count()) { await page.locator('.opt').first().click(); }
else { await page.locator('#btn-reveal').click(); }
await page.waitForSelector('.grades button');
await page.keyboard.press('3');
await page.waitForTimeout(80);
ok(await page.locator('.qcard').count() === 1, '숫자키 자기평가로 다음 문항 진행');

console.log('\n■ 모의고사 (50문항)');
await page.goto(ROOT + '#/exam'); await page.waitForTimeout(150);
await page.locator('button[data-size="50"]').click();
await page.waitForSelector('.exam-bar');
ok(await page.locator('.qnav b').count() === 50, '문항 네비 50칸');
const t0 = await page.locator('#tm').textContent();
await page.waitForTimeout(1600);
const t1 = await page.locator('#tm').textContent();
ok(t0 !== t1, `타이머 동작 ${t0} → ${t1}`);
for (let i = 0; i < 50; i++) {
  await page.locator('.opt').first().click();
  await page.waitForTimeout(15);
}
ok((await page.locator('.qnav b.filled').count()) === 50, '50문항 모두 응답 기록');
page.once('dialog', (d) => d.accept());
await page.locator('#submit').click();
await page.waitForSelector('h1.page');
const rh = await page.locator('h1.page').textContent();
ok(rh.includes('결과'), `채점 결과 화면 (${rh.trim()})`);
ok(await page.locator('.metric .v').count() >= 4, '결과 지표 렌더');

console.log('\n■ 오답노트 · 통계 반영');
await page.goto(ROOT + '#/wrong'); await page.waitForTimeout(150);
const wrongN = parseInt(await page.locator('.metric .v').first().textContent(), 10);
ok(wrongN > 0, `오답 카드 ${wrongN}장 자동 편입`);
await page.goto(ROOT + '#/stats'); await page.waitForTimeout(150);
const proj = await page.locator('.metric .v').first().textContent();
ok(proj.trim() !== '—', `예상 점수 산출 (${proj.trim()})`);

console.log('\n■ 영속성');
await page.reload(); await page.waitForTimeout(250);
const chips = await page.locator('#hdr-stats .chip').allTextContents();
ok(chips.some((c) => /오답 [1-9]/.test(c)), `새로고침 후에도 기록 유지 (${chips.join(' | ')})`);

console.log('\n■ 자료실 검색');
await page.goto(ROOT + '#/library'); await page.waitForTimeout(150);
await page.locator('#q').fill('가혹');
await page.waitForTimeout(200);
ok((await page.locator('.hcell').count()) > 0, '검색 결과 표시');
await page.locator('button[data-tab="idioms"]').click();
await page.waitForTimeout(150);
ok((await page.locator('table tbody tr').count()) > 0, '성어 탭 전환');

console.log('\n■ 자료실 급수 필터');
await page.goto(ROOT + '#/dashboard'); await page.waitForTimeout(150);
await page.goto(ROOT + '#/library'); await page.waitForTimeout(250);
await page.locator('#q').fill('');
await page.waitForTimeout(200);
const allTxt = await page.locator('p.note').first().textContent();
await page.locator('button[data-lv="1"]').click();
await page.waitForTimeout(200);
const lv1Txt = await page.locator('p.note').first().textContent();
ok(lv1Txt.includes('1145'), `1급 필터 → ${lv1Txt.trim()} (전체: ${allTxt.trim()})`);

console.log('\n■ 기지 급수 건너뛰기');
await page.goto(ROOT + '#/settings'); await page.waitForTimeout(200);
const opts = await page.locator('#known option').allTextContents();
ok(opts.length === 13, `기지 급수 선택지 ${opts.length}개 (제외 없음 + 8급~2급)`);
ok(opts.some((o) => o.includes('하루')), `선택지에 일일 부담 표시 — 예) ${opts[1].trim()}`);
const beforeChip = (await page.locator('#hdr-stats .chip').allTextContents()).join('|');
page.once('dialog', (d) => d.accept());
await page.locator('#known').selectOption('2');
await page.locator('#save').click();
await page.waitForTimeout(300);
await page.goto(ROOT + '#/plan'); await page.waitForTimeout(300);
const planTxt = await page.locator('.card .chip').allTextContents();
ok(planTxt.some((t) => t.includes('배정 대상')), `플랜에 배정 대상 표시 (${planTxt.join(' ')})`);
const assignable = parseInt((planTxt.find((t) => t.includes('배정 대상')) || '').replace(/[^0-9]/g, ''), 10);
ok(assignable > 0 && assignable < 3000, `2급까지 안다고 하면 배정이 ${assignable}장으로 줄어듦`);
page.once('dialog', (d) => d.accept());
await page.goto(ROOT + '#/settings'); await page.waitForTimeout(200);
await page.locator('#known').selectOption('4');
await page.locator('#save').click();
await page.waitForTimeout(200);

console.log('\n■ 설정 백업');
await page.goto(ROOT + '#/settings'); await page.waitForTimeout(150);
await page.locator('#export').click();
const dump = await page.locator('#io').inputValue();
ok(dump.length > 100 && dump.includes('"srs"'), `백업 JSON 생성 (${dump.length} bytes)`);

ok(errors.length === 0, '콘솔 오류 없음', errors.slice(0, 3).join(' | '));
console.log(`\n결과: ${pass}건 통과, ${fail}건 실패\n`);
await browser.close();
process.exit(fail ? 1 : 0);
