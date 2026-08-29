#!/usr/bin/env node
/**
 * data/src/*.tsv  ->  assets/data/corpus.js
 *
 * 앱은 file:// 로 열어도 동작해야 하므로 fetch/ES module 대신
 * 전역 변수(window.AISUN_DATA)에 주입하는 클래식 스크립트를 생성한다.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = (n) => resolve(ROOT, 'data/src', n);
const OUT = resolve(ROOT, 'assets/data/corpus.js');

const problems = [];
const warn = (m) => problems.push(m);

/** 주석(#)과 헤더를 걷어내고 탭 분리된 행 배열을 돌려준다. */
function rows(file) {
  const text = readFileSync(SRC(file), 'utf8');
  const out = [];
  let headerSeen = false;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim() || line.startsWith('#')) continue;
    const f = line.split('\t');
    if (!headerSeen) { headerSeen = true; continue; } // 첫 유효 행 = 헤더
    out.push(f.map((s) => s.trim()));
  }
  return out;
}

/** "어휘|독음|뜻;어휘|독음|뜻" -> [{w,r,d}] */
function parseWords(cell) {
  if (!cell) return [];
  return cell.split(';').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [w, r, d] = s.split('|').map((x) => (x || '').trim());
    return { w, r, d };
  }).filter((x) => x.w && x.r);
}

const num = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };

// ---------- 한자 ----------
// 열 순서: char hun eum radical resid strokes level write tone variant words alts
const hanja = [];
const seenChar = new Set();
for (const f of rows('hanja.tsv')) {
  const [c, hun, eum, rad, resid, str, lv, write, tone, variant, words, alts] = f;
  if (!c) continue;
  if (seenChar.has(c)) { warn(`중복 한자: ${c}`); continue; }
  if (!hun || !eum) { warn(`훈음 누락: ${c}`); continue; }
  seenChar.add(c);
  hanja.push({
    id: 'h:' + c,
    c, hun, eum,
    rad: rad || '',
    resid: num(resid),            // 부수를 뺀 획수
    str: num(str),                // 총획
    lv: lv || '',
    // 쓰기 등급 — 1: 3급 이상 누계(확정), 2: 2급(확장), 0: 1급(읽기 전용)
    wtier: write === 'Y' ? 1 : write === '2' ? 2 : 0,
    write: write === 'Y' || write === '2',
    tone: tone || '',
    variant: variant || '',
    words: parseWords(words),
    // 채점 시 함께 인정할 훈음 (어문회 대표훈 외의 통용 훈)
    alts: (alts || '').split(';').map((x) => x.trim()).filter(Boolean),
  });
}

// ---------- 사자성어 ----------
const idioms = rows('idioms.tsv')
  .filter(([i, r, m]) => i && r && m)
  .map(([idiom, reading, meaning, level]) => ({
    id: 'i:' + idiom, idiom, reading, meaning, level: level || '',
  }));
for (const it of idioms) {
  if (it.idiom.length !== it.reading.length) {
    warn(`성어/독음 글자수 불일치: ${it.idiom}(${it.reading})`);
  }
}

// ---------- 유의어 / 반의어 ----------
const pairs = rows('pairs.tsv')
  .filter(([k, u, a, ar, b, br]) => k && u && a && ar && b && br)
  .map(([kind, unit, a, aRead, b, bRead, note], n) => ({
    id: `p:${kind}:${a}:${b}`, kind, unit, a, aRead, b, bRead, note: note || '',
  }));

// ---------- 동음이의어 ----------
const homonyms = rows('homonyms.tsv')
  .map(([reading, cell]) => ({
    id: 'm:' + reading,
    reading,
    words: (cell || '').split(';').map((s) => s.trim()).filter(Boolean).map((s) => {
      const [w, d] = s.split('|').map((x) => (x || '').trim());
      return { w, d };
    }).filter((x) => x.w),
  }))
  .filter((x) => x.reading && x.words.length >= 2);

// ---------- 약자 ----------
const abbrevSeen = new Set();
const abbrev = [];
for (const [full, abbr, hun, eum] of rows('abbrev.tsv')) {
  if (!full || !abbr) continue;
  if (abbrevSeen.has(full)) continue;
  abbrevSeen.add(full);
  abbrev.push({ id: 'a:' + full, full, abbr, hun: hun || '', eum: eum || '' });
}

// ---------- 급수 규격 ----------
// 이 표가 모든 급수의 학습 범위·모의고사 구성·합격 판정을 결정한다.
const levels = [];
for (const [level, label, read, write, items, pass, minutes, types] of rows('levels.tsv')) {
  if (!level) continue;
  const spec = (types || '').split(';').map((x) => x.trim()).filter(Boolean).map((x) => {
    const [k, n] = x.split(':');
    return { k: (k || '').trim(), n: num(n) || 0 };
  }).filter((x) => x.k && x.n > 0);
  const sum = spec.reduce((a, b) => a + b.n, 0);
  if (sum !== num(items)) warn(`${label}: 유형별 합계 ${sum} ≠ 총 문항 ${items}`);
  levels.push({
    lv: level, label,
    read: num(read), write: num(write) || 0,
    items: num(items), pass: num(pass), minutes: num(minutes),
    passItems: Math.ceil((num(items) * num(pass)) / 100),
    types: spec,
  });
}

