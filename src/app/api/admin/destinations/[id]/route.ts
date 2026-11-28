import { z } from 'zod';

import { jsonError, jsonNoContent, jsonNotFound, jsonOk, validationDetails } from '@/lib/http';
import { logError } from '@/lib/logger';
import { adminGuard } from '@/modules/auth/guard';
import { deleteDestination, updateDestination } from '@/modules/catalog/admin-mutations';
import { destinationPatchSchema } from '@/modules/catalog/admin-schemas';

/**
 * `PATCH` / `DELETE /api/admin/destinations/[id]` (api-contract §5.1).
 *
 * - a malformed id is `400 BAD_REQUEST` ("unparsable param"), never a fake 404;
 * - a destination that still has packages answers `409 DESTINATION_IN_USE` (AC-A6);
 * - the response never contains SQL, constraint names, or database messages.
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

  const parsed = destinationPatchSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      'VALIDATION_ERROR',
      'Destination payload is invalid.',
      validationDetails(parsed.error.issues),
    );
  }

  try {
    const result = await updateDestination(id.data, parsed.data);

    if (!result.ok) {
      if (result.kind === 'not_found') {
        return jsonNotFound();
      }

      if (result.kind === 'duplicate') {
        return jsonError(
          'UNIQUE_VIOLATION',
          'A destination with this slug or country code already exists.',
        );
      }

      return jsonError('INTERNAL', 'The destination could not be updated.');
    }

    return jsonOk({ data: result.row });
  } catch (error) {
    logError('admin destinations: update failed', {
      reason: error instanceof Error ? error.name : 'unknown',
    });

    return jsonError('INTERNAL', 'The destination could not be updated.');
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
    const result = await deleteDestination(id.data);

    if (!result.ok) {
      if (result.kind === 'not_found') {
        return jsonNotFound();
      }

      if (result.kind === 'destination_in_use') {
        return jsonError('DESTINATION_IN_USE', 'This destination still has packages.');
      }

      return jsonError('INTERNAL', 'The destination could not be deleted.');
    }

    return jsonNoContent();
  } catch (error) {
    logError('admin destinations: delete failed', {
      reason: error instanceof Error ? error.name : 'unknown',
    });

    return jsonError('INTERNAL', 'The destination could not be deleted.');
  }
}
