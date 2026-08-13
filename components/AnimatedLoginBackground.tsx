'use client';

/* ═══════════════════════════════════════════════════════════════
   ANIMATED SPLASH BACKGROUND

   Extracted verbatim from the "Manage Jobs & More" onboarding splash
   (app/onboarding/page.tsx) so the same background can be reused on
   the login page. Nothing here is new — same marquee rows, same card
   markup, same keyframes (splashMarqueeL / splashMarqueeR / obFadeIn
   in app/globals.css), same durations, opacities and layer order.

   The onboarding splash imports this module too, so both screens
   render one implementation.
═══════════════════════════════════════════════════════════════ */

import React from 'react';

/* Professional profile cards for the two marquee rows */
export const SPLASH_PROFILES_TOP = [
  { init:'AK', name:'Ananya Krishnan',  title:'Sr. Product Designer',     loc:'Bengaluru',  avail:'Open to Work', availColor:'#34d399', skills:['Figma','Design Systems','Bharat UX'],   rating:4.97, projects:24, avatarGrad:'135deg,#059669,#10b981' },
  { init:'RM', name:'Rohan Mehta',      title:'ML Engineer',               loc:'Hyderabad',  avail:'Available Now',availColor:'#60a5fa', skills:['Python','PyTorch','LLMs'],              rating:4.93, projects:18, avatarGrad:'135deg,#2563eb,#3b82f6' },
  { init:'SJ', name:'Siddharth Joshi',  title:'Full-Stack Developer',      loc:'Pune',       avail:'Freelance',    availColor:'#a78bfa', skills:['Next.js','Go','Postgres'],               rating:4.91, projects:31, avatarGrad:'135deg,#7c3aed,#8b5cf6' },
  { init:'PN', name:'Priya Nair',       title:'UX Writer',                 loc:'Kochi',      avail:'Part-time',    availColor:'#fb7185', skills:['UX Writing','SEO','Content'],            rating:4.88, projects:43, avatarGrad:'135deg,#e11d48,#f43f5e' },
  { init:'VS', name:'Vikram Singh',     title:'Cloud Architect',           loc:'Delhi NCR',  avail:'Contract',     availColor:'#22d3ee', skills:['AWS','Kubernetes','Terraform'],          rating:4.95, projects:15, avatarGrad:'135deg,#0e7490,#06b6d4' },
  { init:'MI', name:'Meera Iyer',       title:'Brand & Motion Designer',   loc:'Chennai',    avail:'Open to Work', availColor:'#e879f9', skills:['After Effects','Lottie','Figma'],         rating:4.92, projects:38, avatarGrad:'135deg,#a21caf,#d946ef' },
  { init:'AT', name:'Aryan Thakur',     title:'Data Scientist',            loc:'Mumbai',     avail:'Available Now',availColor:'#34d399', skills:['R','Pandas','Spark'],                    rating:4.86, projects:22, avatarGrad:'135deg,#0f766e,#14b8a6' },
  { init:'NK', name:'Nisha Kapoor',     title:'Legal Tech Consultant',     loc:'Noida',      avail:'Freelance',    availColor:'#a78bfa', skills:['Contract Law','DocDraft','LegalOps'],    rating:4.89, projects:11, avatarGrad:'135deg,#6d28d9,#7c3aed' },
] as const;

