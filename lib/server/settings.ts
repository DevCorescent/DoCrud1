import { AuthSettings, CollaborationSettings, LandingSettings, MailSettings, NavAnnouncementSettings, SignatureSettings, ThemeSettings, WorkflowAutomationSettings } from '@/types/document';
import { authSettingsPath, automationSettingsPath, collaborationSettingsPath, landingSettingsPath, mailSettingsPath, navAnnouncementSettingsPath, readJsonFile, signatureSettingsPath, themeSettingsPath, writeJsonFile } from '@/lib/server/storage';
import { getDbPool } from '@/lib/server/database';
import { getSettingsValueFromRepository, saveSettingsValueToRepository } from '@/lib/server/repositories';

// In-memory cache for auth settings populated by the first async getAuthSettings() call.
// getAuthSettingsSync() reads from this cache, avoiding any synchronous file I/O.
let _authSettingsCache: AuthSettings | null = null;
const AUTH_SETTINGS_TTL_MS = 60_000;
let _authSettingsCacheExpiresAt = 0;

function invalidateAuthSettingsCache() {
  _authSettingsCache = null;
  _authSettingsCacheExpiresAt = 0;
}

export const defaultMailSettings: MailSettings = {
  host: process.env.SMTP_HOST || 'smtpout.secureserver.net',
  port: Number(process.env.SMTP_PORT) || 465,
  secure: process.env.SMTP_SECURE !== 'false',
  requireAuth: true,
  username: process.env.SMTP_USERNAME || 'support@docrud.com',
  password: process.env.SMTP_PASSWORD || '',
  fromName: process.env.SMTP_FROM_NAME || 'Docrud Support',
  fromEmail: process.env.SMTP_FROM_EMAIL || 'support@docrud.com',
  replyTo: '',
  testRecipient: '',
};

export const defaultAuthSettings: AuthSettings = {
  googleEnabled: false,
  googleClientId: '',
  googleClientSecret: '',
  aadhaarVerificationEnabled: false,
  aadhaarProviderLabel: 'UIDAI OTP via registered AUA gateway',
  aadhaarApiBaseUrl: '',
  aadhaarOtpRequestPath: '/otp/request',
  aadhaarOtpVerifyPath: '/otp/verify',
  aadhaarClientId: '',
  aadhaarClientSecret: '',
  aadhaarApiKey: '',
  aadhaarAuaCode: '',
  aadhaarSubAuaCode: '',
  aadhaarLicenseKey: '',
  aadhaarEnvironment: 'sandbox',
};

export const defaultAutomationSettings: WorkflowAutomationSettings = {
  autoGenerateReferenceNumber: true,
  autoStampGeneratedBy: true,
  autoBccAuditMailbox: false,
  auditMailbox: '',
  autoCcGenerator: false,
  enableDeliveryTracking: true,
};

export const defaultSignatureSettings: SignatureSettings = {
  signatures: [],
};

export const defaultCollaborationSettings: CollaborationSettings = {
  defaultRecipientAccess: 'comment',
};

export const defaultThemeSettings: ThemeSettings = {
  activeTheme: 'sapphire',
  softwareName: 'docrud',
  accentLabel: 'Smart Document Operations',
};

