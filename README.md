# PGN Family Tree

An interactive big/little family tree for Penn Gamma Nu.  Member data lives in a Google Sheet and is fetched live on every page load — no rebuild required when the sheet changes.  The tree is deployed on GitHub Pages and rendered with D3.js.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Directory Structure](#directory-structure)
3. [Configuration Reference](#configuration-reference)
4. [Data Format](#data-format)
5. [Adding New Fields to the Info Panel](#adding-new-fields-to-the-info-panel)
6. [Deployment Guide](#deployment-guide)
   - [Google Sheets Setup](#google-sheets-setup)
   - [GitHub Pages](#github-pages)
   - [GitHub Actions (automated updates)](#github-actions-automated-updates)
7. [Local Development](#local-development)
8. [Python Pipeline (optional)](#python-pipeline-optional)
9. [Research Notes](#research-notes)

---

## Project Overview

The web app (`docs/`) is a zero-build, vanilla JS site that:

- Fetches a published Google Sheets CSV URL on every page load
- Parses the CSV in-browser and propagates lin values top-down through the family tree
- Renders the result as a zoomable/pannable D3 tree
- Shows a slide-in info panel when you click a node, with copy buttons for contact fields
- Supports search, lin filter, and color-by-lin toggle

The Python pipeline (`src/`, `main.py`, `lin_processing.py`) can optionally generate static PNG and DOT exports of the same tree.

---

## Directory Structure

```text
pgnFamilyTree/
├── data/
│   ├── alumni-year-pc.csv          # Active member data (source of truth)
│   └── archive/                    # Historical / reference files
│       ├── alumni.csv
│       ├── alumni-excel.xlsx
│       ├── alumni-excel-pc.xlsx
│       ├── example.csv
│       └── family_tree.csv
│
├── docs/                           # GitHub Pages root
│   ├── index.html                  # HTML shell (no inline JS or CSS)
│   ├── css/
│   │   └── styles.css              # All styles
│   └── js/
│       ├── config.js               # ** EDIT THIS ** — SHEET_URL, colors, fields
│       ├── csv.js                  # CSV parsing utilities
│       ├── tree.js                 # Builds flat node list for D3
│       ├── render.js               # D3 tree rendering, zoom/pan
│       ├── panel.js                # Click info panel
│       ├── controls.js             # UI control event listeners
│       └── main.js                 # Entry point — fetch, parse, render
│
├── output/
│   ├── dot/                        # Generated .dot files (Python pipeline)
│   └── png/                        # Generated .png files (Python pipeline)
│
├── src/                            # Python package
│   ├── __init__.py
│   ├── constants.py                # LIN_COLORS, GREEK_ALPHABET
│   ├── csv_io.py                   # CSV load/save helpers
│   ├── tree_builder.py             # anytree hierarchy + lin propagation
│   └── exporter.py                 # DOT/PNG export via Graphviz
│
├── main.py                         # Python CLI entry point
├── lin_processing.py               # Lin propagation helper CLI
├── .github/
│   └── workflows/
│       └── update-tree.yml         # GitHub Actions: auto-regenerate on push
└── README.md
```

---

## Configuration Reference

**`docs/js/config.js`** is the single file officers need to edit.

| Export | Purpose |
| ------ | ------- |
| `SHEET_URL` | Published CSV URL from Google Sheets. Replace the placeholder with your URL. |
| `PANEL_FIELDS` | Array of `{ key, label, copy }` objects controlling what the info panel shows. |
| `LIN_COLORS` | Maps lin name → pastel hex colour. Add a new entry when a new lin is created. |
| `VROOT` | Internal constant — do not change. |
| `NODE_W` / `NODE_H` | Width/height of each node rectangle in SVG pixels. |

---

## Data Format

The Google Sheet must have these columns (header names are case-insensitive; spaces become underscores):

| Column | Required | Description |
| ------ | -------- | ----------- |
| `name` | Yes | Full name, unique per member |
| `big` | No | Big's name exactly as it appears in the `name` column |
| `lin` | No | Lin name (e.g. `watergates`). Only needed for lin heads — propagates to descendants automatically |
| `pledge_class` | No | E.g. `Alpha Beta`. Shown as a subtitle on the node. |
| `class_year` | No | Graduation year |
| `email` | No | Shown in info panel with a copy button |

Extra columns are ignored unless you add them to `PANEL_FIELDS` in `config.js`.

**Lin propagation rule:** If a member has an explicit `lin` value, that lin is applied to them and all their descendants. If a descendant also has an explicit `lin`, that overrides the inherited value for their subtree. Members with no lin ancestor default to `pgn` (grey).

---

## Adding New Fields to the Info Panel

1. Add the column to the Google Sheet (e.g. `Phone`).
2. In `docs/js/config.js`, add one entry to `PANEL_FIELDS`:

   ```js
   { key: "phone", label: "Phone", copy: true }
   ```

3. Push. No other code changes needed.

`copy: true` renders a clipboard button next to the value.
`copy: false` shows the value as plain text with no button.

---

## Deployment Guide

### Google Sheets Setup

1. Create (or open) your sheet. The first row must be a header row with the column names above.
2. **File → Share → Publish to web**
3. Under "Link", select your data tab and choose **Comma-separated values (.csv)**.
4. Click **Publish** and copy the URL shown.
5. Paste it into `docs/js/config.js` as the value of `SHEET_URL`.
6. Also go to **File → Share → Share with others** and set access to **"Anyone with the link can view"** (required for the live fetch to work without authentication).

### GitHub Pages

1. Push the repository to GitHub.
2. Go to **Settings → Pages**.
3. Under "Source", set branch to **`main`** and folder to **`/docs`**.
4. Save. GitHub will provide a URL like `https://<org>.github.io/<repo>/`.

The tree loads live from Google Sheets on every page visit — the sheet can be updated at any time and visitors will see the latest data on their next load with no redeploy.

### GitHub Actions (automated updates)

The workflow in `.github/workflows/update-tree.yml` automatically regenerates the static PNG/DOT exports whenever code is pushed to `main`, on a daily schedule, or manually.

**To enable it:**

1. Go to **Settings → Secrets and variables → Actions**.
2. Create a new repository secret named `SHEET_CSV_URL` with the same published CSV URL as `SHEET_URL` in `config.js`.
3. The workflow will install Python, install dependencies, run `python main.py --generate="$SHEET_CSV_URL"`, and commit any updated output files.

> The web app (GitHub Pages) does **not** depend on this workflow — it fetches data live. The workflow is only needed if you want to keep the static PNG exports up to date.

---

## Local Development

The web app uses ES modules (`import`/`export`), which browsers block over `file://` URLs. Use a local HTTP server:

```bash
cd docs
python -m http.server 8000
# then open http://localhost:8000
```

Or with Node:

```bash
npx serve docs
```

For development without a live sheet, you can temporarily point `SHEET_URL` at a local CSV served by the same server, e.g.:

```js
export const SHEET_URL = "http://localhost:8000/data/alumni-year-pc.csv";
```

---

## Python Pipeline (optional)

The Python scripts generate static tree images (PNG) and graph files (DOT) from the same CSV data.

**Requirements:**

```bash
pip install anytree
brew install graphviz   # macOS; or apt-get install graphviz on Linux
```

**Usage:**

```bash
# Generate tree PNGs from a local CSV
python main.py

# Interactive prompts for colorize/rank options
python main.py --params

# Filter by lin
python main.py --lin watergates

# Fetch from Google Sheets and regenerate all outputs
python main.py --generate="YOUR_SHEET_URL"

# Preview lin assignments (no file write)
python lin_processing.py

# Write resolved lin values back to the CSV
python lin_processing.py --populate
```

Outputs are written to `output/png/` and `output/dot/`.

---

## Research Notes

> These are notes about data quality and edge cases in the historical member data. Preserved here for future officers.

### Uncertain relationships

- Not sure if Connie Kang is Andrea Chew's Big, but it seems to check out since Connie is in the PC right above Andrea
- Pretty sure Robert Naruse's Big is Cathleen Gui based off of the original lin tree, though it is kinda ambiguous with no lines off the names
- Added founders including Shachar Golan, who isn't really mentioned anywhere on the website or database, so not sure what he did

### Data deductions

- The old PGN page is actually at upenn-pgn.org, not the current pgnupenn.org link
- Some individuals in the Alpha Beta class year are unknown
- Serena Wen and Kevin Tan's class years were deduced by looking at the class year of their big and little
- Rachel Leong's grad year was deduced based on LinkedIn and the fact that she was a TA until 2020
- Iris Li's grad year was found from her grad post on LinkedIn
- Chow Ng's grad year is a guess based on his big as well as some courses he's taken; same deduction was made with Michael Zhou
