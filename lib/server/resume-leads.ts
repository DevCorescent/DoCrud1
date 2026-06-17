import crypto from 'node:crypto';
import { getDbPool, getMongoDb } from '@/lib/server/database';
import { readJsonFile, resumeConnectLeadsPath, writeJsonFile } from '@/lib/server/storage';
import type { ResumeDirectoryEntry } from '@/lib/server/resume-directory';
import { scoreResumeToJd } from '@/lib/server/resume-matching';

export type ResumeLeadStatus =
  | 'new'
  | 'contacted'
  | 'shortlisted'
  | 'interviewing'
  | 'offered'
  | 'hired'
  | 'closed'
  | 'rejected';

export type ResumeLeadNote = {
  id: string;
  body: string;
  createdAt: string;
  createdByUserId: string;
};

export type ResumeLead = {
  id: string;
  buyerUserId: string;
  resumeId: string;
  resumeSlug: string;
  candidate: {
    displayName: string;
    headline?: string;
    location?: string;
    category?: string;
    skills: string[];
    tags: string[];
    summary?: string;
  };
  contact: {
    email?: string;
    phone?: string;
    linkedin?: string;
    website?: string;
  };
  jdText?: string;
  match?: {
    score: number;
    compatibilityScore?: number;
    aiScore?: number;
    provider: string;
    rationale?: string;
    matchedSkills: string[];
  };
  status: ResumeLeadStatus;
  notes: ResumeLeadNote[];
  connectCount: number;
  createdAt: string;
  updatedAt: string;
};

function nowIso() { return new Date().toISOString(); }
function normalize(value?: string) { return (value || '').trim(); }
function clampList(values: string[], limit: number) {
  return Array.from(new Set(values.map((v) => normalize(v)).filter(Boolean))).slice(0, limit);
}
function parseNotes(raw: unknown): ResumeLeadNote[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => ({
      id: normalize(item?.id),
      body: normalize(item?.body),
      createdAt: normalize(item?.createdAt),
      createdByUserId: normalize(item?.createdByUserId),
    }))
    .filter((note) => note.id && note.body && note.createdAt && note.createdByUserId)
    .slice(0, 300);
}

type LeadDoc = ResumeLead & { _id: string };
function strip({ _id: _u, ...rest }: LeadDoc): ResumeLead { return rest; }

