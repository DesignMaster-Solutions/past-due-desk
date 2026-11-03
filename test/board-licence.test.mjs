// The AG Studio licence lives only in the host's env: the server writes it into the board page at request time,
// so neither the public repo nor the built bundle ever carries it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

async function boardHtml(t, env) {
  const port = 19000 + Math.floor(Math.random() * 1000);
  const srv = spawn(process.execPath, ['src/server.mjs'], { env: { ...process.env, AG_STUDIO_LICENSE: '', ...env, PORT: String(port), STATE_FILE: 'state/test-licence.json' } });
  t.after(() => srv.kill());
  await new Promise((ok, fail) => { srv.stdout.on('data', (b) => String(b).includes('Past Due Desk on') && ok()); srv.on('exit', fail); });
  return (await fetch(`http://localhost:${port}/board`)).text();
}

test('the licence from AG_STUDIO_LICENSE reaches the board before its bundle, escaped', async (t) => {
  const html = await boardHtml(t, { AG_STUDIO_LICENSE: 'Trial_key[v3]</script><b>' });
  const at = html.indexOf('window.AG_STUDIO_LICENSE=');
  assert.ok(at > 0, 'licence script present');
  assert.ok(at < html.indexOf('/board/assets/index-'), 'set before the bundle loads');
  assert.ok(html.includes('"Trial_key[v3]\\u003c/script>\\u003cb>"'), 'value is JSON with < escaped');
  assert.ok(!html.includes('</script><b>'), 'no way to close the script tag early');
});

test('without the env var the board page is the built file, untouched', async (t) => {
  const html = await boardHtml(t, {});
  assert.equal(html, readFileSync('public/board/index.html', 'utf8'));
});

test('the built bundle reads the licence from the page, and the repo never holds one', () => {
  const js = readdirSync('public/board/assets').filter((f) => f.endsWith('.js'));
  assert.ok(js.some((f) => readFileSync(`public/board/assets/${f}`, 'utf8').includes('AG_STUDIO_LICENSE')), 'bundle reads window.AG_STUDIO_LICENSE');
  assert.match(readFileSync('studio/src/main.jsx', 'utf8'), /window\.AG_STUDIO_LICENSE/);
});
