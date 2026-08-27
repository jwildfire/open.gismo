# Tests for gh_LoadData.R — lConfig$LoadData implementation for GitHub
# RED phase: these tests should all fail because gh_LoadData doesn't exist yet.
#
# Validates: Requirements 2.1, 2.2, 2.5, 19.1, 19.3, 19.8
#
# Mocking strategy: We mock `gh_get_content` via `local_mocked_bindings`
# since it is already implemented in gh_api.R.

# ---------------------------------------------------------------------------
# gh_LoadData — reads spec domains, fetches from GitHub, parses CSV
# ---------------------------------------------------------------------------

test_that("gh_LoadData loads a single domain from GitHub and parses CSV", {
  csv_text <- "SubjectID,SiteID,Count\nS001,Site01,5\nS002,Site02,10"

  local_mocked_bindings(
    gh_get_content = function(repo, path, branch, token) {
      list(content = csv_text, sha = "sha123")
    }
  )

  lWorkflow <- list(
    meta = list(Type = "Mapping", ID = "AE"),
    spec = list(Raw_AE = list(SubjectID = list(type = "character")))
  )

  lConfig <- list(
    repo = "owner/repo",
    branch = "data",
    snapshot_id = "ps-001",
    data_config = list(Raw_AE = "input/Raw_AE.csv"),
    token = "fake-token"
  )

  lData <- list()
  result <- gh_LoadData(lWorkflow, lConfig, lData)

  expect_true("Raw_AE" %in% names(result))
  expect_s3_class(result$Raw_AE, "data.frame")
  expect_equal(nrow(result$Raw_AE), 2)
  expect_equal(ncol(result$Raw_AE), 3)
  expect_equal(result$Raw_AE$SubjectID, c("S001", "S002"))
})

test_that("gh_LoadData loads multiple domains from spec", {
  csv_ae <- "SubjectID,AEStartDate\nS001,2025-01-01\nS002,2025-02-01"
  csv_dm <- "SubjectID,SiteID\nS001,Site01\nS002,Site02"

  local_mocked_bindings(
    gh_get_content = function(repo, path, branch, token) {
      if (grepl("Raw_AE", path)) {
        list(content = csv_ae, sha = "sha_ae")
      } else if (grepl("Raw_DM", path)) {
        list(content = csv_dm, sha = "sha_dm")
      }
    }
  )

  lWorkflow <- list(
    meta = list(Type = "Mapping", ID = "AE"),
    spec = list(
      Raw_AE = list(SubjectID = list(type = "character")),
      Raw_DM = list(SubjectID = list(type = "character"))
    )
  )

  lConfig <- list(
    repo = "owner/repo",
    branch = "data",
    snapshot_id = "ps-001",
    data_config = list(
      Raw_AE = "input/Raw_AE.csv",
      Raw_DM = "input/Raw_DM.csv"
    ),
    token = "fake-token"
  )

  lData <- list()
  result <- gh_LoadData(lWorkflow, lConfig, lData)

  expect_true("Raw_AE" %in% names(result))
  expect_true("Raw_DM" %in% names(result))
  expect_equal(nrow(result$Raw_AE), 2)
  expect_equal(nrow(result$Raw_DM), 2)
})

test_that("gh_LoadData constructs correct path using snapshot_id", {
  captured_path <- NULL

  local_mocked_bindings(
    gh_get_content = function(repo, path, branch, token) {
      captured_path <<- path
      list(content = "col1\nval1", sha = "sha1")
    }
  )

  lWorkflow <- list(
    meta = list(Type = "Mapping", ID = "AE"),
    spec = list(Raw_AE = list(col1 = list(type = "character")))
  )

  lConfig <- list(
    repo = "owner/repo",
    branch = "data",
    snapshot_id = "ps-003",
    data_config = list(Raw_AE = "input/Raw_AE.csv"),
    token = "fake-token"
  )

  gh_LoadData(lWorkflow, lConfig, list())

  expect_true(grepl("ps-003", captured_path))
})

