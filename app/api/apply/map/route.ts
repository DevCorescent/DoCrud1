export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, resolveSessionUserId, getStoredUsers } from '@/lib/server/auth';
import { getProfileData } from '@/lib/server/user-profiles';
import { buildAnswerSet, missingForApply, type ProfileLike } from '@/lib/server/apply-answers';
import { draftAnswer } from '@/lib/server/apply-draft';
import { resolveUnmatchedFields } from '@/lib/server/apply-resolve';
import { getApplyMemory } from '@/lib/server/apply-memory';
import { questionFor, signatureFor, recallFor, type Question } from '@/lib/apply/question';
import { recommendAnswers } from '@/lib/server/apply-recommend';
import { matchField, chooseOption, bestOption, rankOptions, fillsSilently } from '@/lib/apply/field-map';
import {
  REVIEW_KEYS, SKIP_THRESHOLD,
  type AnswerKey, type AnswerSet, type FieldDescriptor, type FieldFill,
} from '@/lib/apply/answer-keys';

/**
 * Read a form, return what to type into it.
 *
 * ═══ WHY THE MAPPING IS HERE AND NOT IN THE EXTENSION ═══
 *
 * The extension sends what it can see — each control's label, name, type and
 * options — and gets back values. It never holds the member's profile, never
 * holds a credential, and never decides anything. That means:
 *
 *   · one implementation of the matcher, in TypeScript, with a selftest
 *     (scripts/apply-field-map.selftest.ts), rather than a copy in the
 *     extension that drifts from the copy on the server;
 *   · the model can be used for the prose questions, because the key is here;
 *   · improving the matcher ships to every installed extension at once,
 *     without a store review.
 *
 * The extension is a pair of hands. This is the part that knows anything.
 *
 * ═══ WHAT IT DELIBERATELY WILL NOT DO ═══
 *
 * It does not submit. It returns values; a person presses the button. Nothing
 * in this route can cause an employer to receive anything.
 *
 * It does not answer what the member never said. Work authorisation, visa
 * sponsorship and salary come back only when they are stored — see the note in
 * lib/server/apply-answers.ts. An employer asking "are you authorised to work
 * in the US?" gets an answer from the candidate or no answer at all.
 */

/** A page can hold a lot of inputs; a job application is not one of them. The
    cap is generous for a Workday page and small enough that a hostile page
    cannot make this route do unbounded work. */
const MAX_FIELDS = 120;
/** Prose answers cost a model call each, so they are capped harder. Beyond
    this the remaining boxes come back empty for the member to write. */
const MAX_DRAFTS = 4;

