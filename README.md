# Roamly — Travel Connectivity Store

A travel connectivity store: international travel eSIM / data-plan storefront with a
minimal admin CMS, built as a Next.js **modular monolith** on Supabase.

## Status

| Layer | Status |
| --- | --- |
| Product & technical design (this documentation set) | **Approved** — 26 Nov 2026 |
| Application code, migrations, tests | **Partial** — E-3 schema/RLS/SQL functions, the E-4 storefront, the E-5 checkout/payment/order flow, the E-6 admin CMS, and the E-7 notification dispatcher (outbox → n8n) exist; the email demo needs the owner's SMTP credential, and Playwright is pending (E-8) |
| Automated test suite | **Partial** — 205 unit tests + 95 integration tests; Playwright pending (E-8). Integration tests need a local Supabase stack and are **not** run by CI |
| Deployment | **Not configured** |

Nothing in this repository has been executed yet. Every document describes the approved
plan, not verified behaviour. Claims are labelled `Proposed`, `Approved`, `Implemented`,
or `Verified`; read the label before trusting a statement.

- Scope and acceptance criteria: [`docs/mvp-scope.md`](docs/mvp-scope.md)
- System shape: [`docs/architecture.md`](docs/architecture.md)
- Decisions and trade-offs: [`docs/technical-decisions.md`](docs/technical-decisions.md)
- Data model and constraints: [`docs/database-design.md`](docs/database-design.md)
- HTTP contract: [`docs/api-contract.md`](docs/api-contract.md)
- UI, tokens, assets: [`docs/design-solution.md`](docs/design-solution.md)
- AI/repo working rules: [`AGENTS.md`](AGENTS.md)

## Product concept

A traveller picks a destination, picks a data package, checks out **without creating an
account**, pays through a simulated gateway, and tracks the order from a capability link.

The admin is the only authenticated role. The admin curates destinations and packages —
the same rows the storefront reads — and monitors orders and payments.

Positioning is *editorial travel-tech*: warm off-white paper, dark navy ink, forest/teal
accent, destination photography as the primary visual element.

## Features (MVP)

Customer:

- Homepage with featured destinations.
- Destination listing with a region filter, and packages per destination.
- Package detail (`/destinations/[destinationSlug]/packages/[packageSlug]`) with a checkout CTA.
- Guest checkout (name, email, phone) with idempotent order creation.
- Mock payment page (success / failed / pending simulation).
- Order status page via capability link.

Admin:

- Supabase Auth login, server-enforced authorization.
- Overview with the operational numbers that matter.
- CRUD destinations (with optional country-data enrichment).
- CRUD packages.
- Orders and payments lists: 24h / 7d / 30d range filter, status filter, search, 10 rows per page.
- Manual resend of the order-paid notification.

Platform behaviour:

- Idempotent checkout: one `Idempotency-Key` produces at most one order.
- Payment status only changes through server-side verification.
- One payment record per order; `failed` is terminal.
- Transactional outbox → n8n webhook for the order confirmation notification.
- One external API used on demand for country data enrichment, with a static fallback.

Explicitly out of scope: customer accounts, real eSIM provisioning, refunds, discounts,
multi-currency, referral/loyalty, multi-tenancy, real payment provider integration.

## Tech stack

Versions verified against the npm registry on 26 Nov 2026.

| Concern | Choice | Version |
| --- | --- | --- |
| Framework | Next.js (App Router) | 16.4.6 |
| UI runtime | React / React DOM | 19.3.1 |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS (+ `@tailwindcss/postcss`) | 4.3.5 |
| Database / Auth | Supabase (Postgres, Auth, RLS) | `@supabase/supabase-js` 2.119.2, `@supabase/ssr` 0.12.7 |
| Validation | Zod | 4.6.7 |
| Unit / integration tests | Vitest | 5.1.2 |
| End-to-end tests | Playwright | 1.65.1 |
| Automation | n8n (Docker) | 2.49.7 |

