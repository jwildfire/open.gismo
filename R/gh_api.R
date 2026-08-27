# gh_api.R — Low-level GitHub API helpers
#
# Internal helper `gh_api_request` wraps httr2 request/perform/parse.
# Public functions `gh_get_content`, `gh_put_content`, `gh_list_directory`
# use it to interact with the GitHub Contents API.

#' Internal: Make a GitHub API request
#'
#' @param method Character. HTTP method ("GET" or "PUT").
#' @param url Character. Full GitHub API URL.
#' @param token Character. GitHub PAT for authorization.
#' @param body List or NULL. Request body for PUT requests.
#' @return Parsed JSON response as a list.
#' @keywords internal
gh_api_request <- function(method, url, token, body = NULL) {
  req <- httr2::request(url)
  req <- httr2::req_headers(
    req,
    Authorization = paste("Bearer", token),
    Accept = "application/vnd.github.v3+json"
  )

  if (identical(method, "PUT")) {
    req <- httr2::req_method(req, "PUT")
    req <- httr2::req_body_json(req, body)
  }

  req <- httr2::req_error(req, is_error = function(resp) FALSE)
  resp <- httr2::req_perform(req)
  status <- httr2::resp_status(resp)

  if (status >= 400) {
    reason <- tryCatch(
      {
        parsed <- httr2::resp_body_json(resp)
        parsed$message %||% httr2::resp_status_desc(resp)
      },
      error = function(e) httr2::resp_status_desc(resp)
    )
    stop(structure(
      list(message = sprintf("GitHub API error (%d): %s", status, reason)),
      class = c("gh_api_error", "error", "condition")
    ))
  }

  httr2::resp_body_json(resp)
}

#' Get file content from GitHub Contents API
#'
#' @param repo Character. GitHub repo in "owner/repo" format.
#' @param path Character. File path within the repo.
#' @param branch Character. Branch name.
#' @param token Character. GitHub PAT.
#' @return List with `content` (decoded string) and `sha`.
#' @export
gh_get_content <- function(repo, path, branch, token) {
  url <- sprintf(
    "https://api.github.com/repos/%s/contents/%s?ref=%s",
    repo,
    path,
    branch
  )
  result <- gh_api_request("GET", url, token)
  decoded <- rawToChar(base64enc::base64decode(result$content))
  list(content = decoded, sha = result$sha)
}

#' Put file content via GitHub Contents API
#'
#' @param repo Character. GitHub repo in "owner/repo" format.
#' @param path Character. File path within the repo.
#' @param content Character. File content to commit (will be base64-encoded).
#' @param message Character. Commit message.
#' @param branch Character. Branch name.
#' @param sha Character. SHA of the file being replaced.
#' @param token Character. GitHub PAT.
#' @return Parsed API response with content and commit info.
#' @export
gh_put_content <- function(repo, path, content, message, branch, sha, token) {
  url <- sprintf(
    "https://api.github.com/repos/%s/contents/%s",
    repo,
    path
  )
  encoded <- base64enc::base64encode(charToRaw(content))
  body <- list(
    message = message,
    content = encoded,
    branch = branch,
    sha = sha
  )
  gh_api_request("PUT", url, token, body = body)
}

#' List directory contents via GitHub Contents API
#'
#' @param repo Character. GitHub repo in "owner/repo" format.
#' @param path Character. Directory path within the repo.
#' @param branch Character. Branch name.
#' @param token Character. GitHub PAT.
#' @return List of file/directory entry lists.
#' @export
gh_list_directory <- function(repo, path, branch, token) {
  url <- sprintf(
    "https://api.github.com/repos/%s/contents/%s?ref=%s",
    repo,
    path,
    branch
  )
  gh_api_request("GET", url, token)
}
