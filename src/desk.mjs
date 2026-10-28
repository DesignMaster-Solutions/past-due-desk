// Shared workflow for the CLI and the dashboard: plan -> owner approves -> PayPal invoice -> sync.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { planFor } from './agent.mjs';
import { createAndSendInvoice, getInvoice } from './paypal.mjs';

const STATE = process.env.STATE_FILE || 'state/ledger.json';

export async function loadBooks(file = process.env.BOOKS || 'data/receivables.json') {
  return JSON.parse(await readFile(file, 'utf8'));
}

export async function loadLedger() {
  try { return JSON.parse(await readFile(STATE, 'utf8')); } catch { return {}; }
}

async function save(ledger) {
  await mkdir(STATE.split('/').slice(0, -1).join('/') || '.', { recursive: true });
  await writeFile(STATE, JSON.stringify(ledger, null, 2));
}

export async function planAll(books, opts = {}) {
  const ledger = await loadLedger();
  for (const d of books.receivables) {
    if (ledger[d.ref]?.invoice) continue; // already sent, never re-plan a live invoice
    ledger[d.ref] = { plan: await planFor(d, { business: books.business, ...opts }), approved: false };
  }
  await save(ledger);
  return ledger;
}

export async function approve(ref) {
  const ledger = await loadLedger();
  if (!ledger[ref]) throw new Error(`no plan for ${ref}`);
  ledger[ref].approved = true;
  await save(ledger);
  return ledger[ref];
}

export async function sendApproved(books) {
  const ledger = await loadLedger();
  const sent = [];
  for (const d of books.receivables) {
    const row = ledger[d.ref];
    if (!row?.approved || row.invoice || !row.plan.send_invoice) continue;
    row.invoice = await createAndSendInvoice(d, row.plan, books.business);
    row.sent_at = new Date().toISOString();
    sent.push(d.ref);
    await save(ledger); // persist after each one so a failure never double-sends
  }
  return { sent, ledger };
}

export async function sync() {
  const ledger = await loadLedger();
  for (const row of Object.values(ledger)) if (row.invoice) row.invoice = await getInvoice(row.invoice.id);
  await save(ledger);
  return ledger;
}

// One row per receivable for the grid.
export function rows(books, ledger) {
  return books.receivables.map((d) => {
    const r = ledger[d.ref] || {};
    return {
      ref: d.ref, customer: d.customer, amount: d.amount, currency: d.currency, days_overdue: d.days_overdue,
      strategy: r.plan?.strategy || '', reason: r.plan?.reason || '', discount_pct: r.plan?.discount_pct ?? null,
      min_partial: r.plan?.min_partial_amount || null, due_in_days: r.plan?.due_in_days ?? null,
      corrections: (r.plan?.corrections || []).join('; '), approved: !!r.approved,
      status: r.invoice?.status || (r.plan ? (r.plan.send_invoice ? 'PLANNED' : 'NEEDS_OWNER') : 'NEW'),
      paid: r.invoice?.paid || null, payer_url: r.invoice?.payer_url || '', message: r.plan?.message || '',
    };
  });
}
