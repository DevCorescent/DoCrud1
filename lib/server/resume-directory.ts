import crypto from 'node:crypto';
import { getDbPool, getMongoDb } from '@/lib/server/database';
import { resumeDirectoryPath, readJsonFile, writeJsonFile } from '@/lib/server/storage';
import { extractDocumentText } from '@/lib/server/document-parser';
import { generateAiText, isAiConfigured, parseStructuredJson } from '@/lib/server/ai';

export type ResumeContactVisibility = 'public' | 'members' | 'hidden';

export type ResumeDirectoryEntry = {
  id: string;
  slug: string;
  ownerUserId: string;
  displayName: string;
  avatarFileName?: string;
  avatarMimeType?: string;
  avatarDataUrl?: string;
  headline?: string;
  location?: string;
  category: string;
  skills: string[];
  tags: string[];
  summary?: string;
  resumeText: string;
  resumeFileName?: string;
  resumeMimeType?: string;
  resumeDataUrl?: string;
  contact: {
    email?: string;
    phone?: string;
    linkedin?: string;
    website?: string;
    visibility: ResumeContactVisibility;
  };
  visibility: 'public' | 'private';
  viewCount: number;
  contactCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ResumeDirectoryMeta = {
  categories: Array<{ category: string; count: number }>;
  tags: Array<{ tag: string; count: number }>;
  skills: Array<{ skill: string; count: number }>;
};

function normalize(value?: string) {
  return (value || '').trim();
}

function normalizedLower(value?: string) {
  return normalize(value).toLowerCase();
}

function tokenize(value: string) {
  return normalizedLower(value).split(/[\s,./_+-]+/).filter(Boolean).slice(0, 24);
}

function slugify(value: string) {
  const base = normalizedLower(value)
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 52)
    .replace(/^-+|-+$/g, '');
  const suffix = crypto.randomBytes(4).toString('hex');
  return `${base || 'resume'}-${suffix}`;
}

function clampList(values: string[], limit: number) {
  return Array.from(new Set(values.map((v) => normalize(v)).filter(Boolean))).slice(0, limit);
}

function deriveSummaryFromText(text: string) {
  const cleaned = text.replace(/\r/g, '').trim();
  if (!cleaned) return '';
  const lines = cleaned.split('\n').map((line) => line.trim()).filter(Boolean);
  return lines.slice(0, 3).join(' · ').slice(0, 240);
}

function extractContactsFromText(text: string) {
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const phone = text.match(/(\+?\d[\d\s()-]{7,}\d)/)?.[0];
  const linkedin = text.match(/https?:\/\/(www\.)?linkedin\.com\/[^\s)]+/i)?.[0];
  const website = text.match(/https?:\/\/[^\s)]+/i)?.[0];
  return {
    email: email ? email.trim().slice(0, 120) : undefined,
    phone: phone ? phone.trim().slice(0, 32) : undefined,
    linkedin: linkedin ? linkedin.trim().slice(0, 220) : undefined,
    website: website ? website.trim().slice(0, 220) : undefined,
  };
}

function redactResumeText(text: string) {
  if (!text) return '';
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/https?:\/\/(www\.)?linkedin\.com\/[^\s)]+/gi, '[redacted-linkedin]')
    .replace(/https?:\/\/[^\s)]+/gi, '[redacted-url]')
    .replace(/(\+?\d[\d\s()-]{7,}\d)/g, '[redacted-phone]');
}

const COMMON_SKILLS = [
  'JavaScript', 'TypeScript', 'React', 'Next.js', 'Node.js', 'Python', 'SQL', 'PostgreSQL', 'MySQL',
  'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Java', 'Spring', 'PHP', 'Laravel',
  'Figma', 'UI', 'UX', 'Product', 'Analytics', 'Power BI', 'Tableau', 'Excel', 'Operations',
  'Marketing', 'SEO', 'Sales', 'CRM', 'Customer Success', 'Content', 'Copywriting',
  'HR', 'Recruiting', 'Finance', 'Compliance',
] as const;

function deriveSkillsLocal(text: string) {
  const lower = text.toLowerCase();
  const hits: string[] = [];
  for (const skill of COMMON_SKILLS) {
    const key = skill.toLowerCase();
    if (lower.includes(key)) hits.push(skill);
  }
  return clampList(hits, 20);
}

