import type { NextConfig } from 'next';

/**
 * Security headers are configuration, not application code, so they live
 * here rather than in middleware. The CSP closes one of the five gaps the
 * specifications do not cover: no third-party scripts, tags or fonts on a
 * surface that collects credentials.
 */
const isDev = process.env.NODE_ENV !== 'production';

/**
 * The API lives on its own origin, so connect-src must name it explicitly —
 * 'self' does not cover a different port. Derived from the same variable the
 * client uses, so the policy cannot drift from where requests actually go.
 */
const apiOrigin = (() => {
  const url = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!url) return '';
  try {
    return ` ${new URL(url).origin}`;
  } catch {
    return '';
  }
})();

/**
 * Development needs two relaxations that must never reach production:
 *
 *  · 'unsafe-eval' — React Refresh compiles modules with eval to hot-reload
 *    them. Without it the bundle throws before hydration and the page is
 *    inert: it renders from the server but nothing responds to a click. That
 *    is a silent failure, because SSR output looks perfectly correct.
 *  · ws: — the HMR socket the dev server pushes updates over.
 *
 * Gated on NODE_ENV so `next build` emits the strict policy.
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self'${apiOrigin}${isDev ? ' ws: wss:' : ''}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          // Belt and braces alongside the robots metadata — a credential
          // surface should never be indexed, and a header cannot be missed
          // by a crawler that ignores meta tags.
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
        ],
      },
    ];
  },
};

export default nextConfig;
