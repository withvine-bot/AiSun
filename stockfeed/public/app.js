// 공시레이더 프런트엔드. 빌드 단계 없는 단일 모듈.

// ── 유틸 ─────────────────────────────────────────────
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const api = async (path) => {
  const r = await fetch(path);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `요청 실패 (${r.status})`);
  return r.json();
};

const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } },
};

const state = {
  cur: ls.get('cur', 'USD'),
  theme: ls.get('theme', null),
  watch: ls.get('watch', []),
  keywords: ls.get('keywords', []),
  inbox: ls.get('inbox', []),
  unread: ls.get('unread', 0),
  fx: null,
  categories: {},
  connected: false,
};

// ── 표시 형식 ────────────────────────────────────────
function money(usd) {
  if (usd == null) return '—';
  if (state.cur === 'KRW' && state.fx) return `${Math.round(usd * state.fx).toLocaleString('ko-KR')}원`;
  return `$${usd >= 1 ? usd.toFixed(2) : usd.toFixed(4)}`;
}
const pctCls = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : 'muted');
const pct = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`);
function ago(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return '방금 전';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}
const kstParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
// 한국 시각 'MM.DD HH:mm'
const kst = { format(ts) { const p = Object.fromEntries(kstParts.formatToParts(new Date(ts)).map((x) => [x.type, x.value])); return `${p.month}.${p.day} ${p.hour}:${p.minute}`; } };
const etFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
function sessionAt(ts) {
  const p = Object.fromEntries(etFmt.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  const m = Number(p.hour) * 60 + Number(p.minute);
  if (p.weekday === 'Sat' || p.weekday === 'Sun') return '주말';
  if (m >= 240 && m < 570) return '프리마켓';
  if (m >= 570 && m < 960) return '정규장';
  if (m >= 960 && m < 1200) return '애프터마켓';
  return '데이마켓';
}
const volume = (v) => (v >= 1e8 ? `${(v / 1e8).toFixed(1)}억` : v >= 1e4 ? `${Math.round(v / 1e4).toLocaleString()}만` : String(v));

// ── 공시 카드 ────────────────────────────────────────
function reactionHTML(f) {
  const r = f.reaction;
  if (!f.live || !f.ticker || !r || r.failed) return '';
  const marks = [5, 30, 60].map((m) => {
    const v = r.marks?.[m];
    return v == null ? `<span class="m">${m}분 ·</span>` : `<span class="m ${pctCls(v)}">${m}분 ${pct(v)}</span>`;
  }).join('');
  return `<div class="react" title="포착 시점 가격 ${esc(money(r.base))} 대비"><span>포착 후</span>${marks}</div>`;
}

function cardHTML(f, { fresh = false, compact = false } = {}) {
  const watched = f.ticker && state.watch.includes(f.ticker);
  const when = f.live
    ? `<b>${ago(f.ts)}</b><span class="ses">${sessionAt(f.ts)}</span><span>${kst.format(f.ts)}</span>`
    : `<b>${esc((f.fileDate || '').slice(5).replace('-', '.'))} 접수</b>${compact && f.ts ? `<span>${kst.format(f.ts)}</span>` : ''}`;
  const sig = f.signal < 0 ? '<span class="badge warn">주의</span>' : f.signal > 0 ? '<span class="badge good">호재</span>' : '';
  return `<li class="card${fresh ? ' new' : ''}" data-id="${esc(f.id)}" data-ticker="${esc(f.ticker || '')}"${f.live && !compact ? ` data-ts="${Number(f.ts)}"` : ''}>
    <div class="when">${when}</div>
    <div>
      <div class="row1">
        ${compact ? '' : f.ticker ? `<a class="tk" href="#/stock/${esc(f.ticker)}">${esc(f.ticker)}</a>` : '<span class="tk none">티커 없음</span>'}
        <span class="badge form">${esc(f.form)}</span>
        <span class="badge cat">${esc(state.categories[f.cat] || f.cat)}</span>
        ${sig}${f.ai ? '<span class="badge ai">AI 요약</span>' : ''}
        ${(f.tags || []).slice(0, 3).map((t) => `<span class="badge tag">${esc(t)}</span>`).join('')}
      </div>
      ${compact ? '' : `<h3>${esc(f.name)}</h3>`}
      <p class="sum">${esc(f.summary)}</p>
      ${!compact && f.ticker ? '<div class="px" data-px></div>' : ''}
      ${reactionHTML(f)}
      <div class="acts">
        <a class="btn" href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">공시 원문 ↗</a>
        ${!compact && f.ticker ? `<button class="btn" data-watch="${esc(f.ticker)}" aria-pressed="${watched}">${watched ? '★ 관심종목' : '☆ 관심 추가'}</button>` : ''}
      </div>
    </div>
  </li>`;
}

// 화면에 보이는 카드들의 현재가를 한 번에 채운다.
async function fillPrices(root) {
  const cards = [...root.querySelectorAll('.card[data-ticker]:not([data-ticker=""])')].filter((c) => $('[data-px]', c) && !$('[data-px]', c).dataset.done);
  const tickers = [...new Set(cards.map((c) => c.dataset.ticker))].slice(0, 40);
  if (!tickers.length) return;
  let prices;
  try { prices = await api(`/api/prices?tickers=${tickers.join(',')}`); } catch { return; }
  for (const c of cards) {
    const q = prices[c.dataset.ticker];
    const el = $('[data-px]', c);
    if (!q || q.price == null || !el) continue;
    el.dataset.done = '1'; el.dataset.usd = q.price; el.dataset.pct = q.pct ?? '';
    el.innerHTML = `<span class="p">${esc(money(q.price))}</span><span class="c ${pctCls(q.pct)}">${pct(q.pct)}</span><small>전일대비</small>`;
  }
}

// ── 관심종목 · 알림 ──────────────────────────────────
function toggleWatch(t) {
  const i = state.watch.indexOf(t);
  if (i >= 0) state.watch.splice(i, 1); else state.watch.unshift(t);
  ls.set('watch', state.watch);
  toast(i >= 0 ? `${t} 관심종목에서 뺐습니다` : `${t} 관심종목에 담았습니다. 새 공시가 뜨면 알려 드려요`);
  document.querySelectorAll(`[data-watch="${CSS.escape(t)}"]`).forEach((b) => {
    const on = state.watch.includes(t);
    b.setAttribute('aria-pressed', on);
    if (b.textContent.includes('관심')) b.textContent = on ? '★ 관심종목' : '☆ 관심 추가';
  });
}

function toast(html, ms = 4000) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = html;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), ms);
}

function matchAlert(f) {
  if (f.ticker && state.watch.includes(f.ticker)) return '관심종목';
  const hay = `${f.name} ${f.summary} ${f.form}`.toLowerCase();
  const kw = state.keywords.find((k) => hay.includes(k.toLowerCase()));
  return kw ? `키워드 “${kw}”` : null;
}

function pushAlert(f, why) {
  state.inbox.unshift({ id: f.id, ticker: f.ticker, name: f.name, form: f.form, summary: f.summary, url: f.url, ts: f.ts, why });
  state.inbox = state.inbox.slice(0, 100);
  state.unread++;
  ls.set('inbox', state.inbox); ls.set('unread', state.unread);
  renderNav();
  toast(`${f.ticker || f.name} · ${f.form} — ${why} 새 공시`);
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
    const n = new Notification(`${f.ticker || f.name} · ${f.form}`, { body: f.summary, tag: f.id });
    n.onclick = () => { window.focus(); location.hash = f.ticker ? `#/stock/${f.ticker}` : '#/inbox'; };
  }
}

