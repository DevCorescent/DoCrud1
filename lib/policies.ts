export const policyCompany = {
  productName: 'docrud',
  parentCompanyName: 'Corescent Technologies Private Limited',
  effectiveDateLabel: 'April 1, 2026',
  policyVersion: '2026.04.01',
  supportEmail: 'legal@docrud.app',
};

export const requiredPolicyIds = [
  'terms',
  'privacy',
  'refund-cancellation',
  'generated-document-policy',
  'shared-document-policy',
  'signed-document-policy',
  'encrypted-document-policy',
  'data-privacy-policy',
  'documents-legality',
] as const;

export type PolicyId = typeof requiredPolicyIds[number];

export type PolicySection = {
  title: string;
  body: string[];
};

export type PolicyDefinition = {
  id: PolicyId;
  href: string;
  shortLabel: string;
  title: string;
  subtitle: string;
  sections: PolicySection[];
};

export const policyDefinitions: PolicyDefinition[] = [
  {
    id: 'terms',
    href: '/terms-and-conditions',
    shortLabel: 'Terms & Conditions',
    title: 'Terms and Conditions',
    subtitle: 'The core product terms governing access to and use of docrud.',
    sections: [
      {
        title: 'Operator and contract structure',
        body: [
          'docrud is a software product operated under Corescent Technologies Private Limited. References to the platform, service, product, system, or software include the associated web application, APIs, storage flows, AI-assisted modules, workspaces, file delivery features, and related interfaces made available by the operator.',
          'These terms govern use of the product by individual users, business users, internal workspace users, administrators, and any other person who accesses the service under a valid account, workspace invitation, or permitted recipient flow.',
          'Where a customer enables internal users, shared recipients, delegated operators, or third-party participants, that customer is responsible for ensuring those persons are authorized to use the platform under the customer account or workflow and for ensuring that their use remains consistent with these terms and applicable law.',
        ],
      },
      {
        title: 'Service scope',
        body: [
          'docrud is a software platform operated under Corescent Technologies Private Limited for document operations, secure sharing, AI-assisted review, sheet workflows, and related business productivity features.',
          'Access to features, usage volume, workspace controls, and premium modules depends on the subscribed plan, account type, and any platform restrictions applied by docrud or the workspace owner.',
        ],
      },
      {
        title: 'Electronic records and platform role',
        body: [
          'docrud is intended to facilitate creation, storage, handling, routing, sharing, and review of electronic records in a business software environment. References to electronic records, electronic signatures, despatch, receipt, and retention should be read subject to the Information Technology Act, 2000, including provisions relating to legal recognition of electronic records and electronic signatures, validity of contracts formed through electronic means, and retention of records.',
          'The platform provides a technical and operational environment. It does not by itself guarantee that every workflow, output, signature flow, record, or transmission will satisfy every statutory, evidentiary, stamping, filing, registration, or sector-specific requirement that may apply to a user’s transaction.',
          'Users remain responsible for determining whether their matter requires physical originals, wet signatures, notarization, witness attestation, apostille, registration, stamp duty compliance, sector approval, board authorization, procurement approval, or any other formal legal step outside the product.',
        ],
      },
      {
        title: 'Acceptable use',
        body: [
          'Users must use docrud only for lawful, authorized, and contractually permitted purposes.',
          'Users must not use the platform to distribute malicious content, unlawful material, infringing documents, deceptive communications, unauthorized personal data, or any content that could expose the platform or other users to security, legal, or operational harm.',
        ],
      },
      {
        title: 'Account responsibility',
        body: [
          'Each user is responsible for maintaining the confidentiality of login credentials, internal user credentials, shared access secrets, and document passwords issued through the platform.',
          'Workspace owners are responsible for assigning access properly, reviewing activity logs where relevant, and disabling access when a user should no longer have platform access.',
          'Any act performed through a valid account, authenticated internal user, or protected document/session link may be treated by the operator as an act attributable to the relevant customer or authorized user unless the customer can show timely evidence of compromise, misuse, or unauthorized access.',
        ],
      },
      {
        title: 'Customer responsibility for content and authority',
        body: [
          'Users are solely responsible for the content they upload, generate, analyze, share, sign, encrypt, or route through the platform, including the authority of the person submitting or signing the document, the factual correctness of the contents, and the suitability of the document for the intended business or legal purpose.',
          'Users must ensure that the use of templates, AI-generated suggestions, imported data, third-party files, and recipient communications complies with internal approvals, client commitments, employment obligations, confidentiality duties, and applicable law.',
          'The operator does not independently verify whether a user has authority to bind an entity, issue a declaration, share personal information, circulate confidential documents, or complete a legally effective execution process. That responsibility remains with the customer and relevant signatories.',
        ],
      },
      {
        title: 'No legal, tax, HR, or compliance advice',
        body: [
          'docrud may provide AI summaries, risk scores, recommended edits, reply suggestions, visual analysis, or workflow signals. These outputs are informational software outputs only.',
          'Nothing in the product should be treated as legal advice, tax advice, compliance certification, accounting advice, evidentiary certification, or professional opinion. Users should obtain qualified professional review where the transaction is material or regulated.',
          'Any references in the platform to risk, legality, obligation, validity, sentiment, policy strength, compliance readiness, document score, or executive suitability are intended to help software users prioritize review and action. They are not a substitute for professional review or statutory compliance assessment.',
        ],
      },
      {
        title: 'Suspension, restriction, and termination',
        body: [
          'The operator may suspend, restrict, or terminate access where reasonably necessary to address security concerns, abuse, non-payment, breach of terms, unlawful activity, platform misuse, or credible risk to the operator, other customers, or recipients.',
          'The operator may also preserve account, access, billing, consent, or audit records where reasonably necessary for legal compliance, fraud prevention, dispute handling, or internal control purposes.',
          'Where feasible, the operator may provide notice before material suspension, but immediate action may be taken without prior notice where reasonably required to protect systems, evidence, other customers, or the integrity of the service.',
        ],
      },
      {
        title: 'Limitation of liability',
        body: [
          'To the maximum extent permitted by applicable law, the operator shall not be liable for indirect, consequential, special, reputational, punitive, or incidental loss arising out of the use of or inability to use the platform, including loss of business opportunity, loss of profits, or loss caused by user-side misuse, wrongful sharing, incorrect input data, unauthorized credentials disclosure, or reliance on AI-generated outputs without independent review.',
          'Where liability cannot be excluded, the operator’s aggregate liability shall remain limited to the amount actually paid by the relevant customer for the applicable paid service period immediately preceding the event giving rise to the claim, unless a different cap is required by non-excludable law.',
        ],
      },
      {
        title: 'Indemnity and governing law',
        body: [
          'Users agree to indemnify and hold harmless Corescent Technologies Private Limited, its officers, employees, and affiliates against claims, losses, liabilities, penalties, costs, or proceedings arising from unlawful content, breach of these terms, misuse of credentials, infringement, violation of third-party rights, or the user’s failure to obtain legally required approvals, consents, or professional review.',
          'These terms are governed by the laws of India. Subject to applicable law and any mandatory statutory process, disputes shall be subject to the courts having jurisdiction over the operator’s principal place of business, unless the operator specifies another valid contractual forum.',
        ],
      },
      {
        title: 'Platform availability and changes',
        body: [
          'docrud may add, modify, improve, restrict, or retire features, modules, limits, interfaces, or integrations in order to maintain product quality, security, or commercial viability.',
          'Where the platform advertises rollout windows, launch benefits, or roadmap upgrades, those benefits remain subject to the relevant campaign rules, plan status, and operational readiness of the product.',
          'Roadmaps, upcoming-feature pages, waitlists, and promotional upgrade representations describe current product intent and commercial positioning only. They do not create an absolute obligation to deliver a feature by a specific date, in a specific form, or for a specific class of user unless separately committed in writing by the operator.',
        ],
      },
    ],
  },
  {
    id: 'privacy',
    href: '/privacy-policy',
    shortLabel: 'Privacy Policy',
    title: 'Privacy Policy',
    subtitle: 'How docrud handles account data, usage data, and product activity data.',
    sections: [
      {
        title: 'Privacy framework and legal position',
        body: [
          'This policy describes how docrud handles personal and operational data in connection with its software services. The policy is intended to be read with applicable Indian law, including the Information Technology Act, 2000, the Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011, and the Digital Personal Data Protection Act, 2023, to the extent and from the time relevant provisions apply to the processing in question.',
          'Where a customer acts as the primary deciding party for document content, recipients, sharing, or processing purpose, that customer may independently bear obligations as a controller, business user, or equivalent deciding party for its own use of the product.',
          'Nothing in this policy should be read as a representation that every customer use case is automatically compliant with every applicable privacy, employment, financial, sectoral, evidentiary, or cross-border rule. Customers remain responsible for assessing their own legal basis, notice requirements, and internal permissions.',
        ],
      },
      {
        title: 'Data collected',
        body: [
          'docrud may collect account details, workspace information, policy acceptance records, billing records, uploaded content metadata, access logs, document activity history, and operational analytics required to run the platform.',
          'Where product features involve AI, analysis requests may use document text, sheet content, prompts, and surrounding workflow context strictly to produce the requested software output.',
          'Depending on feature usage, the platform may also record team member identities, internal login IDs, transfer access events, encrypted session metadata, signature evidence logs, device or session indicators, and consent or acknowledgement records necessary to operate governed workflows.',
        ],
      },
      {
        title: 'Grounds and purpose of processing',
        body: [
          'Information may be processed for account creation, authentication, access management, support, billing, security, fraud prevention, file and document workflow execution, consent recording, analytics, platform administration, feature improvement, and compliance response.',
          'Where consent is used as a basis for specific processing, the platform may record acceptance events, timestamps, and related identifiers. In other cases, processing may occur because it is necessary to provide the requested service, to maintain product security, to comply with law, or to support legitimate product operations.',
          'Where a customer or workspace administrator instructs the platform to send, analyze, encrypt, share, store, or route a document or data object, the platform may process the relevant information to execute those instructions, maintain integrity of the workflow, and preserve records reasonably necessary for support or dispute handling.',
        ],
      },
      {
        title: 'Use of information',
        body: [
          'Information is used to authenticate users, operate workspaces, enforce plans, maintain auditability, secure file and document workflows, improve product reliability, and support billing, support, and compliance operations.',
          'docrud does not position AI-generated analysis as a substitute for independent legal, tax, accounting, compliance, or professional advice.',
          'The operator may also use de-identified, aggregated, or service-level operational information for platform optimization, abuse detection, system health analysis, capacity planning, and product administration, provided such use is not intended to re-identify a person except where necessary for security, fraud prevention, or compliance response.',
        ],
      },
      {
        title: 'Access and control',
        body: [
          'Workspace owners and super administrators may have visibility into certain account, usage, consent, and operational records required for product administration, platform support, fraud prevention, and compliance handling.',
          'Tenant-protected content, restricted document access, and gated delivery modes may still require separate passwords, access codes, or workspace authorization even where metadata remains visible for control or support purposes.',
          'Where customers create internal users or team members, those team members may gain access to shared mailbox threads, sheet sessions, file-transfer records, or workspace modules according to the permissions assigned by the workspace owner. Customers are responsible for configuring those permissions appropriately.',
        ],
      },
      {
        title: 'Retention, correction, and disclosure',
        body: [
          'Data may be retained for the period reasonably necessary to deliver the service, maintain logs, resolve disputes, enforce contracts, protect rights, respond to legal process, preserve evidence, or satisfy internal security and accounting requirements.',
          'The operator may disclose data where required by applicable law, valid legal process, judicial order, government direction, fraud investigation, or a good-faith need to protect the rights, safety, systems, or customers of the operator.',
          'Where permitted by law and operationally feasible, requests for correction or update may be addressed through account controls, support processes, or administrative actions. However, certain logs, invoices, audit trails, consent records, and security records may need to be preserved in their original recorded form.',
        ],
      },
      {
        title: 'Cross-border tools and subprocessors',
        body: [
          'The platform may rely on hosting, infrastructure, analytics, AI, communications, or payment service providers in order to operate the service. Use of such providers remains subject to the operator’s commercial and security controls, but customers acknowledge that modern software services may involve storage, support, or processing components across multiple systems or jurisdictions.',
          'Customers should avoid uploading material that they are not authorized to place into a cloud software workflow or into an AI-assisted processing request. Where a customer has strict residency, secrecy, procurement, or export-control constraints, that customer should independently evaluate whether a particular workflow is appropriate before use.',
        ],
      },
    ],
  },
  {
    id: 'refund-cancellation',
    href: '/refund-and-cancellation-policy',
    shortLabel: 'Refund & Cancellation',
    title: 'Refund and Cancellation Policy',
    subtitle: 'Commercial terms for subscriptions, plan activation, cancellation, and refunds.',
    sections: [
      {
        title: 'Subscription activation',
        body: [
          'Paid plan activation gives the account access to the subscribed feature scope, usage envelope, and commercial status shown during checkout or plan assignment.',
          'In test or mocked checkout environments used for evaluation, invoice records and activation states may still be created to preserve workflow realism.',
          'Activation may occur immediately upon successful checkout, administrative assignment, or recorded plan confirmation. Once provisioned, the platform may begin making premium limits, analytics, sharing modes, and administrative controls available to the account.',
        ],
      },
      {
        title: 'Free plans, trials, and promotional access',
        body: [
          'Free plans, trial plans, campaign windows, launch offers, roadmap-upgrade promotions, and credit-based access are commercial privileges offered by the platform and may be limited, changed, withdrawn, or made conditional on usage, eligibility, abuse controls, or account status.',
          'Promotional access does not create a permanent right to future premium features beyond the published promotional period or campaign conditions.',
        ],
      },
      {
        title: 'Refund position',
        body: [
          'Unless otherwise required by applicable law or a separately agreed commercial commitment, subscription and plan purchases are generally non-refundable once the service is activated or materially provisioned.',
          'Requests for commercial review may be considered in cases involving duplicate payment, failed activation attributable to the platform, or a verified billing error.',
          'For clarity, dissatisfaction based on underuse, mistaken plan selection by the customer, change in internal business requirements, user training gaps, or delay in customer-side onboarding will not automatically create a refund entitlement.',
        ],
      },
      {
        title: 'Cancellation',
        body: [
          'Users may request cancellation or non-renewal of a recurring plan. Cancellation stops future renewals but does not necessarily reverse already consumed service value, generated invoices, or completed activation periods.',
          'Downgrades, suspensions, and feature removals may affect access to premium modules, higher usage capacity, and business-only controls.',
          'Where a plan is downgraded or allowed to lapse, the operator may restrict access to premium-only workflows, premium exports, advanced AI modules, higher team or storage limits, or other entitlements associated with the prior plan while preserving records required for accounting, audit, support, or contractual handling.',
        ],
      },
      {
        title: 'No refund for misuse or policy breach',
        body: [
          'Refunds, credits, reversals, or plan restoration may be denied where account restriction or service disruption results from breach of terms, fraudulent use, abusive activity, policy non-compliance, chargeback abuse, unlawful use, or repeated misuse of protected sharing features.',
        ],
      },
      {
        title: 'Taxes, invoices, and statutory records',
        body: [
          'Displayed prices, checkout amounts, GST treatment, invoice numbering, billing summaries, and related commercial records are intended to support transparent software billing. Customers remain responsible for verifying any tax treatment, input credit position, or statutory accounting consequences that apply to their own business.',
          'The operator may preserve invoices, payment references, plan-change history, and billing logs for accounting, legal, fraud-prevention, and internal control purposes even after cancellation or closure of the account.',
        ],
      },
    ],
  },
  {
    id: 'generated-document-policy',
    href: '/generated-document-policy',
    shortLabel: 'Generated Document Policy',
    title: 'Generated Document Policy',
    subtitle: 'Rules and responsibilities for documents created through docrud.',
    sections: [
      {
        title: 'Generation responsibility',
        body: [
          'Documents generated through docrud are created from templates, user inputs, AI assistance where applicable, and workflow settings selected by the user or workspace.',
          'Users remain responsible for reviewing generated content, confirming factual accuracy, confirming suitability for purpose, and ensuring the final document meets the organization’s legal, commercial, and compliance requirements.',
          'Generated documents should be treated as working outputs until the responsible person has completed review, internal approval, and any required external verification. The operator does not review each generated document for correctness or legal sufficiency.',
        ],
      },
      {
        title: 'Template and AI limits',
        body: [
          'Templates, AI suggestions, clause suggestions, summaries, and generated drafts are operational aids and are not guarantees of enforceability, completeness, or legal adequacy.',
          'Users should not rely solely on automatically generated outputs where professional review, approval authority, or compliance validation is required.',
          'Where the system suggests additions, redlines, risk mitigations, or response language, those suggestions are intended to accelerate user review and should be independently assessed against the actual transaction, commercial position, and applicable law.',
        ],
      },
      {
        title: 'No warranty on validity or suitability',
        body: [
          'The operator does not warrant that a generated document will be legally valid, properly stamped, admissible, registrable, tax-compliant, enforceable, regulatorily sufficient, or suitable for the user’s exact jurisdiction, sector, counterparty relationship, or transaction type.',
          'Users must independently determine whether the generated output requires custom clauses, statutory text, execution formalities, attachments, legal vetting, or local jurisdiction review.',
          'This applies equally to letters, agreements, declarations, notices, HR documents, policies, invoices, client-facing materials, sheet-derived outputs, and any AI-assisted content generated through the product.',
        ],
      },
    ],
  },
  {
    id: 'shared-document-policy',
    href: '/shared-document-policy',
    shortLabel: 'Shared Document Policy',
    title: 'Shared Document Policy',
    subtitle: 'Rules for sharing documents, forms, file requests, and governed links.',
    sections: [
      {
        title: 'Controlled sharing',
        body: [
          'Shared documents, links, and file-request workflows may be protected by passwords, access policies, recipient controls, expiry windows, watermarking, and tracking settings.',
          'The sender is responsible for choosing the appropriate delivery mode and securely communicating any required credentials to the intended recipient.',
          'The sender is also responsible for verifying that the recipient is authorized to receive the material and that the selected sharing method is appropriate for the confidentiality level, contractual restrictions, and sensitivity of the content.',
        ],
      },
      {
        title: 'Recipient actions and tracking',
        body: [
          'docrud may record operational events such as link creation, link revocation, access attempts, downloads, signatures, and activity timestamps for auditability and support.',
          'Recipients must not forward protected links or credentials unless expressly authorized by the sender or relevant workspace owner.',
          'Where the platform displays open counts, download counts, session labels, or event trails, those records are operational indicators designed to assist governance and support. They should not be treated as a conclusive proof of intent, receipt by a specific legal person, or the full substance of every recipient action.',
        ],
      },
      {
        title: 'No guarantee of recipient identity',
        body: [
          'Password protection, access codes, email-based gating, and similar recipient checks improve operational control but do not guarantee identity beyond the authentication method actually used in that workflow.',
          'If a user requires identity assurance at a higher evidentiary or legal level, that user remains responsible for adding appropriate verification, legal review, or external trust mechanisms.',
          'The operator is not liable merely because a sender chose an authentication mode that was not sufficient for the legal, contractual, or evidentiary standard relevant to the transaction.',
        ],
      },
    ],
  },
  {
    id: 'signed-document-policy',
    href: '/signed-document-policy',
    shortLabel: 'Signed Document Policy',
    title: 'Signed Document Policy',
    subtitle: 'How signed documents, signature events, and certificate outputs are handled.',
    sections: [
      {
        title: 'Signature recordkeeping',
        body: [
          'docrud may capture signature-related operational evidence such as signer-entered identity, drawn signature image, timestamp, IP or session details, location metadata when enabled, and certificate-page records generated by the platform.',
          'These records are intended to support operational traceability and business recordkeeping within the scope of the product.',
          'The operator may also maintain logs concerning access to the document, signature prompts, acknowledgement actions, and related workflow events to support customer audit trails, fraud review, dispute handling, and service support.',
        ],
      },
      {
        title: 'No universal legal guarantee',
        body: [
          'Unless specifically integrated with a legally recognized external signature provider or separately governed process, a signature workflow inside docrud should not be represented as a universal substitute for all legally prescribed forms of execution.',
          'Users remain responsible for confirming whether a document requires a specific statutory execution method, stamp duty handling, witness process, digital signature class, or formal legal review.',
          'Nothing in the signed-document flow should be interpreted as creating automatic legal validity for every instrument, deed, filing, undertaking, board action, employment matter, regulated sector document, or cross-border arrangement.',
        ],
      },
      {
        title: 'Indian electronic signature context',
        body: [
          'Under the Information Technology Act, 2000, electronic signatures and secure electronic signatures carry a statutory framework, and certain forms of recognized electronic authentication may depend on prescribed methods, valid certificates, or licensed trust infrastructure.',
          'Where a transaction specifically requires a Controller of Certifying Authorities-recognized method, a licensed certifying authority workflow, a Digital Signature Certificate, or an approved eSign implementation, users remain responsible for ensuring that the chosen execution flow satisfies that requirement.',
          'Accordingly, customers must not describe every docrud signing event as a government-recognized secure electronic signature unless the relevant workflow is in fact connected to an applicable legally recognized signature infrastructure and process.',
        ],
      },
      {
        title: 'Evidence and proof',
        body: [
          'Signed document records, logs, timestamps, signature images, access events, and appended certificate pages may assist in operational recordkeeping and evidentiary support, but their final evidentiary treatment will depend on applicable law, judicial assessment, and surrounding facts.',
          'Nothing in the platform should be interpreted as a conclusive certificate of legal proof, admissibility, or evidentiary sufficiency in every forum or transaction.',
          'Users remain responsible for preserving related communications, approvals, board or managerial authority records, transaction context, and any other supporting evidence that may be relevant to the legal standing of the signed document.',
        ],
      },
    ],
  },
  {
    id: 'encrypted-document-policy',
    href: '/encrypted-document-policy',
    shortLabel: 'Encrypted Document Policy',
    title: 'Encrypted Document Policy',
    subtitle: 'Controls, responsibilities, and limits for encrypted document delivery.',
    sections: [
      {
        title: 'Encrypted delivery model',
        body: [
          'Where the Document Encrypter feature is used, the file may be stored in encrypted form and made available only after the required password or credential sequence is supplied.',
          'This feature is intended to provide stronger operational protection than ordinary shared delivery, but secure handling still depends on how the sender distributes credentials and manages recipient access.',
          'The feature is designed as an additional software safeguard and not as a standalone legal assurance mechanism. Customers should decide whether the confidentiality level of the underlying document requires additional contractual, organizational, or technical controls.',
        ],
      },
      {
        title: 'Credential handling',
        body: [
          'Senders are responsible for securely handling transfer passwords, secure passwords, parser passwords, or similar decrypt credentials generated or used through the platform.',
          'docrud is not responsible for compromised access that results from the sender or recipient disclosing, reusing, or mishandling those credentials outside the product.',
          'Customers should not transmit all decrypt credentials through the same unsecured communication channel where doing so would materially weaken the intended protection model. Safe credential distribution remains the responsibility of the sender.',
        ],
      },
      {
        title: 'Security commitment and limits',
        body: [
          'The platform is designed to implement reasonable technical and operational controls for protected delivery, but no internet-based system can promise absolute immunity from all unauthorized acts, endpoint compromise, credential theft, or user-side negligence.',
          'Encryption features are intended to strengthen practical delivery protection and should be treated as part of a broader information security discipline rather than as a substitute for internal security practices, access governance, or recipient due diligence.',
          'The operator does not warrant that encrypted delivery will satisfy every secrecy law, banking-grade standard, litigation hold requirement, national-security standard, or highly regulated sector expectation that might apply to a customer’s specific information set.',
        ],
      },
    ],
  },
  {
    id: 'data-privacy-policy',
    href: '/data-privacy-policy',
    shortLabel: 'Data Privacy Policy',
    title: 'Data Privacy Policy',
    subtitle: 'Product-specific privacy controls for documents, files, and AI-driven operations.',
    sections: [
      {
        title: 'Sensitive content handling',
        body: [
          'Because docrud may process documents, spreadsheets, signatures, access logs, and AI analysis requests, users should upload or input only the information their organization is authorized to process and protect.',
          'Where high-risk or regulated data is involved, customers should review internal policy requirements before using advanced features such as AI analysis, encrypted delivery, or external sharing.',
          'Users should apply data minimization in practice and avoid placing unnecessary personal information, secrets, payment credentials, health records, government identifiers, or unrelated confidential material into the platform merely because a feature technically allows file or text input.',
        ],
      },
      {
        title: 'Sensitive personal data and children',
        body: [
          'Users should avoid processing sensitive personal information, highly regulated data, or children’s data through the platform unless they have a valid lawful basis, internal authorization, and an appropriate operational reason to do so.',
          'Where children’s data, health data, financial credentials, biometric information, or other sensitive categories are involved, the customer remains responsible for assessing whether additional consent, notice, security, or legal restrictions apply under Indian law or any other applicable law.',
          'The product is not positioned as a child-directed service, regulated medical record system, banking core system, or biometric identity platform. Customers should therefore apply heightened caution before using it for particularly sensitive categories of information.',
        ],
      },
      {
        title: 'Administrative visibility',
        body: [
          'Super admin and authorized workspace administrators may have visibility into usage, billing, consent status, and certain support-relevant metadata needed to manage the platform responsibly.',
          'Protected document content may remain restricted even where surrounding metadata is visible for operational tracking, entitlement checks, or security review.',
          'Customers who enable internal teams should inform their users, contractors, or personnel as appropriate that administrators may have operational visibility into workspace events, billing state, consent records, and other governance-relevant information within the product.',
        ],
      },
      {
        title: 'Reasonable security practices',
        body: [
          'The operator seeks to maintain reasonable security practices and procedures appropriate to the service model, taking into account the nature of data, account controls, access gating, encryption features, retention needs, and operational risk.',
          'Users acknowledge that reasonable security also depends on workspace configuration, password hygiene, endpoint security, employee conduct, approval discipline, and proper handling of downloaded or exported content outside the platform.',
          'No statement in this policy should be interpreted as a guarantee that any particular dataset, workflow, or customer configuration automatically satisfies every contractual information-security schedule or every legal test that may be asserted in a dispute.',
        ],
      },
      {
        title: 'AI-enabled processing precautions',
        body: [
          'Features such as DoXpert, Visualizer AI, document parser, support AI, and DocSheet AI may process the content supplied by the user in order to generate summaries, visuals, scorecards, recommendations, or workflow outputs. Customers should use such features only for material they are permitted to process through an AI-assisted software flow.',
          'The operator aims to keep those features useful and controlled, but customers remain responsible for deciding whether a specific document, dataset, or internal matter is suitable for AI-assisted handling under their own legal, contractual, and policy obligations.',
        ],
      },
    ],
  },
  {
    id: 'documents-legality',
    href: '/documents-legality-and-standing',
    shortLabel: 'Documents Legality',
    title: 'Documents Legality and Standing',
    subtitle: 'Important guidance on legal standing, enforceability, and user responsibility.',
    sections: [
      {
        title: 'Platform role',
        body: [
          'docrud is a software platform that helps users prepare, review, route, share, sign, and secure documents. It does not itself guarantee that a given document is legally valid, enforceable, admissible, complete, or suitable for a particular jurisdiction or use case.',
          'The legal standing of any document depends on governing law, factual accuracy, authority of the parties, execution method, sector-specific regulation, and the surrounding transaction or relationship.',
          'The operator therefore provides workflow capability and recordkeeping support, not a universal legal certification layer for all document categories or all forms of business reliance.',
        ],
      },
      {
        title: 'Required review',
        body: [
          'Users should obtain qualified legal, tax, HR, finance, or compliance review wherever the document has material consequences or where applicable law requires formal legal treatment.',
          'AI analysis, generated drafts, risk scores, and workflow signals inside docrud are informational product outputs only and should not be treated as conclusive professional advice.',
          'This is particularly important for high-value contracts, employment actions, statutory notices, regulated industry paperwork, investor or board materials, intellectual-property assignments, consumer-facing obligations, and matters likely to result in dispute or evidentiary reliance.',
        ],
      },
      {
        title: 'Indian legal framework context',
        body: [
          'Users should evaluate document standing with regard to the Information Technology Act, 2000, the legal treatment of electronic records and electronic signatures, the evidentiary framework under the Bharatiya Sakshya Adhiniyam, 2023, and any sector-specific or state-specific requirements such as stamp duty, registration, board approvals, employment law, procurement mandates, or regulatory controls.',
          'For contracts formed through electronic means, the product may support business process execution, but the legal standing of the final arrangement still depends on offer, acceptance, authority, consent, statutory compliance, and surrounding facts.',
          'Customers should separately assess whether a matter implicates state stamp laws, registration requirements, company-law approvals, labour-law processes, sector licensing rules, procurement requirements, or contractual notice clauses that cannot be satisfied merely because a document existed or moved through the platform.',
        ],
      },
      {
        title: 'No representation of enforceability',
        body: [
          'Neither docrud nor Corescent Technologies Private Limited represents or warrants that a document processed on the platform will be enforceable, admissible, properly executed, properly stamped, or sufficient for a specific court, authority, tender process, regulator, customer contract, or employment matter.',
          'Users are solely responsible for evaluating the final legal effect of any document or workflow used through the platform.',
          'Where the user requires transaction-specific certainty, the user must obtain appropriate professional advice and should not rely on any product label, score, template name, certificate page, or AI recommendation as a substitute for that review.',
        ],
      },
      {
        title: 'Jurisdictional and evidentiary caution',
        body: [
          'Different jurisdictions, authorities, counterparties, tribunals, and courts may treat electronic records, signatures, metadata, logs, and digital workflow evidence differently. The presence of a platform record does not remove the need to establish authenticity, authority, relevance, and compliance in the context where the document is relied upon.',
          'Accordingly, these pages are intended to help users understand the operational standing of documents processed through the service, while preserving the legal position of docrud and Corescent Technologies Private Limited that final legal outcome remains dependent on applicable law and transaction-specific facts.',
        ],
      },
    ],
  },
];

export function getPolicyDefinitionById(id: PolicyId) {
  return policyDefinitions.find((entry) => entry.id === id);
}
