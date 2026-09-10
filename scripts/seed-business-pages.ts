/**
 * Six business pages, filled in.
 *
 * Run: npx tsx scripts/seed-business-pages.ts
 *
 * ═══ WHAT IT WRITES ═══
 *
 * Every field the directory card and the company page read: name, tagline, a
 * real description, industry, size, founding year, website, city and country,
 * contact details, social links, and the three counts. Nothing is left blank
 * to be discovered as a gap on the page later.
 *
 * ═══ IT DOES NOT OVERWRITE ═══
 *
 * Keyed by slug: a page that already exists is left exactly as it is, and only
 * the missing ones are added. Running it twice changes nothing the second
 * time, so it is safe on an instance that already has real companies on it.
 *
 * The owner is the first account it can find, so these pages behave like
 * somebody's — they can be opened, edited and followed rather than being rows
 * that belong to nobody.
 */

import { randomUUID } from 'crypto';
import { readJsonFile, writeJsonFile } from '../lib/server/storage';
import { businessPagesPath, type BusinessPage } from '../lib/server/business-pages';
import { getStoredUsers } from '../lib/server/auth';

type Store = {
  pages: BusinessPage[];
  posts: unknown[];
  jobs: unknown[];
  products: unknown[];
  events: unknown[];
  followers: unknown[];
};

const EMPTY: Store = { pages: [], posts: [], jobs: [], products: [], events: [], followers: [] };

/** Written out in full rather than generated: six specific companies read as
    six companies; six permutations of a template read as test data. */
