# Technical Decisions

Status: `Approved`. Implementation: none yet.

One record per decision: context, decision, consequence, rejected alternative. Facts here
are the reason the code looks the way it will; do not re-litigate them in code comments.

---

## ADR-1 — Next.js 16 App Router with Route Handlers as the API

**Context.** One framework for storefront, admin, and API; the technical test explicitly
names Route Handlers.

**Decision.** App Router only. Server Components for reads, Route Handlers for mutations
and any JSON contract. Route protection in `src/proxy.ts`.

**Consequences.** `proxy.ts` — not `middleware.ts` — is the Next 16 name; edge runtime is
not available there, which is fine because Supabase session refresh needs Node. Request
APIs (`cookies()`, `headers()`, `params`, `searchParams`) are async. `after()` is available
in Route Handlers and is used for outbox dispatch.

**Rejected.** Pages Router (no RSC, legacy mutation patterns); a separate Express API
(a second deployment for no benefit at this size).

---

## ADR-2 — Tailwind CSS v4, CSS-first configuration

**Context.** Tailwind 4.3 no longer requires a JS config for design tokens.

**Decision.** `@import "tailwindcss"` plus `@theme` tokens in `src/app/globals.css`, with
`@tailwindcss/postcss`. No `tailwind.config.js`.

**Consequences.** Tokens (colour, type scale, spacing, radius) are declared once in CSS and
consumed as utilities. Designers and agents read `globals.css` for the palette instead of a
separate config file.

**Rejected.** Tailwind 3 with `tailwind.config.js` (extra file, older plugin model).

---

## ADR-3 — Zod v4 with strict objects at every boundary

**Context.** Zod 4 changed the API (`z.email()` instead of `z.string().email()`) and
introduced stricter defaults.

**Decision.** Zod 4.6.7. Body, query, and params validated with `z.strictObject` so unknown
keys are rejected. The parsed, normalized result — not the raw body — is what feeds
`request_hash`.

**Consequences.** A client sending `price_idr` gets `422` instead of being silently ignored.
Two requests that differ only in whitespace or key order produce the same hash, so they do
not create false idempotency conflicts.

**Rejected.** Loose objects with manual picking (easy to forget a field); hand-written
validators (unnecessary surface).

---

## ADR-4 — Transactional writes live in Postgres functions

**Context.** `@supabase/supabase-js` issues one statement per call; it cannot open a
transaction across several statements. Checkout must insert an order, a payment, and
idempotency metadata atomically.

**Decision.** Four SQL functions own the transactional operations:
`create_order_idempotent`, `settle_payment`, `claim_outbox`, `finish_outbox`. Node calls
them via `supabase.rpc()`. Authorization checks and response composition stay in Node.

**Consequences.** Atomicity and locking are database guarantees, not application hopes.
Integration tests exercise the real constraints rather than a mocked repository.
Price is read inside the function, which removes the time-of-check/time-of-use gap.

**Rejected.** Multiple JS calls with manual compensation (not atomic); adding an ORM or a
raw `pg` transaction wrapper (extra dependency for four functions).

---

## ADR-5 — Guest orders use a 256-bit capability token, stored as a hash

**Context.** Guest checkout must work without accounts, must not let customers read other
orders, and must not rely on guessable IDs.

**Decision.** Server generates `randomBytes(32).toString('base64url')` (43 chars), stores
only `orders.access_token_hash = sha256(token)`. The link is `/orders/{token}`.
`order_number` (`RML-XXXXXX`) is display-only. Invalid tokens return `404` with a body
identical to a nonexistent order.

**Consequences.** Database compromise does not yield working links. The token exists in
plaintext only in the issuing request and in the customer's browser. Verification cost is
one indexed hash lookup.

**Rejected.** Signed JWT/HMAC links (more moving parts, revocation is harder); order number
plus email as authorization (guessable and leaks PII existence); persistent guest account
(contradicts no-registration requirement).

---

## ADR-6 — Idempotency: unique key + payload hash + sealed replay token

**Context.** Double-submitted checkout must not create two orders; a retried request must
return the earlier result; a repeated key with a different cart must be refused. The replay
response includes a capability token, so storing it naively would put a credential at rest.

**Decision.**

- `idempotency_keys` with `unique(scope, key)`; `scope` fixed to `'checkout'` inside the
  function.
- Node computes `request_hash = sha256(normalized payload)`.
- Node generates the capability token, its SHA-256 hash, and an AES-256-GCM sealed copy
  (`v1.<iv>.<tag>.<ct>`, key `IDEMPOTENCY_TOKEN_KEY`, random IV per row).
- The SQL function receives `access_token_hash` and `response_token_sealed` as parameters;
  it never creates, hashes, or encrypts anything and never sees the plaintext token.
- On replay the function returns the sealed blob; **Node** decrypts it. The encryption key
  never exists inside Postgres.
- `response_body` stores `{order_number, payment_ref, total_idr}` only — never a token,
  never a capability URL. Node composes `capabilityUrl` from the plaintext token it holds.
