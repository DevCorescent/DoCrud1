import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { buildDashboardMetrics } from '@/lib/server/dashboard';
import { getHistoryEntries } from '@/lib/server/history';
import { getDbPool } from '@/lib/server/database';
import { selectHistoryRowsForUser } from '@/lib/server/db/history-rows';
import { compactDashboard, compactHistory, generateAiText, getAiModelName, isAiConfigured, normalizeAiText, parseBullets } from '@/lib/server/ai';

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

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json() as { query?: string };
    const query = payload.query?.trim();
    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
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
    const answer = await generateAiText([
      {
        role: 'system',
        content: 'You are the Docrud operations copilot. Give concise, business-grade answers grounded only in the supplied dashboard and document data. Be specific, practical, and action-oriented. Use short bullets when useful.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          userRole: session.user.role,
          userName: session.user.name,
          query,
          dashboard: compactDashboard(dashboard),
          recentHistory: compactHistory(history),
        }),
      },
    ]);
    const normalizedAnswer = normalizeAiText(answer);

    return NextResponse.json({
      text: normalizedAnswer,
      bullets: parseBullets(normalizedAnswer).slice(0, 6),
      provider: 'Groq',
      model: getAiModelName(),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to generate assistant response' }, { status: 500 });
  }
}
