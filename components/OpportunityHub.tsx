'use client';

/**
 * Opportunity Hub — the mobile "More" destination.
 *
 * One profile. One network. Multiple opportunities.
 *
 * This is an ENTRY POINT only: every row hands off to an existing creation
 * flow ("+ Add") or an existing discovery page ("Open →"). It owns no data
 * and duplicates no form — see OPPORTUNITIES below for the exact mapping.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Briefcase,
  Building2,
  Plus,
  Rocket,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';

type Destination =
  /** A route that already exists — navigate straight to it. */
  | { kind: 'route'; href: string }
  /** Needs the signed-in user's id before the route can be built. */
  | { kind: 'ownServiceCatalogue' }
  /** No such flow/page exists in the app yet. Never fabricate one. */
  | { kind: 'unavailable'; note: string };

type Opportunity = {
  id: string;
  label: string;
  description: string;
  Icon: LucideIcon;
  color: string;
  tint: string;
  add: Destination;
  addLabel: string;
  open: Destination;
};

const OPPORTUNITIES: Opportunity[] = [
  {
    id: 'businesses',
    label: 'Businesses',
    description: 'Discover businesses or create yours.',
    Icon: Building2,
    color: '#818cf8',
    tint: 'rgba(129,140,248,0.16)',
    // components/BusinessPageCreator via app/businesses/create
    add: { kind: 'route', href: '/businesses/create' },
    addLabel: 'Add Business',
    // components/BusinessDirectory via app/businesses
    open: { kind: 'route', href: '/businesses' },
  },
  {
    id: 'services',
    label: 'Services',
    description: 'Offer your expertise or find someone who can help.',
    Icon: Wrench,
    color: '#22d3ee',
    tint: 'rgba(34,211,238,0.16)',
    // The canonical service creation system: the provider catalogue's
    // ServiceEditModal at app/services/[userId] (?new=1 opens it directly).
    add: { kind: 'ownServiceCatalogue' },
    addLabel: 'Add Service',
    // The existing service marketplace at app/services
    open: { kind: 'route', href: '/services' },
  },
  {
    id: 'projects',
    label: 'Projects',
    description: 'Find opportunities or post something you need built.',
    Icon: Rocket,
    color: '#f472b6',
    tint: 'rgba(244,114,182,0.16)',
    // app/projects/create — the single-step post form
    add: { kind: 'route', href: '/projects/create' },
    addLabel: 'Post Project',
    // app/projects — the project marketplace
    open: { kind: 'route', href: '/projects' },
  },
  {
    id: 'jobs',
    label: 'Jobs',
    description: 'Discover roles or hire the right professional.',
    Icon: Briefcase,
    color: '#4ade80',
    tint: 'rgba(74,222,128,0.16)',
    // Hiring Desk publishes roles (components/HiringDeskCenter)
    add: { kind: 'route', href: '/workspace?tab=hiring-desk' },
    addLabel: 'Post Job',
    // Existing jobs discovery: the published feed's Jobs tab deep-link
    open: { kind: 'route', href: '/published?tab=job' },
  },
  {
    id: 'gigs',
    label: 'Gigs',
    description: 'Find quick opportunities or publish one.',
    Icon: Zap,
    color: '#facc15',
    tint: 'rgba(250,204,21,0.16)',
    // Gigs Center publishes gigs (components/GigsCenter)
    add: { kind: 'route', href: '/workspace?tab=gigs' },
    addLabel: 'Post Gig',
    // Existing gigs discovery: the published feed's Gigs tab deep-link
    open: { kind: 'route', href: '/published?tab=gig' },
  },
];

