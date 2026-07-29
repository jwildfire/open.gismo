# open.gismo (development version)

- The site is now a **study site**, not a workflow explorer: an espresso masthead carries the study identity from `config/study-config.yaml`, a snapshot timeline (one dot per `snapshots.json` entry — picking one re-points the whole app at that snapshot tree), and a provenance chip that expands into the snapshot's reproducibility record (input data version, package snapshot, pinned manifest SHAs).
- Collapsible left sidebar, driven by the study config domain registry: **Study Overview** (flag tiles, changes since the previous snapshot, safety chart preview, a compact snapshot record), **RBQM** (flag tiles, the group overview table, gsm.kri module reports and static chart exports), **Safety** (gallery of the rendered safety.viz charts, each opening the live renderer) and **Data Explorer** (the previous Workflows / Data / Reports / Packages views, unchanged in function). The sidebar collapses to a slim rail and remembers the choice.
- RBQM renders the **real `groupOverview` table from `gsm.viz`** — the same table a gsm.kri report renders — over this snapshot's reporting layer, with its own sorting, flag icons, site risk score and tooltips, and a Site / Country switch. The widget's import closure is vendored under `site/src/vendor/gsm.viz/` (see its `PROVENANCE.md`); `site/src/kritable.js` adapts `output/3_reporting/` into its input contract.
- The masthead is one dense row rather than a hero: study title, facts, snapshot timeline and provenance chip on a single line.
- Every view is deep-linkable by hash and carries the snapshot it was read from (`#/safety/hep_explorer?snapshot=ps-001`).
- Flag semantics are derived from the reporting layer: `|flag| = 2` red, `|flag| = 1` amber, `0` on track, blank/NA not evaluated — always rendered with a text label and an accessible name, never colour alone.
- Fixed `parseCsv()`: quoted fields containing commas (for example gsm's `"-2,-1,2,3"` thresholds) shifted every later column, which silently broke metric lookups.
- `npm run build` now writes the bundle straight to `inst/site/index.html` instead of leaving a stray artifact in the repository root.

# open.gismo 0.2.0

- Added a local-first engine so open.gismo runs entirely against a filesystem project folder — no GitHub repo, Actions, or Pages required. The GitHub-backed lane (`gh_*`, Actions, snapshots) is unchanged and now documented as an optional publishing lane.
- `fs_lConfig()` / `fs_LoadData()` / `fs_SaveData()` — filesystem-backed `lConfig` twin of `gh_lConfig()`, proving the {workr} `lConfig` seam is a real swappable-backend contract.
- `og_init()` — scaffolds a self-contained project folder: config templates, the demo-proven workflow YAMLs snapshotted from installed gsm packages, and (optionally) example input data.
- `og_validate()` — per-domain, human-readable validation of input CSVs against the mapping workflow specs.
- `og_run()` — runs the full 4-phase pipeline (mappings → metrics → reporting → report modules) locally via {workr}, writing interactive gsm.kri reports, static chart exports, and a site-compatible payload (`status.json`, `_index.json`, `manifest.csv`, `reports.json`) into the project folder.
- `og_view()` — serves a project folder locally and opens it in a browser.
- `og_app()` — a thin Shiny/bslib shell (data load, validation, settings, run, report viewer) over the same project-folder state; the package works fully without it.
- Site gains a **Reports** tab that lists and iframes the interactive gsm.kri reports and links static chart exports.
- CI added: `R-CMD-check` (r-lib/actions) and `site-tests` (vitest + build smoke test) so the test suite actually runs on push/PR.