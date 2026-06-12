'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { CertificateRecord } from '@/types/document';

type PublicCertificatePageProps = {
  certificate: CertificateRecord;
};

export default function PublicCertificatePage({ certificate }: PublicCertificatePageProps) {
  const [verifyMessage, setVerifyMessage] = useState('');

  useEffect(() => {
    void fetch(`/api/public/certificates/${certificate.slug}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'open', source: 'direct' }),
    });
  }, [certificate.slug]);

  const logos = useMemo(
    () => (certificate.logoUrls?.length ? certificate.logoUrls : certificate.logoUrl ? [certificate.logoUrl] : []),
    [certificate.logoUrl, certificate.logoUrls],
  );
  const signatureAsset = certificate.signatureDrawnDataUrl || certificate.signatureImageUrls?.[0] || certificate.signatureUrl;

  const handleDownload = () => {
    void fetch(`/api/public/certificates/${certificate.slug}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'download', source: 'download' }),
    });
    window.print();
  };

  const handleVerify = async () => {
    const response = await fetch(`/api/public/certificates/${certificate.slug}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'verify', source: 'direct' }),
    });
    if (response.ok) {
      setVerifyMessage('Certificate verified and logged successfully.');
      return;
    }
    setVerifyMessage('Unable to verify this certificate right now.');
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.1),transparent_22%),radial-gradient(circle_at_bottom_right,rgba(99,102,241,0.08),transparent_24%),linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)] px-4 py-8 text-slate-950 sm:px-6 lg:px-10">
      <style jsx global>{`
        @media print {
          html {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body {
            background: #ffffff !important;
          }
          .certificate-shell {
            padding: 0 !important;
            background: #ffffff !important;
          }
          .certificate-print-card {
            max-width: 100% !important;
            box-shadow: none !important;
            border: 0 !important;
            padding: 0 !important;
          }
          .certificate-actions {
            display: none !important;
          }
          .certificate-stage {
            border: 1px solid #e2e8f0 !important;
            border-radius: 18px !important;
            break-inside: avoid;
          }
        }
      `}</style>
      <div className="certificate-shell mx-auto max-w-5xl">
        <section className="certificate-print-card rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.06)] sm:p-6">
          <div
            className="certificate-stage overflow-hidden rounded-[1.8rem] border border-slate-200 p-8 text-center sm:p-12"
            style={{
              color: certificate.textColor || '#111827',
              background: certificate.backgroundImageUrl
                ? `linear-gradient(rgba(255,255,255,0.90),rgba(255,255,255,0.94)), url(${certificate.backgroundImageUrl}) center/cover no-repeat`
                : 'linear-gradient(180deg,#fffdf7,#ffffff)',
            }}
          >
            {logos.length ? (
              <div className="mx-auto flex flex-wrap items-center justify-center gap-3">
                {logos.map((logo, index) => (
                  <Image key={`${logo}-${index}`} src={logo} alt={`${certificate.issuerName} logo ${index + 1}`} width={64} height={64} unoptimized className="h-16 w-16 rounded-2xl border border-slate-200 bg-white object-contain p-1" />
                ))}
              </div>
            ) : null}
            <p className="mt-4 text-[11px] uppercase tracking-[0.28em]" style={{ color: certificate.accentColor || '#f97316' }}>
              Verified e-certificate
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">{certificate.certificateTitle}</h1>
            {certificate.subtitle ? <p className="mt-4 text-lg opacity-80">{certificate.subtitle}</p> : null}
            <p className="mt-8 text-sm uppercase tracking-[0.24em] opacity-60">Presented to</p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{certificate.recipientName}</p>
            {certificate.description ? <p className="mx-auto mt-6 max-w-3xl text-sm leading-7 opacity-80">{certificate.description}</p> : null}

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <div className="rounded-[1.2rem] border px-4 py-4" style={{ borderColor: `${certificate.accentColor || '#f97316'}33` }}>
                <p className="text-[10px] uppercase tracking-[0.18em] opacity-50">Issued</p>
                <p className="mt-2 text-sm font-medium">{certificate.issueDate}</p>
              </div>
              <div className="rounded-[1.2rem] border px-4 py-4" style={{ borderColor: `${certificate.accentColor || '#f97316'}33` }}>
                <p className="text-[10px] uppercase tracking-[0.18em] opacity-50">Credential ID</p>
                <p className="mt-2 text-sm font-medium">{certificate.credentialId}</p>
              </div>
              <div className="rounded-[1.2rem] border px-4 py-4" style={{ borderColor: `${certificate.accentColor || '#f97316'}33` }}>
                <p className="text-[10px] uppercase tracking-[0.18em] opacity-50">Issuer</p>
                <p className="mt-2 text-sm font-medium">{certificate.issuerName}</p>
              </div>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 sm:items-end">
              <div className="text-left">
                {signatureAsset ? (
                  <Image src={signatureAsset} alt={certificate.signatoryName || 'Signature'} width={220} height={56} unoptimized className="h-14 w-auto object-contain" />
                ) : null}
                <p className="mt-3 text-base font-medium">{certificate.signatoryName || certificate.issuerName}</p>
                <p className="text-sm opacity-70">{certificate.signatoryRole || 'Authorized Signatory'}</p>
              </div>
              <div className="text-right">
                <Image src={certificate.qrUrl} alt="Certificate QR" width={96} height={96} unoptimized className="ml-auto h-24 w-24 rounded-xl bg-white p-2" />
                <p className="mt-2 text-xs opacity-60">Scan to verify</p>
              </div>
            </div>

            {certificate.includeDocrudWatermark !== false ? (
              <div className="mt-10 border-t border-slate-200 pt-4 text-[11px] uppercase tracking-[0.28em] text-slate-500">
                Issued and hosted on docrud
              </div>
            ) : null}
          </div>
        </section>

        <div className="certificate-actions mt-6 flex flex-wrap gap-3">
          <Button type="button" className="rounded-xl bg-white text-slate-950 hover:bg-white/90" onClick={handleDownload}>
            Download / Save as PDF
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
            onClick={() => void handleVerify()}
          >
            Verify certificate
          </Button>
        </div>
        {verifyMessage ? <p className="mt-3 text-sm text-slate-600">{verifyMessage}</p> : null}
      </div>
    </main>
  );
}
