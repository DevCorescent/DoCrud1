import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import TrendsBoard from '@/components/trends/TrendsBoard';
import { buildPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Trends | Docrud',
  description:
    'What the market is talking about right now — community trends pushed up or down by Docrud members, charted like a market over time.',
  path: '/trends',
  keywords: ['market trends', 'industry trends', 'community trends', 'docrud trends'],
});

export default function TrendsPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0A0A0C] text-white">
      <header className="sticky top-0 z-30 shrink-0 border-b border-white/[0.06]"
        style={{ height: 56, background: 'rgba(10,10,12,0.96)', backdropFilter: 'blur(20px) saturate(180%)' }}>
        <div className="flex h-full items-center gap-3 px-3 sm:px-5 lg:px-8">
          <Link href="/" aria-label="Back to home"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.04] text-white/48 transition-all hover:bg-white/[0.08] hover:text-white">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="truncate text-[15px] font-bold tracking-[-0.01em] text-white">Trends</span>
        </div>
      </header>

      <main className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-3xl px-3 pb-20 pt-6 sm:px-5 lg:px-8">
          <p className="mb-5 text-[13px] leading-relaxed text-white/40">
            Add what you are seeing in the market. Everyone pushes each trend up or down, and the
            running score is recorded once a day — so the line is the community&apos;s real verdict
            over time, not a forecast.
          </p>
          <TrendsBoard variant="full" />
        </div>
      </main>
    </div>
  );
}
