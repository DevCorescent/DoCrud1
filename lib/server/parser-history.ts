import { ParserHistoryEntry } from '@/types/document';
import { parserHistoryPath, readJsonFile, writeJsonFile } from '@/lib/server/storage';

export async function getParserHistory() {
  const entries = await readJsonFile<ParserHistoryEntry[]>(parserHistoryPath, []);
  return [...entries].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

export async function saveParserHistory(entries: ParserHistoryEntry[]) {
  await writeJsonFile(parserHistoryPath, entries);
}

export async function appendParserHistory(entry: ParserHistoryEntry) {
  const entries = await getParserHistory();
  const next = [entry, ...entries.filter((item) => item.id !== entry.id)];
  await saveParserHistory(next);
  return entry;
}

export async function updateParserHistoryEntry(id: string, updater: (entry: ParserHistoryEntry) => ParserHistoryEntry) {
  const entries = await getParserHistory();
  const index = entries.findIndex((entry) => entry.id === id);
  if (index === -1) {
    return null;
  }
  entries[index] = updater(entries[index]);
  await saveParserHistory(entries);
  return entries[index];
}

export async function deleteParserHistoryEntry(id: string) {
  const entries = await getParserHistory();
  const next = entries.filter((entry) => entry.id !== id);
  if (next.length === entries.length) {
    return false;
  }
  await saveParserHistory(next);
  return true;
}
