'use client';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  X, Download, ZoomIn, ZoomOut, Maximize2, ChevronLeft, ChevronRight,
  FileText, Image as ImageIcon, Film, Music, Archive, Code as CodeIcon,
  Sheet as SheetIcon, FileType, Folder, FolderOpen, File as FileIconLib,
  Loader2, AlertCircle, RotateCw, Search, BookOpen, Globe, Hash,
  Eye, ZapOff, Palette, ChevronDown, Sparkles, ExternalLink, Layers,
  PenLine, TableProperties, Presentation, Play, Star, Check as CheckIcon,
  Cpu, Layout, ScrollText,
} from 'lucide-react';
import { setDriveHandoffFile } from '@/lib/driveHandoff';

/* ═══════════════════════════════════════════════════════════════════════════
   UNIVERSAL FILE VIEWER
   Renders any common file format inline — no download required.

   Supported: PDF · DOC/DOCX · XLS/XLSX/CSV/TSV · PPT/PPTX · TXT · CSV · JSON ·
              XML · Markdown · ZIP · Images · Video · Audio · EPUB · HTML ·
              SVG · 30+ code languages with syntax highlighting.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ─── Types ─────────────────────────────────────────────────────────────── */
export type ViewerKind =
  | 'pdf' | 'docx' | 'sheet' | 'pptx'
  | 'text' | 'markdown' | 'json' | 'xml' | 'code'
  | 'image' | 'svg' | 'video' | 'audio'
  | 'archive' | 'epub' | 'html'
  | 'unsupported';

export interface ViewableFile {
  name: string;
  blob: Blob;
  mimeType?: string;
  size?: number;
}

export interface UniversalFileViewerProps {
  open: boolean;
  onClose: () => void;
  file: ViewableFile | null;
  onDownload?: (file: ViewableFile) => void;
}

/* ─── Extension → kind/language detection ───────────────────────────────── */
const EXT_KIND: Record<string, ViewerKind> = {
  pdf: 'pdf',
  docx: 'docx', doc: 'docx', odt: 'docx', rtf: 'docx',
  xlsx: 'sheet', xls: 'sheet', ods: 'sheet', csv: 'sheet', tsv: 'sheet',
  pptx: 'pptx', ppt: 'pptx', odp: 'pptx',
  txt: 'text', log: 'text', text: 'text',
  md: 'markdown', markdown: 'markdown', mdx: 'markdown',
  json: 'json',
  xml: 'xml', plist: 'xml',
  svg: 'svg',
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image',
  bmp: 'image', ico: 'image', avif: 'image', heic: 'image', tiff: 'image',
  mp4: 'video', webm: 'video', mov: 'video', mkv: 'video', m4v: 'video',
  ogv: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio', m4a: 'audio', flac: 'audio',
  aac: 'audio', opus: 'audio', wma: 'audio',
  zip: 'archive', jar: 'archive', war: 'archive', apk: 'archive',
  epub: 'epub',
  htm: 'html', html: 'html', xhtml: 'html',
  // Code
  js: 'code', mjs: 'code', cjs: 'code', jsx: 'code',
  ts: 'code', tsx: 'code',
  py: 'code', rb: 'code', go: 'code', rs: 'code',
  java: 'code', kt: 'code', swift: 'code',
  c: 'code', h: 'code', cpp: 'code', cc: 'code', hpp: 'code',
  cs: 'code', php: 'code', dart: 'code', scala: 'code', lua: 'code',
  css: 'code', scss: 'code', sass: 'code', less: 'code',
  sh: 'code', bash: 'code', zsh: 'code', fish: 'code',
  sql: 'code', yml: 'code', yaml: 'code', toml: 'code',
  ini: 'code', conf: 'code', env: 'code', dockerfile: 'code',
  graphql: 'code', gql: 'code', proto: 'code', tf: 'code',
};

const CODE_LANG: Record<string, string> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  ts: 'typescript', tsx: 'tsx',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
  java: 'java', kt: 'kotlin', swift: 'swift',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp',
  cs: 'csharp', php: 'php', dart: 'dart', scala: 'scala', lua: 'lua',
  css: 'css', scss: 'scss', sass: 'sass', less: 'less',
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash',
  sql: 'sql', yml: 'yaml', yaml: 'yaml', toml: 'toml',
  ini: 'ini', conf: 'ini', env: 'ini', dockerfile: 'dockerfile',
  graphql: 'graphql', gql: 'graphql', proto: 'proto', tf: 'hcl',
};

function getExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
}

function detectKind(file: ViewableFile): { kind: ViewerKind; ext: string; lang: string } {
  const ext = getExt(file.name);
  const kind = EXT_KIND[ext] ?? 'unsupported';
  const lang = CODE_LANG[ext] ?? ext;
  return { kind, ext, lang };
}

function fmtBytes(n: number | undefined): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const KIND_LABEL: Record<ViewerKind, string> = {
  pdf: 'PDF Document', docx: 'Word Document', sheet: 'Spreadsheet',
  pptx: 'Presentation', text: 'Text File', markdown: 'Markdown',
  json: 'JSON', xml: 'XML', code: 'Source Code',
  image: 'Image', svg: 'Vector Image', video: 'Video', audio: 'Audio',
  archive: 'Archive', epub: 'E-Book', html: 'Web Page',
  unsupported: 'File',
};

const KIND_ICON: Record<ViewerKind, React.ComponentType<any>> = {
  pdf: FileText, docx: FileText, sheet: SheetIcon, pptx: FileType,
  text: FileText, markdown: Hash, json: CodeIcon, xml: CodeIcon, code: CodeIcon,
  image: ImageIcon, svg: ImageIcon, video: Film, audio: Music,
  archive: Archive, epub: BookOpen, html: Globe,
  unsupported: FileIconLib,
};

const KIND_COLOR: Record<ViewerKind, string> = {
  pdf: '#f87171', docx: '#818cf8', sheet: '#4ade80', pptx: '#fb923c',
  text: '#94a3b8', markdown: '#a78bfa', json: '#fbbf24', xml: '#fbbf24',
  code: '#22d3ee', image: '#34d399', svg: '#34d399', video: '#fb923c',
  audio: '#a78bfa', archive: '#fbbf24', epub: '#c084fc', html: '#60a5fa',
  unsupported: '#94a3b8',
};

/* ═══════════════════════════════════════════════════════════════════════════
   EDITOR REGISTRY
   Maps every ViewerKind to a list of compatible editors (platform + built-in).
   ═══════════════════════════════════════════════════════════════════════════ */

type EditorMode = 'inline' | 'navigate';

interface EditorDef {
  id: string;
  name: string;
  tagline: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Icon: React.ComponentType<any>;
  color: string;
  /** Kinds this editor is the single best choice for */
  recommended: ViewerKind[];
  /** All compatible kinds */
  compatible: ViewerKind[];
  /** App route to navigate to (undefined = built-in inline only) */
  route?: string;
  mode: EditorMode;
  /** When inline: force-switch to this ViewerKind inside the UFV */
  inlineKind?: ViewerKind;
  /** Whether this editor accepts the file via driveHandoff */
  acceptsHandoff?: boolean;
}

const EDITOR_REGISTRY: EditorDef[] = [
  {
    id: 'preview',
    name: 'Quick Preview',
    tagline: 'Instant in-browser preview — no install required',
    Icon: Eye,
    color: '#94a3b8',
    recommended: [],          // built-in is always shown but never "top recommended"
    compatible: ['pdf','docx','sheet','pptx','text','markdown','json','xml','code','image','svg','video','audio','archive','epub','html'],
    mode: 'inline',
  },
  {
    id: 'docword',
    name: 'DocWord Editor',
    tagline: 'Full-featured word processor for writing & editing docs',
    Icon: PenLine,
    color: '#818cf8',
    recommended: ['docx', 'text', 'markdown', 'html'],
    compatible: ['docx', 'text', 'markdown', 'html'],
    route: '/docword',
    mode: 'navigate',
    acceptsHandoff: true,
  },
  {
    id: 'docsheet',
    name: 'DocSheets',
    tagline: 'Spreadsheet editor with formulas, charts & collaboration',
    Icon: TableProperties,
    color: '#4ade80',
    recommended: ['sheet'],
    compatible: ['sheet'],
    route: '/docsheet',
    mode: 'navigate',
    acceptsHandoff: true,
  },
  {
    id: 'pdf-studio',
    name: 'PDF Studio',
    tagline: 'Annotate, sign, merge and edit PDF documents',
    Icon: Layers,
    color: '#f87171',
    recommended: ['pdf'],
    compatible: ['pdf'],
    route: '/pdf-editor',
    mode: 'navigate',
    acceptsHandoff: true,
  },
  {
    id: 'visualizer',
    name: 'Data Visualizer',
    tagline: 'Turn spreadsheet data into interactive charts & dashboards',
    Icon: Layout,
    color: '#a78bfa',
    recommended: [],
    compatible: ['sheet'],
    route: '/visualizer',
    mode: 'navigate',
    acceptsHandoff: false,
  },
  {
    id: 'code-editor',
    name: 'Code Editor',
    tagline: 'Syntax-highlighted editor with line numbers & word wrap',
    Icon: Cpu,
    color: '#22d3ee',
    recommended: ['code', 'json', 'xml', 'html'],
    compatible: ['code', 'json', 'xml', 'html', 'text', 'markdown'],
    mode: 'inline',
    inlineKind: 'code',
  },
  {
    id: 'markdown-render',
    name: 'Markdown Renderer',
    tagline: 'Renders markdown with headings, tables, code blocks & links',
    Icon: Hash,
    color: '#c084fc',
    recommended: ['markdown'],
    compatible: ['markdown', 'text'],
    mode: 'inline',
    inlineKind: 'markdown',
  },
  {
    id: 'presentation',
    name: 'Slide Viewer',
    tagline: 'Browse slide-by-slide with full text outline extraction',
    Icon: Presentation,
    color: '#fb923c',
    recommended: ['pptx'],
    compatible: ['pptx'],
    mode: 'inline',
  },
  {
    id: 'media-player',
    name: 'Media Player',
    tagline: 'Native player for videos and audio with full controls',
    Icon: Play,
    color: '#34d399',
    recommended: ['video', 'audio'],
    compatible: ['video', 'audio'],
    mode: 'inline',
  },
  {
    id: 'epub-reader',
    name: 'Book Reader',
    tagline: 'Chapter navigation, readable typography, clean layout',
    Icon: BookOpen,
    color: '#c084fc',
    recommended: ['epub'],
    compatible: ['epub'],
    mode: 'inline',
  },
  {
    id: 'html-preview',
    name: 'Web Preview',
    tagline: 'Sandboxed iframe render + source code toggle',
    Icon: Globe,
    color: '#60a5fa',
    recommended: ['html'],
    compatible: ['html'],
    mode: 'inline',
  },
  {
    id: 'archive-browser',
    name: 'Archive Browser',
    tagline: 'Explore ZIP tree, read file contents inline',
    Icon: Archive,
    color: '#fbbf24',
    recommended: ['archive'],
    compatible: ['archive'],
    mode: 'inline',
  },
  {
    id: 'image-viewer',
    name: 'Image Viewer',
    tagline: 'Pan, zoom, rotate — high-fidelity image inspection',
    Icon: ImageIcon,
    color: '#34d399',
    recommended: ['image', 'svg'],
    compatible: ['image', 'svg'],
    mode: 'inline',
  },
  {
    id: 'text-viewer',
    name: 'Plain Text',
    tagline: 'Raw text rendering with monospace font, scroll + wrap',
    Icon: ScrollText,
    color: '#94a3b8',
    recommended: ['text'],
    compatible: ['text', 'code', 'json', 'xml', 'markdown'],
    mode: 'inline',
    inlineKind: 'text',
  },
];

