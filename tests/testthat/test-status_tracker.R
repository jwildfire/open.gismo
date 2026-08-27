# Tests for status_tracker.R — execution status recording and status.json building
# RED phase: these tests should all fail because the functions don't exist yet.
#
# Validates: Requirements 3.6, 20.1, 20.2

# ---------------------------------------------------------------------------
# record_step_status — creates a step status entry
# ---------------------------------------------------------------------------

test_that("record_step_status records a completed step with NULL error", {
  result <- record_step_status(
    step_name = "gsm.mapping::AE_Map_Raw",
    output_name = "Mapped_AE",
    status = "completed"
  )

  expect_equal(result$name, "gsm.mapping::AE_Map_Raw")
  expect_equal(result$output, "Mapped_AE")
  expect_equal(result$status, "completed")
  expect_null(result$error)
})

test_that("record_step_status records a failed step with error message", {
  result <- record_step_status(
    step_name = "gsm.core::Analyze_NormalApprox",
    output_name = "Analysis_Summary",
    status = "failed",
    error = "Error in Analyze_NormalApprox: insufficient data"
  )

  expect_equal(result$name, "gsm.core::Analyze_NormalApprox")
  expect_equal(result$output, "Analysis_Summary")
  expect_equal(result$status, "failed")
  expect_equal(result$error, "Error in Analyze_NormalApprox: insufficient data")
})

test_that("record_step_status records a not_run step with NULL error", {
  result <- record_step_status(
    step_name = "gsm.core::Flag_NormalApprox",
    output_name = "Flagged_Summary",
    status = "not_run"
  )

  expect_equal(result$name, "gsm.core::Flag_NormalApprox")
  expect_equal(result$output, "Flagged_Summary")
  expect_equal(result$status, "not_run")
  expect_null(result$error)
})

# ---------------------------------------------------------------------------
# build_status_json — constructs status.json structure from workflow results
# ---------------------------------------------------------------------------

test_that("build_status_json builds correct structure for all-completed workflows", {
  workflow_results <- list(
    Mapping_AE = list(
      workflow_id = "AE",
      workflow_type = "Mapping",
      status = "completed",
      steps = list(
        record_step_status("gsm.mapping::AE_Map_Raw", "Mapped_AE", "completed")
      )
    )
  )

  result <- build_status_json("ps-001", workflow_results)

  expect_equal(result$snapshot_id, "ps-001")
  expect_equal(result$pipeline_status, "completed")
  expect_true("Mapping_AE" %in% names(result$workflows))
  expect_equal(result$workflows$Mapping_AE$workflow_id, "AE")
  expect_equal(result$workflows$Mapping_AE$workflow_type, "Mapping")
  expect_equal(result$workflows$Mapping_AE$status, "completed")
  expect_length(result$workflows$Mapping_AE$steps, 1)
})

test_that("build_status_json sets pipeline_status to 'failed' when all workflows fail", {
  workflow_results <- list(
    Metric_kri0001 = list(
      workflow_id = "kri0001",
      workflow_type = "Metric",
      status = "failed",
      steps = list(
        record_step_status(
          "gsm.core::Input_Rate",
          "Analysis_Input",
          "completed"
        ),
        record_step_status(
          "gsm.core::Analyze_NormalApprox",
          "Analysis_Summary",
          "failed",
          error = "Error in Analyze_NormalApprox: insufficient data"
        )
      )
    )
  )

  result <- build_status_json("ps-001", workflow_results)

  expect_equal(result$pipeline_status, "failed")
  expect_equal(result$workflows$Metric_kri0001$status, "failed")
  expect_length(result$workflows$Metric_kri0001$steps, 2)
  expect_equal(result$workflows$Metric_kri0001$steps[[1]]$status, "completed")
  expect_equal(result$workflows$Metric_kri0001$steps[[2]]$status, "failed")
  expect_equal(
    result$workflows$Metric_kri0001$steps[[2]]$error,
    "Error in Analyze_NormalApprox: insufficient data"
  )
})

