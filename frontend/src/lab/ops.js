// DevOps and operations: CI/CD gates, Terraform state, log routing, and SLO alerting.
import { Demo, bool, clampInt, clamp, oneOf, round, seeded, usd, walkGates } from './lab.js';

// ---- CI/CD ----------------------------------------------------------------------------------

export const CICD_ERRORS = {
  auth: 'denied: Unauthenticated request. Unauthenticated requests do not have permission "artifactregistry.repositories.uploadArtifacts" on resource',
  repo: 'name unknown: Repository "app" not found',
  push: 'denied: Permission "artifactregistry.repositories.uploadArtifacts" denied on resource "projects/my-lab/locations/us-central1/repositories/app" (or it may not exist)',
  deploy: "PERMISSION_DENIED: Permission 'run.services.update' denied on resource 'namespaces/my-lab/services/web' (or resource may not exist).",
  actas: "PERMISSION_DENIED: Permission 'iam.serviceaccounts.actAs' denied on service account web@my-lab.iam.gserviceaccount.com (or it may not exist).",
};

export function cicd(inputs, opts = {}) {
  const d = new Demo('ci-cd');
  const on = (n) => (opts.skip === n ? false : bool(inputs[n]));
  const canary = clampInt(inputs.canary, 0, 100, 10);
  const { gates, failed, ok } = walkGates([
    { id: 'auth', label: 'Federated login', cmd: 'google-github-actions/auth → Workload Identity Federation (no key)', open: on('auth'), error: CICD_ERRORS.auth },
    { id: 'repo', label: 'Repository exists', cmd: 'gcloud artifacts repositories create app --repository-format=docker --location=us-central1', open: on('repo'), error: CICD_ERRORS.repo },
    { id: 'push', label: 'Writer role', cmd: 'gcloud builds submit --tag us-central1-docker.pkg.dev/my-lab/app/web:$SHA', open: on('push'), error: CICD_ERRORS.push },
    { id: 'deploy', label: 'Cloud Run role', cmd: 'gcloud run deploy web --image=…:$SHA --no-traffic --tag=canary', open: on('deploy'), error: CICD_ERRORS.deploy },
    { id: 'actas', label: 'Act as runtime account', cmd: 'gcloud iam service-accounts add-iam-policy-binding web@my-lab… --role=roles/iam.serviceAccountUser', open: on('actas'), error: CICD_ERRORS.actas },
  ]);
  gates.filter((g) => g.status === 'pass').forEach((g) => d.cmd(g.cmd));
  if (failed) d.cmd(`✗ ${failed.error}`);
  const traffic = ok ? [{ revision: 'web-00041 (stable)', pct: 100 - canary }, { revision: 'web-00042 (new)', pct: canary }] : [{ revision: 'web-00041 (stable)', pct: 100 }];
  if (ok) d.cmd(`gcloud run services update-traffic web --to-revisions=web-00042=${canary}`);
  if (opts.skip) {
    d.check('The pipeline stops at the missing grant', failed?.id === opts.skip, failed?.label);
    d.check('Production traffic is untouched by the failed pipeline', traffic[0].pct === 100, 'the stable revision still serves everything');
    d.cmd('# Fix: grant it, or create what is missing, then re-run');
  } else {
    d.check('Stages run in order and stop at the first failure', gates.findIndex((g) => g.status === 'fail') === gates.findIndex((g) => !g.open), failed ? failed.label : 'all passed');
    d.check('Traffic always adds up to 100%', traffic.reduce((n, t) => n + t.pct, 0) === 100, traffic.map((t) => `${t.pct}%`).join(' + '));
  }
  return d.result({ gates, ok, error: failed?.error, traffic, canary });
}

// ---- Terraform state ------------------------------------------------------------------------

export const STATE_LOCK = 'Error: Error acquiring the state lock\n\nError message: writing "gs://my-lab-tfstate/prod/default.tflock" failed: googleapi: Error 412: At least one of the pre-conditions you specified did not hold., conditionNotMet';
export const ALREADY_EXISTS = "Error: Error creating Bucket: googleapi: Error 409: Your previous request to create the named bucket succeeded and you already own it., conflict";

/** A tiny model of Terraform: plan compares code with a state; apply creates what the state lacks. */
export function applyTerraform(cloud, state, lock, who) {
  if (lock && lock.holder && lock.holder !== who) return { status: 'locked' };
  const add = ['gs://shop-assets'].filter((r) => !state.has(r));
  if (lock) lock.holder = who;
  for (const resource of add) {
    if (cloud.has(resource)) return { status: 'conflict', plannedAdds: add.length };
    cloud.add(resource);
    state.add(resource);
  }
  return { status: 'applied', plannedAdds: add.length };
}