// ── 실시간 스트림 ────────────────────────────────────
let onFiling = null; // 현재 화면이 등록하는 수신기
function connect() {
  const es = new EventSource('/api/stream');
  es.onopen = () => { state.connected = true; paintLive(); };
  es.onerror = () => { state.connected = false; paintLive(); };
  es.addEventListener('filing', (e) => {
    const f = JSON.parse(e.data);
    const why = matchAlert(f);
    if (why) pushAlert(f, why);
    onFiling?.(f);
  });
  es.addEventListener('update', (e) => {
    const f = JSON.parse(e.data);
    const card = document.querySelector(`.card[data-id="${CSS.escape(f.id)}"]`);
    if (!card) return;
    const tmp = document.createElement('ul');
    tmp.innerHTML = cardHTML(f, { compact: !$('h3', card) });
    const px = $('[data-px]', card);
    const next = tmp.firstElementChild;
    if (px && $('[data-px]', next)) $('[data-px]', next).replaceWith(px);
    card.replaceWith(next);
  });
}
function paintLive() {
  const el = $('.live');
  if (el) { el.dataset.on = state.connected ? '1' : '0'; el.textContent = state.connected ? '실시간 연결됨' : '연결 중…'; }
}

// ── 화면: 속보 피드 ──────────────────────────────────
const TABS = [['all', '전체'], ['event', '주요사건'], ['earnings', '실적'], ['offering', '증권발행'], ['ownership', '지분변동'], ['insider', '내부자']];
const feedState = { cat: 'all', mine: false, last: null };

