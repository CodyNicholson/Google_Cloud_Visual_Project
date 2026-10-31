// Compute: choosing a service, Spot VMs and capacity, Cloud Run scaling and its container contract,
// event-driven functions, and how GKE schedules Pods.
import { Demo, GcpError, bool, clamp, clampInt, oneOf, rankOptions, round, seeded, usd } from './lab.js';

// ---- Which compute service? -----------------------------------------------------------------

export const COMPUTE_OPTIONS = [
  { id: 'run', name: 'Cloud Run', blurb: 'Containers that scale to zero. The default for new web apps and APIs.' },
  { id: 'functions', name: 'Cloud Run functions', blurb: 'A single function reacting to an event, with no Dockerfile.' },
  { id: 'gke', name: 'GKE', blurb: 'Kubernetes when you need its API, operators and multi-service control.' },
  { id: 'gce', name: 'Compute Engine', blurb: 'Full VMs: custom OS, GPUs, licences, lift and shift.' },
  { id: 'batch', name: 'Batch', blurb: 'Queues large jobs and provisions the VMs for them.' },
  { id: 'appengine', name: 'App Engine', blurb: 'The older PaaS. Google recommends Cloud Run for new apps.' },
];
const COMPUTE_RULES = {
  workload: {
    'Web app or API': { run: 5, gke: 2, gce: 1, appengine: 1, functions: 1 },
    'Small event handler': { functions: 5, run: 3 },
    'Large batch or HPC job': { batch: 5, gce: 2, gke: 2, run: 1 },
    'Needs a custom OS, kernel or licence': { gce: 6, gke: 1 },
    'Many cooperating microservices': { gke: 4, run: 4, gce: 1 },
  },
  ops: {
    'Nobody wants to run servers': { run: 3, functions: 3, batch: 1, appengine: 1 },
    'Some ops experience': { run: 1, gce: 2, gke: 1 },
    'A platform team that knows Kubernetes': { gke: 4, gce: 1 },
  },
  traffic: {
    'Spiky or often idle': { run: 3, functions: 3, batch: 1 },
    'Steady and busy': { gke: 2, gce: 2, run: 1 },
    'Runs on a schedule, then stops': { batch: 2, run: 2, functions: 1 },
  },
};
const COMPUTE_WHY = {
  workload: { 'Web app or API': 'fits an HTTP workload', 'Small event handler': 'made for a single event', 'Large batch or HPC job': 'made for big jobs', 'Needs a custom OS, kernel or licence': 'gives you the OS', 'Many cooperating microservices': 'handles many services' },
  ops: { 'Nobody wants to run servers': 'no servers to run', 'Some ops experience': 'a manageable amount of ops', 'A platform team that knows Kubernetes': 'uses your team’s Kubernetes skills' },
  traffic: { 'Spiky or often idle': 'scales to zero when idle', 'Steady and busy': 'steady load suits reserved capacity', 'Runs on a schedule, then stops': 'runs only when needed' },
};

/** Shared runner for every "which service?" page. */
export function chooser(id, options, rules, why, inputs, opts = {}) {
  const d = new Demo(id);
  const answers = Object.fromEntries(Object.keys(rules).map((q) => [q, oneOf(opts.answers?.[q] ?? inputs[q], Object.keys(rules[q]))]));
  Object.entries(answers).forEach(([q, a]) => d.cmd(`${q}: ${a}`));
  const ranked = rankOptions(options, rules, answers, why);
  const max = Math.max(1, ranked[0].score);
  d.cmd(`Best fit: ${ranked[0].name}`);
  d.check('The options are ranked by fit', ranked.every((o, i) => i === 0 || ranked[i - 1].score >= o.score), ranked.slice(0, 3).map((o) => `${o.name} ${o.score}`).join(', '));
  d.check('The winner has a reason for each high score', ranked[0].reasons.length > 0, ranked[0].reasons.join('; '));
  let wrong = null;
  if (opts.wrongPick) {
    wrong = ranked.find((o) => o.id === opts.wrongPick);
    d.cmd(`✗ Picked ${wrong.name} anyway: ${opts.wrongWhy}`);
    d.check(`${wrong.name} is not the best fit for this workload`, ranked[0].id !== opts.wrongPick && wrong.score < ranked[0].score, `${wrong.name} scored ${wrong.score}, ${ranked[0].name} scored ${ranked[0].score}`);
  }
  return d.result({ answers, ranked, max, wrong, wrongWhy: opts.wrongWhy });
}

