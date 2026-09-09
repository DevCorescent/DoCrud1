'use client';

import React from 'react';
import { FEED_CARD, FEED_CARD_MEDIA } from './cardShell';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Newspaper } from 'lucide-react';
import { PresenceDot } from '@/components/PresenceBadge';
import { linkifyText } from '@/lib/linkify';
import {
  FEED_AVATAR_CLS,
  feedCategoryLabel,
  shouldShowFeedTitle,
} from '@/components/feed/feedCardTheme';
import {
  buildCategoryHighlight,
  FeedCardCategoryLine,
  FeedCardMetaChips,
  getFeedBodyFull,
  getFeedBodySnippet,
} from '@/components/feed/FeedCardMeta';

/**
 * The item's own label, or '' when that label is only the content type
 * restated.
 *
 * `badge` comes from the API's cleanBadge(), which falls back to the
 * category's display label when an item carries no real tag — so for most
 * items it is just "Post" / "Article" / "Docs". Comparing against both the
 * raw category and its display label removes the content type wherever the
 * badge is shown, for existing categories and any added later, without
 * hardcoding a list of type names.
 *
 * Genuine labels (a poll's "Closed", a tutorial's "Beginner", a news
 * section) are not the category, so they still come through.
 */
export function nonTypeBadge(item: { badge?: string; category?: string }): string {
  const badge = (item.badge ?? '').trim();
  if (!badge) return '';
  const cat = (item.category || 'post').trim();
  const b = badge.toLowerCase();
  if (b === cat.toLowerCase()) return '';
  if (b === feedCategoryLabel(cat).toLowerCase()) return '';
  return badge;
}

/**
 * Publication text that opens in place.
 *
 * The feed shows a few lines; "Read more" removes the clamp and keeps the
 * reader exactly where they are. It never navigates — the card itself is the
 * link to the full publication, so a separate "View post" action would be a
 * second way to do what clicking anywhere else already does. This control
 * stops the click from reaching the card for exactly that reason.
 *
 * "Read more" appears only when the text is actually clipped — measured from
 * the rendered element rather than guessed from a character count, so it is
 * correct at every width and font size.
 */
export function ExpandableBody({
  text,
  className = '',
}: {
  text: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);
  const ref = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    /* Only meaningful while collapsed: once expanded the element grows to fit
       and would always report no overflow. */
    const measure = () => { if (!expanded) setClipped(el.scrollHeight > el.clientHeight + 1); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, expanded]);

  const stop = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className={className}>
      <p
        ref={ref}
        className={`whitespace-pre-line text-[13px] leading-relaxed text-white/50 ${
          expanded ? '' : 'line-clamp-4 sm:line-clamp-3'
        }`}
      >
        {linkifyText(text)}
      </p>

      {(clipped || expanded) && (
        <div className="mt-1.5">
          {/* Near-white and semibold so it reads as a control rather than the
              tail of the paragraph it sits under (the body is white/50). No
              ellipsis prefix for the same reason — that ran it into the text.
              Inline and compact: no button chrome, no background. */}
          <button
            type="button"
            aria-expanded={expanded}
            className="pfc-more cursor-pointer text-[12.5px] font-semibold text-white/[0.95] transition-colors hover:text-white"
            onClick={(e) => { stop(e); setExpanded((v) => !v); }}
            /* The card treats Enter/Space as "open the post", and a keydown on
               this button would otherwise reach it and navigate. The button's
               own activation still fires, so the toggle keeps working. */
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
          >
            {expanded ? 'Show less' : 'Read more'}
          </button>
        </div>
      )}
    </div>
  );
}

export type FeedCardShellItem = {
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
  thumbnailUrl?: string;
  avatarUrl?: string;
  uploadedByUserId?: string;
  uploadedByName?: string;
  businessPageSlug?: string;
};

