import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Container } from '@/components/layout/container';
import { Section } from '@/components/layout/section';
import { PriceText } from '@/components/ui/price-text';
import { formatDataAllowance, formatValidity } from '@/modules/catalog/derive';
import { getPackageByRoute } from '@/modules/catalog/queries';
import { slugSchema } from '@/modules/catalog/schemas';

import { CheckoutForm } from './checkout-form';

/**
 * `/checkout?destination=<slug>&package=<slug>` (api-contract §4.3).
 *
 * Server-rendered summary plus a client form. The price shown here is informational only:
 * the authoritative total is computed inside `create_order_idempotent`.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
};

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ destination?: string | string[]; package?: string | string[] }>;
}) {
  const query = await searchParams;
  const destinationSlug = Array.isArray(query.destination) ? query.destination[0] : query.destination;
  const packageSlug = Array.isArray(query.package) ? query.package[0] : query.package;

  if (
    destinationSlug === undefined ||
    packageSlug === undefined ||
    !slugSchema.safeParse(destinationSlug).success ||
    !slugSchema.safeParse(packageSlug).success
  ) {
    notFound();
  }

  const pkg = await getPackageByRoute(destinationSlug, packageSlug);

  if (pkg === null) {
    notFound();
  }

  return (
    <Section>
      <Container>
        <div className="grid items-start gap-10 lg:grid-cols-12">
          <div className="flex flex-col gap-6 lg:col-span-7">
            <div className="flex flex-col gap-2">
              <h1 className="text-4xl font-medium sm:text-5xl">Checkout</h1>
              <p className="text-base text-ink-muted">
                Guest checkout — no account required. You will receive a link to your order.
              </p>
            </div>

            <CheckoutForm
              destinationSlug={destinationSlug}
              packageSlug={packageSlug}
              unitPriceIdr={pkg.priceIdr}
            />
          </div>

          <aside className="lg:col-span-5">
            <div className="flex flex-col gap-4 rounded-lg border border-sand bg-surface p-6 shadow-card lg:sticky lg:top-8">
              <h2 className="text-lg font-semibold">Order summary</h2>

              <nav aria-label="Breadcrumb" className="text-xs text-ink-muted">
                <Link href={`/destinations/${destinationSlug}`} className="text-teal hover:text-forest">
                  {pkg.destination.name}
                </Link>
                <span aria-hidden="true"> / </span>
                <span>{pkg.name}</span>
              </nav>

              <dl className="divide-y divide-sand text-sm">
                <div className="flex justify-between gap-3 py-2">
                  <dt className="text-ink-muted">Data</dt>
                  <dd className="font-medium">{formatDataAllowance(pkg)}</dd>
                </div>
                <div className="flex justify-between gap-3 py-2">
                  <dt className="text-ink-muted">Validity</dt>
                  <dd className="font-medium">{formatValidity(pkg.validityDays)}</dd>
                </div>
                <div className="flex justify-between gap-3 py-2">
                  <dt className="text-ink-muted">Price per unit</dt>
                  <dd>
                    <PriceText amount={pkg.priceIdr} />
                  </dd>
                </div>
              </dl>

              <p className="text-xs text-ink-muted">
                Total is recalculated on the server from the package price and the quantity you
                choose.
              </p>
            </div>
          </aside>
        </div>
      </Container>
    </Section>
  );
}
