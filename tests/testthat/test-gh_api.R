# Tests for gh_api.R — low-level GitHub API helpers
# RED phase: these tests should all fail because the functions don't exist yet.
#
# Validates: Requirements 1.1, 1.4, 1.5, 2.5, 2.6
#
# Mocking strategy: We mock `gh_api_request` (an internal helper that wraps
# httr2 request/perform/parse) via `local_mocked_bindings`. This lets us
# test the public functions in isolation from the network.

# ---------------------------------------------------------------------------
# gh_get_content — fetches file content from GitHub Contents API
# ---------------------------------------------------------------------------

test_that("gh_get_content returns decoded file content on success", {
  fake_b64 <- base64enc::base64encode(charToRaw("hello world"))

  local_mocked_bindings(
    gh_api_request = function(method, url, token, ...) {
      list(content = fake_b64, sha = "abc123", encoding = "base64")
    }
  )

  result <- gh_get_content(
    "owner/repo",
    "path/to/file.csv",
    "main",
    "fake-token"
  )
  expect_equal(result$content, "hello world")
  expect_equal(result$sha, "abc123")
})

test_that("gh_get_content errors with informative message on 404", {
  local_mocked_bindings(
    gh_api_request = function(method, url, token, ...) {
      stop(structure(
        list(
          message = "GitHub API error (404): Not Found [owner/repo path/to/file.csv]"
        ),
        class = c("gh_api_error", "error", "condition")
      ))
    }
  )

  expect_error(
    gh_get_content("owner/repo", "path/to/file.csv", "main", "fake-token"),
    "404"
  )
})

test_that("gh_get_content errors with informative message on 403", {
  local_mocked_bindings(
    gh_api_request = function(method, url, token, ...) {
      stop(structure(
        list(
          message = "GitHub API error (403): Forbidden [owner/repo path/to/file.csv]"
        ),
        class = c("gh_api_error", "error", "condition")
      ))
    }
  )

  expect_error(
    gh_get_content("owner/repo", "path/to/file.csv", "main", "fake-token"),
    "403"
  )
})

test_that("gh_get_content errors with informative message on 5xx", {
  local_mocked_bindings(
    gh_api_request = function(method, url, token, ...) {
      stop(structure(
        list(
          message = "GitHub API error (500): Internal Server Error [owner/repo path/to/file.csv]"
        ),
        class = c("gh_api_error", "error", "condition")
      ))
    }
  )

  expect_error(
    gh_get_content("owner/repo", "path/to/file.csv", "main", "fake-token"),
    "500"
  )
})

# ---------------------------------------------------------------------------
# gh_put_content — commits file content via Contents API PUT
# ---------------------------------------------------------------------------

test_that("gh_put_content commits file and returns commit info on success", {
  local_mocked_bindings(
    gh_api_request = function(method, url, token, body, ...) {
      expect_equal(method, "PUT")
      # Verify the body contains base64-encoded content
      expect_true(!is.null(body$content))
      expect_equal(body$message, "update file")
      expect_equal(body$branch, "main")
      expect_equal(body$sha, "old_sha_123")
      list(
        content = list(sha = "new_sha_456"),
        commit = list(sha = "commit_sha_789", message = "update file")
      )
    }
  )

  result <- gh_put_content(
    repo = "owner/repo",
    path = "path/to/file.csv",
    content = "col1,col2\na,b",
    message = "update file",
    branch = "main",
    sha = "old_sha_123",
    token = "fake-token"
  )

  expect_equal(result$content$sha, "new_sha_456")
  expect_equal(result$commit$sha, "commit_sha_789")
})

test_that("gh_put_content base64-encodes the content before sending", {
  captured_body <- NULL

  local_mocked_bindings(
    gh_api_request = function(method, url, token, body, ...) {
      captured_body <<- body
      list(content = list(sha = "sha1"), commit = list(sha = "sha2"))
    }
  )

  gh_put_content(
    "owner/repo",
    "file.csv",
    "hello",
    "msg",
    "main",
    "sha0",
    "tok"
  )

  expected_b64 <- base64enc::base64encode(charToRaw("hello"))
  expect_equal(captured_body$content, expected_b64)
})

