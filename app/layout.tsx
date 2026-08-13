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

const siteTitle = 'Docrud — Connecting Talent, Work & Opportunity'
const siteTitleFull = 'Docrud — Connecting Talent, Work & Opportunity | Professional Platform for Careers, Networking & Documents'
const siteDescription =
  'Docrud is a modern professional platform designed to bring together careers, networking, documents, and opportunities into one intelligent ecosystem. Built for professionals, freelancers, job seekers, and growing businesses, Docrud enables seamless collaboration, professional discovery, daily industry updates, secure document workflows, and meaningful connections — all in one place.'

const siteKeywords = [
  // Platform identity
  'Docrud',
  'professional platform',
  'professional networking',
  'talent network',
  'career platform India',
  // Career & jobs
  'job opportunities',
  'job search platform',
  'career growth',
  'hire freelancers',
  'gig marketplace',
  'freelance jobs India',
  'talent discovery',
  // Networking
  'professional community',
  'business networking',
  'industry connections',
  'professional profiles',
  'connect with professionals',
  // Documents & tools
  'document management software',
  'pdf editor online',
  'form builder',
  'secure file sharing',
  'AI document review',
  'resume ATS checker',
  'virtual id cards',
  'e-certificate generator',
  'document workflow',
  // Broader
  'collaboration platform',
  'freelancer platform',
  'professional ecosystem',
  'opportunity marketplace',
]

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

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: siteTitle,
    template: '%s | Docrud',
  },
  description: siteDescription,
  applicationName: 'Docrud',
  keywords: siteKeywords,
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
    url: siteUrl,
    siteName: 'Docrud',
    title: siteTitleFull,
    description: siteDescription,
    locale: 'en_IN',
    images: [
      {
        url: '/docrud-logo.png',
        width: 2046,
        height: 769,
        alt: 'Docrud — Connecting Talent, Work & Opportunity',
        type: 'image/png',
      },
      {
        url: '/docrud-favicon.png',
        width: 1024,
        height: 1024,
        alt: 'Docrud Logo',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
    images: ['/docrud-logo.png'],
    creator: '@docrud',
    site: '@docrud',
  },
  robots: {
    index: true,
    follow: true,
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
      { url: '/docrud-favicon.png', type: 'image/png', sizes: '1024x1024' },
      { url: '/docrud-icon.png', type: 'image/png', sizes: '32x32' },
    ],
    apple: [
      { url: '/docrud-favicon.png', sizes: '1024x1024', type: 'image/png' },
    ],
    shortcut: '/docrud-favicon.png',
    other: [
      { rel: 'mask-icon', url: '/docrud-favicon.png' },
    ],
  },
  manifest: '/manifest.webmanifest',
  verification: {
    google: 'docrud-google-site-verification',
  },
  other: {
    'msapplication-TileColor': '#0d0e11',
    'msapplication-TileImage': '/docrud-favicon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
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
          url: `${siteUrl}/docrud-favicon.png`,
          width: 1024,
          height: 1024,
        },
        image: `${siteUrl}/docrud-logo.png`,
        email: 'sales@docrud.app',
        description: siteDescription,
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
        description: siteDescription,
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
        description: siteDescription,
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
