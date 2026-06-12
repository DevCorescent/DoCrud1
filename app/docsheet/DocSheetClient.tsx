'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import DocSheetCenter from '@/components/DocSheetCenter';
import { getDriveHandoffFile } from '@/lib/driveHandoff';
import type { DocumentHistory } from '@/types/document';

export default function DocSheetClient() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [history, setHistory] = useState<DocumentHistory[]>([]);
  const initialHistoryId = searchParams?.get('workbook') || undefined;
  const [driveFile, setDriveFile] = useState<File | undefined>(undefined);
  const handoffReadRef = useRef(false);

  const fetchHistory = async () => {
    const response = await fetch('/api/history');
    if (!response.ok) return;
    const payload = await response.json().catch(() => []);
    setHistory(Array.isArray(payload) ? payload : []);
  };

  useEffect(() => {
    if (handoffReadRef.current) return;
    handoffReadRef.current = true;
    const handoff = getDriveHandoffFile();
    if (handoff) {
      setDriveFile(new File([handoff.blob], handoff.name, { type: handoff.mimeType || handoff.blob.type }));
    }
  }, []);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/login');
      return;
    }
    void fetchHistory();
  }, [router, session, status]);

  if (status === 'loading') {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading DocSheet Studio...</div>;
  }

  if (!session) {
    return null;
  }

  return (
    <DocSheetCenter
      layout="page"
      initialHistoryId={initialHistoryId}
      history={history}
      onHistoryRefresh={fetchHistory}
      initialFile={driveFile}
    />
  );
}
