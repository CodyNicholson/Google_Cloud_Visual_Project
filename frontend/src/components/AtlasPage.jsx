import React, { useMemo, useState } from 'react';
import { ATLAS, ALL_SERVICES, STATUS_LABEL, searchServices } from '../kb/services.js';
import { CategoryIcon } from '../visuals/art.jsx';
import { DEMOS } from '../demos/catalog.js';

function docsUrl(name) {
  return `https://www.google.com/search?q=${encodeURIComponent(`site:docs.cloud.google.com ${name}`)}`;
}

function ServiceCard({ svc, index, onOpen }) {
  const demo = svc.page && DEMOS.find((d) => d.id === svc.page);
  return (
    <article className={`svc-card pop-in svc-${svc.category} ${svc.status ? 'svc-retired' : ''}`} style={{ animationDelay: `${Math.min(index * 18, 400)}ms` }}>
      <header className="svc-head">
        <span className="svc-icon"><CategoryIcon name={svc.icon} /></span>
        <div>
          <h4 className="svc-name">{svc.name}</h4>
          {svc.was && <span className="svc-was">formerly {svc.was}</span>}
          {svc.status && <span className={`svc-status svc-status-${svc.status}`}>{STATUS_LABEL[svc.status]}</span>}
        </div>
      </header>
      <p>{svc.what}</p>
      {svc.tip && <p className="svc-tip">⚠ {svc.tip}</p>}
      {(svc.aws || svc.azure) && (
        <dl className="svc-equiv">
          {svc.aws && <><dt>AWS</dt><dd>{svc.aws}</dd></>}
          {svc.azure && <><dt>Azure</dt><dd>{svc.azure}</dd></>}
        </dl>
      )}
      <footer className="svc-foot">
        {demo && <button type="button" className="btn btn-small btn-accent" onClick={() => onOpen(demo.id)}>▶ {demo.title}</button>}
        <a className="btn btn-small btn-ghost" href={docsUrl(svc.name)} target="_blank" rel="noreferrer">Find in docs</a>
      </footer>
    </article>
  );
}

/** Every product: search by name, former name, purpose, or the AWS or Azure name you already know. */
export default function AtlasPage({ onOpen }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const results = useMemo(() => searchServices(query, category), [query, category]);
  const groups = ATLAS.map((c) => ({ ...c, items: results.filter((r) => r.category === c.id) })).filter((c) => c.items.length);
  return (
    <article className="demo">
      <header className="demo-head">
        <span className="chip">Service atlas</span>
        <h2>Every Google Cloud tool</h2>
        <p className="tagline">{ALL_SERVICES.length} products in {ATLAS.length} groups, with what each is for and its AWS and Azure equivalents.</p>
      </header>

      <label className="input input-wide" htmlFor="atlas-search">
        <span>Search by name, former name, purpose, or the AWS or Azure service you know</span>
        <input id="atlas-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Lambda, Dataproc, queue, DynamoDB, Vertex" />
      </label>

      <div className="atlas-filters" role="group" aria-label="Filter by category">
        <button type="button" className={`atlas-filter ${category === 'all' ? 'atlas-filter-on' : ''}`} onClick={() => setCategory('all')}>All</button>
        {ATLAS.map((c) => (
          <button key={c.id} type="button" className={`atlas-filter ${category === c.id ? 'atlas-filter-on' : ''}`} onClick={() => setCategory(c.id)}>
            <CategoryIcon name={c.icon} size={16} /> {c.title} <small>{c.services.length}</small>
          </button>
        ))}
      </div>

      <p className="muted" aria-live="polite">{results.length} of {ALL_SERVICES.length} shown</p>

      {groups.map((g) => (
        <section key={g.id} className="atlas-group">
          <h3 className="atlas-title"><CategoryIcon name={g.icon} /> {g.title}</h3>
          <div className="svc-grid">{g.items.map((svc, i) => <ServiceCard key={svc.name} svc={svc} index={i} onOpen={onOpen} />)}</div>
        </section>
      ))}
      {!results.length && <p className="muted">Nothing matches “{query}”.</p>}
      <p className="muted atlas-note">Product list and equivalents follow Google’s service comparison page, checked on October 31, 2026. Equivalents are approximate. Google renames products often, so check the docs.</p>
    </article>
  );
}
