import { getDbPool } from '@/lib/server/database';
import { readJsonFile, writeJsonFile } from '@/lib/server/storage';
import path from 'path';
import { promises as fs } from 'fs';

const dataDir = path.join(process.cwd(), 'data');
export const businessPagesPath = path.join(dataDir, 'business-pages.json');

export interface BusinessPage {
  id: string;
  slug: string;
  ownerUserId: string;
  name: string;
  tagline?: string;
  description?: string;
  industry: string;
  companySize?: string;
  foundedYear?: number;
  website?: string;
  logoUrl?: string;
  coverUrl?: string;
  location?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
  verified: boolean;
  status: string;
  followerCount: number;
  viewCount: number;
  postCount: number;
  jobCount: number;
  socialLinks: Record<string, string>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessPost {
  id: string;
  pageId: string;
  authorUserId: string;
  content: string;
  mediaUrls: string[];
  postType: string;
  likeCount: number;
  commentCount: number;
  likedBy: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessJob {
  id: string;
  pageId: string;
  title: string;
  description: string;
  location?: string;
  jobType: string;
  experienceLevel?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency: string;
  skills: string[];
  status: string;
  applyUrl?: string;
  applicationCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessProduct {
  id: string;
  pageId: string;
  name: string;
  description?: string;
  price?: string;
  category?: string;
  imageUrl?: string;
  productUrl?: string;
  sortOrder: number;
  createdAt: string;
}

export interface BusinessEvent {
  id: string;
  pageId: string;
  title: string;
  description?: string;
  eventType: string;
  startAt: string;
  endAt?: string;
  location?: string;
  isOnline: boolean;
  registrationUrl?: string;
  coverUrl?: string;
  attendeeCount: number;
  createdAt: string;
}

// ── JSON store shape ──────────────────────────────────────────────────────────
interface JsonStore {
  pages: BusinessPage[];
  posts: BusinessPost[];
  jobs: BusinessJob[];
  products: BusinessProduct[];
  events: BusinessEvent[];
  followers: Array<{ pageId: string; userId: string; createdAt: string }>;
}

const EMPTY_STORE: JsonStore = { pages: [], posts: [], jobs: [], products: [], events: [], followers: [] };

async function readStore(): Promise<JsonStore> {
  return readJsonFile<JsonStore>(businessPagesPath, EMPTY_STORE);
}

async function writeStore(store: JsonStore): Promise<void> {
  await writeJsonFile(businessPagesPath, store);
}

// ── Postgres helpers ─────────────────────────────────────────────────────────

function rowToPage(r: Record<string, unknown>): BusinessPage {
  return {
    id: r.id as string,
    slug: r.slug as string,
    ownerUserId: r.owner_user_id as string,
    name: r.name as string,
    tagline: r.tagline as string | undefined,
    description: r.description as string | undefined,
    industry: r.industry as string,
    companySize: r.company_size as string | undefined,
    foundedYear: r.founded_year as number | undefined,
    website: r.website as string | undefined,
    logoUrl: r.logo_url as string | undefined,
    coverUrl: r.cover_url as string | undefined,
    location: r.location as string | undefined,
    city: r.city as string | undefined,
    country: r.country as string | undefined,
    phone: r.phone as string | undefined,
    email: r.email as string | undefined,
    verified: r.verified as boolean,
    status: r.status as string,
    followerCount: r.follower_count as number,
    viewCount: r.view_count as number,
    postCount: r.post_count as number,
    jobCount: r.job_count as number,
    socialLinks: (r.social_links as Record<string, string>) || {},
    metadata: (r.metadata as Record<string, unknown>) || {},
    createdAt: (r.created_at as Date).toISOString(),
    updatedAt: (r.updated_at as Date).toISOString(),
  };
}

function rowToPost(r: Record<string, unknown>): BusinessPost {
  return {
    id: r.id as string,
    pageId: r.page_id as string,
    authorUserId: r.author_user_id as string,
    content: r.content as string,
    mediaUrls: (r.media_urls as string[]) || [],
    postType: r.post_type as string,
    likeCount: r.like_count as number,
    commentCount: r.comment_count as number,
    likedBy: (r.liked_by as string[]) || [],
    pinned: r.pinned as boolean,
    createdAt: (r.created_at as Date).toISOString(),
    updatedAt: (r.updated_at as Date).toISOString(),
  };
}

function rowToJob(r: Record<string, unknown>): BusinessJob {
  return {
    id: r.id as string,
    pageId: r.page_id as string,
    title: r.title as string,
    description: r.description as string,
    location: r.location as string | undefined,
    jobType: r.job_type as string,
    experienceLevel: r.experience_level as string | undefined,
    salaryMin: r.salary_min as number | undefined,
    salaryMax: r.salary_max as number | undefined,
    salaryCurrency: r.salary_currency as string,
    skills: (r.skills as string[]) || [],
    status: r.status as string,
    applyUrl: r.apply_url as string | undefined,
    applicationCount: r.application_count as number,
    createdAt: (r.created_at as Date).toISOString(),
    updatedAt: (r.updated_at as Date).toISOString(),
  };
}

function rowToProduct(r: Record<string, unknown>): BusinessProduct {
  return {
    id: r.id as string,
    pageId: r.page_id as string,
    name: r.name as string,
    description: r.description as string | undefined,
    price: r.price as string | undefined,
    category: r.category as string | undefined,
    imageUrl: r.image_url as string | undefined,
    productUrl: r.product_url as string | undefined,
    sortOrder: r.sort_order as number,
    createdAt: (r.created_at as Date).toISOString(),
  };
}

function rowToEvent(r: Record<string, unknown>): BusinessEvent {
  return {
    id: r.id as string,
    pageId: r.page_id as string,
    title: r.title as string,
    description: r.description as string | undefined,
    eventType: r.event_type as string,
    startAt: (r.start_at as Date).toISOString(),
    endAt: r.end_at ? (r.end_at as Date).toISOString() : undefined,
    location: r.location as string | undefined,
    isOnline: r.is_online as boolean,
    registrationUrl: r.registration_url as string | undefined,
    coverUrl: r.cover_url as string | undefined,
    attendeeCount: r.attendee_count as number,
    createdAt: (r.created_at as Date).toISOString(),
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface ListBusinessPagesOptions {
  industry?: string;
  companySize?: string;
  country?: string;
  verified?: boolean;
  search?: string;
  sortBy?: 'newest' | 'followers' | 'name';
  limit?: number;
  offset?: number;
}

export async function listBusinessPages(opts: ListBusinessPagesOptions = {}): Promise<{ pages: BusinessPage[]; total: number }> {
  const pool = getDbPool();
  const { industry, companySize, country, verified, search, sortBy = 'newest', limit = 24, offset = 0 } = opts;

  if (pool) {
    const conditions: string[] = ["status = 'active'"];
    const params: unknown[] = [];
    let pi = 1;
    if (industry) { conditions.push(`industry = $${pi++}`); params.push(industry); }
    if (companySize) { conditions.push(`company_size = $${pi++}`); params.push(companySize); }
    if (country) { conditions.push(`country ILIKE $${pi++}`); params.push(country); }
    if (verified === true) { conditions.push(`verified = TRUE`); }
    if (search) { conditions.push(`(name ILIKE $${pi} OR tagline ILIKE $${pi} OR description ILIKE $${pi})`); params.push(`%${search}%`); pi++; }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const orderMap: Record<string, string> = { newest: 'created_at DESC', followers: 'follower_count DESC', name: 'name ASC' };
    const orderBy = orderMap[sortBy] || 'created_at DESC';
    const [countRes, rowsRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM business_pages ${where}`, params),
      pool.query(`SELECT * FROM business_pages ${where} ORDER BY ${orderBy} LIMIT $${pi} OFFSET $${pi + 1}`, [...params, limit, offset]),
    ]);
    return { pages: rowsRes.rows.map((r) => rowToPage(r as Record<string, unknown>)), total: parseInt(countRes.rows[0]?.count || '0', 10) };
  }

  // JSON fallback
  const store = await readStore();
  let pages = store.pages.filter((p) => p.status === 'active');
  if (industry) pages = pages.filter((p) => p.industry === industry);
  if (companySize) pages = pages.filter((p) => p.companySize === companySize);
  if (country) pages = pages.filter((p) => p.country?.toLowerCase().includes(country.toLowerCase()));
  if (verified) pages = pages.filter((p) => p.verified);
  if (search) { const q = search.toLowerCase(); pages = pages.filter((p) => p.name.toLowerCase().includes(q) || p.tagline?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q)); }
  const total = pages.length;
  if (sortBy === 'followers') pages.sort((a, b) => b.followerCount - a.followerCount);
  else if (sortBy === 'name') pages.sort((a, b) => a.name.localeCompare(b.name));
  else pages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return { pages: pages.slice(offset, offset + limit), total };
}

export async function getBusinessPageBySlug(slug: string): Promise<BusinessPage | null> {
  const pool = getDbPool();
  if (pool) {
    const res = await pool.query('SELECT * FROM business_pages WHERE slug = $1 LIMIT 1', [slug]);
    if (!res.rows[0]) return null;
    return rowToPage(res.rows[0] as Record<string, unknown>);
  }
  const store = await readStore();
  return store.pages.find((p) => p.slug === slug) ?? null;
}

export async function getBusinessPageById(id: string): Promise<BusinessPage | null> {
  const pool = getDbPool();
  if (pool) {
    const res = await pool.query('SELECT * FROM business_pages WHERE id = $1 LIMIT 1', [id]);
    if (!res.rows[0]) return null;
    return rowToPage(res.rows[0] as Record<string, unknown>);
  }
  const store = await readStore();
  return store.pages.find((p) => p.id === id) ?? null;
}

export async function getBusinessPagesByOwner(ownerUserId: string): Promise<BusinessPage[]> {
  const pool = getDbPool();
  if (pool) {
    const res = await pool.query('SELECT * FROM business_pages WHERE owner_user_id = $1 ORDER BY created_at DESC', [ownerUserId]);
    return res.rows.map((r) => rowToPage(r as Record<string, unknown>));
  }
  const store = await readStore();
  return store.pages.filter((p) => p.ownerUserId === ownerUserId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function createBusinessPage(data: {
  id: string; slug: string; ownerUserId: string; name: string; tagline?: string;
  description?: string; industry: string; companySize?: string; foundedYear?: number;
  website?: string; logoUrl?: string; location?: string; city?: string; country?: string;
  phone?: string; email?: string; socialLinks?: Record<string, string>;
}): Promise<BusinessPage> {
  const pool = getDbPool();
  const now = new Date().toISOString();

  if (pool) {
    const res = await pool.query(
      `INSERT INTO business_pages (id, slug, owner_user_id, name, tagline, description, industry, company_size,
        founded_year, website, logo_url, location, city, country, phone, email, social_links)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [data.id, data.slug, data.ownerUserId, data.name, data.tagline || null, data.description || null,
        data.industry, data.companySize || null, data.foundedYear || null, data.website || null,
        data.logoUrl || null, data.location || null, data.city || null, data.country || null,
        data.phone || null, data.email || null, JSON.stringify(data.socialLinks || {})],
    );
    return rowToPage(res.rows[0] as Record<string, unknown>);
  }

  // JSON fallback
  const newPage: BusinessPage = {
    id: data.id, slug: data.slug, ownerUserId: data.ownerUserId, name: data.name,
    tagline: data.tagline, description: data.description, industry: data.industry,
    companySize: data.companySize, foundedYear: data.foundedYear, website: data.website,
    logoUrl: data.logoUrl, location: data.location, city: data.city, country: data.country,
    phone: data.phone, email: data.email, verified: false, status: 'active',
    followerCount: 0, viewCount: 0, postCount: 0, jobCount: 0,
    socialLinks: data.socialLinks || {}, metadata: {}, createdAt: now, updatedAt: now,
  };
  const store = await readStore();
  store.pages.push(newPage);
  await writeStore(store);
  return newPage;
}

export async function updateBusinessPage(id: string, data: Partial<{
  name: string; tagline: string; description: string; industry: string; companySize: string;
  foundedYear: number; website: string; logoUrl: string; coverUrl: string; location: string;
  city: string; country: string; phone: string; email: string;
  socialLinks: Record<string, string>; metadata: Record<string, unknown>;
}>): Promise<BusinessPage | null> {
  const pool = getDbPool();

  if (pool) {
    const colMap: Record<string, string> = {
      name: 'name', tagline: 'tagline', description: 'description', industry: 'industry',
      companySize: 'company_size', foundedYear: 'founded_year', website: 'website',
      logoUrl: 'logo_url', coverUrl: 'cover_url', location: 'location', city: 'city',
      country: 'country', phone: 'phone', email: 'email',
      socialLinks: 'social_links', metadata: 'metadata',
    };
    const sets: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let pi = 1;
    for (const [key, col] of Object.entries(colMap)) {
      if (key in data) {
        const val = (data as Record<string, unknown>)[key];
        sets.push(`${col} = $${pi++}`);
        params.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val);
      }
    }
    params.push(id);
    const res = await pool.query(`UPDATE business_pages SET ${sets.join(', ')} WHERE id = $${pi} RETURNING *`, params);
    if (!res.rows[0]) return null;
    return rowToPage(res.rows[0] as Record<string, unknown>);
  }

  // JSON fallback
  const store = await readStore();
  const idx = store.pages.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const updated: BusinessPage = { ...store.pages[idx], ...data, updatedAt: new Date().toISOString() };
  store.pages[idx] = updated;
  await writeStore(store);
  return updated;
}

export async function recordBusinessPageView(id: string): Promise<void> {
  const pool = getDbPool();
  if (pool) { await pool.query('UPDATE business_pages SET view_count = view_count + 1 WHERE id = $1', [id]); return; }
  const store = await readStore();
  const page = store.pages.find((p) => p.id === id);
  if (page) { page.viewCount += 1; await writeStore(store); }
}

export async function followBusinessPage(pageId: string, userId: string): Promise<boolean> {
  const pool = getDbPool();

  if (pool) {
    const existing = await pool.query('SELECT 1 FROM business_page_followers WHERE page_id=$1 AND user_id=$2', [pageId, userId]);
    if (existing.rows.length > 0) {
      await pool.query('DELETE FROM business_page_followers WHERE page_id=$1 AND user_id=$2', [pageId, userId]);
      await pool.query('UPDATE business_pages SET follower_count = GREATEST(0, follower_count - 1) WHERE id=$1', [pageId]);
      return false;
    }
    await pool.query('INSERT INTO business_page_followers (page_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [pageId, userId]);
    await pool.query('UPDATE business_pages SET follower_count = follower_count + 1 WHERE id=$1', [pageId]);
    return true;
  }

  const store = await readStore();
  const existing = store.followers.findIndex((f) => f.pageId === pageId && f.userId === userId);
  if (existing >= 0) {
    store.followers.splice(existing, 1);
    const page = store.pages.find((p) => p.id === pageId);
    if (page) page.followerCount = Math.max(0, page.followerCount - 1);
    await writeStore(store);
    return false;
  }
  store.followers.push({ pageId, userId, createdAt: new Date().toISOString() });
  const page = store.pages.find((p) => p.id === pageId);
  if (page) page.followerCount += 1;
  await writeStore(store);
  return true;
}

export async function isFollowingPage(pageId: string, userId: string): Promise<boolean> {
  const pool = getDbPool();
  if (pool) {
    const res = await pool.query('SELECT 1 FROM business_page_followers WHERE page_id=$1 AND user_id=$2', [pageId, userId]);
    return res.rows.length > 0;
  }
  const store = await readStore();
  return store.followers.some((f) => f.pageId === pageId && f.userId === userId);
}

export async function getPagePosts(pageId: string, limit = 20, offset = 0): Promise<BusinessPost[]> {
  const pool = getDbPool();
  if (pool) {
    const res = await pool.query(
      'SELECT * FROM business_page_posts WHERE page_id=$1 ORDER BY pinned DESC, created_at DESC LIMIT $2 OFFSET $3',
      [pageId, limit, offset],
    );
    return res.rows.map((r) => rowToPost(r as Record<string, unknown>));
  }
  const store = await readStore();
  return store.posts.filter((p) => p.pageId === pageId)
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(offset, offset + limit);
}

export async function createPost(data: { id: string; pageId: string; authorUserId: string; content: string; mediaUrls?: string[]; postType?: string }): Promise<BusinessPost> {
  const pool = getDbPool();
  const now = new Date().toISOString();

  if (pool) {
    const res = await pool.query(
      `INSERT INTO business_page_posts (id, page_id, author_user_id, content, media_urls, post_type) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [data.id, data.pageId, data.authorUserId, data.content, JSON.stringify(data.mediaUrls || []), data.postType || 'update'],
    );
    await pool.query('UPDATE business_pages SET post_count = post_count + 1 WHERE id=$1', [data.pageId]);
    return rowToPost(res.rows[0] as Record<string, unknown>);
  }

  const newPost: BusinessPost = {
    id: data.id, pageId: data.pageId, authorUserId: data.authorUserId, content: data.content,
    mediaUrls: data.mediaUrls || [], postType: data.postType || 'update',
    likeCount: 0, commentCount: 0, likedBy: [], pinned: false, createdAt: now, updatedAt: now,
  };
  const store = await readStore();
  store.posts.push(newPost);
  const page = store.pages.find((p) => p.id === data.pageId);
  if (page) page.postCount += 1;
  await writeStore(store);
  return newPost;
}

export async function deletePost(postId: string, pageId: string): Promise<void> {
  const pool = getDbPool();
  if (pool) {
    await pool.query('DELETE FROM business_page_posts WHERE id=$1 AND page_id=$2', [postId, pageId]);
    await pool.query('UPDATE business_pages SET post_count = GREATEST(0, post_count - 1) WHERE id=$1', [pageId]);
    return;
  }
  const store = await readStore();
  const before = store.posts.length;
  store.posts = store.posts.filter((p) => !(p.id === postId && p.pageId === pageId));
  if (store.posts.length < before) {
    const page = store.pages.find((p) => p.id === pageId);
    if (page) page.postCount = Math.max(0, page.postCount - 1);
  }
  await writeStore(store);
}

export async function togglePostLike(postId: string, userId: string): Promise<{ likeCount: number; liked: boolean }> {
  const pool = getDbPool();

  if (pool) {
    const res = await pool.query('SELECT liked_by, like_count FROM business_page_posts WHERE id=$1', [postId]);
    if (!res.rows[0]) return { likeCount: 0, liked: false };
    const likedBy: string[] = res.rows[0].liked_by || [];
    const already = likedBy.includes(userId);
    if (already) {
      const updated = likedBy.filter((u: string) => u !== userId);
      await pool.query('UPDATE business_page_posts SET liked_by=$1, like_count=GREATEST(0,like_count-1) WHERE id=$2', [JSON.stringify(updated), postId]);
      return { likeCount: Math.max(0, (res.rows[0].like_count as number) - 1), liked: false };
    }
    likedBy.push(userId);
    await pool.query('UPDATE business_page_posts SET liked_by=$1, like_count=like_count+1 WHERE id=$2', [JSON.stringify(likedBy), postId]);
    return { likeCount: (res.rows[0].like_count as number) + 1, liked: true };
  }

  const store = await readStore();
  const post = store.posts.find((p) => p.id === postId);
  if (!post) return { likeCount: 0, liked: false };
  const already = post.likedBy.includes(userId);
  if (already) { post.likedBy = post.likedBy.filter((u) => u !== userId); post.likeCount = Math.max(0, post.likeCount - 1); }
  else { post.likedBy.push(userId); post.likeCount += 1; }
  await writeStore(store);
  return { likeCount: post.likeCount, liked: !already };
}

export async function getPageJobs(pageId: string, status?: string): Promise<BusinessJob[]> {
  const pool = getDbPool();
  if (pool) {
    const cond = status ? `AND status=$2` : '';
    const params = status ? [pageId, status] : [pageId];
    const res = await pool.query(`SELECT * FROM business_page_jobs WHERE page_id=$1 ${cond} ORDER BY created_at DESC`, params);
    return res.rows.map((r) => rowToJob(r as Record<string, unknown>));
  }
  const store = await readStore();
  let jobs = store.jobs.filter((j) => j.pageId === pageId);
  if (status) jobs = jobs.filter((j) => j.status === status);
  return jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function createJob(data: { id: string; pageId: string; title: string; description: string; location?: string; jobType?: string; experienceLevel?: string; salaryMin?: number; salaryMax?: number; skills?: string[]; applyUrl?: string }): Promise<BusinessJob> {
  const pool = getDbPool();
  const now = new Date().toISOString();

  if (pool) {
    const res = await pool.query(
      `INSERT INTO business_page_jobs (id, page_id, title, description, location, job_type, experience_level, salary_min, salary_max, skills, apply_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [data.id, data.pageId, data.title, data.description, data.location || null, data.jobType || 'full_time', data.experienceLevel || null, data.salaryMin || null, data.salaryMax || null, JSON.stringify(data.skills || []), data.applyUrl || null],
    );
    await pool.query('UPDATE business_pages SET job_count = job_count + 1 WHERE id=$1', [data.pageId]);
    return rowToJob(res.rows[0] as Record<string, unknown>);
  }

  const newJob: BusinessJob = {
    id: data.id, pageId: data.pageId, title: data.title, description: data.description,
    location: data.location, jobType: data.jobType || 'full_time', experienceLevel: data.experienceLevel,
    salaryMin: data.salaryMin, salaryMax: data.salaryMax, salaryCurrency: 'INR',
    skills: data.skills || [], status: 'open', applyUrl: data.applyUrl,
    applicationCount: 0, createdAt: now, updatedAt: now,
  };
  const store = await readStore();
  store.jobs.push(newJob);
  const page = store.pages.find((p) => p.id === data.pageId);
  if (page) page.jobCount += 1;
  await writeStore(store);
  return newJob;
}

export async function getPageProducts(pageId: string): Promise<BusinessProduct[]> {
  const pool = getDbPool();
  if (pool) {
    const res = await pool.query('SELECT * FROM business_page_products WHERE page_id=$1 ORDER BY sort_order, created_at DESC', [pageId]);
    return res.rows.map((r) => rowToProduct(r as Record<string, unknown>));
  }
  const store = await readStore();
  return store.products.filter((p) => p.pageId === pageId).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function createProduct(data: { id: string; pageId: string; name: string; description?: string; price?: string; category?: string; imageUrl?: string; productUrl?: string }): Promise<BusinessProduct> {
  const pool = getDbPool();
  const now = new Date().toISOString();

  if (pool) {
    const res = await pool.query(
      `INSERT INTO business_page_products (id, page_id, name, description, price, category, image_url, product_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [data.id, data.pageId, data.name, data.description || null, data.price || null, data.category || null, data.imageUrl || null, data.productUrl || null],
    );
    return rowToProduct(res.rows[0] as Record<string, unknown>);
  }

  const newProduct: BusinessProduct = {
    id: data.id, pageId: data.pageId, name: data.name, description: data.description,
    price: data.price, category: data.category, imageUrl: data.imageUrl, productUrl: data.productUrl,
    sortOrder: 0, createdAt: now,
  };
  const store = await readStore();
  store.products.push(newProduct);
  await writeStore(store);
  return newProduct;
}

export async function getPageEvents(pageId: string): Promise<BusinessEvent[]> {
  const pool = getDbPool();
  if (pool) {
    const res = await pool.query('SELECT * FROM business_page_events WHERE page_id=$1 ORDER BY start_at ASC', [pageId]);
    return res.rows.map((r) => rowToEvent(r as Record<string, unknown>));
  }
  const store = await readStore();
  return store.events.filter((e) => e.pageId === pageId).sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
}

export async function createEvent(data: { id: string; pageId: string; title: string; description?: string; eventType?: string; startAt: string; endAt?: string; location?: string; isOnline?: boolean; registrationUrl?: string; coverUrl?: string }): Promise<BusinessEvent> {
  const pool = getDbPool();
  const now = new Date().toISOString();

  if (pool) {
    const res = await pool.query(
      `INSERT INTO business_page_events (id, page_id, title, description, event_type, start_at, end_at, location, is_online, registration_url, cover_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [data.id, data.pageId, data.title, data.description || null, data.eventType || 'webinar', data.startAt, data.endAt || null, data.location || null, data.isOnline !== false, data.registrationUrl || null, data.coverUrl || null],
    );
    return rowToEvent(res.rows[0] as Record<string, unknown>);
  }

  const newEvent: BusinessEvent = {
    id: data.id, pageId: data.pageId, title: data.title, description: data.description,
    eventType: data.eventType || 'webinar', startAt: data.startAt, endAt: data.endAt,
    location: data.location, isOnline: data.isOnline !== false,
    registrationUrl: data.registrationUrl, coverUrl: data.coverUrl,
    attendeeCount: 0, createdAt: now,
  };
  const store = await readStore();
  store.events.push(newEvent);
  await writeStore(store);
  return newEvent;
}

export interface PageAnalytics {
  totalViews: number;
  followerCount: number;
  postCount: number;
  jobCount: number;
  recentFollowers: number;
  productCount: number;
  eventCount: number;
  reviewCount: number;
  avgRating: number;
  totalLikes: number;
  totalComments: number;
  followersByWeek: { week: string; count: number }[];
  postsByWeek: { week: string; count: number }[];
  ratingDistribution: { rating: number; count: number }[];
  topPosts: { id: string; content: string; likeCount: number; commentCount: number; createdAt: string }[];
}

export async function getPageAnalytics(pageId: string): Promise<PageAnalytics> {
  const pool = getDbPool();

  if (pool) {
    const [
      pageRes, recentRes, engageRes,
      followersByWeekRes, postsByWeekRes,
      productRes, eventRes, reviewRes, ratingDistRes, topPostsRes,
    ] = await Promise.all([
      pool.query('SELECT view_count, follower_count, post_count, job_count FROM business_pages WHERE id=$1', [pageId]),
      pool.query("SELECT COUNT(*) FROM business_page_followers WHERE page_id=$1 AND created_at > NOW() - INTERVAL '30 days'", [pageId]),
      pool.query('SELECT COALESCE(SUM(like_count),0) AS total_likes, COALESCE(SUM(comment_count),0) AS total_comments FROM business_page_posts WHERE page_id=$1', [pageId]),
      pool.query(`
        SELECT TO_CHAR(DATE_TRUNC('week', created_at), 'YYYY-MM-DD') AS week, COUNT(*)::int AS count
        FROM business_page_followers WHERE page_id=$1 AND created_at > NOW() - INTERVAL '12 weeks'
        GROUP BY week ORDER BY week`, [pageId]),
      pool.query(`
        SELECT TO_CHAR(DATE_TRUNC('week', created_at), 'YYYY-MM-DD') AS week, COUNT(*)::int AS count
        FROM business_page_posts WHERE page_id=$1 AND created_at > NOW() - INTERVAL '10 weeks'
        GROUP BY week ORDER BY week`, [pageId]),
      pool.query('SELECT COUNT(*)::int AS count FROM business_page_products WHERE page_id=$1', [pageId]),
      pool.query('SELECT COUNT(*)::int AS count FROM business_page_events WHERE page_id=$1', [pageId]),
      pool.query('SELECT COUNT(*)::int AS count, COALESCE(AVG(rating),0) AS avg FROM business_page_reviews WHERE page_id=$1', [pageId]),
      pool.query('SELECT rating, COUNT(*)::int AS count FROM business_page_reviews WHERE page_id=$1 GROUP BY rating ORDER BY rating DESC', [pageId]),
      pool.query('SELECT id, content, like_count, comment_count, created_at FROM business_page_posts WHERE page_id=$1 ORDER BY like_count DESC, created_at DESC LIMIT 5', [pageId]),
    ]);

    const p = pageRes.rows[0] || {};
    const e = engageRes.rows[0] || {};
    const r = reviewRes.rows[0] || {};

    // Fill missing weeks with 0
    const fillWeeks = (rows: { week: string; count: number }[], numWeeks: number) => {
      const map = new Map(rows.map(r => [r.week, r.count]));
      const result: { week: string; count: number }[] = [];
      for (let i = numWeeks - 1; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i * 7);
        const monday = new Date(d); monday.setDate(d.getDate() - d.getDay() + 1);
        const key = monday.toISOString().slice(0, 10);
        result.push({ week: key, count: map.get(key) ?? 0 });
      }
      return result;
    }

    return {
      totalViews:         (p.view_count as number) || 0,
      followerCount:      (p.follower_count as number) || 0,
      postCount:          (p.post_count as number) || 0,
      jobCount:           (p.job_count as number) || 0,
      recentFollowers:    parseInt(recentRes.rows[0]?.count || '0', 10),
      productCount:       productRes.rows[0]?.count || 0,
      eventCount:         eventRes.rows[0]?.count || 0,
      reviewCount:        r.count || 0,
      avgRating:          parseFloat(r.avg) || 0,
      totalLikes:         parseInt(e.total_likes) || 0,
      totalComments:      parseInt(e.total_comments) || 0,
      followersByWeek:    fillWeeks(followersByWeekRes.rows as { week: string; count: number }[], 12),
      postsByWeek:        fillWeeks(postsByWeekRes.rows as { week: string; count: number }[], 10),
      ratingDistribution: ratingDistRes.rows as { rating: number; count: number }[],
      topPosts:           (topPostsRes.rows as { id: string; content: string; like_count: number; comment_count: number; created_at: string }[]).map(r => ({
        id: r.id, content: r.content, likeCount: r.like_count, commentCount: r.comment_count, createdAt: r.created_at,
      })),
    };
  }

  // JSON store fallback
  const store = await readStore();
  const page = store.pages.find((p) => p.id === pageId);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const recentFollowers = store.followers.filter((f: { pageId: string; createdAt: string }) => f.pageId === pageId && f.createdAt > thirtyDaysAgo).length;
  return {
    totalViews: page?.viewCount || 0, followerCount: page?.followerCount || 0,
    postCount: page?.postCount || 0, jobCount: page?.jobCount || 0,
    recentFollowers, productCount: 0, eventCount: 0,
    reviewCount: 0, avgRating: 0, totalLikes: 0, totalComments: 0,
    followersByWeek: [], postsByWeek: [], ratingDistribution: [], topPosts: [],
  };
}

export async function slugExists(slug: string): Promise<boolean> {
  const pool = getDbPool();
  if (pool) {
    const res = await pool.query('SELECT 1 FROM business_pages WHERE slug=$1', [slug]);
    return res.rows.length > 0;
  }
  const store = await readStore();
  return store.pages.some((p) => p.slug === slug);
}

export async function generateUniqueSlug(base: string): Promise<string> {
  const cleaned = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!(await slugExists(cleaned))) return cleaned;
  for (let i = 2; i < 100; i++) {
    const candidate = `${cleaned}-${i}`;
    if (!(await slugExists(candidate))) return candidate;
  }
  return `${cleaned}-${Date.now()}`;
}
