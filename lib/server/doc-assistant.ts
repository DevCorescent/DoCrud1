import { generateAiText, isAiConfigured, normalizeAiList, normalizeAiText, parseStructuredJson } from '@/lib/server/ai';
import { preserveDocumentStructure } from '@/lib/document-parser-analysis';
import type { AssistantResultCard, DocumentQuickAction, UploadedDocumentMeta } from '@/types/doc-assistant';

function clampInt(value: unknown, fallback: number, min = 0, max = 10_000) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function guessLanguage(text: string) {
  const sample = text.slice(0, 4000);
  if (/[\u0900-\u097F]/.test(sample)) return 'Hindi';
  if (/[\u0B80-\u0BFF]/.test(sample)) return 'Tamil';
  if (/[\u0C00-\u0C7F]/.test(sample)) return 'Telugu';
  if (/[\u0A00-\u0A7F]/.test(sample)) return 'Punjabi';
  if (/[\u4E00-\u9FFF]/.test(sample)) return 'Chinese';
  if (/[\u3040-\u30FF]/.test(sample)) return 'Japanese';
  if (/[\uAC00-\uD7AF]/.test(sample)) return 'Korean';
  return 'English';
}

function firstHeading(text: string) {
  const lines = preserveDocumentStructure(text).split('\n').map((l) => l.trim()).filter(Boolean);
  const candidate = lines.find((line) => line.length >= 8 && line.length <= 90 && (/^[A-Z0-9][A-Z0-9 \-,:/&()]+$/.test(line) || /:$/.test(line)));
  return candidate || lines[0] || '';
}

export function fallbackUploadedDocumentMeta(fileName: string, extractedText: string): UploadedDocumentMeta {
  const normalized = preserveDocumentStructure(extractedText);
  const wordCount = normalized ? normalized.split(/\s+/).filter(Boolean).length : 0;
  const titleFromText = firstHeading(normalized);
  const language = guessLanguage(normalized);
  const documentTitle = titleFromText || fileName.replace(/\.[^.]+$/, '');

  return {
    documentTitle: documentTitle.slice(0, 120) || 'Untitled document',
    documentType: 'Unknown',
    mainTopic: 'Unknown',
    purpose: 'Unknown',
    targetAudience: 'Unknown',
    language,
    tone: 'Unknown',
    wordCount,
    keySections: [],
    keyEntities: [],
    dates: [],
    names: [],
    financialValues: [],
    legalClauses: [],
    actionItems: [],
    risks: [],
    missingInformation: ['Document type/topic metadata requires AI to classify; only raw text was extracted locally.'],
    overallQualityScore: 6,
    intent: 'Unknown',
  };
}

export async function analyzeUploadedDocumentMeta({
  fileName,
  mimeType,
  sizeBytes,
  extractedText,
}: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  extractedText: string;
}): Promise<UploadedDocumentMeta> {
  const normalized = preserveDocumentStructure(extractedText).slice(0, 18000);
  const fallback = fallbackUploadedDocumentMeta(fileName, normalized);

  if (!isAiConfigured()) {
    return fallback;
  }

  const raw = await generateAiText([
    {
      role: 'system',
      content: [
        'You are a professional AI document assistant.',
        'Analyze the uploaded document text and return strict JSON only (no markdown).',
        'Never invent facts; if something is not in the text, list it in missingInformation.',
        'Output keys: documentTitle, documentType, mainTopic, purpose, targetAudience, language, tone, wordCount, keySections, keyEntities, dates, names, financialValues, legalClauses, actionItems, risks, missingInformation, overallQualityScore, intent.',
        'overallQualityScore is 0-10, earned from clarity/structure/completeness.',
        'Be concise and accurate.',
      ].join(' '),
    },
    {
      role: 'user',
      content: JSON.stringify({
        fileName,
        mimeType,
        sizeBytes,
        extractedText: normalized,
      }),
    },
  ]);

  const parsed = parseStructuredJson<Record<string, unknown>>(raw);

  return {
    documentTitle: normalizeAiText(parsed.documentTitle) || fallback.documentTitle,
    documentType: normalizeAiText(parsed.documentType) || fallback.documentType,
    mainTopic: normalizeAiText(parsed.mainTopic) || fallback.mainTopic,
    purpose: normalizeAiText(parsed.purpose) || fallback.purpose,
    targetAudience: normalizeAiText(parsed.targetAudience) || fallback.targetAudience,
    language: normalizeAiText(parsed.language) || fallback.language,
    tone: normalizeAiText(parsed.tone) || fallback.tone,
    wordCount: clampInt(parsed.wordCount, fallback.wordCount, 0, 2_000_000),
    keySections: normalizeAiList(parsed.keySections, 10),
    keyEntities: normalizeAiList(parsed.keyEntities, 12),
    dates: normalizeAiList(parsed.dates, 10),
    names: normalizeAiList(parsed.names, 10),
    financialValues: normalizeAiList(parsed.financialValues, 10),
    legalClauses: normalizeAiList(parsed.legalClauses, 10),
    actionItems: normalizeAiList(parsed.actionItems, 10),
    risks: normalizeAiList(parsed.risks, 10),
    missingInformation: normalizeAiList(parsed.missingInformation, 10),
    overallQualityScore: clampInt(parsed.overallQualityScore, fallback.overallQualityScore, 0, 10),
    intent: normalizeAiText(parsed.intent) || fallback.intent,
  };
}

