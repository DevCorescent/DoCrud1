import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import type { DocumentField, DocumentTemplate } from '@/types/document';

export const dynamic = 'force-dynamic';

function canUse(session: Awaited<ReturnType<typeof getAuthSession>>) {
  return session?.user?.role === 'admin' || session?.user?.role === 'client' || session?.user?.role === 'individual';
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);
}

function titleCase(value: string) {
  return value
    .split(/\s+/g)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function inferCategory(prompt: string): DocumentTemplate['category'] {
  const p = prompt.toLowerCase();
  if (/\b(invoice|quotation|gst|payment reminder|receipt|billing|bill)\b/.test(p)) return 'Finance';
  if (/\b(offer letter|appointment letter|internship|termination|resignation|employment|hr)\b/.test(p)) return 'HR';
  if (/\b(nda|agreement|contract|terms|mou|indemnity|liability|confidential)\b/.test(p)) return 'Legal';
  if (/\b(meeting minutes|mom|memo|announcement|notice)\b/.test(p)) return 'General';
  return 'General';
}

function defaultNameForCategory(category: string) {
  if (category === 'Finance') return 'Invoice';
  if (category === 'HR') return 'Offer Letter';
  if (category === 'Legal') return 'Service Agreement';
  return 'Document';
}

function pickFields(prompt: string, category: string): DocumentField[] {
  const p = prompt.toLowerCase();
  const fields: DocumentField[] = [];
  const push = (field: Omit<DocumentField, 'order'>) => {
    const order = fields.length + 1;
    fields.push({ ...field, order });
  };

  const want = (re: RegExp) => re.test(p);

  // Shared basics
  push({ id: 'company-name', name: 'companyName', label: 'Company name', type: 'text', required: true });
  push({ id: 'company-address', name: 'companyAddress', label: 'Company address', type: 'textarea', required: false });
  push({ id: 'recipient-name', name: 'recipientName', label: category === 'HR' ? 'Candidate name' : 'Recipient name', type: 'text', required: true });
  push({ id: 'recipient-email', name: 'recipientEmail', label: 'Recipient email', type: 'email', required: false });

  if (category === 'Finance') {
    push({ id: 'invoice-number', name: 'invoiceNumber', label: 'Invoice number', type: 'text', required: true });
    push({ id: 'invoice-date', name: 'invoiceDate', label: 'Invoice date', type: 'date', required: true });
    push({ id: 'due-date', name: 'dueDate', label: 'Due date', type: 'date', required: true });
    push({ id: 'currency', name: 'currency', label: 'Currency', type: 'select', required: true, options: ['INR', 'USD', 'EUR', 'GBP'] });
    push({ id: 'subtotal', name: 'subtotal', label: 'Subtotal', type: 'number', required: true });
    push({ id: 'tax', name: 'tax', label: 'Tax', type: 'number', required: false });
    push({ id: 'total', name: 'total', label: 'Total amount', type: 'number', required: true });
    if (want(/\bgst(in)?\b/)) {
      push({ id: 'gstin', name: 'gstin', label: 'GSTIN', type: 'text', required: false });
    }
    push({ id: 'payment-notes', name: 'paymentNotes', label: 'Payment notes', type: 'textarea', required: false });
  } else if (category === 'HR') {
    push({ id: 'role-title', name: 'roleTitle', label: 'Role / Title', type: 'text', required: true });
    push({ id: 'start-date', name: 'startDate', label: 'Start date', type: 'date', required: true });
    push({ id: 'location', name: 'location', label: 'Location', type: 'text', required: false });
    push({ id: 'compensation', name: 'compensation', label: 'Compensation', type: 'text', required: false });
    if (want(/\bctc\b|\bstipend\b|\bsalary\b/)) {
      push({ id: 'salary-notes', name: 'salaryNotes', label: 'Salary notes', type: 'textarea', required: false });
    }
    push({ id: 'reporting-to', name: 'reportingTo', label: 'Reporting to', type: 'text', required: false });
  } else if (category === 'Legal') {
    push({ id: 'effective-date', name: 'effectiveDate', label: 'Effective date', type: 'date', required: true });
    push({ id: 'counterparty', name: 'counterparty', label: 'Counterparty / Party name', type: 'text', required: true });
    push({ id: 'term', name: 'term', label: 'Term', type: 'text', required: false });
    push({ id: 'scope', name: 'scope', label: 'Scope', type: 'textarea', required: false });
    if (want(/\bnda\b|\bconfidential/)) {
      push({ id: 'confidentiality', name: 'confidentiality', label: 'Confidentiality scope', type: 'textarea', required: false });
    }
  } else {
    push({ id: 'date', name: 'date', label: 'Date', type: 'date', required: true });
    push({ id: 'subject', name: 'subject', label: 'Subject', type: 'text', required: true });
    push({ id: 'body', name: 'body', label: 'Body', type: 'textarea', required: true });
  }

  // Keyword-driven additions
  if (want(/\bphone\b|\bmobile\b|\bcontact\b/)) {
    push({ id: 'phone', name: 'phone', label: 'Phone', type: 'tel', required: false });
  }
  if (want(/\bpan\b/)) {
    push({ id: 'pan', name: 'pan', label: 'PAN', type: 'text', required: false });
  }
  if (want(/\baadhaar\b|\baadhar\b/)) {
    push({ id: 'aadhaar', name: 'aadhaar', label: 'Aadhaar (masked)', type: 'text', required: false });
  }

  return fields;
}

function buildHtml(name: string, category: string, description: string, fields: DocumentField[]) {
  const fieldBlocks = fields
    .map((f) => {
      const label = f.label;
      const placeholder = `{{${f.name}}}`;
      if (f.type === 'textarea') {
        return `<div class="kv"><div class="k">${label}</div><div class="v"><div class="box">${placeholder}</div></div></div>`;
      }
      return `<div class="kv"><div class="k">${label}</div><div class="v">${placeholder}</div></div>`;
    })
    .join('\n');

  const metaLine = category ? `<div class="meta">${category} template</div>` : '';
  const descLine = description ? `<p class="desc">${description}</p>` : '';

  return `
  <div class="doc">
    ${metaLine}
    <h1 class="title">${name}</h1>
    ${descLine}
    <div class="grid">
      ${fieldBlocks}
    </div>
    <div class="sign">
      <div class="sig">
        <div class="sigline"></div>
        <div class="siglabel">Authorized signatory</div>
      </div>
      <div class="sig">
        <div class="sigline"></div>
        <div class="siglabel">Recipient</div>
      </div>
    </div>
  </div>
  <style>
    .doc { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #0f172a; }
    .meta { font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: rgba(15,23,42,.55); }
    .title { margin: 12px 0 6px; font-size: 28px; letter-spacing: -0.03em; }
    .desc { margin: 0 0 18px; font-size: 13px; color: rgba(15,23,42,.7); }
    .grid { display: grid; grid-template-columns: 1fr; gap: 10px; margin-top: 10px; }
    .kv { display: grid; grid-template-columns: 190px 1fr; gap: 12px; align-items: start; padding: 10px 12px; border: 1px solid rgba(148,163,184,.35); border-radius: 14px; background: rgba(255,255,255,.85); }
    .k { font-size: 12px; font-weight: 700; color: rgba(15,23,42,.72); }
    .v { font-size: 13px; color: #0f172a; }
    .box { min-height: 64px; border: 1px dashed rgba(148,163,184,.65); border-radius: 12px; padding: 10px; color: rgba(15,23,42,.65); background: rgba(248,250,252,.9); }
    .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-top: 28px; }
    .sigline { height: 1px; background: rgba(148,163,184,.7); margin-bottom: 8px; }
    .siglabel { font-size: 12px; color: rgba(15,23,42,.65); }
    @media print { .kv { break-inside: avoid; } }
  </style>
  `;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!canUse(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await request.json().catch(() => null) as any;
    const prompt = String(payload?.prompt || '').trim();
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt required' }, { status: 400 });
    }

    const category = String(payload?.category || '').trim() || inferCategory(prompt);
    const nameGuess = String(payload?.name || '').trim();
    const name = titleCase(nameGuess || defaultNameForCategory(category));
    const description = String(payload?.description || '').trim() || `AI-drafted ${category.toLowerCase()} template from your brief.`;
    const fields = pickFields(prompt, category).map((field, idx) => ({ ...field, order: idx + 1 }));
    const template = buildHtml(name, category, description, fields);

    return NextResponse.json({
      name,
      category,
      description,
      fields,
      template,
      suggestedId: `custom-${slugify(name) || 'template'}`,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to build template draft' }, { status: 500 });
  }
}

