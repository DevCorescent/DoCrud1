/**
 * Skill taxonomy — DATA, deliberately not logic.
 *
 * Kept out of the scoring functions on purpose: the vocabulary of a job market
 * grows constantly, and it must be possible to add "Bun" or "Terraform"
 * without editing a scorer or re-testing the maths. Everything here is a
 * lookup table; lib/server/ats/keyword.ts decides what a lookup is worth.
 *
 * Four relationships, and the distinction between them is the whole point of
 * the engine — collapsing them is how an ATS gives a false 100% match:
 *
 *   aliases  — the SAME skill written differently.        Node → Node.js
 *   parents  — this skill is a MEMBER of a broader one.   AWS Lambda → AWS
 *   related  — a NEIGHBOUR, commonly used together.       Express ~ Node.js
 *   (nothing) — unrelated. Docker is NOT Kubernetes.
 */
import type { RequirementKind } from './types';

export interface SkillEntry {
  canonical: string;
  aliases: string[];
  /** Broader skills this one belongs to. Credits the broader as `partial`. */
  parents?: string[];
  /** Adjacent skills. Credits at the low `related` rate, never as a match. */
  related?: string[];
  /** Different words for exactly the same concept — credits as `semantic`. */
  synonyms?: string[];
  kind?: RequirementKind;
}

/**
 * The dictionary. `canonical` is what a report prints; `aliases` are the forms
 * a resume or job post might actually use.
 */
