import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { normalizeDocSheetWorkbook, exportDocSheetToCsv } from '@/lib/docsheet';
import { generateAiText, getAiModelName, isAiConfigured, normalizeAiList, normalizeAiText, parseStructuredJson } from '@/lib/server/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAiConfigured()) {
      return NextResponse.json({ error: 'AI is not configured. Add GROQ_API_KEY to enable AI features.' }, { status: 503 });
    }

    const payload = await request.json() as {
      question?: string;
      workbook?: unknown;
      activeSheetId?: string;
    };

    const question = typeof payload.question === 'string' ? payload.question.trim() : '';
    if (!question) {
      return NextResponse.json({ error: 'Question is required.' }, { status: 400 });
    }

    const workbook = normalizeDocSheetWorkbook(payload.workbook);
    const activeSheet = workbook.sheets.find((sheet) => sheet.id === payload.activeSheetId) || workbook.sheets[0] || null;
    if (!activeSheet) {
      return NextResponse.json({ error: 'No sheet found in this workbook.' }, { status: 400 });
    }

    // Keep context bounded but useful. CSV is easy for the model to reason over.
    const csv = exportDocSheetToCsv({
      ...activeSheet,
      rows: activeSheet.rows.slice(0, 120),
    });

    const raw = await generateAiText([
      {
        role: 'system',
        content: [
          'You are DocSheet Ask AI. You answer questions grounded in the provided spreadsheet extract.',
          'Do not hallucinate values; if something is not present in the extract, say you cannot confirm.',
          'Return strict JSON only with top-level keys: answer, suggestedActions, confidence.',
          'answer must be concise and business-friendly.',
          'suggestedActions is a short list of follow-ups the user can run (for example: "Filter Status=At Risk", "Create a summary sheet").',
          'confidence must be a number from 0 to 1.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({
          workbookTitle: workbook.title,
          activeSheetName: activeSheet.name,
          sheetCsv: csv,
          question,
        }),
      },
    ]);

    const parsed = parseStructuredJson<{
      answer?: unknown;
      suggestedActions?: unknown;
      confidence?: unknown;
    }>(raw);

    const confidence = typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.6;

    return NextResponse.json({
      answer: normalizeAiText(parsed.answer) || 'I could not confidently answer from the uploaded sheet extract.',
      suggestedActions: normalizeAiList(parsed.suggestedActions, 6),
      confidence,
      provider: 'Groq',
      model: getAiModelName(),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to answer this sheet question.' },
      { status: 500 },
    );
  }
}

