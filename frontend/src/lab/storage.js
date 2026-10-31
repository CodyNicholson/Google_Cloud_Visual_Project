// Storage and databases: Cloud Storage classes and access, choosing a database, Cloud SQL
// connections, key design for Spanner and Bigtable, and Firestore's ramp-up rule.
import { Demo, GcpError, bool, clampInt, oneOf, round, seeded, usd } from './lab.js';
import { chooser } from './compute.js';

// ---- Storage classes ------------------------------------------------------------------------

// Illustrative US regional list prices, per GB. Check the pricing page before relying on them.
export const CLASSES = [
  { id: 'Standard', store: 0.02, read: 0, minDays: 0 },
  { id: 'Nearline', store: 0.01, read: 0.01, minDays: 30 },
  { id: 'Coldline', store: 0.004, read: 0.02, minDays: 90 },
  { id: 'Archive', store: 0.0012, read: 0.05, minDays: 365 },
];

export function classCost(cls, { sizeGb, days, readsPerMonth }) {
  const storedMonths = days / 30;
  const billedDays = Math.max(days, cls.minDays);
  const storage = sizeGb * cls.store * storedMonths;
  const earlyDelete = sizeGb * cls.store * ((billedDays - days) / 30);
  const retrieval = sizeGb * readsPerMonth * storedMonths * cls.read;
  return { ...cls, storage, earlyDelete, retrieval, total: storage + earlyDelete + retrieval };
}

export function storageClasses(inputs, opts = {}) {
  const d = new Demo('storage-classes');
  const sizeGb = clampInt(opts.sizeGb ?? inputs.sizeGb, 1, 1000000, 1000);
  const days = clampInt(opts.days ?? inputs.days, 1, 3650, 180);
  const readsPerMonth = clampInt(opts.reads ?? inputs.reads, 0, 100, 0) ;
  d.cmd(`gcloud storage buckets create gs://my-lab-archive --location=us-central1 --default-storage-class=STANDARD`);
  d.cmd(`Model: ${sizeGb} GB kept ${days} days, read in full ${readsPerMonth} time(s) a month`);
  const costs = CLASSES.map((c) => classCost(c, { sizeGb, days, readsPerMonth }));
  const best = [...costs].sort((a, b) => a.total - b.total)[0];
  costs.forEach((c) => d.cmd(`${c.id}: ${usd(c.total)} (storage ${usd(c.storage)}, retrieval ${usd(c.retrieval)}, early delete ${usd(c.earlyDelete)})`));
  d.check('The cheapest class is identified', costs.every((c) => best.total <= c.total), `${best.id} at ${usd(best.total)}`);
  if (opts.days) {
    const archive = costs.find((c) => c.id === 'Archive');
    d.check('Deleting early still bills the minimum duration', archive.earlyDelete > 0, `${usd(archive.earlyDelete)} early-delete charge for ${days} of ${archive.minDays} days`);
    d.check('Reads make a cold class the most expensive', costs.find((c) => c.id === 'Archive').total > costs.find((c) => c.id === 'Standard').total, `Archive ${usd(archive.total)}, Standard ${usd(costs[0].total)}`);
    d.cmd('# Fix: use Standard for hot data, or turn on Autoclass and let the bucket decide');
  } else {
    d.check('Each class charges retrieval as documented', costs[0].retrieval === 0, 'only Standard has no retrieval fee here');
  }
  return d.result({ costs, best: best.id, max: Math.max(...costs.map((c) => c.total)), sizeGb, days, readsPerMonth });
}

// ---- Bucket access --------------------------------------------------------------------------

const PRINCIPALS = ['app service account', 'teammate (no grant)', 'anonymous internet user'];
const POSTURES = ['Private, grant on the bucket', 'Public via allUsers', 'Signed URL (time-limited)'];

