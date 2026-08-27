# fs_SaveData.R — lConfig$SaveData implementation for the local filesystem
#
# Serializes a workflow's results to CSV under a demo-branch-compatible
# output/ layout inside the project folder, and records execution status in a
# merged status.json. The filesystem twin of gh_SaveData, with one deliberate
# improvement: status.json is read-modify-written (each workflow entry is
# merged into the existing JSON) instead of being overwritten each call.

#' Save workflow results to a local project folder
#'
#' Writes each data.frame produced by a workflow to
#' `output/{phase}/{ID}/{name}.csv` under `lConfig$project_dir`, where `phase`
#' is derived from `lWorkflow$meta$Type` (Mapped -> `1_mappings`,
#' Analysis -> `2_metrics`, Reporting -> `3_reporting`, Report -> `4_modules`).
#' It then merges an entry for this workflow into `status.json` at the project
#' root, preserving entries written by earlier workflows. The entry carries a
#' `steps` array (`{name, output, status, error}` per saved artifact) matching
#' [og_write_status_json()]'s shape, so both status.json producers emit the one
#' shape the bundled site consumes.
#'
#' `lWorkflow$lResult` may be a single data.frame (as produced by
#' [workr::RunWorkflow()], named after the final step's output) or a named
#' list of data.frames; both are handled. Write failures for an individual
#' artifact are logged via [warning()] and skipped so the remaining artifacts
#' still save.
#'
#' @param lWorkflow List. Workflow object with `$meta`, `$steps`, and
#'   `$lResult`.
#' @param lConfig List. Config object from [fs_lConfig()] with `$project_dir`.
#'
#' @return `NULL` (invisible). Side effect: writes CSVs and merges
#'   `status.json` on disk.
#' @seealso [gh_SaveData()] for the GitHub-backed twin.
#' @importFrom utils write.csv
#' @export
fs_SaveData <- function(lWorkflow, lConfig) {
  results <- fs_normalize_results(lWorkflow)

  # Return silently when there is nothing to save
  if (length(results) == 0) {
    return(invisible(NULL))
  }

  workflow_id <- lWorkflow$meta$ID
  workflow_type <- lWorkflow$meta$Type
  phase <- fs_phase_dir(workflow_type)
  project_dir <- lConfig$project_dir

  saved_names <- character(0)

  # Save each artifact
  for (artifact_name in names(results)) {
    tryCatch(
      {
        df <- results[[artifact_name]]
        if (!is.data.frame(df)) {
          next
        }

        out_dir <- file.path(project_dir, "output", phase, workflow_id)
        dir.create(out_dir, recursive = TRUE, showWarnings = FALSE)
        out_path <- file.path(out_dir, paste0(artifact_name, ".csv"))

        utils::write.csv(df, out_path, row.names = FALSE)
        saved_names <- c(saved_names, artifact_name)
      },
      error = function(e) {
        warning(sprintf(
          "fs_SaveData: error saving artifact '%s' for workflow '%s': %s",
          artifact_name,
          workflow_id,
          conditionMessage(e)
        ))
      }
    )
  }

  # Merge this workflow's entry into status.json (read-modify-write)
  tryCatch(
    {
      result_key <- paste0(workflow_type, "_", workflow_id)
      fs_merge_status(
        project_dir = project_dir,
        result_key = result_key,
        entry = list(
          workflow_id = workflow_id,
          workflow_type = workflow_type,
          phase = phase,
          status = "completed",
          steps = fs_build_steps(lWorkflow, saved_names)
        )
      )
    },
    error = function(e) {
      warning(sprintf(
        "fs_SaveData: error updating status.json for workflow '%s': %s",
        workflow_id,
        conditionMessage(e)
      ))
    }
  )

  invisible(NULL)
}

