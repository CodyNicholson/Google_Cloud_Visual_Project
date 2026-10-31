// The overview page's content, plus antiPatterns and troubleshooting, which also feed the #pitfalls page.
import { doc } from '../lab/lab.js';

export const OVERVIEW = {
  title: 'Google Cloud, explained for a new developer',
  intro: 'Every product in one searchable atlas, animated simulations of how the platform behaves, and the mistakes and errors to avoid. It runs entirely in your browser, so no account is needed.',
  facts: [
    ['Regions', '43'],
    ['Zones', '130'],
    ['Free trial', '$300 / 90 days'],
    ['Default compute', 'Cloud Run'],
    ['CLI', 'gcloud'],
  ],
  mentalModel: [
    'Everything lives in a project. It is the boundary for billing, APIs, quotas and permissions. Create lots of them.',
    'Most things you call are APIs at *.googleapis.com. A project must enable an API before it can use it.',
    'Permissions are roles granted to a principal on a resource, and they flow down from organization to folder to project.',
    'Software has identities too. Attach a service account to your workload and skip the key file.',
    'Choose where things run: zonal, regional or global. Unlike AWS, a VPC network is global and its subnets are regional.',
    'Prefer managed services. Start with Cloud Run, Cloud SQL and Cloud Storage, and add complexity only for a reason you can name.',
  ],
  steps: [
    {
      title: 'Get a free sandbox',
      text: 'Create an account for the $300 credit, or open Cloud Shell in the console: it is free, with gcloud already logged in. Non-billable trial accounts have limits, such as no GPUs or quota increases.',
    },
    {
      title: 'Install and sign in',
      text: 'There are two logins: one for the gcloud tool and one for your code.',
      commands: [
        'gcloud init',
        'gcloud auth login',
        'gcloud auth application-default login',
      ],
    },
    {
      title: 'Create a project and protect yourself',
      text: 'Link billing, then add a budget right away. A budget alerts you. It does not stop spending.',
      commands: [
        'gcloud projects create my-first-lab-20261031',
        'gcloud config set project my-first-lab-20261031',
        'gcloud billing projects link my-first-lab-20261031 --billing-account=YOUR_ACCOUNT',
        'gcloud billing budgets create --billing-account=YOUR_ACCOUNT --display-name=lab --budget-amount=20USD',
      ],
    },
    {
      title: 'Deploy something',
      text: 'Enable the API, then deploy a sample. You get an HTTPS URL, and it can scale to zero.',
      commands: [
        'gcloud services enable run.googleapis.com',
        'gcloud run deploy hello --image=us-docker.pkg.dev/cloudrun/container/hello --region=us-central1 --allow-unauthenticated',
      ],
    },
    {
      title: 'Clean up',
      text: 'Delete the project when you finish. It removes everything inside, and stops the charges.',
      commands: ['gcloud projects delete my-first-lab-20261031'],
    },
  ],
  pros: [
    'BigQuery and Cloud Run are strong, low-operations defaults, with generous free tiers.',
    'A global VPC and global load balancer make multi-region simpler.',
    'GKE comes from the company that created Kubernetes.',
    'Strong data and AI products, working together with shared IAM.',
    'Per-project separation makes clean environments straightforward.',
  ],
  cons: [
    'Products get renamed often, so old tutorials can mislead. See the Atlas for former names.',
    'Products are sometimes retired: Container Registry, IoT Core and Deployment Manager are examples.',
    'Budgets alert but mostly do not cap spending, so a mistake can cost real money.',
    'Permission errors can be opaque, because several layers can refuse a request.',
    'Smaller partner ecosystem and hiring pool than AWS in many markets.',
  ],
  whenToUse: [
    'Data and analytics at the center of your product.',
    'Containers and Kubernetes workloads.',
    'AI features built on Gemini models.',
    'Teams who want managed services over running infrastructure.',
  ],
  whenNotToUse: [
    'A small static site: simpler hosts may be cheaper and easier.',
    'Deep commitment to Microsoft tooling, where Azure may integrate better.',
    'A service AWS offers and Google Cloud does not: check the Atlas first.',
    'Where your required region or compliance scheme is not available.',
  ],
  antiPatterns: [
    { dont: 'Don’t run everything in one project.', why: 'The project is the boundary for IAM, quotas and billing, so one mistake reaches everything.', instead: 'One project per application and environment.' },
    { dont: 'Don’t use Owner or Editor for applications.', why: 'Basic roles grant far more than any app needs, so a bug or a leak has a huge blast radius.', instead: 'A dedicated service account with predefined roles.' },
    { dont: 'Don’t download service account keys.', why: 'They do not expire by default, get copied around, and their holder cannot be identified.', instead: 'Attached service accounts, impersonation, or Workload Identity Federation.' },
    { dont: 'Don’t treat a budget as a limit.', why: 'An alerts-only budget does not cap spending, and its alerts come late.', instead: 'Low budgets, Pub/Sub automation, quotas, and spend caps where available.' },
    { dont: 'Don’t start with GKE by default.', why: 'You take on a platform to learn, upgrade and pay for, before you have the problems it solves.', instead: 'Cloud Run, moving when you can name the feature you need.' },
    { dont: 'Don’t use BigQuery as an application database.', why: 'It is built for analytical scans, not per-user reads and writes.', instead: 'Serve from Cloud SQL, Firestore or Spanner, and copy data to BigQuery for analysis.' },
    { dont: 'Don’t expose the default network to the internet.', why: 'Its rules allow SSH and RDP from anywhere.', instead: 'A custom network, no external IPs, IAP for SSH, and Cloud NAT for egress.' },
    { dont: 'Don’t click resources into production.', why: 'Console changes leave no review or record, and drift from your code.', instead: 'Terraform, with state in a versioned bucket, applied from CI.' },
    { dont: 'Don’t put secrets in images, code or plain variables.', why: 'Those get copied into registries, logs and repositories.', instead: 'Secret Manager, with a pinned version and access per secret.' },
    { dont: 'Don’t put monotonic keys first in Spanner or Bigtable.', why: 'New rows all land on one server, so adding nodes does nothing.', instead: 'A UUIDv4, hash prefix or user ID at the start of the key.' },
  ],
  troubleshooting: [
    { mistake: 'The API is not enabled', symptom: 'Error 403: Cloud SQL Admin API has not been used in project my-project before or it is disabled. Enable it by visiting … then retry.', why: 'Most APIs are off by default. Check which project the message names: it may not be yours.', fix: 'gcloud services enable sqladmin.googleapis.com, then wait a few minutes.', avoid: 'Declare APIs in your setup script or Terraform.', source: doc('apis/docs/getting-started', 'Getting started with APIs') },
    { mistake: 'Your identity lacks a permission', symptom: "PERMISSION_DENIED: Permission 'run.services.create' denied on resource (or resource may not exist).", why: 'A role is missing, or you are acting as a different identity than you think. "May not exist" is deliberate: it avoids confirming resources to outsiders.', fix: 'Run gcloud auth list and gcloud config list, then grant the role. Use the Policy Troubleshooter.', avoid: 'Script roles with your project setup.', source: doc('policy-intelligence/docs/troubleshoot-access', 'Troubleshoot IAM permissions') },
    { mistake: 'Local code has no credentials', symptom: 'google.auth.exceptions.DefaultCredentialsError: Your default credentials were not found.', why: 'gcloud auth login does not set up credentials for your code.', fix: 'gcloud auth application-default login', avoid: 'Put it in your README.', source: doc('docs/authentication/provide-credentials-adc', 'Set up ADC') },
    { mistake: 'Billing is not linked', symptom: '403 Account Disabled, or: Billing must be enabled for activation of service(s).', why: 'The project has no active billing account, or the free trial ended.', fix: 'gcloud billing projects link PROJECT --billing-account=ID', avoid: 'Watch for the trial’s end date.', source: doc('storage/docs/troubleshooting', 'Cloud Storage troubleshooting') },
    { mistake: 'A quota was reached', symptom: "Quota 'CPUS' exceeded. Limit: 8.0 in region us-central1.", why: 'Projects have limits, and they start low. It differs from capacity errors.', fix: 'Request an increase on the Quotas page, or use another region.', avoid: 'Alert on quota usage, and request increases before launch.', source: doc('docs/quotas/view-manage', 'View and manage quotas') },
    { mistake: 'The zone has no capacity', symptom: 'ZONE_RESOURCE_POOL_EXHAUSTED: The zone does not have enough resources available to fulfill the request.', why: 'The zone is out of that hardware. This is not your quota.', fix: 'Try another zone, machine type, or later.', avoid: 'Regional groups and reservations.', source: doc('compute/docs/troubleshooting/troubleshooting-resource-availability', 'Resource availability') },
    { mistake: 'Cannot connect to a VM', symptom: 'ERROR: (gcloud.compute.ssh) [/usr/bin/ssh] exited with return code [255].', why: 'Usually a firewall rule, a VM with no external IP, or a missing role for OS Login or IAP.', fix: 'Allow 35.235.240.0/20 on port 22 and use --tunnel-through-iap, with roles/iap.tunnelResourceAccessor.', avoid: 'Use IAP from the start. Run gcloud compute ssh --troubleshoot.', source: doc('compute/docs/troubleshooting/troubleshooting-ssh-errors', 'Troubleshooting SSH errors') },
    { mistake: 'A request hangs, then times out', symptom: 'dial tcp REMOTE_HOST:REMOTE_PORT: i/o timeout', why: 'Firewall rules, routes or a proxy block the traffic. Dropped packets produce no error.', fix: 'Use Connectivity Tests to see exactly which rule drops it.', avoid: 'Plan egress: Private Google Access and Cloud NAT for private workloads.', source: doc('run/docs/troubleshooting', 'Cloud Run troubleshooting') },
    { mistake: 'A private Cloud Run service refuses you', symptom: 'Your client does not have permission to get URL from this server. (HTTP 403)', why: 'By default services need the Cloud Run Invoker role.', fix: 'Grant the Invoker role, or use gcloud run services proxy to test.', avoid: 'Choose public or private access on purpose at deploy.', source: doc('run/docs/troubleshooting', 'Cloud Run troubleshooting') },
    { mistake: 'A blocked request despite being Owner', symptom: 'Request is prohibited by organization\'s policy', why: 'Organization Policy or VPC Service Controls sit outside of IAM roles.', fix: 'Read the violationReason in the audit log, and change that layer.', avoid: 'Know your organization’s policies before starting.', source: doc('vpc-service-controls/docs/troubleshooting', 'VPC Service Controls troubleshooting') },
  ],
  alternatives: [
    ['Amazon Web Services', 'The largest catalog and ecosystem. A VPC is regional rather than global. See the AWS and Azure names in the Atlas.'],
    ['Microsoft Azure', 'Deep integration with Entra ID, Microsoft 365 and .NET. Strong in enterprises already on Microsoft.'],
    ['Oracle Cloud', 'Attractive for Oracle databases and some network pricing.'],
    ['Cloudflare, Vercel, Fly.io', 'Much simpler for web apps at the edge, with fewer services overall.'],
  ],
  sources: [
    { title: 'Compare AWS and Azure services to Google Cloud', url: 'https://docs.cloud.google.com/docs/get-started/aws-azure-gcp-service-comparison' },
    { title: 'Free Google Cloud features', url: 'https://docs.cloud.google.com/free/docs/free-cloud-features' },
    { title: 'Global locations', url: 'https://cloud.google.com/about/locations' },
    { title: 'Cloud Run troubleshooting', url: 'https://docs.cloud.google.com/run/docs/troubleshooting' },
    { title: 'Best practices for service accounts', url: 'https://docs.cloud.google.com/iam/docs/best-practices-service-accounts' },
    { title: 'Estimate and control BigQuery costs', url: 'https://docs.cloud.google.com/bigquery/docs/best-practices-costs' },
  ],
};
