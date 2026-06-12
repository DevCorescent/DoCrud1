import { getAuthSettings } from '@/lib/server/settings';

export type AadhaarIdentityType = 'aadhaar' | 'vid';

export interface AadhaarRuntimeConfig {
  enabled: boolean;
  configured: boolean;
  providerLabel: string;
  environment: 'sandbox' | 'production';
}

export function maskAadhaarIdentity(identity: string) {
  const digits = identity.replace(/\D/g, '');
  if (digits.length <= 4) return digits;
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function buildProviderUrl(baseUrl: string, path: string) {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export async function getAadhaarRuntimeConfig(): Promise<AadhaarRuntimeConfig> {
  const settings = await getAuthSettings();
  const environment: AadhaarRuntimeConfig['environment'] = settings.aadhaarEnvironment === 'production' ? 'production' : 'sandbox';
  return {
    enabled: settings.aadhaarVerificationEnabled,
    configured: Boolean(settings.aadhaarApiBaseUrl && settings.aadhaarOtpRequestPath && settings.aadhaarOtpVerifyPath),
    providerLabel: settings.aadhaarProviderLabel,
    environment,
  };
}

function buildProviderHeaders(settings: Awaited<ReturnType<typeof getAuthSettings>>) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (settings.aadhaarClientId) headers['x-client-id'] = settings.aadhaarClientId;
  if (settings.aadhaarClientSecret) headers['x-client-secret'] = settings.aadhaarClientSecret;
  if (settings.aadhaarApiKey) headers['x-api-key'] = settings.aadhaarApiKey;
  if (settings.aadhaarAuaCode) headers['x-aadhaar-aua-code'] = settings.aadhaarAuaCode;
  if (settings.aadhaarSubAuaCode) headers['x-aadhaar-sub-aua-code'] = settings.aadhaarSubAuaCode;
  if (settings.aadhaarLicenseKey) headers['x-aadhaar-license-key'] = settings.aadhaarLicenseKey;
  return headers;
}

function extractTransactionId(payload: any) {
  return payload?.transactionId
    || payload?.txnId
    || payload?.txn
    || payload?.referenceId
    || payload?.refId
    || payload?.data?.transactionId
    || payload?.data?.txnId
    || payload?.response?.transactionId
    || payload?.response?.txnId
    || null;
}

function extractSuccess(payload: any) {
  const value = payload?.success
    ?? payload?.authenticated
    ?? payload?.auth
    ?? payload?.verified
    ?? payload?.status
    ?? payload?.result
    ?? payload?.data?.success
    ?? payload?.data?.status
    ?? payload?.response?.status;

  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return ['y', 'yes', 'success', 'verified', 'true', 'ok', '200'].includes(value.toLowerCase());
  }
  if (typeof value === 'number') return value === 1 || value === 200;
  return false;
}

function extractProviderMessage(payload: any, fallback: string) {
  return payload?.message
    || payload?.error
    || payload?.detail
    || payload?.statusMessage
    || payload?.response?.message
    || fallback;
}

export async function requestAadhaarOtp(input: {
  identityType: AadhaarIdentityType;
  identityValue: string;
  signerName?: string;
  documentId: string;
  shareId?: string;
  referenceNumber?: string;
}) {
  const settings = await getAuthSettings();
  if (!settings.aadhaarVerificationEnabled) {
    throw new Error('Aadhaar verification is not enabled by admin.');
  }
  if (!settings.aadhaarApiBaseUrl || !settings.aadhaarOtpRequestPath) {
    throw new Error('Aadhaar verification is not configured yet. Ask your admin to configure the UIDAI gateway.');
  }

  const url = buildProviderUrl(settings.aadhaarApiBaseUrl, settings.aadhaarOtpRequestPath);
  const response = await fetch(url, {
    method: 'POST',
    headers: buildProviderHeaders(settings),
    body: JSON.stringify({
      identityType: input.identityType,
      identityValue: input.identityValue,
      signerName: input.signerName,
      purpose: 'document_signing',
      documentId: input.documentId,
      shareId: input.shareId,
      referenceNumber: input.referenceNumber,
      auaCode: settings.aadhaarAuaCode || undefined,
      subAuaCode: settings.aadhaarSubAuaCode || undefined,
      licenseKey: settings.aadhaarLicenseKey || undefined,
      environment: settings.aadhaarEnvironment,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(extractProviderMessage(payload, 'Failed to request Aadhaar OTP.'));
  }

  const transactionId = extractTransactionId(payload);
  if (!transactionId) {
    throw new Error('Aadhaar OTP request succeeded but no transaction ID was returned by the verification provider.');
  }

  return {
    transactionId: String(transactionId),
    maskedId: maskAadhaarIdentity(input.identityValue),
    providerLabel: settings.aadhaarProviderLabel,
    message: extractProviderMessage(payload, 'OTP sent successfully.'),
    raw: payload,
  };
}

export async function verifyAadhaarOtp(input: {
  identityType: AadhaarIdentityType;
  identityValue: string;
  otp: string;
  transactionId: string;
  signerName?: string;
  documentId: string;
  shareId?: string;
  referenceNumber?: string;
}) {
  const settings = await getAuthSettings();
  if (!settings.aadhaarVerificationEnabled) {
    throw new Error('Aadhaar verification is not enabled by admin.');
  }
  if (!settings.aadhaarApiBaseUrl || !settings.aadhaarOtpVerifyPath) {
    throw new Error('Aadhaar verification is not configured yet. Ask your admin to configure the UIDAI gateway.');
  }

  const url = buildProviderUrl(settings.aadhaarApiBaseUrl, settings.aadhaarOtpVerifyPath);
  const response = await fetch(url, {
    method: 'POST',
    headers: buildProviderHeaders(settings),
    body: JSON.stringify({
      identityType: input.identityType,
      identityValue: input.identityValue,
      otp: input.otp,
      transactionId: input.transactionId,
      signerName: input.signerName,
      purpose: 'document_signing',
      documentId: input.documentId,
      shareId: input.shareId,
      referenceNumber: input.referenceNumber,
      auaCode: settings.aadhaarAuaCode || undefined,
      subAuaCode: settings.aadhaarSubAuaCode || undefined,
      licenseKey: settings.aadhaarLicenseKey || undefined,
      environment: settings.aadhaarEnvironment,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(extractProviderMessage(payload, 'Failed to verify Aadhaar OTP.'));
  }
  if (!extractSuccess(payload)) {
    throw new Error(extractProviderMessage(payload, 'Aadhaar verification was not successful.'));
  }

  return {
    providerLabel: settings.aadhaarProviderLabel,
    referenceId: String(extractTransactionId(payload) || input.transactionId),
    maskedId: maskAadhaarIdentity(input.identityValue),
    message: extractProviderMessage(payload, 'Aadhaar verified successfully.'),
    raw: payload,
  };
}
