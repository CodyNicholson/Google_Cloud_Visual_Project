# Google Cloud Visual Lab

An interactive guide for developers new to Google Cloud Platform. It explains every product, shows how the platform behaves with animated simulations, and teaches the mistakes and errors people hit, with how to fix and avoid each one.

It is an unofficial learning project, not affiliated with or endorsed by Google. There is no backend and it calls nothing on Google Cloud (that would need an account, credentials and a bill), so it runs entirely in the visitor's browser.

## What's in it

| Page | What it does |
| --- | --- |
| Overview | The mental model, a learning path, your first hour with `gcloud`, strengths and weaknesses, how not to use Google Cloud |
| Service atlas | 193 products in 14 groups: what each is for and its AWS and Azure equivalents. Search by name, former name, purpose, or the AWS or Azure name you already know. Renamed and retired products are flagged |
| Blueprints | Five animated reference architectures: web app, event-driven, data platform, AI assistant, organization layout |
| Mistakes, errors & fixes | Every pitfall in one page. Paste an error message into the search box |
| Run all demos | Runs every simulation's self-checks in your browser |
| 36 topic pages | See below |

Each topic page has a plain-language explanation, an animated request flow, inputs and buttons, an animated picture of the result, working code, common mistakes with sources, and the commands and self-checks of the last run. Most have "Do it wrong" buttons that play a mistake and show its error.

| Area | Topics |
| --- | --- |
| Foundations and identity | First deploy (the five gates) · Organization, folders, projects · IAM · Application Default Credentials · Service accounts without keys · Regions and zones · Budgets |
| Compute | Which compute service? · Compute Engine: Spot VMs and capacity · Cloud Run scaling · Cloud Run container contract · Functions and event retries · GKE scheduling |
| Storage and databases | Cloud Storage classes · Bucket access and signed URLs · Which database? · Cloud SQL connections · Spanner and Bigtable key design · Firestore ramp-up and indexes |
| Networking | VPC and peering · Firewall rules · Private egress · Load balancers, Cloud Armor and CDN |
| Data and messaging | BigQuery scan costs · Pub/Sub delivery · Dataflow windows · Which data tool? |
| AI and machine learning | Which AI service? · Quotas, 429s and backoff · RAG |
| DevOps and observability | CI/CD to a canary · Terraform state · Log Router · SLOs and alerts |
| Security and governance | Secret Manager · Guardrails above IAM |

Totals: 110 feature pitfalls (52 with a "Reproduce it" button), 10 anti-patterns and 10 general errors.

## Quick start

```bash
cp .env.example .env               # optional: set FRONTEND_HOST_PORT
docker network create tunnel-net   # once; docker-compose.yml declares it external
docker compose up -d --build       # then: docker compose port frontend 80
```

| Service | Container | Port |
| --- | --- | --- |
| frontend (unprivileged nginx, React build) | `rixus-frontend` | `127.0.0.1:${FRONTEND_HOST_PORT}` to 80; Docker picks a free localhost port when it's empty |

Without Docker: `cd frontend && npm ci && npm run dev` (Node 22+).

## Architecture

```
browser ── tunnel ── rixus-frontend (nginx) ── static React build
                                                 ├─ src/kb/         atlas and blueprints content
                                                 ├─ src/lab/        simulations (return a DemoResult)
                                                 ├─ src/demos/      one catalog entry per page, guide.js
                                                 └─ src/visuals/    animated SVG and CSS, no libraries
```

Each button runs a function in `src/lab/` that returns `{ demo, commands, data, checks, elapsedMs }`. To add a topic: write the simulation, add an entry in `src/demos/entries/`, and register a visual in `src/visuals/index.js`. The tests fail if any part is missing.

## How not to use it, and common errors

Anti-patterns: one project for everything; Owner or Editor for apps; downloaded service account keys; treating a budget as a limit; GKE by default; BigQuery as an app database; the default network's open rules; clicking resources into production; secrets in images or code; monotonic keys first in Spanner or Bigtable.

