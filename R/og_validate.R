# og_validate.R — human-readable validation of a project's input CSVs against
# the mapping-workflow specs ("the forgiveness layer").

# Number of rows sampled from each CSV for type-coercion checks. The full row
# count is measured separately (cheaply) so validation stays fast on large
# inputs like the example LB domain.
.OG_VALIDATE_SAMPLE_ROWS <- 5000L

# ---------------------------------------------------------------------------
# Spec extraction
# ---------------------------------------------------------------------------

#' Collect the required input (Raw_*) columns and types from the mapping specs
#'
#' Parses every `workflows/1_mappings/*.yaml`, reads each workflow's `spec`
#' block, and keeps the domains a user actually supplies — those named
#' `Raw_*`. Intermediate domains (`Mapped_*`, `Temp_*`, `Reporting_*`) are
#' produced by the pipeline, not the user, so they are skipped. Columns are
#' merged across mappings when a domain appears in more than one spec.
#' Non-column sentinel keys (names starting with `_`, e.g. gsm.core's `_all`
#' wildcard marker) are dropped so they are never treated as required columns.
#'
#' @param workflows_dir Character. The project's `workflows/` directory.
#'
#' @return A named list: domain -> named list of column -> type string.
#' @keywords internal
.og_input_specs <- function(workflows_dir) {
  mapping_dir <- file.path(workflows_dir, "1_mappings")
  files <- list.files(mapping_dir, pattern = "\\.yaml$", full.names = TRUE)
  specs <- list()
  for (f in files) {
    wf <- og_read_yaml(f)
    spec <- wf$spec
    if (is.null(spec)) next
    for (domain in names(spec)) {
      if (!grepl("^Raw_", domain)) next
      cols <- spec[[domain]]
      # Skip non-column sentinel keys (names starting with "_", e.g. gsm.core's
      # "_all" wildcard marker): these are spec directives, not user-supplied
      # columns, so they must not be reported as missing columns.
      cols <- cols[!startsWith(names(cols), "_")]
      col_types <- lapply(cols, function(x) {
        if (is.list(x) && !is.null(x$type)) as.character(x$type) else NA_character_
      })
      existing <- specs[[domain]]
      if (is.null(existing)) {
        specs[[domain]] <- col_types
      } else {
        # Merge: add columns not already required; keep first known type.
        for (col in names(col_types)) {
          if (is.null(existing[[col]]) || is.na(existing[[col]])) {
            existing[[col]] <- col_types[[col]]
          }
        }
        specs[[domain]] <- existing
      }
    }
  }
  specs[order(names(specs))]
}

# ---------------------------------------------------------------------------
# CSV inspection
# ---------------------------------------------------------------------------

#' Cheaply measure a CSV's dimensions and read a typed-check sample.
#' @keywords internal
.og_inspect_csv <- function(path) {
  header <- utils::read.csv(
    path,
    nrows = 0L,
    check.names = FALSE,
    stringsAsFactors = FALSE
  )
  cols <- names(header)
  sample <- utils::read.csv(
    path,
    nrows = .OG_VALIDATE_SAMPLE_ROWS,
    check.names = FALSE,
    stringsAsFactors = FALSE,
    colClasses = "character"
  )
  n_rows <- tryCatch(
    length(utils::count.fields(path, sep = ",", quote = "\"")) - 1L,
    error = function(e) nrow(sample)
  )
  if (is.na(n_rows) || n_rows < 0L) n_rows <- nrow(sample)
  list(cols = cols, n_cols = length(cols), n_rows = n_rows, sample = sample)
}

#' Check whether a character vector's values coerce to a spec type.
#'
#' Only the unambiguous numeric-ish types are enforced; character, Date, and
#' timestamp columns are validated by presence alone (dates carry too many
#' legitimate formats to nag about — this is the forgiveness layer).
#'
#' @return `NULL` if fine, otherwise a short human-readable reason.
#' @keywords internal
.og_check_column_type <- function(values, type) {
  if (is.null(type) || is.na(type)) return(NULL)
  v <- values[!is.na(values) & nzchar(trimws(values))]
  if (length(v) == 0L) return(NULL)
  type <- tolower(as.character(type))
  coerced <- if (type %in% c("integer", "int")) {
    suppressWarnings(as.integer(v))
  } else if (type %in% c("numeric", "double", "float", "number")) {
    suppressWarnings(as.numeric(v))
  } else if (type %in% c("logical", "boolean", "bool")) {
    suppressWarnings(as.logical(v))
  } else {
    return(NULL) # character / Date / timestamp / unknown -> presence only
  }
  n_bad <- sum(is.na(coerced))
  if (n_bad > 0L) {
    return(sprintf("%d value(s) not coercible to %s", n_bad, type))
  }
  NULL
}

