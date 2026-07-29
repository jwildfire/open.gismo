# Tests for the payload writers in utils_payload.R (_index.json, status.json,
# manifest.csv, reports.json).

# Build a minimal project skeleton in a tempdir: one mapping workflow YAML,
# one metric YAML, one module YAML, plus optional output files.
local_payload_project <- function(env = parent.frame()) {
  proj <- withr::local_tempdir(.local_envir = env)
  dir.create(file.path(proj, "workflows", "1_mappings"), recursive = TRUE)
  dir.create(file.path(proj, "workflows", "2_metrics"), recursive = TRUE)
  dir.create(file.path(proj, "workflows", "4_modules"), recursive = TRUE)

  writeLines(
    c(
      "meta:",
      "  Type: Mapped",
      "  ID: AE",
      "spec:",
      "  Raw_AE:",
      "    subjid:",
      "      type: character",
      "steps:",
      "  - output: Mapped_AE",
      "    name: =",
      "    params:",
      "      lhs: Mapped_AE",
      "      rhs: Raw_AE"
    ),
    file.path(proj, "workflows", "1_mappings", "AE.yaml")
  )
  writeLines(
    c(
      "meta:",
      "  Type: Analysis",
      "  ID: kri0001",
      "  Metric: Adverse Event Rate",
      "steps:",
      "  - output: Analysis_Summary",
      "    name: gsm.core::Summarize"
    ),
    file.path(proj, "workflows", "2_metrics", "kri0001.yaml")
  )
  writeLines(
    c(
      "meta:",
      "  Type: Report",
      "  ID: report_kri_site",
      "  Name: Site-Level Key Risk Indicator Report",
      "steps:",
      "  - output: lReport",
      "    name: gsm.kri::Report_KRI"
    ),
    file.path(proj, "workflows", "4_modules", "report_kri_site.yaml")
  )
  proj
}

test_that("og_write_index_json lists workflow YAMLs sorted, relative to root", {
  skip_if_not_installed("yaml")
  proj <- local_payload_project()

  rel <- og_write_index_json(proj)

  expect_equal(rel, c(
    "workflows/1_mappings/AE.yaml",
    "workflows/2_metrics/kri0001.yaml",
    "workflows/4_modules/report_kri_site.yaml"
  ))
  on_disk <- jsonlite::fromJSON(file.path(proj, "_index.json"))
  expect_equal(on_disk, rel)
})

test_that("og_write_index_json writes an empty array without workflows/", {
  proj <- withr::local_tempdir()
  rel <- og_write_index_json(proj)
  expect_length(rel, 0L)
  expect_equal(readLines(file.path(proj, "_index.json")), "[]")
})

test_that("og_write_status_json marks workflows completed/not_run by file presence", {
  skip_if_not_installed("yaml")
  proj <- local_payload_project()

  # AE has its output CSV on disk; kri0001 has nothing; the module has HTML.
  ae_dir <- file.path(proj, "output", "1_mappings", "AE")
  dir.create(ae_dir, recursive = TRUE)
  write.csv(data.frame(x = 1), file.path(ae_dir, "Mapped_AE.csv"), row.names = FALSE)

  mod_dir <- file.path(proj, "output", "4_modules", "report_kri_site")
  dir.create(mod_dir, recursive = TRUE)
  writeLines("<html></html>", file.path(mod_dir, "kri_report_X_Site_2026-01-01.html"))

  status <- og_write_status_json(proj)

  # AE + module completed, kri0001 not_run -> a mixed run is "partial".
  expect_equal(status$pipeline_status, "partial")
  wfs <- status$workflows
  expect_true(all(c("Mapped_AE", "Analysis_kri0001", "Report_report_kri_site") %in% names(wfs)))

  expect_equal(wfs$Mapped_AE$status, "completed")
  expect_equal(wfs$Mapped_AE$phase, "1_mappings")
  expect_equal(wfs$Mapped_AE$steps[[1]]$output, "Mapped_AE")
  expect_equal(wfs$Mapped_AE$steps[[1]]$status, "completed")

  expect_equal(wfs$Analysis_kri0001$status, "not_run")
  expect_equal(wfs$Analysis_kri0001$steps[[1]]$status, "not_run")

  expect_equal(wfs$Report_report_kri_site$status, "completed")
  html_steps <- Filter(
    function(s) identical(s$name, "html_report"),
    wfs$Report_report_kri_site$steps
  )
  expect_length(html_steps, 1L)

  # Round-trips as valid JSON on disk
  on_disk <- jsonlite::fromJSON(file.path(proj, "status.json"), simplifyVector = FALSE)
  expect_equal(on_disk$workflows$Mapped_AE$status, "completed")
})

