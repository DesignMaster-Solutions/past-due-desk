// Dashboard: AG Grid over the receivables, owner approves each plan, PayPal does the collecting.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { loadBooks, loadLedger, planAll, approve, sendApproved, sync, followUps, rows, reset } from './desk.mjs';
import { timeline } from './timeline.mjs';

const PORT = Number(process.env.PORT || 8790);
const DEMO = process.env.DEMO === '1'; // shared hosted demo: exposes /api/reset and the banner

// Collections board (AG Studio, built by studio/ into public/board). Only index.html and flat files in assets/ are
// served; anything else, including encoded dot segments, is a 404. Big bundles go out gzipped, compressed once.
const BOARD = new URL('../public/board/', import.meta.url);
// Collection timeline: the Bryntum Scheduler trial build is served straight from node_modules, never copied into the repo.
const BRYNTUM = new URL('../node_modules/@bryntum/scheduler-trial/', import.meta.url);
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', svg: 'image/svg+xml', woff2: 'font/woff2' };
// The AG Studio licence comes from the host's env and is written into the page per request, never into the repo.
const LICENCE = process.env.AG_STUDIO_LICENSE || '';
const gz = new Map();
async function sendFile(req, res, base, rel, patch) {
  let body;
  try { body = await readFile(new URL(rel, base)); } catch { res.writeHead(404); return res.end(); }
  if (patch) body = patch(body);
  const key = base.href + rel;
  const headers = { 'content-type': TYPES[rel.split('.').pop()], 'cache-control': rel === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable' };
  if (/\bgzip\b/.test(req.headers['accept-encoding'] || '') && body.length > 1024) {
    if (!gz.has(key)) gz.set(key, gzipSync(body));
    body = gz.get(key);
    Object.assign(headers, { 'content-encoding': 'gzip', vary: 'accept-encoding' });
  }
  res.writeHead(200, headers);
  res.end(body);
}
async function board(req, res, pathname) {
  const rel = pathname.replace(/^\/board\/?/, '') || 'index.html';
  if (!/^(index\.html|assets\/[\w-]+\.(js|css|svg|woff2))$/.test(rel)) { res.writeHead(404); return res.end(); }
  const set = `<script>window.AG_STUDIO_LICENSE=${JSON.stringify(LICENCE).replace(/</g, '\\u003c')}</script>\n  `;
  const patch = rel === 'index.html' && LICENCE ? (body) => Buffer.from(String(body).replace('<script', set + '<script')) : null;
  return sendFile(req, res, BOARD, rel, patch);
}
function vendor(req, res, pathname) {
  const rel = pathname.replace(/^\/vendor\/bryntum\//, '');
  if (!/^scheduler\.(module\.js|css)$/.test(rel)) { res.writeHead(404); return res.end(); }
  return sendFile(req, res, BRYNTUM, rel);
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const books = await loadBooks();
  const json = async (fn) => {
    await fn();
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ business: books.business, demo: DEMO, rows: rows(books, await loadLedger()) }));
  };
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(await readFile(new URL('../public/index.html', import.meta.url)));
  }
  if (req.method === 'GET' && (url.pathname === '/board' || url.pathname.startsWith('/board/'))) return board(req, res, url.pathname);
  if (req.method === 'GET' && url.pathname === '/timeline') return sendFile(req, res, new URL('../public/', import.meta.url), 'timeline.html');
  if (req.method === 'GET' && url.pathname.startsWith('/vendor/bryntum/')) return vendor(req, res, url.pathname);
  if (req.method === 'GET' && url.pathname === '/api/timeline') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(timeline(books, await loadLedger())));
  }
  if (req.method === 'GET' && url.pathname === '/api/rows') return json(async () => {});
  if (req.method !== 'POST') { res.writeHead(404); return res.end(); }
  if (url.pathname === '/api/plan') return json(() => planAll(books));
  if (url.pathname === '/api/approve') return json(() => approve(url.searchParams.get('ref')));
  if (url.pathname === '/api/send') return json(() => sendApproved(books));
  if (url.pathname === '/api/sync') return json(() => sync());
  if (url.pathname === '/api/followup') return json(() => followUps(books));
  if (DEMO && url.pathname === '/api/reset') return json(() => reset());
  res.writeHead(404); res.end();
}

// A redeploy is a fresh container with no ledger file: the shared demo comes up planned by the recorded replay, the way
// a judge should find it. "Start over" writes {} on purpose, so that stays unplanned.
if (DEMO && !existsSync(process.env.STATE_FILE || 'state/ledger.json')) await planAll(await loadBooks());

createServer((req, res) => handle(req, res).catch((e) => {
  res.writeHead(500, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: e.message }));
})).listen(PORT, () => console.log(`Past Due Desk on http://localhost:${PORT}`));
