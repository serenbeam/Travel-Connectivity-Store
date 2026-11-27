-- E-3 / M1 — helper and trigger functions
-- All SECURITY DEFINER functions: owner postgres, search_path = '', public. qualified,
-- REVOKE ALL FROM PUBLIC (PostgreSQL grants EXECUTE to PUBLIC by default).
-- GRANTs are finalized in migration 0006.

-- ---------------------------------------------------------------------------
-- Admin identity (invoker; evaluates the signed JWT claim set by Supabase Auth)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

-- ---------------------------------------------------------------------------
-- updated_at maintenance (catalog tables have no terminal state)
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- I6 — terminal immutability + updated_at, one BEFORE UPDATE trigger per table
-- (a single trigger avoids non-deterministic ordering between the guard and
--  updated_at maintenance)
-- ---------------------------------------------------------------------------
create or replace function public.orders_before_update() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status in ('paid', 'failed') then
    raise exception 'order % is terminal and cannot be modified', old.id
      using errcode = '22000';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.payments_before_update() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status in ('succeeded', 'failed') then
    raise exception 'payment % is terminal and cannot be modified', old.id
      using errcode = '22000';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- I1 — payments.amount_idr must equal orders.total_idr
-- ---------------------------------------------------------------------------
create or replace function public.enforce_payment_amount() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
begin
  select o.total_idr into v_total from public.orders o where o.id = new.order_id;

  if v_total is null then
    raise exception 'I1: order % not found for payment', new.order_id
      using errcode = '22000';
  end if;

  if new.amount_idr <> v_total then
    raise exception 'I1: payment amount % does not match order total %',
      new.amount_idr, v_total
      using errcode = '22000';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- I2 — orders.status = 'paid'  <=>  payments.status = 'succeeded' (deferred)
-- Validates OLD and NEW ids so that a payments.order_id change A -> B checks both.
-- ---------------------------------------------------------------------------
create or replace function public.assert_order_payment_consistency() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key  text := case tg_table_name when 'payments' then 'order_id' else 'id' end;
  v_ids  uuid[];
  v_id   uuid;
  v_ostatus text;
  v_pstatus text;
begin
  select array_agg(distinct x)
    into v_ids
    from unnest(array[
      case when tg_op in ('UPDATE', 'DELETE') then (to_jsonb(old) ->> v_key)::uuid end,
      case when tg_op in ('INSERT', 'UPDATE') then (to_jsonb(new) ->> v_key)::uuid end
    ]) as t(x)
   where x is not null;

  if v_ids is null then
    return null;
  end if;

  foreach v_id in array v_ids loop
    select o.status into v_ostatus from public.orders o where o.id = v_id;

    if v_ostatus is null then
      raise exception 'I2: dangling reference, order % not found', v_id
        using errcode = '22000';
    end if;

    select p.status into v_pstatus from public.payments p where p.order_id = v_id;

    if v_ostatus = 'paid' and v_pstatus is distinct from 'succeeded' then
      raise exception 'I2 violated (order %): order is paid but payment is %',
        v_id, coalesce(v_pstatus, 'missing')
        using errcode = '22000';
    elsif v_ostatus <> 'paid' and v_pstatus = 'succeeded' then
      raise exception 'I2 violated (order %): payment succeeded but order is %',
        v_id, v_ostatus
        using errcode = '22000';
    end if;
  end loop;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- I5 — outbox exists exactly once  <=>  order is paid (deferred)
-- ---------------------------------------------------------------------------
create or replace function public.assert_outbox_matches_paid() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key   text := case tg_table_name when 'notification_outbox' then 'order_id' else 'id' end;
  v_ids   uuid[];
  v_id    uuid;
  v_status text;
  v_count integer;
begin
  select array_agg(distinct x)
    into v_ids
    from unnest(array[
      case when tg_op in ('UPDATE', 'DELETE') then (to_jsonb(old) ->> v_key)::uuid end,
      case when tg_op in ('INSERT', 'UPDATE') then (to_jsonb(new) ->> v_key)::uuid end
    ]) as t(x)
   where x is not null;

  if v_ids is null then
    return null;
  end if;

  foreach v_id in array v_ids loop
    select o.status into v_status from public.orders o where o.id = v_id;

    if v_status is null then
      raise exception 'I5: dangling reference, order % not found', v_id
        using errcode = '22000';
    end if;

    select count(*) into v_count
      from public.notification_outbox n
     where n.order_id = v_id;

    if v_status = 'paid' and v_count <> 1 then
      raise exception 'I5 violated (order %): paid order has % outbox rows', v_id, v_count
        using errcode = '22000';
    elsif v_status <> 'paid' and v_count <> 0 then
      raise exception 'I5 violated (order %): order is % but has % outbox rows',
        v_id, v_status, v_count
        using errcode = '22000';
    end if;
  end loop;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- I5 — immediate guard: an outbox row may only reference a paid order
-- ---------------------------------------------------------------------------
create or replace function public.guard_outbox_order_is_paid() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select o.status into v_status from public.orders o where o.id = new.order_id;

  if v_status is distinct from 'paid' then
    raise exception 'I5: outbox requires a paid order (order %, status %)',
      new.order_id, coalesce(v_status, 'missing')
      using errcode = '22000';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ownership + revoke default EXECUTE (grants are finalized in 0006)
-- ---------------------------------------------------------------------------
alter function public.is_admin() owner to postgres;
alter function public.set_updated_at() owner to postgres;
alter function public.orders_before_update() owner to postgres;
alter function public.payments_before_update() owner to postgres;
alter function public.enforce_payment_amount() owner to postgres;
alter function public.assert_order_payment_consistency() owner to postgres;
alter function public.assert_outbox_matches_paid() owner to postgres;
alter function public.guard_outbox_order_is_paid() owner to postgres;

revoke all on function public.is_admin() from public;
revoke all on function public.set_updated_at() from public;
revoke all on function public.orders_before_update() from public;
revoke all on function public.payments_before_update() from public;
revoke all on function public.enforce_payment_amount() from public;
revoke all on function public.assert_order_payment_consistency() from public;
revoke all on function public.assert_outbox_matches_paid() from public;
revoke all on function public.guard_outbox_order_is_paid() from public;
