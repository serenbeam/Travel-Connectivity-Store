import Link from 'next/link';

/**
 * Admin navigation. Presentational only: no data access, no active-route logic (that would
 * need a client hook and add no value for five links). The current page is announced by the
 * page's own `<h1>`.
 */
const LINKS = [
  { href: '/admin', label: 'Ringkasan' },
  { href: '/admin/destinations', label: 'Destinasi' },
  { href: '/admin/packages', label: 'Paket' },
  { href: '/admin/orders', label: 'Pesanan' },
  { href: '/admin/payments', label: 'Pembayaran' },
] as const;

export function AdminNav() {
  return (
    <nav aria-label="Navigasi admin" className="lg:w-60 lg:shrink-0">
      <ul
        className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-1"
        role="list"
      >
        {LINKS.map((link) => (
          <li key={link.href} className="shrink-0">
            <Link
              href={link.href}
              className="inline-flex min-h-11 items-center rounded-sm px-3 text-sm font-medium text-ink-muted transition-colors hover:bg-surface hover:text-ink lg:w-full"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