export default function OpportunityHub({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);          // drives the slide-up transition
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  /* Animate in on the frame after mount so the transform has a start value. */
  useEffect(() => {
    if (!open) { setShown(false); setNotice(null); setPending(null); return; }
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  /* Escape to close + focus into the sheet, matching the app's other overlays. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => closeRef.current?.focus(), 60);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const go = useCallback((href: string) => { onClose(); router.push(href); }, [onClose, router]);

  const handle = useCallback(async (opp: Opportunity, dest: Destination, action: 'add' | 'open') => {
    if (dest.kind === 'unavailable') { setNotice(dest.note); return; }
    if (dest.kind === 'route') { go(dest.href); return; }

    // ownServiceCatalogue — resolve the signed-in user, then open their
    // catalogue with the existing create form already open.
    setNotice(null);
    setPending(`${opp.id}:${action}`);
    try {
      const res = await fetch('/api/me', { cache: 'no-store' });
      if (res.status === 401) { go('/login?next=/services'); return; }
      const data = (await res.json()) as { id?: string };
      if (!data?.id) { setNotice('Could not open your service catalogue. Please try again.'); return; }
      go(`/services/${data.id}?new=1`);
    } catch {
      setNotice('Could not open your service catalogue. Please try again.');
    } finally {
      setPending(null);
    }
  }, [go]);

  if (!mounted || !open) return null;

  const sheet = (
    <>
      <style>{`

        .oph-root { position: fixed; inset: 0; z-index: 9998; }

        .oph-backdrop {
          position: absolute; inset: 0;
          background: rgba(0,0,0,0.62);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          opacity: 0;
          transition: opacity 220ms ease;
        }
        .oph-root.oph-shown .oph-backdrop { opacity: 1; }

        .oph-panel {
          position: absolute;
          left: 0; right: 0; bottom: 0;
          max-height: 86vh;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          padding: 8px 16px calc(20px + env(safe-area-inset-bottom));
          background: rgba(11,11,16,0.97);
          backdrop-filter: blur(28px) saturate(180%);
          -webkit-backdrop-filter: blur(28px) saturate(180%);
          border: 1px solid rgba(255,255,255,0.09);
          border-bottom: none;
          border-radius: 24px 24px 0 0;
          box-shadow: 0 -12px 48px rgba(0,0,0,0.62);
          transform: translateY(100%);
          transition: transform 360ms cubic-bezier(0.22, 1, 0.36, 1);
          will-change: transform;
        }
        .oph-root.oph-shown .oph-panel { transform: translateY(0); }

        /* Opened from the mobile bottom nav and, at sm+, from the More
           control beside the desktop search bar. Rows, colours, spacing and
           actions are identical at every width; the panel is simply given a
           readable width on wide screens instead of stretching edge to edge. */
        @media (min-width: 640px) {
          .oph-panel {
            left: 50%;
            right: auto;
            width: min(520px, calc(100vw - 48px));
            transform: translate(-50%, 100%);
            border-radius: 28px;
            border-bottom: 1px solid rgba(255,255,255,0.09);
            bottom: 24px;
          }
          .oph-root.oph-shown .oph-panel { transform: translate(-50%, 0); }
          .oph-grip { display: none; }
        }

        .oph-grip {
          width: 38px; height: 4px; border-radius: 999px;
          background: rgba(255,255,255,0.18);
          margin: 6px auto 12px;
        }

        .oph-close {
          position: absolute; top: 14px; right: 14px;
          width: 32px; height: 32px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.09);
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.55);
          cursor: pointer;
        }
        .oph-close:focus-visible, .oph-act:focus-visible {
          outline: 2px solid #a78bfa; outline-offset: 2px;
        }

        .oph-title {
          font-size: 17px; font-weight: 700; line-height: 1.25;
          color: rgba(255,255,255,0.94);
          text-align: center;
          margin: 0 36px 4px;
          letter-spacing: -0.01em;
        }
        .oph-sub {
          font-size: 11.5px; font-weight: 500;
          color: rgba(255,255,255,0.36);
          text-align: center;
          margin: 0 0 14px;
        }

        .oph-row {
          display: flex; align-items: flex-start; gap: 12px;
          padding: 12px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.07);
          background: rgba(255,255,255,0.03);
        }
        .oph-row + .oph-row { margin-top: 8px; }

        .oph-ic {
          flex: none;
          width: 38px; height: 38px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 12px;
        }
        .oph-body { flex: 1; min-width: 0; }
        .oph-name {
          font-size: 14px; font-weight: 700; line-height: 1.2;
          color: rgba(255,255,255,0.92);
        }
        .oph-desc {
          font-size: 11.5px; font-weight: 500; line-height: 1.45;
          color: rgba(255,255,255,0.42);
          margin-top: 2px;
        }

        .oph-acts { display: flex; gap: 8px; margin-top: 10px; }
        .oph-act {
          display: inline-flex; align-items: center; gap: 4px;
          min-height: 34px;
          padding: 0 12px;
          border-radius: 10px;
          font-size: 12px; font-weight: 700;
          border: 1px solid rgba(255,255,255,0.09);
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.72);
          cursor: pointer;
          text-decoration: none;
          -webkit-tap-highlight-color: transparent;
          transition: transform 0.16s ease, opacity 0.14s ease;
        }
        .oph-act:active { transform: scale(0.94); opacity: 0.75; }
        .oph-act[aria-disabled='true'] { opacity: 0.4; }

        .oph-notice {
          margin-top: 12px;
          padding: 9px 12px;
          border-radius: 10px;
          border: 1px solid rgba(250,204,21,0.22);
          background: rgba(250,204,21,0.08);
          color: rgba(253,230,138,0.9);
          font-size: 11.5px; font-weight: 600;
          text-align: center;
        }
      `}</style>

      <div className={`oph-root${shown ? ' oph-shown' : ''}`}>
        <div className="oph-backdrop" onClick={onClose} aria-hidden="true" />

        <div
          ref={panelRef}
          className="oph-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="oph-title"
        >
          <div className="oph-grip" aria-hidden="true" />
          <button ref={closeRef} type="button" className="oph-close" onClick={onClose} aria-label="Close opportunities menu">
            <X width={16} height={16} />
          </button>

          <h2 id="oph-title" className="oph-title">What are you looking for today?</h2>
          <p className="oph-sub">One profile. One network. Multiple opportunities.</p>

          {OPPORTUNITIES.map(opp => {
            const { Icon } = opp;
            const addBusy  = pending === `${opp.id}:add`;
            const addOff   = opp.add.kind === 'unavailable';
            const openOff  = opp.open.kind === 'unavailable';
            return (
              <div key={opp.id} className="oph-row">
                <span className="oph-ic" style={{ color: opp.color, background: opp.tint }}>
                  <Icon width={19} height={19} />
                </span>
                <div className="oph-body">
                  <div className="oph-name">{opp.label}</div>
                  <div className="oph-desc">{opp.description}</div>
                  <div className="oph-acts">
                    <button
                      type="button"
                      className="oph-act"
                      aria-disabled={addOff || undefined}
                      aria-label={addOff ? `${opp.addLabel} — not available yet` : opp.addLabel}
                      onClick={() => void handle(opp, opp.add, 'add')}
                    >
                      <Plus width={13} height={13} aria-hidden="true" />
                      {addBusy ? 'Opening…' : 'Add'}
                    </button>
                    <button
                      type="button"
                      className="oph-act"
                      aria-disabled={openOff || undefined}
                      aria-label={openOff ? `Open ${opp.label} — not available yet` : `Open ${opp.label}`}
                      onClick={() => void handle(opp, opp.open, 'open')}
                    >
                      Open
                      <ArrowRight width={13} height={13} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {notice && <div className="oph-notice" role="status">{notice}</div>}
        </div>
      </div>
    </>
  );

  return createPortal(sheet, document.body);
}
