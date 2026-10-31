import { bigquery, dataflow, dataToolChooser, pubsub } from '../../lab/data.js';
import { doc } from '../../lab/lab.js';

const CATEGORY = 'Data and messaging';

export default [
  {
    id: 'bigquery-scan',
    category: CATEGORY,
    title: 'BigQuery: you pay for what you scan',
    tagline: 'LIMIT does not make it cheaper, but choosing columns does',
    description: [
      'BigQuery is a serverless data warehouse. There are no servers to size: load data and write SQL. On-demand pricing bills the bytes a query reads (about $6.25 per TiB after a free 1 TiB a month; check the pricing page). You can also buy capacity by the slot, through editions.',
      'Build a query and watch the grid. Columns run across, and partitions (days) run down. Only the bright cells get read and billed. SELECT * lights up every column. A WHERE on the partition column switches off the other days. Google says plainly: "Applying a LIMIT clause to a SELECT * query does not affect the amount of data read."',
      'Always dry-run a big query first, set a maximum bytes billed so runaway queries fail with no charge, and use free table previews to look at data. Clustering can reduce the bytes too; the 90% saving used here is a rough estimate.',
    ],
    keyApis: ['--dry_run', '--maximum_bytes_billed', 'PARTITION BY', 'CLUSTER BY', 'require_partition_filter'],
    useCases: ['Analytics and reporting', 'Log analysis', 'Feeding dashboards and ML'],
    snippet: { lang: 'sql', name: 'events.sql', code: `CREATE TABLE shop.events (
  event_ts TIMESTAMP, user_id STRING, country STRING, event STRING,
  amount NUMERIC, url STRING, user_agent STRING, payload JSON
)
PARTITION BY DATE(event_ts)
CLUSTER BY country, user_id
OPTIONS (require_partition_filter = TRUE);

-- Reads two columns from seven days
SELECT user_id, SUM(amount) AS total
FROM shop.events
WHERE DATE(event_ts) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
GROUP BY user_id;` },
    inputs: [
      { name: 'projection', label: 'Columns', type: 'select', default: 'SELECT user_id, amount', options: ['SELECT user_id, amount', 'SELECT user_id, event, amount, country', 'SELECT *'] },
      { name: 'partitioned', label: 'Filter by partition', type: 'checkbox', default: true },
      { name: 'days', label: 'Days to read', type: 'number', default: 7, min: 1, max: 365 },
      { name: 'clustered', label: 'Filter on a cluster column', type: 'checkbox', default: false },
    ],
    flow: [['dev', 'bq', 'dry run: how many bytes?'], ['bq', 'dev', 'estimate, no charge'], ['dev', 'bq', 'run the query'], ['bq', 'bq', 'read only the chosen columns and days']],
    actions: [
      { id: 'run', label: 'Estimate the scan', tone: 'accent', run: (i) => bigquery(i) },
      { id: 'limit', label: 'Do it wrong: SELECT * … LIMIT 10', tone: 'ghost', run: (i) => bigquery(i, { projection: 'SELECT *', partitioned: false, clustered: false, days: 365, limit: 10 }) },
      { id: 'cap', label: 'Guard it: max bytes billed', tone: 'ghost', run: (i) => bigquery(i, { projection: 'SELECT *', partitioned: false, clustered: false, days: 365, maxGb: 100 }) },
    ],
    pitfalls: [
      { mistake: 'Believing LIMIT reduces the cost', symptom: 'SELECT * FROM events LIMIT 10 processes the full table and costs the same as without LIMIT.', why: '"For non-clustered tables, applying a LIMIT clause to a query doesn\'t affect the amount of data that is read."', fix: 'Use the table preview to look at data. Name the columns you need.', avoid: 'Set a maximum bytes billed on your jobs, and watch the estimate in the console.', reproduce: 'limit', lang: 'sql', wrongCode: 'SELECT * FROM shop.events LIMIT 10;', rightCode: "SELECT user_id, amount FROM shop.events\nWHERE DATE(event_ts) = '2026-10-30';", source: doc('bigquery/docs/best-practices-costs', 'Estimate and control costs') },
      { mistake: 'Hitting your own cost guard', symptom: 'Query exceeded limit for bytes billed: 100000000000. 1601000000000 or higher required.', why: 'That is the guard working: "the query fails without incurring a charge". Without it the same query would run and bill.', fix: 'Narrow the query, or raise the limit on purpose.', avoid: 'Set the limit by default, and add custom daily quotas.', reproduce: 'cap', source: doc('bigquery/docs/best-practices-costs', 'Estimate and control costs') },
      { mistake: 'Forgetting the partition filter', symptom: "Cannot query over table 'TABLE_NAME' without a filter over column(s) 'COLUMN_NAME'", why: 'The table requires a partition filter, a helpful guard against scanning all of it.', fix: 'Add a WHERE on the partition column.', avoid: 'Turn on require_partition_filter for big tables.', source: doc('bigquery/docs/troubleshoot-queries', 'Troubleshoot queries') },
      { mistake: 'Querying across locations', symptom: 'Not found: Dataset my-lab:shop was not found in location US', why: 'The dataset exists but in another location. A location mismatch returns notFound.', fix: 'Pass --location, or set the location in the console’s query settings.', avoid: 'Keep related datasets in a single location.', source: doc('bigquery/docs/error-messages', 'Error messages') },
    ],
    visual: 'bigquery',
    test: { action: 'run' },
  },
  {
    id: 'pubsub',
    category: CATEGORY,
    title: 'Pub/Sub: at-least-once delivery',
    tagline: 'Acknowledge in time, and expect duplicates anyway',
    description: [
      'Publishers send messages to a topic. Each subscription gets its own copy and delivers it to subscribers. A message must be acknowledged before the ack deadline (10 seconds by default, up to 600), or it is delivered again. Delivery is at least once, without ordering, unless you enable those options.',
      'Run a batch and read the rows: each is a delivery round. Green is acknowledged, amber means the deadline passed and the message came back, and red is a poison message. Without a dead-letter topic poison stays in the loop until it expires.',
      'High-level client libraries extend the deadline for you, up to an hour by default. Subscriptions keep unacknowledged messages for 7 days by default, and a subscription with no activity expires after 31 days. Messages can be up to 10 MB. Subscribers should be idempotent: without exactly-once delivery, deadlines are not guaranteed to be respected.',
    ],
    keyApis: ['--ack-deadline', '--dead-letter-topic', '--max-delivery-attempts', '--enable-message-ordering', '--enable-exactly-once-delivery'],
    useCases: ['Decoupling services', 'Event ingestion', 'Fan-out to many consumers'],
    snippet: { lang: 'python', name: 'subscriber.py', code: `from google.cloud import pubsub_v1

subscriber = pubsub_v1.SubscriberClient()
path = subscriber.subscription_path("my-lab", "orders-worker")

def callback(message):
    if already_processed(message.message_id):   # Idempotency
        message.ack()
        return
    handle(message.data)
    message.ack()

# The client extends the ack deadline while callback runs
future = subscriber.subscribe(path, callback=callback)
future.result()` },
    inputs: [
      { name: 'messages', label: 'Messages', type: 'number', default: 6, min: 2, max: 12 },
      { name: 'processS', label: 'Processing time (s)', type: 'number', default: 5, min: 1, max: 600 },
      { name: 'deadlineS', label: 'Ack deadline (s)', type: 'number', default: 10, min: 10, max: 600 },
      { name: 'extend', label: 'Client extends the lease', type: 'checkbox', default: true },
      { name: 'poisonEvery', label: 'Every Nth message is poison (0 = none)', type: 'number', default: 0, min: 0, max: 12 },
      { name: 'dlq', label: 'Dead-letter topic', type: 'checkbox', default: true },
      { name: 'maxDelivery', label: 'Max delivery attempts', type: 'number', default: 5, min: 5, max: 100 },
    ],
    flow: [['run', 'pubsub', 'publish to topic'], ['pubsub', 'fn', 'deliver to subscriber'], ['fn', 'pubsub', 'ack before the deadline'], ['pubsub', 'pubsub', 'no ack: redeliver']],
    actions: [
      { id: 'run', label: 'Deliver', tone: 'accent', run: (i) => pubsub(i) },
      { id: 'slow', label: 'Do it wrong: work longer than the deadline', tone: 'ghost', run: (i) => pubsub(i, { processS: 45, extend: false, poisonEvery: 0, dlq: false }) },
      { id: 'poison', label: 'Do it wrong: poison and no dead-letter topic', tone: 'ghost', run: (i) => pubsub(i, { poisonEvery: 3, dlq: false, processS: 1, extend: true }) },
      { id: 'dead', label: 'Fix it: a dead-letter topic', run: (i) => pubsub(i, { poisonEvery: 3, dlq: true, processS: 1, extend: true }) },
    ],
    pitfalls: [
      { mistake: 'Processing for longer than the ack deadline', symptom: 'Each message is handled two or more times, and backlogs stay high. There is no error.', why: '"A low value increases the likelihood of duplicates."', fix: 'Use the high-level client (it extends the lease), or raise --ack-deadline, up to 600 seconds.', avoid: 'Make handlers idempotent regardless.', reproduce: 'slow', source: doc('pubsub/docs/lease-management', 'Lease management') },
      { mistake: 'No dead-letter topic', symptom: 'The same failing message returns for days, delaying and masking others.', why: 'A message that is not acknowledged is redelivered until it expires.', fix: 'Add a dead-letter topic, with --max-delivery-attempts (5 to 100).', avoid: 'Create one with every subscription, and alert on its backlog.', reproduce: 'poison', source: doc('pubsub/docs/handling-failures', 'Handle message failures') },
      { mistake: 'A dead-letter topic without the IAM grants', symptom: 'Messages never reach the dead-letter topic, and delivery attempts are not counted.', why: 'The Pub/Sub service agent needs publisher on the dead-letter topic and subscriber on the source subscription.', fix: 'Grant both roles to service-PROJECT_NUMBER@gcp-sa-pubsub.iam.gserviceaccount.com.', avoid: 'Script these with the subscription.', source: doc('pubsub/docs/handling-failures', 'Handle message failures') },
    ],
    visual: 'pubsub',
    test: { action: 'run' },
  },
  {
    id: 'dataflow-windows',
    category: CATEGORY,
    title: 'Dataflow: windows and watermarks',
    tagline: 'Events arrive late. Group by when they happened',
    description: [
      'Dataflow runs Apache Beam pipelines, streaming or batch. A streaming pipeline never ends, so to compute a total you must divide time into windows. Tumbling (fixed) windows don’t overlap, hopping windows do, and session windows close after a gap in activity.',
      'Each dot is an event, placed by when it happened. Events can arrive long after that, because phones go offline and networks are slow. The watermark is the threshold for when all data for a window is expected to have arrived. Events after that are late: allowed lateness decides whether they still count.',
      'Change the numbers and see events get counted or dropped. The windowing is really computed from the sample stream. Use event time from the message, not arrival time, or your numbers will shift when a backlog clears.',
    ],
    keyApis: ['beam.WindowInto', 'FixedWindows', 'SlidingWindows', 'Sessions', 'AfterWatermark', 'allowed_lateness'],
    useCases: ['Real-time dashboards', 'Fraud detection', 'Pub/Sub to BigQuery pipelines'],
    snippet: { lang: 'python', name: 'pipeline.py', code: `import apache_beam as beam
from apache_beam.transforms.window import FixedWindows
from apache_beam.transforms.trigger import (
    AfterWatermark, AfterCount, AccumulationMode)

with beam.Pipeline(options=options) as p:
    (p
     | beam.io.ReadFromPubSub(topic=TOPIC, timestamp_attribute="event_ts")
     | beam.WindowInto(FixedWindows(60),
                       trigger=AfterWatermark(late=AfterCount(1)),
                       allowed_lateness=300,
                       accumulation_mode=AccumulationMode.ACCUMULATING)
     | beam.Map(lambda m: ("orders", 1))
     | beam.CombinePerKey(sum)
     | beam.io.WriteToBigQuery(TABLE))` },
    inputs: [
      { name: 'size', label: 'Window size (s)', type: 'number', default: 15, min: 5, max: 30 },
      { name: 'watermarkDelay', label: 'Watermark delay (s)', type: 'number', default: 5, min: 0, max: 30 },
      { name: 'lateness', label: 'Allowed lateness (s)', type: 'number', default: 30, min: 0, max: 60 },
    ],
    flow: [['pubsub', 'dataflow', 'events, some delayed'], ['dataflow', 'dataflow', 'assign to event-time windows'], ['dataflow', 'dataflow', 'watermark passes: emit'], ['dataflow', 'bq', 'write results']],
    actions: [
      { id: 'run', label: 'Window the stream', tone: 'accent', run: (i) => dataflow(i) },
      { id: 'nolate', label: 'Do it wrong: no allowed lateness', tone: 'ghost', run: (i) => dataflow(i, { lateness: 0 }) },
      { id: 'arrival', label: 'Do it wrong: group by arrival time', tone: 'ghost', run: (i) => dataflow(i, { timeBasis: 'processing' }) },
    ],
    pitfalls: [
      { mistake: 'No allowed lateness', symptom: 'Totals come up slightly short. No error, and events are silently dropped.', why: 'Data that arrives after the watermark passes the window end is late. With no lateness allowed, it is dropped.', fix: 'Set allowed_lateness and a late trigger, and update results as they arrive.', avoid: 'Measure how late your data really is first.', reproduce: 'nolate', source: doc('dataflow/docs/concepts/streaming-pipelines', 'Streaming pipelines') },
      { mistake: 'Using arrival time instead of event time', symptom: 'After an outage, one window shows a giant spike and the outage shows zero.', why: 'Processing time records when data arrived, rather than when it happened.', fix: 'Pass the event’s timestamp: timestamp_attribute on the Pub/Sub read.', avoid: 'Put an event timestamp in every message.', reproduce: 'arrival', source: doc('dataflow/docs/concepts/streaming-pipelines', 'Streaming pipelines') },
      { mistake: 'Writing custom Dataflow for a simple job', symptom: 'A pipeline to maintain, when messages only needed to land in BigQuery.', why: 'Pub/Sub has BigQuery and Cloud Storage subscriptions that need no pipeline.', fix: 'Use a BigQuery subscription or a Google-provided template.', avoid: 'Check templates and subscriptions before writing Beam code.', source: doc('pubsub/docs/subscription-overview', 'Subscription overview') },
    ],
    visual: 'windows',
    test: { action: 'run' },
  },
  {
    id: 'data-tool-chooser',
    category: CATEGORY,
    title: 'Which data tool?',
    tagline: 'Google renamed several of these, so old tutorials may look unfamiliar',
    description: [
      'Moving and shaping data has its own shelf of products. Datastream captures database changes. Dataflow runs Beam pipelines. Managed Service for Apache Spark (formerly Dataproc) runs Spark. Dataform runs SQL transformations in BigQuery. Managed Service for Apache Airflow orchestrates everything; older docs and commands call it Cloud Composer.',
      'Answer the questions to rank them. Looker sits at the end of the pipeline for dashboards, and Knowledge Catalog handles data discovery and metadata.',
      'The commonest mistake is choosing something heavy for a job BigQuery already does alone. Scheduled queries and Dataform cover plenty of pipelines. Commands for renamed products may still use old names such as gcloud dataproc and gcloud composer, so search for both. Scores are this lab’s teaching heuristic.',
    ],
    keyApis: ['gcloud dataflow', 'gcloud dataproc', 'gcloud composer', 'gcloud datastream', 'Dataform'],
    useCases: ['Designing a data platform', 'ETL and ELT', 'Migrating from Glue, EMR or Airflow'],
    snippet: { lang: 'sql', name: 'daily_orders.sqlx', code: `-- A Dataform table: versioned SQL, with dependencies and tests
config {
  type: "table",
  bigquery: { partitionBy: "day" },
  assertions: { nonNull: ["day", "total"] }
}

SELECT DATE(event_ts) AS day, SUM(amount) AS total
FROM \${ref("events")}
GROUP BY day` },
    inputs: [
      { name: 'job', label: 'The job', type: 'select', default: 'Process events as they arrive', options: ['Process events as they arrive', 'Run Spark code we already have', 'Transform tables already in BigQuery', 'Replicate a database into BigQuery', 'Schedule many dependent jobs'] },
      { name: 'team', label: 'The team', type: 'select', default: 'Data engineers who code', options: ['SQL analysts', 'Data engineers who code', 'Prefer point and click'] },
      { name: 'size', label: 'Size', type: 'select', default: 'Large and growing', options: ['Small, a few jobs', 'Large and growing'] },
    ],
    flow: [['sql', 'pubsub', 'changes and events'], ['pubsub', 'dataflow', 'transform'], ['dataflow', 'gcs', 'raw archive'], ['dataflow', 'bq', 'curated tables']],
    actions: [
      { id: 'run', label: 'Rank the options', tone: 'accent', run: (i) => dataToolChooser(i) },
      { id: 'wrong', label: 'Do it wrong: Spark for SQL analysts', tone: 'ghost', run: (i) => dataToolChooser(i, { answers: { job: 'Transform tables already in BigQuery', team: 'SQL analysts', size: 'Small, a few jobs' }, wrongPick: 'spark', wrongWhy: 'a Spark job to write and run, when the data and a SQL engine are already in BigQuery' }) },
    ],
    pitfalls: [
      { mistake: 'A cluster for a transformation SQL could do', symptom: 'Spark jobs copying data out of BigQuery and back, with costs on both sides.', why: 'Habits from on-premises data platforms.', fix: 'Rewrite as Dataform or scheduled queries.', avoid: 'Ask "could this be SQL?" first.', reproduce: 'wrong', source: doc('dataform/docs/overview', 'Dataform overview') },
      { mistake: 'Searching only for the old product name', symptom: 'You cannot find Dataproc or Cloud Composer in new documentation, or a page describes a product you do not recognise.', why: 'Google’s service comparison now lists Managed Service for Apache Spark and Managed Service for Apache Airflow.', fix: 'Use the Service Atlas in this lab, which lists former names.', avoid: 'Check a tutorial’s date. Commands may retain old names.', source: doc('docs/get-started/aws-azure-gcp-service-comparison', 'Compare AWS and Azure services to Google Cloud') },
      { mistake: 'Leaving a Spark cluster or Airflow environment running', symptom: 'A steady daily charge for something used once a week.', why: 'Clusters and Airflow environments bill while they exist.', fix: 'Use serverless Spark batches or ephemeral clusters that delete themselves.', avoid: 'Set idle deletion on clusters, and check that lighter orchestration won’t do.', source: doc('dataproc/docs/concepts/configuring-clusters/scheduled-deletion', 'Cluster scheduled deletion') },
    ],
    visual: 'chooser',
    test: { action: 'run' },
  },
];
