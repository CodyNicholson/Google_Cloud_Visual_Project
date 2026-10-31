import React from 'react';
import Terminal from './Terminal.jsx';
import { OVERVIEW } from '../demos/guide.js';
import { CATEGORIES, DEMOS } from '../demos/catalog.js';
import { LEARNING_PATH } from '../kb/patterns.js';
import { ALL_SERVICES } from '../kb/services.js';
import { HeroArt } from '../visuals/art.jsx';

function List({ title, items, tone }) {
  if (!items?.length) return null;
  return (
    <section className={`card list-card list-${tone}`}>
      <h3>{title}</h3>
      <ul>
        {items.map((item, i) => <li key={i} style={{ animationDelay: `${i * 70}ms` }}>{item}</li>)}
      </ul>
    </section>
  );
}

/** Landing page: the mental model, a learning path, a first deploy, honest pros and cons, how not to use Google Cloud, and a map of every demo. */
export default function OverviewPage({ onOpen }) {
  return (
    <article className="demo">
      <header className="demo-head">
        <span className="chip">Start here</span>
        <h2>{OVERVIEW.title}</h2>
        <p className="tagline">{OVERVIEW.intro}</p>
      </header>

      <section className="card hero-card"><HeroArt /></section>

      <div className="stat-row">
        <div className="stat"><div className="stat-value stat-text">{ALL_SERVICES.length}</div><div className="stat-label">products in the atlas</div></div>
        {OVERVIEW.facts.map(([label, value]) => (
          <div key={label} className="stat"><div className="stat-value stat-text">{value}</div><div className="stat-label">{label}</div></div>
        ))}
      </div>

      <div className="start-grid">
        <button type="button" className="start-card" onClick={() => onOpen('first-project')}><b>New here?</b><span>Walk through your first deploy, and the five things that stop it.</span></button>
        <button type="button" className="start-card" onClick={() => onOpen('atlas')}><b>What does this product do?</b><span>Search every tool, by its old name or its AWS or Azure name.</span></button>
        <button type="button" className="start-card" onClick={() => onOpen('blueprints')}><b>How do I build X?</b><span>Five animated architectures to start from.</span></button>
        <button type="button" className="start-card" onClick={() => onOpen('pitfalls')}><b>Got an error?</b><span>Paste the message into the mistakes search.</span></button>
      </div>

      <section className="card list-card">
        <h3>The mental model</h3>
        <ul>{OVERVIEW.mentalModel.map((m, i) => <li key={i} style={{ animationDelay: `${i * 70}ms` }}>{m}</li>)}</ul>
      </section>

      <section className="card">
        <h3>A learning path</h3>
        <ol className="path">
          {LEARNING_PATH.map((stage, i) => (
            <li key={stage.title} className="path-stage pop-in" style={{ animationDelay: `${i * 120}ms` }}>
              <h4>{stage.title}</h4>
              <p className="muted">{stage.text}</p>
              <div className="path-links">
                {stage.pages.map((id) => <button key={id} type="button" className="chip chip-soft chip-link" onClick={() => onOpen(id)}>{DEMOS.find((d) => d.id === id).title}</button>)}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="card">
        <h3>Your first hour</h3>
        <ol className="guide-steps">
          {OVERVIEW.steps.map((step, i) => (
            <li key={step.title} style={{ animationDelay: `${i * 90}ms` }}>
              <h4>{i + 1}. {step.title}</h4>
              <p>{step.text}</p>
              {step.commands && <Terminal commands={step.commands} />}
            </li>
          ))}
        </ol>
      </section>

      <div className="two-col">
        <List title="Strengths" items={OVERVIEW.pros} tone="ok" />
        <List title="Weaknesses" items={OVERVIEW.cons} tone="bad" />
        <List title="A good fit when" items={OVERVIEW.whenToUse} tone="ok" />
        <List title="Look elsewhere when" items={OVERVIEW.whenNotToUse} tone="warn" />
      </div>

      <section className="card list-card list-bad">
        <div className="card-title-row">
          <h3>How not to use Google Cloud</h3>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => onOpen('pitfalls')}>All mistakes & fixes →</button>
        </div>
        <ul>
          {OVERVIEW.antiPatterns.map((a, i) => (
            <li key={a.dont} style={{ animationDelay: `${i * 70}ms` }}><b>{a.dont}</b><span className="muted"> Instead: {a.instead}</span></li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3>Every interactive topic</h3>
        <div className="feature-map">
          {CATEGORIES.map((category) => (
            <div key={category} className="feature-group">
              <h4>{category}</h4>
              {DEMOS.filter((d) => d.category === category).map((d) => (
                <button key={d.id} type="button" className="feature-link" onClick={() => onOpen(d.id)}>
                  <b>{d.title}</b><span className="muted">{d.tagline}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>Alternatives</h3>
        <table>
          <tbody>{OVERVIEW.alternatives.map(([name, diff]) => <tr key={name}><td><b>{name}</b></td><td>{diff}</td></tr>)}</tbody>
        </table>
      </section>

      <section className="card list-card">
        <h3>About this lab</h3>
        <p className="muted">An unofficial learning project, not affiliated with or endorsed by Google. Nothing here calls Google Cloud: each page runs a small simulation in your browser, and its timings and prices are illustrative. Error messages come from Google’s documentation where it publishes them; the rest are typical wording and can vary by tool and version. Facts were checked on October 31, 2026, and they change, so confirm with the docs before you rely on them.</p>
        <ul>{OVERVIEW.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ul>
      </section>
    </article>
  );
}
