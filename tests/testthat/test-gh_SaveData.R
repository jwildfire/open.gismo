# Tests for gh_SaveData.R — lConfig$SaveData implementation for GitHub
# RED phase: these tests should all fail because gh_SaveData doesn't exist yet.
#
# Validates: Requirements 2.3, 2.4, 2.6, 19.2, 19.4, 19.9
#
# Mocking strategy: We mock `gh_get_content` and `gh_put_content` via
# `local_mocked_bindings` since those are already implemented in gh_api.R.

# ---------------------------------------------------------------------------
# gh_SaveData — serializes lResult to CSV, commits to GitHub
# ---------------------------------------------------------------------------

test_that("gh_SaveData commits output data frames as CSV to GitHub", {
  committed_files <- list()

  local_mocked_bindings(
    gh_get_content = function(repo, path, branch, token) {
      list(content = "", sha = "existing_sha")
    },
    gh_put_content = function(
      repo,
      path,
      content,
      message,
      branch,
      sha,
      token
    ) {
      committed_files[[length(committed_files) + 1]] <<- list(
        path = path,
        content = content,
        message = message
      )
      list(content = list(sha = "new_sha"), commit = list(sha = "commit_sha"))
    }
  )

  lWorkflow <- list(
    meta = list(Type = "Metric", ID = "kri0001"),
    lResult = list(
      Analysis_Input = data.frame(
        SubjectID = c("S001", "S002"),
        Rate = c(0.1, 0.2)
      )
    )
  )

  lConfig <- list(
    repo = "owner/repo",
    branch = "data",
    snapshot_id = "ps-001",
    data_config = list(),
    token = "fake-token"
  )

  expect_no_error(gh_SaveData(lWorkflow, lConfig))
  expect_true(length(committed_files) > 0)
})

test_that("gh_SaveData constructs output path with snapshot_id and phase", {
  captured_paths <- character()

  local_mocked_bindings(
    gh_get_content = function(repo, path, branch, token) {
      list(content = "", sha = "sha1")
    },
    gh_put_content = function(
      repo,
      path,
      content,
      message,
      branch,
      sha,
      token
    ) {
      captured_paths <<- c(captured_paths, path)
      list(content = list(sha = "sha2"), commit = list(sha = "sha3"))
    }
  )

  lWorkflow <- list(
    meta = list(Type = "Metric", ID = "kri0001"),
    lResult = list(
      Analysis_Summary = data.frame(x = 1:3)
    )
  )

  lConfig <- list(
    repo = "owner/repo",
    branch = "data",
    snapshot_id = "ps-002",
    data_config = list(),
    token = "fake-token"
  )

  gh_SaveData(lWorkflow, lConfig)

  # Output path should contain snapshot_id and workflow ID
  expect_true(any(grepl("ps-002", captured_paths)))
  expect_true(any(grepl("kri0001", captured_paths)))
})

test_that("gh_SaveData serializes data frames to valid CSV content", {
  captured_content <- NULL

  local_mocked_bindings(
    gh_get_content = function(repo, path, branch, token) {
      list(content = "", sha = "sha1")
    },
    gh_put_content = function(
      repo,
      path,
      content,
      message,
      branch,
      sha,
      token
    ) {
      captured_content <<- content
      list(content = list(sha = "sha2"), commit = list(sha = "sha3"))
    }
  )

  test_df <- data.frame(
    Name = c("Alice", "Bob"),
    Score = c(95, 87),
    stringsAsFactors = FALSE
  )

  lWorkflow <- list(
    meta = list(Type = "Mapping", ID = "DM"),
    lResult = list(Mapped_DM = test_df)
  )

  lConfig <- list(
    repo = "owner/repo",
    branch = "data",
    snapshot_id = "ps-001",
    data_config = list(),
    token = "fake-token"
  )

  gh_SaveData(lWorkflow, lConfig)

  expect_true(!is.null(captured_content))
  # Parse the CSV back and verify it matches
  parsed <- read.csv(text = captured_content, stringsAsFactors = FALSE)
  expect_equal(parsed$Name, c("Alice", "Bob"))
  expect_equal(parsed$Score, c(95, 87))
})

test_that("gh_SaveData saves multiple result artifacts", {
  committed_count <- 0

  local_mocked_bindings(
    gh_get_content = function(repo, path, branch, token) {
      list(content = "", sha = "sha1")
    },
    gh_put_content = function(
      repo,
      path,
      content,
      message,
      branch,
      sha,
      token
    ) {
      committed_count <<- committed_count + 1
      list(content = list(sha = "sha2"), commit = list(sha = "sha3"))
    }
  )

  lWorkflow <- list(
    meta = list(Type = "Metric", ID = "kri0001"),
    lResult = list(
      Analysis_Input = data.frame(x = 1:3),
      Analysis_Summary = data.frame(y = 4:6),
      Analysis_Flag = data.frame(z = 7:9)
    )
  )

  lConfig <- list(
    repo = "owner/repo",
    branch = "data",
    snapshot_id = "ps-001",
    data_config = list(),
    token = "fake-token"
  )

  gh_SaveData(lWorkflow, lConfig)

  # Should commit at least 3 files (one per result artifact)
  expect_gte(committed_count, 3)
})

