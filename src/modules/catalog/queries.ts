import { createSupabaseServerClient } from '@/lib/supabase/server';

import { fromPriceOf, packageCountOf } from './derive';
import {
  destinationCardRowSchema,
  destinationDetailRowSchema,
  packageDetailRowSchema,
  regionRowSchema,
} from './schemas';
import type {
  DestinationCardDto,
  DestinationDetailDto,
  PackageDetailDto,
} from './types';

/**
 * Public catalog reads (architecture.md §5.1).
 *
 * The client is the cookie-bound, anon-key Supabase client: RLS is the enforcing layer
 * (`dest_public_read` / `pkg_public_read` = `is_active`), verified in E-3. No service
 * role, no writes, no RPC. Columns are always explicit; rows are validated by Zod before
 * they leave this module.
 *
 * `is_active` is also filtered explicitly as defence in depth, so a future policy change
 * cannot silently publish archived rows.
 */

const DESTINATION_FIELDS = [
  'slug',
  'name',
  'countryCode:country_code',
  'region',
  'currencyCode:currency_code',
  'flagEmoji:flag_emoji',
  'summary',
  'description',
  'heroImageUrl:hero_image_url',
  'heroImageAttribution:hero_image_attribution',
].join(',');

const PACKAGE_FIELDS = [
  'slug',
  'name',
  'dataMb:data_mb',
  'isUnlimited:is_unlimited',
  'validityDays:validity_days',
  'priceIdr:price_idr',
  'compareAtPriceIdr:compare_at_price_idr',
  'network',
  'hotspotAllowed:hotspot_allowed',
].join(',');

/** Thrown when PostgREST reports an error; the error boundary renders a generic message. */
export class CatalogQueryError extends Error {
  constructor(operation: string, cause: string) {
    super(`Catalog query failed: ${operation}`);
    this.name = 'CatalogQueryError';
    this.cause = cause;
  }
}

export interface DestinationListOptions {
  /** Exact `destinations.region` value coming from the URL (D-08). */
  region?: string;
  limit?: number;
}

/** Destinations plus the two derived facts the cards need (count and cheapest price). */
export async function getDestinationsWithAggregates(
  options: DestinationListOptions = {},
): Promise<DestinationCardDto[]> {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from('destinations')
    .select(`${DESTINATION_FIELDS},packages(priceIdr:price_idr)`)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (options.region) {
    query = query.eq('region', options.region);
  }

  if (options.limit !== undefined) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new CatalogQueryError('getDestinationsWithAggregates', error.message);
  }

  return (data ?? []).map((row) => {
    const parsed = destinationCardRowSchema.parse(row);

    return {
      ...stripPackages(parsed),
      packageCount: packageCountOf(parsed.packages),
      fromPriceIdr: fromPriceOf(parsed.packages),
    };
  });
}

/** Region values present among active destinations, sorted for the filter chips. */
export async function getRegions(): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('destinations')
    .select('region')
    .eq('is_active', true);

  if (error) {
    throw new CatalogQueryError('getRegions', error.message);
  }

  const regions = new Set((data ?? []).map((row) => regionRowSchema.parse(row).region));

  return [...regions].sort((a, b) => a.localeCompare(b));
}

/** One active destination with its active packages, or `null` (the page returns 404). */
export async function getDestinationWithPackages(
  destinationSlug: string,
): Promise<DestinationDetailDto | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('destinations')
    .select(`${DESTINATION_FIELDS},packages(${PACKAGE_FIELDS})`)
    .eq('slug', destinationSlug)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    throw new CatalogQueryError('getDestinationWithPackages', error.message);
  }

  if (!data) {
    return null;
  }

  const parsed = destinationDetailRowSchema.parse(data);

  return {
    ...stripPackages(parsed),
    packageCount: packageCountOf(parsed.packages),
    fromPriceIdr: fromPriceOf(parsed.packages),
    packages: [...parsed.packages].sort((a, b) => a.priceIdr - b.priceIdr),
  };
}

/**
 * D-01: a package is addressed by BOTH slugs. `(destination_id, slug)` is UNIQUE in the
 * database, so this lookup returns at most one row — a package that belongs to another
 * destination resolves to `null` (404) instead of being shown under the wrong parent.
 */
export async function getPackageByRoute(
  destinationSlug: string,
  packageSlug: string,
): Promise<PackageDetailDto | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('packages')
    .select(`${PACKAGE_FIELDS},destinations!inner(slug,name,region,flagEmoji:flag_emoji)`)
    .eq('slug', packageSlug)
    .eq('destinations.slug', destinationSlug)
    .maybeSingle();

  if (error) {
    throw new CatalogQueryError('getPackageByRoute', error.message);
  }

  if (!data) {
    return null;
  }

  const parsed = packageDetailRowSchema.parse(data);
  const { destinations, ...pkg } = parsed;

  return { ...pkg, destination: destinations };
}

function stripPackages<T extends { packages: unknown }>(row: T): Omit<T, 'packages'> {
  // The embedded array is transport-only: cards receive derived aggregates instead.
  const copy: Record<string, unknown> = { ...row };
  delete copy.packages;

  return copy as Omit<T, 'packages'>;
}
