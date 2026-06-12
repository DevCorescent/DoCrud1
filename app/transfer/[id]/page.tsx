'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Copy, Download, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface SharedFileTransferPayload {
  id: string;
  shareId: string;
  fileName: string;
  mimeType: string;
  notes?: string;
  authMode: 'public' | 'password' | 'email' | 'password_and_email' | 'triple_password';
  directoryVisibility?: 'public' | 'private';
  directoryCategory?: string;
  requiresPassword?: boolean;
  requiresSecurePassword?: boolean;
  requiresParserPassword?: boolean;
  requiresEmail?: boolean;
  requiresFilePassword?: boolean;
  passwordValidated?: boolean;
  previewable?: boolean;
  previewUrl?: string;
  encryptionEnabled?: boolean;
  openCount: number;
  downloadCount: number;
  expiresAt?: string;
  recipientEmailHint?: string;
  error?: string;
}

export default function SharedFileTransferPage() {
  const params = useParams<{ id: string }>();
  const routeId = Array.isArray(params?.id) ? params.id[0] : params?.id || '';
  const [payload, setPayload] = useState<SharedFileTransferPayload | null>(null);
  const [password, setPassword] = useState('');
  const [securePassword, setSecurePassword] = useState('');
  const [parserPassword, setParserPassword] = useState('');
  const [filePassword, setFilePassword] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState('');

  const loadTransfer = useCallback(async (query?: { password?: string; filePassword?: string; securePassword?: string; parserPassword?: string; email?: string }) => {
    if (!routeId) return;
    setLoading(true);
    try {
      setError('');
      const search = new URLSearchParams();
      if (query?.password) search.set('password', query.password);
      if (query?.filePassword) search.set('filePassword', query.filePassword);
      if (query?.securePassword) search.set('securePassword', query.securePassword);
      if (query?.parserPassword) search.set('parserPassword', query.parserPassword);
      if (query?.email) search.set('email', query.email);
      const response = await fetch(`/api/public/file-transfers/${routeId}${search.toString() ? `?${search.toString()}` : ''}`);
      const nextPayload = await response.json().catch(() => null);
      if (!response.ok) {
        setPayload(null);
        throw new Error(nextPayload?.error || 'Unable to load transfer.');
      }
      setPayload(nextPayload);
      setError(nextPayload?.passwordValidated ? '' : nextPayload?.error || '');
    } catch (loadError) {
      setPayload(null);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load transfer.');
    } finally {
      setLoading(false);
    }
  }, [routeId]);

  useEffect(() => {
    void loadTransfer();
  }, [loadTransfer]);

  const unlock = async () => {
    setUnlocking(true);
    await loadTransfer({
      password: password.trim().toUpperCase(),
      filePassword: filePassword.trim().toUpperCase(),
      securePassword: securePassword.trim().toUpperCase(),
      parserPassword: parserPassword.trim().toUpperCase(),
      email: email.trim().toLowerCase(),
    });
    setUnlocking(false);
  };

  const downloadFile = async () => {
    const search = new URLSearchParams();
    if (password) search.set('password', password.trim().toUpperCase());
    if (filePassword) search.set('filePassword', filePassword.trim().toUpperCase());
    if (securePassword) search.set('securePassword', securePassword.trim().toUpperCase());
    if (parserPassword) search.set('parserPassword', parserPassword.trim().toUpperCase());
    if (email) search.set('email', email.trim().toLowerCase());
    const response = await fetch(`/api/public/file-transfers/${routeId}/download?${search.toString()}`);
    if (!response.ok) {
      const nextPayload = await response.json().catch(() => null);
      setError(nextPayload?.error || 'Unable to download file.');
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = payload?.fileName || 'shared-file';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
  };

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Card className="border-white/60 bg-white/85 backdrop-blur">
          <CardHeader>
            <CardTitle>Secure File Transfer</CardTitle>
            <p className="text-sm text-slate-500">Preview and download files shared through docrud with controlled access and full transfer tracking.</p>
          </CardHeader>
          <CardContent className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-4">
              <div className="rounded-[1.3rem] border border-slate-200 bg-slate-50 p-5">
                <p className="text-base font-semibold text-slate-950">{payload?.fileName || (loading ? 'Loading file...' : 'Transfer unavailable')}</p>
                <p className="mt-1 text-sm text-slate-500">{payload?.mimeType || (loading ? 'Secure transfer' : 'This shared link is not available right now')}</p>
                {payload?.notes ? <p className="mt-3 text-sm leading-6 text-slate-600">{payload.notes}</p> : null}
                {payload?.expiresAt ? <p className="mt-3 text-xs text-slate-500">Expires on {new Date(payload.expiresAt).toLocaleString()}</p> : null}
                {payload?.encryptionEnabled ? (
                  <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-800">
                    This file is encrypted before delivery. The sender must share the transfer password, secure password, and parser password before preview or download becomes available.
                  </div>
                ) : null}
              </div>

              {!loading && !payload ? (
                <div className="rounded-[1.3rem] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
                  This transfer could not be loaded. Create a fresh demo link and try again.
                </div>
              ) : !payload?.passwordValidated ? (
                <div className="rounded-[1.3rem] border border-slate-200 bg-white p-5">
                  <p className="text-sm font-semibold text-slate-950">Unlock shared file</p>
                  <div className="mt-4 space-y-3">
                    {payload?.requiresPassword ? (
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Transfer password</label>
                        <Input value={password} onChange={(event) => setPassword(event.target.value.toUpperCase())} placeholder="Enter password" />
                      </div>
                    ) : null}
                    {payload?.requiresSecurePassword ? (
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Secure password</label>
                        <Input value={securePassword} onChange={(event) => setSecurePassword(event.target.value.toUpperCase())} placeholder="Enter secure password" />
                      </div>
                    ) : null}
                    {payload?.requiresFilePassword ? (
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">File password</label>
                        <Input value={filePassword} onChange={(event) => setFilePassword(event.target.value.toUpperCase())} placeholder="Enter file password" />
                      </div>
                    ) : null}
                    {payload?.requiresParserPassword ? (
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Parser password</label>
                        <Input value={parserPassword} onChange={(event) => setParserPassword(event.target.value.toUpperCase())} placeholder="Enter parser password" />
                      </div>
                    ) : null}
                    {payload?.requiresEmail ? (
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Recipient email</label>
                        <Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder={payload.recipientEmailHint || 'Enter recipient email'} />
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button onClick={() => void unlock()} disabled={unlocking} className="rounded-xl bg-slate-950 text-white hover:bg-slate-800">
                      {unlocking ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Unlocking...</> : 'Unlock File'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-[1.3rem] border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    {payload?.encryptionEnabled ? 'Encrypted file decrypted and unlocked successfully.' : 'Transfer unlocked successfully.'}
                  </div>
                </div>
              )}

              {error ? <p className="text-sm text-rose-600">{error}</p> : null}

              <div className="flex flex-wrap gap-3">
                <Button type="button" variant="outline" onClick={() => void copyLink()}><Copy className="mr-2 h-4 w-4" />Copy Link</Button>
                {payload?.passwordValidated ? (
                  <Button type="button" onClick={() => void downloadFile()} className="bg-slate-950 text-white hover:bg-slate-800">
                    <Download className="mr-2 h-4 w-4" />
                    Download File
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
              {loading ? (
                <div className="flex min-h-[420px] items-center justify-center text-sm text-slate-600">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading preview...
                </div>
              ) : payload?.passwordValidated && payload.previewable && payload.previewUrl ? (
                payload.mimeType.startsWith('image/') ? (
                  <img src={payload.previewUrl} alt={payload.fileName} className="max-h-[640px] w-full rounded-2xl object-contain" />
                ) : payload.mimeType === 'application/pdf' ? (
                  <iframe title={payload.fileName} src={payload.previewUrl} className="min-h-[640px] w-full rounded-2xl border" />
                ) : (
                  <iframe title={payload.fileName} src={payload.previewUrl} className="min-h-[640px] w-full rounded-2xl border bg-white" />
                )
              ) : (
                <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-center">
                  {payload?.requiresPassword ? <Lock className="h-6 w-6 text-slate-400" /> : <Mail className="h-6 w-6 text-slate-400" />}
                  <p className="mt-3 text-sm font-medium text-slate-900">Unlock to preview this file</p>
                  <p className="mt-1 max-w-sm text-sm text-slate-500">
                    {payload?.encryptionEnabled
                      ? 'The sender has applied triple-password encryption, so the file is only reconstructed after all required secrets are verified.'
                      : 'The sender has protected this transfer before showing the file preview or allowing downloads.'}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
