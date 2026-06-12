import { DocumentHistory, User } from '@/types/document';
import { createPasswordHash, normalizeEmail } from '@/lib/server/security';
import { getStoredUsers, saveStoredUsers } from '@/lib/server/auth';

export const onboardingTemplateIds = ['internship-letter', 'offer-letter', 'appointment-letter', 'employment-contract'];

export const defaultBackgroundVerificationDocuments = [
  'Government photo ID proof',
  'Address proof',
  'PAN card',
  'Aadhaar card',
  'Passport size photograph',
  'Educational certificates',
  'Latest resume',
  'Previous employment relieving letter',
  'Previous employment payslips',
  'Bank account proof',
];

export function isOnboardingTemplate(templateId?: string, category?: string) {
  return onboardingTemplateIds.includes(String(templateId || '')) || String(category || '').toLowerCase() === 'hr';
}

export function generateEmployeeTemporaryPassword() {
  return `Emp#${Math.random().toString(36).slice(2, 6).toUpperCase()}${Date.now().toString().slice(-4)}`;
}

export function deriveOnboardingStage(entry: Partial<DocumentHistory>): DocumentHistory['onboardingStage'] {
  if (entry.recipientSignedAt) return 'offer_signed';
  if (entry.backgroundVerificationStatus === 'verified') return 'ready_to_sign';
  if (entry.backgroundVerificationStatus === 'under_review' || entry.backgroundVerificationStatus === 'submitted') return 'bgv_under_review';
  if (entry.submittedDocuments?.length) return 'documents_submitted';
  if (entry.onboardingCredentials?.email) return 'documents_pending';
  return 'account_created';
}

export function deriveOnboardingProgress(entry: Partial<DocumentHistory>) {
  const stage = deriveOnboardingStage(entry);
  switch (stage) {
    case 'account_created':
      return 15;
    case 'documents_pending':
      return 30;
    case 'documents_submitted':
      return 55;
    case 'bgv_under_review':
      return 72;
    case 'ready_to_sign':
      return 90;
    case 'offer_signed':
      return 100;
    case 'completed':
      return 100;
    default:
      return 0;
  }
}

export async function ensureEmployeeAccessAccount(input: {
  employeeName: string;
  employeeEmail: string;
  permissions?: string[];
}) {
  const users = await getStoredUsers();
  const normalizedEmail = normalizeEmail(input.employeeEmail);
  const tempPassword = generateEmployeeTemporaryPassword();
  const employeeIndex = users.findIndex((user) => user.email === normalizedEmail);

  const baseUser = {
    email: normalizedEmail,
    name: input.employeeName,
    role: 'employee',
    permissions: input.permissions || [],
    isActive: true,
  };

  if (employeeIndex === -1) {
    const newUser: User & { passwordHash: string; passwordSalt: string } = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: new Date().toISOString(),
      ...baseUser,
      ...createPasswordHash(tempPassword),
    };
    users.push(newUser);
    await saveStoredUsers(users);
    const { passwordHash, passwordSalt, ...safeUser } = newUser;
    return {
      user: safeUser,
      temporaryPassword: tempPassword,
      newlyCreated: true,
    };
  }

  users[employeeIndex] = {
    ...users[employeeIndex],
    ...baseUser,
    permissions: Array.from(new Set([...(users[employeeIndex].permissions || []), ...(input.permissions || [])])),
    ...createPasswordHash(tempPassword),
  };
  await saveStoredUsers(users);
  const { passwordHash, passwordSalt, ...safeUser } = users[employeeIndex] as User & { passwordHash: string; passwordSalt: string };
  return {
    user: safeUser,
    temporaryPassword: tempPassword,
    newlyCreated: false,
  };
}
