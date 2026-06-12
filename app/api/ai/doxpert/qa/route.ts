import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { generateAiText, getAiModelName, isAiConfigured, normalizeAiText, parseStructuredJson } from '@/lib/server/ai';
import { normalizeDoxpertContent } from '@/lib/server/doxpert';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type QaResponse = {
  answer: string;
  evidenceQuotes: string[];
  confidence: number;
  provider: string;
  model: string;
};

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function fallbackQa(content: string, question: string): QaResponse {
  const tokens = question
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((t) => t.length >= 4)
    .slice(0, 12);
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  const scored = lines
    .map((line) => ({
      line,
      score: tokens.reduce((sum, token) => sum + (line.toLowerCase().includes(token) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score)
    .filter((item) => item.score > 0)
    .slice(0, 4);

  return {
    answer: scored.length
      ? 'I found potentially relevant text in the document. Review the evidence quotes below to confirm the exact answer.'
      : 'I could not find a strong match in the visible text. Try asking with more specific keywords, or paste a larger excerpt.',
    evidenceQuotes: scored.map((item) => item.line.slice(0, 240)),
    confidence: scored.length ? 45 : 20,
    provider: 'Fallback search',
    model: 'local-keyword-match',
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Login is required.' }, { status: 401 });
    }

    const payload = await request.json().catch(() => ({})) as {
      title?: string;
      content?: string;
      question?: string;
    };

    const title = String(payload.title || 'Untitled document');
    const question = String(payload.question || '').trim();
    const normalizedContent = normalizeDoxpertContent(String(payload.content || ''));

    if (!question) {
      return NextResponse.json({ error: 'Question is required.' }, { status: 400 });
    }
    if (!normalizedContent.trim()) {
      return NextResponse.json({ error: 'Document content is required.' }, { status: 400 });
    }

    if (!isAiConfigured()) {
      return NextResponse.json(fallbackQa(normalizedContent, question));
    }

    const raw = await generateAiText([
      {
        role: 'system',
        content: [
          'You answer questions strictly from the provided document text.',
          'If the answer is not in the text, say you cannot find it and suggest what to look for.',
          'Return strict JSON only with keys: answer, evidenceQuotes, confidence.',
          'evidenceQuotes must be short verbatim snippets from the document (max 4).',
          'confidence is an integer 0-100 based on how directly the quotes support the answer.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({
          title,
          question,
          content: normalizedContent.slice(0, 16000),
        }),
      },
    ]);

    const parsed = parseStructuredJson<{ answer?: unknown; evidenceQuotes?: unknown; confidence?: unknown }>(raw);
    const answer = normalizeAiText(parsed.answer) || 'I could not find a supported answer in the visible text.';
    const evidenceQuotes = Array.isArray(parsed.evidenceQuotes)
      ? parsed.evidenceQuotes.map((q) => normalizeAiText(q)).filter(Boolean).slice(0, 4)
      : [];
    const confidence = clamp(typeof parsed.confidence === 'number' ? parsed.confidence : Number(parsed.confidence));

    return NextResponse.json({
      answer,
      evidenceQuotes,
      confidence,
      provider: 'Groq',
      model: getAiModelName(),
    } satisfies QaResponse);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to answer question.' }, { status: 500 });
  }
}

