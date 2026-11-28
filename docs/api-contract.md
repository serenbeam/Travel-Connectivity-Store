# API Contract

Status: `Approved`. Implemented: public endpoints (E-5) and admin endpoints (E-6).

Authority for endpoints, payloads, headers, and error codes. Data shapes and constraints
live in [`database-design.md`](database-design.md); the rules behind them in
[`technical-decisions.md`](technical-decisions.md).

## 1. Conventions

| Aspect | Rule |
| --- | --- |
| Base path | `/api/*` — Route Handlers (App Router) |
| Transport | JSON, `Content-Type: application/json`; UTF-8 |
| Money | integer IDR (`totalIdr: 45000`) |
| Time | ISO-8601 UTC (`paidAt: "2026-11-28T03:12:44.000Z"`); UI renders `Asia/Jakarta` |
| Naming | `camelCase` in JSON, `snake_case` in the database; mapping happens in the module |
| Validation | Zod v4 `z.strictObject` at every boundary; unknown keys → `422` |
| Caching | Mutations and all order/payment responses set `Cache-Control: no-store` |
| Pagination | keyset cursor `(createdAt, id)` descending, page size fixed at 10 |
| Auth | Admin: Supabase session cookie. Guest: capability token. Internal: none |

Admin login/logout are Server Actions (`src/app/admin/login/actions.ts`), not route
handlers, and therefore are not part of this contract.

## 2. Error envelope

```json
{
  "error": {
    "code": "IDEMPOTENCY_CONFLICT",
    "message": "Idempotency key was already used with a different payload.",
    "details": { "field": "packageId" }
  }
}
```

`details` is optional and never contains secrets, tokens, hashes, or SQL.

| HTTP | Code | When |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | malformed JSON / unparsable param |
| 401 | `UNAUTHORIZED` | admin route without a valid session |
| 403 | `FORBIDDEN` | session present but `app_metadata.role !== 'admin'` |
| 404 | `NOT_FOUND` | unknown destination/package/order/payment; uniform body for order tokens |
| 409 | `IDEMPOTENCY_CONFLICT` | same `Idempotency-Key`, different payload hash |
| 409 | `IDEMPOTENCY_EXPIRED` | same key replayed after 24 h (no new order created) |
| 409 | `IDEMPOTENCY_REPLAY_UNAVAILABLE` | sealed token undecryptable (key rotation) |
| 409 | `PAYMENT_ALREADY_FINAL` | settle/verify on a payment that is already `succeeded`/`failed` |
| 409 | `PACKAGE_INACTIVE` | checkout for a deactivated package |
| 409 | `DESTINATION_IN_USE` | delete destination that still has packages |
| 409 | `PACKAGE_IN_USE` | delete package that is referenced by an order |
| 409 | `UNIQUE_VIOLATION` | create/update that collides with an existing unique value (catalog slug, country code, `(destination_id, slug)`) |
| 409 | `NOTIFICATION_IN_FLIGHT` | resend while the row is `processing` within its lease |
| 409 | `NOTIFICATION_CLAIM_STALE` | `finish_outbox` fencing rejected the caller |
| 422 | `VALIDATION_ERROR` | Zod failure |
| 502 | `NOTIFICATION_DELIVERY_FAILED` | n8n call failed after the in-claim retry |
| 503 | `ENRICHMENT_UNAVAILABLE` | external country API timeout/failure |
| 500 | `INTERNAL` | unhandled; message is generic, cause goes to the redacted logger |

## 3. Headers

| Path | Set by | Headers |
| --- | --- | --- |
| `/orders/:path*` (page) | `next.config.ts` → `headers()` | `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow` |
| `/mock-gateway/:path*` (page) | `next.config.ts` → `headers()` | same as above |
| `/api/orders/*`, `/api/checkout`, `/api/payments/*` | route handler | `Cache-Control: no-store` |
| `/api/admin/*` | route handler | `Cache-Control: no-store`; `401`/`403` per error table |

The order page loads no third-party resource, so `no-referrer` has nothing to leak to.

## 4. Public endpoints

### 4.1 `GET /api/destinations`