/** Returns editors sorted: recommended first, then compatible, built-in last. */
function getEditorsForKind(kind: ViewerKind): { editor: EditorDef; isRecommended: boolean }[] {
  const results: { editor: EditorDef; isRecommended: boolean; priority: number }[] = [];

  for (const ed of EDITOR_REGISTRY) {
    const isRecommended = ed.recommended.includes(kind);
    const isCompatible  = ed.compatible.includes(kind);
    if (!isRecommended && !isCompatible) continue;
    // Priority: recommended platform editors > recommended inline > compatible platform > compatible inline > quick preview
    let priority =
      ed.id === 'preview'       ? 99 :
      isRecommended && ed.route ? 1  :
      isRecommended             ? 2  :
      ed.route                  ? 3  : 4;
    results.push({ editor: ed, isRecommended, priority });
  }

  results.sort((a, b) => a.priority - b.priority);
  return results.map(({ editor, isRecommended }) => ({ editor, isRecommended }));
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */
export default function UniversalFileViewer({ open, onClose, file, onDownload }: UniversalFileViewerProps) {
  const router = useRouter();
  const [openWithOpen, setOpenWithOpen] = useState(false);
  /** When set, overrides the auto-detected ViewerKind so a different renderer runs. */
  const [forcedKind, setForcedKind]     = useState<ViewerKind | null>(null);
  /** ID of the active editor (for the check-mark). */
  const [activeEditorId, setActiveEditorId] = useState<string>('preview');

  /* Reset forced overrides whenever the file changes */
  useEffect(() => { setForcedKind(null); setActiveEditorId('preview'); setOpenWithOpen(false); }, [file]);

  /* keyboard shortcuts */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (openWithOpen) setOpenWithOpen(false); else onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, openWithOpen]);

  const rawMeta  = useMemo(() => (file ? detectKind(file) : null), [file]);
  /* Apply forcedKind override */
  const meta = useMemo(() => {
    if (!rawMeta) return null;
    if (!forcedKind) return rawMeta;
    return { ...rawMeta, kind: forcedKind, lang: CODE_LANG[rawMeta.ext] ?? rawMeta.ext };
  }, [rawMeta, forcedKind]);

  const Icon   = meta ? KIND_ICON[meta.kind] : FileIconLib;
  const accent = meta ? KIND_COLOR[meta.kind] : '#94a3b8';

  /* Editors available for the current file */
  const editors = useMemo(() => (rawMeta ? getEditorsForKind(rawMeta.kind) : []), [rawMeta]);
  const topRecommended = editors.find(e => e.isRecommended && e.editor.id !== 'preview');

  const handleDownload = useCallback(() => {
    if (!file) return;
    if (onDownload) { onDownload(file); return; }
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement('a');
    a.href = url; a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [file, onDownload]);

  /** Called when user picks an editor from the Open With panel */
  const handleOpenWith = useCallback((ed: EditorDef) => {
    if (!file) return;
    setOpenWithOpen(false);
    setActiveEditorId(ed.id);

    if (ed.mode === 'inline') {
      /* Just switch the renderer */
      setForcedKind(ed.inlineKind ?? rawMeta?.kind ?? null);
      return;
    }

    /* Navigate — store handoff first */
    if (ed.acceptsHandoff) {
      setDriveHandoffFile({ blob: file.blob, name: file.name, mimeType: file.mimeType, bytes: file.size ?? file.blob.size });
    }
    onClose();
    router.push(ed.route!);
  }, [file, rawMeta, router, onClose]);

  if (!open || !file || !meta || !rawMeta || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <style>{UFV_GLOBAL_STYLES}</style>

      {/* Backdrop */}
      <div
        onClick={() => { if (openWithOpen) setOpenWithOpen(false); else onClose(); }}
        style={{ position:'fixed', inset:0, zIndex:2147483655, background:'rgba(0,0,0,0.92)', backdropFilter:'blur(18px)', WebkitBackdropFilter:'blur(18px)', animation:'ufv-fade 0.20s ease both' }}
      />

      {/* Container */}
      <div style={{ position:'fixed', inset:0, zIndex:2147483656, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            pointerEvents: 'auto',
            width: '100%', height: '100%',
            maxWidth: 1240, maxHeight: '100%',
            background: 'rgba(8,8,12,0.985)',
            border: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            animation: 'ufv-in 0.26s cubic-bezier(0.22,1,0.36,1) both',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.025) inset, 0 24px 90px rgba(0,0,0,0.92)',
          }}
          className="sm:rounded-[18px] sm:h-[calc(100svh-32px)]"
        >
          {/* ── Header ──────────────────────────────────────────────── */}
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px', borderBottom:'1px solid rgba(255,255,255,0.05)', flexShrink:0 }}>
            {/* File type badge */}
            <div style={{ width:32, height:32, borderRadius:9, background:`${accent}1F`, border:`1px solid ${accent}3A`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <Icon size={14} color={accent} />
            </div>

            {/* File info */}
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ margin:0, fontSize:13, fontWeight:700, color:'rgba(255,255,255,0.92)', letterSpacing:'-0.01em', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {file.name}
              </p>
              <p style={{ margin:0, fontSize:10, color:'rgba(255,255,255,0.32)' }}>
                {KIND_LABEL[meta.kind]} · {fmtBytes(file.size ?? file.blob.size)}
                {activeEditorId !== 'preview' && (
                  <span style={{ marginLeft:6, color: accent }}>
                    · {EDITOR_REGISTRY.find(e => e.id === activeEditorId)?.name}
                  </span>
                )}
              </p>
            </div>

            {/* ── Open With button ── */}
            <div style={{ position:'relative' }}>
              <button
                type="button"
                onClick={() => setOpenWithOpen(v => !v)}
                style={{
                  display:'flex', alignItems:'center', gap:6,
                  height:30, padding:'0 11px',
                  borderRadius:9,
                  border:'1px solid rgba(255,255,255,0.10)',
                  background: openWithOpen ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
                  color:'rgba(255,255,255,0.80)',
                  cursor:'pointer', flexShrink:0,
                  transition:'background 0.12s',
                }}
                title="Open With another editor"
              >
                <Sparkles size={11} style={{ flexShrink:0 }} />
                <span style={{ fontSize:11.5, fontWeight:700, letterSpacing:'-0.01em' }}>Open With</span>
                {topRecommended && (
                  <span style={{ padding:'1px 5px', borderRadius:4, background:`${topRecommended.editor.color}22`, border:`1px solid ${topRecommended.editor.color}44`, fontSize:9, fontWeight:700, color:topRecommended.editor.color, letterSpacing:'0.04em' }}>
                    {editors.filter(e => e.isRecommended && e.editor.id !== 'preview').length}
                  </span>
                )}
                <ChevronDown size={11} style={{ flexShrink:0, transform: openWithOpen ? 'rotate(180deg)' : 'none', transition:'transform 0.15s' }} />
              </button>
            </div>

            {/* Download */}
            <button type="button" onClick={handleDownload} style={ufvBtnStyle()} title="Download">
              <Download size={13} />
            </button>

            {/* Close */}
            <button type="button" onClick={onClose} style={{ ...ufvBtnStyle(), borderRadius:'50%' }} title="Close (Esc)">
              <X size={14} />
            </button>
          </div>

          {/* ── Body (viewer + optional Open With panel) ────────────── */}
          <div style={{ flex:1, minHeight:0, display:'flex', overflow:'hidden' }}>
            {/* Viewer */}
            <div style={{ flex:1, minWidth:0, position:'relative', background:'rgba(0,0,0,0.55)' }}>
              <ViewerSwitch file={file} meta={meta} />
            </div>

            {/* Open With sidebar panel */}
            {openWithOpen && (
              <OpenWithPanel
                editors={editors}
                activeEditorId={activeEditorId}
                file={file}
                onSelect={handleOpenWith}
                onClose={() => setOpenWithOpen(false)}
              />
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

function ufvBtnStyle(active = false): React.CSSProperties {
  return {
    width: 30, height: 30,
    borderRadius: 9,
    border: '1px solid rgba(255,255,255,0.08)',
    background: active ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.035)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'rgba(255,255,255,0.72)',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'background 0.12s, color 0.12s',
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   OPEN WITH PANEL
   ═══════════════════════════════════════════════════════════════════════════ */
function OpenWithPanel({
  editors, activeEditorId, file, onSelect, onClose,
}: {
  editors: { editor: EditorDef; isRecommended: boolean }[];
  activeEditorId: string;
  file: ViewableFile;
  onSelect: (ed: EditorDef) => void;
  onClose: () => void;
}) {
  const recommended = editors.filter(e => e.isRecommended && e.editor.id !== 'preview');
  const others      = editors.filter(e => !e.isRecommended && e.editor.id !== 'preview');
  const preview     = editors.find(e => e.editor.id === 'preview');

  return (
    <div
      style={{
        width: 310, flexShrink: 0,
        borderLeft: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(5,5,9,0.97)',
        display: 'flex', flexDirection: 'column',
        animation: 'ufv-panel-in 0.22s cubic-bezier(0.22,1,0.36,1) both',
        overflow: 'hidden',
      }}
      className="hidden sm:flex"
    >
      {/* Panel header */}
      <div style={{ padding:'13px 14px 10px', borderBottom:'1px solid rgba(255,255,255,0.05)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div>
          <p style={{ margin:0, fontSize:13, fontWeight:700, color:'rgba(255,255,255,0.92)', letterSpacing:'-0.01em' }}>Open With</p>
          <p style={{ margin:0, fontSize:10, color:'rgba(255,255,255,0.35)' }}>Pick an editor for this file type</p>
        </div>
        <button type="button" onClick={onClose} style={{ ...ufvBtnStyle(), borderRadius:'50%', width:26, height:26 }}>
          <X size={12} />
        </button>
      </div>

      <div className="ufv-scroll" style={{ flex:1, overflow:'auto', padding:'10px 10px 20px' }}>

        {/* ── Recommended ── */}
        {recommended.length > 0 && (
          <>
            <div style={{ padding:'6px 4px 8px', display:'flex', alignItems:'center', gap:6 }}>
              <Star size={10} color="#fbbf24" fill="#fbbf24" />
              <span style={{ fontSize:9.5, fontWeight:700, color:'rgba(255,255,255,0.35)', letterSpacing:'0.08em', textTransform:'uppercase' }}>Recommended</span>
            </div>
            {recommended.map(({ editor }) => (
              <EditorCard
                key={editor.id}
                editor={editor}
                isActive={activeEditorId === editor.id}
                onSelect={onSelect}
              />
            ))}
          </>
        )}

        {/* ── Other compatible ── */}
        {others.length > 0 && (
          <>
            <div style={{ padding:'10px 4px 8px', display:'flex', alignItems:'center', gap:6 }}>
              <Layers size={10} color="rgba(255,255,255,0.28)" />
              <span style={{ fontSize:9.5, fontWeight:700, color:'rgba(255,255,255,0.28)', letterSpacing:'0.08em', textTransform:'uppercase' }}>Also compatible</span>
            </div>
            {others.map(({ editor }) => (
              <EditorCard
                key={editor.id}
                editor={editor}
                isActive={activeEditorId === editor.id}
                onSelect={onSelect}
              />
            ))}
          </>
        )}

        {/* ── Built-in preview (always last) ── */}
        {preview && (
          <>
            <div style={{ marginTop:10, borderTop:'1px solid rgba(255,255,255,0.04)', paddingTop:10 }}>
              <EditorCard
                editor={preview.editor}
                isActive={activeEditorId === 'preview'}
                onSelect={onSelect}
                dim
              />
            </div>
          </>
        )}
      </div>

      {/* Footer note */}
      <div style={{ borderTop:'1px solid rgba(255,255,255,0.04)', padding:'9px 14px', flexShrink:0 }}>
        <p style={{ margin:0, fontSize:10, color:'rgba(255,255,255,0.26)', lineHeight:1.55 }}>
          Platform editors open in a new page. Your file is passed automatically.
        </p>
      </div>
    </div>
  );
}

function EditorCard({
  editor, isActive, onSelect, dim = false,
}: {
  editor: EditorDef;
  isActive: boolean;
  onSelect: (ed: EditorDef) => void;
  dim?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const isPlatform = editor.mode === 'navigate';

  return (
    <button
      type="button"
      onClick={() => onSelect(editor)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display:'flex', alignItems:'flex-start', gap:11,
        width:'100%', textAlign:'left',
        padding:'10px 11px', marginBottom:5,
        borderRadius:12,
        border:`1px solid ${isActive ? `${editor.color}44` : hovered ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.055)'}`,
        background: isActive ? `${editor.color}12` : hovered ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.018)',
        cursor:'pointer',
        transition:'border-color 0.10s, background 0.10s',
        opacity: dim ? 0.7 : 1,
        animation: 'ufv-slide-up 0.18s ease both',
      }}
    >
      {/* Icon */}
      <div style={{
        width:34, height:34, borderRadius:10, flexShrink:0,
        background:`${editor.color}1A`, border:`1px solid ${editor.color}30`,
        display:'flex', alignItems:'center', justifyContent:'center',
        marginTop:1,
        boxShadow: isActive ? `0 0 12px ${editor.color}30` : 'none',
        transition:'box-shadow 0.15s',
      }}>
        <editor.Icon size={15} color={editor.color} />
      </div>

      {/* Info */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
          <span style={{ fontSize:12.5, fontWeight:700, color: isActive ? '#fff' : 'rgba(255,255,255,0.86)', letterSpacing:'-0.01em' }}>
            {editor.name}
          </span>
          {/* Mode chip */}
          {isPlatform ? (
            <span style={{ padding:'1.5px 5px', borderRadius:4, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.10)', fontSize:8.5, fontWeight:700, color:'rgba(255,255,255,0.40)', letterSpacing:'0.05em', textTransform:'uppercase' }}>
              App
            </span>
          ) : (
            <span style={{ padding:'1.5px 5px', borderRadius:4, background:'rgba(34,211,238,0.08)', border:'1px solid rgba(34,211,238,0.18)', fontSize:8.5, fontWeight:700, color:'rgba(34,211,238,0.75)', letterSpacing:'0.05em', textTransform:'uppercase' }}>
              Built-in
            </span>
          )}
          {/* Active check */}
          {isActive && (
            <CheckIcon size={11} color={editor.color} style={{ marginLeft:'auto', flexShrink:0 }} />
          )}
        </div>
        <p style={{ margin:0, fontSize:10.5, color:'rgba(255,255,255,0.40)', lineHeight:1.45 }}>
          {editor.tagline}
        </p>
        {/* Launch hint for platform editors */}
        {isPlatform && (
          <div style={{ marginTop:6, display:'flex', alignItems:'center', gap:4 }}>
            <ExternalLink size={9} color={editor.color} />
            <span style={{ fontSize:9.5, color:editor.color, fontWeight:600 }}>Opens in editor page</span>
          </div>
        )}
      </div>
    </button>
  );
}

const UFV_GLOBAL_STYLES = `
@keyframes ufv-fade { from{opacity:0} to{opacity:1} }
@keyframes ufv-in   { from{opacity:0; transform:scale(0.985)} to{opacity:1; transform:none} }
@keyframes ufv-spin { to{transform:rotate(360deg)} }
@keyframes ufv-slide-up { from{opacity:0; transform:translateY(8px)} to{opacity:1; transform:none} }
@keyframes ufv-panel-in { from{opacity:0; transform:translateX(14px)} to{opacity:1; transform:none} }

.ufv-scroll::-webkit-scrollbar { width: 9px; height: 9px; }
.ufv-scroll::-webkit-scrollbar-track { background: transparent; }
.ufv-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 999px; }
.ufv-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.16); }

.ufv-toolbar-btn { transition: background 0.10s ease, color 0.10s ease; }
.ufv-toolbar-btn:hover { background: rgba(255,255,255,0.10) !important; color: rgba(255,255,255,0.95) !important; }
.ufv-toolbar-btn:disabled { opacity: 0.35; cursor: not-allowed !important; }

@keyframes ufv-panel-in { from{opacity:0;transform:translateX(18px)} to{opacity:1;transform:none} }

.ufv-doc-html { color: rgba(255,255,255,0.86); line-height: 1.65; font-size: 14.5px; }
.ufv-doc-html h1 { font-size: 26px; margin: 24px 0 12px; font-weight: 700; letter-spacing: -0.02em; color: #fff; }
.ufv-doc-html h2 { font-size: 22px; margin: 22px 0 10px; font-weight: 700; letter-spacing: -0.015em; color: rgba(255,255,255,0.94); }
.ufv-doc-html h3 { font-size: 18px; margin: 18px 0 8px; font-weight: 700; color: rgba(255,255,255,0.90); }
.ufv-doc-html h4, .ufv-doc-html h5, .ufv-doc-html h6 { font-size: 15px; margin: 14px 0 6px; font-weight: 700; color: rgba(255,255,255,0.88); }
.ufv-doc-html p { margin: 10px 0; }
.ufv-doc-html ul, .ufv-doc-html ol { margin: 10px 0; padding-left: 24px; }
.ufv-doc-html li { margin: 4px 0; }
.ufv-doc-html blockquote { border-left: 3px solid rgba(167,139,250,0.45); padding: 4px 14px; margin: 12px 0; color: rgba(255,255,255,0.62); background: rgba(167,139,250,0.05); border-radius: 4px; }
.ufv-doc-html code { background: rgba(255,255,255,0.07); padding: 1.5px 6px; border-radius: 4px; font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 0.9em; color: #fde68a; }
.ufv-doc-html pre { background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 12px 14px; overflow-x: auto; margin: 12px 0; }
.ufv-doc-html pre code { background: transparent; padding: 0; color: rgba(255,255,255,0.85); }
.ufv-doc-html a { color: #93c5fd; text-decoration: underline; text-decoration-color: rgba(147,197,253,0.3); text-underline-offset: 2px; }
.ufv-doc-html a:hover { text-decoration-color: #93c5fd; }
.ufv-doc-html table { border-collapse: collapse; margin: 12px 0; width: 100%; font-size: 13.5px; }
.ufv-doc-html th, .ufv-doc-html td { border: 1px solid rgba(255,255,255,0.10); padding: 8px 12px; text-align: left; }
.ufv-doc-html th { background: rgba(255,255,255,0.05); font-weight: 700; }
.ufv-doc-html img { max-width: 100%; height: auto; border-radius: 6px; margin: 10px 0; }
.ufv-doc-html hr { border: none; height: 1px; background: rgba(255,255,255,0.08); margin: 18px 0; }
.ufv-doc-html strong { color: rgba(255,255,255,0.96); font-weight: 700; }
.ufv-doc-html em { color: rgba(255,255,255,0.84); }

.ufv-sheet-table { border-collapse: collapse; font-size: 12.5px; font-variant-numeric: tabular-nums; }
.ufv-sheet-table th { background: rgba(74,222,128,0.08); border: 1px solid rgba(255,255,255,0.07); color: rgba(255,255,255,0.6); font-weight: 700; font-size: 11px; padding: 6px 10px; text-align: left; position: sticky; top: 0; z-index: 2; }
.ufv-sheet-table td { background: rgba(255,255,255,0.012); border: 1px solid rgba(255,255,255,0.05); color: rgba(255,255,255,0.84); padding: 6px 10px; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ufv-sheet-table tr:hover td { background: rgba(74,222,128,0.04); }
.ufv-sheet-rownum { background: rgba(255,255,255,0.04) !important; color: rgba(255,255,255,0.30) !important; font-size: 10.5px !important; text-align: right !important; font-weight: 600 !important; position: sticky; left: 0; z-index: 1; }

/* code highlighting */
.ufv-code-tok-kw   { color: #c084fc; }
.ufv-code-tok-str  { color: #86efac; }
.ufv-code-tok-num  { color: #fcd34d; }
.ufv-code-tok-com  { color: #6b7280; font-style: italic; }
.ufv-code-tok-fn   { color: #93c5fd; }
.ufv-code-tok-op   { color: #fda4af; }
.ufv-code-tok-typ  { color: #5eead4; }
.ufv-code-tok-tag  { color: #f472b6; }
.ufv-code-tok-attr { color: #fbbf24; }
.ufv-code-tok-prop { color: #67e8f9; }
.ufv-code-tok-punc { color: rgba(255,255,255,0.45); }

.ufv-tree-row { transition: background 0.08s ease; cursor: pointer; }
.ufv-tree-row:hover { background: rgba(255,255,255,0.05); }
`;

/* ═══════════════════════════════════════════════════════════════════════════
   STATUS / SHELLS
   ═══════════════════════════════════════════════════════════════════════════ */
function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', padding:24, textAlign:'center' }}>
      {children}
    </div>
  );
}

function LoadingShell({ label }: { label: string }) {
  return (
    <Centered>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
        <Loader2 size={24} color="#a78bfa" style={{ animation:'ufv-spin 0.85s linear infinite' }} />
        <p style={{ margin:0, fontSize:12, color:'rgba(255,255,255,0.45)' }}>{label}</p>
      </div>
    </Centered>
  );
}

function ErrorShell({ msg }: { msg: string }) {
  return (
    <Centered>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10, maxWidth:380 }}>
        <div style={{ width:44, height:44, borderRadius:14, background:'rgba(248,113,113,0.12)', border:'1px solid rgba(248,113,113,0.22)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <AlertCircle size={20} color="#f87171" />
        </div>
        <p style={{ margin:0, fontSize:13, fontWeight:700, color:'rgba(255,255,255,0.80)' }}>Preview unavailable</p>
        <p style={{ margin:0, fontSize:11.5, color:'rgba(255,255,255,0.40)', lineHeight:1.55 }}>{msg}</p>
      </div>
    </Centered>
  );
}

function UnsupportedShell({ name, ext }: { name: string; ext: string }) {
  return (
    <Centered>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10, maxWidth:360 }}>
        <div style={{ width:48, height:48, borderRadius:14, background:'rgba(148,163,184,0.10)', border:'1px solid rgba(148,163,184,0.18)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <ZapOff size={22} color="rgba(255,255,255,0.45)" />
        </div>
        <p style={{ margin:0, fontSize:13, fontWeight:700, color:'rgba(255,255,255,0.78)' }}>No preview for .{ext || '?'}</p>
        <p style={{ margin:0, fontSize:11.5, color:'rgba(255,255,255,0.38)', lineHeight:1.5 }}>
          Download {name} to open it in its native application.
        </p>
      </div>
    </Centered>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   VIEWER SWITCH
   ═══════════════════════════════════════════════════════════════════════════ */
function ViewerSwitch({ file, meta }: { file: ViewableFile; meta: ReturnType<typeof detectKind> }) {
  switch (meta.kind) {
    case 'pdf':       return <PdfRenderer file={file} />;
    case 'docx':      return <DocxRenderer file={file} />;
    case 'sheet':     return <SheetRenderer file={file} ext={meta.ext} />;
    case 'pptx':      return <PptxRenderer file={file} />;
    case 'text':      return <TextRenderer file={file} />;
    case 'markdown':  return <MarkdownRenderer file={file} />;
    case 'json':      return <JsonRenderer file={file} />;
    case 'xml':       return <XmlRenderer file={file} />;
    case 'code':      return <CodeRenderer file={file} lang={CODE_LANG[meta.ext] ?? meta.ext} />;
    case 'image':     return <ImageRenderer file={file} />;
    case 'svg':       return <ImageRenderer file={file} />;
    case 'video':     return <VideoRenderer file={file} />;
    case 'audio':     return <AudioRenderer file={file} />;
    case 'archive':   return <ArchiveRenderer file={file} />;
    case 'epub':      return <EpubRenderer file={file} />;
    case 'html':      return <HtmlRenderer file={file} />;
    default:          return <UnsupportedShell name={file.name} ext={meta.ext} />;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   PDF RENDERER — pdfjs-dist canvas with paging + zoom
   ═══════════════════════════════════════════════════════════════════════════ */
function PdfRenderer({ file }: { file: ViewableFile }) {
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [err, setErr] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<any>(null);

  /* load doc */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setErr(null); setPdfDoc(null); setPageCount(0); setPage(1);
        const pdfjsLib: any = await import('pdfjs-dist/legacy/build/pdf.min.mjs');
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        }
        const buf = await file.blob.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: buf }).promise;
        if (cancelled) { try { doc.destroy(); } catch {} return; }
        setPdfDoc(doc); setPageCount(doc.numPages);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load PDF');
      }
    })();
    return () => { cancelled = true; };
  }, [file]);

  /* render page */
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const pdfPage = await pdfDoc.getPage(page);
        if (cancelled) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const containerWidth = canvasRef.current!.parentElement!.clientWidth - 32;
        const fitScale = Math.min(containerWidth / baseViewport.width, 1.6);
        const scale = fitScale * zoom * dpr;
        const viewport = pdfPage.getViewport({ scale });
        const canvas = canvasRef.current!;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${viewport.width / dpr}px`;
        canvas.style.height = `${viewport.height / dpr}px`;
        const ctx = canvas.getContext('2d')!;
        if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch {} }
        const task = pdfPage.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
      } catch (e: any) {
        if (e?.name !== 'RenderingCancelledException' && !cancelled) {
          setErr(e instanceof Error ? e.message : 'Render error');
        }
      }
    })();
    return () => { cancelled = true; if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch {} } };
  }, [pdfDoc, page, zoom]);

  if (err) return <ErrorShell msg={err} />;
  if (!pdfDoc) return <LoadingShell label="Loading PDF…" />;

  return (
    <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column' }}>
      <PdfToolbar
        page={page} pageCount={pageCount} zoom={zoom}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => Math.min(pageCount, p + 1))}
        onJump={(p) => setPage(Math.max(1, Math.min(pageCount, p)))}
        onZoomIn={() => setZoom((z) => Math.min(3, +(z + 0.2).toFixed(2)))}
        onZoomOut={() => setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(2)))}
        onZoomReset={() => setZoom(1)}
      />
      <div className="ufv-scroll" style={{ flex:1, overflow:'auto', display:'flex', justifyContent:'center', alignItems:'flex-start', padding:16 }}>
        <canvas ref={canvasRef} style={{ background:'#fff', boxShadow:'0 4px 30px rgba(0,0,0,0.55)', borderRadius:4, animation:'ufv-slide-up 0.18s ease both' }} />
      </div>
    </div>
  );
}

function PdfToolbar(props: {
  page: number; pageCount: number; zoom: number;
  onPrev: () => void; onNext: () => void; onJump: (p: number) => void;
  onZoomIn: () => void; onZoomOut: () => void; onZoomReset: () => void;
}) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'rgba(0,0,0,0.55)', borderBottom:'1px solid rgba(255,255,255,0.05)', flexShrink:0 }}>
      <button type="button" className="ufv-toolbar-btn" onClick={props.onPrev} disabled={props.page <= 1}
        style={ufvBtnStyle()} title="Previous page">
        <ChevronLeft size={14} />
      </button>
      <div style={{ display:'flex', alignItems:'center', gap:5, padding:'0 8px', height:30, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:9 }}>
        <input
          type="number" min={1} max={props.pageCount} value={props.page}
          onChange={(e) => props.onJump(parseInt(e.target.value, 10) || 1)}
          style={{ width:38, border:'none', background:'transparent', outline:'none', color:'rgba(255,255,255,0.85)', fontSize:12, fontWeight:600, textAlign:'right', fontVariantNumeric:'tabular-nums' }}
        />
        <span style={{ fontSize:11, color:'rgba(255,255,255,0.32)' }}>/ {props.pageCount}</span>
      </div>
      <button type="button" className="ufv-toolbar-btn" onClick={props.onNext} disabled={props.page >= props.pageCount}
        style={ufvBtnStyle()} title="Next page">
        <ChevronRight size={14} />
      </button>

      <div style={{ flex:1 }} />

      <button type="button" className="ufv-toolbar-btn" onClick={props.onZoomOut} style={ufvBtnStyle()} title="Zoom out">
        <ZoomOut size={13} />
      </button>
      <button type="button" className="ufv-toolbar-btn" onClick={props.onZoomReset}
        style={{ ...ufvBtnStyle(), width:'auto', padding:'0 10px', fontSize:11.5, fontWeight:700, color:'rgba(255,255,255,0.65)' }}
        title="Reset zoom">
        {Math.round(props.zoom * 100)}%
      </button>
      <button type="button" className="ufv-toolbar-btn" onClick={props.onZoomIn} style={ufvBtnStyle()} title="Zoom in">
        <ZoomIn size={13} />
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   DOCX RENDERER — mammoth → styled HTML
   ═══════════════════════════════════════════════════════════════════════════ */
function DocxRenderer({ file }: { file: ViewableFile }) {
  const [html, setHtml] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ext = getExt(file.name);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setErr(null); setHtml(null);
        if (ext === 'doc' || ext === 'rtf' || ext === 'odt') {
          throw new Error(`Live preview is only available for .docx. Download to open .${ext}.`);
        }
        const mammoth = await import('mammoth');
        const arrayBuffer = await file.blob.arrayBuffer();
        const { value } = await mammoth.convertToHtml({ arrayBuffer });
        if (!cancelled) setHtml(value || '<p style="opacity:0.4">Document appears to be empty.</p>');
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load document');
      }
    })();
    return () => { cancelled = true; };
  }, [file, ext]);

  if (err) return <ErrorShell msg={err} />;
  if (html == null) return <LoadingShell label="Converting document…" />;

  return (
    <div className="ufv-scroll" style={{ position:'absolute', inset:0, overflow:'auto' }}>
      <div style={{ maxWidth:820, margin:'0 auto', padding:'32px 38px 60px' }}>
        <div className="ufv-doc-html" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SPREADSHEET RENDERER — xlsx/csv/tsv with sheet tabs
   ═══════════════════════════════════════════════════════════════════════════ */
function SheetRenderer({ file, ext }: { file: ViewableFile; ext: string }) {
  const [book, setBook] = useState<{ name: string; rows: string[][] }[] | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setErr(null); setBook(null); setActiveIdx(0);
        const XLSX: any = await import('xlsx');
        const data = await file.blob.arrayBuffer();
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const sheets = (wb.SheetNames as string[]).map((name) => {
          const ws = wb.Sheets[name];
          const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
          return { name, rows };
        });
        if (!cancelled) setBook(sheets);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load spreadsheet');
      }
    })();
    return () => { cancelled = true; };
  }, [file]);

  // Must be called before any early returns to satisfy Rules of Hooks
  const sheet   = book?.[activeIdx];
  const maxCols = sheet?.rows.reduce((m, r) => Math.max(m, r.length), 0) ?? 0;
  const colHeaders = useMemo(() => Array.from({ length: maxCols }, (_, i) => xlsColLabel(i)), [maxCols]);

  if (err) return <ErrorShell msg={err} />;
  if (!book) return <LoadingShell label="Parsing spreadsheet…" />;

  return (
    <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column' }}>
      {book.length > 1 && (
        <div className="ufv-scroll" style={{ display:'flex', gap:4, padding:'8px 12px', background:'rgba(0,0,0,0.40)', borderBottom:'1px solid rgba(255,255,255,0.04)', overflowX:'auto', flexShrink:0 }}>
          {book.map((s, i) => (
            <button
              key={s.name + i} type="button" onClick={() => setActiveIdx(i)}
              style={{
                padding:'5px 12px', borderRadius:8, fontSize:11.5, fontWeight:600,
                background: i === activeIdx ? 'rgba(74,222,128,0.16)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${i === activeIdx ? 'rgba(74,222,128,0.30)' : 'rgba(255,255,255,0.07)'}`,
                color: i === activeIdx ? '#86efac' : 'rgba(255,255,255,0.55)',
                cursor:'pointer', flexShrink:0,
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="ufv-scroll" style={{ flex:1, overflow:'auto', padding:14 }}>
        {(!sheet || sheet.rows.length === 0) ? (
          <p style={{ margin:0, padding:32, textAlign:'center', fontSize:12, color:'rgba(255,255,255,0.35)' }}>
            This sheet is empty.
          </p>
        ) : (
          <table className="ufv-sheet-table">
            <thead>
              <tr>
                <th className="ufv-sheet-rownum"></th>
                {colHeaders.map((h) => (<th key={h}>{h}</th>))}
              </tr>
            </thead>
            <tbody>
              {sheet.rows.slice(0, 5000).map((row, ri) => (
                <tr key={ri}>
                  <td className="ufv-sheet-rownum">{ri + 1}</td>
                  {colHeaders.map((_, ci) => (
                    <td key={ci} title={row[ci] ?? ''}>{row[ci] ?? ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {sheet && sheet.rows.length > 5000 && (
          <p style={{ marginTop:14, fontSize:11, color:'rgba(255,255,255,0.32)', textAlign:'center' }}>
            Showing first 5,000 rows of {sheet.rows.length.toLocaleString()}.
          </p>
        )}
      </div>
    </div>
  );
}

function xlsColLabel(idx: number): string {
  let s = ''; let n = idx;
  while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; }
  return s;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PPTX RENDERER — parse slides from XML, render text outline
   ═══════════════════════════════════════════════════════════════════════════ */
function PptxRenderer({ file }: { file: ViewableFile }) {
  const [slides, setSlides] = useState<{ idx: number; title: string; body: string[] }[] | null>(null);
  const [active, setActive] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const ext = getExt(file.name);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setErr(null); setSlides(null); setActive(0);
        if (ext === 'ppt' || ext === 'odp') {
          throw new Error(`Live preview is only available for .pptx. Download to open .${ext}.`);
        }
        const JSZip: any = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(await file.blob.arrayBuffer());
        const slidePaths = Object.keys(zip.files)
          .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
          .sort((a, b) => {
            const na = parseInt(a.match(/slide(\d+)\.xml/)?.[1] ?? '0', 10);
            const nb = parseInt(b.match(/slide(\d+)\.xml/)?.[1] ?? '0', 10);
            return na - nb;
          });
        const out: { idx: number; title: string; body: string[] }[] = [];
        for (let i = 0; i < slidePaths.length; i++) {
          const xml = await zip.files[slidePaths[i]].async('string');
          const texts = extractPptxText(xml);
          const title = texts[0] || `Slide ${i + 1}`;
          const body = texts.slice(1);
          out.push({ idx: i + 1, title, body });
        }
        if (!cancelled) setSlides(out);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to parse presentation');
      }
    })();
    return () => { cancelled = true; };
  }, [file, ext]);

  if (err) return <ErrorShell msg={err} />;
  if (!slides) return <LoadingShell label="Parsing slides…" />;
  if (slides.length === 0) return <ErrorShell msg="No slides found in this presentation." />;

  const cur = slides[active];

  return (
    <div style={{ position:'absolute', inset:0, display:'flex' }}>
      {/* Thumbnail strip */}
      <div className="ufv-scroll" style={{ width:180, flexShrink:0, borderRight:'1px solid rgba(255,255,255,0.05)', overflow:'auto', padding:10, background:'rgba(0,0,0,0.35)' }}>
        {slides.map((s, i) => (
          <button key={s.idx} type="button" onClick={() => setActive(i)}
            style={{
              display:'block', width:'100%', textAlign:'left',
              padding:9, marginBottom:7, borderRadius:8,
              background: i === active ? 'rgba(251,146,60,0.14)' : 'rgba(255,255,255,0.025)',
              border: `1px solid ${i === active ? 'rgba(251,146,60,0.32)' : 'rgba(255,255,255,0.05)'}`,
              cursor:'pointer',
            }}>
            <div style={{ fontSize:9.5, color:'rgba(255,255,255,0.32)', fontWeight:700, letterSpacing:'0.06em' }}>SLIDE {s.idx}</div>
            <div style={{ marginTop:3, fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.78)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {s.title}
            </div>
          </button>
        ))}
      </div>

      {/* Current slide */}
      <div className="ufv-scroll" style={{ flex:1, overflow:'auto', padding:'32px 38px' }}>
        <div style={{ maxWidth:760, margin:'0 auto', background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'34px 36px', minHeight:380, animation:'ufv-slide-up 0.20s ease both' }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.08em', color:'#fb923c', textTransform:'uppercase', marginBottom:14 }}>
            Slide {cur.idx} of {slides.length}
          </div>
          <h1 style={{ margin:0, fontSize:26, fontWeight:700, letterSpacing:'-0.02em', color:'#fff', lineHeight:1.2 }}>
            {cur.title}
          </h1>
          {cur.body.length > 0 && (
            <ul style={{ marginTop:22, paddingLeft:22, color:'rgba(255,255,255,0.78)', fontSize:14.5, lineHeight:1.7 }}>
              {cur.body.map((t, i) => (<li key={i}>{t}</li>))}
            </ul>
          )}
        </div>
        <p style={{ marginTop:20, fontSize:10.5, color:'rgba(255,255,255,0.30)', textAlign:'center' }}>
          Text-based outline view. Download for the original layout.
        </p>
      </div>
    </div>
  );
}

function extractPptxText(xml: string): string[] {
  const out: string[] = [];
  const re = /<a:t[^>]*>([^<]*)<\/a:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const t = decodeXmlEntities(m[1]).trim();
    if (t) out.push(t);
  }
  return out;
}

function decodeXmlEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
          .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
}

/* ═══════════════════════════════════════════════════════════════════════════
   PLAIN TEXT
   ═══════════════════════════════════════════════════════════════════════════ */
function TextRenderer({ file }: { file: ViewableFile }) {
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    file.blob.text()
      .then((t) => { if (!cancelled) setText(t); })
      .catch((e) => { if (!cancelled) setErr(e instanceof Error ? e.message : 'Read error'); });
    return () => { cancelled = true; };
  }, [file]);
  if (err) return <ErrorShell msg={err} />;
  if (text == null) return <LoadingShell label="Reading…" />;
  return (
    <div className="ufv-scroll" style={{ position:'absolute', inset:0, overflow:'auto', padding:18 }}>
      <pre style={{ margin:0, fontFamily:"ui-monospace, 'SF Mono', Menlo, monospace", fontSize:13, lineHeight:1.65, color:'rgba(255,255,255,0.82)', whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
        {text}
      </pre>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MARKDOWN RENDERER — lightweight md → html (safe, no innerHTML execution risks)
   ═══════════════════════════════════════════════════════════════════════════ */
function MarkdownRenderer({ file }: { file: ViewableFile }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    file.blob.text().then((t) => !cancelled && setSrc(t)).catch((e) => !cancelled && setErr(String(e?.message ?? e)));
    return () => { cancelled = true; };
  }, [file]);
  const html = useMemo(() => (src != null ? renderMarkdown(src) : ''), [src]);
  if (err) return <ErrorShell msg={err} />;
  if (src == null) return <LoadingShell label="Rendering markdown…" />;
  return (
    <div className="ufv-scroll" style={{ position:'absolute', inset:0, overflow:'auto' }}>
      <div style={{ maxWidth:820, margin:'0 auto', padding:'34px 38px 60px' }}>
        <div className="ufv-doc-html" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderMarkdown(md: string): string {
  /* Block-level pre-pass: fenced code blocks */
  const codeBlocks: string[] = [];
  md = md.replace(/```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code data-lang="${escapeHtml(lang || '')}">${escapeHtml(code.replace(/\n$/, ''))}</code></pre>`);
    return ` CODEBLOCK${idx} `;
  });

  /* Block parsing */
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    /* Heading */
    const h = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }

    /* Horizontal rule */
    if (/^[-*_]{3,}\s*$/.test(line)) { out.push('<hr />'); i++; continue; }

    /* Blockquote (contiguous) */
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push(`<blockquote>${renderMarkdown(buf.join('\n'))}</blockquote>`);
      continue;
    }

    /* Unordered list */
    if (/^[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^[-*+]\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    /* Ordered list */
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\d+\.\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    /* Table */
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes('|')) {
      const headerCells = splitMdRow(line);
      i += 2; // skip separator
      const bodyRows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        bodyRows.push(splitMdRow(lines[i]));
        i++;
      }
      out.push(
        `<table><thead><tr>${headerCells.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>` +
        `<tbody>${bodyRows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
      );
      continue;
    }

    /* Blank line */
    if (line.trim() === '') { i++; continue; }

    /* Paragraph */
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,6}\s|>|[-*+]\s|\d+\.\s|[-*_]{3,}\s*$)/.test(lines[i])) {
      para.push(lines[i]); i++;
    }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }

  let html = out.join('\n');
  /* restore code blocks */
  html = html.replace(/ CODEBLOCK(\d+) /g, (_m, n) => codeBlocks[parseInt(n, 10)]);
  return html;
}

function splitMdRow(line: string): string[] {
  return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
}

function inline(s: string): string {
  s = escapeHtml(s);
  /* inline code */
  s = s.replace(/`([^`]+?)`/g, (_m, c) => `<code>${c}</code>`);
  /* images */
  s = s.replace(/!\[([^\]]*)\]\((https?:[^)\s]+)\)/g, (_m, a, u) => `<img alt="${a}" src="${u}" />`);
  /* links */
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (_m, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`);
  /* bold */
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  /* italic */
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
  return s;
}

/* ═══════════════════════════════════════════════════════════════════════════
   JSON RENDERER — pretty-printed, syntax-coloured
   ═══════════════════════════════════════════════════════════════════════════ */
function JsonRenderer({ file }: { file: ViewableFile }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    file.blob.text().then((t) => !cancelled && setSrc(t)).catch((e) => !cancelled && setErr(String(e?.message ?? e)));
    return () => { cancelled = true; };
  }, [file]);
  if (err) return <ErrorShell msg={err} />;
  if (src == null) return <LoadingShell label="Loading JSON…" />;

  let pretty = src; let parseErr: string | null = null;
  try { pretty = JSON.stringify(JSON.parse(src), null, 2); } catch (e) { parseErr = e instanceof Error ? e.message : 'Invalid JSON'; }
  const html = parseErr ? escapeHtml(src) : highlightJson(pretty);

  return (
    <div className="ufv-scroll" style={{ position:'absolute', inset:0, overflow:'auto', padding:16 }}>
      {parseErr && (
        <div style={{ marginBottom:12, padding:'8px 12px', background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.20)', borderRadius:9, fontSize:11.5, color:'#fca5a5' }}>
          JSON parse error: {parseErr}. Showing raw text.
        </div>
      )}
      <pre style={{ margin:0, fontFamily:"ui-monospace, 'SF Mono', Menlo, monospace", fontSize:12.5, lineHeight:1.65, color:'rgba(255,255,255,0.85)', whiteSpace:'pre-wrap' }}
        dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

function highlightJson(json: string): string {
  return escapeHtml(json)
    .replace(/(&quot;(?:\\.|[^&quot;\\])*&quot;)(\s*:)/g, '<span class="ufv-code-tok-prop">$1</span>$2')
    .replace(/:\s*(&quot;(?:\\.|[^&quot;\\])*&quot;)/g, ': <span class="ufv-code-tok-str">$1</span>')
    .replace(/(\b-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?\b)/g, '<span class="ufv-code-tok-num">$1</span>')
    .replace(/\b(true|false|null)\b/g, '<span class="ufv-code-tok-kw">$1</span>');
}

/* ═══════════════════════════════════════════════════════════════════════════
   XML RENDERER
   ═══════════════════════════════════════════════════════════════════════════ */
function XmlRenderer({ file }: { file: ViewableFile }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    file.blob.text().then((t) => !cancelled && setSrc(t)).catch((e) => !cancelled && setErr(String(e?.message ?? e)));
    return () => { cancelled = true; };
  }, [file]);
  const pretty = useMemo(() => (src != null ? prettyXml(src) : ''), [src]);
  const html = useMemo(() => highlightXml(pretty), [pretty]);
  if (err) return <ErrorShell msg={err} />;
  if (src == null) return <LoadingShell label="Loading XML…" />;
  return (
    <div className="ufv-scroll" style={{ position:'absolute', inset:0, overflow:'auto', padding:16 }}>
      <pre style={{ margin:0, fontFamily:"ui-monospace, 'SF Mono', Menlo, monospace", fontSize:12.5, lineHeight:1.65, color:'rgba(255,255,255,0.85)', whiteSpace:'pre' }}
        dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

function prettyXml(xml: string): string {
  try {
    const PADDING = '  ';
    const reg = /(>)(<)(\/*)/g;
    let xmlReformatted = xml.replace(reg, '$1\n$2$3');
    let pad = 0;
    return xmlReformatted.split('\n').map((node) => {
      let indent = 0;
      if (node.match(/.+<\/\w[^>]*>$/)) { indent = 0; }
      else if (node.match(/^<\/\w/) && pad > 0) { pad -= 1; }
      else if (node.match(/^<\w([^>]*[^/])?>.*$/)) { indent = 1; }
      else { indent = 0; }
      const out = PADDING.repeat(pad) + node;
      pad += indent;
      return out;
    }).join('\n');
  } catch { return xml; }
}

function highlightXml(s: string): string {
  s = escapeHtml(s);
  s = s.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="ufv-code-tok-com">$1</span>');
  s = s.replace(/(&lt;\/?)([\w:-]+)/g, '$1<span class="ufv-code-tok-tag">$2</span>');
  s = s.replace(/([\w:-]+)=(&quot;[^&]*?&quot;)/g, '<span class="ufv-code-tok-attr">$1</span>=<span class="ufv-code-tok-str">$2</span>');
  return s;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CODE RENDERER — regex-based multi-language highlighting
   ═══════════════════════════════════════════════════════════════════════════ */
function CodeRenderer({ file, lang }: { file: ViewableFile; lang: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [wrap, setWrap] = useState(false);
  useEffect(() => {
    let cancelled = false;
    file.blob.text().then((t) => !cancelled && setSrc(t)).catch((e) => !cancelled && setErr(String(e?.message ?? e)));
    return () => { cancelled = true; };
  }, [file]);
  const html = useMemo(() => (src != null ? highlightCode(src, lang) : ''), [src, lang]);
  if (err) return <ErrorShell msg={err} />;
  if (src == null) return <LoadingShell label="Reading source…" />;

  const lines = src.split(/\r?\n/);
  const htmlLines = html.split('\n');

  return (
    <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 12px', background:'rgba(0,0,0,0.45)', borderBottom:'1px solid rgba(255,255,255,0.05)', flexShrink:0 }}>
        <div style={{ padding:'3px 8px', borderRadius:6, background:'rgba(34,211,238,0.10)', border:'1px solid rgba(34,211,238,0.22)', fontSize:10.5, fontWeight:700, color:'#67e8f9', letterSpacing:'0.04em', textTransform:'uppercase' }}>
          {lang || 'text'}
        </div>
        <span style={{ fontSize:10.5, color:'rgba(255,255,255,0.35)' }}>{lines.length.toLocaleString()} lines</span>
        <div style={{ flex:1 }} />
        <button type="button" className="ufv-toolbar-btn" onClick={() => setWrap((w) => !w)}
          style={{ ...ufvBtnStyle(wrap), width:'auto', padding:'0 10px', fontSize:11, fontWeight:600 }}
          title="Toggle word wrap">
          <Palette size={11} style={{ marginRight:6 }} />Wrap
        </button>
      </div>
      <div className="ufv-scroll" style={{ flex:1, overflow:'auto' }}>
        <table style={{ borderCollapse:'collapse', fontFamily:"ui-monospace, 'SF Mono', Menlo, monospace", fontSize:12.5, lineHeight:1.65 }}>
          <tbody>
            {htmlLines.map((ln, i) => (
              <tr key={i}>
                <td style={{ padding:'0 12px 0 14px', color:'rgba(255,255,255,0.18)', textAlign:'right', userSelect:'none', borderRight:'1px solid rgba(255,255,255,0.05)', verticalAlign:'top', fontVariantNumeric:'tabular-nums' }}>
                  {i + 1}
                </td>
                <td style={{ padding:'0 16px', color:'rgba(255,255,255,0.86)', whiteSpace: wrap ? 'pre-wrap' : 'pre', wordBreak: wrap ? 'break-word' : 'normal' }}
                  dangerouslySetInnerHTML={{ __html: ln || '&nbsp;' }} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* Highly compact multi-language tokenizer. Not perfect, but handles common cases. */
function highlightCode(src: string, lang: string): string {
  const esc = escapeHtml(src);
  const familyJs = ['javascript', 'jsx', 'typescript', 'tsx'];
  const familyC  = ['c', 'cpp', 'csharp', 'java', 'kotlin', 'swift', 'dart', 'scala', 'go', 'rust'];
  const familySh = ['bash', 'shell'];
  const familyMl = ['html', 'xml', 'jsx', 'tsx'];
  const familyCss = ['css', 'scss', 'less', 'sass'];
  const familyData = ['yaml', 'toml', 'ini'];

  const KW_JS = ['await','async','break','case','catch','class','const','continue','debugger','default','delete','do','else','enum','export','extends','finally','for','from','function','if','import','in','instanceof','interface','let','new','null','of','public','private','protected','return','static','super','switch','this','throw','true','false','try','type','typeof','undefined','var','void','while','with','yield','as','readonly'];
  const KW_PY = ['False','None','True','and','as','assert','async','await','break','class','continue','def','del','elif','else','except','finally','for','from','global','if','import','in','is','lambda','nonlocal','not','or','pass','raise','return','try','while','with','yield'];
  const KW_RB = ['BEGIN','END','alias','and','begin','break','case','class','def','defined','do','else','elsif','end','ensure','false','for','if','in','module','next','nil','not','or','redo','rescue','retry','return','self','super','then','true','undef','unless','until','when','while','yield'];
  const KW_C  = ['auto','break','case','char','const','continue','default','do','double','else','enum','extern','float','for','goto','if','inline','int','long','register','restrict','return','short','signed','sizeof','static','struct','switch','typedef','union','unsigned','void','volatile','while','class','public','private','protected','virtual','new','delete','this','namespace','using','template','typename','operator','friend','explicit','export','mutable','nullptr','override','final','noexcept','constexpr','decltype','catch','throw','try','true','false','null','func','let','var','fn','impl','match','mod','pub','self','trait','use','where','dyn','async','await','box','crate','move','ref'];
  const KW_SH = ['if','then','else','elif','fi','case','esac','for','while','until','do','done','in','function','select','time','return','exit','break','continue','export','readonly','local','declare','typeset','source','alias','unalias','set','unset','test'];
  const KW_SQL = ['SELECT','FROM','WHERE','INSERT','INTO','VALUES','UPDATE','SET','DELETE','CREATE','TABLE','DROP','ALTER','ADD','PRIMARY','KEY','FOREIGN','REFERENCES','NOT','NULL','UNIQUE','INDEX','JOIN','LEFT','RIGHT','INNER','OUTER','ON','AS','AND','OR','IN','IS','LIKE','BETWEEN','GROUP','BY','ORDER','HAVING','LIMIT','OFFSET','UNION','ALL','DISTINCT','CASE','WHEN','THEN','ELSE','END','CAST','COALESCE','EXISTS','TRIGGER','PROCEDURE','FUNCTION','VIEW','BEGIN','COMMIT','ROLLBACK','TRANSACTION'];

  type Rule = { re: RegExp; cls: string };
  let rules: Rule[];

  if (familyMl.includes(lang)) {
    rules = [
      { re: /(&lt;!--[\s\S]*?--&gt;)/g, cls: 'com' },
      { re: /(&lt;\/?)([a-zA-Z][\w-]*)/g, cls: '__tag2' },
      { re: /([\w-]+)=(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;)/g, cls: '__attr' },
    ];
  } else if (familyCss.includes(lang)) {
    rules = [
      { re: /(\/\*[\s\S]*?\*\/)/g, cls: 'com' },
      { re: /([\w-]+)(\s*:)/g, cls: '__cssprop' },
      { re: /(&quot;[^&]*&quot;|&#39;[^&]*&#39;)/g, cls: 'str' },
      { re: /(#[0-9a-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|em|rem|%|vw|vh|deg|ms|s)?\b)/g, cls: 'num' },
    ];
  } else if (lang === 'sql') {
    rules = [
      { re: /(--[^\n]*)/g, cls: 'com' },
      { re: /(\/\*[\s\S]*?\*\/)/g, cls: 'com' },
      { re: /(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;)/g, cls: 'str' },
      { re: new RegExp(`\\b(${KW_SQL.join('|')})\\b`, 'gi'), cls: 'kw' },
      { re: /\b\d+(?:\.\d+)?\b/g, cls: 'num' },
    ];
  } else if (familyData.includes(lang)) {
    rules = [
      { re: /(#[^\n]*)/g, cls: 'com' },
      { re: /(^|\n)(\s*)([\w.-]+)(\s*:)/g, cls: '__yamlkey' },
      { re: /(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;)/g, cls: 'str' },
      { re: /\b(true|false|null|yes|no|on|off)\b/gi, cls: 'kw' },
      { re: /\b-?\d+(?:\.\d+)?\b/g, cls: 'num' },
    ];
  } else {
    let kws: string[] = KW_JS;
    if (lang === 'python') kws = KW_PY;
    else if (lang === 'ruby') kws = KW_RB;
    else if (familyC.includes(lang)) kws = KW_C;
    else if (familySh.includes(lang)) kws = KW_SH;
    const commentRe = (lang === 'python' || lang === 'ruby' || familySh.includes(lang))
      ? /(#[^\n]*)/g
      : /(\/\/[^\n]*)|(\/\*[\s\S]*?\*\/)/g;
    rules = [
      { re: commentRe, cls: 'com' },
      { re: /(&quot;(?:\\.|[^&quot;\\])*?&quot;|&#39;(?:\\.|[^&#39;\\])*?&#39;|`(?:\\.|[^`\\])*?`)/g, cls: 'str' },
      { re: new RegExp(`\\b(${kws.join('|')})\\b`, 'g'), cls: 'kw' },
      { re: /\b([A-Z][A-Za-z0-9_]+)\b/g, cls: 'typ' },
      { re: /\b([a-z_$][a-zA-Z0-9_$]*)\s*(?=\()/g, cls: '__fn' },
      { re: /\b-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?\b/g, cls: 'num' },
    ];
  }

  /* Apply each rule on the unmarked spans only — to avoid double-wrap, we use a single pass with sentinel markers */
  const tokens: { start: number; end: number; cls: string }[] = [];
  for (const r of rules) {
    r.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = r.re.exec(esc)) !== null) {
      const start = m.index;
      const end   = start + m[0].length;
      if (tokens.some((t) => start < t.end && end > t.start)) continue;
      let cls = r.cls;
      let s = start, e = end, content = m[0];
      if (cls === '__tag2') {
        // already matched both opening/closing + tag name; split: m[1] = punctuation, m[2] = tag name
        const punct = m[1]; const tag = m[2];
        tokens.push({ start, end: start + punct.length, cls: 'punc' });
        tokens.push({ start: start + punct.length, end, cls: 'tag' });
        continue;
      }
      if (cls === '__attr') {
        const name = m[1]; const val = m[2];
        const nameStart = start; const eqStart = nameStart + name.length;
        const valStart = eqStart + 1;
        tokens.push({ start: nameStart, end: nameStart + name.length, cls: 'attr' });
        tokens.push({ start: valStart, end: valStart + val.length, cls: 'str' });
        continue;
      }
      if (cls === '__cssprop') {
        const prop = m[1]; tokens.push({ start, end: start + prop.length, cls: 'prop' });
        continue;
      }
      if (cls === '__yamlkey') {
        const pre = m[1] + m[2]; const key = m[3];
        const keyStart = start + pre.length;
        tokens.push({ start: keyStart, end: keyStart + key.length, cls: 'prop' });
        continue;
      }
      if (cls === '__fn') {
        const name = m[1];
        // skip keywords
        if (['if','for','while','switch','catch','return','typeof','instanceof','new','delete','in','of','await','async','function','class'].includes(name)) continue;
        tokens.push({ start, end: start + name.length, cls: 'fn' });
        continue;
      }
      tokens.push({ start: s, end: e, cls });
    }
  }
  /* Sort tokens & emit */
  tokens.sort((a, b) => a.start - b.start);
  let out = ''; let cursor = 0;
  for (const t of tokens) {
    if (t.start < cursor) continue;
    if (t.start > cursor) out += esc.slice(cursor, t.start);
    out += `<span class="ufv-code-tok-${t.cls}">${esc.slice(t.start, t.end)}</span>`;
    cursor = t.end;
  }
  if (cursor < esc.length) out += esc.slice(cursor);
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
   IMAGE RENDERER — pan/zoom
   ═══════════════════════════════════════════════════════════════════════════ */
function ImageRenderer({ file }: { file: ViewableFile }) {
  const [url, setUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rot, setRot] = useState(0);

  useEffect(() => {
    const u = URL.createObjectURL(file.blob);
    setUrl(u); setZoom(1); setRot(0);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  if (!url) return <LoadingShell label="Loading image…" />;

  return (
    <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'rgba(0,0,0,0.45)', borderBottom:'1px solid rgba(255,255,255,0.05)', flexShrink:0 }}>
        <button type="button" className="ufv-toolbar-btn" onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.25).toFixed(2)))} style={ufvBtnStyle()} title="Zoom out"><ZoomOut size={13} /></button>
        <button type="button" className="ufv-toolbar-btn" onClick={() => setZoom(1)} style={{ ...ufvBtnStyle(), width:'auto', padding:'0 10px', fontSize:11.5, fontWeight:700 }}>{Math.round(zoom * 100)}%</button>
        <button type="button" className="ufv-toolbar-btn" onClick={() => setZoom((z) => Math.min(8, +(z + 0.25).toFixed(2)))} style={ufvBtnStyle()} title="Zoom in"><ZoomIn size={13} /></button>
        <div style={{ width:1, height:18, background:'rgba(255,255,255,0.08)' }} />
        <button type="button" className="ufv-toolbar-btn" onClick={() => setRot((r) => (r + 90) % 360)} style={ufvBtnStyle()} title="Rotate"><RotateCw size={13} /></button>
        <div style={{ flex:1 }} />
        <button type="button" className="ufv-toolbar-btn" onClick={() => { setZoom(1); setRot(0); }} style={{ ...ufvBtnStyle(), width:'auto', padding:'0 10px', fontSize:11, fontWeight:600 }}>
          <Maximize2 size={11} style={{ marginRight:6 }} />Fit
        </button>
      </div>
      <div className="ufv-scroll" style={{ flex:1, overflow:'auto', display:'flex', alignItems:'center', justifyContent:'center', padding:18, background:'repeating-conic-gradient(rgba(255,255,255,0.018) 0 25%, transparent 0 50%) 0 0/24px 24px' }}>
        <img
          src={url}
          alt={file.name}
          style={{
            maxWidth: zoom === 1 ? '100%' : 'none',
            maxHeight: zoom === 1 ? '100%' : 'none',
            transform: `scale(${zoom}) rotate(${rot}deg)`,
            transformOrigin: 'center',
            transition: 'transform 0.15s ease',
            boxShadow: '0 6px 36px rgba(0,0,0,0.55)',
            background: '#fff',
            borderRadius: 4,
          }}
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   VIDEO RENDERER
   ═══════════════════════════════════════════════════════════════════════════ */
function VideoRenderer({ file }: { file: ViewableFile }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { const u = URL.createObjectURL(file.blob); setUrl(u); return () => URL.revokeObjectURL(u); }, [file]);
  if (!url) return <LoadingShell label="Buffering video…" />;
  return (
    <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <video src={url} controls playsInline
        style={{ maxWidth:'100%', maxHeight:'100%', borderRadius:8, background:'#000', boxShadow:'0 6px 36px rgba(0,0,0,0.65)' }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   AUDIO RENDERER
   ═══════════════════════════════════════════════════════════════════════════ */
function AudioRenderer({ file }: { file: ViewableFile }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { const u = URL.createObjectURL(file.blob); setUrl(u); return () => URL.revokeObjectURL(u); }, [file]);
  if (!url) return <LoadingShell label="Loading audio…" />;
  return (
    <Centered>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:18, maxWidth:480, width:'100%' }}>
        <div style={{ width:96, height:96, borderRadius:24, background:'rgba(167,139,250,0.16)', border:'1px solid rgba(167,139,250,0.30)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 8px 36px rgba(167,139,250,0.30)' }}>
          <Music size={42} color="#a78bfa" />
        </div>
        <div style={{ textAlign:'center' }}>
          <p style={{ margin:0, fontSize:14, fontWeight:700, color:'rgba(255,255,255,0.90)' }}>{file.name}</p>
          <p style={{ margin:'4px 0 0', fontSize:11.5, color:'rgba(255,255,255,0.40)' }}>Audio file</p>
        </div>
        <audio src={url} controls style={{ width:'100%', maxWidth:420 }} />
      </div>
    </Centered>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ZIP/ARCHIVE RENDERER — tree explorer
   ═══════════════════════════════════════════════════════════════════════════ */
interface ZipNode { name: string; path: string; dir: boolean; size: number; entry?: any; children?: ZipNode[]; }

function ArchiveRenderer({ file }: { file: ViewableFile }) {
  const [root, setRoot] = useState<ZipNode | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['']));
  const [preview, setPreview] = useState<{ name: string; text: string } | null>(null);
  const [stats, setStats] = useState<{ files: number; bytes: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setErr(null); setRoot(null); setPreview(null);
        const JSZip: any = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(await file.blob.arrayBuffer());
        const r: ZipNode = { name: file.name, path: '', dir: true, size: 0, children: [] };
        let count = 0; let bytes = 0;
        Object.keys(zip.files).forEach((p) => {
          const entry = zip.files[p];
          const parts = p.split('/').filter(Boolean);
          let cur = r;
          for (let i = 0; i < parts.length; i++) {
            const isLast = i === parts.length - 1;
            const isDir = entry.dir && isLast;
            const partPath = parts.slice(0, i + 1).join('/');
            let found = cur.children!.find((c) => c.name === parts[i]);
            if (!found) {
              found = { name: parts[i], path: partPath, dir: isLast ? entry.dir : true, size: 0, children: [], entry: isLast && !entry.dir ? entry : undefined };
              cur.children!.push(found);
            }
            cur = found;
            if (isLast && !entry.dir) {
              found.size = (entry as any)._data?.uncompressedSize || 0;
              count++; bytes += found.size;
            }
          }
        });
        sortTree(r);
        if (!cancelled) { setRoot(r); setStats({ files: count, bytes }); }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Could not read archive');
      }
    })();
    return () => { cancelled = true; };
  }, [file]);

  const toggle = useCallback((path: string) => {
    setExpanded((s) => { const n = new Set(s); if (n.has(path)) n.delete(path); else n.add(path); return n; });
  }, []);

  const openEntry = useCallback(async (node: ZipNode) => {
    if (!node.entry) return;
    if (node.size > 5 * 1024 * 1024) {
      setPreview({ name: node.path, text: '[File too large to preview inline — extract to view]' });
      return;
    }
    try {
      const text = await node.entry.async('string');
      setPreview({ name: node.path, text });
    } catch {
      setPreview({ name: node.path, text: '[Binary file — preview unavailable]' });
    }
  }, []);

  if (err) return <ErrorShell msg={err} />;
  if (!root || !stats) return <LoadingShell label="Reading archive…" />;

  return (
    <div style={{ position:'absolute', inset:0, display:'flex' }}>
      <div className="ufv-scroll" style={{ width:340, flexShrink:0, borderRight:'1px solid rgba(255,255,255,0.05)', overflow:'auto', background:'rgba(0,0,0,0.30)', padding:'10px 6px' }}>
        <div style={{ padding:'6px 12px 10px', borderBottom:'1px solid rgba(255,255,255,0.04)', marginBottom:6 }}>
          <p style={{ margin:0, fontSize:10.5, color:'rgba(255,255,255,0.36)' }}>
            <span style={{ color:'#fbbf24', fontWeight:700 }}>{stats.files.toLocaleString()}</span> files · {fmtBytes(stats.bytes)}
          </p>
        </div>
        <ZipTree node={root} depth={0} expanded={expanded} onToggle={toggle} onOpen={openEntry} />
      </div>
      <div className="ufv-scroll" style={{ flex:1, overflow:'auto', padding:16 }}>
        {preview ? (
          <>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, padding:'6px 10px', background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:8 }}>
              <FileText size={12} color="rgba(255,255,255,0.45)" />
              <span style={{ fontSize:11.5, color:'rgba(255,255,255,0.70)', fontFamily:"ui-monospace, monospace" }}>{preview.name}</span>
            </div>
            <pre style={{ margin:0, fontFamily:"ui-monospace, 'SF Mono', Menlo, monospace", fontSize:12, lineHeight:1.6, color:'rgba(255,255,255,0.82)', whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
              {preview.text}
            </pre>
          </>
        ) : (
          <Centered>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10, maxWidth:300 }}>
              <FolderOpen size={32} color="rgba(255,255,255,0.18)" />
              <p style={{ margin:0, fontSize:12.5, color:'rgba(255,255,255,0.45)' }}>Select a file in the archive to preview it.</p>
            </div>
          </Centered>
        )}
      </div>
    </div>
  );
}

