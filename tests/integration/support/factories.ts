import { createHash, randomBytes } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import { serviceClient } from './clients';
import { at, psql, rows, scalar } from './psql';

/**
 * Test data builders for the checkout / settlement / outbox RPCs.
 *
 * The creation fields (order_number, access_token_hash, response_token_sealed,
 * provider_reference) are produced in Node exactly as E-5 will produce them: the SQL
 * function receives them and never creates, hashes, or encrypts anything (ADR-6).
 */

export interface CheckoutInput {
  packageSlug?: string;
  quantity?: number;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
}

export interface CheckoutRequest {
  key: string;
  requestHash: string;
  order: Record<string, unknown>;
  token: string;
  tokenHash: string;
  sealed: string;
  providerReference: string;
  orderNumber: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** 32 random bytes base64url = 43 chars, the ADR-5 capability token shape. */
export function newCapabilityToken(): string {
  return randomBytes(32).toString('base64url');
}

export function newIdempotencyKey(): string {
  return randomBytes(32).toString('base64url');
}

export function newOrderNumber(): string {
  return `RML-${randomBytes(3).toString('hex').toUpperCase()}`;
}

export function newProviderReference(): string {
  return `mock_${randomBytes(12).toString('hex')}`;
}

/** `v1.<iv>.<tag>.<ct>` with base64url parts — shape only; the real seal is E-5's job. */
export function newSealedToken(): string {
  return ['v1', randomBytes(12), randomBytes(16), randomBytes(43)]
    .map((part, index) => (index === 0 ? String(part) : Buffer.from(part as Buffer).toString('base64url')))
    .join('.');
}

/** Stable hash of a normalized payload: key order must not matter (ADR-3). */
export function requestHashOf(input: CheckoutInput): string {
  const normalized = {
    packageSlug: input.packageSlug ?? 'japan-5gb-15d',
    quantity: input.quantity ?? 1,
    customerName: input.customerName ?? 'Budi Santoso',
    customerEmail: input.customerEmail ?? 'budi@example.com',
    customerPhone: input.customerPhone ?? '+628123456789',
  };

  return sha256Hex(JSON.stringify(normalized));
}

export async function packageIdBySlug(slug: string): Promise<string> {
  const value = scalar(`select id from public.packages where slug = '${slug}';`);

  if (!UUID_RE.test(value)) {
    throw new Error(`Package "${slug}" not found (seeded slugs: see supabase/seed.sql).`);
  }

  return value;
}

export async function packagePriceBySlug(slug: string): Promise<number> {
  return Number(scalar(`select price_idr from public.packages where slug = '${slug}';`));
}

/**
 * Builds one checkout request. Each call produces fresh creation fields, mirroring a
 * real request; racers that lose the idempotency race discard theirs.
 */
export async function buildCheckout(input: CheckoutInput = {}): Promise<CheckoutRequest> {
  const key = newIdempotencyKey();
  return buildCheckoutWithKey(key, input);
}

export async function buildCheckoutWithKey(
  key: string,
  input: CheckoutInput = {},
): Promise<CheckoutRequest> {
  const packageSlug = input.packageSlug ?? 'japan-5gb-15d';
  const quantity = input.quantity ?? 1;
  const token = newCapabilityToken();
  const tokenHash = sha256Hex(token);
  const sealed = newSealedToken();
  const providerReference = newProviderReference();
  const orderNumber = newOrderNumber();

  return {
    key,
    requestHash: requestHashOf({ ...input, packageSlug, quantity }),
    order: {
      package_id: await packageIdBySlug(packageSlug),
      quantity,
      customer_name: input.customerName ?? 'Budi Santoso',
      customer_email: (input.customerEmail ?? 'budi@example.com').toLowerCase(),
      customer_phone: input.customerPhone ?? '+628123456789',
      order_number: orderNumber,
      access_token_hash: tokenHash,
      response_token_sealed: sealed,
      provider_reference: providerReference,
    },
    token,
    tokenHash,
    sealed,
    providerReference,
    orderNumber,
  };
}

export interface CreateOrderResult {
  outcome: string;
  order_id?: string;
  order_number?: string;
  payment_ref?: string;
  total_idr?: number;
  sealed_token?: string;
}

export async function callCreateOrder(
  request: CheckoutRequest,
  client: SupabaseClient = serviceClient(),
): Promise<CreateOrderResult> {
  const { data, error } = await client.rpc('create_order_idempotent', {
    p_key: request.key,
    p_request_hash: request.requestHash,
    p_order: request.order,
  });

  if (error) {
    throw new Error(`create_order_idempotent failed: ${error.message} (${error.code ?? '?'})`);
  }

  return data as CreateOrderResult;
}

export async function callSettle(
  providerReference: string,
  outcome: 'succeeded' | 'failed',
  client: SupabaseClient = serviceClient(),
): Promise<Record<string, unknown>> {
  const { data, error } = await client.rpc('settle_payment', {
    p_provider_reference: providerReference,
    p_outcome: outcome,
  });

  if (error) {
    throw new Error(`settle_payment failed: ${error.message} (${error.code ?? '?'})`);
  }

  return data as Record<string, unknown>;
}

export async function callClaim(
  orderId: string | null,
  client: SupabaseClient = serviceClient(),
): Promise<Record<string, unknown>> {
  const { data, error } = await client.rpc('claim_outbox', { p_order_id: orderId });

  if (error) {
    throw new Error(`claim_outbox failed: ${error.message} (${error.code ?? '?'})`);
  }

  return data as Record<string, unknown>;
}

export async function callFinish(
  id: string,
  lockedAt: string,
  ok: boolean,
  error: string | null = null,
  client: SupabaseClient = serviceClient(),
): Promise<Record<string, unknown>> {
  const { data, error: rpcError } = await client.rpc('finish_outbox', {
    p_id: id,
    p_locked_at: lockedAt,
    p_ok: ok,
    p_error: error,
  });

  if (rpcError) {
    throw new Error(`finish_outbox failed: ${rpcError.message} (${rpcError.code ?? '?'})`);
  }

  return data as Record<string, unknown>;
}

export interface PaidOrder {
  orderId: string;
  orderNumber: string;
  paymentRef: string;
  outboxId: string;
  totalIdr: number;
}

/** Creates an order and settles it, so exactly one outbox row exists (I5). */
export async function createPaidOrder(input: CheckoutInput = {}): Promise<PaidOrder> {
  const request = await buildCheckout(input);
  const created = await callCreateOrder(request);
  await callSettle(request.providerReference, 'succeeded');

  const orderRow = rows(
    `select id, order_number, total_idr from public.orders where order_number = '${created.order_number}';`,
  )[0];

  if (!orderRow) {
    throw new Error(`Order ${created.order_number} was not persisted.`);
  }

  const outboxId = scalar(
    `select id from public.notification_outbox where order_id = '${at(orderRow, 0)}';`,
  );

  return {
    orderId: at(orderRow, 0),
    orderNumber: at(orderRow, 1),
    paymentRef: request.providerReference,
    outboxId,
    totalIdr: Number(at(orderRow, 2)),
  };
}

/** Creates a pending order (no settlement). */
export async function createPendingOrder(
  input: CheckoutInput = {},
): Promise<{ orderId: string; orderNumber: string; paymentRef: string }> {
  const request = await buildCheckout(input);
  const created = await callCreateOrder(request);

  const orderId = scalar(
    `select id from public.orders where order_number = '${created.order_number}';`,
  );

  return {
    orderId,
    orderNumber: created.order_number ?? '',
    paymentRef: request.providerReference,
  };
}

function requireUuid(value: string): string {
  if (!UUID_RE.test(value)) {
    throw new Error(`Refusing to interpolate a non-UUID value: ${value}`);
  }
  return value;
}

/** Forces a row into the "dead lease at the attempts ceiling" state. */
export function forceExpiredAtCeiling(outboxId: string, attempts = 5, secondsAgo = 200): void {
  psql(
    `update public.notification_outbox
        set status = 'processing', attempts = ${Number(attempts)},
            locked_at = now() - interval '${Number(secondsAgo)} seconds',
            sent_at = null
      where id = '${requireUuid(outboxId)}';`,
  );
}

/** Forces a row into `processing` with an expired lease, keeping attempts below the ceiling. */
export function forceExpiredLease(outboxId: string, attempts = 1, secondsAgo = 121): void {
  psql(
    `update public.notification_outbox
        set status = 'processing', attempts = ${Number(attempts)},
            locked_at = now() - interval '${Number(secondsAgo)} seconds',
            sent_at = null
      where id = '${requireUuid(outboxId)}';`,
  );
}

/** Forces an exact microsecond `locked_at` so fencing precision can be tested. */
export function forceLockedAt(outboxId: string, isoWithOffset: string): void {
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:?\d{2})?$/.test(isoWithOffset)) {
    throw new Error(`Locked-at literal must carry an explicit UTC offset: ${isoWithOffset}`);
  }

  psql(
    `update public.notification_outbox
        set status = 'processing', locked_at = '${isoWithOffset}'
      where id = '${requireUuid(outboxId)}';`,
  );
}