Active destinations with package counts, ordered by `sort_order`, `name`.

```json
{
  "data": [
    { "slug": "japan", "name": "Japan", "countryCode": "JP", "region": "Asia",
      "currencyCode": "JPY", "flagEmoji": "🇯🇵", "summary": "…",
      "heroImageUrl": "https://upload.wikimedia.org/…",
      "heroImageAttribution": "Photo: Reginald Pentinlo · CC BY",
      "packageCount": 3, "fromPriceIdr": 89000 }
  ]
}
```

`200`. No pagination (5 destinations in the MVP).

### 4.2 `GET /api/destinations/[slug]/packages`

```json
{
  "destination": { "slug": "japan", "name": "Japan", "region": "Asia", "flagEmoji": "🇯🇵" },
  "data": [
    { "slug": "japan-5gb-15d", "name": "Japan 5 GB · 15 days", "dataMb": 5120,
      "isUnlimited": false, "validityDays": 15, "priceIdr": 145000,
      "compareAtPriceIdr": 179000, "network": "Local 5G/LTE", "hotspotAllowed": true }
  ]
}
```

`404 NOT_FOUND` when the slug is unknown or the destination is inactive.

### 4.3 `POST /api/checkout`

Creates one order and one pending payment. Idempotent.

Request headers:

| Header | Required | Format |
| --- | --- | --- |
| `Idempotency-Key` | **yes** | `^[A-Za-z0-9_-]{22,64}$` — 32 random bytes, generated once per checkout session and reused on retry |

```json
{
  "destinationSlug": "japan",
  "packageSlug": "japan-5gb-15d",
  "quantity": 1,
  "customerName": "Budi Santoso",
  "customerEmail": "budi@example.com",
  "customerPhone": "+628123456789"
}
```

Response `201` (created) or `200` (replay — identical body):

```json
{
  "orderNumber": "RML-4KQ9ZT",
  "paymentRef": "mock_9f2c1ab77d0e4f53a1c8b6d2",
  "totalIdr": 145000,
  "orderStatus": "pending",
  "paymentStatus": "pending",
  "capabilityUrl": "https://roamly.example/orders/8Kd2…43chars",
  "paymentUrl": "https://roamly.example/mock-gateway/mock_9f2c1ab77d0e4f53a1c8b6d2?token=<43-char capability token>"
}
```

Rules the implementation must honour:

- The token appears **only** inside `capabilityUrl`; it is never echoed as its own field and
  is never persisted in plaintext.
- `destinationSlug` and `packageSlug` are resolved together through the **public read path** (`anon`
  client, RLS `is_active = true`) — `service_role` has no `SELECT` on `packages` and must not
  be granted one. `UNIQUE (destination_id, slug)` makes the pair resolve to exactly one package.
  `create_order_idempotent` then re-reads the package as its owner
  (`postgres`) and re-checks `packages.is_active` **and** `destinations.is_active`, so the
  RPC remains authoritative.
- `paymentUrl` carries the capability token as a query parameter: the simulated gateway needs it
  to send the customer back to `/orders/<token>`. `/mock-gateway/:path*` already sets
  `no-referrer`, `no-store`, and `noindex`, so the parameter is the same secrecy class as the
  order path itself.
- `totalIdr` is computed in SQL from `packages.price_idr × quantity`; a `price` field in the
  request is rejected by `strictObject` (`422`).
- The same key with the same normalized payload returns the same `capabilityUrl`.
- The same key with a different payload → `409 IDEMPOTENCY_CONFLICT`, no order created.
- Replay after 24 h → `409 IDEMPOTENCY_EXPIRED`, no order created.
- Response is `Cache-Control: no-store`.

Errors: `422 VALIDATION_ERROR`, `404 NOT_FOUND` (package), `409 PACKAGE_INACTIVE`,
`409 IDEMPOTENCY_*`.

`destinationSlug` is **required** since E-5: the storefront CTA carries both slugs, and the pair
is the only unambiguous package address.

### 4.4 `GET /api/orders/[token]`

Authorization: the token itself. `sha256(token)` must equal `orders.access_token_hash`,
otherwise `404` with the same body as a nonexistent order.

