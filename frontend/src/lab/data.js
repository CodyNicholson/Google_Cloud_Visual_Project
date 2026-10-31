// Data: BigQuery scan costs, Pub/Sub delivery, Dataflow windows, and choosing a data tool.
import { Demo, GcpError, bool, clampInt, oneOf, round, usd } from './lab.js';
import { chooser } from './compute.js';

// ---- BigQuery -------------------------------------------------------------------------------

export const BQ_COLUMNS = [
  { name: 'event_ts', gb: 40 }, { name: 'user_id', gb: 60 }, { name: 'country', gb: 8 }, { name: 'event', gb: 12 },
  { name: 'amount', gb: 30 }, { name: 'url', gb: 240 }, { name: 'user_agent', gb: 310 }, { name: 'payload', gb: 900 },
];
export const TIB = 1024;
export const PRICE_PER_TIB = 6.25;

export function scanBytes({ columns, days, clustered, partitioned, totalDays = 365 }) {
  const selected = BQ_COLUMNS.filter((c) => columns.includes(c.name));
  const perDayFraction = partitioned ? days / totalDays : 1;
  const clusterFraction = clustered ? 0.1 : 1;
  const gb = selected.reduce((n, c) => n + c.gb, 0) * perDayFraction * clusterFraction;
  return round(gb, 2);
}

const PROJECTIONS = {
  'SELECT user_id, amount': ['user_id', 'amount'],
  'SELECT user_id, event, amount, country': ['user_id', 'event', 'amount', 'country'],
  'SELECT *': BQ_COLUMNS.map((c) => c.name),
};

export function bigquery(inputs, opts = {}) {
  const d = new Demo('bigquery-scan');
  const projection = oneOf(opts.projection || inputs.projection, Object.keys(PROJECTIONS));
  const columns = PROJECTIONS[projection];
  const partitioned = opts.partitioned ?? bool(inputs.partitioned);
  const clustered = opts.clustered ?? bool(inputs.clustered);
  const days = clampInt(opts.days ?? inputs.days, 1, 365, 7);
  const limit = opts.limit ?? clampInt(inputs.limit, 0, 1000000, 0);
  const whereDate = partitioned ? `WHERE DATE(event_ts) >= CURRENT_DATE() - ${days}` : '';
  const sql = `${projection} FROM shop.events ${whereDate}${clustered ? " AND country = 'DE'" : ''}${limit ? ` LIMIT ${limit}` : ''}`.replace(/\s+/g, ' ').trim();
  d.cmd(`bq query --dry_run --use_legacy_sql=false "${sql}"`);
  const gb = scanBytes({ columns, days, clustered, partitioned });
  const full = scanBytes({ columns: PROJECTIONS['SELECT *'], days: 365, partitioned: false, clustered: false });
  const tib = gb / TIB;
  const cost = tib * PRICE_PER_TIB;
  d.cmd(`Query will process ${gb.toLocaleString()} GB when run (${usd(cost)} on demand, before the free 1 TiB a month)`);
  const maxGb = opts.maxGb ?? 0;
  let error = null;
  if (maxGb) {
    const capped = d.attempt(`bq query --maximum_bytes_billed=${maxGb * 1e9}`, () => {
      if (gb > maxGb) throw new GcpError('Error in query', `Query exceeded limit for bytes billed: ${maxGb * 1e9}. ${Math.ceil(gb) * 1e9} or higher required.`);
    });
    error = capped.ok ? null : capped.error.message;
    d.check('--maximum_bytes_billed fails the query with no charge', !capped.ok, 'the guard runs before the scan');
  }
  if (opts.limit) {
    d.check('LIMIT does not reduce the bytes scanned', gb === full, `${gb.toLocaleString()} GB with LIMIT ${limit}, ${full.toLocaleString()} GB without`);
    const fixed = scanBytes({ columns: ['user_id', 'amount'], days: 7, partitioned: true, clustered: false });
    d.cmd(`# Fix: name the columns and filter the partition → ${fixed} GB`);
    d.check('Choosing columns and a partition is far cheaper', fixed < full / 100, `${fixed} GB versus ${full.toLocaleString()} GB`);
  } else {
    d.check('Only the selected columns are read', gb <= BQ_COLUMNS.filter((c) => columns.includes(c.name)).reduce((n, c) => n + c.gb, 0), `${columns.length} of ${BQ_COLUMNS.length} columns`);
    d.check('Bytes shrink with the partition filter', !partitioned || gb <= scanBytes({ columns, days: 365, partitioned: false, clustered }), partitioned ? `${days} of 365 days` : 'no partition filter');
  }
  const partitions = Array.from({ length: 14 }, (_, i) => ({ day: i, hit: !partitioned || i < Math.round((days / 365) * 14) || (i === 0) }));
  return d.result({ sql, columns, all: BQ_COLUMNS, gb, full, cost, partitions, partitioned, clustered, days, limit, error, savedPct: round((1 - gb / full) * 100, 1) });
}