export function storageAccess(inputs, opts = {}) {
  const d = new Demo('storage-access');
  const principal = oneOf(opts.principal || inputs.principal, PRINCIPALS);
  const posture = oneOf(opts.posture || inputs.posture, POSTURES);
  const pap = opts.pap ?? bool(inputs.pap);
  const email = principal === 'app service account' ? 'app@my-lab.iam.gserviceaccount.com' : principal === 'teammate (no grant)' ? 'teammate@example.com' : 'Anonymous caller';
  d.cmd('gcloud storage buckets create gs://acme-invoices --uniform-bucket-level-access' + (pap ? ' --public-access-prevention' : ''));
  if (posture.startsWith('Private')) d.cmd('gcloud storage buckets add-iam-policy-binding gs://acme-invoices --member=serviceAccount:app@my-lab.iam.gserviceaccount.com --role=roles/storage.objectViewer');
  if (posture.startsWith('Public')) d.cmd('gcloud storage buckets add-iam-policy-binding gs://acme-invoices --member=allUsers --role=roles/storage.objectViewer');
  if (posture.startsWith('Signed')) d.cmd('gcloud storage sign-url gs://acme-invoices/inv-42.pdf --duration=15m --impersonate-service-account=app@my-lab.iam.gserviceaccount.com');
  const trace = [];
  const publicBlocked = posture.startsWith('Public') && pap;
  if (publicBlocked) trace.push({ step: 'Public access prevention', result: 'blocked', note: 'allUsers and allAuthenticatedUsers grants cannot apply on this bucket' });
  let allowed;
  if (posture.startsWith('Signed')) {
    allowed = true;
    trace.push({ step: 'Signature', result: 'allowed', note: 'the URL carries the signer’s authority until it expires (at most 7 days)' });
  } else if (posture.startsWith('Public')) {
    allowed = !pap;
    trace.push({ step: 'IAM', result: allowed ? 'allowed' : 'blocked', note: 'allUsers holds storage.objects.get' });
  } else {
    allowed = principal === 'app service account';
    trace.push({ step: 'IAM', result: allowed ? 'allowed' : 'blocked', note: allowed ? 'objectViewer on the bucket' : 'no role on this bucket or its project' });
  }
  const error = allowed ? null : `403 ${email} does not have storage.objects.get access to the Google Cloud Storage object.`;
  d.cmd(`gcloud storage cat gs://acme-invoices/inv-42.pdf   # as ${principal}`);
  if (error) d.cmd(`✗ ${error}`);
  // Bucket names are global: the second attempt collides
  const names = new Set(['test', 'backup', 'acme-invoices']);
  const taken = d.attempt(`gcloud storage buckets create gs://${opts.nameClash ? 'backup' : 'acme-invoices-2031'}`, () => {
    if (opts.nameClash) throw new GcpError('409', 'Conflict. Sorry, that name is not available. Please try a different one.');
    names.add('acme-invoices-2031');
  });
  if (opts.nameClash) {
    d.check('Bucket names are global across all customers', !taken.ok, 'someone in any project already owns it');
    d.cmd('# Fix: prefix with your project or company, and keep names free of secrets: they are visible');
  }
  d.check('The access decision follows the chosen posture', allowed === (posture.startsWith('Signed') || (posture.startsWith('Public') && !pap) || (posture.startsWith('Private') && principal === 'app service account')), allowed ? 'allowed' : 'denied');
  return d.result({ principal, posture, pap, trace, allowed, error: error || (opts.nameClash ? `${taken.error.name} ${taken.error.message}` : null), matrix: PRINCIPALS.map((p) => ({ principal: p, private: p === 'app service account', public: !pap, signed: true })) });
}

// ---- Which database? ------------------------------------------------------------------------

