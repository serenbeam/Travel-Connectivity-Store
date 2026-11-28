'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { AdminDestinationRow } from '@/modules/catalog/admin-queries';

/**
 * Destination create/edit form (FR-A4, FR-A6, AC-E1, AC-E2).
 *
 * The form only collects and submits values: constraints live in the module's Zod schema and
 * the database CHECKs. "Fill from API" calls the advisory enrich endpoint, which returns
 * suggestions and writes nothing; when it fails the form is still submittable by hand.
 */
export interface DestinationFormProps {
  mode: 'create' | 'edit';
  destination?: AdminDestinationRow;
}

interface FieldErrors {
  [field: string]: string;
}

const EMPTY = {
  slug: '',
  countryCode: '',
  name: '',
  region: '',
  currencyCode: '',
  flagEmoji: '',
  summary: '',
  description: '',
  heroImageUrl: '',
  heroImageAttribution: '',
  isActive: true,
  sortOrder: '0',
};

export function DestinationForm({ mode, destination }: DestinationFormProps) {
  const router = useRouter();
  const [values, setValues] = useState({
    slug: destination?.slug ?? EMPTY.slug,
    countryCode: destination?.countryCode ?? EMPTY.countryCode,
    name: destination?.name ?? EMPTY.name,
    region: destination?.region ?? EMPTY.region,
    currencyCode: destination?.currencyCode ?? EMPTY.currencyCode,
    flagEmoji: destination?.flagEmoji ?? EMPTY.flagEmoji,
    summary: destination?.summary ?? EMPTY.summary,
    description: destination?.description ?? EMPTY.description,
    heroImageUrl: destination?.heroImageUrl ?? EMPTY.heroImageUrl,
    heroImageAttribution: destination?.heroImageAttribution ?? EMPTY.heroImageAttribution,
    isActive: destination?.isActive ?? EMPTY.isActive,
    sortOrder: String(destination?.sortOrder ?? EMPTY.sortOrder),
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [enriching, setEnriching] = useState(false);

  function update<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function onEnrich() {
    setMessage(null);
    setEnriching(true);

    try {
      const response = await fetch('/api/admin/destinations/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countryName: values.name }),
      });
      const body = (await response.json().catch(() => null)) as
        | { countryCode?: string; currencyCode?: string; flagEmoji?: string | null; error?: { message?: string } }
        | null;

      if (!response.ok || body === null) {
        setMessage(
          body?.error?.message ??
            'Country data is unavailable right now. Enter the fields manually.',
        );
        return;
      }

      setValues((current) => ({
        ...current,
        countryCode: body.countryCode ?? current.countryCode,
        currencyCode: body.currencyCode ?? current.currencyCode,
        flagEmoji: body.flagEmoji ?? current.flagEmoji,
      }));
      setMessage('Suggestions filled from countriesnow.space. Review before saving.');
    } catch {
      setMessage('Country data is unavailable right now. Enter the fields manually.');
    } finally {
      setEnriching(false);
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFieldErrors({});
    setMessage(null);

    const payload = {
      slug: values.slug.trim(),
      countryCode: values.countryCode.trim(),
      name: values.name.trim(),
      region: values.region.trim(),
      currencyCode: values.currencyCode.trim(),
      flagEmoji: values.flagEmoji.trim() === '' ? null : values.flagEmoji.trim(),
      summary: values.summary.trim(),
      description: values.description.trim() === '' ? null : values.description.trim(),
      heroImageUrl: values.heroImageUrl.trim(),
      heroImageAttribution: values.heroImageAttribution.trim(),
      isActive: values.isActive,
      sortOrder: Number(values.sortOrder),
    };

    const endpoint =
      mode === 'create'
        ? '/api/admin/destinations'
        : `/api/admin/destinations/${destination?.id ?? ''}`;

    try {
      const response = await fetch(endpoint, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        router.push('/admin/destinations');
        router.refresh();
        return;
      }

      const body = (await response.json().catch(() => null)) as
        | {
            error?: {
              code?: string;
              message?: string;
              details?: Array<{ field?: string; message?: string }>;
            };
          }
        | null;

      const details = body?.error?.details;

      if (Array.isArray(details)) {
        const next: FieldErrors = {};

        for (const detail of details) {
          if (typeof detail.field === 'string' && typeof detail.message === 'string') {
            next[detail.field] = detail.message;
          }
        }

        setFieldErrors(next);
      }

      setMessage(body?.error?.message ?? 'The destination could not be saved.');
    } catch {
      setMessage('The destination could not be saved: the network request failed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <div className="grid gap-4 md:grid-cols-2">
        <Input
          id="destination-name"
          label="Name"
          required
          value={values.name}
          error={fieldErrors.name}
          onChange={(event) => update('name', event.target.value)}
        />
        <Input
          id="destination-slug"
          label="Slug"
          required
          hint="Lowercase letters, digits, and hyphens."
          value={values.slug}
          error={fieldErrors.slug}
          onChange={(event) => update('slug', event.target.value)}
        />
        <Input
          id="destination-country"
          label="Country code (ISO-2)"
          required
          value={values.countryCode}
          error={fieldErrors.countryCode}
          onChange={(event) => update('countryCode', event.target.value.toUpperCase())}
        />
        <Input
          id="destination-currency"
          label="Currency code (ISO-3)"
          required
          value={values.currencyCode}
          error={fieldErrors.currencyCode}
          onChange={(event) => update('currencyCode', event.target.value.toUpperCase())}
        />
        <Input
          id="destination-region"
          label="Region"
          required
          hint="Authored by the admin; the external API does not provide it."
          value={values.region}
          error={fieldErrors.region}
          onChange={(event) => update('region', event.target.value)}
        />
        <Input
          id="destination-flag"
          label="Flag emoji"
          value={values.flagEmoji}
          error={fieldErrors.flagEmoji}
          onChange={(event) => update('flagEmoji', event.target.value)}
        />
      </div>

      <div className="rounded-sm border border-sand bg-surface p-3">
        <p className="text-sm text-ink-muted">
          Fill country code, currency, and flag from countriesnow.space. Nothing is written to
          the database by this action.
        </p>
        <div className="mt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onEnrich}
            loading={enriching}
            disabled={values.name.trim() === ''}
          >
            Fill from API
          </Button>
        </div>
      </div>

      <Input
        id="destination-summary"
        label="Summary"
        required
        hint="1–160 characters, shown on the destination card."
        value={values.summary}
        error={fieldErrors.summary}
        onChange={(event) => update('summary', event.target.value)}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="destination-description" className="text-sm font-medium text-ink">
          Description
        </label>
        <textarea
          id="destination-description"
          rows={3}
          value={values.description}
          onChange={(event) => update('description', event.target.value)}
          className="w-full rounded-sm border border-sand bg-surface px-3 py-2.5 text-sm text-ink focus:border-teal"
        />
        {fieldErrors.description ? (
          <p className="text-xs text-danger">{fieldErrors.description}</p>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Input
          id="destination-hero-url"
          label="Hero image URL"
          required
          hint="https:// only."
          value={values.heroImageUrl}
          error={fieldErrors.heroImageUrl}
          onChange={(event) => update('heroImageUrl', event.target.value)}
        />
        <Input
          id="destination-attribution"
          label="Photo attribution"
          required
          value={values.heroImageAttribution}
          error={fieldErrors.heroImageAttribution}
          onChange={(event) => update('heroImageAttribution', event.target.value)}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Select
          id="destination-active"
          label="Status"
          value={values.isActive ? 'true' : 'false'}
          options={[
            { value: 'true', label: 'Active (visible in the storefront)' },
            { value: 'false', label: 'Inactive (hidden)' },
          ]}
          onChange={(event) => update('isActive', event.target.value === 'true')}
        />
        <Input
          id="destination-sort"
          label="Sort order"
          type="number"
          value={values.sortOrder}
          error={fieldErrors.sortOrder}
          onChange={(event) => update('sortOrder', event.target.value)}
        />
      </div>

      {message ? (
        <p role="alert" className="text-sm text-ink-muted">
          {message}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" loading={pending} disabled={pending}>
          {mode === 'create' ? 'Create destination' : 'Save changes'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.push('/admin/destinations')}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
