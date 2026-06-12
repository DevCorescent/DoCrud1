'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { AlignCenter, AlignLeft, AlignRight, BarChart3, Bold, BrainCircuit, Clock, Copy, Download, Eye, FileSpreadsheet, Italic, KeyRound, LineChart, Link2, Loader2, Mail, MessageCircle, Moon, PencilLine, PieChart, Plus, Redo2, RefreshCw, Rows3, Save, Search, Sheet, SlidersHorizontal, Sun, Trash2, Underline, Undo2, Upload, Users, X } from 'lucide-react';
import { useCollabEngine } from '@/lib/collabEngine';
import CollabBar from '@/components/CollabBar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { buildAbsoluteAppUrl } from '@/lib/url';
import type { DocSheetCellAlign, DocSheetCellFormat, DocSheetColumnType, DocSheetSheet, DocSheetWorkbook, DocumentHistory } from '@/types/document';
import {
  applyDocSheetFormulaPack,
  buildDocSheetPreviewHtml,
  buildDocSheetVisualizationInput,
  createDocSheetWorkbookFromTemplate,
  createDocSheetColumn,
  createDocSheetRow,
  createDocSheetSheet,
  createDocSheetWorkbook,
  duplicateDocSheetSheet,
  exportDocSheetWorkbookToXlsx,
  exportDocSheetToCsv,
  buildVisualizerTableFromDocSheetSheet,
  getDocSheetFormulaPacks,
  getDocSheetColumnLetter,
  getDocSheetDisplayValue,
  getDocSheetSmartTemplates,
  normalizeDocSheetWorkbook,
  parseSpreadsheetFileToWorkbook,
  summarizeDocSheetSheet,
} from '@/lib/docsheet';
import { buildInteractiveVisualization, type DocumentVisualizationInsights, type VisualizerChart, type VisualizerDeepInsight, type VisualizerMetric, type VisualizerStatKey } from '@/lib/document-visualizer-analysis';

interface DocSheetCenterProps {
  history: DocumentHistory[];
  onHistoryRefresh: () => Promise<void>;
  layout?: 'module' | 'page';
  initialHistoryId?: string;
  /** File passed via Drive handoff — auto-imported on first render */
  initialFile?: File;
}

type DocSheetStudioPanel = 'none' | 'file' | 'share' | 'export' | 'insights' | 'ai' | 'smart' | 'history' | 'formatting' | 'comments';
type DocSheetTopMenu = null | 'file' | 'edit' | 'view' | 'insert' | 'format' | 'data' | 'tools' | 'help';

interface VisualizerResult extends DocumentVisualizationInsights {
  provider: string;
  model: string;
  sourceType: 'paste' | 'preview';
}

const columnTypes: Array<{ value: DocSheetColumnType; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'percent', label: 'Percent' },
  { value: 'date', label: 'Date' },
];

function formatDate(value?: string) {
  if (!value) return 'Not yet saved';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function getCellKey(rowId: string, columnId: string) {
  return `${rowId}:${columnId}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function cloneWorkbook(workbook: DocSheetWorkbook): DocSheetWorkbook {
  if (typeof structuredClone === 'function') {
    return structuredClone(workbook);
  }
  return JSON.parse(JSON.stringify(workbook)) as DocSheetWorkbook;
}

function createSharePassword(length = 8) {
  return Math.random().toString(36).slice(2, 2 + length).toUpperCase();
}

function extractWorkbookFromHistory(entry: DocumentHistory): DocSheetWorkbook | undefined {
  try {
    const raw = entry.docsheetWorkbook
      || (entry.data?.docsheetWorkbook ? JSON.parse(entry.data.docsheetWorkbook) : null);
    if (!raw) return undefined;
    return normalizeDocSheetWorkbook(raw);
  } catch {
    return undefined;
  }
}

function MetricCard({ metric }: { metric: VisualizerMetric }) {
  return (
    <div className="rounded-[1.15rem] border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{metric.label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{metric.value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{metric.insight}</p>
    </div>
  );
}

function BarChartView({ chart }: { chart: VisualizerChart }) {
  const max = Math.max(...chart.data.map((item) => item.value), 1);
  return (
    <div className="space-y-3">
      {chart.data.map((item) => (
        <div key={`${chart.id}-${item.label}`} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-xs text-slate-600">
            <span className="truncate">{item.label}</span>
            <span className="font-medium text-slate-900">{item.value.toLocaleString()}</span>
          </div>
          <div className="h-3 rounded-full bg-slate-100">
            <div className="h-3 rounded-full bg-[linear-gradient(90deg,#0f172a_0%,#2563eb_100%)]" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function LineChartView({ chart }: { chart: VisualizerChart }) {
  const max = Math.max(...chart.data.map((item) => item.value), 1);
  return (
    <div className="flex min-h-[150px] items-end gap-3 rounded-[1.15rem] border border-slate-100 bg-slate-50 p-4">
      {chart.data.map((item) => (
        <div key={`${chart.id}-${item.label}`} className="flex flex-1 flex-col items-center justify-end gap-2">
          <div className="w-full rounded-t-xl bg-[linear-gradient(180deg,#93c5fd_0%,#2563eb_100%)]" style={{ height: `${Math.max(18, (item.value / max) * 116)}px` }} />
          <span className="line-clamp-2 text-center text-[10px] text-slate-500">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function DonutChartView({ chart }: { chart: VisualizerChart }) {
  const total = chart.data.reduce((sum, item) => sum + item.value, 0) || 1;
  const colors = ['#0f172a', '#2563eb', '#60a5fa', '#93c5fd', '#cbd5e1'];
  let cursor = 0;
  const segments = chart.data.map((item, index) => {
    const start = cursor;
    const span = (item.value / total) * 100;
    cursor += span;
    return { ...item, color: colors[index % colors.length], start, end: cursor };
  });

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
      <div
        className="mx-auto h-40 w-40 rounded-full"
        style={{ background: `conic-gradient(${segments.map((segment) => `${segment.color} ${segment.start}% ${segment.end}%`).join(', ')})` }}
      >
        <div className="m-5 flex h-[120px] w-[120px] items-center justify-center rounded-full bg-white text-center shadow-inner">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Total</p>
            <p className="mt-1 text-lg font-semibold text-slate-950">{total.toLocaleString()}</p>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {segments.map((segment) => (
          <div key={`${chart.id}-${segment.label}`} className="flex items-center gap-3 text-sm text-slate-700">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: segment.color }} />
            <span className="flex-1">{segment.label}</span>
            <span className="font-medium text-slate-950">{segment.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgressChartView({ chart }: { chart: VisualizerChart }) {
  return (
    <div className="space-y-3">
      {chart.data.map((item) => (
        <div key={`${chart.id}-${item.label}`} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-xs text-slate-600">
            <span>{item.label}</span>
            <span className="font-medium text-slate-900">{item.value}</span>
          </div>
          <div className="h-3 rounded-full bg-slate-100">
            <div className="h-3 rounded-full bg-[linear-gradient(90deg,#334155_0%,#0f172a_100%)]" style={{ width: `${Math.max(0, Math.min(100, item.value))}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ChartPanel({ chart }: { chart: VisualizerChart }) {
  const Icon = chart.type === 'bar' ? BarChart3 : chart.type === 'line' ? LineChart : chart.type === 'donut' ? PieChart : Eye;
  return (
    <div className="rounded-[1.3rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-slate-950 p-2 text-white">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-950">{chart.title}</p>
          <p className="text-xs text-slate-500">{chart.insight}</p>
        </div>
      </div>
      <div className="mt-5">
        {chart.type === 'bar' ? <BarChartView chart={chart} /> : null}
        {chart.type === 'line' ? <LineChartView chart={chart} /> : null}
        {chart.type === 'donut' ? <DonutChartView chart={chart} /> : null}
        {chart.type === 'progress' ? <ProgressChartView chart={chart} /> : null}
      </div>
    </div>
  );
}

function DeepInsightCard({ insight }: { insight: VisualizerDeepInsight }) {
  const toneClasses = insight.tone === 'positive'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
    : insight.tone === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-950'
      : 'border-slate-200 bg-slate-50 text-slate-900';

  return (
    <div className={`rounded-[1.2rem] border p-4 ${toneClasses}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">{insight.title}</p>
      <p className="mt-3 text-sm leading-6">{insight.detail}</p>
    </div>
  );
}

function DocSheetThumbnail({ workbook }: { workbook: DocSheetWorkbook | undefined }) {
  const sheet = workbook?.sheets?.[0];
  if (!sheet) {
    return (
      <div style={{ display: 'flex', height: 92, alignItems: 'center', justifyContent: 'center', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)', fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>
        No preview
      </div>
    );
  }

  const columns = sheet.columns.slice(0, 4);
  const rows = sheet.rows.slice(0, 3);
  return (
    <div style={{ overflow: 'hidden', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: '#0e0f11' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
        {columns.map((column, idx) => (
          <div key={column.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.04)', padding: '3px 6px', fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.40)', letterSpacing: '0.04em' }}>
            {getDocSheetColumnLetter(idx)}
          </div>
        ))}
        {rows.map((row) =>
          columns.map((column) => (
            <div key={`${row.id}-${column.id}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '3px 6px', fontSize: 9, color: 'rgba(255,255,255,0.52)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {String(row.values[column.id] ?? '').slice(0, 14)}
            </div>
          )),
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)', padding: '3px 6px', fontSize: 9, color: 'rgba(255,255,255,0.28)' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sheet.name}</span>
        <span style={{ flexShrink: 0, marginLeft: 4 }}>{sheet.rows.length}×{sheet.columns.length}</span>
      </div>
    </div>
  );
}

