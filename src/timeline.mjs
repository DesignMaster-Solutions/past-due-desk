// Collection timeline: one row per account, the agent's plan and the follow-up policy laid out in time.
// Pure, so the schedule the Bryntum Scheduler draws is testable without PayPal.
import { DEFAULT_POLICY } from './agent.mjs';

const DAY = 86400000;
const CHASED = ['SENT', 'UNPAID', 'PARTIALLY_PAID'];
const iso = (t) => new Date(t).toISOString();

export function timeline(books, ledger, now = Date.now(), policy = { ...DEFAULT_POLICY, ...books.policy }) {
  const resources = [];
  const events = [];
  const add = (ref, kind, name, start, end = start + DAY) =>
    events.push({ id: `${ref}:${kind}:${events.length}`, resourceId: ref, kind, name, startDate: iso(start), endDate: iso(end) });
  for (const d of books.receivables) {
    const r = ledger[d.ref] || {};
    const status = r.invoice?.status || (r.plan ? (r.plan.send_invoice ? 'PLANNED' : 'NEEDS_OWNER') : 'NEW');
    resources.push({ id: d.ref, name: d.customer, amount: d.amount, currency: d.currency, status, strategy: r.plan?.strategy || '' });
    add(d.ref, 'overdue', `${d.days_overdue} days overdue, ${d.currency} ${d.amount.toFixed(2)}`, now - d.days_overdue * DAY, now);
    if (!r.plan) continue;
    if (!r.plan.send_invoice) { add(d.ref, 'owner', 'Owner handles it (dispute)', now); continue; }
    const sent = r.sent_at ? Date.parse(r.sent_at) : now; // planned but not sent yet: as if sent today
    const label = r.plan.strategy === 'split_payment' ? `First payment ${d.currency} ${r.plan.min_partial_amount} due`
      : r.plan.discount_pct ? `Settle with ${r.plan.discount_pct}% off by` : 'PayPal invoice due';
    add(d.ref, r.sent_at ? 'due' : 'planned', label, sent + r.plan.due_in_days * DAY);
    if (r.invoice && !CHASED.includes(r.invoice.status)) { add(d.ref, 'closed', `${r.invoice.status} (as of last refresh)`, now); continue; }
    const reminders = r.reminders || [];
    reminders.forEach((t, i) => add(d.ref, 'reminder', `Reminder ${i + 1} sent`, Date.parse(t)));
    let last = Date.parse(reminders.at(-1) || iso(sent));
    for (let n = reminders.length + 1; n <= policy.max_follow_ups; n++) {
      last += policy.follow_up_every_days * DAY;
      add(d.ref, 'reminder-planned', `Reminder ${n} (planned)`, last);
    }
    add(d.ref, 'owner', 'Back to the owner', last + policy.follow_up_every_days * DAY);
  }
  return { resources, events, now: iso(now) };
}
