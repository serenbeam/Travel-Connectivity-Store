import type { Metadata } from 'next';
import Link from 'next/link';

import { SearchField } from '@/components/admin/search-field';
import { ResendNotificationForm } from '@/components/admin/resend-notification-form';
import { StatusBadge } from '@/components/ui/status-badge';
import { decodeCursor, parseRangePreset, type RangePreset } from '@/lib/admin-list';
import { formatIdr, formatWibDateTime } from '@/lib/format';
import {
  listOrdersAdmin,
  type AdminOrderRow,
  type AdminOrderStatus,
} from '@/modules/orders/admin-queries';
import { parseOrdersSearch } from '@/modules/orders/admin-search';
import { orderStatusSchema } from '@/modules/orders/schemas';

export const metadata: Metadata = { title: 'Orders' };

type SearchParams = Promise<{
  status?: string;
  range?: string;
  q?: string;
  cursor?: string;
}>;

const RANGE_LABELS: ReadonlyArray<{ value: RangePreset; label: string }> = [
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
];

const STATUS_LABELS: ReadonlyArray<{ value: AdminOrderStatus; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'failed', label: 'Failed' },
];

/**
 * `/admin/orders` (FR-A7, AC-A5).
 *
 * Server-rendered filters and keyset pagination; the page size is fixed at 10 in the module.
 * An invalid filter is reported on the page instead of throwing, and the same parser that
 * guards the API guards the page.
 */