export const SPLASH_PROFILES_BTM = [
  { init:'LM', name:'Liam Morrison',    title:'Product Manager',           loc:'London, UK', avail:'Open to Work', availColor:'#34d399', skills:['Roadmap','Agile','SaaS Growth'],         rating:4.94, projects:19, avatarGrad:'135deg,#1d4ed8,#3b82f6' },
  { init:'SC', name:'Sofia Chen',       title:'UX Researcher',             loc:'Singapore',  avail:'Contract',     availColor:'#22d3ee', skills:['User Testing','Figma','Miro'],           rating:4.90, projects:27, avatarGrad:'135deg,#0369a1,#0ea5e9' },
  { init:'JR', name:'James Russo',      title:'Backend Engineer',          loc:'New York',   avail:'Available Now',availColor:'#60a5fa', skills:['Rust','Kafka','Postgres'],               rating:4.87, projects:34, avatarGrad:'135deg,#1e3a8a,#2563eb' },
  { init:'AO', name:'Amara Osei',       title:'Growth Marketer',           loc:'Accra, GH',  avail:'Freelance',    availColor:'#fb923c', skills:['SEO','CRO','Paid Media'],                rating:4.85, projects:41, avatarGrad:'135deg,#c2410c,#f97316' },
  { init:'EP', name:'Elena Petrov',     title:'DevOps Engineer',           loc:'Berlin, DE', avail:'Part-time',    availColor:'#a78bfa', skills:['GCP','Docker','CI/CD'],                  rating:4.91, projects:16, avatarGrad:'135deg,#5b21b6,#7c3aed' },
  { init:'KY', name:'Kenji Yamamoto',   title:'iOS Engineer',              loc:'Tokyo, JP',  avail:'Open to Work', availColor:'#34d399', skills:['Swift','SwiftUI','Metal'],               rating:4.96, projects:28, avatarGrad:'135deg,#065f46,#10b981' },
  { init:'FN', name:'Fatima Al-Nouri',  title:'AI Researcher',             loc:'Dubai, UAE', avail:'Available Now',availColor:'#60a5fa', skills:['NLP','LLMs','Python'],                   rating:4.93, projects:13, avatarGrad:'135deg,#1e40af,#3b82f6' },
  { init:'ZA', name:'Zara Ahmed',       title:'Brand Strategist',          loc:'Karachi, PK',avail:'Freelance',    availColor:'#fb7185', skills:['Brand','Copy','Social'],                 rating:4.84, projects:36, avatarGrad:'135deg,#9f1239,#fb7185' },
] as const;

export type SplashProfile = {
  init: string; name: string; title: string; loc: string;
  avail: string; availColor: string; skills: readonly string[];
  rating: number; projects: number; avatarGrad: string;
};
export type FeedPost = {
  init: string; author: string; role: string; time: string;
  text: string; likes: number; comments: number; avatarGrad: string; tag: string; tagColor: string;
};
export type EventItem = {
  title: string; day: string; month: string; location: string;
  attendees: number; category: string; color: string;
};
export type GigItem = {
  title: string; budget: string; skills: readonly string[];
  poster: string; bids: number; level: string;
};
export type DocItem = {
  name: string; type: string; pages: number; shared: string;
  icon: string; colorRgb: string;
};