# ---------------------------------------------------------------------------
# og_validate
# ---------------------------------------------------------------------------

#' Validate a project's input data against its mapping specs
#'
#' Checks each input data domain the mapping workflows expect and reports, in
#' plain language, whether the project is ready to run. For every `Raw_*`
#' domain referenced by `workflows/1_mappings/`, it verifies that the input CSV
#' exists (per `config/data-config.yaml`, defaulting to `input/{domain}.csv`),
#' that the columns the spec requires are present, and that numeric columns
#' hold coercible values.
#'
#' This is the "forgiveness layer": it is deliberately lenient about date
#' formats and extra columns, and it names exactly what is missing so a user
#' can fix their data before running [og_run()].
#'
#' @param project_dir Character. Path to a project folder created by
#'   [og_init()].
#'
#' @return A data.frame (with class `"og_validation"` and a dedicated
#'   [print][print.og_validation] method) with one row per input domain and
#'   columns:
#'   \describe{
#'     \item{domain}{Data domain name, e.g. `"Raw_AE"`.}
#'     \item{file}{Input file path, relative to the project root.}
#'     \item{status}{One of `"ok"`, `"warning"`, `"error"`, `"missing"`.}
#'     \item{n_rows, n_cols}{Dimensions of the file (`NA` when unreadable).}
#'     \item{problems}{Human-readable description of any issues (`""` if none).}
#'   }
#' @export
#'
#' @examples
#' \dontrun{
#' og_init("~/my-study", example = TRUE)
#' og_validate("~/my-study")
#' }
og_validate <- function(project_dir) {
  paths <- og_project_paths(project_dir)
  if (!dir.exists(paths$workflows)) {
    stop(
      "No workflows found at:\n  ", paths$workflows,
      "\nIs this an open.gismo project? Create one with og_init(\"",
      paths$root, "\").",
      call. = FALSE
    )
  }

  specs <- .og_input_specs(paths$workflows)
  data_config <- og_read_data_config(paths$root)

  domains <- names(specs)
  rows <- vector("list", length(domains))

  for (i in seq_along(domains)) {
    domain <- domains[[i]]
    rel <- .og_domain_path(domain, data_config)
    abs <- file.path(paths$root, rel)
    required <- names(specs[[domain]])

    if (!file.exists(abs)) {
      rows[[i]] <- data.frame(
        domain = domain, file = rel, status = "missing",
        n_rows = NA_integer_, n_cols = NA_integer_,
        problems = "file not found",
        stringsAsFactors = FALSE
      )
      next
    }

    info <- tryCatch(.og_inspect_csv(abs), error = function(e) e)
    if (inherits(info, "error")) {
      rows[[i]] <- data.frame(
        domain = domain, file = rel, status = "error",
        n_rows = NA_integer_, n_cols = NA_integer_,
        problems = paste0("could not read file: ", conditionMessage(info)),
        stringsAsFactors = FALSE
      )
      next
    }

    missing_cols <- setdiff(required, info$cols)
    type_problems <- character(0)
    present_cols <- intersect(required, info$cols)
    for (col in present_cols) {
      reason <- .og_check_column_type(info$sample[[col]], specs[[domain]][[col]])
      if (!is.null(reason)) {
        type_problems <- c(type_problems, sprintf("%s (%s)", col, reason))
      }
    }

    problems <- character(0)
    if (length(missing_cols) > 0L) {
      problems <- c(problems, paste0(
        "missing column", if (length(missing_cols) > 1L) "s" else "", ": ",
        paste(missing_cols, collapse = ", ")
      ))
    }
    if (length(type_problems) > 0L) {
      problems <- c(problems, paste0("type: ", paste(type_problems, collapse = "; ")))
    }

    status <- if (length(missing_cols) > 0L) {
      "error"
    } else if (length(type_problems) > 0L) {
      "warning"
    } else {
      "ok"
    }

    rows[[i]] <- data.frame(
      domain = domain, file = rel, status = status,
      n_rows = info$n_rows, n_cols = info$n_cols,
      problems = if (length(problems) > 0L) paste(problems, collapse = "; ") else "",
      stringsAsFactors = FALSE
    )
  }

  out <- if (length(rows) > 0L) {
    do.call(rbind, rows)
  } else {
    data.frame(
      domain = character(0), file = character(0), status = character(0),
      n_rows = integer(0), n_cols = integer(0), problems = character(0),
      stringsAsFactors = FALSE
    )
  }
  rownames(out) <- NULL

  attr(out, "project_dir") <- paths$root
  attr(out, "study_name") <- .og_study_name(paths)
  class(out) <- c("og_validation", "data.frame")
  out
}

