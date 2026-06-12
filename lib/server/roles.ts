import { RoleProfile } from '@/types/document';
import { readJsonFile, roleProfilesPath, writeJsonFile } from '@/lib/server/storage';

export const defaultRoleProfiles: RoleProfile[] = [
  {
    id: 'role-admin-control',
    name: 'Admin Control',
    description: 'Full platform administration with unrestricted document governance access.',
    baseRole: 'admin',
    permissions: ['all'],
    governanceScopes: ['users', 'templates', 'documents', 'roles', 'mail', 'automation', 'signatures'],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    isSystem: true,
  },
  {
    id: 'role-hr-operations',
    name: 'HR Operations',
    description: 'Employee lifecycle document operations and review rights.',
    baseRole: 'hr',
    permissions: ['appointment-letter', 'offer-letter', 'termination-letter', 'resignation-letter', 'performance-appraisal', 'internship-letter'],
    governanceScopes: ['documents', 'reviews', 'employees'],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    isSystem: true,
  },
  {
    id: 'role-legal-governance',
    name: 'Legal Governance',
    description: 'Contract, NDA, and agreement governance with review controls.',
    baseRole: 'legal',
    permissions: ['nda', 'employment-contract', 'loan-agreement', 'service-agreement', 'partnership-agreement', 'contractual-agreement'],
    governanceScopes: ['documents', 'clauses', 'approvals'],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    isSystem: true,
  },
  {
    id: 'role-document-operator',
    name: 'Document Operator',
    description: 'Focused access for document generation, editing, and handoff.',
    baseRole: 'user',
    permissions: ['general-letterhead'],
    governanceScopes: ['documents'],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    isSystem: true,
  },
];

function normalizeRoleProfile(profile: Partial<RoleProfile>): RoleProfile {
  const now = new Date().toISOString();
  return {
    id: profile.id || `role-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: String(profile.name || 'Untitled Role'),
    description: String(profile.description || ''),
    baseRole: profile.baseRole === 'admin' || profile.baseRole === 'hr' || profile.baseRole === 'legal' ? profile.baseRole : 'user',
    permissions: Array.isArray(profile.permissions) ? profile.permissions.map(String).filter(Boolean) : [],
    governanceScopes: Array.isArray(profile.governanceScopes) ? profile.governanceScopes.map(String).filter(Boolean) : [],
    createdAt: String(profile.createdAt || now),
    updatedAt: String(profile.updatedAt || now),
    isSystem: Boolean(profile.isSystem),
  };
}

export async function getRoleProfiles() {
  const profiles = await readJsonFile<RoleProfile[]>(roleProfilesPath, defaultRoleProfiles);
  return profiles.map(normalizeRoleProfile);
}

export async function saveRoleProfiles(profiles: RoleProfile[]) {
  await writeJsonFile(roleProfilesPath, profiles.map(normalizeRoleProfile));
}
