import { getGigCategories, getGigInterests, getPublicGigListings } from '@/lib/server/gigs';

export const dynamic = 'force-dynamic';

function sseMessage(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET() {
  const encoder = new TextEncoder();
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let lastPayload = '';

      const push = (chunk: string) => {
        controller.enqueue(encoder.encode(chunk));
      };

      const loadPayload = async () => {
        const [gigs, categories, interests] = await Promise.all([
          getPublicGigListings(),
          getGigCategories(),
          getGigInterests(),
        ]);
        return { gigs, categories, interests, generatedAt: new Date().toISOString() };
      };

      const tick = async () => {
        try {
          const payload = await loadPayload();
          const serialized = JSON.stringify(payload);
          if (serialized !== lastPayload) {
            lastPayload = serialized;
            push(sseMessage('gigs', payload));
          }
        } catch (error) {
          push(sseMessage('error', { error: error instanceof Error ? error.message : 'Unable to load gigs.' }));
        }
      };

      // Initial payload
      void tick();

      tickTimer = setInterval(() => void tick(), 5000);
      pingTimer = setInterval(() => push(': ping\n\n'), 15000);
    },
    cancel() {
      if (tickTimer) clearInterval(tickTimer);
      if (pingTimer) clearInterval(pingTimer);
      tickTimer = null;
      pingTimer = null;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
