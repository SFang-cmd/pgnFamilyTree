/**
 * docs/js/main.js
 * ===============
 * Application entry point — orchestrates startup and data loading.
 *
 * Execution order:
 *   1. Check whether SHEET_URL is still the placeholder; show setup screen if so.
 *   2. Show the loading screen and fetch the CSV from Google Sheets.
 *   3. Parse the CSV and render the D3 tree.
 *   4. Wire all UI controls.
 *   5. On any failure, show the error screen with a descriptive message.
 *
 * This module contains no rendering or parsing logic itself — it only
 * coordinates the other modules.
 *
 * Dependencies:
 *   - config.js   — SHEET_URL
 *   - csv.js      — parseCSV()
 *   - render.js   — render()
 *   - panel.js    — openPanel()
 *   - controls.js — setupControls()
 */

import { SHEET_URL } from "./config.js";
import { parseCSV }  from "./csv.js";
import { render }    from "./render.js";
import { openPanel } from "./panel.js";
import { setupControls } from "./controls.js";

// ---------------------------------------------------------------------------
// Screen helpers
// ---------------------------------------------------------------------------

/**
 * Show exactly one of the four mutually exclusive content areas:
 *   - "loading-screen"
 *   - "setup-screen"
 *   - "error-screen"
 *   - "tree-svg"
 *
 * All others are hidden.  The SVG uses display:block; the screen divs use
 * display:flex.
 *
 * @param {string} id - The element id to show.
 */
function show(id) {
  const screens = ["loading-screen", "setup-screen", "error-screen", "tree-svg"];
  screens.forEach(s => {
    const el = document.getElementById(s);
    if (!el) return;
    if (el.tagName === "SVG") {
      el.style.display = s === id ? "block" : "none";
    } else {
      el.style.display = s === id ? "flex" : "none";
    }
  });
}

/**
 * Show the error screen with a custom message.
 *
 * @param {string} html - HTML string for the error detail paragraph.
 */
function showError(html) {
  document.getElementById("error-msg").innerHTML = html;
  show("error-screen");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Load data and initialise the application.
 *
 * Called immediately at module load time (bottom of this file).
 */
async function main() {
  // Guard: if the user hasn't set their sheet URL yet, show setup instructions.
  if (SHEET_URL === "YOUR_GOOGLE_SHEETS_CSV_URL_HERE") {
    show("setup-screen");
    return;
  }

  show("loading-screen");

  try {
    const res = await fetch(SHEET_URL);
    if (!res.ok) {
      throw new Error(
        `HTTP ${res.status} — check that the sheet is published and public.`
      );
    }

    const text    = await res.text();
    const members = parseCSV(text);

    if (!members.length) {
      throw new Error(
        "Sheet returned no rows. Confirm it has a header row and at least one member."
      );
    }

    // Render the tree, passing openPanel as the node-click callback.
    // This avoids a circular import between render.js and panel.js.
    render(members, { onNodeClick: openPanel });

    show("tree-svg");

    // Wire controls after the tree exists so D3 selections find the nodes.
    setupControls();

  } catch (e) {
    showError(e.message);
  }
}

main();