const FEED_POSTS: FeedPost[] = [
  { init:'AK', author:'Ananya K.',      role:'Sr. Designer',       time:'2h',  text:'Just shipped a full design system at scale — 340+ tokens, Figma + code perfectly in sync. One of the best days of my career. 🔥', likes:284, comments:43, avatarGrad:'135deg,#059669,#10b981', tag:'Design',      tagColor:'#a78bfa' },
  { init:'RM', author:'Rohan M.',        role:'ML Engineer',         time:'4h',  text:'Fine-tuned a small LLM on domain-specific docs and hit 94% accuracy. Smaller models are underrated. The key was the dataset curation.', likes:512, comments:87, avatarGrad:'135deg,#2563eb,#3b82f6', tag:'AI / ML',     tagColor:'#60a5fa' },
  { init:'SJ', author:'Siddharth J.',   role:'Full-Stack Dev',      time:'1d',  text:'Migrated a 200k-user SaaS from REST to tRPC in a weekend. Type-safety end-to-end is genuinely life-changing. Zero runtime errors so far.', likes:391, comments:62, avatarGrad:'135deg,#7c3aed,#8b5cf6', tag:'Engineering', tagColor:'#818cf8' },
  { init:'VS', author:'Vikram S.',       role:'Cloud Architect',     time:'6h',  text:'Kubernetes costs went from ₹2.4L/mo to ₹80k after aggressive right-sizing + spot instance migration. Infrastructure is a product.', likes:743, comments:118, avatarGrad:'135deg,#0e7490,#06b6d4', tag:'Cloud',       tagColor:'#22d3ee' },
  { init:'MI', author:'Meera I.',        role:'Motion Designer',     time:'3h',  text:'Released 18 free Lottie animations for Indian festivals. Diwali, Holi, Pongal — all CC0. Go use them. Link in bio ✨', likes:1204, comments:231, avatarGrad:'135deg,#a21caf,#d946ef', tag:'Creative',    tagColor:'#e879f9' },
  { init:'PN', author:'Priya N.',        role:'UX Writer',           time:'5h',  text:'Rewrote 60 error messages across the app. Bounce rate on error screens dropped 38%. Words are literally UX.', likes:476, comments:74, avatarGrad:'135deg,#e11d48,#f43f5e', tag:'UX',          tagColor:'#fb7185' },
  { init:'AT', author:'Aryan T.',        role:'Data Scientist',      time:'2d',  text:'Built a churn prediction model that saved our startup ₹40L in ARR this quarter. Feature engineering > model selection, every time.', likes:638, comments:95, avatarGrad:'135deg,#0f766e,#14b8a6', tag:'Data',        tagColor:'#34d399' },
  { init:'NK', author:'Nisha K.',        role:'Legal Tech',          time:'1d',  text:'AI-drafted NDAs are finally legally enforceable in 3 more Indian states. This is a watershed moment for legal tech in Bharat.', likes:892, comments:147, avatarGrad:'135deg,#6d28d9,#7c3aed', tag:'Legal',       tagColor:'#c4b5fd' },
];

const EVENTS: EventItem[] = [
  { title:'Figma Config India 2025',          day:'14', month:'Jun', location:'Bengaluru',   attendees:1240, category:'Design',      color:'#a78bfa' },
  { title:'IndiaAI Summit',                   day:'22', month:'Jul', location:'New Delhi',   attendees:3800, category:'AI & ML',     color:'#60a5fa' },
  { title:'React India Conference',           day:'5',  month:'Sep', location:'Goa',         attendees:950,  category:'Engineering', color:'#818cf8' },
  { title:'Startup Mahakumbh',                day:'18', month:'Aug', location:'Lucknow',     attendees:12000,category:'Startup',     color:'#fb923c' },
  { title:'Product Management Summit',        day:'3',  month:'Oct', location:'Mumbai',      attendees:2100, category:'Product',     color:'#34d399' },
  { title:'Bharat FinTech Conclave',          day:'29', month:'Jun', location:'Hyderabad',   attendees:4500, category:'Finance',     color:'#fbbf24' },
  { title:'Women in Tech India',              day:'11', month:'Jul', location:'Pune',        attendees:1800, category:'Community',   color:'#e879f9' },
  { title:'Cloud & DevOps India',             day:'26', month:'Sep', location:'Chennai',     attendees:720,  category:'Cloud',       color:'#22d3ee' },
];

