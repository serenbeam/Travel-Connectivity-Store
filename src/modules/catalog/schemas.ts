import { z } from 'zod';

/**
 * Catalog DTOs — the only shape that reaches a component.
 *
 * Every schema is a `strictObject`: PostgREST rows are validated at the boundary, and an
 * unexpected column fails loudly instead of silently travelling to the browser. Internal
 * columns (`id`, `destination_id`, `is_active`, timestamps) are never selected, so they
 * can never be present here (docs/database-design.md §4, AGENTS.md).
 */

/** Same pattern as the database CHECK on `destinations.slug` / `packages.slug`. */
export const slugSchema = z.string().regex(/^[a-z0-9-]+$/);

/** Region values are admin-authored in the database; validate the shape, not a fixed list. */
export const regionFilterSchema = z.string().regex(/^[A-Za-z ]{2,40}$/);

export const packageDtoSchema = z.strictObject({
  slug: slugSchema,
  name: z.string().min(1),
  dataMb: z.int().positive().nullable(),
  isUnlimited: z.boolean(),
  validityDays: z.int().min(1).max(90),
  priceIdr: z.int().min(1),
  compareAtPriceIdr: z.int().min(1).nullable(),
  network: z.string().nullable(),
  hotspotAllowed: z.boolean(),
});

export const destinationCardDtoSchema = z.strictObject({
  slug: slugSchema,
  name: z.string().min(1),
  countryCode: z.string().length(2),
  region: z.string().min(1),
  currencyCode: z.string().length(3),
  flagEmoji: z.string().nullable(),
  summary: z.string().min(1).max(160),
  description: z.string().nullable(),
  heroImageUrl: z.url(),
  heroImageAttribution: z.string().min(1),
  packageCount: z.int().min(0),
  fromPriceIdr: z.int().min(1).nullable(),
});

export const destinationDetailDtoSchema = destinationCardDtoSchema.extend({
  packages: z.array(packageDtoSchema),
});

export const packageDetailDtoSchema = packageDtoSchema.extend({
  destination: z.strictObject({
    slug: slugSchema,
    name: z.string().min(1),
    region: z.string().min(1),
    flagEmoji: z.string().nullable(),
  }),
});

/**
 * Raw PostgREST row shapes. Kept separate from the DTOs because embedded resources
 * (`packages`, `destinations`) exist only in the transport shape.
 */
export const destinationCardRowSchema = destinationCardDtoSchema
  .omit({ packageCount: true, fromPriceIdr: true })
  .extend({ packages: z.array(z.strictObject({ priceIdr: z.int().min(1) })) });

export const destinationDetailRowSchema = destinationCardDtoSchema
  .omit({ packageCount: true, fromPriceIdr: true })
  .extend({ packages: z.array(packageDtoSchema) });

export const packageDetailRowSchema = packageDtoSchema.extend({
  destinations: z.strictObject({
    slug: slugSchema,
    name: z.string().min(1),
    region: z.string().min(1),
    flagEmoji: z.string().nullable(),
  }),
});

export const regionRowSchema = z.strictObject({ region: z.string().min(1) });
