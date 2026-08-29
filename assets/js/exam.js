/* AiSun — exam.js
 * 급수별 모의고사 조립 · 채점 · 약점 분석.
 *
 * 시험은 급수마다 문항 수도, 유형 배분도, 합격선도 다르다. data/src/levels.tsv 의
 * 규격을 그대로 따르고, 출제 범위는 그 급수까지 배운 카드로 제한한다.
 */
(function (global) {
  'use strict';

  const AiSun = global.AiSun || (global.AiSun = {});
  const U = AiSun.util;

  /* 부수 입문 단계에는 실제 시험이 없다. 졸업을 판단할 자체 규격을 둔다. */
  const RADICAL_SPEC = {
    lv: 'radical', label: '부수', items: 60, pass: 80, minutes: 20, passItems: 48,
    types: [{ k: '부수훈음', n: 30 }, { k: '부수찾기', n: 20 }, { k: '획수', n: 10 }],
  };

  /** 총 문항이 규격과 다를 때(중간 점검 등) 유형별 문항을 비율대로 줄인다 */
  function scaleSpec(types, from, to) {
    const out = types.map((t) => ({ k: t.k, n: Math.max(1, Math.round((t.n * to) / from)) }));
    let diff = to - out.reduce((s, x) => s + x.n, 0);
    const order = out.slice().sort((a, b) => b.n - a.n);
    let i = 0;
    while (diff !== 0 && order.length && i < 500) {
      const t = order[i % order.length];
      if (diff > 0) { t.n += 1; diff -= 1; }
      else if (t.n > 1) { t.n -= 1; diff += 1; }
      i += 1;
    }
    return out;
  }

  const E = AiSun.exam = {
    RADICAL_SPEC,

    specFor(levelKey) {
      if (levelKey === AiSun.curriculum.RADICAL_STAGE) return RADICAL_SPEC;
      return AiSun.curriculum.spec(levelKey);
    },

    /**
     * 급수 규격대로 한 세트를 조립한다.
     * 하위 급수는 배운 범위가 좁아 유의어·약자처럼 재료가 모자라는 유형이 생긴다.
     * 그럴 때 빈자리를 비워 두면 문항 수가 안 맞으므로, 재료가 넉넉한 기본 유형으로 채우고
     * 무엇을 얼마나 대체했는지 결과에 남긴다.
     */
    build(levelKey, opts) {
      opts = opts || {};
      const sp = E.specFor(levelKey);
      if (!sp) return null;

      const total = opts.size || sp.items;
      const rand = U.rng(opts.seed || Date.now());
      const scope = AiSun.curriculum.scope(levelKey);
      const charScope = AiSun.curriculum.charScope(levelKey);
      const types = total === sp.items ? sp.types : scaleSpec(sp.types, sp.items, total);

      const fallback = levelKey === AiSun.curriculum.RADICAL_STAGE
        ? ['부수훈음', '부수찾기'] : ['독음', '훈음'];

      const items = [];
      const short = [];
      for (const t of types) {
        const qs = AiSun.quiz.byType(t.k, t.n, {
          rand, forceChoice: true, pool: scope, charScope, includeNew: opts.includeNew,
        });
        for (const q of qs) items.push(q);
        if (qs.length < t.n) short.push({ type: t.k, missing: t.n - qs.length });
      }

      // 모자란 만큼 기본 유형으로 채운다
      let missing = total - items.length;
      for (const f of fallback) {
        if (missing <= 0) break;
        const qs = AiSun.quiz.byType(f, missing, { rand, forceChoice: true, pool: scope, charScope });
        for (const q of qs) items.push(q);
        missing = total - items.length;
      }

      // 시험지 순서 — 규격에 적힌 유형 순서 그대로
      const rank = {};
      sp.types.forEach((t, i) => { rank[t.k] = i; });
      items.sort((a, b) => (rank[a.type] ?? 99) - (rank[b.type] ?? 99));
      items.forEach((q, i) => { q.no = i + 1; });

      return {
        kind: opts.kind || 'mock',
        levelKey,
        levelLabel: sp.label,
        title: opts.title || `${sp.label} 모의고사`,
        minutes: opts.minutes || sp.minutes,
        passItems: Math.ceil((items.length * sp.pass) / 100),
        passPct: sp.pass,
        items, spec: types, shortfall: short,
        startedAt: Date.now(),
      };
    },

    /** 유형 드릴 — 한 유형만 집중해서. 범위는 지금 도전 중인 급수까지. */
    drill(type, n, opts) {
      opts = opts || {};
      const rand = U.rng(opts.seed || Date.now());
      const levelKey = opts.levelKey || AiSun.curriculum.currentStage();
      const items = AiSun.quiz.byType(type, n || 20, Object.assign({
        rand,
        pool: AiSun.curriculum.scope(levelKey),
        charScope: AiSun.curriculum.charScope(levelKey),
      }, opts));
      items.forEach((q, i) => { q.no = i + 1; });
      return {
        kind: 'drill', levelKey, title: `${type} 집중 드릴`, minutes: 0,
        items, spec: [{ k: type, n: items.length }], shortfall: [], startedAt: Date.now(),
      };
    },

    /** 오답노트 재도전 */
    retryWrong(n, opts) {
      opts = opts || {};
      const rand = U.rng(opts.seed || Date.now());
      const st = AiSun.store.state;
      const deck = AiSun.curriculum.deck;
      const ids = Object.keys(st.wrong)
        .sort((a, b) => (st.wrong[b].n - st.wrong[a].n) || (st.wrong[b].lastTs - st.wrong[a].lastTs));
      const items = [];
      for (const id of ids) {
        if (items.length >= (n || 30)) break;
        const card = deck.byId.get(id);
        if (!card) { delete st.wrong[id]; continue; }
        const wantType = st.wrong[id].type;
        const q = (wantType && AiSun.quiz.make(wantType, card, rand, { forceChoice: true }))
          || AiSun.quiz.fromCard(card, rand, { forceChoice: true });
        if (q) items.push(q);
      }
      items.forEach((q, i) => { q.no = i + 1; });
      return { kind: 'wrong', title: '오답 재도전', minutes: 0, items, spec: [], shortfall: [], startedAt: Date.now() };
    },

    /**
     * 채점. 채점과 동시에 간격반복과 오답노트에 반영한다.
     * 합격 판정은 그 급수의 합격선(1급 80%, 그 아래 70%)을 따른다.
     */
    grade(exam, answers, opts) {
      opts = opts || {};
      const byType = {};
      let correct = 0;

      exam.items.forEach((q, i) => {
        const input = answers[i];
        const ok = AiSun.quiz.check(q, input);
        q._input = input == null ? '' : input;
        q._ok = ok;
        if (ok) correct += 1;
        const b = byType[q.type] || (byType[q.type] = { c: 0, t: 0 });
        b.t += 1; if (ok) b.c += 1;

        if (opts.applySrs !== false && q.cardId) {
          AiSun.srs.review(q.cardId, ok ? AiSun.GRADE.GOOD : AiSun.GRADE.AGAIN, {
            type: q.type, write: q.type === '한자쓰기',
          });
        }
      });

      const total = exam.items.length;
      const passItems = exam.passItems != null ? exam.passItems
        : Math.ceil((total * (exam.passPct || 70)) / 100);
      const result = {
        ts: Date.now(),
        date: U.today(),
        kind: exam.kind,
        levelKey: exam.levelKey || null,
        levelLabel: exam.levelLabel || '',
        title: exam.title,
        total, correct,
        rate: U.pct(correct, total),
        passItems,
        pass: correct >= passItems,
        byType,
        elapsed: Math.round((Date.now() - exam.startedAt) / 1000),
      };

      if (exam.kind === 'gate' || exam.kind === 'mock' || exam.kind === 'check') {
        AiSun.store.state.exams.push(result);
        if (AiSun.store.state.exams.length > 80) AiSun.store.state.exams.shift();
        AiSun.store.checks().test = true;
      }
      AiSun.store.saveNow();
      // 관문을 채웠으면 다음 칸을 연다
      result.cleared = AiSun.curriculum.settleGates();
      return result;
    },

    /** 유형별 결과를 "잃은 문항" 순으로 — 어디부터 메울지 바로 보이게 */
    weakness(result, exam) {
      const order = (exam && exam.spec) || [];
      const rank = {};
      order.forEach((t, i) => { rank[t.k] = i; });
      return Object.keys(result.byType).map((k) => {
        const b = result.byType[k];
        return {
          type: k, weight: b.t, rate: U.pct(b.c, b.t),
          lost: b.t - b.c, order: rank[k] ?? 99,
        };
      }).sort((a, b) => b.lost - a.lost || a.order - b.order);
    },
  };
})(window);
