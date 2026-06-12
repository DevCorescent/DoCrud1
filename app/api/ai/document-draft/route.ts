import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { generateAiText, getAiModelName, isAiConfigured, normalizeAiText, parseStructuredJson } from '@/lib/server/ai';
import { DocumentField } from '@/types/document';
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
        return NextResponse.json({ error: 'Your free AI tries are used up. Upgrade to docrud Workspace Pro to continue drafting with AI.' }, { status: 403 });
      }
    }
    if (!isAiConfigured()) {
      return NextResponse.json({ error: 'AI is not configured. Add GROQ_API_KEY to enable AI features.' }, { status: 503 });
    }

    const payload = await request.json() as {
      templateName?: string;
      category?: string;
      templateHtml?: string;
      instructions?: string;
      fields?: DocumentField[];
      currentData?: Record<string, string>;
    };

    if (!payload.templateName || !Array.isArray(payload.fields) || payload.fields.length === 0) {
      return NextResponse.json({ error: 'Template name and fields are required' }, { status: 400 });
    }

    const raw = await generateAiText([
      {
        role: 'system',
        content: [
          'You are Docrud AI document composer.',
          'Generate a complete first-draft dataset for an enterprise document template.',
          'Return strict JSON only.',
          'Top-level keys must be "documentBrief" and "fieldValues".',
          'fieldValues must be an object keyed exactly by each field name provided.',
          'For date fields, return YYYY-MM-DD.',
          'For email fields, return realistic corporate email values when needed.',
          'For textarea fields, return polished business-ready content, not notes.',
          'If currentData is already populated, improve and complete it instead of discarding it.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({
          templateName: payload.templateName,
          category: payload.category || 'General',
          instructions: payload.instructions || 'Create a strong, professional first draft suitable for enterprise use.',
          templateHtml: payload.templateHtml || '',
          fields: payload.fields.map((field) => ({
            name: field.name,
            label: field.label,
            type: field.type,
            required: field.required,
            placeholder: field.placeholder || '',
            options: field.options || [],
          })),
          currentData: payload.currentData || {},
        }),
      },
    ]);

    const parsed = parseStructuredJson<{
      documentBrief?: string;
      fieldValues?: Record<string, string>;
    }>(raw);

    const normalizedFieldValues = payload.fields.reduce<Record<string, string>>((acc, field) => {
      const value = parsed.fieldValues?.[field.name];
      acc[field.name] = normalizeAiText(value);
      return acc;
    }, {});

    if (session.user.email && (session.user.role === 'client' || session.user.role === 'individual')) {
      await consumeAiUsageByEmail(session.user.email);
    }

    return NextResponse.json({
      documentBrief: normalizeAiText(parsed.documentBrief),
      fieldValues: normalizedFieldValues,
      provider: 'Groq',
      model: getAiModelName(),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to generate AI draft' }, { status: 500 });
  }
}
