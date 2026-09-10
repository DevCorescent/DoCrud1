'use client';

/**
 * The strip under the navigation.
 *
 * ═══ WHAT IT REPLACED ═══
 *
 * A logo marquee — a row of company marks scrolling on a loop, above the
 * greeting. It moved forever, said the same thing every time, and occupied the
 * most valuable strip on the page: the first thing under the nav. The
 * companies it showed are still on the page, in the Company Explorer inside
 * the hero band, where they are a list somebody can actually click.
 *
 * ═══ WHAT IT IS ═══
 *
 * One message, written by Super Admin, in three flavours — an announcement, an
 * alert or a reminder — with a tone, up to two calls to action, and a close
 * button. Everything on it comes from the stored config; this file decides
 * nothing except how it looks.
 *
 * ═══ DISMISSAL ═══
 *
 * Closing it stores the banner's id in localStorage. It is per browser and per
 * message: a new announcement gets a new id and appears again, while editing
 * the wording of one somebody already closed does not force it back onto them.
 * An admin who wants it back for everybody changes the id, which the admin
 * screen offers as a button.
 *
 * Storage is wrapped: a private window, cleared site data or a browser set to
 * block storage all throw on access, and none of those should cost somebody
 * the announcement.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, BellRing, Megaphone, X } from 'lucide-react';
import type { AnnouncementKind, AnnouncementTone } from '@/lib/server/homepage-config';
import './announcement-bar.css';

export interface AnnouncementBannerData {
  id: string;
  kind: AnnouncementKind;
  text: string;
  tone: AnnouncementTone;
  ctaLabel: string;
  ctaHref: string;
  ctaLabel2: string;
  ctaHref2: string;
  dismissible: boolean;
  active: boolean;
}

const KIND_META: Record<AnnouncementKind, { label: string; Icon: typeof Megaphone }> = {
  announcement: { label: 'Announcement', Icon: Megaphone },
  alert: { label: 'Alert', Icon: AlertTriangle },
  reminder: { label: 'Reminder', Icon: BellRing },
};

const STORAGE_PREFIX = 'docrud.announcement.';

function wasDismissed(id: string): boolean {
  try { return window.localStorage.getItem(STORAGE_PREFIX + id) === '1'; }
  catch { return false; }
}

export default function AnnouncementBar({ banner }: { banner: AnnouncementBannerData | null }) {
  /* Undecided until the effect runs. Rendering the bar and then removing it
     would flash a message somebody has already closed; rendering nothing and
     then showing it costs one frame on a strip that is not the reason anyone
     came to the page. */
  const [show, setShow] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!banner?.active) { setShow(false); return; }
    setClosing(false);
    setShow(!banner.dismissible || !wasDismissed(banner.id));
  }, [banner?.id, banner?.active, banner?.dismissible]);

  if (!banner?.active || !show) return null;

  const { label, Icon } = KIND_META[banner.kind] ?? KIND_META.announcement;
  const primary = banner.ctaLabel && banner.ctaHref;
  const secondary = banner.ctaLabel2 && banner.ctaHref2;

  const dismiss = () => {
    /* Out before gone: the height collapses over the same 260ms the opacity
       does, so the page below does not jump up under the pointer. */
    setClosing(true);
    try { window.localStorage.setItem(STORAGE_PREFIX + banner.id, '1'); } catch { /* ignore */ }
    window.setTimeout(() => setShow(false), 260);
  };

  return (
    <div
      className={closing ? 'ann ann-closing' : 'ann'}
      data-tone={banner.tone}
      role={banner.kind === 'alert' ? 'alert' : 'status'}
    >
      <div className="ann-inner">
        <span className="ann-kind">
          <Icon className="ann-kind-i" aria-hidden />
          <span className="ann-kind-t">{label}</span>
        </span>

        <p className="ann-text">{banner.text}</p>

        {(primary || secondary) && (
          <span className="ann-ctas">
            {secondary && (
              <Link href={banner.ctaHref2} className="ann-cta ann-cta-ghost">
                {banner.ctaLabel2}
              </Link>
            )}
            {primary && (
              <Link href={banner.ctaHref} className="ann-cta ann-cta-solid">
                {banner.ctaLabel}
                <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
            )}
          </span>
        )}

        {banner.dismissible && (
          <button type="button" onClick={dismiss} className="ann-x" aria-label="Dismiss announcement">
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
