import { getDbPool, getMongoDb } from '@/lib/server/database';
import { readJsonFile, writeJsonFile } from '@/lib/server/storage';
import path from 'path';

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

interface JsonStore {
  pages: BusinessPage[];
  posts: BusinessPost[];
  jobs: BusinessJob[];
  products: BusinessProduct[];
  events: BusinessEvent[];
  followers: Array<{ pageId: string; userId: string; createdAt: string }>;
}

const EMPTY_STORE: JsonStore = { pages: [], posts: [], jobs: [], products: [], events: [], followers: [] };

async function readStore(): Promise<JsonStore> { return readJsonFile<JsonStore>(businessPagesPath, EMPTY_STORE); }
async function writeStore(store: JsonStore): Promise<void> { await writeJsonFile(businessPagesPath, store); }

type PageDoc = BusinessPage & { _id: string };
type PostDoc = BusinessPost & { _id: string };
type JobDoc = BusinessJob & { _id: string };
type ProductDoc = BusinessProduct & { _id: string };
type EventDoc = BusinessEvent & { _id: string };

function stripPage({ _id: _u, ...rest }: PageDoc): BusinessPage { return rest; }
function stripPost({ _id: _u, ...rest }: PostDoc): BusinessPost { return rest; }
function stripJob({ _id: _u, ...rest }: JobDoc): BusinessJob { return rest; }
function stripProduct({ _id: _u, ...rest }: ProductDoc): BusinessProduct { return rest; }
function stripEvent({ _id: _u, ...rest }: EventDoc): BusinessEvent { return rest; }

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
  const { industry, companySize, country, verified, search, sortBy = 'newest', limit = 24, offset = 0 } = opts;

  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const filter: Record<string, unknown> = { status: 'active' };
      if (industry) filter.industry = industry;
      if (companySize) filter.companySize = companySize;
      if (country) filter.country = new RegExp(country.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      if (verified === true) filter.verified = true;
      if (search) {
        const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [{ name: re }, { tagline: re }, { description: re }];
      }
      const sortMap: Record<string, Record<string, number>> = {
        newest: { createdAt: -1 },
        followers: { followerCount: -1 },
        name: { name: 1 },
      };
      const sort = sortMap[sortBy] || { createdAt: -1 };
      const [total, docs] = await Promise.all([
        db.collection('business_pages').countDocuments(filter),
        db.collection<PageDoc>('business_pages').find(filter).sort(sort as any).skip(offset).limit(limit).toArray(),
      ]);
      return { pages: docs.map(stripPage), total };
    }
  }

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
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const doc = await db.collection<PageDoc>('business_pages').findOne({ slug });
      return doc ? stripPage(doc) : null;
    }
  }
  const store = await readStore();
  return store.pages.find((p) => p.slug === slug) ?? null;
}

export async function getBusinessPageById(id: string): Promise<BusinessPage | null> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const doc = await db.collection<PageDoc>('business_pages').findOne({ _id: id });
      return doc ? stripPage(doc) : null;
    }
  }
  const store = await readStore();
  return store.pages.find((p) => p.id === id) ?? null;
}

export async function getBusinessPagesByOwner(ownerUserId: string): Promise<BusinessPage[]> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const docs = await db.collection<PageDoc>('business_pages')
        .find({ ownerUserId }).sort({ createdAt: -1 }).toArray();
      return docs.map(stripPage);
    }
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
  const now = new Date().toISOString();
  const newPage: BusinessPage = {
    id: data.id, slug: data.slug, ownerUserId: data.ownerUserId, name: data.name,
    tagline: data.tagline, description: data.description, industry: data.industry,
    companySize: data.companySize, foundedYear: data.foundedYear, website: data.website,
    logoUrl: data.logoUrl, location: data.location, city: data.city, country: data.country,
    phone: data.phone, email: data.email, verified: false, status: 'active',
    followerCount: 0, viewCount: 0, postCount: 0, jobCount: 0,
    socialLinks: data.socialLinks || {}, metadata: {}, createdAt: now, updatedAt: now,
  };

  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      await db.collection<PageDoc>('business_pages').insertOne({ ...newPage, _id: data.id });
      return newPage;
    }
  }
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
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const setFields = { ...data, updatedAt: new Date().toISOString() };
      await db.collection('business_pages').updateOne({ _id: id as any }, { $set: setFields });
      const doc = await db.collection<PageDoc>('business_pages').findOne({ _id: id as any });
      return doc ? stripPage(doc) : null;
    }
  }
  const store = await readStore();
  const idx = store.pages.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const updated: BusinessPage = { ...store.pages[idx], ...data, updatedAt: new Date().toISOString() };
  store.pages[idx] = updated;
  await writeStore(store);
  return updated;
}

