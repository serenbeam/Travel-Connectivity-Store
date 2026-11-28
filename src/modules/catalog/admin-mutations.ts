import { createSupabaseServerClient } from '@/lib/supabase/server';

import {
  AdminQueryError,
  DESTINATION_ADMIN_COLUMNS,
  PACKAGE_ADMIN_COLUMNS,
  adminDestinationRowSchema,
  adminPackageRowSchema,
  getPackageAdmin,
  type AdminDestinationRow,
  type AdminPackageRow,
} from './admin-queries';
import {
  validatePackageShape,
  type DestinationInput,
  type DestinationPatch,
  type FieldIssue,
  type PackageInput,
  type PackagePatch,
} from './admin-schemas';

/**
 * Admin catalog writes (FR-A4, FR-A5).
 *
 * The authenticated (RLS `is_admin()`) client is the writer — the service role never writes
 * catalog rows (database-design §4). These are single-row statements: the "one Postgres
 * function per multi-row transaction" rule is not in play, because a catalog edit touches
 * exactly one row and no invariant spans rows.
 *
 * PostgREST error codes are mapped by OPERATION, not by parsing database messages:
 * `23505` duplicate value, `23503` foreign-key violation. No SQL text ever leaves this
 * module — the caller receives a closed union.
 */
export type AdminMutationFailure =
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'duplicate' }
  | { ok: false; kind: 'destination_in_use' }
  | { ok: false; kind: 'package_in_use' }
  | { ok: false; kind: 'destination_missing' }
  | { ok: false; kind: 'invalid'; issues: FieldIssue[] };

export type AdminMutationResult<T> = { ok: true; row: T } | AdminMutationFailure;

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

function destinationPayload(input: DestinationPatch): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (input.slug !== undefined) payload.slug = input.slug;
  if (input.countryCode !== undefined) payload.country_code = input.countryCode;
  if (input.name !== undefined) payload.name = input.name;
  if (input.region !== undefined) payload.region = input.region;
  if (input.currencyCode !== undefined) payload.currency_code = input.currencyCode;
  if (input.flagEmoji !== undefined) payload.flag_emoji = input.flagEmoji;
  if (input.summary !== undefined) payload.summary = input.summary;
  if (input.description !== undefined) payload.description = input.description;
  if (input.heroImageUrl !== undefined) payload.hero_image_url = input.heroImageUrl;
  if (input.heroImageAttribution !== undefined) {
    payload.hero_image_attribution = input.heroImageAttribution;
  }
  if (input.isActive !== undefined) payload.is_active = input.isActive;
  if (input.sortOrder !== undefined) payload.sort_order = input.sortOrder;

  return payload;
}

function packagePayload(input: PackagePatch): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (input.destinationId !== undefined) payload.destination_id = input.destinationId;
  if (input.slug !== undefined) payload.slug = input.slug;
  if (input.name !== undefined) payload.name = input.name;
  if (input.dataMb !== undefined) payload.data_mb = input.dataMb;
  if (input.isUnlimited !== undefined) payload.is_unlimited = input.isUnlimited;
  if (input.validityDays !== undefined) payload.validity_days = input.validityDays;
  if (input.priceIdr !== undefined) payload.price_idr = input.priceIdr;
  if (input.compareAtPriceIdr !== undefined) {
    payload.compare_at_price_idr = input.compareAtPriceIdr;
  }
  if (input.network !== undefined) payload.network = input.network;
  if (input.hotspotAllowed !== undefined) payload.hotspot_allowed = input.hotspotAllowed;
  if (input.isActive !== undefined) payload.is_active = input.isActive;

  return payload;
}

export async function createDestination(
  input: DestinationInput,
): Promise<AdminMutationResult<AdminDestinationRow>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('destinations')
    .insert(destinationPayload(input))
    .select(DESTINATION_ADMIN_COLUMNS)
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, kind: 'duplicate' };
    }

    throw new AdminQueryError('createDestination', error.message);
  }

  return { ok: true, row: adminDestinationRowSchema.parse(data) };
}