export const SKILLS: SkillEntry[] = [
  /* ── Languages ─────────────────────────────────────────────────────── */
  { canonical: 'JavaScript', aliases: ['javascript', 'js', 'ecmascript', 'es6'] },
  { canonical: 'TypeScript', aliases: ['typescript', 'ts'], related: ['JavaScript'] },
  { canonical: 'Python', aliases: ['python', 'python3'] },
  { canonical: 'Java', aliases: ['java', 'java8', 'java 8', 'java 11', 'java 17'] },
  { canonical: 'Go', aliases: ['go', 'golang'] },
  { canonical: 'Rust', aliases: ['rust'] },
  { canonical: 'C++', aliases: ['c++', 'cpp'] },
  { canonical: 'C#', aliases: ['c#', 'csharp', 'c sharp'] },
  { canonical: 'PHP', aliases: ['php'] },
  { canonical: 'Ruby', aliases: ['ruby'] },
  { canonical: 'Swift', aliases: ['swift'] },
  { canonical: 'Kotlin', aliases: ['kotlin'] },
  { canonical: 'SQL', aliases: ['sql'] },
  { canonical: 'HTML', aliases: ['html', 'html5'] },
  { canonical: 'CSS', aliases: ['css', 'css3'] },

  /* ── Frontend ──────────────────────────────────────────────────────── */
  { canonical: 'React', aliases: ['react', 'react.js', 'reactjs', 'react js'] },
  { canonical: 'Next.js', aliases: ['next.js', 'nextjs', 'next js'], parents: ['React'] },
  { canonical: 'Vue.js', aliases: ['vue', 'vue.js', 'vuejs'] },
  { canonical: 'Angular', aliases: ['angular', 'angularjs', 'angular.js'] },
  { canonical: 'Svelte', aliases: ['svelte', 'sveltekit'] },
  { canonical: 'Redux', aliases: ['redux'], parents: ['React'] },
  { canonical: 'Tailwind CSS', aliases: ['tailwind', 'tailwindcss', 'tailwind css'], parents: ['CSS'] },

  /* ── Backend ───────────────────────────────────────────────────────── */
  { canonical: 'Node.js', aliases: ['node', 'node.js', 'nodejs', 'node js'] },
  { canonical: 'Express.js', aliases: ['express', 'express.js', 'expressjs'], parents: ['Node.js'] },
  { canonical: 'NestJS', aliases: ['nest', 'nestjs', 'nest.js'], parents: ['Node.js'] },
  { canonical: 'Django', aliases: ['django'], parents: ['Python'] },
  { canonical: 'Flask', aliases: ['flask'], parents: ['Python'] },
  { canonical: 'FastAPI', aliases: ['fastapi', 'fast api'], parents: ['Python'] },
  { canonical: 'Spring', aliases: ['spring', 'spring boot', 'springboot'], parents: ['Java'] },
  { canonical: '.NET', aliases: ['.net', 'dotnet', 'asp.net'], parents: ['C#'] },
  { canonical: 'REST APIs', aliases: ['rest', 'rest api', 'rest apis', 'restful'],
    synonyms: ['restful services', 'rest services', 'web apis'] },
  { canonical: 'GraphQL', aliases: ['graphql'], related: ['REST APIs'] },
  { canonical: 'gRPC', aliases: ['grpc'], related: ['REST APIs'] },
  { canonical: 'Microservices', aliases: ['microservices', 'microservice'] },

  /* ── Databases ─────────────────────────────────────────────────────── */
  { canonical: 'PostgreSQL', aliases: ['postgres', 'postgresql', 'psql'], parents: ['SQL'] },
  { canonical: 'MySQL', aliases: ['mysql'], parents: ['SQL'] },
  { canonical: 'MongoDB', aliases: ['mongo', 'mongodb'] },
  { canonical: 'Redis', aliases: ['redis'] },
  { canonical: 'Elasticsearch', aliases: ['elasticsearch', 'elastic search', 'opensearch'] },
  { canonical: 'DynamoDB', aliases: ['dynamodb', 'dynamo'], parents: ['AWS'] },

  /* ── Cloud & infrastructure ────────────────────────────────────────── */
  { canonical: 'AWS', aliases: ['aws', 'amazon web services'] },
  { canonical: 'AWS Lambda', aliases: ['lambda', 'aws lambda'], parents: ['AWS'] },
  { canonical: 'Amazon S3', aliases: ['s3', 'amazon s3', 'aws s3'], parents: ['AWS'] },
  { canonical: 'Amazon EC2', aliases: ['ec2', 'amazon ec2', 'aws ec2'], parents: ['AWS'] },
  { canonical: 'Azure', aliases: ['azure', 'microsoft azure'] },
  { canonical: 'GCP', aliases: ['gcp', 'google cloud', 'google cloud platform'] },
  /* Docker and Kubernetes are NEIGHBOURS, never substitutes. Treating one as
     the other is the single most common way an ATS invents a match. */
  { canonical: 'Docker', aliases: ['docker', 'containerization', 'containers'], related: ['Kubernetes'] },
  { canonical: 'Kubernetes', aliases: ['kubernetes', 'k8s'], related: ['Docker'] },
  { canonical: 'Terraform', aliases: ['terraform'], related: ['AWS'] },
  { canonical: 'CI/CD', aliases: ['ci/cd', 'ci cd', 'cicd', 'continuous integration', 'continuous delivery'],
    synonyms: ['build pipelines', 'deployment pipelines'] },
  { canonical: 'Jenkins', aliases: ['jenkins'], parents: ['CI/CD'] },
  { canonical: 'GitHub Actions', aliases: ['github actions'], parents: ['CI/CD'] },
  { canonical: 'Git', aliases: ['git', 'github', 'gitlab', 'version control'] },
  { canonical: 'Linux', aliases: ['linux', 'unix'] },

  /* ── Data & analytics ──────────────────────────────────────────────── */
  { canonical: 'Excel', aliases: ['excel', 'ms excel', 'microsoft excel', 'spreadsheets'] },
  { canonical: 'Power BI', aliases: ['power bi', 'powerbi'] },
  { canonical: 'Tableau', aliases: ['tableau'] },
  { canonical: 'Pandas', aliases: ['pandas'], parents: ['Python'] },
  { canonical: 'TensorFlow', aliases: ['tensorflow'], related: ['PyTorch'] },
  { canonical: 'PyTorch', aliases: ['pytorch'], related: ['TensorFlow'] },
  { canonical: 'Machine Learning', aliases: ['machine learning', 'ml'] },

  /* ── Methodologies ─────────────────────────────────────────────────── */
  { canonical: 'Agile', aliases: ['agile'], kind: 'methodology' },
  { canonical: 'Scrum', aliases: ['scrum'], parents: ['Agile'], kind: 'methodology' },
  { canonical: 'Kanban', aliases: ['kanban'], parents: ['Agile'], kind: 'methodology' },
  { canonical: 'TDD', aliases: ['tdd', 'test driven development', 'test-driven development'], kind: 'methodology' },
  { canonical: 'System Design', aliases: ['system design', 'distributed systems'], kind: 'methodology' },

  /* ── Certifications ────────────────────────────────────────────────── */
  { canonical: 'CPA', aliases: ['cpa', 'certified public accountant'], kind: 'certification' },
  { canonical: 'PMP', aliases: ['pmp', 'project management professional'], kind: 'certification' },
  { canonical: 'CFA', aliases: ['cfa', 'chartered financial analyst'], kind: 'certification' },
  { canonical: 'AWS Certified Solutions Architect',
    aliases: ['aws certified solutions architect', 'aws solutions architect'],
    parents: ['AWS'], kind: 'certification' },
  { canonical: 'CISSP', aliases: ['cissp'], kind: 'certification' },
  { canonical: 'Certified Scrum Master', aliases: ['csm', 'certified scrum master', 'scrum master certification'],
    parents: ['Scrum'], kind: 'certification' },
];

