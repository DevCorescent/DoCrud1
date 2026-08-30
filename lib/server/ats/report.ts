/**
 * The diagnostic report.
 *
 * Every sentence here is assembled from numbers the scorers already produced —
 * this file computes nothing and decides nothing. It is a renderer, so the
 * markdown and the structured object can never disagree about the score.
 */
import type { AtsEvaluation } from './types';
import type { RequirementMatch, SkillMatchType } from './types';

/** How many requirements the keyword table shows. */
export const TABLE_ROWS = 15;

const STATUS_LABEL: Record<SkillMatchType, string> = {
  exact: '✅ Exact',
  normalized: '✅ Normalized',
  semantic: '🟡 Semantic',
  partial: '⚠️ Partial',
  related: '⚠️ Related only',
  missing: '❌ Missing',
};

function proofLabel(match: RequirementMatch): string {
  switch (match.evidence) {
    case 'quantified': return 'Yes — with a measured result';
    case 'recent': return 'Yes — in recent experience';
    case 'demonstrated': return 'Yes';
    case 'listed': return 'No — skills list only';
    default: return 'No';
  }
}

/** Escape a table cell so a pipe in a resume cannot break the markdown. */
function cell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
}

export function renderReport(result: AtsEvaluation): string {
  const { keyword, impact, alignment, audit } = result;
  const lines: string[] = [];

  lines.push(`### 📊 OVERALL ATS MATCH SCORE: ${Math.round(result.overallScore)}%`);
  lines.push('');
  lines.push(`* ${result.executiveSummary}`);
  lines.push('');

  lines.push('### 1. 🔍 PARSING & STRUCTURAL AUDIT');
  lines.push('');
  lines.push(`* **Critical Missing Elements:** ${audit.criticalMissingElements.length ? audit.criticalMissingElements.join(', ') : 'None'}`);
  lines.push(`* **Red Flags:** ${audit.redFlags.length ? audit.redFlags.join('; ') : 'None'}`);
  if (audit.parserQuality !== 'healthy') {
    lines.push(`* **Parser Quality:** ${audit.parserQuality} — the final score is capped at ${audit.scoreCap}% until the document parses cleanly.`);
  }
  lines.push('');

  lines.push('### 2. 🎯 KEYWORD MATCH ANALYSIS (45% of Score)');
  lines.push('');
  lines.push('| JD Requirement | Status in Resume | Contextual Proof Found? |');
  lines.push('| :--- | :--- | :--- |');
  if (!keyword.matches.length) {
    lines.push('| _No requirements could be extracted from this job description_ | — | — |');
  }
  for (const match of keyword.matches.slice(0, TABLE_ROWS)) {
    lines.push(`| ${cell(match.requirement.canonical)} | ${STATUS_LABEL[match.matchType]} | ${proofLabel(match)} |`);
  }
  lines.push('');
  if (keyword.stuffing.detected) {
    lines.push(`* **Keyword stuffing detected:** ${keyword.stuffing.terms.join(', ')} — repeated without supporting experience (−${keyword.stuffing.penalty} points).`);
    lines.push('');
  }

  lines.push('### 3. 📈 IMPACT & METRICS (35% of Score)');
  lines.push('');
  lines.push(`* **Action Verb Score:** ${verbLabel(impact.actionVerbScore)} (${Math.round(impact.actionVerbScore)}/100)`);
  lines.push(`* **Quantification Rate:** ${Math.round(impact.quantificationRate)}% (${impact.quantifiedBullets} of ${impact.totalBullets} bullets)`);
  if (impact.weakestBullet) {
    lines.push('* **Weakest Bullet Point:**');
    lines.push(`  - *Original:* "${impact.weakestBullet.original}"`);
    lines.push(`  - *Why it fails:* ${impact.weakestBullet.whyItFails}`);
    lines.push(`  - *ATS-Optimized Rewrite:* "${impact.weakestBullet.rewrite}"`);
  } else {
    lines.push('* **Weakest Bullet Point:** No experience bullets were available to analyse.');
  }
  lines.push('');

  lines.push('### 4. 🎓 ALIGNMENT & PROGRESSION (20% of Score)');
  lines.push('');
  lines.push(`* **Title Alignment:** ${titleLabel(alignment.titleScore)}${alignment.bestResumeTitle ? ` — closest resume title "${alignment.bestResumeTitle}" against "${alignment.jdTitle}"` : ''}`);
  lines.push(`* **Seniority Alignment:** ${alignment.seniorityMismatch
    ? `Mismatch — the role asks for ${alignment.jdSeniority ?? 'a higher level'}${alignment.jdSeniority && alignment.resumeSeniority ? `, the resume reads as ${alignment.resumeSeniority}` : ''}`
    : 'Consistent with the role'}`);
  lines.push(`* **Education/Certifications:** ${alignment.educationMet ? 'Meets JD' : `Below the stated requirement${alignment.requiredEducation ? ` (${alignment.requiredEducation})` : ''}`}${alignment.missingCertifications.length ? `; missing required certification(s): ${alignment.missingCertifications.join(', ')}` : ''}`);
  lines.push('');

  lines.push('### 5. 🛠️ ACTION PLAN (Top 3 Fixes)');
  lines.push('');
  result.actionPlan.slice(0, 3).forEach((step, index) => lines.push(`${index + 1}. ${step}`));

  return lines.join('\n');
}

function verbLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Mixed';
  return 'Weak';
}

function titleLabel(score: number): string {
  if (score >= 80) return 'Strong';
  if (score >= 55) return 'Moderate';
  if (score >= 30) return 'Weak';
  return 'Unrelated';
}
