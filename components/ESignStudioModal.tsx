'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import type { RecipientSignatureBoxPlacement } from '@/types/document';
import { PdfSignatureBoxEditor } from '@/components/PdfSignatureBoxEditor';
import { renderDocumentTemplate } from '@/lib/template';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileCheck2,
  FileSignature,
  FileText,
  History,
  Info,
  Link2,
  Loader2,
  Lock,
  Mail,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldCheck,
  Upload,
  Users,
  X,
  Zap,
} from 'lucide-react';
import InfinityUpgradeModal from '@/components/InfinityUpgradeModal';

/* ─── types ─────────────────────────────────────────────────────────── */
interface Template {
  id: string;
  name: string;
  description?: string;
  category?: string;
  template?: string; // HTML body with {{placeholders}}
  fields: Array<{
    id: string;
    name: string;
    label: string;
    type: string;
    required?: boolean;
    options?: string[];
  }>;
  isCustom?: boolean;
  renderSettings?: Record<string, unknown>;
}

interface SignatureRecord {
  id: string;
  signerName: string;
  signerRole: string;
}

interface HistoryEntry {
  id: string;
  templateName?: string;
  generatedAt: string;
  shareId?: string;
  shareUrl?: string;
  sharePassword?: string;
  shareAccessPolicy?: string;
  shareExpiresAt?: string;
  maxAccessCount?: number;
  accessCount?: number;
  recipientSignedAt?: string;
  documentSourceType?: string;
  referenceNumber?: string;
  recipientSigners?: Array<{
    signerKey: string;
    signerName?: string;
    signerEmail?: string;
    signingStatus: string;
    signedAt?: string;
    signedIp?: string;
    signedLocationLabel?: string;
    authenticationMethods?: string[];
    photoDataUrl?: string;
    photoCapturedAt?: string;
    consentedAt?: string;
    signatureSource?: string;
    signatureDataUrl?: string;
    signatureBoxSummary?: { totalBoxes: number; requiredBoxes: number; completedBoxes: number };
  }>;
}

type ESignStep = 'source' | 'signers' | 'configure' | 'send' | 'track';
const STEP_ORDER: ESignStep[] = ['source', 'signers', 'configure', 'send', 'track'];

interface SignerConfig {
  signerKey: string;
  signerName: string;
  signerEmail: string;
  signerRole: string;
  /* verification */
  emailOtpEnabled: boolean;
  cameraCaptureEnabled: boolean;
  consentRequired: boolean;
  signatureDrawEnabled: boolean;
  signatureUploadEnabled: boolean;
}

interface ESignStudioModalProps {
  open: boolean;
  onClose: () => void;
}

