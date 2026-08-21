/**
 * Side effects of being mentioned in a comment: one in-app notification and
 * one chat message, each delivered at most once per (comment, person).
 *
 * Everything here reuses what the app already has — social events for the
 * notification, the existing conversation/message store for the chat — so a
 * mention does not introduce a second notification or messaging system.
 *
 * Delivery is keyed on `commentId:mentionedUserId` and recorded in a small
 * ledger. That makes the whole operation idempotent: editing a comment,
 * re-rendering it, retrying a failed request or replaying the same payload all
 * resolve to the same key and deliver nothing further. A person newly added to
 * an edited comment has no ledger entry yet, so they are notified once.
 */
import { readJsonFile, writeJsonFile, mentionDeliveriesPath } from '@/lib/server/storage';
import { addSocialEvent } from '@/lib/server/social-events';
import { getOrCreateConversation, sendMessage } from '@/lib/server/messages';

type Ledger = Record<string, string>;   // "commentId:userId" → ISO timestamp

const key = (commentId: string, userId: string) => `${commentId}:${userId}`;

export type MentionDelivery = {
  commentId: string;
  publicationId: string;
  publicationTitle: string;
  /** Deep link to the publication (and its comments). */
  href: string;
  actorId: string;
  actorName: string;
  /** Already validated against real, visible users by the caller. */
  mentionedIds: string[];
  /** Plain-text comment, mention markup already stripped. */
  preview: string;
};

/**
 * Notifies and messages everyone in `mentionedIds` who has not already been
 * told about this comment. The author is never notified about their own
 * mention, and a repeated id in one comment collapses to a single delivery.
 *
 * Failures are contained per person: one undeliverable chat message does not
 * stop the rest, and nothing here can fail the comment that triggered it.
 */
export async function deliverMentions(input: MentionDelivery): Promise<string[]> {
  const unique = Array.from(new Set(input.mentionedIds)).filter((id) => id && id !== input.actorId);
  if (unique.length === 0) return [];

  const ledger = await readJsonFile<Ledger>(mentionDeliveriesPath, {});
  const pending = unique.filter((id) => !ledger[key(input.commentId, id)]);
  if (pending.length === 0) return [];

  const excerpt = input.preview.slice(0, 140);
  const delivered: string[] = [];

  for (const userId of pending) {
    try {
      await addSocialEvent({
        type: 'mention',
        actorId: input.actorId,
        actorName: input.actorName,
        targetUserId: userId,
        resourceId: input.publicationId,
        resourceTitle: input.publicationTitle,
        excerpt,
        href: input.href,
      });

      /* Reuses the existing conversation between the two people, or opens one
         under the same rules any other first message would follow. */
      const { conversation } = await getOrCreateConversation(input.actorId, userId);
      await sendMessage(
        conversation.id,
        input.actorId,
        `${input.actorName} mentioned you in a comment`,
        'text',
        undefined,
        undefined,
        {
          mention: {
            publicationId: input.publicationId,
            commentId: input.commentId,
            mentionedUserId: userId,
            preview: excerpt,
            href: input.href,
          },
        },
      );

      delivered.push(userId);
    } catch (error) {
      /* Logged, not thrown: the comment itself has already been saved. */
      console.error('[mention-delivery] failed for', userId, error);
    }
  }

  if (delivered.length > 0) {
    /* Re-read before writing so concurrent comments do not clobber each other. */
    const latest = await readJsonFile<Ledger>(mentionDeliveriesPath, {});
    const now = new Date().toISOString();
    for (const userId of delivered) latest[key(input.commentId, userId)] = now;
    await writeJsonFile(mentionDeliveriesPath, latest);
  }

  return delivered;
}