function sortTree(node: ZipNode) {
  if (!node.children) return;
  node.children.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
  node.children.forEach(sortTree);
}

function ZipTree({ node, depth, expanded, onToggle, onOpen }: {
  node: ZipNode; depth: number; expanded: Set<string>;
  onToggle: (p: string) => void; onOpen: (n: ZipNode) => void;
}) {
  if (!node.children) return null;
  return (
    <>
      {node.children.map((c) => {
        const open = expanded.has(c.path);
        return (
          <div key={c.path}>
            <div
              className="ufv-tree-row"
              onClick={() => c.dir ? onToggle(c.path) : onOpen(c)}
              style={{ display:'flex', alignItems:'center', gap:6, padding:`3px 8px 3px ${8 + depth * 14}px`, borderRadius:6 }}
            >
              {c.dir
                ? (open ? <FolderOpen size={12} color="#fbbf24" /> : <Folder size={12} color="rgba(251,191,36,0.7)" />)
                : <FileIconLib size={11} color="rgba(255,255,255,0.40)" />}
              <span style={{ fontSize:11.5, color:'rgba(255,255,255,0.78)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{c.name}</span>
              {!c.dir && <span style={{ fontSize:9.5, color:'rgba(255,255,255,0.25)', flexShrink:0 }}>{fmtBytes(c.size)}</span>}
            </div>
            {c.dir && open && <ZipTree node={c} depth={depth + 1} expanded={expanded} onToggle={onToggle} onOpen={onOpen} />}
          </div>
        );
      })}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   EPUB RENDERER — parse OPF + spine, render selected chapter
   ═══════════════════════════════════════════════════════════════════════════ */
function EpubRenderer({ file }: { file: ViewableFile }) {
  const [chapters, setChapters] = useState<{ id: string; title: string; html: string }[] | null>(null);
  const [active, setActive] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setErr(null); setChapters(null); setActive(0);
        const JSZip: any = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(await file.blob.arrayBuffer());
        const containerXml = await (zip.files['META-INF/container.xml']?.async('string') ?? Promise.resolve(''));
        const opfPath = /full-path=["']([^"']+)["']/.exec(containerXml)?.[1];
        if (!opfPath) throw new Error('Invalid EPUB — missing OPF reference');
        const opfXml = await zip.files[opfPath].async('string');
        const baseDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

        /* Manifest: id → href */
        const manifest: Record<string, string> = {};
        const manRe = /<item\s+[^>]*id=["']([^"']+)["'][^>]*href=["']([^"']+)["'][^>]*>/g;
        let m: RegExpExecArray | null;
        while ((m = manRe.exec(opfXml)) !== null) manifest[m[1]] = m[2];

        /* Spine order */
        const spine: string[] = [];
        const spRe = /<itemref\s+[^>]*idref=["']([^"']+)["']/g;
        while ((m = spRe.exec(opfXml)) !== null) spine.push(m[1]);

        const chs: { id: string; title: string; html: string }[] = [];
        for (let i = 0; i < spine.length; i++) {
          const id = spine[i];
          const href = manifest[id];
          if (!href) continue;
          const full = baseDir + href;
          const entry = zip.files[full] || zip.files[decodeURIComponent(full)];
          if (!entry) continue;
          const raw = await entry.async('string');
          const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(raw) || /<h1[^>]*>([^<]+)<\/h1>/i.exec(raw);
          const title = titleMatch ? decodeXmlEntities(titleMatch[1]) : `Chapter ${i + 1}`;
          const body = extractEpubBody(raw);
          chs.push({ id, title, html: sanitizeEpubHtml(body) });
        }
        if (!cancelled) setChapters(chs);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load EPUB');
      }
    })();
    return () => { cancelled = true; };
  }, [file]);

  if (err) return <ErrorShell msg={err} />;
  if (!chapters) return <LoadingShell label="Opening book…" />;
  if (chapters.length === 0) return <ErrorShell msg="No readable chapters in this EPUB." />;

  const cur = chapters[active];

  return (
    <div style={{ position:'absolute', inset:0, display:'flex' }}>
      <div className="ufv-scroll" style={{ width:220, flexShrink:0, borderRight:'1px solid rgba(255,255,255,0.05)', overflow:'auto', background:'rgba(0,0,0,0.35)', padding:'10px 6px' }}>
        <p style={{ margin:'4px 10px 8px', fontSize:9.5, fontWeight:700, color:'rgba(255,255,255,0.30)', letterSpacing:'0.08em', textTransform:'uppercase' }}>Contents</p>
        {chapters.map((c, i) => (
          <button key={c.id + i} type="button" onClick={() => setActive(i)}
            style={{
              display:'block', width:'100%', textAlign:'left',
              padding:'6px 10px', marginBottom:2, borderRadius:7,
              background: i === active ? 'rgba(192,132,252,0.16)' : 'transparent',
              border: `1px solid ${i === active ? 'rgba(192,132,252,0.30)' : 'transparent'}`,
              cursor:'pointer',
              color: i === active ? '#e9d5ff' : 'rgba(255,255,255,0.62)',
              fontSize:11.5, fontWeight: i === active ? 600 : 500,
            }}>
            {c.title}
          </button>
        ))}
      </div>
      <div className="ufv-scroll" style={{ flex:1, overflow:'auto' }}>
        <div style={{ maxWidth:720, margin:'0 auto', padding:'36px 42px 80px' }}>
          <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', color:'#c084fc', textTransform:'uppercase', marginBottom:10 }}>
            Chapter {active + 1} of {chapters.length}
          </div>
          <div className="ufv-doc-html" dangerouslySetInnerHTML={{ __html: cur.html }} />
        </div>
      </div>
    </div>
  );
}

