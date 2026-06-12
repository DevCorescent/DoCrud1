import { extractDocumentText } from '@/lib/server/document-parser';
import { generateAiText, getAiModelName, isAiConfigured, normalizeAiList, normalizeAiText, parseStructuredJson } from '@/lib/server/ai';

export type ResumeRoleMatch = {
  role: string;
  score: number;
  why: string;
};

export type ResumeAtsResponse = {
  fileName: string;
  extractedCharacterCount: number;
  atsScore: number;
  profileStrength: 'early' | 'emerging' | 'strong' | 'standout';
  executiveSummary: string;
  candidateLevel: string;
  strengths: string[];
  improvementAreas: string[];
  keywordCoverage: string[];
  missingSignals: string[];
  recruiterImpression: string;
  roleMatches: ResumeRoleMatch[];
  companyMatches: Array<{ companyType: string; score: number; why: string }>;
  sectionScores: {
    structure: number;
    impact: number;
    skillsDepth: number;
    readability: number;
    trustSignals: number;
  };
  rewriteSuggestions: Array<{ original: string; improved: string; why: string }>;
  interviewReadiness: string[];
  nextSteps: string[];
  extractedPreview: string;
  provider: string;
  model: string;
  analysisMode?: 'ai' | 'fallback';
  warnings?: string[];
  missingSections?: string[];
  formattingRisks?: string[];
  keywordClusters?: Array<{ label: string; score: number }>;
  applicationRiskLevel?: 'low' | 'medium' | 'high';
  roleAlignmentSummary?: string;
};

