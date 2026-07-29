# Tests for og_run(): argument/precondition checks (fast, always run) plus a
# guarded mini integration test that runs the mappings phase on two domains.
# The full 4-phase pipeline is exercised in integration, not here.

test_that("og_run errors clearly on a missing or non-project folder", {
  expect_error(
    og_run(file.path(tempdir(), "does-not-exist-og-run")),
    "og_init"
  )

  proj <- withr::local_tempdir() # exists, but has no workflows/
  expect_error(og_run(proj), "workflows/")
})

test_that("og_run validates the steps argument", {
  proj <- withr::local_tempdir()
  dir.create(file.path(proj, "workflows"))

  expect_error(og_run(proj, steps = "nope"), "Unknown steps")
  expect_error(og_run(proj, steps = character(0)), "non-empty")
  # Later phases need earlier phases' in-memory results: prefix rule
  expect_error(og_run(proj, steps = "reporting"), "prefix")
  expect_error(og_run(proj, steps = c("mappings", "reporting")), "prefix")
})

test_that(".og_check_run_steps orders and accepts valid prefixes", {
  expect_equal(.og_check_run_steps("mappings"), "mappings")
  expect_equal(
    .og_check_run_steps(c("metrics", "mappings")),
    c("mappings", "metrics")
  )
  expect_equal(
    .og_check_run_steps(c("mappings", "metrics", "reporting", "reports")),
    c("mappings", "metrics", "reporting", "reports")
  )
})

test_that("og_run runs the mappings phase end-to-end on two domains", {
  skip_if_not_installed("workr")
  skip_if_not_installed("yaml")
  skip_if_not_installed("gsm.core")
  skip_if_not_installed("gsm.mapping")

  wf_src <- system.file("workflow", "1_mappings", package = "gsm.mapping")
  skip_if(!nzchar(wf_src), "gsm.mapping workflows not found")

  # Minimal project: two mapping workflows (AE = passthrough, SUBJ = query)
  # and their raw inputs from gsm.core::lSource.
  proj <- withr::local_tempdir()
  wf_dir <- file.path(proj, "workflows", "1_mappings")
  dir.create(wf_dir, recursive = TRUE)
  for (id in c("AE", "SUBJ")) {
    file.copy(file.path(wf_src, paste0(id, ".yaml")), wf_dir)
  }
  input_dir <- file.path(proj, "input")
  dir.create(input_dir)
  write.csv(
    gsm.core::lSource$Raw_AE,
    file.path(input_dir, "Raw_AE.csv"),
    row.names = FALSE
  )
  write.csv(
    gsm.core::lSource$Raw_SUBJ,
    file.path(input_dir, "Raw_SUBJ.csv"),
    row.names = FALSE
  )

  res <- og_run(proj, steps = "mappings", quiet = TRUE)

  # Returned structure
  expect_equal(res$steps, "mappings")
  expect_true(all(c("input", "mappings", "payload", "total") %in% names(res$timings)))
  expect_gte(res$counts[["mapped"]], 2)

  # Demo-layout outputs on disk
  expect_true(file.exists(
    file.path(proj, "output", "1_mappings", "AE", "Mapped_AE.csv")
  ))
  expect_true(file.exists(
    file.path(proj, "output", "1_mappings", "SUBJ", "Mapped_SUBJ.csv")
  ))
  mapped_ae <- read.csv(
    file.path(proj, "output", "1_mappings", "AE", "Mapped_AE.csv"),
    stringsAsFactors = FALSE
  )
  expect_gt(nrow(mapped_ae), 0)

  # Payload files regenerated
  expect_true(file.exists(file.path(proj, "_index.json")))
  expect_true(file.exists(file.path(proj, "status.json")))
  expect_true(file.exists(file.path(proj, "manifest.csv")))
  expect_true(file.exists(file.path(proj, "output", "4_modules", "reports.json")))

  status <- jsonlite::fromJSON(file.path(proj, "status.json"), simplifyVector = FALSE)
  expect_equal(status$workflows$Mapped_AE$status, "completed")
  expect_equal(status$workflows$Mapped_SUBJ$status, "completed")

  # reports.json has the empty-state shape (no modules ran)
  reports <- jsonlite::fromJSON(
    file.path(proj, "output", "4_modules", "reports.json"),
    simplifyVector = FALSE
  )
  expect_length(reports$reports, 0L)
})

test_that(".og_filter_active drops only metrics with meta Active: false", {
  wfs <- list(
    a = list(meta = list(ID = "a", Active = TRUE)),
    b = list(meta = list(ID = "b", Active = FALSE)),
    c = list(meta = list(ID = "c")) # no Active key -> active by default
  )
  kept <- .og_filter_active(wfs)
  expect_named(kept, c("a", "c"))
})

test_that(".og_clean_phase_dir removes stale artifacts for a rerun phase", {
  proj <- withr::local_tempdir()
  paths <- list(output = file.path(proj, "output"))
  stale <- file.path(paths$output, "2_metrics", "kri9999")
  dir.create(stale, recursive = TRUE)
  writeLines("x", file.path(stale, "Analysis_Summary.csv"))
  .og_clean_phase_dir(paths, "2_metrics")
  expect_true(dir.exists(file.path(paths$output, "2_metrics")))
  expect_false(dir.exists(stale))
})

