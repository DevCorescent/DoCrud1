import { Suspense } from 'react';
import DocWordWorkspace from '@/components/DocWordWorkspace';
import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'DocWord | AI Document Editor, Writing Assistant & Shareable Drafts in Docrud',
  description:
    'Write, edit, summarize, rewrite, autosave, share, and export documents in DocWord, the AI-first document editor inside Docrud.',
  path: '/docword',
  keywords: ['AI document editor', 'DocWord', 'document editor', 'write with AI', 'shareable documents', 'docrud docword'],
});

export default function DocWordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-slate-500">Loading DocWord...</div>}>
      <DocWordWorkspace />
    </Suspense>
  );
}
