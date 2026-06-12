'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  type LucideIcon,
  BarChart3, X, Upload, FileText, ChevronRight, Download,
  CheckCircle2, ArrowLeft, RefreshCw, Copy, Check,
  FileSpreadsheet, Target, Activity, Brain, Zap,
  TrendingUp, Shield, AlertTriangle, Lightbulb, Eye,
  PieChart, LineChart, Table2, Info, Sparkles, File,
} from 'lucide-react';
import {
  buildInteractiveVisualization,
  type DocumentVisualizationInsights,
  type VisualizerChart,
  type VisualizerMetric,
  type VisualizerDeepInsight,
  type VisualizerTableData,
} from '@/lib/document-visualizer-analysis';
import { stripHtmlPreserveStructure } from '@/lib/document-parser-analysis';

/* ─── types ─────────────────────────────────────────────────────────────────── */

interface DocumentVisualizerModalProps {
  open: boolean;
  onClose: () => void;
  initialContent?: string;
  initialTitle?: string;
}

interface UploadedSource {
  name: string;
  size: number;
  type: string;
  content: string;
  extractionMethod?: string;
  sheetName?: string;
  category: 'spreadsheet' | 'document' | 'data' | 'text';
}

interface AnalysisConfig {
  title: string;
  depth: 'quick' | 'standard' | 'deep';
  focus: Record<string, boolean>;
}

type WizardStep = 0 | 1 | 2 | 3;

interface VisualizerResult extends DocumentVisualizationInsights {
  provider: string;
  model: string;
}

/* ─── design tokens (monochrome + accent-only-for-progress) ─────────────────── */

const T = {
  /* glass panel */
  glass:   'rgba(255,255,255,0.04)',
  glassMd: 'rgba(255,255,255,0.07)',
  glassHi: 'rgba(255,255,255,0.10)',
  border:  'rgba(255,255,255,0.09)',
  borderMd:'rgba(255,255,255,0.14)',
  /* text */
  hi:   'rgba(255,255,255,0.92)',
  mid:  'rgba(255,255,255,0.60)',
  low:  'rgba(255,255,255,0.35)',
  mute: 'rgba(255,255,255,0.18)',
  /* accent — used ONLY for active/progress states */
  accent: '#ffffff',
  accentBg: 'rgba(255,255,255,0.10)',
  /* progress stripe colors */
  prog1: '#e2e8f0',
  prog2: '#94a3b8',
  prog3: '#64748b',
  /* semantic (kept subtle — desaturated) */
  pos:   'rgba(167,243,208,0.80)',
  posBg: 'rgba(167,243,208,0.07)',
  posBd: 'rgba(167,243,208,0.18)',
  warn:  'rgba(253,230,138,0.80)',
  warnBg:'rgba(253,230,138,0.07)',
  warnBd:'rgba(253,230,138,0.18)',
  neu:   'rgba(255,255,255,0.55)',
  neuBg: 'rgba(255,255,255,0.04)',
  neuBd: 'rgba(255,255,255,0.09)',
} as const;

/* ─── constants ─────────────────────────────────────────────────────────────── */

const STEPS = [
  { label: 'Upload',    icon: Upload    },
  { label: 'Configure', icon: Target    },
  { label: 'Analyzing', icon: Brain     },
  { label: 'Report',    icon: BarChart3 },
];

const PROCESSING_MESSAGES = [
  'Parsing document structure…',
  'Extracting entities and key data…',
  'Running sentiment analysis…',
  'Detecting data patterns…',
  'Building visualization dataset…',
  'Generating charts and metrics…',
  'Computing readability scores…',
  'Identifying anomalies…',
  'Synthesizing recommendations…',
  'Finalising insights report…',
];

const FOCUS_OPTIONS = [
  { id: 'text_metrics',    label: 'Text Metrics',  desc: 'Word count, density, structure',    icon: FileText   },
  { id: 'sentiment',       label: 'Sentiment',     desc: 'Tone, emotion, confidence',          icon: Activity   },
  { id: 'key_data',        label: 'Key Data',      desc: 'Numbers, entities, facts',           icon: Target     },
  { id: 'charts',          label: 'Charts',        desc: 'Visual data representations',        icon: BarChart3  },
  { id: 'readability',     label: 'Readability',   desc: 'Complexity and clarity scores',      icon: Eye        },
  { id: 'risk_signals',    label: 'Risk Signals',  desc: 'Flags and anomalies',                icon: Shield     },
  { id: 'recommendations', label: 'Action Items',  desc: 'Next steps and suggestions',         icon: Lightbulb  },
];

const FILE_TYPES = ['PDF','DOCX','XLSX','CSV','TXT','JSON','XML','MD'];

function categoryFor(mime: string, name: string): UploadedSource['category'] {
  const m = (mime || '').toLowerCase();
  const e = (name.split('.').pop() || '').toLowerCase();
  if (['csv','tsv','xlsx','xls'].includes(e) || m.includes('spreadsheet') || m.includes('excel')) return 'spreadsheet';
  if (['json','xml','yaml'].includes(e)) return 'data';
  if (['pdf','doc','docx','html','md'].includes(e) || m.includes('pdf') || m.includes('word')) return 'document';
  return 'text';
}

