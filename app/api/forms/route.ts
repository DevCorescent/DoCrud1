import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { appendHistoryEntry, deleteHistoryEntry, getHistoryEntries, updateHistoryEntry } from '@/lib/server/history';
import { getCustomTemplatesFromRepository, saveCustomTemplatesToRepository } from '@/lib/server/repositories';
import { DataCollectionSubmission, DocumentField, DocumentTemplate, FormAppearance, FormBanner, FormCtaButton, FormMediaSlide } from '@/types/document';
import { renderDocumentTemplate } from '@/lib/template';

export const dynamic = 'force-dynamic';

type FormPayload = {
  id?: string;
  title?: string;
  description?: string;
  fields?: Array<Partial<DocumentField>>;
  instructions?: string;
  accessMode?: 'secure' | 'open';
  customPassword?: string;
  expiryDays?: number;
  maxResponses?: number;
  appearance?: Partial<FormAppearance>;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeAppearance(input?: Partial<FormAppearance>, fallback?: Partial<FormAppearance>): FormAppearance {
  const merged = { ...fallback, ...input };
  const mediaSlides = Array.isArray(merged.mediaSlides)
    ? merged.mediaSlides
        .map((slide, index) => ({
          id: slide.id?.trim() || `slide-${index + 1}`,
          imageUrl: slide.imageUrl?.trim() || '',
          title: slide.title?.trim() || '',
          description: slide.description?.trim() || '',
          ctaLabel: slide.ctaLabel?.trim() || '',
          ctaUrl: slide.ctaUrl?.trim() || '',
        }))
        .filter((slide) => Boolean(slide.imageUrl))
    : [];
  const ctaButtons = Array.isArray(merged.ctaButtons)
    ? merged.ctaButtons
        .map((button, index) => ({
          id: button.id?.trim() || `cta-${index + 1}`,
          label: button.label?.trim() || '',
          url: button.url?.trim() || '',
          type: (button.type === 'whatsapp' ? 'whatsapp' : 'link') as 'link' | 'whatsapp',
        }))
        .filter((button) => Boolean(button.label))
    : [];
  const banners = Array.isArray(merged.banners)
    ? merged.banners
        .map((banner, index) => ({
          id: banner.id?.trim() || `banner-${index + 1}`,
          title: banner.title?.trim() || '',
          description: banner.description?.trim() || '',
          imageUrl: banner.imageUrl?.trim() || '',
          ctaLabel: banner.ctaLabel?.trim() || '',
          ctaUrl: banner.ctaUrl?.trim() || '',
        }))
        .filter((banner) => Boolean(banner.title))
    : [];
  return {
    eyebrow: merged.eyebrow?.trim() || 'docrud secure form',
    heroTitle: merged.heroTitle?.trim() || '',
    heroDescription: merged.heroDescription?.trim() || '',
    introNote: merged.introNote?.trim() || '',
    footerNote: merged.footerNote?.trim() || 'Responses are collected through a secure docrud form workflow.',
    submitLabel: merged.submitLabel?.trim() || 'Submit Form Data',
    successMessage: merged.successMessage?.trim() || 'Your response was submitted successfully.',
    surfaceTone: merged.surfaceTone || 'slate',
    cardStyle: merged.cardStyle || 'soft',
    buttonStyle: merged.buttonStyle || 'solid',
    accentColor: merged.accentColor?.trim() || '#0f172a',
    backgroundColor: merged.backgroundColor?.trim() || '#ffffff',
    textColor: merged.textColor?.trim() || '#0f172a',
    showFieldTypes: merged.showFieldTypes !== false,
    showOptionChips: merged.showOptionChips !== false,
    mediaSlides,
    ctaButtons,
    whatsappNumber: merged.whatsappNumber?.trim() || '',
    whatsappMessage: merged.whatsappMessage?.trim() || '',
    banners,
    allowSingleEditAfterSubmit: merged.allowSingleEditAfterSubmit !== false,
    showSubmissionHistory: merged.showSubmissionHistory !== false,
    heroAlignment: merged.heroAlignment === 'center' ? 'center' : 'left',
    fieldColumns: merged.fieldColumns === 1 ? 1 : 2,
    submitButtonWidth: merged.submitButtonWidth === 'fit' ? 'fit' : 'full',
    thankYouRedirectUrl: merged.thankYouRedirectUrl?.trim() || '',
  };
}

function sanitizeFieldName(value: string, index: number) {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[0-9]/, 'field_$&')
    .toLowerCase();
  return cleaned || `field_${index + 1}`;
}