function clampScore(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function countMatches(text: string, patterns: RegExp[]) {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function buildFallbackResumeAnalysis(fileName: string, content: string, targetRole?: string): ResumeAtsResponse {
  const normalized = content.replace(/\r/g, '');
  const lower = normalized.toLowerCase();
  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
  const bullets = lines.filter((line) => /^[•\-*]/.test(line));
  const quantifiedBullets = bullets.filter((line) => /\b\d+(%|\+|x| years?| months?| users?| clients?| projects?| revenue| growth| cost| leads?)\b/i.test(line));
  const emailPresent = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(normalized);
  const phonePresent = /(\+?\d[\d\s-]{7,}\d)/.test(normalized);
  const linkedinPresent = /linkedin\.com/i.test(lower);
  const githubPresent = /github\.com/i.test(lower);
  const portfolioPresent = /portfolio|behance|dribbble|notion\.site|medium\.com/i.test(lower);
  const summaryPresent = /summary|profile|objective|about/i.test(lower);
  const skillsPresent = /skills|tools|technologies|stack|core competencies/i.test(lower);
  const projectPresent = /projects|case studies|portfolio/i.test(lower);
  const educationPresent = /education|university|college|school|bachelor|master|b\.tech|mba|bca|mca/i.test(lower);
  const experiencePresent = /experience|work experience|employment|professional experience|internship/i.test(lower);
  const dateSignals = countMatches(lower, [/\b20\d{2}\b/, /\bjan\b/, /\bfeb\b/, /\bmar\b/, /\bapr\b/, /\bmay\b/, /\bjun\b/, /\bjul\b/, /\baug\b/, /\bsep\b/, /\boct\b/, /\bnov\b/, /\bdec\b/]);
  const metricsPresent = quantifiedBullets.length > 0;
  const actionVerbs = countMatches(lower, [
    /\bled\b/, /\bbuilt\b/, /\bdelivered\b/, /\bincreased\b/, /\bimproved\b/, /\breduced\b/, /\bmanaged\b/, /\bdesigned\b/, /\bdeveloped\b/, /\blaunched\b/, /\bscaled\b/, /\boptimized\b/,
  ]);
  const skillHits = countMatches(lower, [
    /\bexcel\b/, /\bsql\b/, /\bpython\b/, /\bjavascript\b/, /\btypescript\b/, /\breact\b/, /\bnode\b/, /\bfigma\b/, /\bpower bi\b/, /\btableau\b/,
    /\baws\b/, /\bazure\b/, /\bgcp\b/, /\bsalesforce\b/, /\bmarketing\b/, /\bseo\b/, /\bcrm\b/, /\bproduct\b/, /\banalytics\b/, /\boperations\b/, /\bphp\b/, /\bjava\b/, /\bspring\b/,
  ]);

  const structure = clampScore(
    34
      + (emailPresent ? 10 : 0)
      + (phonePresent ? 8 : 0)
      + (summaryPresent ? 8 : 0)
      + (skillsPresent ? 8 : 0)
      + (experiencePresent ? 11 : 0)
      + (educationPresent ? 7 : 0)
      + (projectPresent ? 5 : 0)
      + (dateSignals >= 2 ? 9 : 0),
  );

  const impact = clampScore(
    26
      + Math.min(24, quantifiedBullets.length * 6)
      + Math.min(22, actionVerbs * 2)
      + (metricsPresent ? 12 : 0),
  );

  const skillsDepth = clampScore(
    24
      + Math.min(42, skillHits * 4)
      + (linkedinPresent ? 5 : 0)
      + (githubPresent || portfolioPresent ? 10 : 0),
  );

  const readability = clampScore(
    50
      + (bullets.length >= 4 ? 12 : 0)
      + (lines.length >= 12 ? 8 : 0)
      - (normalized.length > 12000 ? 12 : 0)
      - (lines.some((line) => line.length > 180) ? 12 : 0),
  );

  const trustSignals = clampScore(
    30
      + (emailPresent ? 10 : 0)
      + (phonePresent ? 8 : 0)
      + (linkedinPresent ? 10 : 0)
      + (githubPresent || portfolioPresent ? 8 : 0)
      + (educationPresent ? 10 : 0)
      + (experiencePresent ? 12 : 0)
      + (dateSignals >= 2 ? 6 : 0),
  );

  const atsScore = clampScore((structure * 0.25) + (impact * 0.24) + (skillsDepth * 0.21) + (readability * 0.14) + (trustSignals * 0.16));

  const roleCatalog = [
    { role: 'Operations Analyst', patterns: [/\boperations\b/, /\bprocess\b/, /\bcompliance\b/, /\breporting\b/, /\bexcel\b/, /\bmis\b/, /\bdashboard\b/] },
    { role: 'Data / Business Analyst', patterns: [/\bsql\b/, /\bpython\b/, /\bexcel\b/, /\bpower bi\b/, /\btableau\b/, /\banalytics\b/, /\bvisualization\b/] },
    { role: 'Product Manager / Associate PM', patterns: [/\bproduct\b/, /\broadmap\b/, /\buser research\b/, /\bexperiment\b/, /\bstakeholder\b/, /\bmetrics\b/] },
    { role: 'Software Engineer', patterns: [/\bjavascript\b/, /\btypescript\b/, /\breact\b/, /\bnode\b/, /\bapi\b/, /\bbackend\b/, /\bfrontend\b/, /\bphp\b/, /\bjava\b/] },
    { role: 'Marketing / Growth', patterns: [/\bmarketing\b/, /\bseo\b/, /\bcampaign\b/, /\bcontent\b/, /\bleads\b/, /\bperformance\b/, /\bgrowth\b/] },
    { role: 'Design / Creative', patterns: [/\bfigma\b/, /\bdesign\b/, /\bui\b/, /\bux\b/, /\bprototype\b/, /\bbrand\b/] },
    { role: 'Sales / Business Development', patterns: [/\bsales\b/, /\bcrm\b/, /\bpipeline\b/, /\bclient\b/, /\bprospect\b/, /\brevenue\b/] },
    { role: 'HR / Talent Acquisition', patterns: [/\brecruit\b/, /\bhiring\b/, /\binterview\b/, /\bonboarding\b/, /\bhr\b/, /\btalent\b/] },
  ];

  const roleMatches = roleCatalog
    .map((entry) => {
      const hits = entry.patterns.filter((pattern) => pattern.test(lower)).length;
      return {
        role: entry.role,
        score: clampScore(32 + hits * 13 + (targetRole && entry.role.toLowerCase().includes(targetRole.toLowerCase()) ? 12 : 0)),
        why: hits > 0 ? `The resume shows ${hits} role signal${hits > 1 ? 's' : ''} that align to this track.` : 'This role is possible, but the resume needs clearer role-specific proof and keywords.',
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);

  const companyMatches = [
    {
      companyType: 'Startups and high-ownership teams',
      score: clampScore(36 + (projectPresent ? 14 : 0) + (metricsPresent ? 14 : 0) + (actionVerbs >= 4 ? 10 : 0)),
      why: 'Ownership signals, shipped work, and measurable impact make the profile stronger for startup hiring.',
    },
    {
      companyType: 'Mid-market product companies',
      score: clampScore(34 + (skillsDepth > 65 ? 16 : 0) + (readability > 70 ? 10 : 0) + (roleMatches[0]?.score || 0) * 0.18),
      why: 'Stronger structure, tool depth, and role focus improve fit in product-led teams.',
    },
    {
      companyType: 'Large enterprise or MNC environments',
      score: clampScore(32 + (structure > 72 ? 16 : 0) + (trustSignals > 70 ? 14 : 0) + (/stakeholder|process|compliance|cross-functional/i.test(lower) ? 10 : 0)),
      why: 'Enterprise hiring tends to reward stability signals, chronology, stakeholder context, and clarity.',
    },
    {
      companyType: 'Agencies and client-service teams',
      score: clampScore(30 + (/client|campaign|account|delivery|support/i.test(lower) ? 22 : 0) + (metricsPresent ? 10 : 0)),
      why: 'Client-facing execution and visible outcomes strengthen agency-style hiring fit.',
    },
  ].sort((left, right) => right.score - left.score);

  const missingSections = [
    ...(!summaryPresent ? ['Professional summary'] : []),
    ...(!skillsPresent ? ['Skills section'] : []),
    ...(!experiencePresent ? ['Experience section'] : []),
    ...(!educationPresent ? ['Education section'] : []),
    ...(!projectPresent ? ['Projects or proof-of-work section'] : []),
  ];

  const formattingRisks = [
    ...(lines.some((line) => line.length > 180) ? ['Some lines are too long and may be harder for recruiters to scan quickly.'] : []),
    ...(!bullets.length ? ['The resume uses very few bullets, which can weaken ATS and recruiter readability.'] : []),
    ...(dateSignals < 2 ? ['Timeline/date signals are weak, which can make experience chronology less trustworthy.'] : []),
  ];

  const strengths = [
    ...(summaryPresent ? ['The resume opens with a clear top section, which helps recruiters understand the profile faster.'] : []),
    ...(metricsPresent ? ['There are measurable outcomes in the document, which improves recruiter confidence and ATS relevance.'] : []),
    ...((githubPresent || portfolioPresent) ? ['The resume includes proof-of-work or portfolio links that strengthen credibility.'] : []),
    ...(skillsDepth > 68 ? ['The resume already contains a useful spread of role-relevant tools and technical keywords.'] : []),
  ].slice(0, 5);

  const improvementAreas = [
    ...(!summaryPresent ? ['Add a sharp professional summary at the top so recruiters understand the role fit in seconds.'] : []),
    ...(!metricsPresent ? ['Rewrite experience bullets with numbers, percentages, scale, or business outcomes.'] : []),
    ...(!linkedinPresent ? ['Add a LinkedIn link to increase credibility and recruiter trust signals.'] : []),
    ...(!skillsPresent ? ['Create a dedicated skills section with tools, platforms, and domain keywords.'] : []),
    ...(readability < 70 ? ['Shorten long bullets and make the structure easier to scan in under 20 seconds.'] : []),
  ].slice(0, 6);

  const keywordCoverage = [
    ...(skillHits ? [`Detected role-relevant keyword signals across ${Math.min(skillHits, 12)} core clusters.`] : ['Keyword coverage is still thin for ATS-heavy screening.']),
    ...(experiencePresent ? ['Experience section is present and helps support ATS screening logic.'] : ['Add a clearer experience section with role names, dates, and outcomes.']),
    ...(projectPresent ? ['Projects/portfolio signals strengthen fit for practical and hands-on roles.'] : []),
  ];

  const missingSignals = [
    ...(!emailPresent ? ['Email address missing or unreadable.'] : []),
    ...(!phonePresent ? ['Phone number missing or unreadable.'] : []),
    ...(!educationPresent ? ['Education section is weak or missing.'] : []),
    ...(!projectPresent ? ['Project or proof-of-work section is missing.'] : []),
    ...(quantifiedBullets.length < 3 ? ['Too few quantified bullets for a strong ATS impression.'] : []),
  ].slice(0, 5);

  const rewriteSuggestions = [
    {
      original: 'Worked on multiple projects and handled team tasks.',
      improved: 'Delivered 6 cross-functional projects with a 95% on-time completion rate while coordinating with 4 internal stakeholders.',
      why: 'Adds scope, ownership, and measurable result.',
    },
    {
      original: 'Responsible for sales and customer communication.',
      improved: 'Managed lead qualification and customer follow-ups that improved conversion by 18% over two quarters.',
      why: 'Turns a responsibility statement into an outcome statement.',
    },
    {
      original: 'Used Excel and reporting tools.',
      improved: 'Built Excel-based reporting models and automated weekly dashboards for leadership review.',
      why: 'Shows applied skill and business use case.',
    },
  ];

  const nextSteps = [
    'Tighten the resume headline around one clear target role.',
    'Rewrite the weakest 4 bullets with metrics and action verbs.',
    'Add role-specific keywords from 5 matching job descriptions before applying.',
    'Move the strongest projects or impact bullets closer to the top third of the resume.',
  ];

  const interviewReadiness = [
    'Prepare quantified stories for the top 3 results shown in the resume.',
    'Be ready to explain the tools, platforms, or workflows you mention in the skills section.',
    'Align your self-introduction to the highest-fit role suggested in this report.',
  ];

  const keywordClusters = [
    { label: 'Role keywords', score: clampScore((roleMatches[0]?.score || 50) - 10) },
    { label: 'Technical keywords', score: skillsDepth },
    { label: 'Business impact terms', score: impact },
    { label: 'Trust and credibility', score: trustSignals },
  ];

  const profileStrength: ResumeAtsResponse['profileStrength'] =
    atsScore >= 85 ? 'standout' : atsScore >= 72 ? 'strong' : atsScore >= 58 ? 'emerging' : 'early';

  return {
    fileName,
    extractedCharacterCount: normalized.length,
    atsScore,
    profileStrength,
    executiveSummary: `This resume shows ${profileStrength} ATS readiness. The biggest gains will come from sharper role focus, more quantified outcomes, and stronger recruiter-trust signals where missing.`,
    candidateLevel: roleMatches[0]?.score && roleMatches[0].score > 72 ? 'Marketable for interview screening with targeted improvements.' : 'Needs stronger positioning before broad application volume.',
    strengths,
    improvementAreas,
    keywordCoverage,
    missingSignals,
    recruiterImpression: metricsPresent
      ? 'A recruiter is likely to see potential quickly, but the resume still needs tighter targeting and stronger ATS keyword depth.'
      : 'A recruiter may see baseline capability, but the resume lacks enough hard proof and sharp positioning for competitive shortlisting.',
    roleMatches,
    companyMatches,
    sectionScores: { structure, impact, skillsDepth, readability, trustSignals },
    rewriteSuggestions,
    interviewReadiness,
    nextSteps,
    extractedPreview: normalized.slice(0, 2400),
    provider: 'Fallback parser',
    model: 'local-resume-ats-analysis',
    analysisMode: 'fallback',
    warnings: [],
    missingSections,
    formattingRisks,
    keywordClusters,
    applicationRiskLevel: atsScore >= 80 ? 'low' : atsScore >= 62 ? 'medium' : 'high',
    roleAlignmentSummary: `The strongest alignment right now is for ${roleMatches[0]?.role || 'generalist roles'}, with the best company fit leaning toward ${companyMatches[0]?.companyType || 'general hiring teams'}.`,
  };
}

export async function analyzeResumeFromText(content: string, targetRole?: string, fileName = 'Pasted resume'): Promise<ResumeAtsResponse> {
  const normalized = content.trim().slice(0, 18000);
  if (!normalized) {
    throw new Error('No readable resume text was available for analysis.');
  }

  const fallback = buildFallbackResumeAnalysis(fileName, normalized, targetRole);
  if (!isAiConfigured()) {
    return fallback;
  }

  try {
    const raw = await generateAiText([
      {
        role: 'system',
        content: [
          'You are an ATS resume evaluator and hiring-readiness analyst.',
          'Return strict JSON only.',
          'Keys: atsScore, profileStrength, executiveSummary, candidateLevel, strengths, improvementAreas, keywordCoverage, missingSignals, recruiterImpression, roleMatches, companyMatches, sectionScores, rewriteSuggestions, interviewReadiness, nextSteps, missingSections, formattingRisks, keywordClusters, applicationRiskLevel, roleAlignmentSummary.',
          'roleMatches must be an array of { role, score, why }.',
          'companyMatches must be an array of { companyType, score, why }.',
          'keywordClusters must be an array of { label, score }.',
          'sectionScores must include structure, impact, skillsDepth, readability, trustSignals.',
          'Be practical, ATS-aware, hiring-aware, and highly specific.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({
          fileName,
          targetRole: targetRole || undefined,
          resumeText: normalized,
          fallbackContext: fallback,
        }),
      },
    ]);

    const parsed = parseStructuredJson<Partial<ResumeAtsResponse>>(raw);
    return {
      fileName,
      extractedCharacterCount: normalized.length,
      atsScore: clampScore(Number(parsed.atsScore) || fallback.atsScore),
      profileStrength: (['early', 'emerging', 'strong', 'standout'].includes(String(parsed.profileStrength)) ? parsed.profileStrength : fallback.profileStrength) as ResumeAtsResponse['profileStrength'],
      executiveSummary: normalizeAiText(parsed.executiveSummary) || fallback.executiveSummary,
      candidateLevel: normalizeAiText(parsed.candidateLevel) || fallback.candidateLevel,
      strengths: normalizeAiList(parsed.strengths, 6).length ? normalizeAiList(parsed.strengths, 6) : fallback.strengths,
      improvementAreas: normalizeAiList(parsed.improvementAreas, 6).length ? normalizeAiList(parsed.improvementAreas, 6) : fallback.improvementAreas,
      keywordCoverage: normalizeAiList(parsed.keywordCoverage, 5).length ? normalizeAiList(parsed.keywordCoverage, 5) : fallback.keywordCoverage,
      missingSignals: normalizeAiList(parsed.missingSignals, 5).length ? normalizeAiList(parsed.missingSignals, 5) : fallback.missingSignals,
      recruiterImpression: normalizeAiText(parsed.recruiterImpression) || fallback.recruiterImpression,
      roleMatches: Array.isArray(parsed.roleMatches) && parsed.roleMatches.length
        ? parsed.roleMatches.slice(0, 4).map((item, index) => ({
            role: normalizeAiText(item.role) || fallback.roleMatches[index]?.role || 'Recommended role',
            score: clampScore(Number(item.score) || fallback.roleMatches[index]?.score || 60),
            why: normalizeAiText(item.why) || fallback.roleMatches[index]?.why || '',
          }))
        : fallback.roleMatches,
      companyMatches: Array.isArray(parsed.companyMatches) && parsed.companyMatches.length
        ? parsed.companyMatches.slice(0, 4).map((item, index) => ({
            companyType: normalizeAiText(item.companyType) || fallback.companyMatches[index]?.companyType || 'Recommended company type',
            score: clampScore(Number(item.score) || fallback.companyMatches[index]?.score || 60),
            why: normalizeAiText(item.why) || fallback.companyMatches[index]?.why || '',
          }))
        : fallback.companyMatches,
      sectionScores: {
        structure: clampScore(Number(parsed.sectionScores?.structure) || fallback.sectionScores.structure),
        impact: clampScore(Number(parsed.sectionScores?.impact) || fallback.sectionScores.impact),
        skillsDepth: clampScore(Number(parsed.sectionScores?.skillsDepth) || fallback.sectionScores.skillsDepth),
        readability: clampScore(Number(parsed.sectionScores?.readability) || fallback.sectionScores.readability),
        trustSignals: clampScore(Number(parsed.sectionScores?.trustSignals) || fallback.sectionScores.trustSignals),
      },
      rewriteSuggestions: Array.isArray(parsed.rewriteSuggestions) && parsed.rewriteSuggestions.length
        ? parsed.rewriteSuggestions.slice(0, 4).map((item, index) => ({
            original: normalizeAiText(item.original) || fallback.rewriteSuggestions[index]?.original || '',
            improved: normalizeAiText(item.improved) || fallback.rewriteSuggestions[index]?.improved || '',
            why: normalizeAiText(item.why) || fallback.rewriteSuggestions[index]?.why || '',
          }))
        : fallback.rewriteSuggestions,
      interviewReadiness: normalizeAiList(parsed.interviewReadiness, 5).length ? normalizeAiList(parsed.interviewReadiness, 5) : fallback.interviewReadiness,
      nextSteps: normalizeAiList(parsed.nextSteps, 6).length ? normalizeAiList(parsed.nextSteps, 6) : fallback.nextSteps,
      extractedPreview: fallback.extractedPreview,
      provider: 'Groq',
      model: getAiModelName(),
      analysisMode: 'ai',
      warnings: [],
      missingSections: normalizeAiList(parsed.missingSections, 6).length ? normalizeAiList(parsed.missingSections, 6) : fallback.missingSections,
      formattingRisks: normalizeAiList(parsed.formattingRisks, 6).length ? normalizeAiList(parsed.formattingRisks, 6) : fallback.formattingRisks,
      keywordClusters: Array.isArray(parsed.keywordClusters) && parsed.keywordClusters.length
        ? parsed.keywordClusters.slice(0, 4).map((item, index) => ({
            label: normalizeAiText(item.label) || fallback.keywordClusters?.[index]?.label || 'Keyword cluster',
            score: clampScore(Number(item.score) || fallback.keywordClusters?.[index]?.score || 60),
          }))
        : fallback.keywordClusters,
      applicationRiskLevel: (['low', 'medium', 'high'].includes(String(parsed.applicationRiskLevel)) ? parsed.applicationRiskLevel : fallback.applicationRiskLevel) as ResumeAtsResponse['applicationRiskLevel'],
      roleAlignmentSummary: normalizeAiText(parsed.roleAlignmentSummary) || fallback.roleAlignmentSummary,
    };
  } catch (error) {
    return {
      ...fallback,
      warnings: [
        error instanceof Error ? `AI analysis was unavailable, so docrud used its local ATS engine instead. ${error.message}` : 'AI analysis was unavailable, so docrud used its local ATS engine instead.',
      ],
    };
  }
}

export async function analyzeResumeUpload(file: File | null, pastedText: string, targetRole?: string) {
  let fileName = 'Pasted resume';
  let normalized = '';

  if (file instanceof File && file.size > 0) {
    try {
      fileName = file.name;
      const bytes = Buffer.from(await file.arrayBuffer());
      const extracted = await extractDocumentText(file.name, file.type || 'application/octet-stream', bytes);
      normalized = extracted.trim().slice(0, 18000);
    } catch (error) {
      if (pastedText) {
        normalized = pastedText.slice(0, 18000);
        fileName = `${file.name} (with pasted text fallback)`;
      } else {
        throw new Error(error instanceof Error ? `${error.message} You can also paste the resume text directly and retry.` : 'Unable to read this resume file.');
      }
    }
  } else if (pastedText) {
    normalized = pastedText.slice(0, 18000);
  } else {
    throw new Error('Upload a resume file or paste resume text to continue.');
  }

  return analyzeResumeFromText(normalized, targetRole, fileName);
}
