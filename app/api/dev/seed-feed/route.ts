export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getDbPool, getMongoDb } from '@/lib/server/database';
import { saveFileTransfers, getFileTransfers } from '@/lib/server/file-transfers';
import type { SecureFileTransfer } from '@/types/document';

/** All mock feed items — seeded into file_transfers so the feed renders. */
const SEED_ITEMS = [
  /* News */
  { id:'n1', category:'news', badge:'Breaking', title:'Reliance Jio Launches JioSpace Satellite Internet Across 1,200 Rural Districts', byline:'Economic Times', body:'JioSpace will deliver broadband connectivity to over 6 crore households in Tier-3 and rural areas by Q2 2025, powered by 28 low-orbit satellites in partnership with ISRO.', chips:['JioSpace','satellite internet','rural connectivity','ISRO'], postedAt:'2026-05-12T06:00:00Z' },
  { id:'n2', category:'news', badge:'Markets', title:"SEBI Approves India's First Domestic ETF for Listed AI Companies", byline:'Mint', body:'The Securities & Exchange Board of India has greenlit a first-of-its-kind domestic ETF tracking 28 publicly listed AI and deeptech firms.', chips:['SEBI','ETF','AI companies','deeptech'], postedAt:'2026-05-12T04:00:00Z' },
  { id:'n3', category:'news', badge:'M&A', title:'Tata Group Acquires Singapore Fintech for ₹2,400 Crore', byline:'Business Standard', body:'Tata Capital has completed the acquisition of Singapore-headquartered PaySprint, expanding its Southeast Asia footprint in embedded finance.', chips:['Tata','acquisition','fintech','embedded finance'], postedAt:'2026-05-12T01:00:00Z' },
  { id:'n4', category:'news', badge:'Policy', title:'RBI Issues New Framework for Real-Time Cross-Border UPI Payments', byline:'LiveMint', body:'The Reserve Bank of India has released comprehensive guidelines for interoperable UPI-based cross-border transfers covering 14 countries.', chips:['RBI','UPI','cross-border payments','policy'], postedAt:'2026-05-11T10:00:00Z' },
  { id:'n5', category:'news', badge:'Startup', title:'Zepto Raises $340M Series F at $5B Valuation', byline:'TechCrunch India', body:"Zepto's latest round led by General Atlantic and Lightspeed values the quick-commerce pioneer at $5 billion.", chips:['Zepto','fundraising','quick-commerce','startup'], postedAt:'2026-05-10T08:00:00Z' },
  { id:'n6', category:'news', badge:'Budget', title:'Union Budget 2026: ₹80,000 Crore Allocated for Digital India Phase III', byline:'Hindustan Times', body:'Finance Minister Nirmala Sitharaman announced a record ₹80,000 crore outlay for Digital India Phase III.', chips:['Union Budget','Digital India','government','policy'], postedAt:'2026-05-09T06:00:00Z' },

  /* Articles */
  { id:'a1', category:'article', badge:'Editorial', title:'How Bengaluru Startups Are Quietly Rewriting Global SaaS Playbooks', byline:'Saurabh Mukherjea · Marcellus Investment', body:"India's SaaS founders aren't copying Silicon Valley anymore — they're building products that global enterprises actually prefer.", chips:['SaaS','Bengaluru','startups','global'], postedAt:'2026-05-12T05:00:00Z' },
  { id:'a2', category:'article', badge:'Commerce', title:"The Meesho Effect: Why Social Commerce Will Define India's Next Wave", byline:'Aparna Jain', body:"Meesho's reseller model has unlocked 140M users who had never shopped online before.", chips:['Meesho','social commerce','India','ecommerce'], postedAt:'2026-05-11T09:00:00Z' },
  { id:'a3', category:'article', badge:'AI', title:"Sarvam AI Is Building India's First Full-Stack LLM in 22 Languages", byline:'Vivek Seshadri', body:"Sarvam AI's mission is radical: train foundational AI models from scratch using Indic-language data.", chips:['Sarvam AI','LLM','Indic languages','AI'], postedAt:'2026-05-08T10:00:00Z' },
  { id:'a4', category:'article', badge:'Design', title:'Designing for Bharat: Why 800M Users Need a Different UX Playbook', byline:'Priya Ramesh', body:'Bandwidth constraints, feature phone users, multilingual inputs, and trust patterns unique to India demand different UX decisions.', chips:['UX design','Bharat','multilingual','mobile'], postedAt:'2026-05-09T08:00:00Z' },

  /* Documents */
  { id:'d1', category:'document', badge:'Official', title:'DPDP Act 2023 — Enterprise Compliance Handbook, 2nd Edition', byline:'Legal · 64 pages · PDF', body:'Comprehensive guide covering Data Principal rights, Data Fiduciary obligations, consent frameworks, and breach notification timelines.', chips:['DPDP Act','compliance','data privacy','enterprise'], postedAt:'2026-05-12T07:00:00Z' },
  { id:'d2', category:'document', badge:'Tax', title:'GST Annual Return Filing Guide FY 2024–25', byline:'Tax · 38 pages · PDF', body:'Step-by-step GSTR-9 and GSTR-9C filing guide with screenshots, reconciliation templates, and common error fixes.', chips:['GST','GSTR-9','annual return','tax filing'], postedAt:'2026-05-11T06:00:00Z' },
  { id:'d3', category:'document', badge:'Legal', title:'Model NDA Template — Bilateral & Unilateral, India-Law Governed', byline:'Legal · 8 pages · DOCX · Free', body:'Dual-template NDA with GDPR + DPDP compatible confidentiality clauses, auto-fill fields for parties.', chips:['NDA','template','legal','confidentiality'], postedAt:'2026-05-09T11:00:00Z' },
  { id:'d4', category:'document', badge:'Finance', title:'GST Invoice Format Pack — 6 Clean Templates for SMBs', byline:'Finance · 6 templates · XLSX + PDF', body:'Print-ready GST invoice formats with UPI QR code, GSTIN field, HSN/SAC codes, and e-way bill reference column.', chips:['GST invoice','template','SMB','UPI QR'], postedAt:'2026-05-07T09:00:00Z' },

  /* Jobs */
  { id:'j1', category:'job', badge:'Hybrid · Full-time', title:'Senior Product Designer — Design Systems', byline:'Razorpay · Design · Bengaluru', body:"Own the design language across Razorpay's merchant dashboard and payment flows — used by 10M+ businesses across India.", chips:['product designer','design systems','Razorpay','Bengaluru','₹35–55 LPA'], postedAt:'2026-05-12T06:00:00Z' },
  { id:'j2', category:'job', badge:'Remote · Full-time', title:'Staff Backend Engineer (Go)', byline:'CRED · Engineering · ₹45–70 LPA', body:"Build the distributed financial infrastructure powering CRED's credit, reward, and lending products.", chips:['backend engineer','Go','CRED','remote','₹45–70 LPA'], postedAt:'2026-05-11T07:00:00Z' },
  { id:'j3', category:'job', badge:'Hybrid · Full-time', title:'ML Engineer — Fraud & Risk', byline:'PhonePe · Data Science · Bengaluru', body:'Build real-time fraud detection models protecting ₹80,000 crore in monthly UPI transaction volume.', chips:['ML engineer','fraud detection','PhonePe','Python','PyTorch'], postedAt:'2026-05-09T08:00:00Z' },

  /* Events */
  { id:'ev1', category:'event', badge:'Conference', title:'React India 2026 — The Largest React Conference in Asia', byline:'React India · NSCI Dome, Mumbai · Sep 19–21, 2026', body:'3-day immersive React conference with 80+ speakers, 3,000 attendees, workshops on Next.js, RSC, and React Native.', chips:['React','Next.js','conference','Mumbai','TypeScript'], postedAt:'2026-05-12T08:00:00Z' },
  { id:'ev2', category:'event', badge:'Meetup', title:'Bengaluru AI/ML Monthly — May Edition', byline:'GDG Bengaluru · IKEA Experience Centre · May 25, 2026', body:'Monthly gathering of AI/ML engineers. This month: LLM fine-tuning on Indic datasets, live demos, and networking dinner.', chips:['AI/ML','LLMs','Bengaluru','meetup','free'], postedAt:'2026-05-11T09:00:00Z' },
  { id:'ev3', category:'event', badge:'Summit', title:'India SaaS Summit 2026 — Building Global from Bharat', byline:'SaaSBOOMi · ITC Grand Chola, Chennai · Jul 11–12, 2026', body:"India's premier SaaS gathering — 1,200 founders, 150 investors, 60 workshops.", chips:['SaaS','summit','founders','Chennai','investors'], postedAt:'2026-05-10T07:00:00Z' },
  { id:'ev4', category:'event', badge:'Workshop', title:'GST Filing Masterclass for CA Firms — Online Batch', byline:'Taxmann · Online (Zoom) · Jun 7, 2026', body:'Full-day live workshop on GSTR-9, GSTR-9C, ITC reconciliation and the new e-invoice mandates.', chips:['GST','workshop','CA firms','GSTR-9','online'], postedAt:'2026-05-09T10:00:00Z' },

  /* Hackathons */
  { id:'h1', category:'hackathon', badge:'₹50L Prize', title:'HackIndia 2026 — Build AI for the Next Billion', byline:'HackIndia Foundation · Pan-India · Jun 14–16, 2026', body:"India's largest student hackathon — 50,000 registrations, ₹50 lakh prize pool, tracks in AI/ML, FinTech, HealthTech, and GovTech.", chips:['hackathon','AI/ML','students','₹50L prize','HackIndia'], postedAt:'2026-05-12T09:00:00Z' },
  { id:'h2', category:'hackathon', badge:'₹10L Prize', title:'Smart India Hackathon 2026 — Government Problem Statements', byline:'Ministry of Education · IITs & NITs · Aug 22–23, 2026', body:'Official GoI hackathon with 1,000+ problem statements from 50+ central ministries.', chips:['hackathon','government','students','IIT','NIT'], postedAt:'2026-05-11T08:00:00Z' },
  { id:'h3', category:'hackathon', badge:'$10k Prize', title:'Devfolio Build for Bharat — Web3 Edition', byline:'Devfolio + Polygon · Online · Jun 28 – Jul 6, 2026', body:'10-day async hackathon focused on DeFi, NFT utility, and blockchain for public services.', chips:['Web3','DeFi','hackathon','Polygon','blockchain'], postedAt:'2026-05-10T10:00:00Z' },
  { id:'h4', category:'hackathon', badge:'₹5L Prize', title:'Razorpay Raze The Hackathon 5.0', byline:'Razorpay · Bengaluru HQ · Jun 7–8, 2026', body:'24-hour in-person hackathon at Razorpay HQ. Build the future of payments, lending, and financial infrastructure.', chips:['hackathon','fintech','payments','Razorpay','Bengaluru'], postedAt:'2026-05-09T07:00:00Z' },

  /* Tutorials */
  { id:'tu1', category:'tutorial', badge:'Beginner', title:'Build Your First REST API with Go and Gin — Complete Guide for Beginners', byline:'Nikhil Sharma · 12 min read', body:'Go is fast, simple, and perfect for APIs. This guide walks you from zero to a fully working REST API with auth, database, and deployment.', chips:['Go','REST API','Gin','PostgreSQL','beginner'], postedAt:'2026-05-12T07:00:00Z' },
  { id:'tu2', category:'tutorial', badge:'Intermediate', title:'Mastering Tailwind CSS v4 — The Complete Migration and New Features Guide', byline:'Anjali Singh · 18 min read', body:'Tailwind v4 introduces a brand new engine, cascade layers, and CSS-first config. This guide covers everything you need to upgrade.', chips:['Tailwind CSS','v4','CSS','migration','frontend'], postedAt:'2026-05-11T09:00:00Z' },
  { id:'tu3', category:'tutorial', badge:'Advanced', title:'Implementing DPDP-Compliant Consent Management in a SaaS App — From Scratch', byline:'Rahul Gupta · 24 min read', body:'Walk through building a DPDP Act-compliant consent management module: consent capture, withdrawal, audit logs, and breach notification hooks.', chips:['DPDP','compliance','Node.js','privacy','SaaS'], postedAt:'2026-05-10T08:00:00Z' },
  { id:'tu4', category:'tutorial', badge:'Intermediate', title:'Deploy Next.js 15 to Fly.io with Zero Downtime — Detailed Walkthrough', byline:'Siddharth Joshi · 15 min read', body:"Fly.io is the best alternative to Vercel for self-hosted Next.js. This guide covers Docker, health checks, secrets, and blue-green deployments.", chips:['Next.js','Fly.io','Docker','DevOps','deployment'], postedAt:'2026-05-09T10:00:00Z' },

  /* Threads */
  { id:'th1', category:'thread', badge:'Thread', title:"Why I stopped using Redux in 2026 — and what I use instead (7-part thread)", byline:'Arjun Nair · Frontend Architect', body:"Redux was the answer to a problem we no longer have. In 2026, with React Server Components, Zustand, and TanStack Query, you almost never need it.", chips:['React','Redux','Zustand','frontend','architecture'], postedAt:'2026-05-12T08:00:00Z' },
  { id:'th2', category:'thread', badge:'Thread', title:'How I went from ₹4 LPA to ₹42 LPA in 4 years — without a CS degree (12-part thread)', byline:'Vikram Soni · Self-taught Engineer', body:"In 2022, I was making ₹4 LPA doing manual QA at a Pune startup. Today I'm a senior engineer at a Series-B.", chips:['career growth','self-taught','salary','software engineer'], postedAt:'2026-05-11T07:00:00Z' },
  { id:'th3', category:'thread', badge:'Thread', title:"India's most underrated cities for remote tech workers — a ranked breakdown", byline:'Meera Iyer · Tech Writer', body:'Everyone talks about Bengaluru, Pune, and Hyderabad. But there are 6 cities that offer better quality of life, lower cost, and a growing community.', chips:['remote work','cities','India','tech jobs'], postedAt:'2026-05-10T09:00:00Z' },

  /* Videos */
  { id:'vi1', category:'video', badge:'Tutorial', title:'Build a Full-Stack SaaS with Next.js 15, Supabase & Stripe in 4 Hours', byline:'Hrishikesh Kale · YouTube · 4h 12m', body:'Complete walkthrough: auth, database, payments, email, deployment. All free-tier. No paid courses.', chips:['Next.js 15','Supabase','Stripe','full-stack','video tutorial'], postedAt:'2026-05-12T06:00:00Z' },
  { id:'vi2', category:'video', badge:'Talk', title:'Scaling to 10M users on ₹0 infrastructure cost — IndiaFOSS 2026 Keynote', byline:'Tanmay Bakshi · IndiaFOSS · YouTube · 52m', body:'How we used Cloudflare Workers, Turso, and edge caching to serve 10M users without a single EC2 instance.', chips:['Cloudflare','edge computing','FOSS','architecture','scaling'], postedAt:'2026-05-11T08:00:00Z' },
  { id:'vi3', category:'video', badge:'Demo', title:'Docrud AI Document Generator — Full Product Demo', byline:'Docrud Team · Product Demo · 18m', body:'Full walkthrough of the AI-powered document generator, template editor, eSign, and workspace sharing.', chips:['Docrud','AI','document generator','eSign','demo'], postedAt:'2026-05-10T10:00:00Z' },

  /* Posts */
  { id:'po1', category:'post', badge:'Post', title:'Shipped our new dashboard — 6 months of work in one release', byline:'Kushagra Sharma · Docrud', body:'Every pixel debated, every API endpoint stress-tested. This is what building in public looks like. The new workspace is live for all users.', chips:['product launch','buildinpublic','dashboard','Docrud'], postedAt:'2026-05-12T08:30:00Z' },

  /* Milestones */
  { id:'mi1', category:'milestone', badge:'Achievement', title:"We just crossed ₹1 Crore ARR — bootstrapped, profitable, and building from Jaipur", byline:'Tanmay Sharma · Founder, FinSight', body:"18 months ago I quit my Deloitte job and started FinSight in a co-working space in Jaipur. Today we crossed ₹1 Crore ARR. No VC money. No fancy office.", chips:['bootstrapped','SaaS','ARR','startup','Jaipur'], postedAt:'2026-05-12T09:00:00Z' },
  { id:'mi2', category:'milestone', badge:'Career', title:"Promoted to Principal Engineer at 27 — here's what actually helped", byline:'Divya Menon · Principal Engineer, Swiggy', body:"5 years ago I joined Swiggy as a junior. Yesterday I got promoted to Principal Engineer — the youngest in the company's history.", chips:['career','engineering','promotion','Swiggy','milestone'], postedAt:'2026-05-11T08:00:00Z' },

  /* Charts */
  { id:'ch1', category:'chart', badge:'Market Data', title:'India SaaS ARR Growth by Vertical — 2023 to 2026', byline:'SaaSBOOMi Research', body:'FinTech SaaS grew 3.4× while HR-tech and EdTech saw consolidation. B2B infrastructure quietly became the biggest segment.', chips:['SaaS','ARR','market data','fintech','India'], postedAt:'2026-05-12T05:00:00Z' },
  { id:'ch2', category:'chart', badge:'Hiring Trends', title:'Tech Hiring Recovery Index — Jan to May 2026', byline:'LinkedIn India', body:'After 18 months of contraction, tech hiring has rebounded 68% YoY. AI/ML and cloud roles leading recovery.', chips:['tech hiring','AI/ML','cloud','market data','recovery'], postedAt:'2026-05-10T07:00:00Z' },
] as const;

