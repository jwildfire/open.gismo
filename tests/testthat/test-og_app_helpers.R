# Tests for og_app helpers — metric settings read/write round-trips and the
# small internal helpers that back the thin app shell. No Shiny app is launched.

# ---------------------------------------------------------------------------
# Fixture: a minimal project folder with two metric YAMLs under
# workflows/2_metrics. Each YAML mirrors the real gsm.kri metric shape (meta +
# spec + steps) so we exercise "preserve unrelated keys" for real.
# ---------------------------------------------------------------------------

make_metric_project <- function() {
  root <- withr::local_tempdir(.local_envir = parent.frame())
  metrics_dir <- file.path(root, "workflows", "2_metrics")
  dir.create(metrics_dir, recursive = TRUE)

  yaml::write_yaml(
    list(
      meta = list(
        Type = "Analysis",
        ID = "kri0001",
        GroupLevel = "Site",
        Metric = "Adverse Event Rate",
        Threshold = "-2,-1,2,3",
        Flag = "-2,-1,0,1,2"
      ),
      spec = list(Mapped_AE = list(subjid = list(type = "character"))),
      steps = list(list(output = "x", name = "gsm.core::Foo"))
    ),
    file.path(metrics_dir, "kri0001.yaml")
  )

  yaml::write_yaml(
    list(
      meta = list(
        Type = "Analysis",
        ID = "cou0001",
        GroupLevel = "Country",
        Metric = "Country AE Rate",
        Threshold = "-3,-2,2,3",
        Active = FALSE
      ),
      spec = list(Mapped_AE = list(subjid = list(type = "character"))),
      steps = list(list(output = "y", name = "gsm.core::Bar"))
    ),
    file.path(metrics_dir, "cou0001.yaml")
  )

  root
}

# ---------------------------------------------------------------------------
# og_metric_settings — read half
# ---------------------------------------------------------------------------

test_that("og_metric_settings returns the contract columns", {
  skip_if_not_installed("yaml")
  skip_if_not_installed("withr")
  root <- make_metric_project()

  ms <- og_metric_settings(root)

  expect_s3_class(ms, "og_metric_settings")
  expect_true(is.data.frame(ms))
  expect_setequal(
    names(ms),
    c("metric", "file", "Active", "Threshold", "GroupLevel")
  )
  expect_equal(nrow(ms), 2L)
})

test_that("og_metric_settings reads Active (default TRUE) and per-metric fields", {
  skip_if_not_installed("yaml")
  skip_if_not_installed("withr")
  root <- make_metric_project()

  ms <- og_metric_settings(root)
  kri <- ms[ms$metric == "kri0001", ]
  cou <- ms[ms$metric == "cou0001", ]

  # kri0001 has no Active key -> defaults TRUE
  expect_true(kri$Active)
  expect_equal(kri$GroupLevel, "Site")
  expect_equal(kri$Threshold, "-2,-1,2,3")

  # cou0001 has Active: false explicitly
  expect_false(cou$Active)
  expect_equal(cou$GroupLevel, "Country")
})

test_that("og_metric_settings returns empty frame when metrics dir absent", {
  skip_if_not_installed("withr")
  root <- withr::local_tempdir()

  ms <- og_metric_settings(root)
  expect_true(is.data.frame(ms))
  expect_equal(nrow(ms), 0L)
  expect_setequal(
    names(ms),
    c("metric", "file", "Active", "Threshold", "GroupLevel")
  )
})

# ---------------------------------------------------------------------------
# og_metric_settings_update — write half; preserves unrelated keys
# ---------------------------------------------------------------------------

test_that("og_metric_settings_update writes changed keys and preserves the rest", {
  skip_if_not_installed("yaml")
  skip_if_not_installed("withr")
  root <- make_metric_project()

  og_metric_settings_update(
    root,
    "kri0001",
    list(Active = FALSE, Threshold = "-3,-2,2,3", GroupLevel = "Country")
  )

  # Re-read via the public helper: changes are reflected.
  ms <- og_metric_settings(root)
  kri <- ms[ms$metric == "kri0001", ]
  expect_false(kri$Active)
  expect_equal(kri$Threshold, "-3,-2,2,3")
  expect_equal(kri$GroupLevel, "Country")

  # Unrelated meta keys, spec, and steps are all preserved.
  y <- yaml::read_yaml(file.path(root, "workflows", "2_metrics", "kri0001.yaml"))
  expect_equal(y$meta$Type, "Analysis")
  expect_equal(y$meta$ID, "kri0001")
  expect_equal(y$meta$Metric, "Adverse Event Rate")
  expect_equal(y$meta$Flag, "-2,-1,0,1,2")
  expect_equal(y$spec$Mapped_AE$subjid$type, "character")
  expect_equal(y$steps[[1]]$name, "gsm.core::Foo")
})

