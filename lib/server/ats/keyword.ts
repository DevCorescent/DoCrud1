/**
 * Module 2 — Keyword & Skill Alignment. 45% of the final score.
 *
 * Two independent questions per requirement, and the product of the answers is
 * the credit:
 *
 *   1. HOW WELL does the resume's skill correspond to the requirement?
 *      exact = normalized > semantic > partial > related > missing
 *   2. HOW WELL is it PROVEN? A word in a skills list is a claim; the same word
 *      inside a delivered piece of work is evidence.
 *
 * Multiplying them is what stops the two classic failures at once: a resume
 * cannot reach 100% by listing every keyword (question 2 caps it), and it
 * cannot reach 100% by naming a neighbouring technology (question 1 caps it).
 */
import { containsPhrase, containsStandalonePhrase, standalonePhraseCount, clamp, round1 } from './text';
import { describeBullet } from './resume';
import { isChildOf, isRelated, skillEntry } from './skill-taxonomy';
import type { NormalizedResume } from './resume';
import type { NormalizedJd } from './jd';
import type {
  EvidenceStrength, KeywordAnalysis, RequirementMatch, SkillMatchType,
} from './types';

/** How much each kind of correspondence is worth. Ordered, and never equal. */
export const MATCH_CREDIT: Record<SkillMatchType, number> = {
  exact: 1,
  normalized: 1,      // "Node" IS "Node.js" — a spelling difference, not a gap
  semantic: 0.8,      // same concept, different words
  partial: 0.5,       // resume has a narrower member: AWS Lambda for AWS
  related: 0.25,      // a neighbour: Express for Node.js. Never a substitute
  missing: 0,
};

/** How much each strength of proof is worth. A claim is worth less than work. */
export const EVIDENCE_MULTIPLIER: Record<EvidenceStrength, number> = {
  quantified: 1,      // used in a bullet that also shows a measurable outcome
  recent: 1,          // used in one of the two most recent roles
  demonstrated: 0.9,  // used in older work
  listed: 0.6,        // named in a skills list, with nothing behind it
  none: 0,
};

/** Requirement weights. A must-have is worth three nice-to-haves. */
export const IMPORTANCE_WEIGHT = { must: 3, important: 2, nice: 1 } as const;

/** Repeats past this, with no proof anywhere, read as stuffing rather than use. */
const STUFFING_REPEAT_THRESHOLD = 4;
const MAX_STUFFING_PENALTY = 15;

/** How the resume corresponds to one requirement, and what proved it. */
function resolveMatch(requirement: string, resume: NormalizedResume): {
  matchType: SkillMatchType; matchedSurface: string | null;
} {
  const entry = skillEntry(requirement);

  /* Each tier is tested in order, strongest first, and every test demands a
     STANDALONE mention. Without that, "AWS Lambda" on a resume would satisfy a
     bare "AWS" requirement as an exact match, because the longer name contains
     the shorter word — the single most common way an ATS invents a match. */
  if (containsStandalonePhrase(resume.fullText, requirement)) {
    return { matchType: 'exact', matchedSurface: requirement };
  }

  const alias = (entry?.aliases ?? []).find((a) => containsStandalonePhrase(resume.fullText, a));
  if (alias) return { matchType: 'normalized', matchedSurface: alias };

  const synonym = (entry?.synonyms ?? []).find((sy) => containsPhrase(resume.fullText, sy));
  if (synonym) return { matchType: 'semantic', matchedSurface: synonym };

  /* Narrower members count PARTIALLY: someone who shipped AWS Lambda has
     touched AWS, but the posting asked for more than one service. */
  const child = resume.canonicalSkills.find((skill) => isChildOf(skill, requirement));
  if (child) return { matchType: 'partial', matchedSurface: child };

  /* Neighbours earn a little and are never called a match. Docker is not
     Kubernetes; Express is not Node.js expertise. */
  const neighbour = resume.canonicalSkills.find((skill) => isRelated(skill, requirement));
  if (neighbour) return { matchType: 'related', matchedSurface: neighbour };

  return { matchType: 'missing', matchedSurface: null };
}

