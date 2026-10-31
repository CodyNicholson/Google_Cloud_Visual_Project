import React, { useEffect, useRef, useState } from 'react';

export const TONE = {
  ok: 'var(--ok)',
  bad: 'var(--bad)',
  warn: 'var(--warn)',
  accent: 'var(--accent)',
  store: 'var(--store)',
  muted: 'var(--border)',
  api: 'var(--api)',
};

/** true one frame after mount (or after `key` changes), so CSS transitions animate from zero. */
export function useReady(key) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
    return () => cancelAnimationFrame(id);
  }, [key]);
  return ready;
}

/** A donut whose segments sweep in. segments: [{ value, color, label }] */
export function Donut({ segments, size = 150, thickness = 22, label, sub, runKey }) {
  const ready = useReady(runKey);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((n, s) => n + s.value, 0) || 1;
  let offset = 0;
  return (
    <svg className="donut" viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={label}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--panel-2)" strokeWidth={thickness} />
      {segments.map((s, i) => {
        const len = (s.value / total) * c;
        const el = (
          <circle key={i} className="donut-seg" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={thickness}
            strokeDasharray={`${ready ? Math.max(0, len - 2) : 0} ${c}`} strokeDashoffset={-offset}
            style={{ transitionDelay: `${i * 120}ms` }} transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <title>{s.label}</title>
          </circle>
        );
        offset += len;
        return el;
      })}
      {label && <text x="50%" y="48%" textAnchor="middle" className="donut-label">{label}</text>}
      {sub && <text x="50%" y="62%" textAnchor="middle" className="donut-sub">{sub}</text>}
    </svg>
  );
}

export function Legend({ items }) {
  return (
    <div className="legend">
      {items.map((it) => (
        <span key={it.label}><span className="swatch" style={{ background: it.color }} />{it.label}</span>
      ))}
    </div>
  );
}