function buildActionInstruction(action: DocumentQuickAction) {
  switch (action) {
    case 'summary':
      return [
        'Generate a clean summary of the whole document.',
        'Must include: short summary, key points, main topic, important facts, and conclusion.',
        'Do not output proofreading/rewrites; focus on summarization.',
      ].join(' ');
    case 'elaborate':
      return [
        'Expand the selected content (or whole document if selection missing).',
        'Explain complex points in simple language with context and examples.',
        'If the document lacks context, say what is missing.',
      ].join(' ');
    case 'proofread':
      return [
        'Proofread for grammar, spelling, punctuation, tone, clarity, and formatting.',
        'Return corrected version in primaryText (primaryTextLabel must be "Corrected version").',
        'Also list major improvements made in keyPoints.',
        'Do not rewrite meaning; keep content as-is, only fix quality.',
      ].join(' ');
    case 'analyse':
      return [
        'Analyze deeply: insights, risks, opportunities, strengths, weaknesses, gaps, and recommendations.',
        'Prefer concrete bullets grounded in the document wording.',
      ].join(' ');
    case 'score':
      return [
        'Score the document out of 10.',
        'Categories: clarity, structure, grammar, completeness, relevance, tone, impact.',
        'shortAnswer must include the overall score (e.g. "Overall: 7.5/10").',
        'tables must include a breakdown table with columns ["Category","Score/10","Reason","Improve"].',
      ].join(' ');
    case 'legal':
      return [
        'Review from a legal-risk perspective: highlight obligations, risks, missing terms, ambiguous language, and red flags.',
        'extractedFacts should list any detected clauses/obligations with labels.',
        'Include the legal disclaimer.',
      ].join(' ');
    case 'rewrite':
      return [
        'Rewrite the document or selected section professionally: improve clarity, tone, structure, grammar, and impact while preserving meaning.',
        'Return rewritten version in primaryText (primaryTextLabel must be "Rewritten version").',
        'Do not add new facts; if missing info is needed, mention it in missingInfo.',
      ].join(' ');
    case 'enterprise':
      return [
        'Analyze the document using an enterprise-grade document scoring framework.',
        'Be strict. Do not overrate weak documents. Scores must be earned from the text.',
        'Evaluate these 12 dimensions (0-10 each) and include for each: scoreOutOf10, reason, strengths, weaknesses, missingInformation, recommendations.',
        'Dimensions: Purpose & Objective Clarity; Structure & Organization; Content Depth & Completeness; Accuracy & Credibility; Clarity & Communication; Relevance & Practical Usefulness; Strategic Intelligence; Evidence & Data Quality; Consistency & Coherence; Risk, Compliance & Ethics; Innovation & Originality; Execution Readiness.',
        'Also identify: unsupported claims; contradictions; ambiguous sections; outdated information; risk/compliance concerns; execution gaps; hidden assumptions.',
        'Then generate: executiveSummary; overallScoreOutOf100; top5Strengths; top5Weaknesses; actionableImprovementPlan; finalVerdict with publishReadiness, decisionReadiness, executionReadiness, stakeholderConfidence.',
        'You MUST include a weighted score table (weights sum to 100) and a risk assessment table.',
        'When the text does not provide enough evidence, say so explicitly and score lower.',
      ].join(' ');
    default:
      return 'Answer the user query from the document.';
  }
}