export const DB_OPTIONS = [
  { id: 'sql', name: 'Cloud SQL', blurb: 'Managed PostgreSQL, MySQL and SQL Server for a normal app.' },
  { id: 'alloydb', name: 'AlloyDB', blurb: 'PostgreSQL-compatible, built for heavy transactional plus analytical load.' },
  { id: 'spanner', name: 'Spanner', blurb: 'Relational and horizontally scalable, with strong global consistency.' },
  { id: 'firestore', name: 'Firestore', blurb: 'Serverless document database with client SDKs and live updates.' },
  { id: 'bigtable', name: 'Bigtable', blurb: 'Huge wide-column store for time series and high-volume keyed reads.' },
  { id: 'memorystore', name: 'Memorystore', blurb: 'Managed Redis and Valkey for caching and fast ephemeral data.' },
  { id: 'bigquery', name: 'BigQuery', blurb: 'Analytics warehouse: scans over billions of rows, not per-user lookups.' },
];
const DB_RULES = {
  shape: {
    'Relational tables and joins': { sql: 4, alloydb: 3, spanner: 3 },
    'JSON-like documents': { firestore: 5, spanner: 1 },
    'Keys with huge volume (time series, IoT)': { bigtable: 5, spanner: 1 },
    'Reports across billions of rows': { bigquery: 6, alloydb: 1 },
    'Temporary values, sessions, cache': { memorystore: 6 },
  },
  scale: {
    'One region, up to a few TB': { sql: 3, alloydb: 2, firestore: 1, memorystore: 1 },
    'Heavy growth in one region': { alloydb: 3, bigtable: 2, spanner: 1, bigquery: 1 },
    'Global users, strong consistency': { spanner: 5, firestore: 2 },
  },
  ops: {
    'Keep the database I already know': { sql: 3, alloydb: 2 },
    'Pay only when used, no sizing': { firestore: 3, bigquery: 2, spanner: 1 },
    'Lowest latency matters most': { memorystore: 3, bigtable: 2, spanner: 1 },
  },
};
const DB_WHY = {
  shape: { 'Relational tables and joins': 'speaks SQL with joins', 'JSON-like documents': 'stores documents natively', 'Keys with huge volume (time series, IoT)': 'built for keyed volume', 'Reports across billions of rows': 'scans at warehouse scale', 'Temporary values, sessions, cache': 'keeps data in memory' },
  scale: { 'One region, up to a few TB': 'comfortable at this size', 'Heavy growth in one region': 'scales up with growth', 'Global users, strong consistency': 'replicates across regions' },
  ops: { 'Keep the database I already know': 'keeps your skills and tools', 'Pay only when used, no sizing': 'no instance sizing', 'Lowest latency matters most': 'very low latency' },
};
export const databaseChooser = (inputs, opts) => chooser('database-chooser', DB_OPTIONS, DB_RULES, DB_WHY, inputs, opts);

// ---- Cloud SQL connections ------------------------------------------------------------------

export const TOO_MANY = 'FATAL: sorry, too many clients already';
export const PER_INSTANCE_LIMIT = 100;

export function cloudSql(inputs, opts = {}) {
  const d = new Demo('cloud-sql-connections');
  const maxInstances = clampInt(opts.maxInstances ?? inputs.maxInstances, 1, 500, 10);
  const pool = clampInt(opts.pool ?? inputs.pool, 1, 200, 5);
  const maxConnections = clampInt(inputs.maxConnections, 25, 4000, 100);
  const other = clampInt(inputs.other, 0, 500, 10);
  d.cmd('gcloud run deploy api --add-cloudsql-instances=my-lab:us-central1:orders --service-account=api@my-lab.iam.gserviceaccount.com');
  d.cmd(`pool = create_engine(url, pool_size=${pool}, max_overflow=0, pool_recycle=1800)`);
  const perInstance = Math.min(pool, PER_INSTANCE_LIMIT);
  const wanted = maxInstances * perInstance + other;
  const free = maxConnections - other;
  const fit = Math.max(0, Math.floor(free / perInstance));
  const safeMax = fit;
  const ok = wanted <= maxConnections;
  d.cmd(`${maxInstances} instances × ${perInstance} connections + ${other} others = ${wanted} of ${maxConnections}`);
  if (!ok) d.cmd(`✗ ${TOO_MANY}`);
  const safePool = Math.floor(free / maxInstances);
  if (opts.pool) {
    d.check('Autoscaling multiplies each pool until the database refuses', !ok, `${wanted} wanted, ${maxConnections} allowed`);
    d.check('Each Cloud Run instance is limited to 100 connections', pool >= PER_INSTANCE_LIMIT && perInstance === PER_INSTANCE_LIMIT, `pool asked for ${pool}`);
    d.cmd(`# Fix: --max-instances=${maxInstances} with pool_size=${Math.max(1, safePool)}, or a larger instance`);
    d.check('A smaller pool fits the same scale', maxInstances * Math.max(1, safePool) + other <= maxConnections || safePool < 1, `pool_size=${Math.max(1, safePool)}`);
  } else {
    d.check('Total connections equal instances × pool + others', wanted === maxInstances * perInstance + other, `${wanted}`);
    d.check('The limit decision matches the numbers', ok === (wanted <= maxConnections), ok ? 'fits' : 'too many clients');
  }
  return d.result({ maxInstances, pool, perInstance, other, wanted, maxConnections, ok, safeMax, safePool, error: ok ? null : TOO_MANY });
}

