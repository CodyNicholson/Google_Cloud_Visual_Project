import React, { useState } from 'react';
import { DEMOS } from '../demos/catalog.js';
import { runTest } from '../api.js';
import { defaultInputs } from './DemoView.jsx';
import { formatMs } from './common.jsx';

/**
 * Runs every demo's self-test in this browser, one after another, and shows which checks passed.
 * Each check verifies the behaviour its page explains, using this lab’s simulations.
 */
export default function TestRunner({ results, setResults, onOpen }) {
  const [running, setRunning] = useState(false);

  const runAll = async () => {
    setRunning(true);
    window.__labSuiteDone = false;
    const summary = [];
    setResults({});
    for (const demo of DEMOS) {
      setResults((prev) => ({ ...prev, [demo.id]: { status: 'running' } }));
      try {
        const result = await runTest(demo, defaultInputs(demo));
        const ok = result.checks.every((c) => c.passed);
        summary.push({ id: demo.id, status: ok ? 'pass' : 'fail', checks: result.checks, ms: result.elapsedMs });
        setResults((prev) => ({ ...prev, [demo.id]: { status: ok ? 'pass' : 'fail', result } }));
      } catch (error) {
        summary.push({ id: demo.id, status: 'fail', error: error.message, checks: [] });
        setResults((prev) => ({ ...prev, [demo.id]: { status: 'fail', error: error.message } }));
      }
    }
    setRunning(false);
    // Read by the headless-browser check in the README
    window.__labSuite = summary;
    window.__labSuiteDone = true;
  };

  const done = Object.values(results).filter((r) => r.status === 'pass' || r.status === 'fail');
  const passed = done.filter((r) => r.status === 'pass').length;
  const checks = done.reduce((sum, r) => sum + (r.result?.checks.length || 0), 0);
  const checksPassed = done.reduce((sum, r) => sum + (r.result?.checks.filter((c) => c.passed).length || 0), 0);

  return (
    <article className="demo">
      <header className="demo-head">
        <span className="chip">Self-test suite</span>
        <h2>Run every demo</h2>
        <p className="tagline">{DEMOS.length} demos, each running in your browser and checking its own result</p>
      </header>
      <section className="card">
        <p>
          Each demo runs a simulation of documented Google Cloud behaviour in this page, then checks its own
          result. This button runs them all in order. The Vitest suite runs the same self-tests in the Docker build.
        </p>
        <div className="actions">
          <button type="button" className="btn btn-accent" disabled={running} onClick={runAll}>
            {running && <span className="spinner" aria-hidden="true" />}
            {running ? 'Running…' : 'Run all demos'}
          </button>
          {done.length > 0 && (
            <span className={`pill ${passed === done.length ? 'pill-ok' : 'pill-bad'}`}>
              <span data-testid="suite-summary">{passed}/{done.length} demos · {checksPassed}/{checks} checks passed</span>
            </span>
          )}
        </div>
      </section>
      <section className="card">
        <div className="table-wrap"><table className="suite" data-testid="suite-table">
          <thead><tr><th>demo</th><th>self-test</th><th>status</th><th>checks</th><th>time</th></tr></thead>
          <tbody>
            {DEMOS.map((demo) => {
              const r = results[demo.id];
              return (
                <tr key={demo.id} data-demo={demo.id} data-status={r?.status || 'idle'} className={r ? `suite-${r.status}` : ''}>
                  <td><button type="button" className="link" onClick={() => onOpen(demo.id)}>{demo.title}</button></td>
                  <td><code>{demo.actions.find((a) => a.id === demo.test.action)?.label}{demo.test.inputs ? ` ${JSON.stringify(demo.test.inputs)}` : ''}</code></td>
                  <td>
                    {!r && <span className="muted">–</span>}
                    {r?.status === 'running' && <span className="spinner" aria-label="running" />}
                    {r?.status === 'pass' && <span className="ok">✓ pass</span>}
                    {r?.status === 'fail' && <span className="bad" title={r.error || r.result?.checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.detail}`).join('\n')}>✗ fail</span>}
                  </td>
                  <td>
                    {r?.result && (
                      <span title={r.result.checks.map((c) => `${c.passed ? '✓' : '✗'} ${c.name}: ${c.detail}`).join('\n')}>
                        {r.result.checks.filter((c) => c.passed).length}/{r.result.checks.length}
                      </span>
                    )}
                    {r?.error && <span className="bad">{r.error}</span>}
                  </td>
                  <td>{r?.result ? formatMs(r.result.elapsedMs) : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </section>
    </article>
  );
}
