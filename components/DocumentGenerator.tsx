'use client';
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from './ui/button';
import { Input } from './ui/input';
import RichTextEditor from './RichTextEditor';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { ProcessProgress } from './ui/process-progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { PdfSignatureBoxPreview } from './PdfSignatureBoxPreview';
import { CollaborationSettings, DashboardMetrics, DataCollectionStatus, DocumentField, DocumentHistory, DocumentTemplate, ParserHistoryEntry, PlatformConfig, PlatformFeatureControlKey, ProfileOverview, RecipientAccessLevel, RecipientSignatureBoxPlacement, SignatureRecord, SignatureSettings, TemplateMarketplacePurchase, WorkspaceNotification } from '../types/document';
import { buildStructuredInsights, preserveDocumentStructure } from '@/lib/document-parser-analysis';
import { DEFAULT_DOCUMENT_DESIGN_PRESET, documentDesignPresets, type DocumentDesignPreset } from '@/lib/document-designs';
import { getIndustryWorkspaceProfile, getWorkspacePresetLabel } from '@/lib/industry-presets';
import { renderDocumentTemplate } from '@/lib/template';
import { buildGoogleMapsLink, formatSignatureLocation } from '@/lib/location';
import { buildAbsoluteAppUrl } from '@/lib/url';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { AlertTriangle, ArrowRight, Award, BarChart3, Bell, BookOpen, BrainCircuit, BriefcaseBusiness, ChevronDown, ChevronRight, CircleHelp, Copy, CreditCard, Download, Eye, FileSearch, FileSignature, FileSpreadsheet, FileText, FolderKanban, History, KeyRound, LayoutDashboard, LineChart, Link2, Lock, LockKeyhole, LogOut, Mail, Maximize2, Menu, MessageSquare, MoreHorizontal, PanelLeftClose, PanelLeftOpen, PenLine, PieChart, QrCode, RefreshCw, ScanText, Search, Settings, Share2, ShieldCheck, Sparkles, Table2, Upload, UserRound, Users, Video, Wrench, X } from 'lucide-react';
import ShareLinkModal from './ShareLinkModal';
import ProfileCenter from './ProfileCenter';
import FileTransferCenter from './FileTransferCenter';
import SecureAccessCenter from './SecureAccessCenter';
import BillingCenter from './BillingCenter';
import SupportCenter from './SupportCenter';
import InternalMailboxCenter from './InternalMailboxCenter';
import DocrudiansCenter from './DocrudiansCenter';
	import GigsCenter from './GigsCenter';
	import TalentLeadsCenter from './TalentLeadsCenter';
import { PdfSignatureBoxEditor } from './PdfSignatureBoxEditor';
	import WorkspaceTour from './WorkspaceTour';
	import DocrudLogo from './DocrudLogo';
import type { BusinessSettings } from '@/types/document';
import { fullWorkspaceTour, WORKSPACE_TOUR_STORAGE_KEY, workspaceTours, type WorkspaceTourFeatureKey } from '@/lib/workspace-tour';
import { trackTelemetry } from '@/lib/telemetry-client';

import NextDynamic from 'next/dynamic';

/*
 * Workspace tab panels, code-split.
 *
 * Radix <TabsContent> mounts children only while its tab is active, so each
 * of these chunks downloads the first time a user opens that tab rather than
 * being bundled into the initial /workspace payload.
 */
const DailyToolsCenter = NextDynamic(() => import('./DailyToolsCenter'), { ssr: false });
const DocSheetCenter = NextDynamic(() => import('./DocSheetCenter'), { ssr: false });
const SuperAdminCommandCenter = NextDynamic(() => import('./SuperAdminCommandCenter'), { ssr: false });
const DocumentVisualizerCenter = NextDynamic(() => import('./DocumentVisualizerCenter'), { ssr: false });
const DocumentVisualizerModal = NextDynamic(() => import('./DocumentVisualizerModal'), { ssr: false });
const TemplateStudioDialog = NextDynamic(() => import('./TemplateStudioDialog'), { ssr: false });
const DoxpertCenter = NextDynamic(() => import('./DoxpertCenter'), { ssr: false });
const TeamWorkspaceCenter = NextDynamic(() => import('./TeamWorkspaceCenter'), { ssr: false });
const DealRoomCenter = NextDynamic(() => import('./DealRoomCenter'), { ssr: false });
const HiringDeskCenter = NextDynamic(() => import('./HiringDeskCenter'), { ssr: false });
const TemplatePublisherCenter = NextDynamic(() => import('./TemplatePublisherCenter'), { ssr: false });
const FormsCenter = NextDynamic(() => import('./FormsCenter'), { ssr: false });
const ScratchpadCenter = NextDynamic(() => import('./ScratchpadCenter'), { ssr: false });
const CertificatesCenter = NextDynamic(() => import('./CertificatesCenter'), { ssr: false });
const VirtualIdCenter = NextDynamic(() => import('./VirtualIdCenter'), { ssr: false });
const BusinessSettingsCenter = NextDynamic(() => import('./BusinessSettingsCenter'), { ssr: false });
const TutorialsCenter = NextDynamic(() => import('./TutorialsCenter'), { ssr: false });
const ClientPortal = NextDynamic(() => import('./ClientPortal'), { ssr: false });
const EmployeePortal = NextDynamic(() => import('./EmployeePortal'), { ssr: false });
import GlobalSearchBar from './GlobalSearchBar';

const emptyDashboard: DashboardMetrics = {
  totalDocuments: 0,
  documentsThisWeek: 0,
  emailsSent: 0,
  templatesUsed: 0,
  topTemplates: [],
  recentActivity: [],
  recentFeedback: [],
  documentSummary: [],
  signatureLocationDistribution: [],
};

const emptyCollaborationSettings: CollaborationSettings = {
  defaultRecipientAccess: 'comment',
};

const HISTORY_PAGE_SIZE = 8;
const SUMMARY_PAGE_SIZE = 6;
const FEEDBACK_PAGE_SIZE = 5;
const DRAFT_STORAGE_PREFIX = 'docrud-template-draft:';
const MOBILE_TAB_USAGE_PREFIX = 'docrud-mobile-tab-usage:';
const ONBOARDING_TEMPLATE_IDS = ['internship-letter', 'offer-letter', 'appointment-letter', 'employment-contract'];
const NAV_GROUP_TONES: Record<
  string,
  {
    dot: string;
    ring: string;
    headerGlow: string;
    activeStripe: string;
    badge: string;
    iconBg: string;
    iconFg: string;
  }
> = {
  default: {
    dot: 'bg-slate-400',
    ring: 'ring-1 ring-slate-200/80',
    headerGlow:
      'before:absolute before:inset-x-3 before:top-3 before:h-10 before:rounded-[22px] before:bg-gradient-to-r before:from-slate-200/70 before:to-transparent before:opacity-100 before:pointer-events-none',
    activeStripe:
      'before:absolute before:left-2 before:top-2 before:bottom-2 before:w-1 before:rounded-full before:bg-gradient-to-b before:from-slate-300 before:to-slate-500 before:pointer-events-none',
    badge: 'bg-slate-100 text-slate-600',
    iconBg: 'bg-slate-100/90',
    iconFg: 'text-slate-700',
  },
  home: {
    dot: 'bg-sky-500',
    ring: 'ring-1 ring-sky-200/80',
    headerGlow:
      'before:absolute before:inset-x-3 before:top-3 before:h-10 before:rounded-[22px] before:bg-gradient-to-r before:from-sky-200/70 before:to-transparent before:opacity-100 before:pointer-events-none',
    activeStripe:
      'before:absolute before:left-2 before:top-2 before:bottom-2 before:w-1 before:rounded-full before:bg-gradient-to-b before:from-sky-400 before:to-sky-600 before:pointer-events-none',
    badge: 'bg-sky-100/80 text-sky-700',
    iconBg: 'bg-sky-100/90',
    iconFg: 'text-sky-700',
  },
  create: {
    dot: 'bg-emerald-500',
    ring: 'ring-1 ring-emerald-200/80',
    headerGlow:
      'before:absolute before:inset-x-3 before:top-3 before:h-10 before:rounded-[22px] before:bg-gradient-to-r before:from-emerald-200/70 before:to-transparent before:opacity-100 before:pointer-events-none',
    activeStripe:
      'before:absolute before:left-2 before:top-2 before:bottom-2 before:w-1 before:rounded-full before:bg-gradient-to-b before:from-emerald-400 before:to-emerald-600 before:pointer-events-none',
    badge: 'bg-emerald-100/80 text-emerald-700',
    iconBg: 'bg-emerald-100/90',
    iconFg: 'text-emerald-700',
  },
  review: {
    dot: 'bg-indigo-500',
    ring: 'ring-1 ring-indigo-200/80',
    headerGlow:
      'before:absolute before:inset-x-3 before:top-3 before:h-10 before:rounded-[22px] before:bg-gradient-to-r before:from-indigo-200/70 before:to-transparent before:opacity-100 before:pointer-events-none',
    activeStripe:
      'before:absolute before:left-2 before:top-2 before:bottom-2 before:w-1 before:rounded-full before:bg-gradient-to-b before:from-indigo-400 before:to-indigo-600 before:pointer-events-none',
    badge: 'bg-indigo-100/80 text-indigo-700',
    iconBg: 'bg-indigo-100/90',
    iconFg: 'text-indigo-700',
  },
  share: {
    dot: 'bg-amber-500',
    ring: 'ring-1 ring-amber-200/80',
    headerGlow:
      'before:absolute before:inset-x-3 before:top-3 before:h-10 before:rounded-[22px] before:bg-gradient-to-r before:from-amber-200/70 before:to-transparent before:opacity-100 before:pointer-events-none',
    activeStripe:
      'before:absolute before:left-2 before:top-2 before:bottom-2 before:w-1 before:rounded-full before:bg-gradient-to-b before:from-amber-400 before:to-amber-600 before:pointer-events-none',
    badge: 'bg-amber-100/80 text-amber-800',
    iconBg: 'bg-amber-100/90',
    iconFg: 'text-amber-800',
  },
  collaboration: {
    dot: 'bg-fuchsia-500',
    ring: 'ring-1 ring-fuchsia-200/80',
    headerGlow:
      'before:absolute before:inset-x-3 before:top-3 before:h-10 before:rounded-[22px] before:bg-gradient-to-r before:from-fuchsia-200/70 before:to-transparent before:opacity-100 before:pointer-events-none',
    activeStripe:
      'before:absolute before:left-2 before:top-2 before:bottom-2 before:w-1 before:rounded-full before:bg-gradient-to-b before:from-fuchsia-400 before:to-fuchsia-600 before:pointer-events-none',
    badge: 'bg-fuchsia-100/80 text-fuchsia-700',
    iconBg: 'bg-fuchsia-100/90',
    iconFg: 'text-fuchsia-700',
  },
  account: {
    dot: 'bg-slate-500',
    ring: 'ring-1 ring-slate-200/80',
    headerGlow:
      'before:absolute before:inset-x-3 before:top-3 before:h-10 before:rounded-[22px] before:bg-gradient-to-r before:from-slate-200/75 before:to-transparent before:opacity-100 before:pointer-events-none',
    activeStripe:
      'before:absolute before:left-2 before:top-2 before:bottom-2 before:w-1 before:rounded-full before:bg-gradient-to-b before:from-slate-400 before:to-slate-600 before:pointer-events-none',
    badge: 'bg-slate-100/80 text-slate-700',
    iconBg: 'bg-slate-100/90',
    iconFg: 'text-slate-700',
  },
  portal: {
    dot: 'bg-teal-500',
    ring: 'ring-1 ring-teal-200/80',
    headerGlow:
      'before:absolute before:inset-x-3 before:top-3 before:h-10 before:rounded-[22px] before:bg-gradient-to-r before:from-teal-200/70 before:to-transparent before:opacity-100 before:pointer-events-none',
    activeStripe:
      'before:absolute before:left-2 before:top-2 before:bottom-2 before:w-1 before:rounded-full before:bg-gradient-to-b before:from-teal-400 before:to-teal-600 before:pointer-events-none',
    badge: 'bg-teal-100/80 text-teal-800',
    iconBg: 'bg-teal-100/90',
    iconFg: 'text-teal-800',
  },
  'scratchpad-tools': {
    dot: 'bg-violet-500',
    ring: 'ring-1 ring-violet-200/80',
    headerGlow:
      'before:absolute before:inset-x-3 before:top-3 before:h-10 before:rounded-[22px] before:bg-gradient-to-r before:from-violet-200/70 before:to-transparent before:opacity-100 before:pointer-events-none',
    activeStripe:
      'before:absolute before:left-2 before:top-2 before:bottom-2 before:w-1 before:rounded-full before:bg-gradient-to-b before:from-violet-400 before:to-violet-600 before:pointer-events-none',
    badge: 'bg-violet-100/80 text-violet-700',
    iconBg: 'bg-violet-100/90',
    iconFg: 'text-violet-700',
  },
};

const getNavGroupTone = (groupId: string) => NAV_GROUP_TONES[groupId] ?? NAV_GROUP_TONES.default;
const DEFAULT_BGV_DOCUMENTS = [
  'Government Photo ID Proof',
  'Address Proof',
  'PAN Card',
  'Aadhaar Card',
  'Passport Size Photograph',
  'Educational Certificates',
  'Latest Resume',
  'Previous Employment Relieving Letter',
  'Previous Employment Payslips',
  'Bank Account Proof',
];
type ShareTarget = Partial<Pick<DocumentHistory, 'shareUrl' | 'shareId' | 'id'>>;

const sanitizeEditorHtml = (value: string) =>
  value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+="[^"]*"/gi, '')
    .replace(/\son[a-z]+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');

const stripEditorHtml = (value: string) =>
  sanitizeEditorHtml(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const examplePreviewTemplate: DocumentTemplate = {
  id: 'design-preview-template',
  name: 'Master Services Agreement',
  category: 'Legal',
  description: 'Example preview template for document design presets.',
  isCustom: false,
  fields: [
    { id: 'company-name', name: 'companyName', label: 'Company Name', type: 'text', required: true, order: 1 },
    { id: 'recipient-name', name: 'recipientName', label: 'Recipient Name', type: 'text', required: true, order: 2 },
    { id: 'effective-date', name: 'effectiveDate', label: 'Effective Date', type: 'date', required: true, order: 3 },
    { id: 'summary', name: 'summary', label: 'Summary', type: 'textarea', required: true, order: 4 },
  ],
  template: `
    <p>This Master Services Agreement is entered into between <strong>{{companyName}}</strong> and <strong>{{recipientName}}</strong> effective from <strong>{{effectiveDate}}</strong>.</p>
    <p>{{companyName}} will provide enterprise document workflow, compliance tracking, and managed support operations under the agreed commercial schedule.</p>
    <h3>Scope Overview</h3>
    <p>{{summary}}</p>
    <h3>Governance Notes</h3>
    <ul>
      <li>All deliverables follow approved review and audit controls.</li>
      <li>Both parties will maintain confidentiality and operational compliance.</li>
      <li>Commercial amendments must be approved in writing by authorized stakeholders.</li>
    </ul>
  `,
};

const examplePreviewData = {
  companyName: 'Northstar Industrial Systems Pvt. Ltd.',
  recipientName: 'Avery Morgan',
  effectiveDate: '2026-04-01',
  summary: 'This agreement covers onboarding, compliance documentation, vendor approvals, and recurring document operations across legal, HR, and client services teams.',
};

const CLIENT_PREVIEW_WATERMARK = 'SAMPLE';
type DraftAiInsights = {
  summary: string;
  risks: string[];
  clauseSuggestions: string[];
  nextActions: string[];
  provider?: string;
  model?: string;
} | null;

type WorkspaceAiInsights = {
  briefing: string;
  priorities: string[];
  bottlenecks: string[];
  opportunities: string[];
  generatedAt?: string;
  metrics?: {
    totalDocuments: number;
    documentsThisWeek: number;
    signedDocuments: number;
    pendingFeedback: number;
  };
  provider?: string;
  model?: string;
} | null;

type AiGeneratedDraft = {
  documentBrief: string;
  fieldValues: Record<string, string>;
  provider?: string;
  model?: string;
} | null;

type ParsedDocumentInsights = {
  title?: string;
  fileName?: string;
  sourceType?: string;
  extractionMethod?: string;
  analysisMode?: 'ai' | 'fallback';
  extractedContent?: string;
  extractedCharacterCount?: number;
  summary: string;
  tone: string;
  score: {
    overall: number;
    clarity: number;
    compliance: number;
    completeness: number;
    professionalism: number;
    riskExposure: number;
    rationale: string;
  };
  keyDetails: string[];
  risks: string[];
  mitigations: string[];
  obligations: string[];
  recommendedActions: string[];
  provider?: string;
  model?: string;
} | null;

type UploadedPdfDraft = {
  fileName: string;
  mimeType: string;
  dataUrl: string;
} | null;

const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Failed to read the selected PDF file.'));
  reader.readAsDataURL(file);
});

function InfoHint({ label }: { label: string }) {
  return (
    <span className="group/tooltip relative inline-flex">
      <span
        aria-label={label}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white/98 text-slate-600 shadow-sm transition hover:border-slate-400 hover:text-slate-950"
      >
        <CircleHelp className="h-3.5 w-3.5" />
      </span>
      <span className="pointer-events-none absolute left-1/2 top-full z-[140] mt-2 hidden w-72 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-2xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-[12px] font-medium leading-6 text-white shadow-[0_22px_44px_rgba(15,23,42,0.32)] backdrop-blur-xl group-hover/tooltip:block group-focus-within/tooltip:block">
        {label}
      </span>
    </span>
  );
}

function RailHoverBadge({ label }: { label: string }) {
  return (
    <span
      className="pointer-events-none absolute left-1/2 top-0 z-[140] -translate-x-1/2 -translate-y-[138%] whitespace-nowrap rounded-full border border-white/35 bg-[linear-gradient(180deg,rgba(15,23,42,0.86),rgba(15,23,42,0.62))] px-3 py-1 text-[11px] font-semibold tracking-[-0.01em] text-white shadow-[0_16px_34px_rgba(15,23,42,0.28)] opacity-0 transition duration-200 ease-out group-hover:opacity-100 group-hover:-translate-y-[156%] group-focus-visible:opacity-100 group-focus-visible:-translate-y-[156%]"
      aria-hidden="true"
    >
      {label}
    </span>
  );
}

type FeatureOverviewStat = {
  label: string;
  value: string;
  hint?: string;
  onClick?: () => void;
};

type FeatureOverviewCardProps = {
  title: string;
  description: string;
  stats: FeatureOverviewStat[];
  expanded: boolean;
  onToggle: () => void;
  historyLabel?: string;
  onHistoryOpen?: () => void;
};

function FeatureOverviewCard({
  title,
  description,
  stats,
  expanded,
  onToggle,
  historyLabel,
  onHistoryOpen,
}: FeatureOverviewCardProps) {
  return (
    <Card className="clay-panel overflow-hidden border-white/60 bg-white/82 backdrop-blur">
      <CardContent className="p-5 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight text-slate-950 md:text-2xl">{title}</h2>
              <InfoHint label={description} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {onHistoryOpen && historyLabel ? (
              <Button type="button" variant="outline" size="sm" onClick={onHistoryOpen} className="rounded-xl">
                <History className="mr-2 h-4 w-4" />
                {historyLabel}
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={onToggle} className="rounded-xl">
              {expanded ? 'Hide details' : 'Show details'}
            </Button>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((stat) => (
            <button
              key={stat.label}
              type="button"
              onClick={stat.onClick}
              className={`rounded-2xl border border-white/70 bg-white/80 p-3.5 text-left shadow-sm ${stat.onClick ? 'transition hover:border-slate-300 hover:bg-slate-50' : ''}`}
            >
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{stat.label}</p>
                {stat.hint ? <InfoHint label={stat.hint} /> : null}
              </div>
              <p className="mt-2 break-words text-lg font-semibold tracking-[-0.03em] text-slate-950">{stat.value}</p>
            </button>
          ))}
        </div>
        {expanded ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm text-slate-600">
            {description}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function DocumentGenerator() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clientNowIso] = useState(() => new Date().toISOString());
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);
  const [selectedSignatureId, setSelectedSignatureId] = useState('');
  const [selectedDesignPreset, setSelectedDesignPreset] = useState<DocumentDesignPreset>(DEFAULT_DOCUMENT_DESIGN_PRESET);
  const [examplePreviewOpen, setExamplePreviewOpen] = useState(false);
  const [examplePreviewPreset, setExamplePreviewPreset] = useState<DocumentDesignPreset>(DEFAULT_DOCUMENT_DESIGN_PRESET);
  const [previewFullscreenOpen, setPreviewFullscreenOpen] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [generatedHtml, setGeneratedHtml] = useState('');
  const livePreviewUpdateTimeoutRef = useRef<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(true);
  const [dashboardUsageOpen, setDashboardUsageOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [expandedNavGroups, setExpandedNavGroups] = useState<string[]>(['home', 'create', 'review', 'share', 'collaboration', 'account', 'scratchpad-tools']);
  const [workspacePanelsOpen, setWorkspacePanelsOpen] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState('dashboard');
  const initialTabResolvedRef = useRef(false);
  const [showVisualizerModal, setShowVisualizerModal] = useState(false);
  const [templateStudioOpen, setTemplateStudioOpen] = useState(false);
  const [dashboardTemplateTab, setDashboardTemplateTab] = useState<'mine' | 'all'>('mine');
  const [templateEntitlements, setTemplateEntitlements] = useState<Array<TemplateMarketplacePurchase & { item?: any }>>([]);
  const [templateEntitlementsLoading, setTemplateEntitlementsLoading] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourMode, setTourMode] = useState<'full' | WorkspaceTourFeatureKey>('full');
  const [tourStepIndex, setTourStepIndex] = useState(0);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailData, setEmailData] = useState({ to: '', subject: '', note: '' });
  const [emailTargetEntry, setEmailTargetEntry] = useState<DocumentHistory | null>(null);
  const [recipientSignatureRequired, setRecipientSignatureRequired] = useState(true);
  const [requiredDocumentWorkflowEnabled, setRequiredDocumentWorkflowEnabled] = useState(false);
  const [requiredDocumentsText, setRequiredDocumentsText] = useState('');
  const [shareAccessPolicy, setShareAccessPolicy] = useState<'standard' | 'expiring' | 'one_time'>('standard');
  const [shareExpiryDays, setShareExpiryDays] = useState('7');
  const [maxAccessCount, setMaxAccessCount] = useState('1');
  const [shareLinkModalOpen, setShareLinkModalOpen] = useState(false);
  const [recipientAccess, setRecipientAccess] = useState<RecipientAccessLevel>('comment');
  const [dataCollectionEnabled, setDataCollectionEnabled] = useState(false);
  const [dataCollectionInstructions, setDataCollectionInstructions] = useState('');
  const [signaturePlacementMode, setSignaturePlacementMode] = useState<'last' | 'all' | 'pages'>('last');
  const [signaturePlacementPages, setSignaturePlacementPages] = useState('1');
  const [signaturePlacementPosition, setSignaturePlacementPosition] = useState<'bottom_right' | 'bottom_left' | 'top_right' | 'top_left' | 'center'>('bottom_right');
  const [signaturePlacementEditorMode, setSignaturePlacementEditorMode] = useState<'boxes' | 'quick'>('boxes');
  const [signatureBoxes, setSignatureBoxes] = useState<RecipientSignatureBoxPlacement[]>([]);
  const [signatureBoxEditorOpen, setSignatureBoxEditorOpen] = useState(false);
  const [recipientSignerConfigsByKey, setRecipientSignerConfigsByKey] = useState<Record<string, any>>({});
  const [recipientSignerDirectory, setRecipientSignerDirectory] = useState<Record<string, any>>({});
  const [recipientSigningMode, setRecipientSigningMode] = useState<'parallel' | 'sequential'>('parallel');
  const [isSendingSignerLinks, setIsSendingSignerLinks] = useState(false);
  const [isSendingSignerReminder, setIsSendingSignerReminder] = useState(false);
  const [signerMailActionByKey, setSignerMailActionByKey] = useState<Record<string, {
    sendingLink?: boolean;
    sendingReminder?: boolean;
    lastLinkStatus?: 'sent' | 'failed';
    lastLinkMessage?: string;
    lastReminderStatus?: 'sent' | 'failed';
    lastReminderMessage?: string;
    updatedAt?: string;
  }>>({});
  const [signingStatusEntry, setSigningStatusEntry] = useState<DocumentHistory | null>(null);
  const [history, setHistory] = useState<DocumentHistory[]>([]);
  const [dashboard, setDashboard] = useState<DashboardMetrics>(emptyDashboard);
  const [currentHistoryEntry, setCurrentHistoryEntry] = useState<DocumentHistory | null>(null);
  const [uploadedPdfDraft, setUploadedPdfDraft] = useState<UploadedPdfDraft>(null);
  const [isSendingUploadedPdf, setIsSendingUploadedPdf] = useState(false);
  const [generateSubTab, setGenerateSubTab] = useState<'create' | 'esign'>('create');
  const [esignStep, setEsignStep] = useState<'upload' | 'security' | 'share'>('upload');
  const [signatureSettings, setSignatureSettings] = useState<SignatureSettings>({ signatures: [] });
  const [collaborationSettings, setCollaborationSettings] = useState<CollaborationSettings>(emptyCollaborationSettings);
  const [platformConfig, setPlatformConfig] = useState<PlatformConfig | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [isCreatingDataCollectionRequest, setIsCreatingDataCollectionRequest] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyingCommentId, setReplyingCommentId] = useState('');
  const [dashboardSearch, setDashboardSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'signed' | 'unsigned'>('all');
  const [historySourceFilter, setHistorySourceFilter] = useState<'all' | 'upload' | 'generated'>('all');
  const [historyEmailFilter, setHistoryEmailFilter] = useState<'all' | 'sent' | 'pending' | 'failed'>('all');
  const [historyAccessFilter, setHistoryAccessFilter] = useState<'all' | RecipientAccessLevel>('all');
  const [historyDateFilter, setHistoryDateFilter] = useState<'all' | '7d' | '30d' | '90d'>('30d');
  const [historySort, setHistorySort] = useState<'newest' | 'oldest'>('newest');
  const [systemNotificationsReadIds, setSystemNotificationsReadIds] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<WorkspaceNotification[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [feedbackPromptOpen, setFeedbackPromptOpen] = useState(false);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackPromptLoaded, setFeedbackPromptLoaded] = useState(false);
  const [feedbackForm, setFeedbackForm] = useState({
    rating: '4',
    summary: '',
    painPoints: '',
    requestedImprovements: '',
  });
  const [mobileTabUsage, setMobileTabUsage] = useState<Record<string, number>>({});
  const [expandedFeatureDetails, setExpandedFeatureDetails] = useState<Record<string, boolean>>({});
  const [profileOverview, setProfileOverview] = useState<ProfileOverview | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [summaryPage, setSummaryPage] = useState(1);
  const [summaryFilter, setSummaryFilter] = useState<'all' | 'signed'>('all');
  const [feedbackPage, setFeedbackPage] = useState(1);
  const [draftRestored, setDraftRestored] = useState(false);
  const [clientBusinessSettings, setClientBusinessSettings] = useState<BusinessSettings | null>(null);
  const [aiDraftLoading, setAiDraftLoading] = useState(false);
  const [aiGenerationLoading, setAiGenerationLoading] = useState(false);
  const [aiWorkspaceLoading, setAiWorkspaceLoading] = useState(false);
  const [aiDraftInsights, setAiDraftInsights] = useState<DraftAiInsights>(null);
  const [aiWorkspaceInsights, setAiWorkspaceInsights] = useState<WorkspaceAiInsights>(null);
  const [aiGenerationPrompt, setAiGenerationPrompt] = useState('');
  const [aiGeneratedDraft, setAiGeneratedDraft] = useState<AiGeneratedDraft>(null);
  const [documentParserLoading, setDocumentParserLoading] = useState(false);
  const [documentParserTitle, setDocumentParserTitle] = useState('');
  const [documentParserContent, setDocumentParserContent] = useState('');
  const [documentParserSourceLabel, setDocumentParserSourceLabel] = useState('');
  const [parsedDocumentInsights, setParsedDocumentInsights] = useState<ParsedDocumentInsights>(null);
  const [documentParserError, setDocumentParserError] = useState('');
  const [documentParserSuccess, setDocumentParserSuccess] = useState('');
  const [documentParserHistory, setDocumentParserHistory] = useState<ParserHistoryEntry[]>([]);
  const [activeParserHistoryId, setActiveParserHistoryId] = useState('');
  const [documentWatermarkLabel, setDocumentWatermarkLabel] = useState('');
  const [signatureCertificateBrandingEnabled, setSignatureCertificateBrandingEnabled] = useState(true);
  const [signatureReceiptCompletionPageEnabled, setSignatureReceiptCompletionPageEnabled] = useState(true);
  const [onboardingContext, setOnboardingContext] = useState({
    employeeName: '',
    employeeEmail: '',
    employeeDepartment: '',
    employeeDesignation: '',
    employeeCode: '',
  });

  const userPermissions = useMemo(() => session?.user?.permissions || [], [session?.user?.permissions]);
  const isClient = session?.user?.role === 'client' || session?.user?.role === 'individual';
  const isEmployee = session?.user?.role === 'employee';
  const isAdmin = session?.user?.role === 'admin';
  const workspaceTourStorageKey = useMemo(
    () => `${WORKSPACE_TOUR_STORAGE_KEY}:${session?.user?.email || session?.user?.name || 'guest'}`,
    [session?.user?.email, session?.user?.name],
  );
  const mobileTabUsageStorageKey = useMemo(
    () => `${MOBILE_TAB_USAGE_PREFIX}${session?.user?.email || session?.user?.name || 'guest'}`,
    [session?.user?.email, session?.user?.name],
  );
  const lastTrackedTabRef = useRef('');
  const sessionStartTrackedRef = useRef('');
  const globalSearchBarRef = useRef<import('./GlobalSearchBar').GlobalSearchBarHandle | null>(null);
  const activeTourSteps = useMemo(
    () => (tourMode === 'full' ? fullWorkspaceTour : workspaceTours[tourMode]?.steps || []),
    [tourMode],
  );
  const activeTourTitle = tourMode === 'full' ? 'docrud Workspace Tour' : workspaceTours[tourMode]?.label || 'Workspace Tour';
  const activeTourSummary = tourMode === 'full'
    ? 'Walk through the main docrud modules in sequence so you can understand where to create, analyze, manage, and track work confidently.'
    : workspaceTours[tourMode]?.summary || 'Guided help for this workspace feature.';
  const activeTourStep = activeTourSteps[tourStepIndex] || null;
  const clientPlanFeatures = useMemo(() => new Set(session?.user?.planFeatures || []), [session?.user?.planFeatures]);
  const clientPlanName = session?.user?.subscription?.planName || 'docrud Workspace Trial';
  const hasClientFeature = useCallback((feature: string) => !isClient || clientPlanFeatures.has(feature), [clientPlanFeatures, isClient]);
  const effectivePlanId = profileOverview?.subscription?.planId || session?.user?.subscription?.planId || '';
  const dashboardScope = useMemo(() => {
    const planId = effectivePlanId || '';
    if (planId === 'talent-directory-pass') return 'talent' as const;
    if (planId === 'gigs-pass') return 'gigs' as const;
    return 'workspace' as const;
  }, [effectivePlanId]);
  const isPassOnlyAccount = useMemo(
    () => !isAdmin && !isEmployee && (dashboardScope === 'talent' || dashboardScope === 'gigs'),
    [dashboardScope, isAdmin, isEmployee],
  );
  const scopeAllowsWorkspaceModules = true;
  const scopeAllowsTalent = true;
  const scopeAllowsGigs = true;
  const allowedTabsForAccount = useMemo(() => {
    if (!isPassOnlyAccount) return null;
    if (dashboardScope === 'talent') {
      return new Set(['dashboard', 'talent-leads', 'profile', 'billing', 'tutorials', 'support']);
    }
    if (dashboardScope === 'gigs') {
      return new Set(['dashboard', 'gigs', 'profile', 'billing', 'tutorials', 'support']);
    }
    return null;
  }, [dashboardScope, isPassOnlyAccount]);
  const isTabLocked = useCallback((tabId: string) => {
    if (!allowedTabsForAccount) return false;
    return !allowedTabsForAccount.has(tabId);
  }, [allowedTabsForAccount]);
  const [upgradePrompt, setUpgradePrompt] = useState<{ open: boolean; title: string; pricingTab: 'workspace' | 'talent' | 'gigs' }>({
    open: false,
    title: '',
    pricingTab: 'workspace',
  });
  const openUpgradePrompt = useCallback((tabId: string, label?: string) => {
    const pricingTab = tabId === 'gigs'
      ? 'gigs'
      : tabId === 'talent-leads'
        ? 'talent'
        : 'workspace';
    setUpgradePrompt({
      open: true,
      title: label ? `${label} requires an upgrade.` : 'This feature requires an upgrade.',
      pricingTab,
    });
  }, []);
  const attemptOpenTab = useCallback((tabId: string, label?: string) => {
    if (tabId === 'visualizer') {
      setShowVisualizerModal(true);
      return;
    }
    if (isTabLocked(tabId)) {
      openUpgradePrompt(tabId, label);
      return;
    }
    setActiveTab(tabId);
  }, [isTabLocked, openUpgradePrompt]);
  const isInternalMember = session?.user?.role === 'member';
  const isBoardRoomOnlyUser = session?.user?.workspaceAccessMode === 'board_room_only';
  const hasWorkspacePermission = useCallback((permission: string) => {
    if (!isInternalMember) {
      return true;
    }
    return userPermissions.includes('all') || userPermissions.includes(permission);
  }, [isInternalMember, userPermissions]);
  const isPlatformFeatureEnabled = useCallback((feature: PlatformFeatureControlKey) => {
    return platformConfig?.featureControls?.[feature] !== false;
  }, [platformConfig]);
  const canAccessFeature = useCallback((feature: PlatformFeatureControlKey, options?: {
    clientFeature?: string;
    permission?: string;
    internalOnly?: boolean;
  }) => {
    if (!isPlatformFeatureEnabled(feature)) {
      return false;
    }
    if (options?.internalOnly && isInternalMember) {
      return false;
    }
    if (options?.clientFeature && isClient && !hasClientFeature(options.clientFeature)) {
      return false;
    }
    if (options?.permission && !hasWorkspacePermission(options.permission)) {
      return false;
    }
    return true;
  }, [hasClientFeature, hasWorkspacePermission, isClient, isInternalMember, isPlatformFeatureEnabled]);
  const clientCanAccessDashboard = !isClient || clientPlanFeatures.has('dashboard');
  const isOnboardingTemplate = useMemo(() => {
    if (!selectedTemplate) return false;
    return selectedTemplate.category?.toLowerCase() === 'hr' || ONBOARDING_TEMPLATE_IDS.includes(selectedTemplate.id);
  }, [selectedTemplate]);
  const allowedTemplates = useMemo(() => {
    if (userPermissions.includes('all')) {
      return templates;
    }

    const permitted = templates.filter((template) => userPermissions.includes(template.id));
    return permitted.length > 0 ? permitted : templates;
  }, [templates, userPermissions]);
  const availableSignatures = useMemo(() => signatureSettings.signatures || [], [signatureSettings.signatures]);
  const selectedSignature: SignatureRecord | null = useMemo(
    () => availableSignatures.find((signature) => signature.id === selectedSignatureId) || null,
    [availableSignatures, selectedSignatureId]
  );

  const getTemplatePageRenderOptions = useCallback((template?: DocumentTemplate | null) => {
    if (!template?.isCustom) return {};
    const settings = template.renderSettings;
    if (!settings) return {};
    const pageSize = settings.pageSize === 'Custom' ? 'A4' : settings.pageSize;
    return {
      pageSize: pageSize as 'A4' | 'Letter' | 'Legal' | undefined,
      pageWidthMm: settings.pageSize === 'Custom' ? settings.pageWidthMm : undefined,
      pageHeightMm: settings.pageSize === 'Custom' ? settings.pageHeightMm : undefined,
      pageMarginMm: typeof settings.pageMarginMm === 'number' ? settings.pageMarginMm : undefined,
      pageNumbersEnabled: Boolean(settings.pageNumbersEnabled),
      pageBackgroundCss: typeof settings.pageBackgroundCss === 'string' ? settings.pageBackgroundCss : undefined,
    };
  }, []);
  const completedRequiredFields = useMemo(
    () => (selectedTemplate?.fields || []).filter((field) => field.required && formData[field.name]?.trim()).length,
    [formData, selectedTemplate]
  );
  const requiredFieldCount = useMemo(
    () => (selectedTemplate?.fields || []).filter((field) => field.required).length,
    [selectedTemplate]
  );
  const completionPercentage = requiredFieldCount === 0 ? 100 : Math.round((completedRequiredFields / requiredFieldCount) * 100);
  const latestTemplateHistoryEntry = useMemo(
    () => history.find((entry) => entry.templateId === selectedTemplate?.id),
    [history, selectedTemplate?.id]
  );
  const searchResults = useMemo(() => {
    const query = dashboardSearch.trim().toLowerCase();
    if (!query) return [];
    return dashboard.documentSummary.filter((item) =>
      [item.templateName, item.referenceNumber, item.latestActivityLabel, ...(item.uniqueDevices || [])]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(query))
    ).slice(0, 6);
  }, [dashboard.documentSummary, dashboardSearch]);
  const standardHistory = useMemo(
    () => history.filter((entry) => entry.templateId !== 'docsheet-workbook'),
    [history],
  );
  const historySummaryByReference = useMemo(() => {
    const map = new Map<string, (typeof dashboard.documentSummary)[number]>();
    for (const item of dashboard.documentSummary) {
      if (item.referenceNumber) map.set(item.referenceNumber, item);
    }
    return map;
  }, [dashboard.documentSummary]);
  const filteredHistory = useMemo(() => {
    const now = Date.now();
    const minTimestamp = historyDateFilter === '7d'
      ? now - 7 * 24 * 60 * 60 * 1000
      : historyDateFilter === '30d'
        ? now - 30 * 24 * 60 * 60 * 1000
        : historyDateFilter === '90d'
          ? now - 90 * 24 * 60 * 60 * 1000
          : null;

    const query = historySearch.trim().toLowerCase();
    const matchesQuery = (entry: DocumentHistory) => {
      if (!query) return true;
      return [
        entry.templateName,
        entry.referenceNumber,
        entry.generatedBy,
        entry.uploadedPdfFileName,
        entry.emailTo,
        entry.documentSourceType,
        entry.emailStatus,
        entry.sharePassword,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    };

    const matchesFilters = (entry: DocumentHistory) => {
      const signed = Boolean(entry.recipientSignedAt);
      if (historyStatusFilter === 'signed' && !signed) return false;
      if (historyStatusFilter === 'unsigned' && signed) return false;

      const source = entry.documentSourceType === 'uploaded_pdf' ? 'upload' : 'generated';
      if (historySourceFilter !== 'all' && historySourceFilter !== source) return false;

      const emailStatus = (entry.emailStatus || (entry.emailSent ? 'sent' : 'pending')).toLowerCase();
      if (historyEmailFilter !== 'all' && historyEmailFilter !== (emailStatus === 'sent' ? 'sent' : emailStatus === 'failed' ? 'failed' : 'pending')) return false;

      const access = (entry.recipientAccess || 'comment') as RecipientAccessLevel;
      if (historyAccessFilter !== 'all' && historyAccessFilter !== access) return false;

      if (minTimestamp !== null) {
        const created = +new Date(entry.generatedAt || '');
        if (!Number.isFinite(created) || created < minTimestamp) return false;
      }

      return true;
    };

    const filtered = standardHistory.filter((entry) => matchesQuery(entry) && matchesFilters(entry));
    const sorted = [...filtered].sort((left, right) => {
      const leftTime = +new Date(left.generatedAt || 0);
      const rightTime = +new Date(right.generatedAt || 0);
      return historySort === 'oldest' ? leftTime - rightTime : rightTime - leftTime;
    });

    return sorted;
  }, [
    historyAccessFilter,
    historyDateFilter,
    historyEmailFilter,
    historySearch,
    historySort,
    historySourceFilter,
    historyStatusFilter,
    standardHistory,
  ]);

  useEffect(() => { setIsMounted(true); }, []);
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);
  useEffect(() => {
    setHistoryPage(1);
  }, [historyAccessFilter, historyDateFilter, historyEmailFilter, historySearch, historySort, historySourceFilter, historyStatusFilter]);
  const filteredSummaryItems = useMemo(() => {
    const byMode = summaryFilter === 'signed'
      ? dashboard.documentSummary.filter((item) => item.signCount > 0)
      : dashboard.documentSummary;
    const query = dashboardSearch.trim().toLowerCase();
    if (!query) {
      return byMode;
    }
    return byMode.filter((item) =>
      [item.templateName, item.referenceNumber, item.latestActivityLabel, ...(item.uniqueDevices || [])]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(query))
    );
  }, [dashboard.documentSummary, dashboardSearch, summaryFilter]);
  const paginatedHistory = useMemo(() => {
    const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
    return filteredHistory.slice(start, start + HISTORY_PAGE_SIZE);
  }, [filteredHistory, historyPage]);
  const paginatedSummary = useMemo(() => {
    const start = (summaryPage - 1) * SUMMARY_PAGE_SIZE;
    return filteredSummaryItems.slice(start, start + SUMMARY_PAGE_SIZE);
  }, [filteredSummaryItems, summaryPage]);
  const paginatedFeedback = useMemo(() => {
    const start = (feedbackPage - 1) * FEEDBACK_PAGE_SIZE;
    return dashboard.recentFeedback.slice(start, start + FEEDBACK_PAGE_SIZE);
  }, [dashboard.recentFeedback, feedbackPage]);
  const uploadedPdfHistory = useMemo(
    () => history.filter((entry) => entry.documentSourceType === 'uploaded_pdf').sort((a, b) => +new Date(b.generatedAt) - +new Date(a.generatedAt)),
    [history],
  );
  const esignLinkHistory = useMemo(
    () => history
      .filter((entry) => (entry.shareId || entry.shareUrl) && entry.templateId !== 'docsheet-workbook')
      .sort((a, b) => +new Date(b.generatedAt) - +new Date(a.generatedAt)),
    [history],
  );
  const systemNotifications = useMemo<WorkspaceNotification[]>(() => {
    const readSet = new Set(systemNotificationsReadIds);
    const items: WorkspaceNotification[] = [];

    if (profileOverview) {
      const threshold = profileOverview.threshold;
      if (threshold.state !== 'healthy') {
        const id = 'sys:plan-usage';
        const tone = threshold.state === 'limit_reached'
          ? 'rose'
          : threshold.state === 'critical'
            ? 'amber'
            : 'sky';
        items.push({
          id,
          type: 'system',
          title: threshold.state === 'limit_reached' ? 'Plan capacity reached' : 'Plan capacity warning',
          body: threshold.recommendation || `You’ve used ${threshold.percentUsed}% of your current plan.`,
          href: 'tab:profile',
          createdAt: profileOverview.subscription.currentPeriodStart || clientNowIso,
          read: readSet.has(id),
          tone,
          metadata: { status: threshold.state },
        });
      }

      const remainingAiCredits = profileOverview.subscription.remainingAiCredits ?? 0;
      const remainingAiTrialRuns = profileOverview.subscription.remainingAiTrialRuns ?? 0;
      if (remainingAiCredits > 0 && remainingAiCredits <= 25) {
        const id = 'sys:ai-credits-low';
        items.push({
          id,
          type: 'system',
          title: 'AI credits running low',
          body: `${remainingAiCredits} credits left for this billing cycle. Top up or upgrade before you hit a hard stop.`,
          href: 'tab:billing',
          createdAt: profileOverview.subscription.currentPeriodStart || clientNowIso,
          read: readSet.has(id),
          tone: remainingAiCredits <= 10 ? 'amber' : 'sky',
        });
      } else if (remainingAiCredits === 0 && remainingAiTrialRuns > 0) {
        const id = 'sys:ai-trials-available';
        items.push({
          id,
          type: 'system',
          title: 'AI tries available',
          body: `${remainingAiTrialRuns} free AI tries left. Use them on drafting, rewriting, or review.`,
          href: 'tab:generate',
          createdAt: profileOverview.subscription.currentPeriodStart || clientNowIso,
          read: readSet.has(id),
          tone: 'emerald',
        });
      }

      const periodEndRaw = profileOverview.subscription.currentPeriodEnd;
      if (periodEndRaw) {
        const periodEnd = new Date(periodEndRaw);
        if (Number.isFinite(periodEnd.getTime())) {
          const daysLeft = Math.ceil((periodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          if (daysLeft >= 0 && daysLeft <= 3) {
            const id = 'sys:billing-period-ending';
            items.push({
              id,
              type: 'system',
              title: profileOverview.subscription.status === 'trial' ? 'Trial ending soon' : 'Billing cycle ending soon',
              body: daysLeft === 0 ? 'Ends today. Make sure your billing is set so work doesn’t get blocked.' : `Ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`,
              href: 'tab:billing',
              createdAt: periodEnd.toISOString(),
              read: readSet.has(id),
              tone: daysLeft <= 1 ? 'amber' : 'sky',
            });
          }
        }
      }

      if (profileOverview.subscription.status === 'upgrade_required') {
        const id = 'sys:renew-required';
        items.push({
          id,
          type: 'system',
          title: 'Plan renewal required',
          body: 'Your current plan period has ended. Renew or upgrade to restore access and reset limits.',
          href: 'tab:billing',
          createdAt: clientNowIso,
          read: readSet.has(id),
          tone: 'amber',
        });
      }
    }

    const expiringLinks = standardHistory.filter((entry) => (
      entry.shareAccessPolicy === 'expiring'
      && typeof entry.shareExpiresAt === 'string'
      && Number.isFinite(new Date(entry.shareExpiresAt).getTime())
      && new Date(entry.shareExpiresAt).getTime() > Date.now()
      && new Date(entry.shareExpiresAt).getTime() - Date.now() < 1000 * 60 * 60 * 48
    ));
    if (expiringLinks.length > 0) {
      const soonest = expiringLinks.map((entry) => new Date(entry.shareExpiresAt as string).getTime()).sort((a, b) => a - b)[0];
      const id = 'sys:share-links-expiring';
      items.push({
        id,
        type: 'system',
        title: 'Share links expiring soon',
        body: `${expiringLinks.length} link${expiringLinks.length === 1 ? '' : 's'} will expire within 48 hours.`,
        href: 'tab:history',
        createdAt: Number.isFinite(soonest) ? new Date(soonest).toISOString() : clientNowIso,
        read: readSet.has(id),
        tone: 'amber',
      });
    }

    const pendingFeedbackTotal = dashboard.documentSummary.reduce((sum, item) => sum + (item.pendingFeedbackCount || 0), 0);
    if (pendingFeedbackTotal > 0) {
      const id = 'sys:pending-feedback';
      const latest = dashboard.documentSummary.map((item) => item.latestActivityAt || item.generatedAt).filter(Boolean).map((value) => new Date(value).getTime()).filter(Number.isFinite).sort((a, b) => b - a)[0];
      items.push({
        id,
        type: 'system',
        title: 'Feedback needs attention',
        body: `${pendingFeedbackTotal} pending comment${pendingFeedbackTotal === 1 ? '' : 's'} across recent documents. Open Summary to review and reply.`,
        href: 'tab:summary',
        createdAt: Number.isFinite(latest) ? new Date(latest).toISOString() : clientNowIso,
        read: readSet.has(id),
        tone: 'sky',
      });
    }

    return items;
  }, [clientNowIso, dashboard.documentSummary, profileOverview, standardHistory, systemNotificationsReadIds]);

  const mergedNotifications = useMemo(() => {
    const deduped = new Map<string, WorkspaceNotification>();
    for (const item of [...systemNotifications, ...notifications]) {
      deduped.set(item.id, item);
    }
    return Array.from(deduped.values()).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [notifications, systemNotifications]);

  const unreadNotificationsCount = useMemo(
    () => mergedNotifications.filter((entry) => !entry.read).length,
    [mergedNotifications],
  );
  const recentNotifications = useMemo(
    () => mergedNotifications.slice(0, 6),
    [mergedNotifications],
  );
  const briefingNotificationItems = useMemo(
    () => mergedNotifications.slice(0, 3),
    [mergedNotifications],
  );
  const workspaceInsightsUpdatedLabel = useMemo(() => {
    if (!aiWorkspaceInsights?.generatedAt) {
      return 'Waiting for fresh signals';
    }

    const generatedAt = new Date(aiWorkspaceInsights.generatedAt);
    if (Number.isNaN(generatedAt.getTime())) {
      return 'Freshly generated';
    }

    const diffMinutes = Math.max(0, Math.round((Date.now() - generatedAt.getTime()) / 60000));
    if (diffMinutes < 1) return 'Updated just now';
    if (diffMinutes < 60) return `Updated ${diffMinutes} min ago`;
    return `Updated ${Math.round(diffMinutes / 60)} hr ago`;
  }, [aiWorkspaceInsights?.generatedAt]);
  const examplePreviewHtml = useMemo(
    () => renderDocumentTemplate(examplePreviewTemplate, examplePreviewData, {
      generatedBy: 'docrud design studio',
      designPreset: examplePreviewPreset,
      watermarkLabel: CLIENT_PREVIEW_WATERMARK,
    }),
    [examplePreviewPreset]
  );
  const historyPageCount = Math.max(1, Math.ceil(filteredHistory.length / HISTORY_PAGE_SIZE));
  const summaryPageCount = Math.max(1, Math.ceil(filteredSummaryItems.length / SUMMARY_PAGE_SIZE));
  const feedbackPageCount = Math.max(1, Math.ceil(dashboard.recentFeedback.length / FEEDBACK_PAGE_SIZE));
  const dashboardQuickActions = useMemo(() => {
    const actions: Array<{ id: string; label: string; description: string; icon: typeof FileText; tab: string }> = [];

    if (!isEmployee && canAccessFeature('generate_documents', { clientFeature: 'generate_documents', permission: 'generate_documents' })) {
      actions.push({ id: 'generate', label: 'Generate', description: 'Create the next business document quickly', icon: FileText, tab: 'generate' });
    }
    if (!isEmployee) {
      if (hasWorkspacePermission('profile')) actions.push({ id: 'profile', label: 'Profile', description: 'See your plan, limits, and current usage clearly', icon: ShieldCheck, tab: 'profile' });
      if (!isInternalMember) actions.push({ id: 'billing', label: 'Billing', description: 'Upgrade before work hits a limit', icon: CreditCard, tab: 'billing' });
      if (canAccessFeature('support', { permission: 'support' })) actions.push({ id: 'support', label: 'Support', description: 'Get fast help without leaving the workspace', icon: CircleHelp, tab: 'support' });
      actions.push({ id: 'daily-tools', label: 'Tools', description: 'Handle quick conversions and file fixes instantly', icon: Sparkles, tab: 'daily-tools' });
      actions.push({ id: 'scratchpad', label: 'Scratchpad', description: 'Freehand whiteboard, sticky notes, shapes, share and live collaboration', icon: PenLine, tab: 'scratchpad' });
      if (canAccessFeature('virtual_id', { clientFeature: 'virtual_id', permission: 'virtual_id' })) actions.push({ id: 'virtual-id', label: 'Virtual ID', description: 'Publish a QR-ready profile page with live scan analytics', icon: QrCode, tab: 'virtual-id' });
      if (canAccessFeature('e_certificates', { clientFeature: 'e_certificates', permission: 'e_certificates' })) actions.push({ id: 'certificates', label: 'Certificates', description: 'Issue e-certificates with public verification pages', icon: Award, tab: 'certificates' });
      if (canAccessFeature('hiring_desk', { clientFeature: 'hiring_desk', permission: 'hiring_desk' })) actions.push({ id: 'hiring-desk', label: 'Hiring', description: session?.user?.accountType === 'individual' ? 'Find ATS-qualified jobs and apply directly' : 'Post roles and review ATS-qualified candidates', icon: BriefcaseBusiness, tab: 'hiring-desk' });
      if (scopeAllowsGigs) actions.push({ id: 'gigs', label: 'Gigs', description: 'List project briefs, filter by interest, and manage direct replies', icon: BriefcaseBusiness, tab: 'gigs' });
      if (scopeAllowsTalent) actions.push({ id: 'talent-leads', label: 'Talent', description: 'Manage unlocked contacts with stages and notes', icon: FileSearch, tab: 'talent-leads' });
      if (canAccessFeature('docrudians', { clientFeature: 'docrudians', permission: 'docrudians' })) actions.push({ id: 'docrudians', label: 'Docrudians', description: 'Create secure public and private rooms for teams, students, and events', icon: Users, tab: 'docrudians' });
      if (canAccessFeature('team_workspace', { clientFeature: 'team_workspace', permission: 'team_workspace', internalOnly: true })) actions.push({ id: 'team-workspace', label: 'Team', description: 'Add teammates and run work together', icon: Users, tab: 'team-workspace' });
      if (canAccessFeature('deal_room', { clientFeature: 'deal_room', permission: 'deal_room' })) actions.push({ id: 'deal-room', label: 'Board Room', description: 'Run clients, vendors, and approvals through one governed board room', icon: BriefcaseBusiness, tab: 'deal-room' });
      if (canAccessFeature('internal_mailbox', { permission: 'internal_mailbox' })) actions.push({ id: 'internal-mailbox', label: 'Mailbox', description: 'Keep internal communication and follow-up in one inbox', icon: Mail, tab: 'internal-mailbox' });
      if (canAccessFeature('docsheet', { permission: 'docsheet' })) actions.push({ id: 'docsheet', label: 'DocSheet', description: 'Build and manage working sheets inside docrud', icon: FileSpreadsheet, tab: 'docsheet' });
      if (canAccessFeature('file_manager', { clientFeature: 'file_manager', permission: 'file_transfers' })) actions.push({ id: 'file-transfer', label: 'Transfer', description: 'Send files securely and see who actually engaged', icon: Upload, tab: 'file-transfers' });
      if (canAccessFeature('qr_drop', { clientFeature: 'file_manager', permission: 'file_transfers' })) actions.push({ id: 'qr-drop', label: 'QR Share', description: 'Generate a scannable cross-device file handoff in seconds', icon: QrCode, tab: 'qr-drop' });
      if (canAccessFeature('offline_locker', { clientFeature: 'file_manager', permission: 'file_transfers' })) actions.push({ id: 'offline-locker', label: 'Locker', description: 'Create password-locked files that open offline after unlock', icon: KeyRound, tab: 'offline-locker' });
      if (canAccessFeature('document_encrypter', { clientFeature: 'document_encrypter', permission: 'file_transfers' })) actions.push({ id: 'document-encrypter', label: 'Encrypter', description: 'Protect highly sensitive files before delivery', icon: Lock, tab: 'document-encrypter' });
    }
    if (!isEmployee && canAccessFeature('doxpert', { clientFeature: 'doxpert', permission: 'doxpert' })) {
      actions.push({ id: 'doxpert', label: 'DoXpert', description: 'Understand risk, weakness, and next steps in a document', icon: BrainCircuit, tab: 'doxpert' });
    }
    if (!isEmployee && canAccessFeature('generate_documents', { clientFeature: 'generate_documents', permission: 'generate_documents' })) {
      actions.push({ id: 'ai-compose', label: 'AI Compose', description: 'Start from an AI draft instead of a blank page', icon: Sparkles, tab: 'generate' });
    }
    if (!isEmployee && canAccessFeature('history', { clientFeature: 'history', permission: 'history' })) {
      actions.push({ id: 'history', label: 'History', description: 'Reopen, verify, or reuse past work quickly', icon: History, tab: 'history' });
    }
    if (!isEmployee && canAccessFeature('document_summary', { clientFeature: 'document_summary', permission: 'document_summary' })) {
      actions.push({ id: 'summary', label: 'Summary', description: 'See what is happening after documents are sent', icon: PieChart, tab: 'summary' });
    }
    if (isAdmin && isPlatformFeatureEnabled('workspace')) {
      actions.push({ id: 'ops', label: 'Document Ops', description: 'Go to workspace operations', icon: FolderKanban, tab: 'workspace' });
    }
    if (isClient && hasClientFeature('client_portal')) {
      actions.push({ id: 'portal', label: 'Client Portal', description: 'Track delivery and access', icon: BriefcaseBusiness, tab: 'client-portal' });
    }
    actions.push({ id: 'tutorials', label: 'Tutorials', description: 'Learn the product feature by feature', icon: BookOpen, tab: 'tutorials' });

    return actions.slice(0, 8);
  }, [canAccessFeature, hasClientFeature, hasWorkspacePermission, isAdmin, isClient, isEmployee, isInternalMember, isPlatformFeatureEnabled, scopeAllowsGigs, scopeAllowsTalent, session?.user?.accountType]);
  const dashboardGuideCards = useMemo(
    () => [
      {
        id: 'generate',
        label: 'E-sign Documents',
        why: 'Use this when you need a fresh controlled document, intake form, or signing workflow from an approved template.',
        steps: ['Choose a template.', 'Fill required fields and controls.', 'Generate preview, then send or download.'],
      },
      {
        id: 'history',
        label: 'History & Reuse',
        why: 'Use this to verify what happened, reopen shared records, or quickly issue similar documents again.',
        steps: ['Open the latest run.', 'Check delivery and comments.', 'Reuse past data for the next cycle.'],
      },
      {
        id: 'summary',
        label: 'Document Summary',
        why: 'Use this to track opens, downloads, edits, comments, and signature activity before following up.',
        steps: ['Review engagement metrics.', 'Spot stalled documents.', 'Open the relevant shared link and act.'],
      },
      {
        id: 'tutorials',
        label: 'Tutorial Center',
        why: 'Use this when a teammate needs plain-language guidance on what a feature does and how to operate it correctly.',
        steps: ['Pick a feature area.', 'Read why it matters.', 'Follow the step-by-step rollout notes.'],
      },
      {
        id: 'daily-tools',
        label: 'Daily Tools',
        why: 'Use this for quick everyday file tasks like converting, compressing, merging, splitting, and cleaning up documents without leaving docrud.',
        steps: ['Choose the right utility tool.', 'Upload the source file.', 'Download the processed result instantly.'],
      },
    ],
    []
  );
  const dashboardTrackingCards = useMemo(
    () => [
      {
        label: 'Shared link opens',
        value: dashboard.documentSummary.reduce((sum, item) => sum + item.openCount, 0),
        tone: 'bg-slate-950 text-white',
      },
      {
        label: 'Recipient downloads',
        value: dashboard.documentSummary.reduce((sum, item) => sum + item.downloadCount, 0),
        tone: 'bg-orange-50 text-slate-950',
      },
      {
        label: 'Pending feedback replies',
        value: dashboard.documentSummary.reduce((sum, item) => sum + item.pendingFeedbackCount, 0),
        tone: 'bg-amber-50 text-slate-950',
      },
    ],
    [dashboard.documentSummary]
  );
  const clientIndustryProfile = useMemo(
    () => getIndustryWorkspaceProfile(clientBusinessSettings?.industry),
    [clientBusinessSettings?.industry]
  );
  const canCustomizeSignatureCertificateBranding = useMemo(() => {
    if (isAdmin) {
      return true;
    }

    if (!isClient) {
      return false;
    }

    const status = session?.user?.subscription?.status;
    const planName = session?.user?.subscription?.planName || 'docrud Workspace Trial';
    return status === 'active' && planName !== 'docrud Workspace Trial';
  }, [isAdmin, isClient, session?.user?.subscription?.planName, session?.user?.subscription?.status]);

  const signerKeys = useMemo(() => {
    const directoryKeys = Object.keys(recipientSignerDirectory || {}).map((k) => String(k).trim()).filter(Boolean);
    const boxKeys = Array.from(new Set(
      (signatureBoxes || []).map((b: any) => String((b as any)?.signerKey || 'recipient').trim() || 'recipient'),
    ));
    const merged: string[] = [];
    [...directoryKeys, ...boxKeys].forEach((key) => {
      const normalized = String(key || '').trim();
      if (!normalized) return;
      if (!merged.includes(normalized)) merged.push(normalized);
    });
    return merged.length ? merged : ['recipient'];
  }, [recipientSignerDirectory, signatureBoxes]);

  const signingSetupSummary = useMemo(() => {
    const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
    const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

    const requiredBoxes = (signatureBoxes || []).filter((b: any) => (b as any)?.required !== false);
    const missingAssigneeBoxIds = requiredBoxes
      .filter((b: any) => !String((b as any)?.signerKey || '').trim())
      .map((b: any) => String((b as any)?.id || '').trim())
      .filter(Boolean);

    const requiredSignerKeys = Array.from(new Set(
      requiredBoxes
        .map((b: any) => String((b as any)?.signerKey || '').trim())
        .filter(Boolean),
    ));

    const signerEmailByKey = Object.fromEntries(
      requiredSignerKeys.map((key) => {
        const email = normalizeEmail((recipientSignerDirectory as any)?.[key]?.signerEmail);
        return [key, email];
      }),
    ) as Record<string, string>;

    const signersMissingEmail = requiredSignerKeys.filter((key) => !signerEmailByKey[key]);
    const signersInvalidEmail = requiredSignerKeys.filter((key) => {
      const email = signerEmailByKey[key];
      return email ? !isValidEmail(email) : false;
    });

    const boxesBySignerKey = Object.fromEntries(
      signerKeys.map((key) => [key, (signatureBoxes || []).filter((b: any) => String((b as any)?.signerKey || 'recipient').trim() === key)]),
    ) as Record<string, any[]>;

    const readyToSend = Boolean(requiredBoxes.length)
      && missingAssigneeBoxIds.length === 0
      && signersMissingEmail.length === 0
      && signersInvalidEmail.length === 0;

    const issueLines: string[] = [];
    if (!requiredBoxes.length) issueLines.push('Add at least one required signature box.');
    if (missingAssigneeBoxIds.length) issueLines.push('Assign a signer for every required box.');
    if (signersMissingEmail.length) issueLines.push('Add signer email for every required signer.');
    if (signersInvalidEmail.length) issueLines.push('Fix invalid signer emails.');

    return {
      requiredBoxesCount: requiredBoxes.length,
      missingAssigneeBoxIds,
      requiredSignerKeys,
      signerEmailByKey,
      signersMissingEmail,
      signersInvalidEmail,
      boxesBySignerKey,
      readyToSend,
      issueLines,
    };
  }, [recipientSignerDirectory, signatureBoxes, signerKeys]);

  useEffect(() => {
    setRecipientSignerConfigsByKey((current) => {
      const next: Record<string, any> = { ...(current || {}) };
      let changed = false;
      signerKeys.forEach((key) => {
        if (!next[key]) {
          changed = true;
          next[key] = {
            cameraCaptureEnabled: true,
            signatureDrawEnabled: true,
            signatureUploadEnabled: true,
            signatureTypedEnabled: false,
            initialsEnabled: false,
            emailOtpEnabled: false,
            consentRequired: true,
            captureIpDeviceLocationEnabled: true,
          };
        }
      });
      return changed ? next : (current || {});
    });
  }, [signerKeys]);

  useEffect(() => {
    setRecipientSignerDirectory((current) => {
      const next: Record<string, any> = { ...(current || {}) };
      let changed = false;
      signerKeys.forEach((key, index) => {
        if (!next[key]) {
          changed = true;
          next[key] = {
            signerKey: key,
            signerName: `Signer ${index + 1}`,
            signerEmail: '',
            signerRole: '',
            signingOrder: index + 1,
          };
        }
      });
      if (!Object.keys(next).length) {
        changed = true;
        next.recipient = {
          signerKey: 'recipient',
          signerName: 'Signer 1',
          signerEmail: '',
          signerRole: '',
          signingOrder: 1,
        };
      }
      return changed ? next : (current || {});
    });
  }, [signerKeys]);
  const resolvedSignatureCertificateBrandingEnabled = canCustomizeSignatureCertificateBranding
    ? signatureCertificateBrandingEnabled
    : true;
  const resolvedDocumentWatermarkLabel = useMemo(() => {
    const manualLabel = documentWatermarkLabel.trim();
    if (manualLabel) {
      return manualLabel;
    }

    if (clientBusinessSettings?.watermarkLabel?.trim()) {
      return clientBusinessSettings.watermarkLabel.trim();
    }

    if (isClient && session?.user?.subscription?.status === 'trial') {
      return 'docrud workspace';
    }

    return undefined;
  }, [clientBusinessSettings?.watermarkLabel, documentWatermarkLabel, isClient, session?.user?.subscription?.status]);
  const clientStarterTemplates = useMemo(
    () => allowedTemplates.filter((template) => template.organizationId === session?.user?.id).slice(0, 4),
    [allowedTemplates, session?.user?.id]
  );
	  const sidebarGroups = useMemo(() => {
    if (isBoardRoomOnlyUser) {
      return [
        {
          id: 'board-room-only',
          label: 'Board Room',
          badge: 'Access',
          items: [
            { id: 'deal-room', label: 'Board Rooms', icon: BriefcaseBusiness, description: 'Open the board rooms you were invited into and act on assigned work' },
          ],
        },
      ];
    }

    if (!scopeAllowsWorkspaceModules && !isEmployee) {
      const focusLabel = dashboardScope === 'talent' ? 'Talent Directory' : 'Gigs';
      return [
        {
          id: 'home',
          label: 'Home',
          badge: 'Focus',
          items: [
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, description: `Your ${focusLabel} dashboard with plan + usage` },
          ],
        },
        {
          id: 'workspace-focus',
          label: focusLabel,
          badge: 'Manage',
          items: [
            ...(scopeAllowsTalent ? [{ id: 'talent-leads', label: 'Talent Leads', icon: FileSearch, description: 'Manage unlocked resume contacts with stages, notes, and JD match scoring' }] : []),
            ...(scopeAllowsGigs ? [{ id: 'gigs', label: 'Gigs Studio', icon: BriefcaseBusiness, description: 'Browse gigs, track proposals, and manage replies' }] : []),
          ],
        },
        {
          id: 'account',
          label: 'Account',
          badge: 'Renew',
          items: [
            ...(hasWorkspacePermission('profile') ? [{ id: 'profile', label: 'Profile', icon: UserRound, description: 'Plan usage, limits, and renewals' }] : []),
            ...(!isInternalMember ? [{ id: 'billing', label: 'Billing', icon: CreditCard, description: 'Renew or upgrade the plan before access ends' }] : []),
            { id: 'tutorials', label: 'Tutorials', icon: BookOpen, description: 'Learn the feature end-to-end' },
          ],
        },
        {
          id: 'scratchpad-tools',
          label: 'Canvas & Notes',
          badge: 'New',
          items: [
            { id: 'scratchpad', label: 'Scratchpad', icon: PenLine, description: 'Freehand whiteboard with shapes, text, sticky notes, share and live collaboration' },
          ],
        },
      ];
    }

    const groups: Array<{
      id: string;
      label: string;
      badge?: string;
      items: Array<{ id: string; label: string; icon: typeof FileText; description: string }>;
    }> = [];

    if (!isEmployee && (
      canAccessFeature('dashboard', { clientFeature: 'dashboard', permission: 'dashboard' })
      || canAccessFeature('document_summary', { clientFeature: 'document_summary', permission: 'document_summary' })
      || canAccessFeature('generate_documents', { clientFeature: 'generate_documents', permission: 'generate_documents' })
      || canAccessFeature('history', { clientFeature: 'history', permission: 'history' })
      || canAccessFeature('doxpert', { clientFeature: 'doxpert', permission: 'doxpert' })
    )) {
	      groups.push({
	        id: 'home',
	        label: 'Home',
	        badge: 'Start',
	        items: [
	          ...(canAccessFeature('dashboard', { clientFeature: 'dashboard', permission: 'dashboard' }) ? [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'See live usage, activity, and what needs attention next' }] : []),
	          ...(isAdmin ? [{ id: 'super-admin', label: 'Super Admin', icon: ShieldCheck, description: 'Command center for platform health, adoption, and feature controls' }] : []),
	          ...(isAdmin ? [{ id: 'template-publisher', label: 'Template Publisher', icon: Sparkles, description: 'Manage your marketplace templates, analytics, and income' }] : []),
	        ],
	      });

      groups.push({
        id: 'create',
        label: 'Create & Prepare',
        badge: 'Work',
        items: [
          ...(canAccessFeature('generate_documents', { clientFeature: 'generate_documents', permission: 'generate_documents' }) ? [{ id: 'generate', label: 'E-sign Documents', icon: FileSignature, description: 'Create, review, sign, and send standardized business documents faster' }] : []),
          ...(canAccessFeature('docsheet', { permission: 'docsheet' }) ? [{ id: 'docsheet', label: 'DocSheet', icon: Table2, description: 'Run spreadsheet work inside docrud with history and AI support' }] : []),
          ...(canAccessFeature('e_certificates', { clientFeature: 'e_certificates', permission: 'e_certificates' }) ? [{ id: 'certificates', label: 'E-Certificates', icon: Award, description: 'Create polished certificates with public verification pages' }] : []),
          ...([{ id: 'forms-studio', label: 'Forms Studio', icon: FileSpreadsheet, description: 'Build, publish, and track secure forms with AI-assisted creation and full response analytics' }]),
          ...([{ id: 'daily-tools', label: 'Daily Tools', icon: Wrench, description: 'Use quick file tools for everyday work after login' }]),
        ],
      });

      groups.push({
        id: 'review',
        label: 'Review & Understand',
        badge: 'Insight',
        items: [
          ...(canAccessFeature('document_summary', { clientFeature: 'document_summary', permission: 'document_summary' }) ? [{ id: 'summary', label: 'Document Summary', icon: PieChart, description: 'Track engagement, comments, and document movement clearly' }] : []),
          ...(canAccessFeature('doxpert', { clientFeature: 'doxpert', permission: 'doxpert' }) ? [{ id: 'doxpert', label: 'DoXpert AI', icon: ScanText, description: 'Get risk insight, weak-point analysis, and reply guidance' }] : []),
          ...(canAccessFeature('visualizer', { permission: 'visualizer' }) ? [{ id: 'visualizer', label: 'Visualizer AI', icon: LineChart, description: 'Turn data-heavy sheets and reports into visuals people can understand' }] : []),
          ...(canAccessFeature('history', { clientFeature: 'history', permission: 'history' }) ? [{ id: 'history', label: 'History', icon: History, description: 'Go back to past work, verify delivery, and reuse what already worked' }] : []),
        ],
      });

      groups.push({
        id: 'share',
        label: 'Share & Protect',
        badge: 'Secure',
        items: [
          ...(canAccessFeature('file_manager', { clientFeature: 'file_manager', permission: 'file_transfers' }) ? [{ id: 'file-transfers', label: 'File Transfers', icon: Upload, description: 'Share files professionally and track opens, downloads, and expiry' }] : []),
          ...(canAccessFeature('qr_drop', { clientFeature: 'file_manager', permission: 'file_transfers' }) ? [{ id: 'qr-drop', label: 'QR File Drop', icon: QrCode, description: 'Let another device scan a QR and open the file download flow instantly' }] : []),
          ...(canAccessFeature('offline_locker', { clientFeature: 'file_manager', permission: 'file_transfers' }) ? [{ id: 'offline-locker', label: 'Offline Locker', icon: KeyRound, description: 'Package any file into a password-locked document that still works offline' }] : []),
          ...(canAccessFeature('document_encrypter', { clientFeature: 'document_encrypter', permission: 'file_transfers' }) ? [{ id: 'document-encrypter', label: 'Document Encrypter', icon: Lock, description: 'Lock highly sensitive files behind stronger delivery protection' }] : []),
          ...(canAccessFeature('virtual_id', { clientFeature: 'virtual_id', permission: 'virtual_id' }) ? [{ id: 'virtual-id', label: 'Virtual ID', icon: QrCode, description: 'Create a QR identity card with public profile analytics' }] : []),
        ],
      });

	      groups.push({
	        id: 'collaboration',
	        label: 'Collaborate',
	        badge: 'Team',
	        items: [
	          ...(canAccessFeature('team_workspace', { clientFeature: 'team_workspace', permission: 'team_workspace', internalOnly: true }) ? [{ id: 'team-workspace', label: 'Team Workspace', icon: Users, description: 'Manage teammates, access, and shared collaboration' }] : []),
	          ...(canAccessFeature('internal_mailbox', { permission: 'internal_mailbox' }) ? [{ id: 'internal-mailbox', label: 'Internal Mailbox', icon: Mail, description: 'Keep team communication, updates, and AI summaries in one place' }] : []),
	          ...(canAccessFeature('deal_room', { clientFeature: 'deal_room', permission: 'deal_room' }) ? [{ id: 'deal-room', label: 'Board Room', icon: FolderKanban, description: 'Run proposals, negotiations, approvals, deadlines, and closure in one governed room' }] : []),
	          ...(!isEmployee && scopeAllowsGigs ? [{ id: 'gigs', label: 'Gigs', icon: BriefcaseBusiness, description: 'List project gigs, explore live work by interest, and handle direct responses in one workspace' }] : []),
	          ...(!isEmployee && scopeAllowsTalent ? [{ id: 'talent-leads', label: 'Talent Leads', icon: FileSearch, description: 'Manage paid resume contacts with stages, notes, and JD match scoring' }] : []),
	          ...((!isEmployee && canAccessFeature('hiring_desk', { clientFeature: 'hiring_desk', permission: 'hiring_desk' })) ? [{ id: 'hiring-desk', label: isClient && session?.user?.accountType === 'individual' ? 'Job Matches' : 'Hiring Desk', icon: BriefcaseBusiness, description: isClient && session?.user?.accountType === 'individual' ? 'Match your resume score with open jobs and apply directly' : 'Post hiring roles, set ATS thresholds, and review candidates in one hiring workspace' }] : []),
	          ...((!isEmployee && canAccessFeature('docrudians', { clientFeature: 'docrudians', permission: 'docrudians' })) ? [{ id: 'docrudians', label: 'Docrudians', icon: Users, description: 'Run public and private rooms with share links, resources, and updates' }] : []),
	        ],
	      });

      groups.push({
        id: 'account',
        label: 'Account & Help',
        badge: 'Manage',
        items: [
          ...(hasWorkspacePermission('profile') ? [{ id: 'profile', label: 'Profile', icon: UserRound, description: 'Understand your plan, usage pattern, and available headroom' }] : []),
          ...(!isInternalMember ? [{ id: 'billing', label: 'Subscriptions & Billing', icon: CreditCard, description: 'Keep billing visible and upgrade before work is blocked' }] : []),
          ...(canAccessFeature('support', { permission: 'support' }) ? [{ id: 'support', label: 'AI Support', icon: CircleHelp, description: 'Ask product questions and get the next step fast' }] : []),
          { id: 'tutorials', label: 'Tutorials', icon: BookOpen, description: 'Learn the product feature by feature' },
        ],
      });
    }

	    if (isClient || isEmployee) {
	      groups.push({
	        id: 'portal',
	        label: 'My Space',
        badge: isEmployee ? 'Personal' : 'Client',
        items: [
          ...(isClient && hasClientFeature('client_portal') ? [{ id: 'client-portal', label: 'Client Portal', icon: BriefcaseBusiness, description: 'Track shared documents and actions' }] : []),
          ...(isClient ? [{ id: 'business-settings', label: 'Business Settings', icon: Settings, description: 'Branding, presets, and starter packs' }] : []),
          ...(isEmployee ? [{ id: 'employee-portal', label: 'Employee Portal', icon: ShieldCheck, description: 'Onboarding and verification progress' }] : []),
	        ],
	      });
	    }

    if (!isBoardRoomOnlyUser) {
      groups.push({
        id: 'scratchpad-tools',
        label: 'Canvas & Notes',
        badge: 'New',
        items: [
          { id: 'scratchpad', label: 'Scratchpad', icon: PenLine, description: 'Freehand whiteboard with shapes, text, sticky notes, share and live collaboration' },
        ],
      });
    }

	    return groups.filter((group) => group.items.length > 0);
	  }, [canAccessFeature, hasClientFeature, hasWorkspacePermission, dashboardScope, isAdmin, isBoardRoomOnlyUser, isClient, isEmployee, isInternalMember, scopeAllowsGigs, scopeAllowsTalent, scopeAllowsWorkspaceModules, session?.user?.accountType]);


  const getLocalSearchResults = useCallback((rawQuery: string): import('./GlobalSearchBar').LocalSearchResult[] => {
    const query = rawQuery.trim().toLowerCase();
    if (!query) return [];

    const results: import('./GlobalSearchBar').LocalSearchResult[] = [];
    const push = (item: import('./GlobalSearchBar').LocalSearchResult) => {
      if (results.length >= 20) return;
      results.push(item);
    };

    const tabItems = sidebarGroups.flatMap((group) => group.items.map((item) => ({
      group: group.label,
      ...item,
    })));
    for (const item of tabItems) {
      if ([item.label, item.description, item.group].some((value) => value?.toLowerCase().includes(query))) {
        push({
          id: `tab:${item.id}`,
          kind: 'tab',
          title: item.label,
          subtitle: item.group,
          Icon: item.icon,
          onSelect: () => attemptOpenTab(item.id, item.label),
        });
      }
    }

    for (const template of allowedTemplates.slice(0, 250)) {
      if ([template.name, template.category, template.description].filter(Boolean).some((value) => value!.toLowerCase().includes(query))) {
        push({
          id: `tpl:${template.id}`,
          kind: 'template',
          title: template.name,
          subtitle: template.category || 'Template',
          Icon: FileText,
          onSelect: () => {
            const match = allowedTemplates.find((tpl) => tpl.id === template.id) || null;
            if (match) {
              setSelectedTemplate(match);
              setGenerateSubTab('create');
              attemptOpenTab('generate', 'E-sign Documents');
            }
          },
        });
      }
    }

    for (const item of dashboard.documentSummary.slice(0, 250)) {
      if ([item.templateName, item.referenceNumber, item.latestActivityLabel, ...(item.uniqueDevices || [])].filter(Boolean).some((value) => value!.toLowerCase().includes(query))) {
        push({
          id: `sum:${item.id}`,
          kind: 'summary',
          title: item.templateName,
          subtitle: item.referenceNumber ? `Ref ${item.referenceNumber}` : (item.latestActivityLabel || 'Document'),
          Icon: FileSearch,
          onSelect: () => attemptOpenTab('summary', 'Summary'),
        });
      }
    }

    for (const entry of standardHistory.slice(0, 250)) {
      if ([entry.templateName, entry.referenceNumber, entry.emailTo, entry.emailSubject].filter(Boolean).some((value) => value!.toLowerCase().includes(query))) {
        push({
          id: `his:${entry.id}`,
          kind: 'history',
          title: entry.templateName,
          subtitle: entry.referenceNumber ? `Ref ${entry.referenceNumber}` : 'History',
          Icon: History,
          onSelect: () => {
            const url = entry.shareUrl
              ? (entry.shareUrl.startsWith('http') ? new URL(entry.shareUrl).pathname : entry.shareUrl)
              : entry.shareId ? `/documents/${entry.shareId}` : entry.id ? `/documents/${entry.id}` : null;
            if (url) router.push(url);
          },
        });
      }
    }

    return results;
  }, [allowedTemplates, dashboard.documentSummary, sidebarGroups, standardHistory, attemptOpenTab, router, setSelectedTemplate, setGenerateSubTab]);
  const mobileActionCandidates = useMemo(() => {
	    if (isBoardRoomOnlyUser) {
	      return [{ id: 'deal-room', label: 'Board', icon: BriefcaseBusiness }];
	    }

      if (!scopeAllowsWorkspaceModules && !isEmployee) {
        return [
          { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
          ...(scopeAllowsTalent ? [{ id: 'talent-leads', label: 'Talent', icon: FileSearch }] : []),
          ...(scopeAllowsGigs ? [{ id: 'gigs', label: 'Gigs', icon: BriefcaseBusiness }] : []),
          ...(hasWorkspacePermission('profile') ? [{ id: 'profile', label: 'Profile', icon: UserRound }] : []),
        ];
      }

    const items: Array<{ id: string; label: string; icon: typeof FileText }> = [
      { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    ];

	    if (!isEmployee && canAccessFeature('generate_documents', { clientFeature: 'generate_documents', permission: 'generate_documents' })) {
	      items.push({ id: 'generate', label: 'Create', icon: FileSignature });
	    }
	    if (session?.user?.role === 'admin') {
	      items.push({ id: 'super-admin', label: 'Admin', icon: ShieldCheck });
	    }
    if (canAccessFeature('docsheet', { permission: 'docsheet' })) {
      items.push({ id: 'docsheet', label: 'Sheets', icon: Table2 });
    }
    items.push({ id: 'daily-tools', label: 'Tools', icon: Wrench });
    items.push({ id: 'forms-studio', label: 'Forms', icon: FileSpreadsheet });
    if (canAccessFeature('file_manager', { clientFeature: 'file_manager', permission: 'file_transfers' })) {
      items.push({ id: 'file-transfers', label: 'Files', icon: Upload });
    }
    if (canAccessFeature('qr_drop', { clientFeature: 'file_manager', permission: 'file_transfers' })) {
      items.push({ id: 'qr-drop', label: 'QR', icon: QrCode });
    }
    if (!isEmployee && canAccessFeature('doxpert', { clientFeature: 'doxpert', permission: 'doxpert' })) {
      items.push({ id: 'doxpert', label: 'DoXpert', icon: ScanText });
    }
    if (canAccessFeature('visualizer', { permission: 'visualizer' })) {
      items.push({ id: 'visualizer', label: 'Charts', icon: LineChart });
    }
    if (!isEmployee && canAccessFeature('history', { clientFeature: 'history', permission: 'history' })) {
      items.push({ id: 'history', label: 'History', icon: History });
    }
    if (!isEmployee && canAccessFeature('hiring_desk', { clientFeature: 'hiring_desk', permission: 'hiring_desk' })) {
      items.push({ id: 'hiring-desk', label: 'Hiring', icon: BriefcaseBusiness });
    }
    if (!isEmployee && scopeAllowsGigs) {
      items.push({ id: 'gigs', label: 'Gigs', icon: BriefcaseBusiness });
    }
    if (!isEmployee && scopeAllowsTalent) {
      items.push({ id: 'talent-leads', label: 'Talent', icon: FileSearch });
    }
    if (!isEmployee && canAccessFeature('docrudians', { clientFeature: 'docrudians', permission: 'docrudians' })) {
      items.push({ id: 'docrudians', label: 'Network', icon: Users });
    }
    if (canAccessFeature('virtual_id', { clientFeature: 'virtual_id', permission: 'virtual_id' })) {
      items.push({ id: 'virtual-id', label: 'ID', icon: QrCode });
    }
    if (canAccessFeature('e_certificates', { clientFeature: 'e_certificates', permission: 'e_certificates' })) {
      items.push({ id: 'certificates', label: 'Certs', icon: Award });
    }
    if (canAccessFeature('internal_mailbox', { permission: 'internal_mailbox' })) {
      items.push({ id: 'internal-mailbox', label: 'Mail', icon: Mail });
    }
    if (canAccessFeature('deal_room', { clientFeature: 'deal_room', permission: 'deal_room' })) {
      items.push({ id: 'deal-room', label: 'Board', icon: FolderKanban });
    }
    if (hasWorkspacePermission('profile')) {
      items.push({ id: 'profile', label: 'Profile', icon: UserRound });
    }

    return items;
	  }, [canAccessFeature, hasWorkspacePermission, isBoardRoomOnlyUser, isEmployee, scopeAllowsGigs, scopeAllowsTalent, scopeAllowsWorkspaceModules, session?.user?.role]);

  useEffect(() => {
    if (isBoardRoomOnlyUser) {
      setActiveTab('deal-room');
    }
  }, [isBoardRoomOnlyUser]);
  const mobileBottomActions = useMemo(() => {
    const usageAware = [...mobileActionCandidates].sort((left, right) => {
      const usageDiff = (mobileTabUsage[right.id] || 0) - (mobileTabUsage[left.id] || 0);
      if (usageDiff !== 0) {
        return usageDiff;
      }
      return mobileActionCandidates.findIndex((item) => item.id === left.id) - mobileActionCandidates.findIndex((item) => item.id === right.id);
    });

    const selected = usageAware.slice(0, 5);
    if (!selected.some((item) => item.id === activeTab) && activeTab !== 'dashboard') {
      const activeItem = mobileActionCandidates.find((item) => item.id === activeTab);
      if (activeItem) {
        selected[selected.length - 1] = activeItem;
      }
    }
    return selected.slice(0, 5);
  }, [activeTab, mobileActionCandidates, mobileTabUsage]);

  const dashboardLaunchGroups = useMemo(() => {
    return sidebarGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.id !== 'dashboard'),
      }))
      .filter((group) => group.items.length > 0 && !['network', 'platform', 'operations'].includes(group.id));
  }, [sidebarGroups]);
  const tabLabelById = useMemo(() => {
    const map = new Map<string, string>();
    map.set('dashboard', 'Dashboard');
    sidebarGroups.forEach((group) => {
      group.items.forEach((item) => {
        map.set(item.id, item.label);
      });
    });
    return map;
  }, [sidebarGroups]);
  const availableWorkspaceTabs = useMemo(
    () => new Set(sidebarGroups.flatMap((group) => group.items.map((item) => item.id)).concat(['dashboard'])),
    [sidebarGroups],
  );

  useEffect(() => {
    if (!allowedTabsForAccount) return;
    if (!activeTab) return;
    if (allowedTabsForAccount.has(activeTab)) return;
    const label = tabLabelById.get(activeTab) || 'This feature';
    openUpgradePrompt(activeTab, label);
    setActiveTab('dashboard');
  }, [activeTab, allowedTabsForAccount, openUpgradePrompt, tabLabelById]);

  const dashboardStats = useMemo(() => {
    return [
      {
        label: 'Plan',
        value: profileOverview?.subscription.planName || session?.user?.subscription?.planName || 'Workspace',
        detail: profileOverview?.subscription.status || session?.user?.subscription?.status || 'active',
        tone: 'premium-card-smoke',
      },
      {
        label: 'Usage',
        value: profileOverview ? `${profileOverview.threshold.percentUsed}%` : '0%',
        detail: profileOverview?.threshold.state?.replace(/_/g, ' ') || 'healthy',
        tone: 'premium-card-warm',
      },
      {
        label: 'Remaining',
        value: profileOverview ? String(profileOverview.usage.remainingGenerations) : '0',
        detail: profileOverview?.usage.projectedExhaustionLabel || 'Capacity available',
        tone: 'premium-card-ivory',
      },
      {
        label: 'Documents',
        value: String(dashboard.totalDocuments || 0),
        detail: `${dashboard.documentsThisWeek || 0} this week`,
        tone: 'premium-card-rose',
      },
      {
        label: 'Transfers',
        value: profileOverview ? String(profileOverview.usage.totalFileTransfers) : '0',
        detail: profileOverview ? `${profileOverview.usage.activeFileTransfers} active` : 'No active links',
        tone: 'premium-card-smoke',
      },
      {
        label: 'Mailbox',
        value: String(notifications.length || 0),
        detail: `${unreadNotificationsCount} unread`,
        tone: 'premium-card-ivory',
      },
    ];
  }, [dashboard.documentsThisWeek, dashboard.totalDocuments, notifications.length, profileOverview, session?.user?.subscription?.planName, session?.user?.subscription?.status, unreadNotificationsCount]);

  const dashboardShipTools = useMemo(() => {
    const byId = new Map<string, { id: string; label: string; icon: typeof FileText; tab: string }>();
    sidebarGroups.forEach((group) => {
      group.items.forEach((item) => {
        if (item.id === 'dashboard') return;
        byId.set(item.id, { id: item.id, label: item.label, icon: item.icon, tab: item.id });
      });
    });

    const priorityIds = [
      'generate',
      'profile',
      'billing',
      'support',
      'daily-tools',
      'gigs',
      'team-workspace',
    ];

    const seen = new Set<string>();
    const prioritized = priorityIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((item) => {
        seen.add(item!.id);
        return item!;
      });

    const rest = Array.from(byId.values())
      .filter((item) => !seen.has(item.id))
      .sort((left, right) => left.label.localeCompare(right.label));

    return [...prioritized, ...rest];
  }, [sidebarGroups]);

  const docsheetWorkbookCount = useMemo(
    () => history.filter((entry) => entry.templateId === 'docsheet-workbook').length,
    [history],
  );
  const signedDocumentCount = useMemo(
    () => dashboard.documentSummary.filter((item) => item.signCount > 0).length,
    [dashboard.documentSummary],
  );
  const workspaceInsightStatCards = useMemo(() => ([
    {
      label: 'Tracked docs',
      value: String(aiWorkspaceInsights?.metrics?.totalDocuments ?? dashboard.totalDocuments ?? 0),
      tone: 'bg-sky-50 text-sky-700',
    },
    {
      label: 'This week',
      value: String(aiWorkspaceInsights?.metrics?.documentsThisWeek ?? dashboard.documentsThisWeek ?? 0),
      tone: 'bg-violet-50 text-violet-700',
    },
    {
      label: 'Signed',
      value: String(aiWorkspaceInsights?.metrics?.signedDocuments ?? signedDocumentCount),
      tone: 'bg-emerald-50 text-emerald-700',
    },
    {
      label: 'Unread alerts',
      value: String(unreadNotificationsCount),
      tone: 'bg-amber-50 text-amber-700',
    },
    {
      label: 'Feedback',
      value: String(aiWorkspaceInsights?.metrics?.pendingFeedback ?? dashboard.recentFeedback.length),
      tone: 'bg-rose-50 text-rose-700',
    },
  ]), [
    aiWorkspaceInsights?.metrics?.documentsThisWeek,
    aiWorkspaceInsights?.metrics?.pendingFeedback,
    aiWorkspaceInsights?.metrics?.signedDocuments,
    aiWorkspaceInsights?.metrics?.totalDocuments,
    dashboard.documentsThisWeek,
    dashboard.recentFeedback.length,
    dashboard.totalDocuments,
    signedDocumentCount,
    unreadNotificationsCount,
  ]);
  const parserSessionCount = documentParserHistory.length;

  const navToneByTabId = useMemo(() => {
    const map: Record<string, ReturnType<typeof getNavGroupTone>> = {};
    sidebarGroups.forEach((group) => {
      const tone = getNavGroupTone(group.id);
      group.items.forEach((item) => {
        map[item.id] = tone;
      });
    });
    return map;
  }, [sidebarGroups]);

  const mobileSearchShortcuts = useMemo((): import('./GlobalSearchBar').MobileShortcut[] => {
    return mobileActionCandidates.slice(0, 8).map((item) => {
      const tone = navToneByTabId[item.id];
      return {
        id: item.id,
        label: item.label,
        Icon: item.icon,
        onSelect: () => attemptOpenTab(item.id, item.label),
        active: activeTab === item.id,
        iconBg: tone?.iconBg,
        iconFg: tone?.iconFg,
        dot: tone?.dot,
      };
    });
  }, [mobileActionCandidates, navToneByTabId, activeTab, attemptOpenTab]);

  const featureOverviewConfigs = useMemo(() => ({
    summary: {
      title: 'Document intelligence',
      description: 'See parser health, AI briefing, and tracked document outcomes before opening the detailed workspace blocks.',
      stats: [
        { label: 'Tracked docs', value: String(dashboard.documentSummary.length), hint: 'Documents with tracked opens, downloads, reviews, or signatures.' },
        { label: 'Parser sessions', value: String(parserSessionCount), hint: 'Saved parser runs available for reuse.' },
        {
          label: 'Signed',
          value: String(signedDocumentCount),
          hint: 'Tracked documents with completed signatures.',
          onClick: () => {
            setActiveTab('summary');
            setSummaryFilter('signed');
          },
        },
        { label: 'Feedback', value: String(dashboard.recentFeedback.length), hint: 'Recent recipient feedback items captured by the workspace.' },
      ],
      historyLabel: 'Open history',
      historyTab: 'history',
    },
    doxpert: {
      title: 'DoXpert AI',
      description: 'Review AI-led document risk and trust signals from a cleaner top strip before diving into the analysis workspace.',
      stats: [
        { label: 'Current doc', value: generatedHtml || currentHistoryEntry ? 'Loaded' : 'None' },
        { label: 'Tracked docs', value: String(dashboard.documentSummary.length) },
        { label: 'History', value: String(standardHistory.length), hint: 'Generated and shared records available in workspace history.' },
        { label: 'AI ready', value: 'Yes' },
      ],
      historyLabel: 'Open history',
      historyTab: 'history',
    },
    visualizer: {
      title: 'Visualizer AI',
      description: 'See the latest data coverage and workbook availability first, then open charts and deeper visual analysis below.',
      stats: [
        { label: 'Workbooks', value: String(docsheetWorkbookCount) },
        { label: 'Tracked docs', value: String(dashboard.documentSummary.length) },
        { label: 'Current source', value: generatedHtml || currentHistoryEntry ? 'Loaded' : 'None' },
        { label: 'Charts', value: 'Live' },
      ],
    },
    profile: {
      title: 'Profile overview',
      description: 'Plan and personal usage signals stay visible here so you can check runway before opening the full profile center.',
      stats: [
        { label: 'Plan', value: profileOverview?.subscription.planName || session?.user?.subscription?.planName || 'Workspace' },
        { label: 'Status', value: profileOverview?.subscription.status || session?.user?.subscription?.status || 'active' },
        { label: 'Used', value: profileOverview ? `${profileOverview.threshold.percentUsed}%` : '0%' },
        { label: 'Remaining', value: profileOverview ? String(profileOverview.usage.remainingGenerations) : '0' },
      ],
    },
	    billing: {
	      title: 'Billing overview',
      description: 'Keep renewal pressure, current plan status, and remaining capacity visible before opening the detailed billing center.',
      stats: [
        { label: 'Plan', value: profileOverview?.subscription.planName || session?.user?.subscription?.planName || 'Workspace' },
        { label: 'Status', value: profileOverview?.subscription.status || session?.user?.subscription?.status || 'active' },
        { label: 'Threshold', value: profileOverview?.threshold.state?.replace(/_/g, ' ') || 'healthy' },
        { label: 'Runway', value: profileOverview?.usage.projectedExhaustionLabel || 'Available' },
      ],
	    },
	    'super-admin': {
	      title: 'Super admin workspace',
	      description: 'Monitor platform health, adoption, and feature controls from one command surface.',
	      stats: [
	        { label: 'Mode', value: 'Command' },
	        { label: 'Health', value: 'Live' },
	        { label: 'Controls', value: 'Active' },
	        { label: 'Refresh', value: 'Realtime' },
	      ],
	    },
	    support: {
	      title: 'AI Support',
	      description: 'Keep support response signals compact here, then open the full assistant workspace below when you need guided help.',
	      stats: [
        { label: 'Unread', value: String(unreadNotificationsCount) },
        { label: 'Alerts', value: String(notifications.length) },
        { label: 'FAQ packs', value: 'Seeded' },
        { label: 'Access', value: 'Live' },
      ],
    },
    'daily-tools': {
      title: 'Daily Tools',
      description: 'Quick utility signals stay at the top so users can jump into the right conversion or cleanup task faster.',
      stats: [
        { label: 'Tools', value: '10+' },
        { label: 'Access', value: 'Login only' },
        { label: 'PDF suite', value: 'Ready' },
        { label: 'Sheet utils', value: 'Ready' },
      ],
    },
    'virtual-id': {
      title: 'Virtual ID',
      description: 'Create QR-powered digital IDs, track scans and opens, and publish a clean profile page people can save or share.',
      stats: [
        { label: 'Profiles', value: 'Tracked' },
        { label: 'QR', value: 'Ready' },
        { label: 'Analytics', value: 'Live' },
        { label: 'Share page', value: 'Public' },
      ],
    },
    certificates: {
      title: 'E-Certificates',
      description: 'Issue polished certificates, publish verification pages, and track opens, downloads, and trust signals.',
      stats: [
        { label: 'Records', value: 'Tracked' },
        { label: 'QR verify', value: 'Ready' },
        { label: 'Public page', value: 'Live' },
        { label: 'Downloads', value: 'Tracked' },
      ],
    },
    'hiring-desk': {
      title: session?.user?.accountType === 'individual' ? 'Job matches' : 'Hiring desk',
      description: session?.user?.accountType === 'individual'
        ? 'Use your ATS-scored resume to see only the roles you currently qualify for and apply directly from the workspace.'
        : 'Post company jobs, set minimum ATS thresholds, and review applications sent directly into your workspace.',
      stats: [
        { label: 'Mode', value: session?.user?.accountType === 'individual' ? 'Candidate' : 'Company' },
        { label: 'ATS match', value: 'Live' },
        { label: 'Applications', value: 'Tracked' },
        { label: 'Hiring', value: 'Enabled' },
      ],
    },
    gigs: {
      title: 'Gigs',
      description: 'Publish cleaner project briefs, explore live work by interest, and keep direct outreach inside docrud instead of a noisy marketplace thread.',
      stats: [
        { label: 'Discovery', value: 'Interest-led' },
        { label: 'Connect', value: 'Direct' },
        { label: 'Docai', value: 'Built in' },
        { label: 'Flow', value: 'Login-first' },
      ],
    },
	    docrudians: {
	      title: 'Docrudians',
	      description: 'Create room-based workspaces for developers, students, colleges, and events with public or private access, updates, and shared resources.',
	      stats: [
	        { label: 'Rooms', value: 'Live' },
	        { label: 'Access', value: 'Public / Private' },
	        { label: 'Updates', value: 'Tracked' },
	        { label: 'Resources', value: 'Shared' },
	      ],
	    },
	    'team-workspace': {
	      title: 'Team Workspace',
	      description: 'See collaboration readiness and access coverage first, then open teammate controls and member management below.',
	      stats: [
	        { label: 'Role', value: isInternalMember ? 'Member' : 'Owner' },
        { label: 'Permissions', value: userPermissions.includes('all') ? 'Full' : String(userPermissions.length || 0) },
        { label: 'Mailbox', value: hasWorkspacePermission('internal_mailbox') ? 'Enabled' : 'Off' },
        { label: 'Board Room', value: hasWorkspacePermission('deal_room') ? 'Enabled' : 'Off' },
      ],
    },
    'deal-room': {
      title: 'Board Room',
      description: 'Track board-room readiness, access, and linked execution context first, then move into room operations below.',
      stats: [
        { label: 'Access', value: hasWorkspacePermission('deal_room') ? 'Enabled' : 'Restricted' },
        { label: 'Unread', value: String(unreadNotificationsCount) },
        { label: 'History', value: String(standardHistory.length) },
        { label: 'Mode', value: isBoardRoomOnlyUser ? 'Room only' : 'Workspace' },
      ],
    },
    'internal-mailbox': {
      title: 'Internal Mailbox',
      description: 'Keep unread state and collaboration readiness visible first, then open the chat-style mailbox below.',
      stats: [
        { label: 'Unread', value: String(unreadNotificationsCount) },
        { label: 'Threads', value: notifications.length > 0 ? String(notifications.length) : '0', hint: 'Notification-linked mailbox activity currently visible to this user.' },
        { label: 'AI assist', value: 'Enabled' },
        { label: 'Access', value: hasWorkspacePermission('internal_mailbox') ? 'Live' : 'Restricted' },
      ],
    },
    'forms-studio': {
      title: 'Forms Studio',
      description: 'Build, publish, and track secure forms with step-by-step AI-assisted creation and real-time response analytics.',
      stats: [
        { label: 'Forms', value: '—' },
        { label: 'AI assisted', value: 'Yes' },
        { label: 'Step-by-step', value: '4 steps' },
        { label: 'Access', value: 'Enabled' },
      ],
    },
    'file-transfers': {
      title: 'File Transfers',
      description: 'See transfer activity and active link coverage up front, then move into folders, links, and share controls.',
      stats: [
        { label: 'Transfers', value: profileOverview ? String(profileOverview.usage.totalFileTransfers) : '0' },
        { label: 'Active', value: profileOverview ? String(profileOverview.usage.activeFileTransfers) : '0' },
        { label: 'Tracked docs', value: String(dashboard.documentSummary.length) },
        { label: 'Access', value: hasWorkspacePermission('file_transfers') ? 'Enabled' : 'Restricted' },
      ],
      historyLabel: 'Open history',
      historyTab: 'history',
    },
   
    'offline-locker': {
      title: 'Offline Locker',
      description: 'Package and unlock signals stay visible here before you open the secure offline locker workflow.',
      stats: [
        { label: 'Package types', value: '3' },
        { label: 'Unlock page', value: 'Public' },
        { label: 'Mode', value: 'Offline' },
        { label: 'Access', value: hasWorkspacePermission('file_transfers') ? 'Enabled' : 'Restricted' },
      ],
    },
    'document-encrypter': {
      title: 'Document Encrypter',
      description: 'Triple-lock delivery stats sit at the top so secure delivery starts with clear signals, not text-heavy guidance.',
      stats: [
        { label: 'Protection', value: '3-lock' },
        { label: 'Transfers', value: profileOverview ? String(profileOverview.usage.totalFileTransfers) : '0' },
        { label: 'Active', value: profileOverview ? String(profileOverview.usage.activeFileTransfers) : '0' },
        { label: 'Access', value: hasClientFeature('document_encrypter') || !isClient ? 'Enabled' : 'Plan required' },
      ],
    },
    generate: {
      title: 'Document workspace',
      description: 'See draft readiness, template context, and secure-share readiness first, then open the full creation workflow below.',
      stats: [
        { label: 'Templates', value: String(allowedTemplates.length) },
        { label: 'Current', value: selectedTemplate?.name || currentHistoryEntry?.templateName || 'None' },
        { label: 'Readiness', value: `${completionPercentage}%` },
        { label: 'History', value: String(standardHistory.length) },
      ],
      historyLabel: 'Open history',
      historyTab: 'history',
    },
    tutorials: {
      title: 'Tutorial Center',
      description: 'Tutorial coverage and onboarding signals stay visible first so users can pick the right walkthrough faster.',
      stats: [
        { label: 'Feature tours', value: String(Object.keys(workspaceTours).length) },
        { label: 'Workspace tour', value: String(fullWorkspaceTour.length) },
        { label: 'Mode', value: tourOpen ? 'Open' : 'Ready' },
        { label: 'Access', value: 'Live' },
      ],
    },
    history: {
      title: 'History',
      description: 'This tab keeps every generated or shared record in one place so you can reopen, reuse, verify, and manage document operations safely.',
      stats: [
        { label: 'Records', value: String(standardHistory.length) },
        { label: 'Signed', value: String(standardHistory.filter((item) => Boolean(item.recipientSignedAt)).length) },
        { label: 'Uploads', value: String(standardHistory.filter((item) => item.documentSourceType === 'uploaded_pdf').length) },
        { label: 'Reusable', value: String(standardHistory.length) },
      ],
    },
    docsheet: {
      title: 'DocSheet',
      description: 'Workbook and spreadsheet coverage appears first here, with the detailed sheet workspace staying below.',
      stats: [
        { label: 'Workbooks', value: String(docsheetWorkbookCount) },
        { label: 'History', value: String(standardHistory.length) },
        { label: 'Smart packs', value: '4+' },
        { label: 'Charts', value: hasWorkspacePermission('visualizer') ? 'Connected' : 'Optional' },
      ],
      historyLabel: 'Open history',
      historyTab: 'history',
    },
  }), [
    allowedTemplates.length,
    completionPercentage,
    currentHistoryEntry,
    dashboard.documentSummary,
    dashboard.recentFeedback.length,
    docsheetWorkbookCount,
    generatedHtml,
    hasClientFeature,
    hasWorkspacePermission,
    isBoardRoomOnlyUser,
    isClient,
    isInternalMember,
    notifications.length,
    parserSessionCount,
    profileOverview,
    selectedTemplate,
    session?.user?.accountType,
    session?.user?.subscription?.planName,
    session?.user?.subscription?.status,
    signedDocumentCount,
    standardHistory,
    tourOpen,
    unreadNotificationsCount,
    userPermissions,
  ]);

	  useEffect(() => {
	    const requestedTab = searchParams?.get('tab');
	    if (!requestedTab) {
	      return;
	    }

    const supportedTabs = new Set([
      'dashboard',
      'profile',
      'billing',
      'support',
      'daily-tools',
      'forms-studio',
      'virtual-id',
      'certificates',
      'hiring-desk',
      'gigs',
      'docrudians',
      'team-workspace',
      'deal-room',
      'internal-mailbox',
      'summary',
      'doxpert',
      'docsheet',
      'visualizer',
      'generate',
      'history',
      'file-transfers',
      'qr-drop',
      'offline-locker',
      'document-encrypter',
      'tutorials',
      'template-publisher',
	    ]);

	    if (supportedTabs.has(requestedTab)) {
	      attemptOpenTab(requestedTab);
	    }
	  }, [attemptOpenTab, searchParams]);

  useEffect(() => {
    // Default workspace landing: if there is no explicit deep-link `?tab=...`,
    // always land on Dashboard (client/employee routing stays handled elsewhere).
    if (initialTabResolvedRef.current) return;
    if (searchParams?.get('tab')) return;
    if (status !== 'authenticated') return;
    if (isClient || isEmployee) return;
    initialTabResolvedRef.current = true;
    setActiveTab('dashboard');
  }, [isClient, isEmployee, searchParams, status]);

  useEffect(() => {
    const requestedHistoryId = searchParams?.get('historyId');
    if (!requestedHistoryId) return;
    const matched = history.find((entry) => entry.id === requestedHistoryId);
    if (!matched) return;
    setActiveTab('generate');
    setSelectedTemplate(null);
    setGeneratedHtml('');
    setCurrentHistoryEntry(matched);
    setSuccessMessage(`Loaded ${matched.templateName} for signing and sharing.`);
    setErrorMessage('');
  }, [history, searchParams]);

  useEffect(() => {
    if (!availableWorkspaceTabs.has(activeTab)) {
      const fallback = availableWorkspaceTabs.has('dashboard') ? 'dashboard' : Array.from(availableWorkspaceTabs)[0] || 'dashboard';
      if (fallback !== activeTab) {
        setActiveTab(fallback);
      }
    }
  }, [activeTab, availableWorkspaceTabs]);

  const trackUserActivity = useCallback(async (payload: {
    eventType: 'login' | 'session_start' | 'tab_view' | 'feature_action' | 'feedback_submitted';
    tabId?: string;
    featureId?: string;
    detail?: string;
  }) => {
    try {
      await fetch('/api/user-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      // Silent by design. Activity telemetry should never interrupt product usage.
    }
  }, []);

  const fetchFeedbackPromptStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/user-feedback', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        return;
      }
      setFeedbackPromptLoaded(true);
      if (payload?.shouldPrompt && session?.user?.role !== 'admin') {
        setFeedbackPromptOpen(true);
      }
    } catch {
      setFeedbackPromptLoaded(true);
    }
  }, [session?.user?.role]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const stored = window.localStorage.getItem(mobileTabUsageStorageKey);
      setMobileTabUsage(stored ? JSON.parse(stored) as Record<string, number> : {});
    } catch {
      setMobileTabUsage({});
    }
  }, [mobileTabUsageStorageKey]);

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.id) {
      if (sessionStartTrackedRef.current === session.user.id) {
        return;
      }
      sessionStartTrackedRef.current = session.user.id;
      void trackUserActivity({ eventType: 'session_start', tabId: activeTab || 'dashboard' });
      trackTelemetry({
        type: 'login',
        surface: 'workspace',
        path: '/workspace',
        userId: session?.user?.id,
        userRole: session?.user?.role,
      });
      if (!feedbackPromptLoaded) {
        void fetchFeedbackPromptStatus();
      }
    }
  }, [activeTab, feedbackPromptLoaded, fetchFeedbackPromptStatus, session?.user?.id, status, trackUserActivity]);

  useEffect(() => {
    if (status === 'authenticated' && isClient) {
      setActiveTab(clientCanAccessDashboard ? 'dashboard' : 'client-portal');
    }
    if (status === 'authenticated' && isEmployee) {
      setActiveTab('employee-portal');
    }
  }, [clientCanAccessDashboard, isClient, isEmployee, status]);

  useEffect(() => {
    if (!selectedTemplate || !isOnboardingTemplate) {
      return;
    }

    setRequiredDocumentWorkflowEnabled(true);
    setRequiredDocumentsText((current) => current || DEFAULT_BGV_DOCUMENTS.join(', '));
    setRecipientSignatureRequired(true);
  }, [isOnboardingTemplate, selectedTemplate]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [activeTab]);

  useEffect(() => {
    if (typeof window === 'undefined' || status !== 'authenticated' || !activeTab) {
      return;
    }
    if (lastTrackedTabRef.current === activeTab) {
      return;
    }
    lastTrackedTabRef.current = activeTab;
    setMobileTabUsage((prev) => {
      const next = { ...prev, [activeTab]: (prev[activeTab] || 0) + 1 };
      window.localStorage.setItem(mobileTabUsageStorageKey, JSON.stringify(next));
      return next;
    });
    void trackUserActivity({ eventType: 'tab_view', tabId: activeTab, featureId: activeTab });
    trackTelemetry({
      type: 'feature_open',
      surface: 'workspace',
      path: `/workspace?tab=${activeTab}`,
      featureId: activeTab,
      userId: session?.user?.id,
      userRole: session?.user?.role,
    });
  }, [activeTab, mobileTabUsageStorageKey, status, trackUserActivity]);

  useEffect(() => {
    setSummaryPage(1);
  }, [dashboardSearch, summaryFilter]);

  useEffect(() => {
    if (typeof window === 'undefined' || status !== 'authenticated' || isEmployee) {
      return;
    }

    if (window.localStorage.getItem(workspaceTourStorageKey)) {
      return;
    }

    setTourMode('full');
    setTourStepIndex(0);
    setTourOpen(true);
  }, [isEmployee, status, workspaceTourStorageKey]);

  useEffect(() => {
    if (!tourOpen || !activeTourStep || activeTab === activeTourStep.feature) {
      return;
    }

    setActiveTab(activeTourStep.feature);
  }, [activeTab, activeTourStep, tourOpen]);

  const openFeatureTour = useCallback((feature: 'full' | WorkspaceTourFeatureKey) => {
    setTourMode(feature);
    setTourStepIndex(0);
    setTourOpen(true);
  }, []);

  const closeTour = useCallback(() => {
    setTourOpen(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(workspaceTourStorageKey, 'seen');
    }
  }, [workspaceTourStorageKey]);

  const finishTour = useCallback(() => {
    setTourOpen(false);
    setTourMode('full');
    setTourStepIndex(0);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(workspaceTourStorageKey, 'completed');
    }
  }, [workspaceTourStorageKey]);

  const toggleFeatureDetails = useCallback((tabId: string) => {
    setExpandedFeatureDetails((prev) => ({ ...prev, [tabId]: !prev[tabId] }));
  }, []);

	  const renderFeatureOverviewCard = useCallback((tabId: string) => {
    const config = (featureOverviewConfigs as Record<string, typeof featureOverviewConfigs[keyof typeof featureOverviewConfigs]>)[tabId];
    if (!config) {
      return null;
    }

    return (
      <FeatureOverviewCard
        title={config.title}
        description={config.description}
        stats={config.stats}
        expanded={Boolean(expandedFeatureDetails[tabId])}
        onToggle={() => toggleFeatureDetails(tabId)}
        historyLabel={'historyLabel' in config ? config.historyLabel : undefined}
        onHistoryOpen={'historyTab' in config && config.historyTab ? () => setActiveTab(config.historyTab) : undefined}
      />
    );
  }, [expandedFeatureDetails, featureOverviewConfigs, toggleFeatureDetails]);

  const renderFeatureTourCard = useCallback((feature: WorkspaceTourFeatureKey, title: string, description: string) => (
    <Card className="overflow-hidden border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.88))] shadow-[0_20px_60px_rgba(15,23,42,0.06)] backdrop-blur">
      <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Virtual Tour</p>
            <InfoHint label={description} />
          </div>
          <h3 className="mt-2 text-base font-semibold tracking-tight text-slate-950 md:text-lg">{title}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => openFeatureTour(feature)} className="rounded-xl">
            <BookOpen className="mr-2 h-4 w-4" />
            Replay Tour
          </Button>
          <Button type="button" onClick={() => openFeatureTour('full')} className="rounded-xl bg-slate-950 text-white hover:bg-slate-800">
            <Sparkles className="mr-2 h-4 w-4" />
            Full Workspace Tour
          </Button>
        </div>
      </CardContent>
    </Card>
  ), [openFeatureTour]);

  const toggleWorkspacePanel = useCallback((panelId: string) => {
    setWorkspacePanelsOpen((current) => ({ ...current, [panelId]: !current[panelId] }));
  }, []);

  const renderWorkspacePanelToggle = useCallback((panelId: string, title: string, description: string) => {
    const open = Boolean(workspacePanelsOpen[panelId]);
    return (
      <Card className="border-white/60 bg-white/80 backdrop-blur">
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-950">{title}</p>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => toggleWorkspacePanel(panelId)}>
              {open ? 'Close' : 'Open'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }, [toggleWorkspacePanel, workspacePanelsOpen]);

  const fetchTemplates = async () => {
    const response = await fetch('/api/templates');
    if (response.ok) setTemplates(await response.json());
    else setErrorMessage('Unable to load templates.');
  };

  const fetchTemplateEntitlements = useCallback(async () => {
    if (status !== 'authenticated') return;
    setTemplateEntitlementsLoading(true);
    try {
      const response = await fetch('/api/template-marketplace/purchases', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (response.ok && payload && Array.isArray(payload.purchases)) {
        setTemplateEntitlements(payload.purchases);
      }
    } catch {
      // silent: entitlements should never block dashboard
    } finally {
      setTemplateEntitlementsLoading(false);
    }
  }, [status]);

  const fetchHistory = async () => {
    const response = await fetch('/api/history', { cache: 'no-store' });
    if (!response.ok) {
      setErrorMessage('Unable to load history.');
      return null;
    }
    const next = await response.json();
    setHistory(next);
    setCurrentHistoryEntry((prev) => {
      if (!prev?.id) return prev;
      const refreshed = Array.isArray(next) ? next.find((h: any) => h?.id === prev.id) : null;
      return refreshed || prev;
    });
    setSigningStatusEntry((prev) => {
      if (!prev?.id) return prev;
      const refreshed = Array.isArray(next) ? next.find((h: any) => h?.id === prev.id) : null;
      return refreshed || prev;
    });
    return next;
  };

  const myCustomTemplates = useMemo(() => {
    const email = (session?.user?.email || '').toLowerCase();
    const userId = session?.user?.id;
    return (allowedTemplates || [])
      .filter((t) => t.isCustom)
      .filter((t) => {
        if (session?.user?.role === 'admin') {
          // For admins, treat "mine" as templates they authored.
          return !email ? false : String(t.createdBy || '').toLowerCase() === email;
        }
        if (session?.user?.role === 'client') {
          return Boolean(t.organizationId && userId && t.organizationId === userId);
        }
        return !email ? false : String(t.createdBy || '').toLowerCase() === email;
      })
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
  }, [allowedTemplates, session?.user?.email, session?.user?.id, session?.user?.role]);

  const dashboardTemplates = useMemo(() => {
    const all = (allowedTemplates || []).slice().sort((a, b) => a.name.localeCompare(b.name));
    const mine = myCustomTemplates;
    const recommended = all.filter((t) => !t.isCustom).slice(0, 10);
    return { all, mine, recommended };
  }, [allowedTemplates, myCustomTemplates]);

  const fetchDashboard = async () => {
    const response = await fetch('/api/dashboard');
    if (response.ok) setDashboard(await response.json());
    else setErrorMessage('Unable to load dashboard metrics.');
  };

  const fetchNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    const response = await fetch('/api/notifications', { cache: 'no-store' });
    if (response.ok) {
      const payload = await response.json();
      setNotifications(payload.notifications || []);
    }
    setNotificationsLoading(false);
  }, []);

  const fetchProfileOverview = async () => {
    const response = await fetch('/api/profile/overview', { cache: 'no-store' });
    if (response.ok) {
      setProfileOverview(await response.json());
    }
  };

  const fetchPlatformConfig = async () => {
    const response = await fetch('/api/platform', { cache: 'no-store' });
    if (response.ok) {
      setPlatformConfig(await response.json());
    }
  };

  useEffect(() => {
    if (status === 'authenticated') {
      void Promise.all([fetchTemplates(), fetchTemplateEntitlements(), fetchHistory(), fetchDashboard(), fetchNotifications(), fetchProfileOverview(), fetchSignatureSettings(), fetchCollaborationSettings(), fetchDocumentParserHistory(), fetchPlatformConfig()]);
      if (session?.user?.role === 'client') {
        void fetch('/api/business/settings').then((response) => response.ok ? response.json() : null).then((payload) => setClientBusinessSettings(payload));
      }
    }
  }, [fetchNotifications, fetchTemplateEntitlements, session?.user?.role, status]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('docrud-dashboard-usage-open');
      if (raw === '1') setDashboardUsageOpen(true);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('docrud-system-notifications-read');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setSystemNotificationsReadIds(parsed.filter((value) => typeof value === 'string'));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!dashboardUsageOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDashboardUsageOpen(false);
    };
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-dashboard-usage-root]')) return;
      setDashboardUsageOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handlePointerDown);
    };
  }, [dashboardUsageOpen]);


  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (target as HTMLElement | null)?.isContentEditable) {
        return;
      }

      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === 'k') {
        event.preventDefault();
        setDashboardUsageOpen(false);
        setNotificationOpen(false);
        globalSearchBarRef.current?.open();
      } else if (!event.metaKey && !event.ctrlKey && !event.altKey && key === '/') {
        event.preventDefault();
        setDashboardUsageOpen(false);
        setNotificationOpen(false);
        globalSearchBarRef.current?.open();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const markSystemNotificationsRead = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setSystemNotificationsReadIds((prev) => {
      const next = Array.from(new Set([...prev, ...ids]));
      try {
        window.localStorage.setItem('docrud-system-notifications-read', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const markNotificationsRead = async (ids: string[]) => {
    if (ids.length === 0) return;
    const systemIds = ids.filter((value) => value.startsWith('sys:'));
    const apiIds = ids.filter((value) => !value.startsWith('sys:'));
    if (systemIds.length > 0) {
      markSystemNotificationsRead(systemIds);
    }
    if (apiIds.length === 0) return;
    const response = await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: apiIds }),
    });
    if (response.ok) {
      const payload = await response.json();
      setNotifications(payload.notifications || []);
    }
  };

  const submitWorkspaceFeedback = async () => {
    if (!feedbackForm.summary.trim() || !feedbackForm.painPoints.trim() || !feedbackForm.requestedImprovements.trim()) {
      setErrorMessage('Please share a short summary, what is slowing you down, and what should improve.');
      return;
    }

    setFeedbackSubmitting(true);
    try {
      const response = await fetch('/api/user-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: Number(feedbackForm.rating),
          summary: feedbackForm.summary,
          painPoints: feedbackForm.painPoints,
          requestedImprovements: feedbackForm.requestedImprovements,
          mostUsedFeature: activeTab,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to save feedback right now.');
      }
      setFeedbackPromptOpen(false);
      setFeedbackForm({
        rating: '4',
        summary: '',
        painPoints: '',
        requestedImprovements: '',
      });
      setSuccessMessage('Thanks. Your feedback has been recorded and will be reviewed for product improvements.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save feedback right now.');
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const fetchDocumentParserHistory = async () => {
    const response = await fetch('/api/ai/document-parser/history');
    if (response.ok) setDocumentParserHistory(await response.json());
  };

  const buildLiveParserInsights = useCallback((content: string, title: string): ParsedDocumentInsights => {
    const normalizedContent = preserveDocumentStructure(content);
    const insights = buildStructuredInsights(normalizedContent, title || 'Untitled document');
    return {
      title: title || 'Untitled document',
      fileName: documentParserSourceLabel,
      sourceType: documentParserSourceLabel ? 'upload' : 'paste',
      extractionMethod: activeParserHistoryId ? 'history_edit' : 'live_editor',
      analysisMode: 'fallback',
      extractedContent: normalizedContent,
      extractedCharacterCount: normalizedContent.length,
      ...insights,
      provider: 'Live parser',
      model: 'local-structured-analysis',
    };
  }, [activeParserHistoryId, documentParserSourceLabel]);

  const fetchAiWorkspaceInsights = useCallback(async () => {
    setAiWorkspaceLoading(true);
    try {
      const response = await fetch('/api/ai/workspace-insights');
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to generate workspace insights.');
      }
      setAiWorkspaceInsights(payload);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to generate workspace insights.');
    } finally {
      setAiWorkspaceLoading(false);
    }
  }, []);

  const openWorkspaceInsights = useCallback(() => {
    setActiveTab('dashboard');
    setWorkspacePanelsOpen((current) => ({ ...current, ['summary-briefing']: true }));
    void Promise.all([fetchAiWorkspaceInsights(), fetchNotifications()]);
  }, [fetchAiWorkspaceInsights, fetchNotifications]);

  useEffect(() => {
    if (searchParams?.get('open') === 'insights') {
      openWorkspaceInsights();
    }
  }, [openWorkspaceInsights, searchParams]);

  useEffect(() => {
    const handleOpenInsights = () => {
      openWorkspaceInsights();
    };

    window.addEventListener('docrud:open-insights', handleOpenInsights);
    return () => window.removeEventListener('docrud:open-insights', handleOpenInsights);
  }, [openWorkspaceInsights]);

  useEffect(() => {
    if (status === 'authenticated' && (activeTab === 'dashboard' || activeTab === 'internal-mailbox' || notificationOpen)) {
      void fetchNotifications();
    }
  }, [activeTab, fetchNotifications, notificationOpen, status]);

  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }
    if (!(activeTab === 'dashboard' || notificationOpen || workspacePanelsOpen['summary-briefing'])) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void fetchNotifications();
      if (workspacePanelsOpen['summary-briefing']) {
        void fetchAiWorkspaceInsights();
      }
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [activeTab, fetchAiWorkspaceInsights, fetchNotifications, notificationOpen, status, workspacePanelsOpen]);

  const fetchAiDraftInsights = async () => {
    if (!selectedTemplate) return;

    const draftData = buildTemplateData();
    const draftPreviewHtml = generatedHtml || renderDocumentTemplate(selectedTemplate, draftData, {
      generatedBy: session?.user?.email || session?.user?.name || 'docrud workspace',
      renderMode: selectedTemplate.isCustom ? 'plain' : 'platform',
      signature: selectedSignature || undefined,
      designPreset: selectedDesignPreset,
      watermarkLabel: isClient ? CLIENT_PREVIEW_WATERMARK : undefined,
      ...getTemplatePageRenderOptions(selectedTemplate),
    });

    setAiDraftLoading(true);
    try {
      const response = await fetch('/api/ai/document-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateName: selectedTemplate.name,
          category: selectedTemplate.category,
          data: draftData,
          previewHtml: draftPreviewHtml,
          internalSummary: selectedTemplate.description,
          clauseLibrary: [
            'Confidentiality and data protection',
            'Approval and review governance',
            'Commercial liability and indemnity',
            'Termination and renewal',
          ],
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to analyze this draft.');
      }
      setAiDraftInsights(payload);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to analyze this draft.');
    } finally {
      setAiDraftLoading(false);
    }
  };

  const generateAiDraft = async () => {
    if (!selectedTemplate) return;

    setAiGenerationLoading(true);
    try {
      const response = await fetch('/api/ai/document-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateName: selectedTemplate.name,
          category: selectedTemplate.category,
          templateHtml: selectedTemplate.template,
          fields: selectedTemplate.fields,
          currentData: buildTemplateData(),
          instructions: aiGenerationPrompt.trim() || 'Generate a complete, business-ready first draft with realistic enterprise data and polished wording.',
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to generate AI draft.');
      }

      setFormData((prev) => ({
        ...prev,
        ...(payload?.fieldValues || {}),
      }));
      setAiGeneratedDraft(payload);
      setAiDraftInsights(null);
      setGeneratedHtml('');
      setCurrentHistoryEntry(null);
      setSuccessMessage('AI generated a complete first draft. Review the fields, then generate the preview.');
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to generate AI draft.');
      setSuccessMessage('');
    } finally {
      setAiGenerationLoading(false);
    }
  };

  const saveParserSnapshot = async (override?: Partial<ParserHistoryEntry>) => {
    const normalizedContent = preserveDocumentStructure(override?.content ?? documentParserContent);
    const normalizedTitle = (override?.title ?? documentParserTitle ?? 'Untitled document').trim();
    const insights = ((override?.insights as ParsedDocumentInsights | undefined) || buildLiveParserInsights(normalizedContent, normalizedTitle)) as NonNullable<ParsedDocumentInsights>;
    const payload = {
      id: override?.id || activeParserHistoryId || undefined,
      title: normalizedTitle,
      sourceLabel: override?.sourceLabel ?? documentParserSourceLabel,
      sourceType: override?.sourceType || ((override?.sourceLabel ?? documentParserSourceLabel) ? 'upload' : 'paste'),
      extractionMethod: override?.extractionMethod || insights.extractionMethod || 'live_editor',
      content: normalizedContent,
      insights: {
        summary: insights.summary,
        tone: insights.tone,
        score: insights.score,
        keyDetails: insights.keyDetails,
        risks: insights.risks,
        mitigations: insights.mitigations,
        obligations: insights.obligations,
        recommendedActions: insights.recommendedActions,
        provider: insights.provider,
        model: insights.model,
      },
    };

    const method = payload.id ? 'PATCH' : 'POST';
    const response = await fetch('/api/ai/document-parser/history', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const saved = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(saved?.error || 'Unable to save parser history.');
    }
    setActiveParserHistoryId(saved.id);
    await fetchDocumentParserHistory();
    return saved as ParserHistoryEntry;
  };

  const parseDocumentWithAi = async (contentOverride?: string, titleOverride?: string, sourceType: 'upload' | 'paste' | 'preview' = 'paste') => {
    const content = preserveDocumentStructure(contentOverride ?? documentParserContent);
    if (!content) {
      setDocumentParserError('Add document content or upload a supported document before parsing.');
      setDocumentParserSuccess('');
      return;
    }

    setDocumentParserLoading(true);
    setDocumentParserError('');
    setDocumentParserSuccess('');
    try {
      const response = await fetch('/api/ai/document-parser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: titleOverride || documentParserTitle || selectedTemplate?.name || 'Untitled document',
          fileName: titleOverride || documentParserSourceLabel,
          sourceType,
          content,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to parse this document.');
      }

      setParsedDocumentInsights(payload);
      setDocumentParserContent(payload?.extractedContent || content);
      setActiveParserHistoryId('');
      if (titleOverride) setDocumentParserTitle(titleOverride);
      else if (payload?.title) setDocumentParserTitle(payload.title);
      await saveParserSnapshot({
        title: payload?.title || titleOverride || documentParserTitle || 'Untitled document',
        sourceLabel: titleOverride || documentParserSourceLabel,
        sourceType,
        extractionMethod: payload?.extractionMethod || 'ai_parse',
        content: payload?.extractedContent || content,
        insights: payload,
      });
      setDocumentParserSuccess('Document parsed successfully. Review the extracted content, score, tone, risks, and actions below.');
      setDocumentParserError('');
    } catch (error) {
      setParsedDocumentInsights(null);
      setDocumentParserError(error instanceof Error ? error.message : 'Unable to parse this document.');
      setDocumentParserSuccess('');
    } finally {
      setDocumentParserLoading(false);
    }
  };

  const handleDocumentParserUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setDocumentParserTitle(file.name.replace(/\.[^.]+$/, ''));
      setDocumentParserSourceLabel(file.name);
      setDocumentParserLoading(true);
      setParsedDocumentInsights(null);
      setDocumentParserError('');
      setDocumentParserSuccess('');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', file.name.replace(/\.[^.]+$/, ''));

      const response = await fetch('/api/ai/document-parser', {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to parse this uploaded file.');
      }

      setParsedDocumentInsights(payload);
      setDocumentParserContent(payload?.extractedContent || '');
      setActiveParserHistoryId('');
      if (payload?.title) setDocumentParserTitle(payload.title);
      await saveParserSnapshot({
        title: payload?.title || file.name.replace(/\.[^.]+$/, ''),
        sourceLabel: file.name,
        sourceType: 'upload',
        extractionMethod: payload?.extractionMethod || 'server_file_extraction',
        content: payload?.extractedContent || '',
        insights: payload,
      });
      setDocumentParserSuccess('Uploaded document parsed successfully. The extracted content and analysis are shown below.');
      setDocumentParserError('');
    } catch (error) {
      setParsedDocumentInsights(null);
      setDocumentParserContent('');
      setDocumentParserError(error instanceof Error ? error.message : 'Unable to read this file.');
      setDocumentParserSuccess('');
    } finally {
      setDocumentParserLoading(false);
      event.target.value = '';
    }
  };

  const restoreParserHistoryEntry = (entry: ParserHistoryEntry) => {
    setActiveParserHistoryId(entry.id);
    setDocumentParserTitle(entry.title);
    setDocumentParserSourceLabel(entry.sourceLabel || '');
    setDocumentParserContent(entry.content);
    setParsedDocumentInsights({
      title: entry.title,
      fileName: entry.sourceLabel || '',
      sourceType: entry.sourceType,
      extractionMethod: entry.extractionMethod,
      analysisMode: 'fallback',
      extractedContent: entry.content,
      extractedCharacterCount: entry.extractedCharacterCount,
      ...entry.insights,
    });
    setDocumentParserSuccess('Loaded a saved parser session. You can edit the content and save changes again.');
    setDocumentParserError('');
  };

  const deleteParserHistoryItem = async (id: string) => {
    const response = await fetch(`/api/ai/document-parser/history?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || 'Unable to delete parser history.');
    }
    if (activeParserHistoryId === id) {
      setActiveParserHistoryId('');
    }
    await fetchDocumentParserHistory();
  };

  const fetchSignatureSettings = async () => {
    const response = await fetch('/api/settings/signature');
    if (response.ok) setSignatureSettings(await response.json());
  };

  const fetchCollaborationSettings = async () => {
    const response = await fetch('/api/settings/collaboration');
    if (response.ok) {
      const settings = await response.json();
      setCollaborationSettings(settings);
      setRecipientAccess(settings.defaultRecipientAccess || 'comment');
    }
  };

  const validateRequiredFields = (template: DocumentTemplate, data: Record<string, string>) =>
    template.fields.filter((field) => field.required && !data[field.name]?.trim());

  const buildTemplateData = () =>
    (selectedTemplate?.fields || []).reduce<Record<string, string>>((acc, field) => {
      acc[field.name] = formData[field.name] || '';
      return acc;
    }, {});

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (livePreviewUpdateTimeoutRef.current) {
      window.clearTimeout(livePreviewUpdateTimeoutRef.current);
    }

    livePreviewUpdateTimeoutRef.current = window.setTimeout(() => {
      if (!selectedTemplate) {
        if (!currentHistoryEntry || currentHistoryEntry.documentSourceType !== 'uploaded_pdf') {
          setGeneratedHtml('');
        }
        return;
      }

      try {
        const data = buildTemplateData();
        const historyContext = currentHistoryEntry?.templateId === selectedTemplate.id ? currentHistoryEntry : null;
        const brandedHtml = renderDocumentTemplate(selectedTemplate, data, {
          referenceNumber: historyContext?.referenceNumber,
          generatedAt: historyContext?.generatedAt,
          generatedBy: historyContext?.generatedBy || session?.user?.email || 'docrud workflow',
          renderMode: selectedTemplate.isCustom ? 'plain' : 'platform',
          designPreset: historyContext?.editorState?.designPreset || selectedDesignPreset,
          signature: selectedSignature || undefined,
          watermarkLabel: historyContext?.editorState?.watermarkLabel ?? resolvedDocumentWatermarkLabel,
          letterheadMode: historyContext?.editorState?.letterheadMode ?? clientBusinessSettings?.letterheadMode,
          letterheadImageDataUrl: historyContext?.editorState?.letterheadImageDataUrl ?? clientBusinessSettings?.letterheadImageDataUrl,
          letterheadHtml: historyContext?.editorState?.letterheadHtml ?? clientBusinessSettings?.letterheadHtml,
          ...getTemplatePageRenderOptions(selectedTemplate),
        });

        const clientPreviewHtml = isClient
          ? buildClientPreviewHtml(selectedTemplate, data, selectedSignature, {
              referenceNumber: historyContext?.referenceNumber,
              generatedAt: historyContext?.generatedAt,
              generatedBy: historyContext?.generatedBy,
              designPreset: historyContext?.editorState?.designPreset,
              letterheadMode: historyContext?.editorState?.letterheadMode,
              letterheadImageDataUrl: historyContext?.editorState?.letterheadImageDataUrl,
              letterheadHtml: historyContext?.editorState?.letterheadHtml,
            })
          : brandedHtml;

        setGeneratedHtml(clientPreviewHtml);
      } catch {
        // Ignore live preview failures and keep last stable preview.
      }
    }, 150);

    return () => {
      if (livePreviewUpdateTimeoutRef.current) {
        window.clearTimeout(livePreviewUpdateTimeoutRef.current);
        livePreviewUpdateTimeoutRef.current = null;
      }
    };
  }, [
    clientBusinessSettings?.letterheadHtml,
    clientBusinessSettings?.letterheadImageDataUrl,
    clientBusinessSettings?.letterheadMode,
    currentHistoryEntry,
    formData,
    getTemplatePageRenderOptions,
    isClient,
    resolvedDocumentWatermarkLabel,
    selectedDesignPreset,
    selectedSignature,
    selectedTemplate,
    session?.user?.email,
  ]);

  const buildRelativeSharePath = (item?: ShareTarget | null) => {
    if (!item) return '';
    if (item.shareUrl) {
      return item.shareUrl.startsWith('http')
        ? new URL(item.shareUrl).pathname
        : item.shareUrl;
    }
    if (item.shareId) return `/documents/${item.shareId}`;
    if (item.id) return `/documents/${item.id}`;
    return '';
  };

  const buildAbsoluteShareUrl = (item?: ShareTarget | null) => {
    const relativePath = buildRelativeSharePath(item);
    if (!relativePath) return '';
    return buildAbsoluteAppUrl(relativePath, typeof window !== 'undefined' ? window.location.origin : undefined);
  };

  const buildShareMessage = (item: Pick<DocumentHistory, 'templateName' | 'sharePassword' | 'recipientSignatureRequired' | 'recipientAccess' | 'shareUrl' | 'dataCollectionEnabled' | 'dataCollectionInstructions'>) => {
    const absoluteUrl = buildAbsoluteShareUrl(item);
    const passwordLine = item.recipientSignatureRequired && item.sharePassword
      ? `Signing password: ${item.sharePassword}`
      : item.sharePassword
        ? `Access password: ${item.sharePassword}`
        : '';
    const introLine = item.dataCollectionEnabled
      ? `Please complete the requested ${item.templateName} form from docrud.`
      : `Please review this ${item.templateName} from docrud.`;
    const instructionsLine = item.dataCollectionEnabled && item.dataCollectionInstructions?.trim()
      ? `Instructions: ${item.dataCollectionInstructions.trim()}`
      : '';
    const accessLabel = item.recipientAccess === 'edit'
      ? 'Recipient access: edit, comment, and review'
      : item.recipientAccess === 'view'
        ? 'Recipient access: view only'
        : 'Recipient access: comment and review';

    return [
      introLine,
      absoluteUrl ? `Document link: ${absoluteUrl}` : '',
      accessLabel,
      instructionsLine,
      passwordLine,
    ]
      .filter(Boolean)
      .join('\n');
  };

  useEffect(() => {
    const firstSharePath = buildRelativeSharePath(currentHistoryEntry || history.find((entry) => entry.shareUrl || entry.shareId));
    if (firstSharePath) {
      router.prefetch(firstSharePath);
    }
  }, [currentHistoryEntry, history, router]);

  const handleTemplateSelect = (template: DocumentTemplate) => {
    setSelectedTemplate(template);
    setUploadedPdfDraft(null);
    setSelectedDesignPreset(DEFAULT_DOCUMENT_DESIGN_PRESET);
    setFormData({});
    setOnboardingContext({
      employeeName: '',
      employeeEmail: '',
      employeeDepartment: '',
      employeeDesignation: '',
      employeeCode: '',
    });
    setGeneratedHtml('');
    setCurrentHistoryEntry(null);
    setSelectedSignatureId('');
    setRequiredDocumentWorkflowEnabled(false);
    setRequiredDocumentsText('');
    setDataCollectionEnabled(false);
    setDataCollectionInstructions('');
    setRecipientAccess(collaborationSettings.defaultRecipientAccess || 'comment');
    setActiveTab('generate');
    setSidebarOpen(false);
    setAiGeneratedDraft(null);
    setAiGenerationPrompt('');
    setAiDraftInsights(null);
    setErrorMessage('');
    setSuccessMessage('');
    setDraftRestored(false);
    setEsignStep('security');
  };

  useEffect(() => {
    const templateId = searchParams?.get('templateId');
    if (!templateId) return;
    const match = allowedTemplates.find((template) => template.id === templateId);
    if (!match) return;
    handleTemplateSelect(match);
  }, [allowedTemplates, searchParams]);

  const handleDesignPresetChange = (preset: DocumentDesignPreset) => {
    setSelectedDesignPreset(preset);
    setGeneratedHtml('');
    setCurrentHistoryEntry(null);
    setAiGeneratedDraft(null);
    setAiDraftInsights(null);
    setSuccessMessage('');
    setErrorMessage('');
  };

  const openExamplePreview = (preset: DocumentDesignPreset) => {
    setExamplePreviewPreset(preset);
    setExamplePreviewOpen(true);
  };

  useEffect(() => {
    if (!selectedTemplate || typeof window === 'undefined') {
      return;
    }

    const rawDraft = window.localStorage.getItem(`${DRAFT_STORAGE_PREFIX}${selectedTemplate.id}`);
    if (!rawDraft) {
      setDraftRestored(false);
      return;
    }

    try {
      const parsed = JSON.parse(rawDraft) as Record<string, string>;
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
        setFormData(parsed);
        setSuccessMessage('Recovered your saved draft for this template.');
        setErrorMessage('');
        setDraftRestored(true);
      }
    } catch {
      window.localStorage.removeItem(`${DRAFT_STORAGE_PREFIX}${selectedTemplate.id}`);
      setDraftRestored(false);
    }
  }, [selectedTemplate]);

  useEffect(() => {
    if (!selectedTemplate || typeof window === 'undefined') {
      return;
    }

    const storageKey = `${DRAFT_STORAGE_PREFIX}${selectedTemplate.id}`;
    const hasContent = Object.values(formData).some((value) => value?.trim());

    if (hasContent) {
      window.localStorage.setItem(storageKey, JSON.stringify(formData));
    } else {
      window.localStorage.removeItem(storageKey);
    }
  }, [formData, selectedTemplate]);

  useEffect(() => {
    if (!documentParserContent.trim() || !parsedDocumentInsights) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setParsedDocumentInsights((current) => {
        if (!current) {
          return current;
        }
        const live = buildLiveParserInsights(documentParserContent, documentParserTitle || current.title || 'Untitled document') as NonNullable<ParsedDocumentInsights>;
        return {
          ...current,
          ...live,
          sourceType: current.sourceType,
          extractionMethod: current.extractionMethod || live.extractionMethod,
          provider: current.provider === 'Groq' ? 'Live parser + AI baseline' : live.provider,
          model: current.provider === 'Groq' ? current.model : live.model,
        };
      });
    }, 200);

    return () => window.clearTimeout(timeout);
  }, [buildLiveParserInsights, documentParserContent, documentParserTitle, parsedDocumentInsights]);

  const saveToHistory = async (
    template: DocumentTemplate,
    data: Record<string, string>,
    previewHtml: string,
    signature: SignatureRecord | null,
    options?: {
      recipientAccess?: RecipientAccessLevel;
      recipientSignatureRequired?: boolean;
        dataCollectionEnabled?: boolean;
        dataCollectionStatus?: DataCollectionStatus;
        dataCollectionInstructions?: string;
        shareAccessPolicy?: 'standard' | 'expiring' | 'one_time';
        shareExpiresAt?: string;
        maxAccessCount?: number;
      }
  ) => {
    const requiresOnboarding = template.category?.toLowerCase() === 'hr' || ONBOARDING_TEMPLATE_IDS.includes(template.id);
    const response = await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateId: template.id,
        templateName: template.name,
        category: template.category,
        data,
        previewHtml,
        ...(signature ? {
          signatureId: signature.id,
          signatureName: signature.signerName,
          signatureRole: signature.signerRole,
          signatureSignedAt: signature.signedAt,
          signatureSignedIp: signature.signedIp,
        } : {}),
        requiredDocumentWorkflowEnabled: requiresOnboarding ? true : requiredDocumentWorkflowEnabled,
        requiredDocuments: requiresOnboarding
          ? DEFAULT_BGV_DOCUMENTS
          : requiredDocumentsText.split(',').map((item) => item.trim()).filter(Boolean),
        recipientSignatureRequired: requiresOnboarding ? true : (options?.recipientSignatureRequired ?? recipientSignatureRequired),
        recipientAccess: options?.recipientAccess || recipientAccess,
        dataCollectionEnabled: options?.dataCollectionEnabled ?? dataCollectionEnabled,
        dataCollectionStatus: options?.dataCollectionStatus || ((options?.dataCollectionEnabled ?? dataCollectionEnabled) ? 'sent' : 'disabled'),
        dataCollectionInstructions: options?.dataCollectionInstructions ?? dataCollectionInstructions,
        shareAccessPolicy: options?.shareAccessPolicy ?? shareAccessPolicy,
        shareExpiresAt: options?.shareExpiresAt ?? (shareAccessPolicy === 'expiring' && shareExpiryDays ? new Date(Date.now() + Number(shareExpiryDays) * 24 * 60 * 60 * 1000).toISOString() : undefined),
        maxAccessCount: options?.maxAccessCount ?? (shareAccessPolicy === 'one_time' ? Math.max(1, Number(maxAccessCount) || 1) : undefined),
        onboardingRequired: requiresOnboarding,
        employeeName: onboardingContext.employeeName.trim(),
        employeeEmail: onboardingContext.employeeEmail.trim(),
        employeeDepartment: onboardingContext.employeeDepartment.trim(),
        employeeDesignation: onboardingContext.employeeDesignation.trim(),
        employeeCode: onboardingContext.employeeCode.trim(),
        editorState: isClient ? {
          designPreset: selectedDesignPreset,
          letterheadMode: clientBusinessSettings?.letterheadMode || 'default',
          letterheadImageDataUrl: clientBusinessSettings?.letterheadImageDataUrl,
          letterheadHtml: clientBusinessSettings?.letterheadHtml,
          watermarkLabel: resolvedDocumentWatermarkLabel,
          signatureCertificateBrandingEnabled: resolvedSignatureCertificateBrandingEnabled,
          signatureReceiptCompletionPageEnabled,
        } : {
          designPreset: selectedDesignPreset,
          watermarkLabel: resolvedDocumentWatermarkLabel,
          signatureCertificateBrandingEnabled: resolvedSignatureCertificateBrandingEnabled,
          signatureReceiptCompletionPageEnabled,
        },
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || 'Failed to save history');
    }
    const entry = await response.json();
    setCurrentHistoryEntry(entry);
    await Promise.all([fetchHistory(), fetchDashboard()]);
    return entry as DocumentHistory;
  };

  const handleUploadedPdfSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setUploadedPdfDraft(null);
      return;
    }

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMessage('Only PDF files can be uploaded for secure document sending.');
      setSuccessMessage('');
      event.target.value = '';
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (!dataUrl.startsWith('data:application/pdf;base64,')) {
        throw new Error('The selected file could not be processed as a PDF.');
      }

      // Switching to the uploaded-PDF flow should clear any active template draft context.
      setSelectedTemplate(null);
      setGeneratedHtml('');
      setCurrentHistoryEntry(null);
      setSelectedSignatureId('');
      setAiGeneratedDraft(null);
      setAiDraftInsights(null);

      setUploadedPdfDraft({
        fileName: file.name,
        mimeType: 'application/pdf',
        dataUrl,
      });
      setSuccessMessage('PDF uploaded successfully. You can now create a protected share link.');
      setErrorMessage('');
    } catch (error) {
      setUploadedPdfDraft(null);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to prepare the PDF for sharing.');
      setSuccessMessage('');
    } finally {
      event.target.value = '';
    }
  };

  const createUploadedPdfShare = async () => {
    if (!uploadedPdfDraft) {
      setErrorMessage('Upload a PDF first before creating a secure share link.');
      setSuccessMessage('');
      return false;
    }

    try {
      setIsSendingUploadedPdf(true);
      const shareExpiresAtPatch = shareAccessPolicy === 'expiring' && shareExpiryDays
        ? new Date(Date.now() + Number(shareExpiryDays) * 24 * 60 * 60 * 1000).toISOString()
        : null;
      const shareExpiresAtCreate = shareAccessPolicy === 'expiring' && shareExpiryDays
        ? shareExpiresAtPatch
        : undefined;
      const canUpdateExisting = currentHistoryEntry?.documentSourceType === 'uploaded_pdf'
        && currentHistoryEntry.templateId === 'uploaded-pdf'
        && Boolean(currentHistoryEntry.id);

      const parsedPages = signaturePlacementPages
        .split(/[,;\s]+/g)
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value >= 1)
        .map((value) => Math.floor(value));

      if (signaturePlacementEditorMode === 'boxes' || signatureBoxes.length) {
        const requiredBoxes = signatureBoxes.filter((b: any) => (b as any)?.required !== false);
        const missingAssignee = requiredBoxes.filter((b: any) => !String((b as any)?.signerKey || '').trim());
        if (missingAssignee.length) {
          setErrorMessage('Assign a signer for every required signature box before sending.');
          setSuccessMessage('');
          return false;
        }
        const requiredSignerKeys = Array.from(new Set(requiredBoxes.map((b: any) => String((b as any)?.signerKey || 'recipient').trim() || 'recipient')));
        for (const key of requiredSignerKeys) {
          const email = String(recipientSignerDirectory?.[key]?.signerEmail || '').trim();
          if (!email) {
            setErrorMessage(`Add an email for signer key "${key}" before sending signing links.`);
            setSuccessMessage('');
            return false;
          }
        }
      }

      const payloadBody = {
        documentSourceType: 'uploaded_pdf' as const,
        templateId: 'uploaded-pdf',
        templateName: uploadedPdfDraft.fileName.replace(/\.pdf$/i, '') || 'Uploaded PDF',
        category: 'Uploaded PDF',
        data: {},
        previewHtml: undefined,
        uploadedPdfFileName: uploadedPdfDraft.fileName,
        uploadedPdfMimeType: uploadedPdfDraft.mimeType,
        uploadedPdfDataUrl: uploadedPdfDraft.dataUrl,
        recipientSignatureRequired,
        recipientAccess: 'view' as const,
        recipientSignaturePlacements: (signatureBoxes.length > 0 || signaturePlacementEditorMode === 'boxes')
          ? { mode: 'boxes' as const, version: 1 as const, boxes: signatureBoxes }
          : {
              mode: signaturePlacementMode,
              pages: signaturePlacementMode === 'pages' ? parsedPages : undefined,
              position: signaturePlacementPosition,
              sizePct: 0.22,
              marginPct: 0.04,
            },
        dataCollectionEnabled: false,
        dataCollectionStatus: 'disabled' as const,
        shareAccessPolicy,
        shareExpiresAt: canUpdateExisting ? shareExpiresAtPatch : shareExpiresAtCreate,
        maxAccessCount: shareAccessPolicy === 'one_time' ? Math.max(1, Number(maxAccessCount) || 1) : (canUpdateExisting ? null : undefined),
        automationNotes: ['Secure uploaded PDF share created from workspace'],
        recipientSignerConfigsByKey,
        recipientSignerDirectory,
        recipientSigningMode,
        editorState: {
          watermarkLabel: resolvedDocumentWatermarkLabel,
          signatureCertificateBrandingEnabled: resolvedSignatureCertificateBrandingEnabled,
          signatureReceiptCompletionPageEnabled,
        },
      };

      const response = await fetch('/api/history', {
        method: canUpdateExisting ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(canUpdateExisting ? { ...payloadBody, id: currentHistoryEntry?.id } : payloadBody),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to create uploaded PDF share');
      }

      setCurrentHistoryEntry(payload);
      setGeneratedHtml('');
      setEmailData((prev) => ({
        to: prev.to,
        subject: `${payload.templateName || 'Uploaded PDF'} - ${payload.referenceNumber || ''}`.trim(),
        note: prev.note,
      }));
      await Promise.all([fetchHistory(), fetchDashboard()]);
      setSuccessMessage(`Secure PDF share created successfully. Password: ${payload.sharePassword}.`);
      setErrorMessage('');
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create secure PDF share');
      setSuccessMessage('');
      return false;
    } finally {
      setIsSendingUploadedPdf(false);
    }
  };

  const generateDocument = async () => {
    if (!selectedTemplate) return;

    try {
      setIsGeneratingPreview(true);
      const data = buildTemplateData();
      const missingFields = validateRequiredFields(selectedTemplate, data);
      if (missingFields.length > 0) {
        throw new Error(`Please fill in: ${missingFields.map((field) => field.label).join(', ')}`);
      }
      if (isOnboardingTemplate) {
        if (!onboardingContext.employeeName.trim() || !onboardingContext.employeeEmail.trim()) {
          throw new Error('Employee name and employee email are required for onboarding workflows.');
        }
      }

      const canUpdateExisting = currentHistoryEntry
        && currentHistoryEntry.documentSourceType !== 'uploaded_pdf'
        && currentHistoryEntry.templateId === selectedTemplate.id
        && Boolean(currentHistoryEntry.id)
        && !currentHistoryEntry.revokedAt;

      const shareExpiresAtValue = shareAccessPolicy === 'expiring' && shareExpiryDays
        ? new Date(Date.now() + Number(shareExpiryDays) * 24 * 60 * 60 * 1000).toISOString()
        : undefined;

      const historyEntry = canUpdateExisting
        ? currentHistoryEntry
        : await saveToHistory(
            selectedTemplate,
            data,
            renderDocumentTemplate(selectedTemplate, data, {
              generatedBy: session?.user?.email || 'docrud workflow',
              renderMode: selectedTemplate.isCustom ? 'plain' : 'platform',
              designPreset: selectedDesignPreset,
              signature: selectedSignature || undefined,
              watermarkLabel: resolvedDocumentWatermarkLabel,
              letterheadMode: clientBusinessSettings?.letterheadMode,
              letterheadImageDataUrl: clientBusinessSettings?.letterheadImageDataUrl,
              letterheadHtml: clientBusinessSettings?.letterheadHtml,
              ...getTemplatePageRenderOptions(selectedTemplate),
            }),
            selectedSignature,
            {
              recipientAccess,
              recipientSignatureRequired,
              shareAccessPolicy,
              shareExpiresAt: shareExpiresAtValue,
              maxAccessCount: shareAccessPolicy === 'one_time' ? Math.max(1, Number(maxAccessCount) || 1) : undefined,
            }
          );

      const brandedHtml = renderDocumentTemplate(selectedTemplate, data, {
        referenceNumber: historyEntry.referenceNumber,
        generatedAt: historyEntry.generatedAt,
        generatedBy: historyEntry.generatedBy,
        renderMode: selectedTemplate.isCustom ? 'plain' : 'platform',
        designPreset: historyEntry.editorState?.designPreset || selectedDesignPreset,
        signature: selectedSignature || undefined,
        watermarkLabel: historyEntry.editorState?.watermarkLabel ?? resolvedDocumentWatermarkLabel,
        letterheadMode: historyEntry.editorState?.letterheadMode ?? clientBusinessSettings?.letterheadMode,
        letterheadImageDataUrl: historyEntry.editorState?.letterheadImageDataUrl ?? clientBusinessSettings?.letterheadImageDataUrl,
        letterheadHtml: historyEntry.editorState?.letterheadHtml ?? clientBusinessSettings?.letterheadHtml,
        ...getTemplatePageRenderOptions(selectedTemplate),
      });

      const historyPatchPayload: Record<string, any> = {
        id: historyEntry.id,
        templateName: selectedTemplate.name,
        category: selectedTemplate.category,
        data,
        previewHtml: brandedHtml,
        recipientAccess,
        recipientSignatureRequired,
        shareAccessPolicy,
        shareExpiresAt: shareExpiresAtValue ?? null,
        ...(selectedSignature ? {
          signatureId: selectedSignature.id,
          signatureName: selectedSignature.signerName,
          signatureRole: selectedSignature.signerRole,
          signatureSignedAt: selectedSignature.signedAt,
          signatureSignedIp: selectedSignature.signedIp,
        } : {
          signatureId: undefined,
          signatureName: undefined,
          signatureRole: undefined,
          signatureSignedAt: undefined,
          signatureSignedIp: undefined,
        }),
        editorState: {
          ...(historyEntry.editorState || {}),
          designPreset: selectedDesignPreset,
          watermarkLabel: resolvedDocumentWatermarkLabel,
          signatureCertificateBrandingEnabled: resolvedSignatureCertificateBrandingEnabled,
          signatureReceiptCompletionPageEnabled,
          letterheadMode: clientBusinessSettings?.letterheadMode,
          letterheadImageDataUrl: clientBusinessSettings?.letterheadImageDataUrl,
          letterheadHtml: clientBusinessSettings?.letterheadHtml,
        },
      };

      historyPatchPayload.maxAccessCount = shareAccessPolicy === 'one_time'
        ? Math.max(1, Number(maxAccessCount) || 1)
        : null;

      const historyResponse = await fetch('/api/history', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(historyPatchPayload),
      });
      const updatedHistoryEntry = await historyResponse.json().catch(() => null);
      if (!historyResponse.ok) {
        throw new Error(updatedHistoryEntry?.error || 'Failed to update preview.');
      }
      if (!updatedHistoryEntry) {
        throw new Error('Failed to update preview.');
      }

      const clientPreviewHtml = isClient
        ? buildClientPreviewHtml(selectedTemplate, data, selectedSignature, {
            referenceNumber: updatedHistoryEntry.referenceNumber,
            generatedAt: updatedHistoryEntry.generatedAt,
            generatedBy: updatedHistoryEntry.generatedBy,
            designPreset: updatedHistoryEntry.editorState?.designPreset,
            letterheadMode: updatedHistoryEntry.editorState?.letterheadMode,
            letterheadImageDataUrl: updatedHistoryEntry.editorState?.letterheadImageDataUrl,
            letterheadHtml: updatedHistoryEntry.editorState?.letterheadHtml,
          })
        : brandedHtml;

      setGeneratedHtml(clientPreviewHtml);
      setCurrentHistoryEntry({ ...updatedHistoryEntry, previewHtml: brandedHtml });
      if (selectedTemplate && typeof window !== 'undefined' && !canUpdateExisting) {
        window.localStorage.removeItem(`${DRAFT_STORAGE_PREFIX}${selectedTemplate.id}`);
      }
      setDraftRestored(false);
      setEmailData((prev) => ({
        to: prev.to,
        subject: `${selectedTemplate.name} - ${updatedHistoryEntry.referenceNumber}`,
        note: prev.note,
      }));
      setSuccessMessage(canUpdateExisting
        ? 'Preview updated successfully. Your existing share link remains the same.'
        : 'Preview generated successfully. You can now download, share, or email the document.');
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to generate preview.');
      setSuccessMessage('');
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  const createDataCollectionRequest = async () => {
    if (!selectedTemplate) return;

    try {
      setIsCreatingDataCollectionRequest(true);
      const data = buildTemplateData();
      const previewHtml = renderDocumentTemplate(selectedTemplate, data, {
        generatedBy: session?.user?.email || 'docrud workflow',
        renderMode: selectedTemplate.isCustom ? 'plain' : 'platform',
        designPreset: selectedDesignPreset,
        signature: selectedSignature || undefined,
        watermarkLabel: resolvedDocumentWatermarkLabel,
        letterheadMode: clientBusinessSettings?.letterheadMode,
        letterheadImageDataUrl: clientBusinessSettings?.letterheadImageDataUrl,
        letterheadHtml: clientBusinessSettings?.letterheadHtml,
        ...getTemplatePageRenderOptions(selectedTemplate),
      });

      const historyEntry = await saveToHistory(selectedTemplate, data, previewHtml, selectedSignature, {
        recipientAccess: 'edit',
        recipientSignatureRequired: false,
        dataCollectionEnabled: true,
        dataCollectionStatus: 'sent',
        dataCollectionInstructions,
        shareAccessPolicy,
        shareExpiresAt: shareAccessPolicy === 'expiring' && shareExpiryDays ? new Date(Date.now() + Number(shareExpiryDays) * 24 * 60 * 60 * 1000).toISOString() : undefined,
        maxAccessCount: shareAccessPolicy === 'one_time' ? Math.max(1, Number(maxAccessCount) || 1) : undefined,
      });

      setGeneratedHtml(isClient ? buildClientPreviewHtml(selectedTemplate, data, selectedSignature) : previewHtml);
      setCurrentHistoryEntry({ ...historyEntry, previewHtml });
      setRecipientAccess('edit');
      setSuccessMessage(`Data collection form created successfully. Share link ready at ${buildAbsoluteShareUrl(historyEntry) || historyEntry.shareUrl || `/documents/${historyEntry.shareId}`}.`);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create data collection form');
      setSuccessMessage('');
    } finally {
      setIsCreatingDataCollectionRequest(false);
    }
  };

  const buildClientPreviewHtml = (
    template: DocumentTemplate,
    data: Record<string, string>,
    signature: SignatureRecord | null,
    overrides?: {
      referenceNumber?: string;
      generatedAt?: string;
      generatedBy?: string;
      designPreset?: DocumentDesignPreset;
      letterheadMode?: 'default' | 'image' | 'html';
      letterheadImageDataUrl?: string;
      letterheadHtml?: string;
    }
  ) => renderDocumentTemplate(template, data, {
    referenceNumber: overrides?.referenceNumber,
    generatedAt: overrides?.generatedAt,
    generatedBy: overrides?.generatedBy || session?.user?.email || 'docrud workflow',
    renderMode: template.isCustom ? 'plain' : 'platform',
    designPreset: overrides?.designPreset || selectedDesignPreset,
    signature: signature || undefined,
    watermarkLabel: CLIENT_PREVIEW_WATERMARK,
    letterheadMode: overrides?.letterheadMode ?? clientBusinessSettings?.letterheadMode,
    letterheadImageDataUrl: overrides?.letterheadImageDataUrl ?? clientBusinessSettings?.letterheadImageDataUrl,
    letterheadHtml: overrides?.letterheadHtml ?? clientBusinessSettings?.letterheadHtml,
    ...getTemplatePageRenderOptions(template),
  });

  const requestPdf = async () => {
    if (!selectedTemplate) {
      throw new Error('Please select a template first.');
    }

    const data = buildTemplateData();
    const response = await fetch('/api/generate-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template: selectedTemplate,
        data,
        referenceNumber: currentHistoryEntry?.referenceNumber,
        generatedAt: currentHistoryEntry?.generatedAt,
        generatedBy: currentHistoryEntry?.generatedBy || session?.user?.email,
        signatureId: selectedSignature?.id,
        designPreset: currentHistoryEntry?.editorState?.designPreset || selectedDesignPreset,
        watermarkLabel: currentHistoryEntry?.editorState?.watermarkLabel,
        letterheadMode: currentHistoryEntry?.editorState?.letterheadMode,
        letterheadImageDataUrl: currentHistoryEntry?.editorState?.letterheadImageDataUrl,
        letterheadHtml: currentHistoryEntry?.editorState?.letterheadHtml,
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || 'Failed to generate PDF');
    }
    return response.blob();
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
  };

  const downloadSignedHistoryPdf = async (item: DocumentHistory) => {
    const shareId = item.shareId || item.id;
    const requiresPassword = item.shareRequiresPassword !== false;
    const password = item.sharePassword;
    if (!shareId || (requiresPassword && !password)) {
      setErrorMessage('This record does not have a downloadable signed PDF yet.');
      setSuccessMessage('');
      return;
    }
    try {
      setIsGeneratingPdf(true);
      // Avoid buffering large PDFs in JS (slow + memory heavy). Let the browser download/stream directly.
      const url = `/api/public/documents/${encodeURIComponent(shareId)}/pdf?${requiresPassword ? `password=${encodeURIComponent(password || '')}&` : ''}internal=1`;
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setSuccessMessage('Signed PDF download started.');
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to download signed PDF');
      setSuccessMessage('');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const downloadSignatureReceiptPdf = async (item: DocumentHistory) => {
    const shareId = item.shareId || item.id;
    const requiresPassword = item.shareRequiresPassword !== false;
    const password = item.sharePassword;
    if (!shareId || (requiresPassword && !password)) {
      setErrorMessage('This record does not have a downloadable signature receipt yet.');
      setSuccessMessage('');
      return;
    }
    try {
      setIsGeneratingPdf(true);
      const url = `/api/public/documents/${encodeURIComponent(shareId)}/receipt?${requiresPassword ? `password=${encodeURIComponent(password || '')}&` : ''}internal=1`;
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setSuccessMessage('Signature receipt download started.');
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to download signature receipt');
      setSuccessMessage('');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const sendSigningLinks = async (item: DocumentHistory, signerKey?: string) => {
    if (!item?.id) return;
    try {
      if (!signerKey) setIsSendingSignerLinks(true);
      if (signerKey) {
        setSignerMailActionByKey((current) => ({
          ...(current || {}),
          [signerKey]: { ...(current?.[signerKey] || {}), sendingLink: true, lastLinkMessage: undefined, updatedAt: new Date().toISOString() },
        }));
      }
      const response = await fetch('/api/history/signers/send-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historyId: item.id, signerKey }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to send signing links');
      }
      await Promise.all([fetchHistory(), fetchDashboard()]);
      const results = Array.isArray(payload?.results) ? payload.results : [];
      const failed = results.filter((r: any) => r?.status === 'failed');
      if (signerKey) {
        const result = results.find((r: any) => String(r?.signerKey || '') === signerKey) || null;
        const status = result?.status === 'sent' ? 'sent' : (result?.status === 'failed' ? 'failed' : 'sent');
        setSignerMailActionByKey((current) => ({
          ...(current || {}),
          [signerKey]: {
            ...(current?.[signerKey] || {}),
            sendingLink: false,
            lastLinkStatus: status,
            lastLinkMessage: status === 'sent' ? 'Link email sent' : (String(result?.error || '') || 'Failed to send link email'),
            updatedAt: new Date().toISOString(),
          },
        }));
      }
      if (failed.length) {
        setErrorMessage(`Some emails failed to send (${failed.length}). Open Signing Status to review and retry.`);
        setSuccessMessage('');
      } else {
        setSuccessMessage('Signing link email(s) sent.');
        setErrorMessage('');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to send signing links');
      setSuccessMessage('');
      if (signerKey) {
        setSignerMailActionByKey((current) => ({
          ...(current || {}),
          [signerKey]: {
            ...(current?.[signerKey] || {}),
            sendingLink: false,
            lastLinkStatus: 'failed',
            lastLinkMessage: error instanceof Error ? error.message : 'Failed to send link email',
            updatedAt: new Date().toISOString(),
          },
        }));
      }
    } finally {
      if (!signerKey) setIsSendingSignerLinks(false);
    }
  };

  const sendReminderToSigner = async (item: DocumentHistory, signerKey: string) => {
    if (!item?.id) return;
    try {
      setIsSendingSignerReminder(true);
      setSignerMailActionByKey((current) => ({
        ...(current || {}),
        [signerKey]: { ...(current?.[signerKey] || {}), sendingReminder: true, lastReminderMessage: undefined, updatedAt: new Date().toISOString() },
      }));
      const response = await fetch('/api/history/signers/remind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historyId: item.id, signerKey }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to send reminder');
      }
      await Promise.all([fetchHistory(), fetchDashboard()]);
      setSuccessMessage('Reminder sent.');
      setErrorMessage('');
      setSignerMailActionByKey((current) => ({
        ...(current || {}),
        [signerKey]: {
          ...(current?.[signerKey] || {}),
          sendingReminder: false,
          lastReminderStatus: 'sent',
          lastReminderMessage: 'Reminder email sent',
          updatedAt: new Date().toISOString(),
        },
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to send reminder');
      setSuccessMessage('');
      setSignerMailActionByKey((current) => ({
        ...(current || {}),
        [signerKey]: {
          ...(current?.[signerKey] || {}),
          sendingReminder: false,
          lastReminderStatus: 'failed',
          lastReminderMessage: error instanceof Error ? error.message : 'Failed to send reminder email',
          updatedAt: new Date().toISOString(),
        },
      }));
    } finally {
      setIsSendingSignerReminder(false);
    }
  };

  const generatePDF = async () => {
    if (!generatedHtml || !selectedTemplate) return;
    try {
      setIsGeneratingPdf(true);
      const blob = await requestPdf();
      downloadBlob(blob, `${selectedTemplate.name.replace(/\s+/g, '_')}.pdf`);
      setSuccessMessage('PDF generated successfully.');
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Error generating PDF');
      setSuccessMessage('');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const sendEmail = async () => {
    const targetEntry = emailTargetEntry || currentHistoryEntry;
    if (!targetEntry) return;
    try {
      setIsSendingEmail(true);
      const attachmentBytes = async () => {
        if (targetEntry.documentSourceType === 'uploaded_pdf') {
          const dataUrl = targetEntry.signedPdfDataUrl || targetEntry.uploadedPdfDataUrl;
          if (!dataUrl || !dataUrl.startsWith('data:')) return undefined;
          const base64 = dataUrl.split(',')[1] || '';
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
          return Array.from(bytes);
        }

        const template = templates.find((t) => t.id === targetEntry.templateId) || null;
        if (!template) return undefined;
        const response = await fetch('/api/generate-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template,
            data: targetEntry.data || {},
            referenceNumber: targetEntry.referenceNumber,
            generatedAt: targetEntry.generatedAt,
            generatedBy: targetEntry.generatedBy,
            signatureId: targetEntry.signatureId,
            designPreset: targetEntry.editorState?.designPreset,
            watermarkLabel: targetEntry.editorState?.watermarkLabel,
            letterheadMode: targetEntry.editorState?.letterheadMode,
            letterheadImageDataUrl: targetEntry.editorState?.letterheadImageDataUrl,
            letterheadHtml: targetEntry.editorState?.letterheadHtml,
          }),
        });
        if (!response.ok) return undefined;
        const blob = await response.blob();
        const buffer = await blob.arrayBuffer();
        return Array.from(new Uint8Array(buffer));
      };

      const emailResponse = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          historyId: targetEntry.id,
          to: emailData.to,
          subject: emailData.subject,
          senderNote: emailData.note,
          text: '',
          attachment: await attachmentBytes(),
          emailType: targetEntry.dataCollectionEnabled ? 'collection_request' : 'document_delivery',
        }),
      });
      const payload = await emailResponse.json().catch(() => null);
      if (!emailResponse.ok) throw new Error(payload?.error || 'Failed to send email');
      setSuccessMessage('Email sent successfully.');
      setErrorMessage('');
      setEmailDialogOpen(false);
      setEmailTargetEntry(null);
      await Promise.all([fetchHistory(), fetchDashboard()]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to send email');
      setSuccessMessage('');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const revokeCurrentShare = async () => {
    if (!currentHistoryEntry) return;
    if (!confirm('Revoke this shared link? Recipients will no longer be able to open it.')) return;
    try {
      const response = await fetch('/api/history', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentHistoryEntry.id,
          revokedAt: new Date().toISOString(),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Failed to revoke link');
      setCurrentHistoryEntry(payload);
      await Promise.all([fetchHistory(), fetchDashboard()]);
      setSuccessMessage('Shared link revoked successfully.');
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to revoke link');
      setSuccessMessage('');
    }
  };

  const reuseHistoryItem = (item: DocumentHistory) => {
    const template = templates.find((entry) => entry.id === item.templateId || entry.name === item.templateName);
    if (!template) {
      setErrorMessage('This history entry uses a template that is no longer available.');
      setSuccessMessage('');
      return;
    }

    const historySignature = availableSignatures.find((signature) => signature.id === item.signatureId) || null;
    setSelectedTemplate(template);
    setSelectedSignatureId(historySignature?.id || '');
    setSelectedDesignPreset(item.editorState?.designPreset || DEFAULT_DOCUMENT_DESIGN_PRESET);
    setDocumentWatermarkLabel(item.editorState?.watermarkLabel || '');
    setSignatureCertificateBrandingEnabled(item.editorState?.signatureCertificateBrandingEnabled !== false);
    setSignatureReceiptCompletionPageEnabled(item.editorState?.signatureReceiptCompletionPageEnabled !== false);
    setRequiredDocumentWorkflowEnabled(item.requiredDocumentWorkflowEnabled ?? false);
    setRequiredDocumentsText((item.requiredDocuments || []).join(', '));
    setShareAccessPolicy(item.shareAccessPolicy || 'standard');
    setShareExpiryDays(item.shareExpiresAt ? String(Math.max(1, Math.ceil((new Date(item.shareExpiresAt).getTime() - Date.now()) / 86400000))) : '7');
    setMaxAccessCount(String(item.maxAccessCount || 1));
    setRecipientSignatureRequired(item.recipientSignatureRequired ?? true);
    setRecipientAccess(item.recipientAccess || collaborationSettings.defaultRecipientAccess || 'comment');
    setDataCollectionEnabled(Boolean(item.dataCollectionEnabled));
    setDataCollectionInstructions(item.dataCollectionInstructions || '');
    setOnboardingContext({
      employeeName: item.employeeName || '',
      employeeEmail: item.employeeEmail || '',
      employeeDepartment: item.employeeDepartment || '',
      employeeDesignation: item.employeeDesignation || '',
      employeeCode: item.employeeCode || '',
    });
    setFormData(item.data || {});
    if (item.documentSourceType === 'uploaded_pdf') {
      const placements = item.recipientSignaturePlacements;
      if (placements && (placements as any).mode === 'boxes' && Array.isArray((placements as any).boxes)) {
        setSignatureBoxes((placements as any).boxes as any);
        setSignaturePlacementEditorMode('boxes');
      }
      setRecipientSignerConfigsByKey((item as any).recipientSignerConfigsByKey || {});
      setRecipientSignerDirectory((item as any).recipientSignerDirectory || {});
      setRecipientSigningMode(((item as any).recipientSigningMode === 'sequential') ? 'sequential' : 'parallel');
      setEsignStep('share');
    }
    const recipientSignature = item.recipientSignatureDataUrl
      ? {
          signerName: item.recipientSignerName || 'Recipient',
          signatureDataUrl: item.recipientSignatureDataUrl,
          signatureSource: item.recipientSignatureSource,
          signedAt: item.recipientSignedAt,
          signedIp: item.recipientSignedIp,
          signedLocationLabel: item.recipientSignedLocationLabel,
          signedLatitude: item.recipientSignedLatitude,
          signedLongitude: item.recipientSignedLongitude,
          signedAccuracyMeters: item.recipientSignedAccuracyMeters,
        }
      : null;
    setGeneratedHtml(
      renderDocumentTemplate(template, item.data || {}, {
        referenceNumber: item.referenceNumber,
        generatedAt: item.generatedAt,
        generatedBy: item.generatedBy,
        renderMode: template.isCustom ? 'plain' : 'platform',
        designPreset: item.editorState?.designPreset,
        signature: historySignature,
        watermarkLabel: item.editorState?.watermarkLabel,
        letterheadMode: item.editorState?.letterheadMode,
        letterheadImageDataUrl: item.editorState?.letterheadImageDataUrl,
        letterheadHtml: item.editorState?.letterheadHtml,
        recipientSignature,
        ...getTemplatePageRenderOptions(template),
      })
    );
    setCurrentHistoryEntry(item);
    setActiveTab('generate');
    setEmailData({
      to: item.emailTo || '',
      subject: item.emailSubject || `${item.templateName} - ${item.referenceNumber || ''}`.trim(),
      note: '',
    });
    setSuccessMessage(`Loaded ${item.templateName} from history.`);
    setErrorMessage('');
  };

  const openDocumentLink = (item?: ShareTarget | null) => {
    const relativePath = buildRelativeSharePath(item);
    if (!relativePath) {
      setErrorMessage('This document does not have a generated share link yet.');
      setSuccessMessage('');
      return;
    }
    router.push(relativePath);
  };

  const copyDocumentLink = async (item?: ShareTarget | null) => {
    const absoluteUrl = buildAbsoluteShareUrl(item);
    if (!absoluteUrl) return;
    await navigator.clipboard.writeText(absoluteUrl);
    setSuccessMessage('Document link copied successfully.');
    setErrorMessage('');
  };

  const copySigningPassword = async (password?: string | null) => {
    if (!password) return;
    await navigator.clipboard.writeText(password);
    setSuccessMessage('Signing password copied.');
    setErrorMessage('');
  };

  const shareByWhatsApp = (item: DocumentHistory) => {
    const absoluteUrl = buildAbsoluteShareUrl(item);
    if (!absoluteUrl) return;
    const text = encodeURIComponent(buildShareMessage(item));
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  const openEmailComposer = (entry: DocumentHistory) => {
    setEmailTargetEntry(entry);
    setEmailData((prev) => ({
      to: prev.to || entry.emailTo || '',
      subject: prev.subject || entry.emailSubject || `${entry.templateName} - ${entry.referenceNumber || ''}`.trim(),
      note: prev.note,
    }));
    setEmailDialogOpen(true);
  };

  const nativeShare = async (item: DocumentHistory) => {
    const absoluteUrl = buildAbsoluteShareUrl(item);
    if (!absoluteUrl) return;
    if (navigator.share) {
      await navigator.share({
        title: item.templateName,
        text: buildShareMessage(item),
        url: absoluteUrl,
      });
      return;
    }
    await copyDocumentLink(item);
  };

  const restoreLatestTemplateData = () => {
    if (!latestTemplateHistoryEntry) {
      setErrorMessage('No previously generated document data is available for this template yet.');
      setSuccessMessage('');
      return;
    }

    setFormData(latestTemplateHistoryEntry.data || {});
    setOnboardingContext({
      employeeName: latestTemplateHistoryEntry.employeeName || '',
      employeeEmail: latestTemplateHistoryEntry.employeeEmail || '',
      employeeDepartment: latestTemplateHistoryEntry.employeeDepartment || '',
      employeeDesignation: latestTemplateHistoryEntry.employeeDesignation || '',
      employeeCode: latestTemplateHistoryEntry.employeeCode || '',
    });
    setSelectedDesignPreset(latestTemplateHistoryEntry.editorState?.designPreset || DEFAULT_DOCUMENT_DESIGN_PRESET);
    setDocumentWatermarkLabel(latestTemplateHistoryEntry.editorState?.watermarkLabel || '');
    setSignatureCertificateBrandingEnabled(latestTemplateHistoryEntry.editorState?.signatureCertificateBrandingEnabled !== false);
    setSignatureReceiptCompletionPageEnabled(latestTemplateHistoryEntry.editorState?.signatureReceiptCompletionPageEnabled !== false);
    setDataCollectionEnabled(Boolean(latestTemplateHistoryEntry.dataCollectionEnabled));
    setDataCollectionInstructions(latestTemplateHistoryEntry.dataCollectionInstructions || '');
    setShareAccessPolicy(latestTemplateHistoryEntry.shareAccessPolicy || 'standard');
    setShareExpiryDays(latestTemplateHistoryEntry.shareExpiresAt ? String(Math.max(1, Math.ceil((new Date(latestTemplateHistoryEntry.shareExpiresAt).getTime() - Date.now()) / 86400000))) : '7');
    setMaxAccessCount(String(latestTemplateHistoryEntry.maxAccessCount || 1));
    setGeneratedHtml('');
    setCurrentHistoryEntry(null);
    setAiGeneratedDraft(null);
    setAiDraftInsights(null);
    setSuccessMessage(`Loaded the latest saved values from ${latestTemplateHistoryEntry.referenceNumber}.`);
    setErrorMessage('');
  };

  const clearDraft = () => {
    if (selectedTemplate && typeof window !== 'undefined') {
      window.localStorage.removeItem(`${DRAFT_STORAGE_PREFIX}${selectedTemplate.id}`);
    }
    setFormData({});
    setGeneratedHtml('');
    setCurrentHistoryEntry(null);
    setAiGeneratedDraft(null);
    setAiDraftInsights(null);
    setDraftRestored(false);
    setDocumentWatermarkLabel('');
    setSignatureCertificateBrandingEnabled(true);
    setSignatureReceiptCompletionPageEnabled(true);
    setSuccessMessage('Draft cleared for this template.');
    setErrorMessage('');
  };

  const renderField = (field: DocumentField) => {
    const value = formData[field.name] || '';
    switch (field.type) {
      case 'textarea':
        return (
          <RichTextEditor
            value={value}
            onChange={(nextValue) => setFormData((prev) => ({ ...prev, [field.name]: nextValue }))}
            placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
          />
        );
      case 'select':
        return (
          <Select value={value} onValueChange={(nextValue) => setFormData((prev) => ({ ...prev, [field.name]: nextValue }))}>
            <SelectTrigger><SelectValue placeholder={field.placeholder || `Select ${field.label.toLowerCase()}`} /></SelectTrigger>
            <SelectContent>
              {field.options?.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      default:
        return <Input type={field.type} value={value} onChange={(event) => setFormData((prev) => ({ ...prev, [field.name]: event.target.value }))} placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`} required={field.required} />;
    }
  };

  const submitFeedbackReply = async (item: DashboardMetrics['recentFeedback'][number]) => {
    const replyMessage = replyDrafts[item.id]?.trim();
    if (!replyMessage) return;

    try {
      setReplyingCommentId(item.id);
      const shareId = item.shareUrl?.split('/').pop() || item.documentId;
      const response = await fetch(`/api/public/documents/${shareId}/comments`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commentId: item.id,
          replyMessage,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to save reply');
      }
      setReplyDrafts((prev) => ({ ...prev, [item.id]: '' }));
      setSuccessMessage('Reply added successfully.');
      setErrorMessage('');
      await Promise.all([fetchHistory(), fetchDashboard()]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save reply');
      setSuccessMessage('');
    } finally {
      setReplyingCommentId('');
    }
  };

  if (status === 'loading') {
    return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div></div>;
  }
  if (status === 'unauthenticated') return null;

  const setupChecklist = clientBusinessSettings?.workspaceSetupChecklist;
  const setupChecklistItems = [
    { key: 'profileConfigured', label: 'Complete business profile', tab: 'business-settings' },
    { key: 'brandingConfigured', label: 'Configure branding and letterhead', tab: 'business-settings' },
    { key: 'starterTemplatesReady', label: 'Review starter templates', tab: 'business-settings' },
    { key: 'signaturesReady', label: 'Add at least one signature', tab: 'business-settings' },
    { key: 'firstDocumentGenerated', label: 'Generate your first document', tab: 'generate' },
  ] as const;
  const setupCompletion = setupChecklist ? Math.round((setupChecklistItems.filter((item) => Boolean(setupChecklist[item.key])).length / setupChecklistItems.length) * 100) : 0;

  if (isBoardRoomOnlyUser) {
    return (
      <div className="premium-shell min-h-screen overflow-x-hidden">
        <header className="sticky top-0 z-30 border-b border-white/60 bg-white/80 backdrop-blur-2xl shadow-[0_18px_40px_rgba(148,163,184,0.12)]">
          <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
            <div className="min-w-0">
              <Link href="/workspace" className="inline-flex items-center">
                <DocrudLogo height={36} priority />
              </Link>
              <p className="mt-3 text-lg font-semibold text-slate-950">Board Room Access</p>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                This login is restricted to Board Room participation only. Open your invited rooms, review assigned work, and act inside the governed room workflow.
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="text-right">
                <p className="truncate text-sm font-semibold text-slate-900">{session?.user?.name}</p>
                <p className="truncate text-xs text-slate-500">Restricted board room user</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => signOut()}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1240px] px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-[1.5rem] border border-white/70 bg-white/82 p-5 shadow-[0_18px_40px_rgba(148,163,184,0.12)] backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Access scope</p>
              <p className="mt-3 text-lg font-semibold text-slate-950">Board Room only</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">No other workspace modules are available on this login.</p>
            </div>
            <div className="rounded-[1.5rem] border border-white/70 bg-white/82 p-5 shadow-[0_18px_40px_rgba(148,163,184,0.12)] backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">What you can do</p>
              <p className="mt-3 text-lg font-semibold text-slate-950">Review, update, and collaborate</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">Open assigned rooms, manage permitted tasks, and participate in controlled approvals.</p>
            </div>
            <div className="rounded-[1.5rem] border border-white/70 bg-white/82 p-5 shadow-[0_18px_40px_rgba(148,163,184,0.12)] backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Invite flow</p>
              <p className="mt-3 text-lg font-semibold text-slate-950">Creator-managed access</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">Room visibility, permissions, and stage control remain with the board room creator.</p>
            </div>
          </div>

          <DealRoomCenter />
        </main>
      </div>
    );
  }

	  return (
	    <div className="premium-shell min-h-screen overflow-x-hidden pb-24 md:pb-0">
        <Dialog open={upgradePrompt.open} onOpenChange={(open) => setUpgradePrompt((prev) => ({ ...prev, open }))}>
          <DialogContent className="rounded-[1.8rem] border border-white/60 bg-white/90 shadow-[0_30px_90px_rgba(15,23,42,0.18)] backdrop-blur-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl tracking-tight text-slate-950">Upgrade required</DialogTitle>
              <DialogDescription className="text-slate-600">{upgradePrompt.title}</DialogDescription>
            </DialogHeader>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2">
                  <LockKeyhole className="h-4 w-4 text-slate-600" />
                  Locked on current pass
                </span>
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Upgrade anytime</span>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                className="h-11 rounded-2xl border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => setUpgradePrompt((prev) => ({ ...prev, open: false }))}
              >
                Not now
              </Button>
              <Button asChild className="h-11 rounded-2xl bg-slate-950 px-6 text-sm font-semibold text-white hover:bg-slate-800">
                <Link href={`/pricing?tab=${upgradePrompt.pricingTab}`}>
                  View plans
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

	      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/70 backdrop-blur-2xl shadow-[0_18px_40px_rgba(148,163,184,0.12)]">
		        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
	          <div className="flex h-16 items-center justify-between gap-3">
	            <div className="flex min-w-0 items-center gap-3">
	              <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Open menu">
	                <Menu className="h-6 w-6" />
	              </Button>
	              <Button
	                variant="outline"
	                size="icon"
	                className="hidden rounded-xl md:inline-flex"
	                onClick={() => setSidebarHidden((prev) => !prev)}
	                aria-label={sidebarHidden ? 'Expand sidebar' : 'Collapse sidebar'}
	              >
	                {sidebarHidden ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
	              </Button>
	              <Link href="/workspace" className="inline-flex items-center">
	                <DocrudLogo height={34} priority />
	              </Link>
		              {/* Profile avatar with Docrud Go ring */}
              <Link href="/profile" className="relative hidden md:flex shrink-0" title={profileOverview?.docrudGo ? 'Docrud Infinity ∞ — My Profile' : 'My Profile'}>
                {profileOverview?.docrudGo && (
                  <>
                    <div className="absolute inset-[-2.5px] rounded-full" style={{ background: 'conic-gradient(from 0deg,#4f46e5 0%,#818cf8 25%,#a5b4fc 50%,#818cf8 75%,#4f46e5 100%)', animation: 'goRingSpin 4s linear infinite' }} />
                    <div className="absolute inset-[-2.5px] rounded-full opacity-50" style={{ background: 'conic-gradient(from 0deg,#4f46e5,#818cf8,#4f46e5)', filter: 'blur(5px)' }} />
                  </>
                )}
                <div
                  className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full overflow-hidden ${profileOverview?.docrudGo ? 'bg-[#0f0e2e]' : 'bg-slate-100 border border-slate-200'}`}
                  style={profileOverview?.docrudGo ? { boxShadow: '0 0 0 2px white, 0 2px 12px rgba(99,102,241,0.35)' } : undefined}
                >
                  {profileOverview?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profileOverview.avatarUrl} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                    <span className={`text-[11px] font-bold leading-none select-none ${profileOverview?.docrudGo ? 'text-[#a5b4fc]' : 'text-slate-600'}`}>
                      {(session?.user?.name || 'W').charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                {profileOverview?.docrudGo && (
                  <span className="absolute -bottom-0.5 -right-0.5 z-20 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-black" style={{ background: 'linear-gradient(135deg,#4f46e5,#818cf8)', color: '#fff', boxShadow: '0 0 0 1.5px white' }}>∞</span>
                )}
              </Link>
              <div className="hidden min-w-0 md:block">
		                <p className="truncate text-sm font-semibold tracking-[-0.02em] text-slate-950">{session?.user?.name || 'Workspace'}</p>
		                <p className="truncate text-[11px] text-slate-500">{profileOverview?.subscription.planName || session?.user?.subscription?.planName || 'Workspace'}</p>
		              </div>
		            </div>

		            <GlobalSearchBar
		              ref={globalSearchBarRef}
		              getLocalResults={getLocalSearchResults}
		              mobileShortcuts={mobileSearchShortcuts}
		            />

		            <div className="flex items-center gap-2 shrink-0">
		              <Button
		                variant="outline"
		                size="icon"
		                className="rounded-xl md:hidden"
		                onClick={() => {
		                  setDashboardUsageOpen(false);
		                  setNotificationOpen(false);
		                  globalSearchBarRef.current?.openMobile();
		                }}
		                aria-label="Search"
		              >
		                <Search className="h-4 w-4" />
		              </Button>
		              <div className="relative" data-dashboard-usage-root>
		                <button
		                  type="button"
	                  onClick={() => {
	                    setNotificationOpen(false);
	                    setDashboardUsageOpen((prev) => {
	                      const next = !prev;
	                      try {
	                        window.localStorage.setItem('docrud-dashboard-usage-open', next ? '1' : '0');
	                      } catch {
	                        // ignore
	                      }
	                      return next;
	                    });
	                  }}
		                  className="hidden rounded-full border border-white/70 bg-white/80 px-3 py-2 text-left shadow-[0_14px_30px_rgba(148,163,184,0.10)] backdrop-blur-xl transition hover:bg-white/90 sm:inline-flex"
		                  aria-label={dashboardUsageOpen ? 'Hide plan usage' : 'Show plan usage'}
		                >
		                  <span className="flex items-center gap-2 whitespace-nowrap">
		                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Usage</span>
		                    <span className="text-sm font-semibold tabular-nums tracking-tight text-slate-950">{profileOverview ? `${profileOverview.threshold.percentUsed}%` : '0%'}</span>
		                    <ChevronDown className={`h-4 w-4 text-slate-500 transition ${dashboardUsageOpen ? 'rotate-180' : ''}`} />
		                  </span>
		                </button>
		                <Button variant="outline" size="icon" className="rounded-xl sm:hidden" onClick={() => { setNotificationOpen(false); setDashboardUsageOpen((prev) => !prev); }} aria-label="Usage">
		                  <BarChart3 className="h-4 w-4" />
		                </Button>

	                {dashboardUsageOpen ? (
	                  <>
		                    <button type="button" aria-label="Close usage" className="fixed inset-0 z-40 bg-slate-950/20 backdrop-blur-[1px] md:hidden" onClick={() => setDashboardUsageOpen(false)} />
		                    <div className="navbar-glass fixed inset-x-3 bottom-[84px] z-50 max-h-[70vh] overflow-auto rounded-[1.5rem] p-3 md:absolute md:inset-auto md:right-0 md:top-full md:mt-3 md:w-[min(92vw,560px)]">
		                      <div className="flex items-start justify-between gap-3 px-2 pb-3">
		                        <div>
		                          <p className="text-sm font-semibold text-slate-950">Plan usage</p>
		                          <p className="text-xs text-slate-500">Capacity, runway, AI credits, and secure links</p>
		                        </div>
	                        <Button type="button" size="icon" variant="ghost" className="rounded-xl md:hidden" onClick={() => setDashboardUsageOpen(false)}>
	                          <X className="h-4 w-4" />
	                        </Button>
	                      </div>
	                      <div className="grid gap-2 sm:grid-cols-2">
	                        {([
		                          {
		                            id: 'plan',
		                            title: 'Plan usage',
		                            value: profileOverview ? `${profileOverview.threshold.percentUsed}% used` : 'Usage',
		                            detail: profileOverview?.threshold.state?.replace(/_/g, ' ') || 'healthy',
		                            percent: profileOverview?.threshold.percentUsed ?? null,
		                            state: profileOverview?.threshold.state ?? null,
		                            onClick: () => attemptOpenTab('profile', 'Profile'),
		                          },
		                          {
		                            id: 'remaining',
		                            title: 'Docs left',
		                            value: profileOverview ? String(profileOverview.usage.remainingGenerations) : '0',
		                            detail: profileOverview?.usage.projectedExhaustionLabel || 'Capacity available',
		                            onClick: () => attemptOpenTab('profile', 'Profile'),
		                          },
		                          {
		                            id: 'ai',
		                            title: 'AI credits',
		                            value: profileOverview ? String(profileOverview.subscription.remainingAiCredits || 0) : '0',
		                            detail: profileOverview ? `${profileOverview.subscription.remainingAiTrialRuns || 0} free tries` : 'AI access',
		                            onClick: () => attemptOpenTab('billing', 'Billing'),
		                          },
		                          {
		                            id: 'transfers',
		                            title: 'Secure links',
		                            value: profileOverview ? String(profileOverview.usage.activeFileTransfers) : '0',
		                            detail: profileOverview ? `${profileOverview.usage.totalFileTransfers} total` : 'File transfers',
		                            onClick: () => attemptOpenTab('file-transfers', 'File Transfers'),
		                          },
		                          {
		                            id: 'month',
		                            title: 'This month',
		                            value: profileOverview ? String(profileOverview.usage.documentsThisMonth) : '0',
		                            detail: profileOverview ? `${profileOverview.usage.averageDocumentsPerWeek} / week` : 'Docs',
		                            onClick: () => attemptOpenTab('dashboard', 'Dashboard'),
		                          },
	                        ] as Array<{ id: string; title: string; value: string; detail: string; percent?: number | null; state?: string | null; onClick: () => void }>).map((pill) => (
	                          <button
	                            key={pill.id}
	                            type="button"
	                            onClick={() => { pill.onClick(); setDashboardUsageOpen(false); }}
	                            className="rounded-2xl border border-white/70 bg-white/80 px-3 py-3 text-left shadow-[0_14px_30px_rgba(148,163,184,0.10)] backdrop-blur-xl transition hover:bg-white/90"
	                          >
	                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{pill.title}</p>
	                            <p className="mt-1 text-sm font-semibold tracking-tight text-slate-950">{pill.value}</p>
	                            {typeof pill.percent === 'number' ? (
	                              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70">
	                                <div
	                                  className={`h-1.5 rounded-full ${
	                                    pill.state === 'healthy'
	                                      ? 'bg-emerald-500'
	                                      : pill.state === 'watch'
	                                        ? 'bg-amber-500'
	                                        : pill.state === 'critical'
	                                          ? 'bg-rose-500'
	                                          : 'bg-slate-950'
	                                  }`}
	                                  style={{ width: `${Math.max(0, Math.min(100, pill.percent))}%` }}
	                                />
	                              </div>
	                            ) : null}
	                            <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{pill.detail}</p>
	                          </button>
	                        ))}
	                      </div>
	                    </div>
	                  </>
	                ) : null}
	              </div>

		              <Button
		                variant="outline"
		                size="icon"
		                className="hidden sm:inline-flex rounded-xl relative group"
		                onClick={() => attemptOpenTab('scratchpad')}
		                aria-label="Open Scratchpad"
		                title="Scratchpad"
		              >
		                <PenLine className="h-4 w-4" />
		                <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-semibold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-50">
		                  Scratchpad
		                </span>
		              </Button>

		              <div className="relative shrink-0">
		                {/* Bell button */}
		                <Button variant="outline" size="icon" className="relative rounded-xl" onClick={() => { setDashboardUsageOpen(false); setNotificationOpen((prev) => !prev); }} aria-label="Notifications">
		                  <Bell className="h-4 w-4" />
		                  {unreadNotificationsCount > 0 ? (
		                    <span className="absolute -right-1.5 -top-1.5 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border border-white/70 bg-slate-950/90 px-1 text-[10px] font-semibold text-white shadow-[0_10px_22px_rgba(15,23,42,0.22)] backdrop-blur">
		                      {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
		                    </span>
		                  ) : null}
		                </Button>

		                {/* ── DESKTOP: dropdown (unchanged behavior) ─────────────────── */}
		                {notificationOpen ? (
		                  <>
		                    <button type="button" aria-label="Close notification center" className="hidden md:block fixed inset-0 z-40" onClick={() => setNotificationOpen(false)} />
		                    <div className="navbar-glass hidden md:flex flex-col absolute right-0 top-full mt-3 z-50 w-[min(92vw,380px)] max-h-[560px] rounded-[1.5rem] p-3">
		                      <div className="flex items-center justify-between gap-3 px-2 pb-3">
		                        <div>
		                          <p className="text-sm font-semibold text-slate-950">Notification Center</p>
		                          <p className="text-xs text-slate-500">Mailbox, feedback, billing, and workspace alerts</p>
		                        </div>
		                        <div className="flex items-center gap-2">
		                          {unreadNotificationsCount > 0 ? (
		                            <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => void markNotificationsRead(mergedNotifications.filter((entry) => !entry.read).map((entry) => entry.id))}>
		                              Mark all read
		                            </Button>
		                          ) : null}
		                        </div>
		                      </div>
		                      <div className="flex-1 space-y-2 overflow-auto pr-1 max-h-[420px]">
		                        {notificationsLoading ? (
		                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">Loading notifications...</div>
		                        ) : recentNotifications.length > 0 ? recentNotifications.map((item) => (
		                          <button
		                            key={item.id}
		                            type="button"
		                            onClick={() => {
		                              void markNotificationsRead(item.read ? [] : [item.id]);
		                              if (item.href?.startsWith('tab:')) {
		                                const tab = item.href.slice(4);
		                                if (tab) setActiveTab(tab);
		                              } else if (item.href?.includes('internal-mailbox')) {
		                                setActiveTab('internal-mailbox');
		                              } else if (item.href?.includes('billing')) {
		                                setActiveTab('billing');
		                              } else if (item.href?.includes('profile')) {
		                                setActiveTab('profile');
		                              } else if (item.href?.includes('summary')) {
		                                setActiveTab('summary');
		                              } else if (item.href?.includes('history')) {
		                                setActiveTab('history');
		                              } else {
		                                setActiveTab('dashboard');
		                              }
		                              setNotificationOpen(false);
		                            }}
		                            className={`w-full rounded-2xl border px-4 py-3 text-left transition ${item.read ? 'border-slate-200 bg-white text-slate-700' : 'border-sky-200 bg-sky-50 text-slate-800'}`}
		                          >
		                            <div className="flex items-start justify-between gap-3">
		                              <div className="min-w-0">
		                                <p className="text-sm font-semibold text-slate-950">{item.title}</p>
		                                <p className="mt-1 text-xs leading-5 text-slate-600">{item.body}</p>
		                              </div>
		                              {!item.read ? <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-sky-500" /> : null}
		                            </div>
		                            <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">{new Date(item.createdAt).toLocaleString()}</p>
		                          </button>
		                        )) : (
		                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">No recent notifications.</div>
		                        )}
		                      </div>
		                    </div>
		                  </>
		                ) : null}
		              </div>

		              {/* ── MOBILE: bottom drawer (always mounted, CSS-animated) ──── */}
		              <>
		                {/* Scrim overlay */}
		                <div
		                  className={`fixed inset-0 z-40 md:hidden transition-all duration-300 ${notificationOpen ? 'bg-slate-950/50 backdrop-blur-[3px] pointer-events-auto' : 'bg-transparent backdrop-blur-none pointer-events-none'}`}
		                  onClick={() => setNotificationOpen(false)}
		                  aria-hidden
		                />
		                {/* Drawer panel */}
		                <div
		                  className={`fixed inset-x-0 bottom-0 z-50 flex flex-col md:hidden rounded-t-[32px] bg-white/[0.97] backdrop-blur-3xl border-t border-white/70 shadow-[0_-32px_80px_rgba(15,23,42,0.18),0_-1px_0_rgba(255,255,255,0.8)] transition-transform [transition-duration:340ms] [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] ${notificationOpen ? 'translate-y-0' : 'translate-y-full'}`}
		                  style={{ maxHeight: '88svh', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
		                >
		                  {/* Drag handle */}
		                  <div className="flex justify-center pt-3 pb-1">
		                    <div className="w-10 h-1 rounded-full bg-slate-300" />
		                  </div>

		                  {/* Header */}
		                  <div className="flex items-center justify-between gap-3 px-5 pt-2 pb-4 border-b border-slate-100">
		                    <div>
		                      <p className="text-base font-bold tracking-tight text-slate-950">Notifications</p>
		                      <p className="text-xs text-slate-500 mt-0.5">Mailbox, billing &amp; workspace alerts</p>
		                    </div>
		                    <div className="flex items-center gap-2">
		                      {unreadNotificationsCount > 0 ? (
		                        <Button
		                          type="button"
		                          size="sm"
		                          variant="outline"
		                          className="rounded-xl text-xs h-8"
		                          onClick={() => void markNotificationsRead(mergedNotifications.filter((entry) => !entry.read).map((entry) => entry.id))}
		                        >
		                          Mark all read
		                        </Button>
		                      ) : null}
		                      <Button type="button" size="icon" variant="ghost" className="rounded-xl h-9 w-9" onClick={() => setNotificationOpen(false)}>
		                        <X className="h-4 w-4" />
		                      </Button>
		                    </div>
		                  </div>

		                  {/* Scrollable content */}
		                  <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3 space-y-2">
		                    {notificationsLoading ? (
		                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 text-center">Loading notifications...</div>
		                    ) : recentNotifications.length > 0 ? recentNotifications.map((item) => (
		                      <button
		                        key={item.id}
		                        type="button"
		                        onClick={() => {
		                          void markNotificationsRead(item.read ? [] : [item.id]);
		                          if (item.href?.startsWith('tab:')) {
		                            const tab = item.href.slice(4);
		                            if (tab) setActiveTab(tab);
		                          } else if (item.href?.includes('internal-mailbox')) {
		                            setActiveTab('internal-mailbox');
		                          } else if (item.href?.includes('billing')) {
		                            setActiveTab('billing');
		                          } else if (item.href?.includes('profile')) {
		                            setActiveTab('profile');
		                          } else if (item.href?.includes('summary')) {
		                            setActiveTab('summary');
		                          } else if (item.href?.includes('history')) {
		                            setActiveTab('history');
		                          } else {
		                            setActiveTab('dashboard');
		                          }
		                          setNotificationOpen(false);
		                        }}
		                        className={`w-full rounded-2xl border px-4 py-3.5 text-left transition-all active:scale-[0.98] ${item.read ? 'border-slate-200 bg-white text-slate-700' : 'border-sky-200 bg-sky-50/80 text-slate-800'}`}
		                      >
		                        <div className="flex items-start justify-between gap-3">
		                          <div className="min-w-0">
		                            <p className="text-sm font-semibold text-slate-950 leading-snug">{item.title}</p>
		                            <p className="mt-1 text-xs leading-5 text-slate-600">{item.body}</p>
		                          </div>
		                          {!item.read ? <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-sky-500" /> : null}
		                        </div>
		                        <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">{new Date(item.createdAt).toLocaleString()}</p>
		                      </button>
		                    )) : (
		                      <div className="flex flex-col items-center justify-center py-12 text-center">
		                        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
		                          <Bell className="h-5 w-5 text-slate-400" />
		                        </div>
		                        <p className="text-sm font-medium text-slate-600">All caught up</p>
		                        <p className="text-xs text-slate-400 mt-1">No recent notifications</p>
		                      </div>
		                    )}
		                  </div>
		                </div>
		              </>

	              <Button variant="outline" size="icon" className="rounded-xl" onClick={() => signOut()} aria-label="Logout">
	                <LogOut className="h-4 w-4" />
	              </Button>
	            </div>
		          </div>
		        </div>
		      </header>


	      <div className="mx-auto flex max-w-[1600px] gap-0 px-0 md:px-4 lg:px-6">
	        <aside
	          className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-50 flex flex-col w-[88vw] max-w-72 border-r border-white/60 bg-gradient-to-b from-white/80 via-white/65 to-white/55 shadow-[18px_18px_42px_rgba(148,163,184,0.16),-8px_-8px_24px_rgba(255,255,255,0.82)] backdrop-blur-3xl transform transition-transform duration-300 ease-in-out md:sticky md:top-[96px] md:self-start md:translate-x-0 md:rounded-[28px] md:border md:shadow-[18px_18px_42px_rgba(148,163,184,0.12),-8px_-8px_24px_rgba(255,255,255,0.72)] ${
	            sidebarHidden ? 'md:w-20 md:max-w-none' : 'md:w-[340px] md:max-w-[340px]'
	          }`}
	        >
          <div className="flex-none flex items-center justify-between p-4 border-b md:hidden">
            <h2 className="text-lg font-semibold">Menu</h2>
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}><X className="h-6 w-6" /></Button>
          </div>

          <nav className="flex-1 min-h-0 overflow-y-auto touch-scroll p-4 space-y-6 pb-8 md:h-auto md:overflow-visible md:overscroll-auto">
            {/* Mobile always uses the full nav with labels. */}
	            <div className="space-y-6 md:hidden">
	            <div className="space-y-3">
	              {sidebarGroups.map((group) => {
	                const expanded = expandedNavGroups.includes(group.id);
	                const tone = getNavGroupTone(group.id);
	                return (
	                  <div
	                    key={group.id}
	                    className={`relative overflow-hidden rounded-[26px] border border-white/75 bg-white/76 p-2 shadow-[12px_12px_30px_rgba(148,163,184,0.10),-6px_-6px_18px_rgba(255,255,255,0.82)] backdrop-blur-xl ${tone.ring} ${tone.headerGlow}`}
	                  >
	                    <button
	                      type="button"
	                      onClick={() => setExpandedNavGroups((prev) => expanded ? prev.filter((entry) => entry !== group.id) : [...prev, group.id])}
	                      className="flex w-full items-center justify-between rounded-[20px] px-3 py-3 text-left"
	                    >
	                      <div className="flex items-center gap-2">
	                        <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
	                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{group.label}</p>
	                      </div>
	                      <div className="flex items-center gap-2">
	                        {group.badge && <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${tone.badge}`}>{group.badge}</span>}
	                        {expanded ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
	                      </div>
	                    </button>
	                    {expanded && (
	                      <div className="mt-2 space-y-1">
		                        {group.items.map((item) => {
		                          const active = activeTab === item.id;
                              const locked = isTabLocked(item.id);
		                          return (
		                            <button
		                              key={item.id}
		                              type="button"
		                              onClick={() => {
		                                attemptOpenTab(item.id, item.label);
		                                setSidebarOpen(false);
		                              }}
		                              className={`relative w-full rounded-[20px] px-3 py-3 text-left transition ${
                                    locked
                                      ? 'cursor-not-allowed text-slate-500 opacity-70'
                                      : active
                                        ? `bg-slate-950 text-white shadow-[0_18px_35px_rgba(15,23,42,0.18)] ${tone.activeStripe}`
                                        : 'text-slate-700 hover:bg-white/70'
                                  }`}
		                            >
		                              <div className="flex items-center gap-3">
		                                <div className={`rounded-xl p-2 ${active ? 'bg-white/10' : `${tone.iconBg} shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]`}`}>
		                                  <item.icon className={`h-4 w-4 ${active ? 'text-white' : locked ? 'text-slate-400' : tone.iconFg}`} />
		                                </div>
	                                <div className="min-w-0 flex-1">
	                                  <div className="flex items-center gap-2 overflow-hidden">
		                                    <p className={`truncate whitespace-nowrap text-[13px] font-semibold tracking-tight ${active ? 'text-white' : 'text-slate-900'}`}>{item.label}</p>
		                                    <InfoHint label={item.description} />
	                                  </div>
	                                </div>
                                  {locked ? <LockKeyhole className="h-4 w-4 text-slate-400" /> : null}
		                              </div>
		                            </button>
		                          );
		                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {!isEmployee && (!isClient || hasClientFeature('generate_documents')) && (
            <div>
              <h3 className="text-sm font-medium text-slate-900 mb-3">Available Templates</h3>
              <div className="space-y-2">
                {allowedTemplates.map((template) => (
                  <button key={template.id} onClick={() => handleTemplateSelect(template)} className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${selectedTemplate?.id === template.id ? 'bg-blue-100 text-blue-900' : 'text-slate-700 hover:bg-slate-100'}`}>
                    <div className="font-medium">{template.name}</div>
                    <div className="text-xs text-slate-500">{template.category}</div>
                  </button>
                ))}
                {allowedTemplates.length === 0 && (
                  <p className="text-sm text-slate-500">No templates available for this account yet.</p>
                )}
              </div>
            </div>
            )}
            </div>

            {/* Desktop supports collapsed (icon-only) and expanded modes. */}
            <div className="hidden md:block">
              {sidebarHidden ? (
                <div className="flex flex-col items-center gap-2">
	                  <button
	                    type="button"
	                    title="Dashboard"
	                    onClick={() => attemptOpenTab('dashboard', 'Dashboard')}
	                    className="group relative flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(14,165,233,0.98),rgba(59,130,246,0.94))] text-white shadow-[0_18px_40px_rgba(2,132,199,0.20)] transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/80"
	                  >
                    <RailHoverBadge label="Dashboard" />
                    <LayoutDashboard className="h-5 w-5" />
                    <span className="sr-only">Dashboard</span>
                  </button>
	                  <button
	                    type="button"
	                    title="Create"
	                    onClick={() => attemptOpenTab('generate', 'E-sign Documents')}
	                    className="group relative flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/70"
	                  >
                    <RailHoverBadge label="E-sign Documents" />
                    <FileSignature className="h-5 w-5" />
                    <span className="sr-only">Create</span>
                  </button>

	                  <div className="mt-2 flex w-full flex-col items-center gap-2">
	                    {mobileActionCandidates.filter((item) => item.id !== 'dashboard').slice(0, 12).map((item) => {
	                      const active = activeTab === item.id;
	                      const tone = navToneByTabId[item.id] ?? getNavGroupTone('default');
                        const locked = isTabLocked(item.id);
	                      return (
	                        <button
	                        key={`rail-${item.id}`}
	                        type="button"
	                        title={item.label}
	                        onClick={() => attemptOpenTab(item.id, item.label)}
	                        className={`group relative flex h-12 w-12 items-center justify-center rounded-2xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
	                          active
	                            ? 'border-slate-950 bg-slate-950 text-white shadow-[0_18px_35px_rgba(15,23,42,0.18)]'
	                            : locked
                                ? 'cursor-not-allowed border-white/70 bg-white/55 text-slate-500 opacity-70'
	                              : 'border-white/70 bg-white/70 text-slate-800 shadow-[0_14px_30px_rgba(148,163,184,0.10)] hover:bg-white/85'
	                        }`}
	                      >
	                        <RailHoverBadge label={item.label} />
	                        <item.icon className={`h-5 w-5 ${active ? 'text-white' : locked ? 'text-slate-400' : tone.iconFg}`} />
	                        <span className="sr-only">{item.label}</span>
	                      </button>
	                    );
	                  })}
                </div>
                </div>
              ) : (
                <>
	                  <div className="space-y-3">
	                    {sidebarGroups.map((group) => {
	                      const expanded = expandedNavGroups.includes(group.id);
	                      const tone = getNavGroupTone(group.id);
	                      return (
	                        <div
	                          key={group.id}
	                          className={`relative overflow-hidden rounded-[26px] border border-white/75 bg-white/76 p-2 shadow-[12px_12px_30px_rgba(148,163,184,0.10),-6px_-6px_18px_rgba(255,255,255,0.82)] backdrop-blur-xl ${tone.ring} ${tone.headerGlow}`}
	                        >
	                          <button
	                            type="button"
	                            onClick={() => setExpandedNavGroups((prev) => expanded ? prev.filter((entry) => entry !== group.id) : [...prev, group.id])}
	                            className="flex w-full items-center justify-between rounded-[20px] px-3 py-3 text-left"
	                          >
	                            <div className="flex items-center gap-2">
	                              <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
	                              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{group.label}</p>
	                            </div>
	                            <div className="flex items-center gap-2">
	                              {group.badge && <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${tone.badge}`}>{group.badge}</span>}
	                              {expanded ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
	                            </div>
	                          </button>
	                          {expanded && (
	                            <div className="mt-2 space-y-1">
		                              {group.items.map((item) => {
		                                const active = activeTab === item.id;
                                    const locked = isTabLocked(item.id);
		                                return (
		                                  <button
		                                    key={item.id}
		                                    type="button"
		                                    onClick={() => {
		                                      attemptOpenTab(item.id, item.label);
		                                      setSidebarOpen(false);
		                                    }}
		                                    className={`relative w-full rounded-[20px] px-3 py-3 text-left transition ${
                                          locked
                                            ? 'cursor-not-allowed text-slate-500 opacity-70'
                                            : active
                                              ? `bg-slate-950 text-white shadow-[0_18px_35px_rgba(15,23,42,0.18)] ${tone.activeStripe}`
                                              : 'text-slate-700 hover:bg-white/70'
                                        }`}
		                                  >
		                                    <div className="flex items-center gap-3">
		                                      <div className={`rounded-xl p-2 ${active ? 'bg-white/10' : `${tone.iconBg} shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]`}`}>
		                                        <item.icon className={`h-4 w-4 ${active ? 'text-white' : locked ? 'text-slate-400' : tone.iconFg}`} />
		                                      </div>
	                                      <div className="min-w-0 flex-1">
	                                        <div className="flex items-center gap-2 overflow-hidden">
		                                          <p className={`truncate whitespace-nowrap text-[13px] font-semibold tracking-tight ${active ? 'text-white' : 'text-slate-900'}`}>{item.label}</p>
		                                          <InfoHint label={item.description} />
	                                        </div>
	                                      </div>
                                        {locked ? <LockKeyhole className="h-4 w-4 text-slate-400" /> : null}
		                                    </div>
		                                  </button>
		                                );
		                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {!isEmployee && (!isClient || hasClientFeature('generate_documents')) && (
                    <div>
                      <h3 className="text-sm font-medium text-slate-900 mb-3">Available Templates</h3>
                      <div className="space-y-2">
                        {allowedTemplates.map((template) => (
                          <button key={template.id} onClick={() => handleTemplateSelect(template)} className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${selectedTemplate?.id === template.id ? 'bg-blue-100 text-blue-900' : 'text-slate-700 hover:bg-slate-100'}`}>
                            <div className="font-medium">{template.name}</div>
                            <div className="text-xs text-slate-500">{template.category}</div>
                          </button>
                        ))}
                        {allowedTemplates.length === 0 && (
                          <p className="text-sm text-slate-500">No templates available for this account yet.</p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </nav>
        </aside>

		        <main className="min-w-0 flex-1 p-3 pb-24 md:p-6 md:pb-6">
		          <Tabs value={activeTab} onValueChange={(next) => attemptOpenTab(next)}>
	            <TabsContent value="dashboard" className="space-y-6">
              <section className="relative overflow-hidden rounded-[2rem] border border-white/60 p-5 shadow-[0_22px_60px_rgba(148,163,184,0.18)] sm:p-7">
                <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(16,185,252,0.22),rgba(139,92,246,0.14),rgba(59,130,246,0.12),rgba(255,255,255,0.64))]" />
                <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-sky-400/25 blur-3xl" />
                <div className="absolute -right-28 -top-24 h-80 w-80 rounded-full bg-violet-500/20 blur-3xl" />
                <div className="absolute -bottom-28 left-1/3 h-80 w-80 rounded-full bg-blue-500/15 blur-3xl" />

                <div className="relative">
                  <h1 className="mt-1 text-center text-[1.55rem] font-semibold tracking-[-0.05em] text-slate-950 sm:mt-2 sm:text-[2.1rem]">
                    What will you ship today?
                  </h1>

                  <div className="mx-auto mt-5 w-full max-w-3xl">
                    <div className="relative">
                      <FileSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        value={dashboardSearch}
                        onChange={(event) => setDashboardSearch(event.target.value)}
                        placeholder="Search docs, shares, people, and workstreams"
                        className="h-12 w-full rounded-full border border-white/70 bg-white/75 pl-11 pr-4 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_18px_44px_rgba(148,163,184,0.12)] outline-none backdrop-blur-2xl transition focus:border-slate-300"
                      />
                    </div>

                    {dashboardSearch.trim() && searchResults.length > 0 ? (
                      <div className="mt-3 overflow-hidden rounded-[1.35rem] border border-white/65 bg-white/70 shadow-[0_18px_44px_rgba(148,163,184,0.12)] backdrop-blur-2xl">
                        {searchResults.map((item) => (
                          <button
                            key={item.id}
                            type="button"
	                            onClick={() => {
	                              const match = standardHistory.find((entry) => entry.id === item.id);
	                              if (match) {
	                                openDocumentLink(match);
	                                return;
	                              }
	                              attemptOpenTab('summary', 'Summary');
	                            }}
                            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-white/70"
                          >
                            <span className="min-w-0 truncate font-semibold text-slate-950">{item.templateName}</span>
                            <span className="shrink-0 text-[11px] font-medium text-slate-500">{item.latestActivityLabel || 'Open'}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-7 flex items-start justify-center">
                    <div className="flex w-full max-w-[1200px] gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
	                      {dashboardShipTools.map((tool) => (
                        (() => {
                          const locked = isTabLocked(tool.tab);
                          return (
	                        <button
	                          key={`ship-${tool.id}`}
	                          type="button"
	                          onClick={() => attemptOpenTab(tool.tab, tool.label)}
	                          className={`group w-[94px] shrink-0 text-center ${locked ? 'opacity-60' : ''}`}
	                        >
	                          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/60 bg-white/70 shadow-[0_14px_34px_rgba(148,163,184,0.14)] backdrop-blur-xl transition group-hover:-translate-y-0.5 group-hover:bg-white/85">
	                            {locked ? <LockKeyhole className="h-5 w-5 text-slate-500" /> : <tool.icon className="h-5 w-5 text-slate-800" />}
	                          </div>
	                          <p className="mt-2 truncate text-[11px] font-semibold tracking-tight text-slate-700">{tool.label}</p>
	                        </button>
                          );
                        })()
	                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-end justify-between gap-3">
                  <h2 className="text-sm font-semibold tracking-[-0.02em] text-slate-950">See what’s new</h2>
                  <Button asChild variant="outline" size="sm" className="rounded-full border-white/60 bg-white/70">
                    <Link href="/gigs">Explore public</Link>
                  </Button>
                </div>
                <div className="mobile-slider-edge flex gap-4 overflow-x-auto pb-2">
	                  {dashboardQuickActions.slice(0, 10).map((action, index) => {
                      const locked = isTabLocked(action.tab);
                      return (
	                    <button
	                      key={`new-${action.id}`}
	                      type="button"
	                      onClick={() => attemptOpenTab(action.tab, action.label)}
	                      className={`cloud-card group w-[260px] shrink-0 rounded-[1.6rem] border border-white/60 p-4 text-left transition sm:w-[320px] ${locked ? 'opacity-70' : 'hover:-translate-y-0.5'}`}
	                      style={{
                        backgroundImage: index % 5 === 0
                          ? 'linear-gradient(135deg,rgba(59,130,246,0.20),rgba(255,255,255,0.76))'
                          : index % 5 === 1
                            ? 'linear-gradient(135deg,rgba(16,185,252,0.22),rgba(255,255,255,0.76))'
                            : index % 5 === 2
                              ? 'linear-gradient(135deg,rgba(139,92,246,0.20),rgba(255,255,255,0.76))'
                              : index % 5 === 3
                                ? 'linear-gradient(135deg,rgba(34,197,94,0.16),rgba(255,255,255,0.76))'
                                : 'linear-gradient(135deg,rgba(245,158,11,0.16),rgba(255,255,255,0.76))',
                      }}
                    >
	                      <div className="flex items-start justify-between gap-3">
	                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
	                          {locked ? <LockKeyhole className="h-5 w-5 text-slate-500" /> : <action.icon className="h-5 w-5 text-slate-800" />}
	                        </div>
	                        <span className="rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
	                          {locked ? 'Locked' : 'Open'}
	                        </span>
	                      </div>
	                      <p className="mt-4 text-base font-semibold tracking-[-0.03em] text-slate-950">{action.label}</p>
	                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{action.description}</p>
	                    </button>
                      );
                    })}
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold tracking-[-0.02em] text-slate-950">Templates</h2>
                    <p className="mt-1 text-sm text-slate-600">Reuse what you already ship, or generate a new template in minutes.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full border-white/60 bg-white/70"
                      onClick={() => {
                        setTemplateStudioOpen(true);
                      }}
                    >
                      Create template
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full border-white/60 bg-white/70"
                      onClick={() => router.push('/template-studio')}
                    >
                      Open full studio
                    </Button>
	                    <Button
	                      type="button"
	                      size="sm"
	                      className="rounded-full bg-slate-950 text-white hover:bg-slate-800"
	                      onClick={() => attemptOpenTab('generate', 'E-sign Documents')}
	                    >
	                      Open E-sign
	                    </Button>
                  </div>
                </div>

                <div className="cloud-panel overflow-hidden rounded-[1.8rem] border border-white/60 bg-white/75 p-4 shadow-[0_18px_44px_rgba(148,163,184,0.12)] backdrop-blur-2xl sm:p-5">
                  <Tabs value={dashboardTemplateTab} onValueChange={(value) => setDashboardTemplateTab(value as typeof dashboardTemplateTab)}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <TabsList className="rounded-full bg-white/70 p-1">
                        <TabsTrigger value="mine" className="rounded-full px-4">My templates</TabsTrigger>
                        <TabsTrigger value="all" className="rounded-full px-4">All templates</TabsTrigger>
                      </TabsList>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                          {dashboardTemplateTab === 'mine'
                            ? `${dashboardTemplates.mine.length} saved`
                            : `${dashboardTemplates.all.length} available`}
                        </span>
                      </div>
                    </div>

                    <TabsContent value="mine" className="mt-4">
                      {dashboardTemplates.mine.length ? (
                        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-3 xl:grid-cols-4">
                          {dashboardTemplates.mine.slice(0, 12).map((template) => (
                            <button
                              key={`mine-${template.id}`}
                              type="button"
                              onClick={() => {
                                handleTemplateSelect(template);
                                setActiveTab('generate');
                              }}
                              className="cloud-card group w-[280px] shrink-0 rounded-[1.6rem] border border-white/60 p-4 text-left transition hover:-translate-y-0.5 sm:w-auto"
                              style={{
                                backgroundImage: 'linear-gradient(135deg,rgba(16,185,252,0.16),rgba(255,255,255,0.78))',
                              }}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-950">{template.name}</p>
                                  <p className="mt-1 truncate text-xs text-slate-500">{template.category || 'General'} · Custom</p>
                                </div>
                                <span className="rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                                  Use
                                </span>
                              </div>
                              <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
                                {template.description || 'Open this template and start filling fields instantly.'}
                              </p>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-[1.6rem] border border-white/60 bg-white/70 p-5 text-sm text-slate-600">
                          No custom templates yet. Create one with the studio and it will show up here.
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button type="button" className="rounded-full bg-slate-950 text-white hover:bg-slate-800" onClick={() => setTemplateStudioOpen(true)}>
                              Create template
                            </Button>
                            <Button type="button" variant="outline" className="rounded-full" onClick={() => router.push('/template-studio')}>
                              Open full studio
                            </Button>
                            <Button type="button" variant="outline" className="rounded-full" onClick={() => setDashboardTemplateTab('all')}>
                              Browse all
                            </Button>
                          </div>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="all" className="mt-4">
                      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-3 xl:grid-cols-4">
                        {(dashboardTemplates.all.length ? dashboardTemplates.all : dashboardTemplates.recommended).slice(0, 12).map((template, index) => (
                          <button
                            key={`all-${template.id}`}
                            type="button"
                            onClick={() => {
                              handleTemplateSelect(template);
                              setActiveTab('generate');
                            }}
                            className="cloud-card group w-[280px] shrink-0 rounded-[1.6rem] border border-white/60 p-4 text-left transition hover:-translate-y-0.5 sm:w-auto"
                            style={{
                              backgroundImage: index % 4 === 0
                                ? 'linear-gradient(135deg,rgba(139,92,246,0.18),rgba(255,255,255,0.78))'
                                : index % 4 === 1
                                  ? 'linear-gradient(135deg,rgba(34,197,94,0.14),rgba(255,255,255,0.78))'
                                  : index % 4 === 2
                                    ? 'linear-gradient(135deg,rgba(245,158,11,0.14),rgba(255,255,255,0.78))'
                                    : 'linear-gradient(135deg,rgba(59,130,246,0.18),rgba(255,255,255,0.78))',
                            }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-950">{template.name}</p>
                                <p className="mt-1 truncate text-xs text-slate-500">
                                  {template.category || 'General'}{template.isCustom ? ' · Custom' : ''}
                                </p>
                              </div>
                              <span className="rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                                Use
                              </span>
                            </div>
                            <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
                              {template.description || 'Open and start filling fields instantly.'}
                            </p>
                          </button>
                        ))}
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>

                <div className="cloud-panel overflow-hidden rounded-[1.8rem] border border-white/60 bg-white/75 p-4 shadow-[0_18px_44px_rgba(148,163,184,0.12)] backdrop-blur-2xl sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold tracking-[-0.02em] text-slate-950">Template entitlements</h3>
                      <p className="mt-1 text-sm text-slate-600">Templates you installed from the marketplace. Reinstall anytime.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" className="rounded-full border-white/60 bg-white/70" onClick={() => router.push('/template-marketplace')}>
                        Browse marketplace
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="rounded-full border-white/60 bg-white/70" onClick={() => void fetchTemplateEntitlements()}>
                        Refresh
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {templateEntitlementsLoading ? (
                      <div className="rounded-[1.4rem] border border-white/70 bg-white/70 p-5 text-sm text-slate-600">
                        Loading entitlements…
                      </div>
                    ) : templateEntitlements.length ? (
                      templateEntitlements.slice(0, 9).map((purchase) => (
                        <div key={`tpl-ent-${purchase.id}`} className="cloud-card rounded-[1.6rem] border border-white/60 bg-white/70 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-950">
                                {purchase.item?.name || 'Template'}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {purchase.item?.category || 'Marketplace'} · {purchase.amountInPaise > 0 ? `Paid` : 'Free'}
                              </p>
                            </div>
                            <span className="rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                              Installed
                            </span>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-full border-white/60 bg-white/70"
                              onClick={() => router.push(`/template-marketplace/${encodeURIComponent(purchase.itemId)}`)}
                            >
                              View
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              className="rounded-full bg-slate-950 text-white hover:bg-slate-800"
                              onClick={async () => {
                                try {
                                  const res = await fetch('/api/template-marketplace/reinstall', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ purchaseId: purchase.id }),
                                  });
                                  const payload = await res.json().catch(() => null);
                                  if (!res.ok) throw new Error(payload?.error || 'Unable to reinstall.');
                                  await fetchTemplates();
                                  await fetchTemplateEntitlements();
                                  setSuccessMessage('Template reinstalled into your workspace.');
                                  setErrorMessage('');
                                } catch (err) {
                                  setErrorMessage(err instanceof Error ? err.message : 'Unable to reinstall.');
                                }
                              }}
                            >
                              Reinstall
                            </Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[1.6rem] border border-dashed border-white/70 bg-white/60 p-5 text-sm text-slate-600 sm:col-span-2 xl:col-span-3">
                        No marketplace templates installed yet. Open the marketplace, install one, and it will show up here.
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <h2 className="text-sm font-semibold tracking-[-0.02em] text-slate-950">Recents</h2>
                  <Button type="button" variant="outline" size="sm" className="rounded-full border-white/60 bg-white/70" onClick={() => attemptOpenTab('history', 'History')}>
                    Open history
                  </Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {standardHistory.slice(0, 8).map((item) => (
                    <div key={`recent-${item.id}`} className="cloud-card rounded-[1.6rem] border border-white/60 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950">{item.templateName}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short' }).format(new Date(item.generatedAt))}
                            {item.referenceNumber ? ` · ${item.referenceNumber}` : ''}
                          </p>
                        </div>
                        <span className="rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                          {item.documentSourceType === 'uploaded_pdf' ? 'PDF' : 'Doc'}
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" className="rounded-full border-white/60 bg-white/70" onClick={() => reuseHistoryItem(item)}>
                          Edit
                        </Button>
                        <Button type="button" size="sm" className="rounded-full bg-slate-950 text-white hover:bg-slate-800" onClick={() => openDocumentLink(item)}>
                          Open
                          <Link2 className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {standardHistory.length === 0 ? (
                    <div className="cloud-panel col-span-full rounded-[1.8rem] p-6 text-sm text-slate-600">
                      No recent documents yet. Generate or upload one and it will show up here.
                    </div>
                  ) : null}
                </div>
              </section>
            </TabsContent>

            <TabsContent value="summary" className="space-y-6">
              {renderFeatureOverviewCard('summary')}
              {renderWorkspacePanelToggle(
                'summary-tour',
                'Workspace intro and tour',
                'Open the parser overview and guided workspace tour only when you need it.',
              )}
              {workspacePanelsOpen['summary-tour'] ? renderFeatureTourCard(
                'summary',
                'Understand document scoring and parser decisions',
                'Replay the parser tour to learn how document content becomes summary, score, obligations, risks, mitigations, and saved parser sessions.',
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant={summaryFilter === 'all' ? 'default' : 'outline'} className="rounded-xl" onClick={() => setSummaryFilter('all')}>All docs</Button>
                <Button type="button" variant={summaryFilter === 'signed' ? 'default' : 'outline'} className="rounded-xl" onClick={() => setSummaryFilter('signed')}>Signed docs</Button>
              </div>
              {renderWorkspacePanelToggle(
                'summary-parser',
                'AI Document Parser',
                'Open the parser workspace only when you want to upload, extract, and analyze a document.',
              )}
              {workspacePanelsOpen['summary-parser'] ? (
              <Card className="border-white/60 bg-white/80 backdrop-blur">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle>AI Document Parser</CardTitle>
                    <InfoHint label="Read document content, detect tone, extract critical details, score quality, and surface risks with mitigation guidance." />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex cursor-pointer items-center">
                      <input type="file" accept=".pdf,.doc,.docx,.docm,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.txt,.md,.html,.csv,.json,.xml,.rtf,.png,.jpg,.jpeg,.webp,.tif,.tiff" className="hidden" onChange={(event) => void handleDocumentParserUpload(event)} />
                      <span className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                        <Upload className="mr-2 h-4 w-4" />
                        Upload Document
                      </span>
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void parseDocumentWithAi(stripEditorHtml(generatedHtml), selectedTemplate?.name || currentHistoryEntry?.templateName || 'Current preview', 'preview')}
                      disabled={!generatedHtml || documentParserLoading}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Analyze Current Preview
                    </Button>
                    <Button type="button" variant="outline" onClick={() => void parseDocumentWithAi()} disabled={documentParserLoading}>
                      <Sparkles className={`mr-2 h-4 w-4 ${documentParserLoading ? 'animate-pulse' : ''}`} />
                      {documentParserLoading ? 'Parsing...' : 'Parse Document'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(documentParserLoading || documentParserError || documentParserSuccess) && (
                    <div className={`rounded-2xl border p-4 text-sm ${
                      documentParserError
                        ? 'border-red-200 bg-red-50 text-red-700'
                        : documentParserSuccess
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-sky-200 bg-sky-50 text-sky-700'
                    }`}>
                      {documentParserLoading && !documentParserError && !documentParserSuccess && (
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 animate-pulse" />
                          <span>Parsing document and generating structured analysis...</span>
                        </div>
                      )}
                      {documentParserError && (
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>{documentParserError}</span>
                        </div>
                      )}
                      {documentParserSuccess && !documentParserLoading && <span>{documentParserSuccess}</span>}
                    </div>
                  )}

                  <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
                    <div className="space-y-4">
                      <div className="rounded-2xl border bg-slate-50 p-4">
                        <div className="mb-2 flex items-center gap-2">
                          <label className="block text-sm font-medium text-slate-900">Document Title</label>
                          <InfoHint label="Upload supported files or paste content below. Parser source and analysis mode update after each run." />
                        </div>
                        <Input value={documentParserTitle} onChange={(event) => setDocumentParserTitle(event.target.value)} placeholder="Agreement, notice, policy, proposal..." />
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                          <span className="rounded-full bg-white px-2.5 py-1">{documentParserSourceLabel ? `Source: ${documentParserSourceLabel}` : 'Ready for upload or paste'}</span>
                        {parsedDocumentInsights?.extractedCharacterCount ? (
                          <span className="rounded-full bg-white px-2.5 py-1">
                            {parsedDocumentInsights.extractedCharacterCount} chars • {parsedDocumentInsights.extractionMethod || 'AI parser'}
                          </span>
                        ) : null}
                        {parsedDocumentInsights?.analysisMode ? (
                          <span className="rounded-full bg-white px-2.5 py-1">
                            {parsedDocumentInsights.analysisMode === 'ai' ? 'AI analysis' : 'Fallback analysis'}
                          </span>
                        ) : null}
                        {activeParserHistoryId ? (
                          <span className="rounded-full bg-white px-2.5 py-1">Saved session</span>
                        ) : null}
                        </div>
                      </div>
                      {parsedDocumentInsights && (
                        <div className="rounded-2xl bg-slate-950 p-4 text-white">
                          <div className="flex items-center gap-2">
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Document Score</p>
                            <InfoHint label={parsedDocumentInsights.score.rationale || 'AI rationale will appear here after parsing.'} />
                          </div>
                          <p className="mt-3 text-4xl font-semibold">{parsedDocumentInsights.score.overall}</p>
                          <p className="mt-2 text-sm text-slate-200">Tone: {parsedDocumentInsights.tone}</p>
                        </div>
                      )}
                      <div className="rounded-2xl border bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-slate-900">Parser History</p>
                          <span className="text-xs text-slate-500">{documentParserHistory.length} saved</span>
                        </div>
                        <div className="mt-3 max-h-[260px] space-y-2 overflow-auto pr-1">
                          {documentParserHistory.length > 0 ? documentParserHistory.map((entry) => (
                            <div key={entry.id} className={`rounded-2xl border p-3 ${activeParserHistoryId === entry.id ? 'border-slate-900 bg-slate-100' : 'border-slate-200 bg-slate-50'}`}>
                              <p className="text-sm font-medium text-slate-900">{entry.title}</p>
                              <p className="mt-1 text-xs text-slate-500">{entry.sourceLabel || entry.sourceType} • {new Date(entry.updatedAt).toLocaleString()}</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <Button type="button" size="sm" variant="outline" onClick={() => restoreParserHistoryEntry(entry)}>Open</Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void deleteParserHistoryItem(entry.id).catch((error) => setDocumentParserError(error instanceof Error ? error.message : 'Unable to delete parser history.'))}
                                >
                                  Delete
                                </Button>
                              </div>
                            </div>
                          )) : <p className="text-sm text-slate-500">Saved parser sessions will appear here.</p>}
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl border bg-white p-4">
                      <label className="mb-2 block text-sm font-medium text-slate-900">Document Content</label>
                      <textarea
                        value={documentParserContent}
                        onChange={(event) => setDocumentParserContent(preserveDocumentStructure(event.target.value))}
                        className="min-h-[300px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm leading-6 text-slate-900"
                        placeholder="Paste contract, policy, proposal, letter, or other document content here for AI parsing."
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => void parseDocumentWithAi()} disabled={documentParserLoading || !documentParserContent.trim()}>
                          <Sparkles className="mr-2 h-4 w-4" />
                          Re-analyze Content
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void saveParserSnapshot().then(() => {
                            setDocumentParserSuccess(activeParserHistoryId ? 'Parser history updated successfully.' : 'Parser history saved successfully.');
                            setDocumentParserError('');
                          }).catch((error) => {
                            setDocumentParserError(error instanceof Error ? error.message : 'Unable to save parser history.');
                            setDocumentParserSuccess('');
                          })}
                          disabled={documentParserLoading || !documentParserContent.trim()}
                        >
                          <History className="mr-2 h-4 w-4" />
                          {activeParserHistoryId ? 'Update Saved Session' : 'Save Parser Session'}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setParsedDocumentInsights(null);
                            setDocumentParserContent('');
                            setDocumentParserSourceLabel('');
                            setDocumentParserTitle('');
                            setDocumentParserError('');
                            setDocumentParserSuccess('');
                            setActiveParserHistoryId('');
                          }}
                          disabled={documentParserLoading}
                        >
                          Clear Parser
                        </Button>
                      </div>
                    </div>
                  </div>

                  {parsedDocumentInsights ? (
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                      <div className="space-y-4">
                        <div className="rounded-2xl border bg-white p-5">
                          <div className="flex items-center gap-2">
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Executive Summary</p>
                            <InfoHint label={`Powered by ${parsedDocumentInsights.provider || 'Groq'}${parsedDocumentInsights.model ? ` • ${parsedDocumentInsights.model}` : ''}`} />
                          </div>
                          <p className="mt-3 text-sm leading-7 text-slate-700">{parsedDocumentInsights.summary}</p>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {[
                            { label: 'Clarity', value: parsedDocumentInsights.score.clarity },
                            { label: 'Compliance', value: parsedDocumentInsights.score.compliance },
                            { label: 'Completeness', value: parsedDocumentInsights.score.completeness },
                            { label: 'Professionalism', value: parsedDocumentInsights.score.professionalism },
                            { label: 'Risk Exposure', value: parsedDocumentInsights.score.riskExposure },
                          ].map((item) => (
                            <div key={item.label} className="rounded-2xl border bg-slate-50 p-4">
                              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
                              <p className="mt-2 text-2xl font-semibold text-slate-950">{item.value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="grid gap-4">
                        {[
                          { label: 'Key Details', items: parsedDocumentInsights.keyDetails },
                          { label: 'Risks', items: parsedDocumentInsights.risks, tone: 'border-amber-200 bg-amber-50' },
                          { label: 'Mitigations', items: parsedDocumentInsights.mitigations, tone: 'border-emerald-200 bg-emerald-50' },
                          { label: 'Obligations', items: parsedDocumentInsights.obligations },
                          { label: 'Recommended Actions', items: parsedDocumentInsights.recommendedActions },
                        ].map((section) => (
                          <div key={section.label} className={`rounded-2xl border p-4 ${section.tone || 'bg-slate-50'}`}>
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{section.label}</p>
                            <div className="mt-3 space-y-2">
                              {section.items.length > 0 ? section.items.map((item) => (
                                <p key={item} className="text-sm text-slate-700">• {item}</p>
                              )) : <p className="text-sm text-slate-500">No {section.label.toLowerCase()} returned yet.</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed bg-slate-50 p-6 text-sm text-slate-500">
                      Run a parser pass to generate summary, score, and action signals.
                    </div>
                  )}
                </CardContent>
              </Card>
              ) : null}

              {renderWorkspacePanelToggle(
                'summary-briefing',
                'AI Workspace Briefing',
                'Open the executive briefing only when you want a generated workspace summary.',
              )}
              {workspacePanelsOpen['summary-briefing'] ? (
              <Card className="overflow-hidden border-white/60 bg-white/80 backdrop-blur">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <CardTitle>AI Workspace Briefing</CardTitle>
                      <InfoHint label="Turn current document activity into an executive-ready view of priorities, bottlenecks, and momentum areas." />
                    </div>
                    <p className="mt-2 text-sm text-slate-500">{workspaceInsightsUpdatedLabel}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" className="rounded-xl" onClick={() => setNotificationOpen(true)}>
                      <Bell className="mr-2 h-4 w-4" />
                      Alerts {unreadNotificationsCount > 0 ? `(${unreadNotificationsCount})` : ''}
                    </Button>
                  <Button type="button" variant="outline" className="rounded-xl" onClick={() => void fetchAiWorkspaceInsights()} disabled={aiWorkspaceLoading}>
                    <Sparkles className={`mr-2 h-4 w-4 ${aiWorkspaceLoading ? 'animate-pulse' : ''}`} />
                    {aiWorkspaceLoading ? 'Generating...' : aiWorkspaceInsights ? 'Refresh Briefing' : 'Generate Briefing'}
                  </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {aiWorkspaceInsights ? (
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                      <div className="space-y-4">
                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                          {workspaceInsightStatCards.map((item) => (
                            <div key={item.label} className={`rounded-2xl border border-white/70 px-4 py-3 ${item.tone}`}>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-75">{item.label}</p>
                              <p className="mt-2 text-xl font-semibold tracking-tight">{item.value}</p>
                            </div>
                          ))}
                        </div>
                        <div className="rounded-[1.6rem] border border-slate-900/10 bg-[linear-gradient(135deg,#0f172a,#111827_55%,#1e293b)] p-5 text-white shadow-[0_24px_60px_rgba(15,23,42,0.16)]">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-xs uppercase tracking-[0.22em] text-slate-300">Executive Briefing</p>
                            <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-200">
                              {aiWorkspaceInsights.provider || 'Groq'}{aiWorkspaceInsights.model ? ` • ${aiWorkspaceInsights.model}` : ''}
                            </span>
                          <InfoHint label={`Powered by ${aiWorkspaceInsights.provider || 'Groq'}${aiWorkspaceInsights.model ? ` • ${aiWorkspaceInsights.model}` : ''}`} />
                        </div>
                        <p className="mt-3 text-sm leading-7 text-slate-100">{aiWorkspaceInsights.briefing}</p>
                        </div>
                      </div>
                      <div className="grid gap-4">
                        <div className="rounded-2xl border bg-slate-50 p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Priorities</p>
                          <div className="mt-3 space-y-2">
                            {aiWorkspaceInsights.priorities.length > 0 ? aiWorkspaceInsights.priorities.map((item) => (
                              <p key={item} className="text-sm text-slate-700">• {item}</p>
                            )) : <p className="text-sm text-slate-500">No immediate priorities returned yet.</p>}
                          </div>
                        </div>
                        <div className="rounded-2xl border bg-slate-50 p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Bottlenecks</p>
                          <div className="mt-3 space-y-2">
                            {aiWorkspaceInsights.bottlenecks.length > 0 ? aiWorkspaceInsights.bottlenecks.map((item) => (
                              <p key={item} className="text-sm text-slate-700">• {item}</p>
                            )) : <p className="text-sm text-slate-500">No major bottlenecks detected yet.</p>}
                          </div>
                        </div>
                        <div className="rounded-2xl border bg-slate-50 p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Opportunities</p>
                          <div className="mt-3 space-y-2">
                            {aiWorkspaceInsights.opportunities.length > 0 ? aiWorkspaceInsights.opportunities.map((item) => (
                              <p key={item} className="text-sm text-slate-700">• {item}</p>
                            )) : <p className="text-sm text-slate-500">No improvement opportunities returned yet.</p>}
                          </div>
                        </div>
                        <div className="rounded-2xl border bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(241,245,249,0.96))] p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Live Alerts</p>
                            <span className="inline-flex items-center rounded-full bg-slate-950 px-2.5 py-1 text-[11px] font-semibold text-white">
                              {unreadNotificationsCount} unread
                            </span>
                          </div>
                          <div className="mt-3 space-y-2">
                            {briefingNotificationItems.length > 0 ? briefingNotificationItems.map((item) => (
                              <div key={item.id} className={`rounded-2xl px-3 py-3 ${item.read ? 'bg-white text-slate-700' : 'bg-sky-50 text-slate-800'}`}>
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                                    <p className="mt-1 text-xs leading-5 text-slate-600">{item.body}</p>
                                  </div>
                                  {!item.read ? <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-sky-500" /> : null}
                                </div>
                              </div>
                            )) : <p className="text-sm text-slate-500">No fresh alerts right now.</p>}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed bg-slate-50 p-6 text-sm text-slate-500">
                      Generate an AI briefing from live workspace activity.
                    </div>
                  )}
                </CardContent>
              </Card>
              ) : null}

              <Card className="border-white/60 bg-white/75 backdrop-blur">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle>Document Summary</CardTitle>
                    <InfoHint label="Track opens, downloads, edits, reviews, signatures, and latest activity across shared documents." />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {paginatedSummary.map((item) => (
                    <div key={item.id} className="rounded-2xl border bg-white p-4">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-slate-900">{item.templateName}</p>
                            {item.pendingFeedbackCount > 0 && (
                              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">{item.pendingFeedbackCount} pending feedback</span>
                            )}
                          </div>
                          <p className="text-sm text-slate-500">{item.referenceNumber}</p>
                          <p className="text-sm text-slate-500">Generated on {new Date(item.generatedAt).toLocaleString()}</p>
                          <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-600 md:grid-cols-3 xl:grid-cols-6">
                            <div className="rounded-xl bg-orange-50 p-3"><p className="text-xs uppercase tracking-[0.16em] text-slate-400">Opens</p><p className="mt-1 font-semibold text-slate-900">{item.openCount}</p></div>
                            <div className="rounded-xl bg-orange-50 p-3"><p className="text-xs uppercase tracking-[0.16em] text-slate-400">Downloads</p><p className="mt-1 font-semibold text-slate-900">{item.downloadCount}</p></div>
                            <div className="rounded-xl bg-orange-50 p-3"><p className="text-xs uppercase tracking-[0.16em] text-slate-400">Edits</p><p className="mt-1 font-semibold text-slate-900">{item.editCount}</p></div>
                            <div className="rounded-xl bg-orange-50 p-3"><p className="text-xs uppercase tracking-[0.16em] text-slate-400">Comments</p><p className="mt-1 font-semibold text-slate-900">{item.commentCount}</p></div>
                            <div className="rounded-xl bg-orange-50 p-3"><p className="text-xs uppercase tracking-[0.16em] text-slate-400">Reviews</p><p className="mt-1 font-semibold text-slate-900">{item.reviewCount}</p></div>
                            <div className="rounded-xl bg-orange-50 p-3"><p className="text-xs uppercase tracking-[0.16em] text-slate-400">Signed</p><p className="mt-1 font-semibold text-slate-900">{item.signCount}</p></div>
                          </div>
                          <div className="mt-3 space-y-1">
                            <p className="text-sm text-slate-600">Devices: {item.uniqueDevices.length > 0 ? item.uniqueDevices.join(' | ') : 'No tracked devices yet'}</p>
                            {item.latestActivityAt && <p className="text-sm text-slate-600">Latest activity: {new Date(item.latestActivityAt).toLocaleString()} {item.latestActivityLabel ? `on ${item.latestActivityLabel}` : ''}</p>}
                            {item.recipientSignedAt && (
                              <p className="text-sm text-slate-600">
                                Signature location: {formatSignatureLocation({
                                  label: item.signedLocationLabel,
                                  latitude: item.signedLatitude,
                                  longitude: item.signedLongitude,
                                  accuracyMeters: item.signedAccuracyMeters,
                                })}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 xl:justify-end">
                          <Button variant="outline" size="sm" onClick={() => openDocumentLink({ shareUrl: item.shareUrl })}>Open Link</Button>
                          <Button variant="outline" size="sm" onClick={() => void copyDocumentLink({ shareUrl: item.shareUrl })}><Copy className="w-4 h-4 mr-2" />Copy Link</Button>
                          {buildGoogleMapsLink(item.signedLatitude, item.signedLongitude) && (
                            <Button variant="outline" size="sm" onClick={() => window.open(buildGoogleMapsLink(item.signedLatitude, item.signedLongitude), '_blank', 'noopener,noreferrer')}>
                              Verify Location
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredSummaryItems.length === 0 && <p className="text-sm text-slate-500">{summaryFilter === 'signed' ? 'Signed documents will appear here once recipients complete signing.' : 'Document tracking will appear after links start being opened and used.'}</p>}
                  {filteredSummaryItems.length > SUMMARY_PAGE_SIZE && (
                    <div className="flex items-center justify-end gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setSummaryPage((prev) => Math.max(1, prev - 1))} disabled={summaryPage === 1}>Previous</Button>
                      <span className="text-sm text-slate-500">Page {summaryPage} of {summaryPageCount}</span>
                      <Button type="button" variant="outline" size="sm" onClick={() => setSummaryPage((prev) => Math.min(summaryPageCount, prev + 1))} disabled={summaryPage === summaryPageCount}>Next</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="doxpert" className="space-y-6">
              <DoxpertCenter
                currentDocumentTitle={selectedTemplate?.name || currentHistoryEntry?.templateName}
                currentDocumentContent={generatedHtml || currentHistoryEntry?.previewHtml || ''}
                currentHistoryId={currentHistoryEntry?.id || currentHistoryEntry?.shareId}
                currentDocumentSourceType={currentHistoryEntry?.documentSourceType}
              />
            </TabsContent>

            <TabsContent value="visualizer" className="space-y-6">
              <DocumentVisualizerCenter
                currentDocumentTitle={selectedTemplate?.name || currentHistoryEntry?.templateName}
                currentDocumentContent={generatedHtml || currentHistoryEntry?.previewHtml || ''}
              />
            </TabsContent>

            <TabsContent value="profile" className="space-y-6">
              <ProfileCenter />
            </TabsContent>

	            <TabsContent value="billing" className="space-y-6">
	              <BillingCenter initialPlanId={searchParams?.get('plan') || undefined} />
	            </TabsContent>

	            <TabsContent value="super-admin" className="space-y-6">
	              {renderFeatureOverviewCard('super-admin')}
	              <SuperAdminCommandCenter />
	            </TabsContent>

            <TabsContent value="support" className="space-y-6">
              <SupportCenter />
            </TabsContent>

            <TabsContent value="template-publisher" className="space-y-6">
              <TemplatePublisherCenter />
            </TabsContent>

	            <TabsContent value="daily-tools" className="space-y-6">
	              <DailyToolsCenter />
	            </TabsContent>

	            <TabsContent value="forms-studio">
	              <FormsCenter />
	            </TabsContent>

	            <TabsContent value="scratchpad">
	              <ScratchpadCenter />
	            </TabsContent>

            <TabsContent value="virtual-id" className="space-y-6">
              {renderFeatureOverviewCard('virtual-id')}
              {renderFeatureTourCard(
                'profile',
                'Create a scannable digital identity with live engagement tracking',
                'Use Virtual ID to publish a public profile page, generate a QR instantly, and track opens, scans, downloads, and audience reach from one workspace feature.',
              )}
              <VirtualIdCenter />
            </TabsContent>

            <TabsContent value="certificates" className="space-y-6">
              {renderFeatureOverviewCard('certificates')}
              {renderFeatureTourCard(
                'generate',
                'Issue, publish, and verify certificates from one flow',
                'Use E-Certificates to build polished certificate layouts, publish public verification pages, generate QR access, and track certificate opens and downloads.',
              )}
              <CertificatesCenter />
            </TabsContent>

            <TabsContent value="hiring-desk" className="space-y-6">
              {renderFeatureOverviewCard('hiring-desk')}
              {renderFeatureTourCard(
                'support',
                session?.user?.accountType === 'individual'
                  ? 'Match your resume score against live hiring thresholds'
                  : 'Run company hiring with ATS cutoffs and direct resume intake',
                session?.user?.accountType === 'individual'
                  ? 'Analyze your resume, unlock only the roles you currently qualify for, and submit your profile directly into the company workspace from one hiring view.'
                  : 'Use Hiring Desk to publish roles, set minimum ATS marks, review candidate submissions, and keep company-side hiring activity visible inside the dashboard.',
              )}
              <HiringDeskCenter />
            </TabsContent>

            <TabsContent value="talent-leads" className="space-y-6">
              <TalentLeadsCenter />
            </TabsContent>

            <TabsContent value="gigs" className="space-y-6">
              <GigsCenter />
            </TabsContent>

            <TabsContent value="docrudians" className="space-y-6">
              {renderFeatureOverviewCard('docrudians')}
              {renderFeatureTourCard(
                'support',
                'Grow your network around real work, not just profile cards',
                'Use Docrudians to create focused public or private rooms, invite people by link, share resources, and keep room updates in one clean workspace.',
              )}
              <DocrudiansCenter />
            </TabsContent>

	            <TabsContent value="team-workspace" className="space-y-6">
	              <TeamWorkspaceCenter />
	            </TabsContent>

	            <TabsContent value="deal-room" className="space-y-6">
	              <DealRoomCenter />
	            </TabsContent>

            <TabsContent value="internal-mailbox" className="space-y-6">
              {renderFeatureOverviewCard('internal-mailbox')}
              {renderFeatureTourCard(
                'support',
                'Coordinate internal operations through one AI-assisted mailbox',
                'Use the internal mailbox for workspace-only communication, sharper internal updates, and AI support for drafting and summarizing operational threads.',
              )}
              <InternalMailboxCenter onMailboxUpdate={() => void fetchNotifications()} />
            </TabsContent>

            <TabsContent value="file-transfers" className="space-y-6">
              <FileTransferCenter />
            </TabsContent>

            <TabsContent value="qr-drop" className="space-y-6">
              {renderFeatureOverviewCard('qr-drop')}
              <SecureAccessCenter mode="qr-drop" />
            </TabsContent>

            <TabsContent value="offline-locker" className="space-y-6">
              {renderFeatureOverviewCard('offline-locker')}
              {renderFeatureTourCard(
                'file-transfers',
                'Create password-locked files that still open offline',
                'Use Offline Locker when the file must travel as a secure package. The output is a locked document container that can be opened later without internet and unlocked only with the password.',
              )}
              <SecureAccessCenter mode="offline-locker" />
            </TabsContent>

            <TabsContent value="document-encrypter" className="space-y-6">
              {renderFeatureOverviewCard('document-encrypter')}
              {renderFeatureTourCard(
                'file-transfers',
                'Run premium encrypted delivery with triple-password protection',
                'Use Document Encrypter when the file itself must stay protected at rest. The sender issues transfer, secure, and parser passwords separately, and the receiver only sees the file after all three checks pass.',
              )}
              <FileTransferCenter mode="encrypter" />
            </TabsContent>

		            <TabsContent value="tutorials" className="space-y-6">
		              <TutorialsCenter />
		            </TabsContent>

            <TabsContent value="generate" className="space-y-6">
              <ProcessProgress
                active={isSendingUploadedPdf || aiGenerationLoading || aiDraftLoading || aiWorkspaceLoading}
                profile={isSendingUploadedPdf ? 'publish' : aiDraftLoading || aiWorkspaceLoading ? 'analysis' : 'generate'}
                title={
                  isSendingUploadedPdf
                    ? 'Preparing secure PDF share'
                    : aiDraftLoading
                      ? 'Reviewing generated document draft'
                      : aiWorkspaceLoading
                        ? 'Building AI workspace briefing'
                        : 'Generating AI document draft'
                }
                floating
                className="border-white/70 bg-white/94"
              />
              {(errorMessage || successMessage) && <Card><CardContent className="p-4">{errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}{successMessage && <p className="text-sm text-green-700">{successMessage}</p>}</CardContent></Card>}

              <Card className="clay-soft border-white/60 bg-white/82 backdrop-blur">
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <CardTitle>E-sign documents</CardTitle>
                      <InfoHint label="Upload a PDF, set security, create a link, and track signatures here." />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(['upload', 'security', 'share'] as const).map((step) => (
                        <button
                          key={step}
                          type="button"
                          onClick={() => setEsignStep(step)}
                          className={`rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition ${
                            esignStep === step
                              ? 'bg-slate-950 text-white shadow-[0_16px_32px_rgba(15,23,42,0.18)]'
                              : 'bg-white/70 text-slate-700 hover:bg-white'
                          }`}
                        >
                          {step}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setShareLinkModalOpen(true)}
                        className="rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition bg-white/70 text-slate-700 hover:bg-white flex items-center gap-1"
                      >
                        <Share2 className="h-3 w-3" />
                        Track
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)] 2xl:grid-cols-[minmax(0,1fr)_minmax(520px,0.9fr)]">
                  <div className="space-y-4">
                    {esignStep === 'upload' ? (
                      <div className="rounded-2xl border bg-slate-50 p-4">
                        <div className="mb-2 flex items-center gap-2">
                          <label className="block text-sm font-medium text-slate-900">Upload PDF</label>
                          <InfoHint label="PDF only." />
                        </div>
                        <Input type="file" accept=".pdf,application/pdf" onChange={(event) => void handleUploadedPdfSelection(event)} />

	                        <div className="mt-3 grid gap-3 lg:grid-cols-2">
	                          {uploadedPdfDraft ? (
	                            <div className="rounded-2xl border bg-white p-4">
	                              <p className="text-sm font-semibold text-slate-900">{uploadedPdfDraft.fileName}</p>
	                              <p className="mt-1 text-sm text-slate-500">Ready.</p>
	                              <div className="mt-3 flex flex-wrap gap-2">
	                                <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setEsignStep('security')}>
	                                  Next: security
	                                </Button>
	                              </div>
	                            </div>
	                          ) : (
	                            <div className="rounded-2xl border bg-white p-4">
	                              <p className="text-sm font-semibold text-slate-900">No PDF selected</p>
	                              <p className="mt-1 text-sm text-slate-500">Choose a PDF to create a secure signing link.</p>
	                            </div>
	                          )}

	                          <div className="rounded-2xl border bg-white p-4">
	                            <p className="text-sm font-semibold text-slate-900">Create in DocWord</p>
	                            <p className="mt-1 text-sm text-slate-500">
	                              Start a fresh DocWord draft, flag it for signing, then send it here to generate the secure e-sign link.
	                            </p>
	                            <div className="mt-3 flex flex-wrap gap-2">
	                              <Button
	                                type="button"
	                                variant="outline"
	                                size="sm"
	                                className="rounded-full"
	                                onClick={() => {
	                                  if (typeof window === 'undefined') return;
	                                  window.open('/docword?intent=esign&new=1', '_blank', 'noopener,noreferrer');
	                                }}
	                              >
	                                Open DocWord
	                              </Button>
	                            </div>
	                          </div>

	                          <div className="rounded-2xl border bg-white p-4 lg:col-span-2">
	                            <div className="flex flex-wrap items-start justify-between gap-3">
	                              <div className="min-w-0">
	                                <p className="text-sm font-semibold text-slate-900">Use a template</p>
	                                <p className="mt-1 text-sm text-slate-500">Pick a saved template, fill fields, preview, then share for signing.</p>
	                              </div>
	                              {selectedTemplate ? (
	                                <span className="rounded-full bg-slate-950 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
	                                  Selected
	                                </span>
	                              ) : null}
	                            </div>
	                            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
	                              <select
	                                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
	                                value={selectedTemplate?.id || ''}
	                                onChange={(event) => {
	                                  const nextId = event.target.value;
	                                  if (!nextId) {
	                                    setSelectedTemplate(null);
	                                    setGeneratedHtml('');
	                                    setCurrentHistoryEntry(null);
	                                    setSelectedSignatureId('');
	                                    return;
	                                  }
	                                  const match = allowedTemplates.find((template) => template.id === nextId);
	                                  if (match) handleTemplateSelect(match);
	                                }}
	                              >
	                                <option value="">Select a template</option>
	                                {allowedTemplates.map((template) => (
	                                  <option key={`esign-tpl-${template.id}`} value={template.id}>
	                                    {template.name}
	                                  </option>
	                                ))}
	                              </select>
	                              <Button
	                                type="button"
	                                variant="outline"
	                                size="sm"
	                                className="rounded-full"
	                                onClick={() => setTemplateStudioOpen(true)}
	                              >
	                                Create
	                              </Button>
	                              <Button
	                                type="button"
	                                size="sm"
	                                className="rounded-full bg-slate-950 text-white hover:bg-slate-800"
	                                onClick={() => setEsignStep('security')}
	                                disabled={!selectedTemplate}
	                              >
	                                Next
	                              </Button>
	                            </div>
	                          </div>
	                        </div>
	                      </div>
	                    ) : null}

	                    {esignStep === 'security' ? (
	                      <div className="grid gap-3">
	                        {selectedTemplate ? (
	                          <div className="rounded-2xl border bg-white p-4">
	                            <div className="flex flex-wrap items-center justify-between gap-3">
	                              <div className="min-w-0">
	                                <p className="font-medium text-slate-900">Template setup</p>
	                                <p className="mt-1 text-sm text-slate-500">Signature + layout applied to preview and PDF.</p>
	                              </div>
	                              <span className="rounded-full bg-white/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-700">
	                                {selectedTemplate.name}
	                              </span>
	                            </div>
	                            <div className="mt-4 grid gap-3 lg:grid-cols-2">
	                              <div>
	                                <div className="mb-2 flex items-center gap-2">
	                                  <label className="block text-sm font-medium text-slate-900">Admin signature (optional)</label>
	                                  <InfoHint label={availableSignatures.length > 0
	                                    ? 'Optional. If selected, it is embedded into the PDF and recorded in the audit trail.'
	                                    : session?.user?.role === 'admin'
	                                      ? 'Add signatures in Admin Panel to enable signing-ready templates.'
	                                      : 'Ask an admin to add at least one signature in Admin Panel.'} />
	                                </div>
	                                <Select value={selectedSignatureId} onValueChange={setSelectedSignatureId}>
	                                  <SelectTrigger className="h-11 rounded-2xl">
	                                    <SelectValue placeholder={availableSignatures.length > 0 ? 'No admin signature' : 'No signatures available'} />
	                                  </SelectTrigger>
	                                  <SelectContent className="navbar-glass">
	                                    <SelectItem value="none">No admin signature</SelectItem>
	                                    {availableSignatures.map((signature) => (
	                                      <SelectItem key={`esign-sig-${signature.id}`} value={signature.id}>
	                                        {signature.signerName} - {signature.signerRole}
	                                      </SelectItem>
	                                    ))}
	                                  </SelectContent>
	                                </Select>
	                              </div>
	                              <div>
	                                <div className="mb-2 flex items-center gap-2">
	                                  <label className="block text-sm font-medium text-slate-900">Document design</label>
	                                  <InfoHint label="Controls letterhead spacing and layout for preview, share view, and PDF export." />
	                                </div>
	                                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
	                                  <Select value={selectedDesignPreset} onValueChange={(value) => handleDesignPresetChange(value as DocumentDesignPreset)}>
	                                    <SelectTrigger className="h-11 rounded-2xl">
	                                      <SelectValue placeholder="Select design" />
	                                    </SelectTrigger>
	                                    <SelectContent className="navbar-glass">
	                                      {documentDesignPresets.map((preset) => (
	                                        <SelectItem key={`esign-design-${preset.id}`} value={preset.id}>
	                                          {preset.label}
	                                        </SelectItem>
	                                      ))}
	                                    </SelectContent>
	                                  </Select>
	                                  <Button
	                                    type="button"
	                                    variant="outline"
	                                    className="h-11 rounded-2xl"
	                                    onClick={() => openExamplePreview(selectedDesignPreset)}
	                                  >
	                                    Preview
	                                  </Button>
	                                </div>
	                              </div>
	                            </div>
	                          </div>
	                        ) : null}

	                        {selectedTemplate ? (
	                          <div className="rounded-2xl border bg-white p-4">
	                            <div className="flex flex-wrap items-start justify-between gap-3">
	                              <div className="min-w-0">
	                                <p className="font-medium text-slate-900">Workflow gates</p>
	                                <p className="mt-1 text-sm text-slate-500">Optional prerequisites before the recipient can sign.</p>
	                              </div>
	                              {isOnboardingTemplate ? (
	                                <span className="rounded-full bg-amber-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">
	                                  Onboarding
	                                </span>
	                              ) : null}
	                            </div>
	                            <div className="mt-4 grid gap-3 lg:grid-cols-2">
	                              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
	                                <label className="flex items-start gap-3 text-sm text-slate-900">
	                                  <input
	                                    type="checkbox"
	                                    checked={requiredDocumentWorkflowEnabled}
	                                    onChange={(event) => setRequiredDocumentWorkflowEnabled(event.target.checked)}
	                                    disabled={isOnboardingTemplate}
	                                    className="mt-1"
	                                  />
	                                  <span className="min-w-0">
	                                    <span className="flex items-center gap-2 font-medium">
	                                      Required document collection
	                                      <InfoHint label="Collect required documents before recipient signature." />
	                                    </span>
	                                    {isOnboardingTemplate ? (
	                                      <span className="mt-1 block text-xs text-amber-700">Mandatory for onboarding templates.</span>
	                                    ) : (
	                                      <span className="mt-1 block text-xs text-slate-500">Example: PAN, Aadhaar, signed NDA.</span>
	                                    )}
	                                  </span>
	                                </label>
	                                {requiredDocumentWorkflowEnabled ? (
	                                  <div>
	                                    <label className="mb-2 block text-sm font-medium text-slate-900">Required documents</label>
	                                    <Input
	                                      value={requiredDocumentsText}
	                                      onChange={(event) => setRequiredDocumentsText(event.target.value)}
	                                      placeholder="PAN Card, Aadhaar Card, Signed NDA"
	                                    />
	                                  </div>
	                                ) : null}
	                              </div>

	                              {isOnboardingTemplate ? (
	                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
	                                  <div className="flex items-center gap-2">
	                                    <p className="text-sm font-semibold text-slate-900">Employee access</p>
	                                    <InfoHint label="Used to create the employee sign-in and bind verification workflow." />
	                                  </div>
	                                  <div className="grid gap-3 sm:grid-cols-2">
	                                    <div className="sm:col-span-2">
	                                      <label className="mb-1 block text-sm font-medium text-slate-900">Employee name</label>
	                                      <Input value={onboardingContext.employeeName} onChange={(event) => setOnboardingContext((prev) => ({ ...prev, employeeName: event.target.value }))} placeholder="Full legal name" />
	                                    </div>
	                                    <div className="sm:col-span-2">
	                                      <label className="mb-1 block text-sm font-medium text-slate-900">Employee email</label>
	                                      <Input type="email" value={onboardingContext.employeeEmail} onChange={(event) => setOnboardingContext((prev) => ({ ...prev, employeeEmail: event.target.value }))} placeholder="employee@company.com" />
	                                    </div>
	                                  </div>
	                                </div>
	                              ) : (
	                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
	                                  <p className="text-sm font-medium text-slate-900">No additional gates enabled</p>
	                                  <p className="mt-1 text-sm text-slate-500">Continue to share settings when you’re ready.</p>
	                                </div>
	                              )}
	                            </div>
	                          </div>
	                        ) : null}

	                        <div className="rounded-2xl border bg-white p-4">
	                          <div className="flex items-start justify-between gap-3">
	                            <div>
	                              <p className="font-medium text-slate-900">Recipient signature</p>
	                              <p className="mt-1 text-sm text-slate-500">Require signature before submission.</p>
                            </div>
                            <label className="inline-flex items-center gap-2 text-sm">
                              <input type="checkbox" checked={recipientSignatureRequired} onChange={(event) => setRecipientSignatureRequired(event.target.checked)} />
                              Required
                            </label>
                          </div>
                          {uploadedPdfDraft ? (
                            <div className="mt-4 space-y-4">
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  variant={signaturePlacementEditorMode === 'boxes' ? 'default' : 'outline'}
                                  className="rounded-full"
                                  onClick={() => setSignaturePlacementEditorMode('boxes')}
                                >
                                  Place boxes
                                </Button>
                                <Button
                                  type="button"
                                  variant={signaturePlacementEditorMode === 'quick' ? 'default' : 'outline'}
                                  className="rounded-full"
                                  onClick={() => setSignaturePlacementEditorMode('quick')}
                                >
                                  Quick placement
                                </Button>
                                <span className="ml-auto rounded-full bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
                                  Multi-signer boxes
                                </span>
                              </div>

                              {signaturePlacementEditorMode === 'boxes' ? (
                                <div className="space-y-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-4">
                                    <div>
                                      <p className="text-sm font-semibold text-slate-900">Signature box editor</p>
                                      <p className="mt-1 text-xs text-slate-500">
                                        Place boxes precisely on the PDF and assign each box to the correct signer.
                                      </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="rounded-full bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-600">
                                        {signatureBoxes.length} box{signatureBoxes.length === 1 ? '' : 'es'}
                                      </span>
                                      <Button
                                        type="button"
                                        className="rounded-full bg-slate-950 text-white hover:bg-slate-800"
                                        onClick={() => setSignatureBoxEditorOpen(true)}
                                      >
                                        Open editor
                                      </Button>
                                    </div>
                                  </div>

                                  <Dialog open={signatureBoxEditorOpen} onOpenChange={setSignatureBoxEditorOpen}>
                                    <DialogContent className="flex h-[calc(100vh-1rem)] w-[calc(100vw-1rem)] max-w-none flex-col overflow-hidden rounded-[1.25rem] border border-white/70 bg-white/92 p-0 shadow-[0_36px_120px_rgba(15,23,42,0.18)] backdrop-blur-2xl sm:rounded-[1.9rem]">
                                      <DialogHeader className="shrink-0 border-b border-white/60 bg-white/70 px-5 py-4 backdrop-blur-2xl">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                          <div className="min-w-0">
                                            <DialogTitle className="text-sm font-semibold tracking-[-0.02em] text-slate-950">Place signature boxes</DialogTitle>
                                            <p className="mt-1 text-xs text-slate-500">Click to add a box. Drag to resize. Remove or rename from the right panel.</p>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <span className="rounded-full bg-white/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                                              {signatureBoxes.length} BOX{signatureBoxes.length === 1 ? '' : 'ES'}
                                            </span>
                                            <Button type="button" variant="outline" className="rounded-full bg-white/70" onClick={() => setSignatureBoxEditorOpen(false)}>
                                              Close
                                            </Button>
                                          </div>
                                        </div>
                                      </DialogHeader>
                                      <div className="flex-1 min-h-0 bg-slate-100 p-3 overflow-auto">
                                        <PdfSignatureBoxEditor
                                          pdfDataUrl={uploadedPdfDraft.dataUrl}
                                          value={signatureBoxes}
                                          onChange={setSignatureBoxes}
                                          signerKeys={signerKeys}
                                          signerDirectory={recipientSignerDirectory}
                                          onUpdateSignerDirectory={(signerKey, patch) => setRecipientSignerDirectory((current) => ({
                                            ...(current || {}),
                                            [signerKey]: { ...(current?.[signerKey] || {}), signerKey, ...patch },
                                          }))}
                                        />
                                      </div>
                                    </DialogContent>
                                  </Dialog>

                                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-sm font-semibold text-slate-900">Signer-level controls</p>
                                    <p className="mt-1 text-xs text-slate-500">Configure verification and capture requirements per signer slot.</p>
                                    {signingSetupSummary.issueLines.length ? (
                                      <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">Action needed</p>
                                        <ul className="mt-2 list-disc pl-5 text-sm">
                                          {signingSetupSummary.issueLines.map((line) => <li key={line}>{line}</li>)}
                                        </ul>
                                      </div>
                                    ) : null}
                                    <div className="mt-4 flex flex-wrap items-center gap-2">
                                      <div className="min-w-[220px]">
                                        <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Signing mode</label>
                                        <select
                                          className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
                                          value={recipientSigningMode}
                                          onChange={(e) => setRecipientSigningMode(e.target.value === 'sequential' ? 'sequential' : 'parallel')}
                                        >
                                          <option value="parallel">Parallel (any signer)</option>
                                          <option value="sequential">Sequential (ordered)</option>
                                        </select>
                                      </div>
                                      {currentHistoryEntry?.documentSourceType === 'uploaded_pdf' ? (
                                        <Button
                                          type="button"
                                          variant="outline"
                                          className="mt-[18px] rounded-full"
                                          disabled={isSendingSignerLinks || !signingSetupSummary.readyToSend}
                                          onClick={() => void sendSigningLinks(currentHistoryEntry)}
                                          title={signingSetupSummary.readyToSend ? 'Send secure signing links to each required signer.' : 'Resolve setup issues before sending.'}
                                        >
                                          Send signing links
                                        </Button>
                                      ) : null}
                                    </div>
                                    <div className="mt-3 grid gap-3">
                                      {signerKeys.map((key, index) => {
                                        const cfg = recipientSignerConfigsByKey[key] || {};
                                        const dir = recipientSignerDirectory[key] || {};
                                        const assignedBoxes = signingSetupSummary.boxesBySignerKey?.[key] || [];
                                        const assignedRequiredBoxes = assignedBoxes.filter((b: any) => (b as any)?.required !== false);
                                        const setCfg = (patch: Record<string, any>) => setRecipientSignerConfigsByKey((current) => ({
                                          ...(current || {}),
                                          [key]: { ...(current?.[key] || {}), ...patch },
                                        }));
                                        const setDir = (patch: Record<string, any>) => setRecipientSignerDirectory((current) => ({
                                          ...(current || {}),
                                          [key]: { ...(current?.[key] || {}), signerKey: key, ...patch },
                                        }));
                                        const signerStatus = (currentHistoryEntry?.recipientSigners || []).find((s: any) => s.signerKey === key)?.signingStatus || 'pending';
                                        const invite = currentHistoryEntry?.recipientSignerInvitesByKey?.[key];
                                        const localMail = signerMailActionByKey?.[key] || {};
                                        const sendingLink = Boolean(localMail.sendingLink);
                                        const sendingReminder = Boolean(localMail.sendingReminder);
                                        const linkBadge = localMail.lastLinkStatus || (invite?.lastSentAt ? 'sent' : undefined);
                                        const reminderBadge = localMail.lastReminderStatus || (invite?.lastReminderAt ? 'sent' : undefined);
                                        return (
                                          <div key={`signer-cfg-${key}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                              <div className="min-w-0">
                                                <p className="text-sm font-semibold text-slate-900">{dir.signerName || `Signer ${index + 1}`}</p>
                                                <p className="mt-1 text-xs text-slate-500 break-words">
                                                  Key: {key} • Boxes: {assignedBoxes.length} (required: {assignedRequiredBoxes.length})
                                                </p>
                                              </div>
                                              <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${signerStatus === 'signed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
                                                {signerStatus === 'signed' ? 'Signed' : 'Pending'}
                                              </span>
                                            </div>
                                            <div className="mt-3 grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                                              <div className="flex flex-wrap items-center justify-between gap-2">
                                                <span className="text-slate-500">Link</span>
                                                <span className="font-medium text-slate-900">
                                                  {invite?.lastSentAt ? `Sent ${new Date(invite.lastSentAt).toLocaleString()}` : 'Not sent'}
                                                </span>
                                              </div>
                                              <div className="flex flex-wrap items-center justify-between gap-2">
                                                <span className="text-slate-500">Reminder</span>
                                                <span className="font-medium text-slate-900">
                                                  {invite?.lastReminderAt ? `Last ${new Date(invite.lastReminderAt).toLocaleString()}` : 'None'}
                                                </span>
                                              </div>
                                              {localMail?.lastLinkMessage ? (
                                                <div className={`rounded-xl px-3 py-2 text-xs ${localMail.lastLinkStatus === 'failed' ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>
                                                  {localMail.lastLinkMessage}
                                                </div>
                                              ) : null}
                                              {localMail?.lastReminderMessage ? (
                                                <div className={`rounded-xl px-3 py-2 text-xs ${localMail.lastReminderStatus === 'failed' ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>
                                                  {localMail.lastReminderMessage}
                                                </div>
                                              ) : null}
                                            </div>
                                            <div className="mt-4 grid gap-2 lg:grid-cols-2">
                                              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Signer name</label>
                                              <Input value={dir.signerName || ''} onChange={(e) => setDir({ signerName: e.target.value })} placeholder={`Signer ${index + 1}`} />
                                              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Signer email</label>
                                              <Input value={dir.signerEmail || ''} onChange={(e) => setDir({ signerEmail: e.target.value })} placeholder="name@company.com" />
                                              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Role (optional)</label>
                                              <Input value={dir.signerRole || ''} onChange={(e) => setDir({ signerRole: e.target.value })} placeholder="Approver / HR / Finance" />
                                              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Signing order</label>
                                              <Input value={String(dir.signingOrder ?? index + 1)} onChange={(e) => setDir({ signingOrder: Number(e.target.value) || (index + 1) })} placeholder="1" type="number" />
                                            </div>
                                            <div className="mt-4 flex flex-wrap gap-2">
                                              {currentHistoryEntry?.documentSourceType === 'uploaded_pdf' ? (
                                                <>
                                                  <Button
                                                    type="button"
                                                    className="h-10 rounded-full bg-slate-950 px-5 text-white shadow-[0_12px_30px_rgba(15,23,42,0.18)] hover:bg-slate-800 hover:shadow-[0_16px_40px_rgba(15,23,42,0.22)]"
                                                    disabled={sendingLink}
                                                    onClick={() => void sendSigningLinks(currentHistoryEntry, key)}
                                                    title="Send (or re-send) the secure signing link immediately."
                                                  >
                                                    {sendingLink ? 'Sending…' : 'Resend link'}
                                                  </Button>
                                                  {linkBadge ? (
                                                    <span className={`inline-flex h-10 items-center rounded-full px-4 text-xs font-semibold shadow-sm ${linkBadge === 'failed' ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>
                                                      {linkBadge === 'failed' ? 'Failed' : 'Sent'}
                                                    </span>
                                                  ) : null}
                                                  <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="h-10 rounded-full bg-white px-5 shadow-sm hover:bg-slate-50"
                                                    disabled={sendingReminder || signerStatus === 'signed'}
                                                    onClick={() => void sendReminderToSigner(currentHistoryEntry, key)}
                                                    title={signerStatus === 'signed' ? 'Signer already signed.' : 'Send a reminder email immediately.'}
                                                  >
                                                    {sendingReminder ? 'Sending…' : 'Send reminder'}
                                                  </Button>
                                                  {reminderBadge ? (
                                                    <span className={`inline-flex h-10 items-center rounded-full px-4 text-xs font-semibold shadow-sm ${reminderBadge === 'failed' ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>
                                                      {reminderBadge === 'failed' ? 'Failed' : 'Sent'}
                                                    </span>
                                                  ) : null}
                                                </>
                                              ) : null}
                                            </div>
                                            <div className="mt-4 grid gap-2 sm:grid-cols-2">
                                              <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900">
                                                Camera capture
                                                <input type="checkbox" checked={cfg.cameraCaptureEnabled !== false} onChange={(e) => setCfg({ cameraCaptureEnabled: e.target.checked })} />
                                              </label>
                                              <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900">
                                                Consent required
                                                <input type="checkbox" checked={cfg.consentRequired !== false} onChange={(e) => setCfg({ consentRequired: e.target.checked })} />
                                              </label>
                                              <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900">
                                                Email OTP
                                                <input type="checkbox" checked={cfg.emailOtpEnabled === true} onChange={(e) => setCfg({ emailOtpEnabled: e.target.checked })} />
                                              </label>
                                              <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900">
                                                IP/device/location capture
                                                <input type="checkbox" checked={cfg.captureIpDeviceLocationEnabled !== false} onChange={(e) => setCfg({ captureIpDeviceLocationEnabled: e.target.checked })} />
                                              </label>
                                            </div>
                                            <details className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                              <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                                                Advanced signature methods
                                              </summary>
                                              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                                <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900">
                                                  Draw signature
                                                  <input type="checkbox" checked={cfg.signatureDrawEnabled !== false} onChange={(e) => setCfg({ signatureDrawEnabled: e.target.checked })} />
                                                </label>
                                                <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900">
                                                  Upload signature
                                                  <input type="checkbox" checked={cfg.signatureUploadEnabled !== false} onChange={(e) => setCfg({ signatureUploadEnabled: e.target.checked })} />
                                                </label>
                                              </div>
                                            </details>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="grid gap-3 lg:grid-cols-3">
                                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-sm font-semibold text-slate-900">Signature placement</p>
                                    <p className="mt-1 text-xs text-slate-500">Signer signs once; we stamp the same signature where you request.</p>
                                    <div className="mt-3 grid gap-2">
                                      <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Pages</label>
                                      <select
                                        className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
                                        value={signaturePlacementMode}
                                        onChange={(event) => setSignaturePlacementMode(event.target.value as any)}
                                      >
                                        <option value="last">Last page</option>
                                        <option value="all">All pages</option>
                                        <option value="pages">Specific pages</option>
                                      </select>
                                      {signaturePlacementMode === 'pages' ? (
                                        <Input
                                          value={signaturePlacementPages}
                                          onChange={(event) => setSignaturePlacementPages(event.target.value)}
                                          placeholder="e.g. 1, 3, 5"
                                        />
                                      ) : null}
                                    </div>
                                  </div>

                                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-sm font-semibold text-slate-900">Position</p>
                                    <p className="mt-1 text-xs text-slate-500">Applied on selected pages.</p>
                                    <div className="mt-3">
                                      <select
                                        className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
                                        value={signaturePlacementPosition}
                                        onChange={(event) => setSignaturePlacementPosition(event.target.value as any)}
                                      >
                                        <option value="bottom_right">Bottom right</option>
                                        <option value="bottom_left">Bottom left</option>
                                        <option value="top_right">Top right</option>
                                        <option value="top_left">Top left</option>
                                        <option value="center">Center</option>
                                      </select>
                                    </div>
                                  </div>

                                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                    <p className="text-sm font-semibold text-slate-900">Multiple pages</p>
                                    <p className="mt-1 text-xs text-slate-500">
                                      This supports requesting the signature across multiple pages while the recipient signs only once.
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>

                        <div className="rounded-2xl border border-white/[0.09] bg-white/[0.03] p-4">
                          <div className="flex items-center justify-between gap-2 mb-3">
                            <p className="text-[13px] font-semibold text-white/70">Share security</p>
                            <button type="button" onClick={() => setShareLinkModalOpen(true)} className="flex items-center gap-1.5 rounded-[10px] border border-white/[0.10] bg-white/[0.05] px-3 h-7 text-[11px] font-semibold text-white/50 hover:bg-white/[0.10] hover:text-white/80 transition">
                              <Share2 className="h-3 w-3" />
                              Manage
                            </button>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <select className="h-9 rounded-[12px] border border-white/[0.10] bg-white/[0.05] px-3 text-[12px] text-white/70 focus:outline-none" value={shareAccessPolicy} onChange={(event) => setShareAccessPolicy(event.target.value as typeof shareAccessPolicy)}>
                              <option value="standard">Standard secure link</option>
                              <option value="expiring">Expiring secure link</option>
                              <option value="one_time">One-time secure link</option>
                            </select>
                            {shareAccessPolicy === 'expiring' ? (
                              <input value={shareExpiryDays} onChange={(e) => setShareExpiryDays(e.target.value)} placeholder="Expiry days" className="h-9 rounded-[12px] border border-white/[0.10] bg-white/[0.05] px-3 text-[12px] text-white/70 placeholder-white/20 focus:outline-none" />
                            ) : null}
                            {shareAccessPolicy === 'one_time' ? (
                              <input value={maxAccessCount} onChange={(e) => setMaxAccessCount(e.target.value)} placeholder="Max opens" className="h-9 rounded-[12px] border border-white/[0.10] bg-white/[0.05] px-3 text-[12px] text-white/70 placeholder-white/20 focus:outline-none" />
                            ) : null}
                          </div>
                        </div>

                        <div className="rounded-2xl border bg-white p-4">
                          <p className="font-medium text-slate-900">Watermark</p>
                          <p className="mt-1 text-sm text-slate-500">Optional label added across pages.</p>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <Input
                              value={documentWatermarkLabel}
                              onChange={(event) => setDocumentWatermarkLabel(event.target.value)}
                              placeholder="Confidential"
                              maxLength={48}
                            />
                            <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900">
                              Certificate branding
                              <input
                                type="checkbox"
                                checked={resolvedSignatureCertificateBrandingEnabled}
                                disabled={!canCustomizeSignatureCertificateBranding}
                                onChange={(event) => setSignatureCertificateBrandingEnabled(event.target.checked)}
                              />
                            </label>
                            <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 sm:col-span-2">
                              Show receipt page after signing
                              <input
                                type="checkbox"
                                checked={signatureReceiptCompletionPageEnabled}
                                onChange={(event) => setSignatureReceiptCompletionPageEnabled(event.target.checked)}
                              />
                            </label>
                          </div>
                          <p className="mt-3 text-xs text-slate-500">
                            Applied: <span className="font-semibold text-slate-700">{resolvedDocumentWatermarkLabel || 'No watermark'}</span>
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" className="rounded-full" onClick={() => setEsignStep('upload')}>
                            Back
                          </Button>
                          <Button type="button" className="rounded-full bg-slate-950 text-white hover:bg-slate-800" onClick={() => setEsignStep('share')}>
                            Next: create link
                          </Button>
                          <Button type="button" variant="outline" className="rounded-full" onClick={() => setShareLinkModalOpen(true)}>
                            <Share2 className="mr-2 h-4 w-4" />
                            Share links
                          </Button>
                        </div>
                      </div>
                    ) : null}

	                    {esignStep === 'share' ? (
	                      selectedTemplate ? (
	                        <div className="rounded-2xl border bg-white p-4 space-y-4">
	                          <div className="flex flex-wrap items-start justify-between gap-3">
	                            <div className="min-w-0">
	                              <p className="text-sm font-semibold text-slate-950">Generate and share</p>
	                              <p className="mt-1 text-sm text-slate-500">Fill fields, generate preview, then share the secure link.</p>
	                            </div>
	                            <span className="rounded-full bg-white/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-700">
	                              {requiredFieldCount === 0 ? 'Ready' : `${completedRequiredFields}/${requiredFieldCount}`}
	                            </span>
	                          </div>

	                          <div className="grid gap-4 xl:grid-cols-2">
	                            {selectedTemplate.fields.map((field) => (
	                              <div
	                                key={field.id}
	                                className={field.type === 'textarea' ? 'xl:col-span-2' : ''}
	                              >
	                                <label className="mb-1 block text-sm font-medium text-slate-900">
	                                  {field.label} {field.required && <span className="text-red-500">*</span>}
	                                </label>
	                                {renderField(field)}
	                              </div>
	                            ))}
	                          </div>

	                          <div className="grid gap-3 lg:grid-cols-2">
	                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
	                              <div className="mb-2 flex items-center gap-2">
	                                <label className="block text-sm font-medium text-slate-900">Recipient access</label>
	                                <InfoHint label="View/comment/edit control applies to the recipient share surface. Signature can still be required." />
	                              </div>
	                              <Select value={recipientAccess} onValueChange={(value: RecipientAccessLevel) => setRecipientAccess(value)}>
	                                <SelectTrigger className="h-11 rounded-2xl bg-white">
	                                  <SelectValue placeholder="Select access" />
	                                </SelectTrigger>
	                                <SelectContent className="navbar-glass">
	                                  <SelectItem value="view">View only</SelectItem>
	                                  <SelectItem value="comment">Comment and review</SelectItem>
	                                  <SelectItem value="edit">Edit, comment, and review</SelectItem>
	                                </SelectContent>
	                              </Select>
	                            </div>

	                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
	                              <label className="flex items-start gap-3 text-sm text-slate-900">
	                                <input
	                                  type="checkbox"
	                                  checked={dataCollectionEnabled}
	                                  onChange={(event) => setDataCollectionEnabled(event.target.checked)}
	                                  className="mt-1"
	                                />
	                                <span className="min-w-0">
	                                  <span className="block font-medium">Data collection form</span>
	                                  <span className="mt-1 block text-xs text-slate-500">Let the recipient fill required fields in a protected form before final signing.</span>
	                                </span>
	                              </label>
	                              {dataCollectionEnabled ? (
	                                <div>
	                                  <label className="mb-2 block text-sm font-medium text-slate-900">Instructions</label>
	                                  <textarea
	                                    value={dataCollectionInstructions}
	                                    onChange={(event) => setDataCollectionInstructions(event.target.value)}
	                                    className="min-h-[112px] w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
	                                    placeholder="Example: Fill all fields exactly as they should appear on the final signed document."
	                                  />
	                                </div>
	                              ) : null}
	                            </div>
	                          </div>

	                          <div className={`grid gap-3 ${dataCollectionEnabled ? 'sm:grid-cols-2 2xl:grid-cols-5' : 'sm:grid-cols-2 2xl:grid-cols-4'}`}>
	                            {dataCollectionEnabled ? (
	                              <Button
	                                type="button"
	                                variant="outline"
	                                onClick={() => void createDataCollectionRequest()}
	                                disabled={isCreatingDataCollectionRequest}
	                                className="w-full"
	                              >
	                                <Share2 className="mr-2 h-4 w-4" />
	                                {isCreatingDataCollectionRequest ? 'Creating...' : 'Create Form'}
	                              </Button>
	                            ) : null}
	                            <Button
	                              type="button"
	                              onClick={() => void generateDocument()}
	                              className="w-full bg-slate-950 text-white hover:bg-slate-800"
	                              disabled={isGeneratingPreview}
	                            >
	                              <Eye className="mr-2 h-4 w-4" />
	                              {isGeneratingPreview ? 'Generating...' : 'Generate Preview'}
	                            </Button>
	                            <Button
	                              type="button"
	                              variant="outline"
	                              onClick={() => void generatePDF()}
	                              disabled={!generatedHtml || isGeneratingPdf}
	                              className="w-full"
	                            >
	                              <Download className="mr-2 h-4 w-4" />
	                              {isGeneratingPdf ? 'Generating...' : 'Download PDF'}
	                            </Button>
	                            <Button
	                              type="button"
	                              variant="outline"
	                              onClick={() => currentHistoryEntry && openDocumentLink(currentHistoryEntry)}
	                              disabled={!currentHistoryEntry}
	                              className="w-full"
	                            >
	                              <Link2 className="mr-2 h-4 w-4" />
	                              Share Link
	                            </Button>
	                            <Button
	                              type="button"
	                              variant="outline"
	                              disabled={!currentHistoryEntry}
	                              className="w-full"
	                              onClick={() => currentHistoryEntry && openEmailComposer(currentHistoryEntry)}
	                            >
	                              <Mail className="mr-2 h-4 w-4" />
	                              Send Email
	                            </Button>
	                          </div>

	                          {currentHistoryEntry ? (
	                            <div className="rounded-[18px] border border-white/[0.09] bg-white/[0.03] p-4">
	                              <div className="flex items-center justify-between gap-2 mb-3">
	                                <div className="flex items-center gap-2">
	                                  <p className="text-[12.5px] font-semibold text-white/70">Latest link</p>
	                                  <span className="rounded-full bg-white/[0.06] border border-white/[0.08] px-2 py-0.5 text-[9.5px] font-bold text-white/40 font-mono">{currentHistoryEntry.sharePassword}</span>
	                                </div>
	                                <button type="button" onClick={() => setShareLinkModalOpen(true)} className="flex h-7 items-center gap-1.5 rounded-[10px] border border-white/[0.10] bg-white/[0.05] px-3 text-[11px] font-semibold text-white/50 hover:bg-white/[0.10] hover:text-white/80 transition">
	                                  <Share2 className="h-3 w-3" />
	                                  Share &amp; Track
	                                </button>
	                              </div>
	                              <div className="flex flex-wrap gap-2">
	                                <Button variant="outline" size="sm" className="rounded-full border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white" onClick={() => openDocumentLink(currentHistoryEntry)}><Link2 className="w-3.5 h-3.5 mr-1.5" />Open</Button>
	                                <Button variant="outline" size="sm" className="rounded-full border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white" onClick={() => void copyDocumentLink(currentHistoryEntry)}><Copy className="w-3.5 h-3.5 mr-1.5" />Copy</Button>
	                                <Button variant="outline" size="sm" className="rounded-full border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white" onClick={() => openEmailComposer(currentHistoryEntry)}><Mail className="w-3.5 h-3.5 mr-1.5" />Email</Button>
	                              </div>
	                            </div>
	                          ) : null}
	                        </div>
	                      ) : (
	                        <div className="rounded-[18px] border border-white/[0.09] bg-white/[0.03] p-4">
	                          <div className="flex items-center justify-between gap-3 mb-4">
	                            <div>
	                              <p className="text-[13px] font-semibold text-white/70">Create secure link</p>
	                              <p className="mt-1 text-[12px] text-white/35">Password + audit trail generated automatically.</p>
	                            </div>
	                            <span className="rounded-full border border-white/[0.10] bg-white/[0.05] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
	                              {shareAccessPolicy}
	                            </span>
	                          </div>
	                          <div className="flex flex-wrap gap-2">
	                            <Button
	                              type="button"
	                              className="rounded-full bg-white text-[#0D0D0F] hover:bg-white/90 font-semibold"
	                              onClick={async () => {
	                                const ok = await createUploadedPdfShare();
	                                if (ok) setShareLinkModalOpen(true);
	                              }}
	                              disabled={!uploadedPdfDraft || isSendingUploadedPdf}
	                            >
	                              <Share2 className="mr-2 h-4 w-4" />
	                              {isSendingUploadedPdf ? 'Creating...' : 'Create Secure PDF Link'}
	                            </Button>
	                            <Button type="button" variant="outline" className="rounded-full border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white" onClick={() => setShareLinkModalOpen(true)}>
	                              <Share2 className="mr-2 h-4 w-4" />
	                              Share &amp; Track
	                            </Button>
	                          </div>
	                          {currentHistoryEntry?.documentSourceType === 'uploaded_pdf' && (
	                            <div className="mt-4 flex flex-wrap gap-2">
	                              <Button variant="outline" size="sm" className="rounded-full border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white" onClick={() => openDocumentLink(currentHistoryEntry)}><Link2 className="w-3.5 h-3.5 mr-1.5" />Open</Button>
	                              <Button variant="outline" size="sm" className="rounded-full border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white" onClick={() => void copyDocumentLink(currentHistoryEntry)}><Copy className="w-3.5 h-3.5 mr-1.5" />Copy</Button>
	                              <Button variant="outline" size="sm" className="rounded-full border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white" onClick={() => openEmailComposer(currentHistoryEntry)}><Mail className="w-3.5 h-3.5 mr-1.5" />Email</Button>
	                            </div>
	                          )}
	                        </div>
	                      )
	                    ) : null}
                  </div>

                  <Card className="clay-soft border-white/60 bg-white/82 backdrop-blur">
                    <CardHeader>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <CardTitle>Preview</CardTitle>
                          <InfoHint label="This is the same preview surface recipients will see after you generate the final share link." />
                        </div>
                        <div className="flex items-center gap-2">
                          {(generatedHtml || (currentHistoryEntry?.documentSourceType === 'uploaded_pdf' && (currentHistoryEntry.signedPdfDataUrl || currentHistoryEntry.uploadedPdfDataUrl))) ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-full bg-white/70"
                              onClick={() => setPreviewFullscreenOpen(true)}
                            >
                              <Maximize2 className="mr-2 h-4 w-4" />
                              Full screen
                            </Button>
                          ) : null}
                          <span className="rounded-full bg-white/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                            {selectedTemplate ? 'Template' : uploadedPdfDraft ? 'PDF' : 'Empty'}
                          </span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="min-w-0">
                      {currentHistoryEntry?.documentSourceType === 'uploaded_pdf' && (currentHistoryEntry.signedPdfDataUrl || currentHistoryEntry.uploadedPdfDataUrl) ? (
                        currentHistoryEntry.recipientSignaturePlacements?.mode === 'boxes' && (currentHistoryEntry.recipientSignaturePlacements.boxes || []).length ? (
                          <div className="min-h-[58vh] overflow-auto rounded-xl border bg-white p-3 2xl:min-h-[760px]">
                            <PdfSignatureBoxPreview
                              pdfDataUrl={String(currentHistoryEntry.signedPdfDataUrl || currentHistoryEntry.uploadedPdfDataUrl || '')}
                              boxes={currentHistoryEntry.recipientSignaturePlacements.boxes}
                              scale={1.25}
                              maxPages={24}
                            />
                          </div>
                        ) : (
                          <iframe
                            title="Uploaded PDF Preview"
                            src={currentHistoryEntry.signedPdfDataUrl || currentHistoryEntry.uploadedPdfDataUrl}
                            className="w-full min-h-[58vh] rounded-xl border bg-white 2xl:min-h-[760px]"
                          />
                        )
                      ) : uploadedPdfDraft ? (
                        signatureBoxes.length ? (
                          <div className="min-h-[58vh] overflow-auto rounded-xl border bg-white p-3 2xl:min-h-[760px]">
                            <PdfSignatureBoxPreview pdfDataUrl={uploadedPdfDraft.dataUrl} boxes={signatureBoxes} scale={1.25} maxPages={24} />
                          </div>
                        ) : (
                          <iframe
                            title="Uploaded PDF Draft Preview"
                            src={uploadedPdfDraft.dataUrl}
                            className="w-full min-h-[58vh] rounded-xl border bg-white 2xl:min-h-[760px]"
                          />
                        )
                      ) : generatedHtml ? (
                        <iframe title="Document Preview" srcDoc={generatedHtml} className="w-full min-h-[58vh] rounded-xl border bg-white 2xl:min-h-[760px]" />
                      ) : (
                        <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-slate-500">
                          <div className="max-w-sm px-6 text-center">
                            <FileText className="mx-auto mb-4 h-12 w-12" />
                            <p className="text-base font-medium text-slate-700">Preview will appear here</p>
                            <p className="mt-2 text-sm text-slate-500">Choose a template or upload a PDF to see the live preview.</p>
                          </div>
                        </div>
                      )}
	                    </CardContent>
	                  </Card>

                  <Dialog open={previewFullscreenOpen} onOpenChange={setPreviewFullscreenOpen}>
                    <DialogContent className="flex h-[calc(100vh-1rem)] w-[calc(100vw-1rem)] max-w-none flex-col overflow-hidden rounded-[1.25rem] border border-white/70 bg-white/92 p-0 shadow-[0_36px_120px_rgba(15,23,42,0.18)] backdrop-blur-2xl sm:rounded-[1.9rem]">
                      <DialogHeader className="shrink-0 border-b border-white/60 bg-white/70 px-5 py-4 backdrop-blur-2xl">
                        <div className="flex items-center justify-between gap-3">
                          <DialogTitle className="text-sm font-semibold tracking-[-0.02em] text-slate-950">Preview</DialogTitle>
                          <Button type="button" variant="outline" className="rounded-full bg-white/70" onClick={() => setPreviewFullscreenOpen(false)}>
                            Close
                          </Button>
                        </div>
                      </DialogHeader>
                      <div className="flex-1 min-h-0 bg-slate-100 p-3">
                        {currentHistoryEntry?.documentSourceType === 'uploaded_pdf' && (currentHistoryEntry.signedPdfDataUrl || currentHistoryEntry.uploadedPdfDataUrl) ? (
                          <iframe
                            title="Uploaded PDF Preview Fullscreen"
                            src={currentHistoryEntry.signedPdfDataUrl || currentHistoryEntry.uploadedPdfDataUrl}
                            className="h-full w-full rounded-xl border bg-white"
                          />
                        ) : uploadedPdfDraft ? (
                          <iframe
                            title="Uploaded PDF Draft Preview Fullscreen"
                            src={uploadedPdfDraft.dataUrl}
                            className="h-full w-full rounded-xl border bg-white"
                          />
                        ) : generatedHtml ? (
                          <iframe title="Document Preview Fullscreen" srcDoc={generatedHtml} className="h-full w-full rounded-xl border bg-white" />
                        ) : (
                          <div className="flex h-full items-center justify-center rounded-xl border bg-white text-slate-500">
                            Nothing to preview yet.
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
	                </CardContent>
	              </Card>

	              <Dialog open={examplePreviewOpen} onOpenChange={setExamplePreviewOpen}>
	                <DialogContent className="max-w-6xl">
	                  <DialogHeader>
	                    <DialogTitle>{documentDesignPresets.find((preset) => preset.id === examplePreviewPreset)?.label} Example Preview</DialogTitle>
	                    <p className="text-sm text-slate-500">Sample content rendered with the selected design preset.</p>
	                  </DialogHeader>
	                  <div className="rounded-2xl border bg-slate-100 p-3">
	                    <iframe
	                      title="Document design example preview"
	                      srcDoc={examplePreviewHtml}
	                      className="h-[70vh] w-full rounded-xl bg-white"
	                    />
	                  </div>
	                </DialogContent>
	              </Dialog>
	            </TabsContent>

            <TabsContent value="history" className="space-y-6">
              <Dialog open={Boolean(signingStatusEntry)} onOpenChange={(open) => { if (!open) setSigningStatusEntry(null); }}>
                <DialogContent className="max-w-3xl">
                  <DialogHeader>
                    <DialogTitle>Signing status</DialogTitle>
                    <p className="text-sm text-slate-500">Per-signer tracking, reminders, and execution lifecycle for this document.</p>
                  </DialogHeader>
                  {signingStatusEntry ? (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Execution record</p>
                        <p className="mt-2 text-sm font-semibold text-slate-900 break-words">{signingStatusEntry.shareId || signingStatusEntry.id}</p>
                        <p className="mt-1 text-sm text-slate-600 break-words">{signingStatusEntry.templateName}</p>
                      </div>
                      {(() => {
                        const placements = signingStatusEntry.recipientSignaturePlacements;
                        const boxes = placements && (placements as any).mode === 'boxes' && Array.isArray((placements as any).boxes) ? (placements as any).boxes : [];
                        const requiredBoxes = boxes.filter((b: any) => (b as any).required !== false);
                        const keys = (Array.from(new Set(requiredBoxes.map((b: any) => String((b as any)?.signerKey || 'recipient').trim() || 'recipient'))) as string[]);
                        const directory = ((signingStatusEntry as any).recipientSignerDirectory || {}) as Record<string, any>;
                        const invites = ((signingStatusEntry as any).recipientSignerInvitesByKey || {}) as Record<string, any>;
                        return (
                          <div className="space-y-3">
                            {keys.length === 0 ? (
                              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                                No required signer assignments found. Assign signers to required boxes, then send signing links.
                              </div>
                            ) : keys.map((key) => {
                              const signer = (signingStatusEntry.recipientSigners || []).find((s: any) => s.signerKey === key) || null;
                              const invite = invites[key] || null;
                              const dir = directory[key] || {};
                              const status = signer?.signingStatus === 'signed' ? 'Signed' : 'Pending';
                              const localMail = signerMailActionByKey?.[key] || {};
                              const linkBadge = localMail.lastLinkStatus || (invite?.lastSentAt ? 'sent' : undefined);
                              const reminderBadge = localMail.lastReminderStatus || (invite?.lastReminderAt ? 'sent' : undefined);
                              return (
                                <div key={`signer-status-${key}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-slate-900 break-words">{dir.signerName || signer?.signerName || key}</p>
                                      <p className="mt-1 text-xs text-slate-500 break-words">{dir.signerEmail || signer?.signerEmail || 'No email set'}</p>
                                      <p className="mt-1 text-xs text-slate-500 break-words">Signer key: {key}</p>
                                    </div>
                                    <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${status === 'Signed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
                                      {status}
                                    </span>
                                  </div>
                                  <div className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Last activity</p>
                                      <p className="mt-2 font-medium text-slate-900 break-words">{signer?.signedAt ? new Date(signer.signedAt).toLocaleString() : '—'}</p>
                                      <p className="mt-1 text-xs text-slate-500 break-words">{signer?.signedIp ? `IP: ${signer.signedIp}` : ''}</p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Reminders</p>
                                      <p className="mt-2 font-medium text-slate-900 break-words">{invite?.reminderCount ? `${invite.reminderCount} sent` : '0 sent'}</p>
                                      <p className="mt-1 text-xs text-slate-500 break-words">{invite?.lastReminderAt ? `Last: ${new Date(invite.lastReminderAt).toLocaleString()}` : '—'}</p>
                                    </div>
                                  </div>
                                  <div className="mt-4 flex flex-wrap gap-2">
                                    <Button
                                      type="button"
                                      className="h-10 rounded-full bg-slate-950 px-5 text-white shadow-[0_12px_30px_rgba(15,23,42,0.18)] hover:bg-slate-800 hover:shadow-[0_16px_40px_rgba(15,23,42,0.22)]"
                                      disabled={Boolean(signerMailActionByKey?.[key]?.sendingLink)}
                                      onClick={() => void sendSigningLinks(signingStatusEntry, key)}
                                    >
                                      {signerMailActionByKey?.[key]?.sendingLink ? 'Sending…' : 'Resend link'}
                                    </Button>
                                    {linkBadge ? (
                                      <span className={`inline-flex h-10 items-center rounded-full px-4 text-xs font-semibold shadow-sm ${linkBadge === 'failed' ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>
                                        {linkBadge === 'failed' ? 'Failed' : 'Sent'}
                                      </span>
                                    ) : null}
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="h-10 rounded-full bg-white px-5 shadow-sm hover:bg-slate-50"
                                      disabled={Boolean(signerMailActionByKey?.[key]?.sendingReminder) || status === 'Signed'}
                                      onClick={() => void sendReminderToSigner(signingStatusEntry, key)}
                                    >
                                      {signerMailActionByKey?.[key]?.sendingReminder ? 'Sending…' : 'Send reminder'}
                                    </Button>
                                    {reminderBadge ? (
                                      <span className={`inline-flex h-10 items-center rounded-full px-4 text-xs font-semibold shadow-sm ${reminderBadge === 'failed' ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>
                                        {reminderBadge === 'failed' ? 'Failed' : 'Sent'}
                                      </span>
                                    ) : null}
                                  </div>
                                  {localMail?.lastLinkMessage ? (
                                    <div className={`mt-3 rounded-2xl border px-4 py-3 text-sm ${localMail.lastLinkStatus === 'failed' ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
                                      {localMail.lastLinkMessage}
                                    </div>
                                  ) : null}
                                  {localMail?.lastReminderMessage ? (
                                    <div className={`mt-3 rounded-2xl border px-4 py-3 text-sm ${localMail.lastReminderStatus === 'failed' ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
                                      {localMail.lastReminderMessage}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  ) : null}
                </DialogContent>
              </Dialog>
              <Card className="border-white/70 bg-white/82">
                <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <CardTitle>History</CardTitle>
                    <p className="mt-1 text-sm text-slate-500">One place to open, reuse, track, and audit every share.</p>
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[340px]">
                    <Input
                      value={historySearch}
                      onChange={(event) => setHistorySearch(event.target.value)}
                      placeholder="Search by name, reference, recipient, or status"
                      className="navbar-glass h-10 rounded-xl bg-white/70"
                    />
                    <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                      <Select value={historyStatusFilter} onValueChange={(value: 'all' | 'signed' | 'unsigned') => setHistoryStatusFilter(value)}>
                        <SelectTrigger className="navbar-glass h-10 rounded-xl bg-white/70 text-sm">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent className="navbar-glass">
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="signed">Signed</SelectItem>
                          <SelectItem value="unsigned">Unsigned</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select value={historySourceFilter} onValueChange={(value: 'all' | 'upload' | 'generated') => setHistorySourceFilter(value)}>
                        <SelectTrigger className="navbar-glass h-10 rounded-xl bg-white/70 text-sm">
                          <SelectValue placeholder="Source" />
                        </SelectTrigger>
                        <SelectContent className="navbar-glass">
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="generated">Generated</SelectItem>
                          <SelectItem value="upload">Uploads</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select value={historyEmailFilter} onValueChange={(value: 'all' | 'sent' | 'pending' | 'failed') => setHistoryEmailFilter(value)}>
                        <SelectTrigger className="navbar-glass h-10 rounded-xl bg-white/70 text-sm">
                          <SelectValue placeholder="Email" />
                        </SelectTrigger>
                        <SelectContent className="navbar-glass">
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="sent">Sent</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="failed">Failed</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select value={historyAccessFilter} onValueChange={(value: 'all' | RecipientAccessLevel) => setHistoryAccessFilter(value)}>
                        <SelectTrigger className="navbar-glass h-10 rounded-xl bg-white/70 text-sm">
                          <SelectValue placeholder="Access" />
                        </SelectTrigger>
                        <SelectContent className="navbar-glass">
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="view">View</SelectItem>
                          <SelectItem value="comment">Comment</SelectItem>
                          <SelectItem value="edit">Edit</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select value={historyDateFilter} onValueChange={(value: 'all' | '7d' | '30d' | '90d') => setHistoryDateFilter(value)}>
                        <SelectTrigger className="navbar-glass h-10 rounded-xl bg-white/70 text-sm">
                          <SelectValue placeholder="Date" />
                        </SelectTrigger>
                        <SelectContent className="navbar-glass">
                          <SelectItem value="all">All time</SelectItem>
                          <SelectItem value="7d">Last 7 days</SelectItem>
                          <SelectItem value="30d">Last 30 days</SelectItem>
                          <SelectItem value="90d">Last 90 days</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select value={historySort} onValueChange={(value: 'newest' | 'oldest') => setHistorySort(value)}>
                        <SelectTrigger className="navbar-glass h-10 rounded-xl bg-white/70 text-sm">
                          <SelectValue placeholder="Sort" />
                        </SelectTrigger>
                        <SelectContent className="navbar-glass">
                          <SelectItem value="newest">Newest</SelectItem>
                          <SelectItem value="oldest">Oldest</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-slate-50 px-3 py-1 font-medium text-slate-700">Records {standardHistory.length}</span>
                      <span className="rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700">Signed {standardHistory.filter((item) => Boolean(item.recipientSignedAt)).length}</span>
                      <span className="rounded-full bg-sky-50 px-3 py-1 font-medium text-sky-700">Uploads {standardHistory.filter((item) => item.documentSourceType === 'uploaded_pdf').length}</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {paginatedHistory.map((item) => {
                    const sourceLabel = item.documentSourceType === 'uploaded_pdf' ? 'Upload' : 'Generated';
                    const emailStatus = item.emailStatus || (item.emailSent ? 'sent' : 'pending');
                    const signed = Boolean(item.recipientSignedAt);
                    const partiallySigned = !signed && (item.recipientSigners || []).some((s: any) => s.signingStatus === 'signed');
                    const requiredSignerKeys = (() => {
                      const placements = item.recipientSignaturePlacements;
                      if (!placements || (placements as any).mode !== 'boxes' || !Array.isArray((placements as any).boxes)) return [];
                      const requiredBoxes = (placements as any).boxes.filter((b: any) => (b as any).required !== false);
                      return Array.from(new Set(requiredBoxes.map((b: any) => String((b as any)?.signerKey || 'recipient').trim() || 'recipient')));
                    })();
                    const signerSignedCount = requiredSignerKeys.filter((key) => (item.recipientSigners || []).some((s: any) => s.signerKey === key && s.signingStatus === 'signed')).length;
                    const trackedSummary = item.referenceNumber ? historySummaryByReference.get(item.referenceNumber) : undefined;
                    const summary = trackedSummary || {
                      id: item.id,
                      templateName: item.templateName,
                      referenceNumber: item.referenceNumber || '',
                      openCount: 0,
                      downloadCount: 0,
                      editCount: 0,
                      commentCount: 0,
                      reviewCount: 0,
                      signCount: signed ? 1 : 0,
                      uniqueDevices: [],
                      latestActivityAt: item.recipientSignedAt || item.generatedAt,
                      latestActivityLabel: signed ? 'signature completed' : 'generated',
                    };
                    const hasMap = Boolean(buildGoogleMapsLink(item.recipientSignedLatitude, item.recipientSignedLongitude));

                    return (
                      <details
                        key={item.id}
                        className="group rounded-[1.25rem] border border-white/70 bg-white/82 p-4 shadow-sm"
                      >
                        <summary className="flex cursor-pointer list-none flex-col gap-3 [&::-webkit-details-marker]:hidden lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="max-w-[40ch] truncate text-sm font-semibold text-slate-950">{item.templateName}</p>
                              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">{sourceLabel}</span>
                              <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${signed ? 'bg-emerald-100 text-emerald-800' : partiallySigned ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-700'}`}>
                                {signed ? 'Signed' : partiallySigned ? 'Partially Signed' : 'Un-signed'}
                              </span>
                              {requiredSignerKeys.length ? (
                                <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">
                                  Signers {signerSignedCount}/{requiredSignerKeys.length}
                                </span>
                              ) : null}
                              <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${emailStatus === 'sent' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-900'}`}>
                                Email {emailStatus}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                              <span className="font-medium text-slate-700">{item.referenceNumber}</span>
                              <span>•</span>
                              <span>{new Date(item.generatedAt).toLocaleString()}</span>
                              {item.emailTo ? <><span>•</span><span className="truncate">To {item.emailTo}</span></> : null}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                            <Button size="sm" className="rounded-full" onClick={(event) => { event.preventDefault(); openDocumentLink(item); }}>
                              <Link2 className="w-4 h-4 mr-2" />Open
                            </Button>

                            <DropdownMenu.Root>
                              <DropdownMenu.Trigger asChild>
                                <Button variant="outline" size="sm" className="rounded-full" onClick={(event) => event.preventDefault()}>
                                  <MoreHorizontal className="h-4 w-4 mr-2" />
                                  Actions
                                  <ChevronDown className="ml-2 h-4 w-4 text-slate-600" />
                                </Button>
                              </DropdownMenu.Trigger>
                              <DropdownMenu.Content
                                align="end"
                                className="z-[120] mt-2 w-64 rounded-2xl border border-white/90 bg-white/95 p-1 shadow-[0_18px_45px_rgba(15,23,42,0.18)] backdrop-blur-xl"
                              >
                                {item.documentSourceType === 'uploaded_pdf' && item.recipientSignaturePlacements?.mode === 'boxes' ? (
                                  <DropdownMenu.Item
                                    onSelect={() => setSigningStatusEntry(item)}
                                    className="flex cursor-pointer select-none items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 outline-none transition hover:bg-slate-100"
                                  >
                                    <History className="h-4 w-4 text-slate-500" />
                                    Signing status
                                  </DropdownMenu.Item>
                                ) : null}

                                {!signed && item.documentSourceType === 'uploaded_pdf' && item.recipientSignaturePlacements?.mode === 'boxes' ? (
                                  <DropdownMenu.Item
                                    disabled={isSendingSignerLinks}
                                    onSelect={() => { void sendSigningLinks(item); }}
                                    className={`flex select-none items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium outline-none transition ${
                                      isSendingSignerLinks ? 'cursor-not-allowed text-slate-400' : 'cursor-pointer text-slate-700 hover:bg-slate-100'
                                    }`}
                                  >
                                    <Mail className="h-4 w-4 text-slate-500" />
                                    Send signing links
                                  </DropdownMenu.Item>
                                ) : null}

                                {signed ? (
                                  <>
                                    <DropdownMenu.Item
                                      disabled={!item.sharePassword || isGeneratingPdf}
                                      onSelect={() => { void downloadSignedHistoryPdf(item); }}
                                      className={`flex select-none items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium outline-none transition ${
                                        !item.sharePassword || isGeneratingPdf ? 'cursor-not-allowed text-slate-400' : 'cursor-pointer text-slate-700 hover:bg-slate-100'
                                      }`}
                                    >
                                      <Download className="h-4 w-4 text-slate-500" />
                                      Download signed PDF
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Item
                                      disabled={!item.sharePassword || isGeneratingPdf}
                                      onSelect={() => { void downloadSignatureReceiptPdf(item); }}
                                      className={`flex select-none items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium outline-none transition ${
                                        !item.sharePassword || isGeneratingPdf ? 'cursor-not-allowed text-slate-400' : 'cursor-pointer text-slate-700 hover:bg-slate-100'
                                      }`}
                                    >
                                      <Download className="h-4 w-4 text-slate-500" />
                                      Download signature receipt
                                    </DropdownMenu.Item>
                                  </>
                                ) : null}

                                {hasMap ? (
                                  <DropdownMenu.Item
                                    onSelect={() => {
                                      const url = buildGoogleMapsLink(item.recipientSignedLatitude, item.recipientSignedLongitude);
                                      if (url) window.open(url, '_blank', 'noopener,noreferrer');
                                    }}
                                    className="flex cursor-pointer select-none items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 outline-none transition hover:bg-slate-100"
                                  >
                                    <Eye className="h-4 w-4 text-slate-500" />
                                    Verify location
                                  </DropdownMenu.Item>
                                ) : null}

                                <DropdownMenu.Separator className="my-1 h-px bg-slate-200/70" />

                                <DropdownMenu.Item
                                  onSelect={() => reuseHistoryItem(item)}
                                  className="flex cursor-pointer select-none items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 outline-none transition hover:bg-slate-100"
                                >
                                  <RefreshCw className="h-4 w-4 text-slate-500" />
                                  Reuse
                                </DropdownMenu.Item>
                                <DropdownMenu.Item
                                  onSelect={() => { void copyDocumentLink(item); }}
                                  className="flex cursor-pointer select-none items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 outline-none transition hover:bg-slate-100"
                                >
                                  <Copy className="h-4 w-4 text-slate-500" />
                                  Copy link
                                </DropdownMenu.Item>
                                <DropdownMenu.Item
                                  onSelect={() => openEmailComposer(item)}
                                  className="flex cursor-pointer select-none items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 outline-none transition hover:bg-slate-100"
                                >
                                  <Mail className="h-4 w-4 text-slate-500" />
                                  Email
                                </DropdownMenu.Item>
                                <DropdownMenu.Item
                                  onSelect={() => shareByWhatsApp(item)}
                                  className="flex cursor-pointer select-none items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 outline-none transition hover:bg-slate-100"
                                >
                                  <Share2 className="h-4 w-4 text-slate-500" />
                                  WhatsApp
                                </DropdownMenu.Item>
                              </DropdownMenu.Content>
                            </DropdownMenu.Root>
                          </div>
                        </summary>

                        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                          <div className="lg:col-span-2 rounded-[1.15rem] border border-white/70 bg-white/70 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Document summary</p>
                            <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-slate-500">Reference</span>
                                <span className="font-medium text-slate-900">{item.referenceNumber || 'Pending'}</span>
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-slate-500">Source</span>
                                <span className="font-medium text-slate-900">{sourceLabel}</span>
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-slate-500">Created</span>
                                <span className="font-medium text-slate-900">{new Date(item.generatedAt).toLocaleString()}</span>
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-slate-500">Recipient</span>
                                <span className="font-medium text-slate-900">{item.emailTo || 'Not set'}</span>
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-slate-500">Access</span>
                                <span className="font-medium text-slate-900">{item.recipientAccess || 'comment'}</span>
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-slate-500">Email</span>
                                <span className="font-medium text-slate-900">{emailStatus}</span>
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-slate-500">Signature</span>
                                <span className="font-medium text-slate-900">{item.signatureName || (signed ? 'Recorded' : 'Not recorded')}</span>
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-slate-500">Required docs</span>
                                <span className="font-medium text-slate-900">
                                  {item.requiredDocumentWorkflowEnabled ? ((item.requiredDocuments || []).join(', ') || 'Enabled') : 'Not required'}
                                </span>
                              </div>
                            </div>
                            {item.requiredDocumentWorkflowEnabled ? (
                              <p className="mt-3 text-xs text-slate-600">Verification {item.documentsVerificationStatus || 'pending'}</p>
                            ) : null}
                          </div>

                          <div className="rounded-[1.15rem] border border-white/70 bg-white/70 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Delivery</p>
                            <div className="mt-3 grid gap-2 text-sm text-slate-700">
                              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-slate-500">Generated by</span><span className="font-medium text-slate-900">{item.generatedBy || 'unknown'}</span></div>
                              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-slate-500">Recipient access</span><span className="font-medium text-slate-900">{item.recipientAccess || 'comment'}</span></div>
                              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-slate-500">Email</span><span className="font-medium text-slate-900">{emailStatus}{item.emailTo ? ` · ${item.emailTo}` : ''}</span></div>
                              {item.uploadedPdfFileName ? (
                                <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-slate-500">Uploaded file</span><span className="font-medium text-slate-900">{item.uploadedPdfFileName}</span></div>
                              ) : null}
                            </div>
                          </div>

                          <div className="rounded-[1.15rem] border border-white/70 bg-white/70 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Security and Signing</p>
                            <div className="mt-3 grid gap-2 text-sm text-slate-700">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-slate-500">Signing password</span>
                                <div className="flex items-center gap-2">
                                  <span className="rounded-lg bg-white/80 px-2 py-1 font-mono text-xs text-slate-900">{item.sharePassword || 'Pending'}</span>
                                  <Button type="button" size="sm" variant="outline" onClick={() => void copySigningPassword(item.sharePassword)} disabled={!item.sharePassword}>Copy</Button>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-slate-500">Signature</span><span className="font-medium text-slate-900">{item.signatureName || (signed ? 'Recorded' : 'Not recorded')}</span></div>
                              {signed ? (
                                <div className="flex flex-col gap-1 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                                  <span className="font-medium">Signed {item.recipientSignedAt ? new Date(item.recipientSignedAt).toLocaleString() : ''}</span>
                                  <span className="text-emerald-800/80 text-xs">IP {item.recipientSignedIp || 'unknown'}</span>
                                </div>
                              ) : null}
                              {item.recipientSignedAt ? (
                                <div className="text-xs text-slate-500">
                                  Location {formatSignatureLocation({
                                    label: item.recipientSignedLocationLabel,
                                    latitude: item.recipientSignedLatitude,
                                    longitude: item.recipientSignedLongitude,
                                    accuracyMeters: item.recipientSignedAccuracyMeters,
                                  })}
                                </div>
                              ) : null}
                              {item.requiredDocumentWorkflowEnabled ? (
                                <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-slate-500">Required docs</span><span className="font-medium text-slate-900">{(item.requiredDocuments || []).join(', ') || 'Enabled'}</span></div>
                              ) : (
                                <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-slate-500">Required docs</span><span className="font-medium text-slate-900">Not required</span></div>
                              )}
                              {item.requiredDocumentWorkflowEnabled ? (
                                <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-slate-500">Verification</span><span className="font-medium text-slate-900">{item.documentsVerificationStatus || 'pending'}</span></div>
                              ) : null}
                            </div>
                          </div>

                          <div className="lg:col-span-2 rounded-[1.15rem] border border-white/70 bg-white/70 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Tracking</p>
                              {!trackedSummary ? <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">No activity yet</span> : null}
                            </div>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                              <div className="rounded-xl bg-orange-50 p-3"><p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Opens</p><p className="mt-1 font-semibold text-slate-900">{summary.openCount}</p></div>
                              <div className="rounded-xl bg-orange-50 p-3"><p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Downloads</p><p className="mt-1 font-semibold text-slate-900">{summary.downloadCount}</p></div>
                              <div className="rounded-xl bg-orange-50 p-3"><p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Edits</p><p className="mt-1 font-semibold text-slate-900">{summary.editCount}</p></div>
                              <div className="rounded-xl bg-orange-50 p-3"><p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Comments</p><p className="mt-1 font-semibold text-slate-900">{summary.commentCount}</p></div>
                              <div className="rounded-xl bg-orange-50 p-3"><p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Reviews</p><p className="mt-1 font-semibold text-slate-900">{summary.reviewCount}</p></div>
                              <div className="rounded-xl bg-orange-50 p-3"><p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Signed</p><p className="mt-1 font-semibold text-slate-900">{summary.signCount}</p></div>
                            </div>
                            {summary.latestActivityAt ? (
                              <p className="mt-3 text-xs text-slate-600">Latest activity {new Date(summary.latestActivityAt).toLocaleString()} {summary.latestActivityLabel ? `· ${summary.latestActivityLabel}` : ''}</p>
                            ) : null}
                          </div>
                        </div>
                      </details>
                    );
                  })}

                  {filteredHistory.length === 0 ? (
                    <p className="text-sm text-slate-500">No history records match this search.</p>
                  ) : null}

                  {filteredHistory.length > HISTORY_PAGE_SIZE && (
                    <div className="flex items-center justify-end gap-2 pt-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setHistoryPage((prev) => Math.max(1, prev - 1))} disabled={historyPage === 1}>Previous</Button>
                      <span className="text-sm text-slate-500">Page {historyPage} of {historyPageCount}</span>
                      <Button type="button" variant="outline" size="sm" onClick={() => setHistoryPage((prev) => Math.min(historyPageCount, prev + 1))} disabled={historyPage === historyPageCount}>Next</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
	            </TabsContent>

              <Dialog open={emailDialogOpen} onOpenChange={(open) => { setEmailDialogOpen(open); if (!open) setEmailTargetEntry(null); }}>
                <DialogContent className="max-w-2xl">
                  <DialogHeader><DialogTitle>Send document via email</DialogTitle></DialogHeader>
                  {emailTargetEntry ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-950">{emailTargetEntry.templateName}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {emailTargetEntry.referenceNumber ? `Ref ${emailTargetEntry.referenceNumber}` : 'Reference pending'}
                            {' · '}
                            {emailTargetEntry.recipientSignatureRequired ? 'Signature requested' : 'No signature required'}
                          </p>
                        </div>
                        {emailTargetEntry.sharePassword ? (
                          <span className="rounded-full bg-white/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-700">
                            Password: {emailTargetEntry.sharePassword}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-3 text-xs text-slate-500">Email includes secure link, document details, and signing steps (if required). PDF is attached when available.</p>
                    </div>
                  ) : null}
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium">To</label>
                      <Input value={emailData.to} onChange={(event) => setEmailData((prev) => ({ ...prev, to: event.target.value }))} placeholder="recipient@company.com, finance@company.com" />
                      <p className="mt-1 text-xs text-slate-500">Add multiple recipients using commas or new lines.</p>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Subject</label>
                      <Input value={emailData.subject} onChange={(event) => setEmailData((prev) => ({ ...prev, subject: event.target.value }))} placeholder="Document subject" />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Sender note (optional)</label>
                      <RichTextEditor value={emailData.note} onChange={(nextValue) => setEmailData((prev) => ({ ...prev, note: nextValue }))} />
                      <p className="mt-1 text-xs text-slate-500">Your note appears at the top of the email.</p>
                    </div>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <Button variant="outline" onClick={() => setEmailDialogOpen(false)}>Cancel</Button>
                      <Button onClick={() => void sendEmail()} disabled={isSendingEmail || !emailTargetEntry || !emailData.to.trim() || !emailData.subject.trim()}>
                        {isSendingEmail ? 'Sending...' : 'Send Email'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

            {isPlatformFeatureEnabled('docsheet') && (
            <TabsContent value="docsheet" className="space-y-6">
              <DocSheetCenter history={history} onHistoryRefresh={fetchHistory} />
            </TabsContent>
            )}

            {isClient && hasClientFeature('client_portal') && (
              <TabsContent value="client-portal" className="space-y-6">
                <ClientPortal />
              </TabsContent>
            )}

            {isClient && (
              <TabsContent value="business-settings" className="space-y-6">
                <BusinessSettingsCenter />
              </TabsContent>
            )}

            {isEmployee && (
              <TabsContent value="employee-portal" className="space-y-6">
                <EmployeePortal />
              </TabsContent>
            )}

	          </Tabs>
	        </main>
	      </div>

      <TemplateStudioDialog
        open={templateStudioOpen}
        onOpenChange={setTemplateStudioOpen}
        onCreated={(created) => {
          // Refresh templates and jump straight into document creation using the new template.
          void fetchTemplates().then(() => {
            handleTemplateSelect(created);
            setActiveTab('generate');
          });
        }}
      />

      {/* ── Premium Mobile Bottom Navigation (portalled to body to escape overflow:hidden) ── */}
      {isMounted && createPortal(
      <nav
        className="md:hidden"
        aria-label="Quick navigation"
        style={{
          position: 'fixed',
          left: 12,
          right: 12,
          bottom: 12,
          zIndex: 9999,
          paddingTop: 22,
        }}
      >
        {/* Ambient glow blobs */}
        <div aria-hidden style={{ position: 'absolute', top: 0, left: '10%', width: 100, height: 32, borderRadius: '50%', background: 'rgba(56,189,248,0.18)', filter: 'blur(20px)', pointerEvents: 'none' }} />
        <div aria-hidden style={{ position: 'absolute', top: 0, right: '10%', width: 100, height: 32, borderRadius: '50%', background: 'rgba(139,92,246,0.14)', filter: 'blur(20px)', pointerEvents: 'none' }} />

        {/* Glass pill */}
        <div
          style={{
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
          }}
        >
          {/* Left 2 items */}
          {mobileBottomActions.slice(0, 2).map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => attemptOpenTab(item.id)}
                aria-label={item.label}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 5,
                  borderRadius: 20,
                  padding: '8px 4px',
                  border: 'none',
                  cursor: 'pointer',
                  position: 'relative',
                  background: active ? 'rgba(255,255,255,0.92)' : 'transparent',
                  boxShadow: active ? '0 4px 14px rgba(15,23,42,0.10),inset 0 1px 0 rgba(255,255,255,0.95)' : 'none',
                  transition: 'transform 200ms ease,box-shadow 200ms ease',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.45)'; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                onTouchStart={(e) => { e.currentTarget.style.transform = 'scale(0.88)'; }}
                onTouchEnd={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              >
                {active && (
                  <span style={{ position: 'absolute', inset: 0, borderRadius: 20, background: 'rgba(255,255,255,0.92)', boxShadow: '0 4px 14px rgba(15,23,42,0.10),inset 0 1px 0 rgba(255,255,255,0.95)', zIndex: 0 }} />
                )}
                <span style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 14, transition: 'transform 220ms cubic-bezier(0.34,1.56,0.64,1)' }}>
                  <item.icon style={{ width: 18, height: 18, color: active ? '#1e293b' : '#94a3b8', flexShrink: 0 }} />
                </span>
                {active && <span style={{ position: 'relative', zIndex: 1, width: 3, height: 3, borderRadius: '50%', background: '#475569' }} />}
                <span style={{ position: 'relative', zIndex: 1, fontSize: 9, fontWeight: 600, letterSpacing: '0.04em', lineHeight: 1, color: active ? '#1e293b' : '#94a3b8', maxWidth: 52, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {item.label}
                </span>
              </button>
            );
          })}

          {/* Center Search Orb */}
          <div style={{ position: 'relative', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: -22, marginLeft: 4, marginRight: 4 }}>
            {/* Pulse ring */}
            <span
              className="search-orb-pulse"
              aria-hidden
              style={{ position: 'absolute', top: 0, left: 0, width: 60, height: 60, borderRadius: 18, border: '1.5px solid rgba(51,65,85,0.30)', pointerEvents: 'none' }}
            />
            <button
              type="button"
              onClick={() => globalSearchBarRef.current?.open()}
              aria-label="Ask me anything — search"
              style={{
                width: 60,
                height: 60,
                borderRadius: 18,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(145deg,#334155 0%,#0f172a 100%)',
                boxShadow: '0 14px 32px rgba(15,23,42,0.48),0 4px 10px rgba(15,23,42,0.22),inset 0 1px 0 rgba(255,255,255,0.14),inset 0 -1px 0 rgba(0,0,0,0.22)',
                position: 'relative',
                transition: 'transform 220ms cubic-bezier(0.34,1.56,0.64,1),box-shadow 220ms ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08) translateY(-2px)'; e.currentTarget.style.boxShadow = '0 20px 42px rgba(15,23,42,0.56),0 6px 14px rgba(15,23,42,0.28),inset 0 1px 0 rgba(255,255,255,0.18)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1) translateY(0)'; e.currentTarget.style.boxShadow = '0 14px 32px rgba(15,23,42,0.48),0 4px 10px rgba(15,23,42,0.22),inset 0 1px 0 rgba(255,255,255,0.14),inset 0 -1px 0 rgba(0,0,0,0.22)'; }}
              onTouchStart={(e) => { e.currentTarget.style.transform = 'scale(0.90)'; }}
              onTouchEnd={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              {/* Specular gloss */}
              <span aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: 18, background: 'linear-gradient(145deg,rgba(255,255,255,0.12) 0%,transparent 55%)', pointerEvents: 'none' }} />
              <Search style={{ width: 22, height: 22, color: '#ffffff', position: 'relative', zIndex: 1, flexShrink: 0 }} />
            </button>
            <span style={{ marginTop: 6, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b' }}>
              Search
            </span>
          </div>

          {/* Right 2 items */}
          {mobileBottomActions.slice(2, 4).map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => attemptOpenTab(item.id)}
                aria-label={item.label}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 5,
                  borderRadius: 20,
                  padding: '8px 4px',
                  border: 'none',
                  cursor: 'pointer',
                  position: 'relative',
                  background: active ? 'rgba(255,255,255,0.92)' : 'transparent',
                  boxShadow: active ? '0 4px 14px rgba(15,23,42,0.10),inset 0 1px 0 rgba(255,255,255,0.95)' : 'none',
                  transition: 'transform 200ms ease,box-shadow 200ms ease',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.45)'; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                onTouchStart={(e) => { e.currentTarget.style.transform = 'scale(0.88)'; }}
                onTouchEnd={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              >
                {active && (
                  <span style={{ position: 'absolute', inset: 0, borderRadius: 20, background: 'rgba(255,255,255,0.92)', boxShadow: '0 4px 14px rgba(15,23,42,0.10),inset 0 1px 0 rgba(255,255,255,0.95)', zIndex: 0 }} />
                )}
                <span style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 14, transition: 'transform 220ms cubic-bezier(0.34,1.56,0.64,1)' }}>
                  <item.icon style={{ width: 18, height: 18, color: active ? '#1e293b' : '#94a3b8', flexShrink: 0 }} />
                </span>
                {active && <span style={{ position: 'relative', zIndex: 1, width: 3, height: 3, borderRadius: '50%', background: '#475569' }} />}
                <span style={{ position: 'relative', zIndex: 1, fontSize: 9, fontWeight: 600, letterSpacing: '0.04em', lineHeight: 1, color: active ? '#1e293b' : '#94a3b8', maxWidth: 52, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
      , document.body)}
      <Dialog open={feedbackPromptOpen} onOpenChange={setFeedbackPromptOpen}>
        <DialogContent className="max-w-2xl rounded-[1.6rem] border border-white/80 bg-white/96 shadow-[0_28px_80px_rgba(15,23,42,0.18)] backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-semibold tracking-tight text-slate-950">Help us make docrud better for your daily work</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <p className="text-sm leading-6 text-slate-600">
              We ask for product feedback every few days so the workspace improves based on real usage, not guesses. Your answers help the super admin identify friction, prioritize improvements, and ship better features faster.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-900">How is docrud working for you right now?</label>
                <Select value={feedbackForm.rating} onValueChange={(value) => setFeedbackForm((prev) => ({ ...prev, rating: value }))}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 - Excellent</SelectItem>
                    <SelectItem value="4">4 - Good</SelectItem>
                    <SelectItem value="3">3 - Okay</SelectItem>
                    <SelectItem value="2">2 - Frustrating</SelectItem>
                    <SelectItem value="1">1 - Poor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-900">Most used area this week</label>
                <Input value={(activeTab || 'workspace').replace(/-/g, ' ')} readOnly className="rounded-xl bg-slate-50 capitalize" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-900">In one line, how would you describe your current experience?</label>
              <textarea
                value={feedbackForm.summary}
                onChange={(event) => setFeedbackForm((prev) => ({ ...prev, summary: event.target.value }))}
                className="min-h-[84px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                placeholder="Example: Very useful for document work, but mobile navigation still needs to be simpler."
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-900">What is slowing you down or causing friction?</label>
              <textarea
                value={feedbackForm.painPoints}
                onChange={(event) => setFeedbackForm((prev) => ({ ...prev, painPoints: event.target.value }))}
                className="min-h-[104px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                placeholder="Tell us what feels confusing, slow, cluttered, missing, or hard to trust."
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-900">What should we improve next?</label>
              <textarea
                value={feedbackForm.requestedImprovements}
                onChange={(event) => setFeedbackForm((prev) => ({ ...prev, requestedImprovements: event.target.value }))}
                className="min-h-[104px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                placeholder="Share the feature, improvement, or workflow change that would make docrud more valuable for you."
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setFeedbackPromptOpen(false)}>
                Remind me later
              </Button>
              <Button type="button" className="rounded-xl bg-slate-950 text-white hover:bg-slate-800" onClick={() => void submitWorkspaceFeedback()} disabled={feedbackSubmitting}>
                {feedbackSubmitting ? 'Saving feedback...' : 'Submit feedback'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <WorkspaceTour
        open={tourOpen}
        title={activeTourTitle}
        summary={activeTourSummary}
        steps={activeTourSteps}
        currentStepIndex={tourStepIndex}
        onClose={closeTour}
        onPrevious={() => setTourStepIndex((current) => Math.max(0, current - 1))}
        onNext={() => setTourStepIndex((current) => Math.min(activeTourSteps.length - 1, current + 1))}
        onFinish={finishTour}
      />
      <ShareLinkModal
        open={shareLinkModalOpen}
        onClose={() => setShareLinkModalOpen(false)}
        currentEntry={currentHistoryEntry ?? null}
        history={esignLinkHistory}
        shareAccessPolicy={shareAccessPolicy}
        setShareAccessPolicy={setShareAccessPolicy}
        shareExpiryDays={shareExpiryDays}
        setShareExpiryDays={setShareExpiryDays}
        maxAccessCount={maxAccessCount}
        setMaxAccessCount={setMaxAccessCount}
        onOpenLink={openDocumentLink}
        onCopyLink={copyDocumentLink}
        onEmail={openEmailComposer}
        onWhatsApp={shareByWhatsApp}
      />
      <DocumentVisualizerModal
        open={showVisualizerModal}
        onClose={() => setShowVisualizerModal(false)}
        initialContent={generatedHtml || currentHistoryEntry?.previewHtml || ''}
        initialTitle={selectedTemplate?.name || currentHistoryEntry?.templateName}
      />
    </div>
  );
}
