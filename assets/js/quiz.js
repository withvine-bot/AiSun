/* AiSun — quiz.js
 * 실제 시험의 11개 출제 유형을 그대로 생성하는 문항 엔진.
 * 모든 문항은 { type, cardId, prompt, answer, accept, choices, mode, explain } 형태다.
 */
(function (global) {
  'use strict';

  const AiSun = global.AiSun || (global.AiSun = {});
  const U = AiSun.util;

  let D = null;      // 코퍼스
  let IDX = null;    // 오답 보기 생성을 위한 색인

  function buildIndex(data) {
    const words = [];      // {w, r, d} — 독음/쓰기 문항의 재료
    for (const h of data.hanja) for (const w of h.words) words.push({ w: w.w, r: w.r, d: w.d, src: h });
    for (const t of data.tone) words.push({ w: t.word, r: t.reading, d: t.meaning, src: t });
    for (const m of data.homonyms) for (const w of m.words) words.push({ w: w.w, r: m.reading, d: w.d, src: m });

    return {
      words: U.uniqBy(words, (x) => x.w),
      wordsByReading: words.reduce((acc, x) => { (acc[x.r] = acc[x.r] || []).push(x); return acc; }, {}),
      readings: U.uniqBy(words, (x) => x.r).map((x) => x.r),
      hunEum: data.hanja.map((h) => ({ c: h.c, t: h.hun + ' ' + h.eum })),
      radicals: U.uniqBy(data.hanja.filter((h) => h.rad), (h) => h.rad).map((h) => h.rad),
      chars: data.hanja.map((h) => h.c),
      idiomChars: U.uniqBy(
        data.idioms.flatMap((i) => [...i.idiom]).map((c) => ({ c })), (x) => x.c
      ).map((x) => x.c),
      meanings: data.idioms.map((i) => i.meaning),
      radNames: data.radicals.map((r) => r.name).filter(Boolean),
      radHunEum: data.radicals.map((r) => `${r.hun} ${r.eum}`),
      strokes: [...new Set(data.hanja.map((h) => h.str).filter((n) => n > 0))].sort((a, b) => a - b),
    };
  }

  /** 정답을 1개 포함한 n지선다를 만든다. 중복·정답과 같은 보기는 제거한다. */
  function choices(correct, pool, rand, n) {
    n = n || 4;
    const seen = new Set([U.norm(correct)]);
    const wrong = [];
    for (const cand of U.shuffle(pool, rand)) {
      const key = U.norm(cand);
      if (!cand || seen.has(key)) continue;
      seen.add(key); wrong.push(cand);
      if (wrong.length >= n - 1) break;
    }
    return U.shuffle([correct].concat(wrong), rand);
  }

  const noop = () => null;

  /** 지문에 쓸 수 있는 어휘인지 — 구성 글자가 모두 출제 범위 안이어야 한다 */
  function inScope(text, scope) {
    if (!scope) return true;
    for (const ch of String(text)) {
      if (ch >= '一' && ch <= '鿿' && !scope.has(ch)) return false;
    }
    return true;
  }
  const scopedWords = (words, scope) => (words || []).filter((w) => inScope(w.w, scope));

  /* ─────────── 유형별 생성기 ───────────
   * 각 생성기는 (card, rand, opts) 를 받아 문항 또는 null 을 돌려준다.
   * null 이면 그 카드로는 해당 유형을 만들 수 없다는 뜻이다.
   */
  const GEN = {

    /* 讀音 50문항 — 한자어를 보고 한글 독음을 쓴다 */
    '독음'(card, rand, opts) {
      const scope = opts && opts.charScope;
      let w = null;
      if (card.kind === 'hanja') {
        const ws = scopedWords(card.ref.words, scope);
        if (ws.length) w = U.pick(ws, rand);
      } else if (card.kind === 'idiom') {
        if (inScope(card.ref.idiom, scope)) w = { w: card.ref.idiom, r: card.ref.reading, d: card.ref.meaning };
      } else if (card.kind === 'tone') {
        if (inScope(card.ref.word, scope)) w = { w: card.ref.word, r: card.ref.reading, d: card.ref.meaning };
      } else if (card.kind === 'homo') {
        const ws = card.ref.words.filter((x) => inScope(x.w, scope));
        if (ws.length) { const x = U.pick(ws, rand); w = { w: x.w, r: card.ref.reading, d: x.d }; }
      }
      if (!w) return null;
      return {
        type: '독음', cardId: card.id, mode: 'input',
        q: '다음 漢字語의 讀音을 쓰시오.',
        stem: w.w,
        answer: w.r,
        accept: [w.r],
        choices: choices(w.r, IDX.readings, rand),
        explain: `${w.w} : ${w.r}${w.d ? ' — ' + w.d : ''}`,
      };
    },

    /* 訓音 32문항 — 한자의 뜻과 소리 */
    '훈음'(card, rand) {
      if (card.kind !== 'hanja') return null;
      const h = card.ref;
      const ans = `${h.hun} ${h.eum}`;
      // 어문회 대표훈이 정답이지만, 통용되는 다른 훈으로 답해도 실제 채점에서는 인정된다.
      const accept = [ans, h.hun + h.eum].concat(h.alts || []);
      return {
        type: '훈음', cardId: card.id, mode: 'input',
        q: '다음 漢字의 訓과 音을 쓰시오.',
        stem: h.c,
        answer: ans,
        accept,
        choices: choices(ans, IDX.hunEum.map((x) => x.t), rand),
        explain: `${h.c} : ${ans}${h.words[0] ? ' — 예) ' + h.words[0].w + '(' + h.words[0].r + ')' : ''}`,
      };
    },

    /* 漢字쓰기 40문항 — 배점 최대. 한글 어휘를 한자로 옮긴다 */
    '한자쓰기'(card, rand, opts) {
      const scope = opts && opts.charScope;
      let w = null;
      if (card.kind === 'hanja') {
        const ws = scopedWords(card.ref.words, scope);
        if (ws.length) w = U.pick(ws, rand);
      } else if (card.kind === 'tone' && inScope(card.ref.word, scope)) {
        w = { w: card.ref.word, r: card.ref.reading, d: card.ref.meaning };
      }
      if (!w) return null;
      // 오답 보기는 글자 수가 같은 다른 한자어에서 뽑아야 변별이 된다
      const pool = IDX.words.filter((x) => x.w.length === w.w.length).map((x) => x.w);
      return {
        type: '한자쓰기', cardId: card.id, mode: (opts && opts.forceChoice) ? 'choice' : 'write',
        q: '다음 뜻을 가진 낱말을 漢字로 쓰시오.',
        stem: `${w.r}${w.d ? ' (' + w.d + ')' : ''}`,
        answer: w.w,
        accept: [w.w],
        choices: choices(w.w, pool, rand),
        explain: `${w.r} → ${w.w}${w.d ? ' : ' + w.d : ''}`,
      };
    },

    /* 完成型 15문항 — 사자성어의 빈칸 채우기 */
    '완성형'(card, rand) {
      if (card.kind !== 'idiom') return null;
      const it = card.ref;
      const chars = [...it.idiom];
      const i = Math.floor(rand() * chars.length);
      const missing = chars[i];
      const shown = chars.map((c, k) => (k === i ? '□' : c)).join('');
      return {
        type: '완성형', cardId: card.id, mode: 'choice',
        q: '다음 성어의 □ 안에 들어갈 漢字를 고르시오.',
        stem: shown,
        hint: it.meaning,
        answer: missing,
        accept: [missing],
        choices: choices(missing, IDX.idiomChars, rand),
        explain: `${it.idiom} (${it.reading}) — ${it.meaning}`,
      };
    },

    /* 反義語·相對語 10문항 */
    '반의어'(card, rand) {
      if (card.kind !== 'pair' || card.ref.kind !== '반의') return null;
      return pairQuestion(card, rand, '반의어', '反義語');
    },

    /* 類義語 10문항 */
    '유의어'(card, rand) {
      if (card.kind !== 'pair' || card.ref.kind !== '유의') return null;
      return pairQuestion(card, rand, '유의어', '類義語');
    },

    /* 뜻풀이 10문항 */
    '뜻풀이'(card, rand, opts) {
      const scope = opts && opts.charScope;
      let stem = null, ans = null, pool = null, read = '';
      if (card.kind === 'idiom') {
        if (!inScope(card.ref.idiom, scope)) return null;
        stem = card.ref.idiom; ans = card.ref.meaning; read = card.ref.reading;
        pool = IDX.meanings;
      } else if (card.kind === 'hanja') {
        const w = scopedWords(card.ref.words, scope).find((x) => x.d);
        if (!w) return null;
        stem = w.w; ans = w.d; read = w.r;
        pool = IDX.words.filter((x) => x.d).map((x) => x.d);
      } else return null;
      return {
        type: '뜻풀이', cardId: card.id, mode: 'choice',
        q: '다음 漢字語(成語)의 뜻으로 알맞은 것을 고르시오.',
        stem, hint: read,
        answer: ans, accept: [ans],
        choices: choices(ans, pool, rand),
        explain: `${stem}(${read}) — ${ans}`,
      };
    },

    /* 同音異義語 10문항 */
    '동음이의어'(card, rand, opts) {
      if (card.kind !== 'homo') return null;
      const m = card.ref;
      const scope = opts && opts.charScope;
      const usable = m.words.filter((x) => inScope(x.w, scope));
      if (usable.length < 2) return null;
      const target = U.pick(usable, rand);
      const others = usable.filter((x) => x.w !== target.w).map((x) => x.w);
      // 같은 독음의 다른 한자어를 우선 보기로 쓴다 — 이게 실제 시험의 함정 구조다
      const pool = others.concat(
        (IDX.wordsByReading[m.reading] || []).map((x) => x.w),
        IDX.words.filter((x) => x.w.length === target.w.length).map((x) => x.w)
      );
      return {
        type: '동음이의어', cardId: card.id, mode: 'choice',
        q: `독음이 '${m.reading}'인 낱말 중 다음 뜻에 해당하는 것을 고르시오.`,
        stem: target.d || m.reading,
        hint: m.reading,
        answer: target.w, accept: [target.w],
        choices: choices(target.w, pool, rand),
        explain: m.words.map((x) => `${x.w} : ${x.d}`).join(' / '),
      };
    },

    /* 部首 10문항 */
    '부수'(card, rand) {
      if (card.kind !== 'hanja' || !card.ref.rad) return null;
      const h = card.ref;
      // 글자를 이루는 구성 요소를 오답으로 섞으면 난도가 실제 시험에 가까워진다
      const parts = [...h.c].concat(IDX.radicals);
      return {
        type: '부수', cardId: card.id, mode: 'choice',
        q: '다음 漢字의 部首를 고르시오.',
        stem: h.c,
        hint: `${h.hun} ${h.eum}`,
        answer: h.rad, accept: [h.rad],
        choices: choices(h.rad, parts, rand),
        explain: `${h.c}(${h.hun} ${h.eum}) 의 부수는 ${h.rad}${h.str ? ', 총 ' + h.str + '획' : ''}`,
      };
    },

    /* 長短音 10문항 */
    '장단음'(card, rand) {
      if (card.kind !== 'tone') return null;
      const t = card.ref;
      const want = rand() < 0.5 ? '장' : '단';
      const same = D.tone.filter((x) => x.tone === want && x.word !== t.word);
      const opp = D.tone.filter((x) => x.tone !== want);
      if (!same.length || opp.length < 3) return null;
      const correct = t.tone === want ? t.word : U.pick(same, rand).word;
      const wrongs = U.sample(opp.map((x) => x.word), 3, rand);
      return {
        type: '장단음', cardId: card.id, mode: 'choice',
        q: `다음 중 첫 音節이 ${want === '장' ? '長音(길게 소리 나는 것)' : '短音(짧게 소리 나는 것)'}인 것을 고르시오.`,
        stem: '',
        answer: correct, accept: [correct],
        choices: U.shuffle([correct].concat(wrongs), rand),
        explain: `${t.word}(${t.reading}) 은 ${t.tone}음이다.`,
      };
    },

    /* 略字 3문항 */
    '약자'(card, rand) {
      if (card.kind !== 'abbr') return null;
      const a = card.ref;
      const toAbbr = rand() < 0.7;
      const pool = D.abbrev.map((x) => (toAbbr ? x.abbr : x.full));
      return {
        type: '약자', cardId: card.id, mode: 'choice',
        q: toAbbr ? '다음 漢字의 略字를 고르시오.' : '다음 略字의 本字(正字)를 고르시오.',
        stem: toAbbr ? a.full : a.abbr,
        hint: `${a.hun} ${a.eum}`,
        answer: toAbbr ? a.abbr : a.full,
        accept: [toAbbr ? a.abbr : a.full],
        choices: choices(toAbbr ? a.abbr : a.full, pool, rand),
        explain: `${a.full} ↔ ${a.abbr} (${a.hun} ${a.eum})`,
      };
    },

    /* 획수 — 실제 시험의 筆順 자리를 대신한다. 획을 셀 줄 알아야 필순도 익힐 수 있다 */
    '획수'(card, rand) {
      const src = card.kind === 'hanja' ? card.ref : card.kind === 'radical' ? card.ref : null;
      if (!src || !src.str) return null;
      const near = [src.str - 2, src.str - 1, src.str + 1, src.str + 2, src.str + 3].filter((n) => n > 0);
      const isRad = card.kind === 'radical';
      return {
        type: '획수', cardId: card.id, mode: 'choice',
        q: isRad ? '다음 部首는 몇 획인가?' : '다음 漢字의 總畫(총획)은 몇 획인가?',
        stem: src.c, hint: `${src.hun} ${src.eum}`,
        answer: String(src.str), accept: [String(src.str), src.str + '획'],
        choices: choices(String(src.str), near.map(String), rand),
        explain: isRad
          ? `${src.c}(${src.name}) — ${src.str}획`
          : `${src.c} — ${src.rad}부 ${src.resid != null ? src.resid + '획' : ''}, 총 ${src.str}획`,
      };
    },

    /* 部首 訓音 — 입문 단계의 주력 문항 */
    '부수훈음'(card, rand) {
      if (card.kind !== 'radical') return null;
      const r = card.ref;
      const ans = `${r.hun} ${r.eum}`;
      return {
        type: '부수훈음', cardId: card.id, mode: 'input',
        q: '다음 部首의 訓과 音을 쓰시오.',
        stem: r.c,
        hint: (r.varNames || []).length
          ? `자리에 따라 ${r.varNames.map((v) => v.v + (v.n ? `(${v.n})` : '')).join(' · ')} 로도 쓴다` : '',
        answer: ans, accept: [ans, r.hun + r.eum, r.name].concat((r.varNames || []).map((v) => v.n).filter(Boolean)),
        choices: choices(ans, IDX.radHunEum, rand),
        explain: `${r.c} ${ans} — ${r.name}, ${r.str}획, 주로 ${r.pos}에 놓인다`
          + ((r.varNames || []).length ? ` · 변형 ${r.varNames.map((v) => v.v + (v.n ? `(${v.n})` : '')).join(' ')}` : '')
          + (r.examples.length ? ` · 예) ${r.examples.map((e) => e.c).join(' ')}` : ''),
      };
    },

    /* 이 부수를 쓰는 한자 고르기 — 부수 지식을 실제 글자와 잇는다 */
    '부수찾기'(card, rand, opts) {
      if (card.kind !== 'radical') return null;
      const r = card.ref;
      if (!r.examples || !r.examples.length) return null;
      const target = U.pick(r.examples, rand);
      const scope = opts && opts.charScope;
      const others = D.hanja
        .filter((h) => h.rad && h.rad !== r.c && (!scope || scope.has(h.c)))
        .map((h) => h.c);
      return {
        type: '부수찾기', cardId: card.id, mode: 'choice',
        q: `다음 중 部首가 '${r.c}(${r.hun} ${r.eum})'인 漢字는?`,
        stem: '',
        answer: target.c, accept: [target.c],
        choices: choices(target.c, others, rand),
        explain: `${target.c}(${target.hun} ${target.eum}) 은 ${r.c}부에 속한다`
          + (r.examples.length > 1 ? ` · 같은 부수: ${r.examples.map((e) => e.c).join(' ')}` : ''),
      };
    },
  };

  function pairQuestion(card, rand, type, label) {
    const p = card.ref;
    const flip = rand() < 0.5;
    const stem = flip ? p.b : p.a;
    const ans = flip ? p.a : p.b;
    const stemRead = flip ? p.bRead : p.aRead;
    const pool = D.pairs
      .filter((x) => x.unit === p.unit)
      .flatMap((x) => [x.a, x.b])
      .filter((x) => x !== stem);
    return {
      type, cardId: card.id, mode: 'choice',
      q: `다음 ${p.unit === '字' ? '漢字' : '漢字語'}의 ${label}를 고르시오.`,
      stem, hint: stemRead,
      answer: ans, accept: [ans],
      choices: choices(ans, pool, rand),
      explain: `${p.a}(${p.aRead}) ↔ ${p.b}(${p.bRead})${p.note ? ' — ' + p.note : ''}`,
    };
  }

  /* 카드 종류별로 만들 수 있는 유형 */
  const TYPES_FOR_KIND = {
    radical: ['부수훈음', '부수찾기', '획수'],
    hanja: ['훈음', '독음', '부수', '획수', '뜻풀이', '한자쓰기'],
    idiom: ['완성형', '뜻풀이', '독음'],
    pair: ['반의어', '유의어'],
    homo: ['동음이의어', '독음'],
    abbr: ['약자'],
    tone: ['장단음', '독음', '한자쓰기'],
  };

  const Q = AiSun.quiz = {
    init(data) { D = data; IDX = buildIndex(data); return IDX; },
    get index() { return IDX; },
    TYPES_FOR_KIND,

    /** 특정 유형의 문항을 카드에서 만든다. 실패하면 null. */
    make(type, card, rand, opts) {
      const g = GEN[type] || noop;
      try { return g(card, rand || Math.random, opts || {}); }
      catch (e) { console.warn('문항 생성 실패', type, card && card.id, e); return null; }
    },

    /** 카드에 맞는 유형을 골라 한 문항 만든다. 쓰기 카드는 반드시 한자쓰기로. */
    fromCard(card, rand, opts) {
      rand = rand || Math.random;
      if (card.track === 'write') return Q.make('한자쓰기', card, rand, opts);
      const cands = U.shuffle(TYPES_FOR_KIND[card.kind] || [], rand);
      for (const t of cands) {
        if (t === '한자쓰기' && card.track !== 'write') continue;   // 쓰기는 쓰기 카드에서만
        const q = Q.make(t, card, rand, opts);
        if (q) return q;
      }
      return null;
    },

    /**
     * 지정한 유형으로 n문항을 뽑는다.
     * 우선순위: 오답노트 > 복습 예정 > 학습한 카드 > 전체
     */
    byType(type, n, opts) {
      opts = opts || {};
      const rand = opts.rand || Math.random;
      const deck = AiSun.curriculum.deck;
      const st = AiSun.store.state;
      const today = U.today();

      let pool = deck.all.filter((c) => {
        if (c.track === 'write') return type === '한자쓰기';
        if (type === '한자쓰기') return false;
        return (TYPES_FOR_KIND[c.kind] || []).includes(type);
      });
      // 출제 범위는 반드시 지킨다. 8급 시험에 1급 한자가 나오면 시험이 아니다.
      // 범위 안에 재료가 모자라면 모자란 채로 돌려주고, 채우는 건 exam.build 가 판단한다.
      if (opts.pool) {
        const allow = new Set(opts.pool);
        pool = pool.filter((c) => allow.has(c.id));
      }
      if (!pool.length) return [];

      const score = (c) => {
        const s = AiSun.srs.get(c.id);
        if (st.wrong[c.id]) return 0;                 // 틀린 것부터
        if (s && s.due <= today) return 1;            // 그다음 복습 예정
        if (s) return 2;                              // 학습한 것
        return opts.includeNew === false ? 4 : 3;     // 아직 안 배운 것
      };
      const ranked = U.shuffle(pool, rand).sort((a, b) => score(a) - score(b));

      const out = [];
      const used = new Set();
      for (const c of ranked) {
        if (out.length >= n) break;
        if (used.has(c.id)) continue;
        const q = Q.make(type, c, rand, opts);
        if (q) { out.push(q); used.add(c.id); }
      }
      // 카드 수가 문항 수보다 적으면 같은 카드에서 다른 문항을 더 뽑아 채운다.
      // (성어 15문항을 성어 카드 8장으로 만들어야 하는 하위 급수에서 필요하다.)
      let guard = 0;
      while (out.length < n && ranked.length && guard < n * 6) {
        guard += 1;
        const q = Q.make(type, ranked[guard % ranked.length], rand, opts);
        if (q) out.push(q);
      }
      return out.slice(0, n);
    },

    /** 채점 — 주관식은 공백·기호를 무시하고 비교한다 */
    check(q, input) {
      if (input == null) return false;
      const got = U.norm(input);
      if (!got) return false;
      return (q.accept || [q.answer]).some((a) => U.norm(a) === got);
    },
  };
})(window);
