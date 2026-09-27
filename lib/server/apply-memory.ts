/**
 * What a member has already told an employer, so nobody is asked twice.
 *
 * ═══ WHAT IS KEPT ═══
 *
 * One row per question SIGNATURE per member — see lib/apply/question.ts for how
 * a signature is decided. The value stored is what the person said in their own
 * words ("Yes", "30 days", "₹28,00,000"), never an option index: the next
 * employer's dropdown will be worded and ordered differently, and `chooseOption`
 * maps a remembered answer onto whatever that form offers.
 *
 * ═══ WHAT IS DELIBERATELY NOT KEPT ═══
 *
 * Anything specific to one employer. "Why do you want to work at Northwind?"
 * signs as a question-text signature rather than a taxonomy key, and prose
 * answers are never written here at all — reusing one would send a letter about
 * one company to another, which is the single most embarrassing thing this
 * feature could do.
 *
 * ═══ IT IS THE MEMBER'S, AND ONLY THEIRS ═══
 *
 * Keyed by user id at the top level, so a read can only ever return one
 * member's answers. Nothing here is shared, aggregated or learned across
 * accounts: these are statements a person made about themselves.
 */

import { readJsonFile, writeJsonFile, applyMemoryPath } from '@/lib/server/storage';
import type { RememberedAnswer } from '@/lib/apply/question';

type Store = Record<string, RememberedAnswer[]>;

/** A member cannot need more distinct remembered answers than this, and a cap
    stops a hostile client turning the store into a log. Oldest go first. */
const MAX_PER_USER = 200;
const MAX_VALUE = 2000;

async function readStore(): Promise<Store> {
  const raw = await readJsonFile<Store>(applyMemoryPath, {});
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

export async function getApplyMemory(userId: string): Promise<RememberedAnswer[]> {
  if (!userId) return [];
  const store = await readStore();
  const rows = store[userId];
  return Array.isArray(rows) ? rows : [];
}

/**
 * Record an answer, or update the one already there.
 *
 * `uses` counts how many forms a value has now filled, which is what orders
 * suggestions when a member has answered the same question differently before.
 * Re-answering REPLACES the value rather than adding a second row: the most
 * recent statement is the true one, and offering someone two contradictory
 * salary expectations is worse than offering none.
 */
export async function rememberAnswer(
  userId: string,
  entry: { signature: string; value: string; prompt: string },
): Promise<void> {
  const signature = entry.signature?.trim();
  const value = entry.value?.trim().slice(0, MAX_VALUE);
  if (!userId || !signature || !value) return;

  const store = await readStore();
  const rows = Array.isArray(store[userId]) ? [...store[userId]] : [];
  const at = rows.findIndex((r) => r.signature === signature);
  const now = new Date().toISOString();

  if (at >= 0) {
    rows[at] = {
      ...rows[at],
      value,
      prompt: entry.prompt?.trim().slice(0, 300) || rows[at].prompt,
      uses: (rows[at].uses ?? 0) + 1,
      updatedAt: now,
    };
  } else {
    rows.push({
      signature,
      value,
      prompt: entry.prompt?.trim().slice(0, 300) || '',
      uses: 1,
      updatedAt: now,
    });
  }

  /* Newest first, and trimmed. A member who has answered two hundred distinct
     questions is not losing anything they will be asked again soon. */
  rows.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  store[userId] = rows.slice(0, MAX_PER_USER);
  await writeJsonFile(applyMemoryPath, store);
}

/** Forget one answer, or all of them. The member has to be able to take back
    something they said — particularly salary, which they may have answered once
    and then thought better of. */
export async function forgetAnswer(userId: string, signature?: string): Promise<void> {
  if (!userId) return;
  const store = await readStore();
  if (!store[userId]) return;
  store[userId] = signature
    ? store[userId].filter((r) => r.signature !== signature)
    : [];
  await writeJsonFile(applyMemoryPath, store);
}
