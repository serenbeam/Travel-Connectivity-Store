import { jsonError, jsonOk, validationDetails } from '@/lib/http';
import { logError } from '@/lib/logger';
import { adminGuard } from '@/modules/auth/guard';
import { createPackage } from '@/modules/catalog/admin-mutations';
import { packageInputSchema } from '@/modules/catalog/admin-schemas';

/**
 * `POST /api/admin/packages` (api-contract §5.2).
 *
 * Two different conflicts, two different answers:
 * - duplicate `(destination_id, slug)`            -> `409 UNIQUE_VIOLATION`
 * - `destinationId` that does not exist           -> `422 VALIDATION_ERROR` (field-level)
 */
export async function POST(request: Request): Promise<Response> {
  const guard = await adminGuard();

  if (!guard.ok) {
    return guard.response;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError('BAD_REQUEST', 'Request body must be valid JSON.');
  }

  const parsed = packageInputSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      'VALIDATION_ERROR',
      'Package payload is invalid.',
      validationDetails(parsed.error.issues),
    );
  }

  try {
    const result = await createPackage(parsed.data);

    if (!result.ok) {
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

      return jsonError('INTERNAL', 'The package could not be created.');
    }

    return jsonOk({ data: result.row }, { status: 201 });
  } catch (error) {
    logError('admin packages: create failed', {
      reason: error instanceof Error ? error.name : 'unknown',
    });

    return jsonError('INTERNAL', 'The package could not be created.');
  }
}