// ---- Key design: hotspots in Spanner and Bigtable ------------------------------------------

export const KEY_SCHEMES = {
  'Timestamp first (monotonic)': { good: false, ddl: 'PRIMARY KEY (LastAccess, UserId)' },
  'Random UUIDv4': { good: true, ddl: 'LogEntryId UUID DEFAULT (NEW_UUID()) ... PRIMARY KEY (LogEntryId)' },
  'Hashed shard prefix': { good: true, ddl: 'ShardId INT64 AS (MOD(FARM_FINGERPRINT(...), 2048)) STORED ... PRIMARY KEY (ShardId, LastAccess, UserId)' },
  'User ID, then timestamp': { good: true, ddl: 'PRIMARY KEY (UserId, LastAccess)' },
};

/** Returns where each new key lands in [0, 1) of the key space. */
function keyPosition(scheme, i, n, rng) {
  if (scheme.startsWith('Timestamp')) return 0.95 + (0.05 * i) / n; // New rows always sort after the old ones
  if (scheme.startsWith('Random')) return rng();
  if (scheme.startsWith('Hashed')) return Math.floor(rng() * 2048) / 2048;
  return Math.floor(rng() * 500) / 500; // A few hundred active users spread over the key space
}

export function keyHotspots(inputs, opts = {}) {
  const d = new Demo('key-hotspots');
  const scheme = oneOf(opts.scheme || inputs.scheme, Object.keys(KEY_SCHEMES));
  const writes = clampInt(inputs.writes, 100, 20000, 5000);
  const splits = clampInt(inputs.splits, 2, 16, 8);
  const rng = seeded(11);
  d.cmd(`CREATE TABLE UserAccessLogs (…) ${KEY_SCHEMES[scheme].ddl};`);
  d.cmd(`INSERT ${writes.toLocaleString()} rows across ${splits} key-range splits`);
  const counts = Array(splits).fill(0);
  for (let i = 0; i < writes; i++) counts[Math.min(splits - 1, Math.floor(keyPosition(scheme, i, writes, rng) * splits))] += 1;
  const hottest = Math.max(...counts);
  const share = hottest / writes;
  const ideal = 1 / splits;
  counts.forEach((c, i) => d.cmd(`split ${i + 1}: ${c.toLocaleString()} writes`));
  if (opts.scheme) {
    d.check('A monotonic key sends all new writes to the last split', share > 0.99, `${round(share * 100, 1)}% on one server, ${splits - 1} idle`);
    const fixRng = seeded(3);
    const fixed = Array(splits).fill(0);
    for (let i = 0; i < writes; i++) fixed[Math.min(splits - 1, Math.floor(fixRng() * splits))] += 1;
    d.cmd('# Fix: lead the key with a UUIDv4, a hash shard or a user ID');
    d.check('A random key spreads the same writes', Math.max(...fixed) / writes < ideal * 1.5, `busiest split ${round((Math.max(...fixed) / writes) * 100, 1)}%`);
  } else if (KEY_SCHEMES[scheme].good) {
    d.check('This key spreads writes across splits', share < ideal * 1.6, `busiest split ${round(share * 100, 1)}% (even would be ${round(ideal * 100, 1)}%)`);
  } else {
    d.check('This key piles writes onto one split', share > 0.9, `${round(share * 100, 1)}% on one split`);
  }
  d.check('Every write landed in a split', counts.reduce((a, b) => a + b, 0) === writes, `${writes.toLocaleString()} writes`);
  return d.result({ scheme, counts, hottest, share, writes, splits, good: KEY_SCHEMES[scheme].good });
}

