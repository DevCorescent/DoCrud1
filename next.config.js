/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
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
    outputFileTracingIncludes: {
      '/api/profile/upload-resume': [
        './node_modules/pdfjs-dist/build/pdf.worker.mjs',
        './node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
      ],
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
