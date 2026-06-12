import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { generateAiText, getAiModelName, isAiConfigured, parseStructuredJson } from '@/lib/server/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!isAiConfigured()) {
      return NextResponse.json({ error: 'AI is not configured. Add GROQ_API_KEY to enable AI features.' }, { status: 503 });
    }

    const payload = await request.json().catch(() => null) as any;
    const prompt = String(payload?.prompt || '').trim();
    const source = String(payload?.source || '').trim();
    const templateName = String(payload?.templateName || '').trim();
    const category = String(payload?.category || '').trim();

    if (!prompt) return NextResponse.json({ error: 'Prompt is required.' }, { status: 400 });
    if (!source) return NextResponse.json({ error: 'Template source is required.' }, { status: 400 });

    const raw = await generateAiText([
      {
        role: 'system',
        content: [
          'You are a Template Studio AI Styler.',
          'You receive a template source string that contains HTML with an optional <style> block.',
          'Return strict JSON only with top-level key "source".',
          'The returned "source" must be a single string that contains:',
          '1) one <style>...</style> block (CSS)',
          '2) the HTML markup after it',
          'Do not wrap in markdown fences.',
          'Do not remove or rename placeholder variables in {{doubleBraces}} form.',
          'Keep the output printable (A4/Letter), clean spacing, and enterprise style.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({
          templateName,
          category,
          instruction: prompt,
          source,
        }),
      },
    ]);

    const parsed = parseStructuredJson<{ source?: unknown }>(raw);
    const nextSource = typeof parsed.source === 'string' ? parsed.source.trim() : '';
    if (!nextSource) {
      return NextResponse.json({ error: 'AI did not return a valid styled template.' }, { status: 502 });
    }

    return NextResponse.json({
      source: nextSource,
      provider: 'Groq',
      model: getAiModelName(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to style template.' },
      { status: 500 },
    );
  }
}

