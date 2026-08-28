/* AiSun — views.js : 화면 렌더링과 학습 세션 러너 */
(function (global) {
  'use strict';

  const AiSun = global.AiSun || (global.AiSun = {});
  const U = AiSun.util;
  const esc = U.esc;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const view = () => document.getElementById('view');
  function mount(html) { view().innerHTML = html; view().scrollTop = 0; window.scrollTo(0, 0); }
  const go = (route) => { location.hash = '#/' + route; };
  AiSun.go = go;

  const bar = (pct, ok) => `<div class="bar${ok ? ' ok' : ''}"><i style="width:${U.clamp(pct, 0, 100)}%"></i></div>`;
  const metric = (v, l, cls) => `<div class="card metric ${cls || ''}"><div class="v">${v}</div><div class="l">${esc(l)}</div></div>`;

  /* ══════════════ 학습 세션 러너 ══════════════
   * 문항을 한 장씩 넘기며 채점 → 자기평가 → 간격반복 반영까지 처리한다.
   * 「모름」으로 평가한 카드는 세션 끝에 다시 나온다. 그날 안에 한 번은 맞히고 끝내는 구조다.
   */
  const GRADE_LABELS = [
    { g: 0, t: '모름', s: '다시 만난다' },
    { g: 1, t: '애매', s: '조금 뒤 다시' },
    { g: 2, t: '맞음', s: '정상 간격' },
    { g: 3, t: '완벽', s: '길게 미룸' },
  ];

  const lvLabel = (lv) => (AiSun.LEVEL_LABEL && AiSun.LEVEL_LABEL[lv]) || (lv + '급');

  /** 신규 카드의 학습면 — 문제를 내기 전에 먼저 보여 주는 정보 */
  const cardInfo = AiSun.cardInfo = function (card) {
    const r = card.ref;
    if (card.kind === 'hanja') {
      return `
        <div class="stem">${esc(r.c)}</div>
        <div class="hint" style="font-size:19px;color:var(--ink);margin-top:10px"><b>${esc(r.hun)} ${esc(r.eum)}</b></div>
        <div class="hint"><b>${esc(r.rad)}</b>부 ${r.resid != null ? r.resid + '획' : ''}${r.str ? ` · 총 ${r.str}획` : ''} · ${esc(lvLabel(r.lv))}${r.variant ? ` · 약자 ${esc(r.variant)}` : ''}</div>
        ${r.alts && r.alts.length ? `<div class="hint">다른 훈: ${esc(r.alts.slice(0, 3).join(' / '))}</div>` : ''}
        ${card.track === 'write' ? '<div class="hint" style="color:var(--accent)">쓰기 배정 한자 — 반드시 손으로 세 번 써 보세요.</div>' : ''}
        ${r.words.length ? `<div class="reveal" style="text-align:center">${r.words.map((w) =>
          `<div><b style="font-family:var(--han);font-size:19px">${esc(w.w)}</b>
           <span style="color:var(--dim)">${esc(w.r)}</span> — ${esc(w.d || '')}</div>`).join('')}</div>` : ''}`;
    }
    if (card.kind === 'idiom') {
      return `<div class="stem">${esc(r.idiom)}</div>
        <div class="hint" style="font-size:17px;color:var(--ink);margin-top:8px"><b>${esc(r.reading)}</b></div>
        <div class="hint">${esc(r.meaning)}</div>`;
    }
    if (card.kind === 'pair') {
      return `<div class="stem small">${esc(r.a)} <span style="color:var(--dim)">${r.kind === '반의' ? '↔' : '='}</span> ${esc(r.b)}</div>
        <div class="hint">${esc(r.aRead)} ${r.kind === '반의' ? '↔' : '='} ${esc(r.bRead)} · ${esc(r.kind)}어(${esc(r.unit)} 단위)</div>
        ${r.note ? `<div class="hint">${esc(r.note)}</div>` : ''}`;
    }
    if (card.kind === 'homo') {
      return `<div class="stem small">${esc(r.reading)}</div>
        <div class="hint">독음이 같고 뜻이 다른 한자어</div>
        <div class="reveal" style="text-align:center">${r.words.map((w) =>
          `<div><b style="font-family:var(--han);font-size:19px">${esc(w.w)}</b> — ${esc(w.d)}</div>`).join('')}</div>`;
    }
    if (card.kind === 'abbr') {
      return `<div class="stem">${esc(r.full)} <span style="color:var(--dim)">→</span> ${esc(r.abbr)}</div>
        <div class="hint" style="font-size:17px;color:var(--ink);margin-top:8px"><b>${esc(r.hun)} ${esc(r.eum)}</b></div>
        <div class="hint">정자와 약자를 함께 외웁니다.</div>`;
    }
    if (card.kind === 'tone') {
      return `<div class="stem small">${esc(r.word)}</div>
        <div class="hint" style="font-size:17px;color:var(--ink);margin-top:8px">
          <b>${esc(r.reading)}</b> · 첫소리 <b>${esc(r.tone)}음</b></div>
        <div class="hint">${esc(r.meaning)}</div>`;
    }
    return '';
  };

  const Session = AiSun.session = {
    run(pack, opts) {
      opts = opts || {};
      const queue = pack.items.slice();
      const state = {
        pack, opts, queue, i: 0, done: 0, correct: 0, total: queue.length,
        revealed: false, chosen: null, again: 0,
        introSeen: new Set(),        // 신규 학습에서 이미 학습면을 본 카드
      };
      Session._s = state;
      Session._render();
    },

    _render() {
      const s = Session._s;
      if (s.i >= s.queue.length) return Session._finish();
      const q = s.queue[s.i];
      // 처음 보는 카드는 문제부터 내지 않는다. 먼저 뜻·부수·대표 어휘를 보여 준 뒤 인출로 넘어간다.
      if (s.opts.countNew && q.cardId && !s.introSeen.has(q.cardId)) return Session._intro(q);
      const pct = U.pct(s.done, s.total + s.again);
      const isChoice = q.mode === 'choice' || (q.mode === 'input' && s.opts.forceChoice);
      const isWrite = q.mode === 'write';
      const longOpts = (q.choices || []).some((c) => String(c).length > 6);

      mount(`
        <div class="session">
          <div class="sess-head">
            <span>${esc(s.pack.title)}</span>
            ${bar(pct)}
            <span><b>${s.done}</b> / ${s.total + s.again}</span>
          </div>
          <div class="qcard">
            <div class="qtype">${esc(q.type)}</div>
            <div class="qtext">${esc(q.q)}</div>
            ${q.stem ? `<div class="stem${q.stem.length > 4 ? ' small' : ''}">${esc(q.stem)}</div>` : ''}
            ${q.hint ? `<div class="hint">${esc(q.hint)}</div>` : ''}
            <div id="answer-area"></div>
          </div>
          <div class="row end" style="margin-top:12px">
            <button class="btn ghost sm" id="btn-quit">세션 종료</button>
          </div>
          <p class="note" style="text-align:center;color:var(--dim);font-size:12px;margin-top:10px">
            <span class="kbd">Enter</span> 정답 확인 · <span class="kbd">1</span>~<span class="kbd">4</span> 자기평가
          </p>
        </div>`);

      const area = $('#answer-area');
      if (isWrite) {
        area.innerHTML = `<p class="hint">종이에 직접 써 본 뒤 정답을 확인하세요. 손으로 쓰지 않으면 쓰기 문항은 늘지 않습니다.</p>
          <div class="row" style="justify-content:center;margin-top:14px">
            <button class="btn primary" id="btn-reveal">정답 확인</button></div>`;
      } else if (isChoice) {
        area.innerHTML = `<div class="opts">${(q.choices || []).map((c, k) =>
          `<button class="opt${longOpts ? ' txt' : ''}" data-k="${k}" aria-pressed="false">${esc(c)}</button>`).join('')}</div>`;
      } else {
        area.innerHTML = `<div class="answerbox">
            <input id="inp" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="정답 입력 후 Enter">
          </div>
          <div class="row" style="justify-content:center;margin-top:12px">
            <button class="btn primary" id="btn-reveal">확인</button>
            <button class="btn ghost" id="btn-idk">모르겠음</button>
          </div>`;
        setTimeout(() => { const el = $('#inp'); if (el) el.focus(); }, 30);
      }

      $('#btn-quit').onclick = () => Session._finish(true);
      const rev = $('#btn-reveal');
      if (rev) rev.onclick = () => Session._reveal(isWrite ? null : ($('#inp') ? $('#inp').value : null));
      const idk = $('#btn-idk');
      if (idk) idk.onclick = () => Session._reveal('');
      $$('.opt').forEach((b) => { b.onclick = () => Session._reveal(q.choices[+b.dataset.k], +b.dataset.k); });

      Session._key = (e) => {
        if (e.key === 'Enter' && !Session._s.revealed) {
          const inp = $('#inp');
          if (inp || rev) { e.preventDefault(); Session._reveal(inp ? inp.value : null); }
        } else if (Session._s.revealed && '1234'.includes(e.key)) {
          e.preventDefault(); Session._grade(+e.key - 1);
        }
      };
      document.addEventListener('keydown', Session._key);
    },

    _intro(q) {
      const s = Session._s;
      const card = AiSun.curriculum.deck.byId.get(q.cardId);
      if (!card) { s.introSeen.add(q.cardId); return Session._render(); }
      const pct = U.pct(s.done, s.total + s.again);
      mount(`
        <div class="session">
          <div class="sess-head">
            <span>${esc(s.pack.title)}</span>
            ${bar(pct)}
            <span><b>${s.done}</b> / ${s.total + s.again}</span>
          </div>
          <div class="qcard">
            <div class="qtype">새 카드 · 학습</div>
            ${cardInfo(card)}
          </div>
          <div class="row" style="justify-content:center;margin-top:14px">
            <button class="btn primary" id="btn-got">익혔습니다 — 문제 풀기</button>
          </div>
          <p class="note" style="text-align:center;font-size:12px;margin-top:10px">
            <span class="kbd">Enter</span> 로도 넘어갑니다. 바로 이어서 같은 카드가 문제로 나옵니다.</p>
        </div>`);
      const next = () => {
        document.removeEventListener('keydown', Session._key);
        s.introSeen.add(q.cardId);
        Session._render();
      };
      $('#btn-got').onclick = next;
      Session._key = (e) => { if (e.key === 'Enter') { e.preventDefault(); next(); } };
      document.addEventListener('keydown', Session._key);
    },

    _reveal(input, chosenIdx) {
      const s = Session._s;
      if (s.revealed) return;
      const q = s.queue[s.i];
      s.revealed = true;
      const selfGraded = input === null;                    // 쓰기 문항 — 사용자가 직접 평가
      const ok = selfGraded ? null : AiSun.quiz.check(q, input);
      s.lastOk = ok;
      q._input = input == null ? '' : input;

      if (chosenIdx != null) {
        $$('.opt').forEach((b) => {
          const val = q.choices[+b.dataset.k];
          if (U.norm(val) === U.norm(q.answer)) b.classList.add('correct');
          else if (+b.dataset.k === chosenIdx) b.classList.add('wrong');
          b.disabled = true;
        });
      }

      const suggest = selfGraded ? 2 : (ok ? 2 : 0);
      const area = $('#answer-area');
      area.insertAdjacentHTML('beforeend', `
        <div class="reveal">
          ${selfGraded ? '' : `<div class="verdict ${ok ? 'ok' : 'no'}">${ok ? '정답' : '오답'}${
            ok ? '' : ` — 입력: ${esc(input || '(무응답)')}`}</div>`}
          <div class="ans">${esc(q.answer)}</div>
          <div class="exp">${esc(q.explain || '')}</div>
        </div>
        <div class="grades">${GRADE_LABELS.map((g) =>
          `<button data-g="${g.g}"${g.g === suggest ? ' style="border-color:var(--accent)"' : ''}>${g.t}<small>${g.s}</small></button>`).join('')}</div>`);
      $$('.grades button').forEach((b) => { b.onclick = () => Session._grade(+b.dataset.g); });
    },

    _grade(g) {
      const s = Session._s;
      if (!s.revealed) return;
      const q = s.queue[s.i];
      document.removeEventListener('keydown', Session._key);

      if (s.opts.srs !== false && q.cardId) {
        AiSun.srs.review(q.cardId, g, { type: q.type, write: q.type === '한자쓰기' });
      } else if (q.cardId) {
        AiSun.srs._log(q.type, g >= 2);
      }
      if (g >= 2) s.correct += 1;
      s.done += 1;

      if (g === 0) {              // 모름 → 이번 세션 안에서 한 번 더
        s.queue.push(q);
        s.again += 1;
      }
      const d = AiSun.store.day();
      if (s.opts.countNew) d.new += 1; else d.rev += 1;
      AiSun.store.save();

      s.i += 1; s.revealed = false; s.chosen = null;
      Session._render();
    },

    _finish(early) {
      const s = Session._s;
      document.removeEventListener('keydown', Session._key);
      if (s.opts.onDone) { s.opts.onDone(s); return; }
      const rate = U.pct(s.correct, s.done);
      mount(`
        <div class="session">
          <h1 class="page">${esc(s.pack.title)} ${early ? '중단' : '완료'}</h1>
          <div class="grid c3" style="margin:16px 0">
            ${metric(s.done, '푼 문항')}
            ${metric(rate + '%', '정답률', rate >= 80 ? 'good' : rate >= 60 ? 'warn' : 'bad')}
            ${metric(s.again, '다시 볼 카드')}
          </div>
          <div class="row">
            <button class="btn primary" onclick="location.hash='#/today'">오늘 학습으로</button>
            <button class="btn" onclick="location.hash='#/dashboard'">대시보드</button>
          </div>
        </div>`);
    },
  };

  /* ══════════════ 화면들 ══════════════ */

  const V = AiSun.views = {};

  /* ─── 대시보드 ─── */
  V.dashboard = function () {
    const st = AiSun.store.state;
    const p = AiSun.curriculum.plan();
    const prog = AiSun.curriculum.progress();
    const proj = AiSun.curriculum.projectedScore();
    const fc = AiSun.srs.forecast(14);
    const ck = AiSun.store.checks();
    const day = AiSun.store.day();
    const lastExam = st.exams[st.exams.length - 1];
    const wrongN = Object.keys(st.wrong).length;

    const projV = proj.projected == null ? '—' : proj.projected;
    const projCls = proj.projected == null ? '' : proj.projected >= AiSun.PASS_SCORE ? 'good'
      : proj.projected >= 140 ? 'warn' : 'bad';

    mount(`
      <h1 class="page">대시보드</h1>
      <p class="lede">${p.beforeStart ? `학습 시작일은 <b>${esc(st.settings.startDate)}</b>입니다.`
        : p.afterPlan ? '26주 플랜을 완주했습니다. 남은 기간은 모의고사와 오답 회전에 씁니다.'
        : `<b>${p.week}주차</b> · ${esc(p.phase.no)}단계 ${esc(p.phase.name)} · ${esc(U.dowName(p.date))}요일`}</p>

      <div class="grid c4">
        ${metric(p.dDay >= 0 ? 'D-' + p.dDay : 'D+' + (-p.dDay), '시험일까지')}
        ${metric(projV, '예상 점수 / 200', projCls)}
        ${metric(prog.pct + '%', '전체 진도')}
        ${metric(p.dueIds.length, '오늘 복습 대기', p.dueIds.length > 150 ? 'bad' : '')}
      </div>

      <section style="margin-top:22px">
        <h2>오늘 할 일 <span class="tag">${esc(p.phase.name)}</span></h2>
        <div class="card">
          <ul class="todo">
            <li class="${ck.review ? 'done' : ''}"><span class="mark">✓</span>
              <span class="t"><b>예약 복습 ${p.dueIds.length}장</b>
              <small>어제까지 배운 것 중 오늘 잊을 때가 된 카드. 신규보다 먼저 끝낸다.</small></span>
              <button class="btn sm primary" data-act="review"${p.dueIds.length ? '' : ' disabled'}>시작</button></li>

            <li class="${ck.learn ? 'done' : ''}"><span class="mark">✓</span>
              <span class="t"><b>신규 학습 ${p.newCards.length + p.backlog.length}장</b>
              <small>${p.newCards.length || p.backlog.length
                ? `${p.newCards.length ? `이번 주 배정분 ${p.newCards.length}장` : '이번 주 배정분은 모두 학습했습니다'}${p.backlog.length ? ` · 밀린 분량 ${p.backlog.length}장` : ''}`
                : p.week > AiSun.curriculum.NEW_WEEKS ? '3단계 — 신규 없음. 회전과 실전에 집중한다.'
                : '오늘 배정분을 모두 학습했습니다.'}</small></span>
              <button class="btn sm primary" data-act="learn"${(p.newCards.length + p.backlog.length) ? '' : ' disabled'}>시작</button></li>

            <li class="${ck.drill ? 'done' : ''}"><span class="mark">✓</span>
              <span class="t"><b>유형 드릴 — ${p.drill.length ? p.drill.map(esc).join(' · ') : '자유 선택'}</b>
              <small>요일마다 초점을 돌려 한 주에 11개 유형을 빠짐없이 훈련한다.</small></span>
              <button class="btn sm" data-act="drill">시작</button></li>

            <li class="${ck.test ? 'done' : ''}"><span class="mark">✓</span>
              <span class="t"><b>${p.test ? esc(p.test.title) : '오답 재도전 ' + wrongN + '장'}</b>
              <small>${p.test ? `${p.test.size}문항 · ${p.test.minutes}분` : '틀린 카드만 모아 다시 푼다.'}</small></span>
              <button class="btn sm" data-act="${p.test ? 'test' : 'wrong'}"${(!p.test && !wrongN) ? ' disabled' : ''}>시작</button></li>
          </ul>
          <p class="note">오늘 푼 문항 <b>${day.t}</b>개 · 정답률 <b>${U.pct(day.c, day.t)}%</b></p>
        </div>
      </section>

      <div class="grid c2">
        <section>
          <h2>합격 예측</h2>
          <div class="card">
            <div class="row"><b style="font-size:22px">${projV}</b><span style="color:var(--dim)">/ 200점</span>
              <span class="spacer"></span>
              <span class="chip ${proj.pass ? 'hot' : ''}">합격선 ${AiSun.PASS_SCORE}점</span></div>
            ${bar(proj.projected == null ? 0 : (proj.projected / 200) * 100, proj.pass)}
            <p class="note">유형별 최근 정답률에 실제 배점을 곱해 환산했습니다.
              현재 ${proj.covered}%의 배점 영역에서 표본이 모였습니다.</p>
            ${proj.rows.filter((r) => r.rate != null && r.rate < 0.8).length ? `<p class="note">
              보완이 필요한 유형: <b>${proj.rows.filter((r) => r.rate != null && r.rate < 0.8)
                .sort((a, b) => a.rate - b.rate).slice(0, 3).map((r) => esc(r.type)).join(', ')}</b></p>` : ''}
          </div>
        </section>

        <section>
          <h2>복습 예보 <span class="tag">14일</span></h2>
          <div class="card">
            <div class="spark">${fc.map((n, i) => {
              const max = Math.max(1, ...fc);
              return `<i class="${i === 0 ? 'hi' : ''}" style="height:${Math.max(2, (n / max) * 100)}%" title="${i}일 뒤 ${n}장"></i>`;
            }).join('')}</div>
            <div class="legend"><span>오늘 ${fc[0]}장</span><span>7일 뒤 ${fc[7]}장</span><span>14일 합계 ${fc.reduce((a, b) => a + b, 0)}장</span></div>
            <p class="note">막대가 한쪽으로 몰리면 그날 복습이 폭증합니다. 매일 예약분을 끝내야 평탄해집니다.</p>
          </div>
        </section>
      </div>

      <section>
        <h2>최근 모의고사</h2>
        <div class="card">
          ${lastExam ? `
            <div class="row"><b style="font-size:20px">${lastExam.score}점</b>
              <span class="chip ${lastExam.pass ? 'hot' : ''}">${lastExam.pass ? '합격권' : '미달'}</span>
              <span style="color:var(--dim)">${esc(lastExam.date)} · ${esc(lastExam.title)}</span></div>
            ${bar((lastExam.score / 200) * 100, lastExam.pass)}
            <p class="note">${AiSun.exam.weakness(lastExam).slice(0, 3)
              .map((w) => `${esc(w.type)} ${w.rate}%`).join(' · ')}</p>`
            : '<p class="note">아직 응시 기록이 없습니다. 감각을 위해 초반에 한 번 진단용으로 치러 보세요.</p>'}
          <div class="row" style="margin-top:10px">
            <button class="btn" onclick="location.hash='#/exam'">모의고사</button>
            <button class="btn" onclick="location.hash='#/stats'">통계 자세히</button>
          </div>
        </div>
      </section>
    `);

    $$('[data-act]').forEach((b) => { b.onclick = () => V._startTask(b.dataset.act, p); });
  };

  /** 대시보드·오늘 화면의 버튼에서 세션을 띄운다 */
  V._startTask = function (act, p) {
    p = p || AiSun.curriculum.plan();
    const rand = U.rng(U.today() + act);
    const deck = AiSun.curriculum.deck;

    if (act === 'review') {
      const items = [];
      for (const id of U.shuffle(p.dueIds, rand)) {
        const card = deck.byId.get(id);
        if (!card) continue;
        const q = AiSun.quiz.fromCard(card, rand);
        if (q) items.push(q);
        if (items.length >= 200) break;
      }
      if (!items.length) return alert('오늘 복습할 카드가 없습니다.');
      AiSun.store.checks().review = true; AiSun.store.save();
      return Session.run({ title: '예약 복습', items }, {});
    }

    if (act === 'learn') {
      const cards = p.newCards.concat(p.backlog);
      const items = [];
      for (const card of cards) {
        const q = AiSun.quiz.fromCard(card, rand);
        if (q) items.push(q);
      }
      if (!items.length) return alert('오늘 배정된 신규 카드가 없습니다.');
      AiSun.store.checks().learn = true; AiSun.store.save();
      return Session.run({ title: '신규 학습', items }, { countNew: true });
    }

    if (act === 'drill') {
      const types = p.drill.length ? p.drill : AiSun.curriculum.weakTypes(2);
      const per = Math.ceil(24 / types.length);
      const items = [];
      types.forEach((t) => { items.push(...AiSun.quiz.byType(t, per, { rand })); });
      if (!items.length) return alert('드릴 문항을 만들 수 없습니다.');
      AiSun.store.checks().drill = true; AiSun.store.save();
      return Session.run({ title: types.join(' · ') + ' 드릴', items: U.shuffle(items, rand) }, {});
    }

    if (act === 'wrong') {
      const pack = AiSun.exam.retryWrong(30);
      if (!pack.items.length) return alert('오답노트가 비어 있습니다.');
      return Session.run(pack, {});
    }

    if (act === 'test' && p.test) {
      return V.examRun(AiSun.exam.build(p.test.size, {
        kind: p.test.kind, title: p.test.title, minutes: p.test.minutes, seed: U.today() + p.test.kind,
      }));
    }
  };

  /* ─── 오늘 학습 ─── */
  V.today = function () {
    const p = AiSun.curriculum.plan();
    const ck = AiSun.store.checks();
    const st = AiSun.store.state;

    if (p.beforeStart) {
      return mount(`<h1 class="page">오늘 학습</h1>
        <div class="card"><p>학습 시작일이 <b>${esc(st.settings.startDate)}</b>로 설정되어 있습니다.
        지금부터 시작하려면 설정에서 시작일을 오늘로 바꾸세요.</p>
        <button class="btn primary" onclick="location.hash='#/settings'">설정으로</button></div>`);
    }

    const routine = [
      { k: 'review', t: '① 예약 복습', m: 25, d: `오늘 만기된 ${p.dueIds.length}장. 밀리면 다음 날 두 배가 된다.`, n: p.dueIds.length },
      { k: 'learn', t: '② 신규 학습', m: 35, d: '새 카드는 뜻·부수·대표 어휘를 함께 본다.', n: p.newCards.length + p.backlog.length },
      { k: 'drill', t: '③ 유형 드릴', m: 20, d: `오늘 초점: ${p.drill.join(' · ') || '취약 유형 자동'}`, n: 24 },
      { k: p.test ? 'test' : 'wrong', t: p.test ? '④ ' + p.test.title : '④ 오답 재도전', m: p.test ? p.test.minutes : 15,
        d: p.test ? '실전과 같은 순서·비율로 출제된다.' : '틀린 카드만 모아 다시 푼다.',
        n: p.test ? p.test.size : Object.keys(st.wrong).length },
    ];

    mount(`
      <h1 class="page">오늘 학습 · ${esc(p.date)} (${esc(U.dowName(p.date))})</h1>
      <p class="lede">${p.week}주차 ${p.phase.no}단계 <b>${esc(p.phase.name)}</b> — ${esc(p.phase.goal)}</p>

      ${p.isRestDay ? `<div class="card" style="border-color:var(--accent)">
        <b>일요일 — 정리하는 날</b>
        <p class="note">신규 배정이 없습니다. 밀린 복습을 비우고, 정답률이 낮은 유형만 골라 드릴하세요.
        쉬는 날을 지켜야 26주를 완주합니다.</p></div>` : ''}

      <div class="grid c2" style="margin-top:14px">
        ${routine.map((r) => `
          <div class="card">
            <h2>${esc(r.t)} <span class="sub">${r.m}분</span></h2>
            <p class="note">${esc(r.d)}</p>
            <div class="row" style="margin-top:12px">
              <button class="btn primary sm ${ck[r.k === 'wrong' ? 'test' : r.k] ? 'done' : ''}" data-act="${r.k}"${r.n ? '' : ' disabled'}>
                ${r.n ? `시작 (${r.n})` : '해당 없음'}</button>
              ${ck[r.k === 'wrong' ? 'test' : r.k] ? '<span class="chip">오늘 완료</span>' : ''}
            </div>
          </div>`).join('')}
      </div>

      <section style="margin-top:22px">
        <h2>이번 주 배정</h2>
        <div class="card scroll">${V._weekTable(p.week, p.week)}</div>
      </section>
    `);
    $$('[data-act]').forEach((b) => { b.onclick = () => V._startTask(b.dataset.act, p); });
  };

  V._weekTable = function (from, to) {
    const rows = [];
    const cur = AiSun.curriculum.weekOf(U.today());
    for (let w = from; w <= to; w++) {
      const s = AiSun.curriculum.weekSummary(w);
      rows.push(`<tr class="${w === cur ? 'now' : ''}">
        <td><b>${w}주</b></td>
        <td><span class="lvl">${s.phase.no}단계</span> ${esc(s.phase.name)}</td>
        <td class="num">${s.hanjaCount}</td>
        <td class="num">${s.writeCount}</td>
        <td class="num">${s.idiomCount}</td>
        <td class="num">${s.etcCount}</td>
        <td class="num"><b>${s.newCount}</b></td>
        <td>${s.mock ? '실전 모의고사' : '주간 종합테스트'}</td></tr>`);
    }
    return `<table><thead><tr><th>주차</th><th>단계</th><th class="num">한자</th><th class="num">쓰기</th>
      <th class="num">성어</th><th class="num">기타</th><th class="num">계</th><th>토요일 과제</th></tr></thead>
      <tbody>${rows.join('')}</tbody></table>`;
  };

  /* ─── 26주 플랜 ─── */
  V.plan = function () {
    const c = AiSun.curriculum;
    const counts = AiSun.DATA.meta.counts;
    mount(`
      <h1 class="page">26주 합격 플랜</h1>
      <p class="lede">읽기 3,500자 · 쓰기 2,005자 범위를 6개월에 나눠 넣고, 마지막 8주는 실전으로 굳힙니다.</p>

      <section>
        <h2>3단계 설계</h2>
        <div class="grid c3">
          ${c.PHASES.map((p) => `
            <div class="card">
              <h2><span class="lvl">${p.no}단계</span> ${esc(p.name)} <span class="sub">${p.from}~${p.to}주</span></h2>
              <p class="note"><b>${esc(p.goal)}</b></p>
              <p class="note">${esc(p.detail)}</p>
            </div>`).join('')}
        </div>
      </section>

      <section>
        <h2>하루 루틴 <span class="tag">평일 약 110분</span></h2>
        <div class="card scroll">
          <table><thead><tr><th>순서</th><th>내용</th><th class="num">시간</th><th>왜 이 순서인가</th></tr></thead><tbody>
            <tr><td>①</td><td>예약 복습</td><td class="num">25분</td><td>잊기 직전에 인출해야 기억이 가장 오래 간다. 신규보다 먼저 끝낸다.</td></tr>
            <tr><td>②</td><td>신규 학습</td><td class="num">35분</td><td>머리가 맑을 때 새 정보를 넣는다. 뜻·부수·대표 어휘를 묶어서 본다.</td></tr>
            <tr><td>③</td><td>쓰기 훈련</td><td class="num">20분</td><td>쓰기는 40문항으로 배점 1위다. 눈으로만 보면 절대 늘지 않는다.</td></tr>
            <tr><td>④</td><td>유형 드릴</td><td class="num">20분</td><td>부수·장단음·동음이의어처럼 따로 훈련하지 않으면 안 되는 유형을 돌린다.</td></tr>
            <tr><td>⑤</td><td>취침 전 오답</td><td class="num">10분</td><td>수면 직전 인출은 정착률이 높다. 오답노트만 훑는다.</td></tr>
          </tbody></table>
          <p class="note">토요일은 종합테스트와 오답 정리, 일요일은 취약 유형 보강과 휴식입니다.</p>
        </div>
      </section>

      <section>
        <h2>주차별 배정</h2>
        <div class="card scroll">${V._weekTable(1, c.WEEKS)}</div>
      </section>

      <section>
        <h2>수록 데이터</h2>
        <div class="grid c4">
          ${metric(counts.hanja.toLocaleString(), '배정한자 (8급~1급)')}
          ${metric(counts.hanjaWrite.toLocaleString(), '쓰기 확정 (3급까지)')}
          ${metric(counts.hanjaWriteExt, '쓰기 확장 (2급)')}
          ${metric(counts.idioms, '사자성어')}
          ${metric(counts.pairs, '유의·반의어')}
          ${metric(counts.homonyms, '동음이의어 묶음')}
          ${metric(counts.abbrev, '약자')}
          ${metric(counts.tone, '장단음 어휘')}
        </div>
        <div class="card" style="margin-top:12px">
          <div class="row"><b>학습 카드 ${AiSun.curriculum.deck.all.length.toLocaleString()}장</b>
            <span style="color:var(--dim)">한자는 읽기·쓰기를 따로 셉니다</span>
            <span class="spacer"></span>
            <span class="chip">배정 대상 <b>${AiSun.curriculum.assignable.length.toLocaleString()}</b>장</span>
            <span class="chip">하루 <b>${AiSun.curriculum.load(AiSun.store.state.settings.knownLevel).perDay}</b>장</span></div>
          <p class="note">이미 아는 급수는 신규 배정에서 빠집니다(현재 설정:
            <b>${esc(AiSun.store.state.settings.knownLevel ? lvLabel(AiSun.store.state.settings.knownLevel) + '까지 앎' : '제외 없음')}</b>).
            제외된 한자도 드릴과 모의고사에는 그대로 나오므로, 잊고 있었다면 오답노트를 통해 다시 들어옵니다.
            <b>설정</b>에서 바꿀 수 있습니다.</p>
        </div>
      </section>
    `);
  };

  /* ─── 드릴 ─── */
  V.drill = function () {
    const st = AiSun.store.state;
    mount(`
      <h1 class="page">유형 드릴</h1>
      <p class="lede">실제 시험의 11개 유형을 배점 그대로 나눠 훈련합니다. 정답률이 낮은 유형부터 손대세요.</p>
      <div class="grid c3">
        ${AiSun.TYPES.map((t) => {
          const b = st.byType[t.k];
          const rate = b && b.t ? U.pct(b.c, b.t) : null;
          return `<div class="card">
            <h2>${esc(t.k)} <span class="sub">${t.n}문항 · ${Math.round((t.n / 200) * 100)}%</span></h2>
            <p class="note">${esc(t.desc)}</p>
            ${rate == null ? '<p class="note">아직 기록 없음</p>'
              : `${bar(rate, rate >= 80)}<p class="note">정답률 <b>${rate}%</b> (${b.t}문항)</p>`}
            <div class="row" style="margin-top:10px">
              <button class="btn sm primary" data-t="${esc(t.k)}" data-n="20">20문항</button>
              <button class="btn sm" data-t="${esc(t.k)}" data-n="40">40문항</button>
            </div></div>`;
        }).join('')}
      </div>`);
    $$('[data-t]').forEach((b) => {
      b.onclick = () => {
        const pack = AiSun.exam.drill(b.dataset.t, +b.dataset.n);
        if (!pack.items.length) return alert('이 유형의 문항을 만들 재료가 부족합니다.');
        Session.run(pack, {});
      };
    });
  };

  /* ─── 모의고사 ─── */
  V.exam = function () {
    const st = AiSun.store.state;
    mount(`
      <h1 class="page">모의고사</h1>
      <p class="lede">실제 시험은 <b>200문항 / 90분 / 160점 이상 합격</b>입니다. 유형 순서와 배점을 그대로 재현합니다.</p>

      <section>
        <h2>응시</h2>
        <div class="grid c3">
          <div class="card"><h2>실전 모의고사</h2><p class="note">200문항 · 90분. 실제 시험과 동일한 구성.</p>
            <button class="btn primary sm" data-size="200" data-min="90" style="margin-top:10px">시작</button></div>
          <div class="card"><h2>주간 종합테스트</h2><p class="note">100문항 · 45분. 배점 비율을 그대로 축소.</p>
            <button class="btn sm" data-size="100" data-min="45" style="margin-top:10px">시작</button></div>
          <div class="card"><h2>미니 점검</h2><p class="note">50문항 · 22분. 짧게 감각만 확인.</p>
            <button class="btn sm" data-size="50" data-min="22" style="margin-top:10px">시작</button></div>
        </div>
      </section>

      <section>
        <h2>배점표</h2>
        <div class="card scroll"><table>
          <thead><tr><th>유형</th><th class="num">문항</th><th class="num">비중</th><th>내용</th></tr></thead>
          <tbody>${AiSun.TYPES.map((t) => `<tr><td><b>${esc(t.k)}</b></td><td class="num">${t.n}</td>
            <td class="num">${Math.round((t.n / 200) * 100)}%</td><td>${esc(t.desc)}</td></tr>`).join('')}
            <tr><td><b>합계</b></td><td class="num"><b>200</b></td><td class="num">100%</td><td>합격 160점(80%)</td></tr>
          </tbody></table></div>
      </section>

      <section>
        <h2>응시 기록</h2>
        <div class="card">
          ${st.exams.length ? `<div class="scroll"><table>
            <thead><tr><th>날짜</th><th>구분</th><th class="num">점수</th><th class="num">정답률</th><th class="num">소요</th><th>판정</th></tr></thead>
            <tbody>${st.exams.slice().reverse().map((e) => `<tr>
              <td>${esc(e.date)}</td><td>${esc(e.title)}</td>
              <td class="num"><b>${e.score}</b></td><td class="num">${e.rate}%</td>
              <td class="num">${Math.floor(e.elapsed / 60)}분</td>
              <td>${e.pass ? '<span class="chip hot">합격권</span>' : '미달'}</td></tr>`).join('')}
            </tbody></table></div>`
            : '<p class="note">아직 응시 기록이 없습니다.</p>'}
        </div>
      </section>`);
    $$('[data-size]').forEach((b) => {
      b.onclick = () => {
        const size = +b.dataset.size;
        V.examRun(AiSun.exam.build(size, {
          kind: size >= 200 ? 'mock' : 'weekly',
          title: size >= 200 ? '실전 모의고사' : `종합테스트 ${size}문항`,
          minutes: +b.dataset.min,
        }));
      };
    });
  };

  /** 시험 응시 화면 — 피드백 없이 끝까지 풀고 마지막에 채점한다 */
  V.examRun = function (pack) {
    if (!pack.items.length) return alert('문항을 만들 수 없습니다. 데이터를 확인하세요.');
    const answers = new Array(pack.items.length).fill(null);
    let cur = 0;
    let remain = pack.minutes * 60;
    let timer = null;

    function stop() { if (timer) { clearInterval(timer); timer = null; } }

    function submit(auto) {
      if (!auto && !confirm(`제출하시겠습니까? (미응답 ${answers.filter((a) => a == null).length}문항)`)) return;
      stop();
      const result = AiSun.exam.grade(pack, answers);
      V.examResult(pack, result);
    }

    function draw() {
      const q = pack.items[cur];
      const mm = String(Math.floor(remain / 60)).padStart(2, '0');
      const ss = String(remain % 60).padStart(2, '0');
      mount(`
        <div class="exam-bar">
          <b>${esc(pack.title)}</b>
          <span class="timer${remain < 300 ? ' low' : ''}" id="tm">${mm}:${ss}</span>
          <span style="color:var(--dim)">${cur + 1} / ${pack.items.length} · 응답 ${answers.filter((a) => a != null).length}</span>
          <span class="spacer"></span>
          <button class="btn sm" id="prev">이전</button>
          <button class="btn sm" id="next">다음</button>
          <button class="btn sm primary" id="submit">제출</button>
        </div>
        <div class="qnav">${pack.items.map((_, i) =>
          `<b class="${answers[i] != null ? 'filled' : ''}${i === cur ? ' cur' : ''}" data-i="${i}">${i + 1}</b>`).join('')}</div>
        <div class="session">
          <div class="qcard">
            <div class="qtype">${q.no}. ${esc(q.type)}</div>
            <div class="qtext">${esc(q.q)}</div>
            ${q.stem ? `<div class="stem${q.stem.length > 4 ? ' small' : ''}">${esc(q.stem)}</div>` : ''}
            ${q.hint ? `<div class="hint">${esc(q.hint)}</div>` : ''}
            <div class="opts">${(q.choices || []).map((c) => {
              const long = String(c).length > 6;
              return `<button class="opt${long ? ' txt' : ''}" data-v="${esc(c)}"
                aria-pressed="${answers[cur] === c}">${esc(c)}</button>`;
            }).join('')}</div>
          </div>
        </div>`);

      $$('.opt').forEach((b) => {
        b.onclick = () => {
          answers[cur] = b.dataset.v;
          if (cur < pack.items.length - 1) { cur += 1; draw(); } else draw();
        };
      });
      $$('.qnav b').forEach((b) => { b.onclick = () => { cur = +b.dataset.i; draw(); }; });
      $('#prev').onclick = () => { if (cur > 0) { cur -= 1; draw(); } };
      $('#next').onclick = () => { if (cur < pack.items.length - 1) { cur += 1; draw(); } };
      $('#submit').onclick = () => submit(false);
    }

    stop();
    timer = setInterval(() => {
      remain -= 1;
      const el = document.getElementById('tm');
      if (!el) { stop(); return; }                 // 화면을 떠나면 타이머 정지
      const mm = String(Math.floor(remain / 60)).padStart(2, '0');
      const ss = String(Math.max(0, remain % 60)).padStart(2, '0');
      el.textContent = `${mm}:${ss}`;
      if (remain < 300) el.classList.add('low');
      if (remain <= 0) { stop(); alert('시간이 종료되었습니다. 자동 제출합니다.'); submit(true); }
    }, 1000);

    draw();
  };

  V.examResult = function (pack, r) {
    const weak = AiSun.exam.weakness(r);
    mount(`
      <h1 class="page">${esc(pack.title)} 결과</h1>
      <div class="grid c4" style="margin-bottom:18px">
        ${metric(r.score, '환산 점수 / 200', r.pass ? 'good' : 'bad')}
        ${metric(r.rate + '%', '정답률')}
        ${metric(r.correct + '/' + r.total, '맞은 문항')}
        ${metric(Math.floor(r.elapsed / 60) + '분', '소요 시간')}
      </div>
      <div class="card" style="margin-bottom:18px">
        ${bar((r.score / 200) * 100, r.pass)}
        <p class="note">${r.pass
          ? `합격선 ${AiSun.PASS_SCORE}점을 <b>${r.score - AiSun.PASS_SCORE}점</b> 넘겼습니다. 이 상태를 시험일까지 유지하는 게 과제입니다.`
          : `합격선까지 <b>${AiSun.PASS_SCORE - r.score}점</b> 남았습니다. 아래에서 잃은 점수가 큰 유형부터 메우세요.`}</p>
      </div>

      <section>
        <h2>유형별 성적 <span class="tag">잃은 점수 순</span></h2>
        <div class="card scroll"><table>
          <thead><tr><th>유형</th><th class="num">배점</th><th class="num">정답률</th><th class="num">잃은 점수</th><th>보강</th></tr></thead>
          <tbody>${weak.map((w) => `<tr>
            <td><b>${esc(w.type)}</b></td><td class="num">${w.weight}</td>
            <td class="num">${w.rate}%</td><td class="num">${w.lost ? '<b>-' + w.lost + '</b>' : '0'}</td>
            <td><button class="btn sm" data-drill="${esc(w.type)}">드릴</button></td></tr>`).join('')}
          </tbody></table></div>
      </section>

      <section>
        <h2>오답 해설 <span class="tag">${r.total - r.correct}문항</span></h2>
        <div class="card scroll"><table>
          <thead><tr><th class="num">번호</th><th>유형</th><th>문제</th><th>내 답</th><th>정답</th><th>해설</th></tr></thead>
          <tbody>${pack.items.filter((q) => !q._ok).map((q) => `<tr>
            <td class="num">${q.no}</td><td>${esc(q.type)}</td>
            <td><b style="font-family:var(--han);font-size:17px">${esc(q.stem || '—')}</b></td>
            <td style="color:var(--bad)">${esc(q._input || '무응답')}</td>
            <td style="color:var(--ok);font-family:var(--han);font-size:17px"><b>${esc(q.answer)}</b></td>
            <td style="color:var(--dim)">${esc(q.explain || '')}</td></tr>`).join('')
            || '<tr><td colspan="6">전 문항 정답입니다.</td></tr>'}
          </tbody></table></div>
        <p class="note">틀린 문항은 오답노트와 복습 일정에 자동으로 반영되었습니다.</p>
      </section>

      <div class="row">
        <button class="btn primary" onclick="location.hash='#/wrong'">오답노트로</button>
        <button class="btn" onclick="location.hash='#/exam'">모의고사 목록</button>
        <button class="btn ghost" onclick="location.hash='#/dashboard'">대시보드</button>
      </div>`);
    $$('[data-drill]').forEach((b) => {
      b.onclick = () => Session.run(AiSun.exam.drill(b.dataset.drill, 20), {});
    });
  };

  /* ─── 오답노트 ─── */
  V.wrong = function () {
    const st = AiSun.store.state;
    const deck = AiSun.curriculum.deck;
    const ids = Object.keys(st.wrong).sort((a, b) => st.wrong[b].n - st.wrong[a].n);
    const rows = ids.map((id) => {
      const card = deck.byId.get(id);
      if (!card) return '';
      const w = st.wrong[id];
      const s = AiSun.srs.get(id);
      const leech = AiSun.srs.isLeech(id);
      const ref = card.ref;
      const desc = card.kind === 'hanja' ? `${ref.hun} ${ref.eum}`
        : card.kind === 'idiom' ? `${ref.reading} — ${ref.meaning}`
        : card.kind === 'pair' ? `${ref.a}(${ref.aRead}) ↔ ${ref.b}(${ref.bRead})`
        : card.kind === 'homo' ? ref.words.map((x) => x.w).join(' / ')
        : card.kind === 'abbr' ? `${ref.full} ↔ ${ref.abbr}`
        : card.kind === 'tone' ? `${ref.reading} · ${ref.tone}음` : '';
      return `<tr>
        <td><b style="font-family:var(--han);font-size:19px">${esc(card.label)}</b>
          ${card.track === 'write' ? '<span class="lvl">쓰기</span>' : ''}
          ${leech ? '<span class="lvl" style="background:var(--bad);color:#fff">고질</span>' : ''}</td>
        <td>${esc(desc)}</td>
        <td>${esc(w.type || '')}</td>
        <td class="num">${w.n}</td>
        <td class="num">${s ? s.lapses : 0}</td>
        <td>${s ? esc(s.due) : '-'}</td></tr>`;
    }).join('');

    mount(`
      <h1 class="page">오답노트</h1>
      <p class="lede">틀린 카드는 자동으로 쌓이고, 두 번 연속 맞히면 스스로 빠집니다.
        ${AiSun.srs.LEECH_AT}회 이상 틀린 카드는 <b>고질</b>로 표시되어 남습니다 — 이건 방법을 바꿔야 한다는 신호입니다.</p>
      <div class="grid c3" style="margin-bottom:16px">
        ${metric(ids.length, '오답 카드')}
        ${metric(ids.filter((id) => AiSun.srs.isLeech(id)).length, '고질 카드', 'bad')}
        ${metric(Object.values(st.wrong).reduce((a, b) => a + b.n, 0), '누적 오답 횟수')}
      </div>
      <div class="row" style="margin-bottom:16px">
        <button class="btn primary" id="retry"${ids.length ? '' : ' disabled'}>오답 30장 재도전</button>
        <button class="btn" id="retry-leech"${ids.filter((id) => AiSun.srs.isLeech(id)).length ? '' : ' disabled'}>고질 카드만</button>
        <span class="spacer"></span>
        <button class="btn ghost sm" id="clear"${ids.length ? '' : ' disabled'}>비우기</button>
      </div>
      <div class="card scroll">
        ${ids.length ? `<table><thead><tr><th>카드</th><th>내용</th><th>유형</th>
          <th class="num">오답</th><th class="num">누적 실패</th><th>다음 복습</th></tr></thead><tbody>${rows}</tbody></table>`
          : '<p class="empty">오답이 없습니다. 좋은 상태입니다.</p>'}
      </div>`);

    const rt = $('#retry'); if (rt) rt.onclick = () => Session.run(AiSun.exam.retryWrong(30), {});
    const rl = $('#retry-leech');
    if (rl) rl.onclick = () => {
      const rand = U.rng(Date.now());
      const items = ids.filter((id) => AiSun.srs.isLeech(id)).map((id) => {
        const c = deck.byId.get(id);
        return c ? AiSun.quiz.fromCard(c, rand) : null;
      }).filter(Boolean);
      if (!items.length) return alert('고질 카드가 없습니다.');
      Session.run({ title: '고질 카드 집중', items }, {});
    };
    const cl = $('#clear');
    if (cl) cl.onclick = () => {
      if (!confirm('오답노트를 비웁니다. 복습 일정은 그대로 유지됩니다.')) return;
      AiSun.store.state.wrong = {}; AiSun.store.saveNow(); V.wrong();
    };
  };

  /* ─── 통계 ─── */
  V.stats = function () {
    const st = AiSun.store.state;
    const proj = AiSun.curriculum.projectedScore();
    const prog = AiSun.curriculum.progress();
    const days = Object.keys(st.daily).sort().slice(-30);
    const maxDay = Math.max(1, ...days.map((d) => st.daily[d].t));
    const streak = (function () {
      let n = 0, d = U.today();
      while (st.daily[d] && st.daily[d].t > 0) { n += 1; d = U.addDays(d, -1); }
      return n;
    })();

    mount(`
      <h1 class="page">통계</h1>
      <p class="lede">점수는 감이 아니라 유형별 정답률에서 나옵니다. 배점이 큰 유형의 정답률을 먼저 올리세요.</p>

      <div class="grid c4">
        ${metric(proj.projected == null ? '—' : proj.projected, '예상 점수', proj.pass ? 'good' : 'bad')}
        ${metric(streak + '일', '연속 학습')}
        ${metric(prog.started + '/' + prog.total, '학습 착수 카드')}
        ${metric(prog.maturePct + '%', '장기기억 정착', prog.maturePct >= 50 ? 'good' : '')}
      </div>

      <section style="margin-top:22px">
        <h2>유형별 정답률 <span class="tag">배점순</span></h2>
        <div class="card scroll"><table>
          <thead><tr><th>유형</th><th class="num">배점</th><th class="num">표본</th><th class="num">정답률</th><th style="width:38%">추이</th><th class="num">기대 득점</th></tr></thead>
          <tbody>${proj.rows.map((r) => `<tr>
            <td><b>${esc(r.type)}</b></td>
            <td class="num">${r.n}</td>
            <td class="num">${r.samples}</td>
            <td class="num">${r.rate == null ? '—' : Math.round(r.rate * 100) + '%'}</td>
            <td>${bar(r.rate == null ? 0 : r.rate * 100, r.rate != null && r.rate >= 0.8)}</td>
            <td class="num">${r.rate == null ? '—' : (r.rate * r.n).toFixed(1)}</td></tr>`).join('')}
          </tbody></table>
          <p class="note">표본이 5문항 미만인 유형은 예상 점수 계산에서 제외됩니다 — 드릴로 표본을 먼저 만드세요.</p>
        </div>
      </section>

      <section>
        <h2>일별 학습량 <span class="tag">최근 30일</span></h2>
        <div class="card">
          ${days.length ? `<div class="spark">${days.map((d) => {
            const x = st.daily[d];
            return `<i style="height:${Math.max(2, (x.t / maxDay) * 100)}%" title="${d} · ${x.t}문항 · 정답률 ${U.pct(x.c, x.t)}%"></i>`;
          }).join('')}</div>
          <div class="legend"><span>${esc(days[0])}</span><span class="spacer"></span><span>최대 ${maxDay}문항</span><span class="spacer"></span><span>${esc(days[days.length - 1])}</span></div>`
            : '<p class="empty">아직 학습 기록이 없습니다.</p>'}
        </div>
      </section>

      <section>
        <h2>모의고사 점수 추이</h2>
        <div class="card">
          ${st.exams.length ? `<div class="spark">${st.exams.map((e) =>
            `<i class="${e.pass ? 'hi' : ''}" style="height:${Math.max(2, (e.score / 200) * 100)}%" title="${e.date} ${e.score}점"></i>`).join('')}</div>
          <div class="legend"><span>합격선 160점 = 높이 80%</span><span class="spacer"></span>
            <span>최고 ${Math.max(...st.exams.map((e) => e.score))}점</span></div>`
            : '<p class="empty">응시 기록이 없습니다.</p>'}
        </div>
      </section>`);
  };

  /* ─── 자료실 ─── */
  V.library = function () {
    const D = AiSun.DATA;
    let tab = (location.hash.split('?')[1] || 'hanja');
    let q = '';
    let lvFilter = '';

    function render() {
      const kinds = [['hanja', '한자'], ['idioms', '사자성어'], ['pairs', '유의·반의어'],
        ['homonyms', '동음이의어'], ['abbrev', '약자'], ['tone', '장단음']];
      let body = '';
      const hit = (s) => !q || String(s).toLowerCase().includes(q.toLowerCase());

      if (tab === 'hanja') {
        const list = D.hanja.filter((h) => (!lvFilter || h.lv === lvFilter)
          && (hit(h.c) || hit(h.hun) || hit(h.eum) || hit(h.rad) || h.words.some((w) => hit(w.w) || hit(w.r))));
        body = `
          <div class="row" style="margin-bottom:12px">
            <button class="btn sm ${lvFilter ? '' : 'primary'}" data-lv="">전체</button>
            ${AiSun.LEVELS.map((lv) => `<button class="btn sm ${lvFilter === lv ? 'primary' : ''}" data-lv="${lv}">${esc(lvLabel(lv))}</button>`).join('')}
          </div>
          <p class="note">${list.length}자</p><div class="hanja-grid">${list.slice(0, 400).map((h) => `
          <div class="hcell"><div class="c">${esc(h.c)}</div>
            <div class="m">${esc(h.hun)} ${esc(h.eum)}</div>
            <div class="meta"><span class="lvl">${esc(lvLabel(h.lv))}</span> ${esc(h.rad)}부 ${h.resid != null ? h.resid + '획' : ''}${h.str ? ' · 총' + h.str + '획' : ''}${h.wtier === 1 ? ' · 쓰기' : h.wtier === 2 ? ' · 쓰기확장' : ''}${h.variant ? ' · 약자 ' + esc(h.variant) : ''}</div>
            ${h.words[0] ? `<div class="meta">${esc(h.words[0].w)}(${esc(h.words[0].r)})</div>` : ''}
          </div>`).join('')}</div>${list.length > 400 ? '<p class="note">상위 400자만 표시했습니다. 급수 필터나 검색으로 좁혀 보세요.</p>' : ''}`;
      } else if (tab === 'idioms') {
        const list = D.idioms.filter((i) => hit(i.idiom) || hit(i.reading) || hit(i.meaning));
        body = `<p class="note">${list.length}개</p><div class="scroll"><table>
          <thead><tr><th>성어</th><th>독음</th><th>뜻</th><th>급수</th></tr></thead><tbody>
          ${list.map((i) => `<tr><td style="font-family:var(--han);font-size:19px"><b>${esc(i.idiom)}</b></td>
            <td>${esc(i.reading)}</td><td>${esc(i.meaning)}</td><td><span class="lvl">${esc(i.level)}급</span></td></tr>`).join('')}
          </tbody></table></div>`;
      } else if (tab === 'pairs') {
        const list = D.pairs.filter((p) => hit(p.a) || hit(p.b) || hit(p.aRead) || hit(p.bRead));
        body = `<div class="scroll"><table><thead><tr><th>구분</th><th>단위</th><th>A</th><th>B</th><th>비고</th></tr></thead><tbody>
          ${list.map((p) => `<tr><td><span class="lvl">${esc(p.kind)}</span></td><td>${esc(p.unit)}</td>
            <td style="font-family:var(--han);font-size:18px">${esc(p.a)} <small style="font-family:inherit;color:var(--dim)">${esc(p.aRead)}</small></td>
            <td style="font-family:var(--han);font-size:18px">${esc(p.b)} <small style="font-family:inherit;color:var(--dim)">${esc(p.bRead)}</small></td>
            <td style="color:var(--dim)">${esc(p.note)}</td></tr>`).join('')}</tbody></table></div>`;
      } else if (tab === 'homonyms') {
        const list = D.homonyms.filter((m) => hit(m.reading) || m.words.some((w) => hit(w.w) || hit(w.d)));
        body = `<div class="scroll"><table><thead><tr><th>독음</th><th>한자어와 뜻</th></tr></thead><tbody>
          ${list.map((m) => `<tr><td><b>${esc(m.reading)}</b></td><td>${m.words.map((w) =>
            `<div><b style="font-family:var(--han);font-size:17px">${esc(w.w)}</b> — ${esc(w.d)}</div>`).join('')}</td></tr>`).join('')}
          </tbody></table></div>`;
      } else if (tab === 'abbrev') {
        const list = D.abbrev.filter((a) => hit(a.full) || hit(a.abbr) || hit(a.eum) || hit(a.hun));
        body = `<div class="hanja-grid">${list.map((a) => `<div class="hcell">
          <div class="c">${esc(a.full)} <span style="color:var(--dim)">→</span> ${esc(a.abbr)}</div>
          <div class="m">${esc(a.hun)} ${esc(a.eum)}</div></div>`).join('')}</div>`;
      } else {
        const list = D.tone.filter((t) => hit(t.word) || hit(t.reading) || hit(t.meaning));
        body = `<div class="scroll"><table><thead><tr><th>한자어</th><th>독음</th><th>장단</th><th>뜻</th></tr></thead><tbody>
          ${list.map((t) => `<tr><td style="font-family:var(--han);font-size:17px"><b>${esc(t.word)}</b></td>
            <td>${esc(t.reading)}</td><td><span class="lvl">${esc(t.tone)}음</span></td><td>${esc(t.meaning)}</td></tr>`).join('')}
          </tbody></table></div>`;
      }

      mount(`
        <h1 class="page">자료실</h1>
        <p class="lede">학습 중 막힐 때 바로 찾아보는 원본 데이터입니다.</p>
        <div class="row" style="margin-bottom:12px">
          ${kinds.map(([k, n]) => `<button class="btn sm ${tab === k ? 'primary' : ''}" data-tab="${k}">${n}</button>`).join('')}
        </div>
        <input class="search" id="q" placeholder="한자·독음·뜻으로 검색" value="${esc(q)}">
        ${body}`);

      $$('[data-tab]').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; lvFilter = ''; render(); }; });
      $$('[data-lv]').forEach((b) => { b.onclick = () => { lvFilter = b.dataset.lv; render(); }; });
      const inp = $('#q');
      inp.oninput = () => { q = inp.value; const pos = inp.selectionStart; render(); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); };
    }
    render();
  };

  /* ─── 설정 ─── */
  V.settings = function () {
    const s = AiSun.store.state.settings;
    mount(`
      <h1 class="page">설정</h1>
      <div class="grid c2">
        <section><h2>일정</h2><div class="card">
          <label class="field"><span>학습 시작일</span><input type="date" id="start" value="${esc(s.startDate)}"></label>
          <label class="field"><span>시험일 (D-day 기준)</span><input type="date" id="exam" value="${esc(s.examDate)}"></label>
          <label class="field"><span>평일 학습 시간(분)</span><input type="number" id="min" min="30" max="360" value="${s.dailyMinutes}"></label>
          <label class="field"><span>이미 아는 급수 — 이 급수까지는 신규 배정에서 뺍니다</span>
            <select id="known">
              <option value=""${s.knownLevel ? '' : ' selected'}>제외 없음 (8급부터 전부)</option>
              ${AiSun.LEVELS.slice(0, -1).map((lv) => {
                const l = AiSun.curriculum.load(lv);
                return `<option value="${lv}"${s.knownLevel === lv ? ' selected' : ''}>${esc(AiSun.LEVEL_LABEL[lv])}까지 앎 — 신규 ${l.total.toLocaleString()}장 · 하루 ${l.perDay}장</option>`;
              }).join('')}
            </select></label>
          <p class="note">1급 응시자에게 8급부터 3,500자를 다시 배정하는 건 시간 낭비입니다.
            보유 급수를 고르면 그 위 급수만 신규로 배정됩니다.</p>
          <button class="btn primary" id="save">저장</button>
          <p class="note">시작일을 바꾸면 주차 계산과 신규 배정이 다시 정렬됩니다. 이미 학습한 카드의 복습 일정은 그대로입니다.</p>
        </div></section>

        <section><h2>백업</h2><div class="card">
          <p class="note">학습 기록은 이 브라우저의 저장소에만 있습니다. 브라우저 데이터를 지우면 사라지므로
            주 1회는 내보내 두세요.</p>
          <div class="row" style="margin:10px 0">
            <button class="btn" id="export">내보내기</button>
            <button class="btn" id="download">파일로 저장</button>
          </div>
          <textarea class="io" id="io" placeholder="여기에 백업 JSON을 붙여 넣고 [불러오기]를 누르세요"></textarea>
          <div class="row" style="margin-top:8px">
            <button class="btn" id="import">불러오기</button>
            <span class="spacer"></span>
            <button class="btn ghost sm" id="reset">전체 초기화</button>
          </div>
        </div></section>
      </div>

      <section><h2>시험 정보</h2><div class="card">
        <table><tbody>
          <tr><th>주관</th><td>사단법인 한국어문회 / 한국한자능력검정회</td></tr>
          <tr><th>급수</th><td>1급 (공인급수)</td></tr>
          <tr><th>배정한자</th><td>읽기 3,500자 · 쓰기 2,005자</td></tr>
          <tr><th>문항·시간</th><td>200문항 · 90분</td></tr>
          <tr><th>합격기준</th><td>160점 이상 (80%)</td></tr>
        </tbody></table>
        <p class="note">시험 일정과 출제 기준은 시행처 공고가 최종입니다. 응시 전 <b>한국어문회 홈페이지</b>에서 확인하세요.</p>
        <p class="note">배정한자 3,500자의 급수·훈음·부수·획수는 <b>한국어문회</b>가 공개한 급수별 배정한자 자료를 따랐고,
          그 저작권은 한국어문회에 있습니다. 대표 어휘는 libhangul 한자사전(BSD)에서, 부수·획수 교차 검증은
          Unicode Unihan 자료를 썼습니다. 자세한 출처는 저장소의 <span class="kbd">docs/05-원본-데이터.md</span>를 보세요.</p>
      </div></section>`);

    $('#save').onclick = () => {
      s.startDate = $('#start').value || s.startDate;
      s.examDate = $('#exam').value || s.examDate;
      s.dailyMinutes = U.clamp(+$('#min').value || 110, 30, 360);
      s.knownLevel = $('#known').value;
      AiSun.store.saveNow();
      AiSun.curriculum.refresh();     // 배정 대상이 바뀌었으므로 다시 계산한다
      AiSun.render();
      alert('저장했습니다.');
    };
    $('#export').onclick = () => { $('#io').value = AiSun.store.export(); };
    $('#download').onclick = () => {
      const blob = new Blob([AiSun.store.export()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `aisun-backup-${U.today()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $('#import').onclick = () => {
      try { AiSun.store.import($('#io').value); AiSun.curriculum.refresh(); alert('불러왔습니다.'); AiSun.render(); }
      catch (e) { alert('불러오기 실패: ' + e.message); }
    };
    $('#reset').onclick = () => {
      if (!confirm('모든 학습 기록이 지워집니다. 계속할까요?')) return;
      if (!confirm('되돌릴 수 없습니다. 정말 초기화할까요?')) return;
      AiSun.store.reset(); AiSun.curriculum.refresh(); AiSun.render();
    };
  };
})(window);
