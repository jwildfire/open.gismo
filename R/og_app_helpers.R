# og_app_helpers.R — folder-round-tripping helpers for the thin og_app() shell.
#
# Every helper here reads or writes files inside the project folder; none holds
# hidden state. They are usable independently of Shiny so they can be unit
# tested without launching an app.

# Internal: resolve the metrics workflow directory for a project.
og_metrics_dir <- function(project_dir) {
  file.path(project_dir, "workflows", "2_metrics")
}

# Internal: an empty metric-settings data.frame with the contract columns.
og_empty_metric_settings <- function() {
  data.frame(
    metric = character(0),
    file = character(0),
    Active = logical(0),
    Threshold = character(0),
    GroupLevel = character(0),
    stringsAsFactors = FALSE
  )
}

#' Read metric settings from a project's metric workflow YAMLs
#'
#' Scans `workflows/2_metrics/*.yaml` inside a project folder and returns a
#' tidy data.frame of the user-editable settings for each metric. This is the
#' read half of the thin settings editor in [og_app()]: the metric YAML files
#' on disk are the single source of truth, so calling this again after an edit
#' always reflects what will actually run.
#'
#' The `Active` flag follows the package convention (see
#' [display_activation_status()]): a metric is active unless its `meta$Active`
#' field is explicitly `FALSE`, so freshly scaffolded metrics default to active.
#'
#' @param project_dir Character. Path to an open.gismo project folder created by
#'   `og_init()`.
#'
#' @return A data.frame with class `"og_metric_settings"` and one row per metric
#'   YAML, with columns:
#'   \describe{
#'     \item{metric}{Metric ID (from `meta$ID`, falling back to the file stem).}
#'     \item{file}{Absolute path to the metric YAML file.}
#'     \item{Active}{Logical; `FALSE` only when `meta$Active` is explicitly
#'       false.}
#'     \item{Threshold}{Character; the comma-separated `meta$Threshold` string,
#'       or `NA` when absent.}
#'     \item{GroupLevel}{Character; `meta$GroupLevel` (e.g. "Site" or
#'       "Country"), or `NA` when absent.}
#'   }
#'   When the metrics directory is missing or empty, a zero-row data.frame with
#'   these columns is returned.
#'
#' @examples
#' \dontrun{
#' og_init("~/my-study", example = TRUE)
#' og_metric_settings("~/my-study")
#' }
#'
#' @seealso [og_metric_settings_update()] for the write half.
#' @export
og_metric_settings <- function(project_dir) {
  if (!requireNamespace("yaml", quietly = TRUE)) {
    stop("Package 'yaml' is required for og_metric_settings().", call. = FALSE)
  }
  metrics_dir <- og_metrics_dir(project_dir)
  if (!dir.exists(metrics_dir)) {
    return(structure(
      og_empty_metric_settings(),
      class = c("og_metric_settings", "data.frame")
    ))
  }

  files <- list.files(
    metrics_dir,
    pattern = "\\.ya?ml$",
    full.names = TRUE
  )
  files <- sort(files)
  if (length(files) == 0L) {
    return(structure(
      og_empty_metric_settings(),
      class = c("og_metric_settings", "data.frame")
    ))
  }

  rows <- lapply(files, function(f) {
    y <- tryCatch(yaml::read_yaml(f), error = function(e) NULL)
    meta <- if (is.list(y)) y$meta else NULL
    id <- meta$ID %||% tools::file_path_sans_ext(basename(f))
    active <- isTRUE(meta$Active %||% TRUE)
    threshold <- meta$Threshold %||% NA_character_
    group_level <- meta$GroupLevel %||% NA_character_
    data.frame(
      metric = as.character(id),
      file = f,
      Active = active,
      # Threshold/GroupLevel may parse as numeric vectors; store as string.
      Threshold = if (length(threshold) > 1L) {
        paste(threshold, collapse = ",")
      } else {
        as.character(threshold)
      },
      GroupLevel = as.character(group_level),
      stringsAsFactors = FALSE
    )
  })

  df <- do.call(rbind, rows)
  rownames(df) <- NULL
  structure(df, class = c("og_metric_settings", "data.frame"))
}

