"""
src/tree_builder.py
===================
Tree construction and lin-propagation logic for the PGN family tree.

Two complementary representations are built here:

  1. anytree Node graph — used by the exporter to render PNG / DOT files.
  2. Plain dict graph   — used by the lin-propagation pipeline.

Both representations start from the same flat member list loaded by
src/csv_io.load_csv (or load_csv_with_lin).
"""

from collections import defaultdict
from anytree import Node, RenderTree

from src.constants import GREEK_TO_INDEX


# ---------------------------------------------------------------------------
# Pledge-class sorting helpers
# ---------------------------------------------------------------------------

def pledge_class_sort_key(pledge_class: str | None) -> tuple[int, int]:
    """Convert a pledge-class string to a (prefix_idx, letter_idx) sort key.

    Handles both single-letter classes ("alpha", "beta", …) and double-letter
    classes ("alpha_alpha", "alpha_beta", …).  Spaces and underscores are
    treated as equivalent separators.

    Single-letter classes sort before double-letter ones:
        alpha < beta < … < omega < alpha_alpha < alpha_beta < …

    Args:
        pledge_class: A string like "alpha", "beta", "alpha_beta", or None.

    Returns:
        (prefix_idx, letter_idx) tuple suitable for use as a sort key.
        Unknown or missing values map to (0, 0) (founders / unassigned).
    """
    if not pledge_class or pledge_class in ("0", "-"):
        return (0, 0)  # founders / unknown

    # Normalise: "Alpha Beta", "alpha_beta", "ALPHA BETA" → "alpha beta"
    normalised = pledge_class.lower().strip().replace("_", " ")
    parts      = normalised.split()

    if len(parts) == 1:
        # Single letter — alpha, beta, …
        # +1 offset so single-letters always sort before double-letters.
        return (0, GREEK_TO_INDEX.get(parts[0], 0) + 1)

    if len(parts) == 2:
        # Double letter — alpha alpha, alpha beta, …
        # prefix_idx starts at 1 so it naturally sorts after single-letters.
        prefix_idx = GREEK_TO_INDEX.get(parts[0], 0) + 1
        letter_idx = GREEK_TO_INDEX.get(parts[1], 0)
        return (prefix_idx, letter_idx)

    # Unrecognised format — fall through to founders slot.
    return (0, 0)


def get_combined_rank(pledge_class: str | None) -> str:
    """Format a pledge-class value as a zero-padded rank string.

    The returned string sorts lexicographically in the correct chronological
    order (alpha → beta → … → omega → alpha_alpha → …).

    Args:
        pledge_class: A pledge-class string (see pledge_class_sort_key).

    Returns:
        A zero-padded string like "00_01" or "01_03".
    """
    prefix, letter = pledge_class_sort_key(pledge_class)
    return f"{prefix:02d}_{letter:02d}"


# ---------------------------------------------------------------------------
# anytree-based tree (used by the exporter)
# ---------------------------------------------------------------------------

def build_tree(
    members: list[dict],
    colorize_lin: bool = False,
    rank_by: str | None = None,
) -> tuple | list:
    """Build an anytree Node hierarchy from a flat member list.

    Args:
        members:       List of member dicts (from src/csv_io.load_csv).
        colorize_lin:  If True, build and return a lin_map {name: lin}.
        rank_by:       Optional ranking dimension — one of:
                         "pledge_class"  sort by PC string
                         "class_year"    sort by graduation year
                         "combined"      Greek-alphabet pledge-class order
                       If None, no rank_map is produced.

    Returns:
        - If neither colorize_lin nor rank_by: returns list of root Nodes.
        - Otherwise: returns (roots, lin_map, rank_map) where lin_map and/or
          rank_map may be empty dicts if the respective flag is off.
    """
    nodes    = {}
    lin_map  = {}
    rank_map = {}

    # First pass — create a Node for every member and record auxiliary maps.
    for m in members:
        nodes[m["name"]] = {"big": m["big"], "node": Node(m["name"])}

        if colorize_lin and m.get("lin"):
            lin_map[m["name"]] = m["lin"]

        if rank_by == "combined":
            pc = m.get("pledge_class") or "0"
            rank_map[m["name"]] = get_combined_rank(pc)
        elif rank_by and m.get(rank_by):
            rank_map[m["name"]] = m[rank_by]

    # Second pass — create placeholder Nodes for bigs that are not members.
    for m in members:
        if m["big"] and m["big"] not in nodes:
            nodes[m["big"]] = {"big": None, "node": Node(m["big"])}
            if colorize_lin:
                lin_map[m["big"]] = "pgn"  # unknown bigs default to pgn

    # Third pass — set parent relationships now that all Nodes exist.
    for data in nodes.values():
        if data["big"] and data["big"] in nodes:
            data["node"].parent = nodes[data["big"]]["node"]

    # Collect roots: Nodes whose parent was not set (no big in the data).
    roots = [data["node"] for data in nodes.values() if data["node"].is_root]

    if colorize_lin or rank_by:
        return (roots, lin_map, rank_map)
    return roots


