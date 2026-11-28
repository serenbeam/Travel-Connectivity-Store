import {
  keysetFilter,
  nextCursorOf,
  PAGE_SIZE,
  rangeStartIso,
  startOfWibDay,
  type KeysetCursor,
  type RangePreset,
} from '@/lib/admin-list';
import { createSupabaseServerClient } from '@/lib/supabase/server';

import type { OrdersSearch } from './admin-search';
import {
  notificationStatusSchema,
  orderStatusSchema,
  paymentStatusSchema,
} from './schemas';

/**
 * Admin order reads (FR-A3, FR-A7, NFR3, AC-A5, AC-A7).
 *
 * Reads use the authenticated client so RLS `orders_admin_read` (is_admin()) is the
 * enforcing layer — not the service role. Page size is fixed at PAGE_SIZE; a client-supplied
 * `limit` is never read.
 */
export class AdminOrderQueryError extends Error {
  constructor(operation: string, cause: string) {
    super(`Admin order query failed: ${operation}`);
    this.name = 'AdminOrderQueryError';
    this.cause = cause;
  }
}

const ORDER_COLUMNS = [
  'id',
  'orderNumber:order_number',
  'createdAt:created_at',
  'customerName:customer_name',
  'customerEmail:customer_email',
  'destinationName:destination_name_snapshot',
  'packageName:package_name_snapshot',
  'totalIdr:total_idr',
  'status',
  'payments(status)',
  'notification_outbox(status)',
].join(',');

export type AdminOrderStatus = 'pending' | 'paid' | 'failed';
export type AdminPaymentStatus = 'pending' | 'succeeded' | 'failed';
export type AdminNotificationStatus = 'pending' | 'processing' | 'sent' | 'failed';

export interface AdminOrderRow {
  id: string;
  orderNumber: string;
  createdAt: string;
  customerName: string;
  customerEmail: string;
  destinationName: string;
  packageName: string;
  totalIdr: number;
  status: AdminOrderStatus;
  paymentStatus: AdminPaymentStatus | null;
  notificationStatus: AdminNotificationStatus | null;
}

export interface AdminOrdersQuery {
  status?: AdminOrderStatus;
  range: RangePreset;
  search: OrdersSearch;
  cursor: KeysetCursor | null;
}

export interface AdminOrderPage {
  rows: AdminOrderRow[];
  nextCursor: string | null;
}

interface RawOrderRow {
  id: unknown;
  orderNumber: unknown;
  createdAt: unknown;
  customerName: unknown;
  customerEmail: unknown;
  destinationName: unknown;
  packageName: unknown;
  totalIdr: unknown;
  status: unknown;
  payments: unknown;
  notification_outbox: unknown;
}

function embeddedStatus(value: unknown): unknown {
  return typeof value === 'object' && value !== null
    ? (value as { status?: unknown }).status
    : null;
}

function paymentStatusOf(value: unknown): AdminPaymentStatus | null {
  const parsed = paymentStatusSchema.safeParse(embeddedStatus(value));

  return parsed.success ? parsed.data : null;
}

function notificationStatusOf(value: unknown): AdminNotificationStatus | null {
  const parsed = notificationStatusSchema.safeParse(embeddedStatus(value));

  return parsed.success ? parsed.data : null;
}

/** Transport row -> DTO with an explicit whitelist; nothing internal leaks upward. */
function toAdminOrderRow(row: RawOrderRow): AdminOrderRow {
  if (
    typeof row.id !== 'string' ||
    typeof row.orderNumber !== 'string' ||
    typeof row.createdAt !== 'string' ||
    typeof row.customerName !== 'string' ||
    typeof row.customerEmail !== 'string' ||
    typeof row.destinationName !== 'string' ||
    typeof row.packageName !== 'string' ||
    typeof row.totalIdr !== 'number'
  ) {
    throw new AdminOrderQueryError('toAdminOrderRow', 'unexpected row shape');
  }

  return {
    id: row.id,
    orderNumber: row.orderNumber,
    createdAt: row.createdAt,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    destinationName: row.destinationName,
    packageName: row.packageName,
    totalIdr: row.totalIdr,
    status: orderStatusSchema.parse(row.status),
    paymentStatus: paymentStatusOf(row.payments),
    notificationStatus: notificationStatusOf(row.notification_outbox),
  };
}

export async function listOrdersAdmin(query: AdminOrdersQuery): Promise<AdminOrderPage> {
  // `invalid` is rejected by the route handler (422); returning an empty page here would
  // silently hide a bug, so it is treated as an internal error.
  if (query.search.kind === 'invalid') {
    throw new AdminOrderQueryError('listOrdersAdmin', 'search input was not validated');
  }

  const supabase = await createSupabaseServerClient();

  let builder = supabase
    .from('orders')
    .select(ORDER_COLUMNS)
    .gte('created_at', rangeStartIso(query.range))
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE);

  if (query.status) {
    builder = builder.eq('status', query.status);
  }

  // One fixed column per search shape — never an `or=(…)` built from user text (G-16).
  if (query.search.kind === 'order_number') {
    builder = builder.eq('order_number', query.search.value);
  }

  if (query.search.kind === 'customer_email') {
    builder = builder.eq('customer_email', query.search.value);
  }

  if (query.cursor) {
    // Safe by construction: decodeCursor() re-validated both halves and normalised the
    // instant to a UTC `…Z` literal, and keysetFilter() quotes both values inside `or(…)`
    // (KI-35).
    builder = builder.or(keysetFilter(query.cursor));
  }

  const { data, error } = await builder;

  if (error) {
    throw new AdminOrderQueryError('listOrdersAdmin', error.message);
  }

  const rows = (data ?? []).map((row) => toAdminOrderRow(row as unknown as RawOrderRow));

  return { rows, nextCursor: nextCursorOf(rows) };
}

export interface AdminOverview {
  /** Orders created since 00:00 Asia/Jakarta (AC-A7). */
  ordersToday: number;
  /** Orders paid since 00:00 Asia/Jakarta. */
  paidToday: number;
  /** All orders still pending — no automatic expiry exists in the MVP. */
  pending: number;
  /** Five newest orders, any date. */
  recent: AdminOrderRow[];
}

export async function getAdminOverview(now: Date = new Date()): Promise<AdminOverview> {
  const supabase = await createSupabaseServerClient();
  const dayStart = startOfWibDay(now).toISOString();

  const [ordersToday, paidToday, pending, recent] = await Promise.all([
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', dayStart),
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'paid')
      .gte('paid_at', dayStart),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase
      .from('orders')
      .select(ORDER_COLUMNS)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(5),
  ]);

  for (const result of [ordersToday, paidToday, pending, recent]) {
    if (result.error) {
      throw new AdminOrderQueryError('getAdminOverview', result.error.message);
    }
  }

  return {
    ordersToday: ordersToday.count ?? 0,
    paidToday: paidToday.count ?? 0,
    pending: pending.count ?? 0,
    recent: (recent.data ?? []).map((row) => toAdminOrderRow(row as unknown as RawOrderRow)),
  };
}
