'use client';

import { useEffect } from 'react';

/** Must match STORAGE_KEY in app/components/ThemeController.tsx. */
const STORAGE_KEY = 'docrud-color-mode';

/**
 * Pins a route to the dark palette while it is mounted.
 *
 * Used by pages whose markup is dark-only (e.g. /signup), where honouring a
 * light preference would render a light page shell around a dark card.
 *
 * On unmount it RESTORES the visitor's stored preference. The previous version
 * deleted `data-ui-mode` and removed `.dark` outright, leaving the document in
 * a third state — no theme attribute, a stale dark background, and the stored
 * preference not re-applied until a full reload.
 */
export default function DarkModeActivator() {
  useEffect(() => {
    let previous: 'light' | 'dark' = 'dark';
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') previous = stored;
    } catch { /* storage unavailable — fall back to the dark default */ }

    const root = document.documentElement;
    root.dataset.uiMode = 'dark';
    root.classList.add('dark');

    return () => {
      // Re-apply the stored preference rather than clearing the attribute.
      root.dataset.uiMode = previous;
      root.classList.toggle('dark', previous === 'dark');
    };
  }, []);

  return null;
}
