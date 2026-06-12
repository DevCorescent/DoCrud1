export type VisualizerChartType = 'bar' | 'line' | 'donut' | 'progress';
export type VisualizerStatKey = 'totals' | 'averages' | 'top-performer' | 'distribution' | 'variance' | 'forecast' | 'health' | 'structure' | 'readability' | 'sections';

export interface VisualizerDatum {
  label: string;
  value: number;
}

export interface VisualizerChart {
  id: string;
  title: string;
  type: VisualizerChartType;
  insight: string;
  data: VisualizerDatum[];
}

export interface VisualizerMetric {
  label: string;
  value: string;
  insight: string;
}

export interface VisualizerDeepInsight {
  id: string;
  title: string;
  detail: string;
  tone: 'positive' | 'neutral' | 'warning';
}

export interface VisualizerColumn {
  id: string;
  label: string;
  index: number;
  isNumeric: boolean;
}

export interface VisualizerRow {
  id: string;
  cells: string[];
}

export interface VisualizerTableData {
  delimiter: ',' | '\t' | '|' | ';';
  columns: VisualizerColumn[];
  rows: VisualizerRow[];
  labelColumnId: string;
  numericColumnIds: string[];
  csvContent: string;
}

export interface VisualizerStatOption {
  id: VisualizerStatKey;
  label: string;
  description: string;
  defaultSelected: boolean;
}

export interface DocumentVisualizationInsights {
  title: string;
  documentType: string;
  executiveSummary: string;
  confidenceScore: number;
  keyMetrics: VisualizerMetric[];
  deepInsights: VisualizerDeepInsight[];
  charts: VisualizerChart[];
  highlights: string[];
  anomalies: string[];
  recommendations: string[];
  availableStats: VisualizerStatOption[];
  defaultSelectedStats: VisualizerStatKey[];
  table: VisualizerTableData | null;
}

function toNumber(value: string) {
  const raw = value.trim();
  if (!raw) return null;

  const isNegativeByParens = /^\(.*\)$/.test(raw);
  let normalized = raw
    .replace(/^\(/, '')
    .replace(/\)$/, '')
    .replace(/[\s,]/g, '')
    .replace(/₹|\$|€|£/g, '')
    .trim();

  let multiplier = 1;
  const suffix = normalized.slice(-1).toLowerCase();
  if (suffix === 'k' || suffix === 'm' || suffix === 'b') {
    normalized = normalized.slice(0, -1);
    multiplier = suffix === 'k' ? 1_000 : suffix === 'm' ? 1_000_000 : 1_000_000_000;
  }

  normalized = normalized.replace(/%/g, '');
  if (!normalized) return null;

  const number = Number(normalized) * multiplier;
  if (!Number.isFinite(number)) return null;
  return isNegativeByParens ? -number : number;
}

function parseSeparatedRow(line: string, delimiter: ',' | '\t' | '|' | ';') {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && char === delimiter) {
      out.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  out.push(current.trim());
  return out;
}

function detectDelimiter(lines: string[]) {
  const candidates: Array<',' | '\t' | '|' | ';'> = [',', '\t', ';', '|'];
  const sample = lines.slice(0, 24).filter(Boolean);
  if (!sample.length) return null;

  const scores = candidates.map((delimiter) => {
    const counts = sample.map((line) => parseSeparatedRow(line, delimiter).length);
    const avg = mean(counts);
    const variance = counts.length ? mean(counts.map((value) => (value - avg) ** 2)) : 0;
    return { delimiter, avg, variance };
  });

  scores.sort((left, right) => {
    if (right.avg !== left.avg) return right.avg - left.avg;
    return left.variance - right.variance;
  });

  const best = scores[0];
  if (!best || best.avg < 2) return null;
  return best.delimiter;
}

function looksLikeHeaderRow(row: string[], nextRow: string[]) {
  if (row.length < 2) return false;
  const nonEmpty = row.filter(Boolean);
  if (nonEmpty.length < 2) return false;

  const numericCount = row.reduce((sum, cell) => sum + (toNumber(cell) !== null ? 1 : 0), 0);
  const nextNumericCount = nextRow.reduce((sum, cell) => sum + (toNumber(cell) !== null ? 1 : 0), 0);
  const uniqueCount = new Set(nonEmpty.map((cell) => cell.toLowerCase())).size;
  const uniquenessRatio = uniqueCount / Math.max(1, nonEmpty.length);

  const mostlyText = numericCount / row.length <= 0.35;
  const moreNumericNext = nextNumericCount >= numericCount;
  return mostlyText && uniquenessRatio > 0.7 && moreNumericNext;
}