export async function updateDestination(
  id: string,
  patch: DestinationPatch,
): Promise<AdminMutationResult<AdminDestinationRow>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('destinations')
    .update(destinationPayload(patch))
    .eq('id', id)
    .select(DESTINATION_ADMIN_COLUMNS)
    .maybeSingle();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, kind: 'duplicate' };
    }

    throw new AdminQueryError('updateDestination', error.message);
  }

  if (data === null) {
    return { ok: false, kind: 'not_found' };
  }

  return { ok: true, row: adminDestinationRowSchema.parse(data) };
}

export async function deleteDestination(
  id: string,
): Promise<{ ok: true } | AdminMutationFailure> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('destinations')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) {
    // ON DELETE RESTRICT on packages.destination_id (AC-A6).
    if (error.code === FOREIGN_KEY_VIOLATION) {
      return { ok: false, kind: 'destination_in_use' };
    }

    throw new AdminQueryError('deleteDestination', error.message);
  }

  if ((data ?? []).length === 0) {
    return { ok: false, kind: 'not_found' };
  }

  return { ok: true };
}

export async function createPackage(
  input: PackageInput,
): Promise<AdminMutationResult<AdminPackageRow>> {
  const shapeIssues = validatePackageShape(input);

  if (shapeIssues.length > 0) {
    return { ok: false, kind: 'invalid', issues: shapeIssues };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('packages')
    .insert(packagePayload(input))
    .select(PACKAGE_ADMIN_COLUMNS)
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, kind: 'duplicate' };
    }

    if (error.code === FOREIGN_KEY_VIOLATION) {
      return { ok: false, kind: 'destination_missing' };
    }

    throw new AdminQueryError('createPackage', error.message);
  }

  return { ok: true, row: adminPackageRowSchema.parse(data) };
}

export async function updatePackage(
  id: string,
  patch: PackagePatch,
): Promise<AdminMutationResult<AdminPackageRow>> {
  const existing = await getPackageAdmin(id);

  if (existing === null) {
    return { ok: false, kind: 'not_found' };
  }

  // A partial body can produce an invalid combination with the stored values, so the
  // cross-column CHECKs are evaluated against the merged row before the UPDATE.
  const merged = {
    dataMb: patch.dataMb === undefined ? existing.dataMb : patch.dataMb,
    isUnlimited: patch.isUnlimited === undefined ? existing.isUnlimited : patch.isUnlimited,
    validityDays:
      patch.validityDays === undefined ? existing.validityDays : patch.validityDays,
    priceIdr: patch.priceIdr === undefined ? existing.priceIdr : patch.priceIdr,
    compareAtPriceIdr:
      patch.compareAtPriceIdr === undefined
        ? existing.compareAtPriceIdr
        : patch.compareAtPriceIdr,
  };
  const shapeIssues = validatePackageShape(merged);

  if (shapeIssues.length > 0) {
    return { ok: false, kind: 'invalid', issues: shapeIssues };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('packages')
    .update(packagePayload(patch))
    .eq('id', id)
    .select(PACKAGE_ADMIN_COLUMNS)
    .maybeSingle();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, kind: 'duplicate' };
    }

    if (error.code === FOREIGN_KEY_VIOLATION) {
      return { ok: false, kind: 'destination_missing' };
    }

    throw new AdminQueryError('updatePackage', error.message);
  }

  if (data === null) {
    return { ok: false, kind: 'not_found' };
  }

  return { ok: true, row: adminPackageRowSchema.parse(data) };
}

export async function deletePackage(
  id: string,
): Promise<{ ok: true } | AdminMutationFailure> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('packages').delete().eq('id', id).select('id');

  if (error) {
    // Orders keep their package_id with ON DELETE RESTRICT (FR-A5).
    if (error.code === FOREIGN_KEY_VIOLATION) {
      return { ok: false, kind: 'package_in_use' };
    }

    throw new AdminQueryError('deletePackage', error.message);
  }

  if ((data ?? []).length === 0) {
    return { ok: false, kind: 'not_found' };
  }

  return { ok: true };
}
