# Overview

open.gismo is an end-to-end platform for running workflows in R using the {workr} package. You can explore the prototype [here](https://gilead-biostats.github.io/open.gismo/). 

# Local quickstart

open.gismo runs entirely on your own machine — no GitHub repo, Actions, or Pages
required. A project folder holds everything: config, workflow YAMLs, your input
CSVs, and the generated reports.

```r
# install.packages("pak")
# dependencies = TRUE installs the pipeline packages (workr + gsm.core/mapping/kri/reporting,
# resolved from GitHub via Remotes) and the app packages (shiny, bslib) — all Suggests.
pak::pak("jwildfire/open.gismo", dependencies = TRUE)
library(open.gismo)
og_init("~/my-study", example = TRUE)   # or drop your own Raw_*.csv files in ~/my-study/input/
og_app("~/my-study")                    # load → validate → customize → run → view
# or headless: og_validate("~/my-study"); og_run("~/my-study", open = TRUE)
```

`og_init()` scaffolds the project folder — config templates, the demo-proven set
of mapping/metric/reporting/module workflow YAMLs snapshotted from your installed
gsm packages, and (with `example = TRUE`) sample input data drawn from
`gsm.core::lSource`. `og_validate()` checks your input CSVs against each
mapping workflow's spec and reports missing files, columns, or types by
domain — the "forgiveness layer" before a run. `og_run()` executes the full
4-phase pipeline (mappings → metrics → reporting → report modules) locally via
{workr}, and writes both interactive gsm.kri reports and static chart exports
into the project's `output/` folder. `og_view()` serves the folder locally and
opens the site in a browser; `og_app()` wraps the same steps in a thin
Shiny/bslib shell — all state still lives in the project folder as YAML/CSV, so
the package works fully without the app.

# Architecture

open.gismo has two ways to run the same 4-component design (Database, Analytics
Engine, Web Front-end, Config): a **local-first** engine that runs entirely
against a filesystem project folder (above — the default for new projects), and
a **GitHub deployment lane** that uses a GitHub repo as the backbone for
storage, compute, and publishing (below — optional, for teams that want a
shared, hosted deployment). Both lanes drive the same {workr} pipeline and
produce the same report/payload shapes; only the `lConfig` backend (`fs_lConfig`
vs. `gh_lConfig`) and the publishing target differ.

# GitHub deployment lane

Everything below is optional. It describes the second way to run the same
4-component design — using a GitHub repo as the backbone for storage, compute,
and publishing, so a team can share a hosted deployment instead of (or in
addition to) running locally.

## Design

There are 4 main components that work together to form a fully open source analytics platform: 

- **Database** - Stores raw data, analytics outputs (data, reports) and serves as database for web-frontend 
- **Analytics Engine** - Runs R code using {workr}, reads/writes from database. 
- **Web Front-end** - Summarizes {workr} pipelines, showing data (input and output), code, logs and packages for each set of workflows. 
- **Config** - project folder(s) of pipeline specific {workr} yamls and configuration files. 

This repo provides a sample fully public and open-source implementation, largely for demo purposes, but the approach is highly modular, and a variety of technologies can be used for each component. 

### Database

The database stores all data needed to run the workflows. Many possible implementations exist including: 

- Github Repo **current state**
- GitHub Artifacts **future state**
- Supabase
- AWS S3 bucket + DuckDB

### Analytics Engine

The analytics engine loads all needed packages and executes the workflows using {workr}. Approaches include: 

- User-Run Scripts - **Current State** 
- GitHub Actions - **Future State** {workr}-based actions with custom `lConfig.saveData` and `lConfig.loadData` hooks in [`workr::RunWorkflow`](https://github.com/Gilead-BioStats/workr/blob/main/R/RunWorkflow.R) to pull data from database.  
- R Shiny App (possibly with WASM)
- AWS framework (e.g. via lambdas)

### Web Front-end

The web front-end provides a user-friendly interface to explore {workr} pipelines. Data is served from the database, pipeline specific data is read from the config. The current front-end source for open.gismo lives in [site/](site/).

Users can: 

- See a list of projects
- View a summary of the overall workflows for a given project
- View details for each step (each workr .yaml file) including the input/output data
- View the data model at each step of the model

This package uses GitHub Pages as the default front-end, but many possible implementations exist including: 

- GitHub Pages (used in Prototype) - **Current and Future State**
- React/Next.js hosted on Vercel or similar

### Config

YAML workflow and config files are typically saved in folders in GitHub Repos (but could be pulled from other locations). A minimal example project for development and testing is available in [inst/examples/demo-study](inst/examples/demo-study/).

## Current Build Process

The current demo build process is implemented on the `demo` branch as a simple branch-root project that can be regenerated end to end.

1. **Initialize project config**
	- Define `config/packages.yaml` with the gsm packages to snapshot.
	- Define `config/study-config.yaml` with the study metadata.

2. **Snapshot and prune workflows**
	- Run `workr::pkgSnapshot(branch = "dev")` to materialize workflow YAMLs and package metadata.
	- Keep `manifest.csv` and `rproject.toml`.
	- Remove workflows that depend on unavailable demo inputs, including EXCLUSION, PK, related metrics, and the eligibility module.

3. **Generate demo input data**
	- Run `input/initData.R` to create the raw CSV inputs from `gsm.core::lSource`.
	- The demo currently generates 13 raw input domains.

4. **Build data configuration**
	- Generate `config/data-config.yaml` from workflow specs so the project has explicit domain-to-file mappings for the pipeline inputs.

5. **Run the pipeline**
	- Execute `runWorkflows.R` to run all four workflow phases.
	- Outputs are written to `output/{phase}/{workflowId}/`.
	- Phase outputs are organized as mappings, metrics, reporting datasets, and HTML modules.
	- `GroupID` is normalized to character before reporting so site- and country-level outputs remain compatible.

6. **Build the static site payload**
	- Run `./build-site.sh`.
	- The script pulls the current site source from `dev` using `git show` rather than switching branches.
	- It generates `_index.json`, generates file-backed `status.json`, and runs `npm ci && npm run build` to produce the bundled `index.html`.

7. **Publish the demo branch**
	- The `demo` branch root is the deployable payload.
	- GitHub Pages now deploys that branch content through GitHub Actions after validating that the expected build artifacts are present.

The repository also contains static data payloads under `site/public/data/` and `docs/data/` for the multi-branch explorer build. Those are deployment artifacts for the static site, not part of the R package itself.

# AI Skills

open.gismo is designed for AI-assisted development with extensive human review. The platform includes two resources to support this workflow:

- **Agent Development Instructions (AGENTS.md)** — A comprehensive development guide covering the multi-language, multi-component nature of the platform (R packages, GitHub Actions YAML, JavaScript/Vite front-end, config YAMLs). Includes component-specific development workflows, testing instructions per component, PR/review workflow, architecture overview, and interface contracts between components.
- **Generic AI Agent Skills** — A set of tool-agnostic structured markdown files that provide step-by-step instructions for common development tasks (e.g., adding a workflow YAML, implementing a new lConfig hook, adding a front-end view, running a pipeline, creating snapshots). These skills are not tied to any specific AI coding assistant and can be followed by any agent or human developer.