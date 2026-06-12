'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Archive, FileDown, FileImage, FileSpreadsheet, FileText, Hash, KeyRound, Loader2, QrCode, RefreshCw, Scissors, ShieldCheck, Sparkles, Wand2 } from 'lucide-react';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { buildAbsoluteAppUrl, buildQrImageUrl } from '@/lib/url';
import type { FormAppearance, FormBanner, FormCtaButton, FormMediaSlide } from '@/types/document';

type ToolId =
  | 'doc-to-pdf'
  | 'document-compressor'
  | 'image-compressor'
  | 'image-to-pdf'
  | 'pdf-merger'
  | 'pdf-splitter'
  | 'pdf-page-remover'
  | 'pdf-rotator'
  | 'csv-to-excel'
  | 'excel-to-csv'
  | 'image-resizer'
  | 'image-format-converter'
  | 'password-generator'
  | 'json-formatter'
  | 'qr-generator'
  | 'text-case-converter'
  | 'word-counter'
  | 'url-encoder'
  | 'form-builder'
  | 'base64-tool'
  | 'slug-generator'
  | 'html-escape'
  | 'duplicate-line-remover'
  | 'uuid-generator'
  | 'hash-generator'
  | 'unix-time-converter'
  | 'color-converter'
  | 'lorem-generator'
  | 'text-sorter';

type ToolCategory = 'convert' | 'pdf' | 'image' | 'sheet' | 'security' | 'utility' | 'forms';

type ToolMeta = {
  id: ToolId;
  label: string;
  description: string;
  icon: typeof FileText;
  badge: string;
  category: ToolCategory;
};

const toolMeta: ToolMeta[] = [
  { id: 'doc-to-pdf', label: 'Doc to PDF', description: 'Turn text-based files and images into downloadable PDFs.', icon: FileText, badge: 'Converter', category: 'convert' },
  { id: 'document-compressor', label: 'Document Compressor', description: 'Compress one or more files into a smaller ZIP package.', icon: Archive, badge: 'Compressor', category: 'convert' },
  { id: 'image-compressor', label: 'Image Compressor', description: 'Reduce image size with controlled quality output.', icon: FileImage, badge: 'Compressor', category: 'image' },
  { id: 'image-to-pdf', label: 'Image to PDF', description: 'Combine one or more images into a single PDF.', icon: FileImage, badge: 'Converter', category: 'convert' },
  { id: 'pdf-merger', label: 'PDF Merger', description: 'Merge multiple PDFs into one file for easy sharing.', icon: FileDown, badge: 'PDF Tool', category: 'pdf' },
  { id: 'pdf-splitter', label: 'PDF Splitter', description: 'Extract a selected range of pages into a new PDF.', icon: Scissors, badge: 'PDF Tool', category: 'pdf' },
  { id: 'pdf-page-remover', label: 'PDF Page Remover', description: 'Remove unwanted pages and download a cleaner PDF.', icon: Scissors, badge: 'PDF Tool', category: 'pdf' },
  { id: 'pdf-rotator', label: 'PDF Rotator', description: 'Rotate all pages of a PDF for corrected orientation.', icon: Wand2, badge: 'PDF Tool', category: 'pdf' },
  { id: 'csv-to-excel', label: 'CSV to Excel', description: 'Convert CSV data into an XLSX workbook.', icon: FileSpreadsheet, badge: 'Spreadsheet', category: 'sheet' },
  { id: 'excel-to-csv', label: 'Excel to CSV', description: 'Convert Excel sheets into CSV output for downstream use.', icon: FileSpreadsheet, badge: 'Spreadsheet', category: 'sheet' },
  { id: 'image-resizer', label: 'Image Resizer', description: 'Resize images to a cleaner width for upload or sharing.', icon: FileImage, badge: 'Image Tool', category: 'image' },
  { id: 'image-format-converter', label: 'Image Format', description: 'Convert PNG, JPG, or WEBP images into another format.', icon: RefreshCw, badge: 'Image Tool', category: 'image' },
  { id: 'password-generator', label: 'Password Generator', description: 'Create stronger passwords instantly for daily secure sharing.', icon: KeyRound, badge: 'Security', category: 'security' },
  { id: 'json-formatter', label: 'JSON Formatter', description: 'Format and clean JSON for quick daily developer or ops work.', icon: FileText, badge: 'Utility', category: 'utility' },
  { id: 'qr-generator', label: 'QR Generator', description: 'Turn text, links, or contact info into a scannable QR code.', icon: QrCode, badge: 'Utility', category: 'utility' },
  { id: 'text-case-converter', label: 'Text Case', description: 'Convert text into upper, lower, title, or sentence case.', icon: FileText, badge: 'Utility', category: 'utility' },
  { id: 'word-counter', label: 'Word Counter', description: 'Count words, characters, and lines in pasted text instantly.', icon: FileText, badge: 'Utility', category: 'utility' },
  { id: 'url-encoder', label: 'URL Encoder', description: 'Encode or decode URLs and query strings quickly.', icon: FileText, badge: 'Utility', category: 'utility' },
  { id: 'form-builder', label: 'Form Builder', description: 'Create secure or open forms, share them, and collect responses.', icon: FileSpreadsheet, badge: 'Forms', category: 'forms' },
  { id: 'base64-tool', label: 'Base64 Tool', description: 'Encode or decode text for transfer and integrations.', icon: FileText, badge: 'Utility', category: 'utility' },
  { id: 'slug-generator', label: 'Slug Generator', description: 'Turn titles into clean URL or file slugs instantly.', icon: FileText, badge: 'Utility', category: 'utility' },
  { id: 'html-escape', label: 'HTML Escape', description: 'Escape or unescape HTML safely for quick markup work.', icon: FileText, badge: 'Utility', category: 'utility' },
  { id: 'duplicate-line-remover', label: 'Remove Duplicates', description: 'Clean repeated lines from pasted text in one click.', icon: FileText, badge: 'Utility', category: 'utility' },
  { id: 'uuid-generator', label: 'UUID Generator', description: 'Create fresh UUIDs for ops, testing, and references.', icon: Sparkles, badge: 'Utility', category: 'utility' },
  { id: 'hash-generator', label: 'Hash Generator', description: 'Generate SHA hashes for any text payload.', icon: Hash, badge: 'Security', category: 'security' },
  { id: 'unix-time-converter', label: 'Timestamp Tool', description: 'Convert dates to UNIX time and read UNIX time back.', icon: RefreshCw, badge: 'Utility', category: 'utility' },
  { id: 'color-converter', label: 'Color Converter', description: 'Move between HEX and RGB color values quickly.', icon: Wand2, badge: 'Utility', category: 'utility' },
  { id: 'lorem-generator', label: 'Lorem Generator', description: 'Generate clean placeholder paragraphs for drafts and demos.', icon: FileText, badge: 'Utility', category: 'utility' },
  { id: 'text-sorter', label: 'Text Sorter', description: 'Sort, reverse, and tidy line-based text lists.', icon: FileText, badge: 'Utility', category: 'utility' },
];

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 KB';
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function slugifyFileName(value: string, fallback: string) {
  const normalized = value.replace(/\.[^/.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function parseNumberList(value: string, max: number) {
  const pages = new Set<number>();
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((token) => {
      const page = Number(token);
      if (Number.isInteger(page) && page >= 1 && page <= max) {
        pages.add(page);
      }
    });
  return Array.from(pages).sort((a, b) => a - b);
}

function parsePageRange(value: string, max: number) {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  const matches = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
  if (matches) {
    const start = Number(matches[1]);
    const end = Number(matches[2]);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
      return [];
    }
    const pages: number[] = [];
    for (let page = start; page <= Math.min(end, max); page += 1) {
      pages.push(page);
    }
    return pages;
  }

  return parseNumberList(trimmed, max);
}

function wrapText(text: string, maxChars = 94) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  words.forEach((word) => {
    const nextLine = current ? `${current} ${word}` : word;
    if (nextLine.length > maxChars) {
      if (current) {
        lines.push(current);
      }
      current = word;
    } else {
      current = nextLine;
    }
  });

  if (current) {
    lines.push(current);
  }

  return lines;
}

async function readDocLikeText(file: File) {
  const lower = file.name.toLowerCase();

  if (lower.endsWith('.docx')) {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value || '';
  }

  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const first = workbook.SheetNames[0];
    if (!first) {
      return '';
    }
    return XLSX.utils.sheet_to_csv(workbook.Sheets[first]);
  }

  const text = await file.text();
  if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return text;
}

async function createTextPdf(content: string, title: string) {
  const pdfDoc = await PDFDocument.create();
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 42;
  const lineHeight = 16;
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const sanitized = content.replace(/\r/g, '');
  const sections = sanitized.split('\n').flatMap((line) => wrapText(line || ' ', 92));

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const addNewPage = () => {
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
  };

  page.drawText(title, {
    x: margin,
    y,
    size: 20,
    font: boldFont,
    color: rgb(0.06, 0.09, 0.16),
  });
  y -= 28;
  page.drawText('Generated by docrud Daily Tools', {
    x: margin,
    y,
    size: 10,
    font,
    color: rgb(0.39, 0.45, 0.55),
  });
  y -= 22;

  sections.forEach((line) => {
    if (y <= margin) {
      addNewPage();
    }
    page.drawText(line, {
      x: margin,
      y,
      size: 11,
      font,
      color: rgb(0.15, 0.18, 0.24),
      maxWidth: pageWidth - margin * 2,
      lineHeight,
    });
    y -= lineHeight;
  });

  return pdfDoc.save();
}

async function createImagePdf(files: File[]) {
  const pdfDoc = await PDFDocument.create();

  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const mime = file.type.toLowerCase();
    const image = mime.includes('png')
      ? await pdfDoc.embedPng(bytes)
      : await pdfDoc.embedJpg(bytes);
    const page = pdfDoc.addPage([image.width, image.height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });
  }

  return pdfDoc.save();
}

async function compressImage(file: File, quality: number, outputType: 'image/jpeg' | 'image/webp') {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const maxWidth = 2200;
  const ratio = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1;
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Image canvas is not supported in this browser.');
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Unable to compress this image.'));
        return;
      }
      resolve(blob);
    }, outputType, quality);
  });
}

async function exportImageVariant(
  file: File,
  outputType: 'image/jpeg' | 'image/webp' | 'image/png',
  options?: { maxWidth?: number; quality?: number },
) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const maxWidth = options?.maxWidth || bitmap.width;
  const ratio = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1;
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Image canvas is not supported in this browser.');
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Unable to process this image.'));
        return;
      }
      resolve(blob);
    }, outputType, options?.quality ?? 0.9);
  });
}

function buildPassword(length: number, withSymbols: boolean) {
  const base = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const symbols = '!@#$%^&*_-+=?';
  const pool = `${base}${withSymbols ? symbols : ''}`;
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => pool[value % pool.length]).join('');
}

const categoryMeta: Array<{ id: ToolCategory; label: string }> = [
  { id: 'convert', label: 'Convert' },
  { id: 'pdf', label: 'PDF' },
  { id: 'image', label: 'Image' },
  { id: 'sheet', label: 'Sheets' },
  { id: 'security', label: 'Security' },
  { id: 'utility', label: 'Utility' },
  { id: 'forms', label: 'Forms' },
];

type FormBuilderField = {
  id: string;
  label: string;
  name: string;
  type: 'text' | 'textarea' | 'email' | 'number' | 'date' | 'select' | 'tel' | 'url' | 'checkbox' | 'radio' | 'image';
  placeholder: string;
  required: boolean;
  options: string;
};

type SavedFormRecord = {
  id: string;
  name: string;
  description?: string;
  updatedAt?: string;
  createdAt?: string;
  fields: Array<{
    id: string;
    label: string;
    name: string;
    type: FormBuilderField['type'];
    required: boolean;
    placeholder?: string;
    options?: string[];
  }>;
  shareUrl?: string;
  sharePassword?: string;
  requiresPassword: boolean;
  instructions?: string;
  accessMode: 'secure' | 'open';
  expiryAt?: string;
  maxResponses?: number;
  submissions: Array<{
    id: string;
    submittedAt: string;
    submittedBy: string;
    data: Record<string, string>;
  }>;
  latestSubmissionAt?: string;
  latestSubmissionBy?: string;
  appearance?: FormAppearance;
  insights: {
    totalSubmissions: number;
    averageCompletionRate: number;
    imageAttachmentRate?: number;
    responseVelocity?: string;
    submissionsPerDay?: number;
    recentTrend?: Array<{ submittedAt: string; submittedBy: string; completionRate: number }>;
    strongestFields: Array<{ field: string; type?: string; fillRate: number; emptyCount: number; sampleValues: string[] }>;
    weakestFields: Array<{ field: string; type?: string; fillRate: number; emptyCount: number; sampleValues: string[] }>;
    recommendations: string[];
    summary: string;
  };
};

type FormAppearanceDraft = {
  eyebrow: string;
  heroTitle: string;
  heroDescription: string;
  introNote: string;
  footerNote: string;
  submitLabel: string;
  successMessage: string;
  surfaceTone: NonNullable<FormAppearance['surfaceTone']>;
  cardStyle: NonNullable<FormAppearance['cardStyle']>;
  buttonStyle: NonNullable<FormAppearance['buttonStyle']>;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  showFieldTypes: boolean;
  showOptionChips: boolean;
  mediaSlides: FormMediaSlide[];
  ctaButtons: FormCtaButton[];
  whatsappNumber: string;
  whatsappMessage: string;
  banners: FormBanner[];
  allowSingleEditAfterSubmit: boolean;
  showSubmissionHistory: boolean;
  heroAlignment: 'left' | 'center';
  fieldColumns: 1 | 2;
  submitButtonWidth: 'full' | 'fit';
  thankYouRedirectUrl: string;
};

