import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { readJsonFile, writeJsonFile, superAdminConfigPath } from '@/lib/server/storage';

export interface SuperAdminOtpSession {
  id: string;
  email: string;
  otpHash: string;
  otpSalt: string;
  createdAt: string;
  expiresAt: string;
  attempts: number;
  verifiedAt?: string;
}

export interface SuperAdminActiveSession {
  token: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  ip?: string;
  userAgent?: string;
}

export interface SuperAdminAuditEntry {
  id: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ip?: string;
  timestamp: string;
}

export interface SuperAdminPlatformFlags {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  newSignupsEnabled: boolean;
  publicGigsEnabled: boolean;
  publicMarketplaceEnabled: boolean;
  publicBlogEnabled: boolean;
  globalBroadcast: { message: string; type: 'info' | 'warning' | 'error'; createdAt: string } | null;
}

export interface SuperAdminConfig {
  email: string;
  otpSessions: SuperAdminOtpSession[];
  activeSessions: SuperAdminActiveSession[];
  auditLog: SuperAdminAuditEntry[];
  platformFlags: SuperAdminPlatformFlags;
}

/** Hardcoded local/dev credentials — prefer env overrides when set. */
export const HARDCODED_SUPER_ADMIN_EMAIL = 'superadmin@company.com';
export const HARDCODED_SUPER_ADMIN_PASSWORD = 'superadmin123';

const DEFAULT_CONFIG: SuperAdminConfig = {
  email: HARDCODED_SUPER_ADMIN_EMAIL,
  otpSessions: [],
  activeSessions: [],
  auditLog: [],
  platformFlags: {
    maintenanceMode: false,
    maintenanceMessage: '',
    newSignupsEnabled: true,
    publicGigsEnabled: true,
    publicMarketplaceEnabled: true,
    publicBlogEnabled: true,
    globalBroadcast: null,
  },
};

async function readConfig(): Promise<SuperAdminConfig> {
  return readJsonFile<SuperAdminConfig>(superAdminConfigPath, { ...DEFAULT_CONFIG });
}

async function writeConfig(config: SuperAdminConfig): Promise<void> {
  await writeJsonFile(superAdminConfigPath, config);
}

function hashOtp(otp: string, salt: string): string {
  return crypto.createHmac('sha256', salt).update(otp).digest('hex');
}

function generateOtp(): string {
  return String(crypto.randomInt(100000, 999999));
}

function generateToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

export async function getSuperAdminEmail(): Promise<string> {
  // Hardcoded credentials take priority so login always works with known local/dev creds
  return HARDCODED_SUPER_ADMIN_EMAIL;
}

export async function verifySuperAdminPassword(email: string, password: string): Promise<{ valid: boolean; email?: string; error?: string }> {
  const normalized = email.trim().toLowerCase();

  if (!normalized || !password) {
    return { valid: false, error: 'Email and password are required' };
  }

  if (normalized === HARDCODED_SUPER_ADMIN_EMAIL && password === HARDCODED_SUPER_ADMIN_PASSWORD) {
    return { valid: true, email: HARDCODED_SUPER_ADMIN_EMAIL };
  }

  return { valid: false, error: 'Invalid email or password' };
}

export async function setSuperAdminEmail(email: string): Promise<void> {
  const cfg = await readConfig();
  cfg.email = email.trim().toLowerCase();
  await writeConfig(cfg);
}

export async function createSuperAdminOtpSession(email: string): Promise<{ sessionId: string; otp: string }> {
  const cfg = await readConfig();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
  const otp = generateOtp();
  const salt = crypto.randomBytes(16).toString('hex');
  const otpHash = hashOtp(otp, salt);
  const sessionId = generateToken().slice(0, 32);

  cfg.otpSessions = cfg.otpSessions.filter(
    (s) => s.email !== email && new Date(s.expiresAt) > now
  );
  cfg.otpSessions.push({
    id: sessionId,
    email: email.toLowerCase(),
    otpHash,
    otpSalt: salt,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    attempts: 0,
  });
  cfg.otpSessions = cfg.otpSessions.filter((s) => new Date(s.expiresAt) > now);
  await writeConfig(cfg);
  return { sessionId, otp };
}

export async function verifySuperAdminOtp(sessionId: string, otp: string): Promise<{ valid: boolean; email?: string; error?: string }> {
  const cfg = await readConfig();
  const now = new Date();
  const session = cfg.otpSessions.find((s) => s.id === sessionId);

  if (!session) return { valid: false, error: 'Session not found or expired' };
  if (new Date(session.expiresAt) < now) return { valid: false, error: 'OTP has expired' };
  if (session.verifiedAt) return { valid: false, error: 'OTP already used' };
  if (session.attempts >= 5) return { valid: false, error: 'Too many attempts' };

  const hash = hashOtp(otp.trim(), session.otpSalt);
  if (hash !== session.otpHash) {
    session.attempts++;
    await writeConfig(cfg);
    return { valid: false, error: 'Invalid OTP' };
  }

  session.verifiedAt = now.toISOString();
  await writeConfig(cfg);
  return { valid: true, email: session.email };
}

export async function createSuperAdminSession(email: string, req?: NextRequest): Promise<string> {
  const cfg = await readConfig();
  const token = generateToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 4 * 60 * 60 * 1000);

  cfg.activeSessions = cfg.activeSessions.filter((s) => new Date(s.expiresAt) > now);
  cfg.activeSessions.push({
    token,
    email: email.toLowerCase(),
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ip: req?.headers.get('x-forwarded-for') || req?.headers.get('x-real-ip') || undefined,
    userAgent: req?.headers.get('user-agent') || undefined,
  });

  await writeConfig(cfg);
  return token;
}

export async function validateSuperAdminSession(token: string): Promise<{ valid: boolean; email?: string }> {
  if (!token) return { valid: false };
  const cfg = await readConfig();
  const now = new Date();
  const session = cfg.activeSessions.find((s) => s.token === token);
  if (!session || new Date(session.expiresAt) < now) return { valid: false };
  return { valid: true, email: session.email };
}

export async function revokeSuperAdminSession(token: string): Promise<void> {
  const cfg = await readConfig();
  cfg.activeSessions = cfg.activeSessions.filter((s) => s.token !== token);
  await writeConfig(cfg);
}

export async function getSuperAdminSessionFromRequest(req: NextRequest): Promise<{ valid: boolean; email?: string }> {
  const token = req.cookies.get('sa_session')?.value || '';
  return validateSuperAdminSession(token);
}

export async function appendSuperAdminAudit(entry: Omit<SuperAdminAuditEntry, 'id' | 'timestamp'>): Promise<void> {
  const cfg = await readConfig();
  cfg.auditLog.unshift({
    id: generateToken().slice(0, 16),
    timestamp: new Date().toISOString(),
    ...entry,
  });
  cfg.auditLog = cfg.auditLog.slice(0, 2000);
  await writeConfig(cfg);
}

export async function getSuperAdminAuditLog(limit = 100): Promise<SuperAdminAuditEntry[]> {
  const cfg = await readConfig();
  return cfg.auditLog.slice(0, limit);
}

export async function getPlatformFlags(): Promise<SuperAdminPlatformFlags> {
  const cfg = await readConfig();
  return cfg.platformFlags;
}

export async function savePlatformFlags(flags: Partial<SuperAdminPlatformFlags>): Promise<void> {
  const cfg = await readConfig();
  cfg.platformFlags = { ...cfg.platformFlags, ...flags };
  await writeConfig(cfg);
}

export async function getSuperAdminConfig(): Promise<SuperAdminConfig> {
  return readConfig();
}