The handler runs with the service client (which bypasses RLS), so it **must** select an
explicit column list and parse the result into a Zod DTO before responding. Returning a bare
row would expose `access_token_hash`, unmasked PII, and internal ids.

```json
{
  "orderNumber": "RML-4KQ9ZT",
  "createdAt": "2026-11-28T03:11:02.000Z",
  "orderStatus": "paid",
  "paymentStatus": "succeeded",
  "destinationName": "Japan",
  "packageName": "Japan 5 GB · 15 days",
  "packageDataSnapshot": "5 GB · 15 hari",
  "quantity": 1,
  "unitPriceIdr": 145000,
  "totalIdr": 145000,
  "customerName": "Budi Santoso",
  "customerEmail": "b***@example.com",
  "paidAt": "2026-11-28T03:12:44.000Z",
  "notificationStatus": "sent"
}
```

`packageDataSnapshot` is the frozen per-unit description captured at checkout; `quantity` is
displayed separately (the UI shows `{packageDataSnapshot} × {quantity}`).

Customer email is masked. `access_token_hash`, internal UUIDs, and the idempotency key are
never returned. `Cache-Control: no-store`.

### 4.5 `POST /api/payments/verify`

The only endpoint that can trigger `settle_payment`.

```json
{ "ref": "mock_9f2c1ab77d0e4f53a1c8b6d2", "token": "<43-char capability token>" }
```

Flow: validate token against the payment's order → `adapter.fetchSettlement(ref)` →
`settle_payment(ref, outcome)` → schedule outbox dispatch with `after()` when the result is
`paid`.

`ref` must belong to the order identified by `token`; a token for one order can never settle
another. Unknown ref, foreign ref, and token mismatch all return the same `404` body.

Trust boundary (mandatory):

- The settlement outcome is taken **only** from `adapter.fetchSettlement(ref)`. The endpoint
  never reads an outcome, status, or amount from the request body — the body carries only
  `ref` and the capability `token`.
- The adapter result is a discriminated union `'succeeded' | 'failed' | 'pending'`. When it is
  `'pending'` the route returns `{ paymentStatus: 'pending' }` **without calling**
  `settle_payment` (that function accepts only `succeeded`/`failed` and raises `22000`
  otherwise). This branch is compiler-enforced.
- `settle_payment` remains the single writer of `orders.status` / `payments.status`, and the
  adapter does no state transition of its own — no duplicated responsibility.

```json
{ "orderStatus": "paid", "paymentStatus": "succeeded", "paidAt": "2026-11-28T03:12:44.000Z" }
```

Errors: `404 NOT_FOUND` (unknown ref **or** token mismatch — same body), `409 PAYMENT_ALREADY_FINAL`,
`500` if the adapter is unavailable (no state change).

### 4.6 `POST /api/mock-gateway/[ref]/settle`

**Simulation only.** Gated by `MOCK_GATEWAY_ENABLED`; returns `404` when disabled (which is
mandatory in production). Writes exactly one row into `mock_gateway_transactions` and
**nothing else** — it has no code path into `orders` or `payments`.

```json
{ "outcome": "succeeded" }
```

`200` `{ "outcome": "succeeded", "ref": "mock_…", "transition": "created" | "pending_to_terminal" | "replay" | "conflict" }`

The page composes the redirect itself (`/orders/<token>?ref=<ref>`) because only it holds the
capability token from the URL; the endpoint never receives or echoes a token.

Allowed values: `succeeded`, `failed`, `pending`. `404` for an unknown ref. Any other
outcome → `422`.

## 5. Admin endpoints

All require a valid Supabase session with `app_metadata.role === 'admin'`, enforced by
`adminGuard()` in the handler (and the `(dashboard)` layout for pages; `proxy.ts` is only an
early session gate). Failures: `401` without a session, `403` when the session exists but
`app_metadata.role !== 'admin'`. Authorization is evaluated **before** the request body or path
parameter is read.

Catalog **lists** for the CMS are not endpoints: they are Server Components that read through
the authenticated client so RLS `is_admin()` stays the enforcing layer. Only mutations and the
order/payment lists are route handlers.

