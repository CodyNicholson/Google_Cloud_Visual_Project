import React, { useState } from 'react';
import { PATTERNS } from '../kb/patterns.js';
import { DEMOS } from '../demos/catalog.js';
import { Graph } from '../visuals/kit.jsx';

/** Animated reference architectures: how the services combine into something real. */
export default function BlueprintsPage({ onOpen }) {
  const [id, setId] = useState(PATTERNS[0].id);
  const p = PATTERNS.find((x) => x.id === id);
  return (
    <article className="demo">
      <header className="demo-head">
        <span className="chip">Blueprints</span>
        <h2>How the pieces fit together</h2>
        <p className="tagline">Five starting architectures, each with the reasoning and the mistake to avoid.</p>
      </header>
      <div className="atlas-filters" role="tablist" aria-label="Blueprints">
        {PATTERNS.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={x.id === id} className={`atlas-filter ${x.id === id ? 'atlas-filter-on' : ''}`} onClick={() => setId(x.id)}>{x.title}</button>
        ))}
      </div>
      <section className="card">
        <h3>{p.title}</h3>
        <p className="muted">{p.when}</p>
        <Graph key={p.id} nodes={p.nodes} edges={p.edges} height={230} runKey={p.id} />
      </section>
      <div className="two-col">
        <section className="card">
          <h3>How it works</h3>
          <ol className="id-steps" key={p.id}>
            {p.steps.map((s, i) => <li key={s} className="pop-in" style={{ animationDelay: `${i * 200}ms` }}><span>{i + 1}</span>{s}</li>)}
          </ol>
        </section>
        <section className="card">
          <h3>Services used</h3>
          <div className="chips">{p.services.map((s) => <span key={s} className="chip chip-soft">{s}</span>)}</div>
          <h3 className="blueprint-sub">Try the key ideas</h3>
          <div className="chips">
            {p.pages.map((pg) => <button key={pg} type="button" className="btn btn-small btn-ghost" onClick={() => onOpen(pg)}>▶ {DEMOS.find((d) => d.id === pg).title}</button>)}
          </div>
          <div className="verdict verdict-bad blueprint-avoid">⚠ {p.avoid}</div>
        </section>
      </div>
    </article>
  );
}