interface MapRequest {
  job?: { title?: string; company?: string; location?: string; description?: string; url?: string };
  fields?: FieldDescriptor[];
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Sign in to Docrud to auto-fill applications.' }, { status: 401 });
  }
  const userId = await resolveSessionUserId(session).catch(() => null);
  if (!userId) {
    return NextResponse.json({ error: 'Workspace user not found.' }, { status: 404 });
  }

  let body: MapRequest;
  try {
    body = await req.json() as MapRequest;
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  }

  const fields = Array.isArray(body.fields) ? body.fields.slice(0, MAX_FIELDS) : [];
  if (fields.length === 0) {
    return NextResponse.json({ error: 'No fields supplied.' }, { status: 400 });
  }

  /* The profile, plus the name and email from the account — a member can have
     a profile with no name on it, and the account always has both. */
  const [profile, users, memory] = await Promise.all([
    getProfileData(userId).catch(() => ({})),
    getStoredUsers().catch(() => []),
    getApplyMemory(userId).catch(() => []),
  ]);
  const account = users.find((u) => u.id === userId
    || u.email?.toLowerCase() === session.user?.email?.toLowerCase());

  const answers: AnswerSet = buildAnswerSet({
    ...(profile as ProfileLike),
    name: (profile as ProfileLike).name ?? account?.name ?? session.user.name ?? undefined,
    email: (profile as ProfileLike).email ?? account?.email ?? session.user.email ?? undefined,
  });

  /* ── The deterministic pass ── */
  const fills: FieldFill[] = [];
  const prose: Array<{ field: FieldDescriptor; index: number }> = [];
  /* Anything the rules could not name, for the model to read in one batch. */
  const unmatched: FieldDescriptor[] = [];
  const byId = new Map(fields.filter((f) => f?.id).map((f) => [f.id, f]));

  for (const f of fields) {
    if (!f?.id) continue;
    const m = matchField(f);
    if (!m || m.confidence < SKIP_THRESHOLD) {
      /* Not a failure yet — a label the vocabulary does not cover is exactly
         what the second pass is for. A password or a search box goes in too;
         the model is instructed to omit them. */
      if (f.type !== 'password' && f.type !== 'file') unmatched.push(f);
      continue;
    }

    /* A prose question is answered in the second pass, by the model. */
    if (m.key === 'freeText' || (m.key === 'coverLetter' && f.multiline)) {
      prose.push({ field: f, index: fills.length });
      fills.push({
        id: f.id, label: f.label, key: m.key, confidence: m.confidence, reason: m.reason,
        review: true,
      });
      continue;
    }

    if (m.key === 'resume') {
      if (!answers.resume) continue;
      fills.push({
        id: f.id, label: f.label, key: 'resume', confidence: m.confidence, reason: m.reason,
        review: false, file: answers.resume,
      });
      continue;
    }

    const value = (answers as Record<string, unknown>)[m.key] as string | undefined;
    if (!value) continue;

    /* A select or a radio group takes one of ITS values, not ours. When none of
       them plausibly means what the member said, the field is left alone — see
       `chooseOption`, which returns null rather than guessing. */
    let option: string | undefined;
    if (f.options?.length) {
      const picked = chooseOption(value, f.options);
      if (!picked) continue;
      option = picked;
    }

    fills.push({
      id: f.id,
      label: f.label,
      key: m.key,
      value: option ?? value,
      option,
      confidence: m.confidence,
      reason: m.reason,
      /* Two independent reasons to ask a person to look: the matcher was not
         sure which question this is, or the answer is one that should never go
         out unread whatever the confidence. */
      review: !fillsSilently(m.confidence) || REVIEW_KEYS.has(m.key),
    });
  }

  /* ── The reading pass ──
     One call for every field the vocabulary could not name. It returns keys,
     never values; the substitution below is ours, so a misread lands a real
     answer in the wrong box (visible, and flagged) rather than inventing one. */
  const resolved = await resolveUnmatchedFields(unmatched, answers, body.job ?? {});
  for (const r of resolved) {
    const f = byId.get(r.id);
    if (!f) continue;
    const value = (answers as Record<string, unknown>)[r.key] as string | undefined;
    if (!value) continue;

    let option: string | undefined;
    if (f.options?.length) {
      const picked = chooseOption(value, f.options);
      if (!picked) continue;
      option = picked;
    }
    fills.push({
      id: f.id,
      label: f.label,
      key: r.key,
      value: option ?? value,
      option,
      /* Deliberately below FILL_THRESHOLD: a field the rules could not name is
         one a person should glance at, however confident the model sounded. */
      confidence: 0.6,
      reason: r.reason,
      review: true,
    });
  }

  /* ── What the member has already told somebody ──
     A question answered once is answered everywhere: the signature generalises
     across employers' wordings for anything in the taxonomy, so "are you
     authorised to work here" is asked once and filled for good. Flagged for
     review regardless — it is a previous answer, not a fact from the profile,
     and it may have been true in March. */
  const handled = new Set(fills.map((f) => f.id));
  for (const f of fields) {
    if (!f?.id || handled.has(f.id)) continue;
    const m = matchField(f);
    const key = m && m.key !== 'freeText' ? m.key : null;
    const signature = signatureFor(key, f.label || f.ariaLabel || f.placeholder || f.name);
    const recalled = recallFor(signature, memory);
    if (!recalled) continue;

    let option: string | undefined;
    if (f.options?.length) {
      const picked = chooseOption(recalled.value, f.options);
      if (!picked) continue;
      option = picked;
    }
    fills.push({
      id: f.id,
      label: f.label,
      key: key ?? 'freeText',
      value: option ?? recalled.value,
      option,
      confidence: 0.65,
      reason: 'your earlier answer',
      review: true,
    });
    handled.add(f.id);
  }

  /* ── The model pass ── */
  const p = profile as ProfileLike;
  const candidate = {
    name: answers.fullName,
    headline: p.headline,
    bio: p.bio,
    skills: p.skills,
    location: answers.location,
    yearsExperience: answers.yearsExperience,
    experience: p.experience,
  };

  const drafted = await Promise.all(
    prose.slice(0, MAX_DRAFTS).map(async ({ field, index }) => {
      const question = field.label || field.ariaLabel || field.placeholder || 'Tell us about yourself';
      const { text, source } = await draftAnswer({
        question,
        maxLength: field.maxLength,
        job: body.job ?? {},
        candidate,
      });
      return { index, text, source };
    }),
  );
  for (const d of drafted) {
    fills[d.index] = {
      ...fills[d.index],
      value: d.text,
      reason: d.source === 'ai'
        ? 'drafted from your profile — edit before you send it'
        : 'assembled from your profile — edit before you send it',
    };
  }
  /* Any prose box past the cap has no value, so the extension leaves it blank
     rather than showing an empty "drafted" answer. */

  /* ── The shortlist behind each choice ──
     For every answer that came from a list, the other options that plausibly
     meant the same thing. The sidebar offers them when somebody edits the
     answer, which turns "this picked the wrong one of two hundred countries"
     from a hunt through a dropdown into one press. Nothing here is written:
     these are what the member may choose instead. */
  for (const fill of fills) {
    const f = byId.get(fill.id);
    if (!f?.options?.length || !fill.value) continue;
    const ranked = rankOptions(fill.value, f.options, 4).filter((o) => o !== fill.option);
    if (ranked.length) fill.alternatives = ranked.slice(0, 3);
  }

  const filled = fills.filter((f) => f.value !== undefined || f.file);
  const done = new Set(filled.map((f) => f.id));

  /* ── What is left to ask ──
     Everything still empty that a person could reasonably answer. Prose boxes
     are excluded: they are drafted above when there is a model, and when there
     is not they are a writing task rather than a question with an answer. */
  const questions: Question[] = [];
  for (const f of fields) {
    if (!f?.id || done.has(f.id)) continue;
    if (f.type === 'password' || f.type === 'file') continue;
    const m = matchField(f);
    /* A prose box is not a question with an answer — it is drafted above when
       there is a model, and left to the member when there is not. */
    if (m?.key === 'freeText') continue;
    const key = m?.key ?? null;
    const q = questionFor(f, key);
    if (!q) continue;

    /* What they said last time. Shown even though it did not auto-fill —
       `chooseOption` refuses when this form's options are ambiguous, and
       "last time you said Yes" is exactly what resolves that for a person. */
    const recalled = recallFor(q.signature, memory);
    if (recalled) q.recalled = recalled.value;

    /* What the profile already knows, offered rather than written. This is the
       case where the value is real but the option list was too ambiguous to
       select from safely — the member confirms in one click instead of
       answering from scratch. */
    const profileValue = key ? (answers as Record<string, unknown>)[key] as string | undefined : undefined;
    const fromProfile = recalled?.value ?? profileValue;
    if (fromProfile) {
      if (q.options?.length) {
        const best = bestOption(fromProfile, q.options);
        if (best) q.suggested = { value: best.option, why: recalled ? 'your earlier answer' : 'from your profile' };
      } else {
        q.suggested = { value: fromProfile, why: recalled ? 'your earlier answer' : 'from your profile' };
      }
    }
    questions.push(q);
  }

  /* ── Pre-selecting the rest ──
     Only the list questions nothing else could answer, and never the ones about
     pay or the right to work — see lib/server/apply-recommend.ts. */
  for (const r of await recommendAnswers(questions, candidate, body.job ?? {})) {
    const q = questions.find((x) => x.fieldId === r.fieldId);
    if (q && !q.suggested) q.suggested = { value: r.value, why: r.why };
  }
  return NextResponse.json({
    fills: filled,
    /* Asked one at a time by the extension, in this order. */
    questions,
    /* What the member has not told us that a form is likely to want. The
       extension surfaces this once, as a prompt to finish the profile — it is
       the difference between "3 fields could not be filled" and "add your
       phone number and we can fill this next time". */
    missing: missingForApply(answers),
    counts: {
      seen: fields.length,
      filled: filled.length,
      needsReview: filled.filter((f) => f.review).length,
      /* How each answer was arrived at, so the panel can say so. */
      byRules: filled.filter((f) => f.reason !== 'read from the question on the page'
        && !f.reason.includes('from your profile —')).length,
      byReading: filled.filter((f) => f.reason === 'read from the question on the page').length,
      drafted: filled.filter((f) => f.reason.includes('from your profile —')).length,
      remembered: filled.filter((f) => f.reason === 'your earlier answer').length,
      toAsk: questions.length,
      suggested: questions.filter((q) => q.suggested).length,
    },
  });
}
