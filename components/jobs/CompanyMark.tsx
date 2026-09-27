'use client';

/**
 * An employer's mark.
 *
 * The verified logo from the curated registry when there is one, the company's
 * initials on a stable hued chip when there is not. Never a guessed logo, never
 * a broken image — a failed load falls back to the monogram rather than leaving
 * the torn-page icon in a card.
 *
 * Shared rather than copied. This was written twice, at two sizes, in
 * RecommendedJobs and then again for the feed's job card; two copies of "how a
 * company is drawn" is how the same employer ends up with a logo on one surface
 * and initials on another. The hue comes from `companyHue`, which is a hash of
 * the name, so a company is the same colour everywhere and across reloads.
 */

import { useState } from 'react';
import { getCompanyLogo } from '@/lib/company-logos';
import { companyHue } from '@/lib/jobs-ui';

export default function CompanyMark({
  company,
  size = 20,
  radius,
  className = '',
}: {
  company: string;
  /** Edge length in px. The monogram scales with it. */
  size?: number;
  /** Corner radius in px; defaults to a squircle proportional to `size`. */
  radius?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const r = radius ?? Math.max(6, Math.round(size * 0.28));
  const box: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: r,
    flex: '0 0 auto',
    overflow: 'hidden',
  };

  const logo = getCompanyLogo(company);
  if (logo && !failed) {
    return (
      <span
        className={`flex items-center justify-center border border-white/[0.10] bg-white/[0.06] ${className}`}
        style={box}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo.src}
          alt=""
          aria-hidden
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-contain"
          style={{ padding: Math.max(2, Math.round(size * 0.1)) }}
        />
      </span>
    );
  }

  const initials =
    company.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'C';
  const hue = companyHue(company);
  return (
    <span
      className={`flex items-center justify-center font-bold ${className}`}
      aria-hidden
      style={{
        ...box,
        fontSize: Math.max(8.5, Math.round(size * 0.42)),
        background: `hsl(${hue} 45% 18%)`,
        border: `1px solid hsl(${hue} 45% 32% / 0.5)`,
        color: `hsl(${hue} 60% 78%)`,
      }}
    >
      {initials}
    </span>
  );
}
