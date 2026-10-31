// The reference layout is retained; primary-site APIs own grading and records.
import { displayOptionLabel, explanationView, recordQuestion, pageInfo, PHONE_QUERY, PHONE_PAGE_SIZE, DESKTOP_PAGE_SIZE } from '../shared/presentation.js';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const typeNames = { single: '单选题', multi: '多选题', case: '案例题' };
const letters = 'ABCDE';
const preferencesKey = 'praxis.simple.preferences';
const updates = 'BroadcastChannel' in window ? new BroadcastChannel('praxis-records') : null;
let me = null, questions = [], byId = {}, version = '', busy = false, refreshing = false;
let shared = { stats: {}, records: {}, stars: [], resume: null };
let state = defaults();
let toastTimer, searchTimer, reviewGeneration = 0, peekGeneration = 0, toastGeneration = 0;
let renderedMode = null;
const reviewCache = new Map();
const motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
const phonePage = window.matchMedia?.(PHONE_QUERY);
phonePage?.addEventListener?.('change', () => { if (me && state.mode === 'wrong') renderWrong(); });
const liveMotions = new Map();
let filterMotion = null, filterTarget = null;

function motionTiming(kind) {
  const styles = getComputedStyle(document.documentElement);
  const reading = ['page', 'question', 'feedback'].includes(kind);
  const duration = parseFloat(styles.getPropertyValue(`--motion-${kind}-duration`)) || { content: 360, layout: 440, fade: 280, page: 620, question: 520, feedback: 560 }[kind];
  const curve = kind === 'layout' ? '--motion-layout-ease' : reading ? '--motion-reading-ease' : '--motion-ease';
  const easing = styles.getPropertyValue(curve).trim() || (kind === 'layout' ? 'cubic-bezier(.32,0,.18,1)' : reading ? 'cubic-bezier(.42,0,.35,1)' : 'cubic-bezier(.22,.61,.36,1)');
  return { duration, easing };
}
function playMotion(element, keyframes, kind = 'content', delay = 0) {
  if (!element || motionPreference?.matches || typeof element.animate !== 'function') return null;
  liveMotions.get(element)?.cancel();
  const animation = element.animate(keyframes, { ...motionTiming(kind), delay, fill: delay ? 'backwards' : 'none' });
  liveMotions.set(element, animation);
  const release = () => { if (liveMotions.get(element) === animation) liveMotions.delete(element); };
  animation.finished.then(release, release);
  return animation;
}
function enterMotion(element, direction = 0, kind = 'content', delay = 0) {
  const reading = ['page', 'question', 'feedback'].includes(kind);
  return playMotion(element, [{ opacity: reading ? 0 : .65, transform: direction ? `translateX(${direction * 8}px)` : `translateY(${reading ? 8 : 4}px)` },
    { opacity: 1, transform: 'translate(0,0)' }], kind, delay);
}
function feedbackMotion(region) {
  enterMotion(region.querySelector('.result,.peek-heading') || region.querySelector('#unmaskBtn'), 0, 'feedback');
  enterMotion(region.querySelector('.analysis,.peek-analysis'), 0, 'feedback', 90);
}
function cancelMotionsWithin(region) {
  for (const [element, animation] of liveMotions) {
    if (region.contains(element)) { animation.cancel(); liveMotions.delete(element); }
  }
}
function finishFilterMotion() {
  const animation = filterMotion;
  filterMotion = null;
  animation?.cancel();
  if (liveMotions.get($('filterPanel')) === animation) liveMotions.delete($('filterPanel'));
  if (filterTarget !== null) $('filterPanel').open = filterTarget;
  delete $('filterPanel').dataset.motionOpen;
  filterTarget = null; $('filterPanel').style.overflow = '';
}
function toggleFilterPanel(event) {
  const panel = $('filterPanel');
  if (motionPreference?.matches || typeof panel.animate !== 'function') return;
  event.preventDefault();
  const from = panel.getBoundingClientRect().height;
  const opening = !(filterTarget ?? panel.open);
  finishFilterMotion();
  filterTarget = opening; panel.open = true; panel.dataset.motionOpen = String(opening);
  const to = opening ? panel.getBoundingClientRect().height : panel.querySelector('summary').getBoundingClientRect().height + 2;
  panel.style.overflow = 'hidden';
  const animation = playMotion(panel, [{ height: `${from}px` }, { height: `${to}px` }], 'layout');
  filterMotion = animation;
  animation.finished.then(() => { if (filterMotion === animation) finishFilterMotion(); }, () => {});
}
motionPreference?.addEventListener?.('change', event => {
  if (event.matches) { finishFilterMotion(); for (const animation of liveMotions.values()) animation.finish(); }
});

