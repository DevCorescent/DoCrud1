import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit } from '@/lib/server/super-admin-auth';
import { getIntegrationsConfig, saveIntegrationsConfig } from '@/lib/server/super-admin-integrations';
import crypto from 'crypto';

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

export async function GET(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const cfg = await getIntegrationsConfig();
  // Scrub secrets in response
  return NextResponse.json({
    googleAnalytics: {
      enabled: cfg.googleAnalytics.enabled,
      measurementId: cfg.googleAnalytics.measurementId,
      apiSecretConfigured: Boolean(cfg.googleAnalytics.apiSecret),
    },
    razorpay: {
      enabled: cfg.razorpay.enabled,
      keyId: cfg.razorpay.keyId,
      testMode: cfg.razorpay.testMode,
      keySecretConfigured: Boolean(cfg.razorpay.keySecret),
      webhookSecretConfigured: Boolean(cfg.razorpay.webhookSecret),
    },
    slack: {
      enabled: cfg.slack.enabled,
      channel: cfg.slack.channel,
      webhookConfigured: Boolean(cfg.slack.webhookUrl),
      notifyOnSignup: cfg.slack.notifyOnSignup,
      notifyOnPayment: cfg.slack.notifyOnPayment,
      notifyOnAlert: cfg.slack.notifyOnAlert,
    },
    webhooks: cfg.webhooks.map((w) => ({
      id: w.id, url: w.url, label: w.label, events: w.events, enabled: w.enabled, createdAt: w.createdAt,
    })),
    updatedAt: cfg.updatedAt,
    envStatus: {
      RAZORPAY_KEY_ID: Boolean(process.env.RAZORPAY_KEY_ID),
      RAZORPAY_KEY_SECRET: Boolean(process.env.RAZORPAY_KEY_SECRET),
      NEXTAUTH_SECRET: Boolean(process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET),
      DATABASE_URL: Boolean(process.env.MONGODB_URI || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL),
      SUPER_ADMIN_EMAIL: Boolean(process.env.SUPER_ADMIN_EMAIL),
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { action, data } = await req.json();

    await appendSuperAdminAudit({ action: `integration_${action}`, details: { keys: data ? Object.keys(data) : [] }, ip: req.headers.get('x-forwarded-for') || undefined });

    if (action === 'update_google_analytics') {
      await saveIntegrationsConfig({ googleAnalytics: { ...(await getIntegrationsConfig()).googleAnalytics, ...data } });
      return NextResponse.json({ success: true });
    }

    if (action === 'update_razorpay') {
      await saveIntegrationsConfig({ razorpay: { ...(await getIntegrationsConfig()).razorpay, ...data } });
      return NextResponse.json({ success: true });
    }

    if (action === 'update_slack') {
      await saveIntegrationsConfig({ slack: { ...(await getIntegrationsConfig()).slack, ...data } });
      return NextResponse.json({ success: true });
    }

    if (action === 'test_slack') {
      const cfg = await getIntegrationsConfig();
      if (!cfg.slack.enabled || !cfg.slack.webhookUrl) return NextResponse.json({ error: 'Slack not configured' }, { status: 400 });
      const res = await fetch(cfg.slack.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '✅ docrud super admin: Slack integration test successful!', channel: cfg.slack.channel }),
      });
      return NextResponse.json({ success: res.ok, status: res.status });
    }

    if (action === 'test_google_analytics') {
      const cfg = await getIntegrationsConfig();
      if (!cfg.googleAnalytics.measurementId || !cfg.googleAnalytics.apiSecret) return NextResponse.json({ error: 'GA not configured' }, { status: 400 });
      const res = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${cfg.googleAnalytics.measurementId}&api_secret=${cfg.googleAnalytics.apiSecret}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: 'super-admin-test', events: [{ name: 'sa_test_ping', params: { source: 'docrud_super_admin' } }] }),
      });
      return NextResponse.json({ success: res.ok, status: res.status });
    }

    if (action === 'add_webhook') {
      const cfg = await getIntegrationsConfig();
      const webhook = { id: `wh-${Date.now()}`, url: data.url, label: data.label || 'Webhook', events: data.events || [], enabled: true, secret: crypto.randomBytes(20).toString('hex'), createdAt: new Date().toISOString() };
      cfg.webhooks.push(webhook);
      await saveIntegrationsConfig({ webhooks: cfg.webhooks });
      return NextResponse.json({ success: true, id: webhook.id });
    }

    if (action === 'delete_webhook') {
      const cfg = await getIntegrationsConfig();
      await saveIntegrationsConfig({ webhooks: cfg.webhooks.filter((w) => w.id !== data.id) });
      return NextResponse.json({ success: true });
    }

    if (action === 'toggle_webhook') {
      const cfg = await getIntegrationsConfig();
      cfg.webhooks = cfg.webhooks.map((w) => w.id === data.id ? { ...w, enabled: !w.enabled } : w);
      await saveIntegrationsConfig({ webhooks: cfg.webhooks });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[super-admin/integrations POST]', err);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
