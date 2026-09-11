import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Activity, ArrowRight, Check, Expand, Layers3, Minus, Move, Network, Pause, Play, Plus, RotateCcw, X, Zap } from 'lucide-react';
import { circuits, type Circuit } from './model';
import { createNeuralState, NEURON_COUNT, randomGenerator, regionKeys, stepNeuralState } from './simulation';

type Point = { x: number; y: number; z: number; region: Circuit; brightness: number; neuron: number };
const landmarks: Record<Circuit, [number, number, number]> = { research: [-1.5, 0, .1], planning: [0, .06, .5], learning: [.55, -.55, .25], writing: [.42, .62, .35] };
function makeBrain() {
  const random = randomGenerator(783), points: Point[] = [], links: [number, number][] = [];
  const lobes: [number, number, number, number, number, number, Circuit][] = [
    [-1.5, .04, 0, .59, .76, .48, 'research'], [1.5, .04, 0, .59, .76, .48, 'research'],
    [-.56, -.02, .02, .69, .76, .50, 'planning'], [.56, -.02, .02, .69, .76, .50, 'planning'],
    [-.46, -.47, .25, .28, .36, .22, 'learning'], [.46, -.47, .25, .28, .36, .22, 'learning'],
    [-.36, .61, .20, .35, .29, .31, 'writing'], [.36, .61, .20, .35, .29, .31, 'writing'],
  ];
  function addPoint(x: number, y: number, z: number, region: Circuit, brightness: number, neuron?: number) {
    points.push({ x, y, z, region, brightness, neuron: neuron ?? regionKeys.indexOf(region) * 48 + Math.floor(random() * 48) });
    return points.length - 1;
  }
  lobes.forEach(([cx, cy, cz, rx, ry, rz, region], lobe) => {
    for (let i = 0; i < (lobe < 4 ? 1050 : 350); i++) {
      const theta = random() * Math.PI * 2, phi = Math.acos(2 * random() - 1), r = .58 + random() * .42;
      const folds = 1 + .035 * Math.sin(theta * 12) * Math.cos(phi * 10);
      addPoint(cx + rx * Math.sin(phi) * Math.cos(theta) * r * folds, cy + ry * Math.cos(phi) * r, cz + rz * Math.sin(phi) * Math.sin(theta) * r, region, .2 + random() * .8);
    }
  });
  // Branches are generated geometry. No scientific neuron coordinates are implied.
  for (let branch = 0; branch < 230; branch++) {
    const side = branch % 2 ? 1 : -1, region = regionKeys[branch % 4];
    const start = [side * random() * .65, (random() - .5) * 1.0, (random() - .5) * .65];
    const end = [side * (1.15 + random() * .73), (random() - .5) * 1.2, (random() - .5) * .65];
    const arc = (random() - .5) * .5, neuron = regionKeys.indexOf(region) * 48 + branch % 48;
    let previous = -1;
    for (let j = 0; j < 28; j++) {
      const t = j / 27;
      const index = addPoint(start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t + Math.sin(t * Math.PI) * arc, start[2] + (end[2] - start[2]) * t + Math.sin(t * Math.PI) * .12, region, .25 + random() * .4, neuron);
      if (previous >= 0) links.push([previous, index]);
      previous = index;
    }
  }
  return { points, links };
}
const brain = makeBrain();
export default function BrainViewer({ selected, onSelect, onUseCircuit, compact = false, externalPulse = 0, externalPaused = false }: { selected: Circuit | 'all'; onSelect: (value: Circuit | 'all') => void; onUseCircuit: (value: Circuit) => void; compact?: boolean; externalPulse?: number; externalPaused?: boolean }) {
  const stimulusId = useId();
  const canvasRef = useRef<HTMLCanvasElement>(null), dialogRef = useRef<HTMLDialogElement>(null);
  const engine = useRef(createNeuralState()), angle = useRef({ x: -.13, y: .14 });
  const drag = useRef<{ x: number; y: number; distance: number } | null>(null), stimulusEnds = useRef(0);
  const hitTargets = useRef<{ x: number; y: number; region: Circuit }[]>([]);
  const [zoom, setZoom] = useState(1), [playing, setPlaying] = useState(true), [mode, setMode] = useState<'anatomy' | 'network'>('anatomy');
  const [expanded, setExpanded] = useState(false), [intensity, setIntensity] = useState(65), [hovered, setHovered] = useState<Circuit | null>(null);
  const [camera, setCamera] = useState('Anterior'), [stimulating, setStimulating] = useState(false);
  const [telemetry, setTelemetry] = useState({ spikes: 0, time: 0, history: Array(64).fill(0) as number[] });
  const settings = useRef({ selected, zoom, playing, mode, intensity, hovered });
  settings.current = { selected, zoom, playing, mode, intensity, hovered };
  const color = selected === 'all' ? '#acd5c4' : circuits[selected].color;
  useEffect(() => {
    if (!compact) return;
    setPlaying(!externalPaused);
    if (externalPulse > 0 && !externalPaused) { stimulusEnds.current = engine.current.time + 120; setStimulating(true); }
  }, [compact, externalPulse, externalPaused]);
  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let width = 700, height = 400, frame = 0, last = 0, lastSample = 0, spikeCount = 0;
    let visible = true, drift = 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const resizer = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width; height = entry.contentRect.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * ratio; canvas.height = height * ratio; ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    });
    const visibility = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    resizer.observe(canvas); visibility.observe(canvas);
    const project = (x: number, y: number, z: number) => {
      const yaw = angle.current.y + (!reduced && settings.current.playing ? Math.sin(drift) * .035 : 0), pitch = angle.current.x;
      const xx = x * Math.cos(yaw) + z * Math.sin(yaw), zz = -x * Math.sin(yaw) + z * Math.cos(yaw);
      const yy = y * Math.cos(pitch) - zz * Math.sin(pitch), depth = y * Math.sin(pitch) + zz * Math.cos(pitch);
      const perspective = 5 / (5 + depth), scale = Math.min(width / 4.8, height / 2.55) * settings.current.zoom;
      return { x: width / 2 + xx * scale * perspective, y: height / 2 + yy * scale * perspective + 8, depth, perspective };
    };
    const render = (now: number) => {
      frame = requestAnimationFrame(render);
      if (now - last < 32 || !visible || document.hidden) return;
      last = now;
      const { selected: current, playing, mode, intensity, hovered } = settings.current, state = engine.current;
      if (playing) {
        for (let step = 0; step < 10; step++) spikeCount += stepNeuralState(state, current, intensity, state.time < stimulusEnds.current).length;
        if (!reduced) drift += .006;
      }
      if (playing && now - lastSample > 150) {
        setTelemetry(previous => ({ spikes: spikeCount, time: state.time, history: [...previous.history.slice(1), spikeCount] }));
        setStimulating(state.time < stimulusEnds.current);
        spikeCount = 0; lastSample = now;
      }
      ctx.clearRect(0, 0, width, height);
      // An unobtrusive spatial grid keeps the canvas grounded while the brain rotates.
      ctx.strokeStyle = '#dce3f9'; ctx.globalAlpha = .035; ctx.lineWidth = .5;
      for (let x = width / 2 % 36; x < width; x += 36) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
      for (let y = height / 2 % 36; y < height; y += 36) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
      const firing = (index: number) => Math.max(0, 1 - (state.time - state.lastSpike[index]) / 20);
      if (mode === 'anatomy') {
        const projected = brain.points.map(p => project(p.x, p.y, p.z));
        ctx.lineWidth = .65;
        brain.links.forEach(([a, b]) => {
          const source = brain.points[a], lit = firing(source.neuron), active = current === 'all' || current === source.region;
          ctx.globalAlpha = active ? .1 + lit * .45 : .025;
          ctx.strokeStyle = circuits[source.region].color;
          ctx.beginPath(); ctx.moveTo(projected[a].x, projected[a].y); ctx.lineTo(projected[b].x, projected[b].y); ctx.stroke();
        });
        projected.forEach((point, index) => {
          const p = brain.points[index], active = current === 'all' || current === p.region, lit = firing(p.neuron);
          ctx.globalAlpha = active ? Math.min(1, p.brightness * .72 + lit * .65) : .055;
          if (hovered === p.region) ctx.globalAlpha = Math.min(1, ctx.globalAlpha + .22);
          ctx.fillStyle = lit > .8 && !reduced ? '#fff9e9' : circuits[p.region].color;
          ctx.beginPath(); ctx.arc(point.x, point.y, (.48 + p.brightness * .48 + (reduced ? 0 : lit * .6)) * point.perspective, 0, Math.PI * 2); ctx.fill();
        });
        hitTargets.current = Object.entries(landmarks).map(([region, coords]) => ({ ...project(...coords), region: region as Circuit }));
        const rightOptic = project(1.5, 0, .1); hitTargets.current.push({ ...rightOptic, region: 'research' });
        hitTargets.current.push({ ...project(-.55, -.55, .25), region: 'learning' }, { ...project(-.42, .62, .35), region: 'writing' });
      } else {
        const positions = Array.from({ length: NEURON_COUNT }, (_, i) => {
          const group = Math.floor(i / 48), t = i % 48 / 48 * Math.PI * 2, ring = .4 + i % 3 * .07;
          const cx = [-1.12, -.38, .38, 1.12][group], cy = group % 2 ? .17 : -.17;
          return project(cx + Math.cos(t) * ring, cy + Math.sin(t) * ring, Math.sin(t * 3) * .1);
        });
        positions.forEach((p, i) => state.connections[i].forEach(edge => {
          const q = positions[edge.target], lit = firing(i);
          ctx.globalAlpha = .035 + lit * .35; ctx.strokeStyle = circuits[regionKeys[Math.floor(i / 48)]].color;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }));
        positions.forEach((p, i) => {
          const region = regionKeys[Math.floor(i / 48)], lit = firing(i);
          ctx.globalAlpha = current === 'all' || current === region ? .55 + lit * .45 : .12;
          ctx.fillStyle = circuits[region].color;
          ctx.beginPath(); ctx.arc(p.x, p.y, 2.2 + (reduced ? 0 : lit * 2), 0, Math.PI * 2); ctx.fill();
        });
        hitTargets.current = positions.map((p, i) => ({ ...p, region: regionKeys[Math.floor(i / 48)] }));
      }
      ctx.globalAlpha = 1;
    };
    frame = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(frame); resizer.disconnect(); visibility.disconnect(); };
  }, [expanded]);
  useEffect(() => { if (expanded) dialogRef.current?.showModal(); }, [expanded]);
  function hitTest(x: number, y: number) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const match = hitTargets.current.map(p => ({ ...p, distance: Math.hypot(p.x - (x - rect.left), p.y - (y - rect.top)) })).sort((a, b) => a.distance - b.distance)[0];
    return match && match.distance < (mode === 'network' ? 35 : 70) ? match.region : null;
  }
  function setPreset(value: string) {
    setCamera(value); setZoom(1);
    angle.current = value === 'Dorsal' ? { x: -1.25, y: .1 } : value === 'Lateral' ? { x: -.1, y: 1.22 } : { x: -.13, y: .14 };
  }
  function stimulate() { stimulusEnds.current = engine.current.time + 120; setPlaying(true); setStimulating(true); }
  function reset() { engine.current = createNeuralState(); stimulusEnds.current = 0; setStimulating(false); setTelemetry({ spikes: 0, time: 0, history: Array(64).fill(0) }); setPreset('Anterior'); }
  const graphMax = Math.max(12, ...telemetry.history);
  const graphPath = telemetry.history.map((value, i) => `${i === 0 ? 'M' : 'L'} ${i * 3} ${30 - value / graphMax * 26}`).join(' ');
  const content = <div className={`brain-viewer ${expanded ? 'is-expanded' : ''} ${compact ? 'is-compact' : ''}`} style={{ '--region-color': color } as CSSProperties}>
    <div className="viewer-top"><div className="viewer-tabs" role="group" aria-label="Brain view"><button aria-pressed={mode === 'anatomy'} className={mode === 'anatomy' ? 'selected' : ''} onClick={() => setMode('anatomy')}><Layers3 size={14} />Anatomy</button><button aria-pressed={mode === 'network'} className={mode === 'network' ? 'selected' : ''} onClick={() => setMode('network')}><Network size={14} />Neural circuit</button></div><div className="viewer-top-right"><span className="viewer-model">SYNTHETIC MODEL</span><button className="viewer-expand" aria-label={expanded ? 'Close expanded brain explorer' : 'Expand brain explorer'} onClick={() => setExpanded(e => !e)}>{expanded ? <X size={16} /> : <Expand size={15} />}</button></div></div>
    <div className="brain-stage">
      <div className="specimen-label"><span>SPECIMEN / 001</span><em>Drosophila melanogaster</em></div>
      <div className="camera-controls" aria-label="Camera angle">{['Anterior', 'Dorsal', 'Lateral'].map(value => <button key={value} aria-pressed={camera === value} className={camera === value ? 'active' : ''} onClick={() => setPreset(value)}>{value}</button>)}</div>
      <canvas ref={canvasRef} tabIndex={0} aria-label="Synthetic fly brain. Use arrow keys or drag to rotate; select a region below. Space sends a stimulus." onKeyDown={e => {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
        if (e.key === 'ArrowLeft') angle.current.y -= .15; if (e.key === 'ArrowRight') angle.current.y += .15;
        if (e.key === 'ArrowUp') angle.current.x -= .15; if (e.key === 'ArrowDown') angle.current.x += .15;
        if (e.key === ' ') stimulate();
      }} onPointerDown={e => { drag.current = { x: e.clientX, y: e.clientY, distance: 0 }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => {
        if (drag.current) {
          const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
          angle.current.y += dx * .006; angle.current.x += dy * .006;
          drag.current = { x: e.clientX, y: e.clientY, distance: drag.current.distance + Math.hypot(dx, dy) };
          if (drag.current.distance > 5) setCamera('Custom');
        } else setHovered(hitTest(e.clientX, e.clientY));
      }} onPointerUp={e => { if (drag.current && drag.current.distance < 6) { const region = hitTest(e.clientX, e.clientY); if (region) onSelect(region); } drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onPointerLeave={() => setHovered(null)} />
      {hovered && <div className="brain-tooltip"><i style={{ background: circuits[hovered].color }} />{circuits[hovered].region}<span>Click to isolate</span></div>}
      <div className="viewer-tools"><button aria-label="Zoom in" title="Zoom in" onClick={() => setZoom(z => Math.min(1.8, z + .15))} disabled={zoom >= 1.8}><Plus size={16} /></button><button aria-label="Zoom out" title="Zoom out" onClick={() => setZoom(z => Math.max(.55, z - .15))} disabled={zoom <= .55}><Minus size={16} /></button><span /><button aria-label="Reset brain and simulation" title="Reset brain and simulation" onClick={reset}><RotateCcw size={15} /></button><button aria-label={playing ? 'Pause simulation' : 'Resume simulation'} title={playing ? 'Pause simulation' : 'Resume simulation'} onClick={() => setPlaying(p => !p)}>{playing ? <Pause size={15} /> : <Play size={15} />}</button></div>
      <div className="axis-guide" aria-hidden="true"><span>Y</span><i /><b>X</b><small>Z</small></div>
      <div className="viewer-hint"><Move size={12} />Drag to rotate <span>·</span> Click a region to explore</div>
      <div className="model-id">LIF / 192<span>{playing ? 'SIMULATION RUNNING' : 'SIMULATION PAUSED'}</span></div>
    </div>
    <div className="simulation-console"><div className="stimulus-control"><label htmlFor={stimulusId}><Zap size={13} />Stimulus strength <b>{intensity}%</b></label><input id={stimulusId} type="range" min="0" max="100" step="5" value={intensity} onChange={e => setIntensity(Number(e.target.value))} /></div><button className={`stimulate-button ${stimulating ? 'stimulating' : ''}`} onClick={stimulate}><Zap size={14} />{stimulating ? 'Stimulating…' : 'Send stimulus'}</button><div className="activity-trace"><svg viewBox="0 0 192 34" aria-label={`${telemetry.spikes} spikes in the latest sample`} role="img"><path d={graphPath} fill="none" stroke="currentColor" strokeWidth="1.4" /></svg><span><Activity size={11} />{telemetry.spikes} spikes / sample</span></div></div>
    <div className="region-legend"><button aria-pressed={selected === 'all'} className={selected === 'all' ? 'active' : ''} onClick={() => onSelect('all')}><i className="all-regions" />Whole brain</button>{Object.entries(circuits).map(([key, c]) => <button aria-pressed={selected === key} className={selected === key ? 'active' : ''} key={key} onClick={() => onSelect(key as Circuit)}><i style={{ background: c.color }} />{c.region}{selected === key && <Check size={11} />}</button>)}</div>
    <div className={`region-insight ${selected !== 'all' ? 'has-selection' : ''}`}><div><span className="eyebrow">{selected === 'all' ? 'EXPLORE THE CONNECTIONS' : 'REGION IN FOCUS'}</span><h3>{selected === 'all' ? 'Every small action starts with a signal.' : circuits[selected].region}</h3><p>{selected === 'all' ? 'Select a region, send a stimulus, and watch activity travel through a small synthetic network.' : circuits[selected].description}</p></div>{selected === 'all' ? <span className="insight-number">04<small>regions to explore</small></span> : <button onClick={() => { setExpanded(false); onUseCircuit(selected); }}>Use for {circuits[selected].label.toLowerCase()}<ArrowRight size={14} /></button>}</div>
  </div>;
  return expanded ? createPortal(<dialog ref={dialogRef} className="brain-dialog" onCancel={() => setExpanded(false)}>{content}</dialog>, document.body) : content;
}
