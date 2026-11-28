import { jsonError, jsonOk, validationDetails } from '@/lib/http';
import { logError } from '@/lib/logger';
import { createDestination } from '@/modules/catalog/admin-mutations';
import { destinationInputSchema } from '@/modules/catalog/admin-schemas';
import { adminGuard } from '@/modules/auth/guard';

/**
 * `POST /api/admin/destinations` (api-contract §5.1).
 *
 * Thin transport layer: authorization first, then body validation, then one module call.
 * Authorization precedes reading the body on purpose — an unauthenticated caller must not be
 * able to make the server parse a payload.
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

  const parsed = destinationInputSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      'VALIDATION_ERROR',
      'Destination payload is invalid.',
      validationDetails(parsed.error.issues),
    );
  }

  try {
    const result = await createDestination(parsed.data);

    if (!result.ok) {
      if (result.kind === 'duplicate') {
        return jsonError(
          'UNIQUE_VIOLATION',
          'A destination with this slug or country code already exists.',
        );
      }

      return jsonError('INTERNAL', 'The destination could not be created.');
    }

    return jsonOk({ data: result.row }, { status: 201 });
  } catch (error) {
    logError('admin destinations: create failed', {
      reason: error instanceof Error ? error.name : 'unknown',
    });

    return jsonError('INTERNAL', 'The destination could not be created.');
  }
}