export const computeChooser = (inputs, opts) => chooser('compute-chooser', COMPUTE_OPTIONS, COMPUTE_RULES, COMPUTE_WHY, inputs, opts);

// ---- Compute Engine: Spot VMs and capacity --------------------------------------------------

export function spotRun({ jobHours, preemptEvery, checkpointEvery, seed = 28 }) {
  const rng = seeded(seed);
  let done = 0;
  let saved = 0;
  let t = 0;
  let attempts = 0;
  const segments = [];
  while (done < jobHours && attempts < 40) {
    attempts += 1;
    // Exponentially distributed time until the VM is reclaimed
    const life = Math.max(0.25, -Math.log(1 - rng()) * preemptEvery);
    const remaining = jobHours - done;
    if (life >= remaining) {
      segments.push({ start: t, end: t + remaining, tone: 'ok', text: 'finished' });
      t += remaining;
      done = jobHours;
      break;
    }
    done += life;
    if (checkpointEvery > 0) {
      saved = Math.floor(done / checkpointEvery) * checkpointEvery;
    }
    segments.push({ start: t, end: t + life, tone: 'warn', text: 'reclaimed' });
    t += life;
    done = checkpointEvery > 0 ? saved : 0;
  }
  return { hours: round(t), attempts, finished: done >= jobHours, segments };
}

export function computeEngine(inputs, opts = {}) {
  const d = new Demo('compute-engine');
  const jobHours = opts.noCheckpoint ? 12 : clampInt(inputs.jobHours, 1, 48, 12);
  const preemptEvery = opts.noCheckpoint ? 4 : clampInt(inputs.preemptEvery, 1, 48, 4);
  const checkpointEvery = opts.noCheckpoint ? 0 : clamp(inputs.checkpointEvery, 0.25, 12, 0.5);
  const discount = clampInt(inputs.discount, 0, 91, 70) / 100;
  const pricePerHour = 1;
  d.cmd(`gcloud compute instances create trainer --zone=us-central1-a --provisioning-model=SPOT --instance-termination-action=DELETE`);
  const spot = spotRun({ jobHours, preemptEvery, checkpointEvery });
  spot.segments.filter((s) => s.tone === 'warn').forEach((s) => d.cmd(`t+${round(s.end, 1)}h preempted: ACPI shutdown, up to 30 s for the shutdown script`));
  const onDemandCost = jobHours * pricePerHour;
  const spotCost = spot.hours * pricePerHour * (1 - discount);
  if (opts.noCheckpoint) {
    d.check('Without checkpoints a preemption throws the work away', spot.attempts > 1 && spot.hours > jobHours, `${spot.hours} machine-hours for a ${jobHours} h job, ${spot.attempts} attempts`);
    const fixed = spotRun({ jobHours, preemptEvery, checkpointEvery: 0.5 });
    d.cmd(`# Fix: checkpoint every 30 minutes to Cloud Storage → ${fixed.hours} machine-hours`);
    d.check('Checkpointing every 30 minutes uses fewer machine-hours', fixed.hours < spot.hours, `${fixed.hours} h versus ${spot.hours} h`);
  } else {
    d.check('The job finishes despite preemptions', spot.finished, `${spot.attempts} VM(s), ${spot.hours} machine-hours`);
    d.check('Spot is cheaper than on-demand for this job', spotCost < onDemandCost, `${usd(spotCost)} versus ${usd(onDemandCost)} at $1/h list`);
  }
  return d.result({ mode: 'spot', spot, jobHours, onDemandCost, spotCost, discount, checkpointEvery });
}

export const EXHAUSTED = "ZONE_RESOURCE_POOL_EXHAUSTED: The zone 'projects/my-lab/zones/us-central1-a' does not have enough resources available to fulfill the request. Try a different zone, or try again later.";

