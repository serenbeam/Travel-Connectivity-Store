-- E-3 / M6 — RLS, the seven policies, and the FINAL privilege matrix.
-- M5 only revoked the default EXECUTE; every grant lives here.

-- ---------------------------------------------------------------------------
-- Row Level Security: enabled everywhere, deny by default
-- ---------------------------------------------------------------------------
alter table public.destinations            enable row level security;
alter table public.packages                enable row level security;
alter table public.orders                  enable row level security;
alter table public.payments               enable row level security;
alter table public.idempotency_keys        enable row level security;
alter table public.notification_outbox     enable row level security;
alter table public.mock_gateway_transactions enable row level security;

-- ---------------------------------------------------------------------------
-- Seven policies
-- ---------------------------------------------------------------------------
create policy dest_public_read on public.destinations
  for select to anon, authenticated
  using (is_active);

create policy dest_admin_all on public.destinations
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy pkg_public_read on public.packages
  for select to anon, authenticated
  using (is_active);

create policy pkg_admin_all on public.packages
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy orders_admin_read on public.orders
  for select to authenticated
  using (public.is_admin());

create policy payments_admin_read on public.payments
  for select to authenticated
  using (public.is_admin());

create policy outbox_admin_read on public.notification_outbox
  for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Table privileges (final matrix)
-- service_role gets NO write privilege on the transactional tables: the five
-- SECURITY DEFINER functions are the only writer path (single-writer).
-- ---------------------------------------------------------------------------
revoke all on public.destinations             from anon, authenticated, service_role;
revoke all on public.packages                 from anon, authenticated, service_role;
revoke all on public.orders                   from anon, authenticated, service_role;
revoke all on public.payments                 from anon, authenticated, service_role;
revoke all on public.idempotency_keys         from anon, authenticated, service_role;
revoke all on public.notification_outbox      from anon, authenticated, service_role;
revoke all on public.mock_gateway_transactions from anon, authenticated, service_role;

-- catalog: public read, admin write through RLS
grant select on public.destinations, public.packages to anon, authenticated;
grant insert, update, delete on public.destinations, public.packages to authenticated;

-- transactional: reads only (rows are still filtered by RLS for authenticated)
grant select on public.orders, public.payments, public.notification_outbox to authenticated;
grant select on public.orders, public.payments, public.notification_outbox,
               public.mock_gateway_transactions to service_role;

-- ---------------------------------------------------------------------------
-- Schema privileges
-- ---------------------------------------------------------------------------
revoke create on schema public from public, anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Function privileges (final)
-- ---------------------------------------------------------------------------
-- is_admin(): only the role that evaluates the admin policies.
revoke all on function public.is_admin() from public, anon, authenticated, service_role;
grant execute on function public.is_admin() to authenticated;

-- Trigger-only functions: no EXECUTE grant for anyone (trigger invocation does
-- not check the caller's EXECUTE privilege).
revoke all on function public.set_updated_at() from public, anon, authenticated, service_role;
revoke all on function public.orders_before_update() from public, anon, authenticated, service_role;
revoke all on function public.payments_before_update() from public, anon, authenticated, service_role;
revoke all on function public.enforce_payment_amount() from public, anon, authenticated, service_role;
revoke all on function public.assert_order_payment_consistency() from public, anon, authenticated, service_role;
revoke all on function public.assert_outbox_matches_paid() from public, anon, authenticated, service_role;
revoke all on function public.guard_outbox_order_is_paid() from public, anon, authenticated, service_role;

-- The five transactional RPCs: service_role only.
--
-- The REVOKE is repeated here (not only in 0005) because function privileges have two
-- layers: (a) PostgreSQL grants EXECUTE to PUBLIC on every new function, and (b) when
-- default privileges are auto-exposed, Supabase grants EXECUTE to anon/authenticated/
-- service_role at creation time. REVOKE ... FROM public only clears (a), so a project
-- with auto-exposed defaults would leave anon/authenticated executable. Revoking
-- explicitly makes the final state identical in both configurations.
revoke all on function public.create_order_idempotent(text, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.settle_payment(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_outbox(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.finish_outbox(uuid, timestamptz, boolean, text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_mock_settlement(text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.create_order_idempotent(text, text, jsonb) to service_role;
grant execute on function public.settle_payment(text, text) to service_role;
grant execute on function public.claim_outbox(uuid) to service_role;
grant execute on function public.finish_outbox(uuid, timestamptz, boolean, text) to service_role;
grant execute on function public.record_mock_settlement(text, text) to service_role;