- Replay window 24 h; beyond that `IDEMPOTENCY_EXPIRED` (409) and **no order is created**.

**Consequences.** Concurrency is settled by the unique constraint plus row lock from
`ON CONFLICT ... DO UPDATE ... RETURNING`. Ten concurrent requests produce one order.
Holding the `Idempotency-Key` is equivalent to holding the capability, so the key is
treated as a secret: 32 random bytes, `sessionStorage`, redacted from logs, `no-store`.

**Accepted risks.** Key rotation breaks old replays → `IDEMPOTENCY_REPLAY_UNAVAILABLE`
(409), recoverable via the order link the customer already has. Rows are never deleted, so
storage grows linearly with checkouts — acceptable at MVP volume.

**Rejected.** Deterministic HMAC-derived tokens (no storage, but the token and the key share
one secret); plaintext token in `response_body` (credential at rest); "return 409 for
everything" (breaks legitimate retries).

---

## ADR-7 — Payment adapter with a simulated provider

**Context.** A real PSP needs merchant onboarding and keys, which the technical test does
not require. The risk being demonstrated is the state machine, not the vendor.

**Decision.** `PaymentGatewayAdapter` with `createIntent(order)` and
`fetchSettlement(ref)`. The mock implementation persists outcomes in
`mock_gateway_transactions` and nothing else. `/mock-gateway/[ref]` is a `noindex`
simulation page, gated by `MOCK_GATEWAY_ENABLED` and returning `404` in production.
`settle_payment` is the only code that mutates `payments`/`orders`.

**Consequences.** Verification is server-side and adapter-driven, exactly as a real
integration would be. **The mock is a simulation, not evidence of a production payment
integration**: no card data, no provider signature, no settlement, no reconciliation.

**Trust boundary (E-3 resolution).** The outcome passed to `settle_payment` is taken only
from `adapter.fetchSettlement(ref)`; the route never reads an outcome from the request body.
The adapter result is a discriminated union (`'succeeded' | 'failed' | 'pending'`), and
`settle_payment` accepts only `succeeded`/`failed` — a `pending` result is returned to the
client by the route without calling the RPC. Simulated gateway state is written through
`record_mock_settlement` (three outcomes, `pending` may advance to terminal, terminal is
immutable), which touches the provider table only.

**Privilege model.** `service_role` holds **no** INSERT/UPDATE/DELETE on `orders`,
`payments`, `idempotency_keys`, `notification_outbox`, `mock_gateway_transactions`. The five
`SECURITY DEFINER` functions owned by `postgres` are the only writers (single-writer), and
they run with `search_path = ''`, schema-qualified names, and `REVOKE ALL … FROM PUBLIC`
before `GRANT EXECUTE … TO service_role`. RLS does **not** protect service-role queries
(`BYPASSRLS`); its safety comes from missing grants plus triggers/constraints.

**Rejected.** Client-posted `paymentStatus` (browser as source of truth — explicitly
forbidden); stubbing the whole flow in tests only (nothing to demonstrate).

---

## ADR-8 — One external API, no key: `countriesnow.space`

**Context.** The brief asks for at least one relevant external API. REST Countries v3.1 is
deprecated and v5 requires an API key whose demo key returns a canned sample. Two
integrations are not justified.

**Decision.** `GET https://countriesnow.space/api/v0.1/countries/info?returns=currency,iso2,iso3,capital,unicodeFlag`
— verified reachable, no key, 250 countries, and it returns `currency`, `iso2`, `iso3`, and
`unicodeFlag`. Used **only** from the admin "Fill from API" action; never per page view.
Static seed data covers the five demo destinations as fallback.

**Consequences.** `region` is authored by the admin (the API silently drops unsupported
fields such as `region` and `timezones`), so `destinations.timezone` does not exist and
`flag_emoji` replaces any external flag CDN. The storefront has no external runtime
dependency. Timeout 5 s, one retry, `503` on failure with a manually submittable form.

**Rejected.** REST Countries v5 (key requirement + misleading demo key); World Bank or
first.org (a second integration for one field); a flag CDN (unnecessary network hop).

---

## ADR-9 — Transactional outbox with fenced, bounded dispatch

**Context.** The order-paid notification must not be lost, must not roll back the payment,
must not be sent twice by concurrent triggers, and must not require a queue or scheduler.

**Decision.**

- `notification_outbox` row committed in the same transaction as `settle_payment`;
  `unique(order_id)` means at most one row per order.
- `claim_outbox()` is the only way to start work: a single `UPDATE` over a
  `FOR UPDATE SKIP LOCKED` subquery, eligible only for `pending` / `failed` /
  expired-`processing` rows of **paid** orders with `attempts < 5`. It sets
  `status='processing'`, `locked_at=now()`, and **returns `locked_at`**.
