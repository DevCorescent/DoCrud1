'use client';

import { useEffect } from 'react';

export function ThemeController() {
  useEffect(() => {
    let mounted = true;

    document.documentElement.setAttribute('data-ui-mode', 'light');
    try {
      window.localStorage.removeItem('docrud-ui-mode');
    } catch {
      // ignore storage cleanup issues
    }

    const applyTheme = async () => {
      try {
        const response = await fetch('/api/settings/theme', { cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json();
        if (!mounted) return;
        const activeTheme = payload?.activeTheme || 'sapphire';
        document.documentElement.setAttribute('data-theme', activeTheme);
      } catch {
        document.documentElement.setAttribute('data-theme', 'sapphire');
      }
    };

    void applyTheme();

    return () => {
      mounted = false;
    };
  }, []);

  return null;
}