export async function recordBusinessPageView(id: string): Promise<void> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) { await db.collection('business_pages').updateOne({ _id: id as any }, { $inc: { viewCount: 1 } }); return; }
  }
  const store = await readStore();
  const page = store.pages.find((p) => p.id === id);
  if (page) { page.viewCount += 1; await writeStore(store); }
}

export async function followBusinessPage(pageId: string, userId: string): Promise<boolean> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const docId = `${pageId}_${userId}`;
      const existing = await db.collection('business_page_followers').findOne({ _id: docId as any });
      if (existing) {
        await db.collection('business_page_followers').deleteOne({ _id: docId as any });
        await db.collection('business_pages').updateOne({ _id: pageId as any }, { $inc: { followerCount: -1 } });
        return false;
      }
      await (db.collection('business_page_followers') as any).insertOne({ _id: docId, pageId, userId, createdAt: new Date().toISOString() });
      await db.collection('business_pages').updateOne({ _id: pageId as any }, { $inc: { followerCount: 1 } });
      return true;
    }
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
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const count = await db.collection('business_page_followers').countDocuments({ _id: `${pageId}_${userId}` as any });
      return count > 0;
    }
  }
  const store = await readStore();
  return store.followers.some((f) => f.pageId === pageId && f.userId === userId);
}

export async function getPagePosts(pageId: string, limit = 20, offset = 0): Promise<BusinessPost[]> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const docs = await db.collection<PostDoc>('business_page_posts')
        .find({ pageId }).sort({ pinned: -1, createdAt: -1 }).skip(offset).limit(limit).toArray();
      return docs.map(stripPost);
    }
  }
  const store = await readStore();
  return store.posts.filter((p) => p.pageId === pageId)
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(offset, offset + limit);
}

export async function createPost(data: { id: string; pageId: string; authorUserId: string; content: string; mediaUrls?: string[]; postType?: string }): Promise<BusinessPost> {
  const now = new Date().toISOString();
  const newPost: BusinessPost = {
    id: data.id, pageId: data.pageId, authorUserId: data.authorUserId, content: data.content,
    mediaUrls: data.mediaUrls || [], postType: data.postType || 'update',
    likeCount: 0, commentCount: 0, likedBy: [], pinned: false, createdAt: now, updatedAt: now,
  };
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      await db.collection<PostDoc>('business_page_posts').insertOne({ ...newPost, _id: data.id });
      await db.collection('business_pages').updateOne({ _id: data.pageId as any }, { $inc: { postCount: 1 } });
      return newPost;
    }
  }
  const store = await readStore();
  store.posts.push(newPost);
  const page = store.pages.find((p) => p.id === data.pageId);
  if (page) page.postCount += 1;
  await writeStore(store);
  return newPost;
}

export async function deletePost(postId: string, pageId: string): Promise<void> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      await db.collection('business_page_posts').deleteOne({ _id: postId as any, pageId });
      await db.collection('business_pages').updateOne({ _id: pageId as any }, { $inc: { postCount: -1 } });
      return;
    }
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
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const doc = await db.collection<PostDoc>('business_page_posts').findOne({ _id: postId as any });
      if (!doc) return { likeCount: 0, liked: false };
      const likedBy: string[] = doc.likedBy || [];
      const already = likedBy.includes(userId);
      if (already) {
        const updated = likedBy.filter((u) => u !== userId);
        const newCount = Math.max(0, doc.likeCount - 1);
        await db.collection('business_page_posts').updateOne({ _id: postId as any }, { $set: { likedBy: updated, likeCount: newCount } });
        return { likeCount: newCount, liked: false };
      }
      const newCount = doc.likeCount + 1;
      await db.collection('business_page_posts').updateOne({ _id: postId as any }, { $addToSet: { likedBy: userId }, $inc: { likeCount: 1 } });
      return { likeCount: newCount, liked: true };
    }
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
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const filter: Record<string, unknown> = { pageId };
      if (status) filter.status = status;
      const docs = await db.collection<JobDoc>('business_page_jobs').find(filter).sort({ createdAt: -1 }).toArray();
      return docs.map(stripJob);
    }
  }
  const store = await readStore();
  let jobs = store.jobs.filter((j) => j.pageId === pageId);
  if (status) jobs = jobs.filter((j) => j.status === status);
  return jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function createJob(data: { id: string; pageId: string; title: string; description: string; location?: string; jobType?: string; experienceLevel?: string; salaryMin?: number; salaryMax?: number; skills?: string[]; applyUrl?: string }): Promise<BusinessJob> {
  const now = new Date().toISOString();
  const newJob: BusinessJob = {
    id: data.id, pageId: data.pageId, title: data.title, description: data.description,
    location: data.location, jobType: data.jobType || 'full_time', experienceLevel: data.experienceLevel,
    salaryMin: data.salaryMin, salaryMax: data.salaryMax, salaryCurrency: 'INR',
    skills: data.skills || [], status: 'open', applyUrl: data.applyUrl,
    applicationCount: 0, createdAt: now, updatedAt: now,
  };
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      await db.collection<JobDoc>('business_page_jobs').insertOne({ ...newJob, _id: data.id });
      await db.collection('business_pages').updateOne({ _id: data.pageId as any }, { $inc: { jobCount: 1 } });
      return newJob;
    }
  }
  const store = await readStore();
  store.jobs.push(newJob);
  const page = store.pages.find((p) => p.id === data.pageId);
  if (page) page.jobCount += 1;
  await writeStore(store);
  return newJob;
}