export function outboxRow(
  outboxId: string,
): { status: string; attempts: number; lockedAt: string | null; sentAt: string | null; lastError: string | null; micros: number } {
  const [row] = rows(
    `select status, attempts, coalesce(locked_at::text, ''), coalesce(sent_at::text, ''),
            coalesce(last_error, ''),
            coalesce((extract(microseconds from locked_at)::int % 1000)::text, '0')
       from public.notification_outbox where id = '${requireUuid(outboxId)}';`,
  );

  if (!row) {
    throw new Error(`Outbox row ${outboxId} not found.`);
  }

  return {
    status: at(row, 0),
    attempts: Number(at(row, 1)),
    lockedAt: at(row, 2) === '' ? null : at(row, 2),
    sentAt: at(row, 3) === '' ? null : at(row, 3),
    lastError: at(row, 4) === '' ? null : at(row, 4),
    micros: Number(at(row, 5)),
  };
}

export async function countOrdersForOrderNumber(orderNumber: string): Promise<number> {
  return Number(
    scalar(`select count(*) from public.orders where order_number = '${requireOrderNumber(orderNumber)}';`),
  );
}

export async function countPaymentsForOrder(orderId: string): Promise<number> {
  return Number(
    scalar(`select count(*) from public.payments where order_id = '${requireUuid(orderId)}';`),
  );
}

