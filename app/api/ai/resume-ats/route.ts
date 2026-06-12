import { NextRequest, NextResponse } from 'next/server';
import { analyzeResumeUpload } from '@/lib/server/resume-ats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const targetRole = String(formData.get('targetRole') || '').trim();
    const pastedText = String(formData.get('resumeText') || '').trim();

    const result = await analyzeResumeUpload(file instanceof File ? file : null, pastedText, targetRole);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to analyze this resume.';
    const status = /upload a resume|no readable resume text|unable to read/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
