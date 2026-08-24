/**
 * Minimal RFC-4180 CSV parser (no external dependency — the repo intentionally
 * ships no CSV library). Handles quoted fields, embedded commas/newlines, and
 * doubled-quote ("") escaping. Returns rows of string cells; the caller maps
 * header → fields. This is a parser only — it performs no validation.
 */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  // Strip a UTF-8 BOM if present.
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ',') { row.push(field); field = ''; continue; }
    if (ch === '\r') { continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  // Flush the final field/row (files that don't end in a newline).
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  // Drop fully-empty trailing rows (e.g. a blank last line).
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}