#' Normalize a workflow's results into a named list of data.frames
#'
#' [workr::RunWorkflow()] sets `lWorkflow$lResult` to the output of the final
#' step (typically a single data.frame). This coerces that to a named list
#' keyed by the final step's `output` name (falling back to the workflow ID),
#' while passing an already-named list of results through unchanged.
#'
#' @param lWorkflow List. Workflow object with `$lResult`, `$steps`, `$meta`.
#'
#' @return A named list of results (empty list when there is nothing to save).
#' @keywords internal
fs_normalize_results <- function(lWorkflow) {
  lResult <- lWorkflow$lResult

  if (is.null(lResult)) {
    return(list())
  }

  # Single data.frame result: name it after the final step's output.
  if (is.data.frame(lResult)) {
    name <- NULL
    steps <- lWorkflow$steps
    if (!is.null(steps) && length(steps) > 0) {
      name <- steps[[length(steps)]]$output
    }
    if (is.null(name) || !nzchar(name)) {
      name <- lWorkflow$meta$ID
    }
    if (is.null(name) || !nzchar(name)) {
      name <- "result"
    }
    out <- list()
    out[[name]] <- lResult
    return(out)
  }

  # Already a named list of results (e.g. hand-built lResult): pass through.
  if (is.list(lResult) && length(lResult) > 0 && !is.null(names(lResult))) {
    return(lResult)
  }

  list()
}

#' Build the status.json `steps` array for a saved workflow
#'
#' Produces one `list(name, output, status, error)` entry per saved artifact,
#' matching the shape [og_write_status_json()] emits (and the shape the bundled
#' site's status parser consumes). `name` is the workflow step whose `output`
#' matches the artifact, falling back to the final step's name (or `"="` when
#' the workflow declares no steps).
#'
#' @param lWorkflow List. Workflow object with `$steps`.
#' @param saved_names Character. Names of the artifacts written to disk.
#'
#' @return A list of step entries (empty list when nothing was saved).
#' @keywords internal
fs_build_steps <- function(lWorkflow, saved_names) {
  steps <- lWorkflow$steps
  step_name_for <- function(output_name) {
    if (is.list(steps) && length(steps) > 0L) {
      for (s in steps) {
        if (identical(s$output, output_name)) {
          return(s$name %||% "=")
        }
      }
      # No step declares this output: use the final step's name.
      return(steps[[length(steps)]]$name %||% "=")
    }
    "="
  }
  lapply(saved_names, function(nm) {
    list(name = step_name_for(nm), output = nm, status = "completed", error = NULL)
  })
}

#' Map a workflow meta Type to its output phase directory
#'
#' Uses the demo/project convention: `Mapped` -> `1_mappings`,
#' `Analysis` -> `2_metrics`, `Reporting` -> `3_reporting`,
#' `Report` -> `4_modules`. Common aliases are accepted. An unrecognized type
#' is used verbatim as the directory name so nothing is silently dropped.
#'
#' @param type Character. `lWorkflow$meta$Type`.
#'
#' @return Character. The phase directory name under `output/`.
#' @keywords internal
fs_phase_dir <- function(type) {
  if (is.null(type) || length(type) != 1 || !nzchar(type)) {
    return("output")
  }

  map <- c(
    Mapped = "1_mappings",
    Mapping = "1_mappings",
    Analysis = "2_metrics",
    Metric = "2_metrics",
    Metrics = "2_metrics",
    Reporting = "3_reporting",
    Report = "4_modules",
    Module = "4_modules",
    Modules = "4_modules"
  )

  out <- unname(map[type])
  if (is.na(out)) {
    return(type)
  }
  out
}

#' Merge a workflow status entry into status.json (read-modify-write)
#'
#' Reads the existing `status.json` (if present) at the project root, sets or
#' replaces the `workflows[[result_key]]` entry, and writes the merged JSON
#' back. This fixes the overwrite behavior of the GitHub twin so status from
#' earlier workflows is preserved.
#'
#' @param project_dir Character. Project folder root.
#' @param result_key Character. Key under `workflows` (e.g. `Mapped_AE`).
#' @param entry List. The status entry to store for this workflow.
#'
#' @return `NULL` (invisible). Side effect: writes `status.json`.
#' @keywords internal
fs_merge_status <- function(project_dir, result_key, entry) {
  status_path <- file.path(project_dir, "status.json")

  existing <- list()
  if (file.exists(status_path)) {
    existing <- tryCatch(
      jsonlite::fromJSON(status_path, simplifyVector = FALSE),
      error = function(e) list()
    )
    if (!is.list(existing)) {
      existing <- list()
    }
  }

  if (is.null(existing$workflows) || !is.list(existing$workflows)) {
    existing$workflows <- list()
  }
  existing$workflows[[result_key]] <- entry

  if (is.null(existing$pipeline_status)) {
    existing$pipeline_status <- "in_progress"
  }

  json <- jsonlite::toJSON(
    existing,
    auto_unbox = TRUE,
    pretty = TRUE,
    null = "null"
  )
  writeLines(json, status_path)

  invisible(NULL)
}
