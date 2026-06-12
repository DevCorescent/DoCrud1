import type { MetadataRoute } from 'next';
import { getPublicAppBaseUrl } from '@/lib/url';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getPublicAppBaseUrl();

  /** Private routes that should never be indexed */
  const disallow = [
    '/api/',
    '/onboarding',
    '/admin',
    '/settings',
    '/profile/edit',
    '/billing',
    '/workspace',
    '/ddrive',
    '/docword',
    '/docsheets',
    '/pdf-editor/workspace',
    '/forms/builder',
    '/e-sign',
    '/scratchpad',
    '/mail',
    '/team',
    '/certificates/studio',
    '/hiring',
    '/businesses/create',
    '/businesses/*/edit',
    '/template-marketplace/*/publish',
    '/talent/shortlists',
    '/open/',       // direct-access file-locker open URLs
    '/_next/',
  ];

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow,
      },
      {
        // Allow AI crawlers to index public content
        userAgent: 'GPTBot',
        allow: [
          '/blog/',
          '/gigs/',
          '/jobs/',
          '/published/',
          '/businesses/',
          '/talent/',
          '/people',
          '/template-marketplace/',
        ],
        disallow,
      },
      {
        userAgent: 'Google-Extended',
        allow: '/',
        disallow,
      },
      {
        // Block archive.org from caching sensitive pages
        userAgent: 'ia_archiver',
        disallow: ['/api/', '/onboarding', '/settings', '/billing'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