function defaults() {
  return { mode: 'quiz', series: '真题速攻', subject: 'all', types: ['single', 'multi', 'case'], sets: null,
    module: '', scope: 'all', order: 'seq', search: '', queue: [], idx: 0, reviewQueue: [], rIdx: 0,
    picked: {}, retry: new Set(), peek: null, showGrid: false, reviewMask: false, revealed: new Set(),
    mastered: false, wrongAnchor: 0, session: null, snapshots: {} };
}
function preference(key, fallback) {
  try { return JSON.parse(localStorage.getItem(preferencesKey) || '{}')[key] ?? fallback; } catch { return fallback; }
}
function saveTheme(theme) {
  try { localStorage.setItem(preferencesKey, JSON.stringify({ theme })); } catch { /* Optional preference. */ }
}
function setTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  $('themeBtn').textContent = theme === 'dark' ? '☀ 日间' : '🌙 夜间';
  saveTheme(theme);
}
async function api(path, body) {
  const response = await fetch('/api/v1' + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' }, cache: 'no-store', credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(typeof data.detail === 'string' ? data.detail : '请检查输入后重试');
    error.status = response.status;
    throw error;
  }
  return data;
}
function toast(message) {
  const generation = ++toastGeneration;
  $('toast').textContent = message;
  $('toast').classList.remove('hidden');
  playMotion($('toast'), [{ opacity: 0, transform: 'translate(-50%,6px)' }, { opacity: 1, transform: 'translate(-50%,0)' }]);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    const animation = playMotion($('toast'), [{ opacity: 1 }, { opacity: 0 }], 'fade');
    const hide = () => { if (generation === toastGeneration) $('toast').classList.add('hidden'); };
    if (animation) animation.finished.then(hide, () => {}); else hide();
  }, 2800);
}
function fail(error) {
  if (error.status === 401) { if (me || !$('authForm')) showAuth(); }
  else toast(error.message || '操作失败，请重试');
}
function action(callback) { return (...args) => { if (!busy) Promise.resolve().then(() => callback(...args)).catch(fail); }; }
function announce() { updates?.postMessage('changed'); }
function getQuestion(id) { return state.snapshots[id] || byId[id]; }
function record(id) { return state.retry.has(id) ? null : shared.records[id] || null; }
function done(id) { return (shared.stats[id]?.attempts || 0) > 0; }
function wrong(id) { return !!shared.stats[id]?.pending; }
function starred(id) { return shared.stars.includes(id); }
function label(option, index) { return displayOptionLabel(option, index); }
function answerText(q, ids) { return q.options.filter(o => ids.includes(o.id)).map(o => label(o, q.options.indexOf(o))).join(' '); }
function analysisHtml(q, result) {
  const view = explanationView(q, result);
  const changed = q.options.some((option, index) => option.source_label && option.source_label !== label(option, index));
  const reference = !result.explanation || (view.mapped && !view.hasReferences && !changed) ? '' :
    `<div class="explanation-reference"><p class="reference-status">${view.mapped ? '解析已按当前选项同步' : '解析保留原题字母，请结合选项对照阅读。'}</p><details class="source-reference"><summary>查看原始解析与选项对照</summary><p>${esc(result.explanation)}</p>${[...q.options].sort((a, b) => (a.source_label || a.id).localeCompare(b.source_label || b.id)).map(option => `<div class="source-option"><b>原题 ${esc(option.source_label || (/^[A-E]$/.test(option.id) ? option.id : '未记录'))} → 当前 ${esc(label(option, q.options.indexOf(option)))}</b><span>${esc(option.text)}</span></div>`).join('')}</details></div>`;
  return `${esc(view.text) || '<span class="muted">（原题暂无解析）</span>'}${reference}`;
}
function reviewKey(q) { return `${me?.id}:${state.snapshots[q.id] && state.session ? state.session.id : 'catalog'}:${q.id}`; }
async function loadReview(q) {
  const key = reviewKey(q);
  if (reviewCache.has(key)) return reviewCache.get(key);
  const query = state.snapshots[q.id] && state.session ? '?session_id=' + encodeURIComponent(state.session.id) : '';
  return api(`/simple/questions/${encodeURIComponent(q.id)}/review${query}`);
}
function shuffle(ids) {
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  return ids;
}
function inScope(q, scope = true) {
  if (state.series !== 'all' && q.series !== state.series) return false;
  if (state.subject !== 'all' && q.subject !== state.subject) return false;
  if (!state.types.includes(q.type) || (state.sets && !state.sets.includes(q.set))) return false;
  if (state.module && q.module !== state.module) return false;
  if (state.search.trim() && ![q.stem, q.material, ...q.options.map(o => o.text)].join(' ').includes(state.search.trim())) return false;
  return !scope || state.scope === 'all' || (state.scope === 'undone' && !done(q.id)) ||
    (state.scope === 'wrong' && wrong(q.id)) || (state.scope === 'star' && starred(q.id));
}
function filtered() {
  return questions.filter(q => inScope(q)).sort((a, b) =>
    a.subject.localeCompare(b.subject, 'zh-CN') || a.series.localeCompare(b.series, 'zh-CN') ||
    a.set_order - b.set_order || String(a.no).localeCompare(String(b.no), 'zh-CN', { numeric: true })).map(q => q.id);
}
function rebuild() {
  clearPeek();
  state.queue = filtered();
  if (state.order === 'random') shuffle(state.queue);
  state.reviewQueue = state.queue.slice();
  state.idx = Math.min(state.idx, Math.max(0, state.queue.length - 1));
  state.rIdx = 0;
  state.session = null;
  state.snapshots = {};
}
function changeFilter(callback) {
  if (busy) return;
  callback(); state.idx = 0; state.revealed.clear(); rebuild(); render();
}
function chip(text, value, selected, attribute) {
  return `<button class="chip${selected ? ' on' : ''}" ${attribute}="${esc(value)}" aria-pressed="${selected}">${esc(text)}</button>`;
}
function renderFilters() {
  $('seriesChips').innerHTML = [['真题速攻', '真题速攻'], ['高频错题', '高频错题'], ['all', '全部题集']]
    .map(([id, title]) => chip(title, id, state.series === id, 'data-series')).join('');
  $('seriesChips').querySelectorAll('button').forEach(button => button.onclick = () => changeFilter(() => {
    state.series = button.dataset.series; state.sets = null; state.module = '';
  }));
  const available = questions.filter(q => state.series === 'all' || q.series === state.series);
  $('subjectChips').innerHTML = chip('全部科目', 'all', state.subject === 'all', 'data-subject') + ['基础', '金融']
    .map(subject => chip(`中级${subject}（${available.filter(q => q.subject === subject).length}）`, subject, state.subject === subject, 'data-subject')).join('');
  $('subjectChips').querySelectorAll('button').forEach(button => button.onclick = () => changeFilter(() => {
    state.subject = button.dataset.subject; state.types = ['single', 'multi', 'case']; state.sets = null; state.module = '';
  }));
  const pool = available.filter(q => state.subject === 'all' || q.subject === state.subject);
  $('typeChips').innerHTML = Object.keys(typeNames).map(type => chip(`${typeNames[type]}（${pool.filter(q => q.type === type).length}）`, type, state.types.includes(type), 'data-type')).join('');
  $('typeChips').querySelectorAll('button').forEach(button => button.onclick = () => changeFilter(() => {
    const type = button.dataset.type;
    state.types = state.types.includes(type) ? (state.types.length > 1 ? state.types.filter(t => t !== type) : state.types) : [...state.types, type];
    state.sets = null;
  }));
  const sets = new Map();
  pool.filter(q => state.types.includes(q.type)).sort((a, b) => a.set_order - b.set_order).forEach(q => {
    if (!sets.has(q.set)) sets.set(q.set, (state.subject === 'all' ? q.subject + ' · ' : '') + q.set_label);
  });
  $('setChips').innerHTML = chip('全部', 'all', !state.sets, 'data-set') + [...sets].map(([id, title]) => chip(title, id, !state.sets || state.sets.includes(id), 'data-set')).join('');
  $('setChips').querySelectorAll('button').forEach(button => button.onclick = () => changeFilter(() => {
    const value = button.dataset.set;
    if (value === 'all') state.sets = null;
    else {
      const previous = state.sets || [...sets.keys()];
      state.sets = previous.includes(value) ? (previous.length > 1 ? previous.filter(id => id !== value) : previous) : [...previous, value];
    }
  }));
  const modules = [...new Set(pool.filter(q => state.types.includes(q.type)).map(q => q.module))];
  $('moduleSel').innerHTML = '<option value="">全部模块</option>' + modules.map(module => `<option${module === state.module ? ' selected' : ''}>${esc(module)}</option>`).join('');
  $('scopeSel').value = state.scope; $('orderSel').value = state.order; $('searchBox').value = state.search;
  for (const id of ['moduleSel', 'scopeSel', 'orderSel']) {
    $(id).title = $(id).selectedOptions[0]?.textContent || '';
  }
  renderFilterSummary();
}
function renderFilterSummary() {
  $('filterSummary').textContent = [state.series === 'all' ? '全部题集' : state.series,
    state.subject === 'all' ? '全部科目' : `中级${state.subject}`,
    state.types.length === 3 ? '全部题型' : state.types.map(type => typeNames[type]).join('、'),
    state.sets ? `已选 ${state.sets.length} 卷` : '全部卷别', state.module,
    state.scope === 'all' ? '' : $('scopeSel').title,
    state.search.trim() ? `搜索：${state.search.trim()}` : ''].filter(Boolean).join(' · ');
}
function renderTabs() {
  const pending = Object.values(shared.stats).filter(s => s.pending).length;
  $('tabs').innerHTML = [['quiz', '刷题'], ['review', '背题'], ['wrong', '错题本'], ['stats', '统计']].map(([mode, name]) =>
    `<button role="tab" aria-selected="${state.mode === mode}" class="tab${state.mode === mode ? ' on' : ''}" data-mode="${mode}">${name}${mode === 'wrong' && pending ? ` <b style="color:var(--err)">${pending}</b>` : ''}</button>`).join('');
  $('tabs').querySelectorAll('button').forEach(button => button.onclick = action(() => {
    if (state.mode === button.dataset.mode) return;
    clearPeek();
    state.mode = button.dataset.mode;
    state.reviewQueue = state.queue.length ? state.queue.slice() : filtered();
    state.rIdx = 0; render(); window.scrollTo(0, 0);
  }));
}
function totals(pool = questions) {
  const stats = pool.map(q => shared.stats[q.id]).filter(Boolean);
  const attempts = stats.reduce((total, s) => total + s.attempts, 0);
  const errors = stats.reduce((total, s) => total + s.errors, 0);
  return { done: stats.length, attempts, accuracy: attempts ? Math.round((attempts - errors) / attempts * 100) : 0 };
}
function renderMini() {
  const summary = totals();
  $('miniStat').textContent = `已答 ${summary.done}/${questions.length} · 累计正确率 ${summary.accuracy}%`;
}
function material(q) {
  if (!q.material && !q.images?.length) return '';
  return `<div class="material"><b>案例材料</b><div>${esc(q.material || '请结合原始页面核对材料。')}</div>${(q.images || []).filter(url => url.startsWith('/assets-bank/'))
    .map(url => `<img class="material-image" src="${esc(url)}" alt="案例材料表格" loading="lazy">`).join('')}</div>`;
}
function questionHead(q, result, review = false) {
  return `<div class="qhead"><div class="qmeta"><span class="tag brand">${esc(q.set_label)} · 第 ${esc(q.no)} 题</span><span class="tag warn">${typeNames[q.type]}${q.type === 'case' && q.multiple ? '（多选）' : ''}</span>
    <span class="tag">${esc(q.module)}</span>${result ? `<span class="tag ${result.correct ? 'ok' : 'err'}">${result.correct ? '已答对' : '已答错'}</span>` : ''}</div>
    <div class="qtools"><button class="starbtn${starred(q.id) ? ' on' : ''}" data-star="${esc(q.id)}" aria-pressed="${starred(q.id)}">${starred(q.id) ? '★ 已收藏' : '☆ 收藏'}</button>
    ${result && !review ? '<button class="btn ghost small" id="redoBtn">重做</button>' : ''}</div></div>`;
}
function bindStars(region) {
  region.querySelectorAll('[data-star]').forEach(button => button.onclick = action(() => toggleStar(button.dataset.star)));
}
function renderQuiz(direction = 0, animateQuestion = true) {
  const card = $('qcard'), previousId = card.dataset.questionId, hadResult = card.dataset.answered === 'true';
  const current = getQuestion(state.queue[state.idx]);
  const result = current && record(current.id);
  const q = current && recordQuestion(current, result);
  if (state.peek && (state.peek.id !== q?.id || result)) clearPeek();
  cancelMotionsWithin(card);
  const total = state.queue.length;
  $('progFill').style.width = `${total ? (state.idx + (result ? 1 : 0)) / total * 100 : 0}%`;
  $('progText').textContent = total ? `第 ${state.idx + 1} / ${total} 题` : '无匹配题目';
  $('resumeBtn').classList.toggle('hidden', !shared.resume || !!state.session);
  if (!q) {
    delete card.dataset.questionId; delete card.dataset.answered;
    $('qcard').innerHTML = '<div class="empty">当前筛选条件下没有题目，换一个筛选试试～</div>';
    renderGrid(); return;
  }
  const selected = state.picked[q.id] || [];
  const options = q.options.map((option, index) => {
    const right = result?.answer.includes(option.id), incorrect = result?.selected.includes(option.id) && !right;
    const cls = result ? (right ? ' right' : incorrect ? ' wrong' : ' dim') : selected.includes(option.id) ? ' picked' : '';
    return `<button class="opt${cls}" data-option="${esc(option.id)}" aria-pressed="${result ? result.selected.includes(option.id) : selected.includes(option.id)}"${result || busy ? ' disabled' : ''}><span class="k">${esc(label(option, index))}</span><span>${esc(option.text) || '（原题选项为图片公式，需核对原页）'}</span></button>`;
  }).join('');
  const feedback = result ? `<div class="result ${result.correct ? 'ok' : 'err'}" role="status">${result.correct ? '✓ 回答正确' : '✗ 回答错误'}　你的答案：${esc(answerText(q, result.selected))}　正确答案：${esc(answerText(q, result.answer))}</div>
    <div class="analysis"><h4>解析</h4>${analysisHtml(q, result)}</div>` : '';
  const submitControl = !result && q.multiple ? `<button class="btn primary" id="submitBtn"${!selected.length || busy ? ' disabled' : ''}>${busy ? '正在保存…' : `提交答案（已选 ${selected.length} 项）`}</button>` :
    '';
  const revealControl = !result ? `<button class="btn ghost" id="revealBtn" aria-controls="answerPreview" aria-expanded="false"${busy ? ' disabled' : ''}>看答案</button>` : '';
  $('qcard').setAttribute('aria-busy', String(busy));
  $('qcard').innerHTML = questionHead(q, result) + material(q) + `<div class="stem">${esc(q.stem)}</div><div class="opts">${options}</div>${feedback}
    <div class="collapse-shell" id="answerPreview" role="region" aria-label="本题答案与解析" aria-hidden="true"><div class="collapse-inner"><div class="peek-card" id="peekContent"></div></div></div>
    <div class="actions"><button class="btn" id="prevBtn"${busy ? ' disabled' : ''}>← 上一题</button><button class="btn primary" id="nextBtn"${busy ? ' disabled' : ''}>${state.idx === total - 1 ? '完成 ✓' : '下一题 →'}</button>${submitControl}${revealControl}
    <span class="small muted shortcut-hint">快捷键：<span class="kbd">A</span>-<span class="kbd">E</span> 选择 · <span class="kbd">Enter</span> 提交/下一题 · <span class="kbd">←</span><span class="kbd">→</span> 翻页 · <span class="kbd">S</span> 收藏</span></div>`;
  $('qcard').querySelectorAll('[data-option]').forEach(button => button.onclick = action(() => pick(q, button.dataset.option)));
  $('prevBtn').onclick = action(() => go(-1)); $('nextBtn').onclick = action(() => go(1));
  if ($('submitBtn')) $('submitBtn').onclick = action(() => submit(q));
  if ($('revealBtn')) $('revealBtn').onclick = action(() => togglePeek(q));
  if ($('redoBtn')) $('redoBtn').onclick = action(() => retry(q.id));
  bindStars(card); renderGrid(); renderPeek();
  card.dataset.questionId = q.id; card.dataset.answered = String(!!result);
  if (previousId !== q.id) { if (animateQuestion) enterMotion(card, direction, 'question'); }
  else if (result && !hadResult && animateQuestion) feedbackMotion(card);
}
function clearPeek() { peekGeneration++; state.peek = null; }
function renderPeek() {
  const shell = $('answerPreview'), button = $('revealBtn');
  if (!shell) return;
  const peek = state.mode === 'quiz' && state.peek?.id === state.queue[state.idx] ? state.peek : null;
  shell.classList.toggle('open', !!peek); shell.inert = !peek;
  shell.setAttribute('aria-hidden', String(!peek)); shell.setAttribute('aria-busy', String(!!peek?.loading));
  if (button) { button.textContent = peek ? '收起答案' : '看答案'; button.setAttribute('aria-expanded', String(!!peek)); }
  if (!peek) return;
  const q = getQuestion(peek.id);
  $('peekContent').innerHTML = peek.loading ? '<div class="muted small" role="status">正在加载本题答案与解析…</div>' :
    `<div class="peek-heading"><strong>本题答案：${esc(answerText(q, peek.data.answer))}</strong><span class="small muted">临时查看 · 不计入作答</span></div><div class="peek-analysis"><h4>解析</h4>${analysisHtml(q, peek.data)}</div>`;
}
async function togglePeek(q) {
  if (busy || record(q.id)) return;
  if (state.peek?.id === q.id) { clearPeek(); renderPeek(); return; }
  const generation = ++peekGeneration, accountId = me?.id;
  state.peek = { id: q.id, loading: true, data: null }; renderPeek();
  try {
    const key = reviewKey(q);
    const data = await loadReview(q);
    if (generation !== peekGeneration || accountId !== me?.id || state.mode !== 'quiz' || state.queue[state.idx] !== q.id) return;
    reviewCache.set(key, data);
    state.peek = { id: q.id, loading: false, data }; renderPeek(); feedbackMotion($('peekContent'));
  } catch (error) {
    if (generation !== peekGeneration || accountId !== me?.id) return;
    clearPeek(); renderPeek(); throw error;
  }
}
function renderGrid() {
  const box = $('gridBox'), content = $('gridContent');
  $('gridBtn').textContent = state.showGrid ? '题号 ▴' : '题号 ▾';
  $('gridBtn').setAttribute('aria-expanded', String(state.showGrid));
  box.classList.toggle('open', state.showGrid); box.inert = !state.showGrid; box.setAttribute('aria-hidden', String(!state.showGrid));
  if (!state.showGrid) return;
  const scrollTop = content.querySelector('.qgrid')?.scrollTop || 0;
  content.innerHTML = `<div class="qgrid">${state.queue.map((id, index) => {
    const q = getQuestion(id), r = shared.records[id];
    return `<button class="${r ? (r.correct ? 'ok' : 'err') : ''}${index === state.idx ? ' cur' : ''}${starred(id) ? ' star' : ''}" data-grid="${index}" title="${esc(q.subject + ' · ' + q.set_label + ' · ' + q.no)}" aria-label="跳到第 ${index + 1} 题">${esc(q.no || index + 1)}</button>`;
  }).join('')}</div>`;
  content.querySelector('.qgrid').scrollTop = scrollTop;
  $('gridBox').querySelectorAll('button').forEach(button => button.onclick = action(() => {
    const index = Number(button.dataset.grid), direction = Math.sign(index - state.idx);
    clearPeek(); state.idx = index; renderQuiz(direction);
  }));
}
async function pick(q, option) {
  if (record(q.id) || busy) return;
  const selected = state.picked[q.id] || [];
  state.picked[q.id] = q.multiple ? (selected.includes(option) ? selected.filter(id => id !== option) : [...selected, option]) : [option];
  if (!q.multiple) await submit(q);
  else {
    renderQuiz();
    const picked = [...$('qcard').querySelectorAll('[data-option]')].find(button => button.dataset.option === option);
    enterMotion(picked?.querySelector('.k'));
  }
}
async function ensureSession(q) {
  if (state.retry.has(q.id)) {
    const fresh = await api('/simple/sessions', { ids: [q.id], version, retry: true });
    return { id: fresh.id, index: 0 };
  }
  if (!state.session) {
    const ids = state.queue.slice();
    const fresh = await api('/simple/sessions', { ids, version });
    state.session = { id: fresh.id, ids };
  }
  const index = state.session.ids.indexOf(q.id);
  if (index < 0) throw new Error('题目范围已变化，请刷新后继续');
  return { id: state.session.id, index };
}
async function submit(q) {
  const selected = state.picked[q.id] || [];
  if (!selected.length || busy || record(q.id)) return;
  clearPeek(); busy = true; renderQuiz();
  try {
    const session = await ensureSession(q);
    await api(`/simple/sessions/${encodeURIComponent(session.id)}/answers`, { index: session.index, options: selected });
    state.retry.delete(q.id); delete state.picked[q.id];
    await refreshShared(false); announce();
  } finally { busy = false; renderQuiz(); renderTabs(); renderMini(); }
}
function go(delta) {
  const index = state.idx + delta;
  if (index < 0) return toast('已经是第一题了');
  if (index >= state.queue.length) return toast('本轮题目已浏览完成 🎉');
  clearPeek(); state.idx = index; renderQuiz(delta);
}
function retry(id) {
  clearPeek();
  const fromQuiz = state.mode === 'quiz';
  state.retry.add(id); delete state.picked[id]; state.mode = 'quiz';
  if (!state.queue.includes(id)) { state.queue = [id]; state.session = null; }
  state.idx = state.queue.indexOf(id); render();
  if (!fromQuiz) window.scrollTo(0, 0);
}
async function toggleStar(id) {
  const result = await api('/bookmarks/' + encodeURIComponent(id), { starred: !starred(id) });
  shared.stars = result.starred ? [...new Set([...shared.stars, id])] : shared.stars.filter(qid => qid !== id);
  announce(); render();
}
async function renderReview(direction = 0) {
  const generation = ++reviewGeneration;
  const card = $('revCard');
  const previousId = card.dataset.questionId;
  const previousMask = card.dataset.masked;
  cancelMotionsWithin(card);
  const ids = state.reviewQueue;
  state.rIdx = Math.max(0, Math.min(state.rIdx, ids.length - 1));
  let q = getQuestion(ids[state.rIdx]);
  $('maskBtn').textContent = state.reviewMask ? '显示答案' : '遮盖答案';
  $('revProgText').textContent = q ? `第 ${state.rIdx + 1} / ${ids.length} 题` : '无匹配题目';
  $('revProgFill').style.width = `${q ? (state.rIdx + 1) / ids.length * 100 : 0}%`;
  if (!q) { delete card.dataset.questionId; delete card.dataset.masked; card.style.minHeight = ''; card.removeAttribute('aria-busy'); card.innerHTML = '<div class="empty">没有匹配的题目</div>'; return; }
  const masked = state.reviewMask && !state.revealed.has(q.id);
  let result = null;
  if (!masked) {
    // Keep the document tall while loading so mobile scroll isn't clamped upward.
    card.style.minHeight = `${card.getBoundingClientRect().height}px`;
    card.setAttribute('aria-busy', 'true');
    card.innerHTML = '<div class="empty">正在加载答案与解析…</div>';
    try {
      const key = reviewKey(q);
      result = await loadReview(q);
      if (generation !== reviewGeneration || state.mode !== 'review') return;
      reviewCache.set(key, result);
      q = recordQuestion(q, result);
    } catch (error) { if (generation === reviewGeneration) fail(error); return; }
    finally {
      if (generation === reviewGeneration) { card.style.minHeight = ''; card.removeAttribute('aria-busy'); }
    }
  }
  card.style.minHeight = ''; card.removeAttribute('aria-busy');
  const options = q.options.map((option, index) => `<div class="opt${result?.answer.includes(option.id) ? ' right' : ''}" style="cursor:default"><span class="k">${esc(label(option, index))}</span><span>${esc(option.text)}</span></div>`).join('');
  const answer = masked ? '<button class="btn" id="unmaskBtn" style="margin-top:12px">先想一想，点击查看答案/解析 👁</button>' :
    `<div class="result ok">✔ 正确答案：${esc(answerText(q, result.answer))}</div><div class="analysis"><h4>解析</h4>${analysisHtml(q, result)}</div>`;
  $('revCard').innerHTML = questionHead(q, null, true) + material(q) + `<div class="stem">${esc(q.stem)}</div><div class="opts">${options}</div>${answer}
    <div class="actions"><button class="btn" id="rprevBtn">← 上一题</button><button class="btn primary" id="rnextBtn">下一题 →</button><span class="small muted shortcut-hint">← → 翻页 · 查看答案不计入作答统计</span></div>`;
  $('rprevBtn').onclick = action(() => reviewGo(-1)); $('rnextBtn').onclick = action(() => reviewGo(1));
  if ($('unmaskBtn')) $('unmaskBtn').onclick = action(() => { state.revealed.add(q.id); return renderReview(); });
  bindStars($('revCard'));
  card.dataset.questionId = q.id;
  card.dataset.masked = String(masked);
  if (previousId !== q.id) enterMotion(card, direction, 'question');
  else if (previousMask !== String(masked)) feedbackMotion(card);
}
function reviewGo(delta) {
  const index = state.rIdx + delta;
  if (index < 0 || index >= state.reviewQueue.length) return toast(index < 0 ? '已经是第一题了' : '已是最后一题 🎉');
  state.rIdx = index; state.revealed.clear(); return renderReview(delta);
}
function wrongPage(anchor) {
  state.wrongAnchor = anchor;
  renderWrong();
  const list = $('wrongList');
  list.focus({ preventScroll: true });
  if (list.getBoundingClientRect().top < 80 || list.getBoundingClientRect().top > window.innerHeight / 2) list.scrollIntoView({ block: 'start', behavior: 'instant' });
  enterMotion(list, 0, 'page');
}
function renderWrongPager(info, id, position) {
  $(id).innerHTML = !info.total || (position === '下方' && info.pages === 1) ? '' : `<nav class="pagination" aria-label="错题本${position}分页"><span class="pagination-range" aria-live="polite">${info.start + 1}–${info.end} / ${info.total} 题 · 每页 ${info.size} 题</span><div class="pagination-controls"><button class="btn small" data-page="${info.start - info.size}"${info.page === 0 ? ' disabled' : ''}>上一页</button><label>第 <select aria-label="错题本${position}页码">${Array.from({ length: info.pages }, (_, page) => `<option value="${page * info.size}"${page === info.page ? ' selected' : ''}>${page + 1}</option>`).join('')}</select> / ${info.pages} 页</label><button class="btn small" data-page="${info.start + info.size}"${info.page === info.pages - 1 ? ' disabled' : ''}>下一页</button></div></nav>`;
  $(id).querySelectorAll('[data-page]').forEach(button => button.onclick = action(() => wrongPage(Number(button.dataset.page))));
  const select = $(id).querySelector('select');
  if (select) select.onchange = event => wrongPage(Number(event.target.value));
}
function renderWrong() {
  const rows = questions.filter(q => (shared.stats[q.id]?.errors || 0) > 0 && (state.mastered ? !wrong(q.id) : wrong(q.id))).sort((a, b) => shared.stats[b.id].last - shared.stats[a.id].last || a.id.localeCompare(b.id));
  const info = pageInfo(rows.length, state.wrongAnchor, phonePage?.matches ? PHONE_PAGE_SIZE : DESKTOP_PAGE_SIZE);
  if (state.wrongAnchor >= rows.length) state.wrongAnchor = info.start;
  $('wrongClearBtn').textContent = state.mastered ? '查看待巩固' : '查看已巩固';
  $('wrongRedoBtn').disabled = state.mastered || !rows.length;
  $('wrongCount').textContent = `共 ${rows.length} 题 · ${state.mastered ? '已巩固' : '连续答对两次后巩固'}`;
  renderWrongPager(info, 'wrongPagesTop', '上方'); renderWrongPager(info, 'wrongPagesBottom', '下方');
  $('wrongList').innerHTML = rows.length ? rows.slice(info.start, info.end).map((current, index) => {
    const r = shared.records[current.id], stat = shared.stats[current.id], q = recordQuestion(current, r);
    const options = q.options.map((option, index) => `<div class="opt${r?.answer.includes(option.id) ? ' right' : ''}"><span class="k">${esc(label(option, index))}</span><span>${esc(option.text)}</span></div>`).join('');
    return `<div class="qitem"><div class="qi-head"><span class="tag brand">${esc(q.subject + ' · ' + q.set_label + ' · ' + q.no)}</span><span class="tag">${esc(q.module)}</span><span class="tag ${stat.pending ? 'err' : 'ok'}">连续答对 ${Math.min(stat.streak, 2)} / 2</span><span class="spacer"></span><button class="btn small" data-redo="${esc(q.id)}">重新练习</button></div>
      <span class="small muted">第 ${info.start + index + 1} 题</span>${material(q)}<div class="stem" style="font-size:15.5px">${esc(q.stem)}</div><div class="opts review-options">${options}</div>${r ? `<div class="ansline"><b>正确答案：${esc(answerText(q, r.answer))}</b>　最近选择：${esc(answerText(q, r.selected))}</div><div class="rev-analysis">${analysisHtml(q, r)}</div>` : '<p class="muted">暂无可用的作答快照，请重新练习查看解析。</p>'}</div>`;
  }).join('') : `<div class="empty">${state.mastered ? '还没有已巩固的错题，再练一次也是进步。' : '当前没有待巩固错题，继续保持 💪'}</div>`;
  $('wrongList').querySelectorAll('[data-redo]').forEach(button => button.onclick = action(() => retry(button.dataset.redo)));
}
function renderStats() {
  const summary = totals();
  const pending = Object.values(shared.stats).filter(stat => stat.pending).length;
  $('statCards').innerHTML = [['已答题数', `${summary.done} / ${questions.length}`], ['累计正确率', `${summary.accuracy}%`], ['待巩固错题', pending], ['收藏数', shared.stars.length]]
    .map(([title, value]) => `<div class="stat"><div class="v">${esc(value)}</div><div class="l">${title}</div></div>`).join('');
  for (const [subject, target] of [['基础', 'statBase'], ['金融', 'statFin']]) {
    const pool = questions.filter(q => q.subject === subject);
    $(target).innerHTML = [...new Set(pool.map(q => q.module))].map(module => {
      const group = pool.filter(q => q.module === module), stats = totals(group);
      return `<div class="bar"><div class="bl"><span>${esc(module)}</span><span class="muted">已答 ${stats.done}/${group.length} · 正确率 ${stats.attempts ? stats.accuracy + '%' : '—'}</span></div><div class="bt"><i class="${stats.accuracy >= 80 ? 'g' : stats.accuracy < 60 ? 'r' : ''}" style="width:${stats.done / group.length * 100}%"></i></div></div>`;
    }).join('');
  }
}
function render() {
  if (!me) return;
  const changedMode = renderedMode !== state.mode;
  renderedMode = state.mode;
  renderTabs(); renderFilters(); renderMini();
  for (const [mode, id] of [['quiz', 'quizWrap'], ['review', 'reviewWrap'], ['wrong', 'wrongWrap'], ['stats', 'statsWrap']]) $(id).classList.toggle('hidden', state.mode !== mode);
  if (state.mode === 'quiz') renderQuiz(0, !changedMode);
  else if (state.mode === 'review') renderReview();
  else if (state.mode === 'wrong') renderWrong();
  else renderStats();
  if (changedMode) {
    const id = { quiz: 'quizWrap', review: 'reviewWrap', wrong: 'wrongWrap', stats: 'statsWrap' }[state.mode];
    const region = state.mode === 'review' ? $(id).querySelector('.section-toolbar') : $(id);
    enterMotion(region, 0, 'page');
  }
}
async function refreshShared(rerender = true) {
  const next = await api('/simple/state');
  if (next.user_id && next.user_id !== me?.id) return boot();
  shared = next;
  if (rerender) render();
}
async function resumeSession(id) {
  clearPeek();
  const result = await api('/simple/sessions/' + encodeURIComponent(id));
  state.snapshots = Object.fromEntries(result.questions.map(q => [q.id, q]));
  state.queue = result.questions.map(q => q.id);
  state.session = { id, ids: state.queue.slice() };
  state.idx = Math.min(result.index, result.total - 1); state.mode = 'quiz';
  render(); window.scrollTo(0, 0);
}
function clearAccountView() {
  clearPeek(); finishFilterMotion(); cancelMotionsWithin(document.body); renderedMode = null;
  clearTimeout(toastTimer); toastGeneration++; $('toast').classList.add('hidden');
  me = null; shared = { stats: {}, records: {}, stars: [], resume: null };
  questions = []; byId = {}; state = defaults(); reviewCache.clear(); reviewGeneration++;
  $('filterPanel').open = false; $('filterSummary').textContent = '';
  $('revCard').style.minHeight = ''; $('revCard').removeAttribute('aria-busy');
  for (const id of ['qcard', 'revCard', 'wrongList', 'wrongPagesTop', 'wrongPagesBottom', 'wrongCount', 'statCards', 'statBase', 'statFin', 'miniStat', 'accountName', 'gridContent', 'catalogFooter']) $(id).replaceChildren();
  for (const id of ['qcard', 'revCard']) { delete $(id).dataset.questionId; delete $(id).dataset.answered; delete $(id).dataset.masked; }
  $('gridBox').classList.remove('open'); $('gridBox').inert = true; $('gridBox').setAttribute('aria-hidden', 'true');
}
function showAuth(register = false) {
  clearAccountView();
  $('appWrap').classList.add('hidden'); $('authWrap').classList.remove('hidden'); $('tabs').innerHTML = '';
  $('authWrap').innerHTML = `<form class="card auth-card" id="authForm"><h1>${register ? '注册主站账号' : '登录你的练习账号'}</h1><p class="muted">与 Praxis 主站共享账号、进度与错题。</p><div class="tabs"><button type="button" class="tab${!register ? ' on' : ''}" id="loginTab">登录</button><button type="button" class="tab${register ? ' on' : ''}" id="registerTab">注册</button></div>
    <label>用户名<input name="name" type="text" autocomplete="username" required minlength="2" maxlength="40"></label><label>密码<input name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" required minlength="8" maxlength="128"></label><div class="auth-error small" role="alert" id="authError"></div><button class="btn primary" type="submit">${register ? '创建账号' : '登录'}</button><p class="small muted"><a href="/">打开主站 ↗</a></p></form>`;
  $('loginTab').onclick = () => showAuth(false); $('registerTab').onclick = () => showAuth(true);
  $('authForm').onsubmit = async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget), button = event.currentTarget.querySelector('button[type=submit]');
    button.disabled = true; $('authError').textContent = '';
    try { await api('/auth/' + (register ? 'register' : 'login'), { name: form.get('name'), password: form.get('password') }); announce(); await boot(); }
    catch (error) { $('authError').textContent = error.message; }
    finally { button.disabled = false; }
  };
}
async function boot() {
  clearAccountView();
  $('appWrap').classList.add('hidden'); $('authWrap').classList.remove('hidden');
  $('authWrap').innerHTML = '<div class="card auth-card"><p class="muted">正在同步主站练习记录…</p></div>';
  try {
    me = await api('/me');
    const [catalog, records] = await Promise.all([api('/simple/catalog'), api('/simple/state')]);
    if (records.user_id && records.user_id !== me.id) return boot();
    questions = catalog.questions; version = catalog.version; shared = records;
    byId = Object.fromEntries(questions.map(q => [q.id, q]));
    state = defaults(); rebuild();
    const next = state.queue.findIndex(id => !done(id)); state.idx = Math.max(0, next);
    $('accountName').textContent = me.name;
    $('authWrap').classList.add('hidden'); $('appWrap').classList.remove('hidden');
    $('catalogFooter').textContent = `共 ${questions.length} 题 · 题库、判分与练习记录以主站为准 · 模块标签仅供参考`;
    render();
    const session = new URLSearchParams(location.search).get('session');
    if (session) await resumeSession(session);
  } catch (error) {
    if (error.status === 401) showAuth();
    else {
      $('authWrap').classList.remove('hidden');
      $('authWrap').innerHTML = `<div class="card auth-card"><p role="alert">${esc(error.message)}</p><button class="btn primary" id="reloadBtn">重新加载</button><p><a href="/">返回主站</a></p></div>`;
      $('reloadBtn').onclick = boot;
    }
  }
}