// ---- Firestore ------------------------------------------------------------------------------

export const CONTENTION = 'ABORTED: Too much contention on these datastore entities. Please try again.';
export const NEEDS_INDEX = 'FAILED_PRECONDITION: The query requires an index. You can create it here: https://console.firebase.google.com/project/my-lab/firestore/indexes?create_composite=…';

/** 500/50/5: start at 500 ops/s and add 50% every 5 minutes. */
export function rampSchedule(target) {
  const steps = [];
  let rate = 500;
  let minute = 0;
  while (rate < target && steps.length < 40) {
    steps.push({ minute, rate: Math.round(rate) });
    rate *= 1.5;
    minute += 5;
  }
  steps.push({ minute, rate: Math.round(Math.min(rate, target)) });
  return steps;
}

export function firestore(inputs, opts = {}) {
  const d = new Demo('firestore');
  const jump = opts.jump ?? false;
  // The mistake only shows above what a new collection can take
  const target = jump ? Math.max(5000, clampInt(inputs.target, 500, 100000, 5000)) : clampInt(inputs.target, 500, 100000, 5000);
  const steps = rampSchedule(target);
  const minutes = steps[steps.length - 1].minute;
  d.cmd(`db.collection('orders').add(...)  # new collection, automatic document IDs, target ${target.toLocaleString()} ops/s`);
  const ramp = steps.map((s) => ({ ...s, allowed: s.rate, sent: jump ? target : s.rate, ok: !jump || target <= s.rate }));
  if (jump) {
    d.cmd(`Sending ${target.toLocaleString()} ops/s from the first second`);
    d.cmd(`✗ ${CONTENTION}`);
    d.check('Sending full load to a new collection overruns the ramp', ramp[0].sent > ramp[0].allowed, `${target.toLocaleString()} sent against about 500 ops/s of warmed capacity`);
    d.cmd(`# Fix: ramp up over ${minutes} minutes`);
    d.check('The 500/50/5 ramp reaches the same target safely', steps[steps.length - 1].rate >= target, `${minutes} minutes`);
  } else {
    d.check('The ramp starts at 500 ops/s', steps[0].rate === 500 || target <= 500, `${steps[0].rate} ops/s`);
    d.check('Each step is at most 50% larger, every 5 minutes', steps.every((s, i) => i === 0 || (s.rate <= steps[i - 1].rate * 1.5 + 1 && s.minute - steps[i - 1].minute === 5)), `${steps.length} steps, ${minutes} minutes`);
  }
  const indexes = new Set();
  const runQuery = () => {
    if (!indexes.has('status+total')) throw new GcpError('FAILED_PRECONDITION', NEEDS_INDEX.split(': ').slice(1).join(': '));
    return 'ok';
  };
  const query = opts.query ? d.attempt("db.collection('orders').where('status','==','open').orderBy('total')", runQuery) : null;
  if (query) {
    d.check('Filtering one field and sorting another needs a composite index', !query.ok, 'the error links to a pre-filled index form');
    d.cmd('gcloud firestore indexes composite create --collection-group=orders --field-config=field-path=status,order=ascending --field-config=field-path=total,order=ascending');
    indexes.add('status+total');
    d.check('After the index builds the query works', runQuery() === 'ok', 'declare indexes in firestore.indexes.json so every environment gets them');
  }
  return d.result({ target, steps: ramp, minutes, jump, error: jump ? CONTENTION : query ? NEEDS_INDEX : null });
}
