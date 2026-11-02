// Turns the desk's /api/rows into the board's one table: per account, what was owed, what the plan aims to collect,
// what came back and what is still out, in plain words. Pure, so it is unit-tested without React or AG Studio.
export const AGING = ['1-30 days', '31-60 days', '61-90 days', '90+ days'];

const PLAN = {
  friendly_nudge: 'Friendly nudge',
  firm_reminder: 'Firm reminder',
  split_payment: 'Split payment',
  settlement_discount: 'Settlement offer',
  escalate_to_owner: 'Hand to owner',
};

const round2 = (n) => Math.round(n * 100) / 100;
const bucket = (d) => AGING[d <= 30 ? 0 : d <= 60 ? 1 : d <= 90 ? 2 : 3];

function stage(r) {
  if (r.follow_up === 'owner') return `Back to you after ${r.reminders} reminders`;
  switch (r.status) {
    case 'NEW': return 'Waiting for a plan';
    case 'PLANNED': return r.approved ? 'Approved, ready to send' : 'Plan ready for you';
    case 'NEEDS_OWNER': return 'Needs you';
    case 'PARTIALLY_PAID': return 'Paying in parts';
    case 'PAID': return 'Paid';
    default: return 'Invoice sent'; // SENT, UNPAID and PayPal's other open states
  }
}

export function toAccounts(rows) {
  return rows.map((r) => {
    const owed = Number(r.amount) || 0;
    const target = round2(owed * (1 - (Number(r.discount_pct) || 0) / 100));
    const recovered = Number(r.paid) || 0;
    const s = stage(r);
    return {
      ref: r.ref,
      customer: r.customer,
      currency: r.currency,
      daysOverdue: r.days_overdue,
      agingBucket: bucket(r.days_overdue),
      plan: PLAN[r.strategy] || 'Not planned yet',
      stage: s,
      owed,
      target,
      recovered,
      stillOwed: r.status === 'PAID' ? 0 : Math.max(0, round2(target - recovered)),
      forgiven: round2(owed - target),
      progress: target > 0 ? Math.min(1, recovered / target) : 0,
      reminders: r.reminders || 0,
      needsYou: s === 'Needs you' || s === 'Plan ready for you' || r.follow_up === 'owner' ? 1 : 0,
    };
  });
}
