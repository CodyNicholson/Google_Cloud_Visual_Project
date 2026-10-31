import { capacity, cloudRunScaling, computeChooser, computeEngine, EXHAUSTED, functionsEvents, gke, GKE_MODES, NO_INSTANCE, OOM_ERROR, PORT_ERROR, runContract } from '../../lab/compute.js';
import { doc } from '../../lab/lab.js';

const CATEGORY = 'Compute: run your code';

export default [
  {
    id: 'compute-chooser',
    category: CATEGORY,
    title: 'Which compute service?',
    tagline: 'Start with Cloud Run, and move only for a reason you can name',
    description: [
      'Google Cloud has several ways to run code, trading control for convenience. Compute Engine gives you a VM. GKE gives you Kubernetes. Cloud Run takes a container and handles the rest. Cloud Run functions (formerly Cloud Functions) takes just a function. Batch runs large jobs.',
      'Answer the questions and watch the ranking re-sort. The scores are this lab’s teaching heuristic, not an official Google tool.',
      'App Engine still works, but Google calls Cloud Run "a newer and better alternative" and recommends it for new users. If you are unsure, begin with Cloud Run: it can scale to zero while idle, and a container can move to GKE later.',
    ],
    keyApis: ['gcloud run deploy', 'gcloud functions deploy', 'gcloud container clusters create-auto', 'gcloud compute instances create', 'gcloud batch jobs submit'],
    useCases: ['New project architecture', 'Migrating from AWS or Azure'],
    snippet: { lang: 'bash', name: 'same-app-five-ways.sh', code: `# Cloud Run: from source, no Dockerfile needed for common languages
gcloud run deploy web --source . --region=us-central1

# Cloud Run functions: one handler, triggered by an event
gcloud functions deploy resize --gen2 --runtime=python312 \\
  --trigger-topic=uploads --entry-point=resize --region=us-central1

# GKE Autopilot: Kubernetes without managing nodes
gcloud container clusters create-auto shop --region=us-central1

# Compute Engine: a full VM
gcloud compute instances create vm-1 --zone=us-central1-a --machine-type=e2-medium

# Batch: a job that provisions and cleans up its own VMs
gcloud batch jobs submit render-1 --location=us-central1 --config=job.json` },
    inputs: [
      { name: 'workload', label: 'What are you running?', type: 'select', default: 'Web app or API', options: ['Web app or API', 'Small event handler', 'Large batch or HPC job', 'Needs a custom OS, kernel or licence', 'Many cooperating microservices'] },
      { name: 'ops', label: 'Who runs it?', type: 'select', default: 'Nobody wants to run servers', options: ['Nobody wants to run servers', 'Some ops experience', 'A platform team that knows Kubernetes'] },
      { name: 'traffic', label: 'Traffic', type: 'select', default: 'Spiky or often idle', options: ['Spiky or often idle', 'Steady and busy', 'Runs on a schedule, then stops'] },
    ],
    flow: [['dev', 'run', 'container or source'], ['dev', 'fn', 'one function'], ['dev', 'gke', 'Kubernetes manifests'], ['dev', 'gce', 'a VM image']],
    actions: [
      { id: 'run', label: 'Rank the options', tone: 'accent', run: (i) => computeChooser(i) },
      { id: 'wrong', label: 'Do it wrong: GKE for a small API', tone: 'ghost', run: (i) => computeChooser(i, { answers: { workload: 'Web app or API', ops: 'Nobody wants to run servers', traffic: 'Spiky or often idle' }, wrongPick: 'gke', wrongWhy: 'a Kubernetes cluster to learn, upgrade and pay for, for one service nobody wants to operate' }) },
    ],
    pitfalls: [
      { mistake: 'Starting with Kubernetes by default', symptom: 'Weeks spent on manifests, ingress and upgrades before the first user arrives.', why: 'Kubernetes solves problems of scale and platform teams. A small app has neither.', fix: 'Move a stateless service to Cloud Run; the same container runs there.', avoid: 'Adopt GKE only when you need something Cloud Run lacks.', reproduce: 'wrong', source: doc('docs/choosing-a-compute-option', 'Choose a compute option') },
      { mistake: 'Starting new apps on App Engine', symptom: 'You hit App Engine limits and later rewrite for Cloud Run anyway.', why: 'Old tutorials still suggest it. The docs now recommend Cloud Run for new users.', fix: 'Containerise and redeploy on Cloud Run.', avoid: 'Check a tutorial’s date, and the service’s own overview page.', source: doc('appengine/docs/standard/an-overview-of-app-engine', 'App Engine overview') },
    ],
    visual: 'chooser',
    test: { action: 'run' },
  },
  {
    id: 'compute-engine',
    category: CATEGORY,
    title: 'Compute Engine: Spot VMs and capacity',
    tagline: 'Save up to 91% if your job can survive being interrupted',
    description: [
      'Compute Engine rents VMs in families: general purpose (such as E2 and N series), compute-optimized, memory-optimized and accelerator-optimized. Spot VMs use spare capacity at "up to 91%" off, and can be reclaimed at any time with very little warning.',
      'Press Run to play a long job on Spot VMs. Each amber block is a VM that was reclaimed. With checkpoints the next VM resumes from the last save. Without them, all the work restarts from zero. The capacity button shows the other surprise: a zone can simply be out of the machine you asked for.',
      'The default preemption notice is 0 seconds, with a best-effort shutdown period of up to 30 seconds, and you can configure 120 seconds. Spot VMs have no SLA and cannot live migrate. Stopped VMs still bill for their disks and any reserved IP.',
    ],
    keyApis: ['--provisioning-model=SPOT', '--instance-termination-action', 'managed instance groups', '--target-distribution-shape', 'reservations'],
    useCases: ['Batch and rendering', 'ML training with checkpoints', 'Stateless workers behind a queue'],
    snippet: { lang: 'bash', name: 'spot.sh', code: `gcloud compute instances create trainer \\
  --zone=us-central1-a --machine-type=n2-standard-8 \\
  --provisioning-model=SPOT --instance-termination-action=DELETE \\
  --metadata=shutdown-script='#!/bin/bash
gcloud storage cp /tmp/checkpoint.pt gs://my-lab-ckpt/latest.pt'

# Let the group find capacity across zones
gcloud compute instance-groups managed create trainers \\
  --region=us-central1 --size=9 --template=trainer-template \\
  --target-distribution-shape=BALANCED` },
    inputs: [
      { name: 'jobHours', label: 'Job length (hours)', type: 'number', default: 12, min: 1, max: 48 },
      { name: 'preemptEvery', label: 'Mean hours between preemptions', type: 'number', default: 4, min: 1, max: 48 },
      { name: 'checkpointEvery', label: 'Checkpoint every (hours)', type: 'number', default: 0.5, min: 0.25, max: 12, step: 0.25 },
      { name: 'discount', label: 'Spot discount (%)', type: 'number', default: 70, min: 0, max: 91 },
      { name: 'vms', label: 'VMs to request (capacity demo)', type: 'number', default: 9, min: 1, max: 24 },
    ],
    flow: [['dev', 'gce', 'create Spot VM'], ['gce', 'gcs', 'save checkpoint'], ['gce', 'gce', 'preempted: shutdown script'], ['gce', 'gcs', 'next VM resumes']],
    actions: [
      { id: 'run', label: 'Run the job', tone: 'accent', run: (i) => computeEngine(i) },
      { id: 'nockpt', label: 'Do it wrong: no checkpoints', tone: 'ghost', run: (i) => computeEngine(i, { noCheckpoint: true }) },
      { id: 'capacity', label: 'Do it wrong: one zone for a big request', tone: 'ghost', run: (i) => capacity(i), flow: () => [['dev', 'gce', 'create 9 GPU VMs in zone a'], ['gce', 'dev', 'ZONE_RESOURCE_POOL_EXHAUSTED'], ['dev', 'gce', 'regional group: place anywhere'], ['gce', 'dev', 'placed in zones b and c']] },
    ],
    pitfalls: [
      { mistake: 'Using Spot VMs for work that cannot restart', symptom: 'A 12-hour job restarts from zero again and again, and can cost more than on-demand would.', why: 'Compute Engine can preempt at any time, and there is no SLA.', fix: 'Checkpoint to Cloud Storage and make the job resumable.', avoid: 'Use Spot only for fault-tolerant work, with a managed group to replace VMs.', reproduce: 'nockpt', source: doc('compute/docs/instances/spot', 'Spot VMs') },
      { mistake: 'Treating a capacity error like a quota error', symptom: EXHAUSTED, why: 'The zone has no stock of that machine. Your quota is fine, and asking for more will not help.', fix: '"Try a different zone, or try again later." Or change the machine type or provisioning model.', avoid: 'Use regional groups with instance flexibility, and reservations for what you must have.', reproduce: 'capacity', source: doc('compute/docs/troubleshooting/troubleshooting-resource-availability', 'Troubleshoot resource availability') },
      { mistake: 'Assuming a stopped VM is free', symptom: 'Charges continue after stopping every VM.', why: 'Stopped VMs do not pay for vCPU and memory, but persistent disks and reserved IP addresses still bill.', fix: 'Delete the disks and release the addresses.', avoid: 'Delete instead of stop, and label everything so you can find it.', source: doc('compute/docs/instances/stop-start-instance', 'Stop and start a VM') },
      { mistake: 'Hitting the regional vCPU quota', symptom: "Quota 'CPUS' exceeded. Limit: 8.0 in region us-central1.", why: 'New projects have low limits, and free trial accounts cannot request increases.', fix: 'Request an increase on the IAM & Admin → Quotas page, after upgrading the account.', avoid: 'Check quotas before any launch, and alert on usage.', source: doc('docs/quotas/view-manage', 'View and manage quotas') },
    ],
    visual: 'computeEngine',
    test: { action: 'run' },
  },
  {
    id: 'cloud-run-scaling',
    category: CATEGORY,
    title: 'Cloud Run: scaling and concurrency',
    tagline: 'One instance serves many requests, unlike a Lambda',
    description: [
      'Cloud Run starts container instances to match traffic, and removes them when idle, down to zero by default. Under request-based billing an idle service costs nothing, but the next request waits for a cold start. Each instance handles many requests at once, up to the concurrency setting (the gcloud default is 80 × vCPUs, the maximum 1,000).',
      'Set the traffic and limits, then press Run. The chart shows a 60-second story: light traffic, a spike, then silence. Green is instances ready, amber is instances starting, and red is requests refused. Set min instances above zero to skip the cold start, at the price of keeping those instances around.',
      'Concurrency is a ceiling, and Cloud Run can also add instances when CPU is high. Set concurrency to 1 only if your code really cannot handle parallel requests. Set max instances to protect what is downstream, like a database. This simulation is simplified: real scaling also weighs CPU use.',
    ],
    keyApis: ['--concurrency', '--min-instances', '--max-instances', '--cpu-boost', 'gcloud run services update'],
    useCases: ['APIs with spiky traffic', 'Web apps', 'Internal services'],
    snippet: { lang: 'bash', name: 'scaling.sh', code: `gcloud run deploy api \\
  --image=us-central1-docker.pkg.dev/my-lab/app/api:v3 \\
  --region=us-central1 \\
  --concurrency=80 \\
  --min-instances=1 \\
  --max-instances=20 \\
  --cpu-boost \\
  --memory=512Mi` },
    inputs: [
      { name: 'baseRps', label: 'Base traffic (req/s)', type: 'number', default: 20, min: 0, max: 500 },
      { name: 'spikeRps', label: 'Spike (req/s)', type: 'number', default: 1500, min: 1, max: 2000 },
      { name: 'latencyMs', label: 'Request time (ms)', type: 'number', default: 400, min: 10, max: 5000 },
      { name: 'concurrency', label: 'Concurrency', type: 'number', default: 80, min: 1, max: 1000 },
      { name: 'minInstances', label: 'Min instances', type: 'number', default: 0, min: 0, max: 20 },
      { name: 'maxInstances', label: 'Max instances', type: 'number', default: 20, min: 1, max: 100 },
      { name: 'coldStartS', label: 'Cold start (s)', type: 'number', default: 2, min: 0, max: 30 },
    ],
    flow: [['internet', 'run', 'request'], ['run', 'run', 'none free: start another instance'], ['run', 'internet', 'response']],
    actions: [
      { id: 'run', label: 'Play 60 seconds', tone: 'accent', run: (i) => cloudRunScaling(i) },
      { id: 'cap', label: 'Do it wrong: concurrency 1, max 3', tone: 'ghost', run: (i) => cloudRunScaling(i, { concurrency: 1, maxInstances: 3 }), flow: () => [['internet', 'run', 'spike of requests'], ['run', 'run', 'all 3 instances busy, limit reached'], ['run', 'internet', '429 no available instance']] },
    ],
    pitfalls: [
      { mistake: 'A low instance limit with concurrency 1', symptom: NO_INSTANCE, why: 'The service reached its max instances or could not scale fast enough.', fix: 'Raise --max-instances or concurrency, speed up startup, and add client retries with backoff.', avoid: 'Load test, and watch the container instance count metric.', reproduce: 'cap', source: doc('run/docs/troubleshooting', 'Cloud Run troubleshooting') },
      { mistake: 'No max instances in front of a small database', symptom: 'A traffic spike becomes a database outage.', why: 'Cloud Run scales fast by design. Each new instance opens its own connections.', fix: 'Set --max-instances from what the database can accept: see the Cloud SQL page.', avoid: 'Always set a limit you have worked out, rather than the default.', source: doc('run/docs/about-instance-autoscaling', 'About instance autoscaling') },
      { mistake: 'Blaming cold starts on Cloud Run alone', symptom: 'The first request after idle takes many seconds.', why: 'Much of that time is often your app loading: large images, heavy imports, connections at start.', fix: 'Use --cpu-boost, lazy-load, slim the image, or set --min-instances=1.', avoid: 'Measure startup time locally, and keep it low from the start.', source: doc('run/docs/tips/general', 'General development tips') },
    ],
    visual: 'runScale',
    test: { action: 'run' },
  },
  {
    id: 'cloud-run-contract',
    category: CATEGORY,
    title: 'Cloud Run: the container contract',
    tagline: 'Listen on $PORT, keep no state on disk, and finish before you respond',
    description: [
      'Any container runs on Cloud Run if it follows a few rules. It must listen on the port in the PORT variable (8080 by default) on 0.0.0.0, it should keep no state in the instance, and it must expect to be shut down: it gets SIGTERM and 10 seconds.',
      'Change the settings and deploy. Each rule lights up green or red, and the failures show the documented error text. Try writing large files to /tmp: files written locally count against your memory limit.',
      'With the default request-based billing, CPU is throttled once the response is sent. Work you start after responding may never finish, with no error at all. Use Cloud Tasks or Pub/Sub for background work, or instance-based billing to keep the CPU on. The request timeout is at most 60 minutes.',
    ],
    keyApis: ['PORT', '--no-cpu-throttling', 'SIGTERM', '--timeout', '--memory', 'Cloud Tasks'],
    useCases: ['Containerising an app', 'Debugging failed revisions'],
    snippet: { lang: 'js', name: 'server.js', code: `import express from 'express';
const app = express();

app.get('/', (req, res) => res.send('ok'));

// Listen on $PORT, on all interfaces
const server = app.listen(process.env.PORT || 8080, '0.0.0.0');

// You get 10 seconds to finish up
process.on('SIGTERM', () => server.close(() => process.exit(0)));` },
    inputs: [
      { name: 'bind', label: 'Listen address', type: 'select', default: '0.0.0.0', options: ['0.0.0.0', '127.0.0.1'] },
      { name: 'port', label: 'Port', type: 'select', default: 'process.env.PORT', options: ['process.env.PORT', 'hard-coded 3000'] },
      { name: 'memory', label: 'Memory limit (MiB)', type: 'number', default: 512, min: 128, max: 4096 },
      { name: 'tmpWrites', label: 'Written to /tmp (MiB)', type: 'number', default: 50, min: 0, max: 8192 },
      { name: 'billing', label: 'Billing', type: 'select', default: 'Request-based (default)', options: ['Request-based (default)', 'Instance-based'] },
      { name: 'background', label: 'Background work', type: 'select', default: 'Nothing after the response', options: ['Nothing after the response', 'Send an email after the response'] },
    ],
    flow: [['dev', 'build', 'gcloud run deploy --source .'], ['build', 'registry', 'push the image'], ['registry', 'run', 'start a revision'], ['run', 'run', 'wait for $PORT'], ['run', 'dev', 'serving 100% of traffic']],
    actions: [
      { id: 'run', label: 'Deploy', tone: 'accent', run: (i) => runContract(i) },
      { id: 'port', label: 'Do it wrong: listen on 127.0.0.1', tone: 'ghost', run: (i) => runContract(i, { bind: '127.0.0.1' }) },
      { id: 'tmp', label: 'Do it wrong: fill /tmp', tone: 'ghost', run: (i) => runContract(i, { tmpWrites: 2048 }) },
      { id: 'bg', label: 'Do it wrong: work after responding', tone: 'ghost', run: (i) => runContract(i, { background: 'Send an email after the response' }) },
    ],
    pitfalls: [
      { mistake: 'Listening on localhost, or a fixed port', symptom: PORT_ERROR, why: 'The container is not reachable on the port Cloud Run probes. Slow startup or a crash shows the same error, so read the logs.', fix: 'Listen on 0.0.0.0 and process.env.PORT.', avoid: 'Test first: docker run -p 8080:8080 -e PORT=8080 IMAGE', reproduce: 'port', lang: 'js', wrongCode: "app.listen(3000, '127.0.0.1');", rightCode: "app.listen(process.env.PORT || 8080, '0.0.0.0');", source: doc('run/docs/troubleshooting', 'Cloud Run troubleshooting') },
      { mistake: 'Writing large files to the filesystem', symptom: OOM_ERROR, why: 'Files written locally count toward instance memory, including logs written outside /var/log/* and /dev/log.', fix: 'Stream to Cloud Storage, mount a bucket, or raise --memory.', avoid: 'Log to stdout, never to files.', reproduce: 'tmp', source: doc('run/docs/troubleshooting', 'Cloud Run troubleshooting') },
      { mistake: 'Doing work after sending the response', symptom: 'Emails or analytics events go missing at random. There is no error.', why: 'With request-based billing, CPU is throttled after the response, so background tasks may not run reliably.', fix: 'Do the work before responding, or enqueue it with Cloud Tasks or Pub/Sub.', avoid: 'Choose instance-based billing only when you really need background CPU.', reproduce: 'bg', source: doc('run/docs/configuring/billing-settings', 'Billing settings') },
      { mistake: 'A framework timeout shorter than the request timeout', symptom: 'HTTP 503: The request failed because either the HTTP response was malformed or connection to the instance had an error.', why: 'Gunicorn and others can kill workers before the Cloud Run timeout. Out-of-memory kills and failed probes look the same.', fix: 'Set the framework timeout above the Cloud Run timeout (gunicorn --timeout 0).', avoid: 'Copy the Dockerfile in Google’s quickstart for your language.', source: doc('run/docs/troubleshooting', 'Cloud Run troubleshooting') },
    ],
    visual: 'contract',
    test: { action: 'run' },
  },
  {
    id: 'functions-events',
    category: CATEGORY,
    title: 'Functions and events: retries',
    tagline: 'If it can run twice, sooner or later it will',
    description: [
      'Cloud Run functions is what used to be Cloud Functions. Functions react to events through Eventarc: a file lands in Cloud Storage, a message arrives on Pub/Sub, a document changes in Firestore. Delivery is at least once, so the same event can arrive more than once.',
      'Make the function fail and turn retries on or off. Each row is a delivery attempt. Without idempotency every retry repeats the side effect, here a card charge. With idempotency the duplicates are recognised and skipped.',
      'Retries last up to a default window of 7 days with growing delays. Any unhandled error triggers a retry, so a permanent bug retries for a week. Guard against this: catch what will never succeed, and discard events that are too old. Note that an Eventarc trigger created from the Cloud Run page in the console defaults to a single attempt with no retries.',
    ],
    keyApis: ['--retry', 'Eventarc', 'event.id', '--trigger-topic', 'dead-letter topic'],
    useCases: ['Thumbnail generation on upload', 'Reacting to Firestore changes', 'Queue workers'],
    snippet: { lang: 'python', name: 'main.py', code: `from datetime import datetime, timedelta, timezone
import functions_framework
from google.cloud import firestore
from google.api_core.exceptions import AlreadyExists

db = firestore.Client()
MAX_AGE = timedelta(minutes=10)

@functions_framework.cloud_event
def charge_order(event):
    # Stop retry loops: give up on events that are too old
    if datetime.now(timezone.utc) - event_time(event) > MAX_AGE:
        return
    try:
        # create() fails if the document exists: this event already ran
        db.collection("processed").document(event["id"]).create({})
    except AlreadyExists:
        return
    charge_card(event.data)` },
    inputs: [
      { name: 'failures', label: 'Attempts that fail first', type: 'number', default: 2, min: 0, max: 8 },
      { name: 'retry', label: 'Retry on failure', type: 'checkbox', default: true },
      { name: 'idempotent', label: 'Idempotent handler', type: 'checkbox', default: true },
    ],
    flow: [['gcs', 'pubsub', 'object finalized event'], ['pubsub', 'fn', 'deliver'], ['fn', 'pubsub', 'error: not acknowledged'], ['pubsub', 'fn', 'retry with backoff'], ['fn', 'fstore', 'record the event ID']],
    actions: [
      { id: 'run', label: 'Deliver the event', tone: 'accent', run: (i) => functionsEvents(i) },
      { id: 'double', label: 'Do it wrong: retries, not idempotent', tone: 'ghost', run: (i) => functionsEvents(i, { retry: true, idempotent: false }) },
      { id: 'loop', label: 'Do it wrong: a permanent bug with retries', tone: 'ghost', run: (i) => functionsEvents(i, { retry: true, permanent: true, idempotent: true }) },
    ],
    pitfalls: [
      { mistake: 'A handler that is not idempotent', symptom: 'A customer is charged twice, or two welcome emails go out, with no errors in the logs.', why: 'Event delivery is at least once. A retry repeats everything the function did before it failed.', fix: 'Record the event ID with a create-if-absent write before doing the side effect.', avoid: 'Assume every handler runs twice, and test it that way.', reproduce: 'double', source: doc('functions/docs/bestpractices/retries', 'Retry event-driven functions') },
      { mistake: 'Retrying errors that can never succeed', symptom: 'One bad message fails for 7 days, filling the logs and the bill.', why: 'Any unhandled error triggers a retry when retries are on, up to the retry window.', fix: 'Catch permanent errors and return normally. Discard events older than a set age.', avoid: 'Configure a dead-letter topic, and shorten the retry window (10 minutes at minimum).', reproduce: 'loop', source: doc('functions/docs/bestpractices/retries', 'Retry event-driven functions') },
      { mistake: 'A function that triggers itself', symptom: 'Costs climb sharply: a function writes to the bucket that triggers it, forever.', why: 'Each write fires a new event, and nothing stops the loop.', fix: 'Stop it: delete the trigger first. Then write output to a different bucket.', avoid: 'Use separate input and output buckets.', source: doc('run/docs/triggering/storage-triggers', 'Cloud Storage triggers') },
    ],
    visual: 'deliveries',
    test: { action: 'run' },
  },
  {
    id: 'gke',
    category: CATEGORY,
    title: 'GKE: Autopilot and scheduling',
    tagline: 'Pods go where their requests fit, or they wait',
    description: [
      'Google Kubernetes Engine runs Kubernetes for you. In Autopilot, Google manages nodes, scaling and patching, and general-purpose Pods are billed per Pod for what they request. In Standard you manage node pools, and pay for nodes whether full or not.',
      'Scale the deployment and watch Pods land on nodes. The scheduler reads each Pod’s CPU request, so the request, not the actual usage, decides placement. On a fixed Standard cluster extra Pods stay Pending. On Autopilot nodes appear for them.',
      'Both modes have a per-cluster management fee, with a free-tier credit covering one Autopilot or zonal Standard cluster. Prefer regional clusters for production, and turn on Workload Identity Federation for GKE so Pods have their own identity.',
    ],
    keyApis: ['kubectl describe pod', 'resources.requests', 'create-auto', 'Horizontal Pod Autoscaler', 'node auto-provisioning'],
    useCases: ['Many services with shared infrastructure', 'Stateful and GPU workloads', 'Teams already using Kubernetes'],
    snippet: { lang: 'yaml', name: 'deployment.yaml', code: `apiVersion: apps/v1
kind: Deployment
metadata: { name: web }
spec:
  replicas: 8
  selector: { matchLabels: { app: web } }
  template:
    metadata: { labels: { app: web } }
    spec:
      containers:
        - name: web
          image: us-central1-docker.pkg.dev/my-lab/app/web:v3
          resources:
            requests: { cpu: 500m, memory: 512Mi }
            limits: { memory: 512Mi }` },
    inputs: [
      { name: 'mode', label: 'Cluster', type: 'select', default: GKE_MODES[0], options: GKE_MODES },
      { name: 'replicas', label: 'Pods', type: 'number', default: 8, min: 1, max: 24 },
      { name: 'cpu', label: 'CPU request per Pod', type: 'number', default: 0.5, min: 0.25, max: 8, step: 0.25 },
    ],
    flow: [['dev', 'gke', 'kubectl apply'], ['gke', 'gke', 'scheduler checks requests'], ['gke', 'gce', 'provision a node if needed'], ['gke', 'registry', 'pull the image']],
    actions: [
      { id: 'run', label: 'Schedule', tone: 'accent', run: (i) => gke(i) },
      { id: 'big', label: 'Do it wrong: Pods larger than any node', tone: 'ghost', run: (i) => gke(i, { mode: GKE_MODES[1], cpu: 4 }) },
    ],
    pitfalls: [
      { mistake: 'Requesting more than any node has', symptom: '0/3 nodes are available: 3 Insufficient cpu.', why: 'The Pod’s requests are larger than what any eligible node pool can provide.', fix: 'Lower the request, add a larger node pool, or turn on node auto-provisioning.', avoid: 'Set requests from measured usage. Run kubectl describe pod first when Pods are Pending.', reproduce: 'big', source: doc('kubernetes-engine/docs/troubleshooting/deployed-workloads', 'Troubleshoot deployed workloads') },
      { mistake: 'An image the cluster cannot pull', symptom: 'ImagePullBackOff / ErrImagePull', why: 'A wrong image path, or the node’s service account lacks Artifact Registry Reader.', fix: 'Check the path, then grant roles/artifactregistry.reader.', avoid: 'Use full paths with digests or immutable tags, and test a pull.', source: doc('kubernetes-engine/docs/troubleshooting/image-pulls', 'Troubleshoot image pulls') },
      { mistake: 'Ignoring a crashing container', symptom: 'CrashLoopBackOff', why: 'The container keeps exiting, often from bad config, a missing secret or an out-of-memory kill.', fix: 'kubectl logs POD --previous shows why it died.', avoid: 'Add startup and readiness probes, and set memory limits from real usage.', source: doc('kubernetes-engine/docs/troubleshooting/crashloopbackoff-events', 'Troubleshoot CrashLoopBackOff') },
    ],
    visual: 'gke',
    test: { action: 'run' },
  },
];
