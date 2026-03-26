/**
 * docs/js/controls.js
 * ====================
 * Wires all interactive UI controls to their render/panel handlers.
 *
 * Responsibilities:
 *   - Search input   → highlight/dim matching nodes
 *   - Lin filter     → dim nodes not in the selected lin
 *   - Color toggle   → enable/disable lin colouring on nodes
 *   - Fit button     → call fitTree()
 *   - Panel close    → #info-close button, SVG background click, Escape key
 *
 * This module has no mutable state of its own — it only attaches event
 * listeners and delegates to render.js / panel.js.
 *
 * Dependencies:
 *   - render.js — fitTree(), setColorOn(), getColorOn()
 *   - panel.js  — closePanel()
 *   - D3 v7 loaded as a global <script> in index.html
 */

import { fitTree, setColorOn, getColorOn, setLayoutMode } from "./render.js";
import { closePanel } from "./panel.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attach all event listeners for the control bar and panel close gestures.
 *
 * Call this once after the tree has been rendered.  It is safe to call
 * multiple times (each call replaces the previous listener via the DOM's
 * single-listener model for directly-set handlers, but the addEventListener
 * calls may stack — call only once in practice).
 */
export function setupControls() {
  _setupSearch();
  _setupLinFilter();
  _setupLayoutMode();
  _setupColorToggle();
  _setupFitButton();
  _setupPanelClose();
}

// ---------------------------------------------------------------------------
// Private helpers — one function per control group
// ---------------------------------------------------------------------------

/**
 * Search box: highlight nodes whose name contains the query; dim the rest.
 * Clearing the query removes all highlights/dims.
 */
function _setupSearch() {
  document.getElementById("search").addEventListener("input", function () {
    const q = this.value.toLowerCase().trim();
    d3.selectAll(".node")
      .classed("highlighted", d => q !== "" && d.data.name.toLowerCase().includes(q))
      .classed("dimmed",      d => q !== "" && !d.data.name.toLowerCase().includes(q));
  });
}

/**
 * Lin filter dropdown: dim all nodes that don't belong to the selected lin.
 * Selecting "All lins" (empty value) removes all dims.
 * Also clears the search input so both filters don't conflict.
 */
function _setupLinFilter() {
  document.getElementById("lin-filter").addEventListener("change", function () {
    const v = this.value;
    d3.selectAll(".node")
      .classed("dimmed",      d => v !== "" && d.data._lin !== v)
      .classed("highlighted", false);
    document.getElementById("search").value = "";
  });
}

/**
 * Layout mode dropdown: switches between no layering and class-year rows.
 */
function _setupLayoutMode() {
  document.getElementById("layout-mode").addEventListener("change", function () {
    setLayoutMode(this.value);
  });
}

/**
 * "Color by lin" checkbox: delegates to setColorOn() in render.js,
 * which updates node fill/stroke colours and hides/shows the legend.
 */
function _setupColorToggle() {
  document.getElementById("color-toggle").addEventListener("change", function () {
    setColorOn(this.checked);
  });
}

/**
 * "Fit to screen" button: calls fitTree() from render.js to animate the
 * viewport back to a full-tree view.
 */
function _setupFitButton() {
  document.getElementById("fit-btn").addEventListener("click", fitTree);
}

/**
 * Panel close gestures:
 *   - Clicking the × button inside the panel
 *   - Clicking the SVG background (node clicks call stopPropagation, so only
 *     background clicks bubble up to this listener)
 *   - Pressing the Escape key anywhere on the page
 */
function _setupPanelClose() {
  document.getElementById("info-close").addEventListener("click", closePanel);
  document.getElementById("tree-svg").addEventListener("click", closePanel);
  document.addEventListener("keydown", ev => {
    if (ev.key === "Escape") closePanel();
  });
}
