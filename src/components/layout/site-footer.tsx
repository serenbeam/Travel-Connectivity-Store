import { Container } from './container';

/**
 * Storefront footer. Text only — no images, no analytics, no external links, so the
 * layout never leaks a third-party request into capability pages.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-sand bg-surface">
      <Container>
        <div className="flex flex-col gap-1 py-10 text-sm text-ink-muted">
          <p>Roamly — travel connectivity store.</p>
          <p>Photography credits appear on each destination page.</p>
        </div>
      </Container>
    </footer>
  );
}
