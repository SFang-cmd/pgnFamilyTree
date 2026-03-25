/**
 * docs/js/tree.js
 * ===============
 * Converts a flat member array into a node list suitable for d3.stratify().
 *
 * Mirrors the Python logic in src/tree_builder.py:
 *   - Placeholder nodes are created for any "big" not present in the data.
 *   - Lin values propagate top-down: a member's explicit lin overrides the
 *     inherited value from their big, so sub-lins work correctly.
 *   - All actual roots are attached to a hidden virtual root so the entire
 *     tree can be rendered as a single d3 hierarchy.
 */

import { VROOT } from "./config.js";

/**
 * Build the flat node array consumed by d3.stratify().
 *
 * Each object in the returned array has at minimum:
 *   name    — unique identifier (used as d3 node id)
 *   _parent — parent's name, or null for the virtual root
 *   _lin    — resolved lin string after propagation
 *
 * @param {Array<Object>} members - Member objects from parseCSV().
 * @returns {Array<Object>} Flat node list ready for d3.stratify().
 */
export function buildNodes(members) {
  // Index members by name.  If duplicates exist, last write wins.
  const byName = {};
  members.forEach(m => { byName[m.name] = { ...m }; });

  // Create placeholder nodes for bigs not present in the member list.
  // This preserves the tree structure even when historical data is incomplete.
  members.forEach(m => {
    if (m.big && !byName[m.big]) {
      byName[m.big] = { name: m.big, big: "", lin: "", pledge_class: "", class_year: "" };
    }
  });

  // Build a children map for top-down lin propagation.
  const children = {};
  Object.keys(byName).forEach(n => { children[n] = []; });
  Object.values(byName).forEach(m => {
    if (m.big && children[m.big]) {
      children[m.big].push(m.name);
    }
  });

  /**
   * Recursively resolve lin for a node and all its descendants.
   *
   * Algorithm (same as src/tree_builder.process_lins):
   *   - If the node has an explicit non-empty lin in the CSV, use it.
   *   - Otherwise inherit the parent's resolved lin.
   *   - Fall back to "pgn" if no ancestor has a lin.
   *
   * @param {string} name      - Current node name.
   * @param {string} inherited - Lin value propagated from parent.
   */
  function resolveLin(name, inherited) {
    const node = byName[name];
    const own  = node.lin ? node.lin.trim() : "";
    node._lin  = own || inherited || "pgn";
    (children[name] || []).forEach(child => resolveLin(child, node._lin));
  }

  // Start propagation from each actual root (members without a big).
  Object.values(byName)
    .filter(m => !m.big)
    .forEach(m => resolveLin(m.name, m.lin || "pgn"));

  // Safety fallback for any nodes not reached (e.g. isolated cycles).
  Object.values(byName).forEach(m => { if (!m._lin) m._lin = "pgn"; });

  // Return the flat list with the virtual root prepended.
  // _parent is null for VROOT and resolves to either the member's big or
  // VROOT for anyone with no big in the data.
  return [
    { name: VROOT, _parent: null, _lin: "pgn", big: "", pledge_class: "", class_year: "" },
    ...Object.values(byName).map(m => ({
      ...m,
      _parent: m.big || VROOT,
    })),
  ];
}
