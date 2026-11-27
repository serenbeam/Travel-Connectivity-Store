'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Guest checkout form (api-contract §4.3).
 *
 * The `Idempotency-Key` is generated once per checkout session and kept in `sessionStorage`
 * so a retry reuses it — that is what makes a double submit return the same order instead of
 * creating a second one. It is treated as a secret: never placed in the URL, never logged.
 */

interface CheckoutFormProps {
  destinationSlug: string;
  packageSlug: string;
  unitPriceIdr: number;
}

const STORAGE_PREFIX = 'roamly:idempotency:';

function newIdempotencyKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function idempotencyKeyFor(destinationSlug: string, packageSlug: string): string {
  const storageKey = `${STORAGE_PREFIX}${destinationSlug}:${packageSlug}`;

  try {
    const existing = window.sessionStorage.getItem(storageKey);

    if (existing !== null) {
      return existing;
    }

    const created = newIdempotencyKey();
    window.sessionStorage.setItem(storageKey, created);

    return created;
  } catch {
    // Private mode or storage disabled: still generate a key, the order just is not
    // replayable across reloads.
    return newIdempotencyKey();
  }
}

const inputClass =
  'w-full rounded-sm border border-sand bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted/70';

export function CheckoutForm({ destinationSlug, packageSlug, unitPriceIdr }: CheckoutFormProps) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);
    const key = idempotencyKeyFor(destinationSlug, packageSlug);

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': key,
        },
        body: JSON.stringify({
          destinationSlug,
          packageSlug,
          quantity,
          customerName: String(form.get('customerName') ?? ''),
          customerEmail: String(form.get('customerEmail') ?? ''),
          customerPhone: String(form.get('customerPhone') ?? ''),
        }),
        cache: 'no-store',
      });

      const payload = (await response.json().catch(() => null)) as
        | { paymentUrl?: string; error?: { code?: string; details?: unknown } }
        | null;

      if (response.ok && typeof payload?.paymentUrl === 'string') {
        router.push(payload.paymentUrl);
        return;
      }

      const code = payload?.error?.code;

      if (code === 'VALIDATION_ERROR' && Array.isArray(payload?.error?.details)) {
        const next: Record<string, string> = {};

        for (const detail of payload.error.details as Array<{ field?: string; message?: string }>) {
          if (typeof detail.field === 'string' && typeof detail.message === 'string') {
            next[detail.field] = detail.message;
          }
        }

        setFieldErrors(next);
        setError('Please check the highlighted fields.');
      } else if (code === 'PACKAGE_INACTIVE') {
        setError('This package is no longer available. Please pick another one.');
      } else if (code === 'IDEMPOTENCY_CONFLICT' || code === 'IDEMPOTENCY_EXPIRED') {
        setError(
          'This checkout session can no longer be reused. Please start a new order from the package page.',
        );
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
        <input
          id="customerPhone"
          name="customerPhone"
          type="tel"
          required
          placeholder="+628123456789"
          autoComplete="tel"
          className={inputClass}
          aria-invalid={fieldErrors.customerPhone === undefined ? undefined : true}
          aria-describedby={fieldErrors.customerPhone === undefined ? undefined : 'error-phone'}
        />
        {fieldErrors.customerPhone === undefined ? null : (
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
          name="quantity"
          value={quantity}
          onChange={(event) => setQuantity(Number(event.target.value))}
          className={inputClass}
        >
          {[1, 2, 3, 4, 5].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
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
