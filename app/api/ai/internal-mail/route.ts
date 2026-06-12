import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { generateAiText, getAiModelName, isAiConfigured, normalizeAiList, normalizeAiText, parseStructuredJson } from '@/lib/server/ai';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json() as {
      subject?: string;
      body?: string;
      mode?: 'draft' | 'summary';
      threadContext?: string[];
    };

    if (!payload.body?.trim()) {
      return NextResponse.json({ error: 'Mail content is required.' }, { status: 400 });
    }

    if (!isAiConfigured()) {
      return NextResponse.json({
        output: payload.mode === 'summary'
          ? 'AI summary is unavailable right now. Review the latest thread messages and capture action items manually.'
          : `Suggested internal draft:\n\nSubject: ${payload.subject || 'Internal update'}\n\n${payload.body.trim()}`,
        bullets: payload.mode === 'summary'
          ? ['Review latest replies', 'Capture owner and deadline', 'Share next steps internally']
          : ['State the purpose clearly', 'Mention owner and deadline', 'End with an explicit required action'],
        provider: 'Fallback',
      });
    }

    const response = await generateAiText([
      {
        role: 'system',
        content: 'You are docrud internal collaboration AI. Help teams write sharp internal operational mails and summarize threads clearly. Return strict JSON with keys: output, bullets.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          mode: payload.mode || 'draft',
          subject: payload.subject,
          body: payload.body,
          threadContext: payload.threadContext || [],
          actor: session.user.name,
          role: session.user.role,
        }),
      },
    ]);

    const parsed = parseStructuredJson<{ output?: unknown; bullets?: unknown }>(response);
    return NextResponse.json({
      output: normalizeAiText(parsed.output),
      bullets: normalizeAiList(parsed.bullets, 6),
      provider: 'Groq',
      model: getAiModelName(),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to generate internal mail AI response.' }, { status: 500 });
  }
}

