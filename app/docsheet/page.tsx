import { Suspense } from 'react';
import { buildPageMetadata } from '@/lib/seo';
import DocSheetClient from './DocSheetClient';

export const metadata = buildPageMetadata({
  title: 'DocSheet | Governed Spreadsheet Workspace in docrud',
  description: 'Create, edit, share, and export governed spreadsheet workbooks inside docrud.',
  path: '/docsheet',
  keywords: ['spreadsheet', 'workbook', 'DocSheet', 'docrud sheet'],
});

export default function DocSheetPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-slate-500">Loading DocSheet Studio...</div>}>
      <DocSheetClient />
    </Suspense>
  );
}

