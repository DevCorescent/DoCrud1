/**
 * Query understanding — the deterministic rules layer.
 *
 * Extracted verbatim from lib/server/search-intelligence.ts so that BOTH the
 * server engine and the client-side list rankers share one taxonomy, one
 * stopword list and one notion of roles/skills/locations. Before this split
 * there were two: the server taxonomy here, and a smaller ad-hoc stopword list
 * inside the relevance ranker, which could disagree about what a query means.
 *
 * This file is deliberately free of server-only imports (no Groq client, no
 * database, no `lib/server/*`) so it is safe to bundle into the browser. The
 * optional LLM enrichment stays behind in search-intelligence.ts, which
 * re-exports everything here so every existing import keeps working.
 */

export type SearchEntityType =
  | 'person' | 'service' | 'business' | 'job' | 'gig' | 'post' | 'file' | 'feature' | 'product' | 'event';

export interface QueryUnderstanding {
  raw: string;
  /** Query with filler/stopwords removed — what lexical scorers should use. */
  cleaned: string;
  intent: 'find_provider' | 'find_work' | 'find_content' | 'browse';
  /** Entity types the phrasing points at. Empty means "no strong preference". */
  entityTypes: SearchEntityType[];
  roles: string[];
  skills: string[];
  domains: string[];
  locations: string[];
  /**
   * True when the phrasing states a location constraint ("developer **in
   * Delhi**", "businesses **based in** Bangalore") rather than merely
   * mentioning a place. Only a constraint re-orders results; an incidental
   * mention keeps the ordinary 10% location weight.
   */
  locationConstraint: boolean;
  nearMe: boolean;
  experience: 'fresher' | 'junior' | 'mid' | 'senior' | null;
  /** Content-bearing tokens from the query. */
  terms: string[];
  /** Related/synonym terms added by the taxonomy (and AI, when available). */
  expanded: string[];
  source: 'rules' | 'rules+ai';
}

/* ── Filler the user says but never appears in stored data ─────────────────── */
const STOPWORDS = new Set([
  'i', 'im', 'ive', 'me', 'my', 'we', 'our', 'you', 'your', 'a', 'an', 'the',
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'doing', 'can', 'could', 'will', 'would', 'shall',
  'should', 'may', 'might', 'must', 'need', 'needs', 'needed', 'want', 'wants',
  'looking', 'look', 'find', 'finding', 'search', 'searching', 'seeking', 'seek',
  'someone', 'somebody', 'anyone', 'people', 'person', 'guy', 'who', 'whom',
  'that', 'which', 'what', 'where', 'when', 'how', 'why',
  'for', 'to', 'of', 'in', 'on', 'at', 'with', 'and', 'or', 'but', 'from',
  'by', 'as', 'it', 'this', 'these', 'those', 'there', 'here', 'help', 'helps',
  'get', 'got', 'give', 'please', 'kindly', 'hi', 'hello', 'best', 'good',
  'top', 'some', 'any', 'also', 'about', 'into', 'have', 'has', 'had',
]);

/* Words that mean "person", not the literal token — used for intent only. */
const PROVIDER_HINTS = ['developer', 'designer', 'freelancer', 'engineer', 'consultant', 'expert', 'professional', 'specialist', 'writer', 'marketer', 'agency', 'company', 'firm', 'studio', 'business', 'vendor', 'provider', 'partner'];
const WORK_HINTS = ['job', 'jobs', 'vacancy', 'vacancies', 'opening', 'openings', 'hiring', 'internship', 'intern', 'position', 'role', 'career', 'careers', 'recruitment'];
const CONTENT_HINTS = ['article', 'articles', 'blog', 'post', 'posts', 'guide', 'tutorial', 'read', 'news', 'document', 'documents', 'template', 'templates', 'file', 'files'];

