import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from 'motion/react';
import { PixelBurst } from './components/PixelBurst';
import { FeedbackPaper, PageHeading, PaperArt, TearEdge } from './components/Paper';
import { displayOptionLabel, explanationView, pageInfo, PHONE_QUERY, PHONE_PAGE_SIZE, DESKTOP_PAGE_SIZE, type Explanation, type PageInfo } from '../shared/presentation.js';
import './style.css';

type Option = { id: string; text: string; label?: string; source_label?: string };
type Question = { id: string; stem: string; options: Option[]; multiple: boolean; bank: string; option_order_locked?: boolean; material?: string; images?: string[] };
type Result = Explanation & { correct: boolean; answer: string[]; selected: string[]; question: Question };
type Session = { id: string; index: number; total: number; question: Question | null; result: Result | null; results: Result[]; elapsed: number; mode: string };
type User = { id: string; name: string; role: string };
type Bank = { name: string; count: number; done: number };
type RecordItem = { id: string; mode: string; bank: string | null; subject: string; index: number; total: number; correct: number; created: number };
type QuestionStat = { attempts: number; errors: number; streak: number; pending: boolean; last: number };
type Fail = (error: unknown) => void;
const names: Record<string, string> = { special: '专项练习', mixed: '随机混合', mistakes: '错题巩固' };
const ease = [0.22, 1, 0.36, 1] as const;
function answerLabels(question: Question, ids: string[]) {
  return question.options.filter(option => ids.includes(option.id)).map(option => displayOptionLabel(option, question.options.indexOf(option)));
}
function OriginalReference({ question, result }: { question: Question; result: Explanation }) {
  const changed = question.options.some((option, index) => option.source_label && option.source_label !== displayOptionLabel(option, index));
  const view = explanationView(question, result);
  if (!result.explanation || (view.mapped && !view.hasReferences && !changed)) return null;
  return <div className="explanation-reference"><p className="reference-status">{view.mapped ? '解析已按当前选项同步' : '解析保留原题字母，请结合下方选项对照阅读。'}</p>
    <details className="source-reference"><summary>查看原始解析与选项对照 <span aria-hidden="true">↗</span></summary>
    <p>{result.explanation}</p>
    {[...question.options].sort((a, b) => (a.source_label || a.id).localeCompare(b.source_label || b.id)).map(option =>
      <div className="source-option" key={option.id}><span className="mono">原题 {option.source_label || (/^[A-E]$/.test(option.id) ? option.id : '未记录')} → 当前 {displayOptionLabel(option, question.options.indexOf(option))}</span><span>{option.text}</span></div>)}
  </details></div>;
}
const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
const recordUpdates = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('praxis-records');