test_that("gh_SaveData handles empty lResult gracefully", {
  committed_count <- 0

  local_mocked_bindings(
    gh_put_content = function(
      repo,
      path,
      content,
      message,
      branch,
      sha,
      token
    ) {
      committed_count <<- committed_count + 1
      list(content = list(sha = "sha2"), commit = list(sha = "sha3"))
    }
  )

  lWorkflow <- list(
    meta = list(Type = "Mapping", ID = "AE"),
    lResult = list()
  )

  lConfig <- list(
    repo = "owner/repo",
    branch = "data",
    snapshot_id = "ps-001",
    data_config = list(),
    token = "fake-token"
  )

  expect_no_error(gh_SaveData(lWorkflow, lConfig))
  # No artifacts to commit
  expect_equal(committed_count, 0)
})

test_that("gh_SaveData handles NULL lResult gracefully", {
  committed_count <- 0

  local_mocked_bindings(
    gh_put_content = function(
      repo,
      path,
      content,
      message,
      branch,
      sha,
      token
    ) {
      committed_count <<- committed_count + 1
      list(content = list(sha = "sha2"), commit = list(sha = "sha3"))
    }
  )

  lWorkflow <- list(
    meta = list(Type = "Mapping", ID = "AE"),
    lResult = NULL
  )

  lConfig <- list(
    repo = "owner/repo",
    branch = "data",
    snapshot_id = "ps-001",
    data_config = list(),
    token = "fake-token"
  )

  expect_no_error(gh_SaveData(lWorkflow, lConfig))
  expect_equal(committed_count, 0)
})

# ---------------------------------------------------------------------------
# gh_SaveData — error handling
# ---------------------------------------------------------------------------

test_that("gh_SaveData logs error on API failure and retains data", {
  local_mocked_bindings(
    gh_get_content = function(repo, path, branch, token) {
      list(content = "", sha = "sha1")
    },
    gh_put_content = function(
      repo,
      path,
      content,
      message,
      branch,
      sha,
      token
    ) {
      stop(structure(
        list(message = "GitHub API error (500): Internal Server Error"),
        class = c("gh_api_error", "error", "condition")
      ))
    }
  )

  test_df <- data.frame(x = 1:3)
  lWorkflow <- list(
    meta = list(Type = "Metric", ID = "kri0001"),
    lResult = list(Analysis_Input = test_df)
  )

  lConfig <- list(
    repo = "owner/repo",
    branch = "data",
    snapshot_id = "ps-001",
    data_config = list(),
    token = "fake-token"
  )

  # Should not throw — should log error and retain data
  expect_no_error(gh_SaveData(lWorkflow, lConfig))

  # Data should still be in lWorkflow$lResult (retained for retry)
  expect_true("Analysis_Input" %in% names(lWorkflow$lResult))
  expect_equal(lWorkflow$lResult$Analysis_Input, test_df)
})

test_that("gh_SaveData records execution status", {
  status_recorded <- FALSE

  local_mocked_bindings(
    gh_get_content = function(repo, path, branch, token) {
      if (grepl("status\\.json", path)) {
        status_recorded <<- TRUE
      }
      list(content = "", sha = "sha1")
    },
    gh_put_content = function(
      repo,
      path,
      content,
      message,
      branch,
      sha,
      token
    ) {
      if (grepl("status\\.json", path)) {
        status_recorded <<- TRUE
      }
      list(content = list(sha = "sha2"), commit = list(sha = "sha3"))
    }
  )

  lWorkflow <- list(
    meta = list(Type = "Metric", ID = "kri0001"),
    lResult = list(
      Analysis_Input = data.frame(x = 1:3)
    )
  )

  lConfig <- list(
    repo = "owner/repo",
    branch = "data",
    snapshot_id = "ps-001",
    data_config = list(),
    token = "fake-token"
  )

  gh_SaveData(lWorkflow, lConfig)

  # SaveData should interact with status.json
  expect_true(status_recorded)
})

test_that("gh_SaveData continues saving other artifacts when one fails", {
  successful_commits <- character()

  local_mocked_bindings(
    gh_get_content = function(repo, path, branch, token) {
      list(content = "", sha = "sha1")
    },
    gh_put_content = function(
      repo,
      path,
      content,
      message,
      branch,
      sha,
      token
    ) {
      if (grepl("Artifact_A", path)) {
        stop(structure(
          list(message = "GitHub API error (500): Internal Server Error"),
          class = c("gh_api_error", "error", "condition")
        ))
      }
      successful_commits <<- c(successful_commits, path)
      list(content = list(sha = "sha2"), commit = list(sha = "sha3"))
    }
  )

  lWorkflow <- list(
    meta = list(Type = "Metric", ID = "kri0001"),
    lResult = list(
      Artifact_A = data.frame(x = 1:3),
      Artifact_B = data.frame(y = 4:6)
    )
  )

  lConfig <- list(
    repo = "owner/repo",
    branch = "data",
    snapshot_id = "ps-001",
    data_config = list(),
    token = "fake-token"
  )

  expect_no_error(gh_SaveData(lWorkflow, lConfig))

  # Artifact_B should still have been committed
  expect_true(any(grepl("Artifact_B", successful_commits)))
})