/**
 * Curated concept taxonomy.
 *
 * `match` are the phrases that trigger the concept (checked against the raw
 * query, so multi-word phrases work). `expand` are the terms added to the
 * search vocabulary so that "makes mobile apps" can reach a stored profile that
 * only ever says "Flutter Developer".
 *
 * Kept intentionally small and hand-written: every entry is a real term that
 * appears in this product's domain. It is data, not intelligence theatre —
 * extend it as the corpus grows.
 */
interface Concept {
  id: string;
  kind: 'skill' | 'role' | 'domain' | 'service';
  match: string[];
  expand: string[];
}

const CONCEPTS: Concept[] = [
  // ── Web / frontend ──
  { id: 'react', kind: 'skill', match: ['react', 'reactjs', 'react.js'], expand: ['react', 'reactjs', 'next.js', 'nextjs', 'frontend', 'javascript', 'typescript', 'jsx'] },
  { id: 'frontend', kind: 'role', match: ['frontend', 'front end', 'front-end', 'ui developer'], expand: ['frontend', 'react', 'vue', 'angular', 'javascript', 'typescript', 'html', 'css', 'tailwind', 'ui'] },
  { id: 'backend', kind: 'role', match: ['backend', 'back end', 'back-end', 'server side', 'api developer'], expand: ['backend', 'node', 'nodejs', 'express', 'django', 'api', 'database', 'postgres', 'mongodb'] },
  { id: 'fullstack', kind: 'role', match: ['full stack', 'fullstack', 'full-stack'], expand: ['full stack', 'fullstack', 'frontend', 'backend', 'react', 'node', 'mern'] },
  { id: 'website', kind: 'service', match: ['website', 'web site', 'web development', 'web app', 'webapp', 'web application', 'landing page'], expand: ['website', 'web development', 'web design', 'frontend', 'react', 'nextjs', 'wordpress', 'full stack'] },
  { id: 'wordpress', kind: 'skill', match: ['wordpress', 'wp'], expand: ['wordpress', 'cms', 'php', 'website', 'elementor'] },

  // ── Mobile ──
  { id: 'mobile', kind: 'service', match: ['mobile app', 'mobile application', 'android app', 'ios app', 'app development', 'makes apps', 'build an app', 'mobile developer'], expand: ['mobile', 'app development', 'flutter', 'react native', 'android', 'ios', 'kotlin', 'swift', 'dart', 'mobile app developer'] },
  { id: 'flutter', kind: 'skill', match: ['flutter', 'dart'], expand: ['flutter', 'dart', 'mobile', 'cross platform', 'android', 'ios'] },
  { id: 'reactnative', kind: 'skill', match: ['react native', 'react-native'], expand: ['react native', 'mobile', 'android', 'ios', 'javascript'] },

  // ── Commerce / product domains ──
  { id: 'ecommerce', kind: 'domain', match: ['ecommerce', 'e-commerce', 'e commerce', 'online store', 'online shop', 'shopping site', 'shopify'], expand: ['ecommerce', 'e-commerce', 'shopify', 'woocommerce', 'online store', 'payment gateway', 'cart', 'magento'] },
  { id: 'saas', kind: 'domain', match: ['saas', 'software as a service', 'subscription platform'], expand: ['saas', 'platform', 'multi tenant', 'subscription', 'b2b', 'cloud', 'dashboard'] },
  { id: 'crm', kind: 'domain', match: ['crm', 'customer relationship'], expand: ['crm', 'salesforce', 'hubspot', 'zoho', 'sales', 'pipeline', 'erp'] },
  { id: 'erp', kind: 'domain', match: ['erp', 'enterprise resource'], expand: ['erp', 'sap', 'odoo', 'netsuite', 'tally', 'inventory', 'accounting software', 'crm'] },
  { id: 'healthcare', kind: 'domain', match: ['healthcare', 'health care', 'medical', 'hospital', 'clinic', 'telemedicine'], expand: ['healthcare', 'medical', 'health', 'hospital', 'hipaa', 'telemedicine', 'patient'] },
  { id: 'fintech', kind: 'domain', match: ['fintech', 'banking', 'payments', 'payment gateway', 'financial'], expand: ['fintech', 'payments', 'banking', 'razorpay', 'stripe', 'finance', 'upi'] },
  { id: 'education', kind: 'domain', match: ['edtech', 'education', 'lms', 'e-learning', 'elearning', 'learning platform'], expand: ['edtech', 'education', 'lms', 'e-learning', 'course', 'student'] },

  // ── Data / AI ──
  { id: 'ai', kind: 'skill', match: ['ai', 'artificial intelligence', 'machine learning', 'ml', 'deep learning', 'llm', 'gen ai', 'generative ai'], expand: ['ai', 'artificial intelligence', 'machine learning', 'ml', 'deep learning', 'llm', 'nlp', 'python', 'tensorflow', 'pytorch', 'data science'] },
  { id: 'data', kind: 'skill', match: ['data science', 'data analyst', 'analytics', 'data engineer', 'big data'], expand: ['data science', 'analytics', 'data analyst', 'python', 'sql', 'power bi', 'tableau', 'pandas'] },

  // ── Design / creative ──
  { id: 'design', kind: 'role', match: ['designer', 'design', 'ui/ux', 'ui ux', 'ux', 'ui'], expand: ['designer', 'ui', 'ux', 'figma', 'product design', 'wireframe', 'prototype'] },
  { id: 'graphic', kind: 'role', match: ['graphic designer', 'graphic design', 'branding', 'brand identity', 'logo'], expand: ['graphic design', 'branding', 'logo', 'illustrator', 'photoshop', 'brand identity', 'visual design', 'creative'] },
  { id: 'video', kind: 'skill', match: ['video editing', 'video editor', 'motion graphics', 'animation'], expand: ['video editing', 'motion graphics', 'after effects', 'premiere', 'animation', 'reels'] },

  // ── Business services ──
  { id: 'marketing', kind: 'service', match: ['digital marketing', 'marketing', 'seo', 'social media', 'ads', 'performance marketing'], expand: ['digital marketing', 'seo', 'sem', 'social media', 'google ads', 'content marketing', 'growth', 'ppc'] },
  { id: 'accounting', kind: 'service', match: ['accounting', 'accountant', 'bookkeeping', 'audit', 'taxation', 'tax', 'gst', 'ca'], expand: ['accounting', 'bookkeeping', 'tax', 'gst', 'audit', 'chartered accountant', 'finance', 'compliance'] },
  { id: 'legal', kind: 'service', match: ['legal', 'lawyer', 'advocate', 'contract drafting', 'compliance'], expand: ['legal', 'lawyer', 'advocate', 'contract', 'compliance', 'agreement', 'nda'] },
  { id: 'content', kind: 'service', match: ['content writing', 'copywriting', 'content writer', 'blog writing'], expand: ['content writing', 'copywriting', 'content', 'blog', 'seo writing', 'editor'] },
  { id: 'hr', kind: 'service', match: ['hr', 'recruitment', 'staffing', 'talent acquisition'], expand: ['hr', 'recruitment', 'hiring', 'staffing', 'talent'] },

  // ── Infra ──
  { id: 'cloud', kind: 'skill', match: ['cloud', 'aws', 'azure', 'gcp', 'devops', 'kubernetes'], expand: ['cloud', 'aws', 'azure', 'gcp', 'devops', 'kubernetes', 'docker', 'ci/cd', 'infrastructure'] },
];