async function api<T = unknown>(path: string, body?: unknown): Promise<T> {
  const response = await fetch('/api/v1' + path, {
    method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (path === '/me' && (response.status === 401 || (response.ok && client.getQueryData<User>(['me'])?.id && client.getQueryData<User>(['me'])?.id !== data.id))) {
    client.removeQueries({ predicate: query => query.queryKey[0] !== 'me' });
  }
  if (!response.ok) throw Error(typeof data.detail === 'string' ? data.detail : '请检查输入后重试');
  if (body !== undefined) recordUpdates?.postMessage('changed');
  return data;
}

function App() {
  const nav = useNavigate(), location = useLocation(), qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/me') });
  const [message, setMessage] = useState('');
  const practicing = location.pathname.startsWith('/practice/');
  useEffect(() => { window.scrollTo(0, 0); setMessage(''); }, [location.pathname]);
  useEffect(() => {
    const refresh = () => { if (!document.hidden) qc.invalidateQueries(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    recordUpdates?.addEventListener('message', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); recordUpdates?.removeEventListener('message', refresh); };
  }, [qc]);
  function fail(error: unknown) { setMessage(error instanceof Error ? error.message : '操作失败，请重试'); }
  if (me.isPending) return <div className="loading"><span className="loading-squares" aria-hidden="true">▪ ▪ ▪</span>正在准备你的练习空间…</div>;
  return <MotionConfig reducedMotion="user"><main data-page={practicing ? 'practice' : 'browse'}>
    <header className="site-header">
      <a className="brand" href="/" onClick={event => { event.preventDefault(); nav('/'); }}><span className="brand-mark" aria-hidden="true">p</span><span>praxis<span className="brand-caption">练习，让进步发生</span></span></a>
      <nav aria-label="主导航">{[['/', '练习'], ['/mistakes', '错题本'], ['/history', '记录']].map(([path, title], i) => {
        const active = path === '/' ? location.pathname === '/' || practicing : location.pathname === path;
        return <button key={path} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} onClick={() => nav(path)}>
          {active && <motion.span className="nav-indicator" layoutId="nav-indicator" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
          <span className="nav-label"><span className="nav-index">0{i + 1}</span>{title}</span>
        </button>;
      })}</nav>
      {me.data && <button className="profile" onClick={() => nav('/account')}><span className="avatar-dot" aria-hidden="true">◉</span><span>{me.data.name}</span><span aria-hidden="true">↗</span></button>}
    </header>
    <div className="notice"><span className="notice-label">预览版</span><span>题库内容正在复核，请以原始文档为准。</span><span className="notice-end" aria-hidden="true">持续打磨中 ↗</span></div>
    {message && <div role="alert" className="error toast">{message}<button onClick={() => setMessage('')}>关闭</button></div>}
    <AnimatePresence mode="wait"><motion.article key={me.data ? location.pathname : 'auth'} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22, ease }}>
      {!me.data ? <Auth onDone={() => qc.invalidateQueries()} fail={fail} />
        : practicing ? <Practice id={location.pathname.split('/')[2]} fail={fail} />
        : location.pathname === '/mistakes' ? <Mistakes fail={fail} />
        : location.pathname === '/history' ? <History />
        : location.pathname === '/account' ? <Account user={me.data} fail={fail} />
        : <Home fail={fail} />}
    </motion.article></AnimatePresence>
    <div className="bottom-note"><span>喜欢简单些？切换到极简版</span><a className="simple-link" href="/simple/">simple ↗</a></div>
  </main></MotionConfig>;
}

function Auth({ onDone, fail }: { onDone: () => void; fail: Fail }) {
  const [register, setRegister] = useState(false), [busy, setBusy] = useState(false);
  return <div className="auth-layout"><section className="auth-intro">
    <div className="eyebrow"><span className="index-label">START</span> 你的练习手帐</div>
    <h1>从一道题开始，<br />让<span className="marker">进步发生。</span></h1>
    <p className="lede">专注眼前的每一次选择。<br />练习、回顾，再向前一点。</p>
    <div className="feature-tags"><span>随时续刷</span><span>专注作答</span><span>错题回顾</span></div>
    <PaperArt />
  </section><form className="card auth" onSubmit={async event => {
    event.preventDefault(); setBusy(true); const form = new FormData(event.currentTarget);
    try { await api('/auth/' + (register ? 'register' : 'login'), { name: form.get('name'), password: form.get('password') }); onDone(); }
    catch (error) { fail(error); } finally { setBusy(false); }
  }}>
    <span className="paper-tape" aria-hidden="true" />
    <div className="tabs auth-tabs">{[false, true].map(value => <button type="button" key={String(value)} className={register === value ? 'selected' : ''} aria-pressed={register === value} onClick={() => setRegister(value)}>{value ? '注册' : '登录'}</button>)}</div>
    <div className="form-heading"><span className="eyebrow">{register ? '新的一页' : '接着上次的进度'}</span><h2>{register ? '建立你的练习档案' : '欢迎回来'}</h2></div>
    <label>用户名<input name="name" autoComplete="username" required minLength={2} maxLength={40} placeholder="怎么称呼你？" /></label>
    <label>密码<input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={8} maxLength={128} placeholder="至少 8 位" /></label>
    <button className="primary wide" disabled={busy}>{busy ? <><span className="busy-pixels" aria-hidden="true">▪▪▪</span>请稍候…</> : register ? '创建账号 →' : '登录 →'}</button>
    <p className="form-footnote">你的每次作答，都会好好记下。</p>
  </form></div>;
}

function Home({ fail }: { fail: Fail }) {
  const nav = useNavigate();
  const banks = useQuery({ queryKey: ['banks'], queryFn: () => api<Bank[]>('/banks') });
  const history = useQuery({ queryKey: ['history'], queryFn: () => api<RecordItem[]>('/history') });
  const stats = useQuery({ queryKey: ['stats', 'home'], queryFn: () => api<Record<string, QuestionStat>>('/stats') });
  const [mode, setMode] = useState(''), [starting, setStarting] = useState('');
  async function start(bank: string, restart = false) {
    if (starting) return; setStarting(bank);
    try { const data = await api<{ id: string }>('/practice-sessions', { mode: 'special', bank, restart }); nav('/practice/' + data.id); }
    catch (error) { fail(error); } finally { setStarting(''); }
  }
  const resume = history.data?.find(record => record.index < record.total);
  const practiced = Object.keys(stats.data || {}).length;
  const pending = Object.values(stats.data || {}).filter(stat => stat.pending).length;
  return <>
    <div className="hero"><div className="hero-copy"><div className="eyebrow"><span className="index-label">01</span> 练习，没有固定路线</div><h1>今天，<br />继续<span className="marker">进步一点。</span></h1><p className="lede">选一个专项，或者让随机练习带来一点惊喜。</p><div className="hero-meta"><span><b>{String(practiced).padStart(2, '0')}</b> 道题已留下足迹</span><span className="meta-divider" /><span><b>{String(pending).padStart(2, '0')}</b> 道错题待巩固</span></div></div><PaperArt /></div>
    {resume && <section className="continue card"><div className="continue-left"><span className="continue-icon" aria-hidden="true">↳</span><div><span className="eyebrow">书签还在这里</span><h3>{resume.bank?.replace('-', ' · ') || names[resume.mode]}</h3><small>已完成 <span className="mono">{resume.index} / {resume.total}</span></small></div></div><button className="primary" onClick={() => nav('/practice/' + resume.id)}>继续练习 →</button></section>}
    <div className="section-heading"><div className="section-title"><span className="section-number">A.</span><h2>专项练习</h2></div><small>打乱顺序，按自己的节奏刷完。</small></div>
    {banks.isError && <p role="alert">题库加载失败 <button onClick={() => banks.refetch()}>重试</button></p>}
    <div className="grid bank-grid">{banks.data?.map((bank, i) => <motion.section className={`card bank bank-${i} ${bank.done > 0 ? 'has-progress' : ''}`} key={bank.name}
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, delay: i * 0.045, ease }} whileHover={{ y: -3 }}>
      <div className="bank-topline"><span className="bank-serial">题集 / 0{i + 1}</span><span className={'bank-icon icon-' + i} aria-hidden="true">{['▤', '◎', '▥', '⚑'][i]}</span></div>
      <h3>{bank.name.split('-').reverse().join(' · ')}</h3>
      <div className="bank-progress-label"><small>已覆盖题目</small><span className="mono"><b>{bank.done}</b> / {bank.count}</span></div>
      <progress value={bank.done} max={bank.count || 1} aria-label={bank.name + '覆盖进度'} />
      <div className="bank-bottom"><span className="bank-mode">乱序练习 · 随时暂停</span><button aria-label={'开始' + bank.name} disabled={!bank.count || !!starting} onClick={() => start(bank.name)}>{starting === bank.name ? '准备中…' : '开始练习 ↗'}</button></div>
      {bank.done > 0 && <button className="text-button restart" disabled={!!starting} onClick={() => start(bank.name, true)}>另开新一轮</button>}
    </motion.section>)}</div>
    <div className="section-heading mode-heading"><div className="section-title"><span className="section-number">B.</span><h2>换种方式，接着练</h2></div><small>一点变化，一点新的收获。</small></div>
    <div className="grid mode-grid"><button className="mode-card lavender" onClick={() => setMode('mixed')}><span className="mode-graphic" aria-hidden="true">⤨</span><span className="mode-copy"><b>随机混合</b><span>跨来源混刷，优先照顾个人错题。</span><span className="mode-amount mono">20 / 30 / 50 题</span></span><span className="mode-arrow" aria-hidden="true">↗</span></button><button className="mode-card peach" onClick={() => setMode('mistakes')}><span className="mode-graphic" aria-hidden="true">▧</span><span className="mode-copy"><b>错题专项</b><span>让不确定的，成为确定的。</span><span className="mode-amount mono">{pending} 题待巩固</span></span><span className="mode-arrow" aria-hidden="true">↗</span></button></div>
    <AnimatePresence>{mode && <Setup key="setup" mode={mode} close={() => setMode('')} fail={fail} />}</AnimatePresence>
  </>;
}

