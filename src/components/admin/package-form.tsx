'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { AdminPackageRow } from '@/modules/catalog/admin-queries';

/**
 * Package create/edit form (FR-A5).
 *
 * Price is a plain integer IDR field here — this is the *catalog* price an admin authors, not
 * an order total. Order totals are still computed in SQL from `packages.price_idr`, so
 * nothing on this form can change a placed order (they keep their snapshots).
 */
export interface PackageFormProps {
  mode: 'create' | 'edit';
  pkg?: AdminPackageRow;
  destinations: ReadonlyArray<{ id: string; name: string }>;
}

interface FieldErrors {
  [field: string]: string;
}

function text(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

export function PackageForm({ mode, pkg, destinations }: PackageFormProps) {
  const router = useRouter();
  const [values, setValues] = useState({
    destinationId: pkg?.destinationId ?? destinations[0]?.id ?? '',
    slug: pkg?.slug ?? '',
    name: pkg?.name ?? '',
    isUnlimited: pkg?.isUnlimited ?? false,
    dataMb: text(pkg?.dataMb),
    validityDays: text(pkg?.validityDays ?? 15),
    priceIdr: text(pkg?.priceIdr),
    compareAtPriceIdr: text(pkg?.compareAtPriceIdr),
    network: pkg?.network ?? '',
    hotspotAllowed: pkg?.hotspotAllowed ?? true,
    isActive: pkg?.isActive ?? true,
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function update<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFieldErrors({});
    setMessage(null);

    const payload = {
      destinationId: values.destinationId,
      slug: values.slug.trim(),
      name: values.name.trim(),
      isUnlimited: values.isUnlimited,
      dataMb: values.isUnlimited || values.dataMb.trim() === '' ? null : Number(values.dataMb),
      validityDays: Number(values.validityDays),
      priceIdr: Number(values.priceIdr),
      compareAtPriceIdr:
        values.compareAtPriceIdr.trim() === '' ? null : Number(values.compareAtPriceIdr),
      network: values.network.trim() === '' ? null : values.network.trim(),
      hotspotAllowed: values.hotspotAllowed,
      isActive: values.isActive,
    };

    const endpoint =
      mode === 'create' ? '/api/admin/packages' : `/api/admin/packages/${pkg?.id ?? ''}`;

    try {
      const response = await fetch(endpoint, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        router.push('/admin/packages');
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

      setMessage(body?.error?.message ?? 'The package could not be saved.');
    } catch {
      setMessage('The package could not be saved: the network request failed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <div className="grid gap-4 md:grid-cols-2">
        <Select
          id="package-destination"
          label="Destination"
          required
          value={values.destinationId}
          options={destinations.map((destination) => ({
            value: destination.id,
            label: destination.name,
          }))}
          error={fieldErrors.destinationId}
          onChange={(event) => update('destinationId', event.target.value)}
        />
        <Input
          id="package-name"
          label="Name"
          required
          value={values.name}
          error={fieldErrors.name}
          onChange={(event) => update('name', event.target.value)}
        />
        <Input
          id="package-slug"
          label="Slug"
          required
          hint="Unique within the destination."
          value={values.slug}
          error={fieldErrors.slug}
          onChange={(event) => update('slug', event.target.value)}
        />
        <Select
          id="package-unlimited"
          label="Data volume"
          value={values.isUnlimited ? 'true' : 'false'}
          options={[
            { value: 'false', label: 'Metered (data volume in MB)' },
            { value: 'true', label: 'Unlimited' },
          ]}
          onChange={(event) => update('isUnlimited', event.target.value === 'true')}
        />
        <Input
          id="package-data-mb"
          label="Data volume (MB)"
          type="number"
          hint="Required for a metered package; leave empty when unlimited."
          disabled={values.isUnlimited}
          value={values.isUnlimited ? '' : values.dataMb}
          error={fieldErrors.dataMb}
          onChange={(event) => update('dataMb', event.target.value)}
        />
        <Input
          id="package-validity"
          label="Validity (days)"
          type="number"
          required
          hint="1–90."
          value={values.validityDays}
          error={fieldErrors.validityDays}
          onChange={(event) => update('validityDays', event.target.value)}
        />
        <Input
          id="package-price"
          label="Price (IDR, integer)"
          type="number"
          required
          value={values.priceIdr}
          error={fieldErrors.priceIdr}
          onChange={(event) => update('priceIdr', event.target.value)}
        />
        <Input
          id="package-compare-at"
          label="Compare-at price (IDR, optional)"
          type="number"
          hint="Must be higher than the real price."
          value={values.compareAtPriceIdr}
          error={fieldErrors.compareAtPriceIdr}
          onChange={(event) => update('compareAtPriceIdr', event.target.value)}
        />
        <Input
          id="package-network"
          label="Network (optional)"
          value={values.network}
          error={fieldErrors.network}
          onChange={(event) => update('network', event.target.value)}
        />
        <Select
          id="package-status"
          label="Status"
          value={values.isActive ? 'true' : 'false'}
          options={[
            { value: 'true', label: 'Active (sold in the storefront)' },
            { value: 'false', label: 'Inactive (hidden, checkout rejected)' },
          ]}
          onChange={(event) => update('isActive', event.target.value === 'true')}
        />
        <Select
          id="package-hotspot"
          label="Hotspot"
          value={values.hotspotAllowed ? 'true' : 'false'}
          options={[
            { value: 'true', label: 'Allowed' },
            { value: 'false', label: 'Not allowed' },
          ]}
          onChange={(event) => update('hotspotAllowed', event.target.value === 'true')}
        />
      </div>

      {message ? (
        <p role="alert" className="text-sm text-ink-muted">
          {message}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" loading={pending} disabled={pending}>
          {mode === 'create' ? 'Create package' : 'Save changes'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.push('/admin/packages')}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
