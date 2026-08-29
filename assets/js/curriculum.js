/* AiSun — curriculum.js
 * 급수 사다리: 부수 입문 → 8급 → 7급Ⅱ → … → 1급.
 *
 * 고정된 몇 주짜리 계획이 아니라, 단계마다 관문이 있는 사다리다.
 * 각 단계는 (1) 배정 카드를 모두 학습하고 (2) 그 급수 모의고사를 합격선 이상으로
 * 두 번 넘겨야 열린다. 진도는 학습자의 실제 속도를 따라가고, 남은 기간은 그 속도로 추정한다.
 */
(function (global) {
  'use strict';

  const AiSun = global.AiSun || (global.AiSun = {});
  const U = AiSun.util;

  /* ── 급수 규격 (data/src/levels.tsv 에서 옴) ── */
  let LEVELS = [];                      // [{lv,label,read,write,items,pass,minutes,passItems,types}]
  const BY_LV = new Map();
  const lvIndex = (lv) => { const i = LEVELS.findIndex((l) => l.lv === lv); return i < 0 ? LEVELS.length : i; };
  const spec = (lv) => BY_LV.get(lv) || null;

  /* ── 단계(스테이지) ── 부수 입문 한 칸 + 급수 13칸 ── */
  const RADICAL_STAGE = 'radical';

  /** 각 유형이 처음 출제되는 급수 — 그보다 낮은 단계에는 그 유형 자료를 배정하지 않는다 */
  const firstTestedAt = new Map();

  /* ── 단계별 안내문 ── 학습자가 지금 무엇을 하는 중인지 알아야 버틴다 ── */
  const STAGE_NOTE = {
    radical: {
      title: '부수 입문',
      goal: '한자의 알파벳 214자를 익힌다',
      detail: '부수를 모르면 한자는 그림 3,500장이 된다. 부수를 알면 처음 보는 글자도 뜻을 짐작하고, ' +
        '사전을 찾고, 비슷한 글자를 구별할 수 있다. 여기가 가장 중요한 투자다.',
    },
    '8': { title: '8급', goal: '가장 기본이 되는 50자', detail: '숫자·요일·가족처럼 매일 보는 글자들이다. 쓰기는 아직 없다.' },
    '7II': { title: '7급Ⅱ', goal: '생활 한자로 넓힌다', detail: '읽기 100자. 여기서부터 획수 문항이 붙는다.' },
    '7': { title: '7급', goal: '읽기 150자', detail: '반의어·완성형이 본격적으로 나온다.' },
    '6II': { title: '6급Ⅱ', goal: '쓰기가 시작된다', detail: '8급 50자를 손으로 쓸 수 있어야 한다. 눈으로만 보면 여기서 막힌다.' },
    '6': { title: '6급', goal: '읽기 300자 · 쓰기 150자', detail: '동음이의어와 유의어가 더해진다.' },
    '5II': { title: '5급Ⅱ', goal: '읽기 400자 · 부수 문항 등장', detail: '입문 단계에서 익힌 부수가 점수로 돌아온다.' },
    '5': { title: '5급', goal: '읽기 500자 · 쓰기 300자', detail: '초등 과정의 마무리 지점이다.' },
    '4II': { title: '4급Ⅱ', goal: '읽기 750자 · 약자 등장', detail: '신문과 교과서의 한자어가 읽히기 시작한다.' },
    '4': { title: '4급', goal: '읽기 1,000자 · 장단음 등장', detail: '네 자리 수 고지. 여기까지 오면 절반을 넘긴 셈이다.' },
    '3II': { title: '3급Ⅱ', goal: '읽기 1,500자 · 문항 150개', detail: '시험 형식이 커진다. 시간 배분 연습이 필요해진다.' },
    '3': { title: '3급', goal: '읽기 1,817자 · 쓰기 1,000자', detail: '상용한자를 다 읽는 단계. 사회적으로도 인정받는 급수다.' },
    '2': { title: '2급', goal: '읽기 2,355자 · 쓰기 1,817자', detail: '쓰기 부담이 급격히 늘어난다. 손으로 쓰는 시간을 늘려야 한다.' },
    '1': { title: '1급', goal: '읽기 3,500자 · 쓰기 2,005자', detail: '마지막 칸. 합격선도 70%가 아니라 80%로 올라간다.' },
  };

  /* ── 카드 덱 ──
   * 카드 = 간격반복의 최소 단위. 모든 카드는 자기가 속한 단계를 알고 있다.
   */
  function buildDeck(data) {
    const cards = [];
    const byId = new Map();
    const add = (c) => { cards.push(c); byId.set(c.id, c); return c; };

    /* 1) 부수 214자 — 입문 단계 */
    for (const r of data.radicals) {
      add({ id: r.id + '#rad', track: 'rad', kind: 'radical', ref: r, label: r.c, stage: RADICAL_STAGE });
    }

    /* 2) 한자 — 읽기 카드는 그 글자의 급수, 쓰기 카드는 쓰기 범위에 들어오는 급수 */
    const hanja = data.hanja.slice().sort((a, b) =>
      lvIndex(a.lv) - lvIndex(b.lv) || a.eum.localeCompare(b.eum, 'ko') || a.c.localeCompare(b.c));

    // 쓰기 배정은 "누적 몇 자까지"로 주어진다. 급수 순으로 정렬한 위치가 곧 그 경계다.
    const writeStage = (pos) => {
      for (const l of LEVELS) if (l.write > pos) return l.lv;
      return null;                       // 어느 급수에서도 쓰기 대상이 아니다
    };

    hanja.forEach((h, pos) => {
      add({ id: h.id + '#read', track: 'read', kind: 'hanja', ref: h, label: h.c, stage: h.lv, write: false });
      const ws = writeStage(pos);
      if (ws) add({ id: h.id + '#write', track: 'write', kind: 'hanja', ref: h, label: h.c, stage: ws, write: true });
    });

    /* 3) 보조 자료 — 구성 한자가 모두 범위에 들어오고, 그 유형이 출제되기 시작하는 단계부터 */
    const charLv = new Map(data.hanja.map((h) => [h.c, lvIndex(h.lv)]));
    const lastLv = LEVELS[LEVELS.length - 1].lv;
    const stageForChars = (text, type) => {
      let need = 0;
      for (const ch of text) {
        if (ch < '一' || ch > '鿿') continue;
        const i = charLv.has(ch) ? charLv.get(ch) : LEVELS.length;   // 범위 밖 글자는 마지막 급수로
        if (i > need) need = i;
      }
      const t = firstTestedAt.has(type) ? firstTestedAt.get(type) : 0;
      const idx = Math.min(Math.max(need, t), LEVELS.length - 1);
      return LEVELS[idx] ? LEVELS[idx].lv : lastLv;
    };

    for (const it of data.idioms) {
      add({ id: it.id + '#idiom', track: 'idiom', kind: 'idiom', ref: it, label: it.idiom,
        stage: stageForChars(it.idiom, '완성형') });
    }
    for (const p of data.pairs) {
      add({ id: p.id + '#pair', track: 'pair', kind: 'pair', ref: p, label: p.a + '↔' + p.b,
        stage: stageForChars(p.a + p.b, p.kind === '반의' ? '반의어' : '유의어') });
    }
    for (const m of data.homonyms) {
      add({ id: m.id + '#homo', track: 'homo', kind: 'homo', ref: m, label: m.reading,
        stage: stageForChars(m.words.map((w) => w.w).join(''), '동음이의어') });
    }
    for (const a of data.abbrev) {
      add({ id: a.id + '#abbr', track: 'abbr', kind: 'abbr', ref: a, label: a.full,
        stage: stageForChars(a.full, '약자') });
    }
    for (const t of data.tone) {
      add({ id: t.id + '#tone', track: 'tone', kind: 'tone', ref: t, label: t.word,
        stage: stageForChars(t.word, '장단음') });
    }

    return { all: cards, byId };
  }

  const C = AiSun.curriculum = {
    RADICAL_STAGE,
    deck: null,
    stages: [],          // [{key,label,note,cards,...}] — 사다리 순서 그대로
    byStage: new Map(),

    get LEVELS() { return LEVELS; },
    spec, lvIndex,
    label: (key) => (key === RADICAL_STAGE ? '부수' : (spec(key) ? spec(key).label : key)),
    note: (key) => STAGE_NOTE[key] || { title: C.label(key), goal: '', detail: '' },

    init(data) {
      LEVELS = data.levels || [];
      BY_LV.clear();
      for (const l of LEVELS) BY_LV.set(l.lv, l);

      firstTestedAt.clear();
      LEVELS.forEach((l, i) => {
        for (const t of l.types) if (!firstTestedAt.has(t.k)) firstTestedAt.set(t.k, i);
      });

      C.deck = buildDeck(data);

      C.byStage = new Map();
      const order = [RADICAL_STAGE].concat(LEVELS.map((l) => l.lv));
      for (const k of order) C.byStage.set(k, []);
      for (const card of C.deck.all) {
        if (!C.byStage.has(card.stage)) C.byStage.set(card.stage, []);
        C.byStage.get(card.stage).push(card);
      }
      C.stages = order.map((key) => ({ key, label: C.label(key), cards: C.byStage.get(key) || [] }));

      // 급수별 출제 범위 — 그 급수 시험에 나올 수 있는 카드 전부(그 아래 단계 포함)
      C.data = data;
      C.scopeCache = new Map();
      C.charCache = new Map();
      return C.deck;
    },

    /** 단계 순서 배열 */
    order() { return C.stages.map((s) => s.key); },
    stageIndex(key) { return C.order().indexOf(key); },

    /** 그 급수 시험의 출제 범위 = 그 단계까지의 모든 카드 id */
    scope(levelKey) {
      if (C.scopeCache.has(levelKey)) return C.scopeCache.get(levelKey);
      const upto = C.stageIndex(levelKey);
      const ids = [];
      C.stages.forEach((s, i) => { if (i <= upto) for (const c of s.cards) ids.push(c.id); });
      C.scopeCache.set(levelKey, ids);
      return ids;
    },

    /**
     * 그 급수까지 배운 한자 집합. 문항 지문에 이 밖의 글자가 나오면 안 된다 —
     * 8급 학습자에게 人間의 독음을 물으면서 間을 보여 주면 시험이 아니라 함정이다.
     */
    charScope(levelKey) {
      if (C.charCache.has(levelKey)) return C.charCache.get(levelKey);
      const upto = levelKey === RADICAL_STAGE ? -1 : lvIndex(levelKey);
      const set = new Set();
      for (const h of C.data.hanja) if (lvIndex(h.lv) <= upto) set.add(h.c);
      C.charCache.set(levelKey, set);
      return set;
    },

    /* ── 진행 상황 ── */

    /** 이 단계에서 학습을 시작한 카드 수 */
    stageProgress(key) {
      const cards = C.byStage.get(key) || [];
      let started = 0, mature = 0;
      for (const c of cards) {
        const s = AiSun.srs.get(c.id);
        if (s) { started += 1; if (s.ivl >= 21) mature += 1; }
      }
      return { total: cards.length, started, mature, pct: U.pct(started, cards.length) };
    },

    /** 관문 통과 여부. 배정을 다 돌고, 그 급수 시험을 두 번 합격해야 다음 칸이 열린다. */
    gate(key) {
      const st = AiSun.store.state;
      const prog = C.stageProgress(key);
      const learned = prog.total === 0 || prog.pct >= 90;

      const sp = spec(key);
      const passesNeeded = key === RADICAL_STAGE ? 1 : 2;
      const results = st.exams.filter((e) => e.levelKey === key);
      const recent = results.slice(-5);
      const passes = recent.filter((e) => e.pass).length;

      const cleared = !!(st.stages && st.stages[key] && st.stages[key].cleared);
      return {
        key, learned, learnedPct: prog.pct,
        passes, passesNeeded,
        tested: passes >= passesNeeded,
        ready: learned && passes >= passesNeeded,
        cleared,
        attempts: results.length,
        best: results.reduce((m, e) => Math.max(m, e.rate), 0),
        passItems: sp ? sp.passItems : null,
        items: sp ? sp.items : 60,
      };
    },

    /** 관문을 채웠으면 통과 처리하고, 통과한 단계 키를 돌려준다 */
    settleGates() {
      const st = AiSun.store.state;
      st.stages = st.stages || {};
      const newlyCleared = [];
      for (const s of C.stages) {
        if (st.stages[s.key] && st.stages[s.key].cleared) continue;
        const g = C.gate(s.key);
        if (g.ready) {
          st.stages[s.key] = { cleared: true, clearedAt: U.today() };
          newlyCleared.push(s.key);
        }
      }
      if (newlyCleared.length) AiSun.store.saveNow();
      return newlyCleared;
    },

    /** 지금 올라야 할 칸 */
    currentStage() {
      const st = AiSun.store.state;
      const start = st.settings.startStage || RADICAL_STAGE;
      const target = st.settings.targetLevel || '1';
      const order = C.order();
      const from = Math.max(0, order.indexOf(start));
      const to = order.indexOf(target);
      for (let i = from; i <= (to < 0 ? order.length - 1 : to); i++) {
        const k = order[i];
        if (!(st.stages && st.stages[k] && st.stages[k].cleared)) return k;
      }
      return target;      // 목표까지 다 통과했다
    },

    /** 목표 급수에 도달했는가 */
    isComplete() {
      const st = AiSun.store.state;
      const target = st.settings.targetLevel || '1';
      return !!(st.stages && st.stages[target] && st.stages[target].cleared);
    },

    /* ── 로드맵과 기간 추정 ── */

    /**
     * 사다리 전체 그림. 남은 기간은 실제 학습 속도(설정한 하루 신규량)로 추정한다.
     * 고정된 몇 개월이 아니라 "이 속도라면 언제"를 보여 준다.
     */
    roadmap() {
      const st = AiSun.store.state;
      const start = st.settings.startStage || RADICAL_STAGE;
      const target = st.settings.targetLevel || '1';
      const perDay = Math.max(1, st.settings.dailyNew || 20);
      const perWeek = perDay * 5;                 // 주 5일 신규, 주말은 복습과 시험
      const order = C.order();
      const from = Math.max(0, order.indexOf(start));
      const to = order.indexOf(target) < 0 ? order.length - 1 : order.indexOf(target);

      let cumWeeks = 0;
      const rows = C.stages.map((s, i) => {
        const inPath = i >= from && i <= to;
        const prog = C.stageProgress(s.key);
        const gate = C.gate(s.key);
        const remaining = Math.max(0, prog.total - prog.started);
        // 배정 소화 + 관문 시험 준비 1주
        const weeks = inPath && !gate.cleared ? Math.ceil(remaining / perWeek) + (prog.total ? 1 : 0) : 0;
        if (inPath && !gate.cleared) cumWeeks += weeks;
        return {
          key: s.key, label: s.label, note: C.note(s.key),
          spec: spec(s.key),
          inPath, cards: prog.total, started: prog.started, pct: prog.pct,
          cleared: gate.cleared, gate,
          weeks, etaWeeks: inPath && !gate.cleared ? cumWeeks : null,
          etaDate: inPath && !gate.cleared ? U.addDays(U.today(), cumWeeks * 7) : null,
        };
      });

      return {
        rows, totalWeeks: cumWeeks,
        totalMonths: Math.round((cumWeeks / 4.345) * 10) / 10,
        etaDate: U.addDays(U.today(), cumWeeks * 7),
        perDay, target, start,
      };
    },

    /* ── 오늘의 계획 ── */

    /** 요일별 드릴 초점 — 지금 급수에서 실제로 출제되는 유형만 돌린다 */
    drillTypes(levelKey, dow) {
      const sp = spec(levelKey);
      const available = sp ? sp.types.map((t) => t.k) : ['독음', '훈음'];
      if (levelKey === RADICAL_STAGE) return ['부수훈음', '부수찾기'];
      if (dow === 0) return C.weakTypes(2, available);
      // 배점이 큰 유형이 더 자주 돌아오도록 요일에 펼친다
      const weighted = sp.types.slice().sort((a, b) => b.n - a.n).map((t) => t.k);
      const per = Math.max(1, Math.ceil(weighted.length / 6));
      const slot = ((dow + 6) % 7);                 // 월=0 … 토=5, 일은 위에서 처리
      const picked = weighted.slice(slot * per, slot * per + per);
      return picked.length ? picked : weighted.slice(0, 2);
    },

    plan(dateISO) {
      const date = dateISO || U.today();
      const st = AiSun.store.state;
      const dow = U.dow(date);
      const stageKey = C.currentStage();
      const sp = spec(stageKey);
      const gate = C.gate(stageKey);
      const prog = C.stageProgress(stageKey);

      // 신규 — 이 단계에서 아직 손대지 않은 카드
      const perDay = Math.max(1, st.settings.dailyNew || 20);
      const pool = (C.byStage.get(stageKey) || []).filter((c) => AiSun.srs.isNew(c.id));
      const newCards = pool.slice(0, perDay);

      const dueIds = AiSun.srs.dueList(date);
      const drill = C.drillTypes(stageKey, dow);

      // 시험 — 배정을 다 돌았으면 관문 시험, 아니면 토요일 중간 점검
      let test = null;
      if (stageKey === RADICAL_STAGE) {
        if (prog.pct >= 90 && !gate.tested) {
          test = { kind: 'gate', levelKey: stageKey, size: 60, minutes: 20, title: '부수 졸업 시험' };
        } else if (dow === 6 && prog.started >= 20) {
          test = { kind: 'check', levelKey: stageKey, size: 30, minutes: 10, title: '부수 중간 점검' };
        }
      } else if (sp) {
        if (prog.pct >= 90) {
          test = { kind: 'gate', levelKey: stageKey, size: sp.items, minutes: sp.minutes,
            title: `${sp.label} 관문 시험` };
        } else if (dow === 6 && prog.started >= 20) {
          test = { kind: 'check', levelKey: stageKey, size: Math.round(sp.items / 2),
            minutes: Math.round(sp.minutes / 2), title: `${sp.label} 중간 점검` };
        }
      }

      return {
        date, dow, stageKey, spec: sp, gate, progress: prog,
        note: C.note(stageKey),
        newCards, remainingNew: pool.length,
        dueIds, drill, test,
        isRestDay: dow === 0,
        complete: C.isComplete(),
      };
    },

    /** 최근 성적이 가장 나쁜 유형 */
    weakTypes(n, only) {
      const st = AiSun.store.state;
      const list = only && only.length ? only : C.allTypes();
      const scored = list.map((k) => {
        const b = st.byType[k];
        const rate = b && b.t >= 5 ? b.c / b.t : 0.5;
        return { k, rate, t: b ? b.t : 0 };
      }).sort((a, b) => a.rate - b.rate || b.t - a.t);
      return scored.slice(0, n || 2).map((x) => x.k);
    },

    allTypes() {
      const set = new Set();
      for (const l of LEVELS) for (const t of l.types) set.add(t.k);
      return [...set];
    },

    /** 전체 진도 — 목표 급수까지의 경로 기준 */
    progress() {
      const order = C.order();
      const st = AiSun.store.state;
      const from = Math.max(0, order.indexOf(st.settings.startStage || RADICAL_STAGE));
      const ti = order.indexOf(st.settings.targetLevel || '1');
      const to = ti < 0 ? order.length - 1 : ti;
      let total = 0, started = 0, mature = 0;
      for (let i = from; i <= to; i++) {
        const p = C.stageProgress(order[i]);
        total += p.total; started += p.started; mature += p.mature;
      }
      return { total, started, mature, pct: U.pct(started, total), maturePct: U.pct(mature, total) };
    },

    /**
     * 지금 급수 기준 예상 점수. 유형별 최근 정답률에 그 급수의 실제 배점을 곱한다.
     * 급수마다 배점이 다르므로 "1급 200점 만점"이 아니라 "지금 도전하는 급수의 만점" 기준이다.
     */
    projectedScore(levelKey) {
      const st = AiSun.store.state;
      const key = levelKey || C.currentStage();
      const sp = spec(key);
      if (!sp) return { rows: [], projected: null, covered: 0, pass: false, spec: null };

      let score = 0, coveredItems = 0;
      const rows = sp.types.map((t) => {
        const recent = st.recent.filter((r) => r.type === t.k).slice(-40);
        const b = st.byType[t.k];
        let rate = null;
        if (recent.length >= 5) rate = recent.filter((r) => r.ok).length / recent.length;
        else if (b && b.t >= 5) rate = b.c / b.t;
        if (rate != null) { score += rate * t.n; coveredItems += t.n; }
        return { type: t.k, n: t.n, rate, samples: b ? b.t : 0 };
      });
      const projected = coveredItems ? Math.round(score * (sp.items / coveredItems)) : null;
      return {
        rows, spec: sp,
        projected, raw: Math.round(score),
        covered: U.pct(coveredItems, sp.items),
        pass: projected != null && projected >= sp.passItems,
      };
    },
  };
})(window);
