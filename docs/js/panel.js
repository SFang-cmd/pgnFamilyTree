/**
 * docs/js/panel.js
 * ================
 * Member info panel — the slide-in drawer that opens when a node is clicked.
 *
 * Renders a structured view of member data using the PANEL_FIELDS whitelist
 * from config.js.  Fields with copy:true get a boxed layout with a clipboard
 * icon button on the left that turns into a checkmark when copied.
 * Fields with link:true render the value as a clickable <a> element.
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

// SVG icons used by the copy button.
const _ICON_COPY = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="9" y="2" width="6" height="4" rx="1" ry="1"/>
  <path d="M8 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-2"/>
</svg>`;
const _ICON_CHECK = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="20 6 9 17 4 12"/>
</svg>`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Open (or update) the info panel for the given D3 hierarchy node.
 *
 * @param {d3.HierarchyNode} d - The clicked D3 node datum.
 */
export function openPanel(d) {
  const panel   = document.getElementById("info-panel");
  const content = document.getElementById("info-content");

  // Derive an accent colour from the member's lin fill colour for the h2 border.
  const accent = d3.color(LIN_COLORS[d.data._lin] || "#E8E8E8").darker(0.4).formatHex();

  let html = `<h2 style="border-left-color:${accent}">${d.data.name}</h2>`;

  for (const field of PANEL_FIELDS) {
    const val = (d.data[field.key] || "").trim();
    if (!val) continue;

    // Build the inner value — link or plain text.
    const valueHtml = field.link
      ? `<a class="info-link" href="${_escAttr(val.startsWith("http") ? val : "https://" + val)}" target="_blank" rel="noopener">${val}</a>`
      : val;

    if (field.copy) {
      // Boxed layout: entire row is clickable; only the left icon updates on copy.
      html += `<div class="info-field">
        <div class="info-label">${field.label}</div>
        <div class="info-copy-box" data-val="${_escAttr(val)}">
          <span class="copy-icon">${_ICON_COPY}</span>
          <span class="info-copy-value">${valueHtml}</span>
        </div>
      </div>`;
    } else {
      html += `<div class="info-field">
        <div class="info-label">${field.label}</div>
        <span class="info-value">${valueHtml}</span>
      </div>`;
    }
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

  // Clicking the whole box copies; only the left icon swaps to a checkmark.
  content.querySelectorAll(".info-copy-box").forEach(box => {
    box.addEventListener("click", () => {
      navigator.clipboard.writeText(box.dataset.val).then(() => {
        const icon = box.querySelector(".copy-icon");
        icon.innerHTML = _ICON_CHECK;
        box.classList.add("copied");
        setTimeout(() => {
          icon.innerHTML = _ICON_COPY;
          box.classList.remove("copied");
        }, 1800);
      });
    });
  });

  // For link fields inside a copy box, clicking the link navigates rather than copies.
  content.querySelectorAll(".info-copy-box .info-link").forEach(a => {
    a.addEventListener("click", e => e.stopPropagation());
  });

  // Wire littles — clicking a name pans the tree to that node.
  content.querySelectorAll(".info-littles li").forEach(li => {
    li.addEventListener("click", () => focusNode(li.dataset.name));
  });

  panel.classList.add("open");
}

/**
 * Close the info panel by removing the `.open` class.
 */
export function closePanel() {
  document.getElementById("info-panel").classList.remove("open");
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Escape a string for safe use in an HTML attribute value.
 * @param {string} s
 * @returns {string}
 */
function _escAttr(s) {
  return s
    .replace(/&/g,  "&amp;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&#39;");
}