/** alias (lowercased) → canonical. Built once; the table never changes at runtime. */
const ALIAS_INDEX = new Map<string, string>();
/** canonical (lowercased) → entry. */
const CANONICAL_INDEX = new Map<string, SkillEntry>();
/** synonym phrase (lowercased) → canonical. */
const SYNONYM_INDEX = new Map<string, string>();

for (const entry of SKILLS) {
  CANONICAL_INDEX.set(entry.canonical.toLowerCase(), entry);
  ALIAS_INDEX.set(entry.canonical.toLowerCase(), entry.canonical);
  for (const alias of entry.aliases) ALIAS_INDEX.set(alias.toLowerCase(), entry.canonical);
  for (const syn of entry.synonyms ?? []) SYNONYM_INDEX.set(syn.toLowerCase(), entry.canonical);
}

/** The canonical name for a phrase, or null when the taxonomy does not know it. */
export function canonicalize(phrase: string): string | null {
  const key = phrase.trim().toLowerCase();
  if (!key) return null;
  return ALIAS_INDEX.get(key) ?? null;
}

/** The canonical name a phrase is a SYNONYM of — a weaker relationship than an alias. */
export function canonicalizeSynonym(phrase: string): string | null {
  return SYNONYM_INDEX.get(phrase.trim().toLowerCase()) ?? null;
}

export function skillEntry(canonical: string): SkillEntry | null {
  return CANONICAL_INDEX.get(canonical.trim().toLowerCase()) ?? null;
}

/** True when `child` is a narrower member of `parent` — AWS Lambda inside AWS. */
export function isChildOf(child: string, parent: string): boolean {
  const entry = skillEntry(child);
  if (!entry?.parents) return false;
  return entry.parents.some((p) => p.toLowerCase() === parent.trim().toLowerCase());
}

/** True when the two are neighbours. Symmetric: either side may declare it. */
export function isRelated(a: string, b: string): boolean {
  const left = skillEntry(a);
  const right = skillEntry(b);
  const lower = (s: string) => s.toLowerCase();
  if (left?.related?.some((r) => lower(r) === lower(b))) return true;
  if (right?.related?.some((r) => lower(r) === lower(a))) return true;
  /* Siblings under one parent are neighbours too: Flask and Django are both
     Python web frameworks, and neither is the other. */
  if (left?.parents && right?.parents) {
    return left.parents.some((p) => right.parents!.some((q) => lower(p) === lower(q)));
  }
  return false;
}

/** Every alias of every known skill, longest first so "node.js" beats "node". */
export const ALL_SURFACE_FORMS: string[] = Array.from(ALIAS_INDEX.keys())
  .concat(Array.from(SYNONYM_INDEX.keys()))
  .sort((a, b) => b.length - a.length);

/** The canonical for any surface form, alias or synonym. */
export function resolveSurface(surface: string): string | null {
  return canonicalize(surface) ?? canonicalizeSynonym(surface);
}
