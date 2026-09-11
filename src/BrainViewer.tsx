import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, RotateCcw, Maximize2, Pause, Play, Move } from 'lucide-react';
import { circuits, type Circuit } from './model';

type Point = { x: number; y: number; z: number; region: Circuit; brightness: number };
function seeded(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
function makeBrain() {
  const random = seeded(138642), points: Point[] = [], links: [number, number][] = [];
  const lobes: [number, number, number, number, number, number, Circuit][] = [
    [-1.55, .03, 0, .58, .80, .52, 'research'], [1.55, .03, 0, .58, .80, .52, 'research'],
    [-.57, .04, 0, .68, .78, .50, 'planning'], [.57, .04, 0, .68, .78, .50, 'planning'],
    [-.48, -.44, .30, .26, .38, .27, 'learning'], [.48, -.44, .30, .26, .38, .27, 'learning'],
    [-.39, .59, .17, .37, .37, .35, 'writing'], [.39, .59, .17, .37, .37, .35, 'writing'],
  ];
  lobes.forEach(([cx, cy, cz, rx, ry, rz, region], lobe) => {
    const count = lobe < 4 ? 1250 : 400;
    for (let i = 0; i < count; i++) {
      const theta = random() * Math.PI * 2, phi = Math.acos(2 * random() - 1), r = .65 + random() * .35;
      const x = cx + rx * Math.sin(phi) * Math.cos(theta) * r, y = cy + ry * Math.cos(phi) * r;
      points.push({ x, y, z: cz + rz * Math.sin(phi) * Math.sin(theta) * r, region, brightness: .2 + random() * .8 });
    }
  });
  // Synthetic branching fibers connect the lobes; these are not FlyWire coordinates.
  for (let branch = 0; branch < 150; branch++) {
    const side = branch % 2 ? 1 : -1, endX = side * (1.25 + random() * .64), endY = (random() - .5) * 1.15;
    const startX = side * random() * .6, startY = (random() - .5) * 1.1, z = (random() - .5) * .6;
    let previous = -1;
    for (let j = 0; j < 22; j++) {
      const t = j / 21;
      points.push({ x: startX + (endX - startX) * t, y: startY + (endY - startY) * t + Math.sin(t * Math.PI) * (random() - .5) * .13, z: z + Math.sin(t * Math.PI) * .17, region: branch % 3 === 0 ? 'learning' : 'research', brightness: .5 });
      if (previous >= 0) links.push([previous, points.length - 1]);
      previous = points.length - 1;
    }
  }
  return { points, links };
}
const brain = makeBrain();
export default function BrainViewer({ selected, onSelect }: { selected: Circuit | 'all'; onSelect: (value: Circuit | 'all') => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null), panelRef = useRef<HTMLDivElement>(null);
  const angle = useRef({ x: -.10, y: .12 }), drag = useRef<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1), [playing, setPlaying] = useState(true), [view, setView] = useState<'3d' | 'circuit'>('3d');
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || view !== '3d') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let width = 700, height = 340, frame = 0, tick = 0, last = 0;
    const observer = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width; height = entry.contentRect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr; canvas.height = height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    observer.observe(canvas);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function render(now: number) {
      frame = requestAnimationFrame(render);
      if (now - last < 32 || !ctx) return;
      last = now;
      if (playing && !reducedMotion) tick += .01;
      ctx.clearRect(0, 0, width, height);
      const yaw = angle.current.y + (playing && !drag.current && !reducedMotion ? Math.sin(tick * .25) * .14 : 0), pitch = angle.current.x;
      const scale = Math.min(width / 4.8, height / 2.85) * zoom;
      const projected = brain.points.map(p => {
        const x = p.x * Math.cos(yaw) + p.z * Math.sin(yaw), z = -p.x * Math.sin(yaw) + p.z * Math.cos(yaw);
        const y = p.y * Math.cos(pitch) - z * Math.sin(pitch), depth = p.y * Math.sin(pitch) + z * Math.cos(pitch);
        const perspective = 5 / (5 + depth);
        return { x: width / 2 + x * scale * perspective, y: height / 2 + y * scale * perspective, depth, perspective };
      });
      ctx.lineWidth = .55;
      brain.links.forEach(([a, b]) => {
        const pa = projected[a], pb = projected[b], p = brain.points[a];
        ctx.globalAlpha = selected === 'all' || selected === p.region ? .19 : .025;
        ctx.strokeStyle = circuits[p.region].color;
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      });
      projected.forEach((p, i) => {
        const source = brain.points[i], active = selected === 'all' || selected === source.region;
        const pulse = .72 + .28 * Math.sin(tick * 2.5 + source.x * 4 + source.y * 3);
        ctx.globalAlpha = active ? source.brightness * pulse * (.64 - p.depth * .15) : .05;
        ctx.fillStyle = circuits[source.region].color;
        ctx.beginPath(); ctx.arc(p.x, p.y, (.48 + source.brightness * .58) * p.perspective, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
    frame = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [zoom, selected, playing, view]);
  useEffect(() => {
    if (!expanded) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [expanded]);
  return <div className={`brain-viewer ${expanded ? 'viewer-expanded' : ''}`} ref={panelRef}>
    <div className="viewer-top"><div className="viewer-tabs"><button className={view === '3d' ? 'selected' : ''} onClick={() => setView('3d')}>3D brain</button><button className={view === 'circuit' ? 'selected' : ''} onClick={() => setView('circuit')}>Circuit map</button></div><span className="viewer-model"><span /> Illustrative model</span></div>
    <div className="brain-stage">
      <div className="specimen-label">DROSOPHILA MELANOGASTER<span>{selected === 'all' ? 'Whole brain · anterior view' : circuits[selected].region}</span></div>
      {view === '3d' ? <canvas ref={canvasRef} aria-label="Interactive schematic fly brain. Drag to rotate, or use the zoom and region controls." onPointerDown={e => { drag.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (drag.current) { angle.current.y += (e.clientX - drag.current.x) * .007; angle.current.x += (e.clientY - drag.current.y) * .007; drag.current = { x: e.clientX, y: e.clientY }; } }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} /> : <div className="circuit-map"><div className="map-input">Your daily task</div><span className="map-stem" /><div className="map-circuits">{Object.entries(circuits).map(([key, c]) => <button key={key} onClick={() => onSelect(key as Circuit)} style={{ '--circuit': c.color } as React.CSSProperties}><span /><strong>{c.region}</strong><small>{c.label}</small></button>)}</div><span className="map-stem" /><div className="map-output">Plan → Complete → Record on-chain</div><p>Functional metaphors, not biological task mappings.</p></div>}
      <div className="orientation"><span>Y</span><div /><small>Z</small><b>X</b></div>
      <div className="viewer-tools"><button aria-label="Zoom in" onClick={() => setZoom(z => Math.min(z + .15, 1.75))} disabled={view !== '3d' || zoom >= 1.75}><Plus size={15} /></button><button aria-label="Zoom out" onClick={() => setZoom(z => Math.max(z - .15, .55))} disabled={view !== '3d' || zoom <= .55}><Minus size={15} /></button><span /><button aria-label="Reset view" onClick={() => { angle.current = { x: -.10, y: .12 }; setZoom(1); }}><RotateCcw size={14} /></button><button aria-label={playing ? 'Pause animation' : 'Resume animation'} onClick={() => setPlaying(p => !p)}>{playing ? <Pause size={14} /> : <Play size={14} />}</button><button aria-label={expanded ? 'Close expanded viewer' : 'Expand viewer'} onClick={() => setExpanded(e => !e)}><Maximize2 size={14} /></button></div>
      <div className="viewer-hint"><Move size={12} /> Drag to rotate <span>·</span> Use + / − to zoom</div><span className="scale-bar">Relative scale <small>schematic</small></span>
    </div>
    <div className="region-legend"><button className={selected === 'all' ? 'active' : ''} onClick={() => onSelect('all')}>All regions</button>{Object.entries(circuits).map(([key, c]) => <button className={selected === key ? 'active' : ''} key={key} onClick={() => onSelect(key as Circuit)}><i style={{ background: c.color }} />{c.region}</button>)}</div>
  </div>;
}
