import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { runGlobalSearch } from '@/lib/server/global-search';
import { runIntelligentSearch } from '@/lib/server/intelligent-search';
import type { SearchEntityType } from '@/lib/server/search-intelligence';

const ENTITY_TYPES: SearchEntityType[] = ['person', 'service', 'business', 'job', 'gig', 'post', 'file', 'feature', 'product', 'event'];

function parseCsv(value: string | null) {
  if (!value) return [];
  return value.split(',').map((part) => part.trim()).filter(Boolean);
}

function normalizeSource(value: string) {
  const token = value.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (token === 'public') return 'public' as const;
  if (token === 'history' || token === 'docs' || token === 'documents') return 'history' as const;
  if (token === 'templates' || token === 'template') return 'templates' as const;
  if (token === 'transfers' || token === 'filetransfers' || token === 'filetransfer') return 'transfers' as const;
  if (token === 'knowledge' || token === 'kb' || token === 'knowledgebase') return 'knowledge' as const;
  if (token === 'web' || token === 'websources' || token === 'sources') return 'web_sources' as const;
  return null;
}

function normalizeBadge(value: string) {
  const token = value.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!token) return null;
  if (token === 'gig' || token === 'gigs') return 'GIG';
  if (token === 'resume' || token === 'resumes' || token === 'talent') return 'RESUME';
  return value.trim().toUpperCase();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('query') || searchParams.get('q') || '').trim();
  if (!query) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 });
  }

  const rawLimit = searchParams.get('limit');
  const limit = rawLimit ? Number(rawLimit) : undefined;
  const scopes = parseCsv(searchParams.get('scope')).filter((value) => value === 'public' || value === 'workspace') as Array<'public' | 'workspace'>;
  const sources = parseCsv(searchParams.get('in') || searchParams.get('source'))
    .map(normalizeSource)
    .filter(Boolean) as Array<'public' | 'history' | 'templates' | 'transfers' | 'knowledge' | 'web_sources'>;
  const types = parseCsv(searchParams.get('type')).filter((value) => value === 'feature' || value === 'page' || value === 'file' || value === 'article') as Array<'feature' | 'page' | 'file' | 'article'>;
  const badges = parseCsv(searchParams.get('badge')).map(normalizeBadge).filter(Boolean) as string[];

  const session = await getAuthSession();
  const sessionUser = session?.user?.id
    ? {
        id: session.user.id,
        email: session.user.email,
        role: session.user.role,
        permissions: session.user.permissions,
      }
    : null;

  /* Intelligent mode — natural-language understanding, business/job entities,
     hybrid ranking, grouping. Opt-in via `mode=intelligent` so every existing
     caller of this endpoint keeps its exact current behaviour and shape.
     `ai=1` additionally allows the optional Groq query expansion (never on a
     keystroke — the caller decides). */
  const mode = (searchParams.get('mode') || '').trim().toLowerCase();
  if (mode === 'intelligent' || mode === 'nl') {
    const requestedTypes = parseCsv(searchParams.get('type'))
      .map((t) => t.trim().toLowerCase())
      .filter((t): t is SearchEntityType => (ENTITY_TYPES as string[]).includes(t));
    try {
      const payload = await runIntelligentSearch({
        query,
        user: sessionUser,
        limit: Number.isFinite(limit as number) ? (limit as number) : 24,
        types: requestedTypes.length ? requestedTypes : undefined,
        viewerLocation: searchParams.get('location'),
        useAi: searchParams.get('ai') === '1',
      });
      // `results` is kept at the top level so a client can consume this response
      // with the same reader it uses for the classic mode.
      return NextResponse.json(payload, { status: 200, headers: { 'Cache-Control': 'no-store' } });
    } catch {
      // Any failure in the intelligent layer falls through to the proven
      // lexical engine below rather than surfacing an error to the user.
    }
  }

  const results = await runGlobalSearch({
    query,
    user: sessionUser,
    limit: Number.isFinite(limit as number) ? (limit as number) : 12,
    filters: {
      scopes: scopes.length ? scopes : undefined,
      sources: sources.length ? sources : undefined,
      types: types.length ? types : undefined,
      badges: badges.length ? badges : undefined,
    },
  });

  return NextResponse.json(
    {
      query,
      results,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