export const defaultLandingSettings: LandingSettings = {
  heroBadge: 'Document Automation Suite',
  heroTitle: 'Create, review, share, and control business documents from one modern workspace',
  heroSubtitle: 'docrud helps teams move faster on documents, file operations, sheets, AI review, and secure sharing without losing visibility or control.',
  primaryCtaLabel: 'Book a Demo',
  primaryCtaHref: '#contact-us',
  secondaryCtaLabel: 'Open Login',
  secondaryCtaHref: '/login',
  socialProofLabel: 'Built for operations, HR, legal, finance, procurement, and client-facing teams',
  socialProofItems: ['Approvals', 'Secure Sharing', 'Audit Trails', 'AI Review'],
  gettingStartedTitle: 'How to start with docrud',
  gettingStartedSubtitle: 'Launch quickly with templates, controls, and a workflow that feels easy on day one and stronger over time.',
  gettingStartedSteps: [
    {
      id: 'getting-started-1',
      title: 'Create your workspace',
      description: 'Set up your company profile, admin access, and plan based on your expected document load.',
    },
    {
      id: 'getting-started-2',
      title: 'Set templates and controls',
      description: 'Upload signatures, define approvals, and prepare the templates your team uses most.',
    },
    {
      id: 'getting-started-3',
      title: 'Run live workflows',
      description: 'Generate, review, share, and track documents once the process is proven inside your team.',
    },
  ],
  audienceSectionTitle: 'Who uses docrud?',
  audienceSectionSubtitle: 'docrud fits teams that want faster turnaround, stronger controls, better visibility, and a more professional delivery experience.',
  featureSectionTitle: 'Why teams move to docrud',
  softwareModulesTitle: 'One workspace for the full document lifecycle',
  softwareModulesSubtitle: 'Generation, review, approvals, sharing, analytics, AI guidance, and sheet work stay connected so teams move faster with less follow-up.',
  pricingSectionTitle: 'Plans designed around how teams actually work',
  pricingSectionSubtitle: 'Start with a clear package, grow into stronger controls when needed, and keep pricing tied to real usage.',
  pricingPageTitle: 'Choose the plan that fits your team, usage, and workflow needs',
  pricingPageSubtitle: 'Every plan is designed to stay commercially clear, operationally useful, and easy to scale when your work grows.',
  contactEmail: 'sales@docrud.app',
  contactPhone: '+91 98765 43210',
  contactHeading: 'Talk to our team about your workflow',
  contactSubtitle: 'Share your document flow, approval complexity, client requirements, and control needs. We will help map the right docrud setup for your team.',
  contactPageTitle: 'Speak with the docrud team',
  contactPageSubtitle: 'Tell us where your document process slows down today and we will help scope the right setup, controls, and rollout path.',
  demoPageTitle: 'Schedule a docrud demo around your real workflow',
  demoPageSubtitle: 'See the platform with your team structure, approval path, and business use cases in mind so the demo feels directly relevant.',
  demoBenefits: [
    'See document generation, review, sharing, and control in one connected flow',
    'Review the modules that matter most to your team and use case',
    'Discuss rollout, branding, migration, pricing, and usage planning live',
  ],
  screenshotsSectionTitle: 'See the software in action',
  screenshotsSectionSubtitle: 'Show buyers how the product feels before they book a call. Highlight the views that matter most to your workflow.',
  featureHighlights: [
    'Generate business documents with structured fields, reusable templates, and controlled editing',
    'Route approvals, signatures, and file requests with visible history and better follow-through',
    'Use DoXpert AI to score documents, flag risks, and improve the next response',
  ],
  featureCards: [
    {
      id: 'feature-governed',
      title: 'Clean workflow control',
      description: 'Keep generation, review, approval, and delivery structured from start to finish.',
    },
    {
      id: 'feature-client',
      title: 'Client-ready sharing',
      description: 'Share documents, collect files, and manage recipient actions through a polished, controlled experience.',
    },
    {
      id: 'feature-custom',
      title: 'Configurable by design',
      description: 'Adjust branding, roles, approvals, templates, and integrations without rebuilding your workflow stack.',
    },
  ],
  stats: [
    { id: 'stat-1', value: '10x', label: 'faster document turnaround' },
    { id: 'stat-2', value: '1', label: 'workspace for docs, files, sheets, and AI' },
    { id: 'stat-3', value: '24/7', label: 'visibility into document status' },
  ],
  softwareModules: [
    {
      id: 'module-doc-ops',
      title: 'Document creation and editing',
      description: 'Generate, edit, revise, and manage documents with structured fields, metadata, and controlled workflows.',
      capabilities: ['Template generation', 'Advanced editing', 'Version snapshots', 'File and folder management'],
    },
    {
      id: 'module-governance',
      title: 'Roles, permissions, and approvals',
      description: 'Control access, route approvals, and keep governance visible at every stage.',
      capabilities: ['Role creation', 'Permission mapping', 'Approval workflows', 'Audit-ready history'],
    },
    {
      id: 'module-collaboration',
      title: 'Sharing and collaboration',
      description: 'Share documents, collect requirements, enable signatures, and track recipient progress in one place.',
      capabilities: ['Secure recipient access', 'Shared document visibility', 'File requests', 'Comments and signatures'],
    },
    {
      id: 'module-ops',
      title: 'Admin, analytics, and AI',
      description: 'Manage analytics, integrations, APIs, admin controls, and AI-assisted review from the same workspace.',
      capabilities: ['Usage analytics', 'DoXpert AI review', 'API access', 'Integration controls'],
    },
  ],
  featureScreenshots: [
    {
      id: 'shot-dashboard',
      title: 'Dashboard overview',
      description: 'A unified view of activity, pending actions, plan signals, and workflow performance.',
      imagePath: '/screenshots/dashboard-overview.png',
    },
    {
      id: 'shot-doc-ops',
      title: 'Document workspace',
      description: 'Structured editing, metadata control, and document management in one focused view.',
      imagePath: '/screenshots/document-ops.png',
    },
    {
      id: 'shot-files',
      title: 'File Manager',
      description: 'Centralized storage for supporting files, shared assets, encrypted transfers, and managed content.',
      imagePath: '/screenshots/file-manager.png',
    },
    {
      id: 'shot-roles',
      title: 'Roles and permissions',
      description: 'Define access, responsibilities, and approval authority with admin-grade control.',
      imagePath: '/screenshots/roles-permissions.png',
    },
  ],
  heroBanners: [
    {
      id: 'hero-banner-ops',
      eyebrow: 'Workflow command center',
      title: 'Run document operations with less follow-up and better control.',
      description: 'Keep generation, approvals, collaboration, and delivery inside one polished workspace.',
      imagePath: '/screenshots/document-ops.png',
    },
    {
      id: 'hero-banner-analytics',
      eyebrow: 'Operational visibility',
      title: 'Give teams a dashboard that shows progress, bottlenecks, and next actions clearly.',
      description: 'Surface the signals that matter without overwhelming users with noise.',
      imagePath: '/screenshots/dashboard-overview.png',
    },
    {
      id: 'hero-banner-governance',
      eyebrow: 'Approvals and governance',
      title: 'Keep controls strong while making every document experience feel modern and trustworthy.',
      description: 'Balance admin control, branded delivery, and clean approval journeys across devices.',
      imagePath: '/screenshots/admin-panel.png',
    },
  ],
  audienceProfiles: [
    {
      id: 'audience-ops',
      businessType: 'Operations teams',
      usage: 'Run daily document generation, approvals, file collection, and tracked delivery from one workspace.',
      benefit: 'Reduce delays, remove follow-up chaos, and keep every important step visible.',
    },
    {
      id: 'audience-hr',
      businessType: 'HR and people teams',
      usage: 'Handle offer letters, onboarding packs, employee forms, and signature workflows with less manual effort.',
      benefit: 'Deliver a smoother employee experience while reducing repetitive coordination.',
    },
    {
      id: 'audience-legal',
      businessType: 'Legal and compliance teams',
      usage: 'Manage contracts, notices, reviews, and controlled approval cycles from one governed system.',
      benefit: 'Protect turnaround time while keeping access, evidence, and accountability intact.',
    },
    {
      id: 'audience-finance',
      businessType: 'Finance and procurement teams',
      usage: 'Handle vendor paperwork, approvals, compliance packs, and renewals with stronger process visibility.',
      benefit: 'Improve audit readiness and reduce delays caused by fragmented files and email trails.',
    },
  ],
  pricingPlans: [
    {
      id: 'workspace-trial',
      name: 'docrud Workspace Trial',
      priceLabel: 'Free for 30 days',
      description: 'A login-based free trial that opens admin-enabled non-AI features immediately and gives a few AI tries to build product habit before upgrade.',
      highlights: ['30-day workspace access', 'Admin-enabled non-AI features', 'A few AI tries free', 'Smooth upgrade path'],
    },
    {
      id: 'workspace-pro',
      name: 'docrud Workspace Pro',
      priceLabel: '₹299 / month',
      description: 'One practical monthly plan for teams that want the full docrud experience with sustainable AI credits and every major feature unlocked.',
      highlights: ['Full feature access', '300 monthly AI credits', 'Recurring Razorpay billing', 'Smooth upgrade journey'],
    },
    {
      id: 'workspace-build-your-own',
      name: 'Build Your Own Workspace',
      priceLabel: 'Custom monthly pricing',
      description: 'A tailored monthly workspace for teams that want selected features, deeper AI, or higher operating capacity on recurring billing.',
      highlights: ['Feature-based pricing', 'Custom AI allowance', 'Capacity-based monthly billing', 'Recurring tailored plan'],
    },
  ],
  enabledSections: {
    hero: true,
    audiences: true,
    snapshot: true,
    softwareModules: true,
    screenshots: true,
    pricing: true,
    demo: true,
    contact: true,
  },
};

