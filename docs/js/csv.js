/**
 * docs/js/csv.js
 * ==============
 * CSV parsing utilities.
 *
 * Handles the quirks of CSV files exported from Google Sheets and Excel:
 *   - UTF-8 BOM prefix (common from Excel)
 *   - Quoted fields that may contain commas or newlines
 *   - Leading/trailing whitespace in headers and values
 *   - Header normalisation to snake_case for consistent property access
 */

/**
 * Parse a raw CSV string into an array of row objects.
 *
 * The first row is treated as the header.  Each subsequent row becomes an
 * object whose keys are the normalised header names and whose values are
 * trimmed strings.  Rows where "name" is empty are dropped.
 *
 * Header normalisation:
 *   - Trim whitespace
 *   - Lower-case
 *   - Replace runs of whitespace with underscores
 *   e.g. "Pledge Class" → "pledge_class"
 *
 * @param {string} raw - Raw CSV text from fetch() or FileReader.
 * @returns {Array<Object>} Array of member objects keyed by normalised header.
 */
export function parseCSV(raw) {
  // Strip UTF-8 BOM character that Excel sometimes prepends.
  raw = raw.replace(/^\uFEFF/, "");

  // Split into records while respecting quoted fields that contain newlines.
  // A plain raw.split(/\r?\n/) would break any field whose value spans lines.
  const lines = _splitRecords(raw);
  if (lines.length < 2) return [];

  // Normalise headers to snake_case lower-case.
  const headers = splitLine(lines[0]).map(h =>
    h.trim().toLowerCase().replace(/\s+/g, "_")
  );

  return lines.slice(1).map(line => {
    const vals = splitLine(line);
    const row  = {};
    headers.forEach((h, i) => {
      // Collapse embedded newlines in values to a single space, then trim.
      row[h] = (vals[i] ?? "").replace(/\r?\n/g, " ").trim();
    });
    return row;
  }).filter(r => r.name); // drop blank rows
}

/**
 * Split raw CSV text into record strings, respecting quoted fields that
 * may contain embedded newline characters.
 *
 * @param {string} raw
 * @returns {string[]}
 */
function _splitRecords(raw) {
  const records = [];
  let cur = "";
  let inQ = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') {
      inQ = !inQ;
      cur += ch;
    } else if (!inQ && ch === "\r") {
      if (raw[i + 1] === "\n") i++;
      records.push(cur);
      cur = "";
    } else if (!inQ && ch === "\n") {
      records.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) records.push(cur);
  return records;
}

/**
 * Split a single CSV line into an array of field strings.
 *
 * Handles quoted fields: a double-quote begins a quoted segment in which
 * commas are treated as literal characters, not separators.
 *
 * @param {string} line - A single line of CSV text.
 * @returns {string[]} Array of field values (not yet trimmed).
 */
export function splitLine(line) {
  const out = [];
  let cur   = "";
  let inQ   = false;

  for (const ch of line) {
    if (ch === '"') {
      inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur); // push final field
  return out;
}
