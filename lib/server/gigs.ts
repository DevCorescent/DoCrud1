import type { GigBid, GigConnectionRequest, GigListing, User } from '@/types/document';
import { gigBidsPath, gigConnectionsPath, gigsPath, readJsonFile, writeJsonFile } from '@/lib/server/storage';
import { getRazorpayConfig, verifyRazorpayPaymentSignature } from '@/lib/server/billing';
import { createPendingCommerceTransaction } from '@/lib/server/billing';
import { sendTrackedMail } from '@/lib/server/mailer';
import { getStoredUsers } from '@/lib/server/auth';

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

const defaultGigs: GigListing[] = [
  {
    id: 'gig-brand-system-refresh',
    slug: 'brand-system-refresh-for-saas-launch',
    ownerUserId: '1',
    ownerName: 'Northstar Ops',
    ownerEmail: 'admin@company.com',
    organizationName: 'Northstar Ops',
    title: 'Brand system refresh for a SaaS launch',
    summary: 'Need a product-minded designer to tighten brand basics, landing-page sections, and a cleaner rollout pack for launch month.',
    category: 'Design',
    interests: ['saas', 'brand design', 'launch'],
    skills: ['Figma', 'Brand systems', 'Landing pages'],
    deliverables: ['Brand direction board', 'Homepage refresh', 'Social launch kit'],
    budgetLabel: '₹35k - ₹60k',
    timelineLabel: '2 to 3 weeks',
    engagementType: 'one_time',
    locationPreference: 'remote',
    contactPreference: 'chat',
    visibility: 'public',
    status: 'published',
    urgentUntil: '2026-05-02T00:00:00.000Z',
    connectCount: 6,
    createdAt: '2026-04-18T08:00:00.000Z',
    updatedAt: '2026-04-18T08:00:00.000Z',
  },
  {
    id: 'gig-doc-automation-pipeline',
    slug: 'document-automation-pipeline-for-client-ops',
    ownerUserId: '1',
    ownerName: 'Docrud Team',
    ownerEmail: 'admin@company.com',
    organizationName: 'Docrud Team',
    title: 'Document automation pipeline for client ops',
    summary: 'Looking for a workflow builder who can structure approval logic, email triggers, and delivery states across recurring client documents.',
    category: 'Automation',
    interests: ['operations', 'automation', 'documents'],
    skills: ['Automation design', 'API thinking', 'Client ops'],
    deliverables: ['Flow map', 'Approval states', 'Delivery rules'],
    budgetLabel: '₹70k - ₹1.2L',
    timelineLabel: '4 weeks',
    engagementType: 'ongoing',
    locationPreference: 'remote',
    contactPreference: 'email',
    visibility: 'public',
    status: 'published',
    bidMode: 'bidding',
    bidRules: {
      currency: 'INR',
      minBidInRupees: 55000,
      allowCounterOffer: true,
      bidDeadlineAt: '2026-05-05T00:00:00.000Z',
    },
    connectCount: 11,
    createdAt: '2026-04-18T11:30:00.000Z',
    updatedAt: '2026-04-18T11:30:00.000Z',
  },
  {
    id: 'gig-meeting-recap-engine',
    slug: 'ai-meeting-recap-and-action-engine',
    ownerUserId: '1',
    ownerName: 'Docrud Labs',
    ownerEmail: 'admin@company.com',
    organizationName: 'Docrud Labs',
    title: 'AI meeting recap and action engine',
    summary: 'Need a sharp product engineer to help shape transcript cleanup, action extraction, and post-meeting workflow handoff inside docrud.',
    category: 'Engineering',
    interests: ['ai', 'meetings', 'product engineering'],
    skills: ['React', 'Product engineering', 'AI workflows'],
    deliverables: ['Recap pipeline', 'Action extraction pass', 'QA notes'],
    budgetLabel: '₹1.5L / month',
    timelineLabel: 'Retainer',
    engagementType: 'retainer',
    locationPreference: 'hybrid',
    contactPreference: 'chat',
    visibility: 'public',
    status: 'published',
    connectCount: 9,
    createdAt: '2026-04-19T07:20:00.000Z',
    updatedAt: '2026-04-19T07:20:00.000Z',
  },
  {
    id: 'gig-security-copy-refresh',
    slug: 'security-copy-refresh-for-client-facing-docs',
    ownerUserId: '1',
    ownerName: 'Trust Layer Studio',
    ownerEmail: 'admin@company.com',
    organizationName: 'Trust Layer Studio',
    title: 'Security copy refresh for client-facing docs',
    summary: 'Need a writer who can turn dense product security language into calmer client-ready explanations across landing pages and shared documents.',
    category: 'Content',
    interests: ['security', 'ux writing', 'b2b saas'],
    skills: ['UX writing', 'Security copy', 'Content strategy'],
    deliverables: ['Copy rewrite', 'FAQ cleanup', 'Trust section pack'],
    budgetLabel: '₹25k - ₹45k',
    timelineLabel: '10 days',
    engagementType: 'one_time',
    locationPreference: 'remote',
    contactPreference: 'email',
    visibility: 'public',
    status: 'published',
    connectCount: 4,
    createdAt: '2026-04-19T10:15:00.000Z',
    updatedAt: '2026-04-19T10:15:00.000Z',
  },
  {
    id: 'gig-growth-landing-copy',
    slug: 'landing-page-copy-and-structure-for-b2b-saas',
    ownerUserId: '1',
    ownerName: 'LaunchCrew',
    ownerEmail: 'admin@company.com',
    organizationName: 'LaunchCrew',
    title: 'Landing page copy and structure for B2B SaaS',
    summary: 'Need a crisp, conversion-first landing page narrative with sections, proof points, and tighter messaging for a new product launch.',
    category: 'Content',
    interests: ['launch', 'b2b saas', 'copywriting'],
    skills: ['Landing pages', 'Product messaging', 'Copywriting'],
    deliverables: ['Section outline', 'Homepage copy', 'Value prop variants'],
    budgetLabel: '₹18k - ₹35k',
    timelineLabel: '7 days',
    engagementType: 'one_time',
    locationPreference: 'remote',
    contactPreference: 'chat',
    visibility: 'public',
    status: 'published',
    urgentUntil: '2026-05-16T00:00:00.000Z',
    connectCount: 8,
    createdAt: '2026-04-20T09:00:00.000Z',
    updatedAt: '2026-04-20T09:00:00.000Z',
  },
  {
    id: 'gig-website-ui-refresh',
    slug: 'website-ui-refresh-and-design-system-pass',
    ownerUserId: '1',
    ownerName: 'Design Hatch',
    ownerEmail: 'admin@company.com',
    organizationName: 'Design Hatch',
    title: 'Website UI refresh and design system pass',
    summary: 'Need a modern refresh for an existing marketing site: tighter components, spacing, typography, and a cleaner design system spec.',
    category: 'Design',
    interests: ['ui', 'design system', 'website'],
    skills: ['Figma', 'UI design', 'Design systems'],
    deliverables: ['Component library', 'Updated pages', 'Handoff notes'],
    budgetLabel: '₹45k - ₹90k',
    timelineLabel: '2 weeks',
    engagementType: 'one_time',
    locationPreference: 'remote',
    contactPreference: 'chat',
    visibility: 'public',
    status: 'published',
    urgentUntil: '2026-05-16T00:00:00.000Z',
    connectCount: 12,
    createdAt: '2026-04-20T14:20:00.000Z',
    updatedAt: '2026-04-20T14:20:00.000Z',
  },
  {
    id: 'gig-performance-ops-audit',
    slug: 'performance-audit-and-speed-fixes-for-nextjs-app',
    ownerUserId: '1',
    ownerName: 'Velocity Ops',
    ownerEmail: 'admin@company.com',
    organizationName: 'Velocity Ops',
    title: 'Performance audit and speed fixes for a Next.js app',
    summary: 'Need a senior engineer to remove UI jank, fix hydration issues, improve bundle size, and ship measurable perf gains.',
    category: 'Engineering',
    interests: ['performance', 'nextjs', 'frontend'],
    skills: ['Next.js', 'React', 'Performance'],
    deliverables: ['Perf report', 'Fix PRs', 'Before/after metrics'],
    budgetLabel: '₹1.2L - ₹2.0L',
    timelineLabel: '10 days',
    engagementType: 'one_time',
    locationPreference: 'remote',
    contactPreference: 'email',
    visibility: 'public',
    status: 'published',
    urgentUntil: '2026-05-16T00:00:00.000Z',
    connectCount: 15,
    createdAt: '2026-04-21T08:10:00.000Z',
    updatedAt: '2026-04-21T08:10:00.000Z',
  },
  {
    id: 'gig-gst-invoice-template-pack',
    slug: 'gst-ready-invoice-template-pack-for-india',
    ownerUserId: '1',
    ownerName: 'Finance Desk',
    ownerEmail: 'admin@company.com',
    organizationName: 'Finance Desk',
    title: 'GST-ready invoice template pack for India',
    summary: 'Need a clean invoice pack (GST fields, terms, notes) that can be reused for clients and exported reliably.',
    category: 'Finance',
    interests: ['gst', 'invoices', 'operations'],
    skills: ['Invoice design', 'GST basics', 'Operations'],
    deliverables: ['Invoice templates', 'Terms block', 'Field list'],
    budgetLabel: '₹10k - ₹22k',
    timelineLabel: '5 days',
    engagementType: 'one_time',
    locationPreference: 'remote',
    contactPreference: 'chat',
    visibility: 'public',
    status: 'published',
    urgentUntil: '2026-05-16T00:00:00.000Z',
    connectCount: 5,
    createdAt: '2026-04-21T13:10:00.000Z',
    updatedAt: '2026-04-21T13:10:00.000Z',
  },
  {
    id: 'gig-recruiting-scorecard-sheet',
    slug: 'recruiting-scorecard-sheet-and-interview-kit',
    ownerUserId: '1',
    ownerName: 'Hiring Ops',
    ownerEmail: 'admin@company.com',
    organizationName: 'Hiring Ops',
    title: 'Recruiting scorecard sheet and interview kit',
    summary: 'Need a structured scorecard sheet (roles, competencies, weights) and an interview kit for consistent hiring decisions.',
    category: 'Operations',
    interests: ['hiring', 'process', 'ops'],
    skills: ['Operations', 'Scorecards', 'Sheets'],
    deliverables: ['Scorecard sheet', 'Interview kit', 'Rubric'],
    budgetLabel: '₹12k - ₹28k',
    timelineLabel: '1 week',
    engagementType: 'one_time',
    locationPreference: 'remote',
    contactPreference: 'chat',
    visibility: 'public',
    status: 'published',
    urgentUntil: '2026-05-16T00:00:00.000Z',
    connectCount: 7,
    createdAt: '2026-04-22T09:10:00.000Z',
    updatedAt: '2026-04-22T09:10:00.000Z',
  },
  {
    id: 'gig-security-policy-pack',
    slug: 'security-policy-pack-for-client-shares-and-signing',
    ownerUserId: '1',
    ownerName: 'Trust Ops',
    ownerEmail: 'admin@company.com',
    organizationName: 'Trust Ops',
    title: 'Security policy pack for client shares and signing',
    summary: 'Need a lightweight policy pack for secure sharing, access controls, retention, and signing workflow to share with clients.',
    category: 'Security',
    interests: ['security', 'policy', 'b2b'],
    skills: ['Policy writing', 'Security basics', 'B2B docs'],
    deliverables: ['Policy doc', 'Client-facing summary', 'Checklist'],
    budgetLabel: '₹22k - ₹45k',
    timelineLabel: '10 days',
    engagementType: 'one_time',
    locationPreference: 'remote',
    contactPreference: 'email',
    visibility: 'public',
    status: 'published',
    urgentUntil: '2026-05-16T00:00:00.000Z',
    connectCount: 6,
    createdAt: '2026-04-22T14:10:00.000Z',
    updatedAt: '2026-04-22T14:10:00.000Z',
  },
  {
    id: 'gig-product-microcopy-pass',
    slug: 'product-microcopy-pass-for-saas-ui',
    ownerUserId: '1',
    ownerName: 'Clarity Studio',
    ownerEmail: 'admin@company.com',
    organizationName: 'Clarity Studio',
    title: 'Product microcopy pass for SaaS UI',
    summary: 'Need a writer to tighten empty states, buttons, warnings, and tooltips so the UI reads calm, clear, and consistent.',
    category: 'Content',
    interests: ['ux writing', 'product', 'saas'],
    skills: ['UX writing', 'Microcopy', 'Product tone'],
    deliverables: ['UI copy audit', 'Rewrite set', 'Tone guide notes'],
    budgetLabel: '₹20k - ₹45k',
    timelineLabel: '1 week',
    engagementType: 'one_time',
    locationPreference: 'remote',
    contactPreference: 'chat',
    visibility: 'public',
    status: 'published',
    connectCount: 3,
    createdAt: '2026-04-23T06:40:00.000Z',
    updatedAt: '2026-04-23T06:40:00.000Z',
  },
  {
    id: 'gig-onboarding-pack-india',
    slug: 'employee-onboarding-pack-india-offer-contract',
    ownerUserId: '1',
    ownerName: 'HR Desk',
    ownerEmail: 'admin@company.com',
    organizationName: 'HR Desk',
    title: 'Employee onboarding pack (India): offer + contract',
    summary: 'Need a clean onboarding doc pack: offer letter, employment contract, joining checklist, and ID collection notes for India.',
    category: 'HR',
    interests: ['hr', 'onboarding', 'compliance'],
    skills: ['HR docs', 'Policy clarity', 'Templates'],
    deliverables: ['Offer letter', 'Employment contract', 'Joining checklist'],
    budgetLabel: '₹18k - ₹40k',
    timelineLabel: '6 days',
    engagementType: 'one_time',
    locationPreference: 'remote',
    contactPreference: 'email',
    visibility: 'public',
    status: 'published',
    connectCount: 4,
    createdAt: '2026-04-23T09:30:00.000Z',
    updatedAt: '2026-04-23T09:30:00.000Z',
  },
  {
    id: 'gig-invoice-ops-setup',
    slug: 'invoice-ops-setup-billing-reminders-and-templates',
    ownerUserId: '1',
    ownerName: 'Billing Ops',
    ownerEmail: 'admin@company.com',
    organizationName: 'Billing Ops',
    title: 'Invoice ops setup: billing reminders + templates',
    summary: 'Need a lightweight billing system with invoice templates, due-date reminders, and clean follow-up email drafts.',
    category: 'Finance',
    interests: ['billing', 'invoices', 'ops'],
    skills: ['Invoice design', 'Ops setup', 'Reminder flow'],
    deliverables: ['Invoice template set', 'Reminder messages', 'Process doc'],
    budgetLabel: '₹25k - ₹65k',
    timelineLabel: '2 weeks',
    engagementType: 'one_time',
    locationPreference: 'remote',
    contactPreference: 'chat',
    visibility: 'public',
    status: 'published',
    connectCount: 7,
    createdAt: '2026-04-23T13:10:00.000Z',
    updatedAt: '2026-04-23T13:10:00.000Z',
  },
  {
    id: 'gig-nextjs-design-system',
    slug: 'nextjs-design-system-and-component-library',
    ownerUserId: '1',
    ownerName: 'Frontend Guild',
    ownerEmail: 'admin@company.com',
    organizationName: 'Frontend Guild',
    title: 'Next.js design system and component library',
    summary: 'Need a consistent UI kit: tokens, buttons, cards, nav, forms, and drop-downs with pixel-stable behavior across devices.',
    category: 'Engineering',
    interests: ['frontend', 'design system', 'nextjs'],
    skills: ['React', 'Tailwind', 'UI systems'],
    deliverables: ['Tokens + theme', 'Component set', 'Docs + examples'],
    budgetLabel: '₹1.8L - ₹3.2L',
    timelineLabel: '3 weeks',
    engagementType: 'one_time',
    locationPreference: 'remote',
    contactPreference: 'email',
    visibility: 'public',
    status: 'published',
    urgentUntil: '2026-05-20T00:00:00.000Z',
    connectCount: 10,
    createdAt: '2026-04-24T06:15:00.000Z',
    updatedAt: '2026-04-24T06:15:00.000Z',
  },
  {
    id: 'gig-rag-knowledge-base',
    slug: 'rag-knowledge-base-from-public-docs-and-web-sources',
    ownerUserId: '1',
    ownerName: 'AI Ops',
    ownerEmail: 'admin@company.com',
    organizationName: 'AI Ops',
    title: 'RAG knowledge base from public docs and web sources',
    summary: 'Need a pipeline to ingest links, chunk and embed content, and answer with citations. Must be fast and reliable in production.',
    category: 'Engineering',
    interests: ['rag', 'ai', 'search'],
    skills: ['RAG', 'Next.js', 'Vector DB basics'],
    deliverables: ['Ingest pipeline', 'Q&A endpoint', 'Cited answers'],
    budgetLabel: '₹2.2L - ₹4.0L',
    timelineLabel: '4 weeks',
    engagementType: 'retainer',
    locationPreference: 'remote',
    contactPreference: 'chat',
    visibility: 'public',
    status: 'published',
    connectCount: 14,
    createdAt: '2026-04-24T09:25:00.000Z',
    updatedAt: '2026-04-24T09:25:00.000Z',
  },
  {
    id: 'gig-docx-pdf-export-hardening',
    slug: 'docx-and-pdf-export-hardening-and-consistency-fixes',
    ownerUserId: '1',
    ownerName: 'Doc Ops',
    ownerEmail: 'admin@company.com',
    organizationName: 'Doc Ops',
    title: 'DOCX and PDF export hardening + consistency fixes',
    summary: 'Need export reliability: spacing parity, page breaks, headers/footers stability, and consistent fonts across outputs.',
    category: 'Automation',
    interests: ['pdf', 'docx', 'export'],
    skills: ['PDF generation', 'Layout', 'QA'],
    deliverables: ['Export parity fixes', 'Regression tests', 'Edge-case suite'],
    budgetLabel: '₹95k - ₹1.8L',
    timelineLabel: '2 weeks',
    engagementType: 'one_time',
    locationPreference: 'remote',
    contactPreference: 'email',
    visibility: 'public',
    status: 'published',
    connectCount: 9,
    createdAt: '2026-04-24T12:05:00.000Z',
    updatedAt: '2026-04-24T12:05:00.000Z',
  },
  {
    id: 'gig-security-review-sharing-links',
    slug: 'security-review-for-sharing-links-and-access-controls',
    ownerUserId: '1',
    ownerName: 'Security Lab',
    ownerEmail: 'admin@company.com',
    organizationName: 'Security Lab',
    title: 'Security review for sharing links and access controls',
    summary: 'Need a threat-model pass for secure links: expiry, password gates, role access, and audit trail correctness.',
    category: 'Security',
    interests: ['security', 'audit', 'sharing'],
    skills: ['Threat modeling', 'App security', 'Audit trails'],
    deliverables: ['Threat model', 'Fix list', 'Verification notes'],
    budgetLabel: '₹1.1L - ₹2.4L',
    timelineLabel: '8 days',
    engagementType: 'one_time',
    locationPreference: 'remote',
    contactPreference: 'email',
    visibility: 'public',
    status: 'published',
    connectCount: 8,
    createdAt: '2026-04-24T16:40:00.000Z',
    updatedAt: '2026-04-24T16:40:00.000Z',
  },
  {
    id: 'gig-sales-proposal-template-set',
    slug: 'sales-proposal-template-set-with-pricing-tables',
    ownerUserId: '1',
    ownerName: 'Revenue Ops',
    ownerEmail: 'admin@company.com',
    organizationName: 'Revenue Ops',
    title: 'Sales proposal template set with pricing tables',
    summary: 'Need a polished proposal template with scope, timelines, pricing tables, and signature-ready acceptance section.',
    category: 'Operations',
    interests: ['sales', 'proposals', 'docs'],
    skills: ['Proposal writing', 'Pricing tables', 'Structure'],
    deliverables: ['Proposal template', 'Pricing table blocks', 'Acceptance section'],
    budgetLabel: '₹22k - ₹55k',
    timelineLabel: '1 week',
    engagementType: 'one_time',
    locationPreference: 'remote',
    contactPreference: 'chat',
    visibility: 'public',
    status: 'published',
    urgentUntil: '2026-05-20T00:00:00.000Z',
    connectCount: 6,
    createdAt: '2026-04-25T07:05:00.000Z',
    updatedAt: '2026-04-25T07:05:00.000Z',
  },
  {
    id: 'gig-docsheet-formula-coach',
    slug: 'docsheet-formula-coach-and-smart-suggestions',
    ownerUserId: '1',
    ownerName: 'Sheets Lab',
    ownerEmail: 'admin@company.com',
    organizationName: 'Sheets Lab',
    title: 'DocSheet formula coach and smart suggestions',
    summary: 'Need a formula helper: recommend formulas per column, show previews, and keep results stable for exports and charts.',
    category: 'Engineering',
    interests: ['spreadsheets', 'formulas', 'ux'],
    skills: ['React', 'Formulas', 'Product UX'],
    deliverables: ['Formula recommender', 'UI hints', 'Examples pack'],
    budgetLabel: '₹2.0L - ₹3.8L',
    timelineLabel: '4 weeks',
    engagementType: 'retainer',
    locationPreference: 'remote',
    contactPreference: 'chat',
    visibility: 'public',
    status: 'published',
    connectCount: 13,
    createdAt: '2026-04-25T10:50:00.000Z',
    updatedAt: '2026-04-25T10:50:00.000Z',
  },
  {
    id: 'gig-customer-support-macro-pack',
    slug: 'customer-support-macro-pack-and-reply-library',
    ownerUserId: '1',
    ownerName: 'Support Ops',
    ownerEmail: 'admin@company.com',
    organizationName: 'Support Ops',
    title: 'Customer support macro pack + reply library',
    summary: 'Need a reply library for onboarding, billing, access, and troubleshooting with consistent tone and faster turnaround.',
    category: 'Operations',
    interests: ['support', 'ops', 'templates'],
    skills: ['Support writing', 'Process', 'Tone'],
    deliverables: ['Macro pack', 'Tag taxonomy', 'Usage guide'],
    budgetLabel: '₹18k - ₹48k',
    timelineLabel: '6 days',
    engagementType: 'one_time',
    locationPreference: 'remote',
    contactPreference: 'email',
    visibility: 'public',
    status: 'published',
    connectCount: 5,
    createdAt: '2026-04-25T13:20:00.000Z',
    updatedAt: '2026-04-25T13:20:00.000Z',
  },
  {
    id: 'gig-kpi-tracker-sheet',
    slug: 'kpi-tracker-sheet-and-ops-dashboard-grid',
    ownerUserId: '1',
    ownerName: 'Ops Analytics',
    ownerEmail: 'admin@company.com',
    organizationName: 'Ops Analytics',
    title: 'KPI tracker sheet + ops dashboard grid',
    summary: 'Need a KPI sheet (weekly metrics, targets, deltas) plus a clean dashboard view for leadership updates.',
    category: 'Operations',
    interests: ['kpi', 'analytics', 'ops'],
    skills: ['Sheets', 'Metrics', 'Reporting'],
    deliverables: ['KPI workbook', 'Dashboard view', 'Exportable CSV'],
    budgetLabel: '₹15k - ₹35k',
    timelineLabel: '4 days',
    engagementType: 'one_time',
    locationPreference: 'remote',
    contactPreference: 'chat',
    visibility: 'public',
    status: 'published',
    connectCount: 4,
    createdAt: '2026-04-26T06:25:00.000Z',
    updatedAt: '2026-04-26T06:25:00.000Z',
  },
  {
    id: 'gig-legal-msa-template',
    slug: 'master-service-agreement-template-and-negotiation-notes',
    ownerUserId: '1',
    ownerName: 'Legal Desk',
    ownerEmail: 'admin@company.com',
    organizationName: 'Legal Desk',
    title: 'Master Service Agreement template + negotiation notes',
    summary: 'Need an MSA template with clean clause structure, editable variables, and a quick negotiation notes sheet for teams.',
    category: 'Legal',
    interests: ['contracts', 'legal', 'templates'],
    skills: ['Contracts', 'Clause drafting', 'Variable fields'],
    deliverables: ['MSA template', 'Clause notes', 'Fallback language'],
    budgetLabel: '₹45k - ₹1.1L',
    timelineLabel: '2 weeks',
    engagementType: 'one_time',
    locationPreference: 'remote',
    contactPreference: 'email',
    visibility: 'public',
    status: 'published',
    connectCount: 6,
    createdAt: '2026-04-26T09:30:00.000Z',
    updatedAt: '2026-04-26T09:30:00.000Z',
  },
  {
    id: 'gig-nda-pack-mutual',
    slug: 'nda-pack-mutual-and-one-way-with-annexures',
    ownerUserId: '1',
    ownerName: 'Legal Desk',
    ownerEmail: 'admin@company.com',
    organizationName: 'Legal Desk',
    title: 'NDA pack: mutual + one-way + annexures',
    summary: 'Need NDA variants with standard annexures and a quick edit guide for teams so they stop rewriting from scratch.',
    category: 'Legal',
    interests: ['nda', 'legal', 'workflows'],
    skills: ['Contracts', 'Templates', 'Legal ops'],
    deliverables: ['Mutual NDA', 'One-way NDA', 'Edit guide'],
    budgetLabel: '₹22k - ₹55k',
    timelineLabel: '1 week',
    engagementType: 'one_time',
    locationPreference: 'remote',
    contactPreference: 'chat',
    visibility: 'public',
    status: 'published',
    connectCount: 7,
    createdAt: '2026-04-26T12:20:00.000Z',
    updatedAt: '2026-04-26T12:20:00.000Z',
  },
  {
    id: 'gig-brand-illustrations-pack',
    slug: 'brand-illustrations-pack-for-product-and-marketing',
    ownerUserId: '1',
    ownerName: 'Illustration Co',
    ownerEmail: 'admin@company.com',
    organizationName: 'Illustration Co',
    title: 'Brand illustrations pack for product + marketing',
    summary: 'Need a consistent illustration set: hero visuals, feature icons, and light background shapes matching your palette.',
    category: 'Design',
    interests: ['illustration', 'brand', 'marketing'],
    skills: ['Illustration', 'Brand style', 'Figma'],
    deliverables: ['Hero illustration', 'Icon set', 'Background shapes'],
    budgetLabel: '₹35k - ₹85k',
    timelineLabel: '2 weeks',
    engagementType: 'one_time',
    locationPreference: 'remote',
    contactPreference: 'chat',
    visibility: 'public',
    status: 'published',
    connectCount: 9,
    createdAt: '2026-04-26T15:10:00.000Z',
    updatedAt: '2026-04-26T15:10:00.000Z',
  },
  {
    id: 'gig-mobile-ui-polish',
    slug: 'mobile-ui-polish-pass-responsive-and-no-overflow',
    ownerUserId: '1',
    ownerName: 'Mobile UX Lab',
    ownerEmail: 'admin@company.com',
    organizationName: 'Mobile UX Lab',
    title: 'Mobile UI polish pass: responsive + no overflow',
    summary: 'Need a full pass for mobile: fix overflow, spacing, dropdown clipping, and keep the app feeling smooth and stable.',
    category: 'Design',
    interests: ['mobile', 'ux', 'ui polish'],
    skills: ['Responsive UI', 'UX polish', 'Design QA'],
    deliverables: ['Issue list', 'Figma notes', 'Before/after screenshots'],
    budgetLabel: '₹55k - ₹1.4L',
    timelineLabel: '10 days',
    engagementType: 'one_time',
    locationPreference: 'remote',
    contactPreference: 'email',
    visibility: 'public',
    status: 'published',
    connectCount: 12,
    createdAt: '2026-04-27T06:05:00.000Z',
    updatedAt: '2026-04-27T06:05:00.000Z',
  },
  {
    id: 'gig-receipt-ocr-expense-capture',
    slug: 'receipt-ocr-expense-capture-and-categorization-flow',
    ownerUserId: '1',
    ownerName: 'Finance AI',
    ownerEmail: 'admin@company.com',
    organizationName: 'Finance AI',
    title: 'Receipt OCR expense capture + categorization flow',
    summary: 'Need receipt ingestion with OCR extraction, category suggestions, and a clean review UI that works on mobile.',
    category: 'Finance',
    interests: ['ocr', 'expenses', 'automation'],
    skills: ['OCR', 'UX flows', 'Finance ops'],
    deliverables: ['OCR schema', 'Review UI', 'Export format'],
    budgetLabel: '₹1.4L - ₹2.9L',
    timelineLabel: '3 weeks',
    engagementType: 'one_time',
    locationPreference: 'remote',
    contactPreference: 'chat',
    visibility: 'public',
    status: 'published',
    connectCount: 11,
    createdAt: '2026-04-27T09:35:00.000Z',
    updatedAt: '2026-04-27T09:35:00.000Z',
  },
  {
    id: 'gig-customer-payment-reminder-ai',
    slug: 'customer-payment-reminder-ai-and-follow-up-library',
    ownerUserId: '1',
    ownerName: 'Collections Desk',
    ownerEmail: 'admin@company.com',
    organizationName: 'Collections Desk',
    title: 'Customer payment reminder AI + follow-up library',
    summary: 'Need polite follow-ups: reminder copy, escalation ladder, and an AI prompt kit to personalize by client behavior.',
    category: 'Finance',
    interests: ['collections', 'reminders', 'ai'],
    skills: ['Copywriting', 'Ops', 'AI prompts'],
    deliverables: ['Reminder templates', 'Escalation ladder', 'Prompt kit'],
    budgetLabel: '₹18k - ₹55k',
    timelineLabel: '1 week',
    engagementType: 'one_time',
    locationPreference: 'remote',
    contactPreference: 'email',
    visibility: 'public',
    status: 'published',
    connectCount: 6,
    createdAt: '2026-04-27T12:00:00.000Z',
    updatedAt: '2026-04-27T12:00:00.000Z',
  },
  {
    id: 'gig-analytics-events-instrumentation',
    slug: 'analytics-events-instrumentation-and-dashboard-metrics',
    ownerUserId: '1',
    ownerName: 'Data Ops',
    ownerEmail: 'admin@company.com',
    organizationName: 'Data Ops',
    title: 'Analytics events instrumentation + dashboard metrics',
    summary: 'Need clean event taxonomy, collection pipeline, and dashboards that show what users actually do (not just page views).',
    category: 'Engineering',
    interests: ['analytics', 'events', 'product'],
    skills: ['Event design', 'Dashboards', 'Data thinking'],
    deliverables: ['Event map', 'Implementation plan', 'Metric definitions'],
    budgetLabel: '₹1.6L - ₹3.0L',
    timelineLabel: '2 weeks',
    engagementType: 'one_time',
    locationPreference: 'remote',
    contactPreference: 'chat',
    visibility: 'public',
    status: 'published',
    connectCount: 9,
    createdAt: '2026-04-28T07:10:00.000Z',
    updatedAt: '2026-04-28T07:10:00.000Z',
  },
  {
    id: 'gig-client-onboarding-checklist',
    slug: 'client-onboarding-checklist-and-ops-handbook',
    ownerUserId: '1',
    ownerName: 'Client Ops',
    ownerEmail: 'admin@company.com',
    organizationName: 'Client Ops',
    title: 'Client onboarding checklist + ops handbook',
    summary: 'Need a simple onboarding handbook: intake checklist, kickoff template, SLA notes, and handoff responsibilities.',
    category: 'Operations',
    interests: ['client ops', 'handoff', 'workflows'],
    skills: ['Operations', 'Docs', 'Workflow design'],
    deliverables: ['Checklist', 'Kickoff template', 'Handoff guide'],
    budgetLabel: '₹20k - ₹60k',
    timelineLabel: '8 days',
    engagementType: 'one_time',
    locationPreference: 'remote',
    contactPreference: 'chat',
    visibility: 'public',
    status: 'published',
    connectCount: 5,
    createdAt: '2026-04-28T10:45:00.000Z',
    updatedAt: '2026-04-28T10:45:00.000Z',
  },
  {
    id: 'gig-contract-redline-support',
    slug: 'contract-redline-support-and-clause-library',
    ownerUserId: '1',
    ownerName: 'Legal Ops',
    ownerEmail: 'admin@company.com',
    organizationName: 'Legal Ops',
    title: 'Contract redline support + clause library',
    summary: 'Need a practical clause library + redline support notes for common vendor and client contracts your team handles.',
    category: 'Legal',
    interests: ['contracts', 'redlines', 'legal ops'],
    skills: ['Contracts', 'Clause library', 'Negotiation'],
    deliverables: ['Clause library', 'Redline playbook', 'Fallback terms'],
    budgetLabel: '₹55k - ₹1.6L',
    timelineLabel: '2 weeks',
    engagementType: 'one_time',
    locationPreference: 'remote',
    contactPreference: 'email',
    visibility: 'public',
    status: 'published',
    connectCount: 8,
    createdAt: '2026-04-28T14:25:00.000Z',
    updatedAt: '2026-04-28T14:25:00.000Z',
  },
  {
    id: 'gig-ai-policy-and-usage-guidelines',
    slug: 'ai-policy-and-usage-guidelines-for-teams',
    ownerUserId: '1',
    ownerName: 'Governance Desk',
    ownerEmail: 'admin@company.com',
    organizationName: 'Governance Desk',
    title: 'AI policy and usage guidelines for teams',
    summary: 'Need a pragmatic AI policy: acceptable use, confidentiality, review rules, and safety boundaries for business teams.',
    category: 'Security',
    interests: ['policy', 'ai', 'governance'],
    skills: ['Policy writing', 'Governance', 'Security'],
    deliverables: ['Policy doc', 'Summary one-pager', 'Rollout checklist'],
    budgetLabel: '₹35k - ₹95k',
    timelineLabel: '10 days',
    engagementType: 'one_time',
    locationPreference: 'remote',
    contactPreference: 'chat',
    visibility: 'public',
    status: 'published',
    connectCount: 6,
    createdAt: '2026-04-29T06:40:00.000Z',
    updatedAt: '2026-04-29T06:40:00.000Z',
  },
  {
    id: 'gig-design-audit-landing-page',
    slug: 'landing-page-design-audit-and-section-upgrades',
    ownerUserId: '1',
    ownerName: 'Design Hatch',
    ownerEmail: 'admin@company.com',
    organizationName: 'Design Hatch',
    title: 'Landing page design audit + section upgrades',
    summary: 'Need a premium pass over your landing page: hierarchy, spacing, gradients, and conversion-first section flow.',
    category: 'Design',
    interests: ['landing page', 'ui', 'conversion'],
    skills: ['UI design', 'Conversion', 'Figma'],
    deliverables: ['Audit notes', 'Section redesigns', 'Handoff'],
    budgetLabel: '₹45k - ₹1.2L',
    timelineLabel: '1 week',
    engagementType: 'one_time',
    locationPreference: 'remote',
    contactPreference: 'chat',
    visibility: 'public',
    status: 'published',
    connectCount: 10,
    createdAt: '2026-04-29T08:20:00.000Z',
    updatedAt: '2026-04-29T08:20:00.000Z',
  },
  {
    id: 'gig-ops-automation-zapier-alternatives',
    slug: 'ops-automation-zapier-alternatives-and-workflow-routes',
    ownerUserId: '1',
    ownerName: 'Automation Desk',
    ownerEmail: 'admin@company.com',
    organizationName: 'Automation Desk',
    title: 'Ops automation routes: zapier alternatives + workflow map',
    summary: 'Need a workflow map: triggers, approvals, retries, and escalation paths to remove manual operational steps for teams.',
    category: 'Automation',
    interests: ['automation', 'ops', 'workflows'],
    skills: ['Workflow design', 'Systems thinking', 'Documentation'],
    deliverables: ['Workflow map', 'Trigger rules', 'Edge-case list'],
    budgetLabel: '₹55k - ₹1.6L',
    timelineLabel: '2 weeks',
    engagementType: 'one_time',
    locationPreference: 'remote',
    contactPreference: 'email',
    visibility: 'public',
    status: 'published',
    urgentUntil: '2026-05-20T00:00:00.000Z',
    connectCount: 8,
    createdAt: '2026-04-29T10:40:00.000Z',
    updatedAt: '2026-04-29T10:40:00.000Z',
  },
];

