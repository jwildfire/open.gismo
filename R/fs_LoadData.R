# fs_LoadData.R — lConfig$LoadData implementation for the local filesystem
#
# Reads the data domains declared in lWorkflow$spec from a self-contained
# project folder, parsing input CSV files into data.frames. The filesystem
# twin of gh_LoadData: same contract, same log-and-skip error posture, but
# resolves paths on disk (data_config, else the input/{domain}.csv
# convention) instead of the GitHub Contents API.

#' Load data from a local project folder for a workr workflow
#'
#' Reads `lWorkflow$spec` to determine which data domains are needed. For each
#' declared domain that is not already present in `lData`, resolves an input
#' path (from `lConfig$data_config[[domain]]`, else `input/{domain}.csv` under
#' `lConfig$project_dir`), reads it with
#' `read.csv(..., stringsAsFactors = FALSE)`, and adds it to `lData`.
#'
#' Domains already present in `lData` are left untouched (upstream results take
#' precedence). Missing files and read errors are logged via [warning()] and
#' skipped rather than raised, so an absent optional domain never aborts a
#' workflow.
#'
#' @param lWorkflow List. Workflow object with `$meta` and `$spec`.
#' @param lConfig List. Config object from [fs_lConfig()] with `$project_dir`
#'   and `$data_config`.
#' @param lData List. Existing data list to populate.
#'
#' @return `lData` with additional data.frames loaded per `lWorkflow$spec`.
#' @seealso [gh_LoadData()] for the GitHub-backed twin.
#' @importFrom utils read.csv
#' @export
fs_LoadData <- function(lWorkflow, lConfig, lData) {
  spec <- lWorkflow$spec

  # Return lData unchanged when spec is NULL or empty
  if (is.null(spec) || length(spec) == 0) {
    return(lData)
  }

  domain_names <- names(spec)

  for (domain in domain_names) {
    # Skip domains already supplied upstream (do not reload / overwrite)
    if (domain %in% names(lData)) {
      next
    }

    tryCatch(
      {
        full_path <- fs_resolve_input_path(domain, lConfig)

        if (!file.exists(full_path)) {
          warning(sprintf(
            "fs_LoadData: input file for domain '%s' not found at '%s', skipping.",
            domain,
            full_path
          ))
          next
        }

        lData[[domain]] <- utils::read.csv(
          full_path,
          stringsAsFactors = FALSE
        )
      },
      error = function(e) {
        warning(sprintf(
          "fs_LoadData: error loading domain '%s': %s",
          domain,
          conditionMessage(e)
        ))
      }
    )
  }

  lData
}

#' Resolve the on-disk input path for a data domain
#'
#' Looks the domain up in `lConfig$data_config`; if absent, falls back to the
#' `input/{domain}.csv` convention. Relative paths are resolved against
#' `lConfig$project_dir`; absolute paths are returned unchanged.
#'
#' @param domain Character. Domain name (e.g. `Raw_AE`).
#' @param lConfig List. Config object from [fs_lConfig()].
#'
#' @return Character. The resolved (possibly project-relative) file path.
#' @keywords internal
fs_resolve_input_path <- function(domain, lConfig) {
  data_path <- NULL
  if (!is.null(lConfig$data_config)) {
    data_path <- lConfig$data_config[[domain]]
  }
  if (is.null(data_path)) {
    data_path <- file.path("input", paste0(domain, ".csv"))
  }

  # Absolute paths (or paths without a project_dir) are used as-is.
  project_dir <- lConfig$project_dir
  if (is.null(project_dir) || .fs_is_absolute_path(data_path)) {
    return(data_path)
  }

  file.path(project_dir, data_path)
}

#' Test whether a path is absolute
#'
#' @param path Character scalar path.
#' @return Logical.
#' @keywords internal
.fs_is_absolute_path <- function(path) {
  grepl("^(/|~|[A-Za-z]:[\\\\/])", path)
}