export function terraformState(inputs, opts = {}) {
  const d = new Demo('terraform-state');
  const backend = oneOf(opts.backend || inputs.backend, ['Cloud Storage backend with locking', 'Local terraform.tfstate on each laptop']);
  const shared = backend.startsWith('Cloud');
  const cloud = new Set();
  const lanes = [];
  if (shared) {
    d.cmd('gcloud storage buckets create gs://my-lab-tfstate --location=us-central1 --uniform-bucket-level-access');
    d.cmd('gcloud storage buckets update gs://my-lab-tfstate --versioning');
    d.cmd('terraform { backend "gcs" { bucket = "my-lab-tfstate"  prefix = "prod" } }');
    const state = new Set();
    const lock = { holder: null };
    const alice = applyTerraform(cloud, state, lock, 'alice');
    d.cmd('Alice: terraform apply → lock acquired, creating gs://shop-assets');
    const blocked = applyTerraform(cloud, state, lock, 'bob');
    d.cmd(`Bob:   terraform apply → ${STATE_LOCK.split('\n')[0]}`);
    lock.holder = null;
    d.cmd('Alice: apply complete, state saved, lock released');
    const bob = applyTerraform(cloud, state, lock, 'bob');
    d.cmd(`Bob:   terraform apply → reads the new state: ${bob.plannedAdds} to add. No changes.`);
    lanes.push({ label: 'Alice', segments: [{ start: 0, end: 60, tone: 'ok', text: 'apply (holds lock)' }] });
    lanes.push({ label: 'Bob', segments: [{ start: 10, end: 60, tone: 'warn', text: 'blocked by lock' }, { start: 62, end: 75, tone: 'ok', text: 'no changes' }] });
    d.check('A second apply waits for the lock instead of racing', alice.status === 'applied' && blocked.status === 'locked', 'state locking is built into the gcs backend');
    d.check('After the lock is released Bob sees Alice’s work', bob.status === 'applied' && bob.plannedAdds === 0, '0 to add');
    d.check('The resource exists exactly once', cloud.size === 1, [...cloud].join(', '));
  } else {
    d.cmd('terraform init   # no backend block: state stays in a local file');
    const alice = applyTerraform(cloud, new Set(), null, 'alice');
    d.cmd('Alice: terraform apply → creates gs://shop-assets, writes her local state');
    const bob = applyTerraform(cloud, new Set(), null, 'bob');
    d.cmd(`Bob:   terraform plan → his state is empty: "${bob.plannedAdds} to add"`);
    d.cmd(`Bob:   terraform apply → ✗ ${ALREADY_EXISTS}`);
    lanes.push({ label: 'Alice', segments: [{ start: 0, end: 60, tone: 'ok', text: 'apply' }] });
    lanes.push({ label: 'Bob', segments: [{ start: 10, end: 45, tone: 'bad', text: 'apply: 409 conflict' }] });
    d.check('Local state means two truths', alice.status === 'applied' && bob.plannedAdds === 1, 'Bob’s plan had no idea Alice had created the bucket');
    d.check('The conflict surfaces only at apply time', bob.status === 'conflict', 'terraform plan looked fine');
    d.cmd('# Fix: add the gcs backend, run terraform init -migrate-state, and import what already exists');
  }
  return d.result({ backend, shared, lanes, error: shared ? null : ALREADY_EXISTS, lockError: shared ? STATE_LOCK : null });
}

// ---- Log routing ----------------------------------------------------------------------------

export const LOG_STREAM = [
  { id: 1, kind: 'Admin Activity audit', severity: 'NOTICE', gbPerDay: 0.1, required: true },
  { id: 2, kind: 'Application INFO', severity: 'INFO', gbPerDay: 2 },
  { id: 3, kind: 'Application DEBUG', severity: 'DEBUG', gbPerDay: 40 },
  { id: 4, kind: 'Load balancer request logs', severity: 'INFO', gbPerDay: 25, lb: true },
  { id: 5, kind: 'Application ERROR', severity: 'ERROR', gbPerDay: 0.2 },
];
const PRICE_PER_GB = 0.5; // Illustrative ingestion price after the free 50 GiB
const FREE_GB = 50;

