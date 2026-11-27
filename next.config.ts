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
  /**
   * Destination photography is served from Wikimedia Commons (seed data, design §8.1).
   * `next/image` refuses to optimise an unlisted host, so the single allowed origin is
   * declared explicitly — no wildcard host.
   */
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
        pathname: '/wikipedia/commons/**',
      },
    ],

    /**
     * Reduced candidate widths (A″). Wikimedia's edge rate-limits per IP, and every
     * distinct (src, width, quality) the browser can ask for is a potential upstream
     * fetch from this server. The list is derived from the actual layout, not copied:
     *
     *  - page gutter: max-width 1200px, 32px gutters  -> 1136px of content
     *  - destination card (3 cols, 24px gaps)         -> ~363px CSS, ~726px at 2x DPR
     *  - destination card (2 cols at md)              -> ~468px CSS, ~936px at 2x DPR
     *  - hero on home / destination detail (50vw)     -> ~640px CSS at 1280px viewport
     *  - mobile hero and cards (100vw)                -> 390px CSS, ~780px at 2x DPR
     *
     * 640 / 828 / 1080 / 1200 cover those buckets. The previous defaults exposed eight
     * widths up to 3840, which mostly produced variants nobody requests on a 3-column
     * card grid. `imageSizes` stays entirely below the smallest `deviceSize`, as Next
     * requires.
     */
    deviceSizes: [640, 828, 1080, 1200],
    imageSizes: [128, 256, 384],

    /**
     * One day instead of the 4-hour default: catalogue photography does not change, so
     * repeat views must not re-validate against an upstream that rate-limits us.
     */
    minimumCacheTTL: 86_400,
  },

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
