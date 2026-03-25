/**
 * docs/js/render.js
 * =================
 * D3.js tree rendering, zoom/pan, and viewport helpers.
 *
 * This module owns all mutable rendering state (svg, zoom, currentRoot, etc.)
 * and exposes a clean API so other modules never touch D3 internals directly.
 *
 * Dependencies:
 *   - D3 v7 loaded as a global <script> in index.html
 *   - config.js  — LIN_COLORS, VROOT, NODE_W, NODE_H
 *   - tree.js    — buildNodes()
 */

import { LIN_COLORS, VROOT, NODE_W, NODE_H } from "./config.js";
import { buildNodes } from "./tree.js";

// ---------------------------------------------------------------------------
// Module-level rendering state
// Kept private; external modules use the exported helper functions.
// ---------------------------------------------------------------------------

/** @type {d3.Selection}   The root SVG d3 selection. */
let svg = null;

/** @type {d3.Selection}   The <g> group that holds all tree elements. */
let g = null;

/** @type {d3.ZoomBehavior} The active zoom behaviour attached to the SVG. */
let zoom = null;

/** @type {d3.HierarchyNode} The stratified root node of the current tree. */
let currentRoot = null;

/** @type {boolean} Whether lin colours are currently applied to nodes. */
let colorOn = true;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render the family tree into #tree-svg.
 *
 * Clears any existing tree, builds the D3 hierarchy, lays out nodes, draws
 * links and node rectangles, wires tooltip and click handlers, populates the
 * lin filter dropdown and legend, then fits the tree to the viewport.
 *
 * @param {Array<Object>} members     - Member objects from parseCSV().
 * @param {Object}        [callbacks] - Optional callback functions.
 * @param {Function}      [callbacks.onNodeClick] - Called with the D3 datum
 *   when a node is clicked.  Used to open the info panel.
 * @throws {Error} If d3.stratify() fails (duplicate names or cycle in data).
 */
