import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import NextDynamic from 'next/dynamic';
import { buildPageMetadata } from '@/lib/seo';
import { getThemeSettings } from '@/lib/server/settings';
import { getAuthSession } from '@/lib/server/auth';
import { isSearchCrawlerUserAgent } from '@/lib/search-crawler';
import { getSeoSettings, resolveSeo, DEFAULT_SEO_SETTINGS } from '@/lib/server/seo-settings';
import { getPublishedHiringJobs } from '@/lib/server/hiring';
import { getHeroBanners, heroPreloads } from '@/lib/server/hero-banners';

export const dynamic = 'force-dynamic';

/* Client-only: avoids SSR/hydration mismatches from auth-conditional rendering.

   The loading shim matches the page's own ground colour rather than the old
   dark one — a dark flash before a light page is more jarring than no
   placeholder at all. */
const DiscoverHome = NextDynamic(() => import('@/components/home/discover/DiscoverHome'), {
  ssr: false,
  loading: () => <div className="h-screen w-full" style={{ background: '#eaf0fa' }} />,
});

/**
 * Homepage metadata.
 *
 * Page metadata OVERRIDES layout metadata in Next.js, so a hardcoded title
 * here silently beat the Super Admin's homepage title — the SEO Manager saved
 * a value the homepage never showed. Reading the settings here is what makes
 * the Homepage section of the manager real.
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSeoSettings().catch(() => DEFAULT_SEO_SETTINGS);
  const seo = resolveSeo(settings);
  const base = buildPageMetadata({
    title: seo.title,
    description: seo.description,
    path: '/',
    image: seo.ogImage,
    keywords: settings.keywords,
  });

  /* Page metadata OVERRIDES layout metadata in Next.js, so the layout's
     carefully resolved social tags were being replaced here by ones
     `buildPageMetadata` synthesised from the title alone — which is why the
     SEO Manager's Open Graph and Twitter fields had no effect on the homepage,
     and why og:image was serving the favicon. The admin's resolved values are
     re-applied on top. */
  return {
    ...base,
    openGraph: {
      ...base.openGraph,
      title: seo.ogTitle,
      description: seo.ogDescription,
      images: [{ url: seo.ogImage, width: 1200, height: 630, alt: seo.ogTitle }],
    },
    twitter: {
      ...base.twitter,
      title: seo.twitterTitle,
      description: seo.twitterDescription,
      images: [seo.twitterImage || seo.ogImage],
    },
  };
}

export default async function Home() {
  const cookieStore = await cookies();
  const isGuest = cookieStore.get('guestMode')?.value === '1';

  /* The homepage config joins the batch: it is a sub-kilobyte cached read, and
     fetching it here means the marquee, nav and footer no longer wait for a
     round trip after hydration to learn their own configuration. */
  /* The hero's banners join the batch for the same reason the config did, only
     more so: the hero is the first thing above the fold, and it used to learn
     what it was from a client fetch that did not leave the browser until 7.4
     seconds into the load — it could not be issued until the whole homepage
     component had downloaded, parsed and mounted, and by then it was
     twenty-first in a queue of twenty-five. It is a sub-kilobyte cached read
     here. */
  const [session, themeSettings, hero] = await Promise.all([
    getAuthSession().catch(() => null),
    getThemeSettings().catch(() => ({ softwareName: 'Docrud', accentLabel: 'Platform' })),
    getHeroBanners().catch(() => ({ banners: [], heading: '' })),
  ]);

  /* The same crawler exemption the middleware applies. Without it a search
     engine cleared the middleware gate only to be redirected here instead —
     to /onboarding, which robots.txt disallows. Rendering the full homepage
     for a crawler is the point: it is the content Google needs to index. */
  const isCrawler = isSearchCrawlerUserAgent((await headers()).get('user-agent'));

  if (!session && !isGuest && !isCrawler) {
    redirect('/onboarding');
  }

  /* There is no first-run gate here any more. The post-auth welcome → interests
     → first-post flow at /onboarding/start has been removed: /onboarding now
     collects roles and skills BEFORE the account exists, so that flow asked a
     signed-in user to describe themselves a second time. Removing it also takes
     a per-request profile read off the path to the homepage's first byte.

     `onboardingDone` and `interests` are deliberately KEPT on the profile —
     existing accounts carry real values and the recommendation engine reads
     `interests`. Nothing writes `onboardingDone` from the homepage now; it is
     simply no longer consulted here. */


  /* Start the job corpus loading, but DO NOT await it.
     On a cold process the corpus is a multi-megabyte read, and the browser's
     recommendation request arrives a second or two after hydration. Kicking the
     load off here means that request joins an already-running load through the
     existing single-flight instead of starting from zero. Deliberately not
     awaited and deliberately caught: the homepage must never wait on ranking,
     and a failure here is simply a cache that stays cold. */
  void getPublishedHiringJobs().catch(() => undefined);

  /* The session is already resolved here. Passing the viewer down means the
     summary section does not have to wait for next-auth's client-side
     /api/auth/session round trip before it may start fetching its counts —
     that request was sitting in front of both numbers on every load. */
  const initialViewer = session?.user
    ? { name: session.user.name ?? null, email: session.user.email ?? null }
    : null;


  return (
    <>
      {/* The first slide's artwork, fetched alongside the HTML instead of
          after it.

          The picture used to start downloading at 8.7 seconds, because it
          could not be known until the banners had been fetched, which could not
          happen until the homepage component had mounted. A preload in the head
          is a request the browser makes immediately, in parallel with the
          JavaScript rather than behind it — so by the time the slider mounts,
          its picture is usually already decoded.

          Only the first slide, and only the shape that will actually be
          painted: `media` matches the same 640px break the stylesheet uses to
          choose between the wide and tall artwork, so the phone never pulls the
          desktop banner and the desktop never pulls the phone's. */}
      {heroPreloads(hero.banners).map((p) => (
        <link key={p.href + p.media} rel="preload" as="image" href={p.href} media={p.media} fetchPriority="high" />
      ))}

      <DiscoverHome
        softwareName={themeSettings.softwareName}
        guestMode={!session && isGuest}
        viewer={initialViewer}
        banners={hero.banners}
      />
    </>
  );
}
