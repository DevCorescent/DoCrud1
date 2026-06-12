'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowLeft, Download, FileText, Loader2, RefreshCcw, Sparkles, Upload, WandSparkles } from 'lucide-react';
import { LandingSettings } from '@/types/document';
import PublicSiteChrome from '@/components/PublicSiteChrome';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ProcessProgress } from '@/components/ui/process-progress';

interface PublicPdfEditorWorkspacePageProps {
  softwareName: string;
  accentLabel: string;
  settings: LandingSettings;
}

type AssistIntent = 'polish' | 'one-pager' | 'formal' | 'simplify' | 'proofread' | 'structure' | 'summary' | 'actions';

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function buildPreviewHtml(title: string, text: string) {
  const sections = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
      const first = lines[0] || '';
      const isHeading = /^[A-Z][A-Z0-9\s/&(),.-]{2,}$/.test(first);
      const heading = isHeading ? `<h2>${first}</h2>` : '';
      const bodyLines = isHeading ? lines.slice(1) : lines;
      const body = bodyLines.map((line) => `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`).join('');
      return `<section>${heading}${body}</section>`;
    })
    .join('');

  return `
    <div style="max-width:840px;margin:0 auto;background:white;border:1px solid #e2e8f0;border-radius:24px;padding:40px;box-shadow:0 20px 60px rgba(15,23,42,0.08);">
      <h1 style="margin:0 0 24px;font-size:30px;letter-spacing:-0.03em;color:#0f172a;">${title}</h1>
      ${sections}
    </div>
  `;
}

