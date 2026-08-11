import { NextResponse } from 'next/server';
import { getFileTransfers } from '@/lib/server/file-transfers';
import { getDbPool } from '@/lib/server/database';
import { selectPublicFileTransfersForFeed } from '@/lib/server/db/file-transfers-rows';

export const dynamic = 'force-dynamic';

const CATEGORY_MAP: Record<string, string> = {
  design: 'Design',
  development: 'Development',
  dev: 'Development',
  code: 'Development',
  writing: 'Writing',
  content: 'Writing',
  marketing: 'Marketing',
  productivity: 'Productivity',
  ai: 'AI Tools',
  'ai tools': 'AI Tools',
  career: 'Career',
  resume: 'Career',
  document: 'Productivity',
  finance: 'Productivity',
  legal: 'Writing',
  other: 'Productivity',
};

const ILK_MAP: Record<string, string> = {
  Design: 'design',
  Development: 'code',
  Writing: 'writing',
  Marketing: 'ai',
  Productivity: 'writing',
  'AI Tools': 'ai',
  Career: 'writing',
};

const CAT_CLS_MAP: Record<string, string> = {
  Design: 'text-pink-400 bg-pink-500/[0.12] border-pink-500/[0.20]',
  Development: 'text-emerald-400 bg-emerald-500/[0.12] border-emerald-500/[0.20]',
  Writing: 'text-blue-400 bg-blue-500/[0.12] border-blue-500/[0.20]',
  Marketing: 'text-purple-400 bg-purple-500/[0.12] border-purple-500/[0.20]',
  Productivity: 'text-cyan-400 bg-cyan-500/[0.12] border-cyan-500/[0.20]',
  'AI Tools': 'text-amber-400 bg-amber-500/[0.12] border-amber-500/[0.20]',
  Career: 'text-rose-400 bg-rose-500/[0.12] border-rose-500/[0.20]',
};

const AUTHOR_BGS = [
  'from-pink-500 to-rose-600',
  'from-blue-500 to-indigo-600',
  'from-purple-500 to-violet-600',
  'from-orange-500 to-amber-600',
  'from-teal-500 to-emerald-600',
  'from-cyan-500 to-blue-600',
  'from-fuchsia-500 to-pink-600',
  'from-red-500 to-rose-600',
];

function fmtCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

function initials(name: string) {
  return name.split(' ').map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase() || '??';
}

export async function GET() {
  try {
    // Public filtering happens in MongoDB; dataUrl (avg ~95 KB/doc) stays there
    // and only the prefix tests this route needs come back as booleans.
    const transfers = getDbPool()
      ? await selectPublicFileTransfersForFeed({ moderationFiltered: false })
      : (await getFileTransfers()).filter(
          (t) =>
            t.directoryVisibility === 'public' &&
            t.authMode === 'public' &&
            !t.revokedAt,
        );

    const items = transfers
      .map((t, i) => {
        const hasImageDataUrl =
          (t as { hasImageDataUrl?: boolean }).hasImageDataUrl ??
          !!t.dataUrl?.startsWith('data:image/');
        const hasHtmlDataUrl =
          (t as { hasHtmlDataUrl?: boolean }).hasHtmlDataUrl ??
          !!t.dataUrl?.startsWith('data:text/html');
        const rawCat = (t.directoryCategory ?? '').toLowerCase().trim();
        const displayCat = CATEGORY_MAP[rawCat] ?? 'Productivity';
        const author = t.uploadedBy?.split('@')[0] ?? 'Anonymous';
        return {
          id: t.id,
          shareId: t.shareId || t.id,
          category: displayCat,
          catCls: CAT_CLS_MAP[displayCat] ?? CAT_CLS_MAP.Productivity,
          ilk: ILK_MAP[displayCat] ?? 'writing',
          title: t.title || t.fileName,
          description: t.notes?.slice(0, 120) || `${displayCat} resource`,
          author,
          authorAv: initials(author),
          authorBg: AUTHOR_BGS[i % AUTHOR_BGS.length],
          likes: fmtCount(t.likesCount ?? 0),
          likesRaw: t.likesCount ?? 0,
          comments: t.commentsCount ?? 0,
          href: `/published/${t.id}`,
          // Resolve thumbnail URL — never expose raw base64 data: URLs to the feed
          thumbnailUrl: (() => {
            const u = t.thumbnailUrl;
            // 1. Explicit valid URL (API path or https://)
            if (u && !u.startsWith('data:')) return u;
            // 2. Main content is an image → thumbnail endpoint handles it
            if (t.mimeType?.startsWith('image/') && hasImageDataUrl) {
              return `/api/public/thumbnail/${t.id}`;
            }
            // 3. HTML gallery post/product → thumbnail endpoint parses first image
            if (
              t.mimeType === 'text/html' &&
              (t.directoryCategory === 'post' || t.directoryCategory === 'product') &&
              hasHtmlDataUrl
            ) {
              return `/api/public/thumbnail/${t.id}`;
            }
            return null;
          })(),
          mimeType: t.mimeType || null,
          createdAt: t.createdAt,
          featured: !!(t.featured && t.featuredUntil && new Date(t.featuredUntil) > new Date()),
        };
      });

    // Sort by recency first, boosted by engagement
    const sorted = [...items].sort((a, b) => {
      const aScore = new Date(a.createdAt).getTime() / 1000 + (a.likesRaw * 50) + (a.comments * 30);
      const bScore = new Date(b.createdAt).getTime() / 1000 + (b.likesRaw * 50) + (b.comments * 30);
      return bScore - aScore;
    });

    // De-duplicate and cap at 16
    const seen = new Set<string>();
    const picks: typeof items = [];
    for (const item of sorted) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        picks.push(item);
        if (picks.length >= 16) break;
      }
    }

    return NextResponse.json({ feeds: picks });
  } catch {
    return NextResponse.json({ feeds: [] });
  }
}
