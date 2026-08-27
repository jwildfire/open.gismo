# Tests for snapshot_manager.R — Project Snapshot CRUD operations
# RED phase: these tests should all fail because the functions don't exist yet.
#
# Validates: Requirements 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 18.8, 18.9
#
# Mocking strategy: We mock `gh_get_content`, `gh_put_content`, and
# `gh_list_directory` via `local_mocked_bindings` since those are already
# implemented in gh_api.R.

# ---------------------------------------------------------------------------
# create_project_snapshot — creates metadata.json, allocates ps-NNN IDs,
#                           updates snapshots.json index
# ---------------------------------------------------------------------------

test_that("create_project_snapshot returns a new snapshot_id", {
  local_mocked_bindings(
    gh_get_content = function(repo, path, branch, token) {
      if (grepl("snapshots\\.json", path)) {
        content <- jsonlite::toJSON(
          list(project_id = "my-study", snapshots = list()),
          auto_unbox = TRUE
        )
        list(content = content, sha = "sha_index")
      }
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
      list(content = list(sha = "new_sha"), commit = list(sha = "commit_sha"))
    }
  )

  result <- create_project_snapshot(
    repo = "owner/repo",
    branch = "data",
    input_data_version = "2025-Q1 data cut",
    package_snapshot = "ss-dev",
    token = "fake-token"
  )

  expect_type(result, "character")
  expect_match(result, "^ps-\\d{3}$")
})

test_that("create_project_snapshot allocates ps-001 for first snapshot", {
  local_mocked_bindings(
    gh_get_content = function(repo, path, branch, token) {
      if (grepl("snapshots\\.json", path)) {
        content <- jsonlite::toJSON(
          list(project_id = "my-study", snapshots = list()),
          auto_unbox = TRUE
        )
        list(content = content, sha = "sha_index")
      }
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
      list(content = list(sha = "new_sha"), commit = list(sha = "commit_sha"))
    }
  )

  result <- create_project_snapshot(
    repo = "owner/repo",
    branch = "data",
    input_data_version = "2025-Q1",
    package_snapshot = "ss-dev",
    token = "fake-token"
  )

  expect_equal(result, "ps-001")
})

test_that("create_project_snapshot allocates sequential IDs", {
  local_mocked_bindings(
    gh_get_content = function(repo, path, branch, token) {
      if (grepl("snapshots\\.json", path)) {
        existing <- list(
          project_id = "my-study",
          snapshots = list(
            list(
              snapshot_id = "ps-001",
              created_at = "2025-01-15T10:30:00Z",
              input_data_version = "v1",
              package_snapshot = "ss-dev"
            ),
            list(
              snapshot_id = "ps-002",
              created_at = "2025-02-15T10:30:00Z",
              input_data_version = "v2",
              package_snapshot = "ss-dev"
            )
          )
        )
        content <- jsonlite::toJSON(existing, auto_unbox = TRUE)
        list(content = content, sha = "sha_index")
      }
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
      list(content = list(sha = "new_sha"), commit = list(sha = "commit_sha"))
    }
  )

  result <- create_project_snapshot(
    repo = "owner/repo",
    branch = "data",
    input_data_version = "v3",
    package_snapshot = "ss-dev",
    token = "fake-token"
  )

  expect_equal(result, "ps-003")
})

test_that("create_project_snapshot creates metadata.json with correct fields", {
  captured_puts <- list()

  local_mocked_bindings(
    gh_get_content = function(repo, path, branch, token) {
      if (grepl("snapshots\\.json", path)) {
        content <- jsonlite::toJSON(
          list(project_id = "my-study", snapshots = list()),
          auto_unbox = TRUE
        )
        list(content = content, sha = "sha_index")
      }
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
      captured_puts[[length(captured_puts) + 1]] <<- list(
        path = path,
        content = content
      )
      list(content = list(sha = "new_sha"), commit = list(sha = "commit_sha"))
    }
  )

  create_project_snapshot(
    repo = "owner/repo",
    branch = "data",
    input_data_version = "2025-Q1 data cut",
    package_snapshot = "ss-dev",
    token = "fake-token"
  )

  # Find the metadata.json put
  metadata_put <- Filter(
    function(p) grepl("metadata\\.json", p$path),
    captured_puts
  )
  expect_true(length(metadata_put) > 0)

  metadata <- jsonlite::fromJSON(metadata_put[[1]]$content)
  expect_equal(metadata$snapshot_id, "ps-001")
  expect_equal(metadata$input_data_version, "2025-Q1 data cut")
  expect_equal(metadata$package_snapshot, "ss-dev")
  expect_true(!is.null(metadata$created_at))
})

