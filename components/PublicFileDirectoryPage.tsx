'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { BarChart3, Copy, Download, FolderLock, Globe, Home, Loader2, Menu, PanelLeftClose, PanelLeftOpen, Search, Upload } from 'lucide-react';
import { FileDirectoryLocker, LandingSettings, SecureFileTransfer } from '@/types/document';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ProcessProgress } from '@/components/ui/process-progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { buildAbsoluteAppUrl } from '@/lib/url';

interface PublicFileDirectoryPageProps {
  softwareName: string;
  accentLabel: string;
  settings: LandingSettings;
}

interface DirectorySearchResult {
  kind?: 'file' | 'locker';
  id: string;
  shareId: string;
  title: string;
  fileName: string;
  notes?: string;
  mimeType: string;
  sizeInBytes: number;
  category?: string;
  tags: string[];
  visibility: 'public' | 'private';
  authMode: SecureFileTransfer['authMode'];
  linkHref: string;
  lockerId?: string;
  lockerName?: string;
  fileCount?: number;
  openCount: number;
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
}

const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Failed to read the selected file.'));
  reader.readAsDataURL(file);
});

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

function generateLockerPassword() {
  return `DOC-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export default function PublicFileDirectoryPage({ softwareName, accentLabel, settings }: PublicFileDirectoryPageProps) {
  const { data: session, status } = useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isAuthenticated = status === 'authenticated' && Boolean(session?.user);
  const uiSession = mounted ? session : null;
  const uiAuthenticated = mounted && isAuthenticated;
  const [scope, setScope] = useState<'public' | 'private'>('public');
  const [query, setQuery] = useState('');
  const [password, setPassword] = useState('');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState<Array<{ label: string; count: number }>>([]);
  const [results, setResults] = useState<DirectorySearchResult[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(true);
  const [searchError, setSearchError] = useState('');
  const [myFiles, setMyFiles] = useState<SecureFileTransfer[]>([]);
  const [lockers, setLockers] = useState<FileDirectoryLocker[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingLockers, setLoadingLockers] = useState(false);
  const [publisherStatus, setPublisherStatus] = useState('');
  const [publisherError, setPublisherError] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [createdTransfer, setCreatedTransfer] = useState<SecureFileTransfer | null>(null);
  const [filePayload, setFilePayload] = useState<{ fileName: string; mimeType: string; sizeInBytes: number; dataUrl: string } | null>(null);
  const [publishForm, setPublishForm] = useState({
    title: '',
    notes: '',
    category: '',
    tags: '',
    visibility: 'private' as 'public' | 'private',
    lockerMode: 'new' as 'new' | 'existing',
    lockerId: '',
    lockerName: '',
    rotationDays: '30',
    password: generateLockerPassword(),
    filePassword: '',
  });
  const [pageTab, setPageTab] = useState<'search' | 'publish' | 'analytics'>('search');
  const [publishRightTab, setPublishRightTab] = useState<'latest' | 'lockers'>('latest');
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (createdTransfer) setPublishRightTab('latest');
  }, [createdTransfer]);

  const goToTab = (tab: 'search' | 'publish' | 'analytics') => {
    setPageTab(tab);
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        document.getElementById('file-directory-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        setLoadingSearch(true);
        const search = new URLSearchParams({
          scope,
          query,
        });
        if (category) search.set('category', category);
        if (scope === 'private' && password) search.set('password', password.trim().toUpperCase());
        const response = await fetch(`/api/public/file-directory/search?${search.toString()}`, { signal: controller.signal });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || 'Unable to search directory.');
        }
        setCategories(Array.isArray(payload?.categories) ? payload.categories : []);
        setResults(Array.isArray(payload?.results) ? payload.results : []);
        setSearchError('');
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setSearchError(error instanceof Error ? error.message : 'Unable to search directory.');
      } finally {
        setLoadingSearch(false);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [scope, query, password, category]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    const loadFiles = async () => {
      try {
        setLoadingFiles(true);
        const response = await fetch('/api/file-transfers');
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || 'Unable to load your files.');
        }
        if (!cancelled) {
          setMyFiles(Array.isArray(payload) ? payload : []);
        }
      } catch (error) {
        if (!cancelled) {
          setPublisherError(error instanceof Error ? error.message : 'Unable to load your files.');
        }
      } finally {
        if (!cancelled) {
          setLoadingFiles(false);
        }
      }
    };
    void loadFiles();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    const loadLockers = async () => {
      try {
        setLoadingLockers(true);
        const response = await fetch('/api/file-directory/lockers');
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || 'Unable to load lockers.');
        }
        if (!cancelled) {
          setLockers(Array.isArray(payload) ? payload : []);
        }
      } catch (error) {
        if (!cancelled) {
          setPublisherError(error instanceof Error ? error.message : 'Unable to load lockers.');
        }
      } finally {
        if (!cancelled) {
          setLoadingLockers(false);
        }
      }
    };
    void loadLockers();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const myDirectoryFiles = useMemo(
    () => myFiles.filter((item) => item.directoryCategory || item.directoryVisibility),
    [myFiles],
  );

  useEffect(() => {
    if (publishForm.visibility === 'private' && !publishForm.password.trim()) {
      setPublishForm((current) => ({ ...current, password: generateLockerPassword() }));
    }
  }, [publishForm.password, publishForm.visibility]);

  useEffect(() => {
    if (publishForm.visibility !== 'private' || publishForm.lockerMode !== 'existing' || !publishForm.lockerId) {
      return;
    }
    const selectedLocker = lockers.find((item) => item.id === publishForm.lockerId);
    if (!selectedLocker) return;
    setPublishForm((current) => ({
      ...current,
      lockerName: selectedLocker.name,
      password: selectedLocker.currentPassword,
      rotationDays: selectedLocker.passwordRotationDays ? String(selectedLocker.passwordRotationDays) : current.rotationDays,
    }));
  }, [lockers, publishForm.lockerId, publishForm.lockerMode, publishForm.visibility]);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setFilePayload({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeInBytes: file.size,
        dataUrl,
      });
      setPublishForm((current) => ({
        ...current,
        title: current.title || file.name.replace(/\.[^.]+$/, ''),
      }));
      setPublisherStatus(`${file.name} is ready.`);
      setPublisherError('');
    } catch (error) {
      setPublisherError(error instanceof Error ? error.message : 'Unable to read file.');
    }
  };

  const publishFile = async () => {
    if (!filePayload) {
      setPublisherError('Choose a file first.');
      return;
    }
    if (publishForm.visibility === 'private' && !publishForm.password.trim()) {
      setPublisherError('Add a password for private locker files.');
      return;
    }

    try {
      setPublishing(true);
      const isPrivate = publishForm.visibility === 'private';
      const response = await fetch('/api/file-transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...filePayload,
          title: publishForm.title.trim() || filePayload.fileName.replace(/\.[^.]+$/, ''),
          notes: publishForm.notes.trim(),
          lockerId: isPrivate && publishForm.lockerMode === 'existing' ? publishForm.lockerId || undefined : undefined,
          lockerName: isPrivate
            ? (publishForm.lockerMode === 'new'
              ? (publishForm.lockerName.trim() || publishForm.title.trim() || filePayload.fileName.replace(/\.[^.]+$/, ''))
              : publishForm.lockerName)
            : undefined,
          directoryVisibility: publishForm.visibility,
          directoryCategory: publishForm.category.trim() || undefined,
          directoryTags: publishForm.tags.split(',').map((item) => item.trim()).filter(Boolean),
          authMode: publishForm.visibility === 'public' ? 'public' : 'password',
          accessPassword: publishForm.visibility === 'private' ? publishForm.password.trim().toUpperCase() : undefined,
          fileAccessPassword: publishForm.visibility === 'private' && publishForm.filePassword.trim() ? publishForm.filePassword.trim().toUpperCase() : undefined,
          passwordRotationDays: isPrivate && publishForm.lockerMode === 'new' ? Number(publishForm.rotationDays || 0) || undefined : undefined,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to publish file.');
      }
      setCreatedTransfer(payload);
      setMyFiles((current) => [payload, ...current]);
      setPublisherStatus(publishForm.visibility === 'public' ? 'Public file published.' : 'Private locker file saved.');
      setPublisherError('');
      setPublishForm({
        title: '',
        notes: '',
        category: '',
        tags: '',
        visibility: 'private',
        lockerMode: 'new',
        lockerId: '',
        lockerName: '',
        rotationDays: '30',
        password: generateLockerPassword(),
        filePassword: '',
      });
      setFilePayload(null);
      if (isAuthenticated) {
        const lockerResponse = await fetch('/api/file-directory/lockers');
        const lockerPayload = await lockerResponse.json().catch(() => null);
        if (lockerResponse.ok) {
          setLockers(Array.isArray(lockerPayload) ? lockerPayload : []);
        }
      }
    } catch (error) {
      setPublisherError(error instanceof Error ? error.message : 'Unable to publish file.');
      setPublisherStatus('');
    } finally {
      setPublishing(false);
    }
  };

  const copyShareLink = async (shareId: string) => {
    await navigator.clipboard.writeText(buildAbsoluteAppUrl(`/transfer/${shareId}`, typeof window !== 'undefined' ? window.location.origin : undefined));
  };

  const copyAllDetails = async (transfer: SecureFileTransfer) => {
    const absoluteUrl = buildAbsoluteAppUrl(`/transfer/${transfer.shareId}`, typeof window !== 'undefined' ? window.location.origin : undefined);
    const lines = [
      `Title: ${transfer.title || transfer.fileName}`,
      `File: ${transfer.fileName}`,
      `Visibility: ${transfer.directoryVisibility || 'private'}`,
      `Link: ${absoluteUrl}`,
    ];
    if (transfer.lockerName) lines.push(`Locker: ${transfer.lockerName}`);
    if (transfer.directoryCategory) lines.push(`Category: ${transfer.directoryCategory}`);
    if (transfer.directoryTags?.length) lines.push(`Tags: ${transfer.directoryTags.join(', ')}`);
    if (transfer.accessPassword) lines.push(`Locker password: ${transfer.accessPassword}`);
    await navigator.clipboard.writeText(lines.join('\n'));
    setPublisherStatus('All share details copied.');
    setPublisherError('');
  };

  const copyLockerDetails = async (locker: FileDirectoryLocker) => {
    const filesInLocker = myDirectoryFiles.filter((item) => item.lockerId === locker.id);
    const lines = [
      `Locker: ${locker.name}`,
      `Password: ${locker.currentPassword}`,
      `Password version: ${locker.passwordVersion}`,
      `Rotation period: ${locker.passwordRotationDays ? `${locker.passwordRotationDays} day(s)` : 'Manual only'}`,
      `Files inside: ${filesInLocker.length}`,
    ];
    if (locker.description) lines.push(`Description: ${locker.description}`);
    if (locker.category) lines.push(`Category: ${locker.category}`);
    if (filesInLocker.length) {
      lines.push('Files:');
      filesInLocker.slice(0, 12).forEach((item) => lines.push(`- ${item.title || item.fileName}: ${buildAbsoluteAppUrl(`/transfer/${item.shareId}`, typeof window !== 'undefined' ? window.location.origin : undefined)}`));
    }
    await navigator.clipboard.writeText(lines.join('\n'));
    setPublisherStatus('Locker details copied.');
    setPublisherError('');
  };

  const rotateLocker = async (locker: FileDirectoryLocker) => {
    try {
      setPublisherStatus('');
      setPublisherError('');
      const response = await fetch('/api/file-directory/lockers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: locker.id,
          action: 'rotate-password',
          passwordRotationDays: locker.passwordRotationDays,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to rotate locker password.');
      }
      setLockers((current) => current.map((item) => item.id === locker.id ? payload : item));
      setMyFiles((current) => current.map((item) => item.lockerId === locker.id ? { ...item, accessPassword: payload.currentPassword } : item));
      if (publishForm.lockerId === locker.id) {
        setPublishForm((current) => ({ ...current, password: payload.currentPassword }));
      }
      setPublisherStatus('Locker password changed. Access was updated for all files in that locker.');
    } catch (error) {
      setPublisherError(error instanceof Error ? error.message : 'Unable to rotate locker password.');
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_20%_10%,rgba(99,102,241,0.18),transparent_55%),radial-gradient(circle_at_85%_0%,rgba(34,211,238,0.16),transparent_52%),radial-gradient(circle_at_70%_80%,rgba(16,185,129,0.14),transparent_55%),linear-gradient(180deg,rgba(245,248,255,1),rgba(255,255,255,1))]">
      <div className="pointer-events-none absolute -left-24 top-20 h-[28rem] w-[28rem] rounded-full bg-gradient-to-br from-indigo-400/20 via-sky-400/10 to-emerald-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 -top-16 h-[30rem] w-[30rem] rounded-full bg-gradient-to-br from-fuchsia-400/16 via-amber-400/10 to-cyan-400/14 blur-3xl" />

      <div className="relative z-10 mx-auto flex max-w-[1500px] gap-4 px-3 py-4 sm:px-5 lg:px-7 lg:py-6">
        <div className="relative hidden shrink-0 xl:sticky xl:top-6 xl:block xl:max-h-[calc(100vh-3rem)]">
          <aside
            className={`flex flex-col overflow-hidden rounded-[1.75rem] border border-white/60 bg-white/70 p-3 shadow-[0_16px_44px_rgba(15,23,42,0.06)] backdrop-blur-2xl ${
              sidebarExpanded ? 'w-64' : 'w-20'
            }`}
          >
            <div className={sidebarExpanded ? 'flex items-center justify-between px-1.5 py-1.5' : 'flex flex-col items-center gap-2 py-2'}>
              <button
                type="button"
                onClick={() => setSidebarExpanded((current) => !current)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_16px_36px_rgba(15,23,42,0.18)] transition hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                aria-label={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
                title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
              >
                {sidebarExpanded ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
              </button>

              {sidebarExpanded ? (
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_14px_30px_rgba(15,23,42,0.12)]">
                    <FolderLock className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">File</p>
                    <p className="truncate text-xs text-slate-500">Directory</p>
                  </div>
                </div>
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_14px_30px_rgba(15,23,42,0.12)]">
                  <FolderLock className="h-5 w-5" />
                </div>
              )}
            </div>

            <nav className={`mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto pb-2 ${sidebarExpanded ? 'px-1' : 'px-0'}`}>
              <button
                type="button"
                onClick={() => goToTab('search')}
                className={`flex w-full items-center rounded-2xl transition ${
                  sidebarExpanded ? 'gap-3 px-3 py-2.5 text-sm font-semibold' : 'justify-center px-0 py-2'
                } ${pageTab === 'search' ? 'bg-slate-950 text-white shadow-[0_16px_34px_rgba(15,23,42,0.14)]' : 'text-slate-700 hover:bg-white/70'}`}
                title="Search"
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${pageTab === 'search' ? 'bg-white/10' : 'bg-slate-100 text-slate-700'}`}>
                  <Search className={`h-5 w-5 ${pageTab === 'search' ? 'text-white' : 'text-slate-700'}`} />
                </div>
                {sidebarExpanded ? <span className="truncate">Search</span> : <span className="sr-only">Search</span>}
              </button>

              <button
                type="button"
                onClick={() => goToTab('publish')}
                className={`flex w-full items-center rounded-2xl transition ${
                  sidebarExpanded ? 'gap-3 px-3 py-2.5 text-sm font-semibold' : 'justify-center px-0 py-2'
                } ${pageTab === 'publish' ? 'bg-slate-950 text-white shadow-[0_16px_34px_rgba(15,23,42,0.14)]' : 'text-slate-700 hover:bg-white/70'}`}
                title="Publish"
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${pageTab === 'publish' ? 'bg-white/10' : 'bg-slate-100 text-slate-700'}`}>
                  <Upload className={`h-5 w-5 ${pageTab === 'publish' ? 'text-white' : 'text-slate-700'}`} />
                </div>
                {sidebarExpanded ? <span className="truncate">Publish</span> : <span className="sr-only">Publish</span>}
              </button>

              <button
                type="button"
                onClick={() => goToTab('analytics')}
                className={`flex w-full items-center rounded-2xl transition ${
                  sidebarExpanded ? 'gap-3 px-3 py-2.5 text-sm font-semibold' : 'justify-center px-0 py-2'
                } ${pageTab === 'analytics' ? 'bg-slate-950 text-white shadow-[0_16px_34px_rgba(15,23,42,0.14)]' : 'text-slate-700 hover:bg-white/70'}`}
                title="Analytics"
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${pageTab === 'analytics' ? 'bg-white/10' : 'bg-slate-100 text-slate-700'}`}>
                  <BarChart3 className={`h-5 w-5 ${pageTab === 'analytics' ? 'text-white' : 'text-slate-700'}`} />
                </div>
                {sidebarExpanded ? <span className="truncate">Analytics</span> : <span className="sr-only">Analytics</span>}
              </button>

              <div className="pt-2">
                <Link
                  href="/"
                  title="Home"
                  className={`flex items-center rounded-2xl transition ${
                    sidebarExpanded ? 'gap-3 px-3 py-2.5 text-sm font-semibold' : 'justify-center px-0 py-2'
                  } text-slate-700 hover:bg-white/70`}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                    <Home className="h-5 w-5 text-slate-700" />
                  </div>
                  {sidebarExpanded ? <span className="truncate">Home</span> : <span className="sr-only">Home</span>}
                </Link>
              </div>
            </nav>

            <div className={`mt-auto border-t border-slate-200/70 pt-3 ${sidebarExpanded ? 'px-1' : 'px-0'}`}>
              <div className={`flex items-center rounded-2xl border border-slate-200/70 bg-white/70 p-2 ${sidebarExpanded ? 'gap-3' : 'justify-center'}`}>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
                  {((uiSession?.user?.name || uiSession?.user?.email || 'U') as string).slice(0, 1).toUpperCase()}
                </div>
                {sidebarExpanded ? (
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{uiSession?.user?.name || softwareName || 'Workspace'}</p>
                    <p className="truncate text-xs text-slate-500">{uiSession?.user?.email || (uiAuthenticated ? 'Member' : 'Guest')}</p>
                  </div>
                ) : null}
              </div>
            </div>
          </aside>
        </div>

        <main className="min-w-0 flex-1 pb-24 lg:pb-0">
          <div className="lg:hidden">
            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <h1 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">File Directory</h1>
              <button
                type="button"
                onClick={() => goToTab('publish')}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_16px_34px_rgba(15,23,42,0.18)]"
                aria-label="Publish file"
              >
                <Upload className="h-5 w-5" />
              </button>
            </div>
          </div>

          <Dialog open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <DialogContent className="cloud-panel w-[min(92vw,22rem)] overflow-hidden rounded-[1.6rem] border border-white/70 bg-white/90 p-0 shadow-[0_24px_70px_rgba(15,23,42,0.14)] backdrop-blur-2xl">
              <DialogHeader className="border-b border-slate-200/60 px-5 py-4">
                <DialogTitle className="text-base font-semibold tracking-[-0.03em] text-slate-950">Navigation</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 p-4">
                {[
                  { id: 'search' as const, label: 'Search', icon: Search },
                  { id: 'publish' as const, label: 'Publish', icon: Upload },
                  { id: 'analytics' as const, label: 'Analytics', icon: BarChart3 },
                ].map((item) => (
                  <button
                    key={`mobile-nav-${item.id}`}
                    type="button"
                    onClick={() => {
                      goToTab(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
                      pageTab === item.id ? 'bg-slate-950 text-white shadow-[0_16px_34px_rgba(15,23,42,0.14)]' : 'text-slate-700 hover:bg-white/80'
                    }`}
                  >
                    <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${pageTab === item.id ? 'bg-white/10' : 'bg-slate-100'}`}>
                      <item.icon className={`h-5 w-5 ${pageTab === item.id ? 'text-white' : 'text-slate-700'}`} />
                    </div>
                    <span className="truncate">{item.label}</span>
                  </button>
                ))}
                <Link
                  href="/"
                  className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-white/80"
                  onClick={() => setMobileNavOpen(false)}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100">
                    <Home className="h-5 w-5 text-slate-700" />
                  </div>
                  <span className="truncate">Home</span>
                </Link>
              </div>
            </DialogContent>
          </Dialog>

          <div id="file-directory-workspace" className="mt-4 rounded-[1.7rem] border border-white/60 bg-white/70 p-4 shadow-[0_18px_48px_rgba(15,23,42,0.06)] backdrop-blur-2xl sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold tracking-[-0.04em] text-slate-950">File Directory</h1>
                <p className="mt-1 text-sm text-slate-600">
                  Search public files or unlock private lockers with a password.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-xl border-slate-200 bg-white/80 text-sm font-semibold text-slate-700 hover:bg-white"
                  onClick={() => goToTab('search')}
                >
                  <Search className="mr-2 h-4 w-4" />
                  Search
                </Button>
                <Button
                  type="button"
                  className="h-10 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(15,23,42,0.18)] hover:bg-slate-900"
                  onClick={() => goToTab('publish')}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Publish
                </Button>
              </div>
            </div>

            <div className="mt-6">
              <ProcessProgress
                active={loadingSearch || loadingFiles || loadingLockers || publishing}
                profile={publishing ? 'publish' : loadingSearch ? 'search' : 'sync'}
                title={
                  publishing
                    ? 'Publishing file into the directory'
                    : loadingSearch
                      ? 'Searching the file directory'
                      : 'Syncing your files and lockers'
                }
                compact
                floating
                className="border-white/80 bg-white/94"
              />
              <Tabs value={pageTab} onValueChange={(value) => setPageTab(value as 'search' | 'publish' | 'analytics')} className="space-y-5">
                <TabsList className="grid w-full max-w-[28rem] grid-cols-3 rounded-full border border-slate-200 bg-slate-50 p-1">
                  <TabsTrigger value="search" className="rounded-full text-xs">Search</TabsTrigger>
                  <TabsTrigger value="publish" className="rounded-full text-xs">Publish</TabsTrigger>
                  <TabsTrigger value="analytics" className="rounded-full text-xs">Analytics</TabsTrigger>
                </TabsList>

          <TabsContent value="search" className="space-y-5">
            <Tabs value={scope} onValueChange={(value) => setScope(value as 'public' | 'private')} className="space-y-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500">Search</p>
                  <h3 className="mt-2 text-[1.3rem] font-semibold tracking-[-0.04em] text-slate-950">Find files fast.</h3>
                </div>
                <TabsList className="grid w-full max-w-[22rem] grid-cols-2 rounded-full border border-slate-200 bg-slate-50 p-1">
                  <TabsTrigger value="public" className="rounded-full text-xs">Public</TabsTrigger>
                  <TabsTrigger value="private" className="rounded-full text-xs">Private</TabsTrigger>
                </TabsList>
              </div>

              <div className="grid gap-3 lg:grid-cols-[1.1fr_0.5fr_0.55fr]">
                <div className="premium-surface-soft flex items-center gap-3 rounded-[1.15rem] px-4 py-3">
                  <Search className="h-4 w-4 text-slate-400" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={scope === 'public' ? 'Search public files by name, tag, or category' : 'Search private files by name'}
                    className="h-auto border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0"
                  />
                </div>
                <Input
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder="Category"
                  className="h-12 rounded-[1.05rem] border-slate-200 bg-white"
                />
                {scope === 'private' ? (
                  <Input
                    value={password}
                    onChange={(event) => setPassword(event.target.value.toUpperCase())}
                    placeholder="Locker password"
                    className="h-12 rounded-[1.05rem] border-slate-200 bg-white"
                  />
                ) : (
                  <div className="flex h-12 items-center rounded-[1.05rem] border border-slate-200 bg-slate-50 px-4 text-sm text-slate-500">
                    Public results open instantly
                  </div>
                )}
              </div>

              {categories.length ? (
                <div className="flex flex-wrap gap-2">
                  {categories.slice(0, 8).map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => setCategory((current) => current === item.label ? '' : item.label)}
                      className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition ${
                        category === item.label
                          ? 'bg-slate-950 text-white'
                          : 'border border-slate-200 bg-white text-slate-600 hover:text-slate-950'
                      }`}
                    >
                      {item.label} · {item.count}
                    </button>
                  ))}
                </div>
              ) : null}

              {searchError ? <p className="text-sm text-rose-600">{searchError}</p> : null}

              <TabsContent value="public" className="space-y-4">
                {loadingSearch ? (
                  <div className="flex min-h-[14rem] items-center justify-center rounded-[1.25rem] border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Searching public files...
                  </div>
                ) : results.length ? (
                  <div className="grid gap-4 lg:grid-cols-2">
                      {results.map((item) => (
                        <article key={item.id} className="premium-card-smoke rounded-[1.3rem] p-4 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-base font-semibold tracking-[-0.02em] text-slate-950">{item.title}</p>
                              <p className="mt-1 truncate text-xs text-slate-500">{item.kind === 'locker' ? `${item.fileCount || 0} files inside` : item.fileName}</p>
                            </div>
                            <span className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-sky-700">
                            {item.kind === 'locker' ? 'Folder' : 'Public'}
                            </span>
                          </div>
                        <p className="mt-3 text-sm leading-6 text-slate-600">{item.notes || 'Publicly searchable file entry.'}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.category ? <span className="rounded-full bg-white px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-500">{item.category}</span> : null}
                          {item.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="rounded-full bg-white px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-500">{tag}</span>
                          ))}
                        </div>
                          <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
                          <span>{formatBytes(item.sizeInBytes)}</span>
                          <span>{item.openCount} opens</span>
                          <span>{item.downloadCount} downloads</span>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button asChild className="h-10 rounded-full bg-slate-950 px-5 text-white hover:bg-slate-800">
                            <Link href={item.linkHref}>{item.kind === 'locker' ? 'Open Folder' : 'Open File'}</Link>
                            </Button>
                          </div>
                        </article>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[1.25rem] border border-dashed border-slate-200 bg-slate-50 px-5 py-12 text-center text-sm text-slate-500">
                    No public files matched yet.
                  </div>
                )}
              </TabsContent>

              <TabsContent value="private" className="space-y-4">
                {loadingSearch ? (
                  <div className="flex min-h-[14rem] items-center justify-center rounded-[1.25rem] border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Checking your locker...
                  </div>
                ) : password.trim() ? (
                  results.length ? (
                    <div className="grid gap-4 lg:grid-cols-2">
                      {results.map((item) => (
                        <article key={item.id} className="premium-card-warm rounded-[1.3rem] p-4 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-base font-semibold tracking-[-0.02em] text-slate-950">{item.title}</p>
                              <p className="mt-1 truncate text-xs text-slate-500">{item.kind === 'locker' ? `${item.fileCount || 0} files inside` : item.fileName}</p>
                            </div>
                            <span className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-amber-700">
                              {item.kind === 'locker' ? 'Folder' : 'Private'}
                            </span>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-slate-600">{item.notes || 'Password-protected locker file.'}</p>
                          <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
                            <span>{formatBytes(item.sizeInBytes)}</span>
                            <span>{item.openCount} opens</span>
                            <span>{item.downloadCount} downloads</span>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button asChild className="h-10 rounded-full bg-slate-950 px-5 text-white hover:bg-slate-800">
                              <Link href={item.linkHref}>{item.kind === 'locker' ? 'Open Locker Folder' : 'Open Locker File'}</Link>
                            </Button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-[1.25rem] border border-dashed border-slate-200 bg-slate-50 px-5 py-12 text-center text-sm text-slate-500">
                      No private files matched that password and search.
                    </div>
                  )
                ) : (
                  <div className="rounded-[1.25rem] border border-dashed border-slate-200 bg-slate-50 px-5 py-12 text-center text-sm text-slate-500">
                    Enter the locker password to reveal protected files.
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="publish" className="space-y-4">
            <section id="publisher" className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
              <div className="premium-surface-soft rounded-[1.5rem] px-4 py-5 sm:px-6 sm:py-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500">Publish</p>
                    <h2 className="mt-2 text-[1.4rem] font-semibold tracking-[-0.04em] text-slate-950">Upload once. Share anywhere.</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">Choose public search or private locker access.</p>
                  </div>
                  <div className="hidden items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm sm:flex">
                    <span className={`h-2.5 w-2.5 rounded-full ${publishForm.visibility === 'public' ? 'bg-sky-500' : 'bg-amber-500'}`} />
                    {publishForm.visibility === 'public' ? 'Public publish' : 'Private locker'}
                  </div>
                </div>

          {isAuthenticated ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-[1.25rem] border border-slate-200 bg-white/80 p-4 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-950">File details</p>
                  {filePayload ? (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-600">
                      {formatBytes(filePayload.sizeInBytes)}
                    </span>
                  ) : null}
                </div>

                <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-[1.15rem] border border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-center transition hover:border-slate-400 hover:bg-white">
                  <Upload className="h-5 w-5 text-slate-400" />
                  <span className="mt-3 text-sm font-medium text-slate-900">{filePayload ? filePayload.fileName : 'Upload a file'}</span>
                  <span className="mt-1 text-xs text-slate-500">{filePayload ? 'Click to replace' : 'PDF, docs, images, sheets, or anything else'}</span>
                  <input type="file" className="hidden" onChange={(event) => void handleFileChange(event)} />
                </label>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Input value={publishForm.title} onChange={(event) => setPublishForm((current) => ({ ...current, title: event.target.value }))} placeholder="Title" className="h-12 rounded-[1rem]" />
                  <Input value={publishForm.category} onChange={(event) => setPublishForm((current) => ({ ...current, category: event.target.value }))} placeholder="Category" className="h-12 rounded-[1rem]" />
                  <Input value={publishForm.tags} onChange={(event) => setPublishForm((current) => ({ ...current, tags: event.target.value }))} placeholder="Tags (comma separated)" className="h-12 rounded-[1rem] sm:col-span-2" />
                  <Input value={publishForm.notes} onChange={(event) => setPublishForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Short note (optional)" className="h-12 rounded-[1rem] sm:col-span-2" />
                </div>
              </div>

              <div className="rounded-[1.25rem] border border-slate-200 bg-white/80 p-4 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
                <p className="text-sm font-semibold text-slate-950">Visibility</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setPublishForm((current) => ({ ...current, visibility: 'public' }))}
                    className={`group rounded-[1.15rem] border px-4 py-4 text-left transition ${
                      publishForm.visibility === 'public'
                        ? 'border-sky-500/40 bg-[linear-gradient(135deg,rgba(14,165,233,0.18),rgba(99,102,241,0.12))] shadow-[0_14px_34px_rgba(14,165,233,0.12)]'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-2xl ${publishForm.visibility === 'public' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                          <Globe className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-950">Public</p>
                          <p className="mt-0.5 text-xs text-slate-600">Searchable listing + share link</p>
                        </div>
                      </div>
                      {publishForm.visibility === 'public' ? (
                        <span className="rounded-full bg-sky-600/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-sky-700">Active</span>
                      ) : null}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPublishForm((current) => ({ ...current, visibility: 'private' }))}
                    className={`group rounded-[1.15rem] border px-4 py-4 text-left transition ${
                      publishForm.visibility === 'private'
                        ? 'border-amber-500/40 bg-[linear-gradient(135deg,rgba(245,158,11,0.16),rgba(236,72,153,0.10))] shadow-[0_14px_34px_rgba(245,158,11,0.10)]'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-2xl ${publishForm.visibility === 'private' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                          <FolderLock className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-950">Private</p>
                          <p className="mt-0.5 text-xs text-slate-600">Locker password required</p>
                        </div>
                      </div>
                      {publishForm.visibility === 'private' ? (
                        <span className="rounded-full bg-amber-600/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-amber-700">Active</span>
                      ) : null}
                    </div>
                  </button>
                </div>
              </div>

              {publishForm.visibility === 'private' ? (
                <div className="rounded-[1.25rem] border border-slate-200 bg-white/80 p-4 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-950">Locker settings</p>
                    <span className="rounded-full bg-amber-600/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-amber-700">
                      password protected
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setPublishForm((current) => ({ ...current, lockerMode: 'new', lockerId: '', lockerName: current.lockerName || current.title, password: current.password || generateLockerPassword() }))}
                      className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition ${
                        publishForm.lockerMode === 'new'
                          ? 'bg-slate-950 text-white shadow-[0_10px_24px_rgba(15,23,42,0.12)]'
                          : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      New locker
                    </button>
                    <button
                      type="button"
                      onClick={() => setPublishForm((current) => ({ ...current, lockerMode: 'existing', lockerId: lockers[0]?.id || current.lockerId }))}
                      className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition ${
                        publishForm.lockerMode === 'existing'
                          ? 'bg-slate-950 text-white shadow-[0_10px_24px_rgba(15,23,42,0.12)]'
                          : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      Existing locker
                    </button>
                  </div>

                  {publishForm.lockerMode === 'existing' ? (
                    <div className="grid gap-3">
                      <select
                        value={publishForm.lockerId}
                        onChange={(event) => setPublishForm((current) => ({ ...current, lockerId: event.target.value }))}
                        className="h-12 rounded-[1rem] border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none"
                      >
                        <option value="">{loadingLockers ? 'Loading lockers...' : 'Select locker'}</option>
                        {lockers.map((locker) => (
                          <option key={locker.id} value={locker.id}>{locker.name}</option>
                        ))}
                      </select>
                      <div className="rounded-[1rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                        Locker password: <span className="font-semibold text-slate-950">{publishForm.password || 'Select a locker'}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input value={publishForm.lockerName} onChange={(event) => setPublishForm((current) => ({ ...current, lockerName: event.target.value }))} placeholder="Locker name" className="h-12 rounded-[1rem]" />
                      <Input value={publishForm.rotationDays} onChange={(event) => setPublishForm((current) => ({ ...current, rotationDays: event.target.value.replace(/[^\d]/g, '') }))} placeholder="Rotation (days)" className="h-12 rounded-[1rem]" />
                      <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row">
                        <Input value={publishForm.password} onChange={(event) => setPublishForm((current) => ({ ...current, password: event.target.value.toUpperCase() }))} placeholder="Locker password" className="h-12 rounded-[1rem]" />
                        <Button
                          type="button"
                          variant="outline"
                          className="h-12 rounded-[1rem] border-slate-200 bg-white px-4 text-[12px]"
                          onClick={() => setPublishForm((current) => ({ ...current, password: generateLockerPassword() }))}
                        >
                          Regenerate
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                    <Input
                      value={publishForm.filePassword}
                      onChange={(event) => setPublishForm((current) => ({ ...current, filePassword: event.target.value.toUpperCase() }))}
                      placeholder="Extra file password (optional)"
                      className="h-12 rounded-[1rem]"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 rounded-[1rem] border-slate-200 bg-white px-4 text-[12px]"
                      onClick={() => setPublishForm((current) => ({ ...current, filePassword: current.filePassword ? '' : generateLockerPassword() }))}
                    >
                      {publishForm.filePassword ? 'Remove file password' : 'Add file password'}
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">Lockers group multiple files under one password. Rotate anytime from the locker list.</p>
                </div>
              ) : null}

              {publisherStatus ? <p className="text-sm text-emerald-600">{publisherStatus}</p> : null}
              {publisherError ? <p className="text-sm text-rose-600">{publisherError}</p> : null}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button onClick={() => void publishFile()} disabled={publishing} className="premium-button h-11 rounded-full px-6 text-white hover:opacity-95">
                  {publishing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Publishing...</> : 'Publish File'}
                </Button>
                <p className="text-xs text-slate-500">
                  Tip: Use tags like <span className="font-semibold text-slate-700">Resume</span> / <span className="font-semibold text-slate-700">Screens</span> for cleaner search.
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-8 text-center">
              <p className="text-sm text-slate-600">Login to publish files into the directory or your private locker.</p>
              <Button asChild className="premium-button mt-4 h-11 rounded-full px-6 text-white hover:opacity-95">
                <Link href="/login">Login to Publish</Link>
              </Button>
            </div>
          )}
              </div>

              <div className="premium-card-smoke rounded-[1.5rem] p-5 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
                <Tabs value={publishRightTab} onValueChange={(value) => setPublishRightTab(value as 'latest' | 'lockers')} className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500">Workspace</p>
                    <TabsList className="grid w-[16rem] grid-cols-2 rounded-full border border-slate-200 bg-slate-50 p-1">
                      <TabsTrigger value="latest" className="rounded-full text-xs">Latest</TabsTrigger>
                      <TabsTrigger value="lockers" className="rounded-full text-xs">Lockers</TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="latest" className="space-y-3">
                    {createdTransfer ? (
                      <div className="rounded-[1.25rem] bg-white/84 p-4 shadow-[0_10px_20px_rgba(15,23,42,0.04)]">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-950">{createdTransfer.title || createdTransfer.fileName}</p>
                            <p className="mt-1 truncate text-xs text-slate-500">{createdTransfer.fileName}</p>
                          </div>
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${createdTransfer.directoryVisibility === 'public' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
                            {createdTransfer.directoryVisibility || 'private'}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button type="button" variant="outline" className="h-10 rounded-full" onClick={() => void copyAllDetails(createdTransfer)}>
                            <Copy className="mr-2 h-4 w-4" />
                            Copy details
                          </Button>
                          <Button type="button" variant="outline" className="h-10 rounded-full" onClick={() => void copyShareLink(createdTransfer.shareId)}>
                            <Copy className="mr-2 h-4 w-4" />
                            Copy link
                          </Button>
                          <Button asChild className="h-10 rounded-full bg-slate-950 text-white hover:bg-slate-800">
                            <Link href={`/transfer/${createdTransfer.shareId}`}>Open</Link>
                          </Button>
                        </div>
                        {createdTransfer.directoryVisibility !== 'public' && createdTransfer.accessPassword ? (
                          <div className="mt-3 rounded-[1rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                            Locker password: <span className="font-semibold text-slate-950">{createdTransfer.accessPassword}</span>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="rounded-[1.25rem] border border-dashed border-slate-200 bg-slate-50 px-5 py-12 text-center text-sm text-slate-500">
                        Publish a file to generate a share link.
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="lockers" className="space-y-3">
                    {lockers.length ? (
                      <div className="space-y-3">
                        {lockers.slice(0, 6).map((locker) => {
                          const filesInLocker = myDirectoryFiles.filter((item) => item.lockerId === locker.id);
                          return (
                            <details key={locker.id} className="group rounded-[1.25rem] bg-white/84 p-4 shadow-[0_10px_20px_rgba(15,23,42,0.04)]">
                              <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-950">{locker.name}</p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {filesInLocker.length} file(s) · v{locker.passwordVersion} · {locker.passwordRotationDays ? `rotates every ${locker.passwordRotationDays} days` : 'manual rotation'}
                                  </p>
                                </div>
                                <div className="shrink-0 text-right">
                                  <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                                    {locker.currentPassword}
                                  </span>
                                  <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-slate-400">
                                    {locker.history?.length ? `${locker.history.length} event(s)` : 'no history'}
                                  </p>
                                </div>
                              </summary>

                              <div className="mt-4 flex flex-wrap gap-2">
                                <Button type="button" variant="outline" className="h-9 rounded-full" onClick={() => void copyLockerDetails(locker)}>
                                  <Copy className="mr-2 h-4 w-4" />
                                  Copy
                                </Button>
                                <Button asChild type="button" variant="outline" className="h-9 rounded-full">
                                  <Link href={`/file-directory/locker/${locker.id}`}>Open</Link>
                                </Button>
                                <Button type="button" variant="outline" className="h-9 rounded-full" onClick={() => void rotateLocker(locker)}>
                                  Rotate
                                </Button>
                              </div>

                              {locker.history?.length ? (
                                <div className="mt-4 space-y-2">
                                  {locker.history.slice(0, 4).map((event) => (
                                    <div key={event.id} className="rounded-[1rem] bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                                      <div className="flex items-start justify-between gap-3">
                                        <span className="min-w-0 flex-1 text-slate-700">
                                          <span className="font-medium text-slate-900">{event.note}</span>
                                        </span>
                                        <span className="shrink-0 text-slate-400">{new Date(event.createdAt).toLocaleDateString()}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </details>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-[1.25rem] border border-dashed border-slate-200 bg-slate-50 px-5 py-12 text-center text-sm text-slate-500">
                        No lockers yet. Publish a private file to create one.
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <section className="premium-surface-soft rounded-[1.5rem] px-4 py-5 sm:px-6 sm:py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500">Your analytics</p>
              <h2 className="mt-2 text-[1.4rem] font-semibold tracking-[-0.04em] text-slate-950">See what people open.</h2>
            </div>
            {loadingFiles ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
          </div>

          {isAuthenticated ? (
            myDirectoryFiles.length ? (
              <div className="mt-5 space-y-3">
                {myDirectoryFiles.slice(0, 6).map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-[1.2rem] border bg-white px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)] ${
                      item.directoryVisibility === 'public' ? 'border-sky-200/70' : 'border-amber-200/70'
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-slate-950">{item.title || item.fileName}</p>
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${item.directoryVisibility === 'public' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
                            {item.directoryVisibility || 'private'}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-500">{item.fileName}</p>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <div className="rounded-full bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
                            <span className="font-semibold text-slate-950">{item.openCount}</span>
                            <span className="ml-1 text-slate-500">opens</span>
                          </div>
                          <div className="rounded-full bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
                            <span className="font-semibold text-slate-950">{item.downloadCount}</span>
                            <span className="ml-1 text-slate-500">downloads</span>
                          </div>
                          <div className="rounded-full bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
                            <span className="font-semibold text-slate-950">{formatBytes(item.sizeInBytes)}</span>
                            <span className="ml-1 text-slate-500">size</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        <Button type="button" variant="outline" className="h-9 rounded-full" onClick={() => void copyAllDetails(item)}>
                          <Copy className="mr-2 h-4 w-4" />
                          Copy details
                        </Button>
                        <Button type="button" variant="outline" className="h-9 rounded-full" onClick={() => void copyShareLink(item.shareId)}>
                          <Copy className="mr-2 h-4 w-4" />
                          Copy link
                        </Button>
                        <Button asChild className="h-9 rounded-full bg-slate-950 text-white hover:bg-slate-800">
                          <Link href={`/transfer/${item.shareId}`}>
                            <Download className="mr-2 h-4 w-4" />
                            Open
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-[1.2rem] border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                Publish your first file to start seeing opens, downloads, and engagement.
              </div>
            )
          ) : (
            <div className="mt-5 rounded-[1.2rem] border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              Login to track your published files and locker activity.
            </div>
          )}
            </section>
          </TabsContent>
        </Tabs>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
