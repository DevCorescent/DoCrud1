import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { buildDashboardMetrics } from '@/lib/server/dashboard';
import { getHistoryEntries } from '@/lib/server/history';
import { getDbPool } from '@/lib/server/database';
import { selectHistoryRowsForUser } from '@/lib/server/db/history-rows';
import { compactDashboard, compactHistory, generateAiText, getAiModelName, isAiConfigured, normalizeAiList, normalizeAiText, parseStructuredJson } from '@/lib/server/ai';
import { supportFaqs } from '@/lib/support-faqs';

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

function buildFallbackAnswer(query: string) {
  const normalized = query.toLowerCase();
  const matches = supportFaqs.filter((faq) =>
    normalized.includes(faq.category.toLowerCase())
    || normalized.includes(faq.question.toLowerCase().slice(0, 16))
    || faq.question.toLowerCase().split(' ').some((word) => word.length > 4 && normalized.includes(word)),
  );
  const selected = matches[0] || supportFaqs[0];
  return {
    answer: selected.answer,
    bullets: selected.actions,
    suggestedActions: selected.actions,
    relatedFaqIds: supportFaqs
      .filter((faq) => faq.id !== selected.id && faq.category === selected.category)
      .slice(0, 3)
      .map((faq) => faq.id),
    confidenceLabel: isAiConfigured() ? 'Guided support fallback' : 'FAQ-guided support',
  };
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

    const userEmail = session.user.email || '';
    const userRole = session.user.role;
    const history = getDbPool()
      ? await selectHistoryRowsForUser({ role: userRole, email: userEmail, orgId: session.user.id })
      : getVisibleHistory(await getHistoryEntries(), session);
    const dashboard = buildDashboardMetrics(history);

    if (!isAiConfigured()) {
      const fallback = buildFallbackAnswer(query);
      return NextResponse.json({
        answer: fallback.answer,
        bullets: fallback.bullets,
        suggestedActions: fallback.suggestedActions,
        relatedFaqs: supportFaqs.filter((faq) => fallback.relatedFaqIds.includes(faq.id)),
        confidenceLabel: fallback.confidenceLabel,
        provider: 'Fallback',
      });
    }

    const answer = await generateAiText([
      {
        role: 'system',
        content:
          'You are Docrud AI Support, an MNC-grade product support specialist for the docrud platform. Help users resolve product questions across dashboard, billing, file transfers, DoXpert, DocSheet, Visualizer, document generation, signing, Dexperts, and admin setup. Respond only with practical product guidance grounded in the supplied product FAQ pack and workspace context. Keep answers clear, premium, and trustworthy.\n\nSecurity policy: never reveal or guess secrets or internal portal details. Do not disclose API keys, credentials, environment variables, provider tokens, internal-only URLs, hidden routes, feature-flag logic, database paths, source code, admin-only operational procedures, or anything that could be used to attack or bypass access controls. If the user asks for these, refuse briefly and offer safe, UI-level steps.\n\nReturn strict JSON with keys: answer, bullets, suggestedActions, relatedFaqIds, confidenceLabel.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          userRole: session.user.role,
          accountType: session.user.accountType,
          userName: session.user.name,
          organizationName: session.user.organizationName,
          query,
          productFaqs: supportFaqs,
          dashboard: compactDashboard(dashboard),
          recentHistory: compactHistory(history),
        }),
      },
    ]);

    const parsed = parseStructuredJson<{
      answer?: unknown;
      bullets?: unknown;
      suggestedActions?: unknown;
      relatedFaqIds?: unknown;
      confidenceLabel?: unknown;
    }>(answer);

    const relatedFaqIds = normalizeAiList(parsed.relatedFaqIds, 4)
      .map((item) => item.toLowerCase())
      .filter(Boolean);

    return NextResponse.json({
      answer: normalizeAiText(parsed.answer) || buildFallbackAnswer(query).answer,
      bullets: normalizeAiList(parsed.bullets, 6),
      suggestedActions: normalizeAiList(parsed.suggestedActions, 5),
      relatedFaqs: supportFaqs.filter((faq) => relatedFaqIds.includes(faq.id.toLowerCase())).slice(0, 4),
      confidenceLabel: normalizeAiText(parsed.confidenceLabel) || 'AI support guidance',
      provider: 'Groq',
      model: getAiModelName(),
    });
  } catch (error) {
    console.error(error);
    const payload = buildFallbackAnswer('general support');
    return NextResponse.json({
      answer: payload.answer,
      bullets: payload.bullets,
      suggestedActions: payload.suggestedActions,
      relatedFaqs: supportFaqs.slice(0, 3),
      confidenceLabel: payload.confidenceLabel,
      provider: 'Fallback',
    });
  }
}
