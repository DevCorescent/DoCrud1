/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import { applyColorMode, getStoredColorMode } from '@/app/components/ThemeController';
import { PresenceDot } from '@/components/PresenceBadge';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Image as ImageIcon,
  SlidersHorizontal,
  Award,
  BarChart2,
  Bookmark,
  BookMarked,
  BookOpen,
  Briefcase,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Crown,
  Eye,
  FileSignature,
  FileText,
  FolderLock,
  FormInput,

  Heart,
  Globe,
  HelpCircle,
  Home,
  LayoutGrid,
  ListChecks,
  Loader2,
  LockKeyhole,
  LogOut,
  Layers,
  Megaphone,
  Medal,
  Menu,
  MessageCircle,
  MessageSquare,
  Mic,
  Music,
  Newspaper,
  Package,
  Paperclip,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Share2,
  Sheet,
  Sparkles,
  Star,
  Terminal,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
  Trophy,
  User,
  UserPlus,
  Users,
  Video,
  Wand2,
  X,
  Zap,
  MapPin,
  Target,
  Clock,
  Tag,
  Info,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import HomepageNav from '@/components/HomepageNav';
import { AssistantResultCardView } from '@/components/home-chat/AssistantResultCard';
import type { DocumentHistory } from '@/types/document';
import type { AssistantResultCard, DocumentQuickAction, UploadedDocument } from '@/types/doc-assistant';
import { fireSearchEvent, SEARCH_CONTEXTS } from '@/lib/search-tracking';

// Heavy modal components — loaded only when first opened, not part of the initial bundle
const QuickFileEditorDialog = dynamic(() => import('@/components/QuickFileEditorDialog'), { ssr: false });
const PublishAnythingDialog  = dynamic(() => import('@/components/PublishAnythingDialog'),  { ssr: false });
const RecentsBar             = dynamic(() => import('@/components/Recents'),                { ssr: false });
const FileTransferCenter     = dynamic(() => import('@/components/FileTransferCenter'),     { ssr: false });
const PdfStudio              = dynamic(() => import('@/components/PdfStudio'),              { ssr: false });
const FormsCenter            = dynamic(() => import('@/components/FormsCenter'),            { ssr: false });
const ScratchpadCenter       = dynamic(() => import('@/components/ScratchpadCenter'),       { ssr: false });
const DocSheetCenter         = dynamic(() => import('@/components/DocSheetCenter'),         { ssr: false });
const DocumentVisualizerModal = dynamic(() => import('@/components/DocumentVisualizerModal'), { ssr: false });
const ESignStudioModal       = dynamic(() => import('@/components/ESignStudioModal'),       { ssr: false });
const FileDriveCenter        = dynamic(() => import('@/components/FileDriveCenter'),        { ssr: false });

type HPSectionVisibility = {
  recentsBar: boolean; heroBanner: boolean; featureCards: boolean;
  publishHeading: boolean; contentDiscovery: boolean; adBanners: boolean;
  gigsGrid: boolean; leaderboards: boolean; builtInIndia: boolean; footer: boolean;
};
type HPConfig = {
  sections: HPSectionVisibility;
  hero: { slotWords: {word:string;subtitle:string;color:string}[]; backgroundImage:string; guestCtaPrimary:string; guestCtaSecondary:string; authCtaPrimary:string; authCtaSecondary:string };
  nav: { logoText:string; logoUrl:string; links:{id:string;label:string;href:string;visible:boolean;order:number}[]; showSignIn:boolean; showSignUp:boolean };
  featureCards: { guestFeatureIds:string[]; defaultFeatureIds:string[] };
  contentDiscovery: { tabs:{id:string;label:string;visible:boolean;order:number}[] };
  footer: { columns:{id:string;title:string;links:{label:string;href:string;visible:boolean}[]}[]; securityBadges:{label:string;visible:boolean}[]; tagline:string; madeIn:string; copyrightEntity:string };
  announcementBanner: {id:string;text:string;ctaLabel:string;ctaHref:string;style:'info'|'warning'|'success'|'promo';active:boolean} | null;
  seoTitle:string; seoDescription:string; updatedAt:string;
};
const DEFAULT_HP_SECTIONS: HPSectionVisibility = {
  recentsBar:true, heroBanner:true, featureCards:true, publishHeading:true,
  contentDiscovery:true, adBanners:true, gigsGrid:false, leaderboards:false,
  builtInIndia:true, footer:true,
};

interface PublicHomepageProps {
  softwareName: string;
  accentLabel: string;
  guestMode?: boolean;
}

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  sources?: Array<{ title: string; href: string; description?: string; badge?: string; category?: string }>;
  card?: AssistantResultCard;
  requestMeta?: { message: string; action?: DocumentQuickAction };
};

type ChatThreadSummary = {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  messageCount: number;
  preview: string;
};

const sidebarNav = [
  { label: 'AI Chat', href: '/', Icon: Sparkles, group: 'Workspace' },
  { label: 'Documents', href: '/docword', Icon: FileText, group: 'Workspace' },
  { label: 'My Profile', href: '/profile', Icon: User, group: 'Workspace' },
  { label: 'PDF Editor', href: '/pdf-editor', Icon: Wand2, group: 'Tools' },
  { label: 'Forms', href: '/forms', Icon: FormInput, group: 'Tools' },
  { label: 'Visualizer', href: '/visualizer', Icon: LayoutGrid, group: 'Tools' },
  { label: 'Secure Sharing', href: '#', Icon: FolderLock, group: 'Security' },
  { label: 'E‑Sign', href: '/workspace?tab=generate', Icon: FileSignature, group: 'Security' },
  { label: 'People', href: '/people', Icon: Users, group: 'Discover' },
  { label: 'Public Faces', href: '/people', Icon: Users, group: 'Discover' },
] as const;

const welcomeCards = [
  {
    title: 'The Draft Whisperer',
    description: 'Banish writer\'s block. Create iron-clad NDAs, offers, or invoices in seconds.',
    Icon: FileText,
    prompt: 'Draft a professional offer letter for a software engineer (3 years experience) with CTC, joining date, probation, and benefits.',
  },
  {
    title: 'The PDF Decoder',
    description: 'Stop scanning, start knowing. Get key insights and risks from long docs instantly.',
    Icon: Wand2,
    prompt: 'Summarize this contract and list key risks, missing clauses, and what I should negotiate.',
  },
  {
    title: 'The Form Architect',
    description: 'Build beautiful, shareable forms to collect data and approvals with ease.',
    Icon: FormInput,
    prompt: 'Create a client onboarding form with contact details, GST, billing address, project scope, and file upload checklist.',
  },
  {
    title: 'The Data Miner',
    description: 'Dig deep. Extract tables, dates, and line items from any image or file.',
    Icon: Search,
    prompt: 'Extract all line items, the total amount, and vendor details from this invoice image and format as a table.',
  },
  {
    title: 'The Sign-Off Hero',
    description: 'Close deals faster with integrated, secure digital signature workflows.',
    Icon: FileSignature,
    prompt: 'Set up this NDA for two signers (Me and the Client). Add signature fields at the bottom.',
  },
  {
    title: 'The Vault Keeper',
    description: 'Send sensitive files with military-grade encryption and auto-expiry.',
    Icon: FolderLock,
    prompt: 'Send this sensitive report with password protection and set it to expire in 24 hours.',
  },
] as const;

/* ─── Quick-action feature definitions ───────────────────────── */
const ALL_QUICK_FEATURES = [
  // href: real route to navigate | modal: key to open an on-page modal | null = not applicable
  { id: 'docword',    label: 'DocWord',    desc: 'AI document editor, proposals & drafts',    Icon: FileText,      href: '/docword',                  modal: null,          ic: '#60a5fa', ib: 'rgba(59,130,246,0.14)',   bd: 'rgba(59,130,246,0.20)'  },
  { id: 'docsheets',  label: 'DocSheets',  desc: 'Smart spreadsheets with AI-powered formulas', Icon: Sheet,        href: null,                        modal: 'docsheets',   ic: '#34d399', ib: 'rgba(52,211,153,0.14)',  bd: 'rgba(52,211,153,0.20)'  },
  { id: 'esign',      label: 'E-Sign',     desc: 'Digital signatures & contract workflows',   Icon: FileSignature, href: null,                        modal: 'esign',       ic: '#a78bfa', ib: 'rgba(139,92,246,0.14)', bd: 'rgba(139,92,246,0.20)'  },
  { id: 'pdf',        label: 'PDF Editor', desc: 'Edit, merge, annotate & convert PDFs',      Icon: Wand2,         href: null,                        modal: 'pdf',         ic: '#f87171', ib: 'rgba(239,68,68,0.12)',   bd: 'rgba(239,68,68,0.18)'   },
  { id: 'scratchpad', label: 'Scratchpad', desc: 'Quick notes, ideas & personal drafts',      Icon: PenLine,       href: null,                        modal: 'scratchpad',  ic: '#fbbf24', ib: 'rgba(245,158,11,0.14)', bd: 'rgba(245,158,11,0.20)'  },
  { id: 'people',     label: 'People',     desc: 'Discover & connect with professionals',     Icon: Users,         href: '/people',                   modal: null,          ic: '#4ade80', ib: 'rgba(74,222,128,0.14)', bd: 'rgba(74,222,128,0.20)'  },
  { id: 'messages',   label: 'Messages',   desc: 'Chat & collaborate with connections',        Icon: MessageCircle, href: '/messages',                 modal: null,          ic: '#93c5fd', ib: 'rgba(56,189,248,0.14)', bd: 'rgba(56,189,248,0.20)'  },
  { id: 'gigs',       label: 'Gigs',       desc: 'Find & post freelance opportunities',        Icon: Zap,           href: '/gigs',                     modal: null,          ic: '#facc15', ib: 'rgba(250,204,21,0.14)', bd: 'rgba(250,204,21,0.20)'  },
  { id: 'talent',     label: 'Talent',     desc: 'Hire top professionals for your project',   Icon: Star,          href: '/talent',                   modal: null,          ic: '#f472b6', ib: 'rgba(244,114,182,0.14)',bd: 'rgba(244,114,182,0.20)' },
  { id: 'publish',    label: 'Publish',    desc: 'Share news, articles, portfolios & more',   Icon: Send,          href: null,                        modal: 'publish',     ic: '#fb923c', ib: 'rgba(251,146,60,0.14)', bd: 'rgba(251,146,60,0.20)'  },
  { id: 'explore',    label: 'Explore',    desc: 'Browse community posts & insights',         Icon: Newspaper,     href: '/published',                modal: null,          ic: '#22d3ee', ib: 'rgba(34,211,238,0.12)', bd: 'rgba(34,211,238,0.18)'  },
  { id: 'portfolio',  label: 'Portfolio',  desc: 'Showcase your work & achievements',         Icon: Layers,        href: '/published?tab=portfolio',  modal: null,          ic: '#c084fc', ib: 'rgba(192,132,252,0.14)',bd: 'rgba(192,132,252,0.20)' },
];
type QuickFeature = typeof ALL_QUICK_FEATURES[number];
const GUEST_FEATURE_IDS   = ['docword', 'docsheets', 'pdf',   'people']   as const;
const DEFAULT_FEATURE_IDS = ['docword', 'docsheets', 'esign', 'gigs']     as const;
const USAGE_LS_KEY = 'docrud_qf_usage_v1';

/* ─── New professionals data ─────────────────────────────────── */
const NEW_PROFESSIONALS = [
  { id: 'np1', name: 'Ananya Verma', role: 'Product Designer', timeAgo: '2h ago', avatar: 'AV', avatarBg: 'from-pink-500 to-rose-600', online: true, skills: ['UI/UX', 'Figma', 'Design Systems'] },
  { id: 'np2', name: 'Rohit Sharma', role: 'Full Stack Developer', timeAgo: '4h ago', avatar: 'RS', avatarBg: 'from-blue-500 to-indigo-600', online: true, skills: ['Next.js', 'TypeScript', 'PostgreSQL'] },
  { id: 'np3', name: 'Meera Nair', role: 'Content Strategist', timeAgo: '6h ago', avatar: 'MN', avatarBg: 'from-purple-500 to-violet-600', online: false, skills: ['Content', 'SEO', 'Analytics'] },
  { id: 'np4', name: 'Karthik Iyer', role: 'UX Writer', timeAgo: '8h ago', avatar: 'KI', avatarBg: 'from-orange-500 to-amber-600', online: false, skills: ['UX Writing', 'Docs', 'Research'] },
  { id: 'np5', name: 'Sneha Patel', role: 'Motion Designer', timeAgo: '10h ago', avatar: 'SP', avatarBg: 'from-red-500 to-rose-600', online: false, skills: ['After Effects', 'Lottie', 'Animation'] },
  { id: 'np6', name: 'Dev Malhotra', role: 'AI Engineer', timeAgo: '12h ago', avatar: 'DM', avatarBg: 'from-teal-500 to-emerald-600', online: true, skills: ['Python', 'LLMs', 'MLOps'] },
] as const;

/* ─── Feed categories & feed data ───────────────────────────── */
const FEED_CATEGORIES = ['All', 'Design', 'Development', 'Writing', 'Marketing', 'Productivity', 'AI Tools', 'Career'] as const;

const FEEDS_DATA = [
  {
    id: 'fd1', category: 'Design', catCls: 'text-pink-400 bg-pink-500/[0.12] border-pink-500/[0.20]',
    title: 'Design Systems Best Practices',
    description: 'Create consistent and scalable design systems.',
    author: 'Riya Singh', authorAv: 'RS', authorBg: 'from-pink-500 to-rose-600',
    views: '2.3K', likes: '1.2K', comments: 24,
    ilk: 'design',
  },
  {
    id: 'fd2', category: 'Development', catCls: 'text-emerald-400 bg-emerald-500/[0.12] border-emerald-500/[0.20]',
    title: 'Building Scalable Web Apps',
    description: 'Modern architectures for modern problems.',
    author: 'Arjun Dev', authorAv: 'AD', authorBg: 'from-blue-500 to-indigo-600',
    views: '3.7K', likes: '1.6K', comments: 36,
    ilk: 'code',
  },
  {
    id: 'fd3', category: 'Writing', catCls: 'text-blue-400 bg-blue-500/[0.12] border-blue-500/[0.20]',
    title: 'UX Writing That Converts',
    description: 'Words that guide, engage and convert.',
    author: 'Diya Thomas', authorAv: 'DT', authorBg: 'from-sky-500 to-blue-600',
    views: '1.8K', likes: '1.1K', comments: 18,
    ilk: 'writing',
  },
  {
    id: 'fd4', category: 'AI Tools', catCls: 'text-amber-400 bg-amber-500/[0.12] border-amber-500/[0.20]',
    title: 'AI Tools Roundup',
    description: 'Top AI tools to boost your workflow.',
    author: 'Neel Mehta', authorAv: 'NM', authorBg: 'from-amber-500 to-orange-600',
    views: '2.9K', likes: '1.4K', comments: 27,
    ilk: 'ai',
  },
] as const;

/* ─── Trust logos ────────────────────────────────────────────── */
const TRUST_LOGOS = [
  { name: 'Google', svg: 'G', color: '#4285F4' },
  { name: 'Microsoft', svg: 'M', color: '#00A4EF' },
  { name: 'Amazon', svg: 'A', color: '#FF9900' },
  { name: 'Adobe', svg: 'Ae', color: '#FF0000' },
  { name: 'Notion', svg: 'N', color: '#ffffff' },
  { name: 'Spotify', svg: 'S', color: '#1DB954' },
] as const;

/* ─── publish showcase data (India-based) ───────────────────── */
const PUBLISH_SHOWCASE = [
  {
    id: 'news', label: 'News', icon: Newspaper, cta: 'Publish a story',
    tagCls: 'bg-red-500/10 text-red-400 border-red-500/20',
    main: {
      badge: 'Breaking', title: 'Reliance Jio Launches JioSpace Satellite Internet Across 1,200 Rural Districts',
      byline: 'Economic Times · 5 min read · Just now',
      body: 'JioSpace will deliver broadband connectivity to over 6 crore households in Tier-3 and rural areas by Q2 2025, powered by 28 low-orbit satellites launched in partnership with ISRO. Tariffs starting at ₹499/month.',
      stats: [{ v: '41.2k', l: 'reads' }, { v: '8.7k', l: 'shares' }, { v: '2,340', l: 'comments' }],
    },
    minis: [
      { badge: 'Markets', title: 'SEBI Approves India\'s First Domestic ETF for Listed AI Cos', byline: 'Mint · 3 min read' },
      { badge: 'M&A', title: 'Tata Group Acquires Singapore Fintech for ₹2,400 Crore', byline: 'Business Standard · 4 min read' },
    ],
  },
  {
    id: 'article', label: 'Article', icon: BookOpen, cta: 'Write & publish',
    tagCls: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    main: {
      badge: 'Editorial', title: 'How Bengaluru Startups Are Quietly Rewriting Global SaaS Playbooks',
      byline: 'Saurabh Mukherjea · Marcellus Investment · 14 min read',
      body: 'India\'s SaaS founders aren\'t copying Silicon Valley anymore — they\'re building products that global enterprises actually prefer. The numbers prove it: 18 Indian B2B SaaS companies crossed $100M ARR in 2024 alone.',
      stats: [{ v: '29.6k', l: 'reads' }, { v: '6.1k', l: 'saves' }, { v: '11.4k', l: 'shares' }],
    },
    minis: [
      { badge: 'Commerce', title: 'The Meesho Effect: Why Social Commerce Will Define India\'s Next Wave', byline: 'Aparna Jain · 9 min read' },
      { badge: 'Open Tech', title: 'ONDC and the Architecture of a Truly Open Internet Commerce Layer', byline: 'Rahul Chari · 7 min read' },
    ],
  },
  {
    id: 'document', label: 'Document', icon: FileText, cta: 'Upload a doc',
    tagCls: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
    main: {
      badge: 'Official', title: 'DPDP Act 2023 — Enterprise Compliance Handbook, 2nd Edition',
      byline: '64 pages · 4.1 MB · PDF · Updated today',
      body: 'Comprehensive guide covering Data Principal rights, Data Fiduciary obligations, consent frameworks, breach notification timelines, and cross-border transfer rules under India\'s Digital Personal Data Protection Act 2023.',
      stats: [{ v: '64', l: 'pages' }, { v: '4.1 MB', l: 'size' }, { v: '318', l: 'downloads' }],
    },
    minis: [
      { badge: 'Tax', title: 'GST Annual Return Filing Guide FY 2024–25', byline: '38 pages · PDF · Shared yesterday' },
      { badge: 'Internal', title: 'MCA21 V3 Portal Migration — IT Reference', byline: '22 pages · DOCX · Draft' },
    ],
  },
  {
    id: 'portfolio', label: 'Portfolio', icon: Layers, cta: 'Showcase work',
    tagCls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    main: {
      badge: 'Case Study', title: 'Reimagining IRCTC\'s Next Billion User Journey',
      byline: 'Client: Ministry of Railways, Govt. of India · UX Design · 2024',
      body: 'Complete UX overhaul of India\'s busiest consumer platform — 8.5 lakh daily bookings. Reduced drop-off by 52%, cut avg. booking time to 38 seconds, and boosted mobile conversion by 34 points. Delivered in 11 weeks.',
      chips: ['Figma', 'Design System', 'Hindi/Regional UI', 'A11y Research', 'Low-Bandwidth UX'],
    },
    minis: [
      { badge: 'Fintech', title: 'PhonePe Wealth: Mutual Fund Investment in Under 60 Seconds', byline: 'Client: PhonePe · Product Design · 2024' },
      { badge: 'Hyperlocal', title: 'Zepto 10-Minute Delivery UX — From Zero to 10M Orders', byline: 'Client: Zepto · Mobile UX · 2023' },
    ],
  },
  {
    id: 'announcement', label: 'Announce', icon: Megaphone, cta: 'Send announcement',
    tagCls: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    main: {
      badge: 'HIGH PRIORITY', title: 'Docrud Now Available in Hindi, Tamil, Telugu & 9 More Indian Languages',
      byline: 'Product Team · Sent to 12,400 workspace members · 2 hrs ago',
      body: 'Full UI localisation across 12 Indian languages is now live — including right-to-left support for Urdu. Switch language from Settings › Workspace › Language. No content migration required.',
      stats: [{ v: '12.4k', l: 'reached' }, { v: '91%', l: 'opened' }, { v: '7 days', l: 'active' }],
    },
    minis: [
      { badge: 'Feature', title: 'GST Invoice Generation Now Supports UPI QR & GSTIN Validation', byline: 'Product Team · Sent 3 days ago' },
      { badge: 'Integration', title: 'Aadhaar eSign Integration Goes Live for Indian Enterprises', byline: 'Partnerships Team · Sent 1 week ago' },
    ],
  },
  {
    id: 'job', label: 'Job Post', icon: Briefcase, cta: 'Post a role',
    tagCls: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    main: {
      badge: 'Hybrid · Full-time', title: 'Senior Product Designer',
      byline: 'Razorpay · Design Systems · Bengaluru',
      body: 'Own the design language across Razorpay\'s merchant dashboard and payment flows — used by 10M+ businesses across India. Define the component library, interaction patterns, and accessibility standards for web and mobile.',
      chips: ['₹35–55 LPA', 'ESOP', 'Design Systems', 'Figma expert', 'Health + Dental', 'Remote Fridays'],
    },
    minis: [
      { badge: 'Remote', title: 'Staff Backend Engineer (Go)', byline: 'CRED · Engineering · ₹45–70 LPA' },
      { badge: 'Hybrid', title: 'Head of Growth Marketing', byline: 'Meesho · Marketing · ₹40–60 LPA' },
    ],
  },
  {
    id: 'resume', label: 'Resume', icon: User, cta: 'Create profile',
    tagCls: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    main: {
      badge: '✦ Open to Work', title: 'Ananya Krishnan',
      byline: 'Senior Product Designer · 9 yrs exp · Bengaluru, KA',
      body: 'I\'ve spent a decade designing products that 100M+ Indians actually use — from CRED\'s credit interface to Swiggy\'s reorder experience. I believe great design solves for the person who never reads instructions.',
      chips: ['Figma', 'Design Systems', 'Bharat UX', 'User Research', 'Prototyping', 'Hindi UI'],
    },
    minis: [
      { badge: 'Available', title: 'Rohan Mehta · ML Engineer', byline: 'Hyderabad · 6 yrs · Python, PyTorch, LLMs' },
      { badge: 'Freelance', title: 'Siddharth Joshi · Full-Stack Developer', byline: 'Pune · 5 yrs · TypeScript, Go, Postgres' },
    ],
  },
  {
    id: 'product', label: 'Product', icon: Package, cta: 'List product',
    tagCls: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    main: {
      badge: 'Most Popular', title: 'DocOps Pro Suite',
      byline: '₹3,999 / workspace / month · Annual billing · GST inclusive',
      body: 'India\'s most complete document operations layer — unlimited templates, AI generation in 12 languages, Aadhaar eSign, GST invoicing, audit logs, and branded client portals. Zero per-seat pricing.',
      chips: ['Unlimited templates', 'AI (Hindi + English)', 'Aadhaar eSign', 'GST invoicing', 'DPDP compliant'],
    },
    minis: [
      { badge: 'Add-on', title: 'GST-Ready Invoice Automation Pack', byline: '₹999/mo · E-way bills, GSTR-1, UPI QR, IRN generation' },
      { badge: 'Enterprise', title: 'DPDP + IT Act Compliance Bundle', byline: 'Custom pricing · Consent mgmt, DLP, audit trails, eSign' },
    ],
  },
] as const;

/* ─── gigs data (India-based, MNC-grade) ────────────────────── */
const GIGS_DATA = [
  {
    id: 'g1',
    title: 'Senior React & TypeScript Developer',
    company: 'Razorpay',
    logo: 'RZ',
    logoBg: 'bg-blue-600',
    location: 'Bengaluru · Hybrid',
    budget: '₹80–120 LPA',
    type: 'Full-time',
    mode: 'apply',
    typeCls: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    skills: ['React', 'TypeScript', 'Node.js', 'Postgres', 'Redis'] as readonly string[],
    description: 'Build the next generation of Razorpay\'s merchant-facing dashboard — used by 10M+ businesses. You\'ll own the payments UX across web and mobile, working with world-class engineers on high-scale systems.',
    requirements: [
      '5+ years of production React and TypeScript experience',
      'Hands-on with high-scale distributed systems (1M+ DAU)',
      'Strong CS fundamentals — data structures, system design, algorithms',
      'Familiarity with payments or fintech domains preferred',
      'Comfortable leading technical discussions and code reviews',
    ] as readonly string[],
    posted: '2 hrs ago',
    applicants: 48,
    openings: 3,
    deadline: '15 Jun 2026',
    experience: '5–10 yrs',
    companySize: '3,000+ employees',
    rating: 4.9,
    perks: ['ESOP', 'Remote Fridays', 'Health + Dental', 'Learning Budget ₹1L/yr'] as readonly string[],
    process: ['Application Review', 'Technical Screen', 'System Design', 'Bar Raiser', 'Offer'] as readonly string[],
  },
  {
    id: 'g2',
    title: 'Product Designer — Fintech',
    company: 'CRED',
    logo: 'CR',
    logoBg: 'bg-purple-600',
    location: 'Bengaluru · In-office',
    budget: '₹40–65 LPA',
    type: 'Full-time',
    mode: 'apply',
    typeCls: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    skills: ['Figma', 'Design Systems', 'Motion Design', 'User Research', 'A/B Testing'] as readonly string[],
    description: 'Design premium credit & rewards experiences for India\'s most curated consumer base — 12M+ creditworthy members. Drive end-to-end design for CRED\'s core credit card management and rewards loop.',
    requirements: [
      '4+ years of product design in consumer-facing apps',
      'Strong portfolio demonstrating end-to-end design process',
      'Experience with design systems and component libraries',
      'Passion for financial products and behavioural economics',
      'Motion design skills (Principle, After Effects) a plus',
    ] as readonly string[],
    posted: '5 hrs ago',
    applicants: 37,
    openings: 2,
    deadline: '20 Jun 2026',
    experience: '4–8 yrs',
    companySize: '1,500+ employees',
    rating: 4.8,
    perks: ['ESOP', 'MacBook Pro', 'Annual Trip', 'Flexible Hours'] as readonly string[],
    process: ['Portfolio Review', 'Design Exercise', 'Team Interview', 'Leadership Review', 'Offer'] as readonly string[],
  },
  {
    id: 'g3',
    title: 'ML Engineer — Recommendations',
    company: 'Meesho',
    logo: 'ME',
    logoBg: 'bg-pink-600',
    location: 'Bengaluru · Hybrid',
    budget: '₹45–75 LPA',
    type: 'Full-time',
    mode: 'apply',
    typeCls: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
    skills: ['Python', 'PyTorch', 'Spark', 'Kafka', 'A/B Testing'] as readonly string[],
    description: 'Build personalised recommendation models powering Meesho\'s social commerce feed for 140M+ shoppers in Tier-2 and Tier-3 India. Real scale, real impact — from training to serving 1B+ predictions/day.',
    requirements: [
      '4+ years of applied ML/AI in production environments',
      'Experience with large-scale recommendation or ranking systems',
      'Proficiency in Python, PyTorch/TensorFlow, and distributed computing',
      'Strong understanding of A/B testing and experimentation frameworks',
      'Published research or open-source contributions preferred',
    ] as readonly string[],
    posted: '1 day ago',
    applicants: 62,
    openings: 4,
    deadline: '25 Jun 2026',
    experience: '4–9 yrs',
    companySize: '5,000+ employees',
    rating: 4.7,
    perks: ['ESOP', 'WFH Equipment', 'Sabbatical Leave', 'Patent Awards'] as readonly string[],
    process: ['ML Take-home', 'Technical Phone Screen', 'System Design', 'Culture Fit', 'Offer'] as readonly string[],
  },
  {
    id: 'g4',
    title: 'Backend Engineer — Payments Infrastructure',
    company: 'PhonePe',
    logo: 'PP',
    logoBg: 'bg-indigo-600',
    location: 'Bengaluru · Hybrid',
    budget: '₹50–90 LPA',
    type: 'Full-time',
    mode: 'apply',
    typeCls: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    skills: ['Go', 'Java', 'Kafka', 'Kubernetes', 'gRPC'] as readonly string[],
    description: 'Scale the payments infrastructure processing ₹80,000 crore monthly TPV across UPI, wallet, and insurance. Design distributed systems for 99.99% uptime at 200M+ monthly active users.',
    requirements: [
      '5+ years of backend engineering in high-throughput systems',
      'Deep expertise in Go or Java for high-concurrency services',
      'Strong knowledge of distributed systems, consensus, and CAP theorem',
      'Experience with Kafka, Kubernetes, and cloud-native architectures',
      'Prior fintech/payments/banking domain experience strongly preferred',
    ] as readonly string[],
    posted: '1 day ago',
    applicants: 55,
    openings: 5,
    deadline: '30 Jun 2026',
    experience: '5–10 yrs',
    companySize: '4,000+ employees',
    rating: 4.9,
    perks: ['ESOP', 'Relocation Bonus', 'Health + OPD', 'Crèche Benefit'] as readonly string[],
    process: ['Coding Assessment', 'Technical Interview', 'System Design', 'Engineering Leadership', 'Offer'] as readonly string[],
  },
  {
    id: 'g5',
    title: 'Freelance UX Writer — App Copy',
    company: 'Zepto',
    logo: 'ZP',
    logoBg: 'bg-teal-600',
    location: 'Remote · India',
    budget: '₹2,500/hr',
    type: 'Freelance',
    mode: 'bid',
    typeCls: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
    skills: ['UX Writing', 'Copy Strategy', 'Microcopy', 'Hindi', 'A/B Copy Tests'] as readonly string[],
    description: 'Write the copy that guides 10M+ customers through Zepto\'s 10-minute grocery experience — from onboarding nudges and cart abandonment flows to push notifications. Hindi + English bilingual preferred.',
    requirements: [
      '3+ years of UX writing for consumer mobile apps',
      'Fluency in Hindi and English — bilingual copy experience mandatory',
      'Strong portfolio of microcopy, onboarding flows, and error messages',
      'Experience with A/B copy testing and conversion optimisation',
      'Quick-commerce or e-commerce domain familiarity a bonus',
    ] as readonly string[],
    posted: '3 hrs ago',
    applicants: 19,
    openings: 1,
    deadline: '10 Jun 2026',
    experience: '3–6 yrs',
    companySize: '2,000+ employees',
    rating: 4.6,
    perks: ['Flexible Hours', 'Paid On Acceptance', 'Portfolio Rights', 'Repeat Opportunities'] as readonly string[],
    process: ['Portfolio Review', 'Copy Exercise', 'Video Call', 'Contract Signed', 'Start'] as readonly string[],
  },
  {
    id: 'g6',
    title: 'DevOps Engineer — Cloud & Security',
    company: 'CoinSwitch',
    logo: 'CS',
    logoBg: 'bg-slate-600',
    location: 'Bengaluru · Hybrid',
    budget: '₹35–55 LPA',
    type: 'Full-time',
    mode: 'apply',
    typeCls: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
    skills: ['AWS', 'Terraform', 'Kubernetes', 'CI/CD', 'SOC 2'] as readonly string[],
    description: 'Own cloud security and infrastructure for India\'s largest crypto exchange — ₹75,000 crore AUM. Design zero-trust architecture, automated compliance pipelines, and 24/7 incident response playbooks.',
    requirements: [
      '4+ years of DevOps/SRE in cloud-native environments',
      'Expertise in AWS (or GCP/Azure), Terraform IaC, and Kubernetes',
      'Experience with security frameworks — SOC 2, ISO 27001, or DPDP',
      'Strong scripting in Python or Go for automation pipelines',
      'CISSP, AWS Security Specialty, or CKS certifications a plus',
    ] as readonly string[],
    posted: '2 days ago',
    applicants: 31,
    openings: 2,
    deadline: '5 Jul 2026',
    experience: '4–8 yrs',
    companySize: '800+ employees',
    rating: 4.8,
    perks: ['ESOP', 'Crypto Incentives', 'Annual Offsite', 'Learning Stipend'] as readonly string[],
    process: ['Resume Screen', 'Technical Assessment', 'Architecture Review', 'Culture Fit', 'Offer'] as readonly string[],
  },
];

/* ─── talents data (India-based) ────────────────────────────── */
const TALENTS_DATA = [
  {
    id: 't1',
    slug: 'ananya-krishnan',
    name: 'Ananya Krishnan',
    title: 'Senior Product Designer',
    avatar: 'AK',
    avatarBg: 'bg-emerald-600',
    location: 'Bengaluru, KA',
    experience: '9 yrs',
    rate: '₹18k/day',
    availability: 'Open to Work',
    availCls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    skills: ['Figma', 'Design Systems', 'Bharat UX', 'User Research', 'Hindi UI'] as readonly string[],
    bio: 'I\'ve spent a decade designing products that 100M+ Indians actually use — from CRED\'s credit interface to Swiggy\'s reorder flow. I believe great design solves for the person who never reads instructions.',
    projects: 24,
    rating: 4.97,
    badges: ['Top Rated', 'Featured'],
    pastWork: ['CRED', 'Swiggy', 'Ministry of Railways'],
  },
  {
    id: 't2',
    slug: 'rohan-mehta',
    name: 'Rohan Mehta',
    title: 'ML Engineer & AI Researcher',
    avatar: 'RM',
    avatarBg: 'bg-blue-600',
    location: 'Hyderabad, TS',
    experience: '6 yrs',
    rate: '₹14k/day',
    availability: 'Available Now',
    availCls: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    skills: ['Python', 'PyTorch', 'LLMs', 'RAG', 'MLOps'] as readonly string[],
    bio: 'Ex-Microsoft Research. I build LLM-powered products and fine-tuned models that ship to production — not just notebooks. Specialise in RAG pipelines, multi-modal models, and AI for Indic languages.',
    projects: 18,
    rating: 4.93,
    badges: ['Expert', 'AI Specialist'],
    pastWork: ['Microsoft Research', 'Sarvam AI', 'IIT Bombay Lab'],
  },
  {
    id: 't3',
    slug: 'siddharth-joshi',
    name: 'Siddharth Joshi',
    title: 'Full-Stack Developer',
    avatar: 'SJ',
    avatarBg: 'bg-violet-600',
    location: 'Pune, MH',
    experience: '5 yrs',
    rate: '₹8k/day',
    availability: 'Freelance',
    availCls: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    skills: ['TypeScript', 'Next.js', 'Go', 'Postgres', 'Docker'] as readonly string[],
    bio: 'Indie developer who\'s shipped three SaaS products from scratch. I own the full stack — from Go APIs and Postgres schemas to React UIs and CI/CD. Fast iterations, clean code, zero fluff.',
    projects: 31,
    rating: 4.91,
    badges: ['Rising Star', 'Verified'],
    pastWork: ['Zoho', 'ThoughtWorks', 'Indie SaaS'],
  },
  {
    id: 't4',
    slug: 'priya-nair',
    name: 'Priya Nair',
    title: 'Content Strategist & UX Writer',
    avatar: 'PN',
    avatarBg: 'bg-rose-600',
    location: 'Kochi, KL',
    experience: '7 yrs',
    rate: '₹6k/day',
    availability: 'Part-time',
    availCls: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    skills: ['UX Writing', 'Content Strategy', 'SEO', 'Malayalam', 'Hindi'] as readonly string[],
    bio: 'I write the words that help people use products. From fintech onboarding copy to multilingual micro-interactions for 50M+ users. Former Paytm, now crafting clarity for B2B SaaS and consumer apps.',
    projects: 43,
    rating: 4.88,
    badges: ['Top Rated', 'Multilingual'],
    pastWork: ['Paytm', 'Freshworks', 'Nykaa'],
  },
  {
    id: 't5',
    slug: 'vikram-singh',
    name: 'Vikram Singh',
    title: 'DevOps & Cloud Architect',
    avatar: 'VS',
    avatarBg: 'bg-cyan-700',
    location: 'Delhi NCR',
    experience: '10 yrs',
    rate: '₹20k/day',
    availability: 'Contract',
    availCls: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    skills: ['AWS', 'GCP', 'Terraform', 'Kubernetes', 'SOC 2'] as readonly string[],
    bio: 'Cloud architect who\'s designed infra for three unicorn-stage startups. I turn chaotic EC2 sprawl into zero-trust, auto-scaling, SOC-2-compliant cloud systems — then document it properly so it doesn\'t need me forever.',
    projects: 15,
    rating: 4.95,
    badges: ['Expert', 'Certified AWS SA'],
    pastWork: ['Ola', 'HDFC Digital', 'Pine Labs'],
  },
  {
    id: 't6',
    slug: 'meera-iyer',
    name: 'Meera Iyer',
    title: 'Brand Designer & Motion Artist',
    avatar: 'MI',
    avatarBg: 'bg-fuchsia-600',
    location: 'Chennai, TN',
    experience: '6 yrs',
    rate: '₹9k/day',
    availability: 'Open to Work',
    availCls: 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20',
    skills: ['Figma', 'After Effects', 'Lottie', 'Brand Identity', 'Tamil UI'] as readonly string[],
    bio: 'I design brands that move — literally. From logo animations and app motion design to full visual identity systems. My work has shipped in apps with 20M+ downloads across India and SE Asia.',
    projects: 38,
    rating: 4.92,
    badges: ['Creative', 'Motion Expert'],
    pastWork: ['Dream11', 'Sharechat', 'Tata Digital'],
  },
] as const;

/* ─── india highlights (mock data) ─────────────────────────── */
const INDIA_HIGHLIGHTS = [
  {
    title: 'GST-ready invoices',
    description: 'Generate invoices with GSTIN validation, UPI QR, and clean export-ready PDFs.',
    badge: 'Compliance',
    meta: 'Mumbai · Retail',
    Icon: FileText,
  },
  {
    title: 'Offer letters in minutes',
    description: 'Create offer letters with CTC breakdowns, probation terms, and joining dates.',
    badge: 'HR',
    meta: 'Bengaluru · SaaS',
    Icon: Briefcase,
  },
  {
    title: 'DPDP-friendly sharing',
    description: 'Password-protect sensitive files, set expiry, and track access with audit trails.',
    badge: 'Security',
    meta: 'Delhi NCR · Legal',
    Icon: FolderLock,
  },
  {
    title: 'Aadhaar eSign workflows',
    description: 'Collect signatures securely with signer tracking and field placement.',
    badge: 'E‑Sign',
    meta: 'Hyderabad · Fintech',
    Icon: FileSignature,
  },
  {
    title: 'Client onboarding forms',
    description: 'Collect GST, billing address, scope, and file uploads in one shareable form.',
    badge: 'Forms',
    meta: 'Pune · Services',
    Icon: FormInput,
  },
  {
    title: 'Instant contract summaries',
    description: 'Extract key clauses, risks, dates, and missing terms from long agreements.',
    badge: 'AI',
    meta: 'Chennai · Enterprise',
    Icon: Wand2,
  },
  {
    title: 'Invoice data extraction',
    description: 'Pull line items, totals, and vendor details from scans and images.',
    badge: 'Automation',
    meta: 'Ahmedabad · Manufacturing',
    Icon: Search,
  },
  {
    title: 'Secure file portals',
    description: 'Share large files with access controls and branded client portals.',
    badge: 'Sharing',
    meta: 'Kolkata · Agency',
    Icon: Share2,
  },
] as const;

type PSMain = { badge: string; title: string; byline: string; body: string; stats?: { v: string; l: string }[]; chips?: readonly string[] };
type PSMini = { badge: string; title: string; byline: string };

type SliderDetails =
  | { kind: 'welcome'; title: string; description: string; prompt: string }
  | { kind: 'india'; title: string; description: string; badge: string; meta: string }
  | { kind: 'publish-main'; badge: string; title: string; byline: string; body: string; chips?: readonly string[]; stats?: { v: string; l: string }[] }
  | { kind: 'publish-mini'; badge: string; title: string; byline: string }
  | { kind: 'gig'; id: string; title: string; company: string; logo: string; logoBg: string; location: string; budget: string; type: string; mode: 'apply' | 'bid'; typeCls: string; skills: readonly string[]; description: string; requirements: readonly string[]; posted: string; applicants: number; openings: number; deadline: string; experience: string; companySize: string; rating: number; perks: readonly string[]; process: readonly string[] }
  | { kind: 'talent'; id: string; slug: string; name: string; title: string; location: string; experience: string; rate: string; availability: string; availCls: string; skills: readonly string[]; bio: string; projects: number; rating: number; badges: readonly string[]; pastWork: readonly string[] };

function DetailsDialog({
  open,
  onOpenChange,
  details,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  details: SliderDetails | null;
}) {
  /* ── Gig apply/bid form state ── */
  const [applyStage, setApplyStage] = useState<'idle' | 'form' | 'success'>('idle');
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formExp, setFormExp] = useState('');
  const [formCover, setFormCover] = useState('');
  const [formLinks, setFormLinks] = useState('');
  const [bidAmt, setBidAmt] = useState('');
  const [bidTimeline, setBidTimeline] = useState('');
  const [bidPitch, setBidPitch] = useState('');
  const detailsKey = details?.kind === 'gig' ? details.id : (details?.kind ?? '');
  useEffect(() => {
    setApplyStage('idle');
    setFormName(''); setFormEmail(''); setFormExp(''); setFormCover(''); setFormLinks('');
    setBidAmt(''); setBidTimeline(''); setBidPitch('');
  }, [detailsKey]);

  const isGig = details?.kind === 'gig';
  const title = details?.kind === 'talent' ? details.name : (isGig && applyStage === 'form') ? (details.mode === 'bid' ? 'Place a Bid' : 'Apply Now') : details?.title || 'Details';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[90] w-[92vw] max-w-[740px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto max-h-[88dvh] rounded-[28px] border border-white/10 bg-slate-950/90 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.65)] backdrop-blur-2xl outline-none data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=closed]:slide-out-to-bottom-2 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Dialog.Title className="text-xl font-semibold tracking-[-0.03em] text-white">{title}</Dialog.Title>
              {details?.kind === 'india' ? (
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/55">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-semibold uppercase tracking-[0.18em] text-white/70">{details.badge}</span>
                  <span>{details.meta}</span>
                </div>
              ) : details?.kind === 'publish-main' ? (
                <div className="mt-1 text-xs text-white/50">{details.byline}</div>
              ) : details?.kind === 'publish-mini' ? (
                <div className="mt-1 text-xs text-white/50">{details.byline}</div>
              ) : details?.kind === 'welcome' ? (
                <div className="mt-1 text-xs text-white/50">Suggested prompt inside</div>
              ) : details?.kind === 'gig' && applyStage === 'idle' ? (
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/55">
                  <span className={`rounded-full border px-2.5 py-1 font-semibold ${details.typeCls}`}>{details.type}</span>
                  <span>{details.company} · {details.location}</span>
                </div>
              ) : details?.kind === 'talent' ? (
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/55">
                  <span className={`rounded-full border px-2.5 py-1 font-semibold ${details.availCls}`}>{details.availability}</span>
                  <span>{details.title} · {details.location}</span>
                </div>
              ) : null}
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {details?.kind === 'welcome' ? (
            <div className="mt-5 space-y-3">
              <p className="text-sm leading-relaxed text-white/70">{details.description}</p>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/40">prompt</div>
                <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/80">{details.prompt}</div>
              </div>
            </div>
          ) : details?.kind === 'india' ? (
            <div className="mt-5 space-y-3">
              <p className="text-sm leading-relaxed text-white/70">{details.description}</p>
            </div>
          ) : details?.kind === 'publish-main' ? (
            <div className="mt-5 space-y-4">
              <p className="text-sm leading-relaxed text-white/70">{details.body}</p>
              {details.chips?.length ? (
                <div className="flex flex-wrap gap-2">
                  {details.chips.map((chip) => (
                    <span key={chip} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/70">{chip}</span>
                  ))}
                </div>
              ) : null}
              {details.stats?.length ? (
                <div className="grid grid-cols-3 gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  {details.stats.map((s) => (
                    <div key={s.l}>
                      <div className="text-lg font-semibold text-white">{s.v}</div>
                      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">{s.l}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : details?.kind === 'publish-mini' ? (
            <div className="mt-5 space-y-3">
              <span className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold tracking-wide text-white/70">{details.badge}</span>
              <p className="text-sm leading-relaxed text-white/70">{details.title}</p>
            </div>

          ) : details?.kind === 'gig' ? (
            <div className="mt-5 space-y-5">
              {/* ── Success state ── */}
              {applyStage === 'success' ? (
                <div className="flex flex-col items-center gap-5 py-10 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
                    <Check className="h-8 w-8 text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-white">
                      {details.mode === 'bid' ? 'Bid Submitted!' : 'Application Sent!'}
                    </div>
                    <div className="mt-1 text-xs font-mono text-white/40 tracking-widest">
                      REF: {`DOC-${details.id.toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`}
                    </div>
                  </div>
                  <p className="max-w-sm text-sm leading-relaxed text-white/60">
                    {details.mode === 'bid'
                      ? `${details.company} will review your bid and respond within 2–3 business days.`
                      : `Your application for ${details.title} at ${details.company} has been received. Expect a response within 5–7 business days.`}
                  </p>
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setApplyStage('idle')}
                      className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
                    >
                      Back to role
                    </button>
                  </div>
                </div>

              ) : applyStage === 'form' ? (
                /* ── Application / Bid form ── */
                <div className="space-y-4">
                  <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${details.logoBg} text-sm font-bold text-white shadow-md`}>
                      {details.logo}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">{details.title}</div>
                      <div className="text-xs text-white/45">{details.company} · {details.location} · {details.budget}</div>
                    </div>
                  </div>

                  {details.mode === 'apply' ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Full Name *</label>
                          <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Rahul Sharma"
                            className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/20 focus:border-white/20 focus:outline-none transition" />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Email *</label>
                          <input value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="you@company.com" type="email"
                            className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/20 focus:border-white/20 focus:outline-none transition" />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Years of Relevant Experience *</label>
                        <select value={formExp} onChange={(e) => setFormExp(e.target.value)}
                          className="h-10 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white focus:border-white/20 focus:outline-none transition">
                          <option value="">Select range</option>
                          <option>1–2 years</option><option>3–4 years</option><option>5–7 years</option><option>8–12 years</option><option>12+ years</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">LinkedIn / Portfolio / GitHub</label>
                        <input value={formLinks} onChange={(e) => setFormLinks(e.target.value)} placeholder="https://linkedin.com/in/yourprofile"
                          className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/20 focus:border-white/20 focus:outline-none transition" />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Cover Letter <span className="normal-case text-white/30">(optional)</span></label>
                        <textarea value={formCover} onChange={(e) => setFormCover(e.target.value)} rows={4}
                          placeholder={`Why are you a great fit for ${details.company}?`}
                          className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm text-white placeholder:text-white/20 focus:border-white/20 focus:outline-none transition" />
                      </div>
                    </div>
                  ) : (
                    /* Bid form */
                    <div className="space-y-3">
                      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Client ask rate</div>
                        <div className="mt-1 text-xl font-bold text-white">{details.budget}</div>
                        <div className="mt-0.5 text-xs text-white/35">Submit your competitive rate below to stand out</div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Your Bid Rate *</label>
                          <input value={bidAmt} onChange={(e) => setBidAmt(e.target.value)} placeholder="₹2,200/hr"
                            className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/20 focus:border-white/20 focus:outline-none transition" />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Timeline *</label>
                          <select value={bidTimeline} onChange={(e) => setBidTimeline(e.target.value)}
                            className="h-10 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white focus:border-white/20 focus:outline-none transition">
                            <option value="">Select timeline</option>
                            <option>1–2 weeks</option><option>2–4 weeks</option><option>1–2 months</option><option>2–4 months</option><option>Ongoing engagement</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Your Pitch *</label>
                        <textarea value={bidPitch} onChange={(e) => setBidPitch(e.target.value)} rows={5}
                          placeholder="Describe your approach, relevant experience, and why you're the right fit for this project..."
                          className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm text-white placeholder:text-white/20 focus:border-white/20 focus:outline-none transition" />
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setApplyStage('success')}
                      disabled={details.mode === 'apply' ? (!formName || !formEmail || !formExp) : (!bidAmt || !bidTimeline || !bidPitch)}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/70 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(0,0,0,0.5)] backdrop-blur-xl transition hover:bg-black/90 hover:border-white/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {details.mode === 'bid' ? 'Submit Bid' : 'Submit Application'}
                      <Send className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setApplyStage('idle')}
                      className="h-11 rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-medium text-white/60 transition hover:bg-white/10 hover:text-white">
                      Cancel
                    </button>
                  </div>
                </div>

              ) : (
                /* ── Main gig detail view ── */
                <>
                  {/* Company banner */}
                  <div className="flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                    <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${details.logoBg} text-base font-bold text-white shadow-lg ring-2 ring-white/10`}>
                      {details.logo}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-white">{details.company}</span>
                        <div className="flex items-center gap-0.5">
                          {[1,2,3,4,5].map((i) => (
                            <span key={i} className={`text-[11px] ${i <= Math.round(details.rating) ? 'text-yellow-400' : 'text-white/15'}`}>★</span>
                          ))}
                          <span className="ml-1 text-[11px] text-white/45">{details.rating}</span>
                        </div>
                      </div>
                      <div className="mt-0.5 text-xs text-white/40">{details.companySize} · {details.location}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide ${details.typeCls}`}>{details.type}</span>
                      <span className="text-[10px] text-white/30">Posted {details.posted}</span>
                    </div>
                  </div>

                  {/* Urgency bar */}
                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-semibold text-white/55">{details.applicants} applicants · {details.openings} opening{details.openings > 1 ? 's' : ''}</span>
                      <span className="text-[11px] text-white/40">Deadline: <span className="font-semibold text-white/60">{details.deadline}</span></span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-white/50 to-white/30 transition-all duration-500"
                        style={{ width: `${Math.min(96, Math.round((details.applicants / (details.openings * 70)) * 100))}%` }}
                      />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-[10px] text-white/30">{details.experience} exp required</span>
                      <span className={`text-[10px] font-semibold ${details.applicants < 25 ? 'text-emerald-400' : details.applicants < 55 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {details.applicants < 25 ? '✦ Apply early — low competition' : details.applicants < 55 ? 'Filling fast' : 'High competition'}
                      </span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { v: details.budget, l: 'Compensation' },
                      { v: String(details.applicants), l: 'Applicants' },
                      { v: `${details.rating}★`, l: 'Employer Rating' },
                    ].map((s) => (
                      <div key={s.l} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3 text-center">
                        <div className="text-[15px] font-bold text-white leading-tight">{s.v}</div>
                        <div className="mt-0.5 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-white/35">{s.l}</div>
                      </div>
                    ))}
                  </div>

                  {/* About the role */}
                  <div>
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/35">About the Role</div>
                    <p className="text-sm leading-relaxed text-white/65">{details.description}</p>
                  </div>

                  {/* Requirements */}
                  <div>
                    <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/35">Requirements</div>
                    <div className="space-y-2">
                      {details.requirements.map((r, i) => (
                        <div key={i} className="flex items-start gap-2.5">
                          <div className="mt-[4px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5">
                            <div className="h-1.5 w-1.5 rounded-full bg-white/35" />
                          </div>
                          <span className="text-sm leading-relaxed text-white/60">{r}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Skills */}
                  <div>
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/35">Skills Required</div>
                    <div className="flex flex-wrap gap-1.5">
                      {details.skills.map((s) => (
                        <span key={s} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/65">{s}</span>
                      ))}
                    </div>
                  </div>

                  {/* Hiring process */}
                  <div>
                    <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/35">Hiring Process</div>
                    <div className="flex items-start gap-0 overflow-x-auto pb-1 no-scrollbar">
                      {details.process.map((stage, i) => (
                        <div key={stage} className="flex shrink-0 items-center">
                          <div className="flex flex-col items-center gap-1.5 px-1">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-[11px] font-bold text-white/60">
                              {i + 1}
                            </div>
                            <span className="w-[70px] text-center text-[9px] font-medium leading-tight text-white/35">{stage}</span>
                          </div>
                          {i < details.process.length - 1 && (
                            <div className="mb-4 h-px w-5 shrink-0 bg-white/[0.08]" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Perks */}
                  <div>
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/35">Perks & Benefits</div>
                    <div className="flex flex-wrap gap-1.5">
                      {details.perks.map((p) => (
                        <span key={p} className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">{p}</span>
                      ))}
                    </div>
                  </div>

                  {/* CTA */}
                  <div className="flex flex-wrap gap-3 border-t border-white/[0.07] pt-5">
                    <button
                      type="button"
                      onClick={() => setApplyStage('form')}
                      className="inline-flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-black/70 px-5 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(0,0,0,0.5)] backdrop-blur-xl transition hover:bg-black/90 hover:border-white/20 active:scale-95"
                    >
                      {details.mode === 'bid' ? 'Place a Bid' : 'Apply Now'} <ArrowRight className="h-4 w-4" />
                    </button>
                    <button type="button" className="inline-flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-5 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white">
                      Save Role
                    </button>
                    <button type="button" className="inline-flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-5 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white">
                      <Share2 className="h-3.5 w-3.5" /> Share
                    </button>
                  </div>
                </>
              )}
            </div>

          ) : details?.kind === 'talent' ? (
            <div className="mt-5 space-y-5">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { v: details.experience, l: 'Experience' },
                  { v: details.rate, l: 'Day Rate' },
                  { v: `${details.rating}★`, l: 'Rating' },
                ].map((s) => (
                  <div key={s.l} className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3 text-center">
                    <div className="text-base font-bold text-white">{s.v}</div>
                    <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">{s.l}</div>
                  </div>
                ))}
              </div>
              <p className="text-sm leading-relaxed text-white/70">{details.bio}</p>
              <div>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/35">Skills</div>
                <div className="flex flex-wrap gap-1.5">
                  {details.skills.map((s) => (
                    <span key={s} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/70">{s}</span>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/35">Past Work</div>
                <div className="flex flex-wrap gap-1.5">
                  {details.pastWork.map((p) => (
                    <span key={p} className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300">{p}</span>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {details.badges.map((b) => (
                  <span key={b} className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-white/60">{b}</span>
                ))}
              </div>
              <div className="flex flex-wrap gap-3 border-t border-white/[0.07] pt-5">
                <Link href={`/talent/${details.slug}`}
                  className="inline-flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-black/70 px-5 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(0,0,0,0.5)] backdrop-blur-xl transition hover:bg-black/90 hover:border-white/20 active:scale-95">
                  View Full Profile <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/talent"
                  className="inline-flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white">
                  Send Message
                </Link>
                <Link href="/talent"
                  className="inline-flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white">
                  Hire This Talent
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-5 text-sm text-white/60">No details available.</div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PublishShowcase({
  onPublishClick,
  onViewDetails,
}: {
  onPublishClick: () => void;
  onViewDetails: (details: SliderDetails) => void;
}) {
  return (
    <section className="w-full pb-6">
      <div className="px-4 sm:px-8">
        {/* heading */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-white/40 sm:text-[11px]">everything worth sharing</p>
            <h2 className="mt-1.5 text-2xl font-semibold tracking-[-0.05em] text-white sm:text-3xl">
              Publish anything.{' '}
              <span className="text-white/80">
                Make it matter.
              </span>
            </h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-white/50">
              News, articles, docs, portfolios, announcements, jobs, resumes, products — all polished and ready in minutes.
            </p>
          </div>
          <button
            type="button"
            onClick={onPublishClick}
            className="hidden sm:inline-flex h-9 shrink-0 items-center gap-1.5 rounded-2xl border border-white/10 bg-black/70 px-4 text-xs font-semibold text-white shadow-[0_4px_16px_rgba(0,0,0,0.5)] backdrop-blur-xl transition hover:bg-black/90 hover:border-white/20 active:scale-95"
          >
            Start publishing <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

        {/* slider */}
        <div className="mt-8">
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                const node = document.getElementById('publish-showcase-scroller');
                if (!node) return;
                node.scrollBy({ left: -Math.max(260, Math.round(node.clientWidth * 0.85)), behavior: 'smooth' });
              }}
              className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-10 h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/80 backdrop-blur-xl transition hover:bg-black/60 hover:text-white"
              aria-label="Scroll left"
            >
              <ChevronDown className="h-4 w-4 rotate-90" />
            </button>
            <button
              type="button"
              onClick={() => {
                const node = document.getElementById('publish-showcase-scroller');
                if (!node) return;
                node.scrollBy({ left: Math.max(260, Math.round(node.clientWidth * 0.85)), behavior: 'smooth' });
              }}
              className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-10 h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/80 backdrop-blur-xl transition hover:bg-black/60 hover:text-white"
              aria-label="Scroll right"
            >
              <ChevronDown className="h-4 w-4 -rotate-90" />
            </button>

            {/* Left smoke fade */}
            <div className="pointer-events-none absolute inset-y-0 left-0 z-[5] w-16 sm:w-28 lg:w-40" style={{ background: 'linear-gradient(to right, rgb(13,13,15) 0%, rgba(13,13,15,0.98) 5%, rgba(13,13,15,0.95) 10%, rgba(13,13,15,0.90) 16%, rgba(13,13,15,0.83) 23%, rgba(13,13,15,0.74) 31%, rgba(13,13,15,0.63) 40%, rgba(13,13,15,0.51) 49%, rgba(13,13,15,0.40) 58%, rgba(13,13,15,0.28) 67%, rgba(13,13,15,0.18) 75%, rgba(13,13,15,0.09) 83%, rgba(13,13,15,0.03) 91%, transparent 100%)' }} />
            {/* Right smoke fade */}
            <div className="pointer-events-none absolute inset-y-0 right-0 z-[5] w-16 sm:w-28 lg:w-40" style={{ background: 'linear-gradient(to left, rgb(13,13,15) 0%, rgba(13,13,15,0.98) 5%, rgba(13,13,15,0.95) 10%, rgba(13,13,15,0.90) 16%, rgba(13,13,15,0.83) 23%, rgba(13,13,15,0.74) 31%, rgba(13,13,15,0.63) 40%, rgba(13,13,15,0.51) 49%, rgba(13,13,15,0.40) 58%, rgba(13,13,15,0.28) 67%, rgba(13,13,15,0.18) 75%, rgba(13,13,15,0.09) 83%, rgba(13,13,15,0.03) 91%, transparent 100%)' }} />

            <div
              id="publish-showcase-scroller"
              data-auto-slider="true"
              data-auto-loop="end"
              data-auto-speed="0.32"
              className="no-scrollbar flex gap-4 overflow-x-auto px-4 pb-4 sm:px-8"
              style={{ scrollBehavior: 'auto' }}
            >
              {PUBLISH_SHOWCASE.map((cat) => {
                const CatIcon = cat.icon;
                const m = cat.main as PSMain;
                return (
                  <article
                    key={cat.id}
                    className="snap-start flex w-[min(300px,80vw)] sm:w-[330px] shrink-0 flex-col rounded-[24px] border border-white/[0.09] bg-white/[0.05] p-5 shadow-[0_16px_40px_rgba(0,0,0,0.35)] backdrop-blur-2xl transition-[transform,border-color,background-color] duration-300 hover:-translate-y-[3px] hover:border-white/[0.16] hover:bg-white/[0.08]"
                  >
                    {/* category label + icon */}
                    <div className="flex items-start justify-between gap-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide ${cat.tagCls}`}>
                        <CatIcon className="h-3 w-3" />
                        {cat.label}
                      </span>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide ${cat.tagCls}`}>
                        {m.badge}
                      </span>
                    </div>

                    {/* title */}
                    <h3 className="mt-4 text-[14.5px] font-bold leading-snug tracking-[-0.025em] text-white line-clamp-2">
                      {m.title}
                    </h3>
                    <p className="mt-1 text-[11px] text-white/35 line-clamp-1">{m.byline}</p>

                    {/* body */}
                    <p className="mt-3 text-[12.5px] leading-[1.65] text-white/55 line-clamp-3">{m.body}</p>

                    {/* chips or stats */}
                    {m.chips ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {m.chips.slice(0, 3).map((chip) => (
                          <span key={chip} className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-medium text-white/55">
                            {chip}
                          </span>
                        ))}
                        {m.chips.length > 3 && (
                          <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-medium text-white/35">
                            +{m.chips.length - 3}
                          </span>
                        )}
                      </div>
                    ) : m.stats ? (
                      <div className="mt-3 flex gap-4 border-t border-white/[0.06] pt-3">
                        {m.stats.slice(0, 3).map((s) => (
                          <div key={s.l}>
                            <p className="text-sm font-bold text-white">{s.v}</p>
                            <p className="mt-0.5 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-white/30">{s.l}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {/* footer CTAs */}
                    <div className="mt-auto flex items-center justify-between border-t border-white/[0.06] pt-4 mt-4">
                      <button
                        type="button"
                        onClick={onPublishClick}
                        className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/10 bg-black/70 px-3 text-[12px] font-semibold text-white shadow-[0_4px_12px_rgba(0,0,0,0.5)] backdrop-blur-xl transition hover:bg-black/90 hover:border-white/20 active:scale-95"
                      >
                        {cat.cta} <ArrowRight className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onViewDetails({
                          kind: 'publish-main',
                          badge: m.badge,
                          title: m.title,
                          byline: m.byline,
                          body: m.body,
                          chips: m.chips,
                          stats: m.stats,
                        })}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/50 transition hover:text-white"
                      >
                        View details <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Live Gig Opportunities (part of Publish section) ── */}
        <div className="mt-14 border-t border-white/[0.06] pt-10">
          <div className="flex items-end justify-between gap-4 px-4 sm:px-8">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-white/40 sm:text-[11px]">live opportunities</p>
              <h3 className="mt-1.5 text-xl font-semibold tracking-[-0.04em] text-white sm:text-2xl">
                Gigs & Jobs
              </h3>
              <p className="mt-1 max-w-md text-sm leading-6 text-white/50">
                Top roles from India&apos;s fastest-growing companies — full-time, freelance, and contract.
              </p>
            </div>
          </div>
          <div className="mt-6">
            <div className="relative">
              <button
                type="button"
                onClick={() => { const n = document.getElementById('gigs-scroller'); n?.scrollBy({ left: -Math.max(240, Math.round(n.clientWidth * 0.85)), behavior: 'smooth' }); }}
                className="hidden md:flex absolute left-2 top-[45%] -translate-y-1/2 z-10 h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/80 backdrop-blur-xl transition hover:bg-black/60 hover:text-white"
                aria-label="Scroll left"
              ><ChevronDown className="h-4 w-4 rotate-90" /></button>
              <button
                type="button"
                onClick={() => { const n = document.getElementById('gigs-scroller'); n?.scrollBy({ left: Math.max(240, Math.round(n.clientWidth * 0.85)), behavior: 'smooth' }); }}
                className="hidden md:flex absolute right-2 top-[45%] -translate-y-1/2 z-10 h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/80 backdrop-blur-xl transition hover:bg-black/60 hover:text-white"
                aria-label="Scroll right"
              ><ChevronDown className="h-4 w-4 -rotate-90" /></button>
              {/* Left smoke fade */}
              <div className="pointer-events-none absolute inset-y-0 left-0 z-[5] w-16 sm:w-28 lg:w-40" style={{ background: 'linear-gradient(to right, rgb(13,13,15) 0%, rgba(13,13,15,0.98) 5%, rgba(13,13,15,0.95) 10%, rgba(13,13,15,0.90) 16%, rgba(13,13,15,0.83) 23%, rgba(13,13,15,0.74) 31%, rgba(13,13,15,0.63) 40%, rgba(13,13,15,0.51) 49%, rgba(13,13,15,0.40) 58%, rgba(13,13,15,0.28) 67%, rgba(13,13,15,0.18) 75%, rgba(13,13,15,0.09) 83%, rgba(13,13,15,0.03) 91%, transparent 100%)' }} />
              {/* Right smoke fade */}
              <div className="pointer-events-none absolute inset-y-0 right-0 z-[5] w-16 sm:w-28 lg:w-40" style={{ background: 'linear-gradient(to left, rgb(13,13,15) 0%, rgba(13,13,15,0.98) 5%, rgba(13,13,15,0.95) 10%, rgba(13,13,15,0.90) 16%, rgba(13,13,15,0.83) 23%, rgba(13,13,15,0.74) 31%, rgba(13,13,15,0.63) 40%, rgba(13,13,15,0.51) 49%, rgba(13,13,15,0.40) 58%, rgba(13,13,15,0.28) 67%, rgba(13,13,15,0.18) 75%, rgba(13,13,15,0.09) 83%, rgba(13,13,15,0.03) 91%, transparent 100%)' }} />

              <div
                id="gigs-scroller"
                data-auto-slider="true"
                data-auto-loop="end"
                data-auto-speed="0.28"
                className="no-scrollbar flex gap-4 overflow-x-auto px-4 pb-4 sm:px-8"
                style={{ scrollBehavior: 'auto' }}
              >
                {GIGS_DATA.map((g) => (
                  <article
                    key={g.id}
                    className="snap-start flex w-[min(300px,80vw)] sm:w-[330px] shrink-0 flex-col rounded-[24px] border border-white/[0.09] bg-white/[0.05] p-5 shadow-[0_16px_40px_rgba(0,0,0,0.35)] backdrop-blur-2xl transition-[transform,border-color,background-color] duration-300 hover:-translate-y-[3px] hover:border-white/[0.16] hover:bg-white/[0.08]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${g.logoBg} text-sm font-bold text-white shadow-lg ring-1 ring-white/10`}>
                        {g.logo}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide ${g.typeCls}`}>{g.type}</span>
                        {g.mode === 'bid' && (
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-semibold text-white/40 uppercase tracking-wide">Bidding open</span>
                        )}
                      </div>
                    </div>
                    <h3 className="mt-3.5 text-[14.5px] font-bold leading-snug tracking-[-0.025em] text-white line-clamp-2">{g.title}</h3>
                    <p className="mt-0.5 text-[11px] text-white/40">{g.company} · {g.location}</p>
                    <div className="mt-3 inline-flex w-fit rounded-xl border border-white/[0.08] bg-white/[0.06] px-3 py-1.5 text-sm font-semibold text-white">{g.budget}</div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {g.skills.slice(0, 3).map((s) => (
                        <span key={s} className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[10.5px] font-medium text-white/60">{s}</span>
                      ))}
                      {g.skills.length > 3 && <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[10.5px] font-medium text-white/35">+{g.skills.length - 3}</span>}
                    </div>
                    <div className="mt-auto flex items-center justify-between border-t border-white/[0.06] pt-4 mt-4">
                      <div>
                        <span className="text-[10.5px] text-white/35">{g.posted} · {g.applicants} applied</span>
                        <div className="mt-0.5 text-[10px] text-white/25">{g.openings} opening{g.openings > 1 ? 's' : ''} · Deadline {g.deadline}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onViewDetails({
                          kind: 'gig', id: g.id, title: g.title, company: g.company, logo: g.logo, logoBg: g.logoBg,
                          location: g.location, budget: g.budget, type: g.type, mode: g.mode as 'apply' | 'bid', typeCls: g.typeCls,
                          skills: g.skills, description: g.description, requirements: g.requirements, posted: g.posted,
                          applicants: g.applicants, openings: g.openings, deadline: g.deadline, experience: g.experience,
                          companySize: g.companySize, rating: g.rating, perks: g.perks, process: g.process,
                        })}
                        className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-white/55 transition hover:text-white"
                      >
                        {g.mode === 'bid' ? 'Place bid' : 'View & apply'} <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
    </section>
  );
}

function TalentsSection({ onViewDetails }: { onViewDetails: (d: SliderDetails) => void }) {
  return (
    <section className="reveal-on-scroll mt-16 w-full" data-reveal data-delay="80">
      <div className="px-4 sm:px-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-white/40 sm:text-[11px]">verified professionals</p>
            <h2 className="mt-1.5 text-2xl font-semibold tracking-[-0.05em] text-white sm:text-3xl">
              Talent Network
            </h2>
            <p className="mt-1 max-w-md text-sm leading-6 text-white/50">
              Senior designers, engineers, and writers from top Indian companies — ready to hire.
            </p>
          </div>
          <Link
            href="/talent"
            className="hidden sm:inline-flex h-9 items-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-xs font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            Browse all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

        <div className="mt-8">
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                const node = document.getElementById('talents-scroller');
                if (!node) return;
                node.scrollBy({ left: -Math.max(240, Math.round(node.clientWidth * 0.85)), behavior: 'smooth' });
              }}
              className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-10 h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/80 backdrop-blur-xl transition hover:bg-black/60 hover:text-white"
              aria-label="Scroll left"
            >
              <ChevronDown className="h-4 w-4 rotate-90" />
            </button>
            <button
              type="button"
              onClick={() => {
                const node = document.getElementById('talents-scroller');
                if (!node) return;
                node.scrollBy({ left: Math.max(240, Math.round(node.clientWidth * 0.85)), behavior: 'smooth' });
              }}
              className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-10 h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/80 backdrop-blur-xl transition hover:bg-black/60 hover:text-white"
              aria-label="Scroll right"
            >
              <ChevronDown className="h-4 w-4 -rotate-90" />
            </button>

            {/* Left smoke fade */}
            <div className="pointer-events-none absolute inset-y-0 left-0 z-[5] w-16 sm:w-28 lg:w-40" style={{ background: 'linear-gradient(to right, rgb(13,13,15) 0%, rgba(13,13,15,0.98) 5%, rgba(13,13,15,0.95) 10%, rgba(13,13,15,0.90) 16%, rgba(13,13,15,0.83) 23%, rgba(13,13,15,0.74) 31%, rgba(13,13,15,0.63) 40%, rgba(13,13,15,0.51) 49%, rgba(13,13,15,0.40) 58%, rgba(13,13,15,0.28) 67%, rgba(13,13,15,0.18) 75%, rgba(13,13,15,0.09) 83%, rgba(13,13,15,0.03) 91%, transparent 100%)' }} />
            {/* Right smoke fade */}
            <div className="pointer-events-none absolute inset-y-0 right-0 z-[5] w-16 sm:w-28 lg:w-40" style={{ background: 'linear-gradient(to left, rgb(13,13,15) 0%, rgba(13,13,15,0.98) 5%, rgba(13,13,15,0.95) 10%, rgba(13,13,15,0.90) 16%, rgba(13,13,15,0.83) 23%, rgba(13,13,15,0.74) 31%, rgba(13,13,15,0.63) 40%, rgba(13,13,15,0.51) 49%, rgba(13,13,15,0.40) 58%, rgba(13,13,15,0.28) 67%, rgba(13,13,15,0.18) 75%, rgba(13,13,15,0.09) 83%, rgba(13,13,15,0.03) 91%, transparent 100%)' }} />

            <div
              id="talents-scroller"
              data-auto-slider="true"
              data-auto-loop="end"
              data-auto-speed="0.28"
              className="no-scrollbar flex gap-4 overflow-x-auto px-4 pb-4 sm:px-8"
              style={{ scrollBehavior: 'auto' }}
            >
              {TALENTS_DATA.map((t) => (
                <article
                  key={t.id}
                  className="snap-start flex w-[min(300px,80vw)] sm:w-[330px] shrink-0 flex-col rounded-[24px] border border-white/[0.09] bg-white/[0.05] p-5 shadow-[0_16px_40px_rgba(0,0,0,0.35)] backdrop-blur-2xl transition-[transform,border-color,background-color,box-shadow] duration-300 hover:-translate-y-[3px] hover:border-white/[0.16] hover:bg-white/[0.08] hover:shadow-[0_20px_50px_rgba(0,0,0,0.45)]"
                >
                  {/* Avatar + availability */}
                  <div className="flex items-start justify-between gap-3">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${t.avatarBg} text-base font-bold text-white shadow-lg`}>
                      {t.avatar}
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide ${t.availCls}`}>
                      {t.availability}
                    </span>
                  </div>

                  {/* Name + title */}
                  <div className="mt-3.5">
                    <h3 className="text-[15px] font-bold tracking-[-0.025em] text-white">{t.name}</h3>
                    <p className="mt-0.5 text-xs text-white/45">{t.title}</p>
                  </div>

                  {/* Stats row */}
                  <div className="mt-3 flex gap-4 text-xs">
                    <div>
                      <span className="font-semibold text-white">{t.experience}</span>
                      <span className="ml-1 text-white/40">exp</span>
                    </div>
                    <div>
                      <span className="font-semibold text-white">{t.projects}</span>
                      <span className="ml-1 text-white/40">projects</span>
                    </div>
                    <div>
                      <span className="font-semibold text-white">{t.rating}★</span>
                    </div>
                  </div>

                  {/* Skills */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {t.skills.slice(0, 3).map((s) => (
                      <span key={s} className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[10.5px] font-medium text-white/60">
                        {s}
                      </span>
                    ))}
                    {t.skills.length > 3 && (
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[10.5px] font-medium text-white/40">
                        +{t.skills.length - 3}
                      </span>
                    )}
                  </div>

                  {/* Rate + CTA */}
                  <div className="mt-auto flex items-center justify-between border-t border-white/[0.06] pt-4 mt-4">
                    <div>
                      <span className="text-sm font-bold text-white">{t.rate}</span>
                      <span className="ml-1 text-[11px] text-white/35">· {t.location}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onViewDetails({
                        kind: 'talent',
                        id: t.id,
                        slug: t.slug,
                        name: t.name,
                        title: t.title,
                        location: t.location,
                        experience: t.experience,
                        rate: t.rate,
                        availability: t.availability,
                        availCls: t.availCls,
                        skills: t.skills,
                        bio: t.bio,
                        projects: t.projects,
                        rating: t.rating,
                        badges: t.badges,
                        pastWork: t.pastWork,
                      })}
                      className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-white/60 transition hover:text-white"
                    >
                      View details <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
    </section>
  );
}

function compactText(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 1500);
}

function formatBytes(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = sizeBytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unitIndex]}`;
}

function guessExtension(name: string) {
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

function formatRelative(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = Date.now();
  const diff = Math.max(0, now - date.getTime());
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  const sameDay = new Date(now).toDateString() === date.toDateString();
  if (sameDay) return `Today, ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function buildWelcomeMessages(): ChatMessage[] {
  return [];
}

/* ─────────────────────────────────────────────────────────────
   AnimatedSphere — dark 3-D globe for the hero banner
───────────────────────────────────────────────────────────── */
function AnimatedSphere() {
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full" aria-hidden="true">
      <defs>
        <radialGradient id="sg-base" cx="36%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#252830" />
          <stop offset="55%" stopColor="#111316" />
          <stop offset="100%" stopColor="#070809" />
        </radialGradient>
        <radialGradient id="sg-shine" cx="26%" cy="20%" r="46%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.20)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <radialGradient id="sg-teal" cx="70%" cy="75%" r="40%">
          <stop offset="0%" stopColor="rgba(52,211,153,0.14)" />
          <stop offset="100%" stopColor="rgba(52,211,153,0)" />
        </radialGradient>
        <clipPath id="sg-clip">
          <circle cx="100" cy="100" r="88" />
        </clipPath>
        <style>{`
          @keyframes sg-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes sg-spin-slow { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
          @keyframes sg-pulse { 0%,100% { opacity:0.55; } 50% { opacity:1; } }
          .sg-lat { animation: sg-spin 20s linear infinite; transform-origin: 100px 100px; }
          .sg-mer { animation: sg-spin-slow 28s linear infinite; transform-origin: 100px 100px; }
          .sg-glow { animation: sg-pulse 4s ease-in-out infinite; }
        `}</style>
      </defs>
      {/* Drop shadow */}
      <ellipse cx="100" cy="196" rx="68" ry="7" fill="rgba(0,0,0,0.4)" />
      {/* Base sphere */}
      <circle cx="100" cy="100" r="88" fill="url(#sg-base)" />
      {/* Teal accent glow on lower-right */}
      <circle cx="100" cy="100" r="88" fill="url(#sg-teal)" className="sg-glow" />
      {/* Latitude grid lines */}
      <g clipPath="url(#sg-clip)" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.85" className="sg-lat">
        {([-60, -44, -28, -12, 4, 20, 36, 52, 68] as const).map((lat) => {
          const ry = Math.sqrt(Math.max(0, 88 * 88 - lat * lat));
          return <ellipse key={`lat${lat}`} cx="100" cy={100 + lat} rx={ry} ry={ry * 0.30} />;
        })}
      </g>
      {/* Meridian grid lines */}
      <g clipPath="url(#sg-clip)" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="0.85" className="sg-mer">
        {([0, 36, 72, 108, 144] as const).map((angle) => (
          <ellipse
            key={`mer${angle}`}
            cx="100" cy="100"
            rx={Math.max(2, 88 * Math.abs(Math.cos((angle * Math.PI) / 180)))}
            ry="88"
            transform={`rotate(${angle} 100 100)`}
          />
        ))}
      </g>
      {/* Specular highlight */}
      <circle cx="100" cy="100" r="88" fill="url(#sg-shine)" />
      {/* Rim highlight */}
      <circle cx="100" cy="100" r="88" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1.5" />
      {/* Teal accent dot */}
      <circle cx="142" cy="138" r="4" fill="rgba(52,211,153,0.6)" className="sg-glow" />
      <circle cx="142" cy="138" r="8" fill="rgba(52,211,153,0.12)" className="sg-glow" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────
   HomepageLiveFeed — infinite-scroll published feed after
   the Professionals grid. Mirrors the PublishedPage card style
   with left + right sidebars on desktop.
───────────────────────────────────────────────────────────── */
const HP_TABS = [
  { id: 'all',          label: 'All',        icon: SlidersHorizontal },
  { id: 'featured',     label: 'Featured',   icon: Sparkles },
  { id: 'news',         label: 'News',       icon: Newspaper },
  { id: 'article',      label: 'Articles',   icon: BookOpen },
  { id: 'document',     label: 'Docs',       icon: FileText },
  { id: 'portfolio',    label: 'Portfolio',  icon: Layers },
  { id: 'announcement', label: 'Announce',   icon: Megaphone },
  { id: 'job',          label: 'Jobs',       icon: Briefcase },
  { id: 'resume',       label: 'Resumes',    icon: User },
  { id: 'product',      label: 'Products',   icon: Package },
  { id: 'event',        label: 'Events',     icon: CalendarDays },
  { id: 'hackathon',    label: 'Hackathons', icon: Terminal },
  { id: 'post',         label: 'Posts',      icon: ImageIcon },
  { id: 'poll',         label: 'Polls',      icon: ListChecks },
  { id: 'survey',       label: 'Surveys',    icon: ClipboardList },
  { id: 'chart',        label: 'Charts',     icon: BarChart2 },
  { id: 'thread',       label: 'Threads',    icon: MessageSquare },
  { id: 'video',        label: 'Videos',     icon: Video },
  { id: 'milestone',    label: 'Milestones', icon: Award },
  { id: 'tutorial',     label: 'Tutorials',  icon: BookMarked },
  { id: 'gig',          label: 'Gigs',       icon: Zap },
] as const;

const HP_TAG_CLS: Record<string, string> = {
  all:          'bg-white/10 text-white/70 border-white/10',
  featured:     'bg-amber-500/10 text-amber-400 border-amber-500/20',
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
  gig:          'bg-white/[0.08] text-white/70 border-white/[0.10]',
  post:         'bg-rose-500/10 text-rose-400 border-rose-500/20',
  poll:         'bg-violet-500/10 text-violet-400 border-violet-500/20',
  survey:       'bg-amber-500/10 text-amber-400 border-amber-500/20',
  chart:        'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  thread:       'bg-sky-500/10 text-sky-400 border-sky-500/20',
  video:        'bg-red-500/10 text-red-400 border-red-500/20',
  milestone:    'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  tutorial:     'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
};
type HpFeedItem = {
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
  likesCount?: number;
  likedByViewer?: boolean;
  commentsCount?: number;
  trendCount?: number;
  trendedByViewer?: boolean;
  thumbnailUrl?: string;
  avatarUrl?: string;
  uploadedByUserId?: string;
  uploadedByName?: string;
};

function hpTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

const HP_AVATAR_CLS = 'bg-white/[0.07] text-white/55';
const HP_PAGE_SIZE  = 8;
const HP_META_LINE_RE = /^(Registration URL|Shop URL|WhatsApp|Application URL|Website|Contact|Email|Phone)\s*:/i;
/* Hide filenames / generic defaults. Photo-post caption is item.body (notes), never title. */
const HP_JUNK_TITLE_RE = /\.\w{2,5}$/;
const HP_GENERIC_TITLES = new Set(['post', 'poll', 'document', 'file', 'image', 'photo', 'video', 'survey', 'article', 'upload']);
function hpIsJunkTitle(item: { title: string }): boolean {
  const t = item.title.trim().toLowerCase();
  return HP_JUNK_TITLE_RE.test(t) || HP_GENERIC_TITLES.has(t);
}
/** Real user-written caption for a photo post = body/notes, not title. */
function hpHasRealCaption(body?: string): boolean {
  return Boolean(body && body.trim());
}
/**
 * Sidebar label: for posts use caption/body only (never title/filename).
 * Returns '' when there is nothing real to show.
 */
function hpFeedLabel(item: { title: string; body?: string; category?: string }): string {
  if (item.category === 'post') {
    return hpHasRealCaption(item.body) ? hpGetBodySnippet(item.body!, 80) : '';
  }
  if (!hpIsJunkTitle(item)) return item.title;
  return hpHasRealCaption(item.body) ? hpGetBodySnippet(item.body!, 80) : '';
}
function hpGetBodySnippet(raw: string, maxLen = 200): string {
  const cleaned = raw.replace(/https?:\/\/\S+/gi, '').replace(/\s{2,}/g, ' ').trim();
  const prose = cleaned.split(/\n+/)
    .filter(l => l.trim() && !HP_META_LINE_RE.test(l.trim()))
    .join(' ')
    .trim();
  return prose.length > maxLen ? `${prose.slice(0, maxLen).trimEnd()}…` : prose;
}

/* ── universal metadata chip renderer ──────────────────────────── */
type HpMetaChip = { icon: React.ReactNode; label: string; value: string };

const ic = (I: React.ComponentType<{ className?: string }>) => <I className="h-3 w-3" />;

/* strip URLs + Apply/Problem/Eligibility noise before parsing */
function hpCleanBody(raw: string) {
  return raw
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\b(Apply\s*(URL|Link|Here)?|Problem\s*Statements?|Eligibility|About\s*Us|Description)\s*:[^:]*?(?=\s+\w[\w\s/]*:|$)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const HP_KV_FIELDS: { re: RegExp; label: string; icon: React.ReactNode }[] = [
  { re: /(?:Job|Job\s*Title|Position|Role)\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i, label: 'ROLE',       icon: ic(Briefcase) },
  { re: /Company\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i,                           label: 'COMPANY',     icon: ic(Briefcase) },
  { re: /Hackathon\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i,                         label: 'HACKATHON',   icon: ic(Zap) },
  { re: /Organisers?\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i,                       label: 'ORGANISER',   icon: ic(User) },
  { re: /(?:Themes?(?:\s*[/]\s*Tracks?)?)\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i, label: 'TRACKS',      icon: ic(Target) },
  { re: /Prize\s*Pool\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i,                      label: 'PRIZE POOL',  icon: ic(Trophy) },
  { re: /(?:Salary|CTC|Stipend|Compensation|Package)\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i, label: 'SALARY', icon: ic(Tag) },
  { re: /Team\s*Size\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i,                       label: 'TEAM SIZE',   icon: ic(Users) },
  { re: /(?:Location|City|Venue|Place)\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i,     label: 'LOCATION',    icon: ic(MapPin) },
  { re: /(?:Work\s*)?(?:Mode|Type)\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i,         label: 'MODE',        icon: ic(MapPin) },
  { re: /Event\s*Dates?\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i,                    label: 'DATE',        icon: ic(CalendarDays) },
  { re: /(?:Registration\s*)?Deadline\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i,      label: 'DEADLINE',    icon: ic(CalendarDays) },
  { re: /Experience\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i,                        label: 'EXPERIENCE',  icon: ic(Star) },
  { re: /Skills?\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i,                           label: 'SKILLS',      icon: ic(Sparkles) },
  { re: /Industry\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i,                          label: 'INDUSTRY',    icon: ic(Globe) },
];

/* 2. byline-based chips per category */
function hpBylineChips(byline: string, category: string): HpMetaChip[] {
  const parts = byline.split(/\s*·\s*/).map(s => s.trim()).filter(Boolean);
  const chips: HpMetaChip[] = [];
  const cat = category.toLowerCase();

  if (cat === 'news' || cat === 'article') {
    const read = parts.find(p => /min read/i.test(p));
    if (read) chips.push({ icon: ic(Clock), label: 'READ TIME', value: read });
    return chips;
  }
  if (cat === 'document') {
    parts.forEach(p => {
      if (/\d+\s*pages?/i.test(p))          chips.push({ icon: ic(FileText), label: 'PAGES',  value: p });
      else if (/\d+.*\b(mb|kb|gb)\b/i.test(p)) chips.push({ icon: ic(Info),    label: 'SIZE',   value: p });
      else if (/^(pdf|docx|xlsx|pptx|zip)$/i.test(p)) chips.push({ icon: ic(FileText), label: 'FORMAT', value: p.toUpperCase() });
    });
    return chips;
  }
  if (cat === 'job') {
    if (parts[0]) chips.push({ icon: ic(Briefcase), label: 'COMPANY',  value: parts[0] });
    if (parts[1]) chips.push({ icon: ic(Target),    label: 'TEAM',     value: parts[1] });
    if (parts[2]) chips.push({ icon: ic(MapPin),    label: 'LOCATION', value: parts[2] });
    return chips;
  }
  if (cat === 'resume') {
    if (parts[0]) chips.push({ icon: ic(Briefcase), label: 'ROLE',     value: parts[0] });
    const exp = parts.find(p => /yr|year|exp/i.test(p));
    if (exp) chips.push({ icon: ic(Star), label: 'EXPERIENCE', value: exp });
    const loc = parts.find(p => /,\s*[A-Z]{2}$/.test(p) || /\b(remote|bengaluru|mumbai|delhi|hyderabad|pune|chennai)\b/i.test(p));
    if (loc) chips.push({ icon: ic(MapPin), label: 'LOCATION', value: loc });
    return chips;
  }
  if (cat === 'event') {
    if (parts[0]) chips.push({ icon: ic(User),        label: 'ORGANISER', value: parts[0] });
    if (parts[1]) chips.push({ icon: ic(MapPin),      label: 'VENUE',     value: parts[1] });
    if (parts[2]) chips.push({ icon: ic(CalendarDays),label: 'DATE',      value: parts[2] });
    return chips;
  }
  if (cat === 'announcement') {
    if (parts[0]) chips.push({ icon: ic(Megaphone), label: 'FROM',    value: parts[0] });
    const reach = parts.find(p => /sent to/i.test(p));
    if (reach) chips.push({ icon: ic(Users), label: 'REACHED', value: reach.replace(/sent to\s*/i, '') });
    return chips;
  }
  if (cat === 'product') {
    const price = parts.find(p => /[₹$€£]/.test(p) || /month|annual|lpa/i.test(p));
    if (price) chips.push({ icon: ic(Tag), label: 'PRICING', value: price });
    const billing = parts.find(p => /billing|annual|monthly/i.test(p));
    if (billing && billing !== price) chips.push({ icon: ic(Info), label: 'BILLING', value: billing });
    return chips;
  }
  if (cat === 'portfolio') {
    const clientPart = parts.find(p => /^client\s*:/i.test(p));
    if (clientPart) chips.push({ icon: ic(Briefcase), label: 'CLIENT', value: clientPart.replace(/^client\s*:\s*/i, '') });
    const work = parts.find(p => /(design|dev|engineering|ux|ui|research)/i.test(p));
    if (work) chips.push({ icon: ic(Sparkles), label: 'WORK TYPE', value: work });
    const year = parts.find(p => /^\d{4}$/.test(p.trim()));
    if (year) chips.push({ icon: ic(CalendarDays), label: 'YEAR', value: year });
    return chips;
  }
  return chips;
}

/* combined parser — structured body first, then byline */
function hpBuildChips(body: string, byline: string, category: string): HpMetaChip[] {
  const cleaned = hpCleanBody(body);
  const kvChips: HpMetaChip[] = [];
  for (const { re, label, icon } of HP_KV_FIELDS) {
    const m = cleaned.match(re);
    if (m) {
      const val = m[1].trim();
      if (val && val.length < 60) kvChips.push({ icon, label, value: val });
    }
  }
  if (kvChips.length >= 2) return kvChips;
  return hpBylineChips(byline, category);
}

function HpMetaChips({ body, byline, category }: { body: string; byline: string; category: string }) {
  const chips = hpBuildChips(body, byline, category).slice(0, 5);
  if (!chips.length) return (
    <p className="mt-1.5 text-[13px] leading-relaxed text-white/50 line-clamp-2">
      {hpGetBodySnippet(body)}
    </p>
  );
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {chips.map(c => (
        <span key={c.label}
          className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.05] px-3 py-1.5 backdrop-blur-sm">
          <span className="text-white/40 shrink-0">{c.icon}</span>
          <span className="text-[9px] font-bold tracking-[0.12em] uppercase text-white/30">{c.label}</span>
          <span className="text-[12px] font-semibold text-white/80 max-w-[120px] truncate">{c.value}</span>
        </span>
      ))}
    </div>
  );
}


/**
 * Memoised: the feed container re-renders on scroll, sort, category and trend
 * updates, and without this every visible card re-rendered with it. `item`
 * object identity is stable between fetches, so a shallow compare is enough.
 */
const HomepageFeedCard = React.memo(function HomepageFeedCard({ item }: { item: HpFeedItem }) {
  const router = useRouter();
  const [liked,      setLiked]      = React.useState(item.likedByViewer ?? false);
  const [likeCount,  setLikeCount]  = React.useState(item.likesCount ?? 0);
  const [trended,    setTrended]    = React.useState(() => {
    const stored = hpReadTrends()[item.id];
    return stored ? stored.trendedByViewer : (item.trendedByViewer ?? false);
  });
  const [trendCount, setTrendCount] = React.useState(() => {
    const stored = hpReadTrends()[item.id];
    return stored ? stored.count : (item.trendCount ?? 0);
  });
  const [saved,      setSaved]      = React.useState(false);
  const likeInFlight  = React.useRef(false);
  const trendInFlight = React.useRef(false);
  const postHref = `/published/${item.shareId || item.id}`;

  React.useEffect(() => { setLiked(item.likedByViewer ?? false); }, [item.likedByViewer]);
  React.useEffect(() => { setLikeCount(item.likesCount ?? 0); }, [item.likesCount]);

  const displayName = item.uploadedByName || item.byline.split(' · ')[0] || 'Docrud User';
  const bylineParts = item.byline.split(' · ').map((s: string) => s.trim());
  const authorMeta  = bylineParts.slice(1).join(' · ');
  const initials    = displayName.split(/\s+/).slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? '').join('');
  const profileHref = item.uploadedByUserId ? `/u/${item.uploadedByUserId}` : null;

  return (
    <article
      className="group py-5 px-4 sm:px-0 cursor-pointer"
      role="link"
      tabIndex={0}
      onClick={() => router.push(postHref)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(postHref); } }}
    >
      {/* header */}
      <div className="flex items-center gap-3 mb-3.5">
        {profileHref ? (
          <Link href={profileHref} onClick={e => e.stopPropagation()}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[11px] font-bold overflow-hidden ${HP_AVATAR_CLS} hover:opacity-80 transition`}>
            {item.avatarUrl
              ? <img src={item.avatarUrl} alt={displayName} className="h-full w-full object-cover" />
              : (initials.slice(0, 2) || <Newspaper className="h-3.5 w-3.5 opacity-60" />)}
          </Link>
        ) : (
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[11px] font-bold overflow-hidden ${HP_AVATAR_CLS}`}>
            {item.avatarUrl
              ? <img src={item.avatarUrl} alt={displayName} className="h-full w-full object-cover" />
              : (initials.slice(0, 2) || <Newspaper className="h-3.5 w-3.5 opacity-60" />)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {profileHref ? (
              <Link href={profileHref} onClick={e => e.stopPropagation()}
                className="text-[13.5px] font-semibold text-white leading-tight truncate hover:text-white/80 transition">
                {displayName}
              </Link>
            ) : (
              <span className="text-[13.5px] font-semibold text-white leading-tight truncate">{displayName}</span>
            )}
            {/* Presence — green only while the author is genuinely online now. */}
            <PresenceDot userId={item.uploadedByUserId} size="sm" />
          </div>
          <p className="text-[11px] text-white/35 mt-0.5 truncate">
            {item.badge}{authorMeta ? ` · ${authorMeta}` : ''} · {hpTimeAgo(item.postedAt)}
          </p>
        </div>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); setSaved(v => !v); }}
          className={`transition shrink-0 ${saved ? 'text-white/70' : 'text-white/25 hover:text-white/60'}`}
        >
          <Bookmark className={`h-4 w-4 ${saved ? 'fill-current' : ''}`} />
        </button>
      </div>

      {/* thumbnail — full-bleed on mobile (matches /published feed) */}
      {item.thumbnailUrl && (
        <div className="mb-3.5 -mx-4 sm:mx-0 sm:rounded-xl overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.thumbnailUrl}
            alt={item.category === 'post' || hpIsJunkTitle(item) ? '' : item.title}
            className="w-full max-h-[380px] object-cover transition-transform duration-500 group-hover:scale-[1.01]"
            loading="lazy"
            decoding="async"
          />
        </div>
      )}

      {/* content — photo posts: caption = body only; never show auto title/filename */}
      <div>
        {item.category !== 'post' && !hpIsJunkTitle(item) && (
          <h3 className="text-[15px] font-bold leading-snug tracking-tight text-white line-clamp-2 group-hover:text-white/85 transition-colors">
            {item.title}
          </h3>
        )}
        {hpHasRealCaption(item.body) && (
          <p className={`text-[13px] leading-relaxed text-white/50 line-clamp-2 ${item.category !== 'post' && !hpIsJunkTitle(item) ? 'mt-1.5' : ''}`}>
            {hpGetBodySnippet(item.body)}
          </p>
        )}
      </div>

      {/* stats */}
      {item.stats && (
        <div className="flex items-center gap-5 mt-3">
          {item.stats.slice(0, 3).map(s => (
            <div key={s.l} className="flex items-baseline gap-1.5">
              <span className="text-[13.5px] font-bold text-white/75 tabular-nums">{s.v}</span>
              <span className="text-[9.5px] font-semibold uppercase tracking-widest text-white/25">{s.l}</span>
            </div>
          ))}
        </div>
      )}

      {/* engagement row */}
      <div className="flex items-center gap-3 mt-3.5 pt-3.5 border-t border-white/[0.05]" onClick={e => e.stopPropagation()}>
        <button
          type="button"
          onClick={async e => {
            e.stopPropagation();
            if (likeInFlight.current) return;
            const newLiked = !liked;
            setLiked(newLiked);
            setLikeCount(c => newLiked ? c + 1 : Math.max(0, c - 1));
            if (item.isReal) {
              likeInFlight.current = true;
              try {
                const res = await fetch(`/api/published/${item.id}/like`, { method: 'POST' });
                if (res.ok) {
                  const d = await res.json() as { liked: boolean; likesCount: number };
                  setLiked(d.liked); setLikeCount(d.likesCount);
                } else { setLiked(liked); setLikeCount(c => newLiked ? Math.max(0, c - 1) : c + 1); }
              } catch { setLiked(liked); } finally { likeInFlight.current = false; }
            }
          }}
          className={`flex items-center gap-1.5 text-[12px] font-semibold transition ${liked ? 'text-rose-400' : 'text-white/35 hover:text-white/70'}`}
        >
          <Heart className={`h-4 w-4 transition-transform ${liked ? 'fill-current scale-110' : ''}`} />
          <span>{likeCount > 0 ? (likeCount >= 1000 ? `${(likeCount/1000).toFixed(1)}k` : String(likeCount)) : (liked ? 'Liked' : 'Like')}</span>
        </button>
        <Link
          href={postHref}
          className="flex items-center gap-1.5 text-[12px] font-semibold text-white/35 hover:text-white/70 transition"
          onClick={e => e.stopPropagation()}
        >
          <MessageSquare className="h-4 w-4" />
          <span>{item.commentsCount ? (item.commentsCount >= 1000 ? `${(item.commentsCount/1000).toFixed(1)}k` : String(item.commentsCount)) : 'Comment'}</span>
        </Link>
        <button
          type="button"
          onClick={async e => {
            e.stopPropagation();
            if (trendInFlight.current) return;
            const next = !trended;
            setTrended(next);
            setTrendCount(c => next ? c + 1 : Math.max(0, c - 1));
            hpWriteTrend(item, next);
            if (item.isReal) {
              trendInFlight.current = true;
              try {
                const res = await fetch(`/api/published/${item.id}/trend`, { method: 'POST' });
                if (res.ok) {
                  const d = await res.json() as { trended: boolean; trendCount: number };
                  setTrended(d.trended);
                  setTrendCount(d.trendCount);
                  hpWriteTrend(item, d.trended);
                } else {
                  setTrended(trended);
                  setTrendCount(c => next ? Math.max(0, c - 1) : c + 1);
                  hpWriteTrend(item, trended);
                }
              } catch {
                setTrended(trended);
                hpWriteTrend(item, trended);
              } finally { trendInFlight.current = false; }
            }
          }}
          className={`flex items-center gap-1.5 text-[12px] font-semibold transition ${trended ? 'text-orange-400' : 'text-white/35 hover:text-white/70'}`}
        >
          <TrendingUp className={`h-4 w-4 transition-transform ${trended ? 'scale-110' : ''}`} />
          <span>{trendCount > 0 ? (trendCount >= 1000 ? `${(trendCount/1000).toFixed(1)}k` : String(trendCount)) : (trended ? 'Trending' : 'Trend')}</span>
        </button>
        <button
          type="button"
          className="ml-auto flex items-center gap-1.5 text-[12px] font-semibold text-white/25 hover:text-white/55 transition"
          onClick={async e => {
            e.stopPropagation();
            const url = `${window.location.origin}${postHref}`;
            if (navigator.share) { try { await navigator.share({ title: item.title, url }); return; } catch {} }
            await navigator.clipboard.writeText(url).catch(() => {});
          }}
        >
          <Share2 className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
});

/* localStorage helpers — mirror PublishedPage */
type HpTrendEntry = { count: number; trendedByViewer: boolean; category: string; title: string; chips: string[] };
type HpTrendHistoryEntry = { postId: string; title: string; category: string; trendedAt: number; tags: string[] };
const hpReadTrends       = (): Record<string, HpTrendEntry>       => { try { return JSON.parse(localStorage.getItem('pub_trends')        || '{}'); } catch { return {}; } };
const hpReadTagTrends    = (): Record<string, number>             => { try { return JSON.parse(localStorage.getItem('pub_tag_trends')    || '{}'); } catch { return {}; } };
const hpReadCatTrends    = (): Record<string, number>             => { try { return JSON.parse(localStorage.getItem('pub_cat_trends')    || '{}'); } catch { return {}; } };
const hpReadTrendHistory = (): HpTrendHistoryEntry[]              => { try { return JSON.parse(localStorage.getItem('pub_trend_history') || '[]'); } catch { return []; } };

function hpWriteTrend(item: HpFeedItem, next: boolean) {
  const delta = next ? 1 : -1;
  try {
    const data = hpReadTrends();
    const stored = data[item.id] ?? { count: 0, trendedByViewer: false, category: item.category, title: item.title, chips: item.chips ?? [] };
    stored.count = Math.max(0, stored.count + delta);
    stored.trendedByViewer = next;
    localStorage.setItem('pub_trends', JSON.stringify({ ...data, [item.id]: stored }));
  } catch {}
  try {
    const tagData = hpReadTagTrends();
    [...(item.chips ?? []), item.category].forEach(t => { tagData[t] = Math.max(0, (tagData[t] ?? 0) + delta); });
    localStorage.setItem('pub_tag_trends', JSON.stringify(tagData));
  } catch {}
  try {
    const catData = hpReadCatTrends();
    catData[item.category] = Math.max(0, (catData[item.category] ?? 0) + delta);
    localStorage.setItem('pub_cat_trends', JSON.stringify(catData));
  } catch {}
  if (next) try {
    const hist = hpReadTrendHistory();
    hist.unshift({ postId: item.id, title: item.title, category: item.category, trendedAt: Date.now(), tags: item.chips ?? [] });
    localStorage.setItem('pub_trend_history', JSON.stringify(hist.slice(0, 200)));
  } catch {}
}

function HomepageLiveFeed() {
  const [allItems,   setAllItems]   = React.useState<HpFeedItem[]>([]);
  const [page,       setPage]       = React.useState(1);
  const [loading,    setLoading]    = React.useState(true);
  const [activecat,  setActivecat]  = React.useState<string>('all');
  const [tagSearch,  setTagSearch]  = React.useState<string>('');
  const [sort,       setSort]       = React.useState<'Recent' | 'Popular' | 'Oldest'>('Recent');
  const [tabsVisible, setTabsVisible] = React.useState(true);
  const tabsLastY  = React.useRef(0);
  const tabsTicking = React.useRef(false);

  /* trend state — synced from localStorage every 2s like PublishedPage */
  const [trends,    setTrends]    = React.useState<Record<string, HpTrendEntry>>({});
  const [tagTrends, setTagTrends] = React.useState<Record<string, number>>({});
  const [catTrends, setCatTrends] = React.useState<Record<string, number>>({});
  const [history,   setHistory]   = React.useState<HpTrendHistoryEntry[]>([]);

  const [newItems,   setNewItems]   = React.useState<HpFeedItem[]>([]);
  const [refreshing, setRefreshing] = React.useState(false);
  const knownIds = React.useRef<Set<string>>(new Set());
  const sentinelRef = React.useRef<HTMLDivElement>(null);

  /* initial load */
  React.useEffect(() => {
    const controller = new AbortController();
    fetch('/api/public/published?limit=20', { signal: controller.signal })
      .then(r => r.json())
      .then((d: { items?: HpFeedItem[]; total?: number; hasMore?: boolean }) => {
        if (!Array.isArray(d.items)) return;
        setAllItems(d.items);
        d.items.forEach(i => knownIds.current.add(i.id));
      })
      .catch(() => { /* aborted or offline — the poll below reconciles */ })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    // React 18 StrictMode double-mounts in dev; aborting stops the duplicate.
    return () => controller.abort();
  }, []);

  /* poll every 60s for new posts */
  React.useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch('/api/public/published?limit=20');
        if (!r.ok) return;
        const d = await r.json() as { items?: HpFeedItem[] };
        if (!Array.isArray(d.items)) return;
        const fresh = d.items.filter(i => !knownIds.current.has(i.id));
        if (fresh.length > 0) setNewItems(fresh);
      } catch { /* ignore */ }
    };
    const iv = setInterval(poll, 60_000);
    return () => clearInterval(iv);
  }, []);

  const applyRefresh = React.useCallback(() => {
    if (newItems.length === 0) {
      /* manual hard refresh */
      setRefreshing(true);
      fetch('/api/public/published')
        .then(r => r.json())
        .then((d: { items?: HpFeedItem[] }) => {
          if (!Array.isArray(d.items)) return;
          setAllItems(d.items);
          d.items.forEach(i => knownIds.current.add(i.id));
          setPage(1);
        })
        .catch(() => {})
        .finally(() => setRefreshing(false));
    } else {
      setAllItems(prev => {
        const merged = [...newItems, ...prev];
        const seen = new Set<string>();
        const deduped = merged.filter(i => { if (seen.has(i.id)) return false; seen.add(i.id); return true; });
        deduped.forEach(i => knownIds.current.add(i.id));
        return deduped;
      });
      setNewItems([]);
      setPage(1);
    }
  }, [newItems]);

  /**
   * Trend counters live in localStorage and are written by this same tab.
   *
   * This used to poll every 2 s and unconditionally setState four times, so the
   * whole feed re-rendered every 2 seconds forever even when nothing had
   * changed (fresh array identities defeat any downstream memoisation).
   *
   * Now: poll far less often, and only setState when the serialised value has
   * actually changed. A tab left open costs nothing.
   */
  React.useEffect(() => {
    let lastSignature = '';
    const sync = () => {
      const next = {
        trends: hpReadTrends(),
        tagTrends: hpReadTagTrends(),
        catTrends: hpReadCatTrends(),
        history: hpReadTrendHistory(),
      };
      const signature = JSON.stringify(next);
      if (signature === lastSignature) return;
      lastSignature = signature;
      setTrends(next.trends);
      setTagTrends(next.tagTrends);
      setCatTrends(next.catTrends);
      setHistory(next.history);
    };
    sync();
    const iv = setInterval(sync, 15_000);
    // A trend written in another tab should still show up promptly.
    window.addEventListener('storage', sync);
    return () => { clearInterval(iv); window.removeEventListener('storage', sync); };
  }, []);

  const filtered = React.useMemo(() => {
    let list = activecat === 'all'
      ? allItems
      : activecat === 'featured'
        ? allItems.filter(i => i.featured)
        : allItems.filter(i => i.category.toLowerCase() === activecat.toLowerCase());
    if (tagSearch) list = list.filter(i => (i.chips ?? []).some(c => c.toLowerCase().includes(tagSearch.toLowerCase())) || i.title.toLowerCase().includes(tagSearch.toLowerCase()));
    if (sort === 'Popular') list = [...list].sort((a, b) => (b.likesCount ?? 0) - (a.likesCount ?? 0));
    else if (sort === 'Oldest') list = [...list].sort((a, b) => new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime());
    else list = [...list].sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
    return list;
  }, [allItems, activecat, tagSearch, sort]);

  const visible = filtered.slice(0, page * HP_PAGE_SIZE);
  const hasMore = visible.length < filtered.length;

  React.useEffect(() => { setPage(1); }, [activecat, tagSearch, sort]);

  React.useEffect(() => {
    if (!hasMore || !sentinelRef.current) return;
    const obs = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) setPage(p => p + 1);
    }, { rootMargin: '200px' });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasMore, visible.length]);

  /* scroll-hide tabs on mobile */
  React.useEffect(() => {
    const onScroll = () => {
      if (tabsTicking.current) return;
      tabsTicking.current = true;
      requestAnimationFrame(() => {
        if (window.innerWidth >= 768) { tabsTicking.current = false; return; }
        const y    = window.scrollY;
        const diff = y - tabsLastY.current;
        if (Math.abs(diff) > 4) {
          setTabsVisible(diff < 0 || y < 60);
          tabsLastY.current = y;
        }
        tabsTicking.current = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!loading && allItems.length === 0) return null;

  /* category counts keyed by tab id (lowercase) */
  const catCounts: Record<string, number> = {};
  allItems.forEach(i => {
    const k = i.category.toLowerCase();
    catCounts[k] = (catCounts[k] ?? 0) + 1;
  });

  /* right sidebar: trending data from localStorage (same as PublishedPage) */
  const topTrendingPosts = allItems
    .filter(i => (trends[i.id]?.count ?? 0) > 0)
    .sort((a, b) => (trends[b.id]?.count ?? 0) - (trends[a.id]?.count ?? 0))
    .slice(0, 5);

  const topTagsFromTrends = Object.entries(tagTrends)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  const categoryStats = Object.entries(
    allItems.reduce((acc: Record<string, number>, i) => { acc[i.category] = (acc[i.category] ?? 0) + 1; return acc; }, {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 8);

  const totalTrends = Object.values(catTrends).reduce((a, b) => a + b, 0);

  const recentItems = [...allItems].sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()).slice(0, 6);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes hp-feed-fadein {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .hp-feed-card-enter { animation: hp-feed-fadein 0.50s cubic-bezier(0.22,1,0.36,1) both; }
        @keyframes hp-glow-drift {
          0%, 100% { transform: translate(-10%, -10%) scale(1);   opacity: 0.30; }
          50%       { transform: translate(  6%,  8%) scale(1.15); opacity: 0.18; }
        }
        .hp-feed-glow { animation: hp-glow-drift 14s ease-in-out infinite; }
        .hp-feed-glow2 { animation: hp-glow-drift 18s ease-in-out infinite reverse; }
      ` }} />

      {/* ── outer premium frame ── */}
      <div className="relative sm:-mx-6 lg:-mx-10 xl:-mx-12 mt-2 mb-6"
        style={{
          overflow: 'clip',
          borderRadius: 'clamp(12px, 1.5vw, 24px)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.035) inset, 0 32px 80px rgba(0,0,0,0.55), 0 8px 24px rgba(0,0,0,0.35)',
        }}
      >
        {/* ambient glow blobs */}
        <div className="hp-feed-glow pointer-events-none absolute -top-24 -left-24 h-80 w-80 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.22) 0%, transparent 70%)', filter: 'blur(48px)' }} />
        <div className="hp-feed-glow2 pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 70%)', filter: 'blur(56px)' }} />
        {/* noise grain */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.025]"
          style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.75\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")', backgroundSize: '160px 160px' }} />

        {/* 3-column layout */}
        <div
          className="relative flex"
          style={{
            background: 'linear-gradient(160deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 40%, rgba(255,255,255,0.025) 100%)',
            backdropFilter: 'blur(40px) saturate(1.8)',
            WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
            minHeight: '100vh',
          }}
        >
        {/* ══ LEFT SIDEBAR (lg+) — exact match of PublishedPage ══ */}
        <aside className="hidden lg:flex w-56 xl:w-60 shrink-0 flex-col" style={{ position: 'sticky', top: 0, height: '100vh', borderRight: '1px solid rgba(255,255,255,0.07)' }}>

          {/* logo / title area */}
          <div className="px-4 py-5 border-b border-white/[0.05]">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-xs font-medium text-white/40 transition hover:text-white/70"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to app
            </Link>
            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/25">Docrud</p>
              <h2 className="mt-0.5 text-lg font-bold tracking-tight text-white">Published</h2>
            </div>
            {/* live pill */}
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[11px] text-white/35 tabular-nums">{allItems.length} items</span>
              {allItems.filter(i => i.isReal).length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {allItems.filter(i => i.isReal).length} live
                </span>
              )}
            </div>
          </div>

          {/* nav list */}
          <nav className="flex-1 overflow-y-auto p-2 space-y-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {HP_TABS.map(tab => {
              const isActive     = activecat === tab.id;
              const count        = tab.id === 'all' ? allItems.length : (catCounts[tab.id] ?? 0);
              const colorCls     = HP_TAG_CLS[tab.id] ?? HP_TAG_CLS.all;
              const isFeatured   = tab.id === 'featured';
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => { setActivecat(tab.id); setTagSearch(''); }}
                  className={`group w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[12.5px] font-medium transition-all ${
                    isActive ? 'bg-white/[0.08] text-white shadow-sm' : 'text-white/40 hover:bg-white/[0.04] hover:text-white/80'
                  }`}
                >
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                    isActive
                      ? isFeatured ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : colorCls
                      : 'border-white/[0.06] bg-transparent text-white/30 group-hover:border-white/[0.10] group-hover:text-white/50'
                  }`}>
                    <tab.icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="flex-1 text-left">{tab.label}</span>
                  {count > 0 && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums min-w-[18px] text-center ${
                      isActive ? 'bg-white/[0.12] text-white' : 'bg-white/[0.05] text-white/20'
                    }`}>{count}</span>
                  )}
                  {isFeatured && (
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: isActive ? 'rgba(251,191,36,0.80)' : 'rgba(251,191,36,0.25)', flexShrink: 0, boxShadow: isActive ? '0 0 5px rgba(251,191,36,0.50)' : 'none' }} />
                  )}
                </button>
              );
            })}
          </nav>

          {/* bottom CTA — matches PublishedPage */}
          <div className="p-3 border-t border-white/[0.05] space-y-2">
            <Link
              href="/published"
              className="group flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.10] bg-white/[0.05] px-4 py-2.5 text-[11.5px] font-semibold text-white/55 transition hover:border-white/[0.18] hover:bg-white/[0.09] hover:text-white/85 active:scale-[0.98]"
            >
              <Plus className="h-3.5 w-3.5 transition-transform group-hover:rotate-90 duration-200" />
              Publish something
            </Link>
          </div>
        </aside>

        {/* ══ MAIN FEED ══ */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* sticky top bar — desktop only */}
          <div
            className="hidden lg:block sticky top-0 z-20 border-b border-white/[0.08] shrink-0"
            style={{
              background: 'rgba(12,12,16,0.82)',
              backdropFilter: 'blur(32px) saturate(1.6)',
              WebkitBackdropFilter: 'blur(32px) saturate(1.6)',
            }}
          >
            {/* desktop row: title + tag pill (no sort — sort stays non-sticky below) */}
            <div className="hidden lg:flex items-center gap-2 px-4 sm:px-6 pt-3.5 pb-2">
              <span className="text-[13px] font-semibold text-white/85 tracking-tight shrink-0">
                {HP_TABS.find(t => t.id === activecat)?.label ?? 'All Posts'}
              </span>
              {tagSearch && (
                <button
                  type="button"
                  onClick={() => setTagSearch('')}
                  className="inline-flex items-center gap-1 rounded-full border border-orange-400/30 bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold text-orange-300 transition hover:bg-orange-500/20"
                >
                  #{tagSearch} <X className="h-2.5 w-2.5" />
                </button>
              )}
              {filtered.length > 0 && (
                <span className="rounded-full bg-white/[0.09] px-2 py-px text-[9.5px] font-semibold text-white/50 tabular-nums">{filtered.length}</span>
              )}
              <div className="ml-auto flex items-center gap-1.5">
                {(['Recent', 'Popular', 'Oldest'] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSort(s)}
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10.5px] font-semibold whitespace-nowrap transition ${
                      sort === s
                        ? 'border-white/[0.18] bg-white/[0.09] text-white/90'
                        : 'border-white/[0.07] bg-white/[0.03] text-white/40 hover:border-white/[0.12] hover:text-white/70'
                    }`}
                  >{s}</button>
                ))}
                <button
                  type="button"
                  onClick={applyRefresh}
                  disabled={refreshing}
                  title="Refresh feed"
                  className="ml-1 flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.07] bg-white/[0.03] text-white/30 transition hover:bg-white/[0.07] hover:text-white/65 disabled:opacity-40"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* new-posts banner */}
            {newItems.length > 0 && (
              <div className="px-4 sm:px-6 pb-2.5">
                <button
                  type="button"
                  onClick={applyRefresh}
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-2 text-[11.5px] font-semibold transition active:scale-[0.98]"
                  style={{
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(139,92,246,0.14))',
                    border: '1px solid rgba(99,102,241,0.28)',
                    color: '#c7d2fe',
                  }}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                  {newItems.length} new post{newItems.length !== 1 ? 's' : ''} — tap to load
                  <ArrowRight className="h-3.5 w-3.5 opacity-70" />
                </button>
              </div>
            )}

          </div>

          {/* feed cards */}
          <div className="flex-1 overflow-y-auto px-0 sm:px-6 lg:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {/* mobile-only: sort row — hidden */}
            <div className="hidden flex items-center gap-2 py-3 max-w-3xl mx-auto w-full">
              <span className="text-[12px] font-semibold text-white/60 tracking-tight shrink-0">
                {HP_TABS.find(t => t.id === activecat)?.label ?? 'All'}
              </span>
              {filtered.length > 0 && (
                <span className="rounded-full bg-white/[0.09] px-2 py-px text-[9.5px] font-semibold text-white/45 tabular-nums">{filtered.length}</span>
              )}
              {tagSearch && (
                <button
                  type="button"
                  onClick={() => setTagSearch('')}
                  className="inline-flex items-center gap-1 rounded-full border border-orange-400/30 bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold text-orange-300 transition hover:bg-orange-500/20"
                >
                  #{tagSearch} <X className="h-2.5 w-2.5" />
                </button>
              )}
              <div className="ml-auto flex items-center gap-1.5">
                {(['Recent', 'Popular', 'Oldest'] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSort(s)}
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10.5px] font-semibold whitespace-nowrap transition ${
                      sort === s
                        ? 'border-white/[0.18] bg-white/[0.09] text-white/90'
                        : 'border-white/[0.07] bg-white/[0.03] text-white/40 hover:border-white/[0.12] hover:text-white/70'
                    }`}
                  >{s}</button>
                ))}
                <button
                  type="button"
                  onClick={applyRefresh}
                  disabled={refreshing}
                  title="Refresh feed"
                  className="ml-1 flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.07] bg-white/[0.03] text-white/30 transition hover:bg-white/[0.07] hover:text-white/65 disabled:opacity-40"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
            <div className="mx-auto w-full max-w-3xl divide-y divide-white/[0.045]">
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="py-5 space-y-3 animate-pulse">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-white/[0.05]" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3 w-28 rounded bg-white/[0.05]" />
                          <div className="h-2.5 w-20 rounded bg-white/[0.04]" />
                        </div>
                      </div>
                      <div className="h-4 w-3/4 rounded bg-white/[0.05]" />
                      <div className="h-3 w-full rounded bg-white/[0.04]" />
                      <div className="h-3 w-5/6 rounded bg-white/[0.03]" />
                    </div>
                  ))
                : visible.length > 0
                  ? visible.map((item, idx) => (
                      <div key={item.id} className="hp-feed-card-enter" style={{ animationDelay: `${Math.min(idx % HP_PAGE_SIZE, 6) * 50}ms` }}>
                        <HomepageFeedCard item={item} />
                      </div>
                    ))
                  : (
                      <div className="flex flex-col items-center gap-3 py-20 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.03]">
                          <Newspaper className="h-6 w-6 text-white/15" />
                        </div>
                        <p className="text-[13px] text-white/30">No posts in this category yet</p>
                      </div>
                    )
              }

              {/* sentinel */}
              {hasMore && (
                <div ref={sentinelRef} className="flex items-center justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-white/15" />
                </div>
              )}

              {/* end of feed */}
              {!loading && !hasMore && visible.length > 0 && (
                <div className="flex flex-col items-center gap-2.5 py-10">
                  <span className="text-[11px] text-white/18">You&apos;re all caught up</span>
                  <Link href="/published"
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] px-4 py-1.5 text-[11px] font-semibold text-white/30 transition hover:border-white/[0.14] hover:text-white/60">
                    Explore more on Published <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ══ RIGHT SIDEBAR (xl+) — mirrors PublishedPage TrendingPanel ══ */}
        <aside className="hidden xl:flex w-64 2xl:w-72 shrink-0 flex-col" style={{ position: 'sticky', top: 0, height: '100vh', borderLeft: '1px solid rgba(255,255,255,0.07)' }}>
          {/* header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.05] shrink-0">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-orange-400/60" />
              <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/40">Live Feed</span>
            </div>
            {totalTrends > 0 && (
              <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[9.5px] font-bold text-orange-400">🔥 {totalTrends}</span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="p-4 space-y-7 pb-20">

              {/* ── Recent Posts ── */}
              <section>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30 mb-3">Recent</p>
                <div className="space-y-3.5">
                  {recentItems.length === 0 && <p className="text-[11px] text-white/20">No posts yet</p>}
                  {recentItems.map((item, i) => {
                    const label = hpFeedLabel(item);
                    return (
                    <Link key={item.id} href={`/published/${item.id}`} className="group flex items-start gap-2.5">
                      <span className="text-[11px] font-bold text-white/20 tabular-nums mt-0.5 w-4 shrink-0">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        {label ? (
                          <p className="text-[12px] font-semibold text-white/65 leading-snug line-clamp-2 group-hover:text-white transition-colors">{label}</p>
                        ) : null}
                        <p className={`text-[10.5px] text-white/25 ${label ? 'mt-0.5' : ''}`}>{item.uploadedByName || 'Docrud'} · {hpTimeAgo(item.postedAt)}</p>
                      </div>
                    </Link>
                    );
                  })}
                </div>
              </section>

              {/* ── Trending Now ── */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Trending</p>
                    {totalTrends > 0 && (
                      <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[9.5px] font-bold text-orange-400/80">{totalTrends} 🔥</span>
                    )}
                  </div>
                  {totalTrends > 0 && (
                    <button type="button" onClick={() => setSort('Popular')}
                      className="text-[10.5px] font-semibold text-orange-400/60 hover:text-orange-400 transition">
                      Sort feed →
                    </button>
                  )}
                </div>

                {topTrendingPosts.length > 0 ? (
                  <div className="space-y-3.5 mb-4">
                    {topTrendingPosts.map((item, i) => {
                      const label = hpFeedLabel(item);
                      return (
                      <Link key={item.id} href={`/published/${item.id}`} className="group flex items-start gap-2.5">
                        <span className="text-[11px] font-bold text-orange-400/40 tabular-nums mt-0.5 w-4 shrink-0">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          {label ? (
                            <p className="text-[12px] font-semibold text-white/65 leading-snug line-clamp-2 group-hover:text-white transition-colors">{label}</p>
                          ) : null}
                          <div className={`flex items-center gap-1 ${label ? 'mt-0.5' : ''}`}>
                            <TrendingUp className="h-3 w-3 text-orange-400/50" />
                            <span className="text-[10.5px] font-bold text-orange-400/60">{trends[item.id]?.count} trending</span>
                          </div>
                        </div>
                      </Link>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-white/20 mb-4 leading-relaxed">
                    Hit 🔥 on any post to add it to trending. Top trends appear here.
                  </p>
                )}

                {/* Trending tags (from localStorage) */}
                {topTagsFromTrends.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {topTagsFromTrends.map(([tag, count]) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => { setTagSearch(tag); setActivecat('All'); }}
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10.5px] font-medium transition ${
                          tagSearch === tag
                            ? 'border-orange-400/40 bg-orange-500/10 text-orange-300'
                            : 'border-white/[0.07] bg-white/[0.05] text-white/45 hover:bg-white/[0.09] hover:text-white/80'
                        }`}
                      >
                        #{tag}
                        <span className="font-bold tabular-nums text-orange-400/70">{count}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-white/15">Trending tags show here once posts are trended.</p>
                )}
              </section>

              {/* ── Categories ── */}
              <section>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30 mb-3">Categories</p>
                <div className="space-y-1">
                  {categoryStats.map(([cat, count]) => {
                    const trendCount = catTrends[cat] ?? 0;
                    const maxCount   = Math.max(...categoryStats.map(([, c]) => c), 1);
                    const isActive   = activecat === cat.toLowerCase();
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => { setActivecat(cat.toLowerCase()); setTagSearch(''); }}
                        className={`group w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${
                          isActive ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]'
                        }`}
                      >
                        <Newspaper className="h-3.5 w-3.5 text-white/25 shrink-0" />
                        <span className={`text-[12px] font-medium transition flex-1 capitalize truncate ${isActive ? 'text-white/85' : 'text-white/50 group-hover:text-white/80'}`}>
                          {cat}
                        </span>
                        <div className="w-14 h-1 rounded-full bg-white/[0.05] overflow-hidden shrink-0">
                          <div className="h-full rounded-full bg-white/20" style={{ width: `${(count / maxCount) * 100}%` }} />
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 min-w-[32px] justify-end">
                          {trendCount > 0 && (
                            <span className="flex items-center gap-0.5 text-[9.5px] font-bold text-orange-400/60">
                              <TrendingUp className="h-2.5 w-2.5" />{trendCount}
                            </span>
                          )}
                          <span className="text-[10.5px] font-semibold text-white/25 tabular-nums">{count}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* ── Your Trend History ── */}
              {history.length > 0 && (
                <section>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30 mb-3">Your Trends</p>
                  <div className="space-y-3">
                    {history.slice(0, 6).map((h, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <TrendingUp className="h-3.5 w-3.5 text-orange-400/35 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11.5px] font-semibold text-white/50 leading-snug line-clamp-1">
                            {hpIsJunkTitle({ title: h.title }) ? (h.category || 'Post') : h.title}
                          </p>
                          <p className="text-[10px] text-white/22 mt-0.5 capitalize">{h.category} · {hpTimeAgo(new Date(h.trendedAt).toISOString())}</p>
                        </div>
                      </div>
                    ))}
                    {history.length > 6 && (
                      <p className="text-[10.5px] text-white/20">+{history.length - 6} more in history</p>
                    )}
                  </div>
                </section>
              )}

            </div>
          </div>
        </aside>
        </div>{/* end 3-column layout */}
      </div>{/* end outer premium frame */}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   FeedIllustration — SVG art per feed category
───────────────────────────────────────────────────────────── */
function FeedIllustration({ kind }: { kind: string }) {
  if (kind === 'design') return (
    <svg viewBox="0 0 120 80" className="h-full w-full opacity-90" aria-hidden="true">
      <defs>
        <linearGradient id="fi-d1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ec4899" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.5" />
        </linearGradient>
      </defs>
      <polygon points="60,8 95,30 95,60 60,72 25,60 25,30" fill="none" stroke="url(#fi-d1)" strokeWidth="1.5" />
      <polygon points="60,20 82,34 82,56 60,64 38,56 38,34" fill="rgba(236,72,153,0.08)" stroke="rgba(236,72,153,0.3)" strokeWidth="1" />
      <line x1="60" y1="8" x2="60" y2="72" stroke="rgba(139,92,246,0.25)" strokeWidth="0.8" />
      <line x1="25" y1="30" x2="95" y2="60" stroke="rgba(236,72,153,0.20)" strokeWidth="0.8" />
      <line x1="95" y1="30" x2="25" y2="60" stroke="rgba(236,72,153,0.20)" strokeWidth="0.8" />
      <circle cx="60" cy="40" r="5" fill="rgba(236,72,153,0.5)" />
    </svg>
  );
  if (kind === 'code') return (
    <svg viewBox="0 0 120 80" className="h-full w-full opacity-90" aria-hidden="true">
      <defs>
        <linearGradient id="fi-c1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.5" />
        </linearGradient>
      </defs>
      <rect x="10" y="12" width="100" height="56" rx="6" fill="rgba(16,185,129,0.06)" stroke="rgba(16,185,129,0.2)" strokeWidth="1" />
      <circle cx="22" cy="24" r="3" fill="rgba(239,68,68,0.6)" />
      <circle cx="33" cy="24" r="3" fill="rgba(234,179,8,0.6)" />
      <circle cx="44" cy="24" r="3" fill="rgba(34,197,94,0.6)" />
      <line x1="18" y1="38" x2="50" y2="38" stroke="rgba(16,185,129,0.6)" strokeWidth="2" strokeLinecap="round" />
      <line x1="18" y1="47" x2="75" y2="47" stroke="rgba(59,130,246,0.5)" strokeWidth="2" strokeLinecap="round" />
      <line x1="18" y1="56" x2="62" y2="56" stroke="rgba(16,185,129,0.4)" strokeWidth="2" strokeLinecap="round" />
      <polygon points="90,30 106,40 90,50" fill="rgba(16,185,129,0.3)" />
    </svg>
  );
  if (kind === 'writing') return (
    <svg viewBox="0 0 120 80" className="h-full w-full opacity-90" aria-hidden="true">
      <defs>
        <linearGradient id="fi-w1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.5" />
        </linearGradient>
      </defs>
      <rect x="18" y="10" width="64" height="60" rx="4" fill="rgba(59,130,246,0.06)" stroke="rgba(59,130,246,0.2)" strokeWidth="1" />
      <line x1="26" y1="24" x2="74" y2="24" stroke="rgba(59,130,246,0.45)" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="26" y1="34" x2="74" y2="34" stroke="rgba(59,130,246,0.35)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="26" y1="44" x2="62" y2="44" stroke="rgba(59,130,246,0.30)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="26" y1="54" x2="68" y2="54" stroke="rgba(59,130,246,0.25)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M82 50 L106 26 L112 32 L88 56 L80 58 Z" fill="rgba(139,92,246,0.35)" stroke="rgba(139,92,246,0.5)" strokeWidth="1" />
      <line x1="100" y1="32" x2="106" y2="38" stroke="rgba(139,92,246,0.6)" strokeWidth="1.2" />
    </svg>
  );
  /* ai */
  return (
    <svg viewBox="0 0 120 80" className="h-full w-full opacity-90" aria-hidden="true">
      <defs>
        <linearGradient id="fi-a1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="36" r="20" fill="rgba(245,158,11,0.07)" stroke="rgba(245,158,11,0.25)" strokeWidth="1.2" />
      <circle cx="60" cy="36" r="12" fill="rgba(245,158,11,0.10)" stroke="rgba(245,158,11,0.35)" strokeWidth="1" />
      <circle cx="60" cy="36" r="5" fill="rgba(245,158,11,0.55)" />
      <line x1="60" y1="16" x2="60" y2="10" stroke="rgba(245,158,11,0.4)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="60" y1="56" x2="60" y2="62" stroke="rgba(245,158,11,0.4)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="40" y1="36" x2="34" y2="36" stroke="rgba(245,158,11,0.4)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="80" y1="36" x2="86" y2="36" stroke="rgba(245,158,11,0.4)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="46" y1="22" x2="42" y2="18" stroke="rgba(245,158,11,0.3)" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="74" y1="50" x2="78" y2="54" stroke="rgba(245,158,11,0.3)" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="74" y1="22" x2="78" y2="18" stroke="rgba(245,158,11,0.3)" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="46" y1="50" x2="42" y2="54" stroke="rgba(245,158,11,0.3)" strokeWidth="1.2" strokeLinecap="round" />
      <text x="60" y="72" textAnchor="middle" fontSize="8" fill="rgba(245,158,11,0.5)" fontWeight="700">AI</text>
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────
   BuiltInIndia — premium single-line brand statement
───────────────────────────────────────────────────────────── */
function BuiltInIndia() {
  const ref = React.useRef<HTMLElement>(null);
  const [vis, setVis] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect(); } },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const tx = (delay: number): React.CSSProperties => ({
    opacity: vis ? 1 : 0,
    transform: vis ? 'none' : 'translateY(14px)',
    transition: `opacity 0.7s ease ${delay}ms, transform 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
  });

  return (
    <section ref={ref} className="relative w-full overflow-hidden mt-6">

      {/* hairline */}
      <div className="h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

      {/* ambient glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ width: '70vw', height: '40vw',
            background: 'radial-gradient(ellipse, rgba(255,153,51,0.04) 0%, rgba(19,136,8,0.025) 55%, transparent 75%)',
            filter: 'blur(80px)' }} />
      </div>

      <div className="relative z-10 px-4 sm:px-6 lg:px-10 xl:px-12 py-14 sm:py-18 md:py-24 text-center">

        {/* eyebrow */}
        <p className="mb-6 inline-flex items-center gap-3 text-[8.5px] font-bold uppercase tracking-[0.38em] text-white/18"
          style={tx(0)}>
          <span className="h-px w-8 bg-gradient-to-r from-transparent to-white/[0.12]" />
          Docrud · Crafted in Bharat
          <span className="h-px w-8 bg-gradient-to-l from-transparent to-white/[0.12]" />
        </p>

        {/* single-line headline */}
        <h2
          className="whitespace-nowrap font-black leading-none tracking-[-0.04em] text-white/80"
          style={{ ...tx(80), fontSize: 'min(4.4vw, 62px)' }}
        >
          Built In{' '}
          <span className="india-word">Bharat</span>
          {' '}for the World
        </h2>

        {/* tricolor bar */}
        <div className="mt-6 flex items-center justify-center gap-[2px]">
          {[
            { c: 'rgba(255,153,51,0.32)', d: 300 },
            { c: 'rgba(240,240,240,0.14)', d: 360 },
            { c: 'rgba(19,136,8,0.28)', d: 420 },
          ].map((s, i) => (
            <div key={i} style={{
              height: '2px', borderRadius: '99px', background: s.c,
              width: 'clamp(40px, 5vw, 72px)',
              transform: vis ? 'scaleX(1)' : 'scaleX(0)',
              transformOrigin: 'center',
              transition: `transform 0.8s cubic-bezier(0.22,1,0.36,1) ${s.d}ms`,
            }} />
          ))}
        </div>

        {/* tagline */}
        <p className="mx-auto mt-5 max-w-xs text-[12px] font-medium leading-relaxed text-white"
          style={tx(440)}>
          Professional infrastructure crafted with Indian ingenuity,
          trusted by teams across industries worldwide.
        </p>

      </div>

      {/* hairline */}
      <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   PremiumFooter — MNC-grade footer with policies, security
───────────────────────────────────────────────────────────── */
/* ─── Footer modal content ─────────────────────────────────── */
type ModalSection = { heading: string; body: string };
type ModalDef     = { title: string; lastUpdated: string; sections: ModalSection[] };

const FOOTER_MODAL_CONTENT: Record<string, ModalDef> = {
  terms: {
    title: 'Terms & Conditions',
    lastUpdated: 'January 2025',
    sections: [
      {
        heading: '1. Acceptance of Terms',
        body: 'By accessing or using Docrud ("the Platform"), you agree to be bound by these Terms & Conditions. If you do not agree, please discontinue use immediately. These terms apply to all users including visitors, registered members, and business subscribers.',
      },
      {
        heading: '2. Description of Service',
        body: 'Docrud is a document generation, sharing, and collaboration platform operated by Corescent Technologies Private Limited. We provide tools to create, publish, sign, and manage documents. Features are subject to change without prior notice.',
      },
      {
        heading: '3. User Accounts & Responsibilities',
        body: 'You are responsible for maintaining the confidentiality of your credentials. You must not share your account, impersonate others, or use the platform for unlawful activities. You warrant that all information you provide is accurate and up to date.',
      },
      {
        heading: '4. Intellectual Property',
        body: 'All platform code, design, and proprietary features are the intellectual property of Corescent Technologies Pvt Ltd. Content you create remains yours; however, by publishing publicly you grant Docrud a non-exclusive, royalty-free licence to display and distribute that content on the platform.',
      },
      {
        heading: '5. Prohibited Conduct',
        body: 'Users may not upload malicious files, engage in scraping, attempt to reverse-engineer the platform, transmit unsolicited communications, or use the service to violate applicable law. Violations may result in immediate account termination.',
      },
      {
        heading: '6. Limitation of Liability',
        body: 'Docrud is provided "as is." Corescent Technologies Pvt Ltd shall not be liable for indirect, incidental, or consequential damages arising from your use of the platform, including data loss or business interruption, to the maximum extent permitted by law.',
      },
      {
        heading: '7. Governing Law',
        body: 'These terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts of Bengaluru, Karnataka. If any provision is found unenforceable, the remaining provisions continue in full force.',
      },
    ],
  },

  privacy: {
    title: 'Privacy Policy',
    lastUpdated: 'January 2025',
    sections: [
      {
        heading: 'Overview',
        body: 'Corescent Technologies Private Limited ("we", "our") is committed to protecting your personal data. This policy explains what data we collect, how we use it, and your rights under applicable law including India\'s Digital Personal Data Protection Act 2023.',
      },
      {
        heading: 'Data We Collect',
        body: 'We collect information you provide directly (name, email, documents), data generated through your use of the platform (logs, activity, device info), and data from integrations you authorise. We do not sell personal data to third parties.',
      },
      {
        heading: 'How We Use Your Data',
        body: 'Your data is used to operate and improve the platform, authenticate users, process payments, send transactional notifications, and prevent fraud. We may use anonymised, aggregated data for analytics and product development.',
      },
      {
        heading: 'Data Sharing',
        body: 'We share data only with service providers necessary to run the platform (e.g. cloud hosting, email delivery) under strict data processing agreements. We do not share personally identifiable information with advertisers or data brokers.',
      },
      {
        heading: 'Data Retention',
        body: 'Active account data is retained for the duration of your subscription plus 90 days after account closure. Audit logs and legal-hold data may be retained longer as required by law. You may request deletion at any time.',
      },
      {
        heading: 'Your Rights',
        body: 'Under the DPDP Act 2023 and applicable law, you have the right to access, correct, and erase your personal data; withdraw consent; and file a grievance. Contact us at privacy@corescent.in to exercise your rights.',
      },
      {
        heading: 'Security',
        body: 'We use AES-256 encryption at rest, TLS 1.3 in transit, role-based access controls, and regular security audits to protect your data. All data is hosted in India on ISO-compliant infrastructure.',
      },
    ],
  },

  cookies: {
    title: 'Cookie Policy',
    lastUpdated: 'January 2025',
    sections: [
      {
        heading: 'What Are Cookies',
        body: 'Cookies are small text files stored on your device when you visit a website. They help us deliver a functional, secure, and personalised experience on Docrud.',
      },
      {
        heading: 'Cookies We Use',
        body: 'We use strictly necessary cookies for authentication and session management; functional cookies to remember preferences; and performance cookies (anonymised) to understand how pages are used. We do not use third-party advertising cookies.',
      },
      {
        heading: 'Session & Auth Cookies',
        body: 'Authentication tokens are stored in secure, HttpOnly cookies with SameSite=Strict to prevent CSRF attacks. These expire when you log out or after a defined inactivity period.',
      },
      {
        heading: 'Analytics',
        body: 'Anonymised page-view and interaction data may be collected to improve platform performance. No personally identifiable data is sent to analytics services. All analytics data is aggregated.',
      },
      {
        heading: 'Managing Cookies',
        body: 'You can control or delete cookies through your browser settings. Disabling necessary cookies will affect login and core functionality. Third-party cookie controls are available in your browser\'s privacy settings.',
      },
      {
        heading: 'Updates',
        body: 'This cookie policy may be updated to reflect changes in technology or regulation. Continued use of Docrud after updates constitutes acceptance. Last material update: January 2025.',
      },
    ],
  },

  refund: {
    title: 'Refund & Cancellation Policy',
    lastUpdated: 'January 2025',
    sections: [
      {
        heading: 'Subscription Cancellation',
        body: 'You may cancel your paid subscription at any time from your account settings. Cancellation takes effect at the end of the current billing cycle. You will retain access to paid features until the cycle ends.',
      },
      {
        heading: 'Refund Eligibility',
        body: 'Refunds are available within 7 days of initial purchase if the platform did not function as described and the issue could not be resolved by our support team. Refunds are not available for partial billing periods or after 7 days.',
      },
      {
        heading: 'How to Request a Refund',
        body: 'Contact us at billing@corescent.in with your account email and a description of the issue. We aim to process refund requests within 5–7 business days. Approved refunds are returned to the original payment method.',
      },
      {
        heading: 'Non-Refundable Items',
        body: 'One-time template purchases, custom integrations, and professional services are non-refundable once delivered. Add-on purchases consumed during a billing period are non-refundable.',
      },
      {
        heading: 'Promotional & Trial Plans',
        body: 'Free trial periods are not eligible for refunds. Promotional discounts are non-refundable if the full promotional period has elapsed. Annual plan refunds are prorated for unused full months where applicable by law.',
      },
      {
        heading: 'Disputes',
        body: 'If you believe a charge is incorrect, contact us before initiating a chargeback. Unresolved billing disputes may be escalated per the governing law clause in our Terms & Conditions.',
      },
    ],
  },

  'data-processing': {
    title: 'Data Processing Agreement',
    lastUpdated: 'January 2025',
    sections: [
      {
        heading: 'Scope',
        body: 'This Data Processing Agreement ("DPA") governs the processing of personal data by Corescent Technologies Private Limited ("Data Processor") on behalf of business users ("Data Fiduciary") as defined under the DPDP Act 2023.',
      },
      {
        heading: 'Legal Basis for Processing',
        body: 'We process data on the basis of (a) contractual necessity — to deliver the services you have subscribed to; (b) legitimate interest — for fraud prevention and platform security; (c) legal obligation — for compliance with Indian law; and (d) consent — for optional communications.',
      },
      {
        heading: 'Sub-Processors',
        body: 'We engage trusted sub-processors for cloud infrastructure, email delivery, and payment processing. All sub-processors are bound by data processing agreements with equivalent protections. A current list is available on request.',
      },
      {
        heading: 'Data Localisation',
        body: 'All personal data of Indian residents is stored and processed on servers located within India, in compliance with applicable data localisation requirements under the DPDP Act 2023.',
      },
      {
        heading: 'Security Measures',
        body: 'Technical measures include AES-256 encryption, TLS 1.3, network isolation, access controls with least-privilege principles, and continuous monitoring. Organisational measures include staff training, incident response procedures, and annual security reviews.',
      },
      {
        heading: 'Breach Notification',
        body: 'In the event of a personal data breach, we will notify affected data fiduciaries within 72 hours of discovery, as required by applicable law. Notifications will include nature of breach, data involved, and remediation steps.',
      },
    ],
  },

  dpdp: {
    title: 'DPDP Act 2023 Compliance',
    lastUpdated: 'January 2025',
    sections: [
      {
        heading: 'About the DPDP Act',
        body: 'The Digital Personal Data Protection Act 2023 is India\'s landmark data protection law governing the processing of digital personal data. Corescent Technologies Private Limited is a Data Fiduciary under this Act.',
      },
      {
        heading: 'Our Obligations as Data Fiduciary',
        body: 'We process personal data only for lawful purposes and with valid consent where required. We implement appropriate technical and organisational safeguards, appoint a Data Protection Officer, and maintain records of processing activities.',
      },
      {
        heading: 'Your Rights as Data Principal',
        body: 'Under the DPDP Act you have the right to: (1) access information about your data; (2) correction and erasure of inaccurate or outdated data; (3) grievance redressal within 48 hours; and (4) nominate a representative for your rights.',
      },
      {
        heading: 'Consent Framework',
        body: 'We obtain free, informed, specific, and unambiguous consent before processing personal data for non-essential purposes. You may withdraw consent at any time without affecting the lawfulness of prior processing. Consent withdrawal may limit certain features.',
      },
      {
        heading: 'Children\'s Data',
        body: 'Docrud does not knowingly process data of individuals under 18 years of age without verified parental consent. Age-gating is implemented at sign-up. If we identify under-age data without consent, it is deleted promptly.',
      },
      {
        heading: 'Grievance Redressal',
        body: 'Submit grievances to our Data Protection Officer at dpo@corescent.in or via the Contact page. We acknowledge within 48 hours and resolve within 30 days. Unresolved matters may be escalated to the Data Protection Board of India.',
      },
    ],
  },

  'acceptable-use': {
    title: 'Acceptable Use Policy',
    lastUpdated: 'January 2025',
    sections: [
      {
        heading: 'Purpose',
        body: 'This Acceptable Use Policy defines conduct standards for all Docrud users. Violations may result in content removal, suspension, or permanent account termination at our sole discretion.',
      },
      {
        heading: 'Prohibited Content',
        body: 'You must not upload, share, or distribute: content that infringes third-party intellectual property; defamatory, harassing, or hateful material; obscene or illegal content; malware, phishing material, or deceptive documents; content that violates applicable law.',
      },
      {
        heading: 'Prohibited Activities',
        body: 'Prohibited activities include: automated scraping without written permission; credential stuffing or brute-force attacks; reverse engineering the platform; creating fake accounts; spamming other users; circumventing access controls or subscription tiers.',
      },
      {
        heading: 'Document Integrity',
        body: 'Users must not misrepresent the authenticity of documents. Submitting forged signatures, altered contracts, or fraudulent documents constitutes a serious violation and will be reported to appropriate authorities.',
      },
      {
        heading: 'Compliance with Law',
        body: 'All use of Docrud must comply with applicable local, state, and national laws. Users are responsible for ensuring that the documents they create, share, or sign are lawful in their jurisdiction.',
      },
      {
        heading: 'Reporting Violations',
        body: 'If you encounter content or behaviour that violates this policy, please report it via the Contact page. We investigate all reports and take appropriate action, which may include content removal and law enforcement referral.',
      },
    ],
  },

  'doc-legality': {
    title: 'Document Legality & Standing',
    lastUpdated: 'January 2025',
    sections: [
      {
        heading: 'Legal Standing of Documents',
        body: 'Documents created and signed on Docrud can carry legal weight under the Information Technology Act 2000 and Indian Contract Act 1872, provided the parties have legal capacity to contract and proper consent is recorded.',
      },
      {
        heading: 'Electronic Signatures',
        body: 'Docrud\'s signature feature produces electronic signatures as defined under the IT Act. These are legally recognised for most commercial agreements. Certain documents (e.g. wills, negotiable instruments, property transfers) may require wet ink signatures under Indian law.',
      },
      {
        heading: 'Audit Trail & Tamper Evidence',
        body: 'Every signed document is accompanied by a cryptographic audit trail recording signer identity, timestamp, IP address, and document hash. This trail can be used as evidence of the signing event in dispute resolution.',
      },
      {
        heading: 'Disclaimer',
        body: 'Docrud provides document tools, not legal advice. The platform does not verify the legal validity of document content. Users are responsible for ensuring their documents comply with applicable law and should consult qualified legal professionals for high-stakes agreements.',
      },
      {
        heading: 'Jurisdiction',
        body: 'Users are responsible for determining whether e-signed documents are legally valid in their jurisdiction. Laws vary; some countries require specific digital signature certificates (DSC). Docrud does not issue DSCs as defined under Indian IT Act Schedule II.',
      },
    ],
  },

  'security-overview': {
    title: 'Security Overview',
    lastUpdated: 'January 2025',
    sections: [
      {
        heading: 'Security-First Architecture',
        body: 'Docrud is built with security as a foundational principle. Our infrastructure runs on isolated, SOC 2-aligned cloud environments with strict network segmentation, automated vulnerability scanning, and continuous threat monitoring.',
      },
      {
        heading: 'Access Control',
        body: 'All internal access to production systems follows least-privilege principles with mandatory MFA. Role-based access control (RBAC) limits data access to only what is necessary. All access events are logged and reviewed.',
      },
      {
        heading: 'Encryption',
        body: 'All data is encrypted at rest using AES-256 and in transit using TLS 1.3. Encryption keys are managed via a dedicated key management service with automatic rotation. Document payloads are encrypted before storage.',
      },
      {
        heading: 'Vulnerability Management',
        body: 'We run automated dependency scanning, static analysis, and penetration testing. Critical vulnerabilities are patched within 24 hours. We operate a responsible disclosure programme — see Report Vulnerability.',
      },
      {
        heading: 'Incident Response',
        body: 'We maintain a documented incident response plan with defined severity tiers, escalation paths, and communication protocols. Affected users are notified promptly in the event of a security incident impacting their data.',
      },
      {
        heading: 'Compliance',
        body: 'Our security programme aligns with ISO 27001 controls and India\'s DPDP Act 2023 requirements. We undergo periodic independent audits and maintain a security-first development lifecycle (SSDLC).',
      },
    ],
  },

  encryption: {
    title: 'Encryption Standards',
    lastUpdated: 'January 2025',
    sections: [
      {
        heading: 'Data at Rest',
        body: 'All documents, user data, and associated metadata stored on Docrud infrastructure are encrypted using AES-256-GCM. Encryption is applied at the storage layer, meaning data is protected even at the physical disk level.',
      },
      {
        heading: 'Data in Transit',
        body: 'All communications between clients and Docrud servers use TLS 1.3 with strong cipher suites. Older protocol versions (TLS 1.0, 1.1) and weak ciphers (RC4, 3DES) are explicitly disabled. HSTS is enforced with a minimum one-year max-age.',
      },
      {
        heading: 'Key Management',
        body: 'Encryption keys are managed by a dedicated key management service (KMS) with hardware security module (HSM) backing where applicable. Keys are rotated automatically on a 90-day cycle. Master keys are never stored alongside the data they protect.',
      },
      {
        heading: 'Document Payload Encryption',
        body: 'Sensitive document contents are additionally encrypted at the application layer before being written to storage. Each document has its own derived encryption key, ensuring a breach of one key does not expose all documents.',
      },
      {
        heading: 'Password Hashing',
        body: 'User passwords are never stored in plain text or reversibly encrypted. We use bcrypt with a work factor calibrated to balance security and performance. Password hashes are stored separately from user profile data.',
      },
      {
        heading: 'Signature Integrity',
        body: 'Signed documents are sealed with a SHA-256 cryptographic hash at signing time. Any subsequent modification to the document invalidates the hash, providing tamper evidence. The hash is stored independently of the document.',
      },
    ],
  },

  'doc-integrity': {
    title: 'Document Integrity',
    lastUpdated: 'January 2025',
    sections: [
      {
        heading: 'Hash-Based Verification',
        body: 'Every document on Docrud receives a SHA-256 content hash at creation and at each signing event. The hash is stored separately and can be recomputed at any time to verify the document has not been altered.',
      },
      {
        heading: 'Immutable Audit Trail',
        body: 'All significant document events — creation, sharing, viewing, commenting, signing, and revocation — are recorded in an append-only audit log. Entries include timestamp, actor identity, IP address, and action hash.',
      },
      {
        heading: 'Version History',
        body: 'For editable documents, Docrud maintains a complete version history. Each version is independently hashed and timestamped. Users can inspect the full edit history and restore previous versions where permissions allow.',
      },
      {
        heading: 'Revocation & Expiry',
        body: 'Shared document links can be revoked at any time. Revoked links return a 403 response and all associated access tokens are invalidated. Expiry dates can be set on shares to enforce time-limited access.',
      },
      {
        heading: 'Third-Party Verification',
        body: 'Document integrity certificates include the document hash, creation timestamp, and a platform signature. These certificates can be independently verified without Docrud being online, useful for long-term evidentiary purposes.',
      },
    ],
  },

  'generated-doc': {
    title: 'Generated Document Policy',
    lastUpdated: 'January 2025',
    sections: [
      {
        heading: 'AI-Assisted Generation',
        body: 'Docrud offers AI-assisted document generation features. Content generated by AI is provided as a starting point and may not be accurate, complete, or legally sufficient. Users must review all AI-generated content before use.',
      },
      {
        heading: 'No Legal Advice',
        body: 'Generated documents do not constitute legal advice. Templates and AI suggestions are for informational purposes only. For contracts, agreements, or any legally binding document, consult a qualified legal professional.',
      },
      {
        heading: 'User Responsibility',
        body: 'You are fully responsible for the accuracy, legality, and appropriateness of documents you generate and distribute. Corescent Technologies Pvt Ltd accepts no liability for errors, omissions, or harm resulting from generated content.',
      },
      {
        heading: 'Intellectual Property',
        body: 'AI-generated content does not carry an automatic copyright. The legal status of AI-generated works is evolving; users should not rely on AI-generated content as original copyrightable work without independent legal review.',
      },
      {
        heading: 'Data Used in Generation',
        body: 'Information you provide to generate documents is processed to produce the output and is subject to our Privacy Policy. We do not use your document content to train AI models without explicit consent.',
      },
    ],
  },

  trust: {
    title: 'Trust & Compliance',
    lastUpdated: 'January 2025',
    sections: [
      {
        heading: 'Our Compliance Framework',
        body: 'Docrud\'s compliance programme covers the Digital Personal Data Protection Act 2023, the Information Technology Act 2000, and ISO 27001 security controls. We undergo annual independent reviews to verify compliance.',
      },
      {
        heading: 'Data Localisation',
        body: 'All personal data of Indian users is stored and processed exclusively on infrastructure located within India. We do not transfer Indian personal data internationally without adequate safeguards as required by law.',
      },
      {
        heading: 'Vendor Due Diligence',
        body: 'All third-party vendors with access to personal data are vetted for security posture and legal compliance before onboarding. Vendor agreements include data processing addenda with appropriate obligations and audit rights.',
      },
      {
        heading: 'Employee Training',
        body: 'All staff receive mandatory data protection and security awareness training at onboarding and annually. Personnel with access to sensitive data undergo enhanced background verification.',
      },
      {
        heading: 'Transparency & Accountability',
        body: 'We publish this policy suite to be transparent about how we handle data and security. We appoint a Data Protection Officer and provide a grievance mechanism. Material changes to policies are communicated to users.',
      },
      {
        heading: 'Contact',
        body: 'For compliance enquiries, contact our DPO at dpo@corescent.in. For security matters, contact security@corescent.in. For general questions, use the Contact page.',
      },
    ],
  },

  about: {
    title: 'About Docrud',
    lastUpdated: 'May 2025',
    sections: [
      {
        heading: 'Our Story',
        body: 'Docrud was founded in India with a single mission: make professional document creation, sharing, and collaboration accessible to everyone — from solo freelancers to enterprise teams. We believe powerful document tools should not require expensive enterprise contracts.',
      },
      {
        heading: 'What We Build',
        body: 'Docrud is a full-stack document platform. We provide document generation with smart templates, secure file sharing with granular access controls, e-signatures with audit trails, a published content marketplace, and a gigs platform connecting professionals.',
      },
      {
        heading: 'Our Values',
        body: 'Privacy first — we never sell your data. Security by design — encryption is standard, not optional. Made in India — our team, infrastructure, and legal entity are proudly Indian. Accessible pricing — world-class tools at fair prices.',
      },
      {
        heading: 'The Company',
        body: 'Docrud is a product of Corescent Technologies Private Limited, a technology company incorporated in India. We are a small, focused team committed to building reliable, premium-grade software for the global market.',
      },
      {
        heading: 'Get in Touch',
        body: 'We love hearing from users. For partnerships, enterprise enquiries, or general feedback, reach us at hello@corescent.in or through the Contact page. We read every message.',
      },
    ],
  },

  careers: {
    title: 'Careers at Docrud',
    lastUpdated: 'May 2025',
    sections: [
      {
        heading: 'Join Our Team',
        body: 'We are a small, ambitious team building world-class document infrastructure from India. We value craftsmanship, thoughtful engineering, and a bias towards simplicity. If that resonates, we would love to hear from you.',
      },
      {
        heading: 'Open Roles',
        body: 'We hire across product engineering (Next.js, TypeScript, PostgreSQL), design (product & visual), and growth. We do not post every open role publicly — if you are exceptional, reach out regardless. We evaluate on skill and attitude, not pedigree.',
      },
      {
        heading: 'How We Work',
        body: 'We are remote-first within India with async-first communication. We move fast but thoughtfully. Engineers own features end-to-end. We prefer boring, reliable technology over trendy complexity.',
      },
      {
        heading: 'What We Offer',
        body: 'Competitive compensation, meaningful equity, flexible hours, and the rare opportunity to shape a product from near-zero. You will work on real problems with real users, not internal tooling for a faceless enterprise.',
      },
      {
        heading: 'How to Apply',
        body: 'Send a short note about yourself and what you would build here to careers@corescent.in. Attach work you are proud of — a GitHub profile, a live project, or a portfolio. We aim to respond within a week.',
      },
    ],
  },

  press: {
    title: 'Press & Media',
    lastUpdated: 'May 2025',
    sections: [
      {
        heading: 'Media Enquiries',
        body: 'For press coverage, interviews, partnership announcements, or media requests, please contact our communications team at press@corescent.in. We typically respond to media enquiries within 24 hours on business days.',
      },
      {
        heading: 'About the Company',
        body: 'Docrud is a document platform by Corescent Technologies Private Limited, an India-incorporated technology company. Docrud serves individual professionals, freelancers, and businesses seeking secure, modern document tooling.',
      },
      {
        heading: 'Brand Assets',
        body: 'Approved logos, product screenshots, and brand guidelines are available on request. Please do not modify Docrud or Corescent branding without written approval. Trademark usage must comply with our brand guidelines.',
      },
      {
        heading: 'Spokesperson',
        body: 'All official statements and quotes on behalf of Docrud or Corescent Technologies must be cleared through press@corescent.in. Unauthorised quotes or paraphrased statements should not be attributed to the company.',
      },
      {
        heading: 'Factual Information',
        body: 'Docrud is incorporated in India. Our platform serves users across categories including documents, file sharing, gigs, and published content. For specific metrics or data points for editorial use, please contact the press team.',
      },
    ],
  },
};

/* ─── Footer modal component ───────────────────────────────── */
function FooterModal({ modalKey, onClose }: { modalKey: string; onClose: () => void }) {
  const def = FOOTER_MODAL_CONTENT[modalKey];
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!def) return null;
  return (
    <div
      className="fixed inset-0 z-[999] flex items-end justify-center sm:items-center p-0 sm:p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative z-10 w-full sm:max-w-2xl max-h-[90dvh] sm:max-h-[82vh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-white/[0.08] bg-[#0e0e10] shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.06] px-6 py-5">
          <div>
            <p className="text-[15px] font-bold text-white/85 leading-snug">{def.title}</p>
            <p className="mt-0.5 text-[10.5px] text-white/25 font-medium">Last updated: {def.lastUpdated} · Corescent Technologies Pvt Ltd</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex shrink-0 items-center justify-center h-7 w-7 rounded-full border border-white/[0.08] bg-white/[0.04] text-white/40 transition hover:bg-white/[0.08] hover:text-white/70 active:scale-95"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto overscroll-contain px-6 py-6 space-y-5 no-scrollbar">
          {def.sections.map((s, i) => (
            <div key={i}>
              <p className="mb-1.5 text-[11.5px] font-bold text-white/60 tracking-[0.01em]">{s.heading}</p>
              <p className="text-[12.5px] leading-relaxed text-white/38">{s.body}</p>
            </div>
          ))}
          <div className="pt-4 border-t border-white/[0.05]">
            <p className="text-[10.5px] text-white/18 leading-relaxed">
              For questions about this policy, contact us at{' '}
              <span className="text-white/35 font-medium">legal@corescent.in</span>
              {' '}or visit the Contact page.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Footer data ──────────────────────────────────────────── */
type FooterLinkDef = { label: string; href?: string; modal?: string };

const FOOTER_COLS: { heading: string; links: FooterLinkDef[] }[] = [
  {
    heading: 'Platform',
    links: [
      { label: 'Published Content',  href: '/published' },
      { label: 'File Directory',     href: '/file-directory' },
      { label: 'Gigs Marketplace',   href: '/gigs' },
      { label: 'Knowledge Base',     href: '/knowledge' },
      { label: 'Workspace',          href: '/workspace' },
      { label: 'Pricing',            href: '/pricing' },
      { label: 'Schedule a Demo',    href: '/schedule-demo' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About Docrud',  modal: 'about' },
      { label: 'Blog',          href: '/blog' },
      { label: 'Contact Us',    href: '/contact' },
      { label: 'Careers',       modal: 'careers' },
      { label: 'Press & Media', modal: 'press' },
      { label: 'Sign Up',       href: '/signup' },
      { label: 'Sign In',       href: '/login' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Terms & Conditions',    modal: 'terms' },
      { label: 'Privacy Policy',        modal: 'privacy' },
      { label: 'Cookie Policy',         modal: 'cookies' },
      { label: 'Refund & Cancellation', modal: 'refund' },
      { label: 'Data Processing',       modal: 'data-processing' },
      { label: 'DPDP Act Compliance',   modal: 'dpdp' },
      { label: 'Acceptable Use',        modal: 'acceptable-use' },
      { label: 'Document Legality',     modal: 'doc-legality' },
    ],
  },
  {
    heading: 'Security',
    links: [
      { label: 'Security Overview',    modal: 'security-overview' },
      { label: 'Encryption Standards', modal: 'encryption' },
      { label: 'Document Integrity',   modal: 'doc-integrity' },
      { label: 'Generated Doc Policy', modal: 'generated-doc' },
      { label: 'Trust & Compliance',   modal: 'trust' },
      { label: 'Report Vulnerability', href: '/contact' },
    ],
  },
];

const SECURITY_BADGES = [
  { icon: '🔒', label: '256-bit AES Encryption' },
  { icon: '🛡', label: 'DPDP Act 2023 Compliant' },
  { icon: '🔐', label: 'TLS 1.3 in Transit' },
  { icon: '🇮🇳', label: 'Data Hosted in India' },
  { icon: '✓',  label: 'End-to-End Doc Security' },
];

function PremiumFooter() {
  const yr = new Date().getFullYear();
  const [activeModal, setActiveModal] = React.useState<string | null>(null);

  return (
    <>
      {activeModal && (
        <FooterModal modalKey={activeModal} onClose={() => setActiveModal(null)} />
      )}
      <footer className="relative w-full border-t border-white/[0.05] bg-[#080809]">

        {/* top gradient cap */}
        <div className="h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />

        {/* ── Brand strip ── */}
        <div className="border-b border-white/[0.04] px-4 py-8 sm:px-6 lg:px-10 xl:px-12">
          <div className="mx-auto flex max-w-7xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[18px] font-black tracking-[-0.03em] text-white/85">docrud</p>
              <p className="mt-0.5 text-[10.5px] font-medium text-white/25">
                A product by{' '}
                <span className="font-semibold text-white/40">Corescent Technologies Private Limited</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-white/25">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70 animate-pulse" />
                All systems operational
              </span>
            </div>
          </div>
        </div>

        {/* ── Link columns ── */}
        <div className="px-4 py-10 sm:px-6 lg:px-10 xl:px-12">
          <div className="mx-auto max-w-7xl grid grid-cols-2 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {FOOTER_COLS.map(col => (
              <div key={col.heading}>
                <p className="mb-4 text-[9px] font-bold uppercase tracking-[0.22em] text-white/25">
                  {col.heading}
                </p>
                <ul className="space-y-2.5">
                  {col.links.map(link => (
                    <li key={link.label}>
                      {link.modal ? (
                        <button
                          type="button"
                          onClick={() => setActiveModal(link.modal!)}
                          className="text-left text-[12px] font-medium text-white/35 transition-colors duration-150 hover:text-white/70"
                        >
                          {link.label}
                        </button>
                      ) : (
                        <Link
                          href={link.href!}
                          className="text-[12px] font-medium text-white/35 transition-colors duration-150 hover:text-white/70"
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* ── Security badges ── */}
        <div className="border-t border-white/[0.04] px-4 py-5 sm:px-6 lg:px-10 xl:px-12">
          <div className="mx-auto max-w-7xl">
            <p className="mb-3 text-[8.5px] font-bold uppercase tracking-[0.2em] text-white/15">
              Data Security &amp; Trust
            </p>
            <div className="flex flex-wrap gap-2">
              {SECURITY_BADGES.map(b => (
                <span
                  key={b.label}
                  className="flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.025] px-3 py-1 text-[10.5px] font-medium text-white/30"
                >
                  <span className="text-[11px] leading-none">{b.icon}</span>
                  {b.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Copyright bar ── */}
        <div className="border-t border-white/[0.04] px-4 py-5 sm:px-6 lg:px-10 xl:px-12">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">

            <div className="flex flex-col gap-0.5">
              <p className="text-[11px] font-medium text-white/22">
                © {yr} Corescent Technologies Private Limited. All rights reserved.
              </p>
              <p className="text-[10px] text-white/13">
                Docrud and the Docrud logo are trademarks of Corescent Technologies Pvt Ltd.
              </p>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-[10px] text-white/15 font-medium">
                Made with ❤ in India
              </span>
              <div className="flex items-center gap-2">
                {[
                  { label: 'Privacy', modal: 'privacy' },
                  { label: 'Terms',   modal: 'terms' },
                ].map(l => (
                  <button
                    key={l.label}
                    type="button"
                    onClick={() => setActiveModal(l.modal)}
                    className="text-[10px] font-semibold text-white/20 transition hover:text-white/50"
                  >
                    {l.label}
                  </button>
                ))}
                <Link
                  href="/contact"
                  className="text-[10px] font-semibold text-white/20 transition hover:text-white/50"
                >
                  Contact
                </Link>
              </div>
            </div>

          </div>
        </div>

      </footer>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   ProductScreenshotsSlider — CSS product UI mockups (no images needed)
───────────────────────────────────────────────────────────── */

/* Shared line helper */
const MLine = ({ w = '100%', h = 2, bg = 'rgba(255,255,255,0.10)', r = 2 }: { w?: string | number; h?: number; bg?: string; r?: number }) => (
  <div style={{ width: w, height: h, background: bg, borderRadius: r, flexShrink: 0 }} />
);

function PdfEditorMockup() {
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: '28%', background: '#0f0f14', borderRight: '1px solid rgba(255,255,255,0.06)', padding: '14px 9px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div style={{ width: 30, height: 30, borderRadius: 10, background: 'rgba(239,68,68,0.16)', border: '1px solid rgba(239,68,68,0.26)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
          <Wand2 style={{ width: 14, height: 14, color: '#ef4444' }} />
        </div>
        {[true, false, false, false].map((active, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 7px', borderRadius: 7, background: active ? 'rgba(239,68,68,0.12)' : 'transparent' }}>
            <div style={{ width: 7, height: 7, borderRadius: 2, background: active ? '#ef4444' : 'rgba(255,255,255,0.12)', flexShrink: 0 }} />
            <div style={{ height: 3.5, borderRadius: 2, flex: 1, background: active ? 'rgba(239,68,68,0.55)' : 'rgba(255,255,255,0.11)' }} />
          </div>
        ))}
        <div style={{ marginTop: 'auto', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', padding: '8px 9px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[['68%', 'rgba(255,255,255,0.28)'], ['48%', 'rgba(239,68,68,0.50)'], ['58%', 'rgba(255,255,255,0.18)']].map(([w, bg], i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
              <div style={{ height: 3, borderRadius: 1.5, background: 'rgba(255,255,255,0.07)', flex: 1 }} />
              <div style={{ height: 3, borderRadius: 1.5, background: bg, width: w, flexShrink: 0 }} />
            </div>
          ))}
        </div>
      </div>
      {/* Page thumbnails */}
      <div style={{ width: '19%', background: '#0b0b0f', borderRight: '1px solid rgba(255,255,255,0.05)', padding: '12px 6px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[true, false, false].map((active, i) => (
          <div key={i} style={{ borderRadius: 5, border: active ? '1.5px solid #ef4444' : '1px solid rgba(255,255,255,0.08)', background: '#fff', padding: '6px 5px', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {[80, 100, 62, 88, 52, 72].map((w, j) => (
              <div key={j} style={{ height: 2, background: j === 0 ? '#1a1a1a' : '#ddd', borderRadius: 1, width: `${w}%` }} />
            ))}
          </div>
        ))}
      </div>
      {/* Document preview */}
      <div style={{ flex: 1, background: '#d4d4d8', padding: 8 }}>
        <div style={{ background: '#fff', borderRadius: 6, height: '100%', padding: '12px 13px', boxShadow: '0 3px 16px rgba(0,0,0,0.16)', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Heading */}
          <div style={{ height: 11, borderRadius: 3, background: 'linear-gradient(90deg,#ef4444,#f87171)', width: '80%' }} />
          <div style={{ height: 5, borderRadius: 2, background: '#e0e0e0', width: '50%', marginBottom: 5 }} />
          {/* Section label bars */}
          <div style={{ height: 3.5, borderRadius: 2, background: '#bbb', width: '36%', marginBottom: 3 }} />
          {[100, 93, 88, 97, 83, 92, 76].map((w, i) => (
            <div key={i} style={{ height: 2.5, background: '#e8e8e8', borderRadius: 1, width: `${w}%` }} />
          ))}
          {/* Highlight block */}
          <div style={{ marginTop: 7, background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.16)', borderRadius: 5, padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {[82, 70, 88].map((w, i) => (
              <div key={i} style={{ height: 2.5, background: 'rgba(239,68,68,0.20)', borderRadius: 1, width: `${w}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScratchpadMockup() {
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: '#0e0e13' }}>
      {/* Left toolbar */}
      <div style={{ width: 30, background: '#111117', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 12, gap: 10 }}>
        {[PenLine, Search, Share2, Layers, FolderLock].map((Icon, i) => (
          <div key={i} style={{ width: 21, height: 21, borderRadius: 6, background: i === 0 ? 'rgba(249,115,22,0.22)' : 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon style={{ width: 10, height: 10, color: i === 0 ? '#f97316' : 'rgba(255,255,255,0.28)' }} />
          </div>
        ))}
      </div>
      {/* Canvas */}
      <div style={{ flex: 1, position: 'relative', padding: '12px 10px', overflow: 'hidden' }}>
        {/* Flow nodes row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center', marginBottom: 12 }}>
          {[
            { accent: '#f97316', bg: 'rgba(249,115,22,0.16)' },
            { accent: 'rgba(255,255,255,0.20)', bg: 'rgba(255,255,255,0.03)' },
            { accent: 'rgba(255,255,255,0.20)', bg: 'rgba(255,255,255,0.03)' },
            { accent: 'rgba(249,115,22,0.55)', bg: 'rgba(249,115,22,0.08)' },
            { accent: 'rgba(255,255,255,0.20)', bg: 'rgba(255,255,255,0.03)' },
          ].map((n, i) => (
            <React.Fragment key={i}>
              <div style={{ padding: '5px 8px', border: `1.5px solid ${n.accent}`, borderRadius: 6, background: n.bg, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 28 }}>
                <div style={{ height: 2.5, borderRadius: 1.5, background: n.accent, width: '100%' }} />
                <div style={{ height: 2, borderRadius: 1, background: n.accent, width: '65%', opacity: 0.55 }} />
              </div>
              {i < 4 && <ArrowRight style={{ width: 8, height: 8, color: 'rgba(255,255,255,0.18)', flexShrink: 0 }} />}
            </React.Fragment>
          ))}
        </div>
        {/* Sub-panels */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 7, padding: '7px 7px' }}>
            <div style={{ height: 2, width: '38%', borderRadius: 1, background: 'rgba(249,115,22,0.45)', marginBottom: 6 }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
              {[0,1,2,3].map(i => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, height: 18 }} />
              ))}
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 7, padding: '7px 7px' }}>
            <div style={{ height: 2, width: '38%', borderRadius: 1, background: 'rgba(249,115,22,0.45)', marginBottom: 6 }} />
            {[0,1,2,3].map(i => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <Check style={{ width: 7, height: 7, color: i < 2 ? '#34d399' : 'rgba(255,255,255,0.18)', flexShrink: 0 }} />
                <div style={{ height: 2.5, borderRadius: 1.5, background: 'rgba(255,255,255,0.14)', flex: 1 }} />
              </div>
            ))}
          </div>
        </div>
        {/* Colour palette */}
        <div style={{ position: 'absolute', bottom: 9, left: 10, display: 'flex', gap: 4 }}>
          {['#fff','#ef4444','#f97316','#fbbf24','#34d399','#60a5fa','#818cf8'].map(c => (
            <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, border: '1px solid rgba(255,255,255,0.18)', flexShrink: 0 }} />
          ))}
        </div>
      </div>
      {/* Right boards */}
      <div style={{ width: 34, background: '#111117', borderLeft: '1px solid rgba(255,255,255,0.06)', padding: '12px 5px', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
        <Layers style={{ width: 10, height: 10, color: '#f97316', marginBottom: 2 }} />
        {[true, false, false].map((active, i) => (
          <div key={i} style={{ width: '90%', height: 22, borderRadius: 5, background: active ? 'rgba(249,115,22,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${active ? 'rgba(249,115,22,0.28)' : 'rgba(255,255,255,0.06)'}` }} />
        ))}
      </div>
    </div>
  );
}

function DocWordMockup() {
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left sidebar */}
      <div style={{ width: '32%', background: '#0e0e12', borderRight: '1px solid rgba(255,255,255,0.06)', padding: '14px 9px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: 8, background: 'rgba(129,140,248,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <FileText style={{ width: 12, height: 12, color: '#818cf8' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ height: 5, width: 46, borderRadius: 2, background: 'rgba(255,255,255,0.72)' }} />
            <div style={{ height: 3, width: 64, borderRadius: 2, background: 'rgba(255,255,255,0.18)' }} />
          </div>
        </div>
        {/* Search bar */}
        <div style={{ height: 20, borderRadius: 7, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', paddingLeft: 7, gap: 5 }}>
          <Search style={{ width: 8, height: 8, color: 'rgba(255,255,255,0.22)' }} />
          <div style={{ height: 3, width: 50, borderRadius: 2, background: 'rgba(255,255,255,0.10)' }} />
        </div>
        {/* Doc items */}
        {[true, false, false, false].map((active, i) => (
          <div key={i} style={{ padding: '6px 7px', borderRadius: 7, background: active ? 'rgba(129,140,248,0.10)' : 'rgba(255,255,255,0.02)', border: active ? '1px solid rgba(129,140,248,0.22)' : '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 7, height: 7, borderRadius: 2, background: active ? '#818cf8' : 'rgba(255,255,255,0.12)', flexShrink: 0 }} />
              <div style={{ height: 3, borderRadius: 1.5, flex: 1, background: active ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.16)' }} />
            </div>
            {active && <div style={{ height: 2.5, width: '48%', borderRadius: 1.5, background: 'rgba(129,140,248,0.32)', marginLeft: 12 }} />}
          </div>
        ))}
      </div>
      {/* Editor */}
      <div style={{ flex: 1, background: '#f0f0f5', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 3, padding: '5px 8px', background: '#fff', borderBottom: '1px solid #e6e6ef', flexShrink: 0 }}>
          {[false, false, true, false, false].map((active, i) => (
            <div key={i} style={{ width: 28, height: 12, borderRadius: 3, background: active ? 'rgba(129,140,248,0.16)' : 'rgba(0,0,0,0.05)' }} />
          ))}
        </div>
        {/* Document */}
        <div style={{ flex: 1, background: '#fff', margin: '8px', borderRadius: 7, padding: '12px 13px', boxShadow: '0 2px 14px rgba(0,0,0,0.09)', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Title */}
          <div style={{ height: 11, width: '76%', borderRadius: 3, background: '#1a1a2e' }} />
          <div style={{ height: 5, width: '52%', borderRadius: 2, background: '#e4e4e4', marginBottom: 5 }} />
          {/* Comment box */}
          <div style={{ background: '#f5f5ff', border: '1px solid #dcdcf0', borderRadius: 5, padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#818cf8', flexShrink: 0 }} />
              <div style={{ height: 2.5, flex: 1, borderRadius: 1.5, background: '#d0d0e4' }} />
            </div>
            <div style={{ height: 2, width: '72%', borderRadius: 1, background: '#e0e0ec', marginLeft: 15 }} />
          </div>
          {/* Body lines */}
          {[100, 92, 87, 96, 80, 91].map((w, i) => (
            <div key={i} style={{ height: 2.5, background: '#ebebeb', borderRadius: 1, width: `${w}%` }} />
          ))}
          {/* E-sign strip */}
          <div style={{ marginTop: 'auto', background: 'rgba(129,140,248,0.07)', border: '1px solid rgba(129,140,248,0.18)', borderRadius: 6, padding: '6px 9px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex' }}>
              {['#818cf8','#a78bfa','#c084fc'].map((c, i) => (
                <div key={i} style={{ width: 15, height: 15, borderRadius: '50%', background: c, border: '1.5px solid #fff', marginLeft: i > 0 ? -5 : 0 }} />
              ))}
            </div>
            <div style={{ background: '#818cf8', borderRadius: 6, padding: '4px 9px', fontSize: 7, fontWeight: 700, color: '#fff' }}>e-Sign</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DocSheetsMockup() {
  const rowBars = [
    ['#34d399','rgba(255,255,255,0.16)','rgba(255,255,255,0.11)','rgba(255,255,255,0.18)'],
    ['rgba(255,255,255,0.13)','rgba(255,255,255,0.09)','#34d399','rgba(255,255,255,0.14)'],
    ['rgba(255,255,255,0.11)','#34d399','rgba(255,255,255,0.13)','rgba(255,255,255,0.17)'],
    ['rgba(255,255,255,0.15)','rgba(255,255,255,0.11)','rgba(255,255,255,0.09)','#34d399'],
    ['rgba(255,255,255,0.13)','rgba(255,255,255,0.17)','rgba(255,255,255,0.11)','rgba(255,255,255,0.13)'],
    ['rgba(255,255,255,0.09)','rgba(255,255,255,0.13)','rgba(255,255,255,0.17)','rgba(255,255,255,0.11)'],
  ];
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left panel */}
      <div style={{ width: '35%', background: '#0c0c10', borderRight: '1px solid rgba(255,255,255,0.06)', padding: '14px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 24, height: 24, borderRadius: 8, background: 'rgba(52,211,153,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Sheet style={{ width: 12, height: 12, color: '#34d399' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ height: 5, width: 52, borderRadius: 2, background: 'rgba(255,255,255,0.72)' }} />
            <div style={{ height: 3, width: 68, borderRadius: 2, background: 'rgba(255,255,255,0.18)' }} />
          </div>
        </div>
        {/* Headline bars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ height: 9, width: '86%', borderRadius: 3, background: 'rgba(255,255,255,0.65)' }} />
          <div style={{ height: 9, width: '58%', borderRadius: 3, background: '#34d399' }} />
        </div>
        {/* Desc bars */}
        {[100, 80, 88].map((w, i) => (
          <div key={i} style={{ height: 2.5, borderRadius: 1.5, background: 'rgba(255,255,255,0.13)', width: `${w}%` }} />
        ))}
        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 5 }}>
          <div style={{ flex: 1, background: '#34d399', borderRadius: 7, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Plus style={{ width: 10, height: 10, color: '#000' }} />
          </div>
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 7, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Share2 style={{ width: 10, height: 10, color: 'rgba(255,255,255,0.42)' }} />
          </div>
        </div>
        {/* Feature icon tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
          {[Sheet, Share2, Sparkles, BarChart2].map((Icon, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 7, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon style={{ width: 12, height: 12, color: '#34d399' }} />
            </div>
          ))}
        </div>
      </div>
      {/* Spreadsheet */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0b0b0f', overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px', background: '#111116', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          {[0,1,2].map(i => <div key={i} style={{ width: 14, height: 11, borderRadius: 3, background: 'rgba(255,255,255,0.07)' }} />)}
          <div style={{ flex: 1 }} />
          <div style={{ background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.20)', borderRadius: 4, padding: '2px 7px', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Sparkles style={{ width: 7, height: 7, color: '#34d399' }} />
            <div style={{ width: 20, height: 2.5, borderRadius: 1, background: 'rgba(52,211,153,0.45)' }} />
          </div>
        </div>
        {/* Col headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '14px repeat(4, 1fr)', background: '#111116', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
          <div style={{ borderRight: '1px solid rgba(255,255,255,0.06)', padding: 3 }} />
          {[75, 68, 82, 70].map((w, i) => (
            <div key={i} style={{ padding: '4px 5px', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ height: 3.5, borderRadius: 1.5, background: 'rgba(255,255,255,0.22)', width: `${w}%` }} />
            </div>
          ))}
        </div>
        {/* Data rows */}
        {rowBars.map((row, ri) => (
          <div key={ri} style={{ display: 'grid', gridTemplateColumns: '14px repeat(4, 1fr)', borderBottom: '1px solid rgba(255,255,255,0.04)', background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.012)', flexShrink: 0 }}>
            <div style={{ borderRight: '1px solid rgba(255,255,255,0.04)', padding: '4px 2px' }}>
              <div style={{ height: 3, borderRadius: 1, background: 'rgba(255,255,255,0.08)', width: '75%', margin: '0 auto' }} />
            </div>
            {row.map((bg, ci) => (
              <div key={ci} style={{ padding: '4px 5px', borderRight: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center' }}>
                <div style={{ height: 3.5, borderRadius: 1.5, background: bg, width: `${48 + (ci * 9 + ri * 13) % 42}%` }} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const PRODUCT_SCREENSHOTS: Array<{
  id: string; name: string; tagline: string; desc: string;
  accent: string; accentDim: string; Icon: React.ElementType;
  Mockup: () => React.ReactElement;
  modal: 'pdf' | 'scratchpad' | 'docsheets' | null;
  href: string | null;
}> = [
  { id: 'pdf',       name: 'PDF Editor', tagline: 'Edit PDFs. Your way.',         desc: 'Edit text, organise pages, watermark, merge & convert',             accent: '#ef4444', accentDim: 'rgba(239,68,68,0.18)',   Icon: Wand2,       Mockup: PdfEditorMockup,  modal: 'pdf',       href: null        },
  { id: 'scratchpad',name: 'Scratchpad', tagline: 'Scribble collaboratively.',     desc: 'Draw, diagram, and think visually — solo or with your team',        accent: '#f97316', accentDim: 'rgba(249,115,22,0.18)',  Icon: PenLine,     Mockup: ScratchpadMockup, modal: 'scratchpad',href: null        },
  { id: 'docword',   name: 'DocWord',    tagline: 'Create. Edit. E-Sign. Done.',   desc: 'The all-in-one document workspace for professionals',               accent: '#818cf8', accentDim: 'rgba(129,140,248,0.18)',Icon: FileText,    Mockup: DocWordMockup,    modal: null,        href: '/docword'  },
  { id: 'docsheets', name: 'DocSheets',  tagline: 'One place for .csv & .xlsx.',   desc: 'Smart spreadsheets — open, work, analyse, and ask AI',              accent: '#34d399', accentDim: 'rgba(52,211,153,0.18)', Icon: Sheet,       Mockup: DocSheetsMockup,  modal: 'docsheets', href: null        },
];

/* ─────────────────────────────────────────────────────────────
   PremiumProductSlider — animated product banner carousel
───────────────────────────────────────────────────────────── */
const PRODUCT_SLIDES = [
  {
    id: 'pdf',
    tag: 'PDF Studio',
    headline: 'Edit PDFs.',
    headlineAccent: 'Your way.',
    sub: 'Edit text, organise pages, add watermark, merge, split and convert PDFs with ease. All in one powerful editor.',
    cta: 'Open PDF Editor',
    accent: '#ef4444',
    accentDim: 'rgba(239,68,68,0.12)',
    accentBorder: 'rgba(239,68,68,0.25)',
    bgFrom: '#150404',
    bgTo: '#0d0e11',
    features: ['Edit Text', 'Organise Pages', 'Watermark', 'Merge & Split', 'Convert', 'Compress'],
    icon: '📄',
    badgeColor: 'rgba(239,68,68,0.18)',
    mockupLines: [
      { w: '72%', opacity: 0.55 }, { w: '90%', opacity: 0.42 }, { w: '60%', opacity: 0.30 },
      { w: '85%', opacity: 0.42 }, { w: '50%', opacity: 0.30 }, { w: '78%', opacity: 0.38 },
    ],
  },
  {
    id: 'scratchpad',
    tag: 'Scratchpad',
    headline: 'Think. Draw.',
    headlineAccent: 'Create.',
    sub: 'A flexible scratchpad for ideas, diagrams and visual thinking — built for clarity, collaboration and flow.',
    cta: 'Open Scratchpad',
    accent: '#f97316',
    accentDim: 'rgba(249,115,22,0.12)',
    accentBorder: 'rgba(249,115,22,0.25)',
    bgFrom: '#130a02',
    bgTo: '#0d0e11',
    features: ['Draw Freely', 'Collaborate', 'Multiple Boards', 'Smart Tools', 'Export', 'Share'],
    icon: '✏️',
    badgeColor: 'rgba(249,115,22,0.18)',
    mockupLines: [
      { w: '55%', opacity: 0.55 }, { w: '80%', opacity: 0.42 }, { w: '65%', opacity: 0.38 },
      { w: '90%', opacity: 0.30 }, { w: '45%', opacity: 0.42 }, { w: '70%', opacity: 0.30 },
    ],
  },
  {
    id: 'docword',
    tag: 'DocWord',
    headline: 'Create. Edit.',
    headlineAccent: 'E-Sign. Done.',
    sub: 'The all-in-one document workspace to create, collaborate, export, and get documents e-signed instantly.',
    cta: 'Open DocWord',
    accent: '#818cf8',
    accentDim: 'rgba(129,140,248,0.12)',
    accentBorder: 'rgba(129,140,248,0.25)',
    bgFrom: '#06050f',
    bgTo: '#0d0e11',
    features: ['Rich Editor', 'E-Sign Instantly', 'Export Anywhere', 'AI Assistant', 'Comments', 'Share'],
    icon: '📝',
    badgeColor: 'rgba(129,140,248,0.18)',
    mockupLines: [
      { w: '88%', opacity: 0.55 }, { w: '65%', opacity: 0.42 }, { w: '80%', opacity: 0.38 },
      { w: '50%', opacity: 0.30 }, { w: '92%', opacity: 0.42 }, { w: '58%', opacity: 0.30 },
    ],
  },
  {
    id: 'docsheets',
    tag: 'DocSheets',
    headline: 'Create .csv,',
    headlineAccent: '.xlsx files.',
    sub: 'Open, work, export, ask questions to your sheet, analyse with visuals in realtime, and create sheets with AI.',
    cta: 'Open DocSheets',
    accent: '#34d399',
    accentDim: 'rgba(52,211,153,0.12)',
    accentBorder: 'rgba(52,211,153,0.25)',
    bgFrom: '#020f08',
    bgTo: '#0d0e11',
    features: ['.CSV / .XLSX', 'Open & Work', 'Export Anywhere', 'Ask Questions', 'AI Sheet Maker', 'Visuals'],
    icon: '📊',
    badgeColor: 'rgba(52,211,153,0.18)',
    mockupLines: [
      { w: '82%', opacity: 0.55 }, { w: '60%', opacity: 0.42 }, { w: '75%', opacity: 0.38 },
      { w: '95%', opacity: 0.30 }, { w: '55%', opacity: 0.42 }, { w: '88%', opacity: 0.30 },
    ],
  },
] as const;

interface PremiumSliderActions {
  onPdfClick: () => void;
  onScratchpadClick: () => void;
  onDocSheetClick: () => void;
}

const SLIDE_ICONS = {
  pdf:        FileText,
  scratchpad: PenLine,
  docword:    FileSignature,
  docsheets:  Sheet,
} as const;

function PremiumProductSlider({ onPdfClick, onScratchpadClick, onDocSheetClick }: PremiumSliderActions) {
  const [active, setActive] = React.useState(0);
  const [prev, setPrev] = React.useState<number | null>(null);
  const [dir, setDir] = React.useState<'next' | 'prev'>('next');
  const [animating, setAnimating] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const total = PRODUCT_SLIDES.length;
  const touchStartX = React.useRef<number | null>(null);

  const handleCta = React.useCallback((id: string) => {
    if (id === 'pdf')        { onPdfClick();        return; }
    if (id === 'scratchpad') { onScratchpadClick(); return; }
    if (id === 'docsheets')  { onDocSheetClick();   return; }
    if (id === 'docword')    {
      /* smooth page transition — brief scale-down then navigate */
      const el = document.querySelector('.pps-card') as HTMLElement | null;
      if (el) {
        el.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
        el.style.opacity = '0.55';
        el.style.transform = 'scale(0.985)';
      }
      setTimeout(() => { window.location.href = '/docword'; }, 200);
    }
  }, [onPdfClick, onScratchpadClick, onDocSheetClick]);

  const go = React.useCallback((nextIdx: number, direction: 'next' | 'prev') => {
    if (animating) return;
    setDir(direction);
    setPrev(active);
    setActive(nextIdx);
    setAnimating(true);
    setTimeout(() => { setPrev(null); setAnimating(false); }, 480);
  }, [active, animating]);

  const goNext = React.useCallback(() => go((active + 1) % total, 'next'), [go, active, total]);
  const goPrev = React.useCallback(() => go((active - 1 + total) % total, 'prev'), [go, active, total]);

  React.useEffect(() => {
    if (paused) return;
    timerRef.current = setInterval(goNext, 4800);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [goNext, paused]);

  const slide = PRODUCT_SLIDES[active];

  /* swipe handling */
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    setPaused(true);
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current !== null) {
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      if (Math.abs(dx) > 40) { dx < 0 ? goNext() : goPrev(); }
      touchStartX.current = null;
    }
    setTimeout(() => setPaused(false), 2200);
  };

  const NavBtn = ({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) => (
    <button type="button" aria-label={label} onClick={onClick}
      className="flex items-center justify-center rounded-full transition-all duration-200 hover:scale-110 active:scale-90 shrink-0"
      style={{ width: 30, height: 30, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.11)', backdropFilter: 'blur(10px)', color: 'rgba(255,255,255,0.68)' }}>
      {children}
    </button>
  );

  return (
    <section className="w-full" style={{ paddingBottom: 2 }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <style>{`
        @keyframes pps-in-next  { from { opacity:0; transform:translateX(36px) scale(0.982); } to { opacity:1; transform:none; } }
        @keyframes pps-in-prev  { from { opacity:0; transform:translateX(-36px) scale(0.982); } to { opacity:1; transform:none; } }
        @keyframes pps-out-next { from { opacity:1; transform:none; } to { opacity:0; transform:translateX(-36px) scale(0.982); } }
        @keyframes pps-out-prev { from { opacity:1; transform:none; } to { opacity:0; transform:translateX(36px) scale(0.982); } }
        @keyframes pps-badge-in   { from { opacity:0; transform:translateY(-5px); }  to { opacity:1; transform:none; } }
        @keyframes pps-head-in    { from { opacity:0; transform:translateY(9px); }   to { opacity:1; transform:none; } }
        @keyframes pps-sub-in     { from { opacity:0; transform:translateY(12px); }  to { opacity:1; transform:none; } }
        @keyframes pps-chip-in    { from { opacity:0; transform:translateY(10px) scale(0.88); } to { opacity:1; transform:none; } }
        @keyframes pps-progress   { from { transform:scaleX(0); } to { transform:scaleX(1); } }
        @keyframes pps-orb        { 0%,100% { opacity:0.30; transform:scale(1); } 50% { opacity:0.44; transform:scale(1.08) translate(5px,-5px); } }
        @keyframes pps-grid-float { 0%,100% { opacity:0.045; } 50% { opacity:0.075; } }
        @keyframes pps-scan       { 0%,100% { opacity:0.24; } 50% { opacity:0.52; } }
        .pps-anim-in-next  { animation: pps-in-next  0.46s cubic-bezier(0.22,1,0.36,1) both; }
        .pps-anim-in-prev  { animation: pps-in-prev  0.46s cubic-bezier(0.22,1,0.36,1) both; }
        .pps-anim-out-next { animation: pps-out-next 0.26s cubic-bezier(0.55,0,1,0.45) both; }
        .pps-anim-out-prev { animation: pps-out-prev 0.26s cubic-bezier(0.55,0,1,0.45) both; }
      `}</style>

      {/* ── Card ── */}
      <div
        className="pps-card relative overflow-hidden rounded-2xl sm:rounded-[22px]"
        style={{
          background: `linear-gradient(150deg, ${slide.bgFrom} 0%, ${slide.bgTo} 100%)`,
          border: `1px solid ${slide.accentBorder}`,
          boxShadow: `0 0 0 1px rgba(255,255,255,0.035), 0 8px 36px rgba(0,0,0,0.62), 0 0 70px ${slide.accentDim}`,
          transition: 'background 0.55s ease, border-color 0.55s ease, box-shadow 0.55s ease',
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* dot-grid bg */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ zIndex:0,
          backgroundImage: `linear-gradient(${slide.accent}07 1px,transparent 1px),linear-gradient(90deg,${slide.accent}07 1px,transparent 1px)`,
          backgroundSize: '26px 26px', animation: 'pps-grid-float 9s ease-in-out infinite' }} />

        {/* orbs */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden" style={{ zIndex:0 }}>
          {/* will-change: opacity, transform lets the browser pre-bake the blur texture on the GPU
              so scale/translate/opacity changes don't require re-blurring each frame */}
          <div style={{ position:'absolute', top:'-20%', right:'6%', width:'clamp(120px,26vw,300px)', height:'clamp(120px,26vw,300px)', borderRadius:'50%', background:`radial-gradient(circle,${slide.accent}2e 0%,transparent 68%)`, animation:'pps-orb 7.5s ease-in-out infinite', filter:'blur(24px)', willChange:'opacity, transform' }} />
          <div style={{ position:'absolute', bottom:'-14%', left:'4%', width:'clamp(70px,14vw,160px)', height:'clamp(70px,14vw,160px)', borderRadius:'50%', background:`radial-gradient(circle,${slide.accent}18 0%,transparent 68%)`, animation:'pps-orb 12s ease-in-out infinite reverse', filter:'blur(18px)', willChange:'opacity, transform' }} />
        </div>

        {/* slide exit */}
        {prev !== null && animating && (() => {
          const ps = PRODUCT_SLIDES[prev];
          return (
            <div key={`out-${prev}`} className={dir === 'next' ? 'pps-anim-out-next' : 'pps-anim-out-prev'}
              style={{ position:'absolute', inset:0, zIndex:2 }}>
              <SlideContent slide={ps} animKey={-1} onCta={() => handleCta(ps.id)} />
            </div>
          );
        })()}

        {/* slide enter */}
        <div key={`in-${active}`} className={animating ? (dir === 'next' ? 'pps-anim-in-next' : 'pps-anim-in-prev') : ''}
          style={{ position:'relative', zIndex:3, width:'100%' }}>
          <SlideContent slide={slide} animKey={active} onCta={() => handleCta(slide.id)} />
        </div>

        {/* ── Desktop side arrows (sm+) — tucked inside padding, never over text ── */}
        <button type="button" aria-label="Previous slide" onClick={goPrev}
          className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 z-10 h-8 w-8 items-center justify-center rounded-full transition-all duration-200 hover:scale-110 active:scale-90"
          style={{ background:'rgba(0,0,0,0.38)', border:'1px solid rgba(255,255,255,0.10)', backdropFilter:'blur(12px)', color:'rgba(255,255,255,0.70)' }}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button type="button" aria-label="Next slide" onClick={goNext}
          className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 z-10 h-8 w-8 items-center justify-center rounded-full transition-all duration-200 hover:scale-110 active:scale-90"
          style={{ background:'rgba(0,0,0,0.38)', border:'1px solid rgba(255,255,255,0.10)', backdropFilter:'blur(12px)', color:'rgba(255,255,255,0.70)' }}>
          <ChevronRight className="h-3.5 w-3.5" />
        </button>

        {/* ── Desktop dots — inside card bottom ── */}
        <div className="hidden sm:flex absolute bottom-3 left-1/2 -translate-x-1/2 z-10 items-center gap-1.5">
          {PRODUCT_SLIDES.map((s, i) => (
            <button key={s.id} type="button" aria-label={`Slide ${i + 1}`}
              onClick={() => go(i, i > active ? 'next' : 'prev')}
              className="relative overflow-hidden rounded-full transition-all duration-300"
              style={{ width: i === active ? 22 : 5, height: 5,
                background: i === active ? s.accent : 'rgba(255,255,255,0.20)',
                boxShadow: i === active ? `0 0 6px ${s.accent}88` : 'none' }}>
              {i === active && !paused && (
                <span key={active} style={{ position:'absolute', inset:0, background:'rgba(255,255,255,0.28)', transformOrigin:'left', animation:'pps-progress 4.8s linear forwards' }} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Mobile control bar — BELOW card, never overlaps content ── */}
      <div className="flex sm:hidden items-center justify-between mt-2.5 px-3">
        <NavBtn onClick={goPrev} label="Previous slide"><ChevronLeft className="h-3.5 w-3.5" /></NavBtn>

        {/* dots */}
        <div className="flex items-center gap-1.5">
          {PRODUCT_SLIDES.map((s, i) => (
            <button key={s.id} type="button" aria-label={`Slide ${i + 1}`}
              onClick={() => go(i, i > active ? 'next' : 'prev')}
              className="relative overflow-hidden rounded-full transition-all duration-300"
              style={{ width: i === active ? 20 : 5, height: 5,
                background: i === active ? s.accent : 'rgba(255,255,255,0.18)',
                boxShadow: i === active ? `0 0 5px ${s.accent}88` : 'none' }}>
              {i === active && !paused && (
                <span key={active} style={{ position:'absolute', inset:0, background:'rgba(255,255,255,0.26)', transformOrigin:'left', animation:'pps-progress 4.8s linear forwards' }} />
              )}
            </button>
          ))}
        </div>

        <NavBtn onClick={goNext} label="Next slide"><ChevronRight className="h-3.5 w-3.5" /></NavBtn>
      </div>
    </section>
  );
}

function SlideContent({ slide, animKey, onCta }: { slide: typeof PRODUCT_SLIDES[number]; animKey: number; onCta: () => void }) {
  const SlideIcon = SLIDE_ICONS[slide.id];
  return (
    <div className="flex w-full items-stretch"
      style={{
        flexDirection: 'row',
        minHeight: 'clamp(148px, 22vw, 268px)',
        padding: 'clamp(20px,2.8vw,40px) clamp(16px,2.4vw,40px)',
      }}>

      {/* ── Left: text ── */}
      <div className="flex flex-1 flex-col justify-center"
        style={{ gap: 'clamp(6px,0.9vw,11px)', minWidth: 0,
          paddingLeft: 'clamp(0px,2vw,28px)',
          paddingRight: 'clamp(0px,2vw,20px)',
        }}>

        {/* Badge */}
        <div className="flex items-center gap-2" style={{ animation:'pps-badge-in 0.35s 0.03s cubic-bezier(0.22,1,0.36,1) both' }}>
          <span className="flex items-center justify-center rounded-full shrink-0"
            style={{ width:20, height:20, background: slide.badgeColor, border:`1px solid ${slide.accentBorder}` }}>
            <SlideIcon style={{ width:11, height:11, color: slide.accent, strokeWidth:2.2 }} />
          </span>
          <span className="rounded-full font-semibold uppercase"
            style={{ fontSize:'clamp(8px,0.75vw,9.5px)', letterSpacing:'0.10em',
              padding:'2px 8px', background: slide.badgeColor, color: slide.accent, border:`1px solid ${slide.accentBorder}` }}>
            {slide.tag}
          </span>
        </div>

        {/* Headline */}
        <h2 style={{
          fontSize: 'clamp(16px,2.6vw,40px)',
          fontWeight: 800, lineHeight: 1.07, letterSpacing: '-0.022em',
          color: 'rgba(255,255,255,0.92)', margin: 0,
          animation: 'pps-head-in 0.42s 0.09s cubic-bezier(0.22,1,0.36,1) both',
        }}>
          {slide.headline}{' '}
          <span style={{ color: slide.accent }}>{slide.headlineAccent}</span>
        </h2>

        {/* Subtitle */}
        <p className="hidden xs:block" style={{
          fontSize: 'clamp(9.5px,0.95vw,12.5px)', color:'rgba(255,255,255,0.42)', lineHeight:1.55, margin:0,
          display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden',
          maxWidth: 'clamp(180px,36vw,420px)',
          animation: 'pps-sub-in 0.44s 0.16s cubic-bezier(0.22,1,0.36,1) both',
        }}>
          {slide.sub}
        </p>

        {/* Feature chips — 4 on mobile, all on sm+ */}
        <div className="flex flex-wrap" style={{ gap:'clamp(3px,0.5vw,5px)', animation:'pps-sub-in 0.44s 0.20s cubic-bezier(0.22,1,0.36,1) both' }}>
          {slide.features.map((f, fi) => (
            <span key={f}
              className={fi >= 4 ? 'hidden sm:inline-flex' : 'inline-flex'}
              style={{
                fontSize: 'clamp(7.5px,0.7vw,9px)', fontWeight:500,
                padding: 'clamp(2px,0.3vw,3px) clamp(6px,0.9vw,9px)',
                borderRadius: 100,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.38)',
                animation: `pps-chip-in 0.34s ${0.24 + fi * 0.035}s cubic-bezier(0.22,1,0.36,1) both`,
              }}>
              {f}
            </span>
          ))}
        </div>

        {/* CTA */}
        <div style={{ animation:'pps-sub-in 0.44s 0.30s cubic-bezier(0.22,1,0.36,1) both', marginTop: 'clamp(2px,0.5vw,6px)' }}>
          <button type="button" onClick={onCta}
            className="inline-flex items-center gap-1.5 rounded-full font-semibold transition-all duration-200 hover:scale-[1.04] active:scale-[0.96] hover:brightness-110"
            style={{
              background: slide.accent, color:'#fff',
              fontSize: 'clamp(9px,0.85vw,11.5px)',
              padding: 'clamp(5px,0.65vw,8px) clamp(12px,1.5vw,20px)',
              boxShadow: `0 3px 16px ${slide.accent}44`,
              letterSpacing: '0.01em',
              cursor: 'pointer',
            }}>
            {slide.cta}
            <ArrowRight className="h-2.5 w-2.5 shrink-0" />
          </button>
        </div>
      </div>

      {/* ── Right: large icon, no fake UI chrome ── */}
      <div className="hidden sm:flex shrink-0 items-center justify-center"
        style={{ width:'clamp(120px,16vw,210px)', paddingLeft:'clamp(12px,1.8vw,24px)', paddingRight:'clamp(4px,1.2vw,16px)' }}>
        <div className="relative flex items-center justify-center"
          style={{ width:'clamp(84px,9vw,124px)', height:'clamp(84px,9vw,124px)' }}>
          {/* ambient glow ring */}
          <div aria-hidden="true" style={{ position:'absolute', inset:'-20px', borderRadius:'50%',
            background:`radial-gradient(circle, ${slide.accent}12 0%, transparent 62%)`,
            animation:'pps-orb 7.5s ease-in-out infinite' }} />
          {/* squircle icon container */}
          <div style={{
            position:'relative', display:'flex', alignItems:'center', justifyContent:'center',
            width:'100%', height:'100%', borderRadius:'26%',
            background:`linear-gradient(145deg, ${slide.accent}12 0%, rgba(255,255,255,0.025) 100%)`,
            border:`1px solid ${slide.accentBorder}`,
            backdropFilter:'blur(16px)',
            boxShadow:`0 0 0 1px rgba(255,255,255,0.035), 0 8px 32px rgba(0,0,0,0.5), 0 0 40px ${slide.accent}18`,
            animation:'pps-badge-in 0.44s 0.08s cubic-bezier(0.22,1,0.36,1) both',
          }}>
            <SlideIcon style={{
              color: slide.accent,
              width:'clamp(34px,4vw,54px)', height:'clamp(34px,4vw,54px)',
              strokeWidth: 1.35,
              filter:`drop-shadow(0 0 12px ${slide.accent}55)`,
            }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   PublishHeading — animated headline above content-type strip
───────────────────────────────────────────────────────────── */
const CYCLE_TYPES = [
  { label: 'News',       color: '#60a5fa', rgb: '96,165,250',   Icon: Newspaper    },
  { label: 'Gigs',       color: '#facc15', rgb: '250,204,21',   Icon: Zap          },
  { label: 'Articles',   color: '#818cf8', rgb: '129,140,248',  Icon: BookOpen     },
  { label: 'Events',     color: '#f87171', rgb: '248,113,113',  Icon: CalendarDays },
  { label: 'Docs',       color: '#22d3ee', rgb: '34,211,238',   Icon: FileText     },
  { label: 'Videos',     color: '#ef4444', rgb: '239,68,68',    Icon: Video        },
  { label: 'Jobs',       color: '#34d399', rgb: '52,211,153',   Icon: Briefcase    },
  { label: 'Portfolios', color: '#f472b6', rgb: '244,114,182',  Icon: Layers       },
  { label: 'Tutorials',  color: '#84cc16', rgb: '132,204,22',   Icon: BookMarked   },
  { label: 'Hackathons', color: '#4ade80', rgb: '74,222,128',   Icon: Terminal     },
  { label: 'Polls',      color: '#38bdf8', rgb: '56,189,248',   Icon: ListChecks   },
  { label: 'Charts',     color: '#10b981', rgb: '16,185,129',   Icon: BarChart2    },
] as const;

function PublishHeading({ onPublish }: { onPublish: () => void }) {
  const [idx, setIdx]     = React.useState(0);
  const [phase, setPhase] = React.useState<'in' | 'out'>('in');

  React.useEffect(() => {
    const out  = setTimeout(() => setPhase('out'), 2200);
    const swap = setTimeout(() => { setIdx(i => (i + 1) % CYCLE_TYPES.length); setPhase('in'); }, 2500);
    return () => { clearTimeout(out); clearTimeout(swap); };
  }, [idx]);

  const current = CYCLE_TYPES[idx];

  return (
    <div className="w-full select-none">
      <style>{`
        @keyframes ph-in  { from { opacity:0; transform:translateY(8px) scale(0.93); } to { opacity:1; transform:none; } }
        @keyframes ph-out { from { opacity:1; transform:none; } to { opacity:0; transform:translateY(-7px) scale(0.95); } }
        @keyframes ph-row { from { opacity:0; transform:translateX(-4px); } to { opacity:1; transform:none; } }
      `}</style>

      {/* Single flex row — never wraps */}
      <div
        className="flex items-center justify-between gap-2"
        style={{ animation: 'ph-row 0.45s 0.04s cubic-bezier(0.22,1,0.36,1) both' }}
      >
        {/* ── Headline (no-wrap) ── */}
        <div className="flex items-center gap-0 min-w-0 overflow-hidden" style={{ flex: '1 1 0' }}>

          {/* "Publish" */}
          <span style={{
            fontSize: 'clamp(14px,3.4vw,21px)', fontWeight: 800,
            letterSpacing: '-0.03em', lineHeight: 1,
            color: 'rgba(255,255,255,0.82)', whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            Publish
          </span>

          {/* Separator › */}
          <span style={{
            fontSize: 'clamp(13px,3vw,19px)', fontWeight: 400,
            color: 'rgba(255,255,255,0.18)', margin: '0 clamp(5px,1.2vw,9px)',
            flexShrink: 0, lineHeight: 1,
          }}>›</span>

          {/* Animated rotating word */}
          <span
            key={idx}
            style={{
              fontSize: 'clamp(14px,3.4vw,21px)', fontWeight: 800,
              letterSpacing: '-0.03em', lineHeight: 1,
              color: current.color,
              textShadow: `0 0 22px ${current.color}44`,
              display: 'inline-flex', alignItems: 'center', gap: 5,
              flexShrink: 0, whiteSpace: 'nowrap',
              animation: phase === 'in'
                ? 'ph-in 0.28s cubic-bezier(0.22,1,0.36,1) both'
                : 'ph-out 0.24s cubic-bezier(0.55,0,1,0.45) both',
            }}
          >
            <current.Icon style={{
              width: 'clamp(11px,2vw,15px)', height: 'clamp(11px,2vw,15px)',
              color: current.color, opacity: 0.72, flexShrink: 0,
            }} />
            {current.label}
          </span>

          {/* "& more." */}
          <span style={{
            fontSize: 'clamp(14px,3.4vw,21px)', fontWeight: 800,
            letterSpacing: '-0.03em', lineHeight: 1,
            color: 'rgba(255,255,255,0.38)', marginLeft: 'clamp(5px,1.2vw,9px)',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            &amp; more.
          </span>
        </div>

        {/* ── Publish CTA ── */}
        <button
          type="button"
          onClick={onPublish}
          className="shrink-0 flex items-center gap-1.5 font-semibold transition-all duration-200 hover:scale-[1.04] active:scale-[0.96]"
          style={{
            height: 'clamp(28px,5vw,34px)',
            padding: '0 clamp(10px,2vw,14px)',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.13)',
            backdropFilter: 'blur(16px)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.09), 0 2px 10px rgba(0,0,0,0.25)',
            color: 'rgba(255,255,255,0.75)',
            fontSize: 'clamp(10.5px,1.8vw,12.5px)',
            letterSpacing: '0.01em',
            whiteSpace: 'nowrap',
          }}
        >
          <Plus style={{ width: 'clamp(10px,1.6vw,12px)', height: 'clamp(10px,1.6vw,12px)', flexShrink: 0, opacity: 0.75 }} />
          Publish
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   ContentDiscoveryStrip — find-by-type stats bar
───────────────────────────────────────────────────────────── */
const CONTENT_TYPES = [
  { id: 'publish',      label: 'Publish',      count:   0, Icon: Send,         color: '#fb923c', rgb: '251,146,60'   },
  { id: 'news',         label: 'News',         count:   9, Icon: Newspaper,   color: '#60a5fa', rgb: '96,165,250'   },
  { id: 'article',      label: 'Articles',     count:   7, Icon: BookOpen,    color: '#818cf8', rgb: '129,140,248'  },
  { id: 'document',     label: 'Docs',         count:   6, Icon: FileText,    color: '#22d3ee', rgb: '34,211,238'   },
  { id: 'portfolio',    label: 'Portfolio',    count:   4, Icon: Layers,      color: '#f472b6', rgb: '244,114,182'  },
  { id: 'all',          label: 'All',         count: 125, Icon: LayoutGrid,  color: '#a78bfa', rgb: '167,139,250'  },
  { id: 'announcement', label: 'Announce',     count:   5, Icon: Megaphone,   color: '#fb923c', rgb: '251,146,60'   },
  { id: 'job',          label: 'Jobs',         count:   5, Icon: Briefcase,   color: '#34d399', rgb: '52,211,153'   },
  { id: 'resume',       label: 'Resumes',      count:   3, Icon: User,        color: '#2dd4bf', rgb: '45,212,191'   },
  { id: 'product',      label: 'Products',     count:   4, Icon: Package,     color: '#fbbf24', rgb: '251,191,36'   },
  { id: 'event',        label: 'Events',       count:   7, Icon: CalendarDays,color: '#f87171', rgb: '248,113,113'  },
  { id: 'hackathon',    label: 'Hackathons',   count:   6, Icon: Terminal,    color: '#4ade80', rgb: '74,222,128'   },
  { id: 'post',         label: 'Posts',        count:   5, Icon: PenLine,     color: '#c084fc', rgb: '192,132,252'  },
  { id: 'poll',         label: 'Polls',        count:   5, Icon: ListChecks,  color: '#38bdf8', rgb: '56,189,248'   },
  { id: 'survey',       label: 'Surveys',      count:   3, Icon: ClipboardList,color:'#f59e0b', rgb: '245,158,11'   },
  { id: 'chart',        label: 'Charts',       count:   3, Icon: BarChart2,   color: '#10b981', rgb: '16,185,129'   },
  { id: 'thread',       label: 'Threads',      count:   3, Icon: MessageSquare,color:'#3b82f6', rgb: '59,130,246'   },
  { id: 'video',        label: 'Videos',       count:   5, Icon: Video,       color: '#ef4444', rgb: '239,68,68'    },
  { id: 'milestone',    label: 'Milestones',   count:   3, Icon: Award,       color: '#eab308', rgb: '234,179,8'    },
  { id: 'tutorial',     label: 'Tutorials',    count:   4, Icon: BookMarked,  color: '#84cc16', rgb: '132,204,22'   },
  { id: 'gig',          label: 'Gigs',         count:  35, Icon: Zap,         color: '#facc15', rgb: '250,204,21'   },
] as const;

const CDS_VISIBLE_MOBILE = 3; // tabs shown on mobile
const CDS_VISIBLE_DESKTOP = 7; // tabs shown on desktop

function ContentDiscoveryStrip({ onPublish }: { onPublish?: () => void }) {
  const [open, setOpen]       = React.useState(false);
  const [activeId, setActiveId] = React.useState('news');
  const [isMobile, setIsMobile] = React.useState(false);
  const dropRef               = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const visibleCount   = isMobile ? CDS_VISIBLE_MOBILE : CDS_VISIBLE_DESKTOP;
  const visibleTabs    = CONTENT_TYPES.slice(0, visibleCount);
  const hiddenTabs     = CONTENT_TYPES.slice(visibleCount);
  const activeInHidden = hiddenTabs.some(t => t.id === activeId);

  return (
    /* ── outer wrapper: pills (scrollable) + More button side-by-side ── */
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', minWidth: 0 }}>
      <style>{`
        @keyframes cds-tab-in { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:none} }
        @keyframes cds-panel  { from{opacity:0;transform:translateY(-5px) scale(0.98)} to{opacity:1;transform:none} }
        .cds-scroll { overflow-x:auto; -webkit-overflow-scrolling:touch; scrollbar-width:none; flex:1 1 0; min-width:0; }
        .cds-scroll::-webkit-scrollbar { display:none; }
      `}</style>

      {/* Scrollable pill row */}
      <div className="cds-scroll" style={{ display:'flex', alignItems:'center', gap: 6, paddingBottom: 2 }}>
        {CONTENT_TYPES.slice(0, isMobile ? undefined : CDS_VISIBLE_DESKTOP).map(({ id, label, count, Icon, color, rgb }, i) => {
          const isActive = activeId === id;
          const commonStyle: React.CSSProperties = {
            display: 'inline-flex', alignItems: 'center', gap: 5,
            height: 31, padding: '0 10px 0 7px',
            borderRadius: 999, textDecoration: 'none', flexShrink: 0,
            background: isActive ? `rgba(${rgb},0.13)` : 'rgba(255,255,255,0.04)',
            border: `1px solid ${isActive ? `rgba(${rgb},0.28)` : 'rgba(255,255,255,0.07)'}`,
            boxShadow: isActive ? `0 0 14px rgba(${rgb},0.12), inset 0 1px 0 rgba(255,255,255,0.07)` : 'none',
            transition: 'background 160ms ease, border-color 160ms ease, box-shadow 160ms ease',
            animation: `cds-tab-in 0.26s ${Math.min(i, 6) * 0.025}s cubic-bezier(0.22,1,0.36,1) both`,
            whiteSpace: 'nowrap',
            cursor: 'pointer',
          };
          const inner = (
            <>
              <div style={{
                width: 17, height: 17, borderRadius: 6, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isActive ? `rgba(${rgb},0.26)` : `rgba(${rgb},0.10)`,
                transition: 'background 160ms ease',
              }}>
                <Icon style={{ width: 9.5, height: 9.5, color: isActive ? color : `rgba(${rgb},0.65)` }} />
              </div>
              <span style={{
                fontSize: 11.5, fontWeight: isActive ? 700 : 500, letterSpacing: '-0.01em',
                color: isActive ? 'rgba(255,255,255,0.90)' : 'rgba(255,255,255,0.44)',
                transition: 'color 160ms ease',
              }}>{label}</span>
              {isActive && count > 0 && (
                <span style={{ fontSize: 9, fontVariantNumeric: 'tabular-nums', fontWeight: 700, color, opacity: 0.68, marginLeft: 1 }}>{count}</span>
              )}
            </>
          );
          if (id === 'publish') {
            return (
              <button
                key={id}
                type="button"
                onClick={() => { setActiveId(id); setOpen(false); onPublish?.(); }}
                style={{ ...commonStyle, font: 'inherit' }}
              >
                {inner}
              </button>
            );
          }
          return (
            <Link
              key={id}
              href={`/published${id === 'all' ? '' : `?tab=${id}`}`}
              onClick={() => { setActiveId(id); setOpen(false); }}
              style={commonStyle}
            >
              {inner}
            </Link>
          );
        })}
      </div>

      {/* More button — OUTSIDE the scroll div so dropdown isn't clipped by overflow */}
      {!isMobile && (
        <div ref={dropRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              height: 31, padding: '0 10px',
              borderRadius: 999, cursor: 'pointer',
              background: open || activeInHidden ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${open || activeInHidden ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.07)'}`,
              transition: 'background 160ms ease, border-color 160ms ease',
              animation: `cds-tab-in 0.26s ${CDS_VISIBLE_DESKTOP * 0.025}s cubic-bezier(0.22,1,0.36,1) both`,
              whiteSpace: 'nowrap',
            }}
          >
            {activeInHidden && (() => {
              const at = CONTENT_TYPES.find(t => t.id === activeId)!;
              return (
                <div style={{ width: 15, height: 15, borderRadius: 5, background: `rgba(${at.rgb},0.20)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <at.Icon style={{ width: 8, height: 8, color: at.color }} />
                </div>
              );
            })()}
            <span style={{ fontSize: 11, fontWeight: 600, color: activeInHidden ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.32)', letterSpacing: '-0.01em' }}>
              {activeInHidden ? CONTENT_TYPES.find(t => t.id === activeId)!.label : 'More'}
            </span>
            <ChevronDown style={{
              width: 10, height: 10, color: 'rgba(255,255,255,0.28)',
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform 200ms cubic-bezier(0.34,1.56,0.64,1)',
            }} />
          </button>

          {open && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0,
              zIndex: 400, width: 256,
              borderRadius: 14, overflow: 'hidden',
              background: 'rgba(8,8,12,0.97)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(48px) saturate(2)',
              WebkitBackdropFilter: 'blur(48px) saturate(2)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.82), inset 0 1px 0 rgba(255,255,255,0.04)',
              animation: 'cds-panel 0.18s cubic-bezier(0.22,1,0.36,1) both',
            }}>
              <div style={{ padding: '9px 13px 7px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.11em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.20)' }}>All categories</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, padding: 5 }}>
                {CONTENT_TYPES.slice(CDS_VISIBLE_DESKTOP).filter(t => t.id !== 'publish').map(({ id, label, count, Icon, color, rgb }) => {
                  const isActive = activeId === id;
                  return (
                    <Link
                      key={id}
                      href={`/published?tab=${id}`}
                      onClick={() => { setActiveId(id); setOpen(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '7px 9px', borderRadius: 9, textDecoration: 'none',
                        background: isActive ? `rgba(${rgb},0.10)` : 'transparent',
                        border: `1px solid ${isActive ? `rgba(${rgb},0.18)` : 'transparent'}`,
                        transition: 'background 140ms ease',
                      }}
                      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
                      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <div style={{
                        width: 22, height: 22, borderRadius: 7, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: `rgba(${rgb},0.14)`,
                      }}>
                        <Icon style={{ width: 11, height: 11, color }} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11.5, fontWeight: isActive ? 700 : 500, color: isActive ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.52)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>{label}</div>
                        <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.20)', fontVariantNumeric: 'tabular-nums', marginTop: 1 }}>{count}</div>
                      </div>
                      {isActive && <div style={{ width: 4, height: 4, borderRadius: '50%', background: color, flexShrink: 0, marginLeft: 'auto' }} />}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   LiveLeaderboards — multi-board real-time section
───────────────────────────────────────────────────────────── */
type LBEntry = {
  id: string; name: string; subtitle: string; initials: string;
  avatarBg: string; value: number; valueLabel: string; href: string;
};
type LBPayload = {
  upraisers: LBEntry[]; followers: LBEntry[];
  liked: LBEntry[]; commented: LBEntry[]; viewed: LBEntry[];
  updatedAt: string;
};

const LB_CONFIGS = [
  { key: 'upraisers' as const, label: 'Upraises',      Icon: Sparkles,      iconCls: 'text-amber-400/60',   barCls: 'bg-amber-400/[0.22]',   accentCls: 'border-amber-400/[0.12]' },
  { key: 'followers' as const, label: 'Followers',     Icon: Users,         iconCls: 'text-sky-400/60',     barCls: 'bg-sky-400/[0.22]',     accentCls: 'border-sky-400/[0.12]' },
  { key: 'liked'     as const, label: 'Most Liked',    Icon: ThumbsUp,      iconCls: 'text-rose-400/60',    barCls: 'bg-rose-400/[0.22]',    accentCls: 'border-rose-400/[0.12]' },
  { key: 'commented' as const, label: 'Most Discussed',Icon: MessageCircle, iconCls: 'text-violet-400/60',  barCls: 'bg-violet-400/[0.22]',  accentCls: 'border-violet-400/[0.12]' },
  { key: 'viewed'    as const, label: 'Most Viewed',   Icon: Eye,           iconCls: 'text-emerald-400/60', barCls: 'bg-emerald-400/[0.22]', accentCls: 'border-emerald-400/[0.12]' },
] as const;

const PODIUM_HT_PX = [80, 104, 64];  // visual order: 2nd, 1st, 3rd
const PODIUM_RANKS = [2, 1, 3];

function LiveLeaderboards() {
  const REFRESH_INTERVAL = 30;

  const [boards, setBoards]         = React.useState<LBPayload | null>(null);
  const [lastUpdated, setLastUpd]   = React.useState<Date | null>(null);
  const [ticking, setTicking]       = React.useState(false);
  const [countdown, setCountdown]   = React.useState(REFRESH_INTERVAL);
  const [activeTab, setActiveTab]   = React.useState(0);
  const [podiumOpen, setPodiumOpen] = React.useState<Record<string, boolean>>(
    () => Object.fromEntries(LB_CONFIGS.map(c => [c.key, false]))
  );
  const [animKey, setAnimKey] = React.useState(0);
  const prevRanksRef  = React.useRef<Record<string, Record<string, number>>>({});
  const [rankDeltas, setRankDeltas] = React.useState<Record<string, Record<string, number>>>({});
  const [flashKeys, setFlashKeys]   = React.useState<Set<string>>(new Set());
  const tabsRef = React.useRef<HTMLDivElement>(null);
  const nextFetchRef = React.useRef<number>(Date.now() + REFRESH_INTERVAL * 1000);

  const fetchBoards = React.useCallback(async () => {
    setTicking(true);
    try {
      const res = await fetch('/api/public/leaderboards');
      if (!res.ok) return;
      const data = await res.json() as LBPayload;
      const newDeltas: Record<string, Record<string, number>> = {};
      const newFlash = new Set<string>();
      for (const cfg of LB_CONFIGS) {
        const entries: LBEntry[] = data[cfg.key] ?? [];
        const prev = prevRanksRef.current[cfg.key] ?? {};
        newDeltas[cfg.key] = {};
        entries.forEach((e, idx) => {
          const nr = idx + 1;
          if (prev[e.id] !== undefined && prev[e.id] !== nr) {
            newDeltas[cfg.key][e.id] = prev[e.id] - nr;
            newFlash.add(`${cfg.key}-${e.id}`);
          }
          prev[e.id] = nr;
        });
        prevRanksRef.current[cfg.key] = prev;
      }
      setRankDeltas(newDeltas);
      setBoards(data);
      setLastUpd(new Date());
      setAnimKey(k => k + 1);
      nextFetchRef.current = Date.now() + REFRESH_INTERVAL * 1000;
      setCountdown(REFRESH_INTERVAL);
      if (newFlash.size > 0) {
        setFlashKeys(newFlash);
        setTimeout(() => setFlashKeys(new Set()), 2500);
      }
    } catch { /* ignore */ }
    setTicking(false);
  }, []);

  React.useEffect(() => {
    fetchBoards();
    const fetchId = setInterval(fetchBoards, REFRESH_INTERVAL * 1000);
    // 2s resolution is plenty for a countdown display — halves state-update re-renders vs 1s
    const tickId  = setInterval(() => {
      const secs = Math.max(0, Math.round((nextFetchRef.current - Date.now()) / 1000));
      setCountdown(secs);
    }, 2000);
    return () => { clearInterval(fetchId); clearInterval(tickId); };
  }, [fetchBoards]);

  const hasAny = boards && LB_CONFIGS.some(c => (boards[c.key]?.length ?? 0) > 0);

  /* Skeleton */
  if (!boards) return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <div className="h-4 w-36 animate-pulse rounded-full bg-white/[0.06]" />
        <div className="h-4 w-10 animate-pulse rounded-full bg-white/[0.04]" />
      </div>
      <div className="hidden xl:grid grid-cols-5 gap-3">
        {[1,2,3,4,5].map(i => <div key={i} className="h-[480px] animate-pulse rounded-[18px] bg-white/[0.04]" />)}
      </div>
      <div className="xl:hidden h-[480px] animate-pulse rounded-[18px] bg-white/[0.04]" />
    </section>
  );
  if (!hasAny) return null;

  const togglePodium = (key: string) =>
    setPodiumOpen(prev => ({ ...prev, [key]: !prev[key] }));

  const renderCard = (cfg: typeof LB_CONFIGS[number], isActive?: boolean) => {
    const entries  = boards?.[cfg.key] ?? [];
    const maxVal   = Math.max(...entries.map(e => e.value), 1);
    const top3     = entries.slice(0, 3);
    const listRows = entries.slice(0, 8);
    const podiumOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3;
    const podiumRanks = top3.length >= 3 ? PODIUM_RANKS : top3.map((_, i) => i + 1);
    const CFG_Icon = cfg.Icon;
    const isPodOpen = podiumOpen[cfg.key] ?? false;

    return (
      <div
        key={`${cfg.key}-${animKey}`}
        style={{ animation: animKey > 0 ? 'lb-card-refresh 0.45s cubic-bezier(0.22,1,0.36,1)' : undefined }}
        className={[
          'flex flex-col rounded-[18px] border bg-[#0b0c0f] overflow-hidden',
          cfg.accentCls,
        ].join(' ')}
      >
        {/* Card header */}
        <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-white/[0.05]">
          <div className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] bg-white/[0.05]`}>
            <CFG_Icon className={`h-3 w-3 ${cfg.iconCls}`} />
          </div>
          <span className="flex-1 whitespace-nowrap text-[11.5px] font-bold text-white/75 leading-none">{cfg.label}</span>
          <button
            type="button"
            onClick={() => togglePodium(cfg.key)}
            title={isPodOpen ? 'Collapse podium' : 'Show podium'}
            className={[
              'flex shrink-0 items-center gap-1 rounded-[6px] border px-1.5 py-0.5 text-[9px] font-semibold transition-all duration-200 active:scale-95',
              isPodOpen
                ? 'border-amber-400/[0.18] bg-amber-400/[0.07] text-amber-400/70 hover:bg-amber-400/[0.12]'
                : 'border-white/[0.07] bg-white/[0.03] text-white/25 hover:bg-white/[0.07] hover:text-white/55',
            ].join(' ')}
          >
            <Crown className="h-2.5 w-2.5" />
            <span className="tabular-nums">{isPodOpen ? '▲' : '▼'}</span>
          </button>
        </div>

        {/* Rank list */}
        <div className="flex-1 divide-y divide-white/[0.03]">
          {listRows.map((e, idx) => {
            const rank    = idx + 1;
            const delta   = rankDeltas[cfg.key]?.[e.id] ?? 0;
            const isFlash = flashKeys.has(`${cfg.key}-${e.id}`);
            const barW    = maxVal > 0 ? Math.max(4, Math.round((e.value / maxVal) * 100)) : 4;

            return (
              <Link
                key={e.id}
                href={e.href}
                className={[
                  'group flex items-center gap-2.5 px-3.5 py-2.5 transition-all duration-200',
                  isFlash ? 'bg-white/[0.04]' : 'hover:bg-white/[0.025]',
                ].join(' ')}
              >
                {/* Rank badge */}
                <div className="w-5 shrink-0 text-center leading-none">
                  {rank === 1 ? (
                    <Trophy className="h-3.5 w-3.5 mx-auto text-amber-400/70" />
                  ) : rank === 2 ? (
                    <Award className="h-3 w-3 mx-auto text-white/40" />
                  ) : rank === 3 ? (
                    <Medal className="h-3 w-3 mx-auto text-white/25" />
                  ) : (
                    <span className="text-[10px] font-bold tabular-nums text-white/20">{rank}</span>
                  )}
                </div>

                {/* Avatar */}
                <div className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${e.avatarBg} text-[8px] font-bold text-white shadow-sm`}>
                  {e.initials}
                </div>

                {/* Name + bar */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-[11px] font-medium text-white/55 group-hover:text-white/85 transition-colors leading-tight">
                      {e.name}
                    </span>
                    <span className={`shrink-0 min-w-[22px] text-right text-[10.5px] font-bold tabular-nums transition-[color,transform] duration-300 ${isFlash ? 'text-white/95 scale-110' : 'text-white/45'}`}>
                      {e.valueLabel}
                    </span>
                  </div>
                  <div className="mt-[3px] h-[2px] rounded-full bg-white/[0.04] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${cfg.barCls} transition-[width] duration-1000`}
                      style={{ width: `${barW}%` }}
                    />
                  </div>
                </div>

                {/* Delta arrow */}
                <div className="w-4 shrink-0 flex items-center justify-center">
                  {delta > 0 ? (
                    <span className={`flex items-center gap-0.5 ${isFlash ? 'animate-bounce' : ''}`}>
                      <TrendingUp className="h-2.5 w-2.5 text-emerald-400/80" />
                      {delta > 1 && <span className="text-[8px] font-bold text-emerald-400/70">{delta}</span>}
                    </span>
                  ) : delta < 0 ? (
                    <span className={`flex items-center gap-0.5 ${isFlash ? 'animate-bounce' : ''}`}>
                      <TrendingDown className="h-2.5 w-2.5 text-red-400/65" />
                      {Math.abs(delta) > 1 && <span className="text-[8px] font-bold text-red-400/55">{Math.abs(delta)}</span>}
                    </span>
                  ) : rank <= 5 ? (
                    <span className="block h-px w-2.5 rounded-full bg-white/[0.07] mx-auto" />
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>

        {/* Podium — collapsible */}
        <div
          className="overflow-hidden transition-[max-height] duration-500"
          style={{ maxHeight: isPodOpen ? '260px' : '0px', opacity: isPodOpen ? 1 : 0 }}
        >
          {top3.length > 0 && (
            <div className="border-t border-white/[0.04] bg-white/[0.012] px-3 pt-3 pb-4">
              <div className="flex items-end justify-center gap-2">
                {podiumOrder.map((e, pIdx) => {
                  const rank    = podiumRanks[pIdx];
                  const ht      = PODIUM_HT_PX[pIdx];
                  const isFirst = rank === 1;
                  const podAlpha  = isFirst ? '0.16' : rank === 2 ? '0.09' : '0.06';
                  const ringAlpha = isFirst ? '0.28' : '0.13';
                  return (
                    <Link
                      key={e.id}
                      href={e.href}
                      className="flex flex-col items-center gap-1 group"
                      style={{ width: isFirst ? 74 : 60 }}
                    >
                      <div
                        className="relative flex items-center justify-center rounded-full transition-transform duration-300 group-hover:scale-110"
                        style={{ width: isFirst ? 36 : 28, height: isFirst ? 36 : 28 }}
                      >
                        <div
                          className={`absolute inset-0 rounded-full bg-gradient-to-br ${e.avatarBg}`}
                          style={{ boxShadow: `0 0 0 2px rgba(255,255,255,${ringAlpha})` }}
                        />
                        <span className="relative z-10 text-[9px] font-bold text-white">{e.initials}</span>
                        {isFirst && (
                          <Crown
                            className="absolute -top-3.5 left-1/2 -translate-x-1/2 h-3.5 w-3.5 text-amber-400/70"
                            style={{ filter: 'drop-shadow(0 0 6px rgba(251,191,36,0.35))' }}
                          />
                        )}
                      </div>
                      <div className="text-center" style={{ maxWidth: isFirst ? 70 : 56 }}>
                        <div className="truncate text-[8.5px] font-semibold text-white/60 leading-tight">
                          {e.name.split(' ')[0]}
                        </div>
                        <div className={`text-[8px] font-bold tabular-nums ${isFirst ? 'text-white/75' : 'text-white/35'}`}>
                          {e.valueLabel}
                        </div>
                      </div>
                      <div
                        className="w-full rounded-t-[5px] flex items-start justify-center pt-1"
                        style={{ height: ht, background: `rgba(255,255,255,${podAlpha})` }}
                      >
                        <span className="mt-0.5 rounded-full border border-white/[0.10] bg-white/[0.07] px-1.5 py-0.5 text-[7.5px] font-bold text-white/50">
                          #{rank}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <section>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-white/[0.05] border border-white/[0.07]">
            <Trophy className="h-3.5 w-3.5 text-amber-400/60" />
          </div>
          <h2 className="text-[14px] font-bold tracking-tight text-white">Live Leaderboards</h2>
          {lastUpdated && (
            <span className="hidden sm:inline text-[10px] text-white/18 tabular-nums">
              {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>

        {/* Right: countdown + refresh button */}
        <div className="flex items-center gap-2.5">
          {/* Countdown ring */}
          <div className="flex items-center gap-2 rounded-[10px] border border-white/[0.07] bg-white/[0.03] px-3 py-1.5">
            {/* SVG ring */}
            <svg width="22" height="22" viewBox="0 0 22 22" className="shrink-0 -rotate-90">
              <circle cx="11" cy="11" r="8" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
              <circle
                cx="11" cy="11" r="8" fill="none"
                stroke={ticking ? 'rgba(52,211,153,0.7)' : 'rgba(255,255,255,0.28)'}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 8}`}
                strokeDashoffset={`${2 * Math.PI * 8 * (1 - countdown / REFRESH_INTERVAL)}`}
                style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s ease' }}
              />
            </svg>
            <div className="flex flex-col items-center leading-none">
              <span className={`text-[13px] font-bold tabular-nums leading-none ${countdown <= 5 ? 'text-amber-400/80' : 'text-white/55'} transition-colors duration-300`}>
                {ticking ? (
                  <RefreshCw className="h-3 w-3 animate-spin text-emerald-400/70" />
                ) : (
                  countdown
                )}
              </span>
              <span className="mt-0.5 text-[8px] font-semibold text-white/20 tracking-wide">sec</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => { nextFetchRef.current = Date.now(); fetchBoards(); }}
            disabled={ticking}
            className="flex items-center gap-1.5 rounded-[8px] border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-white/30 transition hover:bg-white/[0.07] hover:text-white/60 active:scale-95 disabled:opacity-40"
          >
            <RefreshCw className={`h-3 w-3 ${ticking ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Mobile: tab bar */}
      <div className="xl:hidden mb-3">
        <div ref={tabsRef} className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {LB_CONFIGS.map((cfg, i) => {
            const CFG_Icon = cfg.Icon;
            return (
              <button
                key={cfg.key}
                type="button"
                onClick={() => setActiveTab(i)}
                className={[
                  'flex shrink-0 items-center gap-1.5 rounded-[10px] border px-3.5 py-2 text-[11px] font-semibold transition-all duration-200',
                  activeTab === i
                    ? `bg-white/[0.08] border-white/[0.15] text-white/90`
                    : 'bg-white/[0.02] border-white/[0.05] text-white/35 hover:bg-white/[0.05] hover:text-white/60',
                ].join(' ')}
              >
                <CFG_Icon className={`h-3 w-3 ${activeTab === i ? cfg.iconCls : 'text-white/25'}`} />
                {cfg.label}
              </button>
            );
          })}
        </div>
        {/* Active tab card on mobile */}
        <div className="mt-3">
          {renderCard(LB_CONFIGS[activeTab], true)}
        </div>
      </div>

      {/* Desktop: full 5-col grid */}
      <div className="hidden xl:grid grid-cols-5 gap-3">
        {LB_CONFIGS.map(cfg => renderCard(cfg))}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   NewHomepageContent — hero layout matching the reference image
───────────────────────────────────────────────────────────── */
type NHCLiveProfile = {
  id: string; name: string; accountType: string; createdAt: string; docrudGo: boolean;
  profile: { headline?: string; bio?: string; location?: string; avatarUrl?: string; bannerUrl?: string; coverGradient?: string; coverPosition?: string; skills?: string[]; openToWork?: boolean };
  stats: { followers: number; following: number; gigsCount: number };
  upraiseCount: number;
};
type NHCLiveGig = {
  id: string; slug: string; title: string; summary: string; category: string;
  skills: string[]; budgetLabel: string; timelineLabel: string; engagementType: string;
  locationPreference: string; ownerName: string; organizationName: string;
  connectCount: number; status: string; urgentUntil?: string; createdAt: string;
};
type NHCLiveMetrics = {
  publishes: { value: string; raw: number; label: string };
  people: { value: string; raw: number; label: string };
  upraises: { value: string; raw: number; label: string };
  gigs: { value: string; raw: number; label: string };
};
type NHCLiveFeed = {
  id: string; shareId: string; category: string; catCls: string; ilk: string;
  title: string; description: string; author: string; authorAv: string; authorBg: string;
  likes: string; likesRaw: number; comments: number; href: string;
  thumbnailUrl?: string | null; mimeType?: string | null; createdAt?: string; featured?: boolean;
};

/* ─── Feed description chip renderer (homepage compact cards) ────────
   Detects "Key: Value Key2: Value2" metadata and renders as mini chips.
   Falls back to plain prose for normal posts.
─────────────────────────────────────────────────────────────────── */
function FeedDescChips({ desc, accent }: { desc: string; accent: string }) {
  if (!desc || !desc.trim()) return null;

  const text = desc
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\d{4}-\d{2}-\d{2}(\s*[–\-]\s*\d{4}-\d{2}-\d{2})?/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Count "Key: " patterns — if ≥2 it's structured metadata
  const keyCount = (text.match(/\b[A-Z][A-Za-z][\w\s\/()]{1,22}:\s+/g) || []).length;

  if (keyCount >= 2) {
    const pairs: { key: string; value: string }[] = [];
    const re = /([A-Z][A-Za-z][\w\s\/()]{1,22}):\s+([^:]+?)(?=\s+[A-Z][A-Za-z][\w\s\/()]{1,22}:|\s*$)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const k = m[1].trim(); const v = m[2].trim();
      if (/url|deadline|dates?$/i.test(k)) continue; // skip noisy fields
      if (v && v.length < 50) pairs.push({ key: k, value: v });
    }

    if (pairs.length >= 2) {
      const KEY_ICON: Record<string, string> = {
        organiser: '👤', organizer: '👤', host: '👤',
        'themes / tracks': '🎯', themes: '🎯', tracks: '🎯', track: '🎯',
        'prize pool': '🏆', prize: '🏆',
        mode: '📍', venue: '📍',
        'team size': '👥',
        time: '🕐',
      };
      const icon = (k: string) => KEY_ICON[k.toLowerCase()] ?? '';
      return (
        <div className="feed-desc" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center', padding: '0 4px' }}>
          {pairs.slice(0, 5).map(({ key, value }) => (
            <span key={key} style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              background: 'rgba(0,0,0,0.52)', backdropFilter: 'blur(8px)',
              border: `1px solid ${accent}28`,
              borderRadius: 99, padding: '2px 7px',
            }}>
              {icon(key) && <span style={{ fontSize: 8, lineHeight: 1 }}>{icon(key)}</span>}
              <span style={{ fontSize: 8.5, fontWeight: 600, color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {key.length > 12 ? key.slice(0, 11) + '…' : key}
              </span>
              <span style={{ fontSize: 9.5, fontWeight: 500, color: 'rgba(255,255,255,0.72)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {value}
              </span>
            </span>
          ))}
        </div>
      );
    }
  }

  // Plain prose fallback
  const clean = text.slice(0, 80) + (text.length > 80 ? '…' : '');
  return (
    <p className="feed-desc text-center"
      style={{ fontSize: 10, color: 'rgba(255,255,255,0.58)', lineHeight: 1.45, letterSpacing: '-0.005em', textShadow: '0 1px 6px rgba(0,0,0,0.80)', padding: '0 4px' }}>
      {clean}
    </p>
  );
}

/* ─── Feed description formatter ─────────────────────────────────────
   Real published items store structured metadata as plain text:
   "Hackathon: X Organiser: Y Prize Pool: 10L Mode: in-person …"
   This strips key labels and builds a clean 2–4 part summary.
─────────────────────────────────────────────────────────────────── */
function formatFeedDesc(raw: string): string {
  if (!raw || !raw.trim()) return '';

  // Remove URLs and ISO date strings
  const text = raw
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\d{4}-\d{2}-\d{2}(\s*[–\-]\s*\d{4}-\d{2}-\d{2})?/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Quick helper — extract value for a specific key label (case-insensitive)
  const pick = (pattern: string) => {
    const re = new RegExp(`${pattern}:\\s+([\\w][^:]{0,60}?)(?=\\s+[A-Z][A-Za-z][\\w\\s/]*?:|\\s*$)`, 'i');
    const m = text.match(re);
    return m ? m[1].trim() : '';
  };

  // Check if this looks like structured key: value metadata
  const keyCount = (text.match(/[A-Z][A-Za-z][\w\s/]*?:\s/g) || []).length;

  if (keyCount >= 2) {
    const parts: string[] = [];

    // Organiser / host
    const org = pick('Organiser') || pick('Organizer') || pick('Host') || pick('By');
    if (org && org.length < 45 && !/^\d/.test(org)) parts.push(`by ${org}`);

    // Themes / tracks
    const theme = pick('Themes\\s*/\\s*Tracks?') || pick('Tracks?') || pick('Themes?') || pick('Topics?') || pick('Category');
    if (theme && theme.length < 40) parts.push(theme);

    // Prize pool — custom: allow "10 Lakhs", "₹5L", "$10k" etc.
    const prizeM = text.match(/Prize\s*Pool:\s*([\d₹$,\s]+(?:Lakhs?|L\b|K\b|Crore|CR\b|USD|INR)?)/i);
    if (prizeM) parts.push(`🏆 ${prizeM[1].replace(/\s+/g, ' ').trim()}`);

    // Mode
    const mode = pick('Mode');
    if (mode && mode.length < 20) parts.push(mode.charAt(0).toUpperCase() + mode.slice(1));

    // Team size
    const team = pick('Team\\s*Size');
    if (team && team.length < 15) parts.push(`${team} / team`);

    if (parts.length >= 2) return parts.slice(0, 4).join(' · ');

    // Fallback: strip all "Key: " labels and show cleaned values
    return text
      .replace(/[A-Z][A-Za-z][\w\s/]*?:\s*/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 82);
  }

  // Plain prose
  const clean = text.slice(0, 88);
  return text.length > 88 ? `${clean}…` : clean;
}

type AdBanner = {
  id: string;
  imageUrl: string;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaHref?: string;
  active: boolean;
  order: number;
  createdAt: string;
};

const BANNER_HEADING_FALLBACK = 'Featured & Promotions';

function AdBannerSlider() {
  const [banners, setBanners]     = useState<AdBanner[]>([]);
  const [heading, setHeading]     = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const trackRef  = useRef<HTMLDivElement>(null);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const pausedRef = useRef(false);
  const scrolling = useRef(false); // prevent observer loop during programmatic scroll

  /* ── fetch ─────────────────────────────────────────────────────── */
  useEffect(() => {
    fetch('/api/public/ad-banners', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { banners: [], heading: '' })
      .then((d: { banners?: AdBanner[]; heading?: string }) => {
        if (Array.isArray(d.banners) && d.banners.length) setBanners(d.banners);
        setHeading(d.heading ?? '');
      })
      .catch(() => {});
  }, []);

  /* ── scroll to a slide index (centres the card) ─────────────────── */
  const goTo = useCallback((idx: number) => {
    const track = trackRef.current; if (!track) return;
    const card = track.children[idx] as HTMLElement | undefined; if (!card) return;
    scrolling.current = true;
    // offsetLeft relative to the track's own left edge
    const trackPad = parseFloat(getComputedStyle(track).paddingLeft) || 0;
    const centerOffset = (track.clientWidth - card.offsetWidth) / 2;
    const target = card.offsetLeft - trackPad - centerOffset + trackPad;
    track.scrollTo({ left: Math.max(0, card.offsetLeft - centerOffset), behavior: 'smooth' });
    setActiveIdx(idx);
    // clear the lock after animation (scroll-snap settles in ~500 ms)
    setTimeout(() => { scrolling.current = false; }, 600);
  }, []);

  /* ── auto-play timer ────────────────────────────────────────────── */
  const resetTimer = useCallback((len: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (len < 2) return;
    timerRef.current = setInterval(() => {
      if (pausedRef.current) return;
      setActiveIdx(prev => {
        const next = (prev + 1) % len;
        // schedule goTo after state flush
        requestAnimationFrame(() => {
          const track = trackRef.current; if (!track) return;
          const card = track.children[next] as HTMLElement | undefined; if (!card) return;
          scrolling.current = true;
          const center = (track.clientWidth - card.offsetWidth) / 2;
          track.scrollTo({ left: Math.max(0, card.offsetLeft - center), behavior: 'smooth' });
          setTimeout(() => { scrolling.current = false; }, 600);
        });
        return next;
      });
    }, 4500);
  }, []);

  useEffect(() => {
    if (!banners.length) return;
    resetTimer(banners.length);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [banners.length, resetTimer]);

  /* ── IntersectionObserver — track which card is most visible ────── */
  useEffect(() => {
    const track = trackRef.current; if (!track || !banners.length) return;
    const obs = new IntersectionObserver(
      entries => {
        if (scrolling.current) return; // ignore events during programmatic scroll
        let best: { idx: number; ratio: number } = { idx: activeIdx, ratio: 0 };
        entries.forEach(e => {
          const idx = parseInt((e.target as HTMLElement).dataset.idx ?? '-1', 10);
          if (!isNaN(idx) && e.intersectionRatio > best.ratio) {
            best = { idx, ratio: e.intersectionRatio };
          }
        });
        if (best.ratio > 0) setActiveIdx(best.idx);
      },
      { root: track, threshold: [0.5, 0.75, 1.0] }
    );
    Array.from(track.children).forEach(c => obs.observe(c));
    return () => obs.disconnect();
  }, [banners.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!banners.length) return null;

  const displayHeading = heading.trim() || BANNER_HEADING_FALLBACK;

  return (
    <div>
      {/* ── Section heading ── */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] font-semibold tracking-[0.10em] uppercase"
            style={{ color: 'rgba(255,255,255,0.28)' }}
          >
            {displayHeading}
          </span>
          {!heading.trim() && (
            <span
              className="rounded-[5px] px-1.5 py-[2px] text-[8.5px] font-semibold"
              style={{ background: 'rgba(99,102,241,0.08)', color: 'rgba(165,180,252,0.55)', border: '1px solid rgba(99,102,241,0.14)' }}
            >
              admin default
            </span>
          )}
        </div>
      </div>
    <div style={{
      position: 'relative',
      marginLeft:  'calc(-1 * (100vw - 100%) / 2)',
      marginRight: 'calc(-1 * (100vw - 100%) / 2)',
      width: '100vw',
    }}>
      <style dangerouslySetInnerHTML={{ __html: `
        .abs-track {
          scrollbar-width: none;
          -ms-overflow-style: none;
          /* native snap — no JS needed for touch/mouse fling */
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
        }
        .abs-track::-webkit-scrollbar { display: none; }
        .abs-card {
          scroll-snap-align: center;
          scroll-snap-stop: always;
          will-change: transform, opacity;
          transition:
            transform 0.42s cubic-bezier(0.22,1,0.36,1),
            opacity   0.38s ease,
            box-shadow 0.38s ease;
        }
        .abs-card.is-active  { transform: scale(1);    opacity: 1; }
        .abs-card.is-adj     { transform: scale(0.95); opacity: 0.68; }
        .abs-card.is-far     { transform: scale(0.88); opacity: 0.35; }
        .abs-card:hover      { transform: scale(1.02) !important; opacity: 1 !important; }
        @keyframes abs-prog  { from { transform:scaleX(0); } to { transform:scaleX(1); } }
        .abs-prog { transform-origin:left; animation: abs-prog 4.5s linear forwards; }
      `}} />

      {/* edge vignettes */}
      <div style={{
        pointerEvents: 'none', position: 'absolute', inset: '0 0 20px 0', zIndex: 10,
        background: 'linear-gradient(to right, #0d0d0f 0%, rgba(13,13,15,.8) 5%, transparent 16%, transparent 84%, rgba(13,13,15,.8) 95%, #0d0d0f 100%)',
      }} />

      {/* scrollable track */}
      <div
        ref={trackRef}
        className="abs-track"
        style={{
          display: 'flex',
          gap: 10,
          overflowX: 'scroll',
          overflowY: 'hidden',
          paddingLeft:  'max(16px, 8vw)',
          paddingRight: 'max(16px, 8vw)',
          paddingTop: 6,
          paddingBottom: 20,
          cursor: 'grab',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          touchAction: 'pan-x',
        }}
        onMouseEnter={() => { pausedRef.current = true; }}
        onMouseLeave={() => { pausedRef.current = false; }}
      >
        {banners.map((banner, i) => {
          const isActive = i === activeIdx;
          const dist = Math.abs(i - activeIdx);
          const cls  = isActive ? 'is-active' : dist === 1 ? 'is-adj' : 'is-far';

          return (
            <div
              key={banner.id}
              data-idx={i}
              className={`abs-card ${cls}`}
              style={{
                flexShrink: 0,
                width: 'clamp(260px, 76vw, 660px)',
                aspectRatio: '21 / 9',
                borderRadius: 16,
                overflow: 'hidden',
                position: 'relative',
                background: '#0a0a0e',
                border: isActive ? '1.5px solid rgba(255,255,255,0.16)' : '1px solid rgba(255,255,255,0.06)',
                boxShadow: isActive
                  ? '0 20px 60px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.08)'
                  : '0 4px 20px rgba(0,0,0,0.50)',
                cursor: 'pointer',
              }}
              onClick={() => {
                if (!isActive) { goTo(i); resetTimer(banners.length); return; }
                if (banner.ctaHref) window.open(banner.ctaHref, '_blank', 'noopener');
              }}
            >
              {/* image */}
              <img
                src={banner.imageUrl}
                alt={banner.title}
                draggable={false}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }}
              />

              {/* scrim */}
              <div style={{
                position: 'absolute', inset: 0, zIndex: 1,
                background: 'linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.32) 45%, transparent 100%)',
              }} />

              {/* progress bar */}
              {isActive && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, zIndex: 3, background: 'rgba(255,255,255,0.10)' }}>
                  <div key={activeIdx} className="abs-prog"
                    style={{ height: '100%', background: 'rgba(255,255,255,0.70)', borderRadius: 2 }} />
                </div>
              )}

              {/* text */}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 16px 14px', zIndex: 2 }}>
                {banner.title && (
                  <p style={{
                    margin: 0, fontSize: 'clamp(12px, 2.4vw, 17px)', fontWeight: 700,
                    color: '#fff', lineHeight: 1.28, letterSpacing: '-0.02em',
                    textShadow: '0 2px 16px rgba(0,0,0,0.9)',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>{banner.title}</p>
                )}
                {banner.subtitle && (
                  <p style={{
                    margin: '3px 0 0', fontSize: 'clamp(10px, 1.6vw, 13px)',
                    color: 'rgba(255,255,255,0.62)', lineHeight: 1.4,
                    textShadow: '0 1px 8px rgba(0,0,0,0.85)',
                    display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>{banner.subtitle}</p>
                )}
                {banner.ctaLabel && banner.ctaHref && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8,
                    padding: '5px 12px', borderRadius: 999,
                    background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255,255,255,0.22)',
                    fontSize: 'clamp(9px, 1.4vw, 11px)', fontWeight: 600, color: '#fff', letterSpacing: '0.02em',
                  }}>
                    {banner.ctaLabel}
                    <ArrowRight style={{ width: '0.9em', height: '0.9em' }} />
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* dot indicators */}
      {banners.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 5, paddingBottom: 4 }}>
          {banners.map((_, i) => (
            <button
              key={i}
              onClick={() => { goTo(i); resetTimer(banners.length); }}
              style={{
                height: 5,
                width: i === activeIdx ? 20 : 5,
                borderRadius: 999,
                background: i === activeIdx ? 'rgba(255,255,255,0.80)' : 'rgba(255,255,255,0.16)',
                border: 'none', padding: 0, cursor: 'pointer',
                transition: 'width 0.38s cubic-bezier(0.34,1.56,0.64,1), background 0.3s ease',
                flexShrink: 0,
              }}
            />
          ))}
        </div>
      )}
    </div>
    </div>
  );
}

function NewHomepageContent({
  softwareName,
  setDraft,
  inputRef,
  welcomeScrollRef,
  onPublishClick,
  onESignClick,
  onScratchpadClick,
  onPdfClick,
  onDocSheetClick,
  liveProfiles = [],
  liveGigs = [],
  liveMetrics,
  liveFeeds = [],
  hpSections = DEFAULT_HP_SECTIONS,
  hpConfig = null,
}: {
  softwareName: string;
  headlines: string[];
  headlineIndex: number;
  setDraft: (d: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  welcomeScrollRef: React.RefObject<HTMLDivElement | null>;
  onPublishClick: (category?: string) => void;
  onESignClick: () => void;
  onScratchpadClick: () => void;
  onPdfClick: () => void;
  onDocSheetClick: () => void;
  liveProfiles?: NHCLiveProfile[];
  liveGigs?: NHCLiveGig[];
  liveMetrics?: NHCLiveMetrics | null;
  liveFeeds?: NHCLiveFeed[];
  hpSections?: HPSectionVisibility;
  hpConfig?: HPConfig | null;
}) {
  const { data: nhcSession } = useSession();
  const [activeFeedTab, setActiveFeedTab] = React.useState<string>('All');
  const [feedSliderKey, setFeedSliderKey] = React.useState(0);
  const [heroDot, setHeroDot] = React.useState(0);
  const [followingSet, setFollowingSet] = React.useState<Set<string>>(new Set());
  const [pendingFollow, setPendingFollow] = React.useState<Set<string>>(new Set());
  const [showAllFeatures, setShowAllFeatures] = React.useState(false);

  /* ── Mobile greeting clock ── */
  const [clockNow, setClockNow] = React.useState<Date | null>(null);
  const [clockPhase, setClockPhase] = React.useState('');
  const [clockVisible, setClockVisible] = React.useState(false);
  React.useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClockNow(d);
      const h = d.getHours();
      const phase = h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : h >= 17 && h < 21 ? 'evening' : 'night';
      setClockPhase(phase);
    };
    tick();
    // Reveal after 80ms so enter animation is always visible
    const showId = setTimeout(() => setClockVisible(true), 80);
    const id = setInterval(tick, 30_000);
    return () => { clearInterval(id); clearTimeout(showId); };
  }, []);

  const greetingMeta = React.useMemo(() => {
    if (!clockNow) return null;
    const h = clockNow.getHours();
    if (h >= 5 && h < 12)  return { text: 'Good Morning',   sub: 'Start your day strong.',       color: '#d97706', accent: 'rgba(217,119,6,0.55)',   glow: 'rgba(245,158,11,0.07)' };
    if (h >= 12 && h < 17) return { text: 'Good Afternoon', sub: 'Your workspace is live.',       color: '#b45309', accent: 'rgba(180,83,9,0.55)',    glow: 'rgba(251,191,36,0.06)' };
    if (h >= 17 && h < 21) return { text: 'Good Evening',   sub: 'Stay focused, finish strong.',  color: '#ea580c', accent: 'rgba(234,88,12,0.55)',   glow: 'rgba(249,115,22,0.07)' };
    return                         { text: 'Good Night',     sub: 'Your tools are always ready.', color: '#7c3aed', accent: 'rgba(124,58,237,0.55)', glow: 'rgba(167,139,250,0.07)' };
  }, [clockNow]);

  const timeDisplay = React.useMemo(() => {
    if (!clockNow) return '';
    return clockNow.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
  }, [clockNow]);

  const dateDisplay = React.useMemo(() => {
    if (!clockNow) return '';
    const day  = clockNow.toLocaleDateString('en-IN', { weekday: 'long' });
    const date = clockNow.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    return { day, date };
  }, [clockNow]);

  /* ── Slot-machine word cycling ── */
  const slotWords = [
    { word: 'Professionals', sub: 'The professional network powering ambitious careers worldwide.' },
    { word: 'Freelancers',   sub: 'Find top-paying gigs & clients perfectly matched to your skills.' },
    { word: 'Gig Seekers',   sub: 'Discover verified opportunities posted by businesses that matter.' },
    { word: 'Creators',      sub: 'Publish, share & grow your professional presence effortlessly.' },
    { word: 'Connections',   sub: 'Real connections, real growth — your network, amplified.' },
    { word: 'Daily Updates', sub: 'Stay ahead with live industry news, trends & opportunities.' },
    { word: 'Pro Tools',     sub: 'Smart documents, e-sign, proposals & more — all in one place.' },
    { word: 'Entrepreneurs', sub: 'Connect with talent, investors & partners who move fast.' },
  ];
  const [slotIdx, setSlotIdx] = React.useState(0);
  const [slotKey, setSlotKey] = React.useState(0);

  React.useEffect(() => {
    const id = setInterval(() => {
      setSlotIdx(i => (i + 1) % slotWords.length);
      setSlotKey(k => k + 1);
    }, 2800);
    return () => clearInterval(id);
  }, []);

  /* ── Feature usage tracking ── */
  const [usageMap, setUsageMap] = React.useState<Record<string, number>>({});
  React.useEffect(() => {
    try { const s = localStorage.getItem(USAGE_LS_KEY); if (s) setUsageMap(JSON.parse(s) as Record<string,number>); } catch { /* ignore */ }
  }, []);

  function trackAndGo(featureId: string, href: string | null, modal: string | null) {
    const next = { ...usageMap, [featureId]: (usageMap[featureId] ?? 0) + 1 };
    setUsageMap(next);
    try { localStorage.setItem(USAGE_LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    if (modal === 'esign')      { onESignClick();           return; }
    if (modal === 'scratchpad') { onScratchpadClick();      return; }
    if (modal === 'pdf')        { onPdfClick();             return; }
    if (modal === 'docsheets')  { onDocSheetClick();        return; }
    if (modal === 'publish')    { onPublishClick();         return; }
    if (href) window.location.href = href;
  }

  const topFeatures: QuickFeature[] = React.useMemo(() => {
    const ids = nhcSession
      ? (Object.keys(usageMap).length > 0
          ? [...ALL_QUICK_FEATURES].sort((a, b) => (usageMap[b.id] ?? 0) - (usageMap[a.id] ?? 0)).slice(0, 4).map(f => f.id)
          : DEFAULT_FEATURE_IDS as readonly string[])
      : (GUEST_FEATURE_IDS as readonly string[]);
    return (ids as string[]).map(id => ALL_QUICK_FEATURES.find(f => f.id === id)!).filter(Boolean);
  }, [nhcSession, usageMap]);

  const topFeatureId = Object.keys(usageMap).length > 0
    ? Object.entries(usageMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
    : '';

  const handleFollow = React.useCallback(async (targetUserId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!nhcSession) { window.location.href = '/login'; return; }
    if (pendingFollow.has(targetUserId)) return;
    setPendingFollow((prev) => new Set(prev).add(targetUserId));
    const isNowFollowing = !followingSet.has(targetUserId);
    try {
      const res = await fetch('/api/profile/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId, action: isNowFollowing ? 'follow' : 'unfollow' }),
      });
      if (res.ok) {
        setFollowingSet((prev) => {
          const next = new Set(prev);
          if (isNowFollowing) next.add(targetUserId); else next.delete(targetUserId);
          return next;
        });
      }
    } catch { /* ignore */ }
    setPendingFollow((prev) => { const next = new Set(prev); next.delete(targetUserId); return next; });
  }, [nhcSession, followingSet, pendingFollow]);

  const feedSource = liveFeeds.length > 0 ? liveFeeds : FEEDS_DATA;
  const visibleFeeds = activeFeedTab === 'All'
    ? feedSource
    : feedSource.filter((f) => f.category === activeFeedTab);
  const displayFeeds = visibleFeeds.length > 0 ? visibleFeeds : feedSource;

  return (
    <div
      ref={welcomeScrollRef as React.RefObject<HTMLDivElement>}
      className="flex flex-1 flex-col overflow-y-auto overscroll-contain touch-pan-y scrollbar-minimal pb-[env(safe-area-inset-bottom,0px)] [padding-bottom:max(180px,calc(180px+env(safe-area-inset-bottom,0px)))] md:[padding-bottom:max(176px,calc(176px+env(safe-area-inset-bottom,0px)))]"
      style={{ WebkitOverflowScrolling: 'touch', transform: 'translateZ(0)', willChange: 'scroll-position', contain: 'layout style' }}
    >
      <div className="mx-auto w-full max-w-[1440px] space-y-6 sm:space-y-8 lg:space-y-10 px-0 sm:px-6 lg:px-10 xl:px-12 pt-5 sm:pt-7 lg:pt-8">

        {/* ── All-features bottom sheet (mobile only) ── */}
        {showAllFeatures && typeof document !== 'undefined' && createPortal(
          <>
            <style>{`
              @keyframes qf-backdrop-in  { from { opacity:0; } to { opacity:1; } }
              @keyframes qf-sheet-in     { from { transform:translateY(100%); } to { transform:translateY(0); } }
              @keyframes qf-sheet-out    { from { transform:translateY(0); } to { transform:translateY(100%); } }
              @keyframes qf-item-in      {
                from { opacity:0; transform:translateY(12px) scale(0.93); }
                to   { opacity:1; transform:none; }
              }
              .qf-item {
                transition: transform 0.16s cubic-bezier(0.34,1.56,0.64,1),
                            background 0.15s ease, border-color 0.15s ease;
              }
              .qf-item:hover  { transform: scale(1.04); }
              .qf-item:active { transform: scale(0.93); transition-duration:0.07s; }
            `}</style>

            {/* Backdrop */}
            <div
              onClick={() => setShowAllFeatures(false)}
              style={{
                position: 'fixed', inset: 0, zIndex: 85,
                background: 'rgba(0,0,0,0.62)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
                animation: 'qf-backdrop-in 0.22s ease both',
              }}
            />

            {/* Sheet */}
            <div
              style={{
                position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 86,
                background: 'linear-gradient(170deg, rgba(18,14,28,0.97) 0%, rgba(10,10,16,0.98) 100%)',
                backdropFilter: 'blur(32px) saturate(1.8)',
                WebkitBackdropFilter: 'blur(32px) saturate(1.8)',
                borderTop: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '22px 22px 0 0',
                boxShadow: '0 -12px 60px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.06)',
                paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
                animation: 'qf-sheet-in 0.42s cubic-bezier(0.22,1,0.36,1) both',
              }}
            >
              {/* Handle */}
              <div style={{ display:'flex', justifyContent:'center', paddingTop: 12, paddingBottom: 4 }}>
                <div style={{ width: 36, height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.14)' }} />
              </div>

              {/* Header row */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding: '10px 20px 14px' }}>
                <div>
                  <p style={{ fontSize: 16, fontWeight: 700, color: '#fff', letterSpacing: '-0.025em', lineHeight: 1 }}>All Features</p>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.34)', marginTop: 3, fontWeight: 400 }}>{ALL_QUICK_FEATURES.length} tools available</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAllFeatures(false)}
                  style={{
                    width: 30, height: 30, borderRadius: 10, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
                    color: 'rgba(255,255,255,0.50)', cursor: 'pointer',
                    transition: 'background 0.15s ease',
                  }}
                >
                  <ChevronDown style={{ width: 14, height: 14 }} />
                </button>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', marginLeft: 20, marginRight: 20, marginBottom: 16 }} />

              {/* Feature grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, padding: '0 16px 8px' }}>
                {ALL_QUICK_FEATURES.map((f, idx) => (
                  <button
                    key={f.id}
                    type="button"
                    className="qf-item"
                    onClick={() => { setShowAllFeatures(false); setTimeout(() => trackAndGo(f.id, f.href, f.modal), 120); }}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      gap: 8, padding: '14px 8px 12px',
                      borderRadius: 16,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      cursor: 'pointer', textAlign: 'center',
                      animation: `qf-item-in 0.34s ${0.04 + idx * 0.028}s cubic-bezier(0.22,1,0.36,1) both`,
                    }}
                  >
                    {/* Icon square */}
                    <div style={{
                      width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: f.ib, border: `1px solid ${f.bd}`,
                      boxShadow: `0 2px 10px ${f.ib}`,
                    }}>
                      <f.Icon style={{ width: 18, height: 18, color: f.ic }} />
                    </div>
                    {/* Label */}
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.72)',
                      letterSpacing: '-0.01em', lineHeight: 1.2, whiteSpace: 'nowrap',
                    }}>{f.label}</span>
                    {/* Desc */}
                    <span style={{
                      fontSize: 9.5, color: 'rgba(255,255,255,0.28)', lineHeight: 1.3,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>{f.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </>,
          document.body
        )}

        {/* ── Recents (stories bar) ── */}
        <div style={{ marginBottom: 16 }}>
          <RecentsBar />
        </div>

        {hpConfig?.announcementBanner?.active && (
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px', borderRadius:12, marginBottom:2,
            background: hpConfig.announcementBanner.style==='warning' ? 'rgba(245,158,11,0.12)' : hpConfig.announcementBanner.style==='success' ? 'rgba(34,197,94,0.12)' : hpConfig.announcementBanner.style==='promo' ? 'rgba(168,85,247,0.12)' : 'rgba(59,130,246,0.12)',
            border: hpConfig.announcementBanner.style==='warning' ? '1px solid rgba(245,158,11,0.28)' : hpConfig.announcementBanner.style==='success' ? '1px solid rgba(34,197,94,0.28)' : hpConfig.announcementBanner.style==='promo' ? '1px solid rgba(168,85,247,0.28)' : '1px solid rgba(59,130,246,0.28)',
          }}>
            <span style={{ flex:1, fontSize:12.5, fontWeight:500, lineHeight:1.4,
              color: hpConfig.announcementBanner.style==='warning' ? '#fcd34d' : hpConfig.announcementBanner.style==='success' ? '#86efac' : hpConfig.announcementBanner.style==='promo' ? '#d8b4fe' : '#93c5fd',
            }}>{hpConfig.announcementBanner.text}</span>
            {hpConfig.announcementBanner.ctaLabel && hpConfig.announcementBanner.ctaHref && (
              <a href={hpConfig.announcementBanner.ctaHref} target="_blank" rel="noopener noreferrer" style={{ fontSize:11, fontWeight:700, whiteSpace:'nowrap', textDecoration:'none', padding:'3px 10px', borderRadius:6, border:'1px solid rgba(255,255,255,0.20)', color:'rgba(255,255,255,0.85)' }}>
                {hpConfig.announcementBanner.ctaLabel}
              </a>
            )}
          </div>
        )}
        {/* ── Row 1: Hero Banner + Feature Cards — REMOVED ── */}
        {false && <div className="flex gap-2 sm:gap-3 min-h-[180px] sm:min-h-[230px] lg:min-h-[260px]">

          {/* ── Hero card ── */}
          <div className="relative flex-[1.45] min-w-0 overflow-hidden rounded-[18px] sm:rounded-[22px] border border-white/[0.07] bg-[#080a0c] shadow-[0_8px_40px_rgba(0,0,0,0.65)]">

            {/* Slot-machine CSS */}
            <style>{`
              @keyframes slotIn {
                0%   { transform: translateY(70%) scaleY(0.6); opacity: 0; filter: blur(12px); }
                55%  { transform: translateY(-5%) scaleY(1.06); opacity: 1; filter: blur(0.5px); }
                72%  { transform: translateY(2.5%) scaleY(0.97); opacity: 1; filter: blur(0px); }
                86%  { transform: translateY(-1%) scaleY(1.01); }
                100% { transform: translateY(0) scaleY(1); opacity: 1; filter: blur(0px); }
              }
              .slot-word { display: inline-block; animation: slotIn 0.68s cubic-bezier(0.22,1,0.36,1) both; }
              @keyframes subFadeIn {
                from { opacity: 0; transform: translateY(6px); filter: blur(5px); }
                to   { opacity: 1; transform: none; filter: blur(0px); }
              }
              .sub-fade { animation: subFadeIn 0.52s cubic-bezier(0.22,1,0.36,1) both 0.1s; }
              @keyframes dotPulse {
                0%,100% { box-shadow: 0 0 0 0 rgba(167,139,250,0); }
                50%     { box-shadow: 0 0 0 3px rgba(167,139,250,0.22); }
              }
              .dot-active { animation: dotPulse 1.8s ease infinite; }
            `}</style>

            {/* ── Photo background — right-anchored, people on right side ── */}
            <div
              className="pointer-events-none absolute inset-0 select-none"
              style={{
                backgroundImage: 'url(/homepage/hero-freelancers.png)',
                backgroundSize: 'cover',
                backgroundPosition: 'center right',
                backgroundRepeat: 'no-repeat',
                filter: 'brightness(0.55) saturate(0.80)',
              }}
            />

            {/* Strong left gradient — keeps text crisp over photo */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: 'linear-gradient(100deg, #080a0c 0%, #080a0c 28%, rgba(8,10,12,0.88) 46%, rgba(8,10,12,0.55) 62%, rgba(8,10,12,0.20) 78%, transparent 100%)',
              }}
            />
            {/* Bottom fade — grounds the card */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: 'linear-gradient(to top, rgba(8,10,12,0.60) 0%, transparent 45%)' }}
            />

            {/* Content */}
            <div className="relative z-10 flex h-full flex-col justify-between p-5 sm:p-6 lg:p-8">
              <div>
                {/* Eyebrow label */}
               

                {/* Main heading — inline with slot word */}
                <h1
                  className="font-bold leading-tight tracking-tight"
                  style={{ fontSize: 'clamp(1.25rem,3vw,2.25rem)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0 0.35em' }}
                >
                  <span style={{ color: 'rgba(255,255,255,0.40)', fontWeight: 700 }}>{softwareName.toLowerCase()} for</span>
                  {/* Slot word — inline, clips vertically */}
                  <span className="overflow-hidden inline-flex items-center" style={{ height: 'clamp(1.9rem,4.2vw,3.2rem)', verticalAlign: 'middle' }}>
                    <span
                      key={slotKey}
                      className="slot-word"
                      style={{
                        color: '#ffffff',
                        fontWeight: 800,
                        letterSpacing: '-0.02em',
                        fontSize: 'clamp(1.25rem,3vw,2.25rem)',
                        lineHeight: 1,
                      }}
                    >
                      {slotWords[slotIdx].word}
                    </span>
                  </span>
                </h1>

                {/* Animated subtitle */}
                <p
                  key={`sub-${slotKey}`}
                  className="sub-fade leading-relaxed"
                  style={{ fontSize: 'clamp(0.7rem,1.35vw,0.85rem)', color: 'rgba(255,255,255,0.42)', marginTop: 10, maxWidth: '28rem' }}
                >
                  {slotWords[slotIdx].sub}
                </p>

                {/* CTA buttons */}
                <div className="mt-4 sm:mt-5 flex flex-wrap items-center gap-2">
                  {nhcSession ? (
                    /* ── Logged-in CTAs ── */
                    <>
                      <Link
                        href="/profile"
                        className="inline-flex items-center gap-1.5 rounded-[11px] border border-white/[0.14] bg-white/[0.08] px-4 py-2.5 font-semibold text-white/80 backdrop-blur-sm transition-all hover:bg-white/[0.14] hover:border-white/[0.24] hover:text-white active:scale-95"
                        style={{ fontSize: 12.5 }}
                      >
                        <User className="h-3 w-3" /> My Profile
                      </Link>
                      <Link
                        href="/published"
                        className="inline-flex items-center gap-1.5 rounded-[11px] px-4 py-2.5 font-semibold text-white transition-all active:scale-95 hover:scale-[1.03]"
                        style={{
                          fontSize: 12.5,
                          background: 'rgba(8,8,11,0.82)',
                          backdropFilter: 'blur(28px) saturate(1.6)',
                          WebkitBackdropFilter: 'blur(28px) saturate(1.6)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          boxShadow: '0 8px 28px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 36px rgba(0,0,0,0.70), inset 0 1px 0 rgba(255,255,255,0.10)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.12)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 28px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)'; }}
                      >
                        Explore Feed <ArrowRight className="h-3 w-3" />
                      </Link>
                    </>
                  ) : (
                    /* ── Guest CTAs ── */
                    <>
                      <Link
                        href="/register"
                        className="inline-flex items-center gap-1.5 rounded-[11px] px-4 py-2.5 font-semibold text-white transition-all active:scale-95 hover:scale-[1.03]"
                        style={{
                          fontSize: 12.5,
                          background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                          boxShadow: '0 4px 22px rgba(99,102,241,0.50), inset 0 1px 0 rgba(255,255,255,0.12)',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 32px rgba(99,102,241,0.70), inset 0 1px 0 rgba(255,255,255,0.14)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 22px rgba(99,102,241,0.50), inset 0 1px 0 rgba(255,255,255,0.12)'; }}
                      >
                        Get Started Free <ArrowRight className="h-3 w-3" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => { setDraft(`Show me what ${softwareName} can do for my workflow.`); setTimeout(() => inputRef.current?.focus(), 0); }}
                        className="inline-flex items-center gap-1.5 rounded-[11px] border border-white/[0.14] bg-white/[0.08] px-4 py-2.5 font-semibold text-white/80 backdrop-blur-sm transition-all hover:bg-white/[0.14] hover:border-white/[0.24] hover:text-white active:scale-95"
                        style={{ fontSize: 12.5 }}
                      >
                        Explore now <ArrowRight className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Slot progress dots */}
              <div className="flex items-center gap-1.5 mt-4">
                {slotWords.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Word ${i + 1}`}
                    onClick={() => { setSlotIdx(i); setSlotKey(k => k + 1); }}
                    className={[
                      'h-1.5 rounded-full transition-all duration-500 cursor-pointer',
                      slotIdx === i ? 'w-6 dot-active' : 'w-1.5 hover:bg-white/40',
                    ].join(' ')}
                    style={{ background: slotIdx === i ? 'linear-gradient(90deg,#6366f1,#a78bfa)' : 'rgba(255,255,255,0.18)' }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Feature cards — desktop: 2×2 grid, behaviour-tracked */}
          <div className="hidden sm:grid gap-2 sm:gap-2.5" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gridTemplateRows: 'repeat(2,minmax(0,1fr))' }}>
            {topFeatures.map((f) => {
              const isMostUsed = f.id === topFeatureId;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => trackAndGo(f.id, f.href, f.modal)}
                  className="group relative flex flex-col items-start text-left overflow-hidden transition-transform duration-300 hover:-translate-y-[1px]"
                  style={{
                    borderRadius: 18,
                    border: '1px solid rgba(255,255,255,0.07)',
                    background: 'rgba(8,8,11,0.88)',
                    backdropFilter: 'blur(28px) saturate(1.5)',
                    WebkitBackdropFilter: 'blur(28px) saturate(1.5)',
                    boxShadow: '0 6px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)',
                    padding: '15px 16px 13px',
                    minWidth: 148,
                  }}
                >
                  {/* Hover border brightening */}
                  <div className="pointer-events-none absolute inset-0 rounded-[18px] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 18 }} />

                  {/* Icon */}
                  <div style={{
                    width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: f.ib, border: `1px solid ${f.bd}`,
                  }}>
                    <f.Icon style={{ width: 16, height: 16, color: f.ic }} aria-hidden="true" />
                  </div>

                  {/* Label */}
                  <div style={{ marginTop: 11, fontSize: 13, fontWeight: 600, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                    {f.label}
                  </div>

                  {/* Description */}
                  <div style={{ marginTop: 4, fontSize: 10.5, lineHeight: 1.5, color: 'rgba(255,255,255,0.36)', flex: 1 }}
                    className="line-clamp-2">
                    {f.desc}
                  </div>

                  {/* Bottom row */}
                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'center' }}>
                    {isMostUsed ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                        padding: '3px 8px', borderRadius: 999,
                        background: f.ib, border: `1px solid ${f.bd}`, color: f.ic,
                      }}>
                        <Sparkles style={{ width: 8, height: 8 }} /> Most used
                      </span>
                    ) : (
                      <span style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        fontSize: 10, fontWeight: 500, letterSpacing: '0.01em',
                        color: 'rgba(255,255,255,0.25)',
                        transition: 'color 0.2s',
                      }} className="group-hover:!text-white/50">
                        Open <ArrowRight style={{ width: 10, height: 10 }} />
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          {/* Feature cards — mobile: hidden (strip at top handles mobile) */}
        </div>}

        {/* ── Ad banner slider ── */}
        {hpSections.adBanners && <AdBannerSlider />}

        {/* ── Content discovery + feed cards + gig slider (grouped) ── */}
        <div className="flex flex-col" style={{ gap: 14 }}>
          <ContentDiscoveryStrip onPublish={() => onPublishClick()} />
        </div>

        {/* ── Gigs grid ── */}
        {hpSections.gigsGrid && <div>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold tracking-[0.08em] uppercase" style={{ color: 'rgba(255,255,255,0.28)', letterSpacing: '0.10em' }}>Gigs</span>
              {liveGigs.length > 0 && <span className="rounded-[5px] px-1.5 py-[2px] text-[8.5px] font-semibold tabular-nums" style={{ background: 'rgba(52,211,153,0.08)', color: 'rgba(52,211,153,0.65)', border: '1px solid rgba(52,211,153,0.14)' }}>{liveGigs.length} live</span>}
            </div>
            <Link href="/gigs" className="inline-flex items-center gap-1 rounded-[7px] border border-white/[0.07] px-2.5 py-1 text-[10.5px] font-medium text-white/30 transition hover:border-white/[0.14] hover:text-white/55">
              See all <ArrowRight className="h-2.5 w-2.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(() => {
              const gigsSource = liveGigs.length > 0 ? liveGigs.slice(0, 8) : GIGS_DATA.slice(0, 8);
              return gigsSource.map((gig, i) => {
                const isLive = liveGigs.length > 0;
                const title = isLive ? (gig as NHCLiveGig).title : (gig as typeof GIGS_DATA[0]).title;
                const org = isLive ? (gig as NHCLiveGig).organizationName : (gig as typeof GIGS_DATA[0]).company;
                const category = isLive ? (gig as NHCLiveGig).category : (gig as typeof GIGS_DATA[0]).skills[0] || 'General';
                const budget = isLive ? (gig as NHCLiveGig).budgetLabel : (gig as typeof GIGS_DATA[0]).budget;
                const loc = isLive ? ((gig as NHCLiveGig).locationPreference === 'remote' ? 'Remote' : 'On-site') : 'Remote';
                const skills = isLive ? (gig as NHCLiveGig).skills.slice(0, 2) : [...(gig as typeof GIGS_DATA[0]).skills].slice(0, 2);
                const engType = isLive ? (gig as NHCLiveGig).engagementType : 'contract';
                const isUrgent = isLive && !!(gig as NHCLiveGig).urgentUntil && new Date((gig as NHCLiveGig).urgentUntil!).getTime() > Date.now();
                const createdAt = isLive ? (gig as NHCLiveGig).createdAt : '';
                const gigHref = isLive ? `/gigs/${(gig as NHCLiveGig).slug}` : '/gigs';
                const daysAgo = createdAt ? Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000) : null;
                const ageLabel = daysAgo === null ? '' : daysAgo === 0 ? 'Today' : `${daysAgo}d`;
                const TAG_PALETTE = [
                  { bg: 'rgba(99,102,241,0.09)',  border: 'rgba(99,102,241,0.16)',  text: 'rgba(165,180,252,0.70)' },
                  { bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.14)',  text: 'rgba(110,231,183,0.68)' },
                  { bg: 'rgba(251,146,60,0.08)',  border: 'rgba(251,146,60,0.16)',  text: 'rgba(253,186,116,0.68)' },
                  { bg: 'rgba(217,70,239,0.07)',  border: 'rgba(217,70,239,0.14)',  text: 'rgba(240,171,252,0.65)' },
                  { bg: 'rgba(14,165,233,0.08)',  border: 'rgba(14,165,233,0.14)',  text: 'rgba(125,211,252,0.68)' },
                  { bg: 'rgba(251,191,36,0.07)',  border: 'rgba(251,191,36,0.14)',  text: 'rgba(253,224,71,0.65)' },
                  { bg: 'rgba(239,68,68,0.07)',   border: 'rgba(239,68,68,0.14)',   text: 'rgba(252,165,165,0.65)' },
                  { bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.14)',  text: 'rgba(52,211,153,0.68)' },
                ];
                const tc = TAG_PALETTE[i % TAG_PALETTE.length];
                const engLabel = engType === 'retainer' ? 'Retainer' : engType === 'ongoing' ? 'Ongoing' : 'One-time';
                return (
                  <Link key={`gig-${i}`} href={gigHref}
                    className="group relative flex flex-col overflow-hidden rounded-[13px] transition-all duration-200"
                    style={{ background: '#09090d', border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 2px 14px rgba(0,0,0,0.40)' }}
                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = tc.border; el.style.transform = 'translateY(-2px)'; el.style.boxShadow = `0 10px 30px rgba(0,0,0,0.55), 0 0 0 1px ${tc.border}`; }}
                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'rgba(255,255,255,0.07)'; el.style.transform = ''; el.style.boxShadow = '0 2px 14px rgba(0,0,0,0.40)'; }}
                  >
                    {/* Color accent top bar */}
                    <div style={{ height: 2, background: `linear-gradient(90deg,${tc.text}70,${tc.text}20 60%,transparent)`, flexShrink: 0 }} />

                    <div className="flex flex-1 flex-col p-3 gap-2.5">
                      {/* Org avatar + age/urgent */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] text-[11px] font-bold"
                            style={{ background: tc.bg, border: `1px solid ${tc.border}`, color: tc.text, letterSpacing: '-0.01em' }}>
                            {(org || 'G').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.55)' }}>{org}</p>
                            <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.25)' }}>{loc}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {isUrgent && <span className="rounded-[4px] px-1.5 py-[2px] text-[7.5px] font-bold uppercase tracking-wide" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.18)', color: 'rgba(252,165,165,0.85)' }}>Urgent</span>}
                          {ageLabel && <span className="text-[8.5px] tabular-nums" style={{ color: 'rgba(255,255,255,0.22)' }}>{ageLabel}</span>}
                        </div>
                      </div>

                      {/* Title */}
                      <p className="text-[12px] font-semibold leading-snug line-clamp-2 flex-1" style={{ color: 'rgba(255,255,255,0.85)', letterSpacing: '-0.015em' }}>{title}</p>

                      {/* Skill + engagement chips */}
                      <div className="flex flex-wrap gap-1">
                        {skills.slice(0, 1).map((s, si) => (
                          <span key={si} className="rounded-[5px] px-2 py-[3px] text-[9px] font-semibold"
                            style={{ background: tc.bg, border: `1px solid ${tc.border}`, color: tc.text }}>
                            {s}
                          </span>
                        ))}
                        <span className="rounded-[5px] px-2 py-[3px] text-[9px] font-medium" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.30)' }}>{engLabel}</span>
                      </div>

                      {/* Budget + Apply CTA */}
                      <div className="flex items-center justify-between mt-auto pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <span className="text-[13px] font-bold" style={{ color: 'rgba(255,255,255,0.78)', letterSpacing: '-0.02em' }}>{budget}</span>
                        <span className="flex items-center gap-1 text-[9.5px] font-semibold" style={{ color: tc.text }}>
                          Apply <ArrowRight className="h-2.5 w-2.5" />
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              });
            })()}
          </div>
        </div>}


        <HomepageLiveFeed />

        {/* ── Live Gigs section + Gig CTA banner ── DISABLED */}
        {false && <><div className="mb-3 flex items-center justify-between gap-3">
          {/* Left: label + live count */}
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-[12.5px] font-medium tracking-wide" style={{ color: 'rgba(255,255,255,0.42)', letterSpacing: '0.04em' }}>Live Gigs</h2>
            {liveGigs.length > 0 && (
              <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold tabular-nums"
                style={{ background: 'rgba(52,211,153,0.08)', color: 'rgba(52,211,153,0.65)', border: '1px solid rgba(52,211,153,0.14)' }}>
                {liveGigs.length} live
              </span>
            )}
          </div>

          {/* Right: Post a Gig + Browse all */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onPublishClick('gig')}
              className="inline-flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[11px] font-semibold transition-all active:scale-95"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.10)',
                color: 'rgba(255,255,255,0.65)',
                letterSpacing: '-0.005em',
                cursor: 'pointer',
              }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(255,255,255,0.10)'; el.style.borderColor = 'rgba(255,255,255,0.18)'; el.style.color = 'rgba(255,255,255,0.88)'; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(255,255,255,0.06)'; el.style.borderColor = 'rgba(255,255,255,0.10)'; el.style.color = 'rgba(255,255,255,0.65)'; }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              Post a Gig
            </button>
            <Link href="/gigs" className="flex items-center gap-1 text-[11px] font-medium text-white/25 transition hover:text-white/50" style={{ letterSpacing: '0.01em' }}>
              Browse all <ArrowRight className="h-2.5 w-2.5" />
            </Link>
          </div>
        </div>
        {(() => {
          const GIG_CATEGORIES = [
            { label: 'Tech',      Icon: Sparkles,   fg: '#86efac', bg: 'rgba(16,185,129,0.18)', bd: 'rgba(16,185,129,0.30)' },
            { label: 'Design',    Icon: Wand2,      fg: '#d8b4fe', bg: 'rgba(147,51,234,0.18)', bd: 'rgba(147,51,234,0.30)' },
            { label: 'Finance',   Icon: TrendingUp, fg: '#7dd3fc', bg: 'rgba(14,165,233,0.18)', bd: 'rgba(14,165,233,0.30)' },
            { label: 'Marketing', Icon: Megaphone,  fg: '#fdba74', bg: 'rgba(217,119,6,0.18)',  bd: 'rgba(217,119,6,0.30)'  },
            { label: 'Content',   Icon: PenLine,    fg: '#fca5a5', bg: 'rgba(220,38,38,0.18)',  bd: 'rgba(220,38,38,0.30)'  },
            { label: 'AI / ML',   Icon: Activity,   fg: '#fde68a', bg: 'rgba(202,138,4,0.18)',  bd: 'rgba(202,138,4,0.30)'  },
          ];

          return (
            <section className="hero-banners-section mx-0 sm:mx-0 px-0 sm:px-0 lg:px-0 flex lg:grid lg:grid-cols-2 gap-3 sm:gap-4 overflow-x-auto lg:overflow-visible snap-x snap-mandatory no-scrollbar scroll-px-0 sm:scroll-px-0 [scroll-behavior:smooth] [&_.hero-banner]:snap-start [&_.hero-banner]:shrink-0 [&_.hero-banner]:min-w-[88%] sm:[&_.hero-banner]:min-w-[72%] lg:[&_.hero-banner]:min-w-0 lg:[&_.hero-banner]:snap-none">
              <style dangerouslySetInnerHTML={{ __html: `
                @keyframes __unused_hiringPulse {
                  0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.55); }
                  50%      { box-shadow: 0 0 0 6px rgba(16,185,129,0); }
                }
                @keyframes __placeholder {
                  from { transform: rotate(0deg); }
                  to   { transform: rotate(0deg); }
                }
                @keyframes postGigPlusSpin {
                  0%, 100% { transform: rotate(0deg) scale(1); }
                  50%      { transform: rotate(90deg) scale(1.10); }
                }
                @keyframes postGigGlowSweep {
                  0%   { transform: translateX(-120%) skewX(-20deg); opacity: 0; }
                  30%  { opacity: 0.85; }
                  100% { transform: translateX(220%) skewX(-20deg); opacity: 0; }
                }
              ` }} />

              {/* ── Banner 1: Apply Now ── */}
              <Link
                href="/gigs"
                className="hero-banner group relative flex items-center overflow-hidden rounded-[16px] transition-transform duration-300 hover:-translate-y-[1px]"
                style={{
                  height: 'clamp(78px, 11vw, 116px)',
                  background: 'rgba(8,8,11,0.82)',
                  backdropFilter: 'blur(28px) saturate(1.6)',
                  WebkitBackdropFilter: 'blur(28px) saturate(1.6)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  boxShadow: '0 6px 22px rgba(0,0,0,0.50), inset 0 1px 0 rgba(255,255,255,0.05)',
                }}
                aria-label="Apply Now"
              >
                <div className="absolute inset-0 pointer-events-none hero-glow-pulse"
                  style={{ background: 'radial-gradient(ellipse 55% 80% at 50% 50%, rgba(251,146,60,0.08), transparent 70%)' }} />

                {/* Left cluster — apply-themed icons */}
                <div className="absolute left-3 sm:left-4 inset-y-0 flex items-center pointer-events-none">
                  {([
                    { Icon: Search,    bg: 'rgba(251,146,60,0.18)',  fg: '#fdba74' },
                    { Icon: Briefcase, bg: 'rgba(202,138,4,0.18)',   fg: '#fde68a' },
                    { Icon: Star,      bg: 'rgba(217,119,6,0.18)',   fg: '#fcd34d' },
                  ]).map(({ Icon, bg, fg }, idx) => {
                    const floatCls = idx % 2 === 0 ? 'hero-avatar-float' : 'hero-avatar-float-alt';
                    return (
                      <div key={`an-l-${idx}`} className={`hero-avatar-shell ${floatCls}`}
                        style={{ marginLeft: idx === 0 ? 0 : 'clamp(-10px,-1.5vw,-14px)', zIndex: 3 - idx, animationDelay: `${idx * 0.1}s, ${idx * 0.5}s` }}>
                        <div className="rounded-full overflow-hidden flex items-center justify-center"
                          style={{ width: 'clamp(28px,4vw,40px)', height: 'clamp(28px,4vw,40px)', background: bg, border: '1.5px solid rgba(8,8,11,1)', boxShadow: '0 2px 8px rgba(0,0,0,0.55)', color: fg }}>
                          <Icon style={{ width: 'clamp(11px,1.3vw,15px)', height: 'clamp(11px,1.3vw,15px)' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Right cluster */}
                <div className="absolute right-3 sm:right-4 inset-y-0 flex items-center pointer-events-none">
                  {([
                    { Icon: User,     bg: 'rgba(234,88,12,0.18)',   fg: '#fb923c' },
                    { Icon: FileText, bg: 'rgba(245,158,11,0.18)',  fg: '#fcd34d' },
                  ]).map(({ Icon, bg, fg }, i) => {
                    const floatCls = i % 2 === 0 ? 'hero-avatar-float-alt' : 'hero-avatar-float';
                    return (
                      <div key={`an-r-${i}`} className={`hero-avatar-shell ${floatCls}`}
                        style={{ marginLeft: i === 0 ? 0 : 'clamp(-10px,-1.5vw,-14px)', zIndex: i, animationDelay: `${0.3 + i * 0.1}s, ${i * 0.5}s` }}>
                        <div className="rounded-full overflow-hidden flex items-center justify-center"
                          style={{ width: 'clamp(28px,4vw,40px)', height: 'clamp(28px,4vw,40px)', background: bg, border: '1.5px solid rgba(8,8,11,1)', boxShadow: '0 2px 8px rgba(0,0,0,0.55)', color: fg }}>
                          <Icon style={{ width: 'clamp(11px,1.3vw,15px)', height: 'clamp(11px,1.3vw,15px)' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Title */}
                <div className="relative z-[2] mx-auto flex flex-col items-center justify-center pointer-events-none px-4">
                  <h3
                    className="relative whitespace-nowrap text-center leading-[1.05] text-white/95"
                    style={{ fontSize: 'clamp(15px,2vw,24px)', fontWeight: 200, letterSpacing: '-0.022em', textShadow: '0 2px 14px rgba(0,0,0,0.55)' }}
                  >
                    <span style={{ position: 'relative', display: 'inline-block' }}>
                      Apply
                      <span aria-hidden="true" className="hero-title-sheen">Apply</span>
                    </span>
                    {' '}
                    <span style={{ background: 'linear-gradient(135deg,#fb923c 0%,#f97316 60%,#fdba74 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontWeight: 300 }}>Now</span>
                  </h3>
                  <span className="hero-cta mt-[3px] inline-flex items-center gap-1 text-white/40"
                    style={{ fontSize: 'clamp(9px,0.85vw,11px)', fontWeight: 300, letterSpacing: '0.05em' }}>
                    {liveGigs.length > 0 ? `${liveGigs.length} live opportunities` : 'Browse opportunities'} <ArrowRight className="h-2.5 w-2.5" />
                  </span>
                </div>
              </Link>

              {/* ── Banner 2: Post a Gig ── */}
              <button
                type="button"
                onClick={() => onPublishClick('gig')}
                className="hero-banner group relative flex items-center overflow-hidden rounded-[16px] transition-all duration-500 hover:-translate-y-[1px] text-left"
                style={{
                  height: 'clamp(78px, 11vw, 116px)',
                  background: 'rgba(8,8,11,0.82)',
                  backdropFilter: 'blur(28px) saturate(1.6)',
                  WebkitBackdropFilter: 'blur(28px) saturate(1.6)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  boxShadow: '0 6px 22px rgba(0,0,0,0.50), inset 0 1px 0 rgba(255,255,255,0.05)',
                  cursor: 'pointer',
                }}
                aria-label="Post a Gig"
              >
                <div className="absolute inset-0 pointer-events-none hero-glow-pulse"
                  style={{ background: 'radial-gradient(ellipse 55% 80% at 50% 50%, rgba(251,146,60,0.08), transparent 70%)' }} />

                {/* Left cluster — mixed skill icons */}
                <div className="absolute left-3 sm:left-4 inset-y-0 flex items-center pointer-events-none">
                  {([
                    { Icon: Briefcase, bg: 'rgba(16,185,129,0.18)', fg: '#6ee7b7' },
                    { Icon: Sparkles,  bg: 'rgba(202,138,4,0.18)',   fg: '#fde68a' },
                    { Icon: Wand2,     bg: 'rgba(147,51,234,0.18)',  fg: '#d8b4fe' },
                  ]).map(({ Icon, bg, fg }, idx) => {
                    const floatCls = idx % 2 === 0 ? 'hero-avatar-float' : 'hero-avatar-float-alt';
                    return (
                      <div key={`pg-l-${idx}`} className={`hero-avatar-shell ${floatCls}`}
                        style={{ marginLeft: idx === 0 ? 0 : 'clamp(-10px,-1.5vw,-14px)', zIndex: 3 - idx, animationDelay: `${idx * 0.1}s, ${idx * 0.5}s` }}>
                        <div className="rounded-full overflow-hidden flex items-center justify-center"
                          style={{ width: 'clamp(28px,4vw,40px)', height: 'clamp(28px,4vw,40px)', background: bg, border: '1.5px solid rgba(8,8,11,1)', boxShadow: '0 2px 8px rgba(0,0,0,0.55)', color: fg }}>
                          <Icon style={{ width: 'clamp(11px,1.3vw,15px)', height: 'clamp(11px,1.3vw,15px)' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Right cluster */}
                <div className="absolute right-3 sm:right-4 inset-y-0 flex items-center pointer-events-none">
                  {([
                    { Icon: Activity,   bg: 'rgba(220,38,38,0.18)',  fg: '#fca5a5' },
                    { Icon: TrendingUp, bg: 'rgba(14,165,233,0.18)', fg: '#7dd3fc' },
                  ]).map(({ Icon, bg, fg }, i) => {
                    const floatCls = i % 2 === 0 ? 'hero-avatar-float-alt' : 'hero-avatar-float';
                    return (
                      <div key={`pg-r-${i}`} className={`hero-avatar-shell ${floatCls}`}
                        style={{ marginLeft: i === 0 ? 0 : 'clamp(-10px,-1.5vw,-14px)', zIndex: i, animationDelay: `${0.3 + i * 0.1}s, ${i * 0.5}s` }}>
                        <div className="rounded-full overflow-hidden flex items-center justify-center"
                          style={{ width: 'clamp(28px,4vw,40px)', height: 'clamp(28px,4vw,40px)', background: bg, border: '1.5px solid rgba(8,8,11,1)', boxShadow: '0 2px 8px rgba(0,0,0,0.55)', color: fg }}>
                          <Icon style={{ width: 'clamp(11px,1.3vw,15px)', height: 'clamp(11px,1.3vw,15px)' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Title */}
                <div className="relative z-[2] mx-auto flex flex-col items-center justify-center pointer-events-none px-4">
                  <h3
                    className="relative whitespace-nowrap text-center leading-[1.05] text-white/95"
                    style={{ fontSize: 'clamp(15px,2vw,24px)', fontWeight: 200, letterSpacing: '-0.022em', textShadow: '0 2px 14px rgba(0,0,0,0.55)' }}
                  >
                    <span style={{ position: 'relative', display: 'inline-block' }}>
                      Post a
                      <span aria-hidden="true" className="hero-title-sheen">Post a</span>
                    </span>
                    {' '}
                    <span style={{ background: 'linear-gradient(135deg,#fb923c 0%,#f97316 60%,#fdba74 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontWeight: 300 }}>Gig</span>
                  </h3>
                  <span className="hero-cta mt-[3px] inline-flex items-center gap-1 text-white/40"
                    style={{ fontSize: 'clamp(9px,0.85vw,11px)', fontWeight: 300, letterSpacing: '0.05em' }}>
                    Hire in minutes <ArrowRight className="h-2.5 w-2.5" />
                  </span>
                </div>
              </button>
            </section>
          );
        })()}</>}

        {/* ── Row 6: Live Multi-Leaderboards ── DISABLED */}
        {false && <div className="cv-auto"><LiveLeaderboards /></div>}

        {/* ── Row 7: Built in India ──────────────────────────────── */}
        {hpSections.builtInIndia && <div className="sm:-mx-6 lg:-mx-10 xl:-mx-12 cv-auto"><BuiltInIndia /></div>}

        {/* ── Footer ───────────────────────────────────────────────── */}
        {hpSections.footer && <div className="sm:-mx-6 lg:-mx-10 xl:-mx-12 cv-auto"><PremiumFooter /></div>}

      </div>
    </div>
  );
}

/* ── Ddrive icon for quick-action tiles (accepts style prop like Lucide icons) ── */
function DdriveIconTile({ style }: { style?: React.CSSProperties }) {
  const size = typeof style?.width === 'number' ? style.width : 19;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={style} aria-label="Ddrive">
      <defs>
        <linearGradient id="hp-ddrive-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="22" height="22" rx="6" ry="6" fill="url(#hp-ddrive-g)" opacity="0.22" />
      <rect x="1" y="1" width="22" height="22" rx="6" ry="6" fill="none" stroke="url(#hp-ddrive-g)" strokeWidth="1.5" />
      <text x="12" y="17" textAnchor="middle" dominantBaseline="auto"
        fontFamily="system-ui,-apple-system,sans-serif" fontSize="14" fontWeight="800" letterSpacing="-0.5"
        fill="url(#hp-ddrive-g)">D</text>
    </svg>
  );
}

export default function PublicHomepage({ softwareName, accentLabel, guestMode = false }: PublicHomepageProps) {
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated';
  const pathname = usePathname();

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountModalStep, setAccountModalStep] = useState<'main' | 'delete' | 'deactivate'>('main');
  const [accountModalPw, setAccountModalPw] = useState('');
  const [accountModalError, setAccountModalError] = useState('');
  const [accountModalLoading, setAccountModalLoading] = useState(false);
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(() => buildWelcomeMessages());
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  useEffect(() => {
    applyColorMode(getStoredColorMode());
  }, []);

  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [topSearch, setTopSearch] = useState('');
  const [voiceActive, setVoiceActive] = useState(false);
  const [attachedDocument, setAttachedDocument] = useState<UploadedDocument | null>(null);
  const [uploadStage, setUploadStage] = useState<'idle' | 'reading' | 'analyzing' | 'ready' | 'error'>('idle');
  const [uploadStatusLabel, setUploadStatusLabel] = useState<string>('');
  const [assistantStatusLabel, setAssistantStatusLabel] = useState<string>('');
  const [typingId, setTypingId] = useState<string | null>(null);
  const [typedChars, setTypedChars] = useState(0);
  const [processingStage, setProcessingStage] = useState(0);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [quickEditorOpen, setQuickEditorOpen] = useState(false);
  const [composerHidden, setComposerHidden] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [mobileNavSearchOpen, setMobileNavSearchOpen] = useState(false);
  const [mobileNavSearchQuery, setMobileNavSearchQuery] = useState('');
  const mobileNavSearchRef = useRef<HTMLInputElement>(null);
  const [mobileToolsDrawerOpen, setMobileToolsDrawerOpen] = useState(false);
  const [chatHistoryOpen, setChatHistoryOpen] = useState(false);
  const [chatHistoryQuery, setChatHistoryQuery] = useState('');
  const [headlineIndex, setHeadlineIndex] = useState(0);
  const [hpSections, setHpSections] = useState<HPSectionVisibility>(DEFAULT_HP_SECTIONS);
  const [hpConfig, setHpConfig] = useState<HPConfig | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishInitialCategory, setPublishInitialCategory] = useState<string | undefined>(undefined);
  const openPublishModal = (category?: string) => {
    setPublishInitialCategory(category);
    setShowPublishModal(true);
  };
  const [showScratchpad, setShowScratchpad] = useState(false);
  const [showDocSheet, setShowDocSheet] = useState(false);
  const [docSheetHistory, setDocSheetHistory] = useState<DocumentHistory[]>([]);
  const [secureSharingOpen, setSecureSharingOpen] = useState(false);
  const [pdfStudioOpen, setPdfStudioOpen] = useState(false);
  const [formsStudioOpen, setFormsStudioOpen] = useState(false);
  const [showVisualizerModal, setShowVisualizerModal] = useState(false);
  const [eSignStudioOpen, setESignStudioOpen] = useState(false);
  const [fileDriveOpen, setFileDriveOpen]     = useState(false);

  /* ── Dock: recently-used quick actions (localStorage-persisted) ── */
  const [recentDockIds, setRecentDockIds] = useState<string[]>([]);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('homepage:recent-dock-actions');
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setRecentDockIds(parsed.filter((x) => typeof x === 'string').slice(0, 12));
      }
    } catch {}
  }, []);
  const trackDockUsage = (id: string) => {
    setRecentDockIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, 12);
      try { window.localStorage.setItem('homepage:recent-dock-actions', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const [searchSuggestions, setSearchSuggestions] = useState<Array<{
    id: string; title: string; description: string; href: string;
    badge?: string; category: string; scope?: string;
  }>>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  /* ── Live homepage data ─────────────────────────────────────── */
  type LiveGig = {
    id: string; slug: string; title: string; summary: string; category: string;
    skills: string[]; budgetLabel: string; timelineLabel: string; engagementType: string;
    locationPreference: string; ownerName: string; organizationName: string;
    connectCount: number; status: string; urgentUntil?: string; createdAt: string;
  };
  type LiveMetrics = {
    publishes: { value: string; raw: number; label: string };
    people: { value: string; raw: number; label: string };
    upraises: { value: string; raw: number; label: string };
    gigs: { value: string; raw: number; label: string };
  };
  type LiveFeed = NHCLiveFeed;
  const [liveGigs, setLiveGigs] = useState<LiveGig[]>([]);
  const [liveMetrics, setLiveMetrics] = useState<LiveMetrics | null>(null);
  const [liveFeeds, setLiveFeeds] = useState<LiveFeed[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        // NOTE: /api/public/people is deliberately NOT fetched here.
        // NewHomepageContent accepts a `liveProfiles` prop but never reads it,
        // so this request downloaded ~233 KB on every homepage load and
        // rendered nothing. If a live-profiles section is meant to exist, wire
        // the fetch back up together with the markup that renders it.
        const [gRes, mRes, fRes] = await Promise.all([
          fetch('/api/public/gigs'),
          fetch('/api/public/homepage-metrics'),
          fetch('/api/public/feeds'),
        ]);
        if (gRes.ok) {
          const d = await gRes.json() as { gigs?: LiveGig[] };
          if (Array.isArray(d.gigs)) {
            const published = d.gigs.filter((g) => g.status === 'published');
            published.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setLiveGigs(published);
          }
        }
        if (mRes.ok) {
          const d = await mRes.json() as LiveMetrics;
          setLiveMetrics(d);
        }
        if (fRes.ok) {
          const d = await fRes.json() as { feeds?: LiveFeed[] };
          if (Array.isArray(d.feeds)) setLiveFeeds(d.feeds);
        }
        fetch('/api/public/homepage-config', { cache: 'no-store' })
          .then(r => r.ok ? r.json() : null)
          .then((d: { config?: { sections?: Partial<HPSectionVisibility> } } | null) => {
            if (d?.config) {
              setHpConfig(d.config as HPConfig);
              setHpSections(prev => ({ ...prev, ...d.config!.sections }));
            }
          })
          .catch(() => {});
      } catch { /* ignore */ }
    };
    // Defer below-fold data until browser is idle — doesn't block first paint
    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(() => void load(), { timeout: 3000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(() => void load(), 300);
    return () => clearTimeout(id);
  }, []);

  const headlines = [
    'reads documents',
    'drafts contracts',
    'summarizes PDFs',
    'secures files',
    'manages gigs',
    'empowers professionals',
  ];

  const processingStages = [
    'Searching knowledge base…',
    'Analyzing your query…',
    'Retrieving relevant content…',
    'Composing response…',
  ];

  const searchAbortRef = useRef<AbortController | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Client-side result cache: query → { results, ts }
  const searchClientCache = useRef(new Map<string, { results: typeof searchSuggestions; ts: number }>());
  const topSearchInputRef = useRef<HTMLInputElement | null>(null);
  const [showTopSuggestions, setShowTopSuggestions] = useState(false);
  const [showBottomSuggestions, setShowBottomSuggestions] = useState(false);

  const handleSearchChange = (val: string, source: 'top' | 'bottom') => {
    const query = val.trim();

    if (query.length <= 1) {
      if (source === 'top') setShowTopSuggestions(false);
      else setShowBottomSuggestions(false);
      setSearchSuggestions([]);
      setSearchLoading(false);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchAbortRef.current?.abort();
      return;
    }

    if (source === 'top') { setShowTopSuggestions(true); setShowBottomSuggestions(false); }
    else { setShowBottomSuggestions(true); setShowTopSuggestions(false); }

    // Show cached results immediately (stale-while-revalidate)
    const cacheKey = query.toLowerCase();
    const hit = searchClientCache.current.get(cacheKey);
    if (hit && Date.now() - hit.ts < 30_000) {
      setSearchSuggestions(hit.results);
      setSearchLoading(false);
      return; // fresh enough — skip network call
    }
    if (hit) {
      // Stale: show immediately while fetching fresh
      setSearchSuggestions(hit.results);
    } else {
      setSearchLoading(true);
    }

    // Debounce the network call
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      setSearchLoading(true);

      void fetch(`/api/search?q=${encodeURIComponent(query)}&limit=30`, { signal: controller.signal })
        .then((r) => r.ok ? r.json() : Promise.reject(r))
        .then((payload: { results?: Array<{ id: string; title: string; description: string; href: string; badge?: string; category: string; scope?: string }> }) => {
          const results = payload.results ?? [];
          setSearchSuggestions(results);
          fireSearchEvent({ query, context: SEARCH_CONTEXTS.PUBLIC_HOMEPAGE, resultsCount: results.length });
          searchClientCache.current.set(cacheKey, { results, ts: Date.now() });
          // Evict oldest entries if cache > 50
          if (searchClientCache.current.size > 50) {
            const first = searchClientCache.current.keys().next().value;
            if (first) searchClientCache.current.delete(first);
          }
        })
        .catch((e) => {
          if (e instanceof DOMException && e.name === 'AbortError') return;
          setSearchSuggestions([]);
        })
        .finally(() => setSearchLoading(false));
    }, 150);
  };

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const welcomeScrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const voiceRef = useRef<any>(null);
  const workspaceMenuRef = useRef<HTMLDivElement | null>(null);

  const safeHref = useMemo(() => (href: string) => {
    if (!isAuthenticated && href.startsWith('/workspace')) return '/login';
    return href;
  }, [isAuthenticated]);

  const brandLower = (softwareName || 'docrud').toLowerCase();
  const hasAnyChat = messages.some((m) => m.role === 'user');
  const indiaCards = useMemo(() => {
    const base = [...INDIA_HIGHLIGHTS];
    const seed = new Date().toISOString().slice(0, 10); // stable per day
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
    for (let i = base.length - 1; i > 0; i--) {
      h = Math.imul(h ^ (i + 1), 16777619);
      const j = Math.abs(h) % (i + 1);
      [base[i], base[j]] = [base[j], base[i]];
    }
    return base;
  }, []);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [details, setDetails] = useState<SliderDetails | null>(null);
  const openDetails = (next: SliderDetails) => {
    setDetails(next);
    setDetailsOpen(true);
  };

  const loadThreads = async () => {
    if (!isAuthenticated) return;
    try {
      const res = await fetch('/api/home-chat', { method: 'GET' });
      if (!res.ok) return;
      const data = await res.json() as { threads?: ChatThreadSummary[] };
      if (Array.isArray(data.threads)) setThreads(data.threads);
    } catch {
      // ignore
    }
  };

  const loadThread = async (threadId: string) => {
    if (!isAuthenticated) return;
    setError(null);
    try {
      const res = await fetch(`/api/home-chat/${threadId}`, { method: 'GET' });
      if (!res.ok) return;
      const data = await res.json() as { thread?: { id: string; messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; createdAt: string }> } };
      const thread = data.thread;
      if (!thread) return;
      setActiveThreadId(threadId);
      setMessages(thread.messages.length ? thread.messages.map((m) => ({ ...m, sources: undefined })) : []);
      setMobileSidebarOpen(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    } catch {
      // ignore
    }
  };

  const createThread = async () => {
    if (!isAuthenticated) return null;
    setError(null);
    try {
      const res = await fetch('/api/home-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'New chat' }),
      });
      if (!res.ok) return null;
      const data = await res.json() as { thread?: { id: string } };
      const nextId = data.thread?.id || null;
      if (!nextId) return null;
      await loadThreads();
      setActiveThreadId(nextId);
      return nextId;
    } catch {
      return null;
    }
  };

  const sendMessage = async (params?: { message?: string; action?: DocumentQuickAction }) => {
    const rawMessage = typeof params?.message === 'string' ? params!.message : draft;
    const text = compactText(rawMessage);
    const action = params?.action;
    if ((!text && !action && !attachedDocument) || sending) return;
    setSending(true);
    setError(null);
    setDraft('');
    setAssistantStatusLabel('doCRUD is processing...');

    const displayContent = text || (action ? `/${action}` : 'Please analyze the attached document.');
    const userEntry: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: attachedDocument ? `[Document: ${attachedDocument.name}]\n\n${displayContent}` : displayContent,
      createdAt: new Date().toISOString(),
      requestMeta: { message: text || '', action },
    };
    setMessages((prev) => [...prev, userEntry]);

    try {
      let threadId = activeThreadId;
      if (isAuthenticated && !threadId) {
        threadId = await createThread();
      }

      const res = await fetch('/api/home-chat/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          threadId: threadId || undefined,
          message: text || '',
          action: action || undefined,
          document: attachedDocument || undefined,
        }),
      });

      const data = await res.json() as { card?: AssistantResultCard; content: string; error?: string; sources?: ChatMessage['sources'] };
      if (!res.ok) throw new Error(data.error || 'Failed to answer');

      const assistantId = crypto.randomUUID();
      const assistant: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: data.content,
        createdAt: new Date().toISOString(),
        sources: Array.isArray(data.sources) ? data.sources : undefined,
        card: data.card,
        requestMeta: { message: text || '', action },
      };
      setTypedChars(0);
      setTypingId(assistantId);
      setMessages((prev) => [...prev, assistant]);
      if (isAuthenticated) await loadThreads();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to answer');
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: 'Something went wrong. Try again in a moment.', createdAt: new Date().toISOString() },
      ]);
    } finally {
      setSending(false);
      setAssistantStatusLabel('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  useEffect(() => {
    void loadThreads();
  }, [isAuthenticated]);

  useEffect(() => { setIsMounted(true); }, []);

  // Listen for the global bottom nav Tools button click
  useEffect(() => {
    const handler = () => setMobileToolsDrawerOpen(true);
    window.addEventListener('open-mobile-tools-drawer', handler);
    return () => window.removeEventListener('open-mobile-tools-drawer', handler);
  }, []);

  useEffect(() => {
    if (mobileNavSearchOpen && mobileNavSearchRef.current) {
      setTimeout(() => mobileNavSearchRef.current?.focus(), 120);
    }
  }, [mobileNavSearchOpen]);

  useEffect(() => {
    if (!workspaceMenuOpen) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (workspaceMenuRef.current && workspaceMenuRef.current.contains(target)) return;
      setWorkspaceMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [workspaceMenuOpen]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, typedChars]);

  // Typing animation effect
  useEffect(() => {
    if (!typingId) return;
    const msg = messages.find((m) => m.id === typingId);
    if (!msg) return;
    if (typedChars >= msg.content.length) {
      setTypingId(null);
      return;
    }
    const charsPerTick = msg.content.length > 800 ? 18 : msg.content.length > 300 ? 12 : 6;
    typingTimerRef.current = setTimeout(() => {
      setTypedChars((c) => Math.min(c + charsPerTick, msg.content.length));
    }, 16);
    return () => { if (typingTimerRef.current) clearTimeout(typingTimerRef.current); };
  }, [typingId, typedChars, messages]);

  // Processing stage cycling
  useEffect(() => {
    if (!sending) { setProcessingStage(0); return; }
    const id = setInterval(() => setProcessingStage((s) => (s + 1) % 4), 1600);
    return () => clearInterval(id);
  }, [sending]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileSidebarOpen]);

  useEffect(() => {
    if (!chatHistoryOpen) return;
    if (!isAuthenticated) return;
    void loadThreads();
  }, [chatHistoryOpen, isAuthenticated]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    let lastTop = node.scrollTop;
    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const top = node.scrollTop;
        const delta = top - lastTop;
        lastTop = top;
        ticking = false;
        if (top < 60) {
          setComposerHidden(false);
          return;
        }
        if (delta > 10) {
          setComposerHidden(true);
        } else if (delta < -10) {
          setComposerHidden(false);
        }
      });
    };

    node.addEventListener('scroll', onScroll, { passive: true });
    return () => node.removeEventListener('scroll', onScroll as any);
  }, []);

  useEffect(() => {
    if (hasAnyChat) return;
    const sliders = Array.from(document.querySelectorAll<HTMLElement>('[data-auto-slider="true"]'));
    if (!sliders.length) return;

    const controllers: Array<{
      node: HTMLElement;
      cleanup: () => void;
      rafId: number;
    }> = [];

    for (const node of sliders) {
      let isPaused = false;
      const onEnter = () => { isPaused = true; };
      const onLeave = () => { isPaused = false; };
      node.addEventListener('mouseenter', onEnter);
      node.addEventListener('mouseleave', onLeave);
      node.addEventListener('touchstart', onEnter, { passive: true });
      node.addEventListener('touchend', onLeave, { passive: true });

      let scrollAmount = node.scrollLeft;
      const speed = Number(node.getAttribute('data-auto-speed') || '0.55'); // px per frame
      const loopMode = node.getAttribute('data-auto-loop') || 'end';
      const loopSets = Number(node.getAttribute('data-auto-sets') || '1');

      let controller: {
        node: HTMLElement;
        cleanup: () => void;
        rafId: number;
      };

      const step = () => {
        if (!isPaused) {
          scrollAmount += speed;
          const max = Math.max(0, node.scrollWidth - node.clientWidth);

          if (loopMode === 'sets' && loopSets > 1) {
            const setWidth = node.scrollWidth / loopSets;
            if (scrollAmount >= setWidth) scrollAmount = 0;
          } else if (scrollAmount >= max) {
            scrollAmount = 0;
          }

          node.scrollLeft = scrollAmount;
        } else {
          scrollAmount = node.scrollLeft;
        }
        controller.rafId = requestAnimationFrame(step);
      };

      controller = {
        node,
        rafId: 0,
        cleanup: () => {
          node.removeEventListener('mouseenter', onEnter);
          node.removeEventListener('mouseleave', onLeave);
          node.removeEventListener('touchstart', onEnter as any);
          node.removeEventListener('touchend', onLeave as any);
        },
      };
      controllers.push(controller);
      controller.rafId = requestAnimationFrame(step);
    }

    return () => {
      for (const c of controllers) {
        cancelAnimationFrame(c.rafId);
        c.cleanup();
      }
    };
  }, [hasAnyChat]);

  const scrollSliderById = (id: string, dir: 1 | -1) => {
    const node = document.getElementById(id);
    if (!node) return;
    const amount = Math.max(240, Math.round(node.clientWidth * 0.85));
    node.scrollBy({ left: dir * amount, behavior: 'smooth' });
  };

  useEffect(() => {
    let io: IntersectionObserver | null = null;
    // Small delay so layout is settled before observing
    const timer = setTimeout(() => {
      const root = welcomeScrollRef.current ?? null;
      const nodes = root
        ? Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'))
        : Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
      if (!nodes.length) return;
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              (e.target as HTMLElement).classList.add('is-visible');
              io?.unobserve(e.target);
            }
          }
        },
        { root, threshold: 0.04, rootMargin: '0px 0px 0px 0px' },
      );
      nodes.forEach((n) => io!.observe(n));
    }, 120);
    return () => {
      clearTimeout(timer);
      io?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (hasAnyChat) return;
    const interval = setInterval(() => {
      setHeadlineIndex((prev) => (prev + 1) % headlines.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [hasAnyChat, headlines.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        topSearchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  /* ── Auto-open Drive when email action-button deep-link is detected ── */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.has('drive-open') || params.has('drive-import')) {
      setFileDriveOpen(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Voice input is not supported in this browser.');
      return;
    }

    if (voiceRef.current && voiceActive) {
      try {
        voiceRef.current.stop();
      } catch {
        // ignore
      }
      setVoiceActive(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results || [])
        .map((r: any) => r[0]?.transcript || '')
        .join(' ')
        .trim();
      if (transcript) {
        setDraft((prev) => (prev ? `${prev} ${transcript}` : transcript).slice(0, 1500));
      }
    };
    recognition.onerror = () => {
      setVoiceActive(false);
    };
    recognition.onend = () => {
      setVoiceActive(false);
    };

    voiceRef.current = recognition;
    setVoiceActive(true);
    setError(null);
    recognition.start();
  };

  /* ── Collapsed icon-rail (desktop only) ── */
  const sidebarCollapsedRail = (
    <div className="flex h-full flex-col items-center py-4 gap-0.5">
      {/* Logo gem */}
      <div className="mb-3 flex h-9 w-9 items-center justify-center">
        <div className="h-[14px] w-[14px] rotate-45 rounded-[3px] bg-gradient-to-br from-white via-slate-200 to-slate-400 shadow-[0_0_16px_rgba(255,255,255,0.20)]" />
      </div>
      {/* Expand */}
      <button
        type="button"
        title="Expand menu"
        onClick={() => setSidebarCollapsed(false)}
        className="mb-1 flex h-9 w-9 items-center justify-center rounded-[12px] text-white/22 transition-all duration-150 hover:bg-white/[0.07] hover:text-white/65 active:scale-95"
        aria-label="Expand sidebar"
      >
        <LayoutGrid className="h-[15px] w-[15px]" />
      </button>
      <div className="my-1 h-px w-6 rounded-full bg-white/[0.06]" />
      {/* Nav icons */}
      {sidebarNav.map((item) => {
        const active = item.label === 'AI Chat';
        const isSecureSharing = item.label === 'Secure Sharing';
        const isPdfEditor = item.label === 'PDF Editor';
        const isVisualizer = item.label === 'Visualizer';
        const isForms = item.label === 'Forms';
        const isESign = item.label === 'E‑Sign';
        const resolvedHref = item.label === 'My Profile'
          ? '/profile'
          : item.href;
        const sharedCls = [
          'relative flex h-9 w-9 items-center justify-center rounded-[12px] transition-all duration-150',
          active
            ? 'bg-white/[0.10] text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
            : 'text-white/28 hover:bg-white/[0.07] hover:text-white/70',
        ].join(' ');
        if (isSecureSharing) {
          return (
            <button
              key={item.label}
              type="button"
              title={item.label}
              onClick={() => setSecureSharingOpen(true)}
              className={sharedCls}
            >
              <item.Icon className="h-4 w-4" />
            </button>
          );
        }
        if (isPdfEditor) {
          return (
            <button
              key={item.label}
              type="button"
              title={item.label}
              onClick={() => setPdfStudioOpen(true)}
              className={sharedCls}
            >
              <item.Icon className="h-4 w-4" />
            </button>
          );
        }
        if (isForms) {
          return (
            <button
              key={item.label}
              type="button"
              title={item.label}
              onClick={() => setFormsStudioOpen(true)}
              className={sharedCls}
            >
              <item.Icon className="h-4 w-4" />
            </button>
          );
        }
        if (isVisualizer) {
          return (
            <button
              key={item.label}
              type="button"
              title={item.label}
              onClick={() => setShowVisualizerModal(true)}
              className={sharedCls}
            >
              <item.Icon className="h-4 w-4" />
            </button>
          );
        }
        if (isESign) {
          return (
            <button
              key={item.label}
              type="button"
              title={item.label}
              onClick={() => setESignStudioOpen(true)}
              className={sharedCls}
            >
              <item.Icon className="h-4 w-4" />
            </button>
          );
        }
        return (
          <Link
            key={item.label}
            href={safeHref(resolvedHref)}
            title={item.label}
            className={sharedCls}
          >
            {active && (
              <span className="absolute left-0 top-1/2 h-[16px] w-[2px] -translate-y-1/2 rounded-r-full bg-white/80 shadow-[0_0_6px_rgba(255,255,255,0.4)]" />
            )}
            <item.Icon className="h-[15px] w-[15px]" />
          </Link>
        );
      })}
      {/* Bottom */}
      <div className="mt-auto flex flex-col items-center gap-1">
        <div className="mb-1 h-px w-6 rounded-full bg-white/[0.06]" />
        {/* User avatar */}
        <div className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-gradient-to-br from-white/[0.16] to-white/[0.05] text-[11px] font-bold text-white/70 ring-1 ring-white/[0.12] shadow-[0_2px_8px_rgba(0,0,0,0.3)]">
          {(session?.user?.name || 'G').charAt(0).toUpperCase()}
        </div>
        <Link
          href={isAuthenticated ? '/workspace' : '/login'}
          title="Settings"
          className="flex h-8 w-8 items-center justify-center rounded-[12px] text-white/18 transition hover:bg-white/[0.07] hover:text-white/55 active:scale-95"
        >
          <Settings className="h-[14px] w-[14px]" />
        </Link>
      </div>
    </div>
  );

  /* ── Expanded sidebar (desktop + mobile) ── */
  const sidebarExpanded = (onClose?: () => void) => (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-[26px] w-[26px] items-center justify-center rounded-[8px] border border-white/[0.10] bg-white/[0.07] shadow-[0_0_12px_rgba(255,255,255,0.06)]">
            <div className="h-[11px] w-[11px] rotate-45 rounded-[2px] bg-gradient-to-br from-white to-slate-300" />
          </div>
          <span className="text-[13.5px] font-semibold tracking-[-0.025em] text-white/90">{softwareName}</span>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-xl text-white/25 transition hover:bg-white/[0.07] hover:text-white/70"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSidebarCollapsed(true)}
            className="flex h-7 w-7 items-center justify-center rounded-xl text-white/20 transition hover:bg-white/[0.07] hover:text-white/60"
            aria-label="Collapse"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* New chat */}
      <div className="shrink-0 px-3 pt-3 pb-1">
        <button
          type="button"
          onClick={() => { if (!isAuthenticated && !guestMode) { window.location.assign('/login'); return; } void createThread(); if (onClose) onClose(); }}
          className="group flex w-full items-center gap-2.5 rounded-[13px] border border-white/[0.08] bg-white/[0.04] px-3 py-[10px] text-[12.5px] font-semibold text-white/55 transition-all hover:border-white/[0.14] hover:bg-white/[0.08] hover:text-white/90"
        >
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-white/[0.10] bg-white/[0.06] transition group-hover:bg-white/[0.10]">
            <Plus className="h-3 w-3" />
          </div>
          New conversation
        </button>
      </div>

      {/* Nav body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-2 pt-3 scrollbar-minimal touch-scroll">
        {guestMode ? (
          /* Guest mode: show only AI Chat */
          <div className="mb-5">
            <div className="flex items-center gap-1.5 px-2 mb-2">
              <span className="h-[5px] w-[5px] rounded-full bg-amber-400/50" />
              <p className="text-[9px] font-semibold tracking-[0.13em] text-amber-400/50">incognito</p>
            </div>
            <div className="space-y-px">
              <Link
                href="/"
                onClick={() => onClose?.()}
                className="group relative flex items-center gap-3 rounded-[11px] px-3 py-[9px] text-[13px] font-medium bg-white/[0.09] text-white ring-1 ring-inset ring-white/[0.08] transition-all"
              >
                <span className="absolute left-0 top-1/2 h-[18px] w-[2.5px] -translate-y-1/2 rounded-r-full bg-white/60" />
                <Sparkles className="h-[15px] w-[15px] shrink-0 text-white/75" />
                AI Chat
              </Link>
              {/* Locked items preview */}
              {[
                { label: 'Documents', Icon: FileText },
                { label: 'PDF Editor', Icon: Wand2 },
                { label: 'E‑Sign', Icon: FileSignature },
              ].map(({ label, Icon }) => (
                <div
                  key={label}
                  title="Sign in to access"
                  className="flex items-center gap-3 rounded-[11px] px-3 py-[9px] text-[13px] font-medium text-white/15 cursor-not-allowed select-none"
                >
                  <Icon className="h-[15px] w-[15px] shrink-0 text-white/10" />
                  <span>{label}</span>
                  <LockKeyhole className="ml-auto h-3 w-3 text-white/12" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          (['Workspace', 'Tools', 'Security'] as const).map((group) => {
            const items = sidebarNav.filter((i) => i.group === group);
            if (!items.length) return null;
            const gCfg = {
              Workspace: {
                wrapCls: 'bg-slate-400/[0.03] border-white/[0.08]',
                labelCls: 'text-slate-300/40',
                dotCls: 'bg-slate-300/40',
                activeCls: 'bg-white/[0.10] text-white ring-1 ring-inset ring-white/[0.10] shadow-[0_1px_0_rgba(255,255,255,0.05)]',
                inactiveCls: 'text-white/40 hover:bg-white/[0.055] hover:text-white/82',
                iconActiveCls: 'text-white/80',
                iconInactiveCls: 'text-white/28 group-hover:text-white/68',
              },
              Tools: {
                wrapCls: 'bg-violet-500/[0.06] border-violet-400/[0.13]',
                labelCls: 'text-violet-300/55',
                dotCls: 'bg-violet-400/60',
                activeCls: 'bg-violet-500/[0.16] text-white ring-1 ring-inset ring-violet-400/[0.20] shadow-[0_1px_0_rgba(167,139,250,0.08)]',
                inactiveCls: 'text-white/40 hover:bg-violet-500/[0.09] hover:text-white/82',
                iconActiveCls: 'text-violet-300/95',
                iconInactiveCls: 'text-violet-400/38 group-hover:text-violet-300/75',
              },
              Security: {
                wrapCls: 'bg-emerald-500/[0.06] border-emerald-400/[0.13]',
                labelCls: 'text-emerald-300/55',
                dotCls: 'bg-emerald-400/60',
                activeCls: 'bg-emerald-500/[0.16] text-white ring-1 ring-inset ring-emerald-400/[0.20] shadow-[0_1px_0_rgba(52,211,153,0.08)]',
                inactiveCls: 'text-white/40 hover:bg-emerald-500/[0.09] hover:text-white/82',
                iconActiveCls: 'text-emerald-300/95',
                iconInactiveCls: 'text-emerald-400/38 group-hover:text-emerald-300/75',
              },
            }[group];
            return (
              <div key={group} className={`mb-2 rounded-[13px] border ${gCfg.wrapCls} p-1.5 backdrop-blur-sm`}>
                <div className="flex items-center gap-1.5 px-2 py-[5px]">
                  <span className={`h-[5px] w-[5px] rounded-full ${gCfg.dotCls}`} />
                  <p className={`text-[9px] font-semibold tracking-[0.13em] ${gCfg.labelCls}`}>{group.toLowerCase()}</p>
                </div>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const active = item.label === 'AI Chat';
                    const isSecureSharing = item.label === 'Secure Sharing';
                    const isPdfEditor = item.label === 'PDF Editor';
                    const isVisualizer = item.label === 'Visualizer';
                    const isForms = item.label === 'Forms';
                    const isESign = item.label === 'E‑Sign';
                    const resolvedHref = item.label === 'My Profile'
                      ? '/profile'
                      : item.href;
                    const sharedCls = [
                      'group relative flex items-center gap-2.5 rounded-[10px] px-2.5 py-[8px] text-[12.5px] font-medium transition-all duration-150 w-full text-left',
                      active ? gCfg.activeCls : gCfg.inactiveCls,
                    ].join(' ');
                    const iconCls = `h-[14px] w-[14px] shrink-0 transition-colors duration-150 ${active ? gCfg.iconActiveCls : gCfg.iconInactiveCls}`;
                    if (isSecureSharing) {
                      return (
                        <button key={item.label} type="button" onClick={() => { setSecureSharingOpen(true); onClose?.(); }} className={sharedCls}>
                          <item.Icon className={iconCls} />
                          {item.label}
                        </button>
                      );
                    }
                    if (isPdfEditor) {
                      return (
                        <button key={item.label} type="button" onClick={() => { setPdfStudioOpen(true); onClose?.(); }} className={sharedCls}>
                          <item.Icon className={iconCls} />
                          {item.label}
                        </button>
                      );
                    }
                    if (isForms) {
                      return (
                        <button key={item.label} type="button" onClick={() => { setFormsStudioOpen(true); onClose?.(); }} className={sharedCls}>
                          <item.Icon className={iconCls} />
                          {item.label}
                        </button>
                      );
                    }
                    if (isVisualizer) {
                      return (
                        <button key={item.label} type="button" onClick={() => { setShowVisualizerModal(true); onClose?.(); }} className={sharedCls}>
                          <item.Icon className={iconCls} />
                          {item.label}
                        </button>
                      );
                    }
                    if (isESign) {
                      return (
                        <button key={item.label} type="button" onClick={() => { setESignStudioOpen(true); onClose?.(); }} className={sharedCls}>
                          <item.Icon className={iconCls} />
                          {item.label}
                        </button>
                      );
                    }
                    return (
                      <Link key={item.label} href={safeHref(resolvedHref)} onClick={() => onClose?.()} className={sharedCls}>
                        {active && (
                          <span className="absolute left-0 top-1/2 h-[15px] w-[2px] -translate-y-1/2 rounded-r-full bg-white/70 shadow-[0_0_6px_rgba(255,255,255,0.4)]" />
                        )}
                        <item.Icon className={iconCls} />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}

        {/* Recent threads */}
        {isAuthenticated && threads.length > 0 && (
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between px-2">
              <div className="flex items-center gap-1.5">
                <span className="h-[5px] w-[5px] rounded-full bg-white/22" />
                <p className="text-[9px] font-semibold tracking-[0.13em] text-white/28">recent</p>
              </div>
              <button
                type="button"
                onClick={() => setChatHistoryOpen(true)}
                className="text-[10px] font-semibold text-white/22 transition hover:text-white/55"
              >
                See all
              </button>
            </div>
            <div className="space-y-px">
              {threads.slice(0, 6).map((t) => {
                const active = activeThreadId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { loadThread(t.id); onClose?.(); }}
                    className={[
                      'w-full rounded-[11px] px-3 py-2 text-left transition-all duration-150',
                      active
                        ? 'bg-white/[0.07] text-white ring-1 ring-inset ring-white/[0.07]'
                        : 'text-white/32 hover:bg-white/[0.04] hover:text-white/65',
                    ].join(' ')}
                  >
                    <p className="truncate text-[12px] font-medium leading-snug">{t.title}</p>
                    <p className="mt-0.5 text-[10px] text-white/20">{formatRelative(t.updatedAt)}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* More */}
        <div className="border-t border-white/[0.05] pt-3 space-y-px">
          <div className="flex items-center gap-1.5 px-2 mb-2">
            <span className="h-[5px] w-[5px] rounded-full bg-white/20" />
            <p className="text-[9px] font-semibold tracking-[0.13em] text-white/25">more</p>
          </div>
          {[
            { href: '/support', Icon: Settings, label: 'Settings' },
            { href: '/support', Icon: HelpCircle, label: 'Help & Support' },
          ].map(({ href, Icon, label }) => (
            <Link
              key={label}
              href={href}
              className="group flex items-center gap-3 rounded-[11px] px-3 py-[9px] text-[13px] font-medium text-white/30 transition hover:bg-white/[0.05] hover:text-white/70"
            >
              <Icon className="h-[15px] w-[15px] shrink-0 text-white/22 transition group-hover:text-white/55" />
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* User row + sign-out — OUTSIDE scrollable area, always visible */}
      <div className="shrink-0 border-t border-white/[0.06] p-3 space-y-1">
        {guestMode ? (
          <Link
            href="/login"
            onClick={() => { if (typeof document !== 'undefined') document.cookie = 'guestMode=; path=/; max-age=0'; onClose?.(); }}
            className="flex items-center justify-center gap-2 rounded-[13px] bg-white px-3 py-2.5 text-[13px] font-bold text-[#0D0D0F] transition hover:bg-white/90"
          >
            Sign in to unlock everything
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <>
            <Link
              href={isAuthenticated ? '/profile' : '/login'}
              className="group flex items-center gap-3 rounded-[13px] px-3 py-2.5 transition-all hover:bg-white/[0.05]"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-white/[0.18] to-white/[0.04] text-[12px] font-bold text-white/65 ring-1 ring-white/[0.12] shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
                {(session?.user?.name || 'G').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-semibold text-white/55 transition group-hover:text-white/80">{session?.user?.name || 'Guest'}</p>
                <p className="truncate text-[10.5px] text-white/22">{session?.user?.email || 'Sign in to save chats'}</p>
              </div>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-white/18 transition group-hover:text-white/50" />
            </Link>
            {isAuthenticated && (
              <button
                type="button"
                onClick={() => setAccountModalOpen(true)}
                className="group flex w-full items-center gap-3 rounded-[11px] px-3 py-[9px] text-[13px] font-medium text-rose-400/60 transition hover:bg-rose-500/[0.08] hover:text-rose-400 active:scale-[0.98]"
              >
                <LogOut className="h-[15px] w-[15px] shrink-0 text-rose-400/40 transition group-hover:text-rose-400" />
                Sign out
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );

  /* sidebar — no extra wrapper, sidebarExpanded already owns the flex layout */
  const sidebar = sidebarCollapsed ? sidebarCollapsedRail : sidebarExpanded();

  const visibleMessages = messages;

  return (
    <>
    <main className="h-[100dvh] overflow-hidden bg-[#0D0D0F] text-white flex flex-col">
      {quickEditorOpen && (
        <QuickFileEditorDialog
          open={quickEditorOpen}
          onOpenChange={setQuickEditorOpen}
          document={attachedDocument}
          isAuthenticated={isAuthenticated}
        />
      )}
      {showPublishModal && (
        <PublishAnythingDialog
          open={showPublishModal}
          onOpenChange={(o) => { setShowPublishModal(o); if (!o) setPublishInitialCategory(undefined); }}
          isAuthenticated={isAuthenticated}
          initialCategory={publishInitialCategory as never}
        />
      )}

      {/* E-Sign Studio fullscreen modal */}
      {eSignStudioOpen && (
        <ESignStudioModal
          open={eSignStudioOpen}
          onClose={() => setESignStudioOpen(false)}
        />
      )}

      {/* File Drive Center */}
      {fileDriveOpen && (
        <FileDriveCenter
          open={fileDriveOpen}
          onClose={() => setFileDriveOpen(false)}
        />
      )}

      {/* DocSheets Studio fullscreen overlay */}
      {showDocSheet && (
        <div
          className="fixed inset-0 flex flex-col"
          style={{
            zIndex: 999,
            background: '#08090a',
            animation: 'docSheetSlideIn 0.38s cubic-bezier(0.22,1,0.36,1) both',
          }}
        >
          <style>{`
            @keyframes docSheetSlideIn {
              0%   { opacity: 0; transform: translateY(18px) scale(0.992); filter: blur(6px); }
              100% { opacity: 1; transform: translateY(0)    scale(1);     filter: blur(0);   }
            }
            @keyframes docSheetSlideOut {
              0%   { opacity: 1; transform: translateY(0)    scale(1);     filter: blur(0);   }
              100% { opacity: 0; transform: translateY(18px) scale(0.992); filter: blur(6px); }
            }
          `}</style>

          {/* Header — mirrors the homepage nav */}
          <div
            className="shrink-0 flex items-center justify-between gap-3 px-4"
            style={{
              height: 56,
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(8,9,10,0.92)',
              backdropFilter: 'blur(40px)',
              WebkitBackdropFilter: 'blur(40px)',
              boxShadow: '0 1px 0 rgba(255,255,255,0.04)',
            }}
          >
            {/* Left — icon + title */}
            <div className="flex items-center gap-2.5">
              <div
                style={{
                  width: 30, height: 30, borderRadius: 9,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(16,185,129,0.12)',
                  border: '1px solid rgba(16,185,129,0.22)',
                }}
              >
                <Sheet style={{ width: 15, height: 15, color: '#34d399' }} />
              </div>
              <div>
                <p style={{ fontSize: 13.5, fontWeight: 600, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1 }}>
                  DocSheets Studio
                </p>
                <p style={{ fontSize: 10, fontWeight: 400, color: 'rgba(255,255,255,0.35)', marginTop: 2, letterSpacing: '0.01em' }}>
                  Spreadsheets · Workbooks · Formulas
                </p>
              </div>
            </div>

            {/* Right — close */}
            <button
              type="button"
              onClick={() => setShowDocSheet(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/50 transition hover:bg-white/[0.09] hover:text-white active:scale-95"
              aria-label="Close DocSheets Studio"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body — DocSheetCenter fills remaining height */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <DocSheetCenter
              history={docSheetHistory}
              onHistoryRefresh={async () => {
                try {
                  const r = await fetch('/api/history');
                  if (r.ok) {
                    const d = await r.json().catch(() => []);
                    setDocSheetHistory(Array.isArray(d) ? d : []);
                  }
                } catch { /* silent */ }
              }}
              layout="module"
            />
          </div>
        </div>
      )}

      {/* Scratchpad fullscreen overlay */}
      {showScratchpad && (
        <div className="fixed inset-0 z-[999] flex flex-col bg-white">
          {/* Overlay header */}
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2.5 shadow-sm shrink-0">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100">
                <PenLine className="h-4 w-4 text-violet-600" />
              </div>
              <span className="text-sm font-semibold text-slate-800">Scratchpad</span>
            </div>
            <button
              type="button"
              onClick={() => setShowScratchpad(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors"
              title="Close Scratchpad"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {/* Canvas fills remaining height */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <ScratchpadCenter />
          </div>
        </div>
      )}
      <DetailsDialog open={detailsOpen} onOpenChange={setDetailsOpen} details={details} />
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx,.docm,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.txt,.md,.html,.csv,.json,.xml,.rtf,.png,.jpg,.jpeg,.webp,.tif,.tiff"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            setError(null);
            setUploadStage('reading');
            setUploadStatusLabel('Reading document…');

            const form = new FormData();
            form.append('file', file);
            setUploadStage('analyzing');
            setUploadStatusLabel('Analyzing content…');

            const res = await fetch('/api/home-chat/ingest', { method: 'POST', body: form });
            const data = await res.json() as { document?: UploadedDocument; error?: string };
            if (!res.ok) throw new Error(data.error || 'Failed to process document');
            if (!data.document) throw new Error('No document returned');
            setAttachedDocument(data.document);
            setUploadStage('ready');
            setUploadStatusLabel('Document ready');
            setTimeout(() => inputRef.current?.focus(), 0);
          } catch (err) {
            setUploadStage('error');
            setUploadStatusLabel('Failed to process document');
            setError(err instanceof Error ? err.message : 'Failed to process document.');
          }
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }}
      />

      <HomepageNav
        softwareName={softwareName}
        accentLabel={accentLabel}
        onPublishClick={guestMode ? undefined : () => setShowPublishModal(true)}
        onESignClick={() => setESignStudioOpen(true)}
        onScratchpadClick={() => setShowScratchpad(true)}
        onDocSheetClick={async () => {
          setShowDocSheet(true);
          try {
            const r = await fetch('/api/history');
            if (r.ok) {
              const d = await r.json().catch(() => []);
              setDocSheetHistory(Array.isArray(d) ? d : []);
            }
          } catch { /* silent */ }
        }}
        onFileDriveClick={() => setFileDriveOpen(true)}
        onAllToolsClick={() => setMobileToolsDrawerOpen(true)}
        guestMode={guestMode}
      />

      {/* Guest mode banner */}
      {guestMode && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-500/[0.15] bg-amber-500/[0.05] px-4 py-2">
          <div className="flex items-center gap-2 text-[12px] text-white/55">
            <LockKeyhole className="h-3.5 w-3.5 shrink-0 text-amber-400/70" />
            <span><span className="font-semibold text-amber-400/90">Incognito mode</span> — you can chat, read, like and share. Sign in to unlock everything.</span>
          </div>
          <Link
            href="/login"
            onClick={() => { if (typeof document !== 'undefined') document.cookie = 'guestMode=; path=/; max-age=0'; }}
            className="shrink-0 rounded-lg border border-white/[0.15] bg-white px-3 py-1 text-[11.5px] font-bold text-[#0D0D0F] transition hover:bg-white/90"
          >
            Sign in
          </Link>
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden relative min-h-0">
          {/* BgOrbs — fixed behind all content, same as onboarding */}
          <div className="pointer-events-none fixed inset-0 overflow-hidden" style={{ zIndex: 0 }} aria-hidden="true">
            {/* Base */}
            <div className="absolute inset-0" style={{ background: '#060608' }} />
            {/* Orbs — reduced to 35% opacity on mobile, full on sm+ */}
            <div className="absolute inset-0 opacity-[0.35] sm:opacity-100">
            {/* Diagonal pinned orange glows */}
            <div className="absolute -top-48 -left-48 h-[700px] w-[700px] rounded-full"
              style={{ background: 'radial-gradient(circle,rgba(249,115,22,0.04) 0%,rgba(234,88,12,0.02) 40%,transparent 70%)', filter: 'blur(140px)', willChange: 'transform', transform: 'translateZ(0)' }} />
            <div className="absolute -bottom-48 -right-48 h-[700px] w-[700px] rounded-full"
              style={{ background: 'radial-gradient(circle,rgba(249,115,22,0.04) 0%,rgba(234,88,12,0.02) 40%,transparent 70%)', filter: 'blur(140px)', willChange: 'transform', transform: 'translateZ(0)' }} />
            {/* Animated orange-gold orbs */}
            <div className="absolute -left-40 -top-40 h-[800px] w-[800px] rounded-full"
              style={{ background: 'radial-gradient(circle,rgba(251,146,60,0.07) 0%,rgba(245,158,11,0.04) 38%,rgba(234,88,12,0.02) 62%,transparent 76%)', filter: 'blur(95px)', animation: 'obGoldDrift1 30s ease-in-out infinite', willChange: 'transform', transform: 'translateZ(0)' }} />
            <div className="absolute -right-32 top-[12%] h-[660px] w-[660px] rounded-full"
              style={{ background: 'radial-gradient(circle,rgba(245,158,11,0.06) 0%,rgba(251,146,60,0.03) 42%,rgba(253,186,116,0.01) 66%,transparent 78%)', filter: 'blur(85px)', animation: 'obGoldDrift2 38s ease-in-out infinite 5s', willChange: 'transform', transform: 'translateZ(0)' }} />
            <div className="absolute bottom-[-8%] left-[28%] h-[580px] w-[580px] rounded-full"
              style={{ background: 'radial-gradient(circle,rgba(234,88,12,0.05) 0%,rgba(245,158,11,0.03) 40%,rgba(251,146,60,0.01) 64%,transparent 76%)', filter: 'blur(80px)', animation: 'obGoldDrift3 34s ease-in-out infinite 10s', willChange: 'transform', transform: 'translateZ(0)' }} />
            <div className="absolute right-[18%] bottom-[22%] h-[340px] w-[340px] rounded-full"
              style={{ background: 'radial-gradient(circle,rgba(253,186,116,0.04) 0%,rgba(245,158,11,0.02) 52%,transparent 72%)', filter: 'blur(60px)', animation: 'obGoldDrift1 22s ease-in-out infinite 8s', willChange: 'transform', transform: 'translateZ(0)' }} />
            {/* Particles */}
            {([
              { x: 8,  y:12, s:2,   d:'0s',   t:'obParticle 4.2s ease-in-out infinite',  warm:false },
              { x:22,  y:68, s:1.5, d:'0.7s', t:'obParticle2 5.1s ease-in-out infinite', warm:true  },
              { x:45,  y:22, s:1.5, d:'1.2s', t:'obParticle 3.8s ease-in-out infinite',  warm:false },
              { x:63,  y:78, s:2,   d:'0.3s', t:'obParticle2 6.2s ease-in-out infinite', warm:false },
              { x:78,  y:35, s:1.5, d:'1.8s', t:'obParticle 4.6s ease-in-out infinite',  warm:false },
              { x:88,  y:82, s:2,   d:'0.9s', t:'obParticle2 5.5s ease-in-out infinite', warm:false },
              { x:35,  y:90, s:1.5, d:'2.1s', t:'obParticle 3.5s ease-in-out infinite',  warm:true  },
              { x:55,  y:48, s:2,   d:'0.5s', t:'obParticle2 4.9s ease-in-out infinite', warm:false },
            ] as const).map((p, i) => (
              <div key={i} className="absolute rounded-full"
                style={{ left:`${p.x}%`, top:`${p.y}%`, width:p.s, height:p.s, animationDelay:p.d, animation:p.t,
                  background: p.warm ? 'rgba(251,146,60,0.65)' : 'rgba(255,255,255,0.45)' }} />
            ))}
            </div>{/* end opacity wrapper */}
            {/* Glass grain */}
            <div className="absolute inset-0 opacity-[0.025]"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.75\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")', backgroundRepeat: 'repeat', backgroundSize: '180px 180px' }} />
            {/* Micro-grid */}
            <div className="absolute inset-0 opacity-[0.016]"
              style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.5) 1px,transparent 1px)', backgroundSize: '64px 64px' }} />
            {/* Warm top glow */}
            <div className="absolute inset-0"
              style={{ background: 'radial-gradient(ellipse 110% 60% at 50% -5%,rgba(245,158,11,0.06) 0%,transparent 55%)' }} />
            {/* Edge darken */}
            <div className="absolute inset-0"
              style={{ background: 'radial-gradient(ellipse at center,transparent 38%,rgba(5,5,8,0.82) 100%)' }} />
          </div>

          <div className="relative flex-1 overflow-hidden min-h-0" style={{ zIndex: 1 }}>
            <div className="relative flex h-full w-full flex-col min-h-0">

              {!hasAnyChat ? (
                <NewHomepageContent
                  softwareName={softwareName}
                  headlines={headlines}
                  headlineIndex={headlineIndex}
                  setDraft={setDraft}
                  inputRef={inputRef}
                  welcomeScrollRef={welcomeScrollRef}
                  onPublishClick={openPublishModal}
                  onESignClick={() => setESignStudioOpen(true)}
                  onScratchpadClick={() => setShowScratchpad(true)}
                  onPdfClick={() => setPdfStudioOpen(true)}
                  onDocSheetClick={async () => {
                    setShowDocSheet(true);
                    try {
                      const r = await fetch('/api/history');
                      if (r.ok) {
                        const d = await r.json().catch(() => []);
                        setDocSheetHistory(Array.isArray(d) ? d : []);
                      }
                    } catch { /* silent */ }
                  }}
                  liveGigs={liveGigs}
                  liveMetrics={liveMetrics}
                  liveFeeds={liveFeeds}
                  hpSections={hpSections}
                  hpConfig={hpConfig}
                />
              ) : (
                <div
                  ref={scrollRef}
                  style={{ WebkitOverflowScrolling: 'touch' }}
                  className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y scrollbar-minimal pb-32 pt-10 flex flex-col"
                >
                  <div className="mx-auto w-full max-w-5xl px-4 sm:px-8 space-y-6">
                    {visibleMessages.map((m) => {
                      const isUser = m.role === 'user';
                      const isTypingThis = m.id === typingId;
                      const displayContent = isTypingThis ? m.content.slice(0, typedChars) : m.content;
                      const showCursor = isTypingThis && typedChars < m.content.length;

                      return (
                        <div key={m.id} className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
                          {isUser ? (
                            <div className="max-w-[88%] sm:max-w-[75%] rounded-[18px] border border-white/[0.08] bg-white/[0.06] px-4 py-3 text-[13.5px] leading-relaxed text-white/90 backdrop-blur-xl">
                              <div className="whitespace-pre-wrap">{m.content}</div>
                            </div>
                          ) : m.card ? (
                            <div className="w-full">
                              <AssistantResultCardView
                                card={m.card}
                                onRegenerate={
                                  m.requestMeta
                                    ? () => void sendMessage({ message: m.requestMeta!.message, action: m.requestMeta!.action })
                                    : undefined
                                }
                              />
                              {m.sources?.length ? (
                                <div className="mt-4">
                                  <p className="mb-2.5 text-[10.5px] font-bold uppercase tracking-[0.18em] text-white/25">Relevant results</p>
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    {m.sources.slice(0, 6).map((s) => (
                                      <Link key={s.href} href={safeHref(s.href)}
                                        className="group flex items-start gap-3 rounded-[16px] border border-white/[0.06] bg-white/[0.03] p-3.5 transition hover:border-white/[0.12] hover:bg-white/[0.06]"
                                      >
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.05]">
                                          <FileText className="h-3.5 w-3.5 text-white/35 transition group-hover:text-white/60" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <div className="truncate text-[12.5px] font-semibold text-white/75 transition group-hover:text-white">{s.title}</div>
                                          {s.description && <div className="mt-0.5 line-clamp-1 text-[11px] text-white/30">{s.description}</div>}
                                          {(s.badge || s.category) && (
                                            <span className="mt-1.5 inline-block rounded-full border border-white/[0.06] bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-white/30">
                                              {s.badge || s.category}
                                            </span>
                                          )}
                                        </div>
                                        <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/15 transition group-hover:translate-x-0.5 group-hover:text-white/45" />
                                      </Link>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="w-full max-w-[90%] sm:max-w-[82%]">
                              <div className="rounded-[20px] border border-white/[0.07] bg-white/[0.04] px-5 py-4 text-[13.5px] leading-[1.75] text-white/80 backdrop-blur-xl">
                                <div className="whitespace-pre-wrap">
                                  {displayContent || (showCursor ? '' : '…')}
                                  {showCursor && (
                                    <span className="ml-[1px] inline-block h-[1em] w-[2px] translate-y-[1px] animate-[blink_0.8s_step-end_infinite] rounded-full bg-white/60 align-middle" />
                                  )}
                                </div>
                              </div>
                              {!isTypingThis && m.sources?.length ? (
                                <div className="mt-3">
                                  <p className="mb-2.5 text-[10.5px] font-bold uppercase tracking-[0.18em] text-white/25">Relevant results</p>
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    {m.sources.slice(0, 6).map((s) => (
                                      <Link key={s.href} href={safeHref(s.href)}
                                        className="group flex items-start gap-3 rounded-[16px] border border-white/[0.06] bg-white/[0.03] p-3.5 transition hover:border-white/[0.12] hover:bg-white/[0.06]"
                                      >
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.05]">
                                          <FileText className="h-3.5 w-3.5 text-white/35 transition group-hover:text-white/60" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <div className="truncate text-[12.5px] font-semibold text-white/75 transition group-hover:text-white">{s.title}</div>
                                          {s.description && <div className="mt-0.5 line-clamp-1 text-[11px] text-white/30">{s.description}</div>}
                                          {(s.badge || s.category) && (
                                            <span className="mt-1.5 inline-block rounded-full border border-white/[0.06] bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-white/30">
                                              {s.badge || s.category}
                                            </span>
                                          )}
                                        </div>
                                        <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/15 transition group-hover:translate-x-0.5 group-hover:text-white/45" />
                                      </Link>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {error ? (
                      <div className="rounded-[14px] border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-[12.5px] text-rose-300/80">
                        {error}
                      </div>
                    ) : null}

                    {sending && (
                      <div className="flex justify-start mb-10">
                        <div className="w-full max-w-[82%] sm:max-w-[72%] overflow-hidden rounded-[20px] border border-white/[0.07] bg-white/[0.03] backdrop-blur-xl">
                          {/* Stage indicator */}
                          <div className="flex items-center gap-3 border-b border-white/[0.05] px-5 py-3.5">
                            <div className="flex items-center gap-1.5">
                              <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/40" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-white/70" />
                              </span>
                            </div>
                            <span className="text-[11.5px] font-semibold text-white/45 transition-all duration-500">
                              {processingStages[processingStage]}
                            </span>
                          </div>

                          {/* Shimmer skeleton body */}
                          <div className="space-y-3 px-5 py-4">
                            {/* Wide line */}
                            <div className="relative h-3 overflow-hidden rounded-full bg-white/[0.05]">
                              <div className="absolute inset-y-0 -left-full w-full animate-[shimmerSlide_1.6s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/[0.10] to-transparent" />
                            </div>
                            {/* Medium line */}
                            <div className="relative h-3 w-[80%] overflow-hidden rounded-full bg-white/[0.05]">
                              <div className="absolute inset-y-0 -left-full w-full animate-[shimmerSlide_1.6s_ease-in-out_0.2s_infinite] bg-gradient-to-r from-transparent via-white/[0.10] to-transparent" />
                            </div>
                            {/* Short line */}
                            <div className="relative h-3 w-[55%] overflow-hidden rounded-full bg-white/[0.05]">
                              <div className="absolute inset-y-0 -left-full w-full animate-[shimmerSlide_1.6s_ease-in-out_0.4s_infinite] bg-gradient-to-r from-transparent via-white/[0.10] to-transparent" />
                            </div>

                            {/* Card skeletons */}
                            <div className="mt-4 grid gap-2 sm:grid-cols-2">
                              {[0, 1, 2, 3].map((i) => (
                                <div key={i} className="relative h-[62px] overflow-hidden rounded-[14px] border border-white/[0.05] bg-white/[0.03]">
                                  <div className="absolute inset-y-0 -left-full w-full animate-[shimmerSlide_1.6s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/[0.07] to-transparent"
                                    style={{ animationDelay: `${i * 0.12}s` }} />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── Premium Glass Dock — Publish · Feed · Search · People · Messages ── */}
            {isMounted && (() => {
              // Fixed-order dock — positions never change between renders.
              const dockItems: Array<{ id: string; label: string; Icon: React.ElementType; href?: string; onClick?: () => void }> = [
                ...(isAuthenticated && !guestMode
                  ? [{ id: 'publish', label: 'Publish', Icon: Plus, onClick: () => setShowPublishModal(true) }]
                  : []),
                { id: 'feed',     label: 'Feed',     Icon: Newspaper,      href: '/published' },
                { id: 'search',   label: 'Search',   Icon: Search,         onClick: () => {
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(new CustomEvent('homepage:open-search'));
                    }
                  } },
                { id: 'people',   label: 'People',   Icon: Users,          href: '/people' },
                ...(isAuthenticated && !guestMode
                  ? [{ id: 'messages', label: 'Messages', Icon: MessageSquare, href: '/messages' }]
                  : [{ id: 'signup',   label: 'Sign Up',  Icon: UserPlus,     href: '/signup' }]),
              ];
              const ordered = dockItems;

              return (
                <div
                  className="hidden sm:flex"
                  style={{
                    position: 'fixed',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    bottom: 22,
                    zIndex: 9999,
                    pointerEvents: composerHidden ? 'none' : 'auto',
                    opacity: composerHidden ? 0 : 1,
                    transition: 'opacity 0.32s cubic-bezier(0.4,0,0.2,1)',
                  }}
                >
                  <style dangerouslySetInnerHTML={{ __html: `
                    @keyframes dockSlideIn {
                      from { opacity: 0; transform: translateY(28px) scale(0.94); filter: blur(8px); }
                      to   { opacity: 1; transform: translateY(0) scale(1);    filter: blur(0); }
                    }
                    @keyframes dockItemPop {
                      from { opacity: 0; transform: translateY(10px) scale(0.85); }
                      to   { opacity: 1; transform: translateY(0)    scale(1);    }
                    }
                    .dock-shell {
                      animation: dockSlideIn 0.62s cubic-bezier(0.22, 1, 0.36, 1) both;
                    }
                    .dock-item {
                      position: relative;
                      display: flex; align-items: center; justify-content: center;
                      width: 46px; height: 46px; border-radius: 14px;
                      background: rgba(255,255,255,0.035);
                      border: 1px solid rgba(255,255,255,0.06);
                      color: #fff;
                      cursor: pointer; text-decoration: none;
                      flex-shrink: 0;
                      will-change: transform;
                      transition:
                        transform 0.42s cubic-bezier(0.22, 1.4, 0.36, 1),
                        background 0.28s ease,
                        box-shadow 0.32s ease,
                        border-color 0.28s ease;
                      animation: dockItemPop 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
                    }
                    .dock-item:hover {
                      transform: translateY(-10px) scale(1.18);
                      background: rgba(255,255,255,0.10);
                      border-color: rgba(255,255,255,0.18);
                      box-shadow:
                        0 18px 42px rgba(0,0,0,0.65),
                        inset 0 1px 0 rgba(255,255,255,0.08);
                    }
                    .dock-item:active { transform: translateY(-4px) scale(1.04); }
                    .dock-tip {
                      position: absolute; left: 50%; bottom: calc(100% + 14px);
                      transform: translateX(-50%) translateY(6px);
                      padding: 6px 11px; border-radius: 10px;
                      background: rgba(8,8,11,0.96);
                      border: 1px solid rgba(255,255,255,0.10);
                      backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
                      font-size: 11.5px; font-weight: 600; color: #fff;
                      white-space: nowrap; pointer-events: none;
                      opacity: 0;
                      letter-spacing: 0.01em;
                      box-shadow: 0 8px 24px rgba(0,0,0,0.55);
                      transition: opacity 0.18s ease, transform 0.26s cubic-bezier(0.22, 1, 0.36, 1);
                    }
                    .dock-item:hover .dock-tip {
                      opacity: 1;
                      transform: translateX(-50%) translateY(0);
                    }
                    .dock-dot {
                      position: absolute; bottom: 4px; left: 50%; transform: translateX(-50%);
                      width: 3px; height: 3px; border-radius: 999px;
                      background: rgba(255,255,255,0.85);
                      box-shadow: 0 0 8px rgba(255,255,255,0.6);
                    }
                  ` }} />
                  <div
                    className="dock-shell"
                    style={{
                      position: 'relative',
                      borderRadius: 22,
                      padding: '1.5px',
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.04) 30%, rgba(255,255,255,0.02) 60%, rgba(255,255,255,0.12) 100%)',
                      boxShadow: '0 28px 70px rgba(0,0,0,0.75), 0 8px 22px rgba(0,0,0,0.50)',
                    }}
                  >
                    <div style={{
                      position: 'relative',
                      display: 'flex', alignItems: 'flex-end', gap: 8,
                      padding: '10px 14px', borderRadius: 21,
                      background: 'rgba(8,8,11,0.82)',
                      backdropFilter: 'blur(28px) saturate(1.6)',
                      WebkitBackdropFilter: 'blur(28px) saturate(1.6)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                      {ordered.map((item, idx) => {
                        const Icon = item.Icon;
                        const isRecent = recentDockIds.includes(item.id);
                        const iconEl = (
                          <>
                            <Icon style={{ width: 20, height: 20, color: '#fff', strokeWidth: 1.75, position: 'relative', zIndex: 1 }} />
                            {isRecent && <span className="dock-dot" />}
                            <span className="dock-tip">{item.label}</span>
                          </>
                        );
                        if (item.href) {
                          return (
                            <Link
                              key={item.id}
                              href={item.href}
                              className="dock-item"
                              style={{ animationDelay: `${idx * 35}ms` }}
                              title={item.label}
                              onClick={() => trackDockUsage(item.id)}
                            >
                              {iconEl}
                            </Link>
                          );
                        }
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className="dock-item"
                            style={{ animationDelay: `${idx * 35}ms` }}
                            title={item.label}
                            onClick={() => { trackDockUsage(item.id); item.onClick?.(); }}
                          >
                            {iconEl}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ── Legacy composer (kept hidden to preserve refs & search infra) ── */}
            <div
              className="hidden"
              aria-hidden="true"
            >
              <div className="mx-auto max-w-5xl px-3 sm:px-6 md:px-8">
                <div className={`relative ${composerHidden ? 'pointer-events-none opacity-0' : 'pointer-events-auto opacity-100'}`}
                  style={{
                    borderRadius: 28,
                    padding: '3px',
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.025) 50%, rgba(255,255,255,0.06) 100%)',
                    boxShadow: '0 -1px 0 rgba(255,255,255,0.04), 0 32px 80px rgba(0,0,0,0.65), 0 8px 24px rgba(0,0,0,0.35)',
                  }}>
                  {/* Inner glass layer */}
                  <div style={{
                    borderRadius: 26,
                    padding: '12px 16px 12px 12px',
                    background: 'rgba(8,8,10,0.72)',
                    backdropFilter: 'blur(48px) saturate(1.8)',
                    WebkitBackdropFilter: 'blur(48px) saturate(1.8)',
                  }}>
                  {attachedDocument ? (
                    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/70 bg-slate-50/70 px-3 py-2 text-sm text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                      <Paperclip className="h-4 w-4" aria-hidden="true" />
                      <span className="flex-1 truncate font-semibold">{attachedDocument.name}</span>
                      <span className="rounded-full bg-slate-900/10 px-2.5 py-1 text-xs font-semibold dark:bg-white/10">
                        {(attachedDocument.mimeType || guessExtension(attachedDocument.name) || 'file').toUpperCase()}
                      </span>
                      <span className="rounded-full bg-slate-900/10 px-2.5 py-1 text-xs font-semibold dark:bg-white/10">
                        {formatBytes(attachedDocument.sizeBytes)}
                      </span>
                      <span className="rounded-full bg-slate-900/10 px-2.5 py-1 text-xs font-semibold dark:bg-white/10">
                        {uploadStage === 'ready' ? 'Ready' : uploadStage === 'error' ? 'Error' : uploadStage === 'analyzing' ? 'Analyzing' : 'Reading'}
                      </span>
                      <div className="w-full truncate text-xs text-slate-600 dark:text-slate-300">
                        Detected: {attachedDocument.meta?.documentTitle || 'Untitled'} • {attachedDocument.meta?.mainTopic || 'Topic unknown'} • {attachedDocument.meta?.language || 'Language unknown'} • {attachedDocument.meta?.intent || 'Intent unknown'}
                      </div>
                      <button
                        type="button"
                        onClick={() => setQuickEditorOpen(true)}
                        className="rounded-full bg-slate-900/10 px-2.5 py-1 text-xs font-semibold transition hover:bg-slate-900/15 dark:bg-white/10 dark:hover:bg-white/15"
                        title="Quick edit & export"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAttachedDocument(null);
                          setUploadStage('idle');
                          setUploadStatusLabel('');
                          setQuickEditorOpen(false);
                        }}
                        className="hover:text-slate-950 dark:hover:text-white"
                        aria-label="Remove document"
                        title="Remove document"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}
                  <div className="flex items-center gap-1 sm:gap-2" style={{ borderRadius: 18, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.04)', padding: '4px 4px 4px 10px' }}>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-white/40 transition hover:bg-white/[0.08] hover:text-white/80 active:scale-95"
                        title="Attach Document"
                      >
                        <Paperclip className="h-[15px] w-[15px]" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={toggleVoice}
                        className={`flex h-8 w-8 items-center justify-center rounded-full transition active:scale-95 ${voiceActive ? 'bg-white/10 text-white' : 'text-white/40 hover:bg-white/[0.08] hover:text-white/80'}`}
                        title="Voice Message"
                      >
                        <Mic className="h-[15px] w-[15px]" aria-hidden="true" />
                      </button>
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <button
                            type="button"
                            disabled={!attachedDocument || sending || uploadStage === 'reading' || uploadStage === 'analyzing'}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-white/40 transition hover:bg-white/[0.08] hover:text-white/80 disabled:opacity-30 active:scale-95"
                            title={attachedDocument ? 'Document actions' : 'Upload a document to enable actions'}
                          >
                            <Sparkles className="h-[15px] w-[15px] text-white/60" aria-hidden="true" />
                          </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content sideOffset={10} className="z-50 min-w-[220px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-white/10 dark:bg-slate-950">
                            {([
                              { label: 'Summary', action: 'summary' },
                              { label: 'Elaborate', action: 'elaborate' },
                              { label: 'Proofread', action: 'proofread' },
                              { label: 'Analyse', action: 'analyse' },
                              { label: 'Score', action: 'score' },
                              { label: 'Enterprise Review', action: 'enterprise' },
                              { label: 'Legal', action: 'legal' },
                              { label: 'Rewrite', action: 'rewrite' },
                            ] as Array<{ label: string; action: DocumentQuickAction }>).map((item) => (
                              <DropdownMenu.Item
                                key={item.action}
                                onSelect={() => void sendMessage({ action: item.action, message: '' })}
                                className="flex cursor-pointer select-none items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition hover:bg-slate-50 data-[highlighted]:bg-slate-50 dark:text-slate-100 dark:hover:bg-white/5 dark:data-[highlighted]:bg-white/5"
                              >
                                <span>{item.label}</span>
                                <span className="text-xs font-semibold text-slate-400">{item.action}</span>
                              </DropdownMenu.Item>
                            ))}
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    </div>

                    <div className="h-5 w-[1px] bg-white/[0.08] mx-0.5 hidden sm:block" />

                    <textarea
                      ref={inputRef}
                      value={draft}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDraft(val);
                        handleSearchChange(val, 'bottom');
                      }}
                      onFocus={() => {
                        if (draft.trim().length > 1) {
                          setShowBottomSuggestions(true);
                          handleSearchChange(draft, 'bottom');
                        }
                      }}
                      onBlur={() => setTimeout(() => setShowBottomSuggestions(false), 250)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void sendMessage();
                          setShowBottomSuggestions(false);
                        }
                      }}
                      placeholder={attachedDocument ? 'Ask about your document...' : 'Ask me anything...'}
                      className="min-h-[38px] flex-1 resize-none bg-transparent py-2.5 text-[13.5px] sm:text-sm text-white/90 placeholder:text-white/22 focus:outline-none"
                    />

                    <div className="flex shrink-0 items-center gap-1.5 pr-1">
                      <Link
                        href="/published"
                        className="group inline-flex h-8 items-center gap-1.5 rounded-[14px] border border-white/[0.12] bg-white/[0.06] px-3 text-[11.5px] font-semibold text-white/70 shadow-[0_2px_10px_rgba(0,0,0,0.3)] backdrop-blur-xl transition hover:bg-white/[0.10] hover:text-white hover:border-white/20 active:scale-95"
                        title="View all published items"
                      >
                        <Layers className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span className="hidden sm:inline">Published</span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => void sendMessage()}
                        disabled={sending || uploadStage === 'reading' || uploadStage === 'analyzing' || (!draft.trim() && !attachedDocument)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-[14px] bg-white text-[#0D0D0F] shadow-[0_2px_10px_rgba(255,255,255,0.12)] transition hover:scale-[1.06] hover:shadow-[0_4px_16px_rgba(255,255,255,0.18)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 active:scale-95"
                        aria-label="Send"
                        title="Send"
                      >
                        <Send className="h-3.5 w-3.5 ml-0.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {/* ── Search Results Dropdown ── */}
                  {showBottomSuggestions && draft.trim().length > 1 && (searchLoading || searchSuggestions.length > 0) && (() => {
                    // Category config: badge → { label, icon, accent, bg, border }
                    const CAT: Record<string, { label: string; accent: string; bg: string; border: string; dot: string }> = {
                      GIG:     { label: 'Gigs',        accent: '#fb923c', bg: 'rgba(251,146,60,0.12)',  border: 'rgba(251,146,60,0.25)',  dot: '#fb923c' },
                      RESUME:  { label: 'Talent',      accent: '#38bdf8', bg: 'rgba(56,189,248,0.12)',  border: 'rgba(56,189,248,0.25)',  dot: '#38bdf8' },
                      DOC:     { label: 'Documents',   accent: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.25)',  dot: '#60a5fa' },
                      SIGNED:  { label: 'Documents',   accent: '#34d399', bg: 'rgba(52,211,153,0.12)',  border: 'rgba(52,211,153,0.25)',  dot: '#34d399' },
                      TPL:     { label: 'Templates',   accent: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.25)', dot: '#a78bfa' },
                      KB:      { label: 'Knowledge',   accent: '#c084fc', bg: 'rgba(192,132,252,0.12)', border: 'rgba(192,132,252,0.25)', dot: '#c084fc' },
                      BLOG:    { label: 'Blog',        accent: '#2dd4bf', bg: 'rgba(45,212,191,0.12)',  border: 'rgba(45,212,191,0.25)',  dot: '#2dd4bf' },
                      SOURCE:  { label: 'Web',         accent: '#818cf8', bg: 'rgba(129,140,248,0.12)', border: 'rgba(129,140,248,0.25)', dot: '#818cf8' },
                      PUBLIC:  { label: 'Files',       accent: '#94a3b8', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.20)', dot: '#94a3b8' },
                      PRIVATE: { label: 'Files',       accent: '#f87171', bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.20)', dot: '#f87171' },
                      FILE:    { label: 'Files',       accent: '#94a3b8', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.20)', dot: '#94a3b8' },
                      FREE:    { label: 'Features',    accent: '#34d399', bg: 'rgba(52,211,153,0.10)',  border: 'rgba(52,211,153,0.20)',  dot: '#34d399' },
                      NEW:     { label: 'New',         accent: '#f472b6', bg: 'rgba(244,114,182,0.10)', border: 'rgba(244,114,182,0.20)', dot: '#f472b6' },
                      PERSON:  { label: 'People',      accent: '#34d399', bg: 'rgba(52,211,153,0.12)',  border: 'rgba(52,211,153,0.25)',  dot: '#34d399' },
                      SVC:     { label: 'Services',    accent: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.25)',  dot: '#fbbf24' },
                      DEFAULT: { label: 'Result',      accent: '#94a3b8', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.08)', dot: '#64748b' },
                    };
                    const getCat = (badge?: string) => CAT[(badge ?? '').toUpperCase()] ?? CAT.DEFAULT;

                    // Group results by category label
                    type GroupedResult = typeof searchSuggestions[0];
                    const groups: Record<string, GroupedResult[]> = {};
                    for (const r of searchSuggestions) {
                      const cat = getCat(r.badge);
                      (groups[cat.label] ??= []).push(r);
                    }
                    const groupOrder = ['Gigs', 'Services', 'Talent', 'People', 'Documents', 'Templates', 'Knowledge', 'Blog', 'Files', 'Web', 'Features', 'New', 'Result'];
                    const orderedGroups = groupOrder.filter((k) => groups[k]).map((k) => ({ label: k, items: groups[k] }));

                    return (
                      <div
                        style={{
                          position: 'absolute', bottom: 'calc(100% + 12px)', left: 0, right: 0,
                          zIndex: 60, borderRadius: 22, padding: '1.5px',
                          background: 'linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 60%, rgba(255,255,255,0.07) 100%)',
                          boxShadow: '0 -8px 40px rgba(0,0,0,0.60), 0 -2px 12px rgba(0,0,0,0.30)',
                          animation: 'searchDropIn 0.18s cubic-bezier(0.4,0,0.2,1)',
                        }}
                      >
                        <style>{`@keyframes searchDropIn{from{opacity:0;transform:translateY(8px) scale(0.99)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>
                        <div style={{ borderRadius: 21, overflow: 'hidden', background: 'rgba(8,8,11,0.94)', backdropFilter: 'blur(48px) saturate(1.8)', WebkitBackdropFilter: 'blur(48px) saturate(1.8)' }}>

                          {/* Header */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {searchLoading
                                ? <Loader2 style={{ width: 12, height: 12, color: 'rgba(255,255,255,0.30)', animation: 'spin 1s linear infinite' }} />
                                : <Search style={{ width: 12, height: 12, color: 'rgba(255,255,255,0.20)' }} />}
                              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase' }}>
                                {searchLoading ? 'Searching…' : `${searchSuggestions.length} result${searchSuggestions.length !== 1 ? 's' : ''} for "${draft.trim()}"`}
                              </span>
                            </div>
                            <button type="button" onClick={() => setShowBottomSuggestions(false)}
                              style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.20)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.08em', padding: '2px 6px', borderRadius: 6, transition: 'color 0.15s' }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.50)'; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.20)'; }}
                            >ESC</button>
                          </div>

                          {/* Loading skeleton */}
                          {searchLoading && searchSuggestions.length === 0 && (
                            <div style={{ padding: '10px 12px 12px' }}>
                              {[80, 65, 72, 55].map((w, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px' }}>
                                  <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.05)', flexShrink: 0, animation: 'pulse 1.5s ease-in-out infinite' }} />
                                  <div style={{ flex: 1 }}>
                                    <div style={{ height: 11, width: `${w}%`, borderRadius: 6, background: 'rgba(255,255,255,0.06)', marginBottom: 5, animation: 'pulse 1.5s ease-in-out infinite' }} />
                                    <div style={{ height: 8, width: `${w * 0.6}%`, borderRadius: 6, background: 'rgba(255,255,255,0.04)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* No results */}
                          {!searchLoading && searchSuggestions.length === 0 && (
                            <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                              <Search style={{ width: 24, height: 24, color: 'rgba(255,255,255,0.10)', margin: '0 auto 10px' }} />
                              <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.35)', margin: 0 }}>No results found</p>
                              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.18)', marginTop: 4 }}>Try different keywords or search by skill, name, or category</p>
                            </div>
                          )}

                          {/* Grouped results */}
                          {!searchLoading && orderedGroups.length > 0 && (
                            <div style={{ maxHeight: 420, overflowY: 'auto', padding: '8px 10px 12px', scrollbarWidth: 'none' }}>
                              {orderedGroups.map(({ label, items }) => {
                                const cat = getCat(items[0]?.badge);
                                return (
                                  <div key={label} style={{ marginBottom: 12 }}>
                                    {/* Group header */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px 6px' }}>
                                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cat.dot, flexShrink: 0 }} />
                                      <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.22em', color: cat.accent, textTransform: 'uppercase', opacity: 0.85 }}>{label}</span>
                                      <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${cat.border} 0%, transparent 100%)` }} />
                                      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.18)', fontWeight: 600 }}>{items.length}</span>
                                    </div>
                                    {/* Items */}
                                    {items.map((r) => (
                                      <a
                                        key={r.id}
                                        href={safeHref(r.href)}
                                        onClick={() => { setShowBottomSuggestions(false); setDraft(''); }}
                                        style={{
                                          display: 'flex', alignItems: 'center', gap: 10,
                                          padding: '8px 10px', borderRadius: 12, marginBottom: 2,
                                          textDecoration: 'none', transition: 'background 0.12s',
                                          cursor: 'pointer',
                                        }}
                                        onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = cat.bg; }}
                                        onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'; }}
                                      >
                                        {/* Icon */}
                                        <div style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: cat.bg, border: `1px solid ${cat.border}` }}>
                                          {(r.badge ?? '').toUpperCase() === 'GIG'    ? <Briefcase style={{ width: 14, height: 14, color: cat.accent }} /> :
                                           (r.badge ?? '').toUpperCase() === 'RESUME' ? <User       style={{ width: 14, height: 14, color: cat.accent }} /> :
                                           (r.badge ?? '').toUpperCase() === 'PERSON' ? <User       style={{ width: 14, height: 14, color: cat.accent }} /> :
                                           (r.badge ?? '').toUpperCase() === 'SVC'    ? <Briefcase  style={{ width: 14, height: 14, color: cat.accent }} /> :
                                           (r.badge ?? '').toUpperCase() === 'KB' || (r.badge ?? '').toUpperCase() === 'BLOG' ? <BookOpen style={{ width: 14, height: 14, color: cat.accent }} /> :
                                           (r.badge ?? '').toUpperCase() === 'SOURCE' ? <Globe      style={{ width: 14, height: 14, color: cat.accent }} /> :
                                           (r.badge ?? '').toUpperCase() === 'TPL'    ? <Sparkles   style={{ width: 14, height: 14, color: cat.accent }} /> :
                                                                                        <FileText   style={{ width: 14, height: 14, color: cat.accent }} />}
                                        </div>
                                        {/* Text */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'rgba(255,255,255,0.82)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</p>
                                          <p style={{ margin: 0, fontSize: 10.5, color: 'rgba(255,255,255,0.30)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>{r.description}</p>
                                        </div>
                                        {/* Badge pill */}
                                        {r.badge && (
                                          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase', color: cat.accent, background: cat.bg, border: `1px solid ${cat.border}`, borderRadius: 6, padding: '2px 7px', flexShrink: 0 }}>{r.badge}</span>
                                        )}
                                        <ArrowRight style={{ width: 12, height: 12, color: 'rgba(255,255,255,0.15)', flexShrink: 0 }} />
                                      </a>
                                    ))}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Footer hint */}
                          {!searchLoading && searchSuggestions.length > 0 && (
                            <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)' }}>Searching across gigs, talent, docs, templates, files & knowledge</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {assistantStatusLabel || uploadStatusLabel ? (
                    <div className="ml-auto flex items-center gap-2 rounded-2xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white dark:bg-white/10">
                      <span
                        className={[
                          'h-2 w-2 rounded-full animate-pulse',
                          assistantStatusLabel ? 'bg-slate-300 dark:bg-white' : uploadStage === 'ready' ? 'bg-emerald-400' : uploadStage === 'error' ? 'bg-rose-400' : 'bg-slate-400',
                        ].join(' ')}
                      />
                      {assistantStatusLabel || uploadStatusLabel}
                    </div>
                  ) : null}
                  </div>{/* /inner glass */}
                </div>{/* /gradient border */}
              </div>


            </div>
          </div>
        </div>
      </div>
    </main>

    {/* ── Account / Sign-out modal ── */}
    {accountModalOpen && (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => { setAccountModalOpen(false); setAccountModalStep('main'); setAccountModalPw(''); setAccountModalError(''); }}>
        <div className="w-full max-w-sm overflow-hidden rounded-[24px] border border-white/[0.09] bg-[#0D0D0F] shadow-[0_32px_80px_rgba(0,0,0,0.8)]" onClick={(e) => e.stopPropagation()}>

          {accountModalStep === 'main' && (
            <>
              <div className="px-6 pt-6 pb-4 border-b border-white/[0.07]">
                <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-white/[0.08] bg-white/[0.05] mb-4">
                  <User className="h-5 w-5 text-white/50" />
                </div>
                <p className="text-[15px] font-bold text-white">{session?.user?.name || 'Account'}</p>
                <p className="text-[12px] text-white/35 mt-0.5">{session?.user?.email}</p>
              </div>
              <div className="px-4 py-3 space-y-1">
                <button
                  type="button"
                  onClick={async () => {
                    setAccountModalLoading(true);
                    await signOut({ callbackUrl: '/onboarding' });
                  }}
                  disabled={accountModalLoading}
                  className="group flex w-full items-center gap-3 rounded-[13px] px-4 py-3 text-[13.5px] font-semibold text-white/70 transition hover:bg-white/[0.07] hover:text-white disabled:opacity-50"
                >
                  <LogOut className="h-4 w-4 shrink-0 text-white/40 group-hover:text-white/70" />
                  {accountModalLoading ? 'Signing out…' : 'Sign out'}
                </button>
                <button
                  type="button"
                  onClick={() => setAccountModalStep('deactivate')}
                  className="group flex w-full items-center gap-3 rounded-[13px] px-4 py-3 text-[13.5px] font-semibold text-amber-400/60 transition hover:bg-amber-500/[0.08] hover:text-amber-400"
                >
                  <X className="h-4 w-4 shrink-0 text-amber-400/40 group-hover:text-amber-400" />
                  Deactivate account
                </button>
                <button
                  type="button"
                  onClick={() => setAccountModalStep('delete')}
                  className="group flex w-full items-center gap-3 rounded-[13px] px-4 py-3 text-[13.5px] font-semibold text-rose-400/60 transition hover:bg-rose-500/[0.08] hover:text-rose-400"
                >
                  <X className="h-4 w-4 shrink-0 text-rose-400/40 group-hover:text-rose-400" />
                  Delete account
                </button>
              </div>
              <div className="px-4 pb-4">
                <button
                  type="button"
                  onClick={() => setAccountModalOpen(false)}
                  className="w-full rounded-[13px] border border-white/[0.08] bg-white/[0.04] py-2.5 text-[13px] font-medium text-white/40 transition hover:bg-white/[0.07] hover:text-white/70"
                >
                  Cancel
                </button>
              </div>
            </>
          )}

          {accountModalStep === 'deactivate' && (
            <>
              <div className="px-6 pt-6 pb-4 border-b border-white/[0.07]">
                <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-amber-500/20 bg-amber-500/[0.08] mb-4">
                  <X className="h-5 w-5 text-amber-400" />
                </div>
                <p className="text-[15px] font-bold text-white">Deactivate account?</p>
                <p className="text-[12.5px] text-white/40 mt-1.5 leading-relaxed">Your profile will be hidden and you won&apos;t be able to log in until you reactivate by contacting support. Your data is preserved.</p>
              </div>
              <div className="px-4 py-4 space-y-2">
                <button
                  type="button"
                  disabled={accountModalLoading}
                  onClick={async () => {
                    setAccountModalLoading(true);
                    setAccountModalError('');
                    try {
                      const res = await fetch('/api/account/deactivate', { method: 'POST' });
                      if (res.ok) { await signOut({ callbackUrl: '/onboarding' }); }
                      else { const d = await res.json() as { error?: string }; setAccountModalError(d.error ?? 'Failed'); }
                    } finally { setAccountModalLoading(false); }
                  }}
                  className="w-full rounded-[13px] bg-amber-500 py-3 text-[13.5px] font-bold text-black transition hover:bg-amber-400 disabled:opacity-60"
                >
                  {accountModalLoading ? 'Deactivating…' : 'Yes, deactivate my account'}
                </button>
                <button type="button" onClick={() => setAccountModalStep('main')} className="w-full rounded-[13px] border border-white/[0.08] bg-white/[0.04] py-2.5 text-[13px] font-medium text-white/40 transition hover:text-white/70">
                  Go back
                </button>
                {accountModalError && <p className="text-xs text-rose-400 text-center">{accountModalError}</p>}
              </div>
            </>
          )}

          {accountModalStep === 'delete' && (
            <>
              <div className="px-6 pt-6 pb-4 border-b border-white/[0.07]">
                <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-rose-500/20 bg-rose-500/[0.08] mb-4">
                  <X className="h-5 w-5 text-rose-400" />
                </div>
                <p className="text-[15px] font-bold text-white">Permanently delete account?</p>
                <p className="text-[12.5px] text-white/40 mt-1.5 leading-relaxed">This <span className="text-rose-400 font-semibold">cannot be undone</span>. All your data, documents, credits, and profile will be permanently erased. Enter your password to confirm.</p>
              </div>
              <div className="px-4 py-4 space-y-2">
                <input
                  type="password"
                  value={accountModalPw}
                  onChange={(e) => setAccountModalPw(e.target.value)}
                  placeholder="Enter your password"
                  className="h-11 w-full rounded-[13px] border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/25 outline-none focus:border-rose-500/40"
                />
                <button
                  type="button"
                  disabled={accountModalLoading || !accountModalPw}
                  onClick={async () => {
                    setAccountModalLoading(true);
                    setAccountModalError('');
                    try {
                      const res = await fetch('/api/account/delete', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmPassword: accountModalPw }) });
                      if (res.ok) { await signOut({ callbackUrl: '/onboarding' }); }
                      else { const d = await res.json() as { error?: string }; setAccountModalError(d.error ?? 'Failed'); }
                    } finally { setAccountModalLoading(false); }
                  }}
                  className="w-full rounded-[13px] bg-rose-600 py-3 text-[13.5px] font-bold text-white transition hover:bg-rose-500 disabled:opacity-60"
                >
                  {accountModalLoading ? 'Deleting…' : 'Delete my account forever'}
                </button>
                <button type="button" onClick={() => { setAccountModalStep('main'); setAccountModalPw(''); setAccountModalError(''); }} className="w-full rounded-[13px] border border-white/[0.08] bg-white/[0.04] py-2.5 text-[13px] font-medium text-white/40 transition hover:text-white/70">
                  Go back
                </button>
                {accountModalError && <p className="text-xs text-rose-400 text-center">{accountModalError}</p>}
              </div>
            </>
          )}

        </div>
      </div>
    )}

    {/* ── Chat history modal (moved out of sidebar to avoid overflow-hidden clipping) ── */}
    {chatHistoryOpen && (
      <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
        <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-white/10 bg-[#0D0D0F] shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <div className="text-sm font-semibold text-white">All chats</div>
              <div className="mt-1 text-xs text-white/40">Search and open your full chat history.</div>
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10"
              onClick={() => setChatHistoryOpen(false)}
              aria-label="Close history"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4">
            <input
              value={chatHistoryQuery}
              onChange={(e) => setChatHistoryQuery(e.target.value)}
              placeholder="Search chats by title…"
              className="h-10 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-white placeholder:text-white/35 focus:border-white/20 focus:outline-none"
            />
            <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1 scrollbar-minimal">
              {(threads || [])
                .filter((t) => {
                  const q = chatHistoryQuery.trim().toLowerCase();
                  if (!q) return true;
                  return (t.title || '').toLowerCase().includes(q) || (t.preview || '').toLowerCase().includes(q);
                })
                .map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { setChatHistoryOpen(false); loadThread(t.id); }}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm transition hover:bg-white/10"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-white">{t.title}</div>
                        <div className="mt-1 line-clamp-1 text-xs text-slate-400">{t.preview}</div>
                      </div>
                      <div className="shrink-0 text-xs font-semibold text-slate-400">{formatRelative(t.updatedAt)}</div>
                    </div>
                  </button>
                ))}
              {isAuthenticated && threads.length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-slate-300">
                  No chats yet. Start a new chat to see history here.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )}

    {/* ── Secure Sharing overlay (portal, avoids overflow clipping) ── */}
    {/* ── PDF Studio portal ── */}
    {isMounted && createPortal(
      <>
        <div
          onClick={() => setPdfStudioOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(15,23,42,0.55)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            opacity: pdfStudioOpen ? 1 : 0,
            pointerEvents: pdfStudioOpen ? 'auto' : 'none',
            transition: 'opacity 0.25s cubic-bezier(0.4,0,0.2,1)',
          }}
        />
        <div
          style={{
            position: 'fixed', inset: '5dvh 0 0',
            zIndex: 10001,
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '0 12px',
            pointerEvents: pdfStudioOpen ? 'auto' : 'none',
          }}
        >
          <div
            style={{
              width: '100%', maxWidth: 1200,
              height: '95dvh',
              borderRadius: '20px 20px 0 0',
              overflow: 'hidden',
              boxShadow: '0 -24px 80px rgba(15,23,42,0.22), 0 0 0 1px rgba(15,23,42,0.08)',
              opacity: pdfStudioOpen ? 1 : 0,
              transform: pdfStudioOpen ? 'translateY(0)' : 'translateY(32px)',
              transition: 'opacity 0.28s cubic-bezier(0.32,0.72,0,1), transform 0.28s cubic-bezier(0.32,0.72,0,1)',
            }}
          >
            {pdfStudioOpen && <PdfStudio onClose={() => setPdfStudioOpen(false)} darkMode={false} />}
          </div>
        </div>
      </>,
      document.body,
    )}

    {showVisualizerModal && (
      <DocumentVisualizerModal
        open={showVisualizerModal}
        onClose={() => setShowVisualizerModal(false)}
      />
    )}

    {/* ── Forms Studio portal ── */}
    {isMounted && createPortal(
      <>
        <div
          onClick={() => setFormsStudioOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(13,13,15,0.80)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            opacity: formsStudioOpen ? 1 : 0,
            pointerEvents: formsStudioOpen ? 'auto' : 'none',
            transition: 'opacity 0.25s cubic-bezier(0.4,0,0.2,1)',
          }}
        />
        <div
          style={{
            position: 'fixed', inset: '5dvh 0 0',
            zIndex: 10001,
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '0 max(0px, calc((100vw - 1100px) / 2))',
            pointerEvents: formsStudioOpen ? 'auto' : 'none',
          }}
        >
          <div
            style={{
              width: '100%', maxWidth: 1100,
              height: '95dvh',
              borderRadius: '20px 20px 0 0',
              overflow: 'hidden',
              background: '#0D0D0F',
              boxShadow: '0 -24px 80px rgba(0,0,0,0.60), 0 0 0 1px rgba(255,255,255,0.06)',
              opacity: formsStudioOpen ? 1 : 0,
              transform: formsStudioOpen ? 'translateY(0)' : 'translateY(32px)',
              transition: 'opacity 0.28s cubic-bezier(0.32,0.72,0,1), transform 0.28s cubic-bezier(0.32,0.72,0,1)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            {/* Header bar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 20px',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 9,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.88)', letterSpacing: '-0.02em' }}>Forms Studio</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.32)', letterSpacing: '0.18em', textTransform: 'uppercase', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 20 }}>Beta</span>
              </div>
              <button
                type="button"
                onClick={() => setFormsStudioOpen(false)}
                style={{
                  width: 28, height: 28, borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: 'rgba(255,255,255,0.06)',
                  color: 'rgba(255,255,255,0.50)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            {/* Content */}
            <div style={{ flex: 1, overflow: 'auto', padding: 'clamp(12px, 3vw, 24px)' }}>
              {formsStudioOpen && <FormsCenter />}
            </div>
          </div>
        </div>
      </>,
      document.body,
    )}

    {isMounted && createPortal(
      <>
        {/* Backdrop */}
        <div
          onClick={() => setSecureSharingOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(0,0,0,0.82)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            opacity: secureSharingOpen ? 1 : 0,
            pointerEvents: secureSharingOpen ? 'auto' : 'none',
            transition: 'opacity 0.28s cubic-bezier(0.4,0,0.2,1)',
          }}
        />
        {/* Panel */}
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 10001,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            pointerEvents: secureSharingOpen ? 'auto' : 'none',
          }}
        >
          <div
            style={{
              width: '100%', maxWidth: 900,
              maxHeight: '92dvh',
              borderRadius: '24px 24px 0 0',
              background: '#0D0D0F',
              border: '1px solid rgba(255,255,255,0.09)',
              borderBottom: 'none',
              boxShadow: '0 -32px 80px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.03)',
              overflowY: 'auto',
              opacity: secureSharingOpen ? 1 : 0,
              transform: secureSharingOpen ? 'translateY(0)' : 'translateY(40px)',
              transition: 'opacity 0.30s cubic-bezier(0.32,0.72,0,1), transform 0.30s cubic-bezier(0.32,0.72,0,1)',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '20px 24px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
              position: 'sticky', top: 0, background: '#0D0D0F', zIndex: 1,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.10)',
                }}>
                  <FolderLock style={{ width: 16, height: 16, color: 'rgba(255,255,255,0.75)' }} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>Secure Sharing</div>
                  <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>Send files with password protection, expiry links &amp; full tracking</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSecureSharingOpen(false)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 30, height: 30, borderRadius: 8,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  cursor: 'pointer', color: 'rgba(255,255,255,0.5)',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.12)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; }}
              >
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
            {/* Content */}
            <div style={{ padding: '20px 16px 32px' }}>
              {secureSharingOpen && <FileTransferCenter />}
            </div>
          </div>
        </div>
      </>,
      document.body
    )}

    {/* ── GlobalBottomNav Tools button wiring ── */}
    {/* The global nav lives in layout.tsx; when Tools is tapped it fires a custom event.
        We listen here so the homepage tools drawer opens correctly. */}

    {/* ── All Tools Drawer (mobile) ── */}
    {isMounted && createPortal(
      <>
        <style>{`
          @keyframes at-sheet-in {
            from { transform: translateY(100%); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
          }
          @keyframes at-bd-in { from { opacity: 0; } to { opacity: 1; } }
          .at-tile {
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            gap: 8px; padding: 14px 6px 12px;
            border-radius: 16px;
            border: 1px solid rgba(255,255,255,0.06);
            background: rgba(255,255,255,0.028);
            cursor: pointer;
            -webkit-tap-highlight-color: transparent;
            will-change: transform;
            transition: transform 0.18s cubic-bezier(0.22,1,0.36,1), background 0.14s ease;
          }
          .at-tile:active { transform: scale(0.91); background: rgba(255,255,255,0.07); }
          .at-link {
            display: flex; align-items: center; gap: 9px;
            padding: 10px 12px; border-radius: 12px;
            border: 1px solid rgba(255,255,255,0.06);
            background: rgba(255,255,255,0.022);
            text-decoration: none;
            -webkit-tap-highlight-color: transparent;
            transition: background 0.14s ease;
          }
          .at-link:active { background: rgba(255,255,255,0.07); }
        `}</style>

        {/* Backdrop */}
        {mobileToolsDrawerOpen && (
          <div
            onClick={() => setMobileToolsDrawerOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 10000,
              background: 'rgba(0,0,0,0.80)',
              backdropFilter: 'blur(14px) saturate(1.4)',
              WebkitBackdropFilter: 'blur(14px) saturate(1.4)',
              animation: 'at-bd-in 0.20s ease both',
            }}
          />
        )}

        {/* Sheet */}
        {mobileToolsDrawerOpen && (
          <div
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10001,
              background: 'rgba(5,5,8,0.98)',
              backdropFilter: 'blur(80px) saturate(2.2)',
              WebkitBackdropFilter: 'blur(80px) saturate(2.2)',
              borderRadius: '28px 28px 0 0',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              borderLeft: '1px solid rgba(255,255,255,0.05)',
              borderRight: '1px solid rgba(255,255,255,0.05)',
              boxShadow: '0 -40px 100px rgba(0,0,0,0.90), 0 -1px 0 rgba(255,255,255,0.07)',
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)',
              animation: 'at-sheet-in 0.36s cubic-bezier(0.22,1,0.36,1) both',
            }}
          >
            {/* Drag handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 0' }}>
              <div style={{ width: 42, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.12)' }} />
            </div>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px 16px' }}>
              <div>
                <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)' }}>Platform</p>
                <h2 style={{ margin: '2px 0 0', fontSize: 19, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.15 }}>All Features</h2>
              </div>
              <button
                type="button"
                onClick={() => setMobileToolsDrawerOpen(false)}
                style={{
                  width: 32, height: 32, borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.05)',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <X style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.40)' }} />
              </button>
            </div>

            {/* ── Flat 4-col grid — all features, no scrolling ── */}
            <div style={{ padding: '0 14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {([
                  { label: 'AI Chat',      Icon: Sparkles,      ic: '#a78bfa', ib: 'rgba(124,58,237,0.20)',  action: () => window.location.assign('/') },
                  { label: 'Documents',    Icon: FileText,      ic: '#60a5fa', ib: 'rgba(59,130,246,0.18)',  action: () => window.location.assign('/docword') },
                  { label: 'Ddrive',       Icon: DdriveIconTile, ic: '#a78bfa', ib: 'rgba(139,92,246,0.18)',  action: () => setFileDriveOpen(true) },
                  { label: 'DocSheets',    Icon: Sheet,         ic: '#34d399', ib: 'rgba(52,211,153,0.18)',  action: () => setShowDocSheet(true) },
                  { label: 'PDF Editor',   Icon: Wand2,         ic: '#f87171', ib: 'rgba(239,68,68,0.16)',   action: () => setPdfStudioOpen(true) },
                  { label: 'Forms',        Icon: FormInput,     ic: '#22d3ee', ib: 'rgba(6,182,212,0.16)',   action: () => setFormsStudioOpen(true) },
                  { label: 'E‑Sign',       Icon: FileSignature, ic: '#818cf8', ib: 'rgba(99,102,241,0.18)',  action: () => setESignStudioOpen(true) },
                  { label: 'Secure Share', Icon: FolderLock,    ic: '#4ade80', ib: 'rgba(34,197,94,0.16)',   action: () => setSecureSharingOpen(true) },
                  { label: 'Visualizer',   Icon: LayoutGrid,    ic: '#c084fc', ib: 'rgba(168,85,247,0.18)',  action: () => setShowVisualizerModal(true) },
                  { label: 'Scratchpad',   Icon: PenLine,       ic: '#fb923c', ib: 'rgba(249,115,22,0.16)',  action: () => setShowScratchpad(true) },
                  { label: 'People',       Icon: Users,         ic: '#2dd4bf', ib: 'rgba(20,184,166,0.16)',  action: () => window.location.assign('/people') },
                  { label: 'Feed',         Icon: Newspaper,     ic: '#f472b6', ib: 'rgba(236,72,153,0.16)',  action: () => window.location.assign('/published') },
                ] as Array<{ label: string; Icon: React.ElementType; ic: string; ib: string; action: () => void }>).map(item => (
                  <button
                    key={item.label}
                    type="button"
                    className="at-tile"
                    onClick={() => { item.action(); setMobileToolsDrawerOpen(false); }}
                  >
                    <div style={{
                      width: 42, height: 42, borderRadius: 13,
                      background: item.ib,
                      border: `1px solid ${item.ic}22`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <item.Icon style={{ width: 19, height: 19, color: item.ic, strokeWidth: 1.8 }} />
                    </div>
                    <span style={{
                      fontSize: 10.5, fontWeight: 600,
                      color: 'rgba(255,255,255,0.62)',
                      textAlign: 'center', lineHeight: 1.2,
                      letterSpacing: '-0.01em',
                    }}>
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>

              {/* ── Quick links strip ── */}
              <div style={{ display: 'flex', gap: 7, marginTop: 12, marginBottom: 2 }}>
                {([
                  { label: 'Pricing',  Icon: Package,    href: '/pricing' },
                  { label: 'Settings', Icon: Settings,   href: '/workspace' },
                  { label: 'Support',  Icon: HelpCircle, href: '/support' },
                  ...(isAuthenticated && !guestMode
                    ? [{ label: 'Profile', Icon: User,    href: '/profile' }]
                    : [{ label: 'Join',    Icon: UserPlus, href: '/onboarding' }]),
                ] as Array<{ label: string; Icon: React.ElementType; href: string }>).map(item => (
                  <a
                    key={item.label}
                    href={item.href}
                    className="at-link"
                    onClick={() => setMobileToolsDrawerOpen(false)}
                    style={{ flex: 1 }}
                  >
                    <item.Icon style={{ width: 13, height: 13, color: 'rgba(255,255,255,0.38)', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.52)', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
                      {item.label}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}
      </>,
      document.body
    )}
    </>
  );
}

