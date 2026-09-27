/**
 * The questions every job application form asks, as a closed set.
 *
 * ═══ WHY A TAXONOMY AND NOT FREE TEXT ═══
 *
 * Greenhouse calls it `job_application[first_name]`, Lever calls it `name`,
 * Workday calls it `--fullName`, and a hand-rolled form on a company's own site
 * calls it `applicant-name-1`. They are all the same question. Mapping each
 * form's own vocabulary onto ONE set of keys is what lets a single stored
 * answer fill a field on a site nobody has seen before.
 *
 * Everything downstream is keyed by these: the answer set the server builds
 * from a profile, the matcher that reads a form, the review panel that shows
 * what will be sent. Adding a question means adding it here first.
 *
 * ═══ NO DEPENDENCIES ═══
 *
 * Deliberately a leaf module. The server imports it, the API contract is typed
 * by it, and the shape it describes is what the browser extension receives —
 * so it must not drag the app's server code behind it.
 */

/** A question a form can ask, in the canonical vocabulary. */
export type AnswerKey =
  /* Identity */
  | 'fullName' | 'firstName' | 'lastName' | 'preferredName'
  | 'email' | 'phone'
  /* Where they are */
  | 'location' | 'city' | 'state' | 'country' | 'postalCode' | 'addressLine'
  /* Where to read more */
  | 'linkedin' | 'github' | 'portfolio' | 'website' | 'twitter' | 'dribbble' | 'stackoverflow'
  /* What they do now */
  | 'currentTitle' | 'currentCompany' | 'yearsExperience'
  /* Schooling */
  | 'school' | 'degree' | 'fieldOfStudy' | 'graduationYear'
  /* The awkward ones every ATS asks */
  | 'workAuthorization' | 'requiresSponsorship' | 'willRelocate'
  | 'noticePeriod' | 'availableFrom' | 'salaryExpectation' | 'currentSalary'
  /* Attachments and prose */
  | 'resume' | 'coverLetter' | 'howDidYouHear'
  /* Anything the taxonomy does not name — answered by AI against the job. */
  | 'freeText';

/** Keys whose value is a file rather than a string. */
export const FILE_KEYS: ReadonlySet<AnswerKey> = new Set<AnswerKey>(['resume']);

/** Keys a person would reasonably expect to check before an employer sees it. */
export const REVIEW_KEYS: ReadonlySet<AnswerKey> = new Set<AnswerKey>([
  'coverLetter', 'salaryExpectation', 'currentSalary', 'freeText',
]);

/**
 * One answer, ready to be written into a field.
 *
 * `confidence` is the matcher's, not the answer's: how sure it is that THIS
 * field is asking THAT question. The extension fills high confidence silently
 * and flags the rest, because a wrong answer in a salary box is worse than an
 * empty one.
 */
export interface Answer {
  key: AnswerKey;
  value: string;
  /** 0–1. Below `FILL_THRESHOLD` the field is filled but flagged for review. */
  confidence: number;
  /** Why the matcher chose this key — shown in the review panel. */
  reason: string;
  /** True when a person should look before this is sent. */
  review: boolean;
}

/** At or above this the extension fills without comment. */
export const FILL_THRESHOLD = 0.72;
/** Below this nothing is written at all — an empty field beats a wrong one. */
export const SKIP_THRESHOLD = 0.42;

/**
 * The canonical answer set, built once per user from their profile.
 *
 * Every value is a string because every form field takes one. A missing answer
 * is absent rather than empty: "" is a real answer meaning "leave it blank",
 * and the two must not be confused when deciding whether a profile is complete
 * enough to apply with.
 */
export type AnswerSet = Partial<Record<Exclude<AnswerKey, 'freeText' | 'resume'>, string>> & {
  /** The resume, as something the extension can attach. */
  resume?: { fileName: string; url: string; mimeType: string };
};

/** A form control the content script found, described in a way the server can
    map without ever seeing the page. */
export interface FieldDescriptor {
  /** Stable handle the extension uses to write the value back. */
  id: string;
  /** The control's own attributes, whichever of them exist. */
  name?: string;
  domId?: string;
  type?: string;
  autocomplete?: string;
  placeholder?: string;
  ariaLabel?: string;
  /** The visible text of the <label> bound to it, or its nearest heading. */
  label?: string;
  required?: boolean;
  /** For select/radio/checkbox groups: what the candidate may choose from. */
  options?: string[];
  /** A textarea is prose; an input is not. Drives the AI path. */
  multiline?: boolean;
  maxLength?: number;
}

/** What the server sends back for one field. */
export interface FieldFill {
  id: string;
  /** The question as the page worded it, echoed back so the review panel can
      name the field the way the candidate sees it rather than by our key. */
  label?: string;
  /** Absent when nothing should be written. */
  value?: string;
  key: AnswerKey;
  confidence: number;
  reason: string;
  review: boolean;
  /** Set when the value must be chosen from `options` rather than typed. */
  option?: string;
  /** Other options from this field's own list that plausibly mean the same
      thing, best first. Offered in the sidebar's editor so changing an answer
      is a press rather than a hunt through a long dropdown. Never written
      anywhere on its own. */
  alternatives?: string[];
  /** Set for a file input. */
  file?: { fileName: string; url: string; mimeType: string };
}

/** Human-readable names, for the review panel. */
export const ANSWER_LABELS: Record<AnswerKey, string> = {
  fullName: 'Full name', firstName: 'First name', lastName: 'Last name',
  preferredName: 'Preferred name', email: 'Email', phone: 'Phone',
  location: 'Location', city: 'City', state: 'State / region', country: 'Country',
  postalCode: 'Postal code', addressLine: 'Address',
  linkedin: 'LinkedIn', github: 'GitHub', portfolio: 'Portfolio', website: 'Website',
  twitter: 'X / Twitter', dribbble: 'Dribbble', stackoverflow: 'Stack Overflow',
  currentTitle: 'Current title', currentCompany: 'Current company',
  yearsExperience: 'Years of experience',
  school: 'School', degree: 'Degree', fieldOfStudy: 'Field of study',
  graduationYear: 'Graduation year',
  workAuthorization: 'Work authorisation', requiresSponsorship: 'Needs sponsorship',
  willRelocate: 'Will relocate', noticePeriod: 'Notice period',
  availableFrom: 'Available from', salaryExpectation: 'Expected salary',
  currentSalary: 'Current salary',
  resume: 'Resume', coverLetter: 'Cover letter', howDidYouHear: 'How did you hear about us',
  freeText: 'Written answer',
};
