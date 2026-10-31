// Every lab demo in one place: what it teaches, how a request flows between the Google Cloud services
// involved (drives the animated diagram), which buttons it has, and which action the "Run all" suite uses.
// Flow steps are [from, to, label]; from === to means work done inside that node. Each action's
// run(inputs) executes in the browser and returns a DemoResult (see src/lab/lab.js).
import foundations from './entries/foundations.js';
import compute from './entries/compute.js';
import storage from './entries/storage.js';
import network from './entries/network.js';
import data from './entries/data.js';
import ai from './entries/ai.js';
import ops from './entries/ops.js';
import security from './entries/security.js';

/** The participants a flow can show. Colors are CSS variables defined in App.css. */
export const NODE_META = {
  dev: { label: 'You', sub: 'gcloud / console', color: 'var(--n-dev)' },
  gh: { label: 'GitHub', sub: 'repo + Actions', color: 'var(--n-gh)' },
  internet: { label: 'Internet', sub: 'users and bots', color: 'var(--n-internet)' },
  lb: { label: 'Load Balancer', sub: 'Armor + CDN', color: 'var(--n-lb)' },
  iam: { label: 'IAM', sub: 'who may do what', color: 'var(--n-iam)' },
  billing: { label: 'Billing', sub: 'account + budgets', color: 'var(--n-billing)' },
  api: { label: 'Google APIs', sub: '*.googleapis.com', color: 'var(--n-api)' },
  build: { label: 'Cloud Build', sub: 'CI', color: 'var(--n-build)' },
  registry: { label: 'Artifact Registry', sub: 'images', color: 'var(--n-registry)' },
  pubsub: { label: 'Pub/Sub', sub: 'topic + subscription', color: 'var(--n-pubsub)' },
  fn: { label: 'Function', sub: 'Cloud Run functions', color: 'var(--n-fn)' },
  run: { label: 'Cloud Run', sub: 'container instances', color: 'var(--n-run)' },
  gce: { label: 'Compute Engine', sub: 'VMs', color: 'var(--n-gce)' },
  gke: { label: 'GKE', sub: 'Kubernetes', color: 'var(--n-gke)' },
  vpc: { label: 'VPC', sub: 'routes + firewall', color: 'var(--n-vpc)' },
  nat: { label: 'Cloud NAT', sub: 'outbound', color: 'var(--n-nat)' },
  dataflow: { label: 'Dataflow', sub: 'Beam pipeline', color: 'var(--n-dataflow)' },
  secret: { label: 'Secret Manager', sub: 'versions', color: 'var(--n-secret)' },
  ai: { label: 'Gemini model', sub: 'Agent Platform', color: 'var(--n-ai)' },
  gcs: { label: 'Cloud Storage', sub: 'bucket', color: 'var(--n-gcs)' },
  sql: { label: 'Cloud SQL', sub: 'PostgreSQL', color: 'var(--n-sql)' },
  spanner: { label: 'Spanner', sub: 'splits', color: 'var(--n-spanner)' },
  fstore: { label: 'Firestore', sub: 'documents', color: 'var(--n-fstore)' },
  bq: { label: 'BigQuery', sub: 'warehouse', color: 'var(--n-bq)' },
  log: { label: 'Cloud Logging', sub: 'Log Router', color: 'var(--n-log)' },
  mon: { label: 'Monitoring', sub: 'SLOs + alerts', color: 'var(--n-mon)' },
};

/** Left-to-right order of the participants in every diagram. */
export const NODE_ORDER = ['dev', 'gh', 'internet', 'lb', 'iam', 'billing', 'api', 'build', 'registry', 'pubsub', 'dataflow', 'fn', 'run', 'gce', 'gke', 'vpc', 'nat', 'secret', 'ai', 'gcs', 'sql', 'spanner', 'fstore', 'bq', 'log', 'mon'];

export function nodesFor(flow) {
  const used = new Set(flow.flatMap(([from, to]) => [from, to]));
  return NODE_ORDER.filter((id) => used.has(id));
}

export const DEMOS = [...foundations, ...compute, ...storage, ...network, ...data, ...ai, ...ops, ...security];

export const CATEGORIES = [...new Set(DEMOS.map((d) => d.category))];
