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
  const C = () => AiSun.curriculum;

  /* ══════════════ 학습 세션 러너 ══════════════ */

  const GRADE_LABELS = [
    { g: 0, t: '모름', s: '다시 만난다' },
    { g: 1, t: '애매', s: '조금 뒤 다시' },
    { g: 2, t: '맞음', s: '정상 간격' },
    { g: 3, t: '완벽', s: '길게 미룸' },
  ];

  /** 신규 카드의 학습면 — 문제를 내기 전에 먼저 보여 주는 정보 */
  const cardInfo = AiSun.cardInfo = function (card) {
    const r = card.ref;
    if (card.kind === 'radical') {
      return `
        <div class="stem">${esc(r.c)}</div>
        <div class="hint" style="font-size:19px;color:var(--ink);margin-top:10px"><b>${esc(r.hun)} ${esc(r.eum)}</b></div>
        <div class="hint">${esc(r.name)} · ${r.str}획 · 주로 <b>${esc(r.pos)}</b>에 놓인다</div>
        ${r.varNames && r.varNames.length ? `<div class="hint" style="color:var(--accent)">자리에 따라 모양이 바뀐다 —
          ${r.varNames.map((v) => `<b style="font-family:var(--han);font-size:19px">${esc(v.v)}</b>${v.n ? `(${esc(v.n)})` : ''}`).join(' · ')}</div>` : ''}
        ${r.examples.length ? `<div class="reveal" style="text-align:center">
          <div style="color:var(--dim);font-size:12px;margin-bottom:6px">이 부수를 쓰는 한자</div>
          ${r.examples.map((e) => `<div><b style="font-family:var(--han);font-size:20px">${esc(e.c)}</b>
            <span style="color:var(--dim)">${esc(e.hun)} ${esc(e.eum)}</span>
            <span class="lvl">${esc(C().label(e.lv))}</span></div>`).join('')}
        </div>` : ''}`;
    }
    if (card.kind === 'hanja') {
      return `
        <div class="stem">${esc(r.c)}</div>
        <div class="hint" style="font-size:19px;color:var(--ink);margin-top:10px"><b>${esc(r.hun)} ${esc(r.eum)}</b></div>
        <div class="hint"><b>${esc(r.rad)}</b>부 ${r.resid != null ? r.resid + '획' : ''}${r.str ? ` · 총 ${r.str}획` : ''} · ${esc(C().label(r.lv))}${r.variant ? ` · 약자 ${esc(r.variant)}` : ''}</div>
        ${r.alts && r.alts.length ? `<div class="hint">다른 훈: ${esc(r.alts.slice(0, 3).join(' / '))}</div>` : ''}
        ${card.track === 'write' ? '<div class="hint" style="color:var(--accent)">쓰기 대상 — 반드시 손으로 세 번 써 보세요.</div>' : ''}
        ${r.words.length ? `<div class="reveal" style="text-align:center">${r.words.slice(0, 3).map((w) =>
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
      Session._s = {
        pack, opts, queue, i: 0, done: 0, correct: 0, total: queue.length,
        revealed: false, again: 0, introSeen: new Set(),
      };
      Session._render();
    },

    _render() {
      const s = Session._s;
      if (s.i >= s.queue.length) return Session._finish();
      const q = s.queue[s.i];
      // 처음 보는 카드는 문제부터 내지 않는다. 먼저 뜻·부수·용례를 보여 준 뒤 인출로 넘어간다.
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
      const card = C().deck.byId.get(q.cardId);
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
      const selfGraded = input === null;
      const ok = selfGraded ? null : AiSun.quiz.check(q, input);
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
      $('#answer-area').insertAdjacentHTML('beforeend', `
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
      if (g === 0) { s.queue.push(q); s.again += 1; }

      const d = AiSun.store.day();
      if (s.opts.countNew) d.new += 1; else d.rev += 1;
      AiSun.store.save();

      s.i += 1; s.revealed = false;
      Session._render();
    },

    _finish(early) {
      const s = Session._s;
      document.removeEventListener('keydown', Session._key);
      C().settleGates();
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

  /* ─── 온보딩 ─── 처음 여는 사람에게 가장 중요한 한 가지 질문 ─── */
  V.onboard = function () {
    const st = AiSun.store.state;
    const load = (stage) => {
      const saved = st.settings.startStage;
      st.settings.startStage = stage;
      const r = C().roadmap();
      st.settings.startStage = saved;
      return r;
    };
    const opts = [
      { key: 'radical', title: '한자를 처음 배웁니다', desc: '부수 214자부터 시작합니다. 여기가 정석입니다.' },
      { key: '8', title: '부수는 압니다', desc: '8급 한자부터 시작합니다.' },
      { key: '5', title: '6급 정도는 압니다', desc: '5급Ⅱ부터 시작합니다.' },
      { key: '4', title: '5급을 땄습니다', desc: '4급Ⅱ부터 시작합니다.' },
      { key: '3', title: '4급을 땄습니다', desc: '3급Ⅱ부터 시작합니다.' },
      { key: '2', title: '3급을 땄습니다', desc: '2급부터 시작합니다.' },
      { key: '1', title: '2급을 땄습니다', desc: '1급만 남았습니다.' },
    ];
    // 선택한 칸의 "이전 칸까지는 통과"로 처리하므로, 시작 칸은 그 칸 자체다
    const startFor = (k) => k;

    mount(`
      <h1 class="page">어디서부터 시작할까요</h1>
      <p class="lede">지금 수준을 고르면 그 위 단계만 학습 대상이 됩니다.
        건너뛴 급수도 시험 범위에는 남으니, 잊고 있었다면 오답노트를 통해 다시 들어옵니다.</p>
      <div class="grid c2">
        ${opts.map((o) => {
          const r = load(startFor(o.key));
          return `<div class="card">
            <h2>${esc(o.title)}</h2>
            <p class="note">${esc(o.desc)}</p>
            <p class="note">남은 단계 <b>${r.rows.filter((x) => x.inPath).length}칸</b> ·
              하루 20장이면 <b>약 ${r.totalMonths}개월</b></p>
            <button class="btn primary sm" data-start="${esc(o.key)}" style="margin-top:8px">여기서 시작</button>
          </div>`;
        }).join('')}
      </div>
      <p class="note" style="margin-top:16px">나중에 <b>설정</b>에서 언제든 바꿀 수 있습니다.</p>`);

    $$('[data-start]').forEach((b) => {
      b.onclick = () => {
        const key = b.dataset.start;
        st.settings.startStage = key;
        st.settings.onboarded = true;
        // 시작 칸 이전은 통과한 것으로 표시해 로드맵이 사실대로 보이게 한다
        st.stages = st.stages || {};
        const order = C().order();
        for (const k of order) {
          if (k === key) break;
          st.stages[k] = { cleared: true, clearedAt: U.today(), skipped: true };
        }
        AiSun.store.saveNow();
        AiSun.render();
        go('roadmap');
      };
    });
  };

  /* ─── 대시보드 ─── */
  V.dashboard = function () {
    const st = AiSun.store.state;
    if (!st.settings.onboarded) return V.onboard();

    C().settleGates();
    const p = C().plan();
    const prog = C().progress();
    const proj = C().projectedScore(p.stageKey);
    const fc = AiSun.srs.forecast(14);
    const ck = AiSun.store.checks();
    const day = AiSun.store.day();
    const wrongN = Object.keys(st.wrong).length;
    const road = C().roadmap();
    const g = p.gate;

    const projV = proj.projected == null ? '—' : proj.projected;
    const sp = p.spec;

    mount(`
      <h1 class="page">${esc(p.note.title)}</h1>
      <p class="lede">${esc(p.note.goal)}${p.complete ? ' — 목표 급수까지 모두 통과했습니다.' : ''}</p>

      <div class="grid c4">
        ${metric(C().label(p.stageKey), '지금 단계')}
        ${metric(p.progress.pct + '%', '이 단계 학습', p.progress.pct >= 90 ? 'good' : '')}
        ${metric(`${g.passes}/${g.passesNeeded}`, '관문 시험 합격', g.tested ? 'good' : '')}
        ${metric('약 ' + road.totalMonths + '개월', '목표까지 남은 기간')}
      </div>

      <section style="margin-top:22px">
        <h2>이 단계를 통과하려면 <span class="tag">${esc(C().label(p.stageKey))}</span></h2>
        <div class="card">
          <p class="note">${esc(p.note.detail)}</p>
          <div style="margin-top:12px">
            <div class="row"><span>① 배정 카드 학습</span><span class="spacer"></span>
              <b>${p.progress.started} / ${p.progress.total}</b>
              ${g.learned ? '<span class="chip hot">완료</span>' : ''}</div>
            ${bar(p.progress.pct, g.learned)}
            <div class="row" style="margin-top:10px"><span>② ${esc(C().label(p.stageKey))} 시험 합격 ${g.passesNeeded}회</span>
              <span class="spacer"></span><b>${g.passes} / ${g.passesNeeded}</b>
              ${g.tested ? '<span class="chip hot">완료</span>' : ''}</div>
            ${bar(U.pct(g.passes, g.passesNeeded), g.tested)}
            ${g.attempts ? `<p class="note">응시 ${g.attempts}회 · 최고 ${g.best}%${
              sp ? ` (합격선 ${sp.pass}%)` : ' (합격선 80%)'}</p>` : ''}
          </div>
        </div>
      </section>

      <section>
        <h2>오늘 할 일</h2>
        <div class="card">
          <ul class="todo">
            <li class="${ck.review ? 'done' : ''}"><span class="mark">✓</span>
              <span class="t"><b>복습 ${p.dueIds.length}장</b>
              <small>잊을 때가 된 카드. 신규보다 먼저 끝냅니다.</small></span>
              <button class="btn sm primary" data-act="review"${p.dueIds.length ? '' : ' disabled'}>시작</button></li>

            <li class="${ck.learn ? 'done' : ''}"><span class="mark">✓</span>
              <span class="t"><b>새로 배우기 ${p.newCards.length}장</b>
              <small>${p.remainingNew ? `이 단계에 ${p.remainingNew}장 남았습니다` : '이 단계 카드를 모두 익혔습니다'}</small></span>
              <button class="btn sm primary" data-act="learn"${p.newCards.length ? '' : ' disabled'}>시작</button></li>

            <li class="${ck.drill ? 'done' : ''}"><span class="mark">✓</span>
              <span class="t"><b>유형 드릴 — ${p.drill.map(esc).join(' · ')}</b>
              <small>이 급수에서 실제로 출제되는 유형만 돌립니다.</small></span>
              <button class="btn sm" data-act="drill">시작</button></li>

            <li class="${ck.test ? 'done' : ''}"><span class="mark">✓</span>
              <span class="t"><b>${p.test ? esc(p.test.title) : '오답 재도전 ' + wrongN + '장'}</b>
              <small>${p.test ? `${p.test.size}문항 · ${p.test.minutes}분${
                p.test.kind === 'gate' ? ' · 합격하면 다음 단계가 열립니다' : ''}`
                : '틀린 카드만 모아 다시 풉니다.'}</small></span>
              <button class="btn sm ${p.test && p.test.kind === 'gate' ? 'primary' : ''}"
                data-act="${p.test ? 'test' : 'wrong'}"${(!p.test && !wrongN) ? ' disabled' : ''}>시작</button></li>
          </ul>
          <p class="note">오늘 푼 문항 <b>${day.t}</b>개 · 정답률 <b>${U.pct(day.c, day.t)}%</b></p>
        </div>
      </section>

      <div class="grid c2">
        <section>
          <h2>${esc(C().label(p.stageKey))} 예상 점수</h2>
          <div class="card">
            <div class="row"><b style="font-size:22px">${projV}</b>
              <span style="color:var(--dim)">/ ${sp ? sp.items : 60}문항</span>
              <span class="spacer"></span>
              <span class="chip ${proj.pass ? 'hot' : ''}">합격 ${sp ? sp.passItems : 48}문항</span></div>
            ${bar(proj.projected == null ? 0 : (proj.projected / (sp ? sp.items : 60)) * 100, proj.pass)}
            <p class="note">유형별 최근 정답률에 이 급수의 배점을 곱해 환산했습니다.
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
        <h2>전체 여정</h2>
        <div class="card">
          <div class="row"><b>${prog.started.toLocaleString()} / ${prog.total.toLocaleString()}장</b>
            <span style="color:var(--dim)">목표 ${esc(C().label(st.settings.targetLevel))}까지</span>
            <span class="spacer"></span>
            <span class="chip">약 ${road.totalMonths}개월 남음</span></div>
          ${bar(prog.pct)}
          <div class="row" style="margin-top:10px">
            <button class="btn" onclick="location.hash='#/roadmap'">로드맵 보기</button>
            <button class="btn ghost" onclick="location.hash='#/stats'">통계</button>
          </div>
        </div>
      </section>
    `);
    $$('[data-act]').forEach((b) => { b.onclick = () => V._startTask(b.dataset.act, p); });
  };

  V._startTask = function (act, p) {
    p = p || C().plan();
    const rand = U.rng(U.today() + act + p.stageKey);
    const deck = C().deck;
    const charScope = C().charScope(p.stageKey);
    const scope = C().scope(p.stageKey);

    if (act === 'review') {
      const items = [];
      for (const id of U.shuffle(p.dueIds, rand)) {
        const card = deck.byId.get(id);
        if (!card) continue;
        const q = AiSun.quiz.fromCard(card, rand, { charScope });
        if (q) items.push(q);
        if (items.length >= 200) break;
      }
      if (!items.length) return alert('오늘 복습할 카드가 없습니다.');
      AiSun.store.checks().review = true; AiSun.store.save();
      return Session.run({ title: '복습', items }, {});
    }

    if (act === 'learn') {
      const items = [];
      for (const card of p.newCards) {
        const q = AiSun.quiz.fromCard(card, rand, { charScope });
        if (q) items.push(q);
      }
      if (!items.length) return alert('오늘 배정된 새 카드가 없습니다.');
      AiSun.store.checks().learn = true; AiSun.store.save();
      return Session.run({ title: '새로 배우기', items }, { countNew: true });
    }

    if (act === 'drill') {
      const types = p.drill.length ? p.drill : ['독음'];
      const per = Math.ceil(24 / types.length);
      const items = [];
      types.forEach((t) => {
        items.push(...AiSun.quiz.byType(t, per, { rand, pool: scope, charScope }));
      });
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
      return V.examRun(AiSun.exam.build(p.test.levelKey, {
        kind: p.test.kind, title: p.test.title, size: p.test.size,
        minutes: p.test.minutes, seed: U.today() + p.test.kind + p.test.levelKey,
      }));
    }
  };

  /* ─── 오늘 학습 ─── */
  V.today = function () {
    const st = AiSun.store.state;
    if (!st.settings.onboarded) return V.onboard();
    const p = C().plan();
    const ck = AiSun.store.checks();

    const routine = [
      { k: 'review', t: '① 복습', m: 20, d: `오늘 만기된 ${p.dueIds.length}장. 밀리면 다음 날 두 배가 됩니다.`, n: p.dueIds.length },
      { k: 'learn', t: '② 새로 배우기', m: 25, d: '뜻·부수·용례를 먼저 보고 나서 문제를 풉니다.', n: p.newCards.length },
      { k: 'drill', t: '③ 유형 드릴', m: 15, d: `오늘 초점: ${p.drill.join(' · ')}`, n: 24 },
      { k: p.test ? 'test' : 'wrong', t: p.test ? '④ ' + p.test.title : '④ 오답 재도전',
        m: p.test ? p.test.minutes : 10,
        d: p.test ? (p.test.kind === 'gate' ? '합격하면 다음 단계가 열립니다.' : '지금 실력을 중간 점검합니다.')
          : '틀린 카드만 모아 다시 풉니다.',
        n: p.test ? p.test.size : Object.keys(st.wrong).length },
    ];

    mount(`
      <h1 class="page">오늘 학습 · ${esc(p.date)} (${esc(U.dowName(p.date))})</h1>
      <p class="lede"><b>${esc(C().label(p.stageKey))}</b> — ${esc(p.note.goal)}</p>

      ${p.isRestDay ? `<div class="card" style="border-color:var(--accent)">
        <b>일요일 — 정리하는 날</b>
        <p class="note">밀린 복습을 비우고, 정답률이 낮은 유형만 골라 드릴하세요.
          쉬는 날을 지켜야 끝까지 갑니다.</p></div>` : ''}

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
        <h2>이 단계 진행</h2>
        <div class="card">
          <div class="row"><span>${esc(C().label(p.stageKey))} 배정 카드</span><span class="spacer"></span>
            <b>${p.progress.started} / ${p.progress.total}</b></div>
          ${bar(p.progress.pct, p.progress.pct >= 90)}
          <p class="note">${p.remainingNew
            ? `하루 ${AiSun.store.state.settings.dailyNew}장 기준으로 <b>약 ${Math.ceil(p.remainingNew / AiSun.store.state.settings.dailyNew)}일</b> 남았습니다.`
            : '배정 카드를 모두 익혔습니다. 관문 시험을 치르세요.'}</p>
        </div>
      </section>`);
    $$('[data-act]').forEach((b) => { b.onclick = () => V._startTask(b.dataset.act, p); });
  };

  /* ─── 로드맵 ─── 사다리 전체를 한눈에 ─── */
  V.roadmap = function () {
    const st = AiSun.store.state;
    C().settleGates();
    const road = C().roadmap();
    const cur = C().currentStage();

    mount(`
      <h1 class="page">로드맵</h1>
      <p class="lede">부수부터 1급까지 ${road.rows.length}칸. 각 칸은 <b>배정 카드를 다 익히고</b>
        <b>그 급수 시험을 합격</b>해야 열립니다. 남은 기간은 지금 설정한 속도(하루 ${road.perDay}장)로 계산한 것입니다.</p>

      <div class="grid c3" style="margin-bottom:18px">
        ${metric(C().label(cur), '지금 단계')}
        ${metric(road.rows.filter((r) => r.inPath && !r.cleared).length + '칸', '남은 단계')}
        ${metric('약 ' + road.totalMonths + '개월', '예상 소요', road.totalMonths > 24 ? 'warn' : '')}
      </div>

      <div class="ladder">
        ${road.rows.slice().reverse().map((r) => {
          const state = r.cleared ? 'done' : (r.key === cur ? 'now' : (r.inPath ? 'todo' : 'skip'));
          return `<div class="rung ${state}">
            <div class="rung-mark">${r.cleared ? '✓' : (r.key === cur ? '▶' : '')}</div>
            <div class="rung-body">
              <div class="row">
                <b>${esc(r.label)}</b>
                ${r.spec ? `<span class="chip">읽기 ${r.spec.read.toLocaleString()}${r.spec.write ? ` · 쓰기 ${r.spec.write.toLocaleString()}` : ''}</span>` : '<span class="chip">214자</span>'}
                ${r.spec ? `<span class="chip">${r.spec.items}문항 · ${r.spec.pass}%</span>` : '<span class="chip">60문항 · 80%</span>'}
                <span class="spacer"></span>
                ${r.cleared ? '<span class="chip hot">통과</span>'
                  : r.inPath ? `<span class="chip">${r.cards.toLocaleString()}장${r.etaWeeks ? ` · ${r.etaWeeks}주 뒤` : ''}</span>`
                  : '<span class="chip">건너뜀</span>'}
              </div>
              <p class="note">${esc(r.note.goal)}</p>
              ${r.inPath && !r.cleared ? `${bar(r.pct, r.pct >= 90)}
                <p class="note">${r.started} / ${r.cards}장 학습 · 관문 시험 ${r.gate.passes}/${r.gate.passesNeeded}회 합격</p>` : ''}
              ${r.key === cur ? `<div class="row" style="margin-top:8px">
                <button class="btn sm primary" onclick="location.hash='#/today'">오늘 학습</button>
                <button class="btn sm" data-exam="${esc(r.key)}">${esc(r.label)} 시험 보기</button></div>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>

      <section style="margin-top:22px">
        <h2>속도를 바꾸면</h2>
        <div class="card scroll">
          <table><thead><tr><th>하루 신규</th><th class="num">주당</th><th class="num">예상 기간</th><th>현실성</th></tr></thead><tbody>
            ${[10, 20, 30, 40, 60].map((n) => {
              const saved = st.settings.dailyNew;
              st.settings.dailyNew = n;
              const r = C().roadmap();
              st.settings.dailyNew = saved;
              const note = n <= 10 ? '여유롭게. 오래 걸려도 안 무너집니다'
                : n <= 20 ? '직장인·학생이 지킬 수 있는 속도'
                : n <= 30 ? '하루 1시간 30분은 필요합니다'
                : n <= 40 ? '전업 수험생 수준' : '단기간에만 가능합니다';
              return `<tr class="${n === road.perDay ? 'now' : ''}">
                <td><b>${n}장</b></td><td class="num">${n * 5}장</td>
                <td class="num">약 ${r.totalMonths}개월</td><td>${note}</td></tr>`;
            }).join('')}
          </tbody></table>
          <p class="note">여기에 복습이 더해집니다. 신규 20장이면 하루 총 60~80문항 정도를 풀게 됩니다.
            속도는 <b>설정</b>에서 바꿉니다.</p>
        </div>
      </section>`);

    $$('[data-exam]').forEach((b) => {
      b.onclick = () => {
        const key = b.dataset.exam;
        const sp = AiSun.exam.specFor(key);
        V.examRun(AiSun.exam.build(key, { kind: 'gate', title: `${sp.label} 관문 시험` }));
      };
    });
  };

  /* ─── 부수 ─── */
  V.radicals = function () {
    const D = AiSun.DATA;
    let q = '';
    let strokeFilter = 0;

    function render() {
      const hit = (s) => !q || String(s).toLowerCase().includes(q.toLowerCase());
      const list = D.radicals.filter((r) => (!strokeFilter || r.str === strokeFilter)
        && (hit(r.c) || hit(r.hun) || hit(r.eum) || hit(r.name)
          || r.variants.some(hit) || (r.varNames || []).some((v) => hit(v.n))));
      const prog = C().stageProgress('radical');
      const strokes = [...new Set(D.radicals.map((r) => r.str))].sort((a, b) => a - b);

      mount(`
        <h1 class="page">부수 214자</h1>
        <p class="lede">한자의 알파벳입니다. 부수를 알면 처음 보는 글자도 뜻을 짐작하고, 비슷한 글자를 구별할 수 있습니다.
          <b>모양이 바뀌는 꼴</b>(水 → 氵 삼수변)을 이름과 함께 외우는 게 핵심입니다.</p>

        <div class="grid c3" style="margin-bottom:16px">
          ${metric(prog.started + ' / 214', '학습한 부수', prog.pct >= 90 ? 'good' : '')}
          ${metric(prog.pct + '%', '진행률')}
          ${metric(D.radicals.filter((r) => r.variants.length).length, '모양이 바뀌는 부수')}
        </div>

        <div class="row" style="margin-bottom:12px">
          <button class="btn primary sm" id="learn-rad">부수 학습 시작</button>
          <button class="btn sm" id="drill-rad">부수 드릴 20문항</button>
          <button class="btn sm" id="test-rad">부수 졸업 시험</button>
        </div>

        <input class="search" id="q" placeholder="부수·훈음·이름으로 검색" value="${esc(q)}">
        <div class="row" style="margin-bottom:12px">
          <button class="btn sm ${strokeFilter ? '' : 'primary'}" data-str="0">전체</button>
          ${strokes.map((n) => `<button class="btn sm ${strokeFilter === n ? 'primary' : ''}" data-str="${n}">${n}획</button>`).join('')}
        </div>

        <p class="note">${list.length}자</p>
        <div class="hanja-grid">${list.map((r) => {
          const s = AiSun.srs.get('r:' + r.c + '#rad');
          return `<div class="hcell${s ? ' learned' : ''}">
            <div class="c">${esc(r.c)}${r.variants.length ? `<span class="var">${r.variants.map(esc).join(' ')}</span>` : ''}</div>
            <div class="m">${esc(r.hun)} ${esc(r.eum)}</div>
            <div class="meta">${esc(r.name)} · ${r.str}획 · ${esc(r.pos)}</div>
            ${(r.varNames || []).length ? `<div class="meta" style="color:var(--accent)">${
              r.varNames.map((v) => `${esc(v.v)} ${esc(v.n)}`).join(' · ')}</div>` : ''}
            ${r.examples.length ? `<div class="meta">예) ${r.examples.slice(0, 3).map((e) => esc(e.c)).join(' ')}</div>` : ''}
          </div>`;
        }).join('')}</div>`);

      const inp = $('#q');
      inp.oninput = () => { q = inp.value; const pos = inp.selectionStart; render(); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); };
      $$('[data-str]').forEach((b) => { b.onclick = () => { strokeFilter = +b.dataset.str; render(); }; });

      $('#learn-rad').onclick = () => {
        const rand = U.rng(U.today() + 'rad');
        const cards = (C().byStage.get('radical') || []).filter((c) => AiSun.srs.isNew(c.id))
          .slice(0, AiSun.store.state.settings.dailyNew);
        if (!cards.length) return alert('새로 배울 부수가 없습니다. 드릴이나 졸업 시험으로 넘어가세요.');
        const items = cards.map((c) => AiSun.quiz.fromCard(c, rand)).filter(Boolean);
        Session.run({ title: '부수 학습', items }, { countNew: true });
      };
      $('#drill-rad').onclick = () => Session.run(AiSun.exam.drill('부수훈음', 20, { levelKey: 'radical' }), {});
      $('#test-rad').onclick = () => V.examRun(AiSun.exam.build('radical', { kind: 'gate', title: '부수 졸업 시험' }));
    }
    render();
  };

  /* ─── 드릴 ─── */
  V.drill = function () {
    const st = AiSun.store.state;
    const cur = C().currentStage();
    const sp = AiSun.exam.specFor(cur);
    mount(`
      <h1 class="page">유형 드릴</h1>
      <p class="lede"><b>${esc(sp.label)}</b>에서 실제로 출제되는 유형만 보여 줍니다.
        출제 범위도 그 급수까지로 제한되므로, 아직 안 배운 글자는 나오지 않습니다.</p>
      <div class="grid c3">
        ${sp.types.map((t) => {
          const b = st.byType[t.k];
          const rate = b && b.t ? U.pct(b.c, b.t) : null;
          return `<div class="card">
            <h2>${esc(t.k)} <span class="sub">${t.n}문항 · ${Math.round((t.n / sp.items) * 100)}%</span></h2>
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
        const pack = AiSun.exam.drill(b.dataset.t, +b.dataset.n, { levelKey: cur });
        if (!pack.items.length) return alert('이 유형의 문항을 만들 재료가 부족합니다.');
        Session.run(pack, {});
      };
    });
  };

  /* ─── 모의고사 ─── */
  V.exam = function () {
    const st = AiSun.store.state;
    const cur = C().currentStage();
    const all = [{ lv: 'radical', label: '부수', items: 60, pass: 80, minutes: 20 }].concat(AiSun.DATA.levels);

    mount(`
      <h1 class="page">모의고사</h1>
      <p class="lede">급수마다 문항 수도, 유형 배분도, 합격선도 다릅니다.
        출제 범위는 그 급수까지로 제한되므로 실제 시험과 같은 조건입니다.</p>

      <section>
        <h2>응시할 급수</h2>
        <div class="grid c4">
          ${all.map((l) => `<div class="card ${l.lv === cur ? 'hi' : ''}">
            <h2>${esc(l.label)}${l.lv === cur ? ' <span class="lvl">지금</span>' : ''}</h2>
            <p class="note">${l.items}문항 · ${l.minutes}분<br>합격 ${Math.ceil(l.items * l.pass / 100)}문항 (${l.pass}%)</p>
            <button class="btn sm ${l.lv === cur ? 'primary' : ''}" data-lv="${esc(l.lv)}" style="margin-top:8px">시작</button>
          </div>`).join('')}
        </div>
      </section>

      <section>
        <h2>${esc(AiSun.exam.specFor(cur).label)} 배점표</h2>
        <div class="card scroll"><table>
          <thead><tr><th>유형</th><th class="num">문항</th><th class="num">비중</th></tr></thead>
          <tbody>${AiSun.exam.specFor(cur).types.map((t) => `<tr><td><b>${esc(t.k)}</b></td>
            <td class="num">${t.n}</td><td class="num">${Math.round((t.n / AiSun.exam.specFor(cur).items) * 100)}%</td></tr>`).join('')}
          </tbody></table>
          <p class="note">'획수'는 실제 시험의 筆順 문항 자리입니다. 획순 데이터가 없어 총획을 묻는 문항으로 대신합니다.</p>
        </div>
      </section>

      <section>
        <h2>응시 기록</h2>
        <div class="card">
          ${st.exams.length ? `<div class="scroll"><table>
            <thead><tr><th>날짜</th><th>구분</th><th class="num">점수</th><th class="num">정답률</th><th class="num">소요</th><th>판정</th></tr></thead>
            <tbody>${st.exams.slice().reverse().slice(0, 30).map((e) => `<tr>
              <td>${esc(e.date)}</td><td>${esc(e.title)}</td>
              <td class="num"><b>${e.correct}/${e.total}</b></td><td class="num">${e.rate}%</td>
              <td class="num">${Math.floor(e.elapsed / 60)}분</td>
              <td>${e.pass ? '<span class="chip hot">합격</span>' : '미달'}</td></tr>`).join('')}
            </tbody></table></div>`
            : '<p class="note">아직 응시 기록이 없습니다.</p>'}
        </div>
      </section>`);
    $$('[data-lv]').forEach((b) => {
      b.onclick = () => {
        const key = b.dataset.lv;
        const sp = AiSun.exam.specFor(key);
        V.examRun(AiSun.exam.build(key, { kind: 'gate', title: `${sp.label} 모의고사` }));
      };
    });
  };

  /** 시험 응시 화면 */
  V.examRun = function (pack) {
    if (!pack || !pack.items.length) return alert('문항을 만들 수 없습니다.');
    const answers = new Array(pack.items.length).fill(null);
    let cur = 0;
    let remain = pack.minutes * 60;
    let timer = null;
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

    function submit(auto) {
      if (!auto && !confirm(`제출하시겠습니까? (미응답 ${answers.filter((a) => a == null).length}문항)`)) return;
      stop();
      V.examResult(pack, AiSun.exam.grade(pack, answers));
    }

    function draw() {
      const q = pack.items[cur];
      const mm = String(Math.floor(remain / 60)).padStart(2, '0');
      const ss = String(Math.max(0, remain % 60)).padStart(2, '0');
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
          if (cur < pack.items.length - 1) { cur += 1; }
          draw();
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
      if (!el) { stop(); return; }
      const mm = String(Math.floor(remain / 60)).padStart(2, '0');
      const ss = String(Math.max(0, remain % 60)).padStart(2, '0');
      el.textContent = `${mm}:${ss}`;
      if (remain < 300) el.classList.add('low');
      if (remain <= 0) { stop(); alert('시간이 종료되었습니다. 자동 제출합니다.'); submit(true); }
    }, 1000);

    draw();
  };

  V.examResult = function (pack, r) {
    const weak = AiSun.exam.weakness(r, pack);
    const cleared = r.cleared && r.cleared.length;
    mount(`
      <h1 class="page">${esc(pack.title)} 결과</h1>
      ${cleared ? `<div class="card" style="border-color:var(--ok);margin-bottom:16px">
        <b style="color:var(--ok);font-size:17px">${r.cleared.map((k) => esc(C().label(k))).join(', ')} 단계를 통과했습니다</b>
        <p class="note">다음 칸이 열렸습니다. 로드맵에서 확인하세요.</p>
        <button class="btn primary sm" onclick="location.hash='#/roadmap'" style="margin-top:8px">로드맵 보기</button>
      </div>` : ''}
      <div class="grid c4" style="margin-bottom:18px">
        ${metric(r.correct + '/' + r.total, '맞은 문항', r.pass ? 'good' : 'bad')}
        ${metric(r.rate + '%', '정답률')}
        ${metric(r.passItems, '합격 기준')}
        ${metric(Math.floor(r.elapsed / 60) + '분', '소요 시간')}
      </div>
      <div class="card" style="margin-bottom:18px">
        ${bar(r.rate, r.pass)}
        <p class="note">${r.pass
          ? `합격선을 <b>${r.correct - r.passItems}문항</b> 넘겼습니다.`
          : `합격선까지 <b>${r.passItems - r.correct}문항</b> 남았습니다. 아래에서 많이 틀린 유형부터 메우세요.`}</p>
        ${pack.shortfall && pack.shortfall.length ? `<p class="note">
          이 급수 범위에 재료가 부족해 ${pack.shortfall.map((s) => `${esc(s.type)} ${s.missing}문항`).join(', ')}을
          기본 유형으로 대체했습니다.</p>` : ''}
      </div>

      <section>
        <h2>유형별 성적</h2>
        <div class="card scroll"><table>
          <thead><tr><th>유형</th><th class="num">문항</th><th class="num">정답률</th><th class="num">틀린 수</th><th>보강</th></tr></thead>
          <tbody>${weak.map((w) => `<tr>
            <td><b>${esc(w.type)}</b></td><td class="num">${w.weight}</td>
            <td class="num">${w.rate}%</td><td class="num">${w.lost ? '<b>' + w.lost + '</b>' : '0'}</td>
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
        <button class="btn primary" onclick="location.hash='#/roadmap'">로드맵</button>
        <button class="btn" onclick="location.hash='#/wrong'">오답노트</button>
        <button class="btn ghost" onclick="location.hash='#/dashboard'">대시보드</button>
      </div>`);
    $$('[data-drill]').forEach((b) => {
      b.onclick = () => Session.run(AiSun.exam.drill(b.dataset.drill, 20, { levelKey: pack.levelKey }), {});
    });
  };

  /* ─── 오답노트 ─── */
  V.wrong = function () {
    const st = AiSun.store.state;
    const deck = C().deck;
    const ids = Object.keys(st.wrong).sort((a, b) => st.wrong[b].n - st.wrong[a].n);
    const rows = ids.map((id) => {
      const card = deck.byId.get(id);
      if (!card) return '';
      const w = st.wrong[id];
      const s = AiSun.srs.get(id);
      const leech = AiSun.srs.isLeech(id);
      const ref = card.ref;
      const desc = card.kind === 'radical' ? `${ref.hun} ${ref.eum} — ${ref.name}`
        : card.kind === 'hanja' ? `${ref.hun} ${ref.eum}`
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
        <td>${esc(C().label(card.stage))}</td>
        <td>${esc(w.type || '')}</td>
        <td class="num">${w.n}</td>
        <td>${s ? esc(s.due) : '-'}</td></tr>`;
    }).join('');

    mount(`
      <h1 class="page">오답노트</h1>
      <p class="lede">틀린 카드는 자동으로 쌓이고, 두 번 연속 맞히면 스스로 빠집니다.
        ${AiSun.srs.LEECH_AT}회 이상 틀린 카드는 <b>고질</b>로 표시됩니다 — 방법을 바꾸라는 신호입니다.</p>
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
        ${ids.length ? `<table><thead><tr><th>카드</th><th>내용</th><th>단계</th><th>유형</th>
          <th class="num">오답</th><th>다음 복습</th></tr></thead><tbody>${rows}</tbody></table>`
          : '<p class="empty">오답이 없습니다. 좋은 상태입니다.</p>'}
      </div>`);

    const rt = $('#retry'); if (rt) rt.onclick = () => Session.run(AiSun.exam.retryWrong(30), {});
    const rl = $('#retry-leech');
    if (rl) rl.onclick = () => {
      const rand = U.rng(Date.now());
      const items = ids.filter((id) => AiSun.srs.isLeech(id))
        .map((id) => { const c = deck.byId.get(id); return c ? AiSun.quiz.fromCard(c, rand) : null; })
        .filter(Boolean);
      if (!items.length) return alert('고질 카드가 없습니다.');
      Session.run({ title: '고질 카드 집중', items }, {});
    };
    const cl = $('#clear');
    if (cl) cl.onclick = () => {
      if (!confirm('오답노트를 비웁니다. 복습 일정은 그대로 유지됩니다.')) return;
      st.wrong = {}; AiSun.store.saveNow(); V.wrong();
    };
  };

  /* ─── 통계 ─── */
  V.stats = function () {
    const st = AiSun.store.state;
    const cur = C().currentStage();
    const proj = C().projectedScore(cur);
    const prog = C().progress();
    const days = Object.keys(st.daily).sort().slice(-30);
    const maxDay = Math.max(1, ...days.map((d) => st.daily[d].t));
    const streak = (function () {
      let n = 0, d = U.today();
      while (st.daily[d] && st.daily[d].t > 0) { n += 1; d = U.addDays(d, -1); }
      return n;
    })();
    const sp = AiSun.exam.specFor(cur);

    mount(`
      <h1 class="page">통계</h1>
      <p class="lede">지금 도전 중인 <b>${esc(sp.label)}</b> 기준입니다. 배점이 큰 유형의 정답률을 먼저 올리세요.</p>

      <div class="grid c4">
        ${metric(proj.projected == null ? '—' : proj.projected + '/' + sp.items, '예상 점수', proj.pass ? 'good' : 'bad')}
        ${metric(streak + '일', '연속 학습')}
        ${metric(prog.started.toLocaleString(), '학습 착수 카드')}
        ${metric(prog.maturePct + '%', '장기기억 정착', prog.maturePct >= 50 ? 'good' : '')}
      </div>

      <section style="margin-top:22px">
        <h2>유형별 정답률 <span class="tag">${esc(sp.label)} 배점 기준</span></h2>
        <div class="card scroll"><table>
          <thead><tr><th>유형</th><th class="num">배점</th><th class="num">표본</th><th class="num">정답률</th><th style="width:36%">추이</th><th class="num">기대 득점</th></tr></thead>
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
        <h2>단계별 진행</h2>
        <div class="card scroll"><table>
          <thead><tr><th>단계</th><th class="num">카드</th><th class="num">학습</th><th style="width:30%">진행</th><th>상태</th></tr></thead>
          <tbody>${C().roadmap().rows.filter((r) => r.inPath || r.cleared).map((r) => `<tr class="${r.key === cur ? 'now' : ''}">
            <td><b>${esc(r.label)}</b></td><td class="num">${r.cards.toLocaleString()}</td>
            <td class="num">${r.started.toLocaleString()}</td><td>${bar(r.pct, r.cleared)}</td>
            <td>${r.cleared ? '<span class="chip hot">통과</span>' : r.key === cur ? '진행 중' : '대기'}</td></tr>`).join('')}
          </tbody></table></div>
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
      </section>`);
  };

  /* ─── 자료실 ─── */
  V.library = function () {
    const D = AiSun.DATA;
    let tab = 'hanja';
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
            ${D.levels.map((l) => `<button class="btn sm ${lvFilter === l.lv ? 'primary' : ''}" data-lv="${esc(l.lv)}">${esc(l.label)}</button>`).join('')}
          </div>
          <p class="note">${list.length}자</p><div class="hanja-grid">${list.slice(0, 400).map((h) => `
          <div class="hcell"><div class="c">${esc(h.c)}</div>
            <div class="m">${esc(h.hun)} ${esc(h.eum)}</div>
            <div class="meta"><span class="lvl">${esc(C().label(h.lv))}</span> ${esc(h.rad)}부 ${h.resid != null ? h.resid + '획' : ''}${h.str ? ' · 총' + h.str + '획' : ''}${h.variant ? ' · 약자 ' + esc(h.variant) : ''}</div>
            ${h.words[0] ? `<div class="meta">${esc(h.words[0].w)}(${esc(h.words[0].r)})</div>` : ''}
          </div>`).join('')}</div>${list.length > 400 ? '<p class="note">상위 400자만 표시했습니다. 급수 필터나 검색으로 좁혀 보세요.</p>' : ''}`;
      } else if (tab === 'idioms') {
        const list = D.idioms.filter((i) => hit(i.idiom) || hit(i.reading) || hit(i.meaning));
        body = `<p class="note">${list.length}개</p><div class="scroll"><table>
          <thead><tr><th>성어</th><th>독음</th><th>뜻</th></tr></thead><tbody>
          ${list.map((i) => `<tr><td style="font-family:var(--han);font-size:19px"><b>${esc(i.idiom)}</b></td>
            <td>${esc(i.reading)}</td><td>${esc(i.meaning)}</td></tr>`).join('')}
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
          ${list.slice(0, 200).map((m) => `<tr><td><b>${esc(m.reading)}</b></td><td>${m.words.map((w) =>
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
        <p class="lede">학습 중 막힐 때 찾아보는 원본 데이터입니다. 부수는 <b>부수</b> 탭에 따로 있습니다.</p>
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
    const st = AiSun.store.state;
    const s = st.settings;
    const order = C().order();

    mount(`
      <h1 class="page">설정</h1>
      <div class="grid c2">
        <section><h2>학습 계획</h2><div class="card">
          <label class="field"><span>시작 단계 — 이 단계 아래는 배우지 않습니다</span>
            <select id="start">
              ${order.map((k) => `<option value="${esc(k)}"${s.startStage === k ? ' selected' : ''}>${esc(C().label(k))}${k === 'radical' ? ' (한자 처음)' : '부터'}</option>`).join('')}
            </select></label>
          <label class="field"><span>목표 급수</span>
            <select id="target">
              ${AiSun.DATA.levels.map((l) => `<option value="${esc(l.lv)}"${s.targetLevel === l.lv ? ' selected' : ''}>${esc(l.label)}</option>`).join('')}
            </select></label>
          <label class="field"><span>하루 새 카드 목표 — 기간 추정의 기준</span>
            <input type="number" id="daily" min="5" max="120" value="${s.dailyNew}"></label>
          <button class="btn primary" id="save">저장</button>
          <p class="note" id="est"></p>
        </div></section>

        <section><h2>백업</h2><div class="card">
          <p class="note">학습 기록은 <b>이 브라우저에만</b> 저장됩니다. 서버로 올라가지 않으므로 기기를 바꾸거나
            브라우저 데이터를 지우면 사라집니다. 주 1회는 내보내 두세요.</p>
          <div class="row" style="margin:10px 0">
            <button class="btn" id="export">내보내기</button>
            <button class="btn" id="copy">클립보드로 복사</button>
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

      <section><h2>시험 정보</h2><div class="card scroll">
        <table><thead><tr><th>급수</th><th class="num">읽기</th><th class="num">쓰기</th><th class="num">문항</th><th class="num">합격</th><th class="num">시간</th></tr></thead>
          <tbody>${AiSun.DATA.levels.map((l) => `<tr>
            <td><b>${esc(l.label)}</b></td><td class="num">${l.read.toLocaleString()}</td>
            <td class="num">${l.write ? l.write.toLocaleString() : '—'}</td>
            <td class="num">${l.items}</td><td class="num">${l.passItems} (${l.pass}%)</td>
            <td class="num">${l.minutes}분</td></tr>`).join('')}
        </tbody></table>
        <p class="note">읽기·쓰기 배정과 합격률은 공식 자료를 따랐습니다. 문항 수·시험 시간·유형별 배분은
          시행처 사이트에 접속하지 못해 통용 기준을 옮긴 것이니, 응시 전 <b>한국어문회 공고</b>와 대조하세요.
          다르면 <span class="kbd">data/src/levels.tsv</span> 한 파일만 고치면 전부 따라옵니다.</p>
        <p class="note">배정한자 3,500자의 급수·훈음·부수·획수는 <b>한국어문회</b>가 공개한 자료를 따랐고
          그 저작권은 한국어문회에 있습니다. 어휘는 libhangul 한자사전(BSD), 부수·획수 교차 검증은
          Unicode Unihan 자료를 썼습니다. 자세한 출처는 <span class="kbd">docs/05-원본-데이터.md</span>를 보세요.</p>
      </div></section>`);

    const est = () => {
      const saved = { a: s.startStage, b: s.targetLevel, c: s.dailyNew };
      s.startStage = $('#start').value; s.targetLevel = $('#target').value;
      s.dailyNew = U.clamp(+$('#daily').value || 20, 5, 120);
      const r = C().roadmap();
      $('#est').innerHTML = `이 설정이면 남은 단계 <b>${r.rows.filter((x) => x.inPath && !x.cleared).length}칸</b>, ` +
        `예상 <b>약 ${r.totalMonths}개월</b> (${r.etaDate} 무렵)`;
      Object.assign(s, { startStage: saved.a, targetLevel: saved.b, dailyNew: saved.c });
    };
    ['#start', '#target', '#daily'].forEach((sel) => { $(sel).oninput = est; $(sel).onchange = est; });
    est();

    $('#save').onclick = () => {
      s.startStage = $('#start').value;
      s.targetLevel = $('#target').value;
      s.dailyNew = U.clamp(+$('#daily').value || 20, 5, 120);
      s.onboarded = true;
      // 시작 단계 이전은 통과로 표시. 이미 진짜로 통과한 기록은 건드리지 않는다.
      st.stages = st.stages || {};
      for (const k of order) {
        if (k === s.startStage) break;
        if (!st.stages[k]) st.stages[k] = { cleared: true, clearedAt: U.today(), skipped: true };
      }
      // 시작 단계 이후에 '건너뜀'으로 찍혀 있던 기록은 되돌린다
      let after = false;
      for (const k of order) {
        if (k === s.startStage) after = true;
        if (after && st.stages[k] && st.stages[k].skipped) delete st.stages[k];
      }
      AiSun.store.saveNow();
      AiSun.render();
      alert('저장했습니다.');
    };

    $('#export').onclick = () => { $('#io').value = AiSun.store.export(); };
    $('#copy').onclick = async () => {
      const json = AiSun.store.export();
      $('#io').value = json;
      try {
        await navigator.clipboard.writeText(json);
        $('#copy').textContent = '복사했습니다';
        setTimeout(() => { const b = $('#copy'); if (b) b.textContent = '클립보드로 복사'; }, 2000);
      } catch (e) {
        $('#io').select();
        alert('자동 복사가 막혀 있습니다. 아래 칸의 내용을 직접 복사하세요.');
      }
    };
    $('#download').onclick = async () => {
      const json = AiSun.store.export();
      const filename = `aisun-backup-${U.today()}.json`;
      const hosted = !!(global.claude && typeof global.claude.use === 'function');
      if (hosted) {
        let dl = null;
        try { dl = await global.claude.use('downloads'); } catch (e) { dl = null; }
        if (!dl) {
          $('#io').value = json;
          alert('이 화면에서는 파일로 저장할 수 없습니다. [클립보드로 복사]를 쓰거나 아래 칸의 내용을 옮겨 두세요.');
          return;
        }
        try { await dl.save({ filename, data: json }); }
        catch (e) {
          if (e && e.code === 'declined') return;
          alert('저장하지 못했습니다: ' + ((e && e.message) || '알 수 없는 오류'));
        }
        return;
      }
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $('#import').onclick = () => {
      try { AiSun.store.import($('#io').value); alert('불러왔습니다.'); AiSun.render(); }
      catch (e) { alert('불러오기 실패: ' + e.message); }
    };
    $('#reset').onclick = () => {
      if (!confirm('모든 학습 기록이 지워집니다. 계속할까요?')) return;
      if (!confirm('되돌릴 수 없습니다. 정말 초기화할까요?')) return;
      AiSun.store.reset(); AiSun.render();
    };
  };
})(window);