export type PublishedFeedCardProps = {
  item: FeedCardShellItem;
  /** Fallback when `subtitle` is not provided. */
  timeLabel: string;
  /** Host-owned detail URL — do not invent shareId/id policy here. */
  detailHref: string;
  /** Full subtitle line under author (preserves authorMeta/badge · time). */
  subtitle?: React.ReactNode;
  headerRight?: React.ReactNode;
  headerExtras?: React.ReactNode;
  /** Override main body (e.g. BodyDisplay / BodyOrChips). Pass null to hide. */
  renderMainBody?: React.ReactNode | null;
  /** Override title node (e.g. search highlight). */
  renderTitle?: React.ReactNode | null;
  /**
   * Metadata section. Pass `null` when main body already includes structured
   * chips (BodyDisplay / BodyOrChips). Omit to use default FeedCardMetaChips.
   */
  renderMetadata?: React.ReactNode | null;
  beforeActions?: React.ReactNode;
  actions: React.ReactNode;
  footer?: React.ReactNode;
  articleClassName?: string;
  articleProps?: React.HTMLAttributes<HTMLElement>;
  linkContent?: boolean;
  /** When false, author name/avatar are not links (profile feed). Default true. */
  linkAuthor?: boolean;
  showPresence?: boolean;
  showBodySnippet?: boolean;
  bodyLineClamp?: 2 | 3;
};

/**
 * Shared feed-card shell (Task 9).
 * Hierarchy: Category → Title → Main Content → Metadata → Actions
 * Hosts keep existing interaction handlers and content renderers via slots.
 */
