import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { isSearchCrawlerUserAgent } from '@/lib/search-crawler';
import { getAuthSecret } from '@/lib/auth-secret';

/* ─── Paths that unverified-but-authenticated users may still access ──────── */
const UNVERIFIED_ALLOWED_PREFIXES = [
  '/onboarding',
  '/login',
  '/api/auth',
  '/api/onboarding/send-otp',
  '/api/onboarding/verify-otp',
  /* Creating an account from onboarding: the code is mailed by /start and the
     account is created by /verify. Both run for a caller with no session at
     all, which is the point — there is nothing to have a session for yet. */
  '/api/onboarding/signup',
  '/api/individual/signup',
  '/_next',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ─── 1. Fast cookie-only gate for the homepage ────────────────────────────
  // Redirect unauthenticated visitors away from the home feed before Next.js
  // compiles the heavy PublicHomepage module graph. Cookie-only check —
  // no network calls, no heavy imports.
  if (pathname === '/') {
    const hasSession =
      request.cookies.has('next-auth.session-token') ||
      request.cookies.has('__Secure-next-auth.session-token');
    const isGuest = request.cookies.get('guestMode')?.value === '1';

    if (!hasSession && !isGuest && !isSearchCrawlerUserAgent(request.headers.get('user-agent'))) {
      return NextResponse.redirect(new URL('/onboarding', request.url));
    }
  }

  // ─── 2. Email-verification gate for individual accounts ───────────────────
  // Only applies to page routes (not API routes — they have their own guards).
  // Unverified individual users are sent back to /onboarding regardless of
  // which page they try to reach.
  const isApiRoute = pathname.startsWith('/api/');
  const isAllowedPath = UNVERIFIED_ALLOWED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );

  if (!isApiRoute && !isAllowedPath) {
    /* The SAME secret the session cookie was signed with. Reading
       process.env.NEXTAUTH_SECRET implicitly — which is what getToken does when
       no secret is passed — silently returned null wherever the variable was
       unset, which turned this gate off without a word. */
    const token = await getToken({ req: request, secret: getAuthSecret() });
    if (
      token &&
      token.accountType === 'individual' &&
      token.emailVerified !== true
    ) {
      return NextResponse.redirect(new URL('/onboarding', request.url));
    }
  }

  return NextResponse.next({ request: { headers: request.headers } });
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
