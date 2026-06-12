'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BriefcaseBusiness, Building2, CheckCircle2, Copy, Download, FileText, Loader2, Mail, PencilLine, RefreshCcw, ScanSearch, Share2, Sparkles, Target, Trophy, WandSparkles } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { LandingSettings } from '@/types/document';
import PublicSiteChrome from '@/components/PublicSiteChrome';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface PublicResumeAtsPageProps {
  softwareName: string;
  accentLabel: string;
  settings: LandingSettings;
}

type ResumeRoleMatch = {
  role: string;
  score: number;
  why: string;
};

type ResumeAtsResponse = {
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

type ResumeGeneratorResponse = {
  resume: string;
  provider: string;
  model: string;
  mode: 'ai' | 'fallback';
  headline: string;
  improvementsApplied: string[];
};

type PublicHiringJob = {
  id: string;
  organizationName: string;
  title: string;
  department?: string;
  location?: string;
  workMode?: 'remote' | 'hybrid' | 'onsite';
  experienceLevel?: 'entry' | 'associate' | 'mid' | 'senior' | 'lead';
  description: string;
  requirements: string[];
  preferredSkills: string[];
  targetRoleKeywords: string[];
  minimumAtsScore: number;
};

type RankedHiringJob = PublicHiringJob & {
  aiMatchScore: number;
  matchReason: string;
};

type ResumeTemplatePreset = 'executive' | 'modern' | 'compact';

type ResumeStep = 'input' | 'analysis' | 'generate' | 'preview';

const steps: Array<{ id: ResumeStep; label: string; eyebrow: string }> = [
  { id: 'input', label: 'Input', eyebrow: '1' },
  { id: 'analysis', label: 'ATS Analysis', eyebrow: '2' },
  { id: 'generate', label: 'AI Resume', eyebrow: '3' },
  { id: 'preview', label: 'Preview & Share', eyebrow: '4' },
];

const capabilityCards = [
  'Deep ATS score and role fit',
  'AI-built better resume draft',
  'Edit, share, and download in one flow',
];

const resumeTemplates: Array<{ id: ResumeTemplatePreset; label: string; description: string }> = [
  { id: 'executive', label: 'Executive Clean', description: 'Premium, spacious, recruiter-safe layout' },
  { id: 'modern', label: 'Modern Pro', description: 'Sharper headings with cleaner visual contrast' },
  { id: 'compact', label: 'Compact ATS', description: 'Denser format for maximum information fit' },
];

function formatResumeAsHtml(resume: string, headline?: string, template: ResumeTemplatePreset = 'executive') {
  const lines = resume.split('\n').map((line) => line.trim());
  const templateStyles = {
    executive: {
      page: 'max-width: 860px; margin: 24px auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 24px; padding: 44px; box-shadow: 0 20px 60px rgba(15,23,42,0.08);',
      h1: 'font-size: 28px; margin: 0 0 24px; letter-spacing: -0.03em;',
      h2: 'font-size: 12px; text-transform: uppercase; letter-spacing: 0.2em; margin: 28px 0 10px; color: #475569;',
      p: 'margin: 0 0 10px; line-height: 1.7; font-size: 14px;',
      li: 'margin: 0 0 10px 18px; line-height: 1.7; font-size: 14px;',
    },
    modern: {
      page: 'max-width: 860px; margin: 24px auto; background: linear-gradient(180deg,#fff,#fbfdff); border: 1px solid #dbe4ee; border-radius: 28px; padding: 44px; box-shadow: 0 24px 70px rgba(15,23,42,0.08);',
      h1: 'font-size: 30px; margin: 0 0 24px; letter-spacing: -0.04em; color: #020617;',
      h2: 'font-size: 11px; text-transform: uppercase; letter-spacing: 0.24em; margin: 30px 0 12px; color: #0f172a; border-top: 1px solid #e2e8f0; padding-top: 14px;',
      p: 'margin: 0 0 10px; line-height: 1.75; font-size: 14px; color: #334155;',
      li: 'margin: 0 0 10px 18px; line-height: 1.75; font-size: 14px; color: #334155;',
    },
    compact: {
      page: 'max-width: 860px; margin: 18px auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 18px; padding: 32px; box-shadow: 0 16px 42px rgba(15,23,42,0.07);',
      h1: 'font-size: 26px; margin: 0 0 18px; letter-spacing: -0.03em;',
      h2: 'font-size: 11px; text-transform: uppercase; letter-spacing: 0.18em; margin: 22px 0 8px; color: #475569;',
      p: 'margin: 0 0 7px; line-height: 1.55; font-size: 13px;',
      li: 'margin: 0 0 7px 16px; line-height: 1.55; font-size: 13px;',
    },
  }[template];
  const body = lines
    .map((line) => {
      if (!line) {
        return '<div class="spacer"></div>';
      }
      if (/^[A-Z][A-Z\s/&-]{3,}$/.test(line)) {
        return `<h2>${line}</h2>`;
      }
      if (/^[\-\u2022*]/.test(line)) {
        return `<li>${line.replace(/^[\-\u2022*\s]+/, '')}</li>`;
      }
      return `<p>${line}</p>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${headline || 'ATS Resume Draft'}</title>
  <style>
    body { margin: 0; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; }
    .page { ${templateStyles.page} }
    h1 { ${templateStyles.h1} }
    h2 { ${templateStyles.h2} }
    p { ${templateStyles.p} }
    li { ${templateStyles.li} }
    .spacer { height: 12px; }
  </style>
</head>
<body>
  <main class="page">
    <h1>${headline || 'ATS Resume Draft'}</h1>
    ${body}
  </main>
</body>
</html>`;
}

function fileSafeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'resume';
}

type ResumeSection = {
  heading: string;
  lines: string[];
};

const DEFAULT_SECTION_ORDER = [
  'PROFESSIONAL SUMMARY',
  'CORE SKILLS',
  'EXPERIENCE',
  'PROJECTS',
  'EDUCATION',
];

function cleanResumeLines(input: string) {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, '  ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''));
}

function isResumeHeading(line: string) {
  const normalized = line.trim();
  return /^[A-Z][A-Z0-9\s/&(),.-]{2,}$/.test(normalized) && normalized.length <= 60;
}

function parseResumeSections(input: string) {
  const lines = cleanResumeLines(input);
  const introLines: string[] = [];
  const sections: ResumeSection[] = [];
  let currentSection: ResumeSection | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      if (currentSection && currentSection.lines[currentSection.lines.length - 1] !== '') {
        currentSection.lines.push('');
      }
      continue;
    }

    if (isResumeHeading(line.trim())) {
      currentSection = { heading: line.trim(), lines: [] };
      sections.push(currentSection);
      continue;
    }

    if (currentSection) {
      currentSection.lines.push(line);
    } else {
      introLines.push(line);
    }
  }

  return {
    introLines: introLines.filter((line, index, arr) => !(line === '' && arr[index - 1] === '')),
    sections: sections.map((section) => ({
      heading: section.heading,
      lines: section.lines.filter((line, index, arr) => !(line === '' && arr[index - 1] === '')),
    })),
  };
}

