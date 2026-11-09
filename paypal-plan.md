# paypal-plan.md: autopay for a split payment

Contract sheet written before the code, following the `typescript-integrate-paypal` skill of APIMatic's PayPal
Context Plugin. Every fact below was looked up in the installed SDK (`node_modules/paypal/sdk-map.md`,
`map/operations/subscriptions.md` and the model files they name), package `paypal` 2.29.0.

## Scope

On a sent split-payment invoice with no payment on it, the owner offers autopay: a billing plan of equal monthly
parts and a subscription the customer approves once. A sync keeps the invoice and the subscription from both
collecting the same debt.

## Repo survey

- ESM (`"type": "module"`), plain JavaScript, Node 22+, no build step. Exemplar for a PayPal call: `src/paypal.mjs`.
  Exemplar for a ledger write around a PayPal call: `sendApproved` in `src/desk.mjs`.
- Checks: `npm test` (`node --test test/`). Baseline on the untouched tree: 24 pass.
- Host: sandbox, `https://api-m.sandbox.paypal.com`. The SDK declares one environment, so the host is the
  `serverOptions.baseUrl` override fed from the same `PAYPAL_BASE_URL` the fetch client reads.

## Operations

| Operation | Signature | Wire | Request fields used | Returns | Smoke (sandbox, 9 Nov 2026) |
| --- | --- | --- | --- | --- | --- |
| create plan | `client.subscriptions.createBillingPlan(request)` | `POST /v1/billing/plans` | `payPalRequestId` (header `PayPal-Request-Id`), `body: PlanRequest` | `BillingPlan` (`id`) | 201, `ACTIVE` |
| create subscription | `client.subscriptions.createSubscription(request)` | `POST /v1/billing/subscriptions` | `payPalRequestId`, `body: CreateSubscriptionRequest` | `Subscription` (`id`, `status`, `links[rel=approve]`) | 201, `APPROVAL_PENDING` |
| read | `client.subscriptions.getSubscription({ id })` | `GET /v1/billing/subscriptions/{id}` | `id` (path) | `Subscription` | 200 |
| cancel | `client.subscriptions.cancelSubscription({ id, body: { reason } })` | `POST /v1/billing/subscriptions/{id}/cancel` | `id` (path), `body.reason` (required) | nothing | 404 `RESOURCE_NOT_FOUND` while `APPROVAL_PENDING` |

`PlanRequest`: `productId`, `name`, `billingCycles[]` (`frequency { intervalUnit: IntervalUnit.Month, intervalCount }`,
`tenureType: TenureType.Trial | Regular`, `sequence`, `totalCycles`, `pricingScheme.fixedPrice { currencyCode, value }`),
`paymentPreferences { autoBillOutstanding, paymentFailureThreshold }`. `status` defaults to `ACTIVE`.

`CreateSubscriptionRequest`: `planId`, `customId`, `subscriber.emailAddress`,
`applicationContext { brandName, returnUrl, cancelUrl }` (both URLs required).

Outside the SDK (the map lists Orders, Payments, Vault, Transaction Search, Subscriptions): the plan's product
(`POST /v1/catalogs/products`) and the invoice cancel (`POST /v2/invoicing/invoices/{id}/cancel`) go through
`src/paypal.mjs`.

## Durable writes

**Duplicate claims**

| Write | Where the claim is stored | What rejects the second one | Where in the code |
| --- | --- | --- | --- |
| product, plan, subscription for one invoice | `ledger[ref].autopay.key = pdd-<invoice id>`, saved before the first call | a row that already has `autopay.id` returns it; a retry without an id resends the same `PayPal-Request-Id` (`<key>-product`, `-plan`, `-sub`), which PayPal joins | `offerAutopay` in `src/desk.mjs`, `createAutopay` in `src/autopay.mjs` |

Shortcut: the ledger is one JSON file written by one process, so the claim is not a conditional write. Two server
processes on the same ledger would need one.

**Unknown outcomes**

| Write | Re-read with | Reference | Where in the code |
| --- | --- | --- | --- |
| create plan / create subscription | the same create call, same `PayPal-Request-Id` | the key in the ledger claim | `offerAutopay`: the claim stays, the error reaches the owner, the next click resends |

## Cross-operation invariants

| Invariant | Where the legal set comes from | Enforced where | Test |
| --- | --- | --- | --- |
| autopay only for a split plan on a sent invoice with no payment | the ledger row and the invoice status read from PayPal | `offerAutopay` | sandbox run: second account refused |
| parts add up to the debt, none below the plan minimum, the plan ends | the receivable and the approved plan | `installments`, `planRequest` | `test/autopay.test.mjs` |
| one debt is never collected through both channels | invoice status and subscription status, both re-read on sync | `autopayAction`, applied in `sync` | `test/autopay.test.mjs` |

## Not done

- A sandbox buyer approving the subscription end to end.
- Webhooks: the SDK has no webhook surface, so status is read on "Refresh from PayPal", as for invoices.
