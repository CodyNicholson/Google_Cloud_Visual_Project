import { describe, expect, it } from 'vitest';
import { ALL_SERVICES, ATLAS, searchServices } from '../kb/services.js';
import { LEARNING_PATH, PATTERNS } from '../kb/patterns.js';
import { DEMOS } from '../demos/catalog.js';
import { VISUALS } from '../visuals/index.js';

const demoIds = new Set(DEMOS.map((d) => d.id));

describe('service atlas', () => {
  it('covers the platform', () => {
    expect(ATLAS.length).toBeGreaterThanOrEqual(10);
    expect(ALL_SERVICES.length).toBeGreaterThanOrEqual(150);
  });

  it('has unique names and describes every service', () => {
    expect(new Set(ALL_SERVICES.map((s) => s.name)).size).toBe(ALL_SERVICES.length);
    ALL_SERVICES.forEach((s) => expect(s.what.length, s.name).toBeGreaterThan(8));
  });

  it('links only to demos that exist', () => {
    ALL_SERVICES.filter((s) => s.page).forEach((s) => expect(demoIds.has(s.page), `${s.name} → ${s.page}`).toBe(true));
  });

  it.each([
    ['Lambda', 'Cloud Run functions'], ['DynamoDB', 'Firestore'], ['S3', 'Cloud Storage'], ['Dataproc', 'Managed Service for Apache Spark'],
    ['Vertex AI', 'Gemini Enterprise Agent Platform'], ['Cloud Composer', 'Managed Service for Apache Airflow'], ['Key Vault', 'Secret Manager'],
  ])('finds %s → %s', (query, name) => {
    expect(searchServices(query).map((s) => s.name)).toContain(name);
  });

  it('flags retired products', () => {
    const status = (n) => ALL_SERVICES.find((s) => s.name === n).status;
    expect(status('Container Registry')).toBe('shutdown');
    expect(status('Cloud Source Repositories')).toBe('closed');
    expect(status('Cloud Deployment Manager')).toBe('ending');
  });

  it('filters by category', () => {
    expect(searchServices('', 'media').every((s) => s.category === 'media')).toBe(true);
  });
});

describe('blueprints', () => {
  it.each(PATTERNS.map((p) => [p.id, p]))('%s is drawable and complete', (_, p) => {
    const ids = new Set(p.nodes.map((n) => n.id));
    p.edges.forEach((e) => {
      expect(ids.has(e.from), e.from).toBe(true);
      expect(ids.has(e.to), e.to).toBe(true);
    });
    p.pages.forEach((id) => expect(demoIds.has(id), id).toBe(true));
    expect(p.steps.length).toBeGreaterThan(2);
    expect(p.avoid).toBeTruthy();
  });

  it('every learning path step links to a demo', () => {
    LEARNING_PATH.flatMap((s) => s.pages).forEach((id) => expect(demoIds.has(id), id).toBe(true));
  });

  it('every visual is used', () => {
    const used = new Set(DEMOS.map((d) => d.visual));
    Object.keys(VISUALS).forEach((v) => expect(used.has(v), v).toBe(true));
  });
});