async function inferResumeProfileFromText(text: string) {
  const preview = text.slice(0, 8000);
  // Privacy: do not extract contact details from resume OCR for auto-fill.
  // Contact fields must be explicitly provided by the publisher.
  const contacts = {};

  if (!isAiConfigured()) {
    const skills = deriveSkillsLocal(preview);
    return {
      displayName: '',
      headline: '',
      location: '',
      summary: deriveSummaryFromText(preview),
      skills,
      tags: clampList(skills, 12),
      contacts,
      provider: 'local',
    };
  }

  const raw = await generateAiText([
    {
      role: 'system',
      content: 'You extract resume profile fields from OCR text. Output JSON only. Be conservative and do not hallucinate.',
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: 'Extract candidate profile fields. If unknown, return empty strings.',
        resumeText: preview,
        outputJsonShape: {
          displayName: 'string',
          headline: 'string',
          location: 'string',
          summary: 'string',
          skills: ['string'],
          tags: ['string'],
        },
      }),
    },
  ]);

  try {
    const parsed = parseStructuredJson<{
      displayName?: string;
      headline?: string;
      location?: string;
      summary?: string;
      skills?: string[];
      tags?: string[];
    }>(raw);

    const skills = clampList(Array.isArray(parsed.skills) ? parsed.skills : deriveSkillsLocal(preview), 24);
    const tags = clampList(Array.isArray(parsed.tags) ? parsed.tags : skills, 16);

    return {
      displayName: normalize(parsed.displayName).slice(0, 72),
      headline: normalize(parsed.headline).slice(0, 96),
      location: normalize(parsed.location).slice(0, 72),
      summary: normalize(parsed.summary).slice(0, 320) || deriveSummaryFromText(preview),
      skills,
      tags,
      contacts,
      provider: 'groq',
    };
  } catch {
    const skills = deriveSkillsLocal(preview);
    return {
      displayName: '',
      headline: '',
      location: '',
      summary: deriveSummaryFromText(preview),
      skills,
      tags: clampList(skills, 12),
      contacts,
      provider: 'groq-fallback',
    };
  }
}

function scoreEntry(entry: ResumeDirectoryEntry, query: string) {
  const q = normalizedLower(query);
  if (!q) return 1;
  const tokens = tokenize(q);
  const hay = [
    entry.displayName,
    entry.headline,
    entry.location,
    entry.category,
    entry.summary,
    entry.skills.join(' '),
    entry.tags.join(' '),
  ].map((v) => normalizedLower(v)).join(' ');

  let score = 0;
  if (hay.includes(q)) score += 18;
  for (const token of tokens) {
    if (hay.includes(token)) score += 5;
  }
  return score;
}

