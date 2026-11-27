'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/components/ui/cn';
import {
  forgetCheckoutKey,
  getOrCreateCheckoutKey,
  type CheckoutKeyStorage,
} from '@/modules/orders/checkout-key';
import {
  checkoutFieldErrors,
  checkoutRequestSchema,
} from '@/modules/orders/schemas';

/**
 * Guest checkout form (api-contract §4.3).
 *
 * Validation: the very same `checkoutRequestSchema` the API runs, so the browser and the
 * server can never disagree — the server stays authoritative, the client just avoids a
 * round trip. Messages come from the schema and are customer sentences, never raw Zod text.
 *
 * The `Idempotency-Key` identifies one checkout attempt: it is created on the first submit
 * of a package, kept for retries (so a timeout replays the same order), released on a
 * definitive 409 (so the next Pay starts a new attempt), and released once a successful
 * order's navigation has actually completed. It is treated as a secret: never in the URL,
 * never logged.
 */

interface CheckoutFormProps {
  destinationSlug: string;
  packageSlug: string;
  unitPriceIdr: number;
}

const PHONE_MAX_DIGITS = 15;
const FALLBACK_FIELD_MESSAGE = 'Please check this field and try again.';
const SESSION_ENDED_MESSAGE =
  'Your previous checkout attempt has ended. Please press Pay again to start a new order.';

/** Browser storage, or null during server rendering / when the browser blocks it. */
function browserStorage(): CheckoutKeyStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

const inputClass =
  'w-full rounded-sm border border-sand bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted/70';

const fieldNames = ['customerName', 'customerEmail', 'customerPhone', 'quantity'] as const;
type FieldName = (typeof fieldNames)[number];

