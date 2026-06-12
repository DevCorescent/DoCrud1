export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { getProfileData, UserProfileData } from '@/lib/server/user-profiles';

/* ─── HTML resume template ────────────────────────────────────────────────── */
function buildResumeHtml(opts: {
  name: string;
  email: string;
  profile: UserProfileData;
  isEmpty: boolean; // if profile has almost no data, show sample placeholders
}): string {
  const { name, email, profile, isEmpty } = opts;

  // Helpers
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const or = <T,>(val: T | null | undefined, fallback: T): T => (val != null && val !== '' ? val : fallback);

  const displayName  = esc(or(name,              isEmpty ? 'Your Full Name' : name));
  const displayEmail = esc(or(email,             isEmpty ? 'your.email@example.com' : email));
  const headline     = esc(or(profile.headline,  isEmpty ? 'Senior Product Designer at Razorpay' : ''));
  const location     = esc(or(profile.location,  isEmpty ? 'Bengaluru, India' : ''));
  const website      = esc(or(profile.website,   isEmpty ? 'https://yourportfolio.com' : ''));
  const linkedin     = esc(or(profile.socialLinks?.linkedin, isEmpty ? 'https://linkedin.com/in/yourhandle' : ''));
  const github       = esc(or(profile.socialLinks?.github,   isEmpty ? 'https://github.com/yourhandle'     : ''));
  const twitter      = esc(or(profile.socialLinks?.twitter,  ''));
  const bio          = esc(or(profile.bio, isEmpty
    ? 'Results-driven product designer with 6+ years of experience crafting intuitive digital experiences for fintech and SaaS products. I specialise in design systems, user research, and cross-functional collaboration to ship products that balance business goals with user needs.'
    : ''));

  const skills: string[] = (profile.skills && profile.skills.length > 0)
    ? profile.skills
    : (isEmpty ? ['Figma', 'Sketch', 'Adobe XD', 'Prototyping', 'User Research', 'Design Systems', 'HTML/CSS', 'SQL', 'Jira', 'Analytics'] : []);

  type ExpEntry = { title: string; company: string; period: string; desc?: string };
  const experience: ExpEntry[] = (profile.experience && profile.experience.length > 0)
    ? profile.experience
    : (isEmpty ? [
        { title: 'Senior Product Designer', company: 'Razorpay', period: 'Jan 2022 – Present', desc: 'Led design of the Payments v2 dashboard used by 500K+ merchants, reducing support tickets by 34% through improved UX clarity.' },
        { title: 'Product Designer', company: 'Flipkart', period: 'Jul 2019 – Dec 2021', desc: 'Designed end-to-end onboarding flows for Flipkart Seller Hub, increasing seller activation rate by 22% within Q1 2020.' },
        { title: 'UI/UX Design Intern', company: 'Zoho', period: 'Jan 2019 – Jun 2019', desc: 'Contributed to the redesign of Zoho CRM mobile app, improving task completion rate by 18% in A/B testing.' },
      ] : []);

  type EduEntry = { degree: string; school: string; year?: string };
  const education: EduEntry[] = (profile.education && profile.education.length > 0)
    ? profile.education
    : (isEmpty ? [
        { degree: 'B.Des. Visual Communication', school: 'National Institute of Design, Ahmedabad', year: '2019' },
        { degree: 'Higher Secondary — Science', school: 'Delhi Public School, Bengaluru', year: '2015' },
      ] : []);

  type AchEntry = { title: string; desc?: string };
  const achievements: AchEntry[] = (profile.achievements && profile.achievements.length > 0)
    ? profile.achievements
    : (isEmpty ? [
        { title: 'Best UX Design Award — Proto.io Design Awards 2023', desc: 'Recognised for the Razorpay Payments v2 dashboard redesign.' },
        { title: 'Speaker — Figma Config Asia 2022', desc: 'Presented "Scaling design systems for fintech products" to 1 200+ attendees.' },
        { title: 'Open Source Contributor — Design System Library', desc: 'Maintained a Figma component library with 2 000+ GitHub stars.' },
      ] : []);

  /* ── Section builders ── */
  const contactParts: string[] = [];
  if (displayEmail) contactParts.push(`<a href="mailto:${displayEmail}">${displayEmail}</a>`);
  if (location)     contactParts.push(location);
  if (website)      contactParts.push(`<a href="${website}">${website.replace(/^https?:\/\//, '')}</a>`);
  if (linkedin)     contactParts.push(`<a href="${linkedin}">linkedin.com/in/${linkedin.split('/in/')[1] ?? '…'}</a>`);
  if (github)       contactParts.push(`<a href="${github}">github.com/${github.split('github.com/')[1] ?? '…'}</a>`);
  if (twitter)      contactParts.push(`<a href="${twitter}">@${twitter.split('/').pop()}</a>`);

  const skillsHtml = skills.length > 0
    ? `<section class="section">
        <h2 class="section-title">Skills</h2>
        <div class="divider"></div>
        <div class="skills-grid">${skills.map(s => `<span class="skill-tag">${esc(s)}</span>`).join('')}</div>
      </section>`
    : '';

  const expHtml = experience.length > 0
    ? `<section class="section">
        <h2 class="section-title">Work Experience</h2>
        <div class="divider"></div>
        ${experience.map(e => `
          <div class="entry">
            <div class="entry-header">
              <div>
                <span class="entry-title">${esc(e.title)}</span>
                <span class="entry-company"> · ${esc(e.company)}</span>
              </div>
              <span class="entry-period">${esc(e.period)}</span>
            </div>
            ${e.desc ? `<p class="entry-desc">${esc(e.desc)}</p>` : ''}
          </div>`).join('')}
      </section>`
    : '';

  const eduHtml = education.length > 0
    ? `<section class="section">
        <h2 class="section-title">Education</h2>
        <div class="divider"></div>
        ${education.map(e => `
          <div class="entry">
            <div class="entry-header">
              <div>
                <span class="entry-title">${esc(e.degree)}</span>
                <span class="entry-company"> · ${esc(e.school)}</span>
              </div>
              ${e.year ? `<span class="entry-period">${esc(e.year)}</span>` : ''}
            </div>
          </div>`).join('')}
      </section>`
    : '';

  const achieveHtml = achievements.length > 0
    ? `<section class="section">
        <h2 class="section-title">Achievements &amp; Awards</h2>
        <div class="divider"></div>
        <ul class="achieve-list">
          ${achievements.map(a => `
            <li>
              <strong>${esc(a.title)}</strong>
              ${a.desc ? `<br/><span class="achieve-desc">${esc(a.desc)}</span>` : ''}
            </li>`).join('')}
        </ul>
      </section>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${displayName} — Resume</title>
<style>
/* ── Base ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: 11pt; }
body {
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  color: #111;
  background: #fff;
  line-height: 1.55;
}
a { color: #1a56db; text-decoration: none; }

/* ── Print strip ── */
.print-bar {
  position: sticky; top: 0; z-index: 99;
  background: #0d0d12;
  color: #fff;
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 24px;
  gap: 12px;
}
.print-bar p { font-size: 11px; color: rgba(255,255,255,0.5); }
.print-btn {
  display: flex; align-items: center; gap-6px;
  background: #fff; color: #0d0d12;
  border: none; border-radius: 8px;
  padding: 8px 18px; font-size: 12px; font-weight: 700;
  cursor: pointer; white-space: nowrap;
  letter-spacing: -0.01em;
}
.print-btn:hover { background: #f0f0f0; }

/* ── Resume page ── */
.page {
  max-width: 760px;
  margin: 32px auto;
  padding: 56px 56px 64px;
  background: #fff;
  box-shadow: 0 4px 40px rgba(0,0,0,.10);
  border-radius: 4px;
}

/* ── Header ── */
.header { margin-bottom: 24px; }
.name { font-size: 26pt; font-weight: 800; letter-spacing: -0.03em; line-height: 1.1; color: #0a0a0c; }
.headline-line { font-size: 11.5pt; color: #444; margin-top: 4px; font-weight: 500; }
.contact-line {
  margin-top: 8px; font-size: 9pt; color: #555;
  display: flex; flex-wrap: wrap; gap: 4px 16px;
}
.contact-line a { color: #1a56db; }

/* ── Sections ── */
.section { margin-bottom: 20px; }
.section-title {
  font-size: 8.5pt; font-weight: 800;
  letter-spacing: 0.18em; text-transform: uppercase;
  color: #888; margin-bottom: 5px;
}
.divider { border: none; border-top: 1.5px solid #e5e7eb; margin-bottom: 12px; }

/* ── Bio ── */
.bio { font-size: 10.5pt; color: #333; line-height: 1.65; }

/* ── Skills ── */
.skills-grid { display: flex; flex-wrap: wrap; gap: 5px 8px; }
.skill-tag {
  background: #f3f4f6; border: 1px solid #e5e7eb;
  border-radius: 4px; padding: 2px 9px;
  font-size: 9.5pt; color: #374151;
}

/* ── Experience / Education ── */
.entry { margin-bottom: 14px; }
.entry-header {
  display: flex; justify-content: space-between; align-items: baseline;
  gap: 12px; flex-wrap: wrap;
}
.entry-title { font-weight: 700; font-size: 10.5pt; color: #111; }
.entry-company { font-size: 10.5pt; color: #555; }
.entry-period { font-size: 9.5pt; color: #888; white-space: nowrap; flex-shrink: 0; }
.entry-desc { font-size: 10pt; color: #444; margin-top: 3px; line-height: 1.6; }

/* ── Achievements ── */
.achieve-list { list-style: none; padding: 0; }
.achieve-list li { margin-bottom: 9px; font-size: 10pt; color: #333; line-height: 1.6; padding-left: 14px; position: relative; }
.achieve-list li::before { content: '•'; position: absolute; left: 0; color: #9ca3af; }
.achieve-desc { color: #666; font-size: 9.5pt; }

/* ── Note box ── */
.note-box {
  margin-top: 32px; padding: 14px 18px;
  background: #fafafa; border: 1px dashed #d1d5db;
  border-radius: 6px; font-size: 9.5pt; color: #6b7280;
  line-height: 1.6;
}
.note-box strong { color: #374151; }

/* ── Print ── */
@media print {
  .print-bar, .note-box { display: none !important; }
  .page { margin: 0; padding: 0.6in 0.7in; box-shadow: none; border-radius: 0; max-width: none; }
  body { background: #fff; }
  a { color: #1a56db !important; text-decoration: none; }
  @page { margin: 0; size: A4; }
}
</style>
</head>
<body>

<!-- Instruction bar (hidden on print) -->
<div class="print-bar">
  <p>📄 Open in your browser · File → Print → <strong>Save as PDF</strong> for best results</p>
  <button class="print-btn" onclick="window.print()">⬇ Save as PDF</button>
</div>

<!-- Resume -->
<div class="page">

  <!-- Header -->
  <header class="header">
    <div class="name">${displayName}</div>
    ${headline ? `<div class="headline-line">${headline}</div>` : ''}
    <div class="contact-line">
      ${contactParts.join('<span style="color:#d1d5db">·</span>')}
    </div>
  </header>

  <!-- Professional Summary -->
  ${bio ? `<section class="section">
    <h2 class="section-title">Professional Summary</h2>
    <div class="divider"></div>
    <p class="bio">${bio}</p>
  </section>` : ''}

  <!-- Skills -->
  ${skillsHtml}

  <!-- Experience -->
  ${expHtml}

  <!-- Education -->
  ${eduHtml}

  <!-- Achievements -->
  ${achieveHtml}

  <!-- Guidance note (screen only) -->
  <div class="note-box">
    <strong>📌 This resume is optimised for Docrud AI parsing.</strong><br/>
    Every section label, date format (<em>Jan 2022 – Present</em>), and field order is designed for maximum extraction accuracy.
    Fill in your real details, then save as PDF using your browser and re-upload to Docrud for instant profile auto-fill.
    <br/><br/>
    <strong>Tips for best results:</strong> keep one column · use real dates · add descriptions to every role · include 10–20 skills.
  </div>

</div>
</body>
</html>`;
}

/* ─── Route handler ───────────────────────────────────────────────────────── */
export async function GET(_req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const [users, profile] = await Promise.all([
      getStoredUsers(),
      getProfileData(userId),
    ]);
    const user = users.find(u => u.id === userId);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Detect how complete the profile is
    const fieldsFilled = [
      profile.headline, profile.bio, profile.location,
      (profile.skills ?? []).length > 0,
      (profile.experience ?? []).length > 0,
      (profile.education ?? []).length > 0,
    ].filter(Boolean).length;
    const isEmpty = fieldsFilled < 2;

    const html = buildResumeHtml({
      name:    user.name ?? 'Your Name',
      email:   user.email,
      profile,
      isEmpty,
    });

    const safeName = (user.name ?? 'resume').replace(/[^a-z0-9]/gi, '-').toLowerCase();
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Open in browser (not download) so user can use browser's Print → Save as PDF
        'Content-Disposition': `inline; filename="${safeName}-resume-template.html"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[profile/sample-resume]', err);
    return NextResponse.json({ error: 'Failed to generate resume template.' }, { status: 500 });
  }
}
