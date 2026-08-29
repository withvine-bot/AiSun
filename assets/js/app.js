/* AiSun — app.js : 부트스트랩 · 라우터 · 헤더 */
(function (global) {
  'use strict';

  const AiSun = global.AiSun;
  const U = AiSun.util;

  const ROUTES = [
    ['dashboard', '대시보드'],
    ['today', '오늘 학습'],
    ['roadmap', '로드맵'],
    ['radicals', '부수'],
    ['drill', '유형 드릴'],
    ['exam', '모의고사'],
    ['wrong', '오답노트'],
    ['stats', '통계'],
    ['library', '자료실'],
    ['settings', '설정'],
  ];

  function currentRoute() {
    const raw = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
    return ROUTES.some(([k]) => k === raw) ? raw : 'dashboard';
  }

  function renderTabs() {
    const cur = currentRoute();
    document.getElementById('tabs').innerHTML = ROUTES.map(([k, n]) =>
      `<button data-r="${k}"${k === cur ? ' aria-current="page"' : ''}>${n}</button>`).join('');
    Array.from(document.querySelectorAll('#tabs button')).forEach((b) => {
      b.onclick = () => { location.hash = '#/' + b.dataset.r; };
    });
  }

  function renderHeader() {
    const st = AiSun.store.state;
    const C = AiSun.curriculum;
    if (!st.settings.onboarded) {
      document.getElementById('hdr-sub').textContent = '시작 단계를 고르세요';
      document.getElementById('hdr-stats').innerHTML = '';
      return;
    }
    const p = C.plan();
    const road = C.roadmap();
    const remaining = road.rows.filter((r) => r.inPath && !r.cleared).length;
    const wrongN = Object.keys(st.wrong).length;

    document.getElementById('hdr-sub').textContent =
      `${C.label(p.stageKey)} · 목표 ${C.label(st.settings.targetLevel)}까지 ${remaining}칸`;

    document.getElementById('hdr-stats').innerHTML = [
      `<span class="chip hot">${U.esc(C.label(p.stageKey))}</span>`,
      `<span class="chip">복습 <b>${p.dueIds.length}</b></span>`,
      `<span class="chip">새 카드 <b>${p.newCards.length}</b></span>`,
      `<span class="chip">오답 <b>${wrongN}</b></span>`,
      `<span class="chip">단계 <b>${p.progress.pct}%</b></span>`,
      `<span class="chip">약 <b>${road.totalMonths}</b>개월</span>`,
    ].join('');
  }

  function render() {
    const r = currentRoute();
    renderTabs();
    try { renderHeader(); } catch (e) { console.warn('헤더 렌더 실패', e); }
    const fn = AiSun.views[r] || AiSun.views.dashboard;
    try {
      fn();
    } catch (e) {
      console.error(e);
      document.getElementById('view').innerHTML =
        `<div class="card"><h2>화면을 그리는 중 오류가 발생했습니다</h2>
         <p class="note">${U.esc(e && e.message)}</p>
         <button class="btn" onclick="location.hash='#/dashboard'">대시보드로</button></div>`;
    }
  }
  AiSun.render = render;

  function boot() {
    const data = global.AISUN_DATA;
    if (!data) {
      document.getElementById('view').innerHTML =
        `<div class="card"><h2>데이터를 불러오지 못했습니다</h2>
         <p class="note"><span class="kbd">node tools/build.mjs</span> 를 실행해
         <span class="kbd">assets/data/corpus.js</span> 를 생성하세요.</p></div>`;
      return;
    }
    AiSun.DATA = data;
    AiSun.store.load();
    AiSun.curriculum.init(data);
    AiSun.quiz.init(data);
    AiSun.curriculum.settleGates();

    global.addEventListener('hashchange', render);
    global.addEventListener('beforeunload', () => AiSun.store.saveNow());
    if (!location.hash) location.hash = '#/dashboard';
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
