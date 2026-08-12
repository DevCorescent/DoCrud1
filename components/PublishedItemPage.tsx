'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
  PostDetailContent,
  PollDetailContent,
  SurveyDetailContent,
  ChartDetailContent,
  ThreadDetailContent,
  VideoDetailContent,
  MilestoneDetailContent,
  TutorialDetailContent,
  ImageSlider,
  extractImagesFromGalleryHtml,
} from './PublishedCategoryPages';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  ChevronDown,
  BookOpen,
  Briefcase,
  CalendarDays,
  Check,
  ChevronRight,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Flag,
  Heart,
  Layers,
  Link2,
  Mail,
  Megaphone,
  MessageCircle,
  Newspaper,
  Package,
  Phone,
  Send,
  Share2,
  ShoppingBag,
  Terminal,
  Star,
  ThumbsUp,
  Trash2,
  TrendingUp,
  Twitter,
  User,
  Users,
  X,
  Zap,
} from 'lucide-react';

/* ─── types ─────────────────────────────────────────────────────── */
/* ─── minimal toast (this file has no shared toast system) ──────── */
function useSimpleToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const [tone, setTone] = useState<'success' | 'error'>('success');
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2500);
    return () => clearTimeout(t);
  }, [msg]);
  const show = useCallback((m: string, tn: 'success' | 'error' = 'success') => { setMsg(m); setTone(tn); }, []);
  const node = msg && typeof document !== 'undefined' ? createPortal(
    <div className="fixed bottom-6 right-4 z-[400] pointer-events-none">
      <div className={`rounded-2xl border px-4 py-2.5 text-[12.5px] font-semibold shadow-2xl backdrop-blur-xl ${
        tone === 'success' ? 'border-emerald-500/30 bg-[#0d1f14]/95 text-emerald-300' : 'border-red-500/30 bg-[#1f0d0d]/95 text-red-300'
      }`}>{msg}</div>
    </div>,
    document.body
  ) : null;
  return { show, node };
}

/* ─── types ─────────────────────────────────────────────────────── */
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
  /* enriched fields for real items */
  dataUrl?: string;
  mimeType?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  likesCount?: number;
  likedByViewer?: boolean;
  trendCount?: number;
  trendedByViewer?: boolean;
  viewCount?: number;
  canDelete?: boolean;
  uploadedByUserId?: string;
};

const TABS_MAP: Record<string, React.ElementType> = {
  news: Newspaper, article: BookOpen, document: FileText, portfolio: Layers,
  announcement: Megaphone, job: Briefcase, resume: User, product: Package,
  event: CalendarDays, hackathon: Terminal,
};

const TAG_CLS: Record<string, string> = {
  news:         'bg-red-500/10 text-red-400 border-red-500/20',
  article:      'bg-violet-500/10 text-violet-400 border-violet-500/20',
  document:     'bg-slate-500/10 text-slate-300 border-slate-500/20',
  portfolio:    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  announcement: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  job:          'bg-blue-500/10 text-blue-400 border-blue-500/20',
  resume:       'bg-sky-500/10 text-sky-400 border-sky-500/20',
  product:      'bg-purple-500/10 text-purple-400 border-purple-500/20',
  event:        'bg-pink-500/10 text-pink-400 border-pink-500/20',
  hackathon:    'bg-orange-500/10 text-orange-400 border-orange-500/20',
};

/* ─── seed data ─────────────────────────────────────────────────── */
const SEED_LIKES: Record<string, number> = {
  n1:41, n2:18, n3:22, n4:34, n5:51, n6:89,
  a1:29, a2:17, a3:23, a4:31, a5:44, a6:38,
  d1:12, d2:8,  d3:5,  d4:19,
  p1:34, p2:21, p3:18, p4:26,
  an1:67, an2:38, an3:44,
  j1:28, j2:19, j3:24,
  r1:53, r2:31, r3:22,
  pr1:41, pr2:24, pr3:18,
  ev1:78, ev2:43, ev3:61, ev4:29, ev5:38, ev6:55,
  h1:92, h2:67, h3:45, h4:58, h5:39, h6:32,
};

type RawComment = {
  id: string; author: string; initials: string; color: string;
  text: string; timestamp: string; likes: number; parentId?: string;
};
type Comment = RawComment & { likedByMe: boolean; replies: Comment[]; isOwner?: boolean };

const MOCK_COMMENTS: Record<string, RawComment[]> = {
  n1: [
    { id:'c1', author:'Priya Sharma', initials:'PS', color:'bg-emerald-600', text:"This is a game-changer for rural India. Tier-3 connectivity has been a pain point for years. JioSpace could be the UPI moment for broadband.", timestamp:'2026-05-12T07:10:00Z', likes:24 },
    { id:'c2', author:'Rahul Nair', initials:'RN', color:'bg-blue-600', text:'ISRO partnership is the real headline here. Gives it massive legitimacy and fast-tracks spectrum approval.', timestamp:'2026-05-12T08:45:00Z', likes:18 },
    { id:'c3', author:'Ananya K.', initials:'AK', color:'bg-violet-600', text:"28 satellites for 1,200 districts — the maths feel aggressive. Let's see if they hit the Q2 deadline.", timestamp:'2026-05-12T09:30:00Z', likes:11 },
  ],
  a1: [
    { id:'c4', author:'Vikram Singh', initials:'VS', color:'bg-orange-600', text:'The India SaaS story is real. We closed a $2M ARR deal with a Fortune 500 last quarter — zero Silicon Valley comparison needed.', timestamp:'2026-05-12T06:30:00Z', likes:31 },
    { id:'c5', author:'Meera Iyer', initials:'MI', color:'bg-pink-600', text:"Mukherjea's framing is spot-on. Indian SaaS wins because we're solving for edge cases global incumbents ignore.", timestamp:'2026-05-12T07:55:00Z', likes:19 },
  ],
  ev1: [
    { id:'c6', author:'Siddharth J.', initials:'SJ', color:'bg-teal-600', text:'Went last year. Absolute fire. The workshops on RSC were worth the ticket price alone. Already booked for 2026.', timestamp:'2026-05-12T09:00:00Z', likes:42 },
    { id:'c7', author:'Kavya R.', initials:'KR', color:'bg-rose-600', text:"Can we get student discount info? ₹2,499 is a lot for undergrads. Last year there was a scholarship track.", timestamp:'2026-05-12T10:15:00Z', likes:28 },
    { id:'c8', author:'Arun Dev', initials:'AD', color:'bg-indigo-600', text:'Speaker lineup is insane this year. Hoping Guillermo Rauch makes it again.', timestamp:'2026-05-12T11:00:00Z', likes:15 },
  ],
  h1: [
    { id:'c9', author:'Rohan M.', initials:'RM', color:'bg-green-600', text:'Won HackIndia 2024 with our ABHA integration project. The mentorship network they provide post-win is exceptional. Apply!', timestamp:'2026-05-12T10:00:00Z', likes:67 },
    { id:'c10', author:'Divya T.', initials:'DT', color:'bg-amber-600', text:"The GenAI track last year had some of the most creative solutions I've seen. What are the expected themes for 2026?", timestamp:'2026-05-12T11:30:00Z', likes:34 },
  ],
};

