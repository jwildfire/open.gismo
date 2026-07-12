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