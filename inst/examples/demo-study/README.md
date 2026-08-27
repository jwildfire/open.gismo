# Demo Study — open.gismo Example Project

Minimal example project that exercises all four open.gismo components.

## Components Exercised

- **Config**: `config/` YAML files define packages, data domains, and study metadata.
- **Database**: `input/` CSV files provide sample raw data; `data-config.yaml` maps domains to paths.
- **Analytics Engine**: `workflow/` YAMLs define a two-phase pipeline (mappings → metrics).
- **Web Front-end**: Output artifacts and status are viewable in the Vite SPA after a pipeline run.

## Workflows

| Phase | File | Description |
|-------|------|-------------|
| 1_mappings | `AE.yaml` | Maps raw adverse event data to a standard format. |
| 2_metrics | `kri0001.yaml` | Computes the Adverse Event Rate KRI at the site level. |

## Expected Output

After running the pipeline via `workr::RunWorkflows`:

1. `Mapped_AE` — mapped adverse event data frame.
2. `Analysis_Input` — site-level input rates.
3. `Analysis_Summary` — summary statistics per site.
4. `status.json` — per-step execution status (completed/failed/not_run).