/* Roles worth recognising on their own, even without a concept hit. */
const ROLE_WORDS = ['developer', 'engineer', 'designer', 'writer', 'marketer', 'analyst', 'consultant', 'manager', 'architect', 'accountant', 'lawyer', 'photographer', 'editor', 'freelancer', 'agency', 'company'];

const EXPERIENCE_PATTERNS: Array<[RegExp, QueryUnderstanding['experience']]> = [
  [/\b(fresher|freshers|entry.level|entry level|beginner|graduate|no experience)\b/i, 'fresher'],
  [/\b(junior|jr\.?)\b/i, 'junior'],
  [/\b(mid.level|mid level|intermediate)\b/i, 'mid'],
  [/\b(senior|sr\.?|lead|principal|expert|experienced)\b/i, 'senior'],
];

const NEAR_ME = /\b(near me|around me|nearby|close to me|in my area|my city)\b/i;
/* "in Delhi", "based in Mumbai", "near Pune", "from Bangalore", "at Noida" */
const LOCATION_PREP = /\b(?:in|near|around|based in|located in|from|at|available in)\s+([a-z][a-z\s.'-]{1,28}?)(?=\s+(?:who|that|which|for|with|and|to|can|able)\b|[,.]|$)/gi;

export function normalize(v: string) { return v.trim().toLowerCase(); }

const phraseCache = new Map<string, RegExp>();
/** Whole-word (or whole-phrase) containment. "ui" must not match "build". */
function phraseInQuery(haystack: string, phrase: string): boolean {
  let re = phraseCache.get(phrase);
  if (!re) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Boundaries are non-word-char or string edge, so "react.js" and "ui/ux"
    // still match while staying anchored.
    re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
    phraseCache.set(phrase, re);
  }
  return re.test(haystack);
}

/** Bigram similarity, 0–1. Used only as a typo fallback. */
export function bigramSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 3 || b.length < 3) return 0;
  const grams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const ga = grams(a); const gb = grams(b);
  let hits = 0;
  ga.forEach((g) => { if (gb.has(g)) hits++; });
  return (2 * hits) / (ga.size + gb.size);
}

