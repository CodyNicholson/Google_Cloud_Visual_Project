// The behaviours the pages teach, tested directly against documented numbers.
import { describe, expect, it } from 'vitest';
import { inCidr, evaluateFirewall, RULESETS, route } from '../lab/network.js';
import { evaluateIam, resolveAdc } from '../lab/foundations.js';
import { classCost, CLASSES, rampSchedule } from '../lab/storage.js';
import { scanBytes, windowing } from '../lab/data.js';
import { runScale, schedule, spotRun } from '../lab/compute.js';
import { search, CORPUS, QUESTIONS } from '../lab/ai.js';
import { applyTerraform, sloAlerts } from '../lab/ops.js';

describe('firewall', () => {
  it('matches CIDR ranges', () => {
    expect(inCidr('35.235.240.8', '35.235.240.0/20')).toBe(true);
    expect(inCidr('35.235.0.8', '35.235.240.0/20')).toBe(false);
    expect(inCidr('8.8.8.8', '0.0.0.0/0')).toBe(true);
  });

  it('denies unmatched ingress with the implied rule', () => {
    const r = evaluateFirewall(RULESETS['Least privilege (recommended)'], { src: '203.0.113.9', port: 22, target: 'web' });
    expect(r).toMatchObject({ allowed: false, winner: 'implied-deny-ingress' });
  });

  it('lets deny win at equal priority', () => {
    const rules = [
      { name: 'a', priority: 1000, action: 'allow', src: ['0.0.0.0/0'], ports: [443], target: 'any' },
      { name: 'b', priority: 1000, action: 'deny', src: ['0.0.0.0/0'], ports: [443], target: 'any' },
    ];
    expect(evaluateFirewall(rules, { src: '1.1.1.1', port: 443, target: 'web' }).winner).toBe('b');
  });
});

describe('identity', () => {
  it('checks deny before allow, even for Owner', () => {
    expect(evaluateIam({ role: 'roles/owner', permission: 'storage.objects.delete', denied: true }).allowed).toBe(false);
    expect(evaluateIam({ role: 'roles/owner', permission: 'storage.objects.delete', denied: false }).allowed).toBe(true);
  });

  it('finds ADC sources in the documented order', () => {
    expect(resolveAdc({ envVar: true, envFileExists: true, gcloudFile: true, metadata: true }).credential).toContain('variable');
    expect(resolveAdc({ envVar: false, gcloudFile: true, metadata: true }).credential).toContain('user credentials');
    expect(resolveAdc({ envVar: false, gcloudFile: false, metadata: true }).credential).toContain('attached');
    expect(() => resolveAdc({ envVar: false, gcloudFile: false, metadata: false })).toThrow(/default credentials were not found/);
  });
});

describe('storage', () => {
  it('uses the documented minimum durations', () => {
    expect(CLASSES.map((c) => c.minDays)).toEqual([0, 30, 90, 365]);
  });

  it('charges early deletion up to the minimum', () => {
    const archive = CLASSES.find((c) => c.id === 'Archive');
    expect(classCost(archive, { sizeGb: 100, days: 30, readsPerMonth: 0 }).earlyDelete).toBeGreaterThan(0);
    expect(classCost(archive, { sizeGb: 100, days: 400, readsPerMonth: 0 }).earlyDelete).toBe(0);
  });

  it('follows 500/50/5', () => {
    const steps = rampSchedule(5000);
    expect(steps[0]).toEqual({ minute: 0, rate: 500 });
    expect(steps[1]).toEqual({ minute: 5, rate: 750 });
    expect(steps[steps.length - 1].rate).toBe(5000);
    expect(steps[steps.length - 1].minute).toBe(30);
  });
});

describe('data', () => {
  it('bills columns and partitions, never rows', () => {
    const all = ['event_ts', 'user_id', 'country', 'event', 'amount', 'url', 'user_agent', 'payload'];
    expect(scanBytes({ columns: ['user_id'], days: 365, partitioned: false })).toBe(60);
    expect(scanBytes({ columns: all, days: 365, partitioned: false })).toBe(1600);
    expect(scanBytes({ columns: all, days: 73, partitioned: true })).toBe(320);
  });

  it('keeps every event in a window or drops it', () => {
    const r = windowing({ size: 15, watermarkDelay: 5, lateness: 0 });
    expect(r.dropped.length).toBeGreaterThan(0);
    expect(r.windows.reduce((n, w) => n + w.events.length, 0) + r.dropped.length).toBe(11);
  });
});

describe('compute', () => {
  it('never exceeds max instances and refuses the excess', () => {
    const r = runScale({ baseRps: 0, spikeRps: 100, latencyMs: 1000, concurrency: 1, minInstances: 0, maxInstances: 3, coldStartS: 1 });
    expect(Math.max(...r.series.map((s) => s.ready))).toBeLessThanOrEqual(3);
    expect(r.rejected).toBeGreaterThan(0);
  });

  it('scales to zero when idle', () => {
    const r = runScale({ baseRps: 10, spikeRps: 100, latencyMs: 100, concurrency: 80, minInstances: 0, maxInstances: 10, coldStartS: 1 });
    expect(r.series[59].ready).toBe(0);
  });

  it('checkpoints save machine-hours', () => {
    const without = spotRun({ jobHours: 12, preemptEvery: 4, checkpointEvery: 0 });
    const withCp = spotRun({ jobHours: 12, preemptEvery: 4, checkpointEvery: 0.5 });
    expect(withCp.hours).toBeLessThan(without.hours);
  });

  it('schedules by request and leaves what does not fit', () => {
    const r = schedule({ pods: [{ name: 'a', cpu: 1.5 }, { name: 'b', cpu: 1.5 }], nodes: [{ name: 'n', cpu: 2 }] });
    expect(r.pending).toHaveLength(1);
  });
});

describe('ai', () => {
  it.each(Object.entries(QUESTIONS))('search ranks the right passage for: %s', (question, id) => {
    expect(search(question, CORPUS)[0].id).toBe(id);
  });
});

describe('operations', () => {
  it('locks shared state and conflicts on separate state', () => {
    const cloud = new Set();
    const shared = new Set();
    const lock = { holder: null };
    expect(applyTerraform(cloud, shared, lock, 'a').status).toBe('applied');
    expect(applyTerraform(cloud, shared, lock, 'b').status).toBe('locked');
    expect(applyTerraform(cloud, new Set(), null, 'b').status).toBe('conflict');
  });

  it('computes the documented error budget and burn rate', () => {
    const { data } = sloAlerts({ slo: 99.9, errorPct: 2, incidentMin: 60 });
    expect(data.budgetMin).toBe(43.2);
    expect(data.burnRate).toBe(20);
    expect(data.action).toBe('Page someone now');
  });

  it('reports a route for private egress', () => {
    expect(route({ externalIp: false, pga: true, nat: false }, 'storage.googleapis.com').via).toBe('Private Google Access');
    expect(route({ externalIp: false, pga: false, nat: false }, 'api.github.com (internet)').ok).toBe(false);
  });
});
