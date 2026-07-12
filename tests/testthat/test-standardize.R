# Tests for StandardizeResults() — the GroupID seam between the metrics and
# reporting phases.

test_that("StandardizeResults coerces GroupID to character in nested results", {
  lAnalyzed <- list(
    Analysis_kri0001 = list(
      Analysis_Summary = data.frame(GroupID = c(101L, 102L), Metric = c(0.1, 0.2)),
      Analysis_Flagged = data.frame(GroupID = c(101L, 102L), Flag = c(0L, 1L))
    ),
    Analysis_cou0001 = list(
      Analysis_Summary = data.frame(
        GroupID = c("US", "CA"),
        Metric = c(0.3, 0.4),
        stringsAsFactors = FALSE
      )
    )
  )

  out <- StandardizeResults(lAnalyzed)

  expect_type(out$Analysis_kri0001$Analysis_Summary$GroupID, "character")
  expect_type(out$Analysis_kri0001$Analysis_Flagged$GroupID, "character")
  expect_type(out$Analysis_cou0001$Analysis_Summary$GroupID, "character")
  expect_equal(out$Analysis_kri0001$Analysis_Summary$GroupID, c("101", "102"))
  # Already-character values are unchanged
  expect_equal(out$Analysis_cou0001$Analysis_Summary$GroupID, c("US", "CA"))
  # Other columns untouched
  expect_equal(out$Analysis_kri0001$Analysis_Summary$Metric, c(0.1, 0.2))
})

test_that("StandardizeResults handles top-level data.frames and mixed content", {
  lAnalyzed <- list(
    Analysis_x = data.frame(GroupID = 1:3),
    Analysis_y = list(
      Analysis_Summary = data.frame(NoGroup = 1:2), # no GroupID column
      ID = "y", # non-data.frame element preserved
      vThreshold = c(-2, -1, 2, 3)
    )
  )

  out <- StandardizeResults(lAnalyzed)

  expect_type(out$Analysis_x$GroupID, "character")
  expect_equal(out$Analysis_y$Analysis_Summary$NoGroup, 1:2)
  expect_equal(out$Analysis_y$ID, "y")
  expect_equal(out$Analysis_y$vThreshold, c(-2, -1, 2, 3))
})

test_that("StandardizeResults handles empty and NULL input", {
  expect_null(StandardizeResults(NULL))
  expect_equal(StandardizeResults(list()), list())
  expect_error(StandardizeResults("not a list"), "must be a list")
})

test_that("the packaged standardize workflow parses and standardizes via workr", {
  skip_if_not_installed("workr")
  skip_if_not_installed("yaml")

  wf_dir <- .og_standardize_wf_dir()
  skip_if(!nzchar(wf_dir), "standardize workflow YAML not found")

  # The YAML is a valid workr workflow referencing the exported step function
  std_wf <- workr::MakeWorkflowList(strPath = wf_dir)
  expect_length(std_wf, 1L)
  expect_equal(std_wf[[1]]$meta$ID, "standardize")
  expect_equal(std_wf[[1]]$steps[[1]]$name, "open.gismo::StandardizeResults")
  expect_equal(std_wf[[1]]$steps[[1]]$output, "lAnalyzed")

  lAnalyzed <- list(
    Analysis_kri0001 = list(
      Analysis_Summary = data.frame(GroupID = c(1L, 2L))
    )
  )

  # .og_standardize_analyzed runs the workflow step; before the package is
  # installed with a regenerated NAMESPACE (integrator runs document()),
  # workr cannot resolve `open.gismo::StandardizeResults` and the helper
  # falls back to the direct call with a warning. Either path must produce
  # the standardized result.
  out <- suppressWarnings(suppressMessages(.og_standardize_analyzed(lAnalyzed)))
  expect_type(out$Analysis_kri0001$Analysis_Summary$GroupID, "character")
  expect_equal(out$Analysis_kri0001$Analysis_Summary$GroupID, c("1", "2"))
})