async function viewFeed(view) {
  view.innerHTML = `
    <section class="hero">
      <div class="eyebrow">미국주식 공시 실시간 포착</div>
      <h1>공시가 뜬 순간부터, 주가가 어떻게 움직였는지</h1>
      <p>SEC 공시를 접수 직후 잡아 한국어로 풀어 드리고, 5분·30분·60분 뒤 실제 주가 반응을 붙여 보여 드립니다.</p>
      <ul class="hero-list" id="hero-list"></ul>
    </section>
    <div class="chips" id="chips"></div>
    <div class="tabs" role="tablist">${TABS.map(([k, l]) => `<button class="tab" role="tab" data-cat="${k}" aria-selected="${k === feedState.cat}">${l}</button>`).join('')}</div>
    <div class="filterbar">
      <label class="switch"><input type="checkbox" id="mine" ${feedState.mine ? 'checked' : ''}> 관심종목만</label>
      <span class="live"></span>
    </div>
    <ul class="feed" id="feed"><li class="skel"></li><li class="skel"></li><li class="skel"></li></ul>
    <button class="more" id="more" hidden>더 보기</button>`;
  paintLive();
  paintChips();
  api('/api/today').then((t) => {
    const top = [...t.topUp, ...t.topDown].sort((a, b) => Math.abs(b.move) - Math.abs(a.move)).slice(0, 3);
    $('#hero-list', view)?.insertAdjacentHTML('beforeend', top.map((f) => `<li><a href="#/stock/${esc(f.ticker)}"><span class="t">${esc(f.ticker)}</span><span class="s">${esc(f.summary)}</span><span class="r ${pctCls(f.move)}">${f.mark}분 뒤 ${pct(f.move)}</span></a></li>`).join(''));
  }).catch(() => {});

  const list = $('#feed', view), more = $('#more', view);
  const query = () => {
    const q = new URLSearchParams({ limit: '30' });
    if (feedState.cat !== 'all') q.set('cat', feedState.cat);
    if (feedState.mine) q.set('tickers', state.watch.join(','));
    return q;
  };
  const load = async (append) => {
    const q = query();
    if (append && feedState.last) q.set('after', feedState.last);
    try {
      const { items, hasMore } = await api(`/api/feed?${q}`);
      if (!append) list.innerHTML = '';
      if (!items.length && !append) {
        list.innerHTML = `<li class="empty">${feedState.mine && !state.watch.length ? '관심종목이 아직 없습니다. 카드의 ☆ 버튼이나 검색으로 담아 보세요.' : '아직 표시할 공시가 없습니다. 잠시 뒤 새로 들어옵니다.'}</li>`;
      }
      list.insertAdjacentHTML('beforeend', items.map((f) => cardHTML(f)).join(''));
      if (items.length) feedState.last = items[items.length - 1].id;
      more.hidden = !hasMore;
      fillPrices(list);
    } catch (e) {
      if (!append) list.innerHTML = `<li class="empty">${esc(e.message)}</li>`;
    }
  };
  view.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (tab) {
      feedState.cat = tab.dataset.cat; feedState.last = null;
      view.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', t === tab));
      load(false);
    }
    if (e.target === more) load(true);
  });
  $('#mine', view).addEventListener('change', (e) => { feedState.mine = e.target.checked; feedState.last = null; load(false); });

  onFiling = (f) => {
    if (feedState.cat !== 'all' && f.cat !== feedState.cat) return;
    if (feedState.mine && !state.watch.includes(f.ticker)) return;
    $('.empty', list)?.remove();
    list.insertAdjacentHTML('afterbegin', cardHTML(f, { fresh: true }));
    fillPrices(list);
  };
  feedState.last = null;
  await load(false);
}