#' Best-effort study label for the validation header.
#' @keywords internal
.og_study_name <- function(paths) {
  if (!file.exists(paths$study_config) || !requireNamespace("yaml", quietly = TRUE)) {
    return(NULL)
  }
  cfg <- tryCatch(yaml::read_yaml(paths$study_config), error = function(e) NULL)
  if (is.null(cfg)) return(NULL)
  name <- cfg$StudyTitle
  if (is.null(name) || !nzchar(name)) name <- cfg$StudyName
  if (is.null(name) || !nzchar(name)) name <- cfg$StudyID
  if (is.null(name) || !nzchar(name)) NULL else as.character(name)
}

# ---------------------------------------------------------------------------
# print method
# ---------------------------------------------------------------------------

#' Print an og_validation result
#'
#' Renders a per-domain readiness summary with a symbol for each status, the
#' input file and its dimensions, any problems named inline, a one-line tally,
#' and — when anything needs attention — an actionable list of what to fix.
#'
#' @param x An `og_validation` data.frame from [og_validate()].
#' @param ... Ignored.
#'
#' @return `x`, invisibly.
#' @export
print.og_validation <- function(x, ...) {
  utf8 <- isTRUE(l10n_info()[["UTF-8"]])
  sym <- if (utf8) {
    c(ok = "\u2714", warning = "\u26a0", error = "\u2716", missing = "\u2716")
  } else {
    c(ok = "OK", warning = "! ", error = "X ", missing = "X ")
  }
  bullet <- if (utf8) "\u2022" else "-"

  study <- attr(x, "study_name")
  header <- if (!is.null(study)) {
    paste0("open.gismo validation \u2014 ", study)
  } else {
    "open.gismo validation"
  }
  cat(header, "\n", sep = "")
  proj <- attr(x, "project_dir")
  if (!is.null(proj)) cat(proj, "\n", sep = "")
  cat("\n")

  if (nrow(x) == 0L) {
    cat("  No input domains are referenced by the mapping workflows.\n")
    return(invisible(x))
  }

  dom_w <- max(nchar(x$domain))
  file_w <- max(nchar(x$file))
  for (i in seq_len(nrow(x))) {
    status <- x$status[[i]]
    detail <- if (status == "missing") {
      "file not found"
    } else if (status == "error") {
      x$problems[[i]]
    } else {
      dims <- sprintf(
        "%s x %s",
        format(x$n_rows[[i]], big.mark = ",", trim = TRUE),
        x$n_cols[[i]]
      )
      if (status == "warning" && nzchar(x$problems[[i]])) {
        paste0(dims, "  \u2014 ", x$problems[[i]])
      } else {
        dims
      }
    }
    cat(sprintf(
      "  %s  %s  %s  %s\n",
      sym[[status]],
      formatC(x$domain[[i]], width = -dom_w),
      formatC(x$file[[i]], width = -file_w),
      detail
    ))
  }

  n_ok <- sum(x$status == "ok")
  n_warn <- sum(x$status == "warning")
  n_bad <- sum(x$status %in% c("error", "missing"))
  cat("\n  ")
  cat(sprintf("%s %d ready", sym[["ok"]], n_ok))
  if (n_warn > 0L) cat(sprintf("   %s %d warning%s", sym[["warning"]], n_warn, if (n_warn > 1L) "s" else ""))
  if (n_bad > 0L) cat(sprintf("   %s %d need attention", sym[["error"]], n_bad))
  cat("\n")

  need <- x[x$status %in% c("error", "missing"), , drop = FALSE]
  if (nrow(need) > 0L) {
    cat("\nFix these before og_run():\n")
    for (i in seq_len(nrow(need))) {
      prob <- if (nzchar(need$problems[[i]])) need$problems[[i]] else "not ready"
      cat(sprintf("  %s %s \u2014 %s\n", bullet, need$domain[[i]], prob))
    }
  } else if (n_warn == 0L) {
    cat("\nAll input domains are ready. Run og_run(\"", proj, "\").\n", sep = "")
  }

  invisible(x)
}
