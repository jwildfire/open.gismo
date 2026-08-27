# gh_LoadData.R — lConfig$LoadData implementation for GitHub
#
# Reads data domains specified in lWorkflow$spec from a GitHub repository,
# fetching CSV files via the GitHub Contents API and parsing them into
# data.frames. Supports snapshot inheritance: if a domain is not found in
# the current snapshot, previous snapshots are checked in reverse order.

#' Load data from GitHub for a workr workflow
#'
#' Reads lWorkflow$spec to determine which data domains are needed,
#' looks up storage paths in lConfig$data_config, fetches CSV files
#' from GitHub, and parses them into data.frames added to lData.
#'
#' If a domain is not found in the current snapshot, the function
#' falls back to previous snapshots in reverse order (most recent first).
#' Current snapshot data always takes precedence.
#'
#' @param lWorkflow List. Workflow object with $meta and $spec.
#' @param lConfig List. Config object with $repo, $branch, $snapshot_id,
#'   $data_config, $token.
#' @param lData List. Existing data list to populate.
#'
#' @return lData with additional data.frames loaded per lWorkflow$spec.
#' @importFrom utils read.csv
#' @export
gh_LoadData <- function(lWorkflow, lConfig, lData) {
  spec <- lWorkflow$spec

  # Return lData unchanged when spec is NULL or empty
  if (is.null(spec) || length(spec) == 0) {
    return(lData)
  }

  domain_names <- names(spec)

  for (domain in domain_names) {
    tryCatch(
      {
        # Look up storage path in data_config
        data_path <- lConfig$data_config[[domain]]
        if (is.null(data_path)) {
          warning(sprintf(
            "gh_LoadData: domain '%s' not found in data_config, skipping.",
            domain
          ))
          next
        }

        # Construct full path: {snapshot_id}/{data_config_path}
        full_path <- paste0(lConfig$snapshot_id, "/", data_path)

        # Try current snapshot first
        loaded <- tryCatch(
          {
            result <- gh_get_content(
              repo = lConfig$repo,
              path = full_path,
              branch = lConfig$branch,
              token = lConfig$token
            )
            read.csv(text = result$content, stringsAsFactors = FALSE)
          },
          error = function(e) {
            NULL
          }
        )

        # If not found in current snapshot, try previous snapshots (inheritance)
        if (is.null(loaded) && !is.null(lConfig$snapshot_id)) {
          loaded <- .load_from_previous_snapshots(
            domain = domain,
            data_path = data_path,
            lConfig = lConfig
          )
        }

        if (!is.null(loaded)) {
          lData[[domain]] <- loaded
        } else {
          warning(sprintf(
            "gh_LoadData: domain '%s' not found in any snapshot.",
            domain
          ))
        }
      },
      error = function(e) {
        warning(sprintf(
          "gh_LoadData: error loading domain '%s': %s",
          domain,
          conditionMessage(e)
        ))
      }
    )
  }

  lData
}

#' Try loading a domain from previous snapshots in reverse order
#'
#' @param domain Character. The domain name being loaded.
#' @param data_path Character. The relative data path within a snapshot.
#' @param lConfig List. Config object with repo, branch, snapshot_id, token.
#'
#' @return A data.frame if found, or NULL if not found in any previous snapshot.
#' @keywords internal
.load_from_previous_snapshots <- function(domain, data_path, lConfig) {
  # Get list of all snapshots
  previous_ids <- tryCatch(
    {
      result <- gh_get_content(
        repo = lConfig$repo,
        path = "snapshots.json",
        branch = lConfig$branch,
        token = lConfig$token
      )
      snapshots_data <- jsonlite::fromJSON(
        result$content,
        simplifyVector = FALSE
      )
      all_ids <- vapply(
        snapshots_data$snapshots,
        function(s) s$snapshot_id,
        character(1)
      )

      # Filter out the current snapshot and get previous ones
      prev <- all_ids[all_ids != lConfig$snapshot_id]
      prev
    },
    error = function(e) {
      character(0)
    }
  )

  if (length(previous_ids) == 0) {
    return(NULL)
  }

  # Try previous snapshots in reverse order (most recent first)
  for (prev_id in rev(previous_ids)) {
    loaded <- tryCatch(
      {
        prev_path <- paste0(prev_id, "/", data_path)
        result <- gh_get_content(
          repo = lConfig$repo,
          path = prev_path,
          branch = lConfig$branch,
          token = lConfig$token
        )
        read.csv(text = result$content, stringsAsFactors = FALSE)
      },
      error = function(e) {
        NULL
      }
    )

    if (!is.null(loaded)) {
      return(loaded)
    }
  }

  NULL
}
