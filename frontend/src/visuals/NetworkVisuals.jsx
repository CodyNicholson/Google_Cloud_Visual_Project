import React from 'react';
import { Empty, Stat } from '../components/common.jsx';
import { Graph, Legend } from './kit.jsx';
import { ErrorBox, Verdict } from './shared.jsx';

export function PeeringVisual({ result }) {
  if (!result) return <Empty>Press “Test reachability”.</Empty>;
  const d = result.data;
  const pos = { a: [120, 150], b: [320, 45], c: [520, 150] };
  const isDirect = (x, y) => d.links.some(([p, q]) => (p === x && q === y) || (p === y && q === x));
  const nodes = d.nets.map((n) => ({ id: n.id, label: n.name, sub: n.subnets[0].split(' ')[0], x: pos[n.id][0], y: pos[n.id][1], tone: 'accent' }));
  const edges = [['a', 'b'], ['b', 'c'], ['a', 'c']].map(([x, y]) => (isDirect(x, y)
    ? { from: x, to: y, animated: true, tone: 'ok', label: 'peered' }
    : { from: x, to: y, dashed: true, tone: 'bad', label: 'no route' }));
  return (
    <div>
      <Graph nodes={nodes} edges={edges} height={205} runKey={result.receivedAt} />
      <div className="subnet-chips">
        {d.nets.map((n) => <div key={n.id}><b>{n.name}</b>{n.subnets.map((s) => <code key={s} className="chip chip-code">{s}</code>)}</div>)}
      </div>
      {d.transitive && <Verdict tone="bad">vpc-b talks to both neighbours, but it does not pass traffic between them.</Verdict>}
      <ErrorBox>{d.error}</ErrorBox>
    </div>
  );
}

export function FirewallVisual({ result }) {
  if (!result) return <Empty>Press “Send the packet”.</Empty>;
  const d = result.data;
  return (
    <div>
      <div className="packet-line" key={`p${result.receivedAt}`}>
        <span className="chip chip-code">{d.source}</span>
        <span className={`packet-run ${d.allowed ? 'packet-ok' : 'packet-bad'}`}><i /></span>
        <span className="chip chip-code">VM “{d.target}” : {d.port}</span>
      </div>
      <ol className="fw-rules" key={result.receivedAt}>
        {d.trace.map((r, i) => (
          <li key={r.name} className={`fw-rule pop-in ${r.match ? (r.action === 'allow' ? 'fw-allow' : 'fw-deny') : 'fw-skip'}`} style={{ animationDelay: `${i * 300}ms` }}>
            <code className="fw-prio">{r.priority}</code>
            <b>{r.name}</b>
            <span className="muted">{r.action} {r.src.join(', ')} {r.ports === 'all' ? 'all ports' : `tcp:${r.ports.join(',')}`}{r.target === 'any' ? '' : `, tag ${r.target}`}</span>
            <span className="fw-why">{r.why}</span>
          </li>
        ))}
      </ol>
      <Verdict tone={d.allowed ? 'ok' : 'bad'}>{d.allowed ? 'Delivered' : 'Dropped'} by <code>{d.winner}</code>{d.allowed ? '' : '. The client sees a timeout, not an error.'}</Verdict>
    </div>
  );
}

export function EgressVisual({ result }) {
  if (!result) return <Empty>Press “Test each destination”.</Empty>;
  const d = result.data;
  return (
    <div className="lanes" key={result.receivedAt}>
      {d.routes.map((r, i) => (
        <div key={r.destination} className={`lane pop-in ${r.ok ? 'lane-ok' : 'lane-bad'}`} style={{ animationDelay: `${i * 200}ms` }}>
          <span className="lane-from">VM</span>
          <span className="lane-track"><i style={{ animationDelay: `${i * 250}ms` }} /></span>
          <span className="lane-via">{r.ok ? r.via : 'nothing: times out'}</span>
          <code className="lane-to">{r.destination}</code>
        </div>
      ))}
    </div>
  );
}

export function EdgeVisual({ result }) {
  if (!result) return <Empty>Press “Choose and send traffic”.</Empty>;
  const d = result.data;
  return (
    <div>
      <Verdict tone="ok">You need: {d.pick}</Verdict>
      <div className="stat-row">
        <Stat label="reached the backend" value={`${d.hitsBackend} / ${d.results.length}`} tone={d.direct ? 'bad' : 'ok'} />
        <Stat label="path" value={d.direct ? 'direct to run.app' : 'through the edge'} tone={d.direct ? 'bad' : 'ok'} />
      </div>
      <div className="table-wrap">
        <table className="edge-table" key={result.receivedAt}>
          <thead><tr><th>Request</th><th>Cloud Armor</th><th>Cloud CDN</th><th>Outcome</th></tr></thead>
          <tbody>
            {d.results.map((r, i) => (
              <tr key={r.i} className="pop-in" style={{ animationDelay: `${i * 220}ms` }}>
                <td><code>{r.path}</code></td>
                <td className={r.armor.startsWith('blocked') ? 'bad' : r.armor === 'not evaluated' ? 'warn-text' : 'muted'}>{r.armor}</td>
                <td className={r.cdn === 'HIT' ? 'ok' : 'muted'}>{r.cdn}</td>
                <td className={r.backend && (r.kind === 'sqli' || r.kind === 'geo') ? 'bad' : ''}>{r.outcome}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Legend items={[{ color: 'var(--bad)', label: 'blocked, or an attack that got through' }, { color: 'var(--ok)', label: 'served from cache' }]} />
    </div>
  );
}