function buildDemoResumeDirectoryEntries(count: number): ResumeDirectoryEntry[] {
  const now = Date.now();
  const names = [
    'Aanya Sharma', 'Rohan Verma', 'Neha Iyer', 'Arjun Nair', 'Pooja Mehta',
    'Karan Singh', 'Simran Kaur', 'Zoya Khan', 'Aditya Rao', 'Ishaan Gupta',
    'Meera Pillai', 'Siddharth Jain', 'Ananya Roy', 'Harshita Patel', 'Vikram Shetty',
    'Nandini Bose', 'Rahul Kulkarni', 'Priya Das', 'Samar Khanna', 'Ira Kapoor',
    'Devansh Mishra', 'Nikhil Menon', 'Ritika Arora', 'Sanya Malhotra', 'Kabir Sood',
  ];
  const headlines = [
    'AI Engineer', 'Backend Engineer', 'Frontend Developer', 'Product Designer', 'DevOps Engineer',
    'Data Scientist', 'Mobile Developer', 'QA Engineer', 'Product Manager', 'Full Stack Engineer',
  ];
  const categories = ['Engineering', 'Design', 'Product', 'Marketing', 'Sales', 'Operations', 'Finance', 'HR', 'Legal', 'Content'] as const;
  const locations = [
    'Indore, India', 'Bengaluru, India', 'Delhi, India', 'Mumbai, India', 'Pune, India',
    'Hyderabad, India', 'Chandigarh, India', 'Kolkata, India', 'Jaipur, India', 'Remote',
  ];
  const skillPools: Record<string, string[]> = {
    Engineering: ['TypeScript', 'React', 'Next.js', 'Node.js', 'PostgreSQL', 'Docker', 'AWS', 'Go', 'Python', 'Tailwind'],
    Design: ['Figma', 'UI/UX', 'Prototyping', 'Design Systems', 'User Research', 'Interaction Design', 'Wireframing'],
    Product: ['Roadmaps', 'PRDs', 'Analytics', 'User Research', 'Stakeholder Mgmt', 'Experimentation'],
    Marketing: ['SEO', 'Copywriting', 'Performance', 'Content', 'Brand', 'Email', 'Analytics'],
    Sales: ['CRM', 'Outbound', 'Discovery', 'Negotiation', 'Demos', 'Pipeline'],
    Operations: ['Process', 'MIS', 'Compliance', 'Vendors', 'Reporting', 'SOPs'],
    Finance: ['GST', 'Invoicing', 'Tally', 'Reconciliation', 'Excel', 'Compliance'],
    HR: ['Hiring', 'Onboarding', 'Payroll', 'Policies', 'HR Ops', 'Compliance'],
    Legal: ['Contracts', 'NDA', 'Drafting', 'Compliance', 'Review', 'Negotiation'],
    Content: ['Writing', 'Editing', 'Docs', 'Research', 'SEO', 'Copy'],
  };
  const summaries = [
    'AI Engineer building production-grade systems combining LLMs, machine learning, and backend infrastructure.',
    'Backend engineer with strong experience in distributed systems, APIs, and cloud infrastructure.',
    'Frontend engineer focused on responsive, accessible, and performant web applications.',
    'Product designer crafting user-centered designs that drive impact and business value.',
  ];

  const out: ResumeDirectoryEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    const name = names[i % names.length];
    const category = categories[i % categories.length];
    const headline = headlines[i % headlines.length];
    const location = locations[i % locations.length];
    const expYears = 2 + (i % 5);
    const createdAt = new Date(now - (i + 2) * 86400000).toISOString();
    const updatedAt = new Date(now - (i % 6) * 3600000).toISOString();
    const skills = clampList((skillPools[category] || skillPools.Engineering).slice(0, 8), 20);
    const tags = clampList(
      [
        `${expYears} yrs exp`,
        category.toLowerCase(),
        i % 3 === 0 ? 'open to work' : 'available soon',
        i % 4 === 0 ? 'remote' : 'hybrid',
      ],
      16,
    );

    out.push({
      id: `demo-resume-${String(i + 1).padStart(3, '0')}`,
      slug: `demo-${slugify(`${name}-${headline}-${category}`)}`,
      ownerUserId: 'demo',
      displayName: name,
      headline,
      location,
      category,
      skills,
      tags,
      summary: summaries[i % summaries.length],
      resumeText: '',
      resumeFileName: undefined,
      resumeMimeType: undefined,
      resumeDataUrl: undefined,
      contact: {
        visibility: 'hidden',
      },
      visibility: 'public',
      viewCount: 40 + (i % 17) * 3,
      contactCount: i % 9,
      createdAt,
      updatedAt,
    });
  }
  return out;
}

