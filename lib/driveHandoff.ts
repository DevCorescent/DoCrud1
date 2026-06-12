/**
 * Drive Handoff — in-memory singleton for passing a file from the
 * Universal File Viewer to a dedicated editor WITHOUT a network round-trip.
 *
 * Flow:
 *   1. User clicks "Open in DocWord" inside the UFV
 *   2. UFV calls setDriveHandoffFile({ blob, name, mimeType })
 *   3. UFV navigates (same-tab, same-origin) to /docword
 *   4. DocWord Workspace calls getDriveHandoffFile() on mount
 *   5. If a file is present it auto-imports it (clears the store)
 *
 * The store is intentionally ephemeral — module-level variable only.
 * Navigation within the SPA preserves JS module state, so no
 * serialisation to sessionStorage / IndexedDB is needed.
 */

export interface DriveHandoffPayload {
  blob: Blob;
  name: string;
  mimeType?: string;
  /** Original file size in bytes (may differ from blob.size for compressed payloads) */
  bytes?: number;
  /** The drive file ID, if any, for back-linking */
  driveId?: string;
}

let _pending: DriveHandoffPayload | null = null;

/** Store a file before navigating to an editor. Previous value is replaced. */
export function setDriveHandoffFile(payload: DriveHandoffPayload): void {
  _pending = payload;
}

/**
 * Retrieve (and clear) the pending handoff file.
 * Returns null if nothing is waiting.
 */
export function getDriveHandoffFile(): DriveHandoffPayload | null {
  const f = _pending;
  _pending = null;
  return f;
}

/** Non-destructive check — returns true if a handoff is waiting. */
export function hasDriveHandoffFile(): boolean {
  return _pending !== null;
}

/** Discard any waiting handoff (call on editor unmount for cleanup). */
export function clearDriveHandoffFile(): void {
  _pending = null;
}
