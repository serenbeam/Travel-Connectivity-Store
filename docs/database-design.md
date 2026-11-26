# Database Design

Status: `Approved`. Migrations: **not created yet**.

This document is the authority for tables, constraints, indexes, RLS policies, and SQL
function signatures. Rationale for the approach is in
[`technical-decisions.md`](technical-decisions.md) (ADR-4, ADR-5, ADR-6, ADR-9);
endpoints that call these objects are in [`api-contract.md`](api-contract.md).

Conventions:

- Primary key `uuid` with `gen_random_uuid()`.
- Money is `integer` IDR. No `numeric`, no floats.
- Time is `timestamptz`, stored UTC, rendered `Asia/Jakarta` by `src/lib/format.ts`.
- Status values are `text` + `CHECK` (simpler migrations than native enums, same guarantee).
- `updated_at` maintained by a single `set_updated_at()` trigger on mutable tables.
- `pgcrypto` is **not** required: tokens, hashes, and encryption happen in Node (ADR-6).

## 1. ERD

```mermaid
erDiagram
  destinations ||--o{ packages : "has"
  destinations ||--o{ orders : "referenced by"
  packages ||--o{ orders : "referenced by"
  orders ||--|| payments : "exactly one"
  orders ||--o| idempotency_keys : "checkout result"
  orders ||--o| notification_outbox : "at most one"

  destinations {
    uuid id PK
    text slug UK
    char2 country_code UK
    text name
    text region
    char3 currency_code
    text flag_emoji
    bool is_active
  }
  packages {
    uuid id PK
    uuid destination_id FK
    text slug
    int price_idr
    bool is_active
  }
  orders {
    uuid id PK
    text order_number UK
    text access_token_hash UK
    uuid package_id FK
    int total_idr
    text status
  }
  payments {
    uuid id PK
    uuid order_id FK "unique"
    text provider_reference UK
    text status
  }
  idempotency_keys {
    uuid id PK
    text scope
    text key
    text request_hash
    text response_token_sealed
  }
  notification_outbox {
    uuid id PK
    uuid order_id FK "unique"
    text status
    timestamptz locked_at
  }
```

Relationship summary:

| Relation | Cardinality | Enforcement |
| --- | --- | --- |
| destination → packages | 1..n | FK, `ON DELETE RESTRICT` |
| order → destination, package | n..1 each | FK `RESTRICT` + name/price snapshots on the order |
| **order → payment** | **exactly 1** | `payments.order_id UNIQUE` (ADR-7 boundary, one attempt) |
| order → idempotency key | 0..1 | nullable `idempotency_keys.order_id` |
| order → outbox row | 0..1 | `notification_outbox.order_id UNIQUE` |

A `mock_gateway_transactions` table also exists; it is owned by the *simulated provider* and
has no FK into business tables — that separation is what makes it structurally impossible
for the simulation page to change an order.

## 2. Tables

### 2.1 `destinations`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | uuid | PK, default `gen_random_uuid()` |
| `slug` | text | not null, unique, `CHECK (slug ~ '^[a-z0-9-]+$')` |
| `country_code` | char(2) | not null, unique, uppercase |
| `name` | text | not null |
| `region` | text | not null — admin-authored (`Asia`, `Europe`, …), not from the API |
| `currency_code` | char(3) | not null |
| `flag_emoji` | text | null — from `unicodeFlag`, no external CDN |
| `summary` | text | not null, `CHECK (char_length(summary) <= 160)` |
| `description` | text | null |
| `hero_image_url` | text | not null |
| `hero_image_attribution` | text | not null — required for CC BY / CC BY-SA |
| `is_active` | boolean | not null, default `true` |
| `sort_order` | smallint | not null, default `0` |
| `created_at` | timestamptz | not null, default `now()` |
| `updated_at` | timestamptz | not null, default `now()`, trigger |

No `timezone` column: unused by any screen (decision D1 / ADR-8).

### 2.2 `packages`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | uuid | PK |
| `destination_id` | uuid | not null, FK → `destinations(id)` `ON DELETE RESTRICT` |
| `slug` | text | not null |
| `name` | text | not null |
| `data_mb` | integer | null |
| `is_unlimited` | boolean | not null, default `false` |
| `validity_days` | smallint | not null, `CHECK (validity_days BETWEEN 1 AND 90)` |
| `price_idr` | integer | not null, `CHECK (price_idr >= 0)` — **authoritative price** |
| `compare_at_price_idr` | integer | null, `CHECK (compare_at_price_idr IS NULL OR compare_at_price_idr > price_idr)` |
| `network` | text | null |
| `hotspot_allowed` | boolean | not null, default `true` |
| `is_active` | boolean | not null, default `true` |
| `created_at` / `updated_at` | timestamptz | not null, trigger on update |

