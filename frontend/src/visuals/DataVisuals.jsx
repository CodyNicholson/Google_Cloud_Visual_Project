import React from 'react';
import { Empty, Stat } from '../components/common.jsx';
import { Legend } from './kit.jsx';
import { ErrorBox, RankedBars, StackColumns, Verdict } from './shared.jsx';
import { usd } from '../lab/lab.js';

export function BigQueryVisual({ result }) {
  if (!result) return <Empty>Press “Estimate the scan” to light up the data the query reads.</Empty>;
  const d = result.data;
  const maxGb = Math.max(...d.all.map((c) => c.gb));
  return (
    <div>
      <div className="stat-row">
        <Stat label="bytes processed" value={`${d.gb.toLocaleString()} GB`} tone={d.savedPct > 90 ? 'ok' : 'bad'} />
        <Stat label="on-demand cost" value={usd(d.cost)} tone={d.savedPct > 90 ? 'ok' : 'bad'} />
        <Stat label="saved vs. a full scan" value={`${d.savedPct}%`} tone={d.savedPct > 90 ? 'ok' : 'warn'} />
      </div>
      <pre className="sql-line">{d.sql}</pre>
      <div className="bq-grid" key={result.receivedAt} style={{ gridTemplateColumns: d.all.map((c) => `${Math.max(1, (c.gb / maxGb) * 3)}fr`).join(' ') }}>
        {d.all.map((c) => <div key={c.name} className={`bq-head ${d.columns.includes(c.name) ? 'bq-head-on' : ''}`} title={`${c.gb} GB`}>{c.name}</div>)}
        {d.partitions.flatMap((p) => d.all.map((c, ci) => {
          const on = p.hit && d.columns.includes(c.name);
          return <div key={`${p.day}-${c.name}`} className={`bq-cell ${on ? 'bq-on' : ''}`} style={{ animationDelay: `${p.day * 40 + ci * 30}ms` }} />;
        }))}
      </div>
      <p className="muted">Columns run across (width shows size) and days run down. Bright cells are read and billed.</p>
      {d.limit > 0 && <Verdict tone="bad">LIMIT {d.limit} changes the rows returned, not the {d.gb.toLocaleString()} GB that were read.</Verdict>}
      <ErrorBox>{d.error}</ErrorBox>
    </div>
  );
}

const PS_LABEL = { ack: 'acked', late: 'late, redelivered', nack: 'failed', dlq: 'to dead-letter' };
const PS_TONE = { ack: 'ok', late: 'warn', nack: 'bad', dlq: 'dlq' };

export function PubsubVisual({ result }) {
  if (!result) return <Empty>Press “Deliver”.</Empty>;
  const d = result.data;
  return (
    <div>
      <div className="stat-row">
        <Stat label="acknowledged" value={`${d.acked} / ${d.messages}`} tone="ok" />
        <Stat label="duplicate runs" value={d.duplicates} tone={d.duplicates ? 'warn' : 'ok'} />
        <Stat label="dead-lettered" value={d.dead.length} />
        <Stat label="still looping" value={d.stuck.length} tone={d.stuck.length ? 'bad' : 'ok'} />
      </div>
      <div className="rounds" key={result.receivedAt}>
        {d.rounds.map((r, ri) => (
          <div key={r.round} className="round pop-in" style={{ animationDelay: `${ri * 220}ms` }}>
            <span className="round-label">round {r.round}</span>
            <div className="msgs">{r.items.map((m) => <span key={m.id} className={`msg msg-${PS_TONE[m.state]}`} title={PS_LABEL[m.state]}>{m.id}</span>)}</div>
          </div>
        ))}
      </div>
      <Legend items={[{ color: 'var(--ok)', label: 'acknowledged' }, { color: 'var(--warn)', label: 'ack too late, delivered again' }, { color: 'var(--bad)', label: 'poison' }, { color: 'var(--api)', label: 'moved to the dead-letter topic' }]} />
    </div>
  );
}

