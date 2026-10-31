import React from 'react';
import { Empty } from '../components/common.jsx';
import { ErrorBox, GateTrack, Verdict } from './shared.jsx';

export function SecretsVisual({ result }) {
  if (!result) return <Empty>Press “Roll out”.</Empty>;
  const d = result.data;
  return (
    <div>
      <div className="versions" key={result.receivedAt}>
        {d.versions.map((v, i) => (
          <div key={v.n} className={`version pop-in version-${v.state} ${v.n === d.resolved ? 'version-used' : ''} ${v.good === false ? 'version-bad' : ''}`} style={{ animationDelay: `${i * 130}ms` }}>
            <b>v{v.n}</b><small>{v.state}{v.good === false ? ', bad value' : ''}</small>
            {v.n === d.resolved && <span className="tree-badge">{d.ref === 'latest' ? 'latest' : 'pinned'}</span>}
          </div>
        ))}
      </div>
      <div className="zone-tiles" key={`i${result.receivedAt}`}>
        {d.instances.map((inst, i) => (
          <div key={inst.name} className={`zone-tile pop-in ${inst.ok ? 'zone-up' : 'zone-down'}`} style={{ animationDelay: `${500 + i * 160}ms` }}>
            <code>{inst.name}</code><span>started {inst.started}, read v{inst.version}</span><b>{inst.ok ? 'healthy' : 'failing'}</b>
          </div>
        ))}
      </div>
      {d.instances.some((i) => i.ok) && d.instances.some((i) => !i.ok) && <Verdict tone="bad">A partial outage: only instances started after the rotation fail.</Verdict>}
      <ErrorBox>{d.error}</ErrorBox>
    </div>
  );
}

export function GuardrailsVisual({ result }) {
  if (!result) return <Empty>Press “Attempt it”.</Empty>;
  const d = result.data;
  return (
    <div>
      <GateTrack gates={d.gates} runKey={result.receivedAt} />
      <Verdict tone={d.ok ? 'ok' : 'bad'}>{d.ok ? 'Allowed.' : `Refused by ${d.gates.find((g) => g.status === 'fail').label}.`}</Verdict>
      <ErrorBox>{d.error}</ErrorBox>
    </div>
  );
}
