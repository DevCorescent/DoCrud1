import crypto from 'node:crypto';
import { getStoredUsers, saveStoredUsers } from '@/lib/server/auth';
import { readJsonFile, referralProgramPath, writeJsonFile } from '@/lib/server/storage';
import { activateInfinity } from '@/lib/server/infinity';
import { sendTrackedMail } from '@/lib/server/mailer';
import { buildEmailChrome } from '@/lib/server/email-chrome';

export type ReferralRedemption = {
  id: string;
  referrerUserId: string;
  refereeUserId: string;
  transactionId: string;
  createdAt: string;
  bonusGrantedAt?: string;
};

export type ReferralInvite = {
  id: string;
  referrerUserId: string;
  inviteeEmail: string;
  sentAt: string;
  clickedAt?: string;
  signedUpAt?: string;
  signedUpUserId?: string;
};

export type ReferralActivation = {
  id: string;
  referrerUserId: string;
  refereeUserId: string;
  refereeEmail: string;
  referralCode: string;
  activatedAt: string;
  bonusGrantedAt?: string;
};

type ReferralState = {
  redemptions: ReferralRedemption[];
  invites: ReferralInvite[];
  activations: ReferralActivation[];
};

const fallback: ReferralState = { redemptions: [], invites: [], activations: [] };

function nowIso() {
  return new Date().toISOString();
}

function normalizeCode(code: string) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 18);
}

function generateCode() {
  return crypto.randomBytes(5).toString('hex').toUpperCase();
}

async function readState(): Promise<ReferralState> {
  const state = await readJsonFile<ReferralState>(referralProgramPath, fallback);
  return {
    redemptions: state.redemptions || [],
    invites: state.invites || [],
    activations: state.activations || [],
  };
}

export async function ensureUserReferralCode(userId: string) {
  const users = await getStoredUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) return null;
  const existing = users[idx];
  if (existing.referralCode) return existing.referralCode;

  const used = new Set(users.map((u) => u.referralCode).filter(Boolean) as string[]);
  let code = generateCode();
  for (let i = 0; i < 8 && used.has(code); i += 1) code = generateCode();
  const nextUsers = users.map((u) => (u.id === userId ? { ...u, referralCode: code } : u));
  await saveStoredUsers(nextUsers);
  return code;
}

export async function resolveReferralReferrer(code: string) {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  const users = await getStoredUsers();
  return users.find((u) => String(u.referralCode || '').toUpperCase() === normalized) || null;
}

export async function listReferralRedemptions(limit = 800) {
  const state = await readState();
  return state.redemptions.slice(0, limit);
}

export async function listReferralInvites(limit = 2000) {
  const state = await readState();
  return state.invites.slice(0, limit);
}

export async function listReferralActivations(limit = 2000) {
  const state = await readState();
  return state.activations.slice(0, limit);
}

export async function getReferralStatsForUser(userId: string) {
  const state = await readState();
  const invitesSent = state.invites.filter((inv) => inv.referrerUserId === userId).length;
  const signupsFromInvites = state.invites.filter((inv) => inv.referrerUserId === userId && inv.signedUpAt).length;
  const activations = state.activations.filter((act) => act.referrerUserId === userId);
  const bonusGranted = activations.some((act) => act.bonusGrantedAt);
  const bonusGrantedAt = activations.find((act) => act.bonusGrantedAt)?.bonusGrantedAt;
  return { invitesSent, signupsFromInvites, activations: activations.length, bonusGranted, bonusGrantedAt };
}

export async function recordReferralInvite(params: {
  referrerUserId: string;
  inviteeEmail: string;
}) {
  const state = await readState();
  const now = nowIso();
  const invite: ReferralInvite = {
    id: crypto.randomUUID(),
    referrerUserId: params.referrerUserId,
    inviteeEmail: params.inviteeEmail.trim().toLowerCase(),
    sentAt: now,
  };
  const next: ReferralState = {
    ...state,
    invites: [invite, ...state.invites].slice(0, 50_000),
  };
  await writeJsonFile(referralProgramPath, next);
  return invite;
}