test_that("build_status_json sets pipeline_status to 'partial' for mixed results", {
  workflow_results <- list(
    Mapping_AE = list(
      workflow_id = "AE",
      workflow_type = "Mapping",
      status = "completed",
      steps = list(
        record_step_status("gsm.mapping::AE_Map_Raw", "Mapped_AE", "completed")
      )
    ),
    Metric_kri0001 = list(
      workflow_id = "kri0001",
      workflow_type = "Metric",
      status = "failed",
      steps = list(
        record_step_status(
          "gsm.core::Input_Rate",
          "Analysis_Input",
          "completed"
        ),
        record_step_status(
          "gsm.core::Analyze_NormalApprox",
          "Analysis_Summary",
          "failed",
          error = "Error in Analyze_NormalApprox: insufficient data"
        )
      )
    )
  )

  result <- build_status_json("ps-001", workflow_results)

  expect_equal(result$snapshot_id, "ps-001")
  expect_equal(result$pipeline_status, "partial")
  expect_length(result$workflows, 2)
  expect_equal(result$workflows$Mapping_AE$status, "completed")
  expect_equal(result$workflows$Metric_kri0001$status, "failed")
})

# ---------------------------------------------------------------------------
# Subsequent workflows execute after a step failure
# ---------------------------------------------------------------------------

test_that("build_status_json records all workflows even when earlier ones fail", {
  # Simulates a pipeline where workflow 1 fails but workflow 2 still executes
  workflow_results <- list(
    Metric_kri0001 = list(
      workflow_id = "kri0001",
      workflow_type = "Metric",
      status = "failed",
      steps = list(
        record_step_status(
          "gsm.core::Input_Rate",
          "Analysis_Input",
          "completed"
        ),
        record_step_status(
          "gsm.core::Analyze_NormalApprox",
          "Analysis_Summary",
          "failed",
          error = "Error: insufficient data"
        )
      )
    ),
    Metric_kri0002 = list(
      workflow_id = "kri0002",
      workflow_type = "Metric",
      status = "completed",
      steps = list(
        record_step_status(
          "gsm.core::Input_Rate",
          "Analysis_Input",
          "completed"
        ),
        record_step_status(
          "gsm.core::Analyze_NormalApprox",
          "Analysis_Summary",
          "completed"
        )
      )
    ),
    Reporting_summary = list(
      workflow_id = "summary",
      workflow_type = "Reporting",
      status = "completed",
      steps = list(
        record_step_status(
          "gsm.reporting::Build_Report",
          "Report_Output",
          "completed"
        )
      )
    )
  )

  result <- build_status_json("ps-002", workflow_results)

  # All three workflows should be present — failure in kri0001 doesn't block others
  expect_length(result$workflows, 3)
  expect_equal(result$workflows$Metric_kri0001$status, "failed")
  expect_equal(result$workflows$Metric_kri0002$status, "completed")
  expect_equal(result$workflows$Reporting_summary$status, "completed")

  # Pipeline status should be "partial" since there's a mix
  expect_equal(result$pipeline_status, "partial")
})

test_that("build_status_json preserves step order within each workflow", {
  workflow_results <- list(
    Metric_kri0001 = list(
      workflow_id = "kri0001",
      workflow_type = "Metric",
      status = "failed",
      steps = list(
        record_step_status(
          "gsm.core::Input_Rate",
          "Analysis_Input",
          "completed"
        ),
        record_step_status(
          "gsm.core::Analyze_NormalApprox",
          "Analysis_Summary",
          "failed",
          error = "Error: insufficient data"
        ),
        record_step_status(
          "gsm.core::Flag_NormalApprox",
          "Flagged_Summary",
          "not_run"
        )
      )
    )
  )

  result <- build_status_json("ps-001", workflow_results)

  steps <- result$workflows$Metric_kri0001$steps
  expect_length(steps, 3)
  expect_equal(steps[[1]]$name, "gsm.core::Input_Rate")
  expect_equal(steps[[1]]$status, "completed")
  expect_equal(steps[[2]]$name, "gsm.core::Analyze_NormalApprox")
  expect_equal(steps[[2]]$status, "failed")
  expect_equal(steps[[3]]$name, "gsm.core::Flag_NormalApprox")
  expect_equal(steps[[3]]$status, "not_run")
})
