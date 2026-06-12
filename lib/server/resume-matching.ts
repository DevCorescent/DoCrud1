import { generateAiText, isAiConfigured, parseStructuredJson } from '@/lib/server/ai';
import type { ResumeDirectoryEntry } from '@/lib/server/resume-directory';

type JdSignals = {
  raw: string;
  tokens: string[];
  extractedSkills: string[];
  inferredTitle?: string;
};

export type ResumeJdMatchResult = {
  resumeId: string;
  // Compatibility score is the deterministic local score.
  compatibilityScore: number; // 0..100
  // AI score is optional; when present, we use it as matchScore.
  aiScore?: number; // 0..100
  matchScore: number; // 0..100 (aiScore ?? compatibilityScore)
  provider: 'local' | 'groq' | 'groq-fallback';
  rationale?: string;
  matchedSkills: string[];
};

function normalize(value?: string) {
  return (value || '').trim();
}

function normalizedLower(value?: string) {
  return normalize(value).toLowerCase();
}

function clampList(values: string[], limit: number) {
  return Array.from(new Set(values.map((v) => normalize(v)).filter(Boolean))).slice(0, limit);
}

function tokenize(value: string) {
  return normalizedLower(value).split(/[\s,./_()+-]+/).filter(Boolean).slice(0, 160);
}

const COMMON_SKILLS = [
  'JavaScript', 'TypeScript', 'React', 'Next.js', 'Node.js', 'Express', 'NestJS',
  'Python', 'Django', 'Flask', 'FastAPI',
  'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis',
  'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes',
  'Java', 'Spring', 'Go', 'Rust', 'C++', 'C#', '.NET',
  'CI/CD', 'GitHub Actions',
  'Figma', 'UI', 'UX', 'Product', 'Analytics', 'Power BI', 'Tableau', 'Excel',
  'Operations', 'Marketing', 'SEO', 'Sales', 'CRM', 'Customer Success', 'Content', 'Copywriting',
  'HR', 'Recruiting', 'Finance', 'Compliance', 'Security',
  'LLM', 'RAG', 'Prompt Engineering', 'OpenAI', 'Groq',
] as const;

function deriveSkillsLocal(text: string) {
  const lower = text.toLowerCase();
  const hits: string[] = [];
  for (const skill of COMMON_SKILLS) {
    const key = skill.toLowerCase();
    if (lower.includes(key)) hits.push(skill);
  }
  return clampList(hits, 32);
}

async function inferJdSignals(jdText: string): Promise<JdSignals> {
  const raw = normalize(jdText).slice(0, 12_000);
  const tokens = tokenize(raw);
  const extractedSkillsLocal = deriveSkillsLocal(raw);

  if (!isAiConfigured()) {
    return { raw, tokens, extractedSkills: extractedSkillsLocal, inferredTitle: undefined };
  }

  const aiRaw = await generateAiText([
    {
      role: 'system',
      content: 'You extract role title and skills from a job description. Output JSON only. Do not hallucinate.',
    },
    {
      role: 'user',
      content: JSON.stringify({
        jdText: raw,
        outputJsonShape: { title: 'string', skills: ['string'] },
      }),
    },
  ]);

  try {
    const parsed = parseStructuredJson<{ title?: string; skills?: string[] }>(aiRaw);
    const inferredTitle = normalize(parsed.title).slice(0, 140) || undefined;
    const extractedSkills = clampList(
      [...(Array.isArray(parsed.skills) ? parsed.skills : []), ...extractedSkillsLocal],
      40,
    );
    return { raw, tokens, extractedSkills, inferredTitle };
  } catch {
    return { raw, tokens, extractedSkills: extractedSkillsLocal, inferredTitle: undefined };
  }
}

function scoreLocal(entry: ResumeDirectoryEntry, jd: JdSignals): ResumeJdMatchResult {
  const jdTokens = new Set(jd.tokens);
  const entrySkills = new Set(entry.skills.map((s) => normalizedLower(s)));
  const entryTags = new Set(entry.tags.map((t) => normalizedLower(t)));
  const hay = normalizedLower(
    [
      entry.displayName,
      entry.headline,
      entry.location,
      entry.category,
      entry.summary,
      entry.skills.join(' '),
      entry.tags.join(' '),
      // Resume text can be large; keep a short excerpt.
      entry.resumeText.slice(0, 5000),
    ].filter(Boolean).join(' '),
  );

  const matched: string[] = [];

  // Skill overlap gets the most weight.
  let skillHits = 0;
  for (const skill of jd.extractedSkills) {
    const key = normalizedLower(skill);
    if (!key) continue;
    if (entrySkills.has(key) || entryTags.has(key) || hay.includes(key)) {
      skillHits += 1;
      matched.push(skill);
    }
  }

  // Token overlap helps when the JD mentions tools not in our common list.
  let tokenHits = 0;
  for (const token of Array.from(jdTokens)) {
    if (!token || token.length < 3) continue;
    if (hay.includes(token)) tokenHits += 1;
  }

  const matchedSkills = clampList(matched, 16);

  // Heuristic: 0..100
  // - skill hits dominate (max ~70)
  // - token hits add up to ~20
  // - category/headline boost ~10
  const skillScore = Math.min(70, skillHits * 10);
  const tokenScore = Math.min(20, Math.round(tokenHits * 1.6));
  const titleBoost = jd.inferredTitle && normalizedLower(entry.headline || '').includes(normalizedLower(jd.inferredTitle))
    ? 10
    : 0;
  const rawScore = Math.max(0, Math.min(100, skillScore + tokenScore + titleBoost));

  return {
    resumeId: entry.id,
    compatibilityScore: rawScore,
    aiScore: undefined,
    matchScore: rawScore,
    provider: 'local',
    rationale: matchedSkills.length ? `Matched skills: ${matchedSkills.slice(0, 8).join(', ')}` : undefined,
    matchedSkills,
  };
}