export async function markInviteSignedUp(inviteeEmail: string, signedUpUserId: string) {
  const state = await readState();
  const normalizedEmail = inviteeEmail.trim().toLowerCase();
  const now = nowIso();
  const next: ReferralState = {
    ...state,
    invites: state.invites.map((inv) =>
      inv.inviteeEmail === normalizedEmail && !inv.signedUpAt
        ? { ...inv, signedUpAt: now, signedUpUserId }
        : inv,
    ),
  };
  await writeJsonFile(referralProgramPath, next);
}

/**
 * Called when a new user signs up using a referral code.
 * Records the activation and — if the referrer hasn't had the bonus yet — grants docrud Go for free.
 */
export async function processProfileActivation(params: {
  refereeUserId: string;
  refereeEmail: string;
  referralCode: string;
  origin: string;
}) {
  const normalized = normalizeCode(params.referralCode);
  if (!normalized) return null;

  const users = await getStoredUsers();
  const referrer = users.find((u) => String(u.referralCode || '').toUpperCase() === normalized);
  if (!referrer) return null;

  // Don't self-refer
  if (referrer.id === params.refereeUserId) return null;

  const state = await readState();

  // Record the activation (always, for tracking)
  const now = nowIso();
  const activation: ReferralActivation = {
    id: crypto.randomUUID(),
    referrerUserId: referrer.id,
    refereeUserId: params.refereeUserId,
    refereeEmail: params.refereeEmail.trim().toLowerCase(),
    referralCode: normalized,
    activatedAt: now,
  };

  // Grant 1 month Infinity free to referee (the person who just signed up)
  await activateInfinity(params.refereeUserId, { period: 'monthly', grantedFree: true });

  // Grant 1 month Infinity free to referrer for each successful referral
  let bonusGranted = false;
  {
    await activateInfinity(referrer.id, { period: 'monthly', grantedFree: true });

    // Save referralBonusActivatedAt on the referrer user record (for tracking)
    const nextUsers = users.map((u) =>
      u.id === referrer.id ? { ...u, referralBonusActivatedAt: now } : u,
    );
    await saveStoredUsers(nextUsers);

    activation.bonusGrantedAt = now;
    bonusGranted = true;

    // Send referrer a congratulation email
    try {
      const firstName = (referrer.name || 'there').split(' ')[0];
      const bodyHtml = `
        <div style="background:linear-gradient(135deg,#0f0e2e 0%,#1e1b4b 50%,#0f0e2e 100%); border-radius:16px; padding:28px 24px; margin-bottom:20px; text-align:center;">
          <div style="font-size:11px; font-weight:800; letter-spacing:.18em; text-transform:uppercase; color:rgba(165,180,252,0.7); margin-bottom:8px;">🎉 Referral Reward Unlocked</div>
          <div style="font-size:28px; font-weight:900; letter-spacing:-.03em; color:#a5b4fc;">Docrud Infinity ∞ — 1 Month Free!</div>
          <div style="margin-top:10px; font-size:14px; color:rgba(255,255,255,0.55); max-width:360px; margin-left:auto; margin-right:auto; line-height:1.6;">
            Your referral just signed up. You've earned <strong style="color:#a5b4fc;">1 month of Docrud Infinity</strong> free — no payment required.
          </div>
        </div>
        <p style="font-size:14.5px; color:#334155; line-height:1.7; margin:0 0 20px;">
          Hi ${firstName}, a friend you referred just signed up and activated their Docrud profile. You've earned <strong style="color:#4f46e5;">1 month of Docrud Infinity ∞</strong> free — enjoy all premium features for 30 days, no payment needed.
        </p>
        <div style="background:#eef2ff; border:1px solid #c7d2fe; border-radius:12px; padding:18px 20px; margin-bottom:20px;">
          <div style="font-size:12px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; color:#4338ca; margin-bottom:10px;">∞ You now have</div>
          ${[
            'Infinity verified badge on your profile',
            'Priority placement in search & talent directory',
            'Access to premium gig listings',
            'Higher trust signals for clients',
            'E-Sign, Document AI, DocWord & more',
          ].map(b => `<div style="padding:5px 0; font-size:12.5px; color:#4338ca;">✓ ${b}</div>`).join('')}
        </div>
        <div style="text-align:center; margin:28px 0;">
          <a href="${params.origin}" style="display:inline-block; background:linear-gradient(135deg,#4f46e5,#6366f1); color:#ffffff; font-size:14px; font-weight:900; letter-spacing:-.01em; text-decoration:none; padding:13px 36px; border-radius:12px; box-shadow:0 4px 18px rgba(99,102,241,0.35);">
            Open Docrud ∞
          </a>
        </div>
        <p style="font-size:12px; color:#94a3b8; text-align:center; line-height:1.6; margin:0;">
          Keep referring — every new activation you drive is tracked.<br/>
          <strong style="color:#64748b;">Docrud Platform</strong>
        </p>
      `;
      const html = buildEmailChrome({
        origin: params.origin,
        subject: `You earned 1 month Docrud Infinity free, ${firstName}! ∞`,
        preheader: 'Your referral just activated — your Infinity badge is live for free.',
        bodyHtml,
      });
      await sendTrackedMail({
        policyKey: 'docrud_go_welcome',
        typeLabel: 'docrud_go_welcome',
        to: referrer.email,
        subject: `You earned 1 month Docrud Infinity free, ${firstName}! ∞`,
        text: `Hi ${firstName}, your referral signed up and activated their Docrud profile. You've earned 1 month of Docrud Infinity free — enjoy all premium features. Sign in at ${params.origin}.`,
        html,
        preheader: 'Your referral activated — 1 month Infinity unlocked for free.',
        sentBy: 'system',
        origin: params.origin,
        metadata: { type: 'referral_bonus', refereeUserId: params.refereeUserId },
      });
    } catch {
      // Non-fatal
    }
  }

  // Persist activation
  const next: ReferralState = {
    ...state,
    activations: [activation, ...state.activations].slice(0, 50_000),
  };
  await writeJsonFile(referralProgramPath, next);

  // Mark any matching invite as signed up
  await markInviteSignedUp(params.refereeEmail, params.refereeUserId);

  return { activation, bonusGranted };
}

