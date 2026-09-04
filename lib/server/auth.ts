import { type NextAuthOptions, getServerSession } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { User } from '@/types/document';
import { normalizeEmail, verifyPassword } from '@/lib/server/security';
import { rateLimit, refundRateLimit, RATE_POLICIES } from '@/lib/server/security/rate-limit';
import { isCaptchaConfigured, verifyCaptcha } from '@/lib/server/security/captcha';
import { verifyLoginGrant } from '@/lib/server/security/login-grant';
import { applyRoadmapPromotionToSubscription, getDefaultPublicPlan, getEffectiveSaasPlanForUser, isSubscriptionPeriodExpired } from '@/lib/server/saas-plans';
import { buildPolicyAcceptance } from '@/lib/policy-consent';
import { getAuthSettings, getAuthSettingsSync } from '@/lib/server/settings';
import { endUserPresence, getStoredUsers, getStoredUserByEmail, saveStoredUsers, upsertStoredUser, type StoredUser } from '@/lib/server/users';
import { getProfileData, getProfileFields, updateProfileData } from '@/lib/server/user-profiles';
import { readOAuthIntent, type OAuthIntent } from '@/lib/server/oauth-intent';

export type { StoredUser };
export { getStoredUsers, saveStoredUsers };

function getAuthSecret() {
  return process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
}

function normalizeLoginId(value: string) {
  return value.trim().toLowerCase();
}

function getGoogleProviderConfig() {
  // Env vars take priority — set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in Vercel/local .env
  const envId     = process.env.GOOGLE_CLIENT_ID?.trim();
  const envSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (envId && envSecret) {
    return { clientId: envId, clientSecret: envSecret };
  }
  // Fall back to admin-panel settings stored in DB
  const settings = getAuthSettingsSync();
  if (!settings.googleEnabled || !settings.googleClientId || !settings.googleClientSecret) {
    return null;
  }
  return { clientId: settings.googleClientId, clientSecret: settings.googleClientSecret };
}

/** Warm the auth-settings cache from DB so getAuthSettingsSync() returns accurate values. */
async function warmAuthSettingsCache() {
  try {
    await getAuthSettings();
  } catch {
    // Non-fatal — cached defaults will be used
  }
}

