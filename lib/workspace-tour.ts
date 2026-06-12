export type WorkspaceTourFeatureKey =
  | 'dashboard'
  | 'generate'
  | 'summary'
  | 'history'
  | 'doxpert'
  | 'visualizer'
  | 'docsheet'
  | 'file-transfers'
  | 'billing'
  | 'support'
  | 'daily-tools'
  | 'profile';

export type WorkspaceTourStep = {
  id: string;
  feature: WorkspaceTourFeatureKey;
  title: string;
  description: string;
  whatItDoes: string;
  example: string;
  bestFor: string;
  highlights: string[];
  tip: string;
};

export type WorkspaceTourDefinition = {
  feature: WorkspaceTourFeatureKey;
  label: string;
  summary: string;
  steps: WorkspaceTourStep[];
};

export const WORKSPACE_TOUR_STORAGE_KEY = 'docrud-workspace-tour-seen-v1';

export const workspaceTours: Record<WorkspaceTourFeatureKey, WorkspaceTourDefinition> = {
  dashboard: {
    feature: 'dashboard',
    label: 'Dashboard Tour',
    summary: 'Learn how to use the dashboard as your daily starting point so work, usage, and priorities stay visible.',
    steps: [
      {
        id: 'dashboard-cockpit',
        feature: 'dashboard',
        title: 'Start from the operations cockpit',
        description: 'The dashboard is your daily command center. It surfaces usage, recent activity, and the next feature you should open.',
        whatItDoes: 'This tab brings your most important workspace signals together so you do not have to jump across billing, history, and creation flows just to know what needs attention.',
        example: 'Example: a team lead logs in each morning, sees low remaining plan capacity, notices two documents waiting on signature, and opens the generate tab directly from quick actions.',
        bestFor: 'Best for daily workspace monitoring, prioritizing work, and deciding which module to open next.',
        highlights: [
          'Use the quick actions row to jump into the most-used tools.',
          'Search recent records to find a document, template, or activity trail fast.',
          'Review setup and billing cards first so the workspace stays healthy.',
        ],
        tip: 'Use this tab as your home base and only move into a feature when you are ready to work on that specific task.',
      },
      {
        id: 'dashboard-queues',
        feature: 'dashboard',
        title: 'Monitor active work from the queue panels',
        description: 'The queue sections tell you what needs attention right now, from pending document actions to usage pressure and workspace readiness.',
        whatItDoes: 'The queue and metrics sections help you translate activity into action by showing what is blocked, what is moving, and what needs follow-up first.',
        example: 'Example: if a contract was opened three times but never signed, you can treat it as a follow-up priority instead of assuming the recipient missed it.',
        bestFor: 'Best for managers, operators, and founders who want a quick operational pulse at a glance.',
        highlights: [
          'Check recent generation queues for open links, pending signatures, and follow-ups.',
          'Watch the setup progress and plan thresholds to prevent blockers.',
          'Use tracking cards for a quick pulse on total output and usage trend.',
        ],
        tip: 'If a workspace is just getting started, complete setup tasks before pushing live documents to recipients.',
      },
    ],
  },
  generate: {
    feature: 'generate',
    label: 'Document Generator Tour',
    summary: 'Create business-ready documents faster, then review, secure, and send them from one controlled workspace.',
    steps: [
      {
        id: 'generate-template',
        feature: 'generate',
        title: 'Choose a template and fill the document',
        description: 'Start by selecting a template, filling its fields, and checking the live preview before sending anything out.',
        whatItDoes: 'This area converts structured field input into a polished document draft, so teams can produce standardized documents quickly without rebuilding content each time.',
        example: 'Example: choose an offer letter template, fill employee name, role, start date, and compensation, then review the final preview before sharing it.',
        bestFor: 'Best for offer letters, client agreements, onboarding docs, notices, proposals, and repeatable business documents.',
        highlights: [
          'Template fields drive the generated document content and final output.',
          'AI drafting can help with faster first drafts when you want a starting point.',
          'Keep the preview panel open to catch formatting or clause issues early.',
        ],
        tip: 'Treat the preview like your final quality gate before creating a share link or PDF.',
      },
      {
        id: 'generate-governance',
        feature: 'generate',
        title: 'Apply delivery and governance controls',
        description: 'This tab also handles watermarking, signature requirements, password-protected sharing, and recipient permissions.',
        whatItDoes: 'It adds operational control to the document so sharing is not just fast, but secure and trackable.',
        example: 'Example: send a confidential proposal with a watermark, a password, and signer-only access so the recipient can review and sign but not misuse the draft.',
        bestFor: 'Best for sensitive, client-facing, or approval-heavy documents that need stronger governance.',
        highlights: [
          'Set per-document watermarks for internal review or controlled circulation.',
          'Choose whether the recipient can review, sign, or collect data only.',
          'Use secure send flows whenever the document will leave your internal team.',
        ],
        tip: 'For high-value documents, always use watermark + password + recipient signature together.',
      },
    ],
  },
  summary: {
    feature: 'summary',
    label: 'Document Review Tour',
    summary: 'Review document quality, risk, and obligations before you send, approve, or sign anything important.',
    steps: [
      {
        id: 'summary-parser',
        feature: 'summary',
        title: 'Paste or review document content here',
        description: 'The parser helps you inspect a document before it is sent, shared, approved, or signed.',
        whatItDoes: 'This feature reads the document like a structured reviewer and breaks it into quality, risk, and obligation signals instead of leaving you with raw text only.',
        example: 'Example: paste a vendor agreement and instantly see whether payment terms, responsibilities, and missing clauses create risk before you sign or share it.',
        bestFor: 'Best for contracts, policies, notices, proposals, and any document that should be reviewed before action is taken.',
        highlights: [
          'Enter document content to generate an executive summary and score.',
          'Review clarity, compliance, completeness, professionalism, and risk exposure.',
          'Save parser sessions so the same document can be reopened and refined later.',
        ],
        tip: 'Use this feature before sharing a high-risk or client-facing document.',
      },
      {
        id: 'summary-actions',
        feature: 'summary',
        title: 'Act on risks and recommendations',
        description: 'The insight panels break the result into details, risks, mitigations, obligations, and next steps.',
        whatItDoes: 'It converts analysis into action by telling the user what appears risky, what can be improved, and what responsibilities are hidden in the wording.',
        example: 'Example: the parser may flag that the document has vague payment timelines and recommend adding a due date clause before sharing it externally.',
        bestFor: 'Best for pre-send quality review, legal coordination, and document hardening before approval.',
        highlights: [
          'Read mitigations before finalizing the document.',
          'Use obligations to identify action items hidden in the text.',
          'Keep parser history for comparison between draft revisions.',
        ],
        tip: 'If the risk score feels high, revise the draft first and re-run the parser before sharing it.',
      },
    ],
  },
  history: {
    feature: 'history',
    label: 'History Tour',
    summary: 'Reopen past work, confirm what happened, and follow up with confidence from one audit trail.',
    steps: [
      {
        id: 'history-tracking',
        feature: 'history',
        title: 'Use history as the audit trail',
        description: 'Every generated or shared document can be reopened from history with its activity and delivery context.',
        whatItDoes: 'History preserves what was created, when it was sent, how it was accessed, and whether it was signed, commented on, or reused.',
        example: 'Example: reopen an old HR letter, copy its link, verify it was downloaded, and reuse it as the base for a fresh version.',
        bestFor: 'Best for audits, follow-up tracking, proof of delivery, and document reuse.',
        highlights: [
          'Review opens, downloads, comments, reviews, and sign events.',
          'Reuse older items when you need to regenerate a similar document quickly.',
          'Copy or reopen links directly from the saved record.',
        ],
        tip: 'History is the fastest place to verify if a recipient really accessed a document.',
      },
    ],
  },
  doxpert: {
    feature: 'doxpert',
    label: 'DoXpert Tour',
    summary: 'Use DoXpert when you need document advice, risk warnings, and stronger next-step guidance before you act.',
    steps: [
      {
        id: 'doxpert-analysis',
        feature: 'doxpert',
        title: 'Ask DoXpert for document intelligence',
        description: 'DoXpert is designed to read your text and return a more advisory-style report than the standard parser.',
        whatItDoes: 'DoXpert behaves like an AI document advisor. It scores the text, reads the tone, flags harmful wording, and suggests what should be added or replied back.',
        example: 'Example: if a freelancer receives a contract, DoXpert can flag one-sided liability language and suggest a safer counterpoint to negotiate back.',
        bestFor: 'Best for negotiations, high-risk drafts, external documents, and situations where users need advisory guidance rather than just a summary.',
        highlights: [
          'Review sentiment, trust score, score breakdown, and risk warnings.',
          'See what can be added or replied back to strengthen the document.',
          'Use it when you need a more strategic reading of the content.',
        ],
        tip: 'DoXpert is best for high-stakes documents where you want advisory guidance, not just a generic summary.',
      },
    ],
  },
  visualizer: {
    feature: 'visualizer',
    label: 'Visualizer AI Tour',
    summary: 'Turn rows, trackers, and dense reports into visuals and insights that are easier for real teams to act on.',
    steps: [
      {
        id: 'visualizer-input',
        feature: 'visualizer',
        title: 'Feed the visualizer with table-like data',
        description: 'Paste spreadsheet-style extracts or dense report content, then choose which stats you want to see first.',
        whatItDoes: 'The visualizer translates heavy data into charts and insight cards so non-technical users can understand a sheet or report faster.',
        example: 'Example: paste a sales tracker with region and revenue columns, then ask for totals, top performers, and distribution to get charts immediately.',
        bestFor: 'Best for MIS, exports, trackers, month-end summaries, spreadsheets, and large business reports.',
        highlights: [
          'The tool can detect categories, totals, trends, and top performers.',
          'Stat selection keeps the visuals focused on what matters to you.',
          'CSV output is generated automatically for structured data.',
        ],
        tip: 'Use clean headers and consistent rows to get the best chart output.',
      },
      {
        id: 'visualizer-model',
        feature: 'visualizer',
        title: 'Adjust the live model and re-save',
        description: 'You can edit the spreadsheet model, save changes, and immediately refresh the graphics and insights.',
        whatItDoes: 'This lets users fix or simulate values before reading the visuals, so the insight layer reflects the corrected data rather than stale pasted content.',
        example: 'Example: update a quarterly total in the model, save it, and watch the bar chart, summary stats, and anomaly cards refresh from the new value.',
        bestFor: 'Best for what-if analysis, cleaned reporting, and explaining data to business stakeholders.',
        highlights: [
          'Charts update from the saved values in the model.',
          'Deep insights explain anomalies, concentration, volatility, and momentum.',
          'Use the visuals for leadership briefings, MIS, and tracker reviews.',
        ],
        tip: 'Save spreadsheet edits in batches so the visual story stays intentional and easy to compare.',
      },
    ],
  },
  docsheet: {
    feature: 'docsheet',
    label: 'DocSheet Tour',
    summary: 'Use DocSheet as your working spreadsheet space for trackers, lists, calculations, and AI-ready business data.',
    steps: [
      {
        id: 'docsheet-grid',
        feature: 'docsheet',
        title: 'Build and edit your workbook',
        description: 'DocSheet gives you rows, columns, sheets, formulas, and export controls inside docrud.',
        whatItDoes: 'DocSheet is your in-product spreadsheet workspace for building structured datasets instead of depending on a separate external sheet tool.',
        example: 'Example: create a hiring tracker with candidate, role, status, and offer value columns, then calculate totals using formulas.',
        bestFor: 'Best for trackers, internal registers, MIS prep, list-based workflows, and data collection that later feeds AI analysis.',
        highlights: [
          'Add sheets, rows, columns, and typed cell values.',
          'Use formulas and the formula bar for spreadsheet-style calculations.',
          'Keep the active sheet exportable as CSV whenever you need it.',
        ],
        tip: 'Structure your first row clearly so downstream visualizer insights are more accurate.',
      },
      {
        id: 'docsheet-ai',
        feature: 'docsheet',
        title: 'Connect DocSheet to AI insights',
        description: 'DocSheet is not just for entry. It is the cleanest way to prepare structured data for visual analysis.',
        whatItDoes: 'It bridges raw spreadsheet work with charting and insight generation so the same data can move into AI-driven visuals smoothly.',
        example: 'Example: after building a team expense sheet, send its values into the visualizer to understand spend concentration and unusual spikes.',
        bestFor: 'Best for teams who want to prepare data cleanly before generating visuals or reports.',
        highlights: [
          'Saved sheets can be reused, exported, and copied into the visualizer flow.',
          'Computed values stay available for analysis and charting.',
          'Use sheet duplication for scenario planning before sharing the final model.',
        ],
        tip: 'Treat one sheet as the source of truth and duplicate it for experiments or what-if changes.',
      },
    ],
  },
  'file-transfers': {
    feature: 'file-transfers',
    label: 'File Transfers Tour',
    summary: 'Send files more professionally with secure links, folders, expiry controls, and visible delivery tracking.',
    steps: [
      {
        id: 'file-transfers-manager',
        feature: 'file-transfers',
        title: 'Manage files like a secure repository',
        description: 'The file manager lets you organize folders, upload files, and generate shareable open links or document links.',
        whatItDoes: 'This module gives you a managed file-sharing layer with organization, security controls, and link formats designed for business use.',
        example: 'Example: upload a compliance PDF into a client folder, protect it with a password, and share a clean open link over email or WhatsApp.',
        bestFor: 'Best for secure delivery of files, client handoffs, project folders, and trackable document exchange.',
        highlights: [
          'Create folders to keep files grouped by client, project, or use case.',
          'Use password or extra auth controls for sensitive transfers.',
          'Generate direct links you can place on external platforms.',
        ],
        tip: 'Keep link naming and folder naming clean so analytics stay readable later.',
      },
      {
        id: 'file-transfers-analytics',
        feature: 'file-transfers',
        title: 'Track file activity after sharing',
        description: 'This module is designed for secure distribution plus proof of engagement.',
        whatItDoes: 'It shows whether recipients actually opened or downloaded the transferred file, instead of leaving file sharing as a blind handoff.',
        example: 'Example: you can see that a pricing pack was opened twice but never downloaded, which helps you decide whether to follow up.',
        bestFor: 'Best for sales handoffs, compliance evidence, delivery proof, and monitored client sharing.',
        highlights: [
          'Watch opens, downloads, last activity, and link status.',
          'Revoke or expire links when the transfer window is over.',
          'Use the analytics cards to understand which files are actually being consumed.',
        ],
        tip: 'If a file is business-critical, keep an eye on both opens and downloads instead of just sharing the link once.',
      },
    ],
  },
  billing: {
    feature: 'billing',
    label: 'Billing Tour',
    summary: 'Keep plan limits, upgrade timing, payment history, and billing decisions visible before work gets blocked.',
    steps: [
      {
        id: 'billing-limits',
        feature: 'billing',
        title: 'Stay ahead of thresholds',
        description: 'The billing center shows what plan you are on, where you are against limits, and when resources may run out.',
        whatItDoes: 'This page helps you understand the commercial health of the workspace before work gets blocked by plan exhaustion.',
        example: 'Example: if remaining generations are low and your team is accelerating usage this week, billing will warn you before the limit is reached.',
        bestFor: 'Best for owners, admins, and operators who need to keep the workspace usable without sudden disruption.',
        highlights: [
          'Check cycle-aware usage instead of guessing from lifetime counts.',
          'Use threshold states to act before the team hits a limit.',
          'Review plan comparisons directly from the dashboard.',
        ],
        tip: 'Upgrade when the workspace enters watch or critical state, not after work is blocked.',
      },
      {
        id: 'billing-checkout',
        feature: 'billing',
        title: 'Purchase and continue without disruption',
        description: 'Checkout and payment history sit in the same flow so teams can buy a plan and keep moving.',
        whatItDoes: 'It combines plan comparison, checkout, and billing records into one premium flow so upgrades are operationally smooth.',
        example: 'Example: move from a starter plan to business as soon as usage enters a critical state, then continue working without leaving the workspace.',
        bestFor: 'Best for fast-growing users and teams who need immediate upgrades and clean billing history.',
        highlights: [
          'Launch plan purchase directly from the billing center.',
          'Review transactions and billing mode in one place.',
          'Use profile and billing together to understand usage pressure clearly.',
        ],
        tip: 'For growing teams, review projected exhaustion rather than only current usage.',
      },
    ],
  },
  support: {
    feature: 'support',
    label: 'AI Support Tour',
    summary: 'Get product help fast when users are stuck, confused, or trying to find the right next step.',
    steps: [
      {
        id: 'support-guidance',
        feature: 'support',
        title: 'Use AI support for operational questions',
        description: 'Support is built to answer product questions and guide users toward the right feature or action.',
        whatItDoes: 'This is the in-product help desk for users who need answers, next steps, or guided support without reading documentation first.',
        example: 'Example: ask “How do I send a password-protected file link?” and support will point you to file transfers with the correct workflow.',
        bestFor: 'Best for onboarding users, support deflection, and reducing confusion during daily operations.',
        highlights: [
          'Use the suggested prompts for common setup and usage questions.',
          'Ask about file transfers, billing, DoXpert, DocSheet, and document flows.',
          'Get guided answers even if the full AI path is unavailable.',
        ],
        tip: 'If a teammate is stuck, start here before hunting through settings or tutorials.',
      },
    ],
  },
  'daily-tools': {
    feature: 'daily-tools',
    label: 'Daily Tools Tour',
    summary: 'Handle quick file work inside docrud so users do not need extra tools for everyday conversions and cleanup.',
    steps: [
      {
        id: 'daily-tools-pick',
        feature: 'daily-tools',
        title: 'Choose the right utility for the job',
        description: 'Daily Tools groups practical file operations into one panel so users do not have to leave docrud for small but frequent tasks.',
        whatItDoes: 'This module gives users instant access to everyday utilities like document conversion, image compression, PDF merging, splitting, cleanup, and sheet format conversion.',
        example: 'Example: convert a CSV to Excel, merge two PDFs, compress a JPG for email sharing, and package documents into a ZIP without leaving the workspace.',
        bestFor: 'Best for admins, operators, coordinators, founders, and solo users who handle files constantly during day-to-day operations.',
        highlights: [
          'Pick from converters, compressors, PDF tools, and spreadsheet helpers.',
          'Every tool is unlocked after login without needing a separate purchase path.',
          'Processed files are downloaded immediately for operational use.',
        ],
        tip: 'Start here for quick preparation work before sharing a file through File Transfers or using it in another docrud workflow.',
      },
      {
        id: 'daily-tools-flow',
        feature: 'daily-tools',
        title: 'Upload, process, and download in one loop',
        description: 'Each utility follows the same simple pattern so teammates can learn it once and reuse it confidently.',
        whatItDoes: 'It keeps daily file handling predictable by using one workspace for upload, action, and result instead of multiple external utilities.',
        example: 'Example: upload a long PDF, remove extra pages, rotate the final pages correctly, then download the cleaned copy for governed sharing.',
        bestFor: 'Best for file cleanup, prep work, daily office document tasks, and lighter operations that should not require a paid workflow decision.',
        highlights: [
          'Use status messages to confirm the file was processed successfully.',
          'Switch between tools without leaving the workspace panel.',
          'Download output immediately once the action is complete.',
        ],
        tip: 'Use the lightweight tools first, then move into premium workflows like DoXpert, File Transfers, or Document Encrypter only when needed.',
      },
    ],
  },
  profile: {
    feature: 'profile',
    label: 'Profile Tour',
    summary: 'Understand your account, usage pattern, and remaining runway from one clear user cockpit.',
    steps: [
      {
        id: 'profile-usage',
        feature: 'profile',
        title: 'Read your plan and usage clearly',
        description: 'The profile area is your personal account cockpit for subscriptions, limits, and consumption pace.',
        whatItDoes: 'Profile turns account status, current plan, and usage pace into a readable operating summary for the user.',
        example: 'Example: an individual user can see how much of the pay-as-you-go pack is left and roughly when it may run out at the current pace.',
        bestFor: 'Best for checking plan fit, forecasting resource exhaustion, and reviewing usage behavior.',
        highlights: [
          'Review subscribed plan and active limitations.',
          'Watch usage trends and estimated exhaustion timing.',
          'Pair this page with billing for better upgrade timing.',
        ],
        tip: 'Make this your first stop when you want to understand whether your plan still fits your workload.',
      },
    ],
  },
};

export const fullWorkspaceTour: WorkspaceTourStep[] = [
  ...workspaceTours.dashboard.steps,
  ...workspaceTours.generate.steps,
  ...workspaceTours.summary.steps,
  ...workspaceTours.doxpert.steps,
  ...workspaceTours.visualizer.steps,
  ...workspaceTours.docsheet.steps,
  ...workspaceTours['daily-tools'].steps,
  ...workspaceTours['file-transfers'].steps,
  ...workspaceTours.history.steps,
  ...workspaceTours.billing.steps,
  ...workspaceTours.support.steps,
  ...workspaceTours.profile.steps,
];
