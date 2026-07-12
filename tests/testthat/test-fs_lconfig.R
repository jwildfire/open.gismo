# Tests for the filesystem-backed lConfig twin:
#   fs_lConfig() factory, fs_LoadData(), fs_SaveData(), and their helpers.
#
# These mirror the gh_lConfig / gh_LoadData / gh_SaveData tests, but exercise
# the local filesystem directly (tempdirs) instead of mocking a remote API.
# The workr::RunWorkflow round-trip lives in test-fs_roundtrip.R.

# ---------------------------------------------------------------------------
# fs_lConfig — factory returns correct structure
# ---------------------------------------------------------------------------

test_that("fs_lConfig returns a list with all required fields", {
  config <- fs_lConfig(
    project_dir = "/tmp/study",
    data_config = list(Raw_AE = "input/Raw_AE.csv")
  )

  expect_type(config, "list")
  expect_equal(config$project_dir, "/tmp/study")
  expect_equal(config$data_config, list(Raw_AE = "input/Raw_AE.csv"))
})

test_that("fs_lConfig includes LoadData and SaveData functions", {
  config <- fs_lConfig(project_dir = "/tmp/study")

  expect_true("LoadData" %in% names(config))
  expect_true("SaveData" %in% names(config))
  expect_type(config$LoadData, "closure")
  expect_type(config$SaveData, "closure")
  expect_identical(config$LoadData, fs_LoadData)
  expect_identical(config$SaveData, fs_SaveData)
})

test_that("fs_lConfig LoadData has the workr contract signature", {
  config <- fs_lConfig(project_dir = "/tmp/study")
  expect_equal(
    names(formals(config$LoadData)),
    c("lWorkflow", "lConfig", "lData")
  )
})

test_that("fs_lConfig SaveData has the workr contract signature", {
  config <- fs_lConfig(project_dir = "/tmp/study")
  expect_equal(
    names(formals(config$SaveData)),
    c("lWorkflow", "lConfig")
  )
})

test_that("fs_lConfig uses NULL data_config by default", {
  config <- fs_lConfig(project_dir = "/tmp/study")
  expect_null(config$data_config)
})

# ---------------------------------------------------------------------------
# fs_LoadData — reads spec domains from disk, parses CSV
# ---------------------------------------------------------------------------

test_that("fs_LoadData loads a single domain from disk and parses CSV", {
  skip_if_not_installed("withr")
  root <- withr::local_tempdir()
  dir.create(file.path(root, "input"))
  write.csv(
    data.frame(
      SubjectID = c("S001", "S002"),
      SiteID = c("Site01", "Site02"),
      Count = c(5L, 10L),
      stringsAsFactors = FALSE
    ),
    file.path(root, "input", "Raw_AE.csv"),
    row.names = FALSE
  )

  lWorkflow <- list(
    meta = list(Type = "Mapped", ID = "AE"),
    spec = list(Raw_AE = list(SubjectID = list(type = "character")))
  )
  lConfig <- fs_lConfig(root, data_config = list(Raw_AE = "input/Raw_AE.csv"))

  result <- fs_LoadData(lWorkflow, lConfig, list())

  expect_true("Raw_AE" %in% names(result))
  expect_s3_class(result$Raw_AE, "data.frame")
  expect_equal(nrow(result$Raw_AE), 2)
  expect_equal(ncol(result$Raw_AE), 3)
  expect_equal(result$Raw_AE$SubjectID, c("S001", "S002"))
})

test_that("fs_LoadData loads multiple domains from spec", {
  skip_if_not_installed("withr")
  root <- withr::local_tempdir()
  dir.create(file.path(root, "input"))
  write.csv(
    data.frame(SubjectID = c("S001", "S002")),
    file.path(root, "input", "Raw_AE.csv"),
    row.names = FALSE
  )
  write.csv(
    data.frame(SubjectID = c("S001", "S002"), SiteID = c("A", "B")),
    file.path(root, "input", "Raw_DM.csv"),
    row.names = FALSE
  )

  lWorkflow <- list(
    meta = list(Type = "Mapped", ID = "AE"),
    spec = list(
      Raw_AE = list(SubjectID = list(type = "character")),
      Raw_DM = list(SubjectID = list(type = "character"))
    )
  )
  lConfig <- fs_lConfig(
    root,
    data_config = list(
      Raw_AE = "input/Raw_AE.csv",
      Raw_DM = "input/Raw_DM.csv"
    )
  )

  result <- fs_LoadData(lWorkflow, lConfig, list())

  expect_true(all(c("Raw_AE", "Raw_DM") %in% names(result)))
  expect_equal(nrow(result$Raw_AE), 2)
  expect_equal(nrow(result$Raw_DM), 2)
})