const GIGS: GigItem[] = [
  { title:'Build a Next.js SaaS Dashboard',       budget:'₹18k – ₹28k',  skills:['Next.js','TypeScript','Tailwind'],  poster:'Vikram S.',   bids:14, level:'Expert'      },
  { title:'Fine-tune LLM for Legal Docs',         budget:'₹35k – ₹55k',  skills:['Python','LLMs','NLP'],              poster:'Nisha K.',    bids:7,  level:'Expert'      },
  { title:'Brand Identity for D2C Startup',       budget:'₹22k – ₹38k',  skills:['Brand','Figma','Illustration'],     poster:'Meera I.',    bids:19, level:'Mid'         },
  { title:'Mobile App UI — Fintech',              budget:'₹14k – ₹20k',  skills:['Figma','iOS Design','UX'],          poster:'Ananya K.',   bids:11, level:'Mid'         },
  { title:'Kubernetes Infra Audit',               budget:'₹40k – ₹70k',  skills:['AWS','K8s','Terraform'],            poster:'Elena P.',    bids:5,  level:'Expert'      },
  { title:'Content Strategy — B2B SaaS',          budget:'₹8k – ₹14k',   skills:['Content','SEO','Hubspot'],          poster:'Priya N.',    bids:22, level:'Entry'       },
  { title:'ML Pipeline for E-commerce',           budget:'₹30k – ₹50k',  skills:['Python','Spark','MLflow'],          poster:'Rohan M.',    bids:9,  level:'Expert'      },
  { title:'React Native — Social App',            budget:'₹25k – ₹40k',  skills:['RN','Redux','Firebase'],            poster:'Kenji Y.',    bids:16, level:'Mid'         },
];

const DOCS: DocItem[] = [
  { name:'Q2 Financial Report',       type:'PDF',   pages:24,  shared:'Finance Team',    icon:'📊', colorRgb:'99,102,241'  },
  { name:'Product Roadmap 2025',      type:'DOCX',  pages:18,  shared:'Product & Eng',   icon:'🗺️', colorRgb:'59,130,246'  },
  { name:'NDA — Corescent x Acme',   type:'PDF',   pages:6,   shared:'Legal',           icon:'📝', colorRgb:'232,121,249' },
  { name:'Design System v3.0',        type:'Figma', pages:84,  shared:'Design Team',     icon:'🎨', colorRgb:'167,139,250' },
  { name:'Investor Deck — Series A',  type:'PPTX',  pages:32,  shared:'Founders',        icon:'💼', colorRgb:'251,191,36'  },
  { name:'Employee Handbook 2025',    type:'DOCX',  pages:56,  shared:'All Staff',       icon:'📋', colorRgb:'52,211,153'  },
  { name:'API Documentation v2',      type:'MD',    pages:140, shared:'Engineering',     icon:'⚡', colorRgb:'34,211,238'  },
  { name:'Brand Guidelines',          type:'PDF',   pages:48,  shared:'Marketing',       icon:'✨', colorRgb:'249,115,22'  },
];

/* ─── Card components ────────────────────────────────────────── */

const CARD_BASE: React.CSSProperties = {
  flexShrink: 0,
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,0.068)',
  background: 'rgba(11,11,17,0.82)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  boxShadow: '0 4px 24px rgba(0,0,0,0.52), inset 0 1px 0 rgba(255,255,255,0.042)',
  cursor: 'default',
  userSelect: 'none',
};

export function ProfileCard({ p }: { p: SplashProfile }) {
  return (
    <div style={{ ...CARD_BASE, width: 210, padding: '13px 14px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: `linear-gradient(${p.avatarGrad})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 800, color: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
          {p.init}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'rgba(255,255,255,0.88)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
          <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.36)', marginTop: 1.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2.5, flexShrink: 0 }}>
          <span style={{ fontSize: 9, color: '#fbbf24' }}>★</span>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,0.52)' }}>{p.rating}</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)' }}>📍 {p.loc}</span>
        <span style={{ fontSize: 8, fontWeight: 600, color: p.availColor, padding: '1.5px 6px', borderRadius: 99, background: `${p.availColor}18`, border: `1px solid ${p.availColor}30` }}>{p.avail}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 9 }}>
        {p.skills.slice(0, 3).map(s => (
          <span key={s} style={{ fontSize: 8.5, fontWeight: 500, color: 'rgba(255,255,255,0.36)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5, padding: '2px 6px' }}>{s}</span>
        ))}
      </div>
      <div style={{ paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.045)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.22)' }}>{p.projects} projects</span>
        <span style={{ fontSize: 8.5, fontWeight: 600, color: 'rgba(201,168,76,0.68)' }}>Connect →</span>
      </div>
    </div>
  );
}

