# AGENTS.md — repository working rules

Scope: this file governs **how** work is done in this repository. Product scope lives in
[`docs/mvp-scope.md`](docs/mvp-scope.md); architecture in
[`docs/architecture.md`](docs/architecture.md). Do not duplicate those documents here.

Status: `Approved` (documentation phase). Application code does not exist yet.

## Workflow

1. Read the relevant document under `docs/` before changing code.
2. Analyse first; propose the change; wait for explicit permission; then execute.
3. Keep the change inside the approved scope. New scope needs a new proposal.
4. Update documentation in the same change when behaviour, constraints, or contracts move.

## Commands (approved)

```bash
npm run dev            # Next.js dev server
npm run build          # production build
npm run lint           # lint
npm run test           # Vitest unit
npm run test:int       # Vitest integration (needs `npx supabase start`)
npm run test:e2e       # Playwright (needs `npx supabase start` + `MOCK_GATEWAY_ENABLED=true`)
npx supabase start     # local Postgres + Auth (Docker)
npx supabase db reset  # apply migrations + seed
```

## Where things live

| Concern | Location |
| --- | --- |
| Pages, layouts, route handlers | `src/app/**` |
| Route protection (Next 16) | `src/proxy.ts` — must export `proxy`, not `middleware` |
| Presentational components | `src/components/{ui,store,admin,layout}` |
| Domain rules, Zod schemas, queries | `src/modules/{catalog,orders,payments,automation,auth}` |
| Supabase clients | `src/lib/supabase/{browser,server,admin}.ts` |
| Logging (single entry point) | `src/lib/logger.ts` |
| SQL migrations and functions | `supabase/migrations/*.sql` |
| Tests | `tests/{unit,integration,e2e}` |

Hard rules:

- Domain logic and SQL belong to a module. `components/ui/*` is presentational only: no
  Supabase import, no business rule, no price arithmetic.
- Every transactional write goes through a Postgres function. Never chain multiple
  Supabase JS statements and call it a transaction.
- Prices are computed server-side from `packages.price_idr`. A price coming from the
  browser is never trusted.

## Forbidden patterns

| Forbidden | Why |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` (or any secret) in client code or `NEXT_PUBLIC_*` | Key leak = full RLS bypass |
| Importing `lib/supabase/admin.ts` from a client component | Service client is server-only; keep `import 'server-only'` in the module |
| Storing or logging the capability token in plaintext (DB, logs, analytics, error reports) | Token is the only authorization for a guest order |
| `console.log(req.url)` / logging raw headers | Leaks capability paths and `Idempotency-Key` |
| Any third-party script, font, image host, or analytics call on `/orders/*` | Capability URL must not leave the origin via `Referer` |
| Cron jobs, schedulers, queues, workers, `setInterval` dispatch loops | Out of MVP scope; recovery is lease reclaim + admin resend |
| `middleware.ts` | Next 16 uses `proxy.ts` |
| `z.string().email()` style Zod v3 API | Zod v4: `z.email()`, `z.uuid()`, strict objects |
| `tailwind.config.js` | Tailwind v4 is CSS-first (`@import "tailwindcss"` + `@theme`) |
| Modifying an order or payment status outside `settle_payment` | Single authority for state transitions |
| Returning a service-role row without an explicit column list and a Zod DTO | Service role bypasses RLS, so a bare row leaks `access_token_hash`, unmasked PII, and internal ids |
| Calling `settle_payment` with an outcome taken from the request body | The outcome must come from `adapter.fetchSettlement()` only |
| `grant select on packages to service_role` | Checkout resolves `packageSlug` through the public (anon) read path; the RPC reads packages as its owner |
| INSERT/UPDATE/DELETE grants on the five transactional tables to any client role or to `service_role` | The five `SECURITY DEFINER` functions are the only writer path (single-writer) |

## Constants that need an ADR to change

These are load-bearing; changing them silently invalidates tests and documented
guarantees.

| Constant | Value | Documented in |
| --- | --- | --- |
| Outbox lease / staleness window | 120 s | `docs/technical-decisions.md` ADR-9 |
| n8n HTTP timeout | 10 s | `docs/technical-decisions.md` ADR-9 |
| Outbox retry inside one claim | 1 attempt | ADR-9 |
| Outbox `attempts` ceiling | 5 | ADR-9 |
| Idempotency replay window | 24 h | ADR-6 |
| Capability token entropy / length | 32 bytes / 43 chars base64url | ADR-5 |
| Admin list page size | 10 | ADR-12 |
| Order quantity limit | 1..5 | `docs/database-design.md` |

## Verification gates

Before reporting a change as done:

- `npm run lint`, `npm run test`, `npm run test:int`, `npm run test:e2e` (as available).
- Migrations apply cleanly from empty (`npx supabase db reset`).
- No secret or capability token appears in build output or client bundles.
- Documentation that states behaviour still matches the code.
- No unrelated files changed; no user work overwritten.

## Documentation status vocabulary

Use exactly these labels. They are metadata, not workflow states.

- `Proposed` — recommendation, not yet accepted.
- `Approved` — accepted by the project owner.
- `Implemented` — code exists and is committed.
- `Verified` — implemented and confirmed by a passing test or manual check.

Never write `Implemented` for a plan.

## Language and naming

- Documentation in Indonesian; identifiers, filenames, table/column names, endpoints, and
  technical terms in English.
- Timezone: store `timestamptz` in UTC, render in `Asia/Jakarta` through one formatter
  (`src/lib/format.ts`). No ad-hoc date formatting in components.
- Currency: integer IDR. No floats for money.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
