'use client';

import { usePresenceHeartbeat } from '@/components/PresenceBadge';

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  usePresenceHeartbeat();
  return <>{children}</>;
}
