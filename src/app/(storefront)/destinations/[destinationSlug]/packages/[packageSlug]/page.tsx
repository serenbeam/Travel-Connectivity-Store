import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Container } from '@/components/layout/container';
import { Section } from '@/components/layout/section';
import { ButtonLink } from '@/components/ui/button-link';
import { PriceText } from '@/components/ui/price-text';
import {
  formatDataAllowance,
  formatValidity,
  packageSpecs,
} from '@/modules/catalog/derive';
import { getPackageByRoute } from '@/modules/catalog/queries';
import { slugSchema } from '@/modules/catalog/schemas';

/** D-07: dynamic rendering, no cache. */
export const dynamic = 'force-dynamic';

export default async function PackagePage({
  params,
}: {
  params: Promise<{ destinationSlug: string; packageSlug: string }>;
}) {
  const { destinationSlug, packageSlug } = await params;

  // S-3: both slugs are validated before any query runs.
  if (!slugSchema.safeParse(destinationSlug).success || !slugSchema.safeParse(packageSlug).success) {
    notFound();
  }

  const pkg = await getPackageByRoute(destinationSlug, packageSlug);

  if (pkg === null) {
    notFound();
  }

  // D-05: the checkout link carries both slugs so E-5 resolves the package
  // unambiguously. E-5 does not exist yet, so this URL returns 404 until then
  // (documented as a temporary limitation, not a stub page).
  const checkoutHref = `/checkout?destination=${encodeURIComponent(
    destinationSlug,
  )}&package=${encodeURIComponent(packageSlug)}`;

  return (
    <Section>
      <Container>
        <nav aria-label="Breadcrumb" className="pb-6 text-sm text-ink-muted">
          <Link href="/destinations" className="text-teal hover:text-forest">
            Destinations
          </Link>
          <span aria-hidden="true"> / </span>
          <Link
            href={`/destinations/${destinationSlug}`}
            className="text-teal hover:text-forest"
          >
            {pkg.destination.name}
          </Link>
          <span aria-hidden="true"> / </span>
          <span>{pkg.name}</span>
        </nav>

        <div className="grid items-start gap-10 lg:grid-cols-12">
          <div className="flex flex-col gap-6 lg:col-span-7">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium tracking-[0.18em] text-teal uppercase">
                <span aria-hidden="true">{pkg.destination.flagEmoji}</span>{' '}
                {pkg.destination.name} · {pkg.destination.region}
              </p>
              <h1 className="text-4xl font-medium sm:text-5xl">{pkg.name}</h1>
              <p className="text-base text-ink-muted">
                {formatDataAllowance(pkg)} of data, valid {formatValidity(pkg.validityDays)}.
              </p>
            </div>

            <dl className="divide-y divide-sand rounded-md border border-sand bg-surface">
              {packageSpecs(pkg).map((spec) => (
                <div key={spec.label} className="flex justify-between gap-4 px-5 py-3.5">
                  <dt className="text-sm text-ink-muted">{spec.label}</dt>
                  <dd className="text-sm font-medium text-ink">{spec.value}</dd>
                </div>
              ))}
            </dl>

            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-medium">What you get</h2>
              <p className="max-w-prose text-base leading-relaxed text-ink-muted">
                A local data plan for {pkg.destination.name}, activated on arrival — no
                physical SIM to collect and no roaming charges. The package is delivered as
                an eSIM profile after payment is confirmed.
              </p>
            </div>
          </div>

          <aside className="lg:col-span-5">
            <div className="flex flex-col gap-4 rounded-lg border border-sand bg-surface p-6 shadow-card lg:sticky lg:top-8">
              <p className="text-sm text-ink-muted">Total price</p>
              <PriceText amount={pkg.priceIdr} size="detail" />
              <p className="text-sm text-ink-muted">
                One-time payment. No account needed.
              </p>
              <ButtonLink href={checkoutHref}>Continue to checkout</ButtonLink>
              <p className="text-xs text-ink-muted">
                Checkout is the next step and is not part of this screen.
              </p>
            </div>
          </aside>
        </div>
      </Container>
    </Section>
  );
}
