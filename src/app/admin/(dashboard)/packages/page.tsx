import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';

import { DeleteForm } from '@/components/admin/delete-form';
import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/ui/button-link';
import { Select } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatIdr } from '@/lib/format';
import { listDestinationsAdmin, listPackagesAdmin } from '@/modules/catalog/admin-queries';

export const metadata: Metadata = { title: 'Packages' };

type SearchParams = Promise<{ destinationId?: string }>;

/** `/admin/packages` with an optional destination filter (FR-A5). */
export default async function AdminPackagesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const parsedFilter = z.uuid().safeParse(params.destinationId ?? '');
  const destinationId = parsedFilter.success ? parsedFilter.data : undefined;

  const [destinations, packages] = await Promise.all([
    listDestinationsAdmin(),
    listPackagesAdmin({ destinationId }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink">Packages</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Price is the catalog price in integer IDR; order totals are always computed
            server-side from it.
          </p>
        </div>
        <ButtonLink href="/admin/packages/new">New package</ButtonLink>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2">
        <div className="w-64">
          <Select
            id="package-filter-destination"
            name="destinationId"
            label="Filter by destination"
            defaultValue={destinationId ?? ''}
            options={[
              { value: '', label: 'All destinations' },
              ...destinations.map((destination) => ({
                value: destination.id,
                label: destination.name,
              })),
            ]}
          />
        </div>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
      </form>

      <div className="overflow-x-auto rounded-sm border border-sand bg-surface">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-sand text-xs tracking-[0.08em] text-ink-muted uppercase">
            <tr>
              <th scope="col" className="px-3 py-2">
                Name
              </th>
              <th scope="col" className="px-3 py-2">
                Destination
              </th>
              <th scope="col" className="px-3 py-2">
                Data
              </th>
              <th scope="col" className="px-3 py-2">
                Validity
              </th>
              <th scope="col" className="px-3 py-2">
                Price
              </th>
              <th scope="col" className="px-3 py-2">
                Status
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {packages.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-ink-muted">
                  No packages for this filter.
                </td>
              </tr>
            ) : (
              packages.map((pkg) => (
                <tr key={pkg.id} className="border-b border-sand/60 last:border-0">
                  <td className="px-3 py-2 font-medium text-ink">
                    {pkg.name}
                    <span className="block text-xs text-ink-muted">{pkg.slug}</span>
                  </td>
                  <td className="px-3 py-2 text-ink-muted">{pkg.destination.name}</td>
                  <td className="px-3 py-2 text-ink-muted">
                    {pkg.isUnlimited ? 'Unlimited' : `${pkg.dataMb ?? 0} MB`}
                  </td>
                  <td className="tabular px-3 py-2 text-ink-muted">{pkg.validityDays} d</td>
                  <td className="tabular px-3 py-2 text-ink">{formatIdr(pkg.priceIdr)}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={pkg.isActive ? 'active' : 'inactive'} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/packages/${pkg.id}`}
                        className="text-sm font-medium text-teal hover:text-forest"
                      >
                        Edit
                      </Link>
                      <DeleteForm
                        resource="packages"
                        id={pkg.id}
                        label={pkg.name}
                        confirmation={`Delete ${pkg.name}? This cannot be undone.`}
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