test_that("og_metric_settings_update coerces Active to a scalar logical", {
  skip_if_not_installed("yaml")
  skip_if_not_installed("withr")
  root <- make_metric_project()

  og_metric_settings_update(root, "kri0001", list(Active = "TRUE"))
  y <- yaml::read_yaml(file.path(root, "workflows", "2_metrics", "kri0001.yaml"))
  expect_true(isTRUE(y$meta$Active))
})

test_that("og_metric_settings_update errors on unknown metric id", {
  skip_if_not_installed("yaml")
  skip_if_not_installed("withr")
  root <- make_metric_project()

  expect_error(
    og_metric_settings_update(root, "nope9999", list(Active = FALSE)),
    "No metric YAML"
  )
})

test_that("og_metric_settings_update rejects an unnamed values list", {
  skip_if_not_installed("yaml")
  skip_if_not_installed("withr")
  root <- make_metric_project()

  expect_error(
    og_metric_settings_update(root, "kri0001", list(FALSE)),
    "fully named"
  )
})

# ---------------------------------------------------------------------------
# og_settings_changes — write only what the user actually changed
# ---------------------------------------------------------------------------

test_that("og_settings_changes returns only the fields that differ", {
  current <- data.frame(
    metric = "kri0001", file = "f",
    Active = TRUE, Threshold = "-2,-1,2,3", GroupLevel = "Site",
    stringsAsFactors = FALSE
  )
  # Nothing changed -> empty.
  unchanged <- og_settings_changes(
    current,
    list(Active = TRUE, Threshold = "-2,-1,2,3", GroupLevel = "Site")
  )
  expect_length(unchanged, 0L)

  # Only Active flips.
  ch <- og_settings_changes(
    current,
    list(Active = FALSE, Threshold = "-2,-1,2,3", GroupLevel = "Site")
  )
  expect_equal(names(ch), "Active")
  expect_false(ch$Active)

  # Threshold change is detected despite whitespace differences.
  ch2 <- og_settings_changes(
    current,
    list(Active = TRUE, Threshold = " -3,-2,2,3 ", GroupLevel = "Site")
  )
  expect_equal(names(ch2), "Threshold")
})

test_that("og_settings_changes never injects fields the metric lacks", {
  # A metric with no Threshold/GroupLevel keys: the UI shows blank/"Site".
  current <- data.frame(
    metric = "kri0001", file = "f",
    Active = TRUE, Threshold = NA_character_, GroupLevel = NA_character_,
    stringsAsFactors = FALSE
  )
  # User touches nothing (UI defaults: Threshold "", GroupLevel "Site").
  ch <- og_settings_changes(
    current,
    list(Active = TRUE, Threshold = "", GroupLevel = "Site")
  )
  expect_length(ch, 0L)
})

test_that("og_settings_changes preserves a non-Site/Country GroupLevel", {
  # A qtl-style metric whose GroupLevel is "Study": the Site/Country selector
  # can't represent it, so it must never be written back (would corrupt to the
  # widget's fallback value).
  current <- data.frame(
    metric = "qtl0001", file = "f",
    Active = TRUE, Threshold = NA_character_, GroupLevel = "Study",
    stringsAsFactors = FALSE
  )
  # Widget fell back to "Site"; user only flipped Active.
  ch <- og_settings_changes(
    current,
    list(Active = FALSE, Threshold = "", GroupLevel = "Site")
  )
  expect_equal(names(ch), "Active")
  expect_false("GroupLevel" %in% names(ch))
})

# ---------------------------------------------------------------------------
# raw-YAML editor helpers
# ---------------------------------------------------------------------------

test_that("og_metric_yaml_text/write round-trip and reject invalid YAML", {
  skip_if_not_installed("yaml")
  skip_if_not_installed("withr")
  root <- make_metric_project()

  txt <- og_metric_yaml_text(root, "kri0001")
  expect_true(is.character(txt))
  expect_match(txt, "kri0001")

  # A valid edit is written and re-readable.
  edited <- sub("Site", "Country", txt, fixed = TRUE)
  og_metric_yaml_write(root, "kri0001", edited)
  ms <- og_metric_settings(root)
  expect_equal(ms$GroupLevel[ms$metric == "kri0001"], "Country")

  # Invalid YAML is rejected, original left intact.
  expect_error(
    og_metric_yaml_write(root, "kri0001", "meta: [unclosed"),
    NULL
  )
})

# ---------------------------------------------------------------------------
# og_read_reports — reports.json consumption
# ---------------------------------------------------------------------------

test_that("og_read_reports returns NULL when reports.json is absent", {
  skip_if_not_installed("withr")
  root <- withr::local_tempdir()
  expect_null(og_read_reports(root))
})

