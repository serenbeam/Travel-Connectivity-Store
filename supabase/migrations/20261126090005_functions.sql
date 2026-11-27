-- E-3 / M5 — transactional RPCs (the only writer path for the transactional tables)
-- SECURITY DEFINER, owner postgres, search_path = '', public.-qualified.
-- M5 only creates the functions and revokes the default EXECUTE from PUBLIC.
-- Final GRANTs live in migration 0006.

-- ---------------------------------------------------------------------------
-- create_order_idempotent
--   Ownership claim via INSERT ... ON CONFLICT DO NOTHING + FOUND (never
--   SELECT ... FOR UPDATE on a row that does not exist yet).
-- ---------------------------------------------------------------------------
create or replace function public.create_order_idempotent(
  p_key          text,
  p_request_hash text,
  p_order        jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope        constant text := 'checkout';
  v_row_id       uuid;
  v_row          public.idempotency_keys;
  v_pkg          record;
  v_quantity     integer;
  v_unit_price   integer;
  v_total        bigint;
  v_order_id     uuid;
  v_package_id   uuid;
  v_ref          text;
  v_order_number text;
  v_token_hash   text;
  v_sealed       text;
  v_snapshot     text;
begin
  -- ---- validation (explicit NULL checks: `NOT IN` alone lets NULL through) ----
  if p_key is null or p_key !~ '^[A-Za-z0-9_-]{22,64}$' then
    raise exception 'INVALID_KEY' using errcode = '22000';
  end if;
  if p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_REQUEST_HASH' using errcode = '22000';
  end if;
  if p_order is null then
    raise exception 'INVALID_ORDER_PAYLOAD' using errcode = '22000';
  end if;

  v_order_number := p_order ->> 'order_number';
  v_token_hash   := p_order ->> 'access_token_hash';
  v_sealed       := p_order ->> 'response_token_sealed';
  v_ref          := p_order ->> 'provider_reference';

  -- ---- step 1: take ownership (atomic; the unique index coordinates racers) ----
  insert into public.idempotency_keys (scope, key, request_hash)
  values (v_scope, p_key, p_request_hash)
  on conflict (scope, key) do nothing
  returning id into v_row_id;

  if v_row_id is null then
    -- ---- step 2: replay path. A blocked INSERT has already waited for the
    -- winner to commit, so the row is final and readable here.
    select * into v_row
      from public.idempotency_keys
     where scope = v_scope and key = p_key;

    if not found then
      raise exception 'IDEMPOTENCY_ROW_MISSING' using errcode = '22000';
    end if;

    if v_row.created_at <= now() - interval '24 hours' then
      return jsonb_build_object('outcome', 'expired');
    end if;

    if v_row.request_hash <> p_request_hash then
      return jsonb_build_object('outcome', 'conflict');
    end if;

    return jsonb_build_object(
      'outcome',      'replay',
      'order_number', v_row.response_body ->> 'order_number',
      'payment_ref',  v_row.response_body ->> 'payment_ref',
      'total_idr',    (v_row.response_body ->> 'total_idr')::integer,
      'sealed_token', v_row.response_token_sealed
    );
  end if;

  -- ---- step 3: owner path ----
  -- Creation-only fields are validated here, not before the replay branch: a replay
  -- is decided solely by the key and request_hash, so it must not depend on them.
  if v_order_number is null or v_token_hash is null or v_sealed is null or v_ref is null then
    raise exception 'INVALID_ORDER_PAYLOAD: order_number, access_token_hash, response_token_sealed and provider_reference are required'
      using errcode = '22000';
  end if;

  v_package_id := (p_order ->> 'package_id')::uuid;
  v_quantity   := (p_order ->> 'quantity')::integer;

  if v_package_id is null or v_quantity is null or v_quantity < 1 or v_quantity > 5 then
    raise exception 'INVALID_QUANTITY' using errcode = '22000';
  end if;

  select p.price_idr, p.is_unlimited, p.data_mb, p.validity_days,
         p.destination_id, p.name as package_name, d.name as destination_name
    into v_pkg
    from public.packages p
    join public.destinations d on d.id = p.destination_id
   where p.id = v_package_id
     and p.is_active
     and d.is_active;

  if not found then
    raise exception 'PACKAGE_INACTIVE' using errcode = '22000';
  end if;

  v_unit_price := v_pkg.price_idr;
  v_total      := v_unit_price::bigint * v_quantity;

  if v_total > 2147483647 then
    raise exception 'TOTAL_OVERFLOW' using errcode = '22003';
  end if;

  -- Deterministic snapshot derived from columns that exist on packages.
  -- The package CHECK guarantees data_mb IS NULL only when is_unlimited is true.
  v_snapshot := case
    when v_pkg.is_unlimited then 'Unlimited · ' || v_pkg.validity_days || ' hari'
    when v_pkg.data_mb % 1024 = 0
      then (v_pkg.data_mb / 1024) || ' GB · ' || v_pkg.validity_days || ' hari'
    else v_pkg.data_mb || ' MB · ' || v_pkg.validity_days || ' hari'
  end;

  insert into public.orders (
    order_number, access_token_hash, destination_id, package_id,
    destination_name_snapshot, package_name_snapshot, package_data_snapshot,
    customer_name, customer_email, customer_phone,
    quantity, unit_price_idr, total_idr, status
  ) values (
    v_order_number, v_token_hash, v_pkg.destination_id, v_package_id,
    v_pkg.destination_name, v_pkg.package_name, v_snapshot,
    p_order ->> 'customer_name', p_order ->> 'customer_email', p_order ->> 'customer_phone',
    v_quantity, v_unit_price, v_total::integer, 'pending'
  )
  returning id into v_order_id;

  insert into public.payments (order_id, provider, provider_reference, amount_idr, status)
  values (v_order_id, 'mock', v_ref, v_total::integer, 'pending')
  returning provider_reference into v_ref;

  update public.idempotency_keys
     set order_id              = v_order_id,
         response_status       = 201,
         response_body         = jsonb_build_object(
                                   'order_number', v_order_number,
                                   'payment_ref',  v_ref,
                                   'total_idr',    v_total::integer
                                 ),
         response_token_sealed = v_sealed,
         touched_at            = now()
   where id = v_row_id;

  return jsonb_build_object(
    'outcome',      'created',
    'order_id',     v_order_id,
    'order_number', v_order_number,
    'payment_ref',  v_ref,
    'total_idr',    v_total::integer
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- settle_payment — applies a terminal gateway decision.
-- Accepts only 'succeeded' / 'failed'; 'pending' is a route-level branch (E-5).
-- ---------------------------------------------------------------------------
create or replace function public.settle_payment(
  p_provider_reference text,
  p_outcome            text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay       public.payments;
  v_order     public.orders;
  v_outbox_id uuid;
  v_failure   text := 'GATEWAY_DECLINED';
begin
  if p_provider_reference is null
     or char_length(p_provider_reference) not between 8 and 64 then
    raise exception 'INVALID_REF' using errcode = '22000';
  end if;

  if p_outcome is null or p_outcome not in ('succeeded', 'failed') then
    raise exception 'INVALID_OUTCOME' using errcode = '22000';
  end if;

  select * into v_pay
    from public.payments
   where provider_reference = p_provider_reference
     for update;

  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select * into v_order from public.orders where id = v_pay.order_id;

  if v_pay.status <> 'pending' then
    return jsonb_build_object(
      'outcome',        'unchanged',
      'order_status',   v_order.status,
      'payment_status', v_pay.status
    );
  end if;

  if p_outcome = 'succeeded' then
    update public.payments
       set status = 'succeeded', paid_at = now()
     where id = v_pay.id;

    update public.orders
       set status = 'paid', paid_at = now()
     where id = v_pay.order_id;

    -- Outbox is inserted only after the order is paid (immediate guard reads it).
    -- notificationId must equal the outbox row id, so the id is generated here.
    v_outbox_id := gen_random_uuid();

    insert into public.notification_outbox (id, order_id, payload)
    values (
      v_outbox_id,
      v_order.id,
      jsonb_build_object(
        'notificationId',      v_outbox_id::text,
        'orderNumber',         v_order.order_number,
        'customerName',        v_order.customer_name,
        'customerEmail',       v_order.customer_email,
        'destinationName',     v_order.destination_name_snapshot,
        'packageName',         v_order.package_name_snapshot,
        'packageDataSnapshot', v_order.package_data_snapshot,
        'totalIdr',            v_order.total_idr,
        'paidAt',              to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
    );
  else
    update public.payments
       set status = 'failed', failure_code = v_failure
     where id = v_pay.id;

    update public.orders
       set status = 'failed'
     where id = v_pay.order_id;
  end if;

  return jsonb_build_object(
    'outcome',        'applied',
    'order_status',   (select status from public.orders where id = v_pay.order_id),
    'payment_status', (select status from public.payments where id = v_pay.id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_outbox — one atomic UPDATE over a SKIP LOCKED subquery
-- ---------------------------------------------------------------------------
create or replace function public.claim_outbox(p_order_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.notification_outbox;
begin
  -- Reap leases that died at the attempts ceiling. Without this a crash on the 5th
  -- claim leaves the row 'processing' forever: the claim predicate requires
  -- attempts < 5, so it can never be reclaimed, and no dispatcher exists to call
  -- finish_outbox. Sweeping turns that zombie into an honest terminal failure.
  --
  -- The target set (attempts >= 5) is disjoint from the claim set (attempts < 5),
  -- so the sweep never competes with a legitimate claim. Under READ COMMITTED a
  -- concurrent finish_outbox that commits first is re-checked here and skipped
  -- (status is no longer 'processing'), so a 'sent' row is never overwritten.
  --
  -- This statement MUST stay before the claim UPDATE: PL/pgSQL overwrites FOUND on
  -- every UPDATE, and `if not found` below detects the 'none' outcome.
  update public.notification_outbox
     set status     = 'failed',
         last_error = coalesce(nullif(last_error, ''), 'lease_expired_after_max_attempts'),
         locked_at  = null
   where status     = 'processing'
     and attempts  >= 5
     and locked_at < now() - interval '120 seconds';

  update public.notification_outbox o
     set status    = 'processing',
         locked_at = now(),
         attempts  = o.attempts + 1
   where o.id = (
     select n.id
       from public.notification_outbox n
       join public.orders od on od.id = n.order_id and od.status = 'paid'
      where (
              n.status in ('pending', 'failed')
              or (n.status = 'processing' and n.locked_at < now() - interval '120 seconds')
            )
        and n.attempts < 5
        and (p_order_id is null or n.order_id = p_order_id)
      order by n.created_at
      for update skip locked
      limit 1
   )
  returning * into v_row;

  if not found then
    return jsonb_build_object('outcome', 'none');
  end if;

  return jsonb_build_object(
    'outcome',   'claimed',
    'id',        v_row.id,
    'order_id',  v_row.order_id,
    'attempts',  v_row.attempts,
    'locked_at', v_row.locked_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- finish_outbox — fenced by locked_at
-- ---------------------------------------------------------------------------
create or replace function public.finish_outbox(
  p_id        uuid,
  p_locked_at timestamptz,
  p_ok        boolean,
  p_error     text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_id is null then
    raise exception 'INVALID_ID' using errcode = '22000';
  end if;
  if p_locked_at is null then
    raise exception 'INVALID_LOCK' using errcode = '22000';
  end if;
  if p_ok is null then
    raise exception 'INVALID_OK' using errcode = '22000';
  end if;

  update public.notification_outbox
     set status     = case when p_ok then 'sent' else 'failed' end,
         sent_at    = case when p_ok then now() else null end,
         last_error = case when p_ok then null
                           else coalesce(nullif(p_error, ''), 'unknown_error') end,
         locked_at  = null
   where id = p_id
     and status = 'processing'
     and locked_at = p_locked_at;

  if not found then
    return jsonb_build_object('outcome', 'stale');
  end if;

  return jsonb_build_object('outcome', case when p_ok then 'sent' else 'failed' end);
end;
$$;

-- ---------------------------------------------------------------------------
-- record_mock_settlement — simulated provider store only.
-- pending may advance to a terminal outcome; a terminal outcome is immutable.
-- ---------------------------------------------------------------------------
create or replace function public.record_mock_settlement(
  p_ref     text,
  p_outcome text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stored text;
  v_found  boolean;
begin
  if p_ref is null or char_length(p_ref) not between 8 and 64 then
    raise exception 'INVALID_REF' using errcode = '22000';
  end if;
  if p_outcome is null or p_outcome not in ('pending', 'succeeded', 'failed') then
    raise exception 'INVALID_OUTCOME' using errcode = '22000';
  end if;

  -- (1) pending -> terminal (locks the existing row)
  update public.mock_gateway_transactions
     set outcome = p_outcome
   where provider_reference = p_ref
     and outcome = 'pending'
     and p_outcome in ('succeeded', 'failed');

  if found then
    return jsonb_build_object('outcome', p_outcome, 'recorded', true,
                              'transition', 'pending_to_terminal');
  end if;

  -- (2) brand-new reference
  insert into public.mock_gateway_transactions (provider_reference, outcome)
  values (p_ref, p_outcome)
  on conflict (provider_reference) do nothing;

  if found then
    return jsonb_build_object('outcome', p_outcome, 'recorded', true,
                              'transition', 'created');
  end if;

  -- (3) existing row: replay or conflict. FOUND is checked, never a NULL value.
  select outcome into v_stored
    from public.mock_gateway_transactions
   where provider_reference = p_ref;
  v_found := found;

  if not v_found then
    raise exception 'MOCK_RECORD_MISSING' using errcode = '22000';
  end if;

  if v_stored = p_outcome then
    return jsonb_build_object('outcome', v_stored, 'recorded', false,
                              'transition', 'replay');
  end if;

  return jsonb_build_object('outcome', v_stored, 'recorded', false,
                            'transition', 'conflict');
end;
$$;

-- ---------------------------------------------------------------------------
-- Ownership + revoke default EXECUTE (final GRANTs happen in 0006)
-- ---------------------------------------------------------------------------
alter function public.create_order_idempotent(text, text, jsonb) owner to postgres;
alter function public.settle_payment(text, text) owner to postgres;
alter function public.claim_outbox(uuid) owner to postgres;
alter function public.finish_outbox(uuid, timestamptz, boolean, text) owner to postgres;
alter function public.record_mock_settlement(text, text) owner to postgres;

revoke all on function public.create_order_idempotent(text, text, jsonb) from public;
revoke all on function public.settle_payment(text, text) from public;
revoke all on function public.claim_outbox(uuid) from public;
revoke all on function public.finish_outbox(uuid, timestamptz, boolean, text) from public;
revoke all on function public.record_mock_settlement(text, text) from public;