export async function getMailSettings() {
  const settings = getDbPool()
    ? await getSettingsValueFromRepository<Partial<MailSettings>>('mail', 'smtp', defaultMailSettings)
    : await readJsonFile<Partial<MailSettings>>(mailSettingsPath, defaultMailSettings);
  const merged = { ...defaultMailSettings, ...settings };
  // Coerce types — stored values may be strings from old form submissions
  return {
    ...merged,
    port: Number(merged.port) || defaultMailSettings.port,
    secure: merged.secure === true || String(merged.secure) === 'true',
    requireAuth: merged.requireAuth === true || String(merged.requireAuth) === 'true',
  };
}

function mergeAuthSettings(partial: Partial<AuthSettings>): AuthSettings {
  return {
    ...defaultAuthSettings,
    googleEnabled: Boolean(partial.googleEnabled),
    googleClientId: partial.googleClientId || process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecret: partial.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET || '',
    aadhaarVerificationEnabled: Boolean(partial.aadhaarVerificationEnabled),
    aadhaarProviderLabel: partial.aadhaarProviderLabel?.trim() || defaultAuthSettings.aadhaarProviderLabel,
    aadhaarApiBaseUrl: partial.aadhaarApiBaseUrl?.trim() || process.env.AADHAAR_API_BASE_URL || '',
    aadhaarOtpRequestPath: partial.aadhaarOtpRequestPath?.trim() || defaultAuthSettings.aadhaarOtpRequestPath,
    aadhaarOtpVerifyPath: partial.aadhaarOtpVerifyPath?.trim() || defaultAuthSettings.aadhaarOtpVerifyPath,
    aadhaarClientId: partial.aadhaarClientId?.trim() || process.env.AADHAAR_CLIENT_ID || '',
    aadhaarClientSecret: partial.aadhaarClientSecret?.trim() || process.env.AADHAAR_CLIENT_SECRET || '',
    aadhaarApiKey: partial.aadhaarApiKey?.trim() || process.env.AADHAAR_API_KEY || '',
    aadhaarAuaCode: partial.aadhaarAuaCode?.trim() || process.env.AADHAAR_AUA_CODE || '',
    aadhaarSubAuaCode: partial.aadhaarSubAuaCode?.trim() || process.env.AADHAAR_SUB_AUA_CODE || '',
    aadhaarLicenseKey: partial.aadhaarLicenseKey?.trim() || process.env.AADHAAR_LICENSE_KEY || '',
    aadhaarEnvironment: partial.aadhaarEnvironment === 'production' ? 'production' : 'sandbox',
  };
}