| Error | Cause | Fix | Avoid |
| --- | --- | --- | --- |
| `API has not been used in project … or it is disabled` | APIs are off by default | `gcloud services enable …` | Declare APIs in setup or Terraform |
| `Your default credentials were not found` | `gcloud auth login` doesn't set up credentials for code | `gcloud auth application-default login` | Put it in your README |
| `Failed to start and then listen on the port defined by the PORT environment variable` | Binding to localhost or a fixed port | Listen on `0.0.0.0:$PORT` | Test with `docker run -e PORT=8080` |
| `The request was aborted because there was no available instance` | Max instances reached | Raise the limit or concurrency, add backoff | Load test |
| `ZONE_RESOURCE_POOL_EXHAUSTED` | The zone is out of that hardware (not a quota problem) | Another zone or machine type | Regional groups, reservations |
| `Request violates VPC Service Controls` | A perimeter, not IAM, refused it | Read `violationReason`, add a rule | Dry-run perimeters |

The `#pitfalls` page has the rest. Sources: [Cloud Run troubleshooting](https://docs.cloud.google.com/run/docs/troubleshooting), [resource availability](https://docs.cloud.google.com/compute/docs/troubleshooting/troubleshooting-resource-availability), [ADC troubleshooting](https://docs.cloud.google.com/docs/authentication/troubleshoot-adc), [service account best practices](https://docs.cloud.google.com/iam/docs/best-practices-service-accounts), [BigQuery costs](https://docs.cloud.google.com/bigquery/docs/best-practices-costs), [VPC Service Controls troubleshooting](https://docs.cloud.google.com/vpc-service-controls/docs/troubleshooting). Each pitfall in the app links its own source.

## Configuration (`.env`, git-ignored)

| Variable | Used by | Notes |
| --- | --- | --- |
| `TUNNEL_TOKEN` | `pipeline-run.sh` | Only when it isn't set globally on the server |
| `FRONTEND_HOST_PORT` | `docker-compose.yml` | Localhost-only host port. The tunnel doesn't need it |

## Tests

```bash
docker build --target test frontend   # Vitest
docker compose -p google-cloud-visual-project-test -f docker-compose.yml -f docker-compose.test.yml up -d --build
#   isolated stack on 127.0.0.1:3917, container gcp-lab-test-frontend, not on tunnel-net
docker compose -p google-cloud-visual-project-test -f docker-compose.yml -f docker-compose.test.yml down -v
```

The suite checks that every page is complete and sourced, renders every page and visual, runs every demo's self-test and every button, feeds hostile inputs to every demo, tests the simulations against documented numbers (firewall order, ADC order, storage minimums, 500/50/5, error budgets) and validates the atlas and blueprints. In the browser, "Run all demos" runs the same self-tests.

## Deployment

`pipeline-run.sh` (git-ignored) deploys like the other visual labs: it creates `.env` if needed, reads `TUNNEL_TOKEN`, pulls the repo, **removes every container on the host**, starts `cloudflared-tunnel` on `tunnel-net`, then runs `docker compose up -d --build`. The tunnel routes to `http://rixus-frontend:80`. Only one app is live at a time, so running it replaces whatever is live.

## Notes and limits

- **These are simulations, not real Google Cloud.** Each models behaviour that Google's documentation describes. A green self-check means the simulation behaved as the page explains, not that Google Cloud was contacted.
- **Models are simplified.** Cloud Run scaling ignores CPU signals, quotas are per second rather than per token, the BigQuery clustering saving is a rough estimate, and the guardrail order is simplified for teaching.
- **Prices are illustrative.** Storage, logging and BigQuery figures are round list-style numbers for comparison, not quotes. The pricing pages couldn't be read automatically, so check them before planning.
- **Error text varies.** Messages come from Google's docs where it publishes them. Others (for example some `gcloud`, Terraform and Artifact Registry messages) are typical wording and can differ by tool and version.
- **"Which service?" scores** are this lab's teaching heuristic, not official guidance.
- **The atlas follows Google's comparison page**, plus a few products added by hand (such as the Gemini API, Infrastructure Manager and Container Registry). Equivalents are approximate. Some former names, such as Vertex AI to Gemini Enterprise Agent Platform and Agentspace to Gemini Enterprise, come partly from secondary sources; the docs were still in transition. Facts were checked on October 31, 2026.
- **Not covered in depth:** every product has an atlas card, but only the most common ones have an interactive page.
