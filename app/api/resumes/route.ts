import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getPublicResumesByIds, listResumeDirectory, publishResume } from '@/lib/server/resume-directory';
import { matchResumesToJd } from '@/lib/server/resume-matching';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const jd = searchParams.get('jd') || '';
  const ids = (searchParams.get('ids') || '').split(',').map((t) => t.trim()).filter(Boolean);
  const category = searchParams.get('category') || '';
  const tags = (searchParams.get('tags') || '').split(',').map((t) => t.trim()).filter(Boolean);
  const skills = (searchParams.get('skills') || '').split(',').map((t) => t.trim()).filter(Boolean);
  const hasContact = searchParams.get('hasContact') === '1' || searchParams.get('hasContact') === 'true';
  const limit = Number(searchParams.get('limit') || '24');
  const offset = Number(searchParams.get('offset') || '0');

  if (ids.length) {
    const entries = await getPublicResumesByIds(ids.slice(0, 220));
    const safe = entries.map((entry) => ({
      id: entry.id,
      slug: entry.slug,
      displayName: entry.displayName,
      avatarDataUrl: entry.avatarDataUrl,
      headline: entry.headline,
      location: entry.location,
      category: entry.category,
      skills: entry.skills,
      tags: entry.tags,
      summary: entry.summary,
      resumeFileName: entry.resumeFileName,
      resumeMimeType: entry.resumeMimeType,
      visibility: entry.visibility,
      viewCount: entry.viewCount,
      contactCount: entry.contactCount,
      contactVisibility: entry.contact.visibility,
      hasContact: Boolean(entry.contact.email || entry.contact.phone || entry.contact.linkedin || entry.contact.website),
      updatedAt: entry.updatedAt,
      createdAt: entry.createdAt,
    }));
    const filtered = hasContact ? safe.filter((entry) => entry.hasContact) : safe;
    return NextResponse.json({ entries: filtered, total: filtered.length, meta: { categories: [], tags: [], skills: [] }, jdMode: false }, { status: 200 });
  }

  const jdMode = jd.trim().length >= 120 || jd.includes('\n');
  const result = jdMode
    ? await listResumeDirectory({ q: '', category, tags, skills, hasContact, limit: 240, offset: 0 })
    : await listResumeDirectory({ q, category, tags, skills, hasContact, limit, offset });
  const pageEntries = result.entries;

  // Do not leak contact details on public listing responses.
  const safeBase = pageEntries.map((entry) => ({
    id: entry.id,
    slug: entry.slug,
    displayName: entry.displayName,
    avatarDataUrl: entry.avatarDataUrl,
    headline: entry.headline,
    location: entry.location,
    category: entry.category,
    skills: entry.skills,
    tags: entry.tags,
    summary: entry.summary,
    resumeFileName: entry.resumeFileName,
    resumeMimeType: entry.resumeMimeType,
    visibility: entry.visibility,
    viewCount: entry.viewCount,
    contactCount: entry.contactCount,
    contactVisibility: entry.contact.visibility,
    hasContact: Boolean(entry.contact.email || entry.contact.phone || entry.contact.linkedin || entry.contact.website),
    updatedAt: entry.updatedAt,
    createdAt: entry.createdAt,
  }));

  if (jdMode) {
    // JD mode scores across a wider set, then paginates results client-side.
    const cap = Math.min(240, Math.max(24, limit * 8));
    const matched = await matchResumesToJd({ jdText: jd, entries: pageEntries, limit: cap });
    const paged = matched.slice(offset, offset + Math.max(1, limit));
    const entries = paged.map(({ entry, match }) => {
      const base = safeBase.find((item) => item.id === entry.id);
          return base
        ? {
            ...base,
            matchScore: match.matchScore,
            compatibilityScore: match.compatibilityScore,
            aiScore: match.aiScore,
            matchProvider: match.provider,
            matchRationale: match.rationale,
            matchedSkills: match.matchedSkills,
          }
        : null;
    }).filter(Boolean);
    return NextResponse.json({ entries, total: matched.length, meta: result.meta, jdMode: true }, { status: 200 });
  }

  return NextResponse.json({ ...result, entries: safeBase, jdMode: false }, { status: 200 });
}

export async function POST(request: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Use multipart/form-data' }, { status: 400 });
    }

    const form = await request.formData();
    const file = form.get('resumeFile');
    const avatarFile = form.get('avatarFile');
    const pastedText = String(form.get('pastedText') || '').trim();

    const entry = await publishResume({
      actorUserId: session.user.id,
      actorEmail: session.user.email || undefined,
      actorName: session.user.name || undefined,
      displayName: String(form.get('displayName') || '').trim() || undefined,
      avatarFile: (avatarFile instanceof File)
        ? {
            fileName: avatarFile.name,
            mimeType: avatarFile.type || 'application/octet-stream',
            bytes: Buffer.from(await avatarFile.arrayBuffer()),
          }
        : undefined,
      headline: String(form.get('headline') || '').trim() || undefined,
      location: String(form.get('location') || '').trim() || undefined,
      category: String(form.get('category') || '').trim(),
      tags: String(form.get('tags') || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      skills: String(form.get('skills') || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      summary: String(form.get('summary') || '').trim() || undefined,
      pastedText: pastedText || undefined,
      resumeFile: (file instanceof File)
        ? {
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            bytes: Buffer.from(await file.arrayBuffer()),
          }
        : undefined,
      contact: {
        email: String(form.get('contactEmail') || '').trim() || undefined,
        phone: String(form.get('contactPhone') || '').trim() || undefined,
        linkedin: String(form.get('contactLinkedin') || '').trim() || undefined,
        website: String(form.get('contactWebsite') || '').trim() || undefined,
        visibility: (String(form.get('contactVisibility') || '').trim() as any) || undefined,
      },
      visibility: String(form.get('visibility') || 'public') === 'private' ? 'private' : 'public',
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to publish resume.';
    const status = /unauthorized|required|upload|paste|large|readable/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
