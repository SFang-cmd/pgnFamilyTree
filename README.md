# PGN Family Tree

An interactive big/little family tree for Penn Gamma Nu. Member data lives in a Google Sheet and is fetched live on every page load — no rebuild required when the sheet changes. The tree is deployed on GitHub Pages and rendered with D3.js + Dagre.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Directory Structure](#directory-structure)
3. [Configuration Reference](#configuration-reference)
4. [Data Format](#data-format)
5. [Adding New Fields to the Info Panel](#adding-new-fields-to-the-info-panel)
6. [JavaScript Architecture](#javascript-architecture)
   - [Module Map](#module-map)
   - [Data Flow](#data-flow)
   - [Layout System](#layout-system)
   - [Adding a New Layout Mode](#adding-a-new-layout-mode)
7. [Deployment Guide](#deployment-guide)
   - [Google Sheets Setup](#google-sheets-setup)
   - [GitHub Pages](#github-pages)
   - [GitHub Actions (automated updates)](#github-actions-automated-updates)
8. [Local Development](#local-development)
9. [Python Pipeline (optional)](#python-pipeline-optional)
10. [Research Notes](#research-notes)

---

## Project Overview

The web app (`docs/`) is a zero-build, vanilla JS site that:

- Fetches a published Google Sheets CSV URL on every page load
- Parses the CSV in-browser and propagates lin values top-down through the family tree
- Renders the result as a zoomable/pannable D3 tree using Dagre for layout
- Shows a slide-in info panel when you click a node, with copy buttons for contact fields
- Supports search, lin filter, color-by-lin toggle, and layout mode switching

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
│       ├── render.js               # D3 tree rendering, zoom/pan, layout engine
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
| `VROOT` | Internal constant used as the hidden virtual root id — do not change. |
| `NODE_W` / `NODE_H` | Width/height of each node rectangle in SVG pixels. |

---

## Data Format

The Google Sheet must have these columns. Header names are **case-insensitive**; spaces are converted to underscores and hyphens are preserved when generating JS property keys.

| Sheet header | JS key | Required | Description |
| ------------ | ------ | -------- | ----------- |
| `name` | `name` | Yes | Full name, unique per member |
| `big` | `big` | No | Big's name exactly as it appears in the `name` column |
| `lin` | `lin` | No | Lin name (e.g. `watergates`). Only needed for lin heads — propagates to descendants automatically |
| `pledge_class` | `pledge_class` | No | E.g. `Alpha Beta`. Shown as a subtitle on the node. |
| `class_year` | `class_year` | No | Graduation year (4-digit integer) |
| `Non-Penn Email` | `non-penn_email` | No | Personal email, shown with a copy button |
| `Phone Number` | `phone_number` | No | Phone number, shown with a copy button |
| `LinkedIn` | `linkedin` | No | LinkedIn URL, rendered as a clickable link with a copy button |
| `Industry` | `industry` | No | Comma-separated list of industries (e.g. `Finance, Tech`). Each value becomes a separate option in the Industry filter. |
| `Current Company` | `current_company` | No | Current employer |
| `Role` | `role` | No | Current job title |
| `Past Companies` | `past_companies` | No | Previous employers |
| `Location` | `location` | No | City / region |

Extra columns are ignored unless you add them to `PANEL_FIELDS` in `config.js`.

> **Note on multi-line cell values:** Google Sheets may export quoted fields that contain embedded newlines (e.g. a role entered with a line break). The CSV parser handles these correctly — they are collapsed to a single space rather than splitting the row into two members.

**Lin propagation rule:** If a member has an explicit `lin` value, that lin is applied to them and all their descendants. If a descendant also has an explicit `lin`, that overrides the inherited value for their subtree. Members with no lin ancestor default to `pgn` (grey).

---

## Adding New Fields to the Info Panel

1. Add the column to the Google Sheet with your chosen header name.
2. In `docs/js/config.js`, add one entry to `PANEL_FIELDS`:

   ```js
   { key: "phone_number", label: "Phone", copy: true }
   ```

3. Push. No other code changes needed.

| Property | Values | Effect |
| -------- | ------ | ------ |
| `copy` | `true` / `false` | Renders a copy-to-clipboard button next to the value |
| `link` | `true` / `false` | Renders the value as a clickable `<a>` link (useful for LinkedIn URLs). If the value doesn't start with `http`, `https://` is prepended automatically. |

---

## JavaScript Architecture

### Module Map

All JS files use ES modules (`import`/`export`). They load in this dependency order:

```text
index.html
└── main.js          ← entry point
    ├── config.js    ← constants (no dependencies)
    ├── csv.js       ← CSV parsing (no dependencies)
    ├── tree.js      ← node list builder (imports config.js)
    ├── render.js    ← D3 rendering + layout engine (imports config.js, tree.js)
    ├── panel.js     ← info panel (imports config.js, render.js)
    └── controls.js  ← UI wiring (imports render.js, panel.js)
```

**`main.js`** — Fetches the CSV, calls `parseCSV` → `render` → `setupControls`. Shows loading/error/setup screens. Contains no rendering or parsing logic.

**`csv.js`** — Parses the raw CSV text into an array of plain objects. Normalises header names (lowercase, spaces → underscores, hyphens preserved). Uses a record-aware splitter (`_splitRecords`) that correctly handles quoted fields containing embedded newlines before splitting into individual fields — this prevents multi-line cell values (e.g. a role entered with a line break in Google Sheets) from being treated as separate members.

**`tree.js`** — Converts the flat member array into a node list for `d3.stratify()`. Creates placeholder nodes for any referenced bigs not in the data, propagates lin values top-down, and attaches every root node to the hidden virtual root (`VROOT`).

**`render.js`** — Owns all mutable rendering state (`svg`, `g`, `zoom`, `currentRoot`, `layoutMode`, `_edgeWaypoints`, `_rowYears`, `_labelsG`). Exports the public API: `render()`, `fitTree()`, `focusNode()`, `setLayoutMode()`, `setColorOn()`, `getColorOn()`, `fillColor()`, `borderColor()`, `clip()`. Also populates the lin, industry, company, and location filter dropdowns during `render()`.

In `"class_year"` layout mode, `render()` also calls `_updateRowUnderlays()` which draws faint horizontal lines behind each year's row (inside `g`, so they zoom/pan with the tree) and year labels pinned to the left edge of the SVG viewport (in a separate `_labelsG` group outside `g`). Label y-positions are updated on every zoom event using `d.y * transform.k + transform.y`.

**`panel.js`** — Manages the slide-in info panel. Exports `openPanel(d)` and `closePanel()`. Renders fields from `PANEL_FIELDS`, copy-to-clipboard buttons, clickable links (for fields with `link: true`), and a clickable list of littles that calls `focusNode()`.

**`controls.js`** — Attaches all DOM event listeners after the tree renders. Exports `setupControls()`. All active filters are ANDed together in a single `_applyFilters()` function so they never overwrite each other.

| Control | Element | Behaviour |
| ------- | ------- | --------- |
| Name search | `#search` | Highlights matching nodes, dims the rest |
| Lin filter | `#lin-filter` | Dims nodes not in the selected lin |
| Industry filter | `#industry-select` (custom tag-select) | Multi-select; dims nodes that don't match any selected industry. Industry values in the data are comma-separated and split into individual options. |
| Company filter | `#company-filter` | Dims nodes not at the selected company |
| Location filter | `#location-filter` | Dims nodes not in the selected location |
| Has Email checkbox | `#has-email` | Dims nodes with no email |
| Has LinkedIn checkbox | `#has-linkedin` | Dims nodes with no LinkedIn |
| Layout mode | `#layout-mode` | Switches between `"none"` and `"class_year"` |
| Color by lin | `#color-toggle` | Toggles lin fill colours |
| Fit to screen | `#fit-btn` | Calls `fitTree()` |

### Data Flow

```text
Google Sheets CSV
  → fetch() in main.js
  → parseCSV()           (csv.js)    plain object array
  → buildNodes()         (tree.js)   flat node list + VROOT
  → d3.stratify()        (render.js) D3 hierarchy
  → _computeLayout()     (render.js) sets d.x / d.y on every node
  → D3 join (links, nodes, text, tooltips)
  → fitTree()
```

### Layout System

The layout is computed in `_computeLayout(root)` inside `render.js`. The active mode is stored in the module-level `layoutMode` variable and changed via `setLayoutMode(mode)`, which re-runs the layout and animates nodes and links to their new positions.

#### Layout modes

| Mode | Behaviour |
| ---- | --------- |
| `"none"` | Pure Dagre. Both x and y come directly from Dagre's Sugiyama algorithm. Clean lines, no row alignment. |
| `"class_year"` | Dagre for x (crossing-minimised); y overridden by graduation year so every class year occupies the same horizontal row. See details below. |
| `"pledge_class"` | **Not yet implemented** — the dropdown option exists but the mode falls through to `"none"` behaviour. Implement by analogy with `"class_year"` using `d.data.pledge_class` as the grouping key. |

#### `"class_year"` layout — how it works

A naïve approach (run Dagre, then snap y to class year rows) breaks Dagre's x layout because Dagre computed x positions for its own internal ranks, not for the overridden y values. Same-year big/little pairs would land at fractional y offsets that Dagre never accounted for, causing micro-overlaps.

The solution uses a **doubled-rank** strategy:

1. **Pre-assign visual ranks** (top-down traversal):
   - VROOT gets rank 0.
   - Each class year gets an even rank: earliest year → 2, next → 4, etc. (one increment of 2 per year).
   - If a node's even rank ≤ its parent's visual rank (same-year big/little), it is assigned `parent_rank + 1` (the odd slot between the two adjacent even ranks).
   - All y values are then exact multiples of `RANK_H = 60px`, with no fractions.

2. **Build the Dagre graph with VROOT included:**
   - VROOT is added as a node so all disconnected lin families share one connected graph. This gives Dagre a global rank reference across all lins.
   - VROOT → lin-head edges use Dagre's `minlen` property (set to the lin-head's visual rank) to enforce the correct global rank without adding dummy nodes on those edges.
   - For edges between real members that span more than one rank, invisible **dummy nodes** are inserted (one per skipped rank) so Dagre's crossing-minimisation algorithm treats every edge as a single-rank hop.

3. **Run Dagre once.** Extract x from Dagre for all real nodes. Set y from the pre-assigned visual rank (`visualRank * RANK_H`).

4. **Compute waypoints** for multi-rank edges: x comes from the Dagre dummy node positions (which are crossing-minimised); y is linearly interpolated between the source and target's final y values. Waypoints are stored in `_edgeWaypoints` (a `Map<"srcId::tgtId", [{x,y}]>`).

5. **Draw edges** via `_linkPath(l)`: edges with waypoints use `d3.line().curve(d3.curveMonotoneY)`; edges without waypoints use `d3.linkVertical()`.

#### Key constants (in `_computeLayout`)

| Constant | Value | Meaning |
| -------- | ----- | ------- |
| `RANK_H` | `60` | Pixels per rank unit. Two rank units = one class-year gap = 120 px. |
| `nodesep` | `20` | Dagre: minimum horizontal gap between node edges in the same rank. |
| `ranksep` | `80` | Dagre: vertical gap between ranks in `"none"` mode (Dagre controls y). |

### Adding a New Layout Mode

1. Add an `<option>` to `#layout-mode` in `index.html`.
2. Add the mode string as a case in `_computeLayout` in `render.js`. Follow the `"class_year"` block as a template:
   - Pre-assign visual ranks using whichever grouping field you want.
   - Build the Dagre graph and run `dagre.layout(dg)`.
   - Set `d.x` and `d.y` on every node.
   - Optionally populate `_edgeWaypoints` for multi-rank edge routing.
3. No changes needed in `controls.js` — the dropdown change handler already calls `setLayoutMode(value)` generically.

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

**Browser caching:** ES modules are aggressively cached. If code changes are not appearing, do a hard reload (`Cmd+Shift+R` on Mac) or open DevTools → Network tab → enable "Disable cache" before reloading.

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
