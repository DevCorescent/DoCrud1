'use client';

import { useState } from 'react';
import { 
  Download, 
  RefreshCw, 
  Copy, 
  ChevronDown, 
  Info, 
  ListOrdered, 
  Table as TableIcon, 
  FileText, 
  CheckCircle2, 
  AlertTriangle,
  Search,
  Check
} from 'lucide-react';
import type { AssistantResultCard } from '@/types/doc-assistant';

function downloadTextFile(fileName: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function toPlainText(card: AssistantResultCard) {
  const lines: string[] = [];
  lines.push(card.title);
  lines.push('');
  if (card.shortAnswer) lines.push(card.shortAnswer, '');
  if (card.keyPoints?.length) lines.push('Key points:', ...card.keyPoints.map((k) => `- ${k}`), '');
  if (card.primaryText) lines.push(`${card.primaryTextLabel || 'Output'}:`, card.primaryText, '');
  if (card.detailedExplanation?.length) lines.push('Details:', ...card.detailedExplanation.map((k) => `- ${k}`), '');
  if (card.extractedFacts?.length) lines.push('Extracted facts:', ...card.extractedFacts.map((f) => `- ${f.label}: ${f.value}`), '');
  if (card.recommendations?.length) lines.push('Recommendations:', ...card.recommendations.map((k) => `- ${k}`), '');
  if (card.missingInfo?.length) lines.push('Missing info / limitations:', ...card.missingInfo.map((k) => `- ${k}`), '');
  if (card.disclaimer) lines.push(card.disclaimer);
  return lines.join('\n').trim();
}

export function AssistantResultCardView({
  card,
  onRegenerate,
}: {
  card: AssistantResultCard;
  onRegenerate?: () => void;
}) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  const toggleSection = (id: string) => {
    setExpandedSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const plain = toPlainText(card);
  const hasTable = !!(card.tables && card.tables.length > 0);

  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200/60 bg-white/50 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-black/20">
      {/* Premium Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/50 bg-slate-50/50 px-6 py-4 dark:border-white/10 dark:bg-white/5">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-xl dark:bg-white dark:text-slate-950">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-slate-900 dark:text-white">{card.title}</h3>
            <div className="mt-1 flex items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                Confidence {Math.round(card.confidence || 0)}%
              </div>
              {card.disclaimer && (
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <Info className="h-3 w-3" />
                  Verified
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="group flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 transition-all hover:bg-slate-50 active:scale-95 dark:bg-white/5 dark:text-slate-200 dark:ring-white/10 dark:hover:bg-white/10"
            onClick={() => handleCopy(plain)}
          >
            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4 transition-transform group-hover:scale-110" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          {onRegenerate && (
            <button
              type="button"
              className="flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 transition-all hover:bg-slate-50 active:scale-95 dark:bg-white/5 dark:text-slate-200 dark:ring-white/10 dark:hover:bg-white/10"
              onClick={onRegenerate}
            >
              <RefreshCw className="h-4 w-4" />
              Regenerate
            </button>
          )}
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-lg transition-all hover:scale-105 active:scale-95 dark:bg-white dark:text-slate-900"
            onClick={() => downloadTextFile(`${card.title.replace(/[^\w\- ]+/g, '').slice(0, 40) || 'result'}.txt`, plain)}
            title="Download report"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="px-6 py-6 space-y-4">
        {/* Short Answer - Always Visible */}
        {card.shortAnswer && (
          <div className="relative overflow-hidden rounded-[20px] bg-gradient-to-br from-indigo-500/5 via-purple-500/5 to-blue-500/5 p-5 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
            <div className="absolute top-0 left-0 h-full w-1 bg-indigo-500/30"></div>
            {card.shortAnswer}
          </div>
        )}

        {/* Primary Output Section */}
        {card.primaryText && (
          <SectionItem
            id="primary"
            title={card.primaryTextLabel || 'Output Analysis'}
            icon={<FileText className="h-4 w-4" />}
            isExpanded={expandedSections['primary']}
            onToggle={() => toggleSection('primary')}
          >
            <div className="relative mt-2">
              <button
                onClick={() => handleCopy(card.primaryText || '')}
                className="absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-md transition hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <pre className="max-h-[500px] overflow-auto whitespace-pre-wrap rounded-2xl bg-slate-50/50 p-4 text-[13px] leading-relaxed text-slate-700 dark:bg-black/20 dark:text-slate-300">
                {card.primaryText}
              </pre>
            </div>
          </SectionItem>
        )}

        {/* Key Points */}
        {card.keyPoints?.length && (
          <SectionItem
            id="keypoints"
            title="Key Highlights"
            icon={<ListOrdered className="h-4 w-4" />}
            isExpanded={expandedSections['keypoints']}
            onToggle={() => toggleSection('keypoints')}
          >
            <div className="mt-2 grid gap-3 pt-1">
              {card.keyPoints.map((item, i) => (
                <div key={i} className="flex items-start gap-3 rounded-xl bg-slate-50/80 p-3 text-sm dark:bg-white/5">
                  <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-500">
                    <span className="text-[10px] font-bold">{i + 1}</span>
                  </div>
                  <span className="text-slate-700 dark:text-slate-300">{item}</span>
                </div>
              ))}
            </div>
          </SectionItem>
        )}

        {/* Extracted Facts */}
        {card.extractedFacts?.length && (
          <SectionItem
            id="facts"
            title="Extracted Intelligence"
            icon={<Search className="h-4 w-4" />}
            isExpanded={expandedSections['facts']}
            onToggle={() => toggleSection('facts')}
          >
            <div className="mt-2 grid gap-3 pt-1 sm:grid-cols-2">
              {card.extractedFacts.map((fact, i) => (
                <div key={i} className="rounded-xl border border-slate-200/50 bg-slate-50/30 p-3 dark:border-white/5 dark:bg-white/5">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{fact.label}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{fact.value}</div>
                </div>
              ))}
            </div>
          </SectionItem>
        )}

        {/* Tables */}
        {hasTable && (
          <SectionItem
            id="tables"
            title="Data Matrix"
            icon={<TableIcon className="h-4 w-4" />}
            isExpanded={expandedSections['tables']}
            onToggle={() => toggleSection('tables')}
          >
            <div className="mt-4 space-y-4">
              {card.tables!.map((table, index) => (
                <div key={index} className="overflow-hidden rounded-2xl border border-slate-200/70 dark:border-white/10">
                  {table.title && (
                    <div className="bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:bg-white/5 dark:text-slate-400">
                      {table.title}
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50/50 dark:bg-white/5">
                        <tr>
                          {table.columns.map((c, i) => (
                            <th key={i} className="px-4 py-3 font-bold text-slate-900 dark:text-white">{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                        {table.rows.map((row, ri) => (
                          <tr key={ri} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                            {row.map((cell, ci) => (
                              <td key={ci} className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </SectionItem>
        )}

        {/* Detailed Explanation */}
        {card.detailedExplanation?.length && (
          <SectionItem
            id="details"
            title="Detailed Narrative"
            icon={<FileText className="h-4 w-4" />}
            isExpanded={expandedSections['details']}
            onToggle={() => toggleSection('details')}
          >
            <div className="mt-2 space-y-4 pt-1">
              {card.detailedExplanation.map((item, i) => (
                <div key={i} className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                  {item}
                </div>
              ))}
            </div>
          </SectionItem>
        )}

        {/* Recommendations */}
        {card.recommendations?.length && (
          <SectionItem
            id="recommendations"
            title="Strategic Recommendations"
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
            isExpanded={expandedSections['recommendations']}
            onToggle={() => toggleSection('recommendations')}
            variant="success"
          >
            <div className="mt-2 space-y-3 pt-1">
              {card.recommendations.map((item, i) => (
                <div key={i} className="flex items-start gap-3 rounded-xl bg-emerald-50/50 p-4 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 opacity-60" />
                  {item}
                </div>
              ))}
            </div>
          </SectionItem>
        )}

        {/* Missing Info */}
        {card.missingInfo?.length && (
          <SectionItem
            id="missing"
            title="Critical Gaps"
            icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
            isExpanded={expandedSections['missing']}
            onToggle={() => toggleSection('missing')}
            variant="warning"
          >
            <div className="mt-2 space-y-3 pt-1">
              {card.missingInfo.map((item, i) => (
                <div key={i} className="flex items-start gap-3 rounded-xl bg-amber-50/50 p-4 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 opacity-60" />
                  {item}
                </div>
              ))}
            </div>
          </SectionItem>
        )}

        {/* Disclaimer */}
        {card.disclaimer && (
          <div className="mt-6 flex items-start gap-3 rounded-2xl bg-slate-50 px-5 py-4 dark:bg-white/5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              {card.disclaimer}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionItem({ 
  id, 
  title, 
  icon, 
  isExpanded, 
  onToggle, 
  children,
  variant = 'default'
}: { 
  id: string; 
  title: string; 
  icon: React.ReactNode; 
  isExpanded: boolean; 
  onToggle: () => void;
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning';
}) {
  const getHeaderStyle = () => {
    if (isExpanded) {
      if (variant === 'success') return 'bg-emerald-50 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-100';
      if (variant === 'warning') return 'bg-amber-50 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100';
      return 'bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-white';
    }
    return 'hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300';
  };

  return (
    <div className={`overflow-hidden rounded-2xl border transition-all duration-300 ${isExpanded ? 'border-slate-200/60 dark:border-white/20 ring-1 ring-slate-100 dark:ring-white/5' : 'border-slate-200/50 dark:border-white/10'}`}>
      <button
        onClick={onToggle}
        className={`flex w-full items-center justify-between px-5 py-4 transition-colors ${getHeaderStyle()}`}
      >
        <div className="flex items-center gap-3">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${isExpanded ? 'bg-white shadow-sm dark:bg-white/10' : 'bg-slate-100 dark:bg-white/5'}`}>
            {icon}
          </div>
          <span className="text-xs font-black uppercase tracking-[0.15em]">{title}</span>
        </div>
        <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
      </button>
      
      <div 
        className={`overflow-hidden transition-all duration-500 ease-in-out ${isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="px-5 pb-5">
          {children}
        </div>
      </div>
    </div>
  );
}

const Sparkles = ({ className }: { className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2.5" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    <path d="M5 3v4" />
    <path d="M19 17v4" />
    <path d="M3 5h4" />
    <path d="M17 19h4" />
  </svg>
);