Table constraints:

```sql
UNIQUE (destination_id, slug)
CHECK (is_unlimited OR data_mb > 0)
```

### 2.3 `orders`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | uuid | PK |
| `order_number` | text | not null, unique, format `RML-[A-Z0-9]{6}` — display only |
| `access_token_hash` | text | not null, unique, `CHECK (char_length = 64)` — SHA-256 hex |
| `destination_id` | uuid | not null, FK → `destinations(id)` `RESTRICT` |
| `package_id` | uuid | not null, FK → `packages(id)` `RESTRICT` |
| `destination_name_snapshot` | text | not null |
| `package_name_snapshot` | text | not null |
| `customer_name` | text | not null |
| `customer_email` | text | not null, stored lowercased |
| `customer_phone` | text | not null, normalized E.164-ish (`+62…`) |
| `quantity` | smallint | not null, default 1, `CHECK (quantity BETWEEN 1 AND 5)` |
| `unit_price_idr` | integer | not null, `CHECK (unit_price_idr >= 0)` |
| `total_idr` | integer | not null, `CHECK (total_idr = unit_price_idr * quantity)` |
| `status` | text | not null, default `'pending'`, `CHECK (status IN ('pending','paid','failed'))` |
| `paid_at` | timestamptz | null |
| `created_at` / `updated_at` | timestamptz | not null, trigger |

There is **no** token column and **no** `expired` status. Snapshots freeze the commercial
terms so a later package edit does not rewrite history.

### 2.4 `payments`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | uuid | PK |
| `order_id` | uuid | **not null, UNIQUE**, FK → `orders(id)` `RESTRICT` |
| `provider` | text | not null, default `'mock'` |
| `provider_reference` | text | not null, unique, format `mock_` + 24 hex |
| `amount_idr` | integer | not null, `CHECK (amount_idr > 0)` |
| `status` | text | not null, default `'pending'`, `CHECK (status IN ('pending','succeeded','failed'))` |
| `failure_code` | text | null |
| `paid_at` | timestamptz | null |
| `created_at` / `updated_at` | timestamptz | not null, trigger |

`UNIQUE (order_id)` is the database-level guarantee that an order cannot be paid twice.
No partial unique index is needed; `failed` is terminal, so no second attempt is modelled.

### 2.5 `idempotency_keys`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | uuid | PK |
| `scope` | text | not null, default `'checkout'` |
| `key` | text | not null, `CHECK (key ~ '^[A-Za-z0-9_-]{22,64}$')` |
| `request_hash` | text | not null, `CHECK (char_length = 64)` |
| `order_id` | uuid | null, FK → `orders(id)` `RESTRICT` |
| `response_status` | smallint | null |
| `response_body` | jsonb | null — `{order_number, payment_ref, total_idr}`, **never a token** |
| `response_token_sealed` | text | null — `v1.<iv>.<tag>.<ct>` (AES-256-GCM, base64url parts) |
| `created_at` | timestamptz | not null, default `now()` |
| `touched_at` | timestamptz | not null, default `now()` |

Table constraints:

```sql
UNIQUE (scope, key)                     -- the idempotency guarantee
CHECK (order_id IS NOT NULL OR response_status IS NULL)  -- no response without an order
```

Rows are never deleted. Replay is refused after 24 h (`IDEMPOTENCY_EXPIRED`), which is
enforced in the function, not by a cleanup job.

### 2.6 `notification_outbox`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | uuid | PK — this value is the `notificationId` in the webhook payload |
| `order_id` | uuid | not null, **UNIQUE**, FK → `orders(id)` `RESTRICT` |
| `payload` | jsonb | not null — minimized, no token, no capability URL |
| `status` | text | not null, default `'pending'`, `CHECK (status IN ('pending','processing','sent','failed'))` |
| `attempts` | smallint | not null, default 0, `CHECK (attempts <= 5)` |
| `locked_at` | timestamptz | null — claim lease timestamp and **fencing token** |
| `sent_at` | timestamptz | null |
| `last_error` | text | null |
| `created_at` | timestamptz | not null, default `now()` |

No `event_type` (one event per order), no `next_attempt_at` (no scheduler).

### 2.7 `mock_gateway_transactions`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | uuid | PK |
| `provider_reference` | text | not null, unique |
| `outcome` | text | not null, `CHECK (outcome IN ('succeeded','failed','pending'))` |
| `note` | text | null |
| `created_at` | timestamptz | not null, default `now()` |

