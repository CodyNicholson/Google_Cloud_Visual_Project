import React from 'react';
import { Empty, Stat } from '../components/common.jsx';
import { Gantt, Legend } from './kit.jsx';
import { ErrorBox, RankedBars, StackColumns, Verdict } from './shared.jsx';
import { usd } from '../lab/lab.js';

/** Used by every "Which …?" page. */
export function ChooserVisual({ result }) {
  if (!result) return <Empty>Answer the questions and press “Rank the options”.</Empty>;
  const d = result.data;
  return (
    <div>
      <RankedBars runKey={result.receivedAt} max={d.max} rows={d.ranked.map((o) => ({
        id: o.id, name: o.name, value: o.score, text: `${o.score} pts`,
        sub: `${o.blurb}${o.reasons.length ? ` Here: ${[...new Set(o.reasons)].join(', ')}.` : ''}`,
        tone: d.wrong?.id === o.id ? 'bad' : undefined,
      }))} />
      {d.wrong && <Verdict tone="bad">Choosing {d.wrong.name} here means {d.wrongWhy}.</Verdict>}
    </div>
  );
}

export function ComputeEngineVisual({ result }) {
  if (!result) return <Empty>Press “Run the job”. Amber blocks are VMs that got reclaimed.</Empty>;
  const d = result.data;
  if (d.mode === 'capacity') {
    return (
      <div>
        <ErrorBox>{d.error}</ErrorBox>
        <h4>A regional group places the {d.vms} VMs where capacity exists</h4>
        <div className="zone-tiles" key={result.receivedAt}>
          {d.zones.map((z, i) => (
            <div key={z.zone} className={`zone-tile pop-in ${z.placed ? 'zone-up' : 'zone-down'}`} style={{ animationDelay: `${i * 180}ms` }}>
              <code>{z.zone}</code>
              <span className="vm-dots">{z.placed ? Array.from({ length: z.placed }, (_, k) => <i key={k} className="vm-dot pop-in" style={{ animationDelay: `${300 + k * 90}ms` }} />) : 'no capacity'}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="stat-row">
        <Stat label="machine-hours used" value={d.spot.hours} tone={d.spot.hours > d.jobHours * 1.5 ? 'bad' : 'ok'} hint={`job needs ${d.jobHours} h`} />
        <Stat label="VMs used" value={d.spot.attempts} />
        <Stat label="Spot cost" value={usd(d.spotCost)} tone={d.spotCost < d.onDemandCost ? 'ok' : 'bad'} />
        <Stat label="on-demand cost" value={usd(d.onDemandCost)} />
      </div>
      <Gantt runKey={result.receivedAt} unit="h" lanes={d.spot.segments.map((s, i) => ({ label: `VM ${i + 1}`, segments: [{ ...s, title: `${s.text} after ${(s.end - s.start).toFixed(1)} h` }] }))} />
      <p className="muted">{d.checkpointEvery ? `Each new VM resumes from the last checkpoint (every ${d.checkpointEvery} h).` : 'No checkpoints: each new VM starts from zero.'} $1/h is a round number for comparison.</p>
    </div>
  );
}

export function RunScaleVisual({ result }) {
  if (!result) return <Empty>Press “Play 60 seconds”.</Empty>;
  const d = result.data;
  const max = Math.max(1, d.peak, d.needed, ...d.series.map((s) => s.ready + s.starting));
  const peakRejected = Math.max(1, ...d.series.map((s) => s.rejected));
  return (
    <div>
      <div className="stat-row">
        <Stat label="peak instances" value={d.peak} hint={`the spike needs ${d.needed}`} />
        <Stat label="cold starts" value={d.coldHits} tone={d.coldHits ? 'warn' : 'ok'} />
        <Stat label="requests served" value={d.served.toLocaleString()} tone="ok" />
        <Stat label="requests refused" value={d.rejected.toLocaleString()} tone={d.rejected ? 'bad' : 'ok'} />
      </div>
      <h4>Instances each second</h4>
      <StackColumns runKey={result.receivedAt} max={max} columns={d.series.map((s) => ({
        title: `t=${s.t}s: ${s.rps} req/s, ${s.ready} ready, ${s.starting} starting`,
        parts: [{ value: s.ready, tone: 'ok' }, { value: s.starting, tone: 'warn' }],
      }))} />
      <h4>Requests refused each second</h4>
      <StackColumns runKey={result.receivedAt} max={peakRejected} height={60} columns={d.series.map((s) => ({ title: `t=${s.t}s: ${s.rejected} refused`, parts: [{ value: s.rejected, tone: 'bad' }] }))} />
      <Legend items={[{ color: 'var(--ok)', label: 'ready' }, { color: 'var(--warn)', label: 'starting (cold start)' }, { color: 'var(--bad)', label: 'refused' }]} />
      <ErrorBox>{d.error}</ErrorBox>
    </div>
  );
}

export function ContractVisual({ result }) {
  if (!result) return <Empty>Press “Deploy” to check the container against the rules.</Empty>;
  const d = result.data;
  const pct = Math.min(100, (d.usage / d.memory) * 100);
  return (
    <div>
      <ul className="rule-list" key={result.receivedAt}>
        {d.items.map((it, i) => (
          <li key={it.id} className={`rule pop-in ${it.ok ? 'rule-ok' : 'rule-bad'}`} style={{ animationDelay: `${i * 220}ms` }}>
            <span className="gate-icon">{it.ok ? '✓' : '✗'}</span>
            <div><b>{it.label}</b><div className={it.ok ? 'muted' : 'rule-error'}>{it.note}</div></div>
          </li>
        ))}
      </ul>
      <h4>Instance memory: {d.usage} of {d.memory} MiB</h4>
      <div className="bar-track"><div className={`bar-fill bar-${d.memOk ? 'ok' : 'bad'}`} style={{ width: `${pct}%` }} /></div>
      <Verdict tone={d.deployed && !d.throttled ? 'ok' : 'bad'}>{!d.listens ? 'The revision never became ready.' : !d.memOk ? 'The instance is killed under load.' : d.throttled ? 'It deployed, and work is being lost silently.' : 'Revision serving 100% of traffic.'}</Verdict>
    </div>
  );
}

export function DeliveriesVisual({ result }) {
  if (!result) return <Empty>Press “Deliver the event”.</Empty>;
  const d = result.data;
  return (
    <div>
      <div className="stat-row">
        <Stat label="delivery attempts" value={d.loops.toLocaleString()} tone={d.permanent ? 'bad' : undefined} />
        <Stat label="card charges" value={d.charges} tone={d.charges > 1 ? 'bad' : 'ok'} />
      </div>
      <div className="rounds" key={result.receivedAt}>
        {d.attempts.map((a, i) => (
          <div key={a.n} className="round pop-in" style={{ animationDelay: `${i * 240}ms` }}>
            <span className="round-label">t+{a.t.toLocaleString()} s</span>
            <span className={`msg msg-${a.ok ? 'ok' : 'bad'}`}>attempt {a.n}: {a.ok ? 'ok' : 'error'}</span>
            <span className={`msg ${a.charged ? 'msg-warn' : 'msg-gone'}`}>{a.charged ? '$ charged' : 'duplicate skipped'}</span>
          </div>
        ))}
        {d.loops > d.attempts.length && <div className="round pop-in muted">…and {(d.loops - d.attempts.length).toLocaleString()} more over 7 days</div>}
      </div>
    </div>
  );
}

export function GkeVisual({ result }) {
  if (!result) return <Empty>Press “Schedule” to place the Pods.</Empty>;
  const d = result.data;
  return (
    <div>
      <div className="stat-row">
        <Stat label="mode" value={d.mode.split(',')[0]} />
        <Stat label="nodes" value={d.nodes.length} />
        <Stat label="Pending Pods" value={d.pending.length} tone={d.pending.length ? 'bad' : 'ok'} />
        <Stat label="you pay for" value={d.billed} />
      </div>
      <div className="nodes" key={result.receivedAt}>
        {d.nodes.map((n, ni) => (
          <div key={n.name} className="k-node pop-in" style={{ animationDelay: `${ni * 150}ms` }}>
            <div className="k-head"><b>{n.name}</b><span className="muted">{n.used} / {n.cpu} vCPU</span></div>
            <div className="k-pods">
              {n.pods.map((p, pi) => <span key={p.name} className="k-pod pop-in" style={{ flexGrow: p.cpu, animationDelay: `${300 + (ni + pi) * 80}ms` }} title={`${p.name}: ${p.cpu} vCPU`}>{p.name}</span>)}
              {n.cpu > n.used && <span className="k-free" style={{ flexGrow: n.cpu - n.used }}>free</span>}
            </div>
          </div>
        ))}
      </div>
      {d.pending.length > 0 && (
        <div className="pending">
          <span className="round-label">Pending</span>
          <div className="msgs">{d.pending.map((p, i) => <span key={p.name} className="msg msg-bad pop-in" style={{ animationDelay: `${i * 60}ms` }}>{p.name}</span>)}</div>
        </div>
      )}
      <ErrorBox>{d.error}</ErrorBox>
    </div>
  );
}
