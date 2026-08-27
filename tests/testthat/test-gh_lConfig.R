# Tests for gh_lConfig.R — factory function for GitHub-backed lConfig
# RED phase: these tests should all fail because gh_lConfig doesn't exist yet.
#
# Validates: Requirements 2.1, 2.3, 14.1, 19.1, 19.2, 19.3, 19.4

# ---------------------------------------------------------------------------
# gh_lConfig — factory returns correct structure
# ---------------------------------------------------------------------------

test_that("gh_lConfig returns a list with all required fields", {
  config <- gh_lConfig(
    repo = "owner/repo",
    branch = "main",
    snapshot_id = "ps-001",
    data_config = list(Raw_AE = "input/Raw_AE.csv"),
    token = "fake-token"
  )

  expect_type(config, "list")
  expect_equal(config$repo, "owner/repo")
  expect_equal(config$branch, "main")
  expect_equal(config$snapshot_id, "ps-001")
  expect_equal(config$data_config, list(Raw_AE = "input/Raw_AE.csv"))
  expect_equal(config$token, "fake-token")
})

test_that("gh_lConfig includes LoadData and SaveData functions", {
  config <- gh_lConfig(
    repo = "owner/repo",
    branch = "main",
    snapshot_id = "ps-001",
    data_config = list(),
    token = "fake-token"
  )

  expect_true("LoadData" %in% names(config))
  expect_true("SaveData" %in% names(config))
  expect_type(config$LoadData, "closure")
  expect_type(config$SaveData, "closure")
})

test_that("gh_lConfig LoadData has correct signature (lWorkflow, lConfig, lData)", {
  config <- gh_lConfig(
    repo = "owner/repo",
    branch = "main",
    snapshot_id = "ps-001",
    data_config = list(),
    token = "fake-token"
  )

  load_args <- names(formals(config$LoadData))
  expect_equal(load_args, c("lWorkflow", "lConfig", "lData"))
})

test_that("gh_lConfig SaveData has correct signature (lWorkflow, lConfig)", {
  config <- gh_lConfig(
    repo = "owner/repo",
    branch = "main",
    snapshot_id = "ps-001",
    data_config = list(),
    token = "fake-token"
  )

  save_args <- names(formals(config$SaveData))
  expect_equal(save_args, c("lWorkflow", "lConfig"))
})

test_that("gh_lConfig uses default branch 'main' when not specified", {
  config <- gh_lConfig(
    repo = "owner/repo",
    token = "fake-token"
  )

  expect_equal(config$branch, "main")
})

test_that("gh_lConfig uses empty data_config when not specified", {
  config <- gh_lConfig(
    repo = "owner/repo",
    token = "fake-token"
  )

  expect_equal(config$data_config, list())
})

test_that("gh_lConfig uses NULL snapshot_id when not specified", {
  config <- gh_lConfig(
    repo = "owner/repo",
    token = "fake-token"
  )

  expect_null(config$snapshot_id)
})