function requireOrderNumber(value: string): string {
  if (!/^RML-[A-Z0-9]{6}$/.test(value)) {
    throw new Error(`Not an order number: ${value}`);
  }
  return value;
}

function requireIdempotencyKey(value: string): string {
  if (!/^[A-Za-z0-9_-]{22,64}$/.test(value)) {
    throw new Error(`Not an idempotency key: ${value}`);
  }
  return value;
}

export function orderIdByOrderNumber(orderNumber: string): string {
  return scalar(`select id from public.orders where order_number = '${requireOrderNumber(orderNumber)}';`);
}

/** Moves an idempotency row outside the 24 h replay window (AC-T7). */
export function backdateIdempotencyKey(key: string, hours = 25): void {
  psql(
    `update public.idempotency_keys
        set created_at = now() - interval '${Number(hours)} hours'
      where scope = 'checkout' and key = '${requireIdempotencyKey(key)}';`,
  );
}

export function paymentCountByReference(providerReference: string): number {
  return Number(
    scalar(
      `select count(*) from public.payments where provider_reference = '${requireProviderRef(providerReference)}';`,
    ),
  );
}

function requireProviderRef(value: string): string {
  if (!/^mock_[0-9a-f]{24}$/.test(value)) {
    throw new Error(`Not a provider reference: ${value}`);
  }
  return value;
}

export { rows };
