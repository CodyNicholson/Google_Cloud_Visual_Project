// The browser-side equivalent of a lab backend. A public lab can't call real Google Cloud (it would
// need an account, credentials and a bill), so every demo runs a small simulation of the behaviour
// Google's documentation describes. Each returns a DemoResult { demo, commands, data, checks, elapsedMs };
// `checks` prove the simulation showed the behaviour the page explains. Prices and timings are illustrative.

export const clamp = (value, min, max, fallback = min) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

export const clampInt = (value, min, max, fallback = min) => Math.round(clamp(value, min, max, fallback));

/** Picks `value` if it is one of `options`, otherwise the first option. Inputs never reach code as-is. */
export const oneOf = (value, options) => (options.includes(value) ? value : options[0]);

export const bool = (value) => value === true || value === 'true' || value === 1 || value === '1';

export const round = (n, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;

export const usd = (n) => `$${n >= 100 ? Math.round(n).toLocaleString('en-US') : n.toFixed(2)}`;

/** Deterministic random numbers, so a demo and its self-test see the same run. */
export function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An error shaped like one a Google client library or gcloud raises. */
export class GcpError extends Error {
  constructor(name, message, extra = {}) {
    super(message);
    this.name = name;
    Object.assign(this, extra);
  }
}

export class Demo {
  constructor(id) {
    this.id = id;
    this.commands = [];
    this.checks = [];
    this.started = performance.now();
  }

  cmd(text) {
    this.commands.push(text);
  }

  check(name, passed, detail) {
    this.checks.push({ name, passed: Boolean(passed), detail: detail == null ? '' : String(detail) });
    return Boolean(passed);
  }

  /** Runs a deliberate mistake and records the error it raised. Returns { ok, error, value }. */
  attempt(label, fn) {
    try {
      const value = fn();
      this.cmd(`${label} → no error raised (the failure is silent)`);
      return { ok: true, error: null, value };
    } catch (error) {
      this.cmd(`✗ ${label} → ${error.name}: ${error.message}`);
      return { ok: false, error };
    }
  }

  result(data = {}) {
    return {
      demo: this.id,
      commands: this.commands,
      data,
      checks: this.checks,
      elapsedMs: Math.round((performance.now() - this.started) * 10) / 10,
    };
  }
}

/**
 * Walks a list of gates in order and stops at the first closed one, as a real request does.
 * gates: [{ id, label, open, error }]. Returns them with status 'pass' | 'fail' | 'skipped'.
 */
export function walkGates(gates) {
  let stopped = null;
  const walked = gates.map((g) => {
    if (stopped) return { ...g, status: 'skipped' };
    if (g.open) return { ...g, status: 'pass' };
    stopped = g;
    return { ...g, status: 'fail' };
  });
  return { gates: walked, failed: stopped, ok: !stopped };
}

/**
 * Scores options against the answers to a questionnaire and ranks them.
 * options: [{ id, name, blurb }]; rules[question][answer]: { optionId: points } with reasons in `why`.
 */
export function rankOptions(options, rules, answers, why = {}) {
  const scores = Object.fromEntries(options.map((o) => [o.id, { ...o, score: 0, reasons: [] }]));
  for (const [question, answer] of Object.entries(answers)) {
    const row = rules[question]?.[answer] || {};
    for (const [id, points] of Object.entries(row)) {
      scores[id].score += points;
      const reason = why[question]?.[answer];
      if (points > 0 && reason) scores[id].reasons.push(reason);
    }
  }
  return Object.values(scores).sort((a, b) => b.score - a.score);
}

/** A reference to Google's documentation for a pitfall's `source`. */
export const doc = (path, title) => ({ title, url: `https://docs.cloud.google.com/${path}` });
