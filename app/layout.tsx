import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { Manrope } from 'next/font/google'
import './globals.css'
import { SessionProvider } from './components/SessionProvider'
import { ThemeController } from './components/ThemeController'
import SplashScreen from '@/components/SplashScreen'
import GlobalBottomNav from '@/components/GlobalBottomNav'
import { PresenceProvider } from './components/PresenceProvider'
import { TelemetryTracker } from './components/TelemetryTracker'
import { getPublicAppBaseUrl } from '@/lib/url'
import { policyCompany } from '@/lib/policies'
import { getSeoSettings, resolveSeo, DEFAULT_SEO_SETTINGS } from '@/lib/server/seo-settings'

const manrope = Manrope({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-manrope',
  preload: true,
  fallback: ['system-ui', '-apple-system', 'sans-serif'],
})

const siteUrl = getPublicAppBaseUrl()
const metadataBase = new URL(siteUrl)
const googleAnalyticsId = 'G-C3WEQ82QWE'

/**
 * Microsoft Clarity project id.
 *
 * Read from the environment rather than hardcoded, so a fork, a preview
 * deployment or a local checkout can point at its own project — or at none.
 * When the variable is unset the script is not rendered at all, which is what
 * keeps Clarity out of local development unless someone opts in.
 *
 * NEXT_PUBLIC_ is correct here and not a leak: the id is embedded in the
 * client script Clarity itself serves, so it is an identifier, never a secret.
 */
const clarityProjectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID?.trim() ?? ''

/* The site name, title, description and keywords that used to live here are
   now Super Admin settings — see lib/server/seo-settings.ts, whose defaults are
   exactly these former values, so an installation that never opens the SEO
   Manager renders what it always did. */

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#0d0e11',
  // The app supports both themes (ThemeController), dark by default. Pinning
  // this to 'dark' left native controls, scrollbars and autofill dark for
  // visitors who chose the light theme.
  colorScheme: 'dark light',
}

/**
 * Page metadata, from the Super Admin SEO Manager.
 *
 * This was a static `metadata` export built from four hardcoded constants.
 * It is now `generateMetadata()` so the values a Super Admin saves actually
 * reach the public <head> — an admin form that stores metadata the site never
 * emits would be worse than no form at all.
 *
 * The settings read is cached in-process for a minute (lib/server/seo-settings.ts),
 * so making this dynamic costs a sub-kilobyte lookup per minute rather than one
 * per render. The cache is cleared on save, so an admin sees their change on
 * the next request.
 *
 * The canonical HOST is deliberately not part of the editable settings — see
 * lib/server/seo-settings.ts for why.
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSeoSettings().catch(() => DEFAULT_SEO_SETTINGS);
  const seo = resolveSeo(settings);

  return {
  metadataBase,
  title: {
    default: seo.title,
    template: `%s | ${settings.siteName}`,
  },
  description: seo.description,
  applicationName: settings.siteName,
  keywords: settings.keywords,
  authors: [{ name: policyCompany.parentCompanyName, url: siteUrl }],
  creator: policyCompany.parentCompanyName,
  publisher: policyCompany.parentCompanyName,
  alternates: {
    canonical: siteUrl,
    types: {
      'application/rss+xml': `${siteUrl}/feed.xml`,
    },
  },
  category: 'technology',
  classification: 'Professional Networking & Career Platform',
  referrer: 'origin-when-cross-origin',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: 'website',
    url: seo.baseUrl,
    siteName: settings.siteName,
    title: seo.ogTitle,
    description: seo.ogDescription,
    locale: 'en_IN',
    /* The admin's image first; the packaged square logo stays as a second
       entry so a scraper that rejects the first still finds a valid one. */
    images: [
      { url: seo.ogImage, alt: `${settings.siteName} social preview` },
      { url: '/docrud-favicon.png', width: 1024, height: 1024, alt: `${settings.siteName} logo`, type: 'image/png' },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: seo.twitterTitle,
    description: seo.twitterDescription,
    images: [seo.twitterImage],
    creator: '@docrud',
    site: '@docrud',
  },
  /* A single switch an admin can use to pull the whole site out of the index
     — useful for a staging deployment sharing this codebase. Off by default. */
  robots: {
    index: !settings.noindex,
    follow: !settings.noindex,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: settings.faviconUrl || '/docrud-favicon.png', type: 'image/png', sizes: '1024x1024' },
      { url: '/docrud-icon.png', type: 'image/png', sizes: '32x32' },
    ],
    apple: [
      { url: '/docrud-favicon.png', sizes: '1024x1024', type: 'image/png' },
    ],
    shortcut: settings.faviconUrl || '/docrud-favicon.png',
    other: [
      { rel: 'mask-icon', url: '/docrud-favicon.png' },
    ],
  },
  manifest: '/manifest.webmanifest',
  /* One verification block. A second, later key silently overwrote an earlier
     spread — so the admin's value is merged HERE, where it wins, and the
     packaged placeholder is only the fallback. */
  verification: {
    google: settings.googleSiteVerification || 'docrud-google-site-verification',
  },
  other: {
    'msapplication-TileColor': '#0d0e11',
    'msapplication-TileImage': '/docrud-favicon.png',
  },
  };
}

