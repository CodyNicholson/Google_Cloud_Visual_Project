// Foundations: projects and APIs, the resource hierarchy, IAM evaluation, Application Default
// Credentials, service account identity, regions and zones, and budgets.
import { Demo, GcpError, bool, clampInt, oneOf, round, walkGates } from './lab.js';

// ---- Your first deploy: the five gates -----------------------------------------------------

export const FIRST_PROJECT_ERRORS = {
  login: 'ERROR: (gcloud.run.deploy) You do not currently have an active account selected.\nPlease run:\n\n  $ gcloud auth login',
  project: 'ERROR: (gcloud.run.deploy) The required property [project] is not currently set.',
  billing: "FAILED_PRECONDITION: Billing account for project '123456789012' is not found. Billing must be enabled for activation of service(s) 'run.googleapis.com' to proceed.",
  api: 'PERMISSION_DENIED: Cloud Run Admin API has not been used in project my-first-lab before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/run.googleapis.com/overview?project=my-first-lab then retry. If you enabled this API recently, wait a few minutes for the action to propagate to our systems and retry.',
  iam: "PERMISSION_DENIED: Permission 'run.services.create' denied on resource 'namespaces/my-first-lab/services/hello' (or resource may not exist).",
};

export function firstProject(inputs, opts = {}) {
  const d = new Demo('first-project');
  const on = (name) => bool(inputs[name]) && opts.skip !== name;
  const { gates, failed, ok } = walkGates([
    { id: 'login', label: 'Signed in', cmd: 'gcloud auth login', open: on('login'), error: FIRST_PROJECT_ERRORS.login },
    { id: 'project', label: 'Project selected', cmd: 'gcloud config set project my-first-lab', open: on('project'), error: FIRST_PROJECT_ERRORS.project },
    { id: 'billing', label: 'Billing linked', cmd: 'gcloud billing projects link my-first-lab --billing-account=0X0X0X-0X0X0X-0X0X0X', open: on('billing'), error: FIRST_PROJECT_ERRORS.billing },
    { id: 'api', label: 'API enabled', cmd: 'gcloud services enable run.googleapis.com', open: on('api'), error: FIRST_PROJECT_ERRORS.api },
    { id: 'iam', label: 'IAM role granted', cmd: 'gcloud projects add-iam-policy-binding my-first-lab --member=user:you@example.com --role=roles/run.developer', open: on('iam'), error: FIRST_PROJECT_ERRORS.iam },
  ]);
  gates.filter((g) => g.status === 'pass').forEach((g) => d.cmd(g.cmd));
  d.cmd('gcloud run deploy hello --image=us-docker.pkg.dev/cloudrun/container/hello --region=us-central1');
  const run = d.attempt('Deploying the service', () => {
    if (failed) throw new GcpError(failed.id.toUpperCase(), failed.error);
    return 'https://hello-abc123-uc.a.run.app';
  });
  if (opts.skip) {
    d.check('The deploy failed at the gate that was skipped', failed?.id === opts.skip, failed?.label);
    d.check('Nothing after the failed gate was evaluated', gates.slice(gates.findIndex((g) => g.status === 'fail') + 1).every((g) => g.status === 'skipped'), 'the first closed gate is the only error you see');
    // The fix: open the gate and deploy again
    const fixed = walkGates(gates.map((g) => ({ ...g, open: true })));
    d.cmd(`# Fix: ${gates.find((g) => g.id === opts.skip).cmd}`);
    d.check('Opening that gate lets the deploy through', fixed.ok, 'all five gates pass');
  } else {
    d.check('Each gate is evaluated in order', gates.findIndex((g) => g.status === 'fail') === gates.findIndex((g) => !g.open), failed ? `stopped at ${failed.label}` : 'all five passed');
    d.check('The deploy succeeds only when every gate is open', ok === gates.every((g) => g.open) && run.ok === ok, ok ? 'service URL returned' : 'the deploy was refused');
  }
  return d.result({ gates, ok, error: failed?.error, url: run.value });
}

