import Link from 'next/link';

import { Container } from '@/components/layout/container';

/**
 * One 404 page for the whole app (R-01: single, predictable location).
 *
 * `notFound()` from any segment renders this file, so the three nested cases behave
 * identically: unknown destination, unknown package, and a valid package addressed under
 * the wrong destination.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center">
      <Container>
        <div className="mx-auto flex max-w-xl flex-col items-start gap-4 py-24">
          <p className="text-xs font-medium tracking-[0.18em] text-teal uppercase">404</p>
          <h1 className="text-3xl font-medium sm:text-4xl">We could not find that page</h1>
          <p className="text-base text-ink-muted">
            The page you asked for does not exist, or the destination or package is no longer
            available.
          </p>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-sm bg-forest px-4 py-2.5 text-sm font-medium text-white hover:bg-ink"
          >
            Go to homepage
          </Link>
        </div>
      </Container>
    </main>
  );
}
