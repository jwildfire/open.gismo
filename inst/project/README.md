# open.gismo study project

This folder is a self-contained open.gismo study. Everything the pipeline needs
lives here as plain files — no database, no server. You can copy, zip, or
version-control the whole folder.

## Layout

```
config/           study + data configuration (YAML you edit)
  study-config.yaml   study id / name / title
  data-config.yaml    which CSV supplies each input domain
  packages.yaml       source gsm packages (informational)
workflows/        snapshotted analysis workflows (do not edit by hand)
  1_mappings/         raw -> mapped domain transforms
  2_metrics/          KRI / country metric definitions
  3_reporting/        reporting data model
  4_modules/          report definitions
input/            your data: Raw_*.csv files
output/           results written by og_run() (safe to delete + regenerate)
```

## Workflow

1. **Add data.** Drop your `Raw_*.csv` files into `input/`, or start from the
   bundled example data (`og_init(example = TRUE)`).
2. **Validate.** `og_validate("<this folder>")` reports, per domain, whether the
   file is present and has the columns the mappings expect.
3. **Customize (optional).** Edit metric settings under `workflows/2_metrics/`,
   or use the app (`og_app("<this folder>")`).
4. **Run.** `og_run("<this folder>")` runs the full pipeline locally and writes
   results plus linked static and interactive reports into `output/`.
5. **View.** `og_view("<this folder>")` serves the folder and opens the site.

The GitHub publishing lane is optional: the same folder can be pushed to a repo
and rebuilt by GitHub Actions, but nothing here depends on it.