function tokenize(v: string): string[] {
  return normalize(v)
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .split(/[\s,/]+/)
    .map((t) => t.replace(/^[.-]+|[.-]+$/g, ''))
    .filter(Boolean);
}

/**
 * Location vocabulary comes from the corpus, not from a hardcoded gazetteer:
 * a token is only treated as a place if some profile / business / job actually
 * stores it as a location. That keeps us from inventing geography.
 */
/**
 * City name equivalences and one metro grouping.
 *
 * These are naming variants of the *same* place (Bengaluru = Bangalore) plus
 * the NCR grouping the product explicitly treats as one market. Nothing here
 * infers distance or invents geography — anything not listed is simply "not a
 * known equivalence" and falls back to string matching against stored values.
 */
const LOCATION_ALIASES: string[][] = [
  ['delhi', 'new delhi', 'delhi ncr', 'ncr'],
  ['gurgaon', 'gurugram'],
  ['bangalore', 'bengaluru', 'bengaluru karnataka'],
  ['mumbai', 'bombay', 'navi mumbai'],
  ['kolkata', 'calcutta'],
  ['chennai', 'madras'],
  ['noida', 'greater noida'],
  ['ahmedabad', 'amdavad'],
  ['pune'], ['hyderabad'], ['jaipur'], ['indore'], ['surat'], ['lucknow'],
];

/** Places treated as one commuting market — the tier below a true alias. */
const REGION_GROUPS: string[][] = [
  ['delhi', 'new delhi', 'delhi ncr', 'ncr', 'gurgaon', 'gurugram', 'noida', 'greater noida', 'ghaziabad', 'faridabad'],
];

const canonicalOf = new Map<string, string>();
for (const group of LOCATION_ALIASES) for (const name of group) canonicalOf.set(name, group[0]);
const regionOf = new Map<string, string>();
for (const group of REGION_GROUPS) for (const name of group) regionOf.set(name, group[0]);

export type LocationTier = 'exact' | 'alias' | 'region' | 'partial' | 'none' | 'unknown';

/**
 * How well a stored location satisfies the requested one.
 * `unknown` means the record has no location at all — distinct from `none`
 * (it has one, and it is somewhere else).
 */
