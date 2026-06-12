'use client';

import Image from 'next/image';
import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { Copy, Download, KeyRound, Loader2, LockKeyhole, QrCode, RefreshCw, ShieldCheck, Smartphone, Trash2, Unlock, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { SecureFileTransfer } from '@/types/document';
import { buildAbsoluteAppUrl, buildQrImageUrl } from '@/lib/url';

const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Failed to read the selected file.'));
  reader.readAsDataURL(file);
});

const readFileAsArrayBuffer = (file: File) => new Promise<ArrayBuffer>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result as ArrayBuffer);
  reader.onerror = () => reject(new Error('Failed to read the selected file.'));
  reader.readAsArrayBuffer(file);
});

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...Array.from(chunk));
  }
  return btoa(binary);
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

type LockedPackagePayload = {
  magic: 'DOCRUD_LOCK_PACKAGE_V1';
  title: string;
  fileName: string;
  mimeType: string;
  encryptedBase64: string;
  saltBase64: string;
  ivBase64: string;
  bytes: number;
};

interface SecureAccessCenterProps {
  mode: 'qr-drop' | 'offline-locker';
  variant?: 'full' | 'unlock-only';
}

export default function SecureAccessCenter({ mode, variant = 'full' }: SecureAccessCenterProps) {
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const [qrTab, setQrTab] = useState<'create' | 'history'>('create');
  const [qrHistorySearch, setQrHistorySearch] = useState('');

  const [qrDraft, setQrDraft] = useState({
    title: '',
    notes: '',
    password: '',
    expiresInDays: '7',
    maxDownloads: '',
  });
  const [qrFilePayload, setQrFilePayload] = useState<{ fileName: string; mimeType: string; sizeInBytes: number; dataUrl: string } | null>(null);
  const [qrTransfer, setQrTransfer] = useState<SecureFileTransfer | null>(null);
  const [qrSaving, setQrSaving] = useState(false);
  const [qrImageFailed, setQrImageFailed] = useState(false);
  const [qrHistory, setQrHistory] = useState<SecureFileTransfer[]>([]);
  const [qrHistoryPage, setQrHistoryPage] = useState(1);
  const [editingQrId, setEditingQrId] = useState('');
  const [qrEditDraft, setQrEditDraft] = useState({ title: '', notes: '', password: '' });

  const [lockerFile, setLockerFile] = useState<File | null>(null);
  const [lockerSaving, setLockerSaving] = useState(false);
  const [lockerForm, setLockerForm] = useState({
    title: '',
    password: '',
    packageExtension: 'docrudlock',
  });
  const [lockedPackageFile, setLockedPackageFile] = useState<File | null>(null);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);

  const qrUrl = useMemo(() => {
    if (!qrTransfer) {
      return '';
    }
    return buildQrImageUrl(qrTransfer.publicOpenUrl || `/transfer/${qrTransfer.shareId}`, typeof window !== 'undefined' ? window.location.origin : undefined);
  }, [qrTransfer]);

  const absoluteTransferLink = useMemo(() => {
    if (!qrTransfer) {
      return '';
    }
    return buildAbsoluteAppUrl(qrTransfer.publicOpenUrl || `/transfer/${qrTransfer.shareId}`, typeof window !== 'undefined' ? window.location.origin : undefined);
  }, [qrTransfer]);
  const paginatedQrHistory = useMemo(() => {
    const start = (qrHistoryPage - 1) * 5;
    return qrHistory.slice(start, start + 5);
  }, [qrHistory, qrHistoryPage]);
  const qrHistoryPageCount = Math.max(1, Math.ceil(qrHistory.length / 5));

  const resetMessages = () => {
    setStatusMessage('');
    setErrorMessage('');
  };

  const formatBytes = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
    const amount = value / Math.pow(1024, index);
    return `${amount.toFixed(amount >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
  };

  useEffect(() => {
    if (mode !== 'qr-drop' || variant !== 'full') return;
    void fetch('/api/file-transfers', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : [])
      .then((payload) => {
        const next = Array.isArray(payload) ? payload : [];
        next.sort((a, b) => new Date(String(b.createdAt || '')).getTime() - new Date(String(a.createdAt || '')).getTime());
        setQrHistory(next.slice(0, 24));
      })
      .catch(() => undefined);
  }, [mode, qrTransfer, variant]);

  const refreshQrHistory = async () => {
    if (mode !== 'qr-drop' || variant !== 'full') return;
    try {
      const response = await fetch('/api/file-transfers', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) return;
      const next = Array.isArray(payload) ? payload : [];
      next.sort((a, b) => new Date(String(b.createdAt || '')).getTime() - new Date(String(a.createdAt || '')).getTime());
      setQrHistory(next.slice(0, 24));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    setQrHistoryPage(1);
  }, [qrHistory.length]);

  const deleteQrHistoryItem = async (id: string) => {
    const response = await fetch(`/api/file-transfers?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (response.ok) {
      setQrHistory((current) => current.filter((item) => item.id !== id));
      setStatusMessage('QR share removed.');
      setErrorMessage('');
      return;
    }
    setErrorMessage('Unable to delete this QR share.');
  };

  const revokeQrHistoryItem = async (id: string) => {
    const response = await fetch('/api/file-transfers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, revoke: true }),
    });
    const payload = await response.json().catch(() => null);
    if (response.ok) {
      setQrHistory((current) => current.map((item) => (item.id === payload.id ? payload : item)));
      if (qrTransfer?.id === payload.id) setQrTransfer(payload);
      setStatusMessage('QR share revoked.');
      setErrorMessage('');
      return;
    }
    setErrorMessage(payload?.error || 'Unable to revoke this QR share.');
  };

  const beginQrEdit = (entry: SecureFileTransfer) => {
    setEditingQrId(entry.id);
    setQrEditDraft({
      title: entry.title || '',
      notes: entry.notes || '',
      password: entry.accessPassword || '',
    });
  };

  const saveQrEdit = async () => {
    if (!editingQrId) return;
    const response = await fetch('/api/file-transfers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingQrId,
        title: qrEditDraft.title,
        notes: qrEditDraft.notes,
        accessPassword: qrEditDraft.password,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (response.ok) {
      setQrHistory((current) => current.map((entry) => (entry.id === payload.id ? payload : entry)));
      if (qrTransfer?.id === payload.id) {
        setQrTransfer(payload);
      }
      setStatusMessage('QR share updated.');
      setErrorMessage('');
      setEditingQrId('');
      return;
    }
    setErrorMessage(payload?.error || 'Unable to update this QR share.');
  };

  const handleQrFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setQrFilePayload({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeInBytes: file.size,
        dataUrl,
      });
      setQrDraft((current) => ({ ...current, title: current.title || file.name.replace(/\.[^.]+$/, '') }));
      setStatusMessage(`${file.name} is ready for QR-based sharing.`);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load the selected file.');
      setStatusMessage('');
    }
  };

  const createQrTransfer = async () => {
    if (!qrFilePayload) {
      setErrorMessage('Upload a file first.');
      setStatusMessage('');
      return;
    }

    try {
      setQrSaving(true);
      const expiresAt = qrDraft.expiresInDays
        ? new Date(Date.now() + Number(qrDraft.expiresInDays) * 24 * 60 * 60 * 1000).toISOString()
        : undefined;
      const response = await fetch('/api/file-transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...qrFilePayload,
          title: qrDraft.title,
          notes: qrDraft.notes,
          authMode: 'password',
          accessPassword: qrDraft.password,
          expiresAt,
          maxDownloads: qrDraft.maxDownloads ? Number(qrDraft.maxDownloads) : undefined,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to create the QR share.');
      }
      setQrTransfer(payload);
      setQrImageFailed(false);
      setStatusMessage('QR download share is ready. Scan from another device to open and download the file.');
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create the QR share.');
      setStatusMessage('');
    } finally {
      setQrSaving(false);
    }
  };

  const copyValue = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setStatusMessage(`${label} copied.`);
    setErrorMessage('');
  };

  const createOfflineLocker = async () => {
    if (!lockerFile) {
      setErrorMessage('Upload a document to lock first.');
      setStatusMessage('');
      return;
    }
    if (lockerForm.password.trim().length < 6) {
      setErrorMessage('Use a stronger password with at least 6 characters.');
      setStatusMessage('');
      return;
    }

    try {
      setLockerSaving(true);
      const bytes = new Uint8Array(await readFileAsArrayBuffer(lockerFile));
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const passwordBytes = new TextEncoder().encode(lockerForm.password.trim());
      const keyMaterial = await crypto.subtle.importKey('raw', passwordBytes, 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt,
          iterations: 160000,
          hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt']
      );
      const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
      const payload: LockedPackagePayload = {
        magic: 'DOCRUD_LOCK_PACKAGE_V1',
        fileName: lockerFile.name,
        mimeType: lockerFile.type || 'application/octet-stream',
        title: lockerForm.title.trim() || lockerFile.name.replace(/\.[^.]+$/, ''),
        encryptedBase64: bytesToBase64(new Uint8Array(encrypted)),
        saltBase64: bytesToBase64(salt),
        ivBase64: bytesToBase64(iv),
        bytes: lockerFile.size,
      };
      const packageName = `${(lockerForm.title.trim() || lockerFile.name.replace(/\.[^.]+$/, '')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'locked-document'}.${lockerForm.packageExtension}`;
      triggerDownload(new Blob([JSON.stringify(payload)], { type: 'application/octet-stream' }), packageName);
      setStatusMessage('Locked package created. Share this protected file and the password separately. The original document will be restored only after unlock.');
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create the offline locked package.');
      setStatusMessage('');
    } finally {
      setLockerSaving(false);
    }
  };

  const unlockLockedPackage = async () => {
    if (!lockedPackageFile) {
      setErrorMessage('Choose a locked package first.');
      setStatusMessage('');
      return;
    }
    if (!unlockPassword.trim()) {
      setErrorMessage('Enter the password first.');
      setStatusMessage('');
      return;
    }

    try {
      setUnlocking(true);
      const packageText = await lockedPackageFile.text();
      const payload = JSON.parse(packageText) as Partial<LockedPackagePayload>;
      if (payload.magic !== 'DOCRUD_LOCK_PACKAGE_V1' || !payload.encryptedBase64 || !payload.saltBase64 || !payload.ivBase64 || !payload.fileName) {
        throw new Error('This locked package is invalid or unsupported.');
      }

      const passwordBytes = new TextEncoder().encode(unlockPassword.trim());
      const keyMaterial = await crypto.subtle.importKey('raw', passwordBytes, 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: Uint8Array.from(atob(payload.saltBase64), (char) => char.charCodeAt(0)),
          iterations: 160000,
          hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );
      const decrypted = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: Uint8Array.from(atob(payload.ivBase64), (char) => char.charCodeAt(0)),
        },
        key,
        Uint8Array.from(atob(payload.encryptedBase64), (char) => char.charCodeAt(0))
      );
      triggerDownload(new Blob([decrypted], { type: payload.mimeType || 'application/octet-stream' }), payload.fileName);
      setStatusMessage('Document unlocked successfully.');
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to unlock this package.');
      setStatusMessage('');
    } finally {
      setUnlocking(false);
    }
  };

  if (mode === 'offline-locker' && variant === 'unlock-only') {
    return (
      <div className="space-y-6">
        {(statusMessage || errorMessage) && (
          <Card className="border-white/60 bg-white/82 backdrop-blur">
            <CardContent className="p-4">
              {statusMessage ? <p className="text-sm text-emerald-700">{statusMessage}</p> : null}
              {errorMessage ? <p className="text-sm text-rose-600">{errorMessage}</p> : null}
            </CardContent>
          </Card>
        )}

        <section className="overflow-hidden rounded-[30px] border border-white/70 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.12),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(15,23,42,0.08),transparent_30%),linear-gradient(135deg,#ffffff,#f8fafc)] shadow-[0_28px_90px_rgba(15,23,42,0.1)]">
          <div className="grid gap-6 p-5 md:p-7 xl:grid-cols-[minmax(0,1.15fr)_320px]">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-white">
                <Unlock className="h-4 w-4" />
                Locked File Unlock
              </div>
              <div>
                <h2 className="text-3xl font-semibold tracking-[-0.02em] text-slate-950 md:text-4xl">Restore a protected document with the shared password.</h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 md:text-base">
                  Upload the locked package file, enter the password shared by the sender, and docrud will restore the original document for download.
                </p>
              </div>
            </div>
            <div className="grid gap-3">
              {[
                { label: 'Accepted formats', value: '.docrudlock · .securedoc · .dlock' },
                { label: 'Access', value: 'No login required' },
                { label: 'Result', value: 'Original file restored' },
              ].map((item) => (
                <div key={item.label} className="rounded-[1.2rem] border border-white/80 bg-white/86 p-4 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Card className="border-white/60 bg-white/85">
          <CardHeader>
            <CardTitle>Unlock package</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              <label className="flex min-h-[170px] cursor-pointer flex-col items-center justify-center rounded-[1.35rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center">
                <Unlock className="h-5 w-5 text-slate-500" />
                <p className="mt-3 text-sm font-medium text-slate-900">Choose the locked package file</p>
                <p className="mt-1 text-xs text-slate-500">The original file is revealed only after the right password is entered.</p>
                <input
                  type="file"
                  accept=".docrudlock,.securedoc,.dlock"
                  className="hidden"
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0] || null;
                    setLockedPackageFile(nextFile);
                    setStatusMessage('');
                    setErrorMessage('');
                  }}
                />
              </label>
              {lockedPackageFile ? (
                <div className="rounded-[1.2rem] border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-950">{lockedPackageFile.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{Math.max(1, Math.round(lockedPackageFile.size / 1024))} KB</p>
                </div>
              ) : null}
            </div>
            <div className="space-y-4">
              <Input type="password" value={unlockPassword} onChange={(event) => setUnlockPassword(event.target.value)} placeholder="Enter unlock password" />
              <Button onClick={() => void unlockLockedPackage()} disabled={unlocking} className="w-full rounded-xl bg-slate-950 text-white hover:bg-slate-800">
                {unlocking ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Unlocking...</> : 'Unlock and Restore Original File'}
              </Button>
              <div className="rounded-[1.1rem] border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                The sender should share the locked file and the password separately for better security.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (mode === 'offline-locker') {
    return (
      <div className="space-y-6">
        {(statusMessage || errorMessage) && (
          <Card className="border-white/60 bg-white/82 backdrop-blur">
            <CardContent className="p-4">
              {statusMessage ? <p className="text-sm text-emerald-700">{statusMessage}</p> : null}
              {errorMessage ? <p className="text-sm text-rose-600">{errorMessage}</p> : null}
            </CardContent>
          </Card>
        )}

        <section className="overflow-hidden rounded-[30px] border border-white/70 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.12),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(15,23,42,0.08),transparent_30%),linear-gradient(135deg,#ffffff,#f8fafc)] shadow-[0_28px_90px_rgba(15,23,42,0.1)]">
          <div className="grid gap-6 p-5 md:p-7 xl:grid-cols-[minmax(0,1.15fr)_360px]">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-white">
                <LockKeyhole className="h-4 w-4" />
                Offline Document Locker
              </div>
              <div>
                <h2 className="text-3xl font-semibold tracking-[-0.02em] text-slate-950 md:text-4xl">Lock a file once, then open it locally with just the password.</h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 md:text-base">
                  Upload any document, set one password, and download a self-contained locked package. The recipient can open it later even without internet, enter the password, and unlock the original file safely on that device.
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {[
                { label: 'Works offline', value: 'Yes' },
                { label: 'Password unlock', value: 'Required' },
                { label: 'File type', value: 'Any document' },
              ].map((item) => (
                <div key={item.label} className="rounded-[1.2rem] border border-white/80 bg-white/86 p-4 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_360px]">
          <Card className="border-white/60 bg-white/85">
            <CardHeader>
              <CardTitle>Create a locked package</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex min-h-[190px] cursor-pointer flex-col items-center justify-center rounded-[1.35rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center">
                <Upload className="h-5 w-5 text-slate-500" />
                <p className="mt-3 text-sm font-medium text-slate-900">Choose any file to lock</p>
                <p className="mt-1 text-xs text-slate-500">The downloaded package contains the encrypted file and the offline unlock interface together.</p>
                <input
                  type="file"
                  className="hidden"
                  onChange={(event) => {
                    resetMessages();
                    const nextFile = event.target.files?.[0] || null;
                    setLockerFile(nextFile);
                    if (nextFile) {
                      setLockerForm((current) => ({ ...current, title: current.title || nextFile.name.replace(/\.[^.]+$/, '') }));
                    }
                  }}
                />
              </label>
              {lockerFile ? (
                <div className="rounded-[1.2rem] border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-950">{lockerFile.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{Math.max(1, Math.round(lockerFile.size / 1024))} KB · {lockerFile.type || 'application/octet-stream'}</p>
                </div>
              ) : null}
              <div className="grid gap-4 md:grid-cols-3">
                <Input value={lockerForm.title} onChange={(event) => setLockerForm((current) => ({ ...current, title: event.target.value }))} placeholder="Package title" />
                <Input type="password" value={lockerForm.password} onChange={(event) => setLockerForm((current) => ({ ...current, password: event.target.value }))} placeholder="Set unlock password" />
                <select value={lockerForm.packageExtension} onChange={(event) => setLockerForm((current) => ({ ...current, packageExtension: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm">
                  <option value="docrudlock">.docrudlock</option>
                  <option value="securedoc">.securedoc</option>
                  <option value="dlock">.dlock</option>
                </select>
              </div>
              <Button onClick={() => void createOfflineLocker()} disabled={lockerSaving} className="w-full rounded-xl bg-slate-950 text-white hover:bg-slate-800">
                {lockerSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating package...</> : 'Create Locked File Package'}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-white/60 bg-white/85">
            <CardHeader>
              <CardTitle>Unlock a locked package</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex min-h-[170px] cursor-pointer flex-col items-center justify-center rounded-[1.35rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center">
                <Unlock className="h-5 w-5 text-slate-500" />
                <p className="mt-3 text-sm font-medium text-slate-900">Choose a `.docrudlock`, `.securedoc`, or `.dlock` package</p>
                <p className="mt-1 text-xs text-slate-500">The original document is restored only after correct password validation.</p>
                <input
                  type="file"
                  accept=".docrudlock,.securedoc,.dlock"
                  className="hidden"
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0] || null;
                    setLockedPackageFile(nextFile);
                    setStatusMessage('');
                    setErrorMessage('');
                  }}
                />
              </label>
              {lockedPackageFile ? (
                <div className="rounded-[1.2rem] border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-950">{lockedPackageFile.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{Math.max(1, Math.round(lockedPackageFile.size / 1024))} KB</p>
                </div>
              ) : null}
              <Input type="password" value={unlockPassword} onChange={(event) => setUnlockPassword(event.target.value)} placeholder="Enter unlock password" />
              <Button onClick={() => void unlockLockedPackage()} disabled={unlocking} className="w-full rounded-xl bg-slate-950 text-white hover:bg-slate-800">
                {unlocking ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Unlocking...</> : 'Unlock and Restore Original File'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(statusMessage || errorMessage) && (
        <Card className="cloud-panel rounded-[1.5rem] border border-white/55">
          <CardContent className="p-4">
            {statusMessage ? <p className="text-sm text-emerald-700">{statusMessage}</p> : null}
            {errorMessage ? <p className="text-sm text-rose-600">{errorMessage}</p> : null}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-white">
          <QrCode className="h-4 w-4" />
          QR File Drop
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant={qrTab === 'create' ? 'default' : 'outline'} onClick={() => setQrTab('create')} className="rounded-xl">
            Create
          </Button>
          <Button type="button" variant={qrTab === 'history' ? 'default' : 'outline'} onClick={() => setQrTab('history')} className="rounded-xl">
            History
          </Button>
        </div>
      </div>

      {qrTab === 'create' ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_380px]">
          <Card className="cloud-panel rounded-[1.6rem] border border-white/55">
            <CardHeader>
              <CardTitle>Create a QR-ready file share</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex min-h-[190px] cursor-pointer flex-col items-center justify-center rounded-[1.35rem] border border-dashed border-white/60 bg-white/45 px-6 py-8 text-center">
                <Smartphone className="h-5 w-5 text-slate-500" />
                <p className="mt-3 text-sm font-medium text-slate-900">Choose a file for scan-and-download sharing</p>
                <p className="mt-1 text-xs text-slate-500">Upload once. Scan from another device. Track opens and downloads.</p>
                <input type="file" className="hidden" onChange={(event) => void handleQrFileChange(event)} />
              </label>

              {qrFilePayload ? (
                <div className="rounded-[1.2rem] border border-white/60 bg-white/55 p-4">
                  <p className="text-sm font-semibold text-slate-950">{qrFilePayload.fileName}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatBytes(qrFilePayload.sizeInBytes)} · {qrFilePayload.mimeType}</p>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <Input value={qrDraft.title} onChange={(event) => setQrDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Share title" className="navbar-glass h-10 rounded-xl" />
                <Input value={qrDraft.password} onChange={(event) => setQrDraft((current) => ({ ...current, password: event.target.value.toUpperCase() }))} placeholder="Access password" className="navbar-glass h-10 rounded-xl" />
              </div>
              <textarea value={qrDraft.notes} onChange={(event) => setQrDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Optional note" className="navbar-glass min-h-[90px] w-full rounded-xl px-3 py-2 text-sm text-slate-900" />
              <div className="grid gap-3 md:grid-cols-3">
                <Input value={qrDraft.expiresInDays} onChange={(event) => setQrDraft((current) => ({ ...current, expiresInDays: event.target.value }))} placeholder="Expires in days" className="navbar-glass h-10 rounded-xl" />
                <Input value={qrDraft.maxDownloads} onChange={(event) => setQrDraft((current) => ({ ...current, maxDownloads: event.target.value }))} placeholder="Max downloads" className="navbar-glass h-10 rounded-xl" />
                <Button onClick={() => void createQrTransfer()} disabled={qrSaving} className="h-10 rounded-xl bg-slate-950 text-white hover:bg-slate-800">
                  {qrSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</> : 'Create QR Share'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="cloud-panel rounded-[1.6rem] border border-white/55">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Live QR and tracking</CardTitle>
                <p className="mt-1 text-sm text-slate-500">Scan to open the secure redirect link. Track opens and downloads here.</p>
              </div>
              <Button type="button" variant="outline" onClick={() => { setQrTransfer(null); setQrImageFailed(false); resetMessages(); }} className="rounded-xl">
                New
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {qrTransfer && qrUrl ? (
                <div className="space-y-4">
                  <div className="mx-auto w-fit overflow-hidden rounded-[1.8rem] border border-white/60 bg-white/55 p-4 shadow-sm">
                    {!qrImageFailed ? (
                      <Image
                        src={qrUrl}
                        alt="QR code for file download"
                        width={260}
                        height={260}
                        unoptimized
                        className="h-[260px] w-[260px] rounded-[1.2rem]"
                        onError={() => setQrImageFailed(true)}
                      />
                    ) : (
                      <div className="flex h-[260px] w-[260px] flex-col items-center justify-center rounded-[1.2rem] bg-white/50 text-center text-sm text-slate-600">
                        QR image unavailable.
                        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => setQrImageFailed(false)}>
                          Retry
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-3">
                    <div className="rounded-2xl border border-white/60 bg-white/55 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Open link</p>
                      <p className="mt-2 break-all text-sm font-semibold text-slate-950">{absoluteTransferLink}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => window.open(absoluteTransferLink, '_blank', 'noopener,noreferrer')}>
                          Open
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => void copyValue(absoluteTransferLink, 'QR share link')}>
                          <Copy className="mr-2 h-4 w-4" />
                          Copy
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/60 bg-white/55 p-4">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Access password</p>
                        <p className="font-mono text-sm text-slate-900">{qrTransfer.accessPassword || 'None'}</p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => void copyValue(qrTransfer.accessPassword || '', 'Access password')}>
                        <KeyRound className="mr-2 h-4 w-4" />
                        Copy
                      </Button>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3">
                      {[
                        { label: 'Opens', value: String(qrTransfer.openCount) },
                        { label: 'Downloads', value: String(qrTransfer.downloadCount) },
                        { label: 'Last open', value: qrTransfer.lastOpenedAt ? new Date(qrTransfer.lastOpenedAt).toLocaleString() : 'Not yet' },
                      ].map((item) => (
                        <div key={item.label} className="rounded-2xl border border-white/60 bg-white/55 px-3 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
                          <p className="mt-1 text-sm font-semibold text-slate-950">{item.value}</p>
                        </div>
                      ))}
                    </div>

                    {!qrTransfer.revokedAt ? (
                      <Button type="button" variant="outline" onClick={() => void revokeQrHistoryItem(qrTransfer.id)} className="rounded-xl">
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Revoke QR share
                      </Button>
                    ) : (
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        This QR share has been revoked.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-[1.2rem] border border-dashed border-white/60 bg-white/45 p-8 text-center text-sm text-slate-600">
                  Create a QR share and the QR code, link, password, and tracking will appear here.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="cloud-panel rounded-[1.6rem] border border-white/55">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <CardTitle>Recent QR shares</CardTitle>
              <p className="mt-1 text-sm text-slate-500">Open, copy, edit, revoke, and delete your QR file drop links.</p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
              <Input value={qrHistorySearch} onChange={(event) => setQrHistorySearch(event.target.value)} placeholder="Search history" className="navbar-glass h-10 w-full rounded-xl sm:w-[280px]" />
              <Button type="button" variant="outline" onClick={() => void refreshQrHistory()} className="h-10 rounded-xl">
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {(() => {
              const term = qrHistorySearch.trim().toLowerCase();
              const filtered = term
                ? qrHistory.filter((entry) => [entry.title, entry.fileName, entry.notes].filter(Boolean).some((value) => String(value).toLowerCase().includes(term)))
                : qrHistory;
              const start = (qrHistoryPage - 1) * 5;
              const pageItems = filtered.slice(start, start + 5);
              const pageCount = Math.max(1, Math.ceil(filtered.length / 5));

              return (
                <>
                  {pageItems.length ? pageItems.map((entry) => {
                    const link = buildAbsoluteAppUrl(entry.publicOpenUrl || `/transfer/${entry.shareId}`, typeof window !== 'undefined' ? window.location.origin : undefined);
                    const isEditing = editingQrId === entry.id;
                    return (
                      <div key={entry.id} className="rounded-[1.25rem] border border-white/55 bg-white/55 p-4 shadow-[0_14px_40px_rgba(15,23,42,0.06)] backdrop-blur">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0 flex-1">
                            {isEditing ? (
                              <div className="space-y-2">
                                <Input value={qrEditDraft.title} onChange={(event) => setQrEditDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Share title" className="navbar-glass h-10 rounded-xl" />
                                <Input value={qrEditDraft.password} onChange={(event) => setQrEditDraft((current) => ({ ...current, password: event.target.value.toUpperCase() }))} placeholder="Access password" className="navbar-glass h-10 rounded-xl" />
                                <textarea value={qrEditDraft.notes} onChange={(event) => setQrEditDraft((current) => ({ ...current, notes: event.target.value }))} className="navbar-glass min-h-[84px] w-full rounded-xl px-3 py-2 text-sm text-slate-900" placeholder="Optional note" />
                              </div>
                            ) : (
                              <>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate text-sm font-semibold text-slate-950">{entry.title || entry.fileName}</p>
                                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${entry.revokedAt ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                    {entry.revokedAt ? 'Revoked' : 'Active'}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-slate-500">{entry.fileName} · {formatBytes(entry.sizeInBytes)}</p>
                                {entry.notes ? <p className="mt-2 text-sm text-slate-600">{entry.notes}</p> : null}
                                <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
                                  <span>{entry.openCount} opens</span>
                                  <span>{entry.downloadCount} downloads</span>
                                  <span>{entry.lastOpenedAt ? `Last open ${new Date(entry.lastOpenedAt).toLocaleString()}` : 'No opens yet'}</span>
                                </div>
                              </>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => window.open(link, '_blank', 'noopener,noreferrer')} className="rounded-xl">Open</Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => void copyValue(link, 'QR share link')} className="rounded-xl">
                              <Copy className="mr-2 h-4 w-4" />
                              Copy link
                            </Button>
                            {entry.accessPassword ? (
                              <Button type="button" variant="outline" size="sm" onClick={() => void copyValue(entry.accessPassword || '', 'Access password')} className="rounded-xl">
                                <KeyRound className="mr-2 h-4 w-4" />
                                Password
                              </Button>
                            ) : null}
                            {!entry.revokedAt ? (
                              <Button type="button" variant="outline" size="sm" onClick={() => void revokeQrHistoryItem(entry.id)} className="rounded-xl">
                                <ShieldCheck className="mr-2 h-4 w-4" />
                                Revoke
                              </Button>
                            ) : null}
                            {isEditing ? (
                              <>
                                <Button type="button" variant="outline" size="sm" onClick={() => void saveQrEdit()} className="rounded-xl">Save</Button>
                                <Button type="button" variant="ghost" size="sm" onClick={() => setEditingQrId('')} className="rounded-xl text-slate-600 hover:text-slate-950">Cancel</Button>
                              </>
                            ) : (
                              <Button type="button" variant="outline" size="sm" onClick={() => beginQrEdit(entry)} className="rounded-xl">Edit</Button>
                            )}
                            <Button type="button" variant="outline" size="sm" onClick={() => { setQrTransfer(entry); setQrImageFailed(false); setQrTab('create'); }} className="rounded-xl">Use</Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => void deleteQrHistoryItem(entry.id)} className="rounded-xl">
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="rounded-[1.2rem] border border-dashed border-white/60 bg-white/45 p-6 text-sm text-slate-600">
                      QR history will appear here after you create the first QR share.
                    </div>
                  )}

                  {filtered.length > 5 ? (
                    <div className="flex items-center justify-end gap-2 pt-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setQrHistoryPage((page) => Math.max(1, page - 1))} disabled={qrHistoryPage === 1}>Previous</Button>
                      <span className="text-sm text-slate-500">Page {qrHistoryPage} of {pageCount}</span>
                      <Button type="button" variant="outline" size="sm" onClick={() => setQrHistoryPage((page) => Math.min(pageCount, page + 1))} disabled={qrHistoryPage === pageCount}>Next</Button>
                    </div>
                  ) : null}
                </>
              );
            })()}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