#' Update one metric's settings in its workflow YAML
#'
#' Writes user-edited settings back into a single `workflows/2_metrics/*.yaml`
#' file, mutating only the named `meta` keys and preserving everything else in
#' the file (the `spec` block, the `steps`, and every other `meta` field). This
#' is the write half of the thin settings editor in [og_app()]; because state
#' lives entirely in the folder, the change takes effect on the next
#' `og_run()`.
#'
#' @param project_dir Character. Path to an open.gismo project folder.
#' @param metric_id Character. The metric to update, matched against `meta$ID`
#'   (falling back to the YAML file stem).
#' @param values Named list of `meta` fields to set, e.g.
#'   `list(Active = FALSE, Threshold = "-3,-2,2,3", GroupLevel = "Country")`.
#'   An `Active` value is coerced to a scalar logical; all other values are
#'   written verbatim. Names not already present in `meta` are added.
#'
#' @return Invisibly, the absolute path to the YAML file that was written.
#'
#' @examples
#' \dontrun{
#' og_metric_settings_update(
#'   "~/my-study",
#'   "kri0001",
#'   list(Active = FALSE, Threshold = "-3,-2,2,3")
#' )
#' }
#'
#' @seealso [og_metric_settings()] for the read half.
#' @export
og_metric_settings_update <- function(project_dir, metric_id, values) {
  if (!requireNamespace("yaml", quietly = TRUE)) {
    stop(
      "Package 'yaml' is required for og_metric_settings_update().",
      call. = FALSE
    )
  }
  if (!is.list(values) || is.null(names(values)) || any(names(values) == "")) {
    stop("`values` must be a fully named list of meta fields.", call. = FALSE)
  }

  metrics_dir <- og_metrics_dir(project_dir)
  files <- list.files(metrics_dir, pattern = "\\.ya?ml$", full.names = TRUE)
  target <- NULL
  for (f in files) {
    y <- tryCatch(yaml::read_yaml(f), error = function(e) NULL)
    id <- y$meta$ID %||% tools::file_path_sans_ext(basename(f))
    if (identical(as.character(id), as.character(metric_id))) {
      target <- f
      break
    }
  }
  if (is.null(target)) {
    stop(
      sprintf("No metric YAML found for id '%s' in %s", metric_id, metrics_dir),
      call. = FALSE
    )
  }

  y <- yaml::read_yaml(target)
  if (is.null(y$meta)) {
    y$meta <- list()
  }
  for (k in names(values)) {
    v <- values[[k]]
    if (identical(k, "Active")) {
      v <- isTRUE(as.logical(v)[1])
    }
    y$meta[[k]] <- v
  }
  .og_check_threshold_flag(y$meta, metric_id)
  yaml::write_yaml(y, target)
  invisible(target)
}

# Internal: enforce the gsm.core::Flag() contract before writing settings.
# The pipeline requires length(Flag) == length(Threshold) + 1; a mismatch only
# surfaces ~30s into og_run() as an opaque "Improper number of Flag values"
# error, so catch it at write time with an actionable message instead.
.og_check_threshold_flag <- function(meta, metric_id) {
  split_meta_values <- function(x) {
    if (is.null(x)) {
      return(NULL)
    }
    vals <- unlist(strsplit(paste(as.character(x), collapse = ","), ","))
    vals <- trimws(vals)
    vals[nzchar(vals)]
  }
  thr <- split_meta_values(meta$Threshold)
  flg <- split_meta_values(meta$Flag)
  if (is.null(thr) || is.null(flg)) {
    return(invisible(NULL))
  }
  if (suppressWarnings(any(is.na(as.numeric(thr))))) {
    stop(
      sprintf(
        "Metric '%s': Threshold must be comma-separated numbers, got '%s'.",
        metric_id,
        paste(thr, collapse = ",")
      ),
      call. = FALSE
    )
  }
  if (length(flg) != length(thr) + 1L) {
    stop(
      sprintf(
        paste0(
          "Metric '%s': %d Threshold value(s) require %d Flag value(s), ",
          "but meta$Flag has %d ('%s'). Update Threshold and Flag together ",
          "(the pipeline's Flag step needs one more Flag than Thresholds)."
        ),
        metric_id,
        length(thr),
        length(thr) + 1L,
        length(flg),
        paste(flg, collapse = ",")
      ),
      call. = FALSE
    )
  }
  invisible(NULL)
}

