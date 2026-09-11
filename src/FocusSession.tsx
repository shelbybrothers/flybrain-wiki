import { useEffect, useState } from 'react';
import { Pause, Play, RotateCcw, Timer } from 'lucide-react';
import { pauseFocus, readFocus, secondsRemaining, startFocus } from './focus';

export default function FocusSession({ taskId }: { taskId: string }) {
  const key = `flybrain.focus.${taskId}`;
  const [state, setState] = useState(() => { try { return readFocus(localStorage.getItem(key)); } catch { return readFocus(null); } });
  const [now, setNow] = useState(Date.now());
  const remaining = secondsRemaining(state, now);
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* Timer still works in this tab. */ } }, [key, state]);
  useEffect(() => {
    if (state.endsAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [state.endsAt]);
  useEffect(() => { if (remaining === 0 && state.endsAt !== null) setState(s => ({ ...s, remaining: 0, endsAt: null })); }, [remaining, state.endsAt]);
  const running = state.endsAt !== null;
  return <div className={`focus-session ${running ? 'is-focusing' : ''}`}>
    <div className="focus-copy"><span className="eyebrow"><Timer size={13} /> FOCUS SESSION</span><strong>{remaining === 0 ? 'Time for a small break.' : running ? 'One task. A little attention.' : 'Make a little room for focus.'}</strong><div className="focus-presets">{[5, 15, 25].map(minutes => <button key={minutes} disabled={running} className={state.duration === minutes * 60 ? 'active' : ''} onClick={() => setState({ duration: minutes * 60, remaining: minutes * 60, endsAt: null })}>{minutes} min</button>)}</div></div>
    <div className="focus-clock"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="45" /><circle cx="50" cy="50" r="45" strokeDasharray="282.74" strokeDashoffset={282.74 * (1 - remaining / state.duration)} /></svg><span role="timer" aria-label={`${Math.floor(remaining / 60)} minutes ${remaining % 60} seconds remaining`}>{String(Math.floor(remaining / 60)).padStart(2, '0')}<i>:</i>{String(remaining % 60).padStart(2, '0')}</span></div>
    <div className="focus-actions"><button aria-label={running ? 'Pause focus session' : remaining === 0 ? 'Restart focus session' : 'Start focus session'} className="focus-play" onClick={() => { const time = Date.now(); setNow(time); setState(s => running ? pauseFocus(s, time) : startFocus(s, time)); }}>{running ? <Pause size={16} /> : remaining === 0 ? <RotateCcw size={16} /> : <Play size={16} />}</button><button aria-label="Reset focus session" onClick={() => setState(s => ({ duration: s.duration, remaining: s.duration, endsAt: null }))}><RotateCcw size={14} /></button></div>
    {remaining === 0 && <span role="status" className="sr-only">Your focus session is complete.</span>}
  </div>;
}
