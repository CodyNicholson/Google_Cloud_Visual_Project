import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App.jsx';
import { DEMOS } from '../demos/catalog.js';
import { VISUALS } from '../visuals/index.js';

describe('app', () => {
  it('opens on the overview page', () => {
    window.location.hash = '';
    render(<App />);
    expect(screen.getAllByText(/Overview/).length).toBeGreaterThan(0);
  });

  it('renders the pitfalls page', () => {
    window.location.hash = 'pitfalls';
    render(<App />);
    expect(screen.getByRole('heading', { level: 2, name: /Mistakes, errors and fixes/ })).toBeInTheDocument();
  });

  it.each(DEMOS.map((d) => [d.id, d]))('%s page renders', (id, demo) => {
    window.location.hash = id;
    render(<App />);
    expect(screen.getByRole('heading', { level: 2, name: demo.title })).toBeInTheDocument();
  });
});

describe('visuals', () => {
  it.each(Object.entries(VISUALS))('%s renders with no result yet', (_, Visual) => {
    const demo = DEMOS.find((d) => VISUALS[d.visual] === Visual);
    const { container } = render(<Visual demo={demo} result={null} history={[]} inputs={{}} run={() => {}} busy={null} />);
    expect(container).toBeTruthy();
  });
});

describe('visuals draw real results', () => {
  it.each(DEMOS.flatMap((d) => d.actions.map((a) => [`${d.id} → ${a.id}`, d, a])))('%s', async (_, demo, action) => {
    const { runAction } = await import('../api.js');
    const { defaultInputs } = await import('../components/DemoView.jsx');
    const inputs = defaultInputs(demo);
    const result = { ...(await runAction(action, inputs)), receivedAt: 1 };
    const Visual = VISUALS[demo.visual];
    const { container } = render(<Visual demo={demo} result={result} history={[result]} inputs={inputs} run={() => {}} busy={null} />);
    expect(container.textContent.length).toBeGreaterThan(20);
  });
});