export function render(members, { onNodeClick } = {}) {
  const nodes = buildNodes(members);

  // Populate the lin filter dropdown with all unique lin values.
  const lins = [...new Set(nodes.map(n => n._lin))].filter(Boolean).sort();
  const sel  = document.getElementById("lin-filter");
  lins.forEach(l => {
    const o = document.createElement("option");
    o.value = l; o.textContent = l;
    sel.appendChild(o);
  });

  // Build the D3 hierarchy.  Throws if names are not unique or a cycle exists.
  currentRoot = d3.stratify()
    .id(d => d.name)
    .parentId(d => d._parent)(nodes);

  // Apply tree layout — nodeSize gives uniform spacing regardless of tree width.
  d3.tree().nodeSize([NODE_W + 6, NODE_H + 52])(currentRoot);

  // Override each node's y-coordinate so members of the same graduation year
  // land on the same horizontal row.  Nodes without a class_year (placeholder
  // members whose data is incomplete) keep the depth-based y from d3.tree().
  const ROW_H = 90; // vertical pixels between consecutive class years
  const years = [...new Set(
    currentRoot.descendants()
      .map(d => d.data.class_year)
      .filter(y => y && y !== "-")
      .map(y => parseInt(y, 10))
      .filter(y => !isNaN(y))
  )].sort((a, b) => a - b);

  const yearToY = new Map(years.map((y, i) => [String(y), i * ROW_H]));

  currentRoot.descendants().forEach(d => {
    const mapped = yearToY.get(d.data.class_year);
    if (mapped !== undefined) d.y = mapped;
  });

  // Second pass (top-down): when a little's y is at or above their big's y
  // (same class year, or a cascading chain of same-year bigs), drop them 50px
  // below the big.  Using <= instead of === means the correction cascades:
  // if A→B→C are all the same year, B is shifted first, then C is checked
  // against the already-shifted B and shifted again.
  currentRoot.eachBefore(d => {
    if (d.parent && d.y <= d.parent.y) {
      d.y = d.parent.y + 50;
    }
  });

  // Third pass: the y-override can bring nodes from different tree depths onto
  // the same row.  D3 only guarantees horizontal spacing between nodes at the
  // same depth, so cross-branch overlaps can appear after we change y values.
  // Group nodes by y level and do a left-to-right sweep, pushing any node that
  // would overlap its left neighbour to the right.
  const byLevel = new Map();
  currentRoot.descendants().filter(d => d.id !== VROOT).forEach(d => {
    const k = Math.round(d.y);
    if (!byLevel.has(k)) byLevel.set(k, []);
    byLevel.get(k).push(d);
  });
  const minSlot = NODE_W + 6;
  byLevel.forEach(nodes => {
    if (nodes.length < 2) return;
    nodes.sort((a, b) => a.x - b.x);
    for (let i = 1; i < nodes.length; i++) {
      const minX = nodes[i - 1].x + minSlot;
      if (nodes[i].x < minX) nodes[i].x = minX;
    }
  });

  // Initialise SVG and zoom behaviour.
  svg = d3.select("#tree-svg");
  svg.selectAll("*").remove();

  zoom = d3.zoom()
    .scaleExtent([0.05, 3])
    .on("zoom", e => g.attr("transform", e.transform));
  svg.call(zoom);

  g = svg.append("g");

  // Draw curved links (skip edges originating from the hidden virtual root).
  g.selectAll(".link")
    .data(currentRoot.links().filter(l => l.source.id !== VROOT))
    .join("path")
    .attr("class", "link")
    .attr("d", d3.linkVertical().x(d => d.x).y(d => d.y));

  // Draw node groups (skip the virtual root node itself).
  const nd = g.selectAll(".node")
    .data(currentRoot.descendants().filter(d => d.id !== VROOT))
    .join("g")
    .attr("class", "node")
    .attr("transform", d => `translate(${d.x},${d.y})`);

  // Node background rectangle — filled with lin colour when colorOn is true.
  nd.append("rect")
    .attr("x", -NODE_W / 2).attr("y", -NODE_H / 2)
    .attr("width", NODE_W).attr("height", NODE_H)
    .attr("rx", 7).attr("ry", 7)
    .attr("fill",         d => colorOn ? fillColor(d) : "#E8E8E8")
    .attr("stroke",       d => borderColor(d))
    .attr("stroke-width", 1.5);

  // Member name — shifted up slightly when a pledge class subtitle is present.
  nd.append("text")
    .attr("text-anchor", "middle")
    .attr("dy",          d => d.data.pledge_class ? "-5" : "4")
    .attr("font-size",   14)
    .attr("font-weight", 600)
    .text(d => clip(d.data.name, 14));

  // Pledge class subtitle in smaller text below the name.
  nd.append("text")
    .attr("text-anchor", "middle")
    .attr("dy",         "11")
    .attr("font-size",  11)
    .attr("fill",       "#666")
    .text(d => d.data.pledge_class || "");

  // Hover tooltip — lightweight quick label.  Full info is shown on click.
  const tip = document.getElementById("tooltip");

  nd.on("mouseover", (ev, d) => {
    tip.innerHTML = `<strong>${d.data.name}</strong>` +
      (d.data.pledge_class
        ? `<br><span style="opacity:0.7">${d.data.pledge_class}</span>`
        : "");
    tip.style.display = "block";
    _moveTip(ev, tip);
  })
  .on("mousemove",  ev  => _moveTip(ev, tip))
  .on("mouseleave", ()  => { tip.style.display = "none"; })
  .on("click",      (ev, d) => {
    ev.stopPropagation(); // prevent the SVG background click from firing
    tip.style.display = "none";
    if (onNodeClick) onNodeClick(d);
  });

  // Populate the lin legend (pgn is the default / grey — excluded).
  const legendItems = document.getElementById("legend-items");
  legendItems.innerHTML = "";
  lins.filter(l => l !== "pgn").forEach(l => {
    legendItems.innerHTML +=
      `<div class="legend-item">
        <div class="legend-dot" style="background:${LIN_COLORS[l] || "#eee"}"></div>
        <span>${l}</span>
      </div>`;
  });
  document.getElementById("legend").style.display = colorOn ? "block" : "none";

  document.getElementById("member-count").textContent = `${members.length} members`;

  fitTree();
}