test_that("og_read_reports parses the reports.json contract", {
  skip_if_not_installed("jsonlite")
  skip_if_not_installed("withr")
  root <- withr::local_tempdir()
  mod_dir <- file.path(root, "output", "4_modules")
  dir.create(mod_dir, recursive = TRUE)

  payload <- list(
    reports = list(
      list(
        id = "report_kri_site",
        title = "Site KRI Report (interactive)",
        html = "output/4_modules/report_kri_site/kri_report_X.html",
        group_level = "Site"
      )
    ),
    static_charts = list(
      list(metric = "kri0001", title = "AE Rate", png = "output/4_modules/static/kri0001.png")
    )
  )
  jsonlite::write_json(
    payload,
    file.path(mod_dir, "reports.json"),
    auto_unbox = TRUE,
    pretty = TRUE
  )

  rd <- og_read_reports(root)
  expect_false(is.null(rd))
  expect_equal(length(rd$reports), 1L)
  expect_equal(rd$reports[[1]]$id, "report_kri_site")
  expect_equal(length(rd$static_charts), 1L)
  expect_equal(rd$static_charts[[1]]$metric, "kri0001")
})

# ---------------------------------------------------------------------------
# og_validation_failures — tolerant run gate
# ---------------------------------------------------------------------------

test_that("og_validation_failures flags failing domains and passes clean ones", {
  clean <- data.frame(
    domain = c("Raw_AE", "Raw_SUBJ"),
    status = c("ok", "ok"),
    problems = c("", ""),
    stringsAsFactors = FALSE
  )
  expect_equal(og_validation_failures(clean), character(0))

  # og_validate() emits "error" for a missing column and "missing" for an
  # absent file — the two blocking statuses.
  broken <- data.frame(
    domain = c("Raw_AE", "Raw_SUBJ"),
    status = c("ok", "error"),
    problems = c("", "missing column: subjid"),
    stringsAsFactors = FALSE
  )
  expect_equal(og_validation_failures(broken), "Raw_SUBJ")

  expect_equal(og_validation_failures(NULL), character(0))
})

test_that("og_validation_failures gates on blocking status only, not warnings", {
  # A warning-level domain whose message contains 'miss' must NOT block: this
  # is the forgiveness layer, and headless og_run() would run it fine. The old
  # substring gate wrongly failed this (the "missed_doses" column matched).
  warn <- data.frame(
    domain = "Raw_DOSE",
    status = "warning",
    problems = "type: missed_doses (2 value(s) not coercible to integer)",
    stringsAsFactors = FALSE
  )
  expect_equal(og_validation_failures(warn), character(0))

  # "missing" (absent file) and "error" (missing column) are the blocking
  # statuses; "warning"/"ok" are not.
  mixed <- data.frame(
    domain = c("Raw_A", "Raw_B", "Raw_C", "Raw_D"),
    status = c("missing", "error", "warning", "ok"),
    problems = c("file not found", "missing column: x", "type: y (...)", ""),
    stringsAsFactors = FALSE
  )
  expect_setequal(og_validation_failures(mixed), c("Raw_A", "Raw_B"))
})

test_that("og_metric_settings_update enforces the Threshold/Flag contract", {
  skip_if_not_installed("yaml")
  proj <- withr::local_tempdir()
  dir.create(file.path(proj, "workflows", "2_metrics"), recursive = TRUE)
  yaml::write_yaml(
    list(meta = list(
      Type = "Analysis", ID = "kri9999",
      Threshold = "-2,-1,2,3", Flag = "-2,-1,0,1,2"
    )),
    file.path(proj, "workflows", "2_metrics", "kri9999.yaml")
  )
  # mismatched: 2 thresholds vs 5 flags -> actionable error, file unchanged
  expect_error(
    og_metric_settings_update(proj, "kri9999", list(Threshold = "1,2")),
    "2 Threshold value\\(s\\) require 3 Flag value\\(s\\)"
  )
  y <- yaml::read_yaml(file.path(proj, "workflows", "2_metrics", "kri9999.yaml"))
  expect_identical(as.character(y$meta$Threshold), "-2,-1,2,3")
  # non-numeric threshold -> error
  expect_error(
    og_metric_settings_update(proj, "kri9999", list(Threshold = "a,b,c,d")),
    "comma-separated numbers"
  )
  # valid consistent update (4 thresholds + 5 flags) -> written
  og_metric_settings_update(
    proj, "kri9999",
    list(Threshold = "-1.5,-1,1.5,2")
  )
  y <- yaml::read_yaml(file.path(proj, "workflows", "2_metrics", "kri9999.yaml"))
  expect_identical(as.character(y$meta$Threshold), "-1.5,-1,1.5,2")
})
