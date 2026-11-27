# Roamly — Travel Connectivity Store

A travel connectivity store: international travel eSIM / data-plan storefront with a
minimal admin CMS, built as a Next.js **modular monolith** on Supabase.

## Status

| Layer | Status |
| --- | --- |
| Product & technical design (this documentation set) | **Approved** — 26 Nov 2026 |
| Application code, migrations, tests | **Partial** — E-3 schema, RLS, SQL functions, and the integration suite exist; feature routes/pages do not |
| Automated test suite | **Partial** — 11 unit tests + 85 integration tests; Playwright pending (E-8) |
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
- Destination listing and packages per destination.
- Package detail with server-computed price.
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
npm run dev                 # http://localhost:3000
```

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
