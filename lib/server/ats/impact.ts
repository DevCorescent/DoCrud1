/**
 * Module 3 — Experience & Impact. 35% of the final score.
 *
 * Four measurable things, none of which requires reading comprehension:
 *   action verbs   30% — does a bullet describe an action or a duty?
 *   quantification 30% — does it end in a number?
 *   relevance      20% — is the work about what the job asked for?
 *   years          20% — is there enough of it?
 *
 * The rewrite this module produces is assembled from words ALREADY IN THE
 * BULLET. It is not generation: no metric, employer or technology that the
 * candidate did not write can appear in it. Where a number would belong and
 * the resume has none, a "[quantified impact]" placeholder is left for the
 * candidate to fill in themselves.
 */
import { clamp, round1, containsPhrase, STRONG_VERBS } from './text';
import { describeBullet } from './resume';
import type { NormalizedResume } from './resume';
import type { NormalizedJd } from './jd';
import type { BulletAnalysis, ImpactAnalysis } from './types';

/** Weights inside the 35% bucket. They sum to 1. */
const W_VERB = 0.30;
const W_QUANT = 0.30;
const W_RELEVANCE = 0.20;
const W_YEARS = 0.20;

/**
 * A 50% quantification rate is already strong resume writing — not every
 * bullet can carry a number honestly. So the rate is scaled ×2 and capped,
 * rather than used raw, which would punish good resumes for telling the truth.
 */
const QUANT_RATE_FOR_FULL_MARKS = 50;

/** A weak verb costs more than a good one earns: duty language is the problem. */
const VERB_POINTS = { strong: 2, good: 1.4, none: 0.5, weak: 0 } as const;

/** Upgrades for the rewrite, applied only to the verb the candidate wrote. */
const VERB_UPGRADE: Record<string, string> = {
  'worked on': 'Engineered', 'helped': 'Delivered', 'assisted': 'Supported delivery of',
  'responsible for': 'Owned', 'involved in': 'Contributed to delivering',
  'participated in': 'Delivered', 'contributed to': 'Delivered',
  'tasked with': 'Owned', 'duties included': 'Owned',
};

export function analyzeImpact(resume: NormalizedResume, jd: NormalizedJd): ImpactAnalysis {
  const requirementNames = jd.requirements.map((r) => r.canonical);

  const bullets: BulletAnalysis[] = resume.bullets.map((bullet) => {
    const facts = describeBullet(bullet);
    const skillsShown = facts.skills.filter((s) => requirementNames.includes(s));
    /* Bullet quality, used only to rank bullets against each other. */
    const quality = clamp(
      VERB_POINTS[facts.tier] * 18
      + (facts.metrics.length > 0 ? 30 : 0)
      + (facts.hasResult ? 12 : 0)
      + Math.min(20, skillsShown.length * 10)
      + (bullet.text.length >= 40 ? 8 : 0),
    );
    return {
      text: bullet.text,
      role: bullet.role,
      verbTier: facts.tier,
      verb: facts.verb,
      metrics: facts.metrics,
      skillsShown,
      hasResult: facts.hasResult,
      quality: round1(quality),
    };
  });

  const totalBullets = bullets.length;
  const quantifiedBullets = bullets.filter((b) => b.metrics.length > 0).length;
  const quantificationRate = totalBullets ? (quantifiedBullets / totalBullets) * 100 : 0;

  const verbPointsEarned = bullets.reduce((sum, b) => sum + VERB_POINTS[b.verbTier], 0);
  const actionVerbScore = totalBullets
    ? clamp((verbPointsEarned / (totalBullets * VERB_POINTS.strong)) * 100)
    : 0;

  const relevantBullets = bullets.filter((b) => b.skillsShown.length > 0).length;
  /* Half the bullets touching the job's own requirements is a well-targeted
     resume; the rest can legitimately cover context and leadership. */
  const relevanceScore = totalBullets
    ? clamp((relevantBullets / totalBullets) * 200)
    : 0;

  /* Years. With nothing asked for there is nothing to fall short of, so a
     posting that states no requirement scores full marks rather than a guess. */
  const requiredYears = jd.requiredYears;
  const candidateYears = resume.totalYears;
  let yearsScore = 100;
  if (requiredYears && requiredYears > 0) {
    yearsScore = candidateYears === null
      ? 50 /* undateable experience is a parsing problem, not a disqualification */
      : clamp((candidateYears / requiredYears) * 100);
  }

  const quantScore = clamp((quantificationRate / QUANT_RATE_FOR_FULL_MARKS) * 100);
  const score = clamp(
    actionVerbScore * W_VERB
    + quantScore * W_QUANT
    + relevanceScore * W_RELEVANCE
    + yearsScore * W_YEARS,
  );

  return {
    score: round1(score),
    actionVerbScore: round1(actionVerbScore),
    quantificationRate: round1(quantificationRate),
    quantifiedBullets,
    totalBullets,
    relevanceScore: round1(relevanceScore),
    yearsScore: round1(yearsScore),
    candidateYears,
    requiredYears,
    bullets,
    weakestBullet: buildWeakestBullet(bullets, jd),
  };
}

