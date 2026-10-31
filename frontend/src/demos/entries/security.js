import { guardrails, SECRET_START_ERROR, secretManager } from '../../lab/security.js';
import { doc } from '../../lab/lab.js';

const CATEGORY = 'Security and governance';

export default [
  {
    id: 'secret-manager',
    category: CATEGORY,
    title: 'Secret Manager: versions and rollouts',
    tagline: 'A secret is versioned config, so roll it out like config',
    description: [
      'Secret Manager stores API keys and passwords, encrypted, versioned and access-controlled. Never put secrets in code, images or a repository. A secret has versions, each enabled, disabled or destroyed.',
      'Mount a secret into Cloud Run, then rotate in a bad value. With latest, instances started after the rotation read the bad value while older ones keep working: a confusing partial outage. Google’s advice: "Reference secrets by their version number rather than using the latest alias."',
      'Environment-variable secrets are read when an instance starts, so a change reaches only new instances. Google also recommends calling the API directly where you can, to limit exposure through debug endpoints and logs. Disable a version before you destroy it, because disabling is reversible. Default to automatic replication.',
    ],
    keyApis: ['gcloud secrets create', 'gcloud secrets versions add', '--set-secrets', 'roles/secretmanager.secretAccessor', 'versions disable'],
    useCases: ['Database passwords', 'Third-party API keys', 'Rotation'],
    snippet: { lang: 'bash', name: 'secrets.sh', code: `printf 'value-from-your-vault' | gcloud secrets create db-password --data-file=-

# Grant on the one secret, to the one account
gcloud secrets add-iam-policy-binding db-password \\
  --member=serviceAccount:api@my-lab.iam.gserviceaccount.com \\
  --role=roles/secretmanager.secretAccessor

# Pin the version
gcloud run deploy api --set-secrets=DB_PASSWORD=db-password:3

# A bad rotation? Disable it: reversible, unlike destroy
gcloud secrets versions disable 4 --secret=db-password` },
    inputs: [
      { name: 'ref', label: 'Reference', type: 'select', default: 'Pinned version (:3)', options: ['Pinned version (:3)', 'latest'] },
      { name: 'badRotation', label: 'A bad value was rotated in', type: 'checkbox', default: true },
      { name: 'roleGranted', label: 'Secret Accessor granted', type: 'checkbox', default: true },
    ],
    flow: [['dev', 'secret', 'add version 4'], ['run', 'iam', 'may I access it?'], ['run', 'secret', 'read at instance start'], ['run', 'sql', 'log in']],
    actions: [
      { id: 'run', label: 'Roll out', tone: 'accent', run: (i) => secretManager(i) },
      { id: 'latest', label: 'Do it wrong: reference latest', tone: 'ghost', run: (i) => secretManager(i, { ref: 'latest', badRotation: true, roleGranted: true }) },
      { id: 'norole', label: 'Do it wrong: no Secret Accessor', tone: 'ghost', run: (i) => secretManager(i, { roleGranted: false }) },
    ],
    pitfalls: [
      { mistake: 'Using latest in production', symptom: 'FATAL: password authentication failed for user "app", from some instances, but only the newest.', why: 'latest changes without a deploy, so there is no review, no canary and nothing to roll back.', fix: 'Disable the bad version, then pin the good one.', avoid: 'Pin versions, and roll out new ones through your deploy pipeline.', reproduce: 'latest', lang: 'bash', wrongCode: '--set-secrets=DB_PASSWORD=db-password:latest', rightCode: '--set-secrets=DB_PASSWORD=db-password:3', source: doc('secret-manager/docs/best-practices', 'Secret Manager best practices') },
      { mistake: 'The runtime account cannot read the secret', symptom: SECRET_START_ERROR, why: 'The instance cannot start, often because it cannot read a Secret Manager secret.', fix: 'Grant roles/secretmanager.secretAccessor to the runtime service account, and verify the secret path.', avoid: 'Grant on the single secret rather than the project.', reproduce: 'norole', source: doc('run/docs/troubleshooting', 'Cloud Run troubleshooting') },
      { mistake: 'Destroying a version to test if it is in use', symptom: 'An outage you may not be able to undo.', why: 'Destroying is not the reversible option.', fix: 'Restore from wherever else the value is held, or rotate.', avoid: 'Disable it first: this is reversible, and shows what still depends on it.', source: doc('secret-manager/docs/best-practices', 'Secret Manager best practices') },
    ],
    visual: 'secrets',
    test: { action: 'run' },
  },
  {
    id: 'guardrails',
    category: CATEGORY,
    title: 'Guardrails above IAM',
    tagline: 'Owner is not all-powerful: Organization Policy, deny rules and perimeters',
    description: [
      'IAM answers "who can do what". Other layers answer different questions, and they can refuse even an Owner. Organization Policy restricts which configurations are allowed, such as no service account keys or no external IPs. IAM deny blocks chosen permissions. VPC Service Controls draws a perimeter around services to stop data leaving.',
      'Pick an action and switch guardrails on. The request walks the layers, and the error tells you which one refused. The order shown is simplified for teaching and is not a published contract, but the error text is how you tell the layers apart.',
      'New organizations (from May 3, 2024) enforce some policies by default, which is why a tutorial’s key creation may fail for you. Use dry-run mode for perimeters, and test a policy on one folder first. A good supporting cast: Security Command Center for findings, Cloud Audit Logs for who did what, Cloud KMS for your own encryption keys.',
    ],
    keyApis: ['Organization Policy Service', 'constraints/iam.disableServiceAccountKeyCreation', 'VPC Service Controls', 'Access Context Manager', 'deny policies'],
    useCases: ['Stopping data exfiltration', 'Company-wide rules', 'Regulated workloads'],
    snippet: { lang: 'yaml', name: 'policy.yaml', code: `# gcloud org-policies set-policy policy.yaml
name: organizations/123456789/policies/iam.disableServiceAccountKeyCreation
spec:
  rules:
    - enforce: true

# Another useful one: restrict where resources can be created
# name: organizations/123456789/policies/gcp.resourceLocations
# spec:
#   rules:
#     - values:
#         allowedValues: [in:eu-locations]` },
    inputs: [
      { name: 'action', label: 'Action', type: 'select', default: 'Read a bucket from outside the perimeter', options: ['Read a bucket from outside the perimeter', 'Create a service account key', 'Delete a production bucket'] },
      { name: 'iam', label: 'Caller holds Owner', type: 'checkbox', default: true },
      { name: 'perimeter', label: 'VPC Service Controls perimeter', type: 'checkbox', default: false },
      { name: 'orgPolicy', label: 'Organization Policy', type: 'checkbox', default: false },
      { name: 'denyPolicy', label: 'IAM deny rule', type: 'checkbox', default: false },
    ],
    flow: [['dev', 'api', 'API request'], ['api', 'iam', 'guardrails, then IAM'], ['iam', 'api', 'allowed or refused'], ['api', 'gcs', 'do the work']],
    actions: [
      { id: 'run', label: 'Attempt it', tone: 'accent', run: (i) => guardrails(i) },
      { id: 'perimeter', label: 'Do it wrong: Owner, outside the perimeter', tone: 'ghost', run: (i) => guardrails({ ...i, iam: true }, { action: 'Read a bucket from outside the perimeter', perimeter: true }) },
      { id: 'orgkey', label: 'Do it wrong: create a key under the policy', tone: 'ghost', run: (i) => guardrails({ ...i, iam: true }, { action: 'Create a service account key', orgPolicy: true }) },
    ],
    pitfalls: [
      { mistake: 'Granting more IAM to fix a VPC Service Controls denial', symptom: 'AccessDeniedException: 403 Request violates VPC Service Controls.', why: 'IAM isn’t the layer refusing. The audit log says "Request is prohibited by organization\'s policy" and gives a violationReason.', fix: 'Read the violationReason, then add an ingress or egress rule.', avoid: 'Roll out perimeters in dry-run mode first.', reproduce: 'perimeter', source: doc('vpc-service-controls/docs/troubleshooting', 'Troubleshoot VPC Service Controls') },
      { mistake: 'Fighting an organization policy', symptom: 'Key creation is not allowed on this service account.', why: 'The Disable service account key creation constraint is enforced, by default in newer organizations.', fix: 'Do not ask for an exception first: use federation or impersonation instead.', avoid: 'Check effective policies: gcloud org-policies describe.', reproduce: 'orgkey', source: doc('iam/docs/best-practices-service-accounts', 'Best practices for service accounts') },
    ],
    visual: 'guardrails',
    test: { action: 'run' },
  },
];
