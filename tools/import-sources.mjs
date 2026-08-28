#!/usr/bin/env node
/**
 * 외부 원본 3종을 병합해 data/src/hanja.tsv 와 data/src/homonyms.tsv 를 재생성한다.
 *
 *   node tools/import-sources.mjs --grades <hanja.csv> --dict <hanja.txt> [--unihan <디렉터리>]
 *
 * 원본 (저장소에 포함하지 않는다. docs/05-원본-데이터.md 참조)
 *   --grades  한국어문회 급수별 배정한자 CSV   (rycont/hanja-grade-dataset)  ← 급수·훈음·부수·획수의 기준
 *   --dict    libhangul 한자 사전 hanja.txt   (libhangul/libhangul)         ← 한자어 어휘와 보조 훈
 *   --unihan  Unicode Unihan 압축 해제 디렉터리                              ← 부수·획수 교차 검증(선택)
 *
 * 손으로 다듬은 뜻·장단음·약자 정보는 기존 TSV에서 읽어 그대로 보존한다.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : null; };

const GRADES = arg('grades');
const DICT = arg('dict');
const UNIHAN = arg('unihan');
// 빈도 파일은 사전과 같은 디렉터리에 있다. 대표 어휘를 고르는 유일한 근거이므로 중요하다.
const FREQ = arg('freq') || (DICT ? resolve(dirname(DICT), 'freq-hanjaeo.txt') : null);
if (!GRADES || !DICT) {
  console.error('사용법: node tools/import-sources.mjs --grades <hanja.csv> --dict <hanja.txt> [--unihan <dir>]');
  process.exit(2);
}

/* ── 급수 체계 — 8급부터 1급까지 누계가 정확히 3,500자다 ── */
const LEVELS = ['8급', '7급Ⅱ', '7급', '6급Ⅱ', '6급', '5급Ⅱ', '5급', '4급Ⅱ', '4급', '3급Ⅱ', '3급', '2급', '1급'];
const LV_IDX = Object.fromEntries(LEVELS.map((l, i) => [l, i]));
const SHORT = { '8급': '8', '7급Ⅱ': '7II', '7급': '7', '6급Ⅱ': '6II', '6급': '6', '5급Ⅱ': '5II', '5급': '5',
  '4급Ⅱ': '4II', '4급': '4', '3급Ⅱ': '3II', '3급': '3', '2급': '2', '1급': '1' };
const WRITE_UPTO = LV_IDX['3급'];      // 3급까지 누계 1,817자 = 확정 쓰기 대상
const WRITE_EXT = LV_IDX['2급'];       // 2급 538자 = 확장 쓰기 대상 (공식 2,005자를 덮기 위함)

const isHanja = (c) => c >= '一' && c <= '鿿';

