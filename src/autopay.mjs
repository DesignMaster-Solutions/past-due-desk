// Autopay for a split: the customer approves once and PayPal collects each part on schedule.
// Built on the PayPal Server SDK (TypeScript) with APIMatic's PayPal Context Plugin; contract sheet in paypal-plan.md.
import { PaypalClient, IntervalUnit, TenureType } from 'paypal';
import { createProduct } from './paypal.mjs';

const MAX_PARTS = 6;

let client;
const sdk = () => (client ??= new PaypalClient({
  oauth2: { clientId: process.env.PAYPAL_CLIENT_ID, clientSecret: process.env.PAYPAL_CLIENT_SECRET },
  serverOptions: { baseUrl: process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com' },
}));

// Equal monthly parts no smaller than the plan's minimum; the first part carries the leftover cents. Pure.
export function installments(debtor, plan) {
  if (plan?.strategy !== 'split_payment' || !(plan.min_partial_amount > 0)) return null;
  const cents = Math.round(debtor.amount * 100);
  const count = Math.min(MAX_PARTS, Math.max(2, Math.floor(debtor.amount / plan.min_partial_amount)));
  const rest = Math.floor(cents / count);
  const fix = (c) => (c / 100).toFixed(2);
  return { count, first: fix(cents - rest * (count - 1)), rest: fix(rest), currency: debtor.currency };
}

export function planRequest(productId, debtor, parts) {
  const cycle = (tenureType, sequence, totalCycles, value) => ({
    frequency: { intervalUnit: IntervalUnit.Month, intervalCount: 1 }, tenureType, sequence, totalCycles,
    pricingScheme: { fixedPrice: { currencyCode: parts.currency, value } },
  });
  return {
    productId, name: `${debtor.ref} in ${parts.count} parts`,
    billingCycles: [cycle(TenureType.Trial, 1, 1, parts.first), cycle(TenureType.Regular, 2, parts.count - 1, parts.rest)],
    paymentPreferences: { autoBillOutstanding: true, paymentFailureThreshold: 1 },
  };
}

// What a sync must do so one debt is never collected through both the invoice and the subscription. Pure.
// PayPal answers 404 to a cancel while the customer has not approved yet (sandbox, 09/11), so a pending offer is
// withdrawn on our side and cancelled for real only if the customer approves the stale link later.
export function autopayAction(row) {
  if (!row?.autopay?.id) return null;
  const paidOnInvoice = ['PAID', 'PARTIALLY_PAID', 'MARKED_AS_PAID'].includes(row.invoice.status);
  if (row.autopay.status === 'ACTIVE') {
    if (paidOnInvoice || row.autopay.withdrawn) return 'cancel_subscription';
    return ['SENT', 'UNPAID'].includes(row.invoice.status) ? 'cancel_invoice' : null;
  }
  if (paidOnInvoice && !row.autopay.withdrawn && ['APPROVAL_PENDING', 'APPROVED'].includes(row.autopay.status)) return 'withdraw';
  return null;
}

// key comes from the ledger claim, so a retry after a lost reply joins the same PayPal resources instead of making new ones.
export async function createAutopay(debtor, parts, business, key, returnUrl) {
  const product = await createProduct(`${business}: ${debtor.description}`, `${key}-product`);
  const plan = await sdk().subscriptions.createBillingPlan({ payPalRequestId: `${key}-plan`, body: planRequest(product.id, debtor, parts) });
  const sub = await sdk().subscriptions.createSubscription({
    payPalRequestId: `${key}-sub`,
    body: {
      planId: plan.id, customId: debtor.ref, subscriber: { emailAddress: debtor.email },
      applicationContext: { brandName: business.slice(0, 127), returnUrl, cancelUrl: returnUrl },
    },
  });
  return { id: sub.id, plan_id: plan.id, status: sub.status, approve_url: sub.links?.find((l) => l.rel === 'approve')?.href || '' };
}

export async function autopayStatus(id) {
  return (await sdk().subscriptions.getSubscription({ id })).status;
}

export async function cancelAutopay(id, reason) {
  await sdk().subscriptions.cancelSubscription({ id, body: { reason } });
}
