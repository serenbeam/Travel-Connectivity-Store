import { z } from 'zod';

import { jsonError, jsonNoContent, jsonNotFound, jsonOk, validationDetails } from '@/lib/http';
import { logError } from '@/lib/logger';
import { adminGuard } from '@/modules/auth/guard';
import { deletePackage, updatePackage } from '@/modules/catalog/admin-mutations';
import { packagePatchSchema } from '@/modules/catalog/admin-schemas';

/**
 * `PATCH` / `DELETE /api/admin/packages/[id]` (api-contract §5.2, FR-A5).
 *
 * Editing a package never rewrites existing orders — they keep their name/price snapshots.
 * A package referenced by an order cannot be deleted: `409 PACKAGE_IN_USE`.
 */
const idSchema = z.uuid();

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const guard = await adminGuard();

  if (!guard.ok) {
    return guard.response;
  }

  const id = idSchema.safeParse((await context.params).id);

  if (!id.success) {
    return jsonError('BAD_REQUEST', 'Malformed path parameter.');
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError('BAD_REQUEST', 'Request body must be valid JSON.');
  }

  const parsed = packagePatchSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      'VALIDATION_ERROR',
      'Package payload is invalid.',
      validationDetails(parsed.error.issues),
    );
  }

  try {
    const result = await updatePackage(id.data, parsed.data);

    if (!result.ok) {
      if (result.kind === 'not_found') {
        return jsonNotFound();
      }

      if (result.kind === 'invalid') {
        return jsonError('VALIDATION_ERROR', 'Package payload is invalid.', result.issues);
      }

      if (result.kind === 'duplicate') {
        return jsonError(
          'UNIQUE_VIOLATION',
          'A package with this slug already exists for that destination.',
        );
      }

      if (result.kind === 'destination_missing') {
        return jsonError('VALIDATION_ERROR', 'Package payload is invalid.', [
          { field: 'destinationId', message: 'Destination does not exist.' },
        ]);
      }

      return jsonError('INTERNAL', 'The package could not be updated.');
    }

    return jsonOk({ data: result.row });
  } catch (error) {
    logError('admin packages: update failed', {
      reason: error instanceof Error ? error.name : 'unknown',
    });

    return jsonError('INTERNAL', 'The package could not be updated.');
  }
}

export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  const guard = await adminGuard();

  if (!guard.ok) {
    return guard.response;
  }

  const id = idSchema.safeParse((await context.params).id);

  if (!id.success) {
    return jsonError('BAD_REQUEST', 'Malformed path parameter.');
  }

  try {
    const result = await deletePackage(id.data);

    if (!result.ok) {
      if (result.kind === 'not_found') {
        return jsonNotFound();
      }

      if (result.kind === 'package_in_use') {
        return jsonError('PACKAGE_IN_USE', 'This package is referenced by an order.');
      }

      return jsonError('INTERNAL', 'The package could not be deleted.');
    }

    return jsonNoContent();
  } catch (error) {
    logError('admin packages: delete failed', {
      reason: error instanceof Error ? error.name : 'unknown',
    });

    return jsonError('INTERNAL', 'The package could not be deleted.');
  }
}