/** Best-effort referral association for a brand-new Google account. */
async function activateGoogleReferral(userId: string, email: string, referralCode?: string) {
  if (!referralCode) return;
  try {
    const origin = (process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim();
    /* Lazy import: referrals.ts imports this module, so a static import here
       would form a cycle that breaks module initialization at build time. */
    const { processProfileActivation } = await import('@/lib/server/referrals');
    await processProfileActivation({ refereeUserId: userId, refereeEmail: email, referralCode, origin });
  } catch (err) {
    console.error('[auth] google referral activation failed (non-fatal):', err);
  }
}

/**
 * Find-or-create the user behind a Google identity.
 *
 * `intent` carries the account type the user chose at the button (from the
 * server-set intent cookie), and is honoured ONLY when creating a brand-new
 * account. An existing account keeps its stored type untouched — a Google login
 * never converts an individual into a business or vice-versa; a type mismatch is
 * surfaced to the user after sign-in and the session is dropped, exactly like
 * the credentials login guard. This is the single account-type authority; the
 * value is never taken from a request body.
 */
/**
 * The display name for a Google sign-in.
 *
 * ═══ THE PROVIDER AUTHENTICATES; ONBOARDING DESCRIBES ═══
 *
 * Google establishes WHO is signing in. It does not get to say what the person
 * is called. Someone who typed "Yash" during onboarding and then authenticated
 * with an account Google labels "Honey Kumar" must stay Yash — the email is the
 * identity, the onboarding answer is the profile.
 *
 * The order below is that rule, and nothing else:
 *
 *   1. The name already stored. For an existing account this is the name the
 *      person chose — through onboarding or by editing their profile — and a
 *      later sign-in is not a request to change it. This line is the bug fix:
 *      it used to be `profile.name || existing.name`, so EVERY Google login
 *      re-imported Google's name and silently undid the onboarding answer.
 *   2. The onboarding answer, for an account being created right now. Using it
 *      here means the account is correct from the moment it exists, rather than
 *      being created wrong and corrected a moment later by the handoff.
 *   3. Google's name, only when there is genuinely nothing else to go on.
 *   4. The local part of the email, as the last resort.
 *
 * Nothing here renames an existing profile; it only stops one being renamed.
 */
function googleDisplayName(
  stored: string | null | undefined,
  intent: OAuthIntent,
  providerName: string | null | undefined,
  email: string,
): string {
  return stored?.trim()
    || intent.onboarding?.name?.trim()
    || providerName?.trim()
    || email.split('@')[0];
}

async function upsertGoogleUser(
  profile: { email: string; name?: string | null },
  intent: OAuthIntent,
) {
  const normalizedEmail = normalizeEmail(profile.email);
  const existing = await getStoredUserByEmail(normalizedEmail);
  const now = new Date().toISOString();

  if (existing) {
    // Existing account: log in, refresh metadata, but NEVER change accountType.
    const updated: StoredUser = {
      ...existing,
      /* The stored name WINS. A repeat Google login is authentication, not a
         request to be renamed to whatever Google currently shows. */
      name: googleDisplayName(existing.name, intent, profile.name, normalizedEmail),
      lastLogin: now,
      isActive: true,
      policyAcceptance: buildPolicyAcceptance('login'),
      subscription: applyRoadmapPromotionToSubscription(existing.subscription, now),
    };
    await upsertStoredUser(updated);

    // Ensure existing Google users are also marked email-verified (idempotent)
    await updateProfileData(existing.id, {
      emailVerified: true,
      emailVerifiedAt: now,
    }).catch(() => { /* non-fatal */ });

    const { passwordHash, passwordSalt, ...safeUser } = updated;
    return safeUser;
  }

  // ── Brand-new account: create the type the user chose at the toggle ──
  if (intent.accountType === 'business') {
    const displayName = googleDisplayName(null, intent, profile.name, normalizedEmail);
    /* Lazy import to avoid a static import cycle back into this module through
       the business/referral chain (it broke build-time module init). */
    const { provisionBusinessAccount } = await import('@/lib/server/business-provisioning');
    const { userId, user } = await provisionBusinessAccount({
      name: displayName,
      email: normalizedEmail,
      // Google gives us no organization; derive a sensible default the owner can
      // rename in business settings later. No password — the Google identity is
      // the credential.
      organizationName: `${displayName}'s Workspace`,
      referralCode: intent.ref,
      policyContext: 'business_signup',
      idPrefix: 'business-google',
    });
    // Business accounts are treated as email-verified (Google already verified it).
    await updateProfileData(userId, { emailVerified: true, emailVerifiedAt: now }).catch(() => {});
    await activateGoogleReferral(userId, normalizedEmail, intent.ref);
    const { passwordHash, passwordSalt, ...safeUser } = user;
    return safeUser;
  }

  const individualPlan = await getDefaultPublicPlan('individual');
  const createdUser: StoredUser = {
    id: `individual-google-${Date.now()}`,
    email: normalizedEmail,
    name: googleDisplayName(null, intent, profile.name, normalizedEmail),
    role: 'individual',
    accountType: 'individual',
    permissions: ['self'],
    isActive: true,
    createdAt: now,
    lastLogin: now,
    organizationName: 'Individual Workspace',
    createdFromSignup: true,
    referredByCode: intent.ref || undefined,
    policyAcceptance: buildPolicyAcceptance('login'),
    subscription: individualPlan
      ? applyRoadmapPromotionToSubscription({
          planId: individualPlan.id,
          planName: individualPlan.name,
          status: individualPlan.billingModel === 'payg' ? 'active' : 'trial',
          startedAt: now,
        }, now)
      : undefined,
  };

  await upsertStoredUser(createdUser);

  // Google has already verified the email address — mark it verified immediately
  await updateProfileData(createdUser.id, {
    emailVerified: true,
    emailVerifiedAt: now,
  }).catch(() => { /* non-fatal */ });

  await activateGoogleReferral(createdUser.id, normalizedEmail, intent.ref);

  const { passwordHash, passwordSalt, ...safeUser } = createdUser;
  return safeUser;
}

export async function authenticateUser(identifier: string, password: string, policyAccepted = false): Promise<User | null> {
  const normalizedIdentifier = identifier.trim();
  const normalizedEmail = normalizeEmail(identifier);
  const normalizedLoginId = normalizeLoginId(identifier);

  /* Brute-force protection for credentials login, keyed by account. This is the
     primary defense: an attacker guessing one account's password is blocked
     after RATE_POLICIES.loginAccount.limit failures regardless of source IP. A
     blocked attempt returns null (generic invalid-credentials — no enumeration,
     no separate 429 through the NextAuth credentials flow). Successful logins
     are refunded below so only failures accumulate. */
  const loginKey = `login:account:${normalizedEmail || normalizedLoginId}`;
  const rl = await rateLimit(loginKey, RATE_POLICIES.loginAccount);
  if (!rl.allowed) {
    return null;
  }

  const users = await getStoredUsers();

  // Find matching user — include deactivated accounts so they can log back in
  const user = users.find((entry) =>
    !entry.pendingDeletion // never let pending-deletion accounts log in
    && (
      entry.email === normalizedEmail
      || (entry.loginId && normalizeLoginId(entry.loginId) === normalizedLoginId)
      || entry.email === normalizedIdentifier
    ),
  );

  if (!user) {
    return null;
  }

  // Suspended accounts cannot log in
  if (user.safety?.suspendedUntil && new Date(user.safety.suspendedUntil).getTime() > Date.now()) {
    return null;
  }

  const isValidPassword = verifyPassword(password, user.passwordHash, user.passwordSalt);

  if (!isValidPassword) {
    return null;
  }

  if (!policyAccepted) {
    return null;
  }

  // ── Auto-reactivate deactivated accounts on successful login ──────
  const isDeactivated = user.isActive === false;
  const now = new Date().toISOString();

  const updatedUser: StoredUser = {
    ...user,
    isActive: true,                           // always re-enable on login
    // Clear deactivation metadata
    ...(isDeactivated && {
      deactivatedAt: undefined,
      deactivationDeadline: undefined,
      deactivationWarningEmailSentAt: undefined,
      pendingDeletion: false,
    }),
    lastLogin: now,
    subscription: applyRoadmapPromotionToSubscription(user.subscription, now),
    policyAcceptance: buildPolicyAcceptance('login'),
  };
  await upsertStoredUser(updatedUser);

  // Fire reactivation email non-blocking
  if (isDeactivated) {
    import('@/lib/server/account-emails')
      .then(({ sendAccountReactivatedEmail }) =>
        sendAccountReactivatedEmail({ to: user.email, name: user.name }).catch(() => {}),
      )
      .catch(() => {});
  }

  // Success → refund the account counter so only FAILED attempts accumulate.
  await refundRateLimit(loginKey, RATE_POLICIES.loginAccount);

  const { passwordHash, passwordSalt, ...safeUser } = updatedUser;
  return {
    ...safeUser,
    lastLogin: now,
  };
}

export function buildAuthOptions(): NextAuthOptions {
  const providerList: NextAuthOptions['providers'] = [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email or Login ID', type: 'text' },
        password: { label: 'Password', type: 'password' },
        policyAccepted: { label: 'Policy Accepted', type: 'text' },
        captchaToken: { label: 'Captcha Token', type: 'text' },
        loginGrant: { label: 'Login Grant', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // CAPTCHA gate for credentials login (server-verified; never trusts a
        // client boolean). Accepts a fresh Turnstile token OR a short-lived,
        // HMAC-signed login grant minted by the signup routes for the immediate
        // post-signup auto-login (which has no fresh token). When CAPTCHA is not
        // configured for the deployment, this is skipped (rate limiting in
        // authenticateUser still applies).
        if (isCaptchaConfigured()) {
          const grantOk = verifyLoginGrant(credentials.loginGrant, credentials.email);
          if (!grantOk) {
            // Only enforce when a token is actually present; if the widget failed
            // to load (e.g. domain not on Cloudflare), proceed without blocking.
            const hasToken = typeof credentials.captchaToken === 'string' && credentials.captchaToken.trim().length > 0;
            if (hasToken) {
              const captcha = await verifyCaptcha(credentials.captchaToken);
              if (!captcha.ok) return null;
            }
          }
        }

        return authenticateUser(credentials.email, credentials.password, credentials.policyAccepted === 'accepted');
      },
    }),
  ];

  const googleProvider = getGoogleProviderConfig();
  if (googleProvider) {
    providerList.push(
      GoogleProvider({
        clientId: googleProvider.clientId,
        clientSecret: googleProvider.clientSecret,
      }),
    );
  }

  return {
    secret: getAuthSecret(),
    session: {
      strategy: 'jwt',
      maxAge: 60 * 60 * 24 * 90,
      updateAge: 60 * 60 * 24,
    },
    jwt: {
      maxAge: 60 * 60 * 24 * 90,
    },
    providers: providerList,
    callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google') {
        if (!user.email) {
          return false;
        }
        /* The account-type intent set at the button, read server-side. Defaults
           to individual when absent. It only decides the type of a NEW account;
           an existing account's type is never changed. */
        const intent = readOAuthIntent() ?? { accountType: 'individual' as const };
        await upsertGoogleUser({ email: user.email, name: user.name }, intent);
      }
      return true;
    },
    async jwt({ token, user }) {
      try {
        const lookupEmail = normalizeEmail(String(user?.email || token.email || ''));
        if (lookupEmail) {
          const storedUser = await getStoredUserByEmail(lookupEmail);
          if (storedUser) {
            // `profile` is read for exactly one boolean below, and only matters
            // for individual accounts. Fetching the whole profile document here
            // meant every authenticated request pulled base64 avatars, resume
            // files and portfolio entries out of Mongo. Same value, projected —
            // and skipped entirely when the account type makes it irrelevant.
            const needsEmailVerified = storedUser.accountType === 'individual';
            const [plan, profile] = await Promise.all([
              getEffectiveSaasPlanForUser(storedUser).catch(() => null),
              needsEmailVerified
                ? getProfileFields(storedUser.id, ['emailVerified'] as const).catch(() => null)
                : Promise.resolve(null),
            ]);
            const expired = isSubscriptionPeriodExpired(storedUser.subscription);
            const suspended = Boolean(storedUser.safety?.suspendedUntil && new Date(storedUser.safety.suspendedUntil).getTime() > Date.now());
            const disabled = storedUser.isActive === false;
            token.id = storedUser.id;
            /* The DISPLAY NAME comes from our own record, not the provider.
               NextAuth seeds `token.name` from the OAuth profile, so without
               this the session rendered Google's name ("Honey Kumar") while the
               stored account correctly held the onboarding answer ("Yash") —
               the visible half of that bug. Reading it back from storedUser
               keeps the session and the database saying the same thing, and
               makes a profile rename show up on the next token refresh. */
            if (storedUser.name) token.name = storedUser.name;
            token.role = suspended || disabled ? 'suspended' : storedUser.role;
            token.permissions = suspended || disabled ? [] : storedUser.permissions;
            token.organizationName = storedUser.organizationName;
            token.subscription = storedUser.subscription
              ? { ...storedUser.subscription, status: expired ? 'upgrade_required' : storedUser.subscription.status }
              : storedUser.subscription;
            token.planFeatures = suspended || disabled ? [] : (expired ? ['dashboard', 'tutorials'] : (plan?.includedFeatures || []));
            /* Normalised here, not at the edges. A record written before
               account types existed has no `accountType`, and every consumer
               below (email-verification gate, middleware, session) reads this
               field — so an undefined value has to resolve to 'individual'
               exactly once, at the source. Anything that is not explicitly
               'business' is an individual. */
            token.accountType = storedUser.accountType === 'business' ? 'business' : 'individual';
            token.workspaceAccessMode = storedUser.workspaceAccessMode;
            token.boardRoomIds = storedUser.boardRoomIds || [];
            token.emailVerified = token.accountType !== 'individual'
              ? true
              : profile?.emailVerified === true;
          }
        } else if (user) {
          const plan = await getEffectiveSaasPlanForUser(user).catch(() => null);
          const expired = isSubscriptionPeriodExpired(user.subscription);
          const suspended = Boolean((user as any).safety?.suspendedUntil && new Date((user as any).safety.suspendedUntil).getTime() > Date.now());
          const disabled = (user as any).isActive === false;
          token.id = user.id;
          token.role = suspended || disabled ? 'suspended' : user.role;
          token.permissions = suspended || disabled ? [] : user.permissions;
          token.organizationName = user.organizationName;
          token.subscription = user.subscription
            ? { ...user.subscription, status: expired ? 'upgrade_required' : user.subscription.status }
            : user.subscription;
          token.planFeatures = suspended || disabled ? [] : (expired ? ['dashboard', 'tutorials'] : (plan?.includedFeatures || []));
          token.accountType = user.accountType === 'business' ? 'business' : 'individual';
          token.workspaceAccessMode = user.workspaceAccessMode;
          token.boardRoomIds = user.boardRoomIds || [];
          token.emailVerified = token.accountType !== 'individual' ? true : false;
        }
      } catch (err) {
        // DB unavailable during token refresh — return the existing token as-is so the
        // page still renders instead of throwing to the error boundary.
        console.error('[jwt] token refresh failed, returning cached token:', err);
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id ?? '');
        session.user.role = String(token.role ?? 'user');
        session.user.permissions = Array.isArray(token.permissions) ? token.permissions.map(String) : [];
        session.user.organizationName = token.organizationName ? String(token.organizationName) : undefined;
        session.user.subscription = token.subscription;
        session.user.planFeatures = Array.isArray(token.planFeatures) ? token.planFeatures.map(String) : [];
        /* Legacy accounts (no stored accountType) are individuals. This used to
           read `=== 'individual' ? 'individual' : 'business'`, which reported
           every pre-feature user as a BUSINESS account and skipped their
           email-verification gate. */
        session.user.accountType = token.accountType === 'business' ? 'business' : 'individual';
        session.user.workspaceAccessMode = token.workspaceAccessMode === 'board_room_only' ? 'board_room_only' : 'standard';
        session.user.boardRoomIds = Array.isArray(token.boardRoomIds) ? token.boardRoomIds.map(String) : [];
        session.user.emailVerified = token.emailVerified === true;
      }

      return session;
    },
  },
    events: {
      /**
       * Signing out ends presence immediately.
       *
       * The heartbeat stops on its own, but that would leave the last heartbeat
       * looking fresh (and the green dot lit) for up to the online threshold.
       * Stamping the stop marker here is the only presence-related touch on the
       * auth flow — session semantics are unchanged.
       */
      async signOut({ token }) {
        const id = token?.id ? String(token.id) : '';
        if (!id) return;
        try {
          await endUserPresence(id);
        } catch (err) {
          console.error('[auth] failed to end presence on sign out:', err);
        }
      },
    },
    pages: {
      signIn: '/login',
    },
  };
}

