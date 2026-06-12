import crypto from 'node:crypto';
import { readJsonFile, templateMarketplaceIncomePath, templateMarketplaceItemsPath, templateMarketplacePurchasesPath, templateMarketplaceReviewsPath, writeJsonFile } from '@/lib/server/storage';
import { getDbPool } from '@/lib/server/database';
import {
  deleteTemplateMarketplaceItemRow,
  incrementTemplateMarketplaceItemOpens,
  selectTemplateMarketplaceItemRowById,
  upsertTemplateMarketplaceItemRow,
} from '@/lib/server/db/template-marketplace-items-rows';
import { getCustomTemplatesFromRepository, saveCustomTemplatesToRepository } from '@/lib/server/repositories';
import { getEffectiveSaasPlanForUser } from '@/lib/server/saas';
import { createPendingCommerceTransaction, getRazorpayConfig, verifyRazorpayPaymentSignature } from '@/lib/server/billing';
import type { DocumentField, DocumentTemplate, TemplateMarketplaceIncomeRecord, TemplateMarketplaceItem, TemplateMarketplacePurchase, TemplateMarketplaceReview, User } from '@/types/document';
import { renderDocumentTemplate } from '@/lib/template';

function nowIso() {
  return new Date().toISOString();
}

const MARKETPLACE_PREVIEW_RENDER_VERSION = 2;

function clampInt(value: unknown, min: number, max: number) {
  const num = Math.round(Number(value || 0));
  return Math.max(min, Math.min(max, num));
}

function normalizeTags(raw: unknown) {
  if (Array.isArray(raw)) {
    return raw.map((t) => String(t).trim()).filter(Boolean).slice(0, 20);
  }
  return String(raw || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function buildMarketplaceSampleData(fields: DocumentField[]) {
  const sample: Record<string, string> = {};
  for (const f of fields || []) {
    if (f.type === 'date') sample[f.name] = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date());
    else if (f.type === 'number') sample[f.name] = '1000';
    else if (f.type === 'email') sample[f.name] = 'recipient@company.com';
    else if (f.type === 'tel') sample[f.name] = '+91 98XXXXXX10';
    else if (f.type === 'url') sample[f.name] = 'https://docrud.app';
    else if (f.type === 'textarea') sample[f.name] = 'Replace this text with your content.';
    else if ((f.type === 'select' || f.type === 'radio') && f.options?.length) sample[f.name] = f.options[0]!;
    else if (f.type === 'checkbox') sample[f.name] = 'true';
    else sample[f.name] = f.placeholder || 'Value';
  }
  return sample;
}

async function renderTemplatePreviewImages(params: {
  template: DocumentTemplate;
  exampleData?: Record<string, string>;
  watermarkLabel?: string;
  maxPages?: number;
}) {
  const maxPages = Math.max(1, Math.min(10, params.maxPages ?? 6));
  const tpl = params.template;
  const sample = params.exampleData && typeof params.exampleData === 'object'
    ? { ...params.exampleData }
    : buildMarketplaceSampleData(tpl.fields || []);
  (sample as any).title = tpl.name || 'Template';
  (sample as any).summary = tpl.description || '';

  const settings = tpl.renderSettings;
  const pageSize = settings?.pageSize === 'Custom' ? 'A4' : settings?.pageSize || 'A4';
  const pageWidthMm = settings?.pageSize === 'Custom' ? settings?.pageWidthMm : undefined;
  const pageHeightMm = settings?.pageSize === 'Custom' ? settings?.pageHeightMm : undefined;
  const pageMarginMm = typeof settings?.pageMarginMm === 'number' ? settings?.pageMarginMm : undefined;
  const pageNumbersEnabled = Boolean(settings?.pageNumbersEnabled);
  const pageBackgroundCss = typeof settings?.pageBackgroundCss === 'string' ? settings.pageBackgroundCss : undefined;

  const html = renderDocumentTemplate(tpl, sample, {
    generatedBy: 'docrud marketplace preview',
    renderMode: 'plain',
    watermarkLabel: params.watermarkLabel || 'EXAMPLE',
    pageSize: pageSize as any,
    pageWidthMm,
    pageHeightMm,
    pageMarginMm,
    pageNumbersEnabled,
    pageBackgroundCss,
  });

  const puppeteerMod = await import('puppeteer');
  const puppeteer = (puppeteerMod as any).default || puppeteerMod;
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Screenshot each rendered page element instead of PDF->canvas conversion.
    // This avoids native canvas bindings and stays stable in serverless builds.
    const pageEls = await page.$$('.page');
    const total = Math.min(maxPages, Math.max(1, pageEls.length || 1));
    const images: string[] = [];

    if (!pageEls.length) {
      const buffer = await page.screenshot({ type: 'png', fullPage: true });
      images.push(`data:image/png;base64,${Buffer.from(buffer as any).toString('base64')}`);
      return images;
    }

    for (let i = 0; i < total; i += 1) {
      const el = pageEls[i]!;
      const buffer = await el.screenshot({ type: 'png' });
      images.push(`data:image/png;base64,${Buffer.from(buffer as any).toString('base64')}`);
    }

    return images;
  } finally {
    await browser.close();
  }
}