/* ── 1. 한국어문회 급수 CSV ── */
function parseCsv(text) {
  const rows = [];
  let field = '', row = [], q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift().map((h) => h.trim());
  return rows.filter((r) => r.length >= head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

/**
 * "[[['가혹할'], ['가']], [['멀'], ['하']]]" → [{hun:'가혹할', eum:'가', note:''}, …]
 *
 * 훈에는 뜻을 좁히는 한자 주석이 붙는다 — 皆 은 "다[總]", 苦 는 "쓸[味覺]" 처럼.
 * 주석은 훈에서 떼어 note 로 옮긴다. 채점은 주석 없는 훈으로 하되, 주석형도 정답으로 인정한다.
 */
function parseMeaning(s) {
  let lit;
  try { lit = JSON.parse(String(s).replace(/'/g, '"')); }
  catch (e) { return []; }
  if (!Array.isArray(lit)) return [];
  const out = [];
  for (const pair of lit) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const rawHun = String((pair[0] || [])[0] || '').trim();
    const eum = String((pair[1] || [])[0] || '').trim();
    if (!rawHun || !eum) continue;
    const m = rawHun.match(/^(.*?)\s*[[(]([^\])]*)[\])]\s*$/);
    out.push({ hun: m ? m[1].trim() : rawHun, eum, note: m ? m[2].trim() : '', raw: rawHun });
  }
  return out;
}

const official = new Map();
for (const r of parseCsv(readFileSync(GRADES, 'utf8'))) {
  const lv = (r.level || '').trim();
  const c = (r.hanja || '').trim();
  if (!c || !(lv in LV_IDX)) continue;          // 특급·특급Ⅱ는 1급 범위 밖이라 제외
  const readings = parseMeaning(r.meaning || '');
  if (!readings.length) continue;
  official.set(c, {
    c, lv, lvIdx: LV_IDX[lv],
    hun: readings[0].hun, eum: readings[0].eum, note: readings[0].note, raw: readings[0].raw,
    alt: readings.slice(1),
    rad: (r.radical || '').trim(),
    resid: parseInt(r.strokes, 10) || null,      // 부수를 뺀 획수
    str: parseInt(r.total_strokes, 10) || null,  // 총획
    mainSound: (r.main_sound || '').trim(),
  });
}
console.log(`한국어문회 배정한자 ${official.size}자 (8급~1급)`);
if (official.size !== 3500) {
  console.error(`\n오류: 8급~1급 누계는 3,500자여야 한다. ${official.size}자만 읽혔다 — 원본이나 파서를 확인하라.`);
  process.exit(1);
}

/* ── 2. libhangul 한자 사전 ── */
const dictHun = new Map();            // 한자 → 보조 훈음 문자열들
const wordsByHanja = new Map();       // 한자 → [{w, r}]
const wordsByReading = new Map();     // 독음 → [{w, r}]
const seenWord = new Set();

for (const line of readFileSync(DICT, 'utf8').split('\n')) {
  if (!line || line[0] === '#') continue;
  const p = line.split(':');
  if (p.length < 3) continue;
  const read = p[0].trim();
  const w = p[1].trim();
  const desc = p.slice(2).join(':').trim();
  if (!w) continue;

  if (w.length === 1) {
    if (desc) {
      const list = dictHun.get(w) || [];
      for (const one of desc.split(',')) { const t = one.trim(); if (t) list.push(t); }
      dictHun.set(w, list);
    }
    continue;
  }
  // 배정한자만으로 이뤄진 2글자 한자어만 어휘 재료로 쓴다
  if (w.length !== 2) continue;
  if (![...w].every((c) => isHanja(c) && official.has(c))) continue;
  if (seenWord.has(w)) continue;
  seenWord.add(w);
  const rec = { w, r: read };
  for (const c of new Set([...w])) {
    const l = wordsByHanja.get(c) || []; l.push(rec); wordsByHanja.set(c, l);
  }
  const g = wordsByReading.get(read) || []; g.push(rec); wordsByReading.set(read, g);
}
console.log(`libhangul: 보조 훈 ${dictHun.size}자, 배정한자 2글자 어휘 ${seenWord.size}개`);

/* ── 2-1. 어휘 빈도 ──
 * 사전에는 敎國·家國 처럼 실제로 쓰이지 않는 표제어도 들어 있다. 빈도로 걸러야
 * 敎育·敎授 같은 진짜 대표 어휘가 뽑힌다. 값이 클수록 상용어다.
 */
const freq = new Map();
if (FREQ && existsSync(FREQ)) {
  for (const line of readFileSync(FREQ, 'utf8').split('\n')) {
    const i = line.lastIndexOf(':');
    if (i <= 0) continue;
    const w = line.slice(0, i).trim();
    const v = parseInt(line.slice(i + 1), 10);
    if (!w || !Number.isFinite(v)) continue;
    if (v > (freq.get(w) || 0)) freq.set(w, v);
  }
  console.log(`어휘 빈도 ${freq.size}개 (${FREQ.split('/').pop()})`);
} else {
  console.warn('경고: 빈도 파일을 찾지 못했다. 대표 어휘 품질이 크게 떨어진다.');
}
const freqOf = (w) => freq.get(w) || 0;

/* ── 3. Unihan 교차 검증 (선택) ── */
let unihanChecked = 0, radMismatch = 0;
if (UNIHAN && existsSync(resolve(UNIHAN, 'Unihan_IRGSources.txt'))) {
  const RAD = ['一','丨','丶','丿','乙','亅','二','亠','人','儿','入','八','冂','冖','冫','几','凵','刀','力','勹','匕','匚','匸','十','卜','卩','厂','厶','又','口','囗','土','士','夂','夊','夕','大','女','子','宀','寸','小','尢','尸','屮','山','巛','工','己','巾','干','幺','广','廴','廾','弋','弓','彐','彡','彳','心','戈','戶','手','支','攴','文','斗','斤','方','无','日','曰','月','木','欠','止','歹','殳','毋','比','毛','氏','气','水','火','爪','父','爻','爿','片','牙','牛','犬','玄','玉','瓜','瓦','甘','生','用','田','疋','疒','癶','白','皮','皿','目','矛','矢','石','示','禸','禾','穴','立','竹','米','糸','缶','网','羊','羽','老','而','耒','耳','聿','肉','臣','自','至','臼','舌','舛','舟','艮','色','艸','虍','虫','血','行','衣','襾','見','角','言','谷','豆','豕','豸','貝','赤','走','足','身','車','辛','辰','辵','邑','酉','釆','里','金','長','門','阜','隶','隹','雨','靑','非','面','革','韋','韭','音','頁','風','飛','食','首','香','馬','骨','高','髟','鬥','鬯','鬲','鬼','魚','鳥','鹵','鹿','麥','麻','黃','黍','黑','黹','黽','鼎','鼓','鼠','鼻','齊','齒','龍','龜','龠'];
  for (const line of readFileSync(resolve(UNIHAN, 'Unihan_IRGSources.txt'), 'utf8').split('\n')) {
    if (line[0] !== 'U') continue;
    const [cp, key, val] = line.split('\t');
    if (key !== 'kRSUnicode') continue;
    const c = String.fromCodePoint(parseInt(cp.slice(2), 16));
    const o = official.get(c);
    if (!o || !o.rad) continue;
    unihanChecked += 1;
    const rad = RAD[parseInt(val.split('.')[0], 10) - 1];
    if (rad && rad !== o.rad) radMismatch += 1;
  }
  console.log(`Unihan 교차 검증: ${unihanChecked}자 대조, 부수 불일치 ${radMismatch}자 ` +
    `(${(radMismatch / unihanChecked * 100).toFixed(1)}% — 강희부수와 한국 관용 부수 표기 차이)`);
}

/* ── 4. 어휘 뜻 합성 ──
 * 한자어의 뜻풀이는 공개 원본에 없다. 지어내는 대신 구성 한자의 훈음을 이어 붙인다.
 * 家庭 → "집 가 + 뜰 정". 한자어를 구성 한자로 분해해 이해하는 건 정석 학습법이기도 하고,
 * 무엇보다 假定(거짓 가 + 정할 정)과 확실히 구별된다.
 */
const hunOf = (c) => { const o = official.get(c); return o ? `${o.hun} ${o.eum}` : ''; };
const composeGloss = (w) => [...w].map(hunOf).filter(Boolean).join(' + ');

/* ── 5. 기존 수기 데이터 보존 ── */
const curated = new Map();
const CURATED = resolve(ROOT, 'data/src/curated.tsv');
if (existsSync(CURATED)) {
  let header = false;
  for (const line of readFileSync(CURATED, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (!header) { header = true; continue; }
    const [char, hun, tone, variant, wordCell] = line.split('\t');
    if (!char) continue;
    curated.set(char, {
      hun: (hun || '').trim(), tone: (tone || '').trim(), variant: (variant || '').trim(),
      words: (wordCell || '').split(';').filter(Boolean).map((x) => {
        const [w, r, d] = x.split('|'); return { w, r, d: (d || '').trim() };
      }).filter((x) => x.w && x.r && x.d),
    });
  }
  console.log(`수기 보강 데이터 ${curated.size}자 (data/src/curated.tsv)`);
}

/* ── 6. 어휘 선정 ──
 * 대표 어휘는 "쉬운 글자로 이뤄진 것"을 우선한다. 급수가 낮을수록 일상에서 자주 쓰이므로
 * 구성 글자의 급수 합이 작은 어휘가 그 한자의 대표 용례일 확률이 높다.
 */

function pickWords(c, keep) {
  const out = [];
  const used = new Set();
  for (const w of keep) { out.push(w); used.add(w.w); }   // 진짜 뜻풀이가 달린 수기 어휘 우선

  const levelCost = (s) => [...s].reduce((n, ch) => n + (official.get(ch)?.lvIdx ?? 99), 0);
  const cands = (wordsByHanja.get(c) || [])
    .filter((x) => !used.has(x.w))
    .sort((a, b) =>
      freqOf(b.w) - freqOf(a.w)                                  // 상용어부터
      || levelCost(a.w) - levelCost(b.w)                         // 빈도가 같으면 쉬운 글자 조합
      || (a.w[0] === c ? 0 : 1) - (b.w[0] === c ? 0 : 1));       // 그다음 첫 글자로 쓰인 것
  for (const x of cands) {
    if (out.length >= 3) break;
    out.push({ w: x.w, r: x.r, d: composeGloss(x.w) });
  }
  return out;
}

/* ── 7. hanja.tsv 생성 ── */
const TSV = resolve(ROOT, 'data/src/hanja.tsv');
const sorted = [...official.values()].sort((a, b) =>
  a.lvIdx - b.lvIdx || a.eum.localeCompare(b.eum, 'ko') || a.c.localeCompare(b.c));

const lines = [
  '# 한국어문회 한자능력검정시험 배정한자 — 8급~1급 전량 3,500자',
  '# 출처: 한국어문회 급수별 배정한자(급수·훈음·부수·획수) + libhangul 한자사전(어휘) — docs/05-원본-데이터.md 참조',
  '# 이 파일은 tools/import-sources.mjs 로 생성된다. 손으로 고친 뒤 다시 돌리면 뜻·장단음·약자는 보존된다.',
  '# write: Y=쓰기 확정(3급 이상 누계 1,817자)  2=쓰기 확장(2급)  N=읽기 전용(1급)',
  '# resid=부수를 뺀 획수, strokes=총획, alts=채점 시 함께 인정할 다른 훈음',
  ['char', 'hun', 'eum', 'radical', 'resid', 'strokes', 'level', 'write', 'tone', 'variant', 'words', 'alts'].join('\t'),
];

let stat = { write: 0, ext: 0, read: 0, noWords: 0, curatedWords: 0 };
for (const o of sorted) {
  const cur = curated.get(o.c);
  const words = pickWords(o.c, cur ? cur.words : []);
  if (cur && cur.words.length) stat.curatedWords += 1;
  if (!words.length) stat.noWords += 1;

  const write = o.lvIdx <= WRITE_UPTO ? 'Y' : o.lvIdx <= WRITE_EXT ? '2' : 'N';
  if (write === 'Y') stat.write += 1; else if (write === '2') stat.ext += 1; else stat.read += 1;

  // 훈은 어문회 대표훈이 정답. libhangul 훈과 다른 이표기는 채점 시 함께 인정한다.
  const alts = new Set();
  if (o.note) {
    alts.add(`${o.raw} ${o.eum}`);                                   // 주석을 붙인 원형
    if (/^[가-힣\s]+$/.test(o.note)) alts.add(`${o.note} ${o.eum}`); // 괄호 안이 동의어인 경우
  }
  for (const a of o.alt) alts.add(`${a.hun} ${a.eum}`);
  for (const t of (dictHun.get(o.c) || [])) if (t && t !== `${o.hun} ${o.eum}`) alts.add(t);
  if (cur && cur.hun && cur.hun !== o.hun) alts.add(`${cur.hun} ${o.eum}`);

  lines.push([
    o.c, o.hun, o.eum, o.rad, o.resid ?? '', o.str ?? '', SHORT[o.lv], write,
    cur ? cur.tone : '', cur ? cur.variant : '',
    words.map((w) => `${w.w}|${w.r}|${w.d || ''}`).join(';'),
    [...alts].slice(0, 4).join(';'),
  ].join('\t'));
}
writeFileSync(TSV, lines.join('\n') + '\n', 'utf8');
console.log(`\ndata/src/hanja.tsv — ${sorted.length}자`);
console.log(`  쓰기 확정 ${stat.write} · 쓰기 확장 ${stat.ext} · 읽기 전용 ${stat.read}`);
console.log(`  수기 어휘 보존 ${stat.curatedWords}자 · 어휘 없음 ${stat.noWords}자`);

/* ── 8. homonyms.tsv 생성 ──
 * 동음이의어는 실전에서 가장 잘 틀리는 유형이다. 같은 독음에 배정한자 어휘가 여럿 있는
 * 묶음만 골라, 쉬운 글자로 이뤄진 순으로 상위 묶음을 담는다.
 */
const HOM = resolve(ROOT, 'data/src/homonyms.tsv');
const curatedHom = new Map();
const CURATED_HOM = resolve(ROOT, 'data/src/curated-homonyms.tsv');
if (existsSync(CURATED_HOM)) {
  let header = false;
  for (const line of readFileSync(CURATED_HOM, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (!header) { header = true; continue; }
    const [reading, cell] = line.split('\t');
    if (reading && cell) curatedHom.set(reading.trim(), cell.trim());
  }
}

// 실전에서 함정이 되는 건 "둘 다 흔한 낱말"인 묶음이다. 두 번째로 흔한 낱말의 빈도로 줄 세운다.
const groups = [...wordsByReading.entries()]
  .map(([reading, ws]) => {
    const picked = ws.slice().sort((a, b) => freqOf(b.w) - freqOf(a.w)).slice(0, 5);
    return { reading, picked, score: picked.length >= 2 ? freqOf(picked[1].w) : 0 };
  })
  .filter((g) => g.picked.length >= 2 && g.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, 300);   // 10문항짜리 유형이므로 카드 수를 과하게 늘리지 않는다

const homLines = [
  '# 同音異義語 — 독음이 같고 뜻이 다른 한자어',
  '# reading\twords(한자어|뜻 ; 로 구분)',
  '# tools/import-sources.mjs 로 생성. 손으로 적은 뜻풀이가 있는 묶음은 그대로 유지된다.',
  ['reading', 'words'].join('\t'),
];
const emitted = new Set();
for (const [reading, cell] of curatedHom) { homLines.push(`${reading}\t${cell}`); emitted.add(reading); }
for (const g of groups) {
  if (emitted.has(g.reading)) continue;
  emitted.add(g.reading);
  homLines.push(`${g.reading}\t${g.picked.map((x) => `${x.w}|${composeGloss(x.w)}`).join(';')}`);
}
writeFileSync(HOM, homLines.join('\n') + '\n', 'utf8');
console.log(`data/src/homonyms.tsv — ${emitted.size}묶음 (수기 ${curatedHom.size} + 생성 ${emitted.size - curatedHom.size})`);
