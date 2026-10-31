// Pieces several visuals share: gates a request walks through, a ranked list, a verdict and small charts.
import React from 'react';
import { useReady } from './kit.jsx';

/** A request walking through gates, one lighting up after another. gates: [{ id, label, status, note }] */
export function GateTrack({ gates, runKey }) {
  return (
    <div className="gate-track" key={runKey}>
      {gates.map((g, i) => (
        <React.Fragment key={g.id}>
          {i > 0 && <div className={`gate-link gate-link-${gates[i - 1].status === 'pass' ? 'on' : 'off'}`} style={{ animationDelay: `${i * 260}ms` }} />}
          <div className={`gate gate-${g.status} pop-in`} style={{ animationDelay: `${i * 260}ms` }}>
            <span className="gate-icon" aria-hidden="true">{g.status === 'pass' ? '✓' : g.status === 'fail' ? '✗' : '·'}</span>
            <b>{g.label}</b>
            {g.note && <span className="gate-note">{g.note}</span>}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

export function Verdict({ tone = 'ok', children }) {
  return <div className={`verdict verdict-${tone} pop-in`}>{children}</div>;
}

export function ErrorBox({ children }) {
  return children ? <pre className="pitfall-symptom pop-in error-box">{children}</pre> : null;
}

/** Rows whose bars fill and whose order slides into place. rows: [{ id, name, sub, value, text, tone }] */
export function RankedBars({ rows, max, runKey }) {
  const ready = useReady(runKey);
  return (
    <ol className="ranked">
      {rows.map((r, i) => (
        <li key={r.id} className={`ranked-row pop-in ${i === 0 ? 'ranked-top' : ''}`} style={{ animationDelay: `${i * 90}ms` }}>
          <span className="ranked-pos">{i + 1}</span>
          <div className="ranked-body">
            <div className="ranked-head"><b>{r.name}</b><span className="ranked-score">{r.text}</span></div>
            <div className="bar-track"><div className={`bar-fill bar-${r.tone || (i === 0 ? 'ok' : 'accent')}`} style={{ width: ready ? `${Math.max(2, (r.value / (max || 1)) * 100)}%` : 0 }} /></div>
            {r.sub && <div className="ranked-sub">{r.sub}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** A line chart that draws itself. series: [{ points: [[x, y]], tone, label }]; hlines: [{ y, label, tone }] */
export function LineChart({ series, hlines = [], marks = [], xMax, yMax, xLabel, runKey }) {
  const W = 640;
  const H = 220;
  const L = 44;
  const B = 24;
  const x = (v) => L + (v / xMax) * (W - L - 8);
  const y = (v) => H - B - (Math.min(v, yMax) / yMax) * (H - B - 10);
  return (
    <svg className="line-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={series.map((s) => s.label).join(', ')} key={runKey}>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={L} x2={W - 8} y1={y(yMax * f)} y2={y(yMax * f)} className="grid-line" />
          <text x={L - 6} y={y(yMax * f) + 4} textAnchor="end" className="axis-text">{Math.round(yMax * f).toLocaleString()}</text>
        </g>
      ))}
      <text x={W - 8} y={H - 6} textAnchor="end" className="axis-text">{xLabel}</text>
      {hlines.map((h) => (
        <g key={h.label}>
          <line x1={L} x2={W - 8} y1={y(h.y)} y2={y(h.y)} className={`chart-hline chart-${h.tone}`} />
          <text x={L + 6} y={y(h.y) - 5} className={`chart-label chart-${h.tone}`}>{h.label}</text>
        </g>
      ))}
      {series.map((s) => (
        <path key={s.label} pathLength="1" className={`chart-line chart-${s.tone}`} d={s.points.map(([a, b], i) => `${i ? 'L' : 'M'} ${x(a).toFixed(1)} ${y(b).toFixed(1)}`).join(' ')} />
      ))}
      {marks.map((m, i) => (
        <g key={i} className="pop-in" style={{ animationDelay: `${600 + i * 200}ms` }}>
          <line x1={x(m.x)} x2={x(m.x)} y1={10} y2={H - B} className={`chart-mark chart-${m.tone}`} />
          <text x={Math.min(x(m.x) + 4, W - 110)} y={18 + (i % 3) * 13} className={`chart-label chart-${m.tone}`}>{m.label}</text>
        </g>
      ))}
    </svg>
  );
}

/** Columns that rise. columns: [{ parts: [{ value, tone }], title }] */
export function StackColumns({ columns, max, height = 170, runKey }) {
  return (
    <div className="stack-columns" style={{ height }} key={runKey}>
      {columns.map((c, i) => (
        <div key={i} className="stack-col" title={c.title}>
          {c.parts.filter((p) => p.value > 0).map((p, j) => (
            <div key={j} className={`stack-part stack-${p.tone}`} style={{ height: `${(p.value / max) * 100}%`, animationDelay: `${i * 22}ms` }} />
          ))}
        </div>
      ))}
    </div>
  );
}
