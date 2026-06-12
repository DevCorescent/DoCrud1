'use client';

import { ChangeEvent, useCallback, useMemo, useRef, useState } from 'react';
import { BrainCircuit, Download, Loader2, ShieldAlert, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ProcessProgress } from '@/components/ui/process-progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { stripHtmlPreserveStructure } from '@/lib/document-parser-analysis';
import { buildDoxpertReportHtml, DOXPERT_DISCLAIMER } from '@/lib/doxpert-report';
import { DoxpertAnalysisReport } from '@/types/document';
type DoxpertInsight = DoxpertAnalysisReport & { sourceType: 'upload' | 'paste' | 'preview' };

type DoxpertMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

interface DoxpertCenterProps {
  currentDocumentTitle?: string;
  currentDocumentContent?: string;
  currentHistoryId?: string;
  currentDocumentSourceType?: 'generated' | 'uploaded_pdf';
}

function ScoreRail({ label, value, invert = false }: { label: string; value: number; invert?: boolean }) {
  const normalized = Math.max(0, Math.min(100, value));
  const tone = invert
    ? normalized > 70 ? 'bg-rose-500' : normalized > 45 ? 'bg-amber-400' : 'bg-emerald-500'
    : normalized >= 80 ? 'bg-emerald-500' : normalized >= 60 ? 'bg-amber-400' : 'bg-rose-500';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-semibold text-slate-950">{normalized}</span>
      </div>
      <div className="h-2.5 rounded-full bg-slate-200">
        <div className={`h-2.5 rounded-full ${tone}`} style={{ width: `${normalized}%` }} />
      </div>
    </div>
  );
}