// ---- Resource hierarchy --------------------------------------------------------------------

export const TREE = {
  id: 'org', name: 'example.com', kind: 'organization', children: [
    { id: 'prod', name: 'Production', kind: 'folder', children: [
      { id: 'shop-prod', name: 'shop-prod', kind: 'project', children: [
        { id: 'prod-db', name: 'orders-db', kind: 'Cloud SQL' },
        { id: 'prod-bucket', name: 'invoices', kind: 'bucket' },
      ] },
    ] },
    { id: 'dev', name: 'Development', kind: 'folder', children: [
      { id: 'shop-dev', name: 'shop-dev', kind: 'project', children: [
        { id: 'dev-vm', name: 'test-vm', kind: 'VM' },
        { id: 'dev-bucket', name: 'test-data', kind: 'bucket' },
      ] },
      { id: 'sandbox', name: 'sandbox', kind: 'project', children: [
        { id: 'sbx-fn', name: 'hello-fn', kind: 'function' },
      ] },
    ] },
  ],
};

function flatten(node, ancestors = []) {
  const self = { ...node, ancestors };
  return [self, ...(node.children || []).flatMap((c) => flatten(c, [...ancestors, node.id]))];
}

const GRANT_SCOPES = ['shop-dev (project)', 'Development (folder)', 'example.com (organization)', 'test-data (bucket)'];
const SCOPE_ID = { 'shop-dev (project)': 'shop-dev', 'Development (folder)': 'dev', 'example.com (organization)': 'org', 'test-data (bucket)': 'dev-bucket' };

export function hierarchy(inputs, opts = {}) {
  const d = new Demo('resource-hierarchy');
  const scope = oneOf(opts.scope || inputs.scope, GRANT_SCOPES);
  const grantId = SCOPE_ID[scope];
  const nodes = flatten(TREE);
  d.cmd(`Grant roles/editor to user:new-dev@example.com on ${scope}`);
  const reached = nodes.filter((n) => n.id === grantId || n.ancestors.includes(grantId));
  const resources = nodes.filter((n) => !n.children);
  const reachedResources = reached.filter((n) => !n.children);
  const prodReached = reached.some((n) => n.id === 'prod-db');
  reachedResources.forEach((n) => d.cmd(`  inherited by ${n.kind} ${n.name}`));
  d.check('The grant flows down to every descendant', reached.every((n) => n.id === grantId || n.ancestors.includes(grantId)) && reached.length > 0, `${reached.length} nodes, ${reachedResources.length} of ${resources.length} resources`);
  d.check('Nothing above the grant gains access', !reached.some((n) => nodes.find((x) => x.id === grantId).ancestors.includes(n.id)), 'grants never flow upward');
  if (opts.scope === 'example.com (organization)') {
    d.check('A grant at the organization reaches production', prodReached, 'the new developer can now edit orders-db');
    d.cmd('# Fix: remove the org binding, grant a predefined role on the one project');
    const fixed = nodes.filter((n) => n.id === 'shop-dev' || n.ancestors.includes('shop-dev'));
    d.check('Granting on shop-dev instead keeps production out of reach', !fixed.some((n) => n.id === 'prod-db'), `${fixed.length} nodes`);
  }
  return d.result({ tree: TREE, grantId, scope, reached: reached.map((n) => n.id), prodReached, resourceCount: resources.length, reachedCount: reachedResources.length });
}

// ---- IAM evaluation ------------------------------------------------------------------------

export const PERMISSIONS = ['storage.objects.get', 'storage.objects.create', 'storage.objects.delete', 'compute.instances.delete', 'resourcemanager.projects.setIamPolicy'];
export const ROLES = {
  'roles/viewer': { basic: true, grants: ['storage.objects.get'], total: 'thousands' },
  'roles/editor': { basic: true, grants: ['storage.objects.get', 'storage.objects.create', 'storage.objects.delete', 'compute.instances.delete'], total: 'thousands' },
  'roles/owner': { basic: true, grants: [...PERMISSIONS], total: 'thousands' },
  'roles/storage.objectViewer': { grants: ['storage.objects.get'], total: 'a few' },
  'roles/storage.objectAdmin': { grants: ['storage.objects.get', 'storage.objects.create', 'storage.objects.delete'], total: 'a few' },
};

