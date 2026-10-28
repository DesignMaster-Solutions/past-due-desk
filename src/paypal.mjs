// Thin client for the PayPal REST APIs used here: OAuth2 + Invoicing v2 (sandbox by default).
const BASE = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';

let cached = { token: null, exp: 0 };

export async function token({ clientId = process.env.PAYPAL_CLIENT_ID, secret = process.env.PAYPAL_CLIENT_SECRET } = {}) {
  if (cached.token && Date.now() < cached.exp) return cached.token;
  if (!clientId || !secret) throw new Error('PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required (sandbox app credentials)');
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${clientId}:${secret}`).toString('base64') },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`PayPal OAuth failed: ${res.status} ${body.error_description || ''}`);
  cached = { token: body.access_token, exp: Date.now() + (body.expires_in - 60) * 1000 };
  return cached.token;
}

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const detail = (json.details || []).map((d) => `${d.field || ''} ${d.issue || ''} ${d.description || ''}`.trim()).join('; ');
    throw new Error(`PayPal ${method} ${path} -> ${res.status} ${json.name || ''} ${detail || json.message || ''}`.trim());
  }
  return { json, debugId: res.headers.get('paypal-debug-id') };
}

const money = (value, currency) => ({ currency_code: currency, value: Number(value).toFixed(2) });

// Builds the Invoicing v2 payload from a debtor and the plan the agent approved.
export function invoicePayload(debtor, plan, business) {
  const due = new Date(Date.now() + plan.due_in_days * 86400000).toISOString().slice(0, 10);
  const [given, ...rest] = debtor.contact_name.split(' ');
  const payload = {
    detail: {
      currency_code: debtor.currency,
      reference: debtor.ref,
      note: plan.invoice_note,
      memo: `Past Due Desk plan: ${plan.strategy}`,
      payment_term: { due_date: due },
    },
    invoicer: { business_name: business },
    primary_recipients: [{ billing_info: { email_address: debtor.email, name: { given_name: given, surname: rest.join(' ') || given } } }],
    items: [{ name: debtor.description, quantity: '1', unit_amount: money(debtor.amount, debtor.currency) }],
    configuration: { allow_tip: false, tax_inclusive: false },
  };
  if (plan.discount_pct > 0) payload.items[0].discount = { percent: String(plan.discount_pct) };
  if (plan.min_partial_amount > 0) {
    payload.configuration.partial_payment = { allow_partial_payment: true, minimum_amount_due: money(plan.min_partial_amount, debtor.currency) };
  }
  return payload;
}

export async function createAndSendInvoice(debtor, plan, business) {
  const created = await call('POST', '/v2/invoicing/invoices', invoicePayload(debtor, plan, business));
  const id = created.json.id || created.json.href?.split('/').pop();
  await call('POST', `/v2/invoicing/invoices/${id}/send`, { send_to_recipient: true, send_to_invoicer: false, subject: plan.email_subject, note: plan.message });
  return getInvoice(id);
}

export async function getInvoice(id) {
  const { json, debugId } = await call('GET', `/v2/invoicing/invoices/${id}`);
  return {
    id: json.id,
    status: json.status,
    number: json.detail?.invoice_number,
    payer_url: json.detail?.metadata?.recipient_view_url,
    due: json.amount?.value,
    paid: json.payments?.paid_amount?.value || '0.00',
    debugId,
  };
}

export async function remind(id, subject, note) {
  await call('POST', `/v2/invoicing/invoices/${id}/remind`, { subject, note, send_to_recipient: true });
}
