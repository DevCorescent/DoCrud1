'use client';

/**
 * A company's mark, or its initials. Used everywhere a company is shown.
 *
 * ═══ THE MARK IS NEVER RECOLOURED ═══
 *
 * It sits on a permanently white plate in BOTH themes, with no filter, no
 * grayscale, no invert and no opacity dimming. A brand mark tinted by a page
 * theme is no longer that brand's mark, and a washed-out logo reads as a
 * rendering bug. Only the PLATE and the fallback initials follow the theme.
 *
 * ═══ A BROKEN URL SHOWS INITIALS, NOT A BROKEN IMAGE ═══
 *
 * Logo URLs come from an external source and rot. `onError` swaps to initials
 * for the rest of the session, and the failed URL is remembered in a module-level
 * set so a list of fifty cards does not re-request the same dead URL fifty
 * times, and a re-render does not restart the attempt.
 */

import { useEffect, useState } from 'react';

/** URLs that failed this session. Module-level so it survives re-mounts. */
const broken = new Set<string>();

/** Two letters. Never a fabricated mark. */
export function companyInitials(name: string): string {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function CompanyLogo({
  name, logoUrl, size = 40, rounded = 12, className = '',
}: {
  name: string;
  logoUrl?: string;
  size?: number;
  rounded?: number;
  className?: string;
}) {
  const usable = Boolean(logoUrl) && !broken.has(logoUrl as string);
  const [showImage, setShowImage] = useState(usable);

  /* A changed URL gets a fresh attempt; a known-dead one never does. */
  useEffect(() => {
    setShowImage(Boolean(logoUrl) && !broken.has(logoUrl as string));
  }, [logoUrl]);

  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden ${className}`}
      style={{
        width: size, height: size, borderRadius: rounded,
        /* Always white — see the note above. */
        background: '#FFFFFF',
        border: '1px solid rgba(15,17,21,0.10)',
      }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => { if (logoUrl) broken.add(logoUrl); setShowImage(false); }}
          style={{ width: size * 0.72, height: size * 0.72, objectFit: 'contain', display: 'block' }}
        />
      ) : (
        <span aria-hidden
          style={{ fontSize: Math.max(9, size * 0.34), fontWeight: 800, letterSpacing: '-0.02em', color: '#0F1115' }}>
          {companyInitials(name)}
        </span>
      )}
    </span>
  );
}
