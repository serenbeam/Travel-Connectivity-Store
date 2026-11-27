-- E-3 / M3 — transactional core: orders, payments, idempotency_keys
-- Triggers created together with their tables (functions come from M1).

create table public.orders (
  id                        uuid primary key default gen_random_uuid(),
  order_number              text not null unique,
  access_token_hash         text not null unique,
  destination_id            uuid not null references public.destinations (id) on delete restrict,
  package_id                uuid not null references public.packages (id) on delete restrict,
  destination_name_snapshot text not null,
  package_name_snapshot     text not null,
  package_data_snapshot     text not null,
  customer_name             text not null,
  customer_email            text not null,
  customer_phone            text not null,
  quantity                  smallint not null default 1,
  unit_price_idr            integer not null,
  total_idr                 integer not null,
  status                    text not null default 'pending',
  paid_at                   timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint orders_status_chk check (status in ('pending', 'paid', 'failed')),
  constraint orders_paid_at_chk check ((status = 'paid') = (paid_at is not null)),
  constraint orders_quantity_chk check (quantity between 1 and 5),
  constraint orders_unit_price_chk check (unit_price_idr between 1 and 100000000),
  constraint orders_total_range_chk check (total_idr between 1 and 2147483647),
  constraint orders_total_math_chk check (total_idr = unit_price_idr * quantity),
  constraint orders_number_format_chk check (order_number ~ '^RML-[A-Z0-9]{6}$'),
  constraint orders_token_hash_chk check (access_token_hash ~ '^[0-9a-f]{64}$'),
  constraint orders_email_lower_chk check (customer_email = lower(customer_email)),
  constraint orders_email_format_chk check (
    customer_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  constraint orders_phone_format_chk check (customer_phone ~ '^\+[1-9][0-9]{6,14}$'),
  constraint orders_customer_name_chk check (customer_name <> '')
);

create index orders_created_keyset_idx
  on public.orders (created_at desc, id desc);
create index orders_status_created_idx
  on public.orders (status, created_at desc, id desc);
create index orders_email_lower_idx
  on public.orders (lower(customer_email));

create trigger orders_before_update
  before update on public.orders
  for each row execute function public.orders_before_update();

-- I2 (deferred): orders side
create constraint trigger orders_i2_consistency
  after insert or update or delete on public.orders
  deferrable initially deferred
  for each row execute function public.assert_order_payment_consistency();

-- I5 (deferred): orders side — created in M4 together with notification_outbox,
-- because the validator reads that table.

-- ---------------------------------------------------------------------------

create table public.payments (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null unique references public.orders (id) on delete restrict,
  provider           text not null default 'mock',
  provider_reference text not null unique,
  amount_idr         integer not null,
  status             text not null default 'pending',
  failure_code       text,
  paid_at            timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint payments_status_chk check (status in ('pending', 'succeeded', 'failed')),
  constraint payments_paid_at_chk check ((status = 'succeeded') = (paid_at is not null)),
  constraint payments_failure_code_chk check (status = 'failed' or failure_code is null),
  constraint payments_failure_code_required_chk check (
    status <> 'failed' or (failure_code is not null and failure_code <> '')
  ),
  constraint payments_amount_chk check (amount_idr between 1 and 2147483647),
  constraint payments_provider_len_chk check (char_length(provider) between 1 and 32),
  constraint payments_reference_len_chk check (
    char_length(provider_reference) between 8 and 64
  )
);

create index payments_created_keyset_idx
  on public.payments (created_at desc, id desc);

create trigger payments_before_update
  before update on public.payments
  for each row execute function public.payments_before_update();

-- I1
create trigger payments_enforce_amount
  before insert or update on public.payments
  for each row execute function public.enforce_payment_amount();

-- I2 (deferred): payments side
create constraint trigger payments_i2_consistency
  after insert or update or delete on public.payments
  deferrable initially deferred
  for each row execute function public.assert_order_payment_consistency();

-- ---------------------------------------------------------------------------

create table public.idempotency_keys (
  id                    uuid primary key default gen_random_uuid(),
  scope                 text not null default 'checkout',
  key                   text not null,
  request_hash          text not null,
  order_id              uuid references public.orders (id) on delete restrict,
  response_status       smallint,
  response_body         jsonb,
  response_token_sealed text,
  created_at            timestamptz not null default now(),
  touched_at            timestamptz not null default now(),

  constraint idempotency_scope_key_key unique (scope, key),
  constraint idempotency_scope_chk check (scope = 'checkout'),
  constraint idempotency_key_format_chk check (key ~ '^[A-Za-z0-9_-]{22,64}$'),
  constraint idempotency_hash_format_chk check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint idempotency_response_pair_chk check ((order_id is null) = (response_status is null)),
  constraint idempotency_sealed_pair_chk check ((order_id is null) = (response_token_sealed is null)),
  constraint idempotency_sealed_format_chk check (
    response_token_sealed is null
    or response_token_sealed ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
  )
);

create unique index idempotency_order_unique_idx
  on public.idempotency_keys (order_id)
  where order_id is not null;

create index idempotency_touched_idx
  on public.idempotency_keys (touched_at desc);