function Setup({ mode, close, fail }: { mode: string; close: () => void; fail: Fail }) {
  const nav = useNavigate(), reduced = useReducedMotion();
  const [subject, setSubject] = useState(localStorage.getItem('subject') || '金融'), [count, setCount] = useState(20), [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    function keyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') {
        const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select, input');
        if (!controls?.length) return;
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', keyboard);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keyboard); previous?.focus(); };
  }, [close]);
  return createPortal(<motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
    <motion.section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="setup-title" className="card modal" initial={reduced ? false : { scale: 0.97, y: 18, rotate: -1 }} animate={{ scale: 1, y: 0, rotate: 0 }} exit={reduced ? { opacity: 0 } : { scale: 0.98, y: 12, opacity: 0 }} transition={{ duration: 0.25, ease }} onClick={event => event.stopPropagation()}>
      <span className="paper-tape" aria-hidden="true" /><button className="close" onClick={close} aria-label="关闭">×</button>
      <div className="eyebrow">给自己一小段专注时间</div><h2 id="setup-title">{names[mode]}</h2><p className="modal-description">这一轮，由你决定。</p>
      <fieldset><legend>选择科目</legend><div className="tabs">{['经济基础', '金融', '全部'].map(value => <button key={value} className={value === subject ? 'selected' : ''} aria-pressed={value === subject} onClick={() => { setSubject(value); localStorage.setItem('subject', value); }}>{value}</button>)}</div></fieldset>
      <fieldset><legend>本次练习题量</legend><div className="tabs count-tabs">{[20, 30, 50].map(value => <button key={value} className={value === count ? 'pink' : ''} aria-pressed={value === count} onClick={() => setCount(value)}><b>{value}</b> 题</button>)}</div></fieldset>
      <div className="hint paper-note"><span className="hint-pin" aria-hidden="true">✳</span><p>{mode === 'mixed' ? '优先混入个人待巩固错题，本轮不重复。' : '连续答对 2 次后，移出待巩固。'}<br /><small>题目不足时，以实际可用数量开始。</small></p></div>
      <button className="primary wide" disabled={busy} onClick={async () => {
        setBusy(true); try { const data = await api<{ id: string }>('/practice-sessions', { mode, subject, count }); nav('/practice/' + data.id); }
        catch (error) { fail(error); } finally { setBusy(false); }
      }}>{busy ? '正在准备…' : '开始练习 →'}</button>
    </motion.section>
  </motion.div>, document.body);
}

const practiceEase = [0.42, 0, 0.35, 1] as const;

