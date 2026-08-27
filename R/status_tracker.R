#' Record the execution status of a single workflow step
#'
#' @param step_name Character. The fully qualified function name (e.g., "gsm.mapping::AE_Map_Raw").
#' @param output_name Character. The name of the output produced by this step.
#' @param status Character. One of "completed", "failed", or "not_run".
#' @param error Character or NULL. Error message if the step failed; NULL otherwise.
#'
#' @return A list with elements: name, output, status, error.
#' @export
record_step_status <- function(step_name, output_name, status, error = NULL) {
  list(
    name = step_name,
    output = output_name,
    status = status,
    error = error
  )
}

#' Build the status.json structure from workflow results
#'
#' @param snapshot_id Character. The Project Snapshot identifier (e.g., "ps-001").
#' @param workflow_results Named list. Each element is a workflow result list containing
#'   workflow_id, workflow_type, status, and steps fields.
#'
#' @return A list with elements: snapshot_id, pipeline_status, workflows.
#'   pipeline_status is "completed" if all workflows completed, "failed" if all failed,
#'   or "partial" if there is a mix.
#' @export
build_status_json <- function(snapshot_id, workflow_results) {
  statuses <- vapply(workflow_results, function(w) w$status, character(1))

  if (all(statuses == "completed")) {
    pipeline_status <- "completed"
  } else if (all(statuses == "failed")) {
    pipeline_status <- "failed"
  } else {
    pipeline_status <- "partial"
  }

  list(
    snapshot_id = snapshot_id,
    pipeline_status = pipeline_status,
    workflows = workflow_results
  )
}
