import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { appendHistoryEntry, deleteHistoryEntry, getHistoryEntries, getHistoryEntryById, updateHistoryEntry } from '@/lib/server/history';
import { DocumentHistory } from '@/types/document';
import { defaultBackgroundVerificationDocuments, ensureEmployeeAccessAccount, isOnboardingTemplate } from '@/lib/server/onboarding';
import { getStoredUserByEmail } from '@/lib/server/users';
import { getDbPool } from '@/lib/server/database';
import { selectHistoryRowsForUser } from '@/lib/server/db/history-rows';
import { canUserAccessFeature, getUserUsageSummary } from '@/lib/server/saas';
import { getBusinessSettings } from '@/lib/server/business';
import { applyWatermarkToPdfDataUrl } from '@/lib/server/shared-uploaded-pdf';

export const dynamic = 'force-dynamic';

function getEmployeeName(payload: Partial<DocumentHistory>) {
  return payload.employeeName
    || payload.clientName
    || payload.data?.internFullName
    || payload.data?.engagedIndividualName
    || payload.data?.employeeName
    || 'Employee';
}

function getEmployeeEmail(payload: Partial<DocumentHistory>) {
  return payload.employeeEmail
    || payload.clientEmail
    || payload.data?.employeeEmail
    || payload.data?.internEmail
    || payload.data?.candidateEmail
    || payload.data?.email
    || '';
}

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userEmail = session.user.email || '';
    const userRole = session.user.role;
    let visibleHistory;
    if (getDbPool()) {
      visibleHistory = await selectHistoryRowsForUser({ role: userRole, email: userEmail, orgId: session.user.id });
    } else {
      const history = await getHistoryEntries();
      const isPlanScopedUser = userRole === 'client' || userRole === 'individual';
      visibleHistory = userRole === 'admin'
        ? history
        : userRole === 'employee'
          ? history.filter((entry) => entry.employeeEmail?.toLowerCase() === userEmail.toLowerCase())
        : isPlanScopedUser
          ? history.filter((entry) => entry.organizationId === session.user.id || entry.clientEmail?.toLowerCase() === userEmail.toLowerCase())
          : history.filter((entry) => entry.generatedBy === userEmail);
    }

    return NextResponse.json(visibleHistory);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load history' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json() as Partial<DocumentHistory>;
    const storedUser = await getStoredUserByEmail(session.user.email || '');
    const isPlanScopedUser = storedUser?.role === 'client' || storedUser?.role === 'individual';
    if (isPlanScopedUser && storedUser) {
      const [canGenerate, usageSummary] = await Promise.all([
        canUserAccessFeature(storedUser, 'generate_documents'),
        getUserUsageSummary(storedUser),
      ]);

      if (!canGenerate) {
        return NextResponse.json({ error: 'Your current plan does not include document generation.' }, { status: 403 });
      }

      if (usageSummary.usage.limitReached) {
        return NextResponse.json({
          error: `You have reached the document generation limit for the ${usageSummary.plan?.name || 'current'} plan. Upgrade the plan to continue generating documents.`,
        }, { status: 403 });
      }
    }

    const onboardingRequired = payload.onboardingRequired ?? isOnboardingTemplate(payload.templateId, payload.category);
    const employeeEmail = getEmployeeEmail(payload).trim().toLowerCase();
    const employeeName = getEmployeeName(payload).trim();
    const employeeAccount = onboardingRequired && employeeEmail
      ? await ensureEmployeeAccessAccount({
          employeeName,
          employeeEmail,
          permissions: [String(payload.templateId || 'internship-letter')],
        })
      : null;
    const [clientPlanUsage, clientBusinessSettings] = storedUser?.role === 'client' && storedUser
      ? await Promise.all([
          getUserUsageSummary(storedUser),
          getBusinessSettings(storedUser.id, storedUser.organizationName),
        ])
      : [null, null];
    const shouldApplyFreeWatermark = Boolean(
      isPlanScopedUser
      && clientPlanUsage?.plan?.watermarkOnFreeGenerations
      && clientPlanUsage.usage.totalGeneratedDocuments < (clientPlanUsage.plan?.freeDocumentGenerations ?? 5),
    );
    const resolvedWatermarkLabel = shouldApplyFreeWatermark
      ? (clientBusinessSettings?.watermarkLabel || (storedUser?.role === 'individual' ? 'docrud workspace' : 'docrud workspace'))
      : payload.editorState?.watermarkLabel;
    const uploadedPdfDataUrl = payload.documentSourceType === 'uploaded_pdf' && payload.uploadedPdfDataUrl
      ? await applyWatermarkToPdfDataUrl(payload.uploadedPdfDataUrl, resolvedWatermarkLabel)
      : payload.uploadedPdfDataUrl;

    const historyEntry = await appendHistoryEntry({
      ...payload,
      uploadedPdfDataUrl,
      generatedBy: session.user.email || payload.generatedBy || 'unknown',
      generatedAt: payload.generatedAt || new Date().toISOString(),
      clientEmail: isPlanScopedUser ? storedUser?.email : payload.clientEmail || undefined,
      clientName: isPlanScopedUser ? storedUser?.name : payload.clientName || undefined,
      clientOrganization: storedUser?.role === 'client' ? storedUser.organizationName : payload.clientOrganization || undefined,
      organizationId: storedUser?.role === 'client' ? storedUser.id : payload.organizationId,
      organizationName: storedUser?.role === 'client' ? storedUser.organizationName : payload.organizationName,
      shareAccessPolicy: payload.shareAccessPolicy,
      shareExpiresAt: payload.shareExpiresAt === null ? undefined : payload.shareExpiresAt,
      maxAccessCount: payload.maxAccessCount === null ? undefined : payload.maxAccessCount,
      employeeName: employeeName || undefined,
      employeeEmail: employeeEmail || undefined,
      onboardingRequired,
      backgroundVerificationRequired: onboardingRequired,
      requiredDocumentWorkflowEnabled: onboardingRequired ? true : payload.requiredDocumentWorkflowEnabled,
      requiredDocuments: onboardingRequired ? defaultBackgroundVerificationDocuments : payload.requiredDocuments,
      backgroundVerificationStatus: onboardingRequired ? 'not_started' : payload.backgroundVerificationStatus,
      onboardingCredentials: employeeAccount ? {
        email: employeeAccount.user.email,
        temporaryPassword: employeeAccount.temporaryPassword,
        generatedAt: new Date().toISOString(),
      } : payload.onboardingCredentials,
      automationNotes: [
        ...(payload.automationNotes || []),
        ...(employeeAccount ? [`Employee onboarding credentials generated for ${employeeAccount.user.email}`] : []),
        ...(isPlanScopedUser ? [`Generated under plan ${storedUser?.subscription?.planName || 'Current plan'}`] : []),
      ],
      editorState: {
        ...(payload.editorState || {}),
        watermarkLabel: resolvedWatermarkLabel,
      },
    });

    return NextResponse.json(historyEntry, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to save history' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json() as Partial<DocumentHistory> & { id?: string };
    if (!payload.id) {
      return NextResponse.json({ error: 'History ID is required' }, { status: 400 });
    }

    const current = await getHistoryEntryById(payload.id);
    if (!current) {
      return NextResponse.json({ error: 'History entry not found' }, { status: 404 });
    }

    const allowed = session.user.role === 'admin'
      || ((session.user.role === 'client' || session.user.role === 'individual') && (current.organizationId === session.user.id || current.clientEmail?.toLowerCase() === (session.user.email || '').toLowerCase()))
      || (session.user.role === 'employee' && current.employeeEmail?.toLowerCase() === (session.user.email || '').toLowerCase())
      || current.generatedBy === session.user.email;
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updated = await updateHistoryEntry(payload.id, (entry) => ({
      ...entry,
      ...payload,
      deliveryHistory: payload.deliveryHistory || entry.deliveryHistory,
      shareExpiresAt: payload.shareExpiresAt === null ? undefined : (payload.shareExpiresAt ?? entry.shareExpiresAt),
      maxAccessCount: payload.maxAccessCount === null ? undefined : (payload.maxAccessCount ?? entry.maxAccessCount),
    }));

    if (!updated) {
      return NextResponse.json({ error: 'History entry not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to update history' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'History ID is required' }, { status: 400 });
    }

    const current = await getHistoryEntryById(id);
    if (!current) {
      return NextResponse.json({ error: 'History entry not found' }, { status: 404 });
    }

    const allowed = session.user.role === 'admin'
      || ((session.user.role === 'client' || session.user.role === 'individual') && (current.organizationId === session.user.id || current.clientEmail?.toLowerCase() === (session.user.email || '').toLowerCase()))
      || (session.user.role === 'employee' && current.employeeEmail?.toLowerCase() === (session.user.email || '').toLowerCase())
      || current.generatedBy === session.user.email;

    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const deleted = await deleteHistoryEntry(id);
    if (!deleted) {
      return NextResponse.json({ error: 'History entry not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to delete history entry' }, { status: 500 });
  }
}