test_that("create_project_snapshot updates snapshots.json index", {
  captured_puts <- list()

  local_mocked_bindings(
    gh_get_content = function(repo, path, branch, token) {
      if (grepl("snapshots\\.json", path)) {
        content <- jsonlite::toJSON(
          list(project_id = "my-study", snapshots = list()),
          auto_unbox = TRUE
        )
        list(content = content, sha = "sha_index")
      }
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
      captured_puts[[length(captured_puts) + 1]] <<- list(
        path = path,
        content = content
      )
      list(content = list(sha = "new_sha"), commit = list(sha = "commit_sha"))
    }
  )

  create_project_snapshot(
    repo = "owner/repo",
    branch = "data",
    input_data_version = "2025-Q1",
    package_snapshot = "ss-dev",
    token = "fake-token"
  )

  # Find the snapshots.json put
  index_put <- Filter(
    function(p) grepl("snapshots\\.json", p$path),
    captured_puts
  )
  expect_true(length(index_put) > 0)

  index <- jsonlite::fromJSON(index_put[[1]]$content)
  expect_equal(nrow(index$snapshots) %||% length(index$snapshots), 1)
})

test_that("create_project_snapshot handles missing snapshots.json (new project)", {
  local_mocked_bindings(
    gh_get_content = function(repo, path, branch, token) {
      if (grepl("snapshots\\.json", path)) {
        stop(structure(
          list(message = "GitHub API error (404): Not Found"),
          class = c("gh_api_error", "error", "condition")
        ))
      }
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
      list(content = list(sha = "new_sha"), commit = list(sha = "commit_sha"))
    }
  )

  result <- create_project_snapshot(
    repo = "owner/repo",
    branch = "data",
    input_data_version = "2025-Q1",
    package_snapshot = "ss-dev",
    token = "fake-token"
  )

  # Should still create ps-001 even when snapshots.json doesn't exist
  expect_equal(result, "ps-001")
})

# ---------------------------------------------------------------------------
# list_project_snapshots — returns data frame of snapshots
# ---------------------------------------------------------------------------

test_that("list_project_snapshots returns data frame with correct columns", {
  local_mocked_bindings(
    gh_get_content = function(repo, path, branch, token) {
      snapshots_data <- list(
        project_id = "my-study",
        snapshots = list(
          list(
            snapshot_id = "ps-001",
            created_at = "2025-01-15T10:30:00Z",
            input_data_version = "2025-Q1",
            package_snapshot = "ss-dev"
          ),
          list(
            snapshot_id = "ps-002",
            created_at = "2025-02-15T10:30:00Z",
            input_data_version = "2025-Q2",
            package_snapshot = "ss-dev"
          )
        )
      )
      content <- jsonlite::toJSON(snapshots_data, auto_unbox = TRUE)
      list(content = content, sha = "sha_index")
    }
  )

  result <- list_project_snapshots(
    repo = "owner/repo",
    branch = "data",
    token = "fake-token"
  )

  expect_s3_class(result, "data.frame")
  expect_true("snapshot_id" %in% names(result))
  expect_true("created_at" %in% names(result))
  expect_true("input_data_version" %in% names(result))
  expect_true("package_snapshot" %in% names(result))
})

test_that("list_project_snapshots returns correct number of entries", {
  local_mocked_bindings(
    gh_get_content = function(repo, path, branch, token) {
      snapshots_data <- list(
        project_id = "my-study",
        snapshots = list(
          list(
            snapshot_id = "ps-001",
            created_at = "2025-01-15T10:30:00Z",
            input_data_version = "v1",
            package_snapshot = "ss-dev"
          ),
          list(
            snapshot_id = "ps-002",
            created_at = "2025-02-15T10:30:00Z",
            input_data_version = "v2",
            package_snapshot = "ss-demo"
          )
        )
      )
      content <- jsonlite::toJSON(snapshots_data, auto_unbox = TRUE)
      list(content = content, sha = "sha_index")
    }
  )

  result <- list_project_snapshots("owner/repo", "data", "fake-token")

  expect_equal(nrow(result), 2)
  expect_equal(result$snapshot_id, c("ps-001", "ps-002"))
  expect_equal(result$input_data_version, c("v1", "v2"))
  expect_equal(result$package_snapshot, c("ss-dev", "ss-demo"))
})

