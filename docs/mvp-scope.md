# MVP Scope

Status: `Approved` (26 Nov 2026). Implementation: **none**. Tests: **none**.

Scope authority for this project. Acceptance criteria here are the definition of done.
Architecture in [`architecture.md`](architecture.md); contracts in
[`api-contract.md`](api-contract.md) and [`database-design.md`](database-design.md).

## 1. Goal

A demonstrable travel connectivity store: a guest can buy a travel data package and see the
resulting order status; an admin can curate the catalogue and monitor orders and payments;
the backend enforces payment integrity (idempotency, server-side verification, single
payment per order) and notifies through one n8n workflow.

## 2. In scope

| Area | Included |
| --- | --- |
| Storefront | Homepage, destination list, packages per destination, package detail |
| Checkout | Guest form (name, email, phone, quantity 1–5), server-computed price, idempotent order creation |
| Payment | Simulated gateway page, server-side settlement verification, terminal states |
| Order access | Capability link, status page, uniform 404 for invalid tokens |
| Admin | Supabase Auth login, overview, CRUD destinations, CRUD packages, orders list, payments list, notification resend |
| Admin lists | 24h / 7d / 30d range, status filter, search, keyset pagination, 10 rows |
| Integration | `countriesnow.space` on-demand enrichment with static fallback |
| Automation | One n8n workflow, transactional outbox, at-least-once delivery, `notificationId` |
| Security | RLS on all tables, server-side admin authorization, hash-only capability token, header hardening, log redaction |
| Testing | Vitest unit + integration, Playwright (2 flows), manual responsive check |
| Documentation | This set (8 files) |

## 3. Out of scope

Customer accounts and dashboards, real eSIM provisioning, refunds and cancellations,
discounts/coupons, multi-currency and FX, referral/loyalty, multi-tenancy, i18n, carts,
wishlists, reviews, blog/CMS content, real payment provider integration, automatic order
expiration, cron/scheduler/queue/worker, exactly-once notification delivery, numbered
pagination/infinite scroll, load-more, decorative dashboards, analytics, A/B testing.

Any of these requires a new proposal — not a "while I am here" addition.

## 4. Functional requirements

### 4.1 Customer (`FR-C`)

| ID | Requirement |
| --- | --- |
| FR-C1 | The homepage lists up to 5 featured destinations with photo, name, region, and "from" price |
| FR-C2 | `/destinations` lists all active destinations; inactive ones never appear |
| FR-C3 | `/destinations/[slug]` shows active packages of that destination with data volume, validity, network, and price |
| FR-C4 | `/packages/[slug]` shows package detail plus a checkout CTA; unknown or inactive → 404 |
| FR-C5 | Checkout requires package slug, quantity 1–5, name, email, phone; price is never taken from the browser |
| FR-C6 | Checkout is idempotent via `Idempotency-Key`: at most one order per key |
| FR-C7 | After order creation the customer is redirected to the simulated gateway page |
| FR-C8 | `/orders/[token]` shows order status, payment status, package, destination, totals, and masked email |
| FR-C9 | A `failed` order is terminal and offers "Start a new order" |
| FR-C10 | Invalid or missing token returns a uniform 404 |

### 4.2 Payment (`FR-P`)

| ID | Requirement |
| --- | --- |
| FR-P1 | The simulated gateway offers exactly three outcomes: `succeeded`, `failed`, `pending` |
| FR-P2 | The gateway writes only to `mock_gateway_transactions`; it cannot modify `orders` or `payments` |
| FR-P3 | The browser never submits an order or payment status; status is re-read server-side via the adapter |
| FR-P4 | Only `settle_payment` may change payment/order status, guarded by `status = 'pending'` |
| FR-P5 | One payment record per order (`UNIQUE (order_id)`); a second payment is impossible |
| FR-P6 | `succeeded` → order `paid`; `failed` → order `failed`; `pending` changes nothing |
| FR-P7 | Repeating verification is safe and returns the final state |
| FR-P8 | The gateway is disabled (`404`) when `MOCK_GATEWAY_ENABLED` is false |

### 4.3 Admin (`FR-A`)

| ID | Requirement |
| --- | --- |
| FR-A1 | Login uses Supabase Auth; unauthenticated `/admin/*` requests are redirected/401 |
| FR-A2 | `requireAdmin()` enforces `app_metadata.role === 'admin'` on every admin route and page |
| FR-A3 | Overview shows orders today, paid today, pending count, and the 5 newest orders |
| FR-A4 | Destinations: list, create, update, delete; delete blocked while packages exist |
| FR-A5 | Packages: list (filterable by destination), create, update, delete; delete blocked while orders reference it |
| FR-A6 | "Fill from API" fills currency/ISO/flag from `countriesnow.space`; failure is non-blocking |
| FR-A7 | Orders list: range 24h/7d/30d, status filter, search on order number or email, 10 rows, newest first |
| FR-A8 | Payments list: same range/status filters, 10 rows, newest first |
| FR-A9 | Timestamps render in `Asia/Jakarta`; storage stays UTC |
| FR-A10 | Admin can resend the order-paid notification for a paid order |

