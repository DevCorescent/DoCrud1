/**
 * Skill options for the onboarding Skills step.
 *
 * ═══ WHERE THESE COME FROM ═══
 *
 * lib/server/ats/skill-taxonomy.ts — Docrud's own canonical skill dictionary,
 * the same vocabulary the ATS uses to recognise a skill written in a resume or
 * a job post. Reusing it means a skill chosen here is a string the rest of the
 * platform already understands, spelled the way it spells it. That file holds
 * only constants, index Maps and pure functions, and its one import is
 * type-only, so it is safe in a client bundle.
 *
 * Nothing here reads an ATS score, a match score or any ranking. This is the
 * dictionary only — scoring stays where it lives.
 *
 * ═══ WHY NOT LIVE JOB DATA ═══
 *
 * Skills from real postings would be better, and /api/jobs/public is public and
 * returns a `preferredSkills` field per job. It is empty. Measured against the
 * live corpus: 5,276 active jobs, 500 sampled across four pages plus a
 * domain-filtered query, and ZERO carried a single preferred skill. The field
 * exists in the schema and ingestion is not populating it.
 *
 * So there is no market-frequency data to order or filter these by, and none is
 * invented. When ingestion starts populating that field, aggregating it here is
 * the right upgrade — and it is also what would let `recommended` mean
 * something.
 *
 * ═══ KNOWN GAP ═══
 *
 * The dictionary is weighted towards software and engineering. Docrud's role
 * taxonomy spans seventeen domains including Sales, Legal and Healthcare, and
 * this list serves those thinly. That is the honest current state of the
 * vocabulary, not a decision made here; widening it means adding entries to the
 * ATS taxonomy, where every consumer benefits.
 */

import { SKILLS } from '@/lib/server/ats/skill-taxonomy';

/** How many skills a person may choose. A product rule, not a display detail. */
export const MAX_SKILLS = 10;

export type SkillOption = {
  /** The canonical skill name. Stable, and what selection is keyed on. */
  id: string;
  label: string;
  /** Set only from an authoritative source. Never inferred in the UI. */
  recommended?: boolean;
};

/** Every canonical skill Docrud recognises, in the taxonomy's own order. */
export const DEFAULT_SKILL_OPTIONS: readonly SkillOption[] = SKILLS.map(entry => ({
  id: entry.canonical,
  label: entry.canonical,
}));