function buildResumeText(introLines: string[], sections: ResumeSection[]) {
  const blocks: string[] = [];

  if (introLines.length) {
    blocks.push(introLines.join('\n').trim());
  }

  sections.forEach((section) => {
    const content = section.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (content) {
      blocks.push(`${section.heading}\n${content}`);
    } else {
      blocks.push(section.heading);
    }
  });

  return blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

function upsertResumeSection(input: string, heading: string, starter: string) {
  const parsed = parseResumeSections(input);
  const existing = parsed.sections.find((section) => section.heading === heading);

  if (existing) {
    if (!existing.lines.some((line) => line.trim())) {
      existing.lines = starter.split('\n');
    }
    return {
      text: buildResumeText(parsed.introLines, parsed.sections),
      action: `Updated ${heading.toLowerCase()}`,
    };
  }

  const newSection: ResumeSection = {
    heading,
    lines: starter.split('\n'),
  };

  const insertAfterIndex = DEFAULT_SECTION_ORDER.indexOf(heading);
  if (insertAfterIndex === -1) {
    parsed.sections.push(newSection);
  } else {
    let insertionPoint = parsed.sections.length;
    for (let index = 0; index < parsed.sections.length; index += 1) {
      const currentOrder = DEFAULT_SECTION_ORDER.indexOf(parsed.sections[index].heading);
      if (currentOrder > insertAfterIndex) {
        insertionPoint = index;
        break;
      }
    }
    parsed.sections.splice(insertionPoint, 0, newSection);
  }

  return {
    text: buildResumeText(parsed.introLines, parsed.sections),
    action: `Added ${heading.toLowerCase()}`,
  };
}

function convertResumeToCv(input: string) {
  const parsed = parseResumeSections(input);
  const existingMap = new Map(parsed.sections.map((section) => [section.heading, section]));
  const finalSections: ResumeSection[] = [];

  DEFAULT_SECTION_ORDER.forEach((heading) => {
    const section = existingMap.get(heading);
    if (section) {
      finalSections.push(section);
      existingMap.delete(heading);
      return;
    }

    if (heading === 'PROFESSIONAL SUMMARY') {
      finalSections.push({
        heading,
        lines: ['- Add a 3-4 line overview focused on role fit, domain depth, and measurable impact.'],
      });
    }
  });

  ['CERTIFICATIONS', 'ACHIEVEMENTS', 'PUBLICATIONS', 'ADDITIONAL EXPERIENCE'].forEach((heading) => {
    const existing = existingMap.get(heading);
    finalSections.push(existing || {
      heading,
      lines: [`- Add ${heading.toLowerCase().replace(/_/g, ' ')} only if they strengthen this profile.`],
    });
    existingMap.delete(heading);
  });

  existingMap.forEach((section) => finalSections.push(section));

  return buildResumeText(parsed.introLines, finalSections);
}

function convertResumeToOnePager(input: string) {
  const parsed = parseResumeSections(input);
  const sections = parsed.sections
    .filter((section) => !['ADDITIONAL EXPERIENCE', 'ACHIEVEMENTS', 'PUBLICATIONS'].includes(section.heading))
    .map((section) => {
      const nonEmptyLines = section.lines.filter((line) => line.trim());
      const bulletLines = nonEmptyLines.filter((line) => /^[\-\u2022*]/.test(line.trim()));
      const regularLines = nonEmptyLines.filter((line) => !/^[\-\u2022*]/.test(line.trim()));

      if (section.heading === 'EXPERIENCE' || section.heading === 'PROJECTS') {
        return {
          ...section,
          lines: [...regularLines.slice(0, 4), ...bulletLines.slice(0, 4)],
        };
      }

      if (section.heading === 'CORE SKILLS') {
        return {
          ...section,
          lines: regularLines.slice(0, 3).map((line) => line.replace(/\s{2,}/g, ' ')),
        };
      }

      return {
        ...section,
        lines: nonEmptyLines.slice(0, 4),
      };
    });

  return buildResumeText(parsed.introLines.slice(0, 6), sections).replace(/\n{3,}/g, '\n\n');
}

function normalizeResumeSpacingText(input: string) {
  return cleanResumeLines(input)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ ]{3,}/g, '  ')
    .replace(/^[\u2022*]\s*/gm, '- ')
    .trim();
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/i)
    .map((item) => item.trim())
    .filter((item) => item.length > 2);
}

function rankJobsForResume(jobs: PublicHiringJob[], analysis: ResumeAtsResponse, resumeDraft: string) {
  const roleSignals = analysis.roleMatches.map((item) => item.role.toLowerCase());
  const companySignals = analysis.companyMatches.map((item) => item.companyType.toLowerCase());
  const resumeTokens = new Set(tokenize(`${resumeDraft}\n${analysis.keywordCoverage.join(' ')}\n${analysis.strengths.join(' ')}`));

  return jobs
    .filter((job) => analysis.atsScore >= job.minimumAtsScore)
    .map((job) => {
      const jobText = `${job.title} ${job.department || ''} ${job.description} ${job.requirements.join(' ')} ${job.preferredSkills.join(' ')} ${job.targetRoleKeywords.join(' ')}`;
      const jobTokens = tokenize(jobText);
      const keywordHits = jobTokens.filter((token) => resumeTokens.has(token)).length;
      const roleBoost = roleSignals.some((signal) => job.title.toLowerCase().includes(signal) || job.description.toLowerCase().includes(signal)) ? 16 : 0;
      const companyBoost = companySignals.some((signal) => signal.includes('startup') ? job.description.toLowerCase().includes('startup') : true) ? 4 : 0;
      const atsBoost = Math.max(0, analysis.atsScore - job.minimumAtsScore);
      const score = Math.max(52, Math.min(99, Math.round(44 + keywordHits * 2.6 + roleBoost + companyBoost + atsBoost * 0.55)));
      const matchedKeywords = jobTokens.filter((token, index) => resumeTokens.has(token) && index < 6).slice(0, 4);
      return {
        ...job,
        aiMatchScore: score,
        matchReason: matchedKeywords.length
          ? `Matched on ${matchedKeywords.join(', ')} with strong role-fit and keyword overlap from your optimized resume.`
          : `Your optimized resume aligns with this role direction and clears the company's internal screening benchmark.`,
      };
    })
    .sort((left, right) => right.aiMatchScore - left.aiMatchScore)
    .slice(0, 6);
}