test_that("fs_LoadData falls back to input/{domain}.csv when data_config is NULL", {
  skip_if_not_installed("withr")
  root <- withr::local_tempdir()
  dir.create(file.path(root, "input"))
  write.csv(
    data.frame(x = 1:3),
    file.path(root, "input", "Raw_SUBJ.csv"),
    row.names = FALSE
  )

  lWorkflow <- list(
    meta = list(Type = "Mapped", ID = "SUBJ"),
    spec = list(Raw_SUBJ = list(x = list(type = "integer")))
  )
  lConfig <- fs_lConfig(root) # NULL data_config -> convention

  result <- fs_LoadData(lWorkflow, lConfig, list())

  expect_true("Raw_SUBJ" %in% names(result))
  expect_equal(result$Raw_SUBJ$x, 1:3)
})

test_that("fs_LoadData preserves existing data and does not reload it", {
  skip_if_not_installed("withr")
  root <- withr::local_tempdir()
  dir.create(file.path(root, "input"))
  write.csv(
    data.frame(x = 99),
    file.path(root, "input", "Raw_AE.csv"),
    row.names = FALSE
  )

  lWorkflow <- list(
    meta = list(Type = "Mapped", ID = "AE"),
    spec = list(
      Raw_AE = list(x = list(type = "integer")),
      NewDomain = list(x = list(type = "integer"))
    )
  )
  dir.create(file.path(root, "input"), showWarnings = FALSE)
  write.csv(
    data.frame(x = 1:3),
    file.path(root, "input", "NewDomain.csv"),
    row.names = FALSE
  )
  lConfig <- fs_lConfig(root)

  # Raw_AE is already present upstream: it must be kept, not overwritten.
  upstream <- data.frame(x = c(-1, -2))
  lData <- list(Raw_AE = upstream)
  result <- fs_LoadData(lWorkflow, lConfig, lData)

  expect_equal(result$Raw_AE, upstream) # untouched
  expect_true("NewDomain" %in% names(result))
})

test_that("fs_LoadData returns lData unchanged when spec is NULL or empty", {
  lConfig <- fs_lConfig("/tmp/study")
  lData <- list(existing = data.frame(a = 1))

  wf_null <- list(meta = list(Type = "Mapped", ID = "AE"), spec = NULL)
  expect_equal(fs_LoadData(wf_null, lConfig, lData), lData)

  wf_empty <- list(meta = list(Type = "Mapped", ID = "AE"), spec = list())
  expect_equal(fs_LoadData(wf_empty, lConfig, lData), lData)
})

test_that("fs_LoadData warns and skips a domain whose file is missing", {
  skip_if_not_installed("withr")
  root <- withr::local_tempdir()

  lWorkflow <- list(
    meta = list(Type = "Mapped", ID = "AE"),
    spec = list(Raw_AE = list(x = list(type = "integer")))
  )
  lConfig <- fs_lConfig(root)

  result <- expect_warning(fs_LoadData(lWorkflow, lConfig, list()))
  expect_false("Raw_AE" %in% names(result))
})

test_that("fs_LoadData loads available domains even when one file is missing", {
  skip_if_not_installed("withr")
  root <- withr::local_tempdir()
  dir.create(file.path(root, "input"))
  write.csv(
    data.frame(SubjectID = "S001"),
    file.path(root, "input", "Raw_AE.csv"),
    row.names = FALSE
  )

  lWorkflow <- list(
    meta = list(Type = "Mapped", ID = "AE"),
    spec = list(
      Raw_AE = list(SubjectID = list(type = "character")),
      Raw_Missing = list(x = list(type = "integer"))
    )
  )
  lConfig <- fs_lConfig(root)

  result <- suppressWarnings(fs_LoadData(lWorkflow, lConfig, list()))
  expect_true("Raw_AE" %in% names(result))
  expect_false("Raw_Missing" %in% names(result))
})

test_that("fs_resolve_input_path honors absolute paths and the convention", {
  lConfig <- fs_lConfig("/tmp/study")
  expect_equal(
    fs_resolve_input_path("Raw_AE", lConfig),
    file.path("/tmp/study", "input", "Raw_AE.csv")
  )

  lConfig_abs <- fs_lConfig(
    "/tmp/study",
    data_config = list(Raw_AE = "/data/absolute/Raw_AE.csv")
  )
  expect_equal(
    fs_resolve_input_path("Raw_AE", lConfig_abs),
    "/data/absolute/Raw_AE.csv"
  )
})