/** Deny is checked first; then an allow must exist. Anything not allowed is denied. */
export function evaluateIam({ role, permission, denied }) {
  const trace = [];
  const isDenied = denied && permission === 'storage.objects.delete';
  trace.push({ step: 'Deny policies', result: isDenied ? 'deny' : 'no match', note: isDenied ? 'A deny rule names this permission' : 'No deny rule matches' });
  if (isDenied) return { allowed: false, trace };
  const allowed = ROLES[role].grants.includes(permission);
  trace.push({ step: 'Allow policies', result: allowed ? 'allow' : 'no match', note: allowed ? `${role} contains ${permission}` : `${role} does not contain ${permission}` });
  return { allowed, trace };
}

export function iamEvaluator(inputs, opts = {}) {
  const d = new Demo('iam-evaluator');
  const role = oneOf(opts.role || inputs.role, Object.keys(ROLES));
  const permission = oneOf(opts.permission || inputs.permission, PERMISSIONS);
  const denied = opts.denied ?? bool(inputs.denied);
  d.cmd(`gcloud projects add-iam-policy-binding my-lab --member=serviceAccount:app@my-lab.iam.gserviceaccount.com --role=${role}`);
  if (denied) d.cmd('gcloud iam policies create no-deletes --attachment-point=… --kind=denypolicies  # denies storage.objects.delete');
  d.cmd(`gcloud projects get-iam-policy → testing ${permission}`);
  const decision = evaluateIam({ role, permission, denied });
  const matrix = Object.keys(ROLES).map((r) => ({ role: r, basic: !!ROLES[r].basic, total: ROLES[r].total, cells: PERMISSIONS.map((p) => ({ permission: p, allowed: evaluateIam({ role: r, permission: p, denied }).allowed })) }));
  if (!decision.allowed) d.cmd(`✗ PERMISSION_DENIED: Permission '${permission}' denied on resource (or it may not exist).`);
  d.check('Deny is evaluated before allow', decision.trace[0].step === 'Deny policies', 'IAM always checks deny policies first');
  d.check('The decision matches the role and the deny rule', decision.allowed === (ROLES[role].grants.includes(permission) && !(denied && permission === 'storage.objects.delete')), decision.allowed ? 'allowed' : 'denied');
  if (opts.denied) {
    const owner = evaluateIam({ role: 'roles/owner', permission: 'storage.objects.delete', denied: true });
    d.check('A deny rule beats even roles/owner', !owner.allowed, 'owner still cannot delete');
  }
  if (opts.role === 'roles/editor') {
    const need = ['storage.objects.get'];
    const spare = ROLES['roles/editor'].grants.filter((p) => !need.includes(p));
    d.check('roles/editor grants far more than the app needs', spare.length >= 3, `needs 1 of these permissions, also gets: ${spare.join(', ')}`);
    d.check('roles/storage.objectViewer is enough', evaluateIam({ role: 'roles/storage.objectViewer', permission: 'storage.objects.get' }).allowed && !evaluateIam({ role: 'roles/storage.objectViewer', permission: 'compute.instances.delete' }).allowed, 'read works, VM deletion does not');
  }
  return d.result({ role, permission, denied, ...decision, matrix, permissions: PERMISSIONS, scenario: opts.role === 'roles/editor' ? 'over-granted' : 'normal' });
}

// ---- Application Default Credentials -------------------------------------------------------

export const ADC_NOT_FOUND = 'google.auth.exceptions.DefaultCredentialsError: Your default credentials were not found. To set up Application Default Credentials, see https://cloud.google.com/docs/authentication/external/set-up-adc for more information.';

