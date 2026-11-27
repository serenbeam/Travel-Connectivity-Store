import Link from 'next/link';

import { PriceText } from '@/components/ui/price-text';
import type { DestinationCardDto } from '@/modules/catalog/types';

import { DestinationImage } from './destination-image';

/**
 * Destination tile used on the homepage and the destination list.
 * Presentational only: every number arrives already derived from the catalog module.
 */
export function DestinationCard({ destination }: { destination: DestinationCardDto }) {
  const packageLabel =
    destination.packageCount === 1 ? '1 package' : `${destination.packageCount} packages`;

  return (
    <Link
      href={`/destinations/${destination.slug}`}
      className="group block overflow-hidden rounded-md border border-sand bg-surface shadow-card transition-colors hover:border-sand-strong"
    >
      <DestinationImage
        src={destination.heroImageUrl}
        alt={destination.name}
        emoji={destination.flagEmoji}
        name={destination.name}
        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
      />

      <div className="flex flex-col gap-1 p-4">
        <h3 className="text-lg font-semibold text-ink group-hover:text-forest">
          {destination.name}
        </h3>
        <p className="text-sm text-ink-muted">
          <span aria-hidden="true">{destination.flagEmoji}</span> {destination.region}
        </p>
        <p className="text-sm text-ink-muted">{packageLabel}</p>

        {destination.fromPriceIdr !== null ? (
          <p className="mt-2 flex items-baseline gap-1.5 text-sm text-ink-muted">
            From <PriceText amount={destination.fromPriceIdr} />
          </p>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">No packages yet</p>
        )}
      </div>
    </Link>
  );
}