function stringifyCsvCell(value: string) {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildCsv(columns: string[], rows: string[][]) {
  return [columns.map(stringifyCsvCell).join(','), ...rows.map((row) => row.map((cell) => stringifyCsvCell(cell)).join(','))].join('\n');
}

export function parseDelimitedTable(content: string): VisualizerTableData | null {
  const rawLines = content
    .split('\n')
    .map((line) => line.replace(/\r/g, '').trim())
    .filter(Boolean)
    .slice(0, 800);

  const delimiter = detectDelimiter(rawLines);
  if (!delimiter) return null;

  const parsedRows = rawLines
    .map((line) => parseSeparatedRow(line, delimiter))
    .filter((cells) => cells.length >= 2);

  if (parsedRows.length < 2) return null;

  const first = parsedRows[0];
  const second = parsedRows[1] || [];
  const hasHeader = looksLikeHeaderRow(first, second);
  const header = hasHeader ? first : first.map((_, index) => `Column ${index + 1}`);
  const bodySource = hasHeader ? parsedRows.slice(1) : parsedRows;

  const maxCols = Math.min(42, Math.max(...bodySource.map((row) => row.length), header.length));
  const normalizedHeader = Array.from({ length: maxCols }, (_, index) => header[index] || `Column ${index + 1}`);

  const body = bodySource
    .slice(0, 420)
    .map((row) => normalizedHeader.map((_, index) => row[index] || ''))
    .filter((row) => row.some((cell) => cell.trim().length > 0));

  if (!body.length) return null;

  const columns: VisualizerColumn[] = normalizedHeader.map((label, index) => ({
    id: `col-${index}`,
    label: label || `Column ${index + 1}`,
    index,
    isNumeric: body.filter((row) => row[index] && row[index].trim()).some((row) => toNumber(row[index] || '') !== null),
  }));

  const numericColumns = columns.filter((column) => column.isNumeric);
  if (!numericColumns.length) return null;

  const labelCandidates = columns.filter((column) => !column.isNumeric);
  const labelCandidateScores = labelCandidates.map((column) => {
    const values = body.map((row) => (row[column.index] || '').trim()).filter(Boolean);
    const unique = new Set(values.map((value) => value.toLowerCase())).size;
    const uniquenessRatio = values.length ? unique / values.length : 0;
    const avgLen = values.length ? mean(values.map((value) => value.length)) : 0;
    return { column, score: uniquenessRatio * 0.7 + (avgLen ? Math.max(0, 1 - Math.min(1, avgLen / 42)) * 0.3 : 0) };
  });
  labelCandidateScores.sort((left, right) => right.score - left.score);
  const labelColumn = labelCandidateScores[0]?.column || columns[0];

  return {
    delimiter,
    columns,
    rows: body.map((cells, index) => ({ id: `row-${index + 1}`, cells })),
    labelColumnId: labelColumn.id,
    numericColumnIds: numericColumns.map((column) => column.id),
    csvContent: buildCsv(normalizedHeader, body),
  };
}

function getColumn(table: VisualizerTableData, columnId: string) {
  return table.columns.find((column) => column.id === columnId);
}

function getLabelValues(table: VisualizerTableData) {
  const labelColumn = getColumn(table, table.labelColumnId) || table.columns[0];
  return table.rows.map((row, index) => row.cells[labelColumn.index] || `Row ${index + 1}`);
}

function getNumericSeries(table: VisualizerTableData, columnId: string) {
  const column = getColumn(table, columnId);
  if (!column) return [];
  const labels = getLabelValues(table);
  return table.rows.map((row, index) => ({
    label: labels[index] || `Row ${index + 1}`,
    value: toNumber(row.cells[column.index] || '') ?? 0,
  }));
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function safePercent(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return (numerator / denominator) * 100;
}

function aggregateByLabel(series: Array<{ label: string; value: number }>) {
  const map = new Map<string, number>();
  for (const item of series) {
    const key = item.label || 'Unlabeled';
    map.set(key, (map.get(key) || 0) + (Number.isFinite(item.value) ? item.value : 0));
  }
  return Array.from(map.entries()).map(([label, value]) => ({ label, value }));
}

function detectDateLabels(labels: string[]) {
  const parsed = labels.map((label) => {
    const ms = Date.parse(label);
    return Number.isFinite(ms) ? ms : null;
  });
  const valid = parsed.filter((value): value is number => value !== null);
  if (!valid.length) return null;
  if (valid.length / Math.max(1, labels.length) < 0.6) return null;
  return parsed;
}

function iqrOutlierFlags(values: number[]) {
  if (values.length < 8) return { flags: values.map(() => false), bounds: null as null | { low: number; high: number } };
  const sorted = [...values].sort((left, right) => left - right);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const low = q1 - 1.5 * iqr;
  const high = q3 + 1.5 * iqr;
  return {
    bounds: { low, high },
    flags: values.map((value) => value < low || value > high),
  };
}

function pearsonCorrelation(left: number[], right: number[]) {
  if (left.length !== right.length || left.length < 2) return null;
  const avgLeft = mean(left);
  const avgRight = mean(right);
  let numerator = 0;
  let leftDenominator = 0;
  let rightDenominator = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - avgLeft;
    const rightDelta = right[index] - avgRight;
    numerator += leftDelta * rightDelta;
    leftDenominator += leftDelta ** 2;
    rightDenominator += rightDelta ** 2;
  }
  const denominator = Math.sqrt(leftDenominator * rightDenominator);
  return denominator ? numerator / denominator : null;
}

function computeTableInsights(title: string, table: VisualizerTableData, selectedStats: VisualizerStatKey[]): Omit<DocumentVisualizationInsights, 'title' | 'documentType' | 'executiveSummary' | 'confidenceScore' | 'availableStats' | 'defaultSelectedStats' | 'table'> {
  const metrics: VisualizerMetric[] = [];
  const deepInsights: VisualizerDeepInsight[] = [];
  const charts: VisualizerChart[] = [];
  const highlights: string[] = [`Parsed ${table.rows.length.toLocaleString()} rows and ${table.columns.length.toLocaleString()} columns.`];
  const anomalies: string[] = [];
  const recommendations: string[] = [];

  const numericMeta = table.numericColumnIds.map((columnId) => {
    const column = getColumn(table, columnId);
    if (!column) return null;
    const values = table.rows.map((row) => toNumber(row.cells[column.index] || ''));
    const present = values.filter((value): value is number => value !== null);
    const coverage = present.length / Math.max(1, values.length);
    const avg = mean(present);
    const variance = present.length ? mean(present.map((value) => (value - avg) ** 2)) : 0;
    return { columnId, column, values, present, coverage, variance };
  }).filter(Boolean) as Array<{
    columnId: string;
    column: VisualizerColumn;
    values: Array<number | null>;
    present: number[];
    coverage: number;
    variance: number;
  }>;

  numericMeta.sort((left, right) => {
    const leftScore = left.coverage * 0.6 + Math.min(1, left.variance / Math.max(right.variance || 1, 1)) * 0.4;
    const rightScore = right.coverage * 0.6 + Math.min(1, right.variance / Math.max(left.variance || 1, 1)) * 0.4;
    return rightScore - leftScore;
  });

  const primaryMeta = numericMeta[0];
  const secondaryMeta = numericMeta[1] || null;
  const primaryColumnId = primaryMeta?.columnId || table.numericColumnIds[0];
  const secondaryColumnId = secondaryMeta?.columnId || table.numericColumnIds[1];
  const primaryColumn = getColumn(table, primaryColumnId);
  const secondaryColumn = secondaryColumnId ? getColumn(table, secondaryColumnId) : null;

  if (primaryColumn) {
    highlights.push(`${primaryColumn.label} is the primary series used for charts.`);
  }

  const labels = getLabelValues(table);
  const dateMs = detectDateLabels(labels);

  const perRowPrimary = table.rows.map((row, index) => ({
    label: labels[index] || `Row ${index + 1}`,
    value: primaryColumn ? toNumber(row.cells[primaryColumn.index] || '') : null,
    index,
  }));

  const presentValues = perRowPrimary.map((item) => item.value).filter((value): value is number => value !== null);
  const total = presentValues.reduce((sum, value) => sum + value, 0);
  const avg = mean(presentValues);
  const med = median(presentValues);
  const stdev = presentValues.length ? Math.sqrt(mean(presentValues.map((value) => (value - avg) ** 2))) : 0;
  const volatility = avg ? stdev / Math.max(Math.abs(avg), 1) : 0;

  const aggregated = aggregateByLabel(
    perRowPrimary.filter((item) => item.value !== null).map((item) => ({ label: item.label, value: item.value || 0 })),
  );
  const sortedAgg = [...aggregated].sort((left, right) => right.value - left.value);
  const highest = sortedAgg[0];
  const lowest = [...sortedAgg].sort((left, right) => left.value - right.value)[0];
  const topThreeShare = total > 0 ? safePercent(sortedAgg.slice(0, 3).reduce((sum, item) => sum + item.value, 0), total) : 0;
  const topShare = total > 0 && highest ? safePercent(highest.value, total) : 0;

  const coveragePoints: number[] = table.rows.length && table.numericColumnIds.length
    ? table.rows.flatMap((row) => table.numericColumnIds.map((columnId) => {
        const column = getColumn(table, columnId);
        return column ? (toNumber(row.cells[column.index] || '') !== null ? 1 : 0) : 0;
      }))
    : [];
  const numericCoverage = coveragePoints.length
    ? coveragePoints.reduce((sum, value) => sum + value, 0) / coveragePoints.length
    : 0;
  const stabilityScore = Math.max(0, Math.min(100, Math.round((1 - Math.min(volatility, 1)) * 100)));
  const concentrationScore = Math.max(0, Math.min(100, Math.round(100 - topThreeShare)));
  const coverageScore = Math.max(0, Math.min(100, Math.round(numericCoverage * 100)));

  const { flags: outlierFlags, bounds: outlierBounds } = iqrOutlierFlags(presentValues);
  const outlierCount = outlierFlags.filter(Boolean).length;

  const topBar = sortedAgg.slice(0, 12);
  const donutTop = sortedAgg.slice(0, 6);
  const donutRemainder = total - donutTop.reduce((sum, item) => sum + item.value, 0);
  const donutData = donutRemainder > 0 ? [...donutTop, { label: 'Other', value: donutRemainder }] : donutTop;

  const orderedTrend = dateMs
    ? perRowPrimary
        .filter((item) => item.value !== null && dateMs[item.index] !== null)
        .map((item) => ({ label: labels[item.index], value: item.value as number, ms: dateMs[item.index] as number }))
        .sort((left, right) => left.ms - right.ms)
        .map((item) => ({
          label: new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(item.ms)),
          value: item.value,
        }))
    : perRowPrimary
        .filter((item) => item.value !== null)
        .map((item) => ({ label: item.label, value: item.value as number }));

  const midpoint = Math.ceil(orderedTrend.length / 2);
  const firstHalfAverage = mean(orderedTrend.slice(0, midpoint).map((item) => item.value));
  const secondHalfAverage = mean(orderedTrend.slice(midpoint).map((item) => item.value));
  const momentumDelta = secondHalfAverage - firstHalfAverage;

  if (selectedStats.includes('totals')) {
    metrics.push({
      label: `${primaryColumn?.label || 'Primary metric'} total`,
      value: total.toLocaleString(),
      insight: 'Total across all detected numeric values.',
    });
    charts.push({
      id: 'totals-bar',
      title: `${primaryColumn?.label || 'Primary metric'} by ${getColumn(table, table.labelColumnId)?.label || 'Label'}`,
      type: 'bar',
      insight: 'Top contributors, sorted by value.',
      data: topBar,
    });
    charts.push({
      id: 'ranking-progress',
      title: 'Contribution strength',
      type: 'progress',
      insight: 'Relative strength vs the top row.',
      data: topBar.slice(0, 6).map((item) => ({
        label: item.label,
        value: highest ? Math.round((item.value / Math.max(highest.value, 1)) * 100) : 0,
      })),
    });
  }

  if (selectedStats.includes('averages')) {
    metrics.push({
      label: 'Average value',
      value: avg ? avg.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0',
      insight: 'Mean across detected numeric values.',
    });
    metrics.push({
      label: 'Median value',
      value: med ? med.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0',
      insight: 'Median is more stable when outliers exist.',
    });
    charts.push({
      id: 'quality-progress',
      title: 'Data quality snapshot',
      type: 'progress',
      insight: 'Coverage, stability, and concentration at a glance.',
      data: [
        { label: 'Coverage', value: coverageScore },
        { label: 'Stability', value: stabilityScore },
        { label: 'Balance', value: concentrationScore },
      ],
    });
  }

  if (selectedStats.includes('top-performer') && highest) {
    metrics.push({
      label: 'Top category',
      value: highest.label,
      insight: `${highest.value.toLocaleString()} (${topShare.toFixed(1)}% of total).`,
    });
    if (avg && highest.value > avg * 1.8) {
      anomalies.push(`${highest.label} is materially above the visible average and should be checked as a possible outlier.`);
    }
  }

  if (selectedStats.includes('distribution')) {
    charts.push({
      id: 'distribution-donut',
      title: `${primaryColumn?.label || 'Primary metric'} distribution`,
      type: 'donut',
      insight: 'Share of total across the biggest contributors.',
      data: donutData,
    });
  }

  if (selectedStats.includes('variance')) {
    charts.push({
      id: 'variance-line',
      title: `${primaryColumn?.label || 'Primary metric'} trend`,
      type: 'line',
      insight: dateMs ? 'Ordered by detected dates.' : 'Ordered by row position.',
      data: orderedTrend.slice(0, 18),
    });
  }

  if (selectedStats.includes('forecast')) {
    const lastValue = orderedTrend.length ? orderedTrend[orderedTrend.length - 1].value : 0;
    const firstValue = orderedTrend.length ? orderedTrend[0].value : 0;
    const averageDelta = orderedTrend.length > 1 ? lastValue - firstValue : 0;
    const forecastStep = orderedTrend.length > 3 ? averageDelta / (orderedTrend.length - 1) : averageDelta;
    const forecastData = Array.from({ length: 4 }, (_, index) => ({
      label: `Projected ${index + 1}`,
      value: Math.max(0, Math.round(lastValue + forecastStep * (index + 1))),
    }));
    charts.push({
      id: 'forecast-line',
      title: 'Forward projection',
      type: 'line',
      insight: 'Directional projection based on visible slope (not final forecasting).',
      data: forecastData,
    });
    metrics.push({
      label: 'Projected next point',
      value: forecastData[0]?.value.toLocaleString() || '0',
      insight: 'Short-horizon estimate based on the visible slope.',
    });
  }

  if (selectedStats.includes('health')) {
    charts.push({
      id: 'health-progress',
      title: 'Dataset health',
      type: 'progress',
      insight: 'Stability, coverage, and balance.',
      data: [
        { label: 'Stability', value: stabilityScore },
        { label: 'Coverage', value: coverageScore },
        { label: 'Balance', value: concentrationScore },
      ],
    });
    metrics.push({
      label: 'Dataset health',
      value: `${Math.round((stabilityScore + coverageScore + concentrationScore) / 3)} / 100`,
      insight: 'Blended score for quick stakeholder-ready reporting.',
    });
    metrics.push({
      label: 'Outliers detected',
      value: String(outlierCount),
      insight: outlierBounds ? `IQR bounds: ${outlierBounds.low.toFixed(1)} to ${outlierBounds.high.toFixed(1)}.` : 'Not enough rows to compute IQR bounds.',
    });
  }

  if (lowest && lowest.value === 0) {
    anomalies.push('At least one visible row contains a zero value, which may indicate missing, inactive, or incomplete data.');
  }
  if (lowest && highest && highest.value > lowest.value * 4 && lowest.value > 0) {
    anomalies.push('The spread between the highest and lowest categories is wide enough to merit a variance review.');
  }
  if (coverageScore < 85) {
    anomalies.push('Some numeric cells are missing or non-standard, which can reduce chart accuracy. Consider cleaning formatting in the source sheet.');
  }
  if (outlierCount > 0) {
    anomalies.push(`${outlierCount} potential outlier values detected. Verify whether they are real spikes or data-entry issues.`);
  }

  deepInsights.push({
    id: 'concentration',
    title: 'Concentration profile',
    detail: topThreeShare > 65
      ? `Top 3 contributors account for ${topThreeShare.toFixed(1)}% of total. This dataset is concentrated.`
      : `Top 3 contributors account for ${topThreeShare.toFixed(1)}% of total. This dataset is relatively balanced.`,
    tone: topThreeShare > 65 ? 'warning' : 'positive',
  });
  deepInsights.push({
    id: 'volatility',
    title: 'Volatility signal',
    detail: volatility > 0.6
      ? 'Value dispersion is high relative to the average. Treat this as uneven or outlier-driven.'
      : volatility > 0.3
        ? 'Value dispersion is moderate. Expect some spread but not extreme variance.'
        : 'Value dispersion is low. The dataset looks stable across contributors.',
    tone: volatility > 0.6 ? 'warning' : volatility > 0.3 ? 'neutral' : 'positive',
  });
  deepInsights.push({
    id: 'momentum',
    title: 'Momentum read',
    detail: momentumDelta > 0
      ? `Later rows average about ${momentumDelta.toFixed(1)} above earlier rows, indicating a positive tilt in ordering.`
      : momentumDelta < 0
        ? `Later rows average about ${Math.abs(momentumDelta).toFixed(1)} below earlier rows, indicating a negative tilt in ordering.`
        : 'Earlier and later segments are closely matched, indicating flat momentum.',
    tone: momentumDelta < 0 ? 'warning' : momentumDelta > 0 ? 'positive' : 'neutral',
  });
  deepInsights.push({
    id: 'coverage',
    title: 'Data coverage quality',
    detail: `Numeric coverage across detected measurable fields is ${(numericCoverage * 100).toFixed(1)}%.`,
    tone: numericCoverage < 0.75 ? 'warning' : numericCoverage < 0.9 ? 'neutral' : 'positive',
  });
  deepInsights.push({
    id: 'outliers',
    title: 'Outlier posture',
    detail: outlierCount > 0
      ? 'Some values sit outside typical IQR bounds. If these are genuine spikes, isolate them; if not, treat them as clean-up candidates.'
      : 'No strong IQR outliers were detected in the primary numeric series.',
    tone: outlierCount > 0 ? 'warning' : 'positive',
  });

  if (secondaryMeta && secondaryColumn) {
    const primaryAligned = perRowPrimary.map((row) => row.value).map((value) => value ?? null);
    const secondaryValues = table.rows.map((row) => toNumber(row.cells[secondaryColumn.index] || ''));
    const paired: Array<{ a: number; b: number }> = [];
    for (let index = 0; index < Math.min(primaryAligned.length, secondaryValues.length); index += 1) {
      const a = primaryAligned[index];
      const b = secondaryValues[index];
      if (a === null || b === null) continue;
      paired.push({ a, b });
    }
    if (paired.length >= 6) {
      const correlation = pearsonCorrelation(paired.map((item) => item.a), paired.map((item) => item.b));
      if (correlation !== null) {
        deepInsights.push({
          id: 'correlation',
          title: 'Cross-metric relationship',
          detail: Math.abs(correlation) > 0.7
            ? `${primaryColumn?.label || 'Primary'} and ${secondaryColumn.label} move strongly together in the visible rows.`
            : Math.abs(correlation) > 0.35
              ? `${primaryColumn?.label || 'Primary'} and ${secondaryColumn.label} show a moderate relationship.`
              : `${primaryColumn?.label || 'Primary'} and ${secondaryColumn.label} have a weak relationship and should be interpreted independently.`,
          tone: Math.abs(correlation) > 0.7 ? 'positive' : Math.abs(correlation) > 0.35 ? 'neutral' : 'warning',
        });
      }
    }
  }

  recommendations.push('Edit values in the table and save to refresh charts and export an updated CSV snapshot.');
  if (coverageScore < 90) recommendations.push('Clean inconsistent number formats (currency symbols, mixed units) to improve chart accuracy.');

  return {
    keyMetrics: metrics.slice(0, 6),
    deepInsights: deepInsights.slice(0, 6),
    charts: charts.slice(0, 8),
    highlights: highlights.slice(0, 5),
    anomalies: anomalies.slice(0, 4),
    recommendations: recommendations.slice(0, 5),
  };
}

