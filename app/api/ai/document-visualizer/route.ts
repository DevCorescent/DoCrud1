import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { buildVisualizationInsights } from '@/lib/document-visualizer-analysis';
import { generateAiText, getAiModelName, isAiConfigured, normalizeAiList, normalizeAiText, parseStructuredJson } from '@/lib/server/ai';
import { preserveDocumentStructure, stripHtmlPreserveStructure } from '@/lib/document-parser-analysis';
import { consumeAiUsageByEmail, getAiEntitlementSnapshot } from '@/lib/server/saas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type VisualizerResponse = ReturnType<typeof buildVisualizationInsights> & {
  provider: string;
  model: string;
  sourceType: 'paste' | 'preview';
};

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role === 'client' || session.user.role === 'individual') {
      const storedUser = (await getStoredUsers()).find((user) => user.email === session.user.email);
      const aiEntitlement = storedUser ? await getAiEntitlementSnapshot(storedUser) : null;
      if (!aiEntitlement?.allowed) {
        return NextResponse.json({ error: 'Your free AI tries are used up. Upgrade to docrud Workspace Pro to continue using Visualizer AI.' }, { status: 403 });
      }
    }

    const payload = await request.json() as {
      title?: string;
      content?: string;
      sourceType?: 'paste' | 'preview';
    };

    const title = payload.title || 'Untitled document';
    const sourceType = payload.sourceType || 'paste';
    const normalizedContent = preserveDocumentStructure(stripHtmlPreserveStructure(payload.content || '')).slice(0, 18000);

    if (!normalizedContent.trim()) {
      return NextResponse.json({ error: 'Document content is required for visualization.' }, { status: 400 });
    }

    const fallback = buildVisualizationInsights(title, normalizedContent);

    if (!isAiConfigured()) {
      return NextResponse.json({
        ...fallback,
        provider: 'Fallback visualizer',
        model: 'local-visual-heuristics',
        sourceType,
      } satisfies VisualizerResponse);
    }

    const raw = await generateAiText([
      {
        role: 'system',
        content: [
          'You are an enterprise AI document visualizer.',
          'Convert document content into trustworthy visualization guidance and chart-ready output.',
          'Return strict JSON only.',
          'Keys: documentType, executiveSummary, confidenceScore, keyMetrics, charts, highlights, anomalies, recommendations.',
          'keyMetrics must be an array of objects with label, value, insight.',
          'charts must be an array of objects with id, title, type, insight, data.',
          'Supported chart types: bar, line, donut, progress.',
          'Each chart data item must be an object with label and numeric value.',
          'Prefer operationally useful charts, not decorative charts.',
          'If the document is narrative, produce structural and readability visualizations instead of pretending numeric data exists.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({
          title,
          sourceType,
          content: normalizedContent.slice(0, 14000),
        }),
      },
    ]);

    const parsed = parseStructuredJson<{
      documentType?: unknown;
      executiveSummary?: unknown;
      confidenceScore?: unknown;
      keyMetrics?: Array<Record<string, unknown>>;
      deepInsights?: Array<Record<string, unknown>>;
      charts?: Array<Record<string, unknown>>;
      highlights?: unknown;
      anomalies?: unknown;
      recommendations?: unknown;
    }>(raw);

    const response: VisualizerResponse = {
      title,
      documentType: normalizeAiText(parsed.documentType) || fallback.documentType,
      executiveSummary: normalizeAiText(parsed.executiveSummary) || fallback.executiveSummary,
      confidenceScore: Number(parsed.confidenceScore) > 0 ? Math.min(100, Math.max(0, Math.round(Number(parsed.confidenceScore)))) : fallback.confidenceScore,
      keyMetrics: Array.isArray(parsed.keyMetrics) && parsed.keyMetrics.length
        ? parsed.keyMetrics.slice(0, 6).map((item, index) => ({
            label: normalizeAiText(item.label) || fallback.keyMetrics[index]?.label || `Metric ${index + 1}`,
            value: normalizeAiText(item.value) || fallback.keyMetrics[index]?.value || 'N/A',
            insight: normalizeAiText(item.insight) || fallback.keyMetrics[index]?.insight || '',
          }))
        : fallback.keyMetrics,
      deepInsights: Array.isArray(parsed.deepInsights) && parsed.deepInsights.length
        ? parsed.deepInsights.slice(0, 6).map((item, index) => ({
            id: normalizeAiText(item.id) || fallback.deepInsights[index]?.id || `insight-${index + 1}`,
            title: normalizeAiText(item.title) || fallback.deepInsights[index]?.title || `Insight ${index + 1}`,
            detail: normalizeAiText(item.detail) || fallback.deepInsights[index]?.detail || '',
            tone: item.tone === 'positive' || item.tone === 'neutral' || item.tone === 'warning'
              ? item.tone
              : fallback.deepInsights[index]?.tone || 'neutral',
          }))
        : fallback.deepInsights,
      charts: Array.isArray(parsed.charts) && parsed.charts.length
        ? parsed.charts.slice(0, 6).map((item, index) => ({
            id: normalizeAiText(item.id) || fallback.charts[index]?.id || `chart-${index + 1}`,
            title: normalizeAiText(item.title) || fallback.charts[index]?.title || `Chart ${index + 1}`,
            type: item.type === 'bar' || item.type === 'line' || item.type === 'donut' || item.type === 'progress'
              ? item.type
              : fallback.charts[index]?.type || 'bar',
            insight: normalizeAiText(item.insight) || fallback.charts[index]?.insight || '',
            data: Array.isArray(item.data) && item.data.length
              ? item.data.slice(0, 12).map((datum, datumIndex) => ({
                  label: normalizeAiText((datum as Record<string, unknown>).label) || `Point ${datumIndex + 1}`,
                  value: Number((datum as Record<string, unknown>).value) || 0,
                }))
              : fallback.charts[index]?.data || [],
          }))
        : fallback.charts,
      highlights: normalizeAiList(parsed.highlights, 5),
      anomalies: normalizeAiList(parsed.anomalies, 4),
      recommendations: normalizeAiList(parsed.recommendations, 4),
      availableStats: fallback.availableStats,
      defaultSelectedStats: fallback.defaultSelectedStats,
      table: fallback.table,
      provider: 'Groq',
      model: getAiModelName(),
      sourceType,
    };

    if (session.user.email && (session.user.role === 'client' || session.user.role === 'individual')) {
      await consumeAiUsageByEmail(session.user.email);
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to visualize document' }, { status: 500 });
  }
}