test_that("list_project_snapshots handles empty project", {
  local_mocked_bindings(
    gh_get_content = function(repo, path, branch, token) {
      snapshots_data <- list(
        project_id = "my-study",
        snapshots = list()
      )
      content <- jsonlite::toJSON(snapshots_data, auto_unbox = TRUE)
      list(content = content, sha = "sha_index")
    }
  )

  result <- list_project_snapshots("owner/repo", "data", "fake-token")

  expect_s3_class(result, "data.frame")
  expect_equal(nrow(result), 0)
  expect_true("snapshot_id" %in% names(result))
  expect_true("created_at" %in% names(result))
  expect_true("input_data_version" %in% names(result))
  expect_true("package_snapshot" %in% names(result))
})

test_that("list_project_snapshots handles missing snapshots.json (404)", {
  local_mocked_bindings(
    gh_get_content = function(repo, path, branch, token) {
      stop(structure(
        list(message = "GitHub API error (404): Not Found"),
        class = c("gh_api_error", "error", "condition")
      ))
    }
  )

  result <- list_project_snapshots("owner/repo", "data", "fake-token")

  expect_s3_class(result, "data.frame")
  expect_equal(nrow(result), 0)
})

# ---------------------------------------------------------------------------
# get_snapshot_status — returns workflow statuses with per-step status
# ---------------------------------------------------------------------------

test_that("get_snapshot_status returns workflow statuses", {
  status_data <- list(
    snapshot_id = "ps-001",
    pipeline_status = "partial",
    workflows = list(
      Mapping_AE = list(
        workflow_id = "AE",
        workflow_type = "Mapping",
        status = "completed",
        steps = list(
          list(
            name = "gsm.mapping::AE_Map_Raw",
            output = "Mapped_AE",
            status = "completed",
            error = NULL
          )
        )
      ),
      Metric_kri0001 = list(
        workflow_id = "kri0001",
        workflow_type = "Metric",
        status = "failed",
        steps = list(
          list(
            name = "gsm.core::Input_Rate",
            output = "Analysis_Input",
            status = "completed",
            error = NULL
          ),
          list(
            name = "gsm.core::Analyze_NormalApprox",
            output = "Analysis_Summary",
            status = "failed",
            error = "insufficient data"
          )
        )
      )
    )
  )

  local_mocked_bindings(
    gh_get_content = function(repo, path, branch, token) {
      content <- jsonlite::toJSON(status_data, auto_unbox = TRUE)
      list(content = content, sha = "sha_status")
    }
  )

  result <- get_snapshot_status(
    repo = "owner/repo",
    branch = "data",
    snapshot_id = "ps-001",
    token = "fake-token"
  )

  expect_type(result, "list")
  expect_true("workflows" %in% names(result))
  expect_true("Mapping_AE" %in% names(result$workflows))
  expect_true("Metric_kri0001" %in% names(result$workflows))
})

test_that("get_snapshot_status returns per-step status details", {
  status_data <- list(
    snapshot_id = "ps-001",
    pipeline_status = "completed",
    workflows = list(
      Mapping_AE = list(
        workflow_id = "AE",
        workflow_type = "Mapping",
        status = "completed",
        steps = list(
          list(
            name = "gsm.mapping::AE_Map_Raw",
            output = "Mapped_AE",
            status = "completed",
            error = NULL
          )
        )
      )
    )
  )

  local_mocked_bindings(
    gh_get_content = function(repo, path, branch, token) {
      content <- jsonlite::toJSON(status_data, auto_unbox = TRUE)
      list(content = content, sha = "sha_status")
    }
  )

  result <- get_snapshot_status("owner/repo", "data", "ps-001", "fake-token")

  wf <- result$workflows$Mapping_AE
  expect_equal(wf$workflow_id, "AE")
  expect_equal(wf$status, "completed")
  expect_true(length(wf$steps) > 0)
  expect_equal(wf$steps[[1]]$name, "gsm.mapping::AE_Map_Raw")
  expect_equal(wf$steps[[1]]$status, "completed")
})

test_that("get_snapshot_status includes error messages for failed steps", {
  status_data <- list(
    snapshot_id = "ps-001",
    pipeline_status = "failed",
    workflows = list(
      Metric_kri0001 = list(
        workflow_id = "kri0001",
        workflow_type = "Metric",
        status = "failed",
        steps = list(
          list(
            name = "gsm.core::Analyze_NormalApprox",
            output = "Analysis_Summary",
            status = "failed",
            error = "insufficient data for analysis"
          )
        )
      )
    )
  )

  local_mocked_bindings(
    gh_get_content = function(repo, path, branch, token) {
      content <- jsonlite::toJSON(status_data, auto_unbox = TRUE)
      list(content = content, sha = "sha_status")
    }
  )

  result <- get_snapshot_status("owner/repo", "data", "ps-001", "fake-token")

  step <- result$workflows$Metric_kri0001$steps[[1]]
  expect_equal(step$status, "failed")
  expect_equal(step$error, "insufficient data for analysis")
})

