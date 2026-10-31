import React from 'react';
import { Bar, Empty, Stat } from '../components/common.jsx';
import { Legend } from './kit.jsx';
import { WorldMap } from './art.jsx';
import { ErrorBox, GateTrack, LineChart, Verdict } from './shared.jsx';
import { REGIONS } from '../lab/foundations.js';

export function GatesVisual({ result }) {
  if (!result) return <Empty>Press “Deploy” to walk a request through the five gates.</Empty>;
  const d = result.data;
  return (
    <div>
      <GateTrack gates={d.gates} runKey={result.receivedAt} />
      {d.ok ? <Verdict>Deployed: {d.url}</Verdict> : <><Verdict tone="bad">Stopped at “{d.gates.find((g) => g.status === 'fail').label}”. You only see this error until you fix it.</Verdict><ErrorBox>{d.error}</ErrorBox></>}
    </div>
  );
}

function TreeNode({ node, reached, grantId, depth = 0 }) {
  const on = reached.includes(node.id);
  return (
    <li className="tree-item">
      <div className={`tree-node tree-${node.kind.replace(/\s/g, '')} ${on ? 'tree-on' : ''} ${node.id === grantId ? 'tree-grant' : ''} pop-in`} style={{ animationDelay: `${depth * 170}ms` }}>
        <span className="tree-kind">{node.kind}</span>
        <b>{node.name}</b>
        {node.id === grantId && <span className="tree-badge">granted here</span>}
      </div>
      {node.children && <ul className="tree-list">{node.children.map((c) => <TreeNode key={c.id} node={c} reached={reached} grantId={grantId} depth={depth + 1} />)}</ul>}
    </li>
  );
}

export function HierarchyVisual({ result }) {
  if (!result) return <Empty>Press “Apply the grant” and watch it flow downhill.</Empty>;
  const d = result.data;
  return (
    <div>
      <div className="stat-row">
        <Stat label="resources reached" value={`${d.reachedCount} / ${d.resourceCount}`} tone={d.prodReached ? 'bad' : 'ok'} />
        <Stat label="production reachable" value={d.prodReached ? 'yes' : 'no'} tone={d.prodReached ? 'bad' : 'ok'} />
      </div>
      <ul className="tree-list tree-root" key={result.receivedAt}><TreeNode node={d.tree} reached={d.reached} grantId={d.grantId} /></ul>
      {d.prodReached && <Verdict tone="bad">The new developer can now edit the production database.</Verdict>}
    </div>
  );
}

