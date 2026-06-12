'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowRight, BookOpenText, ChevronLeft, ChevronRight, PenSquare, Search } from 'lucide-react';
import type { BlogPost, LandingSettings } from '@/types/document';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import PublicSiteChrome from '@/components/PublicSiteChrome';

interface PublicBlogPageProps {
  settings: LandingSettings;
  softwareName: string;
  accentLabel: string;
  initialPosts: BlogPost[];
  categories: string[];
}

function formatBlogDate(value?: string) {
  if (!value) return 'Today';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function buildCoverStyle(image?: string, overlay = 'rgba(15,23,42,0.34),rgba(15,23,42,0.62)') {
  return {
    backgroundImage: `linear-gradient(180deg,${overlay}),url('${image || '/homepage/hero-workspace-meet.png'}')`,
  };
}

export default function PublicBlogPage({
  settings,
  softwareName,
  accentLabel,
  initialPosts,
  categories,
}: PublicBlogPageProps) {
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated' && Boolean(session?.user);
  const [posts, setPosts] = useState<BlogPost[]>(initialPosts);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const trendingRailRef = useRef<HTMLDivElement | null>(null);
  const latestRailRef = useRef<HTMLDivElement | null>(null);
  const trendingResumeTimeoutRef = useRef<number | null>(null);
  const latestResumeTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;

    const loadPublicPosts = async () => {
      try {
        const response = await fetch('/api/blog/posts', { cache: 'no-store' });
        const payload = response.ok ? await response.json() : null;
        if (!active || !payload) return;
        setPosts(Array.isArray(payload.posts) ? payload.posts : []);
      } catch {
        if (!active) return;
      }
    };

    void loadPublicPosts();
    const interval = window.setInterval(() => {
      void loadPublicPosts();
    }, 30000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const filteredPosts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return posts.filter((post) => {
      const matchesCategory = activeCategory === 'All' || post.category === activeCategory;
      const haystack = `${post.title} ${post.excerpt} ${post.category} ${(post.tags || []).join(' ')}`.toLowerCase();
      const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [activeCategory, posts, query]);

  const featuredPost = useMemo(
    () => filteredPosts.find((post) => post.featured) || filteredPosts[0] || null,
    [filteredPosts],
  );

  const featuredPosts = useMemo(() => {
    const curated = filteredPosts.slice(0, 6);
    return curated.length ? curated : posts.slice(0, 6);
  }, [filteredPosts, posts]);

  useEffect(() => {
    if (!featuredPosts.length) return;
    setFeaturedIndex((current) => (current >= featuredPosts.length ? 0 : current));
  }, [featuredPosts]);

  useEffect(() => {
    if (featuredPosts.length <= 1) return;
    const interval = window.setInterval(() => {
      setFeaturedIndex((current) => (current + 1) % featuredPosts.length);
    }, 5200);

    return () => window.clearInterval(interval);
  }, [featuredPosts.length]);

  const secondaryPosts = useMemo(() => (
    filteredPosts.filter((post) => post.id !== featuredPost?.id).slice(0, 2)
  ), [featuredPost?.id, filteredPosts]);

  const gridPosts = useMemo(() => (
    filteredPosts.filter((post) => post.id !== featuredPost?.id && !secondaryPosts.some((entry) => entry.id === post.id))
  ), [featuredPost?.id, filteredPosts, secondaryPosts]);
  const trendingRailPosts = useMemo(() => (
    secondaryPosts.length > 1 ? [...secondaryPosts, ...secondaryPosts] : secondaryPosts
  ), [secondaryPosts]);
  const latestRailPosts = useMemo(() => (
    gridPosts.length > 1 ? [...gridPosts, ...gridPosts] : gridPosts
  ), [gridPosts]);

  useEffect(() => {
    const setupAutoRail = (
      rail: HTMLDivElement | null,
      timeoutRef: React.MutableRefObject<number | null>,
      cardSelector: string,
      speed = 0.45,
    ) => {
      if (!rail || typeof window === 'undefined') return () => undefined;

      let frameId = 0;
      let paused = false;
      let lastTime = 0;
      let isPointerDown = false;

      const getLoopPoint = () => {
        const cards = rail.querySelectorAll<HTMLElement>(cardSelector);
        return cards.length ? Math.max(0, rail.scrollWidth / 2) : 0;
      };

      const tick = (time: number) => {
        if (!lastTime) lastTime = time;
        const delta = time - lastTime;
        lastTime = time;

        if (!paused && window.innerWidth < 768) {
          rail.scrollLeft += (delta * speed) / 16;
          const loopPoint = getLoopPoint();
          if (loopPoint > 0 && rail.scrollLeft >= loopPoint) {
            rail.scrollLeft -= loopPoint;
          }
        }

        frameId = window.requestAnimationFrame(tick);
      };

      const resumeLater = () => {
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
        timeoutRef.current = window.setTimeout(() => {
          paused = false;
        }, 1800);
      };

      const pauseNow = () => {
        paused = true;
        resumeLater();
      };

      const handlePointerDown = () => {
        isPointerDown = true;
        pauseNow();
      };

      const handlePointerUp = () => {
        isPointerDown = false;
        resumeLater();
      };

      const handleScroll = () => {
        if (isPointerDown) return;
        pauseNow();
      };

      frameId = window.requestAnimationFrame(tick);
      rail.addEventListener('pointerdown', handlePointerDown, { passive: true });
      rail.addEventListener('pointerup', handlePointerUp, { passive: true });
      rail.addEventListener('pointercancel', handlePointerUp, { passive: true });
      rail.addEventListener('scroll', handleScroll, { passive: true });

      return () => {
        window.cancelAnimationFrame(frameId);
        rail.removeEventListener('pointerdown', handlePointerDown);
        rail.removeEventListener('pointerup', handlePointerUp);
        rail.removeEventListener('pointercancel', handlePointerUp);
        rail.removeEventListener('scroll', handleScroll);
        if (timeoutRef.current) {
          window.clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      };
    };

    const cleanupTrending = setupAutoRail(trendingRailRef.current, trendingResumeTimeoutRef, '[data-rail-card="trending"]');
    const cleanupLatest = setupAutoRail(latestRailRef.current, latestResumeTimeoutRef, '[data-rail-card="latest"]', 0.42);

    return () => {
      cleanupTrending();
      cleanupLatest();
    };
  }, [gridPosts.length, secondaryPosts.length]);

  const categoryMeta = useMemo(() => {
    const counts = posts.reduce<Record<string, number>>((accumulator, post) => {
      accumulator[post.category] = (accumulator[post.category] || 0) + 1;
      return accumulator;
    }, {});

    return categories
      .map((category) => ({
        name: category,
        count: counts[category] || 0,
      }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
  }, [categories, posts]);

  const hotCategories = useMemo(() => categoryMeta.slice(0, 4), [categoryMeta]);
  const moreCategories = useMemo(() => categoryMeta.slice(4), [categoryMeta]);
  const activeCategoryLabel = activeCategory === 'All'
    ? 'All categories'
    : categoryMeta.find((entry) => entry.name === activeCategory)?.name || activeCategory;

  return (
    <PublicSiteChrome softwareName={softwareName} accentLabel={accentLabel} settings={settings}>
      <section className="flex flex-col gap-4 px-1 sm:gap-5 sm:px-0">
        <div className="flex flex-col gap-4 sm:gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            <button
              type="button"
              onClick={() => setActiveCategory('All')}
              className={`rounded-full px-3.5 py-1.5 text-[11px] font-semibold tracking-[0.04em] transition ${
                activeCategory === 'All'
                  ? 'bg-[linear-gradient(135deg,#0f172a,#1e293b)] text-white shadow-[0_16px_34px_rgba(15,23,42,0.22)] ring-1 ring-slate-900/10'
                  : 'bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(255,255,255,0.72))] text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_10px_22px_rgba(148,163,184,0.12)] backdrop-blur-xl hover:bg-white hover:text-slate-900'
              }`}
            >
              All
            </button>
            {hotCategories.map((category) => (
              <button
                key={category.name}
                type="button"
                onClick={() => setActiveCategory(category.name)}
                className={`rounded-full px-3.5 py-1.5 text-[11px] font-semibold tracking-[0.04em] transition ${
                  activeCategory === category.name
                    ? 'bg-[linear-gradient(135deg,#0f172a,#1e293b)] text-white shadow-[0_16px_34px_rgba(15,23,42,0.22)] ring-1 ring-slate-900/10'
                    : 'bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(255,255,255,0.72))] text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_10px_22px_rgba(148,163,184,0.12)] backdrop-blur-xl hover:bg-white hover:text-slate-900'
                }`}
              >
                {category.name}
                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] ${
                  activeCategory === category.name
                    ? 'bg-white/14 text-white/90 ring-1 ring-white/10'
                    : 'bg-slate-100/90 text-slate-600 ring-1 ring-slate-200/70'
                }`}>
                  {category.count}
                </span>
              </button>
            ))}
            {moreCategories.length ? (
              <Select value={activeCategory} onValueChange={setActiveCategory}>
                <SelectTrigger className="h-9 w-[11rem] rounded-full border-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(255,255,255,0.72))] px-3 text-[11px] font-semibold tracking-[0.04em] text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_10px_22px_rgba(148,163,184,0.12)] backdrop-blur-xl hover:text-slate-900 sm:w-[11.5rem]">
                  <SelectValue placeholder="More categories">
                    {activeCategory !== 'All' && moreCategories.some((entry) => entry.name === activeCategory)
                      ? activeCategoryLabel
                      : 'More categories'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-[1.2rem] border-0 bg-white/90 backdrop-blur-2xl">
                  <SelectItem value="All">All categories</SelectItem>
                  {moreCategories.map((category) => (
                    <SelectItem key={category.name} value={category.name}>
                      {category.name} ({category.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center lg:w-auto">
            <div className="relative w-full sm:min-w-[18rem] lg:w-[22rem]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search blog posts"
                className="h-11 rounded-full border-0 bg-white/72 pl-10 pr-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] backdrop-blur-xl"
              />
            </div>
            <Button asChild className="h-11 rounded-full bg-slate-950 px-5 text-white hover:bg-slate-800 sm:px-5">
              <Link href={isAuthenticated ? '/blog/write' : '/login'}>
                {isAuthenticated ? 'Write a blog' : 'Login to write'}
                <PenSquare className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {featuredPosts.length ? (
        <section className="cloud-panel overflow-hidden rounded-[1.8rem] p-3.5 sm:rounded-[2rem] sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Featured</p>
              <h2 className="mt-2 text-[1.15rem] font-semibold tracking-[-0.04em] text-slate-950 sm:text-[1.35rem]">
                Editorial picks
              </h2>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <button
                type="button"
                onClick={() => setFeaturedIndex((current) => (current - 1 + featuredPosts.length) % featuredPosts.length)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/74 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] backdrop-blur-xl transition hover:bg-white"
                aria-label="Previous featured post"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setFeaturedIndex((current) => (current + 1) % featuredPosts.length)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/74 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] backdrop-blur-xl transition hover:bg-white"
                aria-label="Next featured post"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="overflow-hidden">
            <div
              className="flex transition-transform duration-700 ease-out"
              style={{ transform: `translateX(-${featuredIndex * 100}%)` }}
            >
              {featuredPosts.map((post) => (
                <div key={post.id} className="w-full shrink-0">
                  <Link
                    href={`/blog/${post.slug}`}
                    className="group grid gap-3.5 sm:gap-4 lg:grid-cols-[minmax(0,1.18fr)_minmax(18rem,0.82fr)]"
                  >
                    <div
                      className="relative min-h-[19rem] overflow-hidden rounded-[1.45rem] bg-cover bg-center sm:min-h-[28rem] sm:rounded-[1.8rem]"
                      style={buildCoverStyle(post.coverImageUrl, 'rgba(15,23,42,0.2),rgba(15,23,42,0.7)')}
                    >
                      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-slate-950/85 via-slate-900/34 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 z-10 p-4 sm:p-6">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-white/18 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
                            {post.category}
                          </span>
                          <span className="rounded-full bg-white/14 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/88">
                            {post.readTimeMinutes} min read
                          </span>
                        </div>
                        <h3 className="mt-3 max-w-xl text-[1.2rem] font-semibold tracking-[-0.05em] text-white sm:mt-4 sm:text-[1.9rem]">
                          {post.title}
                        </h3>
                        <p className="mt-2 max-w-lg text-[13px] leading-6 text-white/84 sm:mt-3 sm:text-sm sm:leading-7">
                          {post.excerpt}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col justify-between rounded-[1.45rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(255,255,255,0.56))] p-4 shadow-[0_20px_50px_rgba(15,23,42,0.06)] backdrop-blur-2xl sm:rounded-[1.8rem] sm:p-5">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Now reading</p>
                        <h3 className="mt-3 text-[1.05rem] font-semibold tracking-[-0.04em] text-slate-950 sm:mt-4 sm:text-[1.35rem]">
                          {post.title}
                        </h3>
                        <p className="mt-2 text-[13px] leading-6 text-slate-600 sm:mt-3 sm:text-sm sm:leading-7">
                          {post.excerpt}
                        </p>
                      </div>
                      <div className="mt-5 space-y-3 sm:mt-6 sm:space-y-4">
                        <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
                          <span>{post.authorName}</span>
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                          <span>{formatBlogDate(post.publishedAt || post.updatedAt)}</span>
                        </div>
                        <span className="inline-flex items-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition group-hover:bg-slate-800">
                          Read article
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </span>
                      </div>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-center gap-2">
            {featuredPosts.map((post, index) => (
              <button
                key={post.id}
                type="button"
                onClick={() => setFeaturedIndex(index)}
                className={`h-2.5 rounded-full transition-all ${
                  index === featuredIndex ? 'w-8 bg-slate-950' : 'w-2.5 bg-slate-300/90'
                }`}
                aria-label={`Go to featured post ${index + 1}`}
              />
            ))}
          </div>
        </section>
      ) : null}

      {secondaryPosts.length ? (
        <section className="space-y-4 px-1 sm:px-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Trending reads</p>
              <h2 className="mt-2 text-[1.1rem] font-semibold tracking-[-0.04em] text-slate-950">
                More from the blog
              </h2>
            </div>
          </div>
          <div
            ref={trendingRailRef}
            className="mobile-slider-edge -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 pt-0 md:hidden"
          >
            {trendingRailPosts.map((post, index) => (
              <Link
                key={`${post.id}-trending-mobile-${index}`}
                href={`/blog/${post.slug}`}
                data-rail-card="trending"
                className="group block w-[84vw] shrink-0 snap-start overflow-hidden rounded-[1.5rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(255,255,255,0.56))] p-4 shadow-[0_20px_50px_rgba(15,23,42,0.06)] backdrop-blur-2xl transition duration-300"
              >
                <div
                  className="h-40 rounded-[1.2rem] bg-cover bg-center"
                  style={buildCoverStyle(post.coverImageUrl, 'rgba(15,23,42,0.08),rgba(15,23,42,0.45)')}
                />
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-950 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
                    {post.category}
                  </span>
                  <span className="rounded-full bg-white/86 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {post.readTimeMinutes} min
                  </span>
                </div>
                <h3 className="mt-3 text-[1rem] font-semibold tracking-[-0.03em] text-slate-950">
                  {post.title}
                </h3>
                <p className="mt-2 line-clamp-2 text-[13px] leading-6 text-slate-600">
                  {post.excerpt}
                </p>
                <div className="mt-4 flex items-center justify-between text-[12px] text-slate-500">
                  <span>{formatBlogDate(post.publishedAt || post.updatedAt)}</span>
                  <span className="inline-flex items-center font-medium text-slate-800">
                    Open
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
          <div className="hidden gap-4 md:grid md:grid-cols-2">
            {secondaryPosts.map((post) => (
              <Link
                key={post.id}
                href={`/blog/${post.slug}`}
                className="group flex min-h-[15rem] flex-col justify-between overflow-hidden rounded-[1.8rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(255,255,255,0.56))] p-5 shadow-[0_20px_50px_rgba(15,23,42,0.06)] backdrop-blur-2xl transition duration-300 hover:-translate-y-1 hover:shadow-[0_26px_62px_rgba(15,23,42,0.09)]"
              >
                <div>
                  <div
                    className="h-44 rounded-[1.35rem] bg-cover bg-center"
                    style={buildCoverStyle(post.coverImageUrl, 'rgba(15,23,42,0.08),rgba(15,23,42,0.45)')}
                  />
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-950 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
                      {post.category}
                    </span>
                    <span className="rounded-full bg-white/86 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {post.readTimeMinutes} min
                    </span>
                  </div>
                  <h3 className="mt-4 text-[1.08rem] font-semibold tracking-[-0.03em] text-slate-950 transition group-hover:text-slate-700">
                    {post.title}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
                    {post.excerpt}
                  </p>
                </div>
                <div className="mt-4 flex items-center justify-between text-[12px] text-slate-500">
                  <span>{formatBlogDate(post.publishedAt || post.updatedAt)}</span>
                  <span className="inline-flex items-center font-medium text-slate-800">
                    Open
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="cloud-panel rounded-[1.8rem] px-4 py-5 sm:rounded-[2rem] sm:px-6 sm:py-7">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Latest posts</p>
            <h2 className="mt-2 text-[1.2rem] font-semibold tracking-[-0.04em] text-slate-950 sm:text-[1.45rem]">
              Browse the latest writing on docrud.
            </h2>
          </div>
          <p className="text-sm leading-6 text-slate-600">
            Clean reads, practical angles, and product stories worth opening.
          </p>
        </div>

        {gridPosts.length ? (
          <>
            <div
              ref={latestRailRef}
              className="mobile-slider-edge -mx-4 mt-5 flex gap-3 overflow-x-auto px-4 pb-2 pt-0 md:hidden"
            >
              {latestRailPosts.map((post, index) => (
                <Link
                  key={`${post.id}-latest-mobile-${index}`}
                  href={`/blog/${post.slug}`}
                  data-rail-card="latest"
                  className="group block w-[82vw] shrink-0 snap-start overflow-hidden rounded-[1.45rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(255,255,255,0.56))] shadow-[0_18px_46px_rgba(15,23,42,0.05)] backdrop-blur-2xl transition duration-300"
                >
                  <div
                    className="h-48 bg-cover bg-center"
                    style={buildCoverStyle(post.coverImageUrl, 'rgba(15,23,42,0.06),rgba(15,23,42,0.42)')}
                  />
                  <div className="p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-sky-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-700">
                        {post.category}
                      </span>
                      <span className="rounded-full bg-white/86 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {post.readTimeMinutes} min read
                      </span>
                    </div>
                    <h3 className="mt-3 text-[1rem] font-semibold tracking-[-0.03em] text-slate-950">
                      {post.title}
                    </h3>
                    <p className="mt-2 line-clamp-3 text-[13px] leading-6 text-slate-600">
                      {post.excerpt}
                    </p>
                    <div className="mt-5 flex items-center justify-between text-[12px] text-slate-500">
                      <span>{post.authorName}</span>
                      <span>{formatBlogDate(post.publishedAt || post.updatedAt)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            <div className="mt-6 hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-3">
            {gridPosts.map((post) => (
              <Link
                key={post.id}
                href={`/blog/${post.slug}`}
                className="group overflow-hidden rounded-[1.65rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(255,255,255,0.56))] shadow-[0_18px_46px_rgba(15,23,42,0.05)] backdrop-blur-2xl transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_56px_rgba(15,23,42,0.08)]"
              >
                <div
                  className="h-52 bg-cover bg-center"
                  style={buildCoverStyle(post.coverImageUrl, 'rgba(15,23,42,0.06),rgba(15,23,42,0.42)')}
                />
                <div className="p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-sky-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-700">
                      {post.category}
                    </span>
                    <span className="rounded-full bg-white/86 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {post.readTimeMinutes} min read
                    </span>
                  </div>
                  <h3 className="mt-4 text-[1.08rem] font-semibold tracking-[-0.03em] text-slate-950 transition group-hover:text-slate-700">
                    {post.title}
                  </h3>
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">
                    {post.excerpt}
                  </p>
                  <div className="mt-5 flex items-center justify-between text-[12px] text-slate-500">
                    <span>{post.authorName}</span>
                    <span>{formatBlogDate(post.publishedAt || post.updatedAt)}</span>
                  </div>
                </div>
              </Link>
            ))}
            </div>
          </>
        ) : (
          <div className="mt-6 rounded-[1.6rem] bg-white/64 px-5 py-10 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] backdrop-blur-xl">
            <BookOpenText className="mx-auto h-10 w-10 text-slate-400" />
            <h3 className="mt-4 text-[1.05rem] font-semibold tracking-[-0.03em] text-slate-950">
              Nothing matches that filter yet.
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Try another topic or a lighter search phrase.
            </p>
          </div>
        )}
      </section>
    </PublicSiteChrome>
  );
}