async function scoreWithAi(entries: ResumeDirectoryEntry[], jd: JdSignals): Promise<Map<string, ResumeJdMatchResult>> {
  if (!isAiConfigured() || entries.length === 0) return new Map();

  // Keep prompts small: score top candidates only.
  const compactCandidates = entries.map((entry) => ({
    id: entry.id,
    name: entry.displayName,
    headline: entry.headline || '',
    location: entry.location || '',
    category: entry.category,
    skills: entry.skills.slice(0, 24),
    tags: entry.tags.slice(0, 16),
    summary: entry.summary || '',
    resumeExcerpt: entry.resumeText.slice(0, 2400),
  }));

  const raw = await generateAiText([
    {
      role: 'system',
      content:
        'You are a recruiter assistant. Score each candidate against the JD from 0-100. Output JSON only as an array of objects with id, score (0-100), matchedSkills (string[]), and rationale (short string). Be conservative and do not hallucinate skills not shown in candidate data.',
    },
    {
      role: 'user',
      content: JSON.stringify({
        jdText: jd.raw.slice(0, 10_000),
        candidates: compactCandidates,
      }),
    },
  ]);

  try {
    const parsed = parseStructuredJson<Array<{ id: string; score: number; matchedSkills?: string[]; rationale?: string }>>(raw);
    const out = new Map<string, ResumeJdMatchResult>();
    for (const item of parsed || []) {
      const id = normalize(item?.id);
      if (!id) continue;
      const score = Math.max(0, Math.min(100, Math.round(Number(item.score ?? 0))));
      out.set(id, {
        resumeId: id,
        compatibilityScore: 0,
        aiScore: score,
        matchScore: score,
        provider: 'groq',
        rationale: normalize(item.rationale).slice(0, 260) || undefined,
        matchedSkills: clampList(Array.isArray(item.matchedSkills) ? item.matchedSkills : [], 18),
      });
    }
    return out;
  } catch {
    return new Map();
  }
}

export async function matchResumesToJd(params: {
  jdText: string;
  entries: ResumeDirectoryEntry[];
  limit: number;
}) {
  const jd = await inferJdSignals(params.jdText);
  const localScored = params.entries.map((entry) => ({ entry, local: scoreLocal(entry, jd) }));
  localScored.sort((a, b) => b.local.matchScore - a.local.matchScore || new Date(b.entry.updatedAt).getTime() - new Date(a.entry.updatedAt).getTime());

  const takeForAi = localScored.slice(0, Math.min(14, localScored.length)).map((item) => item.entry);
  const ai = await scoreWithAi(takeForAi, jd);

  const merged = localScored.map(({ entry, local }) => {
    const aiScore = ai.get(entry.id);
    return aiScore
      ? {
          entry,
          match: {
            ...aiScore,
            compatibilityScore: local.compatibilityScore,
            matchScore: aiScore.aiScore ?? aiScore.matchScore,
            provider: 'groq' as const,
          },
        }
      : { entry, match: { ...local, provider: 'local' as const } };
  });

  merged.sort((a, b) => b.match.matchScore - a.match.matchScore || new Date(b.entry.updatedAt).getTime() - new Date(a.entry.updatedAt).getTime());

  return merged.slice(0, params.limit).map((item) => ({
    entry: item.entry,
    match: item.match,
  }));
}

export async function scoreResumeToJd(params: { jdText: string; entry: ResumeDirectoryEntry }) {
  const jd = await inferJdSignals(params.jdText);
  const local = scoreLocal(params.entry, jd);
  if (!isAiConfigured()) return local;

  const ai = await scoreWithAi([params.entry], jd);
  const enriched = ai.get(params.entry.id);
  return enriched
    ? {
        ...enriched,
        compatibilityScore: local.compatibilityScore,
        matchScore: enriched.aiScore ?? enriched.matchScore,
      }
    : { ...local, provider: 'groq-fallback' as const };
}