### 4.4 Notification (`FR-N`)

| ID | Requirement |
| --- | --- |
| FR-N1 | The outbox row is inserted in the same transaction as the successful settlement |
| FR-N2 | Dispatch happens after the response (`after()`) or via admin resend, always through `claim_outbox` |
| FR-N3 | One claim per row per lease; a concurrent caller receives `none` and sends nothing |
| FR-N4 | `finish_outbox` only acts when `locked_at` matches the caller's claim |
| FR-N5 | Payload is minimal and includes a stable `notificationId` |
| FR-N6 | A failed or interrupted dispatch never alters order/payment state |

### 4.5 External integration (`FR-X`)

| ID | Requirement |
| --- | --- |
| FR-X1 | Exactly one external API: `countriesnow.space`, no key, called only from the admin enrich action |
| FR-X2 | Timeout 5 s, one retry, then `503`; the destination form remains submittable manually |
| FR-X3 | The storefront must render completely when the external API is unreachable |

## 5. Non-functional requirements

| ID | Requirement |
| --- | --- |
| NFR1 | Node.js >= 22.12; Next.js 16.4.6; React 19.3.1; Tailwind 4.3.5; Zod 4.6.7 |
| NFR2 | No secret in client bundles; service role key server-only |
| NFR3 | Admin list queries: 10 rows, keyset pagination, explicit column selection, no N+1 |
| NFR4 | Idempotency survives 10 concurrent requests |
| NFR5 | All state transitions atomic inside Postgres functions |
| NFR6 | Order page: zero third-party requests; `no-referrer`, `no-store`, `noindex` |
| NFR7 | No token, key, or hash in logs, error messages, or API bodies |
| NFR8 | Responsive at 375px, 768px, 1280px with no horizontal scroll |
| NFR9 | Body text contrast ≥ 4.5:1; keyboard-completable flows |
| NFR10 | Migrations apply from empty in one command (`npx supabase db reset`) |
| NFR11 | No cron, scheduler, queue, broker, or worker in the codebase |

## 6. Acceptance criteria

### 6.1 Checkout and order (`AC-C`)

| ID | Criterion |
| --- | --- |
| AC-C1 | Guest completes homepage → destination → package → checkout and receives an order number, capability link, and payment link |
| AC-C2 | Total equals `packages.price_idr × quantity`; a `price` field in the request yields `422` |
| AC-C3 | The order stores package and destination name snapshots; later edits do not change the order |
| AC-C4 | `quantity` outside 1..5 → `422` |
| AC-C5 | Invalid email/phone → `422` with a field-level message |
| AC-C6 | Checkout for an inactive or unknown package → `404`/`409`, no order created |
| AC-C7 | The order page renders all facts for a valid token and a uniform 404 for anything else |
| AC-C8 | `failed` order shows a terminal message and a "Start a new order" action that works |

### 6.2 Payment (`AC-P`)

| ID | Criterion |
| --- | --- |
| AC-P1 | Simulated `succeeded` → payment `succeeded`, order `paid`, `paid_at` set |
| AC-P2 | Simulated `failed` → payment `failed`, order `failed`; no outbox row |
| AC-P3 | Simulated `pending` → no state change; re-verification later still works |
| AC-P4 | A second settlement attempt on a final payment returns `409 PAYMENT_ALREADY_FINAL` and changes nothing |
| AC-P5 | Direct insert of a second `payments` row for one order fails on `UNIQUE (order_id)` |
| AC-P6 | `POST /api/mock-gateway/[ref]/settle` leaves `orders` and `payments` byte-identical (snapshot before/after) |
| AC-P7 | With `MOCK_GATEWAY_ENABLED=false`, the simulation route returns `404` |

### 6.3 Admin (`AC-A`)

| ID | Criterion |
| --- | --- |
| AC-A1 | Admin login succeeds with a seeded admin user; wrong credentials fail with a safe message |
| AC-A2 | `/admin/*` without a session → redirect to login; `/api/admin/*` without a session → `401` |
| AC-A3 | A logged-in non-admin session → `403` on admin APIs |
| AC-A4 | Create/edit/deactivate a package; the storefront reflects the change immediately |
| AC-A5 | Range/status/search filters and keyset pagination behave correctly; page size never exceeds 10 |
| AC-A6 | Deleting a destination with packages → `409 DESTINATION_IN_USE` |
| AC-A7 | Timestamps display in WIB and are stored UTC |

### 6.4 Security and outbox (`AC-T`)

