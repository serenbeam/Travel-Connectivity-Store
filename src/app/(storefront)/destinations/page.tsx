import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { Section } from '@/components/layout/section';
import { DestinationCard } from '@/components/store/destination-card';
import { getDestinationsWithAggregates, getRegions } from '@/modules/catalog/queries';
import { regionFilterSchema } from '@/modules/catalog/schemas';

/** D-07: dynamic rendering, no cache. */
export const dynamic = 'force-dynamic';

function chipClass(active: boolean): string {
  return [
    'inline-flex min-h-11 items-center rounded-sm border px-3 text-sm font-medium transition-colors',
    active
      ? 'border-teal bg-teal text-white'
      : 'border-sand bg-surface text-ink hover:border-sand-strong',
  ].join(' ');
}

export default async function DestinationsPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawRegion = Array.isArray(params.region) ? params.region[0] : params.region;

  // D-08: the value must look like a region stored in the database. Anything else is
  // rejected before it reaches PostgREST (S-3) and the page falls back to "all regions".
  const region =
    rawRegion !== undefined && regionFilterSchema.safeParse(rawRegion).success
      ? rawRegion
      : undefined;

  const [regions, destinations] = await Promise.all([
    getRegions(),
    getDestinationsWithAggregates(region === undefined ? {} : { region }),
  ]);

  // A syntactically valid but unknown region (e.g. "Mars") is a real filter that simply
  // matches nothing: it keeps its chip state off and shows the empty state with a reset.
  const activeRegion = region !== undefined && regions.includes(region) ? region : undefined;

  return (
    <Section>
      <Container>
        <div className="flex flex-col gap-3 pb-8">
          <h1 className="text-4xl font-medium sm:text-5xl">Destinations</h1>
          <p className="max-w-prose text-base text-ink-muted">
            Five places to start. Each destination lists the data packages available there.
          </p>
        </div>

        <nav aria-label="Filter by region" className="flex flex-wrap gap-2 pb-8">
          <Link href="/destinations" className={chipClass(region === undefined)}>
            All
          </Link>
          {regions.map((value) => (
            <Link
              key={value}
              href={`/destinations?region=${encodeURIComponent(value)}`}
              className={chipClass(activeRegion === value)}
              aria-current={activeRegion === value ? 'page' : undefined}
            >
              {value}
            </Link>
          ))}
        </nav>

        {destinations.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-md border border-sand bg-surface p-6">
            <p className="text-sm text-ink-muted">
              {region === undefined
                ? 'No destinations are available right now.'
                : `No destinations in ${region}.`}
            </p>
            {region !== undefined ? (
              <Link
                href="/destinations"
                className="inline-flex min-h-11 items-center text-sm font-medium text-teal hover:text-forest"
              >
                Show all destinations
              </Link>
            ) : null}
          </div>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {destinations.map((destination) => (
              <li key={destination.slug}>
                <DestinationCard destination={destination} />
              </li>
            ))}
          </ul>
        )}
      </Container>
    </Section>
  );
}
