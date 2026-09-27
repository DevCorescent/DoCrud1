/**
 * A member's profile, as the answers a job form asks for.
 *
 * ═══ ONE TRANSLATION, IN ONE PLACE ═══
 *
 * The profile stores what a professional network needs: a headline, a bio, an
 * experience list, skills, match preferences. A job form asks for something
 * else entirely: a first name, a notice period, a LinkedIn URL, years of
 * experience as a number. This module is the whole of that translation, so the
 * extension, the internal apply form and the review panel are all filling from
 * the same sentence.
 *
 * ═══ NOTHING IS INVENTED ═══
 *
 * Every value here is derived from something the member actually entered. An
 * answer that cannot be derived is ABSENT, not empty and not guessed — the
 * review panel shows "you have not told us this yet" and the field is left for
 * them. That matters more here than almost anywhere else in the product: these
 * answers are sent to an employer in the member's name, and a plausible
 * invention is worse than a gap, because a gap is visible and an invention is
 * not.
 *
 * Work authorisation and salary are the clearest cases. Neither is stored, and
 * neither can be inferred from a location or a job title without asserting
 * something about a person's legal status or their pay that they never said.
 * They are collected explicitly or left blank.
 */

import type { AnswerSet } from '@/lib/apply/answer-keys';

/* The shapes actually stored. Kept structural rather than importing the app's
   profile type wholesale: this module needs eight fields, and coupling it to a
   forty-field interface makes it fail to compile every time that grows. */
export interface ProfileLike {
  name?: string;
  email?: string;
  phone?: string;
  headline?: string;
  bio?: string;
  location?: string;
  website?: string;
  skills?: string[];
  socialLinks?: Record<string, string | undefined>;
  experience?: Array<{ title?: string; company?: string; period?: string; desc?: string }>;
  education?: Array<{ school?: string; degree?: string; field?: string; year?: string }>;
  resumeFiles?: Array<{ id?: string; fileName?: string; url?: string; mimeType?: string; updatedAt?: string }>;
  matchPreferences?: {
    desiredTitles?: string[];
    preferredLocations?: string[];
    relocation?: string;
    workModes?: string[];
    employmentTypes?: string[];
    experienceYears?: number;
    availability?: string;
    /** Collected by the "how you want to be matched" form when present. */
    workAuthorization?: string;
    requiresSponsorship?: string;
    salaryExpectation?: string;
    noticePeriod?: string;
  };
}

/* ── Small helpers ───────────────────────────────────────────────────── */

const clean = (v: unknown): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s : undefined;
};

/** A URL the member gave, normalised to something a form will accept. Returns
    undefined for anything that is not plausibly a link, rather than sending an
    employer a half-typed string. */
function link(raw: unknown): string | undefined {
  const s = clean(raw);
  if (!s) return undefined;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(s)) return `https://${s}`;
  return undefined;
}

/** Finds a social link by host, whatever key the profile filed it under. */
function socialFor(links: Record<string, string | undefined> | undefined, host: RegExp): string | undefined {
  if (!links) return undefined;
  for (const [k, v] of Object.entries(links)) {
    const url = link(v);
    if (!url) continue;
    if (host.test(k) || host.test(url)) return url;
  }
  return undefined;
}

/**
 * A full name split the way forms expect.
 *
 * Everything before the last whitespace run is the given name, the remainder
 * is the family name — which is right for most Indian, British and American
 * names and wrong for some. It is only ever used to fill a first/last pair the
 * member can see and correct, never to rewrite their stored name.
 */
export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

/** Years of experience, preferring what the member stated over what we can
    infer. Inference from an experience list is deliberately absent: periods are
    free text ("2021 – present", "3 yrs"), and a wrong number in a box labelled
    "total years of experience" is a lie with a decimal point on it. */
function years(p: ProfileLike): string | undefined {
  const stated = p.matchPreferences?.experienceYears;
  return typeof stated === 'number' && Number.isFinite(stated) && stated >= 0
    ? String(Math.round(stated))
    : undefined;
}

/** The most recent role, by position in the list — the profile editor keeps it
    newest-first, the same order the profile page renders. */
function currentRole(p: ProfileLike): { title?: string; company?: string } {
  const first = (p.experience ?? []).find((e) => clean(e.title) || clean(e.company));
  return { title: clean(first?.title), company: clean(first?.company) };
}

/** The résumé to attach: the most recently updated one that has a file behind
    it. A member with three uploaded CVs means the newest, not the first. */
export function pickResume(p: ProfileLike): AnswerSet['resume'] {
  const withFiles = (p.resumeFiles ?? []).filter((r) => clean(r.url) && clean(r.fileName));
  if (withFiles.length === 0) return undefined;
  const newest = [...withFiles].sort((a, b) =>
    Date.parse(b.updatedAt ?? '') - Date.parse(a.updatedAt ?? '') || 0)[0];
  return {
    fileName: newest.fileName!.trim(),
    url: newest.url!.trim(),
    mimeType: clean(newest.mimeType) ?? 'application/pdf',
  };
}