/** Lanes of blocks on a shared time axis. lanes: [{ label, segments: [{ start, end, tone, title, text }] }] */
export function Gantt({ lanes, max, unit = 'ms', ticks = 5, runKey }) {
  const ready = useReady(runKey);
  const m = max || Math.max(1, ...lanes.flatMap((l) => l.segments.map((s) => s.end)));
  return (
    <div className="gantt">
      {lanes.map((lane, li) => (
        <div key={li} className="gantt-lane">
          <div className="gantt-label">{lane.label}</div>
          <div className="gantt-track">
            {lane.segments.map((s, si) => (
              <div key={si} className={`gantt-seg ${ready ? 'gantt-in' : ''}`} title={s.title}
                style={{ left: `${(s.start / m) * 100}%`, width: `${Math.max(0.6, ((s.end - s.start) / m) * 100)}%`, background: TONE[s.tone] || s.tone, transitionDelay: `${Math.min(li * 50 + si * 25, 1500)}ms` }}>
                {s.text}
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="gantt-axis">
        {Array.from({ length: ticks + 1 }, (_, i) => <span key={i}>{Math.round((m * i) / ticks).toLocaleString()} {i === ticks ? unit : ''}</span>)}
      </div>
    </div>
  );
}

/** Events on a horizontal axis that pop in one after another. events: [{ t, label, tone }] */
export function Timeline({ events, max, unit = 's', runKey }) {
  const m = max || Math.max(1, ...events.map((e) => e.t)) * 1.08;
  return (
    <div className="timeline" key={runKey}>
      <div className="timeline-axis" />
      {events.map((e, i) => (
        <div key={i} className={`timeline-event pop-in ${i % 2 ? 'timeline-low' : ''} ${e.t / m > 0.55 ? 'timeline-right' : ''}`} style={{ left: `${(e.t / m) * 100}%`, animationDelay: `${i * 260}ms` }}>
          <span className="timeline-dot" style={{ background: TONE[e.tone] || TONE.accent }} />
          <span className="timeline-text"><b>{unit === 'day' ? `day ${e.t}` : `t+${e.t.toLocaleString()}${unit}`}</b> {e.label}</span>
        </div>
      ))}
    </div>
  );
}

/** A ring that fills to `pct` (0..1). */
export function Ring({ pct, size = 86, color = 'var(--accent)', label, sub, runKey }) {
  const ready = useReady(runKey);
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--panel-2)" strokeWidth="8" />
        <circle className="donut-seg" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${ready ? Math.max(0, Math.min(1, pct)) * c : 0} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        <text x="50%" y="55%" textAnchor="middle" className="ring-text">{label}</text>
      </svg>
      {sub && <div className="ring-sub">{sub}</div>}
    </div>
  );
}

function Mover({ path, color, dur = 1.4, delay = 0 }) {
  const ref = useRef(null);
  useEffect(() => {
    const t = setTimeout(() => ref.current?.beginElement?.(), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <circle r="5" fill={color}>
      <animateMotion ref={ref} dur={`${dur}s`} begin="indefinite" repeatCount="indefinite" path={path} />
    </circle>
  );
}

/** Boxes and arrows with packets travelling along `animated` edges. Coordinates in a 640-wide box. */
export function Graph({ nodes, edges, height = 220, runKey }) {
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const W = 120;
  const H = 46;
  return (
    <svg className="graph" viewBox={`0 0 640 ${height}`} role="img" aria-label="Architecture diagram" key={runKey}>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--muted)" />
        </marker>
      </defs>
      {edges.map((e, i) => {
        const a = byId[e.from];
        const b = byId[e.to];
        const x1 = a.x + (b.x > a.x ? W / 2 : b.x < a.x ? -W / 2 : 0);
        const y1 = a.y + (b.y > a.y + 10 ? H / 2 : b.y < a.y - 10 ? -H / 2 : 0);
        const x2 = b.x + (a.x > b.x ? W / 2 : a.x < b.x ? -W / 2 : 0);
        const y2 = b.y + (a.y > b.y + 10 ? H / 2 : a.y < b.y - 10 ? -H / 2 : 0);
        const path = `M ${x1} ${y1} L ${x2} ${y2}`;
        return (
          <g key={i}>
            <path d={path} className={`graph-edge ${e.tone ? `graph-edge-${e.tone}` : ''} ${e.dashed ? 'graph-edge-dashed' : ''}`} markerEnd="url(#arrow)" />
            {e.label && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} textAnchor="middle" className="graph-edge-label">{e.label}</text>}
            {e.animated && <Mover path={path} color={TONE[e.tone] || 'var(--accent)'} delay={i * 250} />}
          </g>
        );
      })}
      {nodes.map((n, i) => (
        // The CSS pop-in animation sets `transform`, which would override the SVG transform attribute,
        // so it runs on an inner group
        <g key={n.id} transform={`translate(${n.x - W / 2}, ${n.y - H / 2})`}>
          <g className="graph-node pop-in" style={{ animationDelay: `${i * 80}ms` }}>
            <rect width={W} height={H} rx="10" style={{ stroke: TONE[n.tone] || n.color || 'var(--border)' }} />
            <text x={W / 2} y={n.sub ? 20 : 28} textAnchor="middle" className="graph-label">{n.label}</text>
            {n.sub && <text x={W / 2} y={36} textAnchor="middle" className="graph-sub">{n.sub}</text>}
          </g>
        </g>
      ))}
    </svg>
  );
}

/** A grid of labelled cells; cells: [{ key, text, tone, title }] */
export function Cells({ cells, columns = 10, small = false }) {
  return (
    <div className={`cells ${small ? 'cells-small' : ''}`} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {cells.map((c, i) => (
        <div key={c.key ?? i} className={`cell cell-${c.tone || 'muted'} pop-in`} title={c.title} style={{ animationDelay: `${Math.min(i * 18, 1200)}ms` }}>{c.text}</div>
      ))}
    </div>
  );
}
