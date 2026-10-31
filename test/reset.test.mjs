import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

process.env.STATE_FILE = (await mkdtemp(tmpdir() + '/pdd-')) + '/ledger.json';
const { loadLedger, reset } = await import('../src/desk.mjs');

test('reset empties the ledger so the next judge starts from the sample books', async () => {
  await writeFile(process.env.STATE_FILE, JSON.stringify({ 'X-1': { plan: { strategy: 'friendly_nudge' }, approved: true } }));
  assert.equal((await loadLedger())['X-1'].approved, true);
  await reset();
  assert.deepEqual(await loadLedger(), {});
  assert.equal(await readFile(process.env.STATE_FILE, 'utf8'), '{}');
});
