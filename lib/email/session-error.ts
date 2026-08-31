/**
 * One message for a lapsed Super Admin session.
 *
 * A 401 is not a server fault, but every mail screen except Overview and
 * Health used to render the API's raw "Unauthorized" - which reads like a
 * broken backend and sends an admin to investigate infrastructure when all
 * they need to do is sign in again. Overview and Health already said the right
 * thing; this makes the rest agree.
 *
 * Pure and dependency-free so client components can import it.
 */
export const SESSION_EXPIRED = 'Session expired — sign in again.';

/**
 * The message to show for a failed request.
 *
 * `fallback` covers the case where the server sent no error of its own.
 */
export function describeFetchError(
  status: number, serverError: unknown, fallback: string,
): string {
  if (status === 401 || status === 403) return SESSION_EXPIRED;
  const message = typeof serverError === 'string' ? serverError.trim() : '';
  return message || fallback;
}
