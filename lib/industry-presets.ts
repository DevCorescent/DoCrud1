import { DocumentTemplate } from '@/types/document';

export type IndustryKey =
  | 'technology'
  | 'hr_staffing'
  | 'legal_services'
  | 'finance_ops'
  | 'healthcare'
  | 'manufacturing';

export type WorkspacePresetKey =
  | 'executive_control'
  | 'high_volume_ops'
  | 'compliance_first'
  | 'client_delivery';

type StarterTemplateSeed = Omit<DocumentTemplate, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'isCustom' | 'organizationId' | 'organizationName'>;

export interface IndustryWorkspaceProfile {
  key: IndustryKey;
  label: string;
  summary: string;
  heroTitle: string;
  heroDescription: string;
  dashboardFocus: string[];
  onboardingSteps: string[];
  recommendedModules: string[];
  starterTemplates: StarterTemplateSeed[];
}

export const workspacePresetOptions: Array<{ key: WorkspacePresetKey; label: string; description: string }> = [
  { key: 'executive_control', label: 'Executive Control', description: 'Premium oversight for leadership, approvals, and audit-heavy operations.' },
  { key: 'high_volume_ops', label: 'High Volume Ops', description: 'Fast routing for repetitive generation, review, and outbound document cycles.' },
  { key: 'compliance_first', label: 'Compliance First', description: 'Stronger governance for regulated workflows, legal review, and controlled records.' },
  { key: 'client_delivery', label: 'Client Delivery', description: 'Client-facing setup for proposals, statements of work, renewals, and account servicing.' },
];

const baseAgreementBody = (subject: string, valueStatement: string) => `
  <p>This document records the approved ${subject} workflow between <strong>{{companyName}}</strong> and <strong>{{recipientName}}</strong>.</p>
  <p>${valueStatement}</p>
  <h3>Commercial Scope</h3>
  <p>{{scopeSummary}}</p>
  <h3>Effective Date</h3>
  <p>The parties agree that this document becomes effective on <strong>{{effectiveDate}}</strong>.</p>
`;