export function resolveAdc({ envVar, envFileExists, gcloudFile, metadata }) {
  const trace = [];
  if (envVar) {
    trace.push({ source: 'GOOGLE_APPLICATION_CREDENTIALS', status: envFileExists ? 'found' : 'broken', note: envFileExists ? 'the file named by the variable' : 'the variable names a file that is gone' });
    if (!envFileExists) throw Object.assign(new GcpError('DefaultCredentialsError', 'File /secrets/old-key.json was not found.'), { trace });
    return { credential: 'The file the variable points to', trace };
  }
  trace.push({ source: 'GOOGLE_APPLICATION_CREDENTIALS', status: 'unset', note: 'not set, keep looking' });
  if (gcloudFile) {
    trace.push({ source: 'gcloud auth application-default login', status: 'found', note: '~/.config/gcloud/application_default_credentials.json' });
    return { credential: 'Your user credentials from the local file', trace };
  }
  trace.push({ source: 'gcloud auth application-default login', status: 'absent', note: 'no local file, keep looking' });
  if (metadata) {
    trace.push({ source: 'Metadata server', status: 'found', note: 'the service account attached to this resource' });
    return { credential: 'The attached service account', trace };
  }
  trace.push({ source: 'Metadata server', status: 'absent', note: 'not running on Google Cloud' });
  throw Object.assign(new GcpError('DefaultCredentialsError', ADC_NOT_FOUND.split(': ').slice(1).join(': ')), { trace });
}

export function adc(inputs, opts = {}) {
  const d = new Demo('adc');
  const scenario = opts.scenario || {
    envVar: bool(inputs.envVar), envFileExists: true, gcloudFile: bool(inputs.gcloudFile), metadata: bool(inputs.metadata),
  };
  d.cmd("from google.cloud import storage; client = storage.Client()  # no key in the code: ADC finds the credential");
  const r = d.attempt('google.auth.default()', () => resolveAdc(scenario));
  const trace = r.ok ? r.value.trace : r.error.trace;
  if (opts.scenario?.envVar && !opts.scenario.envFileExists) {
    d.check('A broken variable stops the search', !r.ok && trace.length === 1, 'ADC does not fall through to your gcloud login or the metadata server');
    d.cmd('# Fix: unset GOOGLE_APPLICATION_CREDENTIALS');
    const fixed = resolveAdc({ ...opts.scenario, envVar: false });
    d.check('Unsetting it restores the next source', fixed.credential.includes('user credentials'), fixed.credential);
  } else {
    d.check('Sources are tried in the documented order', trace.map((t) => t.source).join().startsWith('GOOGLE_APPLICATION_CREDENTIALS'), 'env var → gcloud file → metadata server');
    d.check('The first source present wins', r.ok ? trace[trace.length - 1].status === 'found' : trace.every((t) => t.status !== 'found'), r.ok ? r.value.credential : 'none found');
  }
  return d.result({ trace, credential: r.ok ? r.value.credential : null, error: r.ok ? null : `${r.error.name}: ${r.error.message}` });
}

// ---- Service account identity ---------------------------------------------------------------

export const IDENTITY_METHODS = {
  'Attached service account (on Google Cloud)': { secretOnDisk: false, ttlHours: 1, steps: ['Workload asks the metadata server', 'Metadata server returns a short-lived token', 'Google APIs accept the token'], rotate: 'automatic' },
  'Workload Identity Federation (outside Google Cloud)': { secretOnDisk: false, ttlHours: 1, steps: ['CI or other cloud issues an OIDC token', 'STS swaps it for a federated token', 'Token impersonates the service account', 'Google APIs accept the token'], rotate: 'automatic' },
  'Downloaded JSON key': { secretOnDisk: true, ttlHours: null, steps: ['Someone runs gcloud iam service-accounts keys create', 'The key file is stored and copied around', 'Anyone holding the file signs its own tokens'], rotate: 'manual' },
};

