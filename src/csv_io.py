"""
src/csv_io.py
=============
CSV reading and writing utilities for the PGN family tree data.

All functions accept a file path string and work with the standard member
CSV format:

    name, big, lin, pledge_class, class_year

Additional columns (e.g. email, phone) are preserved as-is when present.
"""

import csv


def load_csv(filename: str) -> list[dict]:
    """Load members from a CSV file into a list of normalised dicts.

    Handles UTF-8 BOM (common in Excel exports) via the utf-8-sig encoding.
    Column header whitespace and spaces are normalised to underscores so
    "Pledge Class" and "pledge_class" are treated identically.

    Args:
        filename: Path to the CSV file (e.g. "data/alumni-year-pc.csv").

    Returns:
        List of member dicts.  Keys are lower-cased, space-normalised column
        headers.  Empty string values are coerced to None for big/lin/
        pledge_class/class_year so callers can use truthiness checks.

    Raises:
        FileNotFoundError: If the file does not exist at the given path.
    """
    members = []
    with open(filename, "r", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            # Normalise header keys: strip surrounding whitespace, replace
            # internal spaces with underscores, lower-case everything.
            row = {k.strip().replace(" ", "_").lower(): v for k, v in row.items()}

            big          = row.get("big", "").strip()
            lin          = row.get("lin", "").strip()
            pledge_class = row.get("pledge_class", "").strip()
            class_year   = row.get("class_year", "").strip()

            members.append({
                "name":         row["name"].strip(),
                "big":          big          or None,
                "lin":          lin          or None,
                "pledge_class": pledge_class or None,
                "class_year":   class_year   or None,
            })
    return members


def load_csv_with_lin(filename: str) -> list[dict]:
    """Load members including the lin column.

    Lighter-weight loader used by the lin-propagation pipeline.  Only reads
    name, big, and lin — other columns are ignored.

    Args:
        filename: Path to the CSV file.

    Returns:
        List of dicts with keys: name, big, lin.
    """
    members = []
    with open(filename, "r", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            row = {k.strip(): v for k, v in row.items()}
            big = row.get("big", "").strip()
            lin = row.get("lin", "").strip()
            members.append({
                "name": row["name"].strip(),
                "big":  big or None,
                "lin":  lin or None,
            })
    return members


def populate_csv_lins(filename: str) -> dict[str, str]:
    """Propagate lin values through the tree and write them back to the CSV.

    Reads the CSV, computes each member's lin by propagating from lin-head
    ancestors (see src/tree_builder.process_lins), then overwrites the file
    with the lin column fully populated.  All other columns and row ordering
    are preserved.

    If the CSV does not have a "lin" column, one is appended.

    Args:
        filename: Path to the CSV file to update in-place.

    Returns:
        Dict mapping member name → resolved lin value.
    """
    # Import here to avoid a circular import at module load time.
    from src.tree_builder import process_lins

    # Read all rows to preserve column order and any extra columns.
    rows = []
    with open(filename, "r", encoding="utf-8-sig") as f:
        reader    = csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])
        for row in reader:
            rows.append(row)

    # Add "lin" column if not already present.
    if "lin" not in fieldnames:
        fieldnames.append("lin")

    # Compute lin assignments for every member in the tree.
    members         = load_csv_with_lin(filename)
    lin_assignments = process_lins(members)

    # Patch the "lin" field in each row.
    for row in rows:
        name = row.get("name", "").strip()
        if name in lin_assignments:
            row["lin"] = lin_assignments[name]

    # Write back, preserving original column order.
    with open(filename, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    return lin_assignments