export async function recordReferralRedemption(params: { referrerUserId: string; refereeUserId: string; transactionId: string }) {
  const state = await readState();
  const now = nowIso();

  const already = state.redemptions.find((r) => r.transactionId === params.transactionId);
  if (already) return already;

  const redemption: ReferralRedemption = {
    id: crypto.randomUUID(),
    referrerUserId: params.referrerUserId,
    refereeUserId: params.refereeUserId,
    transactionId: params.transactionId,
    createdAt: now,
  };

  const next: ReferralState = {
    ...state,
    redemptions: [redemption, ...state.redemptions].slice(0, 20_000),
  };
  await writeJsonFile(referralProgramPath, next);
  return redemption;
}

export async function grantReferralBonusMonth(referrerUserId: string) {
  const users = await getStoredUsers();
  const now = new Date();
  const next = users.map((u) => {
    if (u.id !== referrerUserId) return u;
    const sub = u.subscription;
    if (!sub?.currentPeriodEnd) return u;
    const baseline = new Date(sub.currentPeriodEnd);
    const base = Number.isFinite(baseline.getTime()) && baseline.getTime() > now.getTime() ? baseline : now;
    const nextEnd = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    return {
      ...u,
      subscription: {
        ...sub,
        currentPeriodEnd: nextEnd,
        renewalDate: nextEnd,
      },
    };
  });
  await saveStoredUsers(next);
  return true;
}

export async function markReferralBonusGranted(transactionId: string) {
  const state = await readState();
  const now = nowIso();
  const next = {
    ...state,
    redemptions: state.redemptions.map((r) => (r.transactionId === transactionId ? { ...r, bonusGrantedAt: r.bonusGrantedAt || now } : r)),
  };
  await writeJsonFile(referralProgramPath, next);
}