A path `id` that is not a UUID answers `400 BAD_REQUEST` ("unparsable param").

### 5.1 Destinations

`POST /api/admin/destinations`

```json
{
  "slug": "japan", "countryCode": "JP", "name": "Japan", "region": "Asia",
  "currencyCode": "JPY", "flagEmoji": "🇯🇵", "summary": "…", "description": "…",
  "heroImageUrl": "https://upload.wikimedia.org/…",
  "heroImageAttribution": "Photo: Reginald Pentinlo · CC BY",
  "isActive": true, "sortOrder": 1
}
```

`201` with the created row (`{ "data": { …row } }`). `409 UNIQUE_VIOLATION` on a duplicate
`slug` or `countryCode`, `422 VALIDATION_ERROR` on validation (field-level `details`).

`PATCH /api/admin/destinations/[id]` — partial body, same field names; at least one field is
required (`422` otherwise). `200` with the updated row; `404` when the row does not exist;
`409 UNIQUE_VIOLATION` on a collision.
`DELETE /api/admin/destinations/[id]` — `204`; `409 DESTINATION_IN_USE` when packages exist.

### 5.2 Packages

`POST /api/admin/packages`

```json
{
  "destinationId": "…uuid…", "slug": "japan-5gb-15d", "name": "Japan 5 GB · 15 days",
  "dataMb": 5120, "isUnlimited": false, "validityDays": 15, "priceIdr": 145000,
  "compareAtPriceIdr": 179000, "network": "Local 5G/LTE", "hotspotAllowed": true,
  "isActive": true
}
```

`201` with the created row (`{ "data": { …row } }`). `422 VALIDATION_ERROR` for
`validityDays` outside 1..90, a non-positive price, `compareAt` ≤ `price`, `dataMb` present
when `isUnlimited` is true, `dataMb` missing when `isUnlimited` is false, and for a
`destinationId` that does not exist (field `destinationId`). `409 UNIQUE_VIOLATION` on a
duplicate `(destinationId, slug)`.

`PATCH /api/admin/packages/[id]` — partial body; the two cross-column rules above are
evaluated against the **merged** row, so a partial body cannot produce an invalid
combination. `DELETE /api/admin/packages/[id]` — `204`; `409 PACKAGE_IN_USE` when an order
references the package. Both answer `404` when the row does not exist.

Editing a package never rewrites existing orders — orders keep their name/price snapshots.

### 5.3 `POST /api/admin/destinations/enrich`

Advisory only: calls `countriesnow.space`, returns field suggestions, **writes nothing**.

```json
{ "countryName": "Japan" }
```

```json
{ "countryCode": "JP", "currencyCode": "JPY", "flagEmoji": "🇯🇵", "source": "countriesnow" }
```

`404 NOT_FOUND` when the country is absent; `503 ENRICHMENT_UNAVAILABLE` on timeout (5 s) or
upstream error. The admin can always submit the form manually.

### 5.4 `GET /api/admin/orders`

| Query | Values | Default |
| --- | --- | --- |
| `status` | `pending` \| `paid` \| `failed` | all |
| `range` | `24h` \| `7d` \| `30d` | `7d` |
| `q` | ≤ 64 chars; **exact match** on `order_number` (uppercased) or on `customer_email` (lowercased) | — |
| `cursor` | opaque `base64url(createdAt|id)` | first page |

