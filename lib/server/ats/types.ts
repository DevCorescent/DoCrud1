/**
 * ATS evaluation — shared types.
 *
 * This engine is DETERMINISTIC BY CONSTRUCTION: every number below is produced
 * by a rule in this directory, never by a model. The same resume and the same
 * job description always produce the same score, which is what makes a report
 * auditable and testable. An LLM may later explain these numbers or draft
 * prose; it must never be allowed to change them.
 *
 * Deliberately separate from lib/server/resume-ats.ts (the existing LLM-scored,
 * JD-less analyser) and from lib/server/job-recommend.ts. The three answer
 * different questions:
 *   · job-recommend  — "how relevant is this job to this user?"
 *   · resume-ats     — "how strong is this resume in general?"
 *   · this engine    — "how compatible is THIS resume with THIS job?"
 */

/** How a job requirement was satisfied, strongest first. */
export type SkillMatchType =
  /** Same surface form: "React" ↔ "React". */
  | 'exact'
  /** Same canonical skill via an alias: "Node" ↔ "Node.js". */
  | 'normalized'
  /** Different wording for the same thing: "REST APIs" ↔ "RESTful services". */
  | 'semantic'
  /** Resume has a NARROWER member of the requirement: "AWS Lambda" for "AWS". */
  | 'partial'
  /** Adjacent technology in the same family: "Express" for "Node.js". */
  | 'related'
  /** Nothing in the resume supports it. */
  | 'missing';

/** How strongly the resume proves a skill, as opposed to merely claiming it. */
export type EvidenceStrength =
  /** Not found at all. */
  | 'none'
  /** Appears only in a skills list — a claim with no supporting work. */
  | 'listed'
  /** Used in the narrative of an older role or project. */
  | 'demonstrated'
  /** Used in one of the most recent roles. */
  | 'recent'
  /** Used in a bullet that also carries a measurable outcome. */
  | 'quantified';

/** How much a requirement matters, read from the job description's own wording. */
export type RequirementImportance = 'must' | 'important' | 'nice';

export type RequirementKind =
  | 'skill'
  | 'certification'
  | 'education'
  | 'methodology';

/** One requirement extracted from the job description. */
export interface JdRequirement {
  /** Canonical name, e.g. "Node.js" — what the report displays. */
  canonical: string;
  /** The phrase as the job description actually wrote it. */
  surface: string;
  kind: RequirementKind;
  importance: RequirementImportance;
}

/** The evaluation of one requirement against the resume. */
export interface RequirementMatch {
  requirement: JdRequirement;
  matchType: SkillMatchType;
  evidence: EvidenceStrength;
  /** The resume phrase that satisfied it, verbatim — traceable, never invented. */
  matchedSurface: string | null;
  /**
   * The resume sentence proving it, verbatim. Null when the skill was only
   * listed. This is the "Contextual Proof Found?" column's source.
   */
  proofQuote: string | null;
  /** matchType credit x evidence multiplier, 0..1. */
  credit: number;
  /** must=3, important=2, nice=1 — the weight `credit` is multiplied by. */
  weight: number;
}

/** One experience bullet, analysed. */
export interface BulletAnalysis {
  text: string;
  /** Which role it came from, for traceability. */
  role: string;
  verbTier: 'strong' | 'good' | 'weak' | 'none';
  /** The leading verb as written, when one was found. */
  verb: string | null;
  /** Measurements found verbatim in the bullet: "42%", "10,000 users". */
  metrics: string[];
  /** Requirement canonicals this bullet demonstrates. */
  skillsShown: string[];
  hasResult: boolean;
  /** 0..100 — the composite used to pick the weakest bullet. */
  quality: number;
}

export interface ParsingAudit {
  /**
   * A gate, not a percentage. A resume nobody can read must not score 85
   * because it was stuffed with keywords, so this caps the final score.
   */
  parserQuality: 'healthy' | 'degraded' | 'unreadable' | 'empty';
  /** The cap `parserQuality` imposes on the final score, 0..100. */
  scoreCap: number;
  sectionCoverage: {
    contact: boolean; experience: boolean; education: boolean; skills: boolean;
    summary: boolean; projects: boolean; certifications: boolean;
  };
  contactCompleteness: {
    email: boolean; phone: boolean; location: boolean;
    linkedin: boolean; github: boolean; portfolio: boolean;
  };
  criticalMissingElements: string[];
  redFlags: string[];
}

export interface KeywordAnalysis {
  /** 0..100 before the weighted 45% is applied. */
  score: number;
  matches: RequirementMatch[];
  strongMatches: string[];
  missing: string[];
  /** Claimed in a skills list with nothing in the experience to back it. */
  unproven: string[];
  stuffing: {
    detected: boolean;
    /** Skills repeated well past any natural use, with no proof behind them. */
    terms: string[];
    /** Points subtracted from the keyword score, 0..15. */
    penalty: number;
  };
  /** Sum of weights x credits, and the divisor — so the score can be recomputed by hand. */
  earnedWeight: number;
  totalWeight: number;
}

export interface ImpactAnalysis {
  /** 0..100 before the weighted 35% is applied. */
  score: number;
  actionVerbScore: number;
  /** quantifiedBullets / totalBullets x 100. */
  quantificationRate: number;
  quantifiedBullets: number;
  totalBullets: number;
  relevanceScore: number;
  yearsScore: number;
  candidateYears: number | null;
  requiredYears: number | null;
  bullets: BulletAnalysis[];
  weakestBullet: {
    original: string;
    whyItFails: string;
    /**
     * Built ONLY from words already in the resume. Any number the resume does
     * not contain is left as a "[quantified impact]" placeholder — the engine
     * never writes a metric the candidate did not claim.
     */
    rewrite: string;
  } | null;
}

export interface AlignmentAnalysis {
  /** 0..100 before the weighted 20% is applied. */
  score: number;
  titleScore: number;
  seniorityScore: number;
  educationScore: number;
  certificationScore: number;
  jdTitle: string;
  bestResumeTitle: string | null;
  jdSeniority: string | null;
  resumeSeniority: string | null;
  seniorityMismatch: boolean;
  educationMet: boolean;
  requiredEducation: string | null;
  missingCertifications: string[];
}

export interface AtsBand {
  label: 'Exceptional Match' | 'Strong Match' | 'Good / Competitive'
       | 'Moderate Match' | 'Weak Match' | 'Poor Match';
  min: number;
}

export interface AtsEvaluation {
  /** The published 0..100 compatibility score, after the parsing gate. */
  overallScore: number;
  /** Before the parsing cap — kept so a capped score is visibly a cap. */
  rawScore: number;
  band: AtsBand['label'];
  executiveSummary: string;
  keyword: KeywordAnalysis;
  impact: ImpactAnalysis;
  alignment: AlignmentAnalysis;
  audit: ParsingAudit;
  /**
   * Resume quality, 0..100 — a SEPARATE axis from the match score. A great
   * resume aimed at the wrong job scores low here and high there, and the two
   * must never be added together or confused.
   */
  resumeQualityScore: number;
  actionPlan: string[];
  /** Exactly how overallScore was reached, for auditing. */
  formula: {
    keywordScore: number; keywordWeight: 0.45;
    experienceScore: number; experienceWeight: 0.35;
    alignmentScore: number; alignmentWeight: 0.20;
    scoreCap: number;
  };
}
