'use client';

/**
 * A person, as a card in the feed.
 *
 * ═══ WHY IT IS NOT THE ROW ═══
 *
 * `PersonRow` was built to be quiet: one horizontal line, flatter than a post,
 * "so a face never competes with a photo somebody posted". Sitting between two
 * posts in a masonry column, quiet turned into invisible — it read as a
 * malformed post rather than as a different KIND of thing, and it showed a
 * name, a line and a Follow button while the recommendation carried a
 * headline, a location, skills, a bio and the mutuals it was scored on.
 *
 * This card is the opposite decision, deliberately: it announces what it is,
 * and it shows what the ranking actually knows about the person.
 *
 * ═══ HOW IT IS TOLD APART FROM A POST ═══
 *
 * Four things, none of them a colour wash:
 *   • it says what it is, on the card, in a warm-sand chip;
 *   • a brighter glass surface and a stronger top edge than a post card;
 *   • a squircle portrait where a post has a rectangular photo;
 *   • its own footer, with the two things you can do to a person.
 *
 * Colour is kept to the one chip on purpose. A tinted card competes with the
 * photographs around it and dates badly; an edge and a label do not.
 *
 * ═══ IT SHOWS ONLY WHAT WAS RETURNED ═══
 *
 * Every field is from the recommendation. An absent headline, location, bio or
 * skill list is not rendered rather than filled in — the row above this one
 * reserved a fixed slot for the headline so cards in a strip would line up,
 * and a card in a masonry column has no such obligation.
 */

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUp, ArrowUpRight, MapPin, Users } from 'lucide-react';
import {
  describeReason,
  initials,
  type PersonRecommendation,
} from '@/components/recommendations/PeopleYouMayKnow';
import './feed-profile-card.css';

export default function FeedProfileCard({
  person,
  following,
  pending,
  onToggle,
  upraised,
  upraisePending,
  onUpraise,
}: {
  person: PersonRecommendation;
  following: boolean;
  pending: boolean;
  onToggle: (id: string) => void;
  upraised: boolean;
  upraisePending: boolean;
  onUpraise: (id: string) => void;
}) {
  const [broken, setBroken] = useState(false);
  const why = describeReason(person.reasons?.[0]);
  const skills = (person.skills ?? []).filter(Boolean).slice(0, 4);
  const more = (person.skills?.length ?? 0) - skills.length;
  const mutualFaces = (person.mutualAvatars ?? []).filter(Boolean).slice(0, 3);

  return (
    <article className="fpc">
      <div className="fpc-top">
        <span className="fpc-kind">Suggested profile</span>
        {/* The reason sits up here rather than under the name: it is why the
            card is in the feed at all, and it belongs with the label that says
            the card was suggested. */}
        <span className={why.matched ? 'fpc-why' : 'fpc-why fpc-why-quiet'}>
          <why.Icon className="fpc-why-i" aria-hidden />
          <span className="fpc-why-t">{why.text}</span>
        </span>
      </div>

      <Link href={`/u/${person.userId}`} className="fpc-id">
        <span className="fpc-av">
          {person.avatarUrl && !broken
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <img src={person.avatarUrl} alt="" onError={() => setBroken(true)} data-no-invert />
            : <span className="fpc-av-i">{initials(person.name) || '?'}</span>}
        </span>

        <span className="fpc-text">
          <span className="fpc-name">{person.name}</span>
          {person.headline && <span className="fpc-headline">{person.headline}</span>}
          {person.location && (
            <span className="fpc-loc">
              <MapPin className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
              {person.location}
            </span>
          )}
        </span>
      </Link>

      {person.shortBio && <p className="fpc-bio">{person.shortBio}</p>}

      {skills.length > 0 && (
        <div className="fpc-skills">
          {skills.map((s) => <span key={s} className="fpc-skill">{s}</span>)}
          {more > 0 && <span className="fpc-more">+{more}</span>}
        </div>
      )}

      {person.mutualCount > 0 && (
        <div className="fpc-mutual">
          {mutualFaces.length > 0 ? (
            <span className="fpc-faces">
              {mutualFaces.map((src, i) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img key={i} src={src} alt="" className="fpc-face" data-no-invert />
              ))}
            </span>
          ) : (
            <Users className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          )}
          <span>
            {person.mutualCount} mutual connection{person.mutualCount === 1 ? '' : 's'}
          </span>
        </div>
      )}

      <div className="fpc-foot">
        <button
          type="button"
          disabled={pending}
          onClick={() => onToggle(person.userId)}
          aria-label={following ? `Unfollow ${person.name}` : `Follow ${person.name}`}
          className={following ? 'fpc-btn fpc-btn-on' : 'fpc-btn'}
        >
          {following ? 'Following' : 'Follow'}
        </button>
        <button
          type="button"
          disabled={upraisePending}
          onClick={() => onUpraise(person.userId)}
          aria-pressed={upraised}
          aria-label={`Upraise ${person.name}`}
          title="Upraise"
          className={upraised ? 'fpc-up fpc-up-on' : 'fpc-up'}
        >
          <ArrowUp className="h-4 w-4" aria-hidden />
        </button>
        <Link href={`/u/${person.userId}`} className="fpc-view">
          View profile
          <ArrowUpRight className="h-3 w-3" aria-hidden />
        </Link>
      </div>
    </article>
  );
}
