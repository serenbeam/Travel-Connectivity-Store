import { ButtonLink } from '@/components/ui/button-link';
import { PriceText } from '@/components/ui/price-text';
import { formatDataAllowance, formatValidity, packageHighlights } from '@/modules/catalog/derive';
import type { PackageDto } from '@/modules/catalog/types';

/**
 * Package tile on the destination detail page.
 * The data volume and validity are the headline; the price is right-aligned.
 * No price arithmetic happens here — `priceIdr` is the database value as-is.
 */
export function PackageCard({
  destinationSlug,
  pkg,
}: {
  destinationSlug: string;
  pkg: PackageDto;
}) {
  return (
    <article className="flex h-full flex-col gap-3 rounded-md border border-sand bg-surface p-5 shadow-card">
      <h3 className="text-lg font-semibold text-ink">{formatDataAllowance(pkg)}</h3>
      <p className="text-sm text-ink-muted">Valid {formatValidity(pkg.validityDays)}</p>

      <ul className="flex flex-col gap-1 text-sm text-ink-muted">
        {packageHighlights(pkg).map((highlight) => (
          <li key={highlight}>· {highlight}</li>
        ))}
      </ul>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-3">
        <PriceText amount={pkg.priceIdr} />
        <ButtonLink
          href={`/destinations/${destinationSlug}/packages/${pkg.slug}`}
          variant="secondary"
        >
          View details
        </ButtonLink>
      </div>
    </article>
  );
}