/* ─── mock catalogue ────────────────────────────────────────────── */
const ALL_MOCK: PublishedItem[] = [
  { id:'n1', category:'news', badge:'Breaking', featured:true, title:'Reliance Jio Launches JioSpace Satellite Internet Across 1,200 Rural Districts', byline:'Economic Times · 5 min read · Just now', body:'JioSpace will deliver broadband connectivity to over 6 crore households in Tier-3 and rural areas by Q2 2025, powered by 28 low-orbit satellites in partnership with ISRO.\n\nThe rollout will begin with the 400 most underserved districts in Bihar, Uttar Pradesh, Madhya Pradesh, Rajasthan, and Odisha. Each satellite base station will cover a 120 km radius, providing speeds of up to 100 Mbps download and 20 Mbps upload.\n\nJio has partnered with local gram panchayats to install community Wi-Fi hotspots at schools, health centres, and panchayat offices as the first access points.\n\n"This is the last-mile solution India has waited 20 years for," said Mukesh Ambani at the launch event in New Delhi. "Every Indian child will have the same access to knowledge as a child in Mumbai or Bengaluru."\n\nThe service is expected to be priced at ₹399/month for unlimited access, with a government subsidy for BPL households bringing it down to ₹99/month.', stats:[{v:'41.2k',l:'reads'},{v:'8.7k',l:'shares'},{v:'2,340',l:'comments'}], postedAt:'2026-05-12T06:00:00Z' },
  { id:'n2', category:'news', badge:'Markets', title:"SEBI Approves India's First Domestic ETF for Listed AI Companies", byline:'Mint · 3 min read · 2 hrs ago', body:"The Securities & Exchange Board of India has greenlit a first-of-its-kind domestic ETF tracking 28 publicly listed AI and deeptech firms.\n\nThe ETF, to be managed by Nippon India Mutual Fund, will track a custom index comprising companies with at least 30% of revenue attributable to AI-driven products or services. The index will be rebalanced quarterly.", stats:[{v:'18.4k',l:'reads'},{v:'3.1k',l:'shares'}], postedAt:'2026-05-12T04:00:00Z' },
  { id:'n3', category:'news', badge:'M&A', title:'Tata Group Acquires Singapore Fintech for ₹2,400 Crore', byline:'Business Standard · 4 min read · 5 hrs ago', body:"Tata Capital has completed the acquisition of Singapore-headquartered PaySprint, expanding its Southeast Asia footprint in embedded finance.\n\nThe deal, valued at approximately $290 million, gives Tata Capital access to PaySprint's payment infrastructure serving 1,400 merchants across Singapore, Malaysia, and Indonesia.", stats:[{v:'22.1k',l:'reads'},{v:'5.6k',l:'shares'}], postedAt:'2026-05-12T01:00:00Z' },
  { id:'n4', category:'news', badge:'Policy', title:'RBI Issues New Framework for Real-Time Cross-Border UPI Payments', byline:'LiveMint · 6 min read · 1 day ago', body:'The Reserve Bank of India has released comprehensive guidelines for interoperable UPI-based cross-border transfers covering 14 countries including UAE, UK, USA, Singapore, France, and Australia.\n\nKey provisions include: real-time settlement for amounts up to ₹2 lakh per transaction, 24/7 availability, and fees capped at 0.5% of the transaction value.', stats:[{v:'34.7k',l:'reads'},{v:'9.2k',l:'shares'}], postedAt:'2026-05-11T10:00:00Z' },
  { id:'a1', category:'article', badge:'Editorial', featured:true, title:'How Bengaluru Startups Are Quietly Rewriting Global SaaS Playbooks', byline:'Saurabh Mukherjea · Marcellus Investment · 14 min read', body:"India's SaaS founders aren't copying Silicon Valley anymore — they're building products that global enterprises actually prefer. 18 Indian B2B SaaS companies crossed $100M ARR in 2024 alone.\n\nThe shift happened quietly. Somewhere around 2021, Indian SaaS founders stopped trying to reverse-engineer what worked in the Valley and started building from first principles — for problems they actually understood.\n\nFreshworks won because it understood what support teams actually needed at 2 AM. Chargebee won because it understood the billing complexity of multi-currency, multi-entity SaaS businesses that Valley tools ignored. Postman won because it understood what API developers actually needed day-to-day.\n\nNone of these wins came from cheaper labour. They came from sharper product intuition built by founders who'd lived the problem.\n\nThe numbers bear this out: Indian SaaS companies now have an average NRR of 118% vs the Valley benchmark of 112%. Our CAC payback periods are 14 months vs 20 months for US-founded peers at the same ACV.\n\nThe next wave is being built right now in Bengaluru, Hyderabad, and Pune — and it will be even harder to ignore.", stats:[{v:'29.6k',l:'reads'},{v:'6.1k',l:'saves'},{v:'11.4k',l:'shares'}], postedAt:'2026-05-12T05:00:00Z' },
  { id:'d1', category:'document', badge:'Official', featured:true, title:'DPDP Act 2023 — Enterprise Compliance Handbook, 2nd Edition', byline:'64 pages · 4.1 MB · PDF · Updated today', body:'Comprehensive guide covering Data Principal rights, Data Fiduciary obligations, consent frameworks, breach notification timelines, and cross-border transfer rules under the Digital Personal Data Protection Act 2023.\n\nThis edition includes updates for the 2024 amendment rules and the Digital Personal Data Protection Rules 2025 (draft).', stats:[{v:'64',l:'pages'},{v:'4.1 MB',l:'size'},{v:'318',l:'downloads'}], postedAt:'2026-05-12T07:00:00Z' },
  { id:'d2', category:'document', badge:'Tax', title:'GST Annual Return Filing Guide FY 2024–25', byline:'38 pages · PDF · Updated yesterday', body:'Step-by-step GSTR-9 and GSTR-9C filing guide with screenshots, reconciliation templates, and common error fixes for CA firms and in-house finance teams.', stats:[{v:'38',l:'pages'},{v:'1.8 MB',l:'size'},{v:'541',l:'downloads'}], postedAt:'2026-05-11T06:00:00Z' },
  { id:'p1', category:'portfolio', badge:'Case Study', featured:true, title:"Reimagining IRCTC's Next Billion User Journey", byline:'Client: Ministry of Railways · UX Design · 2024', body:"Complete UX overhaul of India's busiest consumer platform — 8.5 lakh daily bookings. Reduced drop-off 52%, cut avg. booking time to 38 seconds.\n\nThe project began with 3 months of field research across 12 cities, interviewing 400+ regular rail travellers. Key insight: 67% of failed bookings happened at the seat selection step due to confusing map orientation.\n\nWe rebuilt the seat map from scratch using a top-down perspective with clear coach labels, and introduced a Quick Book mode that auto-selects the best available seat based on user preferences.", chips:['Figma','Design System','Hindi/Regional UI','A11y Research'], postedAt:'2026-05-12T04:00:00Z' },
  { id:'an1', category:'announcement', badge:'HIGH PRIORITY', featured:true, title:'Docrud Now Available in Hindi, Tamil, Telugu & 9 More Indian Languages', byline:'Product Team · Sent to 12,400 workspace members · 2 hrs ago', body:'Full UI localisation across 12 Indian languages is now live — including right-to-left support for Urdu. Switch from Settings › Workspace › Language.\n\nSupported languages: Hindi, Tamil, Telugu, Kannada, Malayalam, Bengali, Marathi, Gujarati, Punjabi, Odia, Assamese, Urdu.\n\nAll AI generation features including document drafting, contract review, and form builder now work natively in these languages — no translation layer required.', stats:[{v:'12.4k',l:'reached'},{v:'91%',l:'opened'},{v:'7 days',l:'active'}], postedAt:'2026-05-12T04:00:00Z' },
  { id:'j1', category:'job', badge:'Hybrid · Full-time', featured:true, title:'Senior Product Designer — Design Systems', byline:'Razorpay · Design · Bengaluru', body:"Own the design language across Razorpay's merchant dashboard and payment flows — used by 10M+ businesses across India.\n\nYou'll lead the design systems team, maintain the Razorpay Design System (RDS), and work closely with engineering leads to ship production-ready components.", chips:['₹35–55 LPA','ESOP','Design Systems','Figma','Remote Fridays'], postedAt:'2026-05-12T06:00:00Z' },
  { id:'r1', category:'resume', badge:'✦ Open to Work', featured:true, title:'Ananya Krishnan', byline:'Senior Product Designer · 9 yrs · Bengaluru, KA', body:"Decade of designing products for 100M+ Indians — CRED credit interface, Swiggy reorder flow. Believes great design solves for the person who never reads instructions.\n\nPrevious roles: Lead Designer at CRED (2021–2024), Senior Designer at Swiggy (2019–2021), UX Designer at Flipkart (2016–2019).", chips:['Figma','Design Systems','Bharat UX','User Research','Hindi UI'], postedAt:'2026-05-12T05:00:00Z' },
  { id:'pr1', category:'product', badge:'Most Popular', featured:true, title:'DocOps Pro Suite', byline:'₹3,999 / workspace / month · Annual billing · GST inclusive', body:"India's most complete document operations layer — unlimited templates, AI generation in 12 languages, Aadhaar eSign, GST invoicing, audit logs, and branded client portals.\n\nIncludes: AI document generation in Hindi, Tamil, Telugu + 9 more; Aadhaar eSign (IT Act 2000 Schedule II compliant); GSTIN validation + UPI QR invoice generation; DPDP-compliant audit trails.", chips:['Unlimited templates','AI (Hindi + English)','Aadhaar eSign','GST invoicing','DPDP compliant'], postedAt:'2026-05-12T07:00:00Z' },
  { id:'ev1', category:'event', badge:'Conference', featured:true, title:'React India 2026 — The Largest React Conference in Asia', byline:'React India · NSCI Dome, Mumbai · Sep 19–21, 2026', body:"3-day immersive React conference with 80+ speakers, 3,000 attendees, workshops on Next.js, RSC, and React Native. Featuring talks from Meta, Vercel, and top Indian product teams.\n\nDay 1 — Fundamentals & Architecture: React Server Components deep-dive, state management in 2026, accessibility at scale.\nDay 2 — Advanced Patterns: Performance, animations, React Native new architecture, AI in the browser.\nDay 3 — Workshops: Full-day hands-on workshops with limited seats (25 per session).\n\nEarly bird tickets at ₹2,499 available until June 30.", chips:['React','Next.js','TypeScript','₹2,499 early bird','In-person'], postedAt:'2026-05-12T08:00:00Z' },
  { id:'ev2', category:'event', badge:'Meetup', title:'Bengaluru AI/ML Monthly — May Edition', byline:'GDG Bengaluru · IKEA Experience Centre · May 25, 2026', body:'Monthly gathering of AI/ML engineers and researchers in Bengaluru. This month: LLM fine-tuning on Indic datasets, live demos, and networking dinner.', chips:['AI/ML','LLMs','Free entry','Bengaluru'], postedAt:'2026-05-11T09:00:00Z' },
  { id:'ev3', category:'event', badge:'Summit', title:'India SaaS Summit 2026 — Building Global from Bharat', byline:'SaaSBOOMi · ITC Grand Chola, Chennai · Jul 11–12, 2026', body:"India's premier SaaS gathering — 1,200 founders, 150 investors, 60 workshops.", chips:['SaaS','Founders','₹8,999','Chennai','Networking'], postedAt:'2026-05-10T07:00:00Z' },
  { id:'h1', category:'hackathon', badge:'₹50L Prize', featured:true, title:'HackIndia 2026 — Build AI for the Next Billion', byline:'HackIndia Foundation · Pan-India · Online + Finals in Delhi · Jun 14–16, 2026', body:"India's largest student hackathon — 50,000 registrations, ₹50 lakh prize pool, tracks in AI/ML, FinTech, HealthTech, and GovTech. Winning teams get 6-month startup accelerator access.\n\nTracks:\n• AI & Machine Learning — Build intelligent products for Bharat\n• FinTech — Payments, lending, insurance, and wealth\n• HealthTech — Rural diagnostics, ABHA, teleconsult\n• GovTech — Citizen services, compliance, and public data\n\nRegistration open until May 31, 2026.", chips:['AI/ML','₹50L Prize','Students','48 hrs','Devfolio'], postedAt:'2026-05-12T09:00:00Z' },
  { id:'h2', category:'hackathon', badge:'₹10L Prize', title:'Smart India Hackathon 2026', byline:'Ministry of Education · IITs & NITs · Aug 22–23, 2026', body:'Official GoI hackathon with 1,000+ problem statements from 50+ central ministries.', chips:['GovTech','₹1L/team','Students','IIT/NIT'], postedAt:'2026-05-11T08:00:00Z' },
  { id:'h3', category:'hackathon', badge:'$10k Prize', title:'Devfolio Build for Bharat — Web3 Edition', byline:'Devfolio + Polygon · Online · Jun 28 – Jul 6, 2026', body:'10-day async hackathon focused on DeFi, NFT utility, and blockchain for public services.', chips:['Web3','DeFi','$10k','Polygon'], postedAt:'2026-05-10T10:00:00Z' },
  /* Post */
  { id:'po1', category:'post', badge:'Photo', featured:true, title:'Shipped our new dashboard — 6 months of work in one release 🚀', byline:'Kushagra Sharma · Docrud · Just now', body:'Every pixel debated, every API endpoint stress-tested. This is what building in public looks like. The new workspace is live for all users.\n\nSix months of late nights, design debates, and hundreds of user sessions distilled into one release. Thank you to everyone who gave feedback during beta.\n\nThe new workspace is faster, cleaner, and built to scale. Go explore it.', stats:[{v:'2.4k',l:'likes'},{v:'312',l:'comments'},{v:'89',l:'shares'}], chips:['product','launch','buildinpublic'], postedAt:'2026-05-12T08:30:00Z' },
  { id:'po2', category:'post', badge:'Team', title:"Team offsite in Coorg — sometimes you need to step away from the IDE 🌿", byline:'Priya Ramesh · Designer · 2h ago', body:"3 days, 12 engineers, zero laptops (almost). Came back with more ideas than we left with.\n\nThe best product decisions happen away from Slack. Highly recommend forcing your team offline once a quarter.", stats:[{v:'1.8k',l:'likes'},{v:'204',l:'comments'}], chips:['team','offsite','culture'], postedAt:'2026-05-12T06:00:00Z' },
  { id:'po3', category:'post', badge:'Milestone', title:'1 million documents generated on Docrud 🎉', byline:'Docrud Team · 1d ago', body:"We didn't plan a party. We just checked the counter, screamed a little, and got back to building. Thank you.\n\n1,000,000 documents. From invoices to contracts to resumes to certificates — all created by real people solving real problems.\n\nHere's to the next million.", stats:[{v:'14.2k',l:'likes'},{v:'1.3k',l:'comments'},{v:'5.2k',l:'shares'}], chips:['milestone','docrud','product'], postedAt:'2026-05-11T10:00:00Z' },
  /* Poll */
  { id:'pl1', category:'poll', badge:'Active', featured:true, title:'What is your primary programming language in 2026?', byline:'Developer Community · 4,230 votes · Ends in 3 days', body:'TypeScript has been climbing — but Go is making serious moves in backend. Cast your vote and see where the community stands.', chips:['TypeScript · 38%','Python · 27%','Go · 21%','Rust · 14%'], stats:[{v:'4.2k',l:'votes'},{v:'3',l:'days left'},{v:'38%',l:'TypeScript leading'}], postedAt:'2026-05-12T07:00:00Z' },
  { id:'pl2', category:'poll', badge:'Closed', title:'Should Indian startups prioritise profitability over growth in 2026?', byline:'Startup Community · 11,840 votes · Closed', body:'The funding winter changed the narrative. What does the community think?', chips:['Yes, profit first · 61%','No, grow fast · 39%'], stats:[{v:'11.8k',l:'votes'},{v:'Closed',l:'status'}], postedAt:'2026-05-09T09:00:00Z' },
  { id:'pl3', category:'poll', badge:'Active', title:'Best city for a software engineer to live and work in India?', byline:'Tech Community · 7,650 votes · Ends tomorrow', body:'Cost of living, opportunities, quality of life — which city wins for tech folks?', chips:['Bengaluru · 44%','Pune · 22%','Hyderabad · 19%','Remote · 15%'], stats:[{v:'7.6k',l:'votes'},{v:'1',l:'day left'}], postedAt:'2026-05-11T06:00:00Z' },
  /* Survey */
  { id:'sv1', category:'survey', badge:'Open', featured:true, title:'India Developer Experience Survey 2026', byline:'JetBrains × Docrud · 5 min · 2,140 responses', body:'Annual survey on tools, workflows, salaries, and team dynamics across the Indian developer ecosystem. Results published in June.\n\nAll responses are anonymous. No email required. Takes under 5 minutes.', chips:['5 min','Anonymous','Tools','Salary','Work culture'], stats:[{v:'2.1k',l:'responses'},{v:'5',l:'questions'},{v:'Open',l:'status'}], postedAt:'2026-05-12T06:00:00Z' },
  { id:'sv2', category:'survey', badge:'Open', title:'Startup Founder Mental Health Check-In — Q2 2026', byline:'iSPIRT Foundation · 3 min · 890 responses', body:'Quarterly pulse check for startup founders. Anonymous. Results go back to the community with no attribution.\n\nIf you are a founder, co-founder, or solo operator — this is for you.', chips:['3 min','Anonymous','Founders','Mental health'], stats:[{v:'890',l:'responses'},{v:'8',l:'questions'}], postedAt:'2026-05-10T08:00:00Z' },
  /* Chart */
  { id:'ch1', category:'chart', badge:'Market Data', featured:true, title:'India SaaS ARR Growth by Vertical — 2023 to 2026', byline:'SaaSBOOMi Research · Published today', body:'FinTech SaaS grew 3.4× while HR-tech and EdTech saw consolidation. B2B infrastructure quietly became the biggest segment.\n\nData sourced from 340 Indian SaaS companies with $1M+ ARR. Figures represent median growth rates within each vertical.', chips:['FinTech +240%','HR-tech +45%','LegalTech +180%','EdTech +12%'], stats:[{v:'6',l:'verticals'},{v:'3yr',l:'data range'},{v:'340%',l:'top growth'}], postedAt:'2026-05-12T05:00:00Z' },
  { id:'ch2', category:'chart', badge:'Hiring Trends', title:'Tech Hiring Recovery Index — Jan to May 2026', byline:'LinkedIn India · Published 2 days ago', body:'After 18 months of contraction, tech hiring has rebounded 68% YoY. AI/ML and cloud roles leading recovery.\n\nData from 12,000+ tech job postings across India. Indexed to Jan 2024 = 100.', chips:['AI/ML +210%','Cloud +95%','Frontend +55%','QA +12%'], stats:[{v:'+68%',l:'YoY recovery'},{v:'5',l:'months tracked'}], postedAt:'2026-05-10T07:00:00Z' },
  /* Thread */
  { id:'th1', category:'thread', badge:'🧵 Thread', featured:true, title:"Why I stopped using Redux in 2026 — and what I use instead (7-part thread)", byline:'Arjun Nair · Frontend Architect · 15 min read', body:"1/ Redux was the answer to a problem we no longer have. In 2026, with React Server Components, Zustand, and TanStack Query, you almost never need it.\n\n2/ Let me show you the 4 patterns I use instead — each solving a specific data problem cleanly.\n\n3/ Pattern 1: TanStack Query for all server state. Cache, refetch, optimistic updates — all handled. No more loading/error booleans in Redux.\n\n4/ Pattern 2: Zustand for shared UI state. One line of code, zero boilerplate. Works with React DevTools out of the box.\n\n5/ Pattern 3: React Context for truly global, low-frequency state (theme, auth, locale). People underuse this.\n\n6/ Pattern 4: URL state for things users should be able to bookmark. Filter state in search params, not in a store.\n\n7/ The result: 60% less code, faster onboarding for new engineers, and zero 'action → reducer → selector' debugging hell.", stats:[{v:'18.4k',l:'reads'},{v:'3.2k',l:'likes'},{v:'7',l:'parts'}], chips:['React','Redux','Zustand','Architecture','Thread'], postedAt:'2026-05-12T08:00:00Z' },
  { id:'th2', category:'thread', badge:'🧵 Thread', title:'How I went from ₹4 LPA to ₹42 LPA in 4 years — without a CS degree (12-part thread)', byline:'Vikram Soni · Self-taught Engineer · 22 min read', body:"1/ In 2022, I was making ₹4 LPA doing manual QA at a Pune startup. Today I'm a senior engineer at a Series-B.\n\n2/ This is the exact roadmap I followed — no fluff, no courses to sell.\n\n3/ Year 1: I learned JavaScript seriously. Not tutorials — I built things. A budget tracker, a weather app, a clone of every product I used daily.\n\n4/ Year 2: I got my first dev job at ₹8 LPA. I was underpaid and I knew it. I used it as a learning platform, not a career destination.\n\n5/ Year 3: I specialised in React and Node. I started writing publicly — tweets, blog posts, LinkedIn. The compound effect of building in public is real.", stats:[{v:'94.2k',l:'reads'},{v:'22.1k',l:'likes'},{v:'12',l:'parts'}], chips:['Career','SelfTaught','Salary','Thread'], postedAt:'2026-05-11T07:00:00Z' },
  { id:'th3', category:'thread', badge:'🧵 Thread', title:"India's most underrated cities for remote tech workers — a ranked breakdown", byline:'Meera Iyer · Tech Writer · 10 min read', body:"1/ Everyone talks about Bengaluru, Pune, and Hyderabad. But there are 6 cities that offer better quality of life, lower cost, and a growing community.\n\n2/ #6 Indore — Clean, cheap, growing IT scene. Tier-2 salaries with Tier-1 quality of life. ₹25k/month covers a great life here.\n\n3/ #5 Jaipur — 3-hour drive from Delhi, beautiful old city, WeWork and co-working spaces now present. Strong design and agency community.\n\n4/ #4 Kochi — The hidden gem. Startup Village has been around since 2012. Sea breeze, low traffic, excellent food.", stats:[{v:'41.3k',l:'reads'},{v:'9.8k',l:'likes'},{v:'8',l:'parts'}], chips:['Remote Work','Cities','India','Thread'], postedAt:'2026-05-10T09:00:00Z' },
  /* Video */
  { id:'vi1', category:'video', badge:'Tutorial', featured:true, title:'Build a Full-Stack SaaS with Next.js 15, Supabase & Stripe in 4 Hours', byline:'Hrishikesh Kale · YouTube · 4h 12m · 340k views', body:'Complete walkthrough: auth, database, payments, email, deployment. All free-tier. No paid courses.\n\nChapters: 0:00 Project setup · 18:30 Supabase auth · 52:00 Database schema · 1:20:00 Stripe integration · 2:10:00 Email with Resend · 3:00:00 Deployment to Vercel', chips:['Next.js 15','Supabase','Stripe','Full-stack','Free'], stats:[{v:'340k',l:'views'},{v:'28k',l:'likes'},{v:'4h 12m',l:'duration'}], postedAt:'2026-05-12T06:00:00Z' },
  { id:'vi2', category:'video', badge:'Talk', title:'Scaling to 10M users on ₹0 infrastructure cost — IndiaFOSS 2026 Keynote', byline:'Tanmay Bakshi · IndiaFOSS · YouTube · 52m · 180k views', body:'How we used Cloudflare Workers, Turso, and edge caching to serve 10M users without a single EC2 instance.\n\nFull talk from IndiaFOSS 2026 in Bengaluru. Covers architecture decisions, trade-offs, and lessons learned.', chips:['CloudFlare','Edge','FOSS','Architecture'], stats:[{v:'180k',l:'views'},{v:'12k',l:'likes'},{v:'52 min',l:'duration'}], postedAt:'2026-05-11T08:00:00Z' },
  { id:'vi3', category:'video', badge:'Demo', title:'Docrud AI Document Generator — Full Product Demo', byline:'Docrud Team · Product Demo · 18m · 42k views', body:'Full walkthrough of the AI-powered document generator, template editor, eSign, and workspace sharing.\n\nSee how teams use Docrud to generate, sign, and share documents in minutes instead of hours.', chips:['Docrud','Product Demo','AI','Documents'], stats:[{v:'42k',l:'views'},{v:'3.4k',l:'likes'},{v:'18 min',l:'duration'}], postedAt:'2026-05-10T10:00:00Z' },
  /* Milestone */
  { id:'mi1', category:'milestone', badge:'🏆 Achievement', featured:true, title:"We just crossed ₹1 Crore ARR — bootstrapped, profitable, and building from Jaipur 🎉", byline:'Tanmay Sharma · Founder, FinSight · Just now', body:"18 months ago I quit my Deloitte job and started FinSight in a co-working space in Jaipur. Today we crossed ₹1 Crore ARR.\n\nNo VC money. No fancy office. Just 4 engineers and a real problem.\n\nWe serve 340 SMBs who couldn't afford enterprise accounting software. We charge ₹2,999/month. We have 0% churn in the last 6 months.\n\nBuilding from Tier-2 India is a superpower. Lower burn, better engineers, and customers who actually need what you're building.", stats:[{v:'₹1Cr',l:'ARR hit'},{v:'18',l:'months'},{v:'4',l:'team size'}], chips:['Bootstrapped','SaaS','Jaipur','Profitable'], postedAt:'2026-05-12T09:00:00Z' },
  { id:'mi2', category:'milestone', badge:'Career', title:"Promoted to Principal Engineer at 27 — here's what actually helped", byline:'Divya Menon · Principal Engineer, Swiggy · 1d ago', body:"5 years ago I joined Swiggy as a junior. Yesterday I got promoted to Principal Engineer — the youngest in the company's history.\n\nWhat actually helped: writing design docs obsessively, mentoring 3 engineers every quarter, and saying yes to the unsexy infrastructure work nobody wanted.", stats:[{v:'5',l:'years at Swiggy'},{v:'27',l:'years old'},{v:'4',l:'promotions'}], chips:['Career','Engineering','Swiggy','Milestone'], postedAt:'2026-05-11T08:00:00Z' },
  { id:'mi3', category:'milestone', badge:'Community', title:"GDG India hits 500,000 active members across 48 cities", byline:'GDG India · Community Milestone · 3d ago', body:"From a small meetup in Bengaluru in 2009, Google Developer Groups India now spans 48 cities and 500k members.\n\nEvery workshop, hackathon, and DevFest brought us here. Thank you to 2,000+ volunteer organizers who gave their weekends to grow this community.", stats:[{v:'500k',l:'members'},{v:'48',l:'cities'},{v:'17',l:'years active'}], chips:['GDG','Community','Google','India'], postedAt:'2026-05-09T07:00:00Z' },
  /* Tutorial */
  { id:'tu1', category:'tutorial', badge:'Beginner', featured:true, title:'Build Your First REST API with Go and Gin — Complete Guide for Beginners', byline:'Nikhil Sharma · 12 min read · 8 steps · 34k reads', body:"Go is fast, simple, and perfect for APIs. This guide walks you from zero to a fully working REST API with auth, database, and deployment.\n\nStep 1: Install Go and set up your project. Run `go mod init your-api` to create a module.\n\nStep 2: Install Gin — the fastest HTTP router in Go. `go get github.com/gin-gonic/gin`\n\nStep 3: Create your first route handler. A handler in Gin is just a function that takes a `*gin.Context`.\n\nStep 4: Connect to PostgreSQL using `database/sql` and the `pgx` driver.\n\nStep 5: Add middleware for logging and CORS. Gin makes this trivial with `router.Use()`.\n\nStep 6: Implement JWT authentication. Store the secret in an environment variable, never in code.\n\nStep 7: Write integration tests using `net/http/httptest`. Test every endpoint before deploying.\n\nStep 8: Deploy to Fly.io in 3 commands. `fly launch`, `fly secrets set`, `fly deploy`.", chips:['Go','REST API','Gin','PostgreSQL','8 steps'], stats:[{v:'34k',l:'reads'},{v:'2.8k',l:'bookmarks'},{v:'8',l:'steps'}], postedAt:'2026-05-12T07:00:00Z' },
  { id:'tu2', category:'tutorial', badge:'Intermediate', title:'Mastering Tailwind CSS v4 — The Complete Migration and New Features Guide', byline:'Anjali Singh · 18 min read · 12 steps · 51k reads', body:"Tailwind v4 introduces a brand new engine, cascade layers, and CSS-first config. This guide covers everything you need to upgrade.\n\nStep 1: Understand what changed — v4 uses a new Rust-based engine (Oxide) that's 10× faster.\n\nStep 2: Install v4 with `npm install tailwindcss@next @tailwindcss/vite`.\n\nStep 3: Replace your `tailwind.config.js` with a CSS-first configuration in your main stylesheet.\n\nStep 4: Migrate custom utilities to the new `@utility` API.\n\nStep 5: Update arbitrary values — the syntax for some edge cases has changed.", chips:['Tailwind CSS','v4','CSS','Migration','12 steps'], stats:[{v:'51k',l:'reads'},{v:'7.2k',l:'bookmarks'},{v:'12',l:'steps'}], postedAt:'2026-05-11T09:00:00Z' },
  { id:'tu3', category:'tutorial', badge:'Advanced', title:'Implementing DPDP-Compliant Consent Management in a SaaS App — From Scratch', byline:'Rahul Gupta · Legal Engineer · 24 min read · 6 steps · 18k reads', body:"Walk through building a DPDP Act-compliant consent management module: consent capture, withdrawal, audit logs, and breach notification hooks.\n\nStep 1: Understand what DPDP requires — explicit, informed, specific consent for each purpose of data processing.\n\nStep 2: Design your consent data model. Store purpose, timestamp, IP, user agent, and version of the privacy notice shown.\n\nStep 3: Build the consent capture UI — a modal that blocks use until consent is given for required purposes.\n\nStep 4: Implement consent withdrawal — a user-accessible settings page that triggers data deletion workflows.\n\nStep 5: Build the audit log — every consent event must be immutably recorded for regulatory inspection.\n\nStep 6: Wire breach notification hooks — if a breach occurs, your system must be able to identify all affected data principals within 72 hours.", chips:['DPDP','Privacy','Compliance','Node.js','6 steps'], stats:[{v:'18k',l:'reads'},{v:'4.1k',l:'bookmarks'},{v:'6',l:'steps'}], postedAt:'2026-05-10T08:00:00Z' },
  { id:'tu4', category:'tutorial', badge:'Intermediate', title:'Deploy Next.js 15 to Fly.io with Zero Downtime — Detailed Walkthrough', byline:'Siddharth Joshi · DevOps Guide · 15 min read · 9 steps', body:"Fly.io is the best alternative to Vercel for self-hosted Next.js. This guide covers Docker, health checks, secrets, and blue-green deployments.\n\nStep 1: Install the Fly CLI — `brew install flyctl` on Mac.\n\nStep 2: Create a `Dockerfile` optimised for Next.js — multi-stage build, standalone output mode.\n\nStep 3: Run `fly launch` — it detects Next.js and scaffolds the config automatically.\n\nStep 4: Set environment secrets with `fly secrets set DATABASE_URL=...`.\n\nStep 5: Configure health checks in `fly.toml` so Fly knows when your app is ready.\n\nStep 6: Enable auto-scaling with `min_machines_running = 1` to avoid cold starts.\n\nStep 7: Set up a Postgres database with `fly postgres create`.\n\nStep 8: Configure zero-downtime deploys using rolling updates in `fly.toml`.\n\nStep 9: Set up GitHub Actions for CI/CD — deploy on every push to main.", chips:['Next.js','Fly.io','Docker','DevOps','9 steps'], stats:[{v:'27k',l:'reads'},{v:'5.6k',l:'bookmarks'},{v:'9',l:'steps'}], postedAt:'2026-05-09T10:00:00Z' },
];