# Internal: reduce the Settings-panel inputs to only the meta fields the user
# actually changed, so Save round-trips a metric YAML faithfully instead of
# rewriting (or injecting) fields the user never touched.
#
# `current` is the metric's current settings (a one-row og_metric_settings
# data.frame, or a list) with Active/Threshold/GroupLevel; `values` is the raw
# UI list list(Active=, Threshold=, GroupLevel=). Returns a named list of only
# the changed fields (possibly empty).
#
# GroupLevel is special: the Settings selectInput only offers `group_choices`
# (Site/Country), so when a metric's stored GroupLevel is something else (e.g.
# a qtl metric's "Study"/"Subject") the widget silently falls back to its first
# choice and input$metric_group does not reflect a real user edit. In that case
# GroupLevel is treated as non-editable and never written, so a non-Site/Country
# level is preserved rather than corrupted to "Site".
og_settings_changes <- function(current, values, group_choices = c("Site", "Country")) {
  cur_val <- function(field) {
    v <- current[[field]]
    if (is.null(v) || length(v) == 0L) NA else v[[1]]
  }
  changes <- list()

  if (!is.null(values$Active)) {
    if (!identical(isTRUE(cur_val("Active")), isTRUE(values$Active))) {
      changes$Active <- isTRUE(values$Active)
    }
  }

  if (!is.null(values$Threshold)) {
    cur_thr <- cur_val("Threshold")
    cur_thr <- if (length(cur_thr) != 1L || is.na(cur_thr)) "" else as.character(cur_thr)
    new_thr <- as.character(values$Threshold)
    if (!identical(trimws(cur_thr), trimws(new_thr))) {
      changes$Threshold <- new_thr
    }
  }

  if (!is.null(values$GroupLevel)) {
    cur_gl <- cur_val("GroupLevel")
    cur_gl <- if (length(cur_gl) != 1L || is.na(cur_gl)) NA_character_ else as.character(cur_gl)
    new_gl <- as.character(values$GroupLevel)
    editable <- !is.na(cur_gl) && cur_gl %in% group_choices
    if (editable && !identical(cur_gl, new_gl)) {
      changes$GroupLevel <- new_gl
    }
  }

  changes
}

# Internal: read the raw text of a metric's YAML file (for the advanced editor).
og_metric_yaml_text <- function(project_dir, metric_id) {
  df <- og_metric_settings(project_dir)
  hit <- df$file[df$metric == metric_id]
  if (length(hit) == 0L) {
    return(NULL)
  }
  paste(readLines(hit[1], warn = FALSE), collapse = "\n")
}

# Internal: overwrite a metric's YAML file with raw text (advanced editor Save).
# Validates that the text parses as YAML before writing so a typo can't corrupt
# the project. Returns invisibly the path written, or errors on invalid YAML.
og_metric_yaml_write <- function(project_dir, metric_id, text) {
  if (!requireNamespace("yaml", quietly = TRUE)) {
    stop("Package 'yaml' is required to write metric YAML.", call. = FALSE)
  }
  df <- og_metric_settings(project_dir)
  hit <- df$file[df$metric == metric_id]
  if (length(hit) == 0L) {
    stop(sprintf("No metric YAML found for id '%s'", metric_id), call. = FALSE)
  }
  # Parse-check (throws on invalid YAML) before touching the file.
  yaml::yaml.load(text)
  writeLines(text, hit[1])
  invisible(hit[1])
}

# Internal: read the reports.json payload written by og_run(). Returns a list
# with `reports` and `static_charts` elements (possibly empty), or NULL when the
# file is absent (no run yet).
og_read_reports <- function(project_dir) {
  path <- file.path(project_dir, "output", "4_modules", "reports.json")
  if (!file.exists(path)) {
    return(NULL)
  }
  if (!requireNamespace("jsonlite", quietly = TRUE)) {
    return(NULL)
  }
  out <- tryCatch(
    jsonlite::fromJSON(path, simplifyDataFrame = FALSE),
    error = function(e) NULL
  )
  if (is.null(out)) {
    return(NULL)
  }
  list(
    reports = out$reports %||% list(),
    static_charts = out$static_charts %||% list()
  )
}
