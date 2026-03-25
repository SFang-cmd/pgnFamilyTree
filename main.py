"""
main.py
=======
Command-line entry point for generating the PGN family tree locally.

All business logic lives in the src/ package.  This file handles CLI argument
parsing, interactive prompts, and the production-mode pipeline.

Usage
-----
Basic (no colours, no ranking):
    python main.py

Coloured by lin:
    python main.py --lin

Ranked by pledge class (Greek-alphabet order):
    python main.py --rank-by=combined

Ranked by graduation year:
    python main.py --rank-by=class_year

Interactive parameter prompt:
    python main.py --params

Production mode — fetch from Google Sheets, regenerate all outputs:
    python main.py --generate=<published-csv-url>

Output
------
  output/png/family_tree_*.png  — rendered PNG images
  output/dot/family_tree_*.dot  — Graphviz DOT source files
  docs/data.json                — member data snapshot for the web frontend
                                  (only written in --generate mode)
"""

import json
import os
import sys
import urllib.request

from src.csv_io      import load_csv
from src.tree_builder import build_tree
from src.exporter    import display_tree, export_image


# ---------------------------------------------------------------------------
# Interactive parameter prompt
# ---------------------------------------------------------------------------

def prompt_params() -> tuple[bool, str | None]:
    """Interactive CLI prompt to configure tree options.

    Displays a menu for colorize-by-lin and rank-by options so the user does
    not need to remember flag syntax.

    Returns:
        (colorize, rank_by) where colorize is a bool and rank_by is one of
        "pledge_class", "class_year", "combined", or None.
    """
    print("\n=== Family Tree Parameters ===")

    lin_input = input("Colorize by lin? [y/N]: ").strip().lower()
    colorize  = lin_input in ("y", "yes")

    print("Rank by:")
    print("  1) none (default)")
    print("  2) pledge_class")
    print("  3) class_year")
    print("  4) combined  (Greek-alphabet pledge-class order)")
    rank_input  = input("Choose [1-4]: ").strip()
    rank_options = {"1": None, "2": "pledge_class", "3": "class_year", "4": "combined"}
    rank_by     = rank_options.get(rank_input, None)

    if rank_input and rank_input not in rank_options:
        print(f"Invalid choice '{rank_input}', defaulting to none.")

    print()
    return colorize, rank_by


# ---------------------------------------------------------------------------
# Production / CI pipeline
# ---------------------------------------------------------------------------

def run_generate(sheet_url: str) -> None:
    """Fetch data from Google Sheets and regenerate all outputs.

    This is the pipeline used in GitHub Actions (see
    .github/workflows/update-tree.yml).  It:
      1. Downloads the published CSV from Google Sheets.
      2. Overwrites data/alumni-year-pc.csv with the fresh data.
      3. Regenerates output/png/ and output/dot/ with lin colours and combined
         pledge-class ranking.
      4. Writes docs/data.json as a snapshot for the web frontend.

    Args:
        sheet_url: The "Publish to web" CSV URL from Google Sheets.

    Exits:
        sys.exit(1) if the HTTP request fails.
    """
    print("Fetching data from Google Sheets…")
    try:
        with urllib.request.urlopen(sheet_url) as resp:
            raw = resp.read().decode("utf-8-sig")
    except Exception as exc:
        print(f"Error fetching sheet: {exc}")
        sys.exit(1)

    # Keep the local CSV in sync so other tools work offline too.
    csv_path = "data/alumni-year-pc.csv"
    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        f.write(raw)
    print(f"Updated {csv_path}")

    members = load_csv(csv_path)
    print(f"Loaded {len(members)} members")

    # Render with lin colours + combined pledge-class ranking.
    os.makedirs("output/png", exist_ok=True)
    os.makedirs("output/dot", exist_ok=True)
    roots, lin_map, rank_map = build_tree(members, colorize_lin=True, rank_by="combined")
    export_image(
        roots,
        filename="output/png/family_tree.png",
        lin_map=lin_map,
        rank_map=rank_map,
    )

    # Write a JSON snapshot for the web frontend (offline / cached mode).
    os.makedirs("docs", exist_ok=True)
    with open("docs/data.json", "w", encoding="utf-8") as f:
        json.dump(members, f, ensure_ascii=False)
    print("Wrote docs/data.json")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    csv_file = "data/alumni-year-pc.csv"

    # --generate=<url>  Production mode — pull from Sheets, rebuild everything.
    generate_url = next(
        (arg.split("=", 1)[1] for arg in sys.argv if arg.startswith("--generate=")),
        None,
    )
    if generate_url:
        run_generate(generate_url)
        sys.exit(0)

    # --params  Interactive mode — prompt for options instead of using flags.
    if "--params" in sys.argv:
        colorize, rank_by = prompt_params()
    else:
        colorize = "--lin" in sys.argv

        # --rank-by=<value>
        rank_by = None
        for arg in sys.argv:
            if arg.startswith("--rank-by="):
                rank_value = arg.split("=", 1)[1]
                valid = ["pledge_class", "class_year", "combined", "none"]
                if rank_value in valid:
                    rank_by = None if rank_value == "none" else rank_value
                else:
                    print(f"Error: Invalid --rank-by value '{rank_value}'.")
                    print(f"       Valid options: {', '.join(valid)}")
                    sys.exit(1)
                break

    # Load data — create a minimal example if the file is missing.
    try:
        members = load_csv(csv_file)
    except FileNotFoundError:
        print(f"'{csv_file}' not found — creating example file…")
        os.makedirs("data", exist_ok=True)
        with open(csv_file, "w") as f:
            f.write("name,big,lin,pledge_class,class_year\n")
            f.write("John Smith,,pgn,alpha,2020\n")
            f.write("Jane Smith,John Smith,pgn,beta,2021\n")
            f.write("Bob Smith,John Smith,pgn,beta,2021\n")
            f.write("Alice Johnson,Jane Smith,pgn,gamma,2022\n")
        members = load_csv(csv_file)

    # Build and display.
    print("Family Tree:")
    print("-" * 20)

    if colorize or rank_by:
        roots, lin_map, rank_map = build_tree(members, colorize_lin=colorize, rank_by=rank_by)
        display_tree(roots, lin_map if colorize else None, rank_map if rank_by else None)
        export_image(
            roots,
            filename="output/png/family_tree.png",
            lin_map=lin_map   if colorize else None,
            rank_map=rank_map if rank_by  else None,
        )
    else:
        roots = build_tree(members)
        display_tree(roots)
        export_image(roots, filename="output/png/family_tree.png")