# ---------------------------------------------------------------------------
# fs_SaveData — writes CSV under output/{phase}/{ID}/, merges status.json
# ---------------------------------------------------------------------------

test_that("fs_SaveData writes a data.frame to output/{phase}/{ID}/{name}.csv", {
  skip_if_not_installed("withr")
  root <- withr::local_tempdir()

  test_df <- data.frame(
    Name = c("Alice", "Bob"),
    Score = c(95L, 87L),
    stringsAsFactors = FALSE
  )
  lWorkflow <- list(
    meta = list(Type = "Mapped", ID = "DM"),
    steps = list(list(output = "Mapped_DM", name = "=")),
    lResult = test_df
  )
  lConfig <- fs_lConfig(root)

  fs_SaveData(lWorkflow, lConfig)

  out_path <- file.path(root, "output", "1_mappings", "DM", "Mapped_DM.csv")
  expect_true(file.exists(out_path))
  parsed <- read.csv(out_path, stringsAsFactors = FALSE)
  expect_equal(parsed$Name, c("Alice", "Bob"))
  expect_equal(parsed$Score, c(95L, 87L))
})

test_that("fs_SaveData maps meta Type to the correct phase directory", {
  skip_if_not_installed("withr")
  root <- withr::local_tempdir()
  lConfig <- fs_lConfig(root)

  cases <- list(
    list(type = "Mapped", id = "AE", phase = "1_mappings"),
    list(type = "Analysis", id = "kri0001", phase = "2_metrics"),
    list(type = "Reporting", id = "Groups", phase = "3_reporting"),
    list(type = "Report", id = "report_kri_site", phase = "4_modules")
  )

  for (case in cases) {
    lWorkflow <- list(
      meta = list(Type = case$type, ID = case$id),
      steps = list(list(output = "Out", name = "=")),
      lResult = data.frame(x = 1:2)
    )
    fs_SaveData(lWorkflow, lConfig)
    expect_true(
      file.exists(file.path(root, "output", case$phase, case$id, "Out.csv")),
      info = case$type
    )
  }
})

test_that("fs_SaveData saves a named list of result artifacts", {
  skip_if_not_installed("withr")
  root <- withr::local_tempdir()

  lWorkflow <- list(
    meta = list(Type = "Analysis", ID = "kri0001"),
    lResult = list(
      Analysis_Input = data.frame(x = 1:3),
      Analysis_Summary = data.frame(y = 4:6)
    )
  )
  lConfig <- fs_lConfig(root)

  fs_SaveData(lWorkflow, lConfig)

  base <- file.path(root, "output", "2_metrics", "kri0001")
  expect_true(file.exists(file.path(base, "Analysis_Input.csv")))
  expect_true(file.exists(file.path(base, "Analysis_Summary.csv")))
})

test_that("fs_SaveData handles empty and NULL lResult gracefully", {
  skip_if_not_installed("withr")
  root <- withr::local_tempdir()
  lConfig <- fs_lConfig(root)

  wf_empty <- list(meta = list(Type = "Mapped", ID = "AE"), lResult = list())
  expect_no_error(fs_SaveData(wf_empty, lConfig))

  wf_null <- list(meta = list(Type = "Mapped", ID = "AE"), lResult = NULL)
  expect_no_error(fs_SaveData(wf_null, lConfig))

  # Nothing should have been written.
  expect_false(dir.exists(file.path(root, "output")))
  expect_false(file.exists(file.path(root, "status.json")))
})

test_that("fs_SaveData merges status.json across two workflows (no overwrite)", {
  skip_if_not_installed("withr")
  skip_if_not_installed("jsonlite")
  root <- withr::local_tempdir()
  lConfig <- fs_lConfig(root)

  fs_SaveData(
    list(
      meta = list(Type = "Mapped", ID = "AE"),
      steps = list(list(output = "Mapped_AE", name = "=")),
      lResult = data.frame(x = 1:2)
    ),
    lConfig
  )
  fs_SaveData(
    list(
      meta = list(Type = "Analysis", ID = "kri0001"),
      steps = list(list(output = "Analysis_kri0001", name = "=")),
      lResult = data.frame(y = 1:2)
    ),
    lConfig
  )

  status <- jsonlite::fromJSON(
    file.path(root, "status.json"),
    simplifyVector = FALSE
  )
  expect_true(all(
    c("Mapped_AE", "Analysis_kri0001") %in% names(status$workflows)
  ))
  expect_equal(status$workflows$Mapped_AE$workflow_id, "AE")
  expect_equal(status$workflows$Mapped_AE$phase, "1_mappings")
  expect_equal(status$workflows$Analysis_kri0001$phase, "2_metrics")
})

