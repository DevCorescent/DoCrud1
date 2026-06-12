'use client';

/**
 * FileDriveCenter — production-grade drive explorer.
 *
 * Features:
 *   Step 6 — Drive Explorer
 *     • Grid / List view toggle
 *     • Breadcrumb navigation
 *     • Recent files, Pinned / Starred, Shared, Offline sections
 *     • Multi-select (click / Ctrl+click / Shift+click)
 *     • Bulk actions bar (delete, move, star, share, tag)
 *     • Drag-and-drop files into folders (HTML5 DnD)
 *     • Context menu (right-click + ⋯ button)
 *
 *   Step 7 — Folder & Directory Management
 *     • Nested folder tree (arbitrary depth)
 *     • Open/browse folders with breadcrumb trail
 *     • Create subfolder
 *     • Move files / folders across directories (modal picker)
 *     • Folder color labels
 *     • Folder locking with password authentication
 *     • Share folders (via QRShareDialog)
 *     • Offline-available toggle
 */

import { useState, useRef, useMemo, useEffect, useCallback } from 'react';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}
import { createPortal } from 'react-dom';
import {
  X, Upload, Search, Lock, Globe,
  FileText, Image as ImgIcon, Video, Music, Archive, File as FileIcon,
  MoreHorizontal, Share2, Download, Trash2, Copy, Check,
  QrCode, Send, Plus, Key, Star, Eye,
  MessageSquare, MessageCircle, Mail, FolderOpen, Folder, Shield, Users,
  ScanLine, Zap, LayoutGrid, List, ChevronRight, Home,
  Clock, Pin, Wifi, WifiOff, Tag, Move, FolderPlus, Unlock,
  AlertTriangle, CheckSquare, Square, RefreshCw, ArrowRight,
  MoreVertical, Pencil, PinOff, StarOff, Loader2, ChevronLeft, ChevronDown,
  BarChart2, TrendingUp, Activity, Layers,
} from 'lucide-react';
import UniversalFileViewer, { type ViewableFile } from '@/components/UniversalFileViewer';
import QRShareDialog, { type QRShareTarget } from '@/components/QRShareDialog';
import QRScannerDialog, { type AddedShareFile } from '@/components/QRScannerDialog';
import { listSharesForItem } from '@/lib/shareStore';
import { useSearchTracker, SEARCH_CONTEXTS } from '@/lib/search-tracking';

/* --- Types --------------------------------------------------------------- */

type Privacy   = 'public' | 'private' | 'password';
type FileKind  = 'pdf' | 'image' | 'video' | 'audio' | 'doc' | 'sheet' | 'archive' | 'other';

interface FileHistoryEntry {
  id: string;
  action: string;
  timestamp: number;
  detail?: string;
  icon: string; // emoji
}
type ViewMode  = 'grid' | 'list';
type SideSection = 'my-drive' | 'recent' | 'starred' | 'shared' | 'offline' | 'analytics';

interface DriveItem {
  id:        string;
  parentId:  string | null; // null = root
  type:      'file' | 'folder';
  name:      string;
  createdAt: number;
  updatedAt: number;
  // Files
  kind?:     FileKind;
  size?:     string;
  bytes?:    number;
  privacy?:  Privacy;
  blob?:     Blob;
  mimeType?: string;
  views?:    number;
  // Folders
  locked?:          boolean;
  lockPassword?:    string;
  folderColor?:     string;
  // Both
  starred?:         boolean;
  pinned?:          boolean;
  offlineAvailable?: boolean;
  sharedViaQr?:     boolean;
  tags?:            string[];
  label?:           string; // hex color label
  history?:         FileHistoryEntry[];
}

interface BreadcrumbEntry { id: string | null; name: string; }

/* ── Ddrive premium "D" icon ─────────────────────────────────────────────── */
function DdriveIcon({ size = 16, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      xmlns="http://www.w3.org/2000/svg" style={style}
      aria-label="Ddrive"
    >
      <defs>
        <linearGradient id="ddrive-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
        <filter id="ddrive-glow">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* rounded-rect background */}
      <rect x="1" y="1" width="22" height="22" rx="6" ry="6"
        fill="url(#ddrive-g)" opacity="0.15" />
      <rect x="1" y="1" width="22" height="22" rx="6" ry="6"
        fill="none" stroke="url(#ddrive-g)" strokeWidth="1.4" />
      {/* "D" letterform */}
      <text
        x="12" y="17" textAnchor="middle" dominantBaseline="auto"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="14" fontWeight="800" letterSpacing="-0.5"
        fill="url(#ddrive-g)" filter="url(#ddrive-glow)"
      >D</text>
    </svg>
  );
}

export interface FileDriveCenterProps {
  open: boolean;
  onClose: () => void;
}

/* --- Seed data ------------------------------------------------------------ */

const SEED_ITEMS: DriveItem[] = [
  {
    id: 'welcome-guide-v1',
    parentId: null,
    type: 'file',
    kind: 'pdf',
    name: 'Welcome to Ddrive.pdf',
    size: '12 KB',
    bytes: 12288,
    privacy: 'public',
    mimeType: 'application/pdf',
    createdAt: Date.now() - 30000,
    updatedAt: Date.now() - 30000,
    views: 0,
    starred: true,
    pinned: true,
    tags: ['getting-started'],
    history: [
      { id: 'h-init', action: 'Ddrive initialised', timestamp: Date.now() - 30000, detail: 'Your secure workspace is ready.', icon: '🚀' },
    ],
  },
];

/* --- Style constants ------------------------------------------------------ */

const KIND_COLOR: Record<FileKind, string> = {
  pdf:'rgba(248,113,113,.60)', image:'rgba(52,211,153,.55)', video:'rgba(251,146,60,.60)', audio:'rgba(167,139,250,.65)',
  doc:'rgba(129,140,248,.65)', sheet:'rgba(74,222,128,.55)', archive:'rgba(251,191,36,.55)', other:'rgba(148,163,184,.50)',
};
const KIND_BG: Record<FileKind, string> = {
  pdf:'rgba(255,255,255,.05)', image:'rgba(255,255,255,.05)', video:'rgba(255,255,255,.05)',
  audio:'rgba(255,255,255,.05)', doc:'rgba(255,255,255,.05)', sheet:'rgba(255,255,255,.05)',
  archive:'rgba(255,255,255,.05)', other:'rgba(255,255,255,.04)',
};
const FOLDER_COLORS  = ['#818cf8','#34d399','#f87171','#fbbf24','#fb923c','#60a5fa','#a78bfa','#e879f9'];
const LABEL_COLORS: { hex: string; name: string }[] = [
  { hex:'#ef4444', name:'Red'    },
  { hex:'#f97316', name:'Orange' },
  { hex:'#eab308', name:'Yellow' },
  { hex:'#22c55e', name:'Green'  },
  { hex:'#3b82f6', name:'Blue'   },
  { hex:'#8b5cf6', name:'Purple' },
  { hex:'#ec4899', name:'Pink'   },
  { hex:'#94a3b8', name:'Grey'   },
];
const PAGE_SIZE = 20;

/* --- Welcome PDF builder -------------------------------------------------- */

function buildDemoBlob(item: DriveItem): Blob | null {
  if (item.type !== 'file' || item.kind !== 'pdf') return null;

  // Build a clean, readable single-page welcome PDF using raw PDF syntax
  const lines: string[] = [
    'BT',
    // Title
    '/F2 22 Tf',
    '56 740 Td',
    '(Welcome to Ddrive) Tj',
    // Subtitle rule
    '/F1 10 Tf',
    '0 -22 Td',
    '(Your secure, private document workspace.) Tj',
    // Divider
    '0 -28 Td',
    '(____________________________________________) Tj',
    // Section: Getting Started
    '/F2 13 Tf',
    '0 -30 Td',
    '(Getting Started) Tj',
    '/F1 11 Tf',
    '0 -20 Td',
    '(1.  Upload files  -- click + New or drag files directly into Ddrive.) Tj',
    '0 -17 Td',
    '(2.  Organise      -- create folders, colour-code and lock them.) Tj',
    '0 -17 Td',
    '(3.  Share securely -- email, QR code, WhatsApp, or direct link.) Tj',
    '0 -17 Td',
    '(4.  Set privacy   -- Public, Private, or Password-protected.) Tj',
    '0 -17 Td',
    '(5.  Offline access -- pin files for local availability.) Tj',
    // Section: File Actions
    '/F2 13 Tf',
    '0 -32 Td',
    '(Available actions on every file) Tj',
    '/F1 11 Tf',
    '0 -20 Td',
    '(Open / Preview  |  Download  |  Rename  |  Star  |  Pin) Tj',
    '0 -17 Td',
    '(Move to folder  |  Share via email / QR  |  Add label  |  Delete) Tj',
    '0 -17 Td',
    '(Set privacy     |  Toggle offline  |  View file history & audit trail) Tj',
    // Section: Security
    '/F2 13 Tf',
    '0 -32 Td',
    '(Security & Privacy) Tj',
    '/F1 11 Tf',
    '0 -20 Td',
    '(All files are stored locally in your browser -- nothing leaves your device) Tj',
    '0 -17 Td',
    '(unless you explicitly share them. Folder lock, file passwords, and) Tj',
    '0 -17 Td',
    '(per-file privacy controls give you full ownership of your data.) Tj',
    // Footer
    '/F1 9 Tf',
    '56 60 Td',
    '(Ddrive  |  Secure Document Workspace  |  support@docrud.in) Tj',
    'ET',
  ];

  const stream = lines.join('\n');
  const pdf = [
    '%PDF-1.4',
    '1 0 obj',
    '<< /Type /Catalog /Pages 2 0 R >>',
    'endobj',
    '2 0 obj',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    'endobj',
    '3 0 obj',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]',
    '   /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
    'endobj',
    '4 0 obj',
    `<< /Length ${stream.length} >>`,
    'stream',
    stream,
    'endstream',
    'endobj',
    '5 0 obj',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    'endobj',
    '6 0 obj',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    'endobj',
    'xref',
    '0 7',
    '0000000000 65535 f ',
    'trailer',
    '<< /Size 7 /Root 1 0 R >>',
    'startxref',
    '0',
    '%%EOF',
  ].join('\n');

  return new Blob([pdf], { type: 'application/pdf' });
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n/1024).toFixed(1)} KB`;
  if (n < 1073741824) return `${(n/1048576).toFixed(1)} MB`;
  return `${(n/1073741824).toFixed(2)} GB`;
}

function fmtDate(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 3600000)  return `${Math.floor(diff/60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff/86400000)}d ago`;
  return new Date(ms).toLocaleDateString();
}

/* --- IndexedDB blob persistence ------------------------------------------ */

const DB_NAME    = 'docrud_drive_v1';
const BLOB_STORE = 'blobs';

function openBlobDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(BLOB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}
async function saveBlobToDb(id: string, blob: Blob) {
  const db = await openBlobDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BLOB_STORE, 'readwrite');
    tx.objectStore(BLOB_STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}
async function loadBlobFromDb(id: string): Promise<Blob | null> {
  const db = await openBlobDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(BLOB_STORE, 'readonly');
    const req = tx.objectStore(BLOB_STORE).get(id);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror   = () => reject(req.error);
  });
}
async function deleteBlobsFromDb(ids: string[]) {
  if (!ids.length) return;
  const db = await openBlobDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BLOB_STORE, 'readwrite');
    ids.forEach(id => tx.objectStore(BLOB_STORE).delete(id));
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

/* --- localStorage metadata persistence ----------------------------------- */

const LS_KEY   = 'docrud_drive_items_v3';
const PLAN_KEY = 'docrud_drive_plan_v3'; // versioned — resets with each LS_KEY bump
function saveItemsToStorage(list: DriveItem[]) {
  try {
    // Blobs can't be JSON-serialised — store everything else
    localStorage.setItem(LS_KEY, JSON.stringify(list.map(({ blob, ...rest }) => rest)));
  } catch { /* storage quota — ignore */ }
}
function loadItemsFromStorage(): DriveItem[] | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as DriveItem[]) : null;
  } catch { return null; }
}

/* --- Drive plans ---------------------------------------------------------- */

interface DrivePlan { id: string; label: string; gb: number; price: number; color: string; popular: boolean; perks: string[]; }
const DRIVE_PLANS: DrivePlan[] = [
  { id:'free',    label:'Free',    gb:  0.5, price:  0, color:'#94a3b8', popular:false,
    perks:['500 MB storage','Upload files & folders','In-app file viewer','Search, sort & pagination','Basic link sharing'] },
  { id:'starter', label:'Starter', gb: 10,   price: 49, color:'#818cf8', popular:false,
    perks:['10 GB storage','Email & WhatsApp sharing','Color label tagging','Offline availability','Private & password-protected files'] },
  { id:'pro',     label:'Pro',     gb: 50,   price: 99, color:'#a78bfa', popular:true,
    perks:['50 GB storage','QR code sharing & scanner','Folder lock protection','Move files across folders','File history & audit trail'] },
];

/** Maps server-side planId → local DRIVE_PLANS id */
function serverPlanToLocal(serverPlanId: string): string {
  if (serverPlanId === 'drive-pro')     return 'pro';
  if (serverPlanId === 'drive-starter') return 'starter';
  if (serverPlanId === 'infinity')      return 'pro'; // Infinity gets Pro-tier features
  return 'free';
}

/* --- Feature gating ------------------------------------------------------- */

const PLAN_TIER: Record<string, number> = {
  free: 0, starter: 1, pro: 2,
};

type DriveFeature =
  | 'emailShare' | 'whatsappShare' | 'fileLabels' | 'offlineToggle' | 'filePrivacy'
  | 'qrShare' | 'qrScanner' | 'folderLock' | 'fileMove' | 'fileHistory' | 'bulkMoveShare';

const FEATURE_MIN_TIER: Record<DriveFeature, number> = {
  emailShare:    1,  // Starter+
  whatsappShare: 1,
  fileLabels:    1,
  offlineToggle: 1,
  filePrivacy:   0,  // free for all plans
  qrShare:       2,  // Pro+
  qrScanner:     2,
  folderLock:    2,
  fileMove:      2,
  fileHistory:   2,
  bulkMoveShare: 2,
};

const FEATURE_REQUIRED_PLAN: Record<DriveFeature, string> = {
  emailShare:    'Starter', whatsappShare: 'Starter', fileLabels:  'Starter',
  offlineToggle: 'Starter', filePrivacy:   'Starter',
  qrShare:       'Pro',     qrScanner:     'Pro',     folderLock:  'Pro',
  fileMove:      'Pro',     fileHistory:   'Pro',     bulkMoveShare:'Pro',
};

/* --- Storage helpers ------------------------------------------------------ */

function storageBarGradient(pct: number): string {
  if (pct >= 90) return 'linear-gradient(90deg,#ef4444,#f87171)';
  if (pct >= 75) return 'linear-gradient(90deg,#f97316,#fbbf24)';
  if (pct >= 50) return 'linear-gradient(90deg,#60a5fa,#38bdf8)';
  return 'linear-gradient(90deg,#a78bfa,#818cf8)';
}

function storageAccentColor(pct: number): string {
  if (pct >= 90) return '#f87171';
  if (pct >= 75) return '#fbbf24';
  if (pct >= 50) return '#60a5fa';
  return '#a78bfa';
}

/* --- WhatsApp share ------------------------------------------------------- */

function shareOnWhatsApp(item: DriveItem) {
  const link = `https://docrud.in/drive/${item.id}`;
  const lines = [
    `📁 *${item.name}*`,
    ``,
    item.size ? `📦 Size: ${item.size}` : null,
    `🔐 ${item.privacy === 'public' ? 'Public file — anyone can view' : item.privacy === 'password' ? 'Password protected' : 'Private'}`,
    ``,
    `🔗 Open: ${link}`,
    ``,
    `_Shared via Ddrive_`,
  ].filter((l): l is string => l !== null);
  window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener,noreferrer');
}

/* --- Small helpers -------------------------------------------------------- */

