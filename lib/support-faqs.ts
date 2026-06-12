export type SupportFaq = {
  id: string;
  category: string;
  question: string;
  answer: string;
  actions: string[];
};

export const supportFaqs: SupportFaq[] = [
  {
    id: 'getting-started',
    category: 'Getting Started',
    question: 'How do I start using docrud after login?',
    answer: 'Open the dashboard first, review your setup status, then move into E-sign Documents, DoXpert, File Transfers, or DocSheet based on what you need to complete today.',
    actions: ['Open Dashboard', 'Review Profile and Billing', 'Generate your first document'],
  },
  {
    id: 'billing-limits',
    category: 'Billing',
    question: 'Where can I see my plan limits and remaining usage?',
    answer: 'Open Subscriptions & Billing or Profile in the workspace. Both surfaces show the current plan, remaining generations, usage pressure, and when you are approaching the threshold.',
    actions: ['Open Subscriptions & Billing', 'Review Profile runway', 'Upgrade before limit is reached'],
  },
  {
    id: 'send-document',
    category: 'Document Sharing',
    question: 'How do I send a password-protected document?',
    answer: 'Go to E-sign Documents, create or upload the record, then use the secure sharing flow to issue a protected link. You can require password access, recipient review, and e-signing where supported.',
    actions: ['Open E-sign Documents', 'Enable protected sharing', 'Copy or email the secure link'],
  },
  {
    id: 'file-transfer',
    category: 'File Transfers',
    question: 'How do file transfers work?',
    answer: 'File Transfers lets you upload files, place them into folders, create protected links, track opens and downloads, and revoke access whenever needed.',
    actions: ['Open File Transfers', 'Create a folder', 'Generate a secure open link'],
  },
  {
    id: 'doxpert-usage',
    category: 'DoXpert',
    question: 'What does DoXpert AI help with?',
    answer: 'DoXpert reads pasted document text, summarizes it, scores clarity and risk, flags harmful terms, and suggests what to add or reply with before you act on the document.',
    actions: ['Open DoXpert AI', 'Paste the document text', 'Review risks and recommended additions'],
  },
  {
    id: 'visualizer-usage',
    category: 'Visualizer',
    question: 'What can Visualizer AI do with my data?',
    answer: 'Visualizer AI turns tabular or report-style content into charts, insights, anomalies, and easier executive summaries so teams can understand the data faster.',
    actions: ['Open Visualizer AI', 'Paste the table or report extract', 'Choose the stat types you want to see'],
  },
  {
    id: 'docsheet-usage',
    category: 'DocSheet',
    question: 'How do I use DocSheet?',
    answer: 'DocSheet is the spreadsheet workspace inside docrud. You can create sheets, edit cells, apply formulas, export CSV, and feed the active sheet into Visualizer AI.',
    actions: ['Open DocSheet', 'Create or update workbook rows', 'Send active sheet to Visualizer AI'],
  },
  {
    id: 'marketplace-kyc',
    category: 'Dexperts',
    question: 'How do KYC and verification work for Dexperts?',
    answer: 'A Dexpert can submit profile and KYC details from the workspace. Super admin reviews the submission and can mark the listing as verified, rejected, or pending.',
    actions: ['Open Dexperts in workspace', 'Submit KYC', 'Wait for super admin review'],
  },
];

export const supportQuickPrompts = [
  'How do I start with docrud?',
  'Where do I check plan limits?',
  'How do I send a password-protected document?',
  'How do file transfers and tracking work?',
  'What does DoXpert AI do?',
  'How do I use DocSheet and Visualizer together?',
];
