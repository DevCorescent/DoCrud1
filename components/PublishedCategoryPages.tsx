'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Award,
  BarChart2,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Crown,
  Heart,
  Image as ImageIcon,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Play,
  Send,
  Share2,
  Star,
  ThumbsUp,
  Trash2,
  TrendingUp,
  Trophy,
  Video as VideoIcon,
  X as XIcon,
} from 'lucide-react';

/* ─── Shared Types ────────────────────────────────────────────────── */
type PublishedItem = {
  id: string;
  shareId?: string;
  category: string;
  badge: string;
  title: string;
  byline: string;
  body: string;
  chips?: string[];
  stats?: { v: string; l: string }[];
  postedAt: string;
  featured?: boolean;
  isReal?: boolean;
  dataUrl?: string;
  mimeType?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
};

type Comment = {
  id: string;
  author: string;
  initials: string;
  color: string;
  text: string;
  timestamp: string;
  likes: number;
  parentId?: string;
  userId?: string;
  likedByMe: boolean;
  replies: Comment[];
};

interface CategoryPageProps {
  item: PublishedItem;
  likeCount: number;
  liked: boolean;
  toggleLike: () => void;
  trendCount: number;
  trended: boolean;
  toggleTrend: () => void;
  comments: Comment[];
  commentText: string;
  displayName: string;
  setCommentText: (v: string) => void;
  submitComment: () => void;
  submitReply: (parentId: string, text: string) => void;
  likeComment: (commentId: string) => void;
  editComment?: (commentId: string, text: string) => void;
  deleteComment?: (commentId: string) => void;
  currentUserId?: string;
  totalComments: number;
  commentRef: React.RefObject<HTMLTextAreaElement>;
}

/* ─── Helper Functions ────────────────────────────────────────────── */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function randomColor(): string {
  const c = [
    'bg-emerald-600', 'bg-blue-600', 'bg-violet-600', 'bg-orange-600',
    'bg-pink-600', 'bg-teal-600', 'bg-rose-600', 'bg-indigo-600',
    'bg-amber-600', 'bg-cyan-600',
  ];
  return c[Math.floor(Math.random() * c.length)];
}

/* ═══════════════════════════════════════════════════════════════════
   1. PostDetailContent — Instagram/LinkedIn style post
═══════════════════════════════════════════════════════════════════ */
/* ─── Image slider helper ────────────────────────────────────────── */
export function extractImagesFromGalleryHtml(dataUrl: string): string[] {
  try {
    // dataUrl is "data:text/html;base64,..."
    const b64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
    const html = atob(b64);
    const re = /<img[^>]+src="([^"]+)"/g;
    const srcs: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) srcs.push(m[1]);
    return srcs.filter(Boolean);
  } catch {
    return [];
  }
}

