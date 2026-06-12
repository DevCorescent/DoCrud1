import { BusinessSettings, DocumentTemplate } from '@/types/document';
import { getIndustryWorkspaceProfile } from '@/lib/industry-presets';
import {
  getBusinessSettingsFromRepository,
  getCustomTemplatesFromRepository,
  saveBusinessSettingsToRepository,
  saveCustomTemplatesToRepository,
} from '@/lib/server/repositories';

export async function getAllBusinessSettings() {
  return getBusinessSettingsFromRepository();
}

export async function getBusinessSettings(organizationId?: string, organizationName?: string) {
  const allSettings = await getAllBusinessSettings();
  if (!organizationId) {
    return null;
  }

  const existing = allSettings.find((entry) => entry.organizationId === organizationId);
  if (existing) {
    return existing;
  }

  return {
    organizationId,
    organizationName: organizationName || 'Business Workspace',
    displayName: organizationName || 'Business Workspace',
    industry: 'technology',
    companySize: '1-25',
    primaryUseCase: '',
    workspacePreset: 'executive_control',
    onboardingCompleted: false,
    supportEmail: '',
    supportPhone: '',
    accentColor: '#2719FF',
    watermarkLabel: 'docrud workspace',
    letterheadMode: 'default',
    letterheadImageDataUrl: '',
    letterheadHtml: '',
    businessDescription: '',
    workspaceSetupChecklist: {
      profileConfigured: false,
      brandingConfigured: false,
      starterTemplatesReady: false,
      signaturesReady: false,
      firstDocumentGenerated: false,
    },
    updatedAt: new Date().toISOString(),
  } satisfies BusinessSettings;
}

export async function saveBusinessSettings(settings: BusinessSettings) {
  await saveBusinessSettingsToRepository(settings);
  return settings;
}

export function buildWorkspaceSetupChecklist(input: Partial<BusinessSettings> & { hasTemplates?: boolean; hasSignatures?: boolean; hasDocuments?: boolean }) {
  return {
    profileConfigured: Boolean(input.displayName?.trim() && input.supportEmail?.trim() && input.primaryUseCase?.trim()),
    brandingConfigured: Boolean(
      input.letterheadMode === 'image'
        ? input.letterheadImageDataUrl?.trim()
        : input.letterheadMode === 'html'
          ? input.letterheadHtml?.trim()
          : input.accentColor?.trim()
    ),
    starterTemplatesReady: Boolean(input.hasTemplates),
    signaturesReady: Boolean(input.hasSignatures),
    firstDocumentGenerated: Boolean(input.hasDocuments),
  };
}

export async function seedStarterTemplatesForBusiness(settings: BusinessSettings) {
  const allTemplates = await getCustomTemplatesFromRepository();
  const alreadySeeded = allTemplates.some((template) => template.organizationId === settings.organizationId && template.createdBy === 'system');
  if (alreadySeeded) {
    return;
  }

  const profile = getIndustryWorkspaceProfile(settings.industry);
  const now = new Date().toISOString();
  const seededTemplates = profile.starterTemplates.map((template, index) => ({
    ...template,
    id: `custom-seed-${settings.organizationId}-${index + 1}`,
    isCustom: true,
    createdAt: now,
    updatedAt: now,
    version: 1,
    organizationId: settings.organizationId,
    organizationName: settings.organizationName,
  }));

  await saveCustomTemplatesToRepository([...allTemplates, ...seededTemplates]);
}
