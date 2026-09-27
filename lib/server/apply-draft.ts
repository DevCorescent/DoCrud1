/**
 * The written answers — the part a lookup table cannot do.
 *
 * "Why do you want to work here?", "Describe a time you shipped something
 * hard", "What interests you about this role?" — a form asks these in prose and
 * expects prose back. This is where the model earns its place, and it is the
 * only place in auto-apply where it is used: everything else is a mapping
 * problem with a right answer, and lib/apply/field-map.ts solves it
 * deterministically.
 *
 * ═══ IT WRITES FROM THE PROFILE, NOT FROM NOTHING ═══
 *
 * The prompt carries the member's real headline, skills and experience, and the
 * real job. The model's job is to select and phrase what is already true, and
 * it is told so explicitly — the instruction not to invent is the most load-
 * bearing line in the prompt, because an invented employer or an invented year
 * of experience is a false claim made to a stranger in someone's name.
 *
 * ═══ EVERY DRAFT IS REVIEWED ═══
 *
 * `coverLetter` and `freeText` are in REVIEW_KEYS, so nothing this module
 * produces is ever submitted without the member seeing it. That is not a
 * fallback for a bad model, it is the design: a person should read the sentence
 * that goes out over their name.
 */

import { generateAiText, isAiConfigured, normalizeAiText } from '@/lib/server/ai';

export interface DraftContext {
  /** The question, exactly as the form worded it. */
  question: string;
  /** What the box will accept, when the form says. */
  maxLength?: number;
  job: {
    title?: string;
    company?: string;
    location?: string;
    description?: string;
  };
  candidate: {
    name?: string;
    headline?: string;
    bio?: string;
    skills?: string[];
    location?: string;
    yearsExperience?: string;
    experience?: Array<{ title?: string; company?: string; desc?: string }>;
  };
}

/** Long enough to answer properly, short enough that no recruiter skims past
    it. Overridden downward by a form's own maxlength, never upward. */
const DEFAULT_LIMIT = 900;

function trimTo(text: string, limit: number): string {
  if (text.length <= limit) return text;
  /* Cut at a sentence if there is one in the last fifth, so a truncated answer
     still ends like a sentence rather than mid-word. */
  const cut = text.slice(0, limit);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return stop > limit * 0.8 ? cut.slice(0, stop + 1) : `${cut.trimEnd()}…`;
}

/**
 * A fallback that is honest about being one.
 *
 * With no AI configured the member still gets something to edit rather than an
 * empty box — assembled from their own headline and skills, with no claim in it
 * that they did not already make on their profile.
 */
function withoutAi(ctx: DraftContext): string {
  const { candidate: c, job } = ctx;
  const bits: string[] = [];
  const role = job.title ? `the ${job.title} role` : 'this role';
  const at = job.company ? ` at ${job.company}` : '';

  if (c.headline) bits.push(`I am ${c.headline}.`);
  if (c.skills?.length) bits.push(`I work mainly with ${c.skills.slice(0, 5).join(', ')}.`);
  if (c.yearsExperience) bits.push(`I have ${c.yearsExperience} years of experience.`);
  bits.push(`I am interested in ${role}${at} and would welcome the chance to talk about it.`);
  return bits.join(' ');
}

/**
 * One written answer.
 *
 * Never throws: a failed or unconfigured model falls back to the profile-only
 * draft above, because an application flow that breaks when an API key expires
 * is worse than one that writes a plainer sentence.
 */
export async function draftAnswer(ctx: DraftContext): Promise<{ text: string; source: 'ai' | 'profile' }> {
  const limit = Math.min(ctx.maxLength ?? DEFAULT_LIMIT, DEFAULT_LIMIT);

  if (!isAiConfigured()) {
    return { text: trimTo(withoutAi(ctx), limit), source: 'profile' };
  }

  const c = ctx.candidate;
  const facts = [
    c.name && `Name: ${c.name}`,
    c.headline && `Headline: ${c.headline}`,
    c.location && `Based in: ${c.location}`,
    c.yearsExperience && `Years of experience: ${c.yearsExperience}`,
    c.skills?.length && `Skills: ${c.skills.slice(0, 14).join(', ')}`,
    c.bio && `About: ${c.bio.slice(0, 600)}`,
    c.experience?.length && `Experience:\n${c.experience.slice(0, 4)
      .map((e) => `- ${[e.title, e.company].filter(Boolean).join(' at ')}${e.desc ? `: ${e.desc.slice(0, 220)}` : ''}`)
      .join('\n')}`,
  ].filter(Boolean).join('\n');

  const role = [
    ctx.job.title && `Role: ${ctx.job.title}`,
    ctx.job.company && `Company: ${ctx.job.company}`,
    ctx.job.location && `Location: ${ctx.job.location}`,
    ctx.job.description && `Description: ${ctx.job.description.slice(0, 1800)}`,
  ].filter(Boolean).join('\n');

  try {
    const text = await generateAiText([
      {
        role: 'system',
        content:
          'You draft answers to job application questions on behalf of a candidate, '
          + 'for the candidate to review and edit before they send it.\n\n'
          + 'RULES, in order of importance:\n'
          + '1. Use ONLY facts given in the candidate profile below. Never invent an '
          + 'employer, a qualification, a year, a metric or a project. If the profile '
          + 'does not support a claim, leave the claim out.\n'
          + '2. Answer the question that was actually asked.\n'
          + '3. First person, plain professional English, no marketing language, no '
          + 'flattery of the company, no "I am thrilled".\n'
          + `4. At most ${limit} characters. Prose, not bullet points, unless the question asks for a list.\n`
          + '5. Return the answer text only — no preamble, no quotation marks, no sign-off.',
      },
      {
        role: 'user',
        content: `CANDIDATE PROFILE\n${facts || '(the profile is largely empty)'}\n\n`
          + `THE JOB\n${role || '(no job details supplied)'}\n\n`
          + `QUESTION\n${ctx.question}`,
      },
    ]);

    const out = normalizeAiText(text).trim().replace(/^["“]|["”]$/g, '');
    if (!out) return { text: trimTo(withoutAi(ctx), limit), source: 'profile' };
    return { text: trimTo(out, limit), source: 'ai' };
  } catch {
    return { text: trimTo(withoutAi(ctx), limit), source: 'profile' };
  }
}
