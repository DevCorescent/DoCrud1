/**
 * Writes the answers collected before sign-in onto the now-authenticated
 * profile.
 *
 * ═══ THE USER IS DERIVED, NEVER SUPPLIED ═══
 *
 * The target is resolved from the session on this server. The request body
 * carries answers only; it carries no user id, and one would be ignored. So a
 * caller cannot write onto somebody else's profile.
 *
 * ═══ TWO WAYS IN, ONE WRITE ═══
 *
 * The Google path leaves the browser, so its answers travel in the httpOnly
 * OAuth-intent cookie and are read back here. The email path never leaves, so
 * it posts its answers directly. Either way the same fields are written the
 * same way, through the existing updateProfileData.
 *
 * ═══ TWO OWNERS, CHOSEN BY THE ACCOUNT, NOT THE REQUEST ═══
 *
 * An individual's answers belong on their profile. A business's answers belong
 * to the WORKSPACE — BusinessSettings, keyed on organizationId — because a
 * workspace outlives whoever signed it up, and its industry is already stored
 * there. Which branch runs is decided by the stored account type and the
 * stored organization id, both read from the server's own user record. The
 * request cannot select an owner, and an organizationId in the body is ignored.
 *
 * ═══ WHAT THE PERSON TYPED IS WHAT IS STORED ═══
 *
 * These values are already the edited ones — the flow marks a field the moment
 * it is touched and never re-seeds it from a résumé. This endpoint writes them
 * verbatim, including empty arrays: clearing a list is an answer, and must not
 * be quietly turned back into an earlier suggestion.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { upsertStoredUser } from '@/lib/server/users';
import { updateProfileData, type UserProfileData } from '@/lib/server/user-profiles';
import {
  clearOAuthIntentCookie, coerceOnboarding, readOAuthIntent,
} from '@/lib/server/oauth-intent';
import { getBusinessSettings, saveBusinessSettings } from '@/lib/server/business';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getAuthSession().catch(() => null);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const users = await getStoredUsers();
  const actor = users.find(
    (u) => u.email.toLowerCase() === session.user!.email!.toLowerCase(),
  );
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  /* Body first (email path), cookie second (Google path). Both are sanitised
     by the same coercer, which caps list lengths and entry sizes. */
  const body = (await req.json().catch(() => ({}))) as { onboarding?: unknown };
  const fromBody = coerceOnboarding(body.onboarding);
  const fromCookie = readOAuthIntent()?.onboarding;
  const answers = fromBody ?? fromCookie;

  if (!answers) {
    /* Nothing to write is not a failure — a person can reach the end having
       changed nothing. The caller still gets a truthful answer. */
    clearOAuthIntentCookie();
    return NextResponse.json({ persisted: false });
  }

  /* The business branch writes to the workspace it actually belongs to. The
     organization comes from the stored user record — never from the body. */
  if (actor.accountType === 'business') {
    const organizationId = actor.organizationId;
    if (!organizationId) {
      /* A business account with no workspace cannot be written to. Say so
         rather than silently dropping the answers on the floor. */
      return NextResponse.json(
        { error: 'This account has no workspace to save to.' },
        { status: 409 },
      );
    }
    const current = await getBusinessSettings(organizationId, actor.organizationName);
    if (!current) {
      return NextResponse.json({ error: 'Workspace not found.' }, { status: 409 });
    }
    await saveBusinessSettings({
      ...current,
      ...(answers.businessSpace ? { industry: answers.businessSpace } : {}),
      ...(answers.businessSkills ? { talentSkills: answers.businessSkills } : {}),
      onboardingCompleted: true,
    });
    clearOAuthIntentCookie();
    return NextResponse.json({
      persisted: true,
      owner: 'business',
      fields: [
        ...(answers.businessSpace ? ['industry'] : []),
        ...(answers.businessSkills ? ['talentSkills'] : []),
      ],
    });
  }

  const patch: Partial<UserProfileData> = { profileSetupDone: true };
  if (answers.roles) patch.roles = answers.roles;
  if (answers.customRoles) patch.customRoles = answers.customRoles;
  if (answers.skills) patch.skills = answers.skills;

  await updateProfileData(actor.id, patch);

  /* The display name lives on the user record, not the profile — same split
     PATCH /api/profile/me already makes. */
  const name = answers.name?.trim();
  if (name && name !== actor.name) {
    await upsertStoredUser({ ...actor, name });
  }

  /* The answers are stored; the cookie must not outlive them. */
  clearOAuthIntentCookie();

  return NextResponse.json({
    persisted: true,
    owner: 'individual',
    fields: Object.keys(patch).filter((k) => k !== 'profileSetupDone'),
  });
}