async function paintChips() {
  try {
    const m = await api('/api/market');
    state.fx = m.fx?.krw || state.fx;
    state.categories = m.categories || state.categories;
    $('#sess').textContent = m.session.label; $('#sess').dataset.k = m.session.key;
    $('#today').innerHTML = `오늘 <b>${m.today.toLocaleString()}</b>건`;
    const chips = $('#chips');
    if (chips) {
      chips.innerHTML = m.indices.map((i) => `<a class="chip" href="#/stock/${esc(i.ticker)}">${esc(i.label)}<span class="${pctCls(i.pct)}">${pct(i.pct)}</span></a>`).join('')
        + (m.fx?.krw ? `<span class="chip">달러환율<span>₩${Math.round(m.fx.krw).toLocaleString()}</span></span>` : '');
    }
  } catch { /* 다음 주기에 다시 시도 */ }
}

// ── 화면: 랭킹 ───────────────────────────────────────
let rankDir = 'up';
async function viewRanking(view) {
  view.innerHTML = `<h1>급등락 랭킹</h1><p class="lead">미국 상장 종목의 등락률 상·하위입니다. 최근 공시가 있었던 종목은 표시해 드려요. 2분마다 갱신됩니다.</p>
    <div class="tabs" role="tablist"><button class="tab" data-dir="up" aria-selected="${rankDir === 'up'}">급등</button><button class="tab" data-dir="down" aria-selected="${rankDir === 'down'}">급락</button></div>
    <div id="rank"><div class="skel"></div><div class="skel"></div></div>`;
  let data;
  const paint = () => {
    const rows = data[rankDir];
    $('#rank', view).innerHTML = rows.length ? `<table class="rank"><tbody>${rows.map((r, i) => `
      <tr data-go="#/stock/${esc(r.ticker)}">
        <td class="n">${i + 1}</td>
        <td class="nm"><b>${esc(r.ticker)}</b><span>${esc(r.name)}</span>
          <div class="sub">${r.filing ? `<span class="badge cat">${esc(r.filing.form)} · ${r.filing.live ? ago(r.filing.ts) : '오늘 접수'}</span>` : ''}<span>거래량 ${volume(r.volume)}주</span><span class="hide-s">${esc(r.sector)}</span></div></td>
        <td class="num"><b>${esc(money(r.price))}</b><span class="${pctCls(r.pct)}">${pct(r.pct)}</span></td>
      </tr>`).join('')}</tbody></table>` : '<p class="empty">표시할 종목이 없습니다.</p>';
  };
  view.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-dir]');
    if (tab && data) { rankDir = tab.dataset.dir; view.querySelectorAll('[data-dir]').forEach((t) => t.setAttribute('aria-selected', t === tab)); paint(); }
    const tr = e.target.closest('tr[data-go]');
    if (tr) location.hash = tr.dataset.go;
  });
  try { data = await api('/api/ranking'); paint(); }
  catch (e) { $('#rank', view).innerHTML = `<p class="empty">${esc(e.message)}</p>`; }
}

