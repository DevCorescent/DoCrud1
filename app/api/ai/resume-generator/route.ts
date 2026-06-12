import { NextRequest, NextResponse } from 'next/server';
import { generateAiText, getAiModelName, isAiConfigured } from '@/lib/server/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ResumeGeneratorResponse = {
  resume: string;
  provider: string;
  model: string;
  mode: 'ai' | 'fallback';
  headline: string;
  improvementsApplied: string[];
};

function buildFallbackResume(prompt: string, role: string, sourceText?: string) {
  const inferredRole = role.trim() || 'Target Role';
  const summarySource = prompt.trim() || 'Candidate profile details were not supplied.';
  const sourceSnippet = sourceText?.trim().slice(0, 1400) || '';

  return [
    inferredRole.toUpperCase(),
    '',
    'Full Name',
    'Email | Phone | LinkedIn | Location',
    '',
    'PROFESSIONAL SUMMARY',
    `Results-oriented ${inferredRole.toLowerCase()} candidate with experience across ownership, execution, communication, and measurable business support. Tailor the bullets below using your actual achievements and numbers.`,
    '',
    'CORE SKILLS',
    '- Stakeholder communication',
    '- Project coordination',
    '- Reporting and analysis',
    '- Process improvement',
    '- Documentation and execution',
    '',
    'EXPERIENCE',
    'Company Name | Role | Dates',
    '- Delivered measurable improvements using tools, reporting, and cross-functional collaboration.',
    '- Managed responsibilities tied to outcomes, timelines, or client/internal stakeholder needs.',
    '- Improved speed, quality, or accuracy through structured execution and ownership.',
    '',
    'PROJECTS',
    '- Project name: explain the business problem, your contribution, tools used, and result.',
    '',
    'EDUCATION',
    '- Degree | Institution | Year',
    '',
    'CERTIFICATIONS / LINKS',
    '- Add portfolio, GitHub, LinkedIn, or role-relevant credentials',
    '',
    'INPUT CONTEXT',
    summarySource,
    ...(sourceSnippet ? ['', 'SOURCE MATERIAL', sourceSnippet] : []),
  ].join('\n');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const prompt = String(body?.prompt || '').trim();
    const targetRole = String(body?.targetRole || '').trim();
    const sourceText = String(body?.sourceText || '').trim();
    const atsContext = String(body?.atsContext || '').trim();

    if (!prompt) {
      return NextResponse.json({ error: 'Tell the AI what kind of resume you want to generate.' }, { status: 400 });
    }

    if (!isAiConfigured()) {
      return NextResponse.json({
        resume: buildFallbackResume(prompt, targetRole, sourceText),
        provider: 'Fallback generator',
        model: 'local-resume-generator',
        mode: 'fallback',
        headline: `ATS-oriented draft for ${targetRole || 'your target role'}`,
        improvementsApplied: [
          'Structured the resume into recruiter-readable sections.',
          'Added stronger ATS headings for summary, skills, experience, and projects.',
          'Prepared the draft so measurable achievements can be inserted faster.',
        ],
      } satisfies ResumeGeneratorResponse);
    }

    try {
      const response = await generateAiText([
        {
          role: 'system',
          content: [
            'You create premium ATS-friendly resumes.',
            'Return plain text only, no markdown fences.',
            'Keep the structure clean, recruiter-friendly, and widely acceptable across companies and ATS systems.',
            'Use a classic ATS-safe format with standard headings only.',
            'Do not use tables, columns, icons, ratings, emoji, decorative separators, or unusual formatting.',
            'Use measurable bullet style where possible.',
            'Prefer clear section titles such as PROFESSIONAL SUMMARY, CORE SKILLS, EXPERIENCE, PROJECTS, EDUCATION, CERTIFICATIONS / LINKS.',
            'Optimize for maximum ATS readability, role relevance, and recruiter trust.',
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify({
            request: prompt,
            targetRole: targetRole || undefined,
            sourceText: sourceText || undefined,
            atsContext: atsContext || undefined,
            output: 'Generate a polished ATS-friendly resume draft with headings, summary, skills, experience bullets, projects, education, and links section. Start with a short one-line headline. After the resume draft, add a separator line "---IMPROVEMENTS---" followed by 3 to 5 concise bullet lines describing improvements applied.',
          }),
        },
      ]);

      const [resumePart, improvementsPart] = response.split('---IMPROVEMENTS---');
      const improvementsApplied = (improvementsPart || '')
        .split('\n')
        .map((line) => line.replace(/^[\-\u2022*\s]+/, '').trim())
        .filter(Boolean)
        .slice(0, 5);
      const cleanedResume = (resumePart || response).trim();
      const firstLine = cleanedResume.split('\n').map((line) => line.trim()).find(Boolean) || `ATS-oriented draft for ${targetRole || 'your target role'}`;

      return NextResponse.json({
        resume: cleanedResume,
        provider: 'Groq',
        model: getAiModelName(),
        mode: 'ai',
        headline: firstLine,
        improvementsApplied,
      } satisfies ResumeGeneratorResponse);
    } catch {
      return NextResponse.json({
        resume: buildFallbackResume(prompt, targetRole, sourceText),
        provider: 'Fallback generator',
        model: 'local-resume-generator',
        mode: 'fallback',
        headline: `ATS-oriented draft for ${targetRole || 'your target role'}`,
        improvementsApplied: [
          'Structured the resume into recruiter-readable sections.',
          'Added stronger ATS headings for summary, skills, experience, and projects.',
          'Prepared the draft so measurable achievements can be inserted faster.',
        ],
      } satisfies ResumeGeneratorResponse);
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to generate resume.' }, { status: 500 });
  }
}
