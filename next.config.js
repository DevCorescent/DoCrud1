/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
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