async function ensureDemoMarketplaceItems() {
  const existing = await readJsonFile<TemplateMarketplaceItem[]>(templateMarketplaceItemsPath, []);
  const publishedCount = existing.filter((item) => item.status === 'published').length;
  const demoCount = existing.filter((item) => item.tags.includes('demo')).length;
  if (publishedCount >= 10 || demoCount >= 10) return existing;

  const now = nowIso();
  const baseFields: DocumentField[] = [
    { id: crypto.randomUUID(), name: 'company_name', label: 'Company Name', type: 'text', required: true, placeholder: 'Company', order: 1 },
    { id: crypto.randomUUID(), name: 'recipient_name', label: 'Recipient Name', type: 'text', required: true, placeholder: 'Recipient', order: 2 },
    { id: crypto.randomUUID(), name: 'effective_date', label: 'Effective Date', type: 'date', required: true, order: 3 },
  ];

  const demos: Array<{ name: string; category: string; description: string; tags: string[]; priceInPaise: number; template: string; fields?: DocumentField[] }> = [
    {
      name: 'Offer Letter (India)',
      category: 'HR',
      description: 'Clean offer letter with compensation table and joining checklist.',
      tags: ['hr', 'offer-letter', 'india', 'demo'],
      priceInPaise: 19900,
      template: `<main class="page"><h1>Offer Letter</h1><p>Date: {{effective_date}}</p><p>Dear {{recipient_name}},</p><p>We are pleased to offer you a position at <strong>{{company_name}}</strong>.</p><p class="muted">This template is a marketplace demo.</p></main>`,
    },
    {
      name: 'Service Agreement (Starter)',
      category: 'Legal',
      description: 'Simple service agreement with scope, SLA, and payment terms.',
      tags: ['legal', 'agreement', 'service', 'demo'],
      priceInPaise: 29900,
      template: `<main class="page"><h1>Service Agreement</h1><p>Between <strong>{{company_name}}</strong> and {{recipient_name}}.</p><h2>Scope</h2><p>[Edit scope here]</p><h2>Terms</h2><p>[Edit terms here]</p></main>`,
    },
    {
      name: 'Invoice (GST-ready)',
      category: 'Finance',
      description: 'GST-ready invoice layout with totals and notes section.',
      tags: ['finance', 'invoice', 'gst', 'demo'],
      priceInPaise: 9900,
      template: `<main class="page"><h1>Invoice</h1><p><strong>{{company_name}}</strong></p><p>Billed to: {{recipient_name}}</p><p>Date: {{effective_date}}</p><hr/><p class="muted">Add line items in your own version.</p></main>`,
    },
    {
      name: 'NDA (Mutual)',
      category: 'Legal',
      description: 'Mutual NDA with clean definitions and signature blocks.',
      tags: ['legal', 'nda', 'mutual', 'demo'],
      priceInPaise: 14900,
      template: `<main class="page"><h1>Mutual NDA</h1><p>This NDA is between <strong>{{company_name}}</strong> and {{recipient_name}} on {{effective_date}}.</p><h2>Confidential Information</h2><p>[Define here]</p></main>`,
    },
    {
      name: 'Vendor Onboarding Letter',
      category: 'Operations',
      description: 'Vendor onboarding packet cover letter with doc checklist.',
      tags: ['ops', 'vendor', 'onboarding', 'demo'],
      priceInPaise: 12900,
      template: `<main class="page"><h1>Vendor Onboarding</h1><p>Hello {{recipient_name}},</p><p>Please share the compliance documents required to onboard you at <strong>{{company_name}}</strong>.</p></main>`,
    },
    {
      name: 'Board Meeting Minutes',
      category: 'Operations',
      description: 'MOM template with attendees, agenda, decisions, and actions.',
      tags: ['mom', 'meeting', 'minutes', 'demo'],
      priceInPaise: 7900,
      template: `<main class="page"><h1>Meeting Minutes</h1><p>Organization: <strong>{{company_name}}</strong></p><p>Date: {{effective_date}}</p><h2>Agenda</h2><p>[Add agenda]</p></main>`,
    },
    {
      name: 'Sales Proposal (One Pager)',
      category: 'Sales',
      description: 'One-page proposal with scope, timeline, and pricing.',
      tags: ['sales', 'proposal', 'one-pager', 'demo'],
      priceInPaise: 24900,
      template: `<main class="page"><h1>Proposal</h1><p>Prepared by <strong>{{company_name}}</strong></p><p>For {{recipient_name}}</p><h2>Summary</h2><p>[Add summary]</p></main>`,
    },
    {
      name: 'Client Intake Form Cover',
      category: 'Client Ops',
      description: 'Cover page for client intake and requirements.',
      tags: ['client-ops', 'intake', 'workflow', 'demo'],
      priceInPaise: 0,
      template: `<main class="page"><h1>Client Intake</h1><p>Welcome to <strong>{{company_name}}</strong>.</p><p>Primary contact: {{recipient_name}}</p></main>`,
    },
    {
      name: 'Policy Notice (Workplace)',
      category: 'HR',
      description: 'Policy notice format with acknowledgement section.',
      tags: ['hr', 'policy', 'notice', 'demo'],
      priceInPaise: 8900,
      template: `<main class="page"><h1>Policy Notice</h1><p>Issued by <strong>{{company_name}}</strong> on {{effective_date}}.</p><p>Recipient: {{recipient_name}}</p></main>`,
    },
    {
      name: 'Project Kickoff Brief',
      category: 'Project',
      description: 'Kickoff doc with goals, milestones, and owners.',
      tags: ['project', 'kickoff', 'brief', 'demo'],
      priceInPaise: 6900,
      template: `<main class="page"><h1>Kickoff Brief</h1><p>Project for {{recipient_name}}</p><p>Team: <strong>{{company_name}}</strong></p><p>Date: {{effective_date}}</p></main>`,
    },
  ];

  const css = `<style>
    :root { --ink:#0A0F3C; --muted:#475569; }
    html,body{ margin:0; padding:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; color:var(--ink); }
    .page{ padding:36px; }
    h1{ margin:0 0 12px; font-size:22px; letter-spacing:-0.02em; }
    h2{ margin:18px 0 8px; font-size:14px; text-transform:uppercase; letter-spacing:0.14em; color:var(--muted); }
    p{ margin:10px 0; line-height:1.6; }
    .muted{ color:var(--muted); font-size:12px; }
    hr{ border:0; border-top:1px solid rgba(148,163,184,0.35); margin:14px 0; }
  </style>`;

  const nextItems: TemplateMarketplaceItem[] = demos.map((demo) => ({
    id: `tplmkt-demo-${crypto.randomUUID()}`,
    templateSnapshot: {
      id: `demo-${crypto.randomUUID()}`,
      name: demo.name,
      description: demo.description,
      category: demo.category,
      fields: demo.fields ?? baseFields.map((f) => ({ ...f, id: crypto.randomUUID() })),
      template: `${css}\n${demo.template}`,
      isCustom: true,
      createdBy: 'docrud',
      createdAt: now,
      updatedAt: now,
      renderSettings: { pageSize: 'A4', pageMarginMm: 18, pageNumbersEnabled: true },
    },
    sellerUserId: 'system',
    sellerName: 'docrud',
    sellerEmail: undefined,
    priceInPaise: clampInt(demo.priceInPaise, 0, 5_00_00_000),
    currency: 'INR',
    tags: normalizeTags(demo.tags),
    status: 'published',
    coverImageDataUrl: undefined,
    createdAt: now,
    updatedAt: now,
    purchaseCount: Math.max(0, Math.round(Math.random() * 120)),
  }));

  const merged = [...nextItems, ...existing].slice(0, 6000);
  await writeJsonFile(templateMarketplaceItemsPath, merged);
  return merged;
}