/**
 * Bulk accessors for search.
 *
 * Jobs, products and events each live in their own collection keyed by
 * `pageId`, so many pages can be served by a single `$in` query — no per-page
 * round trip. These read the same collections and reuse the same strip
 * functions as the per-page getters above; they add no new storage logic.
 * Callers must pass the page ids they are already allowed to see.
 */
export async function listJobsForPages(pageIds: string[], status = 'open'): Promise<BusinessJob[]> {
  const ids = Array.from(new Set(pageIds.filter(Boolean)));
  if (!ids.length) return [];
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const filter: Record<string, unknown> = { pageId: { $in: ids } };
      if (status) filter.status = status;
      const docs = await db.collection<JobDoc>('business_page_jobs')
        .find(filter).sort({ createdAt: -1 }).limit(500).toArray();
      return docs.map(stripJob);
    }
  }
  const store = await readStore();
  const idSet = new Set(ids);
  return store.jobs
    .filter((j) => idSet.has(j.pageId) && (!status || j.status === status))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 500);
}

export async function listProductsForPages(pageIds: string[]): Promise<BusinessProduct[]> {
  const ids = Array.from(new Set(pageIds.filter(Boolean)));
  if (!ids.length) return [];
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const docs = await db.collection<ProductDoc>('business_page_products')
        .find({ pageId: { $in: ids } }).sort({ sortOrder: 1, createdAt: -1 }).limit(500).toArray();
      return docs.map(stripProduct);
    }
  }
  const store = await readStore();
  const idSet = new Set(ids);
  return store.products.filter((p) => idSet.has(p.pageId)).slice(0, 500);
}

export async function listEventsForPages(pageIds: string[]): Promise<BusinessEvent[]> {
  const ids = Array.from(new Set(pageIds.filter(Boolean)));
  if (!ids.length) return [];
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const docs = await db.collection<EventDoc>('business_page_events')
        .find({ pageId: { $in: ids } }).sort({ startAt: 1 }).limit(500).toArray();
      return docs.map(stripEvent);
    }
  }
  const store = await readStore();
  const idSet = new Set(ids);
  return store.events.filter((e) => idSet.has(e.pageId)).slice(0, 500);
}

export async function getPageProducts(pageId: string): Promise<BusinessProduct[]> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const docs = await db.collection<ProductDoc>('business_page_products')
        .find({ pageId }).sort({ sortOrder: 1, createdAt: -1 }).toArray();
      return docs.map(stripProduct);
    }
  }
  const store = await readStore();
  return store.products.filter((p) => p.pageId === pageId).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function createProduct(data: { id: string; pageId: string; name: string; description?: string; price?: string; category?: string; imageUrl?: string; productUrl?: string }): Promise<BusinessProduct> {
  const now = new Date().toISOString();
  const newProduct: BusinessProduct = {
    id: data.id, pageId: data.pageId, name: data.name, description: data.description,
    price: data.price, category: data.category, imageUrl: data.imageUrl, productUrl: data.productUrl,
    sortOrder: 0, createdAt: now,
  };
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      await db.collection<ProductDoc>('business_page_products').insertOne({ ...newProduct, _id: data.id });
      return newProduct;
    }
  }
  const store = await readStore();
  store.products.push(newProduct);
  await writeStore(store);
  return newProduct;
}

export async function getPageEvents(pageId: string): Promise<BusinessEvent[]> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const docs = await db.collection<EventDoc>('business_page_events').find({ pageId }).sort({ startAt: 1 }).toArray();
      return docs.map(stripEvent);
    }
  }
  const store = await readStore();
  return store.events.filter((e) => e.pageId === pageId).sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
}

export async function createEvent(data: { id: string; pageId: string; title: string; description?: string; eventType?: string; startAt: string; endAt?: string; location?: string; isOnline?: boolean; registrationUrl?: string; coverUrl?: string }): Promise<BusinessEvent> {
  const now = new Date().toISOString();
  const newEvent: BusinessEvent = {
    id: data.id, pageId: data.pageId, title: data.title, description: data.description,
    eventType: data.eventType || 'webinar', startAt: data.startAt, endAt: data.endAt,
    location: data.location, isOnline: data.isOnline !== false,
    registrationUrl: data.registrationUrl, coverUrl: data.coverUrl,
    attendeeCount: 0, createdAt: now,
  };
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      await db.collection<EventDoc>('business_page_events').insertOne({ ...newEvent, _id: data.id });
      return newEvent;
    }
  }
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

function getWeekMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

function fillWeeks(items: { date: string }[], numWeeks: number): { week: string; count: number }[] {
  const result: { week: string; count: number }[] = [];
  for (let i = numWeeks - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    result.push({ week: getWeekMonday(d), count: 0 });
  }
  for (const item of items) {
    const week = getWeekMonday(new Date(item.date));
    const entry = result.find((r) => r.week === week);
    if (entry) entry.count += 1;
  }
  return result;
}

export async function getPageAnalytics(pageId: string): Promise<PageAnalytics> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const twelveWeeksAgo = new Date(Date.now() - 12 * 7 * 24 * 60 * 60 * 1000).toISOString();
      const tenWeeksAgo = new Date(Date.now() - 10 * 7 * 24 * 60 * 60 * 1000).toISOString();

      const [
        page, recentFollowerDocs, engageAgg, followerDocs, postDates,
        productCount, eventCount, reviewAgg, ratingDist, topPosts,
      ] = await Promise.all([
        db.collection<PageDoc>('business_pages').findOne({ _id: pageId }),
        db.collection('business_page_followers').countDocuments({ pageId, createdAt: { $gt: thirtyDaysAgo } }),
        db.collection('business_page_posts').aggregate<{ totalLikes: number; totalComments: number }>([
          { $match: { pageId } },
          { $group: { _id: null, totalLikes: { $sum: '$likeCount' }, totalComments: { $sum: '$commentCount' } } },
        ]).toArray(),
        db.collection<{ _id: string; createdAt: string }>('business_page_followers')
          .find({ pageId, createdAt: { $gt: twelveWeeksAgo } }).project({ createdAt: 1 }).toArray(),
        db.collection<{ _id: string; createdAt: string }>('business_page_posts')
          .find({ pageId, createdAt: { $gt: tenWeeksAgo } }).project({ createdAt: 1 }).toArray(),
        db.collection('business_page_products').countDocuments({ pageId }),
        db.collection('business_page_events').countDocuments({ pageId }),
        db.collection('business_page_reviews').aggregate<{ count: number; avg: number }>([
          { $match: { pageId } },
          { $group: { _id: null, count: { $sum: 1 }, avg: { $avg: '$rating' } } },
        ]).toArray(),
        db.collection('business_page_reviews').aggregate<{ _id: number; count: number }>([
          { $match: { pageId } },
          { $group: { _id: '$rating', count: { $sum: 1 } } },
          { $sort: { _id: -1 } },
        ]).toArray(),
        db.collection<PostDoc>('business_page_posts')
          .find({ pageId }).sort({ likeCount: -1, createdAt: -1 }).limit(5).toArray(),
      ]);

      const p = page ? stripPage(page) : null;
      const eng = engageAgg[0];
      const rev = reviewAgg[0];

      return {
        totalViews: p?.viewCount || 0,
        followerCount: p?.followerCount || 0,
        postCount: p?.postCount || 0,
        jobCount: p?.jobCount || 0,
        recentFollowers: recentFollowerDocs,
        productCount,
        eventCount,
        reviewCount: rev?.count || 0,
        avgRating: rev?.avg || 0,
        totalLikes: eng?.totalLikes || 0,
        totalComments: eng?.totalComments || 0,
        followersByWeek: fillWeeks(followerDocs.map((d) => ({ date: d.createdAt })), 12),
        postsByWeek: fillWeeks(postDates.map((d) => ({ date: d.createdAt })), 10),
        ratingDistribution: ratingDist.map((r) => ({ rating: r._id, count: r.count })),
        topPosts: topPosts.map(stripPost).map((post) => ({
          id: post.id, content: post.content, likeCount: post.likeCount,
          commentCount: post.commentCount, createdAt: post.createdAt,
        })),
      };
    }
  }

  const store = await readStore();
  const page = store.pages.find((p) => p.id === pageId);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const recentFollowers = store.followers.filter((f) => f.pageId === pageId && f.createdAt > thirtyDaysAgo).length;
  return {
    totalViews: page?.viewCount || 0, followerCount: page?.followerCount || 0,
    postCount: page?.postCount || 0, jobCount: page?.jobCount || 0,
    recentFollowers, productCount: 0, eventCount: 0,
    reviewCount: 0, avgRating: 0, totalLikes: 0, totalComments: 0,
    followersByWeek: [], postsByWeek: [], ratingDistribution: [], topPosts: [],
  };
}

export async function slugExists(slug: string): Promise<boolean> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const count = await db.collection('business_pages').countDocuments({ slug });
      return count > 0;
    }
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
