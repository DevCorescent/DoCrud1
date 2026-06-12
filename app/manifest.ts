import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Docrud — Connecting Talent, Work & Opportunity',
    short_name: 'Docrud',
    description: 'A modern professional platform for careers, networking, documents, and opportunities — all in one intelligent ecosystem.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0d0e11',
    theme_color: '#0d0e11',
    orientation: 'portrait-primary',
    categories: ['business', 'productivity', 'social'],
    lang: 'en-IN',
    dir: 'ltr',
    icons: [
      {
        src: '/docrud-favicon.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/docrud-favicon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/docrud-favicon.png',
        sizes: '1024x1024',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Explore People',
        short_name: 'People',
        description: 'Discover professionals and talent',
        url: '/people',
        icons: [{ src: '/docrud-favicon.png', sizes: '192x192' }],
      },
      {
        name: 'Browse Gigs',
        short_name: 'Gigs',
        description: 'Find freelance work and opportunities',
        url: '/gigs',
        icons: [{ src: '/docrud-favicon.png', sizes: '192x192' }],
      },
    ],
  }
}