export function PublishedFeedCard({
  item,
  timeLabel,
  detailHref,
  subtitle,
  headerRight,
  headerExtras,
  renderMainBody,
  renderTitle,
  renderMetadata,
  beforeActions,
  actions,
  footer,
  /* The shared shell by default, so every feed that renders this card gets the
     same object without each one having to remember to ask for it. */
  articleClassName = FEED_CARD,
  articleProps,
  linkContent = true,
  linkAuthor = true,
  showPresence = true,
  showBodySnippet = true,
}: PublishedFeedCardProps) {
  /* The publishing category. Kept for filtering, routing, title/meta rules and
     analytics - it is deliberately never rendered as a badge. */
  const cat = item.category || 'post';
  const displayName = item.uploadedByName || item.byline.split(' · ')[0] || 'Docrud User';
  const initials = displayName.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
  const profileHref = item.businessPageSlug
    ? `/businesses/${item.businessPageSlug}`
    : item.uploadedByUserId
      ? `/u/${item.uploadedByUserId}`
      : null;
  const canLinkAuthor = linkAuthor && Boolean(profileHref);
  const showTitle = shouldShowFeedTitle(cat, item.title);
  const snippet = showBodySnippet ? getFeedBodySnippet(item.body) : '';
  /* The whole publication with its paragraphs intact — the clamp is CSS, so
     this same string is what the preview shows and what "Read more" reveals. */
  const fullBody = showBodySnippet ? getFeedBodyFull(item.body) : '';
  const secondaryBadge = nonTypeBadge(item);
  /* Task 12 — category line under the title. Skipped when it would only repeat
     the author already shown in the header (company pages publish as the company). */
  const highlight = buildCategoryHighlight({ category: cat, body: item.body });
  const categoryLine =
    highlight && highlight.toLowerCase() !== displayName.toLowerCase() ? highlight : '';

  const avatarInner = item.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.avatarUrl} alt={displayName} className="h-full w-full rounded-full object-cover" />
  ) : (
    initials.slice(0, 2) || <Newspaper className="h-3.5 w-3.5 opacity-60" />
  );

  const titleEl =
    renderTitle !== undefined
      ? renderTitle
      : showTitle ? (
          <h3 className="text-[15px] font-bold leading-snug tracking-tight text-white line-clamp-2 transition-colors group-hover:text-white/85">
            {item.title}
          </h3>
        ) : null;

  const defaultBody =
    snippet ? (
      <ExpandableBody
        text={fullBody || snippet}
        className={showTitle ? 'mt-1.5' : ''}
      />
    ) : null;

  const bodyEl = renderMainBody !== undefined ? renderMainBody : defaultBody;

  const wrap = (node: React.ReactNode, key?: string) => {
    if (!node) return null;
    if (!linkContent) return <React.Fragment key={key}>{node}</React.Fragment>;
    return (
      <Link key={key} href={detailHref} className="block" onClick={(e) => e.stopPropagation()}>
        {node}
      </Link>
    );
  };

  const subtitleNode = subtitle !== undefined ? subtitle : timeLabel;

  return (
    <article className={articleClassName} {...articleProps}>
      {/* 1. CATEGORY */}
      <div className="mb-3.5 flex items-start gap-3">
        {canLinkAuthor ? (
          <Link
            href={profileHref!}
            onClick={(e) => e.stopPropagation()}
            className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold transition hover:opacity-80 ${FEED_AVATAR_CLS}`}
          >
            {avatarInner}
          </Link>
        ) : (
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold ${FEED_AVATAR_CLS}`}>
            {avatarInner}
          </div>
        )}
        <div className="min-w-0 flex-1">
          {/* No content-type badge. The publishing category drives filtering,
              routing and analytics only - it is never surfaced as a pill on the
              card, for existing categories or any added later. `item.badge` is
              the item's own editorial label (for example a news section), not a
              type, and is still shown when it differs from the category. */}
          {secondaryBadge && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-[11px] text-white/35">{secondaryBadge}</span>
            </div>
          )}
          <div className="mt-1 flex min-w-0 items-center gap-2">
            {canLinkAuthor ? (
              <Link
                href={profileHref!}
                onClick={(e) => e.stopPropagation()}
                className="truncate text-[13.5px] font-semibold leading-tight text-white transition hover:text-white/80"
              >
                {displayName}
              </Link>
            ) : (
              <span className="truncate text-[13.5px] font-semibold leading-tight text-white">{displayName}</span>
            )}
            {showPresence && <PresenceDot userId={item.uploadedByUserId} size="sm" />}
            {headerExtras}
          </div>
          {subtitleNode != null && subtitleNode !== '' && (
            <p className="mt-0.5 truncate text-[11px] text-white/35">{subtitleNode}</p>
          )}
        </div>
        {headerRight && <div className="flex shrink-0 items-center gap-3">{headerRight}</div>}
      </div>

      {/* 2. TITLE (+ Task 12 category line, e.g. a job's company) */}
      {titleEl && <div className="mb-0">{wrap(titleEl, 'title')}</div>}
      <FeedCardCategoryLine text={categoryLine} />

      {/* 3. MAIN CONTENT */}
      {item.thumbnailUrl && (
        <div className={`${FEED_CARD_MEDIA} ${titleEl || bodyEl ? 'mb-3.5' : ''} ${titleEl ? 'mt-3.5' : ''}`}>
          {wrap(
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.thumbnailUrl}
              alt={showTitle ? item.title : ''}
              /* Natural proportions, full width, nothing cut. The height cap
                 that used to live here paired with `object-cover`, so a tall
                 photo was not scaled down to fit — it had its top and bottom
                 sliced off, which is not a thing to do to what someone posted.
                 The bento grid bounds height its own way, by fitting the
                 whole picture inside the tile. */
              className="h-auto w-full transition-transform duration-500 group-hover:scale-[1.01]"
              loading="lazy"
              decoding="async"
            />,
            'thumb',
          )}
        </div>
      )}
      {/* Not wrapped in the card link: the body now carries its own controls,
          and nesting a button inside an anchor is both invalid and a trap for
          the expand click. */}
      {bodyEl && <div>{bodyEl}</div>}

      {/* 4. METADATA */}
      {renderMetadata !== undefined ? (
        renderMetadata
      ) : (
        <FeedCardMetaChips body={item.body} byline={item.byline} category={cat} />
      )}

      {item.chips && item.chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.chips.slice(0, 5).map((c) => (
            <span key={c} className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[11px] text-white/40">
              {c}
            </span>
          ))}
          {item.chips.length > 5 && (
            <span className="rounded-full bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-white/20">
              +{item.chips.length - 5}
            </span>
          )}
        </div>
      )}

      {item.stats && item.stats.length > 0 && (
        <div className="mt-3 flex items-center gap-5">
          {item.stats.slice(0, 3).map((s) => (
            <div key={s.l} className="flex items-baseline gap-1.5">
              <span className="text-[13.5px] font-bold tabular-nums text-white/75">{s.v}</span>
              <span className="text-[9.5px] font-semibold uppercase tracking-widest text-white/25">{s.l}</span>
            </div>
          ))}
        </div>
      )}

      {beforeActions}

      {/* 5. ACTIONS */}
      <div
        /* Task 15 — wrap instead of crushing when a card carries many actions
           on a narrow screen; single-line on wider cards as before. */
        className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-white/[0.05] pt-3.5"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {actions}
      </div>

      {footer}
    </article>
  );
}
