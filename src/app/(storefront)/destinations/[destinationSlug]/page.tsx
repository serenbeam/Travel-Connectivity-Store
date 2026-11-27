import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Container } from '@/components/layout/container';
import { Section } from '@/components/layout/section';
import { DestinationImage } from '@/components/store/destination-image';
import { PackageCard } from '@/components/store/package-card';
import { getDestinationWithPackages } from '@/modules/catalog/queries';
import { slugSchema } from '@/modules/catalog/schemas';

/** D-07: dynamic rendering, no cache. */
export const dynamic = 'force-dynamic';

export default async function DestinationPage({
  params,
}: {
  params: Promise<{ destinationSlug: string }>;
}) {
  const { destinationSlug } = await params;

  // S-3: reject a malformed slug before touching the database.
  if (!slugSchema.safeParse(destinationSlug).success) {
    notFound();
  }

  const destination = await getDestinationWithPackages(destinationSlug);

  if (destination === null) {
    notFound();
  }

  return (
    <>
      <Section className="pb-8">
        <Container>
          <nav aria-label="Breadcrumb" className="pb-6 text-sm text-ink-muted">
            <Link href="/destinations" className="text-teal hover:text-forest">
              Destinations
            </Link>
            <span aria-hidden="true"> / </span>
            <span>{destination.name}</span>
          </nav>

          <div className="grid items-start gap-8 lg:grid-cols-2">
            <DestinationImage
              src={destination.heroImageUrl}
              alt={destination.name}
              emoji={destination.flagEmoji}
              name={destination.name}
              aspect="aspect-video"
              sizes="(min-width: 1024px) 50vw, 100vw"
              priority
            />

            <div className="flex flex-col gap-4">
              <h1 className="text-4xl font-medium sm:text-5xl">
                <span aria-hidden="true">{destination.flagEmoji}</span> {destination.name}
              </h1>
              <p className="text-sm font-medium tracking-wide text-teal uppercase">
                {destination.region}
              </p>
              <p className="max-w-prose text-base text-ink-muted">{destination.summary}</p>
              {destination.description !== null ? (
                <p className="max-w-prose text-base leading-relaxed text-ink-muted">
                  {destination.description}
                </p>
              ) : null}
            </div>
          </div>
        </Container>
      </Section>

      <Section className="pt-0">
        <Container>
          <h2 className="pb-6 text-2xl font-medium sm:text-3xl">Choose your package</h2>

          {destination.packages.length === 0 ? (
            <p className="rounded-md border border-sand bg-surface p-6 text-sm text-ink-muted">
              No packages are available for this destination right now.
            </p>
          ) : (
            <ul className="grid gap-6 md:grid-cols-2">
              {destination.packages.map((pkg) => (
                <li key={pkg.slug}>
                  <PackageCard destinationSlug={destination.slug} pkg={pkg} />
                </li>
              ))}
            </ul>
          )}

          {/* Licence compliance (CC BY / CC BY-SA): credit stays on the page. */}
          <p className="pt-10 text-[13px] text-ink-muted">{destination.heroImageAttribution}</p>
        </Container>
      </Section>
    </>
  );
}
