import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { generateAiText, getAiModelName, isAiConfigured, normalizeAiList, normalizeAiText, parseStructuredJson } from '@/lib/server/ai';
import { buildStructuredInsights, preserveDocumentStructure, stripHtmlPreserveStructure } from '@/lib/document-parser-analysis';
import { extractDocumentText } from '@/lib/server/document-parser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const contentType = request.headers.get('content-type') || '';
    let title = '';
    let fileName = '';
    let sourceType: 'upload' | 'paste' | 'preview' = 'paste';
    let rawContent = '';
    let extractionMethod = 'direct_text';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file');
      title = String(formData.get('title') || '');
      sourceType = 'upload';

      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'A document file is required for upload parsing.' }, { status: 400 });
      }

      fileName = file.name;
      const buffer = Buffer.from(await file.arrayBuffer());
      rawContent = await extractDocumentText(file.name, file.type || 'application/octet-stream', buffer);
      extractionMethod = 'server_file_extraction';
      if (!title) {
        title = file.name.replace(/\.[^.]+$/, '');
      }
    } else {
      const payload = await request.json() as {
        title?: string;
        content?: string;
        fileName?: string;
        sourceType?: 'upload' | 'paste' | 'preview';
      };

      title = payload.title || '';
      fileName = payload.fileName || '';
      sourceType = payload.sourceType || 'paste';
      rawContent = typeof payload.content === 'string' ? payload.content.trim() : '';
    }

    const normalizedContent = preserveDocumentStructure(stripHtmlPreserveStructure(rawContent)).slice(0, 18000);

    if (!normalizedContent) {
      return NextResponse.json({
        error: sourceType === 'upload'
          ? 'No readable text could be extracted from this file. If it is a scanned or image-only document, paste the text or use an OCR-ready version.'
          : 'Document content is required for parsing.',
      }, { status: 400 });
    }

    let parsed: {
      summary?: unknown;
      tone?: unknown;
      score?: {
        overall?: unknown;
        clarity?: unknown;
        compliance?: unknown;
        completeness?: unknown;
        professionalism?: unknown;
        riskExposure?: unknown;
        rationale?: unknown;
      };
      keyDetails?: unknown;
      risks?: unknown;
      mitigations?: unknown;
      obligations?: unknown;
      recommendedActions?: unknown;
    };
    let analysisMode: 'ai' | 'fallback' = 'ai';

    try {
      if (!isAiConfigured()) {
        throw new Error('AI unavailable');
      }

      const raw = await generateAiText([
        {
          role: 'system',
          content: [
            'You are Docrud AI document parser.',
            'Analyze enterprise documents with precision and practical business judgment.',
            'Return strict JSON only.',
            'Use keys: summary, tone, score, keyDetails, risks, mitigations, obligations, recommendedActions.',
            'score must be an object with keys overall, clarity, compliance, completeness, professionalism, riskExposure, rationale.',
            'Numeric score values must be integers from 0 to 100.',
            'tone must be a short label like Formal, Neutral, Aggressive, Collaborative, Legal, Operational.',
            'All array values must contain short business-ready strings.',
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify({
            title: title || fileName || 'Untitled document',
            fileName: fileName || '',
            sourceType,
            content: normalizedContent.slice(0, 12000),
          }),
        },
      ]);

      parsed = parseStructuredJson(raw);
    } catch {
      parsed = buildStructuredInsights(normalizedContent, title || fileName || 'Untitled document');
      analysisMode = 'fallback';
    }

    const toScore = (value: unknown, fallback: number) => {
      const numeric = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(numeric)) return fallback;
      return Math.max(0, Math.min(100, Math.round(numeric)));
    };

    return NextResponse.json({
      title: title || fileName || 'Untitled document',
      fileName: fileName || '',
      sourceType,
      extractionMethod,
      analysisMode,
      extractedContent: normalizedContent,
      extractedCharacterCount: normalizedContent.length,
      summary: normalizeAiText(parsed.summary),
      tone: normalizeAiText(parsed.tone) || 'Unclassified',
      score: {
        overall: toScore(parsed.score?.overall, 0),
        clarity: toScore(parsed.score?.clarity, 0),
        compliance: toScore(parsed.score?.compliance, 0),
        completeness: toScore(parsed.score?.completeness, 0),
        professionalism: toScore(parsed.score?.professionalism, 0),
        riskExposure: toScore(parsed.score?.riskExposure, 0),
        rationale: normalizeAiText(parsed.score?.rationale),
      },
      keyDetails: normalizeAiList(parsed.keyDetails, 6),
      risks: normalizeAiList(parsed.risks, 6),
      mitigations: normalizeAiList(parsed.mitigations, 6),
      obligations: normalizeAiList(parsed.obligations, 6),
      recommendedActions: normalizeAiList(parsed.recommendedActions, 6),
      provider: analysisMode === 'ai' ? 'Groq' : 'Fallback parser',
      model: analysisMode === 'ai' ? getAiModelName() : 'local-structured-analysis',
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to parse document' }, { status: 500 });
  }
}
