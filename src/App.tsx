import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { ArrowDown, ArrowRight, ArrowUpRight, BookOpen, Brain, Check, CheckCircle2, ChevronDown, ChevronRight, Clock3, Code2, Copy, Info, ListTodo, Menu, Network, LockKeyhole, Plus, Search, Settings2, ShieldCheck, Sparkles, Wallet, X } from 'lucide-react';
import BrainViewer from './BrainViewer';
import AgentLab from './AgentLab';
import TaskDetail from './TaskDetail';
import { circuits, isComplete, localDate, parseTasks, planTask, type Circuit, type Task } from './model';
import { connectWallet, recordReceipt, checkReceipt, type ChainKey } from './chain';

const STORAGE_KEY = 'flybrain.tasks.v1';
const links = {
  source: 'https://github.com/shelbybrothers/flybrain-wiki',
  vfb: 'https://v2.virtualflybrain.org/org.geppetto.frontend/geppetto?id=VFB_00101567&i=VFB_00101567',
  model: 'https://github.com/eonsystemspbc/fly-brain',
  atlas: 'https://flybrain.aertslab.org/?_inputs_&page=%22HomePage%22',
  chain: 'https://docs.robinhood.com/chain/connecting/',
  x: 'https://x.com/flybrainwiki',
};
function External({ href, children, className = '' }: { href: string; children: ReactNode; className?: string }) { return <a className={className} href={href} target="_blank" rel="noreferrer">{children}<ArrowUpRight size={13} /></a>; }
function Logo({ large = false }: { large?: boolean }) { return <div className={`brand ${large ? 'brand-large' : ''}`}><div className="brand-image"><img src="/flybrain.png" alt="FlyBrain puzzle brain logo" /></div><div><span className="wordmark">FlyBrain <b>Wiki</b></span><span className="brand-tagline">The open intelligence encyclopedia</span></div></div>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; dialog?.showModal(); return () => { dialog?.close(); document.body.style.overflow = overflow; }; }, []);
  return <dialog ref={ref} className="modal" aria-label={title} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}><header><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={19} /></button></header>{children}</dialog>;
}
function initialTasks() { try { return parseTasks(localStorage.getItem(STORAGE_KEY)); } catch { return []; } }

