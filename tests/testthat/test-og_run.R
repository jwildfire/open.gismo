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