function createFormFieldDraft(index: number, overrides: Partial<FormBuilderField> = {}): FormBuilderField {
  const baseLabel = overrides.label || `Field ${index + 1}`;
  return {
    id: `form-field-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    label: baseLabel,
    name: overrides.name || toSlug(baseLabel).replace(/-/g, '_'),
    type: overrides.type || 'text',
    placeholder: overrides.placeholder || '',
    required: overrides.required ?? false,
    options: overrides.options || '',
  };
}

function buildAiFormDraft(prompt: string) {
  const normalized = prompt.trim().toLowerCase();
  const has = (value: string) => normalized.includes(value);

  const templates = [
    {
      match: ['job', 'hiring', 'candidate', 'recruitment'],
      title: 'Candidate Application Form',
      description: 'Collect applicant details, experience, and supporting information in one structured form.',
      instructions: 'Fill in all required details carefully and upload any requested supporting documents.',
      accessMode: 'secure' as const,
      fields: [
        createFormFieldDraft(0, { label: 'Full Name', name: 'full_name', type: 'text', placeholder: 'Enter your full name', required: true }),
        createFormFieldDraft(1, { label: 'Email Address', name: 'email_address', type: 'email', placeholder: 'name@example.com', required: true }),
        createFormFieldDraft(2, { label: 'Phone Number', name: 'phone_number', type: 'tel', placeholder: '+91 98765 43210', required: true }),
        createFormFieldDraft(3, { label: 'Role Applied For', name: 'role_applied_for', type: 'text', placeholder: 'Enter the role name', required: true }),
        createFormFieldDraft(4, { label: 'Years of Experience', name: 'years_of_experience', type: 'number', placeholder: 'e.g. 5', required: true }),
        createFormFieldDraft(5, { label: 'Resume / Portfolio', name: 'resume_portfolio', type: 'image', placeholder: 'Upload a scan, portfolio snapshot, or proof image', required: false }),
      ],
    },
    {
      match: ['lead', 'sales', 'demo', 'client', 'inquiry'],
      title: 'Sales Lead Capture Form',
      description: 'Capture new business inquiries, interest areas, and contact details in a cleaner branded flow.',
      instructions: 'Share the business requirement clearly so the team can respond with the right next step.',
      accessMode: 'open' as const,
      fields: [
        createFormFieldDraft(0, { label: 'Contact Name', name: 'contact_name', type: 'text', placeholder: 'Enter your full name', required: true }),
        createFormFieldDraft(1, { label: 'Work Email', name: 'work_email', type: 'email', placeholder: 'name@company.com', required: true }),
        createFormFieldDraft(2, { label: 'Company Name', name: 'company_name', type: 'text', placeholder: 'Enter company name', required: true }),
        createFormFieldDraft(3, { label: 'Interested In', name: 'interested_in', type: 'select', placeholder: 'Select product interest', required: true, options: 'Documents,Forms,Board Room,Daily Tools,Enterprise Suite' }),
        createFormFieldDraft(4, { label: 'Expected Team Size', name: 'expected_team_size', type: 'select', placeholder: 'Select team size', required: false, options: '1-10,11-50,51-200,200+' }),
        createFormFieldDraft(5, { label: 'Business Requirement', name: 'business_requirement', type: 'textarea', placeholder: 'Tell us what you want to solve', required: true }),
      ],
    },
    {
      match: ['feedback', 'survey', 'satisfaction', 'review'],
      title: 'Customer Feedback Form',
      description: 'Collect satisfaction, improvement points, and detailed comments from respondents.',
      instructions: 'Rate the experience honestly and share specific feedback where possible.',
      accessMode: 'open' as const,
      fields: [
        createFormFieldDraft(0, { label: 'Full Name', name: 'full_name', type: 'text', placeholder: 'Enter your name', required: false }),
        createFormFieldDraft(1, { label: 'Email Address', name: 'email_address', type: 'email', placeholder: 'name@example.com', required: false }),
        createFormFieldDraft(2, { label: 'Overall Rating', name: 'overall_rating', type: 'radio', placeholder: 'Select a rating', required: true, options: 'Excellent,Good,Average,Poor' }),
        createFormFieldDraft(3, { label: 'What worked well?', name: 'worked_well', type: 'textarea', placeholder: 'Share the strongest part of your experience', required: false }),
        createFormFieldDraft(4, { label: 'What should improve?', name: 'improvement_areas', type: 'textarea', placeholder: 'Tell us what should improve', required: false }),
        createFormFieldDraft(5, { label: 'Would you recommend us?', name: 'would_recommend', type: 'radio', placeholder: 'Select one option', required: true, options: 'Yes,Maybe,No' }),
      ],
    },
    {
      match: ['event', 'registration', 'attend', 'webinar'],
      title: 'Event Registration Form',
      description: 'Collect attendee details, session preferences, and participation details in one flow.',
      instructions: 'Complete your registration details and choose the session or attendance preference.',
      accessMode: 'open' as const,
      fields: [
        createFormFieldDraft(0, { label: 'Attendee Name', name: 'attendee_name', type: 'text', placeholder: 'Enter your name', required: true }),
        createFormFieldDraft(1, { label: 'Email Address', name: 'email_address', type: 'email', placeholder: 'name@example.com', required: true }),
        createFormFieldDraft(2, { label: 'Phone Number', name: 'phone_number', type: 'tel', placeholder: '+91 98765 43210', required: true }),
        createFormFieldDraft(3, { label: 'Company / Organization', name: 'company_organization', type: 'text', placeholder: 'Enter organization name', required: false }),
        createFormFieldDraft(4, { label: 'Attendance Type', name: 'attendance_type', type: 'radio', placeholder: 'Choose one option', required: true, options: 'In person,Virtual' }),
        createFormFieldDraft(5, { label: 'Special Requests', name: 'special_requests', type: 'textarea', placeholder: 'Mention dietary, accessibility, or seating requests', required: false }),
      ],
    },
  ] as const;

  const matched = templates.find((template) => template.match.some((item) => has(item)));

  if (matched) {
    return matched;
  }

  return {
    title: 'Custom Response Form',
    description: 'Collect structured information, approvals, and supporting details through a polished response workflow.',
    instructions: 'Complete the required fields and provide any additional context needed for review.',
    accessMode: 'secure' as const,
    fields: [
      createFormFieldDraft(0, { label: 'Full Name', name: 'full_name', type: 'text', placeholder: 'Enter your full name', required: true }),
      createFormFieldDraft(1, { label: 'Email Address', name: 'email_address', type: 'email', placeholder: 'name@example.com', required: true }),
      createFormFieldDraft(2, { label: 'Phone Number', name: 'phone_number', type: 'tel', placeholder: '+91 98765 43210', required: false }),
      createFormFieldDraft(3, { label: 'Department / Team', name: 'department_team', type: 'text', placeholder: 'Enter department or team', required: false }),
      createFormFieldDraft(4, { label: 'Primary Response', name: 'primary_response', type: 'textarea', placeholder: 'Enter the main details you want to collect', required: true }),
      createFormFieldDraft(5, { label: 'Supporting Upload', name: 'supporting_upload', type: 'image', placeholder: 'Upload any relevant scan or supporting image', required: false }),
    ],
  };
}

const defaultFormAppearance: FormAppearanceDraft = {
  eyebrow: 'docrud secure form',
  heroTitle: '',
  heroDescription: '',
  introNote: '',
  footerNote: 'Responses are collected through a secure docrud form workflow.',
  submitLabel: 'Submit Form Data',
  successMessage: 'Your response was submitted successfully.',
  surfaceTone: 'slate',
  cardStyle: 'soft',
  buttonStyle: 'solid',
  accentColor: '#0f172a',
  backgroundColor: '#ffffff',
  textColor: '#0f172a',
  showFieldTypes: true,
  showOptionChips: true,
  mediaSlides: [],
  ctaButtons: [],
  whatsappNumber: '',
  whatsappMessage: '',
  banners: [],
  allowSingleEditAfterSubmit: true,
  showSubmissionHistory: true,
  heroAlignment: 'left',
  fieldColumns: 2,
  submitButtonWidth: 'full',
  thankYouRedirectUrl: '',
};

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeHtmlValue(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function unescapeHtmlValue(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function buildLiveFormPreviewHtml({
  title,
  description,
  instructions,
  accessMode,
  fields,
  appearance,
}: {
  title: string;
  description: string;
  instructions: string;
  accessMode: 'secure' | 'open';
  fields: FormBuilderField[];
  appearance: FormAppearanceDraft;
}) {
  const toneMap: Record<FormAppearanceDraft['surfaceTone'], { hero: string; shell: string; border: string; muted: string; input: string }> = {
    slate: { hero: 'linear-gradient(135deg,#0f172a,#1e293b)', shell: '#f8fafc', border: '#e2e8f0', muted: '#64748b', input: '#ffffff' },
    amber: { hero: 'linear-gradient(135deg,#422006,#92400e)', shell: '#fffbeb', border: '#fcd34d', muted: '#92400e', input: '#ffffff' },
    emerald: { hero: 'linear-gradient(135deg,#064e3b,#065f46)', shell: '#ecfdf5', border: '#a7f3d0', muted: '#047857', input: '#ffffff' },
    sky: { hero: 'linear-gradient(135deg,#0f172a,#0c4a6e)', shell: '#f0f9ff', border: '#bae6fd', muted: '#0369a1', input: '#ffffff' },
    rose: { hero: 'linear-gradient(135deg,#4c0519,#881337)', shell: '#fff1f2', border: '#fecdd3', muted: '#be123c', input: '#ffffff' },
  };
  const tone = toneMap[appearance.surfaceTone];
  const safe = (value: string) => escapeHtmlValue(value || '');
  const previewFields = fields.map((field, index) => {
    const label = safe(field.label || `Field ${index + 1}`);
    const placeholder = safe(field.placeholder || `Enter ${field.label?.toLowerCase() || 'value'}`);
    const typeTag = appearance.showFieldTypes ? `<span class="meta">${safe(field.type)}</span>` : '';
    const options = (field.type === 'select' || field.type === 'radio')
      ? field.options.split(',').map((item) => item.trim()).filter(Boolean)
      : [];
    const optionsMarkup = appearance.showOptionChips && options.length
      ? `<div class="chips">${options.map((option) => `<span class="chip">${safe(option)}</span>`).join('')}</div>`
      : '';

    let control = `<input class="control" placeholder="${placeholder}" />`;
    if (field.type === 'textarea') {
      control = `<textarea class="control textarea" placeholder="${placeholder}"></textarea>`;
    } else if (field.type === 'select') {
      control = `<select class="control"><option>${placeholder}</option>${options.map((option) => `<option>${safe(option)}</option>`).join('')}</select>`;
    } else if (field.type === 'radio') {
      control = `<div class="stack">${options.map((option) => `<label class="choice"><input type="radio" name="${safe(field.name || `field_${index}`)}" /> <span>${safe(option)}</span></label>`).join('') || `<label class="choice"><input type="radio" /> <span>Option 1</span></label>`}</div>`;
    } else if (field.type === 'checkbox') {
      control = `<label class="choice"><input type="checkbox" /> <span>${placeholder || 'Checked'}</span></label>`;
    } else if (field.type === 'image') {
      control = `<div class="image-upload"><div class="image-box">Tap to upload image</div><div class="image-help">${placeholder || 'Photos, scans, receipts, and proof uploads are supported.'}</div></div>`;
    } else if (field.type === 'date') {
      control = `<input class="control" value="2026-04-02" />`;
    } else if (field.type === 'number') {
      control = `<input class="control" placeholder="${placeholder}" value="42" />`;
    } else if (field.type === 'email') {
      control = `<input class="control" placeholder="${placeholder}" value="name@company.com" />`;
    } else if (field.type === 'tel') {
      control = `<input class="control" placeholder="${placeholder}" value="+91 98765 43210" />`;
    } else if (field.type === 'url') {
      control = `<input class="control" placeholder="${placeholder}" value="https://example.com" />`;
    }

    return `
      <div class="field-card">
        <div class="field-top">
          <label>${label}${field.required ? ' *' : ''}</label>
          ${typeTag}
        </div>
        ${control}
        ${optionsMarkup}
      </div>
    `;
  }).join('');

  const heroTitle = safe(appearance.heroTitle || title || 'Untitled Form');
  const heroDescription = safe(appearance.heroDescription || description || 'Your respondents will see this form exactly in this structure.');
  const intro = appearance.introNote ? `<div class="note">${safe(appearance.introNote)}</div>` : '';
  const footer = safe(appearance.footerNote || 'Responses are collected through a secure docrud form workflow.');
  const instructionsBlock = instructions.trim() ? `<div class="instructions">${safe(instructions)}</div>` : '';
  const accessBadge = accessMode === 'open' ? 'Open access' : 'Protected access';
  const buttonClass = appearance.buttonStyle === 'outline' ? 'submit outline' : 'submit';
  const mediaSlides = appearance.mediaSlides.filter((slide) => slide.imageUrl);
  const mediaLoop = mediaSlides.length > 3 ? [...mediaSlides, ...mediaSlides] : mediaSlides;
  const mediaMarkup = mediaSlides.length
    ? `<div class="media-strip ${mediaSlides.length > 3 ? 'slider' : ''}">${mediaLoop.map((slide) => `
        <article class="media-card">
          <img src="${safe(slide.imageUrl)}" alt="${safe(slide.title || heroTitle)}" />
          <div class="media-copy">
            ${slide.title ? `<p class="media-title">${safe(slide.title)}</p>` : ''}
            ${slide.description ? `<p class="media-description">${safe(slide.description)}</p>` : ''}
            ${slide.ctaLabel ? `<span class="media-cta">${safe(slide.ctaLabel)}</span>` : ''}
          </div>
        </article>
      `).join('')}</div>`
    : '';
  const ctaMarkup = appearance.ctaButtons.length
    ? `<div class="cta-row">${appearance.ctaButtons.map((button) => `<button class="mini-cta ${button.type === 'whatsapp' ? 'whatsapp' : ''}">${safe(button.label || (button.type === 'whatsapp' ? 'WhatsApp' : 'Open link'))}</button>`).join('')}</div>`
    : '';
  const bannerMarkup = appearance.banners.length
    ? `<section class="banner-grid">${appearance.banners.map((banner) => `
        <article class="banner-card">
          ${banner.imageUrl ? `<img src="${safe(banner.imageUrl)}" alt="${safe(banner.title)}" class="banner-image" />` : ''}
          <div class="banner-copy">
            <p class="banner-title">${safe(banner.title)}</p>
            ${banner.description ? `<p class="banner-description">${safe(banner.description)}</p>` : ''}
            ${banner.ctaLabel ? `<span class="banner-cta">${safe(banner.ctaLabel)}</span>` : ''}
          </div>
        </article>
      `).join('')}</section>`
    : '';

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: linear-gradient(180deg, #f8fafc, #eef2ff); color: ${appearance.textColor}; }
          .frame { min-height: 100vh; padding: 24px; background: ${appearance.backgroundColor}; }
          .shell { max-width: 760px; margin: 0 auto; display: grid; gap: 18px; }
          .hero { border-radius: 28px; padding: 24px; background: ${tone.hero}; color: white; box-shadow: 0 24px 60px rgba(15,23,42,.18); text-align: ${appearance.heroAlignment}; }
          .eyebrow { margin: 0 0 10px; font-size: 11px; letter-spacing: .24em; text-transform: uppercase; color: rgba(255,255,255,.72); }
          h1 { margin: 0; font-size: 30px; line-height: 1.1; }
          .hero p { margin: 12px 0 0; font-size: 14px; line-height: 1.75; color: rgba(255,255,255,.86); }
          .note { margin-top: 14px; border-radius: 16px; padding: 12px 14px; background: rgba(255,255,255,.12); font-size: 12px; line-height: 1.7; }
          .meta-row { display: flex; flex-wrap: wrap; gap: 10px; }
          .pill { border-radius: 999px; padding: 8px 12px; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; background: ${tone.shell}; color: ${tone.muted}; border: 1px solid ${tone.border}; }
          .cta-row { display:flex; flex-wrap:wrap; gap:10px; }
          .mini-cta { border:0; border-radius:999px; padding:10px 14px; background:${appearance.accentColor}; color:white; font-weight:700; font-size:12px; }
          .mini-cta.whatsapp { background:#16a34a; }
          .media-strip { display:grid; gap:14px; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); overflow:hidden; }
          .media-strip.slider { display:flex; width:max-content; animation: liveSlide 28s linear infinite; }
          .media-card { overflow:hidden; border-radius:24px; border:1px solid ${tone.border}; background:#fff; min-width:240px; max-width:240px; box-shadow:0 16px 32px rgba(15,23,42,.08); }
          .media-card img { width:100%; height:160px; object-fit:contain; object-position:center; display:block; background:${tone.shell}; padding:14px; }
          .media-copy { display:grid; gap:6px; padding:14px; }
          .media-title { margin:0; font-size:14px; font-weight:700; color:${appearance.textColor}; }
          .media-description { margin:0; font-size:12px; line-height:1.7; color:${tone.muted}; }
          .media-cta { display:inline-flex; width:max-content; border-radius:999px; border:1px solid ${tone.border}; background:${tone.shell}; color:${appearance.textColor}; font-size:11px; padding:6px 10px; }
          .instructions, .footer { border-radius: 18px; padding: 14px 16px; background: ${tone.shell}; border: 1px solid ${tone.border}; color: ${tone.muted}; font-size: 13px; line-height: 1.75; }
          .grid { display: grid; gap: 14px; grid-template-columns: ${appearance.fieldColumns === 1 ? '1fr' : 'repeat(auto-fit, minmax(240px, 1fr))'}; }
          .field-card { border-radius: 22px; padding: 16px; border: 1px solid ${tone.border}; background: ${appearance.cardStyle === 'glass' ? 'rgba(255,255,255,.72)' : appearance.cardStyle === 'outlined' ? 'transparent' : '#ffffff'}; backdrop-filter: ${appearance.cardStyle === 'glass' ? 'blur(14px)' : 'none'}; box-shadow: ${appearance.cardStyle === 'glass' ? '0 18px 40px rgba(15,23,42,.08)' : 'none'}; }
          .field-top { display: flex; justify-content: space-between; gap: 10px; align-items: center; margin-bottom: 10px; }
          label { font-size: 14px; font-weight: 600; color: ${appearance.textColor}; }
          .meta { font-size: 10px; letter-spacing: .18em; text-transform: uppercase; color: ${tone.muted}; }
          .control { width: 100%; border: 1px solid ${tone.border}; background: ${tone.input}; color: ${appearance.textColor}; border-radius: 14px; padding: 12px 14px; font-size: 14px; outline: none; }
          .textarea { min-height: 112px; resize: none; }
          .stack { display: grid; gap: 10px; }
          .choice { display: flex; align-items: center; gap: 10px; font-size: 14px; color: ${appearance.textColor}; }
          .image-upload { display: grid; gap: 10px; }
          .image-box { min-height: 132px; border-radius: 18px; border: 1px dashed ${tone.border}; background: ${tone.shell}; display:flex; align-items:center; justify-content:center; color:${tone.muted}; font-size:13px; }
          .image-help { font-size: 12px; line-height: 1.6; color: ${tone.muted}; }
          .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
          .chip { border-radius: 999px; border: 1px solid ${tone.border}; background: ${tone.shell}; color: ${tone.muted}; font-size: 12px; padding: 6px 10px; }
          .submit { width: ${appearance.submitButtonWidth === 'fit' ? 'auto' : '100%'}; min-width:${appearance.submitButtonWidth === 'fit' ? '220px' : '0'}; border: 0; border-radius: 18px; padding: 14px 18px; font-weight: 700; font-size: 14px; background: ${appearance.accentColor}; color: white; box-shadow: 0 16px 30px rgba(15,23,42,.14); }
          .submit.outline { background: transparent; color: ${appearance.accentColor}; border: 1.5px solid ${appearance.accentColor}; box-shadow: none; }
          .banner-grid { display:grid; gap:14px; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); }
          .banner-card { overflow:hidden; border-radius:24px; border:1px solid ${tone.border}; background:#fff; }
          .banner-image { width:100%; height:150px; object-fit:contain; object-position:center; display:block; background:${tone.shell}; padding:14px; }
          .banner-copy { padding:16px; display:grid; gap:8px; }
          .banner-title { margin:0; font-size:14px; font-weight:700; color:${appearance.textColor}; }
          .banner-description { margin:0; font-size:12px; line-height:1.7; color:${tone.muted}; }
          .banner-cta { display:inline-flex; width:max-content; border-radius:999px; border:1px solid ${tone.border}; background:${tone.shell}; color:${appearance.textColor}; font-size:11px; padding:6px 10px; }
          @keyframes liveSlide { from { transform: translateX(0); } to { transform: translateX(-50%); } }
          @media (max-width: 640px) {
            .frame { padding: 14px; }
            .hero { padding: 18px; border-radius: 24px; }
            h1 { font-size: 24px; }
            .media-card { min-width: 212px; max-width: 212px; }
            .media-card img, .banner-image { height: 138px; }
          }
        </style>
      </head>
      <body>
        <div class="frame">
          <div class="shell">
            <section class="hero">
              <p class="eyebrow">${safe(appearance.eyebrow)}</p>
              <h1>${heroTitle}</h1>
              <p>${heroDescription}</p>
              ${intro}
            </section>
            <div class="meta-row">
              <div class="pill">${safe(accessBadge)}</div>
              <div class="pill">${fields.length} fields</div>
              <div class="pill">${safe(appearance.submitLabel)}</div>
            </div>
            ${ctaMarkup}
            ${mediaMarkup}
            ${instructionsBlock}
            <section class="grid">
              ${previewFields}
            </section>
            <button class="${buttonClass}">${safe(appearance.submitLabel)}</button>
            ${bannerMarkup}
            <div class="footer">${footer}</div>
          </div>
        </div>
      </body>
    </html>
  `;
}

async function createHash(value: string, algorithm: 'SHA-1' | 'SHA-256' | 'SHA-512') {
  const bytes = new TextEncoder().encode(value);
  const buffer = await crypto.subtle.digest(algorithm, bytes);
  return Array.from(new Uint8Array(buffer)).map((item) => item.toString(16).padStart(2, '0')).join('');
}

function generateLorem(paragraphCount: number) {
  const source = 'docrud helps teams create, review, share, and secure documents with cleaner workflows and stronger operational control.';
  return Array.from({ length: paragraphCount }, (_, index) => `${source} Paragraph ${index + 1} keeps layouts realistic for proposals, forms, and mockups.`).join('\n\n');
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to load this image.'));
    reader.readAsDataURL(file);
  });
}

