/* AiSun — exam.js
 * 실전 모의고사(200문항/90분) · 주간 종합테스트 · 유형 드릴 조립과 채점
 */
(function (global) {
  'use strict';

  const AiSun = global.AiSun || (global.AiSun = {});
  const U = AiSun.util;

  const E = AiSun.exam = {

    /**
     * 실제 시험 배점 그대로 200문항을 조립한다.
     * size < 200 이면 각 유형을 같은 비율로 줄인다(주간 종합테스트 100문항 등).
     */
    build(size, opts) {
      opts = opts || {};
      const total = size || AiSun.TOTAL_ITEMS;
      const rand = U.rng(opts.seed || Date.now());
      const ratio = total / AiSun.TOTAL_ITEMS;

      // 반올림 오차를 마지막에 보정해 정확히 total 문항을 맞춘다
      const spec = AiSun.TYPES.map((t) => ({ k: t.k, n: Math.max(1, Math.round(t.n * ratio)) }));
      let diff = total - spec.reduce((s, x) => s + x.n, 0);
      const order = spec.slice().sort((a, b) => b.n - a.n);
      let i = 0;
      while (diff !== 0 && order.length) {
        const t = order[i % order.length];
        if (diff > 0) { t.n += 1; diff -= 1; }
        else if (t.n > 1) { t.n -= 1; diff += 1; }
        i += 1;
        if (i > 500) break;
      }

      const items = [];
      for (const s of spec) {
        const qs = AiSun.quiz.byType(s.k, s.n, {
          rand,
          forceChoice: true,           // 실전 화면에서는 4지선다로 통일해 채점을 자동화한다
          pool: opts.pool,
          includeNew: opts.includeNew,
        });
        for (const q of qs) items.push(q);
      }

      // 실제 시험지 순서대로 — 독음 → 훈음 → 쓰기 → … 유형별로 묶어 낸다
      const rank = {};
      AiSun.TYPES.forEach((t, idx) => { rank[t.k] = idx; });
      items.sort((a, b) => rank[a.type] - rank[b.type]);
      items.forEach((q, idx) => { q.no = idx + 1; });

      return {
        kind: opts.kind || 'mock',
        title: opts.title || (total >= AiSun.TOTAL_ITEMS ? '실전 모의고사' : `종합테스트 ${total}문항`),
        minutes: opts.minutes || (total >= AiSun.TOTAL_ITEMS ? 90 : Math.round(90 * ratio)),
        items,
        spec,
        startedAt: Date.now(),
      };
    },

    /** 유형 드릴 — 한 유형만 집중해서 n문항 */
    drill(type, n, opts) {
      opts = opts || {};
      const rand = U.rng(opts.seed || Date.now());
      const items = AiSun.quiz.byType(type, n || 20, Object.assign({ rand }, opts));
      items.forEach((q, i) => { q.no = i + 1; });
      return { kind: 'drill', title: `${type} 집중 드릴`, minutes: 0, items, spec: [{ k: type, n: items.length }], startedAt: Date.now() };
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
      return { kind: 'wrong', title: '오답 재도전', minutes: 0, items, spec: [], startedAt: Date.now() };
    },

    /**
     * 채점. answers 는 문항 index -> 사용자 입력.
     * 채점과 동시에 SRS 와 오답노트에 반영한다.
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
            type: q.type,
            write: q.type === '한자쓰기',
          });
        }
      });

      const total = exam.items.length;
      // 실제 시험은 200문항 200점. 문항 수가 적으면 200점으로 환산해 감각을 유지한다.
      const scaled = Math.round((correct / total) * AiSun.TOTAL_ITEMS);
      const result = {
        ts: Date.now(),
        date: U.today(),
        kind: exam.kind,
        title: exam.title,
        total,
        correct,
        rate: U.pct(correct, total),
        score: scaled,
        pass: scaled >= AiSun.PASS_SCORE,
        byType,
        elapsed: Math.round((Date.now() - exam.startedAt) / 1000),
      };

      if (exam.kind === 'mock' || exam.kind === 'weekly') {
        AiSun.store.state.exams.push(result);
        if (AiSun.store.state.exams.length > 60) AiSun.store.state.exams.shift();
        AiSun.store.checks().test = true;
      }
      AiSun.store.saveNow();
      return result;
    },

    /** 유형별 결과를 배점 기준으로 정렬해 약점 순으로 돌려준다 */
    weakness(result) {
      return AiSun.TYPES.map((t) => {
        const b = result.byType[t.k];
        if (!b) return null;
        const rate = U.pct(b.c, b.t);
        return { type: t.k, weight: t.n, rate, lost: Math.round((1 - b.c / b.t) * t.n) };
      }).filter(Boolean).sort((a, b) => b.lost - a.lost);
    },
  };
})(window);
