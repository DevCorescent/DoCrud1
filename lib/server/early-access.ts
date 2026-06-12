import crypto from 'node:crypto';
import {
  earlyAccessFeaturesPath,
  earlyAccessWaitlistPath,
  earlyAccessWishesPath,
  earlyAccessOtpsPath,
  readJsonFile,
  writeJsonFile,
} from '@/lib/server/storage';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EarlyAccessFeature {
  id: string;
  title: string;
  tagline: string;
  description: string;
  category: string;
  tags: string[];
  features?: string[];
  status: 'coming_soon' | 'beta' | 'live';
  eta: string;
  icon: string;
  accentColor: string;
  featured: boolean;
  order: number;
  waitlistCount: number;
  wishCount: number;
  createdAt: string;
  updatedAt?: string;
}

export interface WaitlistEntry {
  id: string;
  featureId: string;
  email: string;
  name: string;
  verified: boolean;
  verifiedAt?: string;
  createdAt: string;
}

export interface FeatureWish {
  id: string;
  featureId: string;
  email: string;
  name: string;
  currentSoftware: string;
  painPoints: string;
  expectedFeatures: string;
  excitement: number;
  createdAt: string;
}

interface EarlyAccessOtpSession {
  id: string;
  email: string;
  featureId: string;
  otpHash: string;
  otpSalt: string;
  createdAt: string;
  expiresAt: string;
  attempts: number;
  verifiedAt?: string;
}

// ── Default features seeded on first load ─────────────────────────────────────