/* ─── structured body parser ────────────────────────────────────── */
const META_RE = /^([A-Za-z][A-Za-z\s\/()]{1,28}):\s+(.+)$/;

/** Detect single-line inline "Key: Value Key2: Value2 …" metadata */
function isInlineMeta(text: string): boolean {
  return ((text.match(/\b[A-Z][A-Za-z][\w\s\/()]{1,22}:\s+/g) || []).length) >= 2;
}

/** Parse inline single-line "Key: Value" pairs */
function parseInlineMeta(raw: string): { key: string; value: string }[] {
  const text = raw.replace(/\s+/g, ' ').trim();
  const pairs: { key: string; value: string }[] = [];
  const re = /([A-Z][A-Za-z][\w\s\/()]{1,22}):\s+([^:]+?)(?=\s+[A-Z][A-Za-z][\w\s\/()]{1,22}:|\s*$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const k = m[1].trim(); const v = m[2].trim();
    if (v.length > 0 && v.length < 200) pairs.push({ key: k, value: v });
  }
  return pairs;
}

function parseBody(raw: string): { meta: { key: string; value: string }[]; prose: string[] } {
  const meta: { key: string; value: string }[] = [];
  const prose: string[] = [];
  const blocks = raw.split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n').filter(Boolean);
    const allMeta = lines.length > 0 && lines.every(l => META_RE.test(l.trim()));
    if (allMeta) {
      for (const l of lines) {
        const m = l.trim().match(META_RE);
        if (m) meta.push({ key: m[1].trim(), value: m[2].trim() });
      }
    } else if (lines.length === 1 && isInlineMeta(lines[0])) {
      /* Single-line inline metadata like "Hackathon: X Organiser: Y Prize: Z …" */
      const inlinePairs = parseInlineMeta(lines[0]);
      meta.push(...inlinePairs);
    } else {
      const cleaned = lines.filter(l => !META_RE.test(l.trim())).join('\n');
      if (cleaned.trim()) prose.push(cleaned.trim());
    }
  }
  return { meta, prose };
}

function getBodySnippet(raw: string): string {
  const { prose } = parseBody(raw);
  return prose.join(' ').slice(0, 220).trim();
}

function isUrl(s: string) {
  try { return /^https?:\/\//.test(s); } catch { return false; }
}

function MetaValueNode({ value }: { value: string }) {
  if (isUrl(value)) {
    return (
      <a href={value} target="_blank" rel="noopener noreferrer"
        className="break-all text-sky-400 underline underline-offset-2 hover:text-sky-300 transition-colors">
        {value}
      </a>
    );
  }
  return <span className="text-white/80">{value}</span>;
}

function BodyRenderer({ body, category }: { body: string; category: string }) {
  const { meta, prose } = parseBody(body);
  const CAT_ACCENT: Record<string, string> = {
    news: 'text-red-400', article: 'text-violet-400', document: 'text-slate-300',
    portfolio: 'text-emerald-400', announcement: 'text-amber-400', job: 'text-blue-400',
    resume: 'text-sky-400', product: 'text-purple-400', event: 'text-pink-400',
    hackathon: 'text-orange-400', gig: 'text-white/60',
  };
  const accent = CAT_ACCENT[category] ?? 'text-amber-400';

  return (
    <div className="space-y-6">
      {/* metadata block */}
      {meta.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.025]">
          <div className="grid divide-y divide-white/[0.06]">
            {meta.map(({ key, value }) => (
              <div key={key} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3 sm:px-5">
                <span className={`shrink-0 w-32 text-[11px] font-bold uppercase tracking-[0.09em] ${accent}`}>
                  {key}
                </span>
                <span className="text-[14px] leading-snug">
                  <MetaValueNode value={value} />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* prose paragraphs */}
      {prose.map((para, i) => (
        <p key={i} className="text-[15px] leading-[1.85] text-white/72 whitespace-pre-line">{para}</p>
      ))}
    </div>
  );
}

/* ─── Category CTA sub-components ──────────────────────────────── */
function InterestCTA({
  itemId, accentColor, label,
  initialCount, initialInterested,
}: {
  itemId: string; accentColor: string; label: string;
  initialCount: number; initialInterested: boolean;
}) {
  const [interested, setInterested] = useState(initialInterested);
  const [count, setCount]           = useState(initialCount);
  const inFlight                    = useRef(false);

  useEffect(() => { setInterested(initialInterested); }, [initialInterested]);
  useEffect(() => { setCount(initialCount); }, [initialCount]);

  const toggle = async () => {
    if (inFlight.current) return;
    const next = !interested;
    setInterested(next);
    setCount(c => next ? c + 1 : Math.max(0, c - 1));
    inFlight.current = true;
    try {
      const res = await fetch(`/api/published/${itemId}/interest`, { method: 'POST' });
      if (res.ok) {
        const d = await res.json() as { interested: boolean; interestedCount: number };
        setInterested(d.interested);
        setCount(d.interestedCount);
      } else { setInterested(!next); setCount(c => next ? Math.max(0, c - 1) : c + 1); }
    } catch { setInterested(!next); } finally { inFlight.current = false; }
  };

  const borderCls  = `border-${accentColor}-500/25`;
  const bgCls      = `bg-${accentColor}-500/[0.06]`;
  const activeCls  = `border-${accentColor}-500/30 bg-${accentColor}-500/10 text-${accentColor}-400`;
  const inactiveCls = `bg-${accentColor}-500 text-white shadow-lg shadow-${accentColor}-500/20 hover:bg-${accentColor}-400`;

  return (
    <div className={`mt-8 rounded-2xl border p-5 ${borderCls} ${bgCls}`}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className={`text-[11px] font-semibold uppercase tracking-wider text-${accentColor}-400/60 mb-1`}>{label}</p>
          <div className="flex items-center gap-1.5 text-[12px] text-white/40">
            <Users className="h-3.5 w-3.5" />
            <span className="tabular-nums font-semibold text-white/60">{count}</span>
            <span>{count === 1 ? 'person' : 'people'} interested</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void toggle()}
          className={`inline-flex items-center gap-2 rounded-xl px-6 py-3 text-[14px] font-bold transition active:scale-[0.98] ${interested ? activeCls : inactiveCls}`}
        >
          {interested ? (
            <><Star className="h-4 w-4 fill-current" /> Interested</>
          ) : (
            <><Star className="h-4 w-4" /> Interested</>
          )}
        </button>
      </div>
    </div>
  );
}

function EventRegisterCTA({ itemId, initialCount, initialInterested }: { itemId: string; initialCount: number; initialInterested: boolean }) {
  return <InterestCTA itemId={itemId} accentColor="pink" label="Interested in this event?" initialCount={initialCount} initialInterested={initialInterested} />;
}

function HackathonRegisterCTA({ itemId, initialCount, initialInterested }: { itemId: string; initialCount: number; initialInterested: boolean }) {
  return <InterestCTA itemId={itemId} accentColor="orange" label="Interested in this hackathon?" initialCount={initialCount} initialInterested={initialInterested} />;
}

/* ─── helpers ───────────────────────────────────────────────────── */
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)       return 'Just now';
  if (diff < 3_600_000)    return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)   return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7*86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
}
function randomColor() {
  const c = ['bg-emerald-600','bg-blue-600','bg-violet-600','bg-orange-600','bg-pink-600','bg-teal-600','bg-rose-600','bg-indigo-600','bg-amber-600','bg-cyan-600'];
  return c[Math.floor(Math.random() * c.length)];
}
function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}
function getShareUrl(item: PublishedItem) {
  if (typeof window === 'undefined') return '';
  /* always use /published/:id — the canonical, publicly accessible URL */
  return `${window.location.origin}/published/${item.id}`;
}

/* ─── comment helpers ───────────────────────────────────────────── */
const AVATAR_COLORS = ['bg-emerald-600','bg-blue-600','bg-violet-600','bg-orange-600','bg-pink-600','bg-teal-600','bg-rose-600','bg-indigo-600','bg-amber-600','bg-cyan-600'];
function stableColor(seed: string): string {
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
type ApiComment = { id: string; author: string; text: string; createdAt: string; parentId?: string | null; likesCount?: number; likedByViewer?: boolean; isOwner?: boolean };

function apiCommentToComment(c: ApiComment): Comment {
  return { id:c.id, author:c.author, initials:initials(c.author), color:stableColor(c.author), text:c.text, timestamp:c.createdAt, likes:c.likesCount ?? 0, likedByMe:c.likedByViewer ?? false, replies:[], isOwner:c.isOwner ?? false };
}

function buildCommentTree(flat: ApiComment[]): Comment[] {
  const map = new Map<string, Comment>();
  const roots: Comment[] = [];
  for (const c of flat) map.set(c.id, apiCommentToComment(c));
  for (const c of flat) {
    const node = map.get(c.id)!;
    if (c.parentId) {
      const parent = map.get(c.parentId);
      if (parent) { parent.replies.push(node); continue; }
    }
    roots.push(node);
  }
  return roots;
}

/* ─── localStorage fallbacks (mock items only) ──────────────────── */
function getLikes(id: string): number {
  try { const s = localStorage.getItem(`pub_likes_${id}`); return s !== null ? parseInt(s, 10) : (SEED_LIKES[id] ?? 10); } catch { return SEED_LIKES[id] ?? 10; }
}
function setLikes(id: string, n: number) { try { localStorage.setItem(`pub_likes_${id}`, String(n)); } catch {} }
function getDidLike(id: string): boolean { try { return localStorage.getItem(`pub_liked_${id}`) === '1'; } catch { return false; } }
function setDidLike(id: string, v: boolean) { try { localStorage.setItem(`pub_liked_${id}`, v ? '1' : '0'); } catch {} }
function getLocalComments(id: string): Comment[] {
  try {
    const stored = localStorage.getItem(`pub_comments_${id}`);
    const raw: RawComment[] = stored ? JSON.parse(stored) : (MOCK_COMMENTS[id] ?? []);
    const top = raw.filter(c => !c.parentId);
    const byParent: Record<string, RawComment[]> = {};
    for (const c of raw) { if (c.parentId) (byParent[c.parentId] ??= []).push(c); }
    return top.map(c => ({ ...c, likedByMe: false, replies: (byParent[c.id] ?? []).map(r => ({ ...r, likedByMe: false, replies: [] })) }));
  } catch { return []; }
}
function saveLocalComments(id: string, comments: Comment[]) {
  try {
    const flat: RawComment[] = [];
    for (const c of comments) {
      flat.push({ id:c.id, author:c.author, initials:c.initials, color:c.color, text:c.text, timestamp:c.timestamp, likes:c.likes });
      for (const r of c.replies) flat.push({ id:r.id, author:r.author, initials:r.initials, color:r.color, text:r.text, timestamp:r.timestamp, likes:r.likes, parentId:c.id });
    }
    localStorage.setItem(`pub_comments_${id}`, JSON.stringify(flat));
  } catch {}
}

/* ═══════════════════════════════════════════════════════════════════
   LIVE TREND CHART
═══════════════════════════════════════════════════════════════════ */
type TrendPoint = { ts: number; likes: number; trends: number; comments: number; score: number; };
type ChartMetric = 'score' | 'likes' | 'trends' | 'comments';

const METRIC_CFG = {
  score:    { label: 'Engagement', color: '#a78bfa', grad: ['#a78bfa','#6d28d9'], unit: 'pts' },
  likes:    { label: 'Likes',      color: '#f472b6', grad: ['#f472b6','#be185d'], unit: '' },
  trends:   { label: 'Trend 🔥',  color: '#fb923c', grad: ['#fb923c','#c2410c'], unit: '' },
  comments: { label: 'Comments',  color: '#34d399', grad: ['#34d399','#065f46'], unit: '' },
} as const;

function engagementScore(l: number, t: number, c: number) {
  return Math.round(l * 1.0 + t * 2.8 + c * 1.6);
}

/* ── Tiny sparkline for tab badges ── */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <div style={{ width: 32, height: 14 }} />;
  const peak = Math.max(...values, 1);
  const W = 32; const H = 14;
  const pts = values.map((v, i) => ({ x: (i / (values.length - 1)) * W, y: H - (v / peak) * H }));
  const d = pts.map((p, i) => {
    if (i === 0) return `M${p.x},${p.y}`;
    const prev = pts[i - 1]; const cpX = (prev.x + p.x) / 2;
    return `C${cpX},${prev.y} ${cpX},${p.y} ${p.x},${p.y}`;
  }).join(' ');
  return (
    <svg width={W} height={H} style={{ overflow: 'visible', flexShrink: 0 }}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.70" />
    </svg>
  );
}

