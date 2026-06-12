'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, CalendarDays, CreditCard, House, LogIn, Mail, Rocket } from 'lucide-react';
import { LandingSettings } from '@/types/document';
import { Button } from '@/components/ui/button';

interface PublicSiteChromeProps {
  softwareName: string;
  accentLabel: string;
  settings: LandingSettings;
  children: React.ReactNode;
  darkMode?: boolean;
}

const LEFT_NAV = [
  { href: '/', label: 'Home', icon: House },
  { href: '/pricing', label: 'Pricing', icon: CreditCard },
];
const RIGHT_NAV = [
  { href: '/contact', label: 'Contact', icon: Mail },
  { href: '/login', label: 'Login', icon: LogIn },
];

export default function PublicSiteChrome({ softwareName, accentLabel, settings, children, darkMode }: PublicSiteChromeProps) {
  const pathname = usePathname();

  const navItemStyle = (href: string, side: 'icon' | 'label', active: boolean): React.CSSProperties => {
    if (side === 'icon') {
      return {
        width: 18,
        height: 18,
        flexShrink: 0,
        color: active
          ? (darkMode ? '#f1f5f9' : '#1e293b')
          : (darkMode ? 'rgba(248,250,252,0.40)' : '#94a3b8'),
      };
    }
    return {
      fontSize: 9,
      fontWeight: 600,
      letterSpacing: '0.04em',
      lineHeight: 1,
      color: active
        ? (darkMode ? '#f1f5f9' : '#1e293b')
        : (darkMode ? 'rgba(248,250,252,0.38)' : '#94a3b8'),
      maxWidth: 52,
      overflow: 'hidden',
      whiteSpace: 'nowrap' as const,
      textOverflow: 'ellipsis',
    };
  };

  const pillStyle: React.CSSProperties = darkMode
    ? {
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        borderRadius: 28,
        padding: '6px 8px',
        border: '1px solid rgba(255,255,255,0.10)',
        background: 'linear-gradient(158deg,rgba(15,15,18,0.92) 0%,rgba(10,10,13,0.95) 100%)',
        boxShadow: '0 24px 56px rgba(0,0,0,0.55),0 6px 18px rgba(0,0,0,0.35),inset 0 1.5px 0 rgba(255,255,255,0.07)',
        backdropFilter: 'blur(40px) saturate(1.6)',
        WebkitBackdropFilter: 'blur(40px) saturate(1.6)',
      }
    : {
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        borderRadius: 28,
        padding: '6px 8px',
        border: '1px solid rgba(255,255,255,0.52)',
        background: 'linear-gradient(158deg,rgba(255,255,255,0.82) 0%,rgba(246,249,255,0.76) 50%,rgba(236,244,255,0.74) 100%)',
        boxShadow: '0 24px 56px rgba(15,23,42,0.16),0 6px 18px rgba(15,23,42,0.08),0 2px 5px rgba(15,23,42,0.04),inset 0 1.5px 0 rgba(255,255,255,0.90)',
        backdropFilter: 'blur(40px) saturate(1.8) brightness(1.06)',
        WebkitBackdropFilter: 'blur(40px) saturate(1.8) brightness(1.06)',
      };

  const activeItemBg: React.CSSProperties = darkMode
    ? { position: 'absolute', inset: 0, borderRadius: 20, background: 'rgba(255,255,255,0.08)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)', zIndex: 0 }
    : { position: 'absolute', inset: 0, borderRadius: 20, background: 'rgba(255,255,255,0.92)', boxShadow: '0 4px 14px rgba(15,23,42,0.10),inset 0 1px 0 rgba(255,255,255,0.95)', zIndex: 0 };

  return (
    <>
      <main
        className={
          darkMode
            ? 'relative min-h-screen overflow-x-hidden bg-[#0D0D0F] px-3 py-3 pb-28 text-white sm:px-5 sm:py-5 sm:pb-8 lg:px-8 xl:px-10 2xl:px-12'
            : 'min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.10),transparent_22%),radial-gradient(circle_at_top_right,rgba(148,163,184,0.10),transparent_20%),linear-gradient(180deg,#ffffff_0%,#f8fafc_28%,#ffffff_100%)] px-3 py-3 pb-28 text-slate-950 sm:px-5 sm:py-5 sm:pb-8 lg:px-8 xl:px-10 2xl:px-12'
        }
      >
        <div className="mx-auto w-full max-w-[112rem] space-y-6 lg:space-y-8">
          <header
            className={
              darkMode
                ? 'sticky top-3 z-30 rounded-[1.4rem] border border-white/[0.08] bg-white/[0.04] px-4 py-3 shadow-[0_18px_45px_rgba(0,0,0,0.4)] backdrop-blur-2xl sm:px-6 lg:px-8 2xl:px-10'
                : 'sticky top-3 z-30 rounded-[1.4rem] border border-black/5 bg-white/92 px-4 py-3 shadow-[0_18px_45px_rgba(15,23,42,0.06)] backdrop-blur-2xl sm:px-6 lg:px-8 2xl:px-10'
            }
          >
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-center justify-between gap-4">
                <Link href="/" className="min-w-0">
                  <h1
                    className={`mt-1 text-xl font-semibold tracking-[-0.04em] sm:text-[1.8rem] ${darkMode ? 'text-white' : 'text-slate-950'}`}
                  >
                    {softwareName}
                  </h1>
                </Link>
              </div>

              <nav className={`hidden flex-wrap items-center gap-2 text-sm md:flex ${darkMode ? 'text-white/60' : 'text-slate-600'}`}>
                <Link href="/" className={`rounded-full px-3 py-2 transition ${darkMode ? 'hover:bg-white/8 hover:text-white' : 'hover:bg-slate-100 hover:text-slate-950'}`}>Home</Link>
                <Link href="/pricing" className={`rounded-full px-3 py-2 transition ${darkMode ? 'hover:bg-white/8 hover:text-white' : 'hover:bg-slate-100 hover:text-slate-950'}`}>Pricing</Link>
                <Link href="/contact" className={`rounded-full px-3 py-2 transition ${darkMode ? 'hover:bg-white/8 hover:text-white' : 'hover:bg-slate-100 hover:text-slate-950'}`}>Contact</Link>
                <Link href="/schedule-demo" className={`rounded-full px-3 py-2 transition ${darkMode ? 'hover:bg-white/8 hover:text-white' : 'hover:bg-slate-100 hover:text-slate-950'}`}>Schedule Demo</Link>
                {darkMode ? (
                  <>
                    <Link href="/login" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10">Login</Link>
                    <Link href="/signup" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10">Start Free</Link>
                    <a href={settings.primaryCtaHref || '/schedule-demo'} className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(251,146,60,0.30)] transition hover:from-orange-400 hover:to-amber-400">
                      {settings.primaryCtaLabel}
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  </>
                ) : (
                  <>
                    <Button asChild variant="outline" className="rounded-xl border-slate-300 bg-white text-slate-950 hover:bg-slate-950 hover:text-white">
                      <Link href="/login">Login</Link>
                    </Button>
                    <Button asChild variant="outline" className="rounded-xl border-slate-300 bg-white text-slate-950 hover:bg-slate-950 hover:text-white">
                      <Link href="/signup">Start Free</Link>
                    </Button>
                    <Button asChild className="rounded-xl bg-slate-950 text-white shadow-[0_16px_38px_rgba(15,23,42,0.18)] hover:bg-slate-800">
                      <a href={settings.primaryCtaHref || '/schedule-demo'}>
                        {settings.primaryCtaLabel}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </a>
                    </Button>
                  </>
                )}
              </nav>
            </div>
          </header>

          {children}

          <footer
            className={
              darkMode
                ? 'rounded-[1.6rem] border border-white/[0.07] bg-[linear-gradient(135deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] px-5 py-6 backdrop-blur-xl sm:px-6 lg:px-8 2xl:px-10'
                : 'rounded-[1.6rem] border border-black/5 bg-white px-5 py-6 shadow-[0_18px_44px_rgba(15,23,42,0.05)] sm:px-6 lg:px-8 2xl:px-10'
            }
          >
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className={`text-xl font-semibold tracking-tight sm:text-2xl ${darkMode ? 'text-white' : 'text-slate-950'}`}>{softwareName}</p>
                <p className={`mt-3 text-sm leading-6 ${darkMode ? 'text-white/40' : 'text-slate-600'}`}>
                  Premium document operations software for teams that need stronger controls, cleaner execution, and a better client-facing experience.
                </p>
              </div>

              <div className={`grid gap-2 text-sm sm:text-right ${darkMode ? 'text-white/40' : 'text-slate-600'}`}>
                <Link href="/pricing" className={darkMode ? 'hover:text-white' : 'hover:text-slate-950'}>Pricing</Link>
                <Link href="/contact" className={darkMode ? 'hover:text-white' : 'hover:text-slate-950'}>Contact</Link>
                <Link href="/schedule-demo" className={darkMode ? 'hover:text-white' : 'hover:text-slate-950'}>Schedule Demo</Link>
                <a href={`mailto:${settings.contactEmail}`} className={darkMode ? 'hover:text-white' : 'hover:text-slate-950'}>{settings.contactEmail}</a>
              </div>
            </div>
          </footer>
        </div>
      </main>

      {/* ── Premium Mobile Bottom Navigation ─────────────────────────────
           Rendered OUTSIDE <main> so overflow-x-hidden never clips it.
           All visual styles are inline to guarantee rendering.
      ──────────────────────────────────────────────────────────────── */}
      <nav
        className="md:hidden"
        aria-label="Site navigation"
        style={{
          position: 'fixed',
          left: 12,
          right: 12,
          bottom: 12,
          zIndex: 99999,
          paddingTop: 18,
        }}
      >
        {/* Ambient glow blobs */}
        <div aria-hidden style={{ position: 'absolute', top: 0, left: '8%', width: 90, height: 28, borderRadius: '50%', background: darkMode ? 'rgba(99,102,241,0.22)' : 'rgba(56,189,248,0.18)', filter: 'blur(18px)', pointerEvents: 'none' }} />
        <div aria-hidden style={{ position: 'absolute', top: 0, right: '8%', width: 90, height: 28, borderRadius: '50%', background: darkMode ? 'rgba(167,139,250,0.18)' : 'rgba(139,92,246,0.14)', filter: 'blur(18px)', pointerEvents: 'none' }} />

        {/* Glass pill */}
        <div style={pillStyle}>

          {/* Left 2: Home, Pricing */}
          {LEFT_NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 5,
                  borderRadius: 20,
                  padding: '8px 4px',
                  textDecoration: 'none',
                  position: 'relative',
                  background: active ? (darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.92)') : 'transparent',
                  boxShadow: active ? (darkMode ? 'inset 0 1px 0 rgba(255,255,255,0.06)' : '0 4px 14px rgba(15,23,42,0.10),inset 0 1px 0 rgba(255,255,255,0.95)') : 'none',
                  transition: 'background 180ms ease',
                }}
              >
                {active && <span style={activeItemBg} />}
                <span style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 14 }}>
                  <Icon style={navItemStyle(href, 'icon', active)} />
                </span>
                {active && <span style={{ position: 'relative', zIndex: 1, width: 3, height: 3, borderRadius: '50%', background: darkMode ? 'rgba(248,250,252,0.60)' : '#475569' }} />}
                <span style={{ position: 'relative', zIndex: 1, ...navItemStyle(href, 'label', active) }}>{label}</span>
              </Link>
            );
          })}

          {/* Center: Start Free CTA — elevated */}
          <div style={{ position: 'relative', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: -18, marginLeft: 4, marginRight: 4 }}>
            <span
              className="search-orb-pulse"
              aria-hidden
              style={{ position: 'absolute', top: 0, left: 0, width: 60, height: 60, borderRadius: 18, border: '1.5px solid rgba(99,102,241,0.35)', pointerEvents: 'none' }}
            />
            <Link
              href="/signup"
              aria-label="Start for free"
              style={{
                width: 60,
                height: 60,
                borderRadius: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(145deg,#4f46e5 0%,#1e1b4b 100%)',
                boxShadow: '0 14px 32px rgba(79,70,229,0.50),0 4px 10px rgba(79,70,229,0.28),inset 0 1px 0 rgba(255,255,255,0.18),inset 0 -1px 0 rgba(0,0,0,0.22)',
                position: 'relative',
                textDecoration: 'none',
              }}
            >
              <span aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: 18, background: 'linear-gradient(145deg,rgba(255,255,255,0.14) 0%,transparent 55%)', pointerEvents: 'none' }} />
              <Rocket style={{ width: 22, height: 22, color: '#ffffff', position: 'relative', zIndex: 1, flexShrink: 0 }} />
            </Link>
            <span style={{ marginTop: 6, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: darkMode ? 'rgba(248,250,252,0.45)' : '#6366f1' }}>
              Start Free
            </span>
          </div>

          {/* Right 2: Contact, Login */}
          {RIGHT_NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 5,
                  borderRadius: 20,
                  padding: '8px 4px',
                  textDecoration: 'none',
                  position: 'relative',
                  background: active ? (darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.92)') : 'transparent',
                  boxShadow: active ? (darkMode ? 'inset 0 1px 0 rgba(255,255,255,0.06)' : '0 4px 14px rgba(15,23,42,0.10),inset 0 1px 0 rgba(255,255,255,0.95)') : 'none',
                  transition: 'background 180ms ease',
                }}
              >
                {active && <span style={activeItemBg} />}
                <span style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 14 }}>
                  <Icon style={navItemStyle(href, 'icon', active)} />
                </span>
                {active && <span style={{ position: 'relative', zIndex: 1, width: 3, height: 3, borderRadius: '50%', background: darkMode ? 'rgba(248,250,252,0.60)' : '#475569' }} />}
                <span style={{ position: 'relative', zIndex: 1, ...navItemStyle(href, 'label', active) }}>{label}</span>
              </Link>
            );
          })}

        </div>
      </nav>
    </>
  );
}
