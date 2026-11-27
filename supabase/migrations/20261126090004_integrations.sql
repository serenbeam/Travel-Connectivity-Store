-- E-3 / M4 — integrations: notification_outbox, mock_gateway_transactions
-- orders_i5_consistency lives here because its validator reads notification_outbox.

create table public.notification_outbox (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null unique references public.orders (id) on delete restrict,
  payload    jsonb not null,
  status     text not null default 'pending',
  attempts   smallint not null default 0,
  locked_at  timestamptz,
  sent_at    timestamptz,
  last_error text,
  created_at timestamptz not null default now(),

  constraint outbox_status_chk check (status in ('pending', 'processing', 'sent', 'failed')),
  constraint outbox_attempts_chk check (attempts between 0 and 5),
  constraint outbox_processing_lock_chk check ((status = 'processing') = (locked_at is not null)),
  constraint outbox_sent_at_chk check ((status = 'sent') = (sent_at is not null)),
  constraint outbox_failed_error_chk check (status <> 'failed' or last_error is not null),

  -- Payload contract (extra keys are allowed; adding one later needs no migration).
  constraint outbox_payload_keys_chk check (
    payload ? 'notificationId'
    and payload ? 'orderNumber'
    and payload ? 'totalIdr'
    and payload ? 'customerName'
    and payload ? 'customerEmail'
    and payload ? 'paidAt'
    and payload ? 'destinationName'
    and payload ? 'packageName'
    and payload ? 'packageDataSnapshot'
  )
);

create index outbox_dispatchable_idx
  on public.notification_outbox (created_at)
  where status in ('pending', 'failed', 'processing');

-- I5 immediate guard
create trigger outbox_requires_paid_order
  before insert or update on public.notification_outbox
  for each row execute function public.guard_outbox_order_is_paid();

-- I5 deferred: outbox side and orders side
create constraint trigger outbox_i5_consistency
  after insert or update or delete on public.notification_outbox
  deferrable initially deferred
  for each row execute function public.assert_outbox_matches_paid();

create constraint trigger orders_i5_consistency
  after insert or update or delete on public.orders
  deferrable initially deferred
  for each row execute function public.assert_outbox_matches_paid();

-- ---------------------------------------------------------------------------
-- Simulated provider's own store: no FK into business tables (by design).
-- Writes go through public.record_mock_settlement only.
-- ---------------------------------------------------------------------------

create table public.mock_gateway_transactions (
  id                 uuid primary key default gen_random_uuid(),
  provider_reference text not null unique,
  outcome            text not null,
  note               text,
  created_at         timestamptz not null default now(),

  constraint mock_outcome_chk check (outcome in ('succeeded', 'failed', 'pending')),
  constraint mock_reference_len_chk check (char_length(provider_reference) between 8 and 64)
);