export function capacity(inputs) {
  const d = new Demo('compute-engine');
  const vms = clampInt(inputs.vms, 1, 24, 9);
  const zones = [{ zone: 'us-central1-a', free: 0 }, { zone: 'us-central1-b', free: Math.ceil(vms / 2) + 1 }, { zone: 'us-central1-c', free: Math.ceil(vms / 2) + 1 }];
  d.cmd(`gcloud compute instances bulk-create --zone=us-central1-a --count=${vms} --machine-type=a2-highgpu-1g`);
  const zonal = d.attempt('Asking one zone for everything', () => {
    if (zones[0].free < vms) throw new GcpError('ZONE_RESOURCE_POOL_EXHAUSTED', EXHAUSTED.split(': ').slice(1).join(': '));
  });
  d.cmd(`gcloud compute instance-groups managed create trainers --region=us-central1 --size=${vms} --target-distribution-shape=BALANCED`);
  // A regional MIG with a BALANCED shape places VMs where capacity exists
  let left = vms;
  const placed = zones.map((z) => ({ ...z, placed: 0 }));
  while (left > 0 && placed.some((z) => z.placed < z.free)) {
    placed.filter((z) => z.placed < z.free).sort((a, b) => a.placed - b.placed).slice(0, 1).forEach((z) => { z.placed += 1; left -= 1; });
  }
  d.cmd(`Placed: ${placed.map((z) => `${z.zone}=${z.placed}`).join(', ')}`);
  d.check('Capacity errors are not quota errors', !zonal.ok && zonal.error.name === 'ZONE_RESOURCE_POOL_EXHAUSTED', 'the zone is out of stock; a quota increase would not help');
  d.check('A regional group places every VM in the zones that have capacity', left === 0, `${vms} of ${vms} placed`);
  return d.result({ mode: 'capacity', zones: placed, vms, error: `${zonal.error.name}: ${zonal.error.message}` });
}

// ---- Cloud Run scaling ----------------------------------------------------------------------

export const NO_INSTANCE = 'HTTP 429: The request was aborted because there was no available instance.';

/** One-second steps. New instances become ready after the cold start; demand above capacity is rejected. */
export function runScale({ baseRps, spikeRps, latencyMs, concurrency, minInstances, maxInstances, coldStartS, seconds = 60 }) {
  const series = [];
  const starting = [];
  let ready = minInstances;
  let rejected = 0;
  let served = 0;
  let coldHits = 0;
  for (let t = 0; t < seconds; t++) {
    const rps = t < 10 || t >= 45 ? (t >= 52 ? 0 : baseRps) : spikeRps;
    while (starting.length && starting[0] <= t) { starting.shift(); ready += 1; }
    const inFlight = (rps * latencyMs) / 1000;
    const need = Math.ceil(inFlight / concurrency);
    const wanted = Math.min(maxInstances, Math.max(need, minInstances));
    const pending = starting.length;
    if (wanted > ready + pending) {
      const add = wanted - ready - pending;
      for (let i = 0; i < add; i++) starting.push(t + coldStartS);
      coldHits += add;
    } else if (wanted < ready && t >= 45) {
      // Idle instances are removed gradually, down to the minimum
      ready = Math.max(wanted, ready - 1);
    }
    const capacityRps = (ready * concurrency * 1000) / latencyMs;
    const ok = Math.min(rps, capacityRps);
    const drop = round(rps - ok, 1);
    rejected += drop;
    served += ok;
    series.push({ t, rps, ready, starting: starting.length, rejected: drop });
  }
  return { series, rejected: Math.round(rejected), served: Math.round(served), coldHits, peak: Math.max(...series.map((s) => s.ready)) };
}

