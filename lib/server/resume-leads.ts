import crypto from 'node:crypto';
import { getDbPool } from '@/lib/server/database';
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

function nowIso() {
  return new Date().toISOString();
}

function normalize(value?: string) {
  return (value || '').trim();
}

function clampList(values: string[], limit: number) {
  return Array.from(new Set(values.map((v) => normalize(v)).filter(Boolean))).slice(0, limit);
}

function parseNotes(raw: any): ResumeLeadNote[] {
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

export async function listResumeLeads(params: {
  buyerUserId: string;
  q?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const pool = getDbPool();
  const buyerUserId = normalize(params.buyerUserId);
  const q = normalize(params.q);
  const status = normalize(params.status);
  const limit = Math.min(60, Math.max(1, params.limit ?? 24));
  const offset = Math.max(0, params.offset ?? 0);

  if (!pool) {
    const raw = await readJsonFile<ResumeLead[]>(resumeConnectLeadsPath, []);
    const mine = raw.filter((lead) => lead.buyerUserId === buyerUserId);
    const filtered = mine
      .filter((lead) => (status ? lead.status === status : true))
      .filter((lead) => {
        if (!q) return true;
        const hay = [
          lead.candidate.displayName,
          lead.candidate.headline,
          lead.candidate.location,
          lead.candidate.category,
          lead.candidate.summary,
          lead.candidate.skills.join(' '),
          lead.candidate.tags.join(' '),
          lead.jdText,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q.toLowerCase());
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return { leads: filtered.slice(offset, offset + limit), total: filtered.length };
  }

  const where: string[] = ['buyer_user_id = $1'];
  const values: any[] = [buyerUserId];

  if (status) {
    values.push(status);
    where.push(`status = $${values.length}`);
  }
  if (q) {
    values.push(`%${q}%`);
    const idx = values.length;
    where.push(`(candidate_name ILIKE $${idx} OR candidate_headline ILIKE $${idx} OR candidate_location ILIKE $${idx} OR candidate_category ILIKE $${idx} OR candidate_summary ILIKE $${idx} OR jd_text ILIKE $${idx})`);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM resume_connect_leads ${whereSql}`,
    values,
  );

  values.push(limit);
  values.push(offset);
  const listResult = await pool.query(
    `
      SELECT
        id, buyer_user_id, resume_id, resume_slug,
        candidate_name, candidate_headline, candidate_location, candidate_category, candidate_skills, candidate_tags, candidate_summary,
        contact_email, contact_phone, contact_linkedin, contact_website,
        jd_text, match_score, compatibility_score, ai_score, match_provider, match_rationale, matched_skills,
        status, notes, connect_count, created_at, updated_at
      FROM resume_connect_leads
      ${whereSql}
      ORDER BY updated_at DESC
      LIMIT $${values.length - 1}
      OFFSET $${values.length}
    `,
    values,
  );

  const leads = listResult.rows.map((row: any) => ({
    id: String(row.id),
    buyerUserId: String(row.buyer_user_id),
    resumeId: String(row.resume_id),
    resumeSlug: String(row.resume_slug),
    candidate: {
      displayName: String(row.candidate_name),
      headline: row.candidate_headline ? String(row.candidate_headline) : undefined,
      location: row.candidate_location ? String(row.candidate_location) : undefined,
      category: row.candidate_category ? String(row.candidate_category) : undefined,
      skills: Array.isArray(row.candidate_skills) ? row.candidate_skills : [],
      tags: Array.isArray(row.candidate_tags) ? row.candidate_tags : [],
      summary: row.candidate_summary ? String(row.candidate_summary) : undefined,
    },
    contact: {
      email: row.contact_email ? String(row.contact_email) : undefined,
      phone: row.contact_phone ? String(row.contact_phone) : undefined,
      linkedin: row.contact_linkedin ? String(row.contact_linkedin) : undefined,
      website: row.contact_website ? String(row.contact_website) : undefined,
    },
    jdText: row.jd_text ? String(row.jd_text) : undefined,
    match: typeof row.match_score === 'number' || row.match_score
      ? {
          score: Number(row.match_score || 0),
          compatibilityScore: (typeof row.compatibility_score === 'number' || row.compatibility_score) ? Number(row.compatibility_score || 0) : undefined,
          aiScore: (typeof row.ai_score === 'number' || row.ai_score) ? Number(row.ai_score || 0) : undefined,
          provider: String(row.match_provider || ''),
          rationale: row.match_rationale ? String(row.match_rationale) : undefined,
          matchedSkills: Array.isArray(row.matched_skills) ? row.matched_skills : [],
        }
      : undefined,
    status: (String(row.status || 'new') as ResumeLeadStatus) || 'new',
    notes: parseNotes(row.notes),
    connectCount: Number(row.connect_count || 1),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  })) as ResumeLead[];

  return { leads, total: Number(countResult.rows[0]?.count || 0) };
}

export async function upsertResumeLeadOnUnlock(params: {
  buyerUserId: string;
  entry: ResumeDirectoryEntry;
  unlockedContact: Record<string, string | undefined>;
  jdText?: string;
}) {
  const pool = getDbPool();
  const buyerUserId = normalize(params.buyerUserId);
  const now = nowIso();
  const jdText = normalize(params.jdText).slice(0, 10_000) || undefined;

  const match = jdText ? await scoreResumeToJd({ jdText, entry: params.entry }) : null;
  const matchedSkills = match ? clampList(match.matchedSkills || [], 18) : [];

  if (!pool) {
    const existing = await readJsonFile<ResumeLead[]>(resumeConnectLeadsPath, []);
    const idx = existing.findIndex((lead) => lead.buyerUserId === buyerUserId && lead.resumeId === params.entry.id);
    const nextBase: ResumeLead = {
      id: crypto.randomUUID(),
      buyerUserId,
      resumeId: params.entry.id,
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
      jdText,
      match: match
        ? {
          score: match.matchScore,
          compatibilityScore: match.compatibilityScore,
          aiScore: match.aiScore,
          provider: match.provider,
          rationale: match.rationale,
          matchedSkills,
        }
        : undefined,
      status: 'new',
      notes: [],
      connectCount: 1,
      createdAt: now,
      updatedAt: now,
    };

    if (idx === -1) {
      await writeJsonFile(resumeConnectLeadsPath, [nextBase, ...existing].slice(0, 6000));
      return nextBase;
    }

    const current = existing[idx];
    const updated: ResumeLead = {
      ...current,
      resumeSlug: params.entry.slug,
      candidate: nextBase.candidate,
      contact: nextBase.contact,
      jdText: jdText || current.jdText,
      match: match
        ? {
          score: match.matchScore,
          compatibilityScore: match.compatibilityScore,
          aiScore: match.aiScore,
          provider: match.provider,
          rationale: match.rationale,
          matchedSkills,
        }
        : current.match,
      connectCount: (current.connectCount || 1) + 1,
      updatedAt: now,
    };
    existing[idx] = updated;
    await writeJsonFile(resumeConnectLeadsPath, existing.slice(0, 6000));
    return updated;
  }

  const leadId = crypto.randomUUID();
  await pool.query(
    `
      INSERT INTO resume_connect_leads (
        id, buyer_user_id, resume_id, resume_slug,
        candidate_name, candidate_headline, candidate_location, candidate_category, candidate_skills, candidate_tags, candidate_summary,
        contact_email, contact_phone, contact_linkedin, contact_website,
        jd_text, match_score, compatibility_score, ai_score, match_provider, match_rationale, matched_skills,
        status, notes, connect_count, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,
        $5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,
        $12,$13,$14,$15,
        $16,$17,$18,$19,$20,$21,$22::jsonb,
        'new',$23::jsonb,1,NOW(),NOW()
      )
      ON CONFLICT (buyer_user_id, resume_id)
      DO UPDATE SET
        resume_slug = EXCLUDED.resume_slug,
        candidate_name = EXCLUDED.candidate_name,
        candidate_headline = EXCLUDED.candidate_headline,
        candidate_location = EXCLUDED.candidate_location,
        candidate_category = EXCLUDED.candidate_category,
        candidate_skills = EXCLUDED.candidate_skills,
        candidate_tags = EXCLUDED.candidate_tags,
        candidate_summary = EXCLUDED.candidate_summary,
        contact_email = EXCLUDED.contact_email,
        contact_phone = EXCLUDED.contact_phone,
        contact_linkedin = EXCLUDED.contact_linkedin,
        contact_website = EXCLUDED.contact_website,
        jd_text = COALESCE(EXCLUDED.jd_text, resume_connect_leads.jd_text),
        match_score = COALESCE(EXCLUDED.match_score, resume_connect_leads.match_score),
        compatibility_score = COALESCE(EXCLUDED.compatibility_score, resume_connect_leads.compatibility_score),
        ai_score = COALESCE(EXCLUDED.ai_score, resume_connect_leads.ai_score),
        match_provider = COALESCE(EXCLUDED.match_provider, resume_connect_leads.match_provider),
        match_rationale = COALESCE(EXCLUDED.match_rationale, resume_connect_leads.match_rationale),
        matched_skills = CASE WHEN EXCLUDED.matched_skills = '[]'::jsonb THEN resume_connect_leads.matched_skills ELSE EXCLUDED.matched_skills END,
        connect_count = resume_connect_leads.connect_count + 1,
        updated_at = NOW()
    `,
    [
      leadId,
      buyerUserId,
      params.entry.id,
      params.entry.slug,
      params.entry.displayName,
      params.entry.headline || null,
      params.entry.location || null,
      params.entry.category || null,
      JSON.stringify(params.entry.skills || []),
      JSON.stringify(params.entry.tags || []),
      params.entry.summary || null,
      params.unlockedContact.email || null,
      params.unlockedContact.phone || null,
      params.unlockedContact.linkedin || null,
      params.unlockedContact.website || null,
      jdText || null,
      match ? match.matchScore : null,
      match ? match.compatibilityScore : null,
      match ? (match.aiScore ?? null) : null,
      match ? match.provider : null,
      match ? (match.rationale || null) : null,
      JSON.stringify(matchedSkills),
      JSON.stringify([]),
    ],
  );

  return { ok: true };
}

export async function updateResumeLead(params: {
  buyerUserId: string;
  leadId: string;
  status?: ResumeLeadStatus;
  noteBody?: string;
}) {
  const pool = getDbPool();
  const buyerUserId = normalize(params.buyerUserId);
  const leadId = normalize(params.leadId);
  const status = normalize(params.status);
  const noteBody = normalize(params.noteBody).slice(0, 1400);

  const allowedStatuses: ResumeLeadStatus[] = [
    'new', 'contacted', 'shortlisted', 'interviewing', 'offered', 'hired', 'closed', 'rejected',
  ];
  const nextStatus = allowedStatuses.includes(status as ResumeLeadStatus) ? (status as ResumeLeadStatus) : undefined;
  const now = nowIso();

  if (!pool) {
    const existing = await readJsonFile<ResumeLead[]>(resumeConnectLeadsPath, []);
    const idx = existing.findIndex((lead) => lead.id === leadId && lead.buyerUserId === buyerUserId);
    if (idx === -1) throw new Error('Lead not found.');
    const current = existing[idx];

    const nextNotes = noteBody
      ? [
          {
            id: crypto.randomUUID(),
            body: noteBody,
            createdAt: now,
            createdByUserId: buyerUserId,
          },
          ...(current.notes || []),
        ].slice(0, 240)
      : current.notes || [];

    const updated: ResumeLead = {
      ...current,
      status: nextStatus || current.status,
      notes: nextNotes,
      updatedAt: now,
    };
    existing[idx] = updated;
    await writeJsonFile(resumeConnectLeadsPath, existing.slice(0, 6000));
    return updated;
  }

  const result = await pool.query(
    `SELECT notes FROM resume_connect_leads WHERE id = $1 AND buyer_user_id = $2 LIMIT 1`,
    [leadId, buyerUserId],
  );
  if (!result.rows[0]) throw new Error('Lead not found.');
  const existingNotes = parseNotes(result.rows[0].notes);
  const nextNotes = noteBody
    ? [
        {
          id: crypto.randomUUID(),
          body: noteBody,
          createdAt: now,
          createdByUserId: buyerUserId,
        },
        ...existingNotes,
      ].slice(0, 240)
    : existingNotes;

  await pool.query(
    `
      UPDATE resume_connect_leads
      SET status = COALESCE($3, status),
          notes = $4::jsonb,
          updated_at = NOW()
      WHERE id = $1 AND buyer_user_id = $2
    `,
    [
      leadId,
      buyerUserId,
      nextStatus || null,
      JSON.stringify(nextNotes),
    ],
  );

  return { ok: true };
}
