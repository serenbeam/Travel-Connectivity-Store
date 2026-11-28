import type { Metadata } from 'next';
import Link from 'next/link';

import { StatusBadge } from '@/components/ui/status-badge';
import { formatIdr, formatWibDateTime } from '@/lib/format';
import { getAdminOverview } from '@/modules/orders/admin-queries';

export const metadata: Metadata = { title: 'Overview' };

const STAT_LABELS = [
  { key: 'ordersToday', label: 'Orders today (WIB)' },
  { key: 'paidToday', label: 'Paid today (WIB)' },
  { key: 'pending', label: 'Pending orders' },
] as const;

/**
 * `/admin` overview (FR-A3, AC-A7).
 *
 * "Today" is the Asia/Jakarta day, computed server-side from the WIB day boundary — not the
 * UTC date, which would be wrong for the first seven hours of a WIB day.
 */
export default async function AdminOverviewPage() {
  const overview = await getAdminOverview();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-ink">Overview</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Operational numbers for today (Asia/Jakarta) and the five newest orders.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {STAT_LABELS.map((stat) => (
          <div key={stat.key} className="rounded-sm border border-sand bg-surface p-4">
            <p className="text-xs font-medium tracking-[0.12em] text-ink-muted uppercase">
              {stat.label}
            </p>
            <p className="tabular mt-2 font-display text-3xl text-ink">
              {overview[stat.key]}
            </p>
          </div>
        ))}
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-ink">Newest orders</h2>
          <Link href="/admin/orders" className="text-sm font-medium text-teal hover:text-forest">
            View all orders
          </Link>
        </div>

        {overview.recent.length === 0 ? (
          <p className="rounded-sm border border-sand bg-surface p-4 text-sm text-ink-muted">
            No orders yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-sm border border-sand bg-surface">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-sand text-xs tracking-[0.08em] text-ink-muted uppercase">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    Order
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Customer
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Package
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Total
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Created (WIB)
                  </th>
                </tr>
              </thead>
              <tbody>
                {overview.recent.map((order) => (
                  <tr key={order.id} className="border-b border-sand/60 last:border-0">
                    <td className="px-3 py-2 font-medium text-ink">{order.orderNumber}</td>
                    <td className="px-3 py-2 text-ink-muted">{order.customerName}</td>
                    <td className="px-3 py-2 text-ink-muted">{order.packageName}</td>
                    <td className="tabular px-3 py-2 text-ink">{formatIdr(order.totalIdr)}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-3 py-2 text-ink-muted">
                      {formatWibDateTime(order.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
