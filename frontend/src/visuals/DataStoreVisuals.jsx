import React from 'react';
import { Bar, Empty, Stat } from '../components/common.jsx';
import { Legend, Ring, useReady } from './kit.jsx';
import { ErrorBox, GateTrack, Verdict } from './shared.jsx';
import { usd } from '../lab/lab.js';

export function StorageClassesVisual({ result }) {
  const ready = useReady(result?.receivedAt);
  if (!result) return <Empty>Press “Compare classes”.</Empty>;
  const d = result.data;
  return (
    <div>
      <div className="stat-row">
        <Stat label="cheapest here" value={d.best} tone="ok" />
        <Stat label="size and retention" value={`${d.sizeGb.toLocaleString()} GB, ${d.days} d`} />
        <Stat label="full reads a month" value={d.readsPerMonth} />
      </div>
      <div className="cost-rows">
        {d.costs.map((c) => (
          <div key={c.id} className={`cost-row ${c.id === d.best ? 'cost-best' : ''}`}>
            <div className="cost-name"><b>{c.id}</b><span className="muted">{c.minDays ? `${c.minDays}-day minimum` : 'no minimum'}</span></div>
            <div className="cost-track">
              {[['storage', c.storage], ['retrieval', c.retrieval], ['early', c.earlyDelete]].map(([k, v]) => (
                <div key={k} className={`cost-seg cost-${k}`} style={{ width: ready ? `${(v / d.max) * 100}%` : 0 }} title={`${k}: ${usd(v)}`} />
              ))}
            </div>
            <b className="cost-total">{usd(c.total)}</b>
          </div>
        ))}
      </div>
      <Legend items={[{ color: 'var(--store)', label: 'storage' }, { color: 'var(--warn)', label: 'retrieval' }, { color: 'var(--bad)', label: 'early deletion' }]} />
    </div>
  );
}

export function StorageAccessVisual({ result }) {
  if (!result) return <Empty>Press “Try the read”.</Empty>;
  const d = result.data;
  return (
    <div>
      <div className="access-scene" key={result.receivedAt}>
        <div className="access-actor pop-in"><span className="access-emoji" aria-hidden="true">{d.principal.startsWith('anon') ? '?' : d.principal.startsWith('app') ? '⚙' : '☺'}</span>{d.principal}</div>
        <div className={`access-wire ${d.allowed ? 'access-ok' : 'access-bad'}`}><span className="access-packet" /></div>
        <div className="access-bucket pop-in"><span className="access-emoji" aria-hidden="true">▤</span>gs://acme-invoices<small>{d.pap ? 'public access blocked' : 'public access possible'}</small></div>
      </div>
      <GateTrack runKey={result.receivedAt} gates={d.trace.map((t, i) => ({ id: String(i), label: t.step, note: t.note, status: t.result === 'blocked' ? 'fail' : 'pass' }))} />
      <Verdict tone={d.allowed ? 'ok' : 'bad'}>{d.allowed ? 'Object returned.' : 'Refused.'}</Verdict>
      <ErrorBox>{d.error}</ErrorBox>
    </div>
  );
}

export function CloudSqlVisual({ result }) {
  if (!result) return <Empty>Press “Do the sums”.</Empty>;
  const d = result.data;
  const shown = Math.min(d.maxInstances, 24);
  const pct = d.wanted / d.maxConnections;
  return (
    <div>
      <div className="sql-scene" key={result.receivedAt}>
        <div className="sql-instances">
          {Array.from({ length: shown }, (_, i) => <span key={i} className="sql-inst pop-in" style={{ animationDelay: `${i * 35}ms` }}>{d.perInstance}</span>)}
          {d.maxInstances > shown && <span className="muted">+{d.maxInstances - shown} more</span>}
          <div className="muted sql-caption">{d.maxInstances} Cloud Run instances, {d.perInstance} connections each</div>
        </div>
        <div className={`sql-arrow ${d.ok ? 'sql-ok' : 'sql-bad'}`} aria-hidden="true" />
        <Ring runKey={result.receivedAt} pct={Math.min(1, pct)} color={d.ok ? 'var(--ok)' : 'var(--bad)'} size={120} label={`${Math.round(pct * 100)}%`} sub={`${d.wanted} of ${d.maxConnections} connections`} />
      </div>
      <Verdict tone={d.ok ? 'ok' : 'bad'}>{d.ok ? `Fits. Up to ${d.safeMax} instances would fit with this pool.` : `Too many. At ${d.maxInstances} instances the pool must be ${Math.max(1, d.safePool)} or fewer.`}</Verdict>
      <ErrorBox>{d.error}</ErrorBox>
    </div>
  );
}

export function HotspotsVisual({ result }) {
  if (!result) return <Empty>Press “Insert the rows”.</Empty>;
  const d = result.data;
  return (
    <div>
      <div className="stat-row">
        <Stat label="busiest split" value={`${Math.round(d.share * 100)}%`} tone={d.good ? 'ok' : 'bad'} hint={`even would be ${Math.round(100 / d.splits)}%`} />
        <Stat label="rows" value={d.writes.toLocaleString()} />
      </div>
      <div className="split-grid" key={result.receivedAt}>
        {d.counts.map((c, i) => {
          const h = c / d.hottest;
          return (
            <div key={i} className="split">
              <div className="split-bar-wrap"><div className={`split-bar ${h > 0.9 && !d.good ? 'split-hot' : 'split-ok'}`} style={{ height: `${Math.max(1, h * 100)}%`, animationDelay: `${i * 70}ms` }} /></div>
              <small>{c.toLocaleString()}</small>
              <span className="muted">split {i + 1}</span>
            </div>
          );
        })}
      </div>
      <p className="muted">Key space from low to high, left to right. Each split is one server’s range.</p>
    </div>
  );
}

export function FirestoreVisual({ result }) {
  if (!result) return <Empty>Press “Plan the ramp”.</Empty>;
  const d = result.data;
  const max = Math.max(d.target, ...d.steps.map((s) => s.rate));
  return (
    <div>
      <div className="stat-row">
        <Stat label="target" value={`${d.target.toLocaleString()} ops/s`} />
        <Stat label="safe ramp takes" value={`${d.minutes} min`} />
      </div>
      <div className="ramp">
        {d.steps.map((s) => (
          <Bar key={s.minute} label={`t+${s.minute} min`} value={d.jump ? s.sent : s.rate} max={max} tone={d.jump ? 'bad' : 'ok'} marker={s.allowed} markerLabel="500/50/5 allows this" text={d.jump ? `${s.sent.toLocaleString()} sent, ${s.allowed.toLocaleString()} safe` : `${s.rate.toLocaleString()} ops/s`} />
        ))}
      </div>
      <ErrorBox>{d.error}</ErrorBox>
    </div>
  );
}