interface DailyToolsCenterProps {
  initialCategory?: ToolCategory;
  initialTool?: ToolId;
  mode?: 'standard' | 'forms';
}

export default function DailyToolsCenter({
  initialCategory = 'convert',
  initialTool = 'doc-to-pdf',
  mode = 'standard',
}: DailyToolsCenterProps) {
  const { data: session, status } = useSession();
  const [activeCategory, setActiveCategory] = useState<ToolCategory>(initialCategory);
  const [activeTool, setActiveTool] = useState<ToolId>(initialTool);
  const [busyTool, setBusyTool] = useState<ToolId | ''>('');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [completedActions, setCompletedActions] = useState(0);

  const [docToPdfFile, setDocToPdfFile] = useState<File | null>(null);
  const [docCompressorFiles, setDocCompressorFiles] = useState<File[]>([]);
  const [imageCompressorFile, setImageCompressorFile] = useState<File | null>(null);
  const [imageQuality, setImageQuality] = useState(72);
  const [imageOutputType, setImageOutputType] = useState<'image/jpeg' | 'image/webp'>('image/jpeg');
  const [imageToPdfFiles, setImageToPdfFiles] = useState<File[]>([]);
  const [pdfMergerFiles, setPdfMergerFiles] = useState<File[]>([]);
  const [pdfSplitterFile, setPdfSplitterFile] = useState<File | null>(null);
  const [pdfSplitterRange, setPdfSplitterRange] = useState('1-2');
  const [pdfPageRemoverFile, setPdfPageRemoverFile] = useState<File | null>(null);
  const [pdfPagesToRemove, setPdfPagesToRemove] = useState('2,4');
  const [pdfRotatorFile, setPdfRotatorFile] = useState<File | null>(null);
  const [rotationAngle, setRotationAngle] = useState('90');
  const [csvToExcelFile, setCsvToExcelFile] = useState<File | null>(null);
  const [excelToCsvFile, setExcelToCsvFile] = useState<File | null>(null);
  const [imageResizerFile, setImageResizerFile] = useState<File | null>(null);
  const [imageResizeWidth, setImageResizeWidth] = useState('1200');
  const [imageFormatFile, setImageFormatFile] = useState<File | null>(null);
  const [imageFormatType, setImageFormatType] = useState<'image/jpeg' | 'image/webp' | 'image/png'>('image/png');
  const [passwordLength, setPasswordLength] = useState('16');
  const [passwordWithSymbols, setPasswordWithSymbols] = useState(true);
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [jsonInput, setJsonInput] = useState('');
  const [qrInput, setQrInput] = useState('https://docrud.app');
  const [qrSize, setQrSize] = useState('256');
  const [textCaseInput, setTextCaseInput] = useState('');
  const [wordCounterInput, setWordCounterInput] = useState('');
  const [urlCodecInput, setUrlCodecInput] = useState('');
  const [base64Input, setBase64Input] = useState('');
  const [slugInput, setSlugInput] = useState('');
  const [htmlEscapeInput, setHtmlEscapeInput] = useState('');
  const [duplicateLineInput, setDuplicateLineInput] = useState('');
  const [generatedUuids, setGeneratedUuids] = useState<string[]>([]);
  const [uuidCount, setUuidCount] = useState('3');
  const [hashInput, setHashInput] = useState('');
  const [hashAlgorithm, setHashAlgorithm] = useState<'SHA-1' | 'SHA-256' | 'SHA-512'>('SHA-256');
  const [hashOutput, setHashOutput] = useState('');
  const [timestampInput, setTimestampInput] = useState('');
  const [timestampDateInput, setTimestampDateInput] = useState('');
  const [colorInput, setColorInput] = useState('#0f172a');
  const [colorOutput, setColorOutput] = useState('rgb(15, 23, 42)');
  const [loremParagraphs, setLoremParagraphs] = useState('3');
  const [loremOutput, setLoremOutput] = useState('');
  const [textSorterInput, setTextSorterInput] = useState('');
  const [sortDescending, setSortDescending] = useState(false);
  const [aiFormPrompt, setAiFormPrompt] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formInstructions, setFormInstructions] = useState('');
  const [formAccessMode, setFormAccessMode] = useState<'secure' | 'open'>('secure');
  const [formPassword, setFormPassword] = useState('');
  const [formExpiryDays, setFormExpiryDays] = useState('7');
  const [formMaxResponses, setFormMaxResponses] = useState('');
  const [createdFormLink, setCreatedFormLink] = useState('');
  const [createdFormPassword, setCreatedFormPassword] = useState('');
  const [createdFormQrLink, setCreatedFormQrLink] = useState('');
  const [formPanel, setFormPanel] = useState<'builder' | 'history' | 'insights'>('builder');
  const [formBuilderStep, setFormBuilderStep] = useState<'basics' | 'experience' | 'fields' | 'publish'>('basics');
  const [formPreviewViewport, setFormPreviewViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [savedForms, setSavedForms] = useState<SavedFormRecord[]>([]);
  const [formsLoading, setFormsLoading] = useState(false);
  const [selectedFormId, setSelectedFormId] = useState('');
  const [editingFormId, setEditingFormId] = useState('');
  const [formAppearance, setFormAppearance] = useState<FormAppearanceDraft>(defaultFormAppearance);
  const [formFields, setFormFields] = useState<FormBuilderField[]>([
    {
      id: `form-field-${Date.now()}`,
      label: 'Full Name',
      name: 'full_name',
      type: 'text',
      placeholder: 'Enter your full name',
      required: true,
      options: '',
    },
    {
      id: `form-field-${Date.now()}-email`,
      label: 'Email Address',
      name: 'email_address',
      type: 'email',
      placeholder: 'name@company.com',
      required: true,
      options: '',
    },
  ]);

  const selectedTool = useMemo(
    () => toolMeta.find((tool) => tool.id === activeTool) || toolMeta[0],
    [activeTool],
  );
  const visibleTools = useMemo(
    () => toolMeta.filter((tool) => tool.category === activeCategory),
    [activeCategory],
  );
  const wordStats = useMemo(() => {
    const trimmed = wordCounterInput.trim();
    return {
      words: trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0,
      characters: wordCounterInput.length,
      lines: wordCounterInput ? wordCounterInput.split('\n').length : 0,
    };
  }, [wordCounterInput]);
  const uploadedFiles = useMemo(
    () => [
      ...(docToPdfFile ? [docToPdfFile] : []),
      ...docCompressorFiles,
      ...(imageCompressorFile ? [imageCompressorFile] : []),
      ...imageToPdfFiles,
      ...pdfMergerFiles,
      ...(pdfSplitterFile ? [pdfSplitterFile] : []),
      ...(pdfPageRemoverFile ? [pdfPageRemoverFile] : []),
      ...(pdfRotatorFile ? [pdfRotatorFile] : []),
      ...(csvToExcelFile ? [csvToExcelFile] : []),
      ...(excelToCsvFile ? [excelToCsvFile] : []),
      ...(imageResizerFile ? [imageResizerFile] : []),
      ...(imageFormatFile ? [imageFormatFile] : []),
    ],
    [
      csvToExcelFile,
      docCompressorFiles,
      docToPdfFile,
      excelToCsvFile,
      imageCompressorFile,
      imageToPdfFiles,
      imageFormatFile,
      imageResizerFile,
      pdfMergerFiles,
      pdfPageRemoverFile,
      pdfRotatorFile,
      pdfSplitterFile,
    ],
  );
  const uploadedFileCount = uploadedFiles.length;
  const uploadedBytes = uploadedFiles.reduce((sum, file) => sum + file.size, 0);
  const formFieldCount = formFields.length;
  const isLoggedIn = status === 'authenticated' && Boolean(session?.user);
  const currentFormQrUrl = createdFormLink ? buildQrImageUrl(createdFormLink, undefined, 320) : '';
  const liveFormPreviewHtml = useMemo(() => buildLiveFormPreviewHtml({
    title: formTitle,
    description: formDescription,
    instructions: formInstructions,
    accessMode: formAccessMode,
    fields: formFields,
    appearance: formAppearance,
  }), [formAccessMode, formAppearance, formDescription, formFields, formInstructions, formTitle]);
  const selectedSavedForm = useMemo(
    () => savedForms.find((form) => form.id === selectedFormId) || savedForms[0] || null,
    [savedForms, selectedFormId],
  );
  const isFormsMode = mode === 'forms';
  const showProcessingOverlay = status === 'loading' || formsLoading || Boolean(busyTool);

  useEffect(() => {
    if (isFormsMode) {
      setActiveCategory('forms');
      setActiveTool('form-builder');
      setFormPanel('builder');
    }
  }, [isFormsMode]);

  const addFormField = () => {
    setFormFields((current) => [
      ...current,
      createFormFieldDraft(current.length, {
        label: `Field ${current.length + 1}`,
        name: `field_${current.length + 1}`,
      }),
    ]);
  };

  const updateFormField = (fieldId: string, updates: Partial<FormBuilderField>) => {
    setFormFields((current) => current.map((field) => field.id === fieldId ? { ...field, ...updates } : field));
  };

  const removeFormField = (fieldId: string) => {
    setFormFields((current) => current.filter((field) => field.id !== fieldId));
  };

  const addMediaSlide = () => {
    setFormAppearance((current) => ({
      ...current,
      mediaSlides: [
        ...current.mediaSlides,
        {
          id: `slide-${Date.now()}-${current.mediaSlides.length}`,
          imageUrl: '',
          title: '',
          description: '',
          ctaLabel: '',
          ctaUrl: '',
        },
      ],
    }));
  };

  const updateMediaSlide = (slideId: string, updates: Partial<FormMediaSlide>) => {
    setFormAppearance((current) => ({
      ...current,
      mediaSlides: current.mediaSlides.map((slide) => slide.id === slideId ? { ...slide, ...updates } : slide),
    }));
  };

  const removeMediaSlide = (slideId: string) => {
    setFormAppearance((current) => ({
      ...current,
      mediaSlides: current.mediaSlides.filter((slide) => slide.id !== slideId),
    }));
  };

  const addCtaButton = (type: FormCtaButton['type'] = 'link') => {
    setFormAppearance((current) => ({
      ...current,
      ctaButtons: [
        ...current.ctaButtons,
        {
          id: `cta-${Date.now()}-${current.ctaButtons.length}`,
          label: '',
          url: '',
          type: type || 'link',
        },
      ],
    }));
  };

  const updateCtaButton = (buttonId: string, updates: Partial<FormCtaButton>) => {
    setFormAppearance((current) => ({
      ...current,
      ctaButtons: current.ctaButtons.map((button) => button.id === buttonId ? { ...button, ...updates } : button),
    }));
  };

  const removeCtaButton = (buttonId: string) => {
    setFormAppearance((current) => ({
      ...current,
      ctaButtons: current.ctaButtons.filter((button) => button.id !== buttonId),
    }));
  };

  const addBanner = () => {
    setFormAppearance((current) => ({
      ...current,
      banners: [
        ...current.banners,
        {
          id: `banner-${Date.now()}-${current.banners.length}`,
          title: '',
          description: '',
          imageUrl: '',
          ctaLabel: '',
          ctaUrl: '',
        },
      ],
    }));
  };

  const updateBanner = (bannerId: string, updates: Partial<FormBanner>) => {
    setFormAppearance((current) => ({
      ...current,
      banners: current.banners.map((banner) => banner.id === bannerId ? { ...banner, ...updates } : banner),
    }));
  };

  const removeBanner = (bannerId: string) => {
    setFormAppearance((current) => ({
      ...current,
      banners: current.banners.filter((banner) => banner.id !== bannerId),
    }));
  };

  const normalizeFormAppearanceDraft = useCallback((appearance?: FormAppearance): FormAppearanceDraft => ({
    ...defaultFormAppearance,
    ...appearance,
    eyebrow: appearance?.eyebrow || defaultFormAppearance.eyebrow,
    heroTitle: appearance?.heroTitle || '',
    heroDescription: appearance?.heroDescription || '',
    introNote: appearance?.introNote || '',
    footerNote: appearance?.footerNote || defaultFormAppearance.footerNote,
    submitLabel: appearance?.submitLabel || defaultFormAppearance.submitLabel,
    successMessage: appearance?.successMessage || defaultFormAppearance.successMessage,
    surfaceTone: appearance?.surfaceTone || defaultFormAppearance.surfaceTone,
    cardStyle: appearance?.cardStyle || defaultFormAppearance.cardStyle,
    buttonStyle: appearance?.buttonStyle || defaultFormAppearance.buttonStyle,
    accentColor: appearance?.accentColor || defaultFormAppearance.accentColor,
    backgroundColor: appearance?.backgroundColor || defaultFormAppearance.backgroundColor,
    textColor: appearance?.textColor || defaultFormAppearance.textColor,
    showFieldTypes: appearance?.showFieldTypes !== false,
    showOptionChips: appearance?.showOptionChips !== false,
    mediaSlides: appearance?.mediaSlides || [],
    ctaButtons: appearance?.ctaButtons || [],
    whatsappNumber: appearance?.whatsappNumber || '',
    whatsappMessage: appearance?.whatsappMessage || '',
    banners: appearance?.banners || [],
    allowSingleEditAfterSubmit: appearance?.allowSingleEditAfterSubmit !== false,
    showSubmissionHistory: appearance?.showSubmissionHistory !== false,
    heroAlignment: appearance?.heroAlignment === 'center' ? 'center' : 'left',
    fieldColumns: appearance?.fieldColumns === 1 ? 1 : 2,
    submitButtonWidth: appearance?.submitButtonWidth === 'fit' ? 'fit' : 'full',
    thankYouRedirectUrl: appearance?.thankYouRedirectUrl || '',
  }), []);

  const hydrateBuilderFromForm = (form: SavedFormRecord) => {
    setEditingFormId(form.id);
    setFormTitle(form.name || '');
    setFormDescription(form.description || '');
    setFormInstructions(form.instructions || '');
    setFormAccessMode(form.accessMode || 'secure');
    setFormPassword(form.sharePassword || '');
    setFormExpiryDays(form.expiryAt ? String(Math.max(1, Math.ceil((new Date(form.expiryAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))) : '');
    setFormMaxResponses(form.maxResponses ? String(form.maxResponses) : '');
    setFormFields(form.fields.map((field, index) => ({
      id: field.id || `form-field-${Date.now()}-${index}`,
      label: field.label,
      name: field.name,
      type: field.type,
      placeholder: field.placeholder || '',
      required: field.required,
      options: field.options?.join(', ') || '',
    })));
    setCreatedFormLink(form.shareUrl ? buildAbsoluteAppUrl(form.shareUrl, typeof window !== 'undefined' ? window.location.origin : undefined) : '');
    setCreatedFormPassword(form.sharePassword || '');
    setCreatedFormQrLink(form.shareUrl ? buildQrImageUrl(form.shareUrl, typeof window !== 'undefined' ? window.location.origin : undefined, 320) : '');
    setFormAppearance(normalizeFormAppearanceDraft(form.appearance));
    setFormBuilderStep('publish');
    setFormPanel('builder');
  };

  const loadSavedForms = useCallback(async () => {
    if (!isLoggedIn) {
      return;
    }
    setFormsLoading(true);
    try {
      const response = await fetch('/api/forms');
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to load forms.');
      }
      setSavedForms(Array.isArray(payload) ? payload : []);
      setSelectedFormId((prev) => prev || payload?.[0]?.id || '');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load forms.');
    } finally {
      setFormsLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (activeTool === 'form-builder' && isLoggedIn) {
      void loadSavedForms();
    }
  }, [activeTool, isLoggedIn, loadSavedForms]);

  const resetMessages = () => {
    setErrorMessage('');
    setStatusMessage('');
  };

  const runTool = async (toolId: ToolId, callback: () => Promise<void>) => {
    try {
      resetMessages();
      setBusyTool(toolId);
      await callback();
      setCompletedActions((prev) => prev + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to complete this tool action.');
    } finally {
      setBusyTool('');
    }
  };

  return (
    <div className="relative space-y-6">
      {showProcessingOverlay ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-start justify-center rounded-[1.75rem] bg-white/45 px-4 py-10 backdrop-blur-[2px]">
          <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white/95 px-4 py-2.5 shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
            <Loader2 className="h-4 w-4 animate-spin text-slate-900" />
            <span className="text-sm font-medium text-slate-700">{formsLoading ? 'Loading forms…' : busyTool ? 'Processing…' : 'Opening workspace…'}</span>
          </div>
        </div>
      ) : null}

      {!isFormsMode ? (
      <Card className="overflow-hidden border-white/70 bg-white/84 shadow-[0_20px_60px_rgba(15,23,42,0.06)] backdrop-blur">
        <CardContent className="p-5">
          <Tabs value={activeCategory} onValueChange={(value) => setActiveCategory(value as ToolCategory)}>
            <TabsList className="no-scrollbar flex w-full flex-nowrap items-center gap-1 overflow-x-auto rounded-[1.15rem] border border-slate-200/80 bg-white/90 p-1.5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
              {categoryMeta.map((category) => (
                <TabsTrigger key={category.id} value={category.id} className="shrink-0 rounded-[0.95rem] px-3.5 text-[11px] font-medium tracking-[0.02em] sm:text-xs lg:px-4">
                  {category.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {visibleTools.map((tool) => {
              const active = tool.id === activeTool;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => {
                    resetMessages();
                    if (!isFormsMode && tool.id === 'form-builder') {
                      window.location.href = '/forms/builder';
                      return;
                    }
                    setActiveCategory(tool.category);
                    setActiveTool(tool.id);
                  }}
                  className={`rounded-[1.15rem] border p-3 text-left transition ${active ? 'border-slate-950 bg-slate-950 text-white shadow-[0_16px_36px_rgba(15,23,42,0.18)]' : 'border-slate-200 bg-slate-50/80 hover:border-slate-300 hover:bg-white'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-2xl ${active ? 'bg-white/10 text-white' : 'bg-white text-slate-900 shadow-sm'}`}>
                      <tool.icon className="h-4 w-4" />
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[9px] uppercase tracking-[0.16em] ${active ? 'bg-white/10 text-white/75' : 'bg-slate-100 text-slate-600'}`}>{tool.badge}</span>
                  </div>
                  <p className={`mt-3 text-[13px] font-semibold tracking-tight ${active ? 'text-white' : 'text-slate-950'}`}>{tool.label}</p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
      ) : null}

      {(statusMessage || errorMessage) ? (
        <div className={`rounded-[1.35rem] border px-4 py-3 text-sm ${errorMessage ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
          {errorMessage || statusMessage}
        </div>
      ) : null}

      <div>
	        <Card className={`border-white/60 bg-white/82 backdrop-blur ${isFormsMode ? 'overflow-hidden rounded-[1.8rem] shadow-[0_24px_70px_rgba(15,23,42,0.08)]' : ''}`}>
	          {!isFormsMode ? (
	            <CardHeader>
	              <CardTitle>{selectedTool.label}</CardTitle>
	            </CardHeader>
	          ) : null}
	          <CardContent className={isFormsMode ? 'p-0' : 'space-y-5'}>
	            {activeTool === 'doc-to-pdf' ? (
	              <div className="space-y-4">
	                <Input type="file" accept=".txt,.md,.html,.htm,.csv,.json,.docx,.xlsx,.xls,.jpg,.jpeg,.png" onChange={(event) => setDocToPdfFile(event.target.files?.[0] || null)} />
	                {docToPdfFile ? <p className="text-sm text-slate-600">Selected: {docToPdfFile.name} • {formatFileSize(docToPdfFile.size)}</p> : null}
	                <Button
                  type="button"
                  disabled={!docToPdfFile || busyTool === 'doc-to-pdf'}
                  onClick={() => void runTool('doc-to-pdf', async () => {
                    if (!docToPdfFile) throw new Error('Choose a file to convert.');
                    const lower = docToPdfFile.name.toLowerCase();
                    let bytes: Uint8Array;
                    if (/\.(jpg|jpeg|png)$/.test(lower)) {
                      bytes = await createImagePdf([docToPdfFile]);
                    } else {
                      const text = await readDocLikeText(docToPdfFile);
                      if (!text.trim()) throw new Error('This file did not produce readable content for PDF conversion.');
                      bytes = await createTextPdf(text, docToPdfFile.name);
                    }
                    downloadBlob(new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' }), `${slugifyFileName(docToPdfFile.name, 'document')}.pdf`);
                    setStatusMessage(`PDF created successfully from ${docToPdfFile.name}.`);
                  })}
                  className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                >
                  {busyTool === 'doc-to-pdf' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                  Convert to PDF
                </Button>
              </div>
            ) : null}

	            {activeTool === 'document-compressor' ? (
	              <div className="space-y-4">
	                <Input type="file" multiple onChange={(event) => setDocCompressorFiles(Array.from(event.target.files || []))} />
	                {docCompressorFiles.length > 0 ? (
	                  <div className="rounded-[1.15rem] border border-slate-200 bg-white p-4 text-sm text-slate-600">
                    {docCompressorFiles.length} file(s) selected • {formatFileSize(docCompressorFiles.reduce((sum, file) => sum + file.size, 0))}
                  </div>
                ) : null}
                <Button
                  type="button"
                  disabled={docCompressorFiles.length === 0 || busyTool === 'document-compressor'}
                  onClick={() => void runTool('document-compressor', async () => {
                    const zip = new JSZip();
                    await Promise.all(docCompressorFiles.map(async (file) => {
                      zip.file(file.name, await file.arrayBuffer());
                    }));
                    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 7 } });
                    downloadBlob(blob, `docrud-document-pack-${Date.now()}.zip`);
                    setStatusMessage(`Compressed ${docCompressorFiles.length} file(s) into a ZIP package.`);
                  })}
                  className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                >
                  {busyTool === 'document-compressor' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Archive className="mr-2 h-4 w-4" />}
                  Compress Documents
                </Button>
              </div>
            ) : null}

            {activeTool === 'image-compressor' ? (
              <div className="space-y-4">
                <Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setImageCompressorFile(event.target.files?.[0] || null)} />
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="rounded-[1.15rem] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    <span className="font-medium text-slate-900">Quality</span>
                    <input type="range" min="35" max="92" value={imageQuality} onChange={(event) => setImageQuality(Number(event.target.value))} className="mt-3 w-full" />
                    <span className="mt-2 block text-xs text-slate-500">{imageQuality}% output quality</span>
                  </label>
                  <label className="rounded-[1.15rem] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    <span className="font-medium text-slate-900">Output format</span>
                    <select value={imageOutputType} onChange={(event) => setImageOutputType(event.target.value as 'image/jpeg' | 'image/webp')} className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <option value="image/jpeg">JPEG</option>
                      <option value="image/webp">WEBP</option>
                    </select>
                  </label>
                </div>
                {imageCompressorFile ? <p className="text-sm text-slate-600">Selected: {imageCompressorFile.name} • {formatFileSize(imageCompressorFile.size)}</p> : null}
                <Button
                  type="button"
                  disabled={!imageCompressorFile || busyTool === 'image-compressor'}
                  onClick={() => void runTool('image-compressor', async () => {
                    if (!imageCompressorFile) throw new Error('Choose an image to compress.');
                    const blob = await compressImage(imageCompressorFile, imageQuality / 100, imageOutputType);
                    const extension = imageOutputType === 'image/webp' ? 'webp' : 'jpg';
                    downloadBlob(blob, `${slugifyFileName(imageCompressorFile.name, 'image')}-compressed.${extension}`);
                    setStatusMessage(`Compressed image prepared. Original: ${formatFileSize(imageCompressorFile.size)} • New: ${formatFileSize(blob.size)}.`);
                  })}
                  className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                >
                  {busyTool === 'image-compressor' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileImage className="mr-2 h-4 w-4" />}
                  Compress Image
                </Button>
              </div>
            ) : null}

            {activeTool === 'image-to-pdf' ? (
              <div className="space-y-4">
                <Input type="file" multiple accept="image/png,image/jpeg" onChange={(event) => setImageToPdfFiles(Array.from(event.target.files || []))} />
                {imageToPdfFiles.length > 0 ? <p className="text-sm text-slate-600">{imageToPdfFiles.length} image(s) ready to merge into one PDF.</p> : null}
                <Button
                  type="button"
                  disabled={imageToPdfFiles.length === 0 || busyTool === 'image-to-pdf'}
                  onClick={() => void runTool('image-to-pdf', async () => {
                    const bytes = await createImagePdf(imageToPdfFiles);
                    downloadBlob(new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' }), `docrud-images-${Date.now()}.pdf`);
                    setStatusMessage(`Created a single PDF from ${imageToPdfFiles.length} image(s).`);
                  })}
                  className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                >
                  {busyTool === 'image-to-pdf' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                  Create Image PDF
                </Button>
              </div>
            ) : null}

            {activeTool === 'pdf-merger' ? (
              <div className="space-y-4">
                <Input type="file" multiple accept="application/pdf" onChange={(event) => setPdfMergerFiles(Array.from(event.target.files || []))} />
                {pdfMergerFiles.length > 0 ? <p className="text-sm text-slate-600">{pdfMergerFiles.length} PDF(s) selected.</p> : null}
                <Button
                  type="button"
                  disabled={pdfMergerFiles.length < 2 || busyTool === 'pdf-merger'}
                  onClick={() => void runTool('pdf-merger', async () => {
                    const merged = await PDFDocument.create();
                    for (const file of pdfMergerFiles) {
                      const source = await PDFDocument.load(await file.arrayBuffer());
                      const pages = await merged.copyPages(source, source.getPageIndices());
                      pages.forEach((page) => merged.addPage(page));
                    }
                    const bytes = await merged.save();
                    downloadBlob(new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' }), `docrud-merged-${Date.now()}.pdf`);
                    setStatusMessage(`Merged ${pdfMergerFiles.length} PDFs into one file.`);
                  })}
                  className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                >
                  {busyTool === 'pdf-merger' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                  Merge PDFs
                </Button>
              </div>
            ) : null}

            {activeTool === 'pdf-splitter' ? (
              <div className="space-y-4">
                <Input type="file" accept="application/pdf" onChange={(event) => setPdfSplitterFile(event.target.files?.[0] || null)} />
                <Input value={pdfSplitterRange} onChange={(event) => setPdfSplitterRange(event.target.value)} placeholder="Example: 1-3 or 2,4,6" />
                <Button
                  type="button"
                  disabled={!pdfSplitterFile || busyTool === 'pdf-splitter'}
                  onClick={() => void runTool('pdf-splitter', async () => {
                    if (!pdfSplitterFile) throw new Error('Choose a PDF to split.');
                    const source = await PDFDocument.load(await pdfSplitterFile.arrayBuffer());
                    const pagesToKeep = parsePageRange(pdfSplitterRange, source.getPageCount());
                    if (pagesToKeep.length === 0) throw new Error('Enter a valid page range to extract.');
                    const next = await PDFDocument.create();
                    const copied = await next.copyPages(source, pagesToKeep.map((page) => page - 1));
                    copied.forEach((page) => next.addPage(page));
                    downloadBlob(new Blob([Uint8Array.from(await next.save())], { type: 'application/pdf' }), `${slugifyFileName(pdfSplitterFile.name, 'split')}-extract.pdf`);
                    setStatusMessage(`Extracted ${pagesToKeep.length} page(s) from the PDF.`);
                  })}
                  className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                >
                  {busyTool === 'pdf-splitter' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Scissors className="mr-2 h-4 w-4" />}
                  Split PDF
                </Button>
              </div>
            ) : null}

            {activeTool === 'pdf-page-remover' ? (
              <div className="space-y-4">
                <Input type="file" accept="application/pdf" onChange={(event) => setPdfPageRemoverFile(event.target.files?.[0] || null)} />
                <Input value={pdfPagesToRemove} onChange={(event) => setPdfPagesToRemove(event.target.value)} placeholder="Pages to remove, e.g. 2,4,7" />
                <Button
                  type="button"
                  disabled={!pdfPageRemoverFile || busyTool === 'pdf-page-remover'}
                  onClick={() => void runTool('pdf-page-remover', async () => {
                    if (!pdfPageRemoverFile) throw new Error('Choose a PDF first.');
                    const source = await PDFDocument.load(await pdfPageRemoverFile.arrayBuffer());
                    const removePages = new Set(parseNumberList(pdfPagesToRemove, source.getPageCount()));
                    if (removePages.size === 0) throw new Error('Enter valid page numbers to remove.');
                    const keepPages = source.getPageIndices().filter((pageIndex) => !removePages.has(pageIndex + 1));
                    if (keepPages.length === 0) throw new Error('You cannot remove every page from the PDF.');
                    const next = await PDFDocument.create();
                    const copied = await next.copyPages(source, keepPages);
                    copied.forEach((page) => next.addPage(page));
                    downloadBlob(new Blob([Uint8Array.from(await next.save())], { type: 'application/pdf' }), `${slugifyFileName(pdfPageRemoverFile.name, 'cleaned')}-cleaned.pdf`);
                    setStatusMessage(`Removed ${removePages.size} page(s) and prepared a cleaned PDF.`);
                  })}
                  className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                >
                  {busyTool === 'pdf-page-remover' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Scissors className="mr-2 h-4 w-4" />}
                  Remove Pages
                </Button>
              </div>
            ) : null}

            {activeTool === 'pdf-rotator' ? (
              <div className="space-y-4">
                <Input type="file" accept="application/pdf" onChange={(event) => setPdfRotatorFile(event.target.files?.[0] || null)} />
                <select value={rotationAngle} onChange={(event) => setRotationAngle(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                  <option value="90">Rotate 90°</option>
                  <option value="180">Rotate 180°</option>
                  <option value="270">Rotate 270°</option>
                </select>
                <Button
                  type="button"
                  disabled={!pdfRotatorFile || busyTool === 'pdf-rotator'}
                  onClick={() => void runTool('pdf-rotator', async () => {
                    if (!pdfRotatorFile) throw new Error('Choose a PDF to rotate.');
                    const source = await PDFDocument.load(await pdfRotatorFile.arrayBuffer());
                    source.getPages().forEach((page) => {
                      page.setRotation(degrees(Number(rotationAngle)));
                    });
                    downloadBlob(new Blob([Uint8Array.from(await source.save())], { type: 'application/pdf' }), `${slugifyFileName(pdfRotatorFile.name, 'rotated')}-rotated.pdf`);
                    setStatusMessage(`Rotated the PDF by ${rotationAngle} degrees.`);
                  })}
                  className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                >
                  {busyTool === 'pdf-rotator' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                  Rotate PDF
                </Button>
              </div>
            ) : null}

            {activeTool === 'csv-to-excel' ? (
              <div className="space-y-4">
                <Input type="file" accept=".csv,text/csv" onChange={(event) => setCsvToExcelFile(event.target.files?.[0] || null)} />
                <Button
                  type="button"
                  disabled={!csvToExcelFile || busyTool === 'csv-to-excel'}
                  onClick={() => void runTool('csv-to-excel', async () => {
                    if (!csvToExcelFile) throw new Error('Choose a CSV file.');
                    const text = await csvToExcelFile.text();
                    const workbook = XLSX.read(text, { type: 'string' });
                    const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
                    downloadBlob(new Blob([Uint8Array.from(bytes)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${slugifyFileName(csvToExcelFile.name, 'sheet')}.xlsx`);
                    setStatusMessage(`Converted ${csvToExcelFile.name} into an Excel workbook.`);
                  })}
                  className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                >
                  {busyTool === 'csv-to-excel' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
                  Convert to Excel
                </Button>
              </div>
            ) : null}

            {activeTool === 'excel-to-csv' ? (
              <div className="space-y-4">
                <Input type="file" accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => setExcelToCsvFile(event.target.files?.[0] || null)} />
                <Button
                  type="button"
                  disabled={!excelToCsvFile || busyTool === 'excel-to-csv'}
                  onClick={() => void runTool('excel-to-csv', async () => {
                    if (!excelToCsvFile) throw new Error('Choose an Excel file.');
                    const workbook = XLSX.read(await excelToCsvFile.arrayBuffer(), { type: 'array' });
                    const firstSheet = workbook.SheetNames[0];
                    if (!firstSheet) throw new Error('No worksheet was found in this workbook.');
                    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheet]);
                    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `${slugifyFileName(excelToCsvFile.name, 'sheet')}.csv`);
                    setStatusMessage(`Converted the first sheet of ${excelToCsvFile.name} into CSV.`);
                  })}
                  className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                >
                  {busyTool === 'excel-to-csv' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
                  Convert to CSV
                </Button>
              </div>
            ) : null}

            {activeTool === 'image-resizer' ? (
              <div className="space-y-4">
                <Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setImageResizerFile(event.target.files?.[0] || null)} />
                <Input value={imageResizeWidth} onChange={(event) => setImageResizeWidth(event.target.value)} placeholder="Resize width, e.g. 1200" />
                {imageResizerFile ? <p className="text-sm text-slate-600">Selected: {imageResizerFile.name} • {formatFileSize(imageResizerFile.size)}</p> : null}
                <Button
                  type="button"
                  disabled={!imageResizerFile || busyTool === 'image-resizer'}
                  onClick={() => void runTool('image-resizer', async () => {
                    if (!imageResizerFile) throw new Error('Choose an image to resize.');
                    const width = Number(imageResizeWidth);
                    if (!Number.isFinite(width) || width < 100) throw new Error('Enter a valid resize width.');
                    const blob = await exportImageVariant(imageResizerFile, 'image/png', { maxWidth: width });
                    downloadBlob(blob, `${slugifyFileName(imageResizerFile.name, 'image')}-resized.png`);
                    setStatusMessage(`Resized ${imageResizerFile.name} to a ${width}px wide image.`);
                  })}
                  className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                >
                  {busyTool === 'image-resizer' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileImage className="mr-2 h-4 w-4" />}
                  Resize Image
                </Button>
              </div>
            ) : null}

            {activeTool === 'image-format-converter' ? (
              <div className="space-y-4">
                <Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setImageFormatFile(event.target.files?.[0] || null)} />
                <select value={imageFormatType} onChange={(event) => setImageFormatType(event.target.value as 'image/jpeg' | 'image/webp' | 'image/png')} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                  <option value="image/png">PNG</option>
                  <option value="image/jpeg">JPEG</option>
                  <option value="image/webp">WEBP</option>
                </select>
                {imageFormatFile ? <p className="text-sm text-slate-600">Selected: {imageFormatFile.name} • {formatFileSize(imageFormatFile.size)}</p> : null}
                <Button
                  type="button"
                  disabled={!imageFormatFile || busyTool === 'image-format-converter'}
                  onClick={() => void runTool('image-format-converter', async () => {
                    if (!imageFormatFile) throw new Error('Choose an image to convert.');
                    const blob = await exportImageVariant(imageFormatFile, imageFormatType);
                    const extension = imageFormatType === 'image/jpeg' ? 'jpg' : imageFormatType === 'image/webp' ? 'webp' : 'png';
                    downloadBlob(blob, `${slugifyFileName(imageFormatFile.name, 'image')}-converted.${extension}`);
                    setStatusMessage(`Converted ${imageFormatFile.name} into ${extension.toUpperCase()}.`);
                  })}
                  className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                >
                  {busyTool === 'image-format-converter' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Convert Image Format
                </Button>
              </div>
            ) : null}

            {activeTool === 'password-generator' ? (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Input value={passwordLength} onChange={(event) => setPasswordLength(event.target.value)} placeholder="Password length" />
                  <label className="flex items-center gap-3 rounded-[1.15rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <input type="checkbox" checked={passwordWithSymbols} onChange={(event) => setPasswordWithSymbols(event.target.checked)} />
                    Include symbols
                  </label>
                </div>
                {generatedPassword ? (
                  <div className="rounded-[1.15rem] border border-slate-200 bg-slate-50 p-4">
                    <p className="font-mono text-sm break-all text-slate-900">{generatedPassword}</p>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    onClick={() => {
                      resetMessages();
                      const length = Number(passwordLength);
                      if (!Number.isFinite(length) || length < 6) {
                        setErrorMessage('Enter a password length of at least 6.');
                        return;
                      }
                      const next = buildPassword(length, passwordWithSymbols);
                      setGeneratedPassword(next);
                      setCompletedActions((prev) => prev + 1);
                      setStatusMessage('Password generated successfully.');
                    }}
                    className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                  >
                    <KeyRound className="mr-2 h-4 w-4" />
                    Generate Password
                  </Button>
                  {generatedPassword ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        await navigator.clipboard.writeText(generatedPassword);
                        setStatusMessage('Password copied to clipboard.');
                      }}
                      className="rounded-xl"
                    >
                      Copy Password
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {activeTool === 'json-formatter' ? (
              <div className="space-y-4">
                <textarea
                  value={jsonInput}
                  onChange={(event) => setJsonInput(event.target.value)}
                  className="min-h-[220px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm leading-6 text-slate-900"
                  placeholder='Paste JSON here, for example: {"name":"docrud","mode":"pretty"}'
                />
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    onClick={() => {
                      resetMessages();
                      try {
                        const parsed = JSON.parse(jsonInput);
                        const pretty = JSON.stringify(parsed, null, 2);
                        setJsonInput(pretty);
                        setCompletedActions((prev) => prev + 1);
                        setStatusMessage('JSON formatted successfully.');
                      } catch {
                        setErrorMessage('Enter valid JSON to format it.');
                      }
                    }}
                    className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Format JSON
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      resetMessages();
                      setJsonInput('');
                    }}
                    className="rounded-xl"
                  >
                    Clear
                  </Button>
                </div>
              </div>
            ) : null}

            {activeTool === 'qr-generator' ? (
              <div className="space-y-4">
                <Input value={qrInput} onChange={(event) => setQrInput(event.target.value)} placeholder="Enter URL, text, contact, or instructions" />
                <Input value={qrSize} onChange={(event) => setQrSize(event.target.value)} placeholder="QR size in px" />
                {qrInput.trim() ? (
                  <div className="flex flex-col items-center rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=${encodeURIComponent(qrSize || '256')}x${encodeURIComponent(qrSize || '256')}&data=${encodeURIComponent(qrInput)}`}
                      alt="Generated QR code"
                      className="h-48 w-48 rounded-2xl border border-slate-200 bg-white p-2"
                    />
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    onClick={() => {
                      resetMessages();
                      if (!qrInput.trim()) {
                        setErrorMessage('Enter text or a URL to generate a QR code.');
                        return;
                      }
                      setCompletedActions((prev) => prev + 1);
                      setStatusMessage('QR code generated.');
                    }}
                    className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                  >
                    <QrCode className="mr-2 h-4 w-4" />
                    Generate QR
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      await navigator.clipboard.writeText(qrInput);
                      setStatusMessage('QR source text copied.');
                    }}
                    className="rounded-xl"
                  >
                    Copy source
                  </Button>
                </div>
              </div>
            ) : null}

            {activeTool === 'text-case-converter' ? (
              <div className="space-y-4">
                <textarea
                  value={textCaseInput}
                  onChange={(event) => setTextCaseInput(event.target.value)}
                  className="min-h-[220px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900"
                  placeholder="Paste text here to change its case."
                />
                <div className="flex flex-wrap gap-3">
                  <Button type="button" onClick={() => setTextCaseInput((value) => value.toUpperCase())} className="rounded-xl bg-slate-950 text-white hover:bg-slate-800">UPPERCASE</Button>
                  <Button type="button" variant="outline" onClick={() => setTextCaseInput((value) => value.toLowerCase())} className="rounded-xl">lowercase</Button>
                  <Button type="button" variant="outline" onClick={() => setTextCaseInput((value) => value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))} className="rounded-xl">Title Case</Button>
                  <Button type="button" variant="outline" onClick={() => setTextCaseInput((value) => value.charAt(0).toUpperCase() + value.slice(1).toLowerCase())} className="rounded-xl">Sentence</Button>
                </div>
              </div>
            ) : null}

            {activeTool === 'word-counter' ? (
              <div className="space-y-4">
                <textarea
                  value={wordCounterInput}
                  onChange={(event) => setWordCounterInput(event.target.value)}
                  className="min-h-[220px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900"
                  placeholder="Paste or type text to count words and characters."
                />
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-[1rem] border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Words</p><p className="mt-2 text-xl font-semibold text-slate-950">{wordStats.words}</p></div>
                  <div className="rounded-[1rem] border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Chars</p><p className="mt-2 text-xl font-semibold text-slate-950">{wordStats.characters}</p></div>
                  <div className="rounded-[1rem] border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Lines</p><p className="mt-2 text-xl font-semibold text-slate-950">{wordStats.lines}</p></div>
                </div>
              </div>
            ) : null}

            {activeTool === 'url-encoder' ? (
              <div className="space-y-4">
                <textarea
                  value={urlCodecInput}
                  onChange={(event) => setUrlCodecInput(event.target.value)}
                  className="min-h-[220px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900"
                  placeholder="Paste a URL or query string here."
                />
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    onClick={() => {
                      resetMessages();
                      try {
                        setUrlCodecInput(encodeURIComponent(urlCodecInput));
                        setCompletedActions((prev) => prev + 1);
                        setStatusMessage('URL encoded.');
                      } catch {
                        setErrorMessage('Unable to encode this value.');
                      }
                    }}
                    className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                  >
                    Encode
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      resetMessages();
                      try {
                        setUrlCodecInput(decodeURIComponent(urlCodecInput));
                        setCompletedActions((prev) => prev + 1);
                        setStatusMessage('URL decoded.');
                      } catch {
                        setErrorMessage('Unable to decode this value.');
                      }
                    }}
                    className="rounded-xl"
                  >
                    Decode
                  </Button>
                </div>
              </div>
            ) : null}

            {activeTool === 'base64-tool' ? (
              <div className="space-y-4">
                <textarea
                  value={base64Input}
                  onChange={(event) => setBase64Input(event.target.value)}
                  className="min-h-[220px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900"
                  placeholder="Paste plain text or base64 text here."
                />
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    onClick={() => {
                      resetMessages();
                      try {
                        const bytes = new TextEncoder().encode(base64Input);
                        let binary = '';
                        bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
                        setBase64Input(btoa(binary));
                        setCompletedActions((prev) => prev + 1);
                        setStatusMessage('Encoded to base64.');
                      } catch {
                        setErrorMessage('Unable to encode this text.');
                      }
                    }}
                    className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                  >
                    Encode
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      resetMessages();
                      try {
                        const binary = atob(base64Input.trim());
                        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
                        setBase64Input(new TextDecoder().decode(bytes));
                        setCompletedActions((prev) => prev + 1);
                        setStatusMessage('Decoded from base64.');
                      } catch {
                        setErrorMessage('Enter a valid base64 value to decode.');
                      }
                    }}
                    className="rounded-xl"
                  >
                    Decode
                  </Button>
                </div>
              </div>
            ) : null}

            {activeTool === 'slug-generator' ? (
              <div className="space-y-4">
                <Input value={slugInput} onChange={(event) => setSlugInput(event.target.value)} placeholder="Enter title or phrase" />
                <div className="rounded-[1.15rem] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Slug</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">{toSlug(slugInput) || 'your-slug-will-appear-here'}</p>
                </div>
              </div>
            ) : null}

            {activeTool === 'html-escape' ? (
              <div className="space-y-4">
                <textarea
                  value={htmlEscapeInput}
                  onChange={(event) => setHtmlEscapeInput(event.target.value)}
                  className="min-h-[220px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900"
                  placeholder="Paste HTML or escaped text here."
                />
                <div className="flex flex-wrap gap-3">
                  <Button type="button" onClick={() => setHtmlEscapeInput((value) => escapeHtmlValue(value))} className="rounded-xl bg-slate-950 text-white hover:bg-slate-800">Escape</Button>
                  <Button type="button" variant="outline" onClick={() => setHtmlEscapeInput((value) => unescapeHtmlValue(value))} className="rounded-xl">Unescape</Button>
                </div>
              </div>
            ) : null}

            {activeTool === 'duplicate-line-remover' ? (
              <div className="space-y-4">
                <textarea
                  value={duplicateLineInput}
                  onChange={(event) => setDuplicateLineInput(event.target.value)}
                  className="min-h-[220px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900"
                  placeholder="Paste line-based text here."
                />
                <Button
                  type="button"
                  onClick={() => {
                    const unique = Array.from(new Set(duplicateLineInput.split('\n').map((line) => line.trim()).filter(Boolean)));
                    setDuplicateLineInput(unique.join('\n'));
                    setCompletedActions((prev) => prev + 1);
                    setStatusMessage('Duplicate lines removed.');
                  }}
                  className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                >
                  Remove Duplicates
                </Button>
              </div>
            ) : null}

            {activeTool === 'uuid-generator' ? (
              <div className="space-y-4">
                <Input value={uuidCount} onChange={(event) => setUuidCount(event.target.value)} placeholder="How many UUIDs?" />
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    onClick={() => {
                      resetMessages();
                      const count = Math.max(1, Math.min(20, Number(uuidCount) || 1));
                      const next = Array.from({ length: count }, () => crypto.randomUUID());
                      setGeneratedUuids(next);
                      setCompletedActions((prev) => prev + 1);
                      setStatusMessage(`${count} UUID${count > 1 ? 's' : ''} generated.`);
                    }}
                    className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                  >
                    Generate UUIDs
                  </Button>
                </div>
                {generatedUuids.length ? (
                  <div className="rounded-[1.15rem] border border-slate-200 bg-slate-50 p-4">
                    <div className="space-y-2 font-mono text-sm text-slate-800">
                      {generatedUuids.map((item) => <div key={item}>{item}</div>)}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeTool === 'hash-generator' ? (
              <div className="space-y-4">
                <textarea
                  value={hashInput}
                  onChange={(event) => setHashInput(event.target.value)}
                  className="min-h-[180px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900"
                  placeholder="Paste text to hash."
                />
                <select value={hashAlgorithm} onChange={(event) => setHashAlgorithm(event.target.value as 'SHA-1' | 'SHA-256' | 'SHA-512')} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                  <option value="SHA-1">SHA-1</option>
                  <option value="SHA-256">SHA-256</option>
                  <option value="SHA-512">SHA-512</option>
                </select>
                <Button
                  type="button"
                  onClick={() => void runTool('hash-generator', async () => {
                    if (!hashInput.trim()) throw new Error('Enter text to hash.');
                    const next = await createHash(hashInput, hashAlgorithm);
                    setHashOutput(next);
                    setStatusMessage(`${hashAlgorithm} hash generated.`);
                  })}
                  className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                >
                  {busyTool === 'hash-generator' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Hash className="mr-2 h-4 w-4" />}
                  Generate Hash
                </Button>
                {hashOutput ? <div className="rounded-[1.15rem] border border-slate-200 bg-slate-50 p-4 font-mono text-sm break-all text-slate-900">{hashOutput}</div> : null}
              </div>
            ) : null}

            {activeTool === 'unix-time-converter' ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-4 rounded-[1.15rem] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-900">Date to UNIX</p>
                  <Input type="datetime-local" value={timestampDateInput} onChange={(event) => setTimestampDateInput(event.target.value)} />
                  <Button
                    type="button"
                    onClick={() => {
                      if (!timestampDateInput) {
                        setErrorMessage('Choose a date and time first.');
                        return;
                      }
                      const unix = Math.floor(new Date(timestampDateInput).getTime() / 1000);
                      setTimestampInput(String(unix));
                      setCompletedActions((prev) => prev + 1);
                      setStatusMessage('Converted date to UNIX timestamp.');
                    }}
                    className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                  >
                    Convert to UNIX
                  </Button>
                </div>
                <div className="space-y-4 rounded-[1.15rem] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-900">UNIX to Date</p>
                  <Input value={timestampInput} onChange={(event) => setTimestampInput(event.target.value)} placeholder="1712057400" />
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                    {timestampInput && Number.isFinite(Number(timestampInput))
                      ? new Date(Number(timestampInput) * 1000).toLocaleString()
                      : 'Readable date will appear here.'}
                  </div>
                </div>
              </div>
            ) : null}

            {activeTool === 'color-converter' ? (
              <div className="space-y-4">
                <Input value={colorInput} onChange={(event) => setColorInput(event.target.value)} placeholder="#0f172a or rgb(15,23,42)" />
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    onClick={() => {
                      resetMessages();
                      const value = colorInput.trim();
                      if (value.startsWith('#')) {
                        const hex = value.replace('#', '');
                        const full = hex.length === 3 ? hex.split('').map((item) => item + item).join('') : hex;
                        if (!/^[0-9a-fA-F]{6}$/.test(full)) {
                          setErrorMessage('Enter a valid HEX color.');
                          return;
                        }
                        const red = parseInt(full.slice(0, 2), 16);
                        const green = parseInt(full.slice(2, 4), 16);
                        const blue = parseInt(full.slice(4, 6), 16);
                        setColorOutput(`rgb(${red}, ${green}, ${blue})`);
                      } else {
                        const match = value.match(/rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/i);
                        if (!match) {
                          setErrorMessage('Enter a valid RGB color.');
                          return;
                        }
                        const next = [match[1], match[2], match[3]]
                          .map((item) => Number(item).toString(16).padStart(2, '0'))
                          .join('');
                        setColorOutput(`#${next}`);
                      }
                      setCompletedActions((prev) => prev + 1);
                      setStatusMessage('Color converted.');
                    }}
                    className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                  >
                    Convert Color
                  </Button>
                </div>
                <div className="grid gap-4 md:grid-cols-[120px_minmax(0,1fr)]">
                  <div className="h-24 rounded-2xl border border-slate-200" style={{ background: colorInput.startsWith('#') || colorInput.startsWith('rgb') ? colorInput : '#ffffff' }} />
                  <div className="rounded-[1.15rem] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">{colorOutput}</div>
                </div>
              </div>
            ) : null}

            {activeTool === 'lorem-generator' ? (
              <div className="space-y-4">
                <Input value={loremParagraphs} onChange={(event) => setLoremParagraphs(event.target.value)} placeholder="Paragraph count" />
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    onClick={() => {
                      const count = Math.max(1, Math.min(8, Number(loremParagraphs) || 1));
                      setLoremOutput(generateLorem(count));
                      setCompletedActions((prev) => prev + 1);
                      setStatusMessage('Placeholder text generated.');
                    }}
                    className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                  >
                    Generate Text
                  </Button>
                </div>
                <textarea value={loremOutput} onChange={(event) => setLoremOutput(event.target.value)} className="min-h-[220px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900" placeholder="Generated paragraphs will appear here." />
              </div>
            ) : null}

            {activeTool === 'text-sorter' ? (
              <div className="space-y-4">
                <textarea
                  value={textSorterInput}
                  onChange={(event) => setTextSorterInput(event.target.value)}
                  className="min-h-[220px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900"
                  placeholder="Paste one line per item."
                />
                <label className="flex items-center gap-3 rounded-[1.15rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <input type="checkbox" checked={sortDescending} onChange={(event) => setSortDescending(event.target.checked)} />
                  Sort descending
                </label>
                <Button
                  type="button"
                  onClick={() => {
                    const next = textSorterInput.split('\n').map((line) => line.trim()).filter(Boolean).sort((left, right) => left.localeCompare(right));
                    if (sortDescending) {
                      next.reverse();
                    }
                    setTextSorterInput(next.join('\n'));
                    setCompletedActions((prev) => prev + 1);
                    setStatusMessage('Text list sorted.');
                  }}
                  className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                >
                  Sort Text
                </Button>
              </div>
            ) : null}

            {activeTool === 'form-builder' ? (
              isLoggedIn ? (
                <div className={isFormsMode ? 'grid gap-5 p-4 lg:p-5 xl:grid-cols-[minmax(0,1.35fr)_380px] 2xl:grid-cols-[minmax(0,1.45fr)_420px]' : 'space-y-5'}>
                  {isFormsMode ? (
                    <div className="order-2 xl:order-1">
                      <div className="overflow-hidden rounded-[1.6rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.9),rgba(255,255,255,0.98))] shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3.5">
                          <div>
                            <p className="text-sm font-semibold text-slate-950">Live Form Canvas</p>
                            {!isFormsMode ? <p className="text-xs text-slate-500">Respondent-facing view updates as you build.</p> : null}
                          </div>
                          <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1">
                            {[
                              { id: 'desktop', label: 'Desktop' },
                              { id: 'tablet', label: 'Tablet' },
                              { id: 'mobile', label: 'Mobile' },
                            ].map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => setFormPreviewViewport(item.id as 'desktop' | 'tablet' | 'mobile')}
                                className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition ${formPreviewViewport === item.id ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="overflow-auto bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.10),transparent_55%),linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] p-4 sm:p-5">
                          <div
                            className={`mx-auto overflow-hidden rounded-[1.7rem] border border-slate-200 bg-white shadow-[0_28px_70px_rgba(15,23,42,0.12)] transition-all duration-300 ${
                              formPreviewViewport === 'mobile'
                                ? 'w-[320px]'
                                : formPreviewViewport === 'tablet'
                                  ? 'w-full max-w-[760px]'
                                  : 'w-full'
                            }`}
                          >
                            <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
                              <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
                              <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                              <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                              <p className="ml-2 text-xs font-medium text-slate-500">Respondent preview</p>
                            </div>
                            <iframe
                              title="Live form preview"
                              srcDoc={liveFormPreviewHtml}
                              className={`w-full border-0 bg-white ${formPreviewViewport === 'mobile' ? 'h-[760px]' : 'h-[820px]'}`}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className={isFormsMode ? 'order-1 space-y-4 xl:order-2' : 'space-y-5'}>
                  <div className={isFormsMode ? 'rounded-[1.25rem] border border-slate-200 bg-slate-50/90 p-2' : ''}>
                  <div className={isFormsMode ? 'grid grid-cols-1 gap-2' : 'no-scrollbar flex flex-wrap gap-2 overflow-x-auto'}>
                    {[
                      { id: 'builder', label: 'Builder' },
                      { id: 'history', label: 'Forms History' },
                      { id: 'insights', label: 'AI Insights' },
                    ].map((item) => (
                      <Button
                        key={item.id}
                        type="button"
                        variant={formPanel === item.id ? 'default' : 'outline'}
                        className={`justify-start rounded-xl text-xs sm:text-sm ${isFormsMode ? 'w-full px-3 py-3 text-left' : 'shrink-0'} ${formPanel === item.id ? 'bg-slate-950 text-white hover:bg-slate-800' : 'border-slate-200 bg-white hover:bg-slate-100'}`}
                        onClick={() => setFormPanel(item.id as 'builder' | 'history' | 'insights')}
                      >
                        {item.label}
                      </Button>
                    ))}
                  </div>
                  </div>

                  {formPanel === 'builder' ? (
                    <>
                  <div className={isFormsMode ? 'rounded-[1.25rem] border border-slate-200 bg-white/92 p-2 shadow-[0_10px_28px_rgba(15,23,42,0.04)]' : ''}>
                  <div className={isFormsMode ? 'grid grid-cols-1 gap-2 sm:grid-cols-2' : 'no-scrollbar flex flex-wrap gap-2 overflow-x-auto'}>
                    {[
                      { id: 'basics', label: '1. Basics' },
                      { id: 'experience', label: '2. Experience' },
                      { id: 'fields', label: '3. Fields' },
                      { id: 'publish', label: '4. Publish' },
                    ].map((item) => (
                      <Button
                        key={item.id}
                        type="button"
                        variant={formBuilderStep === item.id ? 'default' : 'outline'}
                        className={`rounded-xl text-xs sm:text-sm ${isFormsMode ? 'w-full justify-start px-3 py-3 text-left' : 'shrink-0'} ${formBuilderStep === item.id ? 'bg-slate-950 text-white hover:bg-slate-800' : 'border-slate-200 bg-white hover:bg-slate-100'}`}
                        onClick={() => setFormBuilderStep(item.id as 'basics' | 'experience' | 'fields' | 'publish')}
                      >
                        {item.label}
                      </Button>
                    ))}
                  </div>
                  </div>
                  {formBuilderStep === 'basics' ? (
                  <div className="space-y-4 rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
                        <div className="rounded-[1.2rem] border border-amber-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,247,237,0.92))] p-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-950">AI Form Generator</p>
                            {!isFormsMode ? <p className="mt-1 text-xs leading-5 text-slate-500">Describe the form you want and docrud will draft the structure, copy, and starter fields for you.</p> : null}
                          </div>
                          <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-white">AI assist</span>
                        </div>
                        <textarea
                          value={aiFormPrompt}
                          onChange={(event) => setAiFormPrompt(event.target.value)}
                          className="mt-4 min-h-[110px] w-full rounded-2xl border border-amber-100 bg-white px-4 py-3 text-sm leading-6 text-slate-900"
                          placeholder="Example: Create a hiring application form for a sales manager role with candidate details, experience, notice period, and portfolio upload."
                        />
                        <div className="mt-4 flex flex-wrap gap-2">
                          {[
                            'Hiring application form',
                            'Sales lead capture form',
                            'Customer feedback survey',
                            'Event registration form',
                          ].map((prompt) => (
                            <button
                              key={prompt}
                              type="button"
                              onClick={() => setAiFormPrompt(prompt)}
                              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                            >
                              {prompt}
                            </button>
                          ))}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            onClick={() => {
                              if (!aiFormPrompt.trim()) {
                                setErrorMessage('Describe the form you want to generate first.');
                                return;
                              }
                              resetMessages();
                              const draft = buildAiFormDraft(aiFormPrompt);
                              setFormTitle(draft.title);
                              setFormDescription(draft.description);
                              setFormInstructions(draft.instructions);
                              setFormAccessMode(draft.accessMode);
                              setFormFields([...draft.fields]);
                              setFormAppearance((current) => ({
                                ...current,
                                heroTitle: draft.title,
                                heroDescription: draft.description,
                                introNote: draft.instructions,
                              }));
                              setStatusMessage('AI form draft generated. Refine it and continue building.');
                            }}
                            className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                          >
                            <Sparkles className="mr-2 h-4 w-4" />
                            Generate with AI
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-xl"
                            onClick={() => {
                              setAiFormPrompt('');
                            }}
                          >
                            Clear prompt
                          </Button>
                        </div>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Input value={formTitle} onChange={(event) => setFormTitle(event.target.value)} placeholder="Form title" />
                        <Input value={formDescription} onChange={(event) => setFormDescription(event.target.value)} placeholder="Short description" />
                      </div>
                      <textarea value={formInstructions} onChange={(event) => setFormInstructions(event.target.value)} className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900" placeholder="Instructions for respondents" />
                      <div className="grid gap-4 md:grid-cols-2">
                        <select value={formAccessMode} onChange={(event) => setFormAccessMode(event.target.value as 'secure' | 'open')} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                          <option value="secure">Secure form</option>
                          <option value="open">Open form</option>
                        </select>
                        <Input value={formPassword} onChange={(event) => setFormPassword(event.target.value.toUpperCase())} placeholder="Custom password (optional)" disabled={formAccessMode === 'open'} />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Input value={formExpiryDays} onChange={(event) => setFormExpiryDays(event.target.value)} placeholder="Expiry days (optional)" />
                        <Input value={formMaxResponses} onChange={(event) => setFormMaxResponses(event.target.value)} placeholder="Max responses (optional)" />
                      </div>
                  </div>
                  ) : null}

                  {formBuilderStep === 'experience' ? (
                  <div className="space-y-4">
                    <div className="space-y-4 rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-950">Form appearance</p>
                          {!isFormsMode ? <p className="text-xs text-slate-500">Tune the shared page, preview shell, and response experience.</p> : null}
                        </div>
                        <Button type="button" variant="outline" className="rounded-xl" onClick={() => setFormAppearance(defaultFormAppearance)}>
                          Reset style
                        </Button>
                      </div>
                      <div className={`grid gap-4 ${isFormsMode ? 'grid-cols-1' : 'md:grid-cols-2'}`}>
                        <Input value={formAppearance.eyebrow} onChange={(event) => setFormAppearance((current) => ({ ...current, eyebrow: event.target.value }))} placeholder="Eyebrow label" />
                        <Input value={formAppearance.heroTitle} onChange={(event) => setFormAppearance((current) => ({ ...current, heroTitle: event.target.value }))} placeholder="Hero title override" />
                        <Input value={formAppearance.submitLabel} onChange={(event) => setFormAppearance((current) => ({ ...current, submitLabel: event.target.value }))} placeholder="Submit button label" />
                        <Input value={formAppearance.successMessage} onChange={(event) => setFormAppearance((current) => ({ ...current, successMessage: event.target.value }))} placeholder="Success message" />
                      </div>
                      <textarea value={formAppearance.heroDescription} onChange={(event) => setFormAppearance((current) => ({ ...current, heroDescription: event.target.value }))} className="min-h-[100px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900" placeholder="Hero description on the shared form page" />
                      <textarea value={formAppearance.introNote} onChange={(event) => setFormAppearance((current) => ({ ...current, introNote: event.target.value }))} className="min-h-[84px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900" placeholder="Optional note above the response workflow" />
                      <textarea value={formAppearance.footerNote} onChange={(event) => setFormAppearance((current) => ({ ...current, footerNote: event.target.value }))} className="min-h-[84px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900" placeholder="Footer note on the form preview" />
                      <div className={`grid gap-4 ${isFormsMode ? 'grid-cols-1' : 'md:grid-cols-3'}`}>
                        <select value={formAppearance.surfaceTone} onChange={(event) => setFormAppearance((current) => ({ ...current, surfaceTone: event.target.value as FormAppearanceDraft['surfaceTone'] }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                          <option value="slate">Slate</option>
                          <option value="amber">Amber</option>
                          <option value="emerald">Emerald</option>
                          <option value="sky">Sky</option>
                          <option value="rose">Rose</option>
                        </select>
                        <select value={formAppearance.cardStyle} onChange={(event) => setFormAppearance((current) => ({ ...current, cardStyle: event.target.value as FormAppearanceDraft['cardStyle'] }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                          <option value="soft">Soft cards</option>
                          <option value="outlined">Outlined cards</option>
                          <option value="glass">Glass cards</option>
                        </select>
                        <select value={formAppearance.buttonStyle} onChange={(event) => setFormAppearance((current) => ({ ...current, buttonStyle: event.target.value as FormAppearanceDraft['buttonStyle'] }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                          <option value="solid">Solid button</option>
                          <option value="outline">Outline button</option>
                        </select>
                      </div>
                      <div className={`grid gap-4 ${isFormsMode ? 'grid-cols-1' : 'md:grid-cols-3'}`}>
                        <select value={formAppearance.heroAlignment} onChange={(event) => setFormAppearance((current) => ({ ...current, heroAlignment: event.target.value as FormAppearanceDraft['heroAlignment'] }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                          <option value="left">Hero align left</option>
                          <option value="center">Hero align center</option>
                        </select>
                        <select value={String(formAppearance.fieldColumns)} onChange={(event) => setFormAppearance((current) => ({ ...current, fieldColumns: Number(event.target.value) as 1 | 2 }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                          <option value="1">Single column form</option>
                          <option value="2">Two column form</option>
                        </select>
                        <select value={formAppearance.submitButtonWidth} onChange={(event) => setFormAppearance((current) => ({ ...current, submitButtonWidth: event.target.value as FormAppearanceDraft['submitButtonWidth'] }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                          <option value="full">Full width submit</option>
                          <option value="fit">Fit-content submit</option>
                        </select>
                      </div>
                      <Input value={formAppearance.thankYouRedirectUrl} onChange={(event) => setFormAppearance((current) => ({ ...current, thankYouRedirectUrl: event.target.value }))} placeholder="Optional success redirect URL" />
                      <div className={`grid gap-4 ${isFormsMode ? 'grid-cols-1' : 'md:grid-cols-3'}`}>
                        <label className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">
                          Accent
                          <input type="color" value={formAppearance.accentColor} onChange={(event) => setFormAppearance((current) => ({ ...current, accentColor: event.target.value }))} className="mt-2 h-10 w-full rounded-lg border-0 bg-transparent p-0" />
                        </label>
                        <label className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">
                          Background
                          <input type="color" value={formAppearance.backgroundColor} onChange={(event) => setFormAppearance((current) => ({ ...current, backgroundColor: event.target.value }))} className="mt-2 h-10 w-full rounded-lg border-0 bg-transparent p-0" />
                        </label>
                        <label className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">
                          Text
                          <input type="color" value={formAppearance.textColor} onChange={(event) => setFormAppearance((current) => ({ ...current, textColor: event.target.value }))} className="mt-2 h-10 w-full rounded-lg border-0 bg-transparent p-0" />
                        </label>
                      </div>
                      <div className={`grid gap-3 ${isFormsMode ? 'grid-cols-1' : 'md:grid-cols-2'}`}>
                        <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                          <input type="checkbox" checked={formAppearance.showFieldTypes} onChange={(event) => setFormAppearance((current) => ({ ...current, showFieldTypes: event.target.checked }))} />
                          Show field types
                        </label>
                        <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                          <input type="checkbox" checked={formAppearance.showOptionChips} onChange={(event) => setFormAppearance((current) => ({ ...current, showOptionChips: event.target.checked }))} />
                          Show option chips
                        </label>
                        <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                          <input type="checkbox" checked={formAppearance.allowSingleEditAfterSubmit} onChange={(event) => setFormAppearance((current) => ({ ...current, allowSingleEditAfterSubmit: event.target.checked }))} />
                          Allow one edit after submit
                        </label>
                        <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                          <input type="checkbox" checked={formAppearance.showSubmissionHistory} onChange={(event) => setFormAppearance((current) => ({ ...current, showSubmissionHistory: event.target.checked }))} />
                          Show edit history to respondents
                        </label>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-950">Media slider</p>
                            {!isFormsMode ? <p className="text-xs text-slate-500">Add hero images with optional CTA labels. More than 3 auto-loops smoothly.</p> : null}
                          </div>
                          <Button type="button" variant="outline" className="rounded-xl" onClick={addMediaSlide}>Add slide</Button>
                        </div>
                        <div className="mt-4 space-y-3">
                          {formAppearance.mediaSlides.map((slide) => (
                            <div key={slide.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                              <div className={`grid gap-3 ${isFormsMode ? 'grid-cols-1' : 'md:grid-cols-2'}`}>
                                <Input value={slide.title || ''} onChange={(event) => updateMediaSlide(slide.id, { title: event.target.value })} placeholder="Slide title" />
                                <Input value={slide.ctaLabel || ''} onChange={(event) => updateMediaSlide(slide.id, { ctaLabel: event.target.value })} placeholder="CTA label" />
                                <Input value={slide.description || ''} onChange={(event) => updateMediaSlide(slide.id, { description: event.target.value })} placeholder="Slide description" />
                                <Input value={slide.ctaUrl || ''} onChange={(event) => updateMediaSlide(slide.id, { ctaUrl: event.target.value })} placeholder="CTA URL" />
                                <Input value={slide.imageUrl || ''} onChange={(event) => updateMediaSlide(slide.id, { imageUrl: event.target.value })} placeholder="Image URL or uploaded data URL" className="md:col-span-2" />
                                <Input type="file" accept="image/*" onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  if (!file) return;
                                  void readFileAsDataUrl(file).then((result) => updateMediaSlide(slide.id, { imageUrl: result })).catch((error) => setErrorMessage(error instanceof Error ? error.message : 'Unable to load image.'));
                                }} className="md:col-span-2" />
                              </div>
                              <div className="mt-3 flex justify-end">
                                <Button type="button" variant="ghost" className="rounded-xl text-rose-600 hover:text-rose-700" onClick={() => removeMediaSlide(slide.id)}>Remove slide</Button>
                              </div>
                            </div>
                          ))}
                          {formAppearance.mediaSlides.length === 0 ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">No slides added yet.</div> : null}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-950">CTA buttons</p>
                            {!isFormsMode ? <p className="text-xs text-slate-500">Add website links and WhatsApp redirection buttons.</p> : null}
                          </div>
                          <div className="flex gap-2">
                            <Button type="button" variant="outline" className="rounded-xl" onClick={() => addCtaButton('link')}>Add link CTA</Button>
                            <Button type="button" variant="outline" className="rounded-xl" onClick={() => addCtaButton('whatsapp')}>WhatsApp CTA</Button>
                          </div>
                        </div>
                        <div className="mt-4 space-y-3">
                          {formAppearance.ctaButtons.map((button) => (
                            <div key={button.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                              <div className={`grid gap-3 ${isFormsMode ? 'grid-cols-1' : 'md:grid-cols-3'}`}>
                                <Input value={button.label || ''} onChange={(event) => updateCtaButton(button.id, { label: event.target.value })} placeholder="Button label" />
                                <select value={button.type || 'link'} onChange={(event) => updateCtaButton(button.id, { type: event.target.value as FormCtaButton['type'] })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                                  <option value="link">Website link</option>
                                  <option value="whatsapp">WhatsApp</option>
                                </select>
                                <Input value={button.url || ''} onChange={(event) => updateCtaButton(button.id, { url: event.target.value })} placeholder={button.type === 'whatsapp' ? 'https://wa.me/...' : 'https://example.com'} />
                              </div>
                              <div className="mt-3 flex justify-end">
                                <Button type="button" variant="ghost" className="rounded-xl text-rose-600 hover:text-rose-700" onClick={() => removeCtaButton(button.id)}>Remove CTA</Button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className={`mt-4 grid gap-3 ${isFormsMode ? 'grid-cols-1' : 'md:grid-cols-2'}`}>
                          <Input value={formAppearance.whatsappNumber} onChange={(event) => setFormAppearance((current) => ({ ...current, whatsappNumber: event.target.value }))} placeholder="WhatsApp number, e.g. 919876543210" />
                          <Input value={formAppearance.whatsappMessage} onChange={(event) => setFormAppearance((current) => ({ ...current, whatsappMessage: event.target.value }))} placeholder="Default WhatsApp message" />
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-950">Advertisement banners</p>
                            {!isFormsMode ? <p className="text-xs text-slate-500">Add promotional or informational banners around the form.</p> : null}
                          </div>
                          <Button type="button" variant="outline" className="rounded-xl" onClick={addBanner}>Add banner</Button>
                        </div>
                        <div className="mt-4 space-y-3">
                          {formAppearance.banners.map((banner) => (
                            <div key={banner.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                              <div className={`grid gap-3 ${isFormsMode ? 'grid-cols-1' : 'md:grid-cols-2'}`}>
                                <Input value={banner.title || ''} onChange={(event) => updateBanner(banner.id, { title: event.target.value })} placeholder="Banner title" />
                                <Input value={banner.ctaLabel || ''} onChange={(event) => updateBanner(banner.id, { ctaLabel: event.target.value })} placeholder="Banner CTA label" />
                                <Input value={banner.description || ''} onChange={(event) => updateBanner(banner.id, { description: event.target.value })} placeholder="Banner description" className="md:col-span-2" />
                                <Input value={banner.ctaUrl || ''} onChange={(event) => updateBanner(banner.id, { ctaUrl: event.target.value })} placeholder="Banner CTA URL" />
                                <Input value={banner.imageUrl || ''} onChange={(event) => updateBanner(banner.id, { imageUrl: event.target.value })} placeholder="Banner image URL or uploaded data URL" />
                                <Input type="file" accept="image/*" onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  if (!file) return;
                                  void readFileAsDataUrl(file).then((result) => updateBanner(banner.id, { imageUrl: result })).catch((error) => setErrorMessage(error instanceof Error ? error.message : 'Unable to load image.'));
                                }} className="md:col-span-2" />
                              </div>
                              <div className="mt-3 flex justify-end">
                                <Button type="button" variant="ghost" className="rounded-xl text-rose-600 hover:text-rose-700" onClick={() => removeBanner(banner.id)}>Remove banner</Button>
                              </div>
                            </div>
                          ))}
                          {formAppearance.banners.length === 0 ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">No banners added yet.</div> : null}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Share output</p>
                      <div className="mt-4 space-y-3">
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Template tone</p>
                          <p className="mt-2 text-lg font-semibold capitalize text-slate-950">{formAppearance.surfaceTone}</p>
                          <p className="mt-1 text-xs text-slate-500">Card style: {formAppearance.cardStyle}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Submit CTA</p>
                          <p className="mt-2 text-lg font-semibold text-slate-950">{formAppearance.submitLabel || 'Submit Form Data'}</p>
                        </div>
                        {createdFormLink ? (
                          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                            <p className="text-sm font-semibold text-emerald-900">Shareable QR ready</p>
                            {(createdFormQrLink || currentFormQrUrl) ? (
                              <img
                                src={createdFormQrLink || currentFormQrUrl}
                                alt="Form QR code"
                                className="mx-auto mt-4 h-44 w-44 rounded-2xl border border-emerald-200 bg-white p-2"
                              />
                            ) : null}
                            <p className="mt-3 break-all text-xs text-emerald-900">{createdFormLink}</p>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
                            Create or update the form to generate the QR instantly.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  ) : null}

                  {formBuilderStep === 'fields' ? (
                  <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">Fields</p>
                        {!isFormsMode ? <p className="text-xs text-slate-500">Add clean respondent inputs and adjust their behavior.</p> : null}
                      </div>
                      <Button type="button" variant="outline" className="rounded-xl" onClick={addFormField}>Add Field</Button>
                    </div>
                    <div className="mt-4 space-y-3">
                      {formFields.map((field, index) => (
                        <div key={field.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className={`grid gap-3 ${isFormsMode ? 'grid-cols-1' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
                            <Input value={field.label} onChange={(event) => updateFormField(field.id, { label: event.target.value })} placeholder="Field label" />
                            <Input value={field.name} onChange={(event) => updateFormField(field.id, { name: toSlug(event.target.value).replace(/-/g, '_') })} placeholder="field_name" />
                            <select value={field.type} onChange={(event) => updateFormField(field.id, { type: event.target.value as FormBuilderField['type'] })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                              <option value="text">Text</option>
                              <option value="textarea">Textarea</option>
                              <option value="email">Email</option>
                              <option value="number">Number</option>
                              <option value="date">Date</option>
                              <option value="tel">Phone</option>
                              <option value="url">URL</option>
                              <option value="select">Select</option>
                              <option value="radio">Radio</option>
                              <option value="checkbox">Checkbox</option>
                              <option value="image">Image Upload</option>
                            </select>
                            <Input value={field.placeholder} onChange={(event) => updateFormField(field.id, { placeholder: event.target.value })} placeholder="Placeholder or helper text" />
                            {(field.type === 'select' || field.type === 'radio') ? (
                              <Input value={field.options} onChange={(event) => updateFormField(field.id, { options: event.target.value })} placeholder="Options, comma separated" />
                            ) : field.type === 'image' ? (
                              <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                                This field will accept image uploads in the shared form.
                              </div>
                            ) : <div />}
                            <div className={`rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 ${isFormsMode ? 'space-y-3' : 'flex items-center justify-between'}`}>
                              <label className="flex items-center gap-3 text-sm text-slate-700">
                                <input type="checkbox" checked={field.required} onChange={(event) => updateFormField(field.id, { required: event.target.checked })} />
                                Required
                              </label>
                              <div className={`flex gap-2 ${isFormsMode ? 'flex-wrap' : 'items-center'}`}>
                                {index > 0 ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="rounded-xl"
                                    onClick={() => setFormFields((current) => {
                                      const next = [...current];
                                      const currentIndex = next.findIndex((item) => item.id === field.id);
                                      if (currentIndex <= 0) return current;
                                      [next[currentIndex - 1], next[currentIndex]] = [next[currentIndex], next[currentIndex - 1]];
                                      return next;
                                    })}
                                  >
                                    Up
                                  </Button>
                                ) : null}
                                {index < formFields.length - 1 ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="rounded-xl"
                                    onClick={() => setFormFields((current) => {
                                      const next = [...current];
                                      const currentIndex = next.findIndex((item) => item.id === field.id);
                                      if (currentIndex === -1 || currentIndex >= next.length - 1) return current;
                                      [next[currentIndex], next[currentIndex + 1]] = [next[currentIndex + 1], next[currentIndex]];
                                      return next;
                                    })}
                                  >
                                    Down
                                  </Button>
                                ) : null}
                                {formFields.length > 1 ? (
                                  <Button type="button" variant="ghost" size="sm" onClick={() => removeFormField(field.id)} className="rounded-xl text-rose-600 hover:text-rose-700">
                                    Remove
                                  </Button>
                                ) : <span className="text-xs text-slate-400">Field {index + 1}</span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  ) : null}

                  {formBuilderStep === 'publish' ? (
                  <>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      disabled={busyTool === 'form-builder'}
                      onClick={() => void runTool('form-builder', async () => {
                        if (!formTitle.trim()) {
                          throw new Error('Add a form title before creating the form.');
                        }
                        const response = await fetch('/api/forms', {
                          method: editingFormId ? 'PATCH' : 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            id: editingFormId || undefined,
                            title: formTitle,
                            description: formDescription,
                            instructions: formInstructions,
                            accessMode: formAccessMode,
                            customPassword: formPassword,
                            expiryDays: formExpiryDays ? Number(formExpiryDays) : undefined,
                            maxResponses: formMaxResponses ? Number(formMaxResponses) : undefined,
                            fields: formFields.map((field) => ({
                              id: field.id,
                              label: field.label,
                              name: field.name || toSlug(field.label).replace(/-/g, '_'),
                              type: field.type,
                              placeholder: field.placeholder,
                              required: field.required,
                              options: (field.type === 'select' || field.type === 'radio')
                                ? field.options.split(',').map((item) => item.trim()).filter(Boolean)
                                : undefined,
                            })),
                            appearance: formAppearance,
                          }),
                        });
                        const payload = await response.json().catch(() => null);
                        if (!response.ok) {
                          throw new Error(payload?.error || `Unable to ${editingFormId ? 'update' : 'create'} the form.`);
                        }
                        const absolute = payload?.shareUrl
                          ? buildAbsoluteAppUrl(payload.shareUrl, typeof window !== 'undefined' ? window.location.origin : undefined)
                          : '';
                        setCreatedFormLink(absolute);
                        setCreatedFormPassword(payload?.sharePassword || '');
                        setCreatedFormQrLink(payload?.shareUrl ? buildQrImageUrl(payload.shareUrl, typeof window !== 'undefined' ? window.location.origin : undefined, 320) : '');
                        setStatusMessage(editingFormId ? 'Form updated successfully.' : payload?.requiresPassword ? 'Secure form created successfully.' : 'Open form created successfully.');
                        setEditingFormId('');
                        await loadSavedForms();
                      })}
                      className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                    >
                      {busyTool === 'form-builder' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
                      {editingFormId ? 'Update Form' : 'Create Form'}
                    </Button>
                    {editingFormId ? (
                      <Button type="button" variant="outline" className="rounded-xl" onClick={() => {
                        setEditingFormId('');
                        setFormTitle('');
                        setFormDescription('');
                        setFormInstructions('');
                        setFormAccessMode('secure');
                        setFormPassword('');
                        setFormExpiryDays('7');
                        setFormMaxResponses('');
                        setCreatedFormLink('');
                        setCreatedFormPassword('');
                        setCreatedFormQrLink('');
                        setFormAppearance(defaultFormAppearance);
                      }}>
                        Cancel edit
                      </Button>
                    ) : null}
                    {createdFormLink ? (
                      <Button type="button" variant="outline" className="rounded-xl" onClick={async () => {
                        await navigator.clipboard.writeText(createdFormLink);
                        setStatusMessage('Form link copied.');
                      }}>
                        Copy Link
                      </Button>
                    ) : null}
                  </div>

                  {createdFormLink ? (
                    <div className="rounded-[1.25rem] border border-emerald-200 bg-emerald-50 p-4">
                      <p className="text-sm font-semibold text-emerald-900">Form ready</p>
                      <p className="mt-2 break-all text-sm text-emerald-900">{createdFormLink}</p>
                      {createdFormPassword ? <p className="mt-2 text-sm text-emerald-900">Password: <span className="font-semibold">{createdFormPassword}</span></p> : <p className="mt-2 text-sm text-emerald-900">Open access is enabled for this form.</p>}
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button type="button" variant="outline" className="rounded-xl border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-100" onClick={() => window.open(createdFormLink, '_blank', 'noopener,noreferrer')}>
                          Open form
                        </Button>
                        <Button type="button" variant="outline" className="rounded-xl border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-100" onClick={() => {
                          const anchor = document.createElement('a');
                          anchor.href = createdFormQrLink || currentFormQrUrl;
                          anchor.download = `${toSlug(formTitle || 'docrud-form') || 'docrud-form'}-qr.png`;
                          anchor.click();
                        }}>
                          Download QR
                        </Button>
                        <Button type="button" variant="outline" className="rounded-xl border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-100" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`${formTitle || 'docrud form'}\n${createdFormLink}${createdFormPassword ? `\nPassword: ${createdFormPassword}` : ''}`)}`, '_blank', 'noopener,noreferrer')}>
                          WhatsApp
                        </Button>
                        <Button type="button" variant="outline" className="rounded-xl border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-100" onClick={() => {
                          const subject = encodeURIComponent(formTitle || 'docrud form');
                          const body = encodeURIComponent(`${createdFormLink}${createdFormPassword ? `\nPassword: ${createdFormPassword}` : ''}`);
                          window.location.href = `mailto:?subject=${subject}&body=${body}`;
                        }}>
                          Email
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  </>
                  ) : null}
                    </>
                  ) : null}

                  {formPanel === 'history' ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-3 rounded-[1.2rem] border border-slate-200 bg-slate-50 p-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-950">Saved forms</p>
                          {!isFormsMode ? <p className="text-xs text-slate-500">Open, edit, copy, or delete forms from one place.</p> : null}
                        </div>
                        <Button type="button" variant="outline" className="rounded-xl" onClick={() => void loadSavedForms()}>
                          Refresh
                        </Button>
                      </div>
                      {formsLoading ? <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Loading forms...</div> : null}
                      <div className="space-y-3">
                        {savedForms.map((form) => (
                          <div key={form.id} className="rounded-[1.2rem] border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
                            {(() => {
                              const absoluteShareLink = form.shareUrl ? buildAbsoluteAppUrl(form.shareUrl, typeof window !== 'undefined' ? window.location.origin : undefined) : '';
                              const qrPreviewUrl = form.shareUrl ? buildQrImageUrl(form.shareUrl, typeof window !== 'undefined' ? window.location.origin : undefined, 180) : '';
                              const qrDownloadUrl = form.shareUrl ? buildQrImageUrl(form.shareUrl, typeof window !== 'undefined' ? window.location.origin : undefined, 320) : '';

                              return (
                            <div className={`grid gap-4 ${isFormsMode ? 'grid-cols-1' : 'xl:grid-cols-[minmax(0,1.2fr)_240px]'}`}>
                              <div className="min-w-0">
                                <p className="text-base font-semibold text-slate-950">{form.name}</p>
                                {form.description ? <p className="mt-1 text-sm text-slate-600">{form.description}</p> : null}
                                <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
                                  <span className="rounded-full bg-slate-100 px-2.5 py-1">{form.fields.length} fields</span>
                                  <span className="rounded-full bg-slate-100 px-2.5 py-1">{form.submissions.length} submissions</span>
                                  <span className="rounded-full bg-slate-100 px-2.5 py-1">{form.accessMode}</span>
                                </div>
                                {absoluteShareLink ? (
                                  <div className="mt-4 rounded-[1rem] border border-slate-200 bg-slate-50 px-3 py-3">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Share link</p>
                                    <p className="mt-2 break-all text-xs leading-5 text-slate-600">{absoluteShareLink}</p>
                                    {form.sharePassword ? (
                                      <p className="mt-2 text-xs text-slate-600">
                                        Password: <span className="font-semibold text-slate-900">{form.sharePassword}</span>
                                      </p>
                                    ) : (
                                      <p className="mt-2 text-xs text-emerald-700">Open form</p>
                                    )}
                                  </div>
                                ) : null}

                                <div className="mt-4 flex flex-wrap gap-2">
                                  <Button type="button" variant="outline" className="rounded-xl" onClick={() => hydrateBuilderFromForm(form)}>Edit</Button>
                                  <Button type="button" variant="outline" className="rounded-xl" onClick={async () => {
                                    await navigator.clipboard.writeText(`${absoluteShareLink}${form.sharePassword ? `\nPassword: ${form.sharePassword}` : ''}`);
                                    setStatusMessage('Form share details copied.');
                                  }}>Copy share</Button>
                                  {absoluteShareLink ? (
                                    <Button type="button" variant="outline" className="rounded-xl" onClick={() => {
                                      const anchor = document.createElement('a');
                                      anchor.href = qrDownloadUrl;
                                      anchor.download = `${toSlug(form.name) || 'docrud-form'}-qr.png`;
                                      anchor.click();
                                    }}>Download QR</Button>
                                  ) : null}
                                  <Button type="button" variant="outline" className="rounded-xl" onClick={() => {
                                    setSelectedFormId(form.id);
                                    setFormPanel('insights');
                                  }}>AI insights</Button>
                                  <Button type="button" variant="ghost" className="rounded-xl text-rose-600 hover:text-rose-700" onClick={() => void runTool('form-builder', async () => {
                                    const response = await fetch(`/api/forms?id=${encodeURIComponent(form.id)}`, { method: 'DELETE' });
                                    const payload = await response.json().catch(() => null);
                                    if (!response.ok) {
                                      throw new Error(payload?.error || 'Unable to delete the form.');
                                    }
                                    if (selectedFormId === form.id) {
                                      setSelectedFormId('');
                                    }
                                    await loadSavedForms();
                                    setStatusMessage('Form deleted successfully.');
                                  })}>Delete</Button>
                                </div>
                              </div>

                              <div className="rounded-[1.1rem] border border-slate-200 bg-slate-50 p-3">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">QR access</p>
                                {absoluteShareLink ? (
                                  <>
                                    <div className="mt-3 flex items-center justify-center rounded-[1rem] border border-slate-200 bg-white p-3">
                                      <img
                                        src={qrPreviewUrl}
                                        alt={`${form.name} QR code`}
                                        className="h-36 w-36 rounded-xl object-contain"
                                      />
                                    </div>
                                    {!isFormsMode ? <p className="mt-3 text-xs leading-5 text-slate-600">Scan to open the form instantly on another device.</p> : null}
                                  </>
                                ) : (
                                  <div className="mt-3 rounded-[1rem] border border-dashed border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-500">
                                    QR not ready
                                  </div>
                                )}
                              </div>
                            </div>
                              );
                            })()}
                          </div>
                        ))}
                        {!formsLoading && savedForms.length === 0 ? (
                          <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">No forms yet.</div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {formPanel === 'insights' ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        {savedForms.map((form) => (
                          <Button key={form.id} type="button" variant={selectedSavedForm?.id === form.id ? 'default' : 'outline'} className={`rounded-xl ${selectedSavedForm?.id === form.id ? 'bg-slate-950 text-white hover:bg-slate-800' : ''}`} onClick={() => setSelectedFormId(form.id)}>
                            {form.name}
                          </Button>
                        ))}
                      </div>
                      {selectedSavedForm ? (
                        <>
                          <div className="grid gap-4 md:grid-cols-4">
                            <div className="rounded-[1.2rem] border border-slate-200 bg-white p-4"><p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Submissions</p><p className="mt-2 text-2xl font-semibold text-slate-950">{selectedSavedForm.insights.totalSubmissions}</p></div>
                            <div className="rounded-[1.2rem] border border-slate-200 bg-white p-4"><p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Completion</p><p className="mt-2 text-2xl font-semibold text-slate-950">{selectedSavedForm.insights.averageCompletionRate}%</p></div>
                            <div className="rounded-[1.2rem] border border-slate-200 bg-white p-4"><p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Image coverage</p><p className="mt-2 text-2xl font-semibold text-slate-950">{selectedSavedForm.insights.imageAttachmentRate ?? 0}%</p></div>
                            <div className="rounded-[1.2rem] border border-slate-200 bg-white p-4"><p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Velocity</p><p className="mt-2 text-lg font-semibold capitalize text-slate-950">{selectedSavedForm.insights.responseVelocity || 'early'}</p><p className="mt-1 text-xs text-slate-500">{selectedSavedForm.insights.submissionsPerDay || 0} per day</p></div>
                          </div>
                          <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50 p-4">
                            <p className="text-sm font-semibold text-slate-950">AI overview</p>
                            <p className="mt-2 text-sm leading-7 text-slate-700">{selectedSavedForm.insights.summary}</p>
                          </div>
                          <div className="rounded-[1.2rem] border border-slate-200 bg-white p-4">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-slate-950">Response trend</p>
                              <p className="text-xs text-slate-500">Recent completion quality</p>
                            </div>
                            <div className="mt-4 space-y-3">
                              {(selectedSavedForm.insights.recentTrend || []).map((item) => (
                                <div key={`${item.submittedAt}-${item.submittedBy}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm font-medium text-slate-900">{item.submittedBy}</p>
                                    <p className="text-xs text-slate-500">{new Date(item.submittedAt).toLocaleString()}</p>
                                  </div>
                                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                                    <div className="h-full rounded-full bg-slate-950" style={{ width: `${item.completionRate}%` }} />
                                  </div>
                                  <p className="mt-2 text-xs text-slate-600">{item.completionRate}% completion</p>
                                </div>
                              ))}
                              {(!selectedSavedForm.insights.recentTrend || selectedSavedForm.insights.recentTrend.length === 0) ? (
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">No response trend yet.</div>
                              ) : null}
                            </div>
                          </div>
                          <div className="grid gap-4 xl:grid-cols-2">
                            <div className="rounded-[1.2rem] border border-slate-200 bg-white p-4">
                              <p className="text-sm font-semibold text-slate-950">Strongest fields</p>
                              <div className="mt-3 space-y-3">
                                {selectedSavedForm.insights.strongestFields.map((item) => (
                                  <div key={item.field} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                    <p className="font-medium text-slate-900">{item.field}</p>
                                    <p className="mt-1 text-sm text-slate-600">Fill rate: {item.fillRate}%</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="rounded-[1.2rem] border border-slate-200 bg-white p-4">
                              <p className="text-sm font-semibold text-slate-950">Weakest fields</p>
                              <div className="mt-3 space-y-3">
                                {selectedSavedForm.insights.weakestFields.map((item) => (
                                  <div key={item.field} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                    <p className="font-medium text-slate-900">{item.field}</p>
                                    <p className="mt-1 text-sm text-slate-600">Fill rate: {item.fillRate}%</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="rounded-[1.2rem] border border-slate-200 bg-white p-4">
                            <p className="text-sm font-semibold text-slate-950">AI recommendations</p>
                            <div className="mt-3 space-y-2">
                              {selectedSavedForm.insights.recommendations.map((item) => (
                                <div key={item} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">{item}</div>
                              ))}
                            </div>
                          </div>
                          <div className="rounded-[1.2rem] border border-slate-200 bg-white p-4">
                            <p className="text-sm font-semibold text-slate-950">Submission history</p>
                            <div className="mt-3 space-y-3">
                              {selectedSavedForm.submissions.map((submission) => (
                                <div key={submission.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <p className="font-medium text-slate-900">{submission.submittedBy}</p>
                                    <p className="text-xs text-slate-500">{new Date(submission.submittedAt).toLocaleString()}</p>
                                  </div>
                                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                                    {Object.entries(submission.data).filter(([, value]) => String(value || '').trim()).slice(0, 8).map(([key, value]) => (
                                      <div key={key} className="rounded-lg bg-white px-3 py-2 text-sm text-slate-700">
                                        <span className="font-medium text-slate-900">{key.replace(/_/g, ' ')}:</span> {String(value)}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                              {selectedSavedForm.submissions.length === 0 ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">No submissions yet.</div> : null}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Create a form first to unlock AI submission insights.</div>
                      )}
                    </div>
                  ) : null}
                </div>
                </div>
              ) : (
                <div className="rounded-[1.35rem] border border-slate-200 bg-slate-50 p-6">
                  <p className="text-lg font-semibold text-slate-950">Login required for Form Builder</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">Create secure or open forms, share them, and collect responses with docrud access controls after login.</p>
                  <div className="mt-4">
                    <Button asChild className="rounded-xl bg-slate-950 text-white hover:bg-slate-800">
                      <Link href="/login">Login to build forms</Link>
                    </Button>
                  </div>
                </div>
              )
            ) : null}

	          </CardContent>
	        </Card>
      </div>
    </div>
  );
}
