"""
src/exporter.py
===============
ASCII display and PNG/DOT export functions for the family tree.

Requires Graphviz to be installed on the system PATH for PNG export:
    macOS:  brew install graphviz
    Ubuntu: sudo apt install graphviz
    Windows: https://graphviz.org/download/
"""

import os
import subprocess
from collections import defaultdict

from anytree import RenderTree
from anytree.exporter import DotExporter

from src.constants import LIN_COLORS


def display_tree(
    roots,
    lin_map:  dict | None = None,
    rank_map: dict | None = None,
) -> None:
    """Print an ASCII tree to stdout.

    If a tuple is passed as roots (as returned by build_tree when colorize_lin
    or rank_by is set), it is unpacked automatically.

    Args:
        roots:    List of root Nodes, or the (roots, lin_map, rank_map) tuple
                  returned by build_tree.
        lin_map:  Optional {name: lin} dict — appends [lin] to each line.
        rank_map: Optional {name: rank} dict — appends (rank) to each line.
    """
    # Unpack tuple form returned by build_tree when flags are enabled.
    if isinstance(roots, tuple):
        if len(roots) == 3:
            roots, lin_map, rank_map = roots
        elif len(roots) == 2:
            roots, lin_map = roots

    for root in roots:
        for pre, _, node in RenderTree(root):
            suffix = ""
            if lin_map  and node.name in lin_map:
                suffix += f" [{lin_map[node.name]}]"
            if rank_map and node.name in rank_map:
                suffix += f" ({rank_map[node.name]})"
            print(f"{pre}{node.name}{suffix}")


def export_image(
    roots,
    filename:  str          = "output/png/family_tree.png",
    lin_map:   dict | None  = None,
    rank_map:  dict | None  = None,
) -> None:
    """Export each root tree as a PNG (and DOT source) file.

    When multiple roots are present the filename is suffixed with an index:
      family_tree.png → family_tree_0.png, family_tree_1.png, …

    DOT files are always written alongside PNGs to output/dot/ so the raw
    Graphviz source is available for inspection or further processing.

    Args:
        roots:    List of root Nodes (or the (roots, …) tuple from build_tree).
        filename: Base output path for PNG files.
        lin_map:  If provided, nodes are filled with lin colours and a legend
                  subgraph is inserted into the DOT file.
        rank_map: If provided, nodes sharing the same rank value are placed on
                  the same horizontal level (rank=same constraint).
    """
    # Unpack tuple form.
    if isinstance(roots, tuple):
        roots = roots[0]

    def _node_attr(node) -> str:
        """Return Graphviz node attribute string for a given node."""
        if lin_map and node.name in lin_map:
            color = LIN_COLORS.get(lin_map[node.name], "#FFFFFF")
            return f'style=filled fillcolor="{color}" fontcolor="black"'
        return ""

    def _edge_attr(_node, _child) -> str:
        return ""

    def _rank_constraints(rank_map: dict) -> list[str]:
        """Build rank=same constraint lines from a rank_map."""
        groups: dict = defaultdict(list)
        for name, rank_val in rank_map.items():
            groups[rank_val].append(name)

        constraints = []
        for names in groups.values():
            if len(names) > 1:
                quoted = [f'"{n}"' for n in names]
                constraints.append(f'  {{ rank=same; {"; ".join(quoted)} }}')
        return constraints

    for i, root in enumerate(roots):
        # Determine output file paths.
        png_out  = filename if len(roots) == 1 else f"{filename[:-4]}_{i}.png"
        dot_out  = os.path.join(
            "output", "dot",
            os.path.basename(png_out).replace(".png", ".dot"),
        )

        exporter = DotExporter(root, nodeattrfunc=_node_attr, edgeattrfunc=_edge_attr)
        lines    = list(exporter)  # list of DOT source lines

        # Collect modifications to insert before the closing brace.
        insertions: list[str] = []

        if rank_map:
            insertions += _rank_constraints(rank_map)

        if lin_map:
            # Gather lins actually used in this subtree.
            tree_lins = {lin_map[n.name] for n in root.descendants if n.name in lin_map}
            if root.name in lin_map:
                tree_lins.add(lin_map[root.name])

            # Build legend node declarations.
            legend_node_ids = []
            legend_decls    = []
            for lin in sorted(tree_lins):
                safe_id = f'legend_{lin.replace(" ", "_").replace("(", "").replace(")", "")}'
                color   = LIN_COLORS.get(lin, "#FFFFFF")
                legend_decls.append(
                    f'    {safe_id} [label="{lin}" style=filled fillcolor="{color}" shape=box]'
                )
                legend_node_ids.append(safe_id)

            legend_subgraph = [
                "  subgraph cluster_legend {",
                '    label="Lin Legend"',
                "    style=filled",
                '    fillcolor="#F5F5F5"',
                "    rank=sink",
                *legend_decls,
            ]
            if len(legend_node_ids) > 1:
                legend_subgraph.append(
                    f'    {{ rank=same; {"; ".join(legend_node_ids)} }}'
                )
            legend_subgraph.append("  }")

            # Invisible anchor edge to push the legend toward the bottom.
            anchor = "Ava Infante"
            if legend_node_ids:
                legend_subgraph.append(
                    f'  "{anchor}" -> {legend_node_ids[0]} [style=invis constraint=true]'
                )

            insertions += legend_subgraph

        # Splice insertions before the final closing brace of the DOT file.
        lines = lines[:-1] + insertions + [lines[-1]]

        # Write DOT source.
        os.makedirs(os.path.dirname(dot_out), exist_ok=True)
        with open(dot_out, "w") as f:
            f.write("\n".join(lines))

        # Render PNG via Graphviz.
        os.makedirs(os.path.dirname(png_out), exist_ok=True)
        subprocess.run(["dot", "-Tpng", dot_out, "-o", png_out], check=True)

        label = "(with lin colors)" if lin_map else "(with rank constraints)" if rank_map else ""
        print(f"Saved: {png_out} {label}".strip())
