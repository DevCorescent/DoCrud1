export interface DocumentField {
  id: string;
  name: string;
  label: string;
  type: 'text' | 'date' | 'textarea' | 'number' | 'email' | 'select' | 'tel' | 'url' | 'checkbox' | 'radio' | 'image';
  required: boolean;
  options?: string[]; // For select fields
  placeholder?: string;
  order: number;
}

import type { DocumentDesignPreset } from '@/lib/document-designs';

export interface FormMediaSlide {
  id: string;
  imageUrl: string;
  title?: string;
  description?: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

export interface FormCtaButton {
  id: string;
  label: string;
  url?: string;
  type?: 'link' | 'whatsapp';
}

export interface FormBanner {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

export interface FormAppearance {
  eyebrow?: string;
  heroTitle?: string;
  heroDescription?: string;
  introNote?: string;
  footerNote?: string;
  submitLabel?: string;
  successMessage?: string;
  surfaceTone?: 'slate' | 'amber' | 'emerald' | 'sky' | 'rose';
  cardStyle?: 'soft' | 'outlined' | 'glass';
  buttonStyle?: 'solid' | 'outline';
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  showFieldTypes?: boolean;
  showOptionChips?: boolean;
  mediaSlides?: FormMediaSlide[];
  ctaButtons?: FormCtaButton[];
  whatsappNumber?: string;
  whatsappMessage?: string;
  banners?: FormBanner[];
  allowSingleEditAfterSubmit?: boolean;
  showSubmissionHistory?: boolean;
  heroAlignment?: 'left' | 'center';
  fieldColumns?: 1 | 2;
  submitButtonWidth?: 'full' | 'fit';
  thankYouRedirectUrl?: string;
}

export interface DocumentTemplate {
  id: string;
  name: string;
  description?: string;
  category: string;
  fields: DocumentField[];
  template: string; // HTML string with {{fieldName}}
  isCustom: boolean;
  /**
   * Optional rendering preferences for custom templates.
   * These are intentionally "soft" defaults so older templates continue to work.
   */
  renderSettings?: {
    pageSize?: 'A4' | 'Letter' | 'Legal' | 'Custom';
    pageWidthMm?: number;
    pageHeightMm?: number;
    pageMarginMm?: number;
    pageNumbersEnabled?: boolean;
    /**
     * Applied as the CSS `background` value on the rendered `.page` element for custom templates.
     * Examples: "#ffffff", "linear-gradient(...)", "#fff url(data:image/png;base64,...) center/cover no-repeat".
     */
    pageBackgroundCss?: string;
  };
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
  organizationId?: string;
  organizationName?: string;
  formAppearance?: FormAppearance;
}

export interface User {
  id: string;
  email: string;
  loginId?: string;
  name: string;
  role: string;
  permissions: string[]; // Array of template IDs or 'all'
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
  roleProfileId?: string;
  roleProfileName?: string;
  organizationId?: string;
  organizationName?: string;
  organizationDomain?: string;
  accountType?: 'business' | 'individual';
  referralCode?: string;
  referredByCode?: string;
  referredByUserId?: string;
  referralBonusActivatedAt?: string;
  safety?: {
    scamWarning?: boolean;
    scamWarningLabel?: string;
    scamReportId?: string;
    scamEvidence?: Array<{ name: string; dataUrl: string }>;
    flaggedAt?: string;
    suspendedUntil?: string;
  };
  subscription?: SaasSubscription;
  createdFromSignup?: boolean;
  invitedByUserId?: string;
  invitedByEmail?: string;
  inviteStatus?: 'pending' | 'active' | 'disabled';
  lastActivityAt?: string;
  workspaceAccessMode?: 'standard' | 'board_room_only';
  boardRoomIds?: string[];
  policyAcceptance?: {
    version: string;
    acceptedAt: string;
    via: 'login' | 'business_signup' | 'individual_signup' | 'admin_created';
    requiredPolicyIds: string[];
    ipAddress?: string;
  };
  /** Account deactivation / scheduled deletion */
  deactivatedAt?: string;           // ISO — when the user deactivated
  deactivationDeadline?: string;    // ISO — auto-delete after this date (null = no deadline)
  deactivationWarningEmailSentAt?: string; // ISO — when the 1-week warning was sent
  pendingDeletion?: boolean;        // true once a deletion has been confirmed via OTP
  /** Email notification opt-in/out per category. Missing key = default ON (except profile_view/document_viewed). */
  emailPreferences?: {
    follows?: boolean;
    likes?: boolean;
    comments?: boolean;
    mentions?: boolean;
    gig_applied?: boolean;
    messages?: boolean;
    billing?: boolean;
    system?: boolean;
  };
}

export type FileTransferAuthMode = 'public' | 'password' | 'email' | 'password_and_email' | 'triple_password';

export type SaasPlanAudience = 'business' | 'individual';

export type SaasFeatureKey =
  | 'dashboard'
  | 'document_summary'
  | 'generate_documents'
  | 'history'
  | 'client_portal'
  | 'tutorials'
  | 'talent_directory'
  | 'gigs'
  | 'doxpert'
  | 'analytics'
  | 'file_manager'
  | 'roles_permissions'
  | 'approvals'
  | 'versions'
  | 'clauses'
  | 'audit'
  | 'bulk_ops'
  | 'renewals'
  | 'integrations'
  | 'organizations'
  | 'ai_copilot'
  | 'api_docs'
  | 'branding'
  | 'team_workspace'
  | 'deal_room'
  | 'hiring_desk'
  | 'docrudians'
  | 'virtual_id'
  | 'e_certificates'
  | 'editable_sheet_shares'
  | 'document_encrypter';

export type PlatformFeatureControlKey =
  | SaasFeatureKey
  | 'visualizer'
  | 'docsheet'
  | 'support'
  | 'internal_mailbox'
  | 'qr_drop'
  | 'offline_locker'
  | 'workspace'
  | 'admin_panel';

export interface DocrudianProfile {
  id: string;
  userId: string;
  email: string;
  name: string;
  organizationId?: string;
  organizationName?: string;
  accountType?: 'business' | 'individual';
  headline: string;
  bio: string;
  location?: string;
  domain?: string;
  skills: string[];
  interests: string[];
  lookingFor: Array<'jobs' | 'clients' | 'collaborators' | 'community' | 'mentorship'>;
  badges: string[];
  links: Array<{
    id: string;
    label: string;
    url: string;
  }>;
  visibility: 'public' | 'members';
  createdAt: string;
  updatedAt: string;
}

export interface DocrudianPost {
  visibility: 'public' | 'members';
  attachments: DocrudianAttachment[];
  id: string;
  roomId?: string;
  authorUserId: string;
  authorName: string;
  authorHeadline?: string;
  organizationId?: string;
  organizationName?: string;
  title: string;
  content: string;
  category: 'win' | 'help' | 'showcase' | 'idea' | 'collab';
  tags: string[];
  createdAt: string;
}

export interface DocrudianAttachment {
  id: string;
  type: 'image' | 'document' | 'link';
  name: string;
  url: string;
  mimeType?: string;
  sizeLabel?: string;
  shareUrl?: string;
  qrUrl?: string;
}

export interface DocrudianRoomActivity {
  id: string;
  type: 'view' | 'join' | 'file_open' | 'download' | 'share';
  createdAt: string;
  actorName?: string;
  actorUserId?: string;
  resourceId?: string;
  resourceName?: string;
  note?: string;
}

export interface DocrudianCircle {
  id: string;
  ownerUserId: string;
  ownerName: string;
  organizationId?: string;
  slug?: string;
  title: string;
  description: string;
  category: 'campus' | 'founders' | 'freelance' | 'builders' | 'operators' | 'hiring' | 'developers' | 'students' | 'colleges' | 'events';
  visibility: 'public' | 'private';
  coverImageUrl?: string;
  tags?: string[];
  useCase?: 'developer' | 'student' | 'college' | 'event' | 'startup' | 'team';
  featureFlags?: Array<'compression' | 'announcements' | 'resources' | 'invite_link' | 'submissions'>;
  shareLink?: string;
  accessCode?: string;
  memberUserIds: string[];
  joinRequests?: string[];
  resources?: DocrudianAttachment[];
  activity?: DocrudianRoomActivity[];
  createdAt: string;
  updatedAt: string;
}

export interface DocrudianOpportunity {
  visibility: 'public' | 'members';
  id: string;
  createdByUserId: string;
  createdByName: string;
  organizationId?: string;
  organizationName?: string;
  title: string;
  type: 'job' | 'gig' | 'collab' | 'mentor' | 'event';
  summary: string;
  skills: string[];
  location?: string;
  link?: string;
  status: 'open' | 'closed';
  createdAt: string;
  updatedAt: string;
}

export interface DocrudiansWorkspaceData {
  profile: DocrudianProfile | null;
  profiles: DocrudianProfile[];
  posts: DocrudianPost[];
  circles: DocrudianCircle[];
  opportunities: DocrudianOpportunity[];
  stats: {
    members: number;
    posts: number;
    circles: number;
    opportunities: number;
    matchingCircles: number;
    privateRooms?: number;
    publicRooms?: number;
    sharedResources?: number;
  };
}

export interface VirtualIdAnalyticsEvent {
  id: string;
  type: 'open' | 'scan' | 'download';
  createdAt: string;
  source?: 'direct' | 'qr' | 'download';
  visitorKey?: string;
  userAgent?: string;
}

export interface VirtualIdCard {
  id: string;
  ownerUserId: string;
  ownerEmail: string;
  ownerName: string;
  organizationId?: string;
  organizationName?: string;
  title: string;
  headline?: string;
  bio?: string;
  avatarUrl?: string;
  company?: string;
  department?: string;
  roleLabel?: string;
  phone?: string;
  website?: string;
  location?: string;
  socialLinks?: Array<{
    id: string;
    label: string;
    url: string;
  }>;
  skills?: string[];
  highlights?: string[];
  theme?: 'slate' | 'amber' | 'emerald' | 'sky' | 'rose';
  visibility: 'public' | 'private';
  slug: string;
  qrUrl: string;
  createdAt: string;
  updatedAt: string;
  analytics: {
    openCount: number;
    scanCount: number;
    downloadCount: number;
    uniqueVisitors: number;
    lastOpenedAt?: string;
    lastScannedAt?: string;
    lastDownloadedAt?: string;
    topSource?: string;
  };
  events: VirtualIdAnalyticsEvent[];
}

export interface CertificateAnalyticsEvent {
  id: string;
  type: 'open' | 'download' | 'verify';
  createdAt: string;
  source?: 'direct' | 'qr' | 'download';
  visitorKey?: string;
  userAgent?: string;
}

export interface CertificateRecord {
  id: string;
  ownerUserId: string;
  ownerEmail: string;
  ownerName: string;
  organizationId?: string;
  organizationName?: string;
  name: string;
  recipientName: string;
  recipientEmail?: string;
  credentialId: string;
  issueDate: string;
  expiryDate?: string;
  certificateTitle: string;
  subtitle?: string;
  description?: string;
  issuerName: string;
  signatoryName?: string;
  signatoryRole?: string;
  logoUrl?: string;
  logoUrls?: string[];
  signatureUrl?: string;
  signatureImageUrls?: string[];
  signatureDrawnDataUrl?: string;
  backgroundImageUrl?: string;
  accentColor?: string;
  textColor?: string;
  layout?: 'classic' | 'modern' | 'spotlight';
  includeDocrudWatermark?: boolean;
  status: 'draft' | 'published';
  slug: string;
  qrUrl: string;
  createdAt: string;
  updatedAt: string;
  analytics: {
    openCount: number;
    downloadCount: number;
    verifyCount: number;
    uniqueVisitors: number;
    lastOpenedAt?: string;
    lastDownloadedAt?: string;
    lastVerifiedAt?: string;
  };
  events: CertificateAnalyticsEvent[];
}

export interface HiringJobPosting {
  id: string;
  organizationId: string;
  organizationName: string;
  createdByUserId: string;
  createdByEmail: string;
  title: string;
  department?: string;
  location?: string;
  employmentType?: 'full_time' | 'part_time' | 'contract' | 'internship' | 'freelance';
  workMode?: 'remote' | 'hybrid' | 'onsite';
  experienceLevel?: 'entry' | 'associate' | 'mid' | 'senior' | 'lead';
  description: string;
  responsibilities: string[];
  requirements: string[];
  preferredSkills: string[];
  targetRoleKeywords: string[];
  minimumAtsScore: number;
  status: 'draft' | 'published' | 'closed';
  shareUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HiringJobApplication {
  id: string;
  jobId: string;
  organizationId: string;
  organizationName: string;
  jobTitle: string;
  candidateUserId: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone?: string;
  atsScore: number;
  targetRole?: string;
  resumeText: string;
  resumeFileName?: string;
  analysisSummary: string;
  analysisDetails?: {
    executiveSummary: string;
    recruiterImpression: string;
    strengths: string[];
    improvementAreas: string[];
    missingSignals: string[];
    roleMatches: Array<{ role: string; score: number; why: string }>;
    companyMatches: Array<{ companyType: string; score: number; why: string }>;
    sectionScores: {
      structure: number;
      impact: number;
      skillsDepth: number;
      readability: number;
      trustSignals: number;
    };
    applicationRiskLevel?: 'low' | 'medium' | 'high';
    roleAlignmentSummary?: string;
  };
  status: 'submitted' | 'reviewing' | 'shortlisted' | 'rejected' | 'hired';
  appliedAt: string;
  updatedAt: string;
}

export interface GigListing {
  id: string;
  slug: string;
  ownerUserId: string;
  ownerName: string;
  ownerEmail: string;
  organizationId?: string;
  organizationName?: string;
  title: string;
  summary: string;
  category: string;
  interests: string[];
  skills: string[];
  deliverables: string[];
  budgetLabel: string;
  timelineLabel?: string;
  engagementType: 'one_time' | 'ongoing' | 'retainer';
  locationPreference: 'remote' | 'hybrid' | 'onsite';
  contactPreference: 'chat' | 'email' | 'whatsapp' | 'call';
  visibility: 'public' | 'private';
  status: 'draft' | 'published' | 'paused' | 'closed';
  urgent?: boolean;
  urgentUntil?: string;
  urgentPayment?: {
    provider: 'razorpay';
    orderId: string;
    paymentId?: string;
    signature?: string;
    amountInPaise: number;
    currency: 'INR';
    purchasedAt: string;
    durationDays: number;
  };
  bidMode?: 'fixed' | 'bidding';
  bidRules?: {
    currency: 'INR';
    minBidInRupees?: number;
    allowCounterOffer?: boolean;
    bidDeadlineAt?: string;
  };
  connectCount: number;
  acceptedBid?: {
    bidId: string;
    bidderUserId: string;
    bidderName: string;
    bidderEmail: string;
    acceptedAt: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface GigConnectionRequest {
  id: string;
  gigId: string;
  gigSlug: string;
  gigTitle: string;
  ownerUserId: string;
  requesterUserId: string;
  requesterName: string;
  requesterEmail: string;
  requesterOrganization?: string;
  requesterHeadline?: string;
  interestArea?: string;
  portfolioUrl?: string;
  note: string;
  status: 'new' | 'reviewed' | 'contacted' | 'closed';
  createdAt: string;
  updatedAt: string;
}

export interface GigBid {
  id: string;
  gigId: string;
  gigSlug: string;
  gigTitle: string;
  ownerUserId: string;
  bidderUserId: string;
  bidderName: string;
  bidderEmail: string;
  bidderOrganization?: string;
  amountInRupees: number;
  currency: 'INR';
  timelineLabel?: string;
  note: string;
  status: 'submitted' | 'shortlisted' | 'accepted' | 'rejected' | 'withdrawn';
  createdAt: string;
  updatedAt: string;
}

export interface SaasPlan {
  id: string;
  name: string;
  description: string;
  priceLabel: string;
  amountInPaise?: number;
  targetAudience?: SaasPlanAudience;
  billingModel: 'free' | 'payg' | 'subscription' | 'custom';
  includedFeatures: SaasFeatureKey[];
  freeDocumentGenerations: number;
  maxDocumentGenerations: number;
  monthlyAiCredits?: number;
  freeAiRuns?: number;
  overagePriceLabel?: string;
  maxInternalUsers?: number;
  maxMailboxThreads?: number;
  maxTalentConnectsPerCycle?: number;
  maxGigProposalsPerCycle?: number;
  // Template Marketplace publishing quota. Drafting templates stays available after login,
  // but publishing templates into the public marketplace is capped by plan.
  maxMarketplaceTemplatePublishes?: number;
  watermarkOnFreeGenerations: boolean;
  isPublic: boolean;
  isDefault: boolean;
  active: boolean;
  ctaLabel?: string;
  createdAt: string;
  updatedAt: string;
}

export type TemplateMarketplaceStatus = 'draft' | 'published' | 'archived';

export type TemplateMarketplaceCurrency = 'INR';

export type TemplateMarketplaceItem = {
  id: string;
  templateSnapshot: DocumentTemplate;
  sellerUserId: string;
  sellerName?: string;
  sellerEmail?: string;
  priceInPaise: number;
  currency: TemplateMarketplaceCurrency;
  tags: string[];
  status: TemplateMarketplaceStatus;
  coverImageDataUrl?: string;
  // Optional example data used for marketplace previews. When present, it is rendered with an EXAMPLE watermark.
  exampleData?: Record<string, string>;
  // Rendered preview pages as PNG data URLs (generated automatically on publish). Used to show
  // a full-page preview at a glance on mobile without iframe scrolling.
  previewImageDataUrls?: string[];
  // Internal version to regenerate previews when rendering logic changes.
  previewRenderVersion?: number;
  createdAt: string;
  updatedAt: string;
  purchaseCount: number;
  openCount?: number;
};

export type TemplateMarketplacePurchase = {
  id: string;
  buyerUserId: string;
  buyerEmail?: string;
  itemId: string;
  amountInPaise: number;
  currency: TemplateMarketplaceCurrency;
  status: 'created' | 'paid' | 'failed';
  razorpay: {
    orderId?: string;
    paymentId?: string;
    signature?: string;
  };
  installedTemplateId?: string;
  createdAt: string;
  updatedAt: string;
};

export type TemplateMarketplaceReview = {
  id: string;
  itemId: string;
  buyerUserId: string;
  buyerName?: string;
  rating: 1 | 2 | 3 | 4 | 5;
  title?: string;
  body?: string;
  createdAt: string;
};

export type TemplateMarketplaceIncomeRecord = {
  id: string;
  itemId: string;
  sellerUserId: string;
  sellerEmail?: string;
  buyerUserId: string;
  purchaseId: string;
  currency: TemplateMarketplaceCurrency;
  grossAmountInPaise: number;
  commissionRate: number; // 0.25
  commissionAmountInPaise: number;
  sellerNetAmountInPaise: number;
  status: 'pending' | 'paid_out' | 'void';
  createdAt: string;
};

export type TemplateMarketplaceWithdrawalStatus = 'requested' | 'approved' | 'paid' | 'rejected' | 'cancelled';

export type TemplateMarketplaceWithdrawal = {
  id: string;
  sellerUserId: string;
  sellerEmail?: string;
  currency: TemplateMarketplaceCurrency;
  amountInPaise: number;
  status: TemplateMarketplaceWithdrawalStatus;
  payoutMethod: {
    label: string; // e.g. "UPI", "Bank transfer", "PayPal", "Any"
    details: string; // free-form; user provided
  };
  adminNote?: string;
  transactionRef?: string; // UTR / txn id set by admin
  requestedAt: string;
  reviewedAt?: string;
  paidAt?: string;
  updatedAt: string;
};

export interface CustomPlanConfiguration {
  source?: 'pricing_builder';
  basePlanId: string;
  featureKeys: SaasFeatureKey[];
  maxDocumentGenerations?: number;
  maxInternalUsers?: number;
  maxMailboxThreads?: number;
  monthlyAiCredits?: number;
  estimatedMonthlySubtotalInPaise?: number;
  estimatedMonthlyTotalInPaise?: number;
}

export interface SaasSubscription {
  planId: string;
  planName: string;
  status: 'trial' | 'active' | 'upgrade_required' | 'suspended';
  startedAt: string;
  billingProvider?: 'razorpay';
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  renewalDate?: string;
  lastPaymentAt?: string;
  lastOrderId?: string;
  roadmapPromoCampaignId?: string;
  roadmapPromoQualifiedAt?: string;
  roadmapPromoValidUntil?: string;
  roadmapPromoLabel?: string;
  customConfiguration?: CustomPlanConfiguration;
  aiTrialLimit?: number;
  aiTrialUsed?: number;
  monthlyAiCredits?: number;
  remainingAiCredits?: number;
  aiCreditsResetAt?: string;
  talentConnectsUsed?: number;
  gigProposalsUsed?: number;
}

export interface SaasUsageSummary {
  totalGeneratedDocuments: number;
  freeGeneratedDocuments: number;
  remainingGenerations: number;
  remainingAiTrialRuns?: number;
  remainingAiCredits?: number;
  limitReached: boolean;
  thresholdState?: 'healthy' | 'watch' | 'critical' | 'limit_reached';
  thresholdPercentUsed?: number;
  cycleStartAt?: string;
  cycleEndAt?: string;
}

export interface BillingTransaction {
  id: string;
  userId: string;
  userEmail: string;
  userName?: string;
  organizationId?: string;
  organizationName?: string;
  accountType?: 'business' | 'individual';
  productType?: string;
  productLabel?: string;
  planId?: string;
  planName?: string;
  billingModel?: 'free' | 'payg' | 'subscription' | 'custom';
  quantity?: number;
  unitAmountInPaise?: number;
  discountAmountInPaise?: number;
  couponCode?: string;
  referralCode?: string;
  gstin?: string;
  couponRedeemedAt?: string;
  referralBonusGrantedAt?: string;
  baseAmountInPaise: number;
  gstRate: number;
  gstAmountInPaise: number;
  totalAmountInPaise: number;
  amountInPaise: number;
  currency: 'INR';
  status: 'created' | 'paid' | 'failed' | 'cancelled';
  provider: 'razorpay';
  providerOrderId?: string;
  providerPaymentId?: string;
  providerSignature?: string;
  receipt: string;
  invoiceNumber?: string;
  notes?: string;
  customConfiguration?: CustomPlanConfiguration;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
}

export interface BillingOverview {
  provider: 'razorpay';
  isTestMode: boolean;
  publishableKeyAvailable: boolean;
  currentPlan?: SaasPlan | null;
  availablePlans: SaasPlan[];
  /** Docrud Infinity subscription status for the current user */
  infinity?: {
    active: boolean;
    isExpired: boolean;
    purchasedAt?: string;
    expiresAt?: string;
    period?: 'monthly' | '3m' | '6m' | 'annual';
    renewalCount?: number;
    grantedFree?: boolean;
    orderId?: string;
    paymentId?: string;
  };
  aiAllowance?: {
    remainingTrialRuns: number;
    monthlyCredits: number;
    remainingCredits: number;
    upgradeRecommended: boolean;
  };
  threshold: {
    state: 'healthy' | 'watch' | 'critical' | 'limit_reached';
    percentUsed: number;
    recommendation: string;
  };
  roadmapPromotion?: {
    campaignId: string;
    label: string;
    cutoffAt: string;
    validUntil: string;
    eligible: boolean;
    qualifiedAt?: string;
  };
  transactions: BillingTransaction[];
  testModeNotes: string[];
}

export interface SaasOverview {
  plans: SaasPlan[];
  totalBusinessAccounts: number;
  activeBusinessAccounts: number;
  upgradeRequiredAccounts: number;
  paidBusinessAccounts?: number;
  trialBusinessAccounts?: number;
  income?: {
    currency: 'INR';
    totalPaidInPaise: number;
    paid24hInPaise: number;
    paid7dInPaise: number;
    paid30dInPaise: number;
    paidTransactions: number;
    lastPaidAt?: string;
    topProducts7d?: Array<{ label: string; amountInPaise: number; transactions: number }>;
  };
  totalGeneratedDocuments: number;
  totalFileTransfers?: number;
  activeFileTransfers?: number;
  totalInternalMailboxThreads?: number;
  totalVirtualIds?: number;
  totalCertificateRecords?: number;
  totalVirtualIdScans?: number;
  totalCertificateDownloads?: number;
  totalStorageBytes?: number;
  onboardingCompletedAccounts: number;
  onboardingInProgressAccounts: number;
  onboardingCompletionRate: number;
  setupReadyAccounts: number;
  averageSetupReadiness?: number;
  policyAcceptanceRate?: number;
  recentLogins24h?: number;
  planDistribution: Array<{ planId: string; planName: string; businesses: number }>;
  industryDistribution: Array<{ industry: string; businesses: number }>;
  workspacePresetDistribution: Array<{ preset: string; businesses: number }>;
  recentSignups: Array<{
    userId: string;
    organizationName?: string;
    email: string;
    industry?: string;
    workspacePreset?: string;
    createdAt: string;
  }>;
  businessUsage: Array<{
    userId: string;
    name: string;
    email: string;
    organizationName?: string;
    industry?: string;
    companySize?: string;
    workspacePreset?: string;
    onboardingCompleted?: boolean;
    setupReadinessScore?: number;
    planId?: string;
    planName?: string;
    status?: string;
    generatedDocuments: number;
    remainingGenerations: number;
  }>;
  moduleUsage?: {
    virtualIds: {
      cards: number;
      scans: number;
      opens: number;
      downloads: number;
    };
    certificates: {
      records: number;
      opens: number;
      downloads: number;
      verifies: number;
    };
  };
  totalTeamMembers?: number;
  activeTeamMembers?: number;
  collaborationEnabledAccounts?: number;
  roadmapPromotion?: {
    campaignId: string;
    label: string;
    cutoffAt: string;
    validUntil: string;
    eligibleAccounts: number;
    activeEligibleAccounts: number;
    recentQualifiedAccounts: Array<{
      userId: string;
      organizationName?: string;
      email: string;
      qualifiedAt: string;
    }>;
  };
  platformHealth?: {
    software: {
      status: 'healthy' | 'watch' | 'critical';
      score: number;
      activeTenantRate: number;
      setupCompletionRate: number;
      recentActivityAt?: string;
      insight: string;
    };
    server: {
      status: 'healthy' | 'watch' | 'critical';
      runtime: 'database' | 'file';
      memoryUsedMb: number;
      memoryRssMb: number;
      memoryPressurePercent: number;
      nodeVersion: string;
      insight: string;
    };
    storage: {
      status: 'healthy' | 'watch' | 'critical';
      totalEstimatedBytes: number;
      largestStoreLabel: string;
      largestStoreBytes: number;
      managedFiles: number;
      insight: string;
    };
    recommendations: Array<{
      id: string;
      title: string;
      detail: string;
      priority: 'high' | 'medium' | 'low';
    }>;
  };
}

export interface DoxpertAnalysisReport {
  title: string;
  extractedContent: string;
  extractedCharacterCount: number;
  trustScore: number;
  trustNote: string;
  evidenceSignals: string[];
  summary: string;
  tone: string;
  sentiment: string;
  score: {
    overall: number;
    clarity: number;
    compliance: number;
    completeness: number;
    professionalism: number;
    riskExposure: number;
    rationale: string;
  };
  lowScoreAreas: Array<{ area: string; score: number; why: string }>;
  risks: string[];
  mitigations: string[];
  harmWarnings: string[];
  obligations?: string[];
  recommendedAdditions: string[];
  replySuggestions: string[];
  advisorReply: string;
  provider: string;
  model: string;
}

export interface DexpertMarketplaceProfile {
  id: string;
  userId: string;
  ownerType: 'individual' | 'business';
  name: string;
  headline: string;
  about: string;
  categories: string[];
  skills: string[];
  organizationName?: string;
  location?: string;
  yearsOfExperience?: number;
  rateLabel?: string;
  availability?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  contactEmail: string;
  contactPhone?: string;
  kycStatus: 'not_submitted' | 'pending' | 'verified' | 'rejected';
  kycSubmittedAt?: string;
  kycReviewedAt?: string;
  kycReviewedBy?: string;
  reviews?: DexpertReview[];
  featured: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DexpertReview {
  id: string;
  reviewerName: string;
  reviewerEmail: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface DexpertHireRequest {
  id: string;
  profileId: string;
  requesterName: string;
  requesterEmail: string;
  companyName?: string;
  workCategory: string;
  projectBrief: string;
  budgetRange?: string;
  createdAt: string;
}

export interface EmployeeCredential {
  email: string;
  temporaryPassword: string;
  generatedAt: string;
  lastSharedAt?: string;
}

export interface EmployeeQuestion {
  id: string;
  question: string;
  askedAt: string;
  askedBy: string;
  reply?: string;
  repliedAt?: string;
  repliedBy?: string;
  status: 'open' | 'resolved';
}

export interface BackgroundVerificationProfile {
  legalFullName?: string;
  preferredName?: string;
  personalEmail?: string;
  personalPhone?: string;
  alternatePhone?: string;
  dateOfBirth?: string;
  gender?: string;
  nationality?: string;
  maritalStatus?: string;
  fatherOrGuardianName?: string;
  motherName?: string;
  currentAddress?: string;
  currentAddressSince?: string;
  permanentAddress?: string;
  permanentAddressSince?: string;
  aadhaarNumber?: string;
  panNumber?: string;
  passportNumber?: string;
  voterIdNumber?: string;
  drivingLicenseNumber?: string;
  uanNumber?: string;
  pfNumber?: string;
  bankAccountHolderName?: string;
  bankAccountNumber?: string;
  bankIfscCode?: string;
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  emergencyContactPhone?: string;
  bloodGroup?: string;
  highestEducation?: string;
  institutionName?: string;
  courseName?: string;
  graduationYear?: string;
  previousEmployerName?: string;
  previousEmployerDesignation?: string;
  previousEmploymentStartDate?: string;
  previousEmploymentEndDate?: string;
  previousEmployerHrName?: string;
  previousEmployerHrEmail?: string;
  previousEmployerHrPhone?: string;
  referenceOneName?: string;
  referenceOneCompany?: string;
  referenceOnePhone?: string;
  referenceOneEmail?: string;
  referenceTwoName?: string;
  referenceTwoCompany?: string;
  referenceTwoPhone?: string;
  referenceTwoEmail?: string;
  criminalRecordDeclaration?: string;
  litigationDeclaration?: string;
  dualEmploymentDeclaration?: string;
  identityVerificationConsent?: boolean;
  addressVerificationConsent?: boolean;
  employmentVerificationConsent?: boolean;
  educationVerificationConsent?: boolean;
  criminalCheckConsent?: boolean;
  dataProcessingConsent?: boolean;
  lastUpdatedAt?: string;
}

export type OnboardingStage =
  | 'account_created'
  | 'documents_pending'
  | 'documents_submitted'
  | 'bgv_under_review'
  | 'bgv_verified'
  | 'ready_to_sign'
  | 'offer_signed'
  | 'completed';

export interface DataCollectionSubmission {
  id: string;
  submittedAt: string;
  submittedBy: string;
  data: Record<string, string>;
}

export interface DocumentHistory {
  id: string;
  shareId?: string;
  shareUrl?: string;
  referenceNumber?: string;
  documentSourceType?: 'generated' | 'uploaded_pdf';
  templateId: string;
  templateName: string;
  category?: string;
  data: Record<string, string>;
  generatedBy: string;
  generatedAt: string;
  previewHtml?: string;
  pdfUrl?: string;
  uploadedPdfFileName?: string;
  uploadedPdfMimeType?: string;
  uploadedPdfDataUrl?: string;
  signedPdfFileName?: string;
  signedPdfDataUrl?: string;
  emailSent?: boolean;
  emailTo?: string;
  emailSubject?: string;
  emailSentAt?: string;
  emailStatus?: 'pending' | 'sent' | 'failed';
  emailError?: string;
  deliveryHistory?: EmailLogEntry[];
  automationNotes?: string[];
  signatureId?: string;
  signatureName?: string;
  signatureRole?: string;
  signatureSignedAt?: string;
  signatureSignedIp?: string;
  sharePassword?: string;
  shareRequiresPassword?: boolean;
  shareAccessPolicy?: 'standard' | 'expiring' | 'one_time';
  shareExpiresAt?: string;
  maxAccessCount?: number;
  sharedSessionLabel?: string;
  revokedAt?: string;
  requiredDocumentWorkflowEnabled?: boolean;
  requiredDocuments?: string[];
  submittedDocuments?: SubmittedDocument[];
  documentsSubmittedAt?: string;
  documentsSubmittedBy?: string;
  documentsVerificationStatus?: 'not_required' | 'pending' | 'verified' | 'rejected';
  documentsVerifiedAt?: string;
  documentsVerifiedBy?: string;
  documentsVerificationNotes?: string;
  recipientSignatureRequired?: boolean;
  recipientAccess?: RecipientAccessLevel;
  dataCollectionEnabled?: boolean;
  dataCollectionStatus?: DataCollectionStatus;
  dataCollectionInstructions?: string;
  dataCollectionSubmittedAt?: string;
  dataCollectionSubmittedBy?: string;
  dataCollectionSubmissions?: DataCollectionSubmission[];
  dataCollectionReviewNotes?: string;
  dataCollectionReviewedAt?: string;
  dataCollectionReviewedBy?: string;
  recipientSignerName?: string;
  recipientSignerEmail?: string;
  recipientSignatureDataUrl?: string;
  recipientSignatureSource?: 'drawn' | 'uploaded';
  recipientSignaturePlacements?: RecipientSignaturePlacements;
  recipientSignatureBoxSummary?: {
    totalBoxes: number;
    requiredBoxes: number;
    completedBoxes: number;
    missingRequiredBoxIds?: string[];
  };
  recipientSigners?: Array<{
    signerKey: string;
    signerName: string;
    signerEmail?: string;
    signingStatus: 'pending' | 'signed';
    signedAt?: string;
    signedIp?: string;
    signedLocationLabel?: string;
    signedLatitude?: number;
    signedLongitude?: number;
    signedAccuracyMeters?: number;
    authenticationMethods?: string[];
    photoDataUrl?: string;
    photoCapturedAt?: string;
    photoCapturedIp?: string;
    photoCaptureMethod?: 'live_camera';
    consentedAt?: string;
    consentText?: string;
    signatureSource?: 'drawn' | 'uploaded';
    signatureDataUrl?: string;
    signatureBoxSummary?: {
      totalBoxes: number;
      requiredBoxes: number;
      completedBoxes: number;
      missingRequiredBoxIds?: string[];
    };
  }>;
  recipientSignatureBoxesById?: Record<string, string>;
  pendingRecipientEvidenceBySignerKey?: Record<string, {
    photoDataUrl: string;
    capturedAt: string;
    capturedIp: string;
    captureToken: string;
  }>;
  recipientSignerConfigsByKey?: Record<string, {
    cameraCaptureEnabled?: boolean;
    signatureDrawEnabled?: boolean;
    signatureUploadEnabled?: boolean;
    signatureTypedEnabled?: boolean;
    initialsEnabled?: boolean;
    emailOtpEnabled?: boolean;
    consentRequired?: boolean;
    captureIpDeviceLocationEnabled?: boolean;
  }>;
  recipientSigningMode?: 'parallel' | 'sequential';
  recipientSignerDirectory?: Record<string, {
    signerKey: string;
    signerName: string;
    signerEmail?: string;
    signerRole?: string;
    signingOrder?: number;
  }>;
  recipientSignerInvitesByKey?: Record<string, {
    token: string;
    createdAt: string;
    expiresAt: string;
    sentAt?: string;
    lastSentAt?: string;
    sendCount: number;
    lastReminderAt?: string;
    reminderCount: number;
  }>;
  recipientReminderHistory?: Array<{
    id: string;
    sentAt: string;
    sentBy: string;
    signerKey?: string;
    toEmail: string;
    status: 'queued' | 'sent' | 'failed';
    error?: string;
  }>;
  recipientSignedAt?: string;
  recipientSignedIp?: string;
  recipientPhotoDataUrl?: string;
  recipientPhotoCapturedAt?: string;
  recipientPhotoCapturedIp?: string;
  recipientPhotoCaptureMethod?: 'live_camera';
  recipientConsentedAt?: string;
  recipientConsentText?: string;
  recipientAadhaarVerificationRequired?: boolean;
  recipientAadhaarVerifiedAt?: string;
  recipientAadhaarVerifiedIp?: string;
  recipientAadhaarReferenceId?: string;
  recipientAadhaarMaskedId?: string;
  recipientAadhaarVerificationMode?: 'otp';
  recipientAadhaarProviderLabel?: string;
  pendingRecipientPhotoDataUrl?: string;
  pendingRecipientPhotoCapturedAt?: string;
  pendingRecipientPhotoCapturedIp?: string;
  pendingRecipientPhotoCaptureToken?: string;
  pendingRecipientAadhaarTransactionId?: string;
  pendingRecipientAadhaarMaskedId?: string;
  pendingRecipientAadhaarRequestedAt?: string;
  recipientSignedLocationLabel?: string;
  recipientSignedLatitude?: number;
  recipientSignedLongitude?: number;
  recipientSignedAccuracyMeters?: number;
  collaborationComments?: CollaborationComment[];
  openCount?: number;
  downloadCount?: number;
  editCount?: number;
  accessEvents?: DocumentAccessEvent[];
  docsheetShareMode?: 'view' | 'edit';
  docsheetSessionStatus?: 'active' | 'expired' | 'revoked';
  docsheetSharedWithEmail?: string;
  docsheetEditLock?: boolean;
  lastOpenedAt?: string;
  lastDownloadedAt?: string;
  lastEditedAt?: string;
  editorState?: DocumentEditorState;
  managedFiles?: ManagedFile[];
  clientName?: string;
  clientEmail?: string;
  clientOrganization?: string;
  folderLabel?: string;
  organizationId?: string;
  organizationName?: string;
  versionSnapshots?: VersionSnapshot[];
  employeeName?: string;
  employeeEmail?: string;
  employeeDepartment?: string;
  employeeDesignation?: string;
  employeeCode?: string;
  onboardingRequired?: boolean;
  backgroundVerificationRequired?: boolean;
  backgroundVerificationStatus?: 'not_started' | 'in_progress' | 'submitted' | 'under_review' | 'verified' | 'rejected';
  backgroundVerificationNotes?: string;
  backgroundVerificationVerifiedAt?: string;
  backgroundVerificationVerifiedBy?: string;
  backgroundVerificationProfile?: BackgroundVerificationProfile;
  onboardingStage?: OnboardingStage;
  onboardingProgress?: number;
  onboardingCredentials?: EmployeeCredential;
  employeeQuestions?: EmployeeQuestion[];
  superAdminLocked?: boolean;
  superAdminUnlockScope?: 'tenant_document';
  superAdminUnlockHint?: string;
  superAdminUnlockMessage?: string;
  docsheetWorkbook?: DocSheetWorkbook;
}

export type DocSheetColumnType = 'text' | 'number' | 'currency' | 'percent' | 'date';

export type DocSheetCellAlign = 'left' | 'center' | 'right';

export interface DocSheetCellFormat {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: DocSheetCellAlign;
  // Formatting is intentionally minimal for now; values are rendered in the grid,
  // and exports focus on computed/display values rather than styling.
  numberFormat?: 'auto' | 'plain' | 'currency' | 'percent' | 'date';
}

export interface DocSheetColumn {
  id: string;
  label: string;
  type: DocSheetColumnType;
  width?: number;
}

export interface DocSheetRow {
  id: string;
  values: Record<string, string>;
  height?: number;
}

export interface DocSheetSheet {
  id: string;
  name: string;
  columns: DocSheetColumn[];
  rows: DocSheetRow[];
  cellFormats?: Record<string, DocSheetCellFormat>;
  cellComments?: Record<string, Array<{ id: string; text: string; authorName?: string; createdAt: string }>>;
  sortState?: { columnId: string; direction: 'asc' | 'desc' } | null;
  filters?: Record<string, { op: 'contains' | 'equals' | 'gt' | 'lt' | 'gte' | 'lte'; value: string }>;
  conditionalRules?: Array<{
    id: string;
    columnId: string;
    op: 'contains' | 'equals' | 'gt' | 'lt' | 'gte' | 'lte';
    value: string;
    style: { bg?: string; text?: string };
    enabled?: boolean;
  }>;
  frozenColumnCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocSheetWorkbook {
  id: string;
  title: string;
  description?: string;
  currencyCode?: string;
  sheets: DocSheetSheet[];
  createdAt: string;
  updatedAt: string;
}

export interface TeamWorkspaceMember {
  id: string;
  name: string;
  email: string;
  loginId?: string;
  role: string;
  organizationId?: string;
  organizationName?: string;
  permissions: string[];
  inviteStatus: 'pending' | 'active' | 'disabled';
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
  lastActivityAt?: string;
  generatedDocuments: number;
  recentActivityLabel?: string;
}

export interface TeamWorkspaceSummary {
  planName: string;
  maxMembers: number;
  usedMembers: number;
  remainingMembers: number;
  canInvite: boolean;
  members: TeamWorkspaceMember[];
  recentActivity: Array<{
    id: string;
    actorName: string;
    action: string;
    createdAt: string;
    reference?: string;
  }>;
}

export type DealRoomStage =
  | 'draft'
  | 'shared'
  | 'under_review'
  | 'negotiation'
  | 'approval'
  | 'signed'
  | 'closed';

export interface DealRoomParticipant {
  id: string;
  userId?: string;
  name: string;
  email?: string;
  companyName?: string;
  roleType: 'owner' | 'internal' | 'external';
  accessLevel: 'viewer' | 'editor' | 'approver';
  addedAt: string;
  inviteStatus?: 'pending' | 'active' | 'disabled';
  source?: 'workspace' | 'self_registered' | 'creator_created';
}

export interface DealRoomAccessRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  requestedAccessLevel: 'viewer' | 'editor' | 'approver';
  note?: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface DealRoomLinkedAsset {
  id: string;
  assetType: 'document' | 'transfer' | 'sheet';
  assetId: string;
  title: string;
  subtitle?: string;
  href?: string;
  linkedAt: string;
}

export interface DealRoomSignDocument {
  id: string;
  historyId: string;
  shareId?: string;
  shareUrl: string;
  sharePassword: string;
  title: string;
  fileName: string;
  recipientName?: string;
  recipientEmail?: string;
  requiredDocuments: string[];
  shareAccessPolicy: 'standard' | 'expiring' | 'one_time';
  shareExpiresAt?: string;
  maxAccessCount?: number;
  status: 'drafted' | 'shared' | 'documents_pending' | 'ready_to_sign' | 'signed' | 'revoked';
  recipientSignatureRequired: boolean;
  createdAt: string;
  signedAt?: string;
  signedBy?: string;
}

export interface DealRoomTask {
  id: string;
  title: string;
  description?: string;
  status: 'open' | 'in_progress' | 'blocked' | 'done';
  ownerId?: string;
  ownerName?: string;
  dueAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DealRoomNote {
  id: string;
  body: string;
  authorId?: string;
  authorName: string;
  createdAt: string;
}

export interface DealRoomMessage {
  id: string;
  body: string;
  authorId?: string;
  authorName: string;
  authorRoleType?: 'owner' | 'internal' | 'external';
  visibility: 'all_participants' | 'internal_only';
  createdAt: string;
}

export interface DealRoomActivity {
  id: string;
  type:
    | 'created'
    | 'stage_changed'
    | 'participant_added'
    | 'participant_removed'
    | 'asset_linked'
    | 'asset_removed'
    | 'task_created'
    | 'task_updated'
    | 'note_added'
    | 'message_added'
    | 'updated';
  message: string;
  actorId?: string;
  actorName?: string;
  createdAt: string;
}

export interface DealRoom {
  id: string;
  organizationId: string;
  organizationName?: string;
  roomType: 'sales' | 'vendor' | 'partnership' | 'fundraise' | 'hiring' | 'custom';
  title: string;
  summary: string;
  counterpartyName: string;
  targetCloseDate?: string;
  stage: DealRoomStage;
  ownerUserId: string;
  ownerName: string;
  shareToken: string;
  joinPassword: string;
  shareUrl: string;
  createdAt: string;
  updatedAt: string;
  participants: DealRoomParticipant[];
  accessRequests: DealRoomAccessRequest[];
  linkedAssets: DealRoomLinkedAsset[];
  signDocuments: DealRoomSignDocument[];
  tasks: DealRoomTask[];
  messages: DealRoomMessage[];
  notes: DealRoomNote[];
  activity: DealRoomActivity[];
}

export interface DealRoomSummary {
  totalRooms: number;
  openRooms: number;
  closingSoonRooms: number;
  linkedAssets: number;
  openTasks: number;
  stageDistribution: Array<{ stage: DealRoomStage; count: number }>;
}

export interface MeetingWorkspaceParticipant {
  id: string;
  userId?: string;
  name: string;
  email?: string;
  role: 'host' | 'editor' | 'viewer';
  joinStatus: 'invited' | 'joined';
  joinedAt?: string;
}

export interface MeetingWorkspaceNote {
  id: string;
  body: string;
  authorId?: string;
  authorName: string;
  createdAt: string;
}

export interface MeetingWorkspaceActionItem {
  id: string;
  title: string;
  ownerName?: string;
  dueAt?: string;
  status: 'open' | 'done';
  createdAt: string;
}

export interface MeetingWorkspaceActivity {
  id: string;
  type: 'created' | 'participant_added' | 'note_added' | 'action_added' | 'action_updated' | 'updated';
  message: string;
  actorId?: string;
  actorName?: string;
  createdAt: string;
}

export interface MeetingWorkspaceRoom {
  id: string;
  organizationId: string;
  organizationName?: string;
  title: string;
  summary: string;
  ownerUserId: string;
  ownerName: string;
  scheduledFor?: string;
  durationMinutes?: number;
  encryptionMode: 'workspace' | 'passcode' | 'hybrid';
  roomCode: string;
  shareToken: string;
  shareUrl: string;
  agenda: string[];
  participants: MeetingWorkspaceParticipant[];
  notes: MeetingWorkspaceNote[];
  actionItems: MeetingWorkspaceActionItem[];
  aiRecap?: string;
  aiSuggestions?: string[];
  activity: MeetingWorkspaceActivity[];
  createdAt: string;
  updatedAt: string;
}

export interface MeetingWorkspaceSummary {
  totalRooms: number;
  upcomingRooms: number;
  totalParticipants: number;
  openActionItems: number;
}

export interface MeetingWorkspaceData {
  rooms: MeetingWorkspaceRoom[];
  summary: MeetingWorkspaceSummary;
  currentUserId: string;
  currentUserRole: string;
}

export interface InternalMailMessage {
  id: string;
  threadId: string;
  organizationId: string;
  senderId: string;
  senderName: string;
  senderEmail: string;
  recipientIds: string[];
  recipientEmails: string[];
  subject: string;
  body: string;
  status?: 'draft' | 'sent' | 'delivered' | 'read' | 'actioned';
  createdAt: string;
  updatedAt: string;
  readBy?: string[];
  aiSummary?: string;
  aiActionItems?: string[];
}

export interface InternalMailThread {
  id: string;
  organizationId: string;
  subject: string;
  participants: Array<{ id: string; name: string; email: string }>;
  messages: InternalMailMessage[];
  createdAt: string;
  updatedAt: string;
  lastMessagePreview?: string;
  overallStatus?: 'active' | 'awaiting_reply' | 'read' | 'actioned';
  latestAiSummary?: string;
  latestAiActionItems?: string[];
}

export interface WorkspaceNotification {
  id: string;
  type: 'mail' | 'feedback' | 'billing' | 'system' | 'follow' | 'profile_view' | 'like' | 'comment' | 'mention' | 'gig_applied' | 'document_viewed';
  title: string;
  body: string;
  href?: string;
  createdAt: string;
  read: boolean;
  tone?: 'default' | 'amber' | 'sky' | 'emerald' | 'rose';
  actorName?: string;
  actorAvatar?: string;
  actorId?: string;
  metadata?: {
    threadId?: string;
    documentId?: string;
    status?: string;
    resourceTitle?: string;
    excerpt?: string;
  };
}

export interface UserActivityEvent {
  id: string;
  userId: string;
  userEmail: string;
  userName?: string;
  role: string;
  accountType?: 'business' | 'individual';
  organizationId?: string;
  organizationName?: string;
  eventType: 'login' | 'session_start' | 'tab_view' | 'feature_action' | 'feedback_submitted' | 'admin_action';
  tabId?: string;
  featureId?: string;
  detail?: string;
  createdAt: string;
}

export interface AdminAuditEvent {
  id: string;
  actorUserId: string;
  actorEmail?: string;
  actorRole?: string;
  targetUserId?: string;
  targetEmail?: string;
  action: 'suspend' | 'unsuspend' | 'disable' | 'enable' | 'delete' | 'send_email' | 'note';
  reason?: string;
  metadata?: Record<string, string>;
  createdAt: string;
}

export interface UserFeedbackEntry {
  id: string;
  userId: string;
  userEmail: string;
  userName?: string;
  role: string;
  accountType?: 'business' | 'individual';
  organizationId?: string;
  organizationName?: string;
  rating: 1 | 2 | 3 | 4 | 5;
  summary: string;
  painPoints: string;
  requestedImprovements: string;
  mostUsedFeature?: string;
  createdAt: string;
}

export interface UserIntelligenceOverview {
  generatedAt: string;
  totals: {
    totalTrackedUsers: number;
    activeUsers24h: number;
    activeUsers7d: number;
    totalActivityEvents: number;
    totalFeedbackResponses: number;
    averageFeedbackRating: number;
    feedbackCoverageRate: number;
  };
  survey?: {
    topRequestedThemes: Array<{ label: string; count: number }>;
    topPainThemes: Array<{ label: string; count: number }>;
    recentFeedback: Array<{
      id: string;
      userId: string;
      userEmail: string;
      userName?: string;
      rating: number;
      summary: string;
      painPoints: string;
      requestedImprovements: string;
      createdAt: string;
    }>;
  };
  productHealth: {
    adoptionStatus: 'healthy' | 'watch' | 'critical';
    engagementStatus: 'healthy' | 'watch' | 'critical';
    satisfactionStatus: 'healthy' | 'watch' | 'critical';
    summary: string;
  };
  topTabs: Array<{ label: string; count: number }>;
  topFeatures: Array<{ label: string; count: number }>;
  userActivity: Array<{
    userId: string;
    userName: string;
    userEmail: string;
    role: string;
    organizationName?: string;
    lastSeenAt?: string;
    events7d: number;
    topTab?: string;
    feedbackRating?: number;
    status: 'power' | 'active' | 'slipping';
  }>;
  feedbackInsights: {
    topRequests: Array<{ label: string; count: number }>;
    painPointThemes: Array<{ label: string; count: number }>;
    recentResponses: UserFeedbackEntry[];
    summary: string;
  };
  recommendations: Array<{
    id: string;
    title: string;
    detail: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  codexImplementationPrompt: string;
}

export interface TemplateCategory {
  id: string;
  name: string;
  description: string;
}

export interface EmailLogEntry {
  id: string;
  to: string;
  subject: string;
  status: 'sent' | 'failed' | 'tested';
  sentAt: string;
  sentBy: string;
  error?: string;
}

export interface MailSettings {
  host: string;
  port: number;
  secure: boolean;
  requireAuth: boolean;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  testRecipient?: string;
}

export interface AuthSettings {
  googleEnabled: boolean;
  googleClientId: string;
  googleClientSecret: string;
  aadhaarVerificationEnabled: boolean;
  aadhaarProviderLabel: string;
  aadhaarApiBaseUrl: string;
  aadhaarOtpRequestPath: string;
  aadhaarOtpVerifyPath: string;
  aadhaarClientId: string;
  aadhaarClientSecret: string;
  aadhaarApiKey: string;
  aadhaarAuaCode: string;
  aadhaarSubAuaCode: string;
  aadhaarLicenseKey: string;
  aadhaarEnvironment: 'sandbox' | 'production';
}

export interface WorkflowAutomationSettings {
  autoGenerateReferenceNumber: boolean;
  autoStampGeneratedBy: boolean;
  autoBccAuditMailbox: boolean;
  auditMailbox: string;
  autoCcGenerator: boolean;
  enableDeliveryTracking: boolean;
}

export type RecipientAccessLevel = 'view' | 'comment' | 'edit';
export type DataCollectionStatus = 'disabled' | 'sent' | 'submitted' | 'changes_requested' | 'reviewed' | 'finalized';

export interface RecipientSignatureBoxPlacement {
  id: string;
  /** 1-based page number (as shown in PDF viewers). */
  page: number;
  /** Left coordinate as a fraction of page width (0..1). */
  xPct: number;
  /** Top coordinate as a fraction of page height (0..1). */
  yPct: number;
  /** Box width as a fraction of page width (0..1). */
  widthPct: number;
  /** Box height as a fraction of page height (0..1). */
  heightPct: number;
  label?: string;
  /** Reserved for future multi-signer flows. */
  signerKey?: string;
  required?: boolean;
  /**
   * Optional absolute PDF coordinates (points) in PDF user space, derived from PDF.js viewport math.
   * When present, these take precedence for stamping to maximize accuracy across crop/rotation.
   */
  pdfX?: number;
  pdfY?: number;
  pdfW?: number;
  pdfH?: number;
}

export type RecipientSignaturePlacements =
  | {
      mode: 'last' | 'all' | 'pages';
      pages?: number[];
      position?: 'bottom_right' | 'bottom_left' | 'top_right' | 'top_left' | 'center';
      sizePct?: number;
      marginPct?: number;
    }
  | {
      mode: 'boxes';
      boxes: RecipientSignatureBoxPlacement[];
      version?: 1;
    };

export interface CollaborationComment {
  id: string;
  type: 'comment' | 'review';
  message: string;
  authorName: string;
  createdAt: string;
  createdIp?: string;
  replyMessage?: string;
  repliedAt?: string;
  repliedBy?: string;
}

export interface DocumentAccessEvent {
  id: string;
  eventType: 'open' | 'download' | 'edit' | 'comment' | 'review' | 'sign' | 'upload' | 'verify' | 'camera_capture' | 'email';
  createdAt: string;
  ip?: string;
  userAgent?: string;
  deviceLabel?: string;
  actorName?: string;
}

export interface CollaborationSettings {
  defaultRecipientAccess: RecipientAccessLevel;
}

export interface DashboardMetrics {
  totalDocuments: number;
  documentsThisWeek: number;
  emailsSent: number;
  templatesUsed: number;
  topTemplates: Array<{ templateName: string; count: number }>;
  recentActivity: DocumentHistory[];
  recentFeedback: Array<CollaborationComment & {
    documentId: string;
    shareUrl?: string;
    templateName: string;
    referenceNumber?: string;
  }>;
  documentSummary: Array<{
    id: string;
    shareUrl?: string;
    templateName: string;
    referenceNumber?: string;
    generatedAt: string;
    openCount: number;
    downloadCount: number;
    editCount: number;
    commentCount: number;
    reviewCount: number;
    signCount: number;
    uniqueDevices: string[];
    latestActivityAt?: string;
    latestActivityLabel?: string;
    pendingFeedbackCount: number;
    signedLocationLabel?: string;
    signedLatitude?: number;
    signedLongitude?: number;
    signedAccuracyMeters?: number;
    recipientSignedAt?: string;
    recipientSignedIp?: string;
    recipientSignerName?: string;
  }>;
  signatureLocationDistribution: Array<{
    locationLabel: string;
    count: number;
    documentIds: string[];
  }>;
}

export interface FileTransferAccessEvent {
  id: string;
  eventType: 'open' | 'download' | 'decrypt';
  createdAt: string;
  actorEmail?: string;
  actorName?: string;
  ip?: string;
}

export interface FileManagerFolder {
  id: string;
  name: string;
  description?: string;
  colorTone?: 'slate' | 'sky' | 'emerald' | 'amber' | 'violet';
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  createdByUserId?: string;
  organizationId?: string;
  organizationName?: string;
}

export interface SecureFileTransfer {
  id: string;
  shareId: string;
  shareUrl?: string;
  publicOpenUrl?: string;
  title?: string;
  fileName: string;
  mimeType: string;
  dataUrl: string;
  sizeInBytes: number;
  notes?: string;
  folderId?: string;
  folderName?: string;
  lockerId?: string;
  lockerName?: string;
  directoryVisibility?: 'public' | 'private';
  directoryCategory?: string;
  directoryTags?: string[];
  authMode: FileTransferAuthMode;
  accessPassword?: string;
  fileAccessPassword?: string;
  securePassword?: string;
  parserPassword?: string;
  recipientEmail?: string;
  encryptionEnabled?: boolean;
  encryptionAlgorithm?: string;
  encryptedPayload?: string;
  maxDownloads?: number;
  expiresAt?: string;
  uploadedBy: string;
  uploadedByName?: string;
  uploadedByUserId?: string;
  /** Avatar/logo URL to display next to the author name in feeds */
  avatarUrl?: string;
  /** If published from a business page, its slug for routing to /businesses/[slug] */
  businessPageSlug?: string;
  organizationId?: string;
  organizationName?: string;
  createdAt: string;
  updatedAt: string;
  revokedAt?: string;
  openCount: number;
  downloadCount: number;
  lastOpenedAt?: string;
  lastDownloadedAt?: string;
  accessEvents: FileTransferAccessEvent[];
  /* engagement */
  likesCount?: number;
  likedBy?: string[];
  trendCount?: number;
  trendedBy?: string[];
  interestedCount?: number;
  interestedBy?: string[];
  interestedUsers?: Array<{ id: string; name: string; markedAt: string }>;
  commentsCount?: number;
  videoUrl?: string;
  comments?: Array<{ id: string; userId: string; userName: string; text: string; createdAt: string; parentId?: string; likedBy?: string[] }>;
  viewCount?: number;
  /* featuring */
  featured?: boolean;
  featuredUntil?: string;
  featuredPlan?: 'spotlight' | 'boost' | 'prime';
  featuredAt?: string;
  featuredOrderId?: string;
  /* directory publishing extras */
  thumbnailUrl?: string;
  applicationUrl?: string;
  registrations?: Array<{ id: string; name: string; email: string; note?: string; registeredAt: string; type: 'event' | 'hackathon' | 'other' }>;
  jobApplications?: Array<{ id: string; name: string; email: string; note?: string; appliedAt: string }>;
  /* content moderation */
  moderationStatus?: 'active' | 'suspended' | 'removed' | 'under_review';
  moderationNote?: string;
  moderationUpdatedAt?: string;
  moderationUpdatedBy?: string;
  reports?: Array<{
    id: string;
    reporterUserId?: string;
    reporterEmail?: string;
    reason: string;
    detail?: string;
    createdAt: string;
    status: 'pending' | 'reviewed' | 'dismissed';
  }>;
}

export interface BlogPost {
  id: string;
  authorUserId: string;
  authorName: string;
  authorEmail: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: string;
  tags: string[];
  coverImageUrl?: string;
  status: 'draft' | 'published';
  featured?: boolean;
  seoTitle?: string;
  seoDescription?: string;
  readTimeMinutes: number;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface FileDirectoryLockerHistoryEvent {
  id: string;
  type: 'created' | 'file_added' | 'password_changed' | 'rotation_updated';
  createdAt: string;
  actorUserId?: string;
  actorName?: string;
  note: string;
}

export interface FileDirectoryLocker {
  id: string;
  ownerUserId: string;
  ownerEmail: string;
  ownerName: string;
  organizationId?: string;
  organizationName?: string;
  name: string;
  description?: string;
  category?: string;
  currentPassword: string;
  passwordVersion: number;
  passwordRotationDays?: number;
  passwordLastChangedAt: string;
  lastRotationDueAt?: string;
  fileTransferIds: string[];
  createdAt: string;
  updatedAt: string;
  history: FileDirectoryLockerHistoryEvent[];
}

export interface ProfileOverview {
  name: string;
  email: string;
  role: string;
  organizationName?: string;
  subscription: {
    planId?: string;
    planName: string;
    status: string;
    billingModel?: string;
    priceLabel?: string;
    maxDocumentGenerations?: number;
    remainingGenerations?: number;
    totalGeneratedDocuments?: number;
    remainingAiTrialRuns?: number;
    monthlyAiCredits?: number;
    remainingAiCredits?: number;
    overagePriceLabel?: string;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
    lastPaymentAt?: string;
    roadmapPromotion?: {
      campaignId: string;
      label: string;
      cutoffAt: string;
      validUntil: string;
      qualifiedAt?: string;
      eligible: boolean;
    };
  };
  docrudGo?: boolean;
  avatarUrl?: string | null;
  limitations: string[];
  threshold: {
    state: 'healthy' | 'watch' | 'critical' | 'limit_reached';
    percentUsed: number;
    recommendation: string;
  };
  usage: {
    totalDocuments: number;
    documentsThisMonth: number;
    averageDocumentsPerWeek: number;
    averageDocumentsPerDay: number;
    remainingGenerations: number;
    projectedExhaustionLabel: string;
    projectedExhaustionDate?: string;
    activeFileTransfers: number;
    totalFileTransfers: number;
    fileTransferDownloads: number;
    totalVirtualIds?: number;
    totalVirtualIdScans?: number;
    totalCertificates?: number;
    totalCertificateDownloads?: number;
  };
}

export interface SignatureRecord {
  id: string;
  signerName: string;
  signerRole: string;
  signatureDataUrl: string;
  signedAt?: string;
  signedIp?: string;
  createdBy?: string;
  organizationId?: string;
  organizationName?: string;
}

export interface BusinessSettings {
  organizationId: string;
  organizationName: string;
  displayName: string;
  industry?: string;
  companySize?: string;
  primaryUseCase?: string;
  workspacePreset?: string;
  onboardingCompleted?: boolean;
  onboardingCompletedAt?: string;
  starterTemplatesSeededAt?: string;
  supportEmail: string;
  supportPhone: string;
  accentColor: string;
  watermarkLabel: string;
  letterheadMode?: 'default' | 'image' | 'html';
  letterheadImageDataUrl?: string;
  letterheadHtml?: string;
  businessDescription?: string;
  workspaceSetupChecklist?: {
    profileConfigured: boolean;
    brandingConfigured: boolean;
    starterTemplatesReady: boolean;
    signaturesReady: boolean;
    firstDocumentGenerated: boolean;
  };
  updatedAt: string;
}

export interface RecipientSignatureRecord {
  signerName: string;
  signatureDataUrl: string;
  signatureSource?: 'drawn' | 'uploaded';
  signedAt?: string;
  signedIp?: string;
  signerPhotoDataUrl?: string;
  signerPhotoCapturedAt?: string;
  signerPhotoCapturedIp?: string;
  signerPhotoCaptureMethod?: 'live_camera';
  aadhaarVerifiedAt?: string;
  aadhaarVerifiedIp?: string;
  aadhaarReferenceId?: string;
  aadhaarMaskedId?: string;
  aadhaarVerificationMode?: 'otp';
  aadhaarProviderLabel?: string;
  signedLocationLabel?: string;
  signedLatitude?: number;
  signedLongitude?: number;
  signedAccuracyMeters?: number;
}

export interface SignatureSettings {
  signatures: SignatureRecord[];
}

export interface SubmittedDocument {
  id: string;
  label: string;
  fileName: string;
  mimeType: string;
  dataUrl: string;
  uploadedAt: string;
}

export interface ManagedFile {
  id: string;
  name: string;
  category: 'attachment' | 'supporting' | 'policy' | 'media' | 'appendix';
  mimeType: string;
  dataUrl: string;
  sizeInBytes: number;
  uploadedAt: string;
  uploadedBy: string;
  notes?: string;
}

export interface DocumentEditorState {
  title?: string;
  lifecycleStage?: 'draft' | 'internal_review' | 'approved' | 'published' | 'archived';
  documentStatus?: 'active' | 'on_hold' | 'expired' | 'superseded';
  department?: string;
  owner?: string;
  reviewer?: string;
  classification?: 'public' | 'internal' | 'confidential' | 'restricted';
  versionLabel?: string;
  effectiveDate?: string;
  expiryDate?: string;
  tags?: string[];
  complianceNotes?: string;
  internalSummary?: string;
  clauseLibrary?: string[];
  layoutPreset?: 'formal' | 'executive' | 'legal' | 'hr' | 'client-ready';
  designPreset?: DocumentDesignPreset;
  watermarkLabel?: string;
  signatureCertificateBrandingEnabled?: boolean;
  signatureReceiptCompletionPageEnabled?: boolean;
  letterheadMode?: 'default' | 'image' | 'html';
  letterheadImageDataUrl?: string;
  letterheadHtml?: string;
}

export interface RoleProfile {
  id: string;
  name: string;
  description: string;
  baseRole: 'admin' | 'hr' | 'legal' | 'user';
  permissions: string[];
  governanceScopes: string[];
  createdAt: string;
  updatedAt: string;
  isSystem?: boolean;
}

export interface VersionSnapshot {
  id: string;
  versionLabel: string;
  createdAt: string;
  createdBy: string;
  summary?: string;
  previewHtml?: string;
}

export interface ThemeSettings {
  activeTheme: 'ember' | 'sapphire' | 'slate' | 'ocean' | 'forest' | 'midnight' | 'rose' | 'graphite';
  softwareName: string;
  accentLabel: string;
}

export interface WorkflowStep {
  id: string;
  label: string;
  ownerRole: string;
  slaHours?: number;
}

export interface WorkflowTemplateRecord {
  id: string;
  name: string;
  department: string;
  steps: WorkflowStep[];
  isActive: boolean;
}

export interface ClauseLibraryItem {
  id: string;
  title: string;
  category: string;
  body: string;
  tags: string[];
}

export interface IntegrationConfig {
  id: string;
  name: string;
  type: 'webhook' | 'crm' | 'hrms' | 'storage' | 'messaging';
  endpoint: string;
  status: 'active' | 'paused';
}

export interface OrganizationProfile {
  id: string;
  name: string;
  domain?: string;
  brandColor?: string;
  logoUrl?: string;
}

export interface ExpiryRule {
  id: string;
  name: string;
  daysBefore: number;
  actionLabel: string;
}

export interface PlatformConfig {
  workflows: WorkflowTemplateRecord[];
  clauses: ClauseLibraryItem[];
  integrations: IntegrationConfig[];
  organizations: OrganizationProfile[];
  expiryRules: ExpiryRule[];
  folderLibrary: string[];
  featureControls: Record<PlatformFeatureControlKey, boolean>;
}

export interface LandingPricingPlan {
  id: string;
  name: string;
  priceLabel: string;
  description: string;
  highlights: string[];
}

export interface LandingFeatureCard {
  id: string;
  title: string;
  description: string;
}

export interface LandingStat {
  id: string;
  value: string;
  label: string;
}

export interface LandingSoftwareModule {
  id: string;
  title: string;
  description: string;
  capabilities: string[];
}

export interface LandingScreenshotCard {
  id: string;
  title: string;
  description: string;
  imagePath: string;
}

export interface LandingHeroBanner {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  imagePath: string;
}

export interface LandingAudienceCard {
  id: string;
  businessType: string;
  usage: string;
  benefit: string;
}

export interface LandingGettingStartedStep {
  id: string;
  title: string;
  description: string;
}

export interface HomepageSectionToggles {
  hero: boolean;
  audiences: boolean;
  snapshot: boolean;
  softwareModules: boolean;
  screenshots: boolean;
  pricing: boolean;
  demo: boolean;
  contact: boolean;
}

export interface LandingSettings {
  heroBadge: string;
  heroTitle: string;
  heroSubtitle: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
  socialProofLabel: string;
  socialProofItems: string[];
  gettingStartedTitle: string;
  gettingStartedSubtitle: string;
  gettingStartedSteps: LandingGettingStartedStep[];
  audienceSectionTitle: string;
  audienceSectionSubtitle: string;
  featureSectionTitle: string;
  softwareModulesTitle: string;
  softwareModulesSubtitle: string;
  pricingSectionTitle: string;
  pricingSectionSubtitle: string;
  pricingPageTitle: string;
  pricingPageSubtitle: string;
  contactEmail: string;
  contactPhone: string;
  contactHeading: string;
  contactSubtitle: string;
  contactPageTitle: string;
  contactPageSubtitle: string;
  demoPageTitle: string;
  demoPageSubtitle: string;
  demoBenefits: string[];
  screenshotsSectionTitle: string;
  screenshotsSectionSubtitle: string;
  featureHighlights: string[];
  featureCards: LandingFeatureCard[];
  stats: LandingStat[];
  softwareModules: LandingSoftwareModule[];
  featureScreenshots: LandingScreenshotCard[];
  heroBanners: LandingHeroBanner[];
  audienceProfiles: LandingAudienceCard[];
  pricingPlans: LandingPricingPlan[];
  enabledSections: HomepageSectionToggles;
}

export interface ContactRequest {
  id: string;
  requestType?: 'contact' | 'demo' | 'pricing' | 'wishlist';
  name: string;
  email: string;
  organization: string;
  phone?: string;
  message: string;
  preferredDate?: string;
  teamSize?: string;
  useCase?: string;
  searchedFor?: string;
  sourcePath?: string;
  createdAt: string;
}

export interface ParsedDocumentScore {
  overall: number;
  clarity: number;
  compliance: number;
  completeness: number;
  professionalism: number;
  riskExposure: number;
  rationale: string;
}

export interface ParsedDocumentInsightsRecord {
  summary: string;
  tone: string;
  score: ParsedDocumentScore;
  keyDetails: string[];
  risks: string[];
  mitigations: string[];
  obligations: string[];
  recommendedActions: string[];
  provider?: string;
  model?: string;
}

export interface ParserHistoryEntry {
  id: string;
  title: string;
  sourceLabel?: string;
  sourceType: 'upload' | 'paste' | 'preview';
  extractionMethod?: string;
  content: string;
  extractedCharacterCount: number;
  insights: ParsedDocumentInsightsRecord;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  organizationId?: string;
}

export type DocWordBlockType =
  | 'paragraph'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'bullet'
  | 'quote'
  | 'callout'
  | 'table'
  | 'image';

export interface DocWordBlock {
  id: string;
  type: DocWordBlockType;
  html: string;
  text: string;
  meta?: {
    src?: string;
    alt?: string;
    prompt?: string;
    columns?: string[];
    rows?: string[][];
    comments?: string[];
  };
}

export interface DocWordDocumentVersion {
  id: string;
  title: string;
  html: string;
  plainText: string;
  createdAt: string;
  source: 'autosave' | 'manual' | 'ai' | 'restore';
}

export interface DocWordSharedAccess {
  userId?: string;
  email?: string;
  addedAt: string;
  permission: 'read' | 'write';
  viaToken?: string;
}

export interface DocWordGroupMember {
  id: string;
  userId: string;
  name?: string;
  password: string;
  permission: 'read' | 'write';
  addedAt: string;
}

export interface DocWordAccessGroup {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  shareToken?: string;
  inviteToken?: string;
  invitePermission?: 'read' | 'write';
  members: DocWordGroupMember[];
}

export interface DocWordSignatureEntry {
  id: string;
  name: string;
  email?: string;
  signedAt: string;
}

export interface DocWordTrackedChange {
  id: string;
  blockId: string;
  kind: 'ai_selection' | 'ai_block' | 'ai_reply';
  label: string;
  beforeHtml: string;
  afterHtml: string;
  createdAt: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface DocWordSelectionComment {
  id: string;
  blockId: string;
  selectionText: string;
  comment: string;
  createdAt: string;
}

/* ─── Public Face ─────────────────────────────────────────────────────── */

export type PublicFaceCategory =
  | 'actor_actress'
  | 'singer_musician'
  | 'athlete_sportsperson'
  | 'model'
  | 'content_creator'
  | 'influencer'
  | 'politician'
  | 'entrepreneur_ceo'
  | 'author_writer'
  | 'academic_scientist'
  | 'tv_personality'
  | 'comedian'
  | 'social_activist'
  | 'chef_culinary'
  | 'fashion_designer'
  | 'photographer_videographer'
  | 'game_streamer'
  | 'journalist'
  | 'other';

export interface PublicFaceApplication {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  status: 'pending' | 'under_review' | 'approved' | 'rejected';
  category: PublicFaceCategory;
  /** Social presence */
  instagramHandle?: string;
  twitterHandle?: string;
  youtubeChannel?: string;
  facebookPage?: string;
  tiktokHandle?: string;
  websiteUrl?: string;
  /** Fame proof */
  totalFollowers?: string;
  monthlyReach?: string;
  mediaFeatures?: string;
  awardsRecognitions?: string;
  notableProjects?: string;
  publicStatement: string;
  /** Identity proof — base64 data URL */
  identityProofDataUrl?: string;
  identityProofFileName?: string;
  identityProofMimeType?: string;
  /** OTP verification */
  emailVerified: boolean;
  otpVerifiedAt?: string;
  /** Admin */
  adminNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  submittedAt: string;
  updatedAt: string;
}

export interface PublicFaceBadgeInfo {
  category: PublicFaceCategory;
  approvedAt: string;
}

export interface DocWordDocument {
  id: string;
  ownerUserId?: string;
  ownerEmail?: string;
  guestId?: string;
  title: string;
  emoji?: string;
  isFavorite?: boolean;
  favoriteSourceFolder?: string;
  folderName?: string;
  folderLockCode?: string;
  documentLockCode?: string;
  templateId?: string;
  summary?: string;
  documentTheme?: 'classic' | 'sky' | 'linen' | 'midnight';
  headerHtml?: string;
  footerHtml?: string;
  watermarkText?: string;
  requireSignature?: boolean;
  signatures?: DocWordSignatureEntry[];
  trackChangesEnabled?: boolean;
  trackedChanges?: DocWordTrackedChange[];
  selectionComments?: DocWordSelectionComment[];
  blocks: DocWordBlock[];
  html: string;
  plainText: string;
  wordCount: number;
  readTimeMinutes: number;
  lastAiAction?: string;
  shareToken?: string;
  shareMode?: 'private' | 'read' | 'write';
  sharedAccess?: DocWordSharedAccess[];
  accessGroups?: DocWordAccessGroup[];
  createdAt: string;
  updatedAt: string;
  versions: DocWordDocumentVersion[];
}