// ── 화면: 오늘 리포트 ────────────────────────────────
async function viewReport(view) {
  view.innerHTML = '<h1>오늘 리포트</h1><div class="skel"></div><div class="skel"></div>';
  let t;
  try { t = await api('/api/today'); } catch (e) { view.innerHTML = `<h1>오늘 리포트</h1><p class="empty">${esc(e.message)}</p>`; return; }
  const max = Math.max(1, ...Object.values(t.byCat));
  const reactList = (rows, none) => rows.length
    ? `<ul class="list">${rows.map((f) => `<li><a href="#/stock/${esc(f.ticker)}"><span class="t">${esc(f.ticker)}</span><span class="s">${esc(f.form)} · ${esc(f.summary)}</span><span class="r ${pctCls(f.move)}">${f.mark}분 뒤 ${pct(f.move)}</span></a></li>`).join('')}</ul>`
    : `<p class="muted">${none}</p>`;
  view.innerHTML = `<h1>오늘 리포트</h1><p class="lead">${esc(t.date)} (미 동부 기준) 접수된 공시를 한눈에 정리했습니다.</p>
    <div class="grid">
      <div class="stat"><small>오늘 접수 공시</small><b>${t.total.toLocaleString()}</b></div>
      <div class="stat"><small>주요사건(8-K·6-K)</small><b>${(t.byCat.event || 0).toLocaleString()}</b></div>
      <div class="stat"><small>실적보고</small><b>${(t.byCat.earnings || 0).toLocaleString()}</b></div>
      <div class="stat"><small>내부자거래</small><b>${(t.byCat.insider || 0).toLocaleString()}</b></div>
    </div>
    <h2>유형별 건수</h2>
    <div class="bars">${Object.entries(t.categories).map(([k, l]) => `<div class="bar"><span>${esc(l)}</span><i style="width:${((t.byCat[k] || 0) / max) * 100}%"></i><span class="v">${(t.byCat[k] || 0).toLocaleString()}</span></div>`).join('')}</div>
    <h2>공시 뒤 가장 많이 오른 종목</h2>${reactList(t.topUp, '아직 집계된 반응이 없습니다. 서버가 실시간으로 포착한 공시부터 5·30·60분 뒤 반응이 쌓입니다.')}
    <h2>공시 뒤 가장 많이 내린 종목</h2>${reactList(t.topDown, '아직 집계된 반응이 없습니다.')}
    <h2>주의가 필요한 공시</h2>${t.flagged.length ? `<ul class="feed">${t.flagged.map((f) => cardHTML(f)).join('')}</ul>` : '<p class="muted">오늘은 상장폐지 경고·계약 해지 같은 주의 항목이 아직 없습니다.</p>'}
    <h2>공시가 몰린 종목</h2>${t.busiest.length ? `<ul class="list">${t.busiest.map((c) => `<li><a href="#/stock/${esc(c.ticker)}"><span class="t">${esc(c.ticker)}</span><span class="s">${esc(c.name)}</span><span class="r">${c.n}건</span></a></li>`).join('')}</ul>` : '<p class="muted">없습니다.</p>'}`;
  fillPrices(view);
}