// ---- Pub/Sub --------------------------------------------------------------------------------

export function pubsubRun({ messages, processS, deadlineS, extend, poisonEvery, maxDelivery, dlq }) {
  const queue = Array.from({ length: messages }, (_, i) => ({ id: `m${i + 1}`, poison: poisonEvery > 0 && (i + 1) % poisonEvery === 0, deliveries: 0 }));
  const rounds = [];
  const acked = new Map();
  const dead = [];
  let sideEffects = 0;
  for (let r = 1; r <= 12 && queue.length; r++) {
    const row = { round: r, items: [] };
    for (const m of [...queue]) {
      m.deliveries += 1;
      const expired = !extend && processS > deadlineS;
      sideEffects += m.poison ? 0 : 1;
      if (m.poison) {
        if (dlq && m.deliveries >= maxDelivery) {
          queue.splice(queue.indexOf(m), 1);
          dead.push(m.id);
          row.items.push({ id: m.id, state: 'dlq' });
        } else {
          row.items.push({ id: m.id, state: 'nack' });
        }
      } else if (expired && m.deliveries < 3) {
        // The handler finished, but the ack arrived after the deadline: Pub/Sub has already redelivered
        row.items.push({ id: m.id, state: 'late' });
      } else {
        queue.splice(queue.indexOf(m), 1);
        acked.set(m.id, m.deliveries);
        row.items.push({ id: m.id, state: 'ack' });
      }
    }
    rounds.push(row);
  }
  return { rounds, acked: acked.size, dead, stuck: queue.map((m) => m.id), sideEffects, duplicates: Math.max(0, sideEffects - acked.size) };
}

export function pubsub(inputs, opts = {}) {
  const d = new Demo('pubsub');
  const messages = opts.poisonEvery ? Math.max(6, clampInt(inputs.messages, 2, 12, 6)) : clampInt(inputs.messages, 2, 12, 6);
  const processS = clampInt(opts.processS ?? inputs.processS, 1, 600, 5);
  const deadlineS = opts.processS > 10 ? 10 : clampInt(inputs.deadlineS, 10, 600, 10);
  const extend = opts.extend ?? bool(inputs.extend);
  const poisonEvery = opts.poisonEvery ?? clampInt(inputs.poisonEvery, 0, 12, 0);
  const maxDelivery = clampInt(inputs.maxDelivery, 5, 100, 5);
  const dlq = opts.dlq ?? bool(inputs.dlq);
  d.cmd('gcloud pubsub topics create orders');
  d.cmd(`gcloud pubsub subscriptions create orders-worker --topic=orders --ack-deadline=${deadlineS}${dlq ? ` --dead-letter-topic=orders-dead --max-delivery-attempts=${maxDelivery}` : ''}`);
  d.cmd(`Publish ${messages} messages; each takes ${processS} s to process${extend ? ' (client library extends the lease)' : ''}`);
  const r = pubsubRun({ messages, processS, deadlineS, extend, poisonEvery, maxDelivery, dlq });
  r.rounds.forEach((row) => d.cmd(`delivery round ${row.round}: ${row.items.map((i) => `${i.id}:${i.state}`).join(' ')}`));
  if (opts.processS > 10) {
    d.check('Work longer than the deadline is delivered twice', r.duplicates > 0, `${r.sideEffects} handler runs for ${messages} messages`);
    const fixed = pubsubRun({ messages, processS, deadlineS, extend: true, poisonEvery: 0, maxDelivery, dlq: false });
    d.cmd('# Fix: use the high-level client (it extends the lease) and make the handler idempotent');
    d.check('Lease extension removes these duplicates', fixed.duplicates === 0, `${fixed.sideEffects} runs for ${messages} messages`);
  } else if (poisonEvery && dlq) {
    d.check('A poison message reaches the dead-letter topic', r.dead.length > 0, `${r.dead.join(', ')} after ${maxDelivery} attempts`);
  } else if (poisonEvery) {
    d.check('Without a dead-letter topic a poison message keeps coming back', r.stuck.length > 0, `${r.stuck.join(', ')} still in the subscription`);
    const fixed = pubsubRun({ messages, processS: 1, deadlineS, extend: true, poisonEvery, maxDelivery: 5, dlq: true });
    d.check('A dead-letter topic takes it out of the loop', fixed.stuck.length === 0 && fixed.dead.length > 0, `grant the Pub/Sub service agent publisher and subscriber roles`);
  } else {
    d.check('Every message is acknowledged', r.acked === messages, `${r.acked} of ${messages}`);
    d.check('Delivery is at least once', r.sideEffects >= r.acked, `${r.sideEffects} runs for ${r.acked} messages`);
  }
  return d.result({ ...r, messages, processS, deadlineS, extend, maxDelivery, dlq });
}