test_that("gh_put_content errors with informative message on 404", {
  local_mocked_bindings(
    gh_api_request = function(method, url, token, body, ...) {
      stop(structure(
        list(
          message = "GitHub API error (404): Not Found [owner/repo path/to/file.csv]"
        ),
        class = c("gh_api_error", "error", "condition")
      ))
    }
  )

  expect_error(
    gh_put_content(
      "owner/repo",
      "path/to/file.csv",
      "data",
      "msg",
      "main",
      "sha1",
      "fake-token"
    ),
    "404"
  )
})

test_that("gh_put_content errors with informative message on 409 conflict", {
  local_mocked_bindings(
    gh_api_request = function(method, url, token, body, ...) {
      stop(structure(
        list(
          message = "GitHub API error (409): Conflict [owner/repo path/to/file.csv]"
        ),
        class = c("gh_api_error", "error", "condition")
      ))
    }
  )

  expect_error(
    gh_put_content(
      "owner/repo",
      "path/to/file.csv",
      "data",
      "msg",
      "main",
      "sha1",
      "fake-token"
    ),
    "409"
  )
})

test_that("gh_put_content errors with informative message on 5xx", {
  local_mocked_bindings(
    gh_api_request = function(method, url, token, body, ...) {
      stop(structure(
        list(
          message = "GitHub API error (500): Internal Server Error [owner/repo path/to/file.csv]"
        ),
        class = c("gh_api_error", "error", "condition")
      ))
    }
  )

  expect_error(
    gh_put_content(
      "owner/repo",
      "path/to/file.csv",
      "data",
      "msg",
      "main",
      "sha1",
      "fake-token"
    ),
    "500"
  )
})

# ---------------------------------------------------------------------------
# gh_list_directory — lists directory contents via Contents API
# ---------------------------------------------------------------------------

test_that("gh_list_directory returns list of file entries on success", {
  local_mocked_bindings(
    gh_api_request = function(method, url, token, ...) {
      list(
        list(
          name = "file1.csv",
          path = "data/file1.csv",
          type = "file",
          sha = "sha1"
        ),
        list(
          name = "file2.csv",
          path = "data/file2.csv",
          type = "file",
          sha = "sha2"
        ),
        list(name = "subdir", path = "data/subdir", type = "dir", sha = "sha3")
      )
    }
  )

  result <- gh_list_directory("owner/repo", "data", "main", "fake-token")
  expect_length(result, 3)
  expect_equal(result[[1]]$name, "file1.csv")
  expect_equal(result[[1]]$type, "file")
  expect_equal(result[[2]]$name, "file2.csv")
  expect_equal(result[[3]]$name, "subdir")
  expect_equal(result[[3]]$type, "dir")
})

test_that("gh_list_directory returns empty list for empty directory", {
  local_mocked_bindings(
    gh_api_request = function(method, url, token, ...) list()
  )

  result <- gh_list_directory("owner/repo", "empty-dir", "main", "fake-token")
  expect_length(result, 0)
})

test_that("gh_list_directory errors with informative message on 404", {
  local_mocked_bindings(
    gh_api_request = function(method, url, token, ...) {
      stop(structure(
        list(
          message = "GitHub API error (404): Not Found [owner/repo nonexistent]"
        ),
        class = c("gh_api_error", "error", "condition")
      ))
    }
  )

  expect_error(
    gh_list_directory("owner/repo", "nonexistent", "main", "fake-token"),
    "404"
  )
})

test_that("gh_list_directory errors with informative message on 403", {
  local_mocked_bindings(
    gh_api_request = function(method, url, token, ...) {
      stop(structure(
        list(
          message = "GitHub API error (403): Forbidden [owner/repo private-dir]"
        ),
        class = c("gh_api_error", "error", "condition")
      ))
    }
  )

  expect_error(
    gh_list_directory("owner/repo", "private-dir", "main", "fake-token"),
    "403"
  )
})

test_that("gh_list_directory errors with informative message on 5xx", {
  local_mocked_bindings(
    gh_api_request = function(method, url, token, ...) {
      stop(structure(
        list(
          message = "GitHub API error (500): Internal Server Error [owner/repo data]"
        ),
        class = c("gh_api_error", "error", "condition")
      ))
    }
  )

  expect_error(
    gh_list_directory("owner/repo", "data", "main", "fake-token"),
    "500"
  )
})
