'use client';

/**
 * The Jobs tab's post menu.
 *
 * ═══ THE TAB STILL NAVIGATES ═══
 *
 * The tab is a link to /jobs and stays one; the chevron beside it is a separate
 * button that opens this menu. Turning the whole tab into a menu trigger would
 * have taken the board — the thing most people click Jobs for — from one click
 * to two, to add a menu. Two controls in one pill costs a little width and
 * nothing else.
 *
 * ═══ EVERY ROW GOES SOMEWHERE THAT EXISTS ═══
 *
 * A post menu is exactly the place where invented destinations creep in, so
 * each row here is a surface that is already built:
 *
 *   Post a job          → /jobs/post           the seven-step wizard
 *   Post an internship  → /jobs/post?kind=…    the same wizard, preset
 *   Post a project      → /projects/create     the existing single-step form
 *   Describe a role     → /jobs/post?ai=1      the wizard with AI Fill open
 *   Create a company    → /businesses/create   the existing company form
 *
 * "Describe a role" is deliberately not called "post a requirement". There is
 * no requirement posting type in this product; what exists is the AI draft
 * endpoint, which turns a sentence into a job draft the poster then edits. The
 * label says what the click does.
 *
 * ═══ PORTALLED, LIKE THE FILTER SHEET ═══
 *
 * `.dh-bar-in` is the page's one blurred surface, and a menu inside a
 * `backdrop-filter` ancestor renders as a grey rectangle instead of glass — the
 * same trap the filter sheet hit. So this goes to document.body, which also
 * puts it above the bar's stacking context. Portalling out of `.dh` means the
 * `--dh-*` tokens are gone, so the root re-declares the few it needs; the
 * sheet's own assertion caught those going stale once already.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  Briefcase, GraduationCap, Hammer, Sparkles, Building2, ChevronDown, ArrowRight,
} from 'lucide-react';

interface Row {
  label: string;
  note: string;
  href: string;
  Icon: typeof Briefcase;
  /** Rows after a rule: still posting, but not an opportunity. */
  tail?: boolean;
}

export const POST_ROWS: Row[] = [
  {
    label: 'Post a job',
    note: 'Full-time, part-time or contract',
    href: '/jobs/post',
    Icon: Briefcase,
  },
  {
    label: 'Post an internship',
    note: 'The same steps, set to internship',
    href: '/jobs/post?kind=internship',
    Icon: GraduationCap,
  },
  {
    label: 'Post a project',
    note: 'Fixed or hourly, one-off or ongoing',
    href: '/projects/create',
    Icon: Hammer,
  },
  {
    label: 'Describe a role instead',
    note: 'One sentence, drafted for you to edit',
    href: '/jobs/post?ai=1',
    Icon: Sparkles,
  },
  {
    label: 'Create a company page',
    note: 'Industry, location and open roles',
    href: '/businesses/create',
    Icon: Building2,
    tail: true,
  },
];

export default function PostMenu() {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const rows = useRef<Array<HTMLAnchorElement | null>>([]);

  /* Closing wants focus back on the chevron, but calling `focus()` in the same
     tick as `setOpen(false)` loses the race: React then unmounts the portal,
     and removing the element that had focus sends focus to <body>. So the
     intent is recorded and acted on after the close has rendered. */
  const restore = useRef(false);
  const close = useCallback((focusTrigger = true) => {
    restore.current = focusTrigger;
    setOpen(false);
  }, []);

  useEffect(() => {
    if (open || !restore.current) return;
    restore.current = false;
    trigger.current?.focus();
  }, [open]);

  /* Positioned against the trigger, measured before paint so the panel does not
     appear at 0,0 for a frame and slide into place. */
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const t = trigger.current?.getBoundingClientRect();
      if (!t) return;
      const width = 292;
      /* Kept inside the viewport rather than anchored blindly to the trigger:
         on a narrow screen the Jobs tab can sit close enough to the right edge
         that a left-aligned panel would hang off it. */
      const left = Math.min(Math.max(10, t.left - 8), window.innerWidth - width - 10);
      /* Hung from the BAR's lower edge, not the chevron's. The chevron is a
         30px control inside a 63px bar, so anchoring to it put the panel's top
         at 54px — 9px inside the bar, overlapping the one surface it is
         supposed to drop away from. */
      const barBottom = trigger.current?.closest('.dh-bar')?.getBoundingClientRect().bottom;
      setBox({ top: Math.max(t.bottom, barBottom ?? t.bottom) + 8, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      const items = rows.current.filter(Boolean) as HTMLAnchorElement[];
      if (!items.length) return;
      const at = items.indexOf(document.activeElement as HTMLAnchorElement);
      const last = items.length - 1;
      let next = 0;
      if (e.key === 'ArrowDown') next = at < 0 || at === last ? 0 : at + 1;
      else if (e.key === 'ArrowUp') next = at <= 0 ? last : at - 1;
      else if (e.key === 'End') next = last;
      items[next]?.focus();
    };
    /* Pointer-down rather than click: a click listener fires after the link it
       landed on has already been followed. */
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || trigger.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open, close]);

  /* Focus the first row on open, so a keyboard user lands in the menu. */
  useEffect(() => {
    if (open) rows.current[0]?.focus();
  }, [open]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="dh-tab-more"
        aria-label="Post an opportunity"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronDown size={14} strokeWidth={2} aria-hidden data-open={open ? '1' : '0'} />
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={panel}
          className="dh-pm"
          role="menu"
          aria-label="Post an opportunity"
          style={{ top: box?.top ?? -9999, left: box?.left ?? -9999 }}
        >
          <p className="dh-pm-h">Post an opportunity</p>
          {POST_ROWS.map((r, i) => (
            <Link
              key={r.href}
              ref={(el) => { rows.current[i] = el; }}
              href={r.href}
              role="menuitem"
              className={`dh-pm-r${r.tail ? ' is-tail' : ''}`}
              onClick={() => setOpen(false)}
            >
              <span className="dh-pm-i" aria-hidden><r.Icon size={16} /></span>
              <span className="dh-pm-b">
                <span className="dh-pm-l">{r.label}</span>
                <span className="dh-pm-n">{r.note}</span>
              </span>
              <ArrowRight size={13} className="dh-pm-a" aria-hidden />
            </Link>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
