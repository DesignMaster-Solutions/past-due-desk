import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enforcePolicy, parsePlan, buildPrompt, DEFAULT_POLICY } from '../src/agent.mjs';
import { invoicePayload } from '../src/paypal.mjs';

const debtor = { ref: 'T-1', contact_name: 'Ana Maria Souza', email: 'a@example.com', description: 'Site', amount: 1000, currency: 'USD', days_overdue: 20 };

test('discount is refused before the policy age and capped after it', () => {
  const early = enforcePolicy({ strategy: 'settlement_discount', discount_pct: 8, due_in_days: 7 }, debtor);
  assert.equal(early.discount_pct, 0);
  const late = enforcePolicy({ strategy: 'settlement_discount', discount_pct: 40, due_in_days: 7 }, { ...debtor, days_overdue: 90 });
  assert.equal(late.discount_pct, DEFAULT_POLICY.max_discount_pct);
  assert.ok(late.corrections.some((c) => c.startsWith('discount_pct')));
});

test('split payment floor, due window and unknown strategy', () => {
  const p = enforcePolicy({ strategy: 'split_payment', min_partial_amount: 50, due_in_days: 90 }, debtor);
  assert.equal(p.min_partial_amount, 250);
  assert.equal(p.due_in_days, 30);
  assert.equal(enforcePolicy({ strategy: 'sue_them' }, debtor).strategy, 'escalate_to_owner');
});

test('escalation never sends an invoice', () => {
  assert.equal(enforcePolicy({ strategy: 'escalate_to_owner' }, debtor).send_invoice, false);
  assert.equal(enforcePolicy({ strategy: 'friendly_nudge', due_in_days: 5 }, debtor).send_invoice, true);
});

test('parsePlan tolerates prose around the JSON', () => {
  assert.equal(parsePlan('Sure:\n```json\n{"strategy":"firm_reminder"}\n```').strategy, 'firm_reminder');
  assert.throws(() => parsePlan('no json here'));
});

test('prompt is deterministic so replay fixtures match', () => {
  assert.equal(buildPrompt(debtor, DEFAULT_POLICY, 'X'), buildPrompt(debtor, DEFAULT_POLICY, 'X'));
});

test('invoice payload carries discount and partial payment', () => {
  const body = invoicePayload(debtor, { strategy: 'split_payment', discount_pct: 5, min_partial_amount: 250, due_in_days: 7, invoice_note: 'n' }, 'Biz');
  assert.equal(body.items[0].unit_amount.value, '1000.00');
  assert.deepEqual(body.items[0].discount, { percent: '5' });
  assert.equal(body.configuration.partial_payment.minimum_amount_due.value, '250.00');
  assert.equal(body.primary_recipients[0].billing_info.name.surname, 'Maria Souza');
});
