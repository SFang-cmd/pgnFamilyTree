"""
lin_processing.py
=================
Command-line tool for populating the "lin" column in the member CSV.

A "lin" (lineage) is a named branch of the family tree.  Lin heads (founding
members of a lin) are manually marked in the CSV; this tool propagates their
lin value down through all descendants so every member is tagged.

All logic lives in src/; this file is the CLI entry point only.

Usage
-----
Preview assignments without modifying the file:
    python lin_processing.py

Write lin values back to the CSV:
    python lin_processing.py --populate
"""

import sys

from src.csv_io      import load_csv_with_lin, populate_csv_lins
from src.tree_builder import process_lins, get_lin_summary


CSV_FILE = "data/alumni-year-pc.csv"


if __name__ == "__main__":
    if "--populate" in sys.argv:
        # ----------------------------------------------------------------
        # Write mode: compute lins and patch the CSV in-place.
        # ----------------------------------------------------------------
        print(f"Populating lin column in {CSV_FILE}…")
        lin_assignments = populate_csv_lins(CSV_FILE)
        print(f"Done — updated {len(lin_assignments)} entries.\n")

        print("Summary:")
        for lin, count in get_lin_summary(lin_assignments).items():
            print(f"  {lin}: {count}")

    else:
        # ----------------------------------------------------------------
        # Preview mode: show assignments grouped by lin, no file changes.
        # ----------------------------------------------------------------
        members         = load_csv_with_lin(CSV_FILE)
        lin_assignments = process_lins(members)

        print("Lin Assignments  (preview only — use --populate to write to CSV)")
        print("-" * 60)

        # Group members by their resolved lin.
        by_lin: dict = {}
        for name, lin in lin_assignments.items():
            by_lin.setdefault(lin, []).append(name)

        for lin in sorted(by_lin.keys()):
            print(f"\n{lin.upper()}  ({len(by_lin[lin])} members):")
            for name in sorted(by_lin[lin]):
                print(f"  {name}")

        print("\n" + "-" * 60)
        print("Summary:")
        for lin, count in get_lin_summary(lin_assignments).items():
            print(f"  {lin}: {count}")