export default function PublicResumeAtsPage({ softwareName, accentLabel, settings }: PublicResumeAtsPageProps) {
  const { data: session, status } = useSession();
  const [activeStep, setActiveStep] = useState<ResumeStep>('input');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [result, setResult] = useState<ResumeAtsResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [generatorPrompt, setGeneratorPrompt] = useState('');
  const [generatedResume, setGeneratedResume] = useState<ResumeGeneratorResponse | null>(null);
  const [generatorError, setGeneratorError] = useState('');
  const [isGeneratingResume, setIsGeneratingResume] = useState(false);
  const [copyState, setCopyState] = useState('');
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [editableResume, setEditableResume] = useState('');
  const [liveResumeScore, setLiveResumeScore] = useState<ResumeAtsResponse | null>(null);
  const [isRefreshingScore, setIsRefreshingScore] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ResumeTemplatePreset>('executive');
  const [liveSuggestions, setLiveSuggestions] = useState<string[]>([]);
  const [relatedJobs, setRelatedJobs] = useState<RankedHiringJob[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [applyingJobId, setApplyingJobId] = useState('');
  const stageRef = useRef<HTMLElement | null>(null);

  const strengthTone = useMemo(() => {
    switch (result?.profileStrength) {
      case 'standout':
        return 'bg-emerald-100 text-emerald-700';
      case 'strong':
        return 'bg-sky-100 text-sky-700';
      case 'emerging':
        return 'bg-amber-100 text-amber-700';
      default:
        return 'bg-rose-100 text-rose-700';
    }
  }, [result?.profileStrength]);

  const quickStats = result
    ? [
        { label: 'ATS score', value: `${result.atsScore}/100` },
        { label: 'Profile level', value: result.profileStrength },
        { label: 'Best role', value: result.roleMatches[0]?.role || 'Not enough data' },
        { label: 'Best company fit', value: result.companyMatches[0]?.companyType || 'General fit' },
      ]
    : [];

  const previewHtml = useMemo(() => {
    if (!generatedResume || !editableResume.trim()) {
      return '';
    }
    return formatResumeAsHtml(editableResume, generatedResume.headline, selectedTemplate);
  }, [editableResume, generatedResume, selectedTemplate]);

  const optimizationInsights = useMemo(() => {
    if (!result || !generatedResume) {
      return [];
    }

    const before = result.sectionScores;
    const after = {
      structure: Math.min(98, before.structure + 10),
      impact: Math.min(98, before.impact + 16),
      skillsDepth: Math.min(98, before.skillsDepth + 12),
      readability: Math.min(98, before.readability + 14),
      trustSignals: Math.min(98, before.trustSignals + 10),
    };

    const labels: Record<keyof typeof after, string> = {
      structure: 'Structure',
      impact: 'Impact language',
      skillsDepth: 'Skills alignment',
      readability: 'Readability',
      trustSignals: 'Trust signals',
    };

    const reasons: Record<keyof typeof after, string> = {
      structure: 'The optimized draft reorganizes content into clearer ATS-recognized sections so recruiters can parse it faster.',
      impact: 'Experience bullets are rewritten to sound more outcome-led, which raises interview value and recruiter confidence.',
      skillsDepth: 'The draft brings role-specific keywords and capability clusters closer to the surface for stronger ATS matching.',
      readability: 'Sentence flow is cleaner and denser points are converted into easier-to-scan resume language.',
      trustSignals: 'The new draft makes credibility markers like role targeting, professional summary, and proof points easier to detect.',
    };

    return Object.keys(after).map((key) => {
      const typedKey = key as keyof typeof after;
      return {
        label: labels[typedKey],
        before: before[typedKey],
        after: after[typedKey],
        gain: after[typedKey] - before[typedKey],
        reason: reasons[typedKey],
      };
    });
  }, [generatedResume, result]);

  const isPreviewStep = activeStep === 'preview' && Boolean(generatedResume);
  const effectiveScore = liveResumeScore || result;
  const previewStats = generatedResume
    ? [
        { label: 'Current ATS', value: `${effectiveScore?.atsScore || result?.atsScore || 0}/100` },
        { label: 'Original ATS', value: `${result?.atsScore || 0}/100` },
        { label: 'Gain', value: `${Math.max(0, (effectiveScore?.atsScore || 0) - (result?.atsScore || 0))}` },
        { label: 'Best role', value: effectiveScore?.roleMatches[0]?.role || result?.roleMatches[0]?.role || 'Not enough data' },
      ]
    : [];

  const moveToStep = (step: ResumeStep) => {
    setActiveStep(step);
    window.setTimeout(() => {
      stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const buildSuggestedPrompt = (analysis: ResumeAtsResponse) => [
    `Create a polished ATS-friendly resume for the role "${targetRole || analysis.roleMatches[0]?.role || 'best-fit role'}".`,
    `Use the candidate material below and improve weak areas such as: ${analysis.improvementAreas.join('; ')}.`,
    `Preserve genuine experience, but rewrite for stronger recruiter clarity, stronger metrics, clearer keywords, and better role fit.`,
    '',
    'Candidate material:',
    resumeText.trim() || analysis.extractedPreview,
  ].join('\n');

  useEffect(() => {
    if (!generatedResume) {
      setEditableResume('');
      setLiveResumeScore(null);
      return;
    }
    setEditableResume(generatedResume.resume);
    setLiveResumeScore(null);
  }, [generatedResume]);

  useEffect(() => {
    if (!isPreviewStep || !editableResume.trim()) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setIsRefreshingScore(true);
        const formData = new FormData();
        formData.append('resumeText', editableResume.trim());
        if (targetRole.trim()) {
          formData.append('targetRole', targetRole.trim());
        }
        const response = await fetch('/api/ai/resume-ats', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || 'Unable to refresh ATS score.');
        }
        const livePayload = payload as ResumeAtsResponse;
        setLiveResumeScore(livePayload);
        setLiveSuggestions([
          ...livePayload.improvementAreas.slice(0, 3),
          ...livePayload.missingSignals.slice(0, 2),
        ].filter(Boolean));
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setCopyState(error instanceof Error ? error.message : 'Unable to refresh ATS score.');
        }
      } finally {
        setIsRefreshingScore(false);
      }
    }, 900);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [editableResume, isPreviewStep, targetRole]);

  const handleAnalyze = async () => {
    if (!resumeFile && !resumeText.trim()) {
      setErrorMessage('Upload a resume or paste resume text to continue.');
      moveToStep('input');
      return;
    }

    try {
      setIsAnalyzing(true);
      setErrorMessage('');
      setCopyState('');
      const formData = new FormData();
      if (resumeFile) {
        formData.append('file', resumeFile);
      }
      if (resumeText.trim()) {
        formData.append('resumeText', resumeText.trim());
      }
      if (targetRole.trim()) {
        formData.append('targetRole', targetRole.trim());
      }

      const response = await fetch('/api/ai/resume-ats', {
        method: 'POST',
        body: formData,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to analyze this resume right now.');
      }

      const analysis = payload as ResumeAtsResponse;
      setResult(analysis);
      setGeneratorPrompt((current) => current || buildSuggestedPrompt(analysis));
      setGeneratedResume(null);
      setGeneratorError('');
      moveToStep('analysis');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to analyze this resume right now.');
      setResult(null);
      moveToStep('input');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateResume = async () => {
    if (!generatorPrompt.trim()) {
      setGeneratorError('Add the candidate details or the resume brief you want the AI to use.');
      moveToStep('generate');
      return;
    }

    try {
      setIsGeneratingResume(true);
      setGeneratorError('');
      setCopyState('');
      const response = await fetch('/api/ai/resume-generator', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: generatorPrompt.trim(),
          targetRole: targetRole.trim(),
          sourceText: resumeText.trim() || result?.extractedPreview || '',
          atsContext: result
            ? JSON.stringify({
                atsScore: result.atsScore,
                strengths: result.strengths,
                improvementAreas: result.improvementAreas,
                roleMatches: result.roleMatches,
              })
            : '',
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to generate a resume draft right now.');
      }

      setGeneratedResume(payload as ResumeGeneratorResponse);
      setEditableResume((payload as ResumeGeneratorResponse).resume);
      setLiveResumeScore(null);
      moveToStep('preview');
    } catch (error) {
      setGeneratedResume(null);
      setGeneratorError(error instanceof Error ? error.message : 'Unable to generate a resume draft right now.');
    } finally {
      setIsGeneratingResume(false);
    }
  };

  useEffect(() => {
    if (!generatedResume || !result) {
      setRelatedJobs([]);
      return;
    }

    const controller = new AbortController();
    const loadJobs = async () => {
      try {
        setIsLoadingJobs(true);
        const response = await fetch('/api/public/hiring/jobs', { signal: controller.signal, cache: 'no-store' });
        const payload = await response.json().catch(() => []);
        if (!response.ok) {
          throw new Error((payload as { error?: string })?.error || 'Unable to load matched jobs.');
        }
        const analysis = liveResumeScore || result;
        setRelatedJobs(rankJobsForResume(Array.isArray(payload) ? payload as PublicHiringJob[] : [], analysis, editableResume || generatedResume.resume));
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setRelatedJobs([]);
        }
      } finally {
        setIsLoadingJobs(false);
      }
    };

    void loadJobs();
    return () => controller.abort();
  }, [editableResume, generatedResume, liveResumeScore, result]);

  const handleCopy = async () => {
    if (!generatedResume) {
      return;
    }
    await navigator.clipboard.writeText(editableResume || generatedResume.resume);
    setCopyState('Copied');
  };

  const handleDownload = (kind: 'html' | 'txt') => {
    if (!generatedResume) {
      return;
    }

    const fileBase = fileSafeName(targetRole || generatedResume.headline || 'resume-draft');
    const blob = kind === 'html'
      ? new Blob([previewHtml], { type: 'text/html;charset=utf-8' })
      : new Blob([editableResume || generatedResume.resume], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = kind === 'html' ? `${fileBase}.html` : `${fileBase}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleShare = async () => {
    if (!generatedResume) {
      return;
    }

    const shareText = `${generatedResume.headline}\n\n${editableResume || generatedResume.resume}`;
    if (navigator.share) {
      await navigator.share({
        title: generatedResume.headline,
        text: shareText,
      });
      return;
    }

    await navigator.clipboard.writeText(shareText);
    setCopyState('Copied for sharing');
  };

  const appendSection = (heading: string, starter: string) => {
    const next = upsertResumeSection(editableResume, heading, starter);
    setEditableResume(next.text);
    setCopyState(next.action);
  };

  const convertResumeFormat = (mode: 'cv' | 'one-pager') => {
    setEditableResume((current) => {
      const normalized = current.trim();
      if (!normalized) {
        return current;
      }

      if (mode === 'cv') {
        return convertResumeToCv(normalized);
      }

      return convertResumeToOnePager(normalized);
    });
    setCopyState(mode === 'cv' ? 'Converted to CV layout' : 'Converted to one-pager layout');
  };

  const applySuggestion = (suggestion: string) => {
    setEditableResume((current) => `${current.trim()}\n\nAI IMPROVEMENT NOTE\n- ${suggestion}`.trim());
    setCopyState('AI suggestion added');
  };

  const normalizeResumeSpacing = () => {
    setEditableResume((current) => normalizeResumeSpacingText(current));
    setCopyState('Spacing cleaned up');
  };

  const handleDownloadPdf = async () => {
    if (!generatedResume || !previewHtml) {
      return;
    }

    try {
      setIsDownloadingPdf(true);
      const fileBase = fileSafeName(targetRole || generatedResume.headline || 'resume-draft');
      const response = await fetch('/api/ai/resume-generator/pdf', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          html: previewHtml,
          fileName: fileBase,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Unable to create PDF right now.');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${fileBase}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setCopyState(error instanceof Error ? error.message : 'Unable to create PDF right now.');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleApplyToMatchedJob = async (job: RankedHiringJob) => {
    if (!editableResume.trim()) {
      setCopyState('The optimized resume is empty.');
      return;
    }

    try {
      setApplyingJobId(job.id);
      const response = await fetch('/api/hiring/applications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          resumeText: editableResume.trim(),
          targetRole: targetRole.trim() || job.title,
          resumeFileName: `${fileSafeName(job.title)}-optimized.txt`,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to apply to this role right now.');
      }
      setCopyState(`Application submitted to ${job.organizationName}.`);
    } catch (error) {
      setCopyState(error instanceof Error ? error.message : 'Unable to apply to this role right now.');
    } finally {
      setApplyingJobId('');
    }
  };

  return (
    <PublicSiteChrome softwareName={softwareName} accentLabel={accentLabel} settings={settings}>
      <section className="overflow-hidden rounded-[1.8rem] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,1)_0%,rgba(248,250,252,0.98)_44%,rgba(255,247,237,0.92)_100%)] px-4 py-5 shadow-[0_30px_90px_rgba(15,23,42,0.08)] sm:rounded-[2rem] sm:px-7 sm:py-8 lg:px-10 xl:px-12">
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr] xl:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.22em] text-white">
              <ScanSearch className="h-4 w-4" />
              Resume ATS
            </div>
            <h1 className="mt-4 max-w-3xl text-[2rem] font-medium leading-[1.02] tracking-[-0.04em] text-slate-950 sm:text-[2.8rem] lg:text-[3.7rem]">
              Analyze, upgrade, and generate a stronger resume in one guided flow.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
              Start with a resume upload or raw profile notes, get a deep ATS score, then let AI generate a cleaner recruiter-ready draft with preview, copy, share, and download actions.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {capabilityCards.map((item) => (
                <div key={item} className="rounded-[1.2rem] border border-white/70 bg-white/90 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)] text-sm leading-6 text-slate-700">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[1.6rem] border border-slate-200/70 bg-white/88 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.10)] sm:rounded-[2rem] sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {steps.map((step) => {
                const isActive = activeStep === step.id;
                const isReached = steps.findIndex((item) => item.id === activeStep) >= steps.findIndex((item) => item.id === step.id);
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => {
                      if (step.id === 'analysis' && !result) return;
                      if (step.id === 'preview' && !generatedResume) return;
                      if (step.id === 'generate' && !result) return;
                      moveToStep(step.id);
                    }}
                    className={`rounded-[1.2rem] border px-4 py-4 text-left transition ${
                      isActive
                        ? 'border-slate-950 bg-slate-950 text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)]'
                        : isReached
                          ? 'border-slate-300 bg-white text-slate-950'
                          : 'border-slate-200 bg-slate-50 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold ${isActive ? 'bg-white/15 text-white' : 'bg-slate-950 text-white'}`}>
                        {step.eyebrow}
                      </span>
                      {isReached ? <CheckCircle2 className={`h-4 w-4 ${isActive ? 'text-white' : 'text-emerald-600'}`} /> : null}
                    </div>
                    <p className="mt-3 text-sm font-semibold">{step.label}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section ref={stageRef} className={isPreviewStep ? 'space-y-6' : 'grid gap-6 xl:grid-cols-[0.96fr_1.04fr]'}>
        <div className="space-y-5">
          {activeStep === 'input' ? (
            <article className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Step 1</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">Add your resume or raw profile content</h2>
                </div>
                <span className="rounded-full bg-slate-950 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">Required</span>
              </div>
              <div className="mt-5 grid gap-4">
                <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Resume upload</p>
                  <Input type="file" accept=".pdf,.docx,.txt,.md,.rtf" onChange={(event) => setResumeFile(event.target.files?.[0] || null)} className="mt-3" />
                  {resumeFile ? <p className="mt-3 text-sm text-slate-600">{resumeFile.name}</p> : null}
                </div>
                <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Paste resume or profile content</p>
                  <textarea
                    value={resumeText}
                    onChange={(event) => setResumeText(event.target.value)}
                    className="mt-3 min-h-[220px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900"
                    placeholder="Paste your current resume, experience notes, achievements, skills, projects, and education details."
                  />
                </div>
                <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Target role</p>
                  <Input value={targetRole} onChange={(event) => setTargetRole(event.target.value)} placeholder="Example: Product analyst, business analyst, frontend engineer..." className="mt-3" />
                </div>
                {errorMessage ? (
                  <div className="rounded-[1.1rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</div>
                ) : null}
                <Button type="button" className="h-12 rounded-xl bg-slate-950 px-6 text-white hover:bg-slate-800" onClick={handleAnalyze} disabled={isAnalyzing}>
                  {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  {isAnalyzing ? 'Running ATS analysis...' : 'Run ATS Analysis'}
                </Button>
              </div>
            </article>
          ) : null}

          {activeStep === 'analysis' && result ? (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                {quickStats.map((item) => (
                  <article key={item.label} className="rounded-[1.4rem] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                    <p className="mt-3 text-lg font-semibold leading-7 text-slate-950">{item.value}</p>
                  </article>
                ))}
              </div>

              {result.warnings?.length ? (
                <div className="rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                  {result.warnings[0]}
                </div>
              ) : null}

              <article className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">ATS score</p>
                    <p className="mt-2 text-4xl font-semibold tracking-[-0.04em] text-slate-950">{result.atsScore}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${strengthTone}`}>
                    {result.profileStrength}
                  </span>
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-600">{result.executiveSummary}</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[1rem] border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Best role</p>
                    <p className="mt-1 text-sm font-medium text-slate-950">{result.roleMatches[0]?.role || 'Not enough data'}</p>
                  </div>
                  <div className="rounded-[1rem] border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Recruiter readiness</p>
                    <p className="mt-1 text-sm font-medium text-slate-950">{result.candidateLevel}</p>
                  </div>
                </div>
              </article>

              <article className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                <p className="text-sm font-semibold text-slate-950">Section scores</p>
                <div className="mt-4 space-y-3">
                  {Object.entries(result.sectionScores).map(([key, value]) => (
                    <div key={key}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium capitalize text-slate-900">{key}</span>
                        <span className="text-slate-600">{value}</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-slate-950" style={{ width: `${value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="grid gap-5 lg:grid-cols-2">
                <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-slate-900" />
                    <p className="text-sm font-semibold text-slate-950">Strengths</p>
                  </div>
                  <div className="mt-4 space-y-2">
                    {result.strengths.map((item) => (
                      <div key={item} className="rounded-[1rem] border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">{item}</div>
                    ))}
                  </div>
                </div>
                <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                  <div className="flex items-center gap-2">
                    <BriefcaseBusiness className="h-4 w-4 text-slate-900" />
                    <p className="text-sm font-semibold text-slate-950">Improvement areas</p>
                  </div>
                  <div className="mt-4 space-y-2">
                    {result.improvementAreas.map((item) => (
                      <div key={item} className="rounded-[1rem] border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">{item}</div>
                    ))}
                  </div>
                </div>
              </article>

              <article className="grid gap-5 xl:grid-cols-3">
                <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-950">Application risk</p>
                    <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                      result.applicationRiskLevel === 'low'
                        ? 'bg-emerald-100 text-emerald-700'
                        : result.applicationRiskLevel === 'medium'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-700'
                    }`}>
                      {result.applicationRiskLevel || 'review'}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    {result.roleAlignmentSummary || 'Role-fit analysis will appear here after scoring.'}
                  </p>
                </div>

                <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                  <p className="text-sm font-semibold text-slate-950">Missing sections</p>
                  <div className="mt-3 space-y-2">
                    {(result.missingSections?.length ? result.missingSections : ['No major sections missing']).map((item) => (
                      <div key={item} className="rounded-[1rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">{item}</div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                  <p className="text-sm font-semibold text-slate-950">Formatting risks</p>
                  <div className="mt-3 space-y-2">
                    {(result.formattingRisks?.length ? result.formattingRisks : ['Formatting looks recruiter-safe right now']).map((item) => (
                      <div key={item} className="rounded-[1rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">{item}</div>
                    ))}
                  </div>
                </div>
              </article>

              {result.keywordClusters?.length ? (
                <article className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                  <p className="text-sm font-semibold text-slate-950">Keyword cluster coverage</p>
                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {result.keywordClusters.map((item) => (
                      <div key={item.label} className="rounded-[1.1rem] border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-slate-900">{item.label}</p>
                          <span className="text-sm font-semibold text-slate-950">{item.score}</span>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                          <div className="h-full rounded-full bg-slate-950" style={{ width: `${item.score}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              ) : null}
            </div>
          ) : null}

          {activeStep === 'generate' ? (
            <article className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Step 3</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">Generate an optimized resume</h2>
                </div>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-800">AI</span>
              </div>
              <div className="mt-5 grid gap-4">
                <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Resume brief</p>
                  <textarea
                    value={generatorPrompt}
                    onChange={(event) => setGeneratorPrompt(event.target.value)}
                    className="mt-3 min-h-[260px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900"
                    placeholder="Describe the candidate profile, work experience, measurable achievements, projects, tools, and target role."
                  />
                </div>
                {generatorError ? (
                  <div className="rounded-[1.1rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{generatorError}</div>
                ) : null}
                <div className="flex flex-wrap gap-3">
                  <Button type="button" className="h-12 rounded-xl bg-slate-950 px-6 text-white hover:bg-slate-800" onClick={handleGenerateResume} disabled={isGeneratingResume}>
                    {isGeneratingResume ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <WandSparkles className="mr-2 h-4 w-4" />}
                    {isGeneratingResume ? 'Generating optimized resume...' : 'Generate Best ATS Resume'}
                  </Button>
                  {result ? (
                    <Button type="button" variant="outline" className="h-12 rounded-xl border-slate-300 bg-white px-6 text-slate-950 hover:bg-slate-950 hover:text-white" onClick={() => setGeneratorPrompt(buildSuggestedPrompt(result))}>
                      Use ATS-guided prompt
                    </Button>
                  ) : null}
                </div>
              </div>
            </article>
          ) : null}

          {activeStep === 'preview' && generatedResume ? (
            <div className="space-y-5">
              <article className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {previewStats.map((item) => (
                  <div key={item.label} className="rounded-[1.4rem] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                    <p className="mt-3 text-sm font-semibold text-slate-950">{item.value}</p>
                  </div>
                ))}
              </article>

              <article className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Optimized resume preview</p>
                    <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">{generatedResume.headline}</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                      This draft is optimized from the original content you provided and tuned toward stronger ATS readability, cleaner recruiter flow, and sharper role positioning.
                    </p>
                  </div>
                  <div className="rounded-[1rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <div className="flex items-center gap-2 font-medium text-slate-950">
                      {isRefreshingScore ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                      Real-time ATS refresh
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">The score updates automatically when you edit the optimized resume.</p>
                  </div>
                </div>

                <div className="mt-5 grid gap-5 2xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
                  <div className="grid gap-5">
                    <div className="rounded-[1.3rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-4 sm:p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-950">Live resume editor</p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">Edit directly here. The ATS score refreshes automatically.</p>
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
                          {isRefreshingScore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
                          Live ATS refresh
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {resumeTemplates.map((template) => (
                          <button
                            key={template.id}
                            type="button"
                            onClick={() => setSelectedTemplate(template.id)}
                            className={`rounded-full border px-3 py-2 text-xs font-medium transition ${
                              selectedTemplate === template.id
                                ? 'border-slate-950 bg-slate-950 text-white'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                            }`}
                          >
                            {template.label}
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        {resumeTemplates.find((template) => template.id === selectedTemplate)?.description}
                      </p>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button type="button" variant="outline" className="h-9 rounded-lg border-slate-300 bg-white px-3 text-xs text-slate-950 hover:bg-slate-950 hover:text-white" onClick={() => convertResumeFormat('cv')}>
                          <FileText className="mr-2 h-3.5 w-3.5" />
                          Convert to CV
                        </Button>
                        <Button type="button" variant="outline" className="h-9 rounded-lg border-slate-300 bg-white px-3 text-xs text-slate-950 hover:bg-slate-950 hover:text-white" onClick={() => convertResumeFormat('one-pager')}>
                          <FileText className="mr-2 h-3.5 w-3.5" />
                          Convert to One Pager
                        </Button>
                        <Button type="button" variant="outline" className="h-9 rounded-lg border-slate-300 bg-white px-3 text-xs text-slate-950 hover:bg-slate-950 hover:text-white" onClick={() => appendSection('PROFESSIONAL SUMMARY', '- Add a role-focused summary with measurable value.')}>
                          Summary
                        </Button>
                        <Button type="button" variant="outline" className="h-9 rounded-lg border-slate-300 bg-white px-3 text-xs text-slate-950 hover:bg-slate-950 hover:text-white" onClick={() => appendSection('CORE SKILLS', '- Tool or capability\n- Tool or capability')}>
                          Skills
                        </Button>
                        <Button type="button" variant="outline" className="h-9 rounded-lg border-slate-300 bg-white px-3 text-xs text-slate-950 hover:bg-slate-950 hover:text-white" onClick={() => appendSection('EXPERIENCE', 'Company | Role | Dates\n- Add measurable impact and ownership.')}>
                          Experience
                        </Button>
                        <Button type="button" variant="outline" className="h-9 rounded-lg border-slate-300 bg-white px-3 text-xs text-slate-950 hover:bg-slate-950 hover:text-white" onClick={() => appendSection('PROJECTS', 'Project name\n- Problem, action, tools, result.')}>
                          Projects
                        </Button>
                        <Button type="button" variant="outline" className="h-9 rounded-lg border-slate-300 bg-white px-3 text-xs text-slate-950 hover:bg-slate-950 hover:text-white" onClick={() => appendSection('EDUCATION', 'Degree | Institution | Year')}>
                          Education
                        </Button>
                        <Button type="button" variant="outline" className="h-9 rounded-lg border-slate-300 bg-white px-3 text-xs text-slate-950 hover:bg-slate-950 hover:text-white" onClick={normalizeResumeSpacing}>
                          Normalize spacing
                        </Button>
                      </div>

                      <div className="mt-4 overflow-hidden rounded-[1.3rem] border border-slate-200 bg-white">
                        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">{generatedResume.headline}</p>
                        </div>
                        <textarea
                          value={editableResume}
                          onChange={(event) => {
                            setEditableResume(event.target.value);
                            setCopyState('');
                          }}
                          className={`min-h-[720px] w-full resize-none border-0 bg-white px-5 py-5 text-slate-900 outline-none lg:min-h-[860px] 2xl:min-h-[920px] ${
                            selectedTemplate === 'compact'
                              ? 'text-[13px] leading-6'
                              : selectedTemplate === 'modern'
                                ? 'text-[14px] leading-7'
                                : 'text-[15px] leading-8'
                          }`}
                          spellCheck={false}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-1">
                    <div className="rounded-[1.3rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-4 sm:p-5">
                      <p className="text-sm font-semibold text-slate-950">Share and download</p>
                      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-1">
                        <Button type="button" className="h-11 justify-start rounded-xl bg-slate-950 px-4 text-white hover:bg-slate-800" onClick={handleDownloadPdf} disabled={isDownloadingPdf}>
                          {isDownloadingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                          {isDownloadingPdf ? 'Creating PDF...' : 'Download optimized PDF'}
                        </Button>
                        <Button type="button" variant="outline" className="h-11 justify-start rounded-xl border-slate-300 bg-white px-4 text-slate-950 hover:bg-slate-950 hover:text-white" onClick={() => handleDownload('txt')}>
                          <Download className="mr-2 h-4 w-4" />
                          Download editable text
                        </Button>
                        <Button type="button" variant="outline" className="h-11 justify-start rounded-xl border-slate-300 bg-white px-4 text-slate-950 hover:bg-slate-950 hover:text-white" onClick={handleCopy}>
                          <Copy className="mr-2 h-4 w-4" />
                          Copy optimized resume
                        </Button>
                        <Button type="button" variant="outline" className="h-11 justify-start rounded-xl border-slate-300 bg-white px-4 text-slate-950 hover:bg-slate-950 hover:text-white" onClick={handleShare}>
                          <Share2 className="mr-2 h-4 w-4" />
                          Share draft
                        </Button>
                        <a
                          href={`mailto:?subject=${encodeURIComponent(generatedResume.headline)}&body=${encodeURIComponent(generatedResume.resume)}`}
                          className="inline-flex h-11 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-950 transition hover:bg-slate-950 hover:text-white"
                        >
                          <Mail className="mr-2 h-4 w-4" />
                          Share by email
                        </a>
                      </div>
                      {copyState ? <p className="mt-3 text-xs leading-5 text-slate-500">{copyState}</p> : null}
                    </div>

                    <div className="rounded-[1.3rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-4 sm:p-5">
                      <p className="text-sm font-semibold text-slate-950">Improvements applied</p>
                      <div className="mt-3 space-y-2">
                        {generatedResume.improvementsApplied.map((item) => (
                          <div key={item} className="rounded-[1rem] border border-white bg-white px-4 py-3 text-sm leading-6 text-slate-700">{item}</div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-[1.3rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-4 sm:p-5 xl:col-span-2 2xl:col-span-1">
                      <div className="flex items-center gap-2">
                        <WandSparkles className="h-4 w-4 text-slate-900" />
                        <p className="text-sm font-semibold text-slate-950">AI suggestions while editing</p>
                      </div>
                      <div className="mt-3 space-y-2">
                        {(liveSuggestions.length ? liveSuggestions : result?.improvementAreas.slice(0, 5) || []).map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => applySuggestion(item)}
                            className="w-full rounded-[1rem] border border-white bg-white px-4 py-3 text-left text-sm leading-6 text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <span>{item}</span>
                              <span className="rounded-full bg-slate-950 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">Apply</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-[1.3rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-4 sm:p-5 xl:col-span-2 2xl:col-span-1">
                      <p className="text-sm font-semibold text-slate-950">Why this version is stronger</p>
                      <div className="mt-3 grid gap-3 xl:grid-cols-3 2xl:grid-cols-1">
                        {optimizationInsights.slice(0, 3).map((item) => (
                          <div key={item.label} className="rounded-[1rem] border border-white bg-white p-4">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-slate-950">{item.label}</p>
                              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                                +{item.gain}
                              </span>
                            </div>
                            <p className="mt-2 text-xs leading-6 text-slate-600">{item.reason}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-[1.3rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-4 sm:p-5 xl:col-span-2 2xl:col-span-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-950">AI-matched jobs</p>
                        <span className="rounded-full bg-slate-950 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                          {relatedJobs.length} eligible
                        </span>
                      </div>
                      <div className="mt-3 space-y-3">
                        {isLoadingJobs ? (
                          <div className="rounded-[1rem] border border-white bg-white px-4 py-4 text-sm text-slate-600">
                            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                            Finding roles that match the optimized resume...
                          </div>
                        ) : null}
                        {!isLoadingJobs && relatedJobs.map((job) => (
                          <div key={job.id} className="rounded-[1rem] border border-white bg-white p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-950">{job.title}</p>
                                <p className="mt-1 text-xs leading-5 text-slate-500">
                                  {job.organizationName} · {job.location || 'Location flexible'} · Screening open
                                </p>
                              </div>
                              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                                Match {job.aiMatchScore}
                              </span>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-slate-600">{job.matchReason}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-700">
                                {job.workMode || 'hybrid'}
                              </span>
                              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-700">
                                {job.experienceLevel || 'associate'}
                              </span>
                              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-700">
                                Company benchmark cleared
                              </span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {status === 'authenticated' && session?.user?.accountType === 'individual' ? (
                                <Button
                                  type="button"
                                  className="h-9 rounded-xl bg-slate-950 px-4 text-white hover:bg-slate-800"
                                  onClick={() => void handleApplyToMatchedJob(job)}
                                  disabled={applyingJobId === job.id}
                                >
                                  {applyingJobId === job.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                  Apply now
                                </Button>
                              ) : (
                                <Button asChild type="button" className="h-9 rounded-xl bg-slate-950 px-4 text-white hover:bg-slate-800">
                                  <Link href={`/login?next=${encodeURIComponent(`/jobs/${job.id}`)}`}>Login to apply</Link>
                                </Button>
                              )}
                              <Button asChild type="button" variant="outline" className="h-9 rounded-xl border-slate-300 bg-white px-4 text-slate-950 hover:bg-slate-950 hover:text-white">
                                <Link href={`/jobs/${job.id}`}>Open job</Link>
                              </Button>
                            </div>
                          </div>
                        ))}
                        {!isLoadingJobs && !relatedJobs.length ? (
                          <div className="rounded-[1rem] border border-white bg-white px-4 py-4 text-sm leading-6 text-slate-600">
                            No published jobs currently clear this ATS threshold. Improve the resume further or sign in to use Hiring Desk for direct matching and applications.
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </article>

              {result ? (
                <article className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Before vs after</p>
                      <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">Why the optimized resume is more reliable</h3>
                    </div>
                    <span className="rounded-full bg-slate-950 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">Deep comparison</span>
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-2">
                    <div className="rounded-[1.3rem] border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-950">Original resume signals</p>
                      <div className="mt-4 space-y-3">
                        {optimizationInsights.map((item) => (
                          <div key={`before-${item.label}`}>
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <span className="font-medium text-slate-900">{item.label}</span>
                              <span className="text-slate-600">{item.before}</span>
                            </div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                              <div className="h-full rounded-full bg-slate-400" style={{ width: `${item.before}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-[1.3rem] border border-emerald-100 bg-emerald-50/70 p-4">
                      <p className="text-sm font-semibold text-slate-950">Current optimized resume signals</p>
                      <div className="mt-4 space-y-3">
                        {optimizationInsights.map((item) => {
                          const liveAfter = liveResumeScore?.sectionScores
                            ? {
                                Structure: liveResumeScore.sectionScores.structure,
                                'Impact language': liveResumeScore.sectionScores.impact,
                                'Skills alignment': liveResumeScore.sectionScores.skillsDepth,
                                Readability: liveResumeScore.sectionScores.readability,
                                'Trust signals': liveResumeScore.sectionScores.trustSignals,
                              }[item.label]
                            : item.after;
                          return (
                          <div key={`after-${item.label}`}>
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <span className="font-medium text-slate-900">{item.label}</span>
                              <span className="text-emerald-700">{liveAfter}</span>
                            </div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${liveAfter}%` }} />
                            </div>
                          </div>
                        )})}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-2">
                    <div className="rounded-[1.3rem] border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-950">Original risk areas</p>
                      <div className="mt-3 space-y-2">
                        {result.improvementAreas.map((item) => (
                          <div key={item} className="rounded-[1rem] border border-white bg-white px-4 py-3 text-sm leading-6 text-slate-700">{item}</div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-[1.3rem] border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-950">Why recruiters trust the new version more</p>
                      <div className="mt-3 space-y-2">
                        {optimizationInsights.map((item) => (
                          <div key={`${item.label}-reason`} className="rounded-[1rem] border border-white bg-white px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-slate-950">{item.label}</p>
                              <span className="text-xs font-medium text-emerald-700">+{item.gain}</span>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-slate-600">{item.reason}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </article>
              ) : null}
            </div>
          ) : null}
        </div>

        {!isPreviewStep ? (
        <aside className="space-y-5">
          <article className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Guided flow</p>
            <div className="mt-4 space-y-3">
              {steps.map((step) => {
                const active = activeStep === step.id;
                const enabled = step.id === 'input' || Boolean(result) || (step.id === 'preview' && generatedResume);
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => {
                      if (!enabled) return;
                      if (step.id === 'preview' && !generatedResume) return;
                      if (step.id === 'analysis' && !result) return;
                      if (step.id === 'generate' && !result) return;
                      moveToStep(step.id);
                    }}
                    className={`w-full rounded-[1.15rem] border px-4 py-4 text-left transition ${
                      active
                        ? 'border-slate-950 bg-slate-950 text-white'
                        : enabled
                          ? 'border-slate-200 bg-slate-50 text-slate-900 hover:border-slate-300 hover:bg-white'
                          : 'border-slate-200 bg-slate-50 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className={`text-[10px] uppercase tracking-[0.16em] ${active ? 'text-white/70' : 'text-slate-500'}`}>Step {step.eyebrow}</p>
                        <p className="mt-1 text-sm font-semibold">{step.label}</p>
                      </div>
                      <ArrowRight className={`h-4 w-4 ${active ? 'text-white' : 'text-slate-400'}`} />
                    </div>
                  </button>
                );
              })}
            </div>
          </article>

          {activeStep === 'analysis' && result ? (
            <article className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-slate-900" />
                <p className="text-sm font-semibold text-slate-950">Best-fit roles</p>
              </div>
              <div className="mt-4 space-y-3">
                {result.roleMatches.map((item) => (
                  <div key={item.role} className="rounded-[1rem] border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-950">{item.role}</p>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-700">{item.score}</span>
                    </div>
                    <p className="mt-2 text-xs leading-6 text-slate-600">{item.why}</p>
                  </div>
                ))}
              </div>
              <Button type="button" className="mt-5 h-11 w-full rounded-xl bg-slate-950 text-white hover:bg-slate-800" onClick={() => moveToStep('generate')}>
                Build Optimized Resume
              </Button>
            </article>
          ) : null}

          {activeStep === 'analysis' && result ? (
            <article className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-900" />
                <p className="text-sm font-semibold text-slate-950">Best-fit company types</p>
              </div>
              <div className="mt-4 space-y-3">
                {result.companyMatches.map((item) => (
                  <div key={item.companyType} className="rounded-[1rem] border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-950">{item.companyType}</p>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-700">{item.score}</span>
                    </div>
                    <p className="mt-2 text-xs leading-6 text-slate-600">{item.why}</p>
                  </div>
                ))}
              </div>
            </article>
          ) : null}

          {activeStep === 'preview' && generatedResume ? (
            <article className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <p className="text-sm font-semibold text-slate-950">Next actions</p>
              <div className="mt-4 space-y-3">
                <Button type="button" className="h-11 w-full rounded-xl bg-slate-950 text-white hover:bg-slate-800" onClick={() => moveToStep('generate')}>
                  Refine Resume Brief
                </Button>
                <Button type="button" variant="outline" className="h-11 w-full rounded-xl border-slate-300 bg-white text-slate-950 hover:bg-slate-950 hover:text-white" onClick={() => moveToStep('analysis')}>
                  Review ATS Analysis Again
                </Button>
                <Button asChild variant="outline" className="h-11 w-full rounded-xl border-slate-300 bg-white text-slate-950 hover:bg-slate-950 hover:text-white">
                  <Link href="/signup">Open Full Workspace</Link>
                </Button>
              </div>
            </article>
          ) : null}
        </aside>
        ) : null}
      </section>
    </PublicSiteChrome>
  );
}
