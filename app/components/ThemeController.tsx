'use client';

import { useEffect } from 'react';

const STORAGE_KEY = 'docrud-color-mode';

export type ColorMode = 'light' | 'dark';

export function getStoredColorMode(): ColorMode {
  if (typeof window === 'undefined') return 'dark';
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch { /* ignore */ }
  return 'dark';
}

export function applyColorMode(mode: ColorMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-ui-mode', mode);
  root.classList.toggle('dark', mode === 'dark');
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch { /* ignore */ }
}

export function ThemeController() {
  useEffect(() => {
    let mounted = true;

    // Apply persisted light/dark preference (default dark for homepage)
    applyColorMode(getStoredColorMode());

    const applyBrandTheme = async () => {
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

    void applyBrandTheme();

    return () => {
      mounted = false;
    };
  }, []);

  return null;
}
