import { homepageAiChatsPath, readJsonFile, writeJsonFile } from '@/lib/server/storage';

export type HomepageAiChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

export type HomepageAiChatThread = {
  id: string;
  ownerUserId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: HomepageAiChatMessage[];
};

type HomepageAiChatStore = {
  threads: HomepageAiChatThread[];
};

function summarizeTitleFromText(text: string) {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'New chat';
  return cleaned.length > 44 ? `${cleaned.slice(0, 44)}…` : cleaned;
}

export async function getHomepageAiChatStore(): Promise<HomepageAiChatStore> {
  return readJsonFile<HomepageAiChatStore>(homepageAiChatsPath, { threads: [] });
}

export async function listHomepageAiThreads(ownerUserId: string) {
  const store = await getHomepageAiChatStore();
  return store.threads
    .filter((thread) => thread.ownerUserId === ownerUserId)
    .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt))
    .map((thread) => ({
      id: thread.id,
      title: thread.title,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      messageCount: thread.messages.length,
      preview: thread.messages.slice(-1)[0]?.content?.slice(0, 120) || '',
    }));
}

export async function getHomepageAiThread(ownerUserId: string, threadId: string) {
  const store = await getHomepageAiChatStore();
  const thread = store.threads.find((t) => t.id === threadId && t.ownerUserId === ownerUserId) || null;
  return thread;
}

export async function createHomepageAiThread(ownerUserId: string, title?: string) {
  const store = await getHomepageAiChatStore();
  const now = new Date().toISOString();
  const thread: HomepageAiChatThread = {
    id: crypto.randomUUID(),
    ownerUserId,
    title: (title || 'New chat').trim().slice(0, 80) || 'New chat',
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  const next: HomepageAiChatStore = {
    threads: [thread, ...store.threads].slice(0, 1500),
  };
  await writeJsonFile(homepageAiChatsPath, next);
  return thread;
}

export async function appendHomepageAiThreadMessage(
  ownerUserId: string,
  threadId: string,
  message: Omit<HomepageAiChatMessage, 'id' | 'createdAt'> & { createdAt?: string; id?: string },
) {
  const store = await getHomepageAiChatStore();
  const now = new Date().toISOString();
  const nextThreads = store.threads.map((thread) => {
    if (thread.id !== threadId || thread.ownerUserId !== ownerUserId) return thread;
    const nextMessage: HomepageAiChatMessage = {
      id: message.id || crypto.randomUUID(),
      role: message.role,
      content: String(message.content || '').slice(0, 18_000),
      createdAt: message.createdAt || now,
    };

    const nextMessages = [...thread.messages, nextMessage].slice(-220);
    const inferredTitle = thread.title === 'New chat' && nextMessage.role === 'user'
      ? summarizeTitleFromText(nextMessage.content)
      : thread.title;
    return {
      ...thread,
      title: inferredTitle,
      updatedAt: now,
      messages: nextMessages,
    };
  });

  const exists = nextThreads.some((thread) => thread.id === threadId && thread.ownerUserId === ownerUserId);
  if (!exists) {
    throw new Error('Chat not found');
  }
  await writeJsonFile(homepageAiChatsPath, { threads: nextThreads });
}

export async function deleteHomepageAiThread(ownerUserId: string, threadId: string) {
  const store = await getHomepageAiChatStore();
  const nextThreads = store.threads.filter((thread) => !(thread.id === threadId && thread.ownerUserId === ownerUserId));
  await writeJsonFile(homepageAiChatsPath, { threads: nextThreads });
}

