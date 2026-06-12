import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getHistoryEntries, updateHistoryEntry } from '@/lib/server/history';
import { deriveOnboardingProgress, deriveOnboardingStage } from '@/lib/server/onboarding';

export const dynamic = 'force-dynamic';

function isAdmin(session: Awaited<ReturnType<typeof getAuthSession>>) {
  return session?.user?.role === 'admin';
}

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const history = await getHistoryEntries();
    return NextResponse.json(history.filter((entry) => entry.onboardingRequired));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load onboarding records' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await request.json() as {
      id?: string;
      action?: 'verify_bgv' | 'reject_bgv' | 'reply_question';
      notes?: string;
      questionId?: string;
      reply?: string;
    };
    if (!payload.id || !payload.action) {
      return NextResponse.json({ error: 'Document id and action are required' }, { status: 400 });
    }

    const updated = await updateHistoryEntry(payload.id, (entry) => {
      if (payload.action === 'reply_question' && payload.questionId) {
        const next = {
          ...entry,
          employeeQuestions: (entry.employeeQuestions || []).map((question) =>
            question.id === payload.questionId
              ? {
                  ...question,
                  reply: payload.reply?.trim() || question.reply,
                  repliedAt: new Date().toISOString(),
                  repliedBy: session?.user?.email || 'admin',
                  status: 'resolved' as const,
                }
              : question
          ),
          automationNotes: [...(entry.automationNotes || []), 'Admin replied to employee onboarding question'],
        };
        return next;
      }

      const backgroundVerificationStatus = payload.action === 'verify_bgv'
        ? ('verified' as const)
        : ('rejected' as const);
      const documentsVerificationStatus = payload.action === 'verify_bgv'
        ? ('verified' as const)
        : ('rejected' as const);
      const next = {
        ...entry,
        backgroundVerificationStatus,
        documentsVerificationStatus,
        backgroundVerificationNotes: payload.notes?.trim() || entry.backgroundVerificationNotes,
        documentsVerificationNotes: payload.notes?.trim() || entry.documentsVerificationNotes,
        backgroundVerificationVerifiedAt: new Date().toISOString(),
        backgroundVerificationVerifiedBy: session?.user?.email || 'admin',
        documentsVerifiedAt: new Date().toISOString(),
        documentsVerifiedBy: session?.user?.email || 'admin',
        automationNotes: [...(entry.automationNotes || []), `Background verification ${backgroundVerificationStatus} by ${session?.user?.email || 'admin'}`],
      };
      return {
        ...next,
        onboardingStage: deriveOnboardingStage(next),
        onboardingProgress: deriveOnboardingProgress(next),
      };
    });

    if (!updated) {
      return NextResponse.json({ error: 'Onboarding record not found' }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to update onboarding status' }, { status: 500 });
  }
}