export async function getAuthSettings(): Promise<AuthSettings> {
  if (_authSettingsCache && _authSettingsCacheExpiresAt > Date.now()) {
    return _authSettingsCache;
  }

  const partial = getDbPool()
    ? await getSettingsValueFromRepository<Partial<AuthSettings>>('auth', 'settings', defaultAuthSettings)
    : await readJsonFile<Partial<AuthSettings>>(authSettingsPath, defaultAuthSettings);

  const result = mergeAuthSettings(partial || {});
  _authSettingsCache = result;
  _authSettingsCacheExpiresAt = Date.now() + AUTH_SETTINGS_TTL_MS;
  return result;
}

export async function saveAuthSettings(settings: AuthSettings) {
  invalidateAuthSettingsCache();
  const payload = {
    googleEnabled: Boolean(settings.googleEnabled),
    googleClientId: settings.googleClientId.trim(),
    googleClientSecret: settings.googleClientSecret.trim(),
    aadhaarVerificationEnabled: Boolean(settings.aadhaarVerificationEnabled),
    aadhaarProviderLabel: settings.aadhaarProviderLabel.trim(),
    aadhaarApiBaseUrl: settings.aadhaarApiBaseUrl.trim(),
    aadhaarOtpRequestPath: settings.aadhaarOtpRequestPath.trim(),
    aadhaarOtpVerifyPath: settings.aadhaarOtpVerifyPath.trim(),
    aadhaarClientId: settings.aadhaarClientId.trim(),
    aadhaarClientSecret: settings.aadhaarClientSecret.trim(),
    aadhaarApiKey: settings.aadhaarApiKey.trim(),
    aadhaarAuaCode: settings.aadhaarAuaCode.trim(),
    aadhaarSubAuaCode: settings.aadhaarSubAuaCode.trim(),
    aadhaarLicenseKey: settings.aadhaarLicenseKey.trim(),
    aadhaarEnvironment: settings.aadhaarEnvironment === 'production' ? 'production' : 'sandbox',
  };
  if (getDbPool()) {
    await saveSettingsValueToRepository('auth', 'settings', payload);
    return;
  }
  await writeJsonFile(authSettingsPath, payload);
}

