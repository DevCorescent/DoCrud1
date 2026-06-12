import { DocumentTemplate, RecipientSignatureRecord, SignatureRecord } from '@/types/document';
import { DEFAULT_DOCUMENT_DESIGN_PRESET, type DocumentDesignPreset, isDocumentDesignPreset } from '@/lib/document-designs';
import { formatSignatureLocation } from '@/lib/location';

const BRAND_LOGO_SRC = '/docrud-logo.png';

function generateDocumentNumber(referenceNumber?: string) {
  if (referenceNumber) {
    return referenceNumber;
  }

  return `DCR-DOC-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Date.now().toString().slice(-6)}`;
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeRichText(value: string) {
  const withoutScripts = value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/\son[a-z]+="[^"]*"/gi, '')
    .replace(/\son[a-z]+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');

  return withoutScripts;
}

function prettifyLabel(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildFallbackBody(template: DocumentTemplate, data: Record<string, string>) {
  const fieldRows = template.fields
    .map((field) => {
      const label = escapeHtml(field.label || prettifyLabel(field.name));
      const value = field.type === 'textarea'
        ? sanitizeRichText(data[field.name] || '<p>Not provided</p>')
        : escapeHtml(data[field.name] || 'Not provided');
      return `
        <tr>
          <td class="field-label">${label}</td>
          <td class="field-value">${value}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <section class="summary-block">
      <p class="lead">
        This ${escapeHtml(template.name)} has been generated using the approved docrud workflow.
        Please review the details below before circulation.
      </p>
    </section>
    <section class="details-block">
      <table class="details-table">
        <tbody>${fieldRows}</tbody>
      </table>
    </section>
    <section class="footer-note">
      <p>This document is system generated and carries an internal docrud sample and audit watermark when required.</p>
    </section>
  `;
}

function injectValues(html: string, template: DocumentTemplate, data: Record<string, string>) {
  let output = html;

  // Optional conditional blocks (used by Template Studio no-code builder):
  // <!--DOCIF field:present--> ... <!--DOCENDIF-->
  // <!--DOCIF field:value--> ... <!--DOCENDIF-->
  // This is intentionally simple and non-nesting to keep templates deterministic.
  output = output.replace(/<!--DOCIF\s+([a-zA-Z0-9_]+)\s*:\s*([^>]+?)\s*-->([\s\S]*?)<!--DOCENDIF-->/g, (_m, fieldName: string, rawRule: string, inner: string) => {
    const rule = String(rawRule || '').trim();
    const value = String((data as any)?.[fieldName] ?? '').trim();
    if (rule.toLowerCase() === 'present') {
      return value ? inner : '';
    }
    return value === rule ? inner : '';
  });

  template.fields.forEach((field) => {
    const safeValue = field.type === 'textarea'
      ? sanitizeRichText(data[field.name] || '')
      : escapeHtml(data[field.name] || '');
    output = output.replace(new RegExp(`{{${field.name}}}`, 'g'), safeValue);
  });

  return output;
}

function buildDocumentHeader(
  designPreset: DocumentDesignPreset,
  brandLogoSrc: string,
  pageCounter: string,
) {
  const presetCopy: Record<DocumentDesignPreset, { eyebrow: string; tagline: string }> = {
    'corporate-grid': {
      eyebrow: 'Enterprise Document Suite',
      tagline: 'Structured communication for operational, client, and compliance workflows.',
    },
    'executive-frame': {
      eyebrow: 'Executive Correspondence',
      tagline: 'Premium presentation format for approvals, external circulation, and leadership review.',
    },
    'legal-classic': {
      eyebrow: 'Registered Corporate Office',
      tagline: 'Formal legal drafting standard for agreements, notices, and governed records.',
    },
    'modern-panel': {
      eyebrow: 'Business Operations Letterhead',
      tagline: 'Contemporary enterprise format with high-clarity metadata and clean review lines.',
    },
    'minimal-edge': {
      eyebrow: 'Official Business Communication',
      tagline: 'Minimal enterprise styling for trusted internal and client-ready documentation.',
    },
    'meridian-slate': {
      eyebrow: 'Operational Control Deck',
      tagline: 'Premium slate-toned format for account operations, client delivery, and executive reporting.',
    },
    'studio-band': {
      eyebrow: 'Brand Studio Letterhead',
      tagline: 'Modern banner-led presentation for proposals, summaries, and high-clarity external packets.',
    },
    'luxe-serif': {
      eyebrow: 'Formal Correspondence Suite',
      tagline: 'Editorial serif-led document styling for polished legal, investor, and board-ready communication.',
    },
  };

  const copy = presetCopy[designPreset];

  return `
    <section class="hero hero-${designPreset}">
      <div class="brand brand-${designPreset}">
        <div class="brand-mark">
          <div class="brand-wordmark">docrud</div>
        </div>
        <div class="brand-copy">
          <p class="brand-eyebrow">${copy.eyebrow}</p>
          <p class="brand-company">docrud document workspace</p>
          <p class="brand-tagline">${copy.tagline}</p>
        </div>
      </div>
      <div class="meta meta-${designPreset}">
        <div class="meta-row meta-row-page"><span class="meta-page-chip">${pageCounter}</span></div>
        <div class="meta-row"><span class="meta-label">Platform:</span> <span class="meta-value">docrud secure document cloud</span></div>
        <div class="meta-row"><span class="meta-value">sample.workspace@docrud.com</span></div>
        <div class="meta-row"><span class="meta-value">Tenant-safe preview and export flow</span></div>
        <div class="meta-row"><span class="meta-value">Audit-ready metadata and approvals</span></div>
        <div class="meta-row website-row"><span class="meta-value">www.docrud.com</span></div>
      </div>
    </section>
  `;
}

export function renderDocumentTemplate(
  template: DocumentTemplate,
  data: Record<string, string>,
  options?: {
    referenceNumber?: string;
    generatedBy?: string;
    generatedAt?: string;
    signature?: SignatureRecord | null;
    recipientSignature?: RecipientSignatureRecord | null;
    watermarkLabel?: string;
    letterheadMode?: 'default' | 'image' | 'html';
    letterheadImageDataUrl?: string;
    letterheadHtml?: string;
    brandLogoSrc?: string;
    designPreset?: DocumentDesignPreset;
    renderMode?: 'platform' | 'plain';
    pageSize?: 'A4' | 'Letter' | 'Legal';
    pageWidthMm?: number;
    pageHeightMm?: number;
    pageMarginMm?: number;
    pageNumbersEnabled?: boolean;
    pageBackgroundCss?: string;
  }
) {
  const brandLogoSrc = options?.brandLogoSrc || BRAND_LOGO_SRC;
  const designPreset = isDocumentDesignPreset(options?.designPreset) ? options.designPreset : DEFAULT_DOCUMENT_DESIGN_PRESET;
  const wantsPlain = options?.renderMode === 'plain';
  const rawBody = template.template && template.template.trim() !== '...' && template.template.trim().length > 20
    ? injectValues(template.template, template, data)
    : (wantsPlain ? '' : buildFallbackBody(template, data));

  if (template.category === 'Forms' || template.formAppearance) {
    return `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>
            body {
              margin: 0;
              background: #f8fafc;
            }
          </style>
        </head>
        <body>
          ${rawBody}
        </body>
      </html>
    `;
  }

  const generatedAt = options?.generatedAt ? new Date(options.generatedAt).toLocaleString() : new Date().toLocaleString();
  const pageCounter = template.id === 'contractual-agreement' ? 'Page 1 of 3' : 'Page 1 of 1';
  const documentNumber = generateDocumentNumber(options?.referenceNumber);

  const signatureMarkup = options?.signature?.signatureDataUrl
    ? `
      <section class="signature-block">
        <div>
          <p class="signature-label">Authorized Signature</p>
          <img class="signature-image" src="${options.signature.signatureDataUrl}" alt="Authorized signature" />
          <p class="signature-name">${escapeHtml(options.signature.signerName)}</p>
          <p class="signature-role">${escapeHtml(options.signature.signerRole)}</p>
          <p class="signature-meta">Captured ${escapeHtml(options.signature.signedAt || '')}${options.signature.signedIp ? ` from ${escapeHtml(options.signature.signedIp)}` : ''}</p>
        </div>
      </section>
    `
    : '';

  const recipientSignatureMarkup = options?.recipientSignature?.signatureDataUrl
    ? `
      <section class="signature-block recipient-signature">
        <div class="signature-grid">
          <div>
          <p class="signature-label">Recipient Signature</p>
          <img class="signature-image" src="${options.recipientSignature.signatureDataUrl}" alt="Recipient signature" />
          <p class="signature-name">${escapeHtml(options.recipientSignature.signerName)}</p>
          <p class="signature-meta">Captured ${escapeHtml(options.recipientSignature.signedAt || '')}</p>
          <p class="signature-meta">IP Address: ${escapeHtml(options.recipientSignature.signedIp || 'unknown')}</p>
          ${options.recipientSignature.aadhaarVerifiedAt ? `
            <p class="signature-meta">Aadhaar verified: ${escapeHtml(options.recipientSignature.aadhaarMaskedId || 'verified identity')} on ${escapeHtml(options.recipientSignature.aadhaarVerifiedAt)}</p>
            <p class="signature-meta">Verification ref: ${escapeHtml(options.recipientSignature.aadhaarReferenceId || 'not available')} via ${escapeHtml(options.recipientSignature.aadhaarProviderLabel || 'configured gateway')}</p>
          ` : ''}
          <p class="signature-meta">Signing Location: ${escapeHtml(formatSignatureLocation({
            label: options.recipientSignature.signedLocationLabel,
            latitude: options.recipientSignature.signedLatitude,
            longitude: options.recipientSignature.signedLongitude,
            accuracyMeters: options.recipientSignature.signedAccuracyMeters,
          }))}</p>
          </div>
          ${options.recipientSignature.signerPhotoDataUrl ? `
            <div class="signature-proof-card">
              <p class="signature-label">Live Signer Photo</p>
              <img class="signature-proof-image" src="${options.recipientSignature.signerPhotoDataUrl}" alt="Live signer verification capture" />
              <p class="signature-meta">Captured ${escapeHtml(options.recipientSignature.signerPhotoCapturedAt || '')}</p>
              <p class="signature-meta">Capture IP: ${escapeHtml(options.recipientSignature.signerPhotoCapturedIp || 'unknown')}</p>
              <p class="signature-meta">Method: ${escapeHtml(options.recipientSignature.signerPhotoCaptureMethod === 'live_camera' ? 'Live camera capture' : 'Captured evidence')}</p>
            </div>
          ` : ''}
        </div>
      </section>
    `
    : '';

  if (wantsPlain) {
    const size = options?.pageSize || 'A4';
    const watermarkLabel = String(options?.watermarkLabel || '').trim();
    const page = (() => {
      if (Number.isFinite(options?.pageWidthMm) && Number.isFinite(options?.pageHeightMm)) {
        return {
          w: Math.max(120, Number(options?.pageWidthMm)),
          h: Math.max(120, Number(options?.pageHeightMm)),
        };
      }
      if (size === 'Letter') return { w: 215.9, h: 279.4 };
      if (size === 'Legal') return { w: 215.9, h: 355.6 };
      return { w: 210, h: 297 };
    })();
    const marginMm = Number.isFinite(options?.pageMarginMm) ? Math.max(0, Number(options?.pageMarginMm)) : 16;
    const pageNumbersEnabled = Boolean(options?.pageNumbersEnabled);
    const sanitizePageBackgroundCss = (value: unknown) => {
      const v = String(value ?? '').trim();
      if (!v) return '';
      if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return v;
      if (/^(rgb|rgba)\(/i.test(v)) return v;
      if (/^(linear-gradient|radial-gradient)\(/i.test(v)) return v;
      // allow shorthand that includes an embedded data URL image
      if (/url\(\s*['"]?data:image\//i.test(v)) return v;
      return '';
    };
    const pageBackgroundCss = sanitizePageBackgroundCss(options?.pageBackgroundCss) || '#ffffff';

    const watermarkSvg = watermarkLabel
      ? (() => {
          const safe = escapeHtml(watermarkLabel).toUpperCase();
          const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="420" height="320">
              <defs>
                <style>
                  .wm{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-weight:800;letter-spacing:.32em;fill:rgba(15,23,42,.14)}
                </style>
              </defs>
              <g transform="translate(210 160) rotate(-24)">
                <text class="wm" text-anchor="middle" font-size="34">${safe}</text>
              </g>
            </svg>
          `.trim();
          return `data:image/svg+xml,${encodeURIComponent(svg)}`;
        })()
      : '';

    return `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>
            * { box-sizing: border-box; }
            @page {
              size: ${page.w}mm ${page.h}mm;
              margin: ${marginMm}mm;
            }
            body {
              margin: 0;
              background: transparent;
              color: #0b1220;
            }
            .page {
              position: relative;
              width: ${page.w}mm;
              margin: 0 auto;
              padding: ${marginMm}mm;
              background: ${pageBackgroundCss};
              /* Important: do not clip content, otherwise PDF pagination and long templates get cut. */
              overflow: visible;
              border: none;
              box-shadow: none;
            }
            ${watermarkLabel ? `
              .page::before{
                content:"";
                position:absolute;
                inset:-20mm;
                pointer-events:none;
                user-select:none;
                background-image:url("${watermarkSvg}");
                background-repeat:repeat;
                background-size:420px 320px;
                opacity:0.14;
                z-index:0;
              }
              .page > * { position: relative; z-index: 1; }
            ` : ''}
            .page-number {
              position: fixed;
              bottom: 10mm;
              right: 10mm;
              font-family: ui-sans-serif, system-ui;
              font-size: 10px;
              color: rgba(15, 23, 42, 0.55);
            }
            .page-number::after {
              content: "Page " counter(page) " of " counter(pages);
            }
            @media print {
              body { background: #fff; }
              .page { margin: 0; box-shadow: none; border: none; }
            }
          </style>
        </head>
        <body>
          <div class="page">
            ${rawBody}
            ${signatureMarkup}
            ${recipientSignatureMarkup}
          </div>
          ${pageNumbersEnabled ? '<div class="page-number"></div>' : ''}
        </body>
      </html>
    `;
  }

  const headerMarkup = buildDocumentHeader(designPreset, brandLogoSrc, pageCounter);

  const poweredFooter = `
    <footer class="powered-footer">
      <div class="powered-footer-copy">
        <span class="powered-footer-line powered-footer-strong">Document No.: ${escapeHtml(documentNumber)}</span>
        <span class="powered-footer-line">Generated on ${escapeHtml(generatedAt)}</span>
        <span class="powered-footer-line">Developed &amp; Powered by docrud</span>
        <span class="powered-footer-line">
          This document has been generated using our proprietary software, designed to ensure the highest standards of data integrity, security, and compliance. All information is protected through advanced encryption protocols, keeping your data safe and reliable at every step.
        </span>
        <span class="powered-footer-line">
          docrud is designed to streamline business documents with secure workflows, tenant-safe collaboration, and controlled distribution.
        </span>
        <span class="powered-footer-line">For workspace setup, platform enablement, and premium rollout support, contact the docrud team.</span>
        <span class="powered-footer-line">docrud maintains platform controls and security boundaries, while each client tenant is expected to maintain its own confidentiality and compliance standards throughout the document lifecycle.</span>
      </div>
      <a class="powered-footer-button" href="https://www.docrud.com/contact" target="_blank" rel="noreferrer">Contact docrud</a>
    </footer>
  `;

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: "Aptos", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
            background: #f3f3f3;
            color: #2a2a2a;
          }
          .page {
            position: relative;
            width: 794px;
            min-height: 1123px;
            margin: 18px auto;
            background: #ffffff;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.10);
          }
          .watermark {
            position: absolute;
            inset: 160px 32px 120px 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: none;
            user-select: none;
            z-index: 0;
          }
          .watermark-logo {
            font-size: min(14vw, 118px);
            font-weight: 900;
            letter-spacing: 0.18em;
            text-transform: lowercase;
            color: rgba(15, 23, 42, 0.1);
            opacity: 0.14;
          }
          .watermark-text {
            position: absolute;
            transform: rotate(-24deg);
            font-size: 54px;
            font-weight: 700;
            letter-spacing: 0.28em;
            text-transform: uppercase;
            color: rgba(15, 23, 42, 0.14);
            text-align: center;
            line-height: 1.25;
          }
          .letterhead-top {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 56px;
            z-index: 2;
          }
          .letterhead-top::before,
          .letterhead-top::after {
            content: "";
            position: absolute;
            top: 0;
            height: 0;
            border-top: 34px solid #ff5a14;
          }
          .letterhead-top::before {
            left: 0;
            width: 0;
            border-right: 180px solid transparent;
          }
          .letterhead-top::after {
            left: 86px;
            width: 0;
            border-top-color: #ffb08c;
            border-right: 286px solid transparent;
          }
          .letterhead-top-accent {
            position: absolute;
            top: 10px;
            left: 248px;
            width: 120px;
            height: 26px;
            background: #ff5a14;
            transform: skewX(-16deg);
          }
          .letterhead-bottom {
            position: absolute;
            right: 0;
            bottom: 28px;
            width: 220px;
            height: 44px;
            z-index: 2;
          }
          .letterhead-bottom::before,
          .letterhead-bottom::after {
            content: "";
            position: absolute;
            bottom: 0;
            height: 16px;
            transform: skewX(-24deg);
          }
          .letterhead-bottom::before {
            right: 0;
            width: 92px;
            background: #ff5a14;
          }
          .letterhead-bottom::after {
            right: 72px;
            width: 88px;
            background: #ffb08c;
          }
          .letterhead-bottom-accent {
            position: absolute;
            right: 138px;
            bottom: 16px;
            width: 66px;
            height: 14px;
            background: #ff5a14;
            transform: skewX(-24deg);
          }
          .content {
            position: relative;
            z-index: 1;
            padding: 80px 38px 82px;
          }
          .custom-letterhead {
            position: relative;
            z-index: 2;
            margin-bottom: 18px;
            border-bottom: 1px solid rgba(15, 23, 42, 0.08);
            padding-bottom: 16px;
          }
          .custom-letterhead img {
            display: block;
            width: 100%;
            height: auto;
          }
          .hero {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 270px;
            gap: 28px;
            align-items: start;
            padding: 0 0 20px;
            margin-bottom: 14px;
            border-bottom: 1px solid rgba(15, 23, 42, 0.12);
          }
          .brand {
            display: flex;
            align-items: center;
            justify-content: flex-start;
            margin: 0;
            min-height: 108px;
            padding: 12px 0 10px;
            gap: 18px;
          }
          .brand-mark {
            display: flex;
            align-items: center;
            justify-content: flex-start;
            min-width: 210px;
          }
          .brand-wordmark {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 168px;
            min-height: 58px;
            padding: 0 20px;
            border-radius: 18px;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 52%, #ff5a14 100%);
            color: #ffffff;
            font-size: 24px;
            font-weight: 900;
            letter-spacing: 0.08em;
            text-transform: lowercase;
            box-shadow: 0 18px 34px rgba(15, 23, 42, 0.14);
          }
          .brand-copy {
            display: flex;
            flex-direction: column;
            gap: 6px;
            min-width: 0;
          }
          .brand-eyebrow {
            margin: 0;
            color: #ff5a14;
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.16em;
            text-transform: uppercase;
          }
          .brand-company {
            margin: 0;
            color: #0f172a;
            font-size: 18px;
            font-weight: 800;
            line-height: 1.2;
          }
          .brand-tagline {
            margin: 0;
            color: #475569;
            font-size: 12px;
            line-height: 1.5;
          }
          .meta {
            min-width: 0;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 7px;
            align-self: stretch;
          }
          .meta-row {
            display: block;
            font-size: 12px;
            line-height: 1.4;
            padding: 0;
            margin: 0;
            text-align: right;
            border-bottom: 0;
          }
          .meta-row-page {
            margin-bottom: 4px;
          }
          .meta-page-chip {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 28px;
            padding: 0 12px;
            border: 1px solid rgba(15, 23, 42, 0.16);
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.96);
            color: #0f172a;
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          .meta-label {
            color: #475569;
            font-weight: 700;
            display: inline;
          }
          .meta-value {
            color: #334155;
            font-weight: 600;
            display: inline;
          }
          .website-row .meta-value {
            color: #ff5a14;
            font-weight: 700;
          }
          .page.design-corporate-grid .hero {
            grid-template-columns: minmax(0, 1fr) 270px;
          }
          .page.design-executive-frame .hero {
            grid-template-columns: minmax(0, 1fr) 290px;
            padding: 18px 22px;
            margin-bottom: 18px;
            border: 1px solid rgba(15, 23, 42, 0.12);
            border-radius: 24px;
            background: linear-gradient(135deg, rgba(255, 247, 237, 0.9), rgba(255, 255, 255, 1));
          }
          .page.design-executive-frame .brand {
            min-height: 120px;
            padding: 0;
          }
          .page.design-executive-frame .brand-mark {
            min-width: 220px;
            padding: 14px 0;
          }
          .page.design-executive-frame .meta {
            padding: 18px;
            border-radius: 20px;
            border: 1px solid rgba(15, 23, 42, 0.08);
            background: rgba(255, 255, 255, 0.96);
          }
          .page.design-legal-classic {
            box-shadow: none;
            border: 1px solid rgba(87, 83, 78, 0.28);
          }
          .page.design-legal-classic .letterhead-top,
          .page.design-legal-classic .letterhead-bottom {
            display: none;
          }
          .page.design-legal-classic .content {
            padding-top: 52px;
          }
          .page.design-legal-classic .hero {
            grid-template-columns: minmax(0, 1fr) 250px;
            gap: 24px;
            padding: 12px 0;
            border-top: 4px double rgba(68, 64, 60, 0.8);
            border-bottom: 4px double rgba(68, 64, 60, 0.8);
          }
          .page.design-legal-classic .brand {
            min-height: 96px;
            padding: 0;
          }
          .page.design-legal-classic .brand-copy {
            gap: 4px;
          }
          .page.design-legal-classic .brand-eyebrow,
          .page.design-legal-classic .brand-tagline,
          .page.design-legal-classic .meta-value,
          .page.design-legal-classic .meta-label {
            color: #44403c;
          }
          .page.design-legal-classic .brand-company,
          .page.design-legal-classic .document-title {
            font-family: Georgia, "Times New Roman", serif;
            letter-spacing: 0.04em;
          }
          .page.design-legal-classic .brand-company {
            font-size: 20px;
            text-transform: uppercase;
          }
          .page.design-legal-classic .document-title {
            font-size: 20px;
          }
          .page.design-legal-classic .meta-page-chip {
            border-color: rgba(68, 64, 60, 0.35);
            color: #44403c;
          }
          .page.design-modern-panel .hero {
            grid-template-columns: minmax(0, 1fr) 304px;
            gap: 24px;
            border-bottom: 0;
            margin-bottom: 18px;
          }
          .page.design-modern-panel .brand {
            min-height: 124px;
            padding: 12px 0 12px 18px;
            border-left: 6px solid #ff5a14;
            background: linear-gradient(135deg, rgba(255, 247, 237, 0.6), rgba(255, 255, 255, 0.96));
            border-radius: 20px;
          }
          .page.design-modern-panel .meta {
            padding: 18px 20px;
            border-radius: 22px;
            background: linear-gradient(180deg, #0f172a, #1e293b);
            box-shadow: 0 20px 40px rgba(15, 23, 42, 0.14);
          }
          .page.design-modern-panel .meta-label,
          .page.design-modern-panel .meta-value {
            color: rgba(255, 255, 255, 0.9);
          }
          .page.design-modern-panel .meta-page-chip {
            border-color: rgba(255, 255, 255, 0.18);
            background: rgba(255, 255, 255, 0.08);
            color: #ffffff;
          }
          .page.design-minimal-edge .letterhead-top::before,
          .page.design-minimal-edge .letterhead-top::after,
          .page.design-minimal-edge .letterhead-top-accent,
          .page.design-minimal-edge .letterhead-bottom::before,
          .page.design-minimal-edge .letterhead-bottom::after,
          .page.design-minimal-edge .letterhead-bottom-accent {
            background: #d4d4d8;
            border-top-color: #d4d4d8;
          }
          .page.design-minimal-edge .hero {
            grid-template-columns: minmax(0, 1fr) 260px;
            gap: 22px;
            padding-bottom: 16px;
            border-bottom: 1px solid rgba(113, 113, 122, 0.22);
          }
          .page.design-minimal-edge .brand {
            min-height: 92px;
            padding: 0;
          }
          .page.design-minimal-edge .brand-eyebrow {
            color: #71717a;
          }
          .page.design-minimal-edge .brand-company {
            font-size: 17px;
          }
          .page.design-minimal-edge .meta {
            padding-left: 18px;
            border-left: 1px solid rgba(113, 113, 122, 0.22);
          }
          .page.design-minimal-edge .website-row .meta-value {
            color: #0f172a;
          }
          .page.design-meridian-slate .hero {
            grid-template-columns: minmax(0, 1fr) 300px;
            padding: 18px 20px;
            border-radius: 24px;
            background: linear-gradient(135deg, rgba(15, 23, 42, 0.05), rgba(71, 85, 105, 0.02));
          }
          .page.design-meridian-slate .brand-wordmark {
            background: linear-gradient(135deg, #111827, #334155);
          }
          .page.design-meridian-slate .meta {
            padding: 18px 20px;
            border-radius: 22px;
            background: #0f172a;
          }
          .page.design-meridian-slate .meta-label,
          .page.design-meridian-slate .meta-value,
          .page.design-meridian-slate .website-row .meta-value,
          .page.design-meridian-slate .meta-page-chip {
            color: #f8fafc;
          }
          .page.design-meridian-slate .meta-page-chip {
            background: rgba(255,255,255,0.08);
            border-color: rgba(255,255,255,0.12);
          }
          .page.design-studio-band .hero {
            grid-template-columns: 1fr;
            gap: 18px;
            padding-top: 18px;
            border-top: 10px solid #0f172a;
          }
          .page.design-studio-band .brand {
            padding: 0 18px 16px;
            border-radius: 24px;
            background: linear-gradient(135deg, rgba(255, 90, 20, 0.08), rgba(255,255,255,0.98));
          }
          .page.design-studio-band .meta {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px 16px;
            padding: 0 18px;
          }
          .page.design-studio-band .meta-row {
            text-align: left;
          }
          .page.design-luxe-serif {
            box-shadow: 0 20px 50px rgba(28, 25, 23, 0.12);
            border: 1px solid rgba(120, 113, 108, 0.28);
          }
          .page.design-luxe-serif .hero {
            grid-template-columns: minmax(0, 1fr) 260px;
            border-top: 1px solid rgba(120, 113, 108, 0.34);
            border-bottom: 1px solid rgba(120, 113, 108, 0.34);
          }
          .page.design-luxe-serif .brand-wordmark {
            background: linear-gradient(135deg, #292524, #78716c);
            font-family: Georgia, "Times New Roman", serif;
            letter-spacing: 0.12em;
          }
          .page.design-luxe-serif .brand-company,
          .page.design-luxe-serif .document-title {
            font-family: Georgia, "Times New Roman", serif;
          }
          .page.design-luxe-serif .brand-company {
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }
          .document-title {
            margin: 8px 0 12px;
            text-align: center;
            font-size: 18px;
            font-weight: 800;
            text-transform: uppercase;
            text-decoration: underline;
            letter-spacing: 0.02em;
          }
          .document-body {
            padding-top: 4px;
            line-height: 1.45;
            color: #343434;
            font-size: 13px;
          }
          .document-body p { margin: 0 0 8px; }
          .document-body h2,
          .document-body h3 {
            margin: 14px 0 8px;
            font-size: 14px;
            font-weight: 800;
            text-align: center;
          }
          .document-body h3 { text-align: left; }
          .document-body ul,
          .document-body ol {
            margin: 4px 0 10px 20px;
            padding: 0;
          }
          .document-body li { margin-bottom: 3px; }
          .lead {
            font-size: 13px;
            margin: 0 0 24px;
          }
          .summary-block, .details-block, .footer-note {
            margin-bottom: 24px;
          }
          .details-table {
            width: 100%;
            border-collapse: collapse;
            overflow: hidden;
            border-radius: 16px;
            border: 1px solid rgba(251, 146, 60, 0.18);
          }
          .details-table tr:nth-child(odd) {
            background: rgba(255, 247, 237, 0.84);
          }
          .details-table td {
            padding: 14px 16px;
            border-bottom: 1px solid rgba(251, 146, 60, 0.12);
            vertical-align: top;
          }
          .details-table tr:last-child td {
            border-bottom: 0;
          }
          .field-label {
            width: 32%;
            color: #292524;
            font-weight: 700;
          }
          .field-value {
            color: #1c1917;
          }
          .footer-note {
            padding-top: 16px;
            border-top: 1px dashed rgba(251, 146, 60, 0.34);
            font-size: 13px;
            color: #78716c;
          }
          .signature-block {
            margin-top: 36px;
            padding-top: 20px;
            border-top: 1px solid rgba(0, 0, 0, 0.10);
          }
          .recipient-signature {
            margin-top: 24px;
          }
          .signature-grid {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 24px;
            flex-wrap: wrap;
          }
          .signature-label {
            text-transform: uppercase;
            letter-spacing: 0.14em;
            font-size: 11px;
            color: #78716c;
            margin-bottom: 8px;
          }
          .signature-image {
            display: block;
            max-width: 240px;
            max-height: 96px;
            object-fit: contain;
            margin-bottom: 10px;
          }
          .signature-proof-card {
            min-width: 200px;
            max-width: 240px;
            border: 1px solid rgba(15, 23, 42, 0.08);
            background: rgba(248, 250, 252, 0.95);
            border-radius: 18px;
            padding: 14px;
          }
          .signature-proof-image {
            display: block;
            width: 100%;
            aspect-ratio: 1;
            object-fit: cover;
            border-radius: 14px;
            margin-bottom: 10px;
            background: #e2e8f0;
          }
          .signature-name {
            font-weight: 700;
            margin: 0;
            color: #1c1917;
          }
          .signature-role,
          .signature-meta {
            margin: 2px 0 0;
            font-size: 12px;
            color: #78716c;
          }
          .powered-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 20px;
            margin-top: 28px;
            padding-top: 18px;
            border-top: 1px solid rgba(0, 0, 0, 0.10);
            font-size: 12px;
            color: #57534e;
          }
          .powered-footer-copy {
            display: flex;
            flex-direction: column;
            gap: 6px;
            min-width: 0;
          }
          .powered-footer-strong {
            font-weight: 800;
            color: #292524;
          }
          .powered-footer-line {
            line-height: 1.55;
          }
          .powered-footer-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 148px;
            padding: 10px 18px;
            border-radius: 999px;
            background: #111111;
            color: #ffffff;
            text-decoration: none;
            font-weight: 700;
            white-space: nowrap;
          }
          @media (max-width: 768px) {
            .page {
              width: 100%;
              margin: 0;
            }
            .content {
              padding: 24px 18px 30px;
            }
            .hero {
              grid-template-columns: 1fr;
              gap: 16px;
            }
            .brand {
              min-height: 0;
              padding: 0;
              gap: 14px;
            }
            .brand-mark {
              min-width: 0;
            }
            .page.design-executive-frame .hero,
            .page.design-modern-panel .hero,
            .page.design-meridian-slate .hero {
              padding: 16px;
            }
            .meta {
              width: 100%;
            }
            .meta-row {
              text-align: left;
            }
            .page.design-studio-band .meta {
              grid-template-columns: 1fr;
              padding: 0;
            }
            .page.design-minimal-edge .meta {
              padding-left: 0;
              border-left: 0;
            }
            .watermark-text {
              font-size: 32px;
            }
            .powered-footer {
              flex-direction: column;
              align-items: flex-start;
            }
            .powered-footer-button {
              width: 100%;
            }
          }
        </style>
      </head>
      <body>
        <div class="page design-${designPreset}">
          <div class="letterhead-top"><div class="letterhead-top-accent"></div></div>
          <div class="watermark">
            <div class="watermark-logo">docrud</div>
            ${options?.watermarkLabel ? `<div class="watermark-text">${escapeHtml(options.watermarkLabel)}</div>` : ''}
          </div>
          <div class="letterhead-bottom"><div class="letterhead-bottom-accent"></div></div>
          <div class="content">
            ${options?.letterheadMode === 'html' && options.letterheadHtml ? `<section class="custom-letterhead">${sanitizeRichText(options.letterheadHtml)}</section>` : ''}
            ${options?.letterheadMode === 'image' && options.letterheadImageDataUrl ? `<section class="custom-letterhead"><img src="${options.letterheadImageDataUrl}" alt="Business letterhead" /></section>` : ''}
            ${headerMarkup}
            <div class="document-title">${escapeHtml(template.name)}</div>
            <section class="document-body">${rawBody}${signatureMarkup}${recipientSignatureMarkup}${poweredFooter}</section>
          </div>
        </div>
      </body>
    </html>
  `;
}
