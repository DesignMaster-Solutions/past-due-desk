import test from 'node:test';
import assert from 'node:assert/strict';
import { installments, planRequest, autopayAction } from '../src/autopay.mjs';

const debtor = { ref: 'HL-1037', customer: 'Northside Auto Repair', amount: 1450, currency: 'USD' };

test('parts add up to the debt to the cent, none below the plan minimum, first part takes the leftover cents', () => {
  assert.deepEqual(installments(debtor, { strategy: 'split_payment', min_partial_amount: 500 }), { count: 2, first: '725.00', rest: '725.00', currency: 'USD' });
  const p = installments({ ...debtor, amount: 1000 }, { strategy: 'split_payment', min_partial_amount: 300 });
  assert.equal(p.count, 3);
  assert.equal(p.first, '333.34');
  assert.equal(p.rest, '333.33');
  assert.equal(Math.round((Number(p.first) + Number(p.rest) * (p.count - 1)) * 100), 100000);
});

test('no autopay unless the approved plan is a real split', () => {
  assert.equal(installments(debtor, { strategy: 'friendly_nudge', min_partial_amount: 0 }), null);
  assert.equal(installments(debtor, { strategy: 'split_payment', min_partial_amount: 0 }), null);
  assert.equal(installments(debtor, { strategy: 'split_payment', min_partial_amount: 100 }).count, 6); // capped
});

test('plan request: one priced trial cycle for the first part, then the rest monthly, and the plan ends', () => {
  const body = planRequest('PROD-1', debtor, installments({ ...debtor, amount: 1450 }, { strategy: 'split_payment', min_partial_amount: 450 }));
  assert.equal(body.billingCycles.length, 2);
  assert.deepEqual(body.billingCycles.map((c) => [c.tenureType, c.sequence, c.totalCycles, c.pricingScheme.fixedPrice.value]),
    [['TRIAL', 1, 1, '483.34'], ['REGULAR', 2, 2, '483.33']]);
  assert.equal(body.paymentPreferences.autoBillOutstanding, true);
});

test('the debt is never collected twice: whichever the customer picked first stops the other', () => {
  const row = (inv, sub, withdrawn) => ({ invoice: { status: inv }, autopay: { id: 'I-1', status: sub, withdrawn } });
  assert.equal(autopayAction(row('SENT', 'ACTIVE')), 'cancel_invoice');
  assert.equal(autopayAction(row('PARTIALLY_PAID', 'APPROVAL_PENDING')), 'withdraw'); // PayPal cannot cancel what was never approved
  assert.equal(autopayAction(row('PAID', 'APPROVAL_PENDING', true)), null); // already withdrawn
  assert.equal(autopayAction(row('PAID', 'ACTIVE', true)), 'cancel_subscription'); // approved the stale link after paying
  assert.equal(autopayAction(row('PARTIALLY_PAID', 'ACTIVE')), 'cancel_subscription');
  assert.equal(autopayAction(row('SENT', 'APPROVAL_PENDING')), null);
  assert.equal(autopayAction(row('CANCELLED', 'ACTIVE')), null);
  assert.equal(autopayAction({ invoice: { status: 'SENT' } }), null);
});
