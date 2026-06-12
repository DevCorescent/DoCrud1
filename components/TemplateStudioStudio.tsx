'use client';

import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignLeft,
  Calendar,
  ChevronRight,
  Code2,
  Copy,
  FileUp,
  Hash,
  ImagePlus,
  LayoutTemplate,
  Loader2,
  Mail,
  Maximize2,
  Monitor,
  Redo2,
  Save,
  Settings2,
  ShoppingBag,
  Sparkles,
  Smartphone,
  Tags,
  TextCursorInput,
  Undo2,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import type { DocumentField, DocumentTemplate } from '@/types/document';
import { escapeHtml, renderDocumentTemplate } from '@/lib/template';
import { renderPdfFileToPngPages } from '@/lib/client/render-pdf-pages';

type StudioTab = 'import' | 'basics' | 'branding' | 'builder' | 'template' | 'fields' | 'marketplace' | 'settings';

type StudioDraft = {
  name: string;
  category: string;
  description: string;
  fields: DocumentField[];
  headerHtml: string;
  bodyHtml: string;
  footerHtml: string;
  css: string;
};

type MarketplaceDraft = {
  publishEnabled: boolean;
  priceInr: number;
  tags: string;
  coverImageDataUrl: string;
};

type BrandingState = {
  headerEnabled: boolean;
  footerEnabled: boolean;
  brandName: string;
  subtitle: string;
  rightMeta: string;
  footerLeft: string;
  footerRight: string;
  logoDataUrl: string;
  logoMaxHeight: number;
  headerImageDataUrl: string;
  headerImageMaxHeight: number;
  footerImageDataUrl: string;
  footerImageMaxHeight: number;
};

const CATEGORY_OPTIONS = ['General', 'HR', 'Legal', 'Finance', 'Operations'] as const;
const FIELD_TYPES: DocumentField['type'][] = ['text', 'date', 'textarea', 'number', 'email', 'select', 'tel', 'url', 'checkbox', 'radio', 'image'];

type PageSize = 'A4' | 'Letter' | 'Legal' | 'Custom';
type PageSettings = {
  size: PageSize;
  widthMm: number;
  heightMm: number;
  marginMm: number;
  pageNumbersEnabled: boolean;
};

type BackgroundKind = 'solid' | 'gradient' | 'image';
type BackgroundState = {
  kind: BackgroundKind;
  solid: string;
  gradient: string;
  imageDataUrl: string;
  fit: 'cover' | 'contain';
};

type BuilderBlockType =
  | 'heading'
  | 'paragraph'
  | 'field'
  | 'divider'
  | 'spacer'
  | 'table'
  | 'section'
  | 'columns2'
  | 'image';
type BuilderCondition = {
  enabled: boolean;
  fieldName: string;
  mode: 'present' | 'equals';
  equalsValue: string;
};
type BuilderStyle = {
  align: 'left' | 'center' | 'right';
  padding: number;
  radius: number;
  border: boolean;
  borderColor: string;
  background: string;
  textColor: string;
  fontSize: number;
  fontWeight: 400 | 500 | 600 | 700;
};
type BuilderBlockBase = {
  id: string;
  type: BuilderBlockType;
  label: string;
  condition: BuilderCondition;
  style: BuilderStyle;
};
type HeadingBlock = BuilderBlockBase & { type: 'heading'; text: string; level: 1 | 2 | 3 };
type ParagraphBlock = BuilderBlockBase & { type: 'paragraph'; text: string };
type FieldBlock = BuilderBlockBase & { type: 'field'; fieldName: string; fieldLabel: string; showLabel: boolean };
type DividerBlock = BuilderBlockBase & { type: 'divider' };
type SpacerBlock = BuilderBlockBase & { type: 'spacer'; height: number };
type TableBlock = BuilderBlockBase & { type: 'table'; columns: number; rows: number; header: boolean; cells: string[] };
type SectionBlock = BuilderBlockBase & { type: 'section'; title: string; subtitle: string; children: BuilderBlock[] };
type Columns2Block = BuilderBlockBase & { type: 'columns2'; gap: number; left: BuilderBlock[]; right: BuilderBlock[] };
type ImageBlock = BuilderBlockBase & { type: 'image'; srcDataUrl: string; alt: string; fit: 'cover' | 'contain'; height: number };
type BuilderBlock =
  | HeadingBlock
  | ParagraphBlock
  | FieldBlock
  | DividerBlock
  | SpacerBlock
  | TableBlock
  | SectionBlock
  | Columns2Block
  | ImageBlock;

type BuilderContainerLane = 'children' | 'left' | 'right';
type BuilderContainerPath = Array<number | BuilderContainerLane>;

const DEFAULT_CSS = `
:root{--ink:#0b1220;--muted:rgba(15,23,42,.62);--line:rgba(148,163,184,.40);--paper:#ffffff}
*{box-sizing:border-box}
body{margin:0;padding:0;background:var(--paper)}
.tpl{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:var(--ink)}
.tpl-header,.tpl-footer{display:flex;justify-content:space-between;gap:16px;padding:18px 18px 12px;border-bottom:1px solid var(--line)}
.tpl-footer{border-bottom:none;border-top:1px solid var(--line);padding:12px 18px}
.tpl-header-media,.tpl-footer-media{padding:12px 0;border:0}
.tpl-header-media img,.tpl-footer-media img{display:block;width:100%;max-width:100%;height:auto;object-fit:contain}
.tpl-header-left{display:flex;align-items:center;gap:12px}
.tpl-logo{display:block;max-height:42px;max-width:160px;object-fit:contain}
.tpl-brand{font-weight:800;letter-spacing:-.03em;font-size:15px}
.tpl-sub{margin-top:3px;font-size:12px;color:var(--muted)}
.tpl-meta{font-size:12px;color:var(--muted);text-align:right;white-space:pre-wrap}
.tpl-body{padding:18px}
.tpl-title{margin:0 0 10px;font-size:22px;letter-spacing:-.03em}
.tpl-desc{margin:0 0 14px;color:var(--muted);font-size:13px;line-height:1.65}
.tpl-row{padding:10px 12px;border:1px solid var(--line);border-radius:14px;margin:10px 0}
.tpl-label{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:rgba(15,23,42,.62)}
.tpl-value{margin-top:6px;font-size:14px}
@media (max-width:640px){.tpl-logo{max-width:120px}}
`.trim();

function prettifyLabel(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function safeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function toFieldName(label: string) {
  const cleaned = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 5)
    .map((w, idx) => (idx === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('');
  return cleaned || `field${Math.random().toString(36).slice(2, 6)}`;
}

function buildSampleData(fields: DocumentField[]) {
  const sample: Record<string, string> = {};
  fields.forEach((f) => {
    if (f.type === 'date') sample[f.name] = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date());
    else if (f.type === 'number') sample[f.name] = '1000';
    else if (f.type === 'email') sample[f.name] = 'recipient@company.com';
    else if (f.type === 'tel') sample[f.name] = '+91 98XXXXXX10';
    else if (f.type === 'url') sample[f.name] = 'https://docrud.app';
    else if (f.type === 'textarea') sample[f.name] = 'Add the full text here. Keep it clear, specific, and review-ready.';
    else if ((f.type === 'select' || f.type === 'radio') && f.options?.length) sample[f.name] = f.options[0]!;
    else if (f.type === 'checkbox') sample[f.name] = 'true';
    else sample[f.name] = f.placeholder || 'Value';
  });
  return sample;
}

function sanitizeTemplateMarkup(value: string) {
  return String(value || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+="[^"]*"/gi, '')
    .replace(/\son[a-z]+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

function extractInlineCss(value: string) {
  const raw = String(value || '');
  const styleMatches = Array.from(raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi));
  if (!styleMatches.length) return '';
  return styleMatches.map((m) => (m?.[1] || '').trim()).filter(Boolean).join('\n\n');
}

function stripStyleTags(value: string) {
  return String(value || '').replace(/<style[\s\S]*?<\/style>/gi, '').trim();
}

function extractBodyHtml(value: string) {
  const raw = String(value || '');
  const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch?.[1]) return bodyMatch[1].trim();
  const cleaned = raw
    .replace(/<!doctype[\s\S]*?>/i, '')
    .replace(/<html[^>]*>/i, '')
    .replace(/<\/html>/i, '')
    .replace(/<head[\s\S]*?<\/head>/i, '')
    .trim();
  return cleaned;
}

function extractPlaceholders(markup: string) {
  const raw = String(markup || '');
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
  let match: RegExpExecArray | null = null;
  while ((match = re.exec(raw))) {
    const key = match[1] || '';
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function guessFieldType(name: string): DocumentField['type'] {
  const key = String(name || '').toLowerCase();
  if (key.includes('date')) return 'date';
  if (key.includes('email')) return 'email';
  if (key.includes('phone') || key.includes('mobile') || key.includes('tel')) return 'tel';
  if (key.includes('url') || key.includes('website') || key.includes('link')) return 'url';
  if (key.includes('amount') || key.includes('total') || key.includes('price') || key.includes('fee') || key.includes('qty') || key.includes('count') || key.includes('number')) return 'number';
  if (key.includes('notes') || key.includes('summary') || key.includes('description') || key.includes('message') || key.includes('address') || key.includes('body')) return 'textarea';
  return 'text';
}

function looksLikeFieldLabel(label: string) {
  const raw = String(label || '').trim();
  if (!raw) return false;
  if (raw.length < 2 || raw.length > 52) return false;
  if (!/[a-zA-Z]/.test(raw)) return false;
  if (/^[\W_]+$/.test(raw)) return false;
  return true;
}

function normalizeImportedLabel(input: string) {
  return String(input || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s/-]/g, '')
    .trim()
    .slice(0, 52);
}

function applySmartVariableDetection(html: string) {
  let output = String(html || '');
  const detected: { label: string; name: string }[] = [];
  const seen = new Set<string>();

  const addField = (labelRaw: string) => {
    const label = normalizeImportedLabel(labelRaw);
    if (!looksLikeFieldLabel(label)) return null;
    const name = toFieldName(label);
    if (!name) return null;
    if (!seen.has(name)) {
      seen.add(name);
      detected.push({ label, name });
    }
    return { label, name };
  };

  // Replace explicit markers like [Client Name], {Amount}, <<Due Date>>
  const bracketPatterns: Array<RegExp> = [
    /\[\s*([^\]]{2,60})\s*\]/g,
    /<<\s*([^>]{2,60})\s*>>/g,
    // Curly braces are common in CSS, but we run this after style tags are stripped.
    /\{\s*([^}]{2,60})\s*\}/g,
  ];

  bracketPatterns.forEach((re) => {
    output = output.replace(re, (full, group1) => {
      const added = addField(String(group1 || ''));
      return added ? `{{${added.name}}}` : full;
    });
  });

  // Replace runs of underscores with variables. Try to infer label from preceding text.
  // Example: "Client Name: ________" -> {{clientName}}
  output = output.replace(/([A-Za-z][A-Za-z0-9\s/-]{2,48})\s*[:\-–]\s*_{5,}/g, (full, label) => {
    const added = addField(String(label || ''));
    return added ? `${label}: {{${added.name}}}` : full;
  });

  // Fallback: plain underscores become generic fields.
  let underscoreCounter = 1;
  output = output.replace(/_{8,}/g, (full) => {
    const added = addField(`Blank ${underscoreCounter++}`);
    return added ? `{{${added.name}}}` : full;
  });

  return { html: output, detected };
}

function isValueCandidate(value: string) {
  const v = String(value || '').trim();
  if (!v) return false;
  if (v.includes('{{') || v.includes('}}')) return false;
  if (v.length > 90) return false;
  const words = v.split(/\s+/).filter(Boolean);
  if (words.length > 10) return false;
  if (/^[A-Z0-9][A-Z0-9./_-]{2,}$/.test(v)) return true;
  if (/^\+?\d[\d\s-]{7,}$/.test(v)) return true;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return true;
  if (/^(₹|\$|€|£)\s?\d[\d,]*(\.\d{1,2})?$/.test(v)) return true;
  if (/^\d[\d,]*(\.\d{1,2})?$/.test(v)) return true;
  if (/^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}$/.test(v)) return true;
  if (words.length <= 5) return true;
  return false;
}

function templateizeFilledValues(html: string) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html');
    const detected: { label: string; name: string }[] = [];
    const seen = new Set<string>();

    const addField = (labelRaw: string) => {
      const label = normalizeImportedLabel(labelRaw);
      if (!looksLikeFieldLabel(label)) return null;
      const name = toFieldName(label);
      if (!name) return null;
      if (!seen.has(name)) {
        seen.add(name);
        detected.push({ label, name });
      }
      return { label, name };
    };

    doc.querySelectorAll('table').forEach((table) => {
      const rows = Array.from(table.querySelectorAll('tr'));
      if (rows.length < 2) return;
      let kvHits = 0;

      rows.forEach((row) => {
        const cells = Array.from(row.querySelectorAll('th,td'));
        if (cells.length !== 2) return;
        const label = (cells[0]?.textContent || '').trim();
        const value = (cells[1]?.textContent || '').trim();
        if (!looksLikeFieldLabel(label)) return;
        if (!isValueCandidate(value)) return;
        if (cells[1].innerHTML.includes('{{')) return;
        const added = addField(label);
        if (!added) return;
        kvHits += 1;
        cells[1].innerHTML = `{{${added.name}}}`;
      });

      // Avoid being too aggressive: treat as KV only when multiple rows match.
      if (kvHits < 2) {
        // no-op: we keep whatever we did, but the threshold keeps false positives low.
      }
    });

    Array.from(doc.querySelectorAll('p, li, td, div')).forEach((el) => {
      if (!el) return;
      if (el.querySelector('table')) return;
      if (el.innerHTML.includes('{{')) return;
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) return;
      if (text.length > 120) return;
      const match = text.match(/^(.{2,48}?)\s*[:\-–]\s*(.{1,90})$/);
      if (!match) return;
      const label = String(match[1] || '').trim();
      const value = String(match[2] || '').trim();
      if (!looksLikeFieldLabel(label)) return;
      if (!isValueCandidate(value)) return;
      const added = addField(label);
      if (!added) return;
      el.textContent = `${label}: {{${added.name}}}`;
    });

    return { html: doc.body.innerHTML, detected };
  } catch {
    return { html, detected: [] as { label: string; name: string }[] };
  }
}

function buildHeaderHtml(branding: BrandingState) {
  if (!branding.headerEnabled) return '';
  if (branding.headerImageDataUrl) {
    return `
<div class="tpl-header tpl-header-media">
  <img src="${branding.headerImageDataUrl}" alt="Header" style="max-height:${Math.max(48, Math.min(branding.headerImageMaxHeight, 220))}px" />
</div>
    `.trim();
  }
  const logoHtml = branding.logoDataUrl
    ? `<img class="tpl-logo" src="${branding.logoDataUrl}" alt="Logo" style="max-height:${Math.max(18, Math.min(branding.logoMaxHeight, 72))}px" />`
    : '';
  return `
<div class="tpl-header">
  <div class="tpl-header-left">
    ${logoHtml}
    <div>
      <div class="tpl-brand">${branding.brandName || ''}</div>
      <div class="tpl-sub">${branding.subtitle || ''}</div>
    </div>
  </div>
  <div class="tpl-meta">${branding.rightMeta || ''}</div>
</div>
  `.trim();
}

function buildFooterHtml(branding: BrandingState) {
  if (!branding.footerEnabled) return '';
  if (branding.footerImageDataUrl) {
    return `
<div class="tpl-footer tpl-footer-media">
  <img src="${branding.footerImageDataUrl}" alt="Footer" style="max-height:${Math.max(32, Math.min(branding.footerImageMaxHeight, 220))}px" />
</div>
    `.trim();
  }
  return `
<div class="tpl-footer">
  <div class="tpl-meta" style="text-align:left">${branding.footerLeft || ''}</div>
  <div class="tpl-meta">${branding.footerRight || ''}</div>
</div>
  `.trim();
}

