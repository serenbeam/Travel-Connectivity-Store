import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { PackageForm } from '@/components/admin/package-form';
import {
  getPackageAdmin,
  listDestinationsAdmin,
} from '@/modules/catalog/admin-queries';

export const metadata: Metadata = { title: 'Package' };

type Params = Promise<{ id: string }>;

/** `/admin/packages/new` and `/admin/packages/[id]` (FR-A5). */
export default async function AdminPackageDetailPage({ params }: { params: Params }) {
  const { id } = await params;

  if (id === 'new') {
    const destinations = await listDestinationsAdmin();

    if (destinations.length === 0) {
      return (
        <div className="flex flex-col gap-4">
          <h1 className="font-display text-2xl text-ink">New package</h1>
          <p className="rounded-sm border border-sand bg-surface p-4 text-sm text-ink-muted">
            Create a destination first — every package belongs to one.
          </p>
          <Link
            href="/admin/destinations/new"
            className="text-sm font-medium text-teal hover:text-forest"
          >
            Go to new destination
          </Link>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-2xl text-ink">New package</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Active packages are immediately available in the storefront.
          </p>
        </div>
        <PackageForm
          mode="create"
          destinations={destinations.map(({ id: destinationId, name }) => ({
            id: destinationId,
            name,
          }))}
        />
      </div>
    );
  }

  const parsedId = z.uuid().safeParse(id);

  if (!parsedId.success) {
    notFound();
  }

  const [pkg, destinations] = await Promise.all([
    getPackageAdmin(parsedId.data),
    listDestinationsAdmin(),
  ]);

  if (pkg === null) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/packages" className="text-sm font-medium text-teal hover:text-forest">
          ← Packages
        </Link>
        <h1 className="mt-2 font-display text-2xl text-ink">Edit {pkg.name}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Existing orders keep their package name and price snapshots.
        </p>
      </div>
      <PackageForm
        mode="edit"
        pkg={pkg}
        destinations={destinations.map(({ id: destinationId, name }) => ({
          id: destinationId,
          name,
        }))}
      />
    </div>
  );
}
