import { CONTENTION, NEEDS_INDEX, TOO_MANY, cloudSql, databaseChooser, firestore, keyHotspots, KEY_SCHEMES, storageAccess, storageClasses } from '../../lab/storage.js';
import { doc } from '../../lab/lab.js';

const CATEGORY = 'Storage and databases';

export default [
  {
    id: 'storage-classes',
    category: CATEGORY,
    title: 'Cloud Storage classes',
    tagline: 'Colder is cheaper to keep and dearer to touch',
    description: [
      'Cloud Storage holds objects in buckets. All classes read with low latency and the same API, even Archive, so a class is purely a pricing choice: Standard for hot data, Nearline (30-day minimum), Coldline (90) and Archive (365) for colder data.',
      'Enter how much you store, how long, and how often you read it. The bars add storage, retrieval and early-delete fees. Prices are illustrative US regional figures, so check the pricing page for real planning.',
      'Lifecycle rules can move or delete objects by age, and Autoclass can move objects between classes for you. Deleted objects are kept for 7 days by default as soft delete, which also adds storage charges.',
    ],
    keyApis: ['--default-storage-class', 'lifecycle rules', 'Autoclass', 'SetStorageClass', 'soft delete'],
    useCases: ['Backups', 'Compliance archives', 'Data lakes', 'Static assets'],
    snippet: { lang: 'json', name: 'lifecycle.json', code: `{
  "rule": [
    { "action": { "type": "SetStorageClass", "storageClass": "NEARLINE" },
      "condition": { "age": 30, "matchesStorageClass": ["STANDARD"] } },
    { "action": { "type": "SetStorageClass", "storageClass": "ARCHIVE" },
      "condition": { "age": 365 } },
    { "action": { "type": "Delete" },
      "condition": { "age": 2555 } }
  ]
}` },
    inputs: [
      { name: 'sizeGb', label: 'Size (GB)', type: 'number', default: 1000, min: 1, max: 1000000 },
      { name: 'days', label: 'Kept for (days)', type: 'number', default: 180, min: 1, max: 3650 },
      { name: 'reads', label: 'Full reads a month', type: 'number', default: 0, min: 0, max: 100 },
    ],
    flow: [['dev', 'gcs', 'gcloud storage cp'], ['gcs', 'gcs', 'lifecycle: age > 30, to Nearline'], ['gcs', 'dev', 'read with low latency, plus a fee']],
    actions: [
      { id: 'run', label: 'Compare classes', tone: 'accent', run: (i) => storageClasses(i) },
      { id: 'wrong', label: 'Do it wrong: Archive for short-lived hot data', tone: 'ghost', run: (i) => storageClasses(i, { days: 30, reads: 4 }) },
    ],
    pitfalls: [
      { mistake: 'Using cold classes for data you read often', symptom: 'The "cheap" bucket costs more than Standard because of retrieval fees.', why: 'Nearline, Coldline and Archive all charge per GB read.', fix: 'Move it to Standard, or enable Autoclass.', avoid: 'Check your access pattern first. When unsure, use Autoclass.', reproduce: 'wrong', source: doc('storage/docs/storage-classes', 'Storage classes') },
      { mistake: 'Deleting before the minimum duration', symptom: 'An early-deletion charge on the bill for objects long gone.', why: 'Deleting early still bills the minimum. An object moved from Nearline to Coldline after 20 days and deleted 60 days later pays for 10 more days.', fix: 'Keep short-lived data in Standard from now on.', avoid: 'Choose by retention as well as read rate.', source: doc('storage/docs/lifecycle', 'Object Lifecycle Management') },
      { mistake: 'Expecting Archive to be slow like a tape', symptom: 'You built a restore workflow you do not need.', why: '"Archive data is available within milliseconds", unlike some other clouds’ archive tiers.', fix: 'Remove the waiting logic.', avoid: 'Do not carry assumptions over from AWS Glacier.', source: doc('storage/docs/storage-classes', 'Storage classes') },
    ],
    visual: 'storageClasses',
    test: { action: 'run' },
  },
  {
    id: 'storage-access',
    category: CATEGORY,
    title: 'Bucket access and signed URLs',
    tagline: 'Use IAM on the bucket, and block the public by default',
    description: [
      'Bucket names are global across every Google Cloud customer. Turn on uniform bucket-level access so IAM alone controls access, not a mix of IAM and per-object ACLs. Public access prevention then stops anyone making data public by accident.',
      'Pick who is asking and how the bucket is set up. The trace shows which check decides. A signed URL lets someone without a Google account read one object for a limited time, up to 7 days for V4 signatures, which suits user downloads.',
      'For uploads from browsers, give out a signed URL and let the browser send directly to Cloud Storage, instead of proxying big files through your app. Browser requests also need a CORS configuration on the bucket.',
    ],
    keyApis: ['--uniform-bucket-level-access', '--public-access-prevention', 'gcloud storage sign-url', 'roles/storage.objectViewer', 'CORS'],
    useCases: ['User downloads', 'Direct browser uploads', 'Static websites behind a CDN'],
    snippet: { lang: 'python', name: 'signed_url.py', code: `from datetime import timedelta
from google.cloud import storage

blob = storage.Client().bucket("acme-invoices").blob("inv-42.pdf")

# On Cloud Run, sign with IAM: no key file needed. The service account
# needs roles/iam.serviceAccountTokenCreator on itself.
url = blob.generate_signed_url(
    version="v4",
    expiration=timedelta(minutes=15),
    method="GET",
    service_account_email=SA_EMAIL,
    access_token=access_token,
)` },
    inputs: [
      { name: 'principal', label: 'Who is asking', type: 'select', default: 'app service account', options: ['app service account', 'teammate (no grant)', 'anonymous internet user'] },
      { name: 'posture', label: 'Bucket setup', type: 'select', default: 'Private, grant on the bucket', options: ['Private, grant on the bucket', 'Public via allUsers', 'Signed URL (time-limited)'] },
      { name: 'pap', label: 'Public access prevention', type: 'checkbox', default: true },
    ],
    flow: [['dev', 'iam', 'may I read this object?'], ['iam', 'gcs', 'check bucket policy'], ['gcs', 'dev', 'object or 403']],
    actions: [
      { id: 'run', label: 'Try the read', tone: 'accent', run: (i) => storageAccess(i) },
      { id: 'nogrant', label: 'Do it wrong: no grant', tone: 'ghost', run: (i) => storageAccess(i, { principal: 'teammate (no grant)', posture: 'Private, grant on the bucket' }) },
      { id: 'clash', label: 'Do it wrong: a common bucket name', tone: 'ghost', run: (i) => storageAccess(i, { nameClash: true }) },
    ],
    pitfalls: [
      { mistake: 'A principal with no role on the bucket', symptom: "example@email.com doesn't have storage.objects.get access to the Google Cloud Storage object", why: 'Check the principal named in the error first: it may be different from the one you expected.', fix: 'Grant a role on the bucket or project, or find which credential your code used.', avoid: 'Run gcloud auth list and test with the runtime service account.', reproduce: 'nogrant', source: doc('storage/docs/troubleshooting', 'Troubleshooting Cloud Storage') },
      { mistake: 'Choosing a generic bucket name', symptom: '409 Conflict. Sorry, that name is not available. Please try a different one.', why: 'Bucket names share one global namespace.', fix: 'Prefix with your company or project.', avoid: 'Do not put secrets or personal data in names.', reproduce: 'clash', source: doc('storage/docs/troubleshooting', 'Troubleshooting Cloud Storage') },
      { mistake: 'A public bucket by accident', symptom: 'Private documents can be fetched by anyone who has the object name.', why: 'Someone granted allUsers to make one file work.', fix: 'Remove allUsers and enable public access prevention.', avoid: 'Enforce constraints/storage.publicAccessPrevention at the organization.', source: doc('storage/docs/public-access-prevention', 'Public access prevention') },
      { mistake: 'CORS errors from the browser', symptom: "Access to fetch at 'https://storage.googleapis.com/…' has been blocked by CORS policy", why: 'The Origin must match exactly (scheme, host, port), and storage.cloud.google.com does not support CORS at all.', fix: 'Set CORS on the bucket with gcloud storage buckets update --cors-file, and use storage.googleapis.com.', avoid: 'Clear the browser cache while testing, since preflights are cached up to MaxAgeSec.', source: doc('storage/docs/troubleshooting', 'Troubleshooting Cloud Storage') },
    ],
    visual: 'storageAccess',
    test: { action: 'run' },
  },
  {
    id: 'database-chooser',
    category: CATEGORY,
    title: 'Which database?',
    tagline: 'Use Cloud SQL until you can say why not',
    description: [
      'Google Cloud has more databases than most people need. A sensible default is Cloud SQL: normal PostgreSQL, MySQL or SQL Server, with backups and failover handled. AlloyDB is a PostgreSQL-compatible engine for heavier load. Spanner keeps SQL and adds horizontal scale and global consistency.',
      'Firestore is a serverless document database that works directly from web and mobile apps. Bigtable handles huge keyed volumes such as time series. Memorystore is managed Redis and Valkey. BigQuery is for analytics, not per-user lookups. Answer the questions to rank them.',
      'The scores are this lab’s teaching heuristic. Choosing wrong is expensive to undo, because a data model is hard to change later, so look at your real queries first.',
    ],
    keyApis: ['gcloud sql instances create', 'gcloud alloydb clusters create', 'gcloud spanner instances create', 'gcloud firestore databases create', 'gcloud bigtable instances create'],
    useCases: ['New application design', 'Migrating from RDS, DynamoDB or Cosmos DB'],
    snippet: { lang: 'bash', name: 'databases.sh', code: `# Cloud SQL: the sensible default
gcloud sql instances create orders --database-version=POSTGRES_16 \\
  --region=us-central1 --tier=db-custom-2-7680 --availability-type=REGIONAL

# Firestore: nothing to size
gcloud firestore databases create --location=us-central1

# Spanner: small to start (processing units, not whole nodes)
gcloud spanner instances create shop --config=regional-us-central1 \\
  --processing-units=100 --description="Shop"` },
    inputs: [
      { name: 'shape', label: 'Data shape', type: 'select', default: 'Relational tables and joins', options: ['Relational tables and joins', 'JSON-like documents', 'Keys with huge volume (time series, IoT)', 'Reports across billions of rows', 'Temporary values, sessions, cache'] },
      { name: 'scale', label: 'Scale', type: 'select', default: 'One region, up to a few TB', options: ['One region, up to a few TB', 'Heavy growth in one region', 'Global users, strong consistency'] },
      { name: 'ops', label: 'Priority', type: 'select', default: 'Keep the database I already know', options: ['Keep the database I already know', 'Pay only when used, no sizing', 'Lowest latency matters most'] },
    ],
    flow: [['run', 'sql', 'SQL with joins'], ['run', 'spanner', 'SQL at global scale'], ['run', 'fstore', 'documents'], ['run', 'bq', 'analytics']],
    actions: [
      { id: 'run', label: 'Rank the options', tone: 'accent', run: (i) => databaseChooser(i) },
      { id: 'wrong', label: 'Do it wrong: BigQuery as an app database', tone: 'ghost', run: (i) => databaseChooser(i, { answers: { shape: 'Relational tables and joins', scale: 'One region, up to a few TB', ops: 'Lowest latency matters most' }, wrongPick: 'bigquery', wrongWhy: 'a warehouse answers big scans in seconds, not one user’s row in milliseconds' }) },
    ],
    pitfalls: [
      { mistake: 'Using BigQuery for per-user lookups', symptom: 'Page loads take seconds, and costs grow with each request.', why: 'BigQuery is built for analytical scans, not transactions.', fix: 'Serve the app from Cloud SQL, Firestore or Spanner, and copy data to BigQuery for reports.', avoid: 'Keep operational and analytical stores separate.', reproduce: 'wrong', source: doc('bigquery/docs/introduction', 'BigQuery overview') },
      { mistake: 'Treating Memorystore as durable', symptom: 'Data is missing after maintenance or a failover.', why: 'Caches are designed to be rebuilt.', fix: 'Reload from the source of truth, and treat a cache miss as normal.', avoid: 'Keep a real database behind it.', source: doc('memorystore/docs/redis/redis-overview', 'Memorystore for Redis overview') },
    ],
    visual: 'chooser',
    test: { action: 'run' },
  },
  {
    id: 'cloud-sql-connections',
    category: CATEGORY,
    title: 'Cloud SQL: connections and scaling',
    tagline: 'Serverless scales faster than your database does',
    description: [
      'Cloud Run can add instances quickly, and each one opens its own pool of connections. A database has a hard connection limit, so the sums go wrong quickly. Total connections = max instances × pool size + everything else.',
      'Change the numbers and watch the gauge. Each Cloud Run instance is also limited to 100 connections to a Cloud SQL database. Set a small pool and a max-instances value from the answer.',
      'Connect through the Cloud SQL Auth Proxy or a language connector rather than an IP allowlist: both use IAM and encrypt the traffic. Your service account needs the Cloud SQL Client role. Private IP connections use TCP over the VPC and skip the proxy.',
    ],
    keyApis: ['--add-cloudsql-instances', 'roles/cloudsql.client', 'Cloud SQL Auth Proxy', 'pool_size', 'max_connections'],
    useCases: ['Cloud Run plus PostgreSQL', 'GKE plus MySQL', 'Sizing connection pools'],
    snippet: { lang: 'python', name: 'db.py', code: `import sqlalchemy
from google.cloud.sql.connector import Connector

connector = Connector(refresh_strategy="lazy")  # Suits serverless CPU throttling

def getconn():
    return connector.connect("my-lab:us-central1:orders", "pg8000",
                             user="app", db="shop", enable_iam_auth=True)

# One pool per instance, created once, at startup
pool = sqlalchemy.create_engine(
    "postgresql+pg8000://", creator=getconn,
    pool_size=5, max_overflow=0, pool_timeout=30, pool_recycle=1800,
)` },
    inputs: [
      { name: 'maxInstances', label: 'Cloud Run max instances', type: 'number', default: 10, min: 1, max: 500 },
      { name: 'pool', label: 'Pool size per instance', type: 'number', default: 5, min: 1, max: 200 },
      { name: 'other', label: 'Other clients', type: 'number', default: 10, min: 0, max: 500 },
      { name: 'maxConnections', label: 'max_connections', type: 'number', default: 100, min: 25, max: 4000 },
    ],
    flow: [['run', 'iam', 'Cloud SQL Client?'], ['run', 'sql', 'connection through the Auth Proxy'], ['sql', 'run', 'pooled, reused']],
    actions: [
      { id: 'run', label: 'Do the sums', tone: 'accent', run: (i) => cloudSql(i) },
      { id: 'wrong', label: 'Do it wrong: 100 instances, large pools', tone: 'ghost', run: (i) => cloudSql(i, { maxInstances: 100, pool: 100 }) },
    ],
    pitfalls: [
      { mistake: 'Default scaling with a large pool', symptom: TOO_MANY, why: 'Connections multiply with instances until the limit, which "cannot be exceeded".', fix: 'Lower the pool and max instances, or raise the database tier.', avoid: 'Work out the limit before deploying: instances × pool + others < max_connections.', reproduce: 'wrong', source: doc('sql/docs/postgres/manage-connections', 'Manage database connections') },
      { mistake: 'A new connection per request', symptom: 'Slow requests under load and exhausted connections.', why: 'Each connection uses resources on both ends and takes time to set up.', fix: 'Create one pool at startup and reuse it. Always return connections.', avoid: 'Put the pool in module scope, not in the handler.', source: doc('sql/docs/postgres/manage-connections', 'Manage database connections') },
      { mistake: 'Missing the Cloud SQL Client role', symptom: 'The connector or Auth Proxy reports a 403 / not authorized error when it connects.', why: 'The runtime service account needs Cloud SQL Client to connect through the proxy or a connector.', fix: 'Grant roles/cloudsql.client, and check the Cloud SQL Admin API is enabled.', avoid: 'Put both in your setup script.', source: doc('sql/docs/postgres/connect-run', 'Connect from Cloud Run') },
    ],
    visual: 'cloudSql',
    test: { action: 'run' },
  },
  {
    id: 'key-hotspots',
    category: CATEGORY,
    title: 'Spanner and Bigtable: key design',
    tagline: 'If your key always goes up, one server does all the work',
    description: [
      'Spanner and Bigtable split a table into key ranges, each served by a server. That is how they scale. But if the start of your key always increases, like a timestamp, every new row falls into the last range. One server takes all the inserts while the rest sit idle.',
      'Pick a key scheme and insert rows. The bars count where keys generated by each scheme land across the splits. Monotonic keys pile onto one bar, and random ones spread out.',
      'For Spanner, use a UUIDv4, a bit-reversed sequence, a hashed shard prefix, or lead with something like a user ID. Bigtable’s guidance differs in one way: keep readable keys, avoid hashes because they break sort order, and put a high-cardinality value such as a device or user ID before the timestamp. Use Key Visualizer to see real hotspots.',
    ],
    keyApis: ['PRIMARY KEY', 'NEW_UUID()', 'bit-reversed sequence', 'FARM_FINGERPRINT', 'Key Visualizer'],
    useCases: ['High-volume inserts', 'Event logs', 'IoT and time series'],
    snippet: { lang: 'sql', name: 'schema.sql', code: `-- Don't: every new row lands in the same split
CREATE TABLE UserAccessLogs (
  LastAccess TIMESTAMP NOT NULL,
  UserId STRING(1024)
) PRIMARY KEY (LastAccess, UserId);

-- Do: a random UUID spreads writes across the key space
CREATE TABLE UserAccessLogs (
  LogEntryId UUID DEFAULT (NEW_UUID()),
  LastAccess TIMESTAMP NOT NULL,
  UserId STRING(1024)
) PRIMARY KEY (LogEntryId);` },
    inputs: [
      { name: 'scheme', label: 'Key scheme', type: 'select', default: 'Random UUIDv4', options: Object.keys(KEY_SCHEMES) },
      { name: 'writes', label: 'Rows to insert', type: 'number', default: 5000, min: 100, max: 20000 },
      { name: 'splits', label: 'Splits', type: 'number', default: 8, min: 2, max: 16 },
    ],
    flow: [['run', 'spanner', 'INSERT with this key'], ['spanner', 'spanner', 'find the split for the key'], ['spanner', 'run', 'commit']],
    actions: [
      { id: 'run', label: 'Insert the rows', tone: 'accent', run: (i) => keyHotspots(i) },
      { id: 'wrong', label: 'Do it wrong: timestamp-first key', tone: 'ghost', run: (i) => keyHotspots(i, { scheme: 'Timestamp first (monotonic)' }) },
    ],
    pitfalls: [
      { mistake: 'A timestamp or sequence at the start of the key', symptom: 'Write latency rises while most servers are idle, and adding nodes does not help.', why: 'New rows all sort to one end of the key space. Reversing the sort order does not fix it.', fix: 'Change the primary key to a UUIDv4, hash prefix or user ID first. That usually means a new table and a backfill.', avoid: 'Design the key first, and test with realistic write rates.', reproduce: 'wrong', source: doc('spanner/docs/schema-design', 'Spanner schema design best practices') },
      { mistake: 'Hashing keys in Bigtable by habit', symptom: 'Range scans stop working, and Key Visualizer turns unreadable.', why: 'Hashing removes the natural sort order that Bigtable queries rely on.', fix: 'Use readable segments: device#date, with the common lookup first.', avoid: 'Reverse sequential IDs rather than hashing them, if you must spread them.', source: doc('bigtable/docs/schema-design', 'Bigtable schema design') },
      { mistake: 'Retrying an aborted Spanner transaction by hand', symptom: 'ABORTED: Transaction was aborted.', why: 'Aborts are normal in read-write transactions under contention.', fix: 'Use the client’s run_in_transaction, which retries the whole function.', avoid: 'Keep the transaction function free of side effects, as it can run more than once.', source: doc('spanner/docs/transactions', 'Transactions overview') },
    ],
    visual: 'hotspots',
    test: { action: 'run' },
  },
  {
    id: 'firestore',
    category: CATEGORY,
    title: 'Firestore: ramp-up and indexes',
    tagline: '500 operations a second, then 50% more every 5 minutes',
    description: [
      'Firestore stores documents in collections, needs no sizing, and has web and mobile SDKs with live updates. It must warm up to high traffic: start a new collection at a maximum of 500 operations a second, and increase by 50% every 5 minutes. That is the 500/50/5 rule.',
      'Enter a target rate. The chart draws the ramp and the time it takes. Send everything at once and you risk contention errors. Automatic document IDs avoid write hotspots because they scatter across the key range, while IDs such as Customer1, Customer2 create them.',
      'Queries need indexes. Single-field indexes are automatic; a query filtering on one field and sorting by another needs a composite index, and the error links to a form that creates it. Firestore bills per operation, so a broad live listener can be a surprise on the bill.',
    ],
    keyApis: ['collection().add()', 'firestore.indexes.json', 'firestore.rules', 'BulkWriter', 'onSnapshot'],
    useCases: ['Mobile and web apps', 'User profiles and carts', 'Live collaboration'],
    snippet: { lang: 'js', name: 'firestore.rules', code: `// Security rules protect the database from web and mobile clients
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /carts/{userId} {
      allow read, write: if request.auth != null
                         && request.auth.uid == userId;
    }
  }
}` },
    inputs: [{ name: 'target', label: 'Target (ops/s)', type: 'number', default: 5000, min: 500, max: 100000 }],
    flow: [['run', 'fstore', 'writes at the ramped rate'], ['fstore', 'fstore', 'split ranges as traffic grows'], ['fstore', 'run', 'ack']],
    actions: [
      { id: 'run', label: 'Plan the ramp', tone: 'accent', run: (i) => firestore(i) },
      { id: 'jump', label: 'Do it wrong: full load on day one', tone: 'ghost', run: (i) => firestore(i, { jump: true }) },
      { id: 'index', label: 'Do it wrong: query with no index', tone: 'ghost', run: (i) => firestore(i, { query: true }) },
    ],
    pitfalls: [
      { mistake: 'Full traffic to a new collection, or to one document', symptom: CONTENTION, why: 'Too many updates per second to a document, overlapping transactions, or traffic spikes that hit hot-spots.', fix: 'Reduce the write rate, shard counters across documents, and use a BulkWriter.', avoid: 'Follow 500/50/5, use automatic IDs, and exempt timestamp fields you do not query from indexing.', reproduce: 'jump', source: doc('firestore/docs/best-practices', 'Firestore best practices') },
      { mistake: 'Not checking in your indexes', symptom: NEEDS_INDEX, why: 'A composite index exists only in the database where it was created.', fix: 'Follow the link, then export to firestore.indexes.json.', avoid: 'Deploy indexes with your code.', reproduce: 'index', source: doc('firestore/docs/query-data/indexing', 'Manage indexes') },
      { mistake: 'Test-mode security rules left open', symptom: 'Anyone can read and write your database through the public client API.', why: 'Web apps talk to Firestore directly, so the rules are the only barrier, and test mode allows everything for a limited time.', fix: 'Write rules that check request.auth, and test with the emulator.', avoid: 'Never launch on test mode. If rules deny instead, clients see: Missing or insufficient permissions.', source: { title: 'Get started with Firestore Security Rules', url: 'https://firebase.google.com/docs/firestore/security/get-started' } },
    ],
    visual: 'firestore',
    test: { action: 'run' },
  },
];