function gigOwnerId(user: User) {
  if (user.role === 'client') return user.id;
  if (user.role === 'member' && user.organizationId) return user.organizationId;
  return user.id;
}

function gigOwnerName(user: User) {
  return user.organizationName || user.name || 'Docrud Workspace';
}

export async function getGigListings() {
  const stored = await readJsonFile<GigListing[]>(gigsPath, []);
  const storedIds = new Set(stored.map((entry) => entry.id));
  return [...stored, ...defaultGigs.filter((entry) => !storedIds.has(entry.id))];
}

export async function saveGigListings(gigs: GigListing[]) {
  await writeJsonFile(gigsPath, gigs);
}

export async function getGigConnections() {
  return readJsonFile<GigConnectionRequest[]>(gigConnectionsPath, []);
}

export async function saveGigConnections(connections: GigConnectionRequest[]) {
  await writeJsonFile(gigConnectionsPath, connections);
}

export async function getGigBids() {
  return readJsonFile<GigBid[]>(gigBidsPath, []);
}

export async function saveGigBids(bids: GigBid[]) {
  await writeJsonFile(gigBidsPath, bids);
}

export async function getPublicGigListings() {
  const gigs = await getGigListings();
  return gigs
    .filter((gig) => gig.status === 'published' && gig.visibility === 'public')
    .sort((left, right) => +new Date(right.updatedAt) - +new Date(left.updatedAt));
}

