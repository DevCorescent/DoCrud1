'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowLeft, ArrowRight, Bot, CheckCircle2, PenSquare, Sparkles, Trash2 } from 'lucide-react';
import type { BlogPost, LandingSettings } from '@/types/document';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PublicSiteChrome from '@/components/PublicSiteChrome';

interface BlogEditorPageProps {
  settings: LandingSettings;
  softwareName: string;
  accentLabel: string;
}

type BlogEditorState = {
  id?: string;
  title: string;
  excerpt: string;
  category: string;
  tags: string;
  coverImageUrl: string;
  seoTitle: string;
  seoDescription: string;
  content: string;
  status: 'draft' | 'published';
  featured: boolean;
};

type DocaiAction = 'ideas' | 'outline' | 'intro' | 'improve' | 'seo';

const emptyEditorState: BlogEditorState = {
  title: '',
  excerpt: '',
  category: 'General',
  tags: '',
  coverImageUrl: '',
  seoTitle: '',
  seoDescription: '',
  content: '',
  status: 'draft',
  featured: false,
};

function formatBlogDate(value?: string) {
  if (!value) return 'Today';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function toEditorState(post?: BlogPost | null): BlogEditorState {
  if (!post) return emptyEditorState;
  return {
    id: post.id,
    title: post.title,
    excerpt: post.excerpt,
    category: post.category,
    tags: (post.tags || []).join(', '),
    coverImageUrl: post.coverImageUrl || '',
    seoTitle: post.seoTitle || '',
    seoDescription: post.seoDescription || '',
    content: post.content,
    status: post.status,
    featured: Boolean(post.featured),
  };
}

function buildDocaiPrompt(action: DocaiAction, editor: BlogEditorState) {
  const baseTopic = editor.title.trim() || editor.category.trim() || 'a useful docrud blog topic';
  const currentContext = editor.content.trim() || editor.excerpt.trim() || editor.seoDescription.trim();

  switch (action) {
    case 'ideas':
      return `Give 5 sharp blog topic ideas for docrud around ${baseTopic}. Keep them specific and headline-ready.`;
    case 'outline':
      return `Create a clean blog outline for this topic: ${baseTopic}. Keep it readable, practical, and modern. ${currentContext ? `Context: ${currentContext}` : ''}`;
    case 'intro':
      return `Write a strong opening intro for a blog post titled "${baseTopic}". ${currentContext ? `Use this context: ${currentContext}` : ''}`;
    case 'seo':
      return `Write a clean SEO title and a meta description for a blog post about "${baseTopic}". ${currentContext ? `Context: ${currentContext}` : ''}`;
    default:
      return `Improve this blog draft to sound clearer, sharper, and more professional while staying human:\n\n${currentContext || baseTopic}`;
  }
}

export default function BlogEditorPage({
  settings,
  softwareName,
  accentLabel,
}: BlogEditorPageProps) {
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated' && Boolean(session?.user);
  const [authorPosts, setAuthorPosts] = useState<BlogPost[]>([]);
  const [editorState, setEditorState] = useState<BlogEditorState>(emptyEditorState);
  const [blogFeedback, setBlogFeedback] = useState('');
  const [blogLoading, setBlogLoading] = useState(false);
  const [authorLoading, setAuthorLoading] = useState(false);
  const [docaiLoading, setDocaiLoading] = useState(false);
  const [docaiOutput, setDocaiOutput] = useState('');

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    const loadAuthorPosts = async () => {
      try {
        setAuthorLoading(true);
        const response = await fetch('/api/blog/posts?scope=author', { cache: 'no-store' });
        const payload = response.ok ? await response.json() : null;
        if (!active || !payload) return;
        const nextPosts = Array.isArray(payload.posts) ? payload.posts : [];
        setAuthorPosts(nextPosts);
      } finally {
        if (active) {
          setAuthorLoading(false);
        }
      }
    };

    void loadAuthorPosts();
    return () => {
      active = false;
    };
  }, [isAuthenticated]);

  const savePost = async () => {
    if (!editorState.title.trim() || !editorState.content.trim()) {
      setBlogFeedback('Title and content are required.');
      return;
    }

    try {
      setBlogLoading(true);
      setBlogFeedback('');
      const payload = {
        id: editorState.id,
        title: editorState.title.trim(),
        excerpt: editorState.excerpt.trim(),
        category: editorState.category.trim() || 'General',
        tags: editorState.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        coverImageUrl: editorState.coverImageUrl.trim(),
        seoTitle: editorState.seoTitle.trim(),
        seoDescription: editorState.seoDescription.trim(),
        content: editorState.content.trim(),
        status: editorState.status,
        featured: editorState.featured,
      };

      const response = await fetch('/api/blog/posts', {
        method: editorState.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || 'Unable to save post.');
      }

      setEditorState(toEditorState(result));
      setBlogFeedback(editorState.status === 'published' ? 'Post published.' : 'Draft saved.');

      const authorResponse = await fetch('/api/blog/posts?scope=author', { cache: 'no-store' });
      const authorPayload = await authorResponse.json().catch(() => null);
      setAuthorPosts(Array.isArray(authorPayload?.posts) ? authorPayload.posts : []);
    } catch (error) {
      setBlogFeedback((error as Error).message || 'Unable to save post.');
    } finally {
      setBlogLoading(false);
    }
  };

  const deletePost = async () => {
    if (!editorState.id) return;
    try {
      setBlogLoading(true);
      const response = await fetch(`/api/blog/posts?id=${encodeURIComponent(editorState.id)}`, { method: 'DELETE' });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || 'Unable to delete post.');
      }
      const deletedId = editorState.id;
      setEditorState(emptyEditorState);
      setBlogFeedback('Post deleted.');
      setAuthorPosts((current) => current.filter((post) => post.id !== deletedId));
      setDocaiOutput('');
    } catch (error) {
      setBlogFeedback((error as Error).message || 'Unable to delete post.');
    } finally {
      setBlogLoading(false);
    }
  };

  const runDocai = async (action: DocaiAction) => {
    try {
      setDocaiLoading(true);
      setDocaiOutput('');
      const response = await fetch('/api/docword/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: action === 'improve' ? 'rewrite_concise' : 'generate',
          documentTitle: editorState.title || 'Docrud blog draft',
          prompt: buildDocaiPrompt(action, editorState),
          text: action === 'improve' ? editorState.content || editorState.excerpt || editorState.title : '',
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Docai could not help right now.');
      }
      setDocaiOutput(String(payload?.result || '').trim());
    } catch (error) {
      setDocaiOutput((error as Error).message || 'Docai could not help right now.');
    } finally {
      setDocaiLoading(false);
    }
  };

  const applyDocaiOutput = () => {
    if (!docaiOutput.trim()) return;

    const normalized = docaiOutput.trim();
    if (/^seo title/i.test(normalized) || /^meta description/i.test(normalized)) {
      const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
      const seoTitle = lines.find((line) => /seo title/i.test(line))?.replace(/^seo title[:\-\s]*/i, '') || '';
      const seoDescription = lines.find((line) => /meta description/i.test(line))?.replace(/^meta description[:\-\s]*/i, '') || '';
      setEditorState((current) => ({
        ...current,
        seoTitle: seoTitle || current.seoTitle,
        seoDescription: seoDescription || current.seoDescription,
      }));
      return;
    }

    if (!editorState.title.trim()) {
      setEditorState((current) => ({ ...current, content: normalized }));
      return;
    }

    setEditorState((current) => ({
      ...current,
      content: current.content.trim() ? `${current.content.trim()}\n\n${normalized}` : normalized,
    }));
  };

  return (
    <PublicSiteChrome softwareName={softwareName} accentLabel={accentLabel} settings={settings}>
      <section className="cloud-panel relative overflow-hidden rounded-[2rem] p-5 sm:p-6 lg:p-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_16%,rgba(56,189,248,0.14),transparent_22%),radial-gradient(circle_at_84%_18%,rgba(139,92,246,0.16),transparent_18%),radial-gradient(circle_at_62%_80%,rgba(16,185,129,0.1),transparent_24%)]" />
        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <Link href="/blog" className="inline-flex items-center rounded-full bg-white/70 px-4 py-2 text-sm font-medium text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] backdrop-blur-xl hover:bg-white/88">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to blog
            </Link>
            <h1 className="mt-4 text-[1.7rem] font-semibold tracking-[-0.06em] text-slate-950 sm:text-[2.2rem] lg:text-[2.6rem]">
              Blog editor for drafting, refining, and publishing without leaving docrud.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-[15px]">
              Keep your drafts, polish SEO details, and use Docai for faster ideas, outlines, intros, and cleaner rewrites.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-700">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Writing included with login
            </span>
          </div>
        </div>
      </section>

      {!isAuthenticated ? (
        <section className="cloud-panel rounded-[2rem] p-6 text-center">
          <p className="text-[1.1rem] font-semibold tracking-[-0.03em] text-slate-950">Login to open your blog studio.</p>
          <p className="mt-3 text-sm leading-6 text-slate-600">Any signed-in user can write here. No plan upgrade is required.</p>
          <Button asChild className="mt-5 rounded-full bg-slate-950 px-5 text-white hover:bg-slate-800">
            <Link href="/login">
              Login to write
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </section>
      ) : (
        <section className="grid gap-5 lg:grid-cols-[0.72fr_1.28fr]">
          <div className="space-y-5">
            <div className="cloud-panel rounded-[1.8rem] p-5">
              <div className="flex items-center gap-2">
                <PenSquare className="h-5 w-5 text-slate-900" />
                <h2 className="text-[1.02rem] font-semibold tracking-[-0.03em] text-slate-950">Your drafts and posts</h2>
              </div>
              <div className="mt-4 flex gap-2">
                <Button type="button" onClick={() => { setEditorState(emptyEditorState); setDocaiOutput(''); }} className="rounded-full bg-slate-950 px-4 text-white hover:bg-slate-800">
                  New post
                </Button>
                <Button asChild variant="outline" className="rounded-full border-0 bg-white/70 px-4 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] hover:bg-white">
                  <Link href="/blog">View blog</Link>
                </Button>
              </div>
              <div className="mt-5 space-y-3">
                {authorLoading ? (
                  <p className="text-sm text-slate-500">Loading your posts...</p>
                ) : authorPosts.length ? (
                  authorPosts.map((post) => (
                    <button
                      key={post.id}
                      type="button"
                      onClick={() => { setEditorState(toEditorState(post)); setDocaiOutput(''); }}
                      className={`w-full rounded-[1.2rem] px-4 py-3 text-left transition ${
                        editorState.id === post.id
                          ? 'bg-slate-950 text-white shadow-[0_14px_30px_rgba(15,23,42,0.18)]'
                          : 'bg-white/74 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] hover:bg-white'
                      }`}
                    >
                      <p className="truncate text-sm font-semibold">{post.title}</p>
                      <p className={`mt-1 text-[12px] ${editorState.id === post.id ? 'text-white/70' : 'text-slate-500'}`}>
                        {post.status === 'published' ? 'Published' : 'Draft'} · {formatBlogDate(post.updatedAt)}
                      </p>
                    </button>
                  ))
                ) : (
                  <div className="rounded-[1.25rem] bg-white/70 px-4 py-4 text-sm text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                    No posts yet. Start with a headline and let Docai help shape the rest.
                  </div>
                )}
              </div>
            </div>

            <div className="cloud-panel rounded-[1.8rem] p-5">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-slate-900" />
                <h2 className="text-[1.02rem] font-semibold tracking-[-0.03em] text-slate-950">Docai for blogs</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Use Docai to break blank-page pressure, improve weak drafts, and generate SEO-ready support faster.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => void runDocai('ideas')} className="rounded-full bg-white/72 px-3 py-2 text-[11px] font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] hover:bg-white">Topic ideas</button>
                <button type="button" onClick={() => void runDocai('outline')} className="rounded-full bg-white/72 px-3 py-2 text-[11px] font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] hover:bg-white">Outline</button>
                <button type="button" onClick={() => void runDocai('intro')} className="rounded-full bg-white/72 px-3 py-2 text-[11px] font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] hover:bg-white">Intro</button>
                <button type="button" onClick={() => void runDocai('improve')} className="rounded-full bg-white/72 px-3 py-2 text-[11px] font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] hover:bg-white">Improve draft</button>
                <button type="button" onClick={() => void runDocai('seo')} className="rounded-full bg-white/72 px-3 py-2 text-[11px] font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] hover:bg-white">SEO helper</button>
              </div>

              <div className="mt-4 rounded-[1.3rem] bg-white/74 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.74)]">
                {docaiLoading ? (
                  <p className="text-sm text-slate-500">Docai is writing...</p>
                ) : docaiOutput ? (
                  <>
                    <pre className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{docaiOutput}</pre>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button type="button" onClick={applyDocaiOutput} className="rounded-full bg-slate-950 px-4 text-white hover:bg-slate-800">
                        Apply to editor
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setDocaiOutput('')} className="rounded-full border-0 bg-white px-4 text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] hover:bg-white/90">
                        Clear
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm leading-6 text-slate-500">Pick an action above and Docai will generate something useful for the current blog draft.</p>
                )}
              </div>
            </div>
          </div>

          <div className="cloud-panel rounded-[1.8rem] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[1.08rem] font-semibold tracking-[-0.03em] text-slate-950">Blog editor</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">Keep the writing flow simple: headline, excerpt, category, SEO, content, publish.</p>
              </div>
              {blogFeedback ? <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold text-slate-700">{blogFeedback}</span> : null}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Input value={editorState.title} onChange={(event) => setEditorState((current) => ({ ...current, title: event.target.value }))} placeholder="Post title" />
              <Input value={editorState.category} onChange={(event) => setEditorState((current) => ({ ...current, category: event.target.value }))} placeholder="Category" />
              <Input value={editorState.tags} onChange={(event) => setEditorState((current) => ({ ...current, tags: event.target.value }))} placeholder="Tags, comma separated" />
              <Input value={editorState.coverImageUrl} onChange={(event) => setEditorState((current) => ({ ...current, coverImageUrl: event.target.value }))} placeholder="Cover image URL" />
              <Input value={editorState.seoTitle} onChange={(event) => setEditorState((current) => ({ ...current, seoTitle: event.target.value }))} placeholder="SEO title" />
              <Input value={editorState.seoDescription} onChange={(event) => setEditorState((current) => ({ ...current, seoDescription: event.target.value }))} placeholder="SEO description" />
            </div>

            <textarea
              value={editorState.excerpt}
              onChange={(event) => setEditorState((current) => ({ ...current, excerpt: event.target.value }))}
              placeholder="Short excerpt"
              className="mt-3 min-h-[88px] w-full rounded-[1.1rem] border-0 bg-white/72 px-4 py-3 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] outline-none backdrop-blur-xl placeholder:text-slate-400"
            />
            <textarea
              value={editorState.content}
              onChange={(event) => setEditorState((current) => ({ ...current, content: event.target.value }))}
              placeholder="Write the article here. Keep it clear, useful, and easy to read."
              className="mt-3 min-h-[360px] w-full rounded-[1.25rem] border-0 bg-white/72 px-4 py-4 text-sm leading-7 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] outline-none backdrop-blur-xl placeholder:text-slate-400"
            />

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 rounded-full bg-white/72 px-3 py-2 text-sm text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]">
                <input type="checkbox" checked={editorState.featured} onChange={(event) => setEditorState((current) => ({ ...current, featured: event.target.checked }))} />
                Featured post
              </label>
              <select
                value={editorState.status}
                onChange={(event) => setEditorState((current) => ({ ...current, status: event.target.value as 'draft' | 'published' }))}
                className="h-11 rounded-full border-0 bg-white/72 px-4 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] outline-none backdrop-blur-xl"
              >
                <option value="draft">Draft</option>
                <option value="published">Publish now</option>
              </select>
              <div className="ml-auto flex flex-wrap gap-2">
                {editorState.id ? (
                  <Button type="button" variant="outline" disabled={blogLoading} onClick={() => void deletePost()} className="rounded-full border-0 bg-rose-100 px-4 text-rose-700 hover:bg-rose-200">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                ) : null}
                <Button type="button" disabled={blogLoading} onClick={() => void savePost()} className="rounded-full bg-slate-950 px-5 text-white hover:bg-slate-800">
                  {blogLoading ? 'Saving...' : editorState.status === 'published' ? 'Publish post' : 'Save draft'}
                  <Sparkles className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}
    </PublicSiteChrome>
  );
}
