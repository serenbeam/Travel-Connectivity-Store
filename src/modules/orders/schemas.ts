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
 * Customer-facing validation rules, shared verbatim by the checkout form and the API.
 *
 * Every constraint carries a human sentence: the 422 response reuses `issue.message`, so a
 * friendly message here is what the browser shows. Zod's raw text ("Too small: …",
 * "Invalid string: must match pattern …") must never reach a customer.
 */
const NAME_MESSAGE = 'Please enter your full name (2–100 characters).';
const NAME_CHARSET_MESSAGE =
  'Only letters, spaces, periods, apostrophes, and hyphens are allowed.';
const EMAIL_MESSAGE = 'Please enter a valid email address.';
const PHONE_REQUIRED_MESSAGE = 'Please enter your phone number.';
const PHONE_PREFIX_MESSAGE =
  'Please enter a valid international phone number starting with +.';
const PHONE_CHARSET_MESSAGE =
  'Phone number can only contain digits after the + sign (no spaces, hyphens, brackets, or letters).';
const PHONE_MIN_MESSAGE =
  'Phone number must contain at least 8 digits, including the country code.';
const PHONE_MAX_MESSAGE = 'Phone number cannot exceed 15 digits.';
const QUANTITY_TYPE_MESSAGE = 'Please enter a valid quantity.';
const QUANTITY_RANGE_MESSAGE = 'Quantity must be between 1 and 5.';

/**
 * Unicode letters and combining marks, plus the punctuation that appears in real names:
 * space, period, ASCII apostrophe, typographic apostrophe (U+2019), and hyphen-minus.
 */
const NAME_PATTERN = /^[\p{L}\p{M} .'\u2019-]+$/u;

const PHONE_MIN_DIGITS = 8;
const PHONE_MAX_DIGITS = 15;

export const customerNameSchema = z
  .string()
  .trim()
  .min(2, NAME_MESSAGE)
  .max(100, NAME_MESSAGE)
  .regex(NAME_PATTERN, NAME_CHARSET_MESSAGE);

/** Standard Zod email validation; only trimmed, lowercased, and given a friendly message. */
export const customerEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email(EMAIL_MESSAGE).max(254, EMAIL_MESSAGE));

/**
 * E.164-ish: a leading `+`, digits only, 8–15 digits including the country code.
 * Messages are ordered so the customer sees the single most relevant problem.
 */
export const customerPhoneSchema = z
  .string()
  .trim()
  .min(1, PHONE_REQUIRED_MESSAGE)
  .superRefine((value, ctx) => {
    if (!value.startsWith('+')) {
      ctx.addIssue({ code: 'custom', message: PHONE_PREFIX_MESSAGE });
      return;
    }

    if (!/^\+[0-9]+$/.test(value)) {
      ctx.addIssue({ code: 'custom', message: PHONE_CHARSET_MESSAGE });
      return;
    }

    const digits = value.length - 1;

    if (digits < PHONE_MIN_DIGITS) {
      ctx.addIssue({ code: 'custom', message: PHONE_MIN_MESSAGE });
      return;
    }

    if (digits > PHONE_MAX_DIGITS) {
      ctx.addIssue({ code: 'custom', message: PHONE_MAX_MESSAGE });
    }
  });

/** Integer 1..5 — the business limit enforced by `orders_quantity_chk` as well. */
export const quantitySchema = z
  .int(QUANTITY_TYPE_MESSAGE)
  .min(1, QUANTITY_RANGE_MESSAGE)
  .max(5, QUANTITY_RANGE_MESSAGE);

/**
 * `POST /api/checkout` body.
 *
 * `destinationSlug` is REQUIRED (E-5 D-2): the storefront CTA carries both slugs, and
 * `(destination_id, slug)` is the unique key, so the pair resolves to exactly one package.
 */
export const checkoutRequestSchema = z.strictObject({
  destinationSlug: slugSchema,
  packageSlug: slugSchema,
  quantity: quantitySchema,
  customerName: customerNameSchema,
  customerEmail: customerEmailSchema,
  customerPhone: customerPhoneSchema,
});

/**
 * Collapses a Zod error into `field -> first friendly message`.
 * Used by the checkout form so it renders exactly what the API would return.
 */
export function checkoutFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const issue of error.issues) {
    const field = issue.path.join('.');

    if (field !== '' && fields[field] === undefined) {
      fields[field] = issue.message;
    }
  }

  return fields;
}

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
