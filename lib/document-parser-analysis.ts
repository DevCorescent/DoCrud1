export type DocumentParserScore = {
  overall: number;
  clarity: number;
  compliance: number;
  completeness: number;
  professionalism: number;
  riskExposure: number;
  rationale: string;
};

export type DocumentParserInsightPayload = {
  summary: string;
  tone: string;
  score: DocumentParserScore;
  keyDetails: string[];
  risks: string[];
  mitigations: string[];
  obligations: string[];
  recommendedActions: string[];
};

export function preserveDocumentStructure(value: string) {
  return value
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function stripHtmlPreserveStructure(value: string) {
  return preserveDocumentStructure(
    value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>'),
  );
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function buildStructuredInsights(content: string, title: string): DocumentParserInsightPayload {
  const normalized = preserveDocumentStructure(content);
  const lower = normalized.toLowerCase();
  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
  const paragraphs = normalized.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  const sentences = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;

  const hasHeadings = lines.some((line) => /^[A-Z][A-Z\s/&-]{4,}$/.test(line) || /:$/.test(line));
  const hasDates = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.test(normalized);
  const hasParties = /\b(company|client|vendor|employee|contractor|party|parties|customer)\b/i.test(normalized);
  const hasMoney = /₹|\$|€|\b(?:inr|usd|eur)\b|\b\d+(?:,\d{3})*(?:\.\d{2})?\b/i.test(normalized);
  const hasApproval = /\b(approve|approval|authori[sz]ed|signatory|execution|review)\b/i.test(normalized);
  const hasConfidentiality = /\b(confidential|privacy|data protection|non-disclosure|nda)\b/i.test(normalized);
  const hasTermClause = /\b(termination|renewal|expiry|expiration|term)\b/i.test(normalized);
  const hasLiability = /\b(liability|indemnity|breach|damages|penalty)\b/i.test(normalized);
  const hasTimeline = /\b(within|days|weeks|months|quarterly|annually|timeline|deadline)\b/i.test(normalized);
  const hasContactDetails = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(normalized);

  const completeness = clampScore(
    28
      + Math.min(wordCount / 9, 40)
      + (hasDates ? 8 : 0)
      + (hasParties ? 8 : 0)
      + (hasApproval ? 6 : 0)
      + (hasTermClause ? 6 : 0),
  );
  const clarity = clampScore(
    38
      + Math.min(lines.length * 1.2, 18)
      + Math.min(paragraphs.length * 2.2, 18)
      + (hasHeadings ? 10 : 0)
      - (sentences.some((sentence) => sentence.length > 260) ? 8 : 0),
  );
  const professionalism = clampScore(
    44
      + (/\b(dear|regards|sincerely|agreement|services|scope|deliverables|responsibilities)\b/i.test(normalized) ? 18 : 0)
      + (hasHeadings ? 8 : 0)
      + (hasContactDetails ? 4 : 0),
  );
  const compliance = clampScore(
    34
      + (hasConfidentiality ? 16 : 0)
      + (hasLiability ? 14 : 0)
      + (hasTermClause ? 12 : 0)
      + (hasApproval ? 10 : 0),
  );
  const riskExposure = clampScore(
    18
      + (hasLiability ? 22 : 0)
      + (!hasConfidentiality ? 15 : 0)
      + (!hasTermClause ? 14 : 0)
      + (!hasApproval ? 10 : 0)
      + (hasMoney ? 6 : 0),
  );
  const overall = clampScore((clarity + completeness + professionalism + compliance + (100 - riskExposure)) / 5);

  const tone = hasLiability
    ? 'Formal Legal'
    : /\b(urgent|immediately|asap)\b/i.test(normalized)
      ? 'High-pressure'
      : /\b(please|thank you|appreciate)\b/i.test(normalized)
        ? 'Professional Collaborative'
        : 'Professional Neutral';

  const summary = (paragraphs[0] || sentences.slice(0, 3).join(' ') || normalized).slice(0, 900);

  const keyDetails = [
    title ? `Document: ${title}` : '',
    wordCount ? `Approximate length: ${wordCount} words` : '',
    hasParties ? 'Includes identifiable parties or stakeholders.' : '',
    hasDates ? 'Contains date or timeline references.' : '',
    hasMoney ? 'Contains monetary or commercial references.' : '',
    hasApproval ? 'Includes approval or authority language.' : '',
  ].filter(Boolean);

  const risks = [
    !hasConfidentiality ? 'Confidentiality, privacy, or data handling language is not clearly visible.' : '',
    !hasTermClause ? 'Termination, renewal, or expiry terms are weak or missing.' : '',
    !hasApproval ? 'Approval ownership and signatory authority are not clearly defined.' : '',
    hasLiability ? 'Liability, indemnity, or breach language may need legal review.' : '',
  ].filter(Boolean);

  const mitigations = [
    !hasConfidentiality ? 'Add confidentiality and data-handling clauses aligned to your policy standards.' : '',
    !hasTermClause ? 'Define document term, renewal rules, and termination triggers explicitly.' : '',
    !hasApproval ? 'Specify approvers, accountable teams, and final signatory authority.' : '',
    hasLiability ? 'Review liability scope and cap exposure with tighter wording where needed.' : '',
  ].filter(Boolean);

  const obligations = [
    /\b(deliver|provide|submit|maintain|perform|pay|review|comply)\b/i.test(normalized) ? 'Operational or commercial obligations are present and should be tracked.' : '',
    hasTimeline ? 'The document contains timing-based commitments that should be monitored.' : '',
  ].filter(Boolean);

  const recommendedActions = [
    'Review extracted text against the source document before relying on final decisions.',
    risks.length ? 'Address the highlighted risk areas before approval or circulation.' : 'Proceed to review and approval with standard governance checks.',
    'Use the live content editor to refine weak sections and watch the score adjust in real time.',
  ];

  return {
    summary,
    tone,
    score: {
      overall,
      clarity,
      compliance,
      completeness,
      professionalism,
      riskExposure,
      rationale: 'Scored from structure, completeness, governance language, compliance cues, and visible risk exposure in the current text.',
    },
    keyDetails,
    risks,
    mitigations,
    obligations,
    recommendedActions,
  };
}
