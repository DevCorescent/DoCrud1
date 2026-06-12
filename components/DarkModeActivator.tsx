'use client';

import { useEffect } from 'react';

export default function DarkModeActivator() {
  useEffect(() => {
    document.documentElement.dataset.uiMode = 'dark';
    document.documentElement.classList.add('dark');

    return () => {
      delete document.documentElement.dataset.uiMode;
      document.documentElement.classList.remove('dark');
    };
  }, []);

  return null;
}