function computeNarrativeInsights(content: string, selectedStats: VisualizerStatKey[]): Omit<DocumentVisualizationInsights, 'title' | 'documentType' | 'executiveSummary' | 'confidenceScore' | 'availableStats' | 'defaultSelectedStats' | 'table'> {
  const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
  const sentenceCount = content.split(/[.!?]+/).filter((item) => item.trim().length > 0).length;
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const headings = lines.filter((line) => line.length < 80 && !line.endsWith('.') && /[A-Za-z]/.test(line)).slice(0, 6);

  const metrics: VisualizerMetric[] = [];
  const deepInsights: VisualizerDeepInsight[] = [];
  const charts: VisualizerChart[] = [];
  const highlights = [`${wordCount.toLocaleString()} words detected in the visible document content.`];
  const anomalies: string[] = [];
  const recommendations: string[] = [];

  if (selectedStats.includes('structure')) {
    charts.push({
      id: 'structure-progress',
      title: 'Document structure strength',
      type: 'progress',
      insight: 'Shows how well the content appears segmented into readable sections.',
      data: [
        { label: 'Structure', value: Math.min(100, 35 + headings.length * 10) },
        { label: 'Density', value: Math.min(100, Math.round(wordCount / 20)) },
        { label: 'Readability', value: Math.max(20, 100 - Math.round(wordCount / Math.max(1, sentenceCount || 1))) },
      ],
    });
    metrics.push({ label: 'Detected sections', value: headings.length.toString(), insight: 'Visible short-form headings or thematic breaks identified.' });
  }

  if (selectedStats.includes('readability')) {
    metrics.push({ label: 'Word count', value: wordCount.toLocaleString(), insight: 'Useful for sizing overall reading effort.' });
    metrics.push({ label: 'Sentence count', value: sentenceCount.toLocaleString(), insight: 'Gives a rough indication of narrative density.' });
  }

  if (selectedStats.includes('sections')) {
    charts.push({
      id: 'heading-bar',
      title: 'Detected document sections',
      type: 'bar',
      insight: 'Highlights visible headings or section-like markers in the text.',
      data: headings.map((heading, index) => ({ label: heading.slice(0, 24), value: Math.max(25, 100 - index * 8) })),
    });
  }

  if (headings.length <= 1) {
    anomalies.push('The document appears dense and lightly segmented, which can make it harder to review quickly.');
  }
  if (sentenceCount > 40) {
    anomalies.push('Long narrative span detected. Consider summarizing or breaking the content into clearer sub-sections.');
  }
  deepInsights.push({
    id: 'density',
    title: 'Narrative density',
    detail: wordCount > 1200
      ? 'This document is dense enough that most users will need summarization support or clearer sub-structure before acting on it.'
      : wordCount > 500
        ? 'This document has moderate reading weight and would benefit from clear section markers for faster scanning.'
        : 'This document is relatively compact and should be easier to digest at a glance.',
    tone: wordCount > 1200 ? 'warning' : wordCount > 500 ? 'neutral' : 'positive',
  });
  deepInsights.push({
    id: 'sectioning',
    title: 'Sectioning quality',
    detail: headings.length > 4
      ? 'The visible content has enough structural markers to support guided review and section-based decision-making.'
      : headings.length > 1
        ? 'The document shows some structure, but clearer sub-sections would improve readability and review speed.'
        : 'The visible content is weakly sectioned and will likely feel harder to review than necessary.',
    tone: headings.length > 4 ? 'positive' : headings.length > 1 ? 'neutral' : 'warning',
  });
  deepInsights.push({
    id: 'actionability',
    title: 'Actionability read',
    detail: sentenceCount > 0
      ? `With roughly ${sentenceCount} visible sentences, this content is best suited for a summary-first review before downstream actions or approvals are taken.`
      : 'The visible content is too thin to produce a strong narrative actionability read.',
    tone: sentenceCount > 30 ? 'warning' : 'neutral',
  });
  recommendations.push('Add headings, tables, or bullet groups if this document is meant for operational review.');

  return {
    keyMetrics: metrics.slice(0, 4),
    deepInsights: deepInsights.slice(0, 4),
    charts: charts.slice(0, 4),
    highlights: highlights.slice(0, 5),
    anomalies: anomalies.slice(0, 4),
    recommendations: recommendations.slice(0, 4),
  };
}

