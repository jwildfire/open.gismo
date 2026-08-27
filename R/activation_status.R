#' Display metric activation status before a pipeline run
#'
#' Iterates over a list of workflow metadata objects and logs each metric's
#' `Active` and `GenerateRiskSignal` state to the console.  Intended to be
#' called immediately before `workr::RunWorkflow()` so operators can confirm
#' which metrics will run, which are inactive, and which will suppress risk
#' signal generation.
#'
#' @param lWorkflows Named list of workflow metadata lists.  Each element must
#'   have at minimum an `ID` field and may include `Active` (logical, default
#'   `TRUE`) and `GenerateRiskSignal` (logical, default `TRUE`) fields.
#' @param verbose Logical.  When `TRUE` (default), also prints a summary line
#'   with counts of active, inactive, and monitoring-only metrics.
#'
#' @return A data.frame with columns `id`, `active`, and `generate_risk_signal`,
#'   invisibly.  The same information is also printed to the console.
#'
#' @examples
#' workflows <- list(
#'   list(ID = "kri0001", Active = TRUE,  GenerateRiskSignal = TRUE),
#'   list(ID = "kri0002", Active = FALSE, GenerateRiskSignal = TRUE),
#'   list(ID = "kri0003", Active = TRUE,  GenerateRiskSignal = FALSE)
#' )
#' display_activation_status(workflows)
#'
#' @export
display_activation_status <- function(lWorkflows, verbose = TRUE) {
  if (!is.list(lWorkflows) || length(lWorkflows) == 0L) {
    message("No workflows provided.")
    return(invisible(data.frame(
      id = character(0),
      active = logical(0),
      generate_risk_signal = logical(0)
    )))
  }

  rows <- lapply(lWorkflows, function(wf) {
    id <- wf[["ID"]] %||% "(unknown)"
    active <- isTRUE(wf[["Active"]] %||% TRUE)
    generate_risk_signal <- isTRUE(wf[["GenerateRiskSignal"]] %||% TRUE)
    list(id = id, active = active, generate_risk_signal = generate_risk_signal)
  })

  df <- data.frame(
    id = vapply(rows, `[[`, character(1), "id"),
    active = vapply(rows, `[[`, logical(1), "active"),
    generate_risk_signal = vapply(
      rows,
      `[[`,
      logical(1),
      "generate_risk_signal"
    ),
    stringsAsFactors = FALSE
  )

  # Log each metric's state
  for (i in seq_len(nrow(df))) {
    row <- df[i, ]
    if (!row$active) {
      message(sprintf("  [INACTIVE]        %s", row$id))
    } else if (!row$generate_risk_signal) {
      message(sprintf("  [MONITORING ONLY] %s", row$id))
    } else {
      message(sprintf("  [ACTIVE]          %s", row$id))
    }
  }

  if (verbose) {
    n_active <- sum(df$active)
    n_inactive <- sum(!df$active)
    n_monitoring <- sum(df$active & !df$generate_risk_signal)
    message(sprintf(
      "\nActivation summary: %d active (%d monitoring only), %d inactive, %d total",
      n_active,
      n_monitoring,
      n_inactive,
      nrow(df)
    ))
  }

  df
}

# Null-coalescing operator (defined locally to avoid a hard rlang dependency)
`%||%` <- function(x, y) if (is.null(x)) y else x