export function ImageSlider({ images }: { images: string[] }) {
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const touchStart = useRef<number | null>(null);

  const prev = () => setIndex((i) => (i - 1 + images.length) % images.length);
  const next = () => setIndex((i) => (i + 1) % images.length);

  const onTouchStart = (e: React.TouchEvent) => { touchStart.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStart.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStart.current;
    if (Math.abs(dx) > 40) dx < 0 ? next() : prev();
    touchStart.current = null;
  };

  if (images.length === 1) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-black cursor-zoom-in" onClick={() => setLightbox(true)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[0]} alt="Post image" className="w-full max-h-[520px] object-contain" />
        {lightbox && (
          <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center" onClick={() => setLightbox(false)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={images[0]} alt="Full image" className="max-h-screen max-w-screen-lg object-contain p-4" />
            <button className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" onClick={() => setLightbox(false)}><XIcon className="h-5 w-5" /></button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div
        className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-black select-none"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Main image */}
        <div className="relative" style={{ aspectRatio: '16/10' }}>
          {images.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt={`Image ${i + 1}`}
              className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-300 cursor-zoom-in ${i === index ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              onClick={() => setLightbox(true)}
            />
          ))}
          {/* Gradient overlays for arrows */}
          <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-black/50 to-transparent pointer-events-none rounded-l-2xl" />
          <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-black/50 to-transparent pointer-events-none rounded-r-2xl" />
          {/* Prev/Next */}
          <button onClick={prev} aria-label="Previous" className="absolute left-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 border border-white/15 text-white backdrop-blur-sm transition hover:bg-black/80 hover:scale-110 active:scale-95">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button onClick={next} aria-label="Next" className="absolute right-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 border border-white/15 text-white backdrop-blur-sm transition hover:bg-black/80 hover:scale-110 active:scale-95">
            <ChevronRight className="h-5 w-5" />
          </button>
          {/* Counter badge */}
          <div className="absolute top-3 right-3 rounded-full bg-black/70 border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-white/80 backdrop-blur-sm">
            {index + 1} / {images.length}
          </div>
        </div>

        {/* Dot indicators */}
        <div className="flex items-center justify-center gap-1.5 py-3 bg-black/30">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`Go to image ${i + 1}`}
              className={`rounded-full transition-all duration-200 ${i === index ? 'w-5 h-2 bg-white' : 'w-2 h-2 bg-white/30 hover:bg-white/60'}`}
            />
          ))}
        </div>

        {/* Thumbnail strip */}
        {images.length > 1 && (
          <div className="flex gap-2 px-3 pb-3 overflow-x-auto scrollbar-hide">
            {images.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={src}
                alt={`Thumbnail ${i + 1}`}
                onClick={() => setIndex(i)}
                className={`h-14 w-14 shrink-0 rounded-lg object-cover cursor-pointer border-2 transition-all ${i === index ? 'border-white/70 opacity-100 scale-105' : 'border-transparent opacity-50 hover:opacity-80'}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[200] bg-black/97 flex flex-col items-center justify-center gap-4" onClick={() => setLightbox(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={images[index]} alt={`Image ${index + 1}`} className="max-h-[85vh] max-w-[90vw] object-contain rounded-xl" onClick={(e) => e.stopPropagation()} />
          <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
            <button onClick={prev} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"><ChevronLeft className="h-5 w-5" /></button>
            <span className="text-sm text-white/50">{index + 1} / {images.length}</span>
            <button onClick={next} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"><ChevronRight className="h-5 w-5" /></button>
          </div>
          <button className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" onClick={() => setLightbox(false)}><XIcon className="h-5 w-5" /></button>
        </div>
      )}
    </>
  );
}

export function PostDetailContent({
  item, likeCount, liked, toggleLike, trendCount, trended, toggleTrend,
  comments, commentText, displayName,
  setCommentText, submitComment, submitReply, likeComment,
  editComment, deleteComment, currentUserId,
  totalComments, commentRef,
}: CategoryPageProps) {
  const [heartBurst, setHeartBurst] = useState(false);

  const handleLike = () => {
    toggleLike();
    if (!liked) {
      setHeartBurst(true);
      setTimeout(() => setHeartBurst(false), 600);
    }
  };

  const hashtags = item.chips ?? [];
  // Photo posts have no user title — caption lives in body/notes only.
  // Never render item.title (often auto-filled from fileName or "post").
  const hasRealCaption = Boolean(item.body && item.body.trim());

  // Resolve images from real dataUrl (base64 or R2 https URL), gallery HTML, or thumbnail fallback
  const isHttpImage = !!item.dataUrl && /^https?:\/\//i.test(item.dataUrl) && !!item.mimeType?.startsWith('image/');
  const isSingleImage = !!item.dataUrl && !!item.mimeType && item.mimeType.startsWith('image/') && (
    item.dataUrl.startsWith('data:image/') || isHttpImage
  );
  const isGallery = !!item.dataUrl && item.mimeType === 'text/html';
  const galleryImages: string[] = isGallery ? extractImagesFromGalleryHtml(item.dataUrl!) : [];
  const fallbackThumb = item.thumbnailUrl && !item.thumbnailUrl.startsWith('data:') ? item.thumbnailUrl : null;

  return (
    <div className="space-y-6">
      {/* Media section — full-bleed on mobile (parent is px-0); rounded inset from sm+ */}
      {isSingleImage ? (
        <div className="overflow-hidden sm:rounded-2xl sm:border sm:border-white/[0.08] bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.dataUrl} alt="" className="w-full max-h-[520px] object-contain" loading="lazy" decoding="async" />
        </div>
      ) : isGallery && galleryImages.length > 0 ? (
        <ImageSlider images={galleryImages} />
      ) : fallbackThumb ? (
        <div className="overflow-hidden sm:rounded-2xl sm:border sm:border-white/[0.08] bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fallbackThumb} alt="" className="w-full max-h-[520px] object-contain" loading="lazy" decoding="async" />
        </div>
      ) : (
        /* fallback gradient placeholder */
        <div className="relative h-64 sm:h-80 w-full overflow-hidden sm:rounded-2xl bg-gradient-to-br from-rose-500/20 via-pink-600/15 to-purple-700/20 sm:border sm:border-white/[0.08] flex items-center justify-center">
          <div className="absolute inset-0 bg-gradient-to-br from-rose-400/10 via-transparent to-purple-600/10" />
          <div className="relative flex flex-col items-center gap-3 text-white/20">
            <ImageIcon className="h-16 w-16" />
          </div>
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0A0A0C]/80 to-transparent" />
        </div>
      )}

      {/* Text / actions / comments — pad on mobile so content stays inside page margins (parent is px-0) */}
      <div className="space-y-6 px-4 sm:px-0">
      {/* Author row */}
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-sm font-bold text-white ${randomColor()}`}>
          {initials(item.byline.split('·')[0].trim())}
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{item.byline.split('·')[0].trim()}</p>
          <p className="text-xs text-white/35">
            {item.byline.split('·').slice(1).join('·').trim()} · {timeAgo(item.postedAt)}
          </p>
        </div>
      </div>

      {/* Caption = body/notes only — never item.title */}
      {hasRealCaption && (
        <div className="space-y-4">
          {item.body.split('\n\n').filter(Boolean).map((para, i) => (
            <p key={i} className="text-[15px] leading-[1.85] text-white/70">{para}</p>
          ))}
        </div>
      )}

      {/* Engagement row */}
      <div className="flex items-center gap-4 py-3 border-t border-b border-white/[0.07]">
        <button
          type="button"
          onClick={handleLike}
          aria-label={liked ? 'Unlike' : 'Like'}
          className={`relative inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 ${
            liked
              ? 'bg-rose-500/15 text-rose-400'
              : 'bg-white/[0.04] text-white/45 hover:bg-white/[0.08] hover:text-white/80'
          }`}
        >
          <span
            className={`transition-transform duration-200 ${heartBurst ? 'scale-150' : 'scale-100'}`}
            style={heartBurst ? { filter: 'drop-shadow(0 0 8px #f43f5e)' } : {}}
          >
            <Heart className={`h-4 w-4 ${liked ? 'fill-rose-400 text-rose-400' : ''}`} />
          </span>
          <span className="tabular-nums">{likeCount}</span>
        </button>

        <button
          type="button"
          onClick={toggleTrend}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 ${
            trended ? 'bg-orange-500/15 text-orange-400' : 'bg-white/[0.04] text-white/45 hover:bg-white/[0.08] hover:text-orange-400'
          }`}
        >
          <TrendingUp className={`h-4 w-4 transition-transform ${trended ? 'scale-110' : ''}`} />
          <span className="tabular-nums">{trendCount > 0 ? trendCount : ''}</span>
        </button>

        <button
          type="button"
          onClick={() => commentRef.current?.focus()}
          className="inline-flex items-center gap-2 rounded-xl bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/45 transition hover:bg-white/[0.08] hover:text-white/80"
        >
          <MessageCircle className="h-4 w-4" />
          <span className="tabular-nums">{totalComments}</span>
        </button>
      </div>

      {/* Hashtags */}
      {hashtags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {hashtags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-rose-500/20 bg-rose-500/[0.06] px-3 py-1 text-xs font-medium text-rose-400/80"
            >
              #{tag.replace(/\s+/g, '')}
            </span>
          ))}
        </div>
      )}

      {/* Comments */}
      <CommentSection
        comments={comments}
        commentText={commentText}
        displayName={displayName}
        setCommentText={setCommentText}
        submitComment={submitComment}
        submitReply={submitReply}
        likeComment={likeComment}
        editComment={editComment}
        deleteComment={deleteComment}
        currentUserId={currentUserId}
        totalComments={totalComments}
        commentRef={commentRef}
      />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   2. PollDetailContent — Interactive live poll
═══════════════════════════════════════════════════════════════════ */
export function PollDetailContent({
  item, likeCount, liked, toggleLike, trendCount, trended, toggleTrend,
  comments, commentText, displayName,
  setCommentText, submitComment, submitReply, likeComment,
  editComment, deleteComment, currentUserId,
  totalComments, commentRef,
}: CategoryPageProps) {
  const storageKey = `poll_voted_${item.id}`;
  const [votedOption, setVotedOption] = useState<number | null>(() => {
    try { const v = localStorage.getItem(storageKey); return v !== null ? parseInt(v, 10) : null; } catch { return null; }
  });
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('Thanks for voting!');
  const [voteCount, setVoteCount] = useState<number>(() => {
    try { const s = item.stats?.[0]?.v; if (!s) return 128; const n = parseInt(s.replace(/[^\d]/g, ''), 10); return isNaN(n) ? 128 : n; } catch { return 128; }
  });
  const [animated, setAnimated] = useState(false);

  const isClosed = item.badge?.toLowerCase().includes('closed');
  const showResults = votedOption !== null || isClosed;

  // Build options from chips or body first lines
  const rawOptions = item.chips && item.chips.length >= 2
    ? item.chips.slice(0, 5)
    : item.body.split('\n').filter(Boolean).slice(0, 4).map((l) => l.replace(/^\d+[./)\s]+/, ''));

  const basePercents = [42, 28, 18, 12].slice(0, rawOptions.length);
  const total = basePercents.reduce((s, n) => s + n, 0);
  const percents = basePercents.map((n) => Math.round((n / total) * 100));
  const winnerIdx = percents.indexOf(Math.max(...percents));

  useEffect(() => {
    if (showResults) setTimeout(() => setAnimated(true), 80);
  }, [showResults]);

  const castVote = (idx: number) => {
    if (isClosed) return;
    const isChanging = votedOption !== null && votedOption !== idx;
    setVotedOption(idx);
    if (!isChanging) setVoteCount((c) => c + 1);
    setToastMsg(isChanging ? 'Vote changed!' : 'Thanks for voting!');
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
    try { localStorage.setItem(storageKey, String(idx)); } catch {}
  };

  return (
    <div className="space-y-6">
      {/* Question */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border ${
            isClosed
              ? 'border-white/10 bg-white/[0.05] text-white/40'
              : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
          }`}>
            {!isClosed && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
            {isClosed ? 'Closed' : 'Active'}
          </span>
          <span className="text-xs text-white/30">{voteCount.toLocaleString()} votes</span>
        </div>
        <h2 className="text-2xl font-bold text-white leading-snug">{item.title}</h2>
        <p className="mt-1 text-sm text-white/40">{item.byline}</p>
      </div>

      {/* Options */}
      <div className="space-y-3">
        {rawOptions.map((opt, idx) => {
          const pct = percents[idx] ?? 0;
          const isWinner = showResults && idx === winnerIdx;
          const isChosen = votedOption === idx;

          return (
            <button
              key={idx}
              type="button"
              onClick={() => castVote(idx)}
              disabled={isClosed}
              aria-label={`Vote for ${opt}`}
              className={`relative w-full overflow-hidden rounded-xl border py-4 px-5 text-left transition-all duration-200 ${
                isChosen
                  ? 'border-violet-500/40 bg-violet-500/10'
                  : isWinner && showResults
                  ? 'border-amber-400/30 bg-amber-400/[0.07]'
                  : showResults
                  ? 'border-white/[0.07] bg-white/[0.02]'
                  : 'border-white/[0.10] bg-white/[0.04] hover:border-violet-500/30 hover:bg-violet-500/[0.07] active:scale-[0.99]'
              }`}
            >
              {/* Animated fill bar */}
              {showResults && (
                <div
                  className={`absolute inset-y-0 left-0 rounded-xl transition-all duration-700 ease-out ${
                    isWinner ? 'bg-amber-400/[0.12]' : 'bg-white/[0.04]'
                  }`}
                  style={{ width: animated ? `${pct}%` : '0%' }}
                />
              )}

              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  {showResults && isWinner && (
                    <Crown className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  )}
                  {isChosen && !isWinner && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                  )}
                  <span className={`text-sm font-medium ${
                    isChosen ? 'text-violet-300' : isWinner && showResults ? 'text-amber-300' : 'text-white/75'
                  }`}>
                    {opt}
                  </span>
                </div>
                {showResults && (
                  <span className={`tabular-nums text-sm font-bold shrink-0 ${
                    isWinner ? 'text-amber-400' : 'text-white/40'
                  }`}>
                    {pct}%
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Toast */}
      <div
        className={`pointer-events-none fixed bottom-8 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
          showToast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
        aria-live="polite"
      >
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/25 bg-[#111114] px-5 py-3 text-sm font-semibold text-emerald-400 shadow-2xl">
          <CheckCircle2 className="h-4 w-4" />
          {toastMsg}
        </div>
      </div>

      {/* Share results */}
      {showResults && (
        <button
          type="button"
          onClick={() => {
            const url = typeof window !== 'undefined' ? window.location.href : '';
            const text = `${item.title} — Poll results`;
            if (typeof navigator !== 'undefined' && navigator.share) {
              navigator.share({ title: item.title, text, url }).catch(() => {});
            } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
              navigator.clipboard.writeText(url).then(() => {
                setToastMsg('Link copied!');
                setShowToast(true);
                setTimeout(() => setShowToast(false), 3000);
              }).catch(() => {});
            }
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/55 transition hover:bg-white/[0.08] hover:text-white"
        >
          <Share2 className="h-4 w-4" />
          Share results
        </button>
      )}

      {/* Body text */}
      {item.body && (
        <div className="space-y-4 border-t border-white/[0.06] pt-6">
          {item.body.split('\n\n').filter(Boolean).map((para, i) => (
            <p key={i} className="text-[15px] leading-[1.85] text-white/65">{para}</p>
          ))}
        </div>
      )}

      <CommentSection
        comments={comments} commentText={commentText} displayName={displayName}
        setCommentText={setCommentText}
        submitComment={submitComment} submitReply={submitReply} likeComment={likeComment} editComment={editComment} deleteComment={deleteComment} currentUserId={currentUserId} totalComments={totalComments} commentRef={commentRef}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   3. SurveyDetailContent — Multi-step survey form
═══════════════════════════════════════════════════════════════════ */
type SurveyQuestion =
  | { type: 'radio'; text: string; options: string[] }
  | { type: 'rating'; text: string }
  | { type: 'textarea'; text: string };

function parseSurveyQuestions(body: string, title: string): SurveyQuestion[] {
  // Body format produced by buildTextBody:
  // "Survey: ...\n\nAbout: ...\n\nQuestions:\n  Q1. text [type]\n  Q2. ..."
  const questionsBlock = body.match(/Questions?:\n([\s\S]*?)(?:\n\n|$)/i);
  if (questionsBlock) {
    const lines = questionsBlock[1].split('\n').map(l => l.trim()).filter(l => /^Q\d+\./.test(l));
    const parsed: SurveyQuestion[] = lines.map(line => {
      const typeMatch = line.match(/\[(text|rating|yesno)\]\s*$/i);
      const type = typeMatch ? typeMatch[1].toLowerCase() as 'text' | 'rating' | 'yesno' : 'text';
      const text = line.replace(/^Q\d+\.\s*/, '').replace(/\s*\[(?:text|rating|yesno)\]\s*$/i, '').trim();
      if (type === 'rating') return { type: 'rating', text };
      if (type === 'yesno') return { type: 'radio', text, options: ['Yes', 'No'] };
      return { type: 'textarea', text };
    });
    if (parsed.length > 0) return parsed;
  }
  // Fallback if body has no parseable questions
  return [
    { type: 'textarea', text: title || 'Share your feedback' },
  ];
}

export function SurveyDetailContent({
  item, comments, commentText, displayName,
  setCommentText, submitComment, submitReply, likeComment,
  editComment, deleteComment, currentUserId,
  totalComments, commentRef,
}: CategoryPageProps) {
  const questions: SurveyQuestion[] = parseSurveyQuestions(item.body, item.title);

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string | number>>({});
  const [done, setDone] = useState(false);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [visible, setVisible] = useState(true);

  const total = questions.length;
  const q = questions[step];

  const animate = (nextStep: number, dir: 'forward' | 'back') => {
    setDirection(dir);
    setVisible(false);
    setTimeout(() => { setStep(nextStep); setVisible(true); }, 180);
  };

  const next = () => {
    if (step < total - 1) animate(step + 1, 'forward');
    else { setDone(true); }
  };
  const back = () => { if (step > 0) animate(step - 1, 'back'); };

  const canProceed = answers[step] !== undefined && answers[step] !== '';

  if (done) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
            <CheckCircle2 className="h-7 w-7 text-emerald-400" />
          </div>
          <h3 className="text-xl font-bold text-white">Thank you!</h3>
          <p className="mt-2 text-sm text-white/50">Your responses have been recorded.</p>
          <div className="mt-6 grid gap-3 text-left">
            {Object.entries(answers).map(([idx, val]) => (
              <div key={idx} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
                <p className="text-[11px] text-white/35 mb-1">{questions[parseInt(idx)]?.text}</p>
                <p className="text-sm font-medium text-white/70">{typeof val === 'number' ? `${val} / 5 stars` : String(val)}</p>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => { setDone(false); setStep(0); setAnswers({}); }}
            className="mt-6 rounded-xl border border-white/[0.10] bg-white/[0.04] px-5 py-2 text-sm text-white/55 transition hover:bg-white/[0.08] hover:text-white"
          >
            Retake survey
          </button>
        </div>

        <CommentSection
          comments={comments} commentText={commentText} displayName={displayName}
          setCommentText={setCommentText}
          submitComment={submitComment} submitReply={submitReply} likeComment={likeComment} editComment={editComment} deleteComment={deleteComment} currentUserId={currentUserId} totalComments={totalComments} commentRef={commentRef}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">{item.title}</h2>
        <p className="mt-1 text-sm text-white/40">{item.byline}</p>
        <div className="mt-3 flex items-center gap-3 text-xs text-white/30">
          {item.stats?.[0] && <span>{item.stats[0].v} responses</span>}
          {item.chips?.[0] && <span>· {item.chips[0]}</span>}
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-[11px] text-white/30 mb-1.5">
          <span>Question {step + 1} of {total}</span>
          <span>{Math.round(((step) / total) * 100)}% complete</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-white/[0.07]">
          <div
            className="h-1.5 rounded-full bg-amber-400/70 transition-all duration-500"
            style={{ width: `${((step) / total) * 100}%` }}
          />
        </div>
      </div>

      {/* Question card */}
      <div
        className="rounded-2xl border border-white/[0.09] bg-white/[0.03] p-6 transition-all duration-180"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible
            ? 'translateX(0)'
            : direction === 'forward' ? 'translateX(16px)' : 'translateX(-16px)',
        }}
      >
        <p className="text-base font-semibold text-white/90 mb-5">{q?.text}</p>

        {q?.type === 'radio' && (
          <div className="space-y-2">
            {q.options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setAnswers((a) => ({ ...a, [step]: opt }))}
                className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-sm text-left transition ${
                  answers[step] === opt
                    ? 'border-amber-400/35 bg-amber-400/[0.08] text-amber-300'
                    : 'border-white/[0.08] bg-white/[0.03] text-white/60 hover:border-white/[0.16] hover:text-white/85'
                }`}
              >
                <span className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                  answers[step] === opt ? 'border-amber-400 bg-amber-400' : 'border-white/20'
                }`}>
                  {answers[step] === opt && <span className="h-1.5 w-1.5 rounded-full bg-[#0A0A0C]" />}
                </span>
                {opt}
              </button>
            ))}
          </div>
        )}

        {q?.type === 'rating' && (
          <div className="flex items-center gap-3 justify-center py-4">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setAnswers((a) => ({ ...a, [step]: n }))}
                aria-label={`${n} star${n !== 1 ? 's' : ''}`}
                className="transition-transform hover:scale-110 active:scale-95"
              >
                <Star
                  className={`h-9 w-9 transition-colors ${
                    (answers[step] as number) >= n
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-white/15 hover:text-white/35'
                  }`}
                />
              </button>
            ))}
          </div>
        )}

        {q?.type === 'textarea' && (
          <textarea
            rows={4}
            placeholder="Share your thoughts…"
            value={(answers[step] as string) ?? ''}
            onChange={(e) => setAnswers((a) => ({ ...a, [step]: e.target.value }))}
            className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-white/20 outline-none transition focus:border-white/[0.20] focus:bg-white/[0.06]"
          />
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={back}
          disabled={step === 0}
          className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-white/45 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-30"
        >
          Back
        </button>
        <button
          type="button"
          onClick={next}
          disabled={!canProceed}
          className="rounded-xl bg-white px-6 py-2.5 text-sm font-bold text-slate-950 shadow transition hover:bg-white/90 disabled:opacity-25 active:scale-95"
        >
          {step === total - 1 ? 'Submit' : 'Next →'}
        </button>
      </div>

      <CommentSection
        comments={comments} commentText={commentText} displayName={displayName}
        setCommentText={setCommentText}
        submitComment={submitComment} submitReply={submitReply} likeComment={likeComment} editComment={editComment} deleteComment={deleteComment} currentUserId={currentUserId} totalComments={totalComments} commentRef={commentRef}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   4. ChartDetailContent — Interactive data visualization
═══════════════════════════════════════════════════════════════════ */
type ChartRow = { label: string; value: number; pct: number };

function parseChartFromBody(body: string): { labels: string[]; values: number[]; chartType: string } {
  const labelsMatch = body.match(/^Labels?:\s*(.+)$/im);
  const valuesMatch = body.match(/^Values?:\s*(.+)$/im);
  const typeMatch   = body.match(/^Type:\s*(.+)$/im);
  const labels = labelsMatch ? labelsMatch[1].split(',').map(l => l.trim()).filter(Boolean) : [];
  const values = valuesMatch ? valuesMatch[1].split(',').map(v => parseFloat(v.trim())).filter(n => !isNaN(n)) : [];
  const chartType = typeMatch ? typeMatch[1].trim().toLowerCase() : 'bar';
  return { labels, values, chartType };
}

const CHART_COLORS = [
  'from-indigo-500/70 to-indigo-400/50',
  'from-rose-500/70 to-rose-400/50',
  'from-emerald-500/70 to-emerald-400/50',
  'from-amber-500/70 to-amber-400/50',
  'from-sky-500/70 to-sky-400/50',
  'from-violet-500/70 to-violet-400/50',
  'from-orange-500/70 to-orange-400/50',
  'from-teal-500/70 to-teal-400/50',
];

const PIE_COLORS = [
  'bg-indigo-400', 'bg-rose-400', 'bg-emerald-400', 'bg-amber-400',
  'bg-sky-400', 'bg-violet-400', 'bg-orange-400', 'bg-teal-400',
];

export function ChartDetailContent({
  item, likeCount, liked, toggleLike, trendCount, trended, toggleTrend,
  comments, commentText, displayName,
  setCommentText, submitComment, submitReply, likeComment,
  editComment, deleteComment, currentUserId,
  totalComments, commentRef,
}: CategoryPageProps) {
  const [animated, setAnimated] = useState(false);
  const [sortByValue, setSortByValue] = useState(false);
  const [activeChart, setActiveChart] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);

  // Parse real chart data from body (format produced by buildTextBody)
  const { labels: parsedLabels, values: parsedValues, chartType: parsedType } = parseChartFromBody(item.body);

  // Support multiple charts stored in body (separated by ===)
  const chartBlocks = item.body.split(/\n?===\n?/);
  const charts = chartBlocks.map(block => {
    const { labels, values, chartType } = parseChartFromBody(block);
    return { labels, values, chartType };
  }).filter(c => c.labels.length > 0 && c.values.length > 0);

  const hasRealData = parsedLabels.length >= 1 && parsedValues.length >= 1;

  // Use real parsed data or fall back to chips-based data
  const currentChart = charts[activeChart] ?? { labels: parsedLabels, values: parsedValues, chartType: parsedType };
  const labels = hasRealData ? currentChart.labels : (item.chips ?? []).map(c => c.split(/[+\-\s]/)[0].trim()).filter(Boolean);
  const values = hasRealData ? currentChart.values : labels.map((_, i) => 80 - i * 12);
  const chartType = hasRealData ? currentChart.chartType : 'bar';

  const maxVal = Math.max(...values, 1);
  const rows: ChartRow[] = labels.map((label, i) => ({
    label,
    value: values[i] ?? 0,
    pct: Math.round(((values[i] ?? 0) / maxVal) * 100),
  }));

  const displayRows = sortByValue ? [...rows].sort((a, b) => b.value - a.value) : rows;
  const total = values.reduce((s, v) => s + v, 0) || 1;

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(t);
  }, []);

  // Prose body (lines that aren't meta fields)
  const proseLines = item.body.split('\n').filter(l => !/^(Chart|Type|Labels?|Values?|Notes?):/i.test(l.trim()) && l.trim() && !l.startsWith('==='));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">{item.title}</h2>
        <p className="mt-1 text-sm text-white/40">{item.byline}</p>
      </div>

      {/* Multiple chart tabs */}
      {charts.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {charts.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { setActiveChart(i); setAnimated(false); setTimeout(() => setAnimated(true), 80); }}
              className={`rounded-xl border px-4 py-2 text-xs font-semibold transition ${
                activeChart === i
                  ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300'
                  : 'border-white/[0.08] bg-white/[0.03] text-white/40 hover:bg-white/[0.07] hover:text-white'
              }`}
            >
              Chart {i + 1}
            </button>
          ))}
        </div>
      )}

      {/* Chart visualisation */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
        <div className="flex items-center justify-between mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/30">
            {chartType === 'pie' ? 'Distribution' : chartType === 'line' ? 'Trend' : 'Performance'} · {chartType} chart
          </p>
          {chartType === 'bar' && (
            <button
              type="button"
              onClick={() => setSortByValue((v) => !v)}
              className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-white/40 transition hover:bg-white/[0.07] hover:text-white"
            >
              {sortByValue ? 'Original order' : 'Sort by value'}
            </button>
          )}
        </div>

        {/* Bar chart */}
        {chartType === 'bar' && (
          <div className="space-y-2.5">
            {displayRows.map((row, idx) => (
              <div
                key={row.label}
                className="group"
                onMouseEnter={() => setHovered(idx)}
                onMouseLeave={() => setHovered(null)}
              >
                <div className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs font-medium text-white/60 truncate">{row.label}</span>
                  <div className="relative flex-1 h-8 rounded-lg bg-white/[0.04] overflow-hidden">
                    <div
                      className={`absolute inset-y-0 left-0 rounded-lg bg-gradient-to-r ${CHART_COLORS[idx % CHART_COLORS.length]} transition-all duration-700 ease-out`}
                      style={{ width: animated ? `${row.pct}%` : '0%' }}
                    />
                    <div className="absolute inset-0 flex items-center px-2 justify-between">
                      <span className={`text-[10px] font-bold text-white/80 transition-opacity ${animated && row.pct > 20 ? 'opacity-100' : 'opacity-0'}`}>
                        {row.value.toLocaleString()}
                      </span>
                      {(hovered === idx || row.pct <= 20) && (
                        <span className="text-[10px] font-bold text-white tabular-nums">
                          {row.value.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="w-10 shrink-0 text-right text-[11px] font-bold text-white/40 tabular-nums">
                    {row.pct}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Line chart */}
        {chartType === 'line' && (
          <div className="space-y-1">
            <div className="relative h-40 border-l border-b border-white/[0.08] ml-8">
              {/* Y-axis gridlines */}
              {[0, 25, 50, 75, 100].map(pct => (
                <div key={pct} className="absolute left-0 right-0 border-t border-white/[0.04]" style={{ bottom: `${pct}%` }}>
                  <span className="absolute -left-7 -top-2 text-[9px] text-white/20 w-6 text-right">
                    {Math.round(maxVal * pct / 100)}
                  </span>
                </div>
              ))}
              {/* Points and line */}
              <svg className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none">
                {rows.length > 1 && (
                  <polyline
                    points={rows.map((r, i) => `${(i / (rows.length - 1)) * 100}%,${100 - (animated ? r.pct : 0)}%`).join(' ')}
                    fill="none"
                    stroke="rgba(99,102,241,0.6)"
                    strokeWidth="2"
                    style={{ transition: 'all 0.7s ease' }}
                  />
                )}
                {rows.map((r, i) => (
                  <circle
                    key={i}
                    cx={`${rows.length > 1 ? (i / (rows.length - 1)) * 100 : 50}%`}
                    cy={`${100 - (animated ? r.pct : 0)}%`}
                    r="4"
                    fill="#6366f1"
                    stroke="#0A0A0C"
                    strokeWidth="2"
                    style={{ transition: 'all 0.7s ease' }}
                  />
                ))}
              </svg>
            </div>
            {/* X-axis labels */}
            <div className="flex ml-8">
              {rows.map((r, i) => (
                <div key={i} className="flex-1 text-center">
                  <span className="text-[9px] text-white/35">{r.label}</span>
                  <p className="text-[10px] font-bold text-white/60 tabular-nums">{r.value.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pie chart */}
        {chartType === 'pie' && (
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* SVG pie */}
            <div className="relative shrink-0 w-36 h-36">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                {(() => {
                  let cumulative = 0;
                  return rows.map((r, i) => {
                    const pct = r.value / total;
                    const offset = cumulative;
                    cumulative += pct;
                    const strokeDasharray = `${pct * 100} ${100 - pct * 100}`;
                    const strokeDashoffset = `-${offset * 100}`;
                    const colors = ['#6366f1','#f43f5e','#10b981','#f59e0b','#0ea5e9','#8b5cf6','#f97316','#14b8a6'];
                    return (
                      <circle
                        key={i}
                        cx="18" cy="18" r="15.9"
                        fill="none"
                        stroke={colors[i % colors.length]}
                        strokeWidth={animated ? "3.5" : "0"}
                        strokeDasharray={animated ? strokeDasharray : '0 100'}
                        strokeDashoffset={strokeDashoffset}
                        style={{ transition: 'stroke-dasharray 0.7s ease, stroke-width 0.3s ease' }}
                      />
                    );
                  });
                })()}
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[10px] font-bold text-white/40">{rows.length} items</span>
              </div>
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-2.5">
              {rows.map((r, i) => {
                const pct = Math.round((r.value / total) * 100);
                return (
                  <div key={i} className="flex items-center gap-2 min-w-[120px]">
                    <div className={`h-3 w-3 shrink-0 rounded-full ${PIE_COLORS[i % PIE_COLORS.length]}`} />
                    <div>
                      <p className="text-[12px] font-semibold text-white/80">{r.label}</p>
                      <p className="text-[10px] text-white/40">{r.value.toLocaleString()} · {pct}%</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Data table */}
      <div className="rounded-2xl border border-white/[0.08] overflow-hidden">
        <div className="grid grid-cols-3 bg-white/[0.03] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">
          <span>Label</span>
          <span className="text-center">Value</span>
          <span className="text-right">Share</span>
        </div>
        {displayRows.map((row, i) => (
          <div
            key={row.label}
            className={`grid grid-cols-3 px-5 py-3 text-sm border-t border-white/[0.05] ${i % 2 === 0 ? '' : 'bg-white/[0.01]'}`}
          >
            <span className="font-medium text-white/70 truncate">{row.label}</span>
            <span className="text-center font-bold text-white tabular-nums">{row.value.toLocaleString()}</span>
            <span className="text-right font-bold tabular-nums text-white/50">{Math.round((row.value / total) * 100)}%</span>
          </div>
        ))}
      </div>

      {/* Prose description */}
      {proseLines.length > 0 && (
        <div className="space-y-3">
          {proseLines.map((line, i) => (
            <p key={i} className="text-[15px] leading-[1.85] text-white/65">{line}</p>
          ))}
        </div>
      )}

      {/* Engagement */}
      <div className="flex items-center gap-3 py-2 border-t border-white/[0.06]">
        <button
          type="button"
          onClick={toggleLike}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
            liked ? 'border-rose-500/30 bg-rose-500/10 text-rose-400' : 'border-white/[0.08] bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white'
          }`}
        >
          <BarChart2 className="h-4 w-4" />
          <span className="tabular-nums">{likeCount}</span>
        </button>
        <button
          type="button"
          onClick={toggleTrend}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
            trended ? 'border-orange-500/30 bg-orange-500/10 text-orange-400' : 'border-white/[0.08] bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-orange-400'
          }`}
        >
          <TrendingUp className={`h-4 w-4 ${trended ? 'scale-110' : ''}`} />
          <span className="tabular-nums">{trendCount > 0 ? trendCount : ''}</span>
        </button>
      </div>

      <CommentSection
        comments={comments} commentText={commentText} displayName={displayName}
        setCommentText={setCommentText}
        submitComment={submitComment} submitReply={submitReply} likeComment={likeComment} editComment={editComment} deleteComment={deleteComment} currentUserId={currentUserId} totalComments={totalComments} commentRef={commentRef}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   5. ThreadDetailContent — Long-form thread reader
═══════════════════════════════════════════════════════════════════ */
export function ThreadDetailContent({
  item, likeCount, liked, toggleLike, trendCount, trended, toggleTrend,
  comments, commentText, displayName,
  setCommentText, submitComment, submitReply, likeComment,
  editComment, deleteComment, currentUserId,
  totalComments, commentRef,
}: CategoryPageProps) {
  const parts = item.body.split('\n\n').filter(Boolean);
  const total = parts.length;
  const [likedParts, setLikedParts] = useState<Set<number>>(new Set());
  const [bookmarked, setBookmarked] = useState<Set<number>>(new Set());
  const [currentPart, setCurrentPart] = useState(1);
  const partRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const handleScroll = () => {
      partRefs.current.forEach((ref, i) => {
        if (!ref) return;
        const rect = ref.getBoundingClientRect();
        if (rect.top <= 120 && rect.bottom > 120) setCurrentPart(i + 1);
      });
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="space-y-6">
      {/* Sticky progress */}
      <div className="sticky top-14 z-30 sm:-mx-6 px-4 sm:px-6 py-2 border-b border-white/[0.06] bg-[#0A0A0C]/95 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-white/40">Part {currentPart} of {total}</span>
          <div className="h-1 w-32 rounded-full bg-white/[0.08] overflow-hidden">
            <div
              className="h-1 rounded-full bg-sky-400/70 transition-all duration-300"
              style={{ width: `${(currentPart / total) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Author */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-sky-600 flex items-center justify-center text-sm font-bold text-white shrink-0">
          {initials(item.byline.split('·')[0].trim())}
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{item.byline.split('·')[0].trim()}</p>
          <p className="text-xs text-white/30">{timeAgo(item.postedAt)}</p>
        </div>
      </div>

      {/* Title */}
      <h2 className="text-2xl font-bold text-white leading-snug">{item.title}</h2>

      {/* Thread parts */}
      <div className="relative">
        {/* vertical line */}
        <div className="absolute left-5 top-0 bottom-0 w-px bg-white/[0.07]" aria-hidden />

        <div className="space-y-0">
          {parts.map((para, i) => (
            <div
              key={i}
              ref={(el) => { partRefs.current[i] = el; }}
              className="relative flex gap-5 pb-8"
            >
              {/* Number badge */}
              <div className="shrink-0 relative z-10">
                <div className={`h-10 w-10 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all ${
                  i + 1 === currentPart
                    ? 'border-sky-400 bg-sky-400/15 text-sky-400'
                    : 'border-white/[0.12] bg-[#111114] text-white/30'
                }`}>
                  {i + 1}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pt-1.5">
                <p className="text-[15px] leading-[1.85] text-white/72">{para}</p>

                {/* Part actions */}
                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setLikedParts((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; })}
                    aria-label="Like part"
                    className={`inline-flex items-center gap-1.5 text-[11px] font-semibold transition ${
                      likedParts.has(i) ? 'text-rose-400' : 'text-white/20 hover:text-white/55'
                    }`}
                  >
                    <Heart className={`h-3.5 w-3.5 ${likedParts.has(i) ? 'fill-rose-400' : ''}`} />
                    {likedParts.has(i) ? 'Liked' : 'Like'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBookmarked((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; })}
                    aria-label="Bookmark part"
                    className={`inline-flex items-center gap-1.5 text-[11px] font-semibold transition ${
                      bookmarked.has(i) ? 'text-amber-400' : 'text-white/20 hover:text-white/55'
                    }`}
                  >
                    {bookmarked.has(i) ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
                    {bookmarked.has(i) ? 'Saved' : 'Save'}
                  </button>
                </div>

                {/* End of thread */}
                {i === parts.length - 1 && (
                  <div className="mt-5 rounded-2xl border border-sky-500/20 bg-sky-500/[0.06] px-5 py-4 text-center">
                    <p className="text-sm font-semibold text-sky-400">— End of thread —</p>
                    <p className="mt-1.5 text-xs text-white/35">Found this valuable? Share it with your network.</p>
                    <button
                      type="button"
                      className="mt-3 inline-flex items-center gap-2 rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-2 text-xs font-semibold text-sky-400 transition hover:bg-sky-500/15"
                    >
                      <Share2 className="h-3.5 w-3.5" /> Share thread
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <CommentSection
        comments={comments} commentText={commentText} displayName={displayName}
        setCommentText={setCommentText}
        submitComment={submitComment} submitReply={submitReply} likeComment={likeComment} editComment={editComment} deleteComment={deleteComment} currentUserId={currentUserId} totalComments={totalComments} commentRef={commentRef}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   6. VideoDetailContent — Video player page
═══════════════════════════════════════════════════════════════════ */
/* ─── Video URL parser ───────────────────────────────────────────── */
type VideoInfo =
  | { type: 'youtube'; id: string }
  | { type: 'vimeo'; id: string }
  | { type: 'loom'; id: string }
  | { type: 'gdrive'; id: string }
  | { type: 'twitter'; url: string }
  | { type: 'direct'; url: string; mime: 'video/mp4' | 'video/webm' | 'video/ogg' | 'video/mov' }
  | { type: 'iframe'; url: string; platform: string }
  | null;

function parseVideoUrl(url: string | undefined): VideoInfo {
  if (!url) return null;
  const u = url.trim();
  // YouTube
  const ytMatch =
    u.match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/)([\w-]{11})/) ||
    u.match(/youtube\.com\/embed\/([\w-]{11})/);
  if (ytMatch) return { type: 'youtube', id: ytMatch[1] };
  // Vimeo
  const vmMatch = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vmMatch) return { type: 'vimeo', id: vmMatch[1] };
  // Loom
  const loomMatch = u.match(/loom\.com\/(?:share|embed)\/([\w-]+)/);
  if (loomMatch) return { type: 'loom', id: loomMatch[1] };
  // Google Drive
  const gdriveMatch = u.match(/drive\.google\.com\/file\/d\/([\w-]+)/) ||
    u.match(/drive\.google\.com\/open\?id=([\w-]+)/);
  if (gdriveMatch) return { type: 'gdrive', id: gdriveMatch[1] };
  // Twitter/X
  if (u.includes('twitter.com') || u.includes('x.com')) return { type: 'twitter', url: u };
  // Direct video files
  if (u.match(/\.(mp4)(\?|$)/i)) return { type: 'direct', url: u, mime: 'video/mp4' };
  if (u.match(/\.(webm)(\?|$)/i)) return { type: 'direct', url: u, mime: 'video/webm' };
  if (u.match(/\.(ogg|ogv)(\?|$)/i)) return { type: 'direct', url: u, mime: 'video/ogg' };
  if (u.match(/\.(mov)(\?|$)/i)) return { type: 'direct', url: u, mime: 'video/mp4' };
  // Generic iframe fallback for any http URL
  if (u.startsWith('http')) {
    let platform = 'Video';
    if (u.includes('dailymotion.com')) platform = 'Dailymotion';
    else if (u.includes('twitch.tv')) platform = 'Twitch';
    else if (u.includes('instagram.com')) platform = 'Instagram';
    else if (u.includes('tiktok.com')) platform = 'TikTok';
    return { type: 'iframe', url: u, platform };
  }
  return null;
}

export function VideoDetailContent({
  item, likeCount, liked, toggleLike, trendCount, trended, toggleTrend,
  comments, commentText, displayName,
  setCommentText, submitComment, submitReply, likeComment,
  editComment, deleteComment, currentUserId,
  totalComments, commentRef,
}: CategoryPageProps) {
  const [playing, setPlaying] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [imgError, setImgError] = useState(false);

  // Fallback: try to extract URL from body text (format: "URL: https://...")
  const urlFromBody = item.body?.match(/^URL:\s*(.+)$/im)?.[1]?.trim() || '';
  const videoUrl = item.videoUrl || urlFromBody;
  const videoInfo = parseVideoUrl(videoUrl);
  const duration = item.chips?.find((c) => /\d+[hm]\s*\d*/.test(c) || /\d+:\d+/.test(c)) ?? item.stats?.find(s => s.l === 'duration')?.v ?? '';
  const views = item.stats?.[0]?.v ?? '';

  const ytThumb = videoInfo?.type === 'youtube'
    ? `https://img.youtube.com/vi/${videoInfo.id}/maxresdefault.jpg`
    : null;
  const ytThumbFallback = videoInfo?.type === 'youtube'
    ? `https://img.youtube.com/vi/${videoInfo.id}/hqdefault.jpg`
    : null;

  return (
    <div className="space-y-6">
      {/* ── Video player area ── */}
      <div className="relative overflow-hidden rounded-2xl bg-black border border-white/[0.08]" style={{ aspectRatio: '16/9' }}>
        {playing ? (
          <>
            {videoInfo?.type === 'youtube' && (
              <iframe
                src={`https://www.youtube.com/embed/${videoInfo.id}?autoplay=1&rel=0&modestbranding=1`}
                title={item.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
              />
            )}
            {videoInfo?.type === 'vimeo' && (
              <iframe
                src={`https://player.vimeo.com/video/${videoInfo.id}?autoplay=1&color=ffffff`}
                title={item.title}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
              />
            )}
            {videoInfo?.type === 'loom' && (
              <iframe
                src={`https://www.loom.com/embed/${videoInfo.id}?autoplay=1&hide_owner=true&hide_share=true&hide_title=true`}
                title={item.title}
                allow="autoplay; fullscreen"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
              />
            )}
            {videoInfo?.type === 'gdrive' && (
              <iframe
                src={`https://drive.google.com/file/d/${videoInfo.id}/preview`}
                title={item.title}
                allow="autoplay; fullscreen"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
              />
            )}
            {videoInfo?.type === 'direct' && (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                src={videoInfo.url}
                autoPlay
                controls
                className="absolute inset-0 h-full w-full object-contain"
              />
            )}
            {(videoInfo?.type === 'twitter' || videoInfo?.type === 'iframe') && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 gap-4">
                <a
                  href={videoInfo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-[14px] font-bold text-slate-950 transition hover:bg-white/90"
                >
                  Watch on {videoInfo.type === 'twitter' ? 'X / Twitter' : (videoInfo as {platform: string}).platform}
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
                <p className="text-xs text-white/30">This platform doesn&apos;t support embedding — opens in a new tab</p>
              </div>
            )}
            {!videoInfo && (
              <div className="absolute inset-0 flex items-center justify-center bg-black">
                <p className="text-sm text-white/40">No playable video URL available.</p>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Thumbnail */}
            {ytThumb && !imgError ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imgError ? ytThumbFallback! : ytThumb}
                alt={item.title}
                className="absolute inset-0 h-full w-full object-cover"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-red-950/60 via-black to-slate-900 flex items-center justify-center">
                <VideoIcon className="h-20 w-20 text-white/[0.08]" />
              </div>
            )}
            {/* Dark overlay */}
            <div className="absolute inset-0 bg-black/30" />
            {/* Play button */}
            <button
              type="button"
              onClick={() => setPlaying(true)}
              aria-label="Play video"
              disabled={!videoInfo}
              className="absolute inset-0 flex items-center justify-center group disabled:cursor-not-allowed"
            >
              <div className={`flex h-18 w-18 items-center justify-center rounded-full shadow-2xl transition-all duration-200 group-hover:scale-110 group-active:scale-95 ${videoInfo ? 'bg-white/90 group-hover:bg-white' : 'bg-white/20'}`} style={{ height: 72, width: 72 }}>
                <Play className={`h-8 w-8 ml-1 ${videoInfo ? 'text-slate-900' : 'text-white/40'}`} />
              </div>
            </button>
            {/* Duration badge */}
            {duration && (
              <div className="absolute bottom-3 right-3 rounded-lg bg-black/80 px-2.5 py-1 text-[11px] font-bold text-white/90 backdrop-blur-sm border border-white/[0.08]">
                {duration}
              </div>
            )}
            {/* Platform badge */}
            {videoInfo?.type === 'youtube' && (
              <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-lg bg-red-600/90 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                <svg className="h-3 w-3 fill-white" viewBox="0 0 24 24"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.5a3 3 0 0 0-2.1 2.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z"/></svg>
                YouTube
              </div>
            )}
            {videoInfo?.type === 'vimeo' && (
              <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-lg bg-[#1ab7ea]/90 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                <svg className="h-3 w-3 fill-white" viewBox="0 0 24 24"><path d="M23.977 6.416c-.105 2.338-1.739 5.543-4.894 9.609-3.268 4.247-6.026 6.37-8.29 6.37-1.409 0-2.578-1.294-3.553-3.881L5.322 11.4C4.603 8.816 3.834 7.522 3.01 7.522c-.179 0-.806.378-1.881 1.132L0 7.197c1.185-1.044 2.351-2.084 3.501-3.128C5.08 2.701 6.266 1.984 7.055 1.91c1.867-.18 3.016 1.1 3.447 3.832.462 2.999.783 4.867.977 5.604.543 2.48 1.138 3.716 1.779 3.716.5 0 1.256-.796 2.265-2.385 1.004-1.589 1.54-2.797 1.612-3.628.144-1.371-.395-2.061-1.614-2.061-.574 0-1.167.121-1.777.391 1.186-3.868 3.434-5.757 6.762-5.637 2.473.06 3.628 1.664 3.471 4.678z"/></svg>
                Vimeo
              </div>
            )}
            {videoInfo?.type === 'loom' && (
              <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-lg bg-[#625DF5]/90 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                Loom
              </div>
            )}
            {videoInfo?.type === 'gdrive' && (
              <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-lg bg-blue-600/90 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                Google Drive
              </div>
            )}
            {(videoInfo?.type === 'twitter' || videoInfo?.type === 'iframe') && (
              <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white/70 backdrop-blur-sm border border-white/10">
                {videoInfo.type === 'twitter' ? 'X / Twitter' : (videoInfo as {platform: string}).platform}
              </div>
            )}
            {!videoInfo && (
              <div className="absolute bottom-3 left-3 rounded-lg bg-white/10 px-2 py-1 text-[10px] text-white/40 backdrop-blur-sm">
                No video URL
              </div>
            )}
          </>
        )}
      </div>

      {/* Metadata */}
      <div>
        <h2 className="text-xl font-bold text-white leading-snug">{item.title}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-white/35">
          <span>{item.byline.split('·')[0].trim()}</span>
          {views && <><span>·</span><span>{views} views</span></>}
          <span>·</span>
          <span>{timeAgo(item.postedAt)}</span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 border-b border-white/[0.07] pb-5">
        <button
          type="button"
          onClick={toggleLike}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
            liked
              ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
              : 'border-white/[0.08] bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white'
          }`}
        >
          <ThumbsUp className="h-4 w-4" />
          <span className="tabular-nums">{likeCount}</span>
        </button>
        <button
          type="button"
          onClick={toggleTrend}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
            trended ? 'border-orange-500/30 bg-orange-500/10 text-orange-400' : 'border-white/[0.08] bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-orange-400'
          }`}
        >
          <TrendingUp className={`h-4 w-4 ${trended ? 'scale-110' : ''}`} />
          <span className="tabular-nums">{trendCount > 0 ? trendCount : ''}</span>
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/50 transition hover:bg-white/[0.08] hover:text-white"
        >
          <Share2 className="h-4 w-4" />
          Share
        </button>
        <button
          type="button"
          onClick={() => setBookmarked((b) => !b)}
          aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark'}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
            bookmarked
              ? 'border-amber-400/30 bg-amber-400/10 text-amber-400'
              : 'border-white/[0.08] bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white'
          }`}
        >
          {bookmarked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
          {bookmarked ? 'Saved' : 'Save'}
        </button>
        {videoInfo && (
          <a
            href={item.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-xs font-semibold text-white/50 transition hover:bg-white/[0.08] hover:text-white"
          >
            Open original ↗
          </a>
        )}
      </div>

      {/* Description */}
      <div className="space-y-4">
        {item.body.split('\n\n').filter(Boolean).map((para, i) => (
          <p key={i} className="text-[15px] leading-[1.85] text-white/65">{para}</p>
        ))}
      </div>

      {/* Tags */}
      {item.chips && item.chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {item.chips.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-white/[0.10] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/55"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Stats row */}
      {item.stats && item.stats.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {item.stats.map((s) => (
            <div key={s.l} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 text-center">
              <p className="text-lg font-bold text-white tabular-nums">{s.v}</p>
              <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30">{s.l}</p>
            </div>
          ))}
        </div>
      )}

      <CommentSection
        comments={comments} commentText={commentText} displayName={displayName}
        setCommentText={setCommentText}
        submitComment={submitComment} submitReply={submitReply} likeComment={likeComment} editComment={editComment} deleteComment={deleteComment} currentUserId={currentUserId} totalComments={totalComments} commentRef={commentRef}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   7. MilestoneDetailContent — Celebration achievement page
═══════════════════════════════════════════════════════════════════ */
function useCountUp(target: number, duration = 1800): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let start: number | null = null;
    const step = (ts: number) => {
      if (start === null) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    const raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return count;
}

function AnimatedStat({ value, label }: { value: string; label: string }) {
  const numMatch = value.match(/^([\d,.]+)(.*)/);
  const num = numMatch ? parseFloat(numMatch[1].replace(/,/g, '')) : null;
  const suffix = numMatch ? numMatch[2] : '';
  const counted = useCountUp(num ?? 0, 1600);

  return (
    <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-4 text-center">
      <p className="text-2xl font-bold text-amber-400 tabular-nums leading-none">
        {num !== null
          ? `${counted >= 1000 ? counted.toLocaleString() : counted}${suffix}`
          : value}
      </p>
      <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400/50">{label}</p>
    </div>
  );
}

export function MilestoneDetailContent({
  item, likeCount, liked, toggleLike, trendCount, trended, toggleTrend,
  comments, commentText, displayName,
  setCommentText, submitComment, submitReply, likeComment,
  editComment, deleteComment, currentUserId,
  totalComments, commentRef,
}: CategoryPageProps) {
  const [confetti, setConfetti] = useState(false);
  const [celebrated, setCelebrated] = useState(false);

  const celebrate = () => {
    setCelebrated(true);
    setConfetti(true);
    setTimeout(() => setConfetti(false), 1200);
  };

  const confettiColors = ['#f59e0b', '#10b981', '#6366f1', '#ec4899', '#3b82f6', '#f97316', '#8b5cf6', '#14b8a6'];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500/20 via-yellow-500/10 to-amber-900/10 border border-amber-400/20 p-8 text-center">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0A0A0C]/60" />
        <div className="relative">
          <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10">
            <Trophy className="h-8 w-8 text-amber-400" />
          </div>
          <h2 className="text-3xl font-bold text-white leading-tight">{item.title}</h2>
          <p className="mt-3 text-sm text-white/45">{item.byline}</p>
          <p className="mt-1 text-xs text-white/25">{timeAgo(item.postedAt)}</p>
        </div>
      </div>

      {/* Animated stats */}
      {item.stats && item.stats.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {item.stats.map((s) => (
            <AnimatedStat key={s.l} value={s.v} label={s.l} />
          ))}
        </div>
      )}

      {/* Celebrate button */}
      <div className="relative flex justify-center">
        <button
          type="button"
          onClick={celebrate}
          className={`relative inline-flex items-center gap-2 rounded-2xl px-8 py-3.5 text-base font-bold shadow-lg transition-all duration-200 ${
            celebrated
              ? 'bg-amber-400/20 border border-amber-400/30 text-amber-400'
              : 'bg-amber-400 text-slate-900 hover:bg-amber-300 hover:shadow-amber-400/25 active:scale-95'
          }`}
        >
          <Award className="h-5 w-5" />
          {celebrated ? 'Celebrated! 🎉' : 'Celebrate 🎉'}
        </button>

        {/* Confetti burst */}
        {confetti && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
            {confettiColors.map((color, i) => {
              const angle = (i / confettiColors.length) * 360;
              const rad = (angle * Math.PI) / 180;
              const tx = Math.cos(rad) * 60;
              const ty = Math.sin(rad) * 60;
              return (
                <div
                  key={i}
                  className="absolute h-3 w-3 rounded-full"
                  style={{
                    backgroundColor: color,
                    animation: 'none',
                    transform: 'translate(0,0) scale(1)',
                    animationDuration: '0.8s',
                    transition: 'transform 0.8s ease-out, opacity 0.8s ease-out',
                    ...(confetti
                      ? {
                          transform: `translate(${tx}px, ${ty}px) scale(0)`,
                          opacity: 0,
                          transitionDelay: `${i * 20}ms`,
                        }
                      : {}),
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Body story */}
      <div className="space-y-4">
        {item.body.split('\n\n').filter(Boolean).map((para, i) => (
          <p key={i} className="text-[15px] leading-[1.85] text-white/70">{para}</p>
        ))}
      </div>

      {/* Chips tags */}
      {item.chips && item.chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {item.chips.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-amber-400/20 bg-amber-400/[0.06] px-3 py-1.5 text-xs font-medium text-amber-400/70"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <CommentSection
        comments={comments} commentText={commentText} displayName={displayName}
        setCommentText={setCommentText}
        submitComment={submitComment} submitReply={submitReply} likeComment={likeComment} editComment={editComment} deleteComment={deleteComment} currentUserId={currentUserId} totalComments={totalComments} commentRef={commentRef}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   8. TutorialDetailContent — Step-by-step tutorial
═══════════════════════════════════════════════════════════════════ */
export function TutorialDetailContent({
  item, likeCount, liked, toggleLike, trendCount, trended, toggleTrend,
  comments, commentText, displayName,
  setCommentText, submitComment, submitReply, likeComment,
  editComment, deleteComment, currentUserId,
  totalComments, commentRef,
}: CategoryPageProps) {
  const progressKey = `tutorial_progress_${item.id}`;
  const bookmarkKey = `tutorial_bookmark_${item.id}`;

  // Parse structured step format: "Step N: Title\nDescription: ...\nImage: ..."
  // Falls back to old paragraph-split format
  const parseSteps = (body: string) => {
    const stepBlocks = body.split(/^Step \d+:/im).map(s => s.trim()).filter(Boolean);
    if (stepBlocks.length > 0 && body.match(/^Step \d+:/im)) {
      // New structured format
      const titleLines = body.match(/^Step \d+:\s*(.+)$/gim) || [];
      return stepBlocks.map((block, i) => {
        const titleMatch = titleLines[i]?.match(/^Step \d+:\s*(.+)$/i);
        const title = titleMatch?.[1]?.trim() || `Step ${i + 1}`;
        const descMatch = block.match(/^Description:\s*(.+)$/im);
        const imageMatch = block.match(/^Image:\s*(.+)$/im);
        const desc = descMatch?.[1]?.trim() || '';
        // Extract remaining body (everything that's not Description: or Image: lines)
        const prose = block.split('\n').filter(l =>
          !l.match(/^Description:/i) && !l.match(/^Image:/i) && l.trim()
        ).join('\n').trim();
        const bodyText = desc || prose;
        const hasCode = bodyText.includes('`') || bodyText.toLowerCase().includes('npm ') || bodyText.toLowerCase().includes('yarn ');
        return { title, body: bodyText, imageUrl: imageMatch?.[1]?.trim() || '', hasCode };
      });
    }
    // Legacy paragraph-split format
    return body.split('\n\n').filter(Boolean).map((para, i) => {
      const firstDot = para.indexOf('. ');
      const title = firstDot > 0 && firstDot < 80 ? para.slice(0, firstDot + 1) : `Step ${i + 1}`;
      const bodyText = firstDot > 0 && firstDot < 80 ? para.slice(firstDot + 2) : para;
      const hasCode = bodyText.includes('`') || bodyText.toLowerCase().includes('code');
      return { title, body: bodyText, imageUrl: '', hasCode };
    });
  };
  const steps = parseSteps(item.body);

  const [completed, setCompleted] = useState<Set<number>>(() => {
    try {
      const s = localStorage.getItem(progressKey);
      return s ? new Set(JSON.parse(s) as number[]) : new Set();
    } catch { return new Set(); }
  });
  const [expanded, setExpanded] = useState<Set<number>>(new Set([0]));
  const [bookmarked, setBookmarked] = useState<boolean>(() => {
    try { return localStorage.getItem(bookmarkKey) === '1'; } catch { return false; }
  });

  const toggleComplete = (idx: number) => {
    setCompleted((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      try { localStorage.setItem(progressKey, JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  };

  const toggleExpand = (idx: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const toggleBookmark = () => {
    const next = !bookmarked;
    setBookmarked(next);
    try { localStorage.setItem(bookmarkKey, next ? '1' : '0'); } catch {}
  };

  const diffBadge = () => {
    const b = item.badge.toLowerCase();
    if (b.includes('beginner') || b.includes('easy')) return { label: 'Beginner', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
    if (b.includes('advanced') || b.includes('expert')) return { label: 'Advanced', cls: 'bg-red-500/10 text-red-400 border-red-500/20' };
    return { label: 'Intermediate', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
  };
  const diff = diffBadge();
  const totalSteps = steps.length;
  const completedCount = completed.size;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold ${diff.cls}`}>
              {diff.label}
            </span>
            <span className="text-xs text-white/30">{item.byline}</span>
          </div>
          <h2 className="text-2xl font-bold text-white leading-snug">{item.title}</h2>
        </div>
        <button
          type="button"
          onClick={toggleBookmark}
          aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark tutorial'}
          className={`shrink-0 flex h-9 w-9 items-center justify-center rounded-xl border transition ${
            bookmarked
              ? 'border-amber-400/30 bg-amber-400/10 text-amber-400'
              : 'border-white/[0.08] bg-white/[0.04] text-white/30 hover:text-white'
          }`}
        >
          {bookmarked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        </button>
      </div>

      {/* Prerequisites */}
      {item.chips && item.chips.length > 0 && (
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.05] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-400/70 mb-2">Prerequisites</p>
          <div className="flex flex-wrap gap-2">
            {item.chips.map((chip) => (
              <span key={chip} className="rounded-lg border border-indigo-500/20 bg-indigo-500/[0.08] px-2.5 py-1 text-xs font-medium text-indigo-300/80">
                {chip}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Progress */}
      <div>
        <div className="flex justify-between text-[11px] text-white/35 mb-1.5">
          <span>{completedCount} / {totalSteps} steps completed</span>
          <span>{Math.round((completedCount / Math.max(totalSteps, 1)) * 100)}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-white/[0.07] overflow-hidden">
          <div
            className="h-2 rounded-full bg-indigo-500/70 transition-all duration-500"
            style={{ width: `${(completedCount / Math.max(totalSteps, 1)) * 100}%` }}
          />
        </div>
        {completedCount === totalSteps && totalSteps > 0 && (
          <p className="mt-2 text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" /> Tutorial complete!
          </p>
        )}
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {steps.map((step, idx) => {
          const isDone = completed.has(idx);
          const isOpen = expanded.has(idx);

          return (
            <div
              key={idx}
              className={`rounded-2xl border transition-all duration-200 ${
                isDone
                  ? 'border-emerald-500/20 bg-emerald-500/[0.04]'
                  : isOpen
                  ? 'border-indigo-500/25 bg-indigo-500/[0.04]'
                  : 'border-white/[0.07] bg-white/[0.02]'
              }`}
            >
              {/* Step header */}
              <button
                type="button"
                onClick={() => toggleExpand(idx)}
                className="flex w-full items-center gap-4 p-4 text-left"
                aria-expanded={isOpen}
              >
                {/* Circle indicator */}
                <div className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  isDone
                    ? 'bg-emerald-500 text-white'
                    : isOpen
                    ? 'border-2 border-indigo-400 text-indigo-400'
                    : 'border-2 border-white/[0.12] text-white/25'
                }`}>
                  {isDone ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                </div>
                <span className={`flex-1 text-sm font-semibold leading-snug ${isDone ? 'text-emerald-300/80 line-through decoration-emerald-500/40' : 'text-white/80'}`}>
                  {step.title}
                </span>
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 shrink-0 text-white/25" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 text-white/25" />
                )}
              </button>

              {/* Step body */}
              {isOpen && (
                <div className="px-4 pb-4 pl-16 space-y-3">
                  {step.body && (step.hasCode ? (
                    <pre className="rounded-xl border border-white/[0.08] bg-black/40 p-4 text-xs font-mono text-emerald-300/80 overflow-x-auto leading-relaxed whitespace-pre-wrap">
                      {step.body}
                    </pre>
                  ) : (
                    <p className="text-sm leading-[1.8] text-white/60">{step.body}</p>
                  ))}
                  {step.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={step.imageUrl}
                      alt={`Step ${idx + 1} illustration`}
                      className="rounded-xl border border-white/[0.08] max-w-full"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => toggleComplete(idx)}
                    className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-semibold transition ${
                      isDone
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15'
                        : 'border-white/[0.10] bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white'
                    }`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {isDone ? 'Completed — undo?' : 'Mark complete'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <CommentSection
        comments={comments} commentText={commentText} displayName={displayName}
        setCommentText={setCommentText}
        submitComment={submitComment} submitReply={submitReply} likeComment={likeComment} editComment={editComment} deleteComment={deleteComment} currentUserId={currentUserId} totalComments={totalComments} commentRef={commentRef}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   CommentSection — shared reusable sub-component
═══════════════════════════════════════════════════════════════════ */
interface CommentSectionProps {
  comments: Comment[];
  commentText: string;
  displayName: string;
  setCommentText: (v: string) => void;
  submitComment: () => void;
  submitReply: (parentId: string, text: string) => void;
  likeComment: (commentId: string) => void;
  editComment?: (commentId: string, text: string) => void;
  deleteComment?: (commentId: string) => void;
  currentUserId?: string;
  totalComments: number;
  commentRef: React.RefObject<HTMLTextAreaElement>;
}

export function CommentSection({
  comments, commentText, displayName,
  setCommentText,
  submitComment, submitReply, likeComment,
  editComment, deleteComment, currentUserId,
  totalComments, commentRef,
}: CommentSectionProps) {
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  return (
    <div className="border-t border-white/[0.06] pt-8" id="comments">
      {/* Header */}
      <h3 className="flex items-center gap-2 text-[15px] font-bold text-white mb-5">
        <MessageCircle className="h-4 w-4 text-white/30" />
        {totalComments} Comment{totalComments !== 1 ? 's' : ''}
      </h3>

      {/* Input box */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 mb-6">
        <div className="mb-3 flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[11px] font-bold text-white/50">
            {displayName ? initials(displayName) : '?'}
          </div>
          <span className="text-[13px] font-semibold text-white/70">{displayName}</span>
        </div>
        <textarea
          ref={commentRef}
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitComment(); }}
          placeholder="Add a comment… (⌘↵ to post)"
          rows={2}
          className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white placeholder:text-white/20 outline-none transition focus:border-white/[0.18] focus:bg-white/[0.06]"
        />
        <div className="mt-2.5 flex items-center justify-between">
          <p className="text-[10px] text-white/20">All comments are public</p>
          <button
            type="button"
            onClick={submitComment}
            disabled={!commentText.trim()}
            className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-white px-4 text-xs font-bold text-slate-950 shadow-sm transition hover:bg-white/90 disabled:opacity-25 active:scale-95"
          >
            <Send className="h-3 w-3" />
            Post
          </button>
        </div>
      </div>

      {/* Comment list */}
      <div className="space-y-5">
        {comments.length === 0 ? (
          <div className="py-10 text-center">
            <MessageCircle className="mx-auto h-8 w-8 text-white/[0.08]" />
            <p className="mt-3 text-sm text-white/25">No comments yet. Be the first.</p>
          </div>
        ) : (
          comments.map((c) => (
            <CommentRow
              key={c.id}
              comment={c}
              currentUserId={currentUserId}
              onLike={() => likeComment(c.id)}
              replyOpen={replyTo === c.id}
              replyText={replyText}
              onReplyToggle={() => { setReplyTo(replyTo === c.id ? null : c.id); setReplyText(''); }}
              onReplyTextChange={setReplyText}
              onLikeReply={(rid) => likeComment(rid)}
              onEdit={editComment ? (text) => editComment(c.id, text) : undefined}
              onEditReply={editComment}
              onDelete={deleteComment ? () => deleteComment(c.id) : undefined}
              onDeleteReply={deleteComment}
              onSubmitReply={() => {
                if (!replyText.trim()) return;
                const text = replyText;
                setReplyTo(null);
                setReplyText('');
                submitReply(c.id, text);
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* ─── Comment row ────────────────────────────────────────────────── */
function CommentRow({
  comment: c,
  currentUserId,
  onLike,
  replyOpen, replyText,
  onReplyToggle, onReplyTextChange,
  onLikeReply,
  onSubmitReply,
  onEdit, onEditReply, onDelete, onDeleteReply,
}: {
  comment: Comment;
  currentUserId?: string;
  onLike: () => void;
  replyOpen: boolean;
  replyText: string;
  onReplyToggle: () => void;
  onReplyTextChange: (v: string) => void;
  onLikeReply: (id: string) => void;
  onSubmitReply: () => void;
  onEdit?: (text: string) => void;
  onEditReply?: (id: string, text: string) => void;
  onDelete?: () => void;
  onDeleteReply?: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(c.text);
  const [editSaving, setEditSaving] = useState(false);
  const [replyMenuOpen, setReplyMenuOpen] = useState<string | null>(null);
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [replyEditText, setReplyEditText] = useState('');
  const [replyEditSaving, setReplyEditSaving] = useState(false);
  const isOwner = Boolean(currentUserId && c.userId && c.userId === currentUserId);

  useEffect(() => { setEditText(c.text); }, [c.text]);

  const saveEdit = async () => {
    if (!editText.trim() || editSaving || !onEdit) return;
    setEditSaving(true);
    try { await onEdit(editText); setEditing(false); }
    finally { setEditSaving(false); }
  };

  const saveReplyEdit = async (rid: string) => {
    if (!replyEditText.trim() || replyEditSaving || !onEditReply) return;
    setReplyEditSaving(true);
    try { await onEditReply(rid, replyEditText); setEditingReplyId(null); }
    finally { setReplyEditSaving(false); }
  };

  return (
    <div className="flex gap-3">
      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${c.color}`}>
        {c.initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-white/80">{c.author}</span>
          <span className="text-[10px] text-white/25">{timeAgo(c.timestamp)}</span>
          {isOwner && onEdit && onDelete && !editing && (
            <div className="relative ml-auto">
              <button
                type="button"
                onClick={() => setMenuOpen(v => !v)}
                className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-white/25 transition hover:bg-white/[0.06] hover:text-white/70"
                aria-label="Comment options"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-7 z-20 min-w-[120px] overflow-hidden rounded-xl border border-white/[0.10] bg-[#141418] py-1 shadow-xl">
                    <button
                      type="button"
                      onClick={() => { setMenuOpen(false); setEditing(true); setEditText(c.text); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium text-white/70 transition hover:bg-white/[0.06] hover:text-white"
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => { setMenuOpen(false); onDelete(); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium text-red-400 transition hover:bg-red-500/10"
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {editing ? (
          <div className="mt-2 space-y-2">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-[13px] text-white outline-none focus:border-white/[0.18]"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void saveEdit()}
                disabled={!editText.trim() || editSaving}
                className="inline-flex h-7 items-center rounded-lg bg-white px-3 text-[11px] font-bold text-slate-950 transition disabled:opacity-25"
              >
                {editSaving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => { setEditing(false); setEditText(c.text); }}
                disabled={editSaving}
                className="inline-flex h-7 items-center rounded-lg px-3 text-[11px] font-semibold text-white/45 transition hover:text-white/80"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-1.5 text-[13px] leading-relaxed text-white/60">{c.text}</p>
        )}

        {/* Actions */}
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={onLike}
            className={`inline-flex items-center gap-1 text-[11px] font-semibold transition ${c.likedByMe ? 'text-rose-400' : 'text-white/25 hover:text-white/65'}`}
          >
            <Heart className={`h-3 w-3 ${c.likedByMe ? 'fill-rose-400' : ''}`} />
            {c.likes > 0 && (
              <span className="tabular-nums">{c.likes}</span>
            )}
          </button>
          <button
            type="button"
            onClick={onReplyToggle}
            className="text-[11px] font-semibold text-white/25 transition hover:text-white/65"
          >
            Reply
          </button>
        </div>

        {/* Reply input */}
        {replyOpen && (
          <div className="mt-3 flex gap-2">
            <textarea
              value={replyText}
              onChange={(e) => onReplyTextChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSubmitReply(); }}
              placeholder="Write a reply… (⌘↵ to post)"
              rows={2}
              className="flex-1 resize-none rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-xs text-white placeholder:text-white/20 outline-none focus:border-white/[0.18]"
            />
            <button
              type="button"
              onClick={onSubmitReply}
              disabled={!replyText.trim()}
              className="self-end inline-flex h-8 items-center rounded-xl bg-white px-3 text-xs font-bold text-slate-950 transition disabled:opacity-25"
            >
              <Send className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Nested replies */}
        {c.replies.length > 0 && (
          <div className="mt-4 space-y-3 border-l border-white/[0.06] pl-4">
            {c.replies.map((r) => {
              const replyOwner = Boolean(currentUserId && r.userId && r.userId === currentUserId);
              const isEditingReply = editingReplyId === r.id;
              return (
                <div key={r.id} className="flex gap-3">
                  <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${r.color}`}>
                    {r.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-semibold text-white/75">{r.author}</span>
                      <span className="text-[10px] text-white/25">{timeAgo(r.timestamp)}</span>
                      {replyOwner && onEditReply && onDeleteReply && !isEditingReply && (
                        <div className="relative ml-auto">
                          <button
                            type="button"
                            onClick={() => setReplyMenuOpen(v => v === r.id ? null : r.id)}
                            className="inline-flex h-5 w-5 items-center justify-center rounded-md text-white/25 transition hover:bg-white/[0.06] hover:text-white/70"
                            aria-label="Reply options"
                          >
                            <MoreHorizontal className="h-3 w-3" />
                          </button>
                          {replyMenuOpen === r.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setReplyMenuOpen(null)} />
                              <div className="absolute right-0 top-6 z-20 min-w-[120px] overflow-hidden rounded-xl border border-white/[0.10] bg-[#141418] py-1 shadow-xl">
                                <button
                                  type="button"
                                  onClick={() => { setReplyMenuOpen(null); setEditingReplyId(r.id); setReplyEditText(r.text); }}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium text-white/70 transition hover:bg-white/[0.06] hover:text-white"
                                >
                                  <Pencil className="h-3 w-3" /> Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setReplyMenuOpen(null); onDeleteReply(r.id); }}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium text-red-400 transition hover:bg-red-500/10"
                                >
                                  <Trash2 className="h-3 w-3" /> Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    {isEditingReply ? (
                      <div className="mt-1.5 space-y-2">
                        <textarea
                          value={replyEditText}
                          onChange={(e) => setReplyEditText(e.target.value)}
                          rows={2}
                          className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-[12px] text-white outline-none focus:border-white/[0.18]"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void saveReplyEdit(r.id)}
                            disabled={!replyEditText.trim() || replyEditSaving}
                            className="inline-flex h-7 items-center rounded-lg bg-white px-3 text-[11px] font-bold text-slate-950 transition disabled:opacity-25"
                          >
                            {replyEditSaving ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingReplyId(null)}
                            disabled={replyEditSaving}
                            className="inline-flex h-7 items-center rounded-lg px-3 text-[11px] font-semibold text-white/45 transition hover:text-white/80"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1 text-[12px] leading-relaxed text-white/55">{r.text}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => onLikeReply(r.id)}
                      className={`mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold transition ${r.likedByMe ? 'text-rose-400' : 'text-white/20 hover:text-white/55'}`}
                    >
                      <Heart className={`h-2.5 w-2.5 ${r.likedByMe ? 'fill-rose-400' : ''}`} />
                      {r.likes > 0 && (
                        <span className="tabular-nums">{r.likes}</span>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
