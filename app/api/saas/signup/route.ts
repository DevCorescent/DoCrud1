import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getStoredUsers, saveStoredUsers } from '@/lib/server/auth';
import { createPasswordHash, isValidEmail, normalizeEmail } from '@/lib/server/security';
import { applyRoadmapPromotionToSubscription, getDefaultPublicPlan, saasFeatureCatalog } from '@/lib/server/saas';
import { saveBusinessSettings, seedStarterTemplatesForBusiness } from '@/lib/server/business';
import { BusinessSettings } from '@/types/document';
import { buildPolicyAcceptance } from '@/lib/policy-consent';
import { assertBusinessSignupOtpVerified } from '@/lib/server/otp-sessions';
import { sendTrackedMail } from '@/lib/server/mailer';
import { processProfileActivation } from '@/lib/server/referrals';

export const dynamic = 'force-dynamic';

function escapeHtmlLite(value: string) {
  return String(value || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as {
      name?: string;
      email?: string;
      password?: string;
      organizationName?: string;
      organizationDomain?: string;
      industry?: string;
      companySize?: string;
      primaryUseCase?: string;
      workspacePreset?: string;
      policyAccepted?: boolean;
      otpSessionId?: string;
      referralCode?: string;
    };

    if (!payload.name?.trim() || !payload.organizationName?.trim() || !isValidEmail(payload.email || '') || !payload.password || payload.password.length < 8) {
      return NextResponse.json({ error: 'Name, organization, valid email, and password with at least 8 characters are required' }, { status: 400 });
    }

    if (!payload.policyAccepted) {
      return NextResponse.json({ error: 'You must accept the required policies before creating a workspace.' }, { status: 400 });
    }

    const users = await getStoredUsers();
    const normalizedEmail = normalizeEmail(payload.email || '');

    await assertBusinessSignupOtpVerified(String(payload.otpSessionId || ''), normalizedEmail);

    if (users.some((user) => user.email === normalizedEmail)) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 });
    }

    const defaultPlan = await getDefaultPublicPlan('business');
    const now = new Date().toISOString();
    const userId = `user-${Date.now()}`;
    const organizationName = payload.organizationName.trim();
    const referralCode = typeof payload.referralCode === 'string' ? payload.referralCode.trim() : '';

    const newUser = {
      id: userId,
      name: payload.name.trim(),
      email: normalizedEmail,
      role: 'client',
      accountType: 'business' as const,
      permissions: ['all'],
      isActive: true,
      createdAt: now,
      organizationId: userId,
      organizationName,
      organizationDomain: payload.organizationDomain?.trim() || undefined,
      createdFromSignup: true,
      referredByCode: referralCode || undefined,
      policyAcceptance: buildPolicyAcceptance('business_signup', request.headers.get('x-forwarded-for') || undefined),
      subscription: defaultPlan ? applyRoadmapPromotionToSubscription({
        planId: defaultPlan.id,
        planName: defaultPlan.name,
        status: 'trial' as const,
        startedAt: now,
        aiTrialLimit: defaultPlan.freeAiRuns || 0,
        aiTrialUsed: 0,
        monthlyAiCredits: defaultPlan.monthlyAiCredits || 0,
        remainingAiCredits: defaultPlan.monthlyAiCredits || 0,
        aiCreditsResetAt: defaultPlan.billingModel === 'free' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : undefined,
      }, now) : undefined,
      ...createPasswordHash(payload.password),
    };

    users.push(newUser);
    await saveStoredUsers(users);

    // ── Referral activation ──────────────────────────────────────────────────
    // If a valid referral code was supplied, process the activation.
    // This grants docrud Go (free, one-time) to the referrer.
    let referralResult: { bonusGranted: boolean } | null = null;
    if (referralCode) {
      try {
        const origin = request.nextUrl.origin;
        const result = await processProfileActivation({
          refereeUserId: userId,
          refereeEmail: normalizedEmail,
          referralCode,
          origin,
        });
        if (result) {
          referralResult = { bonusGranted: result.bonusGranted };
        }
      } catch (referralError) {
        console.error('[signup] referral activation failed (non-fatal):', referralError);
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    const businessSettings: BusinessSettings = {
      organizationId: userId,
      organizationName,
      displayName: organizationName,
      industry: payload.industry?.trim() || 'technology',
      companySize: payload.companySize?.trim() || '1-25',
      primaryUseCase: payload.primaryUseCase?.trim() || '',
      workspacePreset: payload.workspacePreset?.trim() || 'executive_control',
      onboardingCompleted: true,
      onboardingCompletedAt: now,
      starterTemplatesSeededAt: now,
      supportEmail: normalizedEmail,
      supportPhone: '',
      accentColor: '#2719FF',
      watermarkLabel: 'docrud workspace',
      letterheadMode: 'default',
      letterheadImageDataUrl: '',
      letterheadHtml: '',
      businessDescription: payload.primaryUseCase?.trim() || '',
      workspaceSetupChecklist: {
        profileConfigured: true,
        brandingConfigured: true,
        starterTemplatesReady: true,
        signaturesReady: false,
        firstDocumentGenerated: false,
      },
      updatedAt: now,
    };
    await saveBusinessSettings(businessSettings);
    await seedStarterTemplatesForBusiness(businessSettings);

    try {
      const origin = request.nextUrl.origin;
      const featureLabelByKey = new Map(saasFeatureCatalog.map((item) => [item.key, item.label]));
      const includedFeatureLabels = (defaultPlan?.includedFeatures || [])
        .map((key) => featureLabelByKey.get(key) || key)
        .slice(0, 10);

      const invoiceId = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${userId.slice(-6)}`;
      const invoiceDate = new Date().toISOString();
      const planName = defaultPlan?.name || 'docrud Workspace';
      const priceLabel = defaultPlan?.priceLabel || '—';
      const amountInPaise = defaultPlan?.amountInPaise ?? 0;
      const amountInRupees = (amountInPaise / 100).toFixed(2);

      const subject = `Welcome to ${escapeHtmlLite(organizationName)} on docrud`;
      const loginUrl = `${origin}/login`;
      const workspaceUrl = `${origin}/workspace`;

      const text = [
        `Welcome to docrud, ${payload.name?.trim() || 'there'}.`,
        '',
        `Workspace: ${organizationName}`,
        `Plan: ${planName} (${priceLabel})`,
        '',
        `Next steps:`,
        `1) Sign in: ${loginUrl}`,
        `2) Open your workspace: ${workspaceUrl}`,
        `3) Invite teammates and start generating documents.`,
        '',
        `Invoice: ${invoiceId} (₹${amountInRupees})`,
      ].join('\n');

      const html = `
        <div style="border-radius: 18px; border: 1px solid rgba(148,163,184,.55); background: linear-gradient(135deg, rgba(2,6,23,.96), rgba(15,23,42,.92), rgba(245,158,11,.18)); padding: 16px; color: #ffffff;">
          <div style="font-size: 11px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; color: rgba(255,255,255,.75);">
            Welcome
          </div>
          <div style="margin-top: 8px; font-size: 16px; font-weight: 900;">${escapeHtmlLite(organizationName)}</div>
          <div style="margin-top: 2px; font-size: 13px; color: rgba(255,255,255,.75);">${escapeHtmlLite(planName)} · ${escapeHtmlLite(priceLabel)}</div>
          <div style="margin-top: 10px; display:flex; gap:10px; flex-wrap:wrap;">
            <a href="${escapeHtmlLite(loginUrl)}" style="display:inline-block; text-decoration:none; border-radius: 999px; padding: 10px 14px; font-size: 12px; font-weight: 800; letter-spacing: .06em; background: #ffffff; color:#0f172a;">
              Sign in
            </a>
            <a href="${escapeHtmlLite(workspaceUrl)}" style="display:inline-block; text-decoration:none; border-radius: 999px; padding: 10px 14px; font-size: 12px; font-weight: 800; letter-spacing: .06em; background: rgba(255,255,255,.10); color:#ffffff; border: 1px solid rgba(255,255,255,.18);">
              Open workspace
            </a>
          </div>
        </div>

        <div style="margin-top: 16px; border-radius: 18px; border: 1px solid rgba(226,232,240,.9); background: #ffffff; padding: 16px;">
          <div style="font-size: 11px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; color: rgba(15,23,42,.55);">
            Included highlights
          </div>
          <ul style="margin: 10px 0 0; padding-left: 18px; font-size: 13px; color: rgba(15,23,42,.78);">
            ${includedFeatureLabels.map((label) => `<li>${escapeHtmlLite(label)}</li>`).join('')}
          </ul>
        </div>

        <div style="margin-top: 16px; border-radius: 18px; border: 1px solid rgba(226,232,240,.9); background: #ffffff; padding: 16px;">
          <div style="font-size: 11px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; color: rgba(15,23,42,.55);">
            Next steps
          </div>
          <ol style="margin: 10px 0 0; padding-left: 18px; font-size: 13px; color: rgba(15,23,42,.78);">
            <li>Invite teammates (Roles & permissions live in your workspace settings).</li>
            <li>Set branding (logo, watermark, and letterhead if needed).</li>
            <li>Generate your first document and share it securely.</li>
          </ol>
        </div>

        <div style="margin-top: 16px; border-radius: 18px; border: 1px solid rgba(226,232,240,.9); background: #ffffff; padding: 16px;">
          <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
            <div>
              <div style="font-size: 11px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; color: rgba(15,23,42,.55);">
                Invoice
              </div>
              <div style="margin-top: 6px; font-size: 13px; color: rgba(15,23,42,.78);">
                <div><strong>${escapeHtmlLite(invoiceId)}</strong></div>
                <div>Date: ${escapeHtmlLite(new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(invoiceDate)))}</div>
                <div>Billed to: ${escapeHtmlLite(normalizedEmail)}</div>
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-size: 12px; font-weight: 800; color: rgba(15,23,42,.78);">Total</div>
              <div style="margin-top: 4px; font-size: 18px; font-weight: 900; letter-spacing: -.02em;">₹${escapeHtmlLite(amountInRupees)}</div>
            </div>
          </div>
          <div style="margin-top: 12px; border-top: 1px solid rgba(226,232,240,.9); padding-top: 12px; font-size: 13px; color: rgba(15,23,42,.78);">
            <div style="display:flex; justify-content:space-between; gap:12px;">
              <div>${escapeHtmlLite(planName)} (${escapeHtmlLite(priceLabel)})</div>
              <div><strong>₹${escapeHtmlLite(amountInRupees)}</strong></div>
            </div>
          </div>
        </div>

        <div style="margin-top: 16px; font-size: 12px; color: rgba(15,23,42,.55);">
          If you did not create this workspace, please ignore this email.
        </div>
      `.trim();

      await sendTrackedMail({
        policyKey: 'business_welcome',
        typeLabel: 'system',
        to: normalizedEmail,
        subject,
        text,
        html,
        preheader: `Your workspace is ready — ${planName}`,
        origin,
        metadata: { type: 'business_signup_welcome', planId: defaultPlan?.id || 'unknown', organizationId: userId },
        attachment: await (async () => {
          try {
            const brochurePath = path.join(process.cwd(), 'public', 'email', 'docrud-brochure.pdf');
            const content = await fs.readFile(brochurePath);
            return { filename: 'docrud-brochure.pdf', content, contentType: 'application/pdf' };
          } catch {
            return undefined;
          }
        })(),
      });
    } catch (mailError) {
      console.error('Failed to send business welcome email', mailError);
    }

    return NextResponse.json({
      success: true,
      email: normalizedEmail,
      planName: defaultPlan?.name,
      referralActivated: referralResult?.bonusGranted ?? false,
      message: 'docrud workspace created successfully. Your trial is active, non-AI features are ready immediately, and a few AI tries are waiting once you log in.',
    }, { status: 201 });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : 'Failed to create business profile';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