export function FeedCard({ post }: { post: FeedPost }) {
  return (
    <div style={{ ...CARD_BASE, width: 248, padding: '12px 14px 11px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: `linear-gradient(${post.avatarGrad})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 800, color: '#fff' }}>
          {post.init}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>{post.author}</div>
          <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.28)' }}>{post.role} · {post.time}</div>
        </div>
        <span style={{ fontSize: 7.5, fontWeight: 600, color: post.tagColor, padding: '1.5px 6px', borderRadius: 99, background: `${post.tagColor}16`, border: `1px solid ${post.tagColor}28`, whiteSpace: 'nowrap' }}>{post.tag}</span>
      </div>
      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.48)', lineHeight: 1.58, marginBottom: 9, overflow: 'hidden', maxHeight: '3.16em' }}>{post.text}</p>
      <div style={{ display: 'flex', gap: 14 }}>
        <span style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', gap: 3 }}>♥ {post.likes.toLocaleString()}</span>
        <span style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', gap: 3 }}>💬 {post.comments}</span>
      </div>
    </div>
  );
}

export function EventCard({ event }: { event: EventItem }) {
  return (
    <div style={{ ...CARD_BASE, width: 208, padding: '12px 14px 11px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 9 }}>
        <div style={{ width: 38, flexShrink: 0, borderRadius: 9, background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.22)', textAlign: 'center' as const, padding: '5px 0' }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#a5b4fc', lineHeight: 1 }}>{event.day}</div>
          <div style={{ fontSize: 7, fontWeight: 700, color: 'rgba(165,180,252,0.6)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginTop: 1 }}>{event.month}</div>
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.85)', lineHeight: 1.35 }}>{event.title}</div>
          <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.28)', marginTop: 3 }}>📍 {event.location}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 8, fontWeight: 600, color: event.color, padding: '1.5px 7px', borderRadius: 99, background: `${event.color}14`, border: `1px solid ${event.color}28` }}>{event.category}</span>
        <span style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.22)' }}>👥 {event.attendees.toLocaleString()}</span>
      </div>
    </div>
  );
}

export function GigCard({ gig }: { gig: GigItem }) {
  return (
    <div style={{ ...CARD_BASE, width: 222, padding: '12px 14px 11px' }}>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.86)', lineHeight: 1.35, marginBottom: 4 }}>{gig.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: '#34d399' }}>{gig.budget}</span>
          <span style={{ fontSize: 7.5, fontWeight: 600, color: 'rgba(255,255,255,0.32)', padding: '1.5px 6px', borderRadius: 99, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>{gig.level}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 9 }}>
        {gig.skills.map(s => (
          <span key={s} style={{ fontSize: 8.5, fontWeight: 500, color: 'rgba(255,255,255,0.36)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5, padding: '2px 6px' }}>{s}</span>
        ))}
      </div>
      <div style={{ paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.045)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.26)' }}>by {gig.poster}</span>
        <span style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.22)' }}>{gig.bids} bids</span>
      </div>
    </div>
  );
}

export function DocCard({ doc }: { doc: DocItem }) {
  return (
    <div style={{ ...CARD_BASE, width: 195, padding: '12px 14px 11px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0, background: `rgba(${doc.colorRgb},0.13)`, border: `1px solid rgba(${doc.colorRgb},0.24)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
          {doc.icon}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.86)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.name}</div>
          <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.28)', marginTop: 2 }}>{doc.type} · {doc.pages}p</div>
        </div>
      </div>
      <div style={{ paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.045)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.24)' }}>{doc.shared}</span>
        <span style={{ fontSize: 8.5, fontWeight: 600, color: `rgba(${doc.colorRgb},0.75)` }}>Open →</span>
      </div>
    </div>
  );
}