// Picsum photo IDs chosen per category for thematic consistency
const CATEGORY_PHOTO_IDS: Record<string, number> = {
  news:       10,
  article:    20,
  document:   30,
  job:        40,
  event:      50,
  hackathon:  60,
  tutorial:   70,
  thread:     80,
  video:      90,
  post:       100,
  milestone:  110,
  chart:      120,
};

function toFileTransfer(item: typeof SEED_ITEMS[number], index: number): SecureFileTransfer {
  const authorName = item.byline.split(' · ')[0].trim();
  const photoId = (CATEGORY_PHOTO_IDS[item.category] ?? 10) + (index % 5);
  return {
    id: item.id,
    shareId: `share-${item.id}`,
    title: item.title,
    fileName: `${item.id}.txt`,
    mimeType: 'text/plain',
    dataUrl: '',
    sizeInBytes: 0,
    notes: item.body,
    directoryVisibility: 'public',
    directoryCategory: item.category,
    directoryTags: [item.badge, ...(item.chips ?? [])],
    authMode: 'public',
    uploadedBy: 'docrud@docrud.com',
    uploadedByName: authorName,
    uploadedByUserId: 'system',
    avatarUrl: `https://i.pravatar.cc/128?img=${(index % 70) + 1}`,
    thumbnailUrl: `https://picsum.photos/id/${photoId}/800/450`,
    createdAt: item.postedAt,
    updatedAt: item.postedAt,
    openCount: 0,
    downloadCount: 0,
    accessEvents: [],
    likesCount: 0,
    likedBy: [],
    trendCount: 0,
    trendedBy: [],
    interestedCount: 0,
    interestedBy: [],
    commentsCount: 0,
    viewCount: 0,
    moderationStatus: 'active' as any,
  };
}

