import { NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { compactDashboard, compactHistory, generateAiText, getAiModelName, isAiConfigured, normalizeAiList, normalizeAiText, parseStructuredJson } from '@/lib/server/ai';
import { buildDashboardMetrics } from '@/lib/server/dashboard';
import { getHistoryEntries } from '@/lib/server/history';
import { getDbPool } from '@/lib/server/database';
import { selectHistoryRowsForUser } from '@/lib/server/db/history-rows';
import { consumeAiUsageByEmail, getAiEntitlementSnapshot } from '@/lib/server/saas';

export const dynamic = 'force-dynamic';

function getVisibleHistory(history: Awaited<ReturnType<typeof getHistoryEntries>>, session: Awaited<ReturnType<typeof getAuthSession>>) {
  if (session?.user?.role === 'admin') return history;
  if (session?.user?.role === 'employee') {
    return history.filter((entry) => entry.employeeEmail?.toLowerCase() === (session.user.email || '').toLowerCase());
  }
  if (session?.user?.role === 'client') {
    return history.filter((entry) => entry.organizationId === session.user.id || entry.clientEmail?.toLowerCase() === (session.user.email || '').toLowerCase());
  }
  return history.filter((entry) => entry.generatedBy === session?.user?.email);
}

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role === 'client' || session.user.role === 'individual') {
      const storedUser = (await getStoredUsers()).find((user) => user.email === session.user.email);
      const aiEntitlement = storedUser ? await getAiEntitlementSnapshot(storedUser) : null;
      if (!aiEntitlement?.allowed) {
        return NextResponse.json({ error: 'Your free AI tries are used up. Upgrade to docrud Workspace Pro to continue using AI workspace insights.' }, { status: 403 });
      }
    }
    if (!isAiConfigured()) {
      return NextResponse.json({ error: 'AI is not configured. Add GROQ_API_KEY to enable AI features.' }, { status: 503 });
    }

    const userEmail = session.user.email || '';
    const userRole = session.user.role;
    const history = getDbPool()
      ? await selectHistoryRowsForUser({ role: userRole, email: userEmail, orgId: session.user.id })
      : getVisibleHistory(await getHistoryEntries(), session);
    const dashboard = buildDashboardMetrics(history);
    const signedDocuments = dashboard.documentSummary.filter((item) => item.signCount > 0).length;
    const pendingFeedback = dashboard.documentSummary.reduce((total, item) => total + (item.pendingFeedbackCount || 0), 0);

    const raw = await generateAiText([
      {
        role: 'system',
        content: 'You are Docrud AI workspace analyst. Produce a concise enterprise operations briefing. Reply strictly in JSON with keys briefing, priorities, bottlenecks, opportunities. The non-briefing keys should be arrays of short strings.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          role: session.user.role,
          dashboard: compactDashboard(dashboard),
          history: compactHistory(history),
        }),
      },
    ]);

    const parsed = parseStructuredJson<{
      briefing?: string;
      priorities?: string[];
      bottlenecks?: string[];
      opportunities?: string[];
    }>(raw);

    if (session.user.email && (session.user.role === 'client' || session.user.role === 'individual')) {
      await consumeAiUsageByEmail(session.user.email);
    }

    return NextResponse.json({
      briefing: normalizeAiText(parsed.briefing),
      priorities: normalizeAiList(parsed.priorities),
      bottlenecks: normalizeAiList(parsed.bottlenecks),
      opportunities: normalizeAiList(parsed.opportunities),
      generatedAt: new Date().toISOString(),
      metrics: {
        totalDocuments: dashboard.totalDocuments,
        documentsThisWeek: dashboard.documentsThisWeek,
        signedDocuments,
        pendingFeedback,
      },
      provider: 'Groq',
      model: getAiModelName(),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to generate workspace insights' }, { status: 500 });
  }
}