/**
 * Animate the viewport so the entire tree fits within the container.
 *
 * Scales to fit the tree within the container, clamped between 0.25× and 1×.
 * At 0.25× the tree structure is visible; users can zoom out further manually.
 */
export function fitTree() {
  if (!currentRoot) return;
  const container = document.getElementById("tree-container");
  const W = container.clientWidth, H = container.clientHeight;

  const desc = currentRoot.descendants().filter(d => d.id !== VROOT);
  const xs   = desc.map(d => d.x), ys = desc.map(d => d.y);
  const x0   = Math.min(...xs) - NODE_W / 2, x1 = Math.max(...xs) + NODE_W / 2;
  const y0   = Math.min(...ys) - NODE_H / 2, y1 = Math.max(...ys) + NODE_H / 2;

  // Fit to screen but never shrink below 0.25 — at that scale 14px font is
  // still ~3.5px, which is enough to see the tree structure.  Users can zoom
  // out further manually if they need the full picture.
  const fitScale = Math.min(W / (x1 - x0), H / (y1 - y0)) * 0.88;
  const scale    = Math.max(0.25, Math.min(1, fitScale));
  const tx       = W / 2 - ((x0 + x1) / 2) * scale;
  const ty       = 24 - y0 * scale;

  svg.transition().duration(350)
    .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
}

/**
 * Smoothly pan and zoom to centre a specific member's node in the viewport.
 *
 * Called by panel.js when a "little" name is clicked in the info panel.
 *
 * @param {string} name - The member's name as it appears in the data.
 */
export function focusNode(name) {
  if (!currentRoot || !svg || !zoom) return;
  const target = currentRoot.descendants().find(d => d.data.name === name);
  if (!target) return;

  const container = document.getElementById("tree-container");
  const W = container.clientWidth, H = container.clientHeight;
  const scale = 1.4;

  svg.transition().duration(500).call(
    zoom.transform,
    d3.zoomIdentity
      .translate(W / 2 - target.x * scale, H / 2 - target.y * scale)
      .scale(scale),
  );
}

/**
 * Return the lin fill colour for a D3 node datum.
 *
 * @param {d3.HierarchyNode} d
 * @returns {string} Hex colour string.
 */
export function fillColor(d) {
  return LIN_COLORS[d.data._lin] || "#E8E8E8";
}

/**
 * Return a slightly darker border colour derived from the fill colour.
 *
 * @param {d3.HierarchyNode} d
 * @returns {string} Hex colour string.
 */
export function borderColor(d) {
  const c = d3.color(fillColor(d));
  return c ? c.darker(0.4).formatHex() : "#aaa";
}

/**
 * Enable or disable lin colouring on all nodes.
 * Called by controls.js when the "Color by lin" checkbox changes.
 *
 * @param {boolean} val
 */
export function setColorOn(val) {
  colorOn = val;
  d3.selectAll(".node rect")
    .attr("fill",   d => colorOn ? fillColor(d)   : "#E8E8E8")
    .attr("stroke", d => colorOn ? borderColor(d) : "#bbb");
  document.getElementById("legend").style.display = colorOn ? "block" : "none";
}

/**
 * Return the current colorOn state.
 * @returns {boolean}
 */
export function getColorOn() { return colorOn; }

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Position the tooltip near the cursor, clamping to stay within the viewport.
 *
 * @param {MouseEvent} ev  - The mouse event.
 * @param {HTMLElement} tip - The tooltip DOM element.
 */
function _moveTip(ev, tip) {
  tip.style.left = (ev.clientX + 14) + "px";
  tip.style.top  = Math.min(
    ev.clientY - 6,
    window.innerHeight - tip.offsetHeight - 8,
  ) + "px";
}

/**
 * Clip a string to at most n characters, appending "…" if truncated.
 *
 * @param {string} s
 * @param {number} n
 * @returns {string}
 */
export function clip(s, n) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