export const authOptions: NextAuthOptions = buildAuthOptions();

// Warm the cache immediately so Google OAuth config from DB is reflected on the first request.
warmAuthSettingsCache();

export function getAuthSession() {
  return getServerSession(authOptions);
}

/**
 * Resolve the canonical stored user id for a session.
 *
 * `session.user.id` is authoritative and FRESH: the jwt callback above runs on
 * every getServerSession() call, looks the user up by email, and assigns
 * `token.id = storedUser.id`. So by the time any route reaches this function,
 * the canonical id has already been read from the database during this same
 * request — querying by email again just repeats that query.
 *
 * This is not a cache. Nothing is retained between requests, and no
 * authorization value is reused: role, permissions and suspension are still
 * recomputed from the database by the jwt callback on every single request.
 *
 * The email lookup is kept as a fallback for tokens that carry no id (legacy
 * tokens issued before the callback set it), which is exactly the case the
 * original ordering existed to cover.
 */
export async function resolveSessionUserId(
  session: { user?: { id?: string | null; email?: string | null } } | null | undefined,
): Promise<string | null> {
  const id = session?.user?.id?.trim();
  if (id) return id;

  const email = session?.user?.email?.trim();
  if (email) {
    const stored = await getStoredUserByEmail(email).catch(() => null);
    if (stored?.id) return stored.id;
  }
  return null;
}