export function WindowsVisual({ result }) {
  if (!result) return <Empty>Press “Window the stream”.</Empty>;
  const d = result.data;
  const max = 60;
  const left = (t) => `${(t / max) * 100}%`;
  const lateIds = new Set(d.windows.flatMap((w) => w.late));
  const place = d.timeBasis === 'event' ? 'event' : 'seen';
  const bands = [];
  for (let s = 0; s < max; s += d.size) bands.push(s);
  return (
    <div>
      <div className="stat-row">
        <Stat label="events" value={d.stream.length} />
        <Stat label="counted late" value={lateIds.size} tone={lateIds.size ? 'warn' : 'ok'} />
        <Stat label="dropped" value={d.dropped.length} tone={d.dropped.length ? 'bad' : 'ok'} />
        {d.timeBasis === 'processing' && <Stat label="windows that are wrong" value={d.wrong} tone="bad" />}
      </div>
      <div className="win-track" key={result.receivedAt}>
        {bands.map((s, i) => <div key={s} className={`win-band ${i % 2 ? 'win-alt' : ''}`} style={{ left: left(s), width: left(Math.min(d.size, max - s)) }}><small>{s}–{Math.min(s + d.size, max)} s</small></div>)}
        {d.stream.map((e, i) => {
          const state = d.dropped.includes(e.id) ? 'drop' : lateIds.has(e.id) ? 'late' : 'on';
          return <span key={e.id} className={`win-dot win-${state} pop-in`} style={{ left: left(e[place]), top: `${28 + (i % 4) * 24}px`, animationDelay: `${e.seen * 25}ms` }} title={`${e.id}: happened at ${e.event} s, seen at ${e.seen} s`}>{e.id}</span>;
        })}
      </div>
      <div className="win-counts">
        {d.windows.map((w) => <span key={w.start} className="chip chip-soft pop-in">[{w.start}, {w.end}): {w.events.length}{w.late.length ? ` (${w.late.length} late)` : ''}</span>)}
      </div>
      <Legend items={[{ color: 'var(--ok)', label: 'on time' }, { color: 'var(--warn)', label: 'late, still counted' }, { color: 'var(--bad)', label: 'too late, dropped' }]} />
    </div>
  );
}

export function RetriesVisual({ result }) {
  if (!result) return <Empty>Press “Send the burst”.</Empty>;
  const d = result.data;
  const max = Math.max(1, ...d.series.map((s) => s.ok + s.refused));
  return (
    <div>
      <div className="stat-row">
        <Stat label="succeeded" value={`${d.ok} / ${d.clients}`} tone={d.ok === d.clients ? 'ok' : 'warn'} />
        <Stat label="failed for good" value={d.failed} tone={d.failed ? 'bad' : 'ok'} />
        <Stat label="total API calls" value={d.calls} hint={`${d.retryAmp}× the requests`} tone={d.retryAmp > 3 ? 'bad' : 'ok'} />
      </div>
      <StackColumns runKey={result.receivedAt} max={max} columns={d.series.map((s) => ({ title: `t=${s.t}s: ${s.ok} ok, ${s.refused} refused`, parts: [{ value: s.refused, tone: 'bad' }, { value: s.ok, tone: 'ok' }] }))} />
      <Legend items={[{ color: 'var(--ok)', label: 'admitted each second' }, { color: 'var(--bad)', label: '429 refused' }]} />
    </div>
  );
}

export function RagVisual({ result }) {
  if (!result) return <Empty>Press “Ask”.</Empty>;
  const d = result.data;
  const max = Math.max(0.01, d.ranked[0].score);
  const used = new Set(d.context.map((c) => c.id));
  return (
    <div>
      <div className="chat-q pop-in">{d.question}</div>
      {d.retrieve ? (
        <RankedBars runKey={result.receivedAt} max={max} rows={d.ranked.map((r) => ({ id: r.id, name: r.title, value: r.score, text: `${r.score}`, sub: r.text, tone: used.has(r.id) ? 'ok' : 'accent' }))} />
      ) : <div className="muted">No passages were retrieved.</div>}
      <div className={`chat-a pop-in ${d.retrieve ? '' : 'chat-bad'}`} style={{ animationDelay: '500ms' }}>
        {d.answer}
        {d.retrieve && <small>Source: {d.context.map((c) => c.id).join(', ')}</small>}
      </div>
    </div>
  );
}