$('scopeSel').innerHTML = '<option value="all">全部题目</option><option value="undone">未作答</option><option value="wrong">待巩固错题</option><option value="star">收藏的题</option>';
$('orderSel').innerHTML = '<option value="seq">顺序出题</option><option value="random">随机打乱</option>';
$('moduleSel').onchange = event => changeFilter(() => { state.module = event.target.value; });
$('scopeSel').onchange = event => changeFilter(() => { state.scope = event.target.value; });
$('orderSel').onchange = event => changeFilter(() => { state.order = event.target.value; });
$('searchBox').oninput = event => {
  state.search = event.target.value; renderFilterSummary(); clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { if (!busy) { state.idx = 0; rebuild(); if (state.mode === 'review') renderReview(); else renderQuiz(); } }, 160);
};
$('gridBtn').onclick = action(() => { state.showGrid = !state.showGrid; renderGrid(); });
$('reshuffleBtn').onclick = action(() => { state.order = 'random'; state.idx = 0; rebuild(); render(); toast('已重新随机抽题'); });
$('maskBtn').onclick = action(() => { state.reviewMask = !state.reviewMask; state.revealed.clear(); return renderReview(); });
$('wrongClearBtn').onclick = action(() => { state.mastered = !state.mastered; state.wrongAnchor = 0; renderWrong(); });
$('wrongRedoBtn').onclick = action(() => {
  state.series = 'all'; state.subject = 'all'; state.types = ['single', 'multi', 'case']; state.sets = null; state.module = ''; state.search = ''; state.scope = 'wrong'; state.mode = 'quiz'; state.idx = 0;
  rebuild();
  for (const id of state.queue) state.retry.add(id);
  render(); window.scrollTo(0, 0);
});
$('resetBtn').onclick = action(() => { state = defaults(); rebuild(); render(); toast('筛选已重置，主站记录保留'); });
$('themeBtn').onclick = () => setTheme(document.body.classList.contains('dark') ? 'light' : 'dark');
$('resumeBtn').onclick = action(() => shared.resume && resumeSession(shared.resume.id));
$('logoutBtn').onclick = action(async () => { await api('/logout', {}); announce(); showAuth(); });
$('exportBtn').onclick = action(async () => {
  await refreshShared(false);
  const records = Object.fromEntries([...new Set([...Object.keys(shared.stats), ...shared.stars])].map(id => [id, {
    selected: shared.records[id]?.selected || [], c: (shared.records[id]?.selected || []).join(''),
    ok: shared.records[id]?.correct ?? null, star: starred(id), n: shared.stats[id]?.attempts || 0, t: (shared.stats[id]?.last || 0) * 1000,
  }]));
  const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 2, records, stars: shared.stars }, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = '刷题记录.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('importBtn').onclick = action(() => $('importFile').click());
$('importFile').onchange = async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('记录文件不能超过 5 MB');
    const data = JSON.parse(await file.text());
    const records = data.records || data.rec || data;
    if (!records || typeof records !== 'object' || Array.isArray(records)) throw new Error('文件格式不正确');
    const result = await api('/simple/import', { records, stars: data.stars || [] });
    await refreshShared(); announce(); toast(`已补充 ${result.imported} 道题、${result.stars} 个收藏；保留或跳过 ${result.skipped} 条已有/未匹配记录`);
  } catch (error) { fail(error); }
  event.target.value = '';
};
document.addEventListener('keydown', event => {
  if (!me || busy || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || /INPUT|SELECT|TEXTAREA/.test(event.target?.tagName || '')) return;
  if (event.key === 'Enter' && event.target?.closest?.('button,a,summary')) return;
  if (state.mode === 'review') {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); reviewGo(event.key === 'ArrowLeft' ? -1 : 1); }
    return;
  }
  if (state.mode !== 'quiz') return;
  const q = getQuestion(state.queue[state.idx]); if (!q) return;
  const upper = event.key.toUpperCase();
  let index = letters.indexOf(upper);
  if (/^[1-5]$/.test(event.key)) index = Number(event.key) - 1;
  if (index >= 0 && index < q.options.length) { event.preventDefault(); action(() => pick(q, q.options[index].id))(); }
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); go(event.key === 'ArrowLeft' ? -1 : 1); }
  else if (event.key === 'Enter') { event.preventDefault(); action(() => !record(q.id) && q.multiple ? submit(q) : go(1))(); }
  else if (upper === 'S') action(() => toggleStar(q.id))();
  else if (upper === 'R' && record(q.id)) retry(q.id);
});
async function synchronize() {
  if (document.hidden || busy || refreshing) return;
  refreshing = true;
  try {
    const account = await api('/me');
    if (!me || account.id !== me.id) await boot();
    else await refreshShared();
  } catch (error) { fail(error); }
  finally { refreshing = false; }
}
window.addEventListener('focus', synchronize);
document.addEventListener('visibilitychange', () => { if (!document.hidden) synchronize(); });
if (updates) updates.onmessage = synchronize;
$('filterPanel').querySelector('summary').addEventListener('click', toggleFilterPanel);
setTheme(preference('theme', 'light'));
boot();