Owned by the simulated provider. No FK to `orders`/`payments`: the simulation route cannot
cascade into business state.

## 3. Indexes

| Index | Definition | Query it serves |
| --- | --- | --- |
| `destinations_active_sort` | `(is_active, sort_order, name)` | storefront listing |
| `packages_dest_active_price` | `(destination_id, is_active, price_idr)` | packages per destination, price sort |
| `orders_created_keyset` | `(created_at DESC, id DESC)` | admin default "newest first" |
| `orders_status_created` | `(status, created_at DESC, id DESC)` | admin status filter + range |
| `orders_email_lower` | `(lower(customer_email))` | admin search by email |
| `payments_created_keyset` | `(created_at DESC, id DESC)` | admin payments list |
| `outbox_dispatchable` | `(created_at) WHERE status IN ('pending','failed','processing')` | claim scan |
| `idempotency_touched` | `(touched_at DESC)` | housekeeping review |

Uniqueness already indexes: `destinations.slug`, `destinations.country_code`,
`packages(destination_id, slug)`, `orders.order_number`, `orders.access_token_hash`,
`payments.order_id`, `payments.provider_reference`,
`idempotency_keys(scope, key)`, `notification_outbox.order_id`.

Query rules: `select` explicit columns only, no `*`; admin lists cap `limit` at 10 with
keyset `(created_at, id)`; no per-row follow-up queries (join `packages`/aggregate
`payments.status` in the same statement).

## 4. Row Level Security

RLS is enabled on **every** table. Default posture is deny.

```sql
-- Admin identity, evaluated from the JWT claim set by Supabase Auth.
create or replace function is_admin() returns boolean
language sql stable as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;
```

| Table | Policy | Role | Rule |
| --- | --- | --- | --- |
| `destinations` | `dest_public_read` | `anon`, `authenticated` | `is_active = true` |
| `destinations` | `dest_admin_all` | `authenticated` | `is_admin()` |
| `packages` | `pkg_public_read` | `anon`, `authenticated` | `is_active = true` |
| `packages` | `pkg_admin_all` | `authenticated` | `is_admin()` |
| `orders` | — | — | **no policy**: no direct client access |
| `payments` | — | — | **no policy**: no direct client access |
| `idempotency_keys` | — | — | **no policy** |
| `notification_outbox` | — | — | **no policy** (admin reads via server route) |
| `mock_gateway_transactions` | `mgt_insert_sim` | `anon` | `INSERT` only, when the simulation route is enabled |
| `mock_gateway_transactions` | — | — | no `SELECT`/`UPDATE`/`DELETE` for clients |

Consequences:

- Guest order reads never go through `anon`. The route handler validates the capability
  token with the service client and returns an explicit field whitelist.
- The service role is used **only** after an authorization decision in server code
  (`requireAdmin()` or capability-token match), never as a shortcut for client requests.
- Integration tests must assert `select` on `orders` as `anon` returns zero rows / errors.

## 5. SQL functions

All are `security definer` with `search_path = public`, executable only by the service role
(`revoke execute ... from anon, authenticated`). Node calls them via `supabase.rpc()`.

### 5.1 `create_order_idempotent`

```sql
create_order_idempotent(
  p_key          text,    -- '^[A-Za-z0-9_-]{22,64}$'
  p_request_hash text,    -- sha256 hex of the normalized payload
  p_order        jsonb    -- {package_id, quantity, customer_name, customer_email,
                          --  customer_phone, order_number, access_token_hash,
                          --  response_token_sealed, provider_reference}
) returns jsonb
-- → {outcome: 'created'|'replay'|'conflict'|'expired'|'package_inactive',
--    order_number, payment_ref, total_idr, unit_price_idr, sealed_token?}
```

Steps, in one transaction:

1. `INSERT INTO idempotency_keys (scope, key, request_hash) VALUES ('checkout', p_key, p_request_hash)
   ON CONFLICT (scope, key) DO UPDATE SET touched_at = now() RETURNING *` — this also takes
   the row lock that serialises concurrent requests.
2. If the returned row already has `order_id`: compare `request_hash`.
   `created_at > now() - interval '24 hours'` → `replay` (return stored
   `response_body` + `response_token_sealed` as `sealed_token`). Older → `expired`.
   Different hash → `conflict`. No writes in any of these branches.
3. Otherwise read the package:
   `SELECT price_idr FROM packages WHERE id = (p_order->>'package_id')::uuid AND is_active`.
   Missing/inactive → `package_inactive`, nothing written.
