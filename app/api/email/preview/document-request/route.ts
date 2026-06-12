import { NextRequest, NextResponse } from 'next/server';
import { buildEmailChrome } from '@/lib/server/email-chrome';
import { buildDocumentDeliveryEmail } from '@/lib/server/document-delivery-email';
import type { DocumentHistory } from '@/types/document';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toBool(value: string | null) {
  return value === '1' || value === 'true' || value === 'yes';
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const theme = String(url.searchParams.get('theme') || 'light');
  const signing = toBool(url.searchParams.get('signing'));

  const entry: DocumentHistory = {
    id: 'preview-1',
    shareId: 'share-preview',
    shareUrl: `${url.origin}/documents/share-preview`,
    shareAccessPolicy: 'standard',
    recipientAccess: 'view',
    recipientSignatureRequired: signing,
    sharePassword: 'LC3DG4',
    templateName: 'Company_Letterhead.pdf',
    documentSourceType: 'uploaded_pdf',
    uploadedPdfFileName: 'Company_Letterhead.pdf',
    generatedBy: 'admin@company.com',
    generatedAt: new Date().toISOString(),
  } as unknown as DocumentHistory;

  const payload = buildDocumentDeliveryEmail({
    origin: url.origin,
    entry,
    subject: signing ? 'Secure Document Request' : 'Document shared with you',
    senderEmail: 'admin@company.com',
    senderNote: 'testing mail',
  });

  const html = payload.chrome === 'none'
    ? payload.html.replace(/data-force-theme=\"light\"/g, `data-force-theme=\"${theme === 'dark' ? 'dark' : 'light'}\"`)
    : buildEmailChrome({ origin: url.origin, subject: 'Preview', preheader: payload.preheader, bodyHtml: payload.html });

  return new NextResponse(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