export function cloudRunScaling(inputs, opts = {}) {
  const d = new Demo('cloud-run-scaling');
  const p = {
    baseRps: clampInt(inputs.baseRps, 0, 500, 20),
    spikeRps: opts.concurrency ? 300 : clampInt(inputs.spikeRps, 1, 2000, 300),
    latencyMs: opts.concurrency ? 200 : clampInt(inputs.latencyMs, 10, 5000, 200),
    concurrency: opts.concurrency ?? clampInt(inputs.concurrency, 1, 1000, 80),
    minInstances: clampInt(inputs.minInstances, 0, 20, 0),
    maxInstances: opts.maxInstances ?? clampInt(inputs.maxInstances, 1, 100, 20),
    coldStartS: clampInt(inputs.coldStartS, 0, 30, 2),
  };
  d.cmd(`gcloud run deploy api --concurrency=${p.concurrency} --min-instances=${p.minInstances} --max-instances=${p.maxInstances}`);
  d.cmd(`Traffic: ${p.baseRps} req/s, a spike to ${p.spikeRps} req/s, then idle. Each request takes ${p.latencyMs} ms.`);
  const r = runScale(p);
  const needed = Math.ceil((p.spikeRps * p.latencyMs) / 1000 / p.concurrency);
  d.cmd(`Peak: ${r.peak} instance(s) (the spike needs ${needed}). Rejected ${r.rejected} requests.`);
  if (r.rejected) d.cmd(`✗ ${NO_INSTANCE}`);
  if (opts.concurrency) {
    d.check('The instance limit rejects requests', r.rejected > 0, `${r.rejected} requests got a 429`);
    const fixed = runScale({ ...p, concurrency: 80, maxInstances: 20 });
    d.cmd(`# Fix: --concurrency=80 --max-instances=20 → ${fixed.rejected} rejected`);
    d.check('Raising concurrency and the limit fixes most of it', fixed.rejected < r.rejected / 2, `${fixed.rejected} rejected`);
  } else {
    d.check('Instances grow with demand and never pass the limit', r.peak >= 1 && r.peak <= p.maxInstances, `${r.peak} of at most ${p.maxInstances}`);
    d.check('The service falls back toward the minimum when idle', r.series[59].ready <= r.peak && r.series[59].ready >= p.minInstances, `${r.series[59].ready} at the end`);
  }
  return d.result({ ...p, ...r, needed, error: r.rejected ? NO_INSTANCE : null });
}

// ---- Cloud Run container contract -----------------------------------------------------------

export const PORT_ERROR = 'Container failed to start. Failed to start and then listen on the port defined by the PORT environment variable.';
export const OOM_ERROR = 'While handling this request, the container instance was found to be using too much memory and was terminated.';

export function runContract(inputs, opts = {}) {
  const d = new Demo('cloud-run-contract');
  const bind = oneOf(opts.bind || inputs.bind, ['0.0.0.0', '127.0.0.1']);
  const port = oneOf(opts.port || inputs.port, ['process.env.PORT', 'hard-coded 3000']);
  const billing = opts.background ? 'Request-based (default)' : oneOf(inputs.billing, ['Request-based (default)', 'Instance-based']);
  const background = oneOf(opts.background || inputs.background, ['Nothing after the response', 'Send an email after the response']);
  const memory = clampInt(inputs.memory, 128, 4096, 512);
  const tmpWrites = opts.tmpWrites ? Math.max(opts.tmpWrites, memory + 100) : clampInt(inputs.tmpWrites, 0, 8192, 50);
  d.cmd(`gcloud run deploy app --source . --memory=${memory}Mi`);
  const listens = bind === '0.0.0.0' && port === 'process.env.PORT';
  const start = d.attempt('Waiting for the container to listen on $PORT (8080)', () => {
    if (!listens) throw new GcpError('Revision failed', PORT_ERROR);
    return true;
  });
  const items = [
    { id: 'port', label: `Listens on ${bind}, port ${port}`, ok: listens, note: listens ? 'Cloud Run injects PORT; the default is 8080' : PORT_ERROR },
  ];
  const baseUsage = 120;
  const usage = baseUsage + tmpWrites;
  const memOk = usage <= memory;
  items.push({ id: 'memory', label: `${tmpWrites} MiB written to /tmp, ${memory} MiB limit`, ok: memOk, note: memOk ? `${usage} MiB in use: the filesystem lives in memory` : OOM_ERROR });
  const throttled = background !== 'Nothing after the response' && billing.startsWith('Request');
  items.push({ id: 'background', label: `${background}`, ok: !throttled, note: throttled ? 'CPU is throttled once the response is sent: the email may never go out, and no error is logged' : (background === 'Nothing after the response' ? 'Work finishes before the response' : 'CPU stays allocated between requests') });
  if (opts.bind) {
    d.check('Binding to localhost fails the deployment', !start.ok, 'traffic comes from outside the container');
    d.cmd("# Fix: app.listen(process.env.PORT || 8080, '0.0.0.0')");
    d.check('The documented error names the PORT contract', PORT_ERROR.includes('PORT environment variable'), 'test locally: docker run -e PORT=8080 -p 8080:8080 app');
  } else if (opts.tmpWrites) {
    d.check('Local files count against instance memory', !memOk, `${usage} MiB used of ${memory} MiB`);
    d.cmd('# Fix: stream to Cloud Storage, or raise --memory');
  } else if (opts.background) {
    d.check('Background work after the response is throttled', throttled, 'request-based billing allocates CPU only during requests');
    d.cmd('# Fix: enqueue with Cloud Tasks or Pub/Sub, or use --no-cpu-throttling');
  } else {
    d.check('The deployment follows the rules chosen', start.ok === listens, listens ? 'revision serving 100% of traffic' : 'revision failed');
    d.check('Every rule was checked', items.length === 3, items.map((i) => (i.ok ? '✓' : '✗')).join(' '));
  }
  return d.result({ items, listens, memory, usage, memOk, throttled, deployed: start.ok && memOk });
}

