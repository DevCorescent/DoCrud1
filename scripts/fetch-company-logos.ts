/**
 * Vendors company logos into public/company-logos so the Jobs feed renders with
 * ZERO third-party requests.
 *
 * Only companies listed here are fetched, and each domain is one a human
 * confirmed — never derived from a job's applyUrl (that host is the ATS, not the
 * employer) and never guessed from a display name. A guessed logo would be
 * fabricated company information.
 *
 * Run:  npx tsx scripts/fetch-company-logos.ts
 * Then add/keep the matching entry in lib/company-logos.ts.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** slug → verified official domain. */
const COMPANIES: Record<string, string> = {
  ramp: 'ramp.com',
  postman: 'postman.com',
  notion: 'notion.so',
  vanta: 'vanta.com',
  druva: 'druva.com',
  linear: 'linear.app',
  razorpay: 'razorpay.com',
  mindtickle: 'mindtickle.com',
  posthog: 'posthog.com',
  groww: 'groww.in',
  atlan: 'atlan.com',
};

const OUT_DIR = path.join(process.cwd(), 'public', 'company-logos');

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const [slug, domain] of Object.entries(COMPANIES)) {
    const url = `https://www.google.com/s2/favicons?sz=256&domain=${domain}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`skip ${slug}: HTTP ${res.status}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      // Extension follows the real bytes: a mislabelled file confuses caching.
      const ext = buf.subarray(0, 3).toString('hex') === 'ffd8ff' ? 'jpg' : 'png';
      const file = path.join(OUT_DIR, `${slug}.${ext}`);
      await writeFile(file, buf);
      console.log(`${slug.padEnd(12)} ${domain.padEnd(18)} ${buf.length} bytes → ${slug}.${ext}`);
    } catch (error) {
      console.warn(`skip ${slug}:`, error instanceof Error ? error.message : error);
    }
  }
}

void main();