export async function listResumeDirectory(params: {
  q?: string;
  category?: string;
  tags?: string[];
  skills?: string[];
  hasContact?: boolean;
  limit?: number;
  offset?: number;
  actorUserId?: string;
}) {
  const useFileStore = !getDbPool();

  const q = normalize(params.q);
  const category = normalize(params.category);
  const tags = clampList(params.tags || [], 20);
  const skills = clampList(params.skills || [], 20);
  const hasContact = Boolean(params.hasContact);
  const tagsLower = tags.map((t) => t.toLowerCase());
  const skillsLower = skills.map((s) => s.toLowerCase());
  const limit = Math.min(60, Math.max(1, params.limit ?? 24));
  const offset = Math.max(0, params.offset ?? 0);

  if (useFileStore) {
    const raw = await readJsonFile<ResumeDirectoryEntry[]>(resumeDirectoryPath, []);
    let snapshot = raw;
    if (process.env.NODE_ENV !== 'production') {
      const publicCount = raw.filter((e) => e.visibility === 'public').length;
      if (publicCount < 24) {
        const demo = buildDemoResumeDirectoryEntries(20);
        snapshot = [...demo, ...raw].slice(0, 4000);
        await writeJsonFile(resumeDirectoryPath, snapshot);
      }
    }

    const visible = snapshot.filter((entry) => entry.visibility === 'public');
    const filtered = visible
      .filter((entry) => (category ? normalizedLower(entry.category) === normalizedLower(category) : true))
      .filter((entry) => (tagsLower.length ? tagsLower.every((tag) => entry.tags.map((t) => t.toLowerCase()).includes(tag)) : true))
      .filter((entry) => (skillsLower.length ? skillsLower.every((skill) => entry.skills.map((s) => s.toLowerCase()).includes(skill)) : true))
      .filter((entry) => (hasContact ? Boolean(entry.contact?.email || entry.contact?.phone || entry.contact?.linkedin || entry.contact?.website) : true))
      .map((entry) => ({ entry, score: scoreEntry(entry, q) }))
      .filter(({ score }) => !q || score > 0)
      .sort((a, b) => b.score - a.score || new Date(b.entry.updatedAt).getTime() - new Date(a.entry.updatedAt).getTime())
      .map(({ entry }) => entry);

    const total = filtered.length;
    const page = filtered.slice(offset, offset + limit);
    const meta = buildMetaFromEntries(visible);

    return { entries: page, total, meta };
  }

  const db = await getMongoDb();
  if (db) {
    const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const filter: Record<string, unknown> = { visibility: 'public' };
    if (category) filter.category = new RegExp(`^${escRe(normalizedLower(category))}$`, 'i');
    if (tagsLower.length) filter.tags = { $all: tagsLower.map((t) => new RegExp(`^${escRe(t)}$`, 'i')) };
    if (skillsLower.length) filter.skills = { $all: skillsLower.map((s) => new RegExp(`^${escRe(s)}$`, 'i')) };
    if (hasContact) {
      filter.$or = [
        { 'contact.email': { $exists: true, $nin: ['', null] } },
        { 'contact.phone': { $exists: true, $nin: ['', null] } },
        { 'contact.linkedin': { $exists: true, $nin: ['', null] } },
        { 'contact.website': { $exists: true, $nin: ['', null] } },
      ];
    }
    if (q) {
      const re = new RegExp(escRe(q), 'i');
      const textOr = [
        { displayName: re }, { headline: re }, { location: re },
        { category: re }, { summary: re }, { resumeText: re },
      ];
      filter.$and = [{ $or: textOr }];
    }

    const [total, docs, metaDocs] = await Promise.all([
      db.collection('resume_directory_entries').countDocuments(filter),
      db.collection<EntryDoc>('resume_directory_entries')
        .find(filter).sort({ updatedAt: -1 }).skip(offset).limit(limit).toArray(),
      db.collection<EntryDoc>('resume_directory_entries')
        .find({ visibility: 'public' }, { projection: { category: 1, tags: 1, skills: 1 } })
        .sort({ updatedAt: -1 }).limit(800).toArray(),
    ]);

    const entries = docs.map(strip);
    const meta = buildMetaFromEntries(metaDocs.map((d) => ({
      ...strip(d),
      id: d.id,
      slug: d.slug || '',
      ownerUserId: d.ownerUserId || '',
      displayName: d.displayName || '',
      category: d.category,
      skills: d.skills || [],
      tags: d.tags || [],
      resumeText: '',
      contact: d.contact || { visibility: 'hidden' },
      visibility: 'public' as const,
      viewCount: 0,
      contactCount: 0,
      createdAt: '',
      updatedAt: '',
    })));
    return { entries, total, meta };
  }

  return { entries: [], total: 0, meta: { categories: [], tags: [], skills: [] } };
}

type EntryDoc = ResumeDirectoryEntry & { _id: string };
function strip({ _id: _u, ...rest }: EntryDoc): ResumeDirectoryEntry { return rest; }

