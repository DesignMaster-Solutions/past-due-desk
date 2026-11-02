// Dashboard: AG Grid over the receivables, owner approves each plan, PayPal does the collecting.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { loadBooks, loadLedger, planAll, approve, sendApproved, sync, followUps, rows, reset } from './desk.mjs';

const PORT = Number(process.env.PORT || 8790);
const DEMO = process.env.DEMO === '1'; // shared hosted demo: exposes /api/reset and the banner

// Collections board (AG Studio, built by studio/ into public/board). Only index.html and flat files in assets/ are
// served; anything else, including encoded dot segments, is a 404. Big bundles go out gzipped, compressed once.
const BOARD = new URL('../public/board/', import.meta.url);
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', svg: 'image/svg+xml', woff2: 'font/woff2' };
const gz = new Map();
async function board(req, res, pathname) {
  const rel = pathname.replace(/^\/board\/?/, '') || 'index.html';
  if (!/^(index\.html|assets\/[\w-]+\.(js|css|svg|woff2))$/.test(rel)) { res.writeHead(404); return res.end(); }
  let body;
  try { body = await readFile(new URL(rel, BOARD)); } catch { res.writeHead(404); return res.end(); }
  const headers = { 'content-type': TYPES[rel.split('.').pop()], 'cache-control': rel === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable' };
  if (/\bgzip\b/.test(req.headers['accept-encoding'] || '') && body.length > 1024) {
    if (!gz.has(rel)) gz.set(rel, gzipSync(body));
    body = gz.get(rel);
    Object.assign(headers, { 'content-encoding': 'gzip', vary: 'accept-encoding' });
  }
  res.writeHead(200, headers);
  res.end(body);
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

createServer((req, res) => handle(req, res).catch((e) => {
  res.writeHead(500, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: e.message }));
})).listen(PORT, () => console.log(`Past Due Desk on http://localhost:${PORT}`));
