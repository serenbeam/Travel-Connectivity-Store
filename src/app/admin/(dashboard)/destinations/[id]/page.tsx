import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { DestinationForm } from '@/components/admin/destination-form';
import { getDestinationAdmin } from '@/modules/catalog/admin-queries';

export const metadata: Metadata = { title: 'Destination' };

type Params = Promise<{ id: string }>;

/**
 * `/admin/destinations/new` and `/admin/destinations/[id]` (FR-A4).
 *
 * `new` is a literal segment on purpose: it keeps the list page free of a second route and
 * the form identical for create and edit. A malformed id is a 404 here (page context), while
 * the API answers 400 for the same input.
 */
export default async function AdminDestinationDetailPage({ params }: { params: Params }) {
  const { id } = await params;

  if (id === 'new') {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-2xl text-ink">New destination</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Saved rows appear in the storefront when the status is Active.
          </p>
        </div>
        <DestinationForm mode="create" />
      </div>
    );
  }

  const parsedId = z.uuid().safeParse(id);

  if (!parsedId.success) {
    notFound();
  }

  const destination = await getDestinationAdmin(parsedId.data);

  if (destination === null) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/destinations"
          className="text-sm font-medium text-teal hover:text-forest"
        >
          ← Destinations
        </Link>
        <h1 className="mt-2 font-display text-2xl text-ink">Edit {destination.name}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Editing a destination never rewrites existing orders — they keep their snapshots.
        </p>
      </div>
      <DestinationForm mode="edit" destination={destination} />
    </div>
  );
}
