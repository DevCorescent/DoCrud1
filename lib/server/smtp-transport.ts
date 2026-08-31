/**
 * The pooled SMTP transport.
 *
 * Extracted from mailer.ts so `lib/server/mail-provider.ts` can use it without
 * an import cycle: the provider needs the transport, and the mailer now sends
 * THROUGH the provider. With the transport here, both import downwards and
 * neither imports the other.
 *
 * There is still exactly one transport in the application — this one.
 */
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { getMailSettings } from '@/lib/server/settings';

/* ─── Persistent pooled SMTP transporter ─────────────────────────────────────
   Creating a new transporter on every send triggers a fresh TCP + TLS
   handshake (~200–800 ms). With pool:true the connections stay alive and
   are reused, cutting per-email overhead to ~5–30 ms.
   The cache is keyed on the SMTP config hash; changing settings in admin
   automatically rotates to a fresh pool.
────────────────────────────────────────────────────────────────────────────── */
let _cachedTransporter: Transporter | null = null;
let _cachedConfigKey = '';

export async function getCachedTransporter(): Promise<Transporter> {
  const smtp = await getMailSettings();
  const configKey = `${smtp.host}|${smtp.port}|${smtp.secure}|${smtp.username}`;

  if (_cachedTransporter && _cachedConfigKey === configKey) {
    return _cachedTransporter;
  }

  // Close the old pool before replacing it
  if (_cachedTransporter) {
    try { (_cachedTransporter as Transporter & { close?: () => void }).close?.(); } catch { /* ignore */ }
  }

  _cachedTransporter = nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port) || 465,
    secure: Boolean(smtp.secure),
    auth: smtp.requireAuth ? { user: smtp.username, pass: smtp.password } : undefined,
    pool: true,           // keep TCP connections alive between sends
    maxConnections: 5,
    maxMessages: 200,
    connectionTimeout: 30_000,  // GoDaddy cold-start can take 10-15 s
    greetingTimeout:   20_000,
    socketTimeout:     30_000,
    /* Certificate verification stays ON. Disabling it makes the connection
       trivially interceptable, and it hides real provider certificate problems
       instead of surfacing them. If a provider genuinely presents a bad
       certificate, that is a provider issue to fix, not one to silence here. */
  });

  _cachedConfigKey = configKey;
  return _cachedTransporter;
}
