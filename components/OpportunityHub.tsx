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
  ShieldCheck,
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
    color: '#3b82f6',
    tint: 'rgba(59,130,246,0.12)',
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
    tint: 'rgba(34,211,238,0.12)',
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
    color: '#8b5cf6',
    tint: 'rgba(139,92,246,0.12)',
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
    color: '#22c55e',
    tint: 'rgba(34,197,94,0.12)',
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
    color: '#f97316',
    tint: 'rgba(249,115,22,0.12)',
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
    const t = setTimeout(() => panelRef.current?.focus(), 60);

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
          background: rgba(0,0,0,0.66);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          opacity: 0;
          transition: opacity 220ms ease;
        }
        .oph-root.oph-shown .oph-backdrop { opacity: 1; }

        .oph-panel {
          position: absolute;
          left: 0; right: 0; bottom: 0;
          max-height: 92vh;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior-y: contain;
          padding: 8px 18px calc(18px + env(safe-area-inset-bottom));
          background: rgba(11,11,16,0.98);
          backdrop-filter: blur(28px) saturate(180%);
          -webkit-backdrop-filter: blur(28px) saturate(180%);
          border: 1px solid rgba(255,255,255,0.09);
          border-bottom: none;
          border-radius: 28px 28px 0 0;
          box-shadow: 0 -12px 48px rgba(0,0,0,0.62);
          transform: translateY(100%);
          transition: transform 360ms cubic-bezier(0.22, 1, 0.36, 1);
          will-change: transform;
        }
        .oph-root.oph-shown .oph-panel { transform: translateY(0); }
        .oph-panel:focus { outline: none; }

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
          margin: 6px auto 4px;
        }

        .oph-close {
          position: absolute; top: 18px; right: 18px;
          width: 42px; height: 42px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.07);
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.72);
          cursor: pointer;
        }
        .oph-close:focus-visible,
        .oph-act:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }

        .oph-title {
          font-size: 30px; font-weight: 800; line-height: 1.18;
          letter-spacing: -0.02em;
          color: #ffffff;
          margin: 26px 64px 26px 4px;
        }
        .oph-title em { font-style: normal; color: #3b82f6; }

        /* Row: icon tile - name - actions, on one baseline. */
        .oph-row {
          display: flex; align-items: center; gap: 14px;
          padding: 16px;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.022);
        }
        .oph-row + .oph-row { margin-top: 16px; }

        .oph-ic {
          flex: none;
          width: 52px; height: 52px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 15px;
        }

        .oph-body { flex: 1; min-width: 0; }
        .oph-name {
          font-size: 18px; font-weight: 700; line-height: 1.2;
          letter-spacing: -0.01em;
          color: rgba(255,255,255,0.96);
        }

        /* The reference puts the category name alone on the row, so the
           descriptions are kept for assistive tech only rather than dropped. */
        .oph-sr {
          position: absolute; width: 1px; height: 1px;
          padding: 0; margin: -1px; overflow: hidden;
          clip: rect(0 0 0 0); white-space: nowrap; border: 0;
        }

        .oph-acts { display: flex; align-items: center; gap: 10px; flex: none; }

        .oph-act {
          display: inline-flex; align-items: center; justify-content: center;
          border: none;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          transition: transform 0.16s ease, opacity 0.14s ease;
        }
        .oph-act:active { transform: scale(0.92); opacity: 0.8; }
        .oph-act[aria-disabled=true] { opacity: 0.45; }

        .oph-add {
          width: 44px; height: 44px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.07);
          background: rgba(255,255,255,0.055);
          color: rgba(255,255,255,0.82);
        }
        .oph-open {
          width: 62px; height: 44px;
          border-radius: 16px;
          color: #ffffff;
        }

        .oph-trust {
          display: flex; align-items: center; gap: 12px;
          margin-top: 18px;
          padding: 14px 16px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.05);
          background: rgba(255,255,255,0.022);
        }
        .oph-trust-ic { flex: none; color: #3b82f6; display: flex; }
        .oph-trust-t {
          font-size: 14px; font-weight: 600; line-height: 1.25;
          color: rgba(255,255,255,0.88);
        }
        .oph-trust-s {
          font-size: 12px; font-weight: 500; line-height: 1.3;
          color: rgba(255,255,255,0.38);
          margin-top: 2px;
        }

        .oph-notice {
          margin-top: 14px;
          padding: 10px 14px;
          border-radius: 12px;
          border: 1px solid rgba(249,115,22,0.22);
          background: rgba(249,115,22,0.08);
          color: rgba(253,186,116,0.92);
          font-size: 12px; font-weight: 600;
          text-align: center;
        }

        @media (prefers-reduced-motion: reduce) {
          .oph-panel, .oph-backdrop, .oph-act { transition: none !important; }
        }
      `}</style>

      <div className={`oph-root${shown ? ' oph-shown' : ''}`}>
        <div className="oph-backdrop" onClick={onClose} aria-hidden="true" />

        <div
          ref={panelRef}
          className="oph-panel"
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="oph-title"
        >
          <div className="oph-grip" aria-hidden="true" />
          <button ref={closeRef} type="button" className="oph-close" onClick={onClose} aria-label="Close opportunities menu">
            <X width={19} height={19} />
          </button>

          <h2 id="oph-title" className="oph-title">What are you<br />looking for <em>today?</em></h2>

          {OPPORTUNITIES.map(opp => {
            const { Icon } = opp;
            const addBusy = pending === `${opp.id}:add`;
            const addOff  = opp.add.kind === 'unavailable';
            const openOff = opp.open.kind === 'unavailable';
            return (
              <div key={opp.id} className="oph-row">
                <span className="oph-ic" style={{ color: opp.color, background: opp.tint, border: `1px solid ${opp.color}44` }}>
                  <Icon width={24} height={24} />
                </span>

                <div className="oph-body">
                  <div className="oph-name">{opp.label}</div>
                  <span className="oph-sr">{opp.description}</span>
                </div>

                <div className="oph-acts">
                  <button
                    type="button"
                    className="oph-act oph-add"
                    aria-disabled={addOff || undefined}
                    aria-busy={addBusy || undefined}
                    aria-label={addOff ? `${opp.addLabel} — not available yet` : opp.addLabel}
                    onClick={() => void handle(opp, opp.add, 'add')}
                  >
                    <Plus width={19} height={19} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="oph-act oph-open"
                    style={{ background: openOff ? 'rgba(255,255,255,0.08)' : `linear-gradient(135deg, ${opp.color}, ${opp.color}cc)` }}
                    aria-disabled={openOff || undefined}
                    aria-label={openOff ? `Open ${opp.label} — not available yet` : `Open ${opp.label}`}
                    onClick={() => void handle(opp, opp.open, 'open')}
                  >
                    <ArrowRight width={20} height={20} aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}

          {notice && <div className="oph-notice" role="status">{notice}</div>}

          {/* Informational only. There is no trust/safety page in the app yet,
              so this deliberately carries no chevron and no dead link. */}
          <div className="oph-trust">
            <span className="oph-trust-ic" aria-hidden="true"><ShieldCheck width={22} height={22} /></span>
            <div>
              <div className="oph-trust-t">Verified • Trusted • Secure</div>
              <div className="oph-trust-s">Your safety is our priority</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(sheet, document.body);
}