function Practice({ id, fail }: { id: string; fail: Fail }) {
  const query = useQuery({ queryKey: ['session', id], queryFn: () => api<Session>('/practice-sessions/' + id) });
  const stats = useQuery({ queryKey: ['stats', id, query.data?.index, !!query.data?.result], queryFn: () => api<Record<string, QuestionStat>>('/stats') });
  if (query.isPending) return <p className="loading">正在加载题目…</p>;
  if (!query.data) return <p role="alert">{query.error?.message}<button onClick={() => query.refetch()}>重试</button></p>;
  const view = query.data;
  if (!view.question) return <Summary view={view} />;
  return <PracticeRound key={`${id}:${view.index}`} id={id} view={view} item={view.question}
    stat={stats.data?.[view.question.id]} fail={fail} refresh={async () => { await query.refetch({ throwOnError: true }); }} />;
}

function PracticeActions({ sessionId, result, multiple, busy, disabled, submit, onHeight }: {
  sessionId: string;
  result: boolean; multiple: boolean; busy: boolean; disabled: boolean;
  submit: () => void; onHeight: (height: number) => void;
}) {
  const nav = useNavigate(), location = useLocation(), bar = useRef<HTMLElement>(null);
  const active = location.pathname === '/practice/' + sessionId;
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement, previous = root.style.getPropertyValue('--active-practice-bar-height');
    let measured = '';
    const measure = () => {
      const height = Math.ceil(bar.current?.getBoundingClientRect().height || 104);
      measured = `${height}px`; root.style.setProperty('--active-practice-bar-height', measured); onHeight(height);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (bar.current) observer?.observe(bar.current);
    return () => {
      observer?.disconnect();
      if (root.style.getPropertyValue('--active-practice-bar-height') === measured) {
        if (previous) root.style.setProperty('--active-practice-bar-height', previous);
        else root.style.removeProperty('--active-practice-bar-height');
      }
    };
  }, [onHeight, active]);
  if (!active) return null;
  return createPortal(<footer ref={bar} className="practice-actions practice-actions-fixed" aria-label="练习操作" aria-busy={busy}>
    <div className="practice-actions-inner">
      <button className="text-button" onClick={() => nav('/')}>暂停并返回</button>
      <span className="action-caption">{result ? '记下这一点，再向前。' : multiple ? '选好所有答案后再检查' : '准备好了，就检查一下'}</span>
      <button className="primary" disabled={disabled} onClick={submit}>{busy ? <><span className="busy-pixels" aria-hidden="true">▪▪▪</span>处理中…</> : result ? '继续 →' : '检查'}</button>
    </div>
  </footer>, document.body);
}