export function IamMatrixVisual({ result }) {
  if (!result) return <Empty>Press “Evaluate” to see the decision and what each role contains.</Empty>;
  const d = result.data;
  return (
    <div>
      <div className="table-wrap" key={result.receivedAt}>
        <table className="iam-table">
          <thead><tr><th>Role</th>{d.permissions.map((p) => <th key={p} className={p === d.permission ? 'iam-col' : ''}><code>{p.split('.').slice(-2).join('.')}</code></th>)}<th>Permissions in full</th></tr></thead>
          <tbody>
            {d.matrix.map((row, ri) => (
              <tr key={row.role} className={row.role === d.role ? 'iam-row' : ''}>
                <td><code>{row.role}</code>{row.basic && <span className="chip chip-soft iam-basic">basic</span>}</td>
                {row.cells.map((c, ci) => <td key={c.permission}><span className={`iam-cell pop-in ${c.allowed ? 'iam-yes' : 'iam-no'} ${row.role === d.role && c.permission === d.permission ? 'iam-hit' : ''}`} style={{ animationDelay: `${(ri + ci) * 45}ms` }}>{c.allowed ? '✓' : '–'}</span></td>)}
                <td className="muted">{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <GateTrack gates={d.trace.map((t, i) => ({ id: String(i), label: t.step, note: t.note, status: t.result === 'deny' ? 'fail' : 'pass' }))} runKey={result.receivedAt} />
      <Verdict tone={d.allowed ? 'ok' : 'bad'}>{d.allowed ? 'Allowed' : 'Denied'}: <code>{d.role}</code> and <code>{d.permission}</code></Verdict>
    </div>
  );
}

export function AdcVisual({ result }) {
  if (!result) return <Empty>Press “Find credentials” and watch ADC walk the list.</Empty>;
  const d = result.data;
  const steps = ['GOOGLE_APPLICATION_CREDENTIALS', 'gcloud auth application-default login', 'Metadata server'];
  return (
    <div>
      <GateTrack runKey={result.receivedAt} gates={steps.map((s) => {
        const t = d.trace.find((x) => x.source === s);
        return { id: s, label: s, note: t ? t.note : 'never reached', status: !t ? 'skipped' : t.status === 'found' ? 'pass' : t.status === 'broken' ? 'fail' : 'miss' };
      })} />
      {d.credential ? <Verdict>Using: {d.credential}</Verdict> : <ErrorBox>{d.error}</ErrorBox>}
    </div>
  );
}

export function IdentityVisual({ result }) {
  if (!result) return <Empty>Press “Compare” to see what a leak would cost.</Empty>;
  const d = result.data;
  const max = Math.max(...d.compare.map((c) => c.hours));
  return (
    <div>
      <ol className="id-steps" key={result.receivedAt}>{d.steps.map((s, i) => <li key={s} className="pop-in" style={{ animationDelay: `${i * 240}ms` }}><span>{i + 1}</span>{s}</li>)}</ol>
      <h4>How long a leaked credential stays usable</h4>
      {d.compare.map((c) => <Bar key={c.name} label={c.name} value={c.hours} max={max} tone={c.secret ? 'bad' : 'ok'} text={c.hours >= 48 ? `${Math.round(c.hours / 24)} days` : `about ${c.hours} h`} />)}
      {d.secretOnDisk && <Verdict tone="bad">A key is a password that does not expire by default. It works until someone revokes it.</Verdict>}
    </div>
  );
}

export function WorldMapVisual({ result }) {
  const d = result?.data;
  const regions = REGIONS.map((r) => {
    if (!d) return r;
    const here = d.replicas.filter((x) => x.region === r.id);
    if (!here.length) return r;
    return { ...r, tone: here.some((x) => x.up) ? 'up' : 'down' };
  });
  return (
    <div>
      <WorldMap regions={regions} runKey={result?.receivedAt} />
      {!d ? <p className="muted">A sample of Google Cloud regions. Press “Simulate” to place replicas.</p> : (
        <>
          <div className="zone-tiles" key={result.receivedAt}>
            {d.replicas.map((r, i) => (
              <div key={r.zone} className={`zone-tile pop-in ${r.up ? 'zone-up' : 'zone-down'}`} style={{ animationDelay: `${i * 130}ms` }}>
                <code>{r.zone}</code><span>{r.up ? 'serving' : 'down'}</span>
              </div>
            ))}
          </div>
          <Verdict tone={d.up === 0 ? 'bad' : d.up === d.total ? 'ok' : 'warn'}>{d.up === 0 ? 'Outage: no replica is left.' : `${d.up} of ${d.total} replicas are serving. Users stay online.`}</Verdict>
        </>
      )}
    </div>
  );
}

export function BudgetVisual({ result }) {
  if (!result) return <Empty>Press “Play the month”.</Empty>;
  const d = result.data;
  const yMax = Math.max(d.budget * 1.2, d.spend * 1.05);
  return (
    <div>
      <div className="stat-row">
        <Stat label="spent this month" value={`$${d.spend.toLocaleString()}`} tone={d.spend > d.budget ? 'bad' : 'ok'} />
        <Stat label="budget" value={`$${d.budget.toLocaleString()}`} />
        <Stat label="of budget" value={`${d.overPct}%`} tone={d.overPct > 100 ? 'bad' : 'ok'} />
        <Stat label="stopped on" value={d.stoppedOn ? `day ${d.stoppedOn}` : 'never'} tone={d.stoppedOn ? 'warn' : d.spend > d.budget ? 'bad' : 'ok'} />
      </div>
      <LineChart runKey={result.receivedAt} xMax={30} yMax={yMax} xLabel="day of the month"
        series={[{ label: 'Spend', tone: d.spend > d.budget ? 'bad' : 'ok', points: d.series.map((s) => [s.day, s.spend]) }]}
        hlines={[{ y: d.budget, label: `budget $${d.budget}`, tone: 'warn' }]}
        marks={d.alerts.map((a) => ({ x: a.notified, label: `${a.pct}% email`, tone: 'warn' }))} />
      <Legend items={[{ color: 'var(--bad)', label: 'cumulative spend' }, { color: 'var(--warn)', label: 'budget and alert emails' }]} />
    </div>
  );
}
