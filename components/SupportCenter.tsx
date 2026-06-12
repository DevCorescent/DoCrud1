'use client';

import { useState } from 'react';
import { fireSearchEvent, SEARCH_CONTEXTS } from '@/lib/search-tracking';
import { ArrowRight, Loader2, MessageSquareText, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supportFaqs, supportQuickPrompts } from '@/lib/support-faqs';

type SupportResponse = {
  answer: string;
  bullets?: string[];
  suggestedActions?: string[];
  relatedFaqs?: Array<{
    id: string;
    category: string;
    question: string;
    answer: string;
    actions: string[];
  }>;
  confidenceLabel?: string;
  provider?: string;
  model?: string;
};

type SupportMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  bullets?: string[];
  meta?: string;
};

export default function SupportCenter() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [mobilePane, setMobilePane] = useState<'chat' | 'actions'>('chat');
  const [messages, setMessages] = useState<SupportMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Ask anything about docrud. I will guide you to the right screen and the next action.',
      meta: 'Online',
    },
  ]);
  const [lastResponse, setLastResponse] = useState<SupportResponse | null>(null);
  const [error, setError] = useState('');

  const submitSupportQuery = async (preset?: string) => {
    const value = (preset ?? query).trim();
    if (!value) {
      return;
    }

    fireSearchEvent({ query: value, context: SEARCH_CONTEXTS.SUPPORT });
    setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: 'user', text: value }]);
    setQuery('');
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/ai/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: value }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'AI support is unavailable right now.');
      }

      setLastResponse(payload);
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text: payload.answer || 'No answer returned.',
          bullets: Array.isArray(payload.bullets) ? payload.bullets : undefined,
          meta: payload.confidenceLabel || payload.provider,
        },
      ]);
    } catch (supportError) {
      setError(supportError instanceof Error ? supportError.message : 'AI support is unavailable right now.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="cloud-panel overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-xl font-semibold tracking-tight text-slate-950">
              <MessageSquareText className="h-5 w-5 text-slate-900" />
              AI Support
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-medium text-slate-700 backdrop-blur">
                <Sparkles className="h-3.5 w-3.5 text-slate-900" />
                Product help
              </span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50/70 px-3 py-1 text-xs font-medium text-emerald-800 backdrop-blur">
                Online
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="border-b border-slate-200/70 p-3 sm:p-4 lg:hidden">
            <Tabs value={mobilePane} onValueChange={(value) => setMobilePane(value as typeof mobilePane)}>
              <TabsList className="w-full rounded-2xl bg-white/60 p-1 backdrop-blur">
                <TabsTrigger value="chat" className="flex-1 rounded-xl">Chat</TabsTrigger>
                <TabsTrigger value="actions" className="flex-1 rounded-xl">Actions</TabsTrigger>
              </TabsList>
              <TabsContent value="chat" className="mt-3">
                {/* mobile chat renders below via conditional blocks */}
              </TabsContent>
              <TabsContent value="actions" className="mt-3">
                {/* mobile actions renders below via conditional blocks */}
              </TabsContent>
            </Tabs>
          </div>

          <div className="grid min-w-0 gap-0 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className={`min-w-0 ${mobilePane === 'actions' ? 'hidden lg:flex' : 'flex'} flex-col border-slate-200/70 lg:border-r`}>
              <div className="flex min-h-[520px] flex-1 flex-col gap-3 p-4 sm:p-5 lg:min-h-[620px]">
                <div className="min-h-0 flex-1 space-y-3 overflow-auto pr-1">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`rounded-2xl border px-4 py-3 backdrop-blur ${message.role === 'assistant' ? 'border-slate-200 bg-white/75' : 'ml-auto max-w-[92%] border-slate-900/10 bg-slate-950 text-white'}`}
                    >
                      {message.meta ? (
                        <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${message.role === 'assistant' ? 'text-slate-500' : 'text-white/70'}`}>
                          {message.meta}
                        </p>
                      ) : null}
                      <p className={`mt-1 text-sm leading-7 ${message.role === 'assistant' ? 'text-slate-800' : 'text-white'}`}>{message.text}</p>
                      {message.bullets?.length ? (
                        <div className="mt-2 space-y-2">
                          {message.bullets.slice(0, 6).map((bullet) => (
                            <div key={bullet} className={`flex items-start gap-2 text-sm ${message.role === 'assistant' ? 'text-slate-700' : 'text-white/85'}`}>
                              <span className={`mt-2 h-1.5 w-1.5 rounded-full ${message.role === 'assistant' ? 'bg-slate-900' : 'bg-white'}`} />
                              <span>{bullet}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}

                  {loading ? (
                    <div className="rounded-2xl border border-slate-200 bg-white/75 px-4 py-3 text-sm text-slate-700 backdrop-blur">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Thinking…
                      </div>
                    </div>
                  ) : null}
                </div>

                {error ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-sm text-rose-800 backdrop-blur">
                    {error}
                  </div>
                ) : null}

                <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 backdrop-blur">
                  <div className="flex gap-2 overflow-auto pb-2">
                    {supportQuickPrompts.map((prompt) => (
                      <Button
                        key={prompt}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 rounded-full bg-white/70"
                        onClick={() => void submitSupportQuery(prompt)}
                        disabled={loading}
                      >
                        {prompt}
                      </Button>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                    <textarea
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Ask a product question"
                      className="min-h-[110px] w-full rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-slate-300"
                    />
                    <Button
                      type="button"
                      className="rounded-2xl bg-slate-950 px-5 text-white hover:bg-slate-900 sm:self-stretch"
                      onClick={() => void submitSupportQuery()}
                      disabled={loading}
                    >
                      Ask
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className={`${mobilePane === 'chat' ? 'hidden lg:block' : 'block'} min-w-0 border-t border-slate-200/70 p-4 lg:border-t-0 lg:p-5`}>
              <div className="space-y-4">
                <div className="cloud-panel rounded-2xl p-4">
                  <p className="text-sm font-semibold text-slate-950">Suggested actions</p>
                  <div className="mt-3 space-y-2">
                    {(lastResponse?.suggestedActions?.length ? lastResponse.suggestedActions : supportFaqs[0].actions).slice(0, 6).map((item) => (
                      <div key={item} className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 backdrop-blur">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="cloud-panel rounded-2xl p-4">
                  <p className="text-sm font-semibold text-slate-950">Popular prompts</p>
                  <div className="mt-3 space-y-2">
                    {supportFaqs.slice(0, 6).map((faq) => (
                      <button
                        key={faq.id}
                        type="button"
                        onClick={() => void submitSupportQuery(faq.question)}
                        className="w-full rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-left text-sm text-slate-900 transition hover:border-slate-300 hover:bg-white"
                      >
                        {faq.question}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
