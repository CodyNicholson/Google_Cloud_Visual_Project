import React from 'react';
import { Empty, Stat } from '../components/common.jsx';
import { Gantt, Ring, useReady } from './kit.jsx';
import { ErrorBox, GateTrack, Verdict } from './shared.jsx';
import { usd } from '../lab/lab.js';

export function GatesTrafficVisual({ result }) {
  const ready = useReady(result?.receivedAt);
  if (!result) return <Empty>Press “Run the pipeline”.</Empty>;
  const d = result.data;
  return (
    <div>
      <GateTrack gates={d.gates} runKey={result.receivedAt} />
      <ErrorBox>{d.error}</ErrorBox>
      <h4>Where traffic goes</h4>
      <div className="traffic">
        {d.traffic.map((t, i) => (
          <div key={t.revision} className={`traffic-seg ${i ? 'traffic-new' : 'traffic-old'}`} style={{ width: ready ? `${t.pct}%` : (i ? 0 : '100%') }}>
            {t.pct >= 8 && <span>{t.revision}: {t.pct}%</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TerraformVisual({ result }) {
  if (!result) return <Empty>Press “Two engineers apply”.</Empty>;
  const d = result.data;
  return (
    <div>
      <div className="tf-scene" key={result.receivedAt}>
        <div className="tf-person pop-in"><b>Alice</b><code>{d.shared ? 'shared state' : 'her terraform.tfstate'}</code></div>
        {d.shared && <div className="tf-state pop-in"><b>gs://my-lab-tfstate</b><span className="muted">one state, one lock, versioned</span></div>}
        <div className="tf-person pop-in"><b>Bob</b><code>{d.shared ? 'shared state' : 'his terraform.tfstate'}</code></div>
      </div>
      <Gantt runKey={result.receivedAt} lanes={d.lanes} max={80} unit="s" />
      <Verdict tone={d.shared ? 'ok' : 'bad'}>{d.shared ? 'Bob waited for the lock, then saw there was nothing left to do.' : 'Each state knew nothing about the other, so the plan looked fine until apply failed.'}</Verdict>
      <ErrorBox>{d.error}</ErrorBox>
    </div>
  );
}

export function LogRouterVisual({ result }) {
  if (!result) return <Empty>Press “Route a month of logs”.</Empty>;
  const d = result.data;
  return (
    <div>
      <div className="stat-row">
        <Stat label="ingested a month" value={`${d.gb.toLocaleString()} GB`} tone={d.gb > 500 ? 'bad' : 'ok'} hint={`${d.free} GiB free`} />
        <Stat label="illustrative cost" value={usd(d.cost)} tone={d.cost > 100 ? 'bad' : 'ok'} />
      </div>
      <div className="log-rows" key={result.receivedAt}>
        {d.routed.map((e, i) => {
          const tone = e.dest === 'Excluded' ? 'gone' : e.required ? 'req' : 'def';
          return (
            <div key={e.id} className={`log-row pop-in log-${tone}`} style={{ animationDelay: `${i * 200}ms` }}>
              <span className="log-kind"><b>{e.kind}</b><small>{e.gbPerDay} GB a day</small></span>
              <span className="log-wire"><i style={{ animationDelay: `${i * 200 + 200}ms` }} /></span>
              <span className="log-router">Log Router</span>
              <span className="log-wire"><i style={{ animationDelay: `${i * 200 + 500}ms` }} /></span>
              <span className="log-dest"><b>{e.dest}</b><small>{e.note}</small></span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SloVisual({ result }) {
  if (!result) return <Empty>Press “Measure the incident”.</Empty>;
  const d = result.data;
  const used = d.budgetUsedPct / 100;
  const tone = d.action.startsWith('Page') ? 'bad' : d.action.startsWith('Open') ? 'warn' : 'ok';
  return (
    <div>
      <div className="ring-row" key={result.receivedAt}>
        <Ring runKey={result.receivedAt} pct={Math.min(1, used)} size={130} color={used >= 1 ? 'var(--bad)' : used > 0.3 ? 'var(--warn)' : 'var(--ok)'} label={`${d.budgetUsedPct}%`} sub="of the error budget used" />
        <div className="stat-row slo-stats">
          <Stat label="monthly budget" value={`${d.budgetMin} min`} hint={`at ${d.slo}%`} />
          <Stat label="burn rate" value={`${d.burnRate}×`} tone={tone} />
          <Stat label="empty in" value={d.minutesToEmpty ? `${(d.minutesToEmpty / 60).toFixed(1)} h` : 'never'} />
        </div>
      </div>
      <div className="burn-scale">
        {[['Do nothing', 0, 3], ['Open a ticket', 3, 14.4], ['Page someone now', 14.4, 40]].map(([label, a, b]) => (
          <div key={label} className={`burn-zone ${d.action === label ? 'burn-on' : ''} burn-${label.split(' ')[0].toLowerCase()}`}><b>{label}</b><small>{a}× to {b === 40 ? '∞' : `${b}×`}</small></div>
        ))}
      </div>
      {d.blips > 0 && <Verdict tone="bad">An “any 5xx” threshold would have paged about {d.blips} times this month, for a burn rate that needs no action.</Verdict>}
    </div>
  );
}
