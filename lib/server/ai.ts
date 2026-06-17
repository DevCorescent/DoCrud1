import { DashboardMetrics, DocumentHistory } from '@/types/document';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function normalizeValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((item) => normalizeValue(item)).filter(Boolean).join(', ');
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}: ${normalizeValue(item)}`)
      .filter(Boolean)
      .join(' | ');
  }
  return '';
}

export function isAiConfigured() {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return false;
  if (key.startsWith('your-') || key === 'GROQ_API_KEY' || key === 'placeholder') return false;
  return true;
}

function getApiKey() {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('AI is not configured. Add GROQ_API_KEY to enable AI-powered features.');
  }
  return apiKey;
}

export function getAiModelName() {
  return process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL;
}

export async function generateAiText(messages: AiMessage[], options?: { jsonMode?: boolean }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  let response: Response;
  try {
    response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getApiKey()}`,
      },
      body: JSON.stringify({
        model: getAiModelName(),
        messages,
        temperature: 0.2,
        ...(options?.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Groq request timed out. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq request failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json() as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  return payload.choices?.[0]?.message?.content?.trim() || '';
}

export function normalizeAiText(value: unknown) {
  return normalizeValue(value);
}

export function normalizeAiList(value: unknown, limit = 5) {
  if (!Array.isArray(value)) {
    const single = normalizeValue(value);
    return single ? [single].slice(0, limit) : [];
  }

  return value
    .map((item) => normalizeValue(item))
    .filter(Boolean)
    .slice(0, limit);
}

export function parseStructuredJson<T>(text: string): T {
  const normalized = text.trim();
  try {
    return JSON.parse(normalized) as T;
  } catch {
    const fenced = normalized.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    if (fenced) {
      return JSON.parse(fenced) as T;
    }

    const objectStart = normalized.indexOf('{');
    const objectEnd = normalized.lastIndexOf('}');
    if (objectStart !== -1 && objectEnd !== -1 && objectEnd > objectStart) {
      return JSON.parse(normalized.slice(objectStart, objectEnd + 1)) as T;
    }

    throw new Error('AI returned an invalid structured response.');
  }
}

export function compactHistory(history: DocumentHistory[], limit = 8) {
  return history.slice(0, limit).map((item) => ({
    id: item.id,
    templateName: item.templateName,
    referenceNumber: item.referenceNumber,
    generatedAt: item.generatedAt,
    generatedBy: item.generatedBy,
    recipientAccess: item.recipientAccess,
    verificationStatus: item.documentsVerificationStatus,
    dataCollectionStatus: item.dataCollectionStatus,
    openCount: item.openCount || 0,
    downloadCount: item.downloadCount || 0,
    editCount: item.editCount || 0,
    commentCount: (item.collaborationComments || []).length,
    signed: Boolean(item.recipientSignedAt),
    lastActivity: item.accessEvents?.[0]?.createdAt,
  }));
}

export function compactDashboard(dashboard: DashboardMetrics) {
  return {
    totalDocuments: dashboard.totalDocuments,
    documentsThisWeek: dashboard.documentsThisWeek,
    emailsSent: dashboard.emailsSent,
    templatesUsed: dashboard.templatesUsed,
    topTemplates: dashboard.topTemplates.slice(0, 5),
    recentFeedback: dashboard.recentFeedback.slice(0, 4).map((item) => ({
      templateName: item.templateName,
      referenceNumber: item.referenceNumber,
      authorName: item.authorName,
      message: item.message,
      replied: Boolean(item.replyMessage),
    })),
    documentSummary: dashboard.documentSummary.slice(0, 6).map((item) => ({
      templateName: item.templateName,
      referenceNumber: item.referenceNumber,
      openCount: item.openCount,
      downloadCount: item.downloadCount,
      editCount: item.editCount,
      pendingFeedbackCount: item.pendingFeedbackCount,
    })),
  };
}

export function parseBullets(text: string) {
  return text
    .split('\n')
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
}