export async function listMarketplaceItems(params?: { q?: string; category?: string; limit?: number; page?: number; sort?: 'recent' | 'popular' }) {
  const raw = await ensureDemoMarketplaceItems();
  const reviews = await readJsonFile<TemplateMarketplaceReview[]>(templateMarketplaceReviewsPath, []);
  const ratingIndex = new Map<string, { average: number; count: number }>();
  for (const review of reviews) {
    const id = review.itemId;
    if (!id) continue;
    const current = ratingIndex.get(id) || { average: 0, count: 0 };
    ratingIndex.set(id, { average: current.average + Number(review.rating || 0), count: current.count + 1 });
  }
  for (const [id, value] of Array.from(ratingIndex.entries())) {
    ratingIndex.set(id, {
      average: value.count ? Math.round((value.average / value.count) * 10) / 10 : 0,
      count: value.count,
    });
  }
  const q = (params?.q || '').trim().toLowerCase();
  const category = (params?.category || '').trim();
  const page = clampInt((params as any)?.page ?? 1, 1, 10_000);
  const limit = Math.min(60, Math.max(6, params?.limit ?? 24));
  const sort = (((params as any)?.sort || 'recent') as string).toLowerCase() === 'popular' ? 'popular' : 'recent';

  const filtered = raw
    .filter((item) => item.status === 'published')
    .filter((item) => (category ? item.templateSnapshot.category === category : true))
    .filter((item) => {
      if (!q) return true;
      const hay = `${item.templateSnapshot.name} ${item.templateSnapshot.description || ''} ${item.templateSnapshot.category} ${item.tags.join(' ')}`.toLowerCase();
      return hay.includes(q);
    });

  const sorted = filtered.sort((a, b) => {
    if (sort === 'popular') return (b.purchaseCount || 0) - (a.purchaseCount || 0);
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const total = sorted.length;
  const start = (page - 1) * limit;
  const items = sorted
    .slice(start, start + limit)
    .map((item) => ({
      ...item,
      rating: ratingIndex.get(item.id) || { average: 0, count: 0 },
    }) as any);

  return { items, total, page, limit, sort };
}

export async function listMarketplaceItemsBySeller(params: { sellerUserId: string; limit?: number }) {
  const raw = await readJsonFile<TemplateMarketplaceItem[]>(templateMarketplaceItemsPath, []);
  const reviews = await readJsonFile<TemplateMarketplaceReview[]>(templateMarketplaceReviewsPath, []);
  const ratingIndex = new Map<string, { average: number; count: number }>();
  for (const review of reviews) {
    const id = review.itemId;
    if (!id) continue;
    const current = ratingIndex.get(id) || { average: 0, count: 0 };
    ratingIndex.set(id, { average: current.average + Number(review.rating || 0), count: current.count + 1 });
  }
  for (const [id, value] of Array.from(ratingIndex.entries())) {
    ratingIndex.set(id, {
      average: value.count ? Math.round((value.average / value.count) * 10) / 10 : 0,
      count: value.count,
    });
  }
  const limit = Math.min(80, Math.max(6, params.limit ?? 40));
  return raw
    .filter((item) => item.status === 'published')
    .filter((item) => item.sellerUserId === params.sellerUserId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map((item) => ({
      ...item,
      rating: ratingIndex.get(item.id) || { average: 0, count: 0 },
    }) as any)
    .slice(0, limit);
}

export async function getMarketplaceItem(id: string) {
  if (getDbPool()) {
    return selectTemplateMarketplaceItemRowById(id);
  }
  const raw = await readJsonFile<TemplateMarketplaceItem[]>(templateMarketplaceItemsPath, []);
  return raw.find((item) => item.id === id) || null;
}

export async function ensureMarketplaceItemPreviewImages(params: { itemId: string }) {
  const items = await readJsonFile<TemplateMarketplaceItem[]>(templateMarketplaceItemsPath, []);
  const idx = items.findIndex((i) => i.id === params.itemId);
  if (idx === -1) return null;
  const current = items[idx]!;
  if (
    current.previewRenderVersion === MARKETPLACE_PREVIEW_RENDER_VERSION &&
    Array.isArray((current as any).previewImageDataUrls) &&
    (current as any).previewImageDataUrls.length
  ) {
    return current;
  }
  // Avoid generating previews for drafts/archived listings.
  if (current.status !== 'published') return current;

  try {
    const images = await renderTemplatePreviewImages({
      template: current.templateSnapshot,
      exampleData: current.exampleData,
      watermarkLabel: 'EXAMPLE',
      maxPages: 6,
    });
    const next: TemplateMarketplaceItem = {
      ...current,
      previewImageDataUrls: images.slice(0, 6),
      previewRenderVersion: MARKETPLACE_PREVIEW_RENDER_VERSION,
      updatedAt: current.updatedAt,
    };
    items[idx] = next;
    await writeJsonFile(templateMarketplaceItemsPath, items.slice(0, 6000));
    return next;
  } catch (err) {
    console.error('Failed to generate marketplace preview images', err);
    return current;
  }
}

export async function trackMarketplaceItemOpen(params: { itemId: string }) {
  if (getDbPool()) {
    await incrementTemplateMarketplaceItemOpens(params.itemId);
    return selectTemplateMarketplaceItemRowById(params.itemId);
  }
  const items = await readJsonFile<TemplateMarketplaceItem[]>(templateMarketplaceItemsPath, []);
  const idx = items.findIndex((i) => i.id === params.itemId);
  if (idx === -1) return null;
  const current = items[idx]!;
  const next: TemplateMarketplaceItem = {
    ...current,
    openCount: Math.max(0, Number(current.openCount || 0)) + 1,
    updatedAt: current.updatedAt,
  };
  items[idx] = next;
  await writeJsonFile(templateMarketplaceItemsPath, items.slice(0, 6000));
  return next;
}

export async function updateMarketplaceItemStatus(params: {
  actor: User;
  itemId: string;
  status: 'published' | 'archived';
}) {
  if (getDbPool()) {
    const current = await selectTemplateMarketplaceItemRowById(params.itemId);
    if (!current) throw new Error('Template not found.');
    const isOwner = current.sellerUserId === params.actor.id;
    const isAdmin = params.actor.role === 'admin';
    if (!isOwner && !isAdmin) throw new Error('Forbidden.');
    const next: TemplateMarketplaceItem = { ...current, status: params.status, updatedAt: nowIso() };
    await upsertTemplateMarketplaceItemRow(next);
    return next;
  }
  const items = await readJsonFile<TemplateMarketplaceItem[]>(templateMarketplaceItemsPath, []);
  const idx = items.findIndex((i) => i.id === params.itemId);
  if (idx === -1) throw new Error('Template not found.');
  const current = items[idx]!;
  const isOwner = current.sellerUserId === params.actor.id;
  const isAdmin = params.actor.role === 'admin';
  if (!isOwner && !isAdmin) throw new Error('Forbidden.');

  const next: TemplateMarketplaceItem = {
    ...current,
    status: params.status,
    updatedAt: nowIso(),
  };
  items[idx] = next;
  await writeJsonFile(templateMarketplaceItemsPath, items.slice(0, 6000));
  return next;
}

export async function deleteMarketplaceItem(params: {
  actor: User;
  itemId: string;
}) {
  if (getDbPool()) {
    const target = await selectTemplateMarketplaceItemRowById(params.itemId);
    if (!target) throw new Error('Template not found.');
    const isOwner = target.sellerUserId === params.actor.id;
    const isAdmin = params.actor.role === 'admin';
    if (!isOwner && !isAdmin) throw new Error('Forbidden.');
    if ((target.purchaseCount || 0) > 0) {
      throw new Error('Delete is disabled once a template has installs. Use Deactivate instead.');
    }
    await deleteTemplateMarketplaceItemRow(params.itemId);

    // Remove reviews; purchases remain as audit history.
    const reviews = await readJsonFile<TemplateMarketplaceReview[]>(templateMarketplaceReviewsPath, []);
    const nextReviews = reviews.filter((r) => r.itemId !== params.itemId);
    await writeJsonFile(templateMarketplaceReviewsPath, nextReviews.slice(0, 20_000));

    return { ok: true };
  }

  const items = await readJsonFile<TemplateMarketplaceItem[]>(templateMarketplaceItemsPath, []);
  const target = items.find((i) => i.id === params.itemId);
  if (!target) throw new Error('Template not found.');
  const isOwner = target.sellerUserId === params.actor.id;
  const isAdmin = params.actor.role === 'admin';
  if (!isOwner && !isAdmin) throw new Error('Forbidden.');
  if ((target.purchaseCount || 0) > 0) {
    throw new Error('Delete is disabled once a template has installs. Use Deactivate instead.');
  }

  const next = items.filter((i) => i.id !== params.itemId);
  await writeJsonFile(templateMarketplaceItemsPath, next.slice(0, 6000));

  // Remove reviews; purchases remain as audit history.
  const reviews = await readJsonFile<TemplateMarketplaceReview[]>(templateMarketplaceReviewsPath, []);
  const nextReviews = reviews.filter((r) => r.itemId !== params.itemId);
  await writeJsonFile(templateMarketplaceReviewsPath, nextReviews.slice(0, 20_000));

  return { ok: true };
}

export async function countSellerPublishes(sellerUserId: string) {
  const raw = await readJsonFile<TemplateMarketplaceItem[]>(templateMarketplaceItemsPath, []);
  return raw.filter((item) => item.sellerUserId === sellerUserId && item.status === 'published').length;
}

export async function publishTemplateToMarketplace(params: {
  seller: User;
  templateId: string;
  priceInPaise: number;
  tags?: string[] | string;
  coverImageDataUrl?: string;
  exampleData?: Record<string, string>;
}) {
  const plan = await getEffectiveSaasPlanForUser(params.seller);
  const publishLimit = clampInt(plan?.maxMarketplaceTemplatePublishes ?? 0, 0, 10_000);
  const currentPublishes = await countSellerPublishes(params.seller.id);
  if (publishLimit > 0 && currentPublishes >= publishLimit && params.seller.role !== 'admin') {
    throw new Error(`Template publish limit reached for your plan. Limit: ${publishLimit}. Upgrade to publish more templates.`);
  }

  const templates = await getCustomTemplatesFromRepository();
  const template = templates.find((t) => t.id === params.templateId);
  if (!template) {
    throw new Error('Template not found.');
  }

  // Only allow publishing if you created it (admins can override).
  const createdBy = (template.createdBy || '').trim().toLowerCase();
  const sellerEmail = (params.seller.email || '').trim().toLowerCase();
  if (params.seller.role !== 'admin' && createdBy && sellerEmail && createdBy !== sellerEmail) {
    throw new Error('Forbidden.');
  }

  const now = nowIso();
  const items = await readJsonFile<TemplateMarketplaceItem[]>(templateMarketplaceItemsPath, []);
  const item: TemplateMarketplaceItem = {
    id: `tplmkt-${crypto.randomUUID()}`,
    templateSnapshot: {
      ...template,
      // Keep marketplace snapshots stable.
      updatedAt: now,
    } as DocumentTemplate,
    sellerUserId: params.seller.id,
    sellerName: params.seller.name || undefined,
    sellerEmail: params.seller.email || undefined,
    priceInPaise: clampInt(params.priceInPaise, 0, 5_00_00_000),
    currency: 'INR',
    tags: normalizeTags(params.tags),
    status: 'published',
    coverImageDataUrl: params.coverImageDataUrl ? String(params.coverImageDataUrl) : undefined,
    exampleData: params.exampleData && typeof params.exampleData === 'object' ? params.exampleData : undefined,
    previewImageDataUrls: [],
    previewRenderVersion: MARKETPLACE_PREVIEW_RENDER_VERSION,
    createdAt: now,
    updatedAt: now,
    purchaseCount: 0,
  };

  try {
    item.previewImageDataUrls = await renderTemplatePreviewImages({
      template: item.templateSnapshot,
      exampleData: item.exampleData,
      watermarkLabel: 'EXAMPLE',
      maxPages: 6,
    });
  } catch (err) {
    console.error('Failed to render marketplace preview images during publish', err);
    item.previewImageDataUrls = [];
  }

  await writeJsonFile(templateMarketplaceItemsPath, [item, ...items].slice(0, 6000));
  return item;
}

async function savePurchaseRecord(record: TemplateMarketplacePurchase) {
  const existing = await readJsonFile<TemplateMarketplacePurchase[]>(templateMarketplacePurchasesPath, []);
  await writeJsonFile(templateMarketplacePurchasesPath, [record, ...existing].slice(0, 12_000));
}

export async function createTemplatePurchaseOrder(params: {
  buyer: User;
  itemId: string;
}) {
  const razorpayConfig = getRazorpayConfig();
  if (!razorpayConfig.serverConfigured) {
    throw new Error('Razorpay payment gateway is not configured.');
  }

  const item = await getMarketplaceItem(params.itemId);
  if (!item || item.status !== 'published') {
    throw new Error('Template is not available.');
  }

  const amountInPaise = clampInt(item.priceInPaise, 0, 5_00_00_000);
  if (amountInPaise <= 0) {
    throw new Error('This template is free. Use Install instead of checkout.');
  }

  const receipt = `tpl_${params.buyer.id.slice(0, 8)}_${Date.now().toString(36).slice(-8)}`;
  const auth = Buffer.from(`${razorpayConfig.keyId}:${razorpayConfig.keySecret}`).toString('base64');

  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      authorization: `Basic ${auth}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      amount: amountInPaise,
      currency: 'INR',
      receipt,
      notes: {
        product: 'template_marketplace',
        itemId: item.id,
        buyerUserId: params.buyer.id,
      },
    }),
  });

  const payload = await response.json().catch(() => null) as any;
  if (!response.ok || !payload?.id) {
    throw new Error(payload?.error?.description || 'Unable to create Razorpay order.');
  }

  const now = nowIso();
  const record: TemplateMarketplacePurchase = {
    id: crypto.randomUUID(),
    buyerUserId: params.buyer.id,
    buyerEmail: params.buyer.email || undefined,
    itemId: item.id,
    amountInPaise,
    currency: 'INR',
    status: 'created',
    razorpay: { orderId: String(payload.id) },
    installedTemplateId: undefined,
    createdAt: now,
    updatedAt: now,
  };

  await savePurchaseRecord(record);

  await createPendingCommerceTransaction({
    user: params.buyer,
    providerOrderId: String(payload.id),
    productType: 'template_marketplace',
    productLabel: `Template: ${item.templateSnapshot.name}`,
    baseAmountInPaise: amountInPaise,
    amountInPaise,
    quantity: 1,
    unitAmountInPaise: amountInPaise,
    gstRate: 0,
    notes: `Template purchase (${item.id})`,
    receipt,
  });

  return {
    purchase: record,
    checkout: {
      keyId: razorpayConfig.keyId,
      isTestMode: razorpayConfig.isTestMode,
      amountInPaise,
      currency: 'INR' as const,
      orderId: String(payload.id),
      name: 'docrud',
      description: `Template purchase: ${item.templateSnapshot.name}`,
      prefill: {
        name: params.buyer.name || '',
        email: params.buyer.email || '',
      },
      notes: {
        itemId: item.id,
        buyerUserId: params.buyer.id,
        purchaseId: record.id,
      },
    },
  };
}

export async function verifyTemplatePurchase(params: {
  buyer: User;
  purchaseId: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}) {
  const isValid = verifyRazorpayPaymentSignature(params.razorpay_order_id, params.razorpay_payment_id, params.razorpay_signature);
  if (!isValid) {
    throw new Error('Razorpay payment signature verification failed.');
  }

  const purchases = await readJsonFile<TemplateMarketplacePurchase[]>(templateMarketplacePurchasesPath, []);
  const purchase = purchases.find((p) => p.id === params.purchaseId && p.buyerUserId === params.buyer.id);
  if (!purchase) throw new Error('Purchase not found.');
  if (purchase.razorpay.orderId !== params.razorpay_order_id) throw new Error('Purchase does not match this order.');
  if (purchase.status === 'paid' && purchase.installedTemplateId) {
    return purchase;
  }

  const item = await getMarketplaceItem(purchase.itemId);
  if (!item) throw new Error('Template not available.');

  // Install into buyer workspace (copy into custom templates repository).
  const existingTemplates = await getCustomTemplatesFromRepository();
  const now = nowIso();
  const installedTemplate: DocumentTemplate = {
    ...item.templateSnapshot,
    id: `installed-${item.id}-${Date.now().toString(36)}`,
    isCustom: true,
    createdBy: params.buyer.email || params.buyer.id,
    createdAt: now,
    updatedAt: now,
    version: 1,
    // Add origin trace in metadata without affecting rendering.
    metadata: {
      ...(item.templateSnapshot as any).metadata,
      marketplaceOrigin: {
        itemId: item.id,
        sellerUserId: item.sellerUserId,
        purchasedAt: now,
      },
    },
  } as any;

  await saveCustomTemplatesToRepository([installedTemplate, ...existingTemplates].slice(0, 6000));

  // Update marketplace purchase count.
  const items = await readJsonFile<TemplateMarketplaceItem[]>(templateMarketplaceItemsPath, []);
  const itemIndex = items.findIndex((i) => i.id === item.id);
  if (itemIndex !== -1) {
    items[itemIndex] = { ...items[itemIndex], purchaseCount: (items[itemIndex].purchaseCount || 0) + 1, updatedAt: now };
    await writeJsonFile(templateMarketplaceItemsPath, items.slice(0, 6000));
  }

  const updated: TemplateMarketplacePurchase = {
    ...purchase,
    status: 'paid',
    razorpay: {
      orderId: params.razorpay_order_id,
      paymentId: params.razorpay_payment_id,
      signature: params.razorpay_signature,
    },
    installedTemplateId: installedTemplate.id,
    updatedAt: now,
  };

  const next = purchases.map((p) => (p.id === updated.id ? updated : p));
  await writeJsonFile(templateMarketplacePurchasesPath, next.slice(0, 12_000));

  // Record income ledger (commission split). Actual payouts are handled separately.
  if (updated.amountInPaise > 0) {
    const commissionRate = 0.25;
    const gross = clampInt(updated.amountInPaise, 0, 5_00_00_000);
    const commissionAmountInPaise = Math.round(gross * commissionRate);
    const sellerNetAmountInPaise = Math.max(0, gross - commissionAmountInPaise);
    const ledger = await readJsonFile<TemplateMarketplaceIncomeRecord[]>(templateMarketplaceIncomePath, []);
    const exists = ledger.some((r) => r.purchaseId === updated.id);
    if (!exists) {
      const record: TemplateMarketplaceIncomeRecord = {
        id: crypto.randomUUID(),
        itemId: item.id,
        sellerUserId: item.sellerUserId,
        sellerEmail: item.sellerEmail,
        buyerUserId: updated.buyerUserId,
        purchaseId: updated.id,
        currency: 'INR',
        grossAmountInPaise: gross,
        commissionRate,
        commissionAmountInPaise,
        sellerNetAmountInPaise,
        status: 'pending',
        createdAt: now,
      };
      await writeJsonFile(templateMarketplaceIncomePath, [record, ...ledger].slice(0, 40_000));
    }
  }

  return updated;
}

export async function listBuyerTemplatePurchases(buyerUserId: string) {
  const raw = await readJsonFile<TemplateMarketplacePurchase[]>(templateMarketplacePurchasesPath, []);
  return raw.filter((p) => p.buyerUserId === buyerUserId).slice(0, 200);
}

export async function listSellerPublishedTemplates(sellerUserId: string) {
  const raw = await readJsonFile<TemplateMarketplaceItem[]>(templateMarketplaceItemsPath, []);
  return raw
    .filter((item) => item.sellerUserId === sellerUserId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 300);
}

export async function listSellerIncome(params: {
  sellerUserId: string;
  status?: 'pending' | 'paid_out' | 'void' | 'all';
  itemId?: string;
  limit?: number;
}) {
  const raw = await readJsonFile<TemplateMarketplaceIncomeRecord[]>(templateMarketplaceIncomePath, []);
  const limit = Math.min(500, Math.max(20, params.limit ?? 200));
  const status = params.status && params.status !== 'all' ? params.status : null;
  const itemId = params.itemId ? String(params.itemId) : '';
  return raw
    .filter((r) => r.sellerUserId === params.sellerUserId)
    .filter((r) => (status ? r.status === status : true))
    .filter((r) => (itemId ? r.itemId === itemId : true))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

export async function getTemplateAnalytics(params: { itemId: string }) {
  const item = await getMarketplaceItem(params.itemId);
  if (!item) return null;
  const purchases = await readJsonFile<TemplateMarketplacePurchase[]>(templateMarketplacePurchasesPath, []);
  const related = purchases.filter((p) => p.itemId === params.itemId && p.status === 'paid');
  const last30Start = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const last7Start = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const last30 = related.filter((p) => new Date(p.createdAt).getTime() >= last30Start);
  const last7 = related.filter((p) => new Date(p.createdAt).getTime() >= last7Start);
  const gross30 = last30.reduce((acc, p) => acc + (p.amountInPaise || 0), 0);
  const gross7 = last7.reduce((acc, p) => acc + (p.amountInPaise || 0), 0);
  const rating = await getItemRatingSummary(params.itemId);
  return {
    itemId: item.id,
    title: item.templateSnapshot?.name || 'Template',
    installs: item.purchaseCount || 0,
    purchasesTotal: related.length,
    purchases7d: last7.length,
    purchases30d: last30.length,
    gross7dInPaise: gross7,
    gross30dInPaise: gross30,
    rating,
  };
}

export async function reinstallFromPurchase(params: { buyer: User; purchaseId: string }) {
  const purchases = await readJsonFile<TemplateMarketplacePurchase[]>(templateMarketplacePurchasesPath, []);
  const purchase = purchases.find((p) => p.id === params.purchaseId && p.buyerUserId === params.buyer.id && p.status === 'paid');
  if (!purchase) throw new Error('Purchase not found.');
  const item = await getMarketplaceItem(purchase.itemId);
  if (!item) throw new Error('Template not available.');

  const existingTemplates = await getCustomTemplatesFromRepository();
  const now = nowIso();
  const installedTemplate: DocumentTemplate = {
    ...item.templateSnapshot,
    id: `installed-${item.id}-${Date.now().toString(36)}`,
    isCustom: true,
    createdBy: params.buyer.email || params.buyer.id,
    createdAt: now,
    updatedAt: now,
    version: 1,
    metadata: {
      ...(item.templateSnapshot as any).metadata,
      marketplaceOrigin: {
        itemId: item.id,
        sellerUserId: item.sellerUserId,
        purchasedAt: purchase.createdAt,
        reinstalledAt: now,
      },
    },
  } as any;

  await saveCustomTemplatesToRepository([installedTemplate, ...existingTemplates].slice(0, 6000));

  const updated: TemplateMarketplacePurchase = { ...purchase, installedTemplateId: installedTemplate.id, updatedAt: now };
  const next = purchases.map((p) => (p.id === updated.id ? updated : p));
  await writeJsonFile(templateMarketplacePurchasesPath, next.slice(0, 12_000));
  return updated;
}

export async function installFreeTemplate(params: { buyer: User; itemId: string }) {
  const item = await getMarketplaceItem(params.itemId);
  if (!item || item.status !== 'published') throw new Error('Template is not available.');
  const amount = clampInt(item.priceInPaise, 0, 5_00_00_000);
  if (amount !== 0) throw new Error('This template is not free.');

  const existingTemplates = await getCustomTemplatesFromRepository();
  const now = nowIso();
  const installedTemplate: DocumentTemplate = {
    ...item.templateSnapshot,
    id: `installed-${item.id}-${Date.now().toString(36)}`,
    isCustom: true,
    createdBy: params.buyer.email || params.buyer.id,
    createdAt: now,
    updatedAt: now,
    version: 1,
    metadata: {
      ...(item.templateSnapshot as any).metadata,
      marketplaceOrigin: {
        itemId: item.id,
        sellerUserId: item.sellerUserId,
        purchasedAt: now,
        mode: 'free',
      },
    },
  } as any;

  await saveCustomTemplatesToRepository([installedTemplate, ...existingTemplates].slice(0, 6000));

  const purchases = await readJsonFile<TemplateMarketplacePurchase[]>(templateMarketplacePurchasesPath, []);
  const record: TemplateMarketplacePurchase = {
    id: crypto.randomUUID(),
    buyerUserId: params.buyer.id,
    buyerEmail: params.buyer.email || undefined,
    itemId: item.id,
    amountInPaise: 0,
    currency: 'INR',
    status: 'paid',
    razorpay: {},
    installedTemplateId: installedTemplate.id,
    createdAt: now,
    updatedAt: now,
  };
  await writeJsonFile(templateMarketplacePurchasesPath, [record, ...purchases].slice(0, 12_000));

  const items = await readJsonFile<TemplateMarketplaceItem[]>(templateMarketplaceItemsPath, []);
  const idx = items.findIndex((i) => i.id === item.id);
  if (idx !== -1) {
    items[idx] = { ...items[idx], purchaseCount: (items[idx].purchaseCount || 0) + 1, updatedAt: now };
    await writeJsonFile(templateMarketplaceItemsPath, items.slice(0, 6000));
  }

  return { installedTemplateId: installedTemplate.id };
}

export async function listItemReviews(itemId: string) {
  const raw = await readJsonFile<TemplateMarketplaceReview[]>(templateMarketplaceReviewsPath, []);
  return raw.filter((r) => r.itemId === itemId).slice(0, 200);
}

export async function getItemRatingSummary(itemId: string) {
  const reviews = await listItemReviews(itemId);
  if (!reviews.length) return { average: 0, count: 0 };
  const sum = reviews.reduce((acc, r) => acc + Number(r.rating || 0), 0);
  return { average: Math.round((sum / reviews.length) * 10) / 10, count: reviews.length };
}

export async function canReviewItem(params: { buyerUserId: string; itemId: string }) {
  const purchases = await listBuyerTemplatePurchases(params.buyerUserId);
  return purchases.some((p) => p.itemId === params.itemId && p.status === 'paid');
}

export async function upsertReview(params: {
  itemId: string;
  buyer: User;
  rating: number;
  title?: string;
  body?: string;
}) {
  const allowed = await canReviewItem({ buyerUserId: params.buyer.id, itemId: params.itemId });
  if (!allowed) throw new Error('Purchase required to review this template.');
  const rating = clampInt(params.rating, 1, 5) as 1 | 2 | 3 | 4 | 5;
  const now = nowIso();
  const raw = await readJsonFile<TemplateMarketplaceReview[]>(templateMarketplaceReviewsPath, []);
  const existingIdx = raw.findIndex((r) => r.itemId === params.itemId && r.buyerUserId === params.buyer.id);
  const record: TemplateMarketplaceReview = {
    id: existingIdx === -1 ? crypto.randomUUID() : raw[existingIdx]!.id,
    itemId: params.itemId,
    buyerUserId: params.buyer.id,
    buyerName: params.buyer.name || undefined,
    rating,
    title: params.title ? String(params.title).trim().slice(0, 80) : undefined,
    body: params.body ? String(params.body).trim().slice(0, 900) : undefined,
    createdAt: existingIdx === -1 ? now : raw[existingIdx]!.createdAt,
  };
  if (existingIdx === -1) {
    await writeJsonFile(templateMarketplaceReviewsPath, [record, ...raw].slice(0, 20_000));
  } else {
    const next = raw.map((r, idx) => idx === existingIdx ? record : r);
    await writeJsonFile(templateMarketplaceReviewsPath, next.slice(0, 20_000));
  }
  return record;
}
