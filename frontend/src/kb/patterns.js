// Reference architectures shown on the Blueprints page. Nodes use a 640-wide box (see Graph in visuals/kit.jsx).
const row = (y, ...items) => items.map(([id, label, sub, x, tone]) => ({ id, label, sub, x, y, tone }));

export const PATTERNS = [
  {
    id: 'web',
    title: 'A web app or API',
    when: 'The starting point for most products.',
    nodes: [
      ...row(40, ['user', 'Users', 'browser, mobile', 70], ['lb', 'Load Balancer', 'Armor + CDN', 240, 'accent'], ['run', 'Cloud Run', 'stateless API', 420, 'ok'], ['sql', 'Cloud SQL', 'PostgreSQL', 570, 'store']),
      ...row(160, ['gcs', 'Cloud Storage', 'static assets', 240, 'store'], ['secret', 'Secret Manager', 'DB password', 420, 'warn'], ['logs', 'Observability', 'logs, SLO alerts', 570]),
    ],
    edges: [
      { from: 'user', to: 'lb', animated: true, tone: 'accent' }, { from: 'lb', to: 'run', animated: true, tone: 'accent' }, { from: 'run', to: 'sql', animated: true, tone: 'store', label: 'pool' },
      { from: 'lb', to: 'gcs', dashed: true }, { from: 'run', to: 'secret', dashed: true }, { from: 'run', to: 'logs', dashed: true },
    ],
    steps: ['A single global IP accepts the request, and Cloud Armor filters it.', 'Cloud CDN and a backend bucket answer static requests.', 'Cloud Run handles the rest and scales with traffic. Set max instances to fit the database.', 'Each service runs as its own service account, with a role for only what it needs.'],
    services: ['Cloud Load Balancing', 'Google Cloud Armor', 'Cloud CDN', 'Cloud Run', 'Cloud SQL', 'Cloud Storage', 'Secret Manager'],
    pages: ['load-balancing', 'cloud-run-scaling', 'cloud-sql-connections', 'secret-manager'],
    avoid: 'Leaving the default run.app URL open bypasses your edge security.',
  },
  {
    id: 'events',
    title: 'Event-driven processing',
    when: 'React to uploads and messages, without blocking users.',
    nodes: [
      ...row(40, ['user', 'Client', 'signed URL upload', 70], ['gcs', 'Cloud Storage', 'uploads bucket', 240, 'store'], ['ps', 'Pub/Sub', 'via Eventarc', 420, 'accent'], ['fn', 'Cloud Run function', 'idempotent', 570, 'ok']),
      ...row(160, ['dlq', 'Dead-letter topic', 'failed events', 420, 'bad'], ['out', 'Output bucket', 'never the input!', 570, 'store'], ['fs', 'Firestore', 'status + event IDs', 240, 'store']),
    ],
    edges: [
      { from: 'user', to: 'gcs', animated: true, tone: 'accent' }, { from: 'gcs', to: 'ps', animated: true, tone: 'accent' }, { from: 'ps', to: 'fn', animated: true, tone: 'accent' },
      { from: 'fn', to: 'out', animated: true, tone: 'store' }, { from: 'ps', to: 'dlq', dashed: true, tone: 'bad' }, { from: 'fn', to: 'fs', dashed: true },
    ],
    steps: ['Clients upload directly with a signed URL, so your app doesn’t carry the bytes.', 'A finalized object fires an event through Eventarc.', 'The function checks the event ID first, because delivery is at least once.', 'Failures retry with backoff, then go to a dead-letter topic.'],
    services: ['Cloud Storage', 'Eventarc', 'Pub/Sub', 'Cloud Run functions', 'Firestore'],
    pages: ['storage-access', 'functions-events', 'pubsub'],
    avoid: 'Writing output back to the input bucket creates an infinite, expensive loop.',
  },
  {
    id: 'analytics',
    title: 'A data platform',
    when: 'Bring operational data together for reporting.',
    nodes: [
      ...row(40, ['app', 'Cloud SQL', 'operational data', 70, 'store'], ['ds', 'Datastream', 'change capture', 240, 'accent'], ['bq', 'BigQuery', 'warehouse', 420, 'ok'], ['look', 'Looker', 'dashboards', 570]),
      ...row(160, ['events', 'Pub/Sub', 'app events', 70, 'accent'], ['df', 'Dataflow', 'streaming', 240, 'accent'], ['dform', 'Dataform', 'SQL models', 420, 'ok'], ['cat', 'Knowledge Catalog', 'metadata', 570]),
    ],
    edges: [
      { from: 'app', to: 'ds', animated: true, tone: 'accent' }, { from: 'ds', to: 'bq', animated: true, tone: 'accent' }, { from: 'bq', to: 'look', animated: true, tone: 'ok' },
      { from: 'events', to: 'df', animated: true, tone: 'accent' }, { from: 'df', to: 'bq', animated: true, tone: 'accent' }, { from: 'dform', to: 'bq', dashed: true }, { from: 'bq', to: 'cat', dashed: true },
    ],
    steps: ['Datastream copies database changes without loading the source.', 'Dataflow handles streaming events using event-time windows.', 'Dataform turns raw tables into tested models.', 'Looker reads the curated tables.'],
    services: ['Datastream', 'Pub/Sub', 'Dataflow', 'BigQuery', 'Dataform', 'Looker', 'Knowledge Catalog'],
    pages: ['data-tool-chooser', 'bigquery-scan', 'dataflow-windows'],
    avoid: 'Partition and cluster tables from day one. Retrofitting them means rewriting data.',
  },
  {
    id: 'rag',
    title: 'A grounded AI assistant',
    when: 'Answer questions from your own documents, with citations.',
    nodes: [
      ...row(40, ['user', 'Users', 'chat UI', 70], ['run', 'Cloud Run', 'your backend', 240, 'ok'], ['model', 'Gemini model', 'Agent Platform', 420, 'accent'], ['mon', 'Monitoring', 'tokens, 429s', 570]),
      ...row(160, ['docs', 'Cloud Storage', 'source documents', 70, 'store'], ['embed', 'Ingest job', 'chunk + embed', 240, 'warn'], ['vec', 'Vector store', 'AlloyDB or Vector Search', 420, 'store']),
    ],
    edges: [
      { from: 'user', to: 'run', animated: true, tone: 'accent' }, { from: 'run', to: 'model', animated: true, tone: 'accent' }, { from: 'model', to: 'mon', dashed: true },
      { from: 'docs', to: 'embed', animated: true, tone: 'store' }, { from: 'embed', to: 'vec', animated: true, tone: 'store' }, { from: 'run', to: 'vec', animated: true, tone: 'ok', label: 'search' },
    ],
    steps: ['A job chunks documents and stores embeddings.', 'The backend embeds the question and finds the nearest passages.', 'The model answers from those passages and cites them.', 'The backend uses IAM and retries 429s with backoff, so no key reaches the browser.'],
    services: ['Gemini Enterprise Agent Platform', 'RAG Engine', 'Cloud Run', 'AlloyDB for PostgreSQL', 'Cloud Storage'],
    pages: ['ai-chooser', 'rag', 'ai-quotas'],
    avoid: 'Calling the model from the browser with an API key lets anyone spend your money.',
  },
  {
    id: 'landing',
    title: 'A safe organization layout',
    when: 'Set up before a team starts building.',
    nodes: [
      ...row(30, ['org', 'Organization', 'org policies', 320, 'accent']),
      ...row(110, ['prod', 'Production folder', 'strict', 150, 'bad'], ['nonprod', 'Non-prod folder', 'relaxed', 320, 'warn'], ['shared', 'Shared folder', 'network, logging', 490, 'store']),
      ...row(190, ['p1', 'shop-prod', 'project', 150], ['p2', 'shop-dev', 'project', 320], ['p3', 'shared-vpc', 'host project', 490, 'store']),
    ],
    edges: [
      { from: 'org', to: 'prod', animated: true, tone: 'accent' }, { from: 'org', to: 'nonprod', animated: true, tone: 'accent' }, { from: 'org', to: 'shared', animated: true, tone: 'accent' },
      { from: 'prod', to: 'p1' }, { from: 'nonprod', to: 'p2' }, { from: 'shared', to: 'p3' }, { from: 'p3', to: 'p1', dashed: true, tone: 'store' },
    ],
    steps: ['Policies set at the top apply everywhere: no keys, no default networks, allowed regions.', 'Folders separate environments, and access follows groups.', 'A shared VPC host project gives teams networking without letting them change it.', 'A log sink at the organization keeps audit logs safe from project admins.'],
    services: ['Resource Manager', 'Organization Policy Service', 'Cloud Identity', 'Virtual Private Cloud (VPC)', 'Cloud Logging'],
    pages: ['resource-hierarchy', 'guardrails', 'iam-evaluator'],
    avoid: 'Do not grant broad roles at the organization or to individual users. Grant to groups, as low as possible.',
  },
];

/** A suggested order for working through the lab. */
export const LEARNING_PATH = [
  { title: 'Week 1: get oriented', text: 'A project, permissions and your first service.', pages: ['first-project', 'resource-hierarchy', 'iam-evaluator', 'adc', 'billing-budgets'] },
  { title: 'Week 2: run something real', text: 'Containers, storage and a database.', pages: ['compute-chooser', 'cloud-run-contract', 'cloud-run-scaling', 'storage-classes', 'database-chooser', 'cloud-sql-connections'] },
  { title: 'Week 3: connect and secure it', text: 'Networks, identities and secrets.', pages: ['vpc-peering', 'firewall', 'load-balancing', 'service-accounts', 'secret-manager'] },
  { title: 'Week 4: operate it', text: 'Deployments, logs, alerts and events.', pages: ['ci-cd', 'terraform-state', 'logging', 'slo-alerts', 'functions-events', 'pubsub'] },
  { title: 'Then: go deeper', text: 'Data, AI and scale, as your project needs them.', pages: ['bigquery-scan', 'dataflow-windows', 'ai-chooser', 'rag', 'key-hotspots', 'gke'] },
];
