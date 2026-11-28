import { z } from 'zod';

import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Admin catalog reads (FR-A4, FR-A5, NFR3).
 *
 * Always the cookie-bound, authenticated client: RLS `is_admin()` is the enforcing layer,
 * never the service role. `adminGuard()` has already run in the caller. Columns are listed
 * explicitly and rows are parsed by a `strictObject` before they leave this module.
 */

export class AdminQueryError extends Error {
  constructor(operation: string, cause: string) {
    super(`Admin query failed: ${operation}`);
    this.name = 'AdminQueryError';
    this.cause = cause;
  }
}

export const DESTINATION_ADMIN_COLUMNS = [
  'id',
  'slug',
  'countryCode:country_code',
  'name',
  'region',
  'currencyCode:currency_code',
  'flagEmoji:flag_emoji',
  'summary',
  'description',
  'heroImageUrl:hero_image_url',
  'heroImageAttribution:hero_image_attribution',
  'isActive:is_active',
  'sortOrder:sort_order',
  'updatedAt:updated_at',
].join(',');

export const PACKAGE_ADMIN_COLUMNS = [
  'id',
  'destinationId:destination_id',
  'slug',
  'name',
  'dataMb:data_mb',
  'isUnlimited:is_unlimited',
  'validityDays:validity_days',
  'priceIdr:price_idr',
  'compareAtPriceIdr:compare_at_price_idr',
  'network',
  'hotspotAllowed:hotspot_allowed',
  'isActive:is_active',
  'updatedAt:updated_at',
  'destination:destinations!inner(slug,name)',
].join(',');

export const adminDestinationRowSchema = z.strictObject({
  id: z.uuid(),
  slug: z.string().min(1),
  countryCode: z.string().length(2),
  name: z.string().min(1),
  region: z.string().min(1),
  currencyCode: z.string().length(3),
  flagEmoji: z.string().nullable(),
  summary: z.string().min(1),
  description: z.string().nullable(),
  heroImageUrl: z.url(),
  heroImageAttribution: z.string().min(1),
  isActive: z.boolean(),
  sortOrder: z.int(),
  updatedAt: z.string().min(1),
});

export type AdminDestinationRow = z.infer<typeof adminDestinationRowSchema>;

export interface AdminDestinationListRow extends AdminDestinationRow {
  packageCount: number;
}

const destinationListRowSchema = adminDestinationRowSchema.extend({
  packages: z.array(z.strictObject({ id: z.uuid() })),
});

export const adminPackageRowSchema = z.strictObject({
  id: z.uuid(),
  destinationId: z.uuid(),
  slug: z.string().min(1),
  name: z.string().min(1),
  dataMb: z.int().nullable(),
  isUnlimited: z.boolean(),
  validityDays: z.int(),
  priceIdr: z.int(),
  compareAtPriceIdr: z.int().nullable(),
  network: z.string().nullable(),
  hotspotAllowed: z.boolean(),
  isActive: z.boolean(),
  updatedAt: z.string().min(1),
  destination: z.strictObject({ slug: z.string().min(1), name: z.string().min(1) }),
});

export type AdminPackageRow = z.infer<typeof adminPackageRowSchema>;

/** All destinations, active or not, with the package count shown in the list. */
export async function listDestinationsAdmin(): Promise<AdminDestinationListRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('destinations')
    .select(`${DESTINATION_ADMIN_COLUMNS},packages(id)`)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    throw new AdminQueryError('listDestinationsAdmin', error.message);
  }

  return (data ?? []).map((row) => {
    const parsed = destinationListRowSchema.parse(row);
    const { packages, ...destination } = parsed;

    return { ...destination, packageCount: packages.length };
  });
}

export async function getDestinationAdmin(id: string): Promise<AdminDestinationRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('destinations')
    .select(DESTINATION_ADMIN_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new AdminQueryError('getDestinationAdmin', error.message);
  }

  return data === null ? null : adminDestinationRowSchema.parse(data);
}

export interface PackageListOptions {
  destinationId?: string;
}

export async function listPackagesAdmin(
  options: PackageListOptions = {},
): Promise<AdminPackageRow[]> {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from('packages')
    .select(PACKAGE_ADMIN_COLUMNS)
    .order('name', { ascending: true });

  if (options.destinationId) {
    query = query.eq('destination_id', options.destinationId);
  }

  const { data, error } = await query;

  if (error) {
    throw new AdminQueryError('listPackagesAdmin', error.message);
  }

  return (data ?? []).map((row) => adminPackageRowSchema.parse(row));
}

export async function getPackageAdmin(id: string): Promise<AdminPackageRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('packages')
    .select(PACKAGE_ADMIN_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new AdminQueryError('getPackageAdmin', error.message);
  }

  return data === null ? null : adminPackageRowSchema.parse(data);
}