/* ─── Marquee row wrapper ────────────────────────────────────── */
export function SplashRow({ children, dir, dur }: { children: React.ReactNode; dir: 'L' | 'R'; dur: number }) {
  return (
    <div style={{ flexShrink: 0, overflow: 'hidden', width: '100%' }}>
      <div style={{
        display: 'flex', gap: 12,
        animation: `${dir === 'L' ? 'splashMarqueeL' : 'splashMarqueeR'} ${dur}s linear infinite`,
        willChange: 'transform',
      }}>
        {children}
      </div>
    </div>
  );
}

/* Doubled arrays for seamless loop -------------------------------- */
const PROFILES_TOP_2X  = [...SPLASH_PROFILES_TOP,  ...SPLASH_PROFILES_TOP]  as SplashProfile[];
const PROFILES_BTM_2X  = [...SPLASH_PROFILES_BTM,  ...SPLASH_PROFILES_BTM]  as SplashProfile[];
const FEED_POSTS_2X    = [...FEED_POSTS,            ...FEED_POSTS];
const EVENTS_2X        = [...EVENTS,                ...EVENTS];
const GIGS_2X          = [...GIGS,                  ...GIGS];
const DOCS_2X          = [...DOCS,                  ...DOCS];

/* ═══════════════════════════════════════════════════════════════
   The background itself — marquee card rows, frosted blur mask,
   centre vignette and edge vignette, in that exact layer order.
   Purely decorative: the whole tree is aria-hidden and
   pointer-events:none, so it can never intercept a click.
═══════════════════════════════════════════════════════════════ */
export default function AnimatedLoginBackground({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        position: 'absolute', inset: 0,
        background: '#060608', overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {/* ── Card rows — fill entire screen ── */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          justifyContent: 'space-around',
          padding: '12px 0',
          opacity: 0,
          animation: 'obFadeIn 1.1s 0.15s both',
        }}
      >
        <SplashRow dir="L" dur={38}>
          {PROFILES_TOP_2X.map((p, i) => <ProfileCard key={i} p={p} />)}
        </SplashRow>
        <SplashRow dir="R" dur={52}>
          {FEED_POSTS_2X.map((p, i) => <FeedCard key={i} post={p} />)}
        </SplashRow>
        <SplashRow dir="L" dur={44}>
          {EVENTS_2X.map((e, i) => <EventCard key={i} event={e} />)}
        </SplashRow>
        <SplashRow dir="R" dur={36}>
          {GIGS_2X.map((g, i) => <GigCard key={i} gig={g} />)}
        </SplashRow>
        <SplashRow dir="L" dur={48}>
          {PROFILES_BTM_2X.map((p, i) => <ProfileCard key={i} p={p} />)}
        </SplashRow>
        <SplashRow dir="R" dur={58}>
          {DOCS_2X.map((d, i) => <DocCard key={i} doc={d} />)}
        </SplashRow>
      </div>

      {/* ── Frosted blur mask — softens cards behind the headline ── */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0, zIndex: 5,
          backdropFilter: 'blur(44px)',
          WebkitBackdropFilter: 'blur(44px)',
          maskImage: 'radial-gradient(ellipse 72% 52% at 50% 50%, black 0%, black 18%, transparent 62%)',
          WebkitMaskImage: 'radial-gradient(ellipse 72% 52% at 50% 50%, black 0%, black 18%, transparent 62%)',
          pointerEvents: 'none',
        }}
      />

      {/* ── Dark centre vignette — contrast for text ── */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0, zIndex: 6, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 65% 50% at 50% 50%, rgba(5,5,8,0.82) 0%, rgba(5,5,8,0.55) 38%, rgba(5,5,8,0.18) 62%, transparent 75%)',
        }}
      />

      {/* ── Edge vignette — cards fade naturally at screen edges ── */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0, zIndex: 7, pointerEvents: 'none',
          background: [
            'radial-gradient(ellipse 100% 100% at 50% 50%, transparent 42%, rgba(5,5,8,0.72) 78%, rgba(5,5,8,0.96) 100%)',
          ].join(','),
        }}
      />
    </div>
  );
}
