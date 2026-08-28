/* AiSun — curriculum.js
 * 코퍼스 → 학습 카드 덱 변환, 26주 합격 커리큘럼, 오늘의 학습 계획 산출
 */
(function (global) {
  'use strict';

  const AiSun = global.AiSun || (global.AiSun = {});
  const U = AiSun.util;

  /* ── 시험 출제 유형과 배점 (한국어문회 1급, 총 200문항 / 90분 / 160점 합격) ── */
  const TYPES = AiSun.TYPES = [
    { k: '독음', n: 50, desc: '한자어를 읽고 한글 독음을 쓴다' },
    { k: '한자쓰기', n: 40, desc: '한글 어휘를 보고 한자로 쓴다' },
    { k: '훈음', n: 32, desc: '한자의 뜻과 소리를 쓴다' },
    { k: '완성형', n: 15, desc: '사자성어의 빈칸을 채운다' },
    { k: '반의어', n: 10, desc: '뜻이 반대인 한자·한자어를 찾는다' },
    { k: '뜻풀이', n: 10, desc: '한자어·성어의 뜻을 푼다' },
    { k: '동음이의어', n: 10, desc: '독음이 같고 뜻이 다른 한자어를 구별한다' },
    { k: '부수', n: 10, desc: '한자의 부수를 찾는다' },
    { k: '유의어', n: 10, desc: '뜻이 비슷한 한자·한자어를 찾는다' },
    { k: '장단음', n: 10, desc: '첫 음절의 장단을 판별한다' },
    { k: '약자', n: 3, desc: '정자와 약자를 서로 옮긴다' },
  ];
  const TOTAL_ITEMS = TYPES.reduce((s, t) => s + t.n, 0);   // 200
  const PASS_SCORE = 160;
  AiSun.TOTAL_ITEMS = TOTAL_ITEMS;
  AiSun.PASS_SCORE = PASS_SCORE;

  /* ── 6개월 = 26주 3단계 설계 ── */
  const WEEKS = 26;
  const NEW_WEEKS = 18;          // 19주차부터는 신규 학습을 끊고 회전·실전만 한다
  const STUDY_DOWS = [1, 2, 3, 4, 5];   // 월~금 신규 학습

  const PHASES = AiSun.PHASES = [
    {
      no: 1, name: '기반 다지기', from: 1, to: 8,
      goal: '낮은 급수부터 읽기·쓰기를 동시에 고정한다',
      detail: '이 구간의 한자는 대부분 쓰기 배정 대상이다. 배점이 가장 큰 漢字쓰기(40문항)의 토대이므로, 눈으로 보지 말고 손으로 쓰는 습관을 여기서 만든다.',
    },
    {
      no: 2, name: '1급 확장', from: 9, to: 18,
      goal: '2급·1급 신출 한자와 성어를 전량 1회전한다',
      detail: '신규 유입이 가장 많은 구간이다. 복습 부채가 쌓이지 않도록 매일 예약 복습을 먼저 끝내고 신규로 넘어간다.',
    },
    {
      no: 3, name: '실전 완성', from: 19, to: 26,
      goal: '신규를 끊고 전 범위 회전 + 실전 모의고사로 점수를 굳힌다',
      detail: '주 2회 200문항 모의고사로 90분 체력을 만들고, 오답노트와 취약 유형만 집중해 합격선 위로 끌어올린다.',
    },
  ];

  function phaseOf(week) {
    return PHASES.find((p) => week >= p.from && week <= p.to) || PHASES[PHASES.length - 1];
  }

  /* ── 급수 체계 ── 8급부터 1급까지 누계가 정확히 3,500자다 */
  const LEVELS = AiSun.LEVELS = ['8', '7II', '7', '6II', '6', '5II', '5', '4II', '4', '3II', '3', '2', '1'];
  const LEVEL_LABEL = AiSun.LEVEL_LABEL = {
    '8': '8급', '7II': '7급Ⅱ', '7': '7급', '6II': '6급Ⅱ', '6': '6급', '5II': '5급Ⅱ', '5': '5급',
    '4II': '4급Ⅱ', '4': '4급', '3II': '3급Ⅱ', '3': '3급', '2': '2급', '1': '1급',
  };
  const LEVEL_ORDER = Object.fromEntries(LEVELS.map((l, i) => [l, i]));
  const levelIdx = (lv) => (lv in LEVEL_ORDER ? LEVEL_ORDER[lv] : LEVELS.length);

  /* ── 카드 덱 ──
   * 카드 = 간격반복의 최소 단위. 한자는 읽기/쓰기 두 트랙을 따로 스케줄한다.
   * (읽을 줄 아는 것과 쓸 줄 아는 것은 별개의 인출이므로 별개 카드로 둔다.)
   */
  function buildDeck(data) {
    const cards = [];
    const byId = new Map();
    const add = (c) => { cards.push(c); byId.set(c.id, c); return c; };

    // 쉬운 급수부터. 쓰기 카드는 같은 글자의 읽기 카드 바로 뒤에 붙여 함께 배정되게 한다.
    const hanja = data.hanja.slice().sort((a, b) =>
      levelIdx(a.lv) - levelIdx(b.lv) || a.eum.localeCompare(b.eum, 'ko') || a.c.localeCompare(b.c));

    for (const h of hanja) {
      add({ id: h.id + '#read', track: 'read', kind: 'hanja', ref: h, label: h.c, write: false, lv: h.lv });
      if (h.write) add({ id: h.id + '#write', track: 'write', kind: 'hanja', ref: h, label: h.c, write: true, lv: h.lv });
    }
    const hanjaCards = cards.slice();

    const idiomCards = data.idioms.map((it) => ({ id: it.id + '#idiom', track: 'idiom', kind: 'idiom', ref: it, label: it.idiom, write: false }));
    const pairCards = data.pairs.map((p) => ({ id: p.id + '#pair', track: 'pair', kind: 'pair', ref: p, label: p.a + '↔' + p.b, write: false }));
    const homoCards = data.homonyms.map((m) => ({ id: m.id + '#homo', track: 'homo', kind: 'homo', ref: m, label: m.reading, write: false }));
    const abbrCards = data.abbrev.map((a) => ({ id: a.id + '#abbr', track: 'abbr', kind: 'abbr', ref: a, label: a.full, write: false }));
    const toneCards = data.tone.map((t) => ({ id: t.id + '#tone', track: 'tone', kind: 'tone', ref: t, label: t.word, write: false }));

    for (const c of [].concat(idiomCards, pairCards, homoCards, abbrCards, toneCards)) { cards.push(c); byId.set(c.id, c); }

    return {
      all: cards,
      byId,
      pools: { hanja: hanjaCards, idiom: idiomCards, pair: pairCards, homo: homoCards, abbr: abbrCards, tone: toneCards },
    };
  }

  /** pool을 NEW_WEEKS 주에 걸쳐 균등 배분했을 때 week주차 몫 */
  function weekSlice(pool, week) {
    if (week < 1 || week > NEW_WEEKS) return [];
    const a = Math.round((pool.length * (week - 1)) / NEW_WEEKS);
    const b = Math.round((pool.length * week) / NEW_WEEKS);
    return pool.slice(a, b);
  }

  /* ── 요일별 드릴 초점 — 한 주에 11개 유형을 빠짐없이 한 번씩 돌린다 ── */
  const DRILL_BY_DOW = {
    1: ['독음', '훈음'],
    2: ['한자쓰기', '약자'],
    3: ['완성형', '뜻풀이'],
    4: ['반의어', '유의어'],
    5: ['동음이의어', '부수', '장단음'],
    6: [],                 // 토 — 주간 종합테스트
    0: [],                 // 일 — 취약 유형 자동 선정
  };

  const C = AiSun.curriculum = {
    WEEKS, NEW_WEEKS, TYPES, TOTAL_ITEMS, PASS_SCORE, PHASES,
    deck: null,

    LEVELS, LEVEL_LABEL, levelIdx,

    init(data) {
      C.deck = buildDeck(data);
      C.refresh();
      return C.deck;
    },

    /**
     * 이미 아는 급수를 배정에서 뺀다.
     * 1급 응시자에게 8급부터 3,500자를 다시 배정하는 건 시간 낭비다. 제외된 카드도
     * 드릴과 모의고사 출제 범위에는 그대로 남으므로, 틀리면 오답노트를 통해 다시 들어온다.
     */
    refresh() {
      const known = AiSun.store.state.settings.knownLevel || '';
      const cut = known ? levelIdx(known) : -1;
      const keep = (c) => c.kind !== 'hanja' || levelIdx(c.ref.lv) > cut;
      const p = C.deck.pools;
      C.pools = {
        hanja: p.hanja.filter(keep),
        idiom: p.idiom, pair: p.pair, homo: p.homo, abbr: p.abbr, tone: p.tone,
      };
      C.assignable = [].concat(C.pools.hanja, C.pools.idiom, C.pools.pair, C.pools.homo, C.pools.abbr, C.pools.tone);
      return C.assignable;
    },

    /** 설정한 기지 급수에서 하루 몇 장을 새로 배워야 하는지 */
    load(knownLevel) {
      const cut = knownLevel ? levelIdx(knownLevel) : -1;
      const d = C.deck;
      const n = d.pools.hanja.filter((c) => levelIdx(c.ref.lv) > cut).length
        + d.pools.idiom.length + d.pools.pair.length + d.pools.homo.length
        + d.pools.abbr.length + d.pools.tone.length;
      return { total: n, perWeek: Math.round(n / NEW_WEEKS), perDay: Math.round(n / NEW_WEEKS / STUDY_DOWS.length) };
    },

    phaseOf,

    /** 주차별 신규 배정 (카드 배열) */
    weekNew(week) {
      const p = C.pools || C.deck.pools;
      if (week < 1 || week > NEW_WEEKS) return [];
      return [].concat(
        weekSlice(p.hanja, week),
        weekSlice(p.idiom, week),
        weekSlice(p.pair, week),
        weekSlice(p.homo, week),
        weekSlice(p.abbr, week),
        weekSlice(p.tone, week)
      );
    },

    /** 주차 요약 — 계획 화면용 */
    weekSummary(week) {
      const items = C.weekNew(week);
      const ph = phaseOf(week);
      const isExamWeek = C.examWeeks().includes(week);
      return {
        week, phase: ph,
        newCount: items.length,
        hanjaCount: items.filter((c) => c.kind === 'hanja').length,
        writeCount: items.filter((c) => c.track === 'write').length,
        idiomCount: items.filter((c) => c.kind === 'idiom').length,
        etcCount: items.filter((c) => ['pair', 'homo', 'abbr', 'tone'].includes(c.kind)).length,
        mock: isExamWeek,
      };
    },

    /** 200문항 실전 모의고사를 배치하는 주차 */
    examWeeks() { return [4, 8, 12, 16, 18, 19, 20, 21, 22, 23, 24, 25, 26]; },

    /** 시작일 기준 해당 날짜의 주차(1~). 범위를 벗어나면 clamp 하지 않고 그대로 준다. */
    weekOf(dateISO) {
      const start = AiSun.store.state.settings.startDate;
      return Math.floor(U.diffDays(start, dateISO) / 7) + 1;
    },

    /**
     * 오늘의 학습 계획.
     * 신규는 그 주 배정분을 월~금 5일에 나눠 담되, 밀린 분량은 자동으로 따라온다.
     */
    plan(dateISO) {
      const date = dateISO || U.today();
      const st = AiSun.store.state;
      const start = st.settings.startDate;
      const dayIndex = U.diffDays(start, date);
      const week = Math.floor(dayIndex / 7) + 1;
      const dow = U.dow(date);
      const ph = phaseOf(week);

      const beforeStart = dayIndex < 0;
      const afterPlan = week > WEEKS;

      // 이 주의 신규를 학습 요일 수로 나눈다
      let newCards = [];
      if (!beforeStart && week <= NEW_WEEKS && STUDY_DOWS.includes(dow)) {
        const weekItems = C.weekNew(week);
        const slot = STUDY_DOWS.indexOf(dow);
        const per = Math.ceil(weekItems.length / STUDY_DOWS.length);
        newCards = weekItems.slice(slot * per, (slot + 1) * per);
      }
      // 이미 학습을 시작한 카드는 신규에서 뺀다 (밀린 날 중복 방지)
      newCards = newCards.filter((c) => AiSun.srs.isNew(c.id));

      // 밀린 신규 따라잡기 — 이번 주 배정 중 아직 손대지 않은 것을 하루 30장까지 얹는다
      let backlog = [];
      if (!beforeStart && week <= NEW_WEEKS && STUDY_DOWS.includes(dow)) {
        const seen = new Set(newCards.map((c) => c.id));
        for (let w = Math.max(1, week - 1); w <= week; w++) {
          for (const c of C.weekNew(w)) {
            if (!seen.has(c.id) && AiSun.srs.isNew(c.id)) { backlog.push(c); seen.add(c.id); }
          }
        }
        backlog = backlog.slice(0, 30);
      }

      const due = AiSun.srs.dueList(date);

      // 드릴 초점
      let drill = DRILL_BY_DOW[dow].slice();
      if (dow === 0) drill = C.weakTypes(2);
      if (week > NEW_WEEKS && dow !== 6) drill = U.uniqBy(drill.concat(C.weakTypes(1)), (x) => x).slice(0, 3);

      // 시험(테스트) 배치
      let test = null;
      if (dow === 6) {
        test = C.examWeeks().includes(week)
          ? { kind: 'mock', size: TOTAL_ITEMS, minutes: 90, title: `${week}주차 실전 모의고사` }
          : { kind: 'weekly', size: 100, minutes: 45, title: `${week}주차 주간 종합테스트` };
      } else if (week > NEW_WEEKS && dow === 3) {
        test = { kind: 'mock', size: TOTAL_ITEMS, minutes: 90, title: `${week}주차 주중 모의고사` };
      }

      const dDay = U.diffDays(date, st.settings.examDate);

      return {
        date, dayIndex, week, dow, phase: ph, beforeStart, afterPlan,
        newCards, backlog, dueIds: due, drill, test, dDay,
        minutes: st.settings.dailyMinutes,
        isRestDay: dow === 0 && week <= NEW_WEEKS,
      };
    },

    /** 최근 성적이 가장 나쁜 유형 n개 */
    weakTypes(n) {
      const st = AiSun.store.state;
      const scored = TYPES.map((t) => {
        const b = st.byType[t.k];
        const rate = b && b.t >= 5 ? b.c / b.t : 0.5;   // 표본이 적으면 중립값
        return { k: t.k, rate, t: b ? b.t : 0 };
      }).sort((a, b) => a.rate - b.rate || b.t - a.t);
      return scored.slice(0, n || 2).map((x) => x.k);
    },

    /** 진도율 — 덱 전체 중 학습을 시작한 카드 비율 */
    progress() {
      const pool = C.assignable || C.deck.all;
      const total = pool.length;
      let started = 0, mature = 0;
      for (const c of pool) {
        const s = AiSun.srs.get(c.id);
        if (s) { started += 1; if (s.ivl >= 21) mature += 1; }
      }
      return { total, started, mature, pct: U.pct(started, total), maturePct: U.pct(mature, total) };
    },

    /**
     * 예상 점수 — 유형별 최근 정답률에 실제 배점을 곱해 200점으로 환산한다.
     * 표본이 없는 유형은 계산에서 빼고 `covered`로 신뢰도를 함께 돌려준다.
     */
    projectedScore() {
      const st = AiSun.store.state;
      let score = 0, coveredItems = 0;
      const rows = TYPES.map((t) => {
        const recent = st.recent.filter((r) => r.type === t.k).slice(-40);
        const b = st.byType[t.k];
        let rate = null;
        if (recent.length >= 5) rate = recent.filter((r) => r.ok).length / recent.length;
        else if (b && b.t >= 5) rate = b.c / b.t;
        if (rate != null) { score += rate * t.n; coveredItems += t.n; }
        return { type: t.k, n: t.n, rate, samples: b ? b.t : 0 };
      });
      const projected = coveredItems ? Math.round(score * (TOTAL_ITEMS / coveredItems)) : null;
      return {
        rows,
        raw: Math.round(score),
        projected,
        covered: U.pct(coveredItems, TOTAL_ITEMS),
        pass: projected != null && projected >= PASS_SCORE,
      };
    },
  };
})(window);