function PracticeRound({ id, view, item, stat, fail, refresh }: {
  id: string; view: Session; item: Question; stat?: QuestionStat; fail: Fail; refresh: () => Promise<void>;
}) {
  const nav = useNavigate(), location = useLocation(), qc = useQueryClient(), reduced = useReducedMotion();
  const bookmarks = useQuery({ queryKey: ['bookmarks'], queryFn: () => api<Record<string, boolean>>('/bookmarks') });
  const active = useRef(true);
  active.current = location.pathname === '/practice/' + id;
  const result = view.result;
  const [selected, setSelected] = useState<string[]>([]), [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(true), [freshFeedback, setFreshFeedback] = useState(false);
  const [guarded, setGuarded] = useState(false), [transitioning, setTransitioning] = useState(false);
  const [barHeight, setBarHeight] = useState(104);
  const [feedbackWidth, setFeedbackWidth] = useState<number>();
  const [selectionBurst, setSelectionBurst] = useState({ id: '', key: 0 });
  const requestLock = useRef(false), nextAllowedAt = useRef(0), guardTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const questionStart = useRef<HTMLDivElement>(null), feedback = useRef<HTMLElement>(null);
  const reviewPanel = useRef<HTMLElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const shownDetails = !result || expanded;
  const choices = result?.selected || selected;
  const visibleOptions = item.options.map((option, index) => ({ option, index }))
    .filter(({ option }) => !result || expanded || result.selected.includes(option.id) || result.answer.includes(option.id));
  const completed = view.index + (result ? 1 : 0);
  const feedbackId = `feedback-title-${view.index}`;

  function locate(element: HTMLElement | null, focus = false) {
    if (!element || !active.current) return;
    const rect = element.getBoundingClientRect(), bottom = (window.visualViewport?.height || window.innerHeight) - barHeight - 24;
    if (rect.top < 24 || rect.top + Math.min(rect.height, 72) > bottom) {
      window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - 24), behavior: reduced ? 'instant' : 'smooth' });
    }
    if (focus) element.focus({ preventScroll: true });
  }
  function locateFeedback() {
    const reading = feedback.current, panel = reviewPanel.current;
    if (reading && panel && active.current && window.matchMedia(PHONE_QUERY).matches) {
      const questionRect = panel.getBoundingClientRect();
      const excerpt = reading.querySelector('.explanation > p')?.getBoundingClientRect();
      const bottom = (window.visualViewport?.height || window.innerHeight) - barHeight - 24;
      // Keep a short review and the explanation opening visible together.
      // Long questions keep the usual explanation-first scroll position.
      if (excerpt && questionRect.height > 0) {
        const excerptBottom = excerpt.top + Math.min(excerpt.height, 108);
        if (excerptBottom >= questionRect.bottom && excerptBottom - questionRect.top <= bottom - 24) {
          if (questionRect.top < 24 || excerptBottom > bottom) {
            window.scrollTo({ top: Math.max(0, window.scrollY + questionRect.top - 24), behavior: reduced ? 'instant' : 'smooth' });
          }
          reading.focus({ preventScroll: true });
          return;
        }
      }
    }
    locate(reading, true);
  }
  useEffect(() => {
    const measure = () => {
      const width = workspace.current?.getBoundingClientRect().width || 0;
      if (width > 328) setFeedbackWidth(width - 328);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (workspace.current) observer?.observe(workspace.current);
    return () => observer?.disconnect();
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => locate(questionStart.current));
    return () => { cancelAnimationFrame(frame); clearTimeout(guardTimer.current); };
    // Each round mounts once; resizing the footer must not move the user's reading position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!freshFeedback || !result) return;
    const timer = setTimeout(() => {
      setTransitioning(false);
      locateFeedback();
    }, reduced ? 0 : 620);
    return () => clearTimeout(timer);
    // Result identity changes from background refreshes must not replay the transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshFeedback, !!result, reduced]);

  function choose(option: string) {
    if (requestLock.current || busy || result) return;
    const adding = !selected.includes(option);
    setSelected(item.multiple ? (adding ? [...selected, option] : selected.filter(value => value !== option)) : [option]);
    if (adding) setSelectionBurst(previous => ({ id: option, key: previous.key + 1 }));
  }
  async function submit() {
    if (!active.current || requestLock.current || busy || (!result && !selected.length) || (result && (transitioning || performance.now() < nextAllowedAt.current))) return;
    requestLock.current = true; setBusy(true);
    try {
      if (result) {
        await api('/practice-sessions/' + id + '/next', { index: view.index });
        await refresh();
      } else {
        const outcome = await api<Result>('/practice-sessions/' + id + '/answers', { index: view.index, options: selected });
        setExpanded(true);
        nextAllowedAt.current = performance.now() + 300;
        setGuarded(true); setTransitioning(!reduced); setFreshFeedback(true);
        guardTimer.current = setTimeout(() => setGuarded(false), 300);
        qc.setQueryData<Session>(['session', id], previous => previous ? {
          ...previous, result: outcome, results: previous.result ? previous.results : [...previous.results, outcome],
        } : previous);
      }
      for (const key of ['stats', 'history', 'banks', 'mistakes', 'mistake-review']) qc.invalidateQueries({ queryKey: [key] });
    } catch (error) { fail(error); } finally { requestLock.current = false; setBusy(false); }
  }

  return <div className={`practice practice-focus ${result ? 'is-feedback' : 'is-answering'}`}
    style={feedbackWidth ? { '--feedback-reading-width': `${feedbackWidth}px` } as React.CSSProperties : undefined}
    data-stage={result ? 'feedback' : 'answering'} data-transitioning={transitioning}>
    <div className="practice-top" ref={questionStart}>
      <button aria-label="暂停练习" onClick={() => nav('/')}>×</button>
      <div className="progress-track" role="progressbar" aria-label="本轮进度" aria-valuemin={0} aria-valuemax={view.total} aria-valuenow={completed}>
        <motion.div animate={{ width: 100 * completed / view.total + '%' }} transition={{ duration: reduced ? 0 : .44, ease: practiceEase }} />
      </div><b>{view.index + 1} / {view.total}</b>
    </div>
    <motion.div className="question-page" initial={reduced || result ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .52, ease: practiceEase }}>
      <div className="question-meta"><span className="tag">{item.multiple ? '多选题' : '单选题'}</span><span className="source">{item.bank.replace('-', ' · ')}</span><button className="text-button bookmark-button" aria-pressed={!!bookmarks.data?.[item.id]} disabled={busy} onClick={async () => {
        try { await api('/bookmarks/' + encodeURIComponent(item.id), { starred: !bookmarks.data?.[item.id] }); await qc.invalidateQueries({ queryKey: ['bookmarks'] }); } catch (error) { fail(error); }
      }}>{bookmarks.data?.[item.id] ? '★ 已收藏' : '☆ 收藏'}</button><span className="question-instruction">{result ? '回看本题' : item.option_order_locked ? '此题按原题顺序展示' : item.multiple ? '选择所有符合的选项' : '选择一个最合适的答案'}</span></div>
      <div className="practice-workspace" ref={workspace}>
        <motion.section ref={reviewPanel} layout={reduced ? false : 'position'} transition={{ layout: { duration: .62, ease: practiceEase } }}
          className={`question-panel ${expanded ? 'is-expanded' : ''}`} aria-label="当前题目">
          {result && <div className="question-review-heading"><span className="eyebrow">题目回看</span><button className="text-button" aria-expanded={expanded} aria-controls={`question-review-${view.index}`} onClick={() => setExpanded(value => !value)}>{expanded ? '收起完整题目' : '展开完整题目'}</button></div>}
          <section className="question"><h2>{item.stem}</h2></section>
          <div className="question-review-content" id={`question-review-${view.index}`}>
            <div className="question-detail-shell" data-open={shownDetails} aria-hidden={!shownDetails} inert={!shownDetails}>
              <div className="question-detail-inner">
              {item.material && <details className="card material" open><summary>查看案例材料 <span aria-hidden="true">↗</span></summary><p>{item.material}</p>{item.options.some(option => option.source_label && option.source_label !== option.label) && <p className="material-order-note">原页用于材料参考；作答与判分以下方本轮选项为准。</p>}{item.images?.map(image => <img className="material-image" key={image} src={image} alt="案例材料表格" loading="lazy" />)}</details>}
              </div>
            </div>
            <div className={`option-list ${result ? 'review-option-list' : ''}`} aria-label={result ? '本题选项回看' : undefined}>{visibleOptions.map(({ option, index }) => <motion.button key={option.id} layout={result && !reduced ? 'position' : false} whileTap={result || reduced ? {} : { scale: .992, y: 2 }} transition={{ duration: .16, ease: practiceEase, layout: { duration: .62, ease: practiceEase } }}
                className={'option ' + (choices.includes(option.id) ? 'selected ' : '') + (result?.answer.includes(option.id) ? 'correct ' : '') + (result && choices.includes(option.id) && !result.answer.includes(option.id) ? 'incorrect' : '')}
                aria-label={result ? `${displayOptionLabel(option, index)}，${option.text}，${result.selected.includes(option.id) ? '已选，' : ''}${result.answer.includes(option.id) ? '正确选项' : result.selected.includes(option.id) ? '选择错误' : '未选'}` : undefined}
                aria-pressed={choices.includes(option.id)} disabled={!!result || busy} onClick={() => choose(option.id)}>
                <span className={item.multiple ? 'choice square' : 'choice'}>{displayOptionLabel(option, index)}{selectionBurst.id === option.id && !result && <PixelBurst key={selectionBurst.key} tone="selection" />}</span><span className="option-text">{option.text}</span><span className="option-state" aria-hidden="true">{result ? result.answer.includes(option.id) ? '✓' : choices.includes(option.id) ? '×' : '' : choices.includes(option.id) ? '↙' : ''}</span>
            </motion.button>)}</div>
            {shownDetails && <div className="question-stat"><span aria-hidden="true">↺</span><span>这道题的足迹</span><span>累计作答 <b>{stat?.attempts || 0}</b> 次</span><span>答错 <b>{stat?.errors || 0}</b> 次</span></div>}
          </div>
        </motion.section>
        <div className="feedback-column">
          {result && <section className="feedback-reading" ref={feedback} tabIndex={-1} aria-labelledby={feedbackId}>
            <FeedbackPaper correct={result.correct} answer={answerLabels(item, result.answer)} explanation={explanationView(item, result).text}
              burstKey={freshFeedback ? 1 : 0} animateEntry={freshFeedback} titleId={feedbackId} reference={<OriginalReference question={item} result={result} />} />
          </section>}
        </div>
      </div>
    </motion.div>
    <PracticeActions sessionId={id} result={!!result} multiple={item.multiple} busy={busy} disabled={busy || guarded || transitioning || (!result && !selected.length)} submit={submit} onHeight={setBarHeight} />
  </div>;
}