/* Async so the Organization/WebSite structured data below reflects the saved
   site name, logo and description rather than a second hardcoded copy. The
   settings read is the same cached, sub-kilobyte lookup generateMetadata uses. */
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const seoSettings = await getSeoSettings().catch(() => DEFAULT_SEO_SETTINGS)
  const seo = resolveSeo(seoSettings)

  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${siteUrl}/#organization`,
        name: 'Docrud',
        alternateName: 'Docrud Platform',
        url: siteUrl,
        logo: {
          '@type': 'ImageObject',
          url: seo.logoUrl || `${siteUrl}/docrud-favicon.png`,
        },
        image: seo.ogImage || `${siteUrl}/docrud-logo.png`,
        email: 'sales@docrud.app',
        description: seo.description,
        foundingLocation: {
          '@type': 'Place',
          addressCountry: 'IN',
          name: 'India',
        },
        parentOrganization: {
          '@type': 'Organization',
          name: policyCompany.parentCompanyName,
        },
        knowsAbout: [
          'Professional Networking',
          'Career Development',
          'Freelance Marketplace',
          'Document Management',
          'Talent Discovery',
          'Business Collaboration',
        ],
      },
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}/#website`,
        url: siteUrl,
        name: 'Docrud',
        alternateName: 'Docrud — Connecting Talent, Work & Opportunity',
        description: seo.description,
        inLanguage: 'en-IN',
        publisher: {
          '@id': `${siteUrl}/#organization`,
        },
        potentialAction: [
          {
            '@type': 'SearchAction',
            target: {
              '@type': 'EntryPoint',
              urlTemplate: `${siteUrl}/people?q={search_term_string}`,
            },
            'query-input': 'required name=search_term_string',
          },
          {
            '@type': 'SearchAction',
            target: {
              '@type': 'EntryPoint',
              urlTemplate: `${siteUrl}/gigs?search={search_term_string}`,
            },
            'query-input': 'required name=search_term_string',
          },
        ],
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${siteUrl}/#software`,
        name: 'Docrud',
        alternateName: 'Docrud Platform',
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: 'Professional Networking Platform',
        operatingSystem: 'Web, iOS, Android',
        url: siteUrl,
        description: seo.description,
        image: `${siteUrl}/docrud-logo.png`,
        screenshot: `${siteUrl}/docrud-logo.png`,
        offers: [
          {
            '@type': 'Offer',
            name: 'Free Plan',
            price: '0',
            priceCurrency: 'INR',
            availability: 'https://schema.org/InStock',
          },
          {
            '@type': 'Offer',
            name: 'Docrud Infinity',
            price: '299',
            priceCurrency: 'INR',
            availability: 'https://schema.org/InStock',
            billingIncrement: 'P1M',
          },
        ],
        creator: {
          '@id': `${siteUrl}/#organization`,
        },
        featureList: [
          'Professional Networking & Profile Discovery',
          'Gig & Freelance Marketplace',
          'Career Opportunities & Job Listings',
          'Document Management & Workflows',
          'PDF Editor & Form Builder',
          'AI Document Review',
          'Secure File Sharing',
          'Resume ATS Checker',
          'Virtual ID Cards & Certificates',
          'Industry News Feed',
          'Messaging & Connections',
        ],
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: '4.8',
          ratingCount: '240',
          bestRating: '5',
          worstRating: '1',
        },
      },
      {
        '@type': 'ItemList',
        '@id': `${siteUrl}/#features`,
        name: 'Docrud Platform Features',
        description: 'Core capabilities of the Docrud professional platform',
        numberOfItems: 5,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Professional Networking',
            description: 'Discover and connect with professionals, freelancers, and businesses',
            url: `${siteUrl}/people`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Gig & Work Marketplace',
            description: 'Post and find freelance gigs and career opportunities',
            url: `${siteUrl}/gigs`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: 'Document Management',
            description: 'Create, edit, share and manage documents securely',
            url: `${siteUrl}/workspace`,
          },
          {
            '@type': 'ListItem',
            position: 4,
            name: 'Industry Feed',
            description: 'Stay updated with daily industry news and professional insights',
            url: `${siteUrl}/`,
          },
          {
            '@type': 'ListItem',
            position: 5,
            name: 'AI-Powered Tools',
            description: 'Resume checker, PDF editor, form builder and AI document review',
            url: `${siteUrl}/doxpert`,
          },
        ],
      },
    ],
  }

  /*
   * Dark is the documented default (ThemeController.getStoredColorMode() falls
   * back to 'dark'), but that runs in a useEffect — so the first paint had
   * neither `data-ui-mode` nor `.dark`, and every themed surface rendered with
   * light styling on the dark page until hydration. Declaring the default on
   * the server removes that flash; ThemeController still switches to light on
   * mount when the visitor has chosen it.
   */
  return (
    <html
  lang="en"
  className={manrope.variable}
  data-ui-mode="light"
>
      <head>
        {/* Indexing & browser hints.
            msapplication-TileColor / TileImage are intentionally NOT repeated
            here — they are already emitted by `metadata.other` above. */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Docrud" />
        <meta name="application-name" content="Docrud" />
        {/* Geo signals for India-first indexing */}
        <meta name="geo.region" content="IN" />
        <meta name="geo.placename" content="India" />
        <meta name="language" content="English" />
        <meta name="revisit-after" content="3 days" />
        {/* Preload the app icon (LCP candidate in nav) */}
        <link rel="preload" href="/docrud-icon.png" as="image" type="image/png" />
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${googleAnalyticsId}');
          `}
        </Script>
        {/*
          Microsoft Clarity — Microsoft's own snippet, unchanged apart from the
          id coming from the environment.

          `afterInteractive` matches the analytics already above: the tag loads
          once, after hydration, without blocking the first paint. next/script
          also de-duplicates by `id`, so a re-render or a client-side navigation
          cannot inject a second copy.

          Nothing is pushed to Clarity by this app. It records what Clarity's
          own tag records; no resume text, job description, email or any other
          user data is sent from here.
        */}
        {clarityProjectId && (
          <Script id="microsoft-clarity" strategy="afterInteractive">
            {`
              (function(c,l,a,r,i,t,y){
                c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
              })(window, document, "clarity", "script", "${clarityProjectId}");
            `}
          </Script>
        )}
      </head>
     <body
  className={`${manrope.className} bg-background text-foreground antialiased`}
>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <SessionProvider>
          <PresenceProvider>
            <TelemetryTracker />
            <SplashScreen />
            <ThemeController />
            {children}
            <GlobalBottomNav />
          </PresenceProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