test_that("get_snapshot_status fetches from correct path", {
  captured_path <- NULL

  local_mocked_bindings(
    gh_get_content = function(repo, path, branch, token) {
      captured_path <<- path
      content <- jsonlite::toJSON(
        list(
          snapshot_id = "ps-003",
          pipeline_status = "completed",
          workflows = list()
        ),
        auto_unbox = TRUE
      )
      list(content = content, sha = "sha_status")
    }
  )

  get_snapshot_status("owner/repo", "data", "ps-003", "fake-token")

  expect_true(grepl("ps-003", captured_path))
  expect_true(grepl("status\\.json", captured_path))
})

# ---------------------------------------------------------------------------
# Snapshot data inheritance — LoadData falls back to previous snapshots
# when domain missing in current snapshot; current data takes precedence
# ---------------------------------------------------------------------------

test_that("LoadData falls back to previous snapshot when domain missing in current", {
  # ps-002 is current, but Raw_AE only exists in ps-001
  csv_ae <- "SubjectID,AEStartDate\nS001,2025-01-01"

  local_mocked_bindings(
    gh_get_content = function(repo, path, branch, token) {
      if (grepl("snapshots\\.json", path)) {
        snapshots_data <- list(
          project_id = "my-study",
          snapshots = list(
            list(
              snapshot_id = "ps-001",
              created_at = "2025-01-15T10:30:00Z",
              input_data_version = "v1",
              package_snapshot = "ss-dev"
            ),
            list(
              snapshot_id = "ps-002",
              created_at = "2025-02-15T10:30:00Z",
              input_data_version = "v2",
              package_snapshot = "ss-dev"
            )
          )
        )
        content <- jsonlite::toJSON(snapshots_data, auto_unbox = TRUE)
        return(list(content = content, sha = "sha_index"))
      }

      if (grepl("ps-002/", path) && grepl("Raw_AE", path)) {
        # Domain not in current snapshot
        stop(structure(
          list(message = "GitHub API error (404): Not Found"),
          class = c("gh_api_error", "error", "condition")
        ))
      }

      if (grepl("ps-001/", path) && grepl("Raw_AE", path)) {
        # Domain exists in previous snapshot
        return(list(content = csv_ae, sha = "sha_ae"))
      }

      if (grepl("metadata\\.json", path)) {
        metadata <- list(
          snapshot_id = "ps-002",
          previous_snapshots = list("ps-001")
        )
        content <- jsonlite::toJSON(metadata, auto_unbox = TRUE)
        return(list(content = content, sha = "sha_meta"))
      }

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
    snapshot_id = "ps-002",
    data_config = list(Raw_AE = "input/Raw_AE.csv"),
    token = "fake-token"
  )

  result <- gh_LoadData(lWorkflow, lConfig, list())

  # Should have loaded Raw_AE from ps-001 via inheritance
  expect_true("Raw_AE" %in% names(result))
  expect_equal(result$Raw_AE$SubjectID, "S001")
})

test_that("Current snapshot data takes precedence over previous snapshots", {
  csv_current <- "SubjectID,AEStartDate\nS999,2025-06-01"
  csv_previous <- "SubjectID,AEStartDate\nS001,2025-01-01"

  local_mocked_bindings(
    gh_get_content = function(repo, path, branch, token) {
      if (grepl("snapshots\\.json", path)) {
        snapshots_data <- list(
          project_id = "my-study",
          snapshots = list(
            list(
              snapshot_id = "ps-001",
              created_at = "2025-01-15T10:30:00Z",
              input_data_version = "v1",
              package_snapshot = "ss-dev"
            ),
            list(
              snapshot_id = "ps-002",
              created_at = "2025-02-15T10:30:00Z",
              input_data_version = "v2",
              package_snapshot = "ss-dev"
            )
          )
        )
        content <- jsonlite::toJSON(snapshots_data, auto_unbox = TRUE)
        return(list(content = content, sha = "sha_index"))
      }

      if (grepl("ps-002/", path) && grepl("Raw_AE", path)) {
        # Domain exists in current snapshot
        return(list(content = csv_current, sha = "sha_current"))
      }

      if (grepl("ps-001/", path) && grepl("Raw_AE", path)) {
        # Domain also exists in previous snapshot
        return(list(content = csv_previous, sha = "sha_previous"))
      }

      if (grepl("metadata\\.json", path)) {
        metadata <- list(
          snapshot_id = "ps-002",
          previous_snapshots = list("ps-001")
        )
        content <- jsonlite::toJSON(metadata, auto_unbox = TRUE)
        return(list(content = content, sha = "sha_meta"))
      }

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
    snapshot_id = "ps-002",
    data_config = list(Raw_AE = "input/Raw_AE.csv"),
    token = "fake-token"
  )

  result <- gh_LoadData(lWorkflow, lConfig, list())

  # Current snapshot data should take precedence
  expect_true("Raw_AE" %in% names(result))
  expect_equal(result$Raw_AE$SubjectID, "S999")
})

test_that("Snapshot inheritance checks previous snapshots in reverse order", {
  # ps-003 is current, Raw_AE exists in ps-001 and ps-002
  # Should get data from ps-002 (most recent previous)
  csv_ps002 <- "SubjectID,AEStartDate\nS002,2025-02-01"

  local_mocked_bindings(
    gh_get_content = function(repo, path, branch, token) {
      if (grepl("snapshots\\.json", path)) {
        snapshots_data <- list(
          project_id = "my-study",
          snapshots = list(
            list(
              snapshot_id = "ps-001",
              created_at = "2025-01-15T10:30:00Z",
              input_data_version = "v1",
              package_snapshot = "ss-dev"
            ),
            list(
              snapshot_id = "ps-002",
              created_at = "2025-02-15T10:30:00Z",
              input_data_version = "v2",
              package_snapshot = "ss-dev"
            ),
            list(
              snapshot_id = "ps-003",
              created_at = "2025-03-15T10:30:00Z",
              input_data_version = "v3",
              package_snapshot = "ss-dev"
            )
          )
        )
        content <- jsonlite::toJSON(snapshots_data, auto_unbox = TRUE)
        return(list(content = content, sha = "sha_index"))
      }

      if (grepl("ps-003/", path) && grepl("Raw_AE", path)) {
        stop(structure(
          list(message = "GitHub API error (404): Not Found"),
          class = c("gh_api_error", "error", "condition")
        ))
      }

      if (grepl("ps-002/", path) && grepl("Raw_AE", path)) {
        return(list(content = csv_ps002, sha = "sha_ps002"))
      }

      if (grepl("metadata\\.json", path)) {
        metadata <- list(
          snapshot_id = "ps-003",
          previous_snapshots = list("ps-001", "ps-002")
        )
        content <- jsonlite::toJSON(metadata, auto_unbox = TRUE)
        return(list(content = content, sha = "sha_meta"))
      }

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
    snapshot_id = "ps-003",
    data_config = list(Raw_AE = "input/Raw_AE.csv"),
    token = "fake-token"
  )

  result <- gh_LoadData(lWorkflow, lConfig, list())

  # Should get data from ps-002 (most recent previous that has it)
  expect_true("Raw_AE" %in% names(result))
  expect_equal(result$Raw_AE$SubjectID, "S002")
})

test_that("Snapshot inheritance logs error when previous snapshot unavailable", {
  local_mocked_bindings(
    gh_get_content = function(repo, path, branch, token) {
      if (grepl("snapshots\\.json", path)) {
        snapshots_data <- list(
          project_id = "my-study",
          snapshots = list(
            list(
              snapshot_id = "ps-001",
              created_at = "2025-01-15T10:30:00Z",
              input_data_version = "v1",
              package_snapshot = "ss-dev"
            ),
            list(
              snapshot_id = "ps-002",
              created_at = "2025-02-15T10:30:00Z",
              input_data_version = "v2",
              package_snapshot = "ss-dev"
            )
          )
        )
        content <- jsonlite::toJSON(snapshots_data, auto_unbox = TRUE)
        return(list(content = content, sha = "sha_index"))
      }

      if (grepl("metadata\\.json", path)) {
        metadata <- list(
          snapshot_id = "ps-002",
          previous_snapshots = list("ps-001")
        )
        content <- jsonlite::toJSON(metadata, auto_unbox = TRUE)
        return(list(content = content, sha = "sha_meta"))
      }

      # All data fetches fail — domain not in any snapshot
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
    snapshot_id = "ps-002",
    data_config = list(Raw_AE = "input/Raw_AE.csv"),
    token = "fake-token"
  )

  # Should not error — should log and continue with available data
  result <- expect_no_error(gh_LoadData(lWorkflow, lConfig, list()))
  expect_false("Raw_AE" %in% names(result))
})
