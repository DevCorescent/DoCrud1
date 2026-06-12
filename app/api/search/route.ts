import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { runGlobalSearch } from '@/lib/server/global-search';

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
  const results = await runGlobalSearch({
    query,
    user: session?.user?.id
      ? {
          id: session.user.id,
          email: session.user.email,
          role: session.user.role,
          permissions: session.user.permissions,
        }
      : null,
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
