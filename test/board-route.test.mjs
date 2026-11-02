// The desk server serves the built board from public/board, gzipped when asked, and nothing outside it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';

test('GET /board serves the AG Studio board, its assets gzipped, and refuses paths outside public/board', async (t) => {
  const port = 18000 + Math.floor(Math.random() * 1000);
  const srv = spawn(process.execPath, ['src/server.mjs'], { env: { ...process.env, PORT: String(port), STATE_FILE: 'state/test-board.json' } });
  t.after(() => srv.kill());
  await new Promise((ok, fail) => { srv.stdout.on('data', (b) => String(b).includes('Past Due Desk on') && ok()); srv.on('exit', fail); });
  const get = (p, h = {}) => fetch(`http://localhost:${port}${p}`, { headers: h });

  for (const p of ['/board', '/board/']) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.match(await r.text(), /\/board\/assets\/index-[\w-]+\.js/);
  }
  const js = readdirSync('public/board/assets').find((f) => f.endsWith('.js'));
  const r = await get(`/board/assets/${js}`, { 'accept-encoding': 'gzip' });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-encoding'), 'gzip');
  assert.match(r.headers.get('content-type'), /javascript/);
  assert.ok((await r.arrayBuffer()).byteLength > 1000); // fetch inflates it again

  for (const p of ['/board/../src/server.mjs', '/board/%2e%2e/src/server.mjs', '/board/assets/../../state/ledger.json', '/board/nope.js']) {
    assert.equal((await get(p)).status, 404, p);
  }
});
