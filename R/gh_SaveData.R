# gh_SaveData.R — lConfig$SaveData implementation for GitHub
#
# Serializes lWorkflow$lResult data frames to CSV and commits them
# to the GitHub repository. Also updates status.json with execution status.

#' Save workflow results to GitHub
#'
#' For each artifact in lWorkflow$lResult, serializes the data.frame to CSV,
#' fetches the existing file SHA (if any), and commits via the GitHub
#' Contents API. Updates status.json with execution status.
#'
#' @param lWorkflow List. Workflow object with $meta and $lResult.
#' @param lConfig List. Config object with $repo, $branch, $snapshot_id,
#'   $data_config, $token.
#'
#' @return NULL (invisible). Side effect: commits files to GitHub.
#' @export
gh_SaveData <- function(lWorkflow, lConfig) {
  lResult <- lWorkflow$lResult

  # Return silently if lResult is NULL or empty
  if (is.null(lResult) || length(lResult) == 0) {
    return(invisible(NULL))
  }

  workflow_id <- lWorkflow$meta$ID
  artifact_names <- names(lResult)

  # Update status.json with execution status first
  tryCatch(
    {
      status_path <- paste0(lConfig$snapshot_id, "/status.json")

      # Try to get existing status.json
      existing_status <- tryCatch(
        {
          result <- gh_get_content(
            repo = lConfig$repo,
            path = status_path,
            branch = lConfig$branch,
            token = lConfig$token
          )
          result
        },
        error = function(e) {
          list(content = "{}", sha = NULL)
        }
      )

      # Build status entry for this workflow
      status_entry <- list(
        workflow_id = workflow_id,
        workflow_type = lWorkflow$meta$Type,
        status = "completed",
        artifacts = artifact_names
      )

      status_json <- jsonlite::toJSON(
        status_entry,
        auto_unbox = TRUE,
        pretty = TRUE
      )

      gh_put_content(
        repo = lConfig$repo,
        path = status_path,
        content = status_json,
        message = sprintf("Update status for workflow %s", workflow_id),
        branch = lConfig$branch,
        sha = existing_status$sha,
        token = lConfig$token
      )
    },
    error = function(e) {
      warning(sprintf(
        "gh_SaveData: error updating status.json for workflow '%s': %s",
        workflow_id,
        conditionMessage(e)
      ))
    }
  )

  # Save each artifact
  for (artifact_name in artifact_names) {
    tryCatch(
      {
        df <- lResult[[artifact_name]]

        # Construct output path: {snapshot_id}/output/{workflow_id}/{artifact_name}.csv
        output_path <- paste0(
          lConfig$snapshot_id,
          "/output/",
          workflow_id,
          "/",
          artifact_name,
          ".csv"
        )

        # Serialize data.frame to CSV string
        csv_content <- paste(
          utils::capture.output(utils::write.csv(
            df,
            stdout(),
            row.names = FALSE
          )),
          collapse = "\n"
        )

        # Try to get existing file SHA for update; handle 404 for new files
        existing_sha <- tryCatch(
          {
            existing <- gh_get_content(
              repo = lConfig$repo,
              path = output_path,
              branch = lConfig$branch,
              token = lConfig$token
            )
            existing$sha
          },
          error = function(e) {
            NULL
          }
        )

        # Commit via gh_put_content
        commit_message <- sprintf(
          "Save %s from workflow %s (snapshot %s)",
          artifact_name,
          workflow_id,
          lConfig$snapshot_id
        )

        gh_put_content(
          repo = lConfig$repo,
          path = output_path,
          content = csv_content,
          message = commit_message,
          branch = lConfig$branch,
          sha = existing_sha,
          token = lConfig$token
        )
      },
      error = function(e) {
        warning(sprintf(
          "gh_SaveData: error saving artifact '%s' for workflow '%s': %s",
          artifact_name,
          workflow_id,
          conditionMessage(e)
        ))
      }
    )
  }

  invisible(NULL)
}