export async function getGigListingBySlug(slug: string) {
  const gigs = await getGigListings();
  return gigs.find((gig) => gig.slug === slug) || null;
}

export async function getPublicGigBySlug(slug: string) {
  const gig = await getGigListingBySlug(slug);
  if (!gig || gig.status !== 'published' || gig.visibility !== 'public') {
    return null;
  }
  return gig;
}

export async function getGigCategories() {
  const gigs = await getGigListings();
  return Array.from(new Set(gigs.map((gig) => gig.category).filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

export async function getGigInterests() {
  const gigs = await getGigListings();
  return Array.from(new Set(gigs.flatMap((gig) => gig.interests || []).filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

export async function getVisibleGigListingsForUser(user: User) {
  const gigs = await getGigListings();
  const ownerId = gigOwnerId(user);
  return gigs.filter((gig) => gig.visibility === 'public' || gig.ownerUserId === user.id || gig.organizationId === ownerId);
}

export async function getGigWorkspaceData(user: User) {
  const [gigs, connections, bids, users] = await Promise.all([getVisibleGigListingsForUser(user), getGigConnections(), getGigBids(), getStoredUsers()]);
  const warningByUserId = new Map(
    users
      .filter((u) => u.safety?.scamWarning)
      .map((u) => [u.id, { scamWarning: true, label: u.safety?.scamWarningLabel || 'Warning' }] as const),
  );
  const ownListings = gigs.filter((gig) => gig.ownerUserId === user.id || gig.organizationId === gigOwnerId(user));
  const discoverListings = gigs
    .filter((gig) => gig.status === 'published' && (gig.visibility === 'public' || gig.ownerUserId === user.id || gig.organizationId === gigOwnerId(user)))
    .sort((left, right) => +new Date(right.updatedAt) - +new Date(left.updatedAt));
  const incomingConnections = connections
    .filter((entry) => entry.ownerUserId === user.id || ownListings.some((gig) => gig.id === entry.gigId))
    .map((entry) => ({
      ...entry,
      requesterSafety: warningByUserId.get(entry.requesterUserId) || null,
    }));
  const outgoingConnections = connections
    .filter((entry) => entry.requesterUserId === user.id)
    .map((entry) => ({
      ...entry,
      requesterSafety: warningByUserId.get(entry.requesterUserId) || null,
    }));
  const incomingBids = bids
    .filter((entry) => entry.ownerUserId === user.id || ownListings.some((gig) => gig.id === entry.gigId))
    .map((entry) => ({
      ...entry,
      bidderSafety: warningByUserId.get(entry.bidderUserId) || null,
    }));
  const outgoingBids = bids
    .filter((entry) => entry.bidderUserId === user.id)
    .map((entry) => ({
      ...entry,
      bidderSafety: warningByUserId.get(entry.bidderUserId) || null,
    }));

  return {
    ownListings: ownListings.sort((left, right) => +new Date(right.updatedAt) - +new Date(left.updatedAt)),
    discoverListings,
    incomingConnections: incomingConnections.sort((left, right) => +new Date(right.createdAt) - +new Date(left.createdAt)),
    outgoingConnections: outgoingConnections.sort((left, right) => +new Date(right.createdAt) - +new Date(left.createdAt)),
    incomingBids: incomingBids.sort((left, right) => +new Date(right.createdAt) - +new Date(left.createdAt)),
    outgoingBids: outgoingBids.sort((left, right) => +new Date(right.createdAt) - +new Date(left.createdAt)),
  };
}

export async function upsertGigListing(
  actor: User,
  payload: Partial<GigListing> & { title: string; summary: string; category: string },
) {
  const gigs = await getGigListings();
  const now = new Date().toISOString();
  const nextSlug = payload.slug?.trim() || slugify(payload.title);
  const existing = payload.id ? gigs.find((gig) => gig.id === payload.id) : null;
  const ownerId = gigOwnerId(actor);
  const gigId = payload.id || `gig-${Date.now()}`;

  const normalizedSlug = (() => {
    const base = nextSlug || `gig-${Date.now()}`;
    const collision = gigs.find((gig) => gig.slug === base && gig.id !== gigId);
    return collision ? `${base}-${Date.now().toString().slice(-4)}` : base;
  })();

  const nextGig: GigListing = {
    id: gigId,
    slug: normalizedSlug,
    ownerUserId: existing?.ownerUserId || actor.id,
    ownerName: existing?.ownerName || actor.name || gigOwnerName(actor),
    ownerEmail: existing?.ownerEmail || actor.email || 'owner@docrud.local',
    organizationId: actor.organizationId || ownerId,
    organizationName: actor.organizationName || gigOwnerName(actor),
    title: payload.title.trim(),
    summary: payload.summary.trim(),
    category: payload.category.trim() || 'General',
    interests: Array.isArray(payload.interests) ? payload.interests.map((item) => item.trim()).filter(Boolean) : [],
    skills: Array.isArray(payload.skills) ? payload.skills.map((item) => item.trim()).filter(Boolean) : [],
    deliverables: Array.isArray(payload.deliverables) ? payload.deliverables.map((item) => item.trim()).filter(Boolean) : [],
    budgetLabel: payload.budgetLabel?.trim() || 'Discuss budget',
    timelineLabel: payload.timelineLabel?.trim() || undefined,
    engagementType: payload.engagementType || 'one_time',
    locationPreference: payload.locationPreference || 'remote',
    contactPreference: payload.contactPreference || 'chat',
    visibility: payload.visibility || 'public',
    status: payload.status || 'draft',
    urgent: (payload as any).urgent ?? (payload as any).featured ?? (existing as any)?.urgent ?? (existing as any)?.featured ?? false,
    // Urgent boost is purchase-gated for non-admins. Admins can still set it manually.
    urgentUntil: actor.role === 'admin'
      ? ((payload as any).urgentUntil || (payload as any).featuredUntil || (existing as any)?.urgentUntil || (existing as any)?.featuredUntil)
      : ((existing as any)?.urgentUntil || (existing as any)?.featuredUntil),
    urgentPayment: (existing as any)?.urgentPayment || (existing as any)?.featuredPayment,
    bidMode: payload.bidMode || existing?.bidMode || 'fixed',
    bidRules: payload.bidRules || existing?.bidRules || { currency: 'INR' },
    connectCount: existing?.connectCount || 0,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  const nextGigs = existing
    ? gigs.map((gig) => (gig.id === existing.id ? nextGig : gig))
    : [nextGig, ...gigs];

  await saveGigListings(nextGigs);
  return nextGig;
}

export async function deleteGigListing(id: string, actor: User) {
  const gigs = await getGigListings();
  const target = gigs.find((gig) => gig.id === id);
  if (!target) {
    return false;
  }

  const actorOwnsGig = target.ownerUserId === actor.id || target.organizationId === gigOwnerId(actor) || actor.role === 'admin';
  if (!actorOwnsGig) {
    throw new Error('You are not allowed to delete this gig.');
  }

  const nextGigs = gigs.filter((gig) => gig.id !== id);
  await saveGigListings(nextGigs);

  const connections = await getGigConnections();
  const nextConnections = connections.filter((entry) => entry.gigId !== id);
  await saveGigConnections(nextConnections);
  return true;
}

export async function createGigConnectionRequest(
  actor: User,
  payload: {
    gigId: string;
    note: string;
    interestArea?: string;
    portfolioUrl?: string;
  },
) {
  const suspendedUntil = actor.safety?.suspendedUntil ? new Date(actor.safety.suspendedUntil) : null;
  if (suspendedUntil && Number.isFinite(suspendedUntil.getTime()) && suspendedUntil.getTime() > Date.now()) {
    throw new Error(`Your account is temporarily suspended from sending proposals until ${suspendedUntil.toLocaleString('en-IN')}.`);
  }

  const gigs = await getGigListings();
  const gig = gigs.find((entry) => entry.id === payload.gigId);
  if (!gig || gig.status !== 'published') {
    throw new Error('This gig is not open right now.');
  }
  if (gig.ownerUserId === actor.id) {
    throw new Error('You already own this gig.');
  }

  const connections = await getGigConnections();
  const existing = connections.find((entry) => entry.gigId === gig.id && entry.requesterUserId === actor.id && entry.status !== 'closed');
  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const nextRequest: GigConnectionRequest = {
    id: `gig-connect-${Date.now()}`,
    gigId: gig.id,
    gigSlug: gig.slug,
    gigTitle: gig.title,
    ownerUserId: gig.ownerUserId,
    requesterUserId: actor.id,
    requesterName: actor.name || 'Docrud user',
    requesterEmail: actor.email || 'member@docrud.local',
    requesterOrganization: actor.organizationName,
    requesterHeadline: actor.roleProfileName || actor.organizationName,
    interestArea: payload.interestArea?.trim() || undefined,
    portfolioUrl: payload.portfolioUrl?.trim() || undefined,
    note: payload.note.trim(),
    status: 'new',
    createdAt: now,
    updatedAt: now,
  };

  await saveGigConnections([nextRequest, ...connections]);
  await saveGigListings(gigs.map((entry) => entry.id === gig.id ? { ...entry, connectCount: entry.connectCount + 1, updatedAt: now } : entry));
  return nextRequest;
}

export async function updateGigConnectionStatus(id: string, actor: User, status: GigConnectionRequest['status']) {
  const connections = await getGigConnections();
  const target = connections.find((entry) => entry.id === id);
  if (!target) {
    return null;
  }
  if (target.ownerUserId !== actor.id && actor.role !== 'admin') {
    throw new Error('Not permitted to update this request.');
  }

  const now = new Date().toISOString();
  const nextConnections = connections.map((entry) => entry.id === id ? { ...entry, status, updatedAt: now } : entry);
  await saveGigConnections(nextConnections);
  return nextConnections.find((entry) => entry.id === id) || null;
}

export function getGigUrgentStatus(gig: GigListing) {
  const untilValue = (gig as any).urgentUntil || (gig as any).featuredUntil;
  if (!untilValue) return false;
  const until = new Date(untilValue);
  return Number.isFinite(until.getTime()) && until.getTime() > Date.now();
}

export function calculateGigUrgentPriceInPaise(durationDays: number) {
  const safeDays = Math.max(1, Math.min(90, Math.round(durationDays || 0)));
  if (safeDays <= 3) return 9900;
  if (safeDays <= 7) return 19900;
  if (safeDays <= 14) return 34900;
  if (safeDays <= 30) return 59900;
  return 59900 + Math.round((safeDays - 30) * 1200);
}

export async function createGigUrgentOrder(actor: User, gigId: string, durationDays: number) {
  const gigs = await getGigListings();
  const target = gigs.find((gig) => gig.id === gigId);
  if (!target) throw new Error('Gig not found.');

  const actorOwnsGig = target.ownerUserId === actor.id || target.organizationId === gigOwnerId(actor) || actor.role === 'admin';
  if (!actorOwnsGig) throw new Error('Not permitted to mark this gig urgent.');
  if (target.status !== 'published') throw new Error('Publish the gig before marking it urgent.');

  const razorpayConfig = getRazorpayConfig();
  if (!razorpayConfig.serverConfigured) {
    throw new Error('Razorpay payment gateway is not configured.');
  }

  const safeDays = Math.max(1, Math.min(90, Math.round(durationDays || 0)));
  const amountInPaise = calculateGigUrgentPriceInPaise(safeDays);
  const receipt = `gig_${actor.id.slice(0, 8)}_${Date.now().toString(36).slice(-8)}`;

  const auth = Buffer.from(`${razorpayConfig.keyId}:${razorpayConfig.keySecret}`).toString('base64');
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      authorization: `Basic ${auth}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      amount: amountInPaise,
      currency: 'INR',
      receipt,
      notes: {
        product: 'gigs_urgent',
        gigId: target.id,
        gigSlug: target.slug,
        ownerUserId: actor.id,
        durationDays: String(safeDays),
      },
    }),
  });

  const payload = await response.json().catch(() => null) as any;
  if (!response.ok || !payload?.id) {
    throw new Error(payload?.error?.description || 'Unable to create Razorpay order.');
  }

  await createPendingCommerceTransaction({
    user: actor,
    providerOrderId: String(payload.id),
    productType: 'gigs_urgent',
    productLabel: 'Gig boost (urgent)',
    baseAmountInPaise: amountInPaise,
    amountInPaise,
    quantity: safeDays,
    unitAmountInPaise: Math.round(amountInPaise / safeDays),
    gstRate: 0,
    notes: `Gig urgent boost (${target.id})`,
    receipt,
  });

  return {
    order: payload,
    amountInPaise,
    durationDays: safeDays,
    keyId: razorpayConfig.keyId,
    isTestMode: razorpayConfig.isTestMode,
  };
}

export async function verifyGigUrgentPayment(actor: User, params: {
  gigId: string;
  durationDays: number;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}) {
  const gigs = await getGigListings();
  const target = gigs.find((gig) => gig.id === params.gigId);
  if (!target) throw new Error('Gig not found.');

  const actorOwnsGig = target.ownerUserId === actor.id || target.organizationId === gigOwnerId(actor) || actor.role === 'admin';
  if (!actorOwnsGig) throw new Error('Not permitted to mark this gig urgent.');

  const isValid = verifyRazorpayPaymentSignature(params.razorpay_order_id, params.razorpay_payment_id, params.razorpay_signature);
  if (!isValid) {
    throw new Error('Razorpay payment signature verification failed.');
  }

  const now = new Date();
  const durationDays = Math.max(1, Math.min(90, Math.round(params.durationDays || 0)));
  const currentUntil = (target as any).urgentUntil || (target as any).featuredUntil;
  const baseline = currentUntil && new Date(currentUntil).getTime() > now.getTime()
    ? new Date(currentUntil)
    : now;
  const urgentUntil = new Date(baseline.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();
  const amountInPaise = calculateGigUrgentPriceInPaise(durationDays);

  const nextGig: GigListing = {
    ...target,
    urgentUntil,
    urgentPayment: {
      provider: 'razorpay',
      orderId: params.razorpay_order_id,
      paymentId: params.razorpay_payment_id,
      signature: params.razorpay_signature,
      amountInPaise,
      currency: 'INR',
      purchasedAt: now.toISOString(),
      durationDays,
    },
    updatedAt: now.toISOString(),
  };

  await saveGigListings(gigs.map((gig) => gig.id === nextGig.id ? nextGig : gig));
  return nextGig;
}

export async function createGigBid(actor: User, payload: {
  gigId: string;
  amountInRupees: number;
  timelineLabel?: string;
  note: string;
}) {
  const suspendedUntil = actor.safety?.suspendedUntil ? new Date(actor.safety.suspendedUntil) : null;
  if (suspendedUntil && Number.isFinite(suspendedUntil.getTime()) && suspendedUntil.getTime() > Date.now()) {
    throw new Error(`Your account is temporarily suspended from bidding until ${suspendedUntil.toLocaleString('en-IN')}.`);
  }

  const gigs = await getGigListings();
  const gig = gigs.find((entry) => entry.id === payload.gigId);
  if (!gig || gig.status !== 'published') {
    throw new Error('This gig is not open right now.');
  }
  if ((gig.bidMode || 'fixed') !== 'bidding') {
    throw new Error('This gig is not accepting bids.');
  }
  if (gig.ownerUserId === actor.id) {
    throw new Error('You cannot bid on your own gig.');
  }
  if (gig.bidRules?.bidDeadlineAt) {
    const deadline = new Date(gig.bidRules.bidDeadlineAt);
    if (Number.isFinite(deadline.getTime()) && Date.now() > deadline.getTime()) {
      throw new Error('Bidding is closed for this gig.');
    }
  }

  const amount = Math.max(0, Math.round(Number(payload.amountInRupees) || 0));
  const minBid = Math.max(0, Math.round(Number(gig.bidRules?.minBidInRupees || 0)));
  if (minBid && amount < minBid) {
    throw new Error(`Minimum bid is ₹${minBid}.`);
  }
  if (!payload.note.trim()) {
    throw new Error('Add a short note with your bid.');
  }

  const bids = await getGigBids();
  const existing = bids.find((entry) => entry.gigId === gig.id && entry.bidderUserId === actor.id && entry.status !== 'withdrawn');
  if (existing) {
    throw new Error('You have already submitted a bid for this gig.');
  }

  const now = new Date().toISOString();
  const bid: GigBid = {
    id: `gig-bid-${Date.now()}`,
    gigId: gig.id,
    gigSlug: gig.slug,
    gigTitle: gig.title,
    ownerUserId: gig.ownerUserId,
    bidderUserId: actor.id,
    bidderName: actor.name || 'Docrud user',
    bidderEmail: actor.email || 'bidder@docrud.local',
    bidderOrganization: actor.organizationName,
    amountInRupees: amount,
    currency: 'INR',
    timelineLabel: payload.timelineLabel?.trim() || undefined,
    note: payload.note.trim(),
    status: 'submitted',
    createdAt: now,
    updatedAt: now,
  };

  await saveGigBids([bid, ...bids]);
  return bid;
}

export async function updateGigBidStatus(actor: User, id: string, status: GigBid['status'], origin?: string) {
  const bids = await getGigBids();
  const target = bids.find((entry) => entry.id === id);
  if (!target) return null;
  if (target.ownerUserId !== actor.id && actor.role !== 'admin') {
    throw new Error('Not permitted to update this bid.');
  }

  if (status === 'accepted') {
    const gigs = await getGigListings();
    const gig = gigs.find((g) => g.id === target.gigId) || null;
    if (!gig) throw new Error('Gig not found.');
    if (gig.status !== 'published') throw new Error('Only published gigs can accept bids.');

    const now = new Date().toISOString();

    const nextBids = bids.map((entry) => {
      if (entry.gigId !== target.gigId) return entry;
      if (entry.id === id) return { ...entry, status: 'accepted' as const, updatedAt: now };
      if (entry.status === 'withdrawn') return entry;
      if (entry.status === 'accepted') return { ...entry, status: 'rejected' as const, updatedAt: now };
      return { ...entry, status: 'rejected' as const, updatedAt: now };
    });
    await saveGigBids(nextBids);

    const nextGig: GigListing = {
      ...gig,
      status: 'closed',
      acceptedBid: {
        bidId: target.id,
        bidderUserId: target.bidderUserId,
        bidderName: target.bidderName,
        bidderEmail: target.bidderEmail,
        acceptedAt: now,
      },
      updatedAt: now,
    };
    await saveGigListings(gigs.map((g) => g.id === gig.id ? nextGig : g));

    if (origin) {
      const subject = `Accepted: ${gig.title}`;
      const bidderEmail = target.bidderEmail;
      const gigUrl = `${origin}/gigs/${encodeURIComponent(gig.slug)}`;
      const workspaceUrl = `${origin}/workspace`;
      await sendTrackedMail({
        policyKey: 'gigs_notifications',
        typeLabel: 'system',
        to: bidderEmail,
        subject,
        preheader: `Your bid was accepted for ${gig.title}.`,
        text: `Good news — your bid was accepted.\n\nGig: ${gig.title}\nView gig: ${gigUrl}\nWorkspace: ${workspaceUrl}\n\nNext steps:\n- Reply fast and confirm timeline.\n- Share any portfolio links or clarifications.\n`,
        html: `
          <div style="padding: 18px 18px 0;">
            <p style="margin: 0; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: #64748b; font-weight: 700;">Bid accepted</p>
            <h2 style="margin: 10px 0 0; font-size: 22px; color: #0f172a;">${gig.title}</h2>
            <p style="margin: 10px 0 0; font-size: 14px; color: #334155; line-height: 1.7;">You’ve been selected. Reply quickly, confirm availability, and lock the next steps.</p>
          </div>
          <div style="padding: 18px;">
            <div style="border: 1px solid #e2e8f0; border-radius: 18px; padding: 16px; background: #ffffff;">
              <div style="display:flex; justify-content:space-between; gap: 12px; font-size: 14px; color:#0f172a;">
                <div><strong>Status</strong><div style="color:#64748b; margin-top:4px;">Accepted</div></div>
                <div style="text-align:right;"><strong>Bid</strong><div style="color:#64748b; margin-top:4px;">₹${target.amountInRupees.toLocaleString('en-IN')}</div></div>
              </div>
            </div>
            <div style="margin-top: 14px; display:flex; gap:10px; flex-wrap:wrap;">
              <a href="${workspaceUrl}" style="display:inline-block; padding: 10px 14px; border-radius: 999px; background:#0f172a; color:white; text-decoration:none; font-weight:700; font-size:14px;">Open workspace</a>
              <a href="${gigUrl}" style="display:inline-block; padding: 10px 14px; border-radius: 999px; border:1px solid #e2e8f0; background:white; color:#0f172a; text-decoration:none; font-weight:700; font-size:14px;">View gig</a>
            </div>
            <div style="margin-top: 14px; border: 1px solid #e2e8f0; border-radius: 18px; padding: 14px; background: #f8fafc; color: #334155; font-size: 13px; line-height: 1.7;">
              <strong>Guidelines</strong>
              <ul style="margin: 10px 0 0; padding-left: 18px;">
                <li>Confirm timeline and deliverables in the first reply.</li>
                <li>Keep payment terms and milestones explicit.</li>
                <li>Share only relevant links/files; avoid off-platform payments.</li>
              </ul>
            </div>
          </div>
        `,
        origin,
        metadata: {
          gigId: gig.id,
          bidId: target.id,
          type: 'bid_accepted',
        },
      });
    }

    return nextBids.find((entry) => entry.id === id) || null;
  }

  const now = new Date().toISOString();
  const next = bids.map((entry) => entry.id === id ? { ...entry, status, updatedAt: now } : entry);
  await saveGigBids(next);
  return next.find((entry) => entry.id === id) || null;
}