| ID | Criterion |
| --- | --- |
| AC-T1 | `GET /orders/{valid}` response carries `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow` |
| AC-T2 | The order page issues **zero** cross-origin requests |
| AC-T3 | `GET /orders/{invalid}` and `GET /orders/{random}` both return `404` with identical bodies |
| AC-T4 | Captured request logs contain no 43-character token substring and no raw `Idempotency-Key` |
| AC-T5 | `orders` has no plaintext token column; `access_token_hash` is 64 hex chars and unique |
| AC-T6 | Replaying the same key and payload returns the identical `capabilityUrl`, and that URL still works |
| AC-T7 | Replaying after the 24 h window returns `409 IDEMPOTENCY_EXPIRED` and the order count does not increase |
| AC-T8 | Ten concurrent checkouts with one key produce exactly one order and one payment |
| AC-T9 | The same key with a different payload returns `409 IDEMPOTENCY_CONFLICT` and creates nothing |
| AC-T10 | **Within an active lease**, two concurrent dispatches (after + resend, or resend + resend) produce exactly one claim and exactly one HTTP call to n8n; the loser receives `outcome = none` and sends nothing |
| AC-T11 | **At-least-once**: if the process dies after the HTTP call but before `finish_outbox`, the row stays `processing`; after the 120 s lease it is reclaimable **while `attempts < 5`**, so a **repeat delivery is possible**. When the 5th claim is lost, the next `claim_outbox` call sweeps the row to terminal `failed` (`last_error = 'lease_expired_after_max_attempts'`); recovery from that state is a documented operator action, not an application path. Exactly-once is never claimed |
| AC-T12 | Resend while the row is `processing` inside its lease → `409 NOTIFICATION_IN_FLIGHT`, no delivery |
| AC-T13 | `finish_outbox` with a stale `locked_at` → `outcome = stale`; `status`, `sent_at`, and `last_error` are unchanged |
| AC-T14 | n8n HTTP timeout is 10 s and the lease is 120 s; one dispatch including the in-claim retry cannot exceed 20 s |
| AC-T15 | Every webhook payload contains `notificationId` equal to `notification_outbox.id`, stable across resends, so a receiver can deduplicate |
| AC-T16 | At most one outbox row per order (`UNIQUE (order_id)`); payload contains no capability token and no capability URL |
| AC-T17 | Documentation review: no "exactly-once" or "guaranteed delivered once" claim appears except as an explicit negation |

### 6.5 External integration (`AC-E`)

| ID | Criterion |
| --- | --- |
| AC-E1 | "Fill from API" populates `currencyCode`, `countryCode`, `flagEmoji` for a supported country and writes nothing |
| AC-E2 | With the upstream unreachable, the action returns `503` and the form can still be submitted manually |
| AC-E3 | Every storefront page renders with the external API offline |

## 7. Mandatory technical-test checklist

| Requirement from the brief | Where it is satisfied | Proof required at submission |
| --- | --- | --- |
| Product concept and travel-connectivity relevance | README, storefront flows | Screenshots of home → destination → checkout |
| System structure and module separation | `docs/architecture.md`, module folders | Folder tree + `architecture.md` diagrams |
| Architecture implementation | Modular monolith, 5 SQL functions | Code reading + integration tests |
| External API integration | `countriesnow.space` enrich | Screenshot or test output of a successful enrich and a `503` fallback |
| Payment gateway (mock allowed) | Adapter + simulated PSP, server-side verification | Checkout-to-paid walkthrough + AC-P1..P7 results |
| Idempotency | `unique(scope,key)`, payload hash, sealed replay, 24 h window | AC-T6..T9, parallel test output |
| Single payment per order | `payments.order_id UNIQUE`, guarded transitions | AC-P4, AC-P5 |
| n8n automation | One workflow, outbox, `X-Webhook-Secret` | Workflow JSON/screenshot + delivered notification + AC-T10..T16 |
| Admin CMS | Login, CRUD, orders/payments lists with filters | Screenshots of each admin screen |
| Server-side pagination (10/response, server filters) | Admin routes, keyset cursor | Network panel / test asserting `limit <= 10` |
| Security: RLS, admin auth, secrets, webhook secret | ADR-5, ADR-10, RLS policies | RLS integration tests + header test |
| Guest order access safety | Capability token, hash-only, uniform 404 | AC-T1..T5 |
| Testing quality | Vitest unit + integration, Playwright 2 flows | Test output + this acceptance table |
| Required documentation | 8 files in this repo | Documentation map in README |
| Design quality and responsiveness | `docs/design-solution.md` | Desktop + 375px screenshots |

## 8. Definition of done

A requirement is done when: code exists, its acceptance criteria pass, related documentation
matches the behaviour, and nothing outside the approved scope changed. A requirement is
`Verified` only after a passing test or a recorded manual check — not after it is written.

## 9. Assumptions

| # | Assumption | Impact if wrong |
| --- | --- | --- |
| A1 | The demo runs on a local Supabase stack (Docker) or a disposable hosted project | Hosted-only operations would need migrations applied manually |
| A2 | One admin account is seeded; no admin user management UI | Adding admin invites is out of scope |
| A3 | Five destinations and 15 packages are enough to demonstrate the catalogue | More data is a seed edit, not a code change |
| A4 | Email delivery for the n8n workflow uses a channel the author already has (SMTP/Gmail or chat) | If unavailable, the n8n run is demonstrated with a log/HTTP sink |
| A5 | Visual approval of the candidate photography happens before images are committed | If rejected, swap to the alt candidate and record attribution |
| A6 | Indonesian rupiah only, quantity 1–5 per order | Multi-currency or bulk purchase would need new scope |
| A7 | The examiner accepts a simulated payment provider as the brief allows | A real sandbox would require merchant credentials and is out of scope |
