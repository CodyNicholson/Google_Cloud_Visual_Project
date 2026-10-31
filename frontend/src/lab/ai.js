// AI: choosing a service, handling quota errors, and retrieval (RAG) with a real search over a small corpus.
import { Demo, bool, clampInt, oneOf, round, seeded } from './lab.js';
import { chooser } from './compute.js';

export const AI_OPTIONS = [
  { id: 'studio', name: 'Gemini API in Google AI Studio', blurb: 'API key, fast start, prototypes and small apps.' },
  { id: 'agent', name: 'Gemini Enterprise Agent Platform', blurb: 'Formerly Vertex AI: IAM, VPC controls, Model Garden, tuning, agents, MLOps.' },
  { id: 'enterprise', name: 'Gemini Enterprise', blurb: 'A ready-made search and assistant app for employees over company data.' },
  { id: 'apis', name: 'Prebuilt APIs', blurb: 'Vision, Speech-to-Text, Translation, Document AI: one job, no model to manage.' },
  { id: 'bqml', name: 'BigQuery ML', blurb: 'Train and call models with SQL where the data already lives.' },
  { id: 'custom', name: 'GPUs and TPUs on GKE or Compute Engine', blurb: 'Run your own model with full control, and full responsibility.' },
];
const AI_RULES = {
  goal: {
    'Add generative AI to an app': { agent: 4, studio: 4 },
    'Build agents with tools and data': { agent: 6, enterprise: 1 },
    'Give employees a company search assistant': { enterprise: 7, agent: 1 },
    'One task: OCR, speech, translation': { apis: 7 },
    'Predictions from warehouse tables': { bqml: 7, agent: 2 },
    'Serve my own trained model': { custom: 5, agent: 4 },
  },
  stage: {
    'A prototype this week': { studio: 4, apis: 2, bqml: 1 },
    'Production with company data': { agent: 4, enterprise: 2, apis: 1, bqml: 1, custom: 1 },
  },
  team: {
    'App developers': { studio: 1, agent: 2, apis: 2, enterprise: 1 },
    'Data analysts': { bqml: 4, enterprise: 1 },
    'ML engineers': { custom: 3, agent: 3 },
  },
};
const AI_WHY = {
  goal: { 'Add generative AI to an app': 'calls Gemini models directly', 'Build agents with tools and data': 'has agent tooling', 'Give employees a company search assistant': 'is that product', 'One task: OCR, speech, translation': 'does the task with one API call', 'Predictions from warehouse tables': 'trains in SQL', 'Serve my own trained model': 'hosts custom models' },
  stage: { 'A prototype this week': 'quick to start', 'Production with company data': 'has enterprise controls' },
  team: { 'App developers': 'suits developers', 'Data analysts': 'uses SQL', 'ML engineers': 'gives low-level control' },
};
export const aiChooser = (inputs, opts) => chooser('ai-chooser', AI_OPTIONS, AI_RULES, AI_WHY, inputs, opts);

// ---- Quota errors and retries ---------------------------------------------------------------

export const RESOURCE_EXHAUSTED = '429 RESOURCE_EXHAUSTED: Resource exhausted. Please try again later.';
const STRATEGIES = ['Exponential backoff with jitter', 'Immediate retry, forever', 'No retry'];

