import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timeline } from '../src/timeline.mjs';

const DAY = 86400000;
const now = Date.parse('2026-11-09T12:00:00Z');
const sent = now - 8 * DAY;
const at = (days) => new Date(sent + days * DAY).toISOString();
const books = { receivables: [
  { ref: 'A', customer: 'Alpha', amount: 100, currency: 'USD', days_overdue: 30 },
  { ref: 'B', customer: 'Beta', amount: 50, currency: 'USD', days_overdue: 10 },
  { ref: 'C', customer: 'Gamma', amount: 80, currency: 'USD', days_overdue: 20 },
] };
const plan = { send_invoice: true, strategy: 'firm_reminder', due_in_days: 7, discount_pct: 0 };
// kind@days-from-now per account, so each test reads like the timeline it draws
const lane = (t, ref) => t.events.filter((e) => e.resourceId === ref).map((e) => `${e.kind}@${Math.round((Date.parse(e.startDate) - now) / DAY)}`);

test('a sent invoice shows the due date, reminders from the policy and the hand-back to the owner', () => {
  const ledger = { A: { plan, sent_at: at(0), invoice: { status: 'SENT' }, reminders: [at(7)] } };
  const t = timeline(books, ledger, now);
  assert.deepEqual(lane(t, 'A'), ['overdue@-30', 'due@-1', 'reminder@-1', 'reminder-planned@6', 'owner@13']);
  assert.equal(t.resources.find((r) => r.id === 'A').status, 'SENT');
});

test('a dispute goes straight to the owner; an unplanned account is only its overdue bar', () => {
  const ledger = { B: { plan: { ...plan, send_invoice: false, strategy: 'escalate_to_owner' } } };
  const t = timeline(books, ledger, now);
  assert.deepEqual(lane(t, 'B'), ['overdue@-10', 'owner@0']);
  assert.deepEqual(lane(t, 'C'), ['overdue@-20']);
});

test('a paid invoice is closed, never chased; a split plan names the first payment', () => {
  const ledger = { C: { plan: { ...plan, strategy: 'split_payment', min_partial_amount: 20 }, sent_at: at(0), invoice: { status: 'PAID' } } };
  const t = timeline(books, ledger, now);
  assert.deepEqual(lane(t, 'C'), ['overdue@-20', 'due@-1', 'closed@0']);
  assert.match(t.events.find((e) => e.resourceId === 'C' && e.kind === 'due').name, /First payment USD 20/);
});