export default function DocSheetCenter({ history, onHistoryRefresh, layout = 'module', initialHistoryId, initialFile }: DocSheetCenterProps) {
  const savedWorkbooks = useMemo(
    () => history.filter((entry) => entry.templateId === 'docsheet-workbook'),
    [history],
  );
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryPage, setLibraryPage] = useState(1);
  const pageSize = 8;
  const [workbook, setWorkbook] = useState<DocSheetWorkbook>(() => createDocSheetWorkbook());
  const [activeSheetId, setActiveSheetId] = useState(workbook.sheets[0]?.id || '');
  const [savedHistoryId, setSavedHistoryId] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [visualLoading, setVisualLoading] = useState(false);
  const [visualError, setVisualError] = useState('');
  const [visualMessage, setVisualMessage] = useState('');
  const [visualResult, setVisualResult] = useState<VisualizerResult | null>(null);
  const [selectedStats, setSelectedStats] = useState<VisualizerStatKey[]>([]);
  const [selectedCell, setSelectedCell] = useState<{ rowId: string; columnId: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [activeTab, setActiveTab] = useState<'editor' | 'insights' | 'ai' | 'smart' | 'saved'>('editor');
  const [topTab, setTopTab] = useState<'workbook' | 'share' | 'export'>('workbook');
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const [aiNextSteps, setAiNextSteps] = useState<string[]>([]);
  const [docsheetShareMode, setDocsheetShareMode] = useState<'view' | 'edit'>('view');
  const [docsheetExpiryDays, setDocsheetExpiryDays] = useState('7');
  const [docsheetSharedWithEmail, setDocsheetSharedWithEmail] = useState('');
  const [docsheetSessionLabel, setDocsheetSessionLabel] = useState('');
  const [shareAccessPolicy, setShareAccessPolicy] = useState<'standard' | 'expiring' | 'one_time'>('expiring');
  const [shareRequiresPassword, setShareRequiresPassword] = useState(true);
  const [sharePassword, setSharePassword] = useState('');
  const [shareMaxAccessCount, setShareMaxAccessCount] = useState('1');
  const [studioPanel, setStudioPanel] = useState<DocSheetStudioPanel>('none');
  const [topMenuOpen, setTopMenuOpen] = useState<DocSheetTopMenu>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [columnMenuOpen, setColumnMenuOpen] = useState<string | null>(null);
  const [columnFilterDraft, setColumnFilterDraft] = useState<{ columnId: string; op: 'contains' | 'equals' | 'gt' | 'lt' | 'gte' | 'lte'; value: string } | null>(null);
  const [rulesDraftOpen, setRulesDraftOpen] = useState(false);
  const [ruleDraft, setRuleDraft] = useState<{ columnId: string; op: 'contains' | 'equals' | 'gt' | 'lt' | 'gte' | 'lte'; value: string; bg: string; text: string }>({
    columnId: '',
    op: 'contains',
    value: '',
    bg: '#FEF3C7',
    text: '#92400E',
  });
  const [commentDraft, setCommentDraft] = useState('');
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [editingCellKey, setEditingCellKey] = useState<string | null>(null);
  const [sheetMenuOpen, setSheetMenuOpen] = useState(false);
  const [docsheetAskMessages, setDocsheetAskMessages] = useState<Array<{ id: string; role: 'user' | 'assistant'; text: string; meta?: string; actionInstruction?: string }>>([]);
  const [docsheetAskInput, setDocsheetAskInput] = useState('');
  const [docsheetAskBusy, setDocsheetAskBusy] = useState(false);
  const [aiMode, setAiMode] = useState<'ask' | 'change'>('ask');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const gridRootRef = useRef<HTMLDivElement | null>(null);
  const cellInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [selectionAnchor, setSelectionAnchor] = useState<{ rowId: string; columnId: string } | null>(null);
  const [selectionFocus, setSelectionFocus] = useState<{ rowId: string; columnId: string } | null>(null);
  const undoStackRef = useRef<DocSheetWorkbook[]>([]);
  const redoStackRef = useRef<DocSheetWorkbook[]>([]);
  const pendingUndoSnapshotRef = useRef<DocSheetWorkbook | null>(null);
  const undoTimerRef = useRef<number | null>(null);
  const [isResizingColumn, setIsResizingColumn] = useState(false);
  const [contextMenu, setContextMenu] = useState<null | { x: number; y: number; rowId: string; columnId: string }>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const formulaBarRef = useRef<HTMLInputElement | null>(null);
  const [autosaveCountdownMs, setAutosaveCountdownMs] = useState<number | null>(null);
  const lastChangeAtRef = useRef<number>(0);
  const saveStartedAtRef = useRef<number>(0);
  const [isDirty, setIsDirty] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [aiFloatOpen, setAiFloatOpen] = useState(false);
  const [menuAnchorPos, setMenuAnchorPos] = useState<{ top: number; left: number } | null>(null);
  const [collabOpen, setCollabOpen] = useState(false);

  /* ── Real-time Collaboration ── */
  const collabToken  = savedHistoryId || workbook.id;
  const collabEngine = useCollabEngine(collabToken, 'Collaborator');

  useEffect(() => {
    if (!activeSheetId && workbook.sheets[0]) {
      setActiveSheetId(workbook.sheets[0].id);
    }
  }, [activeSheetId, workbook.sheets]);

  /* ── Drive handoff: auto-import file passed from Universal File Viewer ── */
  const driveHandoffRef = useRef(false);
  useEffect(() => {
    if (!initialFile) return;
    if (driveHandoffRef.current) return;
    driveHandoffRef.current = true;
    (async () => {
      try {
        setImporting(true);
        const imported = await parseSpreadsheetFileToWorkbook(initialFile);
        setWorkbook(imported);
        setActiveSheetId(imported.sheets[0]?.id || '');
        setStatusMessage(`"${initialFile.name}" opened from Drive. You can edit, re-chart, and export it.`);
        setActiveTab('editor' as typeof activeTab);
      } catch (err) {
        setStatusMessage(err instanceof Error ? err.message : 'Could not import file from Drive.');
      } finally {
        setImporting(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initialLoadRef = useRef(false);
  useEffect(() => {
    if (layout !== 'page') return;
    if (!initialHistoryId) return;
    if (initialLoadRef.current) return;
    const match = savedWorkbooks.find((entry) => entry.id === initialHistoryId);
    if (!match) return;
    initialLoadRef.current = true;
    loadWorkbook(match);
  }, [initialHistoryId, layout, savedWorkbooks]);

  useEffect(() => {
    if (layout !== 'page') return;
    if (!topMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-docsheet-topmenu-root]')) return;
      setTopMenuOpen(null);
      setMenuAnchorPos(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setTopMenuOpen(null);
        setMenuAnchorPos(null);
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [layout, topMenuOpen]);

  useEffect(() => {
    if (layout !== 'page') return;
    if (!contextMenu) return;
    setContextMenuPosition({ left: contextMenu.x, top: contextMenu.y });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null);
    };
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-docsheet-contextmenu]')) return;
      setContextMenu(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handlePointerDown);
    };
  }, [contextMenu, layout]);

  useEffect(() => {
    if (layout !== 'page') return;
    if (!contextMenu) return;
    const updatePosition = () => {
      const menu = contextMenuRef.current;
      const width = menu?.offsetWidth || 280;
      const height = menu?.offsetHeight || 360;
      const left = clamp(contextMenu.x, 12, Math.max(12, window.innerWidth - width - 12));
      const top = clamp(contextMenu.y, 12, Math.max(12, window.innerHeight - height - 12));
      setContextMenuPosition({ left, top });
    };

    const raf = window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', updatePosition);
    };
  }, [contextMenu, layout]);

  useEffect(() => {
    if (layout !== 'page') return;
    if (!isDirty) {
      setAutosaveCountdownMs(null);
      return;
    }
    if (saving) return;
    const tick = () => {
      const remaining = Math.max(0, 5000 - (Date.now() - lastChangeAtRef.current));
      setAutosaveCountdownMs(remaining);
      return remaining;
    };
    const remaining = tick();
    const timeout = window.setTimeout(() => {
      // If there were no changes for 5 seconds, autosave.
      if (Date.now() - lastChangeAtRef.current >= 5000 && !saving) {
        void saveWorkbook();
      }
    }, remaining + 30);
    const interval = window.setInterval(() => {
      tick();
    }, 250);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [isDirty, layout, saving]);

  useEffect(() => {
    if (layout !== 'page') return;
    if (!columnMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-docsheet-column-menu]')) return;
      setColumnMenuOpen(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setColumnMenuOpen(null);
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [columnMenuOpen, layout]);

  const activeSheet = useMemo(
    () => workbook.sheets.find((sheet) => sheet.id === activeSheetId) || workbook.sheets[0] || null,
    [activeSheetId, workbook.sheets],
  );
  const selectedCellRef = useMemo(() => {
    if (!activeSheet || !selectedCell) return '';
    const rowIndex = activeSheet.rows.findIndex((row) => row.id === selectedCell.rowId);
    const colIndex = activeSheet.columns.findIndex((column) => column.id === selectedCell.columnId);
    if (rowIndex < 0 || colIndex < 0) return '';
    return `${getDocSheetColumnLetter(colIndex)}${rowIndex + 1}`;
  }, [activeSheet, selectedCell]);
  const activeSummary = useMemo(
    () => (activeSheet ? summarizeDocSheetSheet(activeSheet) : null),
    [activeSheet],
  );
  const selectedCellRawValue = useMemo(() => {
    if (!activeSheet || !selectedCell) return '';
    const row = activeSheet.rows.find((entry) => entry.id === selectedCell.rowId);
    return String(row?.values[selectedCell.columnId] ?? '');
  }, [activeSheet, selectedCell]);
  const savedRecord = useMemo(
    () => savedWorkbooks.find((entry) => entry.id === savedHistoryId) || null,
    [savedHistoryId, savedWorkbooks],
  );
  const smartTemplates = useMemo(() => getDocSheetSmartTemplates(), []);
  const formulaPacks = useMemo(() => getDocSheetFormulaPacks(), []);

  const filteredWorkbooks = useMemo(() => {
    const q = libraryQuery.trim().toLowerCase();
    if (!q) return savedWorkbooks;
    return savedWorkbooks.filter((entry) => {
      const category = (entry.category || '').toLowerCase();
      const workbookExtract = extractWorkbookFromHistory(entry);
      const title = (workbookExtract?.title || entry.templateName || '').toLowerCase();
      const sheetNames = workbookExtract?.sheets?.map((sheet) => sheet.name.toLowerCase()).join(' ') || '';
      const meta = `${title} ${category} ${(entry.data?.activeSheetName || '').toLowerCase()} ${sheetNames}`;
      return meta.includes(q);
    });
  }, [libraryQuery, savedWorkbooks]);

  const libraryTotalPages = useMemo(() => Math.max(1, Math.ceil(filteredWorkbooks.length / pageSize)), [filteredWorkbooks.length]);
  const pagedWorkbooks = useMemo(() => {
    const page = clamp(libraryPage, 1, libraryTotalPages);
    const start = (page - 1) * pageSize;
    return filteredWorkbooks.slice(start, start + pageSize);
  }, [filteredWorkbooks, libraryPage, libraryTotalPages]);

  useEffect(() => {
    setLibraryPage(1);
  }, [libraryQuery]);

  const derivedRows = useMemo(() => {
    if (!activeSheet) return [];
    let rows = [...activeSheet.rows];
    const filters = activeSheet.filters || {};
    const filterEntries = Object.entries(filters);
    if (filterEntries.length) {
      rows = rows.filter((row) => {
        return filterEntries.every(([colId, rule]) => {
          const raw = String(row.values[colId] ?? '');
          const value = String(rule.value ?? '').trim();
          if (!value) return true;
          const op = rule.op || 'contains';
          const rawLower = raw.toLowerCase();
          const valueLower = value.toLowerCase();
          const rawNum = Number(raw.replace(/[^0-9.\-]/g, ''));
          const valueNum = Number(value.replace(/[^0-9.\-]/g, ''));
          if (op === 'contains') return rawLower.includes(valueLower);
          if (op === 'equals') return rawLower === valueLower;
          if (!Number.isFinite(rawNum) || !Number.isFinite(valueNum)) return false;
          if (op === 'gt') return rawNum > valueNum;
          if (op === 'lt') return rawNum < valueNum;
          if (op === 'gte') return rawNum >= valueNum;
          if (op === 'lte') return rawNum <= valueNum;
          return true;
        });
      });
    }

    return rows;
  }, [activeSheet]);

  const formulaCoachPrompts = useMemo(() => {
    if (!activeSheet) return [];
    const labels = activeSheet.columns.map((col) => col.label.toLowerCase());
    const findCol = (needle: string) => activeSheet.columns.find((col) => col.label.toLowerCase().includes(needle))?.label;
    const has = (needle: string) => labels.some((label) => label.includes(needle));
    const prompts: string[] = [];

    const numericLike = activeSheet.columns.filter((col) => col.type === 'number' || col.type === 'currency' || col.type === 'percent');
    if (numericLike.length) {
      prompts.push('Add a totals row at the bottom with SUM formulas for every numeric column. Put "Totals" in the first text column.');
    }
    if ((has('target') || has('goal')) && (has('achiev') || has('actual') || has('done'))) {
      prompts.push('Add two new columns: Gap (=Achieved-Target) and % Achieved (=Achieved/Target). Fill formulas down for every row.');
    }
    if (has('allocat') && has('spent')) {
      prompts.push('Add a new column "Utilization %" (=Spent/Allocated) and fill formulas down. Format it as percent.');
    }
    if (has('status')) {
      prompts.push('Create a new sheet "Summary" that counts rows by Status and sums numeric columns by Status.');
    }
    if (!prompts.length) {
      prompts.push('Review this sheet and recommend the most useful formulas to add (totals, percent, gaps, and a summary sheet). Then apply them.');
    }
    return prompts.slice(0, 5);
  }, [activeSheet]);

  const selectionBounds = useMemo(() => {
    if (!activeSheet || !selectionAnchor || !selectionFocus) return null;
    const rowIndexById = new Map(derivedRows.map((row, idx) => [row.id, idx]));
    const colIndexById = new Map(activeSheet.columns.map((col, idx) => [col.id, idx]));
    const aRow = rowIndexById.get(selectionAnchor.rowId);
    const aCol = colIndexById.get(selectionAnchor.columnId);
    const fRow = rowIndexById.get(selectionFocus.rowId);
    const fCol = colIndexById.get(selectionFocus.columnId);
    if (aRow === undefined || aCol === undefined || fRow === undefined || fCol === undefined) return null;
    return {
      minRow: Math.min(aRow, fRow),
      maxRow: Math.max(aRow, fRow),
      minCol: Math.min(aCol, fCol),
      maxCol: Math.max(aCol, fCol),
    };
  }, [activeSheet, derivedRows, selectionAnchor, selectionFocus]);

  useEffect(() => {
    if (layout !== 'page') return;
    if (!activeSheet) return;
    const firstRow = derivedRows[0] || activeSheet.rows[0];
    const firstCol = activeSheet.columns[0];
    if (!firstRow || !firstCol) return;
    const isValidSelection = selectedCell
      ? activeSheet.rows.some((row) => row.id === selectedCell.rowId) && activeSheet.columns.some((col) => col.id === selectedCell.columnId)
      : false;
    if (isValidSelection) return;
    const next = { rowId: firstRow.id, columnId: firstCol.id };
    setSelectedCell(next);
    setSelectionAnchor(next);
    setSelectionFocus(next);
  }, [activeSheet, derivedRows, layout, selectedCell]);

  const scheduleUndoSnapshot = (previous: DocSheetWorkbook) => {
    pendingUndoSnapshotRef.current = cloneWorkbook(previous);
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
    }
    undoTimerRef.current = window.setTimeout(() => {
      const snapshot = pendingUndoSnapshotRef.current;
      if (!snapshot) return;
      undoStackRef.current = [...undoStackRef.current.slice(-49), snapshot];
      pendingUndoSnapshotRef.current = null;
      redoStackRef.current = [];
      undoTimerRef.current = null;
    }, 650);
  };

  const commitPendingUndo = () => {
    if (!pendingUndoSnapshotRef.current) return;
    undoStackRef.current = [...undoStackRef.current.slice(-49), pendingUndoSnapshotRef.current];
    pendingUndoSnapshotRef.current = null;
    redoStackRef.current = [];
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  };

  const updateWorkbook = (updater: (current: DocSheetWorkbook) => DocSheetWorkbook) => {
    setWorkbook((current) => {
      if (!isResizingColumn) {
        scheduleUndoSnapshot(current);
      }
      setIsDirty(true);
      lastChangeAtRef.current = Date.now();
      const next = updater(current);
      return {
        ...next,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const updateSheet = (sheetId: string, updater: (sheet: DocSheetSheet) => DocSheetSheet) => {
    updateWorkbook((current) => ({
      ...current,
      sheets: current.sheets.map((sheet) =>
        sheet.id === sheetId ? { ...updater(sheet), updatedAt: new Date().toISOString() } : sheet,
      ),
    }));
  };

  const createNewWorkbook = () => {
    const next = createDocSheetWorkbook();
    setWorkbook(next);
    setActiveSheetId(next.sheets[0]?.id || '');
    setSavedHistoryId('');
    undoStackRef.current = [];
    redoStackRef.current = [];
    pendingUndoSnapshotRef.current = null;
    setStatusMessage('Started a fresh DocSheet workbook.');
    setErrorMessage('');
    setAiSummary('');
    setAiNextSteps([]);
    setDocsheetShareMode('view');
    setDocsheetExpiryDays('7');
    setDocsheetSharedWithEmail('');
    setDocsheetSessionLabel('');
    setShareAccessPolicy('expiring');
    setShareRequiresPassword(true);
    setSharePassword('');
    setShareMaxAccessCount('1');
  };

  const addSheet = () => {
    const nextSheet = createDocSheetSheet(`Sheet ${workbook.sheets.length + 1}`);
    updateWorkbook((current) => ({
      ...current,
      sheets: [...current.sheets, nextSheet],
    }));
    setActiveSheetId(nextSheet.id);
  };

  const duplicateSheet = () => {
    if (!activeSheet) return;
    const nextSheet = duplicateDocSheetSheet(activeSheet);
    updateWorkbook((current) => ({
      ...current,
      sheets: [...current.sheets, nextSheet],
    }));
    setActiveSheetId(nextSheet.id);
  };

  const removeActiveSheet = () => {
    if (!activeSheet || workbook.sheets.length <= 1) return;
    const remaining = workbook.sheets.filter((sheet) => sheet.id !== activeSheet.id);
    updateWorkbook((current) => ({
      ...current,
      sheets: remaining,
    }));
    setActiveSheetId(remaining[0]?.id || '');
  };

  const addColumn = () => {
    if (!activeSheet) return;
    updateSheet(activeSheet.id, (sheet) => {
      const nextColumn = createDocSheetColumn(`Column ${sheet.columns.length + 1}`);
      return {
        ...sheet,
        columns: [...sheet.columns, nextColumn],
        rows: sheet.rows.map((row) => ({
          ...row,
          values: {
            ...row.values,
            [nextColumn.id]: '',
          },
        })),
      };
    });
  };

  const removeColumn = (columnId: string) => {
    if (!activeSheet || activeSheet.columns.length <= 1) return;
    updateSheet(activeSheet.id, (sheet) => ({
      ...sheet,
      columns: sheet.columns.filter((column) => column.id !== columnId),
      rows: sheet.rows.map((row) => ({
        ...row,
        values: Object.fromEntries(Object.entries(row.values).filter(([key]) => key !== columnId)),
      })),
    }));
    if (selectedCell?.columnId === columnId) {
      setSelectedCell(null);
    }
  };

  const addRow = () => {
    if (!activeSheet) return;
    updateSheet(activeSheet.id, (sheet) => ({
      ...sheet,
      rows: [...sheet.rows, createDocSheetRow(sheet.columns)],
    }));
  };

  const removeRow = (rowId: string) => {
    if (!activeSheet) return;
    updateSheet(activeSheet.id, (sheet) => ({
      ...sheet,
      rows: sheet.rows.filter((row) => row.id !== rowId),
    }));
  };

  const deleteSelectedRows = () => {
    if (!activeSheet || !selectionBounds) return;
    updateSheet(activeSheet.id, (sheet) => {
      const remainingRows = sheet.rows.filter((_, idx) => idx < selectionBounds.minRow || idx > selectionBounds.maxRow);
      const nextRows = remainingRows.length ? remainingRows : [createDocSheetRow(sheet.columns)];
      const keepRowIds = new Set(nextRows.map((row) => row.id));
      const keepColIds = new Set(sheet.columns.map((col) => col.id));
      const nextFormats: Record<string, DocSheetCellFormat> = {};
      Object.entries(sheet.cellFormats || {}).forEach(([key, value]) => {
        const [rowId, colId] = key.split(':');
        if (!rowId || !colId) return;
        if (!keepRowIds.has(rowId)) return;
        if (!keepColIds.has(colId)) return;
        nextFormats[key] = value;
      });
      return { ...sheet, rows: nextRows, cellFormats: nextFormats };
    });
    setStatusMessage('Rows deleted.');
  };

  const deleteSelectedColumns = () => {
    if (!activeSheet || !selectionBounds) return;
    updateSheet(activeSheet.id, (sheet) => {
      const remainingColumns = sheet.columns.filter((_, idx) => idx < selectionBounds.minCol || idx > selectionBounds.maxCol);
      const nextColumns = remainingColumns.length ? remainingColumns : [createDocSheetColumn('Column 1', 'text')];
      const keepColIds = new Set(nextColumns.map((col) => col.id));
      const nextRows = sheet.rows.map((row) => ({
        ...row,
        values: Object.fromEntries(nextColumns.map((col) => [col.id, String(row.values[col.id] ?? '')])),
      }));
      const keepRowIds = new Set(nextRows.map((row) => row.id));
      const nextFormats: Record<string, DocSheetCellFormat> = {};
      Object.entries(sheet.cellFormats || {}).forEach(([key, value]) => {
        const [rowId, colId] = key.split(':');
        if (!rowId || !colId) return;
        if (!keepRowIds.has(rowId)) return;
        if (!keepColIds.has(colId)) return;
        nextFormats[key] = value;
      });
      return { ...sheet, columns: nextColumns, rows: nextRows, cellFormats: nextFormats };
    });
    setStatusMessage('Columns deleted.');
  };

  const insertRowBelowSelection = () => {
    if (!activeSheet || !selectionFocus) return;
    const rowIndex = activeSheet.rows.findIndex((row) => row.id === selectionFocus.rowId);
    if (rowIndex < 0) return;
    updateSheet(activeSheet.id, (sheet) => {
      const nextRow = createDocSheetRow(sheet.columns);
      const nextRows = [...sheet.rows.slice(0, rowIndex + 1), nextRow, ...sheet.rows.slice(rowIndex + 1)];
      return { ...sheet, rows: nextRows };
    });
    setStatusMessage('Row inserted.');
  };

  const insertColumnRightOfSelection = () => {
    if (!activeSheet || !selectionFocus) return;
    const colIndex = activeSheet.columns.findIndex((col) => col.id === selectionFocus.columnId);
    if (colIndex < 0) return;
    updateSheet(activeSheet.id, (sheet) => {
      const nextColumn = createDocSheetColumn(`Column ${sheet.columns.length + 1}`, 'text');
      const nextColumns = [...sheet.columns.slice(0, colIndex + 1), nextColumn, ...sheet.columns.slice(colIndex + 1)];
      const nextRows = sheet.rows.map((row) => ({
        ...row,
        values: {
          ...row.values,
          [nextColumn.id]: '',
        },
      }));
      return { ...sheet, columns: nextColumns, rows: nextRows };
    });
    setStatusMessage('Column inserted.');
  };

  const duplicateActiveSheet = () => {
    if (!activeSheet) return;
    const nextSheet = duplicateDocSheetSheet(activeSheet);
    updateWorkbook((current) => ({
      ...current,
      sheets: [...current.sheets, nextSheet],
    }));
    setActiveSheetId(nextSheet.id);
    setStatusMessage('Sheet duplicated.');
  };

  const renameActiveSheet = () => {
    if (!activeSheet) return;
    const nextName = window.prompt('Rename sheet', activeSheet.name);
    if (!nextName || !nextName.trim()) return;
    updateSheet(activeSheet.id, (sheet) => ({ ...sheet, name: nextName.trim() }));
    setStatusMessage('Sheet renamed.');
  };

  const runFindReplace = (mode: 'find' | 'replace-one' | 'replace-all') => {
    if (!activeSheet) return;
    const needle = findText;
    if (!needle) return;
    const replacements: Array<{ rowId: string; columnId: string; nextValue: string }> = [];
    let found = false;
    const rows = activeSheet.rows;
    const columns = activeSheet.columns;
    outer: for (const row of rows) {
      for (const col of columns) {
        const raw = String(row.values[col.id] ?? '');
        if (!raw.includes(needle)) continue;
        found = true;
        if (mode === 'find') {
          setSelectedCell({ rowId: row.id, columnId: col.id });
          setSelectionAnchor({ rowId: row.id, columnId: col.id });
          setSelectionFocus({ rowId: row.id, columnId: col.id });
          setStudioPanel('none');
          setStatusMessage('Match found.');
          break outer;
        }
        if (mode === 'replace-one') {
          replacements.push({ rowId: row.id, columnId: col.id, nextValue: raw.replace(needle, replaceText) });
          break outer;
        }
        if (mode === 'replace-all') {
          replacements.push({ rowId: row.id, columnId: col.id, nextValue: raw.split(needle).join(replaceText) });
        }
      }
    }
    if (mode === 'find') {
      if (!found) setStatusMessage('No matches found.');
      return;
    }
    if (replacements.length) {
      updateSheet(activeSheet.id, (sheet) => ({
        ...sheet,
        rows: sheet.rows.map((row) => {
          const matches = replacements.filter((r) => r.rowId === row.id);
          if (!matches.length) return row;
          const nextValues = { ...row.values };
          matches.forEach((match) => {
            nextValues[match.columnId] = match.nextValue;
          });
          return { ...row, values: nextValues };
        }),
      }));
      setStatusMessage(mode === 'replace-all' ? `Replaced ${replacements.length} matches.` : 'Replaced one match.');
    } else {
      setStatusMessage('No matches found.');
    }
  };

  const updateCell = (rowId: string, columnId: string, value: string) => {
    if (!activeSheet) return;
    updateSheet(activeSheet.id, (sheet) => ({
      ...sheet,
      rows: sheet.rows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              values: {
                ...row.values,
                [columnId]: value,
              },
            }
          : row,
      ),
    }));
  };

  const updateCellFormatForRange = (patch: Partial<DocSheetCellFormat> | ((current: DocSheetCellFormat) => DocSheetCellFormat)) => {
    if (!activeSheet || !selectionBounds) return;
    updateSheet(activeSheet.id, (sheet) => {
      const formats = { ...(sheet.cellFormats || {}) };
      for (let r = selectionBounds.minRow; r <= selectionBounds.maxRow; r += 1) {
        const row = sheet.rows[r];
        if (!row) continue;
        for (let c = selectionBounds.minCol; c <= selectionBounds.maxCol; c += 1) {
          const col = sheet.columns[c];
          if (!col) continue;
          const key = getCellKey(row.id, col.id);
          const current = formats[key] || {};
          formats[key] = typeof patch === 'function' ? patch(current) : { ...current, ...patch };
        }
      }
      return { ...sheet, cellFormats: formats };
    });
  };

  const moveSelectionBy = (deltaRow: number, deltaCol: number, expand: boolean) => {
    if (!activeSheet) return;
    if (!selectionFocus) return;
    const rowIndexById = new Map(derivedRows.map((row, idx) => [row.id, idx]));
    const colIndexById = new Map(activeSheet.columns.map((col, idx) => [col.id, idx]));
    const currentRow = rowIndexById.get(selectionFocus.rowId) ?? 0;
    const currentCol = colIndexById.get(selectionFocus.columnId) ?? 0;
    const nextRowIndex = clamp(currentRow + deltaRow, 0, Math.max(0, derivedRows.length - 1));
    const nextColIndex = clamp(currentCol + deltaCol, 0, Math.max(0, activeSheet.columns.length - 1));
    const nextRow = derivedRows[nextRowIndex];
    const nextCol = activeSheet.columns[nextColIndex];
    if (!nextRow || !nextCol) return;

    setSelectedCell({ rowId: nextRow.id, columnId: nextCol.id });
    if (!expand || !selectionAnchor) {
      setSelectionAnchor({ rowId: nextRow.id, columnId: nextCol.id });
    }
    setSelectionFocus({ rowId: nextRow.id, columnId: nextCol.id });

    const key = getCellKey(nextRow.id, nextCol.id);
    const el = cellInputRefs.current[key];
    if (el) {
      el.focus();
      const len = el.value.length;
      try {
        el.setSelectionRange(len, len);
      } catch {
        // ignore
      }
    }
  };

  const handleUndo = () => {
    commitPendingUndo();
    const undo = undoStackRef.current[undoStackRef.current.length - 1];
    if (!undo) return;
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current.slice(-49), cloneWorkbook(workbook)];
    setWorkbook(undo);
    setStatusMessage('Undo applied.');
    setErrorMessage('');
  };

  const handleRedo = () => {
    commitPendingUndo();
    const redo = redoStackRef.current[redoStackRef.current.length - 1];
    if (!redo) return;
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current.slice(-49), cloneWorkbook(workbook)];
    setWorkbook(redo);
    setStatusMessage('Redo applied.');
    setErrorMessage('');
  };

  const copySelectionToClipboard = async () => {
    if (!activeSheet || !selectionBounds) return;
    const rows: string[] = [];
    for (let r = selectionBounds.minRow; r <= selectionBounds.maxRow; r += 1) {
      const row = activeSheet.rows[r];
      if (!row) continue;
      const cells: string[] = [];
      for (let c = selectionBounds.minCol; c <= selectionBounds.maxCol; c += 1) {
        const col = activeSheet.columns[c];
        if (!col) continue;
        cells.push(String(row.values[col.id] ?? ''));
      }
      rows.push(cells.join('\t'));
    }
    await navigator.clipboard.writeText(rows.join('\n'));
    setStatusMessage('Range copied.');
    setErrorMessage('');
  };

  const ensureSheetSizeForPaste = (sheet: DocSheetSheet, targetRowIndex: number, targetColIndex: number, rowCount: number, colCount: number) => {
    let nextSheet = sheet;
    const neededCols = targetColIndex + colCount;
    if (neededCols > nextSheet.columns.length) {
      const addCount = neededCols - nextSheet.columns.length;
      const newColumns = Array.from({ length: addCount }).map((_, idx) => createDocSheetColumn(`Column ${nextSheet.columns.length + idx + 1}`, 'text'));
      nextSheet = {
        ...nextSheet,
        columns: [...nextSheet.columns, ...newColumns],
        rows: nextSheet.rows.map((row) => ({
          ...row,
          values: {
            ...row.values,
            ...Object.fromEntries(newColumns.map((col) => [col.id, ''])),
          },
        })),
      };
    }
    const neededRows = targetRowIndex + rowCount;
    if (neededRows > nextSheet.rows.length) {
      const addCount = neededRows - nextSheet.rows.length;
      const newRows = Array.from({ length: addCount }).map(() => createDocSheetRow(nextSheet.columns));
      nextSheet = {
        ...nextSheet,
        rows: [...nextSheet.rows, ...newRows],
      };
    }
    return nextSheet;
  };

  const pasteClipboardIntoSheet = async () => {
    if (!activeSheet || !selectionFocus) return;
    const raw = await navigator.clipboard.readText().catch(() => '');
    if (!raw.trim()) return;
    const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const delimiter = raw.includes('\t') ? '\t' : ',';
    const cells = lines.map((line) => line.split(delimiter));
    const rowCount = cells.length;
    const colCount = Math.max(...cells.map((row) => row.length), 0);
    if (!rowCount || !colCount) return;

    const rowIndexById = new Map(activeSheet.rows.map((row, idx) => [row.id, idx]));
    const colIndexById = new Map(activeSheet.columns.map((col, idx) => [col.id, idx]));
    const startRow = rowIndexById.get(selectionFocus.rowId) ?? 0;
    const startCol = colIndexById.get(selectionFocus.columnId) ?? 0;

    updateSheet(activeSheet.id, (sheet) => {
      let nextSheet = ensureSheetSizeForPaste(sheet, startRow, startCol, rowCount, colCount);
      nextSheet = {
        ...nextSheet,
        rows: nextSheet.rows.map((row, rIndex) => {
          if (rIndex < startRow || rIndex >= startRow + rowCount) return row;
          const rowValues = cells[rIndex - startRow] || [];
          const updatedValues = { ...row.values };
          for (let c = 0; c < colCount; c += 1) {
            const col = nextSheet.columns[startCol + c];
            if (!col) continue;
            updatedValues[col.id] = String(rowValues[c] ?? '');
          }
          return { ...row, values: updatedValues };
        }),
      };
      return nextSheet;
    });

    setStatusMessage('Paste applied.');
    setErrorMessage('');
  };

  const fillDown = () => {
    if (!activeSheet || !selectionBounds) return;
    const startRow = selectionBounds.minRow;
    const endRow = selectionBounds.maxRow;
    if (endRow <= startRow) return;
    const cols = activeSheet.columns.slice(selectionBounds.minCol, selectionBounds.maxCol + 1);
    const rowIds = derivedRows.slice(startRow, endRow + 1).map((row) => row.id);
    if (!rowIds.length) return;

    updateSheet(activeSheet.id, (sheet) => {
      const rowById = new Map(sheet.rows.map((row) => [row.id, row]));
      const firstRow = rowById.get(rowIds[0]);
      const secondRow = rowById.get(rowIds[1]);
      if (!firstRow) return sheet;

      const nextRows = sheet.rows.map((row) => {
        const idx = rowIds.indexOf(row.id);
        if (idx <= 0) return row;
        const nextValues = { ...row.values };
        cols.forEach((col) => {
          const a = String(firstRow.values[col.id] ?? '');
          const b = secondRow ? String(secondRow.values[col.id] ?? '') : '';
          const an = Number(a.replace(/[^0-9.\-]/g, ''));
          const bn = Number(b.replace(/[^0-9.\-]/g, ''));
          if (Number.isFinite(an) && Number.isFinite(bn)) {
            const delta = bn - an;
            nextValues[col.id] = String(an + delta * idx);
          } else {
            nextValues[col.id] = a;
          }
        });
        return { ...row, values: nextValues };
      });
      return { ...sheet, rows: nextRows };
    });

    setStatusMessage('Filled down.');
  };

  const fillRight = () => {
    if (!activeSheet || !selectionBounds) return;
    const startCol = selectionBounds.minCol;
    const endCol = selectionBounds.maxCol;
    if (endCol <= startCol) return;
    const rows = derivedRows.slice(selectionBounds.minRow, selectionBounds.maxRow + 1);
    if (!rows.length) return;
    const colIds = activeSheet.columns.slice(startCol, endCol + 1).map((col) => col.id);

    updateSheet(activeSheet.id, (sheet) => {
      const colIndexById = new Map(sheet.columns.map((col, idx) => [col.id, idx]));
      const firstColId = colIds[0];
      const secondColId = colIds[1];
      if (!firstColId) return sheet;

      const nextRows = sheet.rows.map((row) => {
        const inRange = rows.some((r) => r.id === row.id);
        if (!inRange) return row;
        const nextValues = { ...row.values };
        for (let i = 1; i < colIds.length; i += 1) {
          const colId = colIds[i];
          const a = String(row.values[firstColId] ?? '');
          const b = secondColId ? String(row.values[secondColId] ?? '') : '';
          const an = Number(a.replace(/[^0-9.\-]/g, ''));
          const bn = Number(b.replace(/[^0-9.\-]/g, ''));
          if (Number.isFinite(an) && Number.isFinite(bn)) {
            const delta = bn - an;
            nextValues[colId] = String(an + delta * i);
          } else {
            nextValues[colId] = a;
          }
          if (!colIndexById.has(colId)) {
            // ignore
          }
        }
        return { ...row, values: nextValues };
      });
      return { ...sheet, rows: nextRows };
    });

    setStatusMessage('Filled right.');
  };

  const clearContentsForRange = () => {
    if (!activeSheet || !selectionBounds) return;
    const cols = activeSheet.columns.slice(selectionBounds.minCol, selectionBounds.maxCol + 1);
    const rowIds = derivedRows.slice(selectionBounds.minRow, selectionBounds.maxRow + 1).map((row) => row.id);
    if (!cols.length || !rowIds.length) return;
    updateSheet(activeSheet.id, (sheet) => ({
      ...sheet,
      rows: sheet.rows.map((row) => {
        if (!rowIds.includes(row.id)) return row;
        const nextValues = { ...row.values };
        cols.forEach((col) => {
          nextValues[col.id] = '';
        });
        return { ...row, values: nextValues };
      }),
    }));
    setStatusMessage('Cleared contents.');
  };

  const clearFormattingForRange = () => {
    if (!activeSheet || !selectionBounds) return;
    updateSheet(activeSheet.id, (sheet) => {
      const formats = { ...(sheet.cellFormats || {}) };
      const rows = derivedRows.slice(selectionBounds.minRow, selectionBounds.maxRow + 1);
      const cols = sheet.columns.slice(selectionBounds.minCol, selectionBounds.maxCol + 1);
      rows.forEach((row) => {
        cols.forEach((col) => {
          delete formats[getCellKey(row.id, col.id)];
        });
      });
      return { ...sheet, cellFormats: formats };
    });
    setStatusMessage('Cleared formatting.');
  };

  const applyAggregateFormulaToSelection = (fn: 'SUM' | 'AVERAGE' | 'MIN' | 'MAX' | 'COUNT') => {
    if (!activeSheet || !selectionBounds) return;
    const targetRowIndex = selectionBounds.maxRow + 1;
    const startRowIndex = selectionBounds.minRow + 1;
    const endRowIndex = selectionBounds.maxRow + 1;
    const cols = activeSheet.columns.slice(selectionBounds.minCol, selectionBounds.maxCol + 1);
    if (!cols.length) return;

    // Ensure a row exists for the result.
    if (targetRowIndex >= derivedRows.length) {
      addRow();
    }
    const targetRow = derivedRows[targetRowIndex] || derivedRows[derivedRows.length - 1];
    if (!targetRow) return;

    updateSheet(activeSheet.id, (sheet) => {
      const nextRows = sheet.rows.map((row) => {
        if (row.id !== targetRow.id) return row;
        const nextValues = { ...row.values };
        cols.forEach((col) => {
          const colIndex = sheet.columns.findIndex((c) => c.id === col.id);
          const letter = getDocSheetColumnLetter(colIndex);
          nextValues[col.id] = `=${fn}(${letter}${startRowIndex}:${letter}${endRowIndex})`;
        });
        return { ...row, values: nextValues };
      });
      return { ...sheet, rows: nextRows };
    });
    setStatusMessage(`${fn} formulas added below selection.`);
  };

  useEffect(() => {
    if (layout !== 'page') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isResizingColumn) return;
      if (!gridRootRef.current) return;
      const activeEl = document.activeElement;
      if (!activeEl || !gridRootRef.current.contains(activeEl)) return;
      if (activeEl instanceof HTMLInputElement && !activeEl.readOnly) {
        // Let the user edit normally; still allow global meta shortcuts below.
      } else if (activeEl instanceof HTMLTextAreaElement) {
        return;
      }

      const isMeta = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (isMeta && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }
      if (isMeta && key === 'y') {
        event.preventDefault();
        handleRedo();
        return;
      }
      if (isMeta && key === 'c') {
        event.preventDefault();
        void copySelectionToClipboard();
        return;
      }
      if (isMeta && key === 'v') {
        event.preventDefault();
        void pasteClipboardIntoSheet();
        return;
      }
      if (activeEl instanceof HTMLInputElement && !activeEl.readOnly) {
        // While editing, don't hijack navigation keys.
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveSelectionBy(-1, 0, event.shiftKey);
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveSelectionBy(1, 0, event.shiftKey);
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveSelectionBy(0, -1, event.shiftKey);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveSelectionBy(0, 1, event.shiftKey);
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        moveSelectionBy(1, 0, event.shiftKey);
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        moveSelectionBy(0, event.shiftKey ? -1 : 1, false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [copySelectionToClipboard, handleRedo, handleUndo, isResizingColumn, layout, moveSelectionBy, pasteClipboardIntoSheet]);

  /* ── Collab: auto-save workbook snapshot when workbook changes ── */
  useEffect(() => {
    if (!workbook) return;
    const snapshot = JSON.stringify(workbook);
    collabEngine.triggerAutoSave(snapshot);
    collabEngine.broadcastEdit(snapshot);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workbook.updatedAt]);

  /* ── Collab: apply remote workbook snapshot from peers ── */
  useEffect(() => {
    if (!collabEngine.remoteContent) return;
    try {
      const remoteWorkbook = JSON.parse(collabEngine.remoteContent) as typeof workbook;
      if (remoteWorkbook?.id && remoteWorkbook?.sheets) {
        setWorkbook(remoteWorkbook);
      }
    } catch { /* ignore non-workbook payloads */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collabEngine.remoteContent]);

  const updateSelectedCellRawValue = (value: string) => {
    if (!selectedCell) return;
    updateCell(selectedCell.rowId, selectedCell.columnId, value);
  };

  const updateColumnLabel = (columnId: string, value: string) => {
    if (!activeSheet) return;
    updateSheet(activeSheet.id, (sheet) => ({
      ...sheet,
      columns: sheet.columns.map((column) => (column.id === columnId ? { ...column, label: value } : column)),
    }));
  };

  const updateColumnType = (columnId: string, value: string) => {
    if (!activeSheet) return;
    const type = columnTypes.some((entry) => entry.value === value) ? (value as DocSheetColumnType) : 'text';
    updateSheet(activeSheet.id, (sheet) => ({
      ...sheet,
      columns: sheet.columns.map((column) => (column.id === columnId ? { ...column, type } : column)),
    }));
  };

  const startColumnResize = (columnId: string, clientX: number) => {
    if (!activeSheet) return;
    const startingWidth = activeSheet.columns.find((column) => column.id === columnId)?.width || 140;
    setIsResizingColumn(true);
    const startX = clientX;

    const handleMove = (event: MouseEvent) => {
      const delta = event.clientX - startX;
      const nextWidth = clamp(startingWidth + delta, 72, 520);
      updateSheet(activeSheet.id, (sheet) => ({
        ...sheet,
        columns: sheet.columns.map((column) => (column.id === columnId ? { ...column, width: nextWidth } : column)),
      }));
    };

    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      setIsResizingColumn(false);
      setStatusMessage('Column width updated.');
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  const setSortState = (columnId: string, direction: 'asc' | 'desc' | null) => {
    if (!activeSheet) return;
    updateSheet(activeSheet.id, (sheet) => {
      if (!direction) {
        return { ...sheet, sortState: null };
      }
      const dir = direction === 'desc' ? -1 : 1;
      const nextRows = [...sheet.rows].sort((a, b) => {
        const av = String(a.values[columnId] ?? '');
        const bv = String(b.values[columnId] ?? '');
        const an = Number(av.replace(/[^0-9.\-]/g, ''));
        const bn = Number(bv.replace(/[^0-9.\-]/g, ''));
        if (Number.isFinite(an) && Number.isFinite(bn)) return (an - bn) * dir;
        return av.localeCompare(bv) * dir;
      });
      return { ...sheet, rows: nextRows, sortState: { columnId, direction } };
    });
    setStatusMessage(direction ? 'Sort applied.' : 'Sort cleared.');
  };

  const applyColumnFilter = (columnId: string, op: 'contains' | 'equals' | 'gt' | 'lt' | 'gte' | 'lte', value: string) => {
    if (!activeSheet) return;
    updateSheet(activeSheet.id, (sheet) => ({
      ...sheet,
      filters: {
        ...(sheet.filters || {}),
        [columnId]: { op, value },
      },
    }));
    setStatusMessage('Filter applied.');
  };

  const clearColumnFilter = (columnId: string) => {
    if (!activeSheet) return;
    updateSheet(activeSheet.id, (sheet) => {
      const next = { ...(sheet.filters || {}) };
      delete next[columnId];
      return { ...sheet, filters: next };
    });
    setStatusMessage('Filter cleared.');
  };

  const toggleFreezeColumnA = () => {
    if (!activeSheet) return;
    const nextValue = activeSheet.frozenColumnCount === 1 ? 0 : 1;
    updateSheet(activeSheet.id, (sheet) => ({
      ...sheet,
      frozenColumnCount: nextValue,
    }));
    setStatusMessage(nextValue === 1 ? 'Froze column A.' : 'Unfroze column A.');
  };

  const addConditionalRule = (rule: NonNullable<DocSheetSheet['conditionalRules']>[number]) => {
    if (!activeSheet) return;
    updateSheet(activeSheet.id, (sheet) => ({
      ...sheet,
      conditionalRules: [...(sheet.conditionalRules || []), rule],
    }));
    setStatusMessage('Conditional rule added.');
  };

  const deleteConditionalRule = (ruleId: string) => {
    if (!activeSheet) return;
    updateSheet(activeSheet.id, (sheet) => ({
      ...sheet,
      conditionalRules: (sheet.conditionalRules || []).filter((rule) => rule.id !== ruleId),
    }));
    setStatusMessage('Rule removed.');
  };

  const addCommentToSelectedCell = (text: string) => {
    if (!activeSheet || !selectedCell) return;
    const key = getCellKey(selectedCell.rowId, selectedCell.columnId);
    const entry = { id: `docsheet-comment-${Date.now()}`, text, createdAt: new Date().toISOString() };
    updateSheet(activeSheet.id, (sheet) => ({
      ...sheet,
      cellComments: {
        ...(sheet.cellComments || {}),
        [key]: [...((sheet.cellComments || {})[key] || []), entry],
      },
    }));
    setStatusMessage('Comment added.');
  };

  const loadWorkbook = (entry: DocumentHistory) => {
    const raw = entry.docsheetWorkbook
      || (entry.data?.docsheetWorkbook ? JSON.parse(entry.data.docsheetWorkbook) : null);
    const normalized = normalizeDocSheetWorkbook(raw);
    setWorkbook(normalized);
    setActiveSheetId(normalized.sheets[0]?.id || '');
    setSavedHistoryId(entry.id);
    undoStackRef.current = [];
    redoStackRef.current = [];
    pendingUndoSnapshotRef.current = null;
    setStatusMessage(`Loaded ${entry.templateName}.`);
    setErrorMessage('');
    setActiveTab('editor');
    setDocsheetShareMode(entry.docsheetShareMode || 'view');
    setShareAccessPolicy(entry.shareAccessPolicy || 'standard');
    setShareRequiresPassword(entry.shareRequiresPassword !== false);
    setSharePassword(entry.sharePassword || '');
    setShareMaxAccessCount(String(entry.maxAccessCount || 1));
    let nextExpiryDays = '7';
    if (entry.shareAccessPolicy === 'expiring' && entry.shareExpiresAt) {
      nextExpiryDays = String(
        Math.max(
          1,
          Math.ceil((new Date(entry.shareExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
        ),
      );
    }
    setDocsheetExpiryDays(nextExpiryDays);
    setDocsheetSharedWithEmail(entry.docsheetSharedWithEmail || '');
    setDocsheetSessionLabel(entry.sharedSessionLabel || '');
  };

  const deleteWorkbook = async (id: string) => {
    try {
      setDeletingId(id);
      setErrorMessage('');
      setStatusMessage('');
      const response = await fetch(`/api/history?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to delete workbook.');
      }
      if (savedHistoryId === id) {
        createNewWorkbook();
      }
      await onHistoryRefresh();
      setStatusMessage('Workbook removed successfully.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to delete workbook.');
    } finally {
      setDeletingId('');
    }
  };

  const updateShareSettings = async () => {
    if (!savedHistoryId) {
      await saveWorkbook();
      return;
    }
    try {
      setSaving(true);
      setErrorMessage('');
      setStatusMessage('');

      const expiresAt = shareAccessPolicy === 'expiring'
        ? (() => {
            const days = Number(docsheetExpiryDays);
            if (!Number.isFinite(days) || days <= 0) return undefined;
            return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
          })()
        : undefined;
      const maxCount = shareAccessPolicy === 'one_time'
        ? Math.max(1, Number(shareMaxAccessCount) || 1)
        : undefined;

      const response = await fetch('/api/history', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: savedHistoryId,
          docsheetShareMode,
          docsheetSharedWithEmail: docsheetSharedWithEmail.trim() || undefined,
          sharedSessionLabel: docsheetSessionLabel.trim() || undefined,
          recipientAccess: docsheetShareMode === 'edit' ? 'edit' : 'view',
          shareAccessPolicy,
          shareExpiresAt: expiresAt,
          maxAccessCount: maxCount,
          shareRequiresPassword,
          sharePassword: shareRequiresPassword ? (sharePassword.trim().toUpperCase() || undefined) : undefined,
          docsheetSessionStatus: 'active',
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to update share settings.');
      }
      if (payload?.shareAccessPolicy) setShareAccessPolicy(payload.shareAccessPolicy);
      if (payload?.shareRequiresPassword !== undefined) setShareRequiresPassword(payload.shareRequiresPassword !== false);
      if (typeof payload?.sharePassword === 'string') setSharePassword(payload.sharePassword);
      if (typeof payload?.maxAccessCount === 'number') setShareMaxAccessCount(String(payload.maxAccessCount));
      if (typeof payload?.shareExpiresAt === 'string' && payload?.shareAccessPolicy === 'expiring') {
        const days = Math.max(1, Math.ceil((new Date(payload.shareExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
        setDocsheetExpiryDays(String(days));
      }
      await onHistoryRefresh();
      setStatusMessage('Share settings updated.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update share settings.');
    } finally {
      setSaving(false);
    }
  };

  const revokeShareLink = async () => {
    if (!savedHistoryId) return;
    if (!confirm('Revoke this shared link? Recipients will no longer be able to open it.')) return;
    try {
      setSaving(true);
      setErrorMessage('');
      setStatusMessage('');
      const response = await fetch('/api/history', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: savedHistoryId,
          revokedAt: new Date().toISOString(),
          docsheetSessionStatus: 'revoked',
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to revoke this link.');
      }
      await onHistoryRefresh();
      setStatusMessage('Shared link revoked.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to revoke this link.');
    } finally {
      setSaving(false);
    }
  };

  const saveWorkbook = async () => {
    try {
      setSaving(true);
      setErrorMessage('');
      setStatusMessage('');
      saveStartedAtRef.current = Date.now();
      const payload = {
        id: savedHistoryId || undefined,
        templateId: 'docsheet-workbook',
        templateName: workbook.title.trim() || 'DocSheet Workbook',
        category: 'DocSheet',
        documentSourceType: 'generated' as const,
        data: {
          docsheetWorkbook: JSON.stringify(workbook),
          activeSheetName: activeSheet?.name || '',
          rowCount: String(activeSummary?.rowCount || 0),
          columnCount: String(activeSummary?.columnCount || 0),
          docsheetShareMode,
          docsheetSharedWithEmail,
          sharedSessionLabel: docsheetSessionLabel,
        },
        previewHtml: buildDocSheetPreviewHtml(workbook),
        editorState: {
          title: workbook.title.trim() || 'DocSheet Workbook',
          internalSummary: workbook.description || 'DocSheet workbook stored inside the governed workspace.',
          tags: ['docsheet', 'spreadsheet'],
        },
        docsheetWorkbook: workbook,
        docsheetShareMode,
        docsheetSharedWithEmail: docsheetSharedWithEmail.trim() || undefined,
        sharedSessionLabel: docsheetSessionLabel.trim() || undefined,
        recipientAccess: docsheetShareMode === 'edit' ? 'edit' : 'view',
        shareAccessPolicy,
        shareExpiresAt: shareAccessPolicy === 'expiring'
          ? (() => {
              const days = Number(docsheetExpiryDays);
              if (!Number.isFinite(days) || days <= 0) return undefined;
              return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
            })()
          : undefined,
        maxAccessCount: shareAccessPolicy === 'one_time' ? Math.max(1, Number(shareMaxAccessCount) || 1) : undefined,
        shareRequiresPassword,
        sharePassword: shareRequiresPassword ? (sharePassword.trim().toUpperCase() || undefined) : undefined,
        docsheetSessionStatus: 'active' as const,
      };

      const response = await fetch('/api/history', {
        method: savedHistoryId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const saved = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(saved?.error || 'Unable to save workbook.');
      }
      setSavedHistoryId(saved.id);
      if (saved?.shareAccessPolicy) setShareAccessPolicy(saved.shareAccessPolicy);
      if (saved?.shareRequiresPassword !== undefined) setShareRequiresPassword(saved.shareRequiresPassword !== false);
      if (typeof saved?.sharePassword === 'string') setSharePassword(saved.sharePassword);
      if (typeof saved?.maxAccessCount === 'number') setShareMaxAccessCount(String(saved.maxAccessCount));
      if (typeof saved?.shareExpiresAt === 'string' && saved?.shareAccessPolicy === 'expiring') {
        const days = Math.max(1, Math.ceil((new Date(saved.shareExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
        setDocsheetExpiryDays(String(days));
      }
      await onHistoryRefresh();
      setStatusMessage(savedHistoryId ? 'DocSheet workbook updated.' : 'DocSheet workbook saved.');
      // Clear dirty state only if nothing changed during this save attempt.
      if (lastChangeAtRef.current <= saveStartedAtRef.current) {
        setIsDirty(false);
        setAutosaveCountdownMs(null);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save workbook.');
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = async () => {
    if (!activeSheet) return;
    const csv = exportDocSheetToCsv(activeSheet);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${(workbook.title || 'docsheet').replace(/\s+/g, '-').toLowerCase()}-${activeSheet.name.replace(/\s+/g, '-').toLowerCase()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const copyVisualizerPayload = async () => {
    if (!activeSheet) return;
    const payload = buildDocSheetVisualizationInput(workbook, activeSheet.id);
    await navigator.clipboard.writeText(payload);
    setStatusMessage('Spreadsheet extract copied. Paste it into Visualizer AI for charting.');
    setErrorMessage('');
  };

  const shareUrl = savedRecord?.shareUrl
    ? buildAbsoluteAppUrl(savedRecord.shareUrl, typeof window !== 'undefined' ? window.location.origin : undefined)
    : '';
  const sheetVisualizationInput = useMemo(
    () => (activeSheet ? buildDocSheetVisualizationInput(workbook, activeSheet.id) : ''),
    [activeSheet, workbook],
  );
  const liveVisualizerTable = useMemo(
    () => (activeSheet ? buildVisualizerTableFromDocSheetSheet(activeSheet) : null),
    [activeSheet],
  );
  const activeVisualization = useMemo(() => {
    if (!visualResult) return null;
    const stats = selectedStats.length ? selectedStats : visualResult.defaultSelectedStats;
    return buildInteractiveVisualization(activeSheet?.name || workbook.title || 'DocSheet workbook', sheetVisualizationInput, liveVisualizerTable || visualResult.table, stats);
  }, [activeSheet?.name, liveVisualizerTable, selectedStats, sheetVisualizationInput, visualResult, workbook.title]);

  const importWorkbook = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setImporting(true);
      setErrorMessage('');
      setStatusMessage('');
      const imported = await parseSpreadsheetFileToWorkbook(file);
      setWorkbook(imported);
      setActiveSheetId(imported.sheets[0]?.id || '');
      setSavedHistoryId('');
      undoStackRef.current = [];
      redoStackRef.current = [];
      pendingUndoSnapshotRef.current = null;
      setVisualResult(null);
      setSelectedStats([]);
      setStatusMessage(`${file.name} imported into DocSheet Studio. You can now edit it, re-chart it, and download the updated workbook.`);
      setActiveTab('editor');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to import this spreadsheet file.');
    } finally {
      setImporting(false);
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const exportWorkbookXlsx = async () => {
    try {
      const blob = await exportDocSheetWorkbookToXlsx(workbook);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${(workbook.title || 'docsheet-workbook').replace(/\s+/g, '-').toLowerCase()}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatusMessage('Workbook downloaded as an editable .xlsx file.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to export workbook.');
    }
  };

  const applyTemplate = (templateId: string) => {
    const nextWorkbook = createDocSheetWorkbookFromTemplate(templateId);
    setWorkbook(nextWorkbook);
    setActiveSheetId(nextWorkbook.sheets[0]?.id || '');
    setSavedHistoryId('');
    undoStackRef.current = [];
    redoStackRef.current = [];
    pendingUndoSnapshotRef.current = null;
    setVisualResult(null);
    setSelectedStats([]);
    setStatusMessage('Smart sheet template loaded into DocSheet Studio. You can edit it, save it, or chart it immediately.');
    setErrorMessage('');
    setActiveTab('editor');
  };

  const applyFormulaPack = (formulaPackId: string) => {
    if (!activeSheet) return;
    const nextSheet = applyDocSheetFormulaPack(activeSheet, formulaPackId);
    if (nextSheet === activeSheet) {
      setErrorMessage('This formula pack needs matching columns in the current sheet before it can be applied.');
      return;
    }
    updateSheet(activeSheet.id, () => nextSheet);
    setStatusMessage('Smart formulas were added to the current sheet. Review the new columns and save when ready.');
    setErrorMessage('');
    setActiveTab('editor');
  };

  const runDocSheetAi = async (overrideInstruction?: string) => {
    const instruction = typeof overrideInstruction === 'string' ? overrideInstruction.trim() : aiInstruction.trim();
    if (!instruction) {
      setErrorMessage('Tell DocSheet AI what to create or change in the workbook.');
      return;
    }

    try {
      setAiBusy(true);
      setErrorMessage('');
      setStatusMessage('');
      const response = await fetch('/api/ai/docsheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction,
          workbook,
          activeSheetId,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to process DocSheet AI request.');
      }

      const normalized = normalizeDocSheetWorkbook(payload.workbook);
      setWorkbook(normalized);
      setActiveSheetId(normalized.sheets[0]?.id || '');
      setAiSummary(payload.summary || 'DocSheet AI updated the workbook.');
      setAiNextSteps(Array.isArray(payload.suggestedNextSteps) ? payload.suggestedNextSteps : []);
      setStatusMessage('DocSheet AI applied your requested changes. Review the editor or save the workbook when ready.');
      setActiveTab('editor');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to process DocSheet AI request.');
    } finally {
      setAiBusy(false);
    }
  };

  const runVisualization = async () => {
    if (!sheetVisualizationInput.trim()) {
      setVisualError('Add spreadsheet data first before running DocSheet insights.');
      return;
    }
    try {
      setVisualLoading(true);
      setVisualError('');
      const response = await fetch('/api/ai/document-visualizer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${workbook.title} - ${activeSheet?.name || 'Sheet'}`,
          content: sheetVisualizationInput,
          sourceType: 'paste',
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to analyze this sheet.');
      }
      setVisualResult(payload);
      setSelectedStats(payload.defaultSelectedStats || []);
      setVisualMessage('DocSheet insights refreshed from the current saved grid.');
    } catch (error) {
      setVisualError(error instanceof Error ? error.message : 'Unable to analyze this sheet.');
    } finally {
      setVisualLoading(false);
    }
  };

  const askDocSheet = async () => {
    if (!activeSheet) {
      setErrorMessage('Load a sheet first before asking questions.');
      return;
    }
    const question = docsheetAskInput.trim();
    if (!question) return;

    const userMsg = { id: `ask-${Date.now()}-u`, role: 'user' as const, text: question };
    setDocsheetAskMessages((current) => [...current, userMsg]);
    setDocsheetAskInput('');

    try {
      setDocsheetAskBusy(true);
      const response = await fetch('/api/ai/docsheet/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          workbook,
          activeSheetId,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to answer from this sheet right now.');
      }
      const answer = typeof payload?.answer === 'string' ? payload.answer : '';
      const confidence = typeof payload?.confidence === 'number' ? payload.confidence : null;
      const suggested = Array.isArray(payload?.suggestedActions) ? payload.suggestedActions : [];
      const metaBits: string[] = [];
      if (confidence !== null) metaBits.push(`Confidence ${(confidence * 100).toFixed(0)}%`);
      if (suggested.length) metaBits.push(`Suggestions: ${suggested.slice(0, 3).join(' · ')}`);
      const assistantMsg = {
        id: `ask-${Date.now()}-a`,
        role: 'assistant' as const,
        text: answer || 'I could not confidently answer from the sheet extract.',
        meta: metaBits.join(' · '),
        actionInstruction: question,
      };
      setDocsheetAskMessages((current) => [...current, assistantMsg]);
    } catch (error) {
      setDocsheetAskMessages((current) => [
        ...current,
        { id: `ask-${Date.now()}-e`, role: 'assistant', text: error instanceof Error ? error.message : 'Unable to answer right now.', actionInstruction: question },
      ]);
    } finally {
      setDocsheetAskBusy(false);
    }
  };

  const toggleStat = (statId: VisualizerStatKey) => {
    setSelectedStats((current) => current.includes(statId) ? current.filter((item) => item !== statId) : [...current, statId]);
  };

  const pageShellClassName = layout === 'page'
    ? 'space-y-6 pb-10'
    : 'space-y-6';
  const gridShellClassName = layout === 'page'
    ? 'grid gap-6 2xl:grid-cols-[1.45fr_0.8fr]'
    : 'grid gap-6 xl:grid-cols-[1.35fr_0.65fr]';

  if (layout === 'page') {
    const closePanel = () => setStudioPanel('none');
    const openPanel = (panel: DocSheetStudioPanel) => setStudioPanel((current) => (current === panel ? 'none' : panel));
    const selectedFormat: DocSheetCellFormat = activeSheet && selectedCell
      ? (activeSheet.cellFormats?.[getCellKey(selectedCell.rowId, selectedCell.columnId)] || {})
      : {};
    const hasSelection = Boolean(activeSheet && selectionBounds);
    const applyAlign = (align: DocSheetCellAlign) => updateCellFormatForRange({ align });
    const toggleFormatFlag = (flag: keyof Pick<DocSheetCellFormat, 'bold' | 'italic' | 'underline'>) => {
      if (!hasSelection) return;
      const next = !selectedFormat?.[flag];
      updateCellFormatForRange((current) => ({ ...current, [flag]: next }));
    };
    const runMenuAction = (action: () => void) => {
      action();
      setTopMenuOpen(null);
      setMenuAnchorPos(null);
    };

    return (
      <div className="min-h-screen flex flex-col ds-page-root" data-docsheet-theme={theme} style={{ background: theme === 'dark' ? '#08090a' : '#f5f6f8' }}>
        <style>{`
          /* ── Theme tokens (CSS variables) ──────────────────────────────── */
          .ds-page-root[data-docsheet-theme="dark"] {
            --ds-c1: rgba(255,255,255,0.88); --ds-c2: rgba(255,255,255,0.72);
            --ds-c3: rgba(255,255,255,0.52); --ds-c4: rgba(255,255,255,0.38);
            --ds-c5: rgba(255,255,255,0.25);
            --ds-s1: rgba(255,255,255,0.09); --ds-s2: rgba(255,255,255,0.07);
            --ds-s3: rgba(255,255,255,0.05); --ds-s4: rgba(255,255,255,0.03);
            --ds-bg: rgba(8,9,10,0.97);
            --ds-grid: #08090a; --ds-cell: #0d0e11; --ds-th: #131417;
          }
          .ds-page-root[data-docsheet-theme="light"] {
            --ds-c1: rgba(0,0,0,0.85);  --ds-c2: rgba(0,0,0,0.68);
            --ds-c3: rgba(0,0,0,0.50);  --ds-c4: rgba(0,0,0,0.38);
            --ds-c5: rgba(0,0,0,0.25);
            --ds-s1: rgba(0,0,0,0.10);  --ds-s2: rgba(0,0,0,0.07);
            --ds-s3: rgba(0,0,0,0.04);  --ds-s4: rgba(0,0,0,0.02);
            --ds-bg: #ffffff;
            --ds-grid: #f5f6f8; --ds-cell: #ffffff; --ds-th: #f0f2f5;
          }

          /* ── DocSheet theme system ───────────────────────────────────────── */

          /* ─ Shadcn Radix Select dropdown ─ */
          [data-docsheet-theme="dark"] [data-radix-popper-content-wrapper] [role="listbox"],
          [data-docsheet-theme="dark"] [data-radix-popper-content-wrapper] [data-radix-select-content] {
            background: rgba(10,11,14,0.99) !important;
            border: 1px solid rgba(255,255,255,0.10) !important;
            color: rgba(255,255,255,0.82) !important;
            box-shadow: 0 16px 40px rgba(0,0,0,0.65) !important;
          }
          [data-docsheet-theme="light"] [data-radix-popper-content-wrapper] [role="listbox"],
          [data-docsheet-theme="light"] [data-radix-popper-content-wrapper] [data-radix-select-content] {
            background: #ffffff !important;
            border: 1px solid rgba(0,0,0,0.09) !important;
            color: rgba(0,0,0,0.82) !important;
            box-shadow: 0 12px 32px rgba(0,0,0,0.12) !important;
          }
          [data-docsheet-theme="dark"] [data-radix-popper-content-wrapper] [role="option"]:hover,
          [data-docsheet-theme="dark"] [data-radix-popper-content-wrapper] [data-highlighted] {
            background: rgba(255,255,255,0.08) !important; color: rgba(255,255,255,0.95) !important;
          }
          [data-docsheet-theme="light"] [data-radix-popper-content-wrapper] [role="option"]:hover,
          [data-docsheet-theme="light"] [data-radix-popper-content-wrapper] [data-highlighted] {
            background: rgba(0,0,0,0.05) !important; color: rgba(0,0,0,0.90) !important;
          }

          /* ─ Radix Tabs ─ */
          [data-docsheet-theme="dark"] [data-radix-tabs-trigger] { color: rgba(255,255,255,0.52) !important; }
          [data-docsheet-theme="dark"] [data-radix-tabs-trigger][data-state="active"] {
            background: rgba(255,255,255,0.10) !important; color: rgba(255,255,255,0.92) !important;
          }
          [data-docsheet-theme="light"] [data-radix-tabs-trigger] { color: rgba(0,0,0,0.55) !important; }
          [data-docsheet-theme="light"] [data-radix-tabs-trigger][data-state="active"] {
            background: rgba(0,0,0,0.08) !important; color: rgba(0,0,0,0.88) !important;
          }

          /* ─ Dialog text ─ */
          [data-docsheet-theme="dark"] [data-radix-dialog-content] h2 { color: rgba(255,255,255,0.92) !important; }
          [data-docsheet-theme="dark"] [data-radix-dialog-content] p   { color: rgba(255,255,255,0.52) !important; }
          [data-docsheet-theme="light"] [data-radix-dialog-content] h2 { color: rgba(0,0,0,0.88) !important; }
          [data-docsheet-theme="light"] [data-radix-dialog-content] p  { color: rgba(0,0,0,0.55) !important; }

          /* ─ Grid row hover ─ */
          [data-docsheet-theme="dark"]  .ds-row:hover td { background: rgba(255,255,255,0.022) !important; }
          [data-docsheet-theme="light"] .ds-row:hover td { background: rgba(0,0,0,0.020) !important; }

          /* ─ Scrollbars ─ */
          .ds-grid-scroll::-webkit-scrollbar { width: 7px; height: 7px; }
          [data-docsheet-theme="dark"] .ds-grid-scroll::-webkit-scrollbar-track { background: rgba(255,255,255,0.03); }
          [data-docsheet-theme="dark"] .ds-grid-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 4px; }
          [data-docsheet-theme="dark"] .ds-grid-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.22); }
          [data-docsheet-theme="light"] .ds-grid-scroll::-webkit-scrollbar-track { background: rgba(0,0,0,0.04); }
          [data-docsheet-theme="light"] .ds-grid-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.16); border-radius: 4px; }
          [data-docsheet-theme="light"] .ds-grid-scroll::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.28); }

          /* ─ Light theme structural overrides (beat inline styles) ─ */
          [data-docsheet-theme="light"] .ds-header       { background: rgba(255,255,255,0.97) !important; border-color: rgba(0,0,0,0.07) !important; box-shadow: 0 1px 0 rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.06) !important; }
          [data-docsheet-theme="light"] .ds-panel-side   { background: rgba(255,255,255,0.98) !important; border-color: rgba(0,0,0,0.07) !important; }
          [data-docsheet-theme="light"] .ds-tabs-bar     { background: rgba(255,255,255,0.97) !important; border-color: rgba(0,0,0,0.07) !important; }
          [data-docsheet-theme="light"] .ds-menu-drop    { background: rgba(255,255,255,0.99) !important; border-color: rgba(0,0,0,0.08) !important; box-shadow: 0 12px 32px rgba(0,0,0,0.10) !important; }
          [data-docsheet-theme="light"] .ds-ctx-menu     { background: rgba(255,255,255,0.99) !important; border-color: rgba(0,0,0,0.08) !important; box-shadow: 0 16px 40px rgba(0,0,0,0.12) !important; }
          [data-docsheet-theme="light"] .ds-grid-wrap    { background: #ffffff !important; border-color: rgba(0,0,0,0.08) !important; }
          [data-docsheet-theme="light"] thead th          { background: #f0f2f5 !important; color: rgba(0,0,0,0.60) !important; border-color: rgba(0,0,0,0.08) !important; }
          [data-docsheet-theme="light"] tbody td          { background: #ffffff !important; border-color: rgba(0,0,0,0.07) !important; }
          [data-docsheet-theme="light"] tbody td input    { color: rgba(0,0,0,0.85) !important; }
          [data-docsheet-theme="light"] .ds-menu-item    { color: rgba(0,0,0,0.72) !important; }
          [data-docsheet-theme="light"] .ds-menu-item:hover { background: rgba(0,0,0,0.05) !important; }
          [data-docsheet-theme="light"] .ds-menu-label   { color: rgba(0,0,0,0.40) !important; }
          [data-docsheet-theme="light"] .ds-separator     { background: rgba(0,0,0,0.08) !important; }
          [data-docsheet-theme="light"] .ds-card          { background: rgba(0,0,0,0.02) !important; border-color: rgba(0,0,0,0.07) !important; }
          [data-docsheet-theme="light"] .ds-input         { background: rgba(0,0,0,0.03) !important; border-color: rgba(0,0,0,0.10) !important; color: rgba(0,0,0,0.85) !important; }
          [data-docsheet-theme="light"] .ds-btn-ghost     { color: rgba(0,0,0,0.60) !important; }
          [data-docsheet-theme="light"] .ds-btn-ghost:hover { background: rgba(0,0,0,0.06) !important; }
          [data-docsheet-theme="light"] .ds-text-primary  { color: rgba(0,0,0,0.88) !important; }
          [data-docsheet-theme="light"] .ds-text-secondary{ color: rgba(0,0,0,0.55) !important; }
          [data-docsheet-theme="light"] .ds-text-muted    { color: rgba(0,0,0,0.40) !important; }
          [data-docsheet-theme="light"] .ds-cell-sel      { background: rgba(16,185,129,0.12) !important; }
          [data-docsheet-theme="light"] .ds-tab-active    { background: rgba(5,150,105,0.12) !important; border-color: rgba(5,150,105,0.30) !important; color: #059669 !important; }
          [data-docsheet-theme="light"] .ds-tab-inactive  { background: rgba(0,0,0,0.04) !important; border-color: rgba(0,0,0,0.08) !important; color: rgba(0,0,0,0.58) !important; }
          [data-docsheet-theme="light"] .ds-save-btn      { background: rgba(5,150,105,0.12) !important; border-color: rgba(5,150,105,0.28) !important; color: #059669 !important; }
          [data-docsheet-theme="light"] .ds-share-btn     { background: rgba(59,130,246,0.12) !important; border-color: rgba(59,130,246,0.28) !important; color: #2563eb !important; }
          [data-docsheet-theme="light"] .ds-ctx-hdr       { background: rgba(0,0,0,0.04) !important; color: rgba(0,0,0,0.45) !important; border-color: rgba(0,0,0,0.08) !important; }
          [data-docsheet-theme="light"] .ds-row-num       { background: #f0f2f5 !important; color: rgba(0,0,0,0.38) !important; border-color: rgba(0,0,0,0.08) !important; }
          [data-docsheet-theme="light"] .ds-fx-badge      { background: rgba(0,0,0,0.06) !important; color: rgba(0,0,0,0.55) !important; }
          [data-docsheet-theme="light"] .ds-toolbar-divider { background: rgba(0,0,0,0.10) !important; }
          [data-docsheet-theme="light"] .ds-cell-ref-box  { background: rgba(0,0,0,0.04) !important; border-color: rgba(0,0,0,0.09) !important; color: rgba(0,0,0,0.68) !important; }
          [data-docsheet-theme="light"] .ds-ai-float      { background: rgba(255,255,255,0.98) !important; border-color: rgba(0,0,0,0.09) !important; box-shadow: 0 20px 48px rgba(0,0,0,0.14) !important; }
          [data-docsheet-theme="light"] .ds-ai-float-fab  { background: #059669 !important; box-shadow: 0 4px 20px rgba(5,150,105,0.35) !important; }
          [data-docsheet-theme="light"] .ds-ai-float * { color: inherit; }
          [data-docsheet-theme="light"] .ds-ai-float .ds-ai-hdr-title { color: rgba(0,0,0,0.85) !important; }
          [data-docsheet-theme="light"] .ds-ai-float .ds-ai-msg { color: rgba(0,0,0,0.78) !important; }
          [data-docsheet-theme="light"] .ds-ai-float textarea { background: rgba(0,0,0,0.03) !important; border-color: rgba(0,0,0,0.10) !important; color: rgba(0,0,0,0.80) !important; }
          [data-docsheet-theme="light"] .ds-ai-float textarea::placeholder { color: rgba(0,0,0,0.35) !important; }
          /* Toolbar in light */
          [data-docsheet-theme="light"] .ds-toolbar-scroll { background: rgba(255,255,255,0.95) !important; border-color: rgba(0,0,0,0.07) !important; }
          [data-docsheet-theme="light"] .ds-toolbar-scroll button { color: rgba(0,0,0,0.65) !important; }
          [data-docsheet-theme="light"] .ds-toolbar-scroll button:hover { background: rgba(0,0,0,0.06) !important; }
          /* Formula bar in light */
          [data-docsheet-theme="light"] .ds-formula-bar { border-color: rgba(0,0,0,0.08) !important; }
          [data-docsheet-theme="light"] .ds-formula-bar input { color: rgba(0,0,0,0.85) !important; background: transparent !important; }
          /* Menu bar in light */
          [data-docsheet-theme="light"] .ds-menu-bar { border-color: rgba(0,0,0,0.08) !important; }
          [data-docsheet-theme="light"] .ds-menu-bar button { color: rgba(0,0,0,0.62) !important; }
          [data-docsheet-theme="light"] .ds-menu-bar button:hover { background: rgba(0,0,0,0.06) !important; color: rgba(0,0,0,0.85) !important; }
          [data-docsheet-theme="light"] .ds-menu-bar button[style*="rgba(255,255,255,0.09)"] { background: rgba(0,0,0,0.06) !important; color: rgba(0,0,0,0.88) !important; }
          /* AI quick-access btn keeps emerald in light */
          [data-docsheet-theme="light"] .ds-menu-bar button[style*="#34d399"] { color: #059669 !important; background: rgba(5,150,105,0.10) !important; border-color: rgba(5,150,105,0.22) !important; }
          /* Header input in light mode */
          [data-docsheet-theme="light"] .ds-header input { color: rgba(0,0,0,0.85) !important; background: rgba(0,0,0,0.03) !important; border-color: rgba(0,0,0,0.09) !important; }
          [data-docsheet-theme="light"] .ds-header input::placeholder { color: rgba(0,0,0,0.35) !important; }
          /* Sheet tabs in light */
          [data-docsheet-theme="light"] .ds-tabs-bar button { color: rgba(0,0,0,0.58) !important; }
          /* Number format select trigger in light */
          [data-docsheet-theme="light"] [data-radix-select-trigger] { background: rgba(0,0,0,0.03) !important; border-color: rgba(0,0,0,0.10) !important; color: rgba(0,0,0,0.72) !important; }
          /* Add Column/Row buttons in light */
          [data-docsheet-theme="light"] .ds-toolbar-scroll [class*="rounded-lg"][class*="px-2"] { background: rgba(0,0,0,0.03) !important; border-color: rgba(0,0,0,0.10) !important; color: rgba(0,0,0,0.65) !important; }
          /* Insights/AI icons row in light */
          [data-docsheet-theme="light"] .ds-btn-ghost svg { opacity: 0.65; }

          /* ─ FAB pulse ring ─ */
          @keyframes ds-fab-pulse {
            0%   { box-shadow: 0 0 0 0 rgba(16,185,129,0.45), 0 4px 22px rgba(16,185,129,0.42); }
            70%  { box-shadow: 0 0 0 10px rgba(16,185,129,0), 0 4px 22px rgba(16,185,129,0.42); }
            100% { box-shadow: 0 0 0 0 rgba(16,185,129,0), 0 4px 22px rgba(16,185,129,0.42); }
          }
          .ds-ai-float-fab:not([data-open]) { animation: ds-fab-pulse 2.4s ease-out infinite; }
          /* ─ AI float panel slide-in ─ */
          @keyframes ds-float-in {
            from { opacity: 0; transform: translateY(12px) scale(0.97); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
          }
          .ds-ai-float { animation: ds-float-in 0.18s ease-out; }
          /* ─ Mobile responsive ─ */
          @media (max-width: 640px) {
            .ds-toolbar-scroll  { overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
            .ds-toolbar-scroll::-webkit-scrollbar { display: none; }
            .ds-menu-bar        { overflow-x: auto; scrollbar-width: none; }
            .ds-menu-bar::-webkit-scrollbar { display: none; }
            .ds-formula-bar     { flex-wrap: wrap; }
            .ds-formula-functions { display: none !important; }
            .ds-header-actions  { gap: 6px; }
          }
        `}</style>
        <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
          <DialogContent className="max-w-xl rounded-2xl border bg-[var(--ds-bg)] backdrop-blur-xl" style={{ borderColor: 'var(--ds-s1)', color: 'var(--ds-c1)' }}>
            <DialogHeader>
              <DialogTitle>DocSheet keyboard shortcuts</DialogTitle>
              <DialogDescription>Fast navigation and editing, Sheets-style.</DialogDescription>
            </DialogHeader>
            <div className="mt-2 grid gap-2 text-sm" style={{ color: 'var(--ds-c2)' }}>
              <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ border: '1px solid var(--ds-s2)', background: 'var(--ds-s4)' }}>
                <span>Undo</span>
                <span className="font-mono text-xs" style={{ color: 'var(--ds-c4)' }}>Ctrl/Cmd + Z</span>
              </div>
              <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ border: '1px solid var(--ds-s2)', background: 'var(--ds-s4)' }}>
                <span>Redo</span>
                <span className="font-mono text-xs" style={{ color: 'var(--ds-c4)' }}>Shift + Ctrl/Cmd + Z</span>
              </div>
              <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ border: '1px solid var(--ds-s2)', background: 'var(--ds-s4)' }}>
                <span>Move selection</span>
                <span className="font-mono text-xs" style={{ color: 'var(--ds-c4)' }}>Arrow keys</span>
              </div>
              <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ border: '1px solid var(--ds-s2)', background: 'var(--ds-s4)' }}>
                <span>Extend selection</span>
                <span className="font-mono text-xs" style={{ color: 'var(--ds-c4)' }}>Shift + Arrow</span>
              </div>
              <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ border: '1px solid var(--ds-s2)', background: 'var(--ds-s4)' }}>
                <span>Copy range</span>
                <span className="font-mono text-xs" style={{ color: 'var(--ds-c4)' }}>Ctrl/Cmd + C</span>
              </div>
              <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ border: '1px solid var(--ds-s2)', background: 'var(--ds-s4)' }}>
                <span>Paste</span>
                <span className="font-mono text-xs" style={{ color: 'var(--ds-c4)' }}>Ctrl/Cmd + V</span>
              </div>
              <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ border: '1px solid var(--ds-s2)', background: 'var(--ds-s4)' }}>
                <span>Next cell / previous cell</span>
                <span className="font-mono text-xs" style={{ color: 'var(--ds-c4)' }}>Tab / Shift + Tab</span>
              </div>
              <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ border: '1px solid var(--ds-s2)', background: 'var(--ds-s4)' }}>
                <span>Next row</span>
                <span className="font-mono text-xs" style={{ color: 'var(--ds-c4)' }}>Enter</span>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={findReplaceOpen} onOpenChange={setFindReplaceOpen}>
          <DialogContent className="max-w-xl rounded-2xl border bg-[var(--ds-bg)] backdrop-blur-xl" style={{ borderColor: 'var(--ds-s1)', color: 'var(--ds-c1)' }}>
            <DialogHeader>
              <DialogTitle>Find and replace</DialogTitle>
              <DialogDescription>Search inside the active sheet and replace safely.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid gap-2">
                <label className="text-xs font-semibold" style={{ color: 'var(--ds-c3)' }}>Find</label>
                <Input value={findText} onChange={(event) => setFindText(event.target.value)} placeholder="Text to find" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c1)' }} />
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-semibold" style={{ color: 'var(--ds-c3)' }}>Replace with</label>
                <Input value={replaceText} onChange={(event) => setReplaceText(event.target.value)} placeholder="Replacement text" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c1)' }} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="h-9 rounded-lg px-3 text-sm font-medium transition disabled:opacity-40" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c2)' }} onClick={() => runFindReplace('find')} disabled={!activeSheet || !findText.trim()}>
                  Find next
                </button>
                <button type="button" className="h-9 rounded-lg px-3 text-sm font-medium transition disabled:opacity-40" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c2)' }} onClick={() => runFindReplace('replace-one')} disabled={!activeSheet || !findText.trim()}>
                  Replace one
                </button>
                <button type="button" className="h-9 rounded-lg px-3 text-sm font-medium transition disabled:opacity-40" style={{ background: 'rgba(16,185,129,0.18)', border: '1px solid rgba(16,185,129,0.35)', color: '#34d399' }} onClick={() => runFindReplace('replace-all')} disabled={!activeSheet || !findText.trim()}>
                  Replace all
                </button>
              </div>
              <p className="text-xs leading-5" style={{ color: 'var(--ds-c4)' }}>Tip: Works on raw cell text (including formulas). Use undo if needed.</p>
            </div>
          </DialogContent>
        </Dialog>

        {contextMenu && activeSheet && contextMenuPosition ? (
          <div
            data-docsheet-contextmenu
            ref={contextMenuRef}
            className="ds-ctx-menu fixed z-[60] w-[280px] max-h-[70vh] overflow-auto rounded-xl backdrop-blur-xl"
            style={{
              border: '1px solid var(--ds-s1)',
              background: 'var(--ds-bg)',
              boxShadow: '0 22px 55px rgba(0,0,0,0.6)',
              left: contextMenuPosition.left,
              top: contextMenuPosition.top,
            }}
          >
            <div className="ds-ctx-hdr px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ borderBottom: '1px solid var(--ds-s2)', background: 'var(--ds-s4)', color: 'var(--ds-c4)' }}>
              Quick actions
            </div>
            <div className="p-1">
              <button type="button" className="ds-menu-item w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => { setEditingCellKey(getCellKey(contextMenu.rowId, contextMenu.columnId)); setContextMenu(null); }}>
                Edit cell (F2)
              </button>
              <button type="button" className="ds-menu-item w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => { void copySelectionToClipboard(); setContextMenu(null); }}>
                Copy
              </button>
              <button type="button" className="ds-menu-item w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => { void pasteClipboardIntoSheet(); setContextMenu(null); }}>
                Paste
              </button>
              <button type="button" className="ds-menu-item w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'rgba(251,113,133,0.85)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='rgba(251,113,133,0.08)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => { clearContentsForRange(); setContextMenu(null); }}>
                Clear contents
              </button>
              <button type="button" className="ds-menu-item w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => { openPanel('comments'); setContextMenu(null); }}>
                Add comment
              </button>

              <div className="ds-separator my-1 h-px" style={{ background: 'var(--ds-s2)' }} />

              <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--ds-c4)' }}>Formulas</div>
              <div className="grid grid-cols-2 gap-1 px-1 pb-1">
                <button type="button" className="ds-menu-item rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => { applyAggregateFormulaToSelection('SUM'); setContextMenu(null); }}>
                  SUM
                </button>
                <button type="button" className="ds-menu-item rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => { applyAggregateFormulaToSelection('AVERAGE'); setContextMenu(null); }}>
                  AVERAGE
                </button>
                <button type="button" className="ds-menu-item rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => { applyAggregateFormulaToSelection('MIN'); setContextMenu(null); }}>
                  MIN
                </button>
                <button type="button" className="ds-menu-item rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => { applyAggregateFormulaToSelection('MAX'); setContextMenu(null); }}>
                  MAX
                </button>
                <button type="button" className="ds-menu-item rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => { applyAggregateFormulaToSelection('COUNT'); setContextMenu(null); }}>
                  COUNT
                </button>
                <button type="button" className="ds-menu-item rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => { setAiMode('change'); openPanel('ai'); setAiInstruction('Recommend and apply the best formulas for this sheet (totals, percent, gaps, and a summary sheet).'); setContextMenu(null); }}>
                  Formula Coach
                </button>
              </div>

              <div className="ds-separator my-1 h-px" style={{ background: 'var(--ds-s2)' }} />

              <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--ds-c4)' }}>Fill</div>
              <div className="grid grid-cols-2 gap-1 px-1 pb-1">
                <button type="button" className="ds-menu-item rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => { fillDown(); setContextMenu(null); }}>
                  Fill down
                </button>
                <button type="button" className="ds-menu-item rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => { fillRight(); setContextMenu(null); }}>
                  Fill right
                </button>
              </div>

              <div className="ds-separator my-1 h-px" style={{ background: 'var(--ds-s2)' }} />

              <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--ds-c4)' }}>Row / Column</div>
              <button type="button" className="ds-menu-item w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => { insertRowBelowSelection(); setContextMenu(null); }}>
                Insert row
              </button>
              <button type="button" className="ds-menu-item w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => { insertColumnRightOfSelection(); setContextMenu(null); }}>
                Insert column
              </button>
              <button type="button" className="ds-menu-item w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'rgba(251,113,133,0.85)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='rgba(251,113,133,0.08)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => { deleteSelectedRows(); setContextMenu(null); }}>
                Delete row(s)
              </button>
              <button type="button" className="ds-menu-item w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'rgba(251,113,133,0.85)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='rgba(251,113,133,0.08)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => { deleteSelectedColumns(); setContextMenu(null); }}>
                Delete column(s)
              </button>

              <div className="ds-separator my-1 h-px" style={{ background: 'var(--ds-s2)' }} />

              <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--ds-c4)' }}>Format</div>
              <div className="grid grid-cols-3 gap-1 px-1 pb-1">
                <button type="button" className="ds-menu-item rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => { toggleFormatFlag('bold'); setContextMenu(null); }}>Bold</button>
                <button type="button" className="ds-menu-item rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => { toggleFormatFlag('italic'); setContextMenu(null); }}>Italic</button>
                <button type="button" className="ds-menu-item rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => { toggleFormatFlag('underline'); setContextMenu(null); }}>Underline</button>
              </div>
              <button type="button" className="ds-menu-item w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => { clearFormattingForRange(); setContextMenu(null); }}>
                Clear formatting
              </button>
            </div>
          </div>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(event) => void importWorkbook(event)}
        />

        <div className="ds-header sticky top-0 z-40 backdrop-blur-xl" style={{ borderBottom: '1px solid var(--ds-s2)', background: 'var(--ds-bg)', boxShadow: '0 1px 0 var(--ds-s4), 0 4px 24px rgba(0,0,0,0.3)' }}>
          <div className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[0.9rem] bg-emerald-500 text-white shadow-sm">
              <FileSpreadsheet className="h-[18px] w-[18px]" />
            </div>

            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Input
                value={workbook.title}
                onChange={(event) => setWorkbook((current) => ({ ...current, title: event.target.value }))}
                className="h-9 w-full max-w-[520px] truncate rounded-full text-sm font-medium shadow-none focus-visible:ring-2 focus-visible:ring-emerald-500/50" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c1)' }}
                placeholder="Untitled spreadsheet"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="hidden h-9 w-9 rounded-full sm:inline-flex" style={{ color: 'var(--ds-c4)' }}
                onClick={() => setStatusMessage('Starred workbooks are coming next.')}
                aria-label="Star workbook"
              >
                <span className="text-lg leading-none">☆</span>
              </Button>
            </div>

            <div className="ds-header-actions flex flex-wrap items-center justify-end gap-2">
              {/* Auto-save status */}
              <div className="hidden items-center text-xs sm:flex ds-text-muted" style={{ color: 'var(--ds-c4)' }}>
                {saving ? 'Saving…' : isDirty ? `Auto-save in ${Math.ceil((autosaveCountdownMs || 0) / 1000)}s` : 'Saved'}
              </div>
              {/* Import */}
              <Button
                type="button"
                variant="outline"
                className="h-8 rounded-lg px-2.5 text-xs shadow-none hidden sm:inline-flex" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c2)' }}
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
              >
                {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                <span className="ml-1.5">Import</span>
              </Button>
              {/* Save */}
              <Button
                type="button"
                className="ds-save-btn h-8 rounded-lg px-3 text-xs shadow-none" style={{ background: 'rgba(16,185,129,0.18)', border: '1px solid rgba(16,185,129,0.35)', color: '#34d399' }}
                onClick={saveWorkbook}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                <span className="ml-1.5 hidden sm:inline">{saving ? 'Saving' : 'Save'}</span>
              </Button>
              {/* Share */}
              <Button
                type="button"
                className="ds-share-btn h-8 rounded-lg px-3 text-xs shadow-none" style={{ background: 'rgba(59,130,246,0.20)', border: '1px solid rgba(59,130,246,0.40)', color: '#60a5fa' }}
                onClick={() => openPanel('share')}
              >
                <Link2 className="h-3.5 w-3.5" />
                <span className="ml-1.5 hidden sm:inline">Share</span>
              </Button>
              {/* Live collab */}
              <button
                type="button"
                onClick={() => setCollabOpen((v) => !v)}
                className="h-8 rounded-lg px-2.5 text-xs font-medium flex items-center gap-1.5 transition"
                style={{
                  background: collabOpen ? 'rgba(139,92,246,0.22)' : 'rgba(139,92,246,0.10)',
                  border: `1px solid ${collabOpen ? 'rgba(139,92,246,0.55)' : 'rgba(139,92,246,0.28)'}`,
                  color: collabOpen ? '#c4b5fd' : '#a78bfa',
                }}
                title="Live collaboration"
              >
                <Users className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Live</span>
                {collabEngine.users.length > 1 && (
                  <span style={{ background: 'rgba(139,92,246,0.3)', color: '#c4b5fd', borderRadius: '9999px', fontSize: 10, padding: '0 5px', fontWeight: 700, minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {collabEngine.users.length}
                  </span>
                )}
              </button>
              {/* Theme toggle */}
              <button
                type="button"
                onClick={() => setTheme((t) => t === 'dark' ? 'light' : 'dark')}
                className="h-8 w-8 rounded-lg flex items-center justify-center transition ds-btn-ghost"
                style={{ color: 'var(--ds-c3)', border: '1px solid var(--ds-s2)', background: 'var(--ds-s4)' }}
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          <div data-docsheet-topmenu-root className="ds-menu-bar flex items-center gap-1 px-3 py-1.5 text-xs sm:px-4 overflow-x-auto" style={{ borderTop: '1px solid var(--ds-s2)', color: 'var(--ds-c3)' }}>
            {/* ── Menu items ── */}
            <div className="flex items-center gap-0.5 shrink-0">
              {/* Dedicated AI quick-access button */}
              <button
                type="button"
                className="rounded-md px-2.5 py-1.5 text-xs font-semibold transition whitespace-nowrap flex items-center gap-1.5 mr-1"
                style={{ color: '#34d399', background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.22)' }}
                onClick={() => { setAiFloatOpen((v) => !v); setTopMenuOpen(null); setMenuAnchorPos(null); }}
                title="Open DocSheet AI assistant"
              >
                <BrainCircuit className="h-3 w-3" />
                AI
              </button>
              <div className="ds-toolbar-divider h-4 w-px shrink-0 mr-1" style={{ background: 'var(--ds-s1)' }} />
              {([
                { id: 'file', label: 'File' },
                { id: 'edit', label: 'Edit' },
                { id: 'view', label: 'View' },
                { id: 'insert', label: 'Insert' },
                { id: 'format', label: 'Format' },
                { id: 'data', label: 'Data' },
                { id: 'tools', label: 'Tools' },
                { id: 'help', label: 'Help' },
              ] as Array<{ id: NonNullable<DocSheetTopMenu>; label: string }>).map((item) => (
                <div key={item.id}>
                  <button
                    type="button"
                    className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition whitespace-nowrap ${topMenuOpen === item.id ? 'bg-[var(--ds-s1)] text-white' : 'text-[var(--ds-c3)] hover:bg-[var(--ds-s3)] hover:text-white'}`}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      if (topMenuOpen === item.id) {
                        setTopMenuOpen(null);
                        setMenuAnchorPos(null);
                      } else {
                        setTopMenuOpen(item.id);
                        setMenuAnchorPos({ top: rect.bottom + 4, left: rect.left });
                      }
                    }}
                  >
                    {item.label}
                  </button>

                  {topMenuOpen === item.id && menuAnchorPos ? (
                    <div className="ds-menu-drop fixed z-[9999] min-w-[240px] max-w-[92vw] rounded-xl backdrop-blur-xl" style={{ top: menuAnchorPos.top, left: Math.min(menuAnchorPos.left, window.innerWidth - 248), maxHeight: 'calc(100vh - ' + (menuAnchorPos.top + 12) + 'px)', overflowY: 'auto', border: '1px solid var(--ds-s1)', background: 'var(--ds-bg)', boxShadow: '0 20px 44px rgba(0,0,0,0.55)' }}>
                      {item.id === 'file' ? (
                        <div className="space-y-1 py-1">
                          <div className="ds-menu-label px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ds-c5)' }}>Workbook</div>
                          <button type="button" className="ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => runMenuAction(createNewWorkbook)}>
                            <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">New workbook</span>
                          </button>
                          <button type="button" className="ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => runMenuAction(() => openPanel('history'))}>
                            <Clock className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">Open saved workbook</span>
                          </button>
                          <div className="ds-separator my-1 h-px" style={{ background: 'var(--ds-s2)' }} />
                          <div className="ds-menu-label px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ds-c5)' }}>Import / Export</div>
                          <button type="button" className="ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => runMenuAction(() => fileInputRef.current?.click())}>
                            <Upload className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">Import (CSV/XLSX)</span>
                          </button>
                          <button type="button" className="ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => runMenuAction(() => openPanel('export'))}>
                            <Download className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">Export / Download</span>
                          </button>
                          <div className="ds-separator my-1 h-px" style={{ background: 'var(--ds-s2)' }} />
                          <button type="button" className="ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => runMenuAction(() => openPanel('share'))}>
                            <Link2 className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">Share</span>
                          </button>
                        </div>
                      ) : null}

                      {item.id === 'edit' ? (
                        <div className="space-y-1 py-1">
                          <button type="button" className="ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => runMenuAction(() => setFindReplaceOpen(true))}>
                            <Search className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">Find / Replace</span>
                            <span className="text-[10px] font-mono" style={{ opacity: 0.30 }}>Ctrl+H</span>
                          </button>
                          <div className="ds-separator my-1 h-px" style={{ background: 'var(--ds-s2)' }} />
                          <div className="ds-menu-label px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ds-c5)' }}>History</div>
                          <button type="button" className="ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => runMenuAction(handleUndo)}>
                            <Undo2 className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">Undo</span>
                            <span className="text-[10px] font-mono" style={{ opacity: 0.30 }}>Ctrl+Z</span>
                          </button>
                          <button type="button" className="ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => runMenuAction(handleRedo)}>
                            <Redo2 className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">Redo</span>
                            <span className="text-[10px] font-mono" style={{ opacity: 0.30 }}>Ctrl+Shift+Z</span>
                          </button>
                          <div className="ds-separator my-1 h-px" style={{ background: 'var(--ds-s2)' }} />
                          <div className="ds-menu-label px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ds-c5)' }}>Clipboard</div>
                          <button type="button" className={`ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${hasSelection ? '' : 'cursor-not-allowed opacity-30'}`} style={{ color: hasSelection ? 'var(--ds-c2)' : 'var(--ds-c5)' }} onMouseEnter={(e)=>{if(hasSelection)(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} disabled={!hasSelection} onClick={() => runMenuAction(() => void copySelectionToClipboard())}>
                            <Copy className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">Copy</span>
                            <span className="text-[10px] font-mono" style={{ opacity: 0.30 }}>Ctrl+C</span>
                          </button>
                          <button type="button" className={`ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${selectionFocus ? '' : 'cursor-not-allowed opacity-30'}`} style={{ color: selectionFocus ? 'var(--ds-c2)' : 'var(--ds-c5)' }} onMouseEnter={(e)=>{if(selectionFocus)(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} disabled={!selectionFocus} onClick={() => runMenuAction(() => void pasteClipboardIntoSheet())}>
                            <RefreshCw className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">Paste</span>
                            <span className="text-[10px] font-mono" style={{ opacity: 0.30 }}>Ctrl+V</span>
                          </button>
                          <div className="ds-separator my-1 h-px" style={{ background: 'var(--ds-s2)' }} />
                          <div className="ds-menu-label px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ds-c5)' }}>Fill</div>
                          <button type="button" className={`ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${hasSelection ? '' : 'cursor-not-allowed opacity-30'}`} style={{ color: hasSelection ? 'var(--ds-c2)' : 'var(--ds-c5)' }} onMouseEnter={(e)=>{if(hasSelection)(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} disabled={!hasSelection} onClick={() => runMenuAction(fillDown)}>
                            <Rows3 className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">Fill down</span>
                            <span className="text-[10px] font-mono" style={{ opacity: 0.30 }}>Ctrl+D</span>
                          </button>
                          <button type="button" className={`ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${hasSelection ? '' : 'cursor-not-allowed opacity-30'}`} style={{ color: hasSelection ? 'var(--ds-c2)' : 'var(--ds-c5)' }} onMouseEnter={(e)=>{if(hasSelection)(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} disabled={!hasSelection} onClick={() => runMenuAction(fillRight)}>
                            <AlignRight className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">Fill right</span>
                            <span className="text-[10px] font-mono" style={{ opacity: 0.30 }}>Ctrl+R</span>
                          </button>
                          <div className="ds-separator my-1 h-px" style={{ background: 'var(--ds-s2)' }} />
                          <div className="ds-menu-label px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(251,113,133,0.45)' }}>Delete</div>
                          <button type="button" className={`ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${hasSelection ? '' : 'cursor-not-allowed opacity-30'}`} style={{ color: hasSelection ? 'rgba(251,113,133,0.85)' : 'var(--ds-c5)' }} onMouseEnter={(e)=>{if(hasSelection)(e.currentTarget as HTMLButtonElement).style.background='rgba(251,113,133,0.08)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} disabled={!hasSelection} onClick={() => runMenuAction(deleteSelectedRows)}>
                            <Trash2 className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.55, color: 'rgba(251,113,133,0.85)' }} />
                            <span className="flex-1">Delete row(s)</span>
                          </button>
                          <button type="button" className={`ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${hasSelection ? '' : 'cursor-not-allowed opacity-30'}`} style={{ color: hasSelection ? 'rgba(251,113,133,0.85)' : 'var(--ds-c5)' }} onMouseEnter={(e)=>{if(hasSelection)(e.currentTarget as HTMLButtonElement).style.background='rgba(251,113,133,0.08)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} disabled={!hasSelection} onClick={() => runMenuAction(deleteSelectedColumns)}>
                            <Trash2 className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.55, color: 'rgba(251,113,133,0.85)' }} />
                            <span className="flex-1">Delete column(s)</span>
                          </button>
                        </div>
                      ) : null}

                      {item.id === 'view' ? (
                        <div className="space-y-1 py-1">
                          <div className="ds-menu-label px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ds-c5)' }}>Layout</div>
                          <button type="button" className="ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => runMenuAction(toggleFreezeColumnA)}>
                            <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">{activeSheet?.frozenColumnCount === 1 ? 'Unfreeze column A' : 'Freeze column A'}</span>
                          </button>
                          <div className="ds-separator my-1 h-px" style={{ background: 'var(--ds-s2)' }} />
                          <div className="ds-menu-label px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ds-c5)' }}>Panels</div>
                          <button type="button" className="ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => runMenuAction(() => openPanel('insights'))}>
                            <BarChart3 className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">Insights panel</span>
                          </button>
                          <button type="button" className="ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => runMenuAction(() => openPanel('ai'))}>
                            <BrainCircuit className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">AI Studio panel</span>
                          </button>
                          <button type="button" className="ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => runMenuAction(() => setStudioPanel('none'))}>
                            <Eye className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">Hide side panel</span>
                          </button>
                        </div>
                      ) : null}

                      {item.id === 'insert' ? (
                        <div className="space-y-1 py-1">
                          <div className="ds-menu-label px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ds-c5)' }}>Cells</div>
                          <button type="button" className={`ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${selectionFocus ? '' : 'cursor-not-allowed opacity-30'}`} style={{ color: selectionFocus ? 'var(--ds-c2)' : 'var(--ds-c5)' }} onMouseEnter={(e)=>{if(selectionFocus)(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} disabled={!selectionFocus} onClick={() => runMenuAction(insertRowBelowSelection)}>
                            <Rows3 className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">Insert row</span>
                          </button>
                          <button type="button" className={`ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${selectionFocus ? '' : 'cursor-not-allowed opacity-30'}`} style={{ color: selectionFocus ? 'var(--ds-c2)' : 'var(--ds-c5)' }} onMouseEnter={(e)=>{if(selectionFocus)(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} disabled={!selectionFocus} onClick={() => runMenuAction(insertColumnRightOfSelection)}>
                            <Plus className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">Insert column</span>
                          </button>
                          <div className="ds-separator my-1 h-px" style={{ background: 'var(--ds-s2)' }} />
                          <button type="button" className="ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => runMenuAction(addSheet)}>
                            <Sheet className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">New sheet</span>
                          </button>
                        </div>
                      ) : null}

                      {item.id === 'format' ? (
                        <div className="space-y-1 py-1">
                          <div className="ds-menu-label px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ds-c5)' }}>Rules</div>
                          <button type="button" className="ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => runMenuAction(() => openPanel('formatting'))}>
                            <PencilLine className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">Conditional formatting</span>
                          </button>
                          <button type="button" className={`ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${!selectedCell ? 'cursor-not-allowed opacity-30' : ''}`} style={{ color: selectedCell ? 'var(--ds-c2)' : 'var(--ds-c5)' }} onMouseEnter={(e)=>{if(selectedCell)(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} disabled={!selectedCell} onClick={() => runMenuAction(() => openPanel('comments'))}>
                            <MessageCircle className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">Comments</span>
                          </button>
                          <div className="ds-separator my-1 h-px" style={{ background: 'var(--ds-s2)' }} />
                          <div className="ds-menu-label px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ds-c5)' }}>Text Style</div>
                          <button type="button" className={`ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${hasSelection ? '' : 'cursor-not-allowed opacity-30'}`} style={{ color: hasSelection ? 'var(--ds-c2)' : 'var(--ds-c5)' }} onMouseEnter={(e)=>{if(hasSelection)(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} disabled={!hasSelection} onClick={() => runMenuAction(() => toggleFormatFlag('bold'))}>
                            <Bold className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">Bold</span>
                            <span className="text-[10px] font-mono" style={{ opacity: 0.30 }}>Ctrl+B</span>
                          </button>
                          <button type="button" className={`ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${hasSelection ? '' : 'cursor-not-allowed opacity-30'}`} style={{ color: hasSelection ? 'var(--ds-c2)' : 'var(--ds-c5)' }} onMouseEnter={(e)=>{if(hasSelection)(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} disabled={!hasSelection} onClick={() => runMenuAction(() => toggleFormatFlag('italic'))}>
                            <Italic className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">Italic</span>
                            <span className="text-[10px] font-mono" style={{ opacity: 0.30 }}>Ctrl+I</span>
                          </button>
                          <button type="button" className={`ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${hasSelection ? '' : 'cursor-not-allowed opacity-30'}`} style={{ color: hasSelection ? 'var(--ds-c2)' : 'var(--ds-c5)' }} onMouseEnter={(e)=>{if(hasSelection)(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} disabled={!hasSelection} onClick={() => runMenuAction(() => toggleFormatFlag('underline'))}>
                            <Underline className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">Underline</span>
                            <span className="text-[10px] font-mono" style={{ opacity: 0.30 }}>Ctrl+U</span>
                          </button>
                          <div className="ds-separator my-1 h-px" style={{ background: 'var(--ds-s2)' }} />
                          <div className="ds-menu-label px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ds-c5)' }}>Alignment</div>
                          <button type="button" className={`ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${hasSelection ? '' : 'cursor-not-allowed opacity-30'}`} style={{ color: hasSelection ? 'var(--ds-c2)' : 'var(--ds-c5)' }} onMouseEnter={(e)=>{if(hasSelection)(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} disabled={!hasSelection} onClick={() => runMenuAction(() => applyAlign('left'))}>
                            <AlignLeft className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">Align left</span>
                          </button>
                          <button type="button" className={`ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${hasSelection ? '' : 'cursor-not-allowed opacity-30'}`} style={{ color: hasSelection ? 'var(--ds-c2)' : 'var(--ds-c5)' }} onMouseEnter={(e)=>{if(hasSelection)(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} disabled={!hasSelection} onClick={() => runMenuAction(() => applyAlign('center'))}>
                            <AlignCenter className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">Align center</span>
                          </button>
                          <button type="button" className={`ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${hasSelection ? '' : 'cursor-not-allowed opacity-30'}`} style={{ color: hasSelection ? 'var(--ds-c2)' : 'var(--ds-c5)' }} onMouseEnter={(e)=>{if(hasSelection)(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} disabled={!hasSelection} onClick={() => runMenuAction(() => applyAlign('right'))}>
                            <AlignRight className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">Align right</span>
                          </button>
                        </div>
                      ) : null}

                      {item.id === 'data' ? (
                        <div className="space-y-1 py-1">
                          <div className="ds-menu-label px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ds-c5)' }}>Sort &amp; Filter</div>
                          <button type="button" className="ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => runMenuAction(() => openPanel('smart'))}>
                            <LineChart className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">Smart Sheets / Templates</span>
                          </button>
                          <button type="button" className="ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => runMenuAction(() => openPanel('formatting'))}>
                            <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">Sort &amp; Filter</span>
                          </button>
                          <div className="ds-separator my-1 h-px" style={{ background: 'var(--ds-s2)' }} />
                          <div className="ds-menu-label px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ds-c5)' }}>Analysis</div>
                          <button type="button" className="ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => runMenuAction(() => openPanel('insights'))}>
                            <BarChart3 className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">Insights &amp; Analytics</span>
                          </button>
                        </div>
                      ) : null}

                      {item.id === 'tools' ? (
                        <div className="space-y-1 py-1">
                          <div className="ds-menu-label px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ds-c5)' }}>AI Features</div>
                          <button type="button" className="ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: '#34d399' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='rgba(16,185,129,0.08)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => { setAiFloatOpen(true); setAiMode('ask'); setTopMenuOpen(null); setMenuAnchorPos(null); }}>
                            <Search className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.70 }} />
                            <span className="flex-1">Ask AI (DocSheet Chat)</span>
                          </button>
                          <button type="button" className="ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: '#34d399' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='rgba(16,185,129,0.08)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => { setAiFloatOpen(true); setAiMode('change'); setTopMenuOpen(null); setMenuAnchorPos(null); }}>
                            <BrainCircuit className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.70 }} />
                            <span className="flex-1">Edit Sheet with AI</span>
                          </button>
                          <button type="button" className="ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => runMenuAction(() => openPanel('ai'))}>
                            <BrainCircuit className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">AI Studio (full panel)</span>
                          </button>
                          <div className="ds-separator my-1 h-px" style={{ background: 'var(--ds-s2)' }} />
                          <div className="ds-menu-label px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ds-c5)' }}>Analytics</div>
                          <button type="button" className="ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => runMenuAction(() => openPanel('insights'))}>
                            <BarChart3 className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">Insights</span>
                          </button>
                        </div>
                      ) : null}

                      {item.id === 'help' ? (
                        <div className="space-y-1">
                          <button type="button" className="ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => runMenuAction(() => setShortcutsOpen(true))}>
                            <KeyRound className="h-3.5 w-3.5 shrink-0" style={{ opacity: 0.42 }} />
                            <span className="flex-1">Keyboard shortcuts</span>
                            <span className="text-[10px] font-mono" style={{ opacity: 0.30 }}>Ctrl+/</span>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-1 shrink-0 pl-2">
              <Button type="button" variant="ghost" size="icon" className="ds-btn-ghost h-8 w-8 rounded-lg flex items-center justify-center transition" style={{ color: 'var(--ds-c3)' }} onClick={() => openPanel('export')} aria-label="Export">
                <Download className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="ds-btn-ghost h-8 w-8 rounded-lg flex items-center justify-center transition" style={{ color: 'var(--ds-c3)' }} onClick={() => openPanel('insights')} aria-label="Insights">
                <BarChart3 className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="ds-btn-ghost h-8 w-8 rounded-lg flex items-center justify-center transition" style={{ color: 'var(--ds-c3)' }} onClick={() => openPanel('ai')} aria-label="AI Studio">
                <BrainCircuit className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="ds-btn-ghost h-8 w-8 rounded-lg flex items-center justify-center transition" style={{ color: 'var(--ds-c3)' }} onClick={() => openPanel('history')} aria-label="History">
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="ds-toolbar-scroll flex items-center gap-1.5 px-3 py-1.5 sm:px-4 overflow-x-auto" style={{ borderTop: '1px solid var(--ds-s2)' }}>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-lg" style={{ color: 'var(--ds-c3)' }} onClick={handleUndo} aria-label="Undo">
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-lg" style={{ color: 'var(--ds-c3)' }} onClick={handleRedo} aria-label="Redo">
              <Redo2 className="h-4 w-4" />
            </Button>
            <div className="ds-toolbar-divider h-5 w-px shrink-0" style={{ background: 'var(--ds-s1)' }} />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className='h-8 w-8 rounded-lg' style={{ color: selectedFormat.bold ? 'var(--ds-c1)' : 'var(--ds-c3)' }}
              onClick={() => toggleFormatFlag('bold')}
              disabled={!hasSelection}
              aria-label="Bold"
            >
              <Bold className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className='h-8 w-8 rounded-lg' style={{ color: selectedFormat.italic ? 'var(--ds-c1)' : 'var(--ds-c3)' }}
              onClick={() => toggleFormatFlag('italic')}
              disabled={!hasSelection}
              aria-label="Italic"
            >
              <Italic className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className='h-8 w-8 rounded-lg' style={{ color: selectedFormat.underline ? 'var(--ds-c1)' : 'var(--ds-c3)' }}
              onClick={() => toggleFormatFlag('underline')}
              disabled={!hasSelection}
              aria-label="Underline"
            >
              <Underline className="h-4 w-4" />
            </Button>
            <div className="ds-toolbar-divider h-5 w-px shrink-0" style={{ background: 'var(--ds-s1)' }} />
            <Button type="button" variant="ghost" size="icon" className='h-8 w-8 rounded-lg' style={{ color: (selectedFormat.align === 'left' || !selectedFormat.align) ? 'var(--ds-c1)' : 'var(--ds-c3)' }} onClick={() => applyAlign('left')} disabled={!hasSelection} aria-label="Align left">
              <AlignLeft className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className='h-8 w-8 rounded-lg' style={{ color: selectedFormat.align === 'center' ? 'var(--ds-c1)' : 'var(--ds-c3)' }} onClick={() => applyAlign('center')} disabled={!hasSelection} aria-label="Align center">
              <AlignCenter className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className='h-8 w-8 rounded-lg' style={{ color: selectedFormat.align === 'right' ? 'var(--ds-c1)' : 'var(--ds-c3)' }} onClick={() => applyAlign('right')} disabled={!hasSelection} aria-label="Align right">
              <AlignRight className="h-4 w-4" />
            </Button>
            <div className="ds-toolbar-divider h-5 w-px shrink-0" style={{ background: 'var(--ds-s1)' }} />
            <Select
              value={selectedFormat.numberFormat || 'auto'}
              onValueChange={(value) => updateCellFormatForRange({ numberFormat: value as DocSheetCellFormat['numberFormat'] })}
              disabled={!hasSelection}
            >
              <SelectTrigger className="h-8 w-[160px] rounded-lg text-xs shadow-none" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c2)' }}>
                <SelectValue placeholder="Number format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="plain">Plain text</SelectItem>
                <SelectItem value="currency">Currency</SelectItem>
                <SelectItem value="percent">Percent</SelectItem>
                <SelectItem value="date">Date</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto flex items-center gap-1.5 shrink-0">
              <Button type="button" variant="outline" className="h-8 rounded-lg px-2.5 text-xs shadow-none" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c3)' }} onClick={addColumn} disabled={!activeSheet}>
                <Plus className="mr-1.5 h-4 w-4" />
                Column
              </Button>
              <Button type="button" variant="outline" className="h-8 rounded-lg px-2.5 text-xs shadow-none" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c3)' }} onClick={addRow} disabled={!activeSheet}>
                <Plus className="mr-1.5 h-4 w-4" />
                Row
              </Button>
              <Button type="button" variant="outline" className="h-8 rounded-lg px-2.5 text-xs shadow-none" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c3)' }} onClick={insertColumnRightOfSelection} disabled={!activeSheet || !selectionFocus}>
                Insert col
              </Button>
              <Button type="button" variant="outline" className="h-8 rounded-lg px-2.5 text-xs shadow-none" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c3)' }} onClick={insertRowBelowSelection} disabled={!activeSheet || !selectionFocus}>
                Insert row
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-8 rounded-lg px-2.5 text-xs shadow-none" style={{ border: '1px solid rgba(251,113,133,0.25)', background: 'rgba(251,113,133,0.07)', color: 'rgba(251,113,133,0.80)' }}
                onClick={deleteSelectedColumns}
                disabled={!hasSelection}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Column
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-8 rounded-lg px-2.5 text-xs shadow-none" style={{ border: '1px solid rgba(251,113,133,0.25)', background: 'rgba(251,113,133,0.07)', color: 'rgba(251,113,133,0.80)' }}
                onClick={deleteSelectedRows}
                disabled={!hasSelection}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Row
              </Button>
            </div>
          </div>

          <div className="ds-formula-bar flex items-center gap-2 px-3 py-1.5 sm:px-4" style={{ borderTop: '1px solid var(--ds-s2)' }}>
            <div className="ds-cell-ref-box flex w-[72px] items-center justify-between rounded-lg px-2 py-1 text-xs shrink-0" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c2)' }}>
              <span className="font-medium">{selectedCellRef || 'A1'}</span>
              <span style={{ color: 'var(--ds-c5)' }}>▾</span>
            </div>
            <div className="flex flex-1 items-center gap-2">
              <span className="ds-fx-badge rounded-md px-2 py-1 text-[11px] font-semibold shrink-0" style={{ background: 'var(--ds-s2)', color: 'var(--ds-c3)' }}>fx</span>
              <Input
                ref={formulaBarRef}
                value={selectedCell ? selectedCellRawValue : ''}
                onChange={(event) => updateSelectedCellRawValue(event.target.value)}
                placeholder={selectedCell ? 'Enter a value or formula like =SUM(C1:C10)' : 'Select a cell to edit'}
                disabled={!selectedCell}
                className="h-9 rounded-lg text-sm shadow-none focus-visible:ring-2 focus-visible:ring-emerald-500/50" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s4)', color: 'var(--ds-c1)' }}
              />
              <div className="ds-formula-functions hidden items-center gap-1 md:flex">
                {(['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT'] as const).map((fn) => (
                  <button
                    key={fn}
                    type="button"
                    className="ds-formula-chip rounded-lg px-2 py-1 text-[11px] font-semibold transition" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c3)' }}
                    onClick={() => {
                      if (selectionBounds) {
                        applyAggregateFormulaToSelection(fn);
                        return;
                      }
                      if (!selectedCell || !activeSheet) return;
                      updateSelectedCellRawValue(`=${fn}(`);
                      requestAnimationFrame(() => {
                        formulaBarRef.current?.focus();
                      });
                    }}
                  >
                    {fn === 'AVERAGE' ? 'AVG' : fn}
                  </button>
                ))}
              </div>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <Select value={workbook.currencyCode || 'INR'} onValueChange={(value) => setWorkbook((current) => ({ ...current, currencyCode: value }))}>
                <SelectTrigger className="h-9 w-[96px] rounded-lg text-xs shadow-none" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c2)' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['INR', 'USD', 'EUR', 'GBP', 'SGD', 'AED'].map((code) => (
                    <SelectItem key={code} value={code}>{code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {(statusMessage || errorMessage) ? (
          <div className="ds-status-bar px-3 pt-3 sm:px-4">
            {statusMessage ? <div className="ds-status-ok rounded-xl px-4 py-3 text-sm" style={{ border: '1px solid rgba(16,185,129,0.25)', background: 'rgba(16,185,129,0.10)', color: '#34d399' }}>{statusMessage}</div> : null}
            {errorMessage ? <div className="ds-status-err mt-2 rounded-xl px-4 py-3 text-sm" style={{ border: '1px solid rgba(251,113,133,0.25)', background: 'rgba(251,113,133,0.10)', color: 'rgba(251,113,133,0.90)' }}>{errorMessage}</div> : null}
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1">
          <div ref={gridRootRef} className="ds-grid-root min-h-0 flex-1 overflow-auto px-3 pb-4 pt-3 sm:px-4" style={{ background: 'var(--ds-grid)' }}>
            <div className="ds-grid-wrap overflow-hidden rounded-2xl" style={{ border: '1px solid var(--ds-s2)', background: 'var(--ds-cell)', boxShadow: '0 16px 40px rgba(0,0,0,0.40)' }}>
              <div className="max-w-full overflow-auto ds-grid-scroll">
                {activeSheet ? (
                  <table className="min-w-max border-collapse text-sm">
                    <thead className="sticky top-0 z-10" style={{ background: 'var(--ds-th)' }}>
                      <tr>
                        <th className="sticky left-0 z-20 w-12 px-2 py-2 text-right text-xs font-medium" style={{ borderBottom: '1px solid var(--ds-s2)', borderRight: '1px solid var(--ds-s2)', background: 'var(--ds-th)', color: 'var(--ds-c5)' }}>
                          #
                        </th>
                        {activeSheet.columns.map((column, columnIndex) => (
                          <th
                            key={column.id}
                            className={`relative px-3 py-2 text-left text-xs font-semibold ${activeSheet.frozenColumnCount === 1 && columnIndex === 0 ? 'sticky z-30' : ''}`}
                            style={{
                              borderBottom: '1px solid var(--ds-s2)',
                              background: 'var(--ds-th)',
                              color: 'var(--ds-c4)',
                              width: column.width || 140,
                              minWidth: column.width || 140,
                              ...(activeSheet.frozenColumnCount === 1 && columnIndex === 0 ? { left: 48 } : null),
                            }}
                            title={column.label}
                          >
                            <span className="select-none">{getDocSheetColumnLetter(columnIndex)}</span>
                            <button
                              type="button"
                              className="absolute right-0 top-0 h-full w-2 cursor-col-resize bg-transparent hover:bg-emerald-500/20"
                              aria-label="Resize column"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                startColumnResize(column.id, event.clientX);
                              }}
                            />
                          </th>
                        ))}
                      </tr>
                      <tr>
                        <th className="sticky left-0 z-20 w-12 px-2 py-2 text-right text-[11px] font-medium" style={{ borderBottom: '1px solid var(--ds-s2)', borderRight: '1px solid var(--ds-s2)', background: 'var(--ds-th)', color: 'var(--ds-c5)' }}>
                          1
                        </th>
                        {activeSheet.columns.map((column, columnIndex) => {
                          const filterActive = Boolean(activeSheet.filters?.[column.id]?.value);
                          const sorted = activeSheet.sortState?.columnId === column.id ? activeSheet.sortState.direction : null;
                          return (
                            <th
                              key={`${column.id}-label`}
                              className={`relative px-3 py-2 text-left text-[11px] font-semibold ${activeSheet.frozenColumnCount === 1 && columnIndex === 0 ? 'sticky z-30' : ''}`}
                              style={{
                                borderBottom: '1px solid var(--ds-s2)',
                                background: 'var(--ds-th)',
                                color: 'var(--ds-c3)',
                                width: column.width || 140,
                                minWidth: column.width || 140,
                                ...(activeSheet.frozenColumnCount === 1 && columnIndex === 0 ? { left: 48 } : null),
                              }}
                            >
                              <button
                                type="button"
                                className="w-full truncate text-left"
                                onDoubleClick={() => {
                                  const next = window.prompt('Rename column', column.label);
                                  if (!next || !next.trim()) return;
                                  updateColumnLabel(column.id, next.trim());
                                  setStatusMessage('Column renamed.');
                                }}
                              >
                                {column.label}
                              </button>
                              <button
                                type="button"
                                className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-1 py-1 transition ${filterActive || sorted ? 'text-white' : 'text-[var(--ds-c4)]' }`}
                                aria-label="Column menu"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setColumnMenuOpen((current) => (current === column.id ? null : column.id));
                                  setColumnFilterDraft({
                                    columnId: column.id,
                                    op: (activeSheet.filters?.[column.id]?.op || 'contains') as any,
                                    value: activeSheet.filters?.[column.id]?.value || '',
                                  });
                                }}
                              >
                                {sorted === 'asc' ? '↑' : sorted === 'desc' ? '↓' : '▾'}
                              </button>

                              {columnMenuOpen === column.id ? (
                                <div data-docsheet-column-menu className="ds-col-menu absolute left-0 top-[calc(100%+6px)] z-50 w-72 rounded-xl p-2 backdrop-blur-xl" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-bg)', boxShadow: '0 18px 40px rgba(0,0,0,0.55)' }}>
                                  <div className="flex items-center gap-2">
                                    <button type="button" className="h-8 rounded-lg px-3 text-xs font-medium transition" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c2)' }} onClick={() => { setSortState(column.id, 'asc'); setColumnMenuOpen(null); }}>
                                      Sort A-Z
                                    </button>
                                    <button type="button" className="h-8 rounded-lg px-3 text-xs font-medium transition" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c2)' }} onClick={() => { setSortState(column.id, 'desc'); setColumnMenuOpen(null); }}>
                                      Sort Z-A
                                    </button>
                                    <button type="button" className="h-8 rounded-lg px-3 text-xs font-medium transition" style={{ color: 'var(--ds-c4)' }} onClick={() => { setSortState(column.id, null); setColumnMenuOpen(null); }}>
                                      Clear
                                    </button>
                                  </div>
                                  <div className="mt-3 rounded-xl p-3" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s4)' }}>
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--ds-c4)' }}>Filter</p>
                                    <div className="mt-2 grid grid-cols-[96px_1fr] gap-2">
                                      <Select
                                        value={columnFilterDraft?.columnId === column.id ? columnFilterDraft.op : 'contains'}
                                        onValueChange={(value) => setColumnFilterDraft((current) => current && current.columnId === column.id ? { ...current, op: value as any } : { columnId: column.id, op: value as any, value: '' })}
                                      >
                                        <SelectTrigger className="h-9 rounded-lg text-xs shadow-none" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c2)' }}>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="contains">Contains</SelectItem>
                                          <SelectItem value="equals">Equals</SelectItem>
                                          <SelectItem value="gt">{'>'}</SelectItem>
                                          <SelectItem value="gte">{'>='}</SelectItem>
                                          <SelectItem value="lt">{'<'}</SelectItem>
                                          <SelectItem value="lte">{'<='}</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Input
                                        value={columnFilterDraft?.columnId === column.id ? columnFilterDraft.value : ''}
                                        onChange={(event) => setColumnFilterDraft((current) => current && current.columnId === column.id ? { ...current, value: event.target.value } : { columnId: column.id, op: 'contains', value: event.target.value })}
                                        className="h-9 rounded-lg text-sm shadow-none" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c1)' }}
                                        placeholder="Value"
                                      />
                                    </div>
                                    <div className="mt-3 flex items-center gap-2">
                                      <button
                                        type="button"
                                        className="h-8 rounded-lg px-3 text-xs font-medium transition"
                                        style={{ background: 'rgba(16,185,129,0.18)', border: '1px solid rgba(16,185,129,0.35)', color: '#34d399' }}
                                        onClick={() => {
                                          if (!columnFilterDraft || columnFilterDraft.columnId !== column.id) return;
                                          applyColumnFilter(column.id, columnFilterDraft.op, columnFilterDraft.value);
                                          setColumnMenuOpen(null);
                                        }}
                                      >
                                        Apply
                                      </button>
                                      <button
                                        type="button"
                                        className="h-8 rounded-lg px-3 text-xs font-medium transition"
                                        style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c3)' }}
                                        onClick={() => {
                                          clearColumnFilter(column.id);
                                          setColumnMenuOpen(null);
                                        }}
                                      >
                                        Clear
                                      </button>
                                    </div>
                                    {filterActive ? <p className="mt-2 text-xs" style={{ color: 'var(--ds-c4)' }}>Filter active</p> : null}
                                  </div>
                                </div>
                              ) : null}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {derivedRows.map((row, rowIndex) => (
                        <tr key={row.id} className="group ds-row">
                          <td className="ds-row-num sticky left-0 z-10 w-12 px-2 py-1 text-right text-xs" style={{ borderRight: '1px solid var(--ds-s2)', background: 'var(--ds-th)', color: 'var(--ds-c5)' }}>
                            {rowIndex + 1}
                          </td>
                          {activeSheet.columns.map((column, columnIndex) => {
                            const rawValue = String(row.values[column.id] ?? '');
                            const isSelected = selectedCell?.rowId === row.id && selectedCell?.columnId === column.id;
                            const inRange = Boolean(selectionBounds
                              && rowIndex >= selectionBounds.minRow
                              && rowIndex <= selectionBounds.maxRow
                              && columnIndex >= selectionBounds.minCol
                              && columnIndex <= selectionBounds.maxCol);
                            const key = getCellKey(row.id, column.id);
                            const isEditing = editingCellKey === key;
                            const format = activeSheet.cellFormats?.[key] || {};
                            const align = (format.align || 'left') as DocSheetCellAlign;
                            const formatClass = `${format.bold ? 'font-semibold' : ''} ${format.italic ? 'italic' : ''} ${format.underline ? 'underline' : ''} ${align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'}`.trim();
                            const frozenA = activeSheet.frozenColumnCount === 1 && columnIndex === 0;
                            const commentCount = activeSheet.cellComments?.[key]?.length || 0;
                            const rules = (activeSheet.conditionalRules || []).filter((rule) => rule.enabled !== false && rule.columnId === column.id);
                            const computedDisplay = rawValue.trim().startsWith('=')
                              ? String(getDocSheetDisplayValue(activeSheet, row.id, column.id))
                              : rawValue;
                            const compareValue = rawValue.trim().startsWith('=') ? computedDisplay : rawValue;
                            const conditionalStyle = (() => {
                              if (!rules.length) return null;
                              for (const rule of rules) {
                                const value = String(rule.value ?? '').trim();
                                if (!value) continue;
                                const op = rule.op;
                                const rawLower = compareValue.toLowerCase();
                                const valueLower = value.toLowerCase();
                                const rawNum = Number(compareValue.replace(/[^0-9.\-]/g, ''));
                                const valueNum = Number(value.replace(/[^0-9.\-]/g, ''));
                                let match = false;
                                if (op === 'contains') match = rawLower.includes(valueLower);
                                if (op === 'equals') match = rawLower === valueLower;
                                if (['gt', 'lt', 'gte', 'lte'].includes(op) && Number.isFinite(rawNum) && Number.isFinite(valueNum)) {
                                  if (op === 'gt') match = rawNum > valueNum;
                                  if (op === 'lt') match = rawNum < valueNum;
                                  if (op === 'gte') match = rawNum >= valueNum;
                                  if (op === 'lte') match = rawNum <= valueNum;
                                }
                                if (match) {
                                  return rule.style || null;
                                }
                              }
                              return null;
                            })();
                            return (
                              <td
                                key={`${row.id}-${column.id}`}
                                className={`px-0 py-0 ${frozenA ? 'sticky z-20' : ''}`}
                                style={{
                                  borderBottom: '1px solid var(--ds-s2)',
                                  borderRight: '1px solid var(--ds-s2)',
                                  background: conditionalStyle?.bg || (inRange ? 'rgba(16,185,129,0.09)' : 'var(--ds-cell)'),
                                  color: conditionalStyle?.text || undefined,
                                  width: column.width || 140,
                                  minWidth: column.width || 140,
                                  ...(frozenA ? { left: 48 } : null),
                                }}
                              >
                                <div className="relative">
                                  <input
                                    value={isEditing ? rawValue : computedDisplay}
                                    ref={(el) => {
                                      cellInputRefs.current[key] = el;
                                    }}
                                    onPointerDown={(event) => {
                                      setSelectedCell({ rowId: row.id, columnId: column.id });
                                      if (event.shiftKey && selectionAnchor) {
                                        setSelectionFocus({ rowId: row.id, columnId: column.id });
                                      } else {
                                        setSelectionAnchor({ rowId: row.id, columnId: column.id });
                                        setSelectionFocus({ rowId: row.id, columnId: column.id });
                                      }
                                    }}
                                    onContextMenu={(event) => {
                                      event.preventDefault();
                                      setSelectedCell({ rowId: row.id, columnId: column.id });
                                      setSelectionAnchor({ rowId: row.id, columnId: column.id });
                                      setSelectionFocus({ rowId: row.id, columnId: column.id });
                                      setContextMenu({ x: event.clientX, y: event.clientY, rowId: row.id, columnId: column.id });
                                    }}
                                    onDoubleClick={() => {
                                      setEditingCellKey(key);
                                      requestAnimationFrame(() => cellInputRefs.current[key]?.focus());
                                    }}
                                    onFocus={() => {
                                      setSelectedCell({ rowId: row.id, columnId: column.id });
                                      if (!selectionAnchor || !selectionFocus) {
                                        setSelectionAnchor({ rowId: row.id, columnId: column.id });
                                        setSelectionFocus({ rowId: row.id, columnId: column.id });
                                      }
                                    }}
                                    onBlur={() => {
                                      if (editingCellKey === key) setEditingCellKey(null);
                                    }}
                                    readOnly={!isEditing}
                                    onKeyDown={(event) => {
                                      const isMeta = event.metaKey || event.ctrlKey;
                                      if (isMeta) return;
                                      if (!isEditing) {
                                        if (event.key === 'Enter' || event.key === 'F2') {
                                          event.preventDefault();
                                          setEditingCellKey(key);
                                          requestAnimationFrame(() => cellInputRefs.current[key]?.focus());
                                          return;
                                        }
                                        if (event.key === 'Backspace' || event.key === 'Delete') {
                                          event.preventDefault();
                                          setEditingCellKey(key);
                                          updateCell(row.id, column.id, '');
                                          requestAnimationFrame(() => cellInputRefs.current[key]?.focus());
                                          return;
                                        }
                                        if (event.key.length === 1 && !event.altKey) {
                                          event.preventDefault();
                                          setEditingCellKey(key);
                                          updateCell(row.id, column.id, event.key);
                                          requestAnimationFrame(() => cellInputRefs.current[key]?.focus());
                                          return;
                                        }
                                      } else {
                                        if (event.key === 'Escape') {
                                          event.preventDefault();
                                          setEditingCellKey(null);
                                          return;
                                        }
                                      }
                                    }}
                                    onChange={(event) => {
                                      if (!isEditing) return;
                                      updateCell(row.id, column.id, event.target.value);
                                    }}
                                    className={`h-9 w-full bg-transparent px-3 text-sm outline-none transition ${formatClass} ${
                                      isSelected ? 'ring-2 ring-emerald-500/80 ring-offset-[-2px]' : 'focus:ring-2 focus:ring-emerald-500/40 focus:ring-offset-[-2px]'
                                    }`} style={{ color: 'var(--ds-c1)' }}
                                    inputMode={column.type === 'number' || column.type === 'currency' || column.type === 'percent' ? 'decimal' : undefined}
                                  />
                                  {commentCount ? (
                                    <button
                                      type="button"
                                      className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-amber-400 shadow-sm"
                                      aria-label="Open comments"
                                      onClick={() => {
                                        setSelectedCell({ rowId: row.id, columnId: column.id });
                                        openPanel('comments');
                                      }}
                                    />
                                  ) : null}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="px-8 py-16 text-center text-sm" style={{ color: 'var(--ds-c4)' }}>
                    Create a sheet to start using DocSheet.
                  </div>
                )}
              </div>
            </div>
          </div>

          {studioPanel !== 'none' ? (
            <div className="fixed inset-0 z-50 lg:static lg:z-auto lg:block lg:w-[380px] lg:min-w-[380px]">
              <button
                type="button"
                className="absolute inset-0 backdrop-blur-[2px] lg:hidden" style={{ background: 'rgba(0,0,0,0.55)' }}
                aria-label="Close panel"
                onClick={closePanel}
              />
              <div className="ds-panel-side absolute bottom-0 left-0 right-0 max-h-[78vh] overflow-hidden rounded-t-[1.6rem] backdrop-blur-xl lg:static lg:max-h-none lg:h-full lg:rounded-none" style={{ borderTop: '1px solid var(--ds-s2)', background: 'var(--ds-bg)' }}>
                <div className="ds-panel-header flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--ds-s2)' }}>
                  <p className="text-sm font-semibold" style={{ color: 'var(--ds-c1)' }}>
                    {studioPanel === 'share'
                      ? 'Share'
                      : studioPanel === 'export'
                        ? 'Export'
                        : studioPanel === 'insights'
                          ? 'Insights'
                          : studioPanel === 'ai'
                            ? 'AI Studio'
                            : studioPanel === 'history'
                              ? 'History'
                              : studioPanel === 'smart'
                                ? 'Smart Sheets'
                                : studioPanel === 'formatting'
                                  ? 'Conditional formatting'
                                  : studioPanel === 'comments'
                                    ? 'Comments'
                                    : 'File'}
                  </p>
                  <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg px-2" style={{ color: 'var(--ds-c3)' }} onClick={closePanel}>
                    Close
                  </Button>
                </div>

                <div className="ds-panel-body max-h-[calc(78vh-52px)] overflow-auto px-4 py-4 lg:max-h-[calc(100vh-180px)]">
                {studioPanel === 'file' ? (
                  <div className="space-y-3">
                    <Button type="button" variant="outline" className="w-full justify-start" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s4)', color: 'var(--ds-c2)' }} onClick={createNewWorkbook}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      New workbook
                    </Button>
                    <Button type="button" variant="outline" className="w-full justify-start" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s4)', color: 'var(--ds-c2)' }} onClick={() => fileInputRef.current?.click()} disabled={importing}>
                      <Upload className="mr-2 h-4 w-4" />
                      Import spreadsheet (CSV/XLSX)
                    </Button>
                    <Button type="button" variant="outline" className="w-full justify-start" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s4)', color: 'var(--ds-c2)' }} onClick={() => openPanel('export')}>
                      <Download className="mr-2 h-4 w-4" />
                      Download / Export
                    </Button>
                    <Button type="button" variant="outline" className="w-full justify-start" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s4)', color: 'var(--ds-c2)' }} onClick={() => openPanel('history')}>
                      <SlidersHorizontal className="mr-2 h-4 w-4" />
                      Open saved workbook
                    </Button>
                  </div>
                ) : null}

                {studioPanel === 'share' ? (
                  <div className="space-y-4">
                    <div className="ds-card grid gap-3 rounded-2xl p-4" style={{ border: '1px solid var(--ds-s2)', background: 'var(--ds-s4)' }}>
                      <div className="grid gap-2">
                        <label className="text-xs font-semibold" style={{ color: 'var(--ds-c3)' }}>Link type</label>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            variant={shareRequiresPassword ? 'outline' : 'default'}
                            className="h-10 rounded-xl"
                            onClick={() => setShareRequiresPassword(false)}
                          >
                            Public
                          </Button>
                          <Button
                            type="button"
                            variant={shareRequiresPassword ? 'default' : 'outline'}
                            className="h-10 rounded-xl"
                            onClick={() => setShareRequiresPassword(true)}
                          >
                            Secure
                          </Button>
                        </div>
                        <p className="text-xs leading-5" style={{ color: 'var(--ds-c4)' }}>
                          Public opens instantly. Secure requires a password before the sheet loads.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-semibold" style={{ color: 'var(--ds-c3)' }}>Access policy</label>
                        <Select value={shareAccessPolicy} onValueChange={(value) => setShareAccessPolicy(value as typeof shareAccessPolicy)}>
                          <SelectTrigger style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c2)' }}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="standard">Standard</SelectItem>
                            <SelectItem value="expiring">Expiring</SelectItem>
                            <SelectItem value="one_time">One-time / limited</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {shareAccessPolicy === 'expiring' ? (
                        <div className="space-y-2">
                          <label className="text-xs font-semibold" style={{ color: 'var(--ds-c3)' }}>Expiry days</label>
                          <Input value={docsheetExpiryDays} onChange={(event) => setDocsheetExpiryDays(event.target.value)} style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c2)' }} />
                        </div>
                      ) : null}

                      {shareAccessPolicy === 'one_time' ? (
                        <div className="space-y-2">
                          <label className="text-xs font-semibold" style={{ color: 'var(--ds-c3)' }}>Allowed opens</label>
                          <Input value={shareMaxAccessCount} onChange={(event) => setShareMaxAccessCount(event.target.value)} placeholder="1" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c2)' }} />
                          <p className="text-xs leading-5" style={{ color: 'var(--ds-c4)' }}>After this many opens/downloads, the link stops working.</p>
                        </div>
                      ) : null}

                      <div className="space-y-2">
                        <label className="text-xs font-semibold" style={{ color: 'var(--ds-c3)' }}>Share mode</label>
                        <Select value={docsheetShareMode} onValueChange={(value) => setDocsheetShareMode(value as 'view' | 'edit')}>
                          <SelectTrigger style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c2)' }}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="view">View only</SelectItem>
                            <SelectItem value="edit">Editable session</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold" style={{ color: 'var(--ds-c3)' }}>Shared with</label>
                        <Input value={docsheetSharedWithEmail} onChange={(event) => setDocsheetSharedWithEmail(event.target.value)} placeholder="recipient@company.com" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c2)' }} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold" style={{ color: 'var(--ds-c3)' }}>Session label</label>
                        <Input value={docsheetSessionLabel} onChange={(event) => setDocsheetSessionLabel(event.target.value)} placeholder="Budget review round 1" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c2)' }} />
                      </div>

                      {shareRequiresPassword ? (
                        <div className="space-y-2">
                          <label className="text-xs font-semibold" style={{ color: 'var(--ds-c3)' }}>Password</label>
                          <div className="flex items-center gap-2">
                            <Input
                              value={sharePassword}
                              onChange={(event) => setSharePassword(event.target.value.toUpperCase())}
                              style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c2)' }}
                              placeholder={savedRecord?.sharePassword ? '' : 'Save to generate'}
                            />
                            <Button
                              type="button"
                              style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c3)', width: 36, height: 36, borderRadius: 9 }}
                              onClick={() => setSharePassword(createSharePassword())}
                              aria-label="Rotate password"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          </div>
                          <p className="text-xs leading-5" style={{ color: 'var(--ds-c4)' }}>Rotate password any time, then apply share settings.</p>
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-2xl p-4 text-sm" style={{ border: '1px solid var(--ds-s2)', background: 'var(--ds-s4)', color: 'var(--ds-c3)' }}>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--ds-c4)' }}>Share details</p>
                      <p className="mt-3">Last saved: {formatDate(savedRecord?.generatedAt)}</p>
                      <p className="mt-1">Link: {savedRecord?.shareUrl ? 'Ready' : 'Save workbook to generate a governed link'}</p>
                      <p className="mt-1">Status: {savedRecord?.revokedAt ? 'Revoked' : (savedRecord?.shareExpiresAt && new Date(savedRecord.shareExpiresAt).getTime() < Date.now() ? 'Expired' : 'Active')}</p>
                      {savedRecord?.openCount !== undefined ? (
                        <p className="mt-1">Opens: {savedRecord.openCount || 0} • Downloads: {savedRecord.downloadCount || 0} • Edits: {savedRecord.editCount || 0}</p>
                      ) : null}

                      {shareUrl ? (
                        <div className="mt-3 grid gap-2">
                          <Button
                            type="button"
                            className="w-full" style={{ background: 'rgba(59,130,246,0.18)', border: '1px solid rgba(59,130,246,0.35)', color: '#60a5fa' }}
                            onClick={() => window.open(
                              shareRequiresPassword && (savedRecord?.sharePassword || sharePassword)
                                ? `${shareUrl}?password=${encodeURIComponent((savedRecord?.sharePassword || sharePassword).trim().toUpperCase())}`
                                : shareUrl,
                              '_blank',
                              'noopener,noreferrer',
                            )}
                          >
                            <Link2 className="mr-2 h-4 w-4" />
                            Open link
                          </Button>
                          <Button
                            type="button"
                            className="w-full" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c3)'  }}
                            onClick={() => {
                              const urlLine = `Link: ${shareUrl}`;
                              const passwordLine = shareRequiresPassword
                                ? `Password: ${(savedRecord?.sharePassword || sharePassword || '').trim().toUpperCase() || 'Pending'}`
                                : '';
                              const lines = [
                                'Shared with DocSheet',
                                urlLine,
                                ...(passwordLine ? [passwordLine] : []),
                                `Mode: ${docsheetShareMode === 'edit' ? 'Editable session' : 'View only'}`,
                              ];
                              void navigator.clipboard.writeText(lines.join('\n'));
                              setStatusMessage('Share details copied.');
                            }}
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            Copy details
                          </Button>
                        </div>
                      ) : null}
                      <div className="mt-3 grid gap-2">
                        <Button type="button" className="w-full" style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.30)', color: '#34d399' }} onClick={() => void updateShareSettings()} disabled={saving}>
                          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                          Apply share settings
                        </Button>
                        {savedHistoryId ? (
                          <Button type="button" className="w-full" style={{ border: '1px solid rgba(251,113,133,0.25)', background: 'rgba(251,113,133,0.08)', color: 'rgba(251,113,133,0.80)' }} onClick={() => void revokeShareLink()} disabled={saving}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Revoke link
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}

                {studioPanel === 'export' ? (
                  <div className="space-y-3">
                    <Button type="button" variant="outline" className="w-full justify-start" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s4)', color: 'var(--ds-c2)' }} onClick={copyVisualizerPayload} disabled={!activeSheet}>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy for Visualizer
                    </Button>
                    <Button type="button" variant="outline" className="w-full justify-start" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s4)', color: 'var(--ds-c2)' }} onClick={exportCsv} disabled={!activeSheet}>
                      <Download className="mr-2 h-4 w-4" />
                      Export CSV
                    </Button>
                    <Button type="button" variant="outline" className="w-full justify-start" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s4)', color: 'var(--ds-c2)' }} onClick={() => void exportWorkbookXlsx()}>
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                      Download XLSX
                    </Button>
                  </div>
                ) : null}

                {studioPanel === 'history' ? (
                  <div className="space-y-4">
                    {savedWorkbooks.length ? (
                      <div className="space-y-2">
                        {savedWorkbooks.slice(0, 12).map((entry) => (
                          <div key={entry.id} className="ds-card rounded-2xl p-3" style={{ border: '1px solid var(--ds-s2)', background: 'var(--ds-s4)' }}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="ds-text-primary truncate text-sm font-semibold" style={{ color: 'var(--ds-c1)' }}>{entry.templateName}</p>
                                <p className="ds-text-muted mt-1 text-xs" style={{ color: 'var(--ds-c4)' }}>{formatDate(entry.generatedAt)}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button type="button" size="sm" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c2)'  }} onClick={() => loadWorkbook(entry)}>Open</Button>
                                <Button type="button" size="sm" variant="ghost" style={{ color: 'rgba(251,113,133,0.75)' }} onClick={() => void deleteWorkbook(entry.id)} disabled={deletingId === entry.id}>
                                  {deletingId === entry.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl px-4 py-10 text-center text-sm" style={{ border: '1px dashed var(--ds-s1)', background: 'var(--ds-s4)', color: 'var(--ds-c4)' }}>
                        No saved DocSheet workbooks yet. Save once and they will appear here.
                      </div>
                    )}
                  </div>
                ) : null}

                {studioPanel === 'ai' ? (
                  <div className="space-y-4">
                    <div className="ds-card rounded-2xl p-4" style={{ border: '1px solid var(--ds-s2)', background: 'var(--ds-s4)' }}>
                      <p className="text-sm font-semibold" style={{ color: 'var(--ds-c1)' }}>DocSheet AI Studio</p>
                      <p className="mt-2 text-sm leading-6" style={{ color: 'var(--ds-c3)' }}>Ask questions about the active sheet, or tell AI to change the workbook.</p>
                    </div>

                    <Tabs value={aiMode} onValueChange={(value) => setAiMode(value as typeof aiMode)}>
                      <TabsList className="grid w-full grid-cols-2 rounded-2xl p-1" style={{ background: 'var(--ds-s3)' }}>
                        <TabsTrigger value="ask" className="rounded-xl">Ask</TabsTrigger>
                        <TabsTrigger value="change" className="rounded-xl">Make changes</TabsTrigger>
                      </TabsList>

                      <TabsContent value="ask" className="mt-4 space-y-3">
                        <div className="ds-card rounded-2xl p-3" style={{ border: '1px solid var(--ds-s2)', background: 'var(--ds-s4)' }}>
                          <div className="max-h-[320px] space-y-2 overflow-auto pr-1">
                            {docsheetAskMessages.length ? (
                              docsheetAskMessages.slice(-24).map((msg) => (
                                <div key={msg.id} className="rounded-2xl px-3 py-2" style={{ border: msg.role === 'user' ? '1px solid rgba(16,185,129,0.25)' : '1px solid var(--ds-s2)', background: msg.role === 'user' ? 'rgba(16,185,129,0.10)' : 'var(--ds-s4)', color: 'var(--ds-c2)' }}>
                                  <p className="whitespace-pre-wrap text-sm leading-6" style={{ color: 'var(--ds-c2)' }}>{msg.text}</p>
                                  {msg.meta ? <p className="mt-2 text-xs" style={{ color: 'var(--ds-c4)' }}>{msg.meta}</p> : null}
                                  {msg.role === 'assistant' && msg.actionInstruction ? (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      <Button
                                        type="button"
                                        size="sm"
                                        className="h-8 rounded-lg" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c3)' }}
                                        onClick={() => {
                                          setAiMode('change');
                                          setAiInstruction(msg.actionInstruction || '');
                                        }}
                                      >
                                        Turn into change
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        className="h-8 rounded-lg" style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.30)', color: '#34d399' }}
                                        onClick={() => void runDocSheetAi(msg.actionInstruction)}
                                        disabled={aiBusy}
                                      >
                                        Apply as change
                                      </Button>
                                    </div>
                                  ) : null}
                                </div>
                              ))
                            ) : (
                              <div className="rounded-xl px-4 py-8 text-center text-sm" style={{ border: '1px dashed var(--ds-s1)', background: 'var(--ds-s4)', color: 'var(--ds-c4)' }}>
                                Ask something like: “Which rows are at risk?” or “Summarize totals by Status”.
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="ds-card rounded-2xl p-3" style={{ border: '1px solid var(--ds-s2)', background: 'var(--ds-s4)' }}>
                          <label className="text-xs font-semibold" style={{ color: 'var(--ds-c3)' }}>Ask about this sheet</label>
                          <div className="mt-2 flex items-end gap-2">
                            <textarea
                              value={docsheetAskInput}
                              onChange={(event) => setDocsheetAskInput(event.target.value)}
                              className="min-h-[84px] flex-1 resize-none rounded-xl px-3 py-3 text-sm leading-6 outline-none transition" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c2)' }}
                              placeholder="Ask a question. Example: Which owner has the highest Value?"
                            />
                            <Button type="button" className="h-10 rounded-xl" style={{ background: 'rgba(16,185,129,0.18)', border: '1px solid rgba(16,185,129,0.35)', color: '#34d399' }} onClick={() => void askDocSheet()} disabled={docsheetAskBusy || !docsheetAskInput.trim()}>
                              {docsheetAskBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                              Ask
                            </Button>
                          </div>
                          <p className="mt-2 text-xs" style={{ color: 'var(--ds-c4)' }}>Answers are grounded in the active sheet extract (first rows). Use “Apply as change” when you want edits.</p>
                        </div>
                      </TabsContent>

                      <TabsContent value="change" className="mt-4 space-y-3">
                        {activeSheet ? (
                          <div className="ds-card rounded-2xl p-4" style={{ border: '1px solid var(--ds-s2)', background: 'var(--ds-s4)' }}>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--ds-c4)' }}>Formula Coach</p>
                            <p className="mt-2 text-sm leading-6" style={{ color: 'var(--ds-c3)' }}>One-click prompts that add the formulas most teams need.</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {formulaCoachPrompts.map((prompt) => (
                                <button
                                  key={prompt}
                                  type="button"
                                  className="rounded-full px-3 py-2 text-xs transition" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c3)' }}
                                  onClick={() => setAiInstruction(prompt)}
                                >
                                  {prompt}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        <textarea
                          value={aiInstruction}
                          onChange={(event) => setAiInstruction(event.target.value)}
                          className="min-h-[160px] w-full rounded-2xl px-4 py-4 text-sm leading-7 outline-none transition" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c2)' }}
                          placeholder="Example: Add a new sheet called Summary, group totals by Status, and flag any Value below 100 as At Risk."
                        />
                        <Button type="button" className="w-full" style={{ background: 'rgba(16,185,129,0.18)', border: '1px solid rgba(16,185,129,0.35)', color: '#34d399' }} onClick={() => void runDocSheetAi()} disabled={aiBusy}>
                          {aiBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BrainCircuit className="mr-2 h-4 w-4" />}
                          {aiBusy ? 'Running...' : 'Apply changes with AI'}
                        </Button>
                        {aiSummary ? (
                          <div className="rounded-2xl p-4 text-sm" style={{ border: '1px solid var(--ds-s2)', background: 'var(--ds-s4)', color: 'var(--ds-c3)' }}>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--ds-c4)' }}>Summary</p>
                            <p className="mt-2 whitespace-pre-wrap leading-6" style={{ color: 'var(--ds-c2)' }}>{aiSummary}</p>
                            {aiNextSteps.length ? (
                              <div className="mt-3 space-y-1 text-xs" style={{ color: 'var(--ds-c4)' }}>
                                {aiNextSteps.slice(0, 6).map((step) => <p key={step}>• {step}</p>)}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </TabsContent>
                    </Tabs>
                  </div>
                ) : null}

                {studioPanel === 'insights' ? (
                  <div className="space-y-4">
                    <Button type="button" variant="outline" className="w-full justify-start" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s4)', color: 'var(--ds-c2)' }} onClick={() => void runVisualization()} disabled={visualLoading || !activeSheet}>
                      {visualLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BarChart3 className="mr-2 h-4 w-4" />}
                      Refresh insights
                    </Button>
                    {visualError ? <div className="rounded-xl px-4 py-3 text-sm" style={{ border: '1px solid rgba(251,113,133,0.25)', background: 'rgba(251,113,133,0.10)', color: 'rgba(251,113,133,0.90)' }}>{visualError}</div> : null}
                    {visualMessage ? <div className="rounded-xl px-4 py-3 text-sm" style={{ border: '1px solid rgba(16,185,129,0.25)', background: 'rgba(16,185,129,0.10)', color: '#34d399' }}>{visualMessage}</div> : null}
                    {visualResult ? (
                      <div className="space-y-4">
                        {visualResult.keyMetrics?.length ? (
                          <div className="grid gap-3">
                            {visualResult.keyMetrics.slice(0, 6).map((metric, index) => <MetricCard key={`${metric.label}-${index}`} metric={metric} />)}
                          </div>
                        ) : null}
                        {visualResult.deepInsights?.length ? (
                          <div className="grid gap-3">
                            {visualResult.deepInsights.slice(0, 6).map((insight) => <DeepInsightCard key={insight.id} insight={insight} />)}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="rounded-2xl px-4 py-10 text-center text-sm" style={{ border: '1px dashed var(--ds-s1)', background: 'var(--ds-s4)', color: 'var(--ds-c4)' }}>
                        Run insights to generate charts and deep notes for this sheet.
                      </div>
                    )}
                  </div>
                ) : null}

                {studioPanel === 'smart' ? (
                  <div className="space-y-4">
                    <div className="ds-card rounded-2xl p-4" style={{ border: '1px solid var(--ds-s2)', background: 'var(--ds-s4)' }}>
                      <p className="text-sm font-semibold" style={{ color: 'var(--ds-c1)' }}>Smart Sheets</p>
                      <p className="mt-2 text-sm leading-6" style={{ color: 'var(--ds-c3)' }}>Apply templates or formula packs to get started faster.</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold" style={{ color: 'var(--ds-c3)' }}>Templates</label>
                      <Select onValueChange={(value) => value && applyTemplate(value)}>
                        <SelectTrigger style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c2)' }}>
                          <SelectValue placeholder="Select a template" />
                        </SelectTrigger>
                        <SelectContent>
                          {smartTemplates.map((template) => (
                            <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold" style={{ color: 'var(--ds-c3)' }}>Formula packs</label>
                      <Select
                        onValueChange={(value) => {
                          applyFormulaPack(value);
                        }}
                      >
                        <SelectTrigger style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c2)' }}>
                          <SelectValue placeholder="Apply a formula pack" />
                        </SelectTrigger>
                        <SelectContent>
                          {formulaPacks.map((pack) => (
                            <SelectItem key={pack.id} value={pack.id}>{pack.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : null}

                {studioPanel === 'formatting' ? (
                  <div className="space-y-4">
                    <div className="ds-card rounded-2xl p-4" style={{ border: '1px solid var(--ds-s2)', background: 'var(--ds-s4)' }}>
                      <p className="text-sm font-semibold" style={{ color: 'var(--ds-c1)' }}>Conditional formatting</p>
                      <p className="mt-2 text-sm leading-6" style={{ color: 'var(--ds-c3)' }}>Highlight cells automatically based on simple rules.</p>
                    </div>

                    {activeSheet?.conditionalRules?.length ? (
                      <div className="space-y-2">
                        {activeSheet.conditionalRules.map((rule) => {
                          const columnIndex = activeSheet.columns.findIndex((col) => col.id === rule.columnId);
                          const columnLabel = columnIndex >= 0 ? getDocSheetColumnLetter(columnIndex) : 'Column';
                          return (
                            <div key={rule.id} className="ds-card rounded-2xl p-3" style={{ border: '1px solid var(--ds-s2)', background: 'var(--ds-s4)' }}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold" style={{ color: 'var(--ds-c1)' }}>{columnLabel} {rule.op} {rule.value}</p>
                                  <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: 'var(--ds-c3)' }}>
                                    <span className="h-3 w-3 rounded-full" style={{ border: '1px solid var(--ds-s1)', backgroundColor: rule.style?.bg || '#FEF3C7' }} />
                                    <span className="truncate" style={{ color: 'var(--ds-c3)' }}>{rule.enabled === false ? 'Disabled' : 'Enabled'}</span>
                                  </div>
                                </div>
                                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-xl" style={{ color: 'rgba(251,113,133,0.75)' }} onClick={() => deleteConditionalRule(rule.id)} aria-label="Delete rule">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-2xl px-4 py-10 text-center text-sm" style={{ border: '1px dashed var(--ds-s1)', background: 'var(--ds-s4)', color: 'var(--ds-c4)' }}>
                        No rules yet. Add one to start highlighting cells.
                      </div>
                    )}

                    <Button
                      type="button"
                      className="w-full" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c3)' }}
                      onClick={() => {
                        setRulesDraftOpen((current) => !current);
                        if (!ruleDraft.columnId && activeSheet?.columns?.[0]?.id) {
                          setRuleDraft((current) => ({ ...current, columnId: activeSheet.columns[0].id }));
                        }
                      }}
                      disabled={!activeSheet}
                    >
                      {rulesDraftOpen ? 'Hide rule builder' : 'Add a rule'}
                    </Button>

                    {rulesDraftOpen && activeSheet ? (
                      <div className="ds-card space-y-3 rounded-2xl p-4" style={{ border: '1px solid var(--ds-s2)', background: 'var(--ds-s4)' }}>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold" style={{ color: 'var(--ds-c3)' }}>Column</label>
                          <Select value={ruleDraft.columnId || activeSheet.columns[0]?.id || ''} onValueChange={(value) => setRuleDraft((current) => ({ ...current, columnId: value }))}>
                            <SelectTrigger style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c2)' }}>
                              <SelectValue placeholder="Select a column" />
                            </SelectTrigger>
                            <SelectContent>
                              {activeSheet.columns.map((col, idx) => (
                                <SelectItem key={col.id} value={col.id}>{getDocSheetColumnLetter(idx)} · {col.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <label className="text-xs font-semibold" style={{ color: 'var(--ds-c3)' }}>Operator</label>
                            <Select value={ruleDraft.op} onValueChange={(value) => setRuleDraft((current) => ({ ...current, op: value as any }))}>
                              <SelectTrigger style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c2)' }}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="contains">Contains</SelectItem>
                                <SelectItem value="equals">Equals</SelectItem>
                                <SelectItem value="gt">{'>'}</SelectItem>
                                <SelectItem value="gte">{'>='}</SelectItem>
                                <SelectItem value="lt">{'<'}</SelectItem>
                                <SelectItem value="lte">{'<='}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-semibold" style={{ color: 'var(--ds-c3)' }}>Value</label>
                            <Input value={ruleDraft.value} onChange={(event) => setRuleDraft((current) => ({ ...current, value: event.target.value }))} placeholder="Example: 100" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c2)' }} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <label className="text-xs font-semibold" style={{ color: 'var(--ds-c3)' }}>Background</label>
                            <Input value={ruleDraft.bg} onChange={(event) => setRuleDraft((current) => ({ ...current, bg: event.target.value }))} placeholder="#FEF3C7" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c2)' }} />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-semibold" style={{ color: 'var(--ds-c3)' }}>Text</label>
                            <Input value={ruleDraft.text} onChange={(event) => setRuleDraft((current) => ({ ...current, text: event.target.value }))} placeholder="#92400E" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c2)' }} />
                          </div>
                        </div>
                        <Button
                          type="button"
                          style={{ background: 'rgba(16,185,129,0.18)', border: '1px solid rgba(16,185,129,0.35)', color: '#34d399', borderRadius: 9, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}
                          onClick={() => {
                            if (!ruleDraft.columnId || !ruleDraft.value.trim()) {
                              setErrorMessage('Pick a column and enter a rule value.');
                              return;
                            }
                            addConditionalRule({
                              id: `docsheet-rule-${Date.now()}`,
                              columnId: ruleDraft.columnId,
                              op: ruleDraft.op,
                              value: ruleDraft.value.trim(),
                              style: { bg: ruleDraft.bg.trim() || undefined, text: ruleDraft.text.trim() || undefined },
                              enabled: true,
                            } as any);
                            setRuleDraft((current) => ({ ...current, value: '' }));
                          }}
                        >
                          Add rule
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {studioPanel === 'comments' ? (
                  <div className="space-y-4">
                    <div className="ds-card rounded-2xl p-4" style={{ border: '1px solid var(--ds-s2)', background: 'var(--ds-s4)' }}>
                      <p className="text-sm font-semibold" style={{ color: 'var(--ds-c1)' }}>Comments</p>
                      <p className="mt-2 text-sm leading-6" style={{ color: 'var(--ds-c3)' }}>
                        {selectedCell ? `Cell ${selectedCellRef || ''}` : 'Select a cell to view or add comments.'}
                      </p>
                    </div>

                    {activeSheet && selectedCell ? (
                      <>
                        <div className="space-y-2">
                          {(activeSheet.cellComments?.[getCellKey(selectedCell.rowId, selectedCell.columnId)] || []).length ? (
                            (activeSheet.cellComments?.[getCellKey(selectedCell.rowId, selectedCell.columnId)] || []).slice(-12).map((comment) => (
                              <div key={comment.id} className="ds-card rounded-2xl p-3" style={{ border: '1px solid var(--ds-s2)', background: 'var(--ds-s4)' }}>
                                <p className="text-sm" style={{ color: 'var(--ds-c2)' }}>{comment.text}</p>
                                <p className="mt-2 text-xs" style={{ color: 'var(--ds-c4)' }}>{new Date(comment.createdAt).toLocaleString()}</p>
                              </div>
                            ))
                          ) : (
                            <div className="rounded-2xl px-4 py-10 text-center text-sm" style={{ border: '1px dashed var(--ds-s1)', background: 'var(--ds-s4)', color: 'var(--ds-c4)' }}>
                              No comments yet for this cell.
                            </div>
                          )}
                        </div>

                        <div className="ds-card space-y-2 rounded-2xl p-4" style={{ border: '1px solid var(--ds-s2)', background: 'var(--ds-s4)' }}>
                          <label className="text-xs font-semibold" style={{ color: 'var(--ds-c3)' }}>Add a comment</label>
                          <textarea
                            value={commentDraft}
                            onChange={(event) => setCommentDraft(event.target.value)}
                            className="min-h-[110px] w-full rounded-xl px-3 py-3 text-sm outline-none transition" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c2)' }}
                            placeholder="Write a comment for this cell"
                          />
                          <Button
                            type="button"
                            style={{ background: 'rgba(16,185,129,0.18)', border: '1px solid rgba(16,185,129,0.35)', color: '#34d399', borderRadius: 9, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}
                            onClick={() => {
                              if (!commentDraft.trim()) return;
                              addCommentToSelectedCell(commentDraft.trim());
                              setCommentDraft('');
                            }}
                          >
                            Add comment
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-2xl px-4 py-10 text-center text-sm" style={{ border: '1px dashed var(--ds-s1)', background: 'var(--ds-s4)', color: 'var(--ds-c4)' }}>
                        Select a cell, then open Comments again.
                      </div>
                    )}
                  </div>
                ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* ── Floating AI Assistant ── */}
        <div className="fixed bottom-[68px] right-4 z-[70] sm:bottom-6 sm:right-6 flex flex-col items-end gap-3">
          {aiFloatOpen && (
            <div className="ds-ai-float w-[min(360px,calc(100vw-32px))] rounded-2xl overflow-hidden backdrop-blur-xl" style={{ background: 'var(--ds-bg)', border: '1px solid var(--ds-s1)', boxShadow: '0 24px 56px rgba(0,0,0,0.65)' }}>
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--ds-s2)' }}>
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: 'rgba(16,185,129,0.18)', border: '1px solid rgba(16,185,129,0.30)' }}>
                    <BrainCircuit className="h-4 w-4" style={{ color: '#34d399' }} />
                  </div>
                  <span className="text-sm font-semibold" style={{ color: 'var(--ds-c1)' }}>DocSheet AI</span>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', color: '#34d399' }}>Smart</span>
                </div>
                <button type="button" className="h-7 w-7 flex items-center justify-center rounded-lg" style={{ color: 'var(--ds-c4)', background: 'var(--ds-s3)' }} onClick={() => setAiFloatOpen(false)}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex" style={{ borderBottom: '1px solid var(--ds-s2)' }}>
                {(['ask', 'change'] as const).map((mode) => (
                  <button key={mode} type="button"
                    className="flex-1 py-2.5 text-xs font-medium transition"
                    style={{ color: aiMode === mode ? '#34d399' : 'var(--ds-c4)', borderBottom: aiMode === mode ? '2px solid #34d399' : '2px solid transparent', background: 'transparent' }}
                    onClick={() => setAiMode(mode)}
                  >
                    {mode === 'ask' ? '💬 Ask' : '✨ Edit Sheet'}
                  </button>
                ))}
              </div>
              {aiMode === 'ask' && (
                <div className="p-3 space-y-2">
                  <div className="max-h-[200px] overflow-auto space-y-2">
                    {docsheetAskMessages.length === 0 ? (
                      <p className="text-center py-4 text-xs" style={{ color: 'var(--ds-c4)' }}>Ask anything about your sheet — totals, trends, missing data…</p>
                    ) : docsheetAskMessages.slice(-12).map((msg) => (
                      <div key={msg.id} className="rounded-xl px-3 py-2 text-xs leading-5"
                        style={{ background: msg.role === 'user' ? 'rgba(16,185,129,0.10)' : 'var(--ds-s4)', border: `1px solid ${msg.role === 'user' ? 'rgba(16,185,129,0.20)' : 'var(--ds-s2)'}`, color: 'var(--ds-c2)' }}>
                        {msg.text}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-end gap-2">
                    <textarea value={docsheetAskInput} onChange={(e) => setDocsheetAskInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void askDocSheet(); } }}
                      className="flex-1 resize-none rounded-xl px-3 py-2.5 text-xs leading-5 outline-none"
                      style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c1)', minHeight: 56 }}
                      placeholder="Ask… (Enter to send)" rows={2} />
                    <button type="button" className="h-9 w-9 flex items-center justify-center rounded-xl shrink-0 transition"
                      style={{ background: docsheetAskBusy || !docsheetAskInput.trim() ? 'var(--ds-s3)' : 'rgba(16,185,129,0.20)', border: '1px solid rgba(16,185,129,0.35)', color: '#34d399' }}
                      disabled={docsheetAskBusy || !docsheetAskInput.trim()} onClick={() => void askDocSheet()}>
                      {docsheetAskBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}
              {aiMode === 'change' && (
                <div className="p-3 space-y-2">
                  {activeSheet && (
                    <div className="flex flex-wrap gap-1.5">
                      {formulaCoachPrompts.slice(0, 4).map((prompt) => (
                        <button key={prompt} type="button" className="rounded-full px-2.5 py-1 text-[10px] transition"
                          style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c3)' }}
                          onClick={() => setAiInstruction(prompt)}>{prompt}</button>
                      ))}
                    </div>
                  )}
                  <textarea value={aiInstruction} onChange={(e) => setAiInstruction(e.target.value)}
                    className="w-full resize-none rounded-xl px-3 py-2.5 text-xs leading-5 outline-none"
                    style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-s3)', color: 'var(--ds-c1)', minHeight: 72 }}
                    placeholder="e.g. Add a SUM row at the bottom and flag values below 100…" rows={3} />
                  <button type="button" className="w-full flex items-center justify-center gap-2 h-9 rounded-xl text-xs font-semibold"
                    style={{ background: aiBusy ? 'var(--ds-s3)' : 'rgba(16,185,129,0.18)', border: '1px solid rgba(16,185,129,0.35)', color: '#34d399' }}
                    disabled={aiBusy || !aiInstruction.trim()} onClick={() => void runDocSheetAi()}>
                    {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BrainCircuit className="h-3.5 w-3.5" />}
                    {aiBusy ? 'Processing…' : 'Apply with AI'}
                  </button>
                  {aiSummary ? (
                    <p className="text-[11px] leading-5 rounded-xl px-3 py-2" style={{ color: '#34d399', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.18)' }}>{aiSummary}</p>
                  ) : null}
                </div>
              )}
            </div>
          )}
          <button type="button" onClick={() => setAiFloatOpen((v) => !v)}
            className="ds-ai-float-fab h-12 w-12 rounded-full flex items-center justify-center transition-all active:scale-95"
            style={{ background: aiFloatOpen ? 'rgba(239,68,68,0.85)' : '#10b981', boxShadow: '0 4px 22px rgba(16,185,129,0.42)', border: '1px solid var(--ds-s1)' }}
            data-open={aiFloatOpen ? '' : undefined}
            title={aiFloatOpen ? 'Close AI assistant' : 'Ask AI — DocSheet assistant'}>
            {aiFloatOpen ? <X className="h-5 w-5 text-white" /> : <Search className="h-5 w-5 text-white" />}
          </button>
        </div>

        <div className="ds-tabs-bar sticky bottom-0 z-30 backdrop-blur-xl" style={{ borderTop: '1px solid var(--ds-s2)', background: 'var(--ds-bg)' }}>
          <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-lg" style={{ color: 'var(--ds-c3)' }} onClick={addSheet} aria-label="Add sheet">
              <Plus className="h-4 w-4" />
            </Button>
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
              {workbook.sheets.map((sheet) => (
                <button
                  key={sheet.id}
                  type="button"
                  onClick={() => setActiveSheetId(sheet.id)}
                  onDoubleClick={() => {
                    const nextName = window.prompt('Rename sheet', sheet.name);
                    if (!nextName || !nextName.trim()) return;
                    updateSheet(sheet.id, (current) => ({ ...current, name: nextName.trim() }));
                    setStatusMessage('Sheet renamed.');
                  }}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition ${sheet.id === activeSheetId ? 'ds-tab-active text-emerald-300' : 'ds-tab-inactive text-[var(--ds-c3)] hover:text-white'}`} style={{ background: sheet.id === activeSheetId ? 'rgba(16,185,129,0.18)' : 'var(--ds-s3)', border: sheet.id === activeSheetId ? '1px solid rgba(16,185,129,0.35)' : '1px solid var(--ds-s2)' }}
                >
                  {sheet.name}
                </button>
              ))}
            </div>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-lg" style={{ color: 'var(--ds-c4)' }} onClick={removeActiveSheet} disabled={workbook.sheets.length <= 1} aria-label="Delete active sheet">
              <Trash2 className="h-4 w-4" />
            </Button>
            <div className="relative">
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-lg" style={{ color: 'var(--ds-c4)' }} onClick={() => setSheetMenuOpen((current) => !current)} aria-label="Sheet actions">
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
              {sheetMenuOpen ? (
                <div className="absolute bottom-[calc(100%+10px)] right-0 z-50 w-56 rounded-xl p-1 backdrop-blur-xl" style={{ border: '1px solid var(--ds-s1)', background: 'var(--ds-bg)', boxShadow: '0 18px 40px rgba(0,0,0,0.55)' }}>
                  <button type="button" className="ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => { renameActiveSheet(); setSheetMenuOpen(false); }}>
                    Rename sheet
                  </button>
                  <button type="button" className="ds-menu-item w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--ds-c2)' }} onMouseEnter={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='var(--ds-s2)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} onClick={() => { duplicateActiveSheet(); setSheetMenuOpen(false); }}>
                    Duplicate sheet
                  </button>
                  <div className="ds-separator my-1 h-px" style={{ background: 'var(--ds-s2)' }} />
                  <button type="button" className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${workbook.sheets.length <= 1 ? 'cursor-not-allowed opacity-30' : ''}`} style={{ color: workbook.sheets.length > 1 ? 'rgba(251,113,133,0.85)' : 'var(--ds-c5)' }} onMouseEnter={(e)=>{if(workbook.sheets.length>1)(e.currentTarget as HTMLButtonElement).style.background='rgba(251,113,133,0.08)'}} onMouseLeave={(e)=>{(e.currentTarget as HTMLButtonElement).style.background='transparent'}} disabled={workbook.sheets.length <= 1} onClick={() => { removeActiveSheet(); setSheetMenuOpen(false); }}>
                    Delete sheet
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── dark-glass badge used in module layout ── */
  const libBadge: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    borderRadius: 999, border: '1px solid var(--ds-s1)',
    background: 'var(--ds-s3)',
    padding: '3px 9px',
    fontSize: 10.5, fontWeight: 500, color: 'var(--ds-c4)',
    whiteSpace: 'nowrap',
  };
  const libBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    height: 30, borderRadius: 9, border: '1px solid var(--ds-s1)',
    background: 'var(--ds-s3)', color: 'var(--ds-c3)',
    fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'background 0.15s',
    gap: 5,
  };
  const libIconBtn: React.CSSProperties = { ...libBtn, width: 30, padding: 0 };

  if (layout === 'module') {
    return (
      <div style={{ height: '100%', overflowY: 'auto', padding: '20px 24px 32px', scrollbarWidth: 'none' }}>

        {/* ── Header row ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.2 }}>Saved Workbooks</p>
            <p style={{ fontSize: 11, color: 'var(--ds-c4)', marginTop: 3, letterSpacing: '0.01em' }}>Governed share sessions &amp; workbooks</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button type="button" style={{ ...libBtn, paddingInline: 12 }} onClick={onHistoryRefresh}>
              <RefreshCw style={{ width: 13, height: 13 }} /> Refresh
            </button>
            <Link href="/docsheet" style={{ ...libBtn, paddingInline: 12, textDecoration: 'none', background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.22)', color: '#34d399' }}>
              <FileSpreadsheet style={{ width: 13, height: 13 }} /> Open Studio
            </Link>
          </div>
        </div>

        {/* ── Search + pagination row ── */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            value={libraryQuery}
            onChange={(e) => setLibraryQuery(e.target.value)}
            placeholder="Search workbooks, sheets, categories…"
            style={{
              flex: 1, minWidth: 180, height: 36, borderRadius: 10,
              border: '1px solid var(--ds-s1)',
              background: 'var(--ds-s3)',
              color: '#fff', fontSize: 12.5, padding: '0 12px',
              outline: 'none',
            }}
          />
          <span style={{ fontSize: 11, color: 'var(--ds-c5)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {filteredWorkbooks.length ? `${filteredWorkbooks.length} workbook${filteredWorkbooks.length !== 1 ? 's' : ''}` : 'No workbooks'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button type="button" style={{ ...libBtn, paddingInline: 10, opacity: libraryPage <= 1 ? 0.35 : 1 }} disabled={libraryPage <= 1}
              onClick={() => setLibraryPage((p) => Math.max(1, p - 1))}>Prev</button>
            <span style={{ fontSize: 11, color: 'var(--ds-c5)', minWidth: 64, textAlign: 'center' }}>
              {libraryPage} / {libraryTotalPages}
            </span>
            <button type="button" style={{ ...libBtn, paddingInline: 10, opacity: libraryPage >= libraryTotalPages ? 0.35 : 1 }} disabled={libraryPage >= libraryTotalPages}
              onClick={() => setLibraryPage((p) => Math.min(libraryTotalPages, p + 1))}>Next</button>
          </div>
        </div>

        {/* ── Status / error banners ── */}
        {statusMessage && (
          <div style={{ marginBottom: 12, borderRadius: 10, border: '1px solid rgba(52,211,153,0.22)', background: 'rgba(52,211,153,0.08)', padding: '10px 14px', fontSize: 12, color: '#6ee7b7' }}>
            {statusMessage}
          </div>
        )}
        {errorMessage && (
          <div style={{ marginBottom: 12, borderRadius: 10, border: '1px solid rgba(239,68,68,0.22)', background: 'rgba(239,68,68,0.08)', padding: '10px 14px', fontSize: 12, color: '#fca5a5' }}>
            {errorMessage}
          </div>
        )}

        {/* ── Workbook list ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pagedWorkbooks.length ? (
            pagedWorkbooks.map((entry) => {
              const extracted = extractWorkbookFromHistory(entry);
              const openHref = `/docsheet?workbook=${encodeURIComponent(entry.id)}`;
              const shareHref = entry.shareUrl ?? '';
              const shareAbsolute = shareHref ? buildAbsoluteAppUrl(shareHref, window.location.origin) : '';
              const shareMode = entry.docsheetShareMode || (entry.recipientAccess === 'edit' ? 'edit' : 'view');
              const expiresAt = entry.shareExpiresAt ? new Date(entry.shareExpiresAt) : null;
              const expiresLabel = expiresAt && Number.isFinite(expiresAt.getTime()) ? expiresAt.toLocaleDateString() : '';

              return (
                <div key={entry.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '150px 1fr auto',
                  gap: 14,
                  alignItems: 'center',
                  borderRadius: 16,
                  border: '1px solid var(--ds-s2)',
                  background: 'var(--ds-s4)',
                  padding: '14px 16px 14px 14px',
                }}>
                  {/* Thumbnail */}
                  <button type="button" style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    onClick={() => window.open(openHref, '_blank', 'noopener,noreferrer')}
                    aria-label={`Open ${extracted?.title || entry.templateName}`}>
                    <DocSheetThumbnail workbook={extracted} />
                  </button>

                  {/* Details */}
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#fff', letterSpacing: '-0.015em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {extracted?.title || entry.templateName}
                    </p>
                    <p style={{ marginTop: 4, fontSize: 11, color: 'var(--ds-c5)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span>{extracted?.sheets?.length ?? 0} sheet{(extracted?.sheets?.length ?? 0) !== 1 ? 's' : ''}</span>
                      <span style={{ opacity: 0.4 }}>·</span>
                      <span>{formatDate(entry.generatedAt)}</span>
                    </p>
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      <span style={libBadge}>
                        {shareMode === 'edit' ? <PencilLine style={{ width: 11, height: 11 }} /> : <Eye style={{ width: 11, height: 11 }} />}
                        {shareMode === 'edit' ? 'Editable' : 'View only'}
                      </span>
                      {entry.shareUrl && <span style={libBadge}><Link2 style={{ width: 11, height: 11 }} />Link ready</span>}
                      {entry.shareRequiresPassword && <span style={libBadge}><KeyRound style={{ width: 11, height: 11 }} />Password</span>}
                      {entry.shareAccessPolicy === 'one_time' && <span style={libBadge}><Clock style={{ width: 11, height: 11 }} />One-time</span>}
                      {entry.shareAccessPolicy === 'expiring' && expiresLabel && (
                        <span style={libBadge}><Clock style={{ width: 11, height: 11 }} />Expires {expiresLabel}</span>
                      )}
                      {entry.docsheetSharedWithEmail && (
                        <span style={libBadge}><Mail style={{ width: 11, height: 11 }} />{entry.docsheetSharedWithEmail}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <Link href={openHref} target="_blank" rel="noreferrer"
                      style={{ ...libBtn, paddingInline: 12, textDecoration: 'none' }}>
                      Open
                    </Link>
                    {shareAbsolute && (
                      <button type="button" style={libIconBtn} onClick={() => window.open(shareAbsolute, '_blank', 'noopener,noreferrer')} aria-label="Open share link">
                        <Link2 style={{ width: 13, height: 13 }} />
                      </button>
                    )}
                    {shareAbsolute && (
                      <button type="button" style={libIconBtn} onClick={() => void navigator.clipboard.writeText(shareAbsolute)} aria-label="Copy share link">
                        <Copy style={{ width: 13, height: 13 }} />
                      </button>
                    )}
                    <button type="button"
                      style={{ ...libIconBtn, color: 'rgba(239,68,68,0.65)', borderColor: 'rgba(239,68,68,0.18)', background: 'rgba(239,68,68,0.06)' }}
                      onClick={() => void deleteWorkbook(entry.id)}
                      disabled={deletingId === entry.id}
                      aria-label="Delete workbook">
                      {deletingId === entry.id ? <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> : <Trash2 style={{ width: 13, height: 13 }} />}
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{
              borderRadius: 14, border: '1px dashed var(--ds-s1)',
              background: 'var(--ds-s4)',
              padding: '40px 24px', textAlign: 'center',
              fontSize: 12, color: 'var(--ds-c5)', lineHeight: 1.6,
            }}>
              No workbooks saved yet.<br />Create one in the Studio, save it, and it will appear here.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={pageShellClassName}>
      <Card className="border-white/60 bg-white/84 shadow-[0_18px_40px_rgba(15,23,42,0.06)] backdrop-blur">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-sky-900">
              <Sheet className="h-3.5 w-3.5" />
              DocSheet
            </div>
            <CardTitle className="text-2xl font-medium tracking-[-0.03em] text-slate-950">{layout === 'page' ? 'DocSheet Studio' : 'Governed spreadsheets inside docrud'}</CardTitle>
            <p className="max-w-3xl text-sm leading-6 text-slate-600">
              Spreadsheet workspace with governed saves, sharing, exports, and AI insights.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(event) => void importWorkbook(event)}
            />
            {layout !== 'page' ? (
              <Button type="button" variant="outline" asChild>
                <Link href="/docsheet">
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Open Full Studio
                </Link>
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={createNewWorkbook}>
              <RefreshCw className="mr-2 h-4 w-4" />
              New Workbook
            </Button>
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing}>
              {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {importing ? 'Importing...' : 'Upload Sheet'}
            </Button>
            <Button type="button" onClick={saveWorkbook} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Saving...' : savedHistoryId ? 'Update Workbook' : 'Save Workbook'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {statusMessage ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{statusMessage}</div> : null}
          {errorMessage ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</div> : null}

          <Tabs value={topTab} onValueChange={(value) => setTopTab(value as typeof topTab)} className="w-full">
            <TabsList className="grid w-full grid-cols-3 rounded-2xl bg-slate-100 p-1">
              <TabsTrigger value="workbook" className="rounded-xl">Workbook</TabsTrigger>
              <TabsTrigger value="share" className="rounded-xl">Share</TabsTrigger>
              <TabsTrigger value="export" className="rounded-xl">Export</TabsTrigger>
            </TabsList>

            <TabsContent value="workbook" className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="docsheet-title" className="text-sm font-medium text-slate-700">Workbook title</label>
                  <Input id="docsheet-title" value={workbook.title} onChange={(event) => setWorkbook((current) => ({ ...current, title: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <label htmlFor="docsheet-currency" className="text-sm font-medium text-slate-700">Currency code</label>
                  <Input id="docsheet-currency" value={workbook.currencyCode || 'INR'} onChange={(event) => setWorkbook((current) => ({ ...current, currencyCode: event.target.value.toUpperCase() }))} />
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="docsheet-description" className="text-sm font-medium text-slate-700">Notes</label>
                <textarea
                  id="docsheet-description"
                  className="min-h-[88px] w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  value={workbook.description || ''}
                  onChange={(event) => setWorkbook((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Short notes for teammates."
                />
              </div>
            </TabsContent>

            <TabsContent value="share" className="mt-4 space-y-4">
              <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="grid gap-4 rounded-[1.2rem] border border-slate-200 bg-slate-50/90 p-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Share mode</label>
                    <Select value={docsheetShareMode} onValueChange={(value) => setDocsheetShareMode(value as 'view' | 'edit')}>
                      <SelectTrigger className="bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="view">View only</SelectItem>
                        <SelectItem value="edit">Editable session</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Expiry days</label>
                    <Input value={docsheetExpiryDays} onChange={(event) => setDocsheetExpiryDays(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Shared with</label>
                    <Input value={docsheetSharedWithEmail} onChange={(event) => setDocsheetSharedWithEmail(event.target.value)} placeholder="recipient@company.com" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Session label</label>
                    <Input value={docsheetSessionLabel} onChange={(event) => setDocsheetSessionLabel(event.target.value)} placeholder="Budget review round 1" />
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                  <p className="font-medium text-slate-900">Saved state</p>
                  <p className="mt-2">Last saved: {formatDate(savedRecord?.generatedAt)}</p>
                  <p className="mt-1">Share link: {savedRecord?.shareUrl ? 'Ready' : 'Save workbook to generate a governed link'}</p>
                  {savedRecord ? (
                    <>
                      <p className="mt-1">Opens: {savedRecord.openCount || 0} • Downloads: {savedRecord.downloadCount || 0} • Edits: {savedRecord.editCount || 0}</p>
                      <p className="mt-1">Session: {savedRecord.docsheetSessionStatus || 'active'}</p>
                    </>
                  ) : null}
                  {shareUrl ? (
                    <Button type="button" variant="ghost" size="sm" className="mt-2 px-0 text-sky-700 hover:bg-transparent hover:text-sky-900" onClick={() => navigator.clipboard.writeText(shareUrl)}>
                      <Link2 className="mr-2 h-4 w-4" />
                      Copy share link
                    </Button>
                  ) : null}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="export" className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Button type="button" variant="outline" onClick={copyVisualizerPayload} disabled={!activeSheet}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy for Visualizer
                </Button>
                <Button type="button" variant="outline" onClick={exportCsv} disabled={!activeSheet}>
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
                <Button type="button" variant="outline" onClick={() => void exportWorkbookXlsx()}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Download XLSX
                </Button>
              </div>
              <p className="text-xs leading-5 text-slate-500">
                Exports use computed cell values (formulas) so the downloaded sheet matches what you see in the grid.
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className={gridShellClassName}>
        <Card className="min-w-0 border-white/60 bg-white/84 shadow-[0_18px_40px_rgba(15,23,42,0.06)] backdrop-blur">
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <CardTitle className="text-xl font-medium tracking-[-0.02em]">Workbook editor</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={duplicateSheet} disabled={!activeSheet}>
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicate
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={addSheet}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Sheet
                </Button>
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="w-full">
              <TabsList className="grid w-full grid-cols-2 rounded-2xl bg-slate-100 p-1 md:grid-cols-5">
                <TabsTrigger value="editor" className="rounded-xl">Editor</TabsTrigger>
                <TabsTrigger value="insights" className="rounded-xl">Insights</TabsTrigger>
                <TabsTrigger value="ai" className="rounded-xl">AI Studio</TabsTrigger>
                <TabsTrigger value="smart" className="rounded-xl">Smart Sheets</TabsTrigger>
                <TabsTrigger value="saved" className="rounded-xl">Saved Sheets</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-wrap gap-2">
              {workbook.sheets.map((sheet) => (
                <button
                  key={sheet.id}
                  type="button"
                  onClick={() => setActiveSheetId(sheet.id)}
                  className={`rounded-full border px-4 py-2 text-sm transition ${sheet.id === activeSheetId ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'}`}
                >
                  {sheet.name}
                </button>
              ))}
            </div>
            {activeSheet ? (
              <div className="space-y-3 rounded-[1.2rem] border border-slate-200 bg-slate-50/90 p-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[170px] flex-1 space-y-2">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Active sheet</label>
                    <Input value={activeSheet.name} onChange={(event) => updateSheet(activeSheet.id, (sheet) => ({ ...sheet, name: event.target.value }))} />
                  </div>
                  <div className="min-w-[240px] flex-[1.6] space-y-2">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Formula bar</label>
                    <Input
                      value={selectedCell ? selectedCellRawValue : ''}
                      onChange={(event) => updateSelectedCellRawValue(event.target.value)}
                      placeholder={selectedCell ? 'Edit selected cell value or formula like =SUM(C1:C10)' : 'Select a cell to edit formulas and values'}
                      disabled={!selectedCell}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={addColumn} disabled={!activeSheet}>
                      <Plus className="mr-2 h-4 w-4" />
                      Column
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={!activeSheet}>
                      <Rows3 className="mr-2 h-4 w-4" />
                      Row
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={removeActiveSheet} disabled={workbook.sheets.length <= 1}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Sheet
                    </Button>
                  </div>
                </div>
                <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Current sheet</p>
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                      {activeSheet.name}
                    </div>
                  </div>
                  <div className="rounded-xl border border-dashed border-slate-200 bg-white/80 px-3 py-2 text-xs leading-5 text-slate-500">
                    Keep the whole sheet workflow on one screen: switch sheets here, edit values in the grid, then use inline edge buttons to expand the table without hunting for controls.
                  </div>
                </div>
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-5">
            {activeTab === 'editor' ? (
              activeSheet ? (
              <>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Rows</p>
                    <p className="mt-2 text-2xl font-medium tracking-[-0.03em] text-slate-950">{activeSummary?.rowCount || 0}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Columns</p>
                    <p className="mt-2 text-2xl font-medium tracking-[-0.03em] text-slate-950">{activeSummary?.columnCount || 0}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Numeric total</p>
                    <p className="mt-2 text-2xl font-medium tracking-[-0.03em] text-slate-950">{(activeSummary?.total || 0).toFixed(1)}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Numeric average</p>
                    <p className="mt-2 text-2xl font-medium tracking-[-0.03em] text-slate-950">{(activeSummary?.average || 0).toFixed(1)}</p>
                  </div>
                </div>

                <div className="max-w-full overflow-hidden rounded-2xl border border-slate-200">
                  <div className="max-w-full overflow-x-auto overflow-y-hidden">
                    <table className="min-w-max border-collapse">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="sticky left-0 z-20 min-w-[72px] border-b border-r border-slate-200 bg-slate-100 px-3 py-3 text-left text-[11px] uppercase tracking-[0.16em] text-slate-500">
                          Row
                        </th>
                        {activeSheet.columns.map((column) => (
                          <th key={column.id} className="min-w-[190px] border-b border-slate-200 p-3 text-left align-top">
                            <div className="space-y-2">
                              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                {getDocSheetColumnLetter(activeSheet.columns.findIndex((entry) => entry.id === column.id))}
                              </div>
                              <Input value={column.label} onChange={(event) => updateColumnLabel(column.id, event.target.value)} className="h-9 bg-white" />
                              <Select value={column.type} onValueChange={(value) => updateColumnType(column.id, value)}>
                                <SelectTrigger className="h-9 bg-white">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {columnTypes.map((entry) => (
                                    <SelectItem key={entry.value} value={entry.value}>{entry.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => removeColumn(column.id)} disabled={activeSheet.columns.length <= 1}>
                                Remove
                              </Button>
                            </div>
                          </th>
                        ))}
                        <th className="w-[72px] border-b border-slate-200 p-3 text-center">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 rounded-full"
                            onClick={addColumn}
                            disabled={!activeSheet}
                            aria-label="Add column"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeSheet.rows.map((row) => (
                        <tr key={row.id} className="border-b border-slate-100 last:border-b-0">
                          <td className="sticky left-0 z-10 border-r border-slate-200 bg-white p-2 align-top">
                            <div className="flex h-10 items-center rounded-lg bg-slate-50 px-3 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                              {activeSheet.rows.findIndex((entry) => entry.id === row.id) + 1}
                            </div>
                          </td>
                          {activeSheet.columns.map((column) => {
                            const computedValue = getDocSheetDisplayValue(activeSheet, row.id, column.id);
                            const isSelected = selectedCell?.rowId === row.id && selectedCell?.columnId === column.id;
                            const rawValue = row.values[column.id] || '';
                            return (
                            <td key={column.id} className="p-2 align-top">
                              <div className={`space-y-1 rounded-xl border p-2 transition ${isSelected ? 'border-slate-950 bg-slate-50 shadow-[0_0_0_1px_rgba(15,23,42,0.08)]' : 'border-transparent bg-transparent'}`}>
                                <Input
                                  value={rawValue}
                                  type={column.type === 'number' || column.type === 'currency' || column.type === 'percent' ? 'text' : column.type === 'date' ? 'date' : 'text'}
                                  onFocus={() => setSelectedCell({ rowId: row.id, columnId: column.id })}
                                  onChange={(event) => updateCell(row.id, column.id, event.target.value)}
                                  className="bg-white"
                                  placeholder={column.type === 'number' ? '=A1+B1 or 100' : column.type === 'currency' ? '=SUM(C1:C10)' : ''}
                                />
                                {rawValue.trim().startsWith('=') ? (
                                  <p className="text-[11px] leading-5 text-slate-500">
                                    Computed: <span className="font-medium text-slate-900">{computedValue}</span>
                                  </p>
                                ) : null}
                              </div>
                            </td>
                          )})}
                          <td className="p-2 align-top">
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(row.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td className="sticky left-0 z-10 border-r border-t border-slate-200 bg-white p-2 align-top">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-10 w-10 rounded-full"
                            onClick={addRow}
                            disabled={!activeSheet}
                            aria-label="Add row"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </td>
                        <td colSpan={activeSheet.columns.length + 1} className="border-t border-slate-200 px-4 py-3 text-sm text-slate-500">
                          Add a new row at the end of the sheet.
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  </div>
                </div>
                <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/90 p-4 text-sm leading-6 text-slate-600">
                  <p className="font-medium text-slate-950">Spreadsheet functions now supported</p>
                  <p className="mt-2">Use formulas directly in cells, such as <span className="font-medium text-slate-900">`=A1+B1`</span>, <span className="font-medium text-slate-900">`=SUM(C1:C10)`</span>, <span className="font-medium text-slate-900">`=AVERAGE(C1:C10)`</span>, <span className="font-medium text-slate-900">`=MIN(...)`</span>, and <span className="font-medium text-slate-900">`=MAX(...)`</span>. Computed values are used in exports, previews, and AI charting.</p>
                </div>
              </>
              ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-slate-500">
                Create a sheet to start using DocSheet.
              </div>
              )
            ) : null}

            {activeTab === 'ai' ? (
              <div className="space-y-5">
                <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50/90 p-5">
                  <p className="text-sm font-medium text-slate-950">DocSheet AI Studio</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Tell AI what to create or change in the workbook. It can build a new spreadsheet from scratch or update the existing sheet structure and values based on your instruction.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {[
                      'Create a monthly sales tracker with region, owner, target, achieved, gap, and status columns.',
                      'Add a forecast sheet and update the current workbook so low-performing rows are highlighted.',
                      'Turn this into a budget tracker with department, allocated amount, spent amount, balance, and utilization percent.',
                    ].map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => setAiInstruction(prompt)}
                        className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">What should DocSheet AI do?</label>
                  <textarea
                    value={aiInstruction}
                    onChange={(event) => setAiInstruction(event.target.value)}
                    className="min-h-[160px] w-full rounded-[1.4rem] border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-800 outline-none transition focus:border-slate-400"
                    placeholder="Example: Add a new sheet for Q2 projections, include monthly revenue and cost columns, calculate margin %, and update the first sheet with status values based on margin."
                  />
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button type="button" onClick={() => void runDocSheetAi()} disabled={aiBusy}>
                    {aiBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BrainCircuit className="mr-2 h-4 w-4" />}
                    {aiBusy ? 'Applying AI changes...' : 'Apply with AI'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setAiInstruction('Create a fresh workbook from scratch for a business reporting use case.')}>
                    Create New Spreadsheet
                  </Button>
                </div>

                {aiSummary ? (
                  <div className="rounded-[1.3rem] border border-sky-200 bg-sky-50 p-4">
                    <p className="text-sm font-medium text-sky-950">AI update summary</p>
                    <p className="mt-2 text-sm leading-6 text-sky-900">{aiSummary}</p>
                    {aiNextSteps.length ? (
                      <ul className="mt-3 space-y-2 text-sm leading-6 text-sky-900">
                        {aiNextSteps.map((item) => <li key={item}>• {item}</li>)}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeTab === 'smart' ? (
              <div className="space-y-5">
                <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50/90 p-5">
                  <p className="text-sm font-medium text-slate-950">Smart Sheets</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Start from proven business sheet templates or apply one-click formula packs to the current sheet. These are designed to save setup time and reduce spreadsheet errors.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-700">
                    <Sheet className="h-3.5 w-3.5" />
                    Ready templates
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {smartTemplates.map((template) => (
                      <div key={template.id} className="rounded-[1.2rem] border border-slate-200 bg-white p-4 shadow-sm">
                        <p className="text-sm font-medium text-slate-950">{template.name}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{template.description}</p>
                        <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">{template.audience}</p>
                        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => applyTemplate(template.id)}>
                          <Plus className="mr-2 h-4 w-4" />
                          Use Template
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-700">
                    <BrainCircuit className="h-3.5 w-3.5" />
                    One-click formula packs
                  </div>
                  <div className="grid gap-3">
                    {formulaPacks.map((formulaPack) => (
                      <div key={formulaPack.id} className="flex flex-col gap-3 rounded-[1.2rem] border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-950">{formulaPack.name}</p>
                          <p className="mt-2 text-sm leading-6 text-slate-600">{formulaPack.description}</p>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => applyFormulaPack(formulaPack.id)} disabled={!activeSheet}>
                          <SlidersHorizontal className="mr-2 h-4 w-4" />
                          Apply to Current Sheet
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-[1.2rem] border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
                    Formula packs work best when your sheet already has matching source columns such as <span className="font-medium text-slate-900">Target + Achieved</span>, <span className="font-medium text-slate-900">Budget + Spent</span>, or <span className="font-medium text-slate-900">Invoice Amount + Collected</span>.
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === 'saved' ? (
              <div className="space-y-3">
                {savedWorkbooks.length ? savedWorkbooks.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
                    <p className="font-medium text-slate-950">{entry.templateName}</p>
                    <p className="mt-1 text-sm text-slate-500">{formatDate(entry.generatedAt)}</p>
                    <p className="mt-1 text-sm text-slate-500">Rows: {entry.data?.rowCount || '0'} | Columns: {entry.data?.columnCount || '0'}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => loadWorkbook(entry)}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Open
                      </Button>
                      {entry.shareUrl ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(buildAbsoluteAppUrl(entry.shareUrl, typeof window !== 'undefined' ? window.location.origin : undefined))}>
                          <Link2 className="mr-2 h-4 w-4" />
                          Copy Link
                        </Button>
                      ) : null}
                      <Button type="button" size="sm" variant="ghost" onClick={() => void deleteWorkbook(entry.id)} disabled={deletingId === entry.id}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        {deletingId === entry.id ? 'Deleting...' : 'Delete'}
                      </Button>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                    No DocSheet workbooks saved yet.
                  </div>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {layout === 'page' && activeTab === 'insights' ? (
            <Card className="border-white/60 bg-white/84 shadow-[0_18px_40px_rgba(15,23,42,0.06)] backdrop-blur">
              <CardHeader className="space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <CardTitle className="text-lg font-medium tracking-[-0.02em]">AI spreadsheet insights</CardTitle>
                    <p className="mt-1 text-sm leading-6 text-slate-600">Choose what matters, then let DocSheet explain the sheet in plain business language and charts.</p>
                  </div>
                  <Button type="button" onClick={() => void runVisualization()} disabled={visualLoading || !activeSheet}>
                    {visualLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BrainCircuit className="mr-2 h-4 w-4" />}
                    {visualLoading ? 'Analyzing...' : 'Refresh AI Insights'}
                  </Button>
                </div>
                {visualMessage ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{visualMessage}</div> : null}
                {visualError ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{visualError}</div> : null}
                {visualResult ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-xl bg-slate-950 p-2 text-white"><BrainCircuit className="h-4 w-4" /></div>
                      <div>
                        <p className="text-sm font-medium text-slate-950">{visualResult.executiveSummary}</p>
                        <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">Confidence {visualResult.confidenceScore}% • {visualResult.provider}</p>
                        <p className="mt-2 text-xs leading-5 text-slate-500">Charts and metrics below stay synced to the current sheet values, so edits in the grid update the story in real time.</p>
                      </div>
                    </div>
                  </div>
                ) : null}
                {visualResult?.availableStats?.length ? (
                  <div className="space-y-3">
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-700">
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Choose chart focus
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {visualResult.availableStats.map((stat) => {
                        const isActive = selectedStats.includes(stat.id);
                        return (
                          <button
                            key={stat.id}
                            type="button"
                            onClick={() => toggleStat(stat.id)}
                            className={`rounded-[1.1rem] border p-4 text-left transition ${isActive ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50'}`}
                          >
                            <p className="text-sm font-medium">{stat.label}</p>
                            <p className={`mt-2 text-sm leading-6 ${isActive ? 'text-slate-200' : 'text-slate-500'}`}>{stat.description}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-6">
                {activeVisualization ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {activeVisualization.keyMetrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}
                    </div>
                    {activeVisualization.deepInsights?.length ? (
                      <div className="space-y-3">
                        <p className="text-sm font-medium text-slate-900">Deep insights</p>
                        <div className="grid gap-3">
                          {activeVisualization.deepInsights.map((insight) => <DeepInsightCard key={insight.id} insight={insight} />)}
                        </div>
                      </div>
                    ) : null}
                    {activeVisualization.charts?.length ? (
                      <div className="space-y-3">
                        <p className="text-sm font-medium text-slate-900">Graphical view</p>
                        <div className="grid gap-4">
                          {activeVisualization.charts.map((chart) => <ChartPanel key={chart.id} chart={chart} />)}
                        </div>
                      </div>
                    ) : null}
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/90 p-4">
                        <p className="text-sm font-medium text-slate-950">Highlights</p>
                        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                          {activeVisualization.highlights.map((item) => <li key={item}>• {item}</li>)}
                        </ul>
                      </div>
                      <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/90 p-4">
                        <p className="text-sm font-medium text-slate-950">Recommendations</p>
                        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                          {activeVisualization.recommendations.map((item) => <li key={item}>• {item}</li>)}
                        </ul>
                      </div>
                    </div>
                    {activeVisualization.anomalies?.length ? (
                      <div className="rounded-[1.2rem] border border-amber-200 bg-amber-50 p-4">
                        <p className="text-sm font-medium text-amber-950">Risk signals and anomalies</p>
                        <ul className="mt-3 space-y-2 text-sm leading-6 text-amber-900">
                          {activeVisualization.anomalies.map((item) => <li key={item}>• {item}</li>)}
                        </ul>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm leading-6 text-slate-500">
                    Save or edit the sheet, then run AI insights to generate charts, layman summaries, anomalies, and decision-ready recommendations from the active tab.
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {/* Intentionally minimal: keep the workflow focused on the sheet editor + actions. */}
        </div>
      </div>

      {/* ── Real-time CollabBar ── */}
      {collabOpen ? (
        <CollabBar
          engine={collabEngine}
          content={JSON.stringify(workbook)}
          onContentChange={(snap) => {
            try {
              const wb = JSON.parse(snap) as typeof workbook;
              if (wb?.id && wb?.sheets) setWorkbook(wb);
            } catch { /* ignore */ }
          }}
        />
      ) : null}
    </div>
  );
}
