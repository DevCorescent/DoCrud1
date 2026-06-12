import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import type { DocumentField } from '@/types/document';
import { generateAiText, getAiModelName, isAiConfigured, normalizeAiText, parseStructuredJson } from '@/lib/server/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function coerceStringMap(input: unknown) {
  if (!input || typeof input !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const key = String(k || '').trim();
    if (!key) continue;
    out[key] = typeof v === 'string' ? v : v == null ? '' : String(v);
  }
  return out;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!isAiConfigured()) {
      return NextResponse.json({ error: 'AI is not configured. Add GROQ_API_KEY to enable AI features.' }, { status: 503 });
    }

    const payload = await request.json().catch(() => null) as any;
    const templateName = String(payload?.templateName || '').trim();
    const category = String(payload?.category || '').trim();
    const description = String(payload?.description || '').trim();
    const fields = Array.isArray(payload?.fields) ? payload.fields as DocumentField[] : [];

    if (!fields.length) return NextResponse.json({ error: 'Fields are required.' }, { status: 400 });

    const raw = await generateAiText([
      {
        role: 'system',
        content: [
          'You generate example field values for a document template preview.',
          'Return strict JSON only with top-level keys: exampleData, notes.',
          'exampleData must be an object mapping field.name -> value.',
          'Do not include real personal phone numbers, Aadhaar numbers, PAN numbers, or real emails. Use safe placeholders.',
          'Keep values realistic for India/enterprise docs when relevant, but generic and non-identifying.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({
          templateName,
          category,
          description,
          fields: fields.map((f) => ({
            name: f.name,
            label: f.label,
            type: f.type,
            required: Boolean(f.required),
            placeholder: (f as any).placeholder,
          })),
        }),
      },
    ]);

    const parsed = parseStructuredJson<{ exampleData?: unknown; notes?: unknown }>(raw);
    const exampleData = coerceStringMap(parsed.exampleData);
    if (!Object.keys(exampleData).length) {
      return NextResponse.json({ error: 'AI did not return example values.' }, { status: 502 });
    }

    return NextResponse.json({
      exampleData,
      notes: normalizeAiText(parsed.notes) || '',
      provider: 'Groq',
      model: getAiModelName(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate example values.' },
      { status: 500 },
    );
  }
}

