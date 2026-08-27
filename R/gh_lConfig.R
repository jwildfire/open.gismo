# gh_lConfig.R — Factory function for GitHub-backed lConfig
#
# Creates an lConfig object compatible with workr::RunWorkflow that uses
# GitHub as the storage backend via gh_LoadData and gh_SaveData hooks.

#' Create a GitHub-backed lConfig object for workr::RunWorkflow
#'
#' @param repo Character. GitHub repo in "owner/repo" format.
#' @param branch Character. Branch for reading/writing data. Default: "main".
#' @param snapshot_id Character or NULL. Project Snapshot identifier (e.g., "ps-003").
#' @param data_config List. Parsed data-config.yaml mapping domains to paths.
#' @param token Character. GitHub PAT. Default: Sys.getenv("GITHUB_TOKEN").
#'
#' @return List with LoadData and SaveData functions conforming to workr lConfig interface.
#' @export
gh_lConfig <- function(
  repo,
  branch = "main",
  snapshot_id = NULL,
  data_config = list(),
  token = Sys.getenv("GITHUB_TOKEN")
) {
  list(
    repo = repo,
    branch = branch,
    snapshot_id = snapshot_id,
    data_config = data_config,
    token = token,
    LoadData = gh_LoadData,
    SaveData = gh_SaveData
  )
}