Runtime floor: **Node.js >= 22.12** (imposed by Vitest 5 and `@supabase/supabase-js` 2.119,
both stricter than Next 16's `>= 20.9`). Pin this in `engines`.

Next.js 16 notes that the implementation must respect:

- Route protection lives in `src/proxy.ts` (`export function proxy`); `middleware.ts` is
  the legacy name and edge runtime is not supported in `proxy`.
- Request APIs (`cookies()`, `headers()`, `params`, `searchParams`) are async.
- `after()` from `next/server` schedules post-response work in Route Handlers.

## Architecture summary

Four responsibilities, one deployable unit:

1. **Presentation** — `app/(store)`, `app/admin`, `app/mock-gateway`, `components/*`.
2. **Application modules** — `modules/catalog`, `orders`, `payments`, `automation`, `auth`.
3. **Data** — `lib/supabase/{browser,server,admin}`, SQL migrations, 5 Postgres functions.
4. **Integrations** — payment adapter (mock), country-data client, n8n client.

Transactional writes (`create_order_idempotent`, `settle_payment`, `claim_outbox`,
`finish_outbox`) are Postgres functions, because the Supabase JS client cannot span a
multi-statement transaction. Business rules and response composition stay in the modules.

See [`docs/architecture.md`](docs/architecture.md).

## Prerequisites

- Node.js >= 22.12 and npm.
- Docker (local Supabase stack, n8n container).
- No prior `npm install` for the documentation phase.

## Installation

Not yet executed — these are the approved steps for implementation.

```bash
npm install
npx supabase start          # local Postgres + Auth + RLS environment
npx supabase db reset       # apply migrations + seed

# Create (or repair) the single admin account. The credentials are used for this run only
# and are never committed; the role is written to app_metadata (never user_metadata).
ADMIN_EMAIL=admin@roamly.test ADMIN_PASSWORD='choose-a-strong-password' npm run db:seed-admin

npm run dev                 # http://localhost:3000  · admin panel: http://localhost:3000/admin/login
```

The seed script is idempotent: an existing account only gets its `app_metadata.role` repaired, its
password is left untouched. It refuses a non-loopback Supabase URL unless `--allow-remote` is passed.

## Environment variables

| Variable | Scope | Required | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | yes | Anon key, RLS-bound |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | yes | Bypasses RLS; used only after explicit authorization |
| `IDEMPOTENCY_TOKEN_KEY` | **server only** | yes | 32-byte base64 key for AES-256-GCM sealing of replay tokens |
| `N8N_WEBHOOK_URL` | **server only** | yes | n8n webhook endpoint |
| `N8N_WEBHOOK_SECRET` | **server only** | yes | Value sent as `X-Webhook-Secret` |
| `MOCK_GATEWAY_ENABLED` | server | yes | Enables the simulated PSP routes; must be `false` in production |
| `NEXT_PUBLIC_APP_URL` | client + server | yes | Base URL used to build capability links |

No other secret is required. There is no analytics SDK, no error-monitoring SDK, and no
payment provider key in the MVP.

## Running

```bash
npm run dev        # development
npm run build      # production build
npm run start      # production server
npm run lint       # lint
npm run test       # Vitest (unit)
npm run test:int   # Vitest (integration, requires local Supabase)
npm run test:e2e   # Playwright
```

## Testing

- **Vitest unit** — price calculation, checkout validation, token sealing/opening, log
  redaction, order status transitions, outbox claim guards, payload minimisation.
- **Vitest integration** — against a disposable local Supabase instance: unique
  constraints, idempotency under concurrency, RLS/authorization, outbox claim fencing.
- **Playwright** — two flows only: guest checkout to simulated success, and admin login
  plus package management.
- Responsive layout and visual quality are checked manually.

Details and the case list: [`docs/mvp-scope.md`](docs/mvp-scope.md) and
[`docs/technical-decisions.md`](docs/technical-decisions.md).

## Notification email (n8n)

After a payment is verified and `settle_payment` commits, the order-paid notification is
delivered asynchronously:

```text
verify (server)  →  settle_payment  →  notification_outbox (status=pending, payload frozen)
                 →  after() → dispatcher: claim_outbox → POST n8n (+ X-Webhook-Secret)
                 →  finish_outbox(sent | failed)
                 →  n8n workflow → SMTP provider → inbox
```

Only the confirmation email for a **successful** payment is implemented. Pending or failed
payments send nothing.

The email timestamp is rendered as WIB (UTC+7) **deterministically**: the workflow shifts the
UTC instant by a fixed seven hours and reads the UTC parts, so it does not depend on `Intl`,
`toLocaleString`, or ICU data in the n8n runtime. Day, month, and year rollovers follow from
the shifted instant.

### Environment

| Variable | Purpose |
| --- | --- |
| `N8N_WEBHOOK_URL` | Production webhook URL of the workflow below |
| `N8N_WEBHOOK_SECRET` | Value sent in the `X-Webhook-Secret` header (min 16 chars) |

Both are server-only and already part of the server environment schema. The dispatcher never
sends the Supabase service-role key, the capability token, or any password to n8n.

### Manual setup (once, not automated)

1. **Header Auth credential** — n8n → *Credentials → New → Header Auth*:
   name `X-Webhook-Secret`, value = your `N8N_WEBHOOK_SECRET`.
2. **SMTP credential** — n8n → *Credentials → New → SMTP* using a **test mailbox**
   (Mailtrap / Ethereal / a local sink). No credentials are stored in this repository.
3. **Import the workflow** — *Workflows → Import from File* → `n8n/order-paid-email.json`.
   Then select the Header Auth credential on the *Webhook* node and the SMTP credential on the
   *Send Email* node, and replace the placeholder `From Email` (`orders@example.com`).
4. **Activate** the workflow and copy its **Production URL** into `N8N_WEBHOOK_URL`.

### Demonstrating it

1. Checkout → mock gateway → **succeed** → the order becomes `paid`.
2. Admin → Orders: the notification badge goes `pending` → `processing` → `sent`.
3. n8n *Executions* shows one successful run; the test mailbox receives an email whose footer
   carries the same `notificationId`.
4. Admin → Orders → **Resend** calls `POST /api/admin/orders/[id]/notification/resend`:
   an already-`sent` row answers `202 skipped`, a row inside its 120 s lease answers `409`,
   and a row at the 5-attempt ceiling answers `202 skipped` without dispatching.

### Failure behaviour to demonstrate

| Scenario | Expected |
| --- | --- |
| Stop n8n, then Resend | `502 NOTIFICATION_DELIVERY_FAILED`, `last_error = n8n_network`, **order stays paid** |
| Wrong `N8N_WEBHOOK_SECRET` | n8n answers 403 → recorded as `n8n_http_403`, **no retry** (permanent) |
| n8n answers 5xx | one retry inside the claim, then `n8n_http_<status>` |
| Two resends at once | exactly one claim and one HTTP call; the loser gets `none` / `409` |
| Process dies after the HTTP call | the row stays `processing`; after the 120 s lease it is reclaimable (a duplicate email is possible) |

### What `sent` does and does not mean

`sent` means **n8n returned 2xx after its SMTP node reported that the provider accepted the
message**. It is **not** proof of inbox delivery or reading. Delivery is **at-least-once**: a
timeout, a retry, or a crash between the call and `finish_outbox` can produce a duplicate
email. `notificationId` is stable so a receiver can deduplicate; exactly-once is not claimed.
`attempts` is capped at 5 by the database; a row that reaches the ceiling is terminal for
dispatch, and its recovery is the documented operator runbook (ADR-9), not an API call.

`after()` is a post-response hook, not a durable queue: if the server stops before the
callback runs, the row stays `pending` and only the admin resend delivers it. That state is
visible as the notification badge in the admin order list.

### Not verified in this repository

- **Workflow import**: `n8n/order-paid-email.json` is a plain export with placeholder
  credentials and `active: false`; importing it into a real n8n instance was not exercised
  here (no instance available). Node type versions may need a one-time adjustment on import;
  the Setup sticky note inside the workflow lists the two credentials to select.
- **Real email delivery**: requires the owner's SMTP credential. Automated tests cover the
  dispatcher, payload validation, retry/failure classification, and the resulting database
  state, but no email has been sent from this environment.
- **Integration tests in CI**: the suite needs a local Supabase stack (Docker), so it runs
  locally, not in the GitHub Actions workflow.

## Limitations (deliberate, MVP)

1. **The mock gateway is a simulation, not evidence of a production payment integration.**
   There is no PSP SDK, no card data, no provider signature verification, no settlement or
   reconciliation. What the design demonstrates is the shape: a payment adapter, a
   server-side verification step, idempotency, and database-enforced single payment.
2. **Pending orders never expire automatically.** There is no cron, job, TTL, or queue.
   An order stays `pending` until verification yields `paid` or `failed`. No stock or price
   is reserved, so this has no business consequence in the MVP.
3. **`after()` is not a durable queue.** Notification dispatch happens after the response
   and is not guaranteed. Durable state lives in `notification_outbox`; recovery is the
   bounded lease reclaim (120 s) plus the admin "Resend" action. Delivery is
   **at-least-once**, never exactly-once; duplicates are the receiver's problem and are
   deduplicated with `notificationId`.
4. **Order access is a capability link.** Anyone holding the 43-character token can view
   the order. Mitigations: hash-only storage, `no-referrer`, `no-store`, `noindex`, zero
   third-party requests on the order page, redacted logs. Infrastructure access logs remain
   a residual risk.
5. **Guest checkout has no account recovery.** A lost capability link means the customer
   must contact the admin.
6. **Country data enrichment is best-effort.** The external API is optional; if it is
   unavailable, admins enter currency/region manually.
7. **Single-currency (IDR) and single quantity model.** No FX, no multi-currency, no carts.
8. **Storefront copy is English**, while the order snapshot text stored by the database
   (`orders.package_data_snapshot`) is Indonesian. The two are intentionally different:
   one is UI copy, the other is frozen order data.
9. **Destination photography is hot-linked from Wikimedia Commons.** The source can answer
    **HTTP 429** intermittently (per-IP rate limiting); this is an external risk that is
    mitigated, not removed. Mitigations: bounded `next/image` variants plus a one-day image
    cache, and a fallback that shows a sand panel with the flag emoji and the destination
    name when the request fails (verified manually with the image request blocked).
10. **The five destination photos are used as-is for the MVP.** Final asset selection is
    deferred to post-MVP. Each photo's licence credit is stored in
    `destinations.hero_image_attribution` and rendered on the destination page.
11. **The NFR9 contrast ratio has not been measured.** Colours are defined once in
    `src/app/globals.css`; the ≥ 4.5:1 audit is deferred to post-MVP.

## Documentation map

| Document | Question it answers |
| --- | --- |
| [`docs/mvp-scope.md`](docs/mvp-scope.md) | What is in scope, and how do we know it is done? |
| [`docs/architecture.md`](docs/architecture.md) | How is the system shaped and how does data move? |
| [`docs/technical-decisions.md`](docs/technical-decisions.md) | Why these choices, what was rejected, what is accepted? |
| [`docs/database-design.md`](docs/database-design.md) | What tables, constraints, indexes, policies, functions? |
| [`docs/api-contract.md`](docs/api-contract.md) | What are the endpoints, payloads, headers, errors? |
| [`docs/design-solution.md`](docs/design-solution.md) | How should it look and what imagery is used? |
| [`AGENTS.md`](AGENTS.md) | How should an AI agent work in this repository? |
