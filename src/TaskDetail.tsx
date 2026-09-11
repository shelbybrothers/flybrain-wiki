import { useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronDown, Clock3, Edit3, Info, LockKeyhole, ShieldCheck, Trash2 } from 'lucide-react';
import FocusSession from './FocusSession';
import { circuits, isComplete, isValidTaskDate, type Task } from './model';
import { chains, type ChainKey } from './chain';

type Props = {
  task: Task;
  chain: ChainKey;
  receiptBusy: boolean;
  networkIssue: boolean;
  error?: string;
  onChange: (task: Task) => void;
  onRecord: () => void;
  onDelete: () => void;
  onClose: () => void;
};
export default function TaskDetail({ task, chain, receiptBusy, networkIssue, error, onChange, onRecord, onDelete, onClose }: Props) {
  const [editing, setEditing] = useState(false), [title, setTitle] = useState(task.title), [due, setDue] = useState(task.due);
  const [editingStep, setEditingStep] = useState<number | null>(null), [stepDraft, setStepDraft] = useState('');
  const [focusOpen, setFocusOpen] = useState(false);
  const locked = receiptBusy || (!!task.receipt && task.receipt.status !== 'failed');
  const done = task.checked.filter(Boolean).length, complete = isComplete(task), circuit = circuits[task.circuit];
  function saveTitle() {
    if (!title.trim() || !isValidTaskDate(due)) return;
    onChange({ ...task, title: title.trim(), due }); setEditing(false);
  }
  function saveStep(index: number) {
    if (!stepDraft.trim()) return;
    onChange({ ...task, steps: task.steps.map((step, i) => i === index ? stepDraft.trim() : step) }); setEditingStep(null);
  }
  return <div className="task-detail" style={{ '--task-color': circuit.color } as React.CSSProperties}>
    <div className="detail-meta"><span><i />{circuit.label} circuit</span><span><Clock3 size={13} />{task.due}</span>{locked && <span><LockKeyhole size={12} />{receiptBusy ? 'Signing' : 'Recorded plan'}</span>}</div>
    {editing ? <form className="edit-task-form" onSubmit={e => { e.preventDefault(); saveTitle(); }}><label htmlFor="edit-title">Task title</label><input id="edit-title" autoFocus value={title} onChange={e => setTitle(e.target.value)} required maxLength={240} /><label htmlFor="edit-due">Planned date</label><input id="edit-due" type="date" value={due} onChange={e => setDue(e.target.value)} required /><div><button type="button" className="text-button" onClick={() => { setTitle(task.title); setDue(task.due); setEditing(false); }}>Cancel</button><button className="primary-button" type="submit" disabled={!title.trim()}>Save changes<Check size={14} /></button></div></form> : <div className="detail-title"><h3>{task.title}</h3>{!locked && <button aria-label="Edit task title and date" title="Edit task" className="icon-button" onClick={() => setEditing(true)}><Edit3 size={16} /></button>}</div>}
    <div className="detail-summary"><p>{complete ? 'A small intention, followed through.' : 'One clear step at a time. Make this plan your own.'}</p><span>{done}<small> / {task.steps.length}</small></span></div>
    <div className="completion-track"><i style={{ width: `${done / task.steps.length * 100}%` }} /></div>
    <div className="plan-steps">{task.steps.map((step, index) => <div className={`plan-step ${task.checked[index] ? 'is-complete' : ''}`} key={index}>
      <label className="step-toggle" title={task.checked[index] ? 'Mark step incomplete' : 'Complete step'}><input type="checkbox" aria-label={`Complete step ${index + 1}`} checked={task.checked[index]} disabled={locked || editingStep === index} onChange={() => onChange({ ...task, checked: task.checked.map((value, i) => i === index ? !value : value) })} /><span>{task.checked[index] ? <Check size={14} /> : String(index + 1).padStart(2, '0')}</span></label>
      <div className="step-content"><span className="step-caption">{task.checked[index] ? 'COMPLETED' : ['SET THE DIRECTION', 'DO THE WORK', 'BRING IT TOGETHER'][index] || 'NEXT STEP'}</span>{editingStep === index ? <form onSubmit={e => { e.preventDefault(); saveStep(index); }}><textarea aria-label={`Edit step ${index + 1}`} autoFocus value={stepDraft} onChange={e => setStepDraft(e.target.value)} maxLength={1000} rows={3} required /><div><button type="button" className="text-button" onClick={() => setEditingStep(null)}>Cancel</button><button className="secondary-button" disabled={!stepDraft.trim()}><Check size={13} />Save step</button></div></form> : <p>{step}</p>}</div>
      {!locked && !task.checked[index] && editingStep !== index && <button className="edit-step icon-button" aria-label={`Edit step ${index + 1}`} onClick={() => { setEditingStep(index); setStepDraft(step); }}><Edit3 size={14} /></button>}
    </div>)}</div>
    {!complete && <><button className="focus-toggle" aria-expanded={focusOpen} onClick={() => setFocusOpen(open => !open)}><Clock3 size={15} /><span>Make time to focus</span><span>5 · 15 · 25 min</span><ChevronDown size={14} className={focusOpen ? 'rotated' : ''} /></button>{focusOpen && <FocusSession key={task.id} taskId={task.id} />}</>}
    {task.receipt ? <div className={`receipt-box receipt-${task.receipt.status}`}><ShieldCheck size={23} /><div><span className="eyebrow">ON-CHAIN RECEIPT</span><strong>{task.receipt.status === 'confirmed' ? 'Your progress has a permanent record.' : task.receipt.status === 'pending' ? 'Waiting for network confirmation.' : 'The transaction did not succeed.'}</strong><p>{task.receipt.chainId === 46630 ? 'Robinhood Chain Testnet' : 'Robinhood Chain'} · SHA-256</p>{task.receipt.status === 'pending' && networkIssue && <p>The network is temporarily unreachable. We’ll retry automatically.</p>}<a href={`${chains[task.receipt.chainId === 46630 ? 'testnet' : 'mainnet'].explorer}/tx/${task.receipt.hash}`} target="_blank" rel="noreferrer">View transaction<ArrowUpRight size={13} /></a>{task.receipt.status === 'failed' && <button className="secondary-button" onClick={onRecord} disabled={receiptBusy || !complete}>Try again<ArrowRight size={13} /></button>}</div></div> : complete ? <div className="record-panel"><div className="complete-seal"><CheckCircle2 size={27} /></div><span className="eyebrow">A LITTLE PROGRESS, MADE.</span><h4>Give your work a place in the record.</h4><p>Publish a completion hash on {chains[chain].name}. The plan stays private on your device.</p><button className="primary-button" onClick={onRecord} disabled={receiptBusy || editing || editingStep !== null}>{receiptBusy ? 'Check your wallet…' : 'Record completion'}<ShieldCheck size={15} /></button><small>Optional · Your wallet approves the network fee</small></div> : <p className="detail-note"><Info size={14} />Finish your steps to unlock an optional on-chain receipt.</p>}
    {error && <p className="transaction-error" role="alert"><Info size={16} />{error}</p>}
    <div className="task-detail-footer"><button className="delete-task" disabled={receiptBusy} onClick={onDelete}><Trash2 size={14} />Delete task</button><button className="secondary-button" onClick={onClose}>Back to workspace<ArrowRight size={14} /></button></div>
  </div>;
}
