<!--
NEWS.md is the running release log and the draft of each release's notes
(obot.agent/skills/rc-release-notes/SKILL.md): newest section first; unreleased
work accumulates under a vX.Y.Z (Upcoming) heading that loses the suffix when
the release is cut; the GitHub release publishes from the section verbatim.
-->

# open.gismo v0.2.0 (Upcoming)

**See it move:** the [annotated v0.2 demo](https://jwildfire.github.io/obot.roadmap/reports/og-v0.2-demo/) walks the release running live as the [DEMO-301 study site](https://jwildfire.github.io/demo-301/), with captures and try-it-yourself steps.

open.gismo becomes a local-first RBQM platform with a real study site. This release collects everything since v0.1.0: run the full gsm pipeline against a plain project folder — no GitHub repo, Actions, or Pages required — and read the results as a study site with snapshot history, provenance, and RBQM and Safety domains. The GitHub-backed lane (`gh_*`, Actions, snapshots) is unchanged and documented as an optional publishing lane.

## What's new

- **A local-first engine.** `og_init()` scaffolds a self-contained project folder, `og_validate()` gives per-domain human-readable validation of the input CSVs, `og_run()` runs the full 4-phase pipeline (mappings → metrics → reporting → report modules) locally via {workr} — writing interactive gsm.kri reports, static chart exports, and the site payload into the folder — and `og_view()` / `og_app()` serve it. `fs_lConfig()` / `fs_LoadData()` / `fs_SaveData()` are the filesystem twin of `gh_lConfig()`, proving the {workr} `lConfig` seam is a real swappable-backend contract.
- **The site is a study site, not a workflow explorer.** A masthead carries the study identity, a snapshot timeline (pick a dot and the whole app re-points at that snapshot's tree), and a provenance chip that expands into the snapshot's reproducibility record — input data version, package snapshot, and the pinned package SHAs every number on the site comes from.
- **RBQM leads with the sites that need attention.** The ranked gsm.kri risk-score table — denominator beside every score, contributing flags and weights on hover, a since-last-snapshot change chip, low-precision sites dimmed rather than ranked — beside a funnel plot of the same sites against their precision with study mean and 95% / 99.8% control limits. The real `gsm.viz` groupOverview table renders over the snapshot's reporting layer, and RBQM gains metric-charts and metric-definitions sub-pages.
- **Acceptable ranges (quality tolerance limits) get their own study-level panel**, in ICH E6(R3)'s three states — within range, trending to limit, breached — deliberately kept apart from the site KRIs. Report modules now come from the project's own workflows rather than a hard-coded pair, so a study can snapshot gsm.qtl's QTL report and read it in the app like any other.
- **A Safety domain that leads with denominators.** Census and exposure (enrolled, dosed, person-years, deaths) ahead of findings, data coverage by visit — the figure that decides whether a quiet visit is reassuring or empty — the participants the safety metrics flagged for review, and a gallery of the rendered safety.viz charts, each opening the live renderer.
- **Snapshots that mean something.** The snapshot date derives from the newest date in the raw input — the point in study time the cut describes — not the wall clock; snapshot history accumulates under `history/` so change columns (`Score_Change`, `Metric_Previous`, …) appear from the second snapshot onward; and one change-chip convention (a glyph *and* a word, direction of "bad" read from the metric's own thresholds, noise-gated) is shared by every domain page.
- **Navigation that scales.** The sidebar nests per domain from the study's own registry, every view is deep-linkable by hash and carries its snapshot, flags are always rendered with a text label — never colour alone — and the config views sit at the bottom as **Config**.

## Also in this release

- `parseCsv()` fixed for quoted fields containing commas (gsm's `"-2,-1,2,3"` thresholds silently shifted later columns and broke metric lookups).
- `npm run build` writes the bundle to `inst/site/index.html` instead of a stray root artifact; portability and CI-pinning fixes.
- CI added: `R-CMD-check` and `site-tests` (vitest + build smoke test) run on push/PR.

# Earlier releases

- [v0.1.0](https://github.com/jwildfire/open.gismo/releases/tag/v0.1.0) — 2026-03-26.
