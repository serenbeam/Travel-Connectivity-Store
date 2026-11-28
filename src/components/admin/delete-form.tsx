'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

/**
 * Delete trigger for a catalog row (FR-A4, FR-A5, AC-A6).
 *
 * The 409 body is shown verbatim from the contract: `DESTINATION_IN_USE` /
 * `PACKAGE_IN_USE` mean the row is referenced, and the fix is to deactivate it instead of
 * deleting it. The component never decides whether a delete is allowed — the server does.
 */
export interface DeleteFormProps {
  resource: 'destinations' | 'packages';
  id: string;
  label: string;
  confirmation: string;
}

export function DeleteForm({ resource, id, label, confirmation }: DeleteFormProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    if (!window.confirm(confirmation)) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/${resource}/${id}`, { method: 'DELETE' });

      if (response.status === 204) {
        router.refresh();
        return;
      }

      const body = (await response.json().catch(() => null)) as
        | { error?: { code?: string; message?: string } }
        | null;

      if (response.status === 409 && body?.error?.code === 'DESTINATION_IN_USE') {
        setError('This destination still has packages. Deactivate it, or delete its packages first.');
      } else if (response.status === 409 && body?.error?.code === 'PACKAGE_IN_USE') {
        setError('An order references this package. Deactivate it instead of deleting it.');
      } else if (response.status === 401 || response.status === 403) {
        setError('The admin session is no longer valid. Reload the page and sign in again.');
      } else {
        setError('The delete request failed. Try again.');
      }
    } catch {
      setError('The delete request failed: the network is unavailable.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="danger"
        onClick={onDelete}
        loading={pending}
        aria-label={`Delete ${label}`}
      >
        Delete
      </Button>
      {error ? (
        <p role="alert" className="max-w-56 text-right text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
