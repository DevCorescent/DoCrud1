import { type NextAuthOptions, getServerSession } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { User } from '@/types/document';
import { normalizeEmail, verifyPassword } from '@/lib/server/security';
import { applyRoadmapPromotionToSubscription, getDefaultPublicPlan, getEffectiveSaasPlanForUser, isSubscriptionPeriodExpired } from '@/lib/server/saas-plans';
import { buildPolicyAcceptance } from '@/lib/policy-consent';
import { getAuthSettings, getAuthSettingsSync } from '@/lib/server/settings';
import { getStoredUsers, getStoredUserByEmail, saveStoredUsers, upsertStoredUser, type StoredUser } from '@/lib/server/users';
import { getProfileData, updateProfileData } from '@/lib/server/user-profiles';

export type { StoredUser };
export { getStoredUsers, saveStoredUsers };

function getLegacyPassword(user: User) {
  return user.role === 'client' || user.role === 'employee' ? `${user.role}123` : `${user.role}123`;
}

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

async function upsertGoogleUser(profile: { email: string; name?: string | null }) {
  const normalizedEmail = normalizeEmail(profile.email);
  const existing = await getStoredUserByEmail(normalizedEmail);
  const now = new Date().toISOString();

  if (existing) {
    const updated: StoredUser = {
      ...existing,
      name: profile.name?.trim() || existing.name,
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

  const individualPlan = await getDefaultPublicPlan('individual');
  const createdUser: StoredUser = {
    id: `individual-google-${Date.now()}`,
    email: normalizedEmail,
    name: profile.name?.trim() || normalizedEmail.split('@')[0],
    role: 'individual',
    accountType: 'individual',
    permissions: ['self'],
    isActive: true,
    createdAt: now,
    lastLogin: now,
    organizationName: 'Individual Workspace',
    createdFromSignup: true,
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

  const { passwordHash, passwordSalt, ...safeUser } = createdUser;
  return safeUser;
}

export async function authenticateUser(identifier: string, password: string, policyAccepted = false): Promise<User | null> {
  const normalizedIdentifier = identifier.trim();
  const normalizedEmail = normalizeEmail(identifier);
  const normalizedLoginId = normalizeLoginId(identifier);
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

  const isValidPassword =
    verifyPassword(password, user.passwordHash, user.passwordSalt) ||
    password === getLegacyPassword(user);

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
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
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
        await upsertGoogleUser({ email: user.email, name: user.name });
      }
      return true;
    },
    async jwt({ token, user }) {
      try {
        const lookupEmail = normalizeEmail(String(user?.email || token.email || ''));
        if (lookupEmail) {
          const storedUser = await getStoredUserByEmail(lookupEmail);
          if (storedUser) {
            const [plan, profile] = await Promise.all([
              getEffectiveSaasPlanForUser(storedUser).catch(() => null),
              getProfileData(storedUser.id).catch(() => null),
            ]);
            const expired = isSubscriptionPeriodExpired(storedUser.subscription);
            const suspended = Boolean(storedUser.safety?.suspendedUntil && new Date(storedUser.safety.suspendedUntil).getTime() > Date.now());
            const disabled = storedUser.isActive === false;
            token.id = storedUser.id;
            token.role = suspended || disabled ? 'suspended' : storedUser.role;
            token.permissions = suspended || disabled ? [] : storedUser.permissions;
            token.organizationName = storedUser.organizationName;
            token.subscription = storedUser.subscription
              ? { ...storedUser.subscription, status: expired ? 'upgrade_required' : storedUser.subscription.status }
              : storedUser.subscription;
            token.planFeatures = suspended || disabled ? [] : (expired ? ['dashboard', 'tutorials'] : (plan?.includedFeatures || []));
            token.accountType = storedUser.accountType;
            token.workspaceAccessMode = storedUser.workspaceAccessMode;
            token.boardRoomIds = storedUser.boardRoomIds || [];
            token.emailVerified = storedUser.accountType !== 'individual'
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
          token.accountType = user.accountType;
          token.workspaceAccessMode = user.workspaceAccessMode;
          token.boardRoomIds = user.boardRoomIds || [];
          token.emailVerified = user.accountType !== 'individual' ? true : false;
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
        session.user.accountType = token.accountType === 'individual' ? 'individual' : 'business';
        session.user.workspaceAccessMode = token.workspaceAccessMode === 'board_room_only' ? 'board_room_only' : 'standard';
        session.user.boardRoomIds = Array.isArray(token.boardRoomIds) ? token.boardRoomIds.map(String) : [];
        session.user.emailVerified = token.emailVerified === true;
      }

      return session;
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
 * Prefer email lookup — session.user.id can be a stale Google OAuth sub
 * while Infinity / profiles are keyed by the stored DoCrud user id.
 */
export async function resolveSessionUserId(
  session: { user?: { id?: string | null; email?: string | null } } | null | undefined,
): Promise<string | null> {
  const email = session?.user?.email?.trim();
  if (email) {
    const stored = await getStoredUserByEmail(email).catch(() => null);
    if (stored?.id) return stored.id;
  }
  const id = session?.user?.id?.trim();
  return id || null;
}