function Summary({ view }: { view: Session }) {
  const nav = useNavigate(), qc = useQueryClient();
  const correct = view.results.filter(result => result.correct).length;
  return <section className="summary"><div className="summary-celebration"><PixelBurst tone="complete" /><motion.div className="big-check" initial={{ rotate: -12, scale: 0.85 }} animate={{ rotate: -5, scale: 1 }} transition={{ type: 'spring', stiffness: 280, damping: 17 }}>✓</motion.div></div><div className="eyebrow">这一页，认真写完了</div><h1>这一轮，完成了！</h1><p className="lede">保持这份节奏，你正在稳步进步。</p>
    <div className="summary-ticket"><span className="paper-tape" aria-hidden="true" /><div className="ticket-heading"><span>本轮练习小结</span><span>GOOD WORK ↗</span></div><div className="grid stats-grid"><div><b>{correct}<span> / {view.total}</span></b><small>本轮答对</small></div><div><b>{Math.round(correct / view.total * 100)}<span>%</span></b><small>正确率</small></div><div><b className="duration">{Math.floor(view.elapsed / 60)}<span>分</span>{view.elapsed % 60}<span>秒</span></b><small>本轮历时（含暂停）</small></div></div><TearEdge /></div>
    <div className="section-heading"><div className="section-title"><span className="section-number">↺</span><h2>本轮错题回顾</h2></div><span className="count-tag">{view.results.length - correct} 题</span></div>
    {view.results.filter(result => !result.correct).map((result, i) => <details className="card review" key={i}><summary><span className="review-number">{String(i + 1).padStart(2, '0')}</span><span>{result.question.stem}</span><span className="review-toggle" aria-hidden="true">+</span></summary><div className="review-body"><ReviewContent result={result} /></div></details>)}
    {view.results.every(result => result.correct) && <div className="empty-state"><span className="empty-symbol" aria-hidden="true">✳</span><h3>全部答对，做得很好！</h3><p>这份收获，已经好好记下。</p></div>}
    <button className="primary" onClick={() => { qc.invalidateQueries(); nav('/'); }}>返回首页 →</button>
  </section>;
}

function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return <section className="empty-state"><span className="empty-symbol" aria-hidden="true">▤</span><h3>{title}</h3><p>{children}</p></section>;
}