/** Requests arrive over 10 s; the model allows `quota` per second. Retries re-enter the queue. */
export function runRetries({ clients, quota, strategy, seconds = 40, seed = 5 }) {
  const rng = seeded(seed);
  const buckets = Array.from({ length: seconds }, () => []);
  for (let i = 0; i < clients; i++) buckets[Math.floor(rng() * 10)].push({ id: i, tries: 0 });
  const series = [];
  let ok = 0;
  let failed = 0;
  let calls = 0;
  for (let t = 0; t < seconds; t++) {
    const attempts = buckets[t];
    calls += attempts.length;
    const admitted = attempts.slice(0, quota);
    const refused = attempts.slice(quota);
    ok += admitted.length;
    refused.forEach((req) => {
      req.tries += 1;
      if (strategy === 'No retry' || req.tries > 12) { failed += 1; return; }
      const wait = strategy.startsWith('Immediate') ? 1 : Math.max(1, Math.ceil(rng() * 2 ** Math.min(req.tries, 5)));
      if (t + wait < seconds) buckets[t + wait].push(req); else failed += 1;
    });
    series.push({ t, ok: admitted.length, refused: refused.length });
  }
  const pendingAtEnd = 0;
  return { series, ok, failed: failed + pendingAtEnd, calls, peakRefused: Math.max(...series.map((s) => s.refused)) };
}

export function aiQuotas(inputs, opts = {}) {
  const d = new Demo('ai-quotas');
  const storm = opts.strategy?.startsWith('Immediate');
  const clients = storm ? 120 : clampInt(inputs.clients, 10, 400, 120);
  const quota = storm ? 6 : clampInt(inputs.quota, 1, 50, 6);
  const strategy = oneOf(opts.strategy || inputs.strategy, STRATEGIES);
  d.cmd(`client.models.generate_content(model="gemini-…", …)  # ${clients} requests in 10 s, ${quota}/s available`);
  const r = runRetries({ clients, quota, strategy });
  if (r.peakRefused) d.cmd(`✗ ${RESOURCE_EXHAUSTED}`);
  d.cmd(`${strategy}: ${r.ok} succeeded, ${r.failed} failed, ${r.calls} API calls in total`);
  if (opts.strategy?.startsWith('Immediate')) {
    const good = runRetries({ clients, quota, strategy: STRATEGIES[0] });
    d.check('Immediate retries multiply the load', r.calls > good.calls, `${r.calls} calls versus ${good.calls} with backoff`);
    d.check('Backoff with jitter finishes at least as many requests', good.ok >= r.ok, `${good.ok} versus ${r.ok} succeeded`);
    d.cmd('# Fix: exponential backoff with jitter; for steady production load, request quota or buy Provisioned Throughput');
  } else if (strategy === 'No retry') {
    d.check('Without retries a burst loses requests', r.failed > 0 || clients <= quota * 10, `${r.failed} requests lost`);
  } else {
    d.check('Admitted requests never exceed the quota', r.series.every((s) => s.ok <= quota), `at most ${quota}/s`);
    d.check('Backoff spreads the burst over time', r.series.filter((s) => s.ok > 0).length >= Math.min(10, r.ok / quota - 1), `${r.ok} of ${clients} done`);
  }
  return d.result({ ...r, clients, quota, strategy, retryAmp: round(r.calls / clients, 1) });
}

// ---- RAG: a real keyword-vector search over a tiny corpus -----------------------------------

export const CORPUS = [
  { id: 'run-1', title: 'Cloud Run scaling', text: 'Cloud Run scales container instances to match requests. Concurrency sets how many requests one instance handles. The maximum is 1000 and instances can scale to zero when idle.' },
  { id: 'run-2', title: 'Cloud Run startup', text: 'A Cloud Run container must listen on the port in the PORT environment variable on address 0.0.0.0. Otherwise the revision fails to start.' },
  { id: 'gcs-1', title: 'Storage classes', text: 'Cloud Storage Nearline has a 30 day minimum storage duration, Coldline 90 days and Archive 365 days. Deleting earlier still charges the minimum.' },
  { id: 'bq-1', title: 'BigQuery cost', text: 'BigQuery on-demand pricing bills the bytes a query scans. A LIMIT clause does not reduce the bytes read on a non-clustered table. Select only the columns you need.' },
  { id: 'pubsub-1', title: 'Pub/Sub delivery', text: 'Pub/Sub delivers messages at least once. A subscriber must acknowledge before the ack deadline, which defaults to 10 seconds, or the message is delivered again.' },
  { id: 'iam-1', title: 'IAM deny', text: 'IAM checks deny policies before allow policies. A deny rule blocks a permission even if a role grants it, including the Owner role.' },
];
export const QUESTIONS = {
  'How many requests can one Cloud Run instance handle?': 'run-1',
  'What port must my Cloud Run container listen on?': 'run-2',
  'What is the minimum storage duration for Coldline?': 'gcs-1',
  'Does LIMIT make a BigQuery query cheaper?': 'bq-1',
  'What happens if a Pub/Sub message is not acknowledged?': 'pubsub-1',
  'Can a deny rule block an Owner?': 'iam-1',
};

