/**
 * docs/js/panel.js
 * ================
 * Member info panel — the slide-in drawer that opens when a node is clicked.
 *
 * Renders a structured view of member data using the PANEL_FIELDS whitelist
 * from config.js.  Fields with copy:true get a clipboard button; others do not.
 * The "Littles" section lists direct children and lets the user navigate to
 * them by clicking (calls focusNode from render.js).
 *
 * Dependencies:
 *   - config.js  — PANEL_FIELDS, LIN_COLORS, VROOT
 *   - render.js  — focusNode()
 *   - D3 v7 loaded as a global <script> in index.html
 */

import { PANEL_FIELDS, LIN_COLORS, VROOT } from "./config.js";
import { focusNode } from "./render.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Open (or update) the info panel for the given D3 hierarchy node.
 *
 * If the panel is already open it slides into its new content immediately
 * without re-animating.  The `.open` class is toggled via CSS transition.
 *
 * @param {d3.HierarchyNode} d - The clicked D3 node datum.
 */
export function openPanel(d) {
  const panel   = document.getElementById("info-panel");
  const content = document.getElementById("info-content");

  // Derive an accent colour from the member's lin fill colour for the h2 border.
  const accent = d3.color(LIN_COLORS[d.data._lin] || "#E8E8E8").darker(0.4).formatHex();

  let html = `<h2 style="border-left-color:${accent}">${d.data.name}</h2>`;

  // Render each field from the whitelist (skip fields that are empty in the data).
  for (const field of PANEL_FIELDS) {
    const val = (d.data[field.key] || "").trim();
    if (!val) continue;

    html += `<div class="info-field">
      <div class="info-label">${field.label}</div>
      <div class="info-value-row">
        <span class="info-value">${val}</span>
        ${field.copy
          ? `<button class="copy-btn" data-val="${_escAttr(val)}">Copy</button>`
          : ""}
      </div>
    </div>`;
  }

  // Littles section — direct children in the D3 hierarchy, excluding VROOT.
  const littles = (d.children || []).filter(c => c.id !== VROOT);
  if (littles.length) {
    html += `<hr class="info-divider">
    <div class="info-littles">
      <h3>Littles (${littles.length})</h3>
      <ul>`;
    littles.forEach(c => {
      html += `<li data-name="${_escAttr(c.data.name)}">${c.data.name}</li>`;
    });
    html += `</ul></div>`;
  }

  content.innerHTML = html;

  // Wire copy-to-clipboard buttons.
  content.querySelectorAll(".copy-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(btn.dataset.val).then(() => {
        btn.textContent = "Copied!";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.textContent = "Copy";
          btn.classList.remove("copied");
        }, 1800);
      });
    });
  });

  // Wire littles — clicking a name pans the tree to that node.
  content.querySelectorAll(".info-littles li").forEach(li => {
    li.addEventListener("click", () => focusNode(li.dataset.name));
  });

  panel.classList.add("open");
}

/**
 * Close the info panel by removing the `.open` class.
 * The CSS transition handles the slide-out animation.
 */
export function closePanel() {
  document.getElementById("info-panel").classList.remove("open");
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Escape a string for safe use in an HTML attribute value.
 *
 * @param {string} s
 * @returns {string}
 */
function _escAttr(s) {
  return s
    .replace(/&/g,  "&amp;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&#39;");
}
