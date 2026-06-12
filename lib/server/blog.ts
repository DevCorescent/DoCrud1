import { BlogPost } from '@/types/document';
import { blogPostsPath, readJsonFile, writeJsonFile } from '@/lib/server/storage';

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function estimateReadTimeMinutes(content: string) {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2, Math.ceil(words / 220));
}

function buildExcerpt(content: string, fallbackTitle: string) {
  const collapsed = content.replace(/\s+/g, ' ').trim();
  if (!collapsed) return `Read ${fallbackTitle} on docrud.`;
  return collapsed.length > 180 ? `${collapsed.slice(0, 177).trimEnd()}...` : collapsed;
}

const defaultBlogPosts: BlogPost[] = [
  {
    id: 'blog-launch-docword',
    authorUserId: '1',
    authorName: 'Docrud Team',
    authorEmail: 'admin@company.com',
    title: 'How teams can write faster with DocWord without losing polish',
    slug: 'how-teams-can-write-faster-with-docword-without-losing-polish',
    excerpt: 'A sharper writing workflow for teams that want documents to move quickly and still read like someone cared.',
    content: `# A better way to write business documents

Most teams do not have a writing problem. They have a momentum problem.

Drafts start in one tool, reviews happen somewhere else, and exports become the final cleanup task nobody enjoys.

## What DocWord changes

DocWord keeps drafting, rewriting, review, and export in one calmer surface.

That means the same workspace can help you shape the first version, tighten the language, and get the final output ready to send without jumping through extra steps.

## Why it matters

The quality of a document often depends on whether a team is still patient enough to improve it.

When the process feels lighter, the final result usually gets better too.`,
    category: 'DocWord',
    tags: ['docword', 'writing', 'workflow'],
    coverImageUrl: '/homepage/hero-docword-ai.png',
    status: 'published',
    featured: true,
    seoTitle: 'How teams can write faster with DocWord | Docrud Blog',
    seoDescription: 'See how DocWord helps teams draft, rewrite, review, and export documents faster without losing quality.',
    readTimeMinutes: 3,
    createdAt: '2026-04-15T09:00:00.000Z',
    updatedAt: '2026-04-15T09:00:00.000Z',
    publishedAt: '2026-04-15T09:00:00.000Z',
  },
  {
    id: 'blog-secure-sharing',
    authorUserId: '1',
    authorName: 'Docrud Team',
    authorEmail: 'admin@company.com',
    title: 'Secure sharing that still feels simple for clients and teams',
    slug: 'secure-sharing-that-still-feels-simple-for-clients-and-teams',
    excerpt: 'Security does not have to feel heavy. Here is how docrud keeps file delivery cleaner without adding friction everywhere else.',
    content: `# Secure sharing should not slow work down

Teams often add security after the workflow is already messy.

That usually means more passwords, more confusion, and more follow-up.

## The better approach

docrud treats secure delivery as part of the normal flow.

You can publish what should be public, protect what should stay private, and still keep the experience easy to open and understand.

## Where this helps most

Client document handoff.

Approvals.

Controlled file delivery.

Professional delivery surfaces that need to look trustworthy from the first click.`,
    category: 'Secure Sharing',
    tags: ['security', 'sharing', 'file-directory'],
    coverImageUrl: '/file-directory-home-banner.png',
    status: 'published',
    seoTitle: 'Secure sharing that still feels simple | Docrud Blog',
    seoDescription: 'Learn how docrud keeps secure file delivery professional, controlled, and easy for teams and clients.',
    readTimeMinutes: 3,
    createdAt: '2026-04-16T11:30:00.000Z',
    updatedAt: '2026-04-16T11:30:00.000Z',
    publishedAt: '2026-04-16T11:30:00.000Z',
  },
  {
    id: 'blog-ai-ops-prompts',
    authorUserId: '1',
    authorName: 'Docrud Team',
    authorEmail: 'admin@company.com',
    title: 'How AI prompts get better when your ops workflow gets cleaner first',
    slug: 'how-ai-prompts-get-better-when-your-ops-workflow-gets-cleaner-first',
    excerpt: 'Better AI output usually starts with better workflow design. Here is why teams get stronger results after cleaning inputs, review loops, and ownership.',
    content: `# Better AI usually starts before the prompt

Teams often ask for stronger prompts when the real issue sits somewhere else.

The draft brief is incomplete, ownership is fuzzy, or the team is feeding inconsistent source material into the system.

## What improves results fastest

Clear input structure.

One place for comments.

One place for approvals.

And a calmer handoff between the person writing and the person reviewing.

## Where this matters most

AI writing.

Summaries.

Meeting recaps.

Follow-up drafts.

When the workflow gets cleaner, the prompt does less rescue work and the output gets sharper.`,
    category: 'AI Writing',
    tags: ['ai prompts', 'workflow design', 'ai writing', 'operations'],
    coverImageUrl: '/homepage/hero-docword-ai.png',
    status: 'published',
    seoTitle: 'How AI prompts improve with cleaner ops workflows | Docrud Blog',
    seoDescription: 'Learn why better AI output depends on cleaner workflow design, clearer inputs, and stronger review flow before prompt tuning.',
    readTimeMinutes: 3,
    createdAt: '2026-04-17T13:10:00.000Z',
    updatedAt: '2026-04-17T13:10:00.000Z',
    publishedAt: '2026-04-17T13:10:00.000Z',
  },
  {
    id: 'blog-product-design-docs',
    authorUserId: '1',
    authorName: 'Docrud Team',
    authorEmail: 'admin@company.com',
    title: 'Why the best internal docs now feel more like product than paperwork',
    slug: 'why-the-best-internal-docs-now-feel-more-like-product-than-paperwork',
    excerpt: 'Internal documentation is no longer just storage. Teams now expect clarity, speed, navigation, and trust from every document surface they open.',
    content: `# Internal docs changed quietly

People no longer compare your internal documents with old office files.

They compare them with polished product surfaces.

That means your docs are now judged on speed, clarity, layout, and whether the next action feels obvious.

## What modern teams expect

Clear structure.

Readable hierarchy.

Fast editing.

Smooth export.

And confidence that what they send out will still look professional.

## The shift worth noticing

Documentation is becoming part of product design.

That changes how teams should write, review, and publish work.`,
    category: 'Product Design',
    tags: ['internal docs', 'product design', 'documentation', 'ux writing'],
    coverImageUrl: '/homepage/hero-workspace-meet.png',
    status: 'published',
    seoTitle: 'Why internal docs now feel like product design | Docrud Blog',
    seoDescription: 'See why modern teams expect internal documentation to feel faster, clearer, and more product-grade than traditional paperwork.',
    readTimeMinutes: 3,
    createdAt: '2026-04-18T07:20:00.000Z',
    updatedAt: '2026-04-18T07:20:00.000Z',
    publishedAt: '2026-04-18T07:20:00.000Z',
  },
  {
    id: 'blog-document-automation',
    authorUserId: '1',
    authorName: 'Docrud Team',
    authorEmail: 'admin@company.com',
    title: 'Document automation works best when approvals are designed into the flow',
    slug: 'document-automation-works-best-when-approvals-are-designed-into-the-flow',
    excerpt: 'Automation saves time only when teams know what needs review, what can move automatically, and where accountability stays visible.',
    content: `# Automation without approval design creates friction elsewhere

Many teams automate document creation and still feel slow.

The document appears faster, but the approval path stays unclear.

## What better automation looks like

Generated first drafts.

Visible review stages.

Permissions that make sense.

And clear ownership when something needs a human decision.

## Why this matters

The real value of automation is not speed alone.

It is confidence.

Teams move faster when they know what was automated, what was reviewed, and what still needs a person in the loop.`,
    category: 'Automation',
    tags: ['document automation', 'approvals', 'workflow automation', 'ops'],
    coverImageUrl: '/file-directory-home-banner.png',
    status: 'published',
    seoTitle: 'Document automation works best with strong approval flow | Docrud Blog',
    seoDescription: 'Discover why document automation becomes more valuable when approval stages, ownership, and accountability are built into the workflow.',
    readTimeMinutes: 3,
    createdAt: '2026-04-18T10:45:00.000Z',
    updatedAt: '2026-04-18T10:45:00.000Z',
    publishedAt: '2026-04-18T10:45:00.000Z',
  },
  {
    id: 'blog-security-trust',
    authorUserId: '1',
    authorName: 'Docrud Team',
    authorEmail: 'admin@company.com',
    title: 'Security UX matters more when clients are the ones opening the link',
    slug: 'security-ux-matters-more-when-clients-are-the-ones-opening-the-link',
    excerpt: 'The security layer is only strong if people can still understand it. Good delivery design makes secure workflows feel trustworthy instead of confusing.',
    content: `# Secure delivery has a user-experience problem

Teams focus on protection. Clients experience confusion.

That gap creates friction right where trust matters most.

## What stronger security UX includes

Readable access states.

Predictable share flows.

Clear permissions.

And a professional page that explains what the recipient is looking at.

## Why it is worth fixing

When secure sharing feels calm and obvious, people trust the workflow faster.

That matters for approvals, contracts, onboarding, and any client-facing document journey.`,
    category: 'Security UX',
    tags: ['security ux', 'client delivery', 'secure links', 'trust'],
    coverImageUrl: '/file-directory-home-banner.png',
    status: 'published',
    seoTitle: 'Why security UX matters for client-facing document links | Docrud Blog',
    seoDescription: 'Learn how better security UX helps client-facing document delivery feel more trustworthy, readable, and professional.',
    readTimeMinutes: 3,
    createdAt: '2026-04-18T16:25:00.000Z',
    updatedAt: '2026-04-18T16:25:00.000Z',
    publishedAt: '2026-04-18T16:25:00.000Z',
  },
  {
    id: 'blog-saas-ops-stack',
    authorUserId: '1',
    authorName: 'Docrud Team',
    authorEmail: 'admin@company.com',
    title: 'SaaS teams are quietly consolidating tools around calmer operational surfaces',
    slug: 'saas-teams-are-quietly-consolidating-tools-around-calmer-operational-surfaces',
    excerpt: 'The new win is not having more software. It is reducing the number of places where work gets fragmented, repeated, or lost in handoff.',
    content: `# More tools are not automatically more leverage

SaaS teams have spent years adding software to solve small problems.

Now many of them are trying to reduce the noise that came with that approach.

## What consolidation really means

Fewer fragmented handoffs.

Fewer duplicated approvals.

Fewer places to look for the latest version.

And fewer tools that exist only to bridge two other tools.

## What people actually want

A calmer operational surface that handles the common path well.

That is where modern workflow products have a chance to become much more valuable.`,
    category: 'SaaS Ops',
    tags: ['saas ops', 'tool consolidation', 'workflows', 'productivity'],
    coverImageUrl: '/homepage/hero-workspace-meet.png',
    status: 'published',
    seoTitle: 'Why SaaS teams are consolidating tools around calmer workflows | Docrud Blog',
    seoDescription: 'Explore why modern SaaS teams are reducing tool sprawl and choosing calmer operational surfaces for everyday work.',
    readTimeMinutes: 3,
    createdAt: '2026-04-19T06:55:00.000Z',
    updatedAt: '2026-04-19T06:55:00.000Z',
    publishedAt: '2026-04-19T06:55:00.000Z',
  },
  {
    id: 'blog-compliance-signing',
    authorUserId: '1',
    authorName: 'Docrud Team',
    authorEmail: 'admin@company.com',
    title: 'Digital signing becomes easier to trust when the evidence trail is visible',
    slug: 'digital-signing-becomes-easier-to-trust-when-the-evidence-trail-is-visible',
    excerpt: 'A signature workflow feels stronger when recipients and admins can see the context around who signed, when they signed, and what proof was captured.',
    content: `# Signatures are rarely judged in isolation

People trust a signing flow more when they can see the context that supports it.

That means timestamps, identity steps, access trails, and surrounding evidence all matter.

## What stronger digital signing looks like

Cleaner signer flow.

Clearer audit trail.

Visible status for admins.

And less ambiguity around what happened before submission.

## Why teams care

Because trust is not only legal.

It is operational too.

Teams need to believe the workflow before they can rely on it.`,
    category: 'Compliance',
    tags: ['esign', 'audit trail', 'compliance', 'identity verification'],
    coverImageUrl: '/homepage/hero-docword-ai.png',
    status: 'published',
    seoTitle: 'Why visible evidence trails improve digital signing trust | Docrud Blog',
    seoDescription: 'See how timestamps, verification steps, and visible audit trails make digital signing workflows more trustworthy and operationally useful.',
    readTimeMinutes: 3,
    createdAt: '2026-04-19T10:05:00.000Z',
    updatedAt: '2026-04-19T10:05:00.000Z',
    publishedAt: '2026-04-19T10:05:00.000Z',
  },
  {
    id: 'blog-pdf-workflows',
    authorUserId: '1',
    authorName: 'Docrud Team',
    authorEmail: 'admin@company.com',
    title: 'Why PDF workflows still matter even when teams want everything to feel modern',
    slug: 'why-pdf-workflows-still-matter-even-when-teams-want-everything-to-feel-modern',
    excerpt: 'Teams still rely on PDFs because clients, partners, regulators, and internal approvals often do too. The real opportunity is making those flows feel lighter.',
    content: `# PDF is still part of serious work

Not because teams love the format.

Because real-world workflows still depend on it.

Approvals, compliance, client delivery, and final review often land in PDF whether people planned for it or not.

## What modern teams need instead

Faster preparation.

Cleaner edits.

Less back-and-forth.

And easier movement from draft to final delivery.

## The opportunity

Do not fight the format.

Make the workflow around it feel much better.`,
    category: 'PDF Workflow',
    tags: ['pdf workflow', 'pdf editor', 'document delivery', 'operations'],
    coverImageUrl: '/file-directory-home-banner.png',
    status: 'published',
    seoTitle: 'Why PDF workflows still matter for modern teams | Docrud Blog',
    seoDescription: 'Learn why PDF workflows remain important and how modern teams can make them faster, cleaner, and easier to manage.',
    readTimeMinutes: 3,
    createdAt: '2026-04-19T14:30:00.000Z',
    updatedAt: '2026-04-19T14:30:00.000Z',
    publishedAt: '2026-04-19T14:30:00.000Z',
  },
];