export function serviceAccounts(inputs, opts = {}) {
  const d = new Demo('service-accounts');
  const method = oneOf(opts.method || inputs.method, Object.keys(IDENTITY_METHODS));
  const days = clampInt(inputs.daysToNotice, 1, 365, 30);
  const m = IDENTITY_METHODS[method];
  m.steps.forEach((s) => d.cmd(s));
  const exposureHours = m.ttlHours ?? days * 24;
  d.check('Exposure if the credential leaks is computed from its lifetime', exposureHours > 0, `${exposureHours} h usable by an attacker`);
  if (opts.method === 'Downloaded JSON key') {
    d.cmd('git push origin main   # key.json committed by accident');
    d.cmd(`# A leaked key works until revoked: ${days} days here`);
    d.check('A leaked key stays valid until someone revokes it', exposureHours === days * 24, 'service account keys do not expire by default');
    const short = IDENTITY_METHODS['Attached service account (on Google Cloud)'].ttlHours;
    d.check('A leaked token is usable for far less time', short < exposureHours, `${short} h versus ${exposureHours} h`);
    d.cmd('# Fix: gcloud iam service-accounts keys delete KEY_ID; move to an attached account or federation');
  } else {
    d.check('No long-lived secret exists to steal', !m.secretOnDisk, `tokens rotate ${m.rotate}ally`);
  }
  const compare = Object.entries(IDENTITY_METHODS).map(([name, v]) => ({ name, hours: v.ttlHours ?? days * 24, secret: v.secretOnDisk }));
  return d.result({ method, steps: m.steps, exposureHours, secretOnDisk: m.secretOnDisk, days, compare });
}

// ---- Regions and zones ----------------------------------------------------------------------

export const REGIONS = [
  { id: 'us-central1', city: 'Iowa', lon: -93, lat: 42 },
  { id: 'us-east1', city: 'South Carolina', lon: -81, lat: 33 },
  { id: 'us-west1', city: 'Oregon', lon: -121, lat: 45 },
  { id: 'southamerica-east1', city: 'São Paulo', lon: -46, lat: -23 },
  { id: 'europe-west1', city: 'Belgium', lon: 4, lat: 50 },
  { id: 'europe-north1', city: 'Finland', lon: 25, lat: 60 },
  { id: 'asia-south1', city: 'Mumbai', lon: 73, lat: 19 },
  { id: 'asia-east1', city: 'Taiwan', lon: 121, lat: 24 },
  { id: 'asia-northeast1', city: 'Tokyo', lon: 139, lat: 36 },
  { id: 'australia-southeast1', city: 'Sydney', lon: 151, lat: -34 },
];

const TOPOLOGIES = {
  'Single zone': ['us-central1-a'],
  'Regional (3 zones)': ['us-central1-a', 'us-central1-b', 'us-central1-c'],
  'Multi-region (2 regions)': ['us-central1-a', 'us-central1-b', 'europe-west1-b', 'europe-west1-c'],
};
const FAILURES = ['No failure', 'Zone us-central1-a fails', 'Region us-central1 fails'];

