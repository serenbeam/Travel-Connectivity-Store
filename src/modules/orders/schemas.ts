import { z } from 'zod';

import { slugSchema } from '@/modules/catalog/schemas';

/**
 * Checkout / order / payment boundary schemas.
 *
 * Everything is a `strictObject`, so a browser that posts `price`, `totalIdr`, or
 * `status` is rejected with 422 instead of being silently ignored (AC-C2, ADR-3).
 * The database CHECKs are mirrored here so validation fails before a transaction starts.
 */

/** `Idempotency-Key` header: 32 random bytes base64url, or a compatible client value. */
export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{22,64}$/);

/**
 * `POST /api/checkout` body.
 *
 * `destinationSlug` is REQUIRED (E-5 D-2): the storefront CTA carries both slugs, and
 * `(destination_id, slug)` is the unique key, so the pair resolves to exactly one package.
 */
export const checkoutRequestSchema = z.strictObject({
  destinationSlug: slugSchema,
  packageSlug: slugSchema,
  quantity: z.int().min(1).max(5),
  customerName: z.string().trim().min(1).max(120),
  customerEmail: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  customerPhone: z.string().trim().regex(/^\+[1-9][0-9]{6,14}$/),
});

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

/** 201/200 body (api-contract §4.3). */
export const checkoutResponseDtoSchema = z.strictObject({
  orderNumber: z.string().regex(/^RML-[A-Z0-9]{6}$/),
  paymentRef: z.string().min(8).max(64),
  totalIdr: z.int().min(1),
  orderStatus: z.enum(['pending', 'paid', 'failed']),
  paymentStatus: z.enum(['pending', 'succeeded', 'failed']),
  capabilityUrl: z.url(),
  paymentUrl: z.url(),
});

export type CheckoutResponseDto = z.infer<typeof checkoutResponseDtoSchema>;

export const orderStatusSchema = z.enum(['pending', 'paid', 'failed']);
export const paymentStatusSchema = z.enum(['pending', 'succeeded', 'failed']);
export const notificationStatusSchema = z.enum(['pending', 'processing', 'sent', 'failed']);

/** `POST /api/payments/verify` body — only a reference and the capability token. */
export const verifyRequestSchema = z.strictObject({
  ref: z.string().min(8).max(64),
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

export const verifyResponseDtoSchema = z.strictObject({
  orderStatus: orderStatusSchema,
  paymentStatus: paymentStatusSchema,
  paidAt: z.iso.datetime({ offset: true }).nullable(),
});

/** Simulation outcome accepted by the mock gateway; `pending` is a legitimate choice. */
export const mockOutcomeSchema = z.enum(['succeeded', 'failed', 'pending']);

export const mockSettleRequestSchema = z.strictObject({
  outcome: mockOutcomeSchema,
});

/**
 * Order status DTO returned by `GET /api/orders/[token]` and rendered on `/orders/[token]`.
 * Email is masked; no hash, no internal UUID, no idempotency key (api-contract §4.4).
 */
export const orderStatusDtoSchema = z.strictObject({
  orderNumber: z.string().regex(/^RML-[A-Z0-9]{6}$/),
  createdAt: z.iso.datetime({ offset: true }),
  orderStatus: orderStatusSchema,
  paymentStatus: paymentStatusSchema.nullable(),
  destinationName: z.string().min(1),
  packageName: z.string().min(1),
  packageDataSnapshot: z.string().min(1),
  quantity: z.int().min(1).max(5),
  unitPriceIdr: z.int().min(1),
  totalIdr: z.int().min(1),
  customerName: z.string().min(1),
  customerEmail: z.string().min(3),
  paidAt: z.iso.datetime({ offset: true }).nullable(),
  notificationStatus: notificationStatusSchema.nullable(),
});

export type OrderStatusDto = z.infer<typeof orderStatusDtoSchema>;

/**
 * Transport shape read with the service client. Columns are listed explicitly in the
 * query; this schema then guarantees no extra column can slip into the response.
 */
export const orderStatusRowSchema = z.strictObject({
  order_number: z.string(),
  created_at: z.string(),
  status: orderStatusSchema,
  destination_name_snapshot: z.string(),
  package_name_snapshot: z.string(),
  package_data_snapshot: z.string(),
  quantity: z.int(),
  unit_price_idr: z.int(),
  total_idr: z.int(),
  customer_name: z.string(),
  customer_email: z.string(),
  paid_at: z.string().nullable(),
  payments: z
    .strictObject({
      status: paymentStatusSchema.nullable(),
      paid_at: z.string().nullable(),
      provider_reference: z.string(),
    })
    .nullable(),
  notification_outbox: z.strictObject({ status: notificationStatusSchema }).nullable(),
});