test_that("gh_LoadData preserves existing data in lData", {
  local_mocked_bindings(
    gh_get_content = function(repo, path, branch, token) {
      list(content = "col1\nval1", sha = "sha1")
    }
  )

  lWorkflow <- list(
    meta = list(Type = "Mapping", ID = "AE"),
    spec = list(NewDomain = list(col1 = list(type = "character")))
  )

  lConfig <- list(
    repo = "owner/repo",
    branch = "data",
    snapshot_id = "ps-001",
    data_config = list(NewDomain = "input/NewDomain.csv"),
    token = "fake-token"
  )

  existing_df <- data.frame(x = 1:3)
  lData <- list(ExistingData = existing_df)
  result <- gh_LoadData(lWorkflow, lConfig, lData)

  expect_true("ExistingData" %in% names(result))
  expect_equal(result$ExistingData, existing_df)
  expect_true("NewDomain" %in% names(result))
})

test_that("gh_LoadData returns lData unchanged when spec is NULL", {
  lWorkflow <- list(
    meta = list(Type = "Mapping", ID = "AE"),
    spec = NULL
  )

  lConfig <- list(
    repo = "owner/repo",
    branch = "data",
    snapshot_id = "ps-001",
    data_config = list(),
    token = "fake-token"
  )

  lData <- list(existing = data.frame(a = 1))
  result <- gh_LoadData(lWorkflow, lConfig, lData)

  expect_equal(result, lData)
})

test_that("gh_LoadData returns lData unchanged when spec is empty", {
  lWorkflow <- list(
    meta = list(Type = "Mapping", ID = "AE"),
    spec = list()
  )

  lConfig <- list(
    repo = "owner/repo",
    branch = "data",
    snapshot_id = "ps-001",
    data_config = list(),
    token = "fake-token"
  )

  lData <- list(existing = data.frame(a = 1))
  result <- gh_LoadData(lWorkflow, lConfig, lData)

  expect_equal(result, lData)
})

# ---------------------------------------------------------------------------
# gh_LoadData — error handling
# ---------------------------------------------------------------------------

test_that("gh_LoadData logs error and skips domain on API failure", {
  local_mocked_bindings(
    gh_get_content = function(repo, path, branch, token) {
      stop(structure(
        list(message = "GitHub API error (404): Not Found"),
        class = c("gh_api_error", "error", "condition")
      ))
    }
  )

  lWorkflow <- list(
    meta = list(Type = "Mapping", ID = "AE"),
    spec = list(Raw_AE = list(SubjectID = list(type = "character")))
  )

  lConfig <- list(
    repo = "owner/repo",
    branch = "data",
    snapshot_id = "ps-001",
    data_config = list(Raw_AE = "input/Raw_AE.csv"),
    token = "fake-token"
  )

  # Should not error — should log and return lData without the domain
  result <- expect_no_error(gh_LoadData(lWorkflow, lConfig, list()))
  expect_false("Raw_AE" %in% names(result))
})

test_that("gh_LoadData loads available domains even when one fails", {
  call_count <- 0

  local_mocked_bindings(
    gh_get_content = function(repo, path, branch, token) {
      call_count <<- call_count + 1
      if (grepl("Raw_AE", path)) {
        list(content = "SubjectID\nS001", sha = "sha1")
      } else {
        stop(structure(
          list(message = "GitHub API error (500): Internal Server Error"),
          class = c("gh_api_error", "error", "condition")
        ))
      }
    }
  )

  lWorkflow <- list(
    meta = list(Type = "Mapping", ID = "AE"),
    spec = list(
      Raw_AE = list(SubjectID = list(type = "character")),
      Raw_Missing = list(col1 = list(type = "character"))
    )
  )

  lConfig <- list(
    repo = "owner/repo",
    branch = "data",
    snapshot_id = "ps-001",
    data_config = list(
      Raw_AE = "input/Raw_AE.csv",
      Raw_Missing = "input/Raw_Missing.csv"
    ),
    token = "fake-token"
  )

  result <- gh_LoadData(lWorkflow, lConfig, list())

  expect_true("Raw_AE" %in% names(result))
  expect_false("Raw_Missing" %in% names(result))
})

test_that("gh_LoadData handles domain not in data_config gracefully", {
  lWorkflow <- list(
    meta = list(Type = "Mapping", ID = "AE"),
    spec = list(UnknownDomain = list(col1 = list(type = "character")))
  )

  lConfig <- list(
    repo = "owner/repo",
    branch = "data",
    snapshot_id = "ps-001",
    data_config = list(),
    token = "fake-token"
  )

  # Domain not in data_config — should skip gracefully
  result <- expect_no_error(gh_LoadData(lWorkflow, lConfig, list()))
  expect_false("UnknownDomain" %in% names(result))
})