test_that("og_write_status_json pipeline_status reflects how much of the run ran", {
  skip_if_not_installed("yaml")

  # No output at all -> nothing completed -> "not_run".
  proj_none <- local_payload_project()
  expect_equal(og_write_status_json(proj_none)$pipeline_status, "not_run")

  # Every workflow has its output on disk -> "completed".
  proj_all <- local_payload_project()
  ae_dir <- file.path(proj_all, "output", "1_mappings", "AE")
  dir.create(ae_dir, recursive = TRUE)
  write.csv(data.frame(x = 1), file.path(ae_dir, "Mapped_AE.csv"), row.names = FALSE)
  kri_dir <- file.path(proj_all, "output", "2_metrics", "kri0001")
  dir.create(kri_dir, recursive = TRUE)
  write.csv(data.frame(x = 1), file.path(kri_dir, "Analysis_Summary.csv"), row.names = FALSE)
  mod_dir <- file.path(proj_all, "output", "4_modules", "report_kri_site")
  dir.create(mod_dir, recursive = TRUE)
  writeLines("<html></html>", file.path(mod_dir, "kri_report_X_Site_2026-01-01.html"))
  expect_equal(og_write_status_json(proj_all)$pipeline_status, "completed")
})

test_that("og_write_manifest records the pipeline packages", {
  proj <- withr::local_tempdir()

  manifest <- og_write_manifest(proj)

  expect_equal(
    names(manifest),
    c("org", "package", "version", "repository", "url", "sha")
  )
  expect_true(all(
    c("gsm.core", "gsm.mapping", "gsm.kri", "gsm.reporting", "workr", "open.gismo") %in%
      manifest$package
  ))
  on_disk <- read.csv(file.path(proj, "manifest.csv"), stringsAsFactors = FALSE)
  expect_equal(nrow(on_disk), nrow(manifest))
  # open.gismo is loaded (we are testing it), so its version must be filled in
  expect_true(nzchar(manifest$version[manifest$package == "open.gismo"]))
})

test_that("og_write_reports_json writes an empty payload when nothing is rendered", {
  proj <- withr::local_tempdir()

  payload <- og_write_reports_json(proj)

  expect_length(payload$reports, 0L)
  expect_length(payload$static_charts, 0L)
  path <- file.path(proj, "output", "4_modules", "reports.json")
  expect_true(file.exists(path))
  on_disk <- jsonlite::fromJSON(path, simplifyVector = FALSE)
  expect_length(on_disk$reports, 0L)
})

test_that("og_write_reports_json follows the reports.json contract", {
  skip_if_not_installed("yaml")
  proj <- local_payload_project()

  site_dir <- file.path(proj, "output", "4_modules", "report_kri_site")
  dir.create(site_dir, recursive = TRUE)
  writeLines("<html></html>", file.path(site_dir, "kri_report_ABC_Site_2026-07-12.html"))

  static_dir <- file.path(proj, "output", "4_modules", "static")
  dir.create(static_dir, recursive = TRUE)
  writeLines("png", file.path(static_dir, "kri0001.png"))

  payload <- og_write_reports_json(proj)

  expect_length(payload$reports, 1L)
  rpt <- payload$reports[[1]]
  expect_equal(rpt$id, "report_kri_site")
  expect_equal(rpt$group_level, "Site")
  # Title from the module YAML meta Name
  expect_equal(rpt$title, "Site-Level Key Risk Indicator Report")
  expect_equal(
    rpt$html,
    "output/4_modules/report_kri_site/kri_report_ABC_Site_2026-07-12.html"
  )

  expect_length(payload$static_charts, 1L)
  chart <- payload$static_charts[[1]]
  expect_equal(chart$metric, "kri0001")
  # Title from the metric YAML meta Metric
  expect_equal(chart$title, "Adverse Event Rate")
  expect_equal(chart$png, "output/4_modules/static/kri0001.png")
})

