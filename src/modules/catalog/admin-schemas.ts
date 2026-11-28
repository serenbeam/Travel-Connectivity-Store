import { z } from 'zod';

import { slugSchema } from './schemas';

/**
 * Admin catalog boundary schemas (FR-A4, FR-A5).
 *
 * Every object is a `strictObject`, so `id`, `created_at`, `packageCount`, or any other
 * unexpected key is rejected with 422 instead of being silently written (mass-assignment
 * guard, AGENTS.md). The database CHECKs are mirrored here so a bad form fails before the
 * request reaches PostgREST.
 */

const NAME_MESSAGE = 'Enter a name (1–120 characters).';
const REGION_MESSAGE = 'Enter a region (letters and spaces, 2–40 characters).';
const COUNTRY_MESSAGE = 'Enter a 2-letter ISO country code in uppercase.';
const CURRENCY_MESSAGE = 'Enter a 3-letter currency code in uppercase (e.g. IDR).';
const SUMMARY_MESSAGE = 'Enter a summary of 1–160 characters.';
const HERO_URL_MESSAGE = 'Enter an https:// image URL.';
const ATTRIBUTION_MESSAGE = 'Enter the photo attribution (required for CC BY / CC BY-SA).';

const countryCodeSchema = z.string().regex(/^[A-Z]{2}$/, COUNTRY_MESSAGE);
const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/, CURRENCY_MESSAGE);
const regionSchema = z.string().trim().regex(/^[A-Za-z ]{2,40}$/, REGION_MESSAGE);
const heroImageUrlSchema = z
  .url()
  .refine((value) => value.startsWith('https://'), HERO_URL_MESSAGE);

const destinationFields = {
  slug: slugSchema,
  countryCode: countryCodeSchema,
  name: z.string().trim().min(1, NAME_MESSAGE).max(120, NAME_MESSAGE),
  region: regionSchema,
  currencyCode: currencyCodeSchema,
  flagEmoji: z.string().trim().min(1).max(16).nullable(),
  summary: z.string().trim().min(1, SUMMARY_MESSAGE).max(160, SUMMARY_MESSAGE),
  description: z.string().trim().max(2000).nullable(),
  heroImageUrl: heroImageUrlSchema,
  heroImageAttribution: z.string().trim().min(1, ATTRIBUTION_MESSAGE).max(200),
  isActive: z.boolean(),
  sortOrder: z.int().min(-32768).max(32767),
};

export const destinationInputSchema = z.strictObject(destinationFields);

/** PATCH body: every field optional, but at least one must be present. */
export const destinationPatchSchema = z
  .strictObject({
    slug: destinationFields.slug.optional(),
    countryCode: destinationFields.countryCode.optional(),
    name: destinationFields.name.optional(),
    region: destinationFields.region.optional(),
    currencyCode: destinationFields.currencyCode.optional(),
    flagEmoji: destinationFields.flagEmoji.optional(),
    summary: destinationFields.summary.optional(),
    description: destinationFields.description.optional(),
    heroImageUrl: destinationFields.heroImageUrl.optional(),
    heroImageAttribution: destinationFields.heroImageAttribution.optional(),
    isActive: destinationFields.isActive.optional(),
    sortOrder: destinationFields.sortOrder.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required.',
  });

const packageFields = {
  destinationId: z.uuid(),
  slug: slugSchema,
  name: z.string().trim().min(1, NAME_MESSAGE).max(120, NAME_MESSAGE),
  dataMb: z.int().positive().max(1_000_000).nullable(),
  isUnlimited: z.boolean(),
  validityDays: z.int().min(1).max(90),
  priceIdr: z.int().min(1).max(100_000_000),
  compareAtPriceIdr: z.int().min(1).max(100_000_000).nullable(),
  network: z.string().trim().max(60).nullable(),
  hotspotAllowed: z.boolean(),
  isActive: z.boolean(),
};

export const packageInputSchema = z.strictObject(packageFields);

export const packagePatchSchema = z
  .strictObject({
    destinationId: packageFields.destinationId.optional(),
    slug: packageFields.slug.optional(),
    name: packageFields.name.optional(),
    dataMb: packageFields.dataMb.optional(),
    isUnlimited: packageFields.isUnlimited.optional(),
    validityDays: packageFields.validityDays.optional(),
    priceIdr: packageFields.priceIdr.optional(),
    compareAtPriceIdr: packageFields.compareAtPriceIdr.optional(),
    network: packageFields.network.optional(),
    hotspotAllowed: packageFields.hotspotAllowed.optional(),
    isActive: packageFields.isActive.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required.',
  });

export type DestinationInput = z.infer<typeof destinationInputSchema>;
export type DestinationPatch = z.infer<typeof destinationPatchSchema>;
export type PackageInput = z.infer<typeof packageInputSchema>;
export type PackagePatch = z.infer<typeof packagePatchSchema>;

/** The cross-column shape the database enforces. */
export interface PackageShape {
  dataMb: number | null;
  isUnlimited: boolean;
  validityDays: number;
  priceIdr: number;
  compareAtPriceIdr: number | null;
}

export interface FieldIssue {
  field: string;
  message: string;
}

/**
 * Mirrors the two `packages` CHECK constraints that span columns:
 * `(is_unlimited AND data_mb IS NULL) OR (NOT is_unlimited AND data_mb > 0)` and
 * `compare_at_price_idr IS NULL OR compare_at_price_idr > price_idr`.
 *
 * Applied to the **merged** row on PATCH as well, because a partial body can create an
 * invalid combination with values that are already stored.
 */
export function validatePackageShape(shape: PackageShape): FieldIssue[] {
  const issues: FieldIssue[] = [];

  if (shape.isUnlimited && shape.dataMb !== null) {
    issues.push({
      field: 'dataMb',
      message: 'Leave the data volume empty for an unlimited package.',
    });
  }

  if (!shape.isUnlimited && shape.dataMb === null) {
    issues.push({
      field: 'dataMb',
      message: 'Enter the data volume for a metered package.',
    });
  }

  if (shape.compareAtPriceIdr !== null && shape.compareAtPriceIdr <= shape.priceIdr) {
    issues.push({
      field: 'compareAtPriceIdr',
      message: 'The compare-at price must be higher than the real price.',
    });
  }

  return issues;
}