const STOP = new Set(['the', 'a', 'an', 'is', 'are', 'of', 'to', 'in', 'on', 'my', 'how', 'what', 'can', 'one', 'and', 'or', 'it', 'if', 'for', 'does', 'must', 'not', 'make', 'many', 'happens', 'that', 'this', 'which', 'be', 'by', 'even', 'you', 'at', 'when', 'before', 'still', 'only', 'sets', 'has']);
export const tokens = (text) => text.toLowerCase().match(/[a-z0-9/]+/g).filter((w) => !STOP.has(w));

/** TF-IDF vectors with cosine similarity: a stand-in for an embedding model that really ranks. */
export function search(query, docs = CORPUS) {
  const df = new Map();
  docs.forEach((doc) => new Set(tokens(`${doc.title} ${doc.text}`)).forEach((w) => df.set(w, (df.get(w) || 0) + 1)));
  const idf = (w) => Math.log(1 + docs.length / (1 + (df.get(w) || 0)));
  const vector = (text) => {
    const v = new Map();
    tokens(text).forEach((w) => v.set(w, (v.get(w) || 0) + idf(w)));
    return v;
  };
  const q = vector(query);
  const norm = (v) => Math.sqrt([...v.values()].reduce((n, x) => n + x * x, 0)) || 1;
  return docs.map((doc) => {
    const v = vector(`${doc.title} ${doc.text}`);
    const dot = [...q.entries()].reduce((n, [w, x]) => n + x * (v.get(w) || 0), 0);
    return { ...doc, score: round(dot / (norm(q) * norm(v)), 3) };
  }).sort((a, b) => b.score - a.score);
}

export function rag(inputs, opts = {}) {
  const d = new Demo('rag');
  const question = oneOf(inputs.question, Object.keys(QUESTIONS));
  const k = clampInt(inputs.k, 1, 6, 2);
  const retrieve = opts.retrieve ?? bool(inputs.retrieve);
  d.cmd(`embed("${question}")`);
  const ranked = search(question);
  ranked.slice(0, 3).forEach((r) => d.cmd(`vector search: ${r.id} score ${r.score}`));
  const context = retrieve ? ranked.slice(0, k) : [];
  const expected = QUESTIONS[question];
  d.cmd(retrieve ? `generate(prompt + ${context.length} retrieved passage(s))` : 'generate(prompt only, no passages)');
  const answer = retrieve ? context[0].text : 'I am a language model with a training cutoff. It might be 80? (no source to check against)';
  if (retrieve) {
    d.check('Retrieval ranks the passage that holds the answer first', ranked[0].id === expected, `${ranked[0].id}, score ${ranked[0].score}`);
    d.check('The answer cites its source', context.some((c) => c.id === expected), context.map((c) => c.id).join(', '));
  } else {
    d.check('Without retrieval the model has nothing to ground on', context.length === 0, 'no citation, and details may be outdated or invented');
    d.check('Retrieval would have found it', ranked[0].id === expected, `${ranked[0].id} was in the corpus`);
    d.cmd('# Fix: retrieve first with RAG Engine or Agent Search, then pass the passages and require citations');
  }
  return d.result({ question, ranked, context, answer, retrieve, expected });
}