const SEED_FEATURES: EarlyAccessFeature[] = [
  {
    id: 'ai-document-gen',
    title: 'AI Document Generation',
    tagline: 'Create any document with a single prompt',
    description: 'Generate complete, professionally crafted documents from natural language. Contracts, reports, proposals, offer letters — all produced by AI in seconds and fully editable.',
    category: 'AI & Automation',
    tags: ['AI', 'Documents', 'Automation'],
    features: [
      'Generate contracts, reports & offers from one-line prompts',
      'AI fills fields from your company context & past docs',
      'Multi-language document output (20+ languages)',
      'Clause & compliance suggestions while you write',
      'Editable, formatted output — ready to send instantly',
    ],
    status: 'coming_soon',
    eta: 'Q3 2026',
    icon: 'Sparkles',
    accentColor: 'amber',
    featured: true,
    order: 1,
    waitlistCount: 0,
    wishCount: 0,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'smart-templates',
    title: 'Smart Template Studio',
    tagline: 'AI builds templates from your description',
    description: 'Describe the document you need in plain language and get a fully built, styled template instantly. The AI learns from your edits and continuously improves suggestions.',
    category: 'AI & Automation',
    tags: ['AI', 'Templates', 'No-code'],
    features: [
      'Describe in plain English → get a production-ready template',
      'AI learns from your edits and style preferences over time',
      'One-click dynamic variables from your contact book',
      'Conditional sections and logic blocks — no code needed',
      'Share templates across your team or publish publicly',
    ],
    status: 'coming_soon',
    eta: 'Q3 2026',
    icon: 'Wand2',
    accentColor: 'fuchsia',
    featured: false,
    order: 2,
    waitlistCount: 0,
    wishCount: 0,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'doc-intelligence',
    title: 'Document Intelligence',
    tagline: 'Extract, understand & act on any document',
    description: 'Upload PDFs, scanned papers, or images and automatically extract structured data, summarize content, detect key entities, and populate templates instantly with AI.',
    category: 'AI & Automation',
    tags: ['AI', 'OCR', 'Extraction', 'Intelligence'],
    features: [
      'Extract tables, dates & line items from any PDF or image',
      'Structured JSON output from unstructured documents',
      'Scanned paper & handwriting recognition (OCR)',
      'Auto-populate templates directly from uploaded files',
      'Smart field detection and entity mapping',
    ],
    status: 'coming_soon',
    eta: 'Q4 2026',
    icon: 'Brain',
    accentColor: 'cyan',
    featured: false,
    order: 3,
    waitlistCount: 0,
    wishCount: 0,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'realtime-collab',
    title: 'Real-time Collaboration',
    tagline: 'Build documents together, live',
    description: 'Work simultaneously with your team on any document. Live cursors, instant edits, inline comments, conflict-free merging, and complete version history — built for distributed teams.',
    category: 'Team & Collaboration',
    tags: ['Collaboration', 'Team', 'Real-time'],
    features: [
      'Live multi-user cursors and real-time presence indicators',
      'Inline comments and threaded discussions per section',
      'Merge conflict detection and automatic resolution',
      'Named version checkpoints and full history replay',
      '@mention teammates with instant in-app notifications',
    ],
    status: 'coming_soon',
    eta: 'Q3 2026',
    icon: 'Users',
    accentColor: 'sky',
    featured: true,
    order: 4,
    waitlistCount: 0,
    wishCount: 0,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'teams-enterprise',
    title: 'Docrud for Teams',
    tagline: 'One workspace for your entire organization',
    description: 'Org-wide accounts with SSO, fine-grained RBAC, document approval workflows, shared template libraries, team billing, and a centralized admin dashboard.',
    category: 'Team & Collaboration',
    tags: ['Teams', 'SSO', 'Enterprise', 'RBAC'],
    features: [
      'Single Sign-On (SAML 2.0, Google & Microsoft)',
      'Role-based access control (RBAC) down to template level',
      'Multi-step document approval workflows with audit log',
      'Shared template & snippet libraries across the org',
      'Centralized admin dashboard with usage analytics',
    ],
    status: 'coming_soon',
    eta: 'Q4 2026',
    icon: 'Building2',
    accentColor: 'indigo',
    featured: false,
    order: 5,
    waitlistCount: 0,
    wishCount: 0,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'advanced-esign',
    title: 'Advanced E-Signatures',
    tagline: 'Aadhaar eKYC & biometric signing',
    description: 'Court-admissible digital signatures with Aadhaar-based identity verification, biometric authentication, OTP-stamped audit trails, and full legal compliance under the IT Act.',
    category: 'Security & Compliance',
    tags: ['eSign', 'Aadhaar', 'Legal', 'Compliance'],
    features: [
      'Aadhaar OTP-based identity verification (eKYC)',
      'Biometric facial recognition for high-value documents',
      'Geo-stamped, time-locked tamper-proof audit trails',
      'Court-admissible under IT Act 2000 & eSign Act',
      'Multi-party signature workflows with custom order',
    ],
    status: 'coming_soon',
    eta: 'Q3 2026',
    icon: 'ShieldCheck',
    accentColor: 'rose',
    featured: false,
    order: 6,
    waitlistCount: 0,
    wishCount: 0,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'gst-compliance',
    title: 'GST & Compliance Suite',
    tagline: 'India-first regulatory automation',
    description: 'Auto-generate GST invoices, e-way bills, MSME forms, and compliance documents. Direct GST portal integration, automated TDS calculations, and e-filing ready exports.',
    category: 'Security & Compliance',
    tags: ['GST', 'Compliance', 'India', 'Finance'],
    features: [
      'GSTIN-verified invoice generation with IRN & QR code',
      'e-Way bill generation and direct GSTN portal push',
      'TDS & TCS auto-calculation with ledger entries',
      'MSME, startup & regulatory compliance document library',
      'e-Filing ready exports for CA and compliance teams',
    ],
    status: 'coming_soon',
    eta: 'Q1 2027',
    icon: 'FileCheck2',
    accentColor: 'teal',
    featured: true,
    order: 7,
    waitlistCount: 0,
    wishCount: 0,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'mobile-apps',
    title: 'Native Mobile Apps',
    tagline: 'Full docrud on iOS & Android',
    description: 'Generate, sign, and manage documents from anywhere. Offline support, biometric authentication, camera-based document scanning, and real-time push notifications.',
    category: 'Mobile',
    tags: ['iOS', 'Android', 'Mobile'],
    features: [
      'Full-feature iOS & Android native apps (not a web wrapper)',
      'Offline document generation and editing with auto-sync',
      'Camera-based HD document scanning with auto-crop',
      'Biometric app lock and remote wipe for lost devices',
      'Real-time push notifications for signatures & document views',
    ],
    status: 'coming_soon',
    eta: 'Q4 2026',
    icon: 'Smartphone',
    accentColor: 'emerald',
    featured: false,
    order: 8,
    waitlistCount: 0,
    wishCount: 0,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'developer-api',
    title: 'Developer API & SDK',
    tagline: 'Build docrud into your stack',
    description: 'Full REST API with webhooks, SDKs for JavaScript, Python, and Go. Automate document generation from your CRM, ERP, or internal tools with one integration.',
    category: 'Developer',
    tags: ['API', 'SDK', 'Webhooks', 'Developer'],
    features: [
      'Full REST API with OpenAPI 3.0 specification & sandbox',
      'Official SDKs for JavaScript / TypeScript, Python & Go',
      'Webhooks for all events — signed, viewed, expired, failed',
      'Postman collections and interactive API docs',
      'White-label embeddable document editor via iframe SDK',
    ],
    status: 'coming_soon',
    eta: 'Q3 2026',
    icon: 'Code2',
    accentColor: 'violet',
    featured: true,
    order: 9,
    waitlistCount: 0,
    wishCount: 0,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'bulk-processing',
    title: 'Bulk Document Processing',
    tagline: 'Thousands of documents in minutes',
    description: 'Upload a spreadsheet, select a template, and generate thousands of personalized documents at once. Certificates, offer letters, invoices, or any document — at scale.',
    category: 'Automation',
    tags: ['Bulk', 'Automation', 'Scale'],
    features: [
      'Upload CSV/XLS → generate 10,000+ documents in minutes',
      'Per-row dynamic field substitution with formula support',
      'Batch e-sign with individual audit trails per document',
      'ZIP download or individual email delivery per recipient',
      'Progress dashboard with failure recovery and retry',
    ],
    status: 'coming_soon',
    eta: 'Q4 2026',
    icon: 'Zap',
    accentColor: 'yellow',
    featured: false,
    order: 10,
    waitlistCount: 0,
    wishCount: 0,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'white-label',
    title: 'White Label Solution',
    tagline: 'Deploy docrud under your brand',
    description: 'Full white-label deployment with your brand, domain, colors, and logo. Manage clients under your own platform — entirely powered by docrud infrastructure behind the scenes.',
    category: 'Enterprise',
    tags: ['White Label', 'Enterprise', 'Custom Brand'],
    features: [
      'Your domain, logo, brand colors & custom email sender',
      'Client-facing portals under your own brand identity',
      'Reseller pricing management and multi-tenant billing',
      'Fully branded PDF headers, footers & email notifications',
      'Full API access for deep custom integrations',
    ],
    status: 'coming_soon',
    eta: 'Q1 2027',
    icon: 'Layers',
    accentColor: 'orange',
    featured: false,
    order: 11,
    waitlistCount: 0,
    wishCount: 0,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'doc-analytics',
    title: 'Document Analytics',
    tagline: 'Know exactly how documents perform',
    description: 'Track opens, time-on-page, section engagement, and signer behavior. Get notified the moment your document is viewed and see heatmaps showing what recipients actually read.',
    category: 'Analytics',
    tags: ['Analytics', 'Tracking', 'Insights'],
    features: [
      'Real-time open tracking with device and location context',
      'Time-on-page and section-level engagement heatmaps',
      'Signer behavior tracking and drop-off analysis',
      'Instant Slack / email alerts when your document is viewed',
      'CRM-ready analytics export (CSV & webhook)',
    ],
    status: 'coming_soon',
    eta: 'Q4 2026',
    icon: 'BarChart3',
    accentColor: 'pink',
    featured: false,
    order: 12,
    waitlistCount: 0,
    wishCount: 0,
    createdAt: new Date().toISOString(),
  },
  // ── CRM ──────────────────────────────────────────────────────────────────────
  {
    id: 'docrud-crm',
    title: 'Docrud CRM',
    tagline: 'Your full pipeline — contacts, deals, and follow-ups in one place',
    description: 'A purpose-built CRM that connects directly to your documents, proposals, and e-signatures. Track deals from first touch to closed-won without leaving docrud.',
    category: 'CRM',
    tags: ['CRM', 'Deals', 'Pipeline', 'Sales'],
    features: [
      'Visual Kanban and list pipeline with drag-and-drop deal stages',
      'One-click document & proposal generation from any contact',
      'Auto-link sent documents to deal records with engagement data',
      'Smart follow-up reminders based on document open signals',
      'Custom fields, tags, and activity timeline per contact',
      'CSV import from HubSpot, Zoho, Salesforce & more',
    ],
    status: 'coming_soon',
    eta: 'Q3 2026',
    icon: 'Users',
    accentColor: 'sky',
    featured: true,
    order: 13,
    waitlistCount: 0,
    wishCount: 0,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'crm-email-sequences',
    title: 'CRM Email Sequences',
    tagline: 'Automated follow-up drips tied to your deals',
    description: 'Set up multi-step email sequences triggered by deal stage, document open, or time delay. Write once, follow up forever — with personalization at scale.',
    category: 'CRM',
    tags: ['Email', 'Automation', 'Sequences'],
    features: [
      'Multi-step drip campaigns with conditional branching',
      'Trigger sequences on document view, sign, or link click',
      'AI-generated email copy based on deal context',
      'Unsubscribe and compliance management built in',
      'Open, click, and reply rate tracking per sequence',
    ],
    status: 'coming_soon',
    eta: 'Q4 2026',
    icon: 'Mail',
    accentColor: 'indigo',
    featured: false,
    order: 14,
    waitlistCount: 0,
    wishCount: 0,
    createdAt: new Date().toISOString(),
  },
  // ── HRM ──────────────────────────────────────────────────────────────────────
  {
    id: 'docrud-hrm',
    title: 'Docrud HRM',
    tagline: 'Full employee lifecycle — hire, onboard, manage, and offboard',
    description: 'An integrated HR management system built for modern teams. Automate offer letters, employment contracts, leave policies, and performance documents — all e-signed and audit-ready.',
    category: 'HRM',
    tags: ['HR', 'Employees', 'Onboarding', 'Payroll'],
    features: [
      'Digital onboarding with auto-generated offer letters & contracts',
      'Leave and attendance tracking with manager approval workflows',
      'Performance review templates with e-signature collection',
      'Employee self-service portal for documents and payslips',
      'Compliance-ready separation letters and full offboarding flow',
      'Integration with payroll providers (Razorpay, Zoho Payroll)',
    ],
    status: 'coming_soon',
    eta: 'Q4 2026',
    icon: 'Building2',
    accentColor: 'emerald',
    featured: true,
    order: 15,
    waitlistCount: 0,
    wishCount: 0,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'hrm-payslip-generator',
    title: 'Payslip & Salary Generator',
    tagline: 'Branded payslips, auto-calculated, e-signed in seconds',
    description: 'Generate professional payslips with automatic PF, ESI, TDS, and HRA calculations. Bulk-generate and deliver to every employee with a single click.',
    category: 'HRM',
    tags: ['Payslip', 'Salary', 'TDS', 'Compliance'],
    features: [
      'Auto-calculate PF, ESI, TDS, HRA, and custom allowances',
      'Branded payslip templates with your company logo',
      'Bulk generate and email to all employees at once',
      'Form 16 generation and year-end tax summary export',
      'Audit trail with employee acknowledgement e-signature',
    ],
    status: 'coming_soon',
    eta: 'Q1 2027',
    icon: 'FileCheck2',
    accentColor: 'teal',
    featured: false,
    order: 16,
    waitlistCount: 0,
    wishCount: 0,
    createdAt: new Date().toISOString(),
  },
  // ── Invoicer ─────────────────────────────────────────────────────────────────
  {
    id: 'docrud-invoicer',
    title: 'Docrud Invoicer',
    tagline: 'Professional invoicing with payment links and auto-reminders',
    description: 'Create, send, and track invoices end-to-end. Collect payments via Razorpay, UPI, or Stripe. Auto-send reminders, track who paid, and reconcile instantly.',
    category: 'Invoicer',
    tags: ['Invoices', 'Payments', 'Razorpay', 'UPI'],
    features: [
      'Branded invoice creation with line items, GST, and discounts',
      'Embedded payment link — Razorpay, UPI, Stripe, and NEFT',
      'Automated overdue reminders with escalation schedules',
      'Real-time payment status tracking and reconciliation',
      'Recurring invoice schedules for retainer clients',
      'Export to Tally, QuickBooks, and Zoho Books',
    ],
    status: 'coming_soon',
    eta: 'Q3 2026',
    icon: 'BarChart3',
    accentColor: 'amber',
    featured: true,
    order: 17,
    waitlistCount: 0,
    wishCount: 0,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'invoicer-estimates',
    title: 'Estimates & Quotations',
    tagline: 'Win projects faster with professional quotes',
    description: 'Create detailed estimates and quotations with line items, validity periods, and terms. Convert accepted quotes to invoices in one click.',
    category: 'Invoicer',
    tags: ['Estimates', 'Quotes', 'Proposals'],
    features: [
      'Professional quotation templates with your branding',
      'Validity expiry with auto-nudge before deadline',
      'Client approval with e-signature on the quote itself',
      'One-click conversion from approved quote to invoice',
      'Revision history and version comparison',
    ],
    status: 'coming_soon',
    eta: 'Q4 2026',
    icon: 'FileText',
    accentColor: 'yellow',
    featured: false,
    order: 18,
    waitlistCount: 0,
    wishCount: 0,
    createdAt: new Date().toISOString(),
  },
  // ── Project Management ────────────────────────────────────────────────────────
  {
    id: 'docrud-projects',
    title: 'Project Management',
    tagline: 'Tasks, milestones, and deliverables — linked to your documents',
    description: 'A lightweight but powerful project workspace where every task can be tied to a document, deliverable, or signature. Built for agencies, consultants, and product teams.',
    category: 'Project Management',
    tags: ['Projects', 'Tasks', 'Milestones', 'Kanban'],
    features: [
      'Kanban, list, and Gantt views for every project',
      'Task dependencies and critical path visualization',
      'Link deliverable documents directly to tasks',
      'Client-facing project portal with controlled visibility',
      'Time tracking per task with billable hours export',
      'Automated milestone alerts and deadline nudges',
    ],
    status: 'coming_soon',
    eta: 'Q1 2027',
    icon: 'Layers',
    accentColor: 'violet',
    featured: true,
    order: 19,
    waitlistCount: 0,
    wishCount: 0,
    createdAt: new Date().toISOString(),
  },
  // ── Finance & Accounting ──────────────────────────────────────────────────────
  {
    id: 'expense-manager',
    title: 'Expense Manager',
    tagline: 'Capture, approve, and reimburse expenses in minutes',
    description: 'Employees submit expenses with receipts. Managers approve with one tap. Finance exports to payroll or accounting — fully automated end-to-end.',
    category: 'Finance & Accounting',
    tags: ['Expenses', 'Receipts', 'Reimbursement'],
    features: [
      'Mobile receipt capture with AI auto-categorization',
      'Multi-level approval workflows with policy enforcement',
      'GST credit extraction from vendor receipts automatically',
      'Direct export to Tally, Zoho Books, and QuickBooks',
      'Monthly expense reports with departmental breakdown',
    ],
    status: 'coming_soon',
    eta: 'Q1 2027',
    icon: 'FileCheck2',
    accentColor: 'teal',
    featured: false,
    order: 20,
    waitlistCount: 0,
    wishCount: 0,
    createdAt: new Date().toISOString(),
  },
  // ── Communication ─────────────────────────────────────────────────────────────
  {
    id: 'client-communication',
    title: 'Client Communication Hub',
    tagline: 'All client messages, updates, and approvals in one thread',
    description: 'Stop juggling WhatsApp, email, and calls. Bring all client communication into a structured hub where every message is tied to a project or document.',
    category: 'Communication',
    tags: ['Messaging', 'Client', 'Approvals'],
    features: [
      'Structured threads per project with file sharing',
      'In-thread document approval with e-signature',
      'WhatsApp and email integration for seamless continuity',
      'AI-generated meeting summaries and action items',
      'Read receipts and response time analytics',
    ],
    status: 'coming_soon',
    eta: 'Q1 2027',
    icon: 'MessageSquare',
    accentColor: 'sky',
    featured: false,
    order: 21,
    waitlistCount: 0,
    wishCount: 0,
    createdAt: new Date().toISOString(),
  },
];

