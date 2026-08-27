# AGENTS.md — open.gismo Development Guide

## Architecture Overview

open.gismo is a thin integration layer over {workr} connecting four modular components:

| Component | Technology | Location |
|---|---|---|
| Database | GitHub repos (lConfig hooks) | `R/gh_lConfig.R`, `R/gh_LoadData.R`, `R/gh_SaveData.R` |
| Analytics Engine | GitHub Actions | `.github/workflows/` |
| Web Front-end | Vite SPA (JS) | `site/` |
| Config | YAML files | `workflow/`, `config/` in study repos |

Each component communicates through well-defined interface contracts. The R package provides
GitHub-specific `LoadData`/`SaveData` hooks so `workr::RunWorkflow` can read/write GitHub repos.
GitHub Actions orchestrate pipeline execution. The Vite front-end consumes static JSON/CSV/YAML
artifacts. Config is purely YAML conventions.

### Key Directories

- `R/` — R source (lConfig hooks, snapshot manager, status tracker, GitHub API helpers)
- `tests/testthat/` — R unit and property-based tests (testthat + hedgehog)
- `site/src/` — JavaScript front-end modules
- `site/tests/` — JS unit and property-based tests (vitest + fast-check)
- `.github/workflows/` — GitHub Actions YAML
- `skills/` — AI skill guides
- `inst/examples/` — Example projects with demo data

## Component Development Workflows

### R Package (lConfig Hooks, Snapshot Manager)

1. Create or edit files in `R/`.
2. Add roxygen2 docstrings; run `devtools::document()`.
3. Write tests in `tests/testthat/`; run `devtools::test()`.
4. Run `devtools::check()` before committing.

### JavaScript Front-end

1. Edit modules in `site/src/`. `main.js` is a two-line entry point; the shell
   lives in `app.js`, which composes the chrome (`sidebar.js`, `masthead.js`,
   `domainnav.js`, `router.js`, `context.js`) with the domain views
   (`overview.js`, `gallery.js`, `rbqm.js`, `kritable.js`) and the pipeline
   Data Explorer views.
   `site/src/vendor/` holds third-party source copied in verbatim — do not
   hand-edit it; adapt around it and record the provenance beside it.
2. Run `npx vitest --run` from `site/` to execute tests.
3. Run `npm run build` from `site/` to verify the Vite build. It writes the
   single-file bundle to `inst/site/index.html` — the copy `og_init()` /
   `og_run()` place in a project or snapshot root — so commit that file with the
   source change that produced it.
4. New modules: export pure builder functions, wire them in `app.js`, add tests
   beside them as `site/src/<name>.test.js`.

### GitHub Actions Workflows

1. Edit YAML files in `.github/workflows/`.
2. Validate YAML syntax locally (`yaml` R package or a linter).
3. Test by triggering a `workflow_dispatch` on a feature branch.
4. Check the Actions tab for logs and errors.

### Workflow YAML Configuration

1. Create YAML in the study repo under `workflow/<phase>/`.
2. Include `meta` (Type, ID, Priority) and `steps` sections.
3. Optionally add a `spec` section for input validation.
4. Verify with `workr::MakeWorkflowList()`.

## Testing Instructions

### R Tests

```bash
# Run all R unit + property tests
Rscript -e "devtools::test('open.gismo')"

# Run R CMD check
Rscript -e "devtools::check('open.gismo')"
```

- Framework: testthat (edition 3) + hedgehog for property-based tests.
- Minimum 100 iterations for hedgehog properties.
- Mock HTTP calls; do not hit live GitHub API in tests.

### JavaScript Tests

```bash
# Run all JS unit + property tests
cd open.gismo/site && npx vitest --run

# Build the site
cd open.gismo/site && npm run build
```

- Framework: vitest + fast-check for property-based tests.
- Use JSDOM environment for DOM tests.
- Minimum 100 iterations for fast-check properties.

## PR and Review Workflow

1. Branch from `main` using `feature/<description>` or `fix/<description>`.
2. Write tests first (TDD red/green cycle).
3. Keep commits focused — one logical change per commit.
4. Open a pull request with a description of changes and test results.
5. Ensure all CI checks pass (R CMD check, vitest, Vite build).
6. Request review from a maintainer; address feedback before merge.
7. Squash-merge into `main`.

## Interface Contracts

### Contract 1: Analytics Engine ↔ Database (lConfig)

```
LoadData(lWorkflow, lConfig, lData) → lData
  lWorkflow: list with $meta, $spec, $steps
  lConfig:   list with $repo, $branch, $snapshot_id, $data_config, $token
  lData:     list of data.frames (may be NULL)
  Returns:   lData with domains loaded per lWorkflow$spec

SaveData(lWorkflow, lConfig) → side effect (commits to GitHub)
  lWorkflow: list with $meta, $lResult, $lData
  Side effect: commits output files + updates status.json
```

### Contract 2: Analytics Engine ↔ Config (YAML)

```
workr::MakeWorkflowList(strPath) → list of workflow objects
  Each workflow: $meta (Type, ID, Priority), $steps, $spec (optional)
```

### Contract 3: Web Front-end ↔ Database (Static Files)

```
data/branches.json                          → ["ss-dev", "ss-demo"]
data/{branch}/_index.json                   → ["workflows/1_mappings/AE.yaml", ...]
data/{branch}/manifest.csv                  → CSV: org, package, version, repository, url, sha
data/{branch}/snapshots.json                → [{snapshot_id, created_at, ...}]
data/{branch}/{snapshot_id}/status.json     → {workflows: {wf_id: {steps: [...]}}}
data/{branch}/{snapshot_id}/log.json        → {workflows: {wf_id: {stdout, stderr, ...}}}
data/{branch}/{snapshot_id}/output/...      → CSV artifact files
```

### Contract 4: Config ↔ All Components

```
config/packages.yaml     → list of R package refs for pkgSnapshot
config/data-config.yaml  → domain-to-path mappings for lConfig
config/study-config.yaml → project metadata + workflow image list
workflow/<phase>/*.yaml  → workr workflow definitions
```