/* ─── helpers ────────────────────────────────────────────────────────── */
function formatRelative(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Math.max(0, Date.now() - date.getTime());
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  const sameDay = new Date().toDateString() === date.toDateString();
  if (sameDay) return `Today ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const STEP_LABELS: Record<ESignStep, string> = {
  source:    'Source',
  signers:   'Signers & Boxes',
  configure: 'Security',
  send:      'Send',
  track:     'Track',
};

/* ─── tiny UI primitives ─────────────────────────────────────────────── */
const inputCls =
  'h-10 w-full rounded-xl border border-white/[0.10] bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/20 focus:border-white/25 focus:outline-none transition';
const selectCls =
  'h-10 w-full rounded-xl border border-white/[0.10] bg-[#0D0D0F] px-3 text-sm text-white focus:border-white/25 focus:outline-none transition';

function Toggle({ label, sub, checked, onChange }: { label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={[
      'flex cursor-pointer select-none items-start justify-between gap-3 rounded-xl border px-4 py-3 transition',
      checked ? 'border-emerald-500/25 bg-emerald-500/[0.06]' : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05]',
    ].join(' ')}>
      <div className="min-w-0">
        <p className="text-[12px] sm:text-[13px] text-white leading-snug">{label}</p>
        {sub && <p className="mt-0.5 text-[11px] text-white/35">{sub}</p>}
      </div>
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <div className={['relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition', checked ? 'bg-emerald-500' : 'bg-white/[0.12]'].join(' ')}>
        <div className={['absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', checked ? 'left-4' : 'left-0.5'].join(' ')} />
      </div>
    </label>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-white/40">
          {label}
          {required && <span className="ml-1 text-rose-400">*</span>}
        </span>
        {hint && <span title={hint}><Info className="h-3 w-3 text-white/20" /></span>}
      </div>
      {children}
    </div>
  );
}

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-4">
      <div className="flex items-center gap-2.5">
        <span className="text-white/45">{icon}</span>
        <p className="text-sm font-semibold text-white">{title}</p>
      </div>
      {children}
    </div>
  );
}

function makeDefaultSigner(index: number): SignerConfig {
  return {
    signerKey: `signer_${index}`,
    signerName: '',
    signerEmail: '',
    signerRole: '',
    emailOtpEnabled: true,          // ON by default — core of the ask
    cameraCaptureEnabled: true,
    consentRequired: true,
    signatureDrawEnabled: true,
    signatureUploadEnabled: true,
  };
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════ */
export default function ESignStudioModal({ open, onClose }: ESignStudioModalProps) {
  useSession();

  /* ── navigation ── */
  const [step, setStep] = useState<ESignStep>('source');
  const stepIndex = STEP_ORDER.indexOf(step);
  const completedSet = new Set(STEP_ORDER.slice(0, stepIndex));

  /* ── source ── */
  const [sourceMode, setSourceMode] = useState<'upload' | 'template' | 'docword' | 'drive'>('template');
  const [uploadedFile, setUploadedFile] = useState<{ name: string; dataUrl: string; size: number } | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── templates ── */
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) || null;
  const [formData, setFormData] = useState<Record<string, string>>({});

  /* ── admin signatures ── */
  const [adminSigs, setAdminSigs] = useState<SignatureRecord[]>([]);
  const [selectedAdminSigId, setSelectedAdminSigId] = useState('none');

  /* ── signers ── */
  const [signerCount, setSignerCount] = useState(1);
  const [signers, setSigners] = useState<SignerConfig[]>([makeDefaultSigner(1)]);
  const [signingMode, setSigningMode] = useState<'parallel' | 'sequential'>('parallel');

  /* ── signature boxes (for uploaded PDF) ── */
  const [signatureBoxes, setSignatureBoxes] = useState<RecipientSignatureBoxPlacement[]>([]);
  /* signerDirectory for box editor: signerKey → {signerName, signerEmail} */
  const [signerDirectory, setSignerDirectory] = useState<Record<string, { signerName?: string; signerEmail?: string }>>({});

  /* ── template placement (for template mode) ── */
  const [placementMode, setPlacementMode] = useState<'last' | 'all' | 'pages'>('last');
  const [placementPosition, setPlacementPosition] = useState<'bottom_right' | 'bottom_left' | 'top_right' | 'top_left' | 'center'>('bottom_right');

  /* ── configure / security ── */
  const [designPreset, setDesignPreset] = useState('default');
  const [watermark, setWatermark] = useState('');
  const [sharePolicy, setSharePolicy] = useState<'standard' | 'expiring' | 'one_time'>('standard');
  const [expiryDays, setExpiryDays] = useState('7');
  const [maxOpens, setMaxOpens] = useState('1');
  const [recipientSignatureRequired, setRecipientSignatureRequired] = useState(true);
  const [certificateBranding, setCertificateBranding] = useState(true);
  const [receiptPage, setReceiptPage] = useState(true);
  const [dataCollectionEnabled, setDataCollectionEnabled] = useState(false);
  const [requiredDocsEnabled, setRequiredDocsEnabled] = useState(false);
  const [requiredDocsText, setRequiredDocsText] = useState('');
  const [recipientAccess, setRecipientAccess] = useState<'view' | 'comment' | 'edit'>('comment');

  /* ── send/track ── */
  const [shareUrl, setShareUrl] = useState('');
  const [sharePassword, setSharePassword] = useState('');
  const [passwordCopied, setPasswordCopied] = useState(false);
  /* Absolute URL for display/copy — relative paths from API get origin prepended */
  const absoluteShareUrl = shareUrl
    ? (shareUrl.startsWith('/') && typeof window !== 'undefined'
        ? `${window.location.origin}${shareUrl}`
        : shareUrl)
    : '';
  const [currentHistoryId, setCurrentHistoryId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [copied, setCopied] = useState(false);
  const [sendingLinks, setSendingLinks] = useState<Record<string, boolean>>({});
  const [linkStatus, setLinkStatus] = useState<Record<string, 'sent' | 'failed' | 'idle'>>({});
  const [showInfinityModal, setShowInfinityModal] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'signed' | 'pending' | 'expired'>('all');
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PAGE_SIZE = 8;
  const [analyticsEntry, setAnalyticsEntry] = useState<HistoryEntry | null>(null);

  /* ── History panel (standalone overlay) ── */
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  const [panelSearch, setPanelSearch] = useState('');
  const [panelFilter, setPanelFilter] = useState<'all' | 'signed' | 'pending' | 'expired'>('all');
  const [panelPage, setPanelPage] = useState(1);
  const PANEL_PAGE_SIZE = 10;

  /* ── drive source ── */
  const [selectedDriveEntry, setSelectedDriveEntry] = useState<HistoryEntry | null>(null);
  const [driveSearch, setDriveSearch] = useState('');

  /* ── misc ── */
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  /* ─────────────────────────────────────────── */
  /* Sync signers count                          */
  /* ─────────────────────────────────────────── */
  useEffect(() => {
    setSigners((prev) => {
      const next = [...prev];
      while (next.length < signerCount) next.push(makeDefaultSigner(next.length + 1));
      return next.slice(0, signerCount);
    });
  }, [signerCount]);

  /* Keep signerDirectory in sync with signers array */
  useEffect(() => {
    setSignerDirectory((prev) => {
      const next = { ...prev };
      signers.forEach((s) => {
        next[s.signerKey] = {
          signerName: s.signerName || next[s.signerKey]?.signerName || '',
          signerEmail: s.signerEmail || next[s.signerKey]?.signerEmail || '',
        };
      });
      return next;
    });
  }, [signers]);

  /* Propagate signerDirectory edits from box editor back into signers */
  const handleUpdateSignerDirectory = useCallback((key: string, patch: { signerName?: string; signerEmail?: string }) => {
    setSignerDirectory((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), ...patch } }));
    /* If the key matches an existing signer slot, update it there too */
    setSigners((prev) =>
      prev.map((s) => s.signerKey === key
        ? { ...s, ...(patch.signerName != null ? { signerName: patch.signerName } : {}), ...(patch.signerEmail != null ? { signerEmail: patch.signerEmail } : {}) }
        : s,
      ),
    );
  }, []);

  /* ─────────────────────────────────────────── */
  /* API fetches                                 */
  /* ─────────────────────────────────────────── */
  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const res = await fetch('/api/templates');
      if (res.ok) { const d = await res.json() as any; setTemplates(d.templates || []); }
    } finally { setTemplatesLoading(false); }
  }, []);

  const fetchAdminSigs = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/signature');
      if (res.ok) { const d = await res.json() as any; setAdminSigs(d.signatures || []); }
    } catch { /* ignore */ }
  }, []);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/history');
      if (res.ok) {
        const d = await res.json() as any;
        /* GET /api/history returns an array directly */
        const entries: HistoryEntry[] = Array.isArray(d) ? d : (d.history || []);
        setHistory(entries.filter((e) => e.shareId || e.shareUrl));
      }
    } finally { setHistoryLoading(false); }
  }, []);

  useEffect(() => {
    if (!open) return;
    void fetchTemplates();
    void fetchAdminSigs();
    void fetchHistory();
  }, [open, fetchTemplates, fetchAdminSigs, fetchHistory]);

  /* Reset on close */
  useEffect(() => {
    if (!open) {
      setStep('source');
      setError('');
      setSuccess('');
      setShareUrl('');
      setSharePassword('');
      setCurrentHistoryId('');
      setGenerateError('');
      setGenerating(false);
      setUploadedFile(null);
      setFormData({});
      setSignatureBoxes([]);
      setSignerDirectory({});
      setLinkStatus({});
      setAnalyticsEntry(null);
      setHistoryPage(1);
      setHistoryPanelOpen(false);
      setPanelSearch('');
      setPanelFilter('all');
      setPanelPage(1);
      setSelectedDriveEntry(null);
      setDriveSearch('');
    }
  }, [open]);

  /* ─────────────────────────────────────────── */
  /* File upload                                 */
  /* ─────────────────────────────────────────── */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') { setError('Please upload a PDF file.'); return; }
    setUploadLoading(true); setError('');
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      setUploadedFile({ name: file.name, dataUrl, size: file.size });
      setSignatureBoxes([]);
    } catch { setError('Failed to read file.'); }
    finally { setUploadLoading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  /* ─────────────────────────────────────────── */
  /* Generate document                           */
  /* ─────────────────────────────────────────── */
  const handleGenerate = async () => {
    setGenerating(true); setGenerateError(''); setSuccess('');
    try {
      /* Build signer configs & directory */
      const recipientSignerConfigsByKey: Record<string, any> = {};
      const recipientSignerDirectory: Record<string, any> = {};
      signers.forEach((s) => {
        recipientSignerConfigsByKey[s.signerKey] = {
          emailOtpEnabled:        s.emailOtpEnabled,
          cameraCaptureEnabled:   s.cameraCaptureEnabled,
          consentRequired:        s.consentRequired,
          signatureDrawEnabled:   s.signatureDrawEnabled,
          signatureUploadEnabled: s.signatureUploadEnabled,
        };
        recipientSignerDirectory[s.signerKey] = {
          signerKey:   s.signerKey,
          signerName:  s.signerName || signerDirectory[s.signerKey]?.signerName || '',
          signerEmail: s.signerEmail || signerDirectory[s.signerKey]?.signerEmail || '',
          signerRole:  s.signerRole,
        };
      });
      /* Pick up any signer keys that exist only in the box editor */
      Object.entries(signerDirectory).forEach(([key, val]) => {
        if (!recipientSignerDirectory[key]) {
          recipientSignerDirectory[key] = { signerKey: key, ...val };
          recipientSignerConfigsByKey[key] = { emailOtpEnabled: true, cameraCaptureEnabled: true, consentRequired: true, signatureDrawEnabled: true, signatureUploadEnabled: true };
        }
      });

      /* Signature placements (matches DocumentHistory.recipientSignaturePlacements shape) */
      const recipientSignaturePlacements = (sourceMode === 'upload' && signatureBoxes.length > 0)
        ? { mode: 'boxes' as const, version: 1 as const, boxes: signatureBoxes }
        : {
            mode: placementMode as 'last' | 'all' | 'pages',
            position: placementPosition,
            sizePct: 0.22,
            marginPct: 0.04,
          };

      /* Share expiry */
      const shareExpiresAt = sharePolicy === 'expiring'
        ? new Date(Date.now() + (parseInt(expiryDays) || 7) * 24 * 60 * 60 * 1000).toISOString()
        : undefined;

      /* Common fields */
      const common: Record<string, any> = {
        recipientAccess,
        recipientSignatureRequired,
        recipientSignaturePlacements,
        recipientSigningMode:          signingMode,
        recipientSignerConfigsByKey,
        recipientSignerDirectory,
        shareAccessPolicy:             sharePolicy,
        shareExpiresAt,
        maxAccessCount:                sharePolicy === 'one_time' ? (parseInt(maxOpens) || 1) : undefined,
        dataCollectionEnabled,
        dataCollectionStatus:          'disabled',
        requiredDocumentWorkflowEnabled: requiredDocsEnabled,
        requiredDocuments:             requiredDocsEnabled && requiredDocsText
          ? requiredDocsText.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined,
        editorState: {
          watermarkLabel:                           watermark || undefined,
          signatureCertificateBrandingEnabled:      certificateBranding,
          signatureReceiptCompletionPageEnabled:    receiptPage,
          designPreset,
        },
        automationNotes: ['E-Sign Studio workflow'],
      };

      let body: Record<string, any>;

      if (sourceMode === 'upload' && uploadedFile) {
        body = {
          ...common,
          documentSourceType:  'uploaded_pdf',
          templateId:          'uploaded-pdf',
          templateName:        uploadedFile.name.replace(/\.pdf$/i, '') || 'Uploaded PDF',
          category:            'Uploaded PDF',
          data:                {},
          uploadedPdfFileName: uploadedFile.name,
          uploadedPdfMimeType: 'application/pdf',
          uploadedPdfDataUrl:  uploadedFile.dataUrl,
        };
      } else if (sourceMode === 'template' && selectedTemplate) {
        const previewHtml = selectedTemplate.template
          ? renderDocumentTemplate(selectedTemplate as any, formData, {
              generatedBy: 'esign-studio',
              renderMode:  selectedTemplate.isCustom ? 'plain' : 'platform',
              designPreset: designPreset as any,
              watermarkLabel: watermark || undefined,
            })
          : undefined;
        body = {
          ...common,
          documentSourceType: 'template',
          templateId:         selectedTemplate.id,
          templateName:       selectedTemplate.name,
          category:           selectedTemplate.category || 'General',
          data:               formData,
          previewHtml,
          signatureId:        selectedAdminSigId !== 'none' ? selectedAdminSigId : undefined,
        };
      } else {
        throw new Error('Please select a document source before generating.');
      }

      const res = await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const entry = await res.json().catch(() => null);
      if (!res.ok || !entry) {
        throw new Error(entry?.error || 'Failed to create signing workflow');
      }

      setShareUrl(entry.shareUrl || `/documents/${entry.shareId || entry.id}`);
      setSharePassword(entry.sharePassword || '');
      setCurrentHistoryId(entry.id || '');
      setSuccess('Secure signing link created successfully.');
      void fetchHistory();
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Failed to generate document');
    } finally { setGenerating(false); }
  };

  /* ─────────────────────────────────────────── */
  /* Send signing link                           */
  /* ─────────────────────────────────────────── */
  const sendLink = async (signerKey: string) => {
    if (!currentHistoryId) return;
    setSendingLinks((p) => ({ ...p, [signerKey]: true }));
    try {
      const res = await fetch('/api/history/signers/send-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historyId: currentHistoryId, signerKey }),
      });
      const d = await res.json() as { error?: string; code?: string };
      if (res.status === 403 && d.code === 'INFINITY_REQUIRED') { setShowInfinityModal(true); return; }
      if (!res.ok) throw new Error(d.error || 'Failed');
      setLinkStatus((p) => ({ ...p, [signerKey]: 'sent' }));
    } catch {
      setLinkStatus((p) => ({ ...p, [signerKey]: 'failed' }));
    } finally { setSendingLinks((p) => ({ ...p, [signerKey]: false })); }
  };

  /* ─────────────────────────────────────────── */
  /* Guards                                      */
  /* ─────────────────────────────────────────── */
  const canLeaveSource = () => {
    if (sourceMode === 'upload')   return Boolean(uploadedFile);
    if (sourceMode === 'template') return Boolean(selectedTemplateId);
    if (sourceMode === 'drive')    return Boolean(selectedDriveEntry);
    return false;
  };

  const canLeaveSigners = () => {
    if (sourceMode === 'upload') {
      /* At least one signer must have email set */
      return signers.some((s) => s.signerEmail.trim());
    }
    return signers.every((s) => s.signerEmail.trim());
  };

  /* signerKeys for box editor = all defined signer keys */
  const signerKeys = signers.map((s) => s.signerKey);

  /* ─────────────────────────────────────────── */
  /* Track filter + pagination                   */
  /* ─────────────────────────────────────────── */
  /* ── Panel computed ── */
  const panelFiltered = [...history]
    .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())
    .filter((e) => {
      if (panelSearch) {
        const q = panelSearch.toLowerCase();
        if (!((e.templateName || '').toLowerCase().includes(q) || (e.referenceNumber || '').toLowerCase().includes(q))) return false;
      }
      const signed = Boolean(e.recipientSignedAt) || (e.recipientSigners || []).some((s) => s.signingStatus === 'signed');
      const expired = e.shareExpiresAt ? new Date(e.shareExpiresAt) < new Date() : false;
      if (panelFilter === 'signed')  return signed;
      if (panelFilter === 'pending') return !signed && !expired;
      if (panelFilter === 'expired') return expired;
      return true;
    });
  const panelTotalPages = Math.max(1, Math.ceil(panelFiltered.length / PANEL_PAGE_SIZE));
  const panelPaged = panelFiltered.slice((panelPage - 1) * PANEL_PAGE_SIZE, panelPage * PANEL_PAGE_SIZE);

  const sortedHistory = [...history].sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
  const filteredHistory = sortedHistory.filter((e) => {
    const signed = Boolean(e.recipientSignedAt) || (e.recipientSigners || []).some((s) => s.signingStatus === 'signed');
    const expired = e.shareExpiresAt ? new Date(e.shareExpiresAt) < new Date() : false;
    if (historyFilter === 'signed')  return signed;
    if (historyFilter === 'pending') return !signed && !expired;
    if (historyFilter === 'expired') return expired;
    return true;
  });
  const totalPages = Math.ceil(filteredHistory.length / HISTORY_PAGE_SIZE);
  const pagedHistory = filteredHistory.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE);

  if (!open) return null;

  /* ═══════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════ */
  return (
    <>
    {showInfinityModal && <InfinityUpgradeModal feature="esign" onClose={() => setShowInfinityModal(false)} />}
    <div className="fixed inset-0 z-[10000] flex flex-col overflow-hidden" style={{ background: '#08090a' }}>

      {/* ── ambient background ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-indigo-600/[0.06] blur-[140px]" />
        <div className="absolute right-0 bottom-1/4 h-[400px] w-[400px] rounded-full bg-emerald-600/[0.05] blur-[120px]" />
        <div className="absolute inset-0 opacity-35 [background-image:repeating-linear-gradient(135deg,rgba(148,163,184,0.04)_0,rgba(148,163,184,0.04)_120px,rgba(0,0,0,0)_120px,rgba(0,0,0,0)_260px)]" />
      </div>

      {/* ══════════════════════════════════════
          HEADER
      ══════════════════════════════════════ */}
      <header className="relative z-10 shrink-0 border-b border-white/[0.07] bg-[#0A0B0D]/80 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
          {/* Brand */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.10] bg-white/[0.06]">
              <FileSignature className="h-4 w-4 text-white/70" />
            </div>
            <div className="hidden sm:block">
              <p className="text-[13px] font-semibold tracking-[-0.025em] text-white leading-tight">E‑Sign Studio</p>
              <p className="text-[10px] text-white/30">Secure · Stepwise · OTP-verified</p>
            </div>
          </div>

          {/* Step pills */}
          <div className="flex flex-1 items-center justify-center gap-1 overflow-x-auto no-scrollbar px-1">
            {STEP_ORDER.map((s, i) => {
              const active = s === step;
              const done   = completedSet.has(s);
              const clickable = done || active;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={!clickable}
                  onClick={() => { if (clickable) setStep(s); }}
                  className={[
                    'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10.5px] font-semibold whitespace-nowrap transition-all duration-200 disabled:cursor-default',
                    active
                      ? 'bg-white text-slate-950 shadow-[0_4px_16px_rgba(255,255,255,0.18)]'
                      : done
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                        : 'bg-white/[0.05] text-white/30 border border-white/[0.07]',
                  ].join(' ')}
                >
                  {done && !active
                    ? <CheckCircle2 className="h-3 w-3 shrink-0" />
                    : <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-current text-[9px] font-bold">{i + 1}</span>
                  }
                  <span className="hidden sm:inline">{STEP_LABELS[s]}</span>
                </button>
              );
            })}
          </div>

          {/* History + Close buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => { setHistoryPanelOpen(true); void fetchHistory(); }}
              className="flex h-8 items-center gap-1.5 rounded-xl border border-white/[0.10] bg-white/[0.04] px-3 text-[11px] font-semibold text-white/50 transition hover:bg-white/[0.10] hover:text-white"
              aria-label="Document history"
            >
              <History className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">History</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.10] bg-white/[0.04] text-white/50 transition hover:bg-white/[0.10] hover:text-white"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════
          MAIN CONTENT
      ══════════════════════════════════════ */}
      <main className="relative z-10 flex-1 overflow-y-auto">
        <div className={[
          'mx-auto w-full px-4 py-6 sm:px-6 sm:py-8',
          /* Box editor needs full width */
          step === 'signers' && sourceMode === 'upload' ? 'max-w-none' : 'max-w-3xl',
        ].join(' ')}>

          {/* Global error/success */}
          {(error || success) && (
            <div className={[
              'mb-5 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm',
              error ? 'border-rose-500/20 bg-rose-500/[0.07] text-rose-300' : 'border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300',
            ].join(' ')}>
              {error ? <X className="h-4 w-4 mt-0.5 shrink-0" /> : <Check className="h-4 w-4 mt-0.5 shrink-0" />}
              <span className="flex-1">{error || success}</span>
              <button type="button" onClick={() => { setError(''); setSuccess(''); }} className="shrink-0 text-white/30 hover:text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* ══ STEP 1: SOURCE ═════════════════════════════════ */}
          {step === 'source' && (
            <div className="space-y-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/30">Step 1 of 5</p>
                <h2 className="mt-1 text-xl sm:text-2xl font-semibold tracking-[-0.04em] text-white leading-tight">Choose document source</h2>
                <p className="mt-1.5 text-sm text-white/40">Upload a PDF to place signature boxes precisely, or use a saved template.</p>
              </div>

              {/* Source mode cards */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {([
                  { id: 'template', icon: <FileText className="h-5 w-5" />, title: 'Use a Template', desc: 'Pick a saved template, fill fields, and generate a document ready for signing.' },
                  { id: 'upload',   icon: <Upload   className="h-5 w-5" />, title: 'Upload PDF',      desc: 'Upload any PDF and drag to place signature boxes exactly where needed.' },
                  { id: 'drive',    icon: <History  className="h-5 w-5" />, title: 'From Drive', desc: 'Select a recently shared document and resend it for signing without recreating it.' },
                  { id: 'docword',  icon: <PenLine  className="h-5 w-5" />, title: 'Create in DocWord', desc: 'Open DocWord in a new tab to draft a document from scratch, then return.' },
                ] as const).map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => { setSourceMode(card.id); if (card.id === 'docword') window.open('/docword?intent=esign&new=1', '_blank', 'noopener,noreferrer'); }}
                    className={[
                      'relative flex flex-col items-start rounded-[18px] border p-5 text-left transition-all duration-200',
                      sourceMode === card.id
                        ? 'border-white/25 bg-white/[0.07] shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_8px_32px_rgba(0,0,0,0.4)]'
                        : 'border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.05] hover:border-white/[0.12]',
                    ].join(' ')}
                  >
                    {sourceMode === card.id && (
                      <span className="absolute right-4 top-4 flex h-5 w-5 items-center justify-center rounded-full bg-white">
                        <Check className="h-3 w-3 text-slate-950" />
                      </span>
                    )}
                    <span className="mb-3 text-white/50">{card.icon}</span>
                    <p className="text-sm font-semibold text-white">{card.title}</p>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-white/40">{card.desc}</p>
                  </button>
                ))}
              </div>

              {/* Upload zone */}
              {sourceMode === 'upload' && (
                <div className="rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.02] p-6">
                  <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => void handleFileChange(e)} />
                  {uploadedFile ? (
                    <div className="flex items-center gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.08]">
                        <FileCheck2 className="h-5 w-5 text-emerald-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{uploadedFile.name}</p>
                        <p className="mt-0.5 text-xs text-white/35">{(uploadedFile.size / 1024).toFixed(0)} KB · PDF ready</p>
                      </div>
                      <button type="button" onClick={() => { setUploadedFile(null); setSignatureBoxes([]); }}
                        className="shrink-0 flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-white/40 hover:text-white transition">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4 py-6 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
                        {uploadLoading ? <Loader2 className="h-6 w-6 animate-spin text-white/40" /> : <Upload className="h-6 w-6 text-white/30" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">Drop your PDF here</p>
                        <p className="mt-1 text-xs text-white/30">PDF only · max 20 MB</p>
                      </div>
                      <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadLoading}
                        className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.06] px-5 text-sm font-semibold text-white transition hover:bg-white/[0.10] disabled:opacity-50">
                        <Upload className="h-3.5 w-3.5" /> Browse files
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Template picker */}
              {sourceMode === 'template' && (
                <div className="space-y-4">
                  <Field label="Select template" required>
                    <select className={selectCls} value={selectedTemplateId}
                      onChange={(e) => { setSelectedTemplateId(e.target.value); setFormData({}); }}>
                      <option value="">— choose a template —</option>
                      {templatesLoading ? <option disabled>Loading…</option>
                        : templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </Field>

                  {selectedTemplate && selectedTemplate.fields.length > 0 && (
                    <SectionCard title="Fill template fields" icon={<FileText className="h-4 w-4" />}>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {selectedTemplate.fields.map((f) => (
                          <Field key={f.id} label={f.label} required={f.required}>
                            {f.type === 'select' && f.options ? (
                              <select className={selectCls} value={formData[f.name] || ''} onChange={(e) => setFormData((p) => ({ ...p, [f.name]: e.target.value }))}>
                                <option value="">Select…</option>
                                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                              </select>
                            ) : f.type === 'textarea' ? (
                              <textarea rows={3} className="w-full resize-none rounded-xl border border-white/[0.10] bg-white/[0.04] p-3 text-sm text-white placeholder:text-white/20 focus:border-white/25 focus:outline-none"
                                placeholder={f.label} value={formData[f.name] || ''} onChange={(e) => setFormData((p) => ({ ...p, [f.name]: e.target.value }))} />
                            ) : (
                              <input type={f.type === 'email' ? 'email' : f.type === 'date' ? 'date' : 'text'} className={inputCls}
                                placeholder={f.label} value={formData[f.name] || ''} onChange={(e) => setFormData((p) => ({ ...p, [f.name]: e.target.value }))} />
                            )}
                          </Field>
                        ))}
                      </div>
                    </SectionCard>
                  )}
                </div>
              )}

              {sourceMode === 'docword' && (
                <div className="flex items-start gap-3 rounded-2xl border border-sky-500/20 bg-sky-500/[0.06] px-4 py-3">
                  <Info className="h-4 w-4 shrink-0 text-sky-400 mt-0.5" />
                  <p className="text-[12.5px] leading-relaxed text-white/55">DocWord opened in a new tab. Create your document, then return here and switch to <strong className="text-white/80">Upload PDF</strong> or <strong className="text-white/80">Use a Template</strong>.</p>
                </div>
              )}

              {/* ── Drive source picker ── */}
              {sourceMode === 'drive' && (
                <div className="space-y-3">
                  {/* Search */}
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/25" />
                    <input
                      type="text"
                      placeholder="Search by document name or reference…"
                      value={driveSearch}
                      onChange={(e) => setDriveSearch(e.target.value)}
                      className="h-10 w-full rounded-xl border border-white/[0.10] bg-white/[0.04] pl-9 pr-4 text-sm text-white placeholder:text-white/20 focus:border-white/25 focus:outline-none transition"
                    />
                  </div>

                  {historyLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="h-5 w-5 animate-spin text-white/30" />
                    </div>
                  ) : (() => {
                    const driveEntries = [...history]
                      .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())
                      .filter((e) => {
                        if (!e.shareId && !e.shareUrl) return false;
                        if (!driveSearch) return true;
                        const q = driveSearch.toLowerCase();
                        return (e.templateName || '').toLowerCase().includes(q) || (e.referenceNumber || '').toLowerCase().includes(q);
                      });
                    if (driveEntries.length === 0) {
                      return (
                        <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] py-12 text-center">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
                            <History className="h-5 w-5 text-white/25" />
                          </div>
                          <p className="text-sm text-white/35">{driveSearch ? 'No documents match your search' : 'No shared documents yet'}</p>
                          <p className="text-xs text-white/20">Shared documents will appear here once generated.</p>
                        </div>
                      );
                    }
                    return (
                      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-0.5">
                        {driveEntries.slice(0, 20).map((entry) => {
                          const signersList = entry.recipientSigners || [];
                          const allSigned = signersList.length > 0
                            ? signersList.every((s) => s.signingStatus === 'signed')
                            : Boolean(entry.recipientSignedAt);
                          const isExpired = entry.shareExpiresAt ? new Date(entry.shareExpiresAt) < new Date() : false;
                          const isSelected = selectedDriveEntry?.id === entry.id;
                          return (
                            <button
                              key={entry.id}
                              type="button"
                              onClick={() => setSelectedDriveEntry(isSelected ? null : entry)}
                              className={[
                                'w-full text-left rounded-xl border p-3.5 transition-all duration-150',
                                isSelected
                                  ? 'border-white/25 bg-white/[0.08] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]'
                                  : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]',
                              ].join(' ')}
                            >
                              <div className="flex items-start gap-3">
                                <div className={[
                                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border mt-0.5',
                                  allSigned ? 'border-emerald-500/20 bg-emerald-500/[0.08]' : isExpired ? 'border-rose-500/20 bg-rose-500/[0.07]' : 'border-white/[0.08] bg-white/[0.04]',
                                ].join(' ')}>
                                  {allSigned ? <FileCheck2 className="h-4 w-4 text-emerald-400" /> : <FileText className="h-4 w-4 text-white/40" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="text-[13px] font-semibold text-white leading-tight truncate">
                                      {entry.templateName || (entry.documentSourceType === 'uploaded_pdf' ? 'Uploaded PDF' : 'Document')}
                                    </p>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      {isSelected && <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-white"><Check className="h-2.5 w-2.5 text-slate-950" /></span>}
                                      <span className={[
                                        'rounded-full border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em]',
                                        allSigned ? 'border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-400'
                                          : isExpired ? 'border-rose-500/25 bg-rose-500/[0.07] text-rose-400'
                                          : 'border-white/[0.09] bg-white/[0.03] text-white/35',
                                      ].join(' ')}>
                                        {allSigned ? 'Signed' : isExpired ? 'Expired' : 'Pending'}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                                    <span className="flex items-center gap-1 text-[11px] text-white/30">
                                      <Clock className="h-3 w-3" />{formatRelative(entry.generatedAt)}
                                    </span>
                                    {entry.referenceNumber && (
                                      <span className="font-mono text-[10px] text-white/20">#{entry.referenceNumber}</span>
                                    )}
                                    {signersList.length > 0 && (
                                      <span className="text-[11px] text-white/25">{signersList.length} signer{signersList.length !== 1 ? 's' : ''}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {selectedDriveEntry && (
                    <div className="flex items-start gap-3 rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.06] px-4 py-3">
                      <Info className="h-4 w-4 shrink-0 text-indigo-400 mt-0.5" />
                      <p className="text-[12.5px] leading-relaxed text-white/55">
                        <strong className="text-white/80">{selectedDriveEntry.templateName || 'Document'}</strong> selected.
                        Clicking Continue will let you resend this existing document&apos;s signing link to signers — no regeneration needed.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ══ STEP 2: SIGNERS & BOXES ════════════════════════ */}
          {step === 'signers' && (
            <div className="space-y-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/30">Step 2 of 5</p>
                <h2 className="mt-1 text-xl sm:text-2xl font-semibold tracking-[-0.04em] text-white leading-tight">
                  {sourceMode === 'upload' ? 'Signers & signature boxes' : 'Configure signers'}
                </h2>
                <p className="mt-1.5 text-sm text-white/40">
                  {sourceMode === 'upload'
                    ? 'Draw boxes on the PDF, then assign each box to a named signer. Each signer gets a personal OTP-gated signing link.'
                    : 'Add the people who need to sign this document. Each signer gets a dedicated, email-OTP verified signing link.'}
                </p>
              </div>

              {/* Signer count + mode */}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Number of signers">
                  <select className={selectCls} value={signerCount} onChange={(e) => setSignerCount(Number(e.target.value))}>
                    {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n} signer{n > 1 ? 's' : ''}</option>)}
                  </select>
                </Field>
                <Field label="Signing mode" hint="Parallel: any signer can sign in any order. Sequential: must sign in order.">
                  <select className={selectCls} value={signingMode} onChange={(e) => setSigningMode(e.target.value as 'parallel' | 'sequential')}>
                    <option value="parallel">Parallel — any order</option>
                    <option value="sequential">Sequential — ordered</option>
                  </select>
                </Field>
              </div>

              {/* Signer detail cards */}
              <div className="space-y-3">
                {signers.map((signer, i) => (
                  <div key={signer.signerKey} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-4">
                    {/* Header */}
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.06] text-xs font-bold text-white">
                        {i + 1}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">Signer {i + 1}</p>
                        <p className="text-[10.5px] text-white/30 font-mono">{signer.signerKey}</p>
                      </div>
                      {signer.emailOtpEnabled && (
                        <span className="ml-auto flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-2.5 py-1 text-[10px] font-semibold text-emerald-400">
                          <ShieldCheck className="h-3 w-3" /> Email OTP
                        </span>
                      )}
                    </div>

                    {/* Basic info */}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Full name" required>
                        <input className={inputCls} placeholder="Rahul Sharma" value={signer.signerName}
                          onChange={(e) => setSigners((p) => p.map((s, idx) => idx === i ? { ...s, signerName: e.target.value } : s))} />
                      </Field>
                      <Field label="Email address" required hint="This email will receive the signing link and the OTP.">
                        <input type="email" className={inputCls} placeholder="rahul@company.com" value={signer.signerEmail}
                          onChange={(e) => setSigners((p) => p.map((s, idx) => idx === i ? { ...s, signerEmail: e.target.value } : s))} />
                      </Field>
                      <Field label="Role / designation">
                        <input className={inputCls} placeholder="HR Manager / CFO / Client" value={signer.signerRole}
                          onChange={(e) => setSigners((p) => p.map((s, idx) => idx === i ? { ...s, signerRole: e.target.value } : s))} />
                      </Field>
                    </div>

                    {/* Verification options */}
                    <div>
                      <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/25">Verification &amp; capture</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Toggle label="Email OTP verification"  sub="Signer must verify their email before accessing the signing page." checked={signer.emailOtpEnabled}      onChange={(v) => setSigners((p) => p.map((s, idx) => idx === i ? { ...s, emailOtpEnabled: v }      : s))} />
                        <Toggle label="Consent required"        sub="Signer must accept terms before signing."                         checked={signer.consentRequired}       onChange={(v) => setSigners((p) => p.map((s, idx) => idx === i ? { ...s, consentRequired: v }       : s))} />
                        <Toggle label="Camera selfie capture"   sub="Capture a photo of the signer for the audit trail."               checked={signer.cameraCaptureEnabled}  onChange={(v) => setSigners((p) => p.map((s, idx) => idx === i ? { ...s, cameraCaptureEnabled: v }  : s))} />
                        <Toggle label="Draw signature"          sub="Allow signer to draw their signature."                            checked={signer.signatureDrawEnabled}  onChange={(v) => setSigners((p) => p.map((s, idx) => idx === i ? { ...s, signatureDrawEnabled: v }  : s))} />
                        <Toggle label="Upload signature image"  sub="Allow signer to upload an image as their signature."              checked={signer.signatureUploadEnabled} onChange={(v) => setSigners((p) => p.map((s, idx) => idx === i ? { ...s, signatureUploadEnabled: v } : s))} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Signature box editor (uploaded PDF only) ── */}
              {sourceMode === 'upload' && uploadedFile && (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Signature Box Placement</p>
                    <p className="mt-1 text-[12.5px] text-white/40">
                      <strong className="text-white/65">Click or drag</strong> on any page to place a signature box.
                      Then assign it to a specific signer using the panel on the right.
                      Each signer's box will only be accessible after email OTP verification.
                    </p>
                  </div>

                  {/* Signer key legend */}
                  <div className="flex flex-wrap gap-2">
                    {signers.map((s, i) => (
                      <span key={s.signerKey} className="flex items-center gap-1.5 rounded-full border border-white/[0.10] bg-white/[0.04] px-3 py-1 text-[11px] font-semibold text-white/60">
                        <span className="flex h-4 w-4 items-center justify-center rounded-full border border-white/20 text-[9px] font-bold text-white">{i + 1}</span>
                        <span className="font-mono text-[10px]">{s.signerKey}</span>
                        {s.signerName && <span className="text-white/40">· {s.signerName}</span>}
                        {s.emailOtpEnabled && <ShieldCheck className="h-3 w-3 text-emerald-400" />}
                      </span>
                    ))}
                  </div>

                  <div className="rounded-2xl border border-white/[0.08] bg-white p-4">
                    <PdfSignatureBoxEditor
                      pdfDataUrl={uploadedFile.dataUrl}
                      value={signatureBoxes}
                      onChange={setSignatureBoxes}
                      signerKeys={signerKeys}
                      signerDirectory={signerDirectory}
                      onUpdateSignerDirectory={handleUpdateSignerDirectory}
                    />
                  </div>

                  {signatureBoxes.length > 0 && (
                    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/30">{signatureBoxes.length} box{signatureBoxes.length !== 1 ? 'es' : ''} placed</p>
                      <div className="space-y-2">
                        {signatureBoxes.map((box, idx) => {
                          const assignedSigner = signers.find((s) => s.signerKey === box.signerKey);
                          return (
                            <div key={box.id} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.06] text-[10px] font-bold text-white">{idx + 1}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-[12.5px] font-semibold text-white">{box.label || `Signature ${idx + 1}`}</p>
                                <p className="text-[11px] text-white/35">Page {box.page} · {box.required !== false ? 'Required' : 'Optional'}</p>
                              </div>
                              {box.signerKey && (
                                <div className="shrink-0 text-right">
                                  <p className="text-[10px] font-mono text-white/40">{box.signerKey}</p>
                                  {assignedSigner?.signerEmail ? (
                                    <p className="text-[10px] text-white/30 truncate max-w-[120px]">{assignedSigner.signerEmail}</p>
                                  ) : (
                                    <p className="text-[10px] text-amber-400/70">No email set</p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Template mode: quick placement */}
              {sourceMode === 'template' && (
                <SectionCard title="Signature placement" icon={<PenLine className="h-4 w-4" />}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Pages">
                      <select className={selectCls} value={placementMode} onChange={(e) => setPlacementMode(e.target.value as typeof placementMode)}>
                        <option value="last">Last page only</option>
                        <option value="all">All pages</option>
                        <option value="pages">Specific pages</option>
                      </select>
                    </Field>
                    <Field label="Position">
                      <select className={selectCls} value={placementPosition} onChange={(e) => setPlacementPosition(e.target.value as typeof placementPosition)}>
                        <option value="bottom_right">Bottom right</option>
                        <option value="bottom_left">Bottom left</option>
                        <option value="top_right">Top right</option>
                        <option value="top_left">Top left</option>
                        <option value="center">Center</option>
                      </select>
                    </Field>
                  </div>
                </SectionCard>
              )}
            </div>
          )}

          {/* ══ STEP 3: CONFIGURE / SECURITY ══════════════════ */}
          {step === 'configure' && (
            <div className="space-y-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/30">Step 3 of 5</p>
                <h2 className="mt-1 text-xl sm:text-2xl font-semibold tracking-[-0.04em] text-white leading-tight">Security &amp; document settings</h2>
                <p className="mt-1.5 text-sm text-white/40">Configure the link security, watermark, admin signature, and workflow options.</p>
              </div>

              {/* Admin signature */}
              <SectionCard title="Admin signature" icon={<ShieldCheck className="h-4 w-4" />}>
                <Field label="Pre-applied admin signature" hint="Embedded in the PDF and recorded in the audit trail.">
                  <select className={selectCls} value={selectedAdminSigId} onChange={(e) => setSelectedAdminSigId(e.target.value)}>
                    <option value="none">No admin signature</option>
                    {adminSigs.map((sig) => <option key={sig.id} value={sig.id}>{sig.signerName} — {sig.signerRole}</option>)}
                  </select>
                </Field>
                {sourceMode === 'template' && (
                  <Field label="Document design preset">
                    <select className={selectCls} value={designPreset} onChange={(e) => setDesignPreset(e.target.value)}>
                      <option value="default">Default</option>
                      <option value="minimal">Minimal</option>
                      <option value="corporate">Corporate</option>
                      <option value="modern">Modern</option>
                    </select>
                  </Field>
                )}
              </SectionCard>

              {/* Link security */}
              <SectionCard title="Link security" icon={<Lock className="h-4 w-4" />}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Access policy">
                    <select className={selectCls} value={sharePolicy} onChange={(e) => setSharePolicy(e.target.value as typeof sharePolicy)}>
                      <option value="standard">Standard secure link</option>
                      <option value="expiring">Expiring link</option>
                      <option value="one_time">One-time link</option>
                    </select>
                  </Field>
                  {sharePolicy === 'expiring' && (
                    <Field label="Expiry (days)"><input type="number" className={inputCls} value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)} min="1" max="365" /></Field>
                  )}
                  {sharePolicy === 'one_time' && (
                    <Field label="Max opens"><input type="number" className={inputCls} value={maxOpens} onChange={(e) => setMaxOpens(e.target.value)} min="1" max="100" /></Field>
                  )}
                  <Field label="Recipient access">
                    <select className={selectCls} value={recipientAccess} onChange={(e) => setRecipientAccess(e.target.value as typeof recipientAccess)}>
                      <option value="view">View only</option>
                      <option value="comment">Comment and review</option>
                      <option value="edit">Edit, comment, and review</option>
                    </select>
                  </Field>
                  <Field label="Watermark label" hint="Optional text stamped across pages.">
                    <input className={inputCls} placeholder="Confidential" value={watermark} onChange={(e) => setWatermark(e.target.value)} maxLength={48} />
                  </Field>
                </div>
              </SectionCard>

              {/* Document options */}
              <SectionCard title="Document options" icon={<Zap className="h-4 w-4" />}>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Toggle label="Require recipient signature" checked={recipientSignatureRequired} onChange={setRecipientSignatureRequired} />
                  <Toggle label="Certificate branding" sub="Adds your brand to the signed certificate." checked={certificateBranding} onChange={setCertificateBranding} />
                  <Toggle label="Show receipt page after signing" checked={receiptPage} onChange={setReceiptPage} />
                  <Toggle label="Collect signer data" checked={dataCollectionEnabled} onChange={setDataCollectionEnabled} />
                </div>
              </SectionCard>

              {/* Workflow gates */}
              <SectionCard title="Workflow gates" icon={<FileCheck2 className="h-4 w-4" />}>
                <Toggle label="Required document collection" sub="Collect specified documents before the recipient can sign." checked={requiredDocsEnabled} onChange={setRequiredDocsEnabled} />
                {requiredDocsEnabled && (
                  <Field label="Documents list" hint="Comma-separated.">
                    <input className={inputCls} placeholder="PAN Card, Aadhaar Card, Signed NDA" value={requiredDocsText} onChange={(e) => setRequiredDocsText(e.target.value)} />
                  </Field>
                )}
              </SectionCard>
            </div>
          )}

          {/* ══ STEP 4: SEND ══════════════════════════════════ */}
          {step === 'send' && (
            <div className="space-y-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/30">Step 4 of 5</p>
                <h2 className="mt-1 text-xl sm:text-2xl font-semibold tracking-[-0.04em] text-white leading-tight">Generate &amp; send signing links</h2>
                <p className="mt-1.5 text-sm text-white/40">Create the secure signing link, then dispatch personalised OTP-gated emails to each signer.</p>
              </div>

              {/* Summary */}
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/30">Summary</p>
                <div className="grid gap-2 sm:grid-cols-2 text-sm text-white/50">
                  <span className="flex items-center gap-2"><FileText className="h-3.5 w-3.5 shrink-0" />
                    {sourceMode === 'upload' ? uploadedFile?.name || 'Uploaded PDF' : selectedTemplate?.name || 'Template'}
                  </span>
                  <span className="flex items-center gap-2"><Users className="h-3.5 w-3.5 shrink-0" />{signerCount} signer{signerCount > 1 ? 's' : ''} · {signingMode}</span>
                  {sourceMode === 'upload' && signatureBoxes.length > 0 && (
                    <span className="flex items-center gap-2"><PenLine className="h-3.5 w-3.5 shrink-0" />{signatureBoxes.length} signature box{signatureBoxes.length !== 1 ? 'es' : ''}</span>
                  )}
                  <span className="flex items-center gap-2 capitalize"><Lock className="h-3.5 w-3.5 shrink-0" />{sharePolicy.replace(/_/g, ' ')} link</span>
                  <span className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 shrink-0" />Email OTP on {signers.filter((s) => s.emailOtpEnabled).length}/{signerCount} signers</span>
                </div>
              </div>

              {/* Generate button */}
              {!shareUrl && (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 flex flex-col items-center gap-4 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.08]">
                    <Link2 className="h-6 w-6 text-indigo-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">Ready to generate</p>
                    <p className="mt-1 text-sm text-white/40">Creates the secure signing workflow and issues a dedicated OTP-gated link per signer.</p>
                  </div>
                  {generateError && (
                    <div className="w-full rounded-xl border border-rose-500/20 bg-rose-500/[0.07] px-4 py-3 text-sm text-rose-300">{generateError}</div>
                  )}
                  <button type="button" onClick={() => void handleGenerate()} disabled={generating}
                    className="inline-flex h-11 items-center gap-2.5 rounded-2xl border border-white/[0.12] bg-white px-8 text-sm font-semibold text-slate-950 shadow-[0_8px_32px_rgba(255,255,255,0.12)] transition hover:bg-white/90 active:scale-95 disabled:opacity-50">
                    {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</> : <><Zap className="h-4 w-4" /> Generate Signing Link</>}
                  </button>
                </div>
              )}

              {/* Link created */}
              {shareUrl && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-5 space-y-3">
                    <div className="flex items-center gap-2 text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />
                      <p className="text-sm font-semibold">Signing link created</p>
                    </div>

                    {/* Share URL row */}
                    <div>
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">Signing URL</p>
                      <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5">
                        <Link2 className="h-3.5 w-3.5 shrink-0 text-white/35" />
                        <span className="flex-1 min-w-0 truncate font-mono text-[11.5px] text-white/60">{absoluteShareUrl}</span>
                        <button type="button" onClick={() => { void navigator.clipboard.writeText(absoluteShareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                          className="shrink-0 flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold text-white/60 transition hover:bg-white/[0.12] hover:text-white">
                          {copied ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
                        </button>
                      </div>
                    </div>

                    {/* Access Password row — shown only if a password was set */}
                    {sharePassword && (
                      <div>
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-400/70">
                          Access Password — share with signers
                        </p>
                        <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2.5">
                          <Lock className="h-3.5 w-3.5 shrink-0 text-amber-400/70" />
                          <span className="flex-1 font-mono text-sm font-semibold tracking-[0.18em] text-amber-300">{sharePassword}</span>
                          <button type="button"
                            onClick={() => { void navigator.clipboard.writeText(sharePassword); setPasswordCopied(true); setTimeout(() => setPasswordCopied(false), 2000); }}
                            className="shrink-0 flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.08] px-3 py-1.5 text-[11px] font-semibold text-amber-400/70 transition hover:bg-amber-500/[0.15] hover:text-amber-300">
                            {passwordCopied ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
                          </button>
                        </div>
                        <p className="mt-1.5 text-[11px] text-white/30">Signers will need this password to unlock the document before they can view or sign it.</p>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <a href={absoluteShareUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.10] bg-white/[0.06] px-4 text-[12px] font-semibold text-white/65 transition hover:bg-white/[0.10] hover:text-white">
                        <ExternalLink className="h-3.5 w-3.5" /> Preview link
                      </a>
                      <button type="button" onClick={() => { setShareUrl(''); setSharePassword(''); setCurrentHistoryId(''); setGenerateError(''); }}
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.10] bg-white/[0.06] px-4 text-[12px] font-semibold text-white/65 transition hover:bg-white/[0.10] hover:text-white">
                        <RefreshCw className="h-3.5 w-3.5" /> Regenerate
                      </button>
                    </div>
                  </div>

                  {/* Send to each signer */}
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-white">Dispatch signing links</p>
                      <button type="button" onClick={() => { signers.forEach((s) => { void sendLink(s.signerKey); }); }}
                        className="shrink-0 inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/[0.10] bg-white/[0.06] px-3 text-[11px] font-semibold text-white/65 transition hover:bg-white/[0.10] hover:text-white">
                        <Mail className="h-3 w-3" /> Send to all
                      </button>
                    </div>
                    <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/15 bg-amber-500/[0.05] px-3 py-2.5">
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-400" />
                      <p className="text-[12px] text-amber-300/80">Each signer receives a personalised link. Email OTP must be verified before they can access their assigned signature boxes.</p>
                    </div>
                    <div className="space-y-3">
                      {signers.map((signer, i) => {
                        const st = linkStatus[signer.signerKey] || 'idle';
                        const sending = sendingLinks[signer.signerKey];
                        const assignedBoxes = signatureBoxes.filter((b) => b.signerKey === signer.signerKey);
                        return (
                          <div key={signer.signerKey} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
                            <div className="flex items-start gap-3">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.06] text-xs font-bold text-white">{i + 1}</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-semibold text-white">{signer.signerName || `Signer ${i + 1}`}</p>
                                  {signer.emailOtpEnabled && <span className="flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-2 py-0.5 text-[9.5px] font-semibold text-emerald-400"><ShieldCheck className="h-2.5 w-2.5" /> OTP</span>}
                                  {sourceMode === 'upload' && assignedBoxes.length > 0 && (
                                    <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[9.5px] font-semibold text-white/40">{assignedBoxes.length} box{assignedBoxes.length !== 1 ? 'es' : ''}</span>
                                  )}
                                </div>
                                <p className="mt-0.5 text-xs text-white/35 truncate">{signer.signerEmail || <span className="text-rose-400/70">No email set</span>}</p>
                              </div>
                              <div className="shrink-0 flex items-center gap-2">
                                {st === 'sent'   && <span className="text-[11px] font-semibold text-emerald-400">Sent ✓</span>}
                                {st === 'failed' && <span className="text-[11px] font-semibold text-rose-400">Failed</span>}
                                <button type="button" disabled={sending || !signer.signerEmail || !currentHistoryId}
                                  onClick={() => void sendLink(signer.signerKey)}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/[0.10] bg-white/[0.06] px-3 text-[11px] font-semibold text-white/65 transition hover:bg-white/[0.10] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed">
                                  {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Mail className="h-3 w-3" /> {st === 'sent' ? 'Resend' : 'Send'}</>}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ STEP 5: TRACK ═════════════════════════════════ */}
          {step === 'track' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/30">Step 5 of 5</p>
                  <h2 className="mt-1 text-xl sm:text-2xl font-semibold tracking-[-0.04em] text-white leading-tight">Track signing activity</h2>
                  <p className="mt-1.5 text-sm text-white/40">All signing workflows — recents first. Click any row for full analytics.</p>
                </div>
                <button type="button" onClick={() => { void fetchHistory(); setHistoryPage(1); }} disabled={historyLoading}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.10] bg-white/[0.06] px-4 text-[12px] font-semibold text-white/65 transition hover:bg-white/[0.10] hover:text-white disabled:opacity-50">
                  <RefreshCw className={['h-3.5 w-3.5', historyLoading ? 'animate-spin' : ''].join(' ')} /> Refresh
                </button>
              </div>

              {/* Filter tabs + total count */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1">
                  {([
                    { id: 'all', label: 'All' },
                    { id: 'signed', label: 'Signed' },
                    { id: 'pending', label: 'Pending' },
                    { id: 'expired', label: 'Expired' },
                  ] as const).map((f) => (
                    <button key={f.id} type="button"
                      onClick={() => { setHistoryFilter(f.id); setHistoryPage(1); }}
                      className={['h-8 rounded-xl border px-3.5 text-[11px] font-semibold transition',
                        historyFilter === f.id
                          ? 'border-white/20 bg-white/10 text-white'
                          : 'border-white/[0.07] bg-white/[0.03] text-white/35 hover:bg-white/[0.06] hover:text-white/60'].join(' ')}>
                      {f.label}
                    </button>
                  ))}
                </div>
                {filteredHistory.length > 0 && (
                  <span className="ml-auto text-[11px] text-white/25">
                    {filteredHistory.length} workflow{filteredHistory.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {historyLoading ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-white/30" /></div>
              ) : filteredHistory.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
                    <Eye className="h-6 w-6 text-white/25" />
                  </div>
                  <p className="text-sm text-white/35">
                    {historyFilter === 'all' ? 'No signing workflows yet' : `No ${historyFilter} workflows`}
                  </p>
                  <p className="text-xs text-white/20">Documents sent for signing will appear here with live per-signer status.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {pagedHistory.map((entry) => {
                    const signersList = entry.recipientSigners || [];
                    const total = signersList.length;
                    const signedCount = signersList.filter((s) => s.signingStatus === 'signed').length;
                    const allSigned = total > 0 ? signedCount === total : Boolean(entry.recipientSignedAt);
                    const partial = total > 1 && signedCount > 0 && signedCount < total;
                    const isExpired = entry.shareExpiresAt ? new Date(entry.shareExpiresAt) < new Date() : false;
                    const statusLabel = isExpired && !allSigned ? 'Expired' : allSigned ? 'Complete' : partial ? `${signedCount}/${total} Signed` : 'Pending';
                    const statusCls = isExpired && !allSigned
                      ? 'border-rose-500/25 bg-rose-500/[0.07] text-rose-400'
                      : allSigned ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                      : partial ? 'border-amber-500/25 bg-amber-500/10 text-amber-400'
                      : 'border-white/[0.10] bg-white/[0.05] text-white/40';

                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => setAnalyticsEntry(entry)}
                        className="w-full text-left rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 space-y-3 transition hover:border-white/[0.14] hover:bg-white/[0.04] group"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-white group-hover:text-white">
                              {entry.templateName || (entry.documentSourceType === 'uploaded_pdf' ? 'Uploaded PDF' : 'Document')}
                            </p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2">
                              <span className="text-[11px] text-white/30"><Clock className="mr-1 inline h-3 w-3" />{formatRelative(entry.generatedAt)}</span>
                              {entry.referenceNumber && <span className="font-mono text-[10px] text-white/20">#{entry.referenceNumber}</span>}
                              {total > 0 && <span className="text-[11px] text-white/20">{total} signer{total !== 1 ? 's' : ''}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={['rounded-full border px-2.5 py-1 text-[10px] font-semibold', statusCls].join(' ')}>
                              {statusLabel}
                            </span>
                            <ExternalLink className="h-3.5 w-3.5 text-white/20 group-hover:text-white/50 transition" />
                          </div>
                        </div>

                        {/* Signer progress pills */}
                        {signersList.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {signersList.map((s) => (
                              <span key={s.signerKey} className={[
                                'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                                s.signingStatus === 'signed'
                                  ? 'border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-400'
                                  : 'border-white/[0.08] bg-white/[0.03] text-white/30',
                              ].join(' ')}>
                                {s.signingStatus === 'signed'
                                  ? <Check className="h-2.5 w-2.5" />
                                  : <div className="h-2 w-2 rounded-full border border-white/25" />}
                                {s.signerName || s.signerEmail || s.signerKey}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-1">
                  <button type="button" disabled={historyPage <= 1}
                    onClick={() => setHistoryPage((p) => p - 1)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 text-[11px] font-semibold text-white/50 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">
                    ← Previous
                  </button>
                  <span className="text-[11px] text-white/30">Page {historyPage} of {totalPages}</span>
                  <button type="button" disabled={historyPage >= totalPages}
                    onClick={() => setHistoryPage((p) => p + 1)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 text-[11px] font-semibold text-white/50 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ══════════════════════════════════════
          FOOTER NAV
      ══════════════════════════════════════ */}
      <footer className="relative z-10 shrink-0 border-t border-white/[0.07] bg-[#0A0B0D]/80 backdrop-blur-xl px-4 sm:px-6" style={{ paddingTop: 12, paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          {/* Back */}
          <button type="button" disabled={stepIndex === 0}
            onClick={() => { if (stepIndex > 0) setStep(STEP_ORDER[stepIndex - 1]); }}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[0.10] bg-white/[0.04] px-5 text-sm font-semibold text-white/50 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>

          {/* Progress dots */}
          <div className="flex items-center gap-1.5">
            {STEP_ORDER.map((s) => (
              <div key={s} className={['rounded-full transition-all duration-300',
                s === step ? 'h-1.5 w-5 bg-white' : completedSet.has(s) ? 'h-1.5 w-1.5 bg-emerald-400' : 'h-1.5 w-1.5 bg-white/[0.12]'].join(' ')} />
            ))}
          </div>

          {/* Forward / Done */}
          {step === 'track' ? (
            <button type="button" onClick={onClose}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[0.12] bg-white px-7 text-sm font-semibold text-slate-950 shadow-[0_4px_16px_rgba(255,255,255,0.10)] transition hover:bg-white/90">
              Done
            </button>
          ) : (
            <button type="button"
              onClick={() => {
                setError('');
                if (step === 'source' && !canLeaveSource()) {
                  setError(sourceMode === 'upload' ? 'Please upload a PDF to continue.' : sourceMode === 'drive' ? 'Select a document from drive to continue.' : 'Please select a template to continue.');
                  return;
                }
                /* Drive mode: populate send state from selected entry and jump to send step */
                if (step === 'source' && sourceMode === 'drive' && selectedDriveEntry) {
                  const absUrl = selectedDriveEntry.shareUrl
                    ? (selectedDriveEntry.shareUrl.startsWith('/') && typeof window !== 'undefined'
                        ? `${window.location.origin}${selectedDriveEntry.shareUrl}`
                        : selectedDriveEntry.shareUrl)
                    : '';
                  setShareUrl(absUrl || selectedDriveEntry.shareUrl || '');
                  setSharePassword(selectedDriveEntry.sharePassword || '');
                  setCurrentHistoryId(selectedDriveEntry.id);
                  setStep('send');
                  return;
                }
                if (step === 'signers' && !canLeaveSigners()) {
                  setError('Please provide an email address for at least one signer.');
                  return;
                }
                const next = STEP_ORDER[stepIndex + 1];
                if (next) setStep(next);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[0.12] bg-white px-7 text-sm font-semibold text-slate-950 shadow-[0_4px_16px_rgba(255,255,255,0.10)] transition hover:bg-white/90 active:scale-95">
              {step === 'source' && sourceMode === 'drive' && selectedDriveEntry ? 'Open in Send' : step === 'send' ? 'View Tracking' : 'Continue'}
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </footer>

      {/* ══════════════════════════════════════
          HISTORY PANEL (slide-in overlay)
      ══════════════════════════════════════ */}
      {historyPanelOpen && (
        <div className="absolute inset-0 z-[250] flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            style={{ animation: 'obFadeIn 0.2s ease both' }}
            onClick={() => setHistoryPanelOpen(false)}
          />

          {/* Panel — slides in from right on sm+, slides up from bottom on mobile */}
          <div
            className="relative z-10 ml-auto flex h-full w-full flex-col sm:max-w-[580px] border-l border-white/[0.08] bg-[#08090a] shadow-[-32px_0_80px_rgba(0,0,0,0.7)]"
            style={{ animation: 'obSlideUp 0.28s cubic-bezier(0.25,0.46,0.45,0.94) both' }}
          >
            {/* Panel header */}
            <div className="shrink-0 border-b border-white/[0.07] bg-[#0a0b0d]/90 backdrop-blur-xl">
              <div className="flex items-center gap-3 px-5 py-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.10] bg-white/[0.05]">
                  <History className="h-4 w-4 text-white/60" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-white">Document History</p>
                  <p className="text-[11px] text-white/30">{history.length} e-sign workflow{history.length !== 1 ? 's' : ''} · recents first</p>
                </div>
                <button
                  type="button"
                  onClick={() => setHistoryPanelOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.10] bg-white/[0.04] text-white/40 transition hover:bg-white/[0.10] hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Search + filter */}
              <div className="px-5 pb-4 space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/25" />
                  <input
                    type="text"
                    placeholder="Search by name or reference…"
                    value={panelSearch}
                    onChange={(e) => { setPanelSearch(e.target.value); setPanelPage(1); }}
                    className="h-9 w-full rounded-xl border border-white/[0.09] bg-white/[0.04] pl-9 pr-4 text-[12.5px] text-white placeholder:text-white/20 focus:border-white/20 focus:outline-none transition"
                  />
                  {panelSearch && (
                    <button type="button" onClick={() => setPanelSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {([
                    { id: 'all', label: 'All', count: history.length },
                    { id: 'signed', label: 'Signed', count: history.filter((e) => Boolean(e.recipientSignedAt) || (e.recipientSigners || []).some((s) => s.signingStatus === 'signed')).length },
                    { id: 'pending', label: 'Pending', count: history.filter((e) => !Boolean(e.recipientSignedAt) && !(e.recipientSigners || []).some((s) => s.signingStatus === 'signed') && !(e.shareExpiresAt && new Date(e.shareExpiresAt) < new Date())).length },
                    { id: 'expired', label: 'Expired', count: history.filter((e) => e.shareExpiresAt && new Date(e.shareExpiresAt) < new Date()).length },
                  ] as const).map((f) => (
                    <button key={f.id} type="button"
                      onClick={() => { setPanelFilter(f.id); setPanelPage(1); }}
                      className={['flex h-7 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-semibold transition',
                        panelFilter === f.id
                          ? 'border-white/20 bg-white/[0.09] text-white'
                          : 'border-white/[0.07] bg-white/[0.02] text-white/35 hover:text-white/60'].join(' ')}>
                      {f.label}
                      <span className={['rounded-full px-1.5 py-px text-[9px] font-bold',
                        panelFilter === f.id ? 'bg-white/[0.14] text-white/80' : 'bg-white/[0.06] text-white/25'].join(' ')}>
                        {f.count}
                      </span>
                    </button>
                  ))}
                  <button type="button" onClick={() => { void fetchHistory(); }} disabled={historyLoading}
                    className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.02] text-white/30 transition hover:bg-white/[0.06] hover:text-white/60 disabled:opacity-40">
                    <RefreshCw className={['h-3 w-3', historyLoading ? 'animate-spin' : ''].join(' ')} />
                  </button>
                </div>
              </div>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto p-5">
              {historyLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-white/25" />
                </div>
              ) : panelFiltered.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
                    <Activity className="h-6 w-6 text-white/20" />
                  </div>
                  <p className="text-sm text-white/35">
                    {panelSearch ? 'No documents match your search' : panelFilter === 'all' ? 'No signing workflows yet' : `No ${panelFilter} documents`}
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {panelPaged.map((entry, idx) => {
                    const signersList = entry.recipientSigners || [];
                    const total = signersList.length;
                    const signedCount = signersList.filter((s) => s.signingStatus === 'signed').length;
                    const allSigned = total > 0 ? signedCount === total : Boolean(entry.recipientSignedAt);
                    const isExpired = entry.shareExpiresAt ? new Date(entry.shareExpiresAt) < new Date() : false;
                    const absUrl = entry.shareUrl
                      ? (entry.shareUrl.startsWith('/') ? `${window.location.origin}${entry.shareUrl}` : entry.shareUrl)
                      : '';

                    const statusLabel = isExpired && !allSigned ? 'Expired' : allSigned ? 'Complete' : signedCount > 0 ? `${signedCount}/${total}` : 'Pending';
                    const statusCls = isExpired && !allSigned
                      ? 'border-rose-500/25 bg-rose-500/[0.07] text-rose-400'
                      : allSigned ? 'border-emerald-500/25 bg-emerald-500/[0.09] text-emerald-400'
                      : signedCount > 0 ? 'border-amber-500/25 bg-amber-500/[0.08] text-amber-400'
                      : 'border-white/[0.09] bg-white/[0.03] text-white/35';

                    return (
                      <div
                        key={entry.id}
                        className="group rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden transition hover:border-white/[0.14] hover:bg-white/[0.04]"
                        style={{ animation: `obSlideUp 0.25s ${idx * 0.04}s ease both` }}
                      >
                        {/* Card header — clickable for analytics */}
                        <button
                          type="button"
                          onClick={() => { setAnalyticsEntry(entry); }}
                          className="w-full text-left p-4 pb-3"
                        >
                          <div className="flex items-start gap-3">
                            {/* Document icon */}
                            <div className={[
                              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border',
                              allSigned ? 'border-emerald-500/20 bg-emerald-500/[0.08]' : isExpired ? 'border-rose-500/20 bg-rose-500/[0.07]' : 'border-white/[0.08] bg-white/[0.04]',
                            ].join(' ')}>
                              {allSigned
                                ? <FileCheck2 className="h-4 w-4 text-emerald-400" />
                                : <FileText className="h-4 w-4 text-white/40" />}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className="truncate text-[13px] font-semibold text-white leading-tight">
                                  {entry.templateName || (entry.documentSourceType === 'uploaded_pdf' ? 'Uploaded PDF' : 'Document')}
                                </p>
                                <span className={['shrink-0 rounded-full border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em]', statusCls].join(' ')}>
                                  {statusLabel}
                                </span>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                                <span className="flex items-center gap-1 text-[11px] text-white/30">
                                  <Clock className="h-3 w-3" />{formatRelative(entry.generatedAt)}
                                </span>
                                {entry.referenceNumber && (
                                  <span className="font-mono text-[10px] text-white/20">#{entry.referenceNumber}</span>
                                )}
                                <span className={['text-[10px] font-semibold uppercase tracking-[0.1em]',
                                  entry.shareAccessPolicy === 'expiring' ? 'text-amber-400/50' : entry.shareAccessPolicy === 'one_time' ? 'text-sky-400/50' : 'text-white/20'].join(' ')}>
                                  {entry.shareAccessPolicy?.replace(/_/g, ' ') || 'standard'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Signer pills */}
                          {signersList.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {signersList.map((s) => (
                                <span key={s.signerKey} className={[
                                  'flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold',
                                  s.signingStatus === 'signed'
                                    ? 'border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-400'
                                    : 'border-white/[0.08] bg-white/[0.02] text-white/30',
                                ].join(' ')}>
                                  {s.signingStatus === 'signed'
                                    ? <Check className="h-2.5 w-2.5" />
                                    : <div className="h-2 w-2 rounded-full border border-white/20" />}
                                  <span className="max-w-[100px] truncate">{s.signerName || s.signerEmail || s.signerKey}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </button>

                        {/* Actions bar */}
                        <div className="flex items-center gap-1.5 border-t border-white/[0.05] bg-white/[0.015] px-4 py-2.5">
                          {absUrl && (
                            <>
                              <a href={absUrl} target="_blank" rel="noopener noreferrer"
                                className="inline-flex h-7 items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 text-[11px] font-semibold text-white/45 transition hover:bg-white/[0.08] hover:text-white">
                                <ExternalLink className="h-3 w-3" /> Open
                              </a>
                              <button type="button"
                                onClick={() => void navigator.clipboard.writeText(absUrl)}
                                className="inline-flex h-7 items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 text-[11px] font-semibold text-white/45 transition hover:bg-white/[0.08] hover:text-white">
                                <Copy className="h-3 w-3" /> Copy link
                              </button>
                            </>
                          )}
                          {allSigned && (
                            <a href={`/api/generate-pdf?historyId=${entry.id}`} target="_blank" rel="noopener noreferrer"
                              className="inline-flex h-7 items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.07] px-2.5 text-[11px] font-semibold text-emerald-400 transition hover:bg-emerald-500/[0.13]">
                              <Download className="h-3 w-3" /> PDF
                            </a>
                          )}
                          <button type="button"
                            onClick={() => { setCurrentHistoryId(entry.id); signersList.forEach((s) => void sendLink(s.signerKey)); }}
                            className="inline-flex h-7 items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 text-[11px] font-semibold text-white/45 transition hover:bg-white/[0.08] hover:text-white">
                            <Send className="h-3 w-3" /> Resend
                          </button>
                          <button type="button"
                            onClick={() => setAnalyticsEntry(entry)}
                            className="ml-auto inline-flex h-7 items-center gap-1 rounded-lg border border-indigo-500/20 bg-indigo-500/[0.07] px-2.5 text-[11px] font-semibold text-indigo-400 transition hover:bg-indigo-500/[0.13]">
                            <Activity className="h-3 w-3" /> Analytics
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination */}
              {panelTotalPages > 1 && (
                <div className="mt-5 flex items-center justify-between">
                  <button type="button" disabled={panelPage <= 1}
                    onClick={() => setPanelPage((p) => p - 1)}
                    className="inline-flex h-8 items-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 text-[11px] font-semibold text-white/40 transition hover:bg-white/[0.07] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">
                    <ChevronLeft className="h-3.5 w-3.5" /> Prev
                  </button>
                  <span className="text-[11px] text-white/25">Page {panelPage} of {panelTotalPages} · {panelFiltered.length} total</span>
                  <button type="button" disabled={panelPage >= panelTotalPages}
                    onClick={() => setPanelPage((p) => p + 1)}
                    className="inline-flex h-8 items-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 text-[11px] font-semibold text-white/40 transition hover:bg-white/[0.07] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          ANALYTICS MODAL (document detail)
      ══════════════════════════════════════ */}
      {analyticsEntry && (() => {
        const ae = analyticsEntry;
        const signersList = ae.recipientSigners || [];
        const total = signersList.length;
        const signedCount = signersList.filter((s) => s.signingStatus === 'signed').length;
        const allSigned = total > 0 ? signedCount === total : Boolean(ae.recipientSignedAt);
        const isExpired = ae.shareExpiresAt ? new Date(ae.shareExpiresAt) < new Date() : false;
        const absUrl = ae.shareUrl
          ? (ae.shareUrl.startsWith('/') ? `${window.location.origin}${ae.shareUrl}` : ae.shareUrl)
          : '';

        return (
          <div className="fixed inset-0 z-[10200] flex items-end sm:items-center justify-center p-0 sm:p-4">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setAnalyticsEntry(null)}
            />

            {/* Sheet */}
            <div className="relative z-10 w-full sm:max-w-2xl max-h-[90dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-white/[0.09] bg-[#0D0E10] shadow-[0_32px_64px_rgba(0,0,0,0.7)]">

              {/* Modal header */}
              <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-white/[0.07] bg-[#0D0E10]/95 px-5 py-4 backdrop-blur-xl">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-white">
                    {ae.templateName || (ae.documentSourceType === 'uploaded_pdf' ? 'Uploaded PDF' : 'Document')}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-white/30"><Clock className="mr-1 inline h-3 w-3" />{formatRelative(ae.generatedAt)}</span>
                    {ae.referenceNumber && <span className="font-mono text-[10px] text-white/25">#{ae.referenceNumber}</span>}
                    <span className={['rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                      isExpired && !allSigned ? 'border-rose-500/25 text-rose-400'
                      : allSigned ? 'border-emerald-500/25 text-emerald-400'
                      : 'border-amber-500/25 text-amber-400'].join(' ')}>
                      {isExpired && !allSigned ? 'Expired' : allSigned ? `All signed` : `${signedCount}/${total} signed`}
                    </span>
                  </div>
                </div>
                <button type="button" onClick={() => setAnalyticsEntry(null)}
                  className="shrink-0 flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.10] bg-white/[0.04] text-white/50 transition hover:bg-white/[0.10] hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-5 space-y-5">

                {/* Quick-action bar */}
                <div className="flex flex-wrap gap-2">
                  {absUrl && (
                    <a href={absUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.10] bg-white/[0.05] px-4 text-[12px] font-semibold text-white/65 transition hover:bg-white/[0.10] hover:text-white">
                      <ExternalLink className="h-3.5 w-3.5" /> Open document
                    </a>
                  )}
                  {absUrl && (
                    <button type="button"
                      onClick={() => void navigator.clipboard.writeText(absUrl)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.10] bg-white/[0.05] px-4 text-[12px] font-semibold text-white/65 transition hover:bg-white/[0.10] hover:text-white">
                      <Copy className="h-3.5 w-3.5" /> Copy link
                    </button>
                  )}
                  {allSigned && (
                    <a href={`/api/generate-pdf?historyId=${ae.id}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] px-4 text-[12px] font-semibold text-emerald-400 transition hover:bg-emerald-500/[0.12]">
                      <FileCheck2 className="h-3.5 w-3.5" /> Download signed PDF
                    </a>
                  )}
                  <button type="button"
                    onClick={() => { signersList.forEach((s) => { if (s.signerKey) void sendLink(s.signerKey); }); setCurrentHistoryId(ae.id); }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.10] bg-white/[0.05] px-4 text-[12px] font-semibold text-white/65 transition hover:bg-white/[0.10] hover:text-white">
                    <Send className="h-3.5 w-3.5" /> Resend to all
                  </button>
                </div>

                {/* Link & access info */}
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/30">Access info</p>
                  <div className="grid gap-2 sm:grid-cols-2 text-[12px] text-white/50">
                    <span className="flex items-center gap-2 capitalize">
                      <Lock className="h-3.5 w-3.5 shrink-0 text-white/25" />
                      {ae.shareAccessPolicy?.replace(/_/g, ' ') || 'Standard'}
                    </span>
                    {ae.shareExpiresAt && (
                      <span className={['flex items-center gap-2', isExpired ? 'text-rose-400/70' : ''].join(' ')}>
                        <Clock className="h-3.5 w-3.5 shrink-0 text-white/25" />
                        {isExpired ? 'Expired ' : 'Expires '}{new Date(ae.shareExpiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    )}
                    {ae.maxAccessCount != null && (
                      <span className="flex items-center gap-2">
                        <Eye className="h-3.5 w-3.5 shrink-0 text-white/25" />
                        {ae.accessCount ?? 0} / {ae.maxAccessCount} opens
                      </span>
                    )}
                    {ae.sharePassword && (
                      <span className="flex items-center gap-2 font-mono text-amber-400/70">
                        <Shield className="h-3.5 w-3.5 shrink-0" />
                        Password protected
                      </span>
                    )}
                  </div>
                </div>

                {/* Per-signer analytics */}
                {signersList.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/30">Signer analytics</p>
                    {signersList.map((s, idx) => {
                      const signed = s.signingStatus === 'signed';
                      return (
                        <div key={s.signerKey} className={[
                          'rounded-2xl border p-4 space-y-3 transition',
                          signed ? 'border-emerald-500/15 bg-emerald-500/[0.04]' : 'border-white/[0.07] bg-white/[0.02]',
                        ].join(' ')}>
                          {/* Signer header */}
                          <div className="flex items-start gap-3">
                            {/* Photo or avatar */}
                            {s.photoDataUrl ? (
                              <img src={s.photoDataUrl} alt={s.signerName || 'Signer'} className="h-10 w-10 shrink-0 rounded-full object-cover border border-white/[0.10]" />
                            ) : (
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.05] text-sm font-bold text-white/40">
                                {(s.signerName || `S${idx + 1}`)[0].toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-white">{s.signerName || `Signer ${idx + 1}`}</p>
                              {s.signerEmail && <p className="text-[11px] text-white/35 truncate">{s.signerEmail}</p>}
                            </div>
                            <span className={[
                              'shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold',
                              signed ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400' : 'border-white/[0.10] bg-white/[0.05] text-white/35',
                            ].join(' ')}>
                              {signed ? 'Signed' : 'Pending'}
                            </span>
                          </div>

                          {/* Analytics grid */}
                          {signed && (
                            <div className="grid gap-2 sm:grid-cols-2 text-[11.5px] text-white/45">
                              {s.signedAt && (
                                <span className="flex items-center gap-2">
                                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400/60" />
                                  Signed {formatRelative(s.signedAt)}
                                </span>
                              )}
                              {s.signedIp && (
                                <span className="flex items-center gap-2 font-mono">
                                  <Shield className="h-3.5 w-3.5 shrink-0 text-white/25" />
                                  {s.signedIp}
                                </span>
                              )}
                              {s.signedLocationLabel && (
                                <span className="flex items-center gap-2">
                                  <Send className="h-3.5 w-3.5 shrink-0 text-white/25" />
                                  {s.signedLocationLabel}
                                </span>
                              )}
                              {s.consentedAt && (
                                <span className="flex items-center gap-2 text-emerald-400/60">
                                  <Check className="h-3.5 w-3.5 shrink-0" />
                                  Consented {formatRelative(s.consentedAt)}
                                </span>
                              )}
                              {s.authenticationMethods && s.authenticationMethods.length > 0 && (
                                <span className="flex items-center gap-2 col-span-full">
                                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-white/25" />
                                  Auth: {s.authenticationMethods.join(', ')}
                                </span>
                              )}
                              {s.signatureBoxSummary && (
                                <span className="flex items-center gap-2 col-span-full">
                                  <FileText className="h-3.5 w-3.5 shrink-0 text-white/25" />
                                  {s.signatureBoxSummary.completedBoxes}/{s.signatureBoxSummary.totalBoxes} boxes completed
                                </span>
                              )}
                            </div>
                          )}

                          {/* Signature preview */}
                          {s.signatureDataUrl && (
                            <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-2">
                              <p className="mb-1.5 text-[10px] text-white/25 uppercase tracking-[0.2em]">Signature</p>
                              <img src={s.signatureDataUrl} alt="Signature" className="h-14 object-contain" />
                            </div>
                          )}

                          {/* Per-signer actions */}
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            <button type="button"
                              onClick={() => { setCurrentHistoryId(ae.id); void sendLink(s.signerKey); }}
                              className="inline-flex h-7 items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-[11px] font-semibold text-white/50 transition hover:bg-white/[0.08] hover:text-white">
                              <Mail className="h-3 w-3" /> {signed ? 'Resend receipt' : 'Resend link'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

              </div>
            </div>
          </div>
        );
      })()}
    </div>
    </>
  );
}
