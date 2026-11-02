import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toAccounts, AGING } from '../studio/src/board-data.mjs';

const row = (o) => ({ ref: 'HL-1', customer: 'Acme', amount: 1000, currency: 'USD', days_overdue: 10, strategy: '', discount_pct: null,
  min_partial: null, approved: false, status: 'NEW', reminders: 0, follow_up: '', paid: null, ...o });

test('a settled invoice paid in full owes nothing and shows the forgiven discount, not a debt', () => {
  const [a] = toAccounts([row({ amount: 620, days_overdue: 91, strategy: 'settlement_discount', discount_pct: 10, status: 'PAID', paid: '558.00' })]);
  assert.equal(a.target, 558);
  assert.equal(a.recovered, 558);
  assert.equal(a.stillOwed, 0);
  assert.equal(a.forgiven, 62);
  assert.equal(a.progress, 1);
  assert.equal(a.plan, 'Settlement offer');
  assert.equal(a.stage, 'Paid');
  assert.equal(a.agingBucket, '90+ days');
});

test('a split plan part-paid keeps the rest as still owed', () => {
  const [a] = toAccounts([row({ amount: 1450, days_overdue: 64, strategy: 'split_payment', min_partial: 375, status: 'PARTIALLY_PAID', paid: '375.00' })]);
  assert.equal(a.stillOwed, 1075);
  assert.equal(a.stage, 'Paying in parts');
  assert.equal(a.agingBucket, '61-90 days');
  assert.equal(Math.round(a.progress * 100), 26);
});

test('stages and the needs-you flag follow the desk: unplanned, plan to approve, dispute, back to the owner after reminders', () => {
  const [fresh, ready, dispute, tired] = toAccounts([
    row({}),
    row({ strategy: 'friendly_nudge', status: 'PLANNED' }),
    row({ strategy: 'escalate_to_owner', status: 'NEEDS_OWNER' }),
    row({ strategy: 'firm_reminder', status: 'SENT', reminders: 2, follow_up: 'owner' }),
  ]);
  assert.deepEqual([fresh.stage, ready.stage, dispute.stage, tired.stage], ['Waiting for a plan', 'Plan ready for you', 'Needs you', 'Back to you after 2 reminders']);
  assert.deepEqual([fresh.needsYou, ready.needsYou, dispute.needsYou, tired.needsYou], [0, 1, 1, 1]);
  assert.equal(fresh.plan, 'Not planned yet');
  assert.equal(fresh.stillOwed, 1000);
});

test('aging buckets sort in order as text and cover every day count', () => {
  assert.deepEqual([...AGING].sort(), AGING);
  assert.deepEqual([1, 30, 31, 60, 61, 90, 91, 400].map((d) => toAccounts([row({ days_overdue: d })])[0].agingBucket),
    ['1-30 days', '1-30 days', '31-60 days', '31-60 days', '61-90 days', '61-90 days', '90+ days', '90+ days']);
});