function ReviewContent({ result }: { result: Result }) {
  const question = result.question;
  return <>{question.material && <p>{question.material}</p>}{question.images?.map(src => <img className="question-image" key={src} src={src} alt="本题材料" />)}
    <p className="review-snapshot-stem">{question.stem}</p>
    <ul className="review-options">{question.options.map((option, index) => <li key={option.id} className={result.answer.includes(option.id) ? 'is-answer' : ''}><b>{displayOptionLabel(option, index)}</b><span>{option.text}</span><small>{result.answer.includes(option.id) ? '正确答案' : result.selected.includes(option.id) ? '你的选择' : ''}</small></li>)}</ul>
    <span className="tag">正确答案：{answerLabels(question, result.answer).join('、')} · 最近选择：{answerLabels(question, result.selected).join('、')}</span>
    <p>{explanationView(question, result).text || '本题暂无文字解析。'}</p><OriginalReference question={question} result={result} />
  </>;
}

function MistakeReview({ id, open }: { id: string; open: boolean }) {
  const result = useQuery({ queryKey: ['mistake-review', id], queryFn: () => api<Result>(`/mistakes/${encodeURIComponent(id)}/review`), enabled: open });
  if (!open) return null;
  if (result.isPending) return <p role="status">正在加载本次作答的题目与解析…</p>;
  if (result.isError) return <button onClick={() => result.refetch()}>解析加载失败，点击重试</button>;
  return <ReviewContent result={result.data} />;
}

function MistakeRow({ item, number }: { item: QuestionStat & { question: Question }; number: number }) {
  const [open, setOpen] = useState(false);
  return <details className="card review mistake-row" onToggle={event => setOpen(event.currentTarget.open)}><summary><span className="review-number">{String(number).padStart(2, '0')}</span><div className="review-copy"><span className="review-stem">{item.question.stem}</span><div className="review-meta"><small>{item.question.bank.replace('-', ' · ')}<span className="review-counts">作答 {item.attempts} 次 · 错误 {item.errors} 次</span></small><span className="mastery" aria-label={`连续答对 ${Math.min(item.streak, 2)} / 2`}>连续答对 <i className={item.streak >= 1 ? 'filled' : ''} /><i className={item.streak >= 2 ? 'filled' : ''} /><span className="mono">{Math.min(item.streak, 2)} / 2</span></span></div></div><span className="review-toggle" aria-hidden="true">+</span></summary><div className="review-body"><MistakeReview id={item.question.id} open={open} /></div></details>;
}

function Pagination({ info, change, position }: { info: PageInfo; change: (anchor: number) => void; position: string }) {
  if (!info.total) return null;
  return <nav className="pagination" aria-label={`错题本${position}分页`}><span className="pagination-range" aria-live="polite">{info.start + 1}–{info.end} / {info.total} 题 · 每页 {info.size} 题</span><div className="pagination-controls">
    <button disabled={info.page === 0} onClick={() => change(info.start - info.size)}>上一页</button>
    <label>第 <select aria-label={`错题本${position}页码`} value={info.page} onChange={event => change(Number(event.target.value) * info.size)}>{Array.from({ length: info.pages }, (_, page) => <option key={page} value={page}>{page + 1}</option>)}</select> / {info.pages} 页</label>
    <button disabled={info.page === info.pages - 1} onClick={() => change(info.start + info.size)}>下一页</button>
  </div></nav>;
}

function Mistakes({ fail }: { fail: Fail }) {
  const data = useQuery({ queryKey: ['mistakes'], queryFn: () => api<(QuestionStat & { question: Question })[]>('/mistakes') });
  const [pending, setPending] = useState(true), [subject, setSubject] = useState('全部'), [start, setStart] = useState(false);
  const [anchor, setAnchor] = useState(0), [phone, setPhone] = useState(() => window.matchMedia(PHONE_QUERY).matches);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { const media = window.matchMedia(PHONE_QUERY); const update = () => setPhone(media.matches); media.addEventListener('change', update); return () => media.removeEventListener('change', update); }, []);
  const rows = data.data?.filter(item => item.pending === pending && (subject === '全部' || item.question.bank.includes(subject))).sort((a, b) => b.last - a.last || a.question.id.localeCompare(b.question.id));
  const info = pageInfo(rows?.length || 0, anchor, phone ? PHONE_PAGE_SIZE : DESKTOP_PAGE_SIZE);
  useEffect(() => { if (anchor >= (rows?.length || 0)) setAnchor(info.start); }, [rows?.length, anchor, info.start]);
  function changePage(next: number) { setAnchor(next); requestAnimationFrame(() => { const node = list.current; if (node) { node.focus({ preventScroll: true }); if (node.getBoundingClientRect().top < 80 || node.getBoundingClientRect().top > window.innerHeight / 2) node.scrollIntoView({ block: 'start', behavior: 'instant' }); } }); }
  return <><PageHeading number="02" title="把错题，变成会的题。" description="连续答对两次后移出待巩固，历史记录会一直保留。"><span className="page-stamp" aria-hidden="true">再试一次<br /><b>也是进步 ↗</b></span></PageHeading>
    <div className="filter-bar"><div className="tabs"><button className={pending ? 'selected' : ''} aria-pressed={pending} onClick={() => { setPending(true); setAnchor(0); }}>待巩固 <span className="tab-count">{data.data?.filter(item => item.pending).length || 0}</span></button><button className={!pending ? 'selected' : ''} aria-pressed={!pending} onClick={() => { setPending(false); setAnchor(0); }}>已巩固 <span className="tab-count">{data.data?.filter(item => !item.pending).length || 0}</span></button></div><label className="filter-select">筛选科目<select value={subject} onChange={event => { setSubject(event.target.value); setAnchor(0); }}>{['全部', '金融', '经济基础'].map(value => <option key={value}>{value}</option>)}</select></label></div>
    {data.isError && <button onClick={() => data.refetch()}>加载失败，点击重试</button>}
    {rows?.length === 0 && <EmptyState title={pending ? '这里暂时没有待巩固的题。' : '巩固好的题，会收进这里。'}>每一次回顾，都值得肯定。</EmptyState>}
    <Pagination info={info} change={changePage} position="上方" />
    <div className="mistake-list" ref={list} tabIndex={-1} aria-label="本页错题">{rows?.slice(info.start, info.end).map((item, i) => <MistakeRow key={item.question.id} item={item} number={info.start + i + 1} />)}</div>
    {info.pages > 1 && <Pagination info={info} change={changePage} position="下方" />}
    {pending && !!rows?.length && <div className="list-actions"><p>不急着全会，再练一轮就好。</p><button className="primary" onClick={() => setStart(true)}>开始错题巩固 →</button></div>}
    <AnimatePresence>{start && <Setup key="setup" mode="mistakes" close={() => setStart(false)} fail={fail} />}</AnimatePresence>
  </>;
}

