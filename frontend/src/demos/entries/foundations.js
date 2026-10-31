import { adc, budgets, firstProject, FIRST_PROJECT_ERRORS, globalInfra, hierarchy, iamEvaluator, serviceAccounts, ADC_NOT_FOUND, IDENTITY_METHODS, PERMISSIONS, ROLES } from '../../lab/foundations.js';
import { doc } from '../../lab/lab.js';

const CATEGORY = 'Start here: foundations and identity';

export default [
  {
    id: 'first-project',
    category: CATEGORY,
    title: 'Your first deploy: the five gates',
    tagline: 'Almost every first-day error means one of these five gates is still closed',
    description: [
      'In Google Cloud everything lives in a project. A project is the unit for billing, API access and permissions. A brand new project has few APIs turned on, and it cannot use paid services until a billing account is linked.',
      'Untick a box and press Deploy. The request walks the gates in order and stops at the first closed one, so you only ever see one error at a time. Fixing it reveals the next. That is why a first deploy can fail three times with three different messages.',
      'Each gate has its own error, and they are easy to mix up. "API has not been used in project" means the service is off, while "Permission denied" means your identity lacks a role. Enabling an API grants no access, and a role does not turn on an API. You often need both.',
    ],
    keyApis: ['gcloud auth login', 'gcloud config set project', 'gcloud billing projects link', 'gcloud services enable', 'gcloud run deploy'],
    useCases: ['Your first hour on Google Cloud', 'Reading a 403 correctly', 'New project setup scripts'],
    snippet: { lang: 'bash', name: 'first-deploy.sh', code: `# 1. Sign in (two different logins: see the ADC page)
gcloud auth login

# 2. Create and select a project. The ID is your choice and global.
gcloud projects create my-first-lab-20261031
gcloud config set project my-first-lab-20261031

# 3. Link billing. Find the account ID with: gcloud billing accounts list
gcloud billing projects link my-first-lab-20261031 \\
  --billing-account=0X0X0X-0X0X0X-0X0X0X

# 4. Turn on the APIs you need
gcloud services enable run.googleapis.com

# 5. Deploy a sample container to Cloud Run
gcloud run deploy hello \\
  --image=us-docker.pkg.dev/cloudrun/container/hello \\
  --region=us-central1 --allow-unauthenticated` },
    inputs: [
      { name: 'login', label: 'Signed in', type: 'checkbox', default: true },
      { name: 'project', label: 'Project selected', type: 'checkbox', default: true },
      { name: 'billing', label: 'Billing linked', type: 'checkbox', default: true },
      { name: 'api', label: 'API enabled', type: 'checkbox', default: true },
      { name: 'iam', label: 'IAM role granted', type: 'checkbox', default: true },
    ],
    flow: [['dev', 'iam', 'who are you? what may you do?'], ['dev', 'billing', 'is billing linked?'], ['dev', 'api', 'is the Cloud Run API on?'], ['api', 'run', 'deploy the revision'], ['run', 'dev', 'https://hello-…run.app']],
    actions: [
      { id: 'run', label: 'Deploy', tone: 'accent', run: (i) => firstProject(i) },
      { id: 'noapi', label: 'Do it wrong: forget to enable the API', tone: 'ghost', run: (i) => firstProject({ ...i, login: true, project: true, billing: true, iam: true, api: true }, { skip: 'api' }), flow: () => [['dev', 'api', 'POST to run.googleapis.com'], ['api', 'dev', '403 API not enabled']] },
      { id: 'nobilling', label: 'Do it wrong: no billing account', tone: 'ghost', run: (i) => firstProject({ ...i, login: true, project: true, billing: true, iam: true, api: true }, { skip: 'billing' }), flow: () => [['dev', 'api', 'services enable'], ['api', 'billing', 'billing account?'], ['billing', 'dev', 'FAILED_PRECONDITION']] },
    ],
    pitfalls: [
      { mistake: 'Forgetting to enable the API', symptom: FIRST_PROJECT_ERRORS.api, why: 'Most APIs are off by default in every project. This is one of the most reported Google Cloud 403s.', fix: 'Run gcloud services enable SERVICE.googleapis.com in the project named in the error, then wait a minute or two.', avoid: 'Enable APIs in your setup script or with the google_project_service Terraform resource.', reproduce: 'noapi', lang: 'bash', rightCode: 'gcloud services enable run.googleapis.com artifactregistry.googleapis.com', source: doc('apis/docs/getting-started', 'Getting started with Google Cloud APIs') },
      { mistake: 'A project with no billing account', symptom: FIRST_PROJECT_ERRORS.billing, why: 'Many services need a billing account even if your use stays in the free tier.', fix: 'Link a billing account with gcloud billing projects link.', avoid: 'Use a billing account with the free trial credit, and add a budget right away.', reproduce: 'nobilling', source: doc('billing/docs/how-to/modify-project', 'Enable, disable or change billing for a project') },
      { mistake: 'Looking in the wrong project', symptom: 'The console or gcloud shows nothing, or NOT_FOUND, for a resource you know exists.', why: 'gcloud and the console each remember their own current project, and client libraries read another setting.', fix: 'Run gcloud config list and check the project selector at the top of the console.', avoid: 'Use named gcloud configurations (gcloud config configurations create) for each project.', source: doc('sdk/docs/configurations', 'Managing gcloud CLI configurations') },
    ],
    visual: 'gates',
    test: { action: 'run' },
  },
  {
    id: 'resource-hierarchy',
    category: CATEGORY,
    title: 'Organization, folders, projects, resources',
    tagline: 'Permissions flow downhill and cannot be taken away lower down',
    description: [
      'Resources belong to projects, projects can sit in folders, and folders sit under an organization. Every node has exactly one parent. Organizations come with Google Workspace or Cloud Identity; a free trial project can start with no organization and move under one later.',
      'Pick where to grant roles/editor and watch which boxes light up. A grant applies to the node and everything under it. Grant on the organization and production lights up too.',
      'The effective policy on a resource combines what is set on it and on all its ancestors. A project cannot remove an allow that it inherited from a folder. To block something inherited you need a deny policy or a guardrail. Keep production and development in separate projects so a mistake in one cannot touch the other.',
    ],
    keyApis: ['roles/editor', 'gcloud projects add-iam-policy-binding', 'gcloud resource-manager folders create', 'gcloud projects get-ancestors'],
    useCases: ['Separating prod from dev', 'Team-level access', 'Org-wide policy'],
    snippet: { lang: 'bash', name: 'hierarchy.sh', code: `# See where a project sits
gcloud projects get-ancestors shop-dev

# Give a team access to everything in the Development folder
gcloud resource-manager folders add-iam-policy-binding 123456789 \\
  --member=group:dev-team@example.com --role=roles/viewer

# Grant the narrowest role on the narrowest resource that works
gcloud storage buckets add-iam-policy-binding gs://test-data \\
  --member=user:new-dev@example.com --role=roles/storage.objectAdmin` },
    inputs: [{ name: 'scope', label: 'Grant roles/editor on', type: 'select', default: 'shop-dev (project)', options: ['shop-dev (project)', 'Development (folder)', 'example.com (organization)', 'test-data (bucket)'] }],
    flow: [['dev', 'iam', 'add policy binding'], ['iam', 'iam', 'inherit to every descendant'], ['iam', 'gcs', 'bucket allows the role']],
    actions: [
      { id: 'run', label: 'Apply the grant', tone: 'accent', run: (i) => hierarchy(i) },
      { id: 'org', label: 'Do it wrong: grant on the organization', tone: 'ghost', run: (i) => hierarchy(i, { scope: 'example.com (organization)' }) },
    ],
    pitfalls: [
      { mistake: 'Granting a broad role high in the tree', symptom: 'A new developer can edit production databases and nobody knows why: the project’s own policy looks clean.', why: 'The grant was inherited from the organization or a folder, so it does not appear as a direct binding at project level.', fix: 'Remove the ancestor binding and grant a predefined role on the project or resource.', avoid: 'Use the Policy Analyzer, and grant to groups, at the lowest level that works.', reproduce: 'org', source: doc('resource-manager/docs/cloud-platform-resource-hierarchy', 'Resource hierarchy') },
      { mistake: 'One project for everything', symptom: 'A test script deletes a production bucket; one team’s quota use starves another’s; the bill cannot be split.', why: 'The project is the boundary for IAM, quotas, APIs and billing.', fix: 'Split into one project per environment and per application, and move resources across.', avoid: 'Create a project per app and environment from day one.', source: doc('docs/enterprise/best-practices-for-enterprise-organizations', 'Best practices for enterprise organizations') },
      { mistake: 'Confusing project name, ID and number', symptom: 'A command says the project was not found, using a value copied from the console’s display name.', why: 'The display name can change. The ID is what commands use, and you choose it at creation. The number is assigned and read-only.', fix: 'Run gcloud projects list and use the PROJECT_ID column.', avoid: 'Choose IDs carefully, because they appear in URLs and resource names.', source: doc('resource-manager/docs/creating-managing-projects', 'Creating and managing projects') },
    ],
    visual: 'hierarchy',
    test: { action: 'run' },
  },
  {
    id: 'iam-evaluator',
    category: CATEGORY,
    title: 'IAM: who can do what',
    tagline: 'A principal, a role, a resource, and deny always checked first',
    description: [
      'An IAM binding says: this principal (user, group or service account) holds this role on this resource. A role is a bag of permissions like storage.objects.get. Nobody is granted a permission directly.',
      'Choose a role and a permission. The matrix shows what each role contains, and the trace shows the evaluation: deny policies first, then allow policies, and anything not allowed is refused. Turn on the deny rule and even roles/owner cannot delete objects.',
      'Prefer predefined roles over the basic roles. roles/viewer, roles/editor and roles/owner are very broad, holding far more than any app needs. Changes take effect eventually too: typically 2 minutes, possibly 7 or longer, and group membership can take much longer. The matrix lists only five sample permissions.',
    ],
    keyApis: ['roles/storage.objectViewer', 'gcloud projects get-iam-policy', 'testIamPermissions', 'IAM deny policies', 'Policy Troubleshooter'],
    useCases: ['Least privilege for apps', 'Debugging PERMISSION_DENIED', 'Blocking destructive actions org-wide'],
    snippet: { lang: 'bash', name: 'iam.sh', code: `# Grant a narrow role on one resource
gcloud storage buckets add-iam-policy-binding gs://invoices \\
  --member=serviceAccount:app@my-lab.iam.gserviceaccount.com \\
  --role=roles/storage.objectViewer

# Which roles hold this permission?
gcloud iam roles list --filter="includedPermissions:storage.objects.get"

# Why was this denied?
gcloud policy-troubleshoot iam //storage.googleapis.com/projects/_/buckets/invoices \\
  --principal-email=app@my-lab.iam.gserviceaccount.com \\
  --permission=storage.objects.get` },
    inputs: [
      { name: 'role', label: 'Role', type: 'select', default: 'roles/storage.objectViewer', options: Object.keys(ROLES) },
      { name: 'permission', label: 'Permission', type: 'select', default: 'storage.objects.get', options: PERMISSIONS },
      { name: 'denied', label: 'Deny storage.objects.delete', type: 'checkbox', default: false },
    ],
    flow: [['dev', 'api', 'storage.objects.get'], ['api', 'iam', 'may this principal?'], ['iam', 'iam', 'deny, then allow'], ['iam', 'api', 'decision'], ['api', 'gcs', 'read the object']],
    actions: [
      { id: 'run', label: 'Evaluate', tone: 'accent', run: (i) => iamEvaluator(i) },
      { id: 'editor', label: 'Do it wrong: give the app roles/editor', tone: 'ghost', run: (i) => iamEvaluator(i, { role: 'roles/editor', permission: 'compute.instances.delete' }) },
      { id: 'deny', label: 'Deny beats Owner', run: (i) => iamEvaluator(i, { role: 'roles/owner', permission: 'storage.objects.delete', denied: true }) },
    ],
    pitfalls: [
      { mistake: 'Using basic roles for applications', symptom: 'Nothing fails, which is the problem: a bug or leaked credential can delete VMs, data and more.', why: 'Basic roles predate fine-grained IAM, cover permissions across most services, and are simple to grant.', fix: 'Replace with predefined roles. Use IAM Recommender to see which permissions are really used.', avoid: 'Ban basic roles in code review, and test with a dedicated service account.', reproduce: 'editor', lang: 'bash', wrongCode: '--role=roles/editor', rightCode: '--role=roles/storage.objectViewer', source: doc('iam/docs/using-iam-securely', 'Using IAM securely') },
      { mistake: 'Expecting a new grant to work instantly', symptom: 'PERMISSION_DENIED for a few minutes straight after granting the role.', why: 'IAM is eventually consistent: "Typically 2 minutes, potentially 7 minutes or longer". Group membership can take hours.', fix: 'Wait and retry with backoff.', avoid: 'Add retries to scripts that grant then use, and grant before deployments rather than during them.', source: doc('iam/docs/access-change-propagation', 'Access change propagation') },
      { mistake: 'Granting at the wrong level', symptom: "Permission 'storage.objects.get' denied, although the role was granted on a different project.", why: 'Roles apply to the resource where they are bound and its descendants, and a service account in project A has no rights in project B unless granted there.', fix: 'Grant in the project or on the resource that holds the data.', avoid: 'Use the Policy Troubleshooter when a denial makes no sense.', source: doc('policy-intelligence/docs/troubleshoot-access', 'Troubleshoot IAM permissions') },
    ],
    visual: 'iamMatrix',
    test: { action: 'run' },
  },
  {
    id: 'adc',
    category: CATEGORY,
    title: 'Application Default Credentials',
    tagline: 'One line of code that finds the right credential wherever it runs',
    description: [
      'Client libraries ask ADC for a credential, so the same code runs on your laptop and in production with no key in it. ADC tries three places in order: the GOOGLE_APPLICATION_CREDENTIALS variable, the file made by gcloud auth application-default login, then the metadata server (the service account attached to your VM, Cloud Run service or Pod).',
      'Toggle what exists in the environment and watch the search walk down the list. The first source present wins.',
      'gcloud has two separate logins. gcloud auth login is for the gcloud command itself. gcloud auth application-default login is for your code. Doing only the first is the classic reason local code cannot find credentials even though gcloud works fine.',
    ],
    keyApis: ['google.auth.default()', 'GOOGLE_APPLICATION_CREDENTIALS', 'gcloud auth application-default login', 'metadata.google.internal'],
    useCases: ['Local development', 'Same code in every environment', 'Keeping keys out of code'],
    snippet: { lang: 'python', name: 'adc.py', code: `# On your laptop, once:
#   gcloud auth application-default login
#   gcloud auth application-default set-quota-project my-lab
from google.cloud import storage

# No key, no path: ADC finds the credential.
client = storage.Client()
for blob in client.list_blobs("my-lab-data", max_results=5):
    print(blob.name)` },
    inputs: [
      { name: 'envVar', label: 'GOOGLE_APPLICATION_CREDENTIALS set', type: 'checkbox', default: false },
      { name: 'gcloudFile', label: 'application-default login was run', type: 'checkbox', default: true },
      { name: 'metadata', label: 'Running on Google Cloud', type: 'checkbox', default: false },
    ],
    flow: [['dev', 'dev', 'storage.Client()'], ['dev', 'iam', 'exchange credential for a token'], ['iam', 'dev', 'short-lived access token'], ['dev', 'gcs', 'list objects with the token']],
    actions: [
      { id: 'run', label: 'Find credentials', tone: 'accent', run: (i) => adc(i) },
      { id: 'none', label: 'Do it wrong: only gcloud auth login', tone: 'ghost', run: (i) => adc(i, { scenario: { envVar: false, envFileExists: true, gcloudFile: false, metadata: false } }) },
      { id: 'stale', label: 'Do it wrong: stale env var', tone: 'ghost', run: (i) => adc(i, { scenario: { envVar: true, envFileExists: false, gcloudFile: true, metadata: true } }) },
    ],
    pitfalls: [
      { mistake: 'Running only gcloud auth login', symptom: ADC_NOT_FOUND, why: 'That login is for the gcloud tool. Client libraries read a different file.', fix: 'Run gcloud auth application-default login.', avoid: 'Add it to your project’s setup instructions, next to gcloud auth login.', reproduce: 'none', source: doc('docs/authentication/provide-credentials-adc', 'Set up Application Default Credentials') },
      { mistake: 'A leftover GOOGLE_APPLICATION_CREDENTIALS', symptom: 'google.auth.exceptions.DefaultCredentialsError: File /secrets/old-key.json was not found.', why: 'The variable has top priority. ADC does not fall through to the next source if it is broken.', fix: 'unset GOOGLE_APPLICATION_CREDENTIALS, and check your shell profile.', avoid: 'Do not set this variable at all unless you must.', reproduce: 'stale', source: doc('docs/authentication/application-default-credentials', 'How ADC works') },
      { mistake: 'No quota project with user credentials', symptom: 'Errors about user credentials not being supported by this API, or the API not being enabled, in a project you never chose.', why: 'Some APIs bill quota to a project you name, and your user login names none.', fix: 'gcloud auth application-default set-quota-project YOUR_PROJECT', avoid: 'Set it right after the ADC login. You need the serviceusage.services.use permission on that project.', source: doc('docs/authentication/troubleshoot-adc', 'Troubleshoot your ADC setup') },
    ],
    visual: 'adc',
    test: { action: 'run' },
  },
  {
    id: 'service-accounts',
    category: CATEGORY,
    title: 'Service accounts without keys',
    tagline: 'Workloads have identities too, and they should not need a key file',
    description: [
      'A service account is an identity for software. Its email looks like app@my-lab.iam.gserviceaccount.com. You grant it roles just like a person, then run your workload as it.',
      'Compare three ways to use one. Attached accounts and federation hand out short-lived tokens, so nothing long-lived exists to steal. A downloaded JSON key is a password that does not expire by default. The bars show how long an attacker keeps access if each one leaks.',
      'Give every app its own service account. Default accounts may automatically hold roles/editor, so never run production as them. For GitHub Actions or another cloud use Workload Identity Federation; in GKE, use Workload Identity Federation for GKE. Organizations created on or after May 3, 2024 block key creation by default.',
    ],
    keyApis: ['gcloud iam service-accounts create', 'Workload Identity Federation', 'roles/iam.serviceAccountTokenCreator', 'constraints/iam.disableServiceAccountKeyCreation'],
    useCases: ['Cloud Run and VM identity', 'GitHub Actions deploys', 'Impersonating for local testing'],
    snippet: { lang: 'yaml', name: '.github/workflows/deploy.yml', code: `# Deploying from GitHub Actions with no stored key
permissions:
  id-token: write
  contents: read
steps:
  - uses: google-github-actions/auth@v2
    with:
      workload_identity_provider: projects/123456789/locations/global/workloadIdentityPools/github/providers/my-repo
      service_account: deployer@my-lab.iam.gserviceaccount.com
  - uses: google-github-actions/setup-gcloud@v2
  - run: gcloud run deploy web --image=$IMAGE --region=us-central1` },
    inputs: [
      { name: 'method', label: 'How the workload authenticates', type: 'select', default: 'Attached service account (on Google Cloud)', options: Object.keys(IDENTITY_METHODS) },
      { name: 'daysToNotice', label: 'Days until a leaked key is noticed', type: 'number', default: 30, min: 1, max: 365 },
    ],
    flow: [['run', 'iam', 'metadata server: token please'], ['iam', 'run', 'short-lived token'], ['run', 'gcs', 'call the API with it']],
    actions: [
      { id: 'run', label: 'Compare', tone: 'accent', run: (i) => serviceAccounts(i) },
      { id: 'key', label: 'Do it wrong: commit a JSON key', tone: 'ghost', run: (i) => serviceAccounts(i, { method: 'Downloaded JSON key' }), flow: () => [['dev', 'gh', 'git push key.json'], ['gh', 'internet', 'scraped by bots'], ['internet', 'api', 'mint tokens as your app']] },
    ],
    pitfalls: [
      { mistake: 'Downloading a service account key', symptom: 'A key in a repository or laptop leads to crypto-mining VMs and a large bill, with audit logs that name only the service account.', why: 'Keys are long-lived, and the holder cannot be identified. Google warns: "We recommend that you avoid using service account keys whenever possible."', fix: 'Delete the key: gcloud iam service-accounts keys delete. Check audit logs. Move to attached accounts or federation.', avoid: 'Enforce the Disable service account key creation policy.', reproduce: 'key', source: doc('iam/docs/best-practices-service-accounts', 'Best practices for service accounts') },
      { mistake: 'Running as the default service account', symptom: 'Your function or VM can modify nearly everything in the project.', why: 'Some default service accounts automatically receive roles/editor.', fix: 'Create a dedicated account per app, with only the roles it uses, and pass it at deploy.', avoid: 'Set constraints/iam.automaticIamGrantsForDefaultServiceAccounts. It stops new grants, but does not remove existing ones.', lang: 'bash', rightCode: 'gcloud run deploy api --service-account=api@my-lab.iam.gserviceaccount.com', source: doc('iam/docs/best-practices-service-accounts', 'Best practices for service accounts') },
      { mistake: 'Using an access token to call a private Cloud Run service', symptom: 'HTTP 401: The request was not authorized to invoke this service', why: 'Cloud Run wants an ID token with the service URL as its audience, not an access token.', fix: 'Send an ID token: gcloud auth print-identity-token, or fetch one from the metadata server.', avoid: 'Use Google’s auth library helpers for service-to-service calls.', source: doc('run/docs/troubleshooting', 'Cloud Run troubleshooting') },
    ],
    visual: 'identity',
    test: { action: 'run' },
  },
  {
    id: 'global-infra',
    category: CATEGORY,
    title: 'Regions and zones',
    tagline: 'Pick where your replicas live, then break something',
    description: [
      'A region is an independent geographic area, like us-central1. It contains zones, like us-central1-a. If a zone goes down, the other zones keep working. Google lists 43 regions, 130 zones and over 200 network edge locations.',
      'Choose a topology, then fail a zone or a whole region. The map shows a sample of real regions, and the tiles show what stays up.',
      'Some resources are global (VPC networks, some load balancers), some are regional (subnets, Cloud Run services), and some are zonal (VMs, zonal disks). Moving data between them costs money and time, so put data and compute together and pick regions close to users and within any data residency rules.',
    ],
    keyApis: ['gcloud compute regions list', 'regional MIG', '--region vs --zone', 'Region Picker'],
    useCases: ['High availability', 'Disaster recovery', 'Data residency'],
    snippet: { lang: 'bash', name: 'regional.sh', code: `# See what is available
gcloud compute regions list
gcloud compute zones list --filter="region:us-central1"

# A regional managed instance group spreads VMs across zones
gcloud compute instance-groups managed create web \\
  --region=us-central1 --size=3 --template=web-template

# A regional Cloud SQL instance has a standby in another zone
gcloud sql instances create orders --database-version=POSTGRES_16 \\
  --region=us-central1 --availability-type=REGIONAL --tier=db-custom-2-7680` },
    inputs: [
      { name: 'topology', label: 'Topology', type: 'select', default: 'Regional (3 zones)', options: ['Regional (3 zones)', 'Single zone', 'Multi-region (2 regions)'] },
      { name: 'failure', label: 'Failure', type: 'select', default: 'Zone us-central1-a fails', options: ['No failure', 'Zone us-central1-a fails', 'Region us-central1 fails'] },
    ],
    flow: [['internet', 'lb', 'one global anycast IP'], ['lb', 'gce', 'nearest healthy backend'], ['gce', 'lb', 'health check fails in the dead zone'], ['lb', 'gce', 'traffic shifts']],
    actions: [
      { id: 'run', label: 'Simulate', tone: 'accent', run: (i) => globalInfra(i) },
      { id: 'single', label: 'Do it wrong: everything in one zone', tone: 'ghost', run: (i) => globalInfra(i, { topology: 'Single zone', failure: 'Zone us-central1-a fails' }) },
    ],
    pitfalls: [
      { mistake: 'Running everything in one zone', symptom: 'A zone outage takes the entire application down.', why: '"Hosting everything in one zone" leaves you with no second place to go.', fix: 'Use regional managed instance groups, regional GKE clusters, and regional Cloud SQL.', avoid: 'Start regional for anything users depend on.', reproduce: 'single', source: doc('compute/docs/regions-zones', 'Regions and zones') },
      { mistake: 'Compute and data in different regions', symptom: 'Slow requests and a line for network data transfer on the bill.', why: 'Every call crosses a region boundary and inter-region traffic is billed.', fix: 'Move one to sit with the other.', avoid: 'Keep a single region constant in your IaC variables.', source: doc('docs/geography-and-regions', 'Geography and regions') },
      { mistake: 'Assuming every product exists in every region', symptom: 'A deploy fails with a location-not-supported error, or a region is missing from a service’s list.', why: 'Products and machine types launch region by region.', fix: 'Check the product’s locations page, or use a nearby region.', avoid: 'Check availability of everything you need before standardising on a region.', source: doc('docs/geography-and-regions', 'Geography and regions') },
    ],
    visual: 'worldMap',
    test: { action: 'run' },
  },
  {
    id: 'billing-budgets',
    category: CATEGORY,
    title: 'Budgets do not stop spending',
    tagline: 'A budget is an email. Build the off switch yourself',
    description: [
      'New accounts get $300 of credit for 90 days, and an always-free tier: for example 2 million Cloud Run requests, 1 TiB of BigQuery queries and an e2-micro VM each month, with limits. Billing accounts pay for projects, and a budget watches spending.',
      'The chart plays a month where something runs away on a chosen day. Google is direct about it: "Setting an alerts-only budget doesn\'t automatically cap Google Cloud or Google Maps Platform usage or spending." Turn on the kill switch to route the alert through Pub/Sub to a function that disables billing.',
      'Alerts arrive late, as cost data can take hours to appear, so spending overshoots either way. Disabling billing is drastic: services stop. Newer spend cap budgets can enforce a limit, but only for one project and one eligible service, such as the Gemini API. Default alert thresholds are 50%, 90% and 100%.',
    ],
    keyApis: ['gcloud billing budgets create', 'alertThresholdExceeded', 'spend cap budgets', 'updateBillingInfo'],
    useCases: ['Protecting a personal account', 'Team cost alerts', 'Cost anomaly response'],
    snippet: { lang: 'python', name: 'kill_switch.py', code: `# A function subscribed to the budget's Pub/Sub topic.
# Warning: this stops every service in the project.
import base64, json
from googleapiclient import discovery

def stop_billing(event, context):
    msg = json.loads(base64.b64decode(event["data"]))
    if msg["costAmount"] <= msg["budgetAmount"]:
        return
    billing = discovery.build("cloudbilling", "v1")
    billing.projects().updateBillingInfo(
        name="projects/my-lab",
        body={"billingAccountName": ""},
    ).execute()` },
    inputs: [
      { name: 'budget', label: 'Budget ($)', type: 'number', default: 100, min: 10, max: 5000 },
      { name: 'daily', label: 'Normal spend ($/day)', type: 'number', default: 2, min: 0, max: 500 },
      { name: 'runawayDay', label: 'Runaway starts on day', type: 'number', default: 12, min: 1, max: 28 },
      { name: 'runawayDaily', label: 'Runaway spend ($/day)', type: 'number', default: 150, min: 0, max: 2000 },
      { name: 'killSwitch', label: 'Automated kill switch', type: 'checkbox', default: true },
    ],
    flow: [['billing', 'pubsub', 'threshold crossed'], ['pubsub', 'fn', 'deliver the alert'], ['fn', 'billing', 'disable billing'], ['billing', 'run', 'services stop']],
    actions: [
      { id: 'run', label: 'Play the month', tone: 'accent', run: (i) => budgets(i) },
      { id: 'alerts', label: 'Do it wrong: rely on the budget alone', tone: 'ghost', run: (i) => budgets(i, { killSwitch: false }), flow: () => [['billing', 'dev', 'email: 100% of budget'], ['run', 'billing', 'and the charges keep coming']] },
    ],
    pitfalls: [
      { mistake: 'Thinking a budget is a limit', symptom: 'A $20 budget, a large bill, and three alert emails.', why: 'An alerts-only budget does not cap usage or spending.', fix: 'Stop or delete the runaway resource, then contact billing support about the charges.', avoid: 'Set budgets low, send them to Pub/Sub, set per-service quotas, and use spend cap budgets where a service supports them.', reproduce: 'alerts', source: doc('billing/docs/how-to/budgets', 'Create, edit, or delete budgets') },
      { mistake: 'Leaving resources running after a tutorial', symptom: 'A monthly charge for an idle load balancer, disk, static IP or Cloud SQL instance.', why: 'Stopped VMs still pay for disks and reserved IPs, and many services bill by the hour whether used or not.', fix: 'Delete the whole tutorial project: gcloud projects delete PROJECT_ID.', avoid: 'Use a throwaway project for each experiment.', source: doc('resource-manager/docs/creating-managing-projects', 'Creating and managing projects') },
      { mistake: 'Publishing an unrestricted API key', symptom: 'Sudden AI or Maps API charges from requests you did not make.', why: 'API keys carry no user identity. Anyone who finds one can spend your quota.', fix: 'Rotate the key, then restrict it to specific APIs and referrers.', avoid: 'Never ship keys in client code unless restricted; set per-minute quotas.', source: doc('docs/authentication/api-keys-best-practices', 'Best practices for managing API keys') },
    ],
    visual: 'budget',
    test: { action: 'run' },
  },
];
