import { generateAiText, getAiModelName, isAiConfigured, normalizeAiList, normalizeAiText, parseStructuredJson } from '@/lib/server/ai';
import { buildStructuredInsights, preserveDocumentStructure, stripHtmlPreserveStructure } from '@/lib/document-parser-analysis';

export type DoxpertSourceType = 'upload' | 'paste' | 'preview';

export type DoxpertResponse = {
  title: string;
  sourceType: DoxpertSourceType;
  extractedContent: string;
  extractedCharacterCount: number;
  trustScore: number;
  trustNote: string;
  evidenceSignals: string[];
  summary: string;
  tone: string;
  sentiment: string;
  score: {
    overall: number;
    clarity: number;
    compliance: number;
    completeness: number;
    professionalism: number;
    riskExposure: number;
    rationale: string;
  };
  lowScoreAreas: Array<{ area: string; score: number; why: string }>;
  risks: string[];
  mitigations: string[];
  harmWarnings: string[];
  obligations: string[];
  recommendedAdditions: string[];
  replySuggestions: string[];
  advisorReply: string;
  provider: string;
  model: string;
};

type DoxpertHeuristicSignals = {
  length: number;
  hasHeadings: boolean;
  hasDates: boolean;
  hasAmounts: boolean;
  hasEmailOrPhone: boolean;
  hasPartiesCue: boolean;
  hasPaymentCue: boolean;
  hasTermCue: boolean;
  hasTerminationCue: boolean;
  hasConfidentialityCue: boolean;
  hasGoverningLawCue: boolean;
  hasDisputeResolutionCue: boolean;
  hasLimitationOfLiabilityCue: boolean;
  hasIndemnityCue: boolean;
  highRiskLanguageHits: number;
};

