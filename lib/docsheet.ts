import type { DocSheetCellFormat, DocSheetColumn, DocSheetColumnType, DocSheetRow, DocSheetSheet, DocSheetWorkbook } from '@/types/document';
import type { VisualizerTableData } from '@/lib/document-visualizer-analysis';

export interface DocSheetBlueprintSheet {
  name: string;
  columns: Array<{ label: string; type?: DocSheetColumnType }>;
  rows: string[][];
}

export interface DocSheetBlueprintWorkbook {
  title?: string;
  description?: string;
  currencyCode?: string;
  sheets?: DocSheetBlueprintSheet[];
}

export interface DocSheetSmartTemplate {
  id: string;
  name: string;
  description: string;
  audience: string;
}

export interface DocSheetFormulaPack {
  id: string;
  name: string;
  description: string;
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function parseNumericValue(value: string) {
  const cleaned = value.replace(/[^0-9.\-]/g, '');
  if (!cleaned) return Number.NaN;
  return Number(cleaned);
}

export function getDocSheetColumnLetter(index: number) {
  let current = index + 1;
  let result = '';
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

export function createDocSheetColumn(label: string, type: DocSheetColumnType = 'text'): DocSheetColumn {
  return {
    id: createId('docsheet-column'),
    label,
    type,
    width: 140,
  };
}

export function createDocSheetRow(columns: DocSheetColumn[]): DocSheetRow {
  return {
    id: createId('docsheet-row'),
    values: Object.fromEntries(columns.map((column) => [column.id, ''])),
    height: 36,
  };
}

export function createDocSheetSheet(name = 'Sheet 1'): DocSheetSheet {
  const columns = [
    createDocSheetColumn('Item', 'text'),
    createDocSheetColumn('Owner', 'text'),
    createDocSheetColumn('Value', 'number'),
    createDocSheetColumn('Status', 'text'),
  ];
  const timestamp = nowIso();

  return {
    id: createId('docsheet-sheet'),
    name,
    columns,
    rows: [
      {
        id: createId('docsheet-row'),
        values: {
          [columns[0].id]: 'North Region',
          [columns[1].id]: 'A. Sharma',
          [columns[2].id]: '124',
          [columns[3].id]: 'On Track',
        },
        height: 36,
      },
      {
        id: createId('docsheet-row'),
        values: {
          [columns[0].id]: 'South Region',
          [columns[1].id]: 'M. Patel',
          [columns[2].id]: '98',
          [columns[3].id]: 'At Risk',
        },
        height: 36,
      },
    ],
    cellFormats: {},
    cellComments: {},
    sortState: null,
    filters: {},
    conditionalRules: [],
    frozenColumnCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createDocSheetWorkbook(title = 'DocSheet Workbook'): DocSheetWorkbook {
  const timestamp = nowIso();
  return {
    id: createId('docsheet-workbook'),
    title,
    description: 'Operational spreadsheet with governed sharing, history, and visual-ready exports.',
    currencyCode: 'INR',
    sheets: [createDocSheetSheet()],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function buildSheetFromDefinition(
  name: string,
  columns: Array<{ label: string; type?: DocSheetColumnType }>,
  rows: string[][],
): DocSheetSheet {
  const createdAt = nowIso();
  const nextColumns = columns.map((column, index) => createDocSheetColumn(column.label || `Column ${index + 1}`, column.type || 'text'));
  return {
    id: createId('docsheet-sheet'),
    name,
    columns: nextColumns,
    rows: rows.map((row) => ({
      id: createId('docsheet-row'),
      values: Object.fromEntries(nextColumns.map((column, index) => [column.id, String(row[index] ?? '')])),
    })),
    createdAt,
    updatedAt: createdAt,
  };
}

export function getDocSheetSmartTemplates(): DocSheetSmartTemplate[] {
  return [
    {
      id: 'sales-executive-pack',
      name: 'Sales Executive Pack',
      description: 'Ready for targets, achieved revenue, gap analysis, and achievement percentage.',
      audience: 'Sales teams, regional reviews, revenue ops',
    },
    {
      id: 'budget-control-pack',
      name: 'Budget Control Pack',
      description: 'Tracks allocated budget, spend, balance, and utilization for each department.',
      audience: 'Finance ops, cost center reviews, monthly controls',
    },
    {
      id: 'collections-tracker-pack',
      name: 'Collections Tracker Pack',
      description: 'Monitors invoices, collected amount, outstanding balance, and recovery rate.',
      audience: 'Finance teams, receivables follow-up, account management',
    },
    {
      id: 'project-delivery-pack',
      name: 'Project Delivery Pack',
      description: 'Tracks planned effort, actual effort, variance, and delivery performance by project.',
      audience: 'Delivery managers, PMO, client servicing',
    },
  ];
}

export function createDocSheetWorkbookFromTemplate(templateId: string): DocSheetWorkbook {
  const createdAt = nowIso();

  const workbookMap: Record<string, DocSheetWorkbook> = {
    'sales-executive-pack': {
      id: createId('docsheet-workbook'),
      title: 'Sales Executive Pack',
      description: 'Prebuilt sales tracker with formulas for gap and achievement percentage.',
      currencyCode: 'INR',
      sheets: [
        buildSheetFromDefinition(
          'Sales Tracker',
          [
            { label: 'Region', type: 'text' },
            { label: 'Owner', type: 'text' },
            { label: 'Target', type: 'number' },
            { label: 'Achieved', type: 'number' },
            { label: 'Gap', type: 'number' },
            { label: 'Achievement %', type: 'percent' },
          ],
          [
            ['North', 'A. Sharma', '200', '162', '=C1-D1', '=(D1/C1)*100'],
            ['South', 'M. Patel', '180', '171', '=C2-D2', '=(D2/C2)*100'],
            ['West', 'R. Iyer', '210', '198', '=C3-D3', '=(D3/C3)*100'],
          ],
        ),
        buildSheetFromDefinition(
          'Renewal Pipeline',
          [
            { label: 'Client', type: 'text' },
            { label: 'Renewal Value', type: 'currency' },
            { label: 'Probability %', type: 'percent' },
            { label: 'Weighted Value', type: 'currency' },
          ],
          [
            ['Aster Corp', '450000', '80', '=(B1*C1)/100'],
            ['Nimbus Tech', '280000', '65', '=(B2*C2)/100'],
          ],
        ),
      ],
      createdAt,
      updatedAt: createdAt,
    },
    'budget-control-pack': {
      id: createId('docsheet-workbook'),
      title: 'Budget Control Pack',
      description: 'Department budget sheet with automatic balance and utilization formulas.',
      currencyCode: 'INR',
      sheets: [
        buildSheetFromDefinition(
          'Budget Control',
          [
            { label: 'Department', type: 'text' },
            { label: 'Budget', type: 'currency' },
            { label: 'Spent', type: 'currency' },
            { label: 'Balance', type: 'currency' },
            { label: 'Utilization %', type: 'percent' },
          ],
          [
            ['Operations', '800000', '520000', '=B1-C1', '=(C1/B1)*100'],
            ['Sales', '650000', '440000', '=B2-C2', '=(C2/B2)*100'],
            ['Product', '1200000', '910000', '=B3-C3', '=(C3/B3)*100'],
          ],
        ),
      ],
      createdAt,
      updatedAt: createdAt,
    },
    'collections-tracker-pack': {
      id: createId('docsheet-workbook'),
      title: 'Collections Tracker Pack',
      description: 'Invoice and collections tracker with outstanding and recovery formulas.',
      currencyCode: 'INR',
      sheets: [
        buildSheetFromDefinition(
          'Collections Tracker',
          [
            { label: 'Client', type: 'text' },
            { label: 'Invoice Amount', type: 'currency' },
            { label: 'Collected', type: 'currency' },
            { label: 'Outstanding', type: 'currency' },
            { label: 'Collection %', type: 'percent' },
          ],
          [
            ['Veda Services', '300000', '240000', '=B1-C1', '=(C1/B1)*100'],
            ['Optima Build', '185000', '110000', '=B2-C2', '=(C2/B2)*100'],
            ['Nova Retail', '420000', '390000', '=B3-C3', '=(C3/B3)*100'],
          ],
        ),
      ],
      createdAt,
      updatedAt: createdAt,
    },
    'project-delivery-pack': {
      id: createId('docsheet-workbook'),
      title: 'Project Delivery Pack',
      description: 'Project oversight tracker with effort variance and burn monitoring.',
      currencyCode: 'INR',
      sheets: [
        buildSheetFromDefinition(
          'Delivery Tracker',
          [
            { label: 'Project', type: 'text' },
            { label: 'Planned Hours', type: 'number' },
            { label: 'Actual Hours', type: 'number' },
            { label: 'Variance', type: 'number' },
            { label: 'Utilization %', type: 'percent' },
          ],
          [
            ['Apollo Rollout', '420', '398', '=C1-B1', '=(C1/B1)*100'],
            ['Zenith Migration', '360', '372', '=C2-B2', '=(C2/B2)*100'],
            ['Orion Support', '220', '188', '=C3-B3', '=(C3/B3)*100'],
          ],
        ),
      ],
      createdAt,
      updatedAt: createdAt,
    },
  };

  return workbookMap[templateId] || createDocSheetWorkbook();
}

export function getDocSheetFormulaPacks(): DocSheetFormulaPack[] {
  return [
    {
      id: 'sales-performance',
      name: 'Sales performance formulas',
      description: 'Adds Gap and Achievement % formulas to target-vs-achieved sheets.',
    },
    {
      id: 'budget-utilization',
      name: 'Budget utilization formulas',
      description: 'Adds Balance and Utilization % formulas for budget control sheets.',
    },
    {
      id: 'collections-recovery',
      name: 'Collections recovery formulas',
      description: 'Adds Outstanding and Collection % formulas for receivables tracking.',
    },
  ];
}

function findColumnIndex(sheet: DocSheetSheet, labels: string[]) {
  const normalizedLabels = labels.map((label) => label.trim().toLowerCase());
  return sheet.columns.findIndex((column) => normalizedLabels.includes(column.label.trim().toLowerCase()));
}

function ensureColumn(sheet: DocSheetSheet, label: string, type: DocSheetColumnType) {
  const existing = sheet.columns.find((column) => column.label.trim().toLowerCase() === label.trim().toLowerCase());
  if (existing) {
    return { sheet, column: existing };
  }

  const nextColumn = createDocSheetColumn(label, type);
  return {
    column: nextColumn,
    sheet: {
      ...sheet,
      columns: [...sheet.columns, nextColumn],
      rows: sheet.rows.map((row) => ({
        ...row,
        values: {
          ...row.values,
          [nextColumn.id]: '',
        },
      })),
    },
  };
}

export function applyDocSheetFormulaPack(sheet: DocSheetSheet, formulaPackId: string): DocSheetSheet {
  let workingSheet = {
    ...sheet,
    columns: [...sheet.columns],
    rows: sheet.rows.map((row) => ({ ...row, values: { ...row.values } })),
    updatedAt: nowIso(),
  };

  if (formulaPackId === 'sales-performance') {
    const targetIndex = findColumnIndex(workingSheet, ['target']);
    const achievedIndex = findColumnIndex(workingSheet, ['achieved', 'actual', 'actual revenue']);
    if (targetIndex === -1 || achievedIndex === -1) return sheet;
    const gapResult = ensureColumn(workingSheet, 'Gap', 'number');
    workingSheet = gapResult.sheet;
    const percentResult = ensureColumn(workingSheet, 'Achievement %', 'percent');
    workingSheet = percentResult.sheet;
    const gapLetter = getDocSheetColumnLetter(workingSheet.columns.findIndex((column) => column.id === gapResult.column.id));
    const percentLetter = getDocSheetColumnLetter(workingSheet.columns.findIndex((column) => column.id === percentResult.column.id));
    const targetLetter = getDocSheetColumnLetter(targetIndex);
    const achievedLetter = getDocSheetColumnLetter(achievedIndex);

    workingSheet.rows = workingSheet.rows.map((row, rowIndex) => ({
      ...row,
      values: {
        ...row.values,
        [gapResult.column.id]: `=${targetLetter}${rowIndex + 1}-${achievedLetter}${rowIndex + 1}`,
        [percentResult.column.id]: `=(${achievedLetter}${rowIndex + 1}/${targetLetter}${rowIndex + 1})*100`,
      },
    }));
    return workingSheet;
  }

  if (formulaPackId === 'budget-utilization') {
    const budgetIndex = findColumnIndex(workingSheet, ['budget', 'allocated amount', 'allocated']);
    const spentIndex = findColumnIndex(workingSheet, ['spent', 'actual spend']);
    if (budgetIndex === -1 || spentIndex === -1) return sheet;
    const balanceResult = ensureColumn(workingSheet, 'Balance', 'currency');
    workingSheet = balanceResult.sheet;
    const utilizationResult = ensureColumn(workingSheet, 'Utilization %', 'percent');
    workingSheet = utilizationResult.sheet;
    const budgetLetter = getDocSheetColumnLetter(budgetIndex);
    const spentLetter = getDocSheetColumnLetter(spentIndex);

    workingSheet.rows = workingSheet.rows.map((row, rowIndex) => ({
      ...row,
      values: {
        ...row.values,
        [balanceResult.column.id]: `=${budgetLetter}${rowIndex + 1}-${spentLetter}${rowIndex + 1}`,
        [utilizationResult.column.id]: `=(${spentLetter}${rowIndex + 1}/${budgetLetter}${rowIndex + 1})*100`,
      },
    }));
    return workingSheet;
  }

  if (formulaPackId === 'collections-recovery') {
    const invoiceIndex = findColumnIndex(workingSheet, ['invoice amount', 'invoice', 'billed']);
    const collectedIndex = findColumnIndex(workingSheet, ['collected', 'received']);
    if (invoiceIndex === -1 || collectedIndex === -1) return sheet;
    const outstandingResult = ensureColumn(workingSheet, 'Outstanding', 'currency');
    workingSheet = outstandingResult.sheet;
    const collectionResult = ensureColumn(workingSheet, 'Collection %', 'percent');
    workingSheet = collectionResult.sheet;
    const invoiceLetter = getDocSheetColumnLetter(invoiceIndex);
    const collectedLetter = getDocSheetColumnLetter(collectedIndex);

    workingSheet.rows = workingSheet.rows.map((row, rowIndex) => ({
      ...row,
      values: {
        ...row.values,
        [outstandingResult.column.id]: `=${invoiceLetter}${rowIndex + 1}-${collectedLetter}${rowIndex + 1}`,
        [collectionResult.column.id]: `=(${collectedLetter}${rowIndex + 1}/${invoiceLetter}${rowIndex + 1})*100`,
      },
    }));
    return workingSheet;
  }

  return sheet;
}

export function duplicateDocSheetSheet(sheet: DocSheetSheet) {
  const timestamp = nowIso();
  const nextColumns = sheet.columns.map((column) => ({
    ...column,
    id: createId('docsheet-column'),
  }));
  const columnMap = new Map(sheet.columns.map((column, index) => [column.id, nextColumns[index].id]));
  const rowMap = new Map<string, string>();

  const nextRows = sheet.rows.map((row) => {
    const nextRowId = createId('docsheet-row');
    rowMap.set(row.id, nextRowId);
    return {
      id: nextRowId,
      values: Object.fromEntries(Object.entries(row.values).map(([key, value]) => [columnMap.get(key) || key, value])),
      height: row.height,
    };
  });

  const nextFormats: Record<string, DocSheetCellFormat> = {};
  if (sheet.cellFormats && typeof sheet.cellFormats === 'object') {
    Object.entries(sheet.cellFormats).forEach(([key, format]) => {
      const [rowId, columnId] = key.split(':');
      if (!rowId || !columnId) return;
      const nextRowId = rowMap.get(rowId);
      const nextColumnId = columnMap.get(columnId);
      if (!nextRowId || !nextColumnId) return;
      nextFormats[`${nextRowId}:${nextColumnId}`] = format as DocSheetCellFormat;
    });
  }

  const nextComments: NonNullable<DocSheetSheet['cellComments']> = {};
  if (sheet.cellComments && typeof sheet.cellComments === 'object') {
    Object.entries(sheet.cellComments).forEach(([key, thread]) => {
      const [rowId, columnId] = key.split(':');
      if (!rowId || !columnId) return;
      const nextRowId = rowMap.get(rowId);
      const nextColumnId = columnMap.get(columnId);
      if (!nextRowId || !nextColumnId) return;
      if (!Array.isArray(thread)) return;
      nextComments[`${nextRowId}:${nextColumnId}`] = thread.map((comment) => ({
        ...(comment as any),
        id: createId('docsheet-comment'),
      }));
    });
  }

  const nextSortState = sheet.sortState?.columnId ? { ...sheet.sortState, columnId: columnMap.get(sheet.sortState.columnId) || sheet.sortState.columnId } : null;
  const nextFilters: NonNullable<DocSheetSheet['filters']> = {};
  if (sheet.filters && typeof sheet.filters === 'object') {
    Object.entries(sheet.filters).forEach(([colId, rule]) => {
      const nextColId = columnMap.get(colId);
      if (!nextColId) return;
      nextFilters[nextColId] = rule as any;
    });
  }
  const nextConditionalRules = Array.isArray(sheet.conditionalRules)
    ? sheet.conditionalRules.map((rule) => ({
        ...(rule as any),
        id: createId('docsheet-rule'),
        columnId: columnMap.get((rule as any).columnId) || (rule as any).columnId,
      }))
    : [];

  return {
    ...sheet,
    id: createId('docsheet-sheet'),
    name: `${sheet.name} Copy`,
    columns: nextColumns,
    rows: nextRows,
    cellFormats: nextFormats,
    cellComments: nextComments,
    sortState: nextSortState,
    filters: nextFilters,
    conditionalRules: nextConditionalRules,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function normalizeDocSheetWorkbook(input: unknown): DocSheetWorkbook {
  if (!input || typeof input !== 'object') {
    return createDocSheetWorkbook();
  }

  const raw = input as Partial<DocSheetWorkbook>;
  const timestamp = nowIso();
  const sheets: DocSheetSheet[] = Array.isArray(raw.sheets) && raw.sheets.length
    ? raw.sheets.map((sheet, sheetIndex): DocSheetSheet => {
        const columns: DocSheetColumn[] = Array.isArray(sheet.columns) && sheet.columns.length
          ? sheet.columns.map((column, columnIndex) => ({
              id: String(column.id || createId(`docsheet-column-${sheetIndex}-${columnIndex}`)),
              label: String(column.label || `Column ${columnIndex + 1}`),
              type: column.type === 'number' || column.type === 'currency' || column.type === 'percent' || column.type === 'date' ? column.type : 'text',
              width: Number.isFinite(Number((column as DocSheetColumn).width)) ? Number((column as DocSheetColumn).width) : 140,
            }))
          : createDocSheetSheet(`Sheet ${sheetIndex + 1}`).columns;

        const rows = Array.isArray(sheet.rows)
          ? sheet.rows.map((row, rowIndex) => ({
              id: String(row.id || createId(`docsheet-row-${sheetIndex}-${rowIndex}`)),
              values: Object.fromEntries(
                columns.map((column) => [column.id, String(row.values?.[column.id] ?? '')]),
              ),
              height: Number.isFinite(Number((row as DocSheetRow).height)) ? Number((row as DocSheetRow).height) : 36,
            }))
          : [];

        const cellFormats: Record<string, DocSheetCellFormat> = {};
        const rawFormats = (sheet as Partial<DocSheetSheet>).cellFormats;
        if (rawFormats && typeof rawFormats === 'object') {
          Object.entries(rawFormats as Record<string, unknown>).forEach(([key, format]) => {
            if (!key || typeof key !== 'string') return;
            if (!format || typeof format !== 'object') return;
            // Accept only formats that point to existing rows/columns.
            const [rowId, columnId] = key.split(':');
            if (!rowId || !columnId) return;
            const rowExists = rows.some((row) => row.id === rowId);
            const colExists = columns.some((col) => col.id === columnId);
            if (!rowExists || !colExists) return;
            cellFormats[key] = format as DocSheetCellFormat;
          });
        }

        const cellComments: NonNullable<DocSheetSheet['cellComments']> = {};
        const rawComments = (sheet as Partial<DocSheetSheet>).cellComments;
        if (rawComments && typeof rawComments === 'object') {
          Object.entries(rawComments as Record<string, unknown>).forEach(([key, thread]) => {
            if (!key || typeof key !== 'string') return;
            const [rowId, columnId] = key.split(':');
            if (!rowId || !columnId) return;
            const rowExists = rows.some((row) => row.id === rowId);
            const colExists = columns.some((col) => col.id === columnId);
            if (!rowExists || !colExists) return;
            if (!Array.isArray(thread)) return;
            cellComments[key] = (thread as any[]).map((comment) => ({
              id: String(comment?.id || createId('docsheet-comment')),
              text: String(comment?.text || ''),
              authorName: comment?.authorName ? String(comment.authorName) : undefined,
              createdAt: String(comment?.createdAt || timestamp),
            }));
          });
        }

        const sortStateRaw = (sheet as Partial<DocSheetSheet>).sortState as any;
        const sortState: DocSheetSheet['sortState'] = sortStateRaw?.columnId && typeof sortStateRaw?.direction === 'string'
          ? {
              columnId: String(sortStateRaw.columnId),
              direction: sortStateRaw.direction === 'desc' ? 'desc' : 'asc',
            }
          : null;

        const filters: NonNullable<DocSheetSheet['filters']> = {};
        const rawFilters = (sheet as Partial<DocSheetSheet>).filters as any;
        if (rawFilters && typeof rawFilters === 'object') {
          Object.entries(rawFilters as Record<string, any>).forEach(([colId, rule]) => {
            const colExists = columns.some((col) => col.id === colId);
            if (!colExists) return;
            const op = rule?.op;
            const value = rule?.value;
            if (!value || typeof value !== 'string') return;
            if (!['contains', 'equals', 'gt', 'lt', 'gte', 'lte'].includes(op)) return;
            filters[colId] = { op, value: String(value) } as any;
          });
        }

        const conditionalRules: NonNullable<DocSheetSheet['conditionalRules']> = Array.isArray((sheet as any).conditionalRules)
          ? (sheet as any).conditionalRules.map((rule: any) => ({
              id: String(rule?.id || createId('docsheet-rule')),
              columnId: String(rule?.columnId || ''),
              op: ['contains', 'equals', 'gt', 'lt', 'gte', 'lte'].includes(rule?.op) ? rule.op : 'contains',
              value: String(rule?.value || ''),
              style: {
                bg: rule?.style?.bg ? String(rule.style.bg) : undefined,
                text: rule?.style?.text ? String(rule.style.text) : undefined,
              },
              enabled: rule?.enabled === false ? false : true,
            }))
          : [];

        const frozenColumnCount = Number.isFinite(Number((sheet as any).frozenColumnCount)) ? Number((sheet as any).frozenColumnCount) : 0;

        return {
          id: String(sheet.id || createId(`docsheet-sheet-${sheetIndex}`)),
          name: String(sheet.name || `Sheet ${sheetIndex + 1}`),
          columns,
          rows,
          cellFormats,
          cellComments,
          sortState,
          filters,
          conditionalRules,
          frozenColumnCount,
          createdAt: String(sheet.createdAt || timestamp),
          updatedAt: String(sheet.updatedAt || timestamp),
        };
      })
    : [createDocSheetSheet()];

  return {
    id: String(raw.id || createId('docsheet-workbook')),
    title: String(raw.title || 'DocSheet Workbook'),
    description: raw.description ? String(raw.description) : '',
    currencyCode: raw.currencyCode ? String(raw.currencyCode) : 'INR',
    sheets,
    createdAt: String(raw.createdAt || timestamp),
    updatedAt: String(raw.updatedAt || timestamp),
  };
}

function escapeCsvValue(value: string) {
  if (/[,"\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildCsv(columns: string[], rows: string[][]) {
  return [columns.map(escapeCsvValue).join(','), ...rows.map((row) => row.map((cell) => escapeCsvValue(String(cell ?? ''))).join(','))].join('\n');
}

// --- Formula engine (safe, nested, range-aware) ---
type FormulaToken =
  | { kind: 'number'; value: number }
  | { kind: 'ident'; value: string }
  | { kind: 'cell'; value: string }
  | { kind: 'op'; value: string }
  | { kind: 'comma' }
  | { kind: 'colon' }
  | { kind: 'lparen' }
  | { kind: 'rparen' };

type FormulaNode =
  | { kind: 'number'; value: number }
  | { kind: 'cell'; ref: string }
  | { kind: 'range'; start: string; end: string }
  | { kind: 'unary'; op: '-' | '+'; value: FormulaNode }
  | { kind: 'binary'; op: string; left: FormulaNode; right: FormulaNode }
  | { kind: 'call'; name: string; args: FormulaNode[] };

function columnLettersToIndex(letters: string) {
  return letters.toUpperCase().split('').reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function parseCellRef(ref: string) {
  const match = ref.toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  const col = columnLettersToIndex(match[1]);
  const row = Number(match[2]) - 1;
  if (!Number.isFinite(col) || !Number.isFinite(row) || col < 0 || row < 0) return null;
  return { col, row };
}

function tokenizeFormula(expression: string): FormulaToken[] {
  const tokens: FormulaToken[] = [];
  let i = 0;
  const src = expression.trim();
  while (i < src.length) {
    const ch = src[i];
    if (!ch) break;
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === ',') {
      tokens.push({ kind: 'comma' });
      i += 1;
      continue;
    }
    if (ch === ':') {
      tokens.push({ kind: 'colon' });
      i += 1;
      continue;
    }
    if (ch === '(') {
      tokens.push({ kind: 'lparen' });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen' });
      i += 1;
      continue;
    }
    // Operators (include comparisons)
    const two = src.slice(i, i + 2);
    if (['>=', '<=', '!=', '=='].includes(two)) {
      tokens.push({ kind: 'op', value: two === '==' ? '=' : two });
      i += 2;
      continue;
    }
    if (['+', '-', '*', '/', '^', '>', '<', '='].includes(ch)) {
      tokens.push({ kind: 'op', value: ch });
      i += 1;
      continue;
    }
    // Number
    if (/[0-9.]/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /[0-9.]/.test(src[j]!)) j += 1;
      const numRaw = src.slice(i, j);
      const num = Number(numRaw);
      tokens.push({ kind: 'number', value: Number.isFinite(num) ? num : Number.NaN });
      i = j;
      continue;
    }
    // Ident or cell ref
    if (/[A-Za-z]/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /[A-Za-z0-9]/.test(src[j]!)) j += 1;
      const word = src.slice(i, j);
      if (/^[A-Za-z]+\d+$/.test(word)) {
        tokens.push({ kind: 'cell', value: word.toUpperCase() });
      } else {
        tokens.push({ kind: 'ident', value: word.toUpperCase() });
      }
      i = j;
      continue;
    }
    // Unknown token
    tokens.push({ kind: 'op', value: '?' });
    i += 1;
  }
  return tokens;
}

class FormulaParser {
  private pos = 0;
  constructor(private tokens: FormulaToken[]) {}

  private peek(): FormulaToken | null {
    return this.tokens[this.pos] || null;
  }
  private consume(): FormulaToken | null {
    const t = this.peek();
    if (t) this.pos += 1;
    return t;
  }
  private match(kind: FormulaToken['kind'], value?: string) {
    const t = this.peek();
    if (!t) return false;
    if (t.kind !== kind) return false;
    if (kind === 'op' && value && (t as any).value !== value) return false;
    return true;
  }

  parse(): FormulaNode {
    return this.parseComparison();
  }

  // comparison -> add ( (>,<,>=,<=,=,!=) add )*
  private parseComparison(): FormulaNode {
    let node = this.parseAdd();
    while (this.match('op') && ['>', '<', '>=', '<=', '=', '!='].includes((this.peek() as any).value)) {
      const op = (this.consume() as any).value as string;
      const right = this.parseAdd();
      node = { kind: 'binary', op, left: node, right };
    }
    return node;
  }

  // add -> mul ( (+|-) mul )*
  private parseAdd(): FormulaNode {
    let node = this.parseMul();
    while (this.match('op') && ['+', '-'].includes((this.peek() as any).value)) {
      const op = (this.consume() as any).value as string;
      const right = this.parseMul();
      node = { kind: 'binary', op, left: node, right };
    }
    return node;
  }

  // mul -> unary ( (*|/) unary )*
  private parseMul(): FormulaNode {
    let node = this.parseUnary();
    while (this.match('op') && ['*', '/'].includes((this.peek() as any).value)) {
      const op = (this.consume() as any).value as string;
      const right = this.parseUnary();
      node = { kind: 'binary', op, left: node, right };
    }
    return node;
  }

  private parseUnary(): FormulaNode {
    if (this.match('op') && ['+', '-'].includes((this.peek() as any).value)) {
      const op = (this.consume() as any).value as '+' | '-';
      const value = this.parseUnary();
      return { kind: 'unary', op, value };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): FormulaNode {
    const t = this.peek();
    if (!t) return { kind: 'number', value: Number.NaN };
    if (t.kind === 'number') {
      this.consume();
      return { kind: 'number', value: t.value };
    }
    if (t.kind === 'cell') {
      this.consume();
      const cellRef = t.value;
      if (this.match('colon')) {
        this.consume();
        const end = this.consume();
        if (end && end.kind === 'cell') {
          return { kind: 'range', start: cellRef, end: end.value };
        }
        return { kind: 'number', value: Number.NaN };
      }
      return { kind: 'cell', ref: cellRef };
    }
    if (t.kind === 'ident') {
      this.consume();
      const name = t.value;
      if (this.match('lparen')) {
        this.consume();
        const args: FormulaNode[] = [];
        if (!this.match('rparen')) {
          while (true) {
            args.push(this.parse());
            if (this.match('comma')) {
              this.consume();
              continue;
            }
            break;
          }
        }
        if (this.match('rparen')) this.consume();
        return { kind: 'call', name, args };
      }
      // bare ident isn't meaningful in this evaluator
      return { kind: 'number', value: Number.NaN };
    }
    if (t.kind === 'lparen') {
      this.consume();
      const node = this.parse();
      if (this.match('rparen')) this.consume();
      return node;
    }
    this.consume();
    return { kind: 'number', value: Number.NaN };
  }
}

type CellEvalState = {
  numericCache: Map<string, number>;
  visiting: Set<string>;
};

function getCellNumericValue(sheet: DocSheetSheet, ref: string, state: CellEvalState): number {
  const normalized = ref.toUpperCase();
  if (state.numericCache.has(normalized)) return state.numericCache.get(normalized)!;
  if (state.visiting.has(normalized)) return Number.NaN;
  state.visiting.add(normalized);
  const parsed = parseCellRef(normalized);
  if (!parsed) {
    state.visiting.delete(normalized);
    state.numericCache.set(normalized, Number.NaN);
    return Number.NaN;
  }
  const row = sheet.rows[parsed.row];
  const column = sheet.columns[parsed.col];
  if (!row || !column) {
    state.visiting.delete(normalized);
    state.numericCache.set(normalized, Number.NaN);
    return Number.NaN;
  }
  const raw = String(row.values[column.id] ?? '').trim();
  let value: number;
  if (raw.startsWith('=')) {
    value = evaluateFormulaToNumber(raw, sheet, state);
  } else {
    value = parseNumericValue(raw);
    if (raw.includes('%') && Number.isFinite(value)) {
      // Best-effort: treat explicit percent values as fractional numbers.
      value = value / 100;
    }
  }
  state.visiting.delete(normalized);
  state.numericCache.set(normalized, value);
  return value;
}

function expandRange(sheet: DocSheetSheet, start: string, end: string, state: CellEvalState): number[] {
  const a = parseCellRef(start);
  const b = parseCellRef(end);
  if (!a || !b) return [];
  const minRow = Math.min(a.row, b.row);
  const maxRow = Math.max(a.row, b.row);
  const minCol = Math.min(a.col, b.col);
  const maxCol = Math.max(a.col, b.col);
  const refs: string[] = [];
  for (let r = minRow; r <= maxRow; r += 1) {
    for (let c = minCol; c <= maxCol; c += 1) {
      const ref = `${getDocSheetColumnLetter(c)}${r + 1}`;
      refs.push(ref);
    }
  }
  return refs.map((ref) => getCellNumericValue(sheet, ref, state)).filter((num) => Number.isFinite(num));
}

function evalNodeToNumber(node: FormulaNode, sheet: DocSheetSheet, state: CellEvalState): number {
  if (node.kind === 'number') return node.value;
  if (node.kind === 'cell') return getCellNumericValue(sheet, node.ref, state);
  if (node.kind === 'range') {
    const values = expandRange(sheet, node.start, node.end, state);
    return values.length ? values[0]! : Number.NaN;
  }
  if (node.kind === 'unary') {
    const v = evalNodeToNumber(node.value, sheet, state);
    if (!Number.isFinite(v)) return Number.NaN;
    return node.op === '-' ? -v : v;
  }
  if (node.kind === 'binary') {
    const leftRaw = evalNodeToNumber(node.left, sheet, state);
    const rightRaw = evalNodeToNumber(node.right, sheet, state);
    if (['>', '<', '>=', '<=', '=', '!='].includes(node.op)) {
      // Comparison: treat NaN as false.
      const left = Number.isFinite(leftRaw) ? leftRaw : 0;
      const right = Number.isFinite(rightRaw) ? rightRaw : 0;
      if (node.op === '>') return left > right ? 1 : 0;
      if (node.op === '<') return left < right ? 1 : 0;
      if (node.op === '>=') return left >= right ? 1 : 0;
      if (node.op === '<=') return left <= right ? 1 : 0;
      if (node.op === '=') return left === right ? 1 : 0;
      if (node.op === '!=') return left !== right ? 1 : 0;
      return 0;
    }
    // Spreadsheet-friendly behavior: blanks/non-numeric are treated as 0 in arithmetic.
    const left = Number.isFinite(leftRaw) ? leftRaw : 0;
    const right = Number.isFinite(rightRaw) ? rightRaw : 0;
    if (node.op === '+') return left + right;
    if (node.op === '-') return left - right;
    if (node.op === '*') return left * right;
    if (node.op === '/') return right === 0 ? Number.NaN : left / right;
    if (node.op === '^') return Math.pow(left, right);
    return Number.NaN;
  }
  if (node.kind === 'call') {
    const name = node.name.toUpperCase();
    if (name === 'IF') {
      const cond = node.args[0] ? evalNodeToNumber(node.args[0], sheet, state) : 0;
      const branch = cond ? node.args[1] : node.args[2];
      return branch ? evalNodeToNumber(branch, sheet, state) : 0;
    }

    const values: number[] = [];
    node.args.forEach((arg) => {
      if (arg.kind === 'range') {
        values.push(...expandRange(sheet, arg.start, arg.end, state));
        return;
      }
      const v = evalNodeToNumber(arg, sheet, state);
      if (Number.isFinite(v)) values.push(v);
    });

    if (name === 'SUM') return values.reduce((sum, v) => sum + v, 0);
    if (name === 'COUNT') return values.length;
    if (!values.length) return Number.NaN;
    if (name === 'AVERAGE' || name === 'AVG') return values.reduce((sum, v) => sum + v, 0) / values.length;
    if (name === 'MIN') return Math.min(...values);
    if (name === 'MAX') return Math.max(...values);
    return Number.NaN;
  }
  return Number.NaN;
}

function evaluateFormulaToNumber(rawFormula: string, sheet: DocSheetSheet, state?: CellEvalState): number {
  const trimmed = rawFormula.trim();
  if (!trimmed.startsWith('=')) {
    const num = parseNumericValue(trimmed);
    return Number.isFinite(num) ? num : Number.NaN;
  }
  const expression = trimmed.slice(1);
  const tokens = tokenizeFormula(expression);
  const parser = new FormulaParser(tokens);
  const node = parser.parse();
  const evalState = state || { numericCache: new Map(), visiting: new Set() };
  return evalNodeToNumber(node, sheet, evalState);
}

export function getDocSheetDisplayValue(sheet: DocSheetSheet, rowId: string, columnId: string) {
  const row = sheet.rows.find((entry) => entry.id === rowId);
  const rawValue = String(row?.values[columnId] ?? '');
  if (!rawValue.trim().startsWith('=')) return rawValue;
  const result = evaluateFormulaToNumber(rawValue, sheet);
  return Number.isFinite(result) ? String(result) : '#ERR';
}

export function exportDocSheetToCsv(sheet: DocSheetSheet) {
  const header = sheet.columns.map((column) => escapeCsvValue(column.label)).join(',');
  const rows = sheet.rows.map((row) =>
    sheet.columns.map((column) => escapeCsvValue(getDocSheetDisplayValue(sheet, row.id, column.id))).join(','),
  );
  return [header, ...rows].join('\n');
}

export function buildDocSheetVisualizationInput(workbook: DocSheetWorkbook, sheetId?: string) {
  const sheet = workbook.sheets.find((entry) => entry.id === sheetId) || workbook.sheets[0];
  if (!sheet) return '';
  return exportDocSheetToCsv(sheet);
}

function inferDocSheetColumnType(values: string[]): DocSheetColumnType {
  const sample = values.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 12);
  if (!sample.length) return 'text';
  const percentHits = sample.filter((value) => value.includes('%')).length;
  const currencyHits = sample.filter((value) => /₹|\$|€|£/.test(value)).length;
  const numericHits = sample.filter((value) => !Number.isNaN(parseNumericValue(value))).length;
  const dateHits = sample.filter((value) => !Number.isNaN(new Date(value).getTime())).length;

  if (percentHits >= Math.ceil(sample.length / 2)) return 'percent';
  if (currencyHits >= Math.ceil(sample.length / 2)) return 'currency';
  if (numericHits >= Math.ceil(sample.length / 2)) return 'number';
  if (dateHits >= Math.ceil(sample.length / 2)) return 'date';
  return 'text';
}

export function buildVisualizerTableFromDocSheetSheet(sheet: DocSheetSheet): VisualizerTableData | null {
  if (!sheet.columns.length) return null;

  const columns = sheet.columns.map((column, index) => ({
    id: column.id,
    label: column.label || `Column ${index + 1}`,
    index,
    isNumeric: column.type === 'number' || column.type === 'currency' || column.type === 'percent'
      || sheet.rows.some((row) => !Number.isNaN(parseNumericValue(getDocSheetDisplayValue(sheet, row.id, column.id)))),
  }));
  const rows = sheet.rows.map((row) => ({
    id: row.id,
    cells: sheet.columns.map((column) => String(getDocSheetDisplayValue(sheet, row.id, column.id) || '')),
  }));
  const labelColumn = columns.find((column) => !column.isNumeric) || columns[0];
  const numericColumns = columns.filter((column) => column.isNumeric);
  if (!numericColumns.length) return null;

  return {
    delimiter: ',',
    columns,
    rows,
    labelColumnId: labelColumn.id,
    numericColumnIds: numericColumns.map((column) => column.id),
    csvContent: buildCsv(columns.map((column) => column.label), rows.map((row) => row.cells)),
  };
}

export async function parseSpreadsheetFileToWorkbook(file: File): Promise<DocSheetWorkbook> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const createdAt = nowIso();

  const sheets = workbook.SheetNames.map((sheetName, sheetIndex) => {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | Date | null)[]>(worksheet, {
      header: 1,
      blankrows: false,
      defval: '',
      raw: false,
    });
    const normalizedRows = rows
      .map((row) => row.map((cell) => String(cell ?? '').trim()))
      .filter((row) => row.some((cell) => cell.length > 0));

    if (!normalizedRows.length) {
      return createDocSheetSheet(sheetName || `Sheet ${sheetIndex + 1}`);
    }

    const header = normalizedRows[0];
    const body = normalizedRows.slice(1);
    const width = Math.max(...normalizedRows.map((row) => row.length), header.length, 1);
    const headerCells = Array.from({ length: width }, (_, index) => header[index] || `Column ${index + 1}`);
    const columnTypes = headerCells.map((_, index) => inferDocSheetColumnType(body.map((row) => row[index] || '')));
    const columns = headerCells.map((label, index) => createDocSheetColumn(label, columnTypes[index]));
    const docRows: DocSheetRow[] = body.map((row) => ({
      id: createId('docsheet-row'),
      values: Object.fromEntries(columns.map((column, index) => [column.id, String(row[index] || '')])),
    }));

    return {
      id: createId('docsheet-sheet'),
      name: sheetName || `Sheet ${sheetIndex + 1}`,
      columns,
      rows: docRows,
      createdAt,
      updatedAt: createdAt,
    };
  });

  return {
    id: createId('docsheet-workbook'),
    title: file.name.replace(/\.[^.]+$/, '') || 'Imported Workbook',
    description: `Imported from ${file.name} into DocSheet Studio for governed editing and live charting.`,
    currencyCode: 'INR',
    sheets: sheets.length ? sheets : [createDocSheetSheet()],
    createdAt,
    updatedAt: createdAt,
  };
}

export async function exportDocSheetWorkbookToXlsx(workbook: DocSheetWorkbook): Promise<Blob> {
  const XLSX = await import('xlsx');
  const nextWorkbook = XLSX.utils.book_new();

  workbook.sheets.forEach((sheet) => {
    const aoa = [
      sheet.columns.map((column) => column.label),
      ...sheet.rows.map((row) => sheet.columns.map((column) => getDocSheetDisplayValue(sheet, row.id, column.id))),
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(nextWorkbook, worksheet, sheet.name.slice(0, 31) || 'Sheet');
  });

  const output = XLSX.write(nextWorkbook, { bookType: 'xlsx', type: 'array' });
  return new Blob([output], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function buildDocSheetWorkbookFromBlueprint(blueprint: DocSheetBlueprintWorkbook): DocSheetWorkbook {
  const createdAt = nowIso();
  const sheets = Array.isArray(blueprint.sheets) && blueprint.sheets.length
    ? blueprint.sheets.map((sheet, sheetIndex) => {
        const columns = (sheet.columns || []).length
          ? sheet.columns.map((column, columnIndex) => createDocSheetColumn(column.label || `Column ${columnIndex + 1}`, column.type || 'text'))
          : createDocSheetSheet(`Sheet ${sheetIndex + 1}`).columns;
        const rows = Array.isArray(sheet.rows)
          ? sheet.rows.map((row) => ({
              id: createId('docsheet-row'),
              values: Object.fromEntries(columns.map((column, index) => [column.id, String(row[index] || '')])),
            }))
          : [];

        return {
          id: createId('docsheet-sheet'),
          name: sheet.name || `Sheet ${sheetIndex + 1}`,
          columns,
          rows,
          createdAt,
          updatedAt: createdAt,
        };
      })
    : [createDocSheetSheet()];

  return {
    id: createId('docsheet-workbook'),
    title: blueprint.title || 'AI Generated Workbook',
    description: blueprint.description || 'Workbook generated with DocSheet AI Studio.',
    currencyCode: blueprint.currencyCode || 'INR',
    sheets,
    createdAt,
    updatedAt: createdAt,
  };
}

export function summarizeDocSheetSheet(sheet: DocSheetSheet) {
  const numericColumns = sheet.columns.filter((column) => column.type === 'number' || column.type === 'currency' || column.type === 'percent');
  const numericValues = numericColumns.flatMap((column) =>
    sheet.rows.map((row) => parseNumericValue(getDocSheetDisplayValue(sheet, row.id, column.id))).filter((value) => !Number.isNaN(value)),
  );
  const total = numericValues.reduce((sum, value) => sum + value, 0);
  const average = numericValues.length ? total / numericValues.length : 0;

  return {
    rowCount: sheet.rows.length,
    columnCount: sheet.columns.length,
    numericColumnCount: numericColumns.length,
    numericValueCount: numericValues.length,
    total,
    average,
  };
}

export function buildDocSheetPreviewHtml(workbook: DocSheetWorkbook) {
  const primarySheet = workbook.sheets[0];
  if (!primarySheet) {
    return `<div style="font-family: Inter, Arial, sans-serif; padding: 32px;"><h1 style="margin:0; font-size: 28px;">${workbook.title}</h1><p style="color:#475569;">Empty workbook</p></div>`;
  }

  const summary = summarizeDocSheetSheet(primarySheet);
  const headerCells = primarySheet.columns.map((column) => `<th style="padding:12px 14px;border-bottom:1px solid #e2e8f0;text-align:left;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#64748b;">${column.label}</th>`).join('');
  const rows = primarySheet.rows.slice(0, 8).map((row) => `<tr>${primarySheet.columns.map((column) => `<td style="padding:12px 14px;border-bottom:1px solid #f1f5f9;color:#0f172a;font-size:14px;">${getDocSheetDisplayValue(primarySheet, row.id, column.id) || '&mdash;'}</td>`).join('')}</tr>`).join('');

  return `
    <div style="font-family: Inter, Arial, sans-serif; background: linear-gradient(180deg,#ffffff 0%,#f8fafc 100%); color:#0f172a; padding:32px;">
      <div style="border:1px solid #e2e8f0;border-radius:24px;background:rgba(255,255,255,0.95);padding:28px;box-shadow:0 24px 60px rgba(15,23,42,0.08);">
        <p style="margin:0;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#64748b;">DocSheet workbook</p>
        <h1 style="margin:10px 0 0;font-size:32px;line-height:1.05;">${workbook.title}</h1>
        <p style="margin:12px 0 0;color:#475569;font-size:15px;line-height:1.7;">${workbook.description || 'Spreadsheet workspace prepared inside docrud with governed history and export-ready data.'}</p>
        <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:20px;">
          <div style="border:1px solid #e2e8f0;border-radius:18px;padding:14px;background:#fff;"><div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#64748b;">Sheets</div><div style="margin-top:8px;font-size:22px;font-weight:600;">${workbook.sheets.length}</div></div>
          <div style="border:1px solid #e2e8f0;border-radius:18px;padding:14px;background:#fff;"><div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#64748b;">Rows</div><div style="margin-top:8px;font-size:22px;font-weight:600;">${summary.rowCount}</div></div>
          <div style="border:1px solid #e2e8f0;border-radius:18px;padding:14px;background:#fff;"><div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#64748b;">Columns</div><div style="margin-top:8px;font-size:22px;font-weight:600;">${summary.columnCount}</div></div>
          <div style="border:1px solid #e2e8f0;border-radius:18px;padding:14px;background:#fff;"><div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#64748b;">Numeric avg</div><div style="margin-top:8px;font-size:22px;font-weight:600;">${summary.numericValueCount ? summary.average.toFixed(1) : 'n/a'}</div></div>
        </div>
        <div style="margin-top:22px;border:1px solid #e2e8f0;border-radius:22px;overflow:hidden;background:#fff;">
          <div style="padding:14px 18px;border-bottom:1px solid #e2e8f0;font-weight:600;">${primarySheet.name}</div>
          <table style="width:100%;border-collapse:collapse;">
            <thead><tr>${headerCells}</tr></thead>
            <tbody>${rows || '<tr><td colspan="100%" style="padding:18px;color:#64748b;">No rows added yet.</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}