// ---- Event-driven functions -----------------------------------------------------------------

export function functionsEvents(inputs, opts = {}) {
  const d = new Demo('functions-events');
  const transient = opts.retry && !opts.permanent ? Math.max(1, clampInt(inputs.failures, 0, 8, 2)) : clampInt(inputs.failures, 0, 8, 2);
  const idempotent = opts.idempotent ?? bool(inputs.idempotent);
  const retry = opts.retry ?? bool(inputs.retry);
  const permanent = opts.permanent ?? false;
  d.cmd(`gcloud functions deploy charge-order --gen2 --trigger-topic=orders ${retry ? '--retry' : ''}`.trim());
  const attempts = [];
  const processed = new Set();
  let charges = 0;
  let delay = 10;
  let t = 0;
  const windowSeconds = 7 * 24 * 3600;
  let loops = 0;
  const maxShown = 8;
  for (let i = 0; ; i++) {
    const fails = permanent || i < transient;
    // The side effect happens before the failure: the worst case for retries
    const already = idempotent && processed.has('evt-1');
    if (!already) { charges += 1; processed.add('evt-1'); }
    if (attempts.length < maxShown) attempts.push({ n: i + 1, t, ok: !fails, charged: !already });
    if (!fails || !retry) { if (fails && !retry) d.cmd('Function failed and retries are off: the event is dropped'); break; }
    t += delay;
    delay = Math.min(600, delay * 2);
    loops += 1;
    if (t > windowSeconds) break;
    if (opts.maxAgeS && t > opts.maxAgeS) { d.cmd(`Event older than ${opts.maxAgeS} s: acknowledged and discarded`); break; }
  }
  attempts.forEach((a) => d.cmd(`t+${a.t}s attempt ${a.n}: ${a.ok ? 'ok' : 'error'}${a.charged ? ', card charged' : ', duplicate skipped'}`));
  if (permanent) {
    d.check('A permanent bug retries for the whole retry window', loops > 900, `${loops + 1} attempts over 7 days with a 600 s maximum backoff`);
    const maxAge = 600;
    let guardedAttempts = 1;
    for (let wait = 10, age = 10; age <= maxAge; wait = Math.min(600, wait * 2), age += wait) guardedAttempts += 1;
    d.check('An event-age guard ends the loop', guardedAttempts < loops / 10, `${guardedAttempts} attempts with a ${maxAge / 60}-minute maximum age`);
  } else if (retry && !idempotent && transient > 0) {
    d.check('Retries without idempotency repeat the side effect', charges === transient + 1, `the customer was charged ${charges} times`);
    d.cmd('# Fix: store the event ID with a create-if-absent write before charging');
  } else if (retry) {
    d.check('The event eventually succeeds', attempts[attempts.length - 1].ok, `after ${attempts.length} attempts`);
    d.check('An idempotent handler charges once', !idempotent || charges === 1, `${charges} charge(s)`);
  } else {
    d.check('With retries off a failed event is lost', transient === 0 || !attempts[attempts.length - 1].ok, transient ? 'dropped after one attempt' : 'nothing failed');
  }
  return d.result({ attempts, charges, loops: loops + 1, retry, idempotent, permanent });
}

