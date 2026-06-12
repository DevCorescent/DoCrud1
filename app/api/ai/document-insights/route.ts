import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { generateAiText, getAiModelName, isAiConfigured, normalizeAiList, normalizeAiText, parseStructuredJson } from '@/lib/server/ai';
import { consumeAiUsageByEmail, getAiEntitlementSnapshot } from '@/lib/server/saas';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role === 'client' || session.user.role === 'individual') {
      const storedUser = (await getStoredUsers()).find((user) => user.email === session.user.email);
      const aiEntitlement = storedUser ? await getAiEntitlementSnapshot(storedUser) : null;
      if (!aiEntitlement?.allowed) {
        return NextResponse.json({ error: 'Your free AI tries are used up. Upgrade to docrud Workspace Pro to continue using document insights.' }, { status: 403 });
      }
    }
    if (!isAiConfigured()) {
      return NextResponse.json({ error: 'AI is not configured. Add GROQ_API_KEY to enable AI features.' }, { status: 503 });
    }

    const payload = await request.json() as {
      templateName?: string;
      category?: string;
      data?: Record<string, string>;
      previewHtml?: string;
      internalSummary?: string;
      complianceNotes?: string;
      clauseLibrary?: string[];
    };

    if (!payload.templateName) {
      return NextResponse.json({ error: 'Template name is required' }, { status: 400 });
    }

    const prompt = JSON.stringify({
      templateName: payload.templateName,
      category: payload.category,
      data: payload.data || {},
      previewHtml: payload.previewHtml || '',
      internalSummary: payload.internalSummary || '',
      complianceNotes: payload.complianceNotes || '',
      clauseLibrary: payload.clauseLibrary || [],
      requiredOutput: {
        summary: '2-3 sentence executive summary',
        risks: ['top 3 risks or watchouts'],
        clauseSuggestions: ['3 suggested clauses or content blocks to review'],
        nextActions: ['3 practical next actions before sending or approving'],
      },
    });

    const raw = await generateAiText([
      {
        role: 'system',
        content: 'You are Docrud AI document intelligence. Analyze enterprise documents for summary, risks, clause suggestions, and next actions. Reply strictly in JSON with keys summary, risks, clauseSuggestions, nextActions. Each array should contain short strings only.',
      },
      { role: 'user', content: prompt },
    ]);

    const parsed = parseStructuredJson<{
      summary?: string;
      risks?: string[];
      clauseSuggestions?: string[];
      nextActions?: string[];
    }>(raw);

    if (session.user.email && (session.user.role === 'client' || session.user.role === 'individual')) {
      await consumeAiUsageByEmail(session.user.email);
    }

    return NextResponse.json({
      summary: normalizeAiText(parsed.summary),
      risks: normalizeAiList(parsed.risks),
      clauseSuggestions: normalizeAiList(parsed.clauseSuggestions),
      nextActions: normalizeAiList(parsed.nextActions),
      provider: 'Groq',
      model: getAiModelName(),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to generate document insights' }, { status: 500 });
  }
}
