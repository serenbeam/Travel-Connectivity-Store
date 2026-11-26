import type { NextConfig } from 'next';

/**
 * Capability-token pages and the payment simulation must never be cached or
 * indexed. These headers are the config-level layer; API route handlers set
 * `Cache-Control: no-store` themselves as well (see docs/api-contract.md §3).
 *
 * Cache Components is intentionally NOT enabled for the MVP: order, checkout and
 * admin routes are dynamic and must not be prerendered.
 */
const nextConfig: NextConfig = {
  async headers() {
    const protectionHeaders = [
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Cache-Control', value: 'no-store' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
    ];

    return [
      { source: '/orders/:path*', headers: protectionHeaders },
      { source: '/mock-gateway/:path*', headers: protectionHeaders },
    ];
  },
};

export default nextConfig;
