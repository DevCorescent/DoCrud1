import crypto from 'crypto';

export interface PasswordHash {
  passwordHash: string;
  passwordSalt: string;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function createPasswordHash(password: string): PasswordHash {
  const passwordSalt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.scryptSync(password, passwordSalt, 64).toString('hex');

  return { passwordHash, passwordSalt };
}

export function verifyPassword(password: string, passwordHash?: string, passwordSalt?: string) {
  if (!passwordHash || !passwordSalt) {
    return false;
  }

  const derived = crypto.scryptSync(password, passwordSalt, 64);
  const stored = Buffer.from(passwordHash, 'hex');

  return stored.length === derived.length && crypto.timingSafeEqual(stored, derived);
}

export function sanitizeHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '');
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