// ---- Dataflow windows -----------------------------------------------------------------------

// Each event: when it happened (event time) and when the pipeline saw it (processing time), in seconds.
export const STREAM = [
  { id: 'a', event: 3, seen: 4 }, { id: 'b', event: 8, seen: 9 }, { id: 'c', event: 12, seen: 14 },
  { id: 'd', event: 17, seen: 18 }, { id: 'e', event: 9, seen: 26 }, { id: 'f', event: 24, seen: 27 },
  { id: 'g', event: 33, seen: 35 }, { id: 'h', event: 22, seen: 44 }, { id: 'i', event: 41, seen: 45 },
  { id: 'j', event: 52, seen: 53 }, { id: 'k', event: 6, seen: 58 },
];

export function windowing({ size, watermarkDelay, lateness, timeBasis = 'event' }) {
  const windows = new Map();
  const dropped = [];
  for (const e of STREAM) {
    const time = timeBasis === 'event' ? e.event : e.seen;
    const start = Math.floor(time / size) * size;
    const end = start + size;
    const watermark = e.seen - watermarkDelay;
    const late = timeBasis === 'event' && watermark >= end;
    const tooLate = late && watermark >= end + lateness;
    if (tooLate) { dropped.push(e.id); continue; }
    if (!windows.has(start)) windows.set(start, { start, end, events: [], late: [] });
    const w = windows.get(start);
    w.events.push(e.id);
    if (late) w.late.push(e.id);
  }
  return { windows: [...windows.values()].sort((a, b) => a.start - b.start), dropped };
}

/** The correct count per event-time window: what a perfect pipeline would report. */
export function truth(size) {
  const counts = new Map();
  STREAM.forEach((e) => { const s = Math.floor(e.event / size) * size; counts.set(s, (counts.get(s) || 0) + 1); });
  return counts;
}

