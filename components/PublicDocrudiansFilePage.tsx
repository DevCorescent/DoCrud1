'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Download, ExternalLink, FileText, Link2, Loader2, Share2 } from 'lucide-react';
import type { DocrudianAttachment, DocrudianCircle, DocrudianPost, LandingSettings } from '@/types/document';
import PublicSiteChrome from '@/components/PublicSiteChrome';
import { Button } from '@/components/ui/button';

type FilePayload = {
  room: DocrudianCircle;
  attachment: DocrudianAttachment;
  post?: DocrudianPost;
};

export default function PublicDocrudiansFilePage({
  softwareName,
  accentLabel,
  settings,
  roomId,
  fileId,
}: {
  softwareName: string;
  accentLabel: string;
  settings: LandingSettings;
  roomId: string;
  fileId: string;
}) {
  const [payload, setPayload] = useState<FilePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/public/docrudians/${roomId}/file/${fileId}`, { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || 'Unable to load shared file.');
        setPayload(data);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Unable to load shared file.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [fileId, roomId]);

  const handleDownload = () => {
    if (!payload) return;
    const link = document.createElement('a');
    link.href = payload.attachment.url;
    link.download = payload.attachment.name || 'shared-file';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleShare = async () => {
    if (!payload) return;
    const shareValue = typeof window !== 'undefined' ? window.location.href : payload.attachment.shareUrl || '';
    if (navigator.share) {
      try {
        await navigator.share({ title: payload.attachment.name, url: shareValue });
      } catch {}
    } else {
      await navigator.clipboard.writeText(shareValue);
      setMessage('Share link copied.');
    }
  };

  return (
    <PublicSiteChrome softwareName={softwareName} accentLabel={accentLabel} settings={settings}>
      <section className="rounded-[2rem] border border-white/80 bg-white/88 p-5 sm:p-8">
        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : payload ? (
          <div className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
            <div className="space-y-5">
              <div className="rounded-[1.8rem] border border-slate-200 bg-white p-6">
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Shared file</p>
                <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-slate-950">{payload.attachment.name}</h1>
                <p className="mt-2 text-sm text-slate-500">
                  From <Link href={payload.room.shareLink || `/docrudians/room/${payload.room.id}`} className="font-medium text-slate-700 underline-offset-4 hover:underline">{payload.room.title}</Link>
                </p>
                {payload.post ? <p className="mt-3 text-sm leading-6 text-slate-600">{payload.post.title}</p> : null}
              </div>

              <div className="rounded-[1.8rem] border border-slate-200 bg-slate-50 p-4">
                {payload.attachment.type === 'image' ? (
                  <div className="relative h-[38rem] w-full overflow-hidden rounded-[1rem] bg-white">
                    <Image src={payload.attachment.url} alt={payload.attachment.name} fill unoptimized className="object-contain" />
                  </div>
                ) : payload.attachment.type === 'link' ? (
                  <div className="rounded-[1rem] bg-white p-6">
                    <div className="flex items-center gap-3 text-slate-900">
                      <Link2 className="h-5 w-5 text-violet-600" />
                      <span className="font-medium">This shared item is a link</span>
                    </div>
                    <a href={payload.attachment.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm text-slate-700 underline-offset-4 hover:underline">
                      Open destination
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                ) : (
                  <iframe src={payload.attachment.url} title={payload.attachment.name} className="h-[38rem] w-full rounded-[1rem] border border-slate-200 bg-white" />
                )}
              </div>
            </div>

            <aside className="space-y-5">
              <div className="rounded-[1.8rem] border border-slate-200 bg-white p-6">
                <h2 className="text-lg font-semibold text-slate-950">Actions</h2>
                <div className="mt-4 grid gap-3">
                  <Button type="button" className="rounded-xl bg-slate-950 text-white hover:bg-slate-800" onClick={handleDownload}>
                    <Download className="mr-2 h-4 w-4" />
                    Download file
                  </Button>
                  <Button type="button" variant="outline" className="rounded-xl" onClick={handleShare}>
                    <Share2 className="mr-2 h-4 w-4" />
                    Share file
                  </Button>
                  <Button asChild variant="outline" className="rounded-xl">
                    <a href={payload.attachment.url} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open raw file
                    </a>
                  </Button>
                </div>
              </div>

              <div className="rounded-[1.8rem] border border-slate-200 bg-white p-6">
                <h2 className="text-lg font-semibold text-slate-950">Share URL and QR</h2>
                <div className="mt-4 space-y-4">
                  <div className="rounded-[1rem] bg-slate-50 p-4 text-sm break-all text-slate-700">{payload.attachment.shareUrl}</div>
                  {payload.attachment.qrUrl ? (
                    <div className="rounded-[1rem] bg-slate-50 p-4">
                      <div className="relative mx-auto h-48 w-48 overflow-hidden rounded-xl bg-white p-2">
                        <Image src={payload.attachment.qrUrl} alt={`${payload.attachment.name} QR`} fill unoptimized className="object-contain p-2" />
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-[1.8rem] border border-slate-200 bg-white p-6">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-emerald-600" />
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{payload.attachment.name}</p>
                    <p className="text-xs text-slate-500">{payload.attachment.sizeLabel || payload.attachment.mimeType || 'Shared from room'}</p>
                  </div>
                </div>
              </div>

              {message ? <p className="text-sm text-slate-600">{message}</p> : null}
            </aside>
          </div>
        ) : (
          <div className="rounded-[1.8rem] border border-dashed border-slate-200 bg-white p-10 text-center text-slate-500">
            Shared file not found.
          </div>
        )}
      </section>
    </PublicSiteChrome>
  );
}