`q` is shape-checked, not cleaned: the value must look like an order number (`RML-[A-Z0-9]{6}`)
or an email address. Anything else — including characters that are structural in a PostgREST
filter (`,`, `(`, `)`, `"`, `*`, `%`, `\`) — answers `422 VALIDATION_ERROR`; the server never
interpolates the value into an `or=(…)` expression, it selects one column and uses `eq`.
`status`, `range`, and a present-but-invalid `cursor` also answer `422`.

`limit` is fixed at 10; a supplied `limit` is ignored, never trusted.

```json
{
  "data": [
    { "id": "…uuid…", "orderNumber": "RML-4KQ9ZT", "createdAt": "2026-11-28T03:11:02.000Z",
      "customerName": "Budi Santoso", "customerEmail": "budi@example.com",
      "destinationName": "Japan", "packageName": "Japan 5 GB · 15 days",
      "totalIdr": 145000, "status": "paid", "paymentStatus": "succeeded",
      "notificationStatus": "sent", "canResendNotification": false }
  ],
  "nextCursor": "MjAyNi0xMS0yOFQwMzoxMTowMlp8OGQ3…"
}
```

`canResendNotification` is **advisory UI state**, computed server-side from the outbox row with
the same rule the resend endpoint enforces: `false` when the order is not `paid`, when the
notification is already `sent`, while a claim still holds its 120 s lease, at the 5-attempt
ceiling, or when no outbox row exists. The list never returns the outbox `attempts` counter or
its `locked_at` token.

The flag is **not** a promise that a resend will succeed: `POST …/notification/resend` re-reads
the state, answers `202 skipped` / `409 NOTIFICATION_IN_FLIGHT` / `409 NOTIFICATION_CLAIM_STALE`
as documented in §5.6, and `claim_outbox` remains the final authority. A stale list page can
therefore show a button whose click is then skipped.

`nextCursor: null` on the last page.

### 5.5 `GET /api/admin/payments`

Same filters minus `q` (payments are found through orders): `status`, `range`, `cursor`, all
validated the same way (`422` on an invalid value). Rows: `providerReference`,
`orderNumber`, `amountIdr`, `status`, `createdAt`, `paidAt`, `failureCode`.

### 5.6 `POST /api/admin/orders/[id]/notification/resend`

Manual recovery path for the outbox.

| Result | HTTP | Body |
| --- | --- | --- |
| delivered | `200` | `{ "status": "sent", "notificationId": "…uuid…" }` |
| nothing to claim (already sent, attempts exhausted, order not paid) | `202` | `{ "status": "skipped", "reason": "none_claimable" }` |
| row is `processing` inside its 120 s lease | `409` | `NOTIFICATION_IN_FLIGHT` |
| fencing rejected the finishing call | `409` | `NOTIFICATION_CLAIM_STALE` |
| n8n failed after the in-claim retry | `502` | `NOTIFICATION_DELIVERY_FAILED` |

## 6. Idempotency contract (normative)

| Case | Result |
| --- | --- |
| First request | `201`, order + payment + idempotency row created in one transaction |
| Same key, same normalized payload, ≤ 24 h | `200`, byte-identical body, same `capabilityUrl`, no new rows |
| Same key, different payload | `409 IDEMPOTENCY_CONFLICT`, no new rows |
| Same key, > 24 h | `409 IDEMPOTENCY_EXPIRED`, no new rows |
| 10 concurrent requests, same key | exactly one order and one payment; the rest receive the same `201`/`200` result |
| Sealed token undecryptable | `409 IDEMPOTENCY_REPLAY_UNAVAILABLE` |

The payload hash is computed over the Zod-normalized object, so key order and whitespace do
not affect it. The client must treat the `Idempotency-Key` as a secret: per-checkout-session,
`sessionStorage` only, never in a URL.

Lifecycle: a key identifies **one checkout attempt**. It is generated on the first submit of a
package, reused for every retry of that attempt (a timeout must replay the same order), released
when the server reports `409 IDEMPOTENCY_CONFLICT` / `409 IDEMPOTENCY_EXPIRED` (that attempt can
never succeed), and released once a successful order's navigation to the payment page has
actually completed. A later purchase of the same package therefore starts a new attempt with a
fresh key and creates a new order, even if the previous order is still `pending` or `failed`.

When `sessionStorage` is unavailable or throws, the client keeps the key in memory for the
lifetime of the page load, so a retry of the same attempt still replays the same order instead of
creating a second one. That fallback does not survive a reload; with storage blocked, reloading
mid-attempt starts a new attempt.

## 7. Outbox / notification payload

Sent to `N8N_WEBHOOK_URL` with `X-Webhook-Secret`. Minimal by design:

```json
{
  "notificationId": "0f9c…uuid…",
  "event": "order.paid",
  "orderNumber": "RML-4KQ9ZT",
  "customerName": "Budi Santoso",
  "customerEmail": "budi@example.com",
  "destinationName": "Japan",
  "packageName": "Japan 5 GB · 15 days",
  "totalIdr": 145000,
  "paidAt": "2026-11-28T03:12:44.000Z"
}
```

Never included: capability token, `capabilityUrl`, `access_token_hash`, `Idempotency-Key`,
internal order UUID, payment UUID, or any database credential.

Delivery semantics: **at-least-once**. `notificationId` is stable across resends so a
receiver can deduplicate. Exactly-once is not offered. HTTP timeout 10 s, one retry inside
the claim, lease 120 s.

### 7.1 Stored payload vs wire payload

The `notification_outbox.payload` column (written by `settle_payment` in the settlement
transaction) holds nine keys: `notificationId`, `orderNumber`, `customerName`,
`customerEmail`, `destinationName`, `packageName`, `packageDataSnapshot`, `totalIdr`,
`paidAt`. The dispatcher validates that object with a strict schema and adds
`"event": "order.paid"` at send time — the event name is not stored, so a future second
event type needs no migration. A payload with an unexpected key is rejected instead of
forwarded, which is what keeps capability material out of the webhook body.

### 7.2 What `sent` means

`notification_outbox.status = 'sent'` means: **n8n answered 2xx**, and the n8n workflow
answered only after its SMTP node reported that the provider accepted the message.

It is **not** proof that the email reached an inbox, was delivered, or was read. Provider
acceptance, delivery, and read receipts are separate things; this system observes only the
first one, plus its own webhook call.

### 7.3 Failure classification (dispatcher)

| Result | Recorded | Retry |
| --- | --- | --- |
| `2xx` | `status = 'sent'`, `sent_at` set | — |
| `4xx` (bad secret, rejected event) | `status = 'failed'`, `last_error = n8n_http_<status>` | **no** (permanent) |
| `5xx` | `status = 'failed'`, `last_error = n8n_http_<status>` | one retry inside the claim, then failed |
| timeout / network error | `status = 'failed'`, `last_error = n8n_timeout` / `n8n_network` | one retry inside the claim, then failed |
| payload invalid or unreadable | `status = 'failed'`, `last_error = invalid_payload` / `payload_unavailable` | no send attempted |
| claim lost to a newer attempt (`finish_outbox` → `stale`) | nothing is overwritten | — |

A failure here never touches `orders` or `payments`: a paid order stays paid. `attempts` is
bumped by each claim and is capped at 5 by the schema; a row at the ceiling is terminal for
dispatch, and the documented operator runbook (ADR-9) is the only way back. The resend
endpoint never resets `attempts`.

### 7.4 Duplicates are possible

A timeout after the provider accepted the message, or a crash between the HTTP call and
`finish_outbox`, produces a repeat delivery after the lease expires. That is accepted:
`notificationId` is stable across retries so the receiver can deduplicate, and **no** claim is
made that a duplicate email is impossible.

## 8. Status code summary

| Endpoint | Success | Notable failures |
| --- | --- | --- |
| `GET /api/destinations` | 200 | 500 |
| `GET /api/destinations/[slug]/packages` | 200 | 404 |
| `POST /api/checkout` | 201 / 200 | 404, 409, 422 |
| `GET /api/orders/[token]` | 200 | 404 |
| `POST /api/payments/verify` | 200 | 404, 409 |
| `POST /api/mock-gateway/[ref]/settle` | 200 | 404, 422 |
| `POST/PATCH/DELETE /api/admin/destinations*` | 201/200/204 | 400, 401, 403, 409, 422 |
| `POST/PATCH/DELETE /api/admin/packages*` | 201/200/204 | 400, 401, 403, 409, 422 |
| `POST /api/admin/destinations/enrich` | 200 | 401, 403, 404, 503 |
| `GET /api/admin/orders` · `GET /api/admin/payments` | 200 | 401, 403, 422 |
| `POST /api/admin/orders/[id]/notification/resend` | 200 / 202 | 401, 403, 409, 502 |
