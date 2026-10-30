// The collections agent: reads one overdue account + its history, proposes a recovery plan,
// and the owner's policy (code, not the model) has the last word on money.
import { execFile } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const DEFAULT_POLICY = {
  max_discount_pct: 10, // never forgive more than this to close a debt
  min_partial_ratio: 0.25, // a split plan must collect at least 25% up front
  max_due_in_days: 30,
  discount_only_after_days: 45, // early-stage debts get a nudge, not a discount
  follow_up_every_days: 7, // an unpaid PayPal invoice gets a reminder this often
  max_follow_ups: 2, // after that it goes back to the owner instead of nagging
};

const STRATEGIES = ['friendly_nudge', 'firm_reminder', 'split_payment', 'settlement_discount', 'escalate_to_owner'];

export function buildPrompt(debtor, policy, business) {
  return `You are the accounts-receivable assistant of ${business}, a small business.
Decide how to recover ONE overdue invoice. Keep the customer relationship; be honest, never threaten.

Customer record (from the owner's books):
${JSON.stringify(debtor, null, 2)}

Owner policy (hard limits, the system will reject anything outside them):
- discount at most ${policy.max_discount_pct}%, and only if the invoice is ${policy.discount_only_after_days}+ days late
- a split payment must ask at least ${Math.round(policy.min_partial_ratio * 100)}% of the amount as the minimum first payment
- new due date between 3 and ${policy.max_due_in_days} days from today

Strategies: ${STRATEGIES.join(', ')}. Use escalate_to_owner when the notes show a dispute, a complaint
about the work, or anything a human must answer; then no invoice is sent.

Reply with ONLY a JSON object:
{"strategy": "...", "reason": "one sentence citing the record",
 "discount_pct": 0, "min_partial_amount": 0, "due_in_days": 7,
 "email_subject": "...", "message": "the email body to the customer, 3-6 sentences, plain text, signed by ${business}",
 "invoice_note": "one line shown on the PayPal invoice"}`;
}

export function parsePlan(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) throw new Error('model reply had no JSON object');
  return JSON.parse(m[0]);
}

// Clamp the model's plan to the owner's policy and record every correction.
export function enforcePolicy(plan, debtor, policy = DEFAULT_POLICY) {
  const out = { ...plan, corrections: [] };
  const fix = (field, value, why) => { out.corrections.push(`${field}: ${JSON.stringify(out[field])} -> ${JSON.stringify(value)} (${why})`); out[field] = value; };
  if (!STRATEGIES.includes(out.strategy)) fix('strategy', 'escalate_to_owner', 'unknown strategy');
  out.discount_pct = Number(out.discount_pct) || 0;
  out.min_partial_amount = Number(out.min_partial_amount) || 0;
  out.due_in_days = Math.round(Number(out.due_in_days) || 7);
  if (out.discount_pct > policy.max_discount_pct) fix('discount_pct', policy.max_discount_pct, 'policy cap');
  if (out.discount_pct > 0 && debtor.days_overdue < policy.discount_only_after_days) fix('discount_pct', 0, `only ${debtor.days_overdue} days late`);
  if (out.discount_pct < 0) fix('discount_pct', 0, 'negative');
  const floor = Math.ceil(debtor.amount * policy.min_partial_ratio * 100) / 100;
  if (out.min_partial_amount > 0 && out.min_partial_amount < floor) fix('min_partial_amount', floor, 'policy floor');
  if (out.min_partial_amount >= debtor.amount) fix('min_partial_amount', 0, 'not a split');
  if (out.due_in_days < 3) fix('due_in_days', 3, 'policy minimum');
  if (out.due_in_days > policy.max_due_in_days) fix('due_in_days', policy.max_due_in_days, 'policy maximum');
  out.send_invoice = out.strategy !== 'escalate_to_owner';
  return out;
}

// LLM backends. "replay" reads recorded answers so judges can run the demo with no keys.
const key = (prompt) => createHash('sha256').update(prompt).digest('hex').slice(0, 16);

export async function complete(prompt, { backend = process.env.LLM_BACKEND || 'replay', fixtures = 'fixtures/llm' } = {}) {
  const file = `${fixtures}/${key(prompt)}.json`;
  if (backend === 'replay') return JSON.parse(await readFile(file, 'utf8')).text;
  let text;
  if (backend === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: 1200, messages: [{ role: 'user', content: prompt }] }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${body.error?.message}`);
    text = body.content.map((c) => c.text || '').join('');
  } else if (backend === 'claude-cli') {
    text = await new Promise((ok, fail) => execFile('claude', ['-p', prompt], { timeout: 180000, maxBuffer: 1 << 20 }, (e, so) => (e ? fail(e) : ok(so))));
  } else throw new Error(`unknown LLM_BACKEND ${backend}`);
  if (process.env.RECORD) { await mkdir(fixtures, { recursive: true }); await writeFile(file, JSON.stringify({ backend, text }, null, 2)); }
  return text;
}

export async function planFor(debtor, { policy = DEFAULT_POLICY, business, llm } = {}) {
  const prompt = buildPrompt(debtor, policy, business);
  const raw = await complete(prompt, llm);
  return enforcePolicy(parsePlan(raw), debtor, policy);
}
