import type { Metadata } from 'next';
import Link from 'next/link';

import { StatusBadge } from '@/components/ui/status-badge';
import {
  decodeCursor,
  parseRangePreset,
  type RangePreset,
} from '@/lib/admin-list';
import { formatIdr, formatWibDateTime } from '@/lib/format';
import type { AdminPaymentStatus } from '@/modules/payments/admin-queries';
import { listPaymentsAdmin } from '@/modules/payments/admin-queries';
import { paymentStatusSchema } from '@/modules/orders/schemas';

export const metadata: Metadata = { title: 'Payments' };

type SearchParams = Promise<{ status?: string; range?: string; cursor?: string }>;

const RANGE_LABELS: ReadonlyArray<{ value: RangePreset; label: string }> = [
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
];

const STATUS_LABELS: ReadonlyArray<{ value: AdminPaymentStatus; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'succeeded', label: 'Succeeded' },
  { value: 'failed', label: 'Failed' },
];

/**
 * `/admin/payments` (FR-A8).
 *
 * The same range/status filters as orders, minus free-text search: a payment is found
 * through its order, and the order number arrives from one embedded join.
 */
export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  const parsedStatus = params.status ? paymentStatusSchema.safeParse(params.status) : null;
  const status = parsedStatus?.success ? parsedStatus.data : undefined;
  const statusInvalid = params.status !== undefined && parsedStatus?.success === false;

  const range = parseRangePreset(params.range ?? null);
  const rangeInvalid = range === null;

  const cursor = decodeCursor(params.cursor ?? null);
  const cursorInvalid = params.cursor !== undefined && params.cursor !== '' && cursor === null;

  const filterInvalid = statusInvalid || rangeInvalid || cursorInvalid;

  const page =
    filterInvalid || range === null
      ? { rows: [], nextCursor: null }
      : await listPaymentsAdmin({ status, range, cursor });

  function hrefFor(overrides: Record<string, string | undefined>): string {
    const next = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      status: params.status,
      range: range ?? undefined,
      cursor: params.cursor,
      ...overrides,
    };

    for (const [key, value] of Object.entries(merged)) {
      if (typeof value === 'string' && value !== '') {
        next.set(key, value);
      }
    }

    const query = next.toString();

    return query === '' ? '/admin/payments' : `/admin/payments?${query}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-ink">Payments</h1>
        <p className="mt-1 text-sm text-ink-muted">
          One payment per order. A settled payment is terminal — status changes only through
          server-side verification.
        </p>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-sm border border-sand bg-surface p-4">
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

      {filterInvalid ? (
        <p role="alert" className="rounded-sm border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          One or more filters are invalid. Range accepts 24h, 7d, or 30d.
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-sm border border-sand bg-surface">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="border-b border-sand text-xs tracking-[0.08em] text-ink-muted uppercase">
            <tr>
              <th scope="col" className="px-3 py-2">
                Reference
              </th>
              <th scope="col" className="px-3 py-2">
                Order
              </th>
              <th scope="col" className="px-3 py-2">
                Amount
              </th>
              <th scope="col" className="px-3 py-2">
                Status
              </th>
              <th scope="col" className="px-3 py-2">
                Created (WIB)
              </th>
              <th scope="col" className="px-3 py-2">
                Paid (WIB)
              </th>
              <th scope="col" className="px-3 py-2">
                Failure code
              </th>
            </tr>
          </thead>
          <tbody>
            {page.rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-ink-muted">
                  No payments match these filters.
                </td>
              </tr>
            ) : (
              page.rows.map((payment) => (
                <tr key={payment.id} className="border-b border-sand/60 last:border-0">
                  <td className="px-3 py-2 font-mono text-xs text-ink-muted">
                    {payment.providerReference}
                  </td>
                  <td className="px-3 py-2 font-medium text-ink">{payment.orderNumber}</td>
                  <td className="tabular px-3 py-2 text-ink">{formatIdr(payment.amountIdr)}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={payment.status} />
                  </td>
                  <td className="px-3 py-2 text-ink-muted">
                    {formatWibDateTime(payment.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-ink-muted">
                    {payment.paidAt === null ? '—' : formatWibDateTime(payment.paidAt)}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-muted">
                    {payment.failureCode ?? '—'}
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
