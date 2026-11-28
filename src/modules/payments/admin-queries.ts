import {
  keysetFilter,
  nextCursorOf,
  PAGE_SIZE,
  rangeStartIso,
  type KeysetCursor,
  type RangePreset,
} from '@/lib/admin-list';
import { createSupabaseServerClient } from '@/lib/supabase/server';

import type { AdminPaymentStatus } from '@/modules/orders/admin-queries';
import { paymentStatusSchema } from '@/modules/orders/schemas';

/**
 * Admin payment reads (FR-A8, NFR3, AC-A5).
 *
 * Same rules as the order list: authenticated client (RLS `payments_admin_read`),
 * fixed page size, keyset `(created_at, id)` descending, explicit columns, one query per
 * page (the order number comes from an embedded join — no per-row follow-up).
 */
export class AdminPaymentQueryError extends Error {
  constructor(operation: string, cause: string) {
    super(`Admin payment query failed: ${operation}`);
    this.name = 'AdminPaymentQueryError';
    this.cause = cause;
  }
}

const PAYMENT_COLUMNS = [
  'id',
  'providerReference:provider_reference',
  'amountIdr:amount_idr',
  'status',
  'createdAt:created_at',
  'paidAt:paid_at',
  'failureCode:failure_code',
  'order:orders!inner(orderNumber:order_number)',
].join(',');

export interface AdminPaymentRow {
  providerReference: string;
  orderNumber: string;
  amountIdr: number;
  status: AdminPaymentStatus;
  createdAt: string;
  paidAt: string | null;
  failureCode: string | null;
  /** Internal cursor half; never rendered. */
  id: string;
}

export interface AdminPaymentsQuery {
  status?: AdminPaymentStatus;
  range: RangePreset;
  cursor: KeysetCursor | null;
}

export interface AdminPaymentPage {
  rows: AdminPaymentRow[];
  nextCursor: string | null;
}

interface RawPaymentRow {
  id: unknown;
  providerReference: unknown;
  amountIdr: unknown;
  status: unknown;
  createdAt: unknown;
  paidAt: unknown;
  failureCode: unknown;
  order: unknown;
}

function orderNumberOf(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const orderNumber = (value as { orderNumber?: unknown }).orderNumber;

  return typeof orderNumber === 'string' ? orderNumber : null;
}

function toAdminPaymentRow(row: RawPaymentRow): AdminPaymentRow {
  const status = paymentStatusSchema.parse(row.status);
  const orderNumber = orderNumberOf(row.order);

  if (
    typeof row.id !== 'string' ||
    typeof row.providerReference !== 'string' ||
    typeof row.amountIdr !== 'number' ||
    typeof row.createdAt !== 'string' ||
    orderNumber === null
  ) {
    throw new AdminPaymentQueryError('toAdminPaymentRow', 'unexpected row shape');
  }

  return {
    id: row.id,
    providerReference: row.providerReference,
    orderNumber,
    amountIdr: row.amountIdr,
    status,
    createdAt: row.createdAt,
    paidAt: typeof row.paidAt === 'string' ? row.paidAt : null,
    failureCode: typeof row.failureCode === 'string' ? row.failureCode : null,
  };
}

export async function listPaymentsAdmin(
  query: AdminPaymentsQuery,
): Promise<AdminPaymentPage> {
  const supabase = await createSupabaseServerClient();

  let builder = supabase
    .from('payments')
    .select(PAYMENT_COLUMNS)
    .gte('created_at', rangeStartIso(query.range))
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE);

  if (query.status) {
    builder = builder.eq('status', query.status);
  }

  if (query.cursor) {
    // Same reasoning as the order list: decodeCursor() normalises the instant to `…Z` and
    // keysetFilter() quotes both values inside `or(…)` (KI-35).
    builder = builder.or(keysetFilter(query.cursor));
  }

  const { data, error } = await builder;

  if (error) {
    throw new AdminPaymentQueryError('listPaymentsAdmin', error.message);
  }

  const rows = (data ?? []).map((row) => toAdminPaymentRow(row as unknown as RawPaymentRow));

  return { rows, nextCursor: nextCursorOf(rows) };
}

/** Re-exported so the route handler and pages share one status vocabulary. */
export type { AdminPaymentStatus };
