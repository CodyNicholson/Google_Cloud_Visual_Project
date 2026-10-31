import { describe, expect, it } from 'vitest';
import { CATEGORIES, DEMOS, NODE_META, NODE_ORDER, nodesFor } from '../demos/catalog.js';
import { OVERVIEW } from '../demos/guide.js';
import { VISUALS } from '../visuals/index.js';
import { defaultInputs } from '../components/DemoView.jsx';

const validSteps = (steps) => steps.every(([from, to, label]) => NODE_META[from] && NODE_META[to] && typeof label === 'string' && label.length > 0);

describe('demo catalog', () => {
  it('has unique ids', () => {
    expect(new Set(DEMOS.map((d) => d.id)).size).toBe(DEMOS.length);
  });

  it('orders every node', () => {
    Object.keys(NODE_META).forEach((id) => expect(NODE_ORDER).toContain(id));
  });

  it('covers the platform in 4–8 categories', () => {
    expect(CATEGORIES.length).toBeGreaterThanOrEqual(4);
    expect(CATEGORIES.length).toBeLessThanOrEqual(8);
    expect(DEMOS.length).toBeGreaterThanOrEqual(20);
  });

  it.each(DEMOS.map((d) => [d.id, d]))('%s is complete', (_, demo) => {
    expect(CATEGORIES).toContain(demo.category);
    expect(demo.title).toBeTruthy();
    expect(demo.tagline).toBeTruthy();
    expect(demo.description.length).toBeGreaterThanOrEqual(2);
    expect(demo.actions.length).toBeGreaterThan(0);
    expect(VISUALS[demo.visual]).toBeTypeOf('function');
    expect(demo.actions.map((a) => a.id)).toContain(demo.test.action);
    expect(demo.snippet?.code.length).toBeGreaterThan(40);
    expect(demo.keyApis.length).toBeGreaterThan(1);
    expect(validSteps(demo.flow)).toBe(true);
    // The diagram fits five participants across
    expect(nodesFor(demo.flow).length).toBeLessThanOrEqual(5);
  });

  it.each(DEMOS.map((d) => [d.id, d]))('%s explains its common mistakes', (_, demo) => {
    expect(demo.pitfalls?.length).toBeGreaterThan(0);
    demo.pitfalls.forEach((p) => {
      ['mistake', 'symptom', 'why', 'fix', 'avoid'].forEach((field) => expect(p[field], `${demo.id}: ${field}`).toBeTruthy());
      expect(p.source?.url || p.source?.file, `${demo.id}: ${p.mistake} has a source`).toBeTruthy();
      if (p.reproduce) expect(demo.actions.map((a) => a.id)).toContain(p.reproduce);
    });
  });

  it.each(DEMOS.map((d) => [d.id, d]))('%s actions build valid flows and run in the browser', (_, demo) => {
    const inputs = defaultInputs(demo);
    demo.actions.forEach((action) => {
      expect(action.label).toBeTruthy();
      expect(action.run).toBeTypeOf('function');
      if (action.flow) {
        expect(validSteps(action.flow(inputs))).toBe(true);
        expect(nodesFor(action.flow(inputs)).length).toBeLessThanOrEqual(5);
      }
    });
  });

  it('most demos reproduce a mistake for real', () => {
    const withGhost = DEMOS.filter((d) => d.actions.some((a) => a.tone === 'ghost'));
    expect(withGhost.length).toBeGreaterThanOrEqual(DEMOS.length - 3);
  });

  it('every category has demos', () => {
    CATEGORIES.forEach((category) => expect(DEMOS.some((d) => d.category === category)).toBe(true));
  });

  it('orders flow participants left to right', () => {
    const [first, last] = [NODE_ORDER[0], NODE_ORDER[NODE_ORDER.length - 1]];
    expect(nodesFor([[last, first, 'x']])).toEqual([first, last]);
  });

  it('has an overview with steps, pros, cons, anti-patterns and troubleshooting', () => {
    expect(OVERVIEW.steps.length).toBeGreaterThan(0);
    expect(OVERVIEW.pros.length).toBeGreaterThan(0);
    expect(OVERVIEW.cons.length).toBeGreaterThan(0);
    expect(OVERVIEW.antiPatterns.length).toBeGreaterThanOrEqual(4);
    expect(OVERVIEW.troubleshooting.length).toBeGreaterThanOrEqual(5);
    OVERVIEW.antiPatterns.forEach((a) => expect(a.dont && a.why && a.instead).toBeTruthy());
    OVERVIEW.troubleshooting.forEach((t) => expect(t.mistake && t.symptom && t.fix && t.avoid).toBeTruthy());
  });
});
