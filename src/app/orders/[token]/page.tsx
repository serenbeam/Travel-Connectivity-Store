import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Container } from '@/components/layout/container';
import { formatIdr, formatWibDateTime } from '@/lib/format';
import { getOrderStatusByToken } from '@/modules/orders/queries';
import type { OrderStatusDto } from '@/modules/orders/schemas';

/**
 * `/orders/[token]` — capability link (AC-C7, AC-C8, AC-T1..T3, NFR6).
 *
 * Deliberately outside the `(storefront)` route group: no shared chrome, no header or
 * footer assets, so this page cannot issue a cross-origin request even by accident.
 * Rendering happens on the server with the service client; the hash comparison and column
 * whitelist happen in `orders/queries.ts`.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Order status',
  robots: { index: false, follow: false },
};

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const STATUS_COPY: Record<
  OrderStatusDto['orderStatus'],
  { heading: string; body: string }
> = {
  pending: {
    heading: 'Waiting for payment',
    body: 'This order has not been paid yet.',
  },
  paid: {
    heading: 'Payment confirmed',
    body: 'Your data package is confirmed.',
  },
  failed: {
    heading: 'Payment failed',
    body: 'This order is closed and cannot be paid.',
  },
};

function StatusBadge({ status }: { status: OrderStatusDto['orderStatus'] }) {
  const tone =
    status === 'paid'
      ? 'bg-success/10 text-success'
      : status === 'failed'
        ? 'bg-danger/10 text-danger'
        : 'bg-warn/10 text-warn';

  return (
    <span className={`inline-flex items-center rounded-sm px-2 py-1 text-xs font-medium ${tone}`}>
      {status === 'paid' ? 'Paid' : status === 'failed' ? 'Failed' : 'Pending'}
    </span>
  );
}

export default async function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!TOKEN_PATTERN.test(token)) {
    notFound();
  }

  const lookup = await getOrderStatusByToken(token);

  if (lookup === null) {
    notFound();
  }

  const { order, paymentRef } = lookup;
  const copy = STATUS_COPY[order.orderStatus];
  const canContinuePaying = order.orderStatus === 'pending' && paymentRef !== null;

  return (
    <main className="bg-paper py-16">
      <Container>
        <div className="mx-auto flex max-w-[640px] flex-col gap-6">
          <header className="flex flex-col gap-2">
            <StatusBadge status={order.orderStatus} />
            <h1 className="text-3xl font-medium sm:text-4xl">{copy.heading}</h1>
            <p className="text-base text-ink-muted">{copy.body}</p>
          </header>

          <section
            aria-label="Order details"
            className="divide-y divide-sand rounded-md border border-sand bg-surface"
          >
            {[
              ['Order number', order.orderNumber],
              ['Destination', order.destinationName],
              ['Package', `${order.packageDataSnapshot} × ${order.quantity}`],
              ['Customer', order.customerName],
              ['Email', order.customerEmail],
              ['Created', formatWibDateTime(order.createdAt)],
              ['Total', formatIdr(order.totalIdr)],
              ...(order.paidAt === null ? [] : [['Paid at', formatWibDateTime(order.paidAt)]]),
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 px-5 py-3">
                <dt className="text-sm text-ink-muted">{label}</dt>
                <dd className="text-right text-sm font-medium text-ink">{value}</dd>
              </div>
            ))}
          </section>

          <section aria-label="Payment status" className="flex flex-col gap-1">
            <p className="text-sm text-ink-muted">
              Payment status: <span className="font-medium text-ink">{order.paymentStatus}</span>
            </p>
            {order.notificationStatus !== null ? (
              <p className="text-xs text-ink-muted">Notification: {order.notificationStatus}</p>
            ) : null}
          </section>

          <div className="flex flex-wrap gap-3">
            {canContinuePaying ? (
              <Link
                href={`/mock-gateway/${paymentRef}?token=${token}`}
                className="inline-flex min-h-11 items-center rounded-sm bg-forest px-4 py-2.5 text-sm font-medium text-white hover:bg-ink"
              >
                Continue payment
              </Link>
            ) : null}

            {order.orderStatus === 'failed' ? (
              <Link
                href="/destinations"
                className="inline-flex min-h-11 items-center rounded-sm bg-forest px-4 py-2.5 text-sm font-medium text-white hover:bg-ink"
              >
                Start a new order
              </Link>
            ) : null}

            <Link
              href="/destinations"
              className="inline-flex min-h-11 items-center rounded-sm border border-sand bg-surface px-4 py-2.5 text-sm font-medium text-ink hover:border-sand-strong"
            >
              Back to destinations
            </Link>
          </div>

          <p className="text-xs text-ink-muted">
            Keep this link — it is the only way to reopen this order.
          </p>
        </div>
      </Container>
    </main>
  );
}