/** How well a matched skill is proven, and the resume sentence that proves it. */
function resolveEvidence(surface: string, resume: NormalizedResume): {
  evidence: EvidenceStrength; proofQuote: string | null;
} {
  let best: { evidence: EvidenceStrength; quote: string } | null = null;
  const rank: Record<EvidenceStrength, number> = {
    none: 0, listed: 1, demonstrated: 2, recent: 3, quantified: 4,
  };

  for (const bullet of resume.bullets) {
    if (!containsPhrase(bullet.text, surface)) continue;
    const facts = describeBullet(bullet);
    const evidence: EvidenceStrength = facts.metrics.length > 0
      ? 'quantified'
      : bullet.recent ? 'recent' : 'demonstrated';
    if (!best || rank[evidence] > rank[best.evidence]) {
      best = { evidence, quote: bullet.text };
    }
  }
  if (best) return { evidence: best.evidence, proofQuote: best.quote };

  /* Outside bullets but inside the narrative (a role summary, the bio) still
     counts as demonstrated — it is prose about work, not a keyword list. */
  if (containsPhrase(resume.narrativeText, surface)) {
    return { evidence: 'demonstrated', proofQuote: null };
  }
  if (containsPhrase(resume.skillsSectionText, surface)) {
    return { evidence: 'listed', proofQuote: null };
  }
  return { evidence: 'none', proofQuote: null };
}

export function analyzeKeywords(resume: NormalizedResume, jd: NormalizedJd): KeywordAnalysis {
  const matches: RequirementMatch[] = [];
  let earnedWeight = 0;
  let totalWeight = 0;

  for (const requirement of jd.requirements) {
    const weight = IMPORTANCE_WEIGHT[requirement.importance];
    const { matchType, matchedSurface } = resolveMatch(requirement.canonical, resume);
    const { evidence, proofQuote } = matchType === 'missing' || !matchedSurface
      ? { evidence: 'none' as EvidenceStrength, proofQuote: null }
      : resolveEvidence(matchedSurface, resume);

    const credit = MATCH_CREDIT[matchType] * EVIDENCE_MULTIPLIER[evidence];
    totalWeight += weight;
    earnedWeight += weight * credit;

    matches.push({
      requirement, matchType, evidence, matchedSurface, proofQuote,
      credit: round1(credit * 100) / 100, weight,
    });
  }

  /* Stuffing: a term repeated far past natural use while nothing in the
     experience shows it being used. Repetition alone is not stuffing — a
     genuinely central skill recurs — so proof is what separates the two. */
  const stuffedTerms: string[] = [];
  for (const match of matches) {
    if (match.matchType === 'missing') continue;
    const surface = match.matchedSurface ?? match.requirement.canonical;
    const occurrences = standalonePhraseCount(resume.fullText, surface);
    const proven = match.evidence === 'demonstrated'
      || match.evidence === 'recent' || match.evidence === 'quantified';
    if (occurrences >= STUFFING_REPEAT_THRESHOLD && !proven) {
      stuffedTerms.push(match.requirement.canonical);
    }
  }
  /* The other shape stuffing takes: the same word typed back to back. */
  const repeatedRun = /\b([a-z][a-z0-9+#.]{1,20})\b(?:\s+\1\b){2,}/i.exec(resume.fullText);
  if (repeatedRun && !stuffedTerms.includes(repeatedRun[1])) stuffedTerms.push(repeatedRun[1]);

  const penalty = Math.min(MAX_STUFFING_PENALTY, stuffedTerms.length * 5);
  const base = totalWeight > 0 ? (earnedWeight / totalWeight) * 100 : 0;
  const score = clamp(base - penalty);

  return {
    score: round1(score),
    matches,
    strongMatches: matches
      .filter((m) => (m.matchType === 'exact' || m.matchType === 'normalized')
        && m.evidence !== 'none' && m.evidence !== 'listed')
      .map((m) => m.requirement.canonical),
    missing: matches.filter((m) => m.matchType === 'missing').map((m) => m.requirement.canonical),
    unproven: matches.filter((m) => m.evidence === 'listed').map((m) => m.requirement.canonical),
    stuffing: { detected: stuffedTerms.length > 0, terms: stuffedTerms, penalty },
    earnedWeight: round1(earnedWeight),
    totalWeight,
  };
}
