import Link from 'next/link';
import { ArrowLeft, ArrowRight, BookOpenText } from 'lucide-react';
import type { BlogPost, LandingSettings } from '@/types/document';
import PublicSiteChrome from '@/components/PublicSiteChrome';

interface PublicBlogArticlePageProps {
  settings: LandingSettings;
  softwareName: string;
  accentLabel: string;
  post: BlogPost;
  relatedPosts: BlogPost[];
}

function formatBlogDate(value?: string) {
  if (!value) return 'Today';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function renderBlogContent(content: string) {
  const blocks = content.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);

  return blocks.map((block, index) => {
    if (block.startsWith('## ')) {
      return (
        <h2 key={index} className="mt-10 text-[1.45rem] font-semibold tracking-[-0.04em] text-slate-950">
          {block.replace(/^##\s+/, '')}
        </h2>
      );
    }
    if (block.startsWith('# ')) {
      return (
        <h1 key={index} className="mt-10 text-[1.8rem] font-semibold tracking-[-0.05em] text-slate-950">
          {block.replace(/^#\s+/, '')}
        </h1>
      );
    }

    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    return (
      <p key={index} className="mt-6 text-[15px] leading-8 text-slate-700">
        {lines.join(' ')}
      </p>
    );
  });
}

export default function PublicBlogArticlePage({
  settings,
  softwareName,
  accentLabel,
  post,
  relatedPosts,
}: PublicBlogArticlePageProps) {
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.seoTitle || post.title,
    description: post.seoDescription || post.excerpt,
    datePublished: post.publishedAt || post.updatedAt,
    dateModified: post.updatedAt,
    author: {
      '@type': 'Person',
      name: post.authorName,
    },
    publisher: {
      '@type': 'Organization',
      name: softwareName,
    },
    image: post.coverImageUrl ? [post.coverImageUrl] : undefined,
    keywords: post.tags?.join(', '),
    articleSection: post.category,
  };

  return (
    <PublicSiteChrome softwareName={softwareName} accentLabel={accentLabel} settings={settings}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />

      <section className="cloud-panel overflow-hidden rounded-[2rem] p-4 sm:p-5 lg:p-6">
        <div
          className="min-h-[17rem] rounded-[1.8rem] bg-cover bg-center p-5 sm:p-7"
          style={{ backgroundImage: `linear-gradient(180deg,rgba(15,23,42,0.28),rgba(15,23,42,0.62)),url('${post.coverImageUrl || '/homepage/hero-workspace-meet.png'}')` }}
        >
          <Link href="/blog" className="inline-flex items-center rounded-full bg-white/22 px-4 py-2 text-sm font-medium text-white backdrop-blur-xl hover:bg-white/30">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to blog
          </Link>
          <div className="mt-10 max-w-4xl">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-white/18 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
                {post.category}
              </span>
              <span className="rounded-full bg-white/18 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
                {post.readTimeMinutes} min read
              </span>
            </div>
            <h1 className="mt-4 text-[1.8rem] font-semibold tracking-[-0.06em] text-white sm:text-[2.5rem] lg:text-[3rem]">
              {post.title}
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/82 sm:text-[15px]">
              {post.excerpt}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-white/80">
              <span>{post.authorName}</span>
              <span className="h-1.5 w-1.5 rounded-full bg-white/60" />
              <span>{formatBlogDate(post.publishedAt || post.updatedAt)}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.72fr_0.28fr]">
        <article className="cloud-panel rounded-[2rem] px-5 py-6 sm:px-7 sm:py-8">
          <div className="max-w-3xl">
            {renderBlogContent(post.content)}
          </div>
        </article>

        <aside className="space-y-5">
          <div className="cloud-panel rounded-[1.8rem] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">About this post</p>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="rounded-[1.15rem] bg-white/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                <p className="font-semibold text-slate-900">Published</p>
                <p className="mt-1">{formatBlogDate(post.publishedAt || post.updatedAt)}</p>
              </div>
              <div className="rounded-[1.15rem] bg-white/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                <p className="font-semibold text-slate-900">Reading time</p>
                <p className="mt-1">{post.readTimeMinutes} minutes</p>
              </div>
              <div className="rounded-[1.15rem] bg-white/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                <p className="font-semibold text-slate-900">Tags</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(post.tags || []).map((tag) => (
                    <span key={tag} className="rounded-full bg-slate-950 px-3 py-1 text-[11px] font-medium text-white">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="cloud-panel rounded-[1.8rem] p-5">
            <div className="flex items-center gap-2">
              <BookOpenText className="h-4.5 w-4.5 text-slate-900" />
              <h2 className="text-[1rem] font-semibold tracking-[-0.03em] text-slate-950">Keep reading</h2>
            </div>
            <div className="mt-4 space-y-3">
              {relatedPosts.map((item) => (
                <Link key={item.id} href={`/blog/${item.slug}`} className="block rounded-[1.2rem] bg-white/72 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] transition hover:bg-white">
                  <p className="text-sm font-semibold tracking-[-0.02em] text-slate-950">{item.title}</p>
                  <p className="mt-2 text-[12px] leading-5 text-slate-600">{item.excerpt}</p>
                  <span className="mt-3 inline-flex items-center text-[12px] font-medium text-slate-700">
                    Read next
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </PublicSiteChrome>
  );
}