// ── 화면: 종목 상세 ──────────────────────────────────
function sparkSVG(series, prev) {
  if (!series || series.length < 2) return '';
  const W = 600, H = 140, P = 10;
  const ys = series.map((p) => p[1]).concat(prev ?? []);
  const lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1;
  const x = (i) => P + (i / (series.length - 1)) * (W - 2 * P);
  const y = (v) => H - P - ((v - lo) / span) * (H - 2 * P);
  const d = series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(' ');
  const up = series[series.length - 1][1] >= (prev ?? series[0][1]);
  const col = up ? 'var(--up)' : 'var(--down)';
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="오늘 주가 흐름">
    ${prev != null ? `<line x1="${P}" x2="${W - P}" y1="${y(prev)}" y2="${y(prev)}" stroke="var(--faint)" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>` : ''}
    <path d="${d}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}

async function viewStock(view, ticker) {
  const t = ticker.toUpperCase();
  view.innerHTML = `<h1 class="mono">${esc(t)}</h1><div class="skel"></div><div class="skel"></div>`;
  let s;
  try { s = await api(`/api/stock/${encodeURIComponent(t)}`); } catch (e) { view.innerHTML = `<h1 class="mono">${esc(t)}</h1><p class="empty">${esc(e.message)}</p>`; return; }
  const q = s.quote;
  const watched = state.watch.includes(t);
  view.innerHTML = `
    <div class="stock-head">
      <div><h1><span class="mono">${esc(t)}</span> ${esc(s.name)}</h1><div class="sub">${esc([s.exchange, s.industry].filter(Boolean).join(' · '))}</div></div>
      ${q ? `<div class="px"><span class="p">${esc(money(q.price))}</span><span class="c ${pctCls(q.pct)}">${pct(q.pct)}</span><small>전일대비</small></div>` : ''}
      <button class="btn" data-watch="${esc(t)}" aria-pressed="${watched}" style="margin-left:auto">${watched ? '★ 관심종목' : '☆ 관심 추가'}</button>
    </div>
    ${q ? sparkSVG(q.series, q.prev) : ''}
    ${q ? `<div class="grid">
      <div class="stat"><small>전일 종가</small><b>${esc(money(q.prev))}</b></div>
      <div class="stat"><small>오늘 고가 / 저가</small><b>${esc(money(q.high))} / ${esc(money(q.low))}</b></div>
      <div class="stat"><small>52주 범위</small><b>${esc(money(q.lo52))} ~ ${esc(money(q.hi52))}</b></div>
      <div class="stat"><small>거래량</small><b>${q.volume != null ? volume(q.volume) : '—'}</b></div>
    </div>` : '<p class="notice">이 종목은 시세를 불러오지 못했습니다.</p>'}
    <h2>최근 공시</h2>
    ${s.filings.length ? `<ul class="feed">${s.filings.map((f) => cardHTML({ ...f, live: true, ticker: t, reaction: f.reaction }, { compact: true })).join('')}</ul>` : '<p class="empty">공시 이력을 찾지 못했습니다.</p>'}`;
}

// ── 화면: 관심종목 ───────────────────────────────────
async function viewMy(view) {
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  view.innerHTML = `<h1>관심종목</h1><p class="lead">담아 둔 종목에 새 공시가 뜨면 알림함과 브라우저 알림으로 알려 드립니다. 목록은 이 브라우저에만 저장됩니다.</p>
    ${perm === 'default' ? '<p class="notice">브라우저 알림이 꺼져 있습니다. <button class="btn primary" id="perm">알림 켜기</button></p>' : perm === 'denied' ? '<p class="notice">브라우저 설정에서 알림이 차단되어 있습니다. 알림함에는 계속 쌓입니다.</p>' : ''}
    <div class="inputrow"><input id="add-t" placeholder="티커 추가 (예: NVDA)" maxlength="7" autocapitalize="characters" aria-label="티커 추가"><button class="btn primary" id="add-btn">추가</button></div>
    <ul class="list" id="wl"></ul>
    <h2>키워드 알림</h2><p class="muted" style="margin-top:-4px">회사명·요약에 이 단어가 들어간 공시를 알려 드립니다. (예: 파산, 계약 해지, Nasdaq)</p>
    <div class="inputrow"><input id="add-k" placeholder="키워드 추가" maxlength="30" aria-label="키워드 추가"><button class="btn primary" id="addk-btn">추가</button></div>
    <div class="kw" id="kw"></div>`;
  const paintKw = () => { $('#kw', view).innerHTML = state.keywords.map((k) => `<span class="badge">${esc(k)}<button data-delk="${esc(k)}" aria-label="${esc(k)} 삭제">✕</button></span>`).join('') || '<span class="muted">등록된 키워드가 없습니다.</span>'; };
  const paintWl = async () => {
    const wl = $('#wl', view);
    wl.innerHTML = state.watch.length ? state.watch.map((t) => `<li><div class="li"><a href="#/stock/${esc(t)}" class="t" style="padding:0">${esc(t)}</a><span class="s" data-wp="${esc(t)}"></span><button class="x" data-del="${esc(t)}" aria-label="${esc(t)} 삭제">✕</button></div></li>`).join('') : '<li><div class="li muted">아직 담은 종목이 없습니다.</div></li>';
    if (!state.watch.length) return;
    try {
      const p = await api(`/api/prices?tickers=${state.watch.slice(0, 40).join(',')}`);
      for (const el of wl.querySelectorAll('[data-wp]')) {
        const q = p[el.dataset.wp];
        el.innerHTML = q?.price != null ? `<span class="mono">${esc(money(q.price))}</span> <span class="mono ${pctCls(q.pct)}">${pct(q.pct)}</span>` : '시세 없음';
      }
    } catch { /* 시세 없이 표시 */ }
  };
  const addT = () => { const v = $('#add-t', view).value.trim().toUpperCase(); if (/^[A-Z][A-Z0-9.\-]{0,6}$/.test(v) && !state.watch.includes(v)) { toggleWatch(v); paintWl(); } $('#add-t', view).value = ''; };
  const addK = () => { const v = $('#add-k', view).value.trim(); if (v && !state.keywords.includes(v)) { state.keywords.push(v); ls.set('keywords', state.keywords); paintKw(); } $('#add-k', view).value = ''; };
  view.addEventListener('click', async (e) => {
    if (e.target.id === 'add-btn') addT();
    if (e.target.id === 'addk-btn') addK();
    if (e.target.id === 'perm') { await Notification.requestPermission(); viewMy(view); }
    if (e.target.dataset.del) { toggleWatch(e.target.dataset.del); paintWl(); }
    if (e.target.dataset.delk) { state.keywords = state.keywords.filter((k) => k !== e.target.dataset.delk); ls.set('keywords', state.keywords); paintKw(); }
  });
  view.addEventListener('keydown', (e) => { if (e.key === 'Enter') { if (e.target.id === 'add-t') addT(); if (e.target.id === 'add-k') addK(); } });
  paintKw(); paintWl();
}

// ── 화면: 알림함 ─────────────────────────────────────
function viewInbox(view) {
  state.unread = 0; ls.set('unread', 0); renderNav();
  view.innerHTML = `<h1>알림함</h1><p class="lead">관심종목과 키워드에 걸린 공시가 최근 100건까지 쌓입니다.</p>
    ${state.inbox.length ? `<ul class="list">${state.inbox.map((a) => `<li><a href="${a.ticker ? `#/stock/${esc(a.ticker)}` : esc(a.url)}"><span class="t">${esc(a.ticker || '—')}</span><span class="s">${esc(a.form)} · ${esc(a.summary)}</span><span class="r muted" style="font-weight:500">${ago(a.ts)}</span></a></li>`).join('')}</ul><button class="more" id="clear">알림 모두 지우기</button>` : '<p class="empty">아직 알림이 없습니다. 관심종목이나 키워드를 등록해 보세요.</p>'}`;
  $('#clear', view)?.addEventListener('click', () => { state.inbox = []; ls.set('inbox', []); viewInbox(view); });
}

// ── 내비게이션 · 라우터 ──────────────────────────────
const ICON = {
  feed: '<path d="M3 12h4l3-8 4 16 3-8h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  rank: '<path d="M5 20V10M12 20V4M19 20v-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  report: '<rect x="4" y="3" width="16" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  my: '<path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  inbox: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
};
const NAV = [['#/', '속보', 'feed'], ['#/ranking', '랭킹', 'rank'], ['#/report', '리포트', 'report'], ['#/my', '관심종목', 'my'], ['#/inbox', '알림함', 'inbox']];

function renderNav() {
  const cur = location.hash.replace(/^#\/?/, '').split('/')[0];
  const html = NAV.map(([href, label, icon]) => {
    const key = href.replace(/^#\/?/, '');
    return `<a class="nav-item" href="${href}" ${key === cur ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[icon]}</svg><span>${label}</span>${icon === 'inbox' && state.unread ? `<span class="dot">${state.unread > 99 ? '99+' : state.unread}</span>` : ''}</a>`;
  }).join('');
  $('#nav').innerHTML = html; $('#tabbar').innerHTML = html;
}

function route() {
  onFiling = null;
  const [page, arg] = location.hash.replace(/^#\/?/, '').split('/');
  // 화면마다 리스너가 쌓이지 않게 컨테이너를 새로 만든다
  const old = $('#view');
  const view = old.cloneNode(false);
  old.replaceWith(view);
  renderNav();
  window.scrollTo(0, 0);
  if (page === 'stock' && arg) return viewStock(view, decodeURIComponent(arg));
  if (page === 'ranking') return viewRanking(view);
  if (page === 'report') return viewReport(view);
  if (page === 'my') return viewMy(view);
  if (page === 'inbox') return viewInbox(view);
  return viewFeed(view);
}

// ── 공통 조작: 통화 · 테마 · 검색 · 관심 버튼 ────────
function paintCur() {
  document.querySelectorAll('[data-cur]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.cur === state.cur));
}
function paintTheme() {
  if (state.theme) document.documentElement.dataset.theme = state.theme; else delete document.documentElement.dataset.theme;
  const dark = state.theme ? state.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  $('#theme').innerHTML = dark
    ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M5 5l1.8 1.8M17.2 17.2 19 19M5 19l1.8-1.8M17.2 6.8 19 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
}

document.addEventListener('click', (e) => {
  const cur = e.target.closest('[data-cur]');
  if (cur) { state.cur = cur.dataset.cur; ls.set('cur', state.cur); paintCur(); route(); return; }
  const w = e.target.closest('[data-watch]');
  if (w) toggleWatch(w.dataset.watch);
});
$('#theme').addEventListener('click', () => {
  const dark = state.theme ? state.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  state.theme = dark ? 'light' : 'dark'; ls.set('theme', state.theme); paintTheme();
});

const dlg = $('#search'), sInput = $('#search-input'), sRes = $('#search-results');
let sTimer, sSeq = 0;
$('#search-btn').addEventListener('click', () => { sInput.value = ''; sRes.innerHTML = '<li class="hint">티커나 영문 회사명을 입력하세요.</li>'; dlg.showModal(); });
dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('a')) dlg.close(); });
sInput.addEventListener('input', () => {
  clearTimeout(sTimer);
  const q = sInput.value.trim();
  if (!q) { sRes.innerHTML = '<li class="hint">티커나 영문 회사명을 입력하세요.</li>'; return; }
  sTimer = setTimeout(async () => {
    const seq = ++sSeq;
    try {
      const { items } = await api(`/api/search?q=${encodeURIComponent(q)}`);
      if (seq !== sSeq) return;
      sRes.innerHTML = items.length ? items.map((i) => `<li><a href="#/stock/${esc(i.tickers[0])}"><b>${esc(i.tickers[0])}</b><span>${esc(i.name)}</span></a></li>`).join('') : '<li class="hint">일치하는 상장 종목이 없습니다.</li>';
    } catch { if (seq === sSeq) sRes.innerHTML = '<li class="hint">검색에 실패했습니다. 잠시 뒤 다시 시도해 주세요.</li>'; }
  }, 220);
});
sInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('a', sRes)?.click(); } });

// ── 시작 ─────────────────────────────────────────────
paintCur(); paintTheme();
window.addEventListener('hashchange', route);
await paintChips();
route();
connect();
setInterval(paintChips, 30000);
// '3분 전' 같은 상대 시각을 주기적으로 새로 그린다 (속보 화면의 실시간 포착 카드만)
setInterval(() => document.querySelectorAll('.feed .card').forEach((c) => { const b = $('.when b', c); const ts = Number(c.dataset.ts); if (b && ts) b.textContent = ago(ts); }), 30000);
