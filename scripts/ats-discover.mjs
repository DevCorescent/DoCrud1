/**
 * ATS discovery probe — which supported provider (if any) does a company use?
 *
 * READ-ONLY and WRITE-NOTHING. It issues ONE public, unauthenticated GET per
 * candidate (provider, slug) pair, sequentially, with a delay between requests.
 * It touches no database and imports no application write path.
 *
 * It does NOT invent endpoints: it probes ONLY the fixed public API hosts the
 * existing adapters already use, and reports the literal HTTP status plus the
 * job count the endpoint returned. A candidate that does not answer is reported
 * as a miss, never as a source.
 *
 *   node scripts/ats-discover.mjs            # full list
 *   node scripts/ats-discover.mjs greenhouse # one provider
 */
const DELAY_MS = Number(process.env.PROBE_DELAY_MS ?? 700);
const TIMEOUT_MS = 15_000;
const UA = 'DoCrudJobBot/1.0 (+ats-source-discovery; contact via site)';

/* Candidate slugs per company. Derived from the company name, then VERIFIED by
   the probe — a candidate that 404s is discarded, never recorded. */
const COMPANIES = {
  Google: ['google'], Wipro: ['wipro'], Infosys: ['infosys'], TCS: ['tcs', 'tataconsultancyservices'],
  Accenture: ['accenture'], Microsoft: ['microsoft'], Amazon: ['amazon'], Deloitte: ['deloitte'],
  IBM: ['ibm'], HCLTech: ['hcltech', 'hcl'], 'Tech Mahindra': ['techmahindra'],
  Capgemini: ['capgemini'], Cognizant: ['cognizant'], EY: ['ey', 'ernstyoung'], KPMG: ['kpmg'],
  PwC: ['pwc'], Oracle: ['oracle'], SAP: ['sap'], Adobe: ['adobe'], Salesforce: ['salesforce'],
  NVIDIA: ['nvidia'], Intel: ['intel'], JPMorgan: ['jpmorgan', 'jpmorganchase'],
  'Goldman Sachs': ['goldmansachs'], 'Morgan Stanley': ['morganstanley'], Cisco: ['cisco'],
  Dell: ['dell'], HP: ['hp'], Qualcomm: ['qualcomm'], Siemens: ['siemens'], Samsung: ['samsung'],
  Uber: ['uber'], Airbnb: ['airbnb'], Meta: ['meta', 'facebook'], Apple: ['apple'],
  Netflix: ['netflix'], LinkedIn: ['linkedin'], Stripe: ['stripe'], Atlassian: ['atlassian'],
  ServiceNow: ['servicenow'], Broadcom: ['broadcom', 'vmware'], PayPal: ['paypal'], Visa: ['visa'],
  Mastercard: ['mastercard'], 'American Express': ['americanexpress', 'amex'], Walmart: ['walmart'],
  Flipkart: ['flipkart'], Myntra: ['myntra'], Swiggy: ['swiggy'], Zomato: ['zomato'],
  Razorpay: ['razorpay', 'razorpaysoftwareprivatelimited'], Groww: ['groww'], PhonePe: ['phonepe'],
  CRED: ['cred', 'dreamplug'], Meesho: ['meesho'], Freshworks: ['freshworks'], Zoho: ['zoho'],
  BrowserStack: ['browserstack'], Postman: ['postman'], Atlan: ['atlan'], Druva: ['druva'],
  MindTickle: ['mindtickle'],
};

/* Only the providers this codebase already has a verified adapter for, at the
   exact public host that adapter uses. */
const PROBES = {
  greenhouse: (s) => ({ url: `https://boards-api.greenhouse.io/v1/boards/${s}/jobs`,
    count: (j) => Array.isArray(j.jobs) ? j.jobs.length : null }),
  lever: (s) => ({ url: `https://api.lever.co/v0/postings/${s}?mode=json&limit=100`,
    count: (j) => Array.isArray(j) ? j.length : null }),
  ashby: (s) => ({ url: `https://api.ashbyhq.com/posting-api/job-board/${s}`,
    count: (j) => Array.isArray(j.jobs) ? j.jobs.length : null }),
  smartrecruiters: (s) => ({ url: `https://api.smartrecruiters.com/v1/companies/${s}/postings?limit=100`,
    count: (j) => typeof j.totalFound === 'number' ? j.totalFound
      : Array.isArray(j.content) ? j.content.length : null }),
  workable: (s) => ({ url: `https://apply.workable.com/api/v1/widget/accounts/${s}?details=true`,
    count: (j) => Array.isArray(j.jobs) ? j.jobs.length : null }),
  recruitee: (s) => ({ url: `https://${s}.recruitee.com/api/offers/`,
    count: (j) => Array.isArray(j.offers) ? j.offers.length : null }),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe(provider, slug) {
  const { url, count } = PROBES[provider](slug);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: ctl.signal });
    if (res.status === 429) return { status: 429, jobs: null };
    if (!res.ok) return { status: res.status, jobs: null };
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { return { status: res.status, jobs: null, note: 'non-json' }; }
    return { status: res.status, jobs: count(json) };
  } catch (e) {
    return { status: 0, jobs: null, note: e.name === 'AbortError' ? 'timeout' : 'neterr' };
  } finally { clearTimeout(timer); }
}

const only = process.argv[2];
const providers = only ? [only] : Object.keys(PROBES);
const hits = [];
let requests = 0;

for (const [company, slugs] of Object.entries(COMPANIES)) {
  for (const provider of providers) {
    for (const slug of slugs) {
      const r = await probe(provider, slug);
      requests += 1;
      await sleep(DELAY_MS);
      if (r.status === 200 && r.jobs !== null && r.jobs > 0) {
        hits.push({ company, provider, slug, jobs: r.jobs });
        console.log(`HIT  ${String(r.jobs).padStart(6)}  ${provider}:${slug}  (${company})`);
      } else if (r.status === 429) {
        console.log(`RATE-LIMITED ${provider}:${slug} — backing off 10s`);
        await sleep(10_000);
      }
    }
  }
}

console.log(`\n--- ${hits.length} verified boards from ${requests} requests ---`);
const byProv = {};
for (const h of hits) (byProv[h.provider] ??= []).push(h);
for (const [p, list] of Object.entries(byProv)) {
  const total = list.reduce((a, b) => a + b.jobs, 0);
  console.log(`${p}: ${list.length} boards, ${total} jobs`);
  console.log(`  ${list.map((h) => `${h.slug}|${h.company}`).join(',')}`);
}