// ---- GKE scheduling -------------------------------------------------------------------------

export function schedule({ pods, nodes }) {
  const placed = nodes.map((n) => ({ ...n, used: 0, pods: [] }));
  const pending = [];
  [...pods].sort((a, b) => b.cpu - a.cpu).forEach((pod) => {
    const node = placed.find((n) => n.cpu - n.used >= pod.cpu);
    if (node) { node.used += pod.cpu; node.pods.push(pod); } else pending.push(pod);
  });
  return { nodes: placed, pending };
}

export const GKE_MODES = ['Autopilot', 'Standard, fixed 3 nodes'];

export function gke(inputs, opts = {}) {
  const d = new Demo('gke');
  const mode = oneOf(opts.mode || inputs.mode, GKE_MODES);
  const replicas = clampInt(inputs.replicas, 1, 24, 8);
  const cpu = opts.cpu ?? clamp(inputs.cpu, 0.25, 8, 0.5);
  const nodeCpu = 2;
  d.cmd(mode === 'Autopilot' ? 'gcloud container clusters create-auto shop --region=us-central1' : 'gcloud container clusters create shop --zone=us-central1-a --num-nodes=3 --machine-type=e2-standard-2');
  d.cmd(`kubectl scale deployment web --replicas=${replicas}   # each Pod requests ${cpu} vCPU`);
  const pods = Array.from({ length: replicas }, (_, i) => ({ name: `web-${i + 1}`, cpu }));
  let nodes = Array.from({ length: 3 }, (_, i) => ({ name: `node-${i + 1}`, cpu: nodeCpu }));
  if (mode === 'Autopilot') {
    // Autopilot provisions a node big enough for what is pending
    let r = schedule({ pods, nodes: [] });
    const size = Math.max(nodeCpu, cpu);
    while (r.pending.length) {
      nodes = [...(r.nodes.length ? r.nodes.map(({ name, cpu: c }) => ({ name, cpu: c })) : []), { name: `auto-${r.nodes.length + 1}`, cpu: size }];
      r = schedule({ pods, nodes });
    }
  }
  const { nodes: placed, pending } = schedule({ pods, nodes });
  const used = placed.reduce((n, x) => n + x.used, 0);
  const total = placed.reduce((n, x) => n + x.cpu, 0);
  const error = pending.length ? `0/${placed.length} nodes are available: ${placed.length} Insufficient cpu.` : null;
  placed.forEach((n) => d.cmd(`${n.name}: ${n.pods.length} Pod(s), ${round(n.used)} of ${n.cpu} vCPU`));
  if (error) {
    d.cmd(`kubectl describe pod ${pending[0].name}`);
    d.cmd(`✗ Warning FailedScheduling: ${error}`);
  }
  if (opts.cpu) {
    d.check('A request bigger than any node leaves the Pod Pending', pending.length === replicas, error);
    const fixed = schedule({ pods: pods.map((p) => ({ ...p, cpu: 0.5 })), nodes });
    d.cmd('# Fix: lower the request, add a larger node pool, or enable node auto-provisioning');
    d.check('A request that fits schedules', fixed.pending.length === 0, `${pods.length} Pods placed`);
  } else {
    d.check('The scheduler uses CPU requests to place Pods', placed.every((n) => n.used <= n.cpu), `${round(used)} of ${total} vCPU requested`);
    if (mode === 'Autopilot') d.check('Autopilot adds nodes so nothing stays Pending', pending.length === 0, `${placed.length} nodes provisioned for you`);
    else d.check('A fixed cluster leaves extra Pods Pending', pending.length === Math.max(0, replicas - placed.length * Math.floor(nodeCpu / cpu)) || pending.length === 0, `${pending.length} Pending`);
  }
  return d.result({ mode, nodes: placed, pending, cpu, error, used, total, billed: mode === 'Autopilot' ? `${round(used)} vCPU requested by Pods` : `${total} vCPU of nodes, used or not` });
}
