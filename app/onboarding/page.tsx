/**
 * /onboarding — the pre-auth signup funnel.
 *
 * The 3,700-line implementation this route has always rendered now lives
 * verbatim in ./_legacy/LegacyOnboardingPage.tsx. Nothing about its behaviour
 * changed; it was moved so that the new onboarding UI can be swapped in here
 * as a one-line edit, with the old flow still one line away from being
 * restored. `_legacy` is underscore-prefixed, so Next.js does not route it.
 *
 * This route is a redirect target across the app (middleware.ts, app/page.tsx,
 * and every `signOut({ callbackUrl: '/onboarding' })`), so it must keep
 * rendering a working funnel until the replacement flow is authenticated
 * end to end.
 */
export { default } from './_legacy/LegacyOnboardingPage';
