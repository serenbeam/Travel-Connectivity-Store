import type { Metadata } from 'next';
import Link from 'next/link';

import { DeleteForm } from '@/components/admin/delete-form';
import { ButtonLink } from '@/components/ui/button-link';
import { StatusBadge } from '@/components/ui/status-badge';
import { listDestinationsAdmin } from '@/modules/catalog/admin-queries';

export const metadata: Metadata = { title: 'Destinations' };

/**
 * `/admin/destinations` (FR-A4).
 *
 * The list shows inactive rows too — that is why it must be read through the authenticated
 * client with RLS `dest_admin_all`, not the public read path.
 */
export default async function AdminDestinationsPage() {
  const destinations = await listDestinationsAdmin();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink">Destinations</h1>
          <p className="mt-1 text-sm text-ink-muted">
            The same rows the storefront reads. Inactive destinations are hidden there.
          </p>
        </div>
        <ButtonLink href="/admin/destinations/new">New destination</ButtonLink>
      </div>

      <div className="overflow-x-auto rounded-sm border border-sand bg-surface">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-sand text-xs tracking-[0.08em] text-ink-muted uppercase">
            <tr>
              <th scope="col" className="px-3 py-2">
                Name
              </th>
              <th scope="col" className="px-3 py-2">
                Slug
              </th>
              <th scope="col" className="px-3 py-2">
                Region
              </th>
              <th scope="col" className="px-3 py-2">
                Packages
              </th>
              <th scope="col" className="px-3 py-2">
                Sort
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
            {destinations.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-ink-muted">
                  No destinations yet.
                </td>
              </tr>
            ) : (
              destinations.map((destination) => (
                <tr key={destination.id} className="border-b border-sand/60 last:border-0">
                  <td className="px-3 py-2 font-medium text-ink">
                    {destination.flagEmoji ? (
                      <span aria-hidden="true" className="mr-1">
                        {destination.flagEmoji}
                      </span>
                    ) : null}
                    {destination.name}
                  </td>
                  <td className="px-3 py-2 text-ink-muted">{destination.slug}</td>
                  <td className="px-3 py-2 text-ink-muted">{destination.region}</td>
                  <td className="tabular px-3 py-2 text-ink-muted">
                    {destination.packageCount}
                  </td>
                  <td className="tabular px-3 py-2 text-ink-muted">{destination.sortOrder}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={destination.isActive ? 'active' : 'inactive'} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/destinations/${destination.id}`}
                        className="text-sm font-medium text-teal hover:text-forest"
                      >
                        Edit
                      </Link>
                      <DeleteForm
                        resource="destinations"
                        id={destination.id}
                        label={destination.name}
                        confirmation={`Delete ${destination.name}? This cannot be undone.`}
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