# ---------------------------------------------------------------------------
# Report modules beyond the two KRI reports
# ---------------------------------------------------------------------------

test_that(".og_module_ids reads the module ids from the project's workflows", {
  proj <- withr::local_tempdir()
  wf <- file.path(proj, "workflows", "4_modules")
  dir.create(wf, recursive = TRUE)
  writeLines(
    c("meta:", "  Type: Report", "  ID: report_qtl", "  Name: QTL Report"),
    file.path(wf, "report_qtl.yaml")
  )
  writeLines(
    c("meta:", "  Type: Report", "  ID: report_kri_site", "  Name: Site KRIs"),
    file.path(wf, "report_kri_site.yaml")
  )
  expect_setequal(.og_module_ids(proj), c("report_qtl", "report_kri_site"))
})

test_that(".og_module_ids falls back to the two KRI reports with no workflows", {
  proj <- withr::local_tempdir()
  expect_equal(.og_module_ids(proj), c("report_kri_site", "report_kri_country"))
})

test_that(".og_module_group_level reads Study/Site/Country from the module id", {
  expect_equal(.og_module_group_level("report_kri_country"), "Country")
  expect_equal(.og_module_group_level("report_kri_site"), "Site")
  # A study-level module (the QTLs) is neither, and must not be mislabelled as
  # a site report just because "site" is not in its name.
  expect_equal(.og_module_group_level("report_qtl"), "Study")
})

test_that("og_write_reports_json lists every module that produced HTML", {
  proj <- withr::local_tempdir()
  wf <- file.path(proj, "workflows", "4_modules")
  dir.create(wf, recursive = TRUE)
  writeLines(
    c("meta:", "  Type: Report", "  ID: report_qtl", "  Name: QTL Report"),
    file.path(wf, "report_qtl.yaml")
  )
  out <- file.path(proj, "output", "4_modules", "report_qtl")
  dir.create(out, recursive = TRUE)
  writeLines("<html></html>", file.path(out, "report_qtl.html"))

  payload <- og_write_reports_json(proj)
  expect_length(payload$reports, 1L)
  expect_equal(payload$reports[[1]]$id, "report_qtl")
  expect_equal(payload$reports[[1]]$title, "QTL Report")
  expect_equal(payload$reports[[1]]$group_level, "Study")
  expect_equal(payload$reports[[1]]$html, "output/4_modules/report_qtl/report_qtl.html")
})

test_that(".og_move_report_html collects reports written outside the project root", {
  proj <- withr::local_tempdir()
  paths <- og_project_paths(proj)
  dir.create(paths$root, showWarnings = FALSE, recursive = TRUE)
  # gsm.kri's KRI modules render into the working directory ...
  writeLines("<html></html>", file.path(paths$root, "kri_report_Site_x.html"))
  writeLines("<html></html>", file.path(paths$root, "kri_report_Country_x.html"))
  # ... while gsm.qtl's RenderRmd writes into outputs/{SnapshotDate}/.
  qtl_dir <- file.path(paths$root, "outputs", "2012-03-29")
  dir.create(qtl_dir, recursive = TRUE)
  writeLines("<html></html>", file.path(qtl_dir, "report_qtl.html"))

  n <- .og_move_report_html(paths)
  expect_equal(n, 3L)
  expect_true(file.exists(file.path(
    paths$output, "4_modules", "report_kri_site", "kri_report_Site_x.html"
  )))
  expect_true(file.exists(file.path(
    paths$output, "4_modules", "report_kri_country", "kri_report_Country_x.html"
  )))
  expect_true(file.exists(file.path(
    paths$output, "4_modules", "report_qtl", "report_qtl.html"
  )))
  # The scratch directory the module wrote into does not survive the run.
  expect_false(dir.exists(file.path(paths$root, "outputs")))
})