- `finish_outbox(id, locked_at, ok, error)` only mutates the row when
  `status='processing' AND locked_at = $locked_at`. A stale caller gets `outcome='stale'`
  and changes nothing — this is the lost-update guard.
- Lease 120 s, HTTP timeout **10 s**, one retry inside the same claim (no re-claim), so a
  dispatch takes ≤ 20 s and cannot outlive its lease.
- Dispatchers: `after()` in the verify request, and the admin resend route. Both go through
  `claim_outbox`, so a concurrent resend receives `outcome='none'` and sends nothing.

**Consequences.** Concurrency is safe and bounded without infrastructure. Delivery is
**at-least-once**: a crash between a successful HTTP call and `finish_outbox` can repeat the
send after the lease expires. That is accepted and documented; `notificationId`
(= `notification_outbox.id`) is included so a receiver can deduplicate. Exactly-once is
never claimed.

**Recovery.** Lease reclaim for abandoned `processing` rows; admin "Resend" for `failed` and
for rows stranded in `pending`.

**Rejected.** In-memory retry loops (lost on restart); a queue/broker/worker (out of scope,
new infrastructure); `attempts`-only retry without fencing (allows a slow dispatcher to
overwrite a newer claim).

---

## ADR-10 — Capability URL exposure controls

**Context.** The order token travels in the URL path, where `Referer`, caches, crawlers, and
logs can copy it.

**Decision.**

- `next.config.ts` `headers()` sets `Referrer-Policy: no-referrer`, `Cache-Control: no-store`,
  and `X-Robots-Tag: noindex, nofollow` for `/orders/:path*` and `/mock-gateway/:path*`.
- Order API route handlers set their own `Cache-Control: no-store` rather than relying on
  the config layer.
- The order page loads **zero** third-party resources: no analytics, no error-monitoring
  SDK, no external fonts (fonts are self-hosted via `next/font`), no external images.
- `lib/logger.ts` is the only logging path and redacts `idempotency-key`, `token`,
  `access_token`, `authorization`, `cookie`; paths matching `/orders/{43 chars}` become
  `/orders/[redacted]`. `console.log(req.url)` is forbidden.
- Invalid tokens return a uniform `404`.

**Accepted residual risk.** Infrastructure access logs (platform or reverse proxy) still
record the full path; the operator is the only party with that data. Moving to cookies/POST
would remove shareable links and add complexity, which is not worth it at MVP scale.

**Rejected.** Token in query string (worse: appears in more logs); token in `localStorage`
plus a lookup screen (turns a link into an account system).

**Related operational limits (accepted).**

- **Admin revocation lag.** `requireAdmin()` reads a fresh user from Supabase Auth
  (`getUser()`), but RLS evaluates the signed JWT claim (`auth.jwt()`). A revoked admin can
  therefore keep RLS-backed access until the current access token expires. Mitigation: set
  the JWT expiry to **≤ 900 s**; do not claim instant revocation across existing sessions.
- **Idempotency key rotation.** Rotating `IDEMPOTENCY_TOKEN_KEY` makes earlier sealed replay
  tokens undecryptable; those replays return `409 IDEMPOTENCY_REPLAY_UNAVAILABLE`. Accepted
  without a KMS.
- **Idempotency retention.** Rows are never deleted in the MVP: after the 24 h replay window
  a key returns `IDEMPOTENCY_EXPIRED` permanently and can never create a second order. A
  cleanup job must not be added without a tombstone, otherwise a stale retry would create a
  new order.

---

## ADR-11 — Testing: unit, integration against a real database, two E2E flows

**Context.** The riskiest behaviours are database constraints, RLS, and concurrency.

**Decision.** Vitest for unit and integration (integration runs against a disposable local
Supabase instance started with Docker); Playwright for exactly two flows. Assertions target
business rules and security invariants, not coverage numbers.

**Consequences.** Mocking the repository is explicitly rejected for constraint, transaction,
idempotency, and RLS tests — a mock cannot prove that `unique(scope,key)` holds.
Responsive layout and visual quality are manual checks.

**Rejected.** Coverage-driven test suites; E2E for every admin screen (slow, low value
here).

---

## ADR-12 — MVP boundaries that are intentionally not built

**Decision.** The following are out of scope and must not be added without a new proposal:

| Not built | Consequence accepted |
| --- | --- |
| Automatic expiration of `pending` orders | Stale pending orders stay visible to admins; no stock or price is reserved |
| Scheduler / cron / queue / worker | Recovery is lease reclaim plus admin resend |
| Exactly-once notification delivery | At-least-once with `notificationId` for receiver dedup |
| Customer accounts, refunds, discounts, multi-currency | Single-currency IDR checkout only |
| Real payment provider | Mock adapter is a simulation, not production evidence |
| Numbered pagination, infinite scroll, load more | Keyset pagination, 10 rows, next/previous |
| Feature flags, A/B testing, i18n | Not needed to demonstrate the MVP |

**Rejected.** Building any of the above "because it is easy" — each one adds surface that
must then be tested and documented.