export default function TemplateStudioStudio({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: (template: DocumentTemplate) => void;
}) {
  const [activeTab, setActiveTab] = useState<StudioTab>('import');
  const [mobilePane, setMobilePane] = useState<'setup' | 'preview'>('setup');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoSyncFields, setAutoSyncFields] = useState(true);
  const [lastDetected, setLastDetected] = useState<string[]>([]);
  const [previewFullscreenOpen, setPreviewFullscreenOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string>('');
  const [importAutoDetect, setImportAutoDetect] = useState(true);
  const [importTemplateizeFilled, setImportTemplateizeFilled] = useState(true);
  const [importPdfAsImages, setImportPdfAsImages] = useState(false);
  const [importLastFileName, setImportLastFileName] = useState<string>('');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [previewOverrides, setPreviewOverrides] = useState<Record<string, any>>({});
  const [stylerPrompt, setStylerPrompt] = useState('');
  const [stylerBusy, setStylerBusy] = useState(false);
  const [fillBusy, setFillBusy] = useState(false);
  const [fillNote, setFillNote] = useState('');
  const [builderDriveTemplate, setBuilderDriveTemplate] = useState(true);
  const [builderInspectorTab, setBuilderInspectorTab] = useState<'content' | 'condition' | 'style'>('content');
  const [builderMobilePane, setBuilderMobilePane] = useState<'blocks' | 'inspector'>('blocks');
  const [builderBlocks, setBuilderBlocks] = useState<BuilderBlock[]>(() => ([
    {
      id: safeId('blk'),
      type: 'heading',
      label: 'Heading',
      text: 'Document title',
      level: 1,
      condition: { enabled: false, fieldName: 'title', mode: 'present', equalsValue: '' },
      style: {
        align: 'left',
        padding: 0,
        radius: 0,
        border: false,
        borderColor: 'rgba(148,163,184,.45)',
        background: 'transparent',
        textColor: '#0b1220',
        fontSize: 24,
        fontWeight: 700,
      },
    } as HeadingBlock,
    {
      id: safeId('blk'),
      type: 'paragraph',
      label: 'Paragraph',
      text: 'Short description or intro goes here.',
      condition: { enabled: false, fieldName: 'summary', mode: 'present', equalsValue: '' },
      style: {
        align: 'left',
        padding: 0,
        radius: 0,
        border: false,
        borderColor: 'rgba(148,163,184,.45)',
        background: 'transparent',
        textColor: 'rgba(15,23,42,.72)',
        fontSize: 13,
        fontWeight: 500,
      },
    } as ParagraphBlock,
  ]));
  const [builderSelectedId, setBuilderSelectedId] = useState<string | null>(null);
  const builderDragTypeRef = useRef<string>('');
  const builderDragMetaRef = useRef<{
    id: string;
    fromContainer: BuilderContainerPath;
    fromIndex: number;
  } | null>(null);

  const normalizeFieldOrders = useCallback((fields: DocumentField[]) => (
    fields.map((f, idx) => ({ ...f, order: idx + 1 }))
  ), []);

  const [draft, setDraft] = useState<StudioDraft>(() => ({
    name: '',
    category: 'General',
    description: '',
    fields: [],
    headerHtml: '',
    bodyHtml: '',
    footerHtml: '',
    css: DEFAULT_CSS,
  }));

  const [templateSource, setTemplateSource] = useState<string>('');
  const templateEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const syncTimeoutRef = useRef<number | null>(null);
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const builderLastAppliedRef = useRef<string>('');

  const buildNoCodeFromFields = useCallback((options?: { columns?: 1 | 2 }) => {
    const cols = options?.columns === 2 ? 2 : 1;
    setDraft((current) => {
      const fields = normalizeFieldOrders(current.fields);
      const title = `{{title}}`;
      const summary = `{{summary}}`;
      const rows = fields.map((f) => `
        <div class="tpl-row">
          <div class="tpl-label">${escapeHtml(f.label || f.name)}</div>
          <div class="tpl-value">{{${escapeHtml(f.name)}}}</div>
        </div>
      `.trim()).join('\n');

      const gridStyle = cols === 2
        ? `<div class="tpl-grid">${rows}</div>`
        : rows;

      const html = `
        <div class="tpl-body">
          <h1 class="tpl-title">${title}</h1>
          <p class="tpl-desc">${summary}</p>
          ${fields.length ? gridStyle : '<p class="tpl-desc">Add fields to generate a no-code layout.</p>'}
        </div>
      `.trim();

      const extraCss = cols === 2
        ? `
          .tpl-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
          @media (max-width:640px){.tpl-grid{grid-template-columns:1fr}}
        `.trim()
        : '';

      const nextCss = [String(current.css || ''), extraCss].filter(Boolean).join('\n\n');
      const next = { ...current, bodyHtml: html, css: nextCss };

      // Keep the "combined source" editor in sync so users can still jump to code anytime.
      const combined = `<style>\n${nextCss}\n</style>\n${html}`;
      setTemplateSource(combined);
      return next;
    });
    setImportStatus('Generated a no-code layout from your fields. You can edit it further or switch to HTML/CSS.');
    setActiveTab('template');
  }, [normalizeFieldOrders]);

  const builderFieldOptions = useMemo(() => {
    const base = [
      { name: 'title', label: 'Title' },
      { name: 'summary', label: 'Summary' },
      { name: 'date', label: 'Date' },
      { name: 'referenceNumber', label: 'Reference number' },
    ];
    const dynamic = normalizeFieldOrders(draft.fields || []).map((f) => ({ name: f.name, label: f.label || f.name }));
    const out: Array<{ name: string; label: string }> = [];
    const seen = new Set<string>();
    [...base, ...dynamic].forEach((f) => {
      if (!f.name || seen.has(f.name)) return;
      seen.add(f.name);
      out.push(f);
    });
    return out;
  }, [draft.fields, normalizeFieldOrders]);

  const makeDefaultBlockStyle = useCallback((partial?: Partial<BuilderStyle>): BuilderStyle => ({
    align: 'left',
    padding: 0,
    radius: 0,
    border: false,
    borderColor: 'rgba(148,163,184,.45)',
    background: 'transparent',
    textColor: '#0b1220',
    fontSize: 14,
    fontWeight: 600,
    ...(partial || {}),
  }), []);

  const makeDefaultCondition = useCallback((): BuilderCondition => ({
    enabled: false,
    fieldName: 'title',
    mode: 'present',
    equalsValue: '',
  }), []);

  const createBuilderBlock = useCallback((type: BuilderBlockType): BuilderBlock => {
    const id = safeId('blk');
    if (type === 'heading') {
      return {
        id,
        type,
        label: 'Heading',
        text: 'Section heading',
        level: 2,
        condition: makeDefaultCondition(),
        style: makeDefaultBlockStyle({ fontSize: 18, fontWeight: 700 }),
      } as HeadingBlock;
    }
    if (type === 'paragraph') {
      return {
        id,
        type,
        label: 'Paragraph',
        text: 'Add supporting text here.',
        condition: makeDefaultCondition(),
        style: makeDefaultBlockStyle({ fontSize: 13, fontWeight: 500, textColor: 'rgba(15,23,42,.72)' }),
      } as ParagraphBlock;
    }
    if (type === 'field') {
      const first = builderFieldOptions[0]?.name || 'title';
      return {
        id,
        type,
        label: 'Field',
        fieldName: first,
        fieldLabel: 'Label',
        showLabel: true,
        condition: makeDefaultCondition(),
        style: makeDefaultBlockStyle({ padding: 12, radius: 14, border: true, background: 'rgba(248,250,252,0.96)', fontSize: 13, fontWeight: 600 }),
      } as FieldBlock;
    }
    if (type === 'divider') {
      return {
        id,
        type,
        label: 'Divider',
        condition: makeDefaultCondition(),
        style: makeDefaultBlockStyle({ padding: 0, border: false }),
      } as DividerBlock;
    }
    if (type === 'spacer') {
      return {
        id,
        type,
        label: 'Spacer',
        height: 12,
        condition: makeDefaultCondition(),
        style: makeDefaultBlockStyle({ padding: 0, border: false }),
      } as SpacerBlock;
    }
    if (type === 'section') {
      return {
        id,
        type,
        label: 'Section',
        title: 'Section',
        subtitle: '',
        children: [
          {
            id: safeId('blk'),
            type: 'paragraph',
            label: 'Paragraph',
            text: 'Add supporting text here.',
            condition: makeDefaultCondition(),
            style: makeDefaultBlockStyle({ fontSize: 13, fontWeight: 500, textColor: 'rgba(15,23,42,.72)' }),
          } as ParagraphBlock,
        ],
        condition: makeDefaultCondition(),
        style: makeDefaultBlockStyle({ padding: 14, radius: 18, border: true, background: 'rgba(248,250,252,0.92)', borderColor: 'rgba(148,163,184,.40)' }),
      } as SectionBlock;
    }
    if (type === 'columns2') {
      return {
        id,
        type,
        label: '2 Columns',
        gap: 14,
        left: [
          {
            id: safeId('blk'),
            type: 'field',
            label: 'Field',
            fieldName: builderFieldOptions[0]?.name || 'title',
            fieldLabel: builderFieldOptions[0]?.label || 'Field',
            showLabel: true,
            condition: makeDefaultCondition(),
            style: makeDefaultBlockStyle({ padding: 12, radius: 14, border: true, background: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: 600 }),
          } as FieldBlock,
        ],
        right: [
          {
            id: safeId('blk'),
            type: 'field',
            label: 'Field',
            fieldName: builderFieldOptions[1]?.name || builderFieldOptions[0]?.name || 'summary',
            fieldLabel: builderFieldOptions[1]?.label || 'Field',
            showLabel: true,
            condition: makeDefaultCondition(),
            style: makeDefaultBlockStyle({ padding: 12, radius: 14, border: true, background: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: 600 }),
          } as FieldBlock,
        ],
        condition: makeDefaultCondition(),
        style: makeDefaultBlockStyle({ padding: 0, border: false }),
      } as Columns2Block;
    }
    if (type === 'image') {
      return {
        id,
        type,
        label: 'Image',
        srcDataUrl: '',
        alt: 'Image',
        fit: 'contain',
        height: 180,
        condition: makeDefaultCondition(),
        style: makeDefaultBlockStyle({ padding: 10, radius: 18, border: true, background: 'rgba(248,250,252,0.92)', borderColor: 'rgba(148,163,184,.40)' }),
      } as ImageBlock;
    }
    // table
    const columns = 3;
    const rows = 4;
    return {
      id,
      type: 'table',
      label: 'Table',
      columns,
      rows,
      header: true,
      cells: Array.from({ length: columns * rows }).map((_, idx) => (idx < columns ? `Header ${idx + 1}` : '')),
      condition: makeDefaultCondition(),
      style: makeDefaultBlockStyle({ padding: 0, border: false }),
    } as TableBlock;
  }, [builderFieldOptions, makeDefaultCondition, makeDefaultBlockStyle]);

  const builderFindBlockById = useCallback((blocks: BuilderBlock[], id: string): BuilderBlock | null => {
    for (const blk of blocks) {
      if (blk.id === id) return blk;
      if (blk.type === 'section') {
        const found = builderFindBlockById(blk.children || [], id);
        if (found) return found;
      }
      if (blk.type === 'columns2') {
        const foundLeft = builderFindBlockById(blk.left || [], id);
        if (foundLeft) return foundLeft;
        const foundRight = builderFindBlockById(blk.right || [], id);
        if (foundRight) return foundRight;
      }
    }
    return null;
  }, []);

  const builderSelectedBlock = useMemo(() => {
    if (!builderSelectedId) return null;
    return builderFindBlockById(builderBlocks, builderSelectedId) || null;
  }, [builderBlocks, builderFindBlockById, builderSelectedId]);

  const builderUpdateBlockById = useCallback((id: string, updater: (b: BuilderBlock) => BuilderBlock) => {
    const walk = (blocks: BuilderBlock[]): BuilderBlock[] => (
      blocks.map((blk) => {
        if (blk.id === id) return updater(blk);
        if (blk.type === 'section') return { ...blk, children: walk(blk.children || []) } as SectionBlock;
        if (blk.type === 'columns2') return { ...blk, left: walk(blk.left || []), right: walk(blk.right || []) } as Columns2Block;
        return blk;
      })
    );
    setBuilderBlocks((current) => walk(current));
  }, []);

  const builderUpdateContainer = useCallback((path: BuilderContainerPath, mutate: (arr: BuilderBlock[]) => BuilderBlock[]) => {
    const apply = (blocks: BuilderBlock[], p: BuilderContainerPath): BuilderBlock[] => {
      if (!p.length) return mutate(blocks);
      const [idxRaw, laneRaw, ...rest] = p;
      const idx = typeof idxRaw === 'number' ? idxRaw : -1;
      const lane = (laneRaw === 'children' || laneRaw === 'left' || laneRaw === 'right') ? laneRaw : 'children';
      return blocks.map((blk, i) => {
        if (i !== idx) return blk;
        if (lane === 'children' && blk.type === 'section') {
          const nextChildren = apply(blk.children || [], rest);
          return { ...blk, children: nextChildren } as SectionBlock;
        }
        if ((lane === 'left' || lane === 'right') && blk.type === 'columns2') {
          const targetArr = lane === 'left' ? (blk.left || []) : (blk.right || []);
          const nextArr = apply(targetArr, rest);
          return { ...blk, [lane]: nextArr } as Columns2Block;
        }
        return blk;
      });
    };
    setBuilderBlocks((current) => apply(current, path));
  }, []);

  const builderRemoveById = useCallback((id: string) => {
    const removeWalk = (blocks: BuilderBlock[]): BuilderBlock[] => (
      blocks
        .filter((blk) => blk.id !== id)
        .map((blk) => {
          if (blk.type === 'section') return { ...blk, children: removeWalk(blk.children || []) } as SectionBlock;
          if (blk.type === 'columns2') return { ...blk, left: removeWalk(blk.left || []), right: removeWalk(blk.right || []) } as Columns2Block;
          return blk;
        })
    );
    setBuilderBlocks((current) => removeWalk(current));
    setBuilderSelectedId((current) => (current === id ? null : current));
  }, []);

  const builderInsertAtContainer = useCallback((container: BuilderContainerPath, at: number, block: BuilderBlock) => {
    builderUpdateContainer(container, (arr) => {
      const next = [...arr];
      next.splice(Math.max(0, Math.min(next.length, at)), 0, block);
      return next;
    });
    setBuilderSelectedId(block.id);
  }, [builderUpdateContainer]);

  const builderMove = useCallback((id: string, fromContainer: BuilderContainerPath, fromIndex: number, toContainer: BuilderContainerPath, toIndex: number) => {
    if (!id) return;
    if (String(fromContainer) === String(toContainer) && fromIndex === toIndex) return;

    let removed: BuilderBlock | null = null;
    builderUpdateContainer(fromContainer, (arr) => {
      const next = [...arr];
      removed = next.splice(fromIndex, 1)[0] || null;
      return next;
    });

    const insert = (blk: BuilderBlock) => {
      builderUpdateContainer(toContainer, (arr) => {
        const next = [...arr];
        const safeIndex = Math.max(0, Math.min(next.length, toIndex));
        next.splice(safeIndex, 0, blk);
        return next;
      });
      setBuilderSelectedId(blk.id);
    };

    if (!removed) {
      const found = builderFindBlockById(builderBlocks, id);
      if (!found) return;
      builderRemoveById(id);
      insert(found);
      return;
    }
    insert(removed);
  }, [builderBlocks, builderFindBlockById, builderRemoveById, builderUpdateContainer]);

  const builderLabelForBlock = useCallback((blk: BuilderBlock) => {
    if (blk.type === 'heading') return (blk as HeadingBlock).text || 'Heading';
    if (blk.type === 'paragraph') return (blk as ParagraphBlock).text || 'Text';
    if (blk.type === 'field') return (blk as FieldBlock).fieldLabel || (blk as FieldBlock).fieldName || 'Field';
    if (blk.type === 'section') return (blk as SectionBlock).title || 'Section';
    if (blk.type === 'columns2') return '2 Columns';
    if (blk.type === 'image') return (blk as ImageBlock).alt || 'Image';
    if (blk.type === 'divider') return 'Divider';
    if (blk.type === 'spacer') return 'Spacer';
    return 'Table';
  }, []);

  const builderContainerTitle = (lane?: BuilderContainerLane) => {
    if (lane === 'left') return 'Left column';
    if (lane === 'right') return 'Right column';
    return 'Blocks';
  };

  const builderAddChild = useCallback((parentId: string, lane: BuilderContainerLane, type: BuilderBlockType) => {
    const child = createBuilderBlock(type);
    builderUpdateBlockById(parentId, (b) => {
      if (b.type === 'section' && lane === 'children') {
        return { ...(b as SectionBlock), children: [...((b as SectionBlock).children || []), child] } as BuilderBlock;
      }
      if (b.type === 'columns2' && (lane === 'left' || lane === 'right')) {
        const arr = lane === 'left' ? ((b as Columns2Block).left || []) : ((b as Columns2Block).right || []);
        return { ...(b as Columns2Block), [lane]: [...arr, child] } as BuilderBlock;
      }
      return b;
    });
    setBuilderSelectedId(child.id);
  }, [builderUpdateBlockById, createBuilderBlock]);

  const builderRenderTree = useCallback((blocks: BuilderBlock[], container: BuilderContainerPath, depth: number) => {
    const pad = Math.min(24, depth * 10);
    return (
      <div className="space-y-2">
        {blocks.map((blk, idx) => {
          const selected = builderSelectedId === blk.id;
          const metaText =
            blk.type === 'field' ? `{{${(blk as FieldBlock).fieldName}}}` :
            blk.type === 'heading' ? `H${(blk as HeadingBlock).level}` :
            blk.type === 'columns2' ? 'layout' :
            blk.type === 'section' ? `${(blk as SectionBlock).children?.length || 0} blocks` :
            blk.type;

          return (
            <div key={`tree-${blk.id}`}>
              <div
                draggable
                onDragStart={() => {
                  builderDragMetaRef.current = { id: blk.id, fromContainer: container, fromIndex: idx };
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  const meta = builderDragMetaRef.current;
                  if (!meta) return;
                  builderMove(meta.id, meta.fromContainer, meta.fromIndex, container, idx);
                  builderDragMetaRef.current = null;
                }}
                className={`group flex items-center gap-2 rounded-2xl border px-3 py-2 shadow-sm transition ${
                  selected ? 'border-violet-200 bg-violet-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
                style={{ marginLeft: pad }}
                onClick={() => {
                  setBuilderSelectedId(blk.id);
                  setBuilderMobilePane('inspector');
                }}
                role="button"
                tabIndex={0}
              >
                <span className={`h-2 w-2 rounded-full ${selected ? 'bg-violet-500' : 'bg-slate-400'}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-950">{builderLabelForBlock(blk)}</p>
                  <p className="truncate text-xs text-slate-500">{metaText}</p>
                </div>
                <div className="flex items-center gap-1">
                  {(blk.type === 'section' || blk.type === 'columns2') ? (
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 opacity-0 shadow-sm transition hover:bg-slate-50 hover:text-slate-950 group-hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); setBuilderSelectedId(blk.id); }}
                      aria-label="Open container"
                      title="Open"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 opacity-0 shadow-sm transition hover:bg-slate-50 hover:text-slate-950 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      const copy = createBuilderBlock(blk.type);
                      // preserve some content quickly
                      if (blk.type === 'heading') (copy as HeadingBlock).text = (blk as HeadingBlock).text;
                      if (blk.type === 'paragraph') (copy as ParagraphBlock).text = (blk as ParagraphBlock).text;
                      if (blk.type === 'field') {
                        (copy as FieldBlock).fieldName = (blk as FieldBlock).fieldName;
                        (copy as FieldBlock).fieldLabel = (blk as FieldBlock).fieldLabel;
                        (copy as FieldBlock).showLabel = (blk as FieldBlock).showLabel;
                      }
                      builderInsertAtContainer(container, idx + 1, copy);
                    }}
                    aria-label="Duplicate block"
                    title="Duplicate"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 opacity-0 shadow-sm transition hover:bg-slate-50 hover:text-slate-950 group-hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); builderRemoveById(blk.id); }}
                    aria-label="Delete block"
                    title="Delete"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {blk.type === 'section' ? (
                <div className="mt-2">
                  <div className="mb-2 flex flex-wrap items-center gap-2" style={{ marginLeft: pad + 10 }}>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                      {builderContainerTitle('children')}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-full"
                      onClick={() => builderAddChild(blk.id, 'children', 'field')}
                    >
                      + Field
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-full"
                      onClick={() => builderAddChild(blk.id, 'children', 'paragraph')}
                    >
                      + Text
                    </Button>
                  </div>
                  <div
                    className="rounded-3xl border border-slate-200 bg-white/60 p-2"
                    style={{ marginLeft: pad + 10 }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      const t = builderDragTypeRef.current;
                      if (!t) return;
                      const child = createBuilderBlock(t as BuilderBlockType);
                      builderUpdateBlockById(blk.id, (b) => ({ ...(b as SectionBlock), children: [...((b as SectionBlock).children || []), child] } as BuilderBlock));
                      setBuilderSelectedId(child.id);
                      builderDragTypeRef.current = '';
                    }}
                  >
                    {builderRenderTree((blk as SectionBlock).children || [], [...container, idx, 'children'], depth + 1)}
                  </div>
                </div>
              ) : null}

              {blk.type === 'columns2' ? (
                <div className="mt-2 grid gap-3 sm:grid-cols-2" style={{ marginLeft: pad + 10 }}>
                  {(['left', 'right'] as const).map((lane) => (
                    <div key={`${blk.id}-${lane}`}>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                          {builderContainerTitle(lane)}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-full"
                          onClick={() => builderAddChild(blk.id, lane, 'field')}
                        >
                          + Field
                        </Button>
                      </div>
                      <div
                        className="rounded-3xl border border-slate-200 bg-white/60 p-2"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          const t = builderDragTypeRef.current;
                          if (!t) return;
                          const child = createBuilderBlock(t as BuilderBlockType);
                          builderUpdateBlockById(blk.id, (b) => {
                            const arr = lane === 'left' ? ((b as Columns2Block).left || []) : ((b as Columns2Block).right || []);
                            return { ...(b as Columns2Block), [lane]: [...arr, child] } as BuilderBlock;
                          });
                          setBuilderSelectedId(child.id);
                          builderDragTypeRef.current = '';
                        }}
                      >
                        {builderRenderTree(
                          lane === 'left' ? ((blk as Columns2Block).left || []) : ((blk as Columns2Block).right || []),
                          [...container, idx, lane],
                          depth + 1
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }, [builderAddChild, builderBlocks.length, builderInsertAtContainer, builderLabelForBlock, builderMove, builderRemoveById, builderSelectedId, builderUpdateBlockById, builderUpdateContainer, createBuilderBlock]);

  const sanitizeInlineStyleValue = (v: string) => String(v || '').replace(/[<>]/g, '').slice(0, 240);

  const builderBlockStyleToCss = useCallback((style: BuilderStyle) => {
    const pad = Math.max(0, Math.min(48, Number(style.padding || 0)));
    const rad = Math.max(0, Math.min(32, Number(style.radius || 0)));
    const fontSize = Math.max(10, Math.min(44, Number(style.fontSize || 14)));
    const bg = sanitizeInlineStyleValue(style.background || 'transparent');
    const color = sanitizeInlineStyleValue(style.textColor || '#0b1220');
    const borderColor = sanitizeInlineStyleValue(style.borderColor || 'rgba(148,163,184,.45)');
    const fw = [400, 500, 600, 700].includes(Number(style.fontWeight)) ? Number(style.fontWeight) : 600;
    const align = (style.align === 'center' || style.align === 'right') ? style.align : 'left';
    return [
      `text-align:${align}`,
      `padding:${pad}px`,
      `border-radius:${rad}px`,
      `background:${bg || 'transparent'}`,
      `color:${color}`,
      `font-size:${fontSize}px`,
      `font-weight:${fw}`,
      style.border ? `border:1px solid ${borderColor}` : 'border:none',
    ].join(';');
  }, []);

  const escapeTextButKeepTokens = (text: string) => {
    // escapeHtml preserves braces; this keeps {{field}} tokens intact.
    return escapeHtml(String(text || '')).replace(/\n/g, '<br/>');
  };

  const builderHtmlAndCss = useMemo(() => {
    const css = `
      /* docrud builder (generated) */
      .bld { width: 100%; }
      .bld-stack { display: flex; flex-direction: column; gap: 10px; }
      .bld-divider { height: 1px; background: rgba(148,163,184,.55); border-radius: 999px; }
      .bld-section { padding: 0; }
      .bld-section-title { margin: 0; font-size: 14px; font-weight: 800; letter-spacing: -.02em; }
      .bld-section-sub { margin: 6px 0 0; font-size: 12px; color: rgba(15,23,42,.62); line-height: 1.6; }
      .bld-columns2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }
      .bld-image { width: 100%; display: block; border-radius: 14px; overflow: hidden; }
      .bld-fieldrow { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: 10px; align-items: start; }
      .bld-fieldrow .bld-label { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: rgba(15,23,42,.62); font-weight: 800; }
      .bld-fieldrow .bld-value { font-size: 14px; font-weight: 600; }
      .bld-table { width: 100%; border-collapse: separate; border-spacing: 0; overflow: hidden; border-radius: 14px; border: 1px solid rgba(148,163,184,.45); }
      .bld-table th, .bld-table td { padding: 10px 12px; border-bottom: 1px solid rgba(148,163,184,.35); border-right: 1px solid rgba(148,163,184,.25); font-size: 12px; }
      .bld-table th:last-child, .bld-table td:last-child { border-right: none; }
      .bld-table tr:last-child td { border-bottom: none; }
      .bld-table th { background: rgba(248,250,252,.92); font-weight: 800; color: rgba(15,23,42,.72); }
      @media (max-width:640px){ .bld-fieldrow { grid-template-columns: 1fr; } .bld-columns2{ grid-template-columns: 1fr; } }
    `.trim();

    const renderBlock = (block: BuilderBlock): string => {
      const style = builderBlockStyleToCss(block.style);
      const wrapStart = block.condition?.enabled
        ? `<!--DOCIF ${escapeHtml(block.condition.fieldName)}:${escapeHtml(block.condition.mode === 'present' ? 'present' : block.condition.equalsValue)}-->`
        : '';
      const wrapEnd = block.condition?.enabled ? '<!--DOCENDIF-->' : '';

      if (block.type === 'heading') {
        const tag = block.level === 1 ? 'h1' : block.level === 3 ? 'h3' : 'h2';
        return `${wrapStart}<${tag} style="${style};margin:0">${escapeTextButKeepTokens(block.text)}</${tag}>${wrapEnd}`;
      }
      if (block.type === 'paragraph') {
        return `${wrapStart}<p style="${style};margin:0;line-height:1.65">${escapeTextButKeepTokens(block.text)}</p>${wrapEnd}`;
      }
      if (block.type === 'divider') {
        return `${wrapStart}<div class="bld-divider" style="margin:4px 0"></div>${wrapEnd}`;
      }
      if (block.type === 'spacer') {
        const h = Math.max(4, Math.min(72, Number(block.height || 12)));
        return `${wrapStart}<div style="height:${h}px"></div>${wrapEnd}`;
      }
      if (block.type === 'field') {
        const label = escapeHtml(block.fieldLabel || '');
        const valueToken = `{{${escapeHtml(block.fieldName)}}}`;
        const inner = block.showLabel
          ? `<div class="bld-fieldrow" style="${style}">
               <div class="bld-label">${label}</div>
               <div class="bld-value">${valueToken}</div>
             </div>`
          : `<div class="bld-value" style="${style}">${valueToken}</div>`;
        return `${wrapStart}${inner}${wrapEnd}`;
      }
      if (block.type === 'image') {
        const h = Math.max(80, Math.min(520, Number(block.height || 180)));
        const fit = block.fit === 'cover' ? 'cover' : 'contain';
        const src = String(block.srcDataUrl || '').trim();
        const inner = src
          ? `<img src="${src}" alt="${escapeHtml(block.alt || 'Image')}" class="bld-image" style="${style};height:${h}px;object-fit:${fit};background:rgba(248,250,252,0.92)" />`
          : `<div style="${style};height:${h}px;display:flex;align-items:center;justify-content:center;border:1px dashed rgba(148,163,184,.55);border-radius:14px;color:rgba(15,23,42,.62);font-size:12px;font-weight:700">Upload an image</div>`;
        return `${wrapStart}${inner}${wrapEnd}`;
      }
      if (block.type === 'section') {
        const title = String(block.title || '').trim();
        const subtitle = String(block.subtitle || '').trim();
        const childrenHtml = (block.children || []).map(renderBlock).join('\n');
        return `${wrapStart}<section class="bld-section" style="${style}">
          ${title ? `<h3 class="bld-section-title">${escapeTextButKeepTokens(title)}</h3>` : ''}
          ${subtitle ? `<p class="bld-section-sub">${escapeTextButKeepTokens(subtitle)}</p>` : ''}
          <div class="bld-stack" style="margin-top:${title || subtitle ? '10px' : '0'}">${childrenHtml}</div>
        </section>${wrapEnd}`;
      }
      if (block.type === 'columns2') {
        const left = (block.left || []).map(renderBlock).join('\n');
        const right = (block.right || []).map(renderBlock).join('\n');
        const gap = Math.max(8, Math.min(32, Number(block.gap || 14)));
        return `${wrapStart}<div class="bld-columns2" style="${style};gap:${gap}px">
          <div class="bld-stack">${left}</div>
          <div class="bld-stack">${right}</div>
        </div>${wrapEnd}`;
      }
      // table
      const cols = Math.max(1, Math.min(8, Number((block as TableBlock).columns || 3)));
      const rows = Math.max(1, Math.min(18, Number((block as TableBlock).rows || 4)));
      const cells = Array.isArray((block as TableBlock).cells) ? (block as TableBlock).cells : [];
      const cellAt = (r: number, c: number) => String(cells[r * cols + c] ?? '');
      const headerRow = (block as TableBlock).header
        ? `<tr>${Array.from({ length: cols }).map((_, c) => `<th>${escapeTextButKeepTokens(cellAt(0, c) || `Header ${c + 1}`)}</th>`).join('')}</tr>`
        : '';
      const startRow = (block as TableBlock).header ? 1 : 0;
      const bodyRows = Array.from({ length: rows - startRow }).map((_, idx) => {
        const r = idx + startRow;
        return `<tr>${Array.from({ length: cols }).map((__, c) => `<td>${escapeTextButKeepTokens(cellAt(r, c))}</td>`).join('')}</tr>`;
      }).join('');
      return `${wrapStart}<table class="bld-table" style="${style}">${(block as TableBlock).header ? `<thead>${headerRow}</thead>` : ''}<tbody>${bodyRows}</tbody></table>${wrapEnd}`;
    };

    const blocks = builderBlocks.map(renderBlock).join('\n');

    const html = `<div class="tpl-body"><div class="bld"><div class="bld-stack">${blocks}</div></div></div>`;
    return { html, css };
  }, [builderBlockStyleToCss, builderBlocks]);

  useEffect(() => {
    if (!builderDriveTemplate) return;
    const stripGeneratedBuilderCss = (value: string) => {
      const raw = String(value || '');
      const idx = raw.indexOf('/* docrud builder (generated) */');
      return idx >= 0 ? raw.slice(0, idx).trim() : raw.trim();
    };
    const baseCss = stripGeneratedBuilderCss(draft.css || DEFAULT_CSS) || DEFAULT_CSS;
    const nextCss = [baseCss, builderHtmlAndCss.css].filter(Boolean).join('\n\n');
    const combined = `<style>\n${nextCss}\n</style>\n${builderHtmlAndCss.html}`;
    if (builderLastAppliedRef.current === combined) return;
    builderLastAppliedRef.current = combined;
    setTemplateSource(combined);
    setDraft((current) => ({
      ...current,
      bodyHtml: builderHtmlAndCss.html,
      css: nextCss,
    }));
  }, [builderDriveTemplate, builderHtmlAndCss.css, builderHtmlAndCss.html, draft.css]);


  const [page, setPage] = useState<PageSettings>(() => ({
    size: 'A4',
    widthMm: 210,
    heightMm: 297,
    marginMm: 16,
    pageNumbersEnabled: false,
  }));

  const [background, setBackground] = useState<BackgroundState>(() => ({
    kind: 'solid',
    solid: '#ffffff',
    gradient: 'linear-gradient(135deg, rgba(44,93,169,0.10), rgba(245,158,11,0.08), rgba(255,255,255,1))',
    imageDataUrl: '',
    fit: 'cover',
  }));

  const [marketplaceDraft, setMarketplaceDraft] = useState<MarketplaceDraft>(() => ({
    publishEnabled: false,
    priceInr: 299,
    tags: 'HR, Legal, Finance',
    coverImageDataUrl: '',
  }));

  const [branding, setBranding] = useState<BrandingState>(() => ({
    headerEnabled: false,
    footerEnabled: false,
    brandName: '',
    subtitle: '',
    rightMeta: '',
    footerLeft: '',
    footerRight: '',
    logoDataUrl: '',
    logoMaxHeight: 42,
    headerImageDataUrl: '',
    headerImageMaxHeight: 120,
    footerImageDataUrl: '',
    footerImageMaxHeight: 90,
  }));

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const marketplaceCoverInputRef = useRef<HTMLInputElement | null>(null);
  const headerImageInputRef = useRef<HTMLInputElement | null>(null);
  const footerImageInputRef = useRef<HTMLInputElement | null>(null);
  const backgroundImageInputRef = useRef<HTMLInputElement | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // Keep header/footer in sync with branding (no presets, blank-first).
    setDraft((current) => ({
      ...current,
      headerHtml: buildHeaderHtml(branding),
      footerHtml: buildFooterHtml(branding),
    }));
  }, [branding]);

  const syncDraftFromSource = useCallback((source: string) => {
    const hasStyleTag = /<style[\s>]/i.test(String(source || ''));
    const css = extractInlineCss(source);
    const html = extractBodyHtml(stripStyleTags(source));
    setDraft((current) => ({
      ...current,
      css: hasStyleTag ? css : (css ? css : current.css),
      bodyHtml: html,
    }));
  }, []);

  const detectedPlaceholders = useMemo(() => {
    const combined = [draft.headerHtml, draft.bodyHtml, draft.footerHtml].filter(Boolean).join('\n');
    const raw = extractPlaceholders(combined);
    const reserved = new Set(['date', 'referenceNumber', 'generatedAt', 'title', 'summary']);
    return raw.filter((k) => !reserved.has(k));
  }, [draft.bodyHtml, draft.footerHtml, draft.headerHtml]);

  const syncFieldsFromDetected = useCallback((detected: string[]) => {
    setDraft((current) => {
      const existingByName = new Map(current.fields.map((f) => [f.name, f] as const));
      const next: DocumentField[] = [];

      detected.forEach((name) => {
        const existing = existingByName.get(name);
        if (existing) next.push(existing);
        else {
          next.push({
            id: safeId('field'),
            name,
            label: prettifyLabel(name),
            type: guessFieldType(name),
            required: false,
            order: next.length + 1,
          });
        }
      });

      // Keep extra fields (manual) at the end, stable.
      current.fields.forEach((f) => {
        if (!detected.includes(f.name)) next.push(f);
      });

      return { ...current, fields: normalizeFieldOrders(next) };
    });
  }, [normalizeFieldOrders]);

  useEffect(() => {
    if (!autoSyncFields) return;
    if (!detectedPlaceholders.length) return;
    // debounce to avoid “typing lag”
    if (syncTimeoutRef.current) window.clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = window.setTimeout(() => {
      setLastDetected(detectedPlaceholders);
      syncFieldsFromDetected(detectedPlaceholders);
    }, 300);
    return () => {
      if (syncTimeoutRef.current) window.clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    };
  }, [autoSyncFields, detectedPlaceholders, syncFieldsFromDetected]);

  const combinedTemplateHtml = useMemo(() => (
    [
      draft.headerHtml?.trim() ? sanitizeTemplateMarkup(draft.headerHtml) : '',
      draft.bodyHtml?.trim() ? sanitizeTemplateMarkup(draft.bodyHtml) : '',
      draft.footerHtml?.trim() ? sanitizeTemplateMarkup(draft.footerHtml) : '',
    ]
      .filter(Boolean)
      .join('\n')
  ), [draft.bodyHtml, draft.footerHtml, draft.headerHtml]);

  const pageBackgroundCss = useMemo(() => {
    if (background.kind === 'image' && background.imageDataUrl) {
      return `#ffffff url("${background.imageDataUrl}") center/${background.fit} no-repeat`;
    }
    if (background.kind === 'gradient') return String(background.gradient || '').trim() || '#ffffff';
    return String(background.solid || '').trim() || '#ffffff';
  }, [background.fit, background.gradient, background.imageDataUrl, background.kind, background.solid]);

  const previewHtml = useMemo(() => {
    const fieldsWithBasics: DocumentField[] = [
      { id: 'title', name: 'title', label: 'Title', type: 'text', required: false, order: 0 },
      { id: 'summary', name: 'summary', label: 'Summary', type: 'textarea', required: false, order: 0 },
      ...draft.fields,
      { id: 'date', name: 'date', label: 'Date', type: 'date', required: false, order: 0 },
      { id: 'reference', name: 'referenceNumber', label: 'Reference number', type: 'text', required: false, order: 0 },
    ];

    const sample = buildSampleData(fieldsWithBasics);
    sample.title = draft.name || '';
    sample.summary = draft.description || '';
    Object.entries(previewOverrides).forEach(([key, value]) => {
      if (!key) return;
      (sample as any)[key] = value;
    });

    const template: DocumentTemplate = {
      id: 'studio-preview',
      name: draft.name || 'Untitled template',
      category: draft.category || 'General',
      description: draft.description,
      fields: normalizeFieldOrders(fieldsWithBasics),
      template: `<div class="tpl"><style>\n${draft.css || ''}\n</style>\n${combinedTemplateHtml}</div>`,
      isCustom: true,
    };

    try {
      const rendered = renderDocumentTemplate(template, sample, {
        generatedBy: 'docrud template studio',
        renderMode: 'plain',
        pageSize: page.size === 'Custom' ? 'A4' : page.size,
        pageWidthMm: page.size === 'Custom' ? page.widthMm : undefined,
        pageHeightMm: page.size === 'Custom' ? page.heightMm : undefined,
        pageMarginMm: page.marginMm,
        pageBackgroundCss,
      });
      // Ensure the preview never “falls off” the viewport on narrow devices by making the page container responsive.
      const previewCss = `
        body { overflow-x: hidden !important; }
        .page { max-width: calc(100vw - 28px) !important; width: min(794px, calc(100vw - 28px)) !important; margin: 12px auto !important; }
        img { max-width: 100% !important; height: auto !important; }
        table { max-width: 100% !important; }
      `.trim();
      return rendered.includes('</head>')
        ? rendered.replace('</head>', `<style>${previewCss}</style></head>`)
        : rendered;
    } catch {
      return '<div style="font-family: ui-sans-serif, system-ui; color: #b91c1c; padding: 16px;">Preview unavailable. Check placeholders and markup.</div>';
    }
  }, [combinedTemplateHtml, draft.category, draft.css, draft.description, draft.fields, draft.name, normalizeFieldOrders, page, pageBackgroundCss, previewOverrides]);

  const addField = useCallback(() => {
    setDraft((current) => {
      const nextLabel = `Field ${current.fields.length + 1}`;
      const next: DocumentField = {
        id: safeId('field'),
        name: toFieldName(nextLabel),
        label: nextLabel,
        type: 'text',
        required: false,
        order: current.fields.length + 1,
      };
      return { ...current, fields: normalizeFieldOrders([...current.fields, next]) };
    });
  }, [normalizeFieldOrders]);

  const removeField = useCallback((id: string) => {
    setDraft((current) => ({ ...current, fields: normalizeFieldOrders(current.fields.filter((f) => f.id !== id)) }));
  }, [normalizeFieldOrders]);

  const insertPlaceholderInline = useCallback((fieldName: string) => {
    const token = `{{${fieldName}}}`;
    setDraft((current) => {
      const body = String(current.bodyHtml || '').trim();
      if (!body) return { ...current, bodyHtml: `<div class="tpl-body">${token}</div>` };
      return { ...current, bodyHtml: `${body}\n<p>${token}</p>` };
    });
  }, []);

  const insertPlaceholderIntoTemplate = useCallback((fieldName: string) => {
    const token = `{{${fieldName}}}`;
    const el = templateEditorRef.current;
    if (!el) {
      setTemplateSource((current) => current ? `${current}\n${token}` : token);
      syncDraftFromSource(`${templateSource}\n${token}`);
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = `${el.value.slice(0, start)}${token}${el.value.slice(end)}`;
    setTemplateSource(next);
    syncDraftFromSource(next);
    requestAnimationFrame(() => {
      try {
        el.focus();
        const nextPos = start + token.length;
        el.setSelectionRange(nextPos, nextPos);
      } catch {
        // ignore
      }
    });
  }, [syncDraftFromSource, templateSource]);

  const addFieldOfType = useCallback((type: DocumentField['type']) => {
    const labelBase = prettifyLabel(type === 'textarea' ? 'Long text' : type);
    const id = safeId('field');
    const name = toFieldName(`${labelBase} ${Math.floor(Math.random() * 90) + 10}`);
    const next: DocumentField = {
      id,
      name,
      label: labelBase,
      type,
      required: false,
      order: draft.fields.length + 1,
    };
    setDraft((current) => ({ ...current, fields: normalizeFieldOrders([...current.fields, next]) }));
    // Drop a placeholder into the template source (best-effort) so users see it in preview immediately.
    if (templateEditorRef.current) insertPlaceholderIntoTemplate(name);
    else insertPlaceholderInline(name);
  }, [draft.fields.length, insertPlaceholderInline, insertPlaceholderIntoTemplate, normalizeFieldOrders]);

  const ensureFieldExists = useCallback((type: DocumentField['type']) => {
    const labelBase = prettifyLabel(type === 'textarea' ? 'Long text' : type);
    const id = safeId('field');
    const name = toFieldName(`${labelBase} ${Math.floor(Math.random() * 90) + 10}`);
    const next: DocumentField = {
      id,
      name,
      label: labelBase,
      type,
      required: false,
      order: draft.fields.length + 1,
    };
    setDraft((current) => ({ ...current, fields: normalizeFieldOrders([...current.fields, next]) }));
    if (templateEditorRef.current) insertPlaceholderIntoTemplate(name);
    else insertPlaceholderInline(name);
  }, [draft.fields.length, insertPlaceholderInline, insertPlaceholderIntoTemplate, normalizeFieldOrders]);

  const handleLogoFile = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;

    try {
      if (!file.type.startsWith('image/')) throw new Error('Please upload an image file.');
      if (file.size > 650_000) throw new Error('Logo is too large. Keep it under 650KB for stable templates.');

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Unable to read image.'));
        reader.readAsDataURL(file);
      });

      setBranding((c) => ({ ...c, logoDataUrl: dataUrl }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load logo.');
    } finally {
      event.target.value = '';
    }
  }, []);

  const handleHeaderImageFile = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;

    try {
      if (!file.type.startsWith('image/')) throw new Error('Please upload an image file.');
      if (file.size > 2_400_000) throw new Error('Header image is too large. Keep it under 2.4MB.');

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Unable to read image.'));
        reader.readAsDataURL(file);
      });

      setBranding((c) => ({ ...c, headerImageDataUrl: dataUrl, headerEnabled: true }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load image.');
    } finally {
      event.target.value = '';
    }
  }, []);

  const handleFooterImageFile = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;

    try {
      if (!file.type.startsWith('image/')) throw new Error('Please upload an image file.');
      if (file.size > 2_400_000) throw new Error('Footer image is too large. Keep it under 2.4MB.');

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Unable to read image.'));
        reader.readAsDataURL(file);
      });

      setBranding((c) => ({ ...c, footerImageDataUrl: dataUrl, footerEnabled: true }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load image.');
    } finally {
      event.target.value = '';
    }
  }, []);

  const handleBackgroundImageFile = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;

    try {
      if (!file.type.startsWith('image/')) throw new Error('Please upload an image file.');
      if (file.size > 2_600_000) throw new Error('Background image is too large. Keep it under 2.6MB.');

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Unable to read image.'));
        reader.readAsDataURL(file);
      });

      setBackground((c) => ({ ...c, kind: 'image', imageDataUrl: dataUrl }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load background image.');
    } finally {
      event.target.value = '';
    }
  }, []);

  const importDocumentAsTemplate = useCallback(async (file: File) => {
    setError(null);
    setImportStatus('');
    setImportLastFileName(file.name || '');
    setImporting(true);

    try {
      const nameStem = (file.name || 'Imported document').replace(/\.[^.]+$/, '').trim() || 'Imported template';
      const ext = (file.name.split('.').pop() || '').toLowerCase();

      let importedHtml = '';
      let importedCss = '';

      if (ext === 'docx' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        setImportStatus('Converting DOCX to HTML...');
        const mammoth = await import('mammoth');
        const result = await mammoth.convertToHtml(
          { arrayBuffer: await file.arrayBuffer() },
          {
            includeDefaultStyleMap: true,
            // Keep Word-ish semantics stable so users can further style in CSS.
            styleMap: [
              "p[style-name='Title'] => h1:fresh",
              "p[style-name='Heading 1'] => h2:fresh",
              "p[style-name='Heading 2'] => h3:fresh",
              "p[style-name='Heading 3'] => h4:fresh",
              "p[style-name='Quote'] => blockquote:fresh",
              "p[style-name='Subtitle'] => h3.subtitle:fresh",
              'table => table.table:fresh',
            ],
          } as any
        );
        importedHtml = String(result?.value || '').trim();
        importedCss = '';
      } else if (ext === 'html' || ext === 'htm' || file.type.includes('html')) {
        setImportStatus('Importing HTML...');
        importedHtml = new TextDecoder().decode(await file.arrayBuffer());
      } else if (ext === 'md' || ext === 'txt' || file.type.startsWith('text/')) {
        setImportStatus('Importing text...');
        const rawText = new TextDecoder().decode(await file.arrayBuffer());
        const safe = escapeHtml(rawText);
        importedHtml = `<div class="tpl-body"><pre style="white-space:pre-wrap; font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size:12px; line-height:1.6; margin:0;">${safe}</pre></div>`;
      } else if (ext === 'pdf' || file.type === 'application/pdf') {
        if (importPdfAsImages) {
          setImportStatus('Rendering PDF pages (high fidelity)…');
          const payload = await renderPdfFileToPngPages({ file, maxPages: 12, scale: 1.55 });
          const pages = Array.isArray(payload?.pages) ? payload.pages : [];
          if (!pages.length) throw new Error('No pages detected in this PDF.');
          importedCss = `
            .pdf-import{padding:0}
            .pdf-page{page-break-after:always}
            .pdf-page:last-child{page-break-after:auto}
            .pdf-page img{display:block;width:100%;height:auto;border-radius:12px}
          `.trim();
          importedHtml = `
            <div class="tpl-body pdf-import">
              ${pages.map((src: string, idx: number) => `<div class="pdf-page"><img src="${src}" alt="PDF page ${idx + 1}" /></div>`).join('')}
            </div>
          `.trim();
        } else {
          setImportStatus('Extracting text from PDF (layout may vary)…');
          const form = new FormData();
          form.append('file', file);
          form.append('title', nameStem);
          const res = await fetch('/api/ai/document-parser', { method: 'POST', body: form });
          const payload = await res.json().catch(() => null);
          if (!res.ok) throw new Error(payload?.error || 'Unable to read PDF');
          const content = String(payload?.extractedContent || '').trim();
          const lines = content.split('\n').map((l: string) => l.trim()).filter(Boolean).slice(0, 400);
          importedHtml = `<div class="tpl-body">${lines.map((line: string) => `<p style="margin:0 0 8px">${escapeHtml(line)}</p>`).join('')}</div>`;
        }
      } else {
        throw new Error('Import supports DOCX, HTML, TXT, MD, and PDF right now.');
      }

      const sanitized = sanitizeTemplateMarkup(importedHtml);
      const extractedCss = extractInlineCss(sanitized);
      const bodyOnly = extractBodyHtml(stripStyleTags(sanitized));
      const wrappedBody = /class=["'][^"']*\btpl-body\b/i.test(bodyOnly)
        ? bodyOnly
        : `<div class="tpl-body imported">${bodyOnly}</div>`;
      const css = [DEFAULT_CSS, importedCss || '', extractedCss || ''].filter(Boolean).join('\n\n');

      // Apply smart variable detection on the body (not the CSS).
      const smart = importAutoDetect ? applySmartVariableDetection(wrappedBody) : { html: wrappedBody, detected: [] as any[] };
      const filled = importTemplateizeFilled ? templateizeFilledValues(smart.html) : { html: smart.html, detected: [] as any[] };

      const starter = `<style>\n${css}\n</style>\n${filled.html}`;
      setTemplateSource(starter);
      syncDraftFromSource(starter);
      setDraft((current) => ({
        ...current,
        name: current.name?.trim() ? current.name : nameStem,
        category: current.category || 'General',
      }));

      const names = [...smart.detected, ...filled.detected].map((d) => d.name);
      if ((importAutoDetect || importTemplateizeFilled) && names.length) {
        // force-sync fields immediately (not waiting for debounce)
        setLastDetected(names);
        syncFieldsFromDetected(names);
      }

      setImportStatus(`Imported ${file.name}. You can now edit HTML/CSS and fields freely.`);
      setActiveTab('template');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  }, [importAutoDetect, importPdfAsImages, importTemplateizeFilled, syncDraftFromSource, syncFieldsFromDetected]);

  const saveTemplate = useCallback(async () => {
    setError(null);

    const bodyHtml = (draft.bodyHtml || '').trim();
    const fields = normalizeFieldOrders(draft.fields).map((f) => ({
      ...f,
      id: f.id || safeId('field'),
      name: f.name || toFieldName(f.label),
      label: f.label || f.name,
    }));

    if (!draft.name.trim()) {
      setError('Add a template name before saving.');
      setActiveTab('basics');
      return;
    }

    if (detectedPlaceholders.length > 0 && fields.length === 0) {
      setError('Your template contains variables. Sync or add fields before saving.');
      setActiveTab('template');
      return;
    }

    if (!bodyHtml) {
      setError('Add a template body (HTML) before saving.');
      setActiveTab('template');
      return;
    }

      const payload: Omit<DocumentTemplate, 'id' | 'createdAt' | 'updatedAt' | 'version'> = {
        name: draft.name.trim(),
        category: (draft.category || 'General').trim(),
        description: (draft.description || '').trim(),
        fields,
        template: `<div class="tpl"><style>\n${draft.css || ''}\n</style>\n${combinedTemplateHtml}</div>`,
        isCustom: true,
        renderSettings: {
          pageSize: page.size,
          pageWidthMm: page.size === 'Custom' ? page.widthMm : undefined,
          pageHeightMm: page.size === 'Custom' ? page.heightMm : undefined,
          pageMarginMm: page.marginMm,
          pageNumbersEnabled: Boolean(page.pageNumbersEnabled),
          pageBackgroundCss,
        },
      };

    setSaving(true);
    try {
      const res = await fetch('/api/templates/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const saved = await res.json().catch(() => null);
      if (!res.ok) throw new Error(saved?.error || 'Failed to save template');
      const created = saved as DocumentTemplate;
      onCreated?.(created);

      if (marketplaceDraft.publishEnabled) {
        const exampleData = Object.keys(previewOverrides || {}).length
          ? previewOverrides
          : buildSampleData([
            { id: 'title', name: 'title', label: 'Title', type: 'text', required: false, order: 0 } as any,
            { id: 'summary', name: 'summary', label: 'Summary', type: 'textarea', required: false, order: 0 } as any,
            ...fields,
          ] as any);
        (exampleData as any).title = draft.name || '';
        (exampleData as any).summary = draft.description || '';

        const publishRes = await fetch('/api/template-marketplace/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateId: created.id,
            priceInPaise: Math.max(0, Math.round(Number(marketplaceDraft.priceInr || 0) * 100)),
            tags: marketplaceDraft.tags,
            coverImageDataUrl: marketplaceDraft.coverImageDataUrl || undefined,
            exampleData,
          }),
        });
        const publishPayload = await publishRes.json().catch(() => null);
        if (!publishRes.ok) {
          throw new Error(publishPayload?.error || 'Template saved, but marketplace publish failed.');
        }
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template.');
    } finally {
      setSaving(false);
    }
  }, [combinedTemplateHtml, detectedPlaceholders.length, draft.bodyHtml, draft.category, draft.description, draft.fields, draft.name, draft.css, marketplaceDraft.coverImageDataUrl, marketplaceDraft.priceInr, marketplaceDraft.publishEnabled, marketplaceDraft.tags, normalizeFieldOrders, onClose, onCreated, page, pageBackgroundCss, previewOverrides]);

  const studioNav = useMemo(() => ([
    { key: 'import', label: 'Import', icon: FileUp },
    { key: 'basics', label: 'Basics', icon: Settings2 },
    { key: 'branding', label: 'Branding', icon: ImagePlus },
    { key: 'builder', label: 'Builder', icon: LayoutTemplate },
    { key: 'template', label: 'Template', icon: Code2 },
    { key: 'fields', label: 'Fields', icon: Tags },
    { key: 'marketplace', label: 'Sell', icon: ShoppingBag },
    { key: 'settings', label: 'Settings', icon: Settings2 },
  ] as const), []);

  const leftPanelTitle = useMemo(() => {
    const item = studioNav.find((it) => it.key === activeTab);
    return item?.label || 'Template Studio';
  }, [activeTab, studioNav]);

  const stepInfo = useMemo(() => {
    const steps: StudioTab[] = ['import', 'basics', 'branding', 'builder', 'template', 'fields', 'marketplace'];
    const idx = steps.indexOf(activeTab);
    if (idx === -1) return { idx: 0, total: steps.length };
    return { idx: idx + 1, total: steps.length };
  }, [activeTab]);

  const openPreviewFromTopBar = useCallback(() => {
    if (typeof window === 'undefined') {
      setPreviewFullscreenOpen(true);
      return;
    }
    // On mobile/tablet, switch panes instead of opening a dialog.
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
    if (isDesktop) {
      setPreviewFullscreenOpen(true);
    } else {
      setMobilePane('preview');
    }
  }, []);

  const applyAiStyler = useCallback(async (preset?: string) => {
    const prompt = String(preset || stylerPrompt || '').trim();
    if (!prompt) {
      setError('Add a short styling instruction first.');
      return;
    }
    if (!templateSource.trim()) {
      setError('Add template HTML before styling.');
      setActiveTab('template');
      return;
    }
    setStylerBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/template-studio/style', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          source: templateSource,
          templateName: draft.name,
          category: draft.category,
        }),
      });
      const payload = await res.json().catch(() => null) as any;
      if (!res.ok) throw new Error(payload?.error || 'Unable to style this template.');
      const nextSource = String(payload?.source || '').trim();
      if (!nextSource) throw new Error('AI did not return a styled template.');
      setTemplateSource(nextSource);
      syncDraftFromSource(nextSource);
      setStylerPrompt('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to style this template.');
    } finally {
      setStylerBusy(false);
    }
  }, [draft.category, draft.name, stylerPrompt, syncDraftFromSource, templateSource]);

  const generateAiExampleData = useCallback(async () => {
    const fields = normalizeFieldOrders(draft.fields);
    if (!fields.length) {
      setError('Add at least one field before generating an example.');
      setActiveTab('fields');
      return;
    }
    setFillBusy(true);
    setFillNote('');
    setError(null);
    try {
      const res = await fetch('/api/ai/template-studio/fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateName: draft.name,
          category: draft.category,
          description: draft.description,
          fields,
        }),
      });
      const payload = await res.json().catch(() => null) as any;
      if (!res.ok) throw new Error(payload?.error || 'Unable to generate example values.');
      const exampleData = payload?.exampleData && typeof payload.exampleData === 'object' ? payload.exampleData : null;
      if (!exampleData) throw new Error('AI did not return example values.');
      setPreviewOverrides((current) => ({ ...current, ...exampleData }));
      setFillNote(String(payload?.notes || '').trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate example values.');
    } finally {
      setFillBusy(false);
    }
  }, [draft.category, draft.description, draft.fields, draft.name, normalizeFieldOrders]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#f6f7fb] text-slate-950">
      <div className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
            aria-label="Close Template Studio"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-[0_10px_30px_rgba(124,58,237,0.22)]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold tracking-[-0.01em]">Template Studio</p>
              <p className="text-xs text-slate-500">Build clean HTML templates fast.</p>
            </div>
          </div>

          <div className="ml-auto flex min-w-0 items-center gap-2 lg:ml-0 lg:flex-1 lg:justify-center">
            <div className="hidden sm:flex items-center gap-1 rounded-full border border-slate-200 bg-white px-1.5 py-1 shadow-sm">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
                aria-label="Undo"
                title="Undo"
                onClick={() => {
                  try {
                    templateEditorRef.current?.focus();
                    document.execCommand('undo');
                  } catch {
                    // best-effort
                  }
                }}
              >
                <Undo2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
                aria-label="Redo"
                title="Redo"
                onClick={() => {
                  try {
                    templateEditorRef.current?.focus();
                    document.execCommand('redo');
                  } catch {
                    // best-effort
                  }
                }}
              >
                <Redo2 className="h-4 w-4" />
              </button>
            </div>

            <div className="hidden sm:flex min-w-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm">
              <LayoutTemplate className="h-4 w-4 text-violet-600" />
              <Input
                value={draft.name}
                onChange={(e) => setDraft((c) => ({ ...c, name: e.target.value }))}
                placeholder="Invoice Template"
                className="h-7 w-[220px] border-0 bg-transparent px-0 text-sm font-semibold text-slate-950 placeholder:text-slate-400 focus-visible:ring-0"
              />
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
                Draft
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-full border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
              onClick={openPreviewFromTopBar}
            >
              Preview
            </Button>
            <Button
              type="button"
              className="h-10 rounded-full bg-slate-950 px-4 text-sm font-semibold text-white shadow-[0_14px_45px_rgba(2,6,23,0.18)] hover:bg-slate-900"
              onClick={() => void saveTemplate()}
              disabled={saving}
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save template
            </Button>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
              aria-label="More actions"
              title="More"
            >
              <span className="text-lg leading-none">▾</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid h-[calc(100vh-64px)] grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[220px_420px_minmax(0,1fr)] lg:gap-5 lg:p-6">
        <aside className="hidden min-w-0 flex-col justify-between rounded-3xl border border-slate-200/80 bg-white/80 p-3 shadow-[0_10px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl lg:flex">
          <div className="space-y-2">
            {studioNav.map(({ key, label, icon: Icon }) => {
              const active = activeTab === key;
              const tone =
                key === 'import' || key === 'template' ? 'text-violet-600' :
                key === 'marketplace' ? 'text-emerald-600' :
                key === 'branding' ? 'text-sky-600' :
                key === 'fields' ? 'text-indigo-600' :
                key === 'basics' ? 'text-slate-700' :
                'text-slate-700';
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key as StudioTab)}
                  className={`group relative flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 ${
                    active
                      ? 'bg-violet-50 text-slate-950 shadow-sm'
                      : 'text-slate-700 hover:bg-slate-50 hover:text-slate-950'
                  }`}
                >
                  <span className={`absolute left-0 top-2 bottom-2 w-1 rounded-full ${active ? 'bg-violet-600' : 'bg-transparent'}`} />
                  <span className={`flex h-10 w-10 items-center justify-center rounded-2xl border ${
                    active ? 'border-violet-200 bg-white' : 'border-slate-200 bg-white'
                  }`}>
                    <Icon className={`h-4 w-4 ${active ? tone : 'text-slate-500 group-hover:text-slate-700'}`} />
                  </span>
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-sm font-semibold text-slate-950">Need help?</p>
            <p className="mt-1 text-xs text-slate-600">View docs and tips for building templates.</p>
            <button
              type="button"
              className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
            >
              View docs
            </button>
          </div>
        </aside>

        <div className={`min-w-0 overflow-auto rounded-3xl border border-slate-200/80 bg-white/80 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl lg:p-5 ${mobilePane === 'setup' ? '' : 'hidden'} lg:block`}>
          <div className="lg:hidden">
            <div className="flex items-center gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {studioNav.map(({ key, label, icon: Icon }) => {
                const active = activeTab === key;
                return (
                  <button
                    key={`mobile-${key}`}
                    type="button"
                    onClick={() => setActiveTab(key as StudioTab)}
                    className={`shrink-0 rounded-2xl border px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 ${
                      active
                        ? 'border-violet-200 bg-violet-50 text-slate-950'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${active ? 'text-violet-600' : 'text-slate-500'}`} />
                      <span className="whitespace-nowrap">{label}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobilePane('setup')}
                className={`flex-1 rounded-2xl border px-3 py-2 text-sm font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 ${
                  mobilePane === 'setup' ? 'border-violet-200 bg-violet-50 text-slate-950' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Setup
              </button>
              <button
                type="button"
                onClick={() => setMobilePane('preview')}
                className={`flex-1 rounded-2xl border px-3 py-2 text-sm font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 ${
                  mobilePane === 'preview' ? 'border-violet-200 bg-violet-50 text-slate-950' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Preview
              </button>
            </div>
          </div>

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{leftPanelTitle.toUpperCase()}</p>
              {stepInfo.idx ? (
                <p className="mt-1 text-sm font-semibold text-slate-950">Step {stepInfo.idx} of {stepInfo.total}</p>
              ) : (
                <p className="mt-1 text-sm font-semibold text-slate-950">Settings</p>
              )}
              <div className="mt-3 flex items-center gap-2">
                {Array.from({ length: stepInfo.total }).map((_, idx) => (
                  <div
                    key={`seg-${idx}`}
                    className={`h-1.5 flex-1 rounded-full ${
                      stepInfo.idx && idx < stepInfo.idx ? 'bg-violet-600' : 'bg-slate-200'
                    }`}
                  />
                ))}
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-full border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
              onClick={() => setPreviewFullscreenOpen(true)}
            >
              <Maximize2 className="mr-2 h-4 w-4 text-slate-700" />
              Full screen
            </Button>
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as StudioTab)}>

            <TabsContent value="import" className="mt-5 space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold tracking-[-0.02em] text-slate-950">Import a document</p>
                    <p className="mt-1 text-sm text-slate-600">DOCX and HTML keep styling best. PDF can be imported as text or high-fidelity pages.</p>
                    {importLastFileName || importStatus ? (
                      <p className="mt-2 truncate text-xs font-semibold text-slate-600">
                        {importing ? 'Working…' : 'Last import:'}{' '}
                        <span className="font-semibold text-slate-950">{importLastFileName || 'None'}</span>
                        {importStatus ? <span className="ml-2 font-medium text-slate-500">· {importStatus}</span> : null}
                      </p>
                    ) : null}
                  </div>
                </div>

                <input
                  ref={importFileInputRef}
                  type="file"
                  accept=".docx,.html,.htm,.txt,.md,.pdf"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    if (!file) return;
                    void importDocumentAsTemplate(file);
                    event.target.value = '';
                  }}
                />

                <button
                  type="button"
                  onClick={() => importFileInputRef.current?.click()}
                  disabled={importing}
                  className="mt-4 flex w-full flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-violet-200 bg-violet-50/30 px-4 py-8 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition hover:border-violet-300 hover:bg-violet-50/40 disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
                    {importing ? <Loader2 className="h-5 w-5 animate-spin text-violet-600" /> : <FileUp className="h-5 w-5 text-violet-600" />}
                  </span>
                  <span className="text-sm font-semibold text-slate-950">{importing ? 'Importing…' : 'Upload document'}</span>
                  <span className="text-xs font-medium text-slate-500">DOCX, HTML or PDF</span>
                </button>

                <div className="mt-4 grid gap-3">
                  <label className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <span className="flex items-start gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50">
                        <Monitor className="h-4 w-4 text-sky-600" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-950">High-fidelity PDF import</span>
                        <span className="mt-0.5 block text-xs font-medium text-slate-600">
                          Renders pages as images to keep layout accurate. Best for multi-page PDFs. (You can still add fields on top.)
                        </span>
                      </span>
                    </span>
                    <input
                      aria-label="Enable high-fidelity PDF import"
                      type="checkbox"
                      checked={importPdfAsImages}
                      onChange={(e) => setImportPdfAsImages(e.target.checked)}
                      className="mt-1 h-5 w-5 accent-sky-600"
                    />
                  </label>

                  <label className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <span className="flex items-start gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-50">
                        <Sparkles className="h-4 w-4 text-violet-600" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-950">Smart variable detection</span>
                        <span className="mt-0.5 block text-xs font-medium text-slate-600">
                          Turns markers like [Client Name], {'{{Amount}}'}, or blanks into fields automatically.
                        </span>
                      </span>
                    </span>
                    <input
                      aria-label="Enable smart variable detection"
                      type="checkbox"
                      checked={importAutoDetect}
                      onChange={(e) => setImportAutoDetect(e.target.checked)}
                      className="mt-1 h-5 w-5 accent-violet-600"
                    />
                  </label>

                  <label className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <span className="flex items-start gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50">
                        <Settings2 className="h-4 w-4 text-emerald-600" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-950">Convert filled values</span>
                        <span className="mt-0.5 block text-xs font-medium text-slate-600">
                          If the document is already filled, swap label/value rows into reusable fields.
                        </span>
                      </span>
                    </span>
                    <input
                      aria-label="Convert filled values into template fields"
                      type="checkbox"
                      checked={importTemplateizeFilled}
                      onChange={(e) => setImportTemplateizeFilled(e.target.checked)}
                      className="mt-1 h-5 w-5 accent-emerald-600"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-3xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.20em] text-amber-700">Pro Tip</p>
                <p className="mt-2 text-sm text-slate-800">
                  Use placeholders like <span className="rounded bg-white px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-900">{'{{clientName}}'}</span>{' '}
                  or markers like <span className="rounded bg-white px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-900">[Client Name]</span>.
                </p>
                <p className="mt-1 text-sm text-slate-700">We auto-detect fields and you can still edit everything.</p>
              </div>
            </TabsContent>

            <TabsContent value="basics" className="mt-5 space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Template name</p>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft((c) => ({ ...c, name: e.target.value }))}
                  placeholder="Untitled template"
                  className="mt-2 h-11 rounded-2xl border-slate-200 bg-white shadow-sm focus-visible:ring-violet-400/50"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Category</p>
                  <select
                    value={draft.category}
                    onChange={(e) => setDraft((c) => ({ ...c, category: e.target.value }))}
                    className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-violet-400/50"
                  >
                    {CATEGORY_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Description</p>
                    <Input
                      value={draft.description}
                      onChange={(e) => setDraft((c) => ({ ...c, description: e.target.value }))}
                      placeholder="Short description"
                      className="mt-2 h-11 rounded-2xl border-slate-200 bg-white shadow-sm focus-visible:ring-violet-400/50"
                    />
                  </div>
                </div>
            </TabsContent>

	            <TabsContent value="branding" className="mt-5 space-y-4">
	              <div className="rounded-[1.2rem] border border-white/70 bg-white/75 p-4">
	                <div className="flex items-center justify-between gap-2">
	                  <div>
	                    <p className="text-sm font-semibold text-slate-950">Logo</p>
	                    <p className="mt-1 text-sm text-slate-600">Upload once. It gets embedded into the template.</p>
	                  </div>
	                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFile} />
	                  <Button type="button" variant="outline" className="rounded-full bg-white/70" onClick={() => fileInputRef.current?.click()}>
	                    <ImagePlus className="mr-2 h-4 w-4" />
	                    Add
	                  </Button>
	                </div>
                {branding.logoDataUrl ? (
                  <div className="mt-4 rounded-[1.1rem] border border-white/70 bg-white/80 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <img src={branding.logoDataUrl} alt="Logo preview" className="h-10 max-w-[220px] object-contain" />
                      <Button type="button" variant="outline" className="rounded-full bg-white/70" onClick={() => setBranding((c) => ({ ...c, logoDataUrl: '' }))}>
                        Remove
                      </Button>
                    </div>
                    <div className="mt-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Max height (px)</p>
                      <Input
                        type="number"
                        min={18}
                        max={72}
                        value={branding.logoMaxHeight}
                        onChange={(e) => setBranding((c) => ({ ...c, logoMaxHeight: Number(e.target.value || 42) }))}
                        className="mt-2 h-11 rounded-2xl border-white/70 bg-white/85"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-[1.1rem] border border-dashed border-white/70 bg-white/70 p-4 text-sm text-slate-600">
                    No logo yet.
                  </div>
                )}
	              </div>

	              <div className="rounded-[1.2rem] border border-white/70 bg-white/75 p-4">
	                <div className="flex flex-wrap items-center justify-between gap-3">
	                  <div>
	                    <p className="text-sm font-semibold text-slate-950">Page background</p>
	                    <p className="mt-1 text-sm text-slate-600">Set a background for the template page (printed in PDF too).</p>
	                  </div>
	                  <input ref={backgroundImageInputRef} type="file" accept="image/*" className="hidden" onChange={handleBackgroundImageFile} />
	                </div>

	                <div className="mt-3 inline-flex flex-wrap gap-2 rounded-full border border-white/70 bg-white/70 p-1">
	                  {(['solid', 'gradient', 'image'] as const).map((k) => (
	                    <button
	                      key={k}
	                      type="button"
	                      onClick={() => setBackground((c) => ({ ...c, kind: k }))}
	                      className={`h-9 rounded-full px-4 text-sm font-semibold transition ${
	                        background.kind === k ? 'bg-slate-950 text-white' : 'text-slate-700 hover:bg-white/80 hover:text-slate-950'
	                      }`}
	                    >
	                      {k === 'solid' ? 'Solid' : k === 'gradient' ? 'Gradient' : 'Image'}
	                    </button>
	                  ))}
	                </div>

	                {background.kind === 'solid' ? (
	                  <div className="mt-4 flex flex-wrap items-center gap-3">
	                    {['#ffffff', '#f8fafc', '#fff7ed', '#0b1220'].map((swatch) => (
	                      <button
	                        key={swatch}
	                        type="button"
	                        onClick={() => setBackground((c) => ({ ...c, solid: swatch }))}
	                        className={`h-10 w-10 rounded-2xl border transition ${
	                          background.solid.toLowerCase() === swatch.toLowerCase()
	                            ? 'border-slate-900 ring-2 ring-violet-400/40'
	                            : 'border-white/70 hover:border-slate-300'
	                        }`}
	                        style={{ background: swatch }}
	                        aria-label={`Use ${swatch}`}
	                      />
	                    ))}
	                    <div className="flex items-center gap-2 rounded-2xl border border-white/70 bg-white/80 px-3 py-2">
	                      <span className="text-xs font-semibold text-slate-600">Hex</span>
	                      <Input
	                        value={background.solid}
	                        onChange={(e) => setBackground((c) => ({ ...c, solid: e.target.value }))}
	                        className="h-7 w-[120px] border-0 bg-transparent px-0 text-sm font-semibold text-slate-950 focus-visible:ring-0"
	                        placeholder="#ffffff"
	                      />
	                    </div>
	                  </div>
	                ) : null}

	                {background.kind === 'gradient' ? (
	                  <div className="mt-4 space-y-3">
	                    <div className="flex flex-wrap gap-2">
	                      {[
	                        'linear-gradient(135deg, rgba(44,93,169,0.12), rgba(200,218,249,0.55), rgba(255,255,255,1))',
	                        'linear-gradient(135deg, rgba(15,23,42,0.06), rgba(44,93,169,0.10), rgba(255,247,237,0.42))',
	                        'radial-gradient(circle at 30% 22%, rgba(245,158,11,0.16), transparent 55%), linear-gradient(135deg, rgba(44,93,169,0.10), rgba(255,255,255,1))',
	                      ].map((preset) => (
	                        <button
	                          key={preset}
	                          type="button"
	                          onClick={() => setBackground((c) => ({ ...c, gradient: preset }))}
	                          className={`h-10 w-24 rounded-2xl border border-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.86)] transition hover:border-slate-300 ${
	                            background.gradient === preset ? 'ring-2 ring-violet-400/40' : ''
	                          }`}
	                          style={{ background: preset }}
	                          aria-label="Use gradient preset"
	                        />
	                      ))}
	                    </div>
	                    <Textarea
	                      value={background.gradient}
	                      onChange={(e) => setBackground((c) => ({ ...c, gradient: e.target.value }))}
	                      className="min-h-[70px] rounded-[1.1rem] border-white/70 bg-white/85 font-mono text-xs"
	                      placeholder="Paste a CSS gradient, e.g. linear-gradient(...)"
	                    />
	                  </div>
	                ) : null}

	                {background.kind === 'image' ? (
	                  <div className="mt-4 space-y-3">
	                    <div className="flex flex-wrap items-center gap-2">
	                      <Button
	                        type="button"
	                        variant="outline"
	                        className="h-10 rounded-full bg-white/70"
	                        onClick={() => backgroundImageInputRef.current?.click()}
	                      >
	                        <ImagePlus className="mr-2 h-4 w-4" />
	                        Upload
	                      </Button>
	                      <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 p-1">
	                        {(['cover', 'contain'] as const).map((fit) => (
	                          <button
	                            key={fit}
	                            type="button"
	                            onClick={() => setBackground((c) => ({ ...c, fit }))}
	                            className={`h-9 rounded-full px-4 text-sm font-semibold transition ${
	                              background.fit === fit ? 'bg-slate-950 text-white' : 'text-slate-700 hover:bg-white/80 hover:text-slate-950'
	                            }`}
	                          >
	                            {fit === 'cover' ? 'Cover' : 'Contain'}
	                          </button>
	                        ))}
	                      </div>
	                      {background.imageDataUrl ? (
	                        <Button type="button" variant="outline" className="h-10 rounded-full bg-white/70" onClick={() => setBackground((c) => ({ ...c, imageDataUrl: '' }))}>
	                          Remove
	                        </Button>
	                      ) : null}
	                    </div>
	                    <div className="overflow-hidden rounded-[1.1rem] border border-white/70 bg-white/80 p-3">
	                      {background.imageDataUrl ? (
	                        // eslint-disable-next-line @next/next/no-img-element
	                        <img src={background.imageDataUrl} alt="Background preview" className="h-20 w-full rounded-xl object-cover" />
	                      ) : (
	                        <p className="text-sm text-slate-600">No background image yet.</p>
	                      )}
	                    </div>
	                  </div>
	                ) : null}
	              </div>

	              <div className="rounded-[1.2rem] border border-white/70 bg-white/75 p-4">
	                <div className="flex flex-wrap items-center justify-between gap-3">
	                  <p className="text-sm font-semibold text-slate-950">Header and footer</p>
                  <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={branding.headerEnabled}
                        onChange={(e) => setBranding((c) => ({ ...c, headerEnabled: e.target.checked }))}
                      />
                      Header
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={branding.footerEnabled}
                        onChange={(e) => setBranding((c) => ({ ...c, footerEnabled: e.target.checked }))}
                      />
                      Footer
                    </label>
                  </div>
                </div>

                <div className="mt-4 grid gap-3">
                  <input ref={headerImageInputRef} type="file" accept="image/*" className="hidden" onChange={handleHeaderImageFile} />
                  <input ref={footerImageInputRef} type="file" accept="image/*" className="hidden" onChange={handleFooterImageFile} />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[1.1rem] border border-white/70 bg-white/80 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-950">Header image</p>
                          <p className="mt-1 text-xs text-slate-600">Optional. Full-width image header.</p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-full bg-white/70"
                          onClick={() => headerImageInputRef.current?.click()}
                        >
                          <ImagePlus className="mr-2 h-4 w-4" />
                          Add
                        </Button>
                      </div>
                      {branding.headerImageDataUrl ? (
                        <div className="mt-3 rounded-[0.95rem] border border-white/70 bg-white/85 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <img src={branding.headerImageDataUrl} alt="Header preview" className="h-12 w-full max-w-[260px] object-contain" />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-full bg-white/70"
                              onClick={() => setBranding((c) => ({ ...c, headerImageDataUrl: '' }))}
                            >
                              Remove
                            </Button>
                          </div>
                          <div className="mt-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Max height (px)</p>
                            <Input
                              type="number"
                              min={48}
                              max={220}
                              value={branding.headerImageMaxHeight}
                              onChange={(e) => setBranding((c) => ({ ...c, headerImageMaxHeight: Number(e.target.value || 120) }))}
                              className="mt-2 h-10 rounded-2xl border-white/70 bg-white/85"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-[0.95rem] border border-dashed border-white/70 bg-white/75 p-3 text-xs text-slate-600">
                          No header image.
                        </div>
                      )}
                    </div>

                    <div className="rounded-[1.1rem] border border-white/70 bg-white/80 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-950">Footer image</p>
                          <p className="mt-1 text-xs text-slate-600">Optional. Full-width image footer.</p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-full bg-white/70"
                          onClick={() => footerImageInputRef.current?.click()}
                        >
                          <ImagePlus className="mr-2 h-4 w-4" />
                          Add
                        </Button>
                      </div>
                      {branding.footerImageDataUrl ? (
                        <div className="mt-3 rounded-[0.95rem] border border-white/70 bg-white/85 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <img src={branding.footerImageDataUrl} alt="Footer preview" className="h-12 w-full max-w-[260px] object-contain" />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-full bg-white/70"
                              onClick={() => setBranding((c) => ({ ...c, footerImageDataUrl: '' }))}
                            >
                              Remove
                            </Button>
                          </div>
                          <div className="mt-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Max height (px)</p>
                            <Input
                              type="number"
                              min={32}
                              max={220}
                              value={branding.footerImageMaxHeight}
                              onChange={(e) => setBranding((c) => ({ ...c, footerImageMaxHeight: Number(e.target.value || 90) }))}
                              className="mt-2 h-10 rounded-2xl border-white/70 bg-white/85"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-[0.95rem] border border-dashed border-white/70 bg-white/75 p-3 text-xs text-slate-600">
                          No footer image.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Brand name</p>
                      <Input
                        value={branding.brandName}
                        onChange={(e) => setBranding((c) => ({ ...c, brandName: e.target.value }))}
                        className="mt-2 h-11 rounded-2xl border-white/70 bg-white/85"
                        placeholder="Company or brand"
                      />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Subtitle</p>
                      <Input
                        value={branding.subtitle}
                        onChange={(e) => setBranding((c) => ({ ...c, subtitle: e.target.value }))}
                        className="mt-2 h-11 rounded-2xl border-white/70 bg-white/85"
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Right meta (placeholders allowed)</p>
                    <Textarea
                      value={branding.rightMeta}
                      onChange={(e) => setBranding((c) => ({ ...c, rightMeta: e.target.value }))}
                      className="mt-2 min-h-[80px] rounded-[1.1rem] border-white/70 bg-white/85 font-mono text-xs"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Footer left</p>
                      <Input
                        value={branding.footerLeft}
                        onChange={(e) => setBranding((c) => ({ ...c, footerLeft: e.target.value }))}
                        className="mt-2 h-11 rounded-2xl border-white/70 bg-white/85"
                      />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Footer right</p>
                      <Input
                        value={branding.footerRight}
                        onChange={(e) => setBranding((c) => ({ ...c, footerRight: e.target.value }))}
                        className="mt-2 h-11 rounded-2xl border-white/70 bg-white/85 font-mono text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>

	            </TabsContent>

              <TabsContent value="builder" className="mt-5">
                <div className="flex min-h-0 flex-col overflow-hidden">
                  <div className="sticky top-0 z-10 rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur-xl">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-950">No-code Builder</p>
                      <p className="mt-1 text-sm text-slate-600">Drag blocks, bind fields, set conditions, and style. Live preview updates instantly.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">
                        <input
                          type="checkbox"
                          checked={builderDriveTemplate}
                          onChange={(e) => setBuilderDriveTemplate(e.target.checked)}
                        />
                        Live sync
                      </label>
                      <div className="hidden sm:flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1 shadow-sm">
                        <button
                          type="button"
                          onClick={() => setBuilderInspectorTab('content')}
                          className={`h-9 rounded-full px-4 text-sm font-semibold transition ${
                            builderInspectorTab === 'content' ? 'bg-violet-50 text-slate-950' : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          Content
                        </button>
                        <button
                          type="button"
                          onClick={() => setBuilderInspectorTab('condition')}
                          className={`h-9 rounded-full px-4 text-sm font-semibold transition ${
                            builderInspectorTab === 'condition' ? 'bg-violet-50 text-slate-950' : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          Condition
                        </button>
                        <button
                          type="button"
                          onClick={() => setBuilderInspectorTab('style')}
                          className={`h-9 rounded-full px-4 text-sm font-semibold transition ${
                            builderInspectorTab === 'style' ? 'bg-violet-50 text-slate-950' : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          Style
                        </button>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 rounded-full border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
                        onClick={() => {
                          const next: BuilderBlock[] = [
                            {
                              id: safeId('blk'),
                              type: 'heading',
                              label: 'Heading',
                              text: '{{title}}',
                              level: 1,
                              condition: { enabled: false, fieldName: 'title', mode: 'present', equalsValue: '' },
                              style: makeDefaultBlockStyle({ fontSize: 24, fontWeight: 700 }),
                            } as HeadingBlock,
                            {
                              id: safeId('blk'),
                              type: 'paragraph',
                              label: 'Paragraph',
                              text: '{{summary}}',
                              condition: { enabled: false, fieldName: 'summary', mode: 'present', equalsValue: '' },
                              style: makeDefaultBlockStyle({ fontSize: 13, fontWeight: 500, textColor: 'rgba(15,23,42,.72)' }),
                            } as ParagraphBlock,
                          ];
                          const fields = normalizeFieldOrders(draft.fields || []);
                          fields.forEach((f) => {
                            next.push({
                              id: safeId('blk'),
                              type: 'field',
                              label: 'Field',
                              fieldName: f.name,
                              fieldLabel: f.label || f.name,
                              showLabel: true,
                              condition: makeDefaultCondition(),
                              style: makeDefaultBlockStyle({ padding: 12, radius: 14, border: true, background: 'rgba(248,250,252,0.96)', fontSize: 13, fontWeight: 600 }),
                            } as FieldBlock);
                          });
                          setBuilderBlocks(next);
                          setBuilderSelectedId(next[0]?.id || null);
                          setImportStatus('Generated a builder layout from your fields. Drag blocks to refine.');
                        }}
                      >
                        Build from fields
                      </Button>
                      <Button
                        type="button"
                        className="h-10 rounded-full bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-900"
                        onClick={() => setActiveTab('template')}
                      >
                        <Code2 className="mr-2 h-4 w-4" />
                        Edit HTML
                      </Button>
                    </div>

                    <div className="mt-3 flex items-center gap-2 sm:hidden">
                      <button
                        type="button"
                        onClick={() => setBuilderMobilePane('blocks')}
                        className={`flex-1 rounded-2xl border px-3 py-2 text-sm font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 ${
                          builderMobilePane === 'blocks' ? 'border-violet-200 bg-violet-50 text-slate-950' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        Blocks
                      </button>
                      <button
                        type="button"
                        onClick={() => setBuilderMobilePane('inspector')}
                        className={`flex-1 rounded-2xl border px-3 py-2 text-sm font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 ${
                          builderMobilePane === 'inspector' ? 'border-violet-200 bg-violet-50 text-slate-950' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        Inspector
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[360px_minmax(0,1fr)]">
                    <div className={`flex min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm ${builderMobilePane === 'blocks' ? '' : 'hidden'} sm:flex lg:flex`}>
                      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Blocks</p>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-9 rounded-full"
                            onClick={() => {
                              const blk = createBuilderBlock('section');
                              builderInsertAtContainer([], builderBlocks.length, blk);
                            }}
                          >
                            + Section
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-9 rounded-full"
                            onClick={() => {
                              const blk = createBuilderBlock('columns2');
                              builderInsertAtContainer([], builderBlocks.length, blk);
                            }}
                          >
                            + 2 Columns
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 px-4 py-3">
                        {([
                          { type: 'heading', label: 'Heading', tone: 'text-violet-600' },
                          { type: 'paragraph', label: 'Text', tone: 'text-slate-700' },
                          { type: 'field', label: 'Field', tone: 'text-indigo-600' },
                          { type: 'table', label: 'Table', tone: 'text-sky-600' },
                          { type: 'divider', label: 'Divider', tone: 'text-slate-500' },
                          { type: 'spacer', label: 'Spacer', tone: 'text-slate-500' },
                          { type: 'image', label: 'Image', tone: 'text-emerald-600' },
                        ] as Array<{ type: BuilderBlockType; label: string; tone: string }>).map((item) => (
                          <button
                            key={`pal-${item.type}`}
                            type="button"
                            draggable
                            onDragStart={() => { builderDragTypeRef.current = item.type; }}
                            onClick={() => {
                              const blk = createBuilderBlock(item.type);
                              const insertAt = builderBlocks.length;
                              builderInsertAtContainer([], insertAt, blk);
                            }}
                            className="group inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
                            aria-label={`Add ${item.label}`}
                            title={`Add ${item.label}`}
                          >
                            <span className={`h-2.5 w-2.5 rounded-full ${item.tone.replace('text-', 'bg-')}`} />
                            <span className="truncate">{item.label}</span>
                          </button>
                        ))}
                      </div>

                      <div
                        className="min-h-0 flex-1 overflow-auto px-3 pb-3 pt-1"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          const t = builderDragTypeRef.current;
                          if (!t) return;
                          const blk = createBuilderBlock(t as BuilderBlockType);
                          builderInsertAtContainer([], builderBlocks.length, blk);
                          builderDragTypeRef.current = '';
                        }}
                      >
                        {builderRenderTree(builderBlocks || [], [], 0)}
                        {!builderBlocks?.length ? (
                          <div className="mt-6 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                            <p className="text-sm font-semibold text-slate-950">Drop blocks here</p>
                            <p className="mt-1 text-sm text-slate-600">Start by dragging from the palette above.</p>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className={`flex min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm ${builderMobilePane === 'inspector' ? '' : 'hidden'} sm:flex lg:flex`}>
                      <div className="border-b border-slate-200 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Inspector</p>
                          <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm sm:hidden">
                            <button
                              type="button"
                              onClick={() => setBuilderInspectorTab('content')}
                              className={`h-9 rounded-full px-4 text-sm font-semibold transition ${
                                builderInspectorTab === 'content' ? 'bg-violet-50 text-slate-950' : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              Content
                            </button>
                            <button
                              type="button"
                              onClick={() => setBuilderInspectorTab('condition')}
                              className={`h-9 rounded-full px-4 text-sm font-semibold transition ${
                                builderInspectorTab === 'condition' ? 'bg-violet-50 text-slate-950' : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              Condition
                            </button>
                            <button
                              type="button"
                              onClick={() => setBuilderInspectorTab('style')}
                              className={`h-9 rounded-full px-4 text-sm font-semibold transition ${
                                builderInspectorTab === 'style' ? 'bg-violet-50 text-slate-950' : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              Style
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="min-h-0 flex-1 overflow-auto p-4">
                        {!builderSelectedBlock ? (
                          <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                            <p className="text-sm font-semibold text-slate-950">Select a block</p>
                            <p className="mt-1 text-sm text-slate-600">Then tune content, binding, conditions, and style.</p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {builderInspectorTab === 'content' ? (
                              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                                <p className="text-sm font-semibold text-slate-950">Content</p>
                                <p className="mt-1 text-sm text-slate-600">Set what the block displays.</p>

                              {builderSelectedBlock.type === 'heading' ? (
                                <div className="mt-3 space-y-3">
                                  <Input
                                    value={(builderSelectedBlock as HeadingBlock).text}
                                    onChange={(e) => builderUpdateBlockById(builderSelectedBlock.id, (b) => ({ ...(b as HeadingBlock), text: e.target.value } as BuilderBlock))}
                                    className="h-11 rounded-2xl border-slate-200 bg-white shadow-sm"
                                    placeholder="Heading text"
                                  />
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <div>
                                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Level</p>
                                      <select
                                        value={(builderSelectedBlock as HeadingBlock).level}
                                        onChange={(e) => builderUpdateBlockById(builderSelectedBlock.id, (b) => ({ ...(b as HeadingBlock), level: Number(e.target.value) as any } as BuilderBlock))}
                                        className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-violet-400/50"
                                      >
                                        <option value={1}>H1</option>
                                        <option value={2}>H2</option>
                                        <option value={3}>H3</option>
                                      </select>
                                    </div>
                                    <div>
                                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Alignment</p>
                                      <select
                                        value={builderSelectedBlock.style.align}
                                        onChange={(e) => builderUpdateBlockById(builderSelectedBlock.id, (b) => ({ ...b, style: { ...b.style, align: e.target.value as any } }))}
                                        className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-violet-400/50"
                                      >
                                        <option value="left">Left</option>
                                        <option value="center">Center</option>
                                        <option value="right">Right</option>
                                      </select>
                                    </div>
                                  </div>
                                </div>
                              ) : null}

                              {builderSelectedBlock.type === 'paragraph' ? (
                                <div className="mt-3 space-y-3">
                                  <Textarea
                                    value={(builderSelectedBlock as ParagraphBlock).text}
                                    onChange={(e) => builderUpdateBlockById(builderSelectedBlock.id, (b) => ({ ...(b as ParagraphBlock), text: e.target.value } as BuilderBlock))}
                                    className="min-h-[120px] rounded-[1.25rem] border-slate-200 bg-white text-sm shadow-sm"
                                    placeholder="Write your paragraph"
                                  />
                                </div>
                              ) : null}

                              {builderSelectedBlock.type === 'field' ? (
                                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                  <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Field</p>
                                    <select
                                      value={(builderSelectedBlock as FieldBlock).fieldName}
                                      onChange={(e) => {
                                        const name = e.target.value;
                                        const label = builderFieldOptions.find((f) => f.name === name)?.label || name;
                                        builderUpdateBlockById(builderSelectedBlock.id, (b) => ({ ...(b as FieldBlock), fieldName: name, fieldLabel: label } as BuilderBlock));
                                      }}
                                      className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-violet-400/50"
                                    >
                                      {builderFieldOptions.map((opt) => (
                                        <option key={`opt-${opt.name}`} value={opt.name}>{opt.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Label</p>
                                    <Input
                                      value={(builderSelectedBlock as FieldBlock).fieldLabel}
                                      onChange={(e) => builderUpdateBlockById(builderSelectedBlock.id, (b) => ({ ...(b as FieldBlock), fieldLabel: e.target.value } as BuilderBlock))}
                                      className="mt-2 h-11 rounded-2xl border-slate-200 bg-white shadow-sm"
                                    />
                                  </div>
                                  <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm sm:col-span-2">
                                    <input
                                      type="checkbox"
                                      checked={(builderSelectedBlock as FieldBlock).showLabel}
                                      onChange={(e) => builderUpdateBlockById(builderSelectedBlock.id, (b) => ({ ...(b as FieldBlock), showLabel: e.target.checked } as BuilderBlock))}
                                    />
                                    Show label
                                  </label>
                                </div>
                              ) : null}

                              {builderSelectedBlock.type === 'section' ? (
                                <div className="mt-3 space-y-3">
                                  <Input
                                    value={(builderSelectedBlock as SectionBlock).title}
                                    onChange={(e) => builderUpdateBlockById(builderSelectedBlock.id, (b) => ({ ...(b as SectionBlock), title: e.target.value } as BuilderBlock))}
                                    className="h-11 rounded-2xl border-slate-200 bg-white shadow-sm"
                                    placeholder="Section title"
                                  />
                                  <Input
                                    value={(builderSelectedBlock as SectionBlock).subtitle}
                                    onChange={(e) => builderUpdateBlockById(builderSelectedBlock.id, (b) => ({ ...(b as SectionBlock), subtitle: e.target.value } as BuilderBlock))}
                                    className="h-11 rounded-2xl border-slate-200 bg-white shadow-sm"
                                    placeholder="Section subtitle (optional)"
                                  />
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="h-10 rounded-full"
                                      onClick={() => {
                                        const child = createBuilderBlock('paragraph');
                                        builderUpdateBlockById(builderSelectedBlock.id, (b) => ({ ...(b as SectionBlock), children: [...((b as SectionBlock).children || []), child] } as BuilderBlock));
                                        setBuilderSelectedId(child.id);
                                      }}
                                    >
                                      + Add text
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="h-10 rounded-full"
                                      onClick={() => {
                                        const child = createBuilderBlock('field');
                                        builderUpdateBlockById(builderSelectedBlock.id, (b) => ({ ...(b as SectionBlock), children: [...((b as SectionBlock).children || []), child] } as BuilderBlock));
                                        setBuilderSelectedId(child.id);
                                      }}
                                    >
                                      + Add field
                                    </Button>
                                  </div>
                                </div>
                              ) : null}

                              {builderSelectedBlock.type === 'columns2' ? (
                                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                  <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Gap (px)</p>
                                    <Input
                                      type="number"
                                      min={8}
                                      max={32}
                                      value={(builderSelectedBlock as Columns2Block).gap}
                                      onChange={(e) => builderUpdateBlockById(builderSelectedBlock.id, (b) => ({ ...(b as Columns2Block), gap: Number(e.target.value || 14) } as BuilderBlock))}
                                      className="mt-2 h-11 rounded-2xl border-slate-200 bg-white shadow-sm"
                                    />
                                  </div>
                                  <div className="flex flex-wrap items-end gap-2">
                                    <Button type="button" variant="outline" className="h-10 rounded-full" onClick={() => builderAddChild(builderSelectedBlock.id, 'left', 'field')}>
                                      + Left field
                                    </Button>
                                    <Button type="button" variant="outline" className="h-10 rounded-full" onClick={() => builderAddChild(builderSelectedBlock.id, 'right', 'field')}>
                                      + Right field
                                    </Button>
                                  </div>
                                </div>
                              ) : null}

                              {builderSelectedBlock.type === 'table' ? (
                                <div className="mt-3 space-y-3">
                                  <div className="grid gap-3 sm:grid-cols-3">
                                    <div>
                                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Columns</p>
                                      <Input
                                        type="number"
                                        min={1}
                                        max={8}
                                        value={(builderSelectedBlock as TableBlock).columns}
                                        onChange={(e) => builderUpdateBlockById(builderSelectedBlock.id, (b) => {
                                          const cols = Math.max(1, Math.min(8, Number(e.target.value || 3)));
                                          const rows = (b as TableBlock).rows;
                                          const cells = Array.from({ length: cols * rows }).map((_, i) => (b as TableBlock).cells?.[i] ?? (i < cols ? `Header ${i + 1}` : ''));
                                          return { ...(b as TableBlock), columns: cols, cells } as BuilderBlock;
                                        })}
                                        className="mt-2 h-11 rounded-2xl border-slate-200 bg-white shadow-sm"
                                      />
                                    </div>
                                    <div>
                                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Rows</p>
                                      <Input
                                        type="number"
                                        min={1}
                                        max={18}
                                        value={(builderSelectedBlock as TableBlock).rows}
                                        onChange={(e) => builderUpdateBlockById(builderSelectedBlock.id, (b) => {
                                          const rows = Math.max(1, Math.min(18, Number(e.target.value || 4)));
                                          const cols = (b as TableBlock).columns;
                                          const cells = Array.from({ length: cols * rows }).map((_, i) => (b as TableBlock).cells?.[i] ?? (i < cols ? `Header ${i + 1}` : ''));
                                          return { ...(b as TableBlock), rows, cells } as BuilderBlock;
                                        })}
                                        className="mt-2 h-11 rounded-2xl border-slate-200 bg-white shadow-sm"
                                      />
                                    </div>
                                    <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
                                      <input
                                        type="checkbox"
                                        checked={(builderSelectedBlock as TableBlock).header}
                                        onChange={(e) => builderUpdateBlockById(builderSelectedBlock.id, (b) => ({ ...(b as TableBlock), header: e.target.checked } as BuilderBlock))}
                                      />
                                      Header row
                                    </label>
                                  </div>
                                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-3">
                                    <p className="text-xs font-semibold text-slate-600">Quick edit (first 8 cells)</p>
                                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                      {Array.from({ length: Math.min(8, (builderSelectedBlock as TableBlock).cells?.length || 0) }).map((_, i) => (
                                        <Input
                                          key={`cell-${i}`}
                                          value={String((builderSelectedBlock as TableBlock).cells?.[i] ?? '')}
                                          onChange={(e) => builderUpdateBlockById(builderSelectedBlock.id, (b) => {
                                            const next = [...((b as TableBlock).cells || [])];
                                            next[i] = e.target.value;
                                            return { ...(b as TableBlock), cells: next } as BuilderBlock;
                                          })}
                                          className="h-10 rounded-2xl border-slate-200 bg-white shadow-sm"
                                        />
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              ) : null}

                              {builderSelectedBlock.type === 'image' ? (
                                <div className="mt-3 space-y-3">
                                  <Input
                                    value={(builderSelectedBlock as ImageBlock).alt}
                                    onChange={(e) => builderUpdateBlockById(builderSelectedBlock.id, (b) => ({ ...(b as ImageBlock), alt: e.target.value } as BuilderBlock))}
                                    className="h-11 rounded-2xl border-slate-200 bg-white shadow-sm"
                                    placeholder="Alt text"
                                  />
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <div>
                                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Fit</p>
                                      <select
                                        value={(builderSelectedBlock as ImageBlock).fit}
                                        onChange={(e) => builderUpdateBlockById(builderSelectedBlock.id, (b) => ({ ...(b as ImageBlock), fit: e.target.value as any } as BuilderBlock))}
                                        className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-violet-400/50"
                                      >
                                        <option value="contain">Contain</option>
                                        <option value="cover">Cover</option>
                                      </select>
                                    </div>
                                    <div>
                                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Height (px)</p>
                                      <Input
                                        type="number"
                                        min={80}
                                        max={520}
                                        value={(builderSelectedBlock as ImageBlock).height}
                                        onChange={(e) => builderUpdateBlockById(builderSelectedBlock.id, (b) => ({ ...(b as ImageBlock), height: Number(e.target.value || 180) } as BuilderBlock))}
                                        className="mt-2 h-11 rounded-2xl border-slate-200 bg-white shadow-sm"
                                      />
                                    </div>
                                  </div>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    id={`bld-img-${builderSelectedBlock.id}`}
                                    onChange={async (e) => {
                                      const file = e.target.files?.[0] || null;
                                      if (!file) return;
                                      try {
                                        const dataUrl = await new Promise<string>((resolve, reject) => {
                                          const r = new FileReader();
                                          r.onload = () => resolve(String(r.result || ''));
                                          r.onerror = () => reject(new Error('Unable to read image.'));
                                          r.readAsDataURL(file);
                                        });
                                        builderUpdateBlockById(builderSelectedBlock.id, (b) => ({ ...(b as ImageBlock), srcDataUrl: dataUrl } as BuilderBlock));
                                      } catch {
                                        // ignore
                                      } finally {
                                        e.target.value = '';
                                      }
                                    }}
                                  />
                                  <label
                                    htmlFor={`bld-img-${builderSelectedBlock.id}`}
                                    className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50"
                                  >
                                    Upload image
                                  </label>
                                </div>
                              ) : null}
                              </div>
                            ) : null}

                            {builderInspectorTab === 'condition' ? (
                              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                                <p className="text-sm font-semibold text-slate-950">Condition</p>
                                <p className="mt-1 text-sm text-slate-600">Show this block only when a field is present or matches a value.</p>
                              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm sm:col-span-2">
                                  <input
                                    type="checkbox"
                                    checked={builderSelectedBlock.condition.enabled}
                                    onChange={(e) => builderUpdateBlockById(builderSelectedBlock.id, (b) => ({ ...b, condition: { ...b.condition, enabled: e.target.checked } }))}
                                  />
                                  Enable condition
                                </label>
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Field</p>
                                  <select
                                    value={builderSelectedBlock.condition.fieldName}
                                    onChange={(e) => builderUpdateBlockById(builderSelectedBlock.id, (b) => ({ ...b, condition: { ...b.condition, fieldName: e.target.value } }))}
                                    className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-violet-400/50"
                                  >
                                    {builderFieldOptions.map((opt) => (
                                      <option key={`cond-${opt.name}`} value={opt.name}>{opt.label}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Mode</p>
                                  <select
                                    value={builderSelectedBlock.condition.mode}
                                    onChange={(e) => builderUpdateBlockById(builderSelectedBlock.id, (b) => ({ ...b, condition: { ...b.condition, mode: e.target.value as any } }))}
                                    className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-violet-400/50"
                                  >
                                    <option value="present">Present</option>
                                    <option value="equals">Equals</option>
                                  </select>
                                </div>
                                {builderSelectedBlock.condition.mode === 'equals' ? (
                                  <div className="sm:col-span-2">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Equals value</p>
                                    <Input
                                      value={builderSelectedBlock.condition.equalsValue}
                                      onChange={(e) => builderUpdateBlockById(builderSelectedBlock.id, (b) => ({ ...b, condition: { ...b.condition, equalsValue: e.target.value } }))}
                                      className="mt-2 h-11 rounded-2xl border-slate-200 bg-white shadow-sm"
                                    />
                                  </div>
                                ) : null}
                              </div>
                              </div>
                            ) : null}

                            {builderInspectorTab === 'style' ? (
                              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                                <p className="text-sm font-semibold text-slate-950">Style</p>
                                <p className="mt-1 text-sm text-slate-600">Quick styling controls for this block.</p>
                              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Alignment</p>
                                  <select
                                    value={builderSelectedBlock.style.align}
                                    onChange={(e) => builderUpdateBlockById(builderSelectedBlock.id, (b) => ({ ...b, style: { ...b.style, align: e.target.value as any } }))}
                                    className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-violet-400/50"
                                  >
                                    <option value="left">Left</option>
                                    <option value="center">Center</option>
                                    <option value="right">Right</option>
                                  </select>
                                </div>
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Font size</p>
                                  <Input
                                    type="number"
                                    min={10}
                                    max={44}
                                    value={builderSelectedBlock.style.fontSize}
                                    onChange={(e) => builderUpdateBlockById(builderSelectedBlock.id, (b) => ({ ...b, style: { ...b.style, fontSize: Number(e.target.value || 14) } }))}
                                    className="mt-2 h-11 rounded-2xl border-slate-200 bg-white shadow-sm"
                                  />
                                </div>
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Weight</p>
                                  <select
                                    value={builderSelectedBlock.style.fontWeight}
                                    onChange={(e) => builderUpdateBlockById(builderSelectedBlock.id, (b) => ({ ...b, style: { ...b.style, fontWeight: Number(e.target.value) as any } }))}
                                    className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-violet-400/50"
                                  >
                                    <option value={400}>400</option>
                                    <option value={500}>500</option>
                                    <option value={600}>600</option>
                                    <option value={700}>700</option>
                                  </select>
                                </div>
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Padding</p>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={48}
                                    value={builderSelectedBlock.style.padding}
                                    onChange={(e) => builderUpdateBlockById(builderSelectedBlock.id, (b) => ({ ...b, style: { ...b.style, padding: Number(e.target.value || 0) } }))}
                                    className="mt-2 h-11 rounded-2xl border-slate-200 bg-white shadow-sm"
                                  />
                                </div>
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Radius</p>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={32}
                                    value={builderSelectedBlock.style.radius}
                                    onChange={(e) => builderUpdateBlockById(builderSelectedBlock.id, (b) => ({ ...b, style: { ...b.style, radius: Number(e.target.value || 0) } }))}
                                    className="mt-2 h-11 rounded-2xl border-slate-200 bg-white shadow-sm"
                                  />
                                </div>
                                <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                                  <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
                                    <input
                                      type="checkbox"
                                      checked={builderSelectedBlock.style.border}
                                      onChange={(e) => builderUpdateBlockById(builderSelectedBlock.id, (b) => ({ ...b, style: { ...b.style, border: e.target.checked } }))}
                                    />
                                    Border
                                  </label>
                                  {builderSelectedBlock.style.border ? (
                                    <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
                                      <span className="text-xs font-semibold text-slate-500">Line</span>
                                      <input
                                        type="color"
                                        value={String(builderSelectedBlock.style.borderColor || '#94a3b8')}
                                        onChange={(e) => builderUpdateBlockById(builderSelectedBlock.id, (b) => ({ ...b, style: { ...b.style, borderColor: e.target.value } }))}
                                        className="h-6 w-10 cursor-pointer rounded"
                                        aria-label="Border color"
                                      />
                                    </label>
                                  ) : null}
                                  <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
                                    <span className="text-xs font-semibold text-slate-500">Text</span>
                                    <input
                                      type="color"
                                      value={String(builderSelectedBlock.style.textColor || '#0b1220')}
                                      onChange={(e) => builderUpdateBlockById(builderSelectedBlock.id, (b) => ({ ...b, style: { ...b.style, textColor: e.target.value } }))}
                                      className="h-6 w-10 cursor-pointer rounded"
                                      aria-label="Text color"
                                    />
                                  </label>
                                  <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
                                    <span className="text-xs font-semibold text-slate-500">BG</span>
                                    <button
                                      type="button"
                                      className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                                      onClick={() => builderUpdateBlockById(builderSelectedBlock.id, (b) => ({ ...b, style: { ...b.style, background: 'transparent' } }))}
                                      aria-label="Set background transparent"
                                      title="Transparent"
                                    >
                                      None
                                    </button>
                                    <input
                                      type="color"
                                      value={String(builderSelectedBlock.style.background && builderSelectedBlock.style.background !== 'transparent' ? builderSelectedBlock.style.background : '#ffffff')}
                                      onChange={(e) => builderUpdateBlockById(builderSelectedBlock.id, (b) => ({ ...b, style: { ...b.style, background: e.target.value } }))}
                                      className="h-6 w-10 cursor-pointer rounded"
                                      aria-label="Background color"
                                    />
                                  </label>
                                </div>
                              </div>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-4 text-xs text-slate-600 shadow-sm">
                    Tip: If you ever want full manual control, open the <span className="font-semibold text-slate-950">Template</span> step. The builder always keeps your HTML and variables clean.
                  </div>
                </div>
              </TabsContent>

		            <TabsContent value="template" className="mt-5 space-y-4">
		              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
	                <div className="flex flex-wrap items-start justify-between gap-3">
	                  <div className="min-w-0">
	                    <p className="text-sm font-semibold text-slate-950">AI styler</p>
                    <p className="mt-1 text-sm text-slate-600">Give a short instruction and let AI style your HTML + CSS without breaking variables.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 rounded-full border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
                      disabled={stylerBusy}
                      onClick={() => void applyAiStyler('Make this a premium invoice layout with clean spacing, subtle borders, and modern typography. Keep it print-ready and professional.')}
                    >
                      Invoice style
                    </Button>
                    <Button
                      type="button"
                      className="h-10 rounded-full bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-900"
                      disabled={stylerBusy}
                      onClick={() => void applyAiStyler()}
                    >
                      {stylerBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      Apply
                    </Button>
                  </div>
                </div>
                <div className="mt-3">
                  <Input
                    value={stylerPrompt}
                    onChange={(e) => setStylerPrompt(e.target.value)}
                    placeholder="Example: Make this a clean legal agreement layout with a classic serif heading and tight spacing."
                    className="h-11 rounded-2xl border-slate-200 bg-white shadow-sm focus-visible:ring-violet-400/50"
                  />
                </div>
	              </div>

		              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
		                <div className="flex flex-wrap items-center justify-between gap-3">
		                  <div>
	                    <p className="text-sm font-semibold text-slate-950">HTML + CSS</p>
                    <p className="mt-1 text-sm text-slate-600">Paste full template HTML. Put CSS inside a <span className="font-mono text-xs">&lt;style&gt;</span> block.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">
                      <input
                        type="checkbox"
                        checked={autoSyncFields}
                        onChange={(e) => setAutoSyncFields(e.target.checked)}
                      />
                      Auto fields
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 rounded-full border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
                      onClick={() => {
                        setLastDetected(detectedPlaceholders);
                        syncFieldsFromDetected(detectedPlaceholders);
                      }}
                      disabled={!detectedPlaceholders.length}
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      Sync fields
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                      {detectedPlaceholders.length ? `${detectedPlaceholders.length} variables found` : 'No variables found'}
                    </span>
                    {detectedPlaceholders.slice(0, 10).map((key) => (
                      <button
                        key={`det-${key}`}
                        type="button"
                        onClick={() => insertPlaceholderIntoTemplate(key)}
                        className="rounded-full border border-white/70 bg-white/75 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-white"
                        title="Insert into editor"
                      >
                        {`{{${key}}}`}
                      </button>
                    ))}
                    {detectedPlaceholders.length > 10 ? (
                      <span className="text-xs font-semibold text-slate-500">+{detectedPlaceholders.length - 10} more</span>
                    ) : null}
                  </div>

                  <Textarea
                    ref={templateEditorRef}
                    value={templateSource}
                    onChange={(e) => {
                      const next = e.target.value;
                      setTemplateSource(next);
                      syncDraftFromSource(next);
                    }}
                    placeholder={`<style>\n/* optional css */\n</style>\n\n<div class=\"tpl-body\">\n  <h1>{{title}}</h1>\n  <p>{{summary}}</p>\n</div>`}
                    className="min-h-[340px] rounded-[1.25rem] border-white/70 bg-white/85 font-mono text-xs leading-5"
                  />

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-[1.1rem] border border-white/70 bg-white/65 px-4 py-3 text-xs text-slate-600">
                    <span>
                      Tip: variables must be in <span className="font-mono font-semibold">{'{{doubleBraces}}'}</span> format.
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-full bg-white/70"
                        onClick={() => {
                          const starter = [
                            '<style>',
                            '/* optional css */',
                            '</style>',
                            '',
                            '<div class="tpl-body">',
                            '  <h1 class="tpl-title">{{title}}</h1>',
                            '  <p class="tpl-desc">{{summary}}</p>',
                            '</div>',
                          ].join('\n');
                          setTemplateSource(starter);
                          syncDraftFromSource(starter);
                        }}
                      >
                        Insert scaffold
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-full bg-white/70"
                        onClick={() => {
                          setTemplateSource('');
                          syncDraftFromSource('');
                        }}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>

                  {lastDetected.length && detectedPlaceholders.length !== lastDetected.length ? (
                    <div className="rounded-[1.1rem] border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-900">
                      Variables changed. Click <span className="font-semibold">Sync fields</span> if you want to refresh the entry form.
                    </div>
                  ) : null}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="fields" className="mt-5 space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-950">Live preview data</p>
                    <p className="mt-1 text-xs font-medium text-slate-600">Type values here to see the preview update instantly.</p>
                  </div>
                </div>

                {draft.fields.length ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {draft.fields.slice(0, 8).map((field) => (
                      <label key={`pv-${field.id}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                        <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{field.label || field.name}</span>
                        <Input
                          value={String(previewOverrides[field.name] ?? '')}
                          onChange={(e) => setPreviewOverrides((c) => ({ ...c, [field.name]: e.target.value }))}
                          placeholder={`{{${field.name}}}`}
                          className="mt-2 h-11 rounded-2xl border-slate-200 bg-white shadow-sm focus-visible:ring-violet-400/50"
                        />
                      </label>
                    ))}
                    {draft.fields.length > 8 ? (
                      <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-600">
                        Showing 8 fields. Use the list below to edit fields, or add more preview values later.
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    No fields yet. Import a document or add your first field.
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-950">Fields</p>
                <Button type="button" variant="outline" className="h-10 rounded-full border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50" onClick={addField}>
                  + Add
                </Button>
              </div>

              <div className="grid gap-3">
                {draft.fields.length ? draft.fields.map((field) => (
                  <div key={field.id} className="rounded-[1.2rem] border border-white/70 bg-white/75 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Label</p>
                        <Input
                          value={field.label}
                          onChange={(e) => {
                            const label = e.target.value;
                            setDraft((current) => ({
                              ...current,
                              fields: normalizeFieldOrders(current.fields.map((f) => f.id === field.id ? { ...f, label } : f)),
                            }));
                          }}
                          className="mt-2 h-11 rounded-2xl border-white/70 bg-white/85"
                        />
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Key</p>
                        <Input
                          value={field.name}
                          onChange={(e) => {
                            const name = e.target.value;
                            setDraft((current) => ({
                              ...current,
                              fields: normalizeFieldOrders(current.fields.map((f) => f.id === field.id ? { ...f, name } : f)),
                            }));
                          }}
                          className="mt-2 h-11 rounded-2xl border-white/70 bg-white/85 font-mono text-xs"
                        />
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 sm:items-end">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Type</p>
                        <select
                          value={field.type}
                          onChange={(e) => {
                            const type = e.target.value as DocumentField['type'];
                            setDraft((current) => ({
                              ...current,
                              fields: normalizeFieldOrders(current.fields.map((f) => f.id === field.id ? { ...f, type } : f)),
                            }));
                          }}
                          className="mt-2 h-11 w-full rounded-2xl border border-white/70 bg-white/85 px-3 text-sm font-semibold text-slate-900"
                        >
                          {FIELD_TYPES.map((t) => (
                            <option key={`${field.id}-type-${t}`} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                          <input
                            type="checkbox"
                            checked={Boolean(field.required)}
                            onChange={(e) => {
                              const required = e.target.checked;
                              setDraft((current) => ({
                                ...current,
                                fields: normalizeFieldOrders(current.fields.map((f) => f.id === field.id ? { ...f, required } : f)),
                              }));
                            }}
                          />
                          Required
                        </label>
                        <div className="flex items-center gap-2">
                          <Button type="button" size="sm" variant="outline" className="rounded-full bg-white/70" onClick={() => insertPlaceholderIntoTemplate(field.name)}>
                            Insert
                          </Button>
                          <Button type="button" size="sm" variant="outline" className="rounded-full bg-white/70" onClick={() => removeField(field.id)}>
                            Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-[1.2rem] border border-dashed border-white/70 bg-white/70 p-4 text-sm text-slate-600">
                    Blank template. Add fields to start.
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="marketplace" className="mt-5 space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-950">Template Marketplace</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Publish this template so others can purchase and install it into their workspace.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 rounded-full border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
                      disabled={fillBusy}
                      onClick={() => void generateAiExampleData()}
                    >
                      {fillBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      AI fill example
                    </Button>
                  </div>
                </div>

                {fillNote ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    {fillNote}
                  </div>
                ) : null}
                <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/60 px-4 py-3 text-sm text-slate-700">
                  Marketplace preview uses an <span className="font-semibold text-violet-700">EXAMPLE</span> watermark and your generated example values.
                </div>

                <label className="mt-4 flex items-center justify-between gap-3 rounded-[1.1rem] border border-white/70 bg-white/80 px-4 py-3 text-sm font-semibold text-slate-800">
                  <span className="min-w-0">
                    <span className="block">Enable marketplace publish</span>
                    <span className="mt-1 block text-xs font-medium text-slate-600">
                      Publishing count is limited by your plan.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={marketplaceDraft.publishEnabled}
                    onChange={(e) => setMarketplaceDraft((c) => ({ ...c, publishEnabled: e.target.checked }))}
                  />
                </label>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="rounded-[1.1rem] border border-white/70 bg-white/80 px-4 py-3">
                    <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Price (INR)</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={marketplaceDraft.priceInr}
                      onChange={(e) => setMarketplaceDraft((c) => ({ ...c, priceInr: Number(e.target.value || 0) }))}
                      className="mt-2 h-10 w-full rounded-full border border-white/70 bg-white/70 px-4 text-sm font-semibold text-slate-900 outline-none"
                    />
                  </label>
                  <label className="rounded-[1.1rem] border border-white/70 bg-white/80 px-4 py-3">
                    <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Tags</span>
                    <input
                      value={marketplaceDraft.tags}
                      onChange={(e) => setMarketplaceDraft((c) => ({ ...c, tags: e.target.value }))}
                      placeholder="HR, Legal, Invoice, Offer letter"
                      className="mt-2 h-10 w-full rounded-full border border-white/70 bg-white/70 px-4 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-500"
                    />
                  </label>
                </div>

                <div className="mt-4 rounded-[1.1rem] border border-white/70 bg-white/80 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Cover image</p>
                      <p className="mt-1 text-xs text-slate-600">Optional. Helps this template stand out.</p>
                    </div>
                    <input
                      ref={marketplaceCoverInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (event) => {
                        const file = event.target.files?.[0] || null;
                        if (!file) return;
                        try {
                          if (!file.type.startsWith('image/')) throw new Error('Upload an image file.');
                          if (file.size > 900_000) throw new Error('Cover is too large. Keep it under 900KB.');
                          const dataUrl = await new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(String(reader.result || ''));
                            reader.onerror = () => reject(new Error('Unable to read image.'));
                            reader.readAsDataURL(file);
                          });
                          setMarketplaceDraft((c) => ({ ...c, coverImageDataUrl: dataUrl }));
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Unable to load cover image.');
                        } finally {
                          event.target.value = '';
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full bg-white/70"
                      onClick={() => marketplaceCoverInputRef.current?.click()}
                    >
                      <ImagePlus className="mr-2 h-4 w-4" />
                      Upload
                    </Button>
                  </div>
                  {marketplaceDraft.coverImageDataUrl ? (
                    <div className="mt-3 overflow-hidden rounded-[1rem] border border-white/70 bg-white/60">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={marketplaceDraft.coverImageDataUrl} alt="Template cover" className="h-40 w-full object-cover" />
                      <div className="flex items-center justify-between gap-3 px-4 py-3">
                        <p className="text-xs text-slate-600">Cover ready.</p>
                        <button
                          type="button"
                          className="rounded-full border border-white/80 bg-white/70 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-white"
                          onClick={() => setMarketplaceDraft((c) => ({ ...c, coverImageDataUrl: '' }))}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 rounded-[1.1rem] border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
                  Save will publish if enabled. If publish fails, your template is still saved privately.
                </div>
              </div>
            </TabsContent>

            <TabsContent value="settings" className="mt-5 space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-950">Page</p>
                <p className="mt-1 text-sm text-slate-600">Control paper size, margins, and page numbering for exports.</p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Size</p>
                    <select
                      value={page.size}
                      onChange={(e) => {
                        const size = e.target.value as PageSize;
                        setPage((c) => {
                          if (size === 'Letter') return { ...c, size, widthMm: 215.9, heightMm: 279.4 };
                          if (size === 'Legal') return { ...c, size, widthMm: 215.9, heightMm: 355.6 };
                          if (size === 'A4') return { ...c, size, widthMm: 210, heightMm: 297 };
                          return { ...c, size };
                        });
                      }}
                      className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-violet-400/50"
                    >
                      <option value="A4">A4</option>
                      <option value="Letter">Letter</option>
                      <option value="Legal">Legal</option>
                      <option value="Custom">Custom</option>
                    </select>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Margins (mm)</p>
                    <Input
                      type="number"
                      min={0}
                      max={40}
                      value={page.marginMm}
                      onChange={(e) => setPage((c) => ({ ...c, marginMm: Number(e.target.value || 0) }))}
                      className="mt-2 h-11 rounded-2xl border-slate-200 bg-white shadow-sm focus-visible:ring-violet-400/50"
                    />
                  </div>
                  {page.size === 'Custom' ? (
                    <>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Width (mm)</p>
                        <Input
                          type="number"
                          min={120}
                          max={420}
                          value={page.widthMm}
                          onChange={(e) => setPage((c) => ({ ...c, widthMm: Number(e.target.value || 210) }))}
                          className="mt-2 h-11 rounded-2xl border-slate-200 bg-white shadow-sm focus-visible:ring-violet-400/50"
                        />
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Height (mm)</p>
                        <Input
                          type="number"
                          min={120}
                          max={600}
                          value={page.heightMm}
                          onChange={(e) => setPage((c) => ({ ...c, heightMm: Number(e.target.value || 297) }))}
                          className="mt-2 h-11 rounded-2xl border-slate-200 bg-white shadow-sm focus-visible:ring-violet-400/50"
                        />
                      </div>
                    </>
                  ) : null}
                  <label className="sm:col-span-2 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-950">Auto page numbers</span>
                      <span className="mt-0.5 block text-xs font-medium text-slate-600">Adds “Page X of Y” in the footer.</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={page.pageNumbersEnabled}
                      onChange={(e) => setPage((c) => ({ ...c, pageNumbersEnabled: e.target.checked }))}
                      className="h-5 w-5 accent-violet-600"
                      aria-label="Enable page numbers"
                    />
                  </label>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {error ? (
            <div className="mt-4 rounded-[1.1rem] border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-800">
              {error}
            </div>
          ) : null}
        </div>

        <div className={`min-w-0 overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 shadow-[0_10px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl ${mobilePane === 'preview' ? '' : 'hidden'} lg:block`}>
          <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 bg-white/70 px-5 py-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-[-0.02em] text-slate-950">Live preview</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center rounded-full border border-slate-200 bg-white p-1 shadow-sm">
                <button
                  type="button"
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 ${
                    previewDevice === 'desktop' ? 'bg-violet-600 text-white' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  onClick={() => setPreviewDevice('desktop')}
                  aria-label="Desktop preview"
                  title="Desktop"
                >
                  <Monitor className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 ${
                    previewDevice === 'mobile' ? 'bg-violet-600 text-white' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  onClick={() => setPreviewDevice('mobile')}
                  aria-label="Mobile preview"
                  title="Mobile"
                >
                  <Smartphone className="h-4 w-4" />
                </button>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-full border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
                onClick={() => setPreviewFullscreenOpen(true)}
              >
                <Maximize2 className="mr-2 h-4 w-4 text-slate-700" />
                Full screen
              </Button>
            </div>
          </div>

          <div className="flex h-full min-h-0 w-full items-center justify-center bg-[#f7f8fc] p-5">
            <div className={`h-full w-full ${previewDevice === 'mobile' ? 'max-w-[420px]' : ''}`}>
              <div className="h-full w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                {!combinedTemplateHtml.trim() ? (
                  <div className="flex h-full w-full flex-col items-center justify-center px-6 py-10 text-center">
                    <div className="flex h-20 w-20 items-center justify-center rounded-[1.7rem] bg-violet-50">
                      <LayoutTemplate className="h-10 w-10 text-violet-400" />
                    </div>
                    <p className="mt-6 text-lg font-semibold tracking-[-0.02em] text-slate-950">
                      Your template preview will appear here
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-600">
                      Import a document and start adding fields
                    </p>
                    <div className="mt-8 text-violet-400/80" aria-hidden="true">
                      <svg width="96" height="40" viewBox="0 0 96 40" fill="none">
                        <path d="M90 10c-30 0-40 20-68 20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                        <path d="M26 14l-8 16 18-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                ) : (
                  <iframe ref={previewFrameRef} title="Template preview" srcDoc={previewHtml} className="h-full w-full bg-white" />
                )}
              </div>
            </div>
          </div>
        </div>

      </div>

      <Dialog open={previewFullscreenOpen} onOpenChange={setPreviewFullscreenOpen}>
        <DialogContent className="flex h-[calc(100vh-1rem)] w-[calc(100vw-1rem)] max-w-none flex-col overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white p-0 shadow-[0_22px_70px_rgba(15,23,42,0.14)] sm:rounded-[2rem]">
          <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
            <p className="truncate text-sm font-semibold tracking-[-0.02em] text-slate-950">Preview</p>
            <Button type="button" variant="outline" className="rounded-full border-slate-200 bg-white shadow-sm hover:bg-slate-50" onClick={() => setPreviewFullscreenOpen(false)}>
              Close
            </Button>
          </div>
          <div className="flex-1 min-h-0 bg-[#f7f8fc] p-4 sm:p-5">
            <div className="h-full w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <iframe title="Template preview fullscreen" srcDoc={previewHtml} className="h-full w-full bg-white" />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
