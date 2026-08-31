/**
 * Which variable contract applies to the thing being previewed or tested.
 *
 * Preview and test send MUST agree about this. If preview allowed a variable
 * that test send rejected — or worse, the reverse — the admin would be
 * approving one contract and sending under another. So both routes ask this
 * one function, and neither carries a list of its own.
 */
import {
  AUDIENCE_VARIABLES, sampleValuesFor, usesSecuritySensitiveData,
} from '@/lib/email/variable-contracts';
import { getSystemEmailDefinition } from '@/lib/server/system-emails';

export const EMAIL_SOURCES = ['compose', 'draft', 'template', 'campaign', 'system'] as const;
export type EmailSource = typeof EMAIL_SOURCES[number];

export function isEmailSource(value: unknown): value is EmailSource {
  return (EMAIL_SOURCES as readonly string[]).includes(String(value));
}

export interface EmailRenderContext {
  source: EmailSource;
  /** Shown to the admin, so they can see which contract they are working in. */
  label: string;
  supported: string[];
  sampleValues: Record<string, string>;
  /**
   * True when sample data includes something a reader could mistake for a live
   * credential. The UI must say so out loud.
   */
  securitySensitive: boolean;
}

/**
 * Resolve the contract, or null when the request names something unknown.
 *
 * Null is a 404/400, never a permissive default: falling back to "allow
 * everything" would let an arbitrary `type` string opt out of validation.
 */
export function getEmailRenderContext(
  source: EmailSource, type?: string | null,
): EmailRenderContext | null {
  if (source === 'system') {
    const def = getSystemEmailDefinition(String(type ?? ''));
    if (!def) return null;
    return {
      source,
      label: def.name,
      supported: def.variables,
      sampleValues: def.sampleValues,
      securitySensitive: usesSecuritySensitiveData(def.variables),
    };
  }

  /* Compose, drafts, templates and campaigns all address an AUDIENCE, so they
     share one contract — the fields the campaign send loop can actually
     resolve per recipient. This is not a global variable list; it is the
     audience contract, and a system email cannot use it. */
  const supported = Array.from(AUDIENCE_VARIABLES);
  const label = source === 'template' ? 'Template'
    : source === 'campaign' ? 'Campaign'
      : source === 'draft' ? 'Draft' : 'New email';

  return {
    source,
    label,
    supported,
    sampleValues: sampleValuesFor(supported),
    securitySensitive: false,
  };
}
