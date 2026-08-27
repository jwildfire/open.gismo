# StandardizeResults.R — the GroupID seam between the metrics and reporting
# phases of the local pipeline.
#
# Site-level metrics produce numeric GroupIDs (site numbers) while
# country-level metrics produce character GroupIDs (country codes).
# gsm.reporting::BindResults row-binds every metric's results into one
# Reporting_Results table, which requires a consistent GroupID type. This step
# coerces GroupID to character across all analyzed results. It runs as a real
# workr workflow step (see inst/workflows/standardize/standardize.yaml)
# between phases 2 (metrics) and 3 (reporting) of og_run().

#' Standardize analyzed metric results for the reporting phase
#'
#' Coerces the `GroupID` column to character in every data.frame found in
#' `lAnalyzed`, including data.frames nested one level deep (the usual shape:
#' `lAnalyzed$Analysis_kri0001$Analysis_Summary`). Site-level metrics carry
#' numeric site IDs while country-level metrics carry character country codes;
#' `gsm.reporting::BindResults()` needs one consistent type to row-bind them
#' into the reporting layer.
#'
#' This function is registered as a workflow step in
#' `inst/workflows/standardize/standardize.yaml` and executed by [og_run()]
#' between the metrics and reporting phases, so the coercion is a visible,
#' auditable part of the pipeline rather than a hidden fix-up.
#'
#' @param lAnalyzed List. Analyzed metric results as returned by running the
#'   `2_metrics` workflows (typically a named list of per-metric lists of
#'   data.frames).
#'
#' @return `lAnalyzed` with every `GroupID` column coerced to character.
#'   Non-data.frame elements are returned untouched.
#' @export
#'
#' @examples
#' lAnalyzed <- list(
#'   Analysis_kri0001 = list(
#'     Analysis_Summary = data.frame(GroupID = c(101, 102), Metric = c(1, 2))
#'   )
#' )
#' out <- StandardizeResults(lAnalyzed)
#' class(out$Analysis_kri0001$Analysis_Summary$GroupID)
StandardizeResults <- function(lAnalyzed) {
  if (is.null(lAnalyzed) || length(lAnalyzed) == 0L) {
    return(lAnalyzed)
  }
  if (!is.list(lAnalyzed)) {
    stop("`lAnalyzed` must be a list of analyzed metric results.", call. = FALSE)
  }

  for (nm in names(lAnalyzed)) {
    entry <- lAnalyzed[[nm]]
    if (is.data.frame(entry)) {
      lAnalyzed[[nm]] <- .og_groupid_to_character(entry)
    } else if (is.list(entry)) {
      for (sub in names(entry)) {
        if (is.data.frame(entry[[sub]])) {
          entry[[sub]] <- .og_groupid_to_character(entry[[sub]])
        }
      }
      lAnalyzed[[nm]] <- entry
    }
  }

  lAnalyzed
}

#' Coerce a data.frame's GroupID column to character (no-op when absent)
#' @param df A data.frame.
#' @return The data.frame with `GroupID` as character, if present.
#' @keywords internal
.og_groupid_to_character <- function(df) {
  if ("GroupID" %in% names(df)) {
    df$GroupID <- as.character(df$GroupID)
  }
  df
}
