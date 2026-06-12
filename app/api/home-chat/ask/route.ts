import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { appendHomepageAiThreadMessage, getHomepageAiThread } from '@/lib/server/homepage-ai-chats';
import { compactHistory, generateAiText, getAiModelName, isAiConfigured } from '@/lib/server/ai';
import { getHistoryEntries } from '@/lib/server/history';
import { runGlobalSearch } from '@/lib/server/global-search';
import { assistantCardToPlainText, generateAssistantCard } from '@/lib/server/doc-assistant';
import type { DocumentQuickAction, UploadedDocument } from '@/types/doc-assistant';

export const dynamic = 'force-dynamic';

function stripMarkdown(text: string): string {
  return text
    // headers
    .replace(/^#{1,6}\s+/gm, '')
    // bold / italic (**, __, *, _)
    .replace(/(\*{1,3}|_{1,3})(.*?)\1/g, '$2')
    // inline code
    .replace(/`{1,3}[^`]*`{1,3}/g, (m) => m.replace(/`/g, '').trim())
    // fenced code blocks
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```[^\n]*/g, '').trim())
    // strikethrough
    .replace(/~~(.*?)~~/g, '$1')
    // blockquotes
    .replace(/^>\s+/gm, '')
    // unordered list markers
    .replace(/^[\s]*[-*+]\s+/gm, '')
    // ordered list markers
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // links [text](url) → text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // bare URLs leftover
    .replace(/!?\[([^\]]*)\]/g, '$1')
    // collapse 3+ newlines to 2
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

type AskPayload = {
  threadId?: string;
  message?: string;
  action?: DocumentQuickAction;
  selection?: string;
  document?: UploadedDocument;
};

function safeTrim(value: unknown) {
  return String(value || '').trim();
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as AskPayload;
    const message = safeTrim(payload?.message);
    const threadId = safeTrim(payload?.threadId);
    const action = safeTrim(payload?.action) as DocumentQuickAction;
    const selection = safeTrim(payload?.selection);

    if (!message && !action) {
      return NextResponse.json({ error: 'Message or action is required' }, { status: 400 });
    }

    const session = await getAuthSession();
    const isAuthed = Boolean(session?.user?.id);

    if (!isAiConfigured()) {
      return NextResponse.json({ error: 'AI is not configured. Add GROQ_API_KEY to enable AI features.' }, { status: 503 });
    }

    const portalResults = await runGlobalSearch({
      query: message || `document ${action || ''}`.trim(),
      user: session?.user?.id
        ? {
            id: session.user.id,
            email: session.user.email,
            role: session.user.role,
            permissions: session.user.permissions,
          }
        : null,
      limit: 8,
    });

    let workspaceContext: any = null;
    if (isAuthed) {
      const history = await getHistoryEntries();
      workspaceContext = {
        user: { role: session?.user?.role, name: session?.user?.name, email: session?.user?.email },
        recentHistory: compactHistory(history).slice(0, 80),
      };
    }

    const document = payload?.document;
    const mustUseCard = Boolean(document || action);

    let card = null;
    let simpleContent = '';

    if (mustUseCard) {
      card = await generateAssistantCard({
        action: action || undefined,
        userQuestion: message || (action ? `Run ${action} on the uploaded document.` : 'Answer the user question.'),
        extractedText: document?.extractedText,
        meta: document?.meta,
        selection: selection || undefined,
      });
      simpleContent = assistantCardToPlainText(card);
    } else {
      // Simple conversation mode
      simpleContent = await generateAiText([
        {
          role: 'system',
          content:
            'You are doCRUD AI, a helpful and professional document assistant. ' +
            'Answer the user query simply and concisely in plain text only. ' +
            'Never use markdown, bullet points, numbered lists, headers, asterisks, pound signs, backticks, underscores, or any other special formatting characters. ' +
            'Write in natural prose sentences and paragraphs only.',
        },
        { role: 'user', content: message },
      ]);
    }

    // Strip any markdown formatting that slipped through
    simpleContent = stripMarkdown(simpleContent);

    const sources = portalResults.slice(0, 6).map((r) => ({
      title: r.title,
      href: r.href,
      description: r.description,
      badge: r.badge,
      category: r.category,
    }));

    if (isAuthed && threadId) {
      const existing = await getHomepageAiThread(session!.user!.id, threadId);
      if (!existing) {
        return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
      }

      await appendHomepageAiThreadMessage(session!.user!.id, threadId, { role: 'user', content: message || `[Action: ${action}]` });
      await appendHomepageAiThreadMessage(session!.user!.id, threadId, { role: 'assistant', content: simpleContent });
    }

    return NextResponse.json({
      card,
      content: simpleContent,
      sources,
      provider: 'Groq',
      model: getAiModelName(),
      saved: Boolean(isAuthed && threadId),
      workspaceContext: workspaceContext ? { included: true } : { included: false },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to answer' }, { status: 500 });
  }
}

