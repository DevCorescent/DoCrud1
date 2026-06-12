'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

interface InviteData {
  valid: boolean;
  reason?: string | null;
  invite: { id: string; label?: string; expiresAt?: string | null; maxUses?: number | null; useCount: number };
  page: {
    id: string; slug: string; name: string; tagline?: string;
    logoUrl?: string; coverUrl?: string; industry?: string;
    companySize?: string; city?: string; country?: string; verified: boolean;
  };
}

const IND: Record<string, string> = {
  technology: 'Technology', finance: 'Finance & Banking', healthcare: 'Healthcare',
  legal: 'Legal', education: 'Education', manufacturing: 'Manufacturing',
  retail: 'Retail', real_estate: 'Real Estate', media: 'Media & Entertainment',
  consulting: 'Consulting', logistics: 'Logistics', hospitality: 'Hospitality',
  ngo: 'NGO / Non-profit', government: 'Government', other: 'Other',
};

export default function InvitePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const token = params?.token as string;

  const [data, setData]         = useState<InviteData | null>(null);
  const [loadErr, setLoadErr]   = useState('');
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [acceptErr, setAcceptErr] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`/api/invite/${token}`)
      .then(r => r.json())
      .then((d: InviteData & { error?: string }) => {
        if (d.error) { setLoadErr(d.error); return; }
        setData(d);
      })
      .catch(() => setLoadErr('Failed to load invite.'));
  }, [token]);

  async function handleAccept() {
    if (status === 'unauthenticated') {
      router.push(`/login?returnTo=/invite/${token}`);
      return;
    }
    setAccepting(true); setAcceptErr('');
    try {
      const res = await fetch(`/api/invite/${token}`, { method: 'POST' });
      const d   = await res.json() as { success?: boolean; error?: string; pageSlug?: string };
      if (!res.ok || !d.success) { setAcceptErr(d.error || 'Could not accept invite.'); return; }
      setAccepted(true);
      setTimeout(() => router.push(`/businesses/${d.pageSlug}`), 2000);
    } finally { setAccepting(false); }
  }

  /* ── Loading ── */
  if (!data && !loadErr) return (
    <div style={{ minHeight:'100vh', background:'#0D0D0F', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ width:24, height:24, border:'2.5px solid rgba(255,255,255,0.12)', borderTopColor:'rgba(255,255,255,0.55)', borderRadius:'50%', animation:'spin .75s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  /* ── Error ── */
  if (loadErr) return (
    <div style={{ minHeight:'100vh', background:'#0D0D0F', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, padding:24 }}>
      <div style={{ fontSize:32 }}>🔗</div>
      <h2 style={{ margin:0, fontSize:20, fontWeight:800, color:'rgba(255,255,255,0.85)', letterSpacing:'-0.03em' }}>Invite not found</h2>
      <p style={{ margin:0, fontSize:13, color:'rgba(255,255,255,0.35)', textAlign:'center' }}>{loadErr}</p>
      <Link href="/" style={{ marginTop:8, padding:'9px 22px', borderRadius:12, background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.10)', color:'rgba(255,255,255,0.65)', fontSize:13, fontWeight:700, textDecoration:'none' }}>Go home</Link>
    </div>
  );

  const { page, invite, valid, reason } = data!;

  /* ── Accepted ── */
  if (accepted) return (
    <div style={{ minHeight:'100vh', background:'#0D0D0F', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:20, padding:24 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pop{from{transform:scale(0.7);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
      <div style={{ width:72, height:72, borderRadius:'50%', background:'linear-gradient(135deg,#059669,#10b981)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 60px rgba(16,185,129,0.4)', animation:'pop .4s ease' }}>
        <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
      </div>
      <div style={{ textAlign:'center' }}>
        <h2 style={{ margin:'0 0 6px', fontSize:22, fontWeight:900, letterSpacing:'-0.04em', color:'#fff' }}>You joined {page.name}</h2>
        <p style={{ margin:0, fontSize:13, color:'rgba(255,255,255,0.38)' }}>Your profile is now linked to the company page.</p>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:6, color:'rgba(255,255,255,0.25)', fontSize:12 }}>
        <div style={{ width:12, height:12, border:'2px solid rgba(255,255,255,0.18)', borderTopColor:'rgba(255,255,255,0.55)', borderRadius:'50%', animation:'spin .75s linear infinite' }} />
        Redirecting to company page…
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background:'#0D0D0F', color:'#fff', fontFamily:'system-ui,-apple-system,sans-serif' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadein{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Ambient glow */}
      <div style={{ position:'fixed', inset:0, pointerEvents:'none', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:'-20%', left:'50%', transform:'translateX(-50%)', width:700, height:350, background:'radial-gradient(ellipse,rgba(79,70,229,0.14) 0%,transparent 68%)', filter:'blur(2px)' }} />
      </div>

      {/* Nav */}
      <nav style={{ position:'relative', zIndex:10, height:52, display:'flex', alignItems:'center', justifyContent:'center', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
        <span style={{ fontSize:17, fontWeight:900, letterSpacing:'-0.04em', color:'rgba(255,255,255,0.88)' }}>docrud</span>
      </nav>

      {/* Card */}
      <div style={{ position:'relative', zIndex:10, maxWidth:480, margin:'60px auto 40px', padding:'0 20px', animation:'fadein .5s both' }}>

        {/* Cover / Logo */}
        <div style={{ borderRadius:'20px 20px 0 0', overflow:'hidden', background:'linear-gradient(135deg,#1e1b4b,#312e81)', height:120, position:'relative', flexShrink:0 }}>
          {page.coverUrl && <img src={page.coverUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', position:'absolute', inset:0 }} />}
          <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top, rgba(12,12,18,0.85) 0%, transparent 50%)' }} />
        </div>

        {/* Page card body */}
        <div style={{ borderRadius:'0 0 20px 20px', border:'1px solid rgba(255,255,255,0.07)', borderTop:'none', background:'#0e0e16', padding:'0 24px 24px', position:'relative' }}>

          {/* Logo */}
          <div style={{ marginTop:-28, marginBottom:12, position:'relative' }}>
            <div style={{ width:56, height:56, borderRadius:14, border:'2px solid rgba(255,255,255,0.10)', background:'#1a1a28', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center' }}>
              {page.logoUrl
                ? <img src={page.logoUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                : <svg width="26" height="26" fill="none" viewBox="0 0 24 24" stroke="rgba(165,180,252,0.5)" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
              }
            </div>
          </div>

          {/* Company info */}
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8, marginBottom:6 }}>
            <div>
              <h1 style={{ margin:'0 0 4px', fontSize:20, fontWeight:900, letterSpacing:'-0.04em', color:'rgba(255,255,255,0.92)' }}>
                {page.name}
                {page.verified && (
                  <span style={{ marginLeft:6, display:'inline-flex', verticalAlign:'middle' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="#60a5fa"><path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/></svg>
                  </span>
                )}
              </h1>
              {page.tagline && <p style={{ margin:'0 0 8px', fontSize:13, color:'rgba(255,255,255,0.38)' }}>{page.tagline}</p>}
            </div>
          </div>

          {/* Meta chips */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:20 }}>
            {page.industry && <span style={{ padding:'3px 10px', borderRadius:999, background:'rgba(99,102,241,0.12)', border:'1px solid rgba(99,102,241,0.22)', fontSize:11, fontWeight:600, color:'rgba(165,180,252,0.75)' }}>{IND[page.industry] ?? page.industry}</span>}
            {page.companySize && <span style={{ padding:'3px 10px', borderRadius:999, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.38)' }}>{page.companySize} employees</span>}
            {(page.city || page.country) && <span style={{ padding:'3px 10px', borderRadius:999, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.38)' }}>{[page.city, page.country].filter(Boolean).join(', ')}</span>}
          </div>

          {/* Invite badge */}
          <div style={{ padding:'12px 14px', borderRadius:12, background:'rgba(99,102,241,0.07)', border:'1px solid rgba(99,102,241,0.18)', marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:32, height:32, borderRadius:9, background:'linear-gradient(135deg,rgba(99,102,241,0.25),rgba(99,102,241,0.10))', border:'1px solid rgba(99,102,241,0.25)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="rgba(165,180,252,0.85)" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0"/></svg>
              </div>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.80)' }}>
                  You&apos;ve been invited to join {page.name}
                </div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.30)', marginTop:2 }}>
                  {invite.label ? `Invite: ${invite.label}` : 'Employee invite link'}
                  {invite.expiresAt && ` · Expires ${new Date(invite.expiresAt).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}`}
                </div>
              </div>
            </div>
          </div>

          {/* Invalid state */}
          {!valid && (
            <div style={{ padding:'12px 14px', borderRadius:12, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.18)', marginBottom:16, fontSize:13, color:'rgba(252,165,165,0.85)', fontWeight:500 }}>
              {reason === 'revoked'       && 'This invite link has been revoked by the admin.'}
              {reason === 'expired'       && 'This invite link has expired.'}
              {reason === 'limit_reached' && 'This invite link has reached its maximum number of uses.'}
            </div>
          )}

          {/* Profile notice */}
          {valid && (
            <div style={{ padding:'10px 13px', borderRadius:11, background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.18)', marginBottom:16, display:'flex', alignItems:'flex-start', gap:9 }}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="rgba(251,191,36,0.75)" strokeWidth={2} style={{ flexShrink:0, marginTop:1 }}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <p style={{ margin:0, fontSize:11.5, color:'rgba(253,230,138,0.70)', lineHeight:1.55 }}>
                You&apos;ll appear on the company&apos;s team page once your Docrud profile is set up.
                {status === 'unauthenticated' && ' Create a free account to join.'}
              </p>
            </div>
          )}

          {/* Error */}
          {acceptErr && (
            <div style={{ padding:'9px 12px', borderRadius:10, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.18)', marginBottom:12, fontSize:12, color:'rgba(252,165,165,0.88)', fontWeight:500 }}>
              {acceptErr}
            </div>
          )}

          {/* CTA */}
          {valid && (
            <button
              onClick={handleAccept}
              disabled={accepting}
              style={{
                width:'100%', height:46, borderRadius:13, border:'none',
                background: accepting ? 'rgba(99,102,241,0.30)' : 'linear-gradient(135deg,#4f46e5,#6366f1)',
                color: accepting ? 'rgba(255,255,255,0.40)' : '#fff',
                fontSize:13.5, fontWeight:800, cursor: accepting ? 'not-allowed' : 'pointer',
                display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                boxShadow: accepting ? 'none' : '0 6px 28px rgba(79,70,229,0.38)',
                transition:'filter .15s,transform .1s',
              }}
              onMouseEnter={e => { if (!accepting) (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.1)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.filter = ''; }}
            >
              {accepting ? (
                <><div style={{ width:14, height:14, border:'2px solid rgba(255,255,255,0.25)', borderTopColor:'rgba(255,255,255,0.70)', borderRadius:'50%', animation:'spin .75s linear infinite' }} />Joining…</>
              ) : status === 'unauthenticated' ? (
                <><svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>Sign in &amp; join {page.name}</>
              ) : (
                <><svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>Join {page.name}</>
              )}
            </button>
          )}

          {!valid && (
            <Link href={`/businesses/${page.slug}`}
              style={{ display:'flex', alignItems:'center', justifyContent:'center', height:46, borderRadius:13, border:'1px solid rgba(255,255,255,0.10)', background:'rgba(255,255,255,0.04)', color:'rgba(255,255,255,0.55)', fontSize:13, fontWeight:700, textDecoration:'none', transition:'background .15s' }}>
              View {page.name}&apos;s page
            </Link>
          )}
        </div>

        {/* Footer note */}
        <p style={{ textAlign:'center', fontSize:11.5, color:'rgba(255,255,255,0.18)', marginTop:18, lineHeight:1.6 }}>
          By joining, your Docrud profile will be linked to this company page.<br/>
          You can leave at any time from your profile settings.
        </p>
      </div>
    </div>
  );
}
