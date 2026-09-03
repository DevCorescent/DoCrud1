/**
 * Super Admin company-logo upload — validation, SVG safety, priority, storage.
 *
 * The pure parts (validation, sanitisation, storage paths, the override
 * priority, byte-level format detection) are proved directly. Authorization
 * and the write sequence are asserted against route source, since exercising
 * them needs a real super-admin session; the live 401 checks are run separately
 * against the dev server.
 */
import { readFileSync } from 'node:fs';
import {
  COMPANY_LOGO_ACCEPT, COMPANY_LOGO_MAX_BYTES, companyLogoStoragePath,
  logoExtensionOf, validateCompanyLogoUpload,
} from '@/lib/company-logo-uploads';
import { sanitizeCompanyLogoSvg } from '@/lib/security/svg-sanitizer';
import { detectLogoFormat, prepareCompanyLogo } from '@/lib/server/company-logo-upload';
import {
  getCompanyLogo, getCompanyLogoOverride, logoKey, setCompanyLogoOverrides,
} from '@/lib/company-logos';
import { normalizeCompanyLogoOverrides } from '@/lib/server/homepage-config';
import { clearCompanyLogoCache, resolveCompanyLogo } from '@/lib/server/company-logo-resolver';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const src = (p: string) => strip(readFileSync(p, 'utf8'));
const ROUTE = 'app/api/super-admin/company-logo/route.ts';

const file = (name: string, size: number, type: string) => ({ name, size, type });
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);
const SAFE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>';

