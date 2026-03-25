/**
 * docs/js/config.js
 * =================
 * Central configuration for the PGN Family Tree web app.
 *
 * Officers and maintainers should only ever need to edit this file.
 * All other JS modules import from here — no other file contains
 * hard-coded URLs or palette values.
 */

// ---------------------------------------------------------------------------
// Google Sheets data source
// ---------------------------------------------------------------------------

/**
 * Published CSV URL for the member data Google Sheet.
 *
 * HOW TO GET THIS URL:
 *   1. Open the Google Sheet containing member data.
 *   2. File → Share → Publish to web.
 *   3. Under "Link", choose the correct sheet tab and select
 *      "Comma-separated values (.csv)".
 *   4. Click Publish, then copy the URL shown.
 *   5. Replace the placeholder string below with that URL.
 *
 * The sheet must also be shared as "Anyone with the link can view"
 * (File → Share → Share with others → change to Anyone with the link).
 *
 * @type {string}
 */
export const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQuaKQXcBoNjqWDYSl-NRkuQMeaR7m8biJuzk-l0CqjbCnkcvZEzW3KgWLTcGuLT6eQsFx94T2iVCD7/pub?gid=0&single=true&output=csv";

// ---------------------------------------------------------------------------
// Info-panel field definitions
// ---------------------------------------------------------------------------

/**
 * Controls which CSV columns appear in the click-to-open member info panel,
 * and whether a copy-to-clipboard button is shown next to the value.
 *
 * Fields are rendered in the order listed here.  Only fields whose key is
 * present AND non-empty in a member's data are shown.
 *
 * To add a new field (e.g. phone number):
 *   1. Add the column to the Google Sheet with the exact header name.
 *   2. Add an entry below: { key: "phone", label: "Phone", copy: true }
 *   3. Push — no other code changes required.
 *
 * @type {Array<{key: string, label: string, copy: boolean}>}
 */
export const PANEL_FIELDS = [
  { key: "pledge_class", label: "Pledge Class", copy: false },
  { key: "class_year",   label: "Class Year",   copy: false },
  { key: "big",          label: "Big",           copy: false },
  { key: "email",        label: "Email",         copy: true  },
  // { key: "phone",     label: "Phone",          copy: true  },
];

// ---------------------------------------------------------------------------
// Lin color palette
// ---------------------------------------------------------------------------

/**
 * Maps lin name → pastel hex color used to fill tree nodes.
 *
 * Must be kept in sync with LIN_COLORS in src/constants.py so that the
 * Python-generated PNG outputs match the web app.
 *
 * "pgn" is the default / unassigned color for members with no lin ancestor.
 *
 * @type {Object<string, string>}
 */
export const LIN_COLORS = {
  "pgn":                               "#E8E8E8",  // light gray — default
  "watergates":                        "#A8C5F0",  // light royal blue
  "titans":                            "#F5A0A0",  // light crimson / salmon
  "bluechips":                         "#A0D4FF",  // light dodger blue
  "hello_kitties":                     "#FFB6D9",  // light pink
  "drunken_ducks":                     "#FFEB99",  // light gold
  "rockstars":                         "#D8A0F0",  // light violet
  "gods":                              "#90D890",  // light forest green
  "bluechips (adopted)":               "#C5E8F7",  // lighter sky blue
  "drunken_ducks (former bluechips)":  "#C5E8B0",  // light sage
  "dtf":                               "#FFD4A8",  // light peach / orange
};

// ---------------------------------------------------------------------------
// Tree layout constants
// ---------------------------------------------------------------------------

/** Internal ID for the hidden virtual root that connects multiple tree roots. */
export const VROOT = "__pgn_root__";

/** Width of each node rectangle in SVG units (pixels at 1× zoom). */
export const NODE_W = 150;

/** Height of each node rectangle in SVG units. */
export const NODE_H = 48;