function KindIcon({ kind, sz = 14 }: { kind: FileKind; sz?: number }) {
  const Map: Record<FileKind, React.ComponentType<{ style?: React.CSSProperties }>> = {
    pdf: FileText, image: ImgIcon, video: Video, audio: Music,
    doc: FileText, sheet: FileText, archive: Archive, other: FileIcon,
  };
  const Icon = Map[kind];
  return (
    <div style={{ width:sz+12, height:sz+12, borderRadius:8, background:KIND_BG[kind], display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
      <Icon style={{ width:sz, height:sz, color:KIND_COLOR[kind] }} />
    </div>
  );
}

/* --- Main component ------------------------------------------------------- */

export default function FileDriveCenter({ open, onClose }: FileDriveCenterProps) {
  /* -- Core state -- */
  const [items,     setItems]     = useState<DriveItem[]>(() => {
    if (typeof window === 'undefined') return SEED_ITEMS;
    return loadItemsFromStorage() ?? SEED_ITEMS;
  });
  const [view,      setView]      = useState<ViewMode>('list');
  const [section,   setSection]   = useState<SideSection>('my-drive');
  const [navStack,  setNavStack]  = useState<BreadcrumbEntry[]>([{ id: null, name: 'My Ddrive' }]);
  const [query,     setQuery]     = useState('');
  const trackSearchDrive = useSearchTracker(SEARCH_CONTEXTS.FILE_DRIVE);
  const [sortBy,    setSortBy]    = useState<'name'|'date'|'size'>('date');

  /* -- Selection & DnD -- */
  const [selectedIds,    setSelectedIds]    = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [draggedId,      setDraggedId]      = useState<string | null>(null);
  const [dropTargetId,   setDropTargetId]   = useState<string | null>(null);

  /* -- Overlays -- */
  const [uploadOpen,     setUploadOpen]     = useState(false);
  const [shareFile,      setShareFile]      = useState<DriveItem | null>(null);
  const [menuItem,       setMenuItem]       = useState<DriveItem | null>(null);
  const [menuPos,        setMenuPos]        = useState({ x: 0, y: 0 });
  const [pwdFile,        setPwdFile]        = useState<DriveItem | null>(null);
  const [viewerFile,     setViewerFile]     = useState<ViewableFile | null>(null);
  const [qrShareTarget,  setQrShareTarget]  = useState<QRShareTarget | null>(null);
  const [scannerOpen,    setScannerOpen]    = useState(false);
  const [folderLockId,   setFolderLockId]   = useState<string | null>(null);
  const [movingItems,    setMovingItems]    = useState<string[]>([]);  // IDs being moved
  const [newFolderOpen,  setNewFolderOpen]  = useState(false);
  const [renameItem,     setRenameItem]     = useState<string | null>(null);
  const [renameVal,      setRenameVal]      = useState('');
  const [sharedFileIds,  setSharedFileIds]  = useState<Set<string>>(new Set());
  const [unlockedFolders, setUnlockedFolders] = useState<Set<string>>(new Set());

  /* -- Upload state -- */
  const [uploadPrivacy, setUploadPrivacy] = useState<Privacy>('public');
  const [dragging,      setDragging]      = useState(false);
  const [uploadedName,  setUploadedName]  = useState('');
  const [uploading,     setUploading]     = useState(false);
  const [uploadDone,    setUploadDone]    = useState(false);

  /* -- Password gate -- */
  const [pwdInput, setPwdInput] = useState('');
  const [pwdError, setPwdError] = useState(false);

  /* -- Lock gate -- */
  const [lockInput, setLockInput] = useState('');
  const [lockError, setLockError] = useState(false);

  /* -- New folder -- */
  const [newFolderName,  setNewFolderName]  = useState('');
  const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[0]);

  /* -- Drive plan + storage -- */
  const [currentPlan, setCurrentPlan] = useState(() =>
    typeof window !== 'undefined' ? (localStorage.getItem(PLAN_KEY) ?? 'free') : 'free'
  );
  const [serverLimitGb,  setServerLimitGb]  = useState<number | null>(null);
  const [quotaLoaded,    setQuotaLoaded]    = useState(false);
  const [plansOpen,   setPlansOpen]   = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<'monthly'|'annual'>('monthly');
  const [driveCheckoutBusy,    setDriveCheckoutBusy]    = useState('');
  const [driveCheckoutError,   setDriveCheckoutError]   = useState('');
  const [driveCheckoutSuccess, setDriveCheckoutSuccess] = useState('');
  const [featureLocked, setFeatureLocked] = useState<{ feature: DriveFeature; requiredPlan: string } | null>(null);

  /* -- Pagination -- */
  const [currentPage, setCurrentPage] = useState(1);

  /* -- Label picker -- */
  const [labelTarget, setLabelTarget] = useState<string | null>(null); // item id

  /* -- Mobile sidebar + search -- */
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileSearchOpen,  setMobileSearchOpen]  = useState(false);

  /* -- Email share -- */
  const [emailFile,    setEmailFile]    = useState<DriveItem | null>(null);
  const [emailTo,      setEmailTo]      = useState('');
  const [emailNotes,   setEmailNotes]   = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent,    setEmailSent]    = useState(false);

  /* -- Chat share -- */
  const [chatQuery, setChatQuery] = useState('');
  const [chatSent,  setChatSent]  = useState<string | null>(null);
  const [historyFile, setHistoryFile] = useState<DriveItem | null>(null);
  const [chatUsers, setChatUsers] = useState<{id:string;name:string;email:string;avatarUrl?:string}[]>([]);
  const [chatSentConvId, setChatSentConvId] = useState<string|null>(null);
  const [emailError, setEmailError] = useState<string>('');

  /* -- Deep-link (email action buttons: drive-open / drive-import) -- */
  const [deepLinkFileId,  setDeepLinkFileId]  = useState<string | null>(null);
  const [deepLinkAction,  setDeepLinkAction]  = useState<'open' | 'import' | null>(null);
  const [importConfirm,   setImportConfirm]   = useState<{ id: string; name: string } | null>(null);
  const DEMO_PEOPLE = [
    { id:'p1', name:'Arjun Sharma',  initial:'A' },
    { id:'p2', name:'Priya Nair',    initial:'P' },
    { id:'p3', name:'Rahul Verma',   initial:'R' },
    { id:'p4', name:'Kavitha Reddy', initial:'K' },
    { id:'p5', name:'Nikhil Gupta',  initial:'N' },
  ];

  const pendingFileRef = useRef<File | null>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);

  const currentFolderId = navStack[navStack.length - 1].id;

  /* -- Storage accounting -- */
  const storageUsed  = useMemo(
    () => items.filter(i => i.type === 'file').reduce((s, i) => s + (i.bytes ?? 0), 0),
    [items],
  );
  const storagePlan  = DRIVE_PLANS.find(p => p.id === currentPlan) ?? DRIVE_PLANS[0];
  // Use server-authoritative limitGb when available, else fall back to plan definition
  const storageTotal = (serverLimitGb ?? storagePlan.gb) * 1_073_741_824;
  const storagePct   = Math.min(100, (storageUsed / storageTotal) * 100);
  const storageNear  = storagePct > 85;

  /* -- Fetch real quota from server on open -- */
  useEffect(() => {
    if (!open) return;
    fetch('/api/billing/drive-upgrade')
      .then(r => r.ok ? r.json() : null)
      .then((q: { limitGb: number; planId: string; source: string } | null) => {
        if (!q) return;
        setServerLimitGb(q.limitGb);
        const localPlan = serverPlanToLocal(q.planId);
        setCurrentPlan(localPlan);
        localStorage.setItem(PLAN_KEY, localPlan);
        setQuotaLoaded(true);
      })
      .catch(() => { setQuotaLoaded(true); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* -- Persist metadata to localStorage whenever items change -- */
  useEffect(() => { saveItemsToStorage(items); }, [items]);

  /* -- Reload blobs from IndexedDB on mount (for files uploaded in prior sessions) -- */
  useEffect(() => {
    items.forEach(item => {
      if (item.type === 'file' && !item.blob) {
        loadBlobFromDb(item.id).then(blob => {
          if (blob) setItems(prev => prev.map(i => i.id === item.id ? { ...i, blob } : i));
        }).catch(() => {});
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -- Close context menu on outside click -- */
  useEffect(() => {
    if (!menuItem) return;
    const handler = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest('[data-ctx-menu]') && !el.closest('[data-menu-anchor]')) setMenuItem(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuItem]);

  /* -- Reset page whenever filters change -- */
  useEffect(() => { setCurrentPage(1); }, [section, currentFolderId, query, sortBy]);

  /* -- Storage capacity email alerts (fire once per threshold, tracked in localStorage) -- */
  useEffect(() => {
    const thresholds = [
      { key: 'drive_alert_100', level: '100', pct: 100 },
      { key: 'drive_alert_90',  level: '90',  pct: 90  },
      { key: 'drive_alert_75',  level: '75',  pct: 75  },
    ];
    for (const t of thresholds) {
      if (storagePct >= t.pct && !localStorage.getItem(t.key)) {
        localStorage.setItem(t.key, '1');
        const gbLabel = storagePlan.gb >= 1024 ? `${storagePlan.gb / 1024} TB` : `${storagePlan.gb} GB`;
        fetch('/api/billing/storage-alert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            level: t.level,
            used: fmtSize(storageUsed),
            total: fmtSize(storageTotal),
            planLabel: `${storagePlan.label} (${gbLabel})`,
          }),
        }).catch(() => {});
        break; // only fire the highest threshold that hasn't fired yet
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storagePct]);

  /* -- Razorpay drive plan checkout -- */
  const handleDriveUpgrade = useCallback(async (planId: string) => {
    if (planId === 'free') {
      setCurrentPlan('free');
      localStorage.removeItem('drive_alert_75');
      localStorage.removeItem('drive_alert_90');
      localStorage.removeItem('drive_alert_100');
      setPlansOpen(false);
      return;
    }

    setDriveCheckoutBusy(planId);
    setDriveCheckoutError('');

    try {
      const res = await fetch('/api/billing/drive-upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: `drive-${planId}`, period: billingPeriod }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.order?.id || !data?.keyId) {
        throw new Error(data?.error || 'Unable to start checkout.');
      }

      const loaded = await new Promise<boolean>((resolve) => {
        if (window.Razorpay) { resolve(true); return; }
        const s = document.createElement('script');
        s.src = 'https://checkout.razorpay.com/v1/checkout.js';
        s.onload = () => resolve(true);
        s.onerror = () => resolve(false);
        document.body.appendChild(s);
      });
      if (!loaded || !window.Razorpay) throw new Error('Payment gateway unavailable on this device.');

      const rzp = new window.Razorpay({
        key: data.keyId,
        amount: data.pricing?.totalAmountInPaise,
        currency: 'INR',
        name: 'Ddrive',
        description: data.planLabel,
        order_id: data.order.id,
        handler: async (payment: Record<string, string>) => {
          try {
            const verifyRes = await fetch('/api/billing/drive-upgrade', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...payment, planId: `drive-${planId}`, period: billingPeriod }),
            });
            const verifyData = await verifyRes.json().catch(() => null);
            if (!verifyRes.ok) throw new Error(verifyData?.error || 'Verification failed.');
            setCurrentPlan(planId);
            const grantedGb: number = verifyData?.grantedGb ?? (DRIVE_PLANS.find(p => p.id === planId)?.gb ?? 0);
            setServerLimitGb(grantedGb);
            localStorage.setItem(PLAN_KEY, planId);
            localStorage.removeItem('drive_alert_75');
            localStorage.removeItem('drive_alert_90');
            localStorage.removeItem('drive_alert_100');
            const plan = DRIVE_PLANS.find((p) => p.id === planId);
            setDriveCheckoutSuccess(`You're now on the ${plan?.label ?? planId} plan! Invoice sent to your email.`);
            setDriveCheckoutBusy('');
            setTimeout(() => { setPlansOpen(false); setDriveCheckoutSuccess(''); }, 3000);
          } catch (verifyErr) {
            setDriveCheckoutError(verifyErr instanceof Error ? verifyErr.message : 'Verification failed.');
            setDriveCheckoutBusy('');
          }
        },
        modal: { ondismiss: () => setDriveCheckoutBusy('') },
        prefill: { name: data.customer?.name || '', email: data.customer?.email || '' },
        theme: { color: '#7c3aed' },
      });
      rzp.on('payment.failed', () => {
        setDriveCheckoutError('Payment failed. Please try again.');
        setDriveCheckoutBusy('');
      });
      rzp.open();
    } catch (e) {
      setDriveCheckoutError(e instanceof Error ? e.message : 'Checkout failed.');
      setDriveCheckoutBusy('');
    }
  }, [billingPeriod]);

  // currentPlan is persisted to localStorage in the quota-fetch effect and payment success handler

  /* -- Feature gating helpers -- */
  const currentTier = PLAN_TIER[currentPlan] ?? 0;

  const featureAvailable = useCallback((feature: DriveFeature): boolean => {
    return currentTier >= FEATURE_MIN_TIER[feature];
  }, [currentTier]);

  const checkFeature = useCallback((feature: DriveFeature): boolean => {
    if (currentTier >= FEATURE_MIN_TIER[feature]) return true;
    setFeatureLocked({ feature, requiredPlan: FEATURE_REQUIRED_PLAN[feature] });
    return false;
  }, [currentTier]);

  /* auto-dismiss feature-lock toast after 5 s */
  useEffect(() => {
    if (!featureLocked) return;
    const t = setTimeout(() => setFeatureLocked(null), 5000);
    return () => clearTimeout(t);
  }, [featureLocked]);

  /* -- Visible items -- */
  const visibleItems = useMemo(() => {
    let list = items;
    if (section === 'my-drive') {
      list = list.filter(i => i.parentId === currentFolderId);
    } else if (section === 'recent') {
      list = [...items].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 20);
    } else if (section === 'starred') {
      list = list.filter(i => i.starred);
    } else if (section === 'shared') {
      list = list.filter(i => i.sharedViaQr || listSharesForItem(i.id).length > 0);
    } else if (section === 'offline') {
      list = list.filter(i => i.offlineAvailable);
    }
    if (query) {
      list = list.filter(i => i.name.toLowerCase().includes(query.toLowerCase()));
    }
    // Sort: folders first, then by sortBy
    list = [...list].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'size') return (b.bytes ?? 0) - (a.bytes ?? 0);
      return b.updatedAt - a.updatedAt;
    });
    return list;
  }, [items, section, currentFolderId, query, sortBy]);

  /* -- Paginated slice -- */
  const totalPages   = Math.max(1, Math.ceil(visibleItems.length / PAGE_SIZE));
  const pagedItems   = visibleItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Track search after filter is applied
  useEffect(() => {
    if (query.trim()) trackSearchDrive(query, visibleItems.length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, visibleItems.length]);

  /* -- Pinned items (for grid header) -- */
  const pinnedItems = useMemo(
    () => items.filter(i => i.pinned && (section === 'my-drive' || section === 'starred')).slice(0, 6),
    [items, section],
  );

  /* -- Folder count helper -- */
  const folderItemCount = useCallback((folderId: string) =>
    items.filter(i => i.parentId === folderId).length
  , [items]);

  /* -- History helper -- */
  function addHistory(itemId: string, action: string, detail?: string, icon = '📋') {
    const entry: FileHistoryEntry = { id: `h${Date.now()}${Math.random()}`, action, timestamp: Date.now(), detail, icon };
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, history: [...(i.history ?? []), entry] } : i));
  }

  /* -- Fetch chat users when share panel opens -- */
  useEffect(() => {
    if (!shareFile) return;
    fetch('/api/drive/chat-users').then(r => r.json()).then(d => {
      if (d.users) setChatUsers(d.users);
    }).catch(() => {});
  }, [shareFile]);

  /* -- Read deep-link URL params once on mount -- */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const openId   = params.get('drive-open');
    const importId = params.get('drive-import');
    if (openId)   { setDeepLinkFileId(openId);   setDeepLinkAction('open');   }
    if (importId) { setDeepLinkFileId(importId); setDeepLinkAction('import'); }
    // Clear params from URL without reload so refreshes don't re-trigger
    if ((openId || importId) && window.history?.replaceState) {
      const clean = new URL(window.location.href);
      clean.searchParams.delete('drive-open');
      clean.searchParams.delete('drive-import');
      window.history.replaceState({}, '', clean.toString());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -- Execute deep-link action once drive is open + items are loaded -- */
  useEffect(() => {
    if (!open || !deepLinkFileId || !deepLinkAction) return;
    if (deepLinkAction === 'open') {
      const found = items.find(i => i.id === deepLinkFileId);
      if (found && found.type === 'file') {
        openFile(found);
        addHistory(found.id, 'Opened via email link', undefined, '🔗');
      }
      // Clear so it doesn't re-fire
      setDeepLinkFileId(null);
      setDeepLinkAction(null);
    } else if (deepLinkAction === 'import') {
      const already = items.find(i => i.id === deepLinkFileId);
      if (already) {
        // Already in drive — just open it
        if (already.type === 'file') openFile(already);
      } else {
        // Show import confirmation
        setImportConfirm({ id: deepLinkFileId, name: 'Shared File' });
      }
      setDeepLinkFileId(null);
      setDeepLinkAction(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deepLinkFileId, deepLinkAction]);

  /* -- Handlers -- */

  function navigateInto(folder: DriveItem) {
    if (folder.locked && !unlockedFolders.has(folder.id)) {
      setFolderLockId(folder.id);
      return;
    }
    setNavStack(prev => [...prev, { id: folder.id, name: folder.name }]);
    setSection('my-drive');
    setSelectedIds(new Set());
    setQuery('');
  }

  function navigateTo(crumbIdx: number) {
    setNavStack(prev => prev.slice(0, crumbIdx + 1));
    setSelectedIds(new Set());
  }

  function openFile(item: DriveItem) {
    if (item.privacy === 'password') { setPwdFile(item); return; }
    addHistory(item.id, 'Viewed', item.name, '👁️');
    const blob = item.blob ?? buildDemoBlob(item);
    setViewerFile({
      name: item.name,
      blob: blob ?? new Blob([], { type: item.mimeType ?? 'application/octet-stream' }),
      mimeType: item.mimeType ?? blob?.type,
      size: item.bytes ?? blob?.size,
    });
  }

  function handleItemClick(item: DriveItem, e: React.MouseEvent) {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      // Toggle select
      setSelectedIds(prev => { const n = new Set(Array.from(prev)); n.has(item.id) ? n.delete(item.id) : n.add(item.id); return n; });
      setLastSelectedId(item.id);
      return;
    }
    if (e.shiftKey && lastSelectedId) {
      // Range select
      const ids = visibleItems.map(i => i.id);
      const a = ids.indexOf(lastSelectedId), b = ids.indexOf(item.id);
      if (a !== -1 && b !== -1) {
        const range = ids.slice(Math.min(a, b), Math.max(a, b) + 1);
        setSelectedIds(new Set(range));
      }
      return;
    }
    // Normal click
    if (selectedIds.size > 0) {
      setSelectedIds(new Set());
      return;
    }
    if (item.type === 'folder') navigateInto(item);
    else openFile(item);
    setLastSelectedId(item.id);
  }

  function handleCheckbox(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedIds(prev => { const n = new Set(Array.from(prev)); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function toggleStar(id: string) {
    const item = items.find(i => i.id === id);
    setItems(p => p.map(i => i.id === id ? { ...i, starred: !i.starred } : i));
    addHistory(id, item?.starred ? 'Unstarred' : 'Starred', undefined, item?.starred ? '☆' : '⭐');
    setMenuItem(null);
  }

  function togglePin(id: string) {
    const item = items.find(i => i.id === id);
    setItems(p => p.map(i => i.id === id ? { ...i, pinned: !i.pinned } : i));
    addHistory(id, item?.pinned ? 'Unpinned' : 'Pinned', undefined, '📌');
    setMenuItem(null);
  }

  function toggleOffline(id: string) {
    const item = items.find(i => i.id === id);
    setItems(p => p.map(i => i.id === id ? { ...i, offlineAvailable: !i.offlineAvailable } : i));
    addHistory(id, item?.offlineAvailable ? 'Removed offline' : 'Made available offline', undefined, '📶');
    setMenuItem(null);
  }

  function deleteItems(ids: string[]) {
    const toDelete = new Set(ids);
    const collect = (parentId: string) => {
      items.filter(i => i.parentId === parentId).forEach(child => {
        toDelete.add(child.id);
        if (child.type === 'folder') collect(child.id);
      });
    };
    ids.forEach(id => { const it = items.find(i => i.id === id); if (it?.type === 'folder') collect(id); });
    deleteBlobsFromDb(Array.from(toDelete)).catch(() => {});
    setItems(p => p.filter(i => !toDelete.has(i.id)));
    setSelectedIds(new Set());
    setMenuItem(null);
  }

  function moveItems(itemIds: string[], targetFolderId: string | null) {
    setItems(p => p.map(i => itemIds.includes(i.id) ? { ...i, parentId: targetFolderId, updatedAt: Date.now() } : i));
    itemIds.forEach(id => addHistory(id, 'Moved', targetFolderId ? 'to folder' : 'to root', '📂'));
    setMovingItems([]);
    setSelectedIds(new Set());
  }

  function startRename(item: DriveItem) {
    setRenameItem(item.id);
    setRenameVal(item.name);
    setMenuItem(null);
  }

  function commitRename() {
    if (renameItem && renameVal.trim()) {
      setItems(p => p.map(i => i.id === renameItem ? { ...i, name: renameVal.trim(), updatedAt: Date.now() } : i));
      addHistory(renameItem, 'Renamed', renameVal.trim(), '✏️');
    }
    setRenameItem(null);
    setRenameVal('');
  }

  function createFolder() {
    if (!newFolderName.trim()) return;
    const folder: DriveItem = {
      id: `d${Date.now()}`, parentId: currentFolderId, type: 'folder',
      name: newFolderName.trim(), createdAt: Date.now(), updatedAt: Date.now(),
      folderColor: newFolderColor,
    };
    setItems(p => [folder, ...p]);
    setNewFolderOpen(false);
    setNewFolderName('');
    setNewFolderColor(FOLDER_COLORS[0]);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) { pendingFileRef.current = f; setUploadedName(f.name); }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) { pendingFileRef.current = f; setUploadedName(f.name); }
  }

  async function doUpload() {
    if (!uploadedName || uploading) return;
    const realFile = pendingFileRef.current;
    const newBytes = realFile?.size ?? 0;
    if (storageUsed + newBytes > storageTotal) {
      setUpgradeOpen(true);
      return;
    }
    setUploading(true);
    await new Promise(r => setTimeout(r, 1200));
    const ext = uploadedName.split('.').pop()?.toLowerCase() ?? '';
    const kind: FileKind =
      ext === 'pdf' ? 'pdf' :
      ['jpg','jpeg','png','gif','webp','svg'].includes(ext) ? 'image' :
      ['mp4','mov','avi','mkv'].includes(ext) ? 'video' :
      ['mp3','m4a','wav','ogg','flac'].includes(ext) ? 'audio' :
      ['doc','docx'].includes(ext) ? 'doc' :
      ['xls','xlsx','csv'].includes(ext) ? 'sheet' :
      ['zip','rar','7z','tar','gz'].includes(ext) ? 'archive' : 'other';
    const newId   = `f${Date.now()}`;
    const newItem: DriveItem = {
      id: newId, parentId: currentFolderId, type: 'file',
      name: uploadedName, kind, size: realFile ? fmtSize(realFile.size) : '—',
      bytes: realFile?.size, privacy: uploadPrivacy, createdAt: Date.now(), updatedAt: Date.now(),
      blob: realFile ?? undefined, mimeType: realFile?.type, views: 0,
    };
    setItems(prev => [newItem, ...prev]);
    addHistory(newId, 'Uploaded', `${fmtSize(realFile?.size ?? 0)} · ${uploadPrivacy}`, '📤');
    if (realFile) saveBlobToDb(newId, realFile).catch(() => {});
    pendingFileRef.current = null;
    setUploading(false);
    setUploadDone(true);
    setTimeout(() => { setUploadOpen(false); setUploadedName(''); setUploadDone(false); }, 1400);
  }

  function tryPwd() {
    if (pwdInput === '1234') {
      const f = pwdFile;
      setPwdFile(null); setPwdInput('');
      if (f) openFile({ ...f, privacy: 'public' });
    } else { setPwdError(true); setTimeout(() => setPwdError(false), 800); }
  }

  function tryLock() {
    const folder = items.find(i => i.id === folderLockId);
    if (!folder) return;
    if (lockInput === (folder.lockPassword ?? 'admin123')) {
      setUnlockedFolders(prev => { const n = new Set(Array.from(prev)); n.add(folder.id); return n; });
      setFolderLockId(null); setLockInput('');
      navigateInto({ ...folder, locked: false });
    } else { setLockError(true); setTimeout(() => setLockError(false), 800); }
  }

  function lockFolder(id: string) {
    setUnlockedFolders(prev => { const n = new Set(Array.from(prev)); n.delete(id); return n; });
    setMenuItem(null);
  }

  function setItemLabel(id: string, label: string | undefined) {
    setItems(p => p.map(i => i.id === id ? { ...i, label } : i));
    addHistory(id, label ? 'Label added' : 'Label removed', label ?? undefined, '🏷️');
    setLabelTarget(null);
    setMenuItem(null);
  }

  async function sendEmail() {
    if (!emailFile || !emailTo.trim()) return;
    setEmailSending(true);
    setEmailError('');
    try {
      // Read blob bytes if available
      let attachment: number[] | undefined;
      if (emailFile.blob) {
        const buf = await emailFile.blob.arrayBuffer();
        attachment = Array.from(new Uint8Array(buf));
      }
      const res = await fetch('/api/drive/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: emailTo.trim(),
          subject: `Shared with you: ${emailFile.name}`,
          senderNote: emailNotes.trim() || undefined,
          fileName: emailFile.name,
          fileSize: emailFile.size,
          fileKind: emailFile.kind,
          fileId: emailFile.id,
          filePrivacy: emailFile.privacy,
          attachment,
          attachmentMime: emailFile.mimeType,
          attachmentName: emailFile.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to send');
      addHistory(emailFile.id, 'Shared via Email', emailTo.trim(), '📧');
      setEmailSent(true);
      setTimeout(() => { setEmailFile(null); setEmailTo(''); setEmailNotes(''); setEmailSent(false); }, 2000);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setEmailSending(false);
    }
  }

  function handleScannerFileAdded(added: AddedShareFile) {
    /* prefer the real server transfer id, fall back to token-based stub id */
    const newId = added.transferId ?? `shared_${added.token}`;
    const ext = added.name.split('.').pop()?.toLowerCase() ?? '';
    const kind: FileKind = ext === 'pdf' ? 'pdf' : ['jpg','jpeg','png','gif','webp'].includes(ext) ? 'image' : ['mp4','mov'].includes(ext) ? 'video' : ['mp3','m4a'].includes(ext) ? 'audio' : ['doc','docx'].includes(ext) ? 'doc' : ['xls','xlsx','csv'].includes(ext) ? 'sheet' : ['zip','rar'].includes(ext) ? 'archive' : 'other';
    setItems(prev => {
      if (prev.some(i => i.id === newId)) return prev;
      return [{ id: newId, parentId: currentFolderId, type: 'file', name: added.name, kind, size: '—', privacy: 'public', createdAt: Date.now(), updatedAt: Date.now(), views: 0, sharedViaQr: true }, ...prev];
    });
    setSharedFileIds(prev => { const n = new Set(Array.from(prev)); n.add(newId); return n; });
    setScannerOpen(false);
  }

  /* -- DnD on items -- */
  function handleDragItemStart(e: React.DragEvent, item: DriveItem) {
    e.dataTransfer.setData('itemId', item.id);
    setDraggedId(item.id);
  }
  function handleDragItemEnd() { setDraggedId(null); setDropTargetId(null); }
  function handleFolderDragOver(e: React.DragEvent, folderId: string) {
    e.preventDefault(); e.stopPropagation();
    if (draggedId && draggedId !== folderId) setDropTargetId(folderId);
  }
  function handleFolderDrop(e: React.DragEvent, folderId: string) {
    e.preventDefault(); e.stopPropagation();
    const itemId = e.dataTransfer.getData('itemId');
    if (itemId && itemId !== folderId) moveItems([itemId], folderId);
    setDropTargetId(null); setDraggedId(null);
  }

  function openContextMenu(e: React.MouseEvent, item: DriveItem) {
    e.preventDefault(); e.stopPropagation();
    setMenuPos({ x: e.clientX, y: e.clientY });
    setMenuItem(item);
  }

  if (!open || typeof document === 'undefined') return null;

  /* -- Render --------------------------------------------------------------- */
  return createPortal(
    <>
      {/* Global styles */}
      <style>{`
        @keyframes fd-bd   { from{opacity:0} to{opacity:1} }
        @keyframes fd-in   { from{opacity:0;transform:translateY(20px) scale(.975)} to{opacity:1;transform:none} }
        @keyframes fd-row  { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:none} }
        @keyframes fd-card { from{opacity:0;transform:translateY(10px) scale(.97)} to{opacity:1;transform:none} }
        @keyframes fd-over { from{opacity:0;transform:scale(.95) translateY(8px)} to{opacity:1;transform:none} }
        @keyframes fd-spin { to{transform:rotate(360deg)} }
        @keyframes fd-shake{ 0%,100%{transform:translateX(0)} 30%{transform:translateX(-6px)} 70%{transform:translateX(6px)} }
        @keyframes fd-bulk { from{opacity:0;transform:translateY(100%)} to{opacity:1;transform:translateY(0)} }
        @keyframes fd-slide-up { from{opacity:0;transform:translateY(40px)} to{opacity:1;transform:none} }
        @keyframes fd-fade { from{opacity:0} to{opacity:1} }

        .fd-row  { transition:background .08s; cursor:pointer; }
        .fd-row:hover  { background:rgba(255,255,255,.035)!important; }
        .fd-row-folder { background:transparent; }
        .fd-row-folder:hover { background:rgba(255,255,255,.035)!important; }

        /* Recent section — larger rows on desktop */
        @media(min-width:640px){
          .fd-recent-list .fd-row { padding-top:14px!important; padding-bottom:14px!important; }
          .fd-recent-list .fd-row-icon-wrap { width:36px!important; height:36px!important; border-radius:11px!important; }
          .fd-recent-list .fd-row-name { font-size:14px!important; }
          .fd-recent-list .fd-row-meta { font-size:11px!important; }
          .fd-recent-list .fd-col-size,
          .fd-recent-list .fd-col-date { font-size:11px!important; }
        }

        .fd-card { transition:background .12s,transform .14s cubic-bezier(.34,1.56,.64,1),box-shadow .14s; }
        .fd-card:hover { background:rgba(255,255,255,.055)!important; transform:translateY(-2px); box-shadow:0 8px 28px rgba(0,0,0,.40); }
        .fd-card-folder { background:rgba(255,255,255,.03)!important; }
        .fd-card-folder:hover { background:rgba(255,255,255,.06)!important; }
        .fd-card.drag-over { border-color:rgba(255,255,255,.30)!important; background:rgba(255,255,255,.06)!important; }

        .fd-tab  { transition:background .10s,color .10s; border-radius:10px; }
        .fd-tab:hover  { background:rgba(255,255,255,.045)!important; }
        .fd-tab.active { background:rgba(255,255,255,.07)!important; }

        .fd-zone { transition:border-color .14s,background .14s; }
        .fd-zone.drag { border-color:rgba(139,92,246,.6)!important; background:rgba(139,92,246,.08)!important; }

        .fd-act  { transition:color .10s,background .10s,transform .10s; }
        .fd-act:hover { background:rgba(255,255,255,.08)!important; color:rgba(255,255,255,.80)!important; transform:scale(1.05); }

        .fd-bulk { animation:fd-bulk .24s cubic-bezier(.22,1,.36,1) both; }
        .fd-ctx-menu { animation:fd-over .16s cubic-bezier(.22,1,.36,1) both; }
        .fd-selected { background:rgba(99,102,241,.11)!important; outline:1.5px solid rgba(99,102,241,.40); }
        .fd-dragging { opacity:.38; transform:scale(.96); transition:opacity .1s,transform .1s; }
        .fd-plan-card { transition:transform .14s cubic-bezier(.34,1.56,.64,1),box-shadow .14s,border-color .14s,background .14s; }
        .fd-plan-card:hover { transform:translateY(-4px) scale(1.02); box-shadow:0 16px 40px rgba(0,0,0,.55); }
        .fd-input { background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.10); border-radius:10px; padding:10px 13px; color:rgba(255,255,255,.88); font-size:13px; outline:none; width:100%; box-sizing:border-box; transition:border-color .12s; }
        .fd-input:focus { border-color:rgba(139,92,246,.50); box-shadow:0 0 0 3px rgba(139,92,246,.10); }
        .fd-textarea { background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.10); border-radius:10px; padding:10px 13px; color:rgba(255,255,255,.88); font-size:13px; outline:none; width:100%; box-sizing:border-box; resize:vertical; min-height:80px; transition:border-color .12s; font-family:inherit; }
        .fd-textarea:focus { border-color:rgba(139,92,246,.50); box-shadow:0 0 0 3px rgba(139,92,246,.10); }

        .fd-mobile-drawer { animation:fd-slide-up .28s cubic-bezier(.22,1,.36,1) both; }
        .fd-label-dot { display:inline-block; width:8px; height:8px; border-radius:50%; flex-shrink:0; }
        .fd-scroll::-webkit-scrollbar { width:4px; }
        .fd-scroll::-webkit-scrollbar-track { background:transparent; }
        .fd-scroll::-webkit-scrollbar-thumb { background:rgba(255,255,255,.12); border-radius:99px; }

        @media (max-width:640px) {
          .fd-hide-mobile { display:none !important; }
          .fd-show-mobile { display:flex !important; }
          /* Header tightening */
          .fd-header { gap:5px !important; padding:8px 10px !important; }
          .fd-search-box { width:0 !important; overflow:hidden !important; padding:0 !important; border-color:transparent !important; flex:0 !important; }
          .fd-search-box.open { width:100% !important; flex:1 !important; }
          .fd-search-full { position:absolute; left:0; right:0; top:0; bottom:0; z-index:10; display:flex; align-items:center; gap:8px; padding:0 10px; background:rgba(4,4,8,.99); }
          /* Row actions compact */
          .fd-row-actions { width:64px !important; }
          .fd-row-actions .fd-act-secondary { display:none !important; }
          /* Bulk bar compact */
          .fd-bulk-label { display:none !important; }
          /* Plans modal — horizontal scroll carousel */
          .fd-plans-scroll { padding:16px 16px 20px !important; }
          .fd-plans-grid {
            display:flex !important;
            flex-direction:row !important;
            overflow-x:auto !important;
            scroll-snap-type:x mandatory !important;
            -webkit-overflow-scrolling:touch !important;
            gap:12px !important;
            padding-bottom:4px !important;
          }
          .fd-plans-grid > * {
            min-width:268px !important;
            max-width:268px !important;
            flex-shrink:0 !important;
            scroll-snap-align:start !important;
          }
          .fd-plans-header { padding:16px 16px 14px !important; gap:10px !important; }
          .fd-plans-title { font-size:15px !important; }
          .fd-plans-subtitle { display:none !important; }
          .fd-plans-footer { padding:10px 16px 14px !important; flex-direction:column !important; gap:4px !important; }
          .fd-plans-icon { display:none !important; }
        }
        @media (min-width:641px) {
          .fd-show-mobile { display:none !important; }
          .fd-search-box { width:200px; }
        }
      `}</style>

      {/* Backdrop */}
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:2147483640, background:'rgba(0,0,0,.82)', backdropFilter:'blur(14px)', animation:'fd-bd .20s ease both' }} />

      {/* Mobile sidebar drawer */}
      {mobileSidebarOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:2147483660, display:'flex' }}>
          <div onClick={() => setMobileSidebarOpen(false)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.55)' }} />
          <div className="fd-mobile-drawer" style={{ position:'relative', width:220, height:'100%', background:'rgba(5,5,9,.99)', borderRight:'1px solid rgba(255,255,255,.07)', display:'flex', flexDirection:'column', padding:'16px 10px', gap:3, overflowY:'auto', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:12, paddingBottom:10, borderBottom:'1px solid rgba(255,255,255,.06)' }}>
              <div style={{ width:30, height:30, borderRadius:9, background:'rgba(139,92,246,.15)', border:'1px solid rgba(139,92,246,.22)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <DdriveIcon size={13} />
              </div>
              <span style={{ fontSize:13, fontWeight:800, color:'rgba(255,255,255,.88)' }}>Ddrive</span>
              <button onClick={() => setMobileSidebarOpen(false)} style={{ marginLeft:'auto', background:'transparent', border:'none', cursor:'pointer', color:'rgba(255,255,255,.35)' }}><X style={{width:14,height:14}}/></button>
            </div>
            {([
              { id:'my-drive',  label:'My Ddrive',   Icon:(p: {style?: React.CSSProperties}) => <DdriveIcon size={14} style={p.style} />,  badge:null },
              { id:'recent',    label:'Recent',     Icon:Clock,      badge:null },
              { id:'starred',   label:'Starred',    Icon:Star,       badge:items.filter(i=>i.starred).length },
              { id:'shared',    label:'Shared',     Icon:Users,      badge:null },
              { id:'analytics', label:'Analytics',  Icon:BarChart2,  badge:null },
            ] as {id:SideSection,label:string,Icon:React.ComponentType<{style?:React.CSSProperties}>,badge:number|null}[]).map(({ id, label, Icon, badge }) => (
              <button key={id} onClick={() => { setSection(id); setNavStack([{id:null,name:'My Ddrive'}]); setQuery(''); setSelectedIds(new Set()); setMobileSidebarOpen(false); }}
                className={`fd-tab${section===id?' active':''}`}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 12px', border:'none', background:'transparent', cursor:'pointer', width:'100%', textAlign:'left', borderRadius:9 }}>
                <Icon style={{ width:14, height:14, color:section===id?'rgba(255,255,255,.78)':'rgba(255,255,255,.28)', flexShrink:0 }} />
                <span style={{ fontSize:13, fontWeight:section===id?600:400, color:section===id?'rgba(255,255,255,.85)':'rgba(255,255,255,.42)', flex:1 }}>{label}</span>
                {badge != null && badge > 0 && <span style={{ fontSize:9, fontWeight:700, background:'rgba(255,255,255,.08)', color:'rgba(255,255,255,.40)', borderRadius:5, padding:'1px 6px' }}>{badge}</span>}
              </button>
            ))}
            <div style={{ marginTop:'auto', padding:'10px 8px 4px', borderTop:'1px solid rgba(255,255,255,.05)' }}>
              <div style={{ height:3, borderRadius:99, background:'rgba(255,255,255,.06)', overflow:'hidden', marginBottom:6 }}>
                <div style={{ height:'100%', width:`${storagePct.toFixed(1)}%`, borderRadius:99, background: storagePct >= 90 ? 'rgba(248,113,113,.65)' : storagePct >= 75 ? 'rgba(251,146,60,.55)' : 'rgba(255,255,255,.30)' }} />
              </div>
              <p style={{ margin:'0 0 7px', fontSize:9, color:'rgba(255,255,255,.28)', textAlign:'center' }}>{fmtSize(storageUsed)} of {fmtSize(storageTotal)}</p>
              <button onClick={() => { setPlansOpen(true); setMobileSidebarOpen(false); }} style={{ width:'100%', padding:'7px', borderRadius:8, border:'1px solid rgba(255,255,255,.10)', background:'rgba(255,255,255,.04)', cursor:'pointer', fontSize:10.5, fontWeight:600, color:'rgba(255,255,255,.45)' }}>
                Manage plan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal container */}
      <div style={{ position:'fixed', inset:0, zIndex:2147483641, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
        <div
          onClick={e => e.stopPropagation()}
          style={{ pointerEvents:'auto', width:'100%', height:'100%', background:'rgba(4,4,8,.99)', backdropFilter:'blur(60px)', border:'none', display:'flex', flexDirection:'column', overflow:'hidden', animation:'fd-in .28s cubic-bezier(.22,1,.36,1) both' }}
        >

          {/* == HEADER == */}
          <div className="fd-header" style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 14px', borderBottom:'1px solid rgba(255,255,255,.065)', flexShrink:0, background:'rgba(255,255,255,.012)', position:'relative' }}>

            {/* Mobile full-width search overlay */}
            {mobileSearchOpen && (
              <div className="fd-search-full">
                <Search style={{ width:13, height:13, color:'rgba(255,255,255,.35)', flexShrink:0 }} />
                <input autoFocus type="text" placeholder="Search files & folders…" value={query} onChange={e => setQuery(e.target.value)}
                  style={{ border:'none', background:'transparent', outline:'none', fontSize:13, color:'rgba(255,255,255,.80)', width:'100%', caretColor:'#a78bfa' }} />
                <button onClick={() => { setQuery(''); setMobileSearchOpen(false); }} style={{ border:'none', background:'rgba(255,255,255,.06)', borderRadius:7, cursor:'pointer', color:'rgba(255,255,255,.45)', padding:'4px 8px', fontSize:11, flexShrink:0 }}>Done</button>
              </div>
            )}

            {/* Mobile hamburger */}
            <button className="fd-show-mobile" onClick={() => setMobileSidebarOpen(true)} style={{ width:32, height:32, borderRadius:9, border:'1px solid rgba(255,255,255,.08)', background:'rgba(255,255,255,.04)', display:'none', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,.45)', cursor:'pointer', flexShrink:0 }}>
              <List style={{ width:14, height:14 }} />
            </button>

            {/* Logo — desktop only */}
            <div className="fd-hide-mobile" style={{ width:32, height:32, borderRadius:10, background:'linear-gradient(135deg,rgba(139,92,246,.18),rgba(99,102,241,.10))', border:'1px solid rgba(139,92,246,.24)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <DdriveIcon size={14} />
            </div>
            <span className="fd-hide-mobile" style={{ fontSize:13, fontWeight:700, color:'rgba(255,255,255,.55)', letterSpacing:'.01em', flexShrink:0 }}>Ddrive</span>

            {/* Breadcrumbs */}
            <div style={{ display:'flex', alignItems:'center', gap:1, flex:1, minWidth:0, overflow:'hidden' }}>
              {navStack.map((crumb, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:1, flexShrink: i < navStack.length-1 ? 0 : 1, minWidth:0 }}>
                  {i > 0 && <ChevronRight style={{ width:10, height:10, color:'rgba(255,255,255,.16)', flexShrink:0 }} />}
                  <button onClick={() => navigateTo(i)}
                    style={{ border:'none', background:'transparent', cursor:i < navStack.length-1?'pointer':'default', padding:'3px 6px', borderRadius:7, fontSize:12, fontWeight:i===navStack.length-1?600:400, color:i===navStack.length-1?'rgba(255,255,255,.80)':'rgba(255,255,255,.32)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:i===navStack.length-1?160:90, transition:'color .10s' }}>
                    {i === 0 ? <span style={{ display:'flex', alignItems:'center', gap:4 }}><Home style={{ width:10, height:10 }} /><span className="fd-hide-mobile">{crumb.name}</span></span> : crumb.name}
                  </button>
                </div>
              ))}
            </div>

            {/* Search — desktop inline, mobile icon */}
            <div className="fd-search-box fd-hide-mobile" style={{ display:'flex', alignItems:'center', gap:7, height:34, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)', borderRadius:11, padding:'0 11px', flexShrink:0, transition:'border-color .12s' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'rgba(139,92,246,.40)')}
              onBlur={e  => (e.currentTarget.style.borderColor = 'rgba(255,255,255,.08)')}>
              <Search style={{ width:12, height:12, color:'rgba(255,255,255,.28)', flexShrink:0 }} />
              <input type="text" placeholder="Search files…" value={query} onChange={e => setQuery(e.target.value)}
                style={{ border:'none', background:'transparent', outline:'none', fontSize:12, color:'rgba(255,255,255,.75)', width:'100%', caretColor:'#a78bfa' }} />
              {query && <button onClick={() => setQuery('')} style={{ border:'none', background:'transparent', cursor:'pointer', color:'rgba(255,255,255,.28)', padding:0, display:'flex' }}><X style={{ width:10, height:10 }} /></button>}
            </div>
            {/* Mobile search icon */}
            <button className="fd-show-mobile" onClick={() => setMobileSearchOpen(true)} style={{ width:32, height:32, borderRadius:9, border:'1px solid rgba(255,255,255,.08)', background:query?'rgba(139,92,246,.14)':'rgba(255,255,255,.03)', display:'none', alignItems:'center', justifyContent:'center', color:query?'#a78bfa':'rgba(255,255,255,.38)', cursor:'pointer', flexShrink:0 }}>
              <Search style={{ width:13, height:13 }} />
            </button>

            {/* View toggle — desktop only */}
            <div className="fd-hide-mobile" style={{ display:'flex', background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)', borderRadius:9, overflow:'hidden', flexShrink:0 }}>
              {(['list','grid'] as ViewMode[]).map(v => (
                <button key={v} onClick={() => setView(v)} style={{ width:30, height:30, border:'none', background:view===v?'rgba(255,255,255,.10)':'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:view===v?'rgba(255,255,255,.75)':'rgba(255,255,255,.28)', transition:'all .12s' }}>
                  {v === 'list' ? <List style={{ width:13, height:13 }} /> : <LayoutGrid style={{ width:13, height:13 }} />}
                </button>
              ))}
            </div>

            {/* Scan QR — icon only, neutral styling */}
            <button onClick={() => { if (!checkFeature('qrScanner')) return; setScannerOpen(true); }} title={featureAvailable('qrScanner') ? 'Scan QR' : 'Requires Pro'}
              style={{ width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)', borderRadius:9, cursor:'pointer', flexShrink:0, transition:'background .12s', opacity: featureAvailable('qrScanner') ? 1 : 0.50 }}
              onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,.08)')} onMouseLeave={e=>(e.currentTarget.style.background='rgba(255,255,255,.04)')}>
              <ScanLine style={{ width:13, height:13, color:'rgba(255,255,255,.50)' }} />
            </button>

            {/* New folder — icon only */}
            <button onClick={() => setNewFolderOpen(true)} title="New folder"
              style={{ width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)', borderRadius:9, cursor:'pointer', flexShrink:0, transition:'background .12s' }}
              onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,.08)')} onMouseLeave={e=>(e.currentTarget.style.background='rgba(255,255,255,.04)')}>
              <FolderPlus style={{ width:13, height:13, color:'rgba(255,255,255,.50)' }} />
            </button>

            {/* Upload */}
            <button onClick={() => setUploadOpen(true)} style={{ display:'flex', alignItems:'center', gap:6, height:32, background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.14)', borderRadius:10, padding:'0 12px', cursor:'pointer', flexShrink:0, transition:'all .12s' }}
              onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,.13)')} onMouseLeave={e=>(e.currentTarget.style.background='rgba(255,255,255,.08)')}>
              <Upload style={{ width:12, height:12, color:'rgba(255,255,255,.65)' }} />
              <span className="fd-hide-mobile" style={{ fontSize:11.5, fontWeight:600, color:'rgba(255,255,255,.70)' }}>Upload</span>
            </button>

            {/* Close */}
            <button onClick={onClose} style={{ width:30, height:30, borderRadius:'50%', border:'1px solid rgba(255,255,255,.08)', background:'rgba(255,255,255,.03)', display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,.32)', cursor:'pointer', flexShrink:0, transition:'all .12s' }}
              onMouseEnter={e=>{e.currentTarget.style.background='rgba(248,113,113,.12)';e.currentTarget.style.color='#f87171';e.currentTarget.style.borderColor='rgba(248,113,113,.22)';}}
              onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,.03)';e.currentTarget.style.color='rgba(255,255,255,.32)';e.currentTarget.style.borderColor='rgba(255,255,255,.08)';}}>
              <X style={{ width:12, height:12 }} />
            </button>
          </div>

          {/* == BODY == */}
          <div style={{ display:'flex', flex:1, minHeight:0 }}>

            {/* -- SIDEBAR -- */}
            <div className="fd-scroll fd-hide-mobile" style={{ width:200, flexShrink:0, borderRight:'1px solid rgba(255,255,255,.055)', display:'flex', flexDirection:'column', padding:'12px 10px 10px', gap:2, overflowY:'auto' }}>

              <p style={{ margin:'0 0 6px 10px', fontSize:9.5, fontWeight:800, color:'rgba(255,255,255,.22)', letterSpacing:'.10em', textTransform:'uppercase' }}>Navigation</p>

              {([
                { id:'my-drive',  label:'My Ddrive',   Icon:(p: {style?: React.CSSProperties}) => <DdriveIcon size={14} style={p.style} />,  badge:null },
                { id:'recent',    label:'Recent',     Icon:Clock,      badge:null },
                { id:'starred',   label:'Starred',    Icon:Star,       badge:items.filter(i=>i.starred).length },
                { id:'shared',    label:'Shared',     Icon:Users,      badge:null },
              ] as {id:SideSection,label:string,Icon:React.ComponentType<{style?:React.CSSProperties}>,badge:number|null}[]).map(({ id, label, Icon, badge }) => (
                <button key={id} onClick={() => { setSection(id); setNavStack([{id:null,name:'My Ddrive'}]); setQuery(''); setSelectedIds(new Set()); }}
                  className={`fd-tab${section===id?' active':''}`}
                  style={{ display:'flex', alignItems:'center', gap:9, padding:'8px 10px', border:'none', background:'transparent', cursor:'pointer', width:'100%', textAlign:'left', borderRadius:9 }}>
                  <Icon style={{ width:13, height:13, color:section===id?'rgba(255,255,255,.78)':'rgba(255,255,255,.28)', flexShrink:0 }} />
                  <span style={{ fontSize:12.5, fontWeight:section===id?600:400, color:section===id?'rgba(255,255,255,.85)':'rgba(255,255,255,.40)', flex:1 }}>{label}</span>
                  {badge != null && badge > 0 && (
                    <span style={{ fontSize:9, fontWeight:700, background:'rgba(255,255,255,.08)', color:'rgba(255,255,255,.40)', borderRadius:5, padding:'1px 6px', minWidth:16, textAlign:'center' }}>{badge}</span>
                  )}
                </button>
              ))}

              {/* Analytics separator + tab */}
              <p style={{ margin:'14px 0 5px 10px', fontSize:9.5, fontWeight:800, color:'rgba(255,255,255,.22)', letterSpacing:'.10em', textTransform:'uppercase' }}>Insights</p>
              <button onClick={() => { setSection('analytics'); setQuery(''); setSelectedIds(new Set()); }}
                className={`fd-tab${section==='analytics'?' active':''}`}
                style={{ display:'flex', alignItems:'center', gap:9, padding:'8px 10px', border:'none', background:'transparent', cursor:'pointer', width:'100%', textAlign:'left', borderRadius:9 }}>
                <BarChart2 style={{ width:13, height:13, color:section==='analytics'?'rgba(99,102,241,.90)':'rgba(255,255,255,.28)', flexShrink:0 }} />
                <span style={{ fontSize:12.5, fontWeight:section==='analytics'?600:400, color:section==='analytics'?'rgba(255,255,255,.85)':'rgba(255,255,255,.40)', flex:1 }}>Analytics</span>
              </button>

              {/* Labels */}
              {items.some(i => i.label) && (
                <>
                  <p style={{ margin:'12px 0 6px 10px', fontSize:9.5, fontWeight:800, color:'rgba(255,255,255,.22)', letterSpacing:'.10em', textTransform:'uppercase' }}>Labels</p>
                  {LABEL_COLORS.filter(lc => items.some(i => i.label === lc.hex)).map(lc => (
                    <button key={lc.hex} onClick={() => setQuery(lc.name)}
                      style={{ display:'flex', alignItems:'center', gap:9, padding:'7px 12px', borderRadius:9, border:'none', background:'transparent', cursor:'pointer', width:'100%', textAlign:'left', transition:'background .10s' }}
                      onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,.05)')}
                      onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                      <span className="fd-label-dot" style={{ background:lc.hex, width:10, height:10 }} />
                      <span style={{ fontSize:12, fontWeight:500, color:'rgba(255,255,255,.48)' }}>{lc.name}</span>
                      <span style={{ marginLeft:'auto', fontSize:9, color:'rgba(255,255,255,.22)' }}>{items.filter(i=>i.label===lc.hex).length}</span>
                    </button>
                  ))}
                </>
              )}

              {/* Storage widget */}
              <div style={{ marginTop:'auto', padding:'10px 8px 6px', borderTop:'1px solid rgba(255,255,255,.05)' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5 }}>
                  <span style={{ fontSize:9.5, fontWeight:600, color:'rgba(255,255,255,.28)', textTransform:'uppercase', letterSpacing:'.07em' }}>Storage</span>
                  <span style={{ fontSize:9.5, color:'rgba(255,255,255,.38)', fontWeight:600 }}>{Math.round(storagePct)}%</span>
                </div>
                <div style={{ height:3, borderRadius:99, background:'rgba(255,255,255,.06)', overflow:'hidden', marginBottom:6 }}>
                  <div style={{ height:'100%', width:`${storagePct.toFixed(1)}%`, borderRadius:99, background: storagePct >= 90 ? 'rgba(248,113,113,.70)' : storagePct >= 75 ? 'rgba(251,146,60,.60)' : 'rgba(255,255,255,.35)', transition:'width .5s cubic-bezier(.4,0,.2,1)' }} />
                </div>
                <p style={{ margin:'0 0 7px', fontSize:9, color:'rgba(255,255,255,.30)', textAlign:'center' }}>
                  {fmtSize(storageUsed)} of {fmtSize(storageTotal)}
                </p>
                <button onClick={() => setPlansOpen(true)}
                  style={{ width:'100%', padding:'6px', borderRadius:8, border:'1px solid rgba(255,255,255,.10)', background:'rgba(255,255,255,.04)', cursor:'pointer', fontSize:10.5, fontWeight:600, color:'rgba(255,255,255,.45)', display:'flex', alignItems:'center', justifyContent:'center', gap:4, transition:'all .10s' }}
                  onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,.08)';e.currentTarget.style.color='rgba(255,255,255,.70)';}}
                  onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,.04)';e.currentTarget.style.color='rgba(255,255,255,.45)';}}>
                  <Zap style={{ width:9, height:9 }} /> Manage plan
                </button>
              </div>
            </div>

            {/* -- MAIN CONTENT -- */}
            <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', overflow:'hidden', position:'relative' }}>

              {/* == ANALYTICS PANEL == */}
              {section === 'analytics' && (() => {
                /* ── data prep ───────────────────────────────────────── */
                const files        = items.filter(i=>i.type==='file');
                const folders      = items.filter(i=>i.type==='folder');
                const totalViews   = files.reduce((s,f)=>s+(f.views??0),0);
                const totalBytes   = files.reduce((s,f)=>s+(f.bytes??0),0);
                const sharedCount  = items.filter(i=>i.sharedViaQr||listSharesForItem(i.id).length>0).length;
                const starredCount = items.filter(i=>i.starred).length;
                const offlineCount = items.filter(i=>i.offlineAvailable).length;
                const taggedCount  = items.filter(i=>(i.tags??[]).length>0).length;
                const pinnedCount  = items.filter(i=>i.pinned).length;
                const lockedCount  = folders.filter(f=>f.locked).length;

                const kindOrder: FileKind[] = ['pdf','doc','sheet','image','video','audio','archive','other'];
                const KIND_LABELS: Record<FileKind,string> = {pdf:'PDF',doc:'Doc',sheet:'Sheet',image:'Image',video:'Video',audio:'Audio',archive:'Archive',other:'Other'};
                const KIND_SOLID: Record<FileKind,string>  = {
                  pdf:'#f87171',image:'#34d399',video:'#fb923c',audio:'#a78bfa',
                  doc:'#818cf8',sheet:'#4ade80',archive:'#fbbf24',other:'#94a3b8',
                };
                const kindStats = kindOrder.map(k=>({
                  kind:k, label:KIND_LABELS[k],
                  count:files.filter(f=>(f.kind??'other')===k).length,
                  bytes:files.filter(f=>(f.kind??'other')===k).reduce((s,f)=>s+(f.bytes??0),0),
                  color:KIND_SOLID[k],
                  views:files.filter(f=>(f.kind??'other')===k).reduce((s,f)=>s+(f.views??0),0),
                })).filter(s=>s.count>0);
                const totalKindCount = Math.max(1,kindStats.reduce((s,k)=>s+k.count,0));
                const maxKindBytes   = Math.max(1,...kindStats.map(s=>s.bytes));
                const maxKindViews   = Math.max(1,...kindStats.map(s=>s.views));

                const topFiles   = [...files].sort((a,b)=>(b.views??0)-(a.views??0)).slice(0,7);
                const maxTopView = Math.max(1,topFiles[0]?.views??1);

                const recentFiles  = [...files].sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,5);
                const largestFiles = [...files].sort((a,b)=>(b.bytes??0)-(a.bytes??0)).slice(0,5);
                const maxLargeB    = Math.max(1,largestFiles[0]?.bytes??1);

                const privBreakdown = (['public','private','password'] as const).map(p=>({
                  label: p==='public'?'Public':p==='private'?'Private':'Password',
                  count: files.filter(f=>(f.privacy??'public')===p).length,
                  color: p==='public'?'#34d399':p==='private'?'#f87171':'#fbbf24',
                })).filter(p=>p.count>0);
                const totalPriv = Math.max(1,privBreakdown.reduce((s,p)=>s+p.count,0));

                const allEvents = items.flatMap(item=>
                  (item.history??[]).map(h=>({...h,itemName:item.name,itemId:item.id}))
                ).sort((a,b)=>b.timestamp-a.timestamp);

                // Activity: last 14 days
                const nowMs = Date.now(); const dayMs = 86_400_000;
                const activity14 = Array.from({length:14},(_,i)=>{
                  const s=nowMs-(13-i)*dayMs; const e=s+dayMs;
                  const evs=allEvents.filter(ev=>ev.timestamp>=s&&ev.timestamp<e);
                  return {
                    label: new Date(s).toLocaleDateString('en-IN',{weekday:'short',day:'numeric'}),
                    shortLabel: new Date(s).toLocaleDateString('en-IN',{weekday:'short'}),
                    count: evs.length,
                    uploads: evs.filter(e=>e.action==='Uploaded').length,
                    views:   evs.filter(e=>e.action==='Opened').length,
                    shares:  evs.filter(e=>e.action==='Shared').length,
                  };
                });
                const maxDay14 = Math.max(1,...activity14.map(d=>d.count));

                // Upload trend: 30-day sparkline
                const upload30 = Array.from({length:30},(_,i)=>{
                  const s=nowMs-(29-i)*dayMs; const e=s+dayMs;
                  return allEvents.filter(ev=>ev.timestamp>=s&&ev.timestamp<e&&ev.action==='Uploaded').length;
                });
                const maxU30 = Math.max(1,...upload30);

                // Storage health
                const storagePctNum = Math.min(100,(storageUsed/storageTotal)*100);
                const storageColor  = storagePctNum>90?'#f87171':storagePctNum>75?'#fb923c':storagePctNum>50?'#fbbf24':'#6366f1';

                // File age bands
                const ageBands = [
                  {label:'Today',     days:1,   color:'#34d399'},
                  {label:'This week', days:7,   color:'#6366f1'},
                  {label:'This month',days:30,  color:'#fb923c'},
                  {label:'3 months',  days:90,  color:'#a78bfa'},
                  {label:'Older',     days:Infinity, color:'#94a3b8'},
                ].map(b=>({
                  ...b,
                  count:files.filter(f=>{
                    const ageDays=(nowMs-(f.createdAt??0))/dayMs;
                    const prevDays=b.days===1?0:b.days===7?1:b.days===30?7:b.days===90?30:90;
                    return ageDays>=prevDays&&ageDays<b.days;
                  }).length,
                })).filter(b=>b.count>0);
                const maxAge = Math.max(1,...ageBands.map(b=>b.count));

                // Top tags
                const tagMap: Record<string,number> = {};
                items.forEach(i=>(i.tags??[]).forEach(t=>{tagMap[t]=(tagMap[t]??0)+1;}));
                const topTags = Object.entries(tagMap).sort((a,b)=>b[1]-a[1]).slice(0,10);

                // Action distribution
                const actionMap: Record<string,number> = {};
                allEvents.forEach(e=>{actionMap[e.action]=(actionMap[e.action]??0)+1;});
                const topActions = Object.entries(actionMap).sort((a,b)=>b[1]-a[1]).slice(0,6);
                const maxAction  = Math.max(1,...topActions.map(a=>a[1]));

                /* ── pure-SVG chart helpers ───────────────────────────── */
                function DonutChart({segs,size=130,strokeW=12,label,sub}:{
                  segs:{v:number;c:string}[];size?:number;strokeW?:number;label?:string;sub?:string;
                }) {
                  const r=size/2-strokeW; const circ=2*Math.PI*r;
                  const total=Math.max(1,segs.reduce((s,g)=>s+g.v,0));
                  let off=circ*0.25; // start at top
                  return (
                    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeW}/>
                      {segs.filter(s=>s.v>0).map((seg,i)=>{
                        const dash=(seg.v/total)*circ-1.5; const gap=circ-dash;
                        const el=(
                          <circle key={i} cx={size/2} cy={size/2} r={r} fill="none"
                            stroke={seg.c} strokeWidth={strokeW} strokeLinecap="round"
                            strokeDasharray={`${dash.toFixed(2)} ${gap.toFixed(2)}`}
                            strokeDashoffset={off}
                          />
                        );
                        off-=(seg.v/total)*circ;
                        return el;
                      })}
                      {label&&<text x={size/2} y={size/2-5} textAnchor="middle" fill="rgba(255,255,255,.88)" fontSize="17" fontWeight="800" fontFamily="system-ui">{label}</text>}
                      {sub&&<text x={size/2} y={size/2+11} textAnchor="middle" fill="rgba(255,255,255,.30)" fontSize="9" fontFamily="system-ui">{sub}</text>}
                    </svg>
                  );
                }

                function AreaSparkline({data,color='#6366f1',height=56,width=260,fill=true}:{data:number[];color?:string;height?:number;width?:number;fill?:boolean}) {
                  if(data.length<2) return null;
                  const max=Math.max(1,...data); const pts=data.length;
                  const xs=data.map((_,i)=>((i/(pts-1))*width).toFixed(1));
                  const ys=data.map(d=>((1-d/max)*(height-8)+4).toFixed(1));
                  const lineD=xs.map((x,i)=>`${i===0?'M':'L'}${x},${ys[i]}`).join(' ');
                  const areaD=`${lineD} L${width},${height} L0,${height} Z`;
                  return (
                    <svg viewBox={`0 0 ${width} ${height}`} width="100%" preserveAspectRatio="none" style={{display:'block'}}>
                      <defs>
                        <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={color} stopOpacity="0.35"/>
                          <stop offset="100%" stopColor={color} stopOpacity="0.02"/>
                        </linearGradient>
                      </defs>
                      {fill&&<path d={areaD} fill="url(#area-grad)"/>}
                      <path d={lineD} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      {data.map((v,i)=>v===max&&(
                        <circle key={i} cx={xs[i]} cy={ys[i]} r="3" fill={color} opacity="0.9"/>
                      ))}
                    </svg>
                  );
                }

                function MultiBarChart({data,keys,colors,height=80}:{data:{label:string;[k:string]:number|string}[];keys:string[];colors:string[];height?:number}) {
                  const maxVal=Math.max(1,...data.flatMap(d=>keys.map(k=>d[k] as number)));
                  const barW=Math.max(4,Math.floor((260/data.length)-3));
                  return (
                    <svg viewBox={`0 0 ${data.length*(barW+3)} ${height+18}`} width="100%" style={{overflow:'visible'}}>
                      {data.map((d,i)=>{
                        const x=i*(barW+3);
                        return (
                          <g key={i}>
                            {keys.map((k,ki)=>{
                              const val=d[k] as number;
                              const bh=Math.max(2,(val/maxVal)*(height-6));
                              const bx=x+ki*Math.floor(barW/keys.length);
                              const bw=Math.max(2,Math.floor(barW/keys.length)-1);
                              return <rect key={ki} x={bx} y={height-bh} width={bw} height={bh} rx="3" fill={colors[ki]} opacity="0.85"/>;
                            })}
                            <text x={x+barW/2} y={height+12} textAnchor="middle" fill="rgba(255,255,255,0.22)" fontSize="7.5" fontFamily="system-ui">{d.label}</text>
                          </g>
                        );
                      })}
                    </svg>
                  );
                }

                function RadialGauge({pct,color,size=100}:{pct:number;color:string;size?:number}) {
                  const r=size/2-10; const circ=2*Math.PI*r;
                  const dash=(pct/100)*circ*0.75; const gap=circ;
                  return (
                    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{transform:'rotate(135deg)',transformOrigin:'center'}}>
                      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="8" strokeDasharray={`${circ*0.75} ${circ*0.25}`} strokeLinecap="round"/>
                      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="8" strokeDasharray={`${dash} ${gap}`} strokeLinecap="round" style={{transition:'stroke-dasharray .8s ease'}}/>
                    </svg>
                  );
                }

                /* ── style helpers ──────────────────────────────────── */
                const glass  = {background:'rgba(255,255,255,.028)',border:'1px solid rgba(255,255,255,.08)',borderRadius:20} as React.CSSProperties;
                const glass2 = {background:'rgba(255,255,255,.018)',border:'1px solid rgba(255,255,255,.07)',borderRadius:16} as React.CSSProperties;
                const grid2  = {display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:14} as React.CSSProperties;
                const grid3  = {display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))',gap:12} as React.CSSProperties;
                const H = ({children,icon}:{children:React.ReactNode,icon?:React.ReactNode})=>(
                  <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:16}}>
                    {icon&&<span style={{display:'flex',alignItems:'center',justifyContent:'center',width:26,height:26,borderRadius:8,background:'rgba(255,255,255,.06)',flexShrink:0}}>{icon}</span>}
                    <span style={{fontSize:12,fontWeight:700,color:'rgba(255,255,255,.72)',letterSpacing:'.01em'}}>{children}</span>
                  </div>
                );
                const Chip = ({label,value,accent}:{label:string;value:string|number;accent:string})=>(
                  <div style={{display:'flex',flexDirection:'column',gap:1,padding:'10px 14px',borderRadius:12,background:`${accent}10`,border:`1px solid ${accent}28`}}>
                    <span style={{fontSize:9.5,fontWeight:700,color:`${accent}cc`,letterSpacing:'.08em',textTransform:'uppercase' as const}}>{label}</span>
                    <span style={{fontSize:18,fontWeight:800,color:'rgba(255,255,255,.88)',letterSpacing:'-0.03em',lineHeight:1.1}}>{value}</span>
                  </div>
                );

                return (
                  <div style={{flex:1,overflowY:'auto',overflowX:'hidden',padding:'0',WebkitOverflowScrolling:'touch'} as React.CSSProperties}>
                    <style>{`
                      .fd-an-inner{padding:18px 14px 48px}
                      @media(min-width:480px){.fd-an-inner{padding:20px 18px 48px}}
                      @media(min-width:700px){.fd-an-inner{padding:24px 26px 56px}}
                      .fd-an-kpi{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
                      @keyframes fd-rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
                      .fd-an-card{animation:fd-rise .35s cubic-bezier(.4,0,.2,1) both}
                    `}</style>

                    <div className="fd-an-inner">

                      {/* ══ HERO HEADER ══ */}
                      <div style={{position:'relative',borderRadius:22,overflow:'hidden',marginBottom:20,padding:'22px 22px 20px',background:'linear-gradient(135deg,rgba(99,102,241,.18) 0%,rgba(139,92,246,.12) 50%,rgba(6,182,212,.08) 100%)',border:'1px solid rgba(99,102,241,.25)'}}>
                        <div style={{position:'absolute',top:-40,right:-40,width:160,height:160,borderRadius:'50%',background:'radial-gradient(circle,rgba(99,102,241,.25) 0%,transparent 70%)',pointerEvents:'none'}}/>
                        <div style={{position:'absolute',bottom:-30,left:60,width:120,height:120,borderRadius:'50%',background:'radial-gradient(circle,rgba(139,92,246,.20) 0%,transparent 70%)',pointerEvents:'none'}}/>
                        <div style={{position:'relative',display:'flex',alignItems:'flex-start',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
                          <div>
                            <p style={{margin:0,fontSize:10,fontWeight:700,letterSpacing:'.18em',textTransform:'uppercase',color:'rgba(167,139,250,.80)'}}>Ddrive</p>
                            <h2 style={{margin:'4px 0 0',fontSize:22,fontWeight:900,letterSpacing:'-0.04em',color:'#fff',lineHeight:1.1}}>Analytics &amp; Insights</h2>
                            <p style={{margin:'6px 0 0',fontSize:12,color:'rgba(255,255,255,.45)',maxWidth:380}}>Comprehensive intelligence on your workspace — storage efficiency, engagement patterns, security posture, and productivity trends.</p>
                          </div>
                          <div style={{display:'flex',flexDirection:'column',gap:6,alignItems:'flex-end'}}>
                            <span style={{fontSize:10,color:'rgba(255,255,255,.30)',background:'rgba(255,255,255,.06)',padding:'4px 12px',borderRadius:20,fontWeight:600,whiteSpace:'nowrap'}}>{items.length} total items</span>
                            <span style={{fontSize:9.5,color:storageColor,background:`${storageColor}18`,padding:'4px 10px',borderRadius:20,fontWeight:700,border:`1px solid ${storageColor}30`}}>{storagePctNum.toFixed(0)}% storage used</span>
                          </div>
                        </div>
                        {/* mini sparkline in header */}
                        <div style={{marginTop:14,opacity:.6}}>
                          <AreaSparkline data={upload30} color="#a78bfa" height={36} fill={true}/>
                        </div>
                        <p style={{margin:'4px 0 0',fontSize:9.5,color:'rgba(255,255,255,.25)'}}>↑ Upload activity — last 30 days</p>
                      </div>

                      {/* ══ KPI GRID ══ */}
                      <div className="fd-an-kpi" style={{marginBottom:18}}>
                        {([
                          {l:'Files',v:files.length,         s:'total in workspace', a:'#818cf8', ic:<FileText  style={{width:11,height:11,color:'#818cf8'}}/>},
                          {l:'Folders',v:folders.length,      s:'directories',        a:'#fbbf24', ic:<Folder    style={{width:11,height:11,color:'#fbbf24'}}/>},
                          {l:'Storage',v:fmtSize(totalBytes), s:`${storagePctNum.toFixed(0)}% of plan`,a:storageColor,ic:<Archive   style={{width:11,height:11,color:storageColor}}/>},
                          {l:'Total views',v:totalViews,      s:'cumulative opens',   a:'#34d399', ic:<Eye       style={{width:11,height:11,color:'#34d399'}}/>},
                          {l:'Shared',v:sharedCount,          s:'items shared out',   a:'#a78bfa', ic:<Share2    style={{width:11,height:11,color:'#a78bfa'}}/>},
                          {l:'Starred',v:starredCount,        s:'favourites',         a:'#facc15', ic:<Star      style={{width:11,height:11,color:'#facc15'}}/>},
                          {l:'Pinned',v:pinnedCount,           s:'quick-access',       a:'#f97316', ic:<Pin       style={{width:11,height:11,color:'#f97316'}}/>},
                          {l:'Tagged',v:taggedCount,          s:'items with tags',    a:'#2dd4bf', ic:<Tag       style={{width:11,height:11,color:'#2dd4bf'}}/>},
                          {l:'Locked',v:lockedCount,          s:'protected folders',  a:'#f87171', ic:<Lock      style={{width:11,height:11,color:'#f87171'}}/>},
                          {l:'Events',v:allEvents.length,     s:'activity recorded',  a:'#94a3b8', ic:<Activity  style={{width:11,height:11,color:'#94a3b8'}}/>},
                          {l:'File types',v:kindStats.length, s:'distinct categories',a:'#fb923c', ic:<BarChart2 style={{width:11,height:11,color:'#fb923c'}}/>},
                        ] as {l:string;v:number|string;s:string;a:string;ic:React.ReactNode}[]).map((c,idx)=>(
                          <div key={c.l} className="fd-an-card" style={{...glass2,padding:'14px 16px',display:'flex',flexDirection:'column',gap:9,animationDelay:`${idx*30}ms`}}>
                            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                              <span style={{fontSize:10,fontWeight:700,color:'rgba(255,255,255,.35)',letterSpacing:'.05em',textTransform:'uppercase' as const}}>{c.l}</span>
                              <span style={{display:'flex',alignItems:'center',justifyContent:'center',width:22,height:22,borderRadius:7,background:`${c.a}18`,flexShrink:0}}>{c.ic}</span>
                            </div>
                            <span style={{fontSize:22,fontWeight:900,letterSpacing:'-0.04em',color:'rgba(255,255,255,.92)',lineHeight:1}}>{c.v}</span>
                            <span style={{fontSize:9.5,color:'rgba(255,255,255,.25)',fontWeight:500}}>{c.s}</span>
                          </div>
                        ))}
                      </div>

                      {/* ══ ROW: Storage ring + File types donut ══ */}
                      <div style={{...grid2,marginBottom:14}}>

                        {/* Storage deep-dive */}
                        <div style={{...glass,padding:'20px 22px'}}>
                          <H icon={<Archive style={{width:12,height:12,color:'rgba(255,255,255,.50)'}}/>}>Storage Intelligence</H>
                          <div style={{display:'flex',alignItems:'center',gap:20,flexWrap:'wrap'}}>
                            {/* gauge */}
                            <div style={{position:'relative',flexShrink:0}}>
                              <RadialGauge pct={storagePctNum} color={storageColor} size={110}/>
                              <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',paddingTop:8}}>
                                <span style={{fontSize:17,fontWeight:900,color:'rgba(255,255,255,.90)',letterSpacing:'-0.03em'}}>{storagePctNum.toFixed(0)}%</span>
                                <span style={{fontSize:9,color:'rgba(255,255,255,.30)'}}>used</span>
                              </div>
                            </div>
                            <div style={{flex:1,minWidth:130,display:'flex',flexDirection:'column',gap:10}}>
                              <div>
                                <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
                                  <span style={{fontSize:11.5,color:'rgba(255,255,255,.55)'}}>Used</span>
                                  <span style={{fontSize:11.5,fontWeight:800,color:'rgba(255,255,255,.85)',fontFamily:'ui-monospace,monospace'}}>{fmtSize(storageUsed)}</span>
                                </div>
                                <div style={{height:7,borderRadius:99,background:'rgba(255,255,255,.07)',overflow:'hidden'}}>
                                  <div style={{height:'100%',width:`${storagePctNum.toFixed(1)}%`,borderRadius:99,background:`linear-gradient(90deg,${storageColor}cc,${storageColor})`,transition:'width .8s ease',boxShadow:`0 0 8px ${storageColor}55`}}/>
                                </div>
                              </div>
                              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                                <Chip label="Free" value={fmtSize(storageTotal-storageUsed)} accent="#34d399"/>
                                <Chip label="Plan" value={fmtSize(storageTotal)} accent="#6366f1"/>
                              </div>
                            </div>
                          </div>
                          {/* per-kind storage bars */}
                          {kindStats.length>0&&(
                            <div style={{marginTop:18,paddingTop:14,borderTop:'1px solid rgba(255,255,255,.06)'}}>
                              <p style={{margin:'0 0 12px',fontSize:9.5,fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:'rgba(255,255,255,.22)'}}>Breakdown by type</p>
                              {kindStats.map(s=>(
                                <div key={s.kind} style={{marginBottom:9}}>
                                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                                    <span style={{width:8,height:8,borderRadius:'50%',background:s.color,flexShrink:0}}/>
                                    <span style={{flex:1,fontSize:11,color:'rgba(255,255,255,.50)'}}>{s.label}</span>
                                    <span style={{fontSize:10,color:'rgba(255,255,255,.35)',fontFamily:'ui-monospace,monospace'}}>{fmtSize(s.bytes)}</span>
                                    <span style={{fontSize:9.5,color:'rgba(255,255,255,.28)',width:28,textAlign:'right'}}>{s.count}f</span>
                                  </div>
                                  <div style={{height:5,borderRadius:99,background:'rgba(255,255,255,.06)',overflow:'hidden'}}>
                                    <div style={{height:'100%',width:`${(s.bytes/maxKindBytes*100).toFixed(1)}%`,borderRadius:99,background:s.color,transition:'width .6s ease'}}/>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* File types donut */}
                        <div style={{...glass,padding:'20px 22px'}}>
                          <H icon={<BarChart2 style={{width:12,height:12,color:'rgba(255,255,255,.50)'}}/>}>File Composition</H>
                          {kindStats.length===0?(
                            <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'32px 0',gap:8}}>
                              <FileText style={{width:28,height:28,color:'rgba(255,255,255,.12)'}}/>
                              <p style={{margin:0,fontSize:11,color:'rgba(255,255,255,.22)'}}>No files yet</p>
                            </div>
                          ):(
                            <>
                              <div style={{display:'flex',alignItems:'center',gap:18,flexWrap:'wrap',marginBottom:18}}>
                                <DonutChart segs={kindStats.map(s=>({v:s.count,c:s.color}))} size={130} strokeW={12} label={String(files.length)} sub="files"/>
                                <div style={{flex:1,minWidth:120,display:'flex',flexDirection:'column',gap:8}}>
                                  {kindStats.map(s=>(
                                    <div key={s.kind} style={{display:'flex',alignItems:'center',gap:7}}>
                                      <span style={{width:7,height:7,borderRadius:'50%',background:s.color,flexShrink:0}}/>
                                      <span style={{flex:1,fontSize:11.5,color:'rgba(255,255,255,.60)'}}>{s.label}</span>
                                      <span style={{fontSize:11.5,fontWeight:700,color:'rgba(255,255,255,.80)'}}>{s.count}</span>
                                      <span style={{fontSize:9.5,color:'rgba(255,255,255,.30)',width:30,textAlign:'right'}}>{((s.count/totalKindCount)*100).toFixed(0)}%</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {/* views by type */}
                              <div style={{paddingTop:14,borderTop:'1px solid rgba(255,255,255,.06)'}}>
                                <p style={{margin:'0 0 10px',fontSize:9.5,fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:'rgba(255,255,255,.22)'}}>Views by type</p>
                                {kindStats.filter(s=>s.views>0).map(s=>(
                                  <div key={s.kind} style={{marginBottom:8}}>
                                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                                      <span style={{fontSize:10.5,color:'rgba(255,255,255,.48)'}}>{s.label}</span>
                                      <span style={{fontSize:10,fontWeight:700,color:'rgba(52,211,153,.80)'}}>{s.views} views</span>
                                    </div>
                                    <div style={{height:4,borderRadius:99,background:'rgba(255,255,255,.06)',overflow:'hidden'}}>
                                      <div style={{height:'100%',width:`${(s.views/maxKindViews*100).toFixed(1)}%`,borderRadius:99,background:'rgba(52,211,153,.55)',transition:'width .6s ease'}}/>
                                    </div>
                                  </div>
                                ))}
                                {kindStats.every(s=>s.views===0)&&<p style={{fontSize:11,color:'rgba(255,255,255,.20)',textAlign:'center',padding:'8px 0'}}>No views recorded yet</p>}
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* ══ ROW: 14-day multi-series activity chart ══ */}
                      <div style={{...glass,padding:'20px 22px',marginBottom:14}}>
                        <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:12,marginBottom:16}}>
                          <span style={{display:'flex',alignItems:'center',justifyContent:'center',width:26,height:26,borderRadius:8,background:'rgba(255,255,255,.06)'}}><Activity style={{width:12,height:12,color:'rgba(255,255,255,.50)'}}/></span>
                          <span style={{fontSize:12,fontWeight:700,color:'rgba(255,255,255,.72)'}}>Activity Trend — 14 Days</span>
                          <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:12}}>
                            {[{c:'#6366f1',l:'All'},{c:'#34d399',l:'Uploads'},{c:'#f87171',l:'Views'}].map(k=>(
                              <span key={k.l} style={{display:'flex',alignItems:'center',gap:4,fontSize:10,color:'rgba(255,255,255,.38)',fontWeight:600}}>
                                <span style={{width:8,height:3,borderRadius:99,background:k.c}}/>
                                {k.l}
                              </span>
                            ))}
                          </div>
                        </div>
                        {activity14.every(d=>d.count===0)?(
                          <p style={{fontSize:11,color:'rgba(255,255,255,.22)',textAlign:'center',padding:'24px 0'}}>No activity in the last 14 days. Start uploading or opening files.</p>
                        ):(
                          <div style={{padding:'4px 0 4px'}}>
                            <MultiBarChart
                              data={activity14.map(d=>({label:d.shortLabel,all:d.count,up:d.uploads,view:d.views}))}
                              keys={['all','up','view']}
                              colors={['rgba(99,102,241,.60)','rgba(52,211,153,.70)','rgba(248,113,113,.60)']}
                              height={90}
                            />
                          </div>
                        )}
                        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(100px,1fr))',gap:8,marginTop:12}}>
                          {[
                            {l:'Total events',v:allEvents.length,c:'#818cf8'},
                            {l:'14-day events',v:activity14.reduce((s,d)=>s+d.count,0),c:'#6366f1'},
                            {l:'Uploads',v:activity14.reduce((s,d)=>s+d.uploads,0),c:'#34d399'},
                            {l:'Views',v:activity14.reduce((s,d)=>s+d.views,0),c:'#f87171'},
                          ].map(m=>(
                            <div key={m.l} style={{background:'rgba(255,255,255,.03)',borderRadius:10,padding:'9px 12px'}}>
                              <p style={{margin:0,fontSize:16,fontWeight:800,color:m.c,letterSpacing:'-0.03em'}}>{m.v}</p>
                              <p style={{margin:'2px 0 0',fontSize:9.5,color:'rgba(255,255,255,.28)'}}>{m.l}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* ══ ROW: Top files + Privacy ══ */}
                      <div style={{...grid2,marginBottom:14}}>

                        {/* Top files by views */}
                        <div style={{...glass,padding:'20px 22px'}}>
                          <H icon={<Eye style={{width:12,height:12,color:'rgba(255,255,255,.50)'}}/>}>Top Files by Engagement</H>
                          {topFiles.length===0?(
                            <p style={{fontSize:11,color:'rgba(255,255,255,.22)',textAlign:'center',padding:'28px 0'}}>No views recorded yet</p>
                          ):(
                            <>
                              {/* area sparkline of views distribution */}
                              <div style={{borderRadius:12,overflow:'hidden',background:'rgba(52,211,153,.06)',border:'1px solid rgba(52,211,153,.12)',padding:'10px 12px',marginBottom:14}}>
                                <AreaSparkline data={topFiles.map(f=>f.views??0)} color="#34d399" height={44} fill/>
                              </div>
                              {topFiles.map((f,i)=>{
                                const pct=((f.views??0)/maxTopView*100).toFixed(1);
                                const isTop=i===0;
                                return (
                                  <div key={f.id} style={{marginBottom:11}}>
                                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}}>
                                      <span style={{fontSize:9,fontWeight:900,color:isTop?'#fbbf24':'rgba(255,255,255,.22)',width:16,flexShrink:0}}>#{i+1}</span>
                                      <KindIcon kind={f.kind??'other'} sz={11}/>
                                      <span style={{flex:1,fontSize:11.5,color:isTop?'rgba(255,255,255,.85)':'rgba(255,255,255,.55)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:isTop?700:400}}>{f.name}</span>
                                      <span style={{fontSize:11,fontWeight:800,color:isTop?'#34d399':'rgba(52,211,153,.70)',flexShrink:0}}>{f.views??0}</span>
                                    </div>
                                    <div style={{height:5,borderRadius:99,background:'rgba(255,255,255,.06)',overflow:'hidden'}}>
                                      <div style={{height:'100%',width:`${pct}%`,borderRadius:99,background:isTop?'linear-gradient(90deg,#34d399,#6ee7b7)':'rgba(52,211,153,.40)',transition:'width .6s ease'}}/>
                                    </div>
                                  </div>
                                );
                              })}
                            </>
                          )}
                        </div>

                        {/* Security & privacy panel */}
                        <div style={{...glass,padding:'20px 22px'}}>
                          <H icon={<Shield style={{width:12,height:12,color:'rgba(255,255,255,.50)'}}/>}>Security Posture</H>
                          {privBreakdown.length===0?(
                            <p style={{fontSize:11,color:'rgba(255,255,255,.22)',textAlign:'center',padding:'28px 0'}}>No files yet</p>
                          ):(
                            <>
                              <div style={{display:'flex',alignItems:'center',gap:18,flexWrap:'wrap',marginBottom:16}}>
                                <DonutChart segs={privBreakdown.map(p=>({v:p.count,c:p.color}))} size={120} strokeW={11}
                                  label={`${((privBreakdown.find(p=>p.label==='Private')?.count??0)/totalPriv*100).toFixed(0)}%`} sub="private"/>
                                <div style={{flex:1,minWidth:120,display:'flex',flexDirection:'column',gap:10}}>
                                  {privBreakdown.map(p=>(
                                    <div key={p.label}>
                                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                                        <span style={{display:'flex',alignItems:'center',gap:6,fontSize:11.5,color:'rgba(255,255,255,.60)'}}>
                                          <span style={{width:7,height:7,borderRadius:'50%',background:p.color,flexShrink:0}}/>{p.label}
                                        </span>
                                        <span style={{fontSize:12,fontWeight:800,color:p.color}}>{p.count}</span>
                                      </div>
                                      <div style={{height:5,borderRadius:99,background:'rgba(255,255,255,.06)',overflow:'hidden'}}>
                                        <div style={{height:'100%',width:`${(p.count/totalPriv*100).toFixed(1)}%`,borderRadius:99,background:p.color+'99',transition:'width .6s ease'}}/>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {/* segmented pill */}
                              <div style={{height:9,borderRadius:99,display:'flex',overflow:'hidden',gap:2,marginBottom:14}}>
                                {privBreakdown.map(p=>(
                                  <div key={p.label} title={`${p.label}: ${p.count}`}
                                    style={{height:'100%',flex:p.count,background:p.color+'bb',transition:'flex .6s ease',minWidth:p.count?5:0}}/>
                                ))}
                              </div>
                              {/* security score */}
                              <div style={{background:'rgba(255,255,255,.03)',borderRadius:14,padding:'12px 14px'}}>
                                <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                                  <span style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,.50)'}}>Security Score</span>
                                  <span style={{fontSize:13,fontWeight:900,color:
                                    lockedCount+privBreakdown.find(p=>p.label==='Private')?.count!>files.length*0.5?'#34d399':'#fbbf24'
                                  }}>{Math.min(100,Math.round(((privBreakdown.find(p=>p.label==='Private')?.count??0)*60+lockedCount*40)/(Math.max(1,files.length+folders.length))))}%</span>
                                </div>
                                <div style={{height:6,borderRadius:99,background:'rgba(255,255,255,.07)',overflow:'hidden'}}>
                                  <div style={{height:'100%',borderRadius:99,background:'linear-gradient(90deg,#34d399,#6ee7b7)',
                                    width:`${Math.min(100,Math.round(((privBreakdown.find(p=>p.label==='Private')?.count??0)*60+lockedCount*40)/(Math.max(1,files.length+folders.length))))}%`,
                                    transition:'width .8s ease'}}/>
                                </div>
                                <p style={{margin:'6px 0 0',fontSize:9.5,color:'rgba(255,255,255,.22)'}}>Based on private files &amp; locked folders ratio</p>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* ══ ROW: Largest files + File age ══ */}
                      <div style={{...grid2,marginBottom:14}}>

                        {/* Largest files */}
                        <div style={{...glass,padding:'20px 22px'}}>
                          <H icon={<Layers style={{width:12,height:12,color:'rgba(255,255,255,.50)'}}/>}>Space Hogs</H>
                          {largestFiles.length===0?(
                            <p style={{fontSize:11,color:'rgba(255,255,255,.22)',textAlign:'center',padding:'28px 0'}}>No files yet</p>
                          ):(
                            largestFiles.map((f,i)=>{
                              const pct=((f.bytes??0)/maxLargeB*100).toFixed(1);
                              return (
                                <div key={f.id} style={{marginBottom:13}}>
                                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}}>
                                    <span style={{fontSize:9,fontWeight:900,color:'rgba(255,255,255,.22)',width:14}}>{i+1}</span>
                                    <KindIcon kind={f.kind??'other'} sz={11}/>
                                    <span style={{flex:1,fontSize:11.5,color:'rgba(255,255,255,.62)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.name}</span>
                                    <span style={{fontSize:10.5,fontWeight:800,color:'rgba(255,255,255,.55)',fontFamily:'ui-monospace,monospace',flexShrink:0}}>{fmtSize(f.bytes??0)}</span>
                                  </div>
                                  <div style={{height:6,borderRadius:99,background:'rgba(255,255,255,.06)',overflow:'hidden'}}>
                                    <div style={{height:'100%',width:`${pct}%`,borderRadius:99,background:KIND_SOLID[f.kind??'other'],opacity:.75,transition:'width .6s ease'}}/>
                                  </div>
                                </div>
                              );
                            })
                          )}
                          {/* total storage context */}
                          {files.length>0&&(
                            <div style={{marginTop:14,paddingTop:12,borderTop:'1px solid rgba(255,255,255,.06)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                              <span style={{fontSize:10.5,color:'rgba(255,255,255,.30)'}}>Total across all files</span>
                              <span style={{fontSize:12,fontWeight:800,color:'rgba(255,255,255,.65)',fontFamily:'ui-monospace,monospace'}}>{fmtSize(totalBytes)}</span>
                            </div>
                          )}
                        </div>

                        {/* File age distribution */}
                        <div style={{...glass,padding:'20px 22px'}}>
                          <H icon={<Clock style={{width:12,height:12,color:'rgba(255,255,255,.50)'}}/>}>File Age Distribution</H>
                          {ageBands.length===0?(
                            <p style={{fontSize:11,color:'rgba(255,255,255,.22)',textAlign:'center',padding:'28px 0'}}>No files yet</p>
                          ):(
                            <>
                              <DonutChart segs={ageBands.map(b=>({v:b.count,c:b.color}))} size={120} strokeW={11} label={String(files.length)} sub="files"/>
                              <div style={{marginTop:14}}>
                                {ageBands.map(b=>(
                                  <div key={b.label} style={{marginBottom:10}}>
                                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                                      <span style={{width:7,height:7,borderRadius:'50%',background:b.color,flexShrink:0}}/>
                                      <span style={{flex:1,fontSize:11.5,color:'rgba(255,255,255,.55)'}}>{b.label}</span>
                                      <span style={{fontSize:12,fontWeight:800,color:'rgba(255,255,255,.75)'}}>{b.count}</span>
                                      <span style={{fontSize:9.5,color:'rgba(255,255,255,.30)',width:28,textAlign:'right'}}>{((b.count/files.length)*100).toFixed(0)}%</span>
                                    </div>
                                    <div style={{height:5,borderRadius:99,background:'rgba(255,255,255,.06)',overflow:'hidden'}}>
                                      <div style={{height:'100%',width:`${(b.count/maxAge*100).toFixed(1)}%`,borderRadius:99,background:b.color,transition:'width .6s ease'}}/>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* ══ ROW: Action heatmap + Tags ══ */}
                      <div style={{...grid2,marginBottom:14}}>

                        {/* Action distribution */}
                        <div style={{...glass,padding:'20px 22px'}}>
                          <H icon={<TrendingUp style={{width:12,height:12,color:'rgba(255,255,255,.50)'}}/>}>Action Breakdown</H>
                          {topActions.length===0?(
                            <p style={{fontSize:11,color:'rgba(255,255,255,.22)',textAlign:'center',padding:'28px 0'}}>No actions recorded</p>
                          ):(
                            <>
                              <div style={{marginBottom:16}}>
                                {topActions.map(([action,count],i)=>{
                                  const actionColors=['#6366f1','#34d399','#f87171','#fbbf24','#a78bfa','#fb923c'];
                                  const c=actionColors[i%actionColors.length];
                                  return (
                                    <div key={action} style={{marginBottom:10}}>
                                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                                        <span style={{fontSize:11.5,fontWeight:600,color:'rgba(255,255,255,.60)'}}>{action}</span>
                                        <div style={{display:'flex',alignItems:'center',gap:6}}>
                                          <span style={{fontSize:12,fontWeight:800,color:c}}>{count}</span>
                                          <span style={{fontSize:9.5,color:'rgba(255,255,255,.28)'}}>{((count/allEvents.length)*100).toFixed(0)}%</span>
                                        </div>
                                      </div>
                                      <div style={{height:6,borderRadius:99,background:'rgba(255,255,255,.06)',overflow:'hidden'}}>
                                        <div style={{height:'100%',width:`${(count/maxAction*100).toFixed(1)}%`,borderRadius:99,background:c+'bb',transition:'width .6s ease'}}/>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              <div style={{background:'rgba(255,255,255,.03)',borderRadius:12,padding:'10px 14px',display:'flex',justifyContent:'space-between'}}>
                                <span style={{fontSize:10.5,color:'rgba(255,255,255,.30)'}}>Total logged</span>
                                <span style={{fontSize:13,fontWeight:800,color:'rgba(255,255,255,.70)'}}>{allEvents.length}</span>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Tags & labels */}
                        <div style={{...glass,padding:'20px 22px'}}>
                          <H icon={<Tag style={{width:12,height:12,color:'rgba(255,255,255,.50)'}}/>}>Tags &amp; Labels</H>
                          {topTags.length===0?(
                            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8,padding:'24px 0'}}>
                              <Tag style={{width:24,height:24,color:'rgba(255,255,255,.12)'}}/>
                              <p style={{margin:0,fontSize:11,color:'rgba(255,255,255,.22)'}}>No tags yet — right-click a file to add tags</p>
                            </div>
                          ):(
                            <div style={{display:'flex',flexWrap:'wrap',gap:7}}>
                              {topTags.map(([tag,count])=>{
                                const maxTag=topTags[0][1];
                                const intensity=Math.round(40+((count/maxTag)*60));
                                return (
                                  <span key={tag} style={{
                                    display:'inline-flex',alignItems:'center',gap:5,
                                    padding:'5px 11px',borderRadius:20,fontSize:11.5,fontWeight:600,
                                    background:`rgba(99,102,241,${(intensity/100)*0.22})`,
                                    border:`1px solid rgba(99,102,241,${(intensity/100)*0.40})`,
                                    color:`rgba(165,180,252,${0.50+(intensity/100)*0.40})`,
                                  }}>
                                    {tag}
                                    <span style={{fontSize:9,fontWeight:800,background:'rgba(99,102,241,.25)',borderRadius:10,padding:'1px 5px',color:'rgba(165,180,252,.80)'}}>{count}</span>
                                  </span>
                                );
                              })}
                            </div>
                          )}
                          {/* recently tagged */}
                          {taggedCount>0&&(
                            <div style={{marginTop:16,paddingTop:12,borderTop:'1px solid rgba(255,255,255,.06)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                              <span style={{fontSize:10.5,color:'rgba(255,255,255,.30)'}}>Tagged items</span>
                              <span style={{fontSize:13,fontWeight:800,color:'rgba(165,180,252,.80)'}}>{taggedCount} <span style={{fontSize:10,fontWeight:400,color:'rgba(255,255,255,.28)'}}>of {items.length}</span></span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ══ Activity timeline ══ */}
                      <div style={{...glass,padding:'20px 22px'}}>
                        <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:12,marginBottom:16}}>
                          <span style={{display:'flex',alignItems:'center',justifyContent:'center',width:26,height:26,borderRadius:8,background:'rgba(255,255,255,.06)'}}><Clock style={{width:12,height:12,color:'rgba(255,255,255,.50)'}}/></span>
                          <span style={{fontSize:12,fontWeight:700,color:'rgba(255,255,255,.72)'}}>Recent Activity</span>
                          <span style={{marginLeft:'auto',fontSize:9.5,fontWeight:600,color:'rgba(255,255,255,.28)',background:'rgba(255,255,255,.05)',padding:'3px 10px',borderRadius:20}}>{allEvents.slice(0,16).length} events</span>
                        </div>
                        {allEvents.length===0?(
                          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8,padding:'24px 0'}}>
                            <Activity style={{width:26,height:26,color:'rgba(255,255,255,.12)'}}/>
                            <p style={{margin:0,fontSize:11,color:'rgba(255,255,255,.22)'}}>No activity yet — upload, open, or share files to start logging.</p>
                          </div>
                        ):(
                          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:0}}>
                            {allEvents.slice(0,16).map((ev,idx)=>(
                              <div key={ev.id+idx} style={{display:'flex',gap:12,padding:'9px 8px',borderRadius:10,transition:'background .12s'}}
                                onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,.03)')}
                                onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                                <div style={{width:28,height:28,borderRadius:9,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.08)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:13}}>{ev.icon}</div>
                                <div style={{flex:1,minWidth:0,paddingTop:1}}>
                                  <div style={{display:'flex',alignItems:'baseline',gap:6,flexWrap:'wrap'}}>
                                    <span style={{fontSize:12,fontWeight:700,color:'rgba(255,255,255,.68)'}}>{ev.action}</span>
                                    <span style={{fontSize:10,color:'rgba(255,255,255,.30)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:150}}>{ev.itemName}</span>
                                  </div>
                                  <div style={{display:'flex',alignItems:'center',gap:6,marginTop:2}}>
                                    {ev.detail&&<span style={{fontSize:9.5,color:'rgba(255,255,255,.22)'}}>{ev.detail}</span>}
                                    <span style={{fontSize:9,color:'rgba(255,255,255,.18)',marginLeft:'auto'}}>{fmtDate(ev.timestamp)}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                    </div>{/* fd-an-inner */}
                  </div>
                );
              })()}

              {/* Sort + toolbar bar — hidden when analytics is active */}
              {section !== 'analytics' && <>
              {/* Sort + toolbar bar */}
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 16px', flexShrink:0, borderBottom:'1px solid rgba(255,255,255,.055)', background:'rgba(255,255,255,.008)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, flex:1, minWidth:0 }}>
                  <span style={{ fontSize:11, fontWeight:800, color:'rgba(255,255,255,.65)', letterSpacing:'.01em', whiteSpace:'nowrap' }}>
                    {section === 'my-drive' ? (navStack.length > 1 ? navStack[navStack.length-1].name : 'My Ddrive') : section.charAt(0).toUpperCase()+section.slice(1).replace('-',' ')}
                  </span>
                  <span style={{ fontSize:10, color:'rgba(255,255,255,.25)', background:'rgba(255,255,255,.06)', padding:'1px 7px', borderRadius:20, fontWeight:600 }}>
                    {visibleItems.length}
                  </span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:3 }}>
                  <span style={{ fontSize:9.5, color:'rgba(255,255,255,.22)', marginRight:3, fontWeight:600 }}>Sort:</span>
                  {(['name','date','size'] as const).map(s => (
                    <button key={s} onClick={() => setSortBy(s)}
                      style={{ padding:'3px 9px', borderRadius:7, border:`1px solid ${sortBy===s?'rgba(255,255,255,.16)':'transparent'}`, background:sortBy===s?'rgba(255,255,255,.07)':'transparent', cursor:'pointer', fontSize:10, fontWeight:sortBy===s?600:400, color:sortBy===s?'rgba(255,255,255,.78)':'rgba(255,255,255,.32)', transition:'all .12s' }}>
                      {s.charAt(0).toUpperCase()+s.slice(1)}
                    </button>
                  ))}
                </div>
                {/* Mobile view toggle */}
                <div className="fd-show-mobile" style={{ display:'none', background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.09)', borderRadius:8, overflow:'hidden' }}>
                  {(['list','grid'] as ViewMode[]).map(v => (
                    <button key={v} onClick={() => setView(v)} style={{ width:28, height:28, border:'none', background:view===v?'rgba(255,255,255,.10)':'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:view===v?'rgba(255,255,255,.75)':'rgba(255,255,255,.30)' }}>
                      {v === 'list' ? <List style={{ width:12, height:12 }} /> : <LayoutGrid style={{ width:12, height:12 }} />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pinned strip */}
              {pinnedItems.length > 0 && section === 'my-drive' && (
                <div style={{ padding:'10px 14px 6px', flexShrink:0 }}>
                  <p style={{ margin:'0 0 6px', fontSize:9.5, color:'rgba(255,255,255,.25)', fontWeight:700, letterSpacing:'.07em', textTransform:'uppercase' }}>📌 Pinned</p>
                  <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:4 }}>
                    {pinnedItems.map(item => (
                      <div key={item.id} onClick={() => item.type === 'folder' ? navigateInto(item) : openFile(item)}
                        style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 12px', borderRadius:10, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)', cursor:'pointer', flexShrink:0, maxWidth:160, transition:'all .12s' }}
                        onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,.08)')}
                        onMouseLeave={e=>(e.currentTarget.style.background='rgba(255,255,255,.04)')}>
                        {item.type === 'folder'
                          ? <Folder style={{ width:13, height:13, color: item.folderColor ?? '#fbbf24', flexShrink:0 }} />
                          : <KindIcon kind={item.kind!} sz={11} />}
                        <span style={{ fontSize:11, color:'rgba(255,255,255,.70)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* File list / grid */}
              <div style={{ flex:1, overflowY:'auto', padding:'6px 0', WebkitOverflowScrolling:'touch' } as React.CSSProperties}
                onClick={() => setSelectedIds(new Set())}
              >
                {visibleItems.length === 0 ? (
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:20, padding:'40px 32px', textAlign:'center' }}>
                    {/* Icon */}
                    <div style={{ width:64, height:64, borderRadius:20, background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.07)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 0 8px rgba(255,255,255,.015)' }}>
                      {query
                        ? <Search style={{ width:26, height:26, color:'rgba(255,255,255,.15)' }} />
                        : section === 'starred'
                          ? <Star style={{ width:26, height:26, color:'rgba(255,255,255,.15)' }} />
                          : section === 'recent'
                            ? <Clock style={{ width:26, height:26, color:'rgba(255,255,255,.15)' }} />
                            : section === 'offline'
                              ? <WifiOff style={{ width:26, height:26, color:'rgba(255,255,255,.15)' }} />
                              : <FolderOpen style={{ width:26, height:26, color:'rgba(255,255,255,.15)' }} />
                      }
                    </div>
                    {/* Copy */}
                    <div style={{ maxWidth:280 }}>
                      <p style={{ margin:0, fontSize:14, fontWeight:700, letterSpacing:'-0.02em', color:'rgba(255,255,255,.35)' }}>
                        {query
                          ? 'No results found'
                          : section === 'starred' ? 'No starred files'
                          : section === 'recent'  ? 'Nothing recent yet'
                          : section === 'offline' ? 'No offline files'
                          : section === 'shared'  ? 'Nothing shared yet'
                          : currentFolderId !== null ? 'This folder is empty'
                          : 'Your Ddrive is ready'}
                      </p>
                      <p style={{ margin:'6px 0 0', fontSize:12, lineHeight:1.6, color:'rgba(255,255,255,.18)' }}>
                        {query
                          ? 'Try adjusting your search terms.'
                          : section === 'starred' ? 'Star any file or folder to find it here instantly.'
                          : section === 'recent'  ? 'Files you open or upload will appear here.'
                          : section === 'offline' ? 'Right-click a file and choose “Make offline” to access it without a connection.'
                          : section === 'shared'  ? 'Share a file via email, QR, or WhatsApp to see it here.'
                          : currentFolderId !== null ? 'Upload files or create sub-folders to organise this space.'
                          : 'Upload your first file or drag it here to get started.'}
                      </p>
                    </div>
                    {/* CTA — only show for my-drive root empty state */}
                    {!query && section === 'my-drive' && (
                      <button onClick={() => setUploadOpen(true)}
                        style={{ display:'inline-flex', alignItems:'center', gap:7, height:38, padding:'0 20px', borderRadius:12, border:'1px solid rgba(255,255,255,.14)', background:'rgba(255,255,255,.06)', color:'rgba(255,255,255,.70)', fontSize:12, fontWeight:700, cursor:'pointer', letterSpacing:'-0.01em', transition:'background .12s' }}
                        onMouseEnter={e => (e.currentTarget.style.background='rgba(255,255,255,.10)')}
                        onMouseLeave={e => (e.currentTarget.style.background='rgba(255,255,255,.06)')}>
                        <Upload style={{ width:13, height:13 }} /> Upload files
                      </button>
                    )}
                  </div>
                ) : view === 'list' ? (
                  /* -- LIST VIEW -- */
                  <div className={section === 'recent' ? 'fd-recent-list' : ''}>
                    {/* Column headers */}
                    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'5px 16px 4px', borderBottom:'1px solid rgba(255,255,255,.04)', background:'rgba(255,255,255,.012)' }}>
                      <div style={{ width:14, flexShrink:0 }} />
                      <div style={{ width:28, flexShrink:0 }} />
                      <span style={{ flex:1, fontSize:9.5, fontWeight:700, color:'rgba(255,255,255,.20)', textTransform:'uppercase', letterSpacing:'.08em' }}>Name</span>
                      <span className="fd-hide-mobile" style={{ width:70, fontSize:9.5, fontWeight:700, color:'rgba(255,255,255,.20)', textTransform:'uppercase', letterSpacing:'.08em', textAlign:'right' }}>Size</span>
                      <span className="fd-hide-mobile" style={{ width:80, fontSize:9.5, fontWeight:700, color:'rgba(255,255,255,.20)', textTransform:'uppercase', letterSpacing:'.08em', textAlign:'right' }}>Modified</span>
                      <div style={{ width:110, flexShrink:0 }} />
                    </div>
                    {pagedItems.map((item, idx) => {
                      const isFolder       = item.type === 'folder';
                      const isSelected     = selectedIds.has(item.id);
                      const isDraggingThis = draggedId === item.id;
                      const isDropTarget   = dropTargetId === item.id && isFolder;
                      const hasLiveShare   = !isFolder && listSharesForItem(item.id).some(s => s.permission === 'edit' || s.permission === 'admin');
                      return (
                        <div key={item.id}
                          className={`fd-row${isFolder?' fd-row-folder':''}${isSelected?' fd-selected':''}${isDraggingThis?' fd-dragging':''}`}
                          data-menu-anchor="true" draggable
                          onDragStart={e => handleDragItemStart(e, item)} onDragEnd={handleDragItemEnd}
                          onDragOver={isFolder ? e => handleFolderDragOver(e, item.id) : undefined}
                          onDragLeave={() => setDropTargetId(null)}
                          onDrop={isFolder ? e => handleFolderDrop(e, item.id) : undefined}
                          onClick={e => handleItemClick(item, e)}
                          onContextMenu={e => openContextMenu(e, item)}
                          style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 16px', position:'relative', borderBottom:`1px solid rgba(255,255,255,${isFolder?.052:.030})`, animation:`fd-row .18s ${0.015+idx*.012}s cubic-bezier(.22,1,.36,1) both`, outline:isDropTarget?'2px solid rgba(99,102,241,.5)':undefined }}>

                          {/* Checkbox */}
                          <div onClick={e => handleCheckbox(item.id, e)} style={{ flexShrink:0, color:isSelected?'#818cf8':'rgba(255,255,255,.16)', cursor:'pointer', lineHeight:0 }}>
                            {isSelected ? <CheckSquare style={{ width:14, height:14 }} /> : <Square style={{ width:14, height:14 }} />}
                          </div>

                          {/* Icon — folders visually larger and distinct */}
                          {isFolder ? (
                            <div className="fd-row-icon-wrap" style={{ width:28, height:28, borderRadius:8, background:`${item.folderColor ?? '#fbbf24'}22`, border:`1px solid ${item.folderColor ?? '#fbbf24'}44`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, position:'relative' }}>
                              <Folder style={{ width:15, height:15, color:item.folderColor??'#fbbf24' }} />
                              {item.locked && !unlockedFolders.has(item.id) && (
                                <div style={{ position:'absolute', bottom:-3, right:-3, width:11, height:11, borderRadius:'50%', background:item.folderColor??'#fbbf24', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                  <Lock style={{ width:6, height:6, color:'#000' }} />
                                </div>
                              )}
                            </div>
                          ) : <KindIcon kind={item.kind!} sz={13} />}

                          {/* Name + badges */}
                          <div style={{ flex:1, minWidth:0 }}>
                            {renameItem === item.id ? (
                              <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
                                onBlur={commitRename} onKeyDown={e => { if (e.key==='Enter') commitRename(); if (e.key==='Escape') setRenameItem(null); }}
                                onClick={e => e.stopPropagation()} className="fd-input"
                                style={{ background:'rgba(99,102,241,.15)', border:'1px solid rgba(99,102,241,.4)', borderRadius:6, padding:'2px 8px', color:'#f1f5f9', fontSize:12.5, fontWeight:600, outline:'none', width:'100%', maxWidth:280, boxSizing:'border-box' }} />
                            ) : (
                              <div style={{ display:'flex', alignItems:'center', gap:5, flexWrap:'nowrap' }}>
                                {item.label && <span className="fd-label-dot" style={{ background:item.label, width:8, height:8, borderRadius:'50%', flexShrink:0 }} />}
                                <span className="fd-row-name" style={{ fontSize:13, fontWeight:isFolder?700:500, color:isFolder?'rgba(255,255,255,.88)':'rgba(255,255,255,.78)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name}</span>
                                {!isFolder && item.privacy === 'public'   && <span className="fd-hide-mobile" style={{ display:'flex', alignItems:'center', gap:2, padding:'1px 5px', borderRadius:20, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)', fontSize:8, fontWeight:600, color:'rgba(255,255,255,.35)', flexShrink:0 }}><Globe style={{width:6,height:6}}/>Pub</span>}
                                {!isFolder && item.privacy === 'private'  && <span className="fd-hide-mobile" style={{ display:'flex', alignItems:'center', gap:2, padding:'1px 5px', borderRadius:20, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)', fontSize:8, fontWeight:600, color:'rgba(255,255,255,.28)', flexShrink:0 }}><Lock style={{width:6,height:6}}/>Priv</span>}
                                {!isFolder && item.privacy === 'password' && <span className="fd-hide-mobile" style={{ display:'flex', alignItems:'center', gap:2, padding:'1px 5px', borderRadius:20, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)', fontSize:8, fontWeight:600, color:'rgba(251,191,36,.60)', flexShrink:0 }}><Key style={{width:6,height:6}}/>Pwd</span>}
                                {sharedFileIds.has(item.id)               && <span className="fd-hide-mobile" style={{ display:'flex', alignItems:'center', gap:2, padding:'1px 5px', borderRadius:20, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)', fontSize:8, fontWeight:600, color:'rgba(167,139,250,.65)', flexShrink:0 }}><QrCode style={{width:6,height:6}}/>QR</span>}
                                {hasLiveShare                             && <span className="fd-hide-mobile" style={{ display:'flex', alignItems:'center', gap:2, padding:'1px 5px', borderRadius:20, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)', fontSize:8, fontWeight:600, color:'rgba(52,211,153,.60)', flexShrink:0 }}><Zap style={{width:6,height:6}}/>Live</span>}
                                {item.offlineAvailable                    && <span style={{ display:'flex', alignItems:'center', gap:2, padding:'1px 5px', borderRadius:20, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)', fontSize:8, fontWeight:600, color:'rgba(255,255,255,.32)', flexShrink:0 }}><WifiOff style={{width:6,height:6}}/><span className="fd-hide-mobile">Off</span></span>}
                                {item.starred && <Star style={{ width:9, height:9, fill:'rgba(251,191,36,.65)', color:'rgba(251,191,36,.65)', flexShrink:0 }} />}
                              </div>
                            )}
                            <p className="fd-row-meta" style={{ margin:'2px 0 0', fontSize:10, color:'rgba(255,255,255,.24)', display:'flex', alignItems:'center', gap:5 }}>
                              {isFolder && <span>{folderItemCount(item.id)} items</span>}
                              {!isFolder && item.size && <span className="fd-hide-mobile" style={{ display:'none' }}>{item.size}</span>}
                              {(item.views ?? 0) > 0 && !isFolder && <><span style={{ color:'rgba(255,255,255,.14)' }}>·</span><span style={{ display:'flex', alignItems:'center', gap:2 }}><Eye style={{width:7,height:7}}/>{item.views}</span></>}
                            </p>
                          </div>

                          {/* Size (desktop) */}
                          <span className="fd-hide-mobile fd-col-size" style={{ width:70, fontSize:11, color:'rgba(255,255,255,.28)', textAlign:'right', flexShrink:0 }}>
                            {isFolder ? `${folderItemCount(item.id)} items` : item.size ?? '—'}
                          </span>

                          {/* Modified (desktop) */}
                          <span className="fd-hide-mobile fd-col-date" style={{ width:80, fontSize:11, color:'rgba(255,255,255,.24)', textAlign:'right', flexShrink:0 }}>
                            {fmtDate(item.updatedAt)}
                          </span>

                          {/* Row actions */}
                          <div className="fd-row-actions" style={{ display:'flex', alignItems:'center', gap:0, flexShrink:0, width:110, justifyContent:'flex-end' }}>
                            <button className="fd-act fd-act-secondary" onClick={e=>{e.stopPropagation();toggleStar(item.id);}} style={{ width:26,height:26,borderRadius:7,border:'none',background:'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:item.starred?'rgba(251,191,36,.70)':'rgba(255,255,255,.16)' }}>
                              <Star style={{ width:11, height:11, fill:item.starred?'rgba(251,191,36,.70)':'none' }} />
                            </button>
                            <button className="fd-act fd-act-secondary fd-hide-mobile" onClick={e=>{e.stopPropagation(); if(!checkFeature('qrShare')) return; setQrShareTarget({id:item.id,name:item.name,kind:isFolder?'folder':'file',fileKind:item.kind});}} style={{ width:26,height:26,borderRadius:7,border:'none',background:'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'rgba(255,255,255,.18)', position:'relative' }} title={featureAvailable('qrShare')?'Share QR':'Requires Pro'}>
                              <QrCode style={{ width:11, height:11 }} />
                            </button>
                            {!isFolder && (
                              <button className="fd-act fd-act-secondary fd-hide-mobile" onClick={e=>{e.stopPropagation(); if(!checkFeature('whatsappShare')) return; shareOnWhatsApp(item);}} title={featureAvailable('whatsappShare')?'WhatsApp':'Requires Starter'} style={{ width:26,height:26,borderRadius:7,border:'none',background:'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'rgba(255,255,255,.18)' }}>
                                <MessageCircle style={{ width:11, height:11 }} />
                              </button>
                            )}
                            <button className="fd-act fd-act-secondary" onClick={e=>{e.stopPropagation();setShareFile(item);setChatQuery('');}} style={{ width:26,height:26,borderRadius:7,border:'none',background:'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'rgba(255,255,255,.20)' }}>
                              <Share2 style={{ width:11, height:11 }} />
                            </button>
                            <button className="fd-act fd-act-secondary fd-hide-mobile" onClick={e=>{e.stopPropagation();setHistoryFile(item);}} title="History" style={{ width:26,height:26,borderRadius:7,border:'none',background:'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'rgba(255,255,255,.18)' }}>
                              <Clock style={{ width:11, height:11 }} />
                            </button>
                            <button className="fd-act" onClick={e=>{e.stopPropagation();openContextMenu(e,item);}} data-menu-anchor="true" style={{ width:28,height:28,borderRadius:8,border:'none',background:'rgba(255,255,255,.03)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'rgba(255,255,255,.35)' }}>
                              <MoreHorizontal style={{ width:13, height:13 }} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* -- GRID VIEW -- */
                  <div style={{ padding:'12px 16px', display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:10, alignContent:'start' }}>
                    {pagedItems.map((item, idx) => {
                      const isFolder     = item.type === 'folder';
                      const isSelected   = selectedIds.has(item.id);
                      const isDropTarget = dropTargetId === item.id && isFolder;
                      return (
                        <div key={item.id}
                          className={`fd-card${isFolder?' fd-card-folder':''}${isSelected?' fd-selected':''}${isDropTarget?' drag-over':''}`}
                          data-menu-anchor="true" draggable
                          onDragStart={e => handleDragItemStart(e, item)} onDragEnd={handleDragItemEnd}
                          onDragOver={isFolder ? e => handleFolderDragOver(e, item.id) : undefined}
                          onDragLeave={() => setDropTargetId(null)}
                          onDrop={isFolder ? e => handleFolderDrop(e, item.id) : undefined}
                          onClick={e => handleItemClick(item, e)}
                          onContextMenu={e => openContextMenu(e, item)}
                          style={{ background:isFolder?`${item.folderColor??'#fbbf24'}0a`:'rgba(255,255,255,.03)', border:`1.5px solid ${isFolder?(item.folderColor??'#fbbf24')+'28':'rgba(255,255,255,.07)'}`, borderRadius:14, padding:'14px 12px 10px', cursor:'pointer', animation:`fd-card .20s ${0.025+idx*.022}s cubic-bezier(.22,1,.36,1) both`, position:'relative' }}>

                          {/* Label dot */}
                          {item.label && <span className="fd-label-dot" style={{ position:'absolute', top:9, left:9, background:item.label }} />}

                          {/* Checkbox */}
                          <div onClick={e => handleCheckbox(item.id, e)} style={{ position:'absolute', top:8, left:item.label?22:8, color:isSelected?'#818cf8':'rgba(255,255,255,.16)', cursor:'pointer', zIndex:2, lineHeight:0 }}>
                            {isSelected ? <CheckSquare style={{ width:13, height:13 }} /> : <Square style={{ width:13, height:13 }} />}
                          </div>
                          {item.starred && <Star style={{ position:'absolute', top:9, right:9, width:10, height:10, fill:'#fbbf24', color:'#fbbf24' }} />}

                          {/* Icon */}
                          <div style={{ display:'flex', justifyContent:'center', marginBottom:10, marginTop:4 }}>
                            {isFolder ? (
                              <div style={{ width:46, height:46, borderRadius:13, background:`${item.folderColor??'#fbbf24'}20`, border:`1.5px solid ${item.folderColor??'#fbbf24'}45`, display:'flex', alignItems:'center', justifyContent:'center', position:'relative' }}>
                                <Folder style={{ width:24, height:24, color:item.folderColor??'#fbbf24' }} />
                                {item.locked && !unlockedFolders.has(item.id) && (
                                  <div style={{ position:'absolute', bottom:-4, right:-4, width:15, height:15, borderRadius:'50%', background:item.folderColor??'#fbbf24', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                    <Lock style={{ width:8, height:8, color:'#000' }} />
                                  </div>
                                )}
                              </div>
                            ) : <KindIcon kind={item.kind!} sz={22} />}
                          </div>

                          <p style={{ margin:0, fontSize:11.5, fontWeight:isFolder?700:500, color:isFolder?'rgba(255,255,255,.88)':'rgba(255,255,255,.78)', textAlign:'center', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', padding:'0 4px' }}>
                            {item.name}
                          </p>
                          <p style={{ margin:'4px 0 0', fontSize:9.5, color:'rgba(255,255,255,.28)', textAlign:'center' }}>
                            {isFolder ? `${folderItemCount(item.id)} items` : item.size ?? ''}
                            {!isFolder && ` · ${fmtDate(item.updatedAt)}`}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* -- PAGINATION -- */}
              {totalPages > 1 && (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'10px 16px', borderTop:'1px solid rgba(255,255,255,.055)', flexShrink:0, background:'rgba(255,255,255,.008)' }}>
                  <button onClick={() => setCurrentPage(p => Math.max(1, p-1))} disabled={currentPage===1}
                    style={{ width:28, height:28, borderRadius:8, border:'1px solid rgba(255,255,255,.09)', background:'rgba(255,255,255,.04)', cursor:currentPage===1?'default':'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:currentPage===1?'rgba(255,255,255,.18)':'rgba(255,255,255,.55)', transition:'all .12s', opacity:currentPage===1?.4:1 }}>
                    <ChevronLeft style={{ width:13, height:13 }} />
                  </button>
                  {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                    let page: number;
                    if (totalPages <= 7) {
                      page = i + 1;
                    } else if (currentPage <= 4) {
                      page = i + 1;
                      if (i === 6) page = totalPages;
                    } else if (currentPage >= totalPages - 3) {
                      page = i === 0 ? 1 : totalPages - 6 + i;
                    } else {
                      const mid = [1, currentPage-1, currentPage, currentPage+1, totalPages];
                      page = [1, currentPage-1, currentPage, currentPage+1, totalPages][Math.min(i, 4)] ?? i+1;
                      void mid;
                    }
                    const active = page === currentPage;
                    return (
                      <button key={`${i}-${page}`} onClick={() => setCurrentPage(page)}
                        style={{ minWidth:28, height:28, borderRadius:8, border:`1px solid ${active?'rgba(139,92,246,.45)':'rgba(255,255,255,.08)'}`, background:active?'rgba(139,92,246,.20)':'rgba(255,255,255,.03)', cursor:'pointer', fontSize:11.5, fontWeight:active?700:500, color:active?'#c4b5fd':'rgba(255,255,255,.45)', padding:'0 6px', transition:'all .12s' }}>
                        {page}
                      </button>
                    );
                  })}
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p+1))} disabled={currentPage===totalPages}
                    style={{ width:28, height:28, borderRadius:8, border:'1px solid rgba(255,255,255,.09)', background:'rgba(255,255,255,.04)', cursor:currentPage===totalPages?'default':'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:currentPage===totalPages?'rgba(255,255,255,.18)':'rgba(255,255,255,.55)', transition:'all .12s', opacity:currentPage===totalPages?.4:1 }}>
                    <ChevronRight style={{ width:13, height:13 }} />
                  </button>
                  <span style={{ fontSize:10, color:'rgba(255,255,255,.24)', marginLeft:6 }}>
                    {(currentPage-1)*PAGE_SIZE+1}–{Math.min(currentPage*PAGE_SIZE, visibleItems.length)} of {visibleItems.length}
                  </span>
                </div>
              )}

              {/* -- BULK ACTION BAR -- */}
              {selectedIds.size > 0 && (
                <div className="fd-bulk" style={{ position:'absolute', bottom:0, left:0, right:0, zIndex:50, background:'rgba(5,5,12,.97)', backdropFilter:'blur(20px)', border:'1px solid rgba(255,255,255,.09)', borderRadius:'12px 12px 0 0', padding:'12px 16px', display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flex:1 }}>
                    <div style={{ width:28, height:28, borderRadius:8, background:'rgba(139,92,246,.2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <span style={{ fontSize:12, fontWeight:700, color:'#a78bfa' }}>{selectedIds.size}</span>
                    </div>
                    <span style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,.70)' }}>item{selectedIds.size !== 1 ? 's' : ''} selected</span>
                  </div>
                  {[
                    { label:'Star',    Icon:Star,      locked:false,                              action:() => { selectedIds.forEach(id => toggleStar(id)); setSelectedIds(new Set()); } },
                    { label:'Move',    Icon:Move,      locked:!featureAvailable('bulkMoveShare'), action:() => { if (!checkFeature('bulkMoveShare')) return; setMovingItems(Array.from(selectedIds)); } },
                    { label:'Share QR',Icon:QrCode,    locked:!featureAvailable('bulkMoveShare'), action:() => { if (!checkFeature('bulkMoveShare')) return; const first = items.find(i => selectedIds.has(i.id)); if (first) setQrShareTarget({id:first.id,name:first.name,kind:first.type==='folder'?'folder':'file',fileKind:first.kind}); } },
                    { label:'Delete',  Icon:Trash2,    locked:false, action:() => { if (confirm(`Delete ${selectedIds.size} items?`)) deleteItems(Array.from(selectedIds)); }, danger:true },
                  ].map(({ label, Icon, action, danger, locked }) => (
                    <button key={label} onClick={action} style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 11px', borderRadius:9, border:`1px solid ${danger ? 'rgba(239,68,68,.22)' : 'rgba(255,255,255,.09)'}`, background:danger?'rgba(239,68,68,.08)':'rgba(255,255,255,.04)', cursor:'pointer', color:danger?'#f87171':'rgba(255,255,255,.60)', fontSize:12, fontWeight:600, transition:'all .12s', opacity: locked ? 0.5 : 1 }}>
                      <Icon style={{ width:12, height:12 }} />
                      <span className="fd-bulk-label">{label}</span>
                      {locked && <Lock style={{ width:9, height:9, marginLeft:2 }} />}
                    </button>
                  ))}
                  <button onClick={() => setSelectedIds(new Set())} style={{ marginLeft:'auto', width:28, height:28, borderRadius:8, border:'none', background:'rgba(255,255,255,.06)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,.40)' }}>
                    <X style={{ width:13, height:13 }} />
                  </button>
                </div>
              )}
              </>}
            </div>
          </div>
        </div>
      </div>

      {/* == CONTEXT MENU == */}
      {menuItem && (() => {
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
        const menuActions = [
          { Icon:FolderOpen, label:'Open',        locked:false,                              action:() => { menuItem.type==='folder'?navigateInto(menuItem):openFile(menuItem); setMenuItem(null); } },
          menuItem.type==='file' && { Icon:Eye,   label:'View',        locked:false,         action:() => { openFile(menuItem); setMenuItem(null); } },
          { Icon:Pencil,     label:'Rename',       locked:false,                             action:() => startRename(menuItem) },
          { Icon:Star,       label:menuItem.starred?'Unstar':'Star', locked:false,           action:() => toggleStar(menuItem.id) },
          { Icon:menuItem.pinned?PinOff:Pin, label:menuItem.pinned?'Unpin':'Pin to top', locked:false, action:() => togglePin(menuItem.id) },
          { Icon:Move,       label:'Move to…',     locked:!featureAvailable('fileMove'),    action:() => { if (!checkFeature('fileMove')) return; setMovingItems([menuItem.id]); setMenuItem(null); } },
          { Icon:QrCode,     label:'Share QR',      locked:!featureAvailable('qrShare'),    action:() => { if (!checkFeature('qrShare')) return; setQrShareTarget({id:menuItem.id,name:menuItem.name,kind:menuItem.type==='folder'?'folder':'file',fileKind:menuItem.kind}); setMenuItem(null); } },
          { Icon:Clock,      label:'View History',  locked:!featureAvailable('fileHistory'),action:() => { if (!checkFeature('fileHistory')) return; setHistoryFile(menuItem); setMenuItem(null); } },
          menuItem.type==='file' && { Icon:MessageCircle, label:'WhatsApp', locked:!featureAvailable('whatsappShare'), color:'#4ade80', action:() => { if (!checkFeature('whatsappShare')) return; addHistory(menuItem.id,'Shared via WhatsApp',undefined,'💬'); shareOnWhatsApp(menuItem); setMenuItem(null); } },
          menuItem.type==='file' && { Icon:Mail,   label:'Send Email',   locked:!featureAvailable('emailShare'),    action:() => { if (!checkFeature('emailShare')) return; setEmailFile(menuItem); setMenuItem(null); } },
          { Icon:Share2,     label:'Share via Chat', locked:false,                          action:() => { setShareFile(menuItem); setMenuItem(null); } },
          { Icon:Tag,        label:'Add Label…',    locked:!featureAvailable('fileLabels'), action:() => { if (!checkFeature('fileLabels')) return; setLabelTarget(menuItem.id); setMenuItem(null); } },
          menuItem.type==='file' && { Icon:menuItem.offlineAvailable?Wifi:WifiOff, label:menuItem.offlineAvailable?'Remove offline':'Make offline', locked:!featureAvailable('offlineToggle'), action:() => { if (!checkFeature('offlineToggle')) return; toggleOffline(menuItem.id); } },
          menuItem.type==='folder' && menuItem.locked && unlockedFolders.has(menuItem.id) && { Icon:Lock, label:'Lock folder', locked:!featureAvailable('folderLock'), action:() => { if (!checkFeature('folderLock')) return; lockFolder(menuItem.id); } },
          menuItem.type==='folder' && !menuItem.locked && { Icon:Lock, label:'Lock folder…', locked:!featureAvailable('folderLock'), action:() => { if (!checkFeature('folderLock')) return; setItems(p=>p.map(i=>i.id===menuItem.id?{...i,locked:true,lockPassword:'admin123'}:i)); setMenuItem(null); } },
          { Icon:Download,   label:'Download',      locked:false,                           action:() => setMenuItem(null) },
          { Icon:Trash2,     label:'Delete',        locked:false, danger:true,              action:() => { deleteItems([menuItem.id]); } },
        ].filter(Boolean) as { Icon:React.ComponentType<{style?:React.CSSProperties}>, label:string, action:()=>void, color?:string, locked:boolean, danger?:boolean }[];

        if (isMobile) {
          return (
            <div style={{ position:'fixed', inset:0, zIndex:2147483660, display:'flex', alignItems:'flex-end' }}>
              <div onClick={() => setMenuItem(null)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.60)', backdropFilter:'blur(6px)' }} />
              <div data-ctx-menu="true" className="fd-mobile-drawer" style={{ position:'relative', width:'100%', background:'rgba(6,6,11,.99)', borderRadius:'22px 22px 0 0', overflow:'hidden', boxShadow:'0 -8px 48px rgba(0,0,0,.85)', border:'1px solid rgba(255,255,255,.08)', borderBottom:'none', maxHeight:'82vh', display:'flex', flexDirection:'column' }}>
                {/* Pull handle */}
                <div style={{ display:'flex', justifyContent:'center', padding:'10px 0 6px', flexShrink:0 }}>
                  <div style={{ width:36, height:3.5, borderRadius:99, background:'rgba(255,255,255,.13)' }} />
                </div>
                {/* File header */}
                <div style={{ display:'flex', alignItems:'center', gap:12, padding:'4px 18px 14px', borderBottom:'1px solid rgba(255,255,255,.06)', flexShrink:0 }}>
                  {menuItem.type==='folder'
                    ? <div style={{ width:40, height:40, borderRadius:12, background:`${menuItem.folderColor??'#a78bfa'}18`, border:`1px solid ${menuItem.folderColor??'#a78bfa'}30`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <Folder style={{ width:18, height:18, color:menuItem.folderColor??'#a78bfa' }} />
                      </div>
                    : <div style={{ flexShrink:0 }}><KindIcon kind={menuItem.kind!} sz={16} /></div>}
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ margin:0, fontSize:14, fontWeight:600, color:'rgba(255,255,255,.88)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{menuItem.name}</p>
                    <p style={{ margin:'2px 0 0', fontSize:11, color:'rgba(255,255,255,.28)' }}>{menuItem.type==='file'?(menuItem.size??'—'):'Folder'} · {fmtDate(menuItem.updatedAt)}</p>
                  </div>
                </div>
                {/* Actions scroll list */}
                <div className="fd-scroll" style={{ overflowY:'auto', padding:'6px 0 24px' }}>
                  {menuActions.map(({ Icon, label, action, color, locked, danger }) => (
                    <button key={label} onClick={action}
                      style={{ display:'flex', alignItems:'center', gap:14, padding:'13px 18px', border:'none', background:'transparent', width:'100%', cursor:'pointer', textAlign:'left', transition:'background .08s' }}
                      onTouchStart={e=>(e.currentTarget.style.background='rgba(255,255,255,.05)')}
                      onTouchEnd={e=>(e.currentTarget.style.background='transparent')}
                      onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,.04)')}
                      onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                      <div style={{ width:40, height:40, borderRadius:13, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', opacity: locked ? 0.38 : 1,
                        background: danger ? 'rgba(239,68,68,.08)' : 'rgba(255,255,255,.04)',
                        border: `1px solid ${danger ? 'rgba(239,68,68,.16)' : 'rgba(255,255,255,.07)'}` }}>
                        <Icon style={{ width:16, height:16, color: danger ? '#f87171' : color || 'rgba(255,255,255,.52)' }} />
                      </div>
                      <span style={{ fontSize:15, fontWeight:500, flex:1, opacity: locked ? 0.45 : 1,
                        color: danger ? '#f87171' : color || 'rgba(255,255,255,.80)' }}>{label}</span>
                      {locked && <Lock style={{ width:12, height:12, color:'rgba(255,255,255,.22)', flexShrink:0 }} />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        }

        return (
          <div data-ctx-menu="true" className="fd-ctx-menu"
            style={{ position:'fixed', zIndex:2147483660, left:Math.min(menuPos.x, window.innerWidth-200), top:Math.min(menuPos.y, window.innerHeight-300), background:'rgba(8,8,13,.98)', border:'1px solid rgba(255,255,255,.09)', borderRadius:12, boxShadow:'0 10px 40px rgba(0,0,0,.80)', padding:'4px', minWidth:190, fontFamily:'system-ui,sans-serif' }}>
            {menuActions.map(({ Icon, label, action, color, locked, danger }) => (
              <button key={label} onClick={action}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px', borderRadius:8, border:'none', background:'transparent', width:'100%', cursor:'pointer', textAlign:'left', transition:'background .08s', opacity: locked ? 0.50 : 1 }}
                onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,.06)')}
                onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                <Icon style={{ width:12, height:12, color: danger ? '#f87171' : color || 'rgba(255,255,255,.40)', flexShrink:0 }} />
                <span style={{ fontSize:12, fontWeight:500, color: danger ? '#f87171' : color || 'rgba(255,255,255,.68)', flex:1 }}>{label}</span>
                {locked && <Lock style={{ width:9, height:9, color:'rgba(255,255,255,.24)', flexShrink:0 }} />}
              </button>
            ))}
          </div>
        );
      })()}

      {/* == MOVE DIALOG == */}
      {movingItems.length > 0 && (
        <div style={{ position:'fixed', inset:0, zIndex:2147483655, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={() => setMovingItems([])} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.60)' }} />
          <div style={{ position:'relative', width:'100%', maxWidth:420, background:'rgba(6,6,10,.98)', border:'1px solid rgba(255,255,255,.09)', borderRadius:18, padding:'20px', animation:'fd-over .22s cubic-bezier(.22,1,.36,1) both' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
              <Move style={{ width:16, height:16, color:'#a78bfa' }} />
              <span style={{ fontWeight:700, fontSize:14, color:'rgba(255,255,255,.88)', flex:1 }}>Move {movingItems.length} item{movingItems.length!==1?'s':''} to…</span>
              <button onClick={() => setMovingItems([])} style={{ background:'transparent', border:'none', cursor:'pointer', color:'rgba(255,255,255,.35)' }}><X style={{width:14,height:14}}/></button>
            </div>
            {/* Folder picker */}
            <div style={{ maxHeight:280, overflowY:'auto' }}>
              <button onClick={() => moveItems(movingItems, null)} style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'9px 12px', borderRadius:9, border:'1px solid rgba(255,255,255,.08)', background:'rgba(255,255,255,.03)', cursor:'pointer', marginBottom:6, textAlign:'left', transition:'background .10s' }}
                onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,.08)')} onMouseLeave={e=>(e.currentTarget.style.background='rgba(255,255,255,.03)')}>
                <Home style={{width:14,height:14,color:'#a78bfa'}} />
                <span style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,.75)' }}>My Ddrive (root)</span>
              </button>
              {items.filter(i => i.type === 'folder' && !movingItems.includes(i.id)).map(folder => (
                <button key={folder.id} onClick={() => moveItems(movingItems, folder.id)} style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'9px 12px', borderRadius:9, border:'1px solid rgba(255,255,255,.08)', background:'rgba(255,255,255,.03)', cursor:'pointer', marginBottom:6, textAlign:'left', transition:'background .10s' }}
                  onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,.08)')} onMouseLeave={e=>(e.currentTarget.style.background='rgba(255,255,255,.03)')}>
                  <Folder style={{ width:14, height:14, color:folder.folderColor??'#fbbf24', flexShrink:0 }} />
                  <span style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,.75)', flex:1 }}>{folder.name}</span>
                  {folder.parentId !== null && <span style={{ fontSize:10, color:'rgba(255,255,255,.25)' }}>nested</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* == NEW FOLDER DIALOG == */}
      {newFolderOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:2147483655, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={() => setNewFolderOpen(false)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.60)' }} />
          <div style={{ position:'relative', width:'100%', maxWidth:380, background:'rgba(6,6,10,.98)', border:'1px solid rgba(255,255,255,.09)', borderRadius:18, padding:'20px', animation:'fd-over .22s cubic-bezier(.22,1,.36,1) both' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
              <FolderPlus style={{ width:16, height:16, color:'#fbbf24' }} />
              <span style={{ fontWeight:700, fontSize:14, color:'rgba(255,255,255,.88)' }}>New Folder</span>
              <button onClick={() => setNewFolderOpen(false)} style={{ marginLeft:'auto', background:'transparent', border:'none', cursor:'pointer', color:'rgba(255,255,255,.35)' }}><X style={{width:14,height:14}}/></button>
            </div>
            <input autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)} onKeyDown={e => { if (e.key==='Enter') createFolder(); if (e.key==='Escape') setNewFolderOpen(false); }}
              placeholder="Folder name…"
              style={{ width:'100%', boxSizing:'border-box', background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.12)', borderRadius:10, padding:'10px 13px', color:'#f1f5f9', fontSize:13, outline:'none', marginBottom:12 }} />
            <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
              {FOLDER_COLORS.map(c => (
                <button key={c} onClick={() => setNewFolderColor(c)} style={{ width:24, height:24, borderRadius:'50%', background:c, border:`2px solid ${newFolderColor===c?'#fff':'transparent'}`, cursor:'pointer', flexShrink:0 }} />
              ))}
            </div>
            <button onClick={createFolder} disabled={!newFolderName.trim()} style={{ width:'100%', padding:'10px', borderRadius:10, border:'none', background:newFolderName.trim()?'linear-gradient(135deg,#f59e0b,#fbbf24)':'rgba(251,191,36,.2)', cursor:newFolderName.trim()?'pointer':'default', fontWeight:700, fontSize:13, color:newFolderName.trim()?'#1c1917':'rgba(251,191,36,.5)', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              <FolderPlus style={{width:14,height:14}} /> Create Folder
            </button>
          </div>
        </div>
      )}

      {/* == UPLOAD OVERLAY == */}
      {uploadOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:2147483650, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={() => setUploadOpen(false)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.60)' }} />
          <div style={{ position:'relative', width:'100%', maxWidth:420, background:'rgba(6,6,10,.98)', border:'1px solid rgba(255,255,255,.09)', borderRadius:20, boxShadow:'0 16px 64px rgba(0,0,0,.85)', padding:'20px', animation:'fd-over .22s cubic-bezier(.22,1,.36,1) both' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
              <div style={{ width:32, height:32, borderRadius:9, background:'rgba(139,92,246,.15)', border:'1px solid rgba(139,92,246,.22)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Upload style={{ width:13, height:13, color:'#a78bfa' }} />
              </div>
              <p style={{ margin:0, flex:1, fontSize:14, fontWeight:700, color:'rgba(255,255,255,.88)' }}>Upload File</p>
              {navStack.length > 1 && <span style={{ fontSize:11, color:'rgba(255,255,255,.30)' }}>→ {navStack[navStack.length-1].name}</span>}
              <button onClick={() => setUploadOpen(false)} style={{ width:28, height:28, borderRadius:'50%', border:'1px solid rgba(255,255,255,.08)', background:'transparent', display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,.35)', cursor:'pointer' }}><X style={{width:12,height:12}}/></button>
            </div>
            <div className={`fd-zone${dragging?' drag':''}`}
              onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={handleDrop} onClick={()=>fileInputRef.current?.click()}
              style={{ border:'1.5px dashed rgba(255,255,255,.13)', borderRadius:13, padding:'22px 16px', textAlign:'center', cursor:'pointer', marginBottom:16, background:'rgba(255,255,255,.018)', minHeight:90, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8 }}>
              <input ref={fileInputRef} type="file" style={{ display:'none' }} onChange={handleFileInput} />
              {uploadedName ? (
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <FileText style={{ width:16, height:16, color:'#a78bfa' }} />
                  <span style={{ fontSize:12, color:'rgba(255,255,255,.70)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:260 }}>{uploadedName}</span>
                  <button onClick={e=>{e.stopPropagation();setUploadedName('');}} style={{ border:'none', background:'transparent', cursor:'pointer', color:'rgba(255,255,255,.30)', padding:0, display:'flex' }}><X style={{width:11,height:11}}/></button>
                </div>
              ) : (
                <>
                  <div style={{ width:40, height:40, borderRadius:12, background:'rgba(139,92,246,.10)', border:'1px solid rgba(139,92,246,.16)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <Upload style={{ width:16, height:16, color:'rgba(167,139,250,.70)' }} />
                  </div>
                  <p style={{ margin:0, fontSize:12, color:'rgba(255,255,255,.38)' }}>Drop file here or <span style={{ color:'#a78bfa', fontWeight:600 }}>browse</span></p>
                </>
              )}
            </div>
            <p style={{ margin:'0 0 8px', fontSize:10, fontWeight:700, color:'rgba(255,255,255,.35)', letterSpacing:'.08em', textTransform:'uppercase' }}>Visibility</p>
            <div style={{ display:'flex', gap:6, marginBottom:16 }}>
              {([['public','Public',Globe,'#34d399',false],['private','Private',Lock,'rgba(255,255,255,.50)',true],['password','Password',Key,'#fbbf24',true]] as const).map(([val,label,Icon,color,needsPrivacy]) => {
                const privacyLocked = needsPrivacy && !featureAvailable('filePrivacy');
                return (
                  <button key={val} onClick={() => { if (privacyLocked) { checkFeature('filePrivacy'); return; } setUploadPrivacy(val as Privacy); }} style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:5, padding:'8px 4px', borderRadius:10, border:`1px solid ${uploadPrivacy===val?`${color}44`:'rgba(255,255,255,.08)'}`, background:uploadPrivacy===val?`${color}14`:'transparent', cursor: privacyLocked ? 'pointer' : 'pointer', opacity: privacyLocked ? 0.45 : 1, position:'relative' }}>
                    <Icon style={{ width:11, height:11, color:uploadPrivacy===val?color:'rgba(255,255,255,.28)' }} />
                    <span style={{ fontSize:11, fontWeight:600, color:uploadPrivacy===val?color:'rgba(255,255,255,.30)' }}>{label}</span>
                    {privacyLocked && <Lock style={{ width:7, height:7, color:'rgba(255,255,255,.35)', position:'absolute', top:3, right:3 }} />}
                  </button>
                );
              })}
            </div>
            <button onClick={doUpload} disabled={!uploadedName||uploading} style={{ width:'100%', height:40, borderRadius:12, border:'none', background:uploadDone?'rgba(52,211,153,.18)':uploadedName?'rgba(139,92,246,.22)':'rgba(255,255,255,.04)', cursor:uploadedName&&!uploading?'pointer':'default', display:'flex', alignItems:'center', justifyContent:'center', gap:8, transition:'background .22s' }}>
              {uploadDone ? <><Check style={{width:14,height:14,color:'#34d399'}}/><span style={{fontSize:13,fontWeight:700,color:'#34d399'}}>Uploaded!</span></> : uploading ? <><div style={{width:14,height:14,border:'2px solid rgba(167,139,250,.25)',borderTopColor:'#a78bfa',borderRadius:'50%',animation:'fd-spin .7s linear infinite'}}/><span style={{fontSize:13,fontWeight:700,color:'#a78bfa'}}>Uploading…</span></> : <><Upload style={{width:13,height:13,color:uploadedName?'#a78bfa':'rgba(255,255,255,.22)'}}/><span style={{fontSize:13,fontWeight:700,color:uploadedName?'#c4b5fd':'rgba(255,255,255,.24)'}}>Upload File</span></>}
            </button>
          </div>
        </div>
      )}

      {/* == SHARE PANEL == */}
      {shareFile && (
        <div style={{ position:'fixed', inset:0, zIndex:2147483650, display:'flex', alignItems:'flex-end', justifyContent:'center' }} className="sm:items-center">
          <div onClick={() => setShareFile(null)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.65)' }} />
          <div style={{ position:'relative', width:'100%', maxWidth:400, background:'rgba(6,6,10,.98)', border:'1px solid rgba(255,255,255,.09)', borderRadius:'22px 22px 0 0', boxShadow:'0 -8px 60px rgba(0,0,0,.85)', overflow:'hidden', animation:'fd-over .26s cubic-bezier(.22,1,.36,1) both' }} className="sm:rounded-[20px]">
            <div style={{ display:'flex', justifyContent:'center', padding:'12px 0 4px' }} className="sm:hidden"><div style={{ width:32, height:3.5, borderRadius:99, background:'rgba(255,255,255,.12)' }} /></div>

            {/* Header */}
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px 10px', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
              <Share2 style={{ width:14, height:14, color:'#818cf8' }} />
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ margin:0, fontSize:13.5, fontWeight:700, color:'rgba(255,255,255,.88)' }}>Share File</p>
                <p style={{ margin:'1px 0 0', fontSize:10, color:'rgba(255,255,255,.32)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{shareFile.name}</p>
              </div>
              <button onClick={() => setShareFile(null)} style={{ width:28, height:28, borderRadius:'50%', border:'1px solid rgba(255,255,255,.09)', background:'transparent', display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,.35)', cursor:'pointer' }}><X style={{width:12,height:12}}/></button>
            </div>

            {/* File info card */}
            <div style={{ margin:'10px 14px 0', padding:'10px 12px', borderRadius:11, background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.07)', display:'flex', alignItems:'center', gap:10 }}>
              <KindIcon kind={shareFile.kind ?? 'other'} sz={14} />
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ margin:0, fontSize:11.5, fontWeight:600, color:'rgba(255,255,255,.80)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{shareFile.name}</p>
                <p style={{ margin:'2px 0 0', fontSize:10, color:'rgba(255,255,255,.28)' }}>{shareFile.size ?? '—'} · {shareFile.privacy === 'public' ? 'Public' : shareFile.privacy === 'password' ? 'Password protected' : 'Private'}</p>
              </div>
            </div>

            {/* Quick share buttons */}
            <div style={{ padding:'10px 14px', display:'flex', gap:8 }}>
              <button onClick={() => { if (!checkFeature('whatsappShare')) return; addHistory(shareFile.id, 'Shared via WhatsApp', undefined, '💬'); shareOnWhatsApp(shareFile); }}
                style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4, padding:'10px 4px', borderRadius:11, border:'1px solid rgba(37,211,102,.28)', background:'rgba(37,211,102,.10)', cursor:'pointer', transition:'all .12s', minWidth:0, opacity: featureAvailable('whatsappShare') ? 1 : 0.45, position:'relative' }}
                onMouseEnter={e=>(e.currentTarget.style.background='rgba(37,211,102,.20)')} onMouseLeave={e=>(e.currentTarget.style.background='rgba(37,211,102,.10)')}>
                <MessageCircle style={{ width:15, height:15, color:'#25D366' }} />
                <span style={{ fontSize:10, fontWeight:700, color:'#4ade80' }}>WhatsApp</span>
                {!featureAvailable('whatsappShare') && <Lock style={{ width:8, height:8, color:'rgba(255,255,255,.45)', position:'absolute', top:4, right:4 }} />}
              </button>
              {shareFile.type === 'file' && (
                <button onClick={() => { if (!checkFeature('emailShare')) return; setShareFile(null); setEmailFile(shareFile); }}
                  style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4, padding:'10px 4px', borderRadius:11, border:'1px solid rgba(129,140,248,.25)', background:'rgba(129,140,248,.09)', cursor:'pointer', transition:'all .12s', minWidth:0, opacity: featureAvailable('emailShare') ? 1 : 0.45, position:'relative' }}
                  onMouseEnter={e=>(e.currentTarget.style.background='rgba(129,140,248,.18)')} onMouseLeave={e=>(e.currentTarget.style.background='rgba(129,140,248,.09)')}>
                  <Mail style={{ width:15, height:15, color:'#818cf8' }} />
                  <span style={{ fontSize:10, fontWeight:700, color:'#a5b4fc' }}>Email</span>
                  {!featureAvailable('emailShare') && <Lock style={{ width:8, height:8, color:'rgba(255,255,255,.45)', position:'absolute', top:4, right:4 }} />}
                </button>
              )}
              <button onClick={() => { navigator.clipboard.writeText(`https://docrud.in/drive/${shareFile.id}`).catch(()=>{}); }}
                style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4, padding:'10px 4px', borderRadius:11, border:'1px solid rgba(255,255,255,.09)', background:'rgba(255,255,255,.04)', cursor:'pointer', transition:'all .12s', minWidth:0 }}
                onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,.09)')} onMouseLeave={e=>(e.currentTarget.style.background='rgba(255,255,255,.04)')}>
                <Copy style={{ width:15, height:15, color:'rgba(255,255,255,.55)' }} />
                <span style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,.55)' }}>Copy Link</span>
              </button>
              {shareFile.type === 'file' && (
                <button onClick={() => { if (!checkFeature('qrShare')) return; setQrShareTarget({ id:shareFile.id, name:shareFile.name, kind:'file', fileKind:shareFile.kind }); }}
                  style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4, padding:'10px 4px', borderRadius:11, border:'1px solid rgba(52,211,153,.22)', background:'rgba(52,211,153,.08)', cursor:'pointer', transition:'all .12s', minWidth:0, opacity: featureAvailable('qrShare') ? 1 : 0.45, position:'relative' }}
                  onMouseEnter={e=>(e.currentTarget.style.background='rgba(52,211,153,.18)')} onMouseLeave={e=>(e.currentTarget.style.background='rgba(52,211,153,.08)')}>
                  <QrCode style={{ width:15, height:15, color:'#34d399' }} />
                  <span style={{ fontSize:10, fontWeight:700, color:'#6ee7b7' }}>QR Code</span>
                  {!featureAvailable('qrShare') && <Lock style={{ width:8, height:8, color:'rgba(255,255,255,.45)', position:'absolute', top:4, right:4 }} />}
                </button>
              )}
            </div>

            {/* Divider */}
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'0 14px 10px' }}>
              <div style={{ flex:1, height:1, background:'rgba(255,255,255,.06)' }} />
              <span style={{ fontSize:9.5, color:'rgba(255,255,255,.22)', fontWeight:600, textTransform:'uppercase', letterSpacing:'.08em' }}>or send via chat</span>
              <div style={{ flex:1, height:1, background:'rgba(255,255,255,.06)' }} />
            </div>

            {/* Search people */}
            <div style={{ padding:'0 12px 6px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:7, height:34, background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.09)', borderRadius:10, padding:'0 11px' }}>
                <Search style={{ width:11, height:11, color:'rgba(255,255,255,.28)', flexShrink:0 }} />
                <input type="text" placeholder="Search people…" value={chatQuery} onChange={e => setChatQuery(e.target.value)} style={{ border:'none', background:'transparent', outline:'none', fontSize:11.5, color:'rgba(255,255,255,.72)', width:'100%', caretColor:'#818cf8' }} />
              </div>
            </div>

            {/* File attachment preview card */}
            <div style={{ margin:'0 14px 10px', padding:'10px 12px', borderRadius:11, background:'rgba(139,92,246,.08)', border:'1px solid rgba(139,92,246,.18)', display:'flex', alignItems:'center', gap:10 }}>
              <KindIcon kind={shareFile.kind ?? 'other'} sz={12} />
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ margin:0, fontSize:11.5, fontWeight:600, color:'rgba(255,255,255,.80)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{shareFile.name}</p>
                <p style={{ margin:'1px 0 0', fontSize:9.5, color:'rgba(255,255,255,.30)' }}>Will be attached as a link in the message</p>
              </div>
            </div>

            {/* People list */}
            <div style={{ maxHeight:200, overflowY:'auto', padding:'2px 0 14px' }}>
              {(chatUsers.length > 0 ? chatUsers : DEMO_PEOPLE).filter(p => p.name.toLowerCase().includes(chatQuery.toLowerCase())).map(person => {
                const msgBody = `📁 *${shareFile.name}*${shareFile.size ? ` (${shareFile.size})` : ''}\n\nhttps://docrud.in/drive/${shareFile.id}`;
                const initial = person.name.charAt(0).toUpperCase();
                return (
                  <div key={person.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 14px', cursor:'pointer', transition:'background .09s' }}
                    onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,.04)')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                    <div style={{ width:32, height:32, borderRadius:'50%', background:'rgba(129,140,248,.14)', border:'1px solid rgba(129,140,248,.22)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <span style={{ fontSize:11, fontWeight:700, color:'#818cf8' }}>{initial}</span>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ margin:0, fontSize:12, fontWeight:600, color:'rgba(255,255,255,.80)' }}>{person.name}</p>
                      <p style={{ margin:'1px 0 0', fontSize:9.5, color:'rgba(255,255,255,.28)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>Send file link via message</p>
                    </div>
                    <button
                      onClick={async () => {
                        const res = await fetch('/api/messages', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ toUserId: person.id, content: msgBody }),
                        });
                        const data = await res.json();
                        if (res.ok && data.conversation?.id) {
                          addHistory(shareFile.id, 'Shared via Chat', person.name, '💬');
                          setChatSent(person.id);
                          setChatSentConvId(data.conversation.id);
                          setTimeout(() => {
                            window.location.href = `/messages?c=${data.conversation.id}`;
                          }, 1200);
                        } else {
                          setChatSent(person.id); // still show sent for UX
                          setTimeout(() => { setShareFile(null); setChatSent(null); }, 1200);
                        }
                      }}
                      style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 11px', borderRadius:9, border:'none', background:chatSent===person.id?'rgba(52,211,153,.16)':'rgba(129,140,248,.16)', cursor:'pointer', flexShrink:0 }}>
                      {chatSent===person.id
                        ? <><Check style={{width:11,height:11,color:'#34d399'}}/><span style={{fontSize:11,fontWeight:700,color:'#34d399'}}>Sent!</span></>
                        : <><Send style={{width:11,height:11,color:'#818cf8'}}/><span style={{fontSize:11,fontWeight:700,color:'#818cf8'}}>Send</span></>}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* == PASSWORD GATE == */}
      {pwdFile && (
        <div style={{ position:'fixed', inset:0, zIndex:2147483650, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={() => { setPwdFile(null); setPwdInput(''); setPwdError(false); }} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.65)' }} />
          <div style={{ position:'relative', width:'100%', maxWidth:340, background:'rgba(6,6,10,.98)', border:`1px solid ${pwdError?'rgba(248,113,113,.3)':'rgba(255,255,255,.09)'}`, borderRadius:20, padding:'24px 22px', animation:pwdError?'fd-shake .25s ease':'fd-over .22s cubic-bezier(.22,1,.36,1) both' }}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12, marginBottom:20 }}>
              <div style={{ width:44, height:44, borderRadius:14, background:'rgba(251,191,36,.12)', border:'1px solid rgba(251,191,36,.22)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Key style={{ width:18, height:18, color:'#fbbf24' }} />
              </div>
              <div style={{ textAlign:'center' }}>
                <p style={{ margin:0, fontSize:14, fontWeight:700, color:'rgba(255,255,255,.88)' }}>Password Protected</p>
                <p style={{ margin:'4px 0 0', fontSize:11, color:'rgba(255,255,255,.32)' }}>{pwdFile.name}</p>
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, height:40, background:'rgba(255,255,255,.05)', border:`1px solid ${pwdError?'rgba(248,113,113,.40)':'rgba(255,255,255,.10)'}`, borderRadius:11, padding:'0 13px', marginBottom:pwdError?8:14 }}>
              <Key style={{ width:13, height:13, color:pwdError?'#f87171':'rgba(255,255,255,.28)', flexShrink:0 }} />
              <input type="password" placeholder="Enter password…" value={pwdInput} onChange={e=>{setPwdInput(e.target.value);setPwdError(false);}} onKeyDown={e=>e.key==='Enter'&&tryPwd()} style={{ border:'none', background:'transparent', outline:'none', fontSize:13, color:'rgba(255,255,255,.80)', width:'100%', caretColor:'#fbbf24' }} autoFocus />
            </div>
            {pwdError && <p style={{ margin:'0 0 12px', fontSize:11, color:'#f87171', textAlign:'center' }}>Incorrect password. Try again.</p>}
            <button onClick={tryPwd} style={{ width:'100%', height:40, borderRadius:12, border:'none', background:'rgba(251,191,36,.18)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
              <Shield style={{ width:13, height:13, color:'#fbbf24' }} />
              <span style={{ fontSize:13, fontWeight:700, color:'#fde68a' }}>Unlock File</span>
            </button>
            <p style={{ margin:'10px 0 0', fontSize:10, color:'rgba(255,255,255,.18)', textAlign:'center' }}>Hint: demo password is <code style={{color:'rgba(255,255,255,.35)'}}>1234</code></p>
          </div>
        </div>
      )}

      {/* == FOLDER LOCK GATE == */}
      {folderLockId && (
        <div style={{ position:'fixed', inset:0, zIndex:2147483650, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={() => { setFolderLockId(null); setLockInput(''); setLockError(false); }} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.65)' }} />
          <div style={{ position:'relative', width:'100%', maxWidth:340, background:'rgba(6,6,10,.98)', border:`1px solid ${lockError?'rgba(248,113,113,.3)':'rgba(139,92,246,.25)'}`, borderRadius:20, padding:'24px 22px', animation:lockError?'fd-shake .25s ease':'fd-over .22s cubic-bezier(.22,1,.36,1) both' }}>
            {(() => {
              const folder = items.find(i => i.id === folderLockId);
              return (
                <>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12, marginBottom:20 }}>
                    <div style={{ width:44, height:44, borderRadius:14, background:'rgba(139,92,246,.15)', border:'1px solid rgba(139,92,246,.30)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <Lock style={{ width:18, height:18, color:'#a78bfa' }} />
                    </div>
                    <div style={{ textAlign:'center' }}>
                      <p style={{ margin:0, fontSize:14, fontWeight:700, color:'rgba(255,255,255,.88)' }}>Locked Folder</p>
                      <p style={{ margin:'4px 0 0', fontSize:11, color:'rgba(255,255,255,.32)' }}>{folder?.name}</p>
                    </div>
                  </div>
                  <input type="password" placeholder="Enter folder password…" value={lockInput} onChange={e=>{setLockInput(e.target.value);setLockError(false);}} onKeyDown={e=>e.key==='Enter'&&tryLock()}
                    style={{ width:'100%', boxSizing:'border-box', background:'rgba(255,255,255,.05)', border:`1px solid ${lockError?'rgba(248,113,113,.40)':'rgba(139,92,246,.30)'}`, borderRadius:11, padding:'10px 13px', color:'rgba(255,255,255,.80)', fontSize:13, outline:'none', marginBottom:lockError?8:14 }} autoFocus />
                  {lockError && <p style={{ margin:'0 0 12px', fontSize:11, color:'#f87171', textAlign:'center' }}>Incorrect password.</p>}
                  <button onClick={tryLock} style={{ width:'100%', height:40, borderRadius:12, border:'none', background:'rgba(139,92,246,.20)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                    <Unlock style={{ width:13, height:13, color:'#a78bfa' }} />
                    <span style={{ fontSize:13, fontWeight:700, color:'#c4b5fd' }}>Unlock Folder</span>
                  </button>
                  <p style={{ margin:'10px 0 0', fontSize:10, color:'rgba(255,255,255,.18)', textAlign:'center' }}>Hint: demo password is <code style={{color:'rgba(255,255,255,.35)'}}>admin123</code></p>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* == UPGRADE PROMPT == */}
      {upgradeOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:2147483656, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={() => setUpgradeOpen(false)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.70)' }} />
          <div style={{ position:'relative', width:'100%', maxWidth:360, background:'rgba(6,6,10,.98)', border:'1px solid rgba(248,113,113,.25)', borderRadius:20, padding:'24px 22px', animation:'fd-over .22s cubic-bezier(.22,1,.36,1) both', textAlign:'center' }}>
            <div style={{ width:52, height:52, borderRadius:16, background:'rgba(248,113,113,.12)', border:'1px solid rgba(248,113,113,.22)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
              <DdriveIcon size={22} />
            </div>
            <p style={{ margin:'0 0 6px', fontSize:15, fontWeight:700, color:'rgba(255,255,255,.90)' }}>Storage Full</p>
            <p style={{ margin:'0 0 18px', fontSize:12, color:'rgba(255,255,255,.38)', lineHeight:1.6 }}>
              Your {storagePlan.gb} GB {storagePlan.label} plan is full.<br/>
              Upgrade to keep uploading.
            </p>
            <button onClick={() => { setUpgradeOpen(false); setPlansOpen(true); }}
              style={{ width:'100%', padding:'11px', borderRadius:11, border:'none', background:'linear-gradient(135deg,#a78bfa,#818cf8)', cursor:'pointer', fontWeight:700, fontSize:13, color:'#fff', marginBottom:10 }}>
              <Zap style={{ width:13, height:13, display:'inline', marginRight:6, verticalAlign:'middle' }} />
              See Upgrade Plans
            </button>
            <button onClick={() => setUpgradeOpen(false)} style={{ background:'transparent', border:'none', cursor:'pointer', fontSize:12, color:'rgba(255,255,255,.30)' }}>
              Maybe later
            </button>
          </div>
        </div>
      )}

      {/* == DRIVE PLANS MODAL == */}
      {plansOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:2147483657, display:'flex', alignItems:'center', justifyContent:'center', padding:'12px 10px' }}>
          <div onClick={() => { if (!driveCheckoutBusy) setPlansOpen(false); }} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.85)', backdropFilter:'blur(18px)' }} />
          <div style={{ position:'relative', width:'100%', maxWidth:780, background:'rgba(5,5,9,.99)', border:'1px solid rgba(255,255,255,.09)', borderRadius:22, boxShadow:'0 32px 100px rgba(0,0,0,.95), 0 0 0 1px rgba(255,255,255,.03)', overflow:'hidden', animation:'fd-over .26s cubic-bezier(.22,1,.36,1) both', maxHeight:'94vh', display:'flex', flexDirection:'column' }}>

            {/* -- Header -- */}
            <div className="fd-plans-header" style={{ padding:'22px 28px 18px', borderBottom:'1px solid rgba(255,255,255,.06)', display:'flex', alignItems:'center', gap:14, flexShrink:0 }}>
              <div className="fd-plans-icon" style={{ width:40, height:40, borderRadius:12, background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.10)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <DdriveIcon size={17} />
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <p className="fd-plans-title" style={{ margin:0, fontSize:16, fontWeight:700, color:'rgba(255,255,255,.90)', letterSpacing:'-0.02em' }}>Storage Plans</p>
                <p className="fd-plans-subtitle" style={{ margin:'2px 0 0', fontSize:11.5, color:'rgba(255,255,255,.30)', fontWeight:400 }}>Billed in INR · GST incl. · Receipt via email</p>
              </div>

              {/* Billing period toggle */}
              <div style={{ display:'flex', alignItems:'center', background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)', borderRadius:9, overflow:'hidden', flexShrink:0 }}>
                {(['monthly','annual'] as const).map(p => (
                  <button key={p} onClick={() => setBillingPeriod(p)}
                    style={{ padding:'6px 13px', border:'none', background:billingPeriod===p?'rgba(255,255,255,.09)':'transparent', cursor:'pointer', fontSize:11.5, fontWeight:600, color:billingPeriod===p?'rgba(255,255,255,.85)':'rgba(255,255,255,.35)', transition:'all .12s', display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap' }}>
                    {p === 'monthly' ? 'Monthly' : <><span>Annual</span><span style={{ fontSize:8.5, fontWeight:700, background:'rgba(255,255,255,.08)', color:'rgba(255,255,255,.50)', borderRadius:4, padding:'1px 5px' }}>–17%</span></>}
                  </button>
                ))}
              </div>

              <button onClick={() => { if (!driveCheckoutBusy) setPlansOpen(false); }}
                style={{ width:30, height:30, borderRadius:'50%', border:'1px solid rgba(255,255,255,.08)', background:'rgba(255,255,255,.03)', display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,.32)', cursor:'pointer', flexShrink:0, transition:'all .12s' }}
                onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,.08)';e.currentTarget.style.color='rgba(255,255,255,.70)';}}
                onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,.03)';e.currentTarget.style.color='rgba(255,255,255,.32)';}}>
                <X style={{width:12,height:12}}/>
              </button>
            </div>

            {/* -- Status messages -- */}
            {(driveCheckoutSuccess || driveCheckoutError) && (
              <div style={{ padding:'10px 28px', flexShrink:0, background: driveCheckoutSuccess ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.03)', borderBottom:'1px solid rgba(255,255,255,.05)' }}>
                <p style={{ margin:0, fontSize:12.5, fontWeight:600, color: driveCheckoutSuccess ? 'rgba(255,255,255,.80)' : 'rgba(248,113,113,.80)' }}>
                  {driveCheckoutSuccess || driveCheckoutError}
                </p>
              </div>
            )}

            {/* -- Plans grid / carousel -- */}
            <div className="fd-plans-scroll fd-scroll" style={{ padding:'20px 24px 24px', overflowY:'auto', flex:1 }}>
              <div className="fd-plans-grid" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
                {DRIVE_PLANS.map(plan => {
                  const isActive     = currentPlan === plan.id;
                  const isBusy       = driveCheckoutBusy === plan.id;
                  const monthlyPrice = plan.price;
                  const annualPrice  = Math.round(plan.price * 10);
                  const annualFull   = plan.price * 12;
                  return (
                    <div key={plan.id} className="fd-plan-card" style={{
                      position:'relative', display:'flex', flexDirection:'column',
                      padding:'20px 16px 16px', borderRadius:18,
                      border: isActive
                        ? '1px solid rgba(255,255,255,.22)'
                        : plan.popular
                          ? '1px solid rgba(255,255,255,.13)'
                          : '1px solid rgba(255,255,255,.07)',
                      background: isActive ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.025)',
                      boxShadow: isActive ? '0 0 0 1px rgba(255,255,255,.08), 0 8px 24px rgba(0,0,0,.35)' : 'none',
                      transition:'border-color .16s, background .16s',
                    }}>

                      {/* Popular pill */}
                      {plan.popular && !isActive && (
                        <div style={{ position:'absolute', top:-10, left:'50%', transform:'translateX(-50%)', background:'rgba(255,255,255,.10)', border:'1px solid rgba(255,255,255,.16)', backdropFilter:'blur(8px)', borderRadius:99, padding:'2px 10px', fontSize:8.5, fontWeight:700, color:'rgba(255,255,255,.60)', letterSpacing:'.07em', whiteSpace:'nowrap' }}>
                          POPULAR
                        </div>
                      )}

                      {/* Active chip */}
                      {isActive && (
                        <div style={{ position:'absolute', top:12, right:12, display:'flex', alignItems:'center', gap:3, padding:'2px 7px', borderRadius:99, background:'rgba(255,255,255,.10)', border:'1px solid rgba(255,255,255,.18)' }}>
                          <Check style={{ width:7, height:7, color:'rgba(255,255,255,.70)' }} />
                          <span style={{ fontSize:8.5, fontWeight:700, color:'rgba(255,255,255,.65)', letterSpacing:'.05em' }}>ACTIVE</span>
                        </div>
                      )}

                      {/* Plan name + storage */}
                      <p style={{ margin:'0 0 2px', fontSize:14, fontWeight:700, color:'rgba(255,255,255,.88)', letterSpacing:'-0.01em' }}>{plan.label}</p>
                      <p style={{ margin:'0 0 14px', fontSize:11, color:'rgba(255,255,255,.32)', fontWeight:500 }}>
                        {plan.gb >= 1024 ? `${plan.gb/1024} TB` : `${plan.gb} GB`} storage
                      </p>

                      {/* Price */}
                      <div style={{ marginBottom:16 }}>
                        {monthlyPrice === 0 ? (
                          <span style={{ fontSize:26, fontWeight:800, color:'rgba(255,255,255,.85)', letterSpacing:'-0.03em' }}>Free</span>
                        ) : billingPeriod === 'monthly' ? (
                          <div style={{ display:'flex', alignItems:'baseline', gap:1 }}>
                            <span style={{ fontSize:26, fontWeight:800, color:'rgba(255,255,255,.88)', letterSpacing:'-0.03em' }}>₹{monthlyPrice}</span>
                            <span style={{ fontSize:11, color:'rgba(255,255,255,.28)', marginLeft:2 }}>/mo</span>
                          </div>
                        ) : (
                          <div>
                            <div style={{ display:'flex', alignItems:'baseline', gap:1 }}>
                              <span style={{ fontSize:26, fontWeight:800, color:'rgba(255,255,255,.88)', letterSpacing:'-0.03em' }}>₹{annualPrice}</span>
                              <span style={{ fontSize:11, color:'rgba(255,255,255,.28)', marginLeft:2 }}>/yr</span>
                            </div>
                            <p style={{ margin:'2px 0 0', fontSize:10, color:'rgba(255,255,255,.22)', textDecoration:'line-through' }}>₹{annualFull}/yr</p>
                          </div>
                        )}
                      </div>

                      {/* Perks */}
                      <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:18, flex:1 }}>
                        {plan.perks.map((perk, pi) => (
                          <div key={pi} style={{ display:'flex', alignItems:'flex-start', gap:7 }}>
                            <Check style={{ width:10, height:10, color:'rgba(255,255,255,.35)', flexShrink:0, marginTop:2 }} />
                            <span style={{ fontSize:11, color:'rgba(255,255,255,.45)', lineHeight:1.45, fontWeight:400 }}>{perk}</span>
                          </div>
                        ))}
                      </div>

                      {/* CTA */}
                      <button
                        onClick={e => { e.stopPropagation(); void handleDriveUpgrade(plan.id); }}
                        disabled={!!driveCheckoutBusy || (isActive && plan.price > 0)}
                        style={{
                          width:'100%', padding:'9px 0', borderRadius:10,
                          border: isActive ? '1px solid rgba(255,255,255,.20)' : '1px solid rgba(255,255,255,.12)',
                          background: isActive
                            ? 'rgba(255,255,255,.10)'
                            : plan.popular
                              ? 'rgba(255,255,255,.08)'
                              : 'rgba(255,255,255,.04)',
                          cursor: (!!driveCheckoutBusy || (isActive && plan.price > 0)) ? 'not-allowed' : 'pointer',
                          fontSize:12, fontWeight:600,
                          color: isActive ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.55)',
                          opacity: !!driveCheckoutBusy && !isBusy ? 0.4 : 1,
                          transition:'all .12s', display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                        }}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,.10)'; e.currentTarget.style.color = 'rgba(255,255,255,.85)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = isActive ? 'rgba(255,255,255,.10)' : plan.popular ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.04)'; e.currentTarget.style.color = isActive ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.55)'; }}>
                        {isBusy && <Loader2 style={{ width:11, height:11, animation:'fd-spin .8s linear infinite' }} />}
                        {isActive
                          ? (plan.price === 0 ? '✓ Current plan' : '✓ Active')
                          : isBusy ? 'Processing…'
                          : plan.price === 0 ? 'Downgrade to Free'
                          : 'Upgrade'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* -- Footer -- */}
            <div className="fd-plans-footer" style={{ padding:'12px 24px 16px', borderTop:'1px solid rgba(255,255,255,.05)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
              <p style={{ margin:0, fontSize:10, color:'rgba(255,255,255,.20)' }}>
                All plans billed in INR · GST included
              </p>
              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                <span style={{ fontSize:10, color:'rgba(255,255,255,.16)' }}>Secured by</span>
                <span style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,.30)', letterSpacing:'.02em' }}>Razorpay</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* == QR Share Dialog == */}
      {/* == LABEL PICKER == */}
      {labelTarget && (
        <div style={{ position:'fixed', inset:0, zIndex:2147483658, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={() => setLabelTarget(null)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.60)' }} />
          <div style={{ position:'relative', width:'100%', maxWidth:300, background:'rgba(6,6,10,.98)', border:'1px solid rgba(255,255,255,.09)', borderRadius:18, padding:'20px', animation:'fd-over .20s cubic-bezier(.22,1,.36,1) both' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
              <Tag style={{ width:15, height:15, color:'#a78bfa' }} />
              <span style={{ fontWeight:700, fontSize:14, color:'rgba(255,255,255,.88)', flex:1 }}>Choose Label</span>
              <button onClick={() => setLabelTarget(null)} style={{ background:'transparent', border:'none', cursor:'pointer', color:'rgba(255,255,255,.35)' }}><X style={{width:14,height:14}}/></button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:14 }}>
              {LABEL_COLORS.map(lc => {
                const item   = items.find(i => i.id === labelTarget);
                const active = item?.label === lc.hex;
                return (
                  <button key={lc.hex} onClick={() => setItemLabel(labelTarget, active ? undefined : lc.hex)}
                    style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5, padding:'10px 6px', borderRadius:10, border:`2px solid ${active?lc.hex:'rgba(255,255,255,.08)'}`, background:active?`${lc.hex}18`:'rgba(255,255,255,.03)', cursor:'pointer', transition:'all .12s' }}>
                    <span style={{ width:20, height:20, borderRadius:'50%', background:lc.hex, display:'block' }} />
                    <span style={{ fontSize:9.5, color:active?lc.hex:'rgba(255,255,255,.40)', fontWeight:600 }}>{lc.name}</span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => setItemLabel(labelTarget, undefined)}
              style={{ width:'100%', padding:'7px', borderRadius:9, border:'1px solid rgba(255,255,255,.10)', background:'rgba(255,255,255,.04)', cursor:'pointer', fontSize:11, fontWeight:600, color:'rgba(255,255,255,.40)' }}>
              Remove Label
            </button>
          </div>
        </div>
      )}

      {/* == EMAIL SHARE == */}
      {emailFile && (
        <div style={{ position:'fixed', inset:0, zIndex:2147483658, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={() => { if (!emailSending) { setEmailFile(null); setEmailTo(''); setEmailNotes(''); }}} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.72)', backdropFilter:'blur(8px)' }} />
          <div style={{ position:'relative', width:'100%', maxWidth:480, background:'rgba(5,5,9,.99)', border:'1px solid rgba(255,255,255,.08)', borderRadius:22, overflow:'hidden', animation:'fd-over .24s cubic-bezier(.22,1,.36,1) both', boxShadow:'0 24px 80px rgba(0,0,0,.90)' }}>

            {/* Modal header */}
            <div style={{ padding:'18px 20px 14px', borderBottom:'1px solid rgba(255,255,255,.06)', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:38, height:38, borderRadius:11, background:'linear-gradient(135deg,rgba(99,102,241,.22),rgba(139,92,246,.14))', border:'1px solid rgba(139,92,246,.28)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <Mail style={{ width:16, height:16, color:'#818cf8' }} />
              </div>
              <div style={{ flex:1 }}>
                <p style={{ margin:0, fontSize:15, fontWeight:800, color:'rgba(255,255,255,.92)' }}>Send via Email</p>
                <p style={{ margin:'2px 0 0', fontSize:10.5, color:'rgba(255,255,255,.32)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{emailFile.name}</p>
              </div>
              <button onClick={() => { setEmailFile(null); setEmailTo(''); setEmailNotes(''); }} style={{ width:28, height:28, borderRadius:'50%', border:'1px solid rgba(255,255,255,.09)', background:'transparent', display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,.35)', cursor:'pointer' }}>
                <X style={{width:12,height:12}}/>
              </button>
            </div>

            {/* Email preview card */}
            <div style={{ margin:'14px 20px 0', borderRadius:14, border:'1px solid rgba(255,255,255,.07)', background:'rgba(255,255,255,.025)', overflow:'hidden' }}>
              {/* Preview header bar */}
              <div style={{ background:'linear-gradient(135deg,#312e81,#4c1d95)', padding:'14px 18px 12px', position:'relative' }}>
                <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:8 }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:'rgba(255,255,255,.15)' }} />
                  <div style={{ width:8, height:8, borderRadius:'50%', background:'rgba(255,255,255,.15)' }} />
                  <div style={{ width:8, height:8, borderRadius:'50%', background:'rgba(255,255,255,.15)' }} />
                  <span style={{ marginLeft:8, fontSize:9, color:'rgba(255,255,255,.35)', fontWeight:600 }}>Email Preview</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:32, height:32, borderRadius:9, background:'rgba(255,255,255,.12)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <DdriveIcon size={14} />
                  </div>
                  <div>
                    <p style={{ margin:0, fontSize:12, fontWeight:700, color:'#fff' }}>Ddrive</p>
                    <p style={{ margin:0, fontSize:9.5, color:'rgba(255,255,255,.50)' }}>noreply@docrud.in</p>
                  </div>
                </div>
              </div>
              <div style={{ padding:'14px 18px' }}>
                <p style={{ margin:'0 0 8px', fontSize:13, fontWeight:700, color:'rgba(255,255,255,.82)' }}>📁 A file has been shared with you</p>
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:10, background:'rgba(139,92,246,.10)', border:'1px solid rgba(139,92,246,.18)', marginBottom:10 }}>
                  <KindIcon kind={emailFile.kind ?? 'other'} sz={13} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ margin:0, fontSize:12, fontWeight:600, color:'rgba(255,255,255,.80)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{emailFile.name}</p>
                    <p style={{ margin:'1px 0 0', fontSize:9.5, color:'rgba(255,255,255,.36)' }}>{emailFile.size ?? '—'} · {emailFile.privacy === 'public' ? 'Public' : 'Restricted'}</p>
                  </div>
                </div>
                {emailNotes.trim() && (
                  <div style={{ padding:'8px 12px', borderRadius:9, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.07)', marginBottom:10 }}>
                    <p style={{ margin:0, fontSize:11, color:'rgba(255,255,255,.50)', fontStyle:'italic', lineHeight:1.5 }}>"{emailNotes.trim()}"</p>
                  </div>
                )}
                <div style={{ display:'inline-block', padding:'8px 18px', borderRadius:9, background:'linear-gradient(135deg,#7c3aed,#6d28d9)', fontSize:12, fontWeight:700, color:'#fff' }}>
                  Open File →
                </div>
                <p style={{ margin:'10px 0 0', fontSize:9.5, color:'rgba(255,255,255,.28)' }}>Sent via Ddrive · Unsubscribe</p>
              </div>
            </div>

            {/* Form fields */}
            <div style={{ padding:'14px 20px 20px', display:'flex', flexDirection:'column', gap:10 }}>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'rgba(255,255,255,.45)', marginBottom:5, letterSpacing:'.04em', textTransform:'uppercase' }}>Recipient Email *</label>
                <input type="email" placeholder="colleague@company.com" value={emailTo} onChange={e => setEmailTo(e.target.value)} className="fd-input"
                  style={{ background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.10)', borderRadius:10, padding:'10px 13px', color:'rgba(255,255,255,.88)', fontSize:13, outline:'none', width:'100%', boxSizing:'border-box' }} />
              </div>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'rgba(255,255,255,.45)', marginBottom:5, letterSpacing:'.04em', textTransform:'uppercase' }}>Personal Note <span style={{ color:'rgba(255,255,255,.22)', fontWeight:500 }}>(optional)</span></label>
                <textarea placeholder="Add a message to accompany this file…" value={emailNotes} onChange={e => setEmailNotes(e.target.value)} className="fd-textarea"
                  style={{ background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.10)', borderRadius:10, padding:'10px 13px', color:'rgba(255,255,255,.88)', fontSize:13, outline:'none', width:'100%', boxSizing:'border-box', resize:'vertical', minHeight:72, fontFamily:'inherit' }} />
              </div>
              <button onClick={sendEmail} disabled={!emailTo.trim() || emailSending || emailSent}
                style={{ width:'100%', height:44, borderRadius:12, border:'none', background:emailSent?'rgba(52,211,153,.18)':emailTo.trim()?'linear-gradient(135deg,#7c3aed,#6366f1)':'rgba(255,255,255,.06)', cursor:emailTo.trim()&&!emailSending&&!emailSent?'pointer':'default', display:'flex', alignItems:'center', justifyContent:'center', gap:8, fontSize:13.5, fontWeight:700, color:emailSent?'#34d399':emailTo.trim()?'#fff':'rgba(255,255,255,.28)', transition:'all .20s', boxShadow:emailTo.trim()&&!emailSent?'0 2px 16px rgba(124,58,237,.35)':'none' }}>
                {emailSent ? <><Check style={{width:15,height:15}}/> Email Sent!</> : emailSending ? <><div style={{width:14,height:14,border:'2px solid rgba(255,255,255,.25)',borderTopColor:'#fff',borderRadius:'50%',animation:'fd-spin .7s linear infinite'}}/> Sending…</> : <><Mail style={{width:14,height:14}}/> Send Email</>}
              </button>
              {emailError && (
                <p style={{ margin:'8px 0 0', fontSize:11.5, color:'#f87171', textAlign:'center', fontWeight:600 }}>
                  ⚠ {emailError}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* == FILE HISTORY MODAL == */}
      {historyFile && (
        <div style={{ position:'fixed', inset:0, zIndex:2147483658, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={() => setHistoryFile(null)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.72)', backdropFilter:'blur(8px)' }} />
          <div style={{ position:'relative', width:'100%', maxWidth:460, background:'rgba(5,5,9,.99)', border:'1px solid rgba(255,255,255,.08)', borderRadius:22, overflow:'hidden', animation:'fd-over .22s cubic-bezier(.22,1,.36,1) both', boxShadow:'0 24px 80px rgba(0,0,0,.90)', maxHeight:'80vh', display:'flex', flexDirection:'column' }}>
            {/* Header */}
            <div style={{ padding:'16px 20px 12px', borderBottom:'1px solid rgba(255,255,255,.06)', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:'rgba(139,92,246,.14)', border:'1px solid rgba(139,92,246,.25)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Clock style={{ width:15, height:15, color:'#a78bfa' }} />
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ margin:0, fontSize:14, fontWeight:800, color:'rgba(255,255,255,.90)' }}>File History</p>
                <p style={{ margin:'1px 0 0', fontSize:10.5, color:'rgba(255,255,255,.32)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{historyFile.name}</p>
              </div>
              <button onClick={() => setHistoryFile(null)} style={{ width:28, height:28, borderRadius:'50%', border:'1px solid rgba(255,255,255,.09)', background:'transparent', display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,.35)', cursor:'pointer' }}>
                <X style={{width:12,height:12}}/>
              </button>
            </div>
            {/* Timeline */}
            <div className="fd-scroll" style={{ overflowY:'auto', padding:'16px 20px', flex:1 }}>
              {(!historyFile.history || historyFile.history.length === 0) ? (
                <div style={{ textAlign:'center', padding:'32px 0' }}>
                  <p style={{ margin:0, fontSize:32 }}>📋</p>
                  <p style={{ margin:'10px 0 4px', fontSize:13, fontWeight:600, color:'rgba(255,255,255,.38)' }}>No activity yet</p>
                  <p style={{ margin:0, fontSize:11, color:'rgba(255,255,255,.20)' }}>Actions on this file will appear here</p>
                </div>
              ) : (
                <div style={{ position:'relative' }}>
                  {/* Vertical line */}
                  <div style={{ position:'absolute', left:18, top:0, bottom:0, width:1.5, background:'rgba(255,255,255,.06)', zIndex:0 }} />
                  {[...(historyFile.history ?? [])].reverse().map((entry, i) => (
                    <div key={entry.id} style={{ display:'flex', gap:14, marginBottom:i < (historyFile.history?.length ?? 0)-1 ? 18 : 0, position:'relative', zIndex:1 }}>
                      {/* Dot */}
                      <div style={{ width:36, height:36, borderRadius:10, background:'rgba(139,92,246,.10)', border:'1px solid rgba(139,92,246,.20)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:16 }}>
                        {entry.icon}
                      </div>
                      <div style={{ flex:1, paddingTop:6 }}>
                        <p style={{ margin:0, fontSize:12.5, fontWeight:600, color:'rgba(255,255,255,.80)' }}>{entry.action}</p>
                        {entry.detail && <p style={{ margin:'2px 0 0', fontSize:11, color:'rgba(255,255,255,.36)' }}>{entry.detail}</p>}
                        <p style={{ margin:'4px 0 0', fontSize:10, color:'rgba(255,255,255,.24)' }}>{new Date(entry.timestamp).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Footer stats */}
            <div style={{ padding:'12px 20px', borderTop:'1px solid rgba(255,255,255,.055)', background:'rgba(255,255,255,.012)', display:'flex', gap:16, flexShrink:0 }}>
              {[
                { label:'Total Actions', value: historyFile.history?.length ?? 0 },
                { label:'Views', value: historyFile.history?.filter(h=>h.action==='Viewed').length ?? 0 },
                { label:'Shares', value: historyFile.history?.filter(h=>h.action.startsWith('Shared')).length ?? 0 },
              ].map(stat => (
                <div key={stat.label} style={{ textAlign:'center', flex:1 }}>
                  <p style={{ margin:0, fontSize:18, fontWeight:800, color:'#a78bfa' }}>{stat.value}</p>
                  <p style={{ margin:'2px 0 0', fontSize:9.5, color:'rgba(255,255,255,.28)', fontWeight:600 }}>{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* == IMPORT CONFIRMATION (drive-import deep link) == */}
      {importConfirm && (
        <div style={{ position:'fixed', inset:0, zIndex:2147483662, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={() => setImportConfirm(null)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.74)', backdropFilter:'blur(10px)' }} />
          <div style={{ position:'relative', width:'100%', maxWidth:400, background:'rgba(5,5,9,.99)', border:'1px solid rgba(255,255,255,.09)', borderRadius:22, overflow:'hidden', animation:'fd-over .22s cubic-bezier(.22,1,.36,1) both', boxShadow:'0 24px 72px rgba(0,0,0,.90)', padding:'28px 28px 24px' }}>
            {/* Icon */}
            <div style={{ width:52, height:52, borderRadius:16, background:'linear-gradient(135deg,rgba(99,102,241,.22),rgba(139,92,246,.14))', border:'1px solid rgba(139,92,246,.28)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}>
              <DdriveIcon size={22} />
            </div>
            <p style={{ margin:'0 0 6px', fontSize:18, fontWeight:800, color:'rgba(255,255,255,.92)' }}>Add to Your Ddrive?</p>
            <p style={{ margin:'0 0 20px', fontSize:13, color:'rgba(255,255,255,.45)', lineHeight:1.6 }}>
              A file was shared with you via email. Would you like to add it to your Ddrive for easy access?
            </p>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setImportConfirm(null)}
                style={{ flex:1, padding:'10px 0', borderRadius:11, border:'1px solid rgba(255,255,255,.10)', background:'rgba(255,255,255,.04)', color:'rgba(255,255,255,.50)', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                Dismiss
              </button>
              <button onClick={() => {
                if (!importConfirm) return;
                // Create a placeholder entry for the shared file
                const newItem: DriveItem = {
                  id: importConfirm.id, parentId: null, type: 'file',
                  name: importConfirm.name, kind: 'other',
                  size: '—', privacy: 'public',
                  createdAt: Date.now(), updatedAt: Date.now(),
                  views: 0, sharedViaQr: true,
                };
                setItems(prev => {
                  if (prev.some(i => i.id === importConfirm.id)) return prev;
                  return [newItem, ...prev];
                });
                addHistory(importConfirm.id, 'Added to Drive', 'Imported from email link', '📥');
                setImportConfirm(null);
                setSection('my-drive');
                setNavStack([{ id: null, name: 'My Ddrive' }]);
              }}
                style={{ flex:1, padding:'10px 0', borderRadius:11, border:'none', background:'linear-gradient(135deg,#7c3aed,#6d28d9)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                Add to Ddrive
              </button>
            </div>
          </div>
        </div>
      )}

      <QRShareDialog open={!!qrShareTarget} onClose={() => setQrShareTarget(null)} target={qrShareTarget ?? {id:'',name:'',kind:'file'}} />

      {/* == QR Scanner Dialog == */}
      <QRScannerDialog open={scannerOpen} onClose={() => setScannerOpen(false)} onFileAdded={handleScannerFileAdded} />

      {/* == Universal File Viewer == */}
      <UniversalFileViewer open={!!viewerFile} file={viewerFile} onClose={() => setViewerFile(null)} />

      {/* == FEATURE LOCK TOAST == */}
      {featureLocked && (
        <div style={{
          position: 'fixed',
          bottom: 32,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 2147483670,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'rgba(8,8,15,.97)',
          border: '1px solid rgba(139,92,246,.38)',
          borderRadius: 18,
          padding: '13px 14px 13px 14px',
          boxShadow: '0 12px 48px rgba(0,0,0,.85), 0 0 0 1px rgba(139,92,246,.12), inset 0 1px 0 rgba(255,255,255,.05)',
          backdropFilter: 'blur(28px)',
          maxWidth: 420,
          width: 'calc(100vw - 40px)',
          animation: 'fd-over .22s cubic-bezier(.22,1,.36,1) both',
        }}>
          {/* Lock icon badge */}
          <div style={{
            flexShrink: 0,
            width: 38, height: 38,
            borderRadius: 11,
            background: 'linear-gradient(135deg,rgba(124,58,237,.26),rgba(99,102,241,.16))',
            border: '1px solid rgba(139,92,246,.38)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Lock style={{ width: 15, height: 15, color: '#c4b5fd' }} />
          </div>

          {/* Text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,.93)', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {featureLocked.requiredPlan} plan required
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'rgba(255,255,255,.38)', lineHeight: 1.4 }}>
              Upgrade to unlock this feature
            </p>
          </div>

          {/* Upgrade CTA */}
          <button
            onClick={() => { setPlansOpen(true); setFeatureLocked(null); }}
            style={{
              flexShrink: 0,
              padding: '8px 15px',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg,#7c3aed,#6d28d9)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '-0.01em',
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 12px rgba(124,58,237,.45)',
            }}
          >
            Upgrade →
          </button>

          {/* Dismiss */}
          <button
            onClick={() => setFeatureLocked(null)}
            style={{
              flexShrink: 0,
              width: 28, height: 28,
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,.08)',
              background: 'rgba(255,255,255,.04)',
              color: 'rgba(255,255,255,.35)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0,
            }}
          >
            <X style={{ width: 11, height: 11 }} />
          </button>
        </div>
      )}
    </>,
    document.body,
  );
}