export const industryWorkspaceProfiles: IndustryWorkspaceProfile[] = [
  {
    key: 'technology',
    label: 'Technology',
    summary: 'Product, SaaS, IT services, and software-led operating teams.',
    heroTitle: 'Built for product, delivery, and customer operations teams.',
    heroDescription: 'Technology companies need a dashboard that balances client delivery, approvals, renewals, and repeatable template-based generation.',
    dashboardFocus: ['Client proposals and contracts', 'Implementation onboarding', 'Renewals and service changes'],
    onboardingSteps: ['Confirm business identity and support contacts.', 'Select your default workspace model.', 'Start from technology-ready commercial templates and tailor them.'],
    recommendedModules: ['Generate Documents', 'History', 'Client Portal', 'Renewals'],
    starterTemplates: [
      {
        name: 'Technology Proposal',
        category: 'General',
        description: 'Starter proposal template for SaaS and implementation engagements.',
        createdBy: 'system',
        fields: [
          { id: 'company-name', name: 'companyName', label: 'Company Name', type: 'text', required: true, order: 1 },
          { id: 'recipient-name', name: 'recipientName', label: 'Recipient Name', type: 'text', required: true, order: 2 },
          { id: 'effective-date', name: 'effectiveDate', label: 'Effective Date', type: 'date', required: true, order: 3 },
          { id: 'scope-summary', name: 'scopeSummary', label: 'Scope Summary', type: 'textarea', required: true, order: 4 },
        ],
        template: baseAgreementBody('proposal', 'This proposal is designed for solution scoping, commercial readiness, and phased delivery planning.'),
      },
      {
        name: 'Change Request Note',
        category: 'General',
        description: 'Starter document for scope changes and commercial revision approvals.',
        createdBy: 'system',
        fields: [
          { id: 'company-name-cr', name: 'companyName', label: 'Company Name', type: 'text', required: true, order: 1 },
          { id: 'recipient-name-cr', name: 'recipientName', label: 'Recipient Name', type: 'text', required: true, order: 2 },
          { id: 'effective-date-cr', name: 'effectiveDate', label: 'Effective Date', type: 'date', required: true, order: 3 },
          { id: 'scope-summary-cr', name: 'scopeSummary', label: 'Change Summary', type: 'textarea', required: true, order: 4 },
        ],
        template: baseAgreementBody('change request', 'This change request documents revised scope, commercials, and delivery assumptions for the active engagement.'),
      },
    ],
  },
  {
    key: 'hr_staffing',
    label: 'HR & Staffing',
    summary: 'Recruitment, staffing, people operations, and onboarding-heavy businesses.',
    heroTitle: 'Designed for onboarding, offer rollout, and people operations.',
    heroDescription: 'HR-led organizations need quick document issuance, employee intake, background verification, and clear follow-up dashboards.',
    dashboardFocus: ['Offer and appointment letters', 'Onboarding intake forms', 'Verification and employee follow-up'],
    onboardingSteps: ['Select an HR-focused workspace preset.', 'Seed onboarding and offer templates.', 'Route employee intake and verification from one dashboard.'],
    recommendedModules: ['Generate Documents', 'History', 'Onboarding', 'Tutorials'],
    starterTemplates: [
      {
        name: 'Candidate Intake Form',
        category: 'HR',
        description: 'Starter intake form for collecting candidate details before final document issue.',
        createdBy: 'system',
        fields: [
          { id: 'candidate-name', name: 'recipientName', label: 'Candidate Name', type: 'text', required: true, order: 1 },
          { id: 'company-name-hr', name: 'companyName', label: 'Company Name', type: 'text', required: true, order: 2 },
          { id: 'effective-date-hr', name: 'effectiveDate', label: 'Date', type: 'date', required: true, order: 3 },
          { id: 'scope-summary-hr', name: 'scopeSummary', label: 'Role and Compensation Summary', type: 'textarea', required: true, order: 4 },
        ],
        template: baseAgreementBody('candidate intake', 'This intake record is used to validate role, compensation, joining logistics, and pre-offer requirements.'),
      },
      {
        name: 'Joining Instruction Pack',
        category: 'HR',
        description: 'Starter joining instruction letter for employee onboarding coordination.',
        createdBy: 'system',
        fields: [
          { id: 'candidate-name-j', name: 'recipientName', label: 'Employee Name', type: 'text', required: true, order: 1 },
          { id: 'company-name-j', name: 'companyName', label: 'Company Name', type: 'text', required: true, order: 2 },
          { id: 'effective-date-j', name: 'effectiveDate', label: 'Joining Date', type: 'date', required: true, order: 3 },
          { id: 'scope-summary-j', name: 'scopeSummary', label: 'Joining Instructions', type: 'textarea', required: true, order: 4 },
        ],
        template: baseAgreementBody('joining instruction', 'This pack confirms joining readiness, mandatory submissions, and the steps required before day one.'),
      },
    ],
  },
  {
    key: 'legal_services',
    label: 'Legal Services',
    summary: 'Law firms, legal consultancies, contract desks, and policy teams.',
    heroTitle: 'Optimized for contract review, notices, and governed approvals.',
    heroDescription: 'Legal teams need tight version control, standardized clauses, and dashboards that surface high-risk document actions quickly.',
    dashboardFocus: ['Contracts and notices', 'Versioned approvals', 'Clause-led document drafting'],
    onboardingSteps: ['Set the workspace to compliance-led governance.', 'Start from legal-ready template pack.', 'Use history and audit surfaces to track document movement.'],
    recommendedModules: ['Generate Documents', 'Document Summary', 'Audit', 'Clauses'],
    starterTemplates: [
      {
        name: 'Legal Notice Draft',
        category: 'Legal',
        description: 'Starter legal notice format for governed outbound communication.',
        createdBy: 'system',
        fields: [
          { id: 'legal-company', name: 'companyName', label: 'Issuing Entity', type: 'text', required: true, order: 1 },
          { id: 'legal-recipient', name: 'recipientName', label: 'Notice Recipient', type: 'text', required: true, order: 2 },
          { id: 'legal-date', name: 'effectiveDate', label: 'Notice Date', type: 'date', required: true, order: 3 },
          { id: 'legal-summary', name: 'scopeSummary', label: 'Notice Summary', type: 'textarea', required: true, order: 4 },
        ],
        template: baseAgreementBody('legal notice', 'This notice framework is intended for formal communication, demand articulation, and governed legal record keeping.'),
      },
      {
        name: 'Contract Review Memo',
        category: 'Legal',
        description: 'Starter memo for internal legal review decisions and recommendation notes.',
        createdBy: 'system',
        fields: [
          { id: 'memo-company', name: 'companyName', label: 'Business Unit', type: 'text', required: true, order: 1 },
          { id: 'memo-recipient', name: 'recipientName', label: 'Stakeholder', type: 'text', required: true, order: 2 },
          { id: 'memo-date', name: 'effectiveDate', label: 'Review Date', type: 'date', required: true, order: 3 },
          { id: 'memo-summary', name: 'scopeSummary', label: 'Review Recommendation', type: 'textarea', required: true, order: 4 },
        ],
        template: baseAgreementBody('contract review memo', 'This memo summarizes legal review status, negotiation items, and approval readiness for internal stakeholders.'),
      },
    ],
  },
  {
    key: 'finance_ops',
    label: 'Finance Operations',
    summary: 'Finance teams, accounting operations, and procurement-heavy businesses.',
    heroTitle: 'Built for controlled finance approvals and vendor-facing paperwork.',
    heroDescription: 'Finance operations need clean approval trails, document reuse, and clear dashboards around commercial and compliance paperwork.',
    dashboardFocus: ['Invoices and quotations', 'Approvals and audit readiness', 'Vendor and payment communication'],
    onboardingSteps: ['Choose a finance-friendly workspace preset.', 'Start from quotation and vendor-ready starter templates.', 'Use summary and history to manage outbound communication.'],
    recommendedModules: ['Generate Documents', 'History', 'Analytics', 'Audit'],
    starterTemplates: [
      {
        name: 'Vendor Onboarding Request',
        category: 'Finance',
        description: 'Starter request used for collecting vendor profile and compliance information.',
        createdBy: 'system',
        fields: [
          { id: 'vendor-company', name: 'companyName', label: 'Business Name', type: 'text', required: true, order: 1 },
          { id: 'vendor-recipient', name: 'recipientName', label: 'Vendor Contact', type: 'text', required: true, order: 2 },
          { id: 'vendor-date', name: 'effectiveDate', label: 'Request Date', type: 'date', required: true, order: 3 },
          { id: 'vendor-summary', name: 'scopeSummary', label: 'Required Information', type: 'textarea', required: true, order: 4 },
        ],
        template: baseAgreementBody('vendor onboarding request', 'This request is used to collect tax, banking, and compliance details before vendor activation.'),
      },
      {
        name: 'Payment Approval Memo',
        category: 'Finance',
        description: 'Starter memo for internal approval of vendor or operational payments.',
        createdBy: 'system',
        fields: [
          { id: 'pay-company', name: 'companyName', label: 'Business Unit', type: 'text', required: true, order: 1 },
          { id: 'pay-recipient', name: 'recipientName', label: 'Approver', type: 'text', required: true, order: 2 },
          { id: 'pay-date', name: 'effectiveDate', label: 'Approval Date', type: 'date', required: true, order: 3 },
          { id: 'pay-summary', name: 'scopeSummary', label: 'Payment Summary', type: 'textarea', required: true, order: 4 },
        ],
        template: baseAgreementBody('payment approval memo', 'This memo captures payment context, control checks, and approval justification for finance records.'),
      },
    ],
  },
  {
    key: 'healthcare',
    label: 'Healthcare',
    summary: 'Clinics, healthcare operators, diagnostics, and patient/admin operations.',
    heroTitle: 'Tailored for compliance-sensitive healthcare administration.',
    heroDescription: 'Healthcare organizations need privacy-conscious intake, governed notices, and cleaner auditability across operational communication.',
    dashboardFocus: ['Patient or partner intake', 'Compliance notices', 'Operational policy records'],
    onboardingSteps: ['Choose a compliance-first workspace.', 'Start with intake and operational communication starters.', 'Keep audit and history highly visible from day one.'],
    recommendedModules: ['Generate Documents', 'Document Summary', 'Audit', 'Tutorials'],
    starterTemplates: [
      {
        name: 'Partner Intake Checklist',
        category: 'General',
        description: 'Starter collection form for onboarding external healthcare partners or vendors.',
        createdBy: 'system',
        fields: [
          { id: 'hc-company', name: 'companyName', label: 'Organization Name', type: 'text', required: true, order: 1 },
          { id: 'hc-recipient', name: 'recipientName', label: 'Contact Name', type: 'text', required: true, order: 2 },
          { id: 'hc-date', name: 'effectiveDate', label: 'Date', type: 'date', required: true, order: 3 },
          { id: 'hc-summary', name: 'scopeSummary', label: 'Required Documents and Scope', type: 'textarea', required: true, order: 4 },
        ],
        template: baseAgreementBody('partner intake', 'This checklist records the information and approvals required before operational engagement begins.'),
      },
      {
        name: 'Policy Acknowledgement Notice',
        category: 'General',
        description: 'Starter acknowledgement note for regulated internal communications.',
        createdBy: 'system',
        fields: [
          { id: 'hc2-company', name: 'companyName', label: 'Organization Name', type: 'text', required: true, order: 1 },
          { id: 'hc2-recipient', name: 'recipientName', label: 'Recipient Name', type: 'text', required: true, order: 2 },
          { id: 'hc2-date', name: 'effectiveDate', label: 'Date', type: 'date', required: true, order: 3 },
          { id: 'hc2-summary', name: 'scopeSummary', label: 'Policy Summary', type: 'textarea', required: true, order: 4 },
        ],
        template: baseAgreementBody('policy acknowledgement', 'This document is used to communicate and acknowledge operational policies in a tracked format.'),
      },
    ],
  },
  {
    key: 'manufacturing',
    label: 'Manufacturing',
    summary: 'Factories, supply chain operators, procurement desks, and industrial businesses.',
    heroTitle: 'Built for vendor coordination, plant paperwork, and repeatable operations.',
    heroDescription: 'Manufacturing teams need reliable document reuse, vendor-facing controls, and dashboards centered on operational throughput.',
    dashboardFocus: ['Vendor and procurement packs', 'Operational notices', 'Repeatable plant-level communications'],
    onboardingSteps: ['Select a high-volume or compliance-led workspace.', 'Seed procurement and vendor template pack.', 'Use history and analytics to track repetitive document cycles.'],
    recommendedModules: ['Generate Documents', 'History', 'Bulk Ops', 'Analytics'],
    starterTemplates: [
      {
        name: 'Vendor Compliance Pack',
        category: 'General',
        description: 'Starter request used to collect vendor compliance details and operational approvals.',
        createdBy: 'system',
        fields: [
          { id: 'mf-company', name: 'companyName', label: 'Plant or Entity Name', type: 'text', required: true, order: 1 },
          { id: 'mf-recipient', name: 'recipientName', label: 'Vendor Contact', type: 'text', required: true, order: 2 },
          { id: 'mf-date', name: 'effectiveDate', label: 'Date', type: 'date', required: true, order: 3 },
          { id: 'mf-summary', name: 'scopeSummary', label: 'Compliance Requirements', type: 'textarea', required: true, order: 4 },
        ],
        template: baseAgreementBody('vendor compliance pack', 'This pack communicates the approvals, certifications, and operational documents required before vendor activation.'),
      },
      {
        name: 'Operations Notice',
        category: 'General',
        description: 'Starter format for plant or operational communication with controlled acknowledgment.',
        createdBy: 'system',
        fields: [
          { id: 'mf2-company', name: 'companyName', label: 'Plant or Entity Name', type: 'text', required: true, order: 1 },
          { id: 'mf2-recipient', name: 'recipientName', label: 'Recipient', type: 'text', required: true, order: 2 },
          { id: 'mf2-date', name: 'effectiveDate', label: 'Date', type: 'date', required: true, order: 3 },
          { id: 'mf2-summary', name: 'scopeSummary', label: 'Notice Summary', type: 'textarea', required: true, order: 4 },
        ],
        template: baseAgreementBody('operations notice', 'This notice is used for repeatable operational communication that must remain visible and traceable.'),
      },
    ],
  },
];

export const industryOptions = industryWorkspaceProfiles.map((profile) => ({
  key: profile.key,
  label: profile.label,
  summary: profile.summary,
}));

export function getIndustryWorkspaceProfile(industry?: string) {
  return industryWorkspaceProfiles.find((profile) => profile.key === industry) || industryWorkspaceProfiles[0];
}

export function getWorkspacePresetLabel(preset?: string) {
  return workspacePresetOptions.find((entry) => entry.key === preset)?.label || 'Executive Control';
}