export function globalInfra(inputs, opts = {}) {
  const d = new Demo('global-infra');
  const topology = oneOf(opts.topology || inputs.topology, Object.keys(TOPOLOGIES));
  const failure = oneOf(opts.failure || inputs.failure, FAILURES);
  const placed = TOPOLOGIES[topology];
  const isDown = (zone) => (failure.startsWith('Zone') && zone === 'us-central1-a') || (failure.startsWith('Region') && zone.startsWith('us-central1'));
  const replicas = placed.map((zone) => ({ zone, region: zone.replace(/-[a-z]$/, ''), up: !isDown(zone) }));
  const up = replicas.filter((r) => r.up).length;
  d.cmd(`Deploy ${placed.length} replica(s): ${placed.join(', ')}`);
  d.cmd(failure === 'No failure' ? 'All zones healthy' : `Simulate: ${failure}`);
  d.cmd(up ? `Load balancer sends traffic to the ${up} healthy replica(s)` : '✗ 503: no healthy upstream, the application is down');
  d.check('Replicas in the failed location go down', replicas.every((r) => r.up !== isDown(r.zone)), `${placed.length - up} down`);
  d.check('The app survives while any replica is up', (up > 0) === replicas.some((r) => r.up), up ? `${Math.round((up / placed.length) * 100)}% capacity left` : 'outage');
  if (opts.topology === 'Single zone') {
    d.check('A single zone means one zone outage takes the app down', up === 0, 'Google recommends spreading across zones');
    const after = TOPOLOGIES['Regional (3 zones)'].filter((z) => !isDown(z)).length;
    d.check('The same outage leaves a regional deployment running', after === 2, `${after} of 3 replicas up`);
  }
  return d.result({ topology, failure, replicas, up, total: placed.length, regions: REGIONS, counts: { regions: 43, zones: 130, edge: '200+' } });
}

// ---- Budgets --------------------------------------------------------------------------------

export function budgets(inputs, opts = {}) {
  const d = new Demo('billing-budgets');
  const budget = clampInt(inputs.budget, 10, 5000, 100);
  const daily = clampInt(inputs.daily, 0, 500, 2);
  const runawayDaily = clampInt(inputs.runawayDaily, 0, 2000, 150);
  const runawayDay = clampInt(inputs.runawayDay, 1, 28, 12);
  const lagDays = 1; // billing data and notifications arrive with a delay of hours to a day
  const killSwitch = opts.killSwitch ?? bool(inputs.killSwitch);
  d.cmd(`gcloud billing budgets create --billing-account=… --display-name=lab --budget-amount=${budget}USD --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0`);
  if (killSwitch) d.cmd('Budget → Pub/Sub topic → Cloud Run function → billing.projects.updateBillingInfo (billingAccountName: "")');
  const series = [];
  const alerts = [];
  let spend = 0;
  let stoppedOn = null;
  const thresholds = [0.5, 0.9, 1];
  let over100On = null;
  for (let day = 1; day <= 30; day++) {
    if (!stoppedOn) spend += day >= runawayDay ? runawayDaily : daily;
    // A threshold is reported the day after it is crossed
    thresholds.forEach((t) => {
      if (spend >= budget * t && !alerts.some((a) => a.pct === t * 100)) alerts.push({ pct: t * 100, crossed: day, notified: day + lagDays });
    });
    if (spend >= budget && over100On == null) over100On = day;
    if (killSwitch && over100On != null && !stoppedOn && day >= over100On + lagDays) stoppedOn = day;
    series.push({ day, spend });
  }
  alerts.forEach((a) => d.cmd(`Day ${a.notified}: email "${a.pct}% of budget" (crossed on day ${a.crossed})`));
  if (stoppedOn) d.cmd(`Day ${stoppedOn}: the function disabled billing, services in the project stop`);
  d.check('Alerts fire at 50%, 90% and 100%', alerts.length === 0 || alerts[0].pct === 50, `${alerts.length} alerts`);
  if (!killSwitch && spend > budget) {
    d.check('An alerts-only budget does not stop spending', spend > budget, `spent $${spend} against a $${budget} budget`);
  }
  if (killSwitch && over100On) {
    d.check('The kill switch stops spending after the delayed notification', series[29].spend === series[stoppedOn - 1].spend, `stopped on day ${stoppedOn} at $${series[stoppedOn - 1].spend}`);
    d.check('Spending still overshoots by the lag', series[stoppedOn - 1].spend >= budget, 'set the budget below what you can afford');
  }
  if (!alerts.length) d.check('Spending stayed under every threshold', spend < budget * 0.5, `$${spend}`);
  return d.result({ budget, series, alerts, spend, stoppedOn, killSwitch, overshoot: Math.max(0, spend - budget), overPct: round((spend / budget) * 100, 0) });
}