/** Dev-only: seeds mock feed items into the file_transfers collection / JSON fallback. */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  try {
    const newDocs = SEED_ITEMS.map((item, i) => toFileTransfer(item, i));

    if (getDbPool()) {
      const db = await getMongoDb();
      if (!db) return NextResponse.json({ error: 'MongoDB not connected' }, { status: 500 });

      const col = db.collection('file_transfers');

      // Only insert items that don't already exist
      const existingIds = await col.distinct('_id');
      const toInsert = newDocs.filter((d) => !existingIds.includes(d.id as any));

      if (toInsert.length > 0) {
        await (col as any).bulkWrite(
          toInsert.map((doc) => ({
            insertOne: { document: { ...doc, _id: doc.id } },
          })),
        );
      }

      return NextResponse.json({ ok: true, inserted: toInsert.length, skipped: newDocs.length - toInsert.length });
    } else {
      // JSON file fallback
      const existing = await getFileTransfers();
      const existingIds = new Set(existing.map((t) => t.id));
      const toAdd = newDocs.filter((d) => !existingIds.has(d.id));
      await saveFileTransfers([...existing, ...toAdd]);
      return NextResponse.json({ ok: true, inserted: toAdd.length, skipped: newDocs.length - toAdd.length });
    }
  } catch (err) {
    console.error('[dev/seed-feed]', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
