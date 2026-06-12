import { NextResponse } from 'next/server';
import { generateAiText, isAiConfigured, parseStructuredJson } from '@/lib/server/ai';
import { getAuthSession } from '@/lib/server/auth';
import { searchWebSources } from '@/lib/server/web-sources';
import { getSearchingNow, recordRealtimeSearch } from '@/lib/server/realtime-search';
import { runGlobalSearch } from '@/lib/server/global-search';

type AiSearchPayload = {
  query: string;
  mode: 'portal' | 'web';
  searchingNow: { totalNow: number; sameQueryNow: number; windowMs: number };
  results: Array<{ title: string; url: string; snippet?: string; tags?: string[]; category?: string; label?: string }>;
  ai: {
    summary: string;
    keyPoints: string[];
    sentiment: { label: 'positive' | 'neutral' | 'negative' | 'mixed'; notes: string };
  } | null;
  warnings: string[];
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') || '').trim();
  const mode = (searchParams.get('mode') || 'portal') === 'web' ? 'web' : 'portal';
  const category = (searchParams.get('category') || '').trim();
  const tags = (searchParams.get('tags') || '').split(',').map((t) => t.trim()).filter(Boolean);
  if (!query) {
    return NextResponse.json({ error: 'Missing q' }, { status: 400 });
  }

  recordRealtimeSearch(query);
  const searchingNow = getSearchingNow(query);

  const warnings: string[] = [];

  const session = await getAuthSession();

  let results: Array<{ title: string; url: string; snippet?: string }> = [];

  if (mode === 'web') {
    if (!session?.user?.id) {
      return NextResponse.json(
        {
          query,
          mode,
          searchingNow,
          results: [],
          ai: null,
          warnings: ['Log in to add web sources, then search within them.'],
        } satisfies AiSearchPayload,
        { status: 200 },
      );
    }
    results = await searchWebSources({ ownerUserId: session.user.id, query, limit: 8, category: category || undefined, tags });
    if (!results.length) {
      warnings.push('No matching web sources found yet. Add sources (paste URLs) first.');
    }
  } else {
    const portalResults = await runGlobalSearch({
      query,
      user: session?.user?.id
        ? {
            id: session.user.id,
            email: session.user.email,
            role: session.user.role,
            permissions: session.user.permissions,
          }
        : null,
      limit: 12,
    });
    results = portalResults.map((item) => ({
      title: item.title,
      url: item.href,
      snippet: item.description,
      tags: [],
      category: item.category,
      label: item.badge,
    }));
  }

  if (!isAiConfigured()) {
    return NextResponse.json(
      {
        query,
        mode,
        searchingNow,
        results,
        ai: null,
        warnings: [...warnings, 'AI is not configured. Set GROQ_API_KEY to enable AI summaries.'],
      } satisfies AiSearchPayload,
      { status: 200 },
    );
  }

  if (!results.length) {
    return NextResponse.json(
      {
        query,
        mode,
        searchingNow,
        results,
        ai: null,
        warnings,
      } satisfies AiSearchPayload,
      { status: 200 },
    );
  }

  const structured = await generateAiText([
    {
      role: 'system',
      content:
        'You are an AI search summarizer inside a product. Be concise, factual, and avoid hype. If the sources disagree, say so.',
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: mode === 'web'
          ? 'Summarize the user-provided web sources for the query. Provide a short summary, 4-6 key points, and a sentiment label of the overall coverage tone (positive/neutral/negative/mixed) with one-line notes.'
          : 'Summarize the docrud portal matches for the query. Provide a short summary, 4-6 key points, and a sentiment label of the overall coverage tone (positive/neutral/negative/mixed) with one-line notes.',
        query,
        results: results.map((r) => ({ title: r.title, url: r.url, snippet: r.snippet })),
        outputJsonShape: {
          summary: 'string',
          keyPoints: ['string'],
          sentiment: { label: 'positive|neutral|negative|mixed', notes: 'string' },
        },
      }),
    },
  ]);

  let ai: AiSearchPayload['ai'] = null;
  try {
    const parsed = parseStructuredJson<{
      summary?: string;
      keyPoints?: string[];
      sentiment?: { label?: string; notes?: string };
    }>(structured);
    const label = String(parsed.sentiment?.label || 'neutral').toLowerCase();
    ai = {
      summary: String(parsed.summary || '').trim().slice(0, 900),
      keyPoints: Array.isArray(parsed.keyPoints)
        ? parsed.keyPoints.map((p) => String(p).trim()).filter(Boolean).slice(0, 6)
        : [],
      sentiment: {
        label: (label === 'positive' || label === 'negative' || label === 'mixed') ? (label as any) : 'neutral',
        notes: String(parsed.sentiment?.notes || '').trim().slice(0, 280),
      },
    };
    if (!ai.summary) ai = null;
  } catch {
    warnings.push('AI summary could not be parsed. Showing raw results only.');
  }

  return NextResponse.json(
    {
      query,
      mode,
      searchingNow,
      results,
      ai,
      warnings,
    } satisfies AiSearchPayload,
    { status: 200 },
  );
}