export async function sendReferralInviteEmail(params: {
  referrerUserId: string;
  referrerName: string;
  referrerEmail: string;
  inviteeEmail: string;
  referralCode: string;
  origin: string;
}) {
  const invite = await recordReferralInvite({
    referrerUserId: params.referrerUserId,
    inviteeEmail: params.inviteeEmail,
  });

  const firstName = (params.referrerName || 'Someone').split(' ')[0];
  const referralLink = `${params.origin}/onboarding?start=signup&ref=${encodeURIComponent(params.referralCode)}`;

  const bodyHtml = `
    <div style="background:linear-gradient(135deg,#06060f 0%,#0f0e2e 50%,#06060f 100%); border-radius:16px; padding:28px 24px; margin-bottom:20px; text-align:center;">
      <div style="font-size:11px; font-weight:800; letter-spacing:.18em; text-transform:uppercase; color:rgba(165,180,252,0.7); margin-bottom:8px;">You're Invited</div>
      <div style="font-size:28px; font-weight:900; letter-spacing:-.03em; background:linear-gradient(90deg,#6366f1,#a5b4fc,#6366f1); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;">Join Docrud ∞</div>
      <div style="margin-top:10px; font-size:14px; color:rgba(255,255,255,0.55); max-width:360px; margin-left:auto; margin-right:auto; line-height:1.6;">
        <strong style="color:#a5b4fc;">${firstName}</strong> invited you to Docrud — the professional document platform.
      </div>
    </div>
    <p style="font-size:14.5px; color:#334155; line-height:1.7; margin:0 0 20px;">
      <strong>${params.referrerName}</strong> thinks you'd love Docrud — for signing documents, generating contracts, and growing your professional presence.
    </p>
    <div style="background:#f8fafc; border-radius:12px; padding:18px 20px; margin-bottom:20px;">
      <div style="font-size:12px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; color:#475569; margin-bottom:10px;">Get started in 2 minutes</div>
      ${[
        'E-Sign documents & contracts',
        'AI-powered document generation',
        'Verified profile with Infinity badge',
        'Network with professionals',
        'Secure file sharing & PDF studio',
      ].map(f => `<div style="padding:4px 0; font-size:13px; color:#64748b;">→ ${f}</div>`).join('')}
    </div>
    <div style="text-align:center; margin:28px 0;">
      <a href="${referralLink}" style="display:inline-block; background:linear-gradient(135deg,#4f46e5,#6366f1); color:#ffffff; font-size:14px; font-weight:900; letter-spacing:-.01em; text-decoration:none; padding:13px 36px; border-radius:12px; box-shadow:0 4px 18px rgba(99,102,241,0.35);">
        Accept Invite & Join Docrud ∞
      </a>
    </div>
    <p style="font-size:12px; color:#94a3b8; text-align:center; line-height:1.6; margin:0;">
      This invitation was sent by ${params.referrerName} (${params.referrerEmail}).<br/>
      <strong style="color:#64748b;">Docrud Platform</strong> · SOC 2 · GDPR
    </p>
  `;

  const html = buildEmailChrome({
    origin: params.origin,
    subject: `${firstName} invited you to join Docrud`,
    preheader: `${firstName} thinks you'd love Docrud. Accept your invitation to get started.`,
    bodyHtml,
  });

  await sendTrackedMail({
    policyKey: 'docrud_go_welcome',
    typeLabel: 'system',
    to: params.inviteeEmail,
    subject: `${firstName} invited you to join Docrud`,
    text: `${params.referrerName} invited you to join Docrud. Sign up at: ${referralLink}`,
    html,
    preheader: `${firstName} thinks you'd love Docrud.`,
    sentBy: params.referrerEmail,
    origin: params.origin,
    metadata: { type: 'referral_invite', referrerUserId: params.referrerUserId, inviteId: invite.id },
  });

  return invite;
}