/** Synchronous read — returns the in-memory cache if warm, otherwise falls back to env vars only (no file I/O). Call getAuthSettings() first to populate the cache with DB/file values. */
export function getAuthSettingsSync(): AuthSettings {
  if (_authSettingsCache && _authSettingsCacheExpiresAt > Date.now()) {
    return _authSettingsCache;
  }
  // Return env-var-based defaults — no synchronous file or DB read.
  return mergeAuthSettings({});
}

export async function saveMailSettings(settings: MailSettings) {
  if (getDbPool()) {
    await saveSettingsValueToRepository('mail', 'smtp', settings);
    return;
  }
  await writeJsonFile(mailSettingsPath, settings);
}

export async function getAutomationSettings() {
  const settings = getDbPool()
    ? await getSettingsValueFromRepository<Partial<WorkflowAutomationSettings>>('automation', 'workflow', defaultAutomationSettings)
    : await readJsonFile<Partial<WorkflowAutomationSettings>>(automationSettingsPath, defaultAutomationSettings);
  return { ...defaultAutomationSettings, ...settings };
}

export async function saveAutomationSettings(settings: WorkflowAutomationSettings) {
  if (getDbPool()) {
    await saveSettingsValueToRepository('automation', 'workflow', settings);
    return;
  }
  await writeJsonFile(automationSettingsPath, settings);
}

export async function getSignatureSettings() {
  const settings = getDbPool()
    ? await getSettingsValueFromRepository<Partial<SignatureSettings>>('signature', 'registry', defaultSignatureSettings)
    : await readJsonFile<Partial<SignatureSettings>>(signatureSettingsPath, defaultSignatureSettings);
  return { ...defaultSignatureSettings, ...settings };
}

export async function saveSignatureSettings(settings: SignatureSettings) {
  if (getDbPool()) {
    await saveSettingsValueToRepository('signature', 'registry', settings);
    return;
  }
  await writeJsonFile(signatureSettingsPath, settings);
}

export async function getCollaborationSettings() {
  const settings = getDbPool()
    ? await getSettingsValueFromRepository<Partial<CollaborationSettings>>('collaboration', 'default', defaultCollaborationSettings)
    : await readJsonFile<Partial<CollaborationSettings>>(collaborationSettingsPath, defaultCollaborationSettings);
  return { ...defaultCollaborationSettings, ...settings };
}

export async function saveCollaborationSettings(settings: CollaborationSettings) {
  if (getDbPool()) {
    await saveSettingsValueToRepository('collaboration', 'default', settings);
    return;
  }
  await writeJsonFile(collaborationSettingsPath, settings);
}

let _themeCache: ThemeSettings | null = null;
let _themeCacheExpiresAt = 0;
const THEME_CACHE_TTL_MS = 60_000;

export async function getThemeSettings(): Promise<ThemeSettings> {
  if (_themeCache && _themeCacheExpiresAt > Date.now()) return _themeCache;

  const settings = getDbPool()
    ? await getSettingsValueFromRepository<Partial<ThemeSettings>>('theme', 'active', defaultThemeSettings)
    : await readJsonFile<Partial<ThemeSettings>>(themeSettingsPath, defaultThemeSettings);
  const result: ThemeSettings = {
    ...defaultThemeSettings,
    ...settings,
    softwareName: !settings.softwareName || settings.softwareName === 'Corescent Document Generator' ? defaultThemeSettings.softwareName : settings.softwareName,
    accentLabel: !settings.accentLabel || settings.accentLabel === 'Enterprise Workflow Suite' ? defaultThemeSettings.accentLabel : settings.accentLabel,
  };
  _themeCache = result;
  _themeCacheExpiresAt = Date.now() + THEME_CACHE_TTL_MS;
  return result;
}

export async function saveThemeSettings(settings: ThemeSettings) {
  _themeCache = null;
  _themeCacheExpiresAt = 0;
  if (getDbPool()) {
    await saveSettingsValueToRepository('theme', 'active', settings);
    return;
  }
  await writeJsonFile(themeSettingsPath, settings);
}