function History() {
  const nav = useNavigate();
  const data = useQuery({ queryKey: ['history'], queryFn: () => api<RecordItem[]>('/history') });
  const finished = data.data?.filter(item => item.index >= item.total).length || 0;
  return <><PageHeading number="03" title="每一次努力，都有记录。" description="未完成的练习随时继续，完成的收获也能回看。"><span className="page-stamp lavender" aria-hidden="true">认真练过的<br /><b>都算数 ✳</b></span></PageHeading>
    <div className="history-overview"><span>你的练习档案</span><span><b className="mono">{String(data.data?.length || 0).padStart(2, '0')}</b> 次练习</span><span><b className="mono">{String(finished).padStart(2, '0')}</b> 次已完成</span></div>
    {data.isError && <button onClick={() => data.refetch()}>加载失败，点击重试</button>}
    {data.data?.length === 0 && <EmptyState title="第一份记录，等你来写。">开始一轮练习，把进步留在这里。</EmptyState>}
    <div className="history-list">{data.data?.map((item, i) => <section className="history-row" key={item.id}><div className="history-index mono">{String(i + 1).padStart(2, '0')}</div><div className="history-content"><div className="history-meta"><time dateTime={new Date(item.created * 1000).toISOString()}>{new Date(item.created * 1000).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</time><span className={'history-status ' + (item.index < item.total ? 'unfinished' : '')}>{item.index < item.total ? '书签待续' : '已完成'}</span></div><h3>{item.bank?.replace('-', ' · ') || item.subject + ' · ' + names[item.mode]}</h3><p>已完成 <b className="mono">{item.index} / {item.total}</b><span className="inline-separator">·</span>答对 <b className="mono">{item.correct}</b> 题</p></div><button onClick={() => nav('/practice/' + item.id)}>{item.index < item.total ? '继续 →' : '查看结果'}</button></section>)}</div>
  </>;
}

function Account({ user, fail }: { user: User; fail: Fail }) {
  const qc = useQueryClient(); const [busy, setBusy] = useState(false);
  function clearAccount() { qc.setQueryData(['me'], null); qc.removeQueries({ predicate: query => query.queryKey[0] !== 'me' }); }
  return <><PageHeading number="ME" title={`你好，${user.name}。`} description="这里是你的练习空间，进度和记录都好好保管着。" /><p><a href="/simple">打开极简版 →</a><span className="muted"> · 账号、练习、收藏和错题同步</span></p>
    <div className="account-layout"><aside className="account-card"><div className="account-avatar" aria-hidden="true">{user.name.slice(0, 1)}</div><h2>{user.name}</h2><span className="tag">{user.role === 'admin' ? '管理员' : '普通用户'}</span><div className="account-rule" /><p>按自己的节奏，<br />继续把进步攒起来。</p><button disabled={busy} className="wide" onClick={async () => { setBusy(true); try { await api('/logout', {}); clearAccount(); } catch (error) { fail(error); } finally { setBusy(false); } }}>退出登录</button><TearEdge /></aside>
    <form className="card account" onSubmit={async event => {
      event.preventDefault(); setBusy(true); const form = new FormData(event.currentTarget);
      try { await api('/password', { current: form.get('current'), password: form.get('password') }); clearAccount(); }
      catch (error) { fail(error); } finally { setBusy(false); }
    }}><div className="form-heading"><span className="eyebrow">账户设置</span><h2>修改密码</h2><p>修改后，需要使用新密码重新登录。</p></div><label>原密码<input type="password" name="current" required autoComplete="current-password" /></label><label>新密码<input type="password" name="password" minLength={8} maxLength={128} required autoComplete="new-password" placeholder="至少 8 位" /></label><button className="primary" disabled={busy}>{busy ? '处理中…' : '修改并重新登录'}</button></form></div>
  </>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={client}><BrowserRouter><App /></BrowserRouter></QueryClientProvider></React.StrictMode>);