# ---------------------------------------------------------------------------
# Snapshot date: derived from the data cut, not from the clock
# ---------------------------------------------------------------------------

test_that(".og_snapshot_date reads the newest date in the raw data", {
  lRaw <- list(
    Raw_LB = data.frame(
      subjid = c("A", "B"),
      lb_dt = c("2012-03-01", "2012-03-29"),
      lbstresn = c(1, 2),
      stringsAsFactors = FALSE
    ),
    Raw_SUBJ = data.frame(
      subjid = c("A", "B"),
      enrolldt = c("2012-01-04", "2012-02-11"),
      stringsAsFactors = FALSE
    )
  )
  expect_equal(.og_snapshot_date(lRaw), as.Date("2012-03-29"))
})

test_that(".og_snapshot_date ignores non-date columns and unparseable values", {
  lRaw <- list(
    Raw_AE = data.frame(
      # A free-text column that happens to be named like one, and values that
      # are not dates, must not become the snapshot date.
      aeterm = c("headache", "9999-99-99"),
      aest_dt = c("2012-02-02", "not a date"),
      stringsAsFactors = FALSE
    )
  )
  expect_equal(.og_snapshot_date(lRaw), as.Date("2012-02-02"))
})

test_that(".og_snapshot_date falls back to today when the data carries no dates", {
  lRaw <- list(Raw_X = data.frame(a = 1:2, b = c("x", "y"), stringsAsFactors = FALSE))
  expect_equal(.og_snapshot_date(lRaw), Sys.Date())
})

test_that(".og_snapshot_date honours an explicit override", {
  lRaw <- list(Raw_LB = data.frame(lb_dt = "2012-03-29", stringsAsFactors = FALSE))
  expect_equal(.og_snapshot_date(lRaw, "2020-06-01"), as.Date("2020-06-01"))
  expect_error(.og_snapshot_date(lRaw, "nonsense"), "snapshot_date")
})

# ---------------------------------------------------------------------------
# Longitudinal history: prior results accumulate across runs
# ---------------------------------------------------------------------------

test_that(".og_load_history returns NULL when there is no history", {
  proj <- withr::local_tempdir()
  paths <- og_project_paths(proj)
  expect_null(.og_load_history(paths))
})

test_that(".og_load_history binds prior snapshots oldest-first", {
  proj <- withr::local_tempdir()
  paths <- og_project_paths(proj)
  dir.create(paths$history, recursive = TRUE)
  mk <- function(date, score) {
    data.frame(
      StudyID = "S", GroupLevel = "Site", GroupID = "SITE1",
      MetricID = "Analysis_kri0001", SnapshotDate = date,
      Numerator = 1, Denominator = 2, Metric = 0.5, Score = score, Flag = 0,
      stringsAsFactors = FALSE
    )
  }
  # Written newest-first on purpose: the loader must not rely on file order,
  # because CalculateChange lags by row order within a group.
  write.csv(mk("2012-04-26", 2), file.path(paths$history, "b.csv"), row.names = FALSE)
  write.csv(mk("2012-03-29", 1), file.path(paths$history, "a.csv"), row.names = FALSE)

  hist <- .og_load_history(paths)
  expect_equal(nrow(hist), 2L)
  # A Date, not a string: CalculateChange() binds this to the current snapshot,
  # whose SnapshotDate is already a Date.
  expect_equal(hist$SnapshotDate, as.Date(c("2012-03-29", "2012-04-26")))
})

test_that(".og_archive_results writes one file per snapshot date and is idempotent", {
  proj <- withr::local_tempdir()
  paths <- og_project_paths(proj)
  df <- data.frame(
    StudyID = "S", GroupLevel = "Site", GroupID = "SITE1",
    MetricID = "Analysis_kri0001", SnapshotDate = "2012-03-29",
    Numerator = 1, Denominator = 2, Metric = 0.5, Score = 1, Flag = 0,
    stringsAsFactors = FALSE
  )
  .og_archive_results(df, paths)
  .og_archive_results(df, paths)
  files <- list.files(paths$history, pattern = "\\.csv$")
  expect_equal(files, "Reporting_Results_2012-03-29.csv")

  back <- .og_load_history(paths)
  expect_equal(nrow(back), 1L)
})

test_that(".og_archive_results keeps only the reporting-results contract columns", {
  proj <- withr::local_tempdir()
  paths <- og_project_paths(proj)
  df <- data.frame(
    StudyID = "S", GroupLevel = "Site", GroupID = "SITE1",
    MetricID = "Analysis_kri0001", SnapshotDate = "2012-03-29",
    Numerator = 1, Denominator = 2, Metric = 0.5, Score = 1, Flag = 0,
    # A change column from a previous CalculateChange run: archiving it would
    # feed derived values back into the next comparison.
    Score_Change = 99,
    stringsAsFactors = FALSE
  )
  .og_archive_results(df, paths)
  back <- .og_load_history(paths)
  expect_false("Score_Change" %in% names(back))
  expect_true(all(
    c("StudyID", "GroupLevel", "GroupID", "MetricID", "SnapshotDate") %in% names(back)
  ))
})

test_that("og_project_paths exposes the history directory", {
  paths <- og_project_paths(file.path(tempdir(), "proj"))
  expect_equal(basename(paths$history), "history")
})