function buildHeuristicSignals(content: string): DoxpertHeuristicSignals {
  const hasHeadings = /(^|\n)\s*[A-Za-z0-9][A-Za-z0-9 \-]{2,60}\s*\n/.test(content);
  const hasDates = /\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/i.test(content);
  const hasAmounts = /(?:₹|\$|€|£|inr|usd|eur|gbp)\s*\d|(\b\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?\b)/i.test(content);
  const hasEmailOrPhone = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(content) || /\b(\+?\d{1,3}[\s-]?)?\d{9,12}\b/.test(content);

  const cue = (re: RegExp) => re.test(content);
  const highRiskLanguage = [
    /unlimited liability/i,
    /sole discretion/i,
    /without (any )?liability/i,
    /irrevocable/i,
    /\bwaive(?:s|d)?\b/i,
    /in perpetuity/i,
    /non-refundable/i,
  ];

  return {
    length: content.length,
    hasHeadings,
    hasDates,
    hasAmounts,
    hasEmailOrPhone,
    hasPartiesCue: cue(/\b(between|party|parties|client|vendor|service provider|employer|employee|company)\b/i),
    hasPaymentCue: cue(/\b(invoice|payment|fees|consideration|charges|billing|net\s*\d+|due date)\b/i),
    hasTermCue: cue(/\b(effective date|term\b|duration|validity|renewal)\b/i),
    hasTerminationCue: cue(/\b(terminate|termination|notice period|breach|cure period)\b/i),
    hasConfidentialityCue: cue(/\b(confidential|nda|non-disclosure|proprietary information)\b/i),
    hasGoverningLawCue: cue(/\b(governing law|jurisdiction|venue|applicable law)\b/i),
    hasDisputeResolutionCue: cue(/\b(arbitration|dispute resolution|mediation)\b/i),
    hasLimitationOfLiabilityCue: cue(/\b(limitation of liability|liability cap)\b/i),
    hasIndemnityCue: cue(/\b(indemnif|hold harmless)\b/i),
    highRiskLanguageHits: highRiskLanguage.reduce((sum, re) => (re.test(content) ? sum + 1 : sum), 0),
  };
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoresLookSuspicious(score: DoxpertResponse['score']) {
  const values = [score.overall, score.clarity, score.compliance, score.completeness, score.professionalism, score.riskExposure];
  const min = Math.min(...values);
  const max = Math.max(...values);
  return max - min <= 3;
}

function toScore(value: unknown, fallback: number) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

export function normalizeDoxpertContent(rawContent: string) {
  return preserveDocumentStructure(stripHtmlPreserveStructure(rawContent)).slice(0, 22000);
}

export function fallbackDoxpertAnalysis(title: string, content: string, sourceType: DoxpertSourceType = 'paste'): DoxpertResponse {
  const base = buildStructuredInsights(content, title);
  const evidenceSignals = [
    `Analyzed ${content.length.toLocaleString()} characters of normalized document text.`,
    `Detected tone as ${base.tone} from the current language patterns.`,
    `Scoring was derived from structure, clause presence, obligations, and visible governance cues.`,
  ];
  const lowScoreAreas = [
    { area: 'clarity', score: base.score.clarity, why: base.score.clarity < 75 ? 'Language or structure may still create interpretation gaps.' : 'Clarity is in a healthy range.' },
    { area: 'compliance', score: base.score.compliance, why: base.score.compliance < 75 ? 'Core governance, legal, or protection clauses look underdeveloped.' : 'Compliance language appears reasonably visible.' },
    { area: 'completeness', score: base.score.completeness, why: base.score.completeness < 75 ? 'Material details, responsibilities, or timelines may be missing.' : 'The document covers most expected business details.' },
    { area: 'professionalism', score: base.score.professionalism, why: base.score.professionalism < 75 ? 'Tone or presentation may need refinement before circulation.' : 'The presentation appears business-ready.' },
  ].sort((left, right) => left.score - right.score);

  const harmWarnings = [
    ...(base.score.riskExposure >= 65 ? ['High visible risk exposure. Review liability, termination, and approval language before acceptance.'] : []),
    ...(base.score.compliance < 60 ? ['Governance and protection language appears weak enough to create compliance or enforcement risk.'] : []),
    ...(base.score.completeness < 60 ? ['Important commercial or operational details may be missing, which could harm the user if the document is relied upon as-is.'] : []),
  ];

  const recommendedAdditions = [
    ...(base.score.clarity < 75 ? ['Add a clearer purpose section, defined responsibilities, and simple decision ownership language.'] : []),
    ...(base.score.compliance < 75 ? ['Insert confidentiality, data handling, liability, and approval clauses aligned to your policy baseline.'] : []),
    ...(base.score.completeness < 75 ? ['Add dates, deliverables, payment/consideration terms, renewal/termination triggers, and escalation rules.'] : []),
    ...(base.score.professionalism < 75 ? ['Refine the tone, tighten sentence length, and remove vague or emotional wording before sending.'] : []),
  ];

  const replySuggestions = [
    'Please clarify the missing obligations, timelines, and approval ownership before we proceed.',
    'We would like stronger confidentiality, termination, and liability language before accepting this version.',
    'Please share a revised draft with clearer commercial scope and responsibility allocation.',
  ];

  const sentiment = base.tone.includes('High-pressure')
    ? 'Cautious'
    : base.tone.includes('Collaborative')
      ? 'Constructive'
      : 'Formal';

  return {
    title,
    sourceType,
    extractedContent: content,
    extractedCharacterCount: content.length,
    trustScore: Math.max(58, Math.min(92, Math.round((base.score.overall + (100 - base.score.riskExposure)) / 2))),
    trustNote: 'This report is grounded in the text currently visible to DoXpert. Accuracy is strongest when the pasted text is complete, clean, and close to the final document version.',
    evidenceSignals,
    summary: base.summary,
    tone: base.tone,
    sentiment,
    score: base.score,
    lowScoreAreas,
    risks: base.risks,
    mitigations: base.mitigations,
    harmWarnings,
    obligations: base.obligations,
    recommendedAdditions,
    replySuggestions,
    advisorReply: harmWarnings.length > 0
      ? 'This document needs review before acceptance. Focus first on the weakest score areas and the highlighted harm warnings.'
      : 'This document looks operationally usable, but you should still refine the weakest scoring areas before final circulation.',
    provider: 'Fallback parser',
    model: 'local-structured-analysis',
  };
}

export async function analyzeDoxpertContent({
  title,
  rawContent,
  question,
  sourceType,
}: {
  title: string;
  rawContent: string;
  question?: string;
  sourceType?: DoxpertSourceType;
}) {
  const normalizedContent = normalizeDoxpertContent(rawContent);
  if (!normalizedContent) {
    throw new Error('No readable text could be extracted from this document.');
  }

  const finalSourceType = sourceType || 'paste';
  const heuristicSignals = buildHeuristicSignals(normalizedContent);
  if (!isAiConfigured()) {
    return fallbackDoxpertAnalysis(title, normalizedContent, finalSourceType);
  }

  const raw = await generateAiText([
    {
      role: 'system',
      content: [
        'You are DoXpert, an intelligent document reader and business risk advisor.',
        'Review the document carefully and return strict JSON only.',
        'Be strict: scores must be earned from the text, not guessed.',
        'Do not reuse the same score across categories; scores should reflect what is present/missing.',
        'When you claim a risk or weakness, tie it to concrete language you saw in the content.',
        'Output keys: trustScore, trustNote, evidenceSignals, summary, tone, sentiment, score, lowScoreAreas, risks, mitigations, harmWarnings, obligations, recommendedAdditions, replySuggestions, advisorReply.',
        'score must contain overall, clarity, compliance, completeness, professionalism, riskExposure, rationale.',
        'lowScoreAreas must be an array of objects with area, score, why.',
        'evidenceSignals must explain what features in the text drove the report and why the user can rely on the analysis with proper review.',
        'harmWarnings must explicitly warn if the document can harm the user commercially, legally, operationally, or reputationally.',
        'replySuggestions must be short, professional, and safe to send back to the counterparty.',
        'recommendedAdditions must target weak score areas specifically.',
        'Be practical, conservative, and document-aware.',
      ].join(' '),
    },
    {
      role: 'user',
      content: JSON.stringify({
        title,
        sourceType: finalSourceType,
        question: question || 'Provide full analysis, risk advice, suggested reply positions, and improvement actions.',
        heuristicSignals,
        content: normalizedContent.slice(0, 15000),
      }),
    },
  ]);

  const parsed = parseStructuredJson<{
    trustScore?: unknown;
    trustNote?: unknown;
    evidenceSignals?: unknown;
    summary?: unknown;
    tone?: unknown;
    sentiment?: unknown;
    score?: Record<string, unknown>;
    lowScoreAreas?: Array<Record<string, unknown>>;
    risks?: unknown;
    mitigations?: unknown;
    harmWarnings?: unknown;
    obligations?: unknown;
    recommendedAdditions?: unknown;
    replySuggestions?: unknown;
    advisorReply?: unknown;
  }>(raw);

  const fallback = fallbackDoxpertAnalysis(title, normalizedContent, finalSourceType);
  const response = {
    title,
    sourceType: finalSourceType,
    extractedContent: normalizedContent,
    extractedCharacterCount: normalizedContent.length,
    trustScore: toScore(parsed.trustScore, fallback.trustScore),
    trustNote: normalizeAiText(parsed.trustNote) || fallback.trustNote,
    evidenceSignals: normalizeAiList(parsed.evidenceSignals, 5),
    summary: normalizeAiText(parsed.summary) || fallback.summary,
    tone: normalizeAiText(parsed.tone) || fallback.tone,
    sentiment: normalizeAiText(parsed.sentiment) || fallback.sentiment,
    score: {
      overall: toScore(parsed.score?.overall, fallback.score.overall),
      clarity: toScore(parsed.score?.clarity, fallback.score.clarity),
      compliance: toScore(parsed.score?.compliance, fallback.score.compliance),
      completeness: toScore(parsed.score?.completeness, fallback.score.completeness),
      professionalism: toScore(parsed.score?.professionalism, fallback.score.professionalism),
      riskExposure: toScore(parsed.score?.riskExposure, fallback.score.riskExposure),
      rationale: normalizeAiText(parsed.score?.rationale) || fallback.score.rationale,
    },
    lowScoreAreas: Array.isArray(parsed.lowScoreAreas) && parsed.lowScoreAreas.length > 0
      ? parsed.lowScoreAreas.slice(0, 4).map((item, index) => ({
          area: normalizeAiText(item.area) || fallback.lowScoreAreas[index]?.area || 'unknown',
          score: toScore(item.score, fallback.lowScoreAreas[index]?.score || 0),
          why: normalizeAiText(item.why) || fallback.lowScoreAreas[index]?.why || '',
        }))
      : fallback.lowScoreAreas,
    risks: normalizeAiList(parsed.risks, 6),
    mitigations: normalizeAiList(parsed.mitigations, 6),
    harmWarnings: normalizeAiList(parsed.harmWarnings, 5),
    obligations: normalizeAiList(parsed.obligations, 6),
    recommendedAdditions: normalizeAiList(parsed.recommendedAdditions, 6),
    replySuggestions: normalizeAiList(parsed.replySuggestions, 5),
    advisorReply: normalizeAiText(parsed.advisorReply) || fallback.advisorReply,
    provider: 'Groq',
    model: getAiModelName(),
  } satisfies DoxpertResponse;

  if (scoresLookSuspicious(response.score)) {
    return {
      ...response,
      score: {
        overall: clampScore((response.score.overall + fallback.score.overall) / 2),
        clarity: clampScore((response.score.clarity + fallback.score.clarity) / 2),
        compliance: clampScore((response.score.compliance + fallback.score.compliance) / 2),
        completeness: clampScore((response.score.completeness + fallback.score.completeness) / 2),
        professionalism: clampScore((response.score.professionalism + fallback.score.professionalism) / 2),
        riskExposure: clampScore((response.score.riskExposure + fallback.score.riskExposure) / 2),
        rationale: response.score.rationale || fallback.score.rationale,
      },
      trustScore: heuristicSignals.length < 400 ? Math.min(response.trustScore, 70) : response.trustScore,
      trustNote: response.trustNote || fallback.trustNote,
      evidenceSignals: response.evidenceSignals.length ? response.evidenceSignals : fallback.evidenceSignals,
      provider: response.provider,
      model: response.model,
    } satisfies DoxpertResponse;
  }

  if (heuristicSignals.length < 400 && response.trustScore > 70) {
    return { ...response, trustScore: 70 };
  }

  return response;
}
