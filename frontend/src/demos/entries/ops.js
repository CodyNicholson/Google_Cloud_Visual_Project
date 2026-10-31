import { ALREADY_EXISTS, CICD_ERRORS, STATE_LOCK, cicd, logging, sloAlerts, terraformState } from '../../lab/ops.js';
import { doc } from '../../lab/lab.js';

const CATEGORY = 'DevOps and observability';

export default [
  {
    id: 'ci-cd',
    category: CATEGORY,
    title: 'CI/CD: from commit to canary',
    tagline: 'Cloud Build, Artifact Registry, Cloud Run, and no keys',
    description: [
      'A typical pipeline: GitHub Actions or Cloud Build builds an image, pushes it to Artifact Registry, and deploys it to Cloud Run. Each revision is immutable. So you can deploy with no traffic, send 10% as a canary, then shift the rest, or roll back quickly.',
      'Untick any grant to see where and how the pipeline fails. Each failing stage gives a distinctive error, and production stays on the old revision.',
      'Container Registry is shut down: since March 18, 2025, writing images to it is unavailable, and new work should use Artifact Registry (pkg.dev), where a repository must exist before you can push. Cloud Source Repositories closed to new customers in 2024, so use GitHub, GitLab or Secure Source Manager. Cloud Deploy adds managed promotion between environments.',
    ],
    keyApis: ['gcloud builds submit', 'gcloud artifacts repositories create', '--no-traffic', 'update-traffic', 'Cloud Deploy'],
    useCases: ['Safe releases', 'GitHub to Cloud Run', 'Quick rollback'],
    snippet: { lang: 'yaml', name: 'cloudbuild.yaml', code: `steps:
  - name: gcr.io/cloud-builders/docker
    args: [build, -t, '$_IMAGE:$SHORT_SHA', .]
  - name: gcr.io/cloud-builders/docker
    args: [push, '$_IMAGE:$SHORT_SHA']
  - name: gcr.io/google.com/cloudsdktool/cloud-sdk
    entrypoint: gcloud
    args: [run, deploy, web, --image, '$_IMAGE:$SHORT_SHA',
           --region, us-central1, --no-traffic, --tag, canary]
substitutions:
  _IMAGE: us-central1-docker.pkg.dev/my-lab/app/web
options:
  logging: CLOUD_LOGGING_ONLY` },
    inputs: [
      { name: 'auth', label: 'Federated login works', type: 'checkbox', default: true },
      { name: 'repo', label: 'Repository exists', type: 'checkbox', default: true },
      { name: 'push', label: 'Artifact Registry Writer', type: 'checkbox', default: true },
      { name: 'deploy', label: 'Cloud Run Developer', type: 'checkbox', default: true },
      { name: 'actas', label: 'Service Account User', type: 'checkbox', default: true },
      { name: 'canary', label: 'Canary traffic (%)', type: 'number', default: 10, min: 0, max: 100 },
    ],
    flow: [['gh', 'iam', 'OIDC token for a short-lived credential'], ['gh', 'build', 'build the image'], ['build', 'registry', 'push by commit SHA'], ['build', 'run', 'deploy, no traffic'], ['run', 'run', 'shift 10%, then 100%']],
    actions: [
      { id: 'run', label: 'Run the pipeline', tone: 'accent', run: (i) => cicd(i) },
      { id: 'actas', label: 'Do it wrong: no Service Account User', tone: 'ghost', run: (i) => cicd({ ...i, auth: true, repo: true, push: true, deploy: true, actas: true }, { skip: 'actas' }) },
      { id: 'repo', label: 'Do it wrong: push before creating the repo', tone: 'ghost', run: (i) => cicd({ ...i, auth: true, repo: true, push: true, deploy: true, actas: true }, { skip: 'repo' }) },
    ],
    pitfalls: [
      { mistake: 'Forgetting Service Account User', symptom: CICD_ERRORS.actas, why: 'Deploying a service that runs as an account requires permission to act as it. Otherwise a deployer could borrow any identity.', fix: 'Grant roles/iam.serviceAccountUser on that runtime account, not on the project.', avoid: 'Include it in your pipeline’s Terraform.', reproduce: 'actas', source: doc('run/docs/deploying', 'Deploying to Cloud Run') },
      { mistake: 'Pushing to a repository that does not exist', symptom: CICD_ERRORS.repo, why: 'Push and pull requests to pkg.dev require the repository to already exist. gcr.io used to create it for you.', fix: 'gcloud artifacts repositories create.', avoid: 'Create repositories in IaC, with cleanup policies.', reproduce: 'repo', source: doc('artifact-registry/docs/transition/transition-from-gcr', 'Transition from Container Registry') },
      { mistake: 'Following old tutorials that push to Container Registry', symptom: 'Pushing to a gcr.io host backed by Container Registry fails: writes have been unavailable since March 18, 2025.', why: 'Container Registry is shut down. gcr.io URLs hosted on Artifact Registry are not affected.', fix: 'Use LOCATION-docker.pkg.dev/PROJECT/REPO/IMAGE.', avoid: 'Run gcloud auth configure-docker LOCATION-docker.pkg.dev, not the old gcr.io helper.', source: doc('artifact-registry/docs/transition/transition-from-gcr', 'Transition from Container Registry') },
      { mistake: 'Deploying the :latest tag', symptom: 'You cannot tell what is running, and a rollback redeploys the wrong image.', why: 'Mutable tags move.', fix: 'Tag with the commit SHA, or deploy by digest.', avoid: 'Make tags immutable in the repository settings.', source: doc('artifact-registry/docs/docker/names', 'Container image names') },
    ],
    visual: 'gatesTraffic',
    test: { action: 'run' },
  },
  {
    id: 'terraform-state',
    category: CATEGORY,
    title: 'Terraform and shared state',
    tagline: 'The state file is the source of truth, so keep one and lock it',
    description: [
      'Infrastructure as code means you can recreate your environment from a repository. Terraform is the standard on Google Cloud. Infrastructure Manager runs it as a managed service, and Config Connector manages resources from Kubernetes. Cloud Deployment Manager is past end of support: it reached end of support in spring 2026 and is turned down on June 30, 2027.',
      'Terraform compares your code with a state file, then plans changes. Pick a backend and play two engineers applying at once. With a local file each has their own truth. With a Cloud Storage backend they share one, and a lock makes the second one wait.',
      'Keep state in a versioned bucket, because it can hold secrets and you may need to go back. Set prevent_destroy on stateful resources like databases. Don’t mix console edits with Terraform, because terraform plan will try to undo them.',
    ],
    keyApis: ['backend "gcs"', 'terraform plan', 'terraform import', 'google_project_service', 'prevent_destroy', 'Infrastructure Manager'],
    useCases: ['Reproducible environments', 'Team infrastructure changes', 'Review before apply'],
    snippet: { lang: 'hcl', name: 'main.tf', code: `terraform {
  backend "gcs" {
    bucket = "my-lab-tfstate"
    prefix = "prod"
  }
}

resource "google_project_service" "run" {
  service            = "run.googleapis.com"
  disable_on_destroy = false
}

resource "google_sql_database_instance" "orders" {
  name             = "orders"
  database_version = "POSTGRES_16"
  region           = var.region
  settings { tier = "db-custom-2-7680" }
  lifecycle { prevent_destroy = true }
}` },
    inputs: [{ name: 'backend', label: 'Where state lives', type: 'select', default: 'Cloud Storage backend with locking', options: ['Cloud Storage backend with locking', 'Local terraform.tfstate on each laptop'] }],
    flow: [['dev', 'gcs', 'lock and read state'], ['dev', 'api', 'apply the plan'], ['api', 'gcs', 'create the resources'], ['dev', 'gcs', 'save state, release lock']],
    actions: [
      { id: 'run', label: 'Two engineers apply', tone: 'accent', run: (i) => terraformState(i) },
      { id: 'local', label: 'Do it wrong: local state', tone: 'ghost', run: (i) => terraformState(i, { backend: 'Local terraform.tfstate on each laptop' }) },
    ],
    pitfalls: [
      { mistake: 'State on a laptop', symptom: ALREADY_EXISTS, why: 'Each person’s state knows nothing of the other’s work, so Terraform tries to create what already exists.', fix: 'Add the gcs backend, run terraform init -migrate-state, then terraform import.', avoid: 'Set up the backend before the first apply.', reproduce: 'local', source: doc('docs/terraform/resource-management/store-state', 'Store Terraform state in Cloud Storage') },
      { mistake: 'Force-unlocking a lock that is still in use', symptom: STATE_LOCK, why: 'That message means someone else, or a crashed run, holds the lock.', fix: 'Check who holds it. Use terraform force-unlock only if the run is really dead.', avoid: 'Run applies from CI, one at a time.', source: { title: 'Terraform gcs backend', url: 'https://developer.hashicorp.com/terraform/language/backend/gcs' } },
      { mistake: 'Enabling APIs by hand, or forgetting them', symptom: 'Error 403: Cloud SQL Admin API has not been used in project my-project before or it is disabled.', why: 'Terraform creates resources in a project whose APIs are off.', fix: 'Add google_project_service for each API and depend on it.', avoid: 'Keep disable_on_destroy = false, so a destroy does not switch off an API others use.', source: { title: 'Common issues with the Terraform Google provider', url: 'https://registry.terraform.io/providers/hashicorp/google/latest/docs/guides/common_issues' } },
      { mistake: 'Starting new work on Deployment Manager', symptom: 'New users cannot enable the Deployment Manager V2 API, as of June 30, 2026.', why: 'It is past end of support, and it is turned down on June 30, 2027.', fix: 'Convert with DM Convert, then import into Infrastructure Manager.', avoid: 'Use Terraform for new work.', source: doc('deployment-manager/docs/deprecations', 'Deployment Manager end of support') },
    ],
    visual: 'terraform',
    test: { action: 'run' },
  },
  {
    id: 'logging',
    category: CATEGORY,
    title: 'Cloud Logging and the Log Router',
    tagline: 'Every entry passes through sinks, and verbose ones can dominate your bill',
    description: [
      'Anything your app writes to stdout on Cloud Run, GKE or Cloud Run functions lands in Cloud Logging automatically. Each entry goes through the Log Router. There, sinks decide where it goes: log buckets, BigQuery, Cloud Storage or Pub/Sub.',
      'Each project has two built-in sinks. _Required keeps Admin Activity and other key audit logs, and "You can\'t modify or delete" it. _Default takes the rest, and you can add exclusions. Default retention is 400 days for _Required and 30 days for _Default. The free tier includes 50 GiB of log data per project each month, and ingestion after that is billed.',
      'Toggle the exclusions and watch entries route and the bill change (the price here is illustrative). Sinks are not retroactive: they apply only to new entries. Exclusions don’t reduce entries.write quota either. Write structured JSON logs so you can filter on fields.',
    ],
    keyApis: ['gcloud logging sinks create', '--add-exclusion', 'gcloud logging read', 'Log Analytics', 'severity'],
    useCases: ['Debugging', 'Audit and compliance', 'Exporting logs to BigQuery'],
    snippet: { lang: 'python', name: 'structured_log.py', code: `import json

# On Cloud Run, one line of JSON on stdout becomes a structured entry.
# severity and message are recognised; the rest becomes jsonPayload.
print(json.dumps({
    "severity": "ERROR",
    "message": "payment failed",
    "order_id": "o-1042",
    "logging.googleapis.com/trace": f"projects/my-lab/traces/{trace_id}",
}))

# gcloud logging read 'severity>=ERROR AND jsonPayload.order_id="o-1042"' --limit=10` },
    inputs: [
      { name: 'excludeDebug', label: 'Exclude DEBUG', type: 'checkbox', default: true },
      { name: 'sampleLb', label: 'Sample LB logs at 10%', type: 'checkbox', default: true },
      { name: 'sink', label: 'Errors to BigQuery', type: 'checkbox', default: true },
    ],
    flow: [['run', 'log', 'stdout: JSON line'], ['log', 'log', 'Log Router checks each sink'], ['log', 'gcs', 'optional archive'], ['log', 'bq', 'errors for analysis']],
    actions: [
      { id: 'run', label: 'Route a month of logs', tone: 'accent', run: (i) => logging(i) },
      { id: 'noisy', label: 'Do it wrong: DEBUG in production', tone: 'ghost', run: (i) => logging(i, { excludeDebug: false, sampleLb: false, sink: false, noisy: true }) },
    ],
    pitfalls: [
      { mistake: 'Debug logging left on in production', symptom: 'Logging is a large line on the bill, and searches are slow.', why: 'Ingestion is billed per GiB beyond the free allowance.', fix: 'Add an exclusion to the _Default sink, and lower the log level.', avoid: 'Review your biggest log sources monthly.', reproduce: 'noisy', lang: 'bash', rightCode: "gcloud logging sinks update _Default \\\n  --add-exclusion=name=no-debug,filter='severity=DEBUG'", source: doc('logging/docs/routing/overview', 'Routing and storage overview') },
      { mistake: 'Expecting a new sink to include old logs', symptom: 'The BigQuery dataset is empty, although the logs exist.', why: 'Sinks do not route retroactively. Also the sink’s writer identity needs write access to the destination.', fix: 'Grant the writer identity a role on the destination. Use the copy-logs feature for existing data.', avoid: 'Create sinks early, and test with one entry.', source: doc('logging/docs/routing/overview', 'Routing and storage overview') },
      { mistake: 'Writing logs to files in a container', symptom: 'Nothing appears in Cloud Logging, and memory grows on Cloud Run.', why: 'Only stdout, stderr, /dev/log and /var/log are collected; other files count against memory.', fix: 'Log to stdout.', avoid: 'Configure your logging library for JSON on stdout.', source: doc('run/docs/logging', 'Logging and viewing logs in Cloud Run') },
    ],
    visual: 'logRouter',
    test: { action: 'run' },
  },
  {
    id: 'slo-alerts',
    category: CATEGORY,
    title: 'Monitoring, SLOs and alerts',
    tagline: 'Alert on what users feel, using an error budget',
    description: [
      'Cloud Monitoring collects metrics automatically. An alert policy combines a condition, notification channels and documentation. Cloud Trace and Cloud Profiler show where time goes, and Error Reporting groups crashes.',
      'A service level objective (SLO) says how reliable you aim to be. 99.9% over 30 days allows 43.2 minutes of total failure, which is your error budget. The burn rate is how fast an incident spends it. A 2% error rate burns a 99.9% budget at 20×.',
      'Set an objective and an incident. The ring shows how much budget it spends, and the policy decides between paging, a ticket and nothing. Paging at 14.4× and ticketing at 3× are figures from Google’s SRE workbook. Add a metric-absence condition too: when a service dies, it may stop reporting errors along with everything else.',
    ],
    keyApis: ['gcloud monitoring policies create', 'burn rate', 'metric-absence condition', 'uptime checks', 'OpenTelemetry'],
    useCases: ['On-call alerting', 'Release decisions', 'Reliability targets'],
    snippet: { lang: 'yaml', name: 'alert-policy.yaml', code: `displayName: Web burning error budget fast
combiner: OR
conditions:
  - displayName: Burn rate above 14.4 over 1 hour
    conditionThreshold:
      filter: >
        select_slo_burn_rate("projects/my-lab/services/web/serviceLevelObjectives/avail", "3600s")
      comparison: COMPARISON_GT
      thresholdValue: 14.4
      duration: 0s
notificationChannels: [projects/my-lab/notificationChannels/123]
documentation:
  content: "Runbook: https://example.com/runbooks/web"` },
    inputs: [
      { name: 'slo', label: 'SLO (%)', type: 'number', default: 99.9, min: 90, max: 99.99, step: 0.01 },
      { name: 'errorPct', label: 'Error rate during incident (%)', type: 'number', default: 2, min: 0, max: 100, step: 0.1 },
      { name: 'incidentMin', label: 'Incident length (min)', type: 'number', default: 60, min: 1, max: 1440 },
    ],
    flow: [['run', 'mon', 'request and error metrics'], ['mon', 'mon', 'compute the burn rate'], ['mon', 'dev', 'page: burn above 14.4x'], ['dev', 'log', 'investigate']],
    actions: [
      { id: 'run', label: 'Measure the incident', tone: 'accent', run: (i) => sloAlerts(i) },
      { id: 'noisy', label: 'Do it wrong: alert on any 5xx', tone: 'ghost', run: (i) => sloAlerts(i, { errorPct: 0.05, noisy: true }) },
    ],
    pitfalls: [
      { mistake: 'Alerting on any single error', symptom: 'Dozens of pages a month, all ignored, including the one that matters.', why: 'A threshold on raw errors does not distinguish a blip from an outage.', fix: 'Alert on the burn rate of an SLO.', avoid: 'Each page should need action. Delete the rest.', reproduce: 'noisy', source: { title: 'Alerting on SLOs (Google SRE workbook)', url: 'https://sre.google/workbook/alerting-on-slos/' } },
      { mistake: 'No alert for silence', symptom: 'The service was down for hours, and no alert fired because no errors were reported.', why: 'Threshold conditions need data to evaluate.', fix: 'Add a metric-absence condition, or an uptime check.', avoid: 'Test alerts by stopping a service in staging.', source: doc('monitoring/alerts', 'Alerting overview') },
      { mistake: 'Alerts with no notification channel or runbook', symptom: 'An alert opens in the console, and nobody sees it.', why: 'A policy needs notification channels, and a responder needs documentation.', fix: 'Add a channel and the documentation field.', avoid: 'Manage policies in code, and review them with each new service.', source: doc('monitoring/alerts', 'Alerting overview') },
    ],
    visual: 'slo',
    test: { action: 'run' },
  },
];