4. `unit_price = price_idr`, `total = unit_price * quantity`.
5. Insert `orders` (status `pending`, snapshots from destination/package, provided
   `order_number`, `access_token_hash`) and `payments` (status `pending`,
   `provider_reference`, `amount_idr = total`).
6. Update the idempotency row: `order_id`, `response_status = 201`,
   `response_body = {order_number, payment_ref, total_idr}`,
   `response_token_sealed`, `touched_at = now()`.
7. Return `created` with totals.

Guarantees: prices come from the database, not from the request; one key yields one order;
concurrent duplicates either replay or block, never duplicate.

### 5.2 `settle_payment`

```sql
settle_payment(p_provider_reference text, p_outcome text) returns jsonb
-- → {outcome: 'applied'|'unchanged'|'still_pending'|'not_found',
--    order_status, payment_status}
```

1. `SELECT ... FROM payments WHERE provider_reference = $1 FOR UPDATE`.
2. `status <> 'pending'` → `unchanged` (idempotent, no writes).
3. `p_outcome = 'succeeded'` → payment `succeeded` + `paid_at`; order `pending → paid` +
   `paid_at`; then insert the outbox row
   (`ON CONFLICT (order_id) DO NOTHING`) with the minimized payload.
4. `p_outcome = 'failed'` → payment `failed` (+`failure_code`); order `pending → failed`.
   No outbox row.
5. `p_outcome = 'pending'` → `still_pending`, no writes.

Every `UPDATE` carries `AND status = 'pending'`. `failed` and `paid` are terminal.

### 5.3 `claim_outbox`

```sql
claim_outbox(p_order_id uuid default null) returns jsonb
-- → {outcome:'claimed', id, order_id, attempts, locked_at} | {outcome:'none'}
```

```sql
UPDATE notification_outbox
   SET status = 'processing', locked_at = now(), attempts = attempts + 1
 WHERE id = (
   SELECT o.id
     FROM notification_outbox o
     JOIN orders od ON od.id = o.order_id AND od.status = 'paid'
    WHERE (o.status IN ('pending','failed')
           OR (o.status = 'processing' AND o.locked_at < now() - interval '120 seconds'))
      AND o.attempts < 5
      AND (p_order_id IS NULL OR o.order_id = p_order_id)
    ORDER BY o.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1)
RETURNING id, order_id, attempts, locked_at;
```

`locked_at` is returned because it is the caller's fencing token. `0 rows` → `none`; the
caller must not send anything.

### 5.4 `finish_outbox`

```sql
finish_outbox(p_id uuid, p_locked_at timestamptz, p_ok boolean, p_error text default null)
returns jsonb
-- → {outcome:'sent'|'failed'|'stale'}
```

```sql
UPDATE notification_outbox
   SET status    = CASE WHEN p_ok THEN 'sent' ELSE 'failed' END,
       sent_at   = CASE WHEN p_ok THEN now() ELSE NULL END,
       last_error= p_error,
       locked_at = NULL
 WHERE id = p_id
   AND status = 'processing'
   AND locked_at = p_locked_at;      -- fencing: only the claim holder may finish
```

`0 rows` → `stale`: a newer claim owns the row; the caller changes nothing and logs a
warning. This is what prevents a slow dispatcher from overwriting a newer attempt.

## 6. Transaction boundaries

| Operation | Unit of atomicity |
| --- | --- |
| Checkout | `create_order_idempotent` (order + payment + idempotency metadata) |
| Payment settlement | `settle_payment` (payment + order + outbox row) |
| Notification claim | `claim_outbox` (single `UPDATE`) |
| Notification completion | `finish_outbox` (single fenced `UPDATE`) |
| Admin CRUD | one statement per request; no cross-table invariant |

Nothing else may write `orders.status`, `payments.status`, or `notification_outbox.status`.

## 7. Seed data

Five destinations, three packages each (15 rows), all `is_active`:

| Country | `country_code` | Region | Currency | Flagship package shape |
| --- | --- | --- | --- | --- |
| Japan | JP | Asia | JPY | 5 GB / 15 days |
| Singapore | SG | Asia | SGD | 3 GB / 7 days |
| Thailand | TH | Asia | THB | 10 GB / 30 days |
| Malaysia | MY | Asia | MYR | 5 GB / 15 days |
| Switzerland | CH | Europe | CHF | 5 GB / 15 days |

Seed is idempotent (`ON CONFLICT (slug) DO NOTHING`) so `db reset` is repeatable.
