'use client';

/**
 * Storefront error boundary (S-4).
 *
 * Renders a generic message: the underlying Supabase error text is never shown, so a
 * database or configuration failure cannot leak internals to a visitor.
 */
export default function StorefrontError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-4 px-5 py-24">
      <h1 className="text-3xl font-medium">Something went wrong</h1>
      <p className="text-base text-ink-muted">
        We could not load the catalogue just now. Please try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex min-h-11 items-center rounded-sm bg-forest px-4 py-2.5 text-sm font-medium text-white hover:bg-ink"
      >
        Try again
      </button>
    </div>
  );
}
