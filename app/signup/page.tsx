import { redirect } from 'next/navigation';

/**
 * /signup is retired as a user-facing page.
 *
 * Account creation now lives entirely on /onboarding, where the
 * Individual/Business toggle selects the existing signup form. This route is
 * kept only as a permanent redirect so links shared before the move — referral
 * links used `/signup?ref=`, pricing used `/signup?plan=` — keep working.
 *
 * Every legitimate parameter is forwarded: `type` picks the toggle, and
 * `ref`/`plan`/`config` carry through to the onboarding signup screen. `type`
 * is never trusted as the account type — that is written server-side by whichever
 * signup route the chosen form posts to.
 */

export const dynamic = 'force-dynamic';

export default function SignupRedirect({
  searchParams,
}: {
  searchParams?: { plan?: string; config?: string; ref?: string; type?: string };
}) {
  const params = new URLSearchParams();
  params.set('start', 'signup');
  if (searchParams?.type === 'business') params.set('type', 'business');
  if (searchParams?.ref) params.set('ref', searchParams.ref);
  if (searchParams?.plan) params.set('plan', searchParams.plan);
  if (searchParams?.config) params.set('config', searchParams.config);
  redirect(`/onboarding?${params.toString()}`);
}