/**
 * The weakest bullet, with a rewrite built from its own words.
 *
 * Ties break on the earliest bullet so the same resume always names the same
 * bullet — a report that changes its mind between runs is not auditable.
 */
function buildWeakestBullet(bullets: BulletAnalysis[], jd: NormalizedJd): ImpactAnalysis['weakestBullet'] {
  if (!bullets.length) return null;
  let weakest = bullets[0];
  for (const bullet of bullets) {
    if (bullet.quality < weakest.quality) weakest = bullet;
  }

  const reasons: string[] = [];
  if (weakest.verbTier === 'weak') {
    reasons.push(`opens with responsibility language${weakest.verb ? ` ("${weakest.verb}")` : ''} rather than an action`);
  } else if (weakest.verbTier === 'none') {
    reasons.push('has no clear action verb');
  }
  if (!weakest.metrics.length) reasons.push('states no measurable outcome');
  if (!weakest.skillsShown.length) reasons.push('names none of the technologies this job asks for');
  if (weakest.text.length < 40) reasons.push('is too short to show scope or ownership');
  if (!reasons.length) reasons.push('is the least specific bullet in the resume');

  return {
    original: weakest.text,
    whyItFails: `This bullet ${reasons.join(', ')}.`,
    rewrite: rewriteBullet(weakest, jd),
  };
}

/**
 * Rewrite one bullet using only what it already contains.
 *
 * The three permitted operations are: replace a weak verb with a strong one,
 * keep every noun the candidate wrote, and append a placeholder where a metric
 * belongs. If the bullet HAS a metric, that metric is reused verbatim. Nothing
 * else is added — no invented percentages, employers, or technologies.
 */
function rewriteBullet(bullet: BulletAnalysis, jd: NormalizedJd): string {
  let text = bullet.text.trim().replace(/[.\s]+$/, '');

  if (bullet.verbTier === 'weak' && bullet.verb) {
    const upgrade = VERB_UPGRADE[bullet.verb];
    if (upgrade) {
      const pattern = new RegExp(`^\\s*${bullet.verb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i');
      text = pattern.test(text)
        ? text.replace(pattern, `${upgrade} `)
        : `${upgrade} ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
    }
  } else if (bullet.verbTier === 'none') {
    text = `${STRONG_VERBS[12].replace(/^./, (c) => c.toUpperCase())} ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  }

  /* A measurable outcome. Reuse the candidate's own number when there is one;
     otherwise leave a labelled blank for them to fill in. Never invent. */
  if (bullet.metrics.length) {
    const metric = bullet.metrics[0];
    if (!containsPhrase(text, metric)) text = `${text}, delivering ${metric}`;
  } else {
    text = `${text}, [quantified impact — add the measurable result]`;
  }

  /* Name a requirement ONLY if the bullet already demonstrates it. */
  const shown = bullet.skillsShown[0];
  if (shown && !containsPhrase(text, shown) && jd.requirements.some((r) => r.canonical === shown)) {
    text = `${text} using ${shown}`;
  }

  return `${text}.`.replace(/\s+/g, ' ');
}
