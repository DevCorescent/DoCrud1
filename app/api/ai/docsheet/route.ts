import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { buildDocSheetWorkbookFromBlueprint, normalizeDocSheetWorkbook } from '@/lib/docsheet';
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
      instruction?: string;
      workbook?: unknown;
      activeSheetId?: string;
    };

    const instruction = typeof payload.instruction === 'string' ? payload.instruction.trim() : '';
    if (!instruction) {
      return NextResponse.json({ error: 'Instruction is required.' }, { status: 400 });
    }

    const workbook = normalizeDocSheetWorkbook(payload.workbook);
    const activeSheet = workbook.sheets.find((sheet) => sheet.id === payload.activeSheetId) || workbook.sheets[0] || null;
    const workbookContext = {
      title: workbook.title,
      description: workbook.description,
      currencyCode: workbook.currencyCode,
      sheets: workbook.sheets.map((sheet) => ({
        name: sheet.name,
        columns: sheet.columns.map((column) => ({ label: column.label, type: column.type })),
        rows: sheet.rows.slice(0, 30).map((row) => sheet.columns.map((column) => String(row.values[column.id] || ''))),
      })),
      activeSheetName: activeSheet?.name || null,
    };

    const raw = await generateAiText([
      {
        role: 'system',
        content: [
          'You are DocSheet AI Studio, an expert spreadsheet operator for business users.',
          'You can update an existing workbook or generate a new workbook from scratch.',
          'Return strict JSON only.',
          'Top-level keys must be: summary, suggestedNextSteps, workbook.',
          'workbook must contain title, description, currencyCode, sheets.',
          'Each sheet must contain name, columns, rows.',
          'columns must be objects with label and type where type is one of text, number, currency, percent, date.',
          'rows must be arrays of string values aligned to the columns.',
          'Keep the workbook practical, business-ready, and directly editable.',
          'If the user asks for changes, modify the workbook accordingly instead of returning commentary only.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({
          instruction,
          workbook: workbookContext,
        }),
      },
    ]);

    const parsed = parseStructuredJson<{
      summary?: unknown;
      suggestedNextSteps?: unknown;
      workbook?: {
        title?: string;
        description?: string;
        currencyCode?: string;
        sheets?: Array<{
          name?: string;
          columns?: Array<{ label?: string; type?: string }>;
          rows?: unknown[][];
        }>;
      };
    }>(raw);

    const nextWorkbook = buildDocSheetWorkbookFromBlueprint({
      title: normalizeAiText(parsed.workbook?.title) || workbook.title,
      description: normalizeAiText(parsed.workbook?.description) || workbook.description,
      currencyCode: normalizeAiText(parsed.workbook?.currencyCode) || workbook.currencyCode,
      sheets: (parsed.workbook?.sheets || []).map((sheet) => ({
        name: normalizeAiText(sheet.name) || 'Sheet',
        columns: Array.isArray(sheet.columns)
          ? sheet.columns.map((column) => ({
              label: normalizeAiText(column.label) || 'Column',
              type: column.type === 'number' || column.type === 'currency' || column.type === 'percent' || column.type === 'date' || column.type === 'text'
                ? column.type
                : 'text',
            }))
          : [],
        rows: Array.isArray(sheet.rows)
          ? sheet.rows.map((row) => Array.isArray(row) ? row.map((cell) => normalizeAiText(cell)) : [])
          : [],
      })),
    });

    return NextResponse.json({
      summary: normalizeAiText(parsed.summary) || 'DocSheet AI updated the workbook based on your instruction.',
      suggestedNextSteps: normalizeAiList(parsed.suggestedNextSteps, 5),
      workbook: nextWorkbook,
      provider: 'Groq',
      model: getAiModelName(),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process DocSheet AI request.' },
      { status: 500 },
    );
  }
}
