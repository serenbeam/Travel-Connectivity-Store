import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { Section } from '@/components/layout/section';
import { DestinationCard } from '@/components/store/destination-card';
import { DestinationImage } from '@/components/store/destination-image';
import { ButtonLink } from '@/components/ui/button-link';
import { getDestinationsWithAggregates } from '@/modules/catalog/queries';

/** D-07: catalogue is always read fresh so admin edits are visible immediately. */
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const destinations = await getDestinationsWithAggregates({ limit: 5 });
  const hero = destinations[0] ?? null;

  return (
    <>
      <Section className="pt-12 md:pt-16">
        <Container>
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div className="flex flex-col items-start gap-5">
              <p className="text-xs font-medium tracking-[0.18em] text-teal uppercase">
                Travel connectivity
              </p>
              <h1 className="text-4xl leading-[1.1] font-medium sm:text-5xl">
                Stay online in the places you came to see.
              </h1>
              <p className="max-w-prose text-base leading-relaxed text-ink-muted">
                Pick a destination, pick a data package, and check out without an account.
                Local networks, clear prices, no roaming surprises.
              </p>
              <ButtonLink href="/destinations">Browse destinations</ButtonLink>
            </div>

            {hero ? (
              <DestinationImage
                src={hero.heroImageUrl}
                alt={hero.name}
                emoji={hero.flagEmoji}
                name={hero.name}
                aspect="aspect-video"
                sizes="(min-width: 1024px) 50vw, 100vw"
                priority
              />
            ) : (
              <div className="aspect-video w-full rounded-md bg-sand" aria-hidden="true" />
            )}
          </div>
        </Container>
      </Section>

      <Section className="bg-surface pt-0 md:pt-0" as="div">
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-3 pb-8">
            <h2 className="text-2xl font-medium sm:text-3xl">Destinations</h2>
            <Link
              href="/destinations"
              className="inline-flex min-h-11 items-center text-sm font-medium text-teal hover:text-forest"
            >
              See all destinations
            </Link>
          </div>

          {destinations.length === 0 ? (
            <p className="rounded-md border border-sand bg-paper p-6 text-sm text-ink-muted">
              No destinations are available right now.
            </p>
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
    </>
  );
}