// ── OTP helpers ───────────────────────────────────────────────────────────────

function sha256Hex(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function safeEq(a: string, b: string) {
  const ab = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateId(prefix = 'ea') {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
}

function addMinutes(baseIso: string, minutes: number) {
  const d = new Date(baseIso);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

// ── Features ──────────────────────────────────────────────────────────────────

interface FeaturesStore { features: EarlyAccessFeature[]; updatedAt: string; }

async function readFeaturesStore(): Promise<FeaturesStore> {
  const store = await readJsonFile<FeaturesStore>(earlyAccessFeaturesPath, { features: [], updatedAt: '' });
  if (!Array.isArray(store.features) || store.features.length === 0) {
    return { features: SEED_FEATURES, updatedAt: new Date().toISOString() };
  }
  return store;
}

export async function getEarlyAccessFeatures(): Promise<EarlyAccessFeature[]> {
  const store = await readFeaturesStore();
  return [...store.features].sort((a, b) => (a.order || 99) - (b.order || 99));
}

export async function saveEarlyAccessFeatures(features: EarlyAccessFeature[]) {
  await writeJsonFile(earlyAccessFeaturesPath, { features, updatedAt: new Date().toISOString() });
}

async function bumpFeatureCount(featureId: string, delta: { waitlist?: number; wish?: number }) {
  const features = await getEarlyAccessFeatures();
  const idx = features.findIndex((f) => f.id === featureId);
  if (idx < 0) return;
  if (delta.waitlist) features[idx].waitlistCount = Math.max(0, (features[idx].waitlistCount || 0) + delta.waitlist);
  if (delta.wish) features[idx].wishCount = Math.max(0, (features[idx].wishCount || 0) + delta.wish);
  features[idx].updatedAt = new Date().toISOString();
  await saveEarlyAccessFeatures(features);
}

// ── Waitlist ──────────────────────────────────────────────────────────────────

interface WaitlistStore { entries: WaitlistEntry[]; }

async function readWaitlistStore(): Promise<WaitlistStore> {
  const store = await readJsonFile<WaitlistStore>(earlyAccessWaitlistPath, { entries: [] });
  return { entries: Array.isArray(store.entries) ? store.entries : [] };
}

export async function getWaitlistEntries(featureId?: string): Promise<WaitlistEntry[]> {
  const { entries } = await readWaitlistStore();
  return featureId ? entries.filter((e) => e.featureId === featureId) : entries;
}

export async function addWaitlistEntry(entry: Omit<WaitlistEntry, 'id' | 'createdAt'>): Promise<{ entry: WaitlistEntry; isNew: boolean }> {
  const store = await readWaitlistStore();
  const existing = store.entries.find((e) => e.featureId === entry.featureId && e.email === entry.email);
  if (existing) return { entry: existing, isNew: false };
  const newEntry: WaitlistEntry = { id: generateId('wl'), createdAt: new Date().toISOString(), ...entry };
  store.entries.unshift(newEntry);
  await writeJsonFile(earlyAccessWaitlistPath, store);
  await bumpFeatureCount(entry.featureId, { waitlist: 1 });
  return { entry: newEntry, isNew: true };
}

// ── Wishes ────────────────────────────────────────────────────────────────────

interface WishesStore { wishes: FeatureWish[]; }

async function readWishesStore(): Promise<WishesStore> {
  const store = await readJsonFile<WishesStore>(earlyAccessWishesPath, { wishes: [] });
  return { wishes: Array.isArray(store.wishes) ? store.wishes : [] };
}

export async function getFeatureWishes(featureId?: string): Promise<FeatureWish[]> {
  const { wishes } = await readWishesStore();
  return featureId ? wishes.filter((w) => w.featureId === featureId) : wishes;
}

export async function addFeatureWish(wish: Omit<FeatureWish, 'id' | 'createdAt'>): Promise<FeatureWish> {
  const store = await readWishesStore();
  const newWish: FeatureWish = { id: generateId('wsh'), createdAt: new Date().toISOString(), ...wish };
  store.wishes.unshift(newWish);
  await writeJsonFile(earlyAccessWishesPath, store);
  await bumpFeatureCount(wish.featureId, { wish: 1 });
  return newWish;
}

// ── OTP ───────────────────────────────────────────────────────────────────────

interface OtpStore { sessions: EarlyAccessOtpSession[]; }

async function readOtpStore(): Promise<OtpStore> {
  const store = await readJsonFile<OtpStore>(earlyAccessOtpsPath, { sessions: [] });
  const now = Date.now();
  return { sessions: (Array.isArray(store.sessions) ? store.sessions : []).filter((s) => new Date(s.expiresAt).getTime() > now) };
}

export async function createEarlyAccessOtp(email: string, featureId: string): Promise<{ sessionId: string; otp: string; expiresAt: string }> {
  const store = await readOtpStore();
  const recent = [...store.sessions]
    .filter((s) => s.email === email && s.featureId === featureId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
  if (recent && Date.now() - new Date(recent.createdAt).getTime() < 45_000) {
    throw new Error('OTP already sent. Please wait 45 seconds before requesting again.');
  }
  const otp = generateOtp();
  const otpSalt = crypto.randomBytes(16).toString('hex');
  const otpHash = sha256Hex(`${otpSalt}:${otp}`);
  const now = new Date().toISOString();
  const session: EarlyAccessOtpSession = {
    id: generateId('eaotp'),
    email,
    featureId,
    otpHash,
    otpSalt,
    createdAt: now,
    expiresAt: addMinutes(now, 10),
    attempts: 0,
  };
  store.sessions.unshift(session);
  await writeJsonFile(earlyAccessOtpsPath, store);
  return { sessionId: session.id, otp, expiresAt: session.expiresAt };
}

export async function verifyEarlyAccessOtp(sessionId: string, otp: string): Promise<{ email: string; featureId: string }> {
  const code = String(otp || '').trim();
  if (!/^\d{6}$/.test(code)) throw new Error('Enter the 6-digit OTP.');
  const store = await readOtpStore();
  const idx = store.sessions.findIndex((s) => s.id === sessionId);
  if (idx < 0) throw new Error('OTP expired. Please request a new one.');
  const session = store.sessions[idx];
  if (session.verifiedAt) return { email: session.email, featureId: session.featureId };
  if (session.attempts >= 5) throw new Error('Too many attempts. Request a new OTP.');
  const attemptHash = sha256Hex(`${session.otpSalt}:${code}`);
  session.attempts += 1;
  if (!safeEq(attemptHash, session.otpHash)) {
    store.sessions[idx] = session;
    await writeJsonFile(earlyAccessOtpsPath, store);
    const left = 5 - session.attempts;
    throw new Error(`Incorrect OTP. ${left} attempt${left === 1 ? '' : 's'} remaining.`);
  }
  session.verifiedAt = new Date().toISOString();
  store.sessions[idx] = session;
  await writeJsonFile(earlyAccessOtpsPath, store);
  return { email: session.email, featureId: session.featureId };
}
