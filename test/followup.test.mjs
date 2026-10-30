import { test } from 'node:test';
import assert from 'node:assert/strict';
import { followUpDue } from '../src/desk.mjs';

const DAY = 86400000;
const sent = Date.parse('2026-10-28T12:00:00Z');
const row = (status, reminders = []) => ({ invoice: { status }, sent_at: new Date(sent).toISOString(), reminders });

test('unpaid invoice gets a reminder only after the policy interval', () => {
  assert.equal(followUpDue(row('SENT'), sent + 6 * DAY), null);
  assert.equal(followUpDue(row('SENT'), sent + 7 * DAY), 'remind');
  assert.equal(followUpDue(row('PARTIALLY_PAID'), sent + 8 * DAY), 'remind');
});

test('interval counts from the last reminder, then the owner takes over', () => {
  const one = [new Date(sent + 7 * DAY).toISOString()];
  assert.equal(followUpDue(row('SENT', one), sent + 10 * DAY), null);
  assert.equal(followUpDue(row('SENT', one), sent + 14 * DAY), 'remind');
  const two = [...one, new Date(sent + 14 * DAY).toISOString()];
  assert.equal(followUpDue(row('SENT', two), sent + 21 * DAY), 'owner');
});

test('paid, cancelled, escalated or unsent accounts are never chased', () => {
  for (const s of ['PAID', 'MARKED_AS_PAID', 'CANCELLED']) assert.equal(followUpDue(row(s), sent + 30 * DAY), null);
  assert.equal(followUpDue({ plan: { send_invoice: false } }, sent + 30 * DAY), null);
  assert.equal(followUpDue(undefined), null);
});
