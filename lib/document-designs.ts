export const DEFAULT_DOCUMENT_DESIGN_PRESET = 'corporate-grid' as const;

export type DocumentDesignPreset =
  | 'corporate-grid'
  | 'executive-frame'
  | 'legal-classic'
  | 'modern-panel'
  | 'minimal-edge'
  | 'meridian-slate'
  | 'studio-band'
  | 'luxe-serif';

export const documentDesignPresets: Array<{
  id: DocumentDesignPreset;
  label: string;
  description: string;
}> = [
  {
    id: 'corporate-grid',
    label: 'Corporate Grid',
    description: 'Balanced two-column letterhead with structured metadata and boardroom-ready spacing.',
  },
  {
    id: 'executive-frame',
    label: 'Executive Frame',
    description: 'Premium framed header for leadership documents, approvals, and external-facing packets.',
  },
  {
    id: 'legal-classic',
    label: 'Legal Classic',
    description: 'Traditional serif-led format suited for contracts, notices, and policy documentation.',
  },
  {
    id: 'modern-panel',
    label: 'Modern Panel',
    description: 'Clean contemporary layout with an elevated right-side information panel.',
  },
  {
    id: 'minimal-edge',
    label: 'Minimal Edge',
    description: 'Quiet, minimalist letterhead with restrained accents for high-trust enterprise use.',
  },
  {
    id: 'meridian-slate',
    label: 'Meridian Slate',
    description: 'Dark executive metadata rail with crisp body spacing for premium SaaS and consulting workflows.',
  },
  {
    id: 'studio-band',
    label: 'Studio Band',
    description: 'Bold horizontal brand band with modern hierarchy for polished external communication.',
  },
  {
    id: 'luxe-serif',
    label: 'Luxe Serif',
    description: 'Refined editorial-style format for high-end proposals, legal packets, and formal correspondence.',
  },
];

export function isDocumentDesignPreset(value: unknown): value is DocumentDesignPreset {
  return documentDesignPresets.some((preset) => preset.id === value);
}