function buildMetaFromRows(rows: Array<{ category?: string; tags?: any; skills?: any }>): ResumeDirectoryMeta {
  const categoryCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  const skillCounts = new Map<string, number>();

  for (const row of rows) {
    const category = normalize(row.category);
    if (category) categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    const tags = Array.isArray(row.tags) ? row.tags : [];
    const skills = Array.isArray(row.skills) ? row.skills : [];
    for (const tag of tags) {
      const t = normalize(String(tag));
      if (!t) continue;
      tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    }
    for (const skill of skills) {
      const s = normalize(String(skill));
      if (!s) continue;
      skillCounts.set(s, (skillCounts.get(s) || 0) + 1);
    }
  }

  return {
    categories: Array.from(categoryCounts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((l, r) => r.count - l.count || l.category.localeCompare(r.category))
      .slice(0, 40),
    tags: Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((l, r) => r.count - l.count || l.tag.localeCompare(r.tag))
      .slice(0, 60),
    skills: Array.from(skillCounts.entries())
      .map(([skill, count]) => ({ skill, count }))
      .sort((l, r) => r.count - l.count || l.skill.localeCompare(r.skill))
      .slice(0, 60),
  };
}

function buildMetaFromEntries(entries: ResumeDirectoryEntry[]): ResumeDirectoryMeta {
  return buildMetaFromRows(entries.map((entry) => ({
    category: entry.category,
    tags: entry.tags,
    skills: entry.skills,
  })));
}

export async function getPublicResumeBySlug(slug: string) {
  const normalizedSlug = normalize(slug);
  if (!normalizedSlug) return null;

  if (!getDbPool()) {
    const raw = await readJsonFile<ResumeDirectoryEntry[]>(resumeDirectoryPath, []);
    const entry = raw.find((item) => item.slug === normalizedSlug && item.visibility === 'public');
    return entry || null;
  }

  const db = await getMongoDb();
  if (db) {
    const doc = await db.collection<EntryDoc>('resume_directory_entries').findOne({ slug: normalizedSlug, visibility: 'public' });
    return doc ? strip(doc) : null;
  }
  return null;
}

export async function getPublicResumeById(id: string) {
  const normalizedId = normalize(id);
  if (!normalizedId) return null;

  if (!getDbPool()) {
    const raw = await readJsonFile<ResumeDirectoryEntry[]>(resumeDirectoryPath, []);
    const entry = raw.find((item) => item.id === normalizedId && item.visibility === 'public');
    return entry || null;
  }

  const db = await getMongoDb();
  if (db) {
    const doc = await db.collection<EntryDoc>('resume_directory_entries').findOne({ _id: normalizedId, visibility: 'public' });
    return doc ? strip(doc) : null;
  }
  return null;
}

export async function getPublicResumesByIds(ids: string[]) {
  const normalized = clampList((ids || []).map((v) => normalize(v)).filter(Boolean), 220);
  if (!normalized.length) return [];

  if (!getDbPool()) {
    const raw = await readJsonFile<ResumeDirectoryEntry[]>(resumeDirectoryPath, []);
    const byId = new Map(raw.filter((item) => item.visibility === 'public').map((item) => [item.id, item]));
    return normalized.map((id) => byId.get(id)).filter(Boolean) as ResumeDirectoryEntry[];
  }

  const db = await getMongoDb();
  if (db) {
    const docs = await db.collection<EntryDoc>('resume_directory_entries')
      .find({ _id: { $in: normalized }, visibility: 'public' }).toArray();
    const byId = new Map(docs.map((doc) => [doc.id, strip(doc)]));
    return normalized.map((id) => byId.get(id)).filter(Boolean) as ResumeDirectoryEntry[];
  }
  return [];
}

export async function recordResumeView(id: string) {
  const normalizedId = normalize(id);
  if (!normalizedId) return;

  if (!getDbPool()) {
    const raw = await readJsonFile<ResumeDirectoryEntry[]>(resumeDirectoryPath, []);
    const index = raw.findIndex((entry) => entry.id === normalizedId);
    if (index === -1) return;
    const now = new Date().toISOString();
    raw[index] = { ...raw[index]!, viewCount: (raw[index]!.viewCount || 0) + 1, updatedAt: now };
    await writeJsonFile(resumeDirectoryPath, raw.slice(0, 4000));
    return;
  }

  const db = await getMongoDb();
  if (db) {
    const now = new Date().toISOString();
    await db.collection('resume_directory_entries').updateOne(
      { _id: normalizedId as any },
      { $inc: { viewCount: 1 }, $set: { updatedAt: now } },
    );
  }
}

export async function requestResumeContact(params: {
  id: string;
  actorUserId?: string;
  actorEmail?: string;
  actorName?: string;
  message?: string;
}) {
  const normalizedId = normalize(params.id);
  if (!normalizedId) throw new Error('Missing resume id');

  let entry: ResumeDirectoryEntry | null = null;
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const doc = await db.collection<EntryDoc>('resume_directory_entries').findOne({ _id: normalizedId });
      entry = doc ? strip(doc) : null;
    }
  } else {
    const raw = await readJsonFile<ResumeDirectoryEntry[]>(resumeDirectoryPath, []);
    entry = raw.find((item) => item.id === normalizedId) || null;
  }

  if (!entry || entry.visibility !== 'public') throw new Error('Resume not found');

  if (entry.contact.visibility === 'hidden') {
    throw new Error('This profile is not accepting direct contact.');
  }

  if (entry.contact.visibility === 'members' && !params.actorUserId) {
    throw new Error('Login required to view contact for this profile.');
  }

  // If contact is "members", require an actor (already enforced by API).
  const contact = entry.contact.visibility === 'public' || entry.contact.visibility === 'members'
    ? {
        email: entry.contact.email,
        phone: entry.contact.phone,
        linkedin: entry.contact.linkedin,
        website: entry.contact.website,
      }
    : {};

  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const now = new Date().toISOString();
      await db.collection('resume_directory_entries').updateOne(
        { _id: normalizedId as any },
        { $inc: { contactCount: 1 }, $set: { updatedAt: now } },
      );
    }
  } else {
    const raw = await readJsonFile<ResumeDirectoryEntry[]>(resumeDirectoryPath, []);
    const index = raw.findIndex((item) => item.id === normalizedId);
    if (index !== -1) {
      const now = new Date().toISOString();
      raw[index] = { ...raw[index]!, contactCount: (raw[index]!.contactCount || 0) + 1, updatedAt: now };
      await writeJsonFile(resumeDirectoryPath, raw.slice(0, 4000));
    }
  }

  return {
    contact,
    note: entry.contact.visibility === 'members'
      ? 'Contact is shared because you are logged in.'
      : 'Contact is public on this profile.',
  };
}

