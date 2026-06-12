'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Copy, FolderLock, Loader2, RefreshCcw } from 'lucide-react';
import PublicSiteChrome from '@/components/PublicSiteChrome';
import { LandingSettings } from '@/types/document';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface PublicFileLockerPageProps {
  softwareName: string;
  accentLabel: string;
  settings: LandingSettings;
}

interface LockerPayload {
  id: string;
  name: string;
  description?: string;
  category?: string;
  passwordVersion: number;
  passwordRotationDays?: number;
  fileCount: number;
  unlocked: boolean;
  files: Array<{
    id: string;
    shareId: string;
    fileName: string;
    title: string;
    notes?: string;
    mimeType: string;
    sizeInBytes: number;
    directoryCategory?: string;
    directoryTags: string[];
    fileAccessPasswordEnabled: boolean;
    linkHref: string;
    openCount: number;
    downloadCount: number;
    updatedAt: string;
  }>;
  history: Array<{
    id: string;
    createdAt: string;
    note: string;
  }>;
  error?: string;
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export default function PublicFileLockerPage({ softwareName, accentLabel, settings }: PublicFileLockerPageProps) {
  const params = useParams<{ id: string }>();
  const lockerId = Array.isArray(params?.id) ? params.id[0] : params?.id || '';
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState(false);
  const [payload, setPayload] = useState<LockerPayload | null>(null);
  const [error, setError] = useState('');

  const loadLocker = useCallback(async (nextPassword?: string) => {
    if (!lockerId) return;
    try {
      setLoading(true);
      const search = new URLSearchParams();
      if (nextPassword) search.set('password', nextPassword.trim().toUpperCase());
      const response = await fetch(`/api/public/file-directory/lockers/${lockerId}${search.toString() ? `?${search.toString()}` : ''}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to load locker.');
      }
      setPayload(data);
      setError(data?.unlocked ? '' : data?.error || '');
    } catch (loadError) {
      setPayload(null);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load locker.');
    } finally {
      setLoading(false);
    }
  }, [lockerId]);

  useEffect(() => {
    void loadLocker();
  }, [loadLocker]);

  const unlock = async () => {
    setUnlocking(true);
    await loadLocker(password);
    setUnlocking(false);
  };

  const copyLockerLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
  };

  return (
    <PublicSiteChrome softwareName={softwareName} accentLabel={accentLabel} settings={settings}>
      <section className="premium-surface rounded-[1.6rem] px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <div className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
          <div className="rounded-[1.35rem] border border-slate-200 bg-slate-50/80 p-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-600">
              <FolderLock className="h-3.5 w-3.5" />
              Locker folder
            </div>
            <h1 className="mt-3 text-[1.5rem] font-semibold tracking-[-0.04em] text-slate-950 sm:text-[2rem]">
              {payload?.name || (loading ? 'Loading locker...' : 'Private locker')}
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {payload?.description || 'Open this folder with the locker password to see all files inside it.'}
            </p>
            {payload ? (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-[1rem] border border-slate-200 bg-white px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Files</p>
                  <p className="mt-1.5 text-sm font-semibold text-slate-950">{payload.fileCount}</p>
                </div>
                <div className="rounded-[1rem] border border-slate-200 bg-white px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Password version</p>
                  <p className="mt-1.5 text-sm font-semibold text-slate-950">{payload.passwordVersion}</p>
                </div>
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="h-10 rounded-full" onClick={() => void copyLockerLink()}>
                <Copy className="mr-2 h-4 w-4" />
                Copy Locker Link
              </Button>
              <Button type="button" variant="outline" className="h-10 rounded-full" onClick={() => void loadLocker(payload?.unlocked ? password : undefined)}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>

          <div className="rounded-[1.35rem] border border-slate-200 bg-white p-5">
            {loading ? (
              <div className="flex min-h-[18rem] items-center justify-center text-sm text-slate-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading locker...
              </div>
            ) : !payload?.unlocked ? (
              <div className="space-y-4">
                <p className="text-sm font-semibold text-slate-950">Unlock this locker folder</p>
                <Input value={password} onChange={(event) => setPassword(event.target.value.toUpperCase())} placeholder="Enter locker password" className="h-12 rounded-[1rem]" />
                <Button onClick={() => void unlock()} disabled={unlocking} className="h-11 rounded-full bg-slate-950 px-6 text-white hover:bg-slate-800">
                  {unlocking ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Unlocking...</> : 'Open Locker'}
                </Button>
                {error ? <p className="text-sm text-rose-600">{error}</p> : null}
                {payload?.history?.length ? (
                  <div className="rounded-[1rem] border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Recent locker activity</p>
                    <div className="mt-3 space-y-2">
                      {payload.history.slice(0, 4).map((event) => (
                        <div key={event.id} className="rounded-[0.85rem] bg-white px-3 py-2 text-[11px] text-slate-600">
                          {event.note}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-950">Files inside this locker</p>
                  <p className="text-xs text-slate-500">{payload.files.length} available</p>
                </div>
                <div className="grid gap-3">
                  {payload.files.map((file) => (
                    <div key={file.id} className="rounded-[1rem] border border-slate-200 bg-slate-50/70 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950">{file.title}</p>
                          <p className="mt-1 truncate text-xs text-slate-500">{file.fileName}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{formatBytes(file.sizeInBytes)}</p>
                          {file.fileAccessPasswordEnabled ? <p className="mt-1 text-[10px] text-amber-600">Extra file password</p> : null}
                        </div>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-600">{file.notes || 'Locker file ready to open.'}</p>
                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                        <span>{file.openCount} opens</span>
                        <span>{file.downloadCount} downloads</span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button asChild className="h-10 rounded-full bg-slate-950 px-5 text-white hover:bg-slate-800">
                          <Link href={file.linkHref}>Open File</Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </PublicSiteChrome>
  );
}
