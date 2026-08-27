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
const hanja = [];
const seenChar = new Set();
for (const [c, hun, eum, rad, str, lv, write, tone, variant, words] of rows('hanja.tsv')) {
  if (!c) continue;
  if (seenChar.has(c)) { warn(`중복 한자: ${c}`); continue; }
  if (!hun || !eum) { warn(`훈음 누락: ${c}`); continue; }
  seenChar.add(c);
  hanja.push({
    id: 'h:' + c,
    c, hun, eum,
    rad: rad || '',
    str: num(str),
    lv: lv || '',
    write: write === 'Y',
    tone: tone || '',
    variant: variant || '',
    words: parseWords(words),
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
      hanjaWrite: hanja.filter((h) => h.write).length,
      idioms: idioms.length,
      pairs: pairs.length,
      homonyms: homonyms.length,
      abbrev: abbrev.length,
      tone: tone.length,
    },
  },
  hanja, idioms, pairs, homonyms, abbrev, tone,
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
// 참고 지표 — 성어 문항 자체는 hanja.tsv 수록 여부와 무관하게 만들어진다.
console.log(`참고: 구성 한자가 모두 hanja.tsv 에도 수록된 성어 ${idiomCovered}/${idioms.length}개`);
if (problems.length) {
  console.log('\n경고 ' + problems.length + '건');
  for (const p of problems.slice(0, 20)) console.log('  - ' + p);
}
