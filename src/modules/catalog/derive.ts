import type { PackageShape, PriceShape } from './types';

/**
 * Pure catalog derivations (D-02: no package description column).
 *
 * These functions contain no I/O and no JSX, so they are unit-tested without a database
 * or DOM. Copy is English (D-11); the frozen order snapshot in
 * `orders.package_data_snapshot` uses Indonesian and is owned by the database — do not
 * make the two match by editing either side.
 */

const MB_PER_GB = 1024;

/** `5120` → `5 GB`, `3000` → `3000 MB`, unlimited → `Unlimited`. */
export function formatDataAllowance(pkg: PackageShape): string {
  if (pkg.isUnlimited) {
    return 'Unlimited';
  }

  const dataMb = pkg.dataMb ?? 0;

  return dataMb % MB_PER_GB === 0
    ? `${dataMb / MB_PER_GB} GB`
    : `${dataMb} MB`;
}

/** `15` → `15 days`, `1` → `1 day`. */
export function formatValidity(validityDays: number): string {
  return validityDays === 1 ? '1 day' : `${validityDays} days`;
}

/** Three highlights for a package card (design-solution §6). */
export function packageHighlights(pkg: PackageShape): string[] {
  return [
    `${formatDataAllowance(pkg)} of data`,
    `Valid ${formatValidity(pkg.validityDays)}`,
    pkg.network ?? 'Local network',
  ];
}

/** Label/value rows for the package detail specification list. */
export function packageSpecs(pkg: PackageShape): Array<{ label: string; value: string }> {
  return [
    { label: 'Data', value: formatDataAllowance(pkg) },
    { label: 'Validity', value: formatValidity(pkg.validityDays) },
    { label: 'Network', value: pkg.network ?? 'Not specified' },
    { label: 'Mobile hotspot', value: pkg.hotspotAllowed ? 'Allowed' : 'Not allowed' },
  ];
}

export function packageCountOf(packages: PriceShape[]): number {
  return packages.length;
}

/** Cheapest active package, or `null` when the destination has none. */
export function fromPriceOf(packages: PriceShape[]): number | null {
  if (packages.length === 0) {
    return null;
  }

  return Math.min(...packages.map((entry) => entry.priceIdr));
}
