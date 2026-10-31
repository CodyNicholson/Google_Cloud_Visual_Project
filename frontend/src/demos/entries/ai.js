import { aiChooser, aiQuotas, CORPUS, QUESTIONS, rag, RESOURCE_EXHAUSTED } from '../../lab/ai.js';
import { doc } from '../../lab/lab.js';

const CATEGORY = 'AI and machine learning';

export default [
  {
    id: 'ai-chooser',
    category: CATEGORY,
    title: 'Which AI service?',
    tagline: 'Vertex AI now goes by Gemini Enterprise Agent Platform',
    description: [
      'Google renamed its AI platform in 2026: documentation now calls Vertex AI the Gemini Enterprise Agent Platform. Docs, URLs and code still say vertex in many places, so expect both names. Gemini Enterprise is something different: a search and assistant product for employees.',
      'The Gemini API in AI Studio is the fast way in, with an API key. The Agent Platform adds IAM, enterprise controls, Model Garden (Google, partner and open models), tuning, agents and MLOps. Prebuilt APIs such as Vision and Document AI do one job without any model to manage, and BigQuery ML trains from SQL. Answer the questions to rank them.',
      'Model names change quickly, so read them from the docs rather than from a tutorial. Your welcome credit cannot pay for the Gemini API in AI Studio or for generative AI partner models offered as a managed API. Scores are this lab’s teaching heuristic.',
    ],
    keyApis: ['google-genai', 'Model Garden', 'Agent Search', 'RAG Engine', 'Document AI', 'BigQuery ML'],
    useCases: ['Adding AI to an app', 'Enterprise search', 'Document processing'],
    snippet: { lang: 'python', name: 'generate.py', code: `# pip install google-genai
from google import genai

# With IAM (ADC), through the Agent Platform: no API key in the code
client = genai.Client(vertexai=True, project="my-lab", location="global")

response = client.models.generate_content(
    model=MODEL_ID,   # Look up current IDs in the docs: they change often
    contents="Explain Cloud Run concurrency in one sentence.",
)
print(response.text)` },
    inputs: [
      { name: 'goal', label: 'The goal', type: 'select', default: 'Add generative AI to an app', options: ['Add generative AI to an app', 'Build agents with tools and data', 'Give employees a company search assistant', 'One task: OCR, speech, translation', 'Predictions from warehouse tables', 'Serve my own trained model'] },
      { name: 'stage', label: 'Stage', type: 'select', default: 'Production with company data', options: ['A prototype this week', 'Production with company data'] },
      { name: 'team', label: 'Team', type: 'select', default: 'App developers', options: ['App developers', 'Data analysts', 'ML engineers'] },
    ],
    flow: [['run', 'iam', 'token for the service account'], ['run', 'ai', 'generate_content'], ['ai', 'run', 'response']],
    actions: [
      { id: 'run', label: 'Rank the options', tone: 'accent', run: (i) => aiChooser(i) },
      { id: 'wrong', label: 'Do it wrong: run your own GPUs for OCR', tone: 'ghost', run: (i) => aiChooser(i, { answers: { goal: 'One task: OCR, speech, translation', stage: 'A prototype this week', team: 'App developers' }, wrongPick: 'custom', wrongWhy: 'GPU quota, scarce capacity and an idle bill, for a job a single API call handles' }) },
    ],
    pitfalls: [
      { mistake: 'Hosting a model when an API exists', symptom: 'A GPU VM bills all day with little traffic, and you maintain drivers and model updates.', why: 'Self-hosting feels like more control. You also take on capacity and operations.', fix: 'Try the prebuilt API or a Gemini model first.', avoid: 'Compare on cost per request, not on list price.', reproduce: 'wrong', source: doc('vertex-ai/generative-ai/docs/learn/models', 'Models') },
      { mistake: 'An API key in production client code', symptom: 'Unexpected AI charges from requests you did not send.', why: 'A key carries no user identity, and anyone holding it can spend your quota.', fix: 'Rotate the key. Call the model from your backend using IAM.', avoid: 'Use the Agent Platform with ADC, and set a spend cap on eligible projects.', source: doc('docs/authentication/api-keys-best-practices', 'Best practices for managing API keys') },
      { mistake: 'Hard-coding a model ID from an old tutorial', symptom: 'A 404 NOT_FOUND for the model, saying it was not found or your project has no access to it.', why: 'Models get retired, and availability varies by region.', fix: 'Pick a current model from the models page, and make it a config value.', avoid: 'Track deprecation notices, and test upgrades.', source: doc('vertex-ai/generative-ai/docs/learn/models', 'Models') },
    ],
    visual: 'chooser',
    test: { action: 'run' },
  },
  {
    id: 'ai-quotas',
    category: CATEGORY,
    title: 'Quotas, 429s and backoff',
    tagline: 'How you retry decides whether a burst clears or snowballs',
    description: [
      'Model APIs limit how much you can send, and over-limit calls get a 429. So a well-behaved client assumes 429s will happen.',
      'A burst of requests lands in 10 seconds. Green columns are admitted and red are refused. Immediate retries hammer the API: refused calls keep coming back and use up attempts. Exponential backoff with jitter spreads them out, so the same work gets through with fewer calls.',
      'Backoff is for bursts. For steady production load, request more quota, or look at Provisioned Throughput. The simulation uses a simple per-second limit; real quotas may also count tokens.',
    ],
    keyApis: ['RESOURCE_EXHAUSTED', 'tenacity', 'Provisioned Throughput', 'Quotas page'],
    useCases: ['Batch document processing', 'User-facing chat', 'Any API client under load'],
    snippet: { lang: 'python', name: 'retry.py', code: `from google.api_core.exceptions import ResourceExhausted
from tenacity import (retry, retry_if_exception_type,
                      stop_after_attempt, wait_random_exponential)

@retry(
    retry=retry_if_exception_type(ResourceExhausted),
    wait=wait_random_exponential(multiplier=1, max=60),  # Backoff with jitter
    stop=stop_after_attempt(6),
)
def generate(prompt):
    return client.models.generate_content(model=MODEL_ID, contents=prompt)` },
    inputs: [
      { name: 'clients', label: 'Requests in the burst', type: 'number', default: 120, min: 10, max: 400 },
      { name: 'quota', label: 'Allowed per second', type: 'number', default: 6, min: 1, max: 50 },
      { name: 'strategy', label: 'Retry strategy', type: 'select', default: 'Exponential backoff with jitter', options: ['Exponential backoff with jitter', 'Immediate retry, forever', 'No retry'] },
    ],
    flow: [['run', 'ai', 'burst of requests'], ['ai', 'run', '429 for those over quota'], ['run', 'run', 'wait with jitter'], ['run', 'ai', 'retry']],
    actions: [
      { id: 'run', label: 'Send the burst', tone: 'accent', run: (i) => aiQuotas(i) },
      { id: 'storm', label: 'Do it wrong: retry immediately', tone: 'ghost', run: (i) => aiQuotas(i, { strategy: 'Immediate retry, forever' }) },
    ],
    pitfalls: [
      { mistake: 'Retrying immediately in a loop', symptom: RESOURCE_EXHAUSTED, why: 'Retries add load at just the moment the API is over its limit.', fix: 'Add exponential backoff with jitter, and cap the attempts.', avoid: 'Use a queue, like Cloud Tasks or Pub/Sub, so you control the rate.', reproduce: 'storm', source: doc('vertex-ai/generative-ai/docs/error-code-429', 'Error code 429') },
      { mistake: 'Sending a batch job through the same quota as your live app', symptom: 'Your live app gets 429s whenever the nightly job runs.', why: 'They draw on the same project’s quota.', fix: 'Use batch prediction, or a separate project.', avoid: 'Separate interactive and bulk traffic from the start.', source: doc('vertex-ai/generative-ai/docs/error-code-429', 'Error code 429') },
    ],
    visual: 'retries',
    test: { action: 'run' },
  },
  {
    id: 'rag',
    category: CATEGORY,
    title: 'RAG: grounding answers',
    tagline: 'Find the right passage first, then ask the model about it',
    description: [
      'A model only knows what it was trained on. Retrieval-augmented generation (RAG) finds relevant passages from your own data, and includes them in the prompt. Answers can then cite sources, and stay current as your documents change.',
      'Ask a question and watch passages get ranked. This is a real search running in your browser over a small built-in corpus: it uses TF-IDF vectors and cosine similarity. A real system uses an embedding model and a vector store. No AI model runs in this page, so the "answer" shown is the top passage.',
      'On Google Cloud you can assemble this yourself, use RAG Engine, or use Agent Search as a managed offering. Chunk size matters a lot: too large and the passage dilutes the match, too small and it loses context.',
    ],
    keyApis: ['RAG Engine', 'Agent Search', 'Vector Search', 'Gemini Embedding 2', 'grounding'],
    useCases: ['Support bots', 'Internal documentation search', 'Answers with citations'],
    snippet: { lang: 'python', name: 'rag.py', code: `# The essence of RAG, whichever products you use
question_vec = embed(question)
passages = vector_store.search(question_vec, top_k=3)

prompt = f"""Answer using only the passages below. Cite the passage ID.
If the answer is not there, say you don't know.

{format_passages(passages)}

Question: {question}"""

answer = client.models.generate_content(model=MODEL_ID, contents=prompt)` },
    inputs: [
      { name: 'question', label: 'Question', type: 'select', default: Object.keys(QUESTIONS)[0], options: Object.keys(QUESTIONS) },
      { name: 'k', label: 'Passages to retrieve', type: 'number', default: 2, min: 1, max: CORPUS.length },
      { name: 'retrieve', label: 'Use retrieval', type: 'checkbox', default: true },
    ],
    flow: [['run', 'ai', 'embed the question'], ['run', 'sql', 'nearest passages'], ['sql', 'run', 'top passages'], ['run', 'ai', 'prompt + passages'], ['ai', 'run', 'grounded answer']],
    actions: [
      { id: 'run', label: 'Ask', tone: 'accent', run: (i) => rag(i) },
      { id: 'noretrieve', label: 'Do it wrong: ask without retrieval', tone: 'ghost', run: (i) => rag(i, { retrieve: false }), flow: () => [['run', 'ai', 'prompt only'], ['ai', 'run', 'an unsourced answer']] },
    ],
    pitfalls: [
      { mistake: 'Skipping retrieval and trusting the model', symptom: 'A plausible answer with an outdated limit or an invented flag, and no source to check.', why: 'The model answers from training data, which has a cutoff and contains none of your documents.', fix: 'Retrieve first and require citations.', avoid: 'Add evaluation questions with known answers, and run them on every change.', reproduce: 'noretrieve', source: doc('vertex-ai/generative-ai/docs/grounding/overview', 'Grounding overview') },
      { mistake: 'Embedding with one model and querying with another', symptom: 'Search returns unrelated results, or a vector dimension mismatch error.', why: 'Vectors from different models are not comparable.', fix: 'Re-embed the whole corpus with one model.', avoid: 'Store the model ID with your vectors.', source: doc('vertex-ai/generative-ai/docs/embeddings', 'Embeddings overview') },
    ],
    visual: 'rag',
    test: { action: 'run' },
  },
];