export async function getLandingSettings() {
  const settings = getDbPool()
    ? await getSettingsValueFromRepository<Partial<LandingSettings>>('landing', 'homepage', defaultLandingSettings)
    : await readJsonFile<Partial<LandingSettings>>(landingSettingsPath, defaultLandingSettings);
  return {
    ...defaultLandingSettings,
    ...settings,
    featureHighlights: Array.isArray(settings.featureHighlights) && settings.featureHighlights.length ? settings.featureHighlights : defaultLandingSettings.featureHighlights,
    gettingStartedSteps: Array.isArray(settings.gettingStartedSteps) && settings.gettingStartedSteps.length ? settings.gettingStartedSteps : defaultLandingSettings.gettingStartedSteps,
    demoBenefits: Array.isArray(settings.demoBenefits) && settings.demoBenefits.length ? settings.demoBenefits : defaultLandingSettings.demoBenefits,
    socialProofItems: Array.isArray(settings.socialProofItems) && settings.socialProofItems.length ? settings.socialProofItems : defaultLandingSettings.socialProofItems,
    featureCards: Array.isArray(settings.featureCards) && settings.featureCards.length ? settings.featureCards : defaultLandingSettings.featureCards,
    stats: Array.isArray(settings.stats) && settings.stats.length ? settings.stats : defaultLandingSettings.stats,
    softwareModules: Array.isArray(settings.softwareModules) && settings.softwareModules.length ? settings.softwareModules : defaultLandingSettings.softwareModules,
    featureScreenshots: Array.isArray(settings.featureScreenshots) && settings.featureScreenshots.length ? settings.featureScreenshots : defaultLandingSettings.featureScreenshots,
    heroBanners: Array.isArray(settings.heroBanners) && settings.heroBanners.length ? settings.heroBanners : defaultLandingSettings.heroBanners,
    audienceProfiles: Array.isArray(settings.audienceProfiles) && settings.audienceProfiles.length ? settings.audienceProfiles : defaultLandingSettings.audienceProfiles,
    pricingPlans: Array.isArray(settings.pricingPlans) && settings.pricingPlans.length ? settings.pricingPlans : defaultLandingSettings.pricingPlans,
    enabledSections: {
      ...defaultLandingSettings.enabledSections,
      ...(settings.enabledSections || {}),
    },
  };
}

export async function saveLandingSettings(settings: LandingSettings) {
  if (getDbPool()) {
    await saveSettingsValueToRepository('landing', 'homepage', settings);
    return;
  }
  await writeJsonFile(landingSettingsPath, settings);
}

/* ── Top-navigation announcement ─────────────────────────────────────────────
   Stored through the same settings_store repository as every other admin
   setting (scope `announcement`, key `nav`) rather than introducing a second
   configuration system. */

export const defaultNavAnnouncementSettings: NavAnnouncementSettings = {
  enabled: true,
  text: 'Complete your profile 100%, Unlock 365 days of Premium for Free.',
  href: '/profile',
  updatedAt: '',
  updatedBy: '',
};

export async function getNavAnnouncementSettings(): Promise<NavAnnouncementSettings> {
  const settings = getDbPool()
    ? await getSettingsValueFromRepository<Partial<NavAnnouncementSettings>>('announcement', 'nav', defaultNavAnnouncementSettings)
    : await readJsonFile<Partial<NavAnnouncementSettings>>(navAnnouncementSettingsPath, defaultNavAnnouncementSettings);

  const merged = { ...defaultNavAnnouncementSettings, ...settings };
  return {
    // A stored `false` must survive the merge, so coerce rather than `||`.
    enabled: merged.enabled !== false,
    text: typeof merged.text === 'string' && merged.text.trim()
      ? merged.text.trim()
      : defaultNavAnnouncementSettings.text,
    href: typeof merged.href === 'string' ? merged.href.trim() : '',
    updatedAt: merged.updatedAt || '',
    updatedBy: merged.updatedBy || '',
  };
}

export async function saveNavAnnouncementSettings(settings: NavAnnouncementSettings) {
  const payload: NavAnnouncementSettings = {
    enabled: Boolean(settings.enabled),
    text: settings.text.trim(),
    href: settings.href.trim(),
    updatedAt: settings.updatedAt,
    updatedBy: settings.updatedBy,
  };
  if (getDbPool()) {
    await saveSettingsValueToRepository('announcement', 'nav', payload);
    return;
  }
  await writeJsonFile(navAnnouncementSettingsPath, payload);
}
