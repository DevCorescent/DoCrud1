'use client';

import type { PublicFaceCategory } from '@/types/document';

export const PUBLIC_FACE_CATEGORY_LABELS: Record<PublicFaceCategory, string> = {
  actor_actress:             'Actor / Actress',
  singer_musician:           'Singer / Musician',
  athlete_sportsperson:      'Athlete / Sportsperson',
  model:                     'Model',
  content_creator:           'Content Creator',
  influencer:                'Influencer',
  politician:                'Politician',
  entrepreneur_ceo:          'Entrepreneur / CEO',
  author_writer:             'Author / Writer',
  academic_scientist:        'Academic / Scientist',
  tv_personality:            'TV Personality',
  comedian:                  'Comedian',
  social_activist:           'Social Activist',
  chef_culinary:             'Chef / Culinary Expert',
  fashion_designer:          'Fashion Designer',
  photographer_videographer: 'Photographer / Videographer',
  game_streamer:             'Game Streamer',
  journalist:                'Journalist',
  other:                     'Public Figure',
};

export const PUBLIC_FACE_CATEGORY_ICONS: Record<PublicFaceCategory, string> = {
  actor_actress: '🎭', singer_musician: '🎵', athlete_sportsperson: '🏆',
  model: '✨', content_creator: '🎬', influencer: '📱', politician: '🏛️',
  entrepreneur_ceo: '💼', author_writer: '📖', academic_scientist: '🔬',
  tv_personality: '📺', comedian: '😄', social_activist: '✊', chef_culinary: '👨‍🍳',
  fashion_designer: '👗', photographer_videographer: '📷', game_streamer: '🎮',
  journalist: '📰', other: '⭐',
};

/* ─── Shimmer keyframes (injected once) ─────────────────────────────── */
const SHIMMER_CSS = `
@keyframes pf-gold-shimmer {
  0%   { transform: translateX(-120%) skewX(-18deg); opacity: 0; }
  18%  { opacity: 1; }
  45%  { opacity: 0.7; }
  60%  { transform: translateX(220%) skewX(-18deg); opacity: 0; }
  100% { transform: translateX(220%) skewX(-18deg); opacity: 0; }
}
@keyframes pf-badge-shimmer {
  0%   { background-position: -200% center; }
  60%  { background-position: 200% center; }
  100% { background-position: 200% center; }
}
.pf-star-wrap { position: relative; display: inline-flex; align-items: center; justify-content: center; }
.pf-star-wrap::after {
  content: '';
  position: absolute;
  top: -5%; left: 0;
  width: 35%; height: 110%;
  background: linear-gradient(105deg, transparent 0%, rgba(255,240,180,0.55) 50%, transparent 100%);
  animation: pf-gold-shimmer 5s ease-in-out infinite;
  pointer-events: none;
  border-radius: 2px;
}
`;

/* ─── Gold colour tokens ─────────────────────────────────────────────── */
const G = {
  dark:   '#6B4E1A',
  mid:    '#B8892E',
  bright: '#D4A94A',
  light:  '#E8CE8A',
  pale:   '#F2E4BC',
};

/* ─── Gold star SVG ──────────────────────────────────────────────────── */
function GoldStarSvg({ size, uid }: { size: number; uid: string }) {
  const gId = `pfg-${uid}`;
  const rId = `pfr-${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none"
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <defs>
        {/* Main gold fill */}
        <linearGradient id={gId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor={G.dark}   />
          <stop offset="30%"  stopColor={G.mid}    />
          <stop offset="55%"  stopColor={G.bright} />
          <stop offset="72%"  stopColor={G.light}  />
          <stop offset="100%" stopColor={G.mid}    />
        </linearGradient>
        {/* Rim / edge darkening */}
        <radialGradient id={rId} cx="35%" cy="30%" r="65%">
          <stop offset="0%"   stopColor={G.pale}   stopOpacity="0.5" />
          <stop offset="100%" stopColor={G.dark}   stopOpacity="0.6" />
        </radialGradient>
      </defs>
      {/* Circle base */}
      <circle cx="10" cy="10" r="9.2" fill={`url(#${gId})`} />
      {/* Inner depth ring */}
      <circle cx="10" cy="10" r="9.2" fill={`url(#${rId})`} />
      {/* Star cut-out — slightly raised look with fill slightly lighter */}
      <path
        d="M10 4.2l1.55 3.25 3.6.3-2.65 2.4.82 3.55L10 12.05l-3.32 1.65.82-3.55L5 7.75l3.6-.3z"
        fill="#0d0b07"
        opacity="0.82"
      />
      {/* Tiny specular highlight on top-left of circle */}
      <ellipse cx="7.2" cy="6.8" rx="2.2" ry="1.3"
        fill="white" opacity="0.12"
        transform="rotate(-20 7.2 6.8)" />
    </svg>
  );
}

/* ─── PublicFaceStarIcon — standalone icon (used inline, on avatars, etc.) */
export function PublicFaceStarIcon({ size = 16 }: { size?: number }) {
  return (
    <>
      <style>{SHIMMER_CSS}</style>
      <span className="pf-star-wrap" style={{ width: size, height: size }}>
        <GoldStarSvg size={size} uid="inline" />
      </span>
    </>
  );
}

/* ─── Full badge (icon + label pill) ────────────────────────────────── */
interface PublicFaceBadgeProps {
  category: PublicFaceCategory;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  showIcon?: boolean;
}

export default function PublicFaceBadge({
  category,
  size = 'md',
  showLabel = true,
  showIcon = true,
}: PublicFaceBadgeProps) {
  const label  = PUBLIC_FACE_CATEGORY_LABELS[category] || 'Public Figure';
  const icon   = PUBLIC_FACE_CATEGORY_ICONS[category]  || '⭐';

  const dims     = { sm: 14, md: 18, lg: 24 }[size];
  const fontSize = { sm: 9,  md: 10.5, lg: 13 }[size];
  const iconSize = { sm: 10, md: 12,   lg: 16 }[size];
  const gap      = { sm: 3,  md: 5,    lg: 7  }[size];
  const px       = { sm: 6,  md: 8,    lg: 12 }[size];
  const py       = { sm: 2,  md: 3,    lg: 5  }[size];

  return (
    <>
      <style>{SHIMMER_CSS}</style>
      <div className="inline-flex items-center" style={{ gap }}>
        {/* Shimmering star */}
        <span className="pf-star-wrap" style={{ width: dims, height: dims }}>
          <GoldStarSvg size={dims} uid={`badge-${size}`} />
        </span>

        {showLabel && (
          <div
            className="inline-flex items-center"
            style={{
              background: 'rgba(180,140,55,0.10)',
              border: '1px solid rgba(200,160,65,0.28)',
              borderRadius: 100,
              padding: `${py}px ${px}px`,
              gap: 4,
            }}
          >
            {showIcon && <span style={{ fontSize: iconSize, lineHeight: 1 }}>{icon}</span>}
            <span style={{
              fontSize,
              fontWeight: 600,
              letterSpacing: '0.05em',
              lineHeight: 1,
              color: `rgba(215,175,90,0.85)`,
              textTransform: 'uppercase',
            }}>
              {label}
            </span>
          </div>
        )}
      </div>
    </>
  );
}
