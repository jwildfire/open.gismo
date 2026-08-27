# Tests for activation_status.R — display_activation_status()

# ---------------------------------------------------------------------------
# Return value structure
# ---------------------------------------------------------------------------

test_that("display_activation_status returns a data.frame with expected columns (#9)", {
  wfs <- list(
    list(ID = "kri0001", Active = TRUE, GenerateRiskSignal = TRUE)
  )
  result <- suppressMessages(display_activation_status(wfs))
  expect_s3_class(result, "data.frame")
  expect_named(result, c("id", "active", "generate_risk_signal"))
})

test_that("display_activation_status returns one row per workflow (#9)", {
  wfs <- list(
    list(ID = "kri0001", Active = TRUE, GenerateRiskSignal = TRUE),
    list(ID = "kri0002", Active = FALSE, GenerateRiskSignal = TRUE),
    list(ID = "kri0003", Active = TRUE, GenerateRiskSignal = FALSE)
  )
  result <- suppressMessages(display_activation_status(wfs))
  expect_equal(nrow(result), 3L)
})

# ---------------------------------------------------------------------------
# Activation field defaults
# ---------------------------------------------------------------------------

test_that("Active defaults to TRUE when field is absent (#9)", {
  wfs <- list(list(ID = "kri0001"))
  result <- suppressMessages(display_activation_status(wfs))
  expect_true(result$active[[1]])
})

test_that("GenerateRiskSignal defaults to TRUE when field is absent (#9)", {
  wfs <- list(list(ID = "kri0001"))
  result <- suppressMessages(display_activation_status(wfs))
  expect_true(result$generate_risk_signal[[1]])
})

test_that("Active = FALSE is recorded correctly (#9)", {
  wfs <- list(list(ID = "kri0001", Active = FALSE))
  result <- suppressMessages(display_activation_status(wfs))
  expect_false(result$active[[1]])
})

test_that("GenerateRiskSignal = FALSE is recorded correctly (#9)", {
  wfs <- list(list(ID = "kri0001", Active = TRUE, GenerateRiskSignal = FALSE))
  result <- suppressMessages(display_activation_status(wfs))
  expect_true(result$active[[1]])
  expect_false(result$generate_risk_signal[[1]])
})

# ---------------------------------------------------------------------------
# Console output messages
# ---------------------------------------------------------------------------

test_that("ACTIVE label is logged for an active metric with risk signal enabled (#9)", {
  wfs <- list(list(ID = "kri0001", Active = TRUE, GenerateRiskSignal = TRUE))
  msgs <- capture.output(
    display_activation_status(wfs, verbose = FALSE),
    type = "message"
  )
  expect_true(any(grepl("ACTIVE", msgs)))
  expect_false(any(grepl("INACTIVE|MONITORING", msgs)))
})

test_that("INACTIVE label is logged for a metric with Active = FALSE (#9)", {
  wfs <- list(list(ID = "kri0001", Active = FALSE, GenerateRiskSignal = TRUE))
  msgs <- capture.output(
    display_activation_status(wfs, verbose = FALSE),
    type = "message"
  )
  expect_true(any(grepl("INACTIVE", msgs)))
})

test_that("MONITORING ONLY label is logged when Active is TRUE but GenerateRiskSignal is FALSE (#9)", {
  wfs <- list(list(ID = "kri0001", Active = TRUE, GenerateRiskSignal = FALSE))
  msgs <- capture.output(
    display_activation_status(wfs, verbose = FALSE),
    type = "message"
  )
  expect_true(any(grepl("MONITORING ONLY", msgs)))
  expect_false(any(grepl("INACTIVE", msgs)))
})

test_that("metric ID appears in log output (#9)", {
  wfs <- list(list(ID = "kri0042", Active = TRUE, GenerateRiskSignal = TRUE))
  msgs <- capture.output(
    display_activation_status(wfs, verbose = FALSE),
    type = "message"
  )
  expect_true(any(grepl("kri0042", msgs)))
})

test_that("INACTIVE takes precedence over MONITORING ONLY in log output (#9)", {
  wfs <- list(list(ID = "kri0001", Active = FALSE, GenerateRiskSignal = FALSE))
  msgs <- capture.output(
    display_activation_status(wfs, verbose = FALSE),
    type = "message"
  )
  expect_true(any(grepl("INACTIVE", msgs)))
  expect_false(any(grepl("MONITORING", msgs)))
})

# ---------------------------------------------------------------------------
# Summary line
# ---------------------------------------------------------------------------

test_that("verbose = TRUE prints a summary line with counts (#9)", {
  wfs <- list(
    list(ID = "kri0001", Active = TRUE, GenerateRiskSignal = TRUE),
    list(ID = "kri0002", Active = FALSE, GenerateRiskSignal = TRUE),
    list(ID = "kri0003", Active = TRUE, GenerateRiskSignal = FALSE)
  )
  msgs <- capture.output(
    display_activation_status(wfs, verbose = TRUE),
    type = "message"
  )
  summary_line <- msgs[grepl("Activation summary", msgs)]
  expect_length(summary_line, 1L)
})

test_that("verbose = FALSE suppresses the summary line (#9)", {
  wfs <- list(list(ID = "kri0001"))
  msgs <- capture.output(
    display_activation_status(wfs, verbose = FALSE),
    type = "message"
  )
  expect_false(any(grepl("Activation summary", msgs)))
})

# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

test_that("empty workflow list returns empty data.frame and messages gracefully (#9)", {
  result <- suppressMessages(display_activation_status(list()))
  expect_s3_class(result, "data.frame")
  expect_equal(nrow(result), 0L)
})

test_that("missing ID field falls back to (unknown) in output (#9)", {
  wfs <- list(list(Active = TRUE))
  result <- suppressMessages(display_activation_status(wfs))
  expect_equal(result$id[[1]], "(unknown)")
})
