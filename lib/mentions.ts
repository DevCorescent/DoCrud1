/**
 * @mentions — one shared model for the composers, the renderers and the API.
 *
 * A mention is stored as the mentioned user's stable id. The visible text keeps
 * the display name the author picked ("@Aman Tiwari"), so the body still reads
 * naturally on its own and still counts towards the existing publication body
 * limit. Nothing is embedded in the text itself: `mentionedUserIds` rides
 * alongside it as structured metadata on the row that already holds the
 * content, so no new collection or schema is involved.
 *
 * Renaming: a mention resolves through the id, and the renderer links the
 * occurrences of that user's *current* name. An author who is renamed after
 * being mentioned keeps the old name in the stored text, so that occurrence
 * stops linking — the reference itself is never lost.
 */

/** A user as the composer and the renderer need them — nothing private. */
export type MentionUser = {
  id: string;
  name: string;
  headline?: string | null;
  avatarUrl?: string | null;
};

/** The mention metadata a read API returns alongside the content. */
export type ResolvedMention = {
  userId: string;
  name: string;
  avatarUrl?: string | null;
};

/** Most mention references one publication or comment may carry. */
export const MAX_MENTIONS_PER_CONTENT = 25;

/** Longest "@…" the composer keeps searching on before giving up. */
const MAX_QUERY_LENGTH = 32;

/** Display names run to two words comfortably; a third space ends the token. */
const MAX_QUERY_SPACES = 2;

/** The profile route the rest of the app already links people to. */
export function mentionProfileHref(userId: string): string {
  return `/u/${encodeURIComponent(userId)}`;
}

/**
 * The "@…" token the caret currently sits in, if any.
 *
 * The trigger works mid-sentence, so the only requirement is that the `@`
 * starts a word — that is what keeps an email address from opening the picker.
 */
export function activeMentionQuery(
  text: string,
  caret: number,
): { query: string; start: number } | null {
  if (caret < 0 || caret > text.length) return null;

  for (let i = caret - 1; i >= 0 && caret - i <= MAX_QUERY_LENGTH + 1; i -= 1) {
    const ch = text[i];
    if (ch === '\n') return null;
    if (ch !== '@') continue;

    /* "@" has to start a word: line start, or preceded by whitespace or an
       opening bracket. `name@example.com` therefore never triggers. */
    const before = i === 0 ? '' : text[i - 1];
    if (before && !/[\s(\[{<"'—–-]/.test(before)) return null;

    const query = text.slice(i + 1, caret);
    if (query.length > MAX_QUERY_LENGTH) return null;
    /* A space straight after "@" is someone typing an address or a stray
       character, not a name. */
    if (/^\s/.test(query)) return null;
    if ((query.match(/\s/g) ?? []).length > MAX_QUERY_SPACES) return null;

    return { query, start: i };
  }
  return null;
}

/**
 * Replace the active "@…" token with the chosen name and report where the
 * caret belongs — after the trailing space, so typing simply continues.
 */
export function applyMention(
  text: string,
  start: number,
  caret: number,
  name: string,
): { text: string; caret: number } {
  const inserted = `@${name} `;
  const next = text.slice(0, start) + inserted + text.slice(caret);
  return { text: next, caret: start + inserted.length };
}

/** The exact visible form a mention takes in the text. */
export function mentionToken(name: string): string {
  return `@${name}`;
}

/**
 * Drop the mentions whose visible "@Name" the author has since deleted, and
 * collapse repeats — the same person named twice is one reference, while both
 * occurrences still render as mentions.
 */
export function reconcileMentions<T extends { id: string; name: string }>(
  text: string,
  tracked: readonly T[],
): T[] {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const user of tracked) {
    if (seen.has(user.id)) continue;
    if (!text.includes(mentionToken(user.name))) continue;
    seen.add(user.id);
    kept.push(user);
  }
  return kept.slice(0, MAX_MENTIONS_PER_CONTENT);
}

export type MentionSegment =
  | { type: 'text'; value: string }
  | { type: 'mention'; value: string; userId: string };

/**
 * Split content into plain runs and mention runs so a renderer can link the
 * mentions without interpreting anything else in the text as markup.
 *
 * Longer names are matched first, so "@Aman Tiwari" is never cut short by a
 * separate "@Aman" mention in the same content.
 */
export function segmentMentions(
  text: string,
  mentions: readonly ResolvedMention[],
): MentionSegment[] {
  const usable = mentions
    .filter((m) => m.userId && m.name)
    .sort((a, b) => b.name.length - a.name.length);
  if (usable.length === 0 || !text) return text ? [{ type: 'text', value: text }] : [];

  const segments: MentionSegment[] = [];
  let buffer = '';
  let i = 0;

  outer: while (i < text.length) {
    if (text[i] === '@') {
      const before = i === 0 ? '' : text[i - 1];
      if (!before || /[\s(\[{<"'—–-]/.test(before)) {
        for (const m of usable) {
          const token = mentionToken(m.name);
          if (text.startsWith(token, i)) {
            /* Only a word boundary ends a mention, so "@Ann" does not match
               inside "@Anna". */
            const after = text[i + token.length];
            if (!after || /[\s.,!?;:)\]}'"—–-]/.test(after)) {
              if (buffer) { segments.push({ type: 'text', value: buffer }); buffer = ''; }
              segments.push({ type: 'mention', value: token, userId: m.userId });
              i += token.length;
              continue outer;
            }
          }
        }
      }
    }
    buffer += text[i];
    i += 1;
  }

  if (buffer) segments.push({ type: 'text', value: buffer });
  return segments;
}

/** Normalise whatever a client sent into a clean, bounded list of ids. */
export function normaliseMentionIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (!id || id.length > 128 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_MENTIONS_PER_CONTENT) break;
  }
  return out;
}
