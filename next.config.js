/** @type {import('next').NextConfig} */
/* ── Content Security Policy ───────────────────────────────────────────────
   Built from the origins this application ACTUALLY loads, found by inspection
   rather than copied from a template:

     Turnstile   https://challenges.cloudflare.com   (script + iframe)
     Razorpay    https://checkout.razorpay.com, https://api.razorpay.com
     Analytics   googletagmanager, google-analytics, clarity.ms
     Fonts       next/font self-hosts Manrope — no external font origin needed
     Images      R2 assets, plus arbitrary https avatars from job/profile data

   WHY THIS IS SPLIT IN TWO
   -----------------------
   Four directives are ENFORCED because they cannot break a page that is
   already working — they forbid things this app never does:

     frame-ancestors  clickjacking (agrees with the X-Frame-Options below)
     base-uri         a injected <base> re-pointing every relative URL
     object-src       plugin execution
     form-action      a form silently POSTing credentials off-origin

   The script/style/img directives ship as REPORT-ONLY on purpose. app/layout.tsx
   carries an inline GA bootstrap, so enforcing script-src today needs either
   'unsafe-inline' — which is most of the protection given away — or a
   per-request nonce threaded through middleware. Turning enforcement on blind
   would risk white-screening production on an origin nobody remembered.
   Report-Only collects real violations first, at zero risk to users.

   TODO(PHASE-2, security): add a middleware nonce, confirm the report endpoint
   is quiet for a full traffic cycle, then promote these to enforcing and drop
   'unsafe-inline' from script-src. */
/* `*.clarity.ms` is a wildcard because Microsoft Clarity serves its tag from
   scripts.clarity.ms and beacons to u.clarity.ms — both found by running the
   report-only policy against real page loads, not guessed. Narrower hosts would
   have broken analytics the moment this policy was enforced.

   `www.google.com` is in connect-src for the same reason: GA4 beacons to
   /g/collect on that host as well as google-analytics.com. Each of these was
   found by loading real pages and reading the violation reports — which is the
   entire argument for shipping report-only first. Keep watching the reports on
   production traffic before promoting this policy to enforcing. */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://checkout.razorpay.com https://www.googletagmanager.com https://www.google-analytics.com https://*.clarity.ms",
  /* Next injects critical CSS inline; styled-jsx does the same. */
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://challenges.cloudflare.com https://api.razorpay.com https://www.google-analytics.com https://*.clarity.ms https://*.google-analytics.com https://www.google.com",
  "frame-src 'self' https://challenges.cloudflare.com https://checkout.razorpay.com",
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
].join('; ');

/** Enforced now — these forbid behaviour the app does not rely on. */
const CSP_ENFORCED = [
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy', value: CSP_ENFORCED },
  { key: 'Content-Security-Policy-Report-Only', value: CSP_REPORT_ONLY },
  /* HSTS is PRODUCTION-ONLY. Sent on localhost it would be cached by the
     browser for the whole `localhost` origin and force every other local
     project onto https — breaking development far beyond this repository.
     Two years, subdomains included, preload-eligible. */
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
];

/* The pdfjs worker, in both the forms pdf-parse may ask for. Shared so a route
   cannot be added with a half-complete pair. */
const PDF_WORKER_FILES = [
  './node_modules/pdfjs-dist/build/pdf.worker.mjs',
  './node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
];

const nextConfig = {
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,

  experimental: {
    serverComponentsExternalPackages: [
      'puppeteer',
      'puppeteer-core',
      'pdf-parse',
      'mammoth',
      'pdfjs-dist',
      'pg',
      '@xmldom/xmldom',
    ],
    // Force Vercel's file tracer to include the pdfjs worker file.
    // Without this, the tracer skips it because the path is computed at runtime
    // (string concatenation), not a static import — so it never reaches the lambda.
    /* Every route that can parse a PDF is traced, not just one.
       `pdf-parse` reaches `pdfjs-dist`'s worker through a path it builds at
       runtime by string concatenation, so Vercel's file tracer cannot see the
       dependency. That was already known and fixed for ONE route; the list was
       simply never extended as ten more routes began parsing documents.

       HONESTY NOTE: this is a consistency fix for a real inconsistency, NOT a
       proven cause of the reported 422. Removing these worker files locally
       did NOT break pdf-parse (it falls back to a main-thread worker), so the
       production failure is something else — see the stage= diagnostics in
       lib/server/document-parser.ts, which now name it. This stays because one
       traced route out of twelve is a latent bug either way. */
    outputFileTracingIncludes: {
      '/api/profile/upload-resume': PDF_WORKER_FILES,
      '/api/onboarding/resume-extract': PDF_WORKER_FILES,
      '/api/onboarding/parse-resume': PDF_WORKER_FILES,
      '/api/ats/upload': PDF_WORKER_FILES,
      '/api/hiring/applications': PDF_WORKER_FILES,
      '/api/ai/document-parser': PDF_WORKER_FILES,
      '/api/ai/document-visualizer': PDF_WORKER_FILES,
      '/api/ai/doxpert/preview': PDF_WORKER_FILES,
      '/api/home-chat/ingest': PDF_WORKER_FILES,
      '/api/pdf-editor/convert': PDF_WORKER_FILES,
      '/api/pdf-editor/assist': PDF_WORKER_FILES,
      '/api/public/doxpert/demo': PDF_WORKER_FILES,
    },
    optimizePackageImports: [
      '@supabase/ssr',
      '@supabase/supabase-js',
      '@supabase/auth-js',
      'lucide-react',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toast',
    ],
  },

  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 3600,
  },


  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      {
        // Dev: no-store so browser always re-fetches on full reload.
        // In production, chunks are content-hashed so immutable is safe.
        source: '/_next/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: process.env.NODE_ENV === 'development'
              ? 'no-store'
              : 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // Cache public images for 1 day
        source: '/(.*)\\.(png|jpg|jpeg|gif|webp|avif|svg|ico)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
      {
        // Cache fonts immutably
        source: '/(.*)\\.(woff|woff2|ttf|otf|eot)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