/** "Immediately" / "within 30 days" as a form would word it. Only from what the
    member chose — an absent availability means an absent notice period. */
const NOTICE: Record<string, string> = {
  immediately: 'Immediately',
  within_30_days: '30 days',
  within_60_days: '60 days',
  within_90_days: '90 days',
  not_looking: '',
};

/** Splits "Bengaluru, Karnataka, India" into the parts forms ask for. Only what
    is actually there: a bare "Bengaluru" yields a city and nothing else. */
export function splitLocation(raw: string | undefined): { city?: string; state?: string; country?: string } {
  const parts = (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { city: parts[0] };
  if (parts.length === 2) return { city: parts[0], country: parts[1] };
  return { city: parts[0], state: parts[1], country: parts.slice(2).join(', ') };
}

/**
 * The answer set.
 *
 * Keys are omitted rather than set to '' when the profile does not have them,
 * because the two mean different things to everything downstream: an omitted
 * key is a gap to show the member, an empty string is an answer of "blank".
 */
export function buildAnswerSet(p: ProfileLike): AnswerSet {
  const out: AnswerSet = {};
  const put = (k: keyof AnswerSet, v: string | undefined) => {
    if (v) (out as Record<string, unknown>)[k] = v;
  };

  const name = clean(p.name);
  if (name) {
    const { first, last } = splitName(name);
    put('fullName', name);
    put('firstName', first);
    put('lastName', last);
  }
  put('email', clean(p.email));
  put('phone', clean(p.phone));

  const loc = clean(p.location);
  put('location', loc);
  const { city, state, country } = splitLocation(loc);
  put('city', city);
  put('state', state);
  put('country', country);

  put('linkedin', socialFor(p.socialLinks, /linkedin/i));
  put('github', socialFor(p.socialLinks, /github/i));
  put('twitter', socialFor(p.socialLinks, /twitter|(^|\W)x\.com/i));
  put('dribbble', socialFor(p.socialLinks, /dribbble|behance/i));
  put('stackoverflow', socialFor(p.socialLinks, /stackoverflow/i));
  put('website', link(p.website));
  /* A portfolio is whatever they called a portfolio, or their own site when
     they have no other word for it. */
  put('portfolio', socialFor(p.socialLinks, /portfolio|personal|site/i) ?? link(p.website));

  const role = currentRole(p);
  put('currentTitle', role.title ?? clean(p.headline));
  put('currentCompany', role.company);
  put('yearsExperience', years(p));

  const edu = (p.education ?? []).find((e) => clean(e.school));
  put('school', clean(edu?.school));
  put('degree', clean(edu?.degree));
  put('fieldOfStudy', clean(edu?.field));
  put('graduationYear', clean(edu?.year));

  const prefs = p.matchPreferences ?? {};
  /* Stated only. See the note at the top of this file about why neither of
     these is ever inferred. */
  put('workAuthorization', clean(prefs.workAuthorization));
  put('requiresSponsorship', clean(prefs.requiresSponsorship));
  put('salaryExpectation', clean(prefs.salaryExpectation));
  /* Stated notice period first; otherwise the availability they chose, mapped
     to how a form words it. `not_looking` maps to '' on purpose — it is a real
     answer meaning "leave this blank", and `put` drops it. */
  put('noticePeriod', clean(prefs.noticePeriod) ?? clean(NOTICE[clean(prefs.availability) ?? '']));

  const relocation = clean(prefs.relocation);
  if (relocation === 'yes') put('willRelocate', 'Yes');
  else if (relocation === 'no') put('willRelocate', 'No');
  else if (relocation === 'for_the_right_role') put('willRelocate', 'Yes');

  put('howDidYouHear', 'Docrud');

  const resume = pickResume(p);
  if (resume) out.resume = resume;

  return out;
}

/** Which answers a form is likely to need that this member has not given. Drives
    the "finish your profile to apply faster" prompt — and it names the fields
    rather than a percentage, because "add your phone number" is actionable and
    "72% complete" is not. */
export function missingForApply(a: AnswerSet): string[] {
  const need: Array<[keyof AnswerSet, string]> = [
    ['fullName', 'your name'],
    ['email', 'an email address'],
    ['phone', 'a phone number'],
    ['location', 'where you are based'],
    ['linkedin', 'your LinkedIn'],
  ];
  const gaps = need.filter(([k]) => !a[k]).map(([, label]) => label);
  if (!a.resume) gaps.push('a résumé to attach');
  return gaps;
}