export default function App() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks), [prompt, setPrompt] = useState(''), [selected, setSelected] = useState<Circuit | 'all'>('all');
  const [taskCircuit, setTaskCircuit] = useState<Circuit | 'auto'>('auto');
  const [tab, setTab] = useState<'article' | 'about'>('article'), [taskFilter, setTaskFilter] = useState<'today' | 'all' | 'completed'>('today');
  const [modal, setModal] = useState<'new' | 'wallet' | 'settings' | null>(null), [detail, setDetail] = useState<string | null>(null), [notice, setNotice] = useState('');
  const [wallet, setWallet] = useState(''), [chain, setChain] = useState<ChainKey>('testnet'), [busy, setBusy] = useState(false), [receiptBusy, setReceiptBusy] = useState<string | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false), [search, setSearch] = useState(''), [showSearch, setShowSearch] = useState(false), [due, setDue] = useState(localDate());
  const [size, setSize] = useState<'standard' | 'large'>(() => { try { return localStorage.getItem('flybrain.text-size') === 'large' ? 'large' : 'standard'; } catch { return 'standard'; } });
  const [undoTask, setUndoTask] = useState<Task | null>(null), [searchIndex, setSearchIndex] = useState(0);
  useEffect(() => { try { localStorage.setItem('flybrain.text-size', size); } catch { /* Preference remains available for this session. */ } }, [size]);
  const [activeSection, setActiveSection] = useState('overview');
  const [walletError, setWalletError] = useState('');
  const [receiptNetworkIssue, setReceiptNetworkIssue] = useState(false);
  const [receiptError, setReceiptError] = useState<{ taskId: string; message: string } | null>(null);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const dueDate = localDate(), completeCount = tasks.filter(isComplete).length, activeTask = tasks.find(t => t.id === detail);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); } catch { setNotice('Device storage is unavailable. Export your tasks before closing this page.'); } }, [tasks]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => { setNotice(''); setUndoTask(null); }, 8000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    const provider = window.ethereum;
    const updateAccounts = (accounts: unknown) => setWallet(Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] : '');
    provider?.on?.('accountsChanged', updateAccounts);
    return () => provider?.removeListener?.('accountsChanged', updateAccounts);
  }, []);
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const pending = tasks.filter(t => t.receipt?.status === 'pending');
      const results = await Promise.allSettled(pending.map(async task => ({ id: task.id, status: await checkReceipt(task.receipt!) })));
      if (cancelled) return;
      setReceiptNetworkIssue(results.some(result => result.status === 'rejected'));
      for (const result of results) if (result.status === 'fulfilled' && result.value.status !== 'pending') {
        const { id, status } = result.value;
        setTasks(current => current.map(task => task.id === id && task.receipt ? { ...task, receipt: { ...task.receipt, status } } : task));
      }
    }
    if (tasks.some(t => t.receipt?.status === 'pending')) void refresh();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 15000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [tasks]);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => { entries.forEach(e => { if (e.isIntersecting) setActiveSection(e.target.id); }); }, { rootMargin: '-15% 0px -65% 0px' });
    document.querySelectorAll('main section[id]').forEach(e => observer.observe(e));
    return () => observer.disconnect();
  }, [tab]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); document.getElementById('wiki-search')?.focus(); }
      if (e.key === 'Escape') { setShowSearch(false); setMobileMenu(false); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: object, options: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: object) => {
      try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch { /* Standard UI remains available. */ }
    };
    register({ name: 'list_daily_tasks', title: 'List daily tasks', description: 'Read task plans saved in this browser, including completion and receipt status.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: () => tasksRef.current.map(t => ({ id: t.id, title: t.title, due: t.due, completed: isComplete(t), receipt: t.receipt?.status ?? null })) });
    register({ name: 'create_daily_task_plan', title: 'Create a daily task plan', description: 'Create and save a three-step local plan, then open it for review. Does not perform the task or publish anything on-chain.', inputSchema: { type: 'object', properties: { title: { type: 'string', minLength: 1, maxLength: 240 } }, required: ['title'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: true }, execute: (input: unknown) => {
      if (!input || typeof input !== 'object' || Object.keys(input).length !== 1 || typeof (input as { title?: unknown }).title !== 'string') throw new Error('Provide a single task title.');
      const task = planTask((input as { title: string }).title);
      flushSync(() => { setTasks(current => [task, ...current]); setDetail(task.id); setSelected(task.circuit); });
      return { id: task.id, title: task.title, steps: task.steps, status: 'planned', storage: 'this browser' };
    } });
    return () => lifecycle.abort();
  }, []);
  function navigateTo(id: string) { setTab('article'); setActiveSection(id); setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30); }
  function chooseSearch(item: { id: string; type: string }) { if (item.type === 'Your task') setDetail(item.id); else navigateTo(item.id); setShowSearch(false); setSearch(''); setSearchIndex(0); }
  function addTask(event: FormEvent) {
    event.preventDefault();
    try {
      const task = planTask(prompt, due, taskCircuit === 'auto' ? undefined : taskCircuit);
      setTasks(current => [task, ...current]); setPrompt(''); setModal(null); setDetail(task.id); setDue(localDate());
      setSelected(task.circuit); setNotice('A thought, a circuit, and three next steps. Your plan is ready.');
    } catch (error) { setNotice((error as Error).message); }
  }
  async function connect() {
    setBusy(true); setWalletError('');
    try { const account = await connectWallet(chain); setWallet(account); setModal(null); setNotice(`Connected to Robinhood Chain ${chain === 'testnet' ? 'Testnet' : 'Mainnet'}.`); }
    catch (error) { setWalletError((error as Error).message); }
    finally { setBusy(false); }
  }
  async function anchor(task: Task) {
    setReceiptBusy(task.id);
    setReceiptError(null);
    try {
      const receipt = await recordReceipt(task, chain);
      setWallet(receipt.account);
      setTasks(current => current.map(t => t.id === task.id ? { ...t, receipt } : t));
      setNotice('Receipt submitted. Waiting for the network to confirm it.');
    } catch (error) { setReceiptError({ taskId: task.id, message: (error as Error).message }); }
    finally { setReceiptBusy(null); }
  }
  function exportTasks() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), tasks }, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `flybrain-tasks-${localDate()}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const filteredTasks = tasks.filter(t => taskFilter === 'completed' ? isComplete(t) : taskFilter === 'today' ? t.due === dueDate : true);
  const contents = [['overview', 'Overview'], ['agent-lab', 'Agent lab'], ['brain-explorer', 'Brain explorer'], ['daily-tasks', 'Daily tasks'], ['how-it-works', 'How it works'], ['references', 'References']];
  const searchItems = [...contents.map(([id, title]) => ({ id, title, type: 'Article section' })), ...tasks.map(t => ({ id: t.id, title: t.title, type: 'Your task' }))].filter(item => item.title.toLowerCase().includes(search.toLowerCase()));

  return <div className={`app text-${size}`}>
    <a className="skip-link" href="#main-content">Skip to workspace</a>
    <header className="site-header">
      <button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileMenu(true)}><Menu size={21} /></button>
      <a className="brand-link" href="#overview" onClick={() => setTab('article')}><Logo /></a>
      <div className="search-wrap" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setShowSearch(false); }}>
        <Search size={17} /><input id="wiki-search" role="combobox" aria-label="Search FlyBrain Wiki" aria-expanded={showSearch} aria-controls="search-results" aria-autocomplete="list" aria-activedescendant={showSearch && searchItems[searchIndex] ? `search-result-${searchIndex}` : undefined} placeholder="Search the wiki or your tasks" value={search} onFocus={() => setShowSearch(true)} onChange={e => { setSearch(e.target.value); setSearchIndex(0); setShowSearch(true); }} onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setSearchIndex(i => Math.min(i + 1, Math.min(searchItems.length, 12) - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setSearchIndex(i => Math.max(i - 1, 0)); }
          if (e.key === 'Enter' && searchItems[searchIndex]) { e.preventDefault(); chooseSearch(searchItems[searchIndex]); }
        }} /><kbd>⌘ K</kbd>
        {showSearch && <div className="search-results" id="search-results" role="listbox"><span className="eyebrow">{search ? 'SEARCH RESULTS' : 'JUMP TO SOMETHING'}</span>{searchItems.length ? searchItems.slice(0, 12).map((item, index) => <button role="option" aria-selected={index === searchIndex} id={`search-result-${index}`} className={index === searchIndex ? 'highlighted' : ''} key={item.id} onMouseEnter={() => setSearchIndex(index)} onClick={() => chooseSearch(item)}>{item.type === 'Your task' ? <ListTodo size={16} /> : <BookOpen size={16} />}<span>{item.title}<small>{item.type}</small></span><ArrowRight size={14} /></button>) : <p>No matches yet. Try “tasks” or “brain”.</p>}<div className="search-footnote">↑ ↓ to navigate <span>↵ to open</span></div></div>}
      </div>
      <nav className="header-links"><External href={links.source}>Source</External><External href={links.x}><span className="x-symbol">𝕏</span>Follow the experiment</External></nav>
      <button className={`wallet-button ${wallet ? 'connected' : ''}`} onClick={() => { setWalletError(''); setModal('wallet'); }}><Wallet size={15} />{wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : 'Connect wallet'}</button>
    </header>
    <div className="page-shell">
      <aside className="contents-sidebar">
        <span className="sidebar-edition">A LIVING EXPERIMENT <span>v0.3</span></span>
        <div className="sidebar-top">On this page</div>
        <nav aria-label="Page contents">{contents.map(([id, label], i) => <a key={id} className={activeSection === id ? 'current' : ''} href={`#${id}`} onClick={e => { e.preventDefault(); navigateTo(id); }}><span>{String(i + 1).padStart(2, '0')}</span>{label}</a>)}</nav>
        <div className="sidebar-divider" /><span className="eyebrow">THE KNOWLEDGE BASE</span>
        <External href={links.vfb}><Network size={15} />Virtual Fly Brain</External><External href={links.atlas}><BookOpen size={15} />Fly Cell Atlas</External><External href={links.model}><Code2 size={15} />Research model</External>
        <div className="sidebar-note"><div className="note-orbit"><img src="/flybrain.png" alt="" /></div><p>Small brain.<br /><em>Open possibilities.</em></p><span>A field guide to getting<br />a little further, every day.</span></div>
        <External href={links.x} className="sidebar-social"><span className="x-symbol">𝕏</span>@flybrainwiki</External>
      </aside>
      <main id="main-content">
        <section id="overview" className="article-masthead">
          <div className="breadcrumb"><a href="#overview">The encyclopedia</a><ChevronRight size={12} /><span>Agents</span><ChevronRight size={12} /><span>001</span></div>
          <div className="article-heading"><div><div className="title-label"><span className="experimental-tag"><span />AN OPEN EXPERIMENT</span><span>INSPIRED BY DROSOPHILA</span></div><h1>Fly Brain Agent<span className="title-period">.</span></h1><p className="article-origin">A small brain for your everyday.</p></div><button className="primary-button heading-task" onClick={() => { setDue(localDate()); setModal('new'); }}><Plus size={16} />Give it a task</button></div>
          <div className="article-toolbar"><div className="article-tabs" role="group" aria-label="Article view"><button aria-pressed={tab === 'article'} className={tab === 'article' ? 'active' : ''} onClick={() => setTab('article')}><BookOpen size={14} />The agent</button><button aria-pressed={tab === 'about'} className={tab === 'about' ? 'active' : ''} onClick={() => setTab('about')}>Project notes</button></div><div className="article-actions"><button aria-label="Copy link to this page" onClick={() => { void navigator.clipboard.writeText(window.location.href.split('#')[0]).then(() => setNotice('A link to the agent is on your clipboard.')).catch(() => setNotice('Copy the address from your browser to share this page.')); }}><Copy size={14} /><span>Share</span></button><button aria-label="Reading preferences" onClick={() => setModal('settings')}><Settings2 size={15} /><span>Appearance</span></button></div></div>
        </section>
        {tab === 'article' ? <>
          <div className="article-introduction"><p><strong>Nature made a remarkably capable little brain.</strong> We made it a place to think, plan, and follow through. Explore the connections, shape your next task, and leave a verifiable trace on <a href={links.chain} target="_blank" rel="noreferrer">Robinhood Chain</a>.</p><div className="introduction-note"><span className="vertical-rule" /><span>Open by nature.<br /><em>Yours to explore.</em></span><ArrowDown size={18} /></div></div>
          <AgentLab tasks={tasks} onCreate={title => { const task = planTask(title); setTasks(current => [task, ...current]); setSelected(task.circuit); return task; }} onOpen={setDetail} />
          <div className="article-columns">
            <div className="article-body">
              <section id="brain-explorer" className="explorer-section">
                <div className="section-heading"><div><span className="section-index">01 / EXPLORE</span><h2>Inside a small mind</h2></div><External href={links.vfb}>View the research atlas</External></div>
                <BrainViewer selected={selected} onSelect={setSelected} onUseCircuit={value => { setTaskCircuit(value); navigateTo('daily-tasks'); setTimeout(() => document.getElementById('task-prompt')?.focus({ preventScroll: true }), 450); }} />
                <div className="figure-caption"><span><b>FIG. 01</b> Procedural anatomy & a 192-neuron synthetic circuit.</span><button onClick={() => { setTab('about'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>How to read this<ArrowUpRight size={12} /></button></div>
              </section>
              <section className="agent-workspace" id="daily-tasks">
                <div className="section-heading"><div><span className="section-index">02 / PUT IT TO WORK</span><h2>A thought into action</h2></div><span className="workspace-date"><Clock3 size={13} />{new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date())}</span></div>
                <div className="workspace-summary"><div><span className="summary-ring" style={{ '--progress': `${tasks.length ? completeCount / tasks.length * 360 : 0}deg` } as React.CSSProperties}><Check size={15} /></span><span><strong>{tasks.length ? `${completeCount} of ${tasks.length} plans complete` : 'Every big idea starts small.'}</strong><small>{tasks.length ? 'Your progress, one step at a time.' : 'Start with a thought. Leave with a clear next step.'}</small></span></div><span className="local-status"><i />Local planner ready</span></div>
                <form className="task-composer" onSubmit={addTask}>
                  <label htmlFor="task-prompt"><span className="composer-icon"><Sparkles size={17} /></span>What would you like to move forward?</label>
                  <textarea id="task-prompt" placeholder="I’d like to research, plan, write, or learn…" maxLength={240} value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && prompt.trim()) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} required />
                  <div className="composer-footer"><span className="circuit-select"><Brain size={15} /><select aria-label="Planning circuit" value={taskCircuit} onChange={e => setTaskCircuit(e.target.value as Circuit | 'auto')}><option value="auto">Auto-select a circuit</option>{Object.entries(circuits).map(([key, c]) => <option value={key} key={key}>{c.label} circuit</option>)}</select></span><div><kbd>⌘ ↵</kbd><button className="primary-button" type="submit" disabled={!prompt.trim()}>Make a plan<ArrowRight size={15} /></button></div></div>
                </form>
                <div className="suggested-prompts"><span>A SPARK TO START</span>{[['Plan my day', 'planning'], ['Explore the fly connectome', 'research'], ['Draft a project update', 'writing']].map(([text, type]) => <button key={text} onClick={() => { setPrompt(text); setTaskCircuit(type as Circuit); document.getElementById('task-prompt')?.focus(); }}><i style={{ background: circuits[type as Circuit].color }} />{text}<ArrowUpRight size={11} /></button>)}</div>
                <div className="task-list-top"><div className="task-tabs" role="group" aria-label="Task filter"><button aria-pressed={taskFilter === 'today'} className={taskFilter === 'today' ? 'active' : ''} onClick={() => setTaskFilter('today')}>Today<span>{tasks.filter(t => t.due === dueDate).length}</span></button><button aria-pressed={taskFilter === 'all'} className={taskFilter === 'all' ? 'active' : ''} onClick={() => setTaskFilter('all')}>All tasks</button><button aria-pressed={taskFilter === 'completed'} className={taskFilter === 'completed' ? 'active' : ''} onClick={() => setTaskFilter('completed')}>Completed</button></div><button className="add-task-button" onClick={() => { setDue(localDate()); setModal('new'); }}><Plus size={14} />New task</button></div>
                <div className="task-list">{filteredTasks.length ? filteredTasks.map(task => <button className={`task-row ${isComplete(task) ? 'is-complete' : ''}`} style={{ '--task-color': circuits[task.circuit].color } as React.CSSProperties} key={task.id} onClick={() => { setDetail(task.id); setSelected(task.circuit); }}><span className="task-checkbox">{isComplete(task) ? <Check size={15} /> : <span />}</span><span className="task-row-text"><strong>{task.title}</strong><small><i />{circuits[task.circuit].label}<span>·</span>{task.checked.filter(Boolean).length} of {task.steps.length} steps{task.receipt && <><span>·</span><ShieldCheck size={11} />{task.receipt.status === 'confirmed' ? 'On-chain' : task.receipt.status === 'pending' ? 'Pending' : 'Receipt failed'}</>}</small></span><span className="task-mini-progress">{task.checked.map((done, i) => <i key={i} className={done ? 'done' : ''} />)}</span><span className="task-due">{task.due === dueDate ? 'Today' : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(task.due + 'T12:00:00'))}</span><ArrowUpRight size={16} /></button>) : <div className="task-empty"><div className="empty-orbit"><span /><ListTodo size={26} /><i /></div><h3>{taskFilter === 'completed' ? 'Progress will find a home here.' : taskFilter === 'today' && tasks.length ? 'A little breathing room today.' : 'Your next idea belongs here.'}</h3><p>{taskFilter === 'completed' ? 'Finish a plan and watch it become part of your record.' : 'A clear plan is often all it takes to get moving.'}</p><button onClick={() => document.getElementById('task-prompt')?.focus()}>Give your agent a thought<ArrowRight size={13} /></button></div>}</div>
                <div className="task-list-footer"><span><ShieldCheck size={13} />Saved on this device. Private by default.</span><button onClick={exportTasks} disabled={!tasks.length}><ArrowDown size={13} />Export your plans</button></div>
              </section>
              <section id="how-it-works"><div className="section-heading"><div><span className="section-index">03 / THE IDEA</span><h2>Small steps. Lasting signals.</h2></div></div><div className="how-grid"><div><span className="step-number">01</span><Brain size={23} /><h3>Give it a thought.</h3><p>A question, a goal, a half-formed idea. The local planner gives it a three-step shape.</p></div><div><span className="step-number">02</span><ListTodo size={23} /><h3>Find your focus.</h3><p>Make the steps your own. Set aside a little time, and check off the work as you go.</p></div><div><span className="step-number">03</span><ShieldCheck size={23} /><h3>Leave a trace.</h3><p>Keep your plan private. Optionally anchor a completion hash on Robinhood Chain.</p></div></div><div className="model-note"><Info size={17} /><p>A brain-inspired interface, with its workings in the open. Plans use local templates; the visual simulation is synthetic. <button onClick={() => { setTab('about'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Read the project notes<ArrowRight size={12} /></button></p></div></section>
              <section id="references"><div className="section-heading"><div><span className="section-index">04 / KEEP EXPLORING</span><h2>Standing on open knowledge</h2></div><BookOpen size={20} /></div><ol className="references">{[[links.vfb, 'Virtual Fly Brain', 'An atlas of Drosophila neurobiology, ready to explore.'], [links.model, 'Emulation of the Drosophila Fly Brain', 'Eon Systems · Connectome-based neural models and simulation backends.'], [links.atlas, 'Fly Brain Cell Atlas', 'Aerts Lab · A window into fly brain cell types and gene expression.'], [links.chain, 'Robinhood Chain', 'Ethereum-compatible infrastructure for verifiable on-chain records.']].map(([href, title, description], i) => <li key={href} id={`ref-${i + 1}`}><span className="reference-number">{String(i + 1).padStart(2, '0')}</span><div><External href={href}>{title}</External><p>{description}</p></div></li>)}</ol></section>
            </div>
            <aside className="article-infobox">
              <div className="infobox-main"><div className="dossier-heading"><span className="eyebrow">MEET YOUR AGENT</span><span>No. 001</span></div><div className="infobox-art"><span className="art-cross cross-tl">+</span><span className="art-cross cross-br">+</span><img src="/flybrain.png" alt="A fly brain made of multilingual encyclopedia puzzle pieces" /></div><div className="infobox-title">A curious little mind.<span>Inspired by <em>D. melanogaster</em></span></div><div className="agent-readiness"><i /><span>Ready for a new thought</span><Brain size={14} /></div><dl><div><dt>Specialty</dt><dd>Everyday progress</dd></div><div><dt>Circuits</dt><dd>4 ways to think</dd></div><div><dt>Task memory</dt><dd>This device<LockKeyhole size={11} /></dd></div><div><dt>Network</dt><dd><a href={links.chain} target="_blank" rel="noreferrer">Robinhood Chain<ArrowUpRight size={11} /></a></dd></div><div><dt>Environment</dt><dd><button className="testnet-badge" onClick={() => setModal('wallet')}>{chain === 'testnet' ? 'Testnet' : 'Mainnet'}<ChevronDown size={10} /></button></dd></div></dl><div className="infobox-section-label">A NOTE FROM NATURE</div><div className="bio-stats"><div><b>~138k</b><span>neurons</span></div><div><b>~5m</b><span>synapses</span></div></div><p className="bio-caption">A reference connectome with a remarkable capacity for behavior. <a href={links.model} target="_blank" rel="noreferrer">[2]</a></p><div className="infobox-footer"><Code2 size={14} /><a href={links.source} target="_blank" rel="noreferrer">Open source, always.</a><ArrowUpRight size={12} /></div></div>
              <div className="chain-card"><div className="chain-card-heading"><span className="chain-mark"><ArrowUpRight size={23} /></span><span className="eyebrow">A RECORD THAT LASTS</span></div><h3>A little proof<br />of your progress.</h3><p>Your ideas stay yours. A completion hash can live on Robinhood Chain.</p><button onClick={() => { setWalletError(''); setModal('wallet'); }}>{wallet ? 'Manage your wallet' : 'Connect your wallet'}<ArrowRight size={14} /></button><small>Optional · ETH required for fees</small></div>
              <div className="community-note"><span className="x-symbol">𝕏</span><h3>Follow the experiment.</h3><p>Little ideas, new connections, and the occasional fly fact.</p><External href={links.x}>@flybrainwiki</External></div>
            </aside>
          </div>
        </> : <section className="about-project"><span className="section-index">PROJECT NOTES / v0.3</span><h2>A field guide with its workings in the open.</h2><p>FlyBrain Wiki brings together a little neuroscience, the familiar language of an encyclopedia, and a workspace for everyday tasks. It’s an independent experiment, built to be explored.</p><div className="about-facts"><span><Code2 size={18} />Open source</span><span><LockKeyhole size={18} />Local task storage</span><span><ShieldCheck size={18} />Optional receipts</span></div><h3>Inside the little lab</h3><p>The agent lab pairs a working local task terminal with a compact neural view and an illustrated fly at an interactive keyboard. Typing and plan playback stimulate the synthetic network. The fly is an original generated illustration; its movement is a visual response to input. Pause and replay change the presentation only. They do not perform your task or create another plan.</p><h3>Inside the explorer</h3><p>The anatomical view is a procedural, fly-inspired diagram. The neural view shows a small 192-neuron leaky integrate-and-fire (LIF) network with synthetic connections. Select a region, adjust the stimulus, and send a pulse to observe simulated spike propagation. The activity trace reports spikes sampled from that simulation.</p><p>The camera, geometry, network, and region-to-task associations are illustrative. This is not a FlyWire reconstruction, a validated biological simulation, or the full upstream fly-brain emulation. The biological neuron and synapse counts in the agent profile describe the referenced connectome, not this display.</p><h3>A little structure for your day</h3><p>The planner uses deterministic keyword classification and editable three-step templates. It doesn’t run a language model or perform external work for you. Your plans and focus sessions are stored in this browser. Export your plans to preserve them beyond this device.</p><h3>A receipt, with your permission</h3><p>When you finish a plan, the app can hash its contents with SHA-256 and ask your wallet to publish that hash in a zero-value transaction to your own address on Robinhood Chain. Your title and plan remain on this device. The transaction, sender, fee, and timestamp are public.</p><p>A receipt timestamps a completion claim. It does not independently prove that the work was done. Keep an export of your plan to verify its hash later. Signing remains in your wallet; this site never handles your private key.</p><h3>Where the idea comes from</h3><p>The <a href={links.model} target="_blank" rel="noreferrer">research model</a> was cloned and reviewed at commit <code>a3db62f</code>. Its full simulation requires the upstream Python environment and connectome datasets. The <a href={links.vfb} target="_blank" rel="noreferrer">Virtual Fly Brain</a> and <a href={links.atlas} target="_blank" rel="noreferrer">Aerts Lab atlas</a> offer deeper scientific exploration.</p><p>Independent project; not affiliated with Wikipedia, Robinhood, Virtual Fly Brain, Eon Systems, or Aerts Lab.</p><button className="primary-button about-return" onClick={() => setTab('article')}>Back to the agent<ArrowRight size={15} /></button></section>}
        <footer className="article-footer"><div><div className="footer-brand-image"><img src="/flybrain.png" alt="" /></div><span><strong>FlyBrain Wiki</strong><small>Small brain. Open possibilities.</small></span></div><p>An experiment in everyday intelligence.</p><nav><External href={links.source}>GitHub</External><External href={links.x}>𝕏</External><a href="#overview" onClick={e => { e.preventDefault(); navigateTo('overview'); }}>Back to top<ArrowUpRight size={12} /></a></nav></footer>
      </main>
    </div>
    {notice && <div className="toast" role="status"><CheckCircle2 size={18} /><span>{notice}</span>{undoTask && <button className="undo-button" onClick={() => { setTasks(current => [undoTask, ...current]); setUndoTask(null); setNotice('Your task is back in the workspace.'); }}>Undo delete</button>}<button aria-label="Dismiss notification" onClick={() => { setNotice(''); setUndoTask(null); }}><X size={16} /></button></div>}
    {mobileMenu && <Modal title="Explore FlyBrain Wiki" onClose={() => setMobileMenu(false)}><nav className="mobile-navigation">{contents.map(([id, label], i) => <button key={id} onClick={() => { setMobileMenu(false); navigateTo(id); }}><span>0{i + 1}</span>{label}<ArrowRight size={15} /></button>)}<External href={links.x}>Follow @flybrainwiki</External></nav></Modal>}
    {modal === 'new' && <Modal title="Every idea starts somewhere." onClose={() => setModal(null)}><form onSubmit={addTask} className="modal-form"><p className="form-intro">Give your agent a thought. It will help you find a next step.</p><label htmlFor="new-task">What would you like to work on?</label><textarea id="new-task" value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={240} placeholder="A question, a goal, a half-formed idea…" required autoFocus /><div className="form-row"><div><label htmlFor="due-date">Make time for it</label><input id="due-date" type="date" value={due} onChange={e => setDue(e.target.value)} required /></div><div><label htmlFor="new-circuit">Thinking circuit</label><select id="new-circuit" value={taskCircuit} onChange={e => setTaskCircuit(e.target.value as Circuit | 'auto')}><option value="auto">Let the agent choose</option>{Object.entries(circuits).map(([key, c]) => <option key={key} value={key}>{c.label}</option>)}</select></div></div><div className="form-footer"><span><LockKeyhole size={13} />Saved on this device</span><button type="submit" className="primary-button" disabled={!prompt.trim()}>Make a plan<ArrowRight size={15} /></button></div></form></Modal>}
    {modal === 'wallet' && <Modal title={wallet ? 'Your connection to the chain.' : 'A record of your progress.'} onClose={() => setModal(null)}><div className="wallet-modal"><div className="wallet-illustration"><Wallet size={29} /><span /></div><p>Connect an Ethereum-compatible browser wallet to record completion hashes on Robinhood Chain.</p><label htmlFor="wallet-chain">Choose a network</label><select id="wallet-chain" value={chain} onChange={e => setChain(e.target.value as ChainKey)}><option value="testnet">Robinhood Chain Testnet · 46630</option><option value="mainnet">Robinhood Chain Mainnet · 4663</option></select>{wallet && <p className="wallet-address">{wallet}</p>}<div className="wallet-terms"><ShieldCheck size={18} /><span>Connecting is free. Receipts require your approval and a network fee in ETH. Your task text stays private.</span></div>{walletError && <p className="error-message" role="alert">{walletError}</p>}<button className="primary-button full-width" onClick={() => void connect()} disabled={busy}>{busy ? 'Check your wallet…' : wallet ? 'Connect to selected network' : 'Connect browser wallet'}<Wallet size={16} /></button>{wallet && <button className="text-button" onClick={() => { setWallet(''); setModal(null); }}>Disconnect from this page</button>}<div className="wallet-help"><External href="https://metamask.io/download/">Get a wallet</External><External href="https://faucet.testnet.chain.robinhood.com/">Get testnet ETH</External></div></div></Modal>}
    {modal === 'settings' && <Modal title="Make yourself at home." onClose={() => setModal(null)}><div className="settings-modal"><span className="eyebrow">READING PREFERENCES</span><h3>A little more room to read.</h3><p>Choose the text size that feels right.</p><div className="segmented">{(['standard', 'large'] as const).map(value => <button key={value} aria-pressed={size === value} className={size === value ? 'active' : ''} onClick={() => setSize(value)}><span style={{ fontSize: value === 'large' ? 22 : 17 }}>Aa</span>{value === 'large' ? 'Large' : 'Standard'}{size === value && <Check size={14} />}</button>)}</div><div className="settings-export"><div><h4>Keep a copy of your progress.</h4><p>Your plans live on this device. Export them for safekeeping.</p></div><button className="secondary-button" onClick={exportTasks} disabled={!tasks.length}><ArrowDown size={14} />Export {tasks.length} plans</button></div></div></Modal>}
    {activeTask && <Modal title="A thought, with a plan." onClose={() => setDetail(null)}><TaskDetail key={activeTask.id} task={activeTask} chain={chain} receiptBusy={receiptBusy === activeTask.id} networkIssue={receiptNetworkIssue} error={receiptError?.taskId === activeTask.id ? receiptError.message : undefined} onChange={updated => setTasks(current => current.map(t => t.id === updated.id ? updated : t))} onRecord={() => void anchor(activeTask)} onClose={() => setDetail(null)} onDelete={() => { setUndoTask(activeTask); setTasks(current => current.filter(t => t.id !== activeTask.id)); setDetail(null); setNotice('Task removed from this device.'); }} /></Modal>}
  </div>;
}