const SEED: Array<Omit<BusinessPage, 'id' | 'ownerUserId' | 'createdAt' | 'updatedAt'>> = [
  {
    slug: 'northwind-labs',
    name: 'Northwind Labs',
    tagline: 'Payments infrastructure for businesses that outgrew their bank.',
    description:
      'Northwind Labs builds the settlement layer under India\'s fastest-growing marketplaces. '
      + 'Our APIs move money between buyers, sellers and logistics partners in one call, with '
      + 'reconciliation that finance teams can actually read. Founded by two former payments '
      + 'engineers who spent a decade watching spreadsheets do the job of software.',
    industry: 'finance',
    companySize: '51-200',
    foundedYear: 2019,
    website: 'https://northwindlabs.example.com',
    logoUrl: '',
    coverUrl: '',
    location: 'Bengaluru, Karnataka',
    city: 'Bengaluru',
    country: 'India',
    phone: '+91 80 4718 2200',
    email: 'hello@northwindlabs.example.com',
    verified: true,
    status: 'active',
    followerCount: 2840,
    viewCount: 19_460,
    postCount: 18,
    jobCount: 7,
    socialLinks: {
      linkedin: 'https://linkedin.com/company/northwind-labs',
      x: 'https://x.com/northwindlabs',
    },
    metadata: {},
  },
  {
    slug: 'medha-health',
    name: 'Medha Health',
    tagline: 'Clinical records that follow the patient, not the hospital.',
    description:
      'Medha Health gives clinicians one view of a patient across every hospital they have '
      + 'visited. We handle consent, de-duplication and the messy business of matching records '
      + 'written by twelve different systems. Used in 140 hospitals across seven states, with '
      + 'the patient holding the key to every record we hold.',
    industry: 'healthcare',
    companySize: '201-500',
    foundedYear: 2016,
    website: 'https://medhahealth.example.com',
    logoUrl: '',
    coverUrl: '',
    location: 'Hyderabad, Telangana',
    city: 'Hyderabad',
    country: 'India',
    phone: '+91 40 6688 1400',
    email: 'contact@medhahealth.example.com',
    verified: true,
    status: 'active',
    followerCount: 5120,
    viewCount: 41_300,
    postCount: 34,
    jobCount: 12,
    socialLinks: { linkedin: 'https://linkedin.com/company/medha-health' },
    metadata: {},
  },
  {
    slug: 'terra-freight',
    name: 'Terra Freight',
    tagline: 'Full-truckload movement, priced before the truck leaves.',
    description:
      'Terra Freight runs long-haul road freight across the western corridor with pricing that '
      + 'is quoted, fixed and honoured. Fifteen hundred trucks on the network, live tracking on '
      + 'every load, and settlement to the driver within 48 hours of delivery.',
    industry: 'logistics',
    companySize: '501-1000',
    foundedYear: 2014,
    website: 'https://terrafreight.example.com',
    logoUrl: '',
    coverUrl: '',
    location: 'Pune, Maharashtra',
    city: 'Pune',
    country: 'India',
    phone: '+91 20 6720 9100',
    email: 'ops@terrafreight.example.com',
    verified: false,
    status: 'active',
    followerCount: 1290,
    viewCount: 8_740,
    postCount: 9,
    jobCount: 4,
    socialLinks: { linkedin: 'https://linkedin.com/company/terra-freight' },
    metadata: {},
  },
  {
    slug: 'atlas-studio',
    name: 'Atlas Studio',
    tagline: 'Brand and product design for companies with something to prove.',
    description:
      'A studio of eleven — designers, writers and one very patient producer. We take on four '
      + 'engagements a year and stay on each one long enough to see it ship. Identity, product '
      + 'design and the design systems that keep both alive after we leave.',
    industry: 'consulting',
    companySize: '11-50',
    foundedYear: 2021,
    website: 'https://atlasstudio.example.com',
    logoUrl: '',
    coverUrl: '',
    location: 'Mumbai, Maharashtra',
    city: 'Mumbai',
    country: 'India',
    phone: '+91 22 4890 3300',
    email: 'studio@atlasstudio.example.com',
    verified: false,
    status: 'active',
    followerCount: 760,
    viewCount: 5_210,
    postCount: 22,
    jobCount: 2,
    socialLinks: {
      instagram: 'https://instagram.com/atlasstudio',
      linkedin: 'https://linkedin.com/company/atlas-studio',
    },
    metadata: {},
  },
  {
    slug: 'kavach-legal',
    name: 'Kavach Legal',
    tagline: 'Contract review for teams without a legal department.',
    description:
      'Kavach Legal reviews commercial contracts on a fixed fee and a two-day turnaround. '
      + 'Twenty-six lawyers, a standing playbook per contract type, and a redline you can send '
      + 'to the other side without rewriting it first. Regulated practice, ordinary language.',
    industry: 'legal',
    companySize: '11-50',
    foundedYear: 2020,
    website: 'https://kavachlegal.example.com',
    logoUrl: '',
    coverUrl: '',
    location: 'New Delhi, Delhi',
    city: 'New Delhi',
    country: 'India',
    phone: '+91 11 4055 7700',
    email: 'desk@kavachlegal.example.com',
    verified: true,
    status: 'active',
    followerCount: 1680,
    viewCount: 11_900,
    postCount: 15,
    jobCount: 3,
    socialLinks: { linkedin: 'https://linkedin.com/company/kavach-legal' },
    metadata: {},
  },
  {
    slug: 'saanjh-learning',
    name: 'Saanjh Learning',
    tagline: 'Vocational training that ends in a job, or it is free.',
    description:
      'Saanjh Learning trains electricians, fitters and CNC operators in twelve-week cohorts, '
      + 'with the placement written into the enrolment. Eighty-one per cent of our 2025 cohorts '
      + 'were placed within sixty days. Employers pay on placement; students pay nothing until '
      + 'they are earning.',
    industry: 'education',
    companySize: '51-200',
    foundedYear: 2018,
    website: 'https://saanjhlearning.example.com',
    logoUrl: '',
    coverUrl: '',
    location: 'Ahmedabad, Gujarat',
    city: 'Ahmedabad',
    country: 'India',
    phone: '+91 79 6612 4800',
    email: 'admissions@saanjhlearning.example.com',
    verified: false,
    status: 'active',
    followerCount: 3450,
    viewCount: 27_800,
    postCount: 41,
    jobCount: 6,
    socialLinks: {
      linkedin: 'https://linkedin.com/company/saanjh-learning',
      youtube: 'https://youtube.com/@saanjhlearning',
    },
    metadata: {},
  },
];

(async () => {
  const users = await getStoredUsers();
  const owner = users.find((u) => u.isActive !== false) ?? users[0];
  if (!owner) {
    console.log('No accounts on this instance — a page with no owner cannot be opened or edited.');
    process.exit(1);
  }

  const store = await readJsonFile<Store>(businessPagesPath, EMPTY);
  const existing = new Set(store.pages.map((p) => p.slug));
  const now = new Date();

  let added = 0;
  SEED.forEach((seed, i) => {
    if (existing.has(seed.slug)) {
      console.log(`  · ${seed.name} — already here, left alone`);
      return;
    }
    /* Staggered by a day each so "newest" is a real order rather than six
       pages sharing one timestamp. */
    const created = new Date(now.getTime() - (SEED.length - i) * 86_400_000).toISOString();
    store.pages.push({
      ...seed,
      id: randomUUID(),
      ownerUserId: owner.id,
      createdAt: created,
      updatedAt: created,
    });
    added += 1;
    console.log(`  ✓ ${seed.name}`);
  });

  if (added === 0) {
    console.log('\nNothing to add — all six are already on this instance.');
    return;
  }

  await writeJsonFile(businessPagesPath, store);
  console.log(`\n${added} business page${added === 1 ? '' : 's'} added, owned by ${owner.email}.`);
  console.log(`Total on this instance: ${store.pages.length}`);
})();
