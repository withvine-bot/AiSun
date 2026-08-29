/* AiSun — 부수에서 1급까지
 * core.js : 공통 유틸 · 영속 저장소 · 간격반복(SRS) 엔진
 * 의존성 없음. file:// 로 열어도 동작하도록 전역 네임스페이스를 쓴다.
 */
(function (global) {
  'use strict';

  const AiSun = global.AiSun || (global.AiSun = {});

  /* ─────────────── 유틸 ─────────────── */

  const U = AiSun.util = {
    pad: (n) => String(n).padStart(2, '0'),
    iso(d) {
      const x = d instanceof Date ? d : new Date(d);
      return `${x.getFullYear()}-${U.pad(x.getMonth() + 1)}-${U.pad(x.getDate())}`;
    },
    today: () => U.iso(new Date()),
    addDays(isoDate, n) {
      const d = new Date(isoDate + 'T00:00:00');
      d.setDate(d.getDate() + n);
      return U.iso(d);
    },
    /** a에서 b까지의 일수(b - a). 음수 가능. */
    diffDays(a, b) {
      const ms = new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00');
      return Math.round(ms / 86400000);
    },
    /** 0=일 … 6=토 */
    dow: (isoDate) => new Date(isoDate + 'T00:00:00').getDay(),
    dowName: (isoDate) => '일월화수목금토'[U.dow(isoDate)],

    clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
    esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
      ));
    },
    /** 공백·문장부호를 지우고 비교용으로 정규화 */
    norm: (s) => String(s == null ? '' : s).replace(/[\s·.,()[\]{}'"~\-]/g, '').trim(),

    /** 시드 고정 난수 — 같은 날 같은 세션은 항상 같은 문제를 낸다 */
    rng(seed) {
      let s = 0;
      const str = String(seed);
      for (let i = 0; i < str.length; i++) s = (s * 31 + str.charCodeAt(i)) >>> 0;
      s = s || 1;
      return function () {
        s ^= s << 13; s >>>= 0;
        s ^= s >> 17;
        s ^= s << 5; s >>>= 0;
        return s / 4294967296;
      };
    },
    shuffle(arr, rand) {
      const a = arr.slice();
      const r = rand || Math.random;
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    sample(arr, n, rand) { return U.shuffle(arr, rand).slice(0, n); },
    pick(arr, rand) { return arr[Math.floor((rand || Math.random)() * arr.length)]; },
    uniqBy(arr, key) {
      const seen = new Set(); const out = [];
      for (const x of arr) { const k = key(x); if (!seen.has(k)) { seen.add(k); out.push(x); } }
      return out;
    },
    pct: (c, t) => (t ? Math.round((c / t) * 100) : 0),
  };

  /* ─────────────── 저장소 ─────────────── */

  const KEY = 'aisun.plan1.v1';

  function blankState() {
    const today = U.today();
    return {
      version: 1,
      settings: {
        startDate: today,
        // 사다리를 어디서 시작할지. 'radical' = 부수부터, 그 밖에는 급수 키('8','7II'…).
        startStage: 'radical',
        targetLevel: '1',
        dailyNew: 20,                      // 하루 신규 카드 목표 — 진도와 기간 추정의 기준
        answerMode: 'auto',                // auto | choice — 학습 세션 채점 방식
        dailyMinutes: 60,
        onboarded: false,
      },
      stages: {},       // 단계키 -> {cleared, clearedAt}
      srs: {},          // cardId -> {ivl, ef, due, reps, lapses, last}
      wrong: {},        // cardId -> {n, lastTs, type}
      recent: [],       // 최근 풀이 {ts, type, ok} (최대 800)
      byType: {},       // type -> {c, t}
      daily: {},        // 'YYYY-MM-DD' -> {new, rev, drill, cards, c, t, min}
      checks: {},       // 'YYYY-MM-DD' -> {learn:bool, review:bool, drill:bool, test:bool}
      exams: [],        // {ts, date, levelKey, score, rate, pass, byType, elapsed}
      notes: {},        // cardId -> 사용자 메모
    };
  }

  const S = AiSun.store = {
    state: null,
    _timer: null,

    load() {
      let raw = null;
      try { raw = global.localStorage.getItem(KEY); } catch (e) { /* 사생활 보호 모드 등 */ }
      if (!raw) { S.state = blankState(); return S.state; }
      try {
        const parsed = JSON.parse(raw);
        S.state = Object.assign(blankState(), parsed);
        S.state.settings = Object.assign(blankState().settings, parsed.settings || {});
      } catch (e) {
        console.warn('저장 데이터를 읽지 못해 새로 시작합니다.', e);
        S.state = blankState();
      }
      return S.state;
    },

    /** 잦은 호출을 대비해 250ms 디바운스 */
    save() {
      if (S._timer) return;
      S._timer = setTimeout(() => {
        S._timer = null;
        try { global.localStorage.setItem(KEY, JSON.stringify(S.state)); }
        catch (e) { console.warn('저장 실패(용량 초과일 수 있음)', e); }
      }, 250);
    },
    saveNow() {
      if (S._timer) { clearTimeout(S._timer); S._timer = null; }
      try { global.localStorage.setItem(KEY, JSON.stringify(S.state)); } catch (e) { /* noop */ }
    },
    reset() { S.state = blankState(); S.saveNow(); },
    export() { return JSON.stringify(S.state, null, 2); },
    import(json) {
      const parsed = JSON.parse(json);
      if (!parsed || typeof parsed !== 'object' || !parsed.srs) throw new Error('형식이 올바르지 않은 백업 파일입니다.');
      S.state = Object.assign(blankState(), parsed);
      S.state.settings = Object.assign(blankState().settings, parsed.settings || {});
      S.saveNow();
    },

    /* 일일 기록 */
    day(date) {
      const d = date || U.today();
      return S.state.daily[d] || (S.state.daily[d] = { new: 0, rev: 0, cards: 0, c: 0, t: 0, min: 0 });
    },
    checks(date) {
      const d = date || U.today();
      return S.state.checks[d] || (S.state.checks[d] = { learn: false, review: false, drill: false, test: false });
    },
  };

  /* ─────────────── SRS 엔진 ─────────────── */
  /* SM-2 변형. 한자 학습 특성을 반영해 두 가지를 손봤다.
   *  1) 쓰기(write) 트랙은 인출 난도가 높아 간격을 20% 짧게 잡는다.
   *  2) 8회 이상 실패한 카드(leech)는 자동으로 오답노트에 고정 편입한다.
   */

  const GRADE = { AGAIN: 0, HARD: 1, GOOD: 2, EASY: 3 };
  const LEARN_STEPS = [0, 1, 3];      // 졸업 전 간격(일). 0 = 같은 세션 내 재출제
  const LEECH_AT = 8;

  const SRS = AiSun.srs = {
    GRADE, LEECH_AT,

    get(cardId) {
      return S.state.srs[cardId] || null;
    },
    ensure(cardId) {
      return S.state.srs[cardId] || (S.state.srs[cardId] = {
        ivl: 0, ef: 2.5, due: U.today(), reps: 0, lapses: 0, last: null, step: 0,
      });
    },
    isNew(cardId) { return !S.state.srs[cardId]; },
    isDue(cardId, date) {
      const c = S.state.srs[cardId];
      if (!c) return false;
      return c.due <= (date || U.today());
    },
    isLeech(cardId) {
      const c = S.state.srs[cardId];
      return !!c && c.lapses >= LEECH_AT;
    },

    /**
     * 채점 결과를 반영하고 다음 복습일을 계산한다.
     * @param {string} cardId
     * @param {number} grade  0=모름 1=애매 2=맞음 3=완벽
     * @param {{write?:boolean, type?:string}} opts
     * @returns {{due:string, ivl:number, again:boolean}}
     */
    review(cardId, grade, opts) {
      opts = opts || {};
      const c = SRS.ensure(cardId);
      const today = U.today();
      // 쓰기 트랙은 인출 난도가 높다. 간격을 20% 줄여 잡고, 그 축소가 복습마다 누적되게 한다.
      const wf = opts.write ? 0.8 : 1;
      c.reps += 1;
      c.last = today;

      let again = false;

      if (grade === GRADE.AGAIN) {
        c.lapses += 1;
        c.ef = Math.max(1.3, c.ef - 0.2);
        c.step = 0;
        c.ivl = 0;
        c.due = today;             // 같은 세션 안에서 다시 만난다
        again = true;
        SRS._markWrong(cardId, opts.type);
      } else if (c.step < LEARN_STEPS.length) {
        // 학습 단계 — 아직 졸업 전
        if (grade === GRADE.HARD) {
          c.due = today;
          again = true;
        } else {
          c.step += grade === GRADE.EASY ? 2 : 1;
          if (c.step >= LEARN_STEPS.length) {
            c.ivl = Math.max(1, Math.round((grade === GRADE.EASY ? 5 : 3) * wf));   // 졸업
          } else {
            c.ivl = Math.max(0, Math.round(LEARN_STEPS[c.step] * wf));
            if (c.ivl === 0) { c.due = today; again = true; }
          }
          if (!again) c.due = U.addDays(today, c.ivl);
        }
      } else {
        // 복습 단계 — SM-2 간격 계산
        const q = grade === GRADE.HARD ? 3 : grade === GRADE.GOOD ? 4 : 5;
        c.ef = U.clamp(c.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)), 1.3, 2.8);
        const mult = grade === GRADE.HARD ? 1.2 : grade === GRADE.EASY ? c.ef * 1.3 : c.ef;
        c.ivl = U.clamp(Math.round(Math.max(1, c.ivl) * mult * wf), 1, 180);
        c.due = U.addDays(today, c.ivl);
      }

      if (grade >= GRADE.GOOD && S.state.wrong[cardId] && c.lapses < LEECH_AT) {
        // 두 번 연속으로 맞히면 오답노트에서 자연 졸업
        S.state.wrong[cardId].n = Math.max(0, S.state.wrong[cardId].n - 1);
        if (S.state.wrong[cardId].n === 0) delete S.state.wrong[cardId];
      }

      SRS._log(opts.type, grade >= GRADE.GOOD);
      S.save();
      return { due: c.due, ivl: c.ivl, again };
    },

    _markWrong(cardId, type) {
      const w = S.state.wrong[cardId] || (S.state.wrong[cardId] = { n: 0, lastTs: 0, type: type || '' });
      w.n += 1;
      w.lastTs = Date.now();
      if (type) w.type = type;
    },
    _log(type, ok) {
      const st = S.state;
      if (type) {
        const b = st.byType[type] || (st.byType[type] = { c: 0, t: 0 });
        b.t += 1; if (ok) b.c += 1;
        st.recent.push({ ts: Date.now(), type, ok: !!ok });
        if (st.recent.length > 800) st.recent.splice(0, st.recent.length - 800);
      }
      const d = S.day();
      d.t += 1; if (ok) d.c += 1; d.cards += 1;
    },

    /** 오늘(또는 지정일) 기준 복습 대기 카드 id 목록 */
    dueList(date) {
      const d = date || U.today();
      const out = [];
      for (const id in S.state.srs) if (S.state.srs[id].due <= d) out.push(id);
      return out;
    },

    /** 앞으로 n일간 예약된 복습량 */
    forecast(n) {
      const today = U.today();
      const buckets = new Array(n).fill(0);
      let overdue = 0;
      for (const id in S.state.srs) {
        const diff = U.diffDays(today, S.state.srs[id].due);
        if (diff < 0) overdue += 1;
        else if (diff < n) buckets[diff] += 1;
      }
      buckets[0] += overdue;
      return buckets;
    },
  };

  AiSun.GRADE = GRADE;
})(window);
