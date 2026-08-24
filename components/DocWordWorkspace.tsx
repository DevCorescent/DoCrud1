'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  BarChart2,
  Bot,
  Bold,
  ChevronDown,
  Clock,
  Copy,
  Download,
  FileDown,
  FilePlus2,
  FileText,
  FolderOpen,
  GripVertical,
  Heading1,
  Heading2,
  Eye,
  EyeOff,
  ImageIcon,
  Italic,
  LayoutTemplate,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Lock,
  Maximize2,
  Minimize2,
  MoonStar,
  Mic,
  PanelLeft,
  PanelRight,
  Plus,
  Minus,
  Printer,
  Quote,
  Redo2,
  Search,
  Share2,
  Sparkles,
  Star,
  SunMedium,
  Table2,
  Trash2,
  Type,
  Underline,
  Undo2,
  Unlock,
  Wand2,
  X,
  Palette,
  Pencil,
  PenLine,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ProcessProgress } from '@/components/ui/process-progress';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { buildAbsoluteAppUrl, buildQrImageUrl } from '@/lib/url';
import { useCollabEngine } from '@/lib/collabEngine';
import { sanitizeDocWordHtml } from '@/lib/security/html-sanitizer';
import CollabBar from '@/components/CollabBar';
import { DocWordAccessGroup, DocWordBlock, DocWordDocument, DocWordSelectionComment, DocWordTrackedChange, FileDirectoryLocker, SecureFileTransfer } from '@/types/document';
import PdfStudio from '@/components/PdfStudio';
import ScratchpadCenter from '@/components/ScratchpadCenter';
import { getDriveHandoffFile } from '@/lib/driveHandoff';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type AiMode =
  | 'summarize'
  | 'shorten'
  | 'expand'
  | 'hinglish_formal'
  | 'rewrite_formal'
  | 'rewrite_casual'
  | 'rewrite_concise'
  | 'fix'
  | 'generate';

type ExportMode = 'pdf' | 'docx' | 'txt' | 'html';
type DocaiMessageRole = 'assistant' | 'user';
type DocaiActionMode =
  | 'generate'
  | 'fix'
  | 'summarize'
  | 'reply'
  | 'rewrite_formal'
  | 'rewrite_concise'
  | 'proofread'
  | 'theme_classic'
  | 'theme_sky'
  | 'theme_linen'
  | 'theme_midnight'
  | 'heading_1'
  | 'heading_2'
  | 'bullets'
  | 'align_left'
  | 'align_center'
  | 'align_right'
  | 'watermark'
  | 'header'
  | 'footer';

type DocaiMessage = {
  id: string;
  role: DocaiMessageRole;
  text: string;
  mode?: DocaiActionMode;
  canApply?: boolean;
};

const slashOptions: Array<{ type: DocWordBlock['type']; label: string; description: string; icon: typeof Type }> = [
  { type: 'paragraph', label: 'Text', description: 'Start with a normal writing block.', icon: Type },
  { type: 'heading-1', label: 'Heading 1', description: 'Use a strong section title.', icon: Heading1 },
  { type: 'heading-2', label: 'Heading 2', description: 'Create a lighter section heading.', icon: Heading2 },
  { type: 'quote', label: 'Quote', description: 'Highlight a note or callout sentence.', icon: Quote },
  { type: 'callout', label: 'Callout', description: 'Surface a key action or reminder.', icon: LayoutTemplate },
  { type: 'table', label: 'Table', description: 'Drop in a fast 2-column table.', icon: Table2 },
  { type: 'image', label: 'Image', description: 'Embed an image with a caption.', icon: ImageIcon },
];

const aiActions: Array<{ mode: AiMode; label: string }> = [
  { mode: 'fix', label: 'Fix grammar' },
  { mode: 'hinglish_formal', label: 'Hinglish to formal' },
  { mode: 'rewrite_formal', label: 'Make formal' },
  { mode: 'rewrite_casual', label: 'Make casual' },
  { mode: 'rewrite_concise', label: 'Make concise' },
  { mode: 'expand', label: 'Expand' },
  { mode: 'shorten', label: 'Shorten' },
  { mode: 'summarize', label: 'Summarize' },
];

const docaiQuickActions: Array<{ mode: DocaiActionMode; label: string; prompt: string }> = [
  { mode: 'generate', label: 'Draft document', prompt: 'Draft a polished professional document from my instruction.' },
  { mode: 'proofread', label: 'Review doc', prompt: 'Review the current document like a professional reviewer and give concise actionable suggestions.' },
  { mode: 'rewrite_formal', label: 'Make formal', prompt: 'Rewrite my selected text or current content in a formal professional tone.' },
  { mode: 'rewrite_concise', label: 'Make concise', prompt: 'Make the current content shorter, sharper, and easier to scan.' },
  { mode: 'reply', label: 'Draft reply', prompt: 'Draft a professional reply to the current document or pasted text.' },
  { mode: 'summarize', label: 'Summarize', prompt: 'Summarize the current document into a crisp executive brief.' },
] as const;

const docaiThemeActions: Array<{ mode: DocaiActionMode; label: string }> = [
  { mode: 'theme_classic', label: 'Classic' },
  { mode: 'theme_sky', label: 'Sky Glass' },
  { mode: 'theme_linen', label: 'Warm Linen' },
  { mode: 'theme_midnight', label: 'Midnight' },
] as const;

const docaiFormatActions: Array<{ mode: DocaiActionMode; label: string }> = [
  { mode: 'heading_1', label: 'H1' },
  { mode: 'heading_2', label: 'H2' },
  { mode: 'bullets', label: 'Bullets' },
  { mode: 'align_left', label: 'Left' },
  { mode: 'align_center', label: 'Center' },
  { mode: 'align_right', label: 'Right' },
] as const;

const DOCWORD_FAVORITES_FOLDER = 'Favorites';

const templateCatalog = [
  {
    id: 'blank',
    name: 'Blank professional',
    description: 'A clean writing surface for proposals, notes, and polished drafts.',
    preview: ['Executive summary', 'Problem', 'Approach', 'Next steps'],
    emoji: '✍️',
    blocks: [
      createBlock('heading-1', 'Untitled document'),
      createBlock('paragraph', 'Start with your opening thought, context, or brief.'),
    ],
  },
  {
    id: 'proposal',
    name: 'Business proposal',
    description: 'Structured like an MNC-ready proposal with scope, outcomes, and commercials.',
    preview: ['Overview', 'Scope of work', 'Timeline', 'Commercials'],
    emoji: '📈',
    blocks: [
      createBlock('heading-1', 'Business proposal'),
      createBlock('paragraph', 'A sharp executive snapshot of what is being proposed and why it matters.'),
      createBlock('heading-2', 'Scope of work'),
      createBlock('paragraph', 'Outline deliverables, ownership, and success criteria.'),
      createBlock('heading-2', 'Timeline'),
      createBlock('table', ''),
    ],
  },
  {
    id: 'meeting',
    name: 'Meeting notes',
    description: 'Fast notes with agenda, decisions, and action items already shaped.',
    preview: ['Agenda', 'Discussion', 'Decisions', 'Action items'],
    emoji: '📝',
    blocks: [
      createBlock('heading-1', 'Meeting notes'),
      createBlock('heading-2', 'Agenda'),
      createBlock('paragraph', 'Capture the discussion agenda in one place.'),
      createBlock('heading-2', 'Decisions'),
      createBlock('quote', 'List the final decisions and responsible owners.'),
    ],
  },
  {
    id: 'job-brief',
    name: 'Hiring brief',
    description: 'For role briefs, team context, success metrics, and interview notes.',
    preview: ['Role summary', 'What success looks like', 'Requirements', 'Interview plan'],
    emoji: '💼',
    blocks: [
      createBlock('heading-1', 'Hiring brief'),
      createBlock('heading-2', 'Role summary'),
      createBlock('paragraph', 'Summarize the role, mandate, and reporting structure.'),
      createBlock('heading-2', 'Requirements'),
      createBlock('paragraph', 'List must-have capabilities, tools, and experience.'),
    ],
  },
  {
    id: 'leave-application',
    name: 'Leave application',
    description: 'A clean leave request for school, college, or office use in India.',
    preview: ['Recipient', 'Dates', 'Reason', 'Closing'],
    emoji: '🗓️',
    blocks: [
      createBlock('heading-1', 'Leave application'),
      createBlock('paragraph', 'Respected Sir/Madam,'),
      createBlock('paragraph', 'I am writing to request leave for the required dates.'),
      createBlock('paragraph', 'Thank you for your consideration.'),
    ],
  },
  {
    id: 'rental-agreement',
    name: 'Rental agreement',
    description: 'A basic India-ready rental draft with parties, rent, deposit, and term.',
    preview: ['Parties', 'Property', 'Rent', 'Deposit'],
    emoji: '🏠',
    blocks: [
      createBlock('heading-1', 'Rental agreement'),
      createBlock('paragraph', 'This rental agreement is made between the landlord and the tenant.'),
      createBlock('heading-2', 'Property details'),
      createBlock('paragraph', 'Mention the full address and occupancy terms.'),
      createBlock('heading-2', 'Rent and deposit'),
      createBlock('paragraph', 'Capture rent, due date, and security deposit.'),
    ],
  },
  {
    id: 'rti-request',
    name: 'RTI request',
    description: 'A clear Right to Information application with a structured ask.',
    preview: ['Authority', 'Information requested', 'Period', 'Applicant'],
    emoji: '🏛️',
    blocks: [
      createBlock('heading-1', 'RTI application'),
      createBlock('paragraph', 'To, The Public Information Officer'),
      createBlock('paragraph', 'I am seeking the following information under the Right to Information Act.'),
    ],
  },
  {
    id: 'gst-quotation',
    name: 'GST quotation',
    description: 'A professional quotation for small businesses with GST context.',
    preview: ['Client', 'Scope', 'Pricing', 'GST'],
    emoji: '💼',
    blocks: [
      createBlock('heading-1', 'Quotation'),
      createBlock('paragraph', 'Please find below the quotation for the requested work or supply.'),
      createBlock('table', ''),
    ],
  },
  {
    id: 'complaint-letter',
    name: 'Complaint letter',
    description: 'A structured complaint format for civic, service, or institutional use.',
    preview: ['Issue', 'Location', 'Impact', 'Requested action'],
    emoji: '📮',
    blocks: [
      createBlock('heading-1', 'Complaint letter'),
      createBlock('paragraph', 'I am writing to formally raise a complaint regarding the following issue.'),
    ],
  },
  {
    id: 'student-assignment',
    name: 'Student assignment cover',
    description: 'A clean academic front page and submission format for Indian colleges.',
    preview: ['Student', 'College', 'Subject', 'Submission'],
    emoji: '🎓',
    blocks: [
      createBlock('heading-1', 'Assignment submission'),
      createBlock('paragraph', 'Student name, course, subject, and faculty details.'),
      createBlock('heading-2', 'Declaration'),
      createBlock('paragraph', 'I hereby declare that this assignment is my original work.'),
    ],
  },
] as const;

const fontFamilies = ['Inter', 'Arial', 'Helvetica', 'Poppins', 'Georgia', 'Times New Roman', 'Verdana', 'Trebuchet MS'] as const;
const zoomLevels = ['80%', '90%', '100%', '110%', '125%'] as const;
const lineSpacingLevels = [
  { label: 'Tight', value: '1.3' },
  { label: 'Normal', value: '1.6' },
  { label: 'Relaxed', value: '1.9' },
] as const;
const documentThemes = [
  { id: 'classic', label: 'Classic', surface: 'bg-white border-slate-300', canvas: '' },
  { id: 'sky', label: 'Sky Glass', surface: 'bg-[linear-gradient(180deg,#fdfefe_0%,#edf6ff_100%)] border-sky-200', canvas: 'shadow-[0_24px_70px_rgba(14,116,144,0.10)]' },
  { id: 'linen', label: 'Warm Linen', surface: 'bg-[linear-gradient(180deg,#fffdf8_0%,#fbf3e2_100%)] border-amber-200', canvas: 'shadow-[0_24px_70px_rgba(146,64,14,0.08)]' },
  { id: 'midnight', label: 'Midnight', surface: 'bg-[linear-gradient(180deg,#0f172a_0%,#172554_100%)] border-slate-700 text-white', canvas: 'shadow-[0_24px_70px_rgba(15,23,42,0.35)]' },
] as const;
const starterChips = [
  { label: 'Templates', action: 'templates', icon: LayoutTemplate },
  { label: 'Meeting notes', action: 'meeting', icon: FileText },
  { label: 'Email draft', action: 'email', icon: Share2 },
  { label: 'AI section', action: 'ai', icon: Sparkles },
];

const proofreaderModes = [
  {
    id: 'aarav',
    name: 'Aarav Clarity',
    focus: 'Makes writing sharper, simpler, and easier to read.',
    tone: 'sky',
  },
  {
    id: 'meera',
    name: 'Meera Tone',
    focus: 'Improves tone, professionalism, and recipient fit.',
    tone: 'violet',
  },
  {
    id: 'kabir',
    name: 'Kabir Structure',
    focus: 'Flags weak structure, sequencing, and missing sections.',
    tone: 'emerald',
  },
  {
    id: 'isha',
    name: 'Isha Executive',
    focus: 'Pushes for business clarity, decisions, and executive polish.',
    tone: 'amber',
  },
] as const;

const selectionAssistModes = [
  { id: 'grammar', label: 'Grammar', mode: 'fix' as const, hint: 'Fix grammar and clarity only.' },
  { id: 'formal', label: 'Formal', mode: 'rewrite_formal' as const, hint: 'Make the selected text more formal while keeping it short.' },
  { id: 'friendly', label: 'Friendly', mode: 'rewrite_casual' as const, hint: 'Make the selected text warmer and more natural without expanding it.' },
  { id: 'concise', label: 'Concise', mode: 'rewrite_concise' as const, hint: 'Shorten the selected text and keep the meaning intact.' },
  { id: 'english', label: 'English', mode: 'translate_english' as const, hint: 'Translate the selected text into clean professional English only.' },
  { id: 'hindi', label: 'Hindi', mode: 'translate_hindi' as const, hint: 'Translate the selected text into clean professional Hindi only.' },
] as const;

type GuidedField = {
  id: string;
  label: string;
  placeholder: string;
};

type GuidedPreset = {
  id: string;
  title: string;
  emoji: string;
  category: 'government' | 'business' | 'student' | 'personal' | 'legal';
  description: string;
  folderName: string;
  fields: GuidedField[];
  build: (answers: Record<string, string>, profile: DocWordProfile) => { title: string; summary: string; blocks: DocWordBlock[] };
};

type DocWordProfile = {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  aadhaarNumber: string;
  panNumber: string;
  gstNumber: string;
  collegeName: string;
  companyName: string;
};

const emptyDocWordProfile: DocWordProfile = {
  fullName: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  aadhaarNumber: '',
  panNumber: '',
  gstNumber: '',
  collegeName: '',
  companyName: '',
};

function fillValue(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

function buildDocBlocksFromLines(lines: string[]) {
  return lines
    .filter(Boolean)
    .map((line, index) => {
      if (index === 0) return createBlock('heading-1', line);
      if (line.endsWith(':')) return createBlock('heading-2', line);
      return createBlock('paragraph', `<p>${line.replace(/\n/g, '<br/>')}</p>`);
    });
}

const guidedPresets: GuidedPreset[] = [
  {
    id: 'leave',
    title: 'Leave application',
    emoji: '🗓️',
    category: 'personal',
    description: 'Quick office, school, or college leave letters for India.',
    folderName: 'Personal letters',
    fields: [
      { id: 'recipient', label: 'Recipient name or role', placeholder: 'HR Manager / Principal / Reporting Manager' },
      { id: 'days', label: 'Leave duration', placeholder: '3 days' },
      { id: 'fromDate', label: 'From date', placeholder: '15 April 2026' },
      { id: 'toDate', label: 'To date', placeholder: '17 April 2026' },
      { id: 'reason', label: 'Reason', placeholder: 'Fever / family function / personal work' },
    ],
    build: (answers, profile) => ({
      title: `Leave Application - ${fillValue(profile.fullName, 'Applicant')}`,
      summary: `Leave request for ${fillValue(answers.days, 'the requested period')}.`,
      blocks: buildDocBlocksFromLines([
        'Leave Application',
        `To: ${fillValue(answers.recipient, 'Concerned authority')}`,
        `Respected Sir/Madam,`,
        `I, ${fillValue(profile.fullName, 'the undersigned')}, respectfully request leave for ${fillValue(answers.days, 'the required duration')} from ${fillValue(answers.fromDate, 'the requested date')} to ${fillValue(answers.toDate, 'the requested date')} due to ${fillValue(answers.reason, 'personal reasons')}.`,
        'I request you to kindly approve my leave. I will ensure any urgent work is handled responsibly.',
        `Sincerely,`,
        fillValue(profile.fullName, 'Applicant'),
        profile.phone ? `Contact: ${profile.phone}` : '',
      ]),
    }),
  },
  {
    id: 'rental',
    title: 'Rental agreement draft',
    emoji: '🏠',
    category: 'legal',
    description: 'Basic residential rental draft shaped for Indian city use.',
    folderName: 'Legal drafts',
    fields: [
      { id: 'landlord', label: 'Landlord name', placeholder: 'Landlord full name' },
      { id: 'tenant', label: 'Tenant name', placeholder: 'Tenant full name' },
      { id: 'property', label: 'Property address', placeholder: 'Full rented property address' },
      { id: 'city', label: 'City', placeholder: 'Bangalore / Pune / Delhi' },
      { id: 'rent', label: 'Monthly rent', placeholder: '₹25,000' },
      { id: 'deposit', label: 'Security deposit', placeholder: '₹75,000' },
      { id: 'term', label: 'Agreement term', placeholder: '11 months' },
    ],
    build: (answers) => ({
      title: `Rental Agreement - ${fillValue(answers.city, 'India')}`,
      summary: `Residential rental draft for ${fillValue(answers.property, 'the listed property')}.`,
      blocks: buildDocBlocksFromLines([
        'Rental Agreement',
        `This agreement is made between ${fillValue(answers.landlord, 'the landlord')} and ${fillValue(answers.tenant, 'the tenant')} for the property at ${fillValue(answers.property, 'the stated premises')}, ${fillValue(answers.city, 'India')}.`,
        `The monthly rent shall be ${fillValue(answers.rent, 'as agreed')} and the refundable security deposit shall be ${fillValue(answers.deposit, 'as agreed')}.`,
        `The term of this agreement shall be ${fillValue(answers.term, '11 months')} unless extended or terminated by mutual agreement.`,
        'Suggested clauses:',
        'Use of property shall remain residential only.',
        'Rent shall be payable on or before the agreed due date each month.',
        'Security deposit shall be refunded after lawful deductions, if any.',
      ]),
    }),
  },
  {
    id: 'rti',
    title: 'RTI application',
    emoji: '🏛️',
    category: 'government',
    description: 'A clean Right to Information request with a clear ask.',
    folderName: 'Government documents',
    fields: [
      { id: 'authority', label: 'Public authority', placeholder: 'Department / office name' },
      { id: 'info', label: 'Information requested', placeholder: 'List the information required' },
      { id: 'period', label: 'Relevant period', placeholder: '2023 to 2025' },
      { id: 'purpose', label: 'Context or subject', placeholder: 'Matter or subject reference' },
    ],
    build: (answers, profile) => ({
      title: `RTI Application - ${fillValue(answers.authority, 'PIO')}`,
      summary: 'Structured RTI request ready for submission.',
      blocks: buildDocBlocksFromLines([
        'RTI Application',
        `To: The Public Information Officer, ${fillValue(answers.authority, 'Concerned Public Authority')}`,
        `Subject: Request for information regarding ${fillValue(answers.purpose, 'the stated matter')}`,
        `Under the Right to Information Act, I request the following information for the period ${fillValue(answers.period, 'relevant period')}: ${fillValue(answers.info, 'information requested')}.`,
        `Applicant: ${fillValue(profile.fullName, 'Applicant')}`,
        profile.address ? `Address: ${profile.address}` : '',
        profile.phone ? `Contact: ${profile.phone}` : '',
      ]),
    }),
  },
  {
    id: 'quotation',
    title: 'GST quotation',
    emoji: '💼',
    category: 'business',
    description: 'Client-ready quotation with GST and scope structure.',
    folderName: 'Business docs',
    fields: [
      { id: 'client', label: 'Client / company name', placeholder: 'Client name' },
      { id: 'scope', label: 'Work or items', placeholder: 'Description of work / supply' },
      { id: 'amount', label: 'Base amount', placeholder: '₹50,000' },
      { id: 'gst', label: 'GST rate', placeholder: '18%' },
      { id: 'timeline', label: 'Delivery timeline', placeholder: '7 working days' },
    ],
    build: (answers, profile) => ({
      title: `Quotation - ${fillValue(answers.client, 'Client')}`,
      summary: 'Small-business quotation with GST context.',
      blocks: buildDocBlocksFromLines([
        'Quotation',
        `From: ${fillValue(profile.companyName || profile.fullName, 'Business name')}`,
        `To: ${fillValue(answers.client, 'Client')}`,
        `Scope: ${fillValue(answers.scope, 'Work or items to be supplied')}`,
        `Base amount: ${fillValue(answers.amount, 'As discussed')}`,
        `Applicable GST: ${fillValue(profile.gstNumber, fillValue(answers.gst, 'As applicable'))}`,
        `Delivery timeline: ${fillValue(answers.timeline, 'As agreed')}`,
      ]),
    }),
  },
  {
    id: 'complaint',
    title: 'Complaint letter',
    emoji: '📮',
    category: 'government',
    description: 'Complaint draft for civic, service, college, or institutional issues.',
    folderName: 'Letters',
    fields: [
      { id: 'recipient', label: 'Recipient / authority', placeholder: 'Officer / company / college office' },
      { id: 'issue', label: 'Issue', placeholder: 'The exact problem being reported' },
      { id: 'location', label: 'Location / reference', placeholder: 'Area, branch, or service reference' },
      { id: 'impact', label: 'Impact', placeholder: 'How this is affecting you or others' },
    ],
    build: (answers, profile) => ({
      title: `Complaint Letter - ${fillValue(answers.issue, 'Issue')}`,
      summary: 'Formal complaint letter ready for submission.',
      blocks: buildDocBlocksFromLines([
        'Complaint Letter',
        `To: ${fillValue(answers.recipient, 'Concerned authority')}`,
        `I, ${fillValue(profile.fullName, 'the undersigned')}, would like to formally bring to your attention the issue of ${fillValue(answers.issue, 'the reported problem')} at ${fillValue(answers.location, 'the stated location')}.`,
        `This has caused the following impact: ${fillValue(answers.impact, 'Please review and take necessary action.')}.`,
        'I request you to kindly look into the matter and resolve it at the earliest.',
      ]),
    }),
  },
  {
    id: 'assignment',
    title: 'Assignment front page',
    emoji: '🎓',
    category: 'student',
    description: 'Academic cover page and declaration for Indian colleges.',
    folderName: 'Student mode',
    fields: [
      { id: 'subject', label: 'Subject', placeholder: 'Subject name' },
      { id: 'topic', label: 'Assignment topic', placeholder: 'Topic title' },
      { id: 'faculty', label: 'Faculty name', placeholder: 'Faculty or guide name' },
      { id: 'rollNumber', label: 'Roll number', placeholder: 'Roll number' },
    ],
    build: (answers, profile) => ({
      title: `Assignment - ${fillValue(answers.topic, 'Submission')}`,
      summary: 'Student submission page with declaration.',
      blocks: buildDocBlocksFromLines([
        'Assignment Submission',
        `Student name: ${fillValue(profile.fullName, 'Student')}`,
        `College: ${fillValue(profile.collegeName, 'College name')}`,
        `Subject: ${fillValue(answers.subject, 'Subject')}`,
        `Topic: ${fillValue(answers.topic, 'Assignment topic')}`,
        `Faculty: ${fillValue(answers.faculty, 'Faculty name')}`,
        `Roll number: ${fillValue(answers.rollNumber, 'Roll number')}`,
        'Declaration:',
        'I hereby declare that this assignment is my original work and has been prepared for academic submission.',
      ]),
    }),
  },
];

function createSharePassword(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function createDocShareToken() {
  return `dwshare_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function createGuestId() {
  return `docword_guest_${Math.random().toString(36).slice(2, 12)}`;
}

function stripHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h1|h2|h3|blockquote|aside)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function clampFontPointSize(value: string | number, fallback = 11) {
  const parsed = Number(String(value).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(parsed)) return String(fallback);
  return String(Math.min(48, Math.max(8, Math.round(parsed))));
}

function cssLengthToPointSize(value: string | null | undefined, fallback = 11) {
  if (!value) return String(fallback);
  const trimmed = value.trim().toLowerCase();
  const numeric = Number.parseFloat(trimmed);
  if (!Number.isFinite(numeric)) return String(fallback);
  if (trimmed.endsWith('px')) {
    return clampFontPointSize(numeric * 0.75, fallback);
  }
  if (trimmed.endsWith('pt')) {
    return clampFontPointSize(numeric, fallback);
  }
  return clampFontPointSize(numeric, fallback);
}

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function estimateReadTime(value: string) {
  return Math.max(1, Math.ceil(countWords(value) / 220));
}

function createBlock(type: DocWordBlock['type'] = 'paragraph', html = ''): DocWordBlock {
  return {
    id: `block_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    html,
    text: stripHtml(html),
    meta:
      type === 'table'
        ? {
            columns: ['Item', 'Notes'],
            rows: [
              ['Row one', 'Add notes here'],
              ['Row two', 'Keep editing'],
            ],
          }
        : type === 'image'
          ? { src: '', alt: '' }
          : undefined,
  };
}

function buildHtml(blocks: DocWordBlock[]) {
  const assembled = blocks
    .map((block) => {
      if (block.type === 'image') {
        return block.meta?.src
          ? `<figure><img src="${block.meta.src}" alt="${block.meta.alt || 'DocWord image'}" /><figcaption>${block.html || ''}</figcaption></figure>`
          : '';
      }
      if (block.type === 'table') {
        const columns = block.meta?.columns || ['Column 1', 'Column 2'];
        const rows = block.meta?.rows || [['', '']];
        return `<table><thead><tr>${columns.map((column) => `<th>${column}</th>`).join('')}</tr></thead><tbody>${rows
          .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
          .join('')}</tbody></table>`;
      }
      const tag =
        block.type === 'heading-1'
          ? 'h1'
          : block.type === 'heading-2'
            ? 'h2'
            : block.type === 'heading-3'
              ? 'h3'
              : block.type === 'quote'
                ? 'blockquote'
                : block.type === 'callout'
                  ? 'aside'
                  : 'div';
      return `<${tag}>${block.html || ''}</${tag}>`;
    })
    .join('\n');
  // Sanitize the fully-assembled HTML (block content AND interpolated
  // image/table-cell values) before it is rendered/printed/exported.
  return sanitizeDocWordHtml(assembled);
}

function buildDocumentMarkup(document: DocWordDocument) {
  const watermark = document.watermarkText?.trim();
  const header = hasMeaningfulRegionContent(document.headerHtml) ? document.headerHtml!.trim() : '';
  const footer = hasMeaningfulRegionContent(document.footerHtml) ? document.footerHtml!.trim() : '';
  const body = buildHtml(document.blocks);

  return `
    ${watermark ? `<div class="docword-export-watermark" aria-hidden="true">${watermark}</div>` : ''}
    <div class="docword-export-page-flow">
      ${header ? `<header class="docword-export-header">${header}</header>` : ''}
      <div class="docword-export-body">${body}</div>
      ${footer ? `<footer class="docword-export-footer">${footer}</footer>` : ''}
    </div>
  `.trim();
}

function hasMeaningfulRegionContent(html?: string | null) {
  const value = (html || '').trim();
  return !(!value || value === '<br>' || value === '<div><br></div>' || value === '<p><br></p>' || value === '&nbsp;');
}

function createTrackedChangeEntry(input: Omit<DocWordTrackedChange, 'id' | 'createdAt' | 'status'>): DocWordTrackedChange {
  return {
    id: `dwc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    status: 'pending',
    ...input,
  };
}

function createSelectionCommentEntry(input: Omit<DocWordSelectionComment, 'id' | 'createdAt'>): DocWordSelectionComment {
  return {
    id: `dwsc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...input,
  };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to prepare the exported file.'));
    reader.readAsDataURL(blob);
  });
}

function resolveBlockClass(type: DocWordBlock['type'], darkMode: boolean) {
  if (type === 'heading-1') return cn('text-[2rem] font-semibold tracking-[-0.04em]', darkMode ? 'text-white' : 'text-slate-950');
  if (type === 'heading-2') return cn('text-[1.4rem] font-semibold tracking-[-0.03em]', darkMode ? 'text-slate-100' : 'text-slate-900');
  if (type === 'quote') return cn('border-l-2 pl-4 italic', darkMode ? 'border-white/30 text-slate-300' : 'border-slate-300 text-slate-600');
  if (type === 'callout') return cn('rounded-2xl px-4 py-3', darkMode ? 'bg-white/8 text-slate-100' : 'bg-sky-50 text-slate-800');
  return cn('text-base leading-7', darkMode ? 'text-slate-200' : 'text-slate-700');
}

function BlockContentEditable({
  block,
  darkMode,
  placeholder,
  onChange,
  onFocus,
}: {
  block: DocWordBlock;
  darkMode: boolean;
  placeholder: string;
  onChange: (html: string) => void;
  onFocus: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const safe = sanitizeDocWordHtml(block.html);
    if (ref.current.innerHTML !== safe) {
      ref.current.innerHTML = safe;
    }
  }, [block.html]);

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      data-docword-block-id={block.id}
      data-placeholder={placeholder}
      className={cn(
        'docword-editable min-h-[32px] rounded-2xl px-3 py-2 outline-none transition',
        resolveBlockClass(block.type, darkMode),
      )}
      onFocus={onFocus}
      onInput={(event) => onChange((event.currentTarget as HTMLDivElement).innerHTML)}
    />
  );
}

function DocPageRegionEditable({
  html,
  darkMode,
  placeholder,
  region,
  regionRef,
  onChange,
}: {
  html: string;
  darkMode: boolean;
  placeholder: string;
  region: 'header' | 'footer';
  regionRef?: React.MutableRefObject<HTMLDivElement | null>;
  onChange: (html: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [draftHtml, setDraftHtml] = useState(html || '');

  const normalizedHtml = useMemo(() => {
    const value = (draftHtml || '').trim();
    if (!value || value === '<br>' || value === '<div><br></div>' || value === '<p><br></p>') {
      return '';
    }
    return draftHtml;
  }, [draftHtml]);

  useEffect(() => {
    if (isFocused) return;
    setDraftHtml(html || '');
  }, [html, isFocused]);

  useEffect(() => {
    if (!ref.current) return;
    if (isFocused) return;
    const safe = sanitizeDocWordHtml(normalizedHtml);
    if (ref.current.innerHTML !== safe) {
      ref.current.innerHTML = safe;
    }
  }, [isFocused, normalizedHtml]);

  return (
    <div
      ref={(node) => {
        ref.current = node;
        if (regionRef) {
          regionRef.current = node;
        }
      }}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      className={cn(
        'docword-editable min-h-[54px] rounded-2xl px-3 py-3 outline-none transition',
        region === 'header' ? 'pb-2' : 'pt-2',
        darkMode
          ? 'bg-white/[0.02] text-slate-300 ring-1 ring-white/[0.05] focus:bg-white/[0.04]'
          : 'bg-white/70 text-slate-600 ring-1 ring-slate-200/80 focus:bg-white',
      )}
      onFocus={() => setIsFocused(true)}
      onBlur={(event) => {
        setIsFocused(false);
        const nextHtml = (event.currentTarget as HTMLDivElement).innerHTML;
        setDraftHtml(nextHtml);
        onChange(nextHtml);
      }}
      onInput={(event) => {
        setDraftHtml((event.currentTarget as HTMLDivElement).innerHTML);
      }}
    />
  );
}

function DocWordPreviewPage({
  document,
  darkMode,
  editorFontFamily,
  editorZoom,
  editorLineSpacing,
  textColor,
}: {
  document: DocWordDocument;
  darkMode: boolean;
  editorFontFamily: string;
  editorZoom: string;
  editorLineSpacing: string;
  textColor: string;
}) {
  const documentThemeConfig = documentThemes.find((item) => item.id === (document.documentTheme || 'classic')) || documentThemes[0];
  const activeDocumentTheme = document.documentTheme || 'classic';
  const hasHeader = hasMeaningfulRegionContent(document.headerHtml);
  const hasFooter = hasMeaningfulRegionContent(document.footerHtml);

  return (
    <div className="mx-auto max-w-[980px]">
      <div
        className={cn(
          'relative mx-auto flex min-h-[70vh] flex-col overflow-hidden rounded-[0.4rem] border px-4 py-8 sm:px-10 sm:py-12',
          darkMode
            ? 'border-slate-300/20 bg-[#f4f5f7] shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_32px_rgba(0,0,0,0.55),0_32px_80px_rgba(0,0,0,0.38)]'
            : cn('shadow-[0_22px_70px_rgba(15,23,42,0.08)]', documentThemeConfig.surface, documentThemeConfig.canvas),
        )}
        style={{ fontFamily: editorFontFamily, zoom: editorZoom, lineHeight: editorLineSpacing, color: darkMode ? '#1a202c' : textColor }}
      >
        {document.watermarkText?.trim() ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 text-center font-semibold uppercase tracking-[0.28em] text-slate-900/[0.07]"
            style={{ fontSize: 'clamp(2rem, 6vw, 4.8rem)', transform: 'rotate(-28deg)' }}
          >
            {document.watermarkText}
          </div>
        ) : null}

        {hasHeader ? (
          <div
            className="relative z-[1] mb-6 rounded-t-[0.9rem] border-b border-slate-200 pb-4 text-sm leading-6 text-slate-600"
            dangerouslySetInnerHTML={{ __html: sanitizeDocWordHtml(document.headerHtml) }}
          />
        ) : null}

        <div className="relative z-[1] flex flex-1 flex-col">
          <div
            className="docword-export-body prose prose-slate max-w-none px-1 py-1"
            dangerouslySetInnerHTML={{ __html: buildHtml(document.blocks) }}
          />

          {hasFooter ? (
            <div
              className="relative z-[1] mt-8 rounded-b-[0.9rem] border-t border-slate-200 pt-4 text-sm leading-6 text-slate-600"
              dangerouslySetInnerHTML={{ __html: sanitizeDocWordHtml(document.footerHtml) }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function DocWordWorkspace() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [guestId, setGuestId] = useState('');
  const [documents, setDocuments] = useState<DocWordDocument[]>([]);
  const [currentDocumentId, setCurrentDocumentId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState('');
  const [activeBlockId, setActiveBlockId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [showPdfStudio, setShowPdfStudio] = useState(false);
  const [showScratchpad, setShowScratchpad] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [insight, setInsight] = useState('');
  const [inlineSuggestions, setInlineSuggestions] = useState<string[]>([]);
  const [inlineSuggestionsLoading, setInlineSuggestionsLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [activeFolderFilter, setActiveFolderFilter] = useState('All');
  const [newFolderName, setNewFolderName] = useState('');
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceValue, setReplaceValue] = useState('');
  const [editorZoom, setEditorZoom] = useState('100%');
  const [focusMode, setFocusMode] = useState(false);
  const [editorFontFamily, setEditorFontFamily] = useState<(typeof fontFamilies)[number]>('Inter');
  const [editorFontSize, setEditorFontSize] = useState('11');
  const [editorLineSpacing, setEditorLineSpacing] = useState<(typeof lineSpacingLevels)[number]['value']>('1.6');
  const [textColor, setTextColor] = useState('#111827');
  const [highlightColor, setHighlightColor] = useState('#fef3c7');
  const [previewMode, setPreviewMode] = useState(false);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [previewDocumentId, setPreviewDocumentId] = useState('');
  const [floatingToolbar, setFloatingToolbar] = useState<{ visible: boolean; x: number; y: number; placement: 'top' | 'bottom' }>({
    visible: false,
    x: 0,
    y: 0,
    placement: 'top',
  });
  const [selectionAssistantOpen, setSelectionAssistantOpen] = useState(false);
  const [selectionText, setSelectionText] = useState('');
  const [selectionTargetBlockId, setSelectionTargetBlockId] = useState('');
  const [selectionSuggestions, setSelectionSuggestions] = useState<string[]>([]);
  const [selectionSuggestionsLoading, setSelectionSuggestionsLoading] = useState(false);
  const [selectionAssistMode, setSelectionAssistMode] = useState<(typeof selectionAssistModes)[number]['id']>('grammar');
  const [selectionCommentDraft, setSelectionCommentDraft] = useState('');
  const [showGuidedCreator, setShowGuidedCreator] = useState(false);
  const [documentTags, setDocumentTags] = useState<Record<string, string[]>>({});
  const [guidedMode, setGuidedMode] = useState<'chat' | 'form'>('form');
  const [guidedPresetId, setGuidedPresetId] = useState<string>(guidedPresets[0]?.id || 'leave');
  const [guidedPrompt, setGuidedPrompt] = useState('');
  const [guidedAnswers, setGuidedAnswers] = useState<Record<string, string>>({});
  const [guidedLoading, setGuidedLoading] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [docProfile, setDocProfile] = useState<DocWordProfile>(emptyDocWordProfile);
  const [replySource, setReplySource] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [docaiOpen, setDocaiOpen] = useState(false);
  const [docaiInput, setDocaiInput] = useState('');
  const [docaiLoading, setDocaiLoading] = useState(false);
  const [docaiControlSection, setDocaiControlSection] = useState<'quick' | 'format' | 'theme'>('quick');
  const [pageRegionVisibility, setPageRegionVisibility] = useState<{ header: boolean; footer: boolean }>({ header: false, footer: false });
  const [docaiMessages, setDocaiMessages] = useState<DocaiMessage[]>([
    {
      id: 'docai-welcome',
      role: 'assistant',
      text: 'I am Docai. I can draft documents, rewrite sections, summarize content, and prepare professional replies for this workspace.',
    },
  ]);
  const [shareTab, setShareTab] = useState<'link' | 'groups' | 'directory' | 'sign'>('link');
  const [sharePresetLoading, setSharePresetLoading] = useState(false);
  const [sendToSignLoading, setSendToSignLoading] = useState(false);
  const [directoryPublishLoading, setDirectoryPublishLoading] = useState(false);
  const [directoryPublishStatus, setDirectoryPublishStatus] = useState('');
  const [directoryPublishError, setDirectoryPublishError] = useState('');
  const [directoryTransfersLoading, setDirectoryTransfersLoading] = useState(false);
  const [directoryLockersLoading, setDirectoryLockersLoading] = useState(false);
  const [directoryTransfers, setDirectoryTransfers] = useState<SecureFileTransfer[]>([]);
  const [directoryLockers, setDirectoryLockers] = useState<FileDirectoryLocker[]>([]);
  const [publishedDirectoryTransfer, setPublishedDirectoryTransfer] = useState<SecureFileTransfer | null>(null);
  const [directoryPublishForm, setDirectoryPublishForm] = useState({
    format: 'pdf' as 'pdf' | 'docx',
    visibility: 'public' as 'public' | 'private',
    title: '',
    notes: '',
    category: '',
    tags: '',
    lockerMode: 'new' as 'new' | 'existing',
    lockerId: '',
    lockerName: '',
    passwordRotationDays: '30',
    accessPassword: '',
    fileAccessPassword: '',
  });
  const [signPrepDialogOpen, setSignPrepDialogOpen] = useState(false);
  const [signPrepWatermarkEnabled, setSignPrepWatermarkEnabled] = useState(true);
  const [signPrepWatermarkText, setSignPrepWatermarkText] = useState('Confidential');
  const [signPrepRecipientSignatureRequired, setSignPrepRecipientSignatureRequired] = useState(true);
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [groupDescriptionDraft, setGroupDescriptionDraft] = useState('');
  const [groupInvitePermissionDraft, setGroupInvitePermissionDraft] = useState<'read' | 'write'>('read');
  const [memberDraft, setMemberDraft] = useState({ groupId: '', userId: '', name: '', password: '', permission: 'read' as 'read' | 'write' });
  const [groupPanelTab, setGroupPanelTab] = useState<Record<string, 'access' | 'members'>>({});
  const [editingMemberDraft, setEditingMemberDraft] = useState<{
    groupId: string;
    memberId: string;
    userId: string;
    name: string;
    password: string;
    permission: 'read' | 'write';
  } | null>(null);
  const [folderLauncherOpen, setFolderLauncherOpen] = useState(false);
  const [proofreaderOpen, setProofreaderOpen] = useState(false);
  const [proofreaderLoading, setProofreaderLoading] = useState(false);
  const [proofreaderSuggestions, setProofreaderSuggestions] = useState<string[]>([]);
  const [activeProofreader, setActiveProofreader] = useState<(typeof proofreaderModes)[number]['id']>('aarav');
  const [sidebarSections, setSidebarSections] = useState({
    ai: true,
    inline: true,
    reviewers: true,
    changes: true,
    comments: false,
    protection: false,
    sharing: true,
    export: false,
    versions: false,
    snapshot: true,
    setup: false,
  });
  const [suggestionMode, setSuggestionMode] = useState(false);
  const [blockSuggestionLoading, setBlockSuggestionLoading] = useState('');
  const [blockSuggestions, setBlockSuggestions] = useState<Record<string, string>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [documentUnlockCode, setDocumentUnlockCode] = useState('');
  const [folderUnlockCode, setFolderUnlockCode] = useState('');
  const [unlockedDocuments, setUnlockedDocuments] = useState<string[]>([]);
  const [unlockedFolders, setUnlockedFolders] = useState<string[]>([]);
  const [autosaveCountdown, setAutosaveCountdown] = useState<number | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const autosaveCountdownTimerRef = useRef<number | null>(null);
  const saveStateResetTimerRef = useRef<number | null>(null);
  const autosaveArmedRef = useRef(false);
  const savedFingerprintsRef = useRef<Record<string, string>>({});
  const selectionRangeRef = useRef<Range | null>(null);
  const pageHeaderRef = useRef<HTMLDivElement | null>(null);
  const pageFooterRef = useRef<HTMLDivElement | null>(null);
  const isAuthenticated = status === 'authenticated' && Boolean(session?.user);

  const currentDocument = useMemo(
    () => documents.find((document) => document.id === currentDocumentId) || null,
    [documents, currentDocumentId],
  );

  /* ── Real-time Collaboration ── */
  const [collabOpen, setCollabOpen] = useState(false);
  const collabUserName = session?.user?.name ?? session?.user?.email ?? guestId ?? 'Anonymous';
  const collabToken    = currentDocument?.shareToken ?? null;
  const collabEngine   = useCollabEngine(collabToken, collabUserName);

  const selectedGuidedPreset = useMemo(
    () => guidedPresets.find((preset) => preset.id === guidedPresetId) || guidedPresets[0],
    [guidedPresetId],
  );
  const activeSelectionAssist = useMemo(
    () => selectionAssistModes.find((item) => item.id === selectionAssistMode) || selectionAssistModes[0],
    [selectionAssistMode],
  );
  const previewDocument = useMemo(
    () => documents.find((document) => document.id === (previewDocumentId || currentDocumentId)) || currentDocument,
    [currentDocument, currentDocumentId, documents, previewDocumentId],
  );

  const syncSelectionFormattingState = useCallback((target?: HTMLElement | null) => {
    if (typeof window === 'undefined') return;
    const element = target || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const computed = element ? window.getComputedStyle(element) : null;
    if (!computed) return;

    const nextFontFamily = fontFamilies.find((item) => computed.fontFamily.toLowerCase().includes(item.toLowerCase()));
    if (nextFontFamily) {
      setEditorFontFamily(nextFontFamily);
    }

    const nextFontSize = cssLengthToPointSize(computed.fontSize, Number(editorFontSize) || 11);
    setEditorFontSize(nextFontSize);
  }, [editorFontSize]);

  const closeSelectionAssistant = useCallback(() => {
    setSelectionAssistantOpen(false);
    setFloatingToolbar((current) => ({ ...current, visible: false, placement: 'top' }));
    setSelectionText('');
    setSelectionTargetBlockId('');
    setSelectionSuggestions([]);
    setSelectionSuggestionsLoading(false);
    setSelectionCommentDraft('');
  }, []);

  const openPreviewForDocument = useCallback((documentId?: string) => {
    const nextId = documentId || currentDocumentId;
    if (!nextId) return;
    const isSameDocument = (previewDocumentId || currentDocumentId) === nextId;
    setPreviewDocumentId(nextId);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      if (mobilePreviewOpen && isSameDocument) {
        setMobilePreviewOpen(false);
        return;
      }
      setMobilePreviewOpen(true);
      return;
    }
    if (previewMode && isSameDocument) {
      setPreviewMode(false);
      return;
    }
    setCurrentDocumentId(nextId);
    setPreviewMode(true);
  }, [currentDocumentId, mobilePreviewOpen, previewDocumentId, previewMode]);

  const focusPageRegion = useCallback((region: 'header' | 'footer') => {
    setPageRegionVisibility((current) => ({ ...current, [region]: true }));
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        const target = region === 'header' ? pageHeaderRef.current : pageFooterRef.current;
        if (!target) return;
        target.focus();
        const selection = window.getSelection();
        if (!selection) return;
        const range = document.createRange();
        range.selectNodeContents(target);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      });
    }
  }, []);

  useEffect(() => {
    setPageRegionVisibility({
      header: hasMeaningfulRegionContent(currentDocument?.headerHtml),
      footer: hasMeaningfulRegionContent(currentDocument?.footerHtml),
    });
  }, [currentDocument?.id, currentDocument?.headerHtml, currentDocument?.footerHtml]);

  const actorHeaders = useMemo(() => {
    const headers: Record<string, string> = {};
    if (!isAuthenticated && guestId) {
      headers['x-docword-guest'] = guestId;
    }
    return headers;
  }, [guestId, isAuthenticated]);

  const profileStorageKey = useMemo(() => {
    if (session?.user?.email) return `docword.profile.${session.user.email.toLowerCase()}`;
    return guestId ? `docword.profile.${guestId}` : 'docword.profile.guest';
  }, [guestId, session?.user?.email]);

  useEffect(() => {
    if (typeof window === 'undefined' || !profileStorageKey) return;
    try {
      const saved = window.localStorage.getItem(profileStorageKey);
      if (saved) {
        setDocProfile({ ...emptyDocWordProfile, ...JSON.parse(saved) });
      }
    } catch {
      setDocProfile(emptyDocWordProfile);
    }
  }, [profileStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined' || !profileStorageKey) return;
    window.localStorage.setItem(profileStorageKey, JSON.stringify(docProfile));
  }, [docProfile, profileStorageKey]);

  const syncLocalDocument = useCallback((nextDocument: DocWordDocument) => {
    setDocuments((current) => {
      const exists = current.some((document) => document.id === nextDocument.id);
      const next = exists
        ? current.map((document) => (document.id === nextDocument.id ? nextDocument : document))
        : [nextDocument, ...current];
      return [...next].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
    setCurrentDocumentId(nextDocument.id);
  }, []);

  const buildPayload = useCallback((document: DocWordDocument) => {
    const html = buildHtml(document.blocks);
    const plainText = stripHtml(html);
    return {
      title: document.title,
      emoji: document.emoji,
      isFavorite: document.isFavorite,
      favoriteSourceFolder: document.favoriteSourceFolder,
      folderName: document.folderName,
      folderLockCode: document.folderLockCode,
      documentLockCode: document.documentLockCode,
      templateId: document.templateId,
      summary: document.summary,
      documentTheme: document.documentTheme,
      headerHtml: document.headerHtml,
      footerHtml: document.footerHtml,
      watermarkText: document.watermarkText,
      requireSignature: document.requireSignature,
      signatures: document.signatures,
      trackChangesEnabled: document.trackChangesEnabled,
      trackedChanges: document.trackedChanges,
      selectionComments: document.selectionComments,
      blocks: document.blocks,
      html,
      plainText,
      wordCount: countWords(plainText),
      readTimeMinutes: estimateReadTime(plainText),
      lastAiAction: document.lastAiAction,
      shareMode: document.shareMode,
      shareToken: document.shareToken,
      accessGroups: document.accessGroups,
    };
  }, []);

  const buildSaveFingerprint = useCallback((document: DocWordDocument) => (
    JSON.stringify(buildPayload(document))
  ), [buildPayload]);

  const createInitialDocument = useCallback(async (): Promise<DocWordDocument | null> => {
    if (!guestId && !isAuthenticated) return null;
    setCreating(true);
    setError('');
    try {
      const response = await fetch('/api/docword/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...actorHeaders,
        },
        body: JSON.stringify({
          title: 'Untitled document',
          folderName: 'General',
          emoji: '✍️',
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to create document.');
      const created = payload.document as DocWordDocument;
      if (!created?.id) {
        throw new Error('Failed to create document.');
      }
      savedFingerprintsRef.current[created.id] = buildSaveFingerprint(created);
      syncLocalDocument(created);
      return created;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to create document.');
      return null;
    } finally {
      setCreating(false);
    }
  }, [actorHeaders, buildSaveFingerprint, guestId, isAuthenticated, syncLocalDocument]);

  const loadDocuments = useCallback(async () => {
    if (!guestId && !isAuthenticated) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/docword/documents', {
        headers: actorHeaders,
        cache: 'no-store',
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to load documents.');
      const nextDocuments = Array.isArray(payload.documents) ? (payload.documents as DocWordDocument[]) : [];
      const nextFingerprints: Record<string, string> = {};
      nextDocuments.forEach((document: DocWordDocument) => {
        if (document?.id) {
          nextFingerprints[String(document.id)] = buildSaveFingerprint(document);
        }
      });
      // Some TS configurations type refs as readonly. Mutate in-place to avoid reassigning `ref.current`.
      Object.keys(savedFingerprintsRef.current).forEach((key) => {
        delete savedFingerprintsRef.current[key];
      });
      Object.assign(savedFingerprintsRef.current, nextFingerprints);
      setDocuments(nextDocuments);
      if (nextDocuments[0]) {
        setCurrentDocumentId((current) => current || nextDocuments[0].id);
      } else {
        await createInitialDocument();
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to load documents.');
    } finally {
      setLoading(false);
    }
  }, [actorHeaders, buildSaveFingerprint, createInitialDocument, guestId, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) return;
    if (typeof window === 'undefined') return;
    const existing = window.localStorage.getItem('docword_guest_id');
    const nextGuestId = existing || createGuestId();
    if (!existing) {
      window.localStorage.setItem('docword_guest_id', nextGuestId);
    }
    setGuestId(nextGuestId);
  }, [isAuthenticated]);

  useEffect(() => {
    if (status === 'loading') return;
    if (!isAuthenticated && !guestId) return;
    void loadDocuments();
  }, [guestId, isAuthenticated, loadDocuments, status]);

  const esignIntent = useMemo(() => {
    const intent = searchParams?.get('intent')?.trim().toLowerCase();
    return intent === 'esign' || intent === 'e-sign';
  }, [searchParams]);

  const esignForceNewDocument = useMemo(() => (
    searchParams?.get('new') === '1' ||
    searchParams?.get('newDocument') === '1' ||
    searchParams?.get('new_doc') === '1'
  ), [searchParams]);

  const esignBootstrapRanRef = useRef(false);

  useEffect(() => {
    if (!esignIntent) return;
    if (esignBootstrapRanRef.current) return;
    if (status === 'loading') return;
    if (!isAuthenticated && !guestId) return;
    if (loading) return;

    esignBootstrapRanRef.current = true;

    void (async () => {
      let target = currentDocument;
      if (esignForceNewDocument) {
        target = await createInitialDocument();
      }
      if (!target) return;

      if (target.requireSignature !== true) {
        try {
          const response = await fetch(`/api/docword/documents/${target.id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              ...actorHeaders,
            },
            body: JSON.stringify({
              requireSignature: true,
              saveSource: 'manual',
            }),
          });
          const payload = await response.json().catch(() => null) as { document?: DocWordDocument; error?: string } | null;
          if (response.ok && payload?.document) {
            savedFingerprintsRef.current[payload.document.id] = buildSaveFingerprint(payload.document);
            syncLocalDocument(payload.document);
            target = payload.document;
          } else {
            syncLocalDocument({ ...target, requireSignature: true, updatedAt: new Date().toISOString() });
          }
        } catch {
          syncLocalDocument({ ...target, requireSignature: true, updatedAt: new Date().toISOString() });
        }
      }

      setShareTab('sign');
      setShareDialogOpen(true);
      setInsight('This draft is flagged for signing. When ready, use Send to sign to generate the secure signing link.');
      router.replace('/docword');
    })();
  }, [
    actorHeaders,
    buildSaveFingerprint,
    createInitialDocument,
    currentDocument,
    esignForceNewDocument,
    esignIntent,
    guestId,
    isAuthenticated,
    loading,
    router,
    status,
    syncLocalDocument,
  ]);

  const saveDocument = useCallback(
    async (document: DocWordDocument, saveSource: 'autosave' | 'manual' | 'ai' | 'restore' = 'autosave') => {
      if (saveStateResetTimerRef.current) {
        window.clearTimeout(saveStateResetTimerRef.current);
        saveStateResetTimerRef.current = null;
      }
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      if (autosaveCountdownTimerRef.current) {
        window.clearInterval(autosaveCountdownTimerRef.current);
        autosaveCountdownTimerRef.current = null;
      }
      setAutosaveCountdown(null);
      setSaveState('saving');
      try {
        const response = await fetch(`/api/docword/documents/${document.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...actorHeaders,
          },
          body: JSON.stringify({
            ...buildPayload(document),
            saveSource,
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Failed to save document.');
        savedFingerprintsRef.current[payload.document.id] = buildSaveFingerprint(payload.document);
        syncLocalDocument(payload.document);
        setSaveState('saved');
        saveStateResetTimerRef.current = window.setTimeout(() => {
          setSaveState('idle');
          saveStateResetTimerRef.current = null;
        }, 2600);
        return payload.document as DocWordDocument;
      } catch (requestError) {
        setSaveState('error');
        setError(requestError instanceof Error ? requestError.message : 'Failed to save document.');
        return null;
      }
    },
    [actorHeaders, buildPayload, buildSaveFingerprint, syncLocalDocument],
  );

  useEffect(() => {
    autosaveArmedRef.current = false;
    setAutosaveCountdown(null);
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (autosaveCountdownTimerRef.current) {
      window.clearInterval(autosaveCountdownTimerRef.current);
      autosaveCountdownTimerRef.current = null;
    }
  }, [currentDocumentId]);

  useEffect(() => {
    selectionRangeRef.current = null;
  }, [currentDocumentId]);

  useEffect(() => {
    if (!currentDocument) return;
    if (!autosaveArmedRef.current) {
      autosaveArmedRef.current = true;
      return;
    }
    if (buildSaveFingerprint(currentDocument) === savedFingerprintsRef.current[currentDocument.id]) {
      setAutosaveCountdown(null);
      return;
    }
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    if (autosaveCountdownTimerRef.current) {
      window.clearInterval(autosaveCountdownTimerRef.current);
    }
    const autosaveDelayMs = 5000;
    const startedAt = Date.now();
    setAutosaveCountdown(5);
    autosaveCountdownTimerRef.current = window.setInterval(() => {
      const remainingMs = Math.max(0, autosaveDelayMs - (Date.now() - startedAt));
      const nextSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
      setAutosaveCountdown(nextSeconds);
      if (remainingMs <= 0 && autosaveCountdownTimerRef.current) {
        window.clearInterval(autosaveCountdownTimerRef.current);
        autosaveCountdownTimerRef.current = null;
      }
    }, 200);
    autosaveTimerRef.current = window.setTimeout(() => {
      setAutosaveCountdown(null);
      if (autosaveCountdownTimerRef.current) {
        window.clearInterval(autosaveCountdownTimerRef.current);
        autosaveCountdownTimerRef.current = null;
      }
      void saveDocument(currentDocument, 'autosave');
    }, autosaveDelayMs);
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      if (autosaveCountdownTimerRef.current) {
        window.clearInterval(autosaveCountdownTimerRef.current);
        autosaveCountdownTimerRef.current = null;
      }
    };
  }, [buildSaveFingerprint, currentDocument, saveDocument]);

  useEffect(() => () => {
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    if (autosaveCountdownTimerRef.current) {
      window.clearInterval(autosaveCountdownTimerRef.current);
    }
    if (saveStateResetTimerRef.current) {
      window.clearTimeout(saveStateResetTimerRef.current);
    }
  }, []);

  /* ── Collab: auto-save + broadcast when document changes ── */
  useEffect(() => {
    if (!currentDocument?.blocks?.length) return;
    const snapshot = JSON.stringify(currentDocument.blocks);
    collabEngine.triggerAutoSave(snapshot);
    collabEngine.broadcastEdit(snapshot);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDocument?.updatedAt]);

  /* ── Collab: apply remote snapshot from peers ── */
  useEffect(() => {
    if (!collabEngine.remoteContent || !currentDocumentId) return;
    try {
      const remoteBlocks = JSON.parse(collabEngine.remoteContent) as DocWordBlock[];
      if (Array.isArray(remoteBlocks) && remoteBlocks.length > 0) {
        updateCurrentDocument({ blocks: remoteBlocks });
      }
    } catch { /* ignore non-block remote payloads */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collabEngine.remoteContent]);

  /* ── Drive handoff: auto-import file passed from the Universal File Viewer ── */
  useEffect(() => {
    const handoff = getDriveHandoffFile();
    if (!handoff) return;
    // Convert Blob → File so importExistingDocument can process it
    const virtualFile = new File([handoff.blob], handoff.name, {
      type: handoff.mimeType || handoff.blob.type,
      lastModified: Date.now(),
    });
    void importExistingDocument(virtualFile);
    setInsight(`Opened "${handoff.name}" from Drive.`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateCurrentDocument = useCallback((updates: Partial<DocWordDocument>) => {
    setDocuments((current) =>
      current.map((document) => {
        if (document.id !== currentDocumentId) return document;
        const mergedBlocks = updates.blocks || document.blocks;
        const html = buildHtml(mergedBlocks);
        const plainText = stripHtml(html);
        return {
          ...document,
          ...updates,
          blocks: mergedBlocks,
          html,
          plainText,
          wordCount: countWords(plainText),
          readTimeMinutes: estimateReadTime(plainText),
          updatedAt: new Date().toISOString(),
        };
      }),
    );
    setSaveState('idle');
  }, [currentDocumentId]);

  const applyDocumentUpdatesAndPersist = useCallback(async (updates: Partial<DocWordDocument>, source: 'manual' | 'ai' | 'restore' = 'manual') => {
    if (!currentDocument) return;
    const mergedBlocks = updates.blocks || currentDocument.blocks;
    const html = buildHtml(mergedBlocks);
    const plainText = stripHtml(html);
    const nextDocument: DocWordDocument = {
      ...currentDocument,
      ...updates,
      blocks: mergedBlocks,
      html,
      plainText,
      wordCount: countWords(plainText),
      readTimeMinutes: estimateReadTime(plainText),
      updatedAt: new Date().toISOString(),
    };
    syncLocalDocument(nextDocument);
    return await saveDocument(nextDocument, source);
  }, [currentDocument, saveDocument, syncLocalDocument]);

  const updateBlock = useCallback((blockId: string, patch: Partial<DocWordBlock>) => {
    if (!currentDocument) return;
    updateCurrentDocument({
      blocks: currentDocument.blocks.map((block) =>
        block.id === blockId
          ? {
              ...block,
              ...patch,
              text: stripHtml(patch.html ?? block.html),
            }
          : block,
      ),
    });
  }, [currentDocument, updateCurrentDocument]);

  const applySlashOption = useCallback((blockId: string, type: DocWordBlock['type']) => {
    if (!currentDocument) return;
    updateCurrentDocument({
      blocks: currentDocument.blocks.map((block) =>
        block.id === blockId
          ? {
              ...block,
              type,
              html: type === 'paragraph' ? '<p></p>' : type === 'heading-1' ? 'Section title' : type === 'heading-2' ? 'Subheading' : block.html.replace(/^\//, ''),
              text: '',
              meta:
                type === 'table'
                  ? { columns: ['Item', 'Notes'], rows: [['One', ''], ['Two', '']] }
                  : type === 'image'
                    ? { src: '', alt: '' }
                    : undefined,
            }
          : block,
      ),
    });
  }, [currentDocument, updateCurrentDocument]);

  const insertBlockAfter = useCallback((index: number, type: DocWordBlock['type'] = 'paragraph') => {
    if (!currentDocument) return;
    const nextBlocks = [...currentDocument.blocks];
    nextBlocks.splice(index + 1, 0, createBlock(type, type === 'paragraph' ? '<p></p>' : ''));
    updateCurrentDocument({ blocks: nextBlocks });
  }, [currentDocument, updateCurrentDocument]);

  const moveBlock = useCallback((index: number, direction: -1 | 1) => {
    if (!currentDocument) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= currentDocument.blocks.length) return;
    const nextBlocks = [...currentDocument.blocks];
    const [item] = nextBlocks.splice(index, 1);
    nextBlocks.splice(nextIndex, 0, item);
    updateCurrentDocument({ blocks: nextBlocks });
  }, [currentDocument, updateCurrentDocument]);

  const removeBlock = useCallback((index: number) => {
    if (!currentDocument) return;
    if (currentDocument.blocks.length === 1) {
      updateCurrentDocument({ blocks: [createBlock('paragraph', '<p></p>')] });
      return;
    }
    updateCurrentDocument({ blocks: currentDocument.blocks.filter((_, blockIndex) => blockIndex !== index) });
  }, [currentDocument, updateCurrentDocument]);

  const toggleFavoriteDocument = useCallback(async (document?: DocWordDocument | null) => {
    if (!document) return;

    const nextIsFavorite = !document.isFavorite;
    const currentFolderName = document.folderName?.trim() || 'General';
    const nextFolderName = nextIsFavorite
      ? DOCWORD_FAVORITES_FOLDER
      : (document.favoriteSourceFolder?.trim() || 'General');
    const nextFavoriteSourceFolder = nextIsFavorite
      ? (currentFolderName === DOCWORD_FAVORITES_FOLDER ? (document.favoriteSourceFolder?.trim() || 'General') : currentFolderName)
      : undefined;

    await applyDocumentUpdatesAndPersist({
      ...document,
      isFavorite: nextIsFavorite,
      favoriteSourceFolder: nextFavoriteSourceFolder,
      folderName: nextFolderName,
    }, 'manual');
  }, [applyDocumentUpdatesAndPersist]);

  const folders = useMemo(
    () => {
      const baseFolders = new Set<string>([DOCWORD_FAVORITES_FOLDER]);
      documents.forEach((document) => {
        const resolvedFolder = document.isFavorite
          ? DOCWORD_FAVORITES_FOLDER
          : (document.folderName?.trim() || 'General');
        baseFolders.add(resolvedFolder);
      });

      return Array.from(baseFolders).sort((a, b) => {
        if (a === DOCWORD_FAVORITES_FOLDER) return -1;
        if (b === DOCWORD_FAVORITES_FOLDER) return 1;
        return a.localeCompare(b);
      });
    },
    [documents],
  );

  const documentsByFolder = useMemo(
    () =>
      folders.map((folder) => ({
        folder,
        items: documents.filter((document) => {
          const resolvedFolder = document.isFavorite
            ? DOCWORD_FAVORITES_FOLDER
            : (document.folderName?.trim() || 'General');
          return resolvedFolder === folder;
        }),
      })),
    [documents, folders],
  );

  const filteredDocuments = useMemo(() => {
    const needle = searchTerm.toLowerCase();
    return documents.filter((document) => {
      const folderName = document.isFavorite
        ? DOCWORD_FAVORITES_FOLDER
        : (document.folderName?.trim() || 'General');
      const matchesFolder = activeFolderFilter === 'All' || folderName === activeFolderFilter;
      const matchesSearch =
        !searchTerm.trim() ||
        [document.title, document.folderName, document.summary, document.plainText]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));

      return matchesFolder && matchesSearch;
    });
  }, [activeFolderFilter, documents, searchTerm]);

  const activeBlock = currentDocument?.blocks.find((block) => block.id === activeBlockId) || currentDocument?.blocks[0] || null;
  const slashVisible = Boolean(activeBlock && activeBlock.text.trim().startsWith('/'));
  const headingOutline = useMemo(
    () =>
      (currentDocument?.blocks || [])
        .filter((block) => block.type === 'heading-1' || block.type === 'heading-2' || block.type === 'heading-3')
        .map((block) => ({
          id: block.id,
          label: block.text || 'Untitled heading',
          level: block.type,
        })),
    [currentDocument?.blocks],
  );
  const currentPlainText = currentDocument?.plainText || '';
  const characterCount = currentPlainText.length;
  const paragraphCount = currentPlainText ? currentPlainText.split(/\n{2,}/).filter(Boolean).length : 0;
  const runtimeAppOrigin = typeof window !== 'undefined' ? window.location.origin : undefined;
  const documentAccessBaseUrl = currentDocument?.shareToken
    ? buildAbsoluteAppUrl(`/docword/shared/${currentDocument.shareToken}`, runtimeAppOrigin)
    : '';
  const shareUrl =
    documentAccessBaseUrl && currentDocument?.shareMode !== 'private'
      ? documentAccessBaseUrl
      : '';
  const shareQrUrl = shareUrl ? buildQrImageUrl(shareUrl, runtimeAppOrigin, 220) : '';
  const whatsappShareUrl = useMemo(() => {
    if (!currentDocument || !shareUrl) return '';
    const passwordLine = currentDocument.documentLockCode ? `\nPassword: ${currentDocument.documentLockCode}` : '';
    const message = `Open "${currentDocument.title}" on DocWord:\n${shareUrl}${passwordLine}`;
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }, [currentDocument, shareUrl]);
  const collaborationGroups = useMemo(() => currentDocument?.accessGroups || [], [currentDocument?.accessGroups]);
  const collaborationGroupLinks = useMemo(
    () =>
      collaborationGroups.map((group) => ({
        ...group,
        accessUrl: documentAccessBaseUrl && group.shareToken ? `${documentAccessBaseUrl}?group=${encodeURIComponent(group.shareToken)}` : '',
        inviteUrl: documentAccessBaseUrl && group.inviteToken ? `${documentAccessBaseUrl}?invite=${encodeURIComponent(group.inviteToken)}` : '',
      })),
    [collaborationGroups, documentAccessBaseUrl],
  );
  const primaryGroupAccessUrl = collaborationGroupLinks[0]?.accessUrl || '';
  const publishedDirectoryUrl = useMemo(() => {
    if (!publishedDirectoryTransfer) return '';
    return buildAbsoluteAppUrl(`/transfer/${publishedDirectoryTransfer.shareId}`, runtimeAppOrigin);
  }, [publishedDirectoryTransfer, runtimeAppOrigin]);
  const activeSharePanelUrl = shareTab === 'groups'
    ? primaryGroupAccessUrl
    : shareTab === 'directory'
      ? publishedDirectoryUrl
      : shareUrl;
  const activeSharePanelQrUrl = activeSharePanelUrl
    ? buildQrImageUrl(activeSharePanelUrl, runtimeAppOrigin, 220)
    : '';
  const currentDocumentTitle = currentDocument?.title || '';
  const currentDocumentStableId = currentDocument?.id || '';
  const currentDocumentFolderLabel = currentDocument?.isFavorite
    ? DOCWORD_FAVORITES_FOLDER
    : (currentDocument?.folderName || 'General');

  useEffect(() => {
    if (!currentDocument) return;
    setDirectoryPublishForm((current) => ({
      ...current,
      title: current.title || currentDocument.title || 'DocWord export',
      lockerName: current.lockerName || currentDocument.title || 'DocWord Locker',
      accessPassword: current.accessPassword || `DOC-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    }));
  }, [currentDocument, currentDocumentStableId, currentDocumentTitle]);

  useEffect(() => {
    if (!shareDialogOpen || shareTab !== 'directory' || !isAuthenticated) return;
    let cancelled = false;
    const loadDirectoryResources = async () => {
      try {
        setDirectoryTransfersLoading(true);
        setDirectoryLockersLoading(true);
        const [transferResponse, lockerResponse] = await Promise.all([
          fetch('/api/file-transfers'),
          fetch('/api/file-directory/lockers'),
        ]);
        const [transferPayload, lockerPayload] = await Promise.all([
          transferResponse.json().catch(() => []),
          lockerResponse.json().catch(() => []),
        ]);
        if (!cancelled) {
          if (transferResponse.ok) {
            setDirectoryTransfers(Array.isArray(transferPayload) ? transferPayload : []);
          }
          if (lockerResponse.ok) {
            setDirectoryLockers(Array.isArray(lockerPayload) ? lockerPayload : []);
          }
        }
      } finally {
        if (!cancelled) {
          setDirectoryTransfersLoading(false);
          setDirectoryLockersLoading(false);
        }
      }
    };
    void loadDirectoryResources();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, shareDialogOpen, shareTab]);

  useEffect(() => {
    if (directoryPublishForm.visibility !== 'private' || directoryPublishForm.lockerMode !== 'existing' || !directoryPublishForm.lockerId) {
      return;
    }
    const selectedLocker = directoryLockers.find((item) => item.id === directoryPublishForm.lockerId);
    if (!selectedLocker) return;
    setDirectoryPublishForm((current) => ({
      ...current,
      lockerName: selectedLocker.name,
      accessPassword: selectedLocker.currentPassword,
      passwordRotationDays: selectedLocker.passwordRotationDays ? String(selectedLocker.passwordRotationDays) : current.passwordRotationDays,
    }));
  }, [directoryLockers, directoryPublishForm.visibility, directoryPublishForm.lockerMode, directoryPublishForm.lockerId]);

  useEffect(() => {
    if (!currentDocument) return;
    const hasGroups = (currentDocument.accessGroups || []).length > 0;
    if (!hasGroups) return;

    const needsDocumentToken = !currentDocument.shareToken;
    const needsGroupTokens = (currentDocument.accessGroups || []).some((group) => !group.shareToken || !group.inviteToken);
    if (!needsDocumentToken && !needsGroupTokens) return;

    applyDocumentUpdatesAndPersist({
      shareToken: currentDocument.shareToken || createDocShareToken(),
      accessGroups: (currentDocument.accessGroups || []).map((group) => ({
        ...group,
        shareToken: group.shareToken || `dwgshare_${Math.random().toString(36).slice(2, 10)}`,
        inviteToken: group.inviteToken || `dwginvite_${Math.random().toString(36).slice(2, 10)}`,
        invitePermission: group.invitePermission === 'write' ? 'write' : 'read',
      })),
    });
  }, [applyDocumentUpdatesAndPersist, currentDocument]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.dataset.uiMode = 'dark';
      document.documentElement.classList.add('dark');
    } else {
      delete document.documentElement.dataset.uiMode;
      document.documentElement.classList.remove('dark');
    }
    return () => {
      delete document.documentElement.dataset.uiMode;
      document.documentElement.classList.remove('dark');
    };
  }, [darkMode]);

  const runAiAction = useCallback(
    async (mode: AiMode) => {
      if (!currentDocument) return;
      setAiLoading(true);
      setError('');
      setInsight('');

      const selection = typeof window !== 'undefined' ? window.getSelection()?.toString().trim() || '' : '';
      const textSource =
        mode === 'generate'
          ? aiPrompt.trim()
          : selection || activeBlock?.text || currentDocument.plainText || stripHtml(buildHtml(currentDocument.blocks));

      try {
        const response = await fetch('/api/docword/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode,
            text: textSource,
            fullText: currentDocument.plainText,
            documentTitle: currentDocument.title,
            prompt: aiPrompt.trim(),
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Failed to run DocWord AI.');

        if (mode === 'summarize') {
          setInsight(payload.result);
          updateCurrentDocument({ summary: payload.result, lastAiAction: 'summarize' });
        } else if (activeBlock) {
          updateBlock(activeBlock.id, { html: payload.result, text: stripHtml(payload.result) });
          updateCurrentDocument({ lastAiAction: mode });
        } else {
          setInsight(payload.result);
        }
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'Failed to run AI.');
      } finally {
        setAiLoading(false);
      }
    },
    [activeBlock, aiPrompt, currentDocument, updateBlock, updateCurrentDocument],
  );

  const requestExportBlob = useCallback(async (type: 'pdf' | 'docx') => {
    if (!currentDocument) {
      throw new Error('No active document to export.');
    }
    const response = await fetch(`/api/docword/export/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: currentDocument.title,
        html: buildDocumentMarkup(currentDocument),
        plainText: currentDocument.plainText,
        watermarkText: currentDocument.watermarkText,
        documentTheme: currentDocument.documentTheme,
        headerHtml: currentDocument.headerHtml,
        footerHtml: currentDocument.footerHtml,
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `Failed to export ${type.toUpperCase()}.`);
    }
    return response.blob();
  }, [currentDocument]);

  const exportDocument = useCallback(async (type: 'pdf' | 'docx') => {
    if (!currentDocument) return;
    try {
      const blob = await requestExportBlob(type);
      downloadBlob(blob, `${currentDocument.title || 'docword'}.${type === 'pdf' ? 'pdf' : 'docx'}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to export document.');
    }
  }, [currentDocument, requestExportBlob]);

  const exportLocalDocument = useCallback((type: 'txt' | 'html') => {
    if (!currentDocument) return;
    const content = type === 'txt' ? currentDocument.plainText : buildDocumentMarkup(currentDocument);
    const blob = new Blob([content], { type: type === 'txt' ? 'text/plain;charset=utf-8' : 'text/html;charset=utf-8' });
    downloadBlob(blob, `${currentDocument.title || 'docword'}.${type}`);
  }, [currentDocument]);

  const runProofreader = useCallback(async (reviewerId: (typeof proofreaderModes)[number]['id']) => {
    if (!currentDocument?.plainText?.trim()) return;
    const reviewer = proofreaderModes.find((item) => item.id === reviewerId);
    if (!reviewer) return;
    setActiveProofreader(reviewerId);
    setProofreaderLoading(true);
    setProofreaderOpen(true);
    setProofreaderSuggestions([]);
    try {
      const response = await fetch('/api/docword/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'proofread',
          text: currentDocument.plainText,
          fullText: currentDocument.plainText,
          documentTitle: currentDocument.title,
          prompt: reviewer.focus,
          reviewer: reviewer.name,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to analyze document.');
      const normalized = String(payload.result || '')
        .split('\n')
        .map((line) => line.replace(/^[-*\d.\s]+/, '').trim())
        .filter(Boolean)
        .slice(0, 6);
      setProofreaderSuggestions(normalized.length ? normalized : ['Your document is in strong shape, but the reviewer suggests polishing phrasing and tightening the opening.']);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to analyze document.');
    } finally {
      setProofreaderLoading(false);
    }
  }, [currentDocument]);

  const updateShareMode = useCallback(async (shareMode: 'private' | 'read' | 'write') => {
    if (!currentDocument) return;
    setShareLoading(true);
    try {
      const response = await fetch(`/api/docword/documents/${currentDocument.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...actorHeaders,
        },
        body: JSON.stringify({
          ...buildPayload(currentDocument),
          shareMode,
          saveSource: 'manual',
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to update sharing.');
      syncLocalDocument(payload.document);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to update sharing.');
    } finally {
      setShareLoading(false);
    }
  }, [actorHeaders, buildPayload, currentDocument, syncLocalDocument]);

  const configureShare = useCallback(async (mode: 'public' | 'secure') => {
    if (!currentDocument) return;
    setSharePresetLoading(true);
    try {
      const nextLockCode = mode === 'secure'
        ? (currentDocument.documentLockCode?.trim() || createSharePassword())
        : undefined;

      const response = await fetch(`/api/docword/documents/${currentDocument.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...actorHeaders,
        },
        body: JSON.stringify({
          ...buildPayload({
            ...currentDocument,
            shareMode: 'read',
            documentLockCode: nextLockCode,
          }),
          shareMode: 'read',
          documentLockCode: nextLockCode,
          saveSource: 'manual',
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to configure sharing.');
      syncLocalDocument(payload.document);
      setShareDialogOpen(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to configure sharing.');
    } finally {
      setSharePresetLoading(false);
    }
  }, [actorHeaders, buildPayload, currentDocument, syncLocalDocument]);

  const createAccessGroup = useCallback(async () => {
    if (!currentDocument || !groupNameDraft.trim()) return;
    const nextGroup: DocWordAccessGroup = {
      id: `dwg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: groupNameDraft.trim(),
      description: groupDescriptionDraft.trim() || undefined,
      createdAt: new Date().toISOString(),
      shareToken: `dwgshare_${Math.random().toString(36).slice(2, 10)}`,
      inviteToken: `dwginvite_${Math.random().toString(36).slice(2, 10)}`,
      invitePermission: groupInvitePermissionDraft,
      members: [],
    };
    await applyDocumentUpdatesAndPersist({
      shareToken: currentDocument.shareToken || createDocShareToken(),
      shareMode: 'private',
      documentLockCode: undefined,
      accessGroups: [nextGroup, ...(currentDocument.accessGroups || [])],
    });
    setGroupNameDraft('');
    setGroupDescriptionDraft('');
    setGroupInvitePermissionDraft('read');
    setGroupPanelTab((current) => ({ ...current, [nextGroup.id]: 'access' }));
    setMemberDraft((current) => ({ ...current, groupId: nextGroup.id }));
    setShareTab('groups');
    setInsight(`Group "${nextGroup.name}" is ready. This document is now protected for group-based access.`);
  }, [applyDocumentUpdatesAndPersist, currentDocument, groupDescriptionDraft, groupInvitePermissionDraft, groupNameDraft]);

  const addMemberToGroup = useCallback(async () => {
    if (!currentDocument || !memberDraft.groupId || !memberDraft.userId.trim() || !memberDraft.password.trim()) return;
    const groups = (currentDocument.accessGroups || []).map((group) => {
      if (group.id !== memberDraft.groupId) return group;
      return {
        ...group,
        members: [
          {
            id: `dwgm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            userId: memberDraft.userId.trim(),
            name: memberDraft.name.trim() || undefined,
            password: memberDraft.password.trim(),
            permission: memberDraft.permission,
            addedAt: new Date().toISOString(),
          },
          ...(group.members || []),
        ],
      };
    });
    await applyDocumentUpdatesAndPersist({ accessGroups: groups });
    setMemberDraft((current) => ({ ...current, userId: '', name: '', password: '', permission: 'read' }));
    setGroupPanelTab((current) => ({ ...current, [memberDraft.groupId]: 'members' }));
    setInsight('Group member added with direct document credentials.');
  }, [applyDocumentUpdatesAndPersist, currentDocument, memberDraft]);

  const removeAccessGroup = useCallback(async (groupId: string) => {
    if (!currentDocument) return;
    await applyDocumentUpdatesAndPersist({
      accessGroups: (currentDocument.accessGroups || []).filter((group) => group.id !== groupId),
    });
  }, [applyDocumentUpdatesAndPersist, currentDocument]);

  const removeGroupMember = useCallback(async (groupId: string, memberId: string) => {
    if (!currentDocument) return;
    await applyDocumentUpdatesAndPersist({
      accessGroups: (currentDocument.accessGroups || []).map((group) =>
        group.id === groupId
          ? { ...group, members: (group.members || []).filter((member) => member.id !== memberId) }
          : group,
      ),
    });
  }, [applyDocumentUpdatesAndPersist, currentDocument]);

  const startEditingGroupMember = useCallback((groupId: string, member: { id: string; userId: string; name?: string; password: string; permission: 'read' | 'write' }) => {
    setEditingMemberDraft({
      groupId,
      memberId: member.id,
      userId: member.userId,
      name: member.name || '',
      password: member.password,
      permission: member.permission,
    });
  }, []);

  const saveEditedGroupMember = useCallback(async () => {
    if (!currentDocument || !editingMemberDraft?.groupId || !editingMemberDraft.memberId || !editingMemberDraft.userId.trim() || !editingMemberDraft.password.trim()) return;
    const groups = (currentDocument.accessGroups || []).map((group) =>
      group.id === editingMemberDraft.groupId
        ? {
            ...group,
            members: (group.members || []).map((member) =>
              member.id === editingMemberDraft.memberId
                ? {
                    ...member,
                    userId: editingMemberDraft.userId.trim(),
                    name: editingMemberDraft.name.trim() || undefined,
                    password: editingMemberDraft.password.trim(),
                    permission: editingMemberDraft.permission,
                  }
                : member,
            ),
          }
        : group,
    );
    await applyDocumentUpdatesAndPersist({ accessGroups: groups });
    setEditingMemberDraft(null);
    setGroupPanelTab((current) => ({ ...current, [editingMemberDraft.groupId]: 'members' }));
    setInsight('Group member updated successfully.');
  }, [applyDocumentUpdatesAndPersist, currentDocument, editingMemberDraft]);

  const copyShareLink = useCallback(async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
  }, [shareUrl]);

  const copyGroupAccessDetails = useCallback(async (groupId: string, variant: 'access' | 'invite') => {
    const target = collaborationGroupLinks.find((group) => group.id === groupId);
    if (!target) return;
    const text = variant === 'invite'
      ? [
          `Join group: ${target.name}`,
          `Invite link: ${target.inviteUrl}`,
          `Invite permission: ${target.invitePermission === 'write' ? 'Can edit' : 'Read only'}`,
          'Choose your own DocWord user ID and password after opening the invite.',
        ].filter(Boolean).join('\n')
      : [
          `Group: ${target.name}`,
          `Access link: ${target.accessUrl}`,
          target.description ? `Note: ${target.description}` : '',
          'Use your assigned DocWord member ID and password to open the document.',
        ].filter(Boolean).join('\n');
    await navigator.clipboard.writeText(text);
  }, [collaborationGroupLinks]);

  const copySecureShareDetails = useCallback(async () => {
    if (!currentDocument || !shareUrl) return;
    const text = [
      `Document: ${currentDocument.title}`,
      `Link: ${shareUrl}`,
      currentDocument.documentLockCode ? `Password: ${currentDocument.documentLockCode}` : '',
      'Shared with DocWord',
    ].filter(Boolean).join('\n');
    await navigator.clipboard.writeText(text);
  }, [currentDocument, shareUrl]);

  const publishDocumentToDirectory = useCallback(async () => {
    if (!currentDocument) return;
    if (!isAuthenticated) {
      setDirectoryPublishError('Sign in to publish this document to the File Directory.');
      return;
    }
    if (directoryPublishForm.visibility === 'private' && directoryPublishForm.lockerMode === 'existing' && !directoryPublishForm.lockerId) {
      setDirectoryPublishError('Choose an existing locker first.');
      return;
    }
    if (directoryPublishForm.visibility === 'private' && !directoryPublishForm.accessPassword.trim()) {
      setDirectoryPublishError('Add a locker password for the private export.');
      return;
    }

    try {
      setDirectoryPublishLoading(true);
      setDirectoryPublishError('');
      setDirectoryPublishStatus('');
      const blob = await requestExportBlob(directoryPublishForm.format);
      const dataUrl = await blobToDataUrl(blob);
      const extension = directoryPublishForm.format === 'pdf' ? 'pdf' : 'docx';
      const fileNameBase = (directoryPublishForm.title.trim() || currentDocument.title || 'docword-export')
        .replace(/[^\w\s-]+/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .toLowerCase() || 'docword-export';

      const response = await fetch('/api/file-transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: directoryPublishForm.title.trim() || currentDocument.title || 'DocWord export',
          fileName: `${fileNameBase}.${extension}`,
          mimeType: directoryPublishForm.format === 'pdf'
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          dataUrl,
          sizeInBytes: blob.size,
          notes: directoryPublishForm.notes.trim(),
          directoryVisibility: directoryPublishForm.visibility,
          directoryCategory: directoryPublishForm.category.trim() || undefined,
          directoryTags: directoryPublishForm.tags.split(',').map((item) => item.trim()).filter(Boolean),
          authMode: directoryPublishForm.visibility === 'public' ? 'public' : 'password',
          lockerId: directoryPublishForm.visibility === 'private' && directoryPublishForm.lockerMode === 'existing'
            ? directoryPublishForm.lockerId || undefined
            : undefined,
          lockerName: directoryPublishForm.visibility === 'private'
            ? (directoryPublishForm.lockerMode === 'new'
              ? (directoryPublishForm.lockerName.trim() || directoryPublishForm.title.trim() || currentDocument.title || 'DocWord Locker')
              : undefined)
            : undefined,
          accessPassword: directoryPublishForm.visibility === 'private'
            ? directoryPublishForm.accessPassword.trim().toUpperCase()
            : undefined,
          fileAccessPassword: directoryPublishForm.visibility === 'private' && directoryPublishForm.fileAccessPassword.trim()
            ? directoryPublishForm.fileAccessPassword.trim().toUpperCase()
            : undefined,
          passwordRotationDays: directoryPublishForm.visibility === 'private' && directoryPublishForm.lockerMode === 'new'
            ? Number(directoryPublishForm.passwordRotationDays || 30)
            : undefined,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to publish document to File Directory.');
      }
      const created = payload as SecureFileTransfer;
      setPublishedDirectoryTransfer(created);
      setDirectoryTransfers((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setDirectoryPublishStatus(`${directoryPublishForm.title.trim() || currentDocument.title} is now live in File Directory as a ${directoryPublishForm.visibility} ${directoryPublishForm.format.toUpperCase()} file.`);
      if (directoryPublishForm.visibility === 'private' && directoryPublishForm.lockerMode === 'new') {
        setDirectoryPublishForm((current) => ({
          ...current,
          lockerMode: 'existing',
          lockerId: created.lockerId || current.lockerId,
          lockerName: created.lockerName || current.lockerName,
        }));
      }
      const lockerResponse = await fetch('/api/file-directory/lockers');
      const lockerPayload = await lockerResponse.json().catch(() => []);
      if (lockerResponse.ok) {
        setDirectoryLockers(Array.isArray(lockerPayload) ? lockerPayload : []);
      }
    } catch (publishError) {
      setDirectoryPublishError(publishError instanceof Error ? publishError.message : 'Unable to publish document.');
    } finally {
      setDirectoryPublishLoading(false);
    }
  }, [currentDocument, directoryPublishForm, isAuthenticated, requestExportBlob]);

  const deleteCurrentDocument = useCallback(async () => {
    if (!currentDocument) return;
    try {
      const response = await fetch(`/api/docword/documents/${currentDocument.id}`, {
        method: 'DELETE',
        headers: actorHeaders,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to delete document.');
      const remaining = documents.filter((document) => document.id !== currentDocument.id);
      setDocuments(remaining);
      setCurrentDocumentId(remaining[0]?.id || '');
      if (!remaining[0]) {
        await createInitialDocument();
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to delete document.');
    }
  }, [actorHeaders, createInitialDocument, currentDocument, documents]);

  const deleteDocumentById = useCallback(async (documentId: string) => {
    try {
      const response = await fetch(`/api/docword/documents/${documentId}`, {
        method: 'DELETE',
        headers: actorHeaders,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to delete document.');
      const remaining = documents.filter((document) => document.id !== documentId);
      setDocuments(remaining);
      if (currentDocumentId === documentId) {
        setCurrentDocumentId(remaining[0]?.id || '');
        if (!remaining[0]) {
          await createInitialDocument();
        }
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to delete document.');
    }
  }, [actorHeaders, createInitialDocument, currentDocumentId, documents]);

  const sendCurrentDocumentToSign = useCallback(async () => {
    if (!currentDocument) return;
    setSendToSignLoading(true);
    setError('');
    try {
      const response = await fetch('/api/docword/send-to-sign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...actorHeaders,
        },
        body: JSON.stringify({
          documentId: currentDocument.id,
          watermarkEnabled: signPrepWatermarkEnabled,
          watermarkText: signPrepWatermarkText,
          recipientSignatureRequired: signPrepRecipientSignatureRequired,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to prepare signing handoff.');
      }
      const historyId = payload?.historyEntry?.id;
      setSignPrepDialogOpen(false);
      router.push(historyId ? `/workspace?tab=generate&historyId=${encodeURIComponent(historyId)}` : '/workspace?tab=generate');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to prepare signing handoff.');
    } finally {
      setSendToSignLoading(false);
    }
  }, [actorHeaders, currentDocument, router, signPrepRecipientSignatureRequired, signPrepWatermarkEnabled, signPrepWatermarkText]);

  const openSignPrepDialog = useCallback(() => {
    if (!currentDocument) return;
    setSignPrepWatermarkEnabled(Boolean(currentDocument.watermarkText?.trim()) || true);
    setSignPrepWatermarkText(currentDocument.watermarkText?.trim() || 'Confidential');
    setSignPrepRecipientSignatureRequired(currentDocument.requireSignature !== false);
    setSignPrepDialogOpen(true);
  }, [currentDocument]);

  const createFolder = useCallback(async () => {
    const folder = newFolderName.trim();
    if (!folder) return;
    setCreating(true);
    try {
      const response = await fetch('/api/docword/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...actorHeaders,
        },
        body: JSON.stringify({
          title: 'Untitled document',
          folderName: folder,
          emoji: '📁',
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to create folder.');
      syncLocalDocument(payload.document);
      setActiveFolderFilter(folder);
      setNewFolderName('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to create folder.');
    } finally {
      setCreating(false);
    }
  }, [actorHeaders, newFolderName, syncLocalDocument]);

  const updateProfileField = useCallback((field: keyof DocWordProfile, value: string) => {
    setDocProfile((current) => ({ ...current, [field]: value }));
  }, []);

  const startVoiceCapture = useCallback((target: 'guided-prompt' | GuidedField['id']) => {
    if (typeof window === 'undefined') return;
    const browserWindow = window as Window & {
      SpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        maxAlternatives: number;
        onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void) | null;
        onerror: (() => void) | null;
        onend: (() => void) | null;
        start: () => void;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        maxAlternatives: number;
        onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void) | null;
        onerror: (() => void) | null;
        onend: (() => void) | null;
        start: () => void;
      };
    };
    const SpeechRecognitionCtor = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setError('Voice input is not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setVoiceListening(true);

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || '')
        .join(' ')
        .trim();

      if (!transcript) return;
      if (target === 'guided-prompt') {
        setGuidedPrompt((current) => [current, transcript].filter(Boolean).join(' ').trim());
      } else {
        setGuidedAnswers((current) => ({ ...current, [target]: [current[target], transcript].filter(Boolean).join(' ').trim() }));
      }
      setInsight('Voice note captured into the guided draft flow.');
    };

    recognition.onerror = () => {
      setError('Voice capture could not understand that clearly. Please try again.');
      setVoiceListening(false);
    };
    recognition.onend = () => setVoiceListening(false);
    recognition.start();
  }, []);

  const applyGuidedDocument = useCallback(async () => {
    if (!selectedGuidedPreset) return;
    setGuidedLoading(true);
    try {
      if (guidedMode === 'chat') {
        const prompt = guidedPrompt.trim();
        if (!prompt) throw new Error('Add a short brief to create the document.');
        const response = await fetch('/api/docword/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'generate',
            documentTitle: selectedGuidedPreset.title,
            prompt: [
              `Create an Indian ${selectedGuidedPreset.title.toLowerCase()} in a professional, ready-to-use format.`,
              `User brief: ${prompt}`,
              docProfile.fullName ? `User profile name: ${docProfile.fullName}` : '',
              docProfile.address ? `Address: ${docProfile.address}` : '',
              docProfile.companyName ? `Company: ${docProfile.companyName}` : '',
              docProfile.collegeName ? `College: ${docProfile.collegeName}` : '',
            ].filter(Boolean).join('\n'),
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Failed to generate guided document.');
        const text = String(payload.result || '').trim();
        const blocks = buildDocBlocksFromLines(text.split(/\n{2,}|\n/).map((line) => line.trim()).filter(Boolean));
        updateCurrentDocument({
          title: selectedGuidedPreset.title,
          folderName: selectedGuidedPreset.folderName,
          emoji: selectedGuidedPreset.emoji,
          summary: selectedGuidedPreset.description,
          blocks: blocks.length ? blocks : [createBlock('paragraph', '<p>Start editing your generated draft.</p>')],
          lastAiAction: 'generate',
        });
      } else {
        const built = selectedGuidedPreset.build(guidedAnswers, docProfile);
        updateCurrentDocument({
          title: built.title,
          folderName: selectedGuidedPreset.folderName,
          emoji: selectedGuidedPreset.emoji,
          summary: built.summary,
          blocks: built.blocks,
          lastAiAction: 'generate',
        });
      }

      setShowGuidedCreator(false);
      setGuidedPrompt('');
      setGuidedAnswers({});
      setInsight(`${selectedGuidedPreset.title} is ready. You can now review, refine, and share it.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to build the guided document.');
    } finally {
      setGuidedLoading(false);
    }
  }, [docProfile, guidedAnswers, guidedMode, guidedPrompt, selectedGuidedPreset, updateCurrentDocument]);

  const importExistingDocument = useCallback(async (file?: File | null) => {
    if (!file || !currentDocument) return;
    try {
      const extension = file.name.toLowerCase();
      let html = '';
      let summary = `Imported from ${file.name}`;

      if (extension.endsWith('.docx')) {
        const mammoth = await import('mammoth');
        const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
        html = result.value || '';
      } else if (extension.endsWith('.txt') || extension.endsWith('.md')) {
        const text = await file.text();
        html = text
          .split(/\n{2,}/)
          .map((part) => `<p>${part.replace(/\n/g, '<br/>')}</p>`)
          .join('');
      } else if (extension.endsWith('.html') || extension.endsWith('.htm')) {
        html = await file.text();
      } else {
        throw new Error('Import supports DOCX, TXT, MD, and HTML right now.');
      }

      const importedText = stripHtml(html);
      const importedBlocks = importedText
        .split(/\n{2,}/)
        .filter(Boolean)
        .map((part, index) =>
          createBlock(index === 0 ? 'heading-1' : 'paragraph', index === 0 ? part : `<p>${part.replace(/\n/g, '<br/>')}</p>`),
        );

      updateCurrentDocument({
        title: file.name.replace(/\.(docx|txt|md|html|htm)$/i, ''),
        blocks: importedBlocks.length ? importedBlocks : [createBlock('paragraph', '<p>Imported content</p>')],
        summary,
      });
      setInsight('Imported document is ready to edit.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to import this document.');
    }
  }, [currentDocument, updateCurrentDocument]);

  const addCommentToBlock = useCallback((blockId: string) => {
    const note = (commentDrafts[blockId] || '').trim();
    if (!note) return;
    const block = currentDocument?.blocks.find((item) => item.id === blockId);
    if (!block) return;
    updateBlock(blockId, {
      meta: {
        ...(block.meta || {}),
        comments: [...(block.meta?.comments || []), note],
      },
    });
    setCommentDrafts((current) => ({ ...current, [blockId]: '' }));
  }, [commentDrafts, currentDocument?.blocks, updateBlock]);

  const removeCommentFromBlock = useCallback((blockId: string, commentIndex: number) => {
    const block = currentDocument?.blocks.find((item) => item.id === blockId);
    if (!block) return;
    updateBlock(blockId, {
      meta: {
        ...(block.meta || {}),
        comments: (block.meta?.comments || []).filter((_, index) => index !== commentIndex),
      },
    });
  }, [currentDocument?.blocks, updateBlock]);

  const dismissBlockSuggestion = useCallback((blockId: string) => {
    setBlockSuggestions((current) => {
      const next = { ...current };
      delete next[blockId];
      return next;
    });
  }, []);

  const runFindReplace = useCallback((replaceAll = false) => {
    if (!currentDocument || !findQuery.trim()) return;
    const matcher = new RegExp(findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    let replaced = false;
    let replacements = 0;
    updateCurrentDocument({
      blocks: currentDocument.blocks.map((block) => {
        if (!block.html.match(matcher)) return block;
        if (!replaceAll && replaced) return block;
        replaced = true;
        replacements += 1;
        const nextHtml = block.html.replace(matcher, replaceValue || findQuery);
        return {
          ...block,
          html: nextHtml,
          text: stripHtml(nextHtml),
        };
      }),
    });
    setInsight(replacements ? `${replacements} ${replacements === 1 ? 'match was' : 'matches were'} updated in this document.` : 'No matching text was found.');
  }, [currentDocument, findQuery, replaceValue, updateCurrentDocument]);

  const unlockCurrentDocument = useCallback(() => {
    if (!currentDocument?.documentLockCode) return;
    if (documentUnlockCode.trim() === currentDocument.documentLockCode) {
      setUnlockedDocuments((current) => (current.includes(currentDocument.id) ? current : [...current, currentDocument.id]));
      setDocumentUnlockCode('');
      return;
    }
    setError('Invalid document lock code.');
  }, [currentDocument, documentUnlockCode]);

  const unlockCurrentFolder = useCallback(() => {
    if (!currentDocument?.folderLockCode) return;
    const folderName = currentDocument.folderName?.trim() || 'General';
    if (folderUnlockCode.trim() === currentDocument.folderLockCode) {
      setUnlockedFolders((current) => (current.includes(folderName) ? current : [...current, folderName]));
      setFolderUnlockCode('');
      return;
    }
    setError('Invalid folder lock code.');
  }, [currentDocument, folderUnlockCode]);

  const activeFolderLocked = Boolean(
    currentDocument?.folderLockCode &&
      !unlockedFolders.includes(currentDocument.folderName?.trim() || 'General'),
  );
  const activeDocumentLocked = Boolean(
    currentDocument?.documentLockCode &&
      !(currentDocument.accessGroups || []).length &&
      !unlockedDocuments.includes(currentDocument.id),
  );

  const applyTemplate = useCallback((templateId: string) => {
    const template = templateCatalog.find((item) => item.id === templateId);
    if (!template || !currentDocument) return;
    updateCurrentDocument({
      title: template.name,
      emoji: template.emoji,
      templateId: template.id,
      blocks: template.blocks.map((block) => ({
        ...block,
        id: `block_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      })),
      summary: template.description,
    });
    setShowTemplates(false);
  }, [currentDocument, updateCurrentDocument]);

  const fetchSuggestionVariants = useCallback(async (text: string) => {
    if (!text.trim()) return [];
    const [fixRes, conciseRes, formalRes] = await Promise.all([
      fetch('/api/docword/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'fix', text, fullText: currentDocument?.plainText, documentTitle: currentDocument?.title }),
      }),
      fetch('/api/docword/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'rewrite_concise', text, fullText: currentDocument?.plainText, documentTitle: currentDocument?.title }),
      }),
      fetch('/api/docword/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'rewrite_formal', text, fullText: currentDocument?.plainText, documentTitle: currentDocument?.title }),
      }),
    ]);
    const results = await Promise.all([fixRes.json(), conciseRes.json(), formalRes.json()]);
    return results.map((item) => item.result).filter(Boolean).slice(0, 3);
  }, [currentDocument?.plainText, currentDocument?.title]);

  const generateInlineSuggestions = useCallback(async () => {
    if (!activeBlock?.text?.trim()) return;
    setInlineSuggestionsLoading(true);
    try {
      setInlineSuggestions(await fetchSuggestionVariants(activeBlock.text));
    } catch {
      setInlineSuggestions([]);
    } finally {
      setInlineSuggestionsLoading(false);
    }
  }, [activeBlock?.text, fetchSuggestionVariants]);

  const fetchSelectionAssistSuggestion = useCallback(async (text: string, assistId: (typeof selectionAssistModes)[number]['id']) => {
    const assist = selectionAssistModes.find((item) => item.id === assistId) || selectionAssistModes[0];
    const response = await fetch('/api/docword/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: assist.mode,
        text,
        fullText: currentDocument?.plainText,
        documentTitle: currentDocument?.title,
        prompt: `${assist.hint} Rewrite only the exact selected text. Do not add a greeting, explanation, bullets, or extra sentences. Keep the response close in length to the selection.`,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Failed to prepare selection suggestion.');
    return String(payload.result || '').trim();
  }, [currentDocument?.plainText, currentDocument?.title]);

  const applyTrackedChange = useCallback((changeId: string, status: 'accepted' | 'rejected') => {
    if (!currentDocument) return;
    const change = (currentDocument.trackedChanges || []).find((item) => item.id === changeId);
    if (!change) return;

    let nextBlocks = currentDocument.blocks;
    if (status === 'rejected') {
      nextBlocks = currentDocument.blocks.map((block) =>
        block.id === change.blockId
          ? {
              ...block,
              html: change.beforeHtml,
              text: stripHtml(change.beforeHtml),
            }
          : block,
      );
    }

    updateCurrentDocument({
      blocks: nextBlocks,
      trackedChanges: (currentDocument.trackedChanges || []).map((item) =>
        item.id === changeId ? { ...item, status } : item,
      ),
    });
  }, [currentDocument, updateCurrentDocument]);

  const pushTrackedChange = useCallback((change: Omit<DocWordTrackedChange, 'id' | 'createdAt' | 'status'>) => {
    if (!currentDocument?.trackChangesEnabled) return;
    updateCurrentDocument({
      trackedChanges: [createTrackedChangeEntry(change), ...(currentDocument.trackedChanges || [])].slice(0, 20),
    });
  }, [currentDocument, updateCurrentDocument]);

  const applyBlockSuggestion = useCallback((blockId: string) => {
    const suggestion = blockSuggestions[blockId];
    if (!suggestion) return;
    const originalBlock = currentDocument?.blocks.find((block) => block.id === blockId);
    if (originalBlock) {
      pushTrackedChange({
        blockId,
        kind: 'ai_block',
        label: 'AI block suggestion',
        beforeHtml: originalBlock.html,
        afterHtml: suggestion,
      });
    }
    updateBlock(blockId, { html: suggestion, text: stripHtml(suggestion) });
    setBlockSuggestions((current) => {
      const next = { ...current };
      delete next[blockId];
      return next;
    });
  }, [blockSuggestions, currentDocument?.blocks, pushTrackedChange, updateBlock]);

  const rewriteBlockWithAi = useCallback(async (block: DocWordBlock) => {
    if (!block.text.trim()) return;
    setBlockSuggestionLoading(block.id);
    try {
      const response = await fetch('/api/docword/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'rewrite_concise',
          text: block.text,
          fullText: currentDocument?.plainText,
          documentTitle: currentDocument?.title,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to rewrite block.');
      if (suggestionMode) {
        setBlockSuggestions((current) => ({ ...current, [block.id]: payload.result }));
      } else {
        pushTrackedChange({
          blockId: block.id,
          kind: 'ai_block',
          label: 'AI block rewrite',
          beforeHtml: block.html,
          afterHtml: payload.result,
        });
        updateBlock(block.id, { html: payload.result, text: stripHtml(payload.result) });
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to rewrite block.');
    } finally {
      setBlockSuggestionLoading('');
    }
  }, [currentDocument?.plainText, currentDocument?.title, pushTrackedChange, suggestionMode, updateBlock]);

  const addSelectionComment = useCallback(() => {
    if (!currentDocument || !selectionText.trim() || !selectionCommentDraft.trim() || !selectionTargetBlockId) return;
    updateCurrentDocument({
      selectionComments: [
        createSelectionCommentEntry({
          blockId: selectionTargetBlockId,
          selectionText: selectionText.trim(),
          comment: selectionCommentDraft.trim(),
        }),
        ...(currentDocument.selectionComments || []),
      ].slice(0, 30),
    });
    setSelectionCommentDraft('');
    setInsight('Comment added to the selected text.');
  }, [currentDocument, selectionCommentDraft, selectionTargetBlockId, selectionText, updateCurrentDocument]);

  const removeSelectionComment = useCallback((commentId: string) => {
    if (!currentDocument) return;
    updateCurrentDocument({
      selectionComments: (currentDocument.selectionComments || []).filter((comment) => comment.id !== commentId),
    });
  }, [currentDocument, updateCurrentDocument]);

  const documentScore = useMemo(() => {
    const text = currentDocument?.plainText?.trim() || '';
    if (!text) {
      return { score: 0, label: 'Start writing', notes: ['Add content to generate a live writing score.'] };
    }
    const words = text.split(/\s+/).filter(Boolean).length;
    const paragraphs = text.split(/\n{2,}/).filter(Boolean).length;
    const longSentences = (text.match(/[^.!?]{140,}[.!?]/g) || []).length;
    const hasAction = /\b(please|kindly|request|next step|action|required|approve|respond)\b/i.test(text);
    const hasStructure = /(^|\n)(subject|summary|scope|timeline|regards|sincerely|to:|dear)\b/i.test(text);

    let score = 56;
    if (words > 80) score += 10;
    if (paragraphs > 2) score += 8;
    if (hasAction) score += 10;
    if (hasStructure) score += 10;
    score -= Math.min(16, longSentences * 4);
    score = Math.max(22, Math.min(96, score));

    const notes = [
      hasStructure ? 'Structure is visible and easier to scan.' : 'Add a clearer structure with headings or a subject line.',
      hasAction ? 'The ask or next step is visible.' : 'Make the requested action or decision more explicit.',
      longSentences ? 'A few long sentences could be tightened for readability.' : 'Sentence length looks reasonably controlled.',
    ];

    return {
      score,
      label: score >= 82 ? 'Strong draft' : score >= 68 ? 'Needs polish' : 'Needs clarity',
      notes,
    };
  }, [currentDocument?.plainText]);

  const generateReplyDraft = useCallback(async () => {
    if (!currentDocument || !replySource.trim()) return;
    setReplyLoading(true);
    try {
      const response = await fetch('/api/docword/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'reply',
          text: replySource.trim(),
          fullText: currentDocument.plainText,
          documentTitle: currentDocument.title,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to prepare reply.');
      const result = String(payload.result || '').trim();
      const replyHtml = result
        .split(/\n{2,}/)
        .filter(Boolean)
        .map((part, index) => createBlock(index === 0 ? 'heading-1' : 'paragraph', index === 0 ? part : `<p>${part.replace(/\n/g, '<br/>')}</p>`));
      updateCurrentDocument({
        blocks: replyHtml.length ? replyHtml : currentDocument.blocks,
        summary: 'AI reply draft prepared from the pasted source.',
        lastAiAction: 'reply',
      });
      pushTrackedChange({
        blockId: replyHtml[0]?.id || currentDocument.blocks[0]?.id || 'reply',
        kind: 'ai_reply',
        label: 'AI reply draft created',
        beforeHtml: currentDocument.html,
        afterHtml: buildHtml(replyHtml),
      });
      setInsight('Reply draft is ready. Review it before sharing or sending.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to generate reply draft.');
    } finally {
      setReplyLoading(false);
    }
  }, [currentDocument, pushTrackedChange, replySource, updateCurrentDocument]);

  const buildBlocksFromDocaiText = useCallback((value: string) => {
    const parts = value
      .split(/\n{2,}/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (!parts.length) {
      return [createBlock('paragraph', '<p></p>')];
    }

    return parts.map((part, index) => {
      const sanitized = part.replace(/\n/g, '<br/>');
      if (index === 0 && part.length <= 100) {
        return createBlock('heading-1', part);
      }
      return createBlock('paragraph', `<p>${sanitized}</p>`);
    });
  }, []);

  const pushDocaiAssistantMessage = useCallback((text: string, mode?: DocaiActionMode, canApply = false) => {
    setDocaiMessages((current) => [
      ...current,
      {
        id: `docai-assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: 'assistant',
        text,
        mode,
        canApply,
      },
    ]);
  }, []);

  const applyDocaiMessageToDocument = useCallback((message: DocaiMessage) => {
    if (!currentDocument || !message.text.trim()) return;

    if (message.mode === 'summarize') {
      updateCurrentDocument({
        summary: message.text.trim(),
        lastAiAction: 'summarize',
      });
      setInsight('Docai summary added to this document.');
      return;
    }

    if (message.mode === 'proofread') {
      setInsight('Docai review suggestions are ready in chat for this document.');
      return;
    }

    if (message.mode === 'reply') {
      const replyBlocks = buildBlocksFromDocaiText(message.text);
      updateCurrentDocument({
        blocks: replyBlocks,
        summary: 'Docai prepared a professional reply draft.',
        lastAiAction: 'reply',
      });
      setInsight('Docai reply draft is now on the page.');
      return;
    }

    if (activeBlock && (message.mode === 'fix' || message.mode === 'rewrite_formal' || message.mode === 'rewrite_concise')) {
      updateBlock(activeBlock.id, {
        html: message.text,
        text: stripHtml(message.text),
      });
      updateCurrentDocument({ lastAiAction: message.mode });
      setInsight('Docai applied the update to the active section.');
      return;
    }

    const generatedBlocks = buildBlocksFromDocaiText(message.text);
    updateCurrentDocument({
      blocks: generatedBlocks,
      summary: 'Docai drafted this document from chat.',
      lastAiAction: 'generate',
    });
    setInsight('Docai draft inserted into the document.');
  }, [activeBlock, buildBlocksFromDocaiText, currentDocument, updateBlock, updateCurrentDocument]);

  const uploadImageToBlock = useCallback((blockId: string, file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      updateBlock(blockId, {
        meta: {
          ...(currentDocument?.blocks.find((item) => item.id === blockId)?.meta || {}),
          src: result,
          alt: file.name,
        },
        html: file.name,
        text: file.name,
      });
    };
    reader.readAsDataURL(file);
  }, [currentDocument?.blocks, updateBlock]);

  const duplicateCurrentDocument = useCallback(async () => {
    if (!currentDocument) return;
    setCreating(true);
    try {
      const response = await fetch('/api/docword/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...actorHeaders,
        },
        body: JSON.stringify({
          title: `${currentDocument.title} copy`,
          folderName: currentDocument.folderName,
          emoji: currentDocument.emoji,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to duplicate document.');
      const duplicated = { ...payload.document, blocks: currentDocument.blocks, summary: currentDocument.summary };
      await fetch(`/api/docword/documents/${payload.document.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...actorHeaders,
        },
        body: JSON.stringify({
          ...buildPayload(duplicated),
          saveSource: 'manual',
        }),
      });
      syncLocalDocument({ ...duplicated, updatedAt: new Date().toISOString() });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to duplicate document.');
    } finally {
      setCreating(false);
    }
  }, [actorHeaders, buildPayload, currentDocument, syncLocalDocument]);

  const syncActiveBlockFromDom = useCallback(() => {
    if (!activeBlockId) return;
    const node = document.querySelector(`[data-docword-block-id="${activeBlockId}"]`) as HTMLDivElement | null;
    if (!node) return;
    updateBlock(activeBlockId, { html: node.innerHTML, text: stripHtml(node.innerHTML) });
    syncSelectionFormattingState(node);
  }, [activeBlockId, syncSelectionFormattingState, updateBlock]);

  const runEditorCommand = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
  }, []);

  const runEditorCommandAndSync = useCallback((command: string, value?: string) => {
    runEditorCommand(command, value);
    window.requestAnimationFrame(() => syncActiveBlockFromDom());
  }, [runEditorCommand, syncActiveBlockFromDom]);

  const applyDocaiControlAction = useCallback((mode: DocaiActionMode, prompt = '') => {
    if (!currentDocument) return false;

    if (mode === 'theme_classic' || mode === 'theme_sky' || mode === 'theme_linen' || mode === 'theme_midnight') {
      const documentTheme =
        mode === 'theme_classic'
          ? 'classic'
          : mode === 'theme_sky'
            ? 'sky'
            : mode === 'theme_linen'
              ? 'linen'
              : 'midnight';
      updateCurrentDocument({ documentTheme });
      pushDocaiAssistantMessage(`Document background updated to ${documentThemes.find((item) => item.id === documentTheme)?.label || documentTheme}.`);
      return true;
    }

    if (mode === 'header' || mode === 'footer' || mode === 'watermark') {
      const value = prompt.trim();
      if (!value) {
        pushDocaiAssistantMessage(`Give me the ${mode === 'watermark' ? 'watermark text' : mode} content and I will place it on the document.`);
        return true;
      }
      if (mode === 'header') {
        updateCurrentDocument({ headerHtml: value });
        pushDocaiAssistantMessage('Header updated on the document canvas.');
        return true;
      }
      if (mode === 'footer') {
        updateCurrentDocument({ footerHtml: value });
        pushDocaiAssistantMessage('Footer updated on the document canvas.');
        return true;
      }
      updateCurrentDocument({ watermarkText: value });
      pushDocaiAssistantMessage(`Watermark set to "${value}".`);
      return true;
    }

    if (!activeBlock && (mode === 'heading_1' || mode === 'heading_2')) {
      pushDocaiAssistantMessage('Click into a paragraph first, then ask me to change it into a heading.');
      return true;
    }

    if (mode === 'heading_1' && activeBlock) {
      applySlashOption(activeBlock.id, 'heading-1');
      pushDocaiAssistantMessage('Active section changed to Heading 1.');
      return true;
    }

    if (mode === 'heading_2' && activeBlock) {
      applySlashOption(activeBlock.id, 'heading-2');
      pushDocaiAssistantMessage('Active section changed to Heading 2.');
      return true;
    }

    if (mode === 'bullets') {
      runEditorCommandAndSync('insertUnorderedList');
      pushDocaiAssistantMessage('Bulleted formatting applied to the current selection.');
      return true;
    }

    if (mode === 'align_left') {
      runEditorCommandAndSync('justifyLeft');
      pushDocaiAssistantMessage('Aligned the current selection to the left.');
      return true;
    }

    if (mode === 'align_center') {
      runEditorCommandAndSync('justifyCenter');
      pushDocaiAssistantMessage('Centered the current selection.');
      return true;
    }

    if (mode === 'align_right') {
      runEditorCommandAndSync('justifyRight');
      pushDocaiAssistantMessage('Aligned the current selection to the right.');
      return true;
    }

    return false;
  }, [activeBlock, currentDocument, applySlashOption, pushDocaiAssistantMessage, runEditorCommandAndSync, updateCurrentDocument]);

  const sendDocaiMessage = useCallback(async (mode: DocaiActionMode, promptOverride?: string) => {
    if (!currentDocument) return;
    const prompt = (promptOverride ?? docaiInput).trim();
    if (!prompt && mode !== 'heading_1' && mode !== 'heading_2' && mode !== 'bullets' && mode !== 'align_left' && mode !== 'align_center' && mode !== 'align_right' && mode !== 'theme_classic' && mode !== 'theme_sky' && mode !== 'theme_linen' && mode !== 'theme_midnight') return;

    const userMessage: DocaiMessage = {
      id: `docai-user-${Date.now()}`,
      role: 'user',
      text: prompt || docaiQuickActions.find((item) => item.mode === mode)?.label || mode,
      mode,
    };

    setDocaiMessages((current) => [...current, userMessage]);
    setDocaiInput('');
    setError('');

    if (applyDocaiControlAction(mode, prompt)) {
      return;
    }

    setDocaiLoading(true);

    const selection = typeof window !== 'undefined' ? window.getSelection()?.toString().trim() || '' : '';
    const textSource =
      mode === 'generate'
        ? prompt
        : mode === 'reply'
          ? prompt
          : selection || activeBlock?.text || currentDocument.plainText || stripHtml(buildHtml(currentDocument.blocks));

    try {
      const response = await fetch('/api/docword/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          text: textSource,
          fullText: currentDocument.plainText,
          documentTitle: currentDocument.title,
          prompt,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Docai could not prepare a response.');

      const result = String(payload.result || '').trim();
      const assistantMessage: DocaiMessage = {
        id: `docai-assistant-${Date.now()}`,
        role: 'assistant',
        text: result,
        mode,
        canApply: mode !== 'proofread',
      };
      setDocaiMessages((current) => [...current, assistantMessage]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Docai is unavailable right now.');
      setDocaiMessages((current) => [
        ...current,
        {
          id: `docai-error-${Date.now()}`,
          role: 'assistant',
          text: requestError instanceof Error ? requestError.message : 'Docai is unavailable right now.',
        },
      ]);
    } finally {
      setDocaiLoading(false);
    }
  }, [activeBlock, applyDocaiControlAction, currentDocument, docaiInput]);

  const restoreStoredSelection = useCallback(() => {
    const selection = window.getSelection();
    const storedRange = selectionRangeRef.current?.cloneRange() || null;
    if (!selection || !storedRange) return null;
    selection.removeAllRanges();
    selection.addRange(storedRange);
    return { selection, range: storedRange };
  }, []);

  const normalizeLegacyFontMarkup = useCallback((root: HTMLElement, options?: { fontSizePt?: string; fontFamily?: string }) => {
    root.querySelectorAll('font').forEach((node) => {
      const span = document.createElement('span');
      const fontFace = node.getAttribute('face');
      if (fontFace) {
        span.style.fontFamily = fontFace;
      }
      if (options?.fontFamily) {
        span.style.fontFamily = options.fontFamily;
      }
      if (node.getAttribute('size') || options?.fontSizePt) {
        span.style.fontSize = `${options?.fontSizePt || clampFontPointSize(node.getAttribute('size') || '11')}pt`;
      }
      while (node.firstChild) {
        span.appendChild(node.firstChild);
      }
      node.replaceWith(span);
    });
  }, []);

  const getSelectionAnchorElement = useCallback(() => {
    const restored = restoreStoredSelection();
    const range = restored?.range || null;
    if (range) {
      const startNode = range.startContainer.nodeType === Node.ELEMENT_NODE
        ? (range.startContainer as HTMLElement)
        : range.startContainer.parentElement;
      if (startNode) return startNode;
    }
    if (activeBlockId) {
      return document.querySelector(`[data-docword-block-id="${activeBlockId}"]`) as HTMLElement | null;
    }
    return null;
  }, [activeBlockId, restoreStoredSelection]);

  const getCurrentSelectionFontSize = useCallback(() => {
    const anchor = getSelectionAnchorElement();
    if (!anchor || typeof window === 'undefined') return clampFontPointSize(editorFontSize, 11);
    return cssLengthToPointSize(window.getComputedStyle(anchor).fontSize, Number(editorFontSize) || 11);
  }, [editorFontSize, getSelectionAnchorElement]);

  const applyBlockWrapperStyle = useCallback((blockId: string, styles: Record<string, string>) => {
    const block = currentDocument?.blocks.find((item) => item.id === blockId);
    if (!block) return false;
    const inlineStyle = Object.entries(styles)
      .map(([key, value]) => `${key}:${value}`)
      .join(';');
    const baseHtml = block.html?.trim() || '<br/>';
    updateBlock(blockId, {
      html: `<span style="${inlineStyle}">${baseHtml}</span>`,
      text: stripHtml(baseHtml),
    });
    return true;
  }, [currentDocument?.blocks, updateBlock]);

  const applySelectionStyle = useCallback((styles: Record<string, string>) => {
    const restored = restoreStoredSelection();
    if (!restored) return;
    const { selection, range } = restored;
    const inlineStyle = Object.entries(styles)
      .map(([key, value]) => `${key}:${value}`)
      .join(';');

    const selectedText = range.toString().trim();

    if (!selectedText) return;

    const span = document.createElement('span');
    Object.entries(styles).forEach(([key, value]) => {
      span.style.setProperty(key, value);
    });

    try {
      const fragment = range.extractContents();
      span.appendChild(fragment);
      range.insertNode(span);
      const nextRange = document.createRange();
      nextRange.selectNodeContents(span);
      selection.removeAllRanges();
      selection.addRange(nextRange);
      selectionRangeRef.current = nextRange.cloneRange();
    } catch {
      document.execCommand('insertHTML', false, `<span style="${inlineStyle}">${selectedText}</span>`);
    }

    window.requestAnimationFrame(() => syncActiveBlockFromDom());
  }, [restoreStoredSelection, syncActiveBlockFromDom]);

  const applySelectionFontSize = useCallback((nextSize: string | number) => {
    const restored = restoreStoredSelection();
    const pointSize = clampFontPointSize(nextSize, Number(editorFontSize) || 11);
    if (!restored || !restored.range.toString().trim()) {
      if (activeBlockId) {
        const applied = applyBlockWrapperStyle(activeBlockId, { 'font-size': `${pointSize}pt` });
        if (applied) {
          setEditorFontSize(pointSize);
          return true;
        }
      }
      return false;
    }
    applySelectionStyle({ 'font-size': `${pointSize}pt` });
    setEditorFontSize(pointSize);
    return true;
  }, [activeBlockId, applyBlockWrapperStyle, applySelectionStyle, editorFontSize, restoreStoredSelection]);

  const applySelectionFontFamily = useCallback((fontFamily: string) => {
    const restored = restoreStoredSelection();
    if (!restored || !restored.range.toString().trim()) {
      if (activeBlockId) {
        const applied = applyBlockWrapperStyle(activeBlockId, { 'font-family': fontFamily });
        if (applied) {
          setEditorFontFamily(fontFamily as (typeof fontFamilies)[number]);
          return true;
        }
      }
      return false;
    }

    const { range } = restored;

    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand('fontName', false, fontFamily);

    window.requestAnimationFrame(() => {
      const blockId = selectionTargetBlockId || activeBlockId;
      const blockNode = blockId
        ? (document.querySelector(`[data-docword-block-id="${blockId}"]`) as HTMLDivElement | null)
        : null;
      const root = blockNode || (range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? (range.commonAncestorContainer as HTMLElement)
        : range.commonAncestorContainer.parentElement);

      if (root instanceof HTMLElement) {
        normalizeLegacyFontMarkup(root, { fontFamily });
      }
      const updatedSelection = window.getSelection();
      if (updatedSelection && updatedSelection.rangeCount > 0) {
        selectionRangeRef.current = updatedSelection.getRangeAt(0).cloneRange();
      }
      syncActiveBlockFromDom();
    });

    setEditorFontFamily(fontFamily as (typeof fontFamilies)[number]);
    return true;
  }, [activeBlockId, applyBlockWrapperStyle, normalizeLegacyFontMarkup, restoreStoredSelection, selectionTargetBlockId, syncActiveBlockFromDom]);

  const applyLineSpacing = useCallback((value: (typeof lineSpacingLevels)[number]['value']) => {
    setEditorLineSpacing(value);
    applySelectionStyle({ 'line-height': value });
  }, [applySelectionStyle]);

  const adjustFontSize = useCallback((delta: number) => {
    const next = clampFontPointSize(Number(getCurrentSelectionFontSize()) + delta, Number(editorFontSize) || 11);
    applySelectionFontSize(next);
  }, [applySelectionFontSize, editorFontSize, getCurrentSelectionFontSize]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (modifier && key === 'k') {
        event.preventDefault();
        setShowCommandPalette((current) => !current);
      }
      if (modifier && key === 's') {
        event.preventDefault();
        if (currentDocument) {
          setSaveState('saving');
          void saveDocument(currentDocument, 'manual');
        }
      }
      if (modifier && key === 'b') {
        event.preventDefault();
        runEditorCommandAndSync('bold');
      }
      if (modifier && key === 'i') {
        event.preventDefault();
        runEditorCommandAndSync('italic');
      }
      if (modifier && key === 'u') {
        event.preventDefault();
        runEditorCommandAndSync('underline');
      }
      if (modifier && event.shiftKey && event.key === '>') {
        event.preventDefault();
        adjustFontSize(1);
      }
      if (modifier && event.shiftKey && event.key === '<') {
        event.preventDefault();
        adjustFontSize(-1);
      }
      if (modifier && event.altKey && key === 'f') {
        event.preventDefault();
        setShowFindReplace((current) => !current);
      }
      if (modifier && event.altKey && key === 'p') {
        event.preventDefault();
        setPreviewMode((current) => !current);
      }
      if (event.key === 'Escape') {
        setShowCommandPalette(false);
        closeSelectionAssistant();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [adjustFontSize, closeSelectionAssistant, currentDocument, runEditorCommandAndSync, saveDocument]);

  const insertLink = useCallback(() => {
    const url = window.prompt('Paste the link URL');
    if (!url) return;
    runEditorCommandAndSync('createLink', url);
  }, [runEditorCommandAndSync]);

  const insertRichBlock = useCallback((type: DocWordBlock['type']) => {
    if (!currentDocument) return;
    const activeIndex = currentDocument.blocks.findIndex((block) => block.id === activeBlockId);
    const insertIndex = activeIndex >= 0 ? activeIndex : currentDocument.blocks.length - 1;
    insertBlockAfter(insertIndex, type);
  }, [activeBlockId, currentDocument, insertBlockAfter]);

  const applyStarterChip = useCallback((action: string) => {
    if (action === 'templates') {
      setShowTemplates(true);
      return;
    }
    if (action === 'ai') {
      setAiPrompt('Generate a clean, professional section for this document.');
      setShowCommandPalette(true);
      return;
    }
    if (!currentDocument) return;

    if (action === 'meeting') {
      applyTemplate('meeting');
      return;
    }

    if (action === 'email') {
      updateCurrentDocument({
        title: 'Email draft',
        blocks: [
          createBlock('paragraph', 'Hi team,'),
          createBlock('paragraph', 'Sharing a polished update on the current status, next steps, and any decisions required.'),
          createBlock('paragraph', 'Best regards,'),
        ],
        summary: 'A clean email draft structure for a quick send.',
      });
    }
  }, [applyTemplate, currentDocument, updateCurrentDocument]);

  const toolbarButtonClass = cn(
    'h-9 rounded-xl px-3 text-xs sm:text-sm [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 [&_svg]:stroke-[2.2]',
    darkMode ? 'border-white/[0.04] bg-black/30 text-white backdrop-blur-xl hover:bg-black/45' : 'border-slate-200 bg-white text-slate-700',
  );
  const mobileTopPillButtonClass = cn(
    'inline-flex h-9 shrink-0 items-center justify-center rounded-xl px-3 text-xs font-medium whitespace-nowrap [&_svg]:mr-2 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 [&_svg]:stroke-[2.2]',
    darkMode ? 'border-white/[0.04] bg-black/30 text-white backdrop-blur-xl hover:bg-black/45' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50',
  );
  const mobileDockButtonClass = cn(
    'h-11 shrink-0 rounded-2xl px-3 text-sm font-medium backdrop-blur-xl [&_svg]:mr-2 [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:shrink-0 [&_svg]:stroke-[2.2]',
    darkMode ? 'border-white/[0.04] bg-black/35 text-white backdrop-blur-2xl hover:bg-black/50' : 'border-slate-200 bg-white/95 text-slate-800 hover:bg-white',
  );
  const mobileDockActiveButtonClass = 'border-slate-950 bg-slate-950 text-white hover:bg-slate-900';
  const mobileToolIconButtonClass = cn(
    'flex h-[4.4rem] w-full flex-col items-center justify-center gap-1 rounded-2xl border px-2 text-center text-[11px] font-medium tracking-[-0.01em] [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:shrink-0 [&_svg]:stroke-[2.2]',
    darkMode ? 'border-white/[0.04] bg-black/30 text-white backdrop-blur-xl hover:bg-black/45' : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50',
  );
  const mobileToolActionButtonClass = cn(
    'h-11 rounded-2xl border px-3 text-sm font-medium [&_svg]:mr-2 [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:shrink-0 [&_svg]:stroke-[2.2]',
    darkMode ? 'border-white/[0.04] bg-black/30 text-white backdrop-blur-xl hover:bg-black/45' : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50',
  );
  const mobileToolStepperButtonClass = cn(
    'h-10 w-10 rounded-xl border px-0 [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:stroke-[2.2]',
    darkMode ? 'border-white/[0.04] bg-black/30 text-white backdrop-blur-xl hover:bg-black/45' : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50',
  );
  const sidebarSectionButtonClass = cn(
    'flex w-full items-center justify-between gap-3 rounded-[1rem] px-3 py-3 text-left transition',
    darkMode ? 'bg-black/28 text-white backdrop-blur-xl hover:bg-black/42' : 'bg-white text-slate-900 hover:bg-slate-50',
  );

  const canOpenDocument = useCallback((document: DocWordDocument) => {
    const folderName = document.folderName?.trim() || 'General';
    const folderUnlocked = !document.folderLockCode || unlockedFolders.includes(folderName);
    const documentUnlocked =
      !document.documentLockCode ||
      (document.accessGroups || []).length > 0 ||
      unlockedDocuments.includes(document.id);
    return folderUnlocked && documentUnlocked;
  }, [unlockedDocuments, unlockedFolders]);

  useEffect(() => {
    setInlineSuggestions([]);
    if (activeBlock?.text?.trim()) {
      const timer = window.setTimeout(() => {
        void generateInlineSuggestions();
      }, 700);
      return () => window.clearTimeout(timer);
    }
  }, [activeBlock?.id, activeBlock?.text, generateInlineSuggestions]);

  useEffect(() => {
    if (!selectionText.trim()) {
      setSelectionSuggestions([]);
      setSelectionSuggestionsLoading(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setSelectionSuggestionsLoading(true);
      try {
        const suggestion = await fetchSelectionAssistSuggestion(selectionText, selectionAssistMode);
        setSelectionSuggestions(suggestion ? [suggestion] : []);
      } catch {
        setSelectionSuggestions([]);
      } finally {
        setSelectionSuggestionsLoading(false);
      }
    }, 180);

    return () => window.clearTimeout(timer);
  }, [fetchSelectionAssistSuggestion, selectionAssistMode, selectionText]);

  const applySelectionSuggestion = useCallback((suggestion: string) => {
    const selection = window.getSelection();
    const storedRange = selectionRangeRef.current?.cloneRange();
    if (!selection || !storedRange || !selectionTargetBlockId || !currentDocument) return;
    const originalBlock = currentDocument.blocks.find((block) => block.id === selectionTargetBlockId);
    if (!originalBlock) return;

    selection.removeAllRanges();
    selection.addRange(storedRange);

    const hasMarkup = /<\/?[a-z][\s\S]*>/i.test(suggestion);
    document.execCommand('insertHTML', false, hasMarkup ? suggestion : suggestion.replace(/\n/g, '<br/>'));

    window.requestAnimationFrame(() => {
      const node = document.querySelector(`[data-docword-block-id="${selectionTargetBlockId}"]`) as HTMLDivElement | null;
      const nextHtml = node?.innerHTML || originalBlock.html;
      pushTrackedChange({
        blockId: selectionTargetBlockId,
        kind: 'ai_selection',
        label: `${activeSelectionAssist.label} suggestion`,
        beforeHtml: originalBlock.html,
        afterHtml: nextHtml,
      });
      syncActiveBlockFromDom();
      setInsight('AI rewrite applied to your selection.');
      closeSelectionAssistant();
    });
  }, [activeSelectionAssist.label, closeSelectionAssistant, currentDocument, pushTrackedChange, selectionTargetBlockId, syncActiveBlockFromDom]);

  useEffect(() => {
    document.execCommand('styleWithCSS', false, 'true');
  }, []);

  useEffect(() => {
    const updateFloatingToolbar = () => {
      const selection = window.getSelection();
      if (previewMode) {
        closeSelectionAssistant();
        return;
      }
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !selection.toString().trim()) {
        if (selectionAssistantOpen && selectionText.trim()) return;
        closeSelectionAssistant();
        return;
      }

      const range = selection.getRangeAt(0);
      const selectionContainer =
        range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
          ? (range.commonAncestorContainer as Element)
          : range.commonAncestorContainer.parentElement;
      const blockElement = selectionContainer?.closest('[data-docword-block-id]') as HTMLElement | null;
      if (!blockElement) {
        if (selectionAssistantOpen && selectionText.trim()) return;
        closeSelectionAssistant();
        return;
      }

      const rect = range.getBoundingClientRect();
      if (!rect.width && !rect.height) {
        if (selectionAssistantOpen && selectionText.trim()) return;
        closeSelectionAssistant();
        return;
      }

      selectionRangeRef.current = range.cloneRange();
      setSelectionText(selection.toString().trim());
      setSelectionAssistantOpen(true);
      if (blockElement.dataset.docwordBlockId) {
        setActiveBlockId(blockElement.dataset.docwordBlockId);
        setSelectionTargetBlockId(blockElement.dataset.docwordBlockId);
      }
      syncSelectionFormattingState(selectionContainer instanceof HTMLElement ? selectionContainer : blockElement);
      const panelWidth = Math.min(window.innerWidth - 32, 720);
      const viewportPadding = 20;
      const preferredCenter = rect.left + rect.width / 2;
      const clampedX = Math.min(
        Math.max(preferredCenter, viewportPadding + panelWidth / 2),
        window.innerWidth - viewportPadding - panelWidth / 2,
      );
      const openAbove = rect.top > 420;

      setFloatingToolbar({
        visible: true,
        x: clampedX,
        y: openAbove ? rect.top - 18 : rect.bottom + 14,
        placement: openAbove ? 'top' : 'bottom',
      });
    };

    document.addEventListener('selectionchange', updateFloatingToolbar);
    window.addEventListener('scroll', updateFloatingToolbar, { passive: true });
    window.addEventListener('resize', updateFloatingToolbar);
    return () => {
      document.removeEventListener('selectionchange', updateFloatingToolbar);
      window.removeEventListener('scroll', updateFloatingToolbar);
      window.removeEventListener('resize', updateFloatingToolbar);
    };
  }, [closeSelectionAssistant, previewMode, selectionAssistantOpen, selectionText, syncSelectionFormattingState]);

  const activeDocumentTheme = currentDocument?.documentTheme || 'classic';
  const documentThemeConfig = documentThemes.find((item) => item.id === activeDocumentTheme) || documentThemes[0];
  const toggleSidebarSection = (section: keyof typeof sidebarSections) => {
    setSidebarSections((current) => ({ ...current, [section]: !current[section] }));
  };
  const desktopMenuTriggerClass = cn(
    'hidden h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium tracking-[-0.01em] md:inline-flex transition-all',
    darkMode
      ? 'border-white/[0.07] bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white'
      : 'border-slate-200/80 bg-white/80 text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:border-slate-300/80 hover:bg-white hover:text-slate-800 hover:shadow-[0_2px_6px_rgba(15,23,42,0.08)]',
  );
  const desktopMenuContentClass = cn(
    'z-[95] w-[17rem] max-w-[calc(100vw-1rem)] overflow-hidden rounded-[1.4rem] border p-1.5 shadow-[0_4px_6px_rgba(15,23,42,0.04),0_12px_32px_rgba(15,23,42,0.10),0_32px_64px_rgba(15,23,42,0.07)] backdrop-blur-2xl',
    darkMode
      ? 'border-white/[0.07] bg-[#08080c]/96 text-white'
      : 'border-slate-200/70 bg-white/98 text-slate-900 shadow-[0_4px_6px_rgba(15,23,42,0.04),0_12px_32px_rgba(15,23,42,0.10),0_32px_64px_rgba(15,23,42,0.07)]',
  );
  const desktopMenuItemClass = cn(
    'flex w-full items-center justify-between gap-3 rounded-[0.8rem] px-3 py-2 text-left text-[13px] outline-none transition-all',
    darkMode
      ? 'text-slate-300 hover:bg-white/[0.06] hover:text-white focus:bg-white/[0.06]'
      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 focus:bg-slate-50',
  );
  const shareRoleOptions: Array<{ value: 'private' | 'read' | 'write'; label: string; description: string }> = [
    { value: 'private', label: 'Private', description: 'Only visible inside your workspace until you publish a link.' },
    { value: 'read', label: 'Read only', description: 'People with the link can open and read the document.' },
    { value: 'write', label: 'Can edit', description: 'People with the link can open and edit the live document.' },
  ];
  const docwordProgressActive =
    loading
    || creating
    || saveState === 'saving'
    || aiLoading
    || shareLoading
    || sharePresetLoading
    || directoryPublishLoading
    || sendToSignLoading
    || guidedLoading;
  const docwordProgressProfile =
    directoryPublishLoading ? 'publish'
      : sendToSignLoading ? 'publish'
        : aiLoading || guidedLoading ? 'generate'
          : shareLoading || sharePresetLoading ? 'sync'
            : saveState === 'saving' ? 'save'
              : 'sync';
  const docwordProgressTitle =
    directoryPublishLoading ? 'Publishing DocWord file to File Directory'
      : sendToSignLoading ? 'Preparing signable document packet'
        : aiLoading ? 'Running DocWord AI'
          : guidedLoading ? 'Creating guided draft'
            : shareLoading || sharePresetLoading ? 'Updating share settings'
              : saveState === 'saving' ? 'Saving DocWord changes'
                : creating ? 'Creating a fresh document'
                  : 'Syncing DocWord workspace';

  return (
    <div data-ui-mode={darkMode ? 'dark' : undefined} className={cn('premium-shell min-h-screen w-full overflow-x-hidden transition-colors', darkMode ? 'text-slate-100' : 'text-slate-950')}>
      {/* ── Primary Navbar ── */}
      <div className={cn(
        'sticky top-0 z-40 border-b',
        darkMode
          ? 'border-white/[0.05] bg-[#060608]/90 backdrop-blur-2xl'
          : 'border-slate-200/60 bg-white/95 shadow-[0_1px_0_rgba(15,23,42,0.03),0_4px_16px_rgba(15,23,42,0.04)] backdrop-blur-2xl',
      )}>
        <div className="mx-auto max-w-[1680px] px-3 sm:px-5 lg:px-6">

          {/* Row 1: Title + actions */}
          <div className="flex min-h-[3.5rem] items-center gap-3 sm:gap-4 py-2">
            {/* Sidebar toggle */}
            <button
              type="button"
              onClick={() => { setSidebarOpen((c) => !c); setMobileSidebarOpen((c) => !c); }}
              className={cn(
                'hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-all lg:inline-flex',
                darkMode
                  ? 'border-white/[0.07] bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] hover:text-white'
                  : 'border-slate-200/80 bg-white/80 text-slate-500 shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:bg-white hover:text-slate-700 hover:shadow-[0_2px_6px_rgba(15,23,42,0.08)]',
              )}
            >
              <PanelLeft className="h-3.5 w-3.5" />
            </button>

            {/* Document title (inline edit) */}
            <div className="min-w-0 flex-1">
              <Input
                value={currentDocument?.title || ''}
                onChange={(e) => currentDocument && updateCurrentDocument({ title: e.target.value })}
                className={cn(
                  'h-auto min-w-0 max-w-[36rem] border-0 bg-transparent px-0 text-[1.1rem] font-semibold tracking-[-0.03em] shadow-none focus-visible:ring-0 sm:text-[1.2rem]',
                  darkMode ? 'text-white placeholder:text-slate-500' : 'text-slate-900 placeholder:text-slate-400',
                )}
                placeholder="Untitled document"
              />
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {focusMode ? (
                  <span className="inline-flex h-5 items-center gap-1 rounded-full bg-violet-100 px-2 text-[10px] font-semibold text-violet-700">
                    <Maximize2 className="h-2.5 w-2.5" />
                    Focus
                  </span>
                ) : null}
                <span className={cn('hidden h-5 items-center rounded-full px-2 text-[10px] font-medium sm:inline-flex', darkMode ? 'bg-white/[0.05] text-slate-400' : 'text-slate-400')}>
                  {currentDocument ? `${currentDocument.wordCount} words` : 'Ready'}
                </span>
                <span className={cn('hidden h-5 items-center rounded-full px-2 text-[10px] font-medium sm:inline-flex', darkMode ? 'bg-white/[0.05] text-slate-400' : 'text-slate-400')}>
                  {currentDocumentFolderLabel}
                </span>
                <span className={cn('hidden h-5 items-center gap-1 rounded-full px-2 text-[10px] font-semibold sm:inline-flex', darkMode ? 'bg-emerald-400/10 text-emerald-300' : 'text-emerald-600')}>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Score {documentScore.score}
                </span>
                {/* Save state */}
                <span className={cn('inline-flex h-5 items-center gap-1 rounded-full px-2 text-[10px] font-medium', darkMode ? 'text-slate-400' : 'text-slate-400')}>
                  {saveState === 'saving' ? (
                    <><Loader2 className="h-2.5 w-2.5 animate-spin" />Saving</>
                  ) : saveState === 'saved' ? (
                    <><span className="h-1.5 w-1.5 rounded-full bg-sky-400" />Saved</>
                  ) : saveState === 'error' ? (
                    <span className="text-rose-500">Save error</span>
                  ) : autosaveCountdown !== null ? (
                    `Autosave in ${autosaveCountdown}s`
                  ) : 'Editing'}
                </span>
              </div>
            </div>

            {/* Right actions */}
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              {/* Favourite */}
              <button
                type="button"
                onClick={() => void toggleFavoriteDocument(currentDocument)}
                className={cn(
                  'hidden h-8 w-8 items-center justify-center rounded-lg border transition-all sm:inline-flex',
                  currentDocument?.isFavorite
                    ? 'border-amber-200 bg-amber-50 text-amber-500'
                    : darkMode
                      ? 'border-white/[0.07] bg-white/[0.04] text-slate-500 hover:bg-white/[0.08] hover:text-amber-300'
                      : 'border-slate-200/80 bg-white/80 text-slate-400 shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:bg-white hover:text-amber-500',
                )}
                aria-label={currentDocument?.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                <Star className={cn('h-3.5 w-3.5', currentDocument?.isFavorite ? 'fill-current' : '')} />
              </button>

              {/* Live collaboration button */}
              {collabToken ? (
                <button
                  type="button"
                  onClick={() => setCollabOpen((c) => !c)}
                  className={cn(
                    'h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium transition-all inline-flex',
                    collabOpen
                      ? 'border-violet-400/60 bg-violet-500/20 text-violet-300 shadow-[0_0_0_1px_rgba(139,92,246,0.3)]'
                      : darkMode
                        ? 'border-white/[0.07] bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-violet-300'
                        : 'border-slate-200/80 bg-white/80 text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:bg-violet-50 hover:text-violet-600 hover:border-violet-200',
                  )}
                  aria-label="Live collaboration"
                  title="Real-time collaboration"
                >
                  <Users className="h-3.5 w-3.5" />
                  <span className="hidden xl:inline">Live</span>
                  {collabEngine.users.length > 1 && (
                    <span className={cn(
                      'flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold',
                      collabOpen ? 'bg-violet-400/30 text-violet-200' : 'bg-violet-100 text-violet-700',
                    )}>
                      {collabEngine.users.length}
                    </span>
                  )}
                </button>
              ) : null}

              {/* Dark / light toggle */}
              <button
                type="button"
                onClick={() => setDarkMode((c) => !c)}
                className={cn(
                  'h-8 w-8 items-center justify-center rounded-lg border transition-all hidden sm:inline-flex',
                  darkMode
                    ? 'border-white/[0.07] bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] hover:text-white'
                    : 'border-slate-200/80 bg-white/80 text-slate-400 shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:bg-white hover:text-slate-700',
                )}
                aria-label={darkMode ? 'Light mode' : 'Dark mode'}
              >
                {darkMode ? <SunMedium className="h-3.5 w-3.5" /> : <MoonStar className="h-3.5 w-3.5" />}
              </button>

              {/* Home link */}
              <Link
                href="/"
                className={cn(
                  'hidden h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium transition-all xl:inline-flex',
                  darkMode
                    ? 'border-white/[0.07] bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white'
                    : 'border-slate-200/80 bg-white/80 text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:bg-white hover:text-slate-800',
                )}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Home
              </Link>
              <DropdownMenu.Root open={folderLauncherOpen} onOpenChange={setFolderLauncherOpen}>
                <DropdownMenu.Trigger asChild>
                  <button type="button" className={cn('hidden h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium tracking-[-0.01em] transition-all lg:inline-flex', darkMode ? 'border-white/[0.07] bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white' : 'border-slate-200/80 bg-white/80 text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:bg-white hover:text-slate-800 hover:shadow-[0_2px_6px_rgba(15,23,42,0.08)]')}>
                    <FolderOpen className="h-3.5 w-3.5" />
                    Workspace
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content sideOffset={8} collisionPadding={16} align="end" className={cn(desktopMenuContentClass, 'w-[24rem] max-h-[28rem] overflow-y-auto')}>
                    <div className="px-2 pb-1.5 pt-2">
                      <p className={cn('text-[10px] font-semibold uppercase tracking-[0.24em]', darkMode ? 'text-slate-500' : 'text-slate-400')}>Workspace</p>
                    </div>
                    <div className="space-y-3">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <button type="button" className={desktopMenuItemClass} onClick={() => setShowTemplates(true)}>
                          <span className="flex items-center gap-2.5"><LayoutTemplate className="h-3.5 w-3.5" />Templates</span>
                        </button>
                        <button type="button" className={desktopMenuItemClass} onClick={() => setShowGuidedCreator(true)}>
                          <span className="flex items-center gap-2.5"><FileText className="h-3.5 w-3.5" />Guided</span>
                        </button>
                        <button type="button" className={desktopMenuItemClass} onClick={() => setDarkMode((current) => !current)}>
                          <span className="flex items-center gap-2.5">{darkMode ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}{darkMode ? 'Light mode' : 'Dark mode'}</span>
                        </button>
                        <button type="button" className={desktopMenuItemClass} onClick={() => { setShareTab('link'); setShareDialogOpen(true); }}>
                          <span className="flex items-center gap-2.5"><Share2 className="h-3.5 w-3.5" />Sharing hub</span>
                        </button>
                      </div>
                      {documentsByFolder.map((entry) => (
                        <div key={entry.folder} className={cn('rounded-[1rem] border p-2.5', darkMode ? 'border-white/[0.08] bg-white/[0.03]' : 'border-slate-100 bg-slate-50/80')}>
                          <div className="flex items-center gap-2.5 px-1 pb-1">
                            <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg', darkMode ? 'bg-white/[0.08] text-slate-300' : 'bg-sky-50 text-sky-600')}>
                              <FolderOpen className="h-3.5 w-3.5" />
                            </div>
                            <div>
                              <p className={cn('text-[13px] font-semibold', darkMode ? 'text-white' : 'text-slate-800')}>{entry.folder}</p>
                              <p className={cn('text-[11px]', darkMode ? 'text-slate-500' : 'text-slate-400')}>{entry.items.length} doc{entry.items.length === 1 ? '' : 's'}</p>
                            </div>
                          </div>
                          <div className="mt-1 space-y-0.5">
                            {entry.items.slice(0, 4).map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => { setCurrentDocumentId(item.id); setActiveFolderFilter(entry.folder); setFolderLauncherOpen(false); }}
                                className={cn(
                                  'flex w-full items-center gap-2.5 rounded-[0.7rem] px-2.5 py-1.5 text-left transition',
                                  item.id === currentDocumentId
                                    ? darkMode ? 'bg-white/[0.09] text-white' : 'bg-white text-slate-900 shadow-[0_1px_3px_rgba(15,23,42,0.06)]'
                                    : darkMode ? 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200' : 'text-slate-600 hover:bg-white hover:text-slate-800',
                                )}
                              >
                                <span className="text-sm">{item.emoji || '📄'}</span>
                                <span className="truncate text-[13px] font-medium">{item.title || 'Untitled'}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>

              {/* Send to sign */}
              <button
                type="button"
                disabled={sendToSignLoading || !currentDocument}
                onClick={openSignPrepDialog}
                className={cn(
                  'hidden h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium transition-all lg:inline-flex disabled:cursor-not-allowed disabled:opacity-50',
                  darkMode
                    ? 'border-white/[0.07] bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white'
                    : 'border-slate-200/80 bg-white/80 text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:bg-white hover:text-slate-800',
                )}
              >
                {sendToSignLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Sign
              </button>

              {/* Share CTA */}
              <button
                type="button"
                onClick={() => { setShareTab('link'); setShareDialogOpen(true); }}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-sky-500 px-3 text-[13px] font-semibold text-white shadow-[0_2px_8px_rgba(14,165,233,0.30)] transition-all hover:bg-sky-600 hover:shadow-[0_4px_12px_rgba(14,165,233,0.36)]"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Share</span>
              </button>
            </div>
          </div>

          {/* ── Toolbar strip ── */}
          <div className={cn('mb-2 rounded-xl border px-2 py-1', darkMode ? 'border-white/[0.05] bg-white/[0.025]' : 'border-slate-200/70 bg-white/80 shadow-[0_1px_3px_rgba(15,23,42,0.04)]')}>
            <div className="flex flex-nowrap items-center justify-between gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex flex-nowrap items-center gap-1">
              <Button type="button" variant="outline" className={cn(mobileTopPillButtonClass, 'md:hidden')} onClick={() => setShowFindReplace((current) => !current)}>
                <Search />
                Find
              </Button>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button type="button" className={desktopMenuTriggerClass}>
                    <Search className="h-4 w-4" />
                    Edit
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content sideOffset={8} collisionPadding={16} align="start" className={desktopMenuContentClass}>
                    <div className="px-2 pb-1.5 pt-2">
                      <p className={cn('text-[10px] font-semibold uppercase tracking-[0.24em]', darkMode ? 'text-slate-500' : 'text-slate-400')}>Edit</p>
                    </div>
                    <div className="space-y-0.5">
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => setShowFindReplace((current) => !current)}>
                          <span className="flex items-center gap-2.5"><Search className="h-3.5 w-3.5" />Find & replace</span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => runEditorCommandAndSync('undo')}>
                          <span className="flex items-center gap-2.5"><Undo2 className="h-3.5 w-3.5" />Undo</span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => runEditorCommandAndSync('redo')}>
                          <span className="flex items-center gap-2.5"><Redo2 className="h-3.5 w-3.5" />Redo</span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => currentDocument && updateCurrentDocument({ trackChangesEnabled: !currentDocument.trackChangesEnabled })}>
                          <span className="flex items-center gap-2.5"><Sparkles className="h-3.5 w-3.5" />Track changes</span>
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]', currentDocument?.trackChangesEnabled ? 'bg-slate-950 text-white' : darkMode ? 'bg-white/8 text-slate-300' : 'bg-slate-100 text-slate-500')}>
                            {currentDocument?.trackChangesEnabled ? 'On' : 'Off'}
                          </span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => setShowCommandPalette(true)}>
                          <span className="flex items-center gap-2.5"><Search className="h-3.5 w-3.5" />Command palette</span>
                        </button>
                      </DropdownMenu.Item>
                    </div>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              <Button type="button" variant="outline" className={cn(mobileTopPillButtonClass, 'md:hidden')} onClick={() => setShowTemplates(true)}>
                <LayoutTemplate />
                Templates
              </Button>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button type="button" className={desktopMenuTriggerClass}>
                    <LayoutTemplate className="h-4 w-4" />
                    Create
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content sideOffset={8} collisionPadding={16} align="start" className={desktopMenuContentClass}>
                    <div className="px-2 pb-1.5 pt-2">
                      <p className={cn('text-[10px] font-semibold uppercase tracking-[0.24em]', darkMode ? 'text-slate-500' : 'text-slate-400')}>Create</p>
                    </div>
                    <div className="space-y-0.5">
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => setShowTemplates(true)}>
                          <span className="flex items-center gap-2.5"><LayoutTemplate className="h-3.5 w-3.5" />Templates</span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => setShowGuidedCreator(true)}>
                          <span className="flex items-center gap-2.5"><FileText className="h-3.5 w-3.5" />Guided document</span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <label className={cn(desktopMenuItemClass, 'cursor-pointer')}>
                          <span className="flex items-center gap-2.5"><FilePlus2 className="h-3.5 w-3.5" />Import document</span>
                          <input
                            type="file"
                            accept=".docx,.txt,.md,.html,.htm"
                            className="hidden"
                            onChange={(event) => void importExistingDocument(event.target.files?.[0] || null)}
                          />
                        </label>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => insertRichBlock('quote')}>
                          <span className="flex items-center gap-2.5"><Quote className="h-3.5 w-3.5" />Quote block</span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => insertRichBlock('callout')}>
                          <span className="flex items-center gap-2.5"><LayoutTemplate className="h-3.5 w-3.5" />Callout block</span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => insertRichBlock('table')}>
                          <span className="flex items-center gap-2.5"><Table2 className="h-3.5 w-3.5" />Table block</span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => insertRichBlock('image')}>
                          <span className="flex items-center gap-2.5"><ImageIcon className="h-3.5 w-3.5" />Image block</span>
                        </button>
                      </DropdownMenu.Item>
                    </div>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              <Button type="button" variant="outline" className={cn(mobileTopPillButtonClass, 'md:hidden')} onClick={() => void runProofreader(activeProofreader)}>
                <Bot />
                Review
              </Button>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button type="button" className={desktopMenuTriggerClass}>
                    <Bot className="h-4 w-4" />
                    AI
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content sideOffset={8} collisionPadding={16} align="start" className={desktopMenuContentClass}>
                    <div className="px-2 pb-1.5 pt-2">
                      <p className={cn('text-[10px] font-semibold uppercase tracking-[0.24em]', darkMode ? 'text-slate-500' : 'text-slate-400')}>AI</p>
                    </div>
                    <div className="space-y-0.5">
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => void runProofreader(activeProofreader)}>
                          <span className="flex items-center gap-2.5"><Bot className="h-3.5 w-3.5" />Run reviewers</span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => setSuggestionMode((current) => !current)}>
                          <span className="flex items-center gap-2.5"><Wand2 className="h-3.5 w-3.5" />Inline suggestions</span>
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]', suggestionMode ? 'bg-slate-950 text-white' : darkMode ? 'bg-white/8 text-slate-300' : 'bg-slate-100 text-slate-500')}>
                            {suggestionMode ? 'On' : 'Off'}
                          </span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => startVoiceCapture('guided-prompt')}>
                          <span className="flex items-center gap-2.5"><Mic className="h-3.5 w-3.5" />Voice brief</span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => setShowGuidedCreator(true)}>
                          <span className="flex items-center gap-2.5"><LayoutTemplate className="h-3.5 w-3.5" />Open guided creator</span>
                        </button>
                      </DropdownMenu.Item>
                    </div>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button type="button" className={desktopMenuTriggerClass}>
                    <Sparkles className="h-4 w-4" />
                    Review
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content sideOffset={8} collisionPadding={16} align="start" className={cn(desktopMenuContentClass, 'w-[21rem]')}>
                    <div className="p-2 space-y-2">
                      {/* Score card */}
                      <div className={cn('flex items-center justify-between gap-3 rounded-[0.9rem] border px-3.5 py-3', darkMode ? 'border-white/[0.07] bg-white/[0.03]' : 'border-slate-100 bg-slate-50/80')}>
                        <div>
                          <p className={cn('text-[10px] font-semibold uppercase tracking-[0.22em]', darkMode ? 'text-slate-500' : 'text-slate-400')}>Document score</p>
                          <p className={cn('mt-0.5 text-[1.6rem] font-semibold tracking-[-0.05em]', darkMode ? 'text-white' : 'text-slate-900')}>{documentScore.score}</p>
                        </div>
                        <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', darkMode ? 'bg-white/[0.07] text-slate-300' : 'bg-white text-slate-600 shadow-[0_1px_3px_rgba(15,23,42,0.08)]')}>
                          {documentScore.label}
                        </span>
                      </div>
                      {documentScore.notes.slice(0, 2).map((note) => (
                        <p key={note} className={cn('px-1 text-[12px] leading-5', darkMode ? 'text-slate-400' : 'text-slate-500')}>{note}</p>
                      ))}
                      {/* Actions */}
                      <div className="grid grid-cols-2 gap-1.5 pt-1">
                        <button type="button" onClick={() => void runProofreader(activeProofreader)}
                          className={cn('h-9 rounded-[0.7rem] border text-[13px] font-medium transition', darkMode ? 'border-white/[0.07] bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]' : 'border-slate-200 bg-white text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:bg-slate-50')}>
                          Run reviewers
                        </button>
                        <button type="button" onClick={() => setSuggestionMode((c) => !c)}
                          className={cn('h-9 rounded-[0.7rem] border text-[13px] font-medium transition', suggestionMode ? 'border-sky-500 bg-sky-500 text-white hover:bg-sky-600' : darkMode ? 'border-white/[0.07] bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]' : 'border-slate-200 bg-white text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:bg-slate-50')}>
                          {suggestionMode ? 'Suggestions on' : 'Suggestions'}
                        </button>
                      </div>
                      {/* Stats */}
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className={cn('rounded-[0.7rem] border px-3 py-2 text-[12px]', darkMode ? 'border-white/[0.06] bg-white/[0.02] text-slate-400' : 'border-slate-100 bg-white text-slate-500')}>
                          <span className={cn('block text-[1.1rem] font-semibold tracking-[-0.03em]', darkMode ? 'text-white' : 'text-slate-800')}>{currentDocument?.trackedChanges?.filter((c) => c.status === 'pending').length || 0}</span>
                          pending changes
                        </div>
                        <div className={cn('rounded-[0.7rem] border px-3 py-2 text-[12px]', darkMode ? 'border-white/[0.06] bg-white/[0.02] text-slate-400' : 'border-slate-100 bg-white text-slate-500')}>
                          <span className={cn('block text-[1.1rem] font-semibold tracking-[-0.03em]', darkMode ? 'text-white' : 'text-slate-800')}>{currentDocument?.selectionComments?.length || 0}</span>
                          selection notes
                        </div>
                      </div>
                    </div>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button type="button" className={desktopMenuTriggerClass}>
                    <Lock className="h-4 w-4" />
                    Secure
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content sideOffset={8} collisionPadding={16} align="start" className={cn(desktopMenuContentClass, 'w-[21rem]')}>
                    <div className="space-y-1.5 p-2">
                      <p className={cn('px-1 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.24em]', darkMode ? 'text-slate-500' : 'text-slate-400')}>Document security</p>
                      <Input
                        value={currentDocument?.documentLockCode || ''}
                        onChange={(e) => currentDocument && updateCurrentDocument({ documentLockCode: e.target.value })}
                        placeholder="Document lock code"
                        className={cn('h-9 rounded-[0.7rem] border text-sm', darkMode ? 'border-white/[0.08] bg-white/[0.04] text-white placeholder:text-slate-500' : 'border-slate-200 bg-white text-slate-800 placeholder:text-slate-400')}
                      />
                      <Input
                        value={currentDocument?.folderLockCode || ''}
                        onChange={(e) => currentDocument && updateCurrentDocument({ folderLockCode: e.target.value })}
                        placeholder="Folder lock code"
                        className={cn('h-9 rounded-[0.7rem] border text-sm', darkMode ? 'border-white/[0.08] bg-white/[0.04] text-white placeholder:text-slate-500' : 'border-slate-200 bg-white text-slate-800 placeholder:text-slate-400')}
                      />
                      <Input
                        value={currentDocument?.watermarkText || ''}
                        onChange={(e) => currentDocument && updateCurrentDocument({ watermarkText: e.target.value })}
                        placeholder="Watermark text"
                        className={cn('h-9 rounded-[0.7rem] border text-sm', darkMode ? 'border-white/[0.08] bg-white/[0.04] text-white placeholder:text-slate-500' : 'border-slate-200 bg-white text-slate-800 placeholder:text-slate-400')}
                      />
                      <button
                        type="button"
                        onClick={() => currentDocument && updateCurrentDocument({ requireSignature: !currentDocument.requireSignature })}
                        className={cn(
                          'mt-1 w-full rounded-[0.8rem] border px-3 py-2.5 text-left transition',
                          currentDocument?.requireSignature
                            ? 'border-sky-500 bg-sky-500 text-white'
                            : darkMode
                              ? 'border-white/[0.07] bg-white/[0.03] text-slate-200 hover:bg-white/[0.06]'
                              : 'border-slate-200 bg-white text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-slate-50',
                        )}
                      >
                        <p className="text-[13px] font-semibold">Signature required</p>
                        <p className={cn('mt-0.5 text-[11px] leading-4', currentDocument?.requireSignature ? 'text-white/75' : darkMode ? 'text-slate-400' : 'text-slate-500')}>
                          {currentDocument?.requireSignature ? 'On — recipients must sign.' : 'Enable before sending to signing workspace.'}
                        </p>
                      </button>
                      <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                        <button type="button" onClick={() => { setShareTab('groups'); setShareDialogOpen(true); }}
                          className={cn('h-9 rounded-[0.7rem] border text-[13px] font-medium transition', darkMode ? 'border-white/[0.07] bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')}>
                          Access groups
                        </button>
                        <button type="button" disabled={sendToSignLoading || !currentDocument} onClick={openSignPrepDialog}
                          className="h-9 rounded-[0.7rem] bg-slate-900 text-[13px] font-medium text-white transition hover:bg-slate-800 disabled:opacity-50">
                          {sendToSignLoading ? <Loader2 className="inline mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                          Send to sign
                        </button>
                      </div>
                    </div>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button type="button" className={desktopMenuTriggerClass}>
                    <FolderOpen className="h-4 w-4" />
                    Setup
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content sideOffset={8} collisionPadding={16} align="start" className={cn(desktopMenuContentClass, 'w-[22rem]')}>
                    <div className="space-y-1.5 p-2">
                      <p className={cn('px-1 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.24em]', darkMode ? 'text-slate-500' : 'text-slate-400')}>Document setup</p>
                      <Input
                        value={currentDocument?.folderName || ''}
                        onChange={(e) => currentDocument && updateCurrentDocument({ folderName: e.target.value })}
                        placeholder="Folder name"
                        className={cn('h-9 rounded-[0.7rem] border text-sm', darkMode ? 'border-white/[0.08] bg-white/[0.04] text-white placeholder:text-slate-500' : 'border-slate-200 bg-white text-slate-800 placeholder:text-slate-400')}
                      />
                      <Textarea
                        value={currentDocument?.summary || ''}
                        onChange={(e) => currentDocument && updateCurrentDocument({ summary: e.target.value })}
                        placeholder="Short document summary"
                        className={cn('min-h-[80px] resize-none rounded-[0.7rem] border text-sm', darkMode ? 'border-white/[0.08] bg-white/[0.04] text-white placeholder:text-slate-500' : 'border-slate-200 bg-white text-slate-800 placeholder:text-slate-400')}
                      />
                      <p className={cn('rounded-[0.7rem] border px-3 py-2.5 text-[12px] leading-5', darkMode ? 'border-white/[0.06] bg-white/[0.02] text-slate-500' : 'border-slate-100 bg-slate-50/80 text-slate-400')}>
                        Edit header and footer directly on the canvas for Word-style page layout.
                      </p>
                    </div>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              <label className={cn(mobileTopPillButtonClass, 'inline-flex cursor-pointer md:hidden')}>
                <FilePlus2 />
                Import
                <input
                  type="file"
                  accept=".docx,.txt,.md,.html,.htm"
                  className="hidden"
                  onChange={(event) => void importExistingDocument(event.target.files?.[0] || null)}
                />
              </label>
              <Button type="button" variant="outline" className={cn(mobileTopPillButtonClass, 'md:hidden')} onClick={() => setShowGuidedCreator(true)}>
                <LayoutTemplate />
                Guided
              </Button>
              <Button type="button" variant="outline" className={cn(mobileTopPillButtonClass, voiceListening ? mobileDockActiveButtonClass : '', 'md:hidden')} onClick={() => startVoiceCapture('guided-prompt')}>
                <Mic />
                Speak
              </Button>
              <Button type="button" variant="outline" className={cn(mobileTopPillButtonClass, 'md:hidden')} onClick={() => runEditorCommandAndSync('undo')}>
                <Undo2 />
                Undo
              </Button>
              <Button type="button" variant="outline" className={cn(mobileTopPillButtonClass, 'md:hidden')} onClick={() => runEditorCommandAndSync('redo')}>
                <Redo2 />
                Redo
              </Button>
              <Button type="button" variant="outline" className={cn(mobileTopPillButtonClass, suggestionMode ? mobileDockActiveButtonClass : '', 'md:hidden')} onClick={() => setMobileToolsOpen(true)}>
                <Wand2 />
                Tools
              </Button>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button type="button" className={desktopMenuTriggerClass}>
                    <Palette className="h-4 w-4" />
                    Style
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content sideOffset={8} collisionPadding={16} align="center" className={cn(desktopMenuContentClass, 'max-h-[min(34rem,calc(100vh-1rem))] overflow-y-auto overscroll-contain')}>
                    <div className="px-2 pb-1.5 pt-2">
                      <p className={cn('text-[10px] font-semibold uppercase tracking-[0.24em]', darkMode ? 'text-slate-500' : 'text-slate-400')}>Style</p>
                    </div>
                    <div className="space-y-0.5">
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => activeBlock && applySlashOption(activeBlock.id, 'paragraph')}>
                          <span className="flex items-center gap-2.5"><Type className="h-3.5 w-3.5" />Normal text</span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => activeBlock && applySlashOption(activeBlock.id, 'heading-1')}>
                          <span className="flex items-center gap-2.5"><Heading1 className="h-3.5 w-3.5" />Heading 1</span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => activeBlock && applySlashOption(activeBlock.id, 'heading-2')}>
                          <span className="flex items-center gap-2.5"><Heading2 className="h-3.5 w-3.5" />Heading 2</span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Separator className={cn('my-1 h-px', darkMode ? 'bg-white/10' : 'bg-slate-200')} />
                      {fontFamilies.map((item) => (
                        <DropdownMenu.Item key={item} asChild>
                          <button
                            type="button"
                            className={desktopMenuItemClass}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              applySelectionFontFamily(item);
                            }}
                          >
                            <span className="flex items-center gap-2.5"><Type className="h-3.5 w-3.5" />{item}</span>
                          </button>
                        </DropdownMenu.Item>
                      ))}
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onMouseDown={(event) => event.preventDefault()} onClick={() => adjustFontSize(-1)}>
                          <span className="flex items-center gap-2.5"><Minus className="h-3.5 w-3.5" />Smaller text</span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onMouseDown={(event) => event.preventDefault()} onClick={() => adjustFontSize(1)}>
                          <span className="flex items-center gap-2.5"><Plus className="h-3.5 w-3.5" />Larger text</span>
                        </button>
                      </DropdownMenu.Item>
                      {lineSpacingLevels.map((item) => (
                        <DropdownMenu.Item key={item.value} asChild>
                          <button type="button" className={desktopMenuItemClass} onMouseDown={(event) => event.preventDefault()} onClick={() => applyLineSpacing(item.value)}>
                            <span className="flex items-center gap-2.5"><AlignLeft className="h-3.5 w-3.5" />{item.label}</span>
                          </button>
                        </DropdownMenu.Item>
                      ))}
                      <DropdownMenu.Separator className={cn('my-1 h-px', darkMode ? 'bg-white/10' : 'bg-slate-200')} />
                      {documentThemes.map((item) => (
                        <DropdownMenu.Item key={item.id} asChild>
                          <button type="button" className={desktopMenuItemClass} onClick={() => currentDocument && updateCurrentDocument({ documentTheme: item.id as DocWordDocument['documentTheme'] })}>
                            <span className="flex items-center gap-2.5"><Palette className="h-3.5 w-3.5" />{item.label}</span>
                          </button>
                        </DropdownMenu.Item>
                      ))}
                    </div>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button type="button" className={desktopMenuTriggerClass}>
                    <Type className="h-4 w-4" />
                    Format
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content sideOffset={8} collisionPadding={16} align="center" className={desktopMenuContentClass}>
                    <div className="px-2 pb-1.5 pt-2">
                      <p className={cn('text-[10px] font-semibold uppercase tracking-[0.24em]', darkMode ? 'text-slate-500' : 'text-slate-400')}>Format</p>
                    </div>
                    <div className="space-y-0.5">
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => runEditorCommandAndSync('bold')}>
                          <span className="flex items-center gap-2.5"><Bold className="h-3.5 w-3.5" />Bold</span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => runEditorCommandAndSync('italic')}>
                          <span className="flex items-center gap-2.5"><Italic className="h-4 w-4" />Italic</span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => runEditorCommandAndSync('underline')}>
                          <span className="flex items-center gap-2.5"><Underline className="h-4 w-4" />Underline</span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={insertLink}>
                          <span className="flex items-center gap-2.5"><Link2 className="h-4 w-4" />Insert link</span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => runEditorCommandAndSync('insertUnorderedList')}>
                          <span className="flex items-center gap-2.5"><List className="h-4 w-4" />Bulleted list</span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => runEditorCommandAndSync('insertOrderedList')}>
                          <span className="flex items-center gap-2.5"><ListOrdered className="h-4 w-4" />Numbered list</span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => runEditorCommandAndSync('justifyLeft')}>
                          <span className="flex items-center gap-2.5"><AlignLeft className="h-3.5 w-3.5" />Align left</span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => runEditorCommandAndSync('justifyCenter')}>
                          <span className="flex items-center gap-2.5"><AlignCenter className="h-4 w-4" />Align center</span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => runEditorCommandAndSync('justifyRight')}>
                          <span className="flex items-center gap-2.5"><AlignRight className="h-4 w-4" />Align right</span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => runEditorCommandAndSync('strikeThrough')}>
                          <span className="flex items-center gap-2.5"><Type className="h-3.5 w-3.5" />Strikethrough</span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => runEditorCommandAndSync('removeFormat')}>
                          <span className="flex items-center gap-2.5"><X className="h-4 w-4" />Clear formatting</span>
                        </button>
                      </DropdownMenu.Item>
                    </div>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              <Button type="button" variant="outline" className={cn(mobileTopPillButtonClass, mobilePreviewOpen ? mobileDockActiveButtonClass : '', 'md:hidden')} onClick={() => openPreviewForDocument()}>
                <Eye />
                Preview
              </Button>
              <Button type="button" variant="outline" className={cn(mobileTopPillButtonClass, 'md:hidden')} onClick={() => void exportDocument('pdf')}>
                <Printer />
                Export
              </Button>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button type="button" className={desktopMenuTriggerClass}>
                    <Eye className="h-4 w-4" />
                    View
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content sideOffset={8} collisionPadding={16} align="end" className={desktopMenuContentClass}>
                    <div className="px-2 pb-1.5 pt-2">
                      <p className={cn('text-[10px] font-semibold uppercase tracking-[0.24em]', darkMode ? 'text-slate-500' : 'text-slate-400')}>View</p>
                    </div>
                    <div className="space-y-0.5">
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => openPreviewForDocument()}>
                          <span className="flex items-center gap-2.5">{previewMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{previewMode ? 'Exit preview' : 'Preview document'}</span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => { setFocusMode((c) => !c); if (!focusMode) setSidebarOpen(false); else setSidebarOpen(true); }}>
                          <span className="flex items-center gap-2.5">{focusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}{focusMode ? 'Exit focus mode' : 'Focus mode'}</span>
                          {focusMode ? <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] bg-violet-600 text-white')}>On</span> : null}
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => setShowGuidedCreator(true)}>
                          <span className="flex items-center gap-2.5"><FileText className="h-3.5 w-3.5" />Document setup</span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => setDarkMode((current) => !current)}>
                          <span className="flex items-center gap-2.5">{darkMode ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}{darkMode ? 'Light mode' : 'Dark mode'}</span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Separator className={cn('my-1 h-px', darkMode ? 'bg-white/10' : 'bg-slate-200')} />
                      <div className="px-3 py-1">
                        <p className={cn('mb-2 text-[10px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>Zoom</p>
                        <div className="flex flex-wrap gap-1.5">
                          {zoomLevels.map((level) => (
                            <button
                              key={level}
                              type="button"
                              onClick={() => setEditorZoom(level)}
                              className={cn(
                                'rounded-lg px-2.5 py-1 text-xs font-medium transition',
                                editorZoom === level
                                  ? 'bg-slate-950 text-white'
                                  : darkMode
                                    ? 'bg-white/8 text-slate-300 hover:bg-white/12'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                              )}
                            >
                              {level}
                            </button>
                          ))}
                        </div>
                      </div>
                      <DropdownMenu.Separator className={cn('my-1 h-px', darkMode ? 'bg-white/10' : 'bg-slate-200')} />
                      <div className="px-3 py-1">
                        <p className={cn('mb-2 text-[10px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>Keyboard shortcuts</p>
                        <div className="space-y-0.5">
                          {[
                            { keys: 'Ctrl+B', label: 'Bold' },
                            { keys: 'Ctrl+I', label: 'Italic' },
                            { keys: 'Ctrl+U', label: 'Underline' },
                            { keys: 'Ctrl+Z', label: 'Undo' },
                            { keys: 'Ctrl+Y', label: 'Redo' },
                            { keys: '/', label: 'Slash commands' },
                          ].map(({ keys, label }) => (
                            <div key={keys} className="flex items-center justify-between gap-3">
                              <span className={cn('text-xs', darkMode ? 'text-slate-300' : 'text-slate-600')}>{label}</span>
                              <kbd className={cn('rounded px-1.5 py-0.5 font-mono text-[10px]', darkMode ? 'bg-white/8 text-slate-300' : 'bg-slate-100 text-slate-600')}>{keys}</kbd>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button type="button" className={desktopMenuTriggerClass}>
                    <Printer className="h-4 w-4" />
                    Export
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content sideOffset={8} collisionPadding={16} align="end" className={desktopMenuContentClass}>
                    <div className="px-2 pb-1.5 pt-2">
                      <p className={cn('text-[10px] font-semibold uppercase tracking-[0.24em]', darkMode ? 'text-slate-500' : 'text-slate-400')}>Export</p>
                    </div>
                    <div className="space-y-0.5">
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => void exportDocument('pdf')}>
                          <span className="flex items-center gap-2.5"><Printer className="h-4 w-4" />Export PDF</span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => void exportDocument('docx')}>
                          <span className="flex items-center gap-2.5"><FileDown className="h-4 w-4" />Export DOCX</span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => exportLocalDocument('txt')}>
                          <span className="flex items-center gap-2.5"><Download className="h-4 w-4" />Export TXT</span>
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button type="button" className={desktopMenuItemClass} onClick={() => exportLocalDocument('html')}>
                          <span className="flex items-center gap-2.5"><FileText className="h-3.5 w-3.5" />Export HTML</span>
                        </button>
                      </DropdownMenu.Item>
                    </div>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              </div>
              <div className="hidden items-center gap-2 lg:flex">
                <Button type="button" variant="outline" className={cn(toolbarButtonClass, previewMode ? 'border-slate-950 bg-slate-950 text-white hover:bg-slate-900' : '')} onClick={() => openPreviewForDocument()}>
                  {previewMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(toolbarButtonClass, focusMode ? 'border-violet-600 bg-violet-600 text-white hover:bg-violet-700' : '')}
                  onClick={() => { setFocusMode((c) => !c); if (!focusMode) setSidebarOpen(false); else setSidebarOpen(true); }}
                  title={focusMode ? 'Exit focus mode' : 'Focus mode'}
                >
                  {focusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
                <Button type="button" variant="outline" size="icon" className={toolbarButtonClass} onClick={() => setShowCommandPalette(true)}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {showFindReplace ? (
            <div className={cn('mt-3 rounded-[1.2rem] border p-3', darkMode ? 'border-white/10 bg-[#0d1830]/86' : 'border-slate-200 bg-white/92')}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                <div className="grid flex-1 gap-3 md:grid-cols-2">
                  <div>
                    <p className={cn('mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>Find</p>
                    <Input
                      value={findQuery}
                      onChange={(event) => setFindQuery(event.target.value)}
                      placeholder="Search text in this document"
                      className={cn('h-11 rounded-2xl border', darkMode ? 'border-white/10 bg-white/5 text-white placeholder:text-slate-500' : 'border-slate-200 bg-white')}
                    />
                  </div>
                  <div>
                    <p className={cn('mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>Replace with</p>
                    <Input
                      value={replaceValue}
                      onChange={(event) => setReplaceValue(event.target.value)}
                      placeholder="Optional replacement"
                      className={cn('h-11 rounded-2xl border', darkMode ? 'border-white/10 bg-white/5 text-white placeholder:text-slate-500' : 'border-slate-200 bg-white')}
                    />
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-3 lg:w-[360px]">
                  <Button type="button" variant="outline" className={cn('h-11 rounded-2xl', darkMode ? 'border-white/10 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white')} onClick={() => runFindReplace(false)}>
                    Replace first
                  </Button>
                  <Button type="button" className="h-11 rounded-2xl bg-slate-950 text-white hover:bg-slate-800" onClick={() => runFindReplace(true)}>
                    Replace all
                  </Button>
                  <Button type="button" variant="outline" className={cn('h-11 rounded-2xl', darkMode ? 'border-white/10 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white')} onClick={() => setShowFindReplace(false)}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <ProcessProgress
        active={docwordProgressActive}
        profile={docwordProgressProfile}
        title={docwordProgressTitle}
        compact
        floating
        className={cn(
          'border shadow-[0_14px_32px_rgba(15,23,42,0.08)]',
          darkMode ? 'border-white/[0.04] bg-[#050505]/88 backdrop-blur-2xl' : 'border-white/80 bg-white/94',
        )}
      />

      {mobileSidebarOpen ? (
        <div className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-sm lg:hidden" onClick={() => setMobileSidebarOpen(false)}>
          <aside
            className={cn(
              'absolute left-0 top-0 h-full w-[86vw] max-w-[360px] overflow-y-auto border-r p-4',
              darkMode ? 'border-white/10 bg-[#07111f]' : 'border-slate-200 bg-white',
            )}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-sky-500">Workspace</p>
                <h2 className={cn('mt-1 text-xl font-semibold tracking-[-0.03em]', darkMode ? 'text-white' : 'text-slate-950')}>Your docs</h2>
              </div>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className={cn('h-10 w-10 rounded-2xl', darkMode ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white')}
                onClick={() => setMobileSidebarOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className={cn('mt-4 rounded-2xl border px-3 py-2', darkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50')}>
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-slate-400" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search documents"
                  className="h-8 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                />
              </div>
            </div>

            <div className="mt-4">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveFolderFilter('All')}
                  className={cn('rounded-full px-3 py-1.5 text-[11px] font-medium', activeFolderFilter === 'All' ? 'bg-slate-950 text-white' : darkMode ? 'bg-white/8 text-slate-200' : 'bg-slate-100 text-slate-600')}
                >
                  All
                </button>
                {folders.map((folder) => (
                  <button
                    key={folder}
                    type="button"
                    onClick={() => setActiveFolderFilter(folder)}
                    className={cn('rounded-full px-3 py-1.5 text-[11px] font-medium', activeFolderFilter === folder ? 'bg-slate-950 text-white' : darkMode ? 'bg-white/8 text-slate-200' : 'bg-slate-100 text-slate-600')}
                  >
                    {folder}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <Input
                  value={newFolderName}
                  onChange={(event) => setNewFolderName(event.target.value)}
                  placeholder="New folder"
                  className={cn('h-10 rounded-2xl border shadow-none', darkMode ? 'border-white/10 bg-white/5 text-white placeholder:text-slate-500' : 'border-slate-200 bg-white')}
                />
                <Button type="button" className="h-10 rounded-2xl bg-slate-950 px-4 text-white hover:bg-slate-800" onClick={() => void createFolder()}>
                  Add
                </Button>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {filteredDocuments.map((document) => (
                <button
                  key={document.id}
                  type="button"
                  onClick={() => {
                    if (canOpenDocument(document)) {
                      setCurrentDocumentId(document.id);
                      setMobileSidebarOpen(false);
                    } else {
                      setError('Unlock the selected folder or document from the active editor panel first.');
                    }
                  }}
                  className={cn(
                    'w-full rounded-[1.3rem] border px-4 py-3 text-left transition',
                    document.id === currentDocumentId
                      ? darkMode
                        ? 'border-white/15 bg-white/10'
                        : 'border-sky-200 bg-sky-50'
                      : darkMode
                        ? 'border-white/8 bg-transparent hover:bg-white/6'
                        : 'border-slate-200 bg-white hover:bg-slate-50',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-lg">{document.emoji || '✍️'}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setCurrentDocumentId(document.id);
                          openPreviewForDocument(document.id);
                        }}
                        className={cn(
                          'inline-flex h-8 w-8 items-center justify-center rounded-xl border transition',
                          darkMode
                            ? 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                            : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900',
                        )}
                        aria-label={`Preview ${document.title}`}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void toggleFavoriteDocument(document);
                        }}
                        className={cn(
                          'inline-flex h-8 w-8 items-center justify-center rounded-xl border transition',
                          document.isFavorite
                            ? darkMode
                              ? 'border-amber-400/15 bg-amber-400/10 text-amber-200 hover:bg-amber-400/16'
                              : 'border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100'
                            : darkMode
                              ? 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900',
                        )}
                        aria-label={`${document.isFavorite ? 'Remove from' : 'Add to'} favorites`}
                      >
                        <Star className={cn('h-4 w-4', document.isFavorite ? 'fill-current' : '')} />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void deleteDocumentById(document.id);
                        }}
                        className={cn(
                          'inline-flex h-8 w-8 items-center justify-center rounded-xl border transition',
                          darkMode
                            ? 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                            : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-rose-600',
                        )}
                        aria-label={`Delete ${document.title}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      {(document.folderLockCode || document.documentLockCode) ? (
                        <span className={cn('rounded-full px-2 py-1 text-[10px]', darkMode ? 'bg-amber-400/10 text-amber-200' : 'bg-amber-50 text-amber-700')}>
                          <Lock className="h-3 w-3" />
                        </span>
                      ) : null}
                      <span className={cn('rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.2em]', darkMode ? 'bg-white/8 text-slate-300' : 'bg-slate-100 text-slate-500')}>
                        {document.isFavorite ? DOCWORD_FAVORITES_FOLDER : document.folderName}
                      </span>
                    </div>
                  </div>
                  <p className={cn('mt-3 truncate text-sm font-semibold', darkMode ? 'text-white' : 'text-slate-900')}>{document.title}</p>
                  <p className={cn('mt-1 line-clamp-2 text-xs leading-5', darkMode ? 'text-slate-300' : 'text-slate-500')}>
                    {document.summary || document.plainText || 'Start writing'}
                  </p>
                </button>
              ))}
            </div>
          </aside>
        </div>
      ) : null}

      <div className="mx-auto flex max-w-[1680px] gap-4 px-3 py-4 sm:px-5 lg:px-6">
        {/* ── Desktop Sidebar ── */}
        <aside className={cn(
          'hidden shrink-0 flex-col overflow-hidden rounded-[1.6rem] border lg:flex lg:w-[300px]',
          sidebarOpen && !focusMode ? 'lg:flex' : 'lg:hidden',
          darkMode
            ? 'border-white/[0.06] bg-[#09090c]/92 backdrop-blur-2xl'
            : 'border-slate-200/70 bg-white/90 shadow-[0_2px_16px_rgba(44,93,169,0.06),0_1px_0_rgba(255,255,255,0.8)_inset] backdrop-blur-xl',
        )}>

          {/* Sidebar header */}
          <div className={cn('shrink-0 border-b px-4 pb-3 pt-4', darkMode ? 'border-white/[0.05]' : 'border-slate-100')}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className={cn('text-[10px] font-semibold uppercase tracking-[0.26em]', darkMode ? 'text-slate-500' : 'text-slate-400')}>Workspace</p>
                <h2 className={cn('mt-0.5 text-[0.95rem] font-semibold tracking-[-0.02em]', darkMode ? 'text-white' : 'text-slate-900')}>Documents</h2>
              </div>
              <button
                type="button"
                onClick={() => void createInitialDocument()}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg border transition-all',
                  darkMode
                    ? 'border-white/[0.08] bg-white/[0.05] text-slate-300 hover:bg-white/[0.10] hover:text-white'
                    : 'border-slate-200 bg-white text-slate-600 shadow-[0_1px_3px_rgba(15,23,42,0.06)] hover:bg-sky-50 hover:border-sky-200 hover:text-sky-600',
                )}
                aria-label="New document"
              >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              </button>
            </div>

            {/* Search */}
            <div className={cn('mt-3 flex items-center gap-2 rounded-lg border px-3 py-2', darkMode ? 'border-white/[0.06] bg-white/[0.03]' : 'border-slate-200/80 bg-slate-50/80')}>
              <Search className={cn('h-3.5 w-3.5 shrink-0', darkMode ? 'text-slate-500' : 'text-slate-400')} />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search documents..."
                className={cn('h-auto border-0 bg-transparent px-0 py-0 text-[13px] shadow-none focus-visible:ring-0', darkMode ? 'text-slate-200 placeholder:text-slate-600' : 'text-slate-700 placeholder:text-slate-400')}
              />
              {searchTerm ? (
                <button type="button" onClick={() => setSearchTerm('')} className={cn('shrink-0', darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600')}>
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>

          {/* Folder tabs */}
          <div className={cn('shrink-0 border-b px-4 py-2.5', darkMode ? 'border-white/[0.05]' : 'border-slate-100')}>
            <div className="flex gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {['All', ...folders].map((folder) => {
                const active = activeFolderFilter === folder;
                return (
                  <button
                    key={folder}
                    type="button"
                    onClick={() => setActiveFolderFilter(folder)}
                    className={cn(
                      'shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-all',
                      active
                        ? darkMode
                          ? 'border-sky-400/25 bg-sky-500/15 text-sky-300'
                          : 'border-sky-200 bg-sky-500 text-white shadow-[0_2px_6px_rgba(14,165,233,0.25)]'
                        : darkMode
                          ? 'border-white/[0.06] bg-transparent text-slate-500 hover:text-slate-300'
                          : 'border-slate-200/70 bg-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700',
                    )}
                  >
                    {folder}
                  </button>
                );
              })}
            </div>
            {/* New folder row */}
            <div className="mt-2 flex gap-1.5">
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="New folder name..."
                className={cn('h-7 rounded-md border px-2.5 text-[12px] shadow-none', darkMode ? 'border-white/[0.07] bg-white/[0.03] text-white placeholder:text-slate-600' : 'border-slate-200 bg-white text-slate-800 placeholder:text-slate-400')}
                onKeyDown={(e) => { if (e.key === 'Enter') void createFolder(); }}
              />
              <button
                type="button"
                onClick={() => void createFolder()}
                className={cn('h-7 shrink-0 rounded-md border px-2.5 text-[12px] font-semibold transition', darkMode ? 'border-white/[0.08] bg-white/[0.05] text-slate-300 hover:bg-white/[0.10]' : 'border-slate-200 bg-white text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:bg-slate-50')}
              >
                Add
              </button>
            </div>
          </div>

          {/* Document list */}
          <div className="min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-width:thin]">
            <div className="space-y-1">
              {filteredDocuments.map((document) => {
                const isActive = document.id === currentDocumentId;
                return (
                  <div key={document.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => {
                        if (canOpenDocument(document)) {
                          setCurrentDocumentId(document.id);
                        } else {
                          setError('Unlock the folder or document first.');
                        }
                      }}
                      className={cn(
                        'w-full rounded-[0.85rem] border px-3 py-2.5 text-left transition-all',
                        isActive
                          ? darkMode
                            ? 'border-sky-400/20 bg-sky-500/[0.08]'
                            : 'border-sky-200/80 bg-sky-50/80 shadow-[0_1px_6px_rgba(14,165,233,0.10)]'
                          : darkMode
                            ? 'border-transparent hover:border-white/[0.05] hover:bg-white/[0.03]'
                            : 'border-transparent hover:border-slate-200/60 hover:bg-slate-50/80',
                      )}
                    >
                      {/* Active indicator bar */}
                      {isActive ? (
                        <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full bg-sky-500" />
                      ) : null}

                      <div className="flex items-start gap-2.5">
                        {/* Emoji */}
                        <span className="mt-0.5 shrink-0 text-base leading-none">{document.emoji || '📄'}</span>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className={cn('truncate text-[13px] font-semibold leading-snug', isActive ? (darkMode ? 'text-sky-200' : 'text-sky-700') : (darkMode ? 'text-slate-200' : 'text-slate-800'))}>
                              {document.title || 'Untitled'}
                            </p>
                            {(document.folderLockCode || document.documentLockCode) ? (
                              <Lock className={cn('h-2.5 w-2.5 shrink-0', darkMode ? 'text-amber-400' : 'text-amber-500')} />
                            ) : null}
                            {document.isFavorite ? (
                              <Star className={cn('h-2.5 w-2.5 shrink-0 fill-current', darkMode ? 'text-amber-400' : 'text-amber-500')} />
                            ) : null}
                          </div>
                          <p className={cn('mt-0.5 line-clamp-1 text-[11px] leading-4', darkMode ? 'text-slate-500' : 'text-slate-400')}>
                            {document.summary || document.plainText?.slice(0, 80) || 'No content yet'}
                          </p>
                          <div className={cn('mt-1.5 flex items-center gap-2 text-[10px]', darkMode ? 'text-slate-600' : 'text-slate-400')}>
                            <span className={cn('rounded-sm px-1.5 py-0.5 font-medium', darkMode ? 'bg-white/[0.05] text-slate-500' : 'bg-slate-100 text-slate-500')}>
                              {document.folderName || 'General'}
                            </span>
                            <span>{document.wordCount ? `${document.wordCount}w` : 'Empty'}</span>
                            {document.wordCount ? <><span>·</span><span>~{Math.max(1, Math.ceil(document.wordCount / 500))}p</span></> : null}
                          </div>
                        </div>
                      </div>
                    </button>

                    {/* Hover action buttons */}
                    <div className="absolute right-2 top-2 hidden items-center gap-1 group-hover:flex">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setCurrentDocumentId(document.id); openPreviewForDocument(document.id); }}
                        className={cn('flex h-6 w-6 items-center justify-center rounded-md transition', darkMode ? 'bg-white/[0.07] text-slate-400 hover:bg-white/[0.12] hover:text-white' : 'bg-white text-slate-400 shadow-[0_1px_3px_rgba(15,23,42,0.10)] hover:text-sky-600')}
                        aria-label="Preview"
                      >
                        <Eye className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); void toggleFavoriteDocument(document); }}
                        className={cn('flex h-6 w-6 items-center justify-center rounded-md transition', document.isFavorite ? 'bg-amber-50 text-amber-500' : darkMode ? 'bg-white/[0.07] text-slate-400 hover:bg-white/[0.12] hover:text-amber-300' : 'bg-white text-slate-400 shadow-[0_1px_3px_rgba(15,23,42,0.10)] hover:text-amber-500')}
                        aria-label="Favourite"
                      >
                        <Star className={cn('h-3 w-3', document.isFavorite ? 'fill-current' : '')} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); void deleteDocumentById(document.id); }}
                        className={cn('flex h-6 w-6 items-center justify-center rounded-md transition', darkMode ? 'bg-white/[0.07] text-slate-400 hover:bg-rose-500/15 hover:text-rose-400' : 'bg-white text-slate-400 shadow-[0_1px_3px_rgba(15,23,42,0.10)] hover:bg-rose-50 hover:text-rose-500')}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {filteredDocuments.length === 0 ? (
                <div className={cn('rounded-[0.85rem] border px-4 py-6 text-center', darkMode ? 'border-white/[0.05] bg-white/[0.02]' : 'border-slate-100 bg-slate-50/60')}>
                  <FileText className={cn('mx-auto h-6 w-6', darkMode ? 'text-slate-600' : 'text-slate-300')} />
                  <p className={cn('mt-2 text-[12px] font-medium', darkMode ? 'text-slate-500' : 'text-slate-400')}>
                    {searchTerm ? 'No matching documents' : 'No documents yet'}
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          {/* Stats panel */}
          {currentDocument ? (
            <div className={cn('shrink-0 border-t px-4 py-3', darkMode ? 'border-white/[0.05]' : 'border-slate-100')}>
              <p className={cn('mb-2.5 text-[10px] font-semibold uppercase tracking-[0.22em]', darkMode ? 'text-slate-500' : 'text-slate-400')}>Document stats</p>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { label: 'Words', value: String(currentDocument.wordCount ?? 0) },
                  { label: 'Pages', value: String(Math.max(1, Math.ceil((currentDocument.wordCount ?? 0) / 500))) },
                  { label: 'Min', value: String(currentDocument.readTimeMinutes ?? 1) },
                  { label: 'Score', value: String(documentScore.score), color: documentScore.score >= 82 ? 'text-emerald-500' : documentScore.score >= 68 ? 'text-amber-500' : 'text-rose-500' },
                ].map(({ label, value, color }) => (
                  <div key={label} className={cn('rounded-lg border px-2 py-2 text-center', darkMode ? 'border-white/[0.05] bg-white/[0.02]' : 'border-slate-100 bg-slate-50/80')}>
                    <p className={cn('text-[1rem] font-bold tabular-nums tracking-[-0.03em]', color ?? (darkMode ? 'text-white' : 'text-slate-800'))}>{value}</p>
                    <p className={cn('mt-0.5 text-[9px] font-semibold uppercase tracking-[0.16em]', darkMode ? 'text-slate-600' : 'text-slate-400')}>{label}</p>
                  </div>
                ))}
              </div>
              {/* Writing density bar */}
              {(() => {
                const blockCount = currentDocument.blocks.length || 1;
                const density = Math.min(100, Math.round(((currentDocument.wordCount ?? 0) / blockCount) / 0.5));
                return (
                  <div className="mt-2.5">
                    <div className="mb-1 flex items-center justify-between">
                      <p className={cn('text-[10px] font-medium', darkMode ? 'text-slate-600' : 'text-slate-400')}>Writing density</p>
                      <span className={cn('text-[10px] font-semibold tabular-nums', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                        {Math.round((currentDocument.wordCount ?? 0) / blockCount)} w/block
                      </span>
                    </div>
                    <div className={cn('h-1 w-full overflow-hidden rounded-full', darkMode ? 'bg-white/[0.06]' : 'bg-slate-100')}>
                      <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-violet-500 transition-all duration-700" style={{ width: `${density}%` }} />
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : null}

          {/* PDF Studio launcher */}
          <div className={cn('shrink-0 border-t px-4 py-3', darkMode ? 'border-white/[0.05]' : 'border-slate-100')}>
            <button
              type="button"
              onClick={() => setShowPdfStudio(true)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-[0.85rem] border px-3 py-2.5 text-left transition-all',
                darkMode
                  ? 'border-rose-500/20 bg-rose-500/[0.06] text-rose-300 hover:bg-rose-500/[0.10]'
                  : 'border-rose-200/70 bg-rose-50/60 text-rose-600 shadow-[0_1px_4px_rgba(239,68,68,0.08)] hover:border-rose-300/80 hover:bg-rose-50',
              )}
            >
              <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', darkMode ? 'bg-rose-500/15' : 'bg-white shadow-[0_1px_4px_rgba(239,68,68,0.15)]')}>
                <FileText className={cn('h-3.5 w-3.5', darkMode ? 'text-rose-400' : 'text-rose-500')} />
              </div>
              <div className="min-w-0">
                <p className="text-[12px] font-semibold leading-tight">PDF Studio</p>
                <p className={cn('text-[10px] leading-tight', darkMode ? 'text-rose-400/60' : 'text-rose-400')}>Edit, merge &amp; export PDFs</p>
              </div>
            </button>
          </div>

          {/* Scratchpad launcher */}
          <div className={cn('shrink-0 border-t px-4 py-3', darkMode ? 'border-white/[0.05]' : 'border-slate-100')}>
            <button
              type="button"
              onClick={() => setShowScratchpad(true)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-[0.85rem] border px-3 py-2.5 text-left transition-all',
                darkMode
                  ? 'border-violet-500/20 bg-violet-500/[0.06] text-violet-300 hover:bg-violet-500/[0.10]'
                  : 'border-violet-200/70 bg-violet-50/60 text-violet-600 shadow-[0_1px_4px_rgba(139,92,246,0.08)] hover:border-violet-300/80 hover:bg-violet-50',
              )}
            >
              <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', darkMode ? 'bg-violet-500/15' : 'bg-white shadow-[0_1px_4px_rgba(139,92,246,0.15)]')}>
                <PenLine className={cn('h-3.5 w-3.5', darkMode ? 'text-violet-400' : 'text-violet-500')} />
              </div>
              <div className="min-w-0">
                <p className="text-[12px] font-semibold leading-tight">Scratchpad</p>
                <p className={cn('text-[10px] leading-tight', darkMode ? 'text-violet-400/60' : 'text-violet-400')}>Freehand draw &amp; annotate</p>
              </div>
            </button>
          </div>

          {/* Document outline */}
          <div className={cn('shrink-0 border-t px-4 py-3', darkMode ? 'border-white/[0.05]' : 'border-slate-100')}>
            <p className={cn('mb-2 text-[10px] font-semibold uppercase tracking-[0.22em]', darkMode ? 'text-slate-500' : 'text-slate-400')}>Outline</p>
            <div className="space-y-0.5">
              {headingOutline.length ? headingOutline.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveBlockId(item.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition',
                    item.level === 'heading-2' ? 'pl-5' : '',
                    darkMode ? 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800',
                  )}
                >
                  <span className={cn('shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase', item.level === 'heading-1' ? (darkMode ? 'bg-sky-500/15 text-sky-400' : 'bg-sky-50 text-sky-600') : (darkMode ? 'bg-white/[0.06] text-slate-500' : 'bg-slate-100 text-slate-500'))}>
                    {item.level === 'heading-1' ? 'H1' : 'H2'}
                  </span>
                  <span className="truncate text-[12px] font-medium">{item.label}</span>
                </button>
              )) : (
                <p className={cn('text-[11px] leading-5', darkMode ? 'text-slate-600' : 'text-slate-400')}>
                  Add headings to see an outline here.
                </p>
              )}
            </div>
          </div>

        </aside>

        <main className="min-w-0 flex-1">
          {showScratchpad ? (
            <div className={cn('flex flex-col h-full rounded-[2rem] overflow-hidden border', darkMode ? 'border-violet-500/20' : 'border-violet-200/60')}>
              <div className={cn('flex items-center justify-between gap-3 px-4 py-2.5 shrink-0 border-b', darkMode ? 'bg-violet-500/[0.06] border-violet-500/20' : 'bg-violet-50/80 border-violet-200/60')}>
                <div className="flex items-center gap-2">
                  <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg', darkMode ? 'bg-violet-500/20' : 'bg-white shadow-sm')}>
                    <PenLine className={cn('h-4 w-4', darkMode ? 'text-violet-400' : 'text-violet-600')} />
                  </div>
                  <span className={cn('text-sm font-semibold', darkMode ? 'text-violet-200' : 'text-violet-800')}>Scratchpad</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowScratchpad(false)}
                  className={cn('flex h-7 w-7 items-center justify-center rounded-lg border transition-colors', darkMode ? 'border-white/10 text-slate-400 hover:bg-white/10' : 'border-violet-200 text-violet-500 hover:bg-violet-100')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 min-h-0">
                <ScratchpadCenter />
              </div>
            </div>
          ) : showPdfStudio ? (
            <PdfStudio darkMode={darkMode} onClose={() => setShowPdfStudio(false)} />
          ) : loading ? (
            <div className={cn('flex min-h-[70vh] flex-col items-center justify-center gap-8 rounded-[2rem] border', darkMode ? 'border-white/[0.04] bg-black/30 backdrop-blur-2xl' : 'border-white/80 bg-white/80 shadow-[0_2px_32px_rgba(44,93,169,0.07)]')}>
              <div className="relative flex items-center justify-center">
                <span className="absolute h-[4.5rem] w-[4.5rem] animate-ping rounded-full bg-sky-400/15" style={{ animationDuration: '1.8s' }} />
                <span className="absolute h-[3.2rem] w-[3.2rem] animate-ping rounded-full bg-sky-400/20" style={{ animationDuration: '1.8s', animationDelay: '0.3s' }} />
                <div className={cn('relative flex h-16 w-16 items-center justify-center rounded-[1.4rem] shadow-[0_8px_24px_rgba(14,165,233,0.22)]', darkMode ? 'bg-sky-500/15' : 'bg-sky-50')}>
                  <FileText className="h-7 w-7 text-sky-500" />
                </div>
              </div>
              <div className="space-y-3 text-center">
                <p className={cn('text-sm font-semibold tracking-[-0.01em]', darkMode ? 'text-slate-200' : 'text-slate-700')}>Loading workspace</p>
                <div className="flex items-center justify-center gap-1.5">
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-400"
                      style={{ animationDelay: `${delay}ms`, animationDuration: '1.2s' }}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : !currentDocument ? (
            <div className={cn('flex min-h-[70vh] flex-col items-center justify-center rounded-[2rem] border px-8 text-center', darkMode ? 'border-white/[0.04] bg-black/30 backdrop-blur-2xl' : 'border-slate-200/60 bg-white/80 backdrop-blur-xl')}>
              <div className={cn('flex h-16 w-16 items-center justify-center rounded-[1.4rem] shadow-[0_8px_24px_rgba(15,23,42,0.10)]', darkMode ? 'bg-white/[0.06]' : 'bg-white')}>
                <FileText className={cn('h-7 w-7', darkMode ? 'text-sky-300' : 'text-sky-500')} />
              </div>
              <h3 className={cn('mt-5 text-xl font-semibold tracking-[-0.03em]', darkMode ? 'text-white' : 'text-slate-950')}>Start your workspace</h3>
              <p className={cn('mt-2 max-w-sm text-sm leading-6', darkMode ? 'text-slate-300' : 'text-slate-500')}>
                Create a new document or pick a template to begin writing with AI-powered editing, autosave, and instant export.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Button type="button" className="ui-button h-11 rounded-[1.1rem] bg-slate-950 px-5 text-white hover:bg-slate-800" onClick={() => void createInitialDocument()}>
                  <FilePlus2 className="mr-2 h-4 w-4" />
                  New document
                </Button>
                <Button type="button" variant="outline" className={cn('ui-button h-11 rounded-[1.1rem] px-5', darkMode ? 'border-white/[0.06] text-slate-200' : 'border-slate-200 bg-white text-slate-700')} onClick={() => setShowTemplates(true)}>
                  <LayoutTemplate className="mr-2 h-4 w-4" />
                  Browse templates
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-1">
              <section className={cn('cloud-card overflow-hidden rounded-[2rem] border', darkMode ? 'border-white/[0.05] text-slate-100' : 'border-slate-200/60 bg-white/70')}>
                <div className={cn('px-3 py-6 sm:px-6 sm:py-8', darkMode ? 'bg-[#050506]/80' : previewMode ? 'bg-[#f0f2f5]' : 'bg-gradient-to-b from-[#eef3fb]/80 to-[#e8f0fa]/80')}>
                  {activeDocumentLocked || activeFolderLocked ? (
                    <div className={cn('mx-auto max-w-3xl rounded-[1.8rem] border p-6 text-center', darkMode ? 'border-white/10 bg-[#0d1830]' : 'border-amber-200 bg-amber-50')}>
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500 text-white">
                        <Lock className="h-6 w-6" />
                      </div>
                      <h3 className={cn('mt-4 text-xl font-semibold tracking-[-0.03em]', darkMode ? 'text-white' : 'text-slate-950')}>
                        This {activeDocumentLocked ? 'document' : 'folder'} is locked
                      </h3>
                      <p className={cn('mt-2 text-sm leading-6', darkMode ? 'text-slate-300' : 'text-slate-600')}>
                        Use the protection panel in the toolbar menus to unlock and continue editing.
                      </p>
                    </div>
                  ) : (
                    <div className="mx-auto max-w-[980px]">
                      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                        {/* Left: document meta chips */}
                        <div className="flex items-center gap-2">
                          <div className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px]', darkMode ? 'border-white/[0.06] bg-white/[0.03] text-slate-400' : 'border-slate-200/80 bg-white/80 text-slate-400 shadow-[0_1px_2px_rgba(15,23,42,0.04)]')}>
                            <span className={cn('font-semibold tabular-nums', darkMode ? 'text-slate-200' : 'text-slate-700')}>{currentDocument.blocks.length}</span>
                            <span>{currentDocument.blocks.length === 1 ? 'block' : 'blocks'}</span>
                            <span className="opacity-30">·</span>
                            <span className={cn('font-medium', darkMode ? 'text-slate-300' : 'text-slate-600')}>{editorFontFamily}</span>
                            <span className="opacity-30">·</span>
                            <span className={cn('font-medium', darkMode ? 'text-slate-300' : 'text-slate-600')}>{editorZoom}</span>
                            {activeBlock && !previewMode ? (
                              <>
                                <span className="opacity-30">·</span>
                                <span className={cn('font-semibold', darkMode ? 'text-sky-300' : 'text-sky-600')}>
                                  {activeBlock.type === 'heading-1' ? 'H1' : activeBlock.type === 'heading-2' ? 'H2' : activeBlock.type === 'heading-3' ? 'H3' : activeBlock.type === 'callout' ? 'Callout' : activeBlock.type === 'quote' ? 'Quote' : activeBlock.type === 'table' ? 'Table' : activeBlock.type === 'image' ? 'Image' : 'Text'}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>

                        {/* Right: actions + mode toggle */}
                        <div className="flex items-center gap-2">
                          {!previewMode ? (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                className={cn('h-8 rounded-lg px-3 text-xs font-medium', darkMode ? 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white' : 'border-slate-200/80 bg-white text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:border-slate-300 hover:text-slate-800')}
                                onClick={() => focusPageRegion('header')}
                              >
                                {pageRegionVisibility.header ? 'Edit header' : 'Add header'}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className={cn('h-8 rounded-lg px-3 text-xs font-medium', darkMode ? 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white' : 'border-slate-200/80 bg-white text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:border-slate-300 hover:text-slate-800')}
                                onClick={() => focusPageRegion('footer')}
                              >
                                {pageRegionVisibility.footer ? 'Edit footer' : 'Add footer'}
                              </Button>
                            </>
                          ) : null}

                          {/* Edit / Preview mode toggle pill */}
                          <div className={cn('flex items-center gap-0.5 rounded-[0.75rem] border p-0.5', darkMode ? 'border-white/[0.07] bg-white/[0.03]' : 'border-slate-200/80 bg-slate-50 shadow-[0_1px_2px_rgba(15,23,42,0.04)]')}>
                            <button
                              type="button"
                              onClick={() => setPreviewMode(false)}
                              className={cn(
                                'flex h-7 items-center gap-1.5 rounded-[0.6rem] px-3 text-[12px] font-medium transition-all',
                                !previewMode
                                  ? darkMode ? 'bg-white/[0.12] text-white shadow-sm' : 'bg-white text-slate-900 shadow-[0_1px_3px_rgba(15,23,42,0.10)]'
                                  : darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600',
                              )}
                            >
                              <Pencil className="h-3 w-3" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setPreviewMode(true)}
                              className={cn(
                                'flex h-7 items-center gap-1.5 rounded-[0.6rem] px-3 text-[12px] font-medium transition-all',
                                previewMode
                                  ? darkMode ? 'bg-white/[0.12] text-white shadow-sm' : 'bg-white text-slate-900 shadow-[0_1px_3px_rgba(15,23,42,0.10)]'
                                  : darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600',
                              )}
                            >
                              <Eye className="h-3 w-3" />
                              Preview
                            </button>
                          </div>
                        </div>
                      </div>
                      <div
                        className={cn(
                          'relative mx-auto flex min-h-[86vh] flex-col overflow-hidden border px-8 sm:px-16',
                          previewMode ? 'rounded-none pt-16 pb-16' : 'rounded-sm py-12 sm:py-16',
                          darkMode
                            ? 'border-slate-300/20 bg-[#f4f5f7] shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_32px_rgba(0,0,0,0.55),0_32px_80px_rgba(0,0,0,0.38),0_64px_120px_rgba(0,0,0,0.22)]'
                            : cn(
                                previewMode
                                  ? 'shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_4px_12px_rgba(15,23,42,0.06),0_16px_48px_rgba(15,23,42,0.10),0_48px_96px_rgba(15,23,42,0.07)]'
                                  : 'shadow-[0_2px_4px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.09),0_24px_64px_rgba(15,23,42,0.07)]',
                                documentThemeConfig.surface,
                                documentThemeConfig.canvas,
                              ),
                        )}
                        style={{ fontFamily: editorFontFamily, zoom: editorZoom, lineHeight: editorLineSpacing, color: darkMode ? '#1a202c' : textColor }}
                      >
                        {currentDocument.watermarkText?.trim() ? (
                          <div
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 text-center font-semibold uppercase tracking-[0.28em] text-slate-900/[0.07]"
                            style={{ fontSize: 'clamp(2rem, 6vw, 4.8rem)', transform: 'rotate(-28deg)' }}
                          >
                            {currentDocument.watermarkText}
                          </div>
                        ) : null}

                        {previewMode ? (
                          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200/60 bg-white/80 px-6 py-2.5 backdrop-blur-sm">
                            <div className="flex items-center gap-2">
                              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-200">
                                <Eye className="h-2.5 w-2.5 text-slate-500" />
                              </span>
                              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Preview</span>
                              <span className="text-[11px] text-slate-300">—</span>
                              <span className="text-[11px] text-slate-400">Read only · Final output view</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setPreviewMode(false)}
                              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                            >
                              <Pencil className="h-3 w-3" />
                              Back to editor
                            </button>
                          </div>
                        ) : null}

                        {pageRegionVisibility.header ? (
                          previewMode ? (
                            <div
                              className="relative z-[1] mb-6 border-b border-slate-200/80 pb-5 text-sm leading-6 text-slate-600"
                              dangerouslySetInnerHTML={{ __html: sanitizeDocWordHtml(currentDocument.headerHtml) }}
                            />
                          ) : (
                            <div className="relative z-[1] mb-6 border-b border-slate-200 pb-4 text-sm leading-6">
                              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Header</div>
                              <DocPageRegionEditable
                                html={currentDocument.headerHtml || ''}
                                darkMode={false}
                                placeholder="Add document header"
                                region="header"
                                regionRef={pageHeaderRef}
                                onChange={(html) => {
                                  updateCurrentDocument({ headerHtml: html });
                                  if (!hasMeaningfulRegionContent(html)) {
                                    setPageRegionVisibility((current) => ({ ...current, header: false }));
                                  }
                                }}
                              />
                            </div>
                          )
                        ) : null}

                        <div className="relative z-[1] flex flex-1 flex-col">
                          {previewMode ? (
                            <div
                              className="docword-export-body prose prose-slate max-w-none px-1 py-2 text-slate-800 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_p]:leading-7 [&_p]:text-slate-700"
                              dangerouslySetInnerHTML={{ __html: buildHtml(currentDocument.blocks) }}
                            />
                          ) : (
                          <div className="space-y-3">
                            {currentDocument.blocks.map((block, index) => {
                                // Live cursor: find remote peers editing this block
                                const remoteCursors = collabEngine.users.filter(
                                  u => u.sessionId !== collabEngine.sessionId && u.cursor?.line === index,
                                );
                                return (
                                  <article
                                    key={block.id}
                                    draggable
                                    onDragStart={(event) => event.dataTransfer.setData('text/plain', String(index))}
                                    onDragOver={(event) => event.preventDefault()}
                                    onDrop={(event) => {
                                      event.preventDefault();
                                      const fromIndex = Number(event.dataTransfer.getData('text/plain'));
                                      if (Number.isNaN(fromIndex) || !currentDocument) return;
                                      const nextBlocks = [...currentDocument.blocks];
                                      const [item] = nextBlocks.splice(fromIndex, 1);
                                      nextBlocks.splice(index, 0, item);
                                      updateCurrentDocument({ blocks: nextBlocks });
                                    }}
                                    onFocus={() => collabEngine.broadcastCursor(index, 0)}
                                    className={cn(
                                      'group relative overflow-hidden rounded-xl border p-2 transition sm:p-3',
                                      activeBlockId === block.id
                                        ? 'border-sky-200/80 bg-sky-50/60'
                                        : remoteCursors.length > 0
                                          ? 'border-transparent bg-transparent'
                                          : 'border-transparent bg-transparent hover:border-slate-200/70 hover:bg-slate-50/60',
                                    )}
                                    style={remoteCursors.length > 0 ? {
                                      borderColor: remoteCursors[0].color + '60',
                                      boxShadow: `0 0 0 2px ${remoteCursors[0].color}28`,
                                    } : undefined}
                                  >
                                    {/* Live cursor avatars */}
                                    {remoteCursors.length > 0 && (
                                      <div className="absolute -top-2 right-2 z-10 flex -space-x-1">
                                        {remoteCursors.slice(0, 3).map(u => (
                                          <span
                                            key={u.sessionId}
                                            title={u.name}
                                            style={{ background: u.color, width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', border: '1.5px solid #fff', flexShrink: 0 }}
                                          >
                                            {u.name.slice(0, 1).toUpperCase()}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    <div className="flex items-start gap-3">
                                      <div className="hidden pt-2 text-slate-400 sm:block">
                                        <GripVertical className="h-4 w-4" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="mb-2 flex flex-wrap items-center gap-2 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                                            {block.type === 'heading-1' ? 'Heading 1' : block.type === 'heading-2' ? 'Heading 2' : block.type === 'heading-3' ? 'Heading 3' : block.type === 'callout' ? 'Callout' : block.type === 'quote' ? 'Quote' : block.type === 'table' ? 'Table' : block.type === 'image' ? 'Image' : 'Text'}
                                          </span>
                                          <Button type="button" size="icon" variant="outline" className="h-8 w-8 rounded-xl border-slate-200 bg-white text-slate-600 hover:bg-slate-50" onClick={() => moveBlock(index, -1)}>
                                            <ChevronDown className="h-4 w-4 rotate-180" />
                                          </Button>
                                          <Button type="button" size="icon" variant="outline" className="h-8 w-8 rounded-xl border-slate-200 bg-white text-slate-600 hover:bg-slate-50" onClick={() => moveBlock(index, 1)}>
                                            <ChevronDown className="h-4 w-4" />
                                          </Button>
                                          <Button type="button" size="icon" variant="outline" className="h-8 w-8 rounded-xl border-slate-200 bg-white text-slate-600 hover:bg-slate-50" onClick={() => insertBlockAfter(index)}>
                                            <Plus className="h-4 w-4" />
                                          </Button>
                                          <Button type="button" size="icon" variant="outline" className="h-8 w-8 rounded-xl border-slate-200 bg-white text-rose-500 hover:bg-rose-50" onClick={() => removeBlock(index)}>
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="outline"
                                            className="h-8 rounded-xl border-slate-200 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50"
                                            onClick={() => void rewriteBlockWithAi(block)}
                                            disabled={blockSuggestionLoading === block.id}
                                          >
                                            {blockSuggestionLoading === block.id ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />}
                                            Rewrite
                                          </Button>
                                        </div>

                                        {block.type === 'image' ? (
                                          <div className="space-y-3">
                                            <div className="flex flex-wrap gap-2">
                                              <label className="inline-flex h-10 cursor-pointer items-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                                                <ImageIcon className="mr-2 h-4 w-4" />
                                                Upload image
                                                <input
                                                  type="file"
                                                  accept="image/*"
                                                  className="hidden"
                                                  onChange={(event) => uploadImageToBlock(block.id, event.target.files?.[0])}
                                                />
                                              </label>
                                            </div>
                                            <Input
                                              value={block.meta?.src || ''}
                                              onChange={(event) => updateBlock(block.id, { meta: { ...(block.meta || {}), src: event.target.value } })}
                                              placeholder="Paste image URL"
                                              className="h-11 rounded-2xl border border-slate-200 bg-white"
                                            />
                                            <Input
                                              value={block.meta?.alt || ''}
                                              onChange={(event) => updateBlock(block.id, { meta: { ...(block.meta || {}), alt: event.target.value } })}
                                              placeholder="Alt text"
                                              className="h-11 rounded-2xl border border-slate-200 bg-white"
                                            />
                                            <Textarea
                                              value={block.html}
                                              onChange={(event) => updateBlock(block.id, { html: event.target.value, text: stripHtml(event.target.value) })}
                                              placeholder="Image caption"
                                              className="min-h-[100px] rounded-2xl border border-slate-200 bg-white"
                                            />
                                            {block.meta?.src ? (
                                              // eslint-disable-next-line @next/next/no-img-element
                                              <img src={block.meta.src} alt={block.meta.alt || 'DocWord preview'} className="max-h-[360px] w-full rounded-[1.4rem] border border-white/10 object-cover" />
                                            ) : null}
                                          </div>
                                        ) : block.type === 'table' ? (
                                          <div className="space-y-3">
                                            <div className="grid gap-3 sm:grid-cols-2">
                                              {(block.meta?.columns || ['Column 1', 'Column 2']).map((column, columnIndex) => (
                                                <Input
                                                  key={`${block.id}-column-${columnIndex}`}
                                                  value={column}
                                                  onChange={(event) => {
                                                    const nextColumns = [...(block.meta?.columns || ['Column 1', 'Column 2'])];
                                                    nextColumns[columnIndex] = event.target.value;
                                                    updateBlock(block.id, { meta: { ...(block.meta || {}), columns: nextColumns } });
                                                  }}
                                                  className="h-11 rounded-2xl border border-slate-200 bg-white"
                                                />
                                              ))}
                                            </div>
                                            <div className="space-y-2">
                                              {(block.meta?.rows || []).map((row, rowIndex) => (
                                                <div key={`${block.id}-row-${rowIndex}`} className="grid gap-3 sm:grid-cols-2">
                                                  {row.map((cell, cellIndex) => (
                                                    <Input
                                                      key={`${block.id}-cell-${rowIndex}-${cellIndex}`}
                                                      value={cell}
                                                      onChange={(event) => {
                                                        const nextRows = (block.meta?.rows || []).map((currentRow) => [...currentRow]);
                                                        nextRows[rowIndex][cellIndex] = event.target.value;
                                                        updateBlock(block.id, { meta: { ...(block.meta || {}), rows: nextRows } });
                                                      }}
                                                      className="h-11 rounded-2xl border border-slate-200 bg-white"
                                                    />
                                                  ))}
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        ) : (
                                          <BlockContentEditable
                                            block={block}
                                            darkMode={false}
                                            placeholder={index === 0 ? 'Start writing or type / for blocks' : 'Type / for commands'}
                                            onFocus={() => setActiveBlockId(block.id)}
                                            onChange={(html) => updateBlock(block.id, { html, text: stripHtml(html) })}
                                          />
                                        )}

                                        {slashVisible && activeBlockId === block.id ? (
                                          <div className="mt-3 grid gap-2 rounded-[1.2rem] border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
                                            {slashOptions.map((option) => {
                                              const Icon = option.icon;
                                              return (
                                                <button
                                                  key={option.type}
                                                  type="button"
                                                  onClick={() => applySlashOption(block.id, option.type)}
                                                  className="flex items-start gap-3 rounded-[1rem] border border-white bg-white px-3 py-3 text-left transition hover:bg-slate-100"
                                                >
                                                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
                                                    <Icon className="h-4 w-4" />
                                                  </div>
                                                  <div>
                                                    <p className="text-sm font-semibold text-slate-900">{option.label}</p>
                                                    <p className="mt-1 text-xs leading-5 text-slate-500">{option.description}</p>
                                                  </div>
                                                </button>
                                              );
                                            })}
                                          </div>
                                        ) : null}

                                        {blockSuggestions[block.id] ? (
                                          <div className="mt-3 rounded-[1.2rem] border border-sky-200 bg-sky-50 p-3">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                              <div>
                                                <p className="text-sm font-semibold text-sky-900">AI suggestion ready</p>
                                                <p className="mt-1 text-xs leading-5 text-sky-700">
                                                  Review this alternate rewrite before it replaces your current block.
                                                </p>
                                              </div>
                                              <div className="flex gap-2">
                                                <Button type="button" size="sm" className="h-9 rounded-xl bg-slate-950 text-white hover:bg-slate-800" onClick={() => applyBlockSuggestion(block.id)}>
                                                  Apply
                                                </Button>
                                                <Button type="button" size="sm" variant="outline" className="h-9 rounded-xl border-slate-200 bg-white hover:bg-slate-50" onClick={() => dismissBlockSuggestion(block.id)}>
                                                  Dismiss
                                                </Button>
                                              </div>
                                            </div>
                                            <div className="mt-3 rounded-[1rem] border border-slate-100 bg-white px-3 py-3 text-sm leading-7 text-slate-700">
                                              {stripHtml(blockSuggestions[block.id])}
                                            </div>
                                          </div>
                                        ) : null}

                                        {activeBlockId === block.id || (block.meta?.comments || []).length ? (
                                          <div className="mt-3 rounded-[1.2rem] border border-slate-200 bg-slate-50 p-3">
                                            <div className="flex items-center justify-between gap-3">
                                              <div>
                                                <p className="text-sm font-semibold text-slate-900">Comments and suggestions</p>
                                                <p className="mt-1 text-xs leading-5 text-slate-500">
                                                  Leave block-specific notes or keep reviewer comments attached to this section.
                                                </p>
                                              </div>
                                              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                                                {(block.meta?.comments || []).length} notes
                                              </span>
                                            </div>
                                            {(block.meta?.comments || []).length ? (
                                              <div className="mt-3 space-y-2">
                                                {(block.meta?.comments || []).map((comment, commentIndex) => (
                                                  <div key={`${block.id}-comment-${commentIndex}`} className="flex items-start justify-between gap-3 rounded-[1rem] border border-slate-100 bg-white px-3 py-3 text-sm leading-6 text-slate-700">
                                                    <p className="min-w-0 flex-1">{comment}</p>
                                                    <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0 rounded-xl border-slate-200 bg-white hover:bg-slate-50" onClick={() => removeCommentFromBlock(block.id, commentIndex)}>
                                                      <X className="h-3.5 w-3.5" />
                                                    </Button>
                                                  </div>
                                                ))}
                                              </div>
                                            ) : null}
                                            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                              <Input
                                                value={commentDrafts[block.id] || ''}
                                                onChange={(event) => setCommentDrafts((current) => ({ ...current, [block.id]: event.target.value }))}
                                                placeholder="Add a note, improvement idea, or review suggestion"
                                                className="h-11 rounded-2xl border border-slate-200 bg-white"
                                              />
                                              <Button type="button" className="h-11 rounded-2xl bg-slate-950 px-4 text-white hover:bg-slate-800" onClick={() => addCommentToBlock(block.id)}>
                                                Add note
                                              </Button>
                                            </div>
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                  </article>
                                );
                              })}
                          </div>
                          )}

                          {pageRegionVisibility.footer ? (
                            previewMode ? (
                              <div
                                className="relative z-[1] mt-8 border-t border-slate-200/80 pt-5 text-sm leading-6 text-slate-600"
                                dangerouslySetInnerHTML={{ __html: sanitizeDocWordHtml(currentDocument.footerHtml) }}
                              />
                            ) : (
                              <div className="relative z-[1] mt-auto border-t border-slate-200 pt-4 text-sm leading-6">
                                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Footer</div>
                                <DocPageRegionEditable
                                  html={currentDocument.footerHtml || ''}
                                  darkMode={false}
                                  placeholder="Add document footer"
                                  region="footer"
                                  regionRef={pageFooterRef}
                                  onChange={(html) => {
                                    updateCurrentDocument({ footerHtml: html });
                                    if (!hasMeaningfulRegionContent(html)) {
                                      setPageRegionVisibility((current) => ({ ...current, footer: false }));
                                    }
                                  }}
                                />
                              </div>
                            )
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Professional status bar */}
                <div className={cn('flex items-center justify-between gap-4 border-t px-5 py-2.5', darkMode ? 'border-white/[0.05] bg-black/40 backdrop-blur-sm' : 'border-slate-200/60 bg-white/60 backdrop-blur-sm')}>
                  <div className="flex items-center gap-4">
                    <div className={cn('flex items-center gap-1.5 text-[11px]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                      <BarChart2 className="h-3.5 w-3.5" />
                      <span className="font-medium">{currentDocument?.wordCount ?? 0}</span>
                      <span>words</span>
                    </div>
                    <div className={cn('h-3 w-px', darkMode ? 'bg-white/10' : 'bg-slate-200')} />
                    <div className={cn('flex items-center gap-1.5 text-[11px]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                      <FileText className="h-3.5 w-3.5" />
                      <span className="font-medium">{Math.max(1, Math.ceil((currentDocument?.wordCount ?? 0) / 500))}</span>
                      <span>{Math.max(1, Math.ceil((currentDocument?.wordCount ?? 0) / 500)) === 1 ? 'page' : 'pages'}</span>
                    </div>
                    <div className={cn('hidden h-3 w-px sm:block', darkMode ? 'bg-white/10' : 'bg-slate-200')} />
                    <div className={cn('hidden items-center gap-1.5 text-[11px] sm:flex', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                      <Clock className="h-3.5 w-3.5" />
                      <span className="font-medium">{currentDocument?.readTimeMinutes ?? 1}</span>
                      <span>min read</span>
                    </div>
                    <div className={cn('hidden h-3 w-px sm:block', darkMode ? 'bg-white/10' : 'bg-slate-200')} />
                    <div className={cn('hidden items-center gap-1.5 text-[11px] sm:flex', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                      <span>{currentDocument?.plainText?.length ?? 0}</span>
                      <span>chars</span>
                    </div>
                    <div className={cn('hidden h-3 w-px sm:block', darkMode ? 'bg-white/10' : 'bg-slate-200')} />
                    {(() => {
                      const wc = currentDocument?.wordCount ?? 0;
                      const { label: rlLabel, color } = wc < 150
                        ? { label: 'Starter', color: darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-500' }
                        : wc < 500
                          ? { label: 'Short form', color: darkMode ? 'bg-sky-500/20 text-sky-300' : 'bg-sky-50 text-sky-700' }
                          : wc < 1500
                            ? { label: 'Standard', color: darkMode ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-50 text-emerald-700' }
                            : { label: 'Long form', color: darkMode ? 'bg-violet-500/20 text-violet-300' : 'bg-violet-50 text-violet-700' };
                      return (
                        <span className={cn('hidden rounded-full px-2 py-0.5 text-[10px] font-semibold sm:inline-flex', color)}>{rlLabel}</span>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void exportDocument('pdf')}
                      className={cn('flex h-6 w-6 items-center justify-center rounded-md transition', darkMode ? 'text-slate-400 hover:bg-white/10 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800')}
                      aria-label="Export PDF"
                      title="Export PDF"
                    >
                      <Printer className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void exportDocument('docx')}
                      className={cn('flex h-6 w-6 items-center justify-center rounded-md transition', darkMode ? 'text-slate-400 hover:bg-white/10 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800')}
                      aria-label="Export DOCX"
                      title="Export DOCX"
                    >
                      <FileDown className="h-3 w-3" />
                    </button>
                    <div className={cn('mx-1 h-3 w-px', darkMode ? 'bg-white/10' : 'bg-slate-200')} />
                    <button
                      type="button"
                      onClick={() => {
                        const idx = zoomLevels.indexOf(editorZoom as typeof zoomLevels[number]);
                        if (idx > 0) setEditorZoom(zoomLevels[idx - 1]);
                      }}
                      className={cn('flex h-6 w-6 items-center justify-center rounded-md transition', darkMode ? 'text-slate-400 hover:bg-white/10 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800')}
                      aria-label="Zoom out"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className={cn('min-w-[3rem] text-center text-[11px] font-semibold', darkMode ? 'text-slate-300' : 'text-slate-600')}>{editorZoom}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const idx = zoomLevels.indexOf(editorZoom as typeof zoomLevels[number]);
                        if (idx < zoomLevels.length - 1) setEditorZoom(zoomLevels[idx + 1]);
                      }}
                      className={cn('flex h-6 w-6 items-center justify-center rounded-md transition', darkMode ? 'text-slate-400 hover:bg-white/10 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800')}
                      aria-label="Zoom in"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    <div className={cn('mx-1 h-3 w-px', darkMode ? 'bg-white/10' : 'bg-slate-200')} />
                    <button
                      type="button"
                      onClick={() => { setFocusMode((c) => !c); if (!focusMode) setSidebarOpen(false); else setSidebarOpen(true); }}
                      className={cn(
                        'flex h-6 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition',
                        focusMode
                          ? 'bg-violet-600 text-white'
                          : darkMode
                            ? 'text-slate-400 hover:bg-white/10 hover:text-white'
                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
                      )}
                      title={focusMode ? 'Exit focus mode' : 'Focus mode'}
                    >
                      {focusMode ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                      <span className="hidden sm:inline">{focusMode ? 'Exit focus' : 'Focus'}</span>
                    </button>
                  </div>
                </div>
              </section>

            </div>
          )}
        </main>
      </div>

      {selectionAssistantOpen && !mobileToolsOpen ? (
        <div
          className="fixed z-40 hidden md:block"
          style={{
            left: floatingToolbar.x,
            top: floatingToolbar.y,
            transform:
              floatingToolbar.placement === 'top'
                ? 'translate(-50%, -100%)'
                : 'translate(-50%, 0)',
          }}
        >
          <div
            className={cn(
              'max-h-[min(34rem,calc(100vh-1.5rem))] w-[min(44rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] overflow-hidden rounded-[1.8rem] border shadow-[0_8px_16px_rgba(15,23,42,0.06),0_24px_56px_rgba(15,23,42,0.12),0_48px_96px_rgba(15,23,42,0.08)] backdrop-blur-2xl',
              darkMode ? 'border-sky-400/[0.08] bg-[#070709]/96 text-white' : 'border-slate-200/90 bg-white/98 text-slate-900',
            )}
          >
            {/* Formatting toolbar */}
            <div className={cn('flex flex-wrap items-center gap-0.5 border-b px-2.5 py-2', darkMode ? 'border-white/[0.06] bg-white/[0.015]' : 'border-slate-100 bg-slate-50/70')}>
              {[
                { cmd: 'bold', icon: Bold },
                { cmd: 'italic', icon: Italic },
                { cmd: 'underline', icon: Underline },
              ].map(({ cmd, icon: Icon }) => (
                <Button key={cmd} type="button" variant="ghost" size="icon"
                  className={cn('h-8 w-8 rounded-lg transition', darkMode ? 'text-slate-300 hover:bg-white/[0.07] hover:text-white' : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900')}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => runEditorCommandAndSync(cmd)}>
                  <Icon className="h-3.5 w-3.5" />
                </Button>
              ))}
              <div className={cn('mx-1.5 h-4 w-px', darkMode ? 'bg-white/10' : 'bg-slate-200')} />
              {[
                { cmd: 'justifyLeft', icon: AlignLeft },
                { cmd: 'justifyCenter', icon: AlignCenter },
                { cmd: 'justifyRight', icon: AlignRight },
              ].map(({ cmd, icon: Icon }) => (
                <Button key={cmd} type="button" variant="ghost" size="icon"
                  className={cn('h-8 w-8 rounded-lg transition', darkMode ? 'text-slate-300 hover:bg-sky-500/10 hover:text-sky-200' : 'text-slate-600 hover:bg-sky-50 hover:text-sky-700')}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => runEditorCommandAndSync(cmd)}>
                  <Icon className="h-3.5 w-3.5" />
                </Button>
              ))}
              <div className={cn('mx-1.5 h-4 w-px', darkMode ? 'bg-white/10' : 'bg-slate-200')} />
              <Button type="button" variant="ghost" size="icon"
                className={cn('h-8 w-8 rounded-lg', darkMode ? 'text-slate-300 hover:bg-violet-500/10 hover:text-violet-200' : 'text-slate-600 hover:bg-violet-50 hover:text-violet-700')}
                onMouseDown={(e) => e.preventDefault()} onClick={() => adjustFontSize(-1)}>
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <span className={cn('min-w-[2.1rem] rounded-md px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums', darkMode ? 'bg-violet-500/10 text-violet-200' : 'bg-violet-50 text-violet-700')}>{editorFontSize}</span>
              <Button type="button" variant="ghost" size="icon"
                className={cn('h-8 w-8 rounded-lg', darkMode ? 'text-slate-300 hover:bg-violet-500/10 hover:text-violet-200' : 'text-slate-600 hover:bg-violet-50 hover:text-violet-700')}
                onMouseDown={(e) => e.preventDefault()} onClick={() => adjustFontSize(1)}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <div className={cn('mx-1.5 h-4 w-px', darkMode ? 'bg-white/10' : 'bg-slate-200')} />
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => activeBlock && void rewriteBlockWithAi(activeBlock)}
                className={cn('flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition', darkMode ? 'text-sky-300 hover:bg-sky-500/10' : 'text-sky-700 hover:bg-sky-50')}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Rewrite block
              </button>
            </div>

            <div className="max-h-[calc(min(34rem,calc(100vh-1.5rem))-3.25rem)] overflow-y-auto px-4 py-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.8rem]', darkMode ? 'bg-sky-500/15' : 'bg-sky-50')}>
                    <Sparkles className="h-4 w-4 text-sky-500" />
                  </div>
                  <div>
                    <p className={cn('text-[10px] font-semibold uppercase tracking-[0.22em]', darkMode ? 'text-sky-400' : 'text-sky-600')}>Selection AI</p>
                    <p className={cn('text-sm font-semibold tracking-[-0.02em]', darkMode ? 'text-white' : 'text-slate-900')}>Smart rewrites for selected text</p>
                  </div>
                </div>
                <Button type="button" size="icon" variant="ghost"
                  className={cn('h-8 w-8 shrink-0 rounded-xl', darkMode ? 'text-slate-400 hover:bg-white/[0.06] hover:text-white' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700')}
                  onMouseDown={(e) => e.preventDefault()} onClick={closeSelectionAssistant}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
                <div className="space-y-3">
                  {/* Selected text preview */}
                  <div className={cn('relative rounded-[1.1rem] border px-3.5 py-3 text-sm leading-relaxed', darkMode ? 'border-white/[0.08] bg-white/[0.03] text-slate-300' : 'border-slate-200/80 bg-slate-50/80 text-slate-600')}>
                    <span className={cn('mr-1 font-semibold', darkMode ? 'text-sky-400' : 'text-sky-500')}>"</span>
                    {selectionText.slice(0, 180)}{selectionText.length > 180 ? '...' : ''}
                    <span className={cn('ml-1 font-semibold', darkMode ? 'text-sky-400' : 'text-sky-500')}>"</span>
                  </div>

                  {/* Mode pills */}
                  <div className="flex flex-wrap gap-1.5">
                    {selectionAssistModes.map((assist) => (
                      <button key={assist.id} type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setSelectionAssistMode(assist.id)}
                        className={cn(
                          'rounded-full border px-3 py-1 text-[11px] font-semibold transition',
                          selectionAssistMode === assist.id
                            ? darkMode
                              ? 'border-sky-500/40 bg-sky-500/15 text-sky-200'
                              : 'border-sky-200 bg-sky-500 text-white shadow-[0_2px_8px_rgba(14,165,233,0.28)]'
                            : darkMode
                              ? 'border-white/[0.06] bg-white/[0.04] text-slate-400 hover:text-slate-200'
                              : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700',
                        )}>
                        {assist.label}
                      </button>
                    ))}
                  </div>

                  {/* Suggestion area */}
                  {selectionSuggestionsLoading ? (
                    <div className={cn('flex items-center gap-3 rounded-[1.1rem] border px-4 py-3.5', darkMode ? 'border-white/[0.07] bg-white/[0.03]' : 'border-slate-200 bg-slate-50/80')}>
                      <div className="flex gap-1">
                        {[0, 150, 300].map((delay) => (
                          <span key={delay} className="h-2 w-2 animate-bounce rounded-full bg-sky-400" style={{ animationDelay: `${delay}ms` }} />
                        ))}
                      </div>
                      <span className={cn('text-sm', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                        Preparing {activeSelectionAssist.label.toLowerCase()} suggestion...
                      </span>
                    </div>
                  ) : selectionSuggestions.length ? (
                    <button type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applySelectionSuggestion(selectionSuggestions[0])}
                      className={cn(
                        'group w-full rounded-[1.1rem] border px-4 py-3.5 text-left text-sm leading-relaxed transition hover:-translate-y-px hover:shadow-[0_4px_16px_rgba(14,165,233,0.12)]',
                        darkMode ? 'border-sky-500/15 bg-sky-500/[0.06] text-slate-200 hover:bg-sky-500/[0.10]' : 'border-sky-100 bg-sky-50/60 text-slate-700 hover:bg-sky-50',
                      )}>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className={cn('text-[10px] font-semibold uppercase tracking-[0.2em]', darkMode ? 'text-sky-400' : 'text-sky-600')}>
                          {activeSelectionAssist.label}
                        </span>
                        <span className={cn('flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] transition group-hover:opacity-100', darkMode ? 'text-sky-400 opacity-60' : 'text-sky-500 opacity-70')}>
                          Apply
                        </span>
                      </div>
                      {stripHtml(selectionSuggestions[0])}
                    </button>
                  ) : (
                    <div className={cn('rounded-[1.1rem] border px-4 py-3.5 text-sm leading-relaxed', darkMode ? 'border-white/[0.06] bg-white/[0.02] text-slate-500' : 'border-slate-100 bg-slate-50/60 text-slate-400')}>
                      Select a word, phrase, or sentence to receive a focused AI rewrite suggestion.
                    </div>
                  )}
                </div>

                {/* Notes panel */}
                <div className={cn('rounded-[1.1rem] border p-3.5', darkMode ? 'border-white/[0.07] bg-white/[0.025]' : 'border-slate-100 bg-slate-50/60')}>
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn('text-[10px] font-semibold uppercase tracking-[0.2em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>Reviewer note</p>
                    <button type="button"
                      className={cn('text-[11px] font-semibold transition', darkMode ? 'text-sky-400' : 'text-sky-600', !selectionCommentDraft.trim() ? 'cursor-not-allowed opacity-40' : 'hover:opacity-80')}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={addSelectionComment}
                      disabled={!selectionCommentDraft.trim()}>
                      Save note
                    </button>
                  </div>
                  <Input
                    value={selectionCommentDraft}
                    onChange={(e) => setSelectionCommentDraft(e.target.value)}
                    onMouseDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addSelectionComment(); } }}
                    placeholder="Note on this selection..."
                    className={cn('mt-3 h-9 rounded-xl border text-sm', darkMode ? 'border-white/[0.08] bg-white/[0.04] text-white placeholder:text-slate-600' : 'border-slate-200 bg-white placeholder:text-slate-400')}
                  />
                  <p className={cn('mt-3 text-[11px] leading-5', darkMode ? 'text-slate-600' : 'text-slate-400')}>
                    Attach a quick note to this selection for review.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {selectionAssistantOpen && !mobileToolsOpen ? (
        <div className={cn('fixed bottom-[5.5rem] left-1/2 z-40 max-h-[min(34rem,calc(100vh-7.5rem))] w-[min(calc(100vw-1rem),42rem)] max-w-[calc(100vw-1rem)] -translate-x-1/2 overflow-y-auto rounded-[1.8rem] border shadow-[0_8px_24px_rgba(15,23,42,0.10),0_32px_72px_rgba(15,23,42,0.14)] backdrop-blur-2xl md:hidden', darkMode ? 'border-white/[0.07] bg-[#060608]/95 text-white' : 'border-slate-200/90 bg-white/98 text-slate-900')}>
          <div className="px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className={cn('flex h-8 w-8 items-center justify-center rounded-xl', darkMode ? 'bg-sky-500/15' : 'bg-sky-50')}>
                  <Sparkles className="h-3.5 w-3.5 text-sky-500" />
                </div>
                <div>
                  <p className={cn('text-[10px] font-semibold uppercase tracking-[0.22em]', darkMode ? 'text-sky-400' : 'text-sky-600')}>Selection AI</p>
                  <p className={cn('text-sm font-semibold tracking-[-0.02em]', darkMode ? 'text-white' : 'text-slate-900')}>Smart rewrite</p>
                </div>
              </div>
              <Button type="button" size="icon" variant="ghost"
                className={cn('h-8 w-8 rounded-xl', darkMode ? 'text-slate-400 hover:bg-white/[0.06]' : 'text-slate-400 hover:bg-slate-100')}
                onClick={closeSelectionAssistant}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className={cn('mt-3 rounded-[1rem] border px-3.5 py-2.5 text-sm leading-relaxed', darkMode ? 'border-white/[0.07] bg-white/[0.03] text-slate-300' : 'border-slate-100 bg-slate-50/80 text-slate-600')}>
              <span className={cn('font-semibold', darkMode ? 'text-sky-400' : 'text-sky-500')}>"</span>
              {selectionText.slice(0, 120)}{selectionText.length > 120 ? '...' : ''}
              <span className={cn('font-semibold', darkMode ? 'text-sky-400' : 'text-sky-500')}>"</span>
            </div>

            <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {selectionAssistModes.map((assist) => (
                <button key={`${assist.id}-mobile`} type="button"
                  onClick={() => setSelectionAssistMode(assist.id)}
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold transition',
                    selectionAssistMode === assist.id
                      ? darkMode ? 'border-sky-500/40 bg-sky-500/15 text-sky-200' : 'border-sky-200 bg-sky-500 text-white shadow-[0_2px_8px_rgba(14,165,233,0.28)]'
                      : darkMode ? 'border-white/[0.06] bg-transparent text-slate-400' : 'border-slate-200 bg-white text-slate-500',
                  )}>
                  {assist.label}
                </button>
              ))}
            </div>

            <div className="mt-3 space-y-2">
              {selectionSuggestionsLoading ? (
                <div className={cn('flex items-center gap-3 rounded-[1rem] border px-3.5 py-3', darkMode ? 'border-white/[0.07] bg-white/[0.03]' : 'border-slate-100 bg-slate-50/80')}>
                  <div className="flex gap-1">
                    {[0, 150, 300].map((delay) => (
                      <span key={delay} className="h-2 w-2 animate-bounce rounded-full bg-sky-400" style={{ animationDelay: `${delay}ms` }} />
                    ))}
                  </div>
                  <span className={cn('text-sm', darkMode ? 'text-slate-400' : 'text-slate-500')}>Preparing suggestion...</span>
                </div>
              ) : (
                selectionSuggestions.slice(0, 2).map((suggestion, index) => (
                  <button key={`${index}-${suggestion.slice(0, 30)}-mobile`} type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applySelectionSuggestion(suggestion)}
                    className={cn('group w-full rounded-[1rem] border px-3.5 py-3 text-left text-sm leading-relaxed transition', darkMode ? 'border-sky-500/12 bg-sky-500/[0.05] text-slate-200 hover:bg-sky-500/[0.09]' : 'border-sky-100 bg-sky-50/60 text-slate-700 hover:bg-sky-50')}>
                    <span className={cn('mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-sky-400' : 'text-sky-600')}>
                      {activeSelectionAssist.label}
                      <span className="opacity-60">Tap to apply</span>
                    </span>
                    {stripHtml(suggestion)}
                  </button>
                ))
              )}
            </div>

            <div className={cn('mt-3 rounded-[1rem] border p-3', darkMode ? 'border-white/[0.06] bg-white/[0.02]' : 'border-slate-100 bg-slate-50/60')}>
              <div className="flex items-center justify-between gap-2">
                <p className={cn('text-[10px] font-semibold uppercase tracking-[0.2em]', darkMode ? 'text-slate-500' : 'text-slate-400')}>Note</p>
                <button type="button"
                  className={cn('text-[11px] font-semibold', darkMode ? 'text-sky-400' : 'text-sky-600', !selectionCommentDraft.trim() ? 'cursor-not-allowed opacity-40' : '')}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={addSelectionComment}
                  disabled={!selectionCommentDraft.trim()}>
                  Save
                </button>
              </div>
              <Input
                value={selectionCommentDraft}
                onChange={(e) => setSelectionCommentDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addSelectionComment(); } }}
                placeholder="Add a note on this selection..."
                className={cn('mt-2 h-9 rounded-xl border text-sm', darkMode ? 'border-white/[0.08] bg-white/[0.04] text-white placeholder:text-slate-600' : 'border-slate-200 bg-white placeholder:text-slate-400')}
              />
            </div>
          </div>
        </div>
      ) : null}

      {currentDocument ? (
        <>
          {/* Docai FAB */}
          <button
            type="button"
            onClick={() => setDocaiOpen((current) => !current)}
            className={cn(
              'fixed bottom-24 right-4 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full shadow-[0_4px_16px_rgba(124,58,237,0.22),0_16px_48px_rgba(124,58,237,0.16)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(124,58,237,0.28),0_20px_56px_rgba(124,58,237,0.20)] lg:bottom-5',
              docaiOpen
                ? 'border border-violet-500 bg-gradient-to-br from-violet-500 to-violet-600 text-white'
                : darkMode
                  ? 'border border-violet-400/20 bg-[#0c0c10]/90 text-violet-300 backdrop-blur-2xl'
                  : 'border border-violet-200/80 bg-white text-violet-600 backdrop-blur-xl',
            )}
            aria-label="Toggle Docai"
          >
            <Bot className="h-5 w-5" />
          </button>

          {docaiOpen ? (
            <>
              <div className="fixed inset-0 z-40 bg-slate-950/20 backdrop-blur-[1px] sm:hidden" onClick={() => setDocaiOpen(false)} />
              <div
                className={cn(
                  'fixed inset-x-2 top-3 bottom-[5.8rem] z-50 flex min-h-0 flex-col overflow-hidden rounded-[2rem] border shadow-[0_4px_16px_rgba(15,23,42,0.06),0_16px_48px_rgba(15,23,42,0.12),0_40px_96px_rgba(15,23,42,0.10)] backdrop-blur-2xl sm:inset-x-auto sm:top-auto sm:bottom-24 sm:left-auto sm:right-4 sm:h-[min(46rem,calc(100vh-6.5rem))] sm:w-[min(34rem,calc(100vw-2rem))] sm:rounded-[2rem]',
                  darkMode ? 'border-violet-400/[0.08] bg-[#050507]/96 text-white' : 'border-slate-200/80 bg-white/98 text-slate-950',
                )}
              >
                {/* Header */}
                <div className={cn('shrink-0 border-b px-5 pb-4 pt-5', darkMode ? 'border-white/[0.05]' : 'border-slate-100')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.875rem] bg-gradient-to-br from-violet-500 to-violet-600 shadow-[0_4px_12px_rgba(124,58,237,0.30)]">
                        <Bot className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className={cn('text-base font-semibold tracking-[-0.03em]', darkMode ? 'text-white' : 'text-slate-900')}>Docai</h3>
                          <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Live
                          </span>
                        </div>
                        <p className={cn('text-xs', darkMode ? 'text-slate-400' : 'text-slate-500')}>AI drafting & document agent</p>
                      </div>
                    </div>
                    <Button type="button" size="icon" variant="ghost"
                      className={cn('h-9 w-9 shrink-0 rounded-xl', darkMode ? 'text-slate-400 hover:bg-white/[0.06] hover:text-white' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700')}
                      onClick={() => setDocaiOpen(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Control section tabs */}
                  <div className={cn('mt-4 grid grid-cols-3 gap-1 rounded-[0.95rem] p-1', darkMode ? 'bg-white/[0.04]' : 'bg-slate-100/80')}>
                    {[
                      { id: 'quick' as const, label: 'Actions' },
                      { id: 'format' as const, label: 'Format' },
                      { id: 'theme' as const, label: 'Themes' },
                    ].map((section) => (
                      <button key={section.id} type="button"
                        onClick={() => setDocaiControlSection(section.id)}
                        className={cn(
                          'rounded-[0.75rem] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition',
                          docaiControlSection === section.id
                            ? darkMode ? 'bg-violet-500/20 text-violet-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]' : 'bg-white text-slate-800 shadow-[0_1px_4px_rgba(15,23,42,0.08)]'
                            : darkMode ? 'text-slate-400 hover:text-slate-300' : 'text-slate-500 hover:text-slate-700',
                        )}>
                        {section.label}
                      </button>
                    ))}
                  </div>

                  {/* Quick action chips */}
                  <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {docaiControlSection === 'quick' ? docaiQuickActions.map((action) => (
                      <button key={action.label} type="button"
                        onClick={() => void sendDocaiMessage(action.mode, action.prompt)}
                        className={cn('shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition', darkMode ? 'border-violet-400/15 bg-violet-500/[0.08] text-violet-300 hover:bg-violet-500/[0.14]' : 'border-violet-100 bg-violet-50 text-violet-700 hover:bg-violet-100')}>
                        {action.label}
                      </button>
                    )) : null}
                    {docaiControlSection === 'format' ? docaiFormatActions.map((action) => (
                      <button key={action.mode} type="button"
                        onClick={() => void sendDocaiMessage(action.mode)}
                        className={cn('shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition', darkMode ? 'border-sky-400/15 bg-sky-500/[0.08] text-sky-300 hover:bg-sky-500/[0.14]' : 'border-sky-100 bg-sky-50 text-sky-700 hover:bg-sky-100')}>
                        {action.label}
                      </button>
                    )) : null}
                    {docaiControlSection === 'theme' ? docaiThemeActions.map((action) => (
                      <button key={action.mode} type="button"
                        onClick={() => void sendDocaiMessage(action.mode)}
                        className={cn('shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition', darkMode ? 'border-amber-400/15 bg-amber-500/[0.08] text-amber-300 hover:bg-amber-500/[0.14]' : 'border-amber-100 bg-amber-50 text-amber-700 hover:bg-amber-100')}>
                        {action.label}
                      </button>
                    )) : null}
                  </div>
                </div>

                {/* Message feed */}
                <div className={cn('min-h-0 flex-1 overflow-y-auto px-4 py-4', darkMode ? 'bg-black/[0.12]' : 'bg-[#f7f9fd]')}>
                  <div className="space-y-3">
                    {docaiMessages.map((message) => (
                      <div key={message.id} className={cn('flex gap-2.5', message.role === 'user' ? 'justify-end' : 'justify-start')}>
                        {message.role === 'assistant' ? (
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-violet-600 shadow-[0_2px_8px_rgba(124,58,237,0.25)] mt-0.5">
                            <Bot className="h-3.5 w-3.5 text-white" />
                          </div>
                        ) : null}
                        <div className={cn(
                          'max-w-[85%] rounded-[1.15rem] px-4 py-3 text-sm leading-relaxed',
                          message.role === 'user'
                            ? 'rounded-tr-md bg-gradient-to-br from-violet-600 to-violet-700 text-white shadow-[0_2px_12px_rgba(124,58,237,0.28)]'
                            : darkMode
                              ? 'rounded-tl-md border border-white/[0.07] bg-white/[0.04] text-slate-200'
                              : 'rounded-tl-md border border-slate-200/80 bg-white text-slate-700 shadow-[0_1px_6px_rgba(15,23,42,0.06)]',
                        )}>
                          <p className="whitespace-pre-wrap">{message.text}</p>
                          {message.role === 'assistant' && message.mode === 'proofread' ? (
                            <p className={cn('mt-2 text-[10px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-sky-400' : 'text-sky-600')}>
                              Review suggestions
                            </p>
                          ) : null}
                          {message.role === 'assistant' && message.canApply ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button type="button" size="sm"
                                className="h-8 rounded-xl bg-violet-600 text-white hover:bg-violet-700"
                                onClick={() => applyDocaiMessageToDocument(message)}>
                                Apply to doc
                              </Button>
                              <Button type="button" size="sm" variant="outline"
                                className={cn('h-8 rounded-xl', darkMode ? 'border-white/[0.08] bg-white/[0.04] text-white hover:bg-white/[0.08]' : 'border-slate-200 bg-white text-slate-700')}
                                onClick={() => setDocaiInput(message.text)}>
                                Use in chat
                              </Button>
                            </div>
                          ) : null}
                        </div>
                        {message.role === 'user' ? (
                          <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold mt-0.5', darkMode ? 'bg-white/[0.08] text-slate-200' : 'bg-slate-200 text-slate-600')}>
                            Y
                          </div>
                        ) : null}
                      </div>
                    ))}

                    {/* Typing indicator */}
                    {docaiLoading ? (
                      <div className="flex items-end gap-2.5">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-violet-600 shadow-[0_2px_8px_rgba(124,58,237,0.25)]">
                          <Bot className="h-3.5 w-3.5 text-white" />
                        </div>
                        <div className={cn('flex items-center gap-1.5 rounded-[1.15rem] rounded-tl-md px-4 py-3.5', darkMode ? 'border border-white/[0.07] bg-white/[0.04]' : 'border border-slate-200/80 bg-white shadow-[0_1px_6px_rgba(15,23,42,0.06)]')}>
                          {[0, 200, 400].map((delay) => (
                            <span key={delay} className="h-2 w-2 animate-bounce rounded-full bg-violet-400" style={{ animationDelay: `${delay}ms`, animationDuration: '1.1s' }} />
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Input area */}
                <div className={cn('shrink-0 border-t px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3', darkMode ? 'border-white/[0.05] bg-[#050507]/90' : 'border-slate-100 bg-white')}>
                  <Textarea
                    value={docaiInput}
                    onChange={(e) => setDocaiInput(e.target.value)}
                    placeholder="Draft, review, format, add header/footer/watermark..."
                    rows={3}
                    className={cn('resize-none rounded-[1.1rem] border text-sm', darkMode ? 'border-white/[0.08] bg-white/[0.04] text-white placeholder:text-slate-500 focus-visible:border-violet-400/30' : 'border-slate-200 bg-slate-50/60 text-slate-900 placeholder:text-slate-400 focus-visible:border-violet-300 focus-visible:bg-white')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        if (!docaiLoading && docaiInput.trim()) void sendDocaiMessage('generate');
                      }
                    }}
                  />
                  <div className="mt-2.5 grid grid-cols-[1fr_auto] gap-2">
                    <div className="flex gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {[
                        { label: 'Reply', mode: 'reply' as const },
                        { label: 'Review', mode: 'proofread' as const },
                        { label: 'Header', mode: 'header' as const },
                        { label: 'Footer', mode: 'footer' as const },
                        { label: 'Watermark', mode: 'watermark' as const },
                      ].map(({ label, mode }) => (
                        <button key={mode} type="button"
                          disabled={docaiLoading || !docaiInput.trim()}
                          onClick={() => void sendDocaiMessage(mode, docaiInput)}
                          className={cn('shrink-0 rounded-xl border px-3 py-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40', darkMode ? 'border-white/[0.07] bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <Button type="button"
                      className="h-9 shrink-0 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 px-4 text-sm text-white shadow-[0_2px_10px_rgba(124,58,237,0.28)] hover:from-violet-600 hover:to-violet-700 disabled:opacity-50"
                      disabled={docaiLoading || !docaiInput.trim()}
                      onClick={() => void sendDocaiMessage('generate')}>
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                      Draft
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </>
      ) : null}

      {currentDocument && !docaiOpen ? (
        <div className={cn('fixed bottom-3 left-1/2 z-30 w-[min(calc(100vw-1.25rem),44rem)] -translate-x-1/2 rounded-[1.5rem] border p-2.5 shadow-[0_18px_44px_rgba(15,23,42,0.16)] backdrop-blur-2xl lg:hidden', darkMode ? 'border-white/[0.04] bg-[#050505]/78' : 'border-white/90 bg-white/94')}>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Button type="button" variant="outline" className={cn(mobileDockButtonClass, folderLauncherOpen ? mobileDockActiveButtonClass : '')} onClick={() => setFolderLauncherOpen((current) => !current)}>
              <FolderOpen className="mr-2 h-4 w-4" />
              Files
            </Button>
            <Button type="button" variant="outline" className={mobileDockButtonClass} onClick={() => insertBlockAfter(currentDocument.blocks.length - 1)}>
              <Plus className="mr-2 h-4 w-4" />
              Block
            </Button>
            <Button
              type="button"
              variant="outline"
              className={cn(mobileDockButtonClass, mobileToolsOpen ? mobileDockActiveButtonClass : '')}
              onClick={() => setMobileToolsOpen(true)}
            >
              <Wand2 className="mr-2 h-4 w-4" />
              Tools
            </Button>
            <Button type="button" variant="outline" className={mobileDockButtonClass} onClick={() => { setShareTab('link'); setShareDialogOpen(true); }}>
              <Share2 className="mr-2 h-4 w-4" />
              Share
            </Button>
            <Button type="button" variant="outline" className={cn(mobileDockButtonClass, mobilePreviewOpen ? mobileDockActiveButtonClass : '')} onClick={() => openPreviewForDocument()}>
              <Eye className="mr-2 h-4 w-4" />
              Preview
            </Button>
            <Button type="button" variant="outline" className={mobileDockButtonClass} onClick={() => setShowCommandPalette(true)}>
              <Sparkles className="mr-2 h-4 w-4" />
              Command
            </Button>
          </div>
        </div>
      ) : null}

      {currentDocument && mobileToolsOpen ? (
        <div className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden" onClick={() => setMobileToolsOpen(false)}>
          <div
            className={cn('absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-[1.8rem] border-t p-4', darkMode ? 'border-white/[0.04] bg-[#050505]/96 backdrop-blur-2xl' : 'border-slate-200 bg-[#fbfdff]')}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-slate-300/70" />
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-sky-500">Editing tools</p>
                <h3 className={cn('mt-1 text-lg font-semibold tracking-[-0.03em]', darkMode ? 'text-white' : 'text-slate-950')}>Write, format, share</h3>
              </div>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className={cn('h-10 w-10 rounded-2xl', darkMode ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white')}
                onClick={() => setMobileToolsOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-4 space-y-4">
              <div className={cn('rounded-[1.25rem] border p-3', darkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-white')}>
                <p className={cn('text-sm font-semibold', darkMode ? 'text-white' : 'text-slate-900')}>Formatting</p>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  <Button type="button" variant="outline" className={mobileToolIconButtonClass} onClick={() => runEditorCommandAndSync('bold')}><Bold /><span>Bold</span></Button>
                  <Button type="button" variant="outline" className={mobileToolIconButtonClass} onClick={() => runEditorCommandAndSync('italic')}><Italic /><span>Italic</span></Button>
                  <Button type="button" variant="outline" className={mobileToolIconButtonClass} onClick={() => runEditorCommandAndSync('underline')}><Underline /><span>Underline</span></Button>
                  <Button type="button" variant="outline" className={mobileToolIconButtonClass} onClick={insertLink}><Link2 /><span>Link</span></Button>
                  <Button type="button" variant="outline" className={mobileToolIconButtonClass} onClick={() => runEditorCommandAndSync('insertUnorderedList')}><List /><span>Bullets</span></Button>
                  <Button type="button" variant="outline" className={mobileToolIconButtonClass} onClick={() => runEditorCommandAndSync('insertOrderedList')}><ListOrdered /><span>Numbered</span></Button>
                  <Button type="button" variant="outline" className={mobileToolIconButtonClass} onClick={() => runEditorCommandAndSync('justifyLeft')}><AlignLeft /><span>Left</span></Button>
                  <Button type="button" variant="outline" className={mobileToolIconButtonClass} onClick={() => runEditorCommandAndSync('justifyCenter')}><AlignCenter /><span>Center</span></Button>
                  <Button type="button" variant="outline" className={mobileToolIconButtonClass} onClick={() => runEditorCommandAndSync('justifyRight')}><AlignRight /><span>Right</span></Button>
                  <Button type="button" variant="outline" className={mobileToolIconButtonClass} onClick={() => activeBlock && applySlashOption(activeBlock.id, 'paragraph')}><Type /><span>Normal</span></Button>
                  <Button type="button" variant="outline" className={mobileToolIconButtonClass} onClick={() => activeBlock && applySlashOption(activeBlock.id, 'heading-1')}><Heading1 /><span>H1</span></Button>
                  <Button type="button" variant="outline" className={mobileToolIconButtonClass} onClick={() => activeBlock && applySlashOption(activeBlock.id, 'heading-2')}><Heading2 /><span>H2</span></Button>
                </div>
                <div className="mt-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className={cn('text-xs font-medium', darkMode ? 'text-slate-300' : 'text-slate-500')}>Font</span>
                    <select
                      value={editorFontFamily}
                      onChange={(event) => {
                        const next = event.target.value as (typeof fontFamilies)[number];
                        applySelectionFontFamily(next);
                      }}
                      className={cn('h-10 min-w-0 flex-1 rounded-xl border px-3 text-sm outline-none', darkMode ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white text-slate-700')}
                    >
                      {fontFamilies.map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn('text-xs font-medium', darkMode ? 'text-slate-300' : 'text-slate-500')}>Size</span>
                    <Button type="button" variant="outline" className={mobileToolStepperButtonClass} onMouseDown={(event) => event.preventDefault()} onClick={() => adjustFontSize(-1)}>
                      <Minus />
                    </Button>
                    <input
                      value={editorFontSize}
                      onChange={(event) => {
                        const next = event.target.value.replace(/[^\d]/g, '').slice(0, 2);
                        setEditorFontSize(next || '11');
                      }}
                      onBlur={() => applySelectionFontSize(editorFontSize)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          applySelectionFontSize(editorFontSize);
                        }
                      }}
                      className={cn('h-10 w-16 rounded-xl border bg-transparent px-3 text-sm outline-none', darkMode ? 'border-white/10 text-white' : 'border-slate-200 text-slate-700')}
                    />
                    <Button type="button" variant="outline" className={mobileToolStepperButtonClass} onMouseDown={(event) => event.preventDefault()} onClick={() => adjustFontSize(1)}>
                      <Plus />
                    </Button>
                    <select
                      value={editorLineSpacing}
                      onChange={(event) => applyLineSpacing(event.target.value as (typeof lineSpacingLevels)[number]['value'])}
                      className={cn('h-10 min-w-0 flex-1 rounded-xl border px-3 text-sm outline-none', darkMode ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white text-slate-700')}
                    >
                      {lineSpacingLevels.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn('text-xs font-medium', darkMode ? 'text-slate-300' : 'text-slate-500')}>Theme</span>
                    <select
                      value={activeDocumentTheme}
                      onChange={(event) => currentDocument && updateCurrentDocument({ documentTheme: event.target.value as DocWordDocument['documentTheme'] })}
                      className={cn('h-10 min-w-0 flex-1 rounded-xl border px-3 text-sm outline-none', darkMode ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white text-slate-700')}
                    >
                      {documentThemes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className={cn('flex h-11 items-center justify-between rounded-xl border px-3', darkMode ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white text-slate-700')}>
                    <span className="text-sm">Text color</span>
                    <input
                      type="color"
                      value={textColor}
                      onChange={(event) => {
                        setTextColor(event.target.value);
                        applySelectionStyle({ color: event.target.value });
                      }}
                      className="h-6 w-8 rounded border-0 bg-transparent p-0"
                    />
                  </label>
                  <label className={cn('flex h-11 items-center justify-between rounded-xl border px-3', darkMode ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white text-slate-700')}>
                    <span className="text-sm">Highlight</span>
                    <input
                      type="color"
                      value={highlightColor}
                      onChange={(event) => {
                        setHighlightColor(event.target.value);
                        applySelectionStyle({ 'background-color': event.target.value });
                      }}
                      className="h-6 w-8 rounded border-0 bg-transparent p-0"
                    />
                  </label>
                </div>
              </div>

              <div className={cn('rounded-[1.25rem] border p-3', darkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-white')}>
                <p className={cn('text-sm font-semibold', darkMode ? 'text-white' : 'text-slate-900')}>Insert</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" className={cn(mobileToolActionButtonClass, 'justify-start')} onClick={() => activeBlock && applySlashOption(activeBlock.id, 'heading-1')}><Heading1 className="mr-2 h-4 w-4" />Heading</Button>
                  <Button type="button" variant="outline" className={cn(mobileToolActionButtonClass, 'justify-start')} onClick={() => activeBlock && applySlashOption(activeBlock.id, 'heading-2')}><Heading2 className="mr-2 h-4 w-4" />Subheading</Button>
                  <Button type="button" variant="outline" className={cn(mobileToolActionButtonClass, 'justify-start')} onClick={() => insertRichBlock('quote')}><Quote className="mr-2 h-4 w-4" />Quote</Button>
                  <Button type="button" variant="outline" className={cn(mobileToolActionButtonClass, 'justify-start')} onClick={() => insertRichBlock('callout')}><LayoutTemplate className="mr-2 h-4 w-4" />Callout</Button>
                  <Button type="button" variant="outline" className={cn(mobileToolActionButtonClass, 'justify-start')} onClick={() => insertRichBlock('table')}><Table2 className="mr-2 h-4 w-4" />Table</Button>
                  <Button type="button" variant="outline" className={cn(mobileToolActionButtonClass, 'justify-start')} onClick={() => insertRichBlock('image')}><ImageIcon className="mr-2 h-4 w-4" />Image</Button>
                  <Button type="button" variant="outline" className={cn(mobileToolActionButtonClass, 'justify-start')} onClick={() => setShowTemplates(true)}><LayoutTemplate className="mr-2 h-4 w-4" />Templates</Button>
                </div>
              </div>

              <div className={cn('rounded-[1.25rem] border p-3', darkMode ? 'border-sky-400/10 bg-sky-500/[0.05]' : 'border-sky-100 bg-sky-50/80')}>
                <p className={cn('text-sm font-semibold', darkMode ? 'text-white' : 'text-slate-900')}>AI and review</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" className={cn(mobileToolActionButtonClass, 'justify-start')} onClick={() => void runAiAction('fix')} disabled={aiLoading}>
                    {aiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                    Improve
                  </Button>
                  <Button type="button" variant="outline" className={cn(mobileToolActionButtonClass, 'justify-start')} onClick={() => void runProofreader(activeProofreader)}>
                    <Bot className="mr-2 h-4 w-4" />
                    Reviewers
                  </Button>
                  <Button type="button" variant="outline" className={cn(mobileToolActionButtonClass, 'justify-start')} onClick={() => { setShowCommandPalette(true); setMobileToolsOpen(false); }}>
                    <Bot className="mr-2 h-4 w-4" />
                    AI actions
                  </Button>
                  <Button type="button" variant="outline" className={cn(mobileToolActionButtonClass, 'justify-start', suggestionMode ? 'border-sky-600 bg-sky-600 text-white hover:bg-sky-700' : '')} onClick={() => setSuggestionMode((current) => !current)}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Suggestions
                  </Button>
                  <Button type="button" variant="outline" className={cn(mobileToolActionButtonClass, 'justify-start')} onClick={() => startVoiceCapture('guided-prompt')}>
                    <Mic className="mr-2 h-4 w-4" />
                    Voice brief
                  </Button>
                  <Button type="button" variant="outline" className={cn(mobileToolActionButtonClass, 'justify-start')} onClick={() => setShowGuidedCreator(true)}>
                    <LayoutTemplate className="mr-2 h-4 w-4" />
                    Guided draft
                  </Button>
                  <Button type="button" variant="outline" className={cn(mobileToolActionButtonClass, 'justify-start')} onClick={() => void duplicateCurrentDocument()}>
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicate
                  </Button>
                  <Button type="button" variant="outline" className={cn(mobileToolActionButtonClass, 'justify-start')} onClick={() => setShowFindReplace((current) => !current)}>
                    <Search className="mr-2 h-4 w-4" />
                    Find
                  </Button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className={cn('rounded-2xl border px-3 py-3 leading-5', darkMode ? 'border-white/10 bg-white/5 text-slate-300' : 'border-slate-200 bg-white text-slate-600')}>
                    AI score: <span className="font-semibold">{documentScore.score}</span>
                  </div>
                  <div className={cn('rounded-2xl border px-3 py-3 leading-5', darkMode ? 'border-white/10 bg-white/5 text-slate-300' : 'border-slate-200 bg-white text-slate-600')}>
                    {currentDocument?.selectionComments?.length || 0} notes, {currentDocument?.trackedChanges?.filter((item) => item.status === 'pending').length || 0} pending changes
                  </div>
                </div>
              </div>

              <div className={cn('rounded-[1.25rem] border p-3', darkMode ? 'border-emerald-400/10 bg-emerald-500/[0.05]' : 'border-emerald-100 bg-emerald-50/80')}>
                <p className={cn('text-sm font-semibold', darkMode ? 'text-white' : 'text-slate-900')}>Secure, share, and setup</p>
                <div className="mt-3 grid gap-2">
                  <Input
                    value={currentDocument?.folderName || ''}
                    onChange={(event) => currentDocument && updateCurrentDocument({ folderName: event.target.value })}
                    placeholder="Folder name"
                    className={cn('h-10 rounded-xl border', darkMode ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white')}
                  />
                  <Input
                    value={currentDocument?.documentLockCode || ''}
                    onChange={(event) => currentDocument && updateCurrentDocument({ documentLockCode: event.target.value })}
                    placeholder="Document lock code"
                    className={cn('h-10 rounded-xl border', darkMode ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white')}
                  />
                  <Input
                    value={currentDocument?.folderLockCode || ''}
                    onChange={(event) => currentDocument && updateCurrentDocument({ folderLockCode: event.target.value })}
                    placeholder="Folder lock code"
                    className={cn('h-10 rounded-xl border', darkMode ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white')}
                  />
                  <Input
                    value={currentDocument?.watermarkText || ''}
                    onChange={(event) => currentDocument && updateCurrentDocument({ watermarkText: event.target.value })}
                    placeholder="Watermark text"
                    className={cn('h-10 rounded-xl border', darkMode ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white')}
                  />
                  <Textarea
                    value={currentDocument?.summary || ''}
                    onChange={(event) => currentDocument && updateCurrentDocument({ summary: event.target.value })}
                    placeholder="Short document summary"
                    className={cn('min-h-[88px] rounded-xl border', darkMode ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white')}
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" className={cn(mobileToolActionButtonClass, 'justify-start')} onClick={() => { setShareTab('link'); setShareDialogOpen(true); setMobileToolsOpen(false); }}>
                    <Share2 className="mr-2 h-4 w-4" />
                    Share
                  </Button>
                  <Button type="button" variant="outline" className={cn(mobileToolActionButtonClass, 'justify-start')} onClick={() => { setShareTab('groups'); setShareDialogOpen(true); setMobileToolsOpen(false); }}>
                    <FolderOpen className="mr-2 h-4 w-4" />
                    Groups
                  </Button>
                  <Button type="button" variant="outline" className={cn(mobileToolActionButtonClass, 'justify-start', currentDocument?.requireSignature ? 'border-amber-500 bg-amber-500 text-slate-950 hover:bg-amber-400' : '')} onClick={() => currentDocument && updateCurrentDocument({ requireSignature: !currentDocument.requireSignature })}>
                    <Lock className="mr-2 h-4 w-4" />
                    Signature-ready
                  </Button>
                  <Button type="button" className="h-11 rounded-2xl bg-slate-950 text-white hover:bg-slate-800" disabled={sendToSignLoading || !currentDocument} onClick={openSignPrepDialog}>
                    {sendToSignLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Share2 className="mr-2 h-4 w-4" />}
                    Send to sign
                  </Button>
                  <Button type="button" variant="outline" className={cn(mobileToolActionButtonClass, 'justify-start', mobilePreviewOpen ? 'border-slate-950 bg-slate-950 text-white hover:bg-slate-900' : '')} onClick={() => { openPreviewForDocument(); setMobileToolsOpen(false); }}>
                    <Eye className="mr-2 h-4 w-4" />
                    Preview document
                  </Button>
                  <Button type="button" variant="outline" className={cn(mobileToolActionButtonClass, 'justify-start')} onClick={() => void exportDocument('pdf')}>
                    <FileDown className="mr-2 h-4 w-4" />
                    Export PDF
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog open={signPrepDialogOpen} onOpenChange={setSignPrepDialogOpen}>
        <DialogContent className={cn('max-h-[92vh] w-[calc(100vw-1rem)] max-w-2xl overflow-y-auto rounded-[1.8rem] border p-0', darkMode ? 'border-white/10 bg-[#081221] text-white' : 'border-white/80 bg-white text-slate-950')}>
          <div className={cn('border-b px-5 py-4', darkMode ? 'border-white/10' : 'border-slate-200')}>
            <DialogHeader>
              <DialogTitle className="text-left text-xl font-semibold tracking-[-0.03em]">Prepare signable share</DialogTitle>
            </DialogHeader>
            <p className={cn('mt-2 text-sm leading-6', darkMode ? 'text-slate-300' : 'text-slate-600')}>
              Choose the final sharing controls before docrud generates the PDF packet and opens the E-sign Documents workspace.
            </p>
          </div>

          <div className="space-y-4 px-5 py-5">
            <div className={cn('rounded-[1.2rem] border p-4', darkMode ? 'border-white/10 bg-[#0d1830]' : 'border-slate-200 bg-slate-50')}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={cn('text-sm font-semibold', darkMode ? 'text-white' : 'text-slate-900')}>Add watermark</p>
                  <p className={cn('mt-1 text-xs leading-5', darkMode ? 'text-slate-300' : 'text-slate-500')}>
                    This watermark will be applied to the generated PDF and carried into the signing flow automatically.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSignPrepWatermarkEnabled((current) => !current)}
                  className={cn(
                    'inline-flex h-8 min-w-[4.25rem] items-center rounded-full border px-1 transition',
                    signPrepWatermarkEnabled
                      ? 'border-slate-950 bg-slate-950 text-white'
                      : darkMode
                        ? 'border-white/10 bg-white/5 text-slate-300'
                        : 'border-slate-200 bg-white text-slate-500',
                  )}
                >
                  <span
                    className={cn(
                      'h-6 w-6 rounded-full bg-white transition',
                      signPrepWatermarkEnabled ? 'translate-x-[1.55rem]' : 'translate-x-0',
                    )}
                  />
                </button>
              </div>
              {signPrepWatermarkEnabled ? (
                <div className="mt-3">
                  <Input
                    value={signPrepWatermarkText}
                    onChange={(event) => setSignPrepWatermarkText(event.target.value)}
                    placeholder="Confidential / Draft / Internal Use Only"
                    className={cn('h-11 rounded-2xl border', darkMode ? 'border-white/10 bg-white/5 text-white placeholder:text-slate-500' : 'border-slate-200 bg-white')}
                  />
                </div>
              ) : null}
            </div>

            <div className={cn('rounded-[1.2rem] border p-4', darkMode ? 'border-white/10 bg-[#0d1830]' : 'border-slate-200 bg-slate-50')}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={cn('text-sm font-semibold', darkMode ? 'text-white' : 'text-slate-900')}>Collect recipient signature</p>
                  <p className={cn('mt-1 text-xs leading-5', darkMode ? 'text-slate-300' : 'text-slate-500')}>
                    Turn this on when the recipient must sign the shared document from the public signing page.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSignPrepRecipientSignatureRequired((current) => !current)}
                  className={cn(
                    'inline-flex h-8 min-w-[4.25rem] items-center rounded-full border px-1 transition',
                    signPrepRecipientSignatureRequired
                      ? 'border-slate-950 bg-slate-950 text-white'
                      : darkMode
                        ? 'border-white/10 bg-white/5 text-slate-300'
                        : 'border-slate-200 bg-white text-slate-500',
                  )}
                >
                  <span
                    className={cn(
                      'h-6 w-6 rounded-full bg-white transition',
                      signPrepRecipientSignatureRequired ? 'translate-x-[1.55rem]' : 'translate-x-0',
                    )}
                  />
                </button>
              </div>
            </div>

            <div className={cn('rounded-[1.2rem] border p-4', darkMode ? 'border-white/10 bg-[#0d1830]' : 'border-slate-200 bg-slate-50')}>
              <p className={cn('text-sm font-semibold', darkMode ? 'text-white' : 'text-slate-900')}>What happens next</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {[
                  'Generate the latest PDF from your DocWord draft',
                  'Map watermark and signature rules into E-sign Documents',
                  'Open the signing workspace on the prepared share packet',
                ].map((item) => (
                  <div key={item} className={cn('rounded-2xl border px-3 py-3 text-xs leading-5', darkMode ? 'border-white/10 bg-white/5 text-slate-300' : 'border-slate-200 bg-white text-slate-600')}>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={cn('flex flex-col gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end', darkMode ? 'border-white/10' : 'border-slate-200')}>
            <Button
              type="button"
              variant="outline"
              className={cn('h-10 rounded-2xl', darkMode ? 'border-white/10 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white')}
              onClick={() => setSignPrepDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={sendToSignLoading || !currentDocument}
              className="h-10 rounded-2xl bg-slate-950 text-white hover:bg-slate-800"
              onClick={() => void sendCurrentDocumentToSign()}
            >
              {sendToSignLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Share2 className="mr-2 h-4 w-4" />}
              Create signable share
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={mobilePreviewOpen} onOpenChange={setMobilePreviewOpen}>
        <DialogContent className={cn('max-h-[94vh] w-[calc(100vw-0.75rem)] max-w-4xl overflow-hidden rounded-[1.8rem] border p-0 lg:hidden', darkMode ? 'border-white/[0.04] bg-[#050505]/92 text-white backdrop-blur-2xl' : 'border-white/80 bg-white text-slate-950')}>
          <DialogHeader className={cn('border-b px-4 py-4', darkMode ? 'border-white/[0.04]' : 'border-slate-200')}>
            <DialogTitle className="text-left text-lg font-semibold tracking-[-0.03em]">Document preview</DialogTitle>
            <p className={cn('mt-1 text-sm leading-6', darkMode ? 'text-slate-300' : 'text-slate-500')}>
              Review how the document will look when downloaded.
            </p>
          </DialogHeader>
          <div className={cn('max-h-[calc(94vh-5.5rem)] overflow-y-auto px-3 py-4 sm:px-4', darkMode ? 'bg-black/20' : 'bg-[#eef2f8]')}>
            {previewDocument ? (
              <DocWordPreviewPage
                document={previewDocument}
                darkMode={darkMode}
                editorFontFamily={editorFontFamily}
                editorZoom={editorZoom}
                editorLineSpacing={editorLineSpacing}
                textColor={textColor}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent
          className={cn(
            'max-h-[92vh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] overflow-x-hidden overflow-y-auto rounded-[1.8rem] border p-0',
            shareTab === 'groups' ? 'max-w-6xl' : shareTab === 'directory' ? 'max-w-5xl' : 'max-w-4xl',
            darkMode ? 'border-white/[0.04] bg-[#050505]/82 text-white backdrop-blur-2xl' : 'border-white/80 bg-white text-slate-950',
          )}
        >
          <DialogHeader className={cn('border-b px-5 py-4', darkMode ? 'border-white/[0.04]' : 'border-slate-200')}>
            <DialogTitle className="text-left text-xl font-semibold tracking-[-0.03em]">Share this document</DialogTitle>
          </DialogHeader>
          <div
            className={cn(
              'gap-4 p-4 sm:p-5',
              shareTab === 'groups' || shareTab === 'directory' ? 'grid grid-cols-1' : 'grid md:grid-cols-[minmax(0,1.35fr)_300px]',
            )}
          >
            <div className={cn('space-y-4', shareTab === 'groups' || shareTab === 'directory' ? 'order-1' : 'order-2 md:order-1')}>
              <div className={cn('rounded-[1.3rem] border p-2', darkMode ? 'border-white/[0.04] bg-white/[0.03] backdrop-blur-xl' : 'border-slate-200 bg-slate-50')}>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { id: 'link', label: 'Links' },
                    { id: 'groups', label: 'Groups' },
                    { id: 'directory', label: 'Directory' },
                    { id: 'sign', label: 'Sign flow' },
                  ].map((tab) => (
                    <Button
                      key={tab.id}
                      type="button"
                      variant="outline"
                      className={cn(
                        'h-10 rounded-2xl',
                        shareTab === tab.id && tab.id === 'link'
                          ? 'border-sky-600 bg-sky-600 text-white hover:bg-sky-700'
                          : shareTab === tab.id && tab.id === 'groups'
                            ? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700'
                            : shareTab === tab.id && tab.id === 'sign'
                              ? 'border-amber-500 bg-amber-500 text-slate-950 hover:bg-amber-400'
                              : shareTab === tab.id && tab.id === 'directory'
                                ? 'border-violet-600 bg-violet-600 text-white hover:bg-violet-700'
                          : darkMode
                            ? 'border-white/[0.04] bg-transparent text-white hover:bg-white/[0.05]'
                            : 'border-slate-200 bg-white text-slate-700',
                      )}
                      onClick={() => setShareTab(tab.id as 'link' | 'groups' | 'directory' | 'sign')}
                    >
                      {tab.label}
                    </Button>
                  ))}
                </div>
              </div>

              {shareTab === 'link' ? (
              <>
              <div className={cn('rounded-[1.3rem] border p-4', darkMode ? 'border-sky-400/10 bg-sky-500/[0.04] backdrop-blur-xl' : 'border-sky-100 bg-sky-50/70')}>
                <p className="text-sm font-semibold">Choose a share mode</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Button type="button" className="h-11 rounded-2xl bg-sky-600 text-white hover:bg-sky-700" onClick={() => void configureShare('public')} disabled={sharePresetLoading}>
                    {sharePresetLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Share2 className="mr-2 h-4 w-4" />}
                    Public link
                  </Button>
                  <Button type="button" variant="outline" className={cn('h-11 rounded-2xl', darkMode ? 'border-emerald-400/15 bg-emerald-500/[0.08] text-emerald-100 backdrop-blur-xl hover:bg-emerald-500/[0.14]' : 'border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100')} onClick={() => void configureShare('secure')} disabled={sharePresetLoading}>
                    <Lock className="mr-2 h-4 w-4" />
                    Secure link
                  </Button>
                </div>
                <p className={cn('mt-3 text-xs leading-5', darkMode ? 'text-slate-300' : 'text-slate-500')}>
                  Public link opens instantly. Secure link uses an auto-generated password before the document opens.
                </p>
              </div>

              <div className={cn('rounded-[1.3rem] border p-4', darkMode ? 'border-emerald-400/10 bg-emerald-500/[0.04] backdrop-blur-xl' : 'border-emerald-100 bg-emerald-50/60')}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">Permissions</p>
                  {shareLoading ? <Loader2 className="h-4 w-4 animate-spin text-sky-500" /> : null}
                </div>
                <div className="mt-3 grid gap-2">
                  {shareRoleOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => void updateShareMode(option.value)}
                      className={cn(
                        'rounded-[1rem] border px-3 py-3 text-left transition',
                        currentDocument?.shareMode === option.value && option.value === 'private'
                          ? 'border-amber-500 bg-amber-500 text-slate-950'
                          : currentDocument?.shareMode === option.value && option.value === 'read'
                            ? 'border-sky-600 bg-sky-600 text-white'
                            : currentDocument?.shareMode === option.value && option.value === 'write'
                              ? 'border-emerald-600 bg-emerald-600 text-white'
                          : darkMode
                            ? 'border-white/[0.04] bg-white/[0.03] text-slate-200 backdrop-blur-xl hover:bg-white/[0.06]'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100',
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold">{option.label}</p>
                        {currentDocument?.shareMode === option.value ? <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">Active</span> : null}
                      </div>
                      <p className={cn('mt-1 text-xs leading-5', currentDocument?.shareMode === option.value ? 'text-white/80' : darkMode ? 'text-slate-400' : 'text-slate-500')}>
                        {option.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              </>
              ) : null}

              {shareTab === 'groups' ? (
              <div className={cn('rounded-[1.3rem] border p-4', darkMode ? 'border-emerald-400/10 bg-emerald-500/[0.04] backdrop-blur-xl' : 'border-emerald-100 bg-emerald-50/60')}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Collaboration groups</p>
                    <p className={cn('mt-1 text-xs leading-5', darkMode ? 'text-slate-300' : 'text-slate-500')}>
                      Groups secure this document automatically. Members open it with their assigned DocWord IDs, and invite links let people create their own credentials.
                    </p>
                  </div>
                  <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]', darkMode ? 'bg-emerald-500/[0.10] text-emerald-100 backdrop-blur-xl' : 'bg-white text-emerald-700')}>
                    {collaborationGroups.length} groups
                  </span>
                </div>
                <div className={cn('mt-4 rounded-[1.2rem] border p-4', darkMode ? 'border-white/[0.04] bg-white/[0.03] backdrop-blur-xl' : 'border-slate-200 bg-white')}>
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
                    <div className="grid flex-1 gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)_280px]">
                      <Input
                        value={groupNameDraft}
                        onChange={(event) => setGroupNameDraft(event.target.value)}
                        placeholder="Group name"
                        className={cn('h-11 rounded-2xl border', darkMode ? 'border-white/[0.04] bg-black/24 text-white backdrop-blur-xl' : 'border-slate-200 bg-slate-50')}
                      />
                      <Input
                        value={groupDescriptionDraft}
                        onChange={(event) => setGroupDescriptionDraft(event.target.value)}
                        placeholder="Optional note"
                        className={cn('h-11 rounded-2xl border', darkMode ? 'border-white/[0.04] bg-black/24 text-white backdrop-blur-xl' : 'border-slate-200 bg-slate-50')}
                      />
                      <select
                        value={groupInvitePermissionDraft}
                        onChange={(event) => setGroupInvitePermissionDraft(event.target.value as 'read' | 'write')}
                        className={cn('h-11 rounded-2xl border px-3 text-sm outline-none', darkMode ? 'border-white/[0.04] bg-black/24 text-white backdrop-blur-xl' : 'border-slate-200 bg-slate-50 text-slate-700')}
                      >
                        <option value="read">Invite gives read access</option>
                        <option value="write">Invite gives write access</option>
                      </select>
                    </div>
                    <Button type="button" className="h-11 rounded-2xl bg-slate-950 px-5 text-white hover:bg-slate-800 xl:min-w-[160px]" onClick={createAccessGroup} disabled={!groupNameDraft.trim()}>
                      Create group
                    </Button>
                  </div>
                </div>

                {collaborationGroupLinks.length ? (
                  <div className="mt-4 space-y-3">
                    {collaborationGroupLinks.map((group) => (
                      <div key={group.id} className={cn('rounded-[1.25rem] border p-4', darkMode ? 'border-white/[0.04] bg-white/[0.03] backdrop-blur-xl' : 'border-slate-200 bg-white')}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className={cn('text-sm font-semibold', darkMode ? 'text-white' : 'text-slate-900')}>{group.name}</p>
                            {group.description ? <p className={cn('mt-1 text-xs leading-5', darkMode ? 'text-slate-300' : 'text-slate-500')}>{group.description}</p> : null}
                            <p className={cn('mt-1 text-[11px] uppercase tracking-[0.18em]', darkMode ? 'text-sky-300' : 'text-sky-600')}>
                              Invite default: {group.invitePermission === 'write' ? 'Can edit' : 'Read only'}
                            </p>
                          </div>
                          <Button type="button" variant="outline" className={cn('h-8 rounded-xl', darkMode ? 'border-white/[0.04] bg-black/24 text-white backdrop-blur-xl hover:bg-black/40' : 'border-slate-200 bg-white')} onClick={() => removeAccessGroup(group.id)}>
                            Remove
                          </Button>
                        </div>
                        <div className="mt-3 flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className={cn(
                              'h-9 rounded-2xl',
                              (groupPanelTab[group.id] || 'access') === 'access'
                                ? 'border-slate-950 bg-slate-950 text-white hover:bg-slate-900'
                                : darkMode
                                  ? 'border-white/[0.04] bg-black/24 text-white backdrop-blur-xl hover:bg-black/40'
                                  : 'border-slate-200 bg-white text-slate-700',
                            )}
                            onClick={() => setGroupPanelTab((current) => ({ ...current, [group.id]: 'access' }))}
                          >
                            Access
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className={cn(
                              'h-9 rounded-2xl',
                              (groupPanelTab[group.id] || 'access') === 'members'
                                ? 'border-slate-950 bg-slate-950 text-white hover:bg-slate-900'
                                : darkMode
                                  ? 'border-white/[0.04] bg-black/24 text-white backdrop-blur-xl hover:bg-black/40'
                                  : 'border-slate-200 bg-white text-slate-700',
                            )}
                            onClick={() => setGroupPanelTab((current) => ({ ...current, [group.id]: 'members' }))}
                          >
                            Members
                          </Button>
                        </div>
                        {(groupPanelTab[group.id] || 'access') === 'access' ? (
                        <div className="mt-4 grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1.25fr)_auto] xl:items-end">
                          <div className={cn('rounded-[1rem] border p-3', darkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50')}>
                            <p className={cn('text-[10px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>Group access URL</p>
                            <Input value={group.accessUrl} readOnly className={cn('mt-2 h-10 rounded-2xl border', darkMode ? 'border-white/10 bg-[#081221] text-white' : 'border-slate-200 bg-white')} placeholder="Group access URL" />
                          </div>
                          <div className={cn('rounded-[1rem] border p-3', darkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50')}>
                            <p className={cn('text-[10px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>Invite URL</p>
                            <Input value={group.inviteUrl} readOnly className={cn('mt-2 h-10 rounded-2xl border', darkMode ? 'border-white/10 bg-[#081221] text-white' : 'border-slate-200 bg-white')} placeholder="Group invite URL" />
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[260px] xl:grid-cols-1">
                            <Button type="button" variant="outline" className={cn('h-10 rounded-2xl', darkMode ? 'border-white/10 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white')} onClick={() => void copyGroupAccessDetails(group.id, 'access')}>
                              <Copy className="mr-2 h-4 w-4" />
                              Copy access URL
                            </Button>
                            <Button type="button" variant="outline" className={cn('h-10 rounded-2xl', darkMode ? 'border-white/10 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white')} onClick={() => void copyGroupAccessDetails(group.id, 'invite')}>
                              <Copy className="mr-2 h-4 w-4" />
                              Copy invite URL
                            </Button>
                          </div>
                        </div>
                        ) : null}
                        {(groupPanelTab[group.id] || 'access') === 'members' ? (
                        <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-[320px_minmax(0,1fr)] xl:items-start">
                          <div className={cn('grid gap-2 rounded-[1rem] border p-3', darkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50')}>
                            <div className="flex items-center justify-between gap-3">
                              <p className={cn('text-xs font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-300' : 'text-slate-500')}>
                                Add member
                              </p>
                              <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]', darkMode ? 'bg-white/8 text-slate-300' : 'bg-white text-slate-500')}>
                                {group.members?.length || 0} users
                              </span>
                            </div>
                            <Input
                              value={memberDraft.groupId === group.id ? memberDraft.userId : ''}
                              onChange={(event) => setMemberDraft({ ...memberDraft, groupId: group.id, userId: event.target.value })}
                              placeholder="Member user ID"
                              className={cn('h-10 rounded-2xl border', darkMode ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white')}
                            />
                            <Input
                              value={memberDraft.groupId === group.id ? memberDraft.name : ''}
                              onChange={(event) => setMemberDraft({ ...memberDraft, groupId: group.id, name: event.target.value })}
                              placeholder="Display name"
                              className={cn('h-10 rounded-2xl border', darkMode ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white')}
                            />
                            <Input
                              value={memberDraft.groupId === group.id ? memberDraft.password : ''}
                              onChange={(event) => setMemberDraft({ ...memberDraft, groupId: group.id, password: event.target.value })}
                              placeholder="Password"
                              className={cn('h-10 rounded-2xl border', darkMode ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white')}
                            />
                            <select
                              value={memberDraft.groupId === group.id ? memberDraft.permission : 'read'}
                              onChange={(event) => setMemberDraft({ ...memberDraft, groupId: group.id, permission: event.target.value as 'read' | 'write' })}
                              className={cn('h-10 rounded-2xl border px-3 text-sm outline-none', darkMode ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white text-slate-700')}
                            >
                              <option value="read">Read access</option>
                              <option value="write">Write access</option>
                            </select>
                            <Button type="button" variant="outline" className={cn('h-10 rounded-2xl', darkMode ? 'border-white/10 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white')} onClick={addMemberToGroup}>
                              Add member
                            </Button>
                          </div>
                          <div className={cn('min-w-0 overflow-hidden rounded-[1.2rem] border', darkMode ? 'border-white/10 bg-[#0d1830]' : 'border-slate-200 bg-white')}>
                            <div className={cn('border-b px-4 py-4', darkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50')}>
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className={cn('text-xs font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-300' : 'text-slate-500')}>
                                    Group members
                                  </p>
                                  <p className={cn('mt-1 text-sm font-semibold', darkMode ? 'text-white' : 'text-slate-900')}>
                                    Direct access identities for {group.name}
                                  </p>
                                  <p className={cn('mt-1 text-xs leading-5', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                                    Manage who can open this document directly with assigned credentials and defined permissions.
                                  </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <span className={cn('rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]', darkMode ? 'bg-white/8 text-slate-300' : 'bg-white text-slate-500')}>
                                    {group.members?.length || 0} member{(group.members?.length || 0) === 1 ? '' : 's'}
                                  </span>
                                  <span className={cn('rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]', darkMode ? 'bg-sky-400/10 text-sky-200' : 'bg-sky-50 text-sky-700')}>
                                    Full CRUD
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="p-4">
                            <div className="flex w-full snap-x snap-mandatory gap-3 overflow-x-auto pb-1 pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            {(group.members || []).length ? (
                              group.members.map((member) => (
                                <div key={member.id} className={cn('min-w-[280px] snap-start sm:min-w-[320px] max-w-[380px] flex-1 rounded-[1.1rem] border px-4 py-4 shadow-[0_12px_32px_rgba(15,23,42,0.05)]', darkMode ? 'border-white/10 bg-[#101a31]' : 'border-slate-200 bg-white')}>
                                  {editingMemberDraft?.groupId === group.id && editingMemberDraft.memberId === member.id ? (
                                    <div className="grid gap-2">
                                      <Input
                                        value={editingMemberDraft.userId}
                                        onChange={(event) => setEditingMemberDraft({ ...editingMemberDraft, userId: event.target.value })}
                                        placeholder="Member user ID"
                                        className={cn('h-10 rounded-2xl border', darkMode ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white')}
                                      />
                                      <Input
                                        value={editingMemberDraft.name}
                                        onChange={(event) => setEditingMemberDraft({ ...editingMemberDraft, name: event.target.value })}
                                        placeholder="Display name"
                                        className={cn('h-10 rounded-2xl border', darkMode ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white')}
                                      />
                                      <Input
                                        value={editingMemberDraft.password}
                                        onChange={(event) => setEditingMemberDraft({ ...editingMemberDraft, password: event.target.value })}
                                        placeholder="Password"
                                        className={cn('h-10 rounded-2xl border', darkMode ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white')}
                                      />
                                      <select
                                        value={editingMemberDraft.permission}
                                        onChange={(event) => setEditingMemberDraft({ ...editingMemberDraft, permission: event.target.value as 'read' | 'write' })}
                                        className={cn('h-10 rounded-2xl border px-3 text-sm outline-none', darkMode ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white text-slate-700')}
                                      >
                                        <option value="read">Read access</option>
                                        <option value="write">Write access</option>
                                      </select>
                                      <div className="grid gap-2 sm:grid-cols-3">
                                        <Button type="button" variant="outline" className={cn('h-10 rounded-2xl', darkMode ? 'border-white/10 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white')} onClick={saveEditedGroupMember}>
                                          Save
                                        </Button>
                                        <Button type="button" variant="outline" className={cn('h-10 rounded-2xl', darkMode ? 'border-white/10 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white')} onClick={() => setEditingMemberDraft(null)}>
                                          Cancel
                                        </Button>
                                        <Button type="button" variant="outline" className={cn('h-10 rounded-2xl', darkMode ? 'border-white/10 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white')} onClick={() => navigator.clipboard.writeText(`User ID: ${editingMemberDraft.userId}\nPassword: ${editingMemberDraft.password}\nPermission: ${editingMemberDraft.permission}`)}>
                                          Copy
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="grid gap-4">
                                      <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <p className={cn('truncate text-sm font-semibold', darkMode ? 'text-white' : 'text-slate-900')}>{member.name || member.userId}</p>
                                          <span
                                            className={cn(
                                              'rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]',
                                              member.permission === 'write'
                                                ? 'bg-emerald-600 text-white'
                                                : darkMode
                                                  ? 'bg-sky-500/12 text-sky-100'
                                                  : 'bg-sky-50 text-sky-700',
                                            )}
                                          >
                                            {member.permission === 'write' ? 'Can edit' : 'Read only'}
                                          </span>
                                        </div>
                                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                          <div className={cn('rounded-2xl border px-3 py-3', darkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50')}>
                                            <p className={cn('text-[10px] font-semibold uppercase tracking-[0.16em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>User ID</p>
                                            <p className={cn('mt-1 break-all text-sm font-medium', darkMode ? 'text-white' : 'text-slate-900')}>{member.userId}</p>
                                          </div>
                                          <div className={cn('rounded-2xl border px-3 py-3', darkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50')}>
                                            <p className={cn('text-[10px] font-semibold uppercase tracking-[0.16em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>Password</p>
                                            <p className={cn('mt-1 break-all text-sm font-medium', darkMode ? 'text-white' : 'text-slate-900')}>{member.password}</p>
                                          </div>
                                        </div>
                                      </div>
                                      <div className="grid gap-2 sm:grid-cols-3">
                                        <Button type="button" variant="outline" className={cn('h-9 rounded-xl', darkMode ? 'border-white/10 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white')} onClick={() => startEditingGroupMember(group.id, member)}>
                                          Edit
                                        </Button>
                                        <Button type="button" variant="outline" className={cn('h-9 rounded-xl', darkMode ? 'border-white/10 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white')} onClick={() => navigator.clipboard.writeText(`User ID: ${member.userId}\nPassword: ${member.password}\nPermission: ${member.permission}`)}>
                                          Copy
                                        </Button>
                                        <Button type="button" variant="outline" className={cn('h-9 rounded-xl', darkMode ? 'border-white/10 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white')} onClick={() => removeGroupMember(group.id, member.id)}>
                                          Remove
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))
                            ) : (
                              <div className={cn('w-full rounded-[1.15rem] border border-dashed px-4 py-8 text-center', darkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50')}>
                                <div className={cn('mx-auto flex h-12 w-12 items-center justify-center rounded-2xl', darkMode ? 'bg-white/8 text-slate-200' : 'bg-slate-100 text-slate-600')}>
                                  <FolderOpen className="h-5 w-5" />
                                </div>
                                <p className={cn('mt-4 text-sm font-semibold', darkMode ? 'text-white' : 'text-slate-900')}>
                                  No members added yet
                                </p>
                                <p className={cn('mt-2 text-sm leading-6', darkMode ? 'text-slate-300' : 'text-slate-500')}>
                                  Add direct credentials from the left panel, or share the invite URL so teammates can create their own login for this document group.
                                </p>
                              </div>
                            )}
                            </div>
                            </div>
                          </div>
                        </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              ) : null}

              {shareTab === 'directory' ? (
              <div className={cn('rounded-[1.5rem] border p-5 sm:p-6', darkMode ? 'border-violet-400/10 bg-violet-500/[0.04] backdrop-blur-xl' : 'border-violet-100 bg-violet-50/70')}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className={cn('text-sm font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-violet-200' : 'text-violet-700')}>Publish to File Directory</p>
                    <p className={cn('mt-2 max-w-3xl text-sm leading-6', darkMode ? 'text-slate-300' : 'text-slate-600')}>
                      Export this DocWord document as PDF or DOCX and publish it into your File Directory with the same public or private locker workflow used across docrud.
                    </p>
                  </div>
                  <span className={cn('self-start rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em]', darkMode ? 'bg-violet-500/[0.10] text-violet-100' : 'bg-white text-violet-700')}>
                    {isAuthenticated ? 'Workspace sync' : 'Login needed'}
                  </span>
                </div>

                {!isAuthenticated ? (
                  <div className={cn('mt-5 rounded-[1.2rem] border px-4 py-4 text-sm leading-6', darkMode ? 'border-white/10 bg-white/5 text-slate-300' : 'border-slate-200 bg-white text-slate-600')}>
                    Sign in with your docrud workspace account to publish this document into File Directory.
                  </div>
                ) : (
                  <>
                    <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.2fr)]">
                      <div className={cn('rounded-[1.25rem] border p-5', darkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-white')}>
                        <p className={cn('text-xs font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-300' : 'text-slate-500')}>Export package</p>
                        <div className="mt-4 grid gap-3">
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Button type="button" variant="outline" className={cn('h-10 rounded-2xl', directoryPublishForm.format === 'pdf' ? 'border-violet-600 bg-violet-600 text-white hover:bg-violet-700' : darkMode ? 'border-white/10 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white text-slate-700')} onClick={() => setDirectoryPublishForm((current) => ({ ...current, format: 'pdf' }))}>
                              PDF
                            </Button>
                            <Button type="button" variant="outline" className={cn('h-10 rounded-2xl', directoryPublishForm.format === 'docx' ? 'border-violet-600 bg-violet-600 text-white hover:bg-violet-700' : darkMode ? 'border-white/10 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white text-slate-700')} onClick={() => setDirectoryPublishForm((current) => ({ ...current, format: 'docx' }))}>
                              DOCX
                            </Button>
                          </div>
                          <Input
                            value={directoryPublishForm.title}
                            onChange={(event) => setDirectoryPublishForm((current) => ({ ...current, title: event.target.value }))}
                            placeholder="Published file title"
                            className={cn('h-10 rounded-2xl border', darkMode ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white')}
                          />
                          <Textarea
                            value={directoryPublishForm.notes}
                            onChange={(event) => setDirectoryPublishForm((current) => ({ ...current, notes: event.target.value }))}
                            placeholder="Short notes shown with the published file"
                            className={cn('min-h-[88px] rounded-2xl border', darkMode ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white')}
                          />
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Input
                              value={directoryPublishForm.category}
                              onChange={(event) => setDirectoryPublishForm((current) => ({ ...current, category: event.target.value }))}
                              placeholder="Category"
                              className={cn('h-10 rounded-2xl border', darkMode ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white')}
                            />
                            <Input
                              value={directoryPublishForm.tags}
                              onChange={(event) => setDirectoryPublishForm((current) => ({ ...current, tags: event.target.value }))}
                              placeholder="Tags (comma separated)"
                              className={cn('h-10 rounded-2xl border', darkMode ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white')}
                            />
                          </div>
                        </div>
                      </div>

                      <div className={cn('rounded-[1.25rem] border p-5', darkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-white')}>
                        <p className={cn('text-xs font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-300' : 'text-slate-500')}>Visibility and access</p>
                        <div className="mt-4 space-y-4">
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Button type="button" variant="outline" className={cn('h-10 rounded-2xl', directoryPublishForm.visibility === 'public' ? 'border-sky-600 bg-sky-600 text-white hover:bg-sky-700' : darkMode ? 'border-white/10 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white text-slate-700')} onClick={() => setDirectoryPublishForm((current) => ({ ...current, visibility: 'public' }))}>
                              Public
                            </Button>
                            <Button type="button" variant="outline" className={cn('h-10 rounded-2xl', directoryPublishForm.visibility === 'private' ? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700' : darkMode ? 'border-white/10 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white text-slate-700')} onClick={() => setDirectoryPublishForm((current) => ({ ...current, visibility: 'private' }))}>
                              Private locker
                            </Button>
                          </div>

                          {directoryPublishForm.visibility === 'private' ? (
                            <div className="space-y-4">
                              <div className="grid gap-2 sm:grid-cols-2">
                                <Button type="button" variant="outline" className={cn('h-10 rounded-2xl', directoryPublishForm.lockerMode === 'new' ? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700' : darkMode ? 'border-white/10 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white text-slate-700')} onClick={() => setDirectoryPublishForm((current) => ({ ...current, lockerMode: 'new' }))}>
                                  New locker
                                </Button>
                                <Button type="button" variant="outline" className={cn('h-10 rounded-2xl', directoryPublishForm.lockerMode === 'existing' ? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700' : darkMode ? 'border-white/10 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white text-slate-700')} onClick={() => setDirectoryPublishForm((current) => ({ ...current, lockerMode: 'existing' }))}>
                                  Existing locker
                                </Button>
                              </div>
                              {directoryPublishForm.lockerMode === 'existing' ? (
                                <select
                                  value={directoryPublishForm.lockerId}
                                  onChange={(event) => setDirectoryPublishForm((current) => ({ ...current, lockerId: event.target.value }))}
                                  className={cn('h-10 w-full rounded-2xl border px-3 text-sm outline-none', darkMode ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white text-slate-700')}
                                >
                                  <option value="">{directoryLockersLoading ? 'Loading lockers...' : 'Select locker'}</option>
                                  {directoryLockers.map((locker) => (
                                    <option key={locker.id} value={locker.id}>{locker.name}</option>
                                  ))}
                                </select>
                              ) : (
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <Input
                                    value={directoryPublishForm.lockerName}
                                    onChange={(event) => setDirectoryPublishForm((current) => ({ ...current, lockerName: event.target.value }))}
                                    placeholder="Locker name"
                                    className={cn('h-10 rounded-2xl border', darkMode ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white')}
                                  />
                                  <Input
                                    value={directoryPublishForm.passwordRotationDays}
                                    onChange={(event) => setDirectoryPublishForm((current) => ({ ...current, passwordRotationDays: event.target.value.replace(/[^\d]/g, '').slice(0, 3) }))}
                                    placeholder="Rotation days"
                                    className={cn('h-10 rounded-2xl border', darkMode ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white')}
                                  />
                                </div>
                              )}
                              <div className="grid gap-3 sm:grid-cols-2">
                                <Input
                                  value={directoryPublishForm.accessPassword}
                                  onChange={(event) => setDirectoryPublishForm((current) => ({ ...current, accessPassword: event.target.value.toUpperCase() }))}
                                  placeholder="Locker password"
                                  className={cn('h-10 rounded-2xl border', darkMode ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white')}
                                />
                                <Input
                                  value={directoryPublishForm.fileAccessPassword}
                                  onChange={(event) => setDirectoryPublishForm((current) => ({ ...current, fileAccessPassword: event.target.value.toUpperCase() }))}
                                  placeholder="Optional file password"
                                  className={cn('h-10 rounded-2xl border', darkMode ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white')}
                                />
                              </div>
                            </div>
                          ) : (
                            <div className={cn('rounded-[1rem] border px-4 py-4 text-sm leading-6', darkMode ? 'border-white/10 bg-white/5 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600')}>
                              Public publishing makes the exported DocWord file discoverable through the File Directory without locker authentication.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className={cn('mt-5 rounded-[1.25rem] border p-4 sm:p-5', darkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-white')}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className={cn('text-sm font-semibold', darkMode ? 'text-white' : 'text-slate-900')}>Ready to publish</p>
                          <p className={cn('mt-1 text-xs leading-5', darkMode ? 'text-slate-300' : 'text-slate-500')}>
                            Create a searchable exported copy in File Directory, or download the same output first.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" className="h-11 rounded-2xl bg-violet-600 text-white hover:bg-violet-700" onClick={() => void publishDocumentToDirectory()} disabled={directoryPublishLoading}>
                        {directoryPublishLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                        Publish to File Directory
                      </Button>
                      <Button type="button" variant="outline" className={cn('h-11 rounded-2xl', darkMode ? 'border-white/10 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white')} onClick={() => void exportDocument(directoryPublishForm.format)}>
                        <Download className="mr-2 h-4 w-4" />
                        Download {directoryPublishForm.format.toUpperCase()}
                      </Button>
                        </div>
                      </div>
                    </div>

                    {directoryPublishStatus ? (
                      <div className={cn('mt-4 rounded-[1rem] border px-4 py-3 text-sm leading-6', darkMode ? 'border-emerald-400/15 bg-emerald-500/[0.08] text-emerald-100' : 'border-emerald-100 bg-emerald-50 text-emerald-700')}>
                        {directoryPublishStatus}
                      </div>
                    ) : null}
                    {directoryPublishError ? (
                      <div className={cn('mt-4 rounded-[1rem] border px-4 py-3 text-sm leading-6', darkMode ? 'border-rose-400/15 bg-rose-500/[0.08] text-rose-100' : 'border-rose-100 bg-rose-50 text-rose-700')}>
                        {directoryPublishError}
                      </div>
                    ) : null}

                    <div className={cn('mt-4 rounded-[1.25rem] border p-5', darkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-white')}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold">Recently published copies</p>
                        <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]', darkMode ? 'bg-white/8 text-slate-300' : 'bg-slate-100 text-slate-600')}>
                          {directoryTransfersLoading ? 'Loading' : `${directoryTransfers.filter((item) => item.title?.includes(currentDocument?.title || '') || item.fileName.toLowerCase().includes((currentDocument?.title || '').toLowerCase().split(' ').join('-'))).slice(0, 4).length} items`}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-3">
                        {(publishedDirectoryTransfer ? [publishedDirectoryTransfer, ...directoryTransfers.filter((item) => item.id !== publishedDirectoryTransfer.id)] : directoryTransfers)
                          .filter((item) => (item.title || '').toLowerCase().includes((currentDocument?.title || '').toLowerCase()) || item.fileName.toLowerCase().includes((currentDocument?.title || '').toLowerCase().split(' ').join('-')))
                          .slice(0, 4)
                          .map((item) => (
                            <div key={item.id} className={cn('flex flex-col gap-3 rounded-[1rem] border px-4 py-3 sm:flex-row sm:items-center sm:justify-between', darkMode ? 'border-white/10 bg-[#0d1830]' : 'border-slate-200 bg-slate-50')}>
                              <div className="min-w-0">
                                <p className={cn('truncate text-sm font-semibold', darkMode ? 'text-white' : 'text-slate-900')}>{item.title || item.fileName}</p>
                                <p className={cn('mt-1 text-xs leading-5', darkMode ? 'text-slate-300' : 'text-slate-500')}>
                                  {item.directoryVisibility === 'public' ? 'Public' : 'Private'} · {item.fileName} {item.lockerName ? `· ${item.lockerName}` : ''}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button type="button" variant="outline" className={cn('h-9 rounded-xl', darkMode ? 'border-white/10 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white')} onClick={() => window.open(buildAbsoluteAppUrl(`/transfer/${item.shareId}`, runtimeAppOrigin), '_blank')}>
                                  Open
                                </Button>
                                <Button type="button" variant="outline" className={cn('h-9 rounded-xl', darkMode ? 'border-white/10 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white')} onClick={() => navigator.clipboard.writeText(buildAbsoluteAppUrl(`/transfer/${item.shareId}`, runtimeAppOrigin))}>
                                  Copy link
                                </Button>
                              </div>
                            </div>
                          ))}
                        {!directoryTransfersLoading && !(publishedDirectoryTransfer ? [publishedDirectoryTransfer, ...directoryTransfers.filter((item) => item.id !== publishedDirectoryTransfer.id)] : directoryTransfers)
                          .filter((item) => (item.title || '').toLowerCase().includes((currentDocument?.title || '').toLowerCase()) || item.fileName.toLowerCase().includes((currentDocument?.title || '').toLowerCase().split(' ').join('-')))
                          .slice(0, 4).length ? (
                          <div className={cn('rounded-[1rem] border border-dashed px-4 py-6 text-sm leading-6', darkMode ? 'border-white/10 bg-white/5 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600')}>
                            No published File Directory copies yet for this document. Publish once and the result will show here with direct access.
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </>
                )}
              </div>
              ) : null}

              {shareTab === 'sign' ? (
              <div className={cn('rounded-[1.3rem] border p-4', darkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50')}>
                <p className="text-sm font-semibold">Signature-ready flow</p>
                <p className={cn('mt-2 text-xs leading-5', darkMode ? 'text-slate-300' : 'text-slate-500')}>
                  Use DocWord to prepare the draft, then send it into the E-sign Documents workspace for governed signing and delivery.
                </p>
                <div className="mt-4 grid gap-3">
                  <button
                    type="button"
                    onClick={() => currentDocument && updateCurrentDocument({ requireSignature: !currentDocument.requireSignature })}
                    className={cn(
                      'rounded-[1rem] border px-4 py-3 text-left transition',
                      currentDocument?.requireSignature
                        ? 'border-slate-950 bg-slate-950 text-white'
                        : darkMode
                          ? 'border-white/10 bg-[#0d1830] text-slate-200'
                          : 'border-slate-200 bg-white text-slate-700',
                    )}
                  >
                    <p className="text-sm font-semibold">Mark this draft as signature-ready</p>
                    <p className={cn('mt-1 text-xs leading-5', currentDocument?.requireSignature ? 'text-white/75' : darkMode ? 'text-slate-400' : 'text-slate-500')}>
                      {currentDocument?.requireSignature ? 'This document is flagged for signature handoff.' : 'Turn this on so the document is clearly treated as a signing candidate.'}
                    </p>
                  </button>
                  <div className={cn('rounded-[1rem] border p-4', darkMode ? 'border-white/10 bg-[#0d1830]' : 'border-slate-200 bg-white')}>
                    <p className={cn('text-sm font-semibold', darkMode ? 'text-white' : 'text-slate-900')}>Send to get signed</p>
                    <p className={cn('mt-1 text-xs leading-5', darkMode ? 'text-slate-300' : 'text-slate-500')}>
                      Open the E-sign Documents workspace to finalize signer rules, delivery, signature capture, and audit-ready sharing.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" disabled={sendToSignLoading || !currentDocument} className="h-10 rounded-2xl bg-slate-950 text-white hover:bg-slate-800" onClick={openSignPrepDialog}>
                        {sendToSignLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Share2 className="mr-2 h-4 w-4" />}
                        Open E-sign Documents
                      </Button>
                      <Button type="button" variant="outline" className={cn('h-10 rounded-2xl', darkMode ? 'border-white/10 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white')} onClick={() => setShareTab('link')}>
                        Back to share links
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              ) : null}
            </div>

            {shareTab !== 'groups' && shareTab !== 'directory' ? (
            <div className={cn('order-1 rounded-[1.3rem] border p-4 md:order-2', darkMode ? 'border-sky-400/10 bg-sky-500/[0.04]' : 'border-sky-100 bg-sky-50/60')}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">QR access</p>
                <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]', darkMode ? 'bg-white/8 text-slate-300' : 'bg-white text-slate-500')}>
                  Scan ready
                </span>
              </div>
              <div className="mt-4 flex justify-center">
                <div className={cn('relative aspect-square w-full max-w-[220px] overflow-hidden rounded-[1.4rem] border', darkMode ? 'border-white/10 bg-[#0d1830]' : 'border-slate-200 bg-white')}>
                  {activeSharePanelQrUrl ? (
                    <Image src={activeSharePanelQrUrl} alt="DocWord share QR" fill unoptimized className="object-contain p-3" />
                  ) : (
                    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-400">
                      Generate a share link to show QR access.
                    </div>
                  )}
                </div>
              </div>
              <p className={cn('mt-4 text-xs leading-5 text-center', darkMode ? 'text-slate-300' : 'text-slate-500')}>
                Scan to open the live DocWord page. Secure shares will ask for the password first.
              </p>
              <div className="mt-4 grid gap-2">
                <Button type="button" className="h-10 rounded-2xl bg-sky-500 text-white hover:bg-sky-600" onClick={() => activeSharePanelUrl && window.open(activeSharePanelUrl, '_blank')} disabled={!activeSharePanelUrl}>
                  <ArrowLeft className="mr-2 h-4 w-4 rotate-180" />
                  Open shared page
                </Button>
                <Button type="button" variant="outline" className={cn('h-10 rounded-2xl', darkMode ? 'border-white/10 bg-[#0d1830] text-white hover:bg-[#13213f]' : 'border-slate-200 bg-white')} onClick={() => navigator.clipboard.writeText(activeSharePanelUrl)} disabled={!activeSharePanelUrl}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy active link
                </Button>
              </div>
            </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showGuidedCreator} onOpenChange={setShowGuidedCreator}>
        <DialogContent className={cn('max-h-[92vh] w-[calc(100vw-1rem)] max-w-5xl overflow-y-auto rounded-[1.8rem] border p-0', darkMode ? 'border-white/10 bg-[#081221] text-white' : 'border-white/80 bg-white text-slate-950')}>
          <DialogHeader className={cn('border-b px-5 py-4', darkMode ? 'border-white/10' : 'border-slate-200')}>
            <DialogTitle className="text-left text-xl font-semibold tracking-[-0.03em]">Guided document creation</DialogTitle>
            <p className={cn('mt-1 text-sm leading-6', darkMode ? 'text-slate-300' : 'text-slate-500')}>
              Create Indian-ready letters, agreements, RTI drafts, quotations, and student documents without starting from a blank page.
            </p>
          </DialogHeader>
          <div className="grid gap-0 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className={cn('border-b p-4 lg:border-b-0 lg:border-r', darkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50')}>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className={cn('h-10 flex-1 rounded-2xl', guidedMode === 'form' ? 'border-slate-950 bg-slate-950 text-white hover:bg-slate-900' : darkMode ? 'border-white/10 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white')} onClick={() => setGuidedMode('form')}>
                  Structured form
                </Button>
                <Button type="button" variant="outline" className={cn('h-10 flex-1 rounded-2xl', guidedMode === 'chat' ? 'border-slate-950 bg-slate-950 text-white hover:bg-slate-900' : darkMode ? 'border-white/10 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white')} onClick={() => setGuidedMode('chat')}>
                  Chat brief
                </Button>
              </div>
              <div className="mt-4 space-y-2">
                {guidedPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setGuidedPresetId(preset.id)}
                    className={cn(
                      'w-full rounded-[1.2rem] border px-3 py-3 text-left transition',
                      guidedPresetId === preset.id
                        ? darkMode ? 'border-sky-400/30 bg-sky-400/10' : 'border-sky-200 bg-white'
                        : darkMode ? 'border-white/10 bg-white/5 hover:bg-white/10' : 'border-slate-200 bg-white hover:bg-slate-50',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{preset.emoji}</span>
                      <div>
                        <p className={cn('text-sm font-semibold', darkMode ? 'text-white' : 'text-slate-900')}>{preset.title}</p>
                        <p className={cn('text-xs', darkMode ? 'text-slate-300' : 'text-slate-500')}>{preset.description}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 sm:p-5">
              <div className={cn('rounded-[1.3rem] border p-4', darkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50')}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.22em] text-sky-500">{selectedGuidedPreset.category}</p>
                    <h3 className={cn('mt-1 text-lg font-semibold tracking-[-0.03em]', darkMode ? 'text-white' : 'text-slate-950')}>
                      {selectedGuidedPreset.emoji} {selectedGuidedPreset.title}
                    </h3>
                  </div>
                  <Button type="button" variant="outline" className={cn('h-10 rounded-2xl', voiceListening ? 'border-slate-950 bg-slate-950 text-white hover:bg-slate-900' : darkMode ? 'border-white/10 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white')} onClick={() => startVoiceCapture(guidedMode === 'chat' ? 'guided-prompt' : selectedGuidedPreset.fields[0]?.id || 'guided-prompt')}>
                    <Mic className="mr-2 h-4 w-4" />
                    {voiceListening ? 'Listening' : 'Voice input'}
                  </Button>
                </div>

                {guidedMode === 'chat' ? (
                  <div className="mt-4 space-y-3">
                    <Textarea
                      value={guidedPrompt}
                      onChange={(event) => setGuidedPrompt(event.target.value)}
                      placeholder="Example: mujhe 3 din ki leave application chahiye due to fever. Or: rental agreement for Bangalore for 11 months."
                      className={cn('min-h-[180px] rounded-[1.2rem] border', darkMode ? 'border-white/10 bg-[#0d1830] text-white placeholder:text-slate-500' : 'border-slate-200 bg-white')}
                    />
                    <p className={cn('text-xs leading-5', darkMode ? 'text-slate-300' : 'text-slate-500')}>
                      Works with English, Hinglish, or mixed phrasing. DocWord will shape it into a polished formal draft.
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {selectedGuidedPreset.fields.map((field) => (
                      <div key={field.id} className={field.id === 'info' || field.id === 'scope' || field.id === 'issue' ? 'sm:col-span-2' : ''}>
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <p className={cn('text-sm font-medium', darkMode ? 'text-slate-200' : 'text-slate-700')}>{field.label}</p>
                          <button type="button" className={cn('inline-flex items-center gap-1 text-xs', darkMode ? 'text-sky-300' : 'text-sky-600')} onClick={() => startVoiceCapture(field.id)}>
                            <Mic className="h-3.5 w-3.5" />
                            Speak
                          </button>
                        </div>
                        <Input
                          value={guidedAnswers[field.id] || ''}
                          onChange={(event) => setGuidedAnswers((current) => ({ ...current, [field.id]: event.target.value }))}
                          placeholder={field.placeholder}
                          className={cn('h-11 rounded-2xl border', darkMode ? 'border-white/10 bg-[#0d1830] text-white placeholder:text-slate-500' : 'border-slate-200 bg-white')}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className={cn('mt-4 rounded-[1.2rem] border p-3', darkMode ? 'border-white/10 bg-[#0d1830]' : 'border-slate-200 bg-white')}>
                  <p className={cn('text-sm font-semibold', darkMode ? 'text-white' : 'text-slate-900')}>Autofill profile in use</p>
                  <p className={cn('mt-1 text-xs leading-5', darkMode ? 'text-slate-300' : 'text-slate-500')}>
                    {docProfile.fullName || docProfile.companyName || docProfile.collegeName
                      ? `Using ${docProfile.fullName || docProfile.companyName || docProfile.collegeName} for faster drafting.`
                      : 'Add your profile in Document setup to auto-fill recurring identity details.'}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" className="h-11 rounded-2xl bg-slate-950 px-5 text-white hover:bg-slate-800" onClick={() => void applyGuidedDocument()} disabled={guidedLoading}>
                    {guidedLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    Create draft
                  </Button>
                  <Button type="button" variant="outline" className={cn('h-11 rounded-2xl', darkMode ? 'border-white/10 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white')} onClick={() => setShowGuidedCreator(false)}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {showTemplates ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-x-hidden overflow-y-auto bg-slate-950/35 p-3 pt-20 backdrop-blur-sm sm:p-6">
          <div className={cn('w-full max-w-5xl overflow-hidden rounded-[2rem] border', darkMode ? 'border-white/10 bg-[#0a1529]' : 'border-white/70 bg-white')}>
            <div className={cn('flex items-center justify-between gap-3 border-b px-4 py-4 sm:px-5', darkMode ? 'border-white/10' : 'border-slate-200')}>
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-sky-500">Ready templates</p>
                <h3 className={cn('mt-1 text-lg font-semibold tracking-[-0.03em]', darkMode ? 'text-white' : 'text-slate-950')}>Pick a polished starting point</h3>
              </div>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className={cn('h-10 w-10 rounded-2xl', darkMode ? 'border-white/10 bg-white/5 text-white' : 'border-slate-200 bg-white')}
                onClick={() => setShowTemplates(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
              {templateCatalog.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => applyTemplate(template.id)}
                  className={cn('rounded-[1.4rem] border p-4 text-left transition', darkMode ? 'border-white/10 bg-white/5 hover:bg-white/10' : 'border-slate-200 bg-slate-50 hover:bg-slate-100')}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-2xl">{template.emoji}</span>
                    <span className={cn('rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.18em]', darkMode ? 'bg-white/8 text-slate-300' : 'bg-white text-slate-500')}>
                      Preview
                    </span>
                  </div>
                  <p className={cn('mt-4 text-base font-semibold tracking-[-0.03em]', darkMode ? 'text-white' : 'text-slate-900')}>{template.name}</p>
                  <p className={cn('mt-2 text-sm leading-6', darkMode ? 'text-slate-300' : 'text-slate-500')}>{template.description}</p>
                  <div className="mt-4 rounded-[1rem] border border-slate-200/80 bg-white/80 p-3">
                    {template.preview.map((item) => (
                      <div key={item} className="mb-2 last:mb-0 rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600">
                        {item}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-sky-600">
                    Use template
                    <ArrowLeft className="h-4 w-4 rotate-180" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {showCommandPalette ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-x-hidden overflow-y-auto bg-slate-950/35 p-3 pt-24 backdrop-blur-sm sm:p-6">
          <div className={cn('w-full max-w-2xl overflow-hidden rounded-[2rem] border', darkMode ? 'border-white/10 bg-[#0a1529]' : 'border-white/70 bg-white')}>
            <div className={cn('border-b px-4 py-4 sm:px-5', darkMode ? 'border-white/10' : 'border-slate-200')}>
              <div className="flex items-center gap-3">
                <Search className="h-4 w-4 text-slate-400" />
                <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search commands or documents" className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0" />
              </div>
            </div>
            <div className="grid gap-2 p-3 sm:grid-cols-2 sm:p-4">
              {[
                { label: 'New document', action: () => void createInitialDocument(), icon: FilePlus2 },
                { label: 'Summarize with AI', action: () => void runAiAction('summarize'), icon: Sparkles },
                { label: 'Export PDF', action: () => void exportDocument('pdf'), icon: Download },
                { label: 'Toggle theme', action: () => setDarkMode((current) => !current), icon: darkMode ? SunMedium : MoonStar },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      item.action();
                      setShowCommandPalette(false);
                    }}
                    className={cn('flex items-center gap-3 rounded-[1.2rem] border px-4 py-4 text-left transition', darkMode ? 'border-white/10 bg-white/5 hover:bg-white/10' : 'border-slate-200 bg-slate-50 hover:bg-slate-100')}
                  >
                    <div className={cn('flex h-11 w-11 items-center justify-center rounded-2xl', darkMode ? 'bg-white/10 text-white' : 'bg-slate-900 text-white')}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className={cn('text-sm font-semibold', darkMode ? 'text-white' : 'text-slate-900')}>{item.label}</p>
                      <p className={cn('text-xs uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>Command</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-[1.2rem] border border-rose-200 bg-white px-4 py-3 text-sm text-rose-600 shadow-lg">
          {error}
        </div>
      ) : null}

      {/* ── Real-time CollabBar ── */}
      {collabOpen && collabToken ? (
        <CollabBar
          engine={collabEngine}
          content={JSON.stringify(currentDocument?.blocks ?? [])}
          onContentChange={(blocksJson) => {
            try {
              const blocks = JSON.parse(blocksJson) as DocWordBlock[];
              if (Array.isArray(blocks) && blocks.length > 0) {
                updateCurrentDocument({ blocks });
              }
            } catch { /* ignore */ }
          }}
        />
      ) : null}
    </div>
  );
}