export default function DoxpertCenter({
  currentDocumentTitle,
  currentDocumentContent,
  currentHistoryId,
  currentDocumentSourceType,
}: DoxpertCenterProps) {
  const [title, setTitle] = useState(currentDocumentTitle || '');
  const [content, setContent] = useState('');
  const [question, setQuestion] = useState('What are the risks, weak areas, reply options, and additions needed before I approve or respond to this document?');
  const [analysis, setAnalysis] = useState<DoxpertInsight | null>(null);
  const [, setMessages] = useState<DoxpertMessage[]>([
    {
      id: 'doxpert-welcome',
      role: 'assistant',
      text: 'Paste document text or analyze the current preview. I will read it, score risk areas, and tell you what to add or reply back.',
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [uploadedSource, setUploadedSource] = useState<{ fileName: string; extractionMethod?: string; characters?: number } | null>(null);
  const [inputTab, setInputTab] = useState<'paste' | 'preview' | 'upload'>('paste');
  const [resultTab, setResultTab] = useState<'overview' | 'scores' | 'risks' | 'additions' | 'qa'>('overview');
  const [previewMeta, setPreviewMeta] = useState<{ method?: string; characters?: number } | null>(null);
  const extractedPreviewRef = useRef<string>('');
  const [qaQuestion, setQaQuestion] = useState('');
  const [qaLoading, setQaLoading] = useState(false);
  const [qaAnswer, setQaAnswer] = useState<{ answer: string; evidenceQuotes: string[]; confidence: number } | null>(null);

  const canUseCurrentPreview = Boolean(currentDocumentContent?.trim())
    || (currentDocumentSourceType === 'uploaded_pdf' && Boolean(currentHistoryId));

  const normalizedPreviewContent = useMemo(
    () => stripHtmlPreserveStructure(currentDocumentContent || ''),
    [currentDocumentContent],
  );

  const runTextAnalysis = useCallback(async (override?: { title?: string; content?: string; sourceType?: 'paste' | 'preview' | 'upload' }) => {
    const finalTitle = override?.title || title || currentDocumentTitle || 'Untitled document';
    const finalContent = override?.content ?? content;

    if (!finalContent.trim()) {
      setErrorMessage('Paste the document text or use the current preview first.');
      setSuccessMessage('');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/ai/doxpert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: finalTitle,
          content: finalContent,
          question,
          sourceType: override?.sourceType || 'paste',
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to run DoXpert analysis.');
      }
      setAnalysis(payload);
      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: 'user', text: question },
        { id: `assistant-${Date.now() + 1}`, role: 'assistant', text: payload.advisorReply || 'Analysis completed.' },
      ]);
      setContent(payload.extractedContent || finalContent);
      setTitle(payload.title || finalTitle);
      setUploadedSource((current) => current ? {
        ...current,
        extractionMethod: payload.extractionMethod,
        characters: payload.extractedCharacterCount,
      } : current);
      setErrorMessage('');
      setSuccessMessage('DoXpert analysis is ready.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to run DoXpert analysis.');
      setSuccessMessage('');
    } finally {
      setLoading(false);
    }
  }, [content, currentDocumentTitle, question, title]);

  const ensurePreviewContent = useCallback(async () => {
    if (normalizedPreviewContent.trim()) {
      extractedPreviewRef.current = normalizedPreviewContent;
      setPreviewMeta({ method: 'workspace_html', characters: normalizedPreviewContent.length });
      return normalizedPreviewContent;
    }

    if (currentDocumentSourceType !== 'uploaded_pdf' || !currentHistoryId) {
      return '';
    }

    if (extractedPreviewRef.current.trim()) {
      return extractedPreviewRef.current;
    }

    const response = await fetch(`/api/ai/doxpert/preview?historyId=${encodeURIComponent(currentHistoryId)}`, { cache: 'no-store' });
    const payload = await response.json().catch(() => null) as null | {
      extractedContent?: string;
      extractedCharacterCount?: number;
      extractionMethod?: string;
      error?: string;
    };
    if (!response.ok) {
      throw new Error(payload?.error || 'Unable to read the current PDF preview.');
    }
    const extractedContent = String(payload?.extractedContent || '');
    extractedPreviewRef.current = extractedContent;
    setPreviewMeta({ method: payload?.extractionMethod, characters: payload?.extractedCharacterCount });
    return extractedContent;
  }, [currentDocumentSourceType, currentHistoryId, normalizedPreviewContent]);

  const answerFromDocument = useCallback(async () => {
    const q = qaQuestion.trim();
    if (!q) {
      setErrorMessage('Type a question first.');
      setSuccessMessage('');
      return;
    }
    try {
      setQaLoading(true);
      setErrorMessage('');
      setSuccessMessage('');
      const docText =
        content.trim()
          ? content
          : inputTab === 'preview'
            ? await ensurePreviewContent()
            : await ensurePreviewContent().catch(() => '');

      if (!docText.trim()) {
        setErrorMessage('Paste text, upload a file, or analyze the current preview first.');
        setSuccessMessage('');
        return;
      }

      const response = await fetch('/api/ai/doxpert/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: currentDocumentTitle || title || 'Untitled document',
          content: docText,
          question: q,
        }),
      });
      const payload = await response.json().catch(() => null) as null | {
        answer?: string;
        evidenceQuotes?: string[];
        confidence?: number;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to answer from this document.');
      }
      setQaAnswer({
        answer: String(payload?.answer || ''),
        evidenceQuotes: Array.isArray(payload?.evidenceQuotes) ? payload!.evidenceQuotes.map(String).slice(0, 4) : [],
        confidence: typeof payload?.confidence === 'number' ? payload.confidence : Number(payload?.confidence || 0),
      });
      setResultTab('qa');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to answer from this document.');
      setSuccessMessage('');
    } finally {
      setQaLoading(false);
    }
  }, [content, currentDocumentTitle, ensurePreviewContent, inputTab, qaQuestion, title]);

  const handleUploadAnalysis = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setLoading(true);
      setErrorMessage('');
      setSuccessMessage('');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', file.name.replace(/\.[^.]+$/, ''));
      const response = await fetch('/api/ai/document-parser', { method: 'POST', body: formData });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to read this uploaded document.');
      }
      const extractedContent = payload?.extractedContent || '';
      setTitle(payload?.title || file.name.replace(/\.[^.]+$/, ''));
      setContent(extractedContent);
      setUploadedSource({
        fileName: file.name,
        extractionMethod: payload?.extractionMethod,
        characters: payload?.extractedCharacterCount,
      });
      setSuccessMessage('Document uploaded and extracted. Running DoXpert analysis now.');
      await runTextAnalysis({
        title: payload?.title || file.name.replace(/\.[^.]+$/, ''),
        content: extractedContent,
        sourceType: 'upload',
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to upload this document.');
      setSuccessMessage('');
      setLoading(false);
    } finally {
      event.target.value = '';
    }
  };

  const downloadReport = () => {
    if (!analysis) return;
    const html = buildDoxpertReportHtml(analysis, 'docrud workspace user');
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(analysis.title || 'doxpert-report').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {(errorMessage || successMessage) ? (
        <div className="rounded-[1.2rem] border border-white/70 bg-white/80 px-4 py-3 text-sm backdrop-blur">
          {errorMessage ? <p className="text-rose-600">{errorMessage}</p> : null}
          {successMessage ? <p className="text-emerald-700">{successMessage}</p> : null}
        </div>
      ) : null}

      <ProcessProgress active={loading} profile="analysis" title="DoXpert is reviewing your document" floating />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
        <Card className="border-white/70 bg-white/82">
          <CardHeader className="pb-3">
            <CardTitle>Analyze</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">Title</label>
                <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Agreement, proposal, notice" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">Question</label>
                <Input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What should I fix or reply?" />
              </div>
            </div>

            <Tabs value={inputTab} onValueChange={(value) => setInputTab(value as typeof inputTab)}>
              <TabsList className="bg-white/70">
                <TabsTrigger value="paste">Paste</TabsTrigger>
                <TabsTrigger value="preview">Current preview</TabsTrigger>
                <TabsTrigger value="upload">Upload</TabsTrigger>
              </TabsList>

              <TabsContent value="paste" className="mt-3 space-y-3">
                <textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="Paste the document text for best accuracy."
                  className="min-h-[320px] w-full rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-800 outline-none transition focus:border-slate-400 focus:bg-white"
                />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void runTextAnalysis({ sourceType: 'paste' })} disabled={loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BrainCircuit className="mr-2 h-4 w-4" />}
                    Analyze
                  </Button>
                  {analysis ? (
                    <Button variant="outline" onClick={downloadReport}>
                      <Download className="mr-2 h-4 w-4" />
                      Download report
                    </Button>
                  ) : null}
                </div>
              </TabsContent>

              <TabsContent value="preview" className="mt-3 space-y-3">
                <div className="rounded-2xl border bg-slate-50 p-4 text-sm text-slate-700">
                  <p className="font-semibold text-slate-950">Preview</p>
                  <p className="mt-1">{canUseCurrentPreview ? 'Ready.' : 'Open a document to enable preview analysis.'}</p>
                  {previewMeta?.characters ? (
                    <p className="mt-2 text-xs text-slate-500">
                      {previewMeta.characters.toLocaleString()} characters · {previewMeta.method || 'preview'}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={loading || !canUseCurrentPreview}
                    onClick={() => void (async () => {
                      try {
                        setErrorMessage('');
                        setSuccessMessage('');
                        const previewContent = await ensurePreviewContent();
                        await runTextAnalysis({ title: currentDocumentTitle || title, content: previewContent, sourceType: 'preview' });
                        setResultTab('overview');
                      } catch (error) {
                        setErrorMessage(error instanceof Error ? error.message : 'Unable to analyze the current preview.');
                        setSuccessMessage('');
                      }
                    })()}
                  >
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BrainCircuit className="mr-2 h-4 w-4" />}
                    Analyze current preview
                  </Button>
                  {analysis ? (
                    <Button variant="outline" onClick={downloadReport}>
                      <Download className="mr-2 h-4 w-4" />
                      Download report
                    </Button>
                  ) : null}
                </div>
              </TabsContent>

              <TabsContent value="upload" className="mt-3 space-y-3">
                {uploadedSource ? (
                  <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Upload ready</p>
                    <p className="mt-2 text-sm font-semibold text-slate-950">{uploadedSource.fileName}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      {uploadedSource.characters ? `${uploadedSource.characters.toLocaleString()} characters` : 'Extracted'}
                      {uploadedSource.extractionMethod ? ` · ${uploadedSource.extractionMethod}` : ''}
                    </p>
                  </div>
                ) : null}
                <label className="inline-flex cursor-pointer items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                  <Upload className="mr-2 h-4 w-4" />
                  Choose file
                  <input type="file" accept=".pdf,.doc,.docx,.docm,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.txt,.md,.html,.csv,.json,.xml,.rtf,.png,.jpg,.jpeg,.webp,.tif,.tiff" className="hidden" onChange={(event) => void handleUploadAnalysis(event)} />
                </label>
              </TabsContent>
            </Tabs>

            <div className="rounded-[1.1rem] border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
              {DOXPERT_DISCLAIMER}
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/70 bg-white/82">
          <CardHeader className="pb-3">
            <CardTitle>Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!analysis ? (
              <div className="rounded-2xl border bg-slate-50 p-4 text-sm text-slate-600">
                Run an analysis to see scores, risks, and reply guidance.
              </div>
            ) : (
              <Tabs value={resultTab} onValueChange={(value) => setResultTab(value as typeof resultTab)}>
                <TabsList className="bg-white/70">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="scores">Scores</TabsTrigger>
                  <TabsTrigger value="risks">Risks</TabsTrigger>
                  <TabsTrigger value="additions">Additions</TabsTrigger>
                  <TabsTrigger value="qa">Q&A</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-3 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border bg-slate-50 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Trust</p>
                      <p className="mt-2 text-lg font-semibold text-slate-950">{analysis.trustScore}</p>
                    </div>
                    <div className="rounded-2xl border bg-slate-50 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Tone</p>
                      <p className="mt-2 text-lg font-semibold text-slate-950">{analysis.tone}</p>
                    </div>
                    <div className="rounded-2xl border bg-slate-50 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Sentiment</p>
                      <p className="mt-2 text-lg font-semibold text-slate-950">{analysis.sentiment}</p>
                    </div>
                  </div>
                  <div className="rounded-2xl border bg-white p-4 text-sm leading-6 text-slate-700">
                    {analysis.advisorReply || analysis.trustNote}
                  </div>
                  <p className="text-xs text-slate-500">
                    {analysis.provider} · {analysis.model} · {analysis.extractedCharacterCount.toLocaleString()} chars
                  </p>
                </TabsContent>

                <TabsContent value="scores" className="mt-3 space-y-4">
                  <ScoreRail label="Overall" value={analysis.score.overall} />
                  <ScoreRail label="Clarity" value={analysis.score.clarity} />
                  <ScoreRail label="Compliance" value={analysis.score.compliance} />
                  <ScoreRail label="Completeness" value={analysis.score.completeness} />
                  <ScoreRail label="Professionalism" value={analysis.score.professionalism} />
                  <ScoreRail label="Risk exposure" value={analysis.score.riskExposure} invert />
                </TabsContent>

                <TabsContent value="risks" className="mt-3 space-y-3">
                  <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-rose-600" />
                      <p className="text-sm font-semibold text-slate-950">Harm warnings</p>
                    </div>
                    <div className="mt-3 space-y-2 text-sm text-slate-700">
                      {(analysis.harmWarnings.length ? analysis.harmWarnings : ['No major harm warnings detected from the visible text.']).map((item) => (
                        <p key={item}>• {item}</p>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-950">Risks</p>
                      <div className="mt-3 space-y-2 text-sm text-slate-700">
                        {analysis.risks.map((item) => <p key={item}>• {item}</p>)}
                      </div>
                    </div>
                    <div className="rounded-2xl border bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-950">Mitigations</p>
                      <div className="mt-3 space-y-2 text-sm text-slate-700">
                        {analysis.mitigations.map((item) => <p key={item}>• {item}</p>)}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="additions" className="mt-3 space-y-3">
                  <div className="rounded-2xl border bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-950">Weak areas</p>
                    <div className="mt-3 space-y-2 text-sm text-slate-700">
                      {analysis.lowScoreAreas.slice(0, 4).map((item) => (
                        <p key={item.area}>• {item.area}: {item.why}</p>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border bg-sky-50 p-4">
                    <p className="text-sm font-semibold text-slate-950">What to add next</p>
                    <div className="mt-3 space-y-2 text-sm text-slate-700">
                      {analysis.recommendedAdditions.map((item) => <p key={item}>• {item}</p>)}
                    </div>
                  </div>
                  <div className="rounded-2xl border bg-white p-4">
                    <p className="text-sm font-semibold text-slate-950">Reply suggestions</p>
                    <div className="mt-3 space-y-2">
                      {analysis.replySuggestions.slice(0, 4).map((item) => (
                        <div key={item} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="qa" className="mt-3 space-y-3">
                  <div className="rounded-2xl border bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-950">Ask a question</p>
                    <p className="mt-1 text-xs text-slate-600">DoXpert will answer only from the current document text and show supporting quotes.</p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Input value={qaQuestion} onChange={(event) => setQaQuestion(event.target.value)} placeholder="Example: What is the payment due date?" />
                      <Button type="button" className="sm:min-w-[180px]" onClick={() => void answerFromDocument()} disabled={qaLoading}>
                        {qaLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BrainCircuit className="mr-2 h-4 w-4" />}
                        Answer from doc
                      </Button>
                    </div>
                  </div>

                  {qaAnswer ? (
                    <div className="space-y-3">
                      <div className="rounded-2xl border bg-white p-4 text-sm leading-6 text-slate-700">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Answer</p>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-700">Confidence {Math.max(0, Math.min(100, Math.round(qaAnswer.confidence || 0)))}%</span>
                        </div>
                        <p className="mt-3">{qaAnswer.answer}</p>
                      </div>
                      {qaAnswer.evidenceQuotes.length ? (
                        <div className="rounded-2xl border bg-slate-50 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Evidence quotes</p>
                          <div className="mt-3 space-y-2">
                            {qaAnswer.evidenceQuotes.map((quote) => (
                              <div key={quote} className="rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-slate-700">
                                “{quote}”
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