function extractEpubBody(xhtml: string): string {
  const m = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(xhtml);
  return m ? m[1] : xhtml;
}

function sanitizeEpubHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<link[^>]*>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '');
}

/* ═══════════════════════════════════════════════════════════════════════════
   HTML RENDERER — sandboxed iframe
   ═══════════════════════════════════════════════════════════════════════════ */
function HtmlRenderer({ file }: { file: ViewableFile }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    let cancelled = false;
    file.blob.text()
      .then((t) => !cancelled && setSrc(t))
      .catch((e) => !cancelled && setErr(String(e?.message ?? e)));
    return () => { cancelled = true; };
  }, [file]);

  if (err) return <ErrorShell msg={err} />;
  if (src == null) return <LoadingShell label="Loading page…" />;

  return (
    <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 12px', background:'rgba(0,0,0,0.45)', borderBottom:'1px solid rgba(255,255,255,0.05)', flexShrink:0 }}>
        <button type="button" className="ufv-toolbar-btn" onClick={() => setShowSource(false)}
          style={{ ...ufvBtnStyle(!showSource), width:'auto', padding:'0 10px', fontSize:11, fontWeight:600 }}>
          <Eye size={11} style={{ marginRight:6 }} />Preview
        </button>
        <button type="button" className="ufv-toolbar-btn" onClick={() => setShowSource(true)}
          style={{ ...ufvBtnStyle(showSource), width:'auto', padding:'0 10px', fontSize:11, fontWeight:600 }}>
          <CodeIcon size={11} style={{ marginRight:6 }} />Source
        </button>
      </div>
      <div style={{ flex:1, minHeight:0, position:'relative' }}>
        {showSource ? (
          <CodeRenderer file={file} lang="html" />
        ) : (
          <iframe
            sandbox="allow-same-origin"
            srcDoc={src}
            style={{ width:'100%', height:'100%', border:'none', background:'#fff' }}
            title="HTML preview"
          />
        )}
      </div>
    </div>
  );
}