# ---------------------------------------------------------------------------
# Dict-based tree (used by lin-propagation pipeline)
# ---------------------------------------------------------------------------

def build_tree_dict(members: list[dict]) -> dict:
    """Build a plain-dict adjacency structure from a member list.

    Each entry maps a member name to a dict with keys:
        big      — parent name or None
        lin      — explicit lin value from the CSV, or None
        children — list of child names

    Args:
        members: List of dicts from load_csv_with_lin.

    Returns:
        Dict of {name: {big, lin, children}} for every person in the tree,
        including placeholder entries for bigs that are not in the member list.
    """
    nodes: dict = {}

    for m in members:
        nodes[m["name"]] = {
            "big":      m["big"],
            "lin":      m["lin"],
            "children": [],
        }

    # Placeholder nodes for bigs not present in the member list.
    for m in members:
        if m["big"] and m["big"] not in nodes:
            nodes[m["big"]] = {"big": None, "lin": None, "children": []}

    # Populate children lists.
    for name, data in nodes.items():
        if data["big"] and data["big"] in nodes:
            nodes[data["big"]]["children"].append(name)

    return nodes


def propagate_lin(nodes: dict, name: str, lin_value: str) -> None:
    """Recursively set lin_value on a node and all its descendants.

    This is a depth-first write: the given lin_value overwrites whatever was
    previously stored, so calling propagate_lin for a later lin-head in the
    tree will correctly override values set by an earlier ancestor.

    Args:
        nodes:     The dict produced by build_tree_dict.
        name:      The starting node name (lin head or any ancestor).
        lin_value: The lin string to assign.
    """
    nodes[name]["lin"] = lin_value
    for child in nodes[name]["children"]:
        propagate_lin(nodes, child, lin_value)


def process_lins(members: list[dict]) -> dict[str, str]:
    """Compute the final lin assignment for every member in the tree.

    Algorithm:
      1. Build the dict tree.
      2. Identify "lin heads" — members with an explicit non-empty lin in the CSV.
      3. Propagate each head's lin value down through their entire subtree,
         overwriting any value from an earlier ancestor.
      4. Anyone still without a lin after propagation is assigned "pgn".

    Args:
        members: List of dicts from load_csv_with_lin.

    Returns:
        Dict mapping name → resolved lin string for every person in the tree.
    """
    nodes = build_tree_dict(members)

    # Collect heads with explicit lin values.
    lin_heads = [(name, data["lin"]) for name, data in nodes.items() if data["lin"]]

    for head_name, lin_value in lin_heads:
        propagate_lin(nodes, head_name, lin_value)

    # Default unassigned members to "pgn" (the root/general lin).
    for data in nodes.values():
        if data["lin"] is None:
            data["lin"] = "pgn"

    return {name: data["lin"] for name, data in nodes.items()}


def get_lin_summary(lin_assignments: dict[str, str]) -> dict[str, int]:
    """Count members per lin, sorted descending by count then alphabetically.

    Args:
        lin_assignments: Dict from process_lins (name → lin).

    Returns:
        Dict of {lin: count}, sorted by (-count, lin_name).
    """
    summary: dict[str, int] = {}
    for lin in lin_assignments.values():
        summary[lin] = summary.get(lin, 0) + 1
    return dict(sorted(summary.items(), key=lambda item: (-item[1], item[0])))
