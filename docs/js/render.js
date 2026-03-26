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

/** @type {string} Current layout mode: "none" | "class_year" | "pledge_class" */
let layoutMode = "none";

/** @type {Map<string,Array<{x:number,y:number}>>|null} Waypoints keyed "srcId::tgtId". */
let _edgeWaypoints = null;


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

  // Compute x,y positions via Dagre (Graphviz's Sugiyama algorithm in JS).
  // d3.stratify() above builds the hierarchy for rendering; Dagre computes
  // the actual coordinates.
  _computeLayout(currentRoot);

  // Initialise SVG and zoom behaviour.
  svg = d3.select("#tree-svg");
  svg.selectAll("*").remove();

  zoom = d3.zoom()
    .scaleExtent([0.05, 3])
    .on("zoom", e => g.attr("transform", e.transform));
  svg.call(zoom);

  g = svg.append("g");

  // Draw curved links (skip edges from the hidden virtual root).
  g.selectAll(".link")
    .data(currentRoot.links().filter(l => l.source.id !== VROOT))
    .join("path")
    .attr("class", "link")
    .attr("d", l => _linkPath(l));


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

/**
 * Compute node positions: Dagre for x, class year for y.
 * @param {d3.HierarchyNode} root
 */
/**
 * Switch the layout mode and re-render positions in place.
 * @param {string} mode - "none" | "class_year" | "pledge_class"
 */
export function setLayoutMode(mode) {
  layoutMode = mode;
  if (!currentRoot) return;
  _computeLayout(currentRoot);
  g.selectAll(".node").transition().duration(350)
    .attr("transform", d => `translate(${d.x},${d.y})`);
  g.selectAll(".link").transition().duration(350)
    .attr("d", l => _linkPath(l));
  fitTree();
}

/**
 * Compute node positions via Dagre.
 * - "none": pure Dagre, no y-override.
 * - "class_year": Dagre with dummy nodes for multi-rank edges; y overridden by
 *   class year; dummy positions stored for debug rendering and edge routing.
 * @param {d3.HierarchyNode} root
 */
function _computeLayout(root) {
  _edgeWaypoints = null;

  const dg = new dagre.graphlib.Graph();
  dg.setGraph({ rankdir: "TB", nodesep: 20, ranksep: 80, marginx: 0, marginy: 0 });
  dg.setDefaultEdgeLabel(() => ({}));
  root.descendants().filter(d => d.id !== VROOT)
    .forEach(d => dg.setNode(d.id, { width: NODE_W, height: NODE_H }));

  if (layoutMode === "class_year") {
    // ── Doubled-rank strategy ──────────────────────────────────────────────
    // Class years get EVEN ranks (2, 4, 6 …), leaving odd slots for
    // same-year big/little pairs.  All y values are therefore exact multiples
    // of RANK_H — no fractional offsets that confuse Dagre's x layout.
    //
    // VROOT is included in the Dagre graph at rank 0, connected to every
    // lin-head via a minlen edge.  This anchors all disconnected lin
    // components to the same global rank scale so Dagre's crossing-
    // minimisation works across the whole tree.
    const RANK_H = 60;   // pixels per rank (two ranks = one class-year gap)
    const years = [...new Set(
      root.descendants()
        .map(d => d.data.class_year)
        .filter(y => y && y !== "-")
        .map(y => parseInt(y, 10))
        .filter(y => !isNaN(y))
    )].sort((a, b) => a - b);

    // Even ranks start at 2 so VROOT can sit at 0.
    const yearToBaseRank = new Map(years.map((y, i) => [String(y), (i + 1) * 2]));

    // Pre-assign visual ranks top-down.
    // Same-year big/little: child gets parent_rank + 1 (odd rank, half gap).
    const vr = new Map([[VROOT, 0]]);
    root.eachBefore(d => {
      if (d.id === VROOT) return;
      const base = yearToBaseRank.get(d.data.class_year) ?? ((d.depth + 1) * 2);
      const pr   = vr.get(d.parent?.id) ?? 0;
      vr.set(d.id, Math.max(base, pr + 1));
    });

    // Include VROOT so all lin families share one connected Dagre graph.
    dg.setNode(VROOT, { width: 0, height: 0 });

    const dummyChains = new Map();
    root.links().forEach(l => {
      const srcRank = vr.get(l.source.id) ?? 0;
      const tgtRank = vr.get(l.target.id) ?? 0;
      const gap     = Math.max(1, tgtRank - srcRank);

      if (l.source.id === VROOT) {
        // VROOT → lin-head: minlen enforces global rank without dummy nodes.
        dg.setEdge(VROOT, l.target.id, { minlen: gap });
      } else if (gap > 1) {
        // Multi-rank hop: insert visible dummy nodes for debug + routing.
        const dummies = Array.from({ length: gap - 1 }, (_, i) => {
          const id = `__d_${l.source.id}_${l.target.id}_${i}`;
          dg.setNode(id, { width: 8, height: 8 });
          return id;
        });
        [l.source.id, ...dummies, l.target.id].forEach((_, i, arr) => {
          if (i < arr.length - 1) dg.setEdge(arr[i], arr[i + 1]);
        });
        dummyChains.set(`${l.source.id}::${l.target.id}`, dummies);
      } else {
        dg.setEdge(l.source.id, l.target.id);
      }
    });

    dagre.layout(dg);

    // x from Dagre; y from pre-assigned visual rank (all integer multiples of RANK_H).
    root.descendants().filter(d => d.id !== VROOT).forEach(d => {
      const pos = dg.node(d.id);
      if (pos) d.x = pos.x;
      d.y = (vr.get(d.id) ?? (d.depth * 2)) * RANK_H;
    });

    // Dummy positions: x from Dagre, y interpolated between source/target final y.
    const byId = new Map(root.descendants().map(d => [d.id, d]));
    _edgeWaypoints = new Map();
    dummyChains.forEach((dummies, key) => {
      const [srcId, tgtId] = key.split("::");
      const src = byId.get(srcId), tgt = byId.get(tgtId);
      if (!src || !tgt) return;
      const pts = dummies.map((id, i) => {
        const pos = dg.node(id);
        if (!pos) return null;
        const t = (i + 1) / (dummies.length + 1);
        return { x: pos.x, y: src.y + (tgt.y - src.y) * t };
      }).filter(Boolean);
      if (pts.length) _edgeWaypoints.set(key, pts);
    });

  } else {
    root.links()
      .filter(l => l.source.id !== VROOT && l.target.id !== VROOT)
      .forEach(l => dg.setEdge(l.source.id, l.target.id));
    dagre.layout(dg);
    root.descendants().filter(d => d.id !== VROOT).forEach(d => {
      const pos = dg.node(d.id);
      if (pos) { d.x = pos.x; d.y = pos.y; }
    });
  }
}

/**
 * Return the SVG path `d` for a link, routing through waypoints when available.
 * @param {d3.HierarchyLink} l
 * @returns {string}
 */
function _linkPath(l) {
  const wps = _edgeWaypoints?.get(`${l.source.id}::${l.target.id}`) ?? [];
  if (!wps.length) {
    return d3.linkVertical().x(d => d.x).y(d => d.y)({ source: l.source, target: l.target });
  }
  const pts = [{ x: l.source.x, y: l.source.y }, ...wps, { x: l.target.x, y: l.target.y }];
  return d3.line().x(p => p.x).y(p => p.y).curve(d3.curveMonotoneY)(pts);
}