function buildFormTemplateHtml(title: string, description: string | undefined, fields: DocumentField[], appearanceInput?: Partial<FormAppearance>) {
  const appearance = normalizeAppearance(appearanceInput);
  const toneMap: Record<NonNullable<FormAppearance['surfaceTone']>, { hero: string; shell: string; card: string; border: string; muted: string }> = {
    slate: { hero: 'linear-gradient(135deg,#0f172a,#1e293b)', shell: '#f8fafc', card: '#ffffff', border: '#e2e8f0', muted: '#64748b' },
    amber: { hero: 'linear-gradient(135deg,#422006,#92400e)', shell: '#fffbeb', card: '#ffffff', border: '#fcd34d', muted: '#92400e' },
    emerald: { hero: 'linear-gradient(135deg,#064e3b,#065f46)', shell: '#ecfdf5', card: '#ffffff', border: '#a7f3d0', muted: '#047857' },
    sky: { hero: 'linear-gradient(135deg,#0f172a,#0c4a6e)', shell: '#f0f9ff', card: '#ffffff', border: '#bae6fd', muted: '#0369a1' },
    rose: { hero: 'linear-gradient(135deg,#4c0519,#881337)', shell: '#fff1f2', card: '#ffffff', border: '#fecdd3', muted: '#be123c' },
  };
  const tone = toneMap[appearance.surfaceTone || 'slate'];
  const heroTitle = appearance.heroTitle || title;
  const heroDescription = appearance.heroDescription || description || '';
  const mediaSlides = appearance.mediaSlides || [];
  const ctaButtons = appearance.ctaButtons || [];
  const banners = appearance.banners || [];
  const loopedSlides = mediaSlides.length > 3 ? [...mediaSlides, ...mediaSlides] : mediaSlides;
  const mediaMarkup = mediaSlides.length
    ? `
      <div class="media-strip ${mediaSlides.length > 3 ? 'media-slider' : ''}">
        ${loopedSlides.map((slide) => `
          <div class="media-card">
            <img src="${escapeHtml(slide.imageUrl)}" alt="${escapeHtml(slide.title || heroTitle)}" />
            ${(slide.title || slide.description || slide.ctaLabel) ? `
              <div class="media-copy">
                ${slide.title ? `<p class="media-title">${escapeHtml(slide.title)}</p>` : ''}
                ${slide.description ? `<p class="media-description">${escapeHtml(slide.description)}</p>` : ''}
                ${slide.ctaLabel ? `<span class="media-cta">${escapeHtml(slide.ctaLabel)}</span>` : ''}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `
    : '';
  const ctaMarkup = ctaButtons.length
    ? `<div class="cta-row">${ctaButtons.map((button) => `<span class="cta-chip">${escapeHtml(button.label)}</span>`).join('')}</div>`
    : '';
  const bannerMarkup = banners.length
    ? `<div class="banner-grid">${banners.map((banner) => `
      <div class="banner-card">
        ${banner.imageUrl ? `<img src="${escapeHtml(banner.imageUrl)}" alt="${escapeHtml(banner.title)}" class="banner-image" />` : ''}
        <div class="banner-copy">
          <p class="banner-title">${escapeHtml(banner.title)}</p>
          ${banner.description ? `<p class="banner-description">${escapeHtml(banner.description)}</p>` : ''}
          ${banner.ctaLabel ? `<span class="banner-cta">${escapeHtml(banner.ctaLabel)}</span>` : ''}
        </div>
      </div>
    `).join('')}</div>`
    : '';
  const fieldCards = fields.map((field) => {
    const optionsMarkup = appearance.showOptionChips !== false && field.options?.length
      ? `<div class="options">${field.options.map((option) => `<span class="option-chip">${option}</span>`).join('')}</div>`
      : '';
    const valueMarkup = field.type === 'image'
      ? `<div class="image-frame"><div class="image-label">Image upload</div><div class="image-box">Upload image</div></div>`
      : `<div class="field-value">{{${field.name}}}</div>`;
    return `
      <div class="field-card">
        <div class="field-row">
          <p class="field-label">${field.label}${field.required ? ' *' : ''}</p>
          ${appearance.showFieldTypes !== false ? `<span class="field-type">${field.type}</span>` : ''}
        </div>
        ${valueMarkup}
        ${field.placeholder ? `<p class="field-placeholder">${field.placeholder}</p>` : ''}
        ${optionsMarkup}
      </div>
    `;
  }).join('');

  return `
    <section class="custom-form-shell">
      <div class="custom-form-hero">
        <p class="custom-form-eyebrow">${escapeHtml(appearance.eyebrow || 'docrud secure form')}</p>
        <h1>${escapeHtml(heroTitle)}</h1>
        ${heroDescription ? `<p class="custom-form-description">${escapeHtml(heroDescription)}</p>` : ''}
        ${appearance.introNote ? `<p class="custom-form-note">${escapeHtml(appearance.introNote)}</p>` : ''}
      </div>
      ${mediaMarkup}
      ${ctaMarkup}
      <div class="custom-form-grid">${fieldCards}</div>
      ${bannerMarkup}
      <div class="custom-form-footer">${escapeHtml(appearance.footerNote || 'Responses are collected through a secure docrud form workflow.')}</div>
    </section>
    <style>
      .custom-form-shell { display:flex; flex-direction:column; gap:20px; padding:20px; border-radius:28px; background:${appearance.backgroundColor}; color:${appearance.textColor}; }
      .custom-form-hero { padding:24px; border-radius:24px; background:${tone.hero}; color:white; text-align:${appearance.heroAlignment}; }
      .custom-form-eyebrow { margin:0 0 8px; font-size:11px; text-transform:uppercase; letter-spacing:.24em; color:#cbd5e1; }
      .custom-form-hero h1 { margin:0; font-size:28px; line-height:1.15; }
      .custom-form-description { margin:12px 0 0; font-size:14px; line-height:1.8; color:#e2e8f0; }
      .custom-form-note { margin:14px 0 0; font-size:12px; line-height:1.7; color:#f8fafc; padding:10px 12px; border-radius:14px; background:rgba(255,255,255,.12); }
      .media-strip { display:grid; gap:14px; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); overflow:hidden; }
      .media-slider { display:flex; width:max-content; animation: formMediaLoop 28s linear infinite; }
      .media-card { min-width:240px; max-width:240px; overflow:hidden; border-radius:24px; border:1px solid ${tone.border}; background:${tone.card}; box-shadow:0 14px 30px rgba(15,23,42,0.08); }
      .media-card img { display:block; width:100%; height:160px; object-fit:contain; object-position:center; background:${tone.shell}; padding:14px; }
      .media-copy { padding:14px; display:grid; gap:6px; }
      .media-title { margin:0; font-size:14px; font-weight:700; color:${appearance.textColor}; }
      .media-description { margin:0; font-size:12px; line-height:1.7; color:${tone.muted}; }
      .media-cta { display:inline-flex; width:max-content; border-radius:999px; background:${tone.shell}; border:1px solid ${tone.border}; padding:6px 10px; font-size:11px; color:${appearance.textColor}; }
      .cta-row { display:flex; flex-wrap:wrap; gap:10px; }
      .cta-chip { display:inline-flex; border-radius:999px; background:${appearance.accentColor}; color:white; padding:10px 14px; font-size:12px; font-weight:600; }
      .custom-form-grid { display:grid; gap:14px; grid-template-columns:${appearance.fieldColumns === 1 ? '1fr' : 'repeat(auto-fit,minmax(240px,1fr))'}; }
      .field-card { border:1px solid ${tone.border}; background:${appearance.cardStyle === 'glass' ? 'rgba(255,255,255,0.72)' : appearance.cardStyle === 'outlined' ? 'transparent' : tone.card}; border-radius:22px; padding:18px; box-shadow:${appearance.cardStyle === 'glass' ? '0 18px 40px rgba(15,23,42,0.08)' : 'none'}; backdrop-filter:${appearance.cardStyle === 'glass' ? 'blur(14px)' : 'none'}; }
      .field-row { display:flex; justify-content:space-between; gap:12px; align-items:center; }
      .field-label { margin:0; font-weight:600; color:${appearance.textColor}; }
      .field-type { font-size:11px; text-transform:uppercase; letter-spacing:.18em; color:${tone.muted}; }
      .field-value { margin-top:12px; min-height:44px; border-radius:14px; border:1px dashed ${tone.border}; background:${tone.shell}; padding:12px 14px; color:${tone.muted}; }
      .image-frame { margin-top:12px; display:grid; gap:10px; }
      .image-label { font-size:12px; color:${tone.muted}; }
      .image-box { min-height:120px; border-radius:18px; border:1px dashed ${tone.border}; background:${tone.shell}; display:flex; align-items:center; justify-content:center; color:${tone.muted}; font-size:13px; }
      .field-placeholder { margin:10px 0 0; font-size:12px; color:${tone.muted}; }
      .options { margin-top:12px; display:flex; flex-wrap:wrap; gap:8px; }
      .option-chip { border-radius:999px; background:${tone.card}; border:1px solid ${tone.border}; padding:6px 10px; font-size:12px; color:${appearance.textColor}; }
      .banner-grid { display:grid; gap:14px; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); }
      .banner-card { overflow:hidden; border-radius:24px; border:1px solid ${tone.border}; background:${tone.card}; }
      .banner-image { width:100%; height:144px; object-fit:contain; object-position:center; display:block; background:${tone.shell}; padding:14px; }
      .banner-copy { padding:16px; display:grid; gap:8px; }
      .banner-title { margin:0; font-size:14px; font-weight:700; color:${appearance.textColor}; }
      .banner-description { margin:0; font-size:12px; line-height:1.7; color:${tone.muted}; }
      .banner-cta { display:inline-flex; width:max-content; border-radius:999px; border:1px solid ${tone.border}; background:${tone.shell}; padding:6px 10px; font-size:11px; color:${appearance.textColor}; }
      .custom-form-footer { font-size:12px; color:${tone.muted}; }
      @media (max-width: 640px) {
        .media-card { min-width:212px; max-width:212px; }
        .media-card img, .banner-image { height:138px; }
      }
      @keyframes formMediaLoop { from { transform: translateX(0); } to { transform: translateX(-50%); } }
    </style>
  `;
}

function canAccessForm(session: Awaited<ReturnType<typeof getAuthSession>>, form: DocumentTemplate) {
  if (session?.user?.role === 'admin') return true;
  if (session?.user?.role === 'client') return !form.organizationId || form.organizationId === session.user.id;
  return !form.organizationId && (!form.createdBy || form.createdBy.toLowerCase() === (session?.user?.email || '').toLowerCase());
}

function canAccessFormEntry(session: Awaited<ReturnType<typeof getAuthSession>>, entry: Awaited<ReturnType<typeof getHistoryEntries>>[number]) {
  if (session?.user?.role === 'admin') return true;
  if (session?.user?.role === 'client') return !entry.organizationId || entry.organizationId === session.user.id;
  return !entry.organizationId && entry.generatedBy.toLowerCase() === (session?.user?.email || '').toLowerCase();
}

function normalizeFields(payload: FormPayload) {
  return (payload.fields || [])
    .map((field, index) => {
      const type = field.type || 'text';
      const normalized: DocumentField = {
        id: field.id?.trim() || `form-field-${Date.now()}-${index}`,
        name: sanitizeFieldName(field.name || field.label || '', index),
        label: field.label?.trim() || `Field ${index + 1}`,
        type: ['text', 'date', 'textarea', 'number', 'email', 'select', 'tel', 'url', 'checkbox', 'radio', 'image'].includes(type)
          ? type as DocumentField['type']
          : 'text',
        required: Boolean(field.required),
        placeholder: field.placeholder?.trim() || undefined,
        options: Array.isArray(field.options) ? field.options.map((option) => String(option).trim()).filter(Boolean) : undefined,
        order: index + 1,
      };
      if ((normalized.type === 'select' || normalized.type === 'radio') && (!normalized.options || normalized.options.length === 0)) {
        normalized.options = ['Option 1', 'Option 2'];
      }
      return normalized;
    })
    .filter((field) => field.label.trim());
}

function buildInsights(fields: DocumentField[], submissions: DataCollectionSubmission[]) {
  const total = submissions.length;
  const latest = submissions[0];
  const first = submissions[total - 1];
  const averages = total
    ? Math.round(submissions.reduce((sum, submission) => {
        const filled = fields.filter((field) => String(submission.data[field.name] || '').trim()).length;
        return sum + Math.round((filled / Math.max(fields.length, 1)) * 100);
      }, 0) / total)
    : 0;

  const fieldStats = fields.map((field) => {
    const filled = submissions.filter((submission) => String(submission.data[field.name] || '').trim()).length;
    const empty = total - filled;
    const sampleValues = Array.from(new Set(submissions.map((submission) => {
      const value = String(submission.data[field.name] || '').trim();
      if (!value) return '';
      return field.type === 'image' ? 'Image attached' : value;
    }).filter(Boolean))).slice(0, 4);
    return {
      field: field.label,
      type: field.type,
      fillRate: total ? Math.round((filled / total) * 100) : 0,
      emptyCount: empty,
      sampleValues,
    };
  });

  const weakestFields = [...fieldStats].sort((left, right) => left.fillRate - right.fillRate).slice(0, 3);
  const strongestFields = [...fieldStats].sort((left, right) => right.fillRate - left.fillRate).slice(0, 3);
  const imageFields = fieldStats.filter((field) => field.type === 'image');
  const imageAttachmentRate = imageFields.length ? Math.round(imageFields.reduce((sum, field) => sum + field.fillRate, 0) / imageFields.length) : 0;
  const recentTrend = submissions.slice(0, 5).map((submission) => {
    const filled = fields.filter((field) => String(submission.data[field.name] || '').trim()).length;
    return {
      submittedAt: submission.submittedAt,
      submittedBy: submission.submittedBy,
      completionRate: Math.round((filled / Math.max(fields.length, 1)) * 100),
    };
  }).reverse();
  const velocityWindowDays = total > 1 && first && latest
    ? Math.max(1, Math.ceil((new Date(latest.submittedAt).getTime() - new Date(first.submittedAt).getTime()) / (1000 * 60 * 60 * 24)))
    : 0;
  const submissionsPerDay = velocityWindowDays > 0 ? Number((total / velocityWindowDays).toFixed(1)) : total > 0 ? total : 0;
  const responseVelocity = total <= 1 ? 'early' : submissionsPerDay >= 2 ? 'high' : submissionsPerDay >= 0.5 ? 'steady' : 'slow';

  const recommendations = [
    ...(weakestFields.filter((field) => total > 0 && field.fillRate < 70).map((field) => `Improve the prompt or helper text for "${field.field}" because it is completed in only ${field.fillRate}% of submissions.`)),
    ...(total > 0 && averages < 75 ? [`Average form completion is ${averages}%. Consider reducing optional noise and keeping only the fields that directly affect the decision workflow.`] : []),
    ...(imageFields.length > 0 && imageAttachmentRate < 65 ? [`Image evidence is being attached in only ${imageAttachmentRate}% of responses. Consider clarifying the required proof or making the image field mandatory.`] : []),
    ...(latest ? [`Latest submission came from ${latest.submittedBy} on ${new Date(latest.submittedAt).toLocaleString('en-IN')}. Review this response first if you want the most current signal.`] : ['No submissions yet. Start by sharing the form and capturing the first response.']),
  ];

  return {
    totalSubmissions: total,
    averageCompletionRate: averages,
    imageAttachmentRate,
    responseVelocity,
    submissionsPerDay,
    recentTrend,
    strongestFields,
    weakestFields,
    recommendations,
    summary: total
      ? `This form has ${total} submission${total > 1 ? 's' : ''}. Average completion is ${averages}%. Strongest engagement is in ${strongestFields.map((field) => field.field).join(', ') || 'the initial fields'}.`
      : 'No submissions captured yet. Once responses start arriving, docrud will summarize completion quality and field-level engagement here.',
  };
}

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [templates, history] = await Promise.all([
      getCustomTemplatesFromRepository(),
      getHistoryEntries(),
    ]);

    const visibleForms = templates.filter((template) => template.category === 'Forms' && canAccessForm(session, template));
    const formEntries = history.filter((entry) => entry.category === 'Forms' && canAccessFormEntry(session, entry));

    const payload = visibleForms.map((form) => {
      const entry = formEntries.find((item) => item.templateId === form.id);
      const submissions = entry?.dataCollectionSubmissions || [];
      return {
        id: form.id,
        name: form.name,
        description: form.description,
        updatedAt: form.updatedAt,
        createdAt: form.createdAt,
        fields: form.fields,
        shareUrl: entry?.shareUrl,
        sharePassword: entry?.sharePassword,
        requiresPassword: entry?.shareRequiresPassword !== false,
        instructions: entry?.dataCollectionInstructions,
        accessMode: entry?.shareRequiresPassword === false ? 'open' : 'secure',
        expiryAt: entry?.shareExpiresAt,
        maxResponses: entry?.maxAccessCount,
        submissions,
        latestSubmissionAt: submissions[0]?.submittedAt || entry?.dataCollectionSubmittedAt,
        latestSubmissionBy: submissions[0]?.submittedBy || entry?.dataCollectionSubmittedBy,
        appearance: normalizeAppearance(form.formAppearance),
        insights: buildInsights(form.fields, submissions),
      };
    });

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Error loading forms:', error);
    return NextResponse.json({ error: 'Failed to load forms' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json() as FormPayload;
    const title = payload.title?.trim();
    if (!title) {
      return NextResponse.json({ error: 'Form title is required' }, { status: 400 });
    }

    const normalizedFields = normalizeFields(payload);
    if (normalizedFields.length === 0) {
      return NextResponse.json({ error: 'Add at least one form field' }, { status: 400 });
    }
    const appearance = normalizeAppearance(payload.appearance);

    const templateId = `form-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const templateDescription = payload.description?.trim() || 'Custom secure form created from docrud Daily Tools.';
    const template: DocumentTemplate = {
      id: templateId,
      name: title,
      description: templateDescription,
      category: 'Forms',
      fields: normalizedFields,
      template: buildFormTemplateHtml(title, payload.description?.trim(), normalizedFields, appearance),
      isCustom: true,
      createdBy: session.user.email || session.user.name || 'docrud user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      organizationId: session.user.role === 'client' ? session.user.id : undefined,
      organizationName: session.user.role === 'client' ? session.user.organizationName || session.user.name || 'Business Workspace' : undefined,
      formAppearance: appearance,
    };

    const templates = await getCustomTemplatesFromRepository();
    await saveCustomTemplatesToRepository([template, ...templates]);

    const formEntry = await appendHistoryEntry({
      templateId: template.id,
      templateName: template.name,
      category: 'Forms',
      data: Object.fromEntries(normalizedFields.map((field) => [field.name, ''])),
      generatedBy: session.user.email || session.user.name || 'docrud user',
      generatedAt: new Date().toISOString(),
      previewHtml: renderDocumentTemplate(template, {}),
      recipientAccess: 'edit',
      recipientSignatureRequired: false,
      dataCollectionEnabled: true,
      dataCollectionStatus: 'sent',
      dataCollectionInstructions: payload.instructions?.trim() || `Complete the ${title} form and submit your response securely.`,
      shareAccessPolicy: Number(payload.maxResponses) === 1 ? 'one_time' : Number(payload.expiryDays) > 0 ? 'expiring' : 'standard',
      shareExpiresAt: Number(payload.expiryDays) > 0 ? new Date(Date.now() + Number(payload.expiryDays) * 24 * 60 * 60 * 1000).toISOString() : undefined,
      maxAccessCount: Number(payload.maxResponses) > 0 ? Math.max(1, Number(payload.maxResponses)) : undefined,
      shareRequiresPassword: payload.accessMode !== 'open',
      sharePassword: payload.accessMode !== 'open'
        ? (payload.customPassword?.trim().toUpperCase() || undefined)
        : undefined,
      organizationId: session.user.role === 'client' ? session.user.id : undefined,
      organizationName: session.user.role === 'client' ? session.user.organizationName || session.user.name || 'Business Workspace' : undefined,
      editorState: {
        title,
        lifecycleStage: 'published',
        documentStatus: 'active',
        classification: payload.accessMode === 'open' ? 'public' : 'restricted',
        tags: ['form-builder', 'data-collection'],
        clauseLibrary: [],
        layoutPreset: 'client-ready',
      },
    });

    return NextResponse.json({
      form: template,
      document: formEntry,
      shareUrl: formEntry.shareUrl,
      sharePassword: formEntry.sharePassword,
      requiresPassword: formEntry.shareRequiresPassword !== false,
      appearance,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating form:', error);
    return NextResponse.json({ error: 'Failed to create form' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json() as FormPayload;
    if (!payload.id) {
      return NextResponse.json({ error: 'Form id is required' }, { status: 400 });
    }

    const [templates, history] = await Promise.all([
      getCustomTemplatesFromRepository(),
      getHistoryEntries(),
    ]);
    const templateIndex = templates.findIndex((item) => item.id === payload.id && item.category === 'Forms');
    if (templateIndex === -1) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    const existingTemplate = templates[templateIndex];
    if (!canAccessForm(session, existingTemplate)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const normalizedFields = normalizeFields({ fields: payload.fields || existingTemplate.fields });
    if (normalizedFields.length === 0) {
      return NextResponse.json({ error: 'Add at least one form field' }, { status: 400 });
    }
    const appearance = normalizeAppearance(payload.appearance, existingTemplate.formAppearance);

    const nextTemplate: DocumentTemplate = {
      ...existingTemplate,
      name: payload.title?.trim() || existingTemplate.name,
      description: payload.description?.trim() || existingTemplate.description,
      fields: normalizedFields,
      template: buildFormTemplateHtml(payload.title?.trim() || existingTemplate.name, payload.description?.trim() || existingTemplate.description, normalizedFields, appearance),
      updatedAt: new Date().toISOString(),
      version: (existingTemplate.version || 1) + 1,
      formAppearance: appearance,
    };

    const nextTemplates = [...templates];
    nextTemplates[templateIndex] = nextTemplate;
    await saveCustomTemplatesToRepository(nextTemplates);

    const linkedEntry = history.find((entry) => entry.templateId === existingTemplate.id && entry.category === 'Forms');
    let nextLinkedEntry = linkedEntry || undefined;
    if (linkedEntry && canAccessFormEntry(session, linkedEntry)) {
      const updatedLinkedEntry = await updateHistoryEntry(linkedEntry.id, (current) => ({
        ...current,
        templateName: nextTemplate.name,
        previewHtml: renderDocumentTemplate(nextTemplate, current.data || {}),
        dataCollectionInstructions: payload.instructions?.trim() || current.dataCollectionInstructions,
        shareRequiresPassword: payload.accessMode ? payload.accessMode !== 'open' : current.shareRequiresPassword,
        sharePassword: payload.accessMode === 'open'
          ? undefined
          : payload.customPassword?.trim()
            ? payload.customPassword.trim().toUpperCase()
            : current.sharePassword,
        shareAccessPolicy: Number(payload.maxResponses) === 1 ? 'one_time' : Number(payload.expiryDays) > 0 ? 'expiring' : current.shareAccessPolicy,
        shareExpiresAt: Number(payload.expiryDays) > 0 ? new Date(Date.now() + Number(payload.expiryDays) * 24 * 60 * 60 * 1000).toISOString() : current.shareExpiresAt,
        maxAccessCount: Number(payload.maxResponses) > 0 ? Math.max(1, Number(payload.maxResponses)) : current.maxAccessCount,
        editorState: current.editorState ? {
          ...current.editorState,
          title: nextTemplate.name,
          classification: payload.accessMode === 'open' ? 'public' : payload.accessMode === 'secure' ? 'restricted' : current.editorState.classification,
        } : current.editorState,
      }));
      nextLinkedEntry = updatedLinkedEntry || undefined;
    }

    return NextResponse.json({
      ...nextTemplate,
      appearance,
      shareUrl: nextLinkedEntry?.shareUrl,
      sharePassword: nextLinkedEntry?.sharePassword,
      requiresPassword: nextLinkedEntry?.shareRequiresPassword !== false,
    });
  } catch (error) {
    console.error('Error updating form:', error);
    return NextResponse.json({ error: 'Failed to update form' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Form id is required' }, { status: 400 });
    }

    const templates = await getCustomTemplatesFromRepository();
    const target = templates.find((item) => item.id === id && item.category === 'Forms');
    if (!target) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }
    if (!canAccessForm(session, target)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await saveCustomTemplatesToRepository(templates.filter((item) => item.id !== id));

    const history = await getHistoryEntries();
    const linkedEntry = history.find((entry) => entry.templateId === id && entry.category === 'Forms');
    if (linkedEntry && canAccessFormEntry(session, linkedEntry)) {
      await deleteHistoryEntry(linkedEntry.id);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting form:', error);
    return NextResponse.json({ error: 'Failed to delete form' }, { status: 500 });
  }
}