export function assistantCardToPlainText(card: AssistantResultCard) {
  const lines: string[] = [];
  lines.push(card.title.trim());
  lines.push('');
  if (card.shortAnswer) {
    lines.push(card.shortAnswer.trim());
    lines.push('');
  }
  if (card.keyPoints?.length) {
    lines.push('Key points:');
    for (const item of card.keyPoints) lines.push(`- ${item}`);
    lines.push('');
  }
  if (card.detailedExplanation?.length) {
    lines.push('Details:');
    for (const item of card.detailedExplanation) lines.push(`- ${item}`);
    lines.push('');
  }
  if (card.extractedFacts?.length) {
    lines.push('Extracted facts:');
    for (const fact of card.extractedFacts) lines.push(`- ${fact.label}: ${fact.value}`);
    lines.push('');
  }
  if (card.recommendations?.length) {
    lines.push('Recommendations:');
    for (const item of card.recommendations) lines.push(`- ${item}`);
    lines.push('');
  }
  if (card.missingInfo?.length) {
    lines.push('Missing information / limitations:');
    for (const item of card.missingInfo) lines.push(`- ${item}`);
    lines.push('');
  }
  if (card.disclaimer) {
    lines.push(card.disclaimer.trim());
    lines.push('');
  }
  return preserveDocumentStructure(lines.join('\n'));
}