export async function listResumeLeads(params: {
  buyerUserId: string;
  q?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const buyerUserId = normalize(params.buyerUserId);
  const q = normalize(params.q);
  const status = normalize(params.status);
  const limit = Math.min(60, Math.max(1, params.limit ?? 24));
  const offset = Math.max(0, params.offset ?? 0);

  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const filter: Record<string, unknown> = { buyerUserId };
      if (status) filter.status = status;
      if (q) {
        const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [
          { 'candidate.displayName': re },
          { 'candidate.headline': re },
          { 'candidate.location': re },
          { 'candidate.category': re },
          { 'candidate.summary': re },
          { jdText: re },
        ];
      }
      const [total, docs] = await Promise.all([
        db.collection('resume_connect_leads').countDocuments(filter),
        db.collection<LeadDoc>('resume_connect_leads')
          .find(filter).sort({ updatedAt: -1 }).skip(offset).limit(limit).toArray(),
      ]);
      return { leads: docs.map(strip), total };
    }
  }

  const raw = await readJsonFile<ResumeLead[]>(resumeConnectLeadsPath, []);
  const mine = raw.filter((lead) => lead.buyerUserId === buyerUserId);
  const qLow = q.toLowerCase();
  const filtered = mine
    .filter((lead) => (status ? lead.status === status : true))
    .filter((lead) => {
      if (!qLow) return true;
      const hay = [
        lead.candidate.displayName,
        lead.candidate.headline,
        lead.candidate.location,
        lead.candidate.category,
        lead.candidate.summary,
        lead.candidate.skills.join(' '),
        lead.candidate.tags.join(' '),
        lead.jdText,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(qLow);
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return { leads: filtered.slice(offset, offset + limit), total: filtered.length };
}

export async function upsertResumeLeadOnUnlock(params: {
  buyerUserId: string;
  entry: ResumeDirectoryEntry;
  unlockedContact: Record<string, string | undefined>;
  jdText?: string;
}) {
  const buyerUserId = normalize(params.buyerUserId);
  const now = nowIso();
  const jdText = normalize(params.jdText).slice(0, 10_000) || undefined;

  const match = jdText ? await scoreResumeToJd({ jdText, entry: params.entry }) : null;
  const matchedSkills = match ? clampList(match.matchedSkills || [], 18) : [];

  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const docId = `${buyerUserId}_${params.entry.id}`;
      const setFields: Record<string, unknown> = {
        resumeSlug: params.entry.slug,
        candidate: {
          displayName: params.entry.displayName,
          headline: params.entry.headline,
          location: params.entry.location,
          category: params.entry.category,
          skills: params.entry.skills,
          tags: params.entry.tags,
          summary: params.entry.summary,
        },
        contact: {
          email: params.unlockedContact.email,
          phone: params.unlockedContact.phone,
          linkedin: params.unlockedContact.linkedin,
          website: params.unlockedContact.website,
        },
        updatedAt: now,
      };
      if (jdText) setFields.jdText = jdText;
      if (match) {
        setFields.match = {
          score: match.matchScore,
          compatibilityScore: match.compatibilityScore,
          aiScore: match.aiScore,
          provider: match.provider,
          rationale: match.rationale,
          matchedSkills,
        };
      }
      await db.collection('resume_connect_leads').updateOne(
        { _id: docId as any },
        {
          $set: setFields,
          $inc: { connectCount: 1 },
          $setOnInsert: {
            _id: docId,
            id: docId,
            buyerUserId,
            resumeId: params.entry.id,
            status: 'new',
            notes: [],
            createdAt: now,
          },
        },
        { upsert: true },
      );
      return { ok: true };
    }
  }

  const existing = await readJsonFile<ResumeLead[]>(resumeConnectLeadsPath, []);
  const idx = existing.findIndex((lead) => lead.buyerUserId === buyerUserId && lead.resumeId === params.entry.id);

  const candidateData = {
    displayName: params.entry.displayName,
    headline: params.entry.headline,
    location: params.entry.location,
    category: params.entry.category,
    skills: params.entry.skills,
    tags: params.entry.tags,
    summary: params.entry.summary,
  };
  const contactData = {
    email: params.unlockedContact.email,
    phone: params.unlockedContact.phone,
    linkedin: params.unlockedContact.linkedin,
    website: params.unlockedContact.website,
  };
  const matchData = match
    ? { score: match.matchScore, compatibilityScore: match.compatibilityScore, aiScore: match.aiScore, provider: match.provider, rationale: match.rationale, matchedSkills }
    : undefined;

  if (idx === -1) {
    const nextBase: ResumeLead = {
      id: crypto.randomUUID(),
      buyerUserId,
      resumeId: params.entry.id,
      resumeSlug: params.entry.slug,
      candidate: candidateData,
      contact: contactData,
      jdText,
      match: matchData,
      status: 'new',
      notes: [],
      connectCount: 1,
      createdAt: now,
      updatedAt: now,
    };
    await writeJsonFile(resumeConnectLeadsPath, [nextBase, ...existing].slice(0, 6000));
    return nextBase;
  }

  const current = existing[idx];
  const updated: ResumeLead = {
    ...current,
    resumeSlug: params.entry.slug,
    candidate: candidateData,
    contact: contactData,
    jdText: jdText || current.jdText,
    match: matchData || current.match,
    connectCount: (current.connectCount || 1) + 1,
    updatedAt: now,
  };
  existing[idx] = updated;
  await writeJsonFile(resumeConnectLeadsPath, existing.slice(0, 6000));
  return updated;
}

export async function updateResumeLead(params: {
  buyerUserId: string;
  leadId: string;
  status?: ResumeLeadStatus;
  noteBody?: string;
}) {
  const buyerUserId = normalize(params.buyerUserId);
  const leadId = normalize(params.leadId);
  const status = normalize(params.status);
  const noteBody = normalize(params.noteBody).slice(0, 1400);
  const allowedStatuses: ResumeLeadStatus[] = ['new', 'contacted', 'shortlisted', 'interviewing', 'offered', 'hired', 'closed', 'rejected'];
  const nextStatus = allowedStatuses.includes(status as ResumeLeadStatus) ? (status as ResumeLeadStatus) : undefined;
  const now = nowIso();

  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const doc = await db.collection<LeadDoc>('resume_connect_leads').findOne({ id: leadId, buyerUserId });
      if (!doc) throw new Error('Lead not found.');
      const existingNotes = parseNotes(doc.notes);
      const nextNotes = noteBody
        ? [{ id: crypto.randomUUID(), body: noteBody, createdAt: now, createdByUserId: buyerUserId }, ...existingNotes].slice(0, 240)
        : existingNotes;
      const setFields: Record<string, unknown> = { notes: nextNotes, updatedAt: now };
      if (nextStatus) setFields.status = nextStatus;
      await db.collection('resume_connect_leads').updateOne({ id: leadId, buyerUserId }, { $set: setFields });
      return { ok: true };
    }
  }

  const existing = await readJsonFile<ResumeLead[]>(resumeConnectLeadsPath, []);
  const idx = existing.findIndex((lead) => lead.id === leadId && lead.buyerUserId === buyerUserId);
  if (idx === -1) throw new Error('Lead not found.');
  const current = existing[idx];
  const nextNotes = noteBody
    ? [{ id: crypto.randomUUID(), body: noteBody, createdAt: now, createdByUserId: buyerUserId }, ...(current.notes || [])].slice(0, 240)
    : current.notes || [];
  const updated: ResumeLead = { ...current, status: nextStatus || current.status, notes: nextNotes, updatedAt: now };
  existing[idx] = updated;
  await writeJsonFile(resumeConnectLeadsPath, existing.slice(0, 6000));
  return updated;
}
