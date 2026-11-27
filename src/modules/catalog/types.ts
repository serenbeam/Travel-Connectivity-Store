import type { z } from 'zod';

import type {
  destinationCardDtoSchema,
  destinationCardRowSchema,
  destinationDetailDtoSchema,
  destinationDetailRowSchema,
  packageDetailDtoSchema,
  packageDetailRowSchema,
  packageDtoSchema,
} from './schemas';

/** Public shapes rendered by the storefront. No internal identifiers. */
export type PackageDto = z.infer<typeof packageDtoSchema>;
export type DestinationCardDto = z.infer<typeof destinationCardDtoSchema>;
export type DestinationDetailDto = z.infer<typeof destinationDetailDtoSchema>;
export type PackageDetailDto = z.infer<typeof packageDetailDtoSchema>;

/** Transport shapes (what PostgREST returns before derivation). */
export type DestinationCardRow = z.infer<typeof destinationCardRowSchema>;
export type DestinationDetailRow = z.infer<typeof destinationDetailRowSchema>;
export type PackageDetailRow = z.infer<typeof packageDetailRowSchema>;

export type PackageShape = Pick<
  PackageDto,
  'dataMb' | 'isUnlimited' | 'validityDays' | 'network' | 'hotspotAllowed' | 'priceIdr'
>;

export type PriceShape = Pick<PackageDto, 'priceIdr'>;
