import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { buildWorkspaceSetupChecklist, getBusinessSettings, saveBusinessSettings, seedStarterTemplatesForBusiness } from '@/lib/server/business';
import { BusinessSettings } from '@/types/document';
import { getSignatureSettings } from '@/lib/server/settings';
import { getHistoryEntries } from '@/lib/server/history';
import { DocumentTemplate } from '@/types/document';
import { getCustomTemplatesFromRepository } from '@/lib/server/repositories';

export const dynamic = 'force-dynamic';

function canManageBusinessSettings(session: Awaited<ReturnType<typeof getAuthSession>>) {
  return session?.user?.role === 'client' || session?.user?.role === 'admin';
}

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user || !canManageBusinessSettings(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (session.user.role === 'admin') {
      return NextResponse.json({ error: 'Business settings are organization-scoped. Open them from a business account.' }, { status: 400 });
    }

    const [settings, templates, signatures, history] = await Promise.all([
      getBusinessSettings(session.user.id, session.user.organizationName || session.user.name || 'Business Workspace'),
      getCustomTemplatesFromRepository(),
      getSignatureSettings(),
      getHistoryEntries(),
    ]);
    const nextSettings = {
      ...settings,
      workspaceSetupChecklist: buildWorkspaceSetupChecklist({
        ...settings,
        hasTemplates: templates.some((template) => template.organizationId === session.user.id),
        hasSignatures: (signatures.signatures || []).some((signature) => signature.organizationId === session.user.id),
        hasDocuments: history.some((entry) => entry.organizationId === session.user.id),
      }),
    };
    return NextResponse.json(nextSettings);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load business settings' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user || !canManageBusinessSettings(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (session.user.role !== 'client') {
      return NextResponse.json({ error: 'Business settings can only be updated from a business account' }, { status: 403 });
    }

    const payload = await request.json() as Partial<BusinessSettings>;
    const [existingSettings, templates, signatures, history] = await Promise.all([
      getBusinessSettings(session.user.id, session.user.organizationName || session.user.name || 'Business Workspace'),
      getCustomTemplatesFromRepository(),
      getSignatureSettings(),
      getHistoryEntries(),
    ]);
    const nextSettings: BusinessSettings = {
      organizationId: session.user.id,
      organizationName: session.user.organizationName || session.user.name || 'Business Workspace',
      displayName: payload.displayName?.trim() || session.user.organizationName || session.user.name || 'Business Workspace',
      industry: payload.industry?.trim() || 'technology',
      companySize: payload.companySize?.trim() || '1-25',
      primaryUseCase: payload.primaryUseCase?.trim() || '',
      workspacePreset: payload.workspacePreset?.trim() || 'executive_control',
      onboardingCompleted: payload.onboardingCompleted ?? true,
      onboardingCompletedAt: payload.onboardingCompleted ? new Date().toISOString() : payload.onboardingCompletedAt,
      starterTemplatesSeededAt: payload.starterTemplatesSeededAt,
      supportEmail: payload.supportEmail?.trim() || '',
      supportPhone: payload.supportPhone?.trim() || '',
      accentColor: payload.accentColor?.trim() || '#2719FF',
      watermarkLabel: payload.watermarkLabel?.trim() || 'docrud workspace',
      letterheadMode: payload.letterheadMode === 'image' || payload.letterheadMode === 'html' ? payload.letterheadMode : 'default',
      letterheadImageDataUrl: payload.letterheadImageDataUrl?.trim() || '',
      letterheadHtml: payload.letterheadHtml?.trim() || '',
      businessDescription: payload.businessDescription?.trim() || '',
      workspaceSetupChecklist: buildWorkspaceSetupChecklist({
        ...existingSettings,
        ...payload,
        displayName: payload.displayName?.trim() || session.user.organizationName || session.user.name || 'Business Workspace',
        supportEmail: payload.supportEmail?.trim() || '',
        primaryUseCase: payload.primaryUseCase?.trim() || '',
        accentColor: payload.accentColor?.trim() || '#2719FF',
        letterheadMode: payload.letterheadMode === 'image' || payload.letterheadMode === 'html' ? payload.letterheadMode : 'default',
        letterheadImageDataUrl: payload.letterheadImageDataUrl?.trim() || '',
        letterheadHtml: payload.letterheadHtml?.trim() || '',
        hasTemplates: templates.some((template) => template.organizationId === session.user.id),
        hasSignatures: (signatures.signatures || []).some((signature) => signature.organizationId === session.user.id),
        hasDocuments: history.some((entry) => entry.organizationId === session.user.id),
      }),
      updatedAt: new Date().toISOString(),
    };

    await saveBusinessSettings(nextSettings);
    await seedStarterTemplatesForBusiness(nextSettings);
    return NextResponse.json(nextSettings);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to save business settings' }, { status: 500 });
  }
}
