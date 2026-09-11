import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, Check, ChevronRight, Circle, CornerDownLeft, Keyboard, Pause, Play, RotateCcw, Terminal, Zap } from 'lucide-react';
import BrainViewer from './BrainViewer';
import { circuits, type Circuit, type Task } from './model';
import './agent-lab.css';

type Props = {
  tasks: Task[];
  onCreate: (title: string) => Task;
  onOpen: (id: string) => void;
};
const examples = ['Plan my day', 'Research the fly connectome', 'Draft a project update'];
const keys = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

export default function AgentLab({ tasks, onCreate, onOpen }: Props) {
  const [input, setInput] = useState('Plan my day');
  const [result, setResult] = useState<Task | null>(null);
  const [reveal, setReveal] = useState(0), [paused, setPaused] = useState(false);
  const [region, setRegion] = useState<Circuit | 'all'>('all');
  const [pulse, setPulse] = useState(0), [lastKey, setLastKey] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const playback = result ? [
    `> flybrain plan ${JSON.stringify(result.title)}`,
    `Routing to ${circuits[result.circuit].region.toLowerCase()} / ${circuits[result.circuit].label.toLowerCase()}`,
    ...result.steps.map((step, i) => `${String(i + 1).padStart(2, '0')}  ${step}`),
    'Plan created. Your next move is ready.',
  ] : [];
  const transcript = playback.join('\n');
  const typing = !!result && reveal < transcript.length;
  const moving = (typing || !!lastKey) && !paused;
  const visibleLines = transcript.slice(0, reveal).split('\n');
  const currentTask = result && tasks.find(task => task.id === result.id);

  useEffect(() => {
    if (!typing || paused || document.hidden) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setReveal(transcript.length); return; }
    const timer = window.setTimeout(() => {
      setReveal(value => Math.min(value + 6, transcript.length));
      setLastKey(transcript[Math.min(reveal + 5, transcript.length - 1)]?.toUpperCase() ?? '');
      setPulse(value => value + 1);
    }, 48);
    return () => window.clearTimeout(timer);
  }, [typing, paused, reveal, transcript, pulse]);

  // Resume presentation after returning to the tab; no task execution depends on playback.
  useEffect(() => {
    const resume = () => { if (!document.hidden) setPulse(value => value + 1); };
    document.addEventListener('visibilitychange', resume);
    return () => document.removeEventListener('visibilitychange', resume);
  }, []);
  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [reveal]);
  useEffect(() => {
    const timer = window.setTimeout(() => setLastKey(''), 200);
    return () => window.clearTimeout(timer);
  }, [pulse]);

  function run(event: FormEvent) {
    event.preventDefault();
    if (typing) return;
    try {
      const task = onCreate(input);
      setResult(task); setRegion(task.circuit); setReveal(0); setPaused(false); setError('');
    } catch (error) { setError((error as Error).message); }
  }
  function pressKey(key: string) {
    setLastKey(key.toUpperCase()); setPulse(value => value + 1);
    setInput(value => key === '⌫' ? value.slice(0, -1) : (value + key.toLowerCase()).slice(0, 240));
    inputRef.current?.focus({ preventScroll: true });
  }

  return <section id="agent-lab" className="agent-lab-section">
    <div className="lab-section-heading"><div><span className="section-index">LIVE FROM THE LITTLE LAB</span><h2>The fly is on it<span>.</span></h2></div><p>A thought. A circuit. A next step.</p></div>
    <div className={`agent-lab ${moving ? 'is-typing' : ''}`}>
      <header className="lab-topbar"><div className="lab-name"><span className="lab-icon"><Zap size={15} /></span>FLYBRAIN<span>/ LAB</span></div><nav aria-label="Agent signal path"><span>THOUGHT</span><ChevronRight size={12} /><span>NEURONS</span><ChevronRight size={12} /><span>ACTION</span></nav><span className="lab-mode"><i />LOCAL SESSION</span></header>
      <div className="lab-panels">
        <div className="lab-terminal">
          <div className="lab-panel-label"><span><Terminal size={13} />AGENT / TASK TERMINAL</span><span>01</span></div>
          <div className="terminal-titlebar"><div><i /><i /><i /></div><span>fly@wiki: ~/everyday</span><span>LOCAL</span></div>
          <div className="terminal-output" ref={outputRef} tabIndex={0} aria-label="Task plan output">
            <div className="terminal-greeting"><span className="terminal-emblem">f<span>ly</span>_</span><p>Small brain. Useful work.<span>FlyBrain local planner · v0.3</span></p></div>
            <div className="terminal-boot"><p><Check size={12} />Four thinking circuits available</p><p><Check size={12} />{tasks.length} {tasks.length === 1 ? 'plan' : 'plans'} in this browser</p></div>
            {!result ? <div className="terminal-ready"><span>Ready when you are.</span><p>Give the fly something to plan.<br />It will turn your thought into three editable steps.</p><div className="terminal-idle-prompt"><span>fly@wiki</span> ~ <b>❯</b><i /></div></div> : <div className="terminal-transcript" aria-hidden={typing}>{visibleLines.map((line, i) => <p key={i} className={i === 0 ? 'command' : i === 1 ? 'route' : i === 5 ? 'success' : 'step'}>{line}{typing && i === visibleLines.length - 1 && <i className="terminal-cursor" />}</p>)}</div>}
            {result && !typing && <div className="terminal-result"><span><Check size={14} />{currentTask ? 'Ready in your daily workspace' : 'This plan has been removed'}</span>{currentTask && <button onClick={() => onOpen(result.id)}>Open your plan<ArrowRight size={14} /></button>}</div>}
          </div>
          <div className="terminal-status" role="status"><span><i />{typing ? paused ? 'PLAYBACK PAUSED' : 'WRITING YOUR PLAN' : result ? 'PLAN READY' : 'AWAITING A THOUGHT'}</span><span>{typing ? 'Plan created · revealing steps' : 'You do the work. The fly helps you plan.'}</span></div>
          <form className="lab-command-form" onSubmit={run}>
            <label htmlFor="lab-command">Give the fly a task</label>
            <div><span aria-hidden="true">❯</span><input ref={inputRef} id="lab-command" maxLength={240} required value={input} onChange={e => { setInput(e.target.value); setLastKey(e.target.value.at(-1)?.toUpperCase() ?? ''); setPulse(value => value + 1); }} placeholder="What would you like to work on?" autoComplete="off" /><button type="submit" disabled={!input.trim() || typing} aria-label="Create task plan"><CornerDownLeft size={18} /></button></div>
            {error && <p className="lab-error" role="alert">{error}</p>}
            <div className="lab-examples"><span>TRY</span>{examples.map(title => <button key={title} type="button" onClick={() => { setInput(title); inputRef.current?.focus({ preventScroll: true }); }}>{title}<ArrowUpRight size={11} /></button>)}</div>
          </form>
        </div>
        <div className="lab-instruments">
          <div className="lab-neural-panel"><div className="lab-panel-label"><span><Circle size={11} />CNS / ACTIVITY</span><span>02</span></div><BrainViewer compact selected={region} onSelect={setRegion} onUseCircuit={setRegion} externalPulse={pulse} externalPaused={paused} /><div className="lab-neural-caption"><span>192 synthetic neurons</span><span>{region === 'all' ? 'Whole circuit' : circuits[region].label}</span></div></div>
          <div className="lab-fly-panel"><div className="lab-panel-label"><span><Keyboard size={13} />FLY / INPUT</span><span>03</span></div><div className="fly-stage"><div className="specimen-coordinate">D. MELANOGASTER<br /><span>ILLUSTRATED SPECIMEN</span></div><div className="fly-shadow" /><img className="lab-fly" src="/fly-specimen.png" alt="An illustrated fruit fly with red compound eyes and translucent wings, poised over a keyboard" width="1254" height="1254" /><div className="fly-keyboard" aria-label="Interactive task keyboard">{keys.map((row, i) => <div key={row} className={`key-row key-row-${i}`}>{row.split('').map(key => <button type="button" key={key} className={lastKey === key ? 'pressed' : ''} onClick={() => pressKey(key)} aria-label={`Type ${key}`}>{key}</button>)}</div>)}<div className="key-row"><button className={`space-key ${lastKey === ' ' ? 'pressed' : ''}`} aria-label="Type space" onClick={() => pressKey(' ')}>space</button><button aria-label="Backspace" onClick={() => pressKey('⌫')}>⌫</button></div></div></div><div className="fly-keystroke"><span>KEY <b>{lastKey === ' ' ? 'SPACE' : lastKey || '—'}</b></span><span>{moving ? 'Input synchronized' : 'Click a key to type'}</span></div></div>
        </div>
      </div>
      <footer className="lab-footer"><span><i />{moving ? 'Signal in motion' : paused ? 'Visuals paused' : 'Local planner ready'}</span><p>Thought → local plan <span>·</span> Optional proof on Robinhood Chain</p><div><button disabled={!result} aria-label={paused ? 'Resume lab playback' : 'Pause lab playback'} onClick={() => setPaused(value => !value)}>{paused ? <Play size={14} /> : <Pause size={14} />}</button><button disabled={!result || typing} aria-label="Replay last plan without creating another task" onClick={() => { setReveal(0); setPaused(false); }}><RotateCcw size={14} /></button></div></footer>
    </div>
    <div className="lab-footnote"><p>Local planning · synthetic neural activity · illustrated fly</p><a href="https://x.com/supabase/status/2097999894632149229" target="_blank" rel="noreferrer">Inspired by the fly that deploys databases<ArrowUpRight size={12} /></a></div>
  </section>;
}