export function dataflow(inputs, opts = {}) {
  const d = new Demo('dataflow-windows');
  const wrong = opts.lateness === 0 || opts.timeBasis;
  const size = wrong ? 15 : clampInt(inputs.size, 5, 30, 15);
  const watermarkDelay = wrong ? 5 : clampInt(inputs.watermarkDelay, 0, 30, 5);
  const lateness = opts.lateness ?? clampInt(inputs.lateness, 0, 60, 30);
  const timeBasis = opts.timeBasis || 'event';
  d.cmd(`beam.WindowInto(FixedWindows(${size}), allowed_lateness=${lateness}, trigger=AfterWatermark(late=AfterCount(1)), accumulation_mode=ACCUMULATING)`);
  const r = windowing({ size, watermarkDelay, lateness, timeBasis });
  const t = truth(size);
  const wrongWindows = [...t.entries()].filter(([s, n]) => (r.windows.find((w) => w.start === s)?.events.length || 0) !== n).length;
  r.windows.forEach((w) => d.cmd(`window [${w.start}, ${w.end}): ${w.events.length} event(s)${w.late.length ? `, late: ${w.late.join(', ')}` : ''}`));
  if (r.dropped.length) d.cmd(`Dropped as too late: ${r.dropped.join(', ')}`);
  if (timeBasis === 'processing') {
    d.check('Grouping by arrival time gives wrong counts', wrongWindows > 0, `${wrongWindows} windows differ from what actually happened`);
    d.cmd('# Fix: assign windows by event time (the timestamp in the message)');
  } else if (opts.lateness === 0) {
    d.check('With no allowed lateness late events are lost', r.dropped.length > 0, `dropped ${r.dropped.join(', ')}`);
    const fixed = windowing({ size, watermarkDelay, lateness: 60 });
    d.check('Allowing lateness keeps them', fixed.dropped.length < r.dropped.length, `${fixed.dropped.length} dropped with 60 s of allowed lateness`);
  } else {
    d.check('Every event is either windowed or dropped', r.windows.reduce((n, w) => n + w.events.length, 0) + r.dropped.length === STREAM.length, `${STREAM.length} events`);
    d.check('Late events past the watermark are tracked', r.windows.some((w) => w.late.length) || r.dropped.length > 0 || watermarkDelay >= 30, `${r.windows.reduce((n, w) => n + w.late.length, 0)} late, ${r.dropped.length} dropped`);
  }
  return d.result({ ...r, size, watermarkDelay, lateness, timeBasis, stream: STREAM, wrong: wrongWindows });
}

// ---- Which data tool? -----------------------------------------------------------------------

export const DATA_OPTIONS = [
  { id: 'dataflow', name: 'Dataflow', blurb: 'Managed Apache Beam for streaming and batch pipelines.' },
  { id: 'spark', name: 'Managed Service for Apache Spark', blurb: 'Formerly Dataproc: run existing Spark and Hadoop jobs.' },
  { id: 'dataform', name: 'Dataform', blurb: 'SQL transformations inside BigQuery, with versioning and tests.' },
  { id: 'datastream', name: 'Datastream', blurb: 'Change data capture from operational databases.' },
  { id: 'fusion', name: 'Cloud Data Fusion', blurb: 'Visual, connector-driven ETL.' },
  { id: 'airflow', name: 'Managed Service for Apache Airflow', blurb: 'Formerly Cloud Composer: schedules and orchestrates DAGs of other jobs.' },
  { id: 'workflows', name: 'Workflows', blurb: 'Lightweight serverless orchestration of API calls.' },
];
const DATA_RULES = {
  job: {
    'Process events as they arrive': { dataflow: 6, spark: 1 },
    'Run Spark code we already have': { spark: 7 },
    'Transform tables already in BigQuery': { dataform: 6, dataflow: 1 },
    'Replicate a database into BigQuery': { datastream: 7, dataflow: 1 },
    'Schedule many dependent jobs': { airflow: 6, workflows: 3 },
  },
  team: {
    'SQL analysts': { dataform: 3, fusion: 1 },
    'Data engineers who code': { dataflow: 2, spark: 2, airflow: 2 },
    'Prefer point and click': { fusion: 4, datastream: 1 },
  },
  size: {
    'Small, a few jobs': { workflows: 2, dataform: 1 },
    'Large and growing': { dataflow: 2, spark: 1, airflow: 1 },
  },
};
const DATA_WHY = {
  job: { 'Process events as they arrive': 'handles streams', 'Run Spark code we already have': 'runs Spark as is', 'Transform tables already in BigQuery': 'works in BigQuery SQL', 'Replicate a database into BigQuery': 'captures changes', 'Schedule many dependent jobs': 'orchestrates jobs' },
  team: { 'SQL analysts': 'suits SQL users', 'Data engineers who code': 'suits engineers', 'Prefer point and click': 'has a visual builder' },
  size: { 'Small, a few jobs': 'light to run', 'Large and growing': 'scales up' },
};
export const dataToolChooser = (inputs, opts) => chooser('data-tool-chooser', DATA_OPTIONS, DATA_RULES, DATA_WHY, inputs, opts);