// ---------- 부수 ----------
// 부수는 한자의 알파벳이다. 입문 단계 전체가 이 214자로 이뤄진다.
const radicals = [];
const radSeen = new Set();
for (const [c, hun, eum, name, strokes, variants, pos, varNames] of rows('radicals.tsv')) {
  if (!c || radSeen.has(c)) continue;
  radSeen.add(c);
  const vs = (variants || '').split(';').map((x) => x.trim()).filter(Boolean);
  const vn = (varNames || '').split(';').map((x) => x.trim());
  radicals.push({
    id: 'r:' + c,
    c, hun, eum,
    name: name || '',
    str: num(strokes),
    // 변형은 이름과 짝지어 둔다 — 초보자는 氵를 '삼수변'이라는 이름으로 배운다
    variants: vs,
    varNames: vs.map((v, i) => ({ v, n: vn[i] || '' })),
    pos: pos || '',
    examples: [],        // 아래에서 배정한자로 채운다
  });
  if (vs.some((v, i) => !vn[i])) warn(`부수 ${c}: 변형 이름 누락`);
}

// 부수마다 그 부수를 쓰는 가장 쉬운 한자를 예로 붙인다 — 배우는 순간 바로 쓸모가 생긴다
const LV_ORDER = levels.map((l) => l.lv);
const lvRank = (lv) => { const i = LV_ORDER.indexOf(lv); return i < 0 ? 99 : i; };
const byRad = new Map();
for (const h of hanja) {
  if (!h.rad) continue;
  const list = byRad.get(h.rad) || [];
  list.push(h);
  byRad.set(h.rad, list);
}
for (const r of radicals) {
  const list = (byRad.get(r.c) || []).slice().sort((a, b) => lvRank(a.lv) - lvRank(b.lv));
  r.examples = list.slice(0, 4).map((h) => ({ c: h.c, hun: h.hun, eum: h.eum, lv: h.lv }));
  r.count = list.length;
}
const radNoExample = radicals.filter((r) => !r.examples.length).length;

// ---------- 장단음 ----------
const tone = rows('tone.tsv')
  .filter(([w, r, t]) => w && r && (t === '장' || t === '단'))
  .map(([word, reading, t, meaning]) => ({
    id: 't:' + word, word, reading, tone: t, meaning: meaning || '',
  }));

// ---------- 교차 검증 ----------
const charSet = new Set(hanja.map((h) => h.c));
let idiomCovered = 0;
for (const it of idioms) {
  if ([...it.idiom].every((ch) => charSet.has(ch))) idiomCovered += 1;
}

const data = {
  meta: {
    builtAt: new Date().toISOString().slice(0, 10),
    counts: {
      hanja: hanja.length,
      hanjaWrite: hanja.filter((h) => h.wtier === 1).length,
      hanjaWriteExt: hanja.filter((h) => h.wtier === 2).length,
      idioms: idioms.length,
      pairs: pairs.length,
      homonyms: homonyms.length,
      abbrev: abbrev.length,
      tone: tone.length,
      radicals: radicals.length,
      levels: levels.length,
    },
  },
  levels, radicals, hanja, idioms, pairs, homonyms, abbrev, tone,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  '/* 자동 생성 파일 — 편집하지 말 것. `npm run build` 또는 `node tools/build.mjs` 로 재생성한다. */\n' +
  'window.AISUN_DATA = ' + JSON.stringify(data) + ';\n',
  'utf8'
);

console.log('생성:', OUT.replace(ROOT + '/', ''));
console.table(data.meta.counts);
const byLevel = {};
for (const h of hanja) byLevel[h.lv] = (byLevel[h.lv] || 0) + 1;
console.log('급수별:', ['8','7II','7','6II','6','5II','5','4II','4','3II','3','2','1']
  .map((l) => `${l}급 ${byLevel[l] || 0}`).join(' · '));
console.log(`어휘가 없는 한자 ${hanja.filter((h) => !h.words.length).length}자 (독음·쓰기 문항이 만들어지지 않음)`);
console.log(`급수 규격 ${levels.length}개 · 부수 ${radicals.length}자` +
  (radNoExample ? ` (배정한자에 용례가 없는 부수 ${radNoExample}자)` : ''));
// 참고 지표 — 성어 문항 자체는 hanja.tsv 수록 여부와 무관하게 만들어진다.
console.log(`참고: 구성 한자가 모두 hanja.tsv 에도 수록된 성어 ${idiomCovered}/${idioms.length}개`);
if (problems.length) {
  console.log('\n경고 ' + problems.length + '건');
  for (const p of problems.slice(0, 20)) console.log('  - ' + p);
}
