/**
 * Variable contracts and the deterministic sample data used for previews.
 *
 * Two rules hold this together:
 *
 * 1. A contract is PER EMAIL, never global. `{{otp}}` is meaningful in a
 *    verification code and meaningless in a marketing campaign; offering every
 *    variable everywhere is how a literal `{{otp}}` ends up in an inbox.
 * 2. Sample data is fixed, obviously fake, and defined ONCE here. No preview or
 *    test send may reach for a real user record, a real OTP, or a real token —
 *    a preview is a rehearsal, and rehearsing with live credentials is how they
 *    leak.
 */

/**
 * Variables backed by a real recipient field.
 *
 * This is the contract for anything addressed to an audience — compose, drafts,
 * templates and campaigns — because these are exactly the values the campaign
 * send loop can resolve per recipient. Adding a name here without teaching
 * `recipientVariableValues` to produce it would mail a literal placeholder.
 */
export const AUDIENCE_VARIABLES = [
  'firstName', 'lastName', 'fullName', 'email', 'companyName', 'role',
] as const;
export type AudienceVariable = typeof AUDIENCE_VARIABLES[number];

/**
 * Sample values. Deterministic, so a preview looks the same every time and a
 * test can assert on it.
 *
 * `otp` is the giveaway case: it is a constant, and nothing in the preview or
 * test-send path is allowed to call the real code generator.
 */
export const SAMPLE_VALUES: Record<string, string> = {
  firstName: 'Test',
  lastName: 'User',
  fullName: 'Test User',
  email: 'test@example.com',
  companyName: 'Example Company',
  businessName: 'Example Company',
  role: 'Test Role',
  otp: '123456',
  reason: 'Example reason',
  category: 'Example category',
  action: 'Example action',
  expiresAt: '10 minutes',
  deadline: '1 January 2030',
};

/**
 * Sample values for one contract.
 *
 * Total by construction: a variable with no entry above still gets obviously
 * fake text, so a preview can never render a bare `{{something}}` merely
 * because this map was not updated alongside a new email.
 */
export function sampleValuesFor(variables: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of variables) {
    out[name] = SAMPLE_VALUES[name] ?? `Example ${name}`;
  }
  return out;
}

/**
 * Emails whose sample data must be flagged to the admin looking at it.
 *
 * Showing `123456` beside the word "code" invites someone to believe a preview
 * produced a working credential. It did not, and the UI says so.
 */
export const SECURITY_SENSITIVE_VARIABLES = ['otp', 'token', 'code', 'link'];

export function usesSecuritySensitiveData(variables: readonly string[]): boolean {
  return variables.some((v) => SECURITY_SENSITIVE_VARIABLES.includes(v));
}
