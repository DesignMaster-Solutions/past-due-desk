// The shared demo opens already planned after a redeploy (fresh container, no ledger file), by the recorded replay.
// A judge's "start over" writes {} and must stay unplanned so they can press Plan with AI themselves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

async function statuses(t, stateFile) {
  const port = 20000 + Math.floor(Math.random() * 1000);
  const env = { ...process.env, DEMO: '1', LLM_BACKEND: 'replay', PORT: String(port), STATE_FILE: stateFile };
  const srv = spawn(process.execPath, ['src/server.mjs'], { env });
  t.after(() => srv.kill());
  await new Promise((ok, fail) => { srv.stdout.on('data', (b) => String(b).includes('Past Due Desk on') && ok()); srv.on('exit', fail); });
  const { rows } = await (await fetch(`http://localhost:${port}/api/rows`)).json();
  return rows.map((r) => r.status);
}

test('a fresh demo container (no ledger file) comes up with the replayed plans', async (t) => {
  const s = await statuses(t, (await mkdtemp(tmpdir() + '/pdd-seed-')) + '/ledger.json');
  assert.equal(s.filter((x) => x === 'PLANNED').length, 3);
  assert.ok(s.includes('NEEDS_OWNER'));
});

test('after "start over" ({} on disk) the demo stays unplanned', async (t) => {
  const file = (await mkdtemp(tmpdir() + '/pdd-seed-')) + '/ledger.json';
  await writeFile(file, '{}');
  const s = await statuses(t, file);
  assert.ok(!s.includes('PLANNED') && !s.includes('NEEDS_OWNER'), s.join(','));
});