export async function publishResume(params: {
  actorUserId: string;
  actorEmail?: string;
  actorName?: string;
  displayName?: string;
  avatarFile?: { fileName: string; mimeType: string; bytes: Buffer };
  headline?: string;
  location?: string;
  category: string;
  tags?: string[];
  skills?: string[];
  summary?: string;
  resumeFile?: { fileName: string; mimeType: string; bytes: Buffer };
  pastedText?: string;
  contact?: {
    email?: string;
    phone?: string;
    linkedin?: string;
    website?: string;
    visibility?: ResumeContactVisibility;
  };
  visibility?: 'public' | 'private';
}) {
  const useFileStore = !getDbPool();

  const category = normalize(params.category).slice(0, 48);
  if (!category) throw new Error('Category is required.');

  const pasted = normalize(params.pastedText);
  const resumeBytes = params.resumeFile?.bytes;

  if (!pasted && !resumeBytes) {
    throw new Error('Upload a resume file or paste the resume text.');
  }

  let extractedText = pasted;
  let avatarFileName: string | undefined;
  let avatarMimeType: string | undefined;
  let avatarDataUrl: string | undefined;
  let resumeFileName: string | undefined;
  let resumeMimeType: string | undefined;
  let resumeDataUrl: string | undefined;

  if (params.avatarFile?.bytes?.length) {
    const avatarBytes = params.avatarFile.bytes;
    const maxBytes = 512 * 1024;
    if (avatarBytes.length > maxBytes) {
      throw new Error('Profile photo is too large. Please upload an image under 512 KB.');
    }
    avatarFileName = params.avatarFile.fileName.slice(0, 140);
    avatarMimeType = params.avatarFile.mimeType.slice(0, 90) || 'image/png';
    const base64 = avatarBytes.toString('base64');
    avatarDataUrl = `data:${avatarMimeType};base64,${base64}`;
  }

  if (resumeBytes && params.resumeFile) {
    resumeFileName = params.resumeFile.fileName.slice(0, 140);
    resumeMimeType = params.resumeFile.mimeType.slice(0, 90);

    // Store as data URL for simple downloads in file-store mode.
    const maxBytes = 6 * 1024 * 1024;
    if (resumeBytes.length > maxBytes) {
      throw new Error('Resume file is too large. Please upload a file under 6 MB.');
    }
    const base64 = resumeBytes.toString('base64');
    resumeDataUrl = `data:${resumeMimeType || 'application/octet-stream'};base64,${base64}`;

    try {
      extractedText = await extractDocumentText(resumeFileName, resumeMimeType, resumeBytes);
    } catch (error) {
      if (!extractedText) {
        throw error instanceof Error ? error : new Error('Unable to read resume file.');
      }
    }
  }

  extractedText = redactResumeText(normalize(extractedText)).slice(0, 24_000);
  if (!extractedText) {
    throw new Error('No readable resume text found. Upload a sharper PDF/image or paste the resume text.');
  }

  const inferred = await inferResumeProfileFromText(extractedText);
  const displayName = normalize(params.displayName || inferred.displayName || params.actorName || '').slice(0, 72);
  if (!displayName) {
    throw new Error('Display name is required (or ensure the resume contains a readable name).');
  }

  const headline = normalize(params.headline || inferred.headline).slice(0, 96) || undefined;
  const location = normalize(params.location || inferred.location).slice(0, 72) || undefined;
  const summary = normalize(params.summary || inferred.summary).slice(0, 340) || undefined;
  const skills = clampList([...(params.skills || []), ...inferred.skills], 24);
  const tags = clampList([...(params.tags || []), ...(inferred.tags || [])], 20);

  const contactVisibility: ResumeContactVisibility =
    params.contact?.visibility === 'public' || params.contact?.visibility === 'hidden'
      ? params.contact.visibility
      : 'members';

  const contact = {
    email: normalize(params.contact?.email).slice(0, 120) || undefined,
    phone: normalize(params.contact?.phone).slice(0, 32) || undefined,
    linkedin: normalize(params.contact?.linkedin).slice(0, 220) || undefined,
    website: normalize(params.contact?.website).slice(0, 220) || undefined,
    visibility: contactVisibility,
  };

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const slug = slugify(`${displayName} ${headline || category}`);
  const visibility = params.visibility === 'private' ? 'private' : 'public';

  const record: ResumeDirectoryEntry = {
    id,
    slug,
    ownerUserId: params.actorUserId,
    displayName,
    avatarFileName,
    avatarMimeType,
    avatarDataUrl,
    headline,
    location,
    category,
    skills,
    tags,
    summary,
    resumeText: extractedText,
    resumeFileName,
    resumeMimeType,
    resumeDataUrl,
    contact,
    visibility,
    viewCount: 0,
    contactCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  if (useFileStore) {
    const existing = await readJsonFile<ResumeDirectoryEntry[]>(resumeDirectoryPath, []);
    await writeJsonFile(resumeDirectoryPath, [record, ...existing].slice(0, 4000));
    return record;
  }

  const db = await getMongoDb();
  if (db) {
    await db.collection<EntryDoc>('resume_directory_entries').insertOne({ ...record, _id: record.id });
  }

  return record;
}

export type PublicResumeSearchItem = {
  id: string;
  slug: string;
  title: string;
  description: string;
  href: string;
  category: string;
  tags: string[];
  skills: string[];
  updatedAt: string;
};

export async function searchPublicResumes(query: string, limit = 6): Promise<PublicResumeSearchItem[]> {
  const result = await listResumeDirectory({ q: query, limit, offset: 0 });
  return result.entries.slice(0, limit).map((entry) => ({
    id: entry.id,
    slug: entry.slug,
    title: entry.displayName,
    description: entry.headline || entry.summary || `${entry.category} resume`,
    href: `/talent/${entry.slug}`,
    category: entry.category,
    tags: entry.tags,
    skills: entry.skills,
    updatedAt: entry.updatedAt,
  }));
}