export function logging(inputs, opts = {}) {
  const d = new Demo('logging');
  const excludeDebug = opts.excludeDebug ?? bool(inputs.excludeDebug);
  const sampleLb = opts.sampleLb ?? bool(inputs.sampleLb);
  const sink = opts.sink ?? bool(inputs.sink);
  d.cmd('# Every entry passes through the Log Router');
  if (excludeDebug) d.cmd('gcloud logging sinks update _Default --add-exclusion=name=no-debug,filter=\'severity=DEBUG\'');
  if (sampleLb) d.cmd('gcloud compute backend-services update web --global --logging-sample-rate=0.1');
  if (sink) d.cmd('gcloud logging sinks create errors-bq bigquery.googleapis.com/projects/my-lab/datasets/errors --log-filter=\'severity>=ERROR\'');
  const routed = LOG_STREAM.map((e) => {
    if (e.required) return { ...e, dest: '_Required bucket', billedGb: 0, note: 'free, 400 days, cannot be excluded' };
    const volume = e.lb && sampleLb ? e.gbPerDay * 0.1 : e.gbPerDay;
    if (e.severity === 'DEBUG' && excludeDebug) return { ...e, dest: 'Excluded', billedGb: 0, note: 'dropped by the exclusion' };
    return { ...e, dest: sink && e.severity === 'ERROR' ? '_Default bucket + BigQuery sink' : '_Default bucket', billedGb: round(volume * 30, 1), note: '30 days default' };
  });
  const gb = routed.reduce((n, e) => n + e.billedGb, 0);
  const cost = Math.max(0, gb - FREE_GB) * PRICE_PER_GB;
  d.cmd(`${round(gb, 1)} GB a month ingested into _Default → about ${usd(cost)} (illustrative)`);
  d.check('Required audit logs are always kept, free', routed[0].dest === '_Required bucket' && routed[0].billedGb === 0, 'you cannot modify or delete the _Required sink');
  if (opts.noisy) {
    d.check('Verbose logs dominate the bill', routed[2].billedGb / gb > 0.5, `DEBUG is ${Math.round((routed[2].billedGb / gb) * 100)}% of ingested data`);
    const fixedGb = routed.reduce((n, e) => n + (e.severity === 'DEBUG' || e.required ? 0 : e.lb ? e.gbPerDay * 3 : e.billedGb), 0);
    const fixedCost = Math.max(0, fixedGb - FREE_GB) * PRICE_PER_GB;
    d.cmd(`# Fix: exclude DEBUG and sample load balancer logs at 10% → ${usd(fixedCost)}`);
    d.check('An exclusion plus sampling cuts the bill', fixedCost < cost / 2, `${usd(cost)} → ${usd(fixedCost)}`);
  } else {
    d.check('Exclusions lower what is billed', !excludeDebug || routed[2].billedGb === 0, excludeDebug ? 'DEBUG excluded' : 'nothing excluded');
  }
  return d.result({ routed, gb: round(gb, 1), cost, free: FREE_GB, excludeDebug, sampleLb, sink });
}

// ---- SLOs and alerts ------------------------------------------------------------------------

export function sloAlerts(inputs, opts = {}) {
  const d = new Demo('slo-alerts');
  const slo = clamp(inputs.slo, 90, 99.99, 99.9);
  const errorPct = clamp(opts.errorPct ?? inputs.errorPct, 0, 100, 2);
  const incidentMin = clampInt(inputs.incidentMin, 1, 1440, 60);
  const windowDays = 30;
  const budgetFraction = 1 - slo / 100;
  const budgetMin = round(budgetFraction * windowDays * 24 * 60, 1);
  const burnRate = round((errorPct / 100) / budgetFraction, 1);
  const budgetUsedPct = round(Math.min(1000, ((errorPct / 100) * incidentMin) / budgetMin * 100), 1);
  const minutesToEmpty = burnRate > 0 ? round((windowDays * 24 * 60) / burnRate, 0) : null;
  d.cmd(`gcloud monitoring slos create --service=web --goal=${slo / 100} --rolling-period-days=30`);
  d.cmd(`Error budget: ${budgetMin} minutes of total failure a month`);
  d.cmd(`Incident: ${errorPct}% errors for ${incidentMin} min → burn rate ${burnRate}x → ${budgetUsedPct}% of the budget`);
  // Google's SRE guidance pages at a fast burn rate, tickets at a slow one
  const fast = burnRate >= 14.4;
  const slow = burnRate >= 3;
  const action = fast ? 'Page someone now' : slow ? 'Open a ticket' : 'Do nothing';
  d.cmd(`Burn-rate policy: ${action}`);
  // One request stream for 720 hours: a threshold on "any 5xx" pages for each hour that has an error
  const rng = seeded(9);
  let blips = 0;
  for (let hour = 0; hour < 720; hour++) {
    for (let r = 0; r < 100; r++) if (rng() < errorPct / 100) { blips += 1; break; }
  }
  if (opts.noisy) {
    d.check('A single-error threshold fires on every blip', blips > 10, `${blips} pages in a simulated month from a threshold of “any 5xx”, with ${burnRate}x burn`);
    d.check('The burn-rate policy stays quiet', !fast, 'a tiny error rate barely touches the budget');
    d.cmd('# Fix: alert on burn rate over the error budget, and add a metric-absence condition so silence also alerts');
  } else {
    d.check('The budget matches the SLO', budgetMin === round(budgetFraction * 43200, 1), `${slo}% allows ${budgetMin} min per 30 days`);
    d.check('The action follows the burn rate', action === (fast ? 'Page someone now' : slow ? 'Open a ticket' : 'Do nothing'), `${burnRate}x → ${action}`);
  }
  return d.result({ slo, errorPct, incidentMin, budgetMin, burnRate, budgetUsedPct, minutesToEmpty, action, blips: opts.noisy ? blips : 0 });
}
