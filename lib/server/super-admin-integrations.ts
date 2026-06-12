import { readJsonFile, writeJsonFile, integrationsConfigPath } from '@/lib/server/storage';

export interface GoogleAnalyticsConfig {
  enabled: boolean;
  measurementId: string;
  apiSecret: string;
}

export interface RazorpayConfig {
  enabled: boolean;
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  testMode: boolean;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  label: string;
  events: string[];
  enabled: boolean;
  secret: string;
  createdAt: string;
}

export interface SlackConfig {
  enabled: boolean;
  webhookUrl: string;
  channel: string;
  notifyOnSignup: boolean;
  notifyOnPayment: boolean;
  notifyOnAlert: boolean;
}

export interface IntegrationsConfig {
  googleAnalytics: GoogleAnalyticsConfig;
  razorpay: RazorpayConfig;
  slack: SlackConfig;
  webhooks: WebhookEndpoint[];
  updatedAt: string;
}

const defaultConfig: IntegrationsConfig = {
  googleAnalytics: { enabled: false, measurementId: '', apiSecret: '' },
  razorpay: { enabled: false, keyId: process.env.RAZORPAY_KEY_ID || '', keySecret: '', webhookSecret: '', testMode: true },
  slack: { enabled: false, webhookUrl: '', channel: '#alerts', notifyOnSignup: true, notifyOnPayment: true, notifyOnAlert: true },
  webhooks: [],
  updatedAt: new Date().toISOString(),
};

export async function getIntegrationsConfig(): Promise<IntegrationsConfig> {
  const stored = await readJsonFile<Partial<IntegrationsConfig>>(integrationsConfigPath, {});
  return { ...defaultConfig, ...stored };
}

export async function saveIntegrationsConfig(config: Partial<IntegrationsConfig>): Promise<void> {
  const current = await getIntegrationsConfig();
  const next = { ...current, ...config, updatedAt: new Date().toISOString() };
  await writeJsonFile(integrationsConfigPath, next);
}

export async function sendGoogleAnalyticsEvent(measurementId: string, apiSecret: string, events: object[]) {
  if (!measurementId || !apiSecret) return;
  try {
    await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: 'super-admin', events }),
    });
  } catch { /* non-critical */ }
}

export async function sendSlackNotification(message: string) {
  const cfg = await getIntegrationsConfig();
  if (!cfg.slack.enabled || !cfg.slack.webhookUrl) return;
  try {
    await fetch(cfg.slack.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message, channel: cfg.slack.channel }),
    });
  } catch { /* non-critical */ }
}