export default function PublicPdfEditorWorkspacePage({ softwareName, accentLabel, settings }: PublicPdfEditorWorkspacePageProps) {
  const [fileName, setFileName] = useState('');
  const [title, setTitle] = useState('Editable PDF Document');
  const [summary, setSummary] = useState('Upload a PDF and convert it into an editable document.');
  const [originalText, setOriginalText] = useState('');
  const [editableText, setEditableText] = useState('');
  const [pageCount, setPageCount] = useState(0);
  const [extractedCharacters, setExtractedCharacters] = useState(0);
  const [extractionMode, setExtractionMode] = useState<'ai' | 'standard'>('standard');
  const [statusMessage, setStatusMessage] = useState('Upload a PDF to convert it into editable text.');
  const [isConverting, setIsConverting] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [aiNotes, setAiNotes] = useState<string[]>([]);
  const [activeAssistIntent, setActiveAssistIntent] = useState<AssistIntent | null>(null);

  const hasDocument = Boolean(editableText.trim());
  const previewHtml = useMemo(() => buildPreviewHtml(title, editableText), [editableText, title]);

  const stats = useMemo(
    () => [
      { label: 'Pages', value: pageCount ? String(pageCount) : '0' },
      { label: 'Characters', value: extractedCharacters ? extractedCharacters.toLocaleString() : '0' },
      { label: 'Mode', value: extractionMode === 'ai' ? 'AI cleaned' : 'OCR / text' },
      { label: 'Status', value: isConverting ? 'Converting' : isRefining ? 'AI refining' : isExporting ? 'Exporting' : 'Ready' },
    ],
    [extractedCharacters, extractionMode, isConverting, isExporting, isRefining, pageCount],
  );

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setStatusMessage('Please upload a PDF file.');
      return;
    }

    try {
      setIsConverting(true);
      setStatusMessage('Converting PDF into editable text...');
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/pdf-editor/convert', {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to convert this PDF.');
      }

      setFileName(payload.fileName || file.name);
      setTitle(payload.title || file.name.replace(/\.pdf$/i, ''));
      setSummary(payload.summary || 'Editable document prepared from your PDF.');
      setOriginalText(payload.extractedText || '');
      setEditableText(payload.editableText || payload.extractedText || '');
      setAiNotes([]);
      setPageCount(Number(payload.pageCount || 0));
      setExtractedCharacters(Number(payload.extractedCharacters || 0));
      setExtractionMode(payload.extractionMode === 'ai' ? 'ai' : 'standard');
      setStatusMessage(`${file.name} is ready to edit.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Unable to convert this PDF.');
    } finally {
      setIsConverting(false);
    }
  };

  const handleAssist = async (intent: AssistIntent) => {
    if (!editableText.trim()) {
      setStatusMessage('Upload and convert a PDF first.');
      return;
    }

    try {
      setIsRefining(true);
      setActiveAssistIntent(intent);
      setStatusMessage('Applying AI document refinement...');
      const response = await fetch('/api/pdf-editor/assist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: editableText, intent }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to refine this document.');
      }
      setEditableText(payload.refinedText || editableText);
      setAiNotes(Array.isArray(payload.bullets) ? payload.bullets : []);
      setStatusMessage(payload.summary || 'AI refinement applied.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Unable to refine this document.');
    } finally {
      setIsRefining(false);
      setActiveAssistIntent(null);
    }
  };

  const handleExportPdf = async () => {
    if (!editableText.trim()) {
      setStatusMessage('There is no editable document to export.');
      return;
    }

    try {
      setIsExporting(true);
      setStatusMessage('Exporting edited PDF...');
      const response = await fetch('/api/pdf-editor/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          text: editableText,
          fileName: fileName.replace(/\.pdf$/i, '') || 'edited-document',
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Unable to export PDF.');
      }
      const blob = await response.blob();
      downloadBlob(blob, `${(fileName || 'edited-document').replace(/\.pdf$/i, '') || 'edited-document'}-edited.pdf`);
      setStatusMessage('Edited PDF downloaded.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Unable to export PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadText = () => {
    if (!editableText.trim()) {
      setStatusMessage('There is no editable text to download.');
      return;
    }
    downloadBlob(new Blob([editableText], { type: 'text/plain;charset=utf-8' }), `${(fileName || 'editable-document').replace(/\.pdf$/i, '')}.txt`);
    setStatusMessage('Editable text downloaded.');
  };

  return (
    <PublicSiteChrome softwareName={softwareName} accentLabel={accentLabel} settings={settings}>
      <section className="space-y-4">
        <div className="flex flex-col gap-4 rounded-[1.5rem] border border-slate-200/80 bg-white/88 px-4 py-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.22em] text-white">
              <FileText className="h-3.5 w-3.5" />
              PDF to Editable Document
            </div>
            <h1 className="mt-3 text-[1.25rem] font-medium tracking-[-0.03em] text-slate-950 sm:text-[1.65rem]">Upload, edit, and export in one clean flow</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="h-10 rounded-xl border-slate-300 bg-white px-4 text-slate-950 hover:bg-slate-950 hover:text-white">
              <Link href="/pdf-editor">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
            <label className="inline-flex cursor-pointer items-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800">
              <Upload className="mr-2 h-4 w-4" />
              Upload PDF
              <input type="file" accept="application/pdf" className="hidden" onChange={(event) => void handleUpload(event.target.files?.[0] || null)} />
            </label>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((item, index) => (
            <div key={item.label} className={`${index === 0 ? 'premium-card-smoke' : index === 1 ? 'premium-card-ivory' : index === 2 ? 'premium-card-warm' : 'premium-card-rose'} rounded-[1.15rem] p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]`}>
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
              <p className="mt-2 truncate text-base font-medium tracking-[-0.02em] text-slate-950">{item.value}</p>
            </div>
          ))}
        </div>

        <ProcessProgress
          active={isConverting || isRefining || isExporting}
          profile={isExporting ? 'export' : isRefining ? 'analysis' : 'upload'}
          title={isExporting ? 'Preparing your edited PDF' : isRefining ? 'Applying AI document refinement' : 'Converting PDF into editable text'}
          floating
        />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_24rem]">
          <div className="premium-surface rounded-[1.6rem] p-4 sm:p-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="space-y-3">
                <Input value={title} onChange={(event) => setTitle(event.target.value)} className="h-11 rounded-xl border-slate-300 text-base font-medium" placeholder="Document title" />
                <Textarea value={editableText} onChange={(event) => setEditableText(event.target.value)} className="min-h-[70vh] rounded-[1.2rem] border-slate-300 bg-white text-sm leading-7 text-slate-900" placeholder="Converted document text will appear here..." />
              </div>

              <div className="rounded-[1.25rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.98))] p-3 sm:p-4">
                <div className="rounded-[1rem] border border-slate-200 bg-slate-950 px-4 py-3 text-white">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-white/65">Live preview</p>
                  <p className="mt-1 text-sm text-white/80">{summary}</p>
                </div>
                <div
                  className="mt-3 max-h-[64vh] overflow-auto rounded-[1rem] bg-slate-100 p-3"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            </div>
          </div>

          <aside className="premium-surface rounded-[1.6rem] p-4 sm:p-5">
            <div className="space-y-4">
              <div className="rounded-[1.2rem] border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-950">AI actions</p>
                  {isRefining ? <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">Working</span> : null}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  {[
                    { id: 'polish', label: 'Polish', icon: Sparkles },
                    { id: 'proofread', label: 'Proofread', icon: WandSparkles },
                    { id: 'formal', label: 'Professional', icon: Sparkles },
                    { id: 'simplify', label: 'Simplify', icon: Sparkles },
                    { id: 'structure', label: 'Restructure', icon: WandSparkles },
                    { id: 'summary', label: 'Executive view', icon: WandSparkles },
                    { id: 'actions', label: 'Action points', icon: WandSparkles },
                    { id: 'one-pager', label: 'Condense', icon: Sparkles },
                  ].map((action) => {
                    const Icon = action.icon;
                    const isActive = activeAssistIntent === action.id;
                    return (
                      <Button
                        key={action.id}
                        type="button"
                        variant="outline"
                        onClick={() => void handleAssist(action.id as AssistIntent)}
                        className={`justify-start rounded-xl border-slate-300 ${isActive ? 'bg-slate-950 text-white hover:bg-slate-800 hover:text-white' : ''}`}
                        disabled={!hasDocument || isRefining}
                      >
                        {isActive ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Icon className="mr-2 h-4 w-4" />}
                        {action.label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-[1.2rem] border border-slate-200 bg-white p-4">
                <p className="text-sm font-medium text-slate-950">Quick edits</p>
                <div className="mt-3 grid gap-2">
                  <Button type="button" variant="outline" onClick={() => setEditableText(originalText || editableText)} className="justify-start rounded-xl border-slate-300">
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    Reset to extracted text
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setEditableText((current) => current.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim())} className="justify-start rounded-xl border-slate-300">
                    Clean spacing
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setEditableText((current) => `${current.trim()}\n\nNOTES\n- Add additional editable notes here.`.trim())} className="justify-start rounded-xl border-slate-300">
                    Add notes section
                  </Button>
                </div>
              </div>

              {aiNotes.length ? (
                <div className="rounded-[1.2rem] border border-slate-200 bg-white p-4">
                  <p className="text-sm font-medium text-slate-950">AI notes</p>
                  <div className="mt-3 space-y-2">
                    {aiNotes.map((note) => (
                      <div key={note} className="rounded-xl bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
                        {note}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="rounded-[1.2rem] border border-slate-200 bg-white p-4">
                <p className="text-sm font-medium text-slate-950">Export</p>
                <div className="mt-3 grid gap-2">
                  <Button type="button" onClick={() => void handleExportPdf()} className="rounded-xl bg-slate-950 text-white hover:bg-slate-800" disabled={!hasDocument || isExporting}>
                    {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    Download PDF
                  </Button>
                  <Button type="button" variant="outline" onClick={handleDownloadText} className="rounded-xl border-slate-300" disabled={!hasDocument}>
                    Download text
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-[1.15rem] border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Editor status</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{isConverting ? 'Converting PDF into editable text...' : isRefining ? 'Applying AI document refinement...' : isExporting ? 'Exporting PDF...' : statusMessage}</p>
            </div>
          </aside>
        </div>
      </section>
    </PublicSiteChrome>
  );
}
