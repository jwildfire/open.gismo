# snapshot_manager.R — Project Snapshot CRUD operations
#
# Manages Project Snapshots on the data branch of a GitHub repository.
# Each snapshot captures a versioned set of pipeline output artifacts.

#' Create a new Project Snapshot
#'
#' Allocates the next sequential ps-NNN ID, creates metadata.json,
#' and updates the snapshots.json index.
#'
#' @param repo Character. GitHub repo in "owner/repo" format.
#' @param branch Character. Branch for storing project snapshots.
#' @param input_data_version Character. Description of input data version.
#' @param package_snapshot Character. Package snapshot branch used (e.g., "ss-dev").
#' @param token Character. GitHub PAT.
#'
#' @return Character. The new snapshot_id (e.g., "ps-001").
#' @export
create_project_snapshot <- function(
  repo,
  branch,
  input_data_version,
  package_snapshot,
  token
) {
  # Fetch existing snapshots.json (handle 404 for new projects)
  existing <- tryCatch(
    {
      result <- gh_get_content(
        repo = repo,
        path = "snapshots.json",
        branch = branch,
        token = token
      )
      list(
        data = jsonlite::fromJSON(result$content, simplifyVector = FALSE),
        sha = result$sha
      )
    },
    error = function(e) {
      list(
        data = list(project_id = "", snapshots = list()),
        sha = NULL
      )
    }
  )

  snapshots_list <- existing$data$snapshots

  # Allocate next sequential ps-NNN ID
  if (length(snapshots_list) == 0) {
    next_num <- 1
  } else {
    existing_nums <- vapply(
      snapshots_list,
      function(s) {
        as.integer(sub("^ps-", "", s$snapshot_id))
      },
      integer(1)
    )
    next_num <- max(existing_nums) + 1
  }

  snapshot_id <- sprintf("ps-%03d", next_num)
  created_at <- format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC")

  # Create metadata.json at {snapshot_id}/metadata.json
  metadata <- list(
    snapshot_id = snapshot_id,
    created_at = created_at,
    input_data_version = input_data_version,
    package_snapshot = package_snapshot,
    previous_snapshots = lapply(snapshots_list, function(s) s$snapshot_id)
  )

  metadata_json <- jsonlite::toJSON(metadata, auto_unbox = TRUE, pretty = TRUE)
  metadata_path <- paste0(snapshot_id, "/metadata.json")

  gh_put_content(
    repo = repo,
    path = metadata_path,
    content = metadata_json,
    message = sprintf("Create metadata for %s", snapshot_id),
    branch = branch,
    sha = NULL,
    token = token
  )

  # Update snapshots.json index
  new_entry <- list(
    snapshot_id = snapshot_id,
    created_at = created_at,
    input_data_version = input_data_version,
    package_snapshot = package_snapshot
  )

  snapshots_list[[length(snapshots_list) + 1]] <- new_entry
  existing$data$snapshots <- snapshots_list

  index_json <- jsonlite::toJSON(
    existing$data,
    auto_unbox = TRUE,
    pretty = TRUE
  )

  gh_put_content(
    repo = repo,
    path = "snapshots.json",
    content = index_json,
    message = sprintf("Add %s to snapshots index", snapshot_id),
    branch = branch,
    sha = existing$sha,
    token = token
  )

  snapshot_id
}

#' List all Project Snapshots for a branch
#'
#' Fetches snapshots.json and returns a data frame of all snapshots.
#'
#' @param repo Character. GitHub repo in "owner/repo" format.
#' @param branch Character. Branch storing project snapshots.
#' @param token Character. GitHub PAT.
#'
#' @return Data frame with columns: snapshot_id, created_at, input_data_version, package_snapshot.
#'   Returns an empty data frame with correct columns if no snapshots exist or snapshots.json is missing.
#' @export
list_project_snapshots <- function(repo, branch, token) {
  empty_df <- data.frame(
    snapshot_id = character(0),
    created_at = character(0),
    input_data_version = character(0),
    package_snapshot = character(0),
    stringsAsFactors = FALSE
  )

  snapshots_data <- tryCatch(
    {
      result <- gh_get_content(
        repo = repo,
        path = "snapshots.json",
        branch = branch,
        token = token
      )
      jsonlite::fromJSON(result$content, simplifyVector = FALSE)
    },
    error = function(e) {
      return(NULL)
    }
  )

  if (is.null(snapshots_data)) {
    return(empty_df)
  }

  snapshots_list <- snapshots_data$snapshots

  if (length(snapshots_list) == 0) {
    return(empty_df)
  }

  do.call(
    rbind,
    lapply(snapshots_list, function(s) {
      data.frame(
        snapshot_id = s$snapshot_id %||% NA_character_,
        created_at = s$created_at %||% NA_character_,
        input_data_version = s$input_data_version %||% NA_character_,
        package_snapshot = s$package_snapshot %||% NA_character_,
        stringsAsFactors = FALSE
      )
    })
  )
}

#' Get execution status for a Project Snapshot
#'
#' Fetches \code{snapshot_id/status.json} and returns the parsed status structure.
#'
#' @param repo Character. GitHub repo in "owner/repo" format.
#' @param branch Character. Branch storing project snapshots.
#' @param snapshot_id Character. The Project Snapshot identifier (e.g., "ps-001").
#' @param token Character. GitHub PAT.
#'
#' @return List with elements: snapshot_id, pipeline_status, workflows.
#' @export
get_snapshot_status <- function(repo, branch, snapshot_id, token) {
  status_path <- paste0(snapshot_id, "/status.json")

  result <- gh_get_content(
    repo = repo,
    path = status_path,
    branch = branch,
    token = token
  )

  jsonlite::fromJSON(result$content, simplifyVector = FALSE)
}
