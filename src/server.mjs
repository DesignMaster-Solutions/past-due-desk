// Dashboard: AG Grid over the receivables, owner approves each plan, PayPal does the collecting.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { loadBooks, loadLedger, planAll, approve, sendApproved, sync, rows } from './desk.mjs';

const PORT = Number(process.env.PORT || 8790);

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const books = await loadBooks();
  const json = async (fn) => {
    await fn();
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ business: books.business, rows: rows(books, await loadLedger()) }));
  };
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(await readFile(new URL('../public/index.html', import.meta.url)));
  }
  if (req.method === 'GET' && url.pathname === '/api/rows') return json(async () => {});
  if (req.method !== 'POST') { res.writeHead(404); return res.end(); }
  if (url.pathname === '/api/plan') return json(() => planAll(books));
  if (url.pathname === '/api/approve') return json(() => approve(url.searchParams.get('ref')));
  if (url.pathname === '/api/send') return json(() => sendApproved(books));
  if (url.pathname === '/api/sync') return json(() => sync());
  res.writeHead(404); res.end();
}

createServer((req, res) => handle(req, res).catch((e) => {
  res.writeHead(500, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: e.message }));
})).listen(PORT, () => console.log(`Past Due Desk on http://localhost:${PORT}`));
