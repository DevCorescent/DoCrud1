'use client';

import { useEffect, useState } from 'react';

export default function SplashScreen() {
  const [visible, setVisible] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    // next frame → fade in
    const raf = requestAnimationFrame(() => setVisible(true));
    // start fade out after hold
    const outTimer = setTimeout(() => setVisible(false), 1700);
    // unmount after fade-out completes
    const doneTimer = setTimeout(() => setGone(true), 2550);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(outTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  if (gone) return null;

  const iconSize = 88;
  const ringInset = -3;
  const borderRadius = Math.round(iconSize * 0.235);
  const ringRadius = borderRadius + Math.abs(ringInset) + 1;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: '#08090a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: visible ? 1 : 0,
        transition: visible
          ? 'opacity 0.65s cubic-bezier(0.4,0,0.2,1)'
          : 'opacity 0.85s cubic-bezier(0.4,0,0.2,1)',
        pointerEvents: visible ? 'all' : 'none',
      }}
    >
      {/* Subtle warm glow behind icon */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          width: 360,
          height: 360,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(212,172,60,0.06) 0%, rgba(212,172,60,0.025) 45%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Icon + spinning golden ring */}
      <div style={{ position: 'relative', width: iconSize, height: iconSize }}>
        {/* Spinning golden sweep arc */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: ringInset,
            borderRadius: ringRadius,
            background:
              'conic-gradient(from 0deg, transparent 0%, transparent 60%, rgba(140,105,22,0.42) 70%, rgba(210,172,78,0.88) 80%, rgba(242,212,128,1.0) 86%, rgba(210,172,78,0.82) 91%, rgba(140,105,22,0.38) 97%, transparent 100%)',
            animation: 'goldenRingSpin 3.2s linear infinite',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
        {/* Docrud icon */}
        <img
          src="/docrud-icon.png"
          alt="Docrud"
          width={iconSize}
          height={iconSize}
          style={{
            borderRadius,
            display: 'block',
            position: 'relative',
            zIndex: 1,
            width: iconSize,
            height: iconSize,
            objectFit: 'cover',
          }}
        />
      </div>
    </div>
  );
}