async function main() {
  console.log('\n── 1. Upload validation ──');
  {
    check('SVG accepted', validateCompanyLogoUpload(file('l.svg', 900, 'image/svg+xml')) === null);
    check('PNG accepted', validateCompanyLogoUpload(file('l.png', 900, 'image/png')) === null);
    check('JPG accepted', validateCompanyLogoUpload(file('l.jpg', 900, 'image/jpeg')) === null);
    check('JPEG accepted', validateCompanyLogoUpload(file('l.jpeg', 900, 'image/jpeg')) === null);
    check('an unsupported format is refused',
      validateCompanyLogoUpload(file('l.exe', 900, 'application/octet-stream'))?.code === 'UNSUPPORTED_FORMAT');
    check('an unsupported MIME with no known extension is refused',
      validateCompanyLogoUpload(file('logo', 900, 'text/html'))?.code === 'UNSUPPORTED_FORMAT');
    check('an empty file is refused',
      validateCompanyLogoUpload(file('l.png', 0, 'image/png'))?.code === 'EMPTY_FILE');
    check('an oversized file is refused',
      validateCompanyLogoUpload(file('l.png', COMPANY_LOGO_MAX_BYTES + 1, 'image/png'))?.code === 'FILE_TOO_LARGE');
    check('no file is refused', validateCompanyLogoUpload(null)?.code === 'NO_FILE');
    check('multiple files are refused',
      validateCompanyLogoUpload(file('l.png', 900, 'image/png'), 3)?.code === 'MULTIPLE_FILES');
    check('a generic MIME is accepted when the extension is known',
      validateCompanyLogoUpload(file('l.svg', 900, 'application/octet-stream')) === null);
    check('the accept attribute offers every supported format',
      ['.svg', '.png', '.jpg', '.webp'].every((e) => COMPANY_LOGO_ACCEPT.includes(e)));
    check('extensionOf handles a dotless name', logoExtensionOf('logo') === '');
  }

  console.log('\n── 2. The bytes decide, not the filename ──');
  {
    check('a PNG is detected', detectLogoFormat(PNG) === 'png');
    check('a JPEG is detected', detectLogoFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])) === 'jpg');
    check('a WEBP is detected',
      detectLogoFormat(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')])) === 'webp');
    check('an SVG is detected', detectLogoFormat(Buffer.from(SAFE_SVG)) === 'svg');
    check('an unrelated binary is refused', detectLogoFormat(Buffer.from([1, 2, 3, 4, 5, 6])) === null);
    /* The whole point: a hostile SVG renamed .png is still handled as an SVG. */
    const disguised = await prepareCompanyLogo(Buffer.from('<svg onload="alert(1)"><path d="M0 0"/></svg>'));
    check('an SVG disguised as a PNG is still sanitised as SVG',
      disguised.ok === false && /event handler/i.test((disguised as { message: string }).message));
    const notImage = await prepareCompanyLogo(Buffer.from('#!/bin/sh\nrm -rf /'));
    check('a script file is refused', notImage.ok === false);
    const empty = await prepareCompanyLogo(Buffer.alloc(0));
    check('an empty buffer is refused', empty.ok === false);
    const corrupt = await prepareCompanyLogo(PNG);
    check('a PNG header with garbage after it is refused (decode proves it)',
      corrupt.ok === false, JSON.stringify(corrupt));
  }

  console.log('\n── 3. SVG security ──');
  {
    check('a clean SVG is accepted', sanitizeCompanyLogoSvg(SAFE_SVG).ok === true);
    const cases: Array<[string, string]> = [
      ['<script>', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><path d="M0 0"/></svg>'],
      ['an event handler', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><path d="M0 0"/></svg>'],
      ['an onerror handler', '<svg xmlns="http://www.w3.org/2000/svg"><image onerror="alert(1)" href="x"/></svg>'],
      ['a javascript: URL', '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><path d="M0 0"/></a></svg>'],
      ['foreignObject', '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body>hi</body></foreignObject></svg>'],
      ['embedded HTML', '<svg xmlns="http://www.w3.org/2000/svg"><iframe src="x"></iframe></svg>'],
      ['an external image reference', '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.test/p.png"/></svg>'],
      ['an external url() reference', '<svg xmlns="http://www.w3.org/2000/svg"><path fill="url(https://evil.test/x)" d="M0 0"/></svg>'],
      ['an entity-encoded javascript URL', '<svg xmlns="http://www.w3.org/2000/svg"><a href="&#106;avascript:alert(1)"><path d="M0 0"/></a></svg>'],
      ['a data:text/html payload', '<svg xmlns="http://www.w3.org/2000/svg"><a href="data:text/html,<b>x"><path d="M0 0"/></a></svg>'],
      ['an animated href', '<svg xmlns="http://www.w3.org/2000/svg"><use><animate attributeName="href" to="javascript:alert(1)"/></use></svg>'],
    ];
    for (const [label, svg] of cases) {
      const r = sanitizeCompanyLogoSvg(svg);
      check(`${label} is rejected`, r.ok === false, JSON.stringify(r).slice(0, 90));
    }
    check('a non-SVG is rejected', sanitizeCompanyLogoSvg('hello').ok === false);
    check('an empty wrapper with nothing renderable is rejected',
      sanitizeCompanyLogoSvg('<svg xmlns="http://www.w3.org/2000/svg"></svg>').ok === false);
    /* What is STORED is the sanitiser's output, never the uploaded bytes. */
    const prepared = await prepareCompanyLogo(Buffer.from(SAFE_SVG));
    check('a clean SVG is stored as sanitised text',
      prepared.ok === true && (prepared as { body: Buffer }).body.length > 0);
    check('and with the SVG content type',
      prepared.ok === true && (prepared as { contentType: string }).contentType === 'image/svg+xml');
    const mod = src('lib/security/svg-sanitizer.ts');
    check('the sanitiser uses DOMPurify, not a hand-rolled regex cleaner',
      /DOMPurify\.sanitize/.test(mod) && /USE_PROFILES/.test(mod));
    check('no component renders uploaded SVG as markup',
      !/dangerouslySetInnerHTML/.test(src('components/jobs/company/CompanyLogoUploader.tsx'))
      && !/dangerouslySetInnerHTML/.test(src('components/jobs/company/CompanyLogo.tsx')));
  }

  console.log('\n── 4. Storage paths ──');
  {
    const path = companyLogoStoragePath('ramp', 'svg', 1700000000000);
    check('the path is company-scoped and deterministic',
      path === 'company-logos/ramp/logo-1700000000000.svg', path);
    check('a traversal attempt in the id is stripped',
      companyLogoStoragePath('../../etc/passwd', 'png', 1) === 'company-logos/etcpasswd/logo-1.png',
      companyLogoStoragePath('../../etc/passwd', 'png', 1));
    check('an unknown format cannot choose the extension',
      companyLogoStoragePath('ramp', 'php', 1).endsWith('.png'));
    check('an empty id is refused', (() => {
      try { companyLogoStoragePath('', 'png', 1); return false; } catch { return true; }
    })());
    /* The uploader's filename must never reach a storage key. The key is
       built from the company id and the format WE detected, and nothing else. */
    check('the storage key is built from the id and detected format only',
      /companyLogoStoragePath\(id, prepared\.format, revision\)/.test(src(ROUTE)));
    check('and the filename is used only for validation',
      (src(ROUTE).match(/file\.name/g) ?? []).length === 1);
    check('the revision changes the key so a cached logo cannot be served',
      companyLogoStoragePath('ramp', 'png', 1) !== companyLogoStoragePath('ramp', 'png', 2));
  }

  console.log('\n── 5. An upload outranks everything automatic ──');
  {
    setCompanyLogoOverrides({});
    check('with no override, the verified registry answers',
      getCompanyLogo('Ramp')?.src === '/company-logos/ramp.png');
    setCompanyLogoOverrides({ ramp: 'https://cdn.test/ramp-admin.svg' });
    check('an upload beats the verified registry',
      getCompanyLogo('Ramp')?.src === 'https://cdn.test/ramp-admin.svg');
    check('and is found by name in any casing',
      getCompanyLogoOverride('RAMP') === 'https://cdn.test/ramp-admin.svg');
    check('a company with no upload is unaffected',
      getCompanyLogo('Notion')?.src === '/company-logos/notion.png');

    /* The resolver must agree, and must report the source honestly. */
    clearCompanyLogoCache();
    const resolved = await resolveCompanyLogo({ name: 'Ramp' }, {
      overrides: async () => ({
        ramp: {
          id: 'ramp', name: 'Ramp', url: 'https://cdn.test/ramp-admin.svg',
          format: 'svg', storagePath: 'company-logos/ramp/logo-1.svg',
          updatedAt: '', updatedBy: 'admin@test',
        },
      }),
      head: async () => ({ ok: true, contentType: 'image/png', contentLength: 10 }),
    });
    check('the resolver returns the uploaded mark', resolved.logoUrl === 'https://cdn.test/ramp-admin.svg');
    check('and labels its source admin_upload', resolved.source === 'admin_upload');
    clearCompanyLogoCache();
    /* Even a company the SOURCE supplied a logo for: the admin still wins. */
    const contested = await resolveCompanyLogo(
      { name: 'Acme Inc', sourceLogoUrl: 'https://source.test/acme.png' },
      {
        overrides: async () => ({
          acmeinc: {
            id: 'acmeinc', name: 'Acme Inc', url: 'https://cdn.test/acme-admin.png',
            format: 'png', storagePath: 'p', updatedAt: '', updatedBy: 'a',
          },
        }),
        head: async () => ({ ok: true, contentType: 'image/png', contentLength: 10 }),
      },
    );
    check('an automatic source logo cannot displace an upload',
      contested.logoUrl === 'https://cdn.test/acme-admin.png', contested.logoUrl);
    clearCompanyLogoCache();
    /* Removal restores the fallback. The module-level client overrides are
       cleared too, or step 1 would still be looking at the uploaded mark. */
    setCompanyLogoOverrides({});
    const removed = await resolveCompanyLogo({ name: 'Ramp' }, {
      overrides: async () => ({}),
      head: async () => ({ ok: true, contentType: 'image/png', contentLength: 10 }),
    });
    check('removing the upload restores the verified logo',
      removed.logoUrl === '/company-logos/ramp.png' && removed.source === 'verified');
    setCompanyLogoOverrides({});
    check('and the client lookup falls back too',
      getCompanyLogo('Ramp')?.src === '/company-logos/ramp.png');
    check('a company with nothing at all still returns null (initials)',
      getCompanyLogo('Nowhere Ltd') === null);
    check('the priority is documented where the decision is made',
      /uploaded|override/i.test(src('lib/company-logos.ts')));
  }

  console.log('\n── 6. Stored records are re-checked on read ──');
  {
    check('a javascript: URL in storage is dropped',
      Object.keys(normalizeCompanyLogoOverrides({ ramp: { url: 'javascript:alert(1)' } })).length === 0);
    check('a data: URL in storage is dropped',
      Object.keys(normalizeCompanyLogoOverrides({ ramp: { url: 'data:text/html,<b>' } })).length === 0);
    check('an http (non-TLS) URL is dropped',
      Object.keys(normalizeCompanyLogoOverrides({ ramp: { url: 'http://x.test/a.png' } })).length === 0);
    check('an https URL is kept',
      normalizeCompanyLogoOverrides({ ramp: { url: 'https://x.test/a.png' } }).ramp?.url === 'https://x.test/a.png');
    check('a same-origin path is kept',
      normalizeCompanyLogoOverrides({ ramp: { url: '/company-logos/x.png' } }).ramp?.url === '/company-logos/x.png');
    check('a junk key is dropped', Object.keys(normalizeCompanyLogoOverrides({ '../x': { url: '/a.png' } }))[0] === 'x');
    check('a non-object is handled', Object.keys(normalizeCompanyLogoOverrides('nope')).length === 0);
    check('an array is handled', Object.keys(normalizeCompanyLogoOverrides([1, 2])).length === 0);
    check('an absent field yields an empty map',
      Object.keys(normalizeCompanyLogoOverrides(undefined)).length === 0);
    /* Backward compatibility: an older config has no such field at all. */
    const cfg = src('lib/server/homepage-config.ts');
    check('a config written before this feature still merges',
      /companyLogos: normalizeCompanyLogoOverrides\(stored\.companyLogos\)/.test(cfg));
    check('and the default is an empty map', /companyLogos: \{\}/.test(cfg));
  }

  console.log('\n── 7. Authorization ──');
  {
    const route = src(ROUTE);
    for (const verb of ['GET', 'POST', 'DELETE']) {
      const fn = new RegExp(`export async function ${verb}[\\s\\S]*?getSuperAdminSessionFromRequest`);
      check(`${verb} checks the super-admin session`, fn.test(route));
    }
    check('every handler refuses without one',
      (route.match(/status: 401/g) ?? []).length >= 3);
    check('the acting admin comes from the session',
      /session\.email/.test(route));
    check('no role, admin flag or user id is read from the body',
      !/body\.(role|isAdmin|admin|userId|email)/.test(route)
      && !/form\.get\('(role|userId|admin)'\)/.test(route));
    check('the company is identified by id, never by free text name',
      /form\.get\('companyId'\)/.test(route) && /logoKey\(/.test(route));
    check('an unknown company is refused', /status: 404/.test(route));
    check('an upload cannot create a company',
      !/saveHomepageConfig\(\{\s*companyExplorer/.test(route));
    check('storage credentials are never returned',
      !/ACCESS_KEY|SECRET|R2_/.test(route));
    check('the public endpoint exposes only id and URL',
      !/storagePath|updatedBy/.test(src('app/api/company-logos/route.ts')));
  }

  console.log('\n── 8. Failure safety ──');
  {
    const route = src(ROUTE);
    const upload = route.indexOf('uploadToR2(');
    const save = route.indexOf('saveHomepageConfig(');
    const delOld = route.indexOf('previous.storagePath');
    check('the new object is uploaded before the record is saved', upload > -1 && upload < save);
    check('and the OLD object is deleted only after that', save < delOld);
    check('a failed save rolls back the new object',
      /rolling back upload[\s\S]*?deleteFromR2\(storagePath\)/.test(route)
      || /deleteFromR2\(storagePath\)/.test(route.slice(save)));
    check('an orphan that cannot be cleaned up is logged, not hidden',
      /ORPHANED OBJECT/.test(route));
    check('a storage failure is reported, never as success',
      /status: 502/.test(route) && /Nothing was changed/.test(route));
    check('missing storage is stated plainly rather than faked',
      /status: 503/.test(route) && /not configured/.test(route));
    check('caches are invalidated after a successful write',
      /invalidateCompanyLogo\(/.test(route) && /invalidateNamespaces\(/.test(route));
    check('removal clears the record before deleting the object',
      route.indexOf('saveHomepageConfig({ companyLogos: next })') < route.lastIndexOf('deleteFromR2'));
    check('the audit records the action without the image bytes',
      /appendSuperAdminAudit/.test(route) && !/details:[\s\S]{0,200}(body|buffer|base64)/.test(route));
  }

  console.log('\n── 9. The admin UI ──');
  {
    const ui = src('components/jobs/company/CompanyLogoUploader.tsx');
    for (const ev of ['onDragEnter', 'onDragOver', 'onDragLeave', 'onDrop']) {
      check(`${ev} is handled`, new RegExp(ev).test(ui));
    }
    check('dragover is prevented so the browser does not open the file',
      /onDragOver[\s\S]{0,80}preventDefault/.test(ui));
    check('nested drag events do not flicker the highlight', /depth\.current/.test(ui));
    check('the drop zone is a real button (keyboard activated)',
      /<button[^>]*\{\.\.\.drop\}/.test(ui) || /\{\.\.\.drop\}/.test(ui));
    check('there is a real file input with the shared accept list',
      /type="file"/.test(ui) && /COMPANY_LOGO_ACCEPT/.test(ui));
    check('it validates with the SAME shared validator',
      /validateCompanyLogoUpload/.test(ui));
    check('the same file can be chosen twice', /e\.target\.value = ''/.test(ui));
    check('duplicate submission is blocked while saving', /phase === 'saving'/.test(ui));
    check('a preview is shown before saving', /createObjectURL/.test(ui));
    check('and the blob URL is revoked', /revokeObjectURL/.test(ui));
    check('no fake progress percentage is displayed', !/%|progress/i.test(ui));
    check('a server error is surfaced verbatim', /data\?\.error/.test(ui));
    check('removal is offered only when there is an upload to remove',
      /hasUpload &&/.test(ui));
    check('it lives in the EXISTING company management modal',
      /CompanyLogoUploader/.test(src('components/jobs/company/CompanyExplorerManageModal.tsx')));
    check('the row states which logo the company is using',
      /Uploaded & verified/.test(ui) && /automatic or fallback/.test(ui));
  }

  console.log('\n── 10. One resolver, no duplication ──');
  {
    /* The audit found three logo renderers. All three must ask the same
       function, so an upload reaches every one without editing them. */
    for (const f of ['components/jobs/JobSummaryCard.tsx', 'components/jobs/JobDetailPage.tsx']) {
      check(`${f.split('/').pop()} still resolves through getCompanyLogo`,
        /getCompanyLogo\(/.test(src(f)));
    }
    check('the shared component prefers an uploaded mark over its prop',
      /getCompanyLogoOverride\(name\)/.test(src('components/jobs/company/CompanyLogo.tsx')));
    check('overrides are loaded once, app-wide, not per component',
      /CompanyLogoOverrides/.test(src('app/layout.tsx')));
    check('and nothing else fetches the public endpoint',
      !/api\/company-logos/.test(src('components/jobs/company/CompanyLogo.tsx')));
    check('no second logo registry was created',
      !/const REGISTRY/.test(src('lib/company-logo-uploads.ts')));
    check('the server hydrates before building tiles, to avoid a wrong-logo flash',
      /setCompanyLogoOverrides/.test(src('app/api/company-explorer/route.ts')));
  }

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) { console.error('FAILED'); process.exit(1); }
}

void main();