export async function generateAssistantCard({
  action,
  userQuestion,
  extractedText,
  meta,
  selection,
}: {
  action?: DocumentQuickAction;
  userQuestion: string;
  extractedText?: string;
  meta?: UploadedDocumentMeta;
  selection?: string;
}): Promise<AssistantResultCard> {
  if (!isAiConfigured()) {
    throw new Error('AI is not configured. Add GROQ_API_KEY to enable AI features.');
  }

  const normalizedDoc = preserveDocumentStructure(extractedText || '').slice(0, 16000);
  const normalizedSelection = preserveDocumentStructure(selection || '').slice(0, 8000);
  const mustUseDocument = Boolean(normalizedDoc);
  const actionInstruction = action
    ? buildActionInstruction(action)
    : [
        'Answer the user question.',
        mustUseDocument
          ? 'Use ONLY the provided documentText/selection/meta. Do not produce a generic document summary unless the question asks for it.'
          : 'Answer normally, and suggest uploading a document for document-based analysis.',
      ].join(' ');

  const raw = await generateAiText([
    {
      role: 'system',
      content: [
        'You are a professional AI document assistant.',
        'Return strict JSON only (no markdown, no code fences).',
        mustUseDocument
          ? 'CRITICAL: Use ONLY the provided documentText/selection/meta. Never invent facts. If missing, list it in missingInfo.'
          : 'If no documentText is provided, answer normally and suggest uploading a document for document-based analysis.',
        'Output keys: title, shortAnswer, keyPoints, detailedExplanation, extractedFacts, primaryTextLabel, primaryText, tables, recommendations, missingInfo, disclaimer, confidence.',
        'tables is optional; when present, it must be an array with columns and rows.',
        'confidence is 0-100 based on evidence strength in the document.',
        action ? `You are running action="${action}". Title must start with "${action.toUpperCase()}:".` : 'If action is null, title should reflect the question.',
        actionInstruction,
        action === 'enterprise'
          ? [
              'For enterprise action: include at least 2 tables.',
              'Table 1 title must be "Weighted Score Table" with columns ["Dimension","Weight","Score/10","Weighted Points","Reason"].',
              'Table 2 title must be "Risk Assessment Table" with columns ["Risk/Concern","Severity","Evidence","Mitigation"].',
              'Include overallScoreOutOf100 in shortAnswer (e.g. "Overall: 62/100").',
              'Include dimension breakdown either in detailedExplanation or in an additional table.',
            ].join(' ')
          : '',
        action === 'legal'
          ? 'Include disclaimer: "This is AI-generated legal analysis and not a substitute for professional legal advice."'
          : '',
      ].filter(Boolean).join(' '),
    },
    {
      role: 'user',
      content: JSON.stringify({
        action: action || null,
        question: userQuestion,
        meta: meta || null,
        enterpriseRubric: action === 'enterprise'
          ? {
              scoringScale: '0-10 per dimension. Be strict; 5 is average, 7 is good, 9+ is exceptional and rare.',
              weights: [
                { dimension: 'Purpose & Objective Clarity', weight: 9 },
                { dimension: 'Structure & Organization', weight: 8 },
                { dimension: 'Content Depth & Completeness', weight: 11 },
                { dimension: 'Accuracy & Credibility', weight: 10 },
                { dimension: 'Clarity & Communication', weight: 9 },
                { dimension: 'Relevance & Practical Usefulness', weight: 8 },
                { dimension: 'Strategic Intelligence', weight: 9 },
                { dimension: 'Evidence & Data Quality', weight: 8 },
                { dimension: 'Consistency & Coherence', weight: 7 },
                { dimension: 'Risk, Compliance & Ethics', weight: 8 },
                { dimension: 'Innovation & Originality', weight: 6 },
                { dimension: 'Execution Readiness', weight: 7 },
              ],
              requiredOutputs: [
                'Executive Summary',
                'Unsupported claims',
                'Contradictions',
                'Ambiguous sections',
                'Outdated information',
                'Risk/compliance concerns',
                'Execution gaps',
                'Hidden assumptions',
                'Top strengths/weaknesses',
                'Improvement plan',
                'Final verdict',
              ],
            }
          : null,
        selection: normalizedSelection || null,
        documentText: normalizedDoc || null,
      }),
    },
  ]);

  const parsed = parseStructuredJson<Record<string, unknown>>(raw);
  const confidence = clampInt(parsed.confidence, mustUseDocument ? 72 : 65, 0, 100);

  const card: AssistantResultCard = {
    title: normalizeAiText(parsed.title) || (action ? `${action.toUpperCase()}: Result` : 'Answer'),
    shortAnswer: normalizeAiText(parsed.shortAnswer) || '',
    keyPoints: normalizeAiList(parsed.keyPoints, 10),
    detailedExplanation: normalizeAiList(parsed.detailedExplanation, 12),
    extractedFacts: Array.isArray(parsed.extractedFacts)
      ? (parsed.extractedFacts as any[])
          .slice(0, 18)
          .map((item) => ({
            label: normalizeAiText(item?.label),
            value: normalizeAiText(item?.value),
          }))
          .filter((item) => item.label && item.value)
      : [],
    primaryTextLabel: normalizeAiText(parsed.primaryTextLabel) || undefined,
    primaryText: normalizeAiText(parsed.primaryText) || undefined,
    tables: Array.isArray(parsed.tables)
      ? (parsed.tables as any[])
          .slice(0, 4)
          .map((table) => ({
            title: normalizeAiText(table?.title) || undefined,
            columns: Array.isArray(table?.columns) ? table.columns.map((c: any) => normalizeAiText(c)).filter(Boolean).slice(0, 10) : [],
            rows: Array.isArray(table?.rows)
              ? table.rows
                  .slice(0, 18)
                  .map((row: any) => (Array.isArray(row) ? row.map((c: any) => normalizeAiText(c)).slice(0, 10) : []))
                  .filter((row: any[]) => row.length > 0)
              : [],
          }))
          .filter((t) => t.columns.length && t.rows.length)
      : undefined,
    recommendations: normalizeAiList(parsed.recommendations, 10),
    missingInfo: normalizeAiList(parsed.missingInfo, 10),
    disclaimer: normalizeAiText(parsed.disclaimer) || (action === 'legal' ? 'This is AI-generated legal analysis and not a substitute for professional legal advice.' : undefined),
    confidence,
  };

  if (action && !card.title.toUpperCase().startsWith(`${action.toUpperCase()}:`)) {
    card.title = `${action.toUpperCase()}: ${card.title}`.slice(0, 120);
  }
  if ((action === 'proofread' || action === 'rewrite') && !card.primaryText) {
    card.missingInfo = Array.from(new Set([...(card.missingInfo || []), 'No rewritten/proofread text was returned. Try again or upload a clearer document.'])).slice(0, 10);
  }

  if (!card.title.trim()) card.title = 'Assistant Result';
  if (!card.shortAnswer.trim() && card.keyPoints.length === 0 && card.detailedExplanation.length === 0) {
    card.shortAnswer = mustUseDocument
      ? 'I could not extract a reliable answer from the provided document text. Try uploading a clearer file or selecting the relevant section.'
      : 'I could not generate a response. Try again.';
  }

  return card;
}
