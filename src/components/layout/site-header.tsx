import Link from 'next/link';

import { Container } from './container';

/**
 * Storefront header.
 *
 * Deliberately asset-free: text and CSS only. The same chrome must never introduce a
 * third-party request on capability pages (AC-T2 / NFR6).
 */
export function SiteHeader() {
  return (
    <header className="border-b border-sand bg-surface">
      <Container>
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-4 py-2">
          <Link
            href="/"
            className="font-display text-xl font-medium tracking-tight text-ink hover:text-forest"
          >
            Roamly
          </Link>

          <nav aria-label="Main">
            <Link
              href="/destinations"
              className="inline-flex min-h-11 items-center rounded-sm px-2 text-sm font-medium text-teal hover:text-forest"
            >
              Destinations
            </Link>
          </nav>
        </div>
      </Container>
    </header>
  );
}
