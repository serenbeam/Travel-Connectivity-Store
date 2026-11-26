import { z } from 'zod';

/**
 * Public environment: safe for the browser bundle because every value is
 * NEXT_PUBLIC_* and Next.js inlines them at build time.
 *
 * Validation is LAZY (called from getPublicEnv) so `next build` never needs a
 * filled .env.local — see docs/architecture.md §9 and the E-2 verification plan.
 *
 * Property access is written out explicitly (never a dynamic loop over
 * process.env) because Next.js only inlines statically referenced NEXT_PUBLIC_ keys.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_APP_URL: z.url(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export class PublicEnvError extends Error {
  /** Variable names only — values are never included in the message. */
  readonly variables: string[];

  constructor(variables: string[]) {
    super(`Missing or invalid public environment variables: ${variables.join(', ')}`);
    this.name = 'PublicEnvError';
    this.variables = variables;
  }
}

let cached: PublicEnv | null = null;

export function getPublicEnv(): PublicEnv {
  if (cached) {
    return cached;
  }

  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });

  if (!parsed.success) {
    const variables = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    throw new PublicEnvError(variables);
  }

  cached = parsed.data;
  return cached;
}

/** Test-only helper; keeps the lazy cache from leaking between test cases. */
export function resetPublicEnvCache(): void {
  cached = null;
}