export default async function AdminOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  const parsedStatus = params.status ? orderStatusSchema.safeParse(params.status) : null;
  const status = parsedStatus?.success ? parsedStatus.data : undefined;
  const statusInvalid = params.status !== undefined && parsedStatus?.success === false;

  const range = parseRangePreset(params.range ?? null);
  const rangeInvalid = range === null;

  const search = parseOrdersSearch(params.q ?? null);
  const searchInvalid = search.kind === 'invalid';

  const cursor = decodeCursor(params.cursor ?? null);
  const cursorInvalid = params.cursor !== undefined && params.cursor !== '' && cursor === null;

  const filterInvalid = statusInvalid || rangeInvalid || searchInvalid || cursorInvalid;

  let page: { rows: AdminOrderRow[]; nextCursor: string | null } = {
    rows: [],
    nextCursor: null,
  };

  if (!filterInvalid && range !== null) {
    page = await listOrdersAdmin({ status, range, search, cursor });
  }

  function hrefFor(overrides: Record<string, string | undefined>): string {
    const next = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      status: params.status,
      range: range ?? undefined,
      q: params.q,
      cursor: params.cursor,
      ...overrides,
    };

    for (const [key, value] of Object.entries(merged)) {
      if (typeof value === 'string' && value !== '') {
        next.set(key, value);
      }
    }

    const query = next.toString();

    return query === '' ? '/admin/orders' : `/admin/orders?${query}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-ink">Orders</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Newest first, 10 rows per page. Times are shown in Asia/Jakarta; storage stays UTC.
          The Resend action is offered only when the outbox row is resendable; the endpoint
          re-checks and claims before delivering.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-sm border border-sand bg-surface p-4">
        <div className="w-full max-w-sm">
          <SearchField
            label="Search"
            basePath="/admin/orders"
            placeholder="RML-4KQ9ZT or budi@example.com"
            defaultValue={params.q ?? ''}
          />
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium tracking-[0.12em] text-ink-muted uppercase">
              Range
            </span>
            {RANGE_LABELS.map((option) => {
              const active = (range ?? '7d') === option.value;

              return (
                <Link
                  key={option.value}
                  href={hrefFor({ range: option.value, cursor: undefined })}
                  aria-current={active ? 'true' : undefined}
                  className={
                    active
                      ? 'rounded-sm bg-forest px-2.5 py-1 text-xs font-medium text-white'
                      : 'rounded-sm border border-sand px-2.5 py-1 text-xs font-medium text-ink-muted hover:border-sand-strong'
                  }
                >
                  {option.label}
                </Link>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium tracking-[0.12em] text-ink-muted uppercase">
              Status
            </span>
            <Link
              href={hrefFor({ status: undefined, cursor: undefined })}
              aria-current={status === undefined ? 'true' : undefined}
              className={
                status === undefined
                  ? 'rounded-sm bg-forest px-2.5 py-1 text-xs font-medium text-white'
                  : 'rounded-sm border border-sand px-2.5 py-1 text-xs font-medium text-ink-muted hover:border-sand-strong'
              }
            >
              All
            </Link>
            {STATUS_LABELS.map((option) => {
              const active = status === option.value;

              return (
                <Link
                  key={option.value}
                  href={hrefFor({ status: option.value, cursor: undefined })}
                  aria-current={active ? 'true' : undefined}
                  className={
                    active
                      ? 'rounded-sm bg-forest px-2.5 py-1 text-xs font-medium text-white'
                      : 'rounded-sm border border-sand px-2.5 py-1 text-xs font-medium text-ink-muted hover:border-sand-strong'
                  }
                >
                  {option.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {filterInvalid ? (
        <p role="alert" className="rounded-sm border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          One or more filters are invalid. Search accepts an order number (RML-XXXXXX) or an
          email address; range accepts 24h, 7d, or 30d.
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-sm border border-sand bg-surface">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-sand text-xs tracking-[0.08em] text-ink-muted uppercase">
            <tr>
              <th scope="col" className="px-3 py-2">
                Order
              </th>
              <th scope="col" className="px-3 py-2">
                Customer
              </th>
              <th scope="col" className="px-3 py-2">
                Destination
              </th>
              <th scope="col" className="px-3 py-2">
                Package
              </th>
              <th scope="col" className="px-3 py-2">
                Total
              </th>
              <th scope="col" className="px-3 py-2">
                Order
              </th>
              <th scope="col" className="px-3 py-2">
                Payment
              </th>
              <th scope="col" className="px-3 py-2">
                Notification
              </th>
              <th scope="col" className="px-3 py-2">
                Created (WIB)
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {page.rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-ink-muted">
                  No orders match these filters.
                </td>
              </tr>
            ) : (
              page.rows.map((order) => (
                <tr key={order.id} className="border-b border-sand/60 last:border-0">
                  <td className="px-3 py-2 font-medium text-ink">{order.orderNumber}</td>
                  <td className="px-3 py-2 text-ink-muted">
                    {order.customerName}
                    <span className="block text-xs">{order.customerEmail}</span>
                  </td>
                  <td className="px-3 py-2 text-ink-muted">{order.destinationName}</td>
                  <td className="px-3 py-2 text-ink-muted">{order.packageName}</td>
                  <td className="tabular px-3 py-2 text-ink">{formatIdr(order.totalIdr)}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="px-3 py-2">
                    {order.paymentStatus ? (
                      <StatusBadge status={order.paymentStatus} />
                    ) : (
                      <span className="text-xs text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {order.notificationStatus ? (
                      <StatusBadge status={order.notificationStatus} />
                    ) : (
                      <span className="text-xs text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-ink-muted">
                    {formatWibDateTime(order.createdAt)}
                  </td>
                  <td className="px-3 py-2">
                    {order.canResendNotification ? (
                      <ResendNotificationForm orderId={order.id} />
                    ) : (
                      <span className="block text-right text-xs text-ink-muted">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-muted">
          {page.rows.length} row{page.rows.length === 1 ? '' : 's'} on this page · page size 10
        </p>
        <div className="flex gap-2">
          {params.cursor ? (
            <Link
              href={hrefFor({ cursor: undefined })}
              className="rounded-sm border border-sand px-3 py-2 text-sm font-medium text-ink-muted hover:border-sand-strong"
            >
              First page
            </Link>
          ) : null}
          {page.nextCursor ? (
            <Link
              href={hrefFor({ cursor: page.nextCursor })}
              className="rounded-sm bg-forest px-3 py-2 text-sm font-medium text-white hover:bg-ink"
            >
              Next page
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
