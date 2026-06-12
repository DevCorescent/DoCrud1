import { NextRequest, NextResponse } from 'next/server';
import { generateAiText, isAiConfigured, parseStructuredJson } from '@/lib/server/ai';
import { preserveDocumentStructure } from '@/lib/document-parser-analysis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AssistIntent = 'polish' | 'one-pager' | 'formal' | 'simplify';
type ExtendedAssistIntent = AssistIntent | 'proofread' | 'structure' | 'summary' | 'actions';

const intentPrompts: Record<ExtendedAssistIntent, string> = {
  polish: 'Make the document cleaner, better structured, and easier to edit daily while preserving meaning.',
  'one-pager': 'Condense the document into a tighter one-page style draft while preserving core meaning.',
  formal: 'Rewrite the document in a more professional, polished, business-ready tone.',
  simplify: 'Rewrite the document into simpler, clearer, more readable language while preserving meaning.',
  proofread: 'Correct grammar, punctuation, spacing, and awkward phrasing while preserving the exact meaning.',
  structure: 'Rebuild the document into clearer sections, headings, and flow while preserving the meaning.',
  summary: 'Create a concise executive-ready version of this document while preserving the critical points.',
  actions: 'Rewrite the document so key decisions, actions, and follow-ups become clearer and easier to act on.',
};

export async function POST(request: NextRequest) {
  try {
    const { text, intent } = await request.json() as { text?: string; intent?: ExtendedAssistIntent };
    const source = preserveDocumentStructure(String(text || ''));
    const action = intent && intent in intentPrompts ? intentPrompts[intent] : intentPrompts.polish;

    if (!source.trim()) {
      return NextResponse.json({ error: 'Editable text is required.' }, { status: 400 });
    }

    if (!isAiConfigured()) {
      return NextResponse.json({
        refinedText: source,
        summary: 'AI is not configured, so the original editable text was kept.',
        bullets: [],
        mode: 'fallback',
      });
    }

    const response = await generateAiText([
      {
        role: 'system',
        content: 'You improve editable document text. Return strict JSON with keys: refinedText, summary, bullets. bullets must be a short array of concrete notes. Keep facts accurate and do not invent data.',
      },
      {
        role: 'user',
        content: `Instruction: ${action}\n\nDocument text:\n${source.slice(0, 18000)}`,
      },
    ]);

    const parsed = parseStructuredJson<{ refinedText?: string; summary?: string; bullets?: string[] }>(response);
    return NextResponse.json({
      refinedText: preserveDocumentStructure(String(parsed.refinedText || source)),
      summary: String(parsed.summary || 'AI refinement applied.'),
      bullets: Array.isArray(parsed.bullets) ? parsed.bullets.map((item) => String(item).trim()).filter(Boolean).slice(0, 6) : [],
      mode: 'ai',
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to refine the document right now.' },
      { status: 500 },
    );
  }
}