export function buildInteractiveVisualization(title: string, content: string, table: VisualizerTableData | null, selectedStats: VisualizerStatKey[]) {
  if (table) {
    const core = computeTableInsights(title, table, selectedStats);
    const coveragePoints: number[] = table.rows.length && table.numericColumnIds.length
      ? table.rows.flatMap((row) => table.numericColumnIds.map((columnId) => {
          const column = getColumn(table, columnId);
          return column ? (toNumber(row.cells[column.index] || '') !== null ? 1 : 0) : 0;
        }))
      : [];
    const numericCoverage = coveragePoints.length
      ? coveragePoints.reduce((sum, value) => sum + value, 0) / coveragePoints.length
      : 0;
    const confidenceScore = Math.max(
      55,
      Math.min(
        98,
        Math.round(60 + numericCoverage * 28 + Math.min(1, Math.log10(table.rows.length + 1) / 2) * 10),
      ),
    );
    return {
      title,
      documentType: 'Tabular / spreadsheet-like document',
      executiveSummary: `This document contains structured tabular data. The strongest current visualization opportunity is ${getColumn(table, table.numericColumnIds[0])?.label || 'the primary numeric field'}, which now drives the selected visual outputs.`,
      confidenceScore,
      availableStats: [
        { id: 'totals', label: 'Totals', description: 'Show total-driven comparisons', defaultSelected: true },
        { id: 'averages', label: 'Averages', description: 'Show row averages and readiness', defaultSelected: true },
        { id: 'top-performer', label: 'Top performer', description: 'Highlight the leading row or category', defaultSelected: true },
        { id: 'distribution', label: 'Distribution', description: 'Show share by category', defaultSelected: true },
        { id: 'variance', label: 'Variance / trend', description: 'Show trend or spread across rows', defaultSelected: Boolean(table.numericColumnIds[1]) },
        { id: 'forecast', label: 'Forecast', description: 'Show a short-horizon directional projection', defaultSelected: false },
        { id: 'health', label: 'Data health', description: 'Show stability, balance, and completeness', defaultSelected: true },
      ] satisfies VisualizerStatOption[],
      defaultSelectedStats: ['totals', 'averages', 'top-performer', 'distribution', 'health', ...(table.numericColumnIds[1] ? ['variance' as const] : [])],
      table,
      ...core,
    } satisfies DocumentVisualizationInsights;
  }

  const core = computeNarrativeInsights(content, selectedStats);
  return {
    title,
    documentType: 'Narrative / text-heavy document',
    executiveSummary: 'This document reads more like a narrative or policy-style text than a spreadsheet. The most useful visualization is a structure and readability view instead of numeric business charts.',
    confidenceScore: 74,
    availableStats: [
      { id: 'structure', label: 'Structure', description: 'Show segmentation and density strength', defaultSelected: true },
      { id: 'readability', label: 'Readability', description: 'Show reading effort and density', defaultSelected: true },
      { id: 'sections', label: 'Sections', description: 'Show visible section markers', defaultSelected: true },
    ] satisfies VisualizerStatOption[],
    defaultSelectedStats: ['structure', 'readability', 'sections'],
    table: null,
    ...core,
  } satisfies DocumentVisualizationInsights;
}

export function buildVisualizationInsights(title: string, content: string): DocumentVisualizationInsights {
  const normalizedTitle = title || 'Untitled document';
  const table = parseDelimitedTable(content);
  return buildInteractiveVisualization(normalizedTitle, content, table, table ? ['totals', 'averages', 'top-performer', 'distribution', ...(table.numericColumnIds[1] ? ['variance' as const] : [])] : ['structure', 'readability', 'sections']);
}

export function updateTableCell(table: VisualizerTableData, rowId: string, columnId: string, value: string): VisualizerTableData {
  const column = getColumn(table, columnId);
  if (!column) return table;
  const rows = table.rows.map((row) => row.id === rowId ? {
    ...row,
    cells: row.cells.map((cell, index) => (index === column.index ? value : cell)),
  } : row);
  return {
    ...table,
    rows,
    csvContent: buildCsv(table.columns.map((columnEntry) => columnEntry.label), rows.map((row) => row.cells)),
  };
}
