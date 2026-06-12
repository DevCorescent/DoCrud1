'use client';

import { ChangeEvent, PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Download, Loader2, PencilLine, QrCode, RefreshCw, Save, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { buildAbsoluteAppUrl } from '@/lib/url';
import type { CertificateRecord } from '@/types/document';

type WorkspacePayload = {
  records: CertificateRecord[];
  totals: {
    records: number;
    opens: number;
    downloads: number;
    verifies: number;
  };
  suggestedCertificate: Partial<CertificateRecord>;
};

const emptyForm = {
  name: '',
  recipientName: '',
  recipientEmail: '',
  certificateTitle: '',
  subtitle: '',
  description: '',
  issuerName: '',
  signatoryName: '',
  signatoryRole: '',
  issueDate: '',
  expiryDate: '',
  credentialId: '',
  logoUrl: '',
  logoUrls: [] as string[],
  signatureUrl: '',
  signatureImageUrls: [] as string[],
  signatureDrawnDataUrl: '',
  backgroundImageUrl: '',
  accentColor: '#f97316',
  textColor: '#111827',
  layout: 'modern',
  includeDocrudWatermark: true,
  status: 'published',
};

const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error(`Unable to read ${file.name}.`));
  reader.readAsDataURL(file);
});

export default function CertificatesCenter() {
  const [data, setData] = useState<WorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const signatureDrawingRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/certificates', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to load certificate workspace.');
      }
      const typed = payload as WorkspacePayload;
      setData(typed);
      if (!editingId && !form.certificateTitle) {
        setForm((current) => ({
          ...current,
          name: typed.suggestedCertificate.name || '',
          certificateTitle: typed.suggestedCertificate.certificateTitle || '',
          subtitle: typed.suggestedCertificate.subtitle || '',
          issuerName: typed.suggestedCertificate.issuerName || '',
          signatoryName: typed.suggestedCertificate.signatoryName || '',
          signatoryRole: typed.suggestedCertificate.signatoryRole || '',
          includeDocrudWatermark: true,
        }));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load certificate workspace.');
    } finally {
      setLoading(false);
    }
  }, [editingId, form.certificateTitle]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const canvas = signatureCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!form.signatureDrawnDataUrl) return;
    const image = new Image();
    image.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = form.signatureDrawnDataUrl;
  }, [form.signatureDrawnDataUrl]);

  const preview = useMemo(() => ({
    ...form,
    issueDate: form.issueDate || new Date().toISOString().slice(0, 10),
    credentialId: form.credentialId || `DOC-${Date.now().toString().slice(-8)}`,
  }), [form]);

  const saveRecord = async () => {
    try {
      setSaving(true);
      setMessage('');
      const payload = {
        name: form.name.trim(),
        recipientName: form.recipientName.trim(),
        recipientEmail: form.recipientEmail.trim(),
        certificateTitle: form.certificateTitle.trim(),
        subtitle: form.subtitle.trim(),
        description: form.description.trim(),
        issuerName: form.issuerName.trim(),
        signatoryName: form.signatoryName.trim(),
        signatoryRole: form.signatoryRole.trim(),
        issueDate: form.issueDate || new Date().toISOString().slice(0, 10),
        expiryDate: form.expiryDate || undefined,
        credentialId: form.credentialId.trim(),
        logoUrl: form.logoUrl.trim(),
        logoUrls: [...form.logoUrls, form.logoUrl.trim()].filter(Boolean),
        signatureUrl: form.signatureUrl.trim(),
        signatureImageUrls: [...form.signatureImageUrls, form.signatureUrl.trim()].filter(Boolean),
        signatureDrawnDataUrl: form.signatureDrawnDataUrl || undefined,
        backgroundImageUrl: form.backgroundImageUrl.trim(),
        accentColor: form.accentColor,
        textColor: form.textColor,
        layout: form.layout,
        includeDocrudWatermark: form.includeDocrudWatermark,
        status: form.status,
      };
      const response = await fetch('/api/certificates', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(editingId ? { certificateId: editingId, updates: payload } : payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || 'Unable to save certificate.');
      }
      setMessage(editingId ? 'Certificate updated.' : 'Certificate created.');
      setEditingId(null);
      setForm(emptyForm);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save certificate.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (record: CertificateRecord) => {
    setEditingId(record.id);
    setForm({
      name: record.name,
      recipientName: record.recipientName,
      recipientEmail: record.recipientEmail || '',
      certificateTitle: record.certificateTitle,
      subtitle: record.subtitle || '',
      description: record.description || '',
      issuerName: record.issuerName,
      signatoryName: record.signatoryName || '',
      signatoryRole: record.signatoryRole || '',
      issueDate: record.issueDate,
      expiryDate: record.expiryDate || '',
      credentialId: record.credentialId,
      logoUrl: record.logoUrl || '',
      logoUrls: record.logoUrls || [],
      signatureUrl: record.signatureUrl || '',
      signatureImageUrls: record.signatureImageUrls || [],
      signatureDrawnDataUrl: record.signatureDrawnDataUrl || '',
      backgroundImageUrl: record.backgroundImageUrl || '',
      accentColor: record.accentColor || '#f97316',
      textColor: record.textColor || '#111827',
      layout: record.layout || 'modern',
      includeDocrudWatermark: record.includeDocrudWatermark !== false,
      status: record.status,
    });
  };

  const handleAssetUpload = async (
    event: ChangeEvent<HTMLInputElement>,
    kind: 'logo' | 'signature' | 'background',
  ) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    try {
      const dataUrls = await Promise.all(files.map((file) => readFileAsDataUrl(file)));
      setForm((current) => {
        if (kind === 'logo') {
          return {
            ...current,
            logoUrl: current.logoUrl || dataUrls[0] || '',
            logoUrls: [...current.logoUrls, ...dataUrls],
          };
        }
        if (kind === 'signature') {
          return {
            ...current,
            signatureUrl: current.signatureUrl || dataUrls[0] || '',
            signatureImageUrls: [...current.signatureImageUrls, ...dataUrls],
          };
        }
        return { ...current, backgroundImageUrl: dataUrls[0] || current.backgroundImageUrl };
      });
      setMessage(`${kind === 'background' ? 'Background' : kind === 'logo' ? 'Logo' : 'Signature'} uploaded.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to upload image.');
    } finally {
      event.target.value = '';
    }
  };

  const startSignatureDrawing = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    signatureDrawingRef.current = true;
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.25;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(event.clientX - rect.left, event.clientY - rect.top);
  };

  const continueSignatureDrawing = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas || !signatureDrawingRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineTo(event.clientX - rect.left, event.clientY - rect.top);
    ctx.stroke();
    setForm((current) => ({ ...current, signatureDrawnDataUrl: canvas.toDataURL('image/png') }));
  };

  const stopSignatureDrawing = () => {
    signatureDrawingRef.current = false;
  };

  const clearSignatureDrawing = () => {
    const canvas = signatureCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setForm((current) => ({ ...current, signatureDrawnDataUrl: '' }));
  };

  const previewLogos = useMemo(() => [...form.logoUrls, form.logoUrl].filter(Boolean), [form.logoUrl, form.logoUrls]);
  const previewSignature = form.signatureDrawnDataUrl || form.signatureImageUrls[0] || form.signatureUrl;

  const handleDelete = async (id: string) => {
    try {
      setDeletingId(id);
      const response = await fetch(`/api/certificates?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || 'Unable to delete certificate.');
      }
      setMessage('Certificate removed.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to delete certificate.');
    } finally {
      setDeletingId('');
    }
  };

  if (loading) {
    return <div className="rounded-[1.6rem] border border-slate-200 bg-white p-10 text-center shadow-sm"><Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-500" /></div>;
  }

  return (
    <div className="space-y-5">
      {message ? <div className="rounded-[1.1rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">{message}</div> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Certificates', value: data?.totals.records || 0 },
          { label: 'Opens', value: data?.totals.opens || 0 },
          { label: 'Downloads', value: data?.totals.downloads || 0 },
          { label: 'Verifies', value: data?.totals.verifies || 0 },
        ].map((item) => (
          <div key={item.label} className="rounded-[1.35rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{item.value}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="builder" className="w-full space-y-4">
        <TabsList className="grid w-full grid-cols-3 rounded-2xl bg-slate-100 p-1">
          <TabsTrigger value="builder" className="rounded-xl text-xs sm:text-sm">Builder</TabsTrigger>
          <TabsTrigger value="history" className="rounded-xl text-xs sm:text-sm">History</TabsTrigger>
          <TabsTrigger value="insights" className="rounded-xl text-xs sm:text-sm">Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="builder" className="space-y-4">
          <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
            <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="grid gap-3">
                <Input placeholder="Internal record name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input placeholder="Recipient name" value={form.recipientName} onChange={(event) => setForm((current) => ({ ...current, recipientName: event.target.value }))} />
                  <Input placeholder="Recipient email" value={form.recipientEmail} onChange={(event) => setForm((current) => ({ ...current, recipientEmail: event.target.value }))} />
                </div>
                <Input placeholder="Certificate title" value={form.certificateTitle} onChange={(event) => setForm((current) => ({ ...current, certificateTitle: event.target.value }))} />
                <Input placeholder="Subtitle" value={form.subtitle} onChange={(event) => setForm((current) => ({ ...current, subtitle: event.target.value }))} />
                <textarea className="min-h-[110px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900" placeholder="Description" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input placeholder="Issuer" value={form.issuerName} onChange={(event) => setForm((current) => ({ ...current, issuerName: event.target.value }))} />
                  <Input placeholder="Credential ID" value={form.credentialId} onChange={(event) => setForm((current) => ({ ...current, credentialId: event.target.value }))} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input placeholder="Signatory name" value={form.signatoryName} onChange={(event) => setForm((current) => ({ ...current, signatoryName: event.target.value }))} />
                  <Input placeholder="Signatory role" value={form.signatoryRole} onChange={(event) => setForm((current) => ({ ...current, signatoryRole: event.target.value }))} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input type="date" placeholder="Issue date" value={form.issueDate} onChange={(event) => setForm((current) => ({ ...current, issueDate: event.target.value }))} />
                  <Input type="date" placeholder="Expiry date" value={form.expiryDate} onChange={(event) => setForm((current) => ({ ...current, expiryDate: event.target.value }))} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input placeholder="Logo URL" value={form.logoUrl} onChange={(event) => setForm((current) => ({ ...current, logoUrl: event.target.value }))} />
                  <Input placeholder="Signature URL" value={form.signatureUrl} onChange={(event) => setForm((current) => ({ ...current, signatureUrl: event.target.value }))} />
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <Upload className="mr-2 h-4 w-4" />
                    Upload logos
                    <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => void handleAssetUpload(event, 'logo')} />
                  </label>
                  <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <Upload className="mr-2 h-4 w-4" />
                    Upload signature
                    <input type="file" accept="image/*" className="hidden" onChange={(event) => void handleAssetUpload(event, 'signature')} />
                  </label>
                  <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <Upload className="mr-2 h-4 w-4" />
                    Upload background
                    <input type="file" accept="image/*" className="hidden" onChange={(event) => void handleAssetUpload(event, 'background')} />
                  </label>
                </div>
                {previewLogos.length ? (
                  <div className="flex flex-wrap gap-2">
                    {previewLogos.map((logo, index) => (
                      <img key={`${logo}-${index}`} src={logo} alt={`Logo ${index + 1}`} className="h-12 w-12 rounded-xl border border-slate-200 bg-white object-cover p-1" />
                    ))}
                  </div>
                ) : null}
                <Input placeholder="Background image URL" value={form.backgroundImageUrl} onChange={(event) => setForm((current) => ({ ...current, backgroundImageUrl: event.target.value }))} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input type="color" value={form.accentColor} onChange={(event) => setForm((current) => ({ ...current, accentColor: event.target.value }))} />
                  <Input type="color" value={form.textColor} onChange={(event) => setForm((current) => ({ ...current, textColor: event.target.value }))} />
                </div>
                <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-900">Draw signature</p>
                    <Button type="button" variant="outline" className="rounded-xl" onClick={clearSignatureDrawing}>
                      <PencilLine className="mr-2 h-4 w-4" />
                      Clear
                    </Button>
                  </div>
                  <canvas
                    ref={signatureCanvasRef}
                    width={540}
                    height={150}
                    className="mt-3 h-[150px] w-full rounded-2xl border border-slate-200 bg-white"
                    onPointerDown={startSignatureDrawing}
                    onPointerMove={continueSignatureDrawing}
                    onPointerUp={stopSignatureDrawing}
                    onPointerLeave={stopSignatureDrawing}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" value={form.layout} onChange={(event) => setForm((current) => ({ ...current, layout: event.target.value }))}>
                    <option value="classic">Classic</option>
                    <option value="modern">Modern</option>
                    <option value="spotlight">Spotlight</option>
                  </select>
                  <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                  </select>
                </div>
                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.includeDocrudWatermark}
                    onChange={(event) => setForm((current) => ({ ...current, includeDocrudWatermark: event.target.checked }))}
                  />
                  Keep docrud watermark at the bottom of downloaded certificates
                </label>
                <div className="flex flex-wrap gap-3">
                  <Button type="button" className="rounded-xl bg-slate-950 text-white hover:bg-slate-800" onClick={() => void saveRecord()} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {editingId ? 'Update certificate' : 'Create certificate'}
                  </Button>
                  {editingId ? (
                    <Button type="button" variant="outline" className="rounded-xl" onClick={() => { setEditingId(null); setForm(emptyForm); }}>
                      Reset
                    </Button>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="rounded-[1.6rem] border border-slate-200 bg-slate-950 p-5 shadow-sm">
              <div
                className="rounded-[1.5rem] border border-white/10 p-8 text-center"
                style={{
                  color: preview.textColor,
                  background: preview.backgroundImageUrl
                    ? `linear-gradient(rgba(255,255,255,0.9),rgba(255,255,255,0.95)), url(${preview.backgroundImageUrl}) center/cover no-repeat`
                    : 'linear-gradient(180deg,#fffdf7,#ffffff)',
                }}
              >
                {previewLogos.length ? (
                  <div className="mb-4 flex flex-wrap items-center justify-center gap-3">
                    {previewLogos.map((logo, index) => (
                      <img key={`${logo}-${index}`} src={logo} alt={`Preview logo ${index + 1}`} className="h-14 w-14 rounded-2xl bg-white object-cover p-1 shadow-sm" />
                    ))}
                  </div>
                ) : null}
                <p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: preview.accentColor }}>Preview</p>
                <h3 className="mt-4 text-3xl font-semibold tracking-[-0.03em]">{preview.certificateTitle || 'Certificate title'}</h3>
                {preview.subtitle ? <p className="mt-3 text-base opacity-75">{preview.subtitle}</p> : null}
                <p className="mt-8 text-[10px] uppercase tracking-[0.24em] opacity-50">Presented to</p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.03em]">{preview.recipientName || 'Recipient Name'}</p>
                {preview.description ? <p className="mt-6 text-sm leading-7 opacity-75">{preview.description}</p> : null}
                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border px-3 py-3 text-sm" style={{ borderColor: `${preview.accentColor}33` }}>{preview.issueDate}</div>
                  <div className="rounded-xl border px-3 py-3 text-sm" style={{ borderColor: `${preview.accentColor}33` }}>{preview.credentialId}</div>
                  <div className="rounded-xl border px-3 py-3 text-sm" style={{ borderColor: `${preview.accentColor}33` }}>{preview.issuerName || 'Issuer'}</div>
                </div>
                <div className="mt-10 flex items-end justify-between gap-4">
                  <div className="min-w-0 text-left">
                    {previewSignature ? <img src={previewSignature} alt="Preview signature" className="h-16 w-auto object-contain" /> : null}
                    <p className="mt-3 text-base font-semibold">{preview.signatoryName || preview.issuerName || 'Authorized signatory'}</p>
                    <p className="text-sm opacity-70">{preview.signatoryRole || 'Authorized Signatory'}</p>
                  </div>
                </div>
                {preview.includeDocrudWatermark ? (
                  <div className="mt-8 border-t border-slate-200/70 pt-4 text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    Powered by docrud
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          {data?.records.length ? data.records.map((record) => {
            const shareUrl = buildAbsoluteAppUrl(`/certificate/${record.slug}`, typeof window !== 'undefined' ? window.location.origin : undefined);
            return (
              <div key={record.id} className="grid gap-4 rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm xl:grid-cols-[1fr_auto]">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-slate-950">{record.certificateTitle}</h3>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-600">{record.status}</span>
                  </div>
                  <p className="text-sm text-slate-600">{record.recipientName} · {record.credentialId}</p>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">Opens: {record.analytics.openCount}</div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">Downloads: {record.analytics.downloadCount}</div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">Verify: {record.analytics.verifyCount}</div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">Visitors: {record.analytics.uniqueVisitors}</div>
                  </div>
                  <p className="break-all text-xs text-slate-500">{shareUrl}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" className="rounded-xl" onClick={() => handleEdit(record)}>Edit</Button>
                    <Button type="button" variant="outline" className="rounded-xl" onClick={() => navigator.clipboard.writeText(shareUrl)}><Copy className="mr-2 h-4 w-4" />Copy link</Button>
                    <a href={shareUrl} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Open page</a>
                    <Button type="button" variant="outline" className="rounded-xl text-rose-600" onClick={() => void handleDelete(record.id)} disabled={deletingId === record.id}>
                      {deletingId === record.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                      Delete
                    </Button>
                  </div>
                </div>
                <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                    <QrCode className="h-3.5 w-3.5" />
                    QR access
                  </div>
                  <img src={record.qrUrl} alt={`${record.certificateTitle} QR`} className="mt-3 h-36 w-36 rounded-xl bg-white p-2 object-contain" />
                  <a href={record.qrUrl} download={`${record.slug}-qr.png`} className="mt-3 inline-flex items-center text-xs font-medium text-slate-700 hover:text-slate-950">
                    <Download className="mr-2 h-3.5 w-3.5" />
                    Download QR
                  </a>
                </div>
              </div>
            );
          }) : <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">Your first certificate will appear here.</div>}
        </TabsContent>

        <TabsContent value="insights" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">AI-style insight</p>
              <p className="mt-3 text-lg font-semibold text-slate-950">Published certificates with QR access create stronger trust and make verification easier from mobile.</p>
              <p className="mt-3 text-sm leading-7 text-slate-600">Fill issuer, recipient, credential ID, and signatory cleanly. Those are the details people look for first before they trust a certificate page.</p>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Best next move</p>
              <p className="mt-3 text-lg font-semibold text-slate-950">Use certificates together with Virtual ID so every QR leads to a richer verified identity loop.</p>
              <Button type="button" variant="outline" className="mt-4 rounded-xl" onClick={() => void load()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh stats
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
