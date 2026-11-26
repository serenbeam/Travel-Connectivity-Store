# API Contract

Status: `Approved`. Route handlers: **not implemented yet**.

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
  "paymentUrl": "https://roamly.example/mock-gateway/mock_9f2c1ab77d0e4f53a1c8b6d2"
}
```

Rules the implementation must honour:

- The token appears **only** inside `capabilityUrl`; it is never echoed as its own field and
  is never persisted in plaintext.
- `totalIdr` is computed in SQL from `packages.price_idr × quantity`; a `price` field in the
  request is rejected by `strictObject` (`422`).
- The same key with the same normalized payload returns the same `capabilityUrl`.
- The same key with a different payload → `409 IDEMPOTENCY_CONFLICT`, no order created.
- Replay after 24 h → `409 IDEMPOTENCY_EXPIRED`, no order created.
- Response is `Cache-Control: no-store`.

Errors: `422 VALIDATION_ERROR`, `404 NOT_FOUND` (package), `409 PACKAGE_INACTIVE`,
`409 IDEMPOTENCY_*`.

### 4.4 `GET /api/orders/[token]`

Authorization: the token itself. `sha256(token)` must equal `orders.access_token_hash`,
otherwise `404` with the same body as a nonexistent order.

```json
{
  "orderNumber": "RML-4KQ9ZT",
  "createdAt": "2026-11-28T03:11:02.000Z",
  "orderStatus": "paid",
  "paymentStatus": "succeeded",
  "destinationName": "Japan",
  "packageName": "Japan 5 GB · 15 days",
  "quantity": 1,
  "unitPriceIdr": 145000,
  "totalIdr": 145000,
  "customerName": "Budi Santoso",
  "customerEmail": "b***@example.com",
  "paidAt": "2026-11-28T03:12:44.000Z",
  "notificationStatus": "sent"
}
```

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

`200` `{ "outcome": "succeeded", "ref": "mock_…", "redirectTo": "/orders/<token>?ref=mock_…" }`

Allowed values: `succeeded`, `failed`, `pending`. `404` for an unknown ref. Any other
outcome → `422`.

## 5. Admin endpoints

All require a valid Supabase session with `app_metadata.role === 'admin'`, enforced by
`requireAdmin()` in the handler (and `proxy.ts` for page navigation). Failures: `401`, `403`.

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

`201` with the created row. `409` on duplicate `slug`/`countryCode`, `422` on validation.

`PATCH /api/admin/destinations/[id]` — partial body, same field names. `200`.
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

`201`. `422` for `validityDays` outside 1..90, negative price, `compareAt` ≤ `price`,
`dataMb` missing when `isUnlimited` is false. `409` on duplicate `(destinationId, slug)`.

`PATCH /api/admin/packages/[id]`, `DELETE /api/admin/packages/[id]` (`204`; `409` when the
package is referenced by an order).

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
| `q` | ≤ 64 chars; matches `order_number` or customer email (ILIKE) | — |
| `cursor` | opaque `base64(createdAt|id)` | first page |

`limit` is fixed at 10; a supplied `limit` is ignored, never trusted.

```json
{
  "data": [
    { "id": "…uuid…", "orderNumber": "RML-4KQ9ZT", "createdAt": "2026-11-28T03:11:02.000Z",
      "customerName": "Budi Santoso", "customerEmail": "budi@example.com",
      "destinationName": "Japan", "packageName": "Japan 5 GB · 15 days",
      "totalIdr": 145000, "status": "paid", "paymentStatus": "succeeded",
      "notificationStatus": "sent" }
  ],
  "nextCursor": "MjAyNi0xMS0yOFQwMzoxMTowMlp8OGQ3…"
}
```

`nextCursor: null` on the last page.

### 5.5 `GET /api/admin/payments`

Same filters minus `q` (payments are found through orders). Rows: `providerReference`,
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

## 8. Status code summary

| Endpoint | Success | Notable failures |
| --- | --- | --- |
| `GET /api/destinations` | 200 | 500 |
| `GET /api/destinations/[slug]/packages` | 200 | 404 |
| `POST /api/checkout` | 201 / 200 | 404, 409, 422 |
| `GET /api/orders/[token]` | 200 | 404 |
| `POST /api/payments/verify` | 200 | 404, 409 |
| `POST /api/mock-gateway/[ref]/settle` | 200 | 404, 422 |
| `POST/PATCH/DELETE /api/admin/destinations*` | 201/200/204 | 401, 403, 409, 422 |
| `POST/PATCH/DELETE /api/admin/packages*` | 201/200/204 | 401, 403, 409, 422 |
| `POST /api/admin/destinations/enrich` | 200 | 401, 403, 404, 503 |
| `GET /api/admin/orders` · `GET /api/admin/payments` | 200 | 401, 403, 422 |
| `POST /api/admin/orders/[id]/notification/resend` | 200 / 202 | 401, 403, 409, 502 |
