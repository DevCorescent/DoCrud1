'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, Eye, LineChart, Loader2, PieChart, SlidersHorizontal, Table2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ProcessProgress } from '@/components/ui/process-progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { stripHtmlPreserveStructure } from '@/lib/document-parser-analysis';
import {
  buildInteractiveVisualization,
  type DocumentVisualizationInsights,
  type VisualizerChart,
  type VisualizerDeepInsight,
  type VisualizerMetric,
  type VisualizerStatKey,
  type VisualizerTableData,
  updateTableCell,
} from '@/lib/document-visualizer-analysis';

interface VisualizerResult extends DocumentVisualizationInsights {
  provider: string;
  model: string;
  sourceType: 'paste' | 'preview' | 'upload';
}

interface DocumentVisualizerCenterProps {
  currentDocumentTitle?: string;
  currentDocumentContent?: string;
}

function MetricCard({ metric }: { metric: VisualizerMetric }) {
  return (
    <div className="rounded-[1.25rem] border border-white/70 bg-white/82 p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{metric.label}</p>
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
    <div className="space-y-3">
      <div className="flex min-h-[140px] items-end gap-3 rounded-[1.2rem] border border-slate-100 bg-slate-50 p-4">
        {chart.data.map((item) => (
          <div key={`${chart.id}-${item.label}`} className="flex flex-1 flex-col items-center justify-end gap-2">
            <div className="w-full rounded-t-xl bg-[linear-gradient(180deg,#60a5fa_0%,#2563eb_100%)]" style={{ height: `${Math.max(16, (item.value / max) * 110)}px` }} />
            <span className="line-clamp-2 text-center text-[10px] text-slate-500">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DonutChartView({ chart }: { chart: VisualizerChart }) {
  const total = chart.data.reduce((sum, item) => sum + item.value, 0) || 1;
  const colors = ['#0f172a', '#2563eb', '#60a5fa', '#93c5fd', '#cbd5e1', '#94a3b8'];
  let cursor = 0;
  const segments = chart.data.map((item, index) => {
    const start = cursor;
    const portion = (item.value / total) * 100;
    cursor += portion;
    return { ...item, color: colors[index % colors.length], start, end: cursor };
  });

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
      <div
        className="mx-auto h-40 w-40 rounded-full"
        style={{
          background: `conic-gradient(${segments.map((segment) => `${segment.color} ${segment.start}% ${segment.end}%`).join(', ')})`,
        }}
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
    <div className="rounded-[1.4rem] border border-white/70 bg-white/82 p-5 shadow-sm">
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
    <div className={`rounded-[1.25rem] border p-4 ${toneClasses}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-70">{insight.title}</p>
      <p className="mt-3 text-sm leading-6">{insight.detail}</p>
    </div>
  );
}

export default function DocumentVisualizerCenter({ currentDocumentTitle, currentDocumentContent }: DocumentVisualizerCenterProps) {
  const [title, setTitle] = useState(currentDocumentTitle || '');
  const [content, setContent] = useState('');
  const [result, setResult] = useState<VisualizerResult | null>(null);
  const [interactiveTable, setInteractiveTable] = useState<VisualizerTableData | null>(null);
  const [draftTable, setDraftTable] = useState<VisualizerTableData | null>(null);
  const [selectedStats, setSelectedStats] = useState<VisualizerStatKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingTable, setSavingTable] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [downloadMessage, setDownloadMessage] = useState('');
  const [uploadedSource, setUploadedSource] = useState<{ fileName: string; extractionMethod?: string; characters?: number; sheetName?: string } | null>(null);
  const canUseCurrentPreview = Boolean(currentDocumentContent?.trim());
  const normalizedPreviewContent = useMemo(() => stripHtmlPreserveStructure(currentDocumentContent || ''), [currentDocumentContent]);
  const [uiTab, setUiTab] = useState<'source' | 'controls' | 'charts' | 'table' | 'export'>('source');
  const [tableRowsShown, setTableRowsShown] = useState(60);

  const interactiveResult = useMemo(() => {
    if (!result) return null;
    const activeStats = selectedStats.length ? selectedStats : result.defaultSelectedStats;
    return buildInteractiveVisualization(result.title || title || 'Untitled document', content || normalizedPreviewContent, interactiveTable, activeStats);
  }, [content, interactiveTable, normalizedPreviewContent, result, selectedStats, title]);

  useEffect(() => {
    if (result) {
      setSelectedStats(result.defaultSelectedStats);
      setInteractiveTable(result.table);
      setDraftTable(result.table);
      setTableRowsShown(60);
      setUiTab('charts');
    }
  }, [result]);

  const runVisualization = async (override?: { title?: string; content?: string; sourceType?: 'paste' | 'preview' | 'upload' }) => {
    const finalTitle = override?.title || title || currentDocumentTitle || 'Untitled document';
    const finalContent = override?.content ?? content;

    if (!finalContent.trim()) {
      setErrorMessage('Paste the document text or use the current preview first.');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/ai/document-visualizer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: finalTitle,
          content: finalContent,
          sourceType: override?.sourceType || 'paste',
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to generate document visualization.');
      }
      setResult(payload);
      setTitle(payload.title || finalTitle);
      setContent(override?.sourceType === 'preview' ? normalizedPreviewContent : finalContent);
      setUploadedSource((current) => current ? {
        ...current,
        extractionMethod: payload.extractionMethod,
        characters: payload.extractedCharacterCount,
      } : current);
      setDownloadMessage(payload.table ? 'CSV dataset generated and ready to export.' : '');
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to generate document visualization.');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadVisualization = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setLoading(true);
      setErrorMessage('');
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      const baseTitle = file.name.replace(/\.[^.]+$/, '');

      // For spreadsheet-like uploads, extract to CSV locally so parsing is consistent and quote-safe.
      if (extension === 'csv' || extension === 'tsv' || extension === 'xlsx' || extension === 'xls') {
        let extractedContent = '';
        let extractionMethod = '';
        let sheetName: string | undefined;

        if (extension === 'csv' || extension === 'tsv') {
          extractedContent = await file.text();
          extractionMethod = extension === 'csv' ? 'local-csv' : 'local-tsv';
        } else {
          const XLSX = await import('xlsx');
          const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
          const firstSheetName = workbook.SheetNames[0];
          if (!firstSheetName) {
            throw new Error('No sheets were found inside this workbook.');
          }
          sheetName = firstSheetName;
          extractedContent = XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheetName]);
          extractionMethod = 'local-xlsx';
        }

        setTitle(baseTitle);
        setContent(extractedContent);
        setUploadedSource({
          fileName: file.name,
          extractionMethod,
          characters: extractedContent.length,
          sheetName,
        });
        await runVisualization({ title: baseTitle, content: extractedContent, sourceType: 'upload' });
        return;
      }

      // For document-like uploads, use the existing parser pipeline.
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', baseTitle);
      const response = await fetch('/api/ai/document-parser', { method: 'POST', body: formData });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to read this uploaded file.');
      const extractedContent = payload?.extractedContent || '';

      setTitle(payload?.title || baseTitle);
      setContent(extractedContent);
      setUploadedSource({
        fileName: file.name,
        extractionMethod: payload?.extractionMethod,
        characters: payload?.extractedCharacterCount,
      });
      await runVisualization({ title: payload?.title || baseTitle, content: extractedContent, sourceType: 'upload' });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to upload this source file.');
      setLoading(false);
    } finally {
      event.target.value = '';
    }
  };

  const toggleStat = (statId: VisualizerStatKey) => {
    setSelectedStats((current) => current.includes(statId) ? current.filter((item) => item !== statId) : [...current, statId]);
  };

  const exportCsv = () => {
    if (!interactiveTable?.csvContent) return;
    const blob = new Blob([interactiveTable.csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${(result?.title || title || 'document-visualizer').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setDownloadMessage('CSV exported successfully.');
  };

  const handleCellChange = (rowId: string, columnId: string, nextValue: string) => {
    setDraftTable((current) => current ? updateTableCell(current, rowId, columnId, nextValue) : current);
    setDownloadMessage('Spreadsheet draft updated. Save changes to refresh charts and CSV.');
  };

  const saveTableChanges = async () => {
    if (!draftTable) return;
    setSavingTable(true);
    setInteractiveTable(draftTable);
    setDownloadMessage('Saved spreadsheet values. Charts and CSV have been refreshed.');
    setSavingTable(false);
  };

  const activeResult = interactiveResult || result;
  const availableStats = activeResult?.availableStats || result?.availableStats || [];
  const hasTable = Boolean(draftTable?.rows?.length && draftTable?.columns?.length);

  return (
    <div className="space-y-6">
      {(errorMessage || downloadMessage) ? (
        <Card className="border-white/70 bg-white/80">
          <CardContent className="p-4">
            {downloadMessage ? <p className="text-sm text-emerald-700">{downloadMessage}</p> : null}
            {errorMessage ? <p className="text-sm text-rose-600">{errorMessage}</p> : null}
          </CardContent>
        </Card>
      ) : null}

      <ProcessProgress active={loading || savingTable} profile={loading ? 'analysis' : 'save'} title={loading ? 'Visualizer is building your insights' : 'Saving visual table changes'} floating />

      <Card className="border-white/70 bg-white/82">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="text-lg">Visualizer AI</CardTitle>
            <p className="mt-1 truncate text-sm text-slate-500">
              {activeResult ? `${activeResult.documentType} · ${activeResult.confidenceScore}/100` : 'Paste or upload a sheet to generate charts.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void runVisualization()} disabled={loading} className="rounded-xl">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BarChart3 className="mr-2 h-4 w-4" />}
              Analyze
            </Button>
            <Button variant="outline" onClick={exportCsv} disabled={!interactiveTable?.csvContent} className="rounded-xl">
              <Download className="mr-2 h-4 w-4" />
              CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={uiTab} onValueChange={(value) => setUiTab(value as 'source' | 'controls' | 'charts' | 'table' | 'export')}>
            <TabsList className="navbar-glass mb-4 gap-1 rounded-[1.1rem] bg-white/75 p-1">
              <TabsTrigger value="source" className="rounded-xl">Source</TabsTrigger>
              <TabsTrigger value="controls" className="rounded-xl">Controls</TabsTrigger>
              <TabsTrigger value="charts" className="rounded-xl">Charts</TabsTrigger>
              <TabsTrigger value="table" className="rounded-xl">Table</TabsTrigger>
              <TabsTrigger value="export" className="rounded-xl">Export</TabsTrigger>
            </TabsList>

            <TabsContent value="source" className="mt-0">
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-900">Title</label>
                    <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Financial summary, operations tracker, procurement sheet" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-900">Content</label>
                    <Textarea
                      value={content}
                      onChange={(event) => setContent(event.target.value)}
                      placeholder="Paste CSV/TSV rows or structured report text."
                      className="min-h-[320px] rounded-[1.25rem] border-white/70 bg-white/70 leading-7"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex cursor-pointer items-center rounded-xl border border-white/70 bg-white/70 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-white/85">
                      <Upload className="mr-2 h-4 w-4" />
                      Upload
                      <input type="file" accept=".xlsx,.xls,.csv,.tsv,.pdf,.doc,.docx,.txt,.json,.xml,.html,.md" className="hidden" onChange={(event) => void handleUploadVisualization(event)} />
                    </label>
                    <Button
                      variant="outline"
                      onClick={() => void runVisualization({ title: currentDocumentTitle || title, content: normalizedPreviewContent, sourceType: 'preview' })}
                      disabled={loading || !canUseCurrentPreview}
                      className="rounded-xl"
                    >
                      Analyze preview
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setContent('');
                        setErrorMessage('');
                        setDownloadMessage('');
                        setUploadedSource(null);
                        setResult(null);
                        setInteractiveTable(null);
                        setDraftTable(null);
                        setSelectedStats([]);
                        setUiTab('source');
                      }}
                      className="rounded-xl"
                    >
                      Clear
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  {uploadedSource ? (
                    <div className="rounded-[1.2rem] border border-sky-200 bg-sky-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Uploaded</p>
                      <p className="mt-2 text-sm font-semibold text-slate-950">{uploadedSource.fileName}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {uploadedSource.sheetName ? `${uploadedSource.sheetName} · ` : ''}
                        {uploadedSource.characters ? `${uploadedSource.characters.toLocaleString()} chars` : 'Ready'}
                        {uploadedSource.extractionMethod ? ` · ${uploadedSource.extractionMethod}` : ''}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-[1.2rem] border border-white/70 bg-white/70 p-4 text-sm text-slate-600">
                      Upload `XLSX/CSV` for best spreadsheet accuracy. You can also paste rows directly.
                    </div>
                  )}
                  <div className="rounded-[1.2rem] border border-white/70 bg-white/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Tip</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">Charts become more accurate when headers are present and numbers use consistent units.</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="controls" className="mt-0">
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[1.2rem] border border-white/70 bg-white/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Type</p>
                      <p className="mt-2 text-base font-semibold text-slate-950">{activeResult?.documentType || 'Unanalyzed'}</p>
                    </div>
                    <div className="rounded-[1.2rem] border border-white/70 bg-white/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Confidence</p>
                      <p className="mt-2 text-base font-semibold text-slate-950">{activeResult?.confidenceScore || 0} / 100</p>
                    </div>
                  </div>

                  <div className="rounded-[1.2rem] border border-white/70 bg-white/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Brief</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{activeResult?.executiveSummary || 'Run an analysis to generate a visualization brief.'}</p>
                    {result ? <p className="mt-3 text-xs text-slate-500">Powered by {result.provider} · {result.model}</p> : null}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                      <SlidersHorizontal className="h-4 w-4" />
                      Stat controls
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-xl"
                      onClick={() => {
                        if (!activeResult) return;
                        setSelectedStats(activeResult.defaultSelectedStats);
                      }}
                      disabled={!activeResult}
                    >
                      Reset
                    </Button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {availableStats.map((stat) => {
                      const active = selectedStats.includes(stat.id);
                      return (
                        <button
                          key={stat.id}
                          type="button"
                          onClick={() => toggleStat(stat.id)}
                          className={`rounded-[1.1rem] border px-4 py-4 text-left transition ${active ? 'border-slate-950 bg-slate-950 text-white' : 'border-white/70 bg-white/70 text-slate-800 hover:bg-white/85'}`}
                        >
                          <p className="text-sm font-semibold">{stat.label}</p>
                          <p className={`mt-2 text-xs leading-5 ${active ? 'text-white/72' : 'text-slate-500'}`}>{stat.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded-[1.2rem] border border-white/70 bg-white/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Table</p>
                    <p className="mt-2 text-sm text-slate-700">
                      {hasTable ? `${draftTable!.rows.length.toLocaleString()} rows · ${draftTable!.columns.length.toLocaleString()} columns` : 'No table detected yet.'}
                    </p>
                  </div>
                  <div className="rounded-[1.2rem] border border-white/70 bg-white/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Selected stats</p>
                    <p className="mt-2 text-sm text-slate-700">{selectedStats.length ? selectedStats.join(', ') : 'Default'}</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="charts" className="mt-0">
              {activeResult ? (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {activeResult.keyMetrics.slice(0, 6).map((metric) => (
                      <MetricCard key={metric.label} metric={metric} />
                    ))}
                  </div>

                  {activeResult.deepInsights.length ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {activeResult.deepInsights.slice(0, 6).map((insight) => (
                        <DeepInsightCard key={insight.id} insight={insight} />
                      ))}
                    </div>
                  ) : null}

                  <div className="grid gap-5 xl:grid-cols-2">
                    {activeResult.charts.slice(0, 8).map((chart) => (
                      <ChartPanel key={chart.id} chart={chart} />
                    ))}
                  </div>

                  <div className="grid gap-4 lg:grid-cols-3">
                    <Card className="border-white/70 bg-white/82">
                      <CardHeader><CardTitle className="text-base">Highlights</CardTitle></CardHeader>
                      <CardContent className="space-y-2">
                        {activeResult.highlights.map((item) => (
                          <div key={item} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">{item}</div>
                        ))}
                      </CardContent>
                    </Card>
                    <Card className="border-white/70 bg-white/82">
                      <CardHeader><CardTitle className="text-base">Anomalies</CardTitle></CardHeader>
                      <CardContent className="space-y-2">
                        {activeResult.anomalies.length ? activeResult.anomalies.map((item) => (
                          <div key={item} className="rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">{item}</div>
                        )) : <p className="text-sm text-slate-500">No strong anomalies detected.</p>}
                      </CardContent>
                    </Card>
                    <Card className="border-white/70 bg-white/82">
                      <CardHeader><CardTitle className="text-base">Next</CardTitle></CardHeader>
                      <CardContent className="space-y-2">
                        {activeResult.recommendations.map((item) => (
                          <div key={item} className="rounded-2xl bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">{item}</div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              ) : (
                <div className="rounded-[1.2rem] border border-white/70 bg-white/70 p-4 text-sm text-slate-600">
                  Run an analysis to see charts and insights.
                </div>
              )}
            </TabsContent>

            <TabsContent value="table" className="mt-0">
              {draftTable ? (
                <Card className="border-white/70 bg-white/82">
                  <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <CardTitle className="text-base">Spreadsheet table</CardTitle>
                      <p className="mt-1 text-sm text-slate-500">Edit cells, then save to refresh charts and CSV.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                        <Table2 className="h-4 w-4" />
                        {draftTable.rows.length} rows · {draftTable.columns.length} cols
                      </div>
                      <Button onClick={() => void saveTableChanges()} disabled={savingTable} className="rounded-xl bg-slate-950 text-white hover:bg-slate-800">
                        {savingTable ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving</> : 'Save'}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-slate-600">Showing {Math.min(tableRowsShown, draftTable.rows.length)} rows</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={() => setTableRowsShown((current) => Math.min(draftTable.rows.length, current + 60))}
                        disabled={tableRowsShown >= draftTable.rows.length}
                      >
                        Show more
                      </Button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full border-separate border-spacing-y-2">
                        <thead>
                          <tr>
                            {draftTable.columns.map((column) => (
                              <th key={column.id} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                {column.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {draftTable.rows.slice(0, tableRowsShown).map((row) => (
                            <tr key={row.id}>
                              {draftTable.columns.map((column) => (
                                <td key={`${row.id}-${column.id}`} className="rounded-2xl bg-slate-50 px-2 py-2">
                                  <input
                                    value={row.cells[column.index] || ''}
                                    onChange={(event) => handleCellChange(row.id, column.id, event.target.value)}
                                    className="w-full rounded-xl border border-white/70 bg-white/80 px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-400"
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="rounded-[1.2rem] border border-white/70 bg-white/70 p-4 text-sm text-slate-600">
                  No table detected yet. Upload or paste spreadsheet rows first.
                </div>
              )}
            </TabsContent>

            <TabsContent value="export" className="mt-0">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <Card className="border-white/70 bg-white/82">
                  <CardHeader><CardTitle className="text-base">Export</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <Button onClick={exportCsv} disabled={!interactiveTable?.csvContent} className="rounded-xl">
                      <Download className="mr-2 h-4 w-4" />
                      Download CSV
                    </Button>
                    <p className="text-sm text-slate-600">
                      {interactiveTable?.csvContent ? 'Exports the current modeled dataset (after any saved edits).' : 'Run analysis first to generate a dataset.'}
                    </p>
                  </CardContent>
                </Card>

                <div className="space-y-3">
                  <div className="rounded-[1.2rem] border border-white/70 bg-white/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Dataset</p>
                    <p className="mt-2 text-sm text-slate-700">
                      {hasTable ? `${draftTable!.rows.length.toLocaleString()} rows · ${draftTable!.columns.length.toLocaleString()} cols` : 'No dataset yet'}
                    </p>
                    {interactiveTable?.delimiter ? <p className="mt-1 text-xs text-slate-500">Delimiter: {interactiveTable.delimiter === '\t' ? 'tab' : interactiveTable.delimiter}</p> : null}
                  </div>
                  {downloadMessage ? (
                    <div className="rounded-[1.2rem] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{downloadMessage}</div>
                  ) : null}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
