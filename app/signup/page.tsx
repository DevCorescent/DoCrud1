import HomepageNav from '@/components/HomepageNav';
import BusinessSignupForm from '@/components/BusinessSignupForm';
import IndividualSignupForm from '@/components/IndividualSignupForm';
import SignupAccountSwitch from '@/components/SignupAccountSwitch';
import DarkModeActivator from '@/components/DarkModeActivator';
import { buildPageMetadata } from '@/lib/seo';
import { getThemeSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

export const metadata = buildPageMetadata({
  title: 'Business Signup | Create Your Docrud Workspace',
  description: 'Create a Docrud business workspace for documents, AI tools, forms, secure sharing, and team workflows.',
  path: '/signup',
  keywords: ['business signup', 'create workspace', 'docrud signup'],
  noIndex: true,
});

export default async function SignupPage({
  searchParams,
}: {
  searchParams?: { plan?: string; config?: string; ref?: string; type?: string };
}) {
  const themeSettings = await getThemeSettings();

  /* Account type is chosen here, never inferred.
     Both signup flows already existed — /api/individual/signup writes
     accountType 'individual', /api/saas/signup writes 'business', and auth.ts
     carries that through to the session. What was missing was the choice: this
     page went straight to the business form, and the individual form lived at
     a separate URL a new user had no way to discover.

     `type` only picks which existing form to render. It is never trusted as
     the account type — that is set server-side by whichever signup route the
     form posts to. A bogus ?type= simply falls back to the chooser. */
  const chosen = searchParams?.type === 'business' || searchParams?.type === 'individual'
    ? searchParams.type
    : null;


  return (
    <div className="relative min-h-screen bg-[#08090a] text-white">
      <DarkModeActivator />

      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute left-[20%] top-[15%] h-[600px] w-[600px] rounded-full bg-indigo-600/[0.07] blur-[160px]"
          style={{ animation: 'obDrift1 22s ease-in-out infinite' }} />
        <div className="absolute right-[10%] bottom-[10%] h-[450px] w-[450px] rounded-full bg-emerald-600/[0.06] blur-[140px]"
          style={{ animation: 'obDrift2 28s ease-in-out infinite 6s' }} />
        <div className="absolute left-[55%] top-[50%] h-[380px] w-[380px] rounded-full bg-violet-600/[0.05] blur-[120px]"
          style={{ animation: 'obDrift3 20s ease-in-out infinite 3s' }} />
        <div className="absolute inset-0 opacity-[0.018] [background-image:linear-gradient(rgba(255,255,255,0.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:72px_72px]" />
      </div>

      {/* Nav */}
      <div className="relative z-10">
        <HomepageNav
          softwareName={themeSettings.softwareName}
          accentLabel={themeSettings.accentLabel}
        />
      </div>

      {/* Form */}
      <main className="relative z-10 px-3 py-8 sm:px-5 sm:py-10 lg:px-8">
        <div className="mx-auto w-full max-w-5xl">
          {/* One frontend, one toggle. The account context selects which of
              the two existing forms renders inside the SAME page shell — same
              background, nav, container and spacing either way. `type` never
              becomes the account type: that is written server-side by whichever
              signup route the form posts to. */}
          <SignupAccountSwitch
            initial={chosen ?? 'individual'}
            business={
              <BusinessSignupForm
                initialPlanId={searchParams?.plan}
                initialConfig={searchParams?.config}
                initialReferralCode={searchParams?.ref}
                softwareName={themeSettings.softwareName}
              />
            }
            individual={
              <IndividualSignupForm
                initialPlanId={searchParams?.plan}
                initialConfig={searchParams?.config}
                initialReferralCode={searchParams?.ref}
              />
            }
          />
        </div>
      </main>
    </div>
  );
}
