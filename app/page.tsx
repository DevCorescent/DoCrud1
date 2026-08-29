import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import NextDynamic from 'next/dynamic';
import { buildPageMetadata } from '@/lib/seo';
import { getThemeSettings } from '@/lib/server/settings';
import { getAuthSession, resolveSessionUserId } from '@/lib/server/auth';
import { getProfileFields } from '@/lib/server/user-profiles';
import { getHomepageConfig } from '@/lib/server/homepage-config';
import { peekHiringCompanies } from '@/lib/server/hiring-companies';
import { getPublishedHiringJobs } from '@/lib/server/hiring';
import { seedViewerCounts } from '@/lib/server/recommendation-cache';

export const dynamic = 'force-dynamic';

// Client-only: avoids SSR/hydration mismatches from auth-conditional rendering
const PublicHomepage = NextDynamic(() => import('@/components/PublicHomepage'), {
  ssr: false,
  loading: () => <div className="h-screen w-full bg-[#0D0D0F]" />,
});

export const metadata = buildPageMetadata({
  title: 'Docrud | Document Management, Forms, PDF Editor, AI Tools & Secure File Sharing',
  description:
    'Docrud helps teams create documents, build forms, edit PDFs, review files with AI, share securely, and manage daily workflows from one workspace.',
  path: '/',
  keywords: ['docrud', 'document management software', 'pdf editor', 'secure file sharing', 'form builder', 'ai document review'],
});

export default async function Home() {
  const cookieStore = await cookies();
  const isGuest = cookieStore.get('guestMode')?.value === '1';

  /* The homepage config joins the batch: it is a sub-kilobyte cached read, and
     fetching it here means the marquee, nav and footer no longer wait for a
     round trip after hydration to learn their own configuration. */
  const [session, themeSettings, hpConfig] = await Promise.all([
    getAuthSession().catch(() => null),
    getThemeSettings().catch(() => ({ softwareName: 'Docrud', accentLabel: 'Platform' })),
    getHomepageConfig().catch(() => null),
  ]);

  if (!session && !isGuest) {
    redirect('/onboarding');
  }

  // First-run gate: an individual whose email is verified but who has never been
  // through onboarding gets the welcome → interests → first-post flow once.
  // Guests, business accounts and anyone already onboarded fall straight through.
  const needsOnboarding = Boolean(
    session?.user?.id
    && session.user.accountType === 'individual'
    && session.user.emailVerified === true
    && (await getProfileFields(session.user.id, ['onboardingDone'])
      .then((profile) => profile.onboardingDone !== true)
      .catch(() => false)),
  );

  if (needsOnboarding) {
    redirect('/onboarding/start');
  }

  /* Warm cache only — deliberately NOT awaited into existence. Deriving this
     cold means reading the whole 2.7 MB job store, which must never sit on the
     path to first byte; null simply lets the browser fetch it as before. */
  const initialCompanies = peekHiringCompanies();

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

  /* The two headline counts, seeded from the LAST computed values for this
     viewer — never recomputed here. Producing them means running the
     personalised ranking, which is tens of seconds on a cold job cache and must
     never sit in front of a server render; `seedViewerCounts` only ever reads
     what a recommendation route already worked out.

     A null simply means "not known cheaply yet", and the card fetches as it
     always did. Keyed by this session's user id, so one viewer's numbers can
     never seed another's page. */
  /* Keyed with the SAME resolver the recommendation routes use. Keying on
     `session.user.id` alone would silently miss for any session where that
     field is absent — the routes fall back to a stored-user lookup, and a
     mismatched key means the seed never hits. */
  const viewerId = session?.user ? await resolveSessionUserId(session).catch(() => null) : null;
  const seededCounts = viewerId
    ? await seedViewerCounts(viewerId).catch(() => ({ jobs: null, people: null }))
    : { jobs: null, people: null };

  return (
    <PublicHomepage
      softwareName={themeSettings.softwareName}
      accentLabel={themeSettings.accentLabel}
      guestMode={!session && isGuest}
      initialHpConfig={hpConfig}
      initialCompanies={initialCompanies}
      initialViewer={initialViewer}
      initialJobCount={seededCounts.jobs}
      initialPeopleCount={seededCounts.people}
    />
  );
}
