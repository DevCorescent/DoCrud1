export type DocumentQuickAction =
  | 'summary'
  | 'elaborate'
  | 'proofread'
  | 'analyse'
  | 'score'
  | 'legal'
  | 'rewrite'
  | 'enterprise';

export type UploadedDocumentMeta = {
  documentTitle: string;
  documentType: string;
  mainTopic: string;
  purpose: string;
  targetAudience: string;
  language: string;
  tone: string;
  wordCount: number;
  pageCount?: number;
  keySections: string[];
  keyEntities: string[];
  dates: string[];
  names: string[];
  financialValues: string[];
  legalClauses: string[];
  actionItems: string[];
  risks: string[];
  missingInformation: string[];
  overallQualityScore: number;
  intent: string;
};

export type UploadedDocument = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  extractedText: string;
  extractedAt: string;
  meta: UploadedDocumentMeta;
};

export type AssistantTable = {
  title?: string;
  columns: string[];
  rows: string[][];
};

export type AssistantResultCard = {
  title: string;
  shortAnswer: string;
  keyPoints: string[];
  detailedExplanation: string[];
  extractedFacts: Array<{ label: string; value: string }>;
  primaryTextLabel?: string;
  primaryText?: string;
  tables?: AssistantTable[];
  recommendations: string[];
  missingInfo: string[];
  disclaimer?: string;
  confidence: number;
};