test_that("fs_SaveData status entries carry a `steps` array (site-compatible shape)", {
  skip_if_not_installed("withr")
  skip_if_not_installed("jsonlite")
  root <- withr::local_tempdir()
  lConfig <- fs_lConfig(root)

  fs_SaveData(
    list(
      meta = list(Type = "Mapped", ID = "AE"),
      steps = list(list(output = "Mapped_AE", name = "=")),
      lResult = data.frame(x = 1:2)
    ),
    lConfig
  )

  status <- jsonlite::fromJSON(
    file.path(root, "status.json"),
    simplifyVector = FALSE
  )
  entry <- status$workflows$Mapped_AE
  # The SPA (and og_write_status_json) consume `steps`, never `artifacts`.
  expect_null(entry$artifacts)
  expect_true(length(entry$steps) >= 1L)
  step <- entry$steps[[1]]
  expect_equal(step$output, "Mapped_AE")
  expect_equal(step$name, "=")
  expect_equal(step$status, "completed")
})

test_that("fs_build_steps names each saved artifact by its declared step", {
  wf <- list(
    steps = list(
      list(output = "Analysis_Input", name = "gsm.core::Input"),
      list(output = "Analysis_Summary", name = "gsm.core::Summarize")
    )
  )
  out <- fs_build_steps(wf, c("Analysis_Input", "Analysis_Summary"))
  expect_equal(length(out), 2L)
  expect_equal(out[[1]]$name, "gsm.core::Input")
  expect_equal(out[[2]]$name, "gsm.core::Summarize")
  expect_true(all(vapply(out, function(s) s$status == "completed", logical(1))))

  # No steps declared -> falls back to "=" for every artifact.
  expect_equal(fs_build_steps(list(), "X")[[1]]$name, "=")
})

# ---------------------------------------------------------------------------
# helpers — fs_phase_dir, fs_normalize_results
# ---------------------------------------------------------------------------

test_that("fs_phase_dir maps known types and falls back for unknown", {
  expect_equal(fs_phase_dir("Mapped"), "1_mappings")
  expect_equal(fs_phase_dir("Analysis"), "2_metrics")
  expect_equal(fs_phase_dir("Reporting"), "3_reporting")
  expect_equal(fs_phase_dir("Report"), "4_modules")
  # Aliases from the spec's suggested naming.
  expect_equal(fs_phase_dir("Mapping"), "1_mappings")
  expect_equal(fs_phase_dir("Metric"), "2_metrics")
  expect_equal(fs_phase_dir("Module"), "4_modules")
  # Unknown / empty.
  expect_equal(fs_phase_dir("Custom"), "Custom")
  expect_equal(fs_phase_dir(NULL), "output")
  expect_equal(fs_phase_dir(""), "output")
})

test_that("fs_normalize_results names a single data.frame by final step output", {
  wf <- list(
    meta = list(Type = "Mapped", ID = "AE"),
    steps = list(
      list(output = "Intermediate", name = "gsm.core::RunQuery"),
      list(output = "Mapped_AE", name = "=")
    ),
    lResult = data.frame(x = 1:2)
  )
  out <- fs_normalize_results(wf)
  expect_equal(names(out), "Mapped_AE")
  expect_s3_class(out$Mapped_AE, "data.frame")
})

test_that("fs_normalize_results falls back to meta ID when no steps", {
  wf <- list(
    meta = list(Type = "Mapped", ID = "AE"),
    lResult = data.frame(x = 1:2)
  )
  out <- fs_normalize_results(wf)
  expect_equal(names(out), "AE")
})

test_that("fs_normalize_results passes a named list through unchanged", {
  wf <- list(
    meta = list(Type = "Analysis", ID = "kri0001"),
    lResult = list(A = data.frame(x = 1), B = data.frame(y = 2))
  )
  out <- fs_normalize_results(wf)
  expect_equal(names(out), c("A", "B"))
})

test_that("fs_normalize_results returns empty list for NULL result", {
  wf <- list(meta = list(Type = "Mapped", ID = "AE"), lResult = NULL)
  expect_equal(fs_normalize_results(wf), list())
})