function normalizeBlogPost(entry: Partial<BlogPost>): BlogPost {
  const now = new Date().toISOString();
  const title = String(entry.title || 'Untitled post').trim();
  const content = String(entry.content || '').trim();
  const createdAt = entry.createdAt || now;
  const updatedAt = entry.updatedAt || now;
  const publishedAt = entry.status === 'published'
    ? (entry.publishedAt || updatedAt)
    : undefined;

  return {
    id: String(entry.id || `blog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    authorUserId: String(entry.authorUserId || 'unknown'),
    authorName: String(entry.authorName || 'Docrud Author'),
    authorEmail: String(entry.authorEmail || 'author@docrud.local'),
    title,
    slug: String(entry.slug || slugify(title) || `post-${Date.now()}`),
    excerpt: String(entry.excerpt || buildExcerpt(content, title)),
    content,
    category: String(entry.category || 'General').trim() || 'General',
    tags: Array.isArray(entry.tags) ? entry.tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
    coverImageUrl: entry.coverImageUrl ? String(entry.coverImageUrl) : undefined,
    status: entry.status === 'published' ? 'published' : 'draft',
    featured: Boolean(entry.featured),
    seoTitle: entry.seoTitle ? String(entry.seoTitle) : undefined,
    seoDescription: entry.seoDescription ? String(entry.seoDescription) : undefined,
    readTimeMinutes: Number(entry.readTimeMinutes || estimateReadTimeMinutes(content)),
    createdAt,
    updatedAt,
    publishedAt,
  };
}

export async function getBlogPosts() {
  const storedPosts = await readJsonFile<BlogPost[]>(blogPostsPath, defaultBlogPosts);
  const mergedPosts = [...storedPosts];

  for (const seedPost of defaultBlogPosts) {
    if (!mergedPosts.some((entry) => entry.id === seedPost.id)) {
      mergedPosts.push(seedPost);
    }
  }

  return mergedPosts
    .map((entry) => normalizeBlogPost(entry))
    .sort((left, right) => new Date(right.publishedAt || right.updatedAt).getTime() - new Date(left.publishedAt || left.updatedAt).getTime());
}

export async function saveBlogPosts(posts: BlogPost[]) {
  await writeJsonFile(blogPostsPath, posts);
}

export async function getPublicBlogPosts() {
  const posts = await getBlogPosts();
  return posts.filter((post) => post.status === 'published');
}

export async function getBlogCategories() {
  const posts = await getPublicBlogPosts();
  return Array.from(new Set(posts.map((post) => post.category))).sort((a, b) => a.localeCompare(b));
}

export async function getBlogPostBySlug(slug: string) {
  const posts = await getBlogPosts();
  return posts.find((post) => post.slug === slug) || null;
}

export async function getBlogPostsForAuthor(userId: string, email?: string) {
  const posts = await getBlogPosts();
  return posts.filter((post) => post.authorUserId === userId || post.authorEmail.toLowerCase() === (email || '').toLowerCase());
}

export async function upsertBlogPost(
  input: Partial<BlogPost> & {
    authorUserId: string;
    authorName: string;
    authorEmail: string;
  },
) {
  const posts = await getBlogPosts();
  const existingIndex = input.id ? posts.findIndex((post) => post.id === input.id) : -1;
  const now = new Date().toISOString();
  const title = String(input.title || 'Untitled post').trim();
  const slugBase = slugify(input.slug || title) || `post-${Date.now()}`;

  let nextSlug = slugBase;
  let attempt = 1;
  while (posts.some((post, index) => index !== existingIndex && post.slug === nextSlug)) {
    nextSlug = `${slugBase}-${attempt += 1}`;
  }

  const existing = existingIndex >= 0 ? posts[existingIndex] : null;
  const next = normalizeBlogPost({
    ...existing,
    ...input,
    slug: nextSlug,
    title,
    excerpt: input.excerpt?.trim() || buildExcerpt(String(input.content || existing?.content || ''), title),
    seoTitle: input.seoTitle?.trim() || `${title} | Docrud Blog`,
    seoDescription: input.seoDescription?.trim() || buildExcerpt(String(input.content || existing?.content || ''), title),
    readTimeMinutes: estimateReadTimeMinutes(String(input.content || existing?.content || '')),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    publishedAt: input.status === 'published'
      ? (existing?.publishedAt || now)
      : undefined,
  });

  const updatedPosts = existingIndex >= 0
    ? posts.map((post, index) => (index === existingIndex ? next : post))
    : [next, ...posts];

  await saveBlogPosts(updatedPosts);
  return next;
}

export async function deleteBlogPost(id: string) {
  const posts = await getBlogPosts();
  const next = posts.filter((post) => post.id !== id);
  if (next.length === posts.length) return false;
  await saveBlogPosts(next);
  return true;
}
