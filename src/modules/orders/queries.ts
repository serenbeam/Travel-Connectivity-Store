import { z } from 'zod';

import { createAdminClient } from '@/lib/supabase/admin';

import {
  type OrderStatusDto,
  orderStatusDtoSchema,
  orderStatusRowSchema,
} from './schemas';
import { hashCapabilityToken } from './token';

/**
 * Guest order reads (api-contract §4.4).
 *
 * `orders`/`payments` have no anon or authenticated grant, so this necessarily runs with
 * the service client. That is exactly why every query lists columns explicitly and parses
 * the result through a `strictObject` DTO: a bare row would leak `access_token_hash`,
 * unmasked PII, and internal UUIDs.
 */

/** `budi@example.com` -> `b***@example.com`. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');

  if (domain === '') {
    return '***';
  }

  const visible = local.slice(0, 1);

  return `${visible}***@${domain}`;
}

/** Resolves an order by capability token, or `null` for any miss (uniform 404). */
export interface OrderLookup {
  order: OrderStatusDto;
  /** Needed by the order page to link back into the simulated gateway; never returned by the API. */
  paymentRef: string | null;
}

export async function getOrderStatusByToken(token: string): Promise<OrderLookup | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('orders')
    .select(
      [
        'order_number',
        'created_at',
        'status',
        'destination_name_snapshot',
        'package_name_snapshot',
        'package_data_snapshot',
        'quantity',
        'unit_price_idr',
        'total_idr',
        'customer_name',
        'customer_email',
        'paid_at',
        'payments(status,paid_at,provider_reference)',
        'notification_outbox(status)',
      ].join(','),
    )
    .eq('access_token_hash', hashCapabilityToken(token))
    .maybeSingle();

  if (error) {
    throw new Error(`order lookup failed: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const row = orderStatusRowSchema.parse(data);

  const order = orderStatusDtoSchema.parse({
    orderNumber: row.order_number,
    createdAt: row.created_at,
    orderStatus: row.status,
    paymentStatus: row.payments?.status ?? null,
    destinationName: row.destination_name_snapshot,
    packageName: row.package_name_snapshot,
    packageDataSnapshot: row.package_data_snapshot,
    quantity: row.quantity,
    unitPriceIdr: row.unit_price_idr,
    totalIdr: row.total_idr,
    customerName: row.customer_name,
    customerEmail: maskEmail(row.customer_email),
    paidAt: row.paid_at,
    notificationStatus: row.notification_outbox?.status ?? null,
  });

  return { order, paymentRef: row.payments?.provider_reference ?? null };
}

export interface PaymentContext {
  orderStatus: 'pending' | 'paid' | 'failed';
  paymentStatus: 'pending' | 'succeeded' | 'failed';
  paidAt: string | null;
}

/**
 * Resolves the payment referenced by `ref` **only if it belongs to the order identified by
 * the capability token** (E-5 G-4). A token for order A can never settle order B.
 */
export async function getPaymentContext(
  token: string,
  providerReference: string,
): Promise<PaymentContext | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('orders')
    .select('status,paid_at,payments!inner(status,paid_at,provider_reference)')
    .eq('access_token_hash', hashCapabilityToken(token))
    .eq('payments.provider_reference', providerReference)
    .maybeSingle();

  if (error) {
    throw new Error(`payment lookup failed: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const parsed = orderStatusRowPaymentSchema.parse(data);

  return {
    orderStatus: parsed.status,
    paymentStatus: parsed.payments.status,
    paidAt: parsed.payments.paid_at ?? parsed.paid_at,
  };
}

const orderStatusRowPaymentSchema = z.strictObject({
  status: z.enum(['pending', 'paid', 'failed']),
  paid_at: z.string().nullable(),
  payments: z.strictObject({
    status: z.enum(['pending', 'succeeded', 'failed']),
    paid_at: z.string().nullable(),
    provider_reference: z.string(),
  }),
});