export function matchLocation(entityLocation: string | null | undefined, wanted: string[]): LocationTier {
  if (!wanted.length) return 'unknown';
  const raw = normalize(entityLocation ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return 'unknown';
  // Stored values look like "Bengaluru", "Bangalore, India", "Mehsana  Gujarat".
  const parts = raw.split(/[,/|]/).map((s) => s.trim()).filter(Boolean);
  const words = new Set(raw.split(/[\s,]+/).filter(Boolean));

  let best: LocationTier = 'none';
  const rank: Record<LocationTier, number> = { exact: 5, alias: 4, region: 3, partial: 2, none: 1, unknown: 0 };
  const better = (t: LocationTier) => { if (rank[t] > rank[best]) best = t; };

  for (const want of wanted) {
    const w = normalize(want);
    if (!w) continue;
    if (parts.includes(w) || raw === w) { better('exact'); continue; }

    const wantCanon = canonicalOf.get(w) ?? w;
    const hitAlias = parts.some((p) => (canonicalOf.get(p) ?? p) === wantCanon)
      || Array.from(words).some((token) => (canonicalOf.get(token) ?? token) === wantCanon);
    if (hitAlias) { better('alias'); continue; }

    const wantRegion = regionOf.get(w);
    if (wantRegion) {
      const hitRegion = parts.some((p) => regionOf.get(p) === wantRegion)
        || Array.from(words).some((token) => regionOf.get(token) === wantRegion);
      if (hitRegion) { better('region'); continue; }
    }

    // Substring both ways covers "Bengaluru " vs "Bengaluru Karnataka".
    if (words.has(w) || raw.includes(w) || (w.length >= 5 && parts.some((p) => w.includes(p) && p.length >= 5))) {
      better('partial');
    }
  }
  return best;
}

/* Words that appear inside stored locations but are not places a user searches
   for on their own — indexing them would make "new" or "india" a location. */
const LOCATION_NOISE = new Set(['new', 'india', 'usa', 'uk', 'the', 'and', 'city', 'area', 'ncr', 'state', 'region', 'near']);

export function buildLocationVocabulary(values: Array<string | undefined | null>): Set<string> {
  const vocab = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    for (const part of String(value).split(/[,/|]/)) {
      const clean = normalize(part).replace(/[^a-z\s-]/g, '').replace(/\s+/g, ' ').trim();
      if (clean.length >= 3 && clean.length <= 30) vocab.add(clean);
      /* Index every meaningful word, not just the first. Real stored values are
         "New Delhi", "Bengaluru Karnataka", "Bangalore, India" — indexing only
         the leading word meant a search for "Delhi" never matched "New Delhi". */
      for (const word of clean.split(' ')) {
        if (word.length >= 4 && !LOCATION_NOISE.has(word)) vocab.add(word);
      }
    }
  }
  return vocab;
}

function detectIntent(q: string): QueryUnderstanding['intent'] {
  const tokens = new Set(tokenize(q));
  if (WORK_HINTS.some((w) => tokens.has(w))) return 'find_work';
  if (CONTENT_HINTS.some((w) => tokens.has(w))) return 'find_content';
  if (PROVIDER_HINTS.some((w) => tokens.has(w))) return 'find_provider';
  if (/\b(need|looking for|want|hire|find me|require)\b/i.test(q)) return 'find_provider';
  return 'browse';
}

function entityTypesFor(intent: QueryUnderstanding['intent'], q: string): SearchEntityType[] {
  const tokens = new Set(tokenize(q));
  const types = new Set<SearchEntityType>();
  if (intent === 'find_work') { types.add('job'); types.add('gig'); }
  else if (intent === 'find_content') { types.add('post'); types.add('file'); }
  else if (intent === 'find_provider') { types.add('person'); types.add('service'); types.add('business'); }
  // Explicit nouns override/extend the inference.
  if (['company', 'companies', 'business', 'businesses', 'firm', 'agency', 'agencies', 'startup', 'organisation', 'organization'].some((w) => tokens.has(w))) types.add('business');
  if (['freelancer', 'freelancers', 'developer', 'designer', 'consultant', 'expert'].some((w) => tokens.has(w))) { types.add('person'); types.add('service'); }
  if (['service', 'services'].some((w) => tokens.has(w))) types.add('service');
  if (['gig', 'gigs', 'project', 'projects'].some((w) => tokens.has(w))) types.add('gig');
  return Array.from(types);
}

