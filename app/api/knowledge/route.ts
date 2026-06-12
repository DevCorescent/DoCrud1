import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { createKnowledgeBaseEntry, listKnowledgeBaseEntries } from '@/lib/server/knowledge-base';
import { generateAiText, isAiConfigured, parseStructuredJson } from '@/lib/server/ai';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const category = searchParams.get('category') || '';
  const limit = Number(searchParams.get('limit') || '20');
  const offset = Number(searchParams.get('offset') || '0');

  const result = await listKnowledgeBaseEntries({ q, category, limit, offset });
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json().catch(() => null) as any;
    if (!payload) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

    const title = String(payload.title || '').trim();
    const query = String(payload.query || '').trim();
    const category = String(payload.category || '').trim();
    let summary = String(payload.summary || '').trim();
    const sources = Array.isArray(payload.sources) ? payload.sources : [];

    if (!title || !query || !category) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // If UI didn't get an AI summary yet, create one server-side (GROQ if configured, else snippet-based).
    if (!summary) {
      if (isAiConfigured() && sources.length) {
        const structured = await generateAiText([
          { role: 'system', content: 'Summarize the sources concisely. Avoid hype. Output JSON.' },
          {
            role: 'user',
            content: JSON.stringify({
              query,
              sources: sources.slice(0, 8),
              outputJsonShape: { summary: 'string', keyPoints: ['string'] },
            }),
          },
        ]);
        try {
          const parsed = parseStructuredJson<{ summary?: string; keyPoints?: string[] }>(structured);
          summary = String(parsed.summary || '').trim();
          payload.keyPoints = Array.isArray(parsed.keyPoints) ? parsed.keyPoints : payload.keyPoints;
        } catch {
          // fallback below
        }
      }
    }
    if (!summary) {
      const snippets = sources
        .map((s: any) => String(s?.snippet || '').trim())
        .filter(Boolean)
        .join(' ')
        .slice(0, 700);
      summary = snippets || `Published search: ${query}`;
    }

    const entry = await createKnowledgeBaseEntry({
      title,
      query,
      category,
      tags: Array.isArray(payload.tags) ? payload.tags.map(String) : [],
      summary,
      keyPoints: Array.isArray(payload.keyPoints) ? payload.keyPoints.map(String) : [],
      sentiment: payload.sentiment && typeof payload.sentiment === 'object' ? payload.sentiment : {},
      sources,
      publishedBy: session.user.email || session.user.name || 'user',
      publishedByUserId: session.user.id,
      visibility: 'public',
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Publish failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