function fmt(v: number) {
  if (v <= 0) return '0 B';
  const u = ['B','KB','MB','GB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(v) / Math.log(1024)));
  return `${(v / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

/* ─── shared style helpers ─────────────────────────────────────────────────── */

const glassCard: React.CSSProperties = {
  background: T.glass,
  border: `1px solid ${T.border}`,
  borderRadius: 16,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
};

const glassInput: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.05)',
  border: `1px solid ${T.border}`,
  borderRadius: 10,
  color: T.hi,
  fontSize: 13,
  padding: '10px 14px',
  outline: 'none',
  fontFamily: 'inherit',
  caretColor: '#fff',
};

/* ─── sub-components ────────────────────────────────────────────────────────── */

function ScoreRing({ value, label, color }: { value: number; label: string; color: string }) {
  const [v, setV] = useState(0);
  useEffect(() => { const id = requestAnimationFrame(() => setV(value)); return () => cancelAnimationFrame(id); }, [value]);
  const r = 32, circ = 2 * Math.PI * r;
  const dash = circ * (Math.min(100, Math.max(0, v)) / 100);
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
      <div style={{ position:'relative', width:88, height:88 }}>
        <svg width={88} height={88} style={{ transform:'rotate(-90deg)' }}>
          <circle cx={44} cy={44} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={6}/>
          <circle cx={44} cy={44} r={r} fill="none" stroke={color} strokeWidth={6}
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            style={{ transition:'stroke-dasharray 1.3s cubic-bezier(0.4,0,0.2,1)' }}/>
        </svg>
        <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
          <span style={{ fontSize:20, fontWeight:800, color:T.hi, letterSpacing:'-0.04em', lineHeight:1 }}>{value}</span>
        </div>
      </div>
      <span style={{ fontSize:10, color:T.mute, letterSpacing:'0.20em', textTransform:'uppercase', fontWeight:700 }}>{label}</span>
    </div>
  );
}

function HorizBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
      <div style={{ display:'flex', justifyContent:'space-between' }}>
        <span style={{ fontSize:12, color:T.mid, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'68%' }}>{label}</span>
        <span style={{ fontSize:12, fontWeight:700, color:T.hi, fontVariantNumeric:'tabular-nums' }}>{value.toLocaleString()}</span>
      </div>
      <div style={{ height:5, borderRadius:3, background:'rgba(255,255,255,0.07)', overflow:'hidden' }}>
        <div style={{ height:'100%', borderRadius:3, width:`${pct}%`, background:'linear-gradient(90deg,rgba(255,255,255,0.55),rgba(255,255,255,0.85))', transition:'width 0.9s ease' }}/>
      </div>
    </div>
  );
}

function ColBars({ chart }: { chart: VisualizerChart }) {
  const max = Math.max(...chart.data.map(d => d.value), 1);
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:5, height:96, paddingTop:8 }}>
      {chart.data.slice(0, 9).map((item, i) => (
        <div key={item.label} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4, height:'100%', justifyContent:'flex-end' }}>
          <div style={{
            width:'100%', borderRadius:'3px 3px 0 0', minHeight:3,
            height:`${Math.max(3, (item.value / max) * 80)}px`,
            background: i % 3 === 0 ? 'rgba(255,255,255,0.80)' : i % 3 === 1 ? 'rgba(255,255,255,0.50)' : 'rgba(255,255,255,0.28)',
            transition:'height 0.9s ease',
          }}/>
          <span style={{ fontSize:9, color:T.mute, textAlign:'center', overflow:'hidden', maxWidth:'100%', lineHeight:1.2, whiteSpace:'nowrap', textOverflow:'ellipsis' }}>
            {item.label.substring(0, 5)}
          </span>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ chart }: { chart: VisualizerChart }) {
  const total = chart.data.reduce((s, d) => s + d.value, 0) || 1;
  const grays = ['rgba(255,255,255,0.85)','rgba(255,255,255,0.60)','rgba(255,255,255,0.40)','rgba(255,255,255,0.25)','rgba(255,255,255,0.14)','rgba(255,255,255,0.08)'];
  let cur = 0;
  const segs = chart.data.slice(0, 6).map((item, i) => {
    const pct = (item.value / total) * 100;
    const s = cur; cur += pct;
    return { ...item, color: grays[i % grays.length], start: s, end: cur };
  });
  return (
    <div style={{ display:'flex', alignItems:'center', gap:16 }}>
      <div style={{ flexShrink:0, width:80, height:80, borderRadius:'50%',
        background:`conic-gradient(${segs.map(s => `${s.color} ${s.start}% ${s.end}%`).join(',')})` }}>
        <div style={{ margin:'14px', width:52, height:52, borderRadius:'50%', background:'#0c0c0f', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <span style={{ fontSize:12, fontWeight:700, color:T.hi }}>{segs.length}</span>
        </div>
      </div>
      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:5 }}>
        {segs.slice(0, 4).map(s => (
          <div key={s.label} style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:s.color, flexShrink:0 }}/>
            <span style={{ fontSize:11, color:T.mid, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.label}</span>
            <span style={{ fontSize:11, fontWeight:600, color:T.hi }}>{s.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartCard({ chart }: { chart: VisualizerChart }) {
  const Icon = chart.type === 'bar' ? BarChart3 : chart.type === 'line' ? LineChart : chart.type === 'donut' ? PieChart : Activity;
  const max = Math.max(...chart.data.map(d => d.value), 1);
  return (
    <div style={{ ...glassCard, padding:20 }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:16 }}>
        <div style={{ padding:'7px', borderRadius:9, background:T.glassMd, border:`1px solid ${T.border}`, flexShrink:0 }}>
          <Icon size={14} style={{ color:T.mid }}/>
        </div>
        <div style={{ minWidth:0 }}>
          <p style={{ fontSize:12, fontWeight:700, color:T.hi, letterSpacing:'-0.01em', marginBottom:2 }}>{chart.title}</p>
          <p style={{ fontSize:11, color:T.low, lineHeight:1.5 }}>{chart.insight}</p>
        </div>
      </div>
      {(chart.type === 'bar' || chart.type === 'progress') && (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {chart.data.slice(0,6).map(d => <HorizBar key={d.label} label={d.label} value={d.value} max={max}/>)}
        </div>
      )}
      {chart.type === 'line'  && <ColBars chart={chart}/>}
      {chart.type === 'donut' && <DonutChart chart={chart}/>}
    </div>
  );
}

function MetricCard({ metric }: { metric: VisualizerMetric }) {
  return (
    <div style={{ ...glassCard, padding:'16px 18px' }}>
      <p style={{ fontSize:10, fontWeight:700, color:T.mute, letterSpacing:'0.20em', textTransform:'uppercase', marginBottom:8 }}>{metric.label}</p>
      <p style={{ fontSize:22, fontWeight:800, color:T.hi, letterSpacing:'-0.04em', marginBottom:6 }}>{metric.value}</p>
      <p style={{ fontSize:12, color:T.low, lineHeight:1.6 }}>{metric.insight}</p>
    </div>
  );
}

function InsightCard({ insight }: { insight: VisualizerDeepInsight }) {
  const s = insight.tone === 'positive'
    ? { bg:T.posBg, bd:T.posBd, dot:T.pos,  txt:T.pos,  Icon:CheckCircle2 }
    : insight.tone === 'warning'
    ? { bg:T.warnBg, bd:T.warnBd, dot:T.warn, txt:T.warn, Icon:AlertTriangle }
    : { bg:T.neuBg, bd:T.neuBd, dot:T.mid,  txt:T.mid,  Icon:Info };
  return (
    <div style={{ background:s.bg, border:`1px solid ${s.bd}`, borderRadius:14, padding:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:7 }}>
        <s.Icon size={12} style={{ color:s.dot, flexShrink:0 }}/>
        <p style={{ fontSize:10, fontWeight:700, color:s.dot, letterSpacing:'0.14em', textTransform:'uppercase' }}>{insight.title}</p>
      </div>
      <p style={{ fontSize:12, color:s.txt, lineHeight:1.65 }}>{insight.detail}</p>
    </div>
  );
}

/* ─── main component ────────────────────────────────────────────────────────── */

export default function DocumentVisualizerModal({ open, onClose, initialContent, initialTitle }: DocumentVisualizerModalProps) {
  const [step, setStep]                   = useState<WizardStep>(0);
  const [dragging, setDragging]           = useState(false);
  const [pasteMode, setPasteMode]         = useState(false);
  const [pastedText, setPastedText]       = useState('');
  const [uploadedSource, setUploadedSource] = useState<UploadedSource | null>(null);
  const [config, setConfig]               = useState<AnalysisConfig>({
    title: initialTitle || '',
    depth: 'standard',
    focus: Object.fromEntries(FOCUS_OPTIONS.map(o => [o.id, true])),
  });
  const [processingMsg, setProcessingMsg] = useState(PROCESSING_MESSAGES[0]);
  const [processingPct, setProcessingPct] = useState(0);
  const [result, setResult]               = useState<VisualizerResult | null>(null);
  const [interactiveTable, setInteractiveTable] = useState<VisualizerTableData | null>(null);
  const [error, setError]                 = useState('');
  const [copied, setCopied]               = useState(false);
  const [activeTab, setActiveTab]         = useState<'overview' | 'charts' | 'insights' | 'data'>('overview');
  const [tableRows, setTableRows]         = useState(40);

  const fileRef   = useRef<HTMLInputElement>(null);
  const msgRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const pctRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  /* reset on open */
  useEffect(() => {
    if (!open) return;
    setStep(0); setDragging(false); setPasteMode(false); setPastedText('');
    setUploadedSource(null); setError(''); setResult(null); setInteractiveTable(null);
    setProcessingPct(0); setActiveTab('overview'); setTableRows(40);
    if (initialContent?.trim()) {
      setPasteMode(true);
      setPastedText(stripHtmlPreserveStructure(initialContent));
      setConfig(c => ({ ...c, title: initialTitle || c.title }));
    }
  }, [open]);

  /* scroll lock */
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const stopAnim = useCallback(() => {
    if (msgRef.current) clearInterval(msgRef.current);
    if (pctRef.current) clearInterval(pctRef.current);
    setProcessingPct(100);
  }, []);

  const startAnim = useCallback(() => {
    let idx = 0; setProcessingMsg(PROCESSING_MESSAGES[0]); setProcessingPct(4);
    msgRef.current = setInterval(() => { idx = (idx + 1) % PROCESSING_MESSAGES.length; setProcessingMsg(PROCESSING_MESSAGES[idx]); }, 2000);
    pctRef.current = setInterval(() => setProcessingPct(p => Math.min(91, p + Math.random() * 8 + 2)), 850);
  }, []);

  useEffect(() => () => stopAnim(), [stopAnim]);

  const parseFile = useCallback(async (file: File) => {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext === 'csv' || ext === 'tsv')  return { content: await file.text(), extractionMethod: `local-${ext}` };
    if (ext === 'xlsx' || ext === 'xls') {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type:'array', cellDates:true });
      const name = wb.SheetNames[0];
      if (!name) throw new Error('No sheets found.');
      return { content: XLSX.utils.sheet_to_csv(wb.Sheets[name]), extractionMethod:'local-xlsx', sheetName: name };
    }
    if (ext === 'txt' || ext === 'md')  return { content: await file.text(), extractionMethod:`local-${ext}` };
    const fd = new FormData(); fd.append('file', file); fd.append('title', file.name.replace(/\.[^.]+$/, ''));
    const res = await fetch('/api/ai/document-parser', { method:'POST', body:fd });
    const p = await res.json().catch(() => null);
    if (!res.ok) throw new Error(p?.error || 'Could not parse this file type.');
    return { content: p?.extractedContent || '', extractionMethod: p?.extractionMethod || 'server' };
  }, []);

  const handleFiles = useCallback(async (files: FileList | null) => {
    const file = files?.[0]; if (!file) return;
    try {
      setError('');
      const { content, extractionMethod, sheetName } = await parseFile(file);
      setUploadedSource({ name:file.name, size:file.size, type:file.type, content, extractionMethod, sheetName, category:categoryFor(file.type, file.name) });
      setConfig(c => ({ ...c, title: c.title || file.name.replace(/\.[^.]+$/, '') }));
      setPasteMode(false);
    } catch(e) { setError(e instanceof Error ? e.message : 'Failed to read file.'); }
  }, [parseFile]);

  const runAnalysis = useCallback(async () => {
    const content = pasteMode ? pastedText : uploadedSource?.content || '';
    if (!content.trim()) { setError('Please upload a file or paste text first.'); return; }
    const title = config.title || uploadedSource?.name?.replace(/\.[^.]+$/, '') || 'Document';
    setError(''); setStep(2); startAnim();
    try {
      const res = await fetch('/api/ai/document-visualizer', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ title, content, sourceType: pasteMode ? 'paste' : 'upload', depth: config.depth }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'Analysis failed.');
      stopAnim();
      setResult(payload); setInteractiveTable(payload.table || null);
      await new Promise(r => setTimeout(r, 500));
      setStep(3); setActiveTab('overview');
    } catch(e) {
      stopAnim(); setError(e instanceof Error ? e.message : 'Analysis failed.'); setStep(1);
    }
  }, [pasteMode, pastedText, uploadedSource, config, startAnim, stopAnim]);

  /* exports */
  const exportCsv = useCallback(() => {
    if (!interactiveTable?.csvContent) return;
    const blob = new Blob([interactiveTable.csvContent], { type:'text/csv' });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href:url, download:`${(result?.title||'report').replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.csv` }).click();
    URL.revokeObjectURL(url);
  }, [interactiveTable, result]);

  const exportJson = useCallback(() => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href:url, download:`${(result.title||'report').replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-data.json` }).click();
    URL.revokeObjectURL(url);
  }, [result]);

  const downloadReport = useCallback(() => {
    if (!result) return;
    const title = result.title || 'Report';
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${title} – Report</title>
<style>*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#fafafa;color:#0f172a;padding:48px}
.wrap{max-width:860px;margin:0 auto}
h1{font-size:28px;font-weight:800;letter-spacing:-.04em;margin-bottom:6px}
.sub{font-size:15px;color:#475569;margin-bottom:32px;line-height:1.7}
.badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;background:#f1f5f9;color:#475569;margin-bottom:12px}
.scores{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:36px}
.sc{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:18px;text-align:center}
.sc-n{font-size:30px;font-weight:800;letter-spacing:-.04em}
.sc-l{font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:.2em;text-transform:uppercase;margin-top:4px}
h2{font-size:14px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#64748b;margin:28px 0 14px}
.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:28px}
.mc{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px}
.mc-l{font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:.18em;text-transform:uppercase;margin-bottom:7px}
.mc-v{font-size:22px;font-weight:800;letter-spacing:-.04em;margin-bottom:5px}
.mc-i{font-size:12px;color:#64748b;line-height:1.6}
.insights{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:28px}
.ic{border-radius:12px;padding:14px;border:1px solid}
.ic.pos{background:#f0fdf4;border-color:#bbf7d0;color:#166534}.ic.warn{background:#fffbeb;border-color:#fde68a;color:#92400e}.ic.neu{background:#f8fafc;border-color:#e2e8f0;color:#0f172a}
.ic strong{display:block;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;margin-bottom:5px;opacity:.65}
.ic p{font-size:12px;line-height:1.6}
.three{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.col{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px}
.col h4{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#64748b;margin-bottom:10px}
.col ul{list-style:none;display:flex;flex-direction:column;gap:6px}
.col li{font-size:12px;color:#475569;background:#f8fafc;padding:8px 10px;border-radius:8px;line-height:1.5}
.foot{text-align:center;margin-top:40px;padding-top:18px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8}
@media print{body{padding:24px}}
</style></head><body><div class="wrap">
<span class="badge">${result.documentType}</span>
<h1>${title}</h1>
<p class="sub">${result.executiveSummary}</p>
<div class="scores">
  <div class="sc"><div class="sc-n">${result.confidenceScore}</div><div class="sc-l">Confidence</div></div>
  <div class="sc"><div class="sc-n">${result.charts.length}</div><div class="sc-l">Charts</div></div>
  <div class="sc"><div class="sc-n">${result.keyMetrics.length}</div><div class="sc-l">Metrics</div></div>
  <div class="sc"><div class="sc-n">${result.deepInsights.length}</div><div class="sc-l">Insights</div></div>
</div>
<h2>Key Metrics</h2>
<div class="metrics">${result.keyMetrics.slice(0,6).map(m=>`<div class="mc"><div class="mc-l">${m.label}</div><div class="mc-v">${m.value}</div><div class="mc-i">${m.insight}</div></div>`).join('')}</div>
<h2>Deep Insights</h2>
<div class="insights">${result.deepInsights.slice(0,6).map(i=>`<div class="ic ${i.tone}"><strong>${i.title}</strong><p>${i.detail}</p></div>`).join('')}</div>
<div class="three">
  <div class="col"><h4>Highlights</h4><ul>${result.highlights.slice(0,5).map(h=>`<li>${h}</li>`).join('')}</ul></div>
  <div class="col"><h4>Anomalies</h4><ul>${(result.anomalies.length?result.anomalies:['None detected.']).slice(0,5).map(a=>`<li>${a}</li>`).join('')}</ul></div>
  <div class="col"><h4>Recommendations</h4><ul>${result.recommendations.slice(0,5).map(r=>`<li>${r}</li>`).join('')}</ul></div>
</div>
<p class="foot">Generated by Document Visualizer · ${new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</p>
</div></body></html>`;
    const blob = new Blob([html], { type:'text/html' });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href:url, download:`${title.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-report.html` }).click();
    URL.revokeObjectURL(url);
  }, [result]);

  const copyText = useCallback(async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.executiveSummary).catch(()=>{});
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }, [result]);

  const readabilityScore = useMemo(() => {
    const m = result?.keyMetrics.find(m => /read/i.test(m.label));
    if (m) { const n = parseInt(m.value); if (!isNaN(n)) return Math.min(100,n); }
    return result ? Math.round(40 + result.confidenceScore * 0.4) : 0;
  }, [result]);

  const sentimentScore = useMemo(() => {
    const pos = result?.deepInsights.filter(i => i.tone === 'positive').length || 0;
    const total = result?.deepInsights.length || 1;
    return result ? Math.round(50 + (pos / total) * 40) : 0;
  }, [result]);

  if (!open) return null;

  const canGo = pasteMode ? pastedText.trim().length > 20 : !!uploadedSource;

  /* ─────────────── STEP 0: Upload ─────────────── */
  const step0 = (
    <div style={{ display:'flex', flexDirection:'column', gap:28 }}>
      <div style={{ textAlign:'center' }}>
        <p style={{ fontSize:11, fontWeight:700, color:T.mute, letterSpacing:'0.24em', textTransform:'uppercase', marginBottom:10 }}>Step 1 of 4</p>
        <h2 style={{ fontSize:24, fontWeight:800, color:T.hi, letterSpacing:'-0.04em', marginBottom:8 }}>Upload your document</h2>
        <p style={{ fontSize:14, color:T.low, lineHeight:1.65 }}>Drop any file or paste raw text. We extract meaning, surface insights, and build charts — automatically.</p>
      </div>

      {!pasteMode && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); void handleFiles(e.dataTransfer.files); }}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `1.5px dashed ${dragging ? 'rgba(255,255,255,0.55)' : T.border}`,
            borderRadius: 20,
            padding: uploadedSource ? '28px 24px' : '52px 32px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragging ? 'rgba(255,255,255,0.05)' : T.glass,
            backdropFilter: 'blur(8px)',
            transition: 'all 0.2s',
          }}
        >
          {uploadedSource ? (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
              <div style={{ width:48, height:48, borderRadius:14, background:'rgba(255,255,255,0.08)', border:`1px solid ${T.borderMd}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <CheckCircle2 size={22} style={{ color:'rgba(255,255,255,0.75)' }}/>
              </div>
              <div>
                <p style={{ fontSize:14, fontWeight:700, color:T.hi, marginBottom:4 }}>{uploadedSource.name}</p>
                <p style={{ fontSize:12, color:T.low }}>
                  {fmt(uploadedSource.size)} · {uploadedSource.category}
                  {uploadedSource.sheetName ? ` · ${uploadedSource.sheetName}` : ''}
                </p>
              </div>
              <button onClick={e => { e.stopPropagation(); setUploadedSource(null); }}
                style={{ fontSize:11, color:T.mute, background:'none', border:'none', cursor:'pointer' }}>
                Remove ×
              </button>
            </div>
          ) : (
            <>
              <div style={{ width:56, height:56, borderRadius:18, background:T.glassMd, border:`1px solid ${T.borderMd}`, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 18px' }}>
                <Upload size={22} style={{ color:T.mid }}/>
              </div>
              <p style={{ fontSize:15, fontWeight:700, color:T.hi, marginBottom:5 }}>Drop file here</p>
              <p style={{ fontSize:13, color:T.low, marginBottom:20 }}>or click to browse</p>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, justifyContent:'center' }}>
                {FILE_TYPES.map(ext => (
                  <span key={ext} style={{ padding:'3px 9px', borderRadius:6, border:`1px solid ${T.border}`, background:T.glass, fontSize:10, fontWeight:700, color:T.low, letterSpacing:'.1em' }}>{ext}</span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {pasteMode && (
        <div>
          <textarea
            value={pastedText}
            onChange={e => setPastedText(e.target.value)}
            placeholder="Paste CSV rows, report text, JSON data, or any document content…"
            autoFocus
            style={{ ...glassInput, resize:'vertical', minHeight:200, lineHeight:1.7, borderRadius:14, padding:'14px 16px' }}
          />
          <p style={{ fontSize:11, color:T.mute, textAlign:'right', marginTop:6 }}>{pastedText.length.toLocaleString()} characters</p>
        </div>
      )}

      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ flex:1, height:1, background:T.border }}/>
        <button
          onClick={() => { setPasteMode(m => !m); setUploadedSource(null); setError(''); }}
          style={{ fontSize:12, color:T.low, background:T.glass, border:`1px solid ${T.border}`, borderRadius:8, padding:'5px 14px', cursor:'pointer', backdropFilter:'blur(8px)' }}>
          {pasteMode ? '↑ Upload a file instead' : '↓ Paste text instead'}
        </button>
        <div style={{ flex:1, height:1, background:T.border }}/>
      </div>

      {error && (
        <div style={{ fontSize:13, color:'rgba(252,165,165,0.9)', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.18)', borderRadius:12, padding:'10px 16px' }}>{error}</div>
      )}

      <input ref={fileRef} type="file" className="sr-only"
        accept=".xlsx,.xls,.csv,.tsv,.pdf,.doc,.docx,.txt,.json,.xml,.html,.md"
        onChange={e => void handleFiles(e.target.files)}/>

      <div style={{ display:'flex', justifyContent:'flex-end' }}>
        <button
          onClick={() => canGo && setStep(1)}
          disabled={!canGo}
          style={{
            display:'inline-flex', alignItems:'center', gap:8,
            padding:'12px 28px', borderRadius:14, border:'none', cursor: canGo ? 'pointer' : 'not-allowed',
            background: canGo ? 'rgba(255,255,255,0.92)' : T.glassMd,
            color: canGo ? '#0c0c0f' : T.mute,
            fontSize:14, fontWeight:700, letterSpacing:'-0.01em',
            transition:'all 0.2s',
          }}>
          Continue <ChevronRight size={16}/>
        </button>
      </div>
    </div>
  );

  /* ─────────────── STEP 1: Configure ─────────────── */
  const step1 = (
    <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
      <div style={{ textAlign:'center' }}>
        <p style={{ fontSize:11, fontWeight:700, color:T.mute, letterSpacing:'0.24em', textTransform:'uppercase', marginBottom:10 }}>Step 2 of 4</p>
        <h2 style={{ fontSize:24, fontWeight:800, color:T.hi, letterSpacing:'-0.04em', marginBottom:8 }}>Configure analysis</h2>
        <p style={{ fontSize:14, color:T.low }}>Choose depth and what the AI should focus on.</p>
      </div>

      {/* Title */}
      <div>
        <label style={{ display:'block', fontSize:10, fontWeight:700, color:T.mute, letterSpacing:'0.20em', textTransform:'uppercase', marginBottom:8 }}>Document Title</label>
        <input value={config.title} onChange={e => setConfig(c => ({ ...c, title:e.target.value }))}
          placeholder="e.g. Q3 Financial Summary, HR Policy Report…"
          style={glassInput}/>
      </div>

      {/* Depth */}
      <div>
        <label style={{ display:'block', fontSize:10, fontWeight:700, color:T.mute, letterSpacing:'0.20em', textTransform:'uppercase', marginBottom:12 }}>Analysis Depth</label>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
          {(['quick','standard','deep'] as const).map(d => {
            const meta = {
              quick:    { label:'Quick',    desc:'Core metrics in seconds',         icon:Zap      },
              standard: { label:'Standard', desc:'Full charts, insights & scoring', icon:BarChart3 },
              deep:     { label:'Deep',     desc:'Exhaustive analysis, all signals',icon:Brain    },
            }[d];
            const on = config.depth === d;
            return (
              <button key={d} onClick={() => setConfig(c => ({ ...c, depth:d }))}
                style={{
                  display:'flex', flexDirection:'column', gap:10, padding:'14px 16px', borderRadius:14,
                  textAlign:'left', cursor:'pointer', transition:'all 0.18s',
                  background: on ? 'rgba(255,255,255,0.10)' : T.glass,
                  border: `1px solid ${on ? T.borderMd : T.border}`,
                  backdropFilter:'blur(8px)',
                }}>
                <meta.icon size={16} style={{ color: on ? T.hi : T.low }}/>
                <div>
                  <p style={{ fontSize:13, fontWeight:700, color: on ? T.hi : T.mid, marginBottom:3 }}>{meta.label}</p>
                  <p style={{ fontSize:11, color:T.mute, lineHeight:1.5 }}>{meta.desc}</p>
                </div>
                {on && <div style={{ height:2, borderRadius:1, background:'rgba(255,255,255,0.55)', marginTop:2 }}/>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Focus */}
      <div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <label style={{ fontSize:10, fontWeight:700, color:T.mute, letterSpacing:'0.20em', textTransform:'uppercase' }}>Focus Areas</label>
          <button onClick={() => setConfig(c => ({ ...c, focus:Object.fromEntries(FOCUS_OPTIONS.map(o=>[o.id,true])) }))}
            style={{ fontSize:11, color:T.low, background:'none', border:'none', cursor:'pointer' }}>Select all</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:7 }}>
          {FOCUS_OPTIONS.map(opt => {
            const on = config.focus[opt.id] !== false;
            return (
              <button key={opt.id} onClick={() => setConfig(c => ({ ...c, focus:{...c.focus,[opt.id]:!on} }))}
                style={{
                  display:'flex', alignItems:'center', gap:10, padding:'11px 13px', borderRadius:12,
                  textAlign:'left', cursor:'pointer', transition:'all 0.15s',
                  background: on ? T.glassMd : T.glass,
                  border: `1px solid ${on ? T.borderMd : T.border}`,
                }}>
                <div style={{ width:16, height:16, borderRadius:4, border:`1.5px solid ${on ? T.hi : T.low}`, background: on ? 'rgba(255,255,255,0.90)' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 0.15s' }}>
                  {on && <Check size={10} style={{ color:'#0c0c0f' }}/>}
                </div>
                <opt.icon size={12} style={{ color: on ? T.mid : T.mute, flexShrink:0 }}/>
                <div style={{ minWidth:0 }}>
                  <p style={{ fontSize:12, fontWeight:600, color: on ? T.hi : T.low, marginBottom:1 }}>{opt.label}</p>
                  <p style={{ fontSize:10, color:T.mute, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{opt.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {error && <div style={{ fontSize:13, color:'rgba(252,165,165,0.9)', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.18)', borderRadius:12, padding:'10px 16px' }}>{error}</div>}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingTop:4 }}>
        <button onClick={() => { setStep(0); setError(''); }}
          style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'10px 18px', borderRadius:12, background:T.glass, color:T.mid, fontSize:13, fontWeight:600, border:`1px solid ${T.border}`, cursor:'pointer', backdropFilter:'blur(8px)' }}>
          <ArrowLeft size={14}/> Back
        </button>
        <button onClick={() => void runAnalysis()}
          style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'12px 32px', borderRadius:14, background:'rgba(255,255,255,0.92)', color:'#0c0c0f', fontSize:14, fontWeight:700, border:'none', cursor:'pointer', letterSpacing:'-0.01em' }}>
          <Sparkles size={14}/> Run Analysis
        </button>
      </div>
    </div>
  );

  /* ─────────────── STEP 2: Analyzing ─────────────── */
  const step2 = (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:360, gap:36, textAlign:'center' }}>
      {/* Animated rings */}
      <div style={{ position:'relative', width:96, height:96 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{
            position:'absolute',
            inset: i * 10,
            borderRadius:'50%',
            border: `1.5px solid rgba(255,255,255,${0.10 + i * 0.08})`,
            animation:`spin ${1.8 - i * 0.3}s linear infinite ${i % 2 === 1 ? 'reverse' : ''}`,
          }}/>
        ))}
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Brain size={26} style={{ color:'rgba(255,255,255,0.55)' }}/>
        </div>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>

      <div>
        <p style={{ fontSize:11, fontWeight:700, color:T.mute, letterSpacing:'0.24em', textTransform:'uppercase', marginBottom:10 }}>Step 3 of 4</p>
        <h2 style={{ fontSize:22, fontWeight:800, color:T.hi, letterSpacing:'-0.04em', marginBottom:10 }}>Analysing document</h2>
        <p style={{ fontSize:14, color:T.low, minHeight:22 }}>{processingMsg}</p>
      </div>

      {/* Progress bar — the only coloured element on this screen */}
      <div style={{ width:'100%', maxWidth:400 }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
          <span style={{ fontSize:10, fontWeight:700, color:T.mute, letterSpacing:'0.18em', textTransform:'uppercase' }}>Progress</span>
          <span style={{ fontSize:11, fontWeight:700, color:T.mid }}>{Math.round(processingPct)}%</span>
        </div>
        <div style={{ height:5, borderRadius:3, background:'rgba(255,255,255,0.07)', overflow:'hidden' }}>
          <div style={{ height:'100%', borderRadius:3, width:`${processingPct}%`,
            background:'linear-gradient(90deg,rgba(255,255,255,0.40),rgba(255,255,255,0.85))',
            transition:'width 0.7s ease',
          }}/>
        </div>
        {/* Stepped milestones */}
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:10 }}>
          {['Parse','Extract','Analyse','Generate','Finalise'].map((s,i) => {
            const reached = processingPct >= i * 20;
            return (
              <div key={s} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                <div style={{ width:6, height:6, borderRadius:'50%', background: reached ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.12)', transition:'background 0.4s' }}/>
                <span style={{ fontSize:9, color: reached ? T.low : T.mute, letterSpacing:'.06em' }}>{s}</span>
              </div>
            );
          })}
        </div>
      </div>

      {(uploadedSource || pastedText) && (
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 20px', borderRadius:14, ...glassCard }}>
          <FileText size={14} style={{ color:T.low, flexShrink:0 }}/>
          <div style={{ textAlign:'left' }}>
            <p style={{ fontSize:13, fontWeight:600, color:T.mid }}>{uploadedSource ? uploadedSource.name : 'Pasted text'}</p>
            <p style={{ fontSize:11, color:T.mute, marginTop:2 }}>
              {uploadedSource ? `${fmt(uploadedSource.size)} · ${uploadedSource.category}` : `${pastedText.length.toLocaleString()} chars`}
            </p>
          </div>
        </div>
      )}

      <p style={{ fontSize:12, color:T.mute }}>Large documents may take up to 30 seconds</p>
    </div>
  );

  /* ─────────────── STEP 3: Report ─────────────── */
  const reportTabs = ['overview','charts','insights','data'] as const;
  const step3 = result ? (
    <div style={{ display:'flex', flexDirection:'column', gap:0 }}>

      {/* Doc header */}
      <div style={{ paddingBottom:20, borderBottom:`1px solid ${T.border}`, marginBottom:24 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>
          <div style={{ minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:8 }}>
              <span style={{ padding:'2px 9px', borderRadius:20, fontSize:10, fontWeight:700, letterSpacing:'0.14em', textTransform:'uppercase', background:T.glassMd, border:`1px solid ${T.borderMd}`, color:T.mid }}>{result.documentType}</span>
              <span style={{ padding:'2px 9px', borderRadius:20, fontSize:10, fontWeight:700, letterSpacing:'0.14em', textTransform:'uppercase', background:T.glass, border:`1px solid ${T.border}`, color:T.low }}>{result.provider}</span>
            </div>
            <h2 style={{ fontSize:20, fontWeight:800, color:T.hi, letterSpacing:'-0.035em' }}>{result.title}</h2>
          </div>
          {/* Action buttons */}
          <div style={{ display:'flex', alignItems:'center', gap:7, flexShrink:0, flexWrap:'wrap' }}>
            {[
              { label: copied ? 'Copied' : 'Copy',   icon: copied ? Check : Copy,        fn: copyText   },
              { label: 'Report', icon: Download,        fn: downloadReport },
              { label: 'CSV',    icon: FileSpreadsheet, fn: exportCsv, disabled: !interactiveTable?.csvContent },
              { label: 'JSON',   icon: File,            fn: exportJson },
            ].map(({ label, icon:Icon, fn, disabled }) => (
              <button key={label} onClick={fn} disabled={!!disabled}
                style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'7px 13px', borderRadius:9, ...glassCard, color: disabled ? T.mute : T.mid, fontSize:12, fontWeight:600, cursor: disabled ? 'not-allowed' : 'pointer' }}>
                <Icon size={12}/> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Score rings — colour lives only here */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:28, padding:'22px 20px', ...glassCard }}>
        <ScoreRing value={result.confidenceScore} label="Confidence" color="rgba(255,255,255,0.80)"/>
        <ScoreRing value={readabilityScore}        label="Readability" color="rgba(255,255,255,0.55)"/>
        <ScoreRing value={Math.min(100, result.charts.length * 12 + result.keyMetrics.length * 6)} label="Data Richness" color="rgba(255,255,255,0.38)"/>
        <ScoreRing value={sentimentScore}          label="Sentiment"   color="rgba(255,255,255,0.22)"/>
      </div>

      {/* Report tabs */}
      <div style={{ display:'flex', gap:3, marginBottom:20, padding:'3px', background:T.glass, borderRadius:12, border:`1px solid ${T.border}` }}>
        {reportTabs.map(t => {
          const labels: Record<string,string> = { overview:'Overview', charts:`Charts (${result.charts.length})`, insights:`Insights (${result.deepInsights.length})`, data:'Data Table' };
          const icons: Record<string, React.ReactNode> = { overview:<BarChart3 size={12}/>, charts:<BarChart3 size={12}/>, insights:<Lightbulb size={12}/>, data:<Table2 size={12}/> };
          const on = activeTab === t;
          return (
            <button key={t} onClick={() => setActiveTab(t)}
              style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'8px 10px', borderRadius:9, fontSize:12, fontWeight:600, cursor:'pointer', border:'none', transition:'all 0.15s',
                background: on ? T.glassHi : 'transparent',
                color: on ? T.hi : T.low,
              }}>
              {icons[t]} {labels[t]}
            </button>
          );
        })}
      </div>

      {/* Tab: Overview */}
      {activeTab === 'overview' && (
        <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
          {/* Summary */}
          <div style={{ ...glassCard, padding:'16px 20px', border:`1px solid ${T.borderMd}` }}>
            <p style={{ fontSize:10, fontWeight:700, color:T.mute, letterSpacing:'0.20em', textTransform:'uppercase', marginBottom:8 }}>Executive Summary</p>
            <p style={{ fontSize:14, color:T.mid, lineHeight:1.8 }}>{result.executiveSummary}</p>
          </div>
          {/* Metrics */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
            {result.keyMetrics.slice(0,6).map(m => <MetricCard key={m.label} metric={m}/>)}
          </div>
          {/* 3-column lists */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
            {[
              { title:'Highlights',      items: result.highlights,                                          bd:'rgba(255,255,255,0.14)' },
              { title:'Anomalies',       items: result.anomalies.length ? result.anomalies : ['None detected.'], bd:T.border },
              { title:'Recommendations', items: result.recommendations,                                    bd:T.border },
            ].map(col => (
              <div key={col.title} style={{ ...glassCard, border:`1px solid ${col.bd}`, padding:16 }}>
                <p style={{ fontSize:10, fontWeight:700, color:T.mute, letterSpacing:'0.18em', textTransform:'uppercase', marginBottom:12 }}>{col.title}</p>
                <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                  {col.items.slice(0,5).map((item,i) => (
                    <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                      <div style={{ width:4, height:4, borderRadius:'50%', background:T.low, flexShrink:0, marginTop:6 }}/>
                      <p style={{ fontSize:12, color:T.low, lineHeight:1.6 }}>{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Charts */}
      {activeTab === 'charts' && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 }}>
          {result.charts.slice(0,8).map(c => <ChartCard key={c.id} chart={c}/>)}
          {!result.charts.length && <div style={{ gridColumn:'1/-1', textAlign:'center', padding:48, color:T.mute, fontSize:14 }}>No numeric data detected for chart generation.</div>}
        </div>
      )}

      {/* Tab: Insights */}
      {activeTab === 'insights' && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10 }}>
          {result.deepInsights.slice(0,8).map(i => <InsightCard key={i.id} insight={i}/>)}
          {!result.deepInsights.length && <div style={{ gridColumn:'1/-1', textAlign:'center', padding:48, color:T.mute, fontSize:14 }}>No insights generated.</div>}
        </div>
      )}

      {/* Tab: Data */}
      {activeTab === 'data' && (
        interactiveTable?.rows.length ? (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <p style={{ fontSize:13, color:T.low }}>{interactiveTable.rows.length.toLocaleString()} rows · {interactiveTable.columns.length} columns</p>
              <button onClick={exportCsv} style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:9, ...glassCard, color:T.mid, fontSize:12, fontWeight:600, cursor:'pointer' }}>
                <Download size={11}/> Export CSV
              </button>
            </div>
            <div style={{ overflowX:'auto', borderRadius:14, border:`1px solid ${T.border}` }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ borderBottom:`1px solid ${T.border}` }}>
                    {interactiveTable.columns.map(col => (
                      <th key={col.id} style={{ padding:'9px 13px', textAlign:'left', fontSize:10, fontWeight:700, color:T.mute, letterSpacing:'0.16em', textTransform:'uppercase', background:T.glass, whiteSpace:'nowrap' }}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {interactiveTable.rows.slice(0, tableRows).map((row, ri) => (
                    <tr key={row.id} style={{ borderBottom:`1px solid rgba(255,255,255,0.04)`, background: ri % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                      {interactiveTable.columns.map(col => (
                        <td key={col.id} style={{ padding:'8px 13px', color: col.isNumeric ? T.hi : T.mid, fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis' }}>
                          {row.cells[col.index] || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {tableRows < interactiveTable.rows.length && (
              <button onClick={() => setTableRows(n => Math.min(interactiveTable.rows.length, n + 40))}
                style={{ alignSelf:'center', padding:'7px 18px', borderRadius:9, ...glassCard, color:T.mid, fontSize:12, fontWeight:600, cursor:'pointer' }}>
                Show more rows
              </button>
            )}
          </div>
        ) : (
          <div style={{ textAlign:'center', padding:48, color:T.mute, fontSize:14 }}>No table detected. Works best with CSV or spreadsheet uploads.</div>
        )
      )}

      {/* Footer actions */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingTop:20, marginTop:12, borderTop:`1px solid ${T.border}` }}>
        <button onClick={() => { setStep(0); setResult(null); setInteractiveTable(null); setUploadedSource(null); setPastedText(''); setError(''); }}
          style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'9px 18px', borderRadius:11, ...glassCard, color:T.mid, fontSize:13, fontWeight:600, cursor:'pointer' }}>
          <RefreshCw size={13}/> Analyse Another
        </button>
        <button onClick={downloadReport}
          style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'10px 24px', borderRadius:12, background:'rgba(255,255,255,0.90)', color:'#0c0c0f', fontSize:13, fontWeight:700, border:'none', cursor:'pointer' }}>
          <Download size={14}/> Download Full Report
        </button>
      </div>
    </div>
  ) : null;

  /* ─────────────── Modal shell ─────────────── */
  return (
    <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      {/* Blurred backdrop */}
      <div onClick={onClose} style={{
        position:'absolute', inset:0,
        background:'rgba(6,6,10,0.72)',
        backdropFilter:'blur(24px) saturate(0.6)',
        WebkitBackdropFilter:'blur(24px) saturate(0.6)',
      }}/>

      {/* Modal panel — frosted glass */}
      <div style={{
        position:'relative', zIndex:1,
        width:'100%',
        maxWidth: step === 3 ? 880 : 640,
        maxHeight:'91vh',
        background:'rgba(12,12,18,0.88)',
        backdropFilter:'blur(48px) saturate(0.8)',
        WebkitBackdropFilter:'blur(48px) saturate(0.8)',
        border:`1px solid rgba(255,255,255,0.10)`,
        borderRadius:26,
        boxShadow:'0 0 0 1px rgba(255,255,255,0.04) inset, 0 40px 100px rgba(0,0,0,0.75)',
        display:'flex', flexDirection:'column', overflow:'hidden',
        transition:'max-width 0.38s cubic-bezier(0.4,0,0.2,1)',
      }}>

        {/* Header */}
        <div style={{ padding:'17px 22px 15px', borderBottom:`1px solid ${T.border}`, flexShrink:0, backdropFilter:'blur(24px)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:16 }}>
            {/* Brand */}
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:34, height:34, borderRadius:10, background:T.glassMd, border:`1px solid ${T.borderMd}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <BarChart3 size={16} style={{ color:T.mid }}/>
              </div>
              <div>
                <p style={{ fontSize:13, fontWeight:700, color:T.hi, letterSpacing:'-0.02em' }}>Document Visualizer</p>
                <p style={{ fontSize:11, color:T.mute, marginTop:1 }}>AI-powered analysis</p>
              </div>
            </div>

            {/* Step tracker */}
            <div style={{ display:'flex', alignItems:'center', gap:5, flex:1, justifyContent:'center' }}>
              {STEPS.map((s, i) => {
                const done   = i < step;
                const active = i === step;
                return (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <div style={{
                      display:'flex', alignItems:'center', gap:6,
                      padding: active ? '4px 11px' : '4px 7px',
                      borderRadius:20,
                      background: done ? 'rgba(255,255,255,0.08)' : active ? 'rgba(255,255,255,0.12)' : 'transparent',
                      border: `1px solid ${done || active ? T.borderMd : T.border}`,
                      transition:'all 0.25s',
                    }}>
                      {done
                        ? <Check size={10} style={{ color:T.mid }}/>
                        : <span style={{ fontSize:10, fontWeight:800, color: active ? T.hi : T.mute }}>{i+1}</span>
                      }
                      {active && <span style={{ fontSize:11, fontWeight:600, color:T.hi }}>{s.label}</span>}
                    </div>
                    {i < STEPS.length - 1 && <div style={{ width:14, height:1, background:T.border }}/>}
                  </div>
                );
              })}
            </div>

            <button onClick={onClose}
              style={{ width:28, height:28, borderRadius:7, background:T.glass, border:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:T.low, flexShrink:0 }}>
              <X size={14}/>
            </button>
          </div>

          {/* Progress line — the most visible colour signal */}
          <div style={{ marginTop:14, height:2, borderRadius:1, background:'rgba(255,255,255,0.06)' }}>
            <div style={{
              height:'100%', borderRadius:1,
              width:`${((step) / (STEPS.length - 1)) * 100}%`,
              background:'linear-gradient(90deg,rgba(255,255,255,0.25),rgba(255,255,255,0.70))',
              transition:'width 0.5s cubic-bezier(0.4,0,0.2,1)',
            }}/>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:'auto', padding:'28px 26px 24px' }}>
          {step === 0 && step0}
          {step === 1 && step1}
          {step === 2 && step2}
          {step === 3 && step3}
        </div>
      </div>
    </div>
  );
}