export function CheckoutForm({ destinationSlug, packageSlug, unitPriceIdr }: CheckoutFormProps) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [phoneDigits, setPhoneDigits] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});

  /**
   * Set once the server confirmed an order. The key is deliberately NOT cleared at that
   * moment: if the client navigation is interrupted, retrying with the same payload must
   * return this same order instead of creating a second one. The key is dropped when the
   * checkout screen actually unmounts, i.e. when the transition completed.
   */
  const orderCreatedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (orderCreatedRef.current) {
        forgetCheckoutKey(browserStorage(), destinationSlug, packageSlug);
      }
    };
  }, [destinationSlug, packageSlug]);

  function clearFieldError(field: FieldName) {
    setFieldErrors((current) => {
      if (current[field] === undefined) {
        return current;
      }

      const next = { ...current };
      delete next[field];

      return next;
    });
  }

  function showFieldErrors(messages: Record<string, string>) {
    const next: Partial<Record<FieldName, string>> = {};

    for (const field of fieldNames) {
      const message = messages[field];

      if (message !== undefined) {
        next[field] = message;
      }
    }

    setFieldErrors(next);

    return Object.keys(next).length > 0;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);

    const candidate = {
      destinationSlug,
      packageSlug,
      quantity,
      customerName: String(form.get('customerName') ?? ''),
      customerEmail: String(form.get('customerEmail') ?? ''),
      // The visible "+" is never editable, so only the digits travel from the input.
      customerPhone: `+${phoneDigits}`,
    };

    // First pass: the shared schema, exactly as the API will run it.
    const parsed = checkoutRequestSchema.safeParse(candidate);

    if (!parsed.success) {
      showFieldErrors(checkoutFieldErrors(parsed.error));
      setError('Please check the highlighted fields.');
      setSubmitting(false);

      return;
    }

    const key = getOrCreateCheckoutKey(browserStorage(), destinationSlug, packageSlug);

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': key,
        },
        body: JSON.stringify(parsed.data),
        cache: 'no-store',
      });

      const payload = (await response.json().catch(() => null)) as
        | { paymentUrl?: string; error?: { code?: string; details?: unknown } }
        | null;

      if (response.ok && typeof payload?.paymentUrl === 'string') {
        // Keep the key until this screen actually unmounts.
        orderCreatedRef.current = true;
        router.push(payload.paymentUrl);

        return;
      }

      const code = payload?.error?.code;

      if (code === 'VALIDATION_ERROR' && Array.isArray(payload?.error?.details)) {
        // Fallback path: the server rejected something the client let through (for example
        // after a rule change). Messages are still the schema's friendly sentences.
        const messages: Record<string, string> = {};

        for (const detail of payload.error.details as Array<{ field?: string; message?: string }>) {
          if (typeof detail.field === 'string') {
            messages[detail.field] = detail.message ?? FALLBACK_FIELD_MESSAGE;
          }
        }

        showFieldErrors(messages);
        setError('Please check the highlighted fields.');
      } else if (code === 'PACKAGE_INACTIVE') {
        setError('This package is no longer available. Please pick another one.');
      } else if (code === 'IDEMPOTENCY_CONFLICT' || code === 'IDEMPOTENCY_EXPIRED') {
        // This attempt can never succeed: release the key so the next explicit Pay
        // starts a genuinely new attempt instead of failing forever.
        forgetCheckoutKey(browserStorage(), destinationSlug, packageSlug);
        setError(SESSION_ENDED_MESSAGE);
      } else {
        setError('We could not create your order. Please try again.');
      }
    } catch {
      setError('The checkout service is unreachable. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const total = unitPriceIdr * quantity;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="customerName" className="text-sm font-medium text-ink">
          Full name
        </label>
        <input
          id="customerName"
          name="customerName"
          required
          autoComplete="name"
          maxLength={100}
          onInput={() => clearFieldError('customerName')}
          className={inputClass}
          aria-invalid={fieldErrors.customerName === undefined ? undefined : true}
          aria-describedby={fieldErrors.customerName === undefined ? undefined : 'error-name'}
        />
        {fieldErrors.customerName === undefined ? null : (
          <p id="error-name" className="text-xs text-danger">
            {fieldErrors.customerName}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="customerEmail" className="text-sm font-medium text-ink">
          Email
        </label>
        <input
          id="customerEmail"
          name="customerEmail"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          maxLength={254}
          onInput={() => clearFieldError('customerEmail')}
          className={inputClass}
          aria-invalid={fieldErrors.customerEmail === undefined ? undefined : true}
          aria-describedby={fieldErrors.customerEmail === undefined ? undefined : 'error-email'}
        />
        {fieldErrors.customerEmail === undefined ? null : (
          <p id="error-email" className="text-xs text-danger">
            {fieldErrors.customerEmail}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="customerPhone" className="text-sm font-medium text-ink">
          Phone (international format)
        </label>
        <div className="flex items-stretch">
          <span
            aria-hidden="true"
            className="inline-flex items-center rounded-l-sm border border-r-0 border-sand bg-sand/40 px-3 text-sm font-medium text-ink-muted select-none"
          >
            +
          </span>
          <input
            id="customerPhone"
            // Only digits are collected; the leading "+" is fixed above.
            name="customerPhoneDigits"
            type="tel"
            required
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={PHONE_MAX_DIGITS}
            placeholder="628123456789"
            value={phoneDigits}
            onChange={(event) => {
              setPhoneDigits(
                event.currentTarget.value.replace(/\D/g, '').slice(0, PHONE_MAX_DIGITS),
              );
              clearFieldError('customerPhone');
            }}
            className={cn(inputClass, 'rounded-l-none')}
            aria-invalid={fieldErrors.customerPhone === undefined ? undefined : true}
            aria-describedby={
              fieldErrors.customerPhone === undefined ? 'hint-phone' : 'error-phone'
            }
          />
        </div>
        {fieldErrors.customerPhone === undefined ? (
          <p id="hint-phone" className="text-xs text-ink-muted">
            Digits only, including the country code.
          </p>
        ) : (
          <p id="error-phone" className="text-xs text-danger">
            {fieldErrors.customerPhone}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="quantity" className="text-sm font-medium text-ink">
          Quantity
        </label>
        <select
          id="quantity"
          value={quantity}
          onChange={(event) => {
            setQuantity(Number(event.currentTarget.value));
            clearFieldError('quantity');
          }}
          className={inputClass}
          aria-invalid={fieldErrors.quantity === undefined ? undefined : true}
          aria-describedby={fieldErrors.quantity === undefined ? undefined : 'error-quantity'}
        >
          {[1, 2, 3, 4, 5].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        {fieldErrors.quantity === undefined ? null : (
          <p id="error-quantity" className="text-xs text-danger">
            {fieldErrors.quantity}
          </p>
        )}
      </div>

      {error === null ? null : (
        <p role="alert" className="rounded-sm bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex min-h-11 items-center justify-center rounded-sm bg-forest px-4 py-2.5 text-sm font-medium text-white hover:bg-ink disabled:opacity-60"
      >
        {submitting ? 'Creating order…' : `Pay ${new Intl.NumberFormat('id-ID').format(total)} IDR`}
      </button>

      <p className="text-xs text-ink-muted">
        No account needed. The price is calculated on the server — the browser never sends it.
      </p>
    </form>
  );
}
