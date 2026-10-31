// Runs every demo's self-test and every "Do it wrong" action in Node (jsdom), exactly as the
// "Run all demos" page does in the browser, and fails on any failed self-check.
import { describe, expect, it } from 'vitest';
import { DEMOS } from '../demos/catalog.js';
import { defaultInputs } from '../components/DemoView.jsx';
import { runAction, runTest } from '../api.js';

const failed = (result) => result.checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.detail}`);

describe('every demo passes its own checks', () => {
  it.each(DEMOS.map((d) => [d.id, d]))('%s', async (_, demo) => {
    const result = await runTest(demo, defaultInputs(demo));
    expect(result.demo).toBe(demo.id);
    expect(result.commands.length).toBeGreaterThan(0);
    expect(result.checks.length).toBeGreaterThan(0);
    expect(failed(result)).toEqual([]);
  });

  it.each(DEMOS.flatMap((d) => d.actions.map((a) => [`${d.id} → ${a.id}`, d, a])))('action %s passes its checks', async (_, demo, action) => {
    const result = await runAction(action, defaultInputs(demo));
    expect(result.checks.length).toBeGreaterThan(0);
    expect(failed(result)).toEqual([]);
  });

  it.each(DEMOS.map((d) => [d.id, d]))('%s clamps hostile inputs', async (_, demo) => {
    const hostile = Object.fromEntries((demo.inputs || []).map((i) => [i.name, i.type === 'number' ? '1e9' : '<script>alert(1)</script>']));
    const result = await runTest(demo, hostile);
    expect(result.checks.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain('<script>');
  });
});