/* ── Arc gauge ── */
function ArcGauge({ value, color, size = 56 }: { value: number; color: string; size?: number }) {
  const r = size * 0.38; const cx = size / 2; const cy = size / 2;
  const startAngle = -210; const sweepAngle = 240;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const arc = (angle: number) => {
    const a = toRad(startAngle + angle);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };
  const trackEnd = arc(sweepAngle);
  const fillEnd  = arc(Math.min(1, value / 100) * sweepAngle);
  const largeTrack = sweepAngle > 180 ? 1 : 0;
  const largeFill  = (Math.min(1, value / 100) * sweepAngle) > 180 ? 1 : 0;
  const s0 = arc(0);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
      {/* track */}
      <path
        d={`M${s0.x.toFixed(2)},${s0.y.toFixed(2)} A${r},${r} 0 ${largeTrack},1 ${trackEnd.x.toFixed(2)},${trackEnd.y.toFixed(2)}`}
        fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" strokeLinecap="round"
      />
      {/* fill */}
      {value > 0 && (
        <path
          d={`M${s0.x.toFixed(2)},${s0.y.toFixed(2)} A${r},${r} 0 ${largeFill},1 ${fillEnd.x.toFixed(2)},${fillEnd.y.toFixed(2)}`}
          fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${color}60)` }}
        />
      )}
      {/* value */}
      <text x={cx} y={cy + 4} textAnchor="middle" style={{ fontSize: size * 0.22, fontWeight: 800, fill: color, fontFamily: 'ui-monospace,monospace', fontVariantNumeric: 'tabular-nums' }}>{value}</text>
    </svg>
  );
}

/* ── Score gauge with interactive signal breakdown tooltip ── */
type ScoreSignal = { label: string; value: number; max: number; color?: string };
function ScoreGauge({ label, value, color, signals, size = 52, tooltip }: {
  label: string; value: number; color: string; signals: ScoreSignal[]; size?: number; tooltip?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex flex-col items-center gap-0.5" style={{ userSelect: 'none' }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, background: 'none', border: 'none', padding: 2, cursor: 'pointer', borderRadius: 8 }}>
        <ArcGauge value={value} color={color} size={size} />
        <p style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>{label}</p>
      </button>
      {open && (
        <div className="absolute z-50 ltc-in"
          style={{
            top: '100%', right: 0, marginTop: 6,
            minWidth: 180,
            background: 'rgba(8,8,14,0.98)',
            border: `1px solid ${color}35`,
            borderRadius: 12,
            padding: '10px 12px',
            boxShadow: `0 12px 40px rgba(0,0,0,0.80), 0 0 0 1px ${color}18`,
          }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <p style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,0.70)', letterSpacing: '0.04em' }}>
              {label} Score <span style={{ color }}>{value}/100</span>
            </p>
            <button type="button" onClick={() => setOpen(false)} style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', background:'none', border:'none', cursor:'pointer', lineHeight:1 }}>✕</button>
          </div>
          {tooltip && (
            <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {tooltip}
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {signals.map(s => {
              const pct = Math.min(100, Math.round((s.value / s.max) * 100));
              const barColor = s.color ?? color;
              return (
                <div key={s.label}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>{s.label}</span>
                    <span style={{ fontSize: 8, color: barColor, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                      {s.value}<span style={{ color: 'rgba(255,255,255,0.20)', fontWeight: 400 }}>/{s.max}</span>
                    </span>
                  </div>
                  <div style={{ height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 999, boxShadow: `0 0 6px ${barColor}50`, transition: 'width 0.5s cubic-bezier(0.25,0.46,0.45,0.94)' }} />
                  </div>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.18)', marginTop: 8, lineHeight: 1.4 }}>
            Tap anywhere to close
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Core chart panel (used in sidebar + mobile sheet) ── */
function LiveTrendChart({ itemId, isReal, likeCount, trendCount, commentCount, viewCount = 0, postedAt, compact = false }: {
  itemId: string; isReal: boolean;
  likeCount: number; trendCount: number; commentCount: number; viewCount?: number; postedAt: string;
  compact?: boolean;
}) {
  const WINDOW = 40;
  const [history, setHistory]   = useState<TrendPoint[]>([]);
  const [metric, setMetric]     = useState<ChartMetric>('score');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [pulse, setPulse]       = useState(false);
  const [animKey, setAnimKey]   = useState(0);
  const mountedRef  = useRef(false);
  const svgRef      = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /* ── Seed historical data on mount ── */
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    const now  = Date.now();
    const ageMs = Math.max(now - new Date(postedAt).getTime(), 60_000);
    const pts   = Math.min(WINDOW - 2, Math.max(12, Math.floor(ageMs / 18_000)));
    const seed: TrendPoint[] = [];
    for (let i = pts; i >= 0; i--) {
      const p      = (pts - i) / pts;
      const curve  = 1 - Math.pow(1 - p, 1.8);
      const jitter = 0.78 + Math.random() * 0.44;
      const l = Math.round(likeCount    * curve * jitter);
      const t = Math.round(trendCount   * curve * jitter);
      const c = Math.round(commentCount * curve * jitter);
      seed.push({ ts: now - i * 18_000, likes: l, trends: t, comments: c, score: engagementScore(l,t,c) });
    }
    const last = seed[seed.length - 1];
    if (last) { last.likes = likeCount; last.trends = trendCount; last.comments = commentCount; last.score = engagementScore(likeCount,trendCount,commentCount); }
    setHistory(seed);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Append point when counts change ── */
  useEffect(() => {
    if (!mountedRef.current || history.length === 0) return;
    const now = Date.now();
    setHistory(prev => {
      const last = prev[prev.length - 1];
      if (last && last.likes === likeCount && last.trends === trendCount && last.comments === commentCount) return prev;
      return [...prev, { ts: now, likes: likeCount, trends: trendCount, comments: commentCount, score: engagementScore(likeCount,trendCount,commentCount) }].slice(-WINDOW);
    });
    setAnimKey(k => k + 1);
  }, [likeCount, trendCount, commentCount]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setPulse(true); const t = setTimeout(() => setPulse(false), 800); return () => clearTimeout(t); }, [animKey]);

  /* ── Derived ── */
  const cfg     = METRIC_CFG[metric];
  const values  = useMemo(() => history.map(h => h[metric]), [history, metric]);
  const peak    = useMemo(() => Math.max(...values, 1), [values]);
  const minV    = useMemo(() => Math.min(...values, 0), [values]);
  const latestVal = values[values.length - 1] ?? 0;
  const displayIdx = hoverIdx ?? values.length - 1;
  const current    = values[displayIdx] ?? 0;
  const prev3      = values[Math.max(0, values.length - 4)] ?? values[0] ?? 0;
  const delta      = latestVal - prev3;
  const velocity   = values.length >= 2 ? values[values.length-1] - values[values.length-2] : 0;
  const momentum: 'rising'|'steady'|'cooling' = delta > 0 ? 'rising' : delta < -2 ? 'cooling' : 'steady';
  const mColor  = momentum === 'rising' ? '#34d399' : momentum === 'cooling' ? '#f87171' : '#fbbf24';

  /* ── Health Score (0-100): content sustainability ── */
  const { healthScore, healthSignals } = useMemo(() => {
    const ageH        = Math.max(0.1, (Date.now() - new Date(postedAt).getTime()) / 3_600_000);
    const totalEng    = likeCount + trendCount * 2.8 + commentCount * 1.6;

    // Signal A — Engagement density per hour (0-35)
    // Benchmark: 8 weighted-engagement-points/hour = excellent
    const density = Math.min(35, (totalEng / ageH / 8) * 35);

    // Signal B — Engagement breadth: all 3 types contributing (0-25)
    const activeTypes = [likeCount > 0, trendCount > 0, commentCount > 0].filter(Boolean).length;
    const breadth = activeTypes === 3 ? 25 : activeTypes === 2 ? 14 : activeTypes === 1 ? 5 : 0;

    // Signal C — Momentum direction from history (0-20)
    const histScores = history.map(h => h.score);
    const recentAvg  = histScores.length >= 4 ? histScores.slice(-3).reduce((s,v) => s+v, 0) / 3 : 0;
    const earlyAvg   = histScores.length >= 4 ? histScores.slice(0, 3).reduce((s,v) => s+v, 0) / 3 : 0;
    const momentumPts = recentAvg > earlyAvg * 1.05 ? 20 : recentAvg >= earlyAvg * 0.9 ? 11 : 3;

    // Signal D — Comment depth: discussion means quality content (0-20)
    const commentDepth = Math.min(20, (commentCount / Math.max(likeCount, 1)) * 40);

    const score = Math.min(100, Math.round(density + breadth + momentumPts + commentDepth));
    return {
      healthScore: score,
      healthSignals: [
        { label: 'Eng. Density',  value: Math.round(density),      max: 35 },
        { label: 'Breadth',       value: breadth,                   max: 25 },
        { label: 'Momentum',      value: momentumPts,               max: 20 },
        { label: 'Comment Depth', value: Math.round(commentDepth),  max: 20 },
      ],
    };
  }, [likeCount, trendCount, commentCount, postedAt, history]);
  const hColor = healthScore >= 70 ? '#34d399' : healthScore >= 35 ? '#fbbf24' : '#f87171';

  /* ── Viral Score (0-100): spreading potential ── */
  const { viralScore, viralSignals } = useMemo(() => {
    const ageH     = Math.max(0.1, (Date.now() - new Date(postedAt).getTime()) / 3_600_000);
    const totalEng = likeCount + trendCount * 2.8 + commentCount * 1.6;

    // Signal 1 — Trend Amplification (0-30): trends = active sharing, the #1 viral signal
    // A post where >40% of total engagement is trends is extremely viral
    const trendShare   = trendCount / Math.max(totalEng / 2.8, 1); // normalize back to count
    const amplification = Math.min(30, trendShare * 55);

    // Signal 2 — Engagement Velocity per hour (0-25): time-normalized reach speed
    // Benchmark: 6 weighted-points/hour = viral territory
    const velocity2 = Math.min(25, (totalEng / ageH / 6) * 25);

    // Signal 3 — Growth Acceleration (0-20): is the rate INCREASING?
    // Compare last-25% of history vs first-25%
    const hScores = history.map(h => h.score);
    let acceleration = 0;
    if (hScores.length >= 8) {
      const quarter    = Math.max(1, Math.floor(hScores.length / 4));
      const earlyMean  = hScores.slice(0, quarter).reduce((s,v) => s+v, 0) / quarter;
      const recentMean = hScores.slice(-quarter).reduce((s,v) => s+v, 0) / quarter;
      const gr         = earlyMean > 0 ? (recentMean - earlyMean) / earlyMean : 0;
      acceleration     = Math.min(20, Math.max(0, gr * 25));
    } else if (hScores.length >= 3) {
      const first = hScores[0]; const last = hScores[hScores.length - 1];
      const gr    = first > 0 ? (last - first) / first : 0;
      acceleration = Math.min(20, Math.max(0, gr * 18));
    }

    // Signal 4 — Reach Efficiency (0-15): engagement / impressions
    // If viewCount available: use real rate; otherwise infer from age curve
    let reachEff = 0;
    if (viewCount > 0 && totalEng > 0) {
      // Industry benchmark: >5% eng rate is viral, >2% is good
      const engRate = totalEng / viewCount;
      reachEff = Math.min(15, (engRate / 0.05) * 15);
    } else if (totalEng > 0) {
      // No view data: use recency — new posts score higher for same engagement
      const recencyFactor = Math.max(0, 1 - ageH / 48); // decays over 48h
      reachEff = Math.min(15, recencyFactor * 10 + Math.min(5, totalEng / 10));
    }

    // Signal 5 — Social Proof Diversity (0-10): multiple engagement types = broader appeal
    const activeTypes = [likeCount > 0, trendCount > 0, commentCount > 0].filter(Boolean).length;
    const diversity   = activeTypes === 3 ? 10 : activeTypes === 2 ? 5 : 2;

    const score = Math.min(100, Math.round(amplification + velocity2 + acceleration + reachEff + diversity));
    return {
      viralScore: score,
      viralSignals: [
        { label: 'Trend Amplif.', value: Math.round(amplification), max: 30, color: METRIC_CFG.trends.color },
        { label: 'Eng. Velocity', value: Math.round(velocity2),     max: 25, color: METRIC_CFG.score.color },
        { label: 'Acceleration',  value: Math.round(acceleration),  max: 20, color: '#34d399' },
        { label: 'Reach Effic.',  value: Math.round(reachEff),      max: 15, color: '#60a5fa' },
        { label: 'Diversity',     value: diversity,                  max: 10, color: METRIC_CFG.likes.color },
      ],
    };
  }, [likeCount, trendCount, commentCount, viewCount, postedAt, history]);
  const vColor = viralScore >= 70 ? '#f472b6' : viralScore >= 40 ? '#fb923c' : '#818cf8';

  const projection = useMemo(() => {
    const tph = 3600 / 18;
    return Math.max(latestVal, Math.round(latestVal + velocity * tph * 0.55));
  }, [latestVal, velocity]);

  /* engagement mix ratios */
  const total = likeCount + trendCount + commentCount || 1;
  const likeRatio    = likeCount    / total;
  const trendRatio   = trendCount   / total;
  const commentRatio = commentCount / total;

  /* ── SVG geometry — fully responsive via viewBox ── */
const VW = 400; const VH = compact ? 110 : 150;
  const PAD = useMemo(() => ({ l: 36, r: 10, t: 12, b: 24 }), []);
  const cW  = VW - PAD.l - PAD.r;
  const cH  = VH - PAD.t - PAD.b;

  const svgPts = useMemo(() => {
    if (values.length < 2) return [];
    const range = Math.max(peak - minV, 1);
    return values.map((v, i) => ({
      x: PAD.l + (i / (values.length - 1)) * cW,
      y: PAD.t + (1 - (v - minV) / range) * cH,
    }));
  }, [values, peak, minV, cW, cH]);

  const linePath = useMemo(() => {
    if (svgPts.length < 2) return '';
    return svgPts.map((p, i) => {
      if (i === 0) return `M${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      const prev = svgPts[i-1]; const cpX = (prev.x + p.x) / 2;
      return `C${cpX.toFixed(1)},${prev.y.toFixed(1)} ${cpX.toFixed(1)},${p.y.toFixed(1)} ${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    }).join(' ');
  }, [svgPts]);

  const areaPath = useMemo(() => {
    if (!linePath || svgPts.length < 2) return '';
    const bot = PAD.t + cH;
    return `${linePath} L${svgPts[svgPts.length-1].x.toFixed(1)},${bot} L${PAD.l},${bot} Z`;
  }, [linePath, svgPts, cH]);

  const gradId  = `ltc2-${metric}-${itemId.replace(/[^a-z0-9]/gi,'_')}`;
  const lastPt  = svgPts[svgPts.length - 1];
  const hoverPt = hoverIdx !== null ? svgPts[hoverIdx] : null;

  /* 5 Y-axis gridlines */
  const yLines = useMemo(() => {
    const range = Math.max(peak - minV, 1);
    return [0, 0.25, 0.5, 0.75, 1].map(f => ({
      y: PAD.t + (1 - f) * cH,
      label: f === 0 ? '0' : Math.round(minV + f * range).toLocaleString(),
    }));
  }, [peak, minV, cH]);

  /* Pointer scrub — pixel-accurate using getBoundingClientRect */
  const handleSvgPointer = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || svgPts.length < 2) return;
    const scaleX = VW / rect.width;
    const relX   = (e.clientX - rect.left) * scaleX - PAD.l;
    const pct    = Math.max(0, Math.min(1, relX / cW));
    setHoverIdx(Math.round(pct * (svgPts.length - 1)));
  }, [svgPts.length, cW]);

  const sparklines = useMemo(() => ({
    score:    history.map(h => h.score),
    likes:    history.map(h => h.likes),
    trends:   history.map(h => h.trends),
    comments: history.map(h => h.comments),
  }), [history]);

  const tooltipTs = hoverIdx !== null ? history[hoverIdx]?.ts : null;

  /* ── format helpers ── */
  const fmt  = (n: number) => n >= 1000 ? `${(n/1000).toFixed(1)}k` : n.toLocaleString();
  const sign = (n: number) => n > 0 ? `+${n}` : `${n}`;

  return (
    <div ref={containerRef} className="rounded-2xl border select-none overflow-hidden"
      style={{ borderColor: 'rgba(255,255,255,0.09)', background: '#06060a' }}>
      <style>{`
        @keyframes ltc-pulse{0%,100%{opacity:.6;transform:scale(1)}50%{opacity:0;transform:scale(3)}}
        @keyframes ltc-in{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}
        .ltc-in{animation:ltc-in .18s ease both}
        @keyframes ltc-spin{to{transform:rotate(360deg)}}
      `}</style>

      {/* ══ HEADER ══════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3.5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.015)' }}>
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: `${cfg.color}16`, border: `1px solid ${cfg.color}28` }}>
            <TrendingUp className="h-4 w-4" style={{ color: cfg.color }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-white/90 tracking-tight">Analytics</span>
              <span className="flex items-center gap-1 rounded-full px-2 py-[3px]"
                style={{ background:'rgba(52,211,153,0.10)', border:'1px solid rgba(52,211,153,0.22)' }}>
                <span className="h-[5px] w-[5px] rounded-full bg-emerald-400"
                  style={{ animation:'ltc-pulse 2s ease infinite' }}/>
                <span className="text-[8px] font-bold text-emerald-300 tracking-widest">LIVE</span>
              </span>
            </div>
            <p className="text-[9px] text-white/25 font-medium mt-0.5">
              {isReal ? 'Real-time · 5s interval' : 'Simulated'} · {history.length} readings
            </p>
          </div>
        </div>

        {/* Gauge cluster — hover for signal breakdown */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <ScoreGauge label="Viral" value={viralScore} color={vColor}
            signals={viralSignals} size={compact ? 44 : 52}
            tooltip={viewCount > 0 ? `${viewCount.toLocaleString()} impressions` : undefined} />
          <ScoreGauge label="Health" value={healthScore} color={hColor}
            signals={healthSignals} size={compact ? 44 : 52} /></div>
      </div>

      {/* ══ STAT CARDS ═════════════════════════════════════════════════ */}
      <div className="grid grid-cols-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {([
          { key: 'score',    label: 'Engagement', val: engagementScore(likeCount,trendCount,commentCount), sub: 'score', color: METRIC_CFG.score.color },
          { key: 'likes',    label: 'Likes',       val: likeCount,    sub: 'total',    color: METRIC_CFG.likes.color },
          { key: 'trends',   label: 'Trends 🔥',   val: trendCount,   sub: 'trending', color: METRIC_CFG.trends.color },
          { key: 'comments', label: 'Comments',    val: commentCount, sub: 'replies',  color: METRIC_CFG.comments.color },
        ] as const).map((m, idx) => {
          const isActive = metric === m.key;
          const sp       = sparklines[m.key];
          const spPeak   = Math.max(...sp, 1);
          const spMin    = Math.min(...sp, 0);
          const spPts    = sp.slice(-10).map((v, i, a) => ({ x: (i/(a.length-1||1))*36, y: 14-(((v-spMin)/Math.max(spPeak-spMin,1))*14) }));
          const spPath   = spPts.length > 1 ? spPts.map((p,i) => i===0?`M${p.x.toFixed(1)},${p.y.toFixed(1)}`:`L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') : '';
          return (
            <button key={m.key} type="button"
              onClick={() => { setMetric(m.key as ChartMetric); setHoverIdx(null); }}
              style={{
                padding: '12px 10px 10px',
                background: isActive ? `${m.color}0d` : 'transparent',
                borderBottom: `2px solid ${isActive ? m.color : 'transparent'}`,
                borderRight: idx < 3 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                display: 'flex', flexDirection: 'column', gap: 4,
                transition: 'background 0.2s ease',
                cursor: 'pointer',
              }}>
              <div className="flex items-start justify-between gap-1">
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: isActive ? m.color : 'rgba(255,255,255,0.30)', lineHeight: 1 }}>
                  {m.label}
                </span>
                {/* mini sparkline */}
                {spPath && (
                  <svg width="36" height="14" style={{ flexShrink: 0, overflow: 'visible', marginTop: -1 }}>
                    <path d={spPath} fill="none" stroke={isActive ? m.color : 'rgba(255,255,255,0.12)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <p style={{ fontSize: compact ? 16 : 19, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: isActive ? m.color : 'rgba(255,255,255,0.82)' }}>
                {fmt(m.val)}
              </p>
              <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.22)', lineHeight: 1 }}>{m.sub}</p>
            </button>
          );
        })}
      </div>

      {/* ══ CHART ══════════════════════════════════════════════════════ */}
      <div className="relative" style={{ paddingTop: 6, paddingBottom: 0 }}>
        {values.length >= 2 ? (
          <>
            {/* Hover tooltip */}
            {hoverPt && tooltipTs !== null && (
              <div className="absolute z-20 pointer-events-none ltc-in"
                style={{
                  left: `${(hoverPt.x / VW) * 100}%`,
                  top: `${(hoverPt.y / VH) * 100}%`,
                  transform: 'translate(-50%,-120%)',
                  padding: '6px 10px',
                  borderRadius: 10,
                  background: 'rgba(8,8,14,0.97)',
                  border: `1px solid ${cfg.color}45`,
                  boxShadow: `0 8px 24px rgba(0,0,0,0.70), 0 0 0 1px ${cfg.color}18`,
                  whiteSpace: 'nowrap',
                  zIndex: 30,
                }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: cfg.color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{current.toLocaleString()} <span style={{ fontSize: 9, opacity: 0.6 }}>{cfg.unit}</span></p>
                <p style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                  {new Date(tooltipTs).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}
                </p>
                {/* all metric values at this point */}
                {hoverIdx !== null && (
                  <div style={{ display:'flex', gap:8, marginTop:5, paddingTop:5, borderTop:'1px solid rgba(255,255,255,0.08)' }}>
                    {(['likes','trends','comments'] as const).map(k => (
                      <div key={k} style={{ display:'flex', alignItems:'center', gap:3 }}>
                        <div style={{ width:5, height:5, borderRadius:999, background: METRIC_CFG[k].color, flexShrink:0 }} />
                        <span style={{ fontSize:8, color:'rgba(255,255,255,0.45)', fontVariantNumeric:'tabular-nums' }}>{history[hoverIdx]?.[k] ?? 0}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <svg ref={svgRef} width="100%" viewBox={`0 0 ${VW} ${VH}`}
              preserveAspectRatio="xMidYMid meet"
              style={{ display:'block', cursor:'crosshair', touchAction:'none', userSelect:'none' }}
              onPointerMove={handleSvgPointer}
              onPointerLeave={() => setHoverIdx(null)}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={cfg.color} stopOpacity="0.35" />
                  <stop offset="65%"  stopColor={cfg.color} stopOpacity="0.06" />
                  <stop offset="100%" stopColor={cfg.color} stopOpacity="0.00" />
                </linearGradient>
                <filter id="ltc-glow">
                  <feGaussianBlur stdDeviation="1.5" result="blur" />
                  <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
              </defs>

              {/* Grid lines + Y labels */}
              {yLines.map(({ y, label }) => (
                <g key={y}>
                  <text x={PAD.l - 5} y={y + 3.5} textAnchor="end"
                    style={{ fontSize: 8, fill:'rgba(255,255,255,0.20)', fontFamily:'ui-monospace,monospace' }}>
                    {label}
                  </text>
                  <line x1={PAD.l} y1={y} x2={VW - PAD.r} y2={y}
                    stroke="rgba(255,255,255,0.045)" strokeWidth="1" strokeDasharray="3 5" />
                </g>
              ))}

              {/* Area */}
              <path d={areaPath} fill={`url(#${gradId})`} />

              {/* Line */}
              <path d={linePath} fill="none" stroke={cfg.color} strokeWidth="2.2"
                strokeLinecap="round" strokeLinejoin="round" filter="url(#ltc-glow)" />

              {/* Hover crosshair */}
              {hoverPt && (
                <>
                  <line x1={hoverPt.x} y1={PAD.t} x2={hoverPt.x} y2={PAD.t + cH}
                    stroke={cfg.color} strokeWidth="1" strokeDasharray="3 3" opacity="0.45" />
                  <circle cx={hoverPt.x} cy={hoverPt.y} r="5.5" fill={cfg.color} opacity="0.18" />
                  <circle cx={hoverPt.x} cy={hoverPt.y} r="4" fill={cfg.color} />
                  <circle cx={hoverPt.x} cy={hoverPt.y} r="2" fill="#06060a" />
                </>
              )}

              {/* Live dot */}
              {lastPt && !hoverPt && (
                <>
                  {pulse && (
                    <circle cx={lastPt.x} cy={lastPt.y} r="5" fill={cfg.color} opacity="0.0">
                      <animate attributeName="r" values="5;18" dur="0.65s" fill="freeze" />
                      <animate attributeName="opacity" values="0.30;0" dur="0.65s" fill="freeze" />
                    </circle>
                  )}
                  <circle cx={lastPt.x} cy={lastPt.y} r="4.5" fill={cfg.color} filter="url(#ltc-glow)" />
                  <circle cx={lastPt.x} cy={lastPt.y} r="2" fill="#06060a" />
                </>
              )}

              {/* X labels */}
              {history.length >= 2 && [0, Math.floor((history.length-1)/2), history.length-1].map(i => {
                const p = svgPts[i]; if (!p) return null;
                return (
                  <text key={i} x={p.x} y={VH - 6}
                    textAnchor={i === 0 ? 'start' : i === history.length-1 ? 'end' : 'middle'}
                    style={{ fontSize: 8, fill:'rgba(255,255,255,0.22)', fontFamily:'ui-monospace,monospace' }}>
                    {i === history.length-1 ? 'now' : new Date(history[i].ts).toLocaleTimeString('en-IN',{ hour:'2-digit', minute:'2-digit' })}
                  </text>
                );
              })}
            </svg>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2.5 py-12">
            <div className="h-6 w-6 rounded-full border-2 border-white/[0.07] border-t-white/40"
              style={{ animation:'ltc-spin 0.9s linear infinite' }} />
            <p className="text-[10px] text-white/20">Collecting data…</p>
          </div>
        )}
      </div>

      {/* ══ ENGAGEMENT MIX BAR ══════════════════════════════════════════ */}
      {total > 1 && (
        <div style={{ padding: '10px 14px 12px', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ fontSize: 8.5, fontWeight: 700, textTransform:'uppercase', letterSpacing:'0.08em', color:'rgba(255,255,255,0.22)', marginBottom: 7 }}>
            Engagement Mix
          </p>
          {/* stacked bar */}
          <div style={{ display:'flex', height: 6, borderRadius: 999, overflow:'hidden', gap: 1 }}>
            {likeCount > 0    && <div style={{ flex: likeRatio,    background: METRIC_CFG.likes.color,    borderRadius: 999 }} />}
            {trendCount > 0   && <div style={{ flex: trendRatio,   background: METRIC_CFG.trends.color,   borderRadius: 999 }} />}
            {commentCount > 0 && <div style={{ flex: commentRatio, background: METRIC_CFG.comments.color, borderRadius: 999 }} />}
          </div>
          {/* legend */}
          <div style={{ display:'flex', gap: 12, marginTop: 6 }}>
            {([
              { label:'Likes',    pct: likeRatio,    color: METRIC_CFG.likes.color },
              { label:'Trends',   pct: trendRatio,   color: METRIC_CFG.trends.color },
              { label:'Comments', pct: commentRatio, color: METRIC_CFG.comments.color },
            ] as const).map(l => (
              <div key={l.label} style={{ display:'flex', alignItems:'center', gap: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: 2, background: l.color, flexShrink:0 }} />
                <span style={{ fontSize: 8, color:'rgba(255,255,255,0.32)', fontVariantNumeric:'tabular-nums' }}>
                  {l.label} {Math.round(l.pct * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ METRICS STRIP ═══════════════════════════════════════════════ */}
      <div className="grid grid-cols-4" style={{ borderTop:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.018)' }}>
        {[
          { label:'Current', value: fmt(current), sub: cfg.label.split(' ')[0], color: cfg.color },
          { label:'Peak',    value: fmt(peak),    sub: 'session max',            color:'rgba(255,255,255,0.65)' },
          { label:'Change',  value: sign(delta),  sub: 'last 3 pts',             color: delta > 0 ? '#34d399' : delta < 0 ? '#f87171' : 'rgba(255,255,255,0.4)' },
          { label:'Rate',    value: sign(velocity), sub: 'per reading',          color: velocity > 0 ? '#34d399' : velocity < 0 ? '#f87171' : 'rgba(255,255,255,0.4)' },
        ].map((m, idx) => (
          <div key={m.label} style={{
            padding:'11px 10px',
            borderRight: idx < 3 ? '1px solid rgba(255,255,255,0.05)' : 'none',
            background: '#06060a',
          }}>
            <p style={{ fontSize:7.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.09em', color:'rgba(255,255,255,0.20)', marginBottom:5 }}>{m.label}</p>
            <p style={{ fontSize:16, fontWeight:800, lineHeight:1, color:m.color, fontVariantNumeric:'tabular-nums' }}>{m.value}</p>
            <p style={{ fontSize:7.5, color:'rgba(255,255,255,0.18)', marginTop:3 }}>{m.sub}</p>
          </div>
        ))}
      </div>

      {/* ══ INSIGHT CARDS ═══════════════════════════════════════════════ */}
      <div className="grid grid-cols-2" style={{ borderTop:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.018)' }}>
        {/* Projection */}
        <div style={{ padding:'13px 14px', borderRight:'1px solid rgba(255,255,255,0.05)', background:'#06060a', display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:32, height:32, borderRadius:10, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(99,102,241,0.12)', border:'1px solid rgba(99,102,241,0.22)' }}>
            <Eye className="h-4 w-4 text-indigo-400" />
          </div>
          <div>
            <p style={{ fontSize:8, textTransform:'uppercase', letterSpacing:'0.09em', color:'rgba(255,255,255,0.25)', marginBottom:3 }}>1h Projection</p>
            <p style={{ fontSize:16, fontWeight:800, color:'rgba(255,255,255,0.85)', fontVariantNumeric:'tabular-nums', lineHeight:1 }}>
              {projection > 0 ? fmt(projection) : '—'}
            </p>
            <p style={{ fontSize:8, color:'rgba(255,255,255,0.22)', marginTop:3 }}>est. {cfg.label.split(' ')[0]}</p>
          </div>
        </div>
        {/* Momentum */}
        <div style={{ padding:'13px 14px', background:'#06060a', display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:32, height:32, borderRadius:10, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:`${mColor}14`, border:`1px solid ${mColor}28` }}>
            <Zap className="h-4 w-4" style={{ color: mColor }} />
          </div>
          <div>
            <p style={{ fontSize:8, textTransform:'uppercase', letterSpacing:'0.09em', color:'rgba(255,255,255,0.25)', marginBottom:3 }}>Momentum</p>
            <p style={{ fontSize:16, fontWeight:800, lineHeight:1, color:mColor }}>
              {momentum === 'rising' ? '↑ Rising' : momentum === 'cooling' ? '↓ Cooling' : '→ Steady'}
            </p>
            <p style={{ fontSize:8, color:`${mColor}70`, marginTop:3, fontVariantNumeric:'tabular-nums' }}>
              {sign(delta)} pts · {(likeCount+trendCount+commentCount).toLocaleString()} reach
            </p>
          </div>
        </div>
      </div>

      {/* ══ INSIGHT BANNER ══════════════════════════════════════════════ */}
      <div style={{ padding:'12px 16px', borderTop:'1px solid rgba(255,255,255,0.06)', background:`${cfg.color}07`, display:'flex', alignItems:'flex-start', gap:10 }}>
        <div style={{ width:20, height:20, borderRadius:999, flexShrink:0, marginTop:1, display:'flex', alignItems:'center', justifyContent:'center', background:`${cfg.color}1e`, border:`1px solid ${cfg.color}30` }}>
          <span style={{ fontSize:9, color:cfg.color, lineHeight:1 }}>✦</span>
        </div>
        <div className="flex-1 min-w-0">
          <p style={{ fontSize:11, fontWeight:600, lineHeight:1.5, color:`${cfg.color}cc` }}>
            {momentum === 'rising'
              ? `📈 Strong growth detected — ${sign(delta)} pts in last 3 readings.${viralScore > 60 ? ' 🚀 Viral potential detected — share now.' : ' Keep engaging to amplify reach.'}`
              : momentum === 'cooling'
                ? `📉 Engagement is slowing. Replying to comments or resharing can re-ignite reach.`
                : `⚡ Steady at ${fmt(current)} ${cfg.label.toLowerCase()}. Consistent audience holding strong.`
            }
          </p>
          <div style={{ display:'flex', gap:10, marginTop:5, flexWrap:'wrap' }}>
            <span style={{ fontSize:8, color:'rgba(255,255,255,0.22)' }}>{isReal ? '● live' : '● simulated'}</span>
            <span style={{ fontSize:8, color: vColor }}>Viral {viralScore}/100</span>
            <span style={{ fontSize:8, color: hColor }}>Health {healthScore}/100</span>
            <span style={{ fontSize:8, color:'rgba(255,255,255,0.22)' }}>{history.length} readings</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Mobile floating analytics button + bottom sheet ── */
function MobileAnalyticsButton({ itemId, isReal, likeCount, trendCount, commentCount, viewCount, postedAt, momentum }: {
  itemId: string; isReal: boolean;
  likeCount: number; trendCount: number; commentCount: number; viewCount: number; postedAt: string;
  momentum: 'rising'|'steady'|'cooling';
}) {
  const [open, setOpen] = useState(false);
  const total   = likeCount + trendCount + commentCount;
  const mColor  = momentum === 'rising' ? '#34d399' : momentum === 'cooling' ? '#f87171' : '#fbbf24';
  const mIcon   = momentum === 'rising' ? '↑' : momentum === 'cooling' ? '↓' : '→';
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;
  return (
    <>
      {/* Floating button */}
      <button type="button" onClick={() => setOpen(true)}
        className="lg:hidden fixed z-[60] flex items-center gap-2 rounded-full font-semibold shadow-2xl transition-all active:scale-95"
        style={{
          bottom: 'max(80px, calc(env(safe-area-inset-bottom) + 72px))',
          right: 16,
          height: 44,
          padding: '0 14px 0 10px',
          background: 'linear-gradient(135deg,rgba(24,20,48,0.95),rgba(12,10,28,0.98))',
          border: `1px solid ${mColor}30`,
          boxShadow: `0 8px 32px rgba(0,0,0,0.60), 0 0 0 1px ${mColor}15, 0 0 20px ${mColor}12`,
          backdropFilter: 'blur(16px)',
        }}>
        {/* Pulse dot */}
        <div className="relative flex-shrink-0" style={{ width:8, height:8 }}>
          <div className="absolute inset-0 rounded-full" style={{ background: mColor, animation:'ltc-pulse 2s ease infinite' }}/>
          <div className="absolute inset-0 rounded-full" style={{ background: mColor }}/>
        </div>
        <TrendingUp className="h-3.5 w-3.5 flex-shrink-0" style={{ color: mColor }} />
        <span className="text-[11.5px] text-white/85">Analytics</span>
        <span className="text-[10px] font-bold tabular-nums" style={{ color: mColor }}>{total.toLocaleString()}</span>
        <span className="text-[11px] font-bold" style={{ color: mColor }}>{mIcon}</span>
      </button>

      {/* Mobile bottom sheet portal */}
      {open && createPortal(
        <div className="fixed inset-0 z-[200] flex flex-col justify-end"
          onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative flex flex-col rounded-t-[24px] overflow-hidden"
            style={{
              maxHeight: '88svh',
              background: 'linear-gradient(160deg,rgba(24,18,50,0.96),rgba(8,8,18,0.98))',
              border: '1px solid rgba(255,255,255,0.10)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 -24px 60px rgba(0,0,0,0.50)',
            }}
            onClick={e => e.stopPropagation()}>
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
            {/* Sheet header */}
            <div className="flex items-center justify-between px-5 pb-3 flex-shrink-0">
              <div>
                <p className="text-[15px] font-bold text-white/90 tracking-tight">Live Analytics</p>
                <p className="text-[10.5px] text-white/35">{isReal ? 'Real-time data · 5s refresh' : 'Simulated history'}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)}
                className="h-8 w-8 rounded-full flex items-center justify-center transition-all active:scale-95"
                style={{ background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.10)' }}>
                <X className="h-4 w-4 text-white/50" />
              </button>
            </div>
            {/* Scrollable chart content */}
            <div className="flex-1 overflow-y-auto px-4 pb-6" style={{ scrollbarWidth:'none' }}>
              <LiveTrendChart
                itemId={`${itemId}-mobile`}
                isReal={isReal}
                likeCount={likeCount}
                trendCount={trendCount}
                commentCount={commentCount}
                viewCount={viewCount}
                postedAt={postedAt}
                compact={false}
              />
            </div>
            {/* Bottom safe area */}
            <div style={{ height:'max(16px,env(safe-area-inset-bottom))', flexShrink:0 }} />
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════ */
export default function PublishedItemPage({ id }: { id: string }) {
  const router = useRouter();
  const { data: session } = useSession();
  const displayName = session?.user?.name || 'Anonymous';
  const [item,          setItem]          = useState<PublishedItem | null>(null);
  const [related,       setRelated]       = useState<PublishedItem[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [likeCount,     setLikeCount]     = useState(0);
  const [liked,         setLiked]         = useState(false);
  const [trendCount,    setTrendCount]    = useState(0);
  const [trended,       setTrended]       = useState(false);
  const [viewCount,     setViewCount]     = useState(0);
  const [isRealItem,    setIsRealItem]    = useState(false);
  const [comments,      setComments]      = useState<Comment[]>([]);
  const [commentText,   setCommentText]   = useState('');
  const [replyTo,       setReplyTo]       = useState<string | null>(null);
  const [replyText,     setReplyText]     = useState('');
  const [showSharePanel,setShowSharePanel]= useState(false);
  const [copied,        setCopied]        = useState(false);
  const [embedCopied,   setEmbedCopied]   = useState(false);
  const [reportOpen,    setReportOpen]    = useState(false);
  const [reportReason,  setReportReason]  = useState('');
  const [reportDetail,  setReportDetail]  = useState('');
  const [reportSending, setReportSending] = useState(false);
  const [reportDone,    setReportDone]    = useState(false);
  const [reportError,   setReportError]   = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError,   setDeleteError]   = useState('');
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const { show: showToast, node: toastNode } = useSimpleToast();
  const [showAnalytics, setShowAnalytics] = useState(false);
  const commentRef  = useRef<HTMLTextAreaElement>(null);
  const sharePanelRef = useRef<HTMLDivElement>(null);
  const likeInFlight  = useRef(false);
  const trendInFlight = useRef(false);

  /* ── load item ── */
  useEffect(() => {
    async function load() {
      setLoading(true);
      // 1. Try the single-item API (real persisted items with full data)
      try {
        const res = await fetch(`/api/public/published/${id}`);
        if (res.ok) {
          const real = await res.json() as PublishedItem & {
            comments?: { id: string; author: string; text: string; createdAt: string }[];
          };
          setItem(real);
          setIsRealItem(true);
          setLikeCount(real.likesCount ?? 0);
          setLiked(real.likedByViewer ?? false);
          setTrendCount(real.trendCount ?? 0);
          setTrended(real.trendedByViewer ?? false);
          setViewCount(real.viewCount ?? 0);
          setComments(buildCommentTree(real.comments ?? []));
          // related from list API
          try {
            const lr = await fetch('/api/public/published');
            if (lr.ok) {
              const ld = await lr.json() as { items: PublishedItem[] };
              setRelated(ld.items.filter(i => i.id !== real.id && i.category === real.category).slice(0, 4));
            }
          } catch {}
          setLoading(false);
          return;
        }
      } catch {}
      // 2. Fall back to mock data
      const found = ALL_MOCK.find(m => m.id === id) ?? ALL_MOCK[0];
      setItem(found);
      setIsRealItem(false);
      setLikeCount(getLikes(found.id));
      setLiked(getDidLike(found.id));
      setComments(getLocalComments(found.id));
      setRelated(ALL_MOCK.filter(m => m.id !== found.id && m.category === found.category).slice(0, 4));
      setLoading(false);
    }
    void load();
  }, [id]);

  /* ── poll real items every 5 s for live counts ── */
  useEffect(() => {
    if (!isRealItem) return;
    const refresh = async () => {
      try {
        const [lRes, cRes] = await Promise.all([
          fetch(`/api/public/published/${id}`),
          fetch(`/api/public/published/${id}/comments`),
        ]);
        if (lRes.ok) {
          const d = await lRes.json() as { likesCount?: number; likedByViewer?: boolean; trendCount?: number; trendedByViewer?: boolean; viewCount?: number };
          setLikeCount(n => d.likesCount ?? n);
          if (d.likedByViewer !== undefined) setLiked(d.likedByViewer);
          setTrendCount(n => d.trendCount ?? n);
          if (d.trendedByViewer !== undefined) setTrended(d.trendedByViewer);
          if (d.viewCount !== undefined) setViewCount(d.viewCount);
        }
        if (cRes.ok) {
          const cd = await cRes.json() as { comments: ApiComment[] };
          setComments(buildCommentTree(cd.comments));
        }
      } catch {}
    };
    const interval = setInterval(() => void refresh(), 5_000);
    return () => clearInterval(interval);
  }, [id, isRealItem]);

  /* ── close share panel on outside click ── */
  useEffect(() => {
    if (!showSharePanel) return;
    const h = (e: MouseEvent) => { if (sharePanelRef.current && !sharePanelRef.current.contains(e.target as Node)) setShowSharePanel(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showSharePanel]);

  /* ── like ── */
  const toggleLike = async () => {
    if (!item || likeInFlight.current) return;
    const next = !liked;
    const nc = next ? likeCount + 1 : likeCount - 1;
    setLiked(next); setLikeCount(nc);
    if (isRealItem) {
      likeInFlight.current = true;
      try {
        const res = await fetch(`/api/published/${item.id}/like`, { method: 'POST' });
        if (res.ok) {
          const d = await res.json() as { liked: boolean; likesCount: number };
          setLiked(d.liked); setLikeCount(d.likesCount);
        }
      } catch {} finally { likeInFlight.current = false; }
    } else {
      setDidLike(item.id, next); setLikes(item.id, nc);
    }
  };

  /* ── trend ── */
  const toggleTrend = async () => {
    if (!item || trendInFlight.current) return;
    const next = !trended;
    setTrended(next);
    setTrendCount(c => Math.max(0, c + (next ? 1 : -1)));
    if (isRealItem) {
      trendInFlight.current = true;
      try {
        const res = await fetch(`/api/published/${item.id}/trend`, { method: 'POST' });
        if (res.ok) {
          const d = await res.json() as { trended: boolean; trendCount: number };
          setTrended(d.trended); setTrendCount(d.trendCount);
        } else { setTrended(trended); setTrendCount(c => Math.max(0, c + (next ? -1 : 1))); }
      } catch { setTrended(trended); } finally { trendInFlight.current = false; }
    }
  };

  const shareUrl = item ? getShareUrl(item) : '';

  const copyLink = async () => {
    if (!item) return;
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };
  const copyEmbed = async () => {
    if (!item) return;
    const snippet = `<blockquote class="docrud-embed" data-id="${item.id}"><a href="${shareUrl}">${item.title}</a></blockquote><script async src="${window.location.origin}/embed.js"><\/script>`;
    try { await navigator.clipboard.writeText(snippet); setEmbedCopied(true); setTimeout(() => setEmbedCopied(false), 2000); } catch {}
  };
  const nativeShare = async () => {
    if (!item || !navigator.share) return;
    const snippet = item.body ? item.body.replace(/\n+/g, ' ').slice(0, 140).trimEnd() + '…' : '';
    try { await navigator.share({ title: item.title, text: snippet, url: shareUrl }); } catch {}
  };

  function tweetUrl() {
    const text = encodeURIComponent(item!.title.slice(0, 200));
    const url  = encodeURIComponent(shareUrl);
    return `https://twitter.com/intent/tweet?text=${text}&url=${url}&via=docrud`;
  }
  function linkedInUrl() {
    return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
  }
  function whatsAppUrl() {
    return `https://wa.me/?text=${encodeURIComponent(`${item!.title}\n${shareUrl}`)}`;
  }
  function emailUrl() {
    const subject = encodeURIComponent(item!.title);
    const snippet = item!.body ? item!.body.replace(/\n+/g, ' ').slice(0, 200) : '';
    const body    = encodeURIComponent(`${item!.title}\n\n${snippet ? snippet + '\n\n' : ''}${shareUrl}`);
    return `mailto:?subject=${subject}&body=${body}`;
  }

  /* ── delete own post ── */
  const deleteItem = async () => {
    if (!item) return;
    setDeleteLoading(true); setDeleteError('');
    try {
      const res = await fetch(`/api/public/published/${item.id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json().catch(() => null) as any; throw new Error(d?.error || 'Delete failed.'); }
      router.push('/published');
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Delete failed.');
      setDeleteLoading(false);
    }
  };

  /* ── comment (real API for real items, localStorage for mocks) ── */
  const submitComment = async () => {
    if (!item || !commentText.trim()) return;
    const optimistic: Comment = { id:`c_${Date.now()}`, author:displayName, initials:initials(displayName), color:stableColor(displayName), text:commentText.trim(), timestamp:new Date().toISOString(), likes:0, likedByMe:false, replies:[] };
    setComments(prev => [optimistic, ...prev]);
    setCommentText('');
    if (isRealItem) {
      try {
        const res = await fetch(`/api/public/published/${item.id}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: optimistic.text }),
        });
        if (res.ok) {
          const d = await res.json() as { comments: ApiComment[] };
          setComments(buildCommentTree(d.comments));
        }
      } catch {}
    } else {
      setComments(prev => { saveLocalComments(item.id, prev); return prev; });
    }
  };

  const submitReply = async (parentId: string, text?: string) => {
    const replyContent = (text ?? replyText).trim();
    if (!item || !replyContent) return;
    const r: Comment = { id:`r_${Date.now()}`, author:displayName, initials:initials(displayName), color:randomColor(), text:replyContent, timestamp:new Date().toISOString(), likes:0, likedByMe:false, replies:[] };
    setComments(prev => prev.map(c => c.id === parentId ? { ...c, replies:[...c.replies, r] } : c));
    setReplyText(''); setReplyTo(null);
    if (isRealItem) {
      try {
        const res = await fetch(`/api/public/published/${item.id}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: replyContent, parentId }),
        });
        if (res.ok) {
          const d = await res.json() as { comments: ApiComment[] };
          setComments(buildCommentTree(d.comments));
        }
      } catch {}
    } else {
      setComments(prev => { saveLocalComments(item.id, prev); return prev; });
    }
  };
  const likeComment = async (commentId: string, isReply?: string) => {
    // Optimistic update
    setComments(prev => prev.map(c => {
      if (isReply && c.id === isReply) return { ...c, replies: c.replies.map(r => r.id === commentId ? { ...r, likes: r.likedByMe ? r.likes-1 : r.likes+1, likedByMe: !r.likedByMe } : r) };
      if (c.id === commentId) return { ...c, likes: c.likedByMe ? c.likes-1 : c.likes+1, likedByMe: !c.likedByMe };
      return c;
    }));
    if (isRealItem && item) {
      try {
        await fetch(`/api/public/published/${item.id}/comments/${commentId}/like`, { method: 'POST' });
        // Refresh comments from server to get accurate counts
        const cRes = await fetch(`/api/public/published/${item.id}/comments`);
        if (cRes.ok) {
          const cd = await cRes.json() as { comments: ApiComment[] };
          setComments(buildCommentTree(cd.comments));
        }
      } catch {}
    } else if (item) {
      setComments(prev => { saveLocalComments(item.id, prev); return prev; });
    }
  };

  /* ── delete comment (owner-only; server verifies) ── */
  const removeCommentFromTree = useCallback((list: Comment[], commentId: string): Comment[] => {
    return list
      .filter(c => c.id !== commentId)
      .map(c => ({ ...c, replies: removeCommentFromTree(c.replies, commentId) }));
  }, []);

  const deleteComment = useCallback(async (commentId: string) => {
    if (!item || deletingCommentId || !isRealItem) return;
    const confirmed = window.confirm('Are you sure you want to delete this comment?');
    if (!confirmed) return;

    setDeletingCommentId(commentId);
    try {
      const res = await fetch(`/api/public/published/${item.id}/comments/${commentId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null) as { error?: string; comments?: ApiComment[] } | null;

      if (!res.ok) {
        showToast(data?.error || 'Unable to delete comment.', 'error');
        return;
      }

      if (Array.isArray(data?.comments)) {
        setComments(buildCommentTree(data.comments));
      } else {
        setComments(prev => removeCommentFromTree(prev, commentId));
      }
      showToast('Comment deleted.', 'success');
    } catch {
      showToast('Something went wrong while deleting the comment.', 'error');
    } finally {
      setDeletingCommentId(null);
    }
  }, [item, deletingCommentId, isRealItem, removeCommentFromTree, showToast]);

  /* loading skeleton */
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0C] text-white">
        <div className="h-14 border-b border-white/[0.06]" />
        <div className="px-4 sm:px-6 lg:px-10 xl:px-14 2xl:px-20 py-10">
          <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
            <div className="space-y-5">
              <div className="h-5 w-32 animate-pulse rounded-lg bg-white/[0.06]" />
              <div className="h-12 w-3/4 animate-pulse rounded-xl bg-white/[0.07]" />
              <div className="h-4 w-1/2 animate-pulse rounded-lg bg-white/[0.04]" />
              <div className="space-y-3 pt-4">{[1,2,3,4,5].map(i => <div key={i} className="h-4 animate-pulse rounded bg-white/[0.04]" style={{ width:`${95 - i * 5}%` }} />)}</div>
            </div>
            <div className="hidden lg:block space-y-4">
              {[1,2,3].map(i => <div key={i} className="h-32 animate-pulse rounded-2xl bg-white/[0.04]" />)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0C] text-white">
        <div className="text-center">
          <p className="text-base font-semibold">Item not found</p>
          <Link href="/published" className="mt-3 inline-block text-sm text-white/40 hover:text-white underline">← Back to Published</Link>
        </div>
      </div>
    );
  }

  const tagCls    = TAG_CLS[item.category] ?? 'bg-white/10 text-white/70 border-white/10';
  const CatIcon   = TABS_MAP[item.category] ?? FileText;
  const totalComments = comments.reduce((s, c) => s + 1 + c.replies.length, 0);

  const enrichedItem = {
    ...item,
    dataUrl: item.dataUrl,
    mimeType: item.mimeType,
    videoUrl: item.videoUrl,
  };

  const sharedCatProps = {
    item: enrichedItem, likeCount, liked, toggleLike,
    trendCount, trended, toggleTrend,
    comments, commentText, displayName,
    setCommentText, submitComment, submitReply,
    likeComment: (id: string) => void likeComment(id),
    totalComments, commentRef,
  };

  const NEW_CATS = new Set(['post', 'poll', 'survey', 'chart', 'thread', 'video', 'milestone', 'tutorial']);

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-white">

      {/* ── Delete confirm modal ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => { setDeleteConfirm(false); setDeleteError(''); }} />
          <div className="relative w-full max-w-sm rounded-2xl border border-white/[0.10] bg-[#111114] p-6 shadow-[0_32px_80px_rgba(0,0,0,0.8)]">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 mb-4">
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </div>
            <h3 className="text-[15px] font-bold text-white">Delete this post?</h3>
            <p className="mt-1.5 text-[13px] text-white/45">This action cannot be undone. The post will be removed from the public directory immediately.</p>
            {deleteError && (
              <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/[0.07] px-3 py-2 text-[13px] text-red-400">{deleteError}</p>
            )}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => { setDeleteConfirm(false); setDeleteError(''); }}
                className="h-9 flex-1 rounded-xl border border-white/[0.08] bg-transparent text-[13px] font-medium text-white/55 transition hover:bg-white/5 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void deleteItem()}
                disabled={deleteLoading}
                className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 text-[13px] font-bold text-red-400 transition hover:bg-red-500/20 hover:text-red-300 disabled:opacity-40"
              >
                {deleteLoading ? <><div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-400/30 border-t-red-400" /> Deleting…</> : <><Trash2 className="h-3.5 w-3.5" /> Delete post</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ambient */}
      <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden>
        <div className="absolute left-1/2 top-0 h-[450px] w-[700px] -translate-x-1/2 rounded-full bg-orange-400/[0.05] blur-[160px]" />
        <div className="absolute right-0 top-1/2 h-[300px] w-[350px] rounded-full bg-amber-500/[0.04] blur-[120px]" />
      </div>

      {/* ── sticky header ── */}
      <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#0A0A0C]/95 backdrop-blur-2xl">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-10 xl:px-14 2xl:px-20">

          {/* back */}
          <Link href="/published" className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-white/55 transition hover:bg-white/[0.09] hover:text-white" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Link>

          {/* breadcrumb */}
          <nav className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-[11.5px]">
            <Link href="/published" className="shrink-0 text-white/35 transition hover:text-white/70">Published</Link>
            <ChevronRight className="h-3 w-3 shrink-0 text-white/20" />
            <span className="shrink-0 capitalize text-white/35">{item.category}</span>
            <ChevronRight className="h-3 w-3 shrink-0 text-white/20" />
            <span className="truncate font-medium text-white/55">{item.title}</span>
          </nav>

          {/* header actions */}
          <div className="flex shrink-0 items-center gap-2">
            {item.canDelete && isRealItem && (
              <button
                type="button"
                onClick={() => setDeleteConfirm(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/[0.07] px-3 text-xs font-semibold text-red-400 transition hover:bg-red-500/[0.14] hover:text-red-300"
                title="Delete this post"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Delete</span>
              </button>
            )}
            <button
              type="button"
              onClick={toggleLike}
              className={`inline-flex h-8 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition ${
                liked ? 'border-rose-500/30 bg-rose-500/10 text-rose-400' : 'border-white/[0.08] bg-white/[0.04] text-white/50 hover:bg-white/[0.09] hover:text-white'
              }`}
            >
              <ThumbsUp className={`h-3.5 w-3.5 transition-transform ${liked ? 'scale-110' : ''}`} />
              <span className="tabular-nums">{likeCount}</span>
            </button>

            <button
              type="button"
              onClick={() => void toggleTrend()}
              className={`inline-flex h-8 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition ${
                trended ? 'border-orange-500/30 bg-orange-500/10 text-orange-400' : 'border-white/[0.08] bg-white/[0.04] text-white/50 hover:bg-white/[0.09] hover:text-orange-400'
              }`}
              title="Mark as trending"
            >
              <TrendingUp className={`h-3.5 w-3.5 transition-transform ${trended ? 'scale-110' : ''}`} />
              <span className="tabular-nums">{trendCount > 0 ? (trendCount >= 1000 ? `${(trendCount / 1000).toFixed(1)}k` : String(trendCount)) : 'Trend'}</span>
            </button>

            <div className="relative" ref={sharePanelRef}>
              <button
                type="button"
                onClick={() => setShowSharePanel(s => !s)}
                className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-xs font-semibold text-white/50 transition hover:bg-white/[0.09] hover:text-white"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Share</span>
              </button>

              {showSharePanel && (
                <div className="absolute right-0 top-10 z-50 w-68 rounded-2xl border border-white/[0.10] bg-[#111114] shadow-[0_24px_60px_rgba(0,0,0,0.7)] backdrop-blur-2xl">
                  <div className="border-b border-white/[0.07] px-4 py-3">
                    <p className="text-xs font-semibold text-white/70">Share this item</p>
                    <p className="mt-0.5 truncate text-[10px] text-white/30">{shareUrl}</p>
                  </div>
                  <div className="space-y-0.5 p-2">
                    <ShareBtn icon={copied ? Check : Copy}         label={copied ? 'Copied!' : 'Copy link'}         accent={copied}      onClick={copyLink} />
                    <ShareBtn icon={Twitter}                        label="Share on X / Twitter"                                          onClick={() => window.open(tweetUrl(),    '_blank')} />
                    <ShareBtn icon={ExternalLink}                   label="Share on LinkedIn"                                             onClick={() => window.open(linkedInUrl(), '_blank')} />
                    <ShareBtn icon={MessageCircle}                  label="Share on WhatsApp"                                             onClick={() => window.open(whatsAppUrl(), '_blank')} />
                    <ShareBtn icon={Mail}                           label="Share via Email"                                               onClick={() => { window.location.href = emailUrl(); }} />
                    <div className="my-1 border-t border-white/[0.06]" />
                    <ShareBtn icon={embedCopied ? Check : Code2}   label={embedCopied ? 'Embed copied!' : 'Copy embed code'} accent={embedCopied} onClick={copyEmbed} />
                    {'share' in navigator && <ShareBtn icon={Share2} label="More options…"                                                onClick={nativeShare} />}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── new category dedicated pages ── */}
      {NEW_CATS.has(item.category) && (
        <div className="max-w-5xl mx-auto w-full">
          {/* hero thumbnail for new-category pages (excluding post which has its own images) */}
          {item.thumbnailUrl && item.category !== 'post' && (
            <div className="relative mb-0 h-52 w-full overflow-hidden sm:h-64 lg:h-72">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.thumbnailUrl} alt={item.title} className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0C] via-[#0A0A0C]/20 to-transparent" />
            </div>
          )}
          <div className="px-4 sm:px-6 lg:px-10 xl:px-14 2xl:px-20 py-8 lg:py-12">
            {item.category === 'post'      && <PostDetailContent      {...sharedCatProps} />}
            {item.category === 'poll'      && <PollDetailContent      {...sharedCatProps} />}
            {item.category === 'survey'    && <SurveyDetailContent    {...sharedCatProps} />}
            {item.category === 'chart'     && <ChartDetailContent     {...sharedCatProps} />}
            {item.category === 'thread'    && <ThreadDetailContent    {...sharedCatProps} />}
            {item.category === 'video'     && <VideoDetailContent     {...sharedCatProps} />}
            {item.category === 'milestone' && <MilestoneDetailContent {...sharedCatProps} />}
            {item.category === 'tutorial'  && <TutorialDetailContent  {...sharedCatProps} />}
          </div>
        </div>
      )}

      {/* ── page body (classic categories only) ── */}
      {!NEW_CATS.has(item.category) && <div className="py-8 lg:py-12">

        {/* ── Hero thumbnail (full-bleed, outside the padded grid) ── */}
        {item.thumbnailUrl && (
          <div className="relative mb-8 h-56 w-full overflow-hidden sm:h-72 lg:h-80 xl:h-96">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.thumbnailUrl}
              alt={item.title}
              className="h-full w-full object-cover"
            />
            {/* gradient overlay — fades to the page background */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0C] via-[#0A0A0C]/30 to-transparent" />
            {/* category chip floated over the image */}
            <div className="absolute bottom-5 left-4 sm:left-8 lg:left-14 xl:left-20 flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold tracking-wide backdrop-blur-sm ${tagCls}`}>
                <CatIcon className="h-3.5 w-3.5" />
                {item.category === 'job' ? 'Job Post' : item.category.charAt(0).toUpperCase() + item.category.slice(1)}
              </span>
              {item.badge && (
                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold backdrop-blur-sm ${tagCls}`}>
                  {item.badge}
                </span>
              )}
              {item.featured && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold text-amber-400 backdrop-blur-sm">
                  ✦ Featured
                </span>
              )}
            </div>
          </div>
        )}

        <div className="px-4 sm:px-6 lg:px-10 xl:px-14 2xl:px-20">
        <div className="grid gap-10 lg:grid-cols-[1fr_320px]">

          {/* ════ LEFT COLUMN ════ */}
          <article className="min-w-0">

            {/* category + badge chips — only when no thumbnail (already shown over image) */}
            {!item.thumbnailUrl && (
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold tracking-wide ${tagCls}`}>
                <CatIcon className="h-3.5 w-3.5" />
                {item.category === 'job' ? 'Job Post' : item.category.charAt(0).toUpperCase() + item.category.slice(1)}
              </span>
              <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold tracking-wide ${tagCls}`}>
                {item.badge}
              </span>
              {item.featured && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold text-amber-400">
                  ✦ Featured
                </span>
              )}
              {item.isReal && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
                </span>
              )}
            </div>
            )}

            {/* moderation status banner */}
            {(item as any).moderationStatus === 'suspended' && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                <span><strong>This item has been suspended</strong> by the moderation team and is not visible to other users.</span>
              </div>
            )}
            {(item as any).moderationStatus === 'under_review' && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                <span>This item is currently <strong>under review</strong> by our moderation team.</span>
              </div>
            )}

            {/* title */}
            <h1 className="mt-5 text-[1.75rem] font-bold leading-[1.2] tracking-[-0.03em] text-white sm:text-[2rem] lg:text-[2.25rem]">
              {item.title}
            </h1>

            {/* byline row */}
            <div className="mt-4 flex flex-col gap-3 border-b border-white/[0.07] pb-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-white/45">{item.byline}</p>
              {/* inline engagement row */}
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={toggleLike}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition ${
                    liked ? 'bg-rose-500/10 text-rose-400' : 'text-white/40 hover:bg-white/[0.06] hover:text-white/80'
                  }`}
                >
                  <ThumbsUp className={`h-4 w-4 ${liked ? 'fill-rose-400/20' : ''} transition-transform ${liked ? 'scale-110' : ''}`} />
                  <span className="tabular-nums">{likeCount}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void toggleTrend()}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition ${
                    trended ? 'bg-orange-500/10 text-orange-400' : 'text-white/40 hover:bg-white/[0.06] hover:text-orange-400'
                  }`}
                  title="Mark as trending"
                >
                  <TrendingUp className={`h-4 w-4 transition-transform ${trended ? 'scale-110' : ''}`} />
                  <span className="tabular-nums">{trendCount > 0 ? trendCount : ''}</span>
                </button>
                <button
                  type="button"
                  onClick={() => commentRef.current?.focus()}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold text-white/40 transition hover:bg-white/[0.06] hover:text-white/80"
                >
                  <MessageCircle className="h-4 w-4" />
                  <span className="tabular-nums">{totalComments}</span>
                </button>
                {/* Analytics icon button */}
                <button
                  type="button"
                  onClick={() => setShowAnalytics(true)}
                  title="Live analytics"
                  className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl transition active:scale-90"
                  style={{ color: showAnalytics ? '#a78bfa' : 'rgba(255,255,255,0.28)',
                    background: showAnalytics ? 'rgba(167,139,250,0.10)' : 'transparent' }}
                >
                  <BarChart3 className="h-4 w-4" />
                  {/* live pulse dot */}
                  <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400"
                    style={{ animation: 'ltc-pulse 2s ease infinite' }} />
                </button>
                <button
                  type="button"
                  onClick={copyLink}
                  title="Copy link"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-white/25 transition hover:bg-white/[0.06] hover:text-white/55"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Link2 className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setReportOpen(true)}
                  title="Report"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-white/25 transition hover:bg-white/[0.06] hover:text-white/55"
                >
                  <Flag className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* mobile: stats (hidden on lg+, shown in sidebar there) */}
            {item.stats && item.stats.length > 0 && (
              <div className="mt-6 grid grid-cols-3 gap-3 lg:hidden">
                {item.stats.map(s => (
                  <div key={s.l} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 text-center">
                    <p className="text-xl font-bold text-white tabular-nums">{s.v}</p>
                    <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-white/30">{s.l}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Product image gallery — renders all images from the HTML gallery dataUrl */}
            {item.category === 'product' && item.mimeType === 'text/html' && item.dataUrl && (() => {
              const imgs = extractImagesFromGalleryHtml(item.dataUrl);
              if (imgs.length === 0) return null;
              return (
                <div className="mt-6">
                  <ImageSlider images={imgs} />
                </div>
              );
            })()}

            {/* body */}
            <div className="mt-7">
              <BodyRenderer body={item.body} category={item.category} />
            </div>

            {/* ── Category CTAs ── */}
            {item.category === 'document' && (() => {
              const isPdf = item.mimeType?.includes('pdf') || item.mimeType === 'application/pdf';
              const isText = item.mimeType?.includes('text') || item.mimeType === 'text/plain';
              return (
                <div className="mt-8 space-y-4">
                  {/* Inline document viewer */}
                  {item.dataUrl && (isPdf || isText) && (
                    <div className="rounded-2xl border border-white/[0.08] overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07] bg-white/[0.02]">
                        <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">Document Preview</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => window.open(item.dataUrl, '_blank')}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.10] bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-white/60 transition hover:bg-white/[0.09] hover:text-white"
                          >
                            <ExternalLink className="h-3 w-3" /> Open in new tab
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const a = document.createElement('a');
                              a.href = item.dataUrl!;
                              a.download = item.title || 'document';
                              a.click();
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[11px] font-bold text-slate-950 transition hover:bg-white/90"
                          >
                            <Download className="h-3 w-3" /> Download
                          </button>
                        </div>
                      </div>
                      {isPdf ? (
                        <iframe
                          src={item.dataUrl}
                          title={item.title}
                          className="w-full"
                          style={{ height: '600px', border: 'none' }}
                        />
                      ) : (
                        <pre className="p-5 text-[13px] leading-relaxed text-white/70 font-mono whitespace-pre-wrap overflow-x-auto max-h-[400px] overflow-y-auto">
                          {(() => {
                            try {
                              const base64 = item.dataUrl!.split(',')[1];
                              return atob(base64);
                            } catch { return item.body || 'Preview not available'; }
                          })()}
                        </pre>
                      )}
                    </div>
                  )}
                  {/* Download button when no inline preview */}
                  {item.dataUrl && !isPdf && !isText && (
                    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/30">Document Actions</p>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            const a = document.createElement('a');
                            a.href = item.dataUrl!;
                            a.download = item.title || 'document';
                            a.click();
                          }}
                          className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-[13px] font-bold text-slate-950 transition hover:bg-white/90 active:scale-[0.98]"
                        >
                          <Download className="h-4 w-4" /> Download
                        </button>
                        <button
                          type="button"
                          onClick={() => window.open(item.dataUrl, '_blank')}
                          className="inline-flex items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.04] px-5 py-2.5 text-[13px] font-semibold text-white/70 transition hover:bg-white/[0.09] hover:text-white"
                        >
                          <Eye className="h-4 w-4" /> Preview
                        </button>
                      </div>
                    </div>
                  )}
                  {!item.dataUrl && (
                    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                      <p className="text-sm text-white/30 italic">No file attached to this document.</p>
                    </div>
                  )}
                </div>
              );
            })()}

            {item.category === 'job' && (() => {
              const applyUrl = item.body?.match(/^Apply URL:\s*(.+)$/im)?.[1]?.trim() || '';
              return applyUrl ? (
                <div className="mt-8 rounded-2xl border border-blue-500/20 bg-blue-500/[0.05] p-5">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-blue-400/60">Apply for this role</p>
                  <a
                    href={applyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-6 py-3 text-[14px] font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-400 active:scale-[0.98]"
                  >
                    Apply Now <ExternalLink className="h-4 w-4" />
                  </a>
                  <p className="mt-2 text-[11px] text-white/30">You will be redirected to the employer's application page</p>
                </div>
              ) : null;
            })()}

            {item.category === 'product' && (() => {
              const shopUrl = item.body?.match(/^Shop URL:\s*(.+)$/im)?.[1]?.trim() || '';
              const whatsapp = item.body?.match(/^WhatsApp:\s*(.+)$/im)?.[1]?.trim() || '';
              if (!shopUrl && !whatsapp) return null;
              return (
                <div className="mt-8 rounded-2xl border border-purple-500/20 bg-purple-500/[0.05] p-5">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-purple-400/60">Get this product</p>
                  <div className="flex flex-wrap gap-3">
                    {shopUrl && (
                      <a
                        href={shopUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl bg-purple-500 px-6 py-3 text-[14px] font-bold text-white shadow-lg shadow-purple-500/20 transition hover:bg-purple-400 active:scale-[0.98]"
                      >
                        <ShoppingBag className="h-4 w-4" /> Shop Now
                      </a>
                    )}
                    {whatsapp && (
                      <a
                        href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-6 py-3 text-[14px] font-bold text-green-400 transition hover:bg-green-500/20 active:scale-[0.98]"
                      >
                        <Phone className="h-4 w-4" /> WhatsApp
                      </a>
                    )}
                  </div>
                </div>
              );
            })()}

            {item.category === 'event' && (
              <EventRegisterCTA
                itemId={item.id}
                initialCount={(item as PublishedItem & { interestedCount?: number }).interestedCount ?? 0}
                initialInterested={(item as PublishedItem & { interestedByViewer?: boolean }).interestedByViewer ?? false}
              />
            )}

            {item.category === 'hackathon' && (
              <HackathonRegisterCTA
                itemId={item.id}
                initialCount={(item as PublishedItem & { interestedCount?: number }).interestedCount ?? 0}
                initialInterested={(item as PublishedItem & { interestedByViewer?: boolean }).interestedByViewer ?? false}
              />
            )}

            {item.category === 'gig' && (() => {
              const applyUrl = item.body?.match(/^Apply URL:\s*(.+)$/im)?.[1]?.trim() || '';
              return applyUrl ? (
                <div className="mt-8 rounded-2xl border border-yellow-500/20 bg-yellow-500/[0.05] p-5">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-yellow-400/60">Apply for this gig</p>
                  <a
                    href={applyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-yellow-500 px-6 py-3 text-[14px] font-bold text-slate-950 shadow-lg shadow-yellow-500/20 transition hover:bg-yellow-400 active:scale-[0.98]"
                  >
                    <Zap className="h-4 w-4" /> Apply Now <ExternalLink className="h-4 w-4" />
                  </a>
                  <p className="mt-2 text-[11px] text-white/30">You will be redirected to the external application page</p>
                </div>
              ) : null;
            })()}

            {/* mobile: chips (hidden on lg+, shown in sidebar there) */}
            {item.chips && item.chips.length > 0 && (
              <div className="mt-7 flex flex-wrap gap-2 lg:hidden">
                {item.chips.map(c => (
                  <span key={c} className="rounded-full border border-white/[0.10] bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-white/60">{c}</span>
                ))}
              </div>
            )}

            {/* ── comments ── */}
            <div className="mt-12 border-t border-white/[0.06] pt-10" id="comments">
              <h2 className="flex items-center gap-2 text-[15px] font-bold text-white">
                <MessageCircle className="h-4 w-4 text-white/35" />
                {totalComments} Comment{totalComments !== 1 ? 's' : ''}
              </h2>

              {/* comment input */}
              <div className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                <div className="mb-3 flex items-center gap-2.5">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${stableColor(displayName)}`}>
                    {initials(displayName)}
                  </div>
                  <span className="text-[13px] font-semibold text-white/70">{displayName}</span>
                </div>
                <textarea
                  ref={commentRef}
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submitComment(); }}
                  placeholder="Add a comment… (⌘↵ to post)"
                  rows={2}
                  className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white placeholder:text-white/20 outline-none transition focus:border-white/[0.18] focus:bg-white/[0.06]"
                />
                <div className="mt-2.5 flex items-center justify-between">
                  <p className="text-[10px] text-white/20">All comments are public</p>
                  <button
                    type="button"
                    onClick={() => void submitComment()}
                    disabled={!commentText.trim()}
                    className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-white px-4 text-xs font-bold text-slate-950 shadow-sm transition hover:bg-white/90 disabled:opacity-25 active:scale-95"
                  >
                    <Send className="h-3 w-3" /> Post
                  </button>
                </div>
              </div>

              {/* comment list */}
              <div className="mt-6 space-y-5">
                {comments.length === 0 ? (
                  <div className="py-10 text-center">
                    <MessageCircle className="mx-auto h-8 w-8 text-white/[0.08]" />
                    <p className="mt-3 text-sm text-white/25">No comments yet. Be the first.</p>
                  </div>
                ) : (

                  comments.map(c => (
                    <CommentItem
                      key={c.id}
                      comment={c}
                      onLike={() => void likeComment(c.id)}
                      onReply={() => { setReplyTo(replyTo === c.id ? null : c.id); setReplyText(''); }}
                      replyOpen={replyTo === c.id}
                      replyText={replyText}
                      onReplyTextChange={setReplyText}
                      onSubmitReply={() => void submitReply(c.id)}
                      onLikeReply={rid => void likeComment(rid, c.id)}
                      onDelete={() => void deleteComment(c.id)}
                      deleting={deletingCommentId === c.id}
                      onDeleteReply={rid => void deleteComment(rid)}
                      deletingReplyId={deletingCommentId}
                    />
                  ))
                )}
              </div>
            </div>
          </article>

          {/* ════ RIGHT SIDEBAR ════ */}
          <aside className="hidden lg:block">
            <div className="sticky top-[57px] space-y-4">

              {/* stats card */}
              {item.stats && item.stats.length > 0 && (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
                  <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">Stats</p>
                  <div className="grid grid-cols-3 gap-2">
                    {item.stats.map(s => (
                      <div key={s.l} className="rounded-xl bg-white/[0.04] p-3 text-center">
                        <p className="text-[15px] font-bold text-white tabular-nums leading-none">{s.v}</p>
                        <p className="mt-1.5 text-[8.5px] font-semibold uppercase tracking-[0.14em] text-white/30">{s.l}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Accordion sidebar tabs ── */}
              <SidebarAccordion defaultOpen="engagement">
                {item.chips && item.chips.length > 0 && (
                  <SidebarTab id="tags" label="Tags" badge={item.chips.length}>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {item.chips.map(c => (
                        <span key={c} className="rounded-lg border border-white/[0.09] bg-white/[0.04] px-2.5 py-1 text-[11.5px] font-medium text-white/55">{c}</span>
                      ))}
                    </div>
                  </SidebarTab>
                )}

                <SidebarTab id="share" label="Share">
                  <div className="space-y-1.5 pt-1">
                    <SideShareBtn icon={copied ? Check : Link2}          label={copied ? 'Copied!' : 'Copy link'} onClick={copyLink}                                        accent={copied} />
                    <SideShareBtn icon={Twitter}                         label="X / Twitter"                      onClick={() => window.open(tweetUrl(),    '_blank')} />
                    <SideShareBtn icon={ExternalLink}                    label="LinkedIn"                         onClick={() => window.open(linkedInUrl(), '_blank')} />
                    <SideShareBtn icon={MessageCircle}                   label="WhatsApp"                         onClick={() => window.open(whatsAppUrl(), '_blank')} />
                    <SideShareBtn icon={Mail}                            label="Email"                            onClick={() => { window.location.href = emailUrl(); }} />
                    <SideShareBtn icon={embedCopied ? Check : Code2}     label={embedCopied ? 'Embed copied!' : 'Embed'} onClick={copyEmbed}                        accent={embedCopied} />
                  </div>
                </SidebarTab>

                <SidebarTab id="analytics" label="Analytics">
                  <div className="pt-1">
                    <LiveTrendChart
                      itemId={item.id}
                      isReal={isRealItem}
                      likeCount={likeCount}
                      trendCount={trendCount}
                      commentCount={totalComments}
                      viewCount={viewCount}
                      postedAt={item.postedAt}
                    />
                  </div>
                </SidebarTab>

                <SidebarTab id="engagement" label="Engagement" badge={likeCount + trendCount + totalComments || undefined}>
                  <div className="space-y-2 pt-1">
                    <button
                      type="button"
                      onClick={toggleLike}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                        liked ? 'bg-rose-500/10 text-rose-400' : 'border border-white/[0.07] bg-white/[0.03] text-white/50 hover:bg-white/[0.07] hover:text-white'
                      }`}
                    >
                      <span className="flex items-center gap-2"><ThumbsUp className="h-4 w-4" />{liked ? 'Liked' : 'Like'}</span>
                      <span className="tabular-nums text-xs">{likeCount}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleTrend()}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                        trended ? 'bg-orange-500/10 text-orange-400' : 'border border-white/[0.07] bg-white/[0.03] text-white/50 hover:bg-white/[0.07] hover:text-orange-400'
                      }`}
                    >
                      <span className="flex items-center gap-2"><TrendingUp className="h-4 w-4" />{trended ? 'Trending' : 'Trend'}</span>
                      <span className="tabular-nums text-xs">{trendCount > 0 ? trendCount : ''}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => commentRef.current?.focus()}
                      className="flex w-full items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 text-sm font-semibold text-white/50 transition hover:bg-white/[0.07] hover:text-white"
                    >
                      <span className="flex items-center gap-2"><MessageCircle className="h-4 w-4" />Comment</span>
                      <span className="tabular-nums text-xs">{totalComments}</span>
                    </button>
                  </div>
                </SidebarTab>

                {related.length > 0 && (
                  <SidebarTab id="related" label="Related" badge={related.length}>
                    <div className="space-y-2 pt-1">
                      {related.map(r => {
                        const rcls = TAG_CLS[r.category] ?? 'bg-white/10 text-white/70 border-white/10';
                        return (
                          <Link
                            key={r.id}
                            href={`/published/${r.id}`}
                            className="group flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition hover:border-white/[0.12] hover:bg-white/[0.05]"
                          >
                            <span className={`mt-0.5 shrink-0 inline-flex items-center rounded-lg border px-1.5 py-0.5 text-[8.5px] font-bold tracking-wide ${rcls}`}>
                              {r.badge.length > 10 ? r.badge.slice(0, 10) + '…' : r.badge}
                            </span>
                            <p className="line-clamp-2 text-[12px] font-semibold leading-snug text-white/65 group-hover:text-white/90 transition-colors">
                              {r.title}
                            </p>
                          </Link>
                        );
                      })}
                      <Link href="/published" className="mt-1 flex items-center gap-1 text-[11px] font-medium text-white/30 transition hover:text-white/60">
                        Browse all <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </SidebarTab>
                )}
              </SidebarAccordion>
            </div>
          </aside>
        </div>
        </div>{/* /px-4 wrapper */}
      </div>}

      {/* ── Analytics drawer — right panel on desktop, bottom sheet on mobile ── */}
      {item && showAnalytics && typeof document !== 'undefined' && createPortal(
        <AnalyticsDrawer
          onClose={() => setShowAnalytics(false)}
          isRealItem={isRealItem}
          itemId={item.id}
          title={item.title}
          likeCount={likeCount}
          trendCount={trendCount}
          totalComments={totalComments}
          viewCount={viewCount}
          postedAt={item.postedAt}
        />,
        document.body
      )}

            {toastNode}

      {/* ── report modal ── */}
      {reportOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={() => { if (!reportSending) { setReportOpen(false); setReportReason(''); setReportDetail(''); setReportDone(false); setReportError(''); } }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden />
          <div className="relative w-full max-w-sm rounded-2xl border border-white/[0.08] bg-[#111114] p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">Report this item</h3>
              <button onClick={() => { setReportOpen(false); setReportReason(''); setReportDetail(''); setReportDone(false); setReportError(''); }} className="text-white/30 transition hover:text-white" disabled={reportSending}><X className="h-4 w-4" /></button>
            </div>

            {reportDone ? (
              <div className="py-6 text-center space-y-3">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
                  <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </div>
                <p className="text-sm text-white font-medium">Report submitted</p>
                <p className="text-xs text-white/40">Our moderation team will review this item. Thank you for helping keep the platform safe.</p>
                <button onClick={() => { setReportOpen(false); setReportDone(false); setReportReason(''); setReportDetail(''); }} className="mt-2 text-xs text-white/40 hover:text-white transition">Close</button>
              </div>
            ) : (
              <>
                <p className="text-xs text-white/40 mb-3">Why are you reporting this item?</p>
                <div className="space-y-1.5">
                  {['Misinformation / inaccurate content','Spam or duplicate','Inappropriate or offensive','Copyright violation','Harassment or abuse','Other'].map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setReportReason(r)}
                      className={`flex w-full items-center rounded-xl border px-4 py-3 text-left text-sm transition ${reportReason === r ? 'border-amber-500/40 bg-amber-500/10 text-white' : 'border-white/[0.06] bg-white/[0.03] text-white/55 hover:bg-white/[0.08] hover:text-white'}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                {reportReason && (
                  <textarea
                    value={reportDetail}
                    onChange={(e) => setReportDetail(e.target.value)}
                    placeholder="Optional: add more details…"
                    rows={2}
                    maxLength={500}
                    className="mt-3 w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/40 resize-none"
                  />
                )}
                {reportError && <p className="mt-2 text-xs text-red-400">{reportError}</p>}
                <button
                  type="button"
                  disabled={!reportReason || reportSending}
                  onClick={async () => {
                    if (!reportReason || !item) return;
                    setReportSending(true); setReportError('');
                    try {
                      const res = await fetch(`/api/public/published/${item.id}/report`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ reason: reportReason, detail: reportDetail }),
                      });
                      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
                      setReportDone(true);
                    } catch (e) {
                      setReportError(e instanceof Error ? e.message : 'Failed to submit. Try again.');
                    } finally { setReportSending(false); }
                  }}
                  className="mt-4 w-full rounded-xl bg-red-500/80 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {reportSending && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {reportSending ? 'Submitting…' : 'Submit Report'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── AnalyticsDrawer ───────────────────────────────────────────── */
function AnalyticsDrawer({
  onClose, isRealItem, itemId, title, likeCount, trendCount, totalComments, viewCount, postedAt,
}: {
  onClose: () => void; isRealItem: boolean; itemId: string; title: string;
  likeCount: number; trendCount: number; totalComments: number; viewCount: number; postedAt: string;
}) {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const panelStyle: CSSProperties = isDesktop
    ? {
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 420,
        background: 'linear-gradient(160deg,#0c0c13 0%,#07070f 100%)',
        borderLeft: '1px solid rgba(255,255,255,0.09)',
        boxShadow: '-32px 0 80px rgba(0,0,0,0.60), inset 1px 0 0 rgba(255,255,255,0.04)',
        animation: 'ltc-slidein 0.26s cubic-bezier(0.22,1,0.36,1) both',
        display: 'flex', flexDirection: 'column', zIndex: 310,
        overflow: 'hidden',
      }
    : {
        position: 'fixed', bottom: 0, left: 0, right: 0,
        maxHeight: '92svh',
        background: 'linear-gradient(170deg,#0c0c13 0%,#07070f 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderBottom: 'none',
        borderRadius: '24px 24px 0 0',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 -32px 80px rgba(0,0,0,0.65)',
        animation: 'ltc-sheetup 0.28s cubic-bezier(0.22,1,0.36,1) both',
        display: 'flex', flexDirection: 'column', zIndex: 310,
        overflow: 'hidden',
      };

  return (
    <>
      <style>{`
        @keyframes ltc-sheetup{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:none}}
        @keyframes ltc-slidein{from{opacity:0;transform:translateX(28px)}to{opacity:1;transform:none}}
      `}</style>

      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[305]"
        style={{ background: isDesktop ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)', WebkitTapHighlightColor: 'transparent' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div style={panelStyle} onClick={e => e.stopPropagation()}>
        {/* Ambient glow — desktop only */}
        {isDesktop && (
          <div style={{ position:'absolute',top:-120,right:-60,width:300,height:300,borderRadius:'50%',
            background:'radial-gradient(circle,rgba(139,92,246,0.07) 0%,transparent 70%)',pointerEvents:'none' }} />
        )}

        {/* Drag handle — mobile only */}
        {!isDesktop && (
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div style={{ width: 36, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.15)' }} />
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between flex-shrink-0"
          style={{ padding: isDesktop ? '20px 20px 16px' : '8px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0 flex items-center justify-center rounded-xl overflow-hidden"
              style={{ width: 38, height: 38, background: 'linear-gradient(135deg,rgba(139,92,246,0.22) 0%,rgba(99,102,241,0.14) 100%)', border: '1px solid rgba(139,92,246,0.30)' }}>
              <BarChart3 style={{ width: 17, height: 17, color: '#a78bfa', position: 'relative', zIndex: 1 }} />
              <div style={{ position:'absolute',inset:0,background:'radial-gradient(circle at 65% 25%,rgba(167,139,250,0.22),transparent 65%)' }} />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em', lineHeight: 1 }}>Post Analytics</p>
              <div className="flex items-center gap-1.5" style={{ marginTop: 5 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#34d399', flexShrink: 0, animation: 'ltc-pulse 1.8s ease infinite', display: 'inline-block' }} />
                <p style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.32)', letterSpacing: '0.04em' }}>
                  {isRealItem ? 'LIVE · every 5s' : 'SESSION DATA'}&ensp;
                  <span style={{ color: 'rgba(255,255,255,0.18)' }}>· {title.slice(0, 24)}{title.length > 24 ? '…' : ''}</span>
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center flex-shrink-0 transition-all hover:scale-105 active:scale-90"
            style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
          >
            <X style={{ width: 15, height: 15, color: 'rgba(255,255,255,0.38)' }} />
          </button>
        </div>

        {/* Chart body */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '16px', scrollbarWidth: 'none' }}>
          <LiveTrendChart
            itemId={`${itemId}-sheet`}
            isReal={isRealItem}
            likeCount={likeCount}
            trendCount={trendCount}
            commentCount={totalComments}
            viewCount={viewCount}
            postedAt={postedAt}
            compact={false}
          />
          <div style={{ height: 'max(20px, env(safe-area-inset-bottom))' }} />
        </div>
      </div>
    </>
  );
}

/* ─── SidebarAccordion ──────────────────────────────────────────── */
function SidebarAccordion({ children, defaultOpen }: { children: React.ReactNode; defaultOpen?: string }) {
  const [open, setOpen] = useState<string | null>(defaultOpen ?? null);
  return (
    <div className="rounded-2xl border border-white/[0.08] overflow-hidden" style={{ background: 'rgba(255,255,255,0.025)' }}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return null;
        const id = (child.props as { id: string }).id;
        return React.cloneElement(child as React.ReactElement<SidebarTabProps>, {
          isOpen: open === id,
          onToggle: () => setOpen(prev => prev === id ? null : id),
        });
      })}
    </div>
  );
}

type SidebarTabProps = {
  id: string; label: string; badge?: number; children: React.ReactNode;
  isOpen?: boolean; onToggle?: () => void;
};
function SidebarTab({ label, badge, children, isOpen = false, onToggle }: SidebarTabProps) {
  return (
    <div className="border-b border-white/[0.06] last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/[0.03] active:bg-white/[0.05]"
      >
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: isOpen ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.38)' }}>
            {label}
          </span>
          {badge !== undefined && (
            <span className="rounded-full px-1.5 py-px text-[9px] font-bold tabular-nums leading-none"
              style={{ background: isOpen ? 'rgba(167,139,250,0.18)' : 'rgba(255,255,255,0.07)', color: isOpen ? '#c4b5fd' : 'rgba(255,255,255,0.28)' }}>
              {badge}
            </span>
          )}
        </div>
        <ChevronDown
          className="h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200"
          style={{ color: 'rgba(255,255,255,0.25)', transform: isOpen ? 'rotate(180deg)' : 'none' }}
        />
      </button>
      {isOpen && (
        <div className="px-4 pb-4" style={{ animation: 'sidebar-tab-in 0.18s cubic-bezier(0.22,1,0.36,1) both' }}>
          <style>{`@keyframes sidebar-tab-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}`}</style>
          {children}
        </div>
      )}
    </div>
  );
}

/* ─── sub-components ────────────────────────────────────────────── */
function ShareBtn({ icon: Icon, label, onClick, accent }: { icon: React.ElementType; label: string; onClick: () => void; accent?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
        accent ? 'bg-emerald-500/10 text-emerald-400' : 'text-white/55 hover:bg-white/[0.06] hover:text-white'
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </button>
  );
}

function SideShareBtn({ icon: Icon, label, onClick, accent }: { icon: React.ElementType; label: string; onClick: () => void; accent?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs font-medium transition ${
        accent
          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
          : 'border-white/[0.07] bg-white/[0.03] text-white/50 hover:bg-white/[0.07] hover:text-white'
      }`}
    >
      <span className="flex items-center gap-2"><Icon className="h-3.5 w-3.5" />{label}</span>
      <ArrowRight className="h-3 w-3 opacity-30" />
    </button>
  );
}

function CommentItem({
  comment: c, onLike, onReply, replyOpen, replyText,
  onReplyTextChange, onSubmitReply, onLikeReply, onDelete, deleting,
  onDeleteReply, deletingReplyId,
}: {
  comment: Comment; onLike: () => void; onReply: () => void;
  replyOpen: boolean; replyText: string;
  onReplyTextChange: (v: string) => void;
  onSubmitReply: () => void; onLikeReply: (id: string) => void;
  onDelete?: () => void; deleting?: boolean;
  onDeleteReply?: (id: string) => void; deletingReplyId?: string | null;
}) {
  return (
    <div className="flex gap-3">
      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${c.color}`}>
        {c.initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-white/80">{c.author}</span>
          <span className="text-[10px] text-white/25">{timeAgo(c.timestamp)}</span>
        </div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-white/60">{c.text}</p>
        <div className="mt-2 flex items-center gap-3">
          <button type="button" onClick={onLike} className={`inline-flex items-center gap-1 text-[11px] font-semibold transition ${c.likedByMe ? 'text-rose-400' : 'text-white/25 hover:text-white/65'}`}>
            <Heart className={`h-3 w-3 ${c.likedByMe ? 'fill-rose-400' : ''}`} />
            {c.likes > 0 && <span className="tabular-nums">{c.likes}</span>}
          </button>
          <button type="button" onClick={onReply} className="text-[11px] font-semibold text-white/25 transition hover:text-white/65">Reply</button>
          {c.isOwner && onDelete && (
            <button
              type="button"
              disabled={deleting}
              onClick={onDelete}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/25 transition hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
              title="Delete comment"
              aria-label="Delete comment"
            >
              {deleting ? (
                <span className="h-3 w-3 animate-spin rounded-full border border-white/20 border-t-red-400" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
              Delete
            </button>
          )}
        </div>

        {replyOpen && (
          <div className="mt-3">
            <div className="flex gap-2">
              <textarea
                value={replyText}
                onChange={e => onReplyTextChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSubmitReply(); }}
                placeholder="Write a reply…"
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
          </div>
        )}

        {c.replies.length > 0 && (
          <div className="mt-4 space-y-3 border-l border-white/[0.06] pl-4">
            {c.replies.map(r => (
              <div key={r.id} className="flex gap-3">
                <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${r.color}`}>{r.initials}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-white/75">{r.author}</span>
                    <span className="text-[10px] text-white/25">{timeAgo(r.timestamp)}</span>
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-white/55">{r.text}</p>
                  <div className="mt-1.5 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => onLikeReply(r.id)}
                      className={`inline-flex items-center gap-1 text-[10px] font-semibold transition ${r.likedByMe ? 'text-rose-400' : 'text-white/20 hover:text-white/55'}`}
                    >
                      <Heart className={`h-2.5 w-2.5 ${r.likedByMe ? 'fill-rose-400' : ''}`} />
                      {r.likes > 0 && <span className="tabular-nums">{r.likes}</span>}
                    </button>
                    {r.isOwner && onDeleteReply && (
                      <button
                        type="button"
                        disabled={deletingReplyId === r.id}
                        onClick={() => onDeleteReply(r.id)}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-white/20 transition hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Delete reply"
                        aria-label="Delete reply"
                      >
                        {deletingReplyId === r.id ? (
                          <span className="h-2.5 w-2.5 animate-spin rounded-full border border-white/20 border-t-red-400" />
                        ) : (
                          <Trash2 className="h-2.5 w-2.5" />
                        )}
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