/** Rules-only understanding. Always succeeds, never calls the network. */
export function understandQuerySync(raw: string, locationVocab?: Set<string>): QueryUnderstanding {
  const trimmed = raw.slice(0, 400).trim();
  const lower = normalize(trimmed);
  const nearMe = NEAR_ME.test(lower);

  /* Locations: prepositional phrases first, then bare tokens, both validated
     against the corpus vocabulary when one is supplied. */
  const locations = new Set<string>();
  /* A place reached through "in / based in / near / available in" is a
     constraint the user stated. A place merely recognised as a bare token is
     not — "Delhi startups hiring" should not exclude everyone else. */
  let locationConstraint = false;
  const knownPlace = (value: string) => {
    if (locationVocab?.has(value)) return true;
    // Aliases count as known even if only the other spelling is stored.
    const canon = canonicalOf.get(value);
    if (!canon || !locationVocab) return false;
    for (const group of LOCATION_ALIASES) {
      if (group[0] !== canon) continue;
      if (group.some((name) => locationVocab.has(name))) return true;
    }
    return false;
  };

  if (locationVocab?.size) {
    LOCATION_PREP.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LOCATION_PREP.exec(lower)) !== null) {
      const candidate = normalize(m[1] ?? '').replace(/\s+(who|that|which|for|with|and)\b.*$/, '').trim();
      if (!candidate) continue;
      if (knownPlace(candidate)) { locations.add(candidate); locationConstraint = true; continue; }
      const head = candidate.split(/\s+/)[0];
      if (head && knownPlace(head)) { locations.add(head); locationConstraint = true; }
    }
    if (!locations.size) {
      for (const token of tokenize(lower)) {
        if (token.length >= 3 && !STOPWORDS.has(token) && knownPlace(token)) locations.add(token);
      }
    }
  }

  /* Concepts → skills / roles / domains / expansion terms.
     Matching is word-boundary anchored: a bare `includes` made "ui" fire on
     "build", "ca" fire on "can", and "ml" fire on "html", which pulled wildly
     unrelated concepts (and their expansions) into every sentence query. */
  const skills = new Set<string>();
  const domains = new Set<string>();
  const roles = new Set<string>();
  const expanded = new Set<string>();
  for (const concept of CONCEPTS) {
    const hit = concept.match.some((phrase) => phraseInQuery(lower, phrase));
    if (!hit) continue;
    for (const term of concept.expand) expanded.add(term);
    if (concept.kind === 'skill') skills.add(concept.id);
    else if (concept.kind === 'domain') domains.add(concept.id);
    else if (concept.kind === 'role') roles.add(concept.id);
  }
  for (const token of tokenize(lower)) {
    if (ROLE_WORDS.includes(token)) roles.add(token);
  }

  let experience: QueryUnderstanding['experience'] = null;
  for (const [re, level] of EXPERIENCE_PATTERNS) {
    if (re.test(lower)) { experience = level; break; }
  }

  /* Content tokens: drop filler and anything already claimed as a location. */
  const terms = tokenize(lower).filter((t) =>
    t.length >= 2 && !STOPWORDS.has(t) && !locations.has(t) && !/^\d+$/.test(t));

  const intent = detectIntent(lower);

  return {
    raw: trimmed,
    cleaned: terms.join(' ') || lower,
    intent,
    entityTypes: entityTypesFor(intent, lower),
    roles: Array.from(roles),
    skills: Array.from(skills),
    domains: Array.from(domains),
    locations: Array.from(locations),
    locationConstraint,
    nearMe,
    experience,
    terms,
    expanded: Array.from(expanded).filter((t) => !terms.includes(t)),
    source: 'rules',
  };
}

/** Terms used for lexical matching, most specific first. */
export function searchVocabulary(u: QueryUnderstanding): string[] {
  return Array.from(new Set([...u.terms, ...u.skills, ...u.roles, ...u.domains, ...u.expanded]))
    .filter((t) => t.length >= 2)
    .slice(0, 60);
}
