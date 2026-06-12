'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BadgeCheck,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  PencilLine,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Wand2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { UploadedDocument } from '@/types/doc-assistant';

type FileKind = 'pdf' | 'spreadsheet' | 'image' | 'text' | 'unknown';
type ExportProfile = 'standard' | 'compact';

function guessFileKind(input: { name: string; mimeType?: string }) : FileKind {
  const name = (input.name || '').toLowerCase();
  const mime = (input.mimeType || '').toLowerCase();
  if (mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|tiff?)$/.test(name)) return 'image';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (mime.includes('spreadsheet') || /\.(csv|xlsx?|ods)$/.test(name)) return 'spreadsheet';
  if (
    mime.startsWith('text/')
    || /\.(txt|md|html?|rtf|json|xml|yaml|yml|csv)$/.test(name)
    || /\.(docx?|docm|odt)$/.test(name)
  ) return 'text';
  return 'unknown';
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildHtmlFromPlainText(value: string) {
  const paragraphs = value
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br/>')}</p>`)
    .join('');

  return `<div class="docword-export-page-flow"><div class="docword-export-body">${paragraphs || '<p></p>'}</div></div>`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function QuickFileEditorDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: UploadedDocument | null;
  isAuthenticated?: boolean;
}) {
  const { open, onOpenChange, document: uploadedDocument, isAuthenticated = false } = props;
  const router = useRouter();
  const kind = useMemo(() => (uploadedDocument ? guessFileKind({ name: uploadedDocument.name, mimeType: uploadedDocument.mimeType }) : 'unknown'), [uploadedDocument]);
  const [title, setTitle] = useState('');
  const [html, setHtml] = useState('');
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [exporting, setExporting] = useState<null | 'pdf' | 'docx'>(null);
  const [exportProfile, setExportProfile] = useState<ExportProfile>('standard');
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [toolBusy, setToolBusy] = useState<null | 'sign'> (null);

  useEffect(() => {
    if (!open) return;
    if (!uploadedDocument) return;
    setTitle(uploadedDocument.name.replace(/\.[a-z0-9]+$/i, '') || 'Untitled');
    const initialText = (uploadedDocument.extractedText || '').trim();
    setHtml(buildHtmlFromPlainText(initialText || `Imported from ${uploadedDocument.name}`));
    // Keep editor DOM in sync on open.
    requestAnimationFrame(() => {
      if (editorRef.current) editorRef.current.innerHTML = buildHtmlFromPlainText(initialText || `Imported from ${uploadedDocument.name}`);
    });
  }, [uploadedDocument, open]);

  const applyCommand = (command: string, value?: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    try {
      window.document.execCommand(command, false, value);
      setHtml(editorRef.current.innerHTML);
    } catch {
      // ignore
    }
  };

  const syncHtml = () => {
    if (!editorRef.current) return;
    setHtml(editorRef.current.innerHTML);
  };

  const resetToExtracted = () => {
    if (!uploadedDocument || !editorRef.current) return;
    const initialText = (uploadedDocument.extractedText || '').trim();
    const next = buildHtmlFromPlainText(initialText || `Imported from ${uploadedDocument.name}`);
    editorRef.current.innerHTML = next;
    setHtml(next);
  };

  const exportViaDocWord = async (mode: 'pdf' | 'docx') => {
    if (!uploadedDocument) return;
    setExporting(mode);
    try {
      const response = await fetch(`/api/docword/export/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || uploadedDocument.name.replace(/\.[a-z0-9]+$/i, '') || 'Document',
          html: html || '<p></p>',
          documentTheme: 'classic',
          exportProfile,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || `Failed to export ${mode.toUpperCase()}.`);
      }
      const blob = await response.blob();
      downloadBlob(blob, `${(title.trim() || 'document').replace(/\s+/g, '_')}.${mode}`);
    } finally {
      setExporting(null);
    }
  };

  const stripToText = (value: string) => {
    try {
      const div = window.document.createElement('div');
      div.innerHTML = value;
      return (div.textContent || '').trim();
    } catch {
      return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  };

  const buildSingleBlock = (blockHtml: string) => {
    const text = stripToText(blockHtml);
    return [{
      id: crypto.randomUUID(),
      type: 'paragraph' as const,
      html: blockHtml,
      text,
    }];
  };

  const sendForESign = async () => {
    if (!uploadedDocument) return;
    if (!isAuthenticated) return;
    setToolBusy('sign');
    try {
      const createResponse = await fetch('/api/docword/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || uploadedDocument.name.replace(/\.[a-z0-9]+$/i, '') || 'Signing draft',
          folderName: 'Signing',
          emoji: '✍️',
        }),
      });
      const created = await createResponse.json().catch(() => null) as { document?: { id: string }; error?: string } | null;
      if (!createResponse.ok || !created?.document?.id) {
        throw new Error(created?.error || 'Failed to create a signing draft.');
      }

      const plainText = editorRef.current?.innerText?.trim() || stripToText(html) || uploadedDocument.extractedText || '';
      const patchResponse = await fetch(`/api/docword/documents/${encodeURIComponent(created.document.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || uploadedDocument.name.replace(/\.[a-z0-9]+$/i, '') || 'Signing draft',
          blocks: buildSingleBlock(html || buildHtmlFromPlainText(plainText)),
          html,
          plainText,
          requireSignature: true,
          saveSource: 'manual',
        }),
      });
      const patched = await patchResponse.json().catch(() => null) as { document?: { id: string }; error?: string } | null;
      if (!patchResponse.ok || !patched?.document?.id) {
        throw new Error(patched?.error || 'Failed to prepare signing draft.');
      }

      const signResponse = await fetch('/api/docword/send-to-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: patched.document.id,
          watermarkEnabled: true,
          watermarkText: 'Confidential',
          recipientSignatureRequired: true,
        }),
      });
      const signed = await signResponse.json().catch(() => null) as { historyEntry?: { id: string }; error?: string } | null;
      if (!signResponse.ok) {
        throw new Error(signed?.error || 'Failed to prepare signing handoff.');
      }

      const historyId = signed?.historyEntry?.id;
      onOpenChange(false);
      router.push(historyId ? `/workspace?tab=generate&historyId=${encodeURIComponent(historyId)}` : '/workspace?tab=generate');
    } finally {
      setToolBusy(null);
    }
  };

  const exportPlain = (mode: 'txt' | 'html') => {
    if (!uploadedDocument) return;
    if (mode === 'html') {
      downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${(title.trim() || 'document').replace(/\s+/g, '_')}.html`);
      return;
    }
    const text = editorRef.current?.innerText || uploadedDocument.extractedText || '';
    downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${(title.trim() || 'document').replace(/\s+/g, '_')}.txt`);
  };

  const headerIcon = kind === 'pdf'
    ? Wand2
    : kind === 'spreadsheet'
      ? FileSpreadsheet
      : kind === 'image'
        ? ImageIcon
        : FileText;
  const HeaderIcon = headerIcon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl sm:h-[90vh] h-[95vh] w-[calc(100vw-1rem)] sm:w-full overflow-hidden p-0 border border-slate-200/60 bg-white/70 shadow-3xl backdrop-blur-3xl dark:border-white/10 dark:bg-black/60 rounded-[32px]">
        <DialogHeader className="p-0">
          <DialogTitle className="flex items-center gap-4 px-6 py-5 border-b border-slate-200/50 bg-slate-50/50 dark:border-white/10 dark:bg-white/5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-xl dark:bg-white dark:text-slate-950">
              <HeaderIcon className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-bold text-slate-950 dark:text-white">Precision Editor</div>
              <div className="truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400 tracking-tight">Refining {uploadedDocument?.name || 'Document Intelligence'}</div>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                <SlidersHorizontal className="h-3 w-3" />
                {kind.toUpperCase()} MODE
              </span>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="group flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-400 shadow-sm ring-1 ring-slate-200 transition-all hover:bg-slate-50 hover:text-slate-900 active:scale-95 dark:bg-white/5 dark:text-slate-500 dark:ring-white/10 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <X className="h-5 w-5 transition-transform group-hover:rotate-90" />
            </button>
          </DialogTitle>
        </DialogHeader>

        {!uploadedDocument ? (
          <div className="p-4 text-sm text-slate-600">Upload a file to start editing.</div>
        ) : (
          <div className="flex h-[calc(92vh-74px)] sm:h-[calc(86vh-74px)] min-h-0 flex-col">
            <div className="px-4 py-3 border-b border-slate-200 bg-white/70 backdrop-blur-xl">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 sm:w-[360px]" placeholder="Document name" />
                  <Select value={exportProfile} onValueChange={(value) => setExportProfile(value as ExportProfile)}>
                    <SelectTrigger className="h-9 w-[150px]">
                      <SelectValue placeholder="Profile" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="compact">Compact</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => exportPlain('txt')}>
                    <Download className="mr-2 h-4 w-4" />
                    TXT
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => exportPlain('html')}>
                    <Download className="mr-2 h-4 w-4" />
                    HTML
                  </Button>
                  <Button type="button" size="sm" onClick={() => void exportViaDocWord('docx')} disabled={exporting !== null}>
                    <Download className="mr-2 h-4 w-4" />
                    {exporting === 'docx' ? 'Exporting…' : 'DOCX'}
                  </Button>
                  <Button type="button" size="sm" onClick={() => void exportViaDocWord('pdf')} disabled={exporting !== null}>
                    <Download className="mr-2 h-4 w-4" />
                    {exporting === 'pdf' ? 'Exporting…' : 'PDF'}
                  </Button>
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Profile: <span className="font-semibold">{exportProfile === 'compact' ? 'Compact (smaller exports)' : 'Standard'}</span>
              </div>
            </div>

            <Tabs defaultValue="edit" className="flex min-h-0 flex-1 flex-col bg-slate-50/30 dark:bg-transparent">
              <div className="px-6 pt-4">
                <TabsList className="grid w-full grid-cols-3 h-12 bg-slate-100/50 p-1.5 dark:bg-white/5 rounded-2xl">
                  <TabsTrigger value="edit" className="rounded-xl gap-2 font-bold text-xs uppercase tracking-widest"><PencilLine className="h-4 w-4" />Workspace</TabsTrigger>
                  <TabsTrigger value="tools" className="rounded-xl gap-2 font-bold text-xs uppercase tracking-widest"><ShieldCheck className="h-4 w-4" />Optimizer</TabsTrigger>
                  <TabsTrigger value="open" className="rounded-xl gap-2 font-bold text-xs uppercase tracking-widest"><ExternalLink className="h-4 w-4" />Global View</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="open" className="space-y-3">
                <div className="mx-4 mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  {kind === 'spreadsheet' ? (
                    <div className="space-y-3">
                      <div className="font-semibold">Spreadsheet detected</div>
                      <div>Open this file in DocSheet for grid editing, formulas, and workbook exports.</div>
                      <Button asChild className="w-full sm:w-auto">
                        <Link href="/docsheet">
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Open in DocSheet
                        </Link>
                      </Button>
                    </div>
                  ) : kind === 'pdf' ? (
                    <div className="space-y-3">
                      <div className="font-semibold">PDF detected</div>
                      <div>For page-level edits (merge, split, redact, etc.), open the PDF Editor. For quick text adjustments, use the Edit tab.</div>
                      <Button asChild className="w-full sm:w-auto">
                        <Link href="/pdf-editor">
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Open in PDF Editor
                        </Link>
                      </Button>
                    </div>
                  ) : kind === 'image' ? (
                    <div className="space-y-3">
                      <div className="font-semibold">Image detected</div>
                      <div>This quick editor currently exports text-based formats. Open the dedicated tools for image edits.</div>
                      <Button asChild className="w-full sm:w-auto" variant="outline">
                        <Link href="/daily-tools">
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Browse tools
                        </Link>
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="font-semibold">Document detected</div>
                      <div>Use the Edit tab to tweak the extracted content, then export as PDF/DOCX.</div>
                      <Button asChild className="w-full sm:w-auto" variant="outline">
                        <Link href="/docword">
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Open DocWord
                        </Link>
                      </Button>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="edit" className="space-y-3">
                <div className="mx-4 mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => applyCommand('bold')}>Bold</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => applyCommand('italic')}>Italic</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => applyCommand('underline')}>Underline</Button>
                  <div className="h-5 w-px bg-slate-200" />
                  <Button type="button" size="sm" variant="outline" onClick={() => applyCommand('formatBlock', 'h1')}>H1</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => applyCommand('formatBlock', 'h2')}>H2</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => applyCommand('insertUnorderedList')}>Bullets</Button>
                  <div className="h-5 w-px bg-slate-200" />
                  <Button type="button" size="sm" variant="outline" onClick={resetToExtracted}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Reset
                  </Button>
                </div>

                <div
                  ref={editorRef}
                  className={cn(
                    'mx-4 min-h-[300px] flex-1 min-h-0 w-[calc(100%-2rem)] rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-900 shadow-inner outline-none overflow-auto',
                    'prose max-w-none',
                  )}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={syncHtml}
                />
              </TabsContent>

              <TabsContent value="tools" className="min-h-0 flex-1">
                <div className="mx-4 mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-950">Find & replace</div>
                        <div className="text-xs text-slate-500">Quick cleanup before export</div>
                      </div>
                      <Search className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="mt-3 grid gap-2">
                      <Input value={findQuery} onChange={(e) => setFindQuery(e.target.value)} className="h-9" placeholder="Find…" />
                      <Input value={replaceQuery} onChange={(e) => setReplaceQuery(e.target.value)} className="h-9" placeholder="Replace with…" />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!findQuery.trim()}
                          onClick={() => {
                            if (!editorRef.current) return;
                            const current = editorRef.current.innerText || '';
                            const next = current.split(findQuery).join(replaceQuery);
                            const nextHtml = buildHtmlFromPlainText(next);
                            editorRef.current.innerHTML = nextHtml;
                            setHtml(nextHtml);
                          }}
                        >
                          Replace all
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => { setFindQuery(''); setReplaceQuery(''); }}>
                          Clear
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-950">Convert & optimize</div>
                        <div className="text-xs text-slate-500">Export with the right extension and size</div>
                      </div>
                      <BadgeCheck className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="mt-3 space-y-2 text-sm text-slate-700">
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        Use <span className="font-semibold">Compact</span> profile to reduce exported PDF size (no heavy backgrounds).
                      </div>
                      <div className="text-xs text-slate-500">
                        Note: For scans/images/spreadsheets, this editor works on extracted text. Use the Open tab for format-accurate editing.
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-950">E-sign</div>
                        <div className="text-xs text-slate-500">Send this draft to the signing workflow</div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!isAuthenticated || toolBusy === 'sign'}
                        onClick={() => void sendForESign()}
                        title={isAuthenticated ? 'Send to e-sign' : 'Login required'}
                      >
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        {toolBusy === 'sign' ? 'Preparing…' : 'Send for e-sign'}
                      </Button>
                    </div>
                    {!isAuthenticated ? (
                      <div className="mt-2 text-xs text-slate-500">Login is required to send for e-sign.</div>
                    ) : null}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
