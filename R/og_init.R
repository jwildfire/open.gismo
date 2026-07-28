# og_init.R — scaffold a self-contained local-first open.gismo project folder.

# ---------------------------------------------------------------------------
# Example data (mirrors the demo branch's input/initData.R)
#
# The demo derives its example CSVs from gsm.core::lSource with a handful of
# column renames and two per-subject row caps (LB and DATACHG) that keep the
# pipeline runtime reasonable. We reproduce those transforms in base R so the
# example project is byte-for-byte comparable to the demo without pulling in a
# {dplyr} dependency.
# ---------------------------------------------------------------------------

#' The example input domains written by og_init(example = TRUE), in the order
#' the demo's initData.R writes them.
#' @keywords internal
.og_example_domains <- function() {
  c(
    "Raw_SUBJ", "Raw_AE", "Raw_PD", "Raw_LB", "Raw_PK", "Raw_STUDCOMP",
    "Raw_SDRGCOMP", "Raw_DATACHG", "Raw_DATAENT", "Raw_QUERY", "Raw_ENROLL",
    "Raw_SITE", "Raw_STUDY"
  )
}

#' Rename data.frame columns (old name -> new name), skipping absent columns.
#' @keywords internal
.og_rename_cols <- function(df, mapping) {
  for (old in names(mapping)) {
    hit <- which(names(df) == old)
    if (length(hit) == 1L) names(df)[hit] <- mapping[[old]]
  }
  df
}

#' Keep the first `max_rows` rows per group after ordering — the base-R twin of
#' the demo's dplyr arrange() + group_by() + slice_head().
#' @keywords internal
.og_cap_rows_per_group <- function(df, group_col, order_cols, max_rows) {
  ord <- do.call(order, unname(as.list(df[c(group_col, order_cols)])))
  df <- df[ord, , drop = FALSE]
  # df is now sorted by group, so equal group values are contiguous; the within
  # group position is just the position within each run-length block.
  pos <- sequence(rle(as.character(df[[group_col]]))$lengths)
  df[pos <= max_rows, , drop = FALSE]
}

#' Build one example domain data.frame from gsm.core::lSource.
#' @keywords internal
.og_example_domain <- function(domain) {
  src <- gsm.core::lSource
  max_lb <- 1000L
  max_datachg <- 1000L
  switch(
    domain,
    Raw_SUBJ = src$Raw_SUBJ,
    Raw_AE = src$Raw_AE,
    Raw_PD = .og_rename_cols(src$Raw_PD, list(
      subjectenrollmentnumber = "subjid",
      crocategory = "dvdecod",
      description = "dvterm",
      deviationdate = "dvdtm"
    )),
    Raw_LB = .og_cap_rows_per_group(
      src$Raw_LB, "subjid",
      c("lb_dt", "visnam", "lbtstnam", "battrnam"), max_lb
    ),
    Raw_PK = .og_rename_cols(src$Raw_PK, list(foldername = "visit")),
    Raw_STUDCOMP = src$Raw_STUDCOMP,
    Raw_SDRGCOMP = src$Raw_SDRGCOMP,
    Raw_DATACHG = .og_rename_cols(
      .og_cap_rows_per_group(
        src$Raw_DATACHG, "subjectname",
        c("visit_date", "visnam", "form", "field"), max_datachg
      ),
      list(subjectname = "subject_nsv")
    ),
    Raw_DATAENT = .og_rename_cols(src$Raw_DATAENT, list(subjectname = "subject_nsv")),
    Raw_QUERY = .og_rename_cols(src$Raw_QUERY, list(subjectname = "subject_nsv")),
    Raw_ENROLL = src$Raw_ENROLL,
    Raw_SITE = .og_rename_cols(src$Raw_SITE, list(
      protocol = "studyid",
      pi_number = "invid",
      pi_first_name = "InvestigatorFirstName",
      pi_last_name = "InvestigatorLastName",
      city = "City",
      state = "State",
      country = "Country"
    )),
    Raw_STUDY = .og_rename_cols(src$Raw_STUDY, list(protocol_number = "studyid")),
    stop("Unknown example domain: ", domain, call. = FALSE)
  )
}

#' Write example input CSVs into a project's input/ directory
#'
#' @param input_dir Character. The project's `input/` directory.
#' @param domains Character vector of domains to write (default: all example
#'   domains). Restricting this is mainly useful for fast tests.
#' @param overwrite Logical. Overwrite existing input files? When `FALSE`, an
#'   existing file for a domain is left untouched (so user-supplied data wins).
#' @param quiet Logical. Suppress per-file messages.
#'
#' @return Character vector of files written, invisibly.
#' @keywords internal
.og_write_example_data <- function(input_dir, domains = .og_example_domains(),
                                   overwrite = FALSE, quiet = TRUE) {
  if (!requireNamespace("gsm.core", quietly = TRUE)) {
    stop(
      "Example data requires the 'gsm.core' package (for gsm.core::lSource). ",
      "Install it, or call og_init(..., example = FALSE) and add your own ",
      "Raw_*.csv files to input/.",
      call. = FALSE
    )
  }
  dir.create(input_dir, showWarnings = FALSE, recursive = TRUE)
  written <- character(0)
  for (domain in domains) {
    dest <- file.path(input_dir, paste0(domain, ".csv"))
    if (file.exists(dest) && !overwrite) {
      if (!quiet) message("  keeping existing ", basename(dest))
      next
    }
    df <- .og_example_domain(domain)
    utils::write.csv(df, dest, row.names = FALSE)
    written <- c(written, dest)
    if (!quiet) {
      message(sprintf("  wrote %s (%d x %d)", basename(dest), nrow(df), ncol(df)))
    }
  }
  invisible(written)
}

# ---------------------------------------------------------------------------
# Workflow snapshotting
# ---------------------------------------------------------------------------

#' Copy the canonical workflow set out of the installed gsm packages.
#' @keywords internal
.og_copy_workflows <- function(workflows_dir) {
  missing <- character(0)
  copied <- 0L
  for (phase in .OG_PHASES) {
    src <- .OG_WORKFLOW_SOURCES[[phase]]
    dest_dir <- file.path(workflows_dir, phase)
    dir.create(dest_dir, showWarnings = FALSE, recursive = TRUE)
    for (id in .OG_WORKFLOW_SET[[phase]]) {
      rel <- file.path(src$subdir, paste0(id, ".yaml"))
      from <- system.file(rel, package = src$package)
      if (!nzchar(from) || !file.exists(from)) {
        missing <- c(missing, sprintf("%s (%s)", id, src$package))
        next
      }
      file.copy(from, file.path(dest_dir, paste0(id, ".yaml")), overwrite = TRUE)
      copied <- copied + 1L
    }
  }
  if (length(missing) > 0L) {
    stop(
      "Could not find these workflow files in the installed gsm packages:\n  ",
      paste(missing, collapse = "\n  "),
      "\nEnsure gsm.mapping, gsm.kri, and gsm.reporting are installed at ",
      "compatible versions.",
      call. = FALSE
    )
  }
  copied
}

# ---------------------------------------------------------------------------
# og_init
# ---------------------------------------------------------------------------

#' Scaffold a self-contained open.gismo project folder
#'
#' Creates a local-first project folder: study/data/package configuration under
#' `config/`, the demo-proven analysis workflows snapshotted from the installed
#' gsm packages under `workflows/`, an `input/` directory for `Raw_*.csv` data,
#' and an empty `output/` directory that [og_run()] populates. Optionally seeds
#' `input/` with the bundled example data so you can run the whole pipeline
#' immediately.
#'
#' The resulting folder is fully portable — copy, zip, or version-control it —
#' and needs neither a database nor a server.
#'
#' @param project_dir Character. Path to the project folder to create. Created
#'   (recursively) if it does not exist.
#' @param example Logical. Seed `input/` with example `Raw_*.csv` data derived
#'   from `gsm.core::lSource`? Default `TRUE`. Existing input files are never
#'   clobbered unless `overwrite = TRUE`. Requires the `gsm.core` package.
#' @param overwrite Logical. Reinitialize a folder that already looks like an
#'   open.gismo project, overwriting config, workflows, and (with
#'   `example = TRUE`) input data? Default `FALSE`, which errors on an
#'   already-initialized folder.
#'
#' @return `project_dir`, invisibly.
#' @export
#'
#' @examples
#' \dontrun{
#' # Fresh project seeded with example data
#' og_init("~/my-study", example = TRUE)
#'
#' # Empty scaffold to drop your own Raw_*.csv files into
#' og_init("~/my-study", example = FALSE)
#' }
og_init <- function(project_dir, example = TRUE, overwrite = FALSE) {
  if (!is.character(project_dir) || length(project_dir) != 1L || is.na(project_dir)) {
    stop("`project_dir` must be a single, non-missing file path.", call. = FALSE)
  }
  paths <- og_project_paths(project_dir)

  initialized <- file.exists(paths$study_config) || dir.exists(paths$workflows)
  if (initialized && !isTRUE(overwrite)) {
    stop(
      "A project already exists at:\n  ", paths$root,
      "\nUse og_init(..., overwrite = TRUE) to reinitialize it, or choose a ",
      "different folder.",
      call. = FALSE
    )
  }

  # Directory skeleton.
  dir.create(paths$root, showWarnings = FALSE, recursive = TRUE)
  dir.create(paths$config, showWarnings = FALSE, recursive = TRUE)
  dir.create(paths$input, showWarnings = FALSE, recursive = TRUE)
  dir.create(paths$output, showWarnings = FALSE, recursive = TRUE)
  dir.create(paths$workflows, showWarnings = FALSE, recursive = TRUE)

  # Workflows snapshotted from the installed gsm packages.
  n_workflows <- .og_copy_workflows(paths$workflows)

  # Config + README templates shipped with the package.
  .og_copy_template("project/config/study-config.yaml", paths$study_config)
  .og_copy_template("project/config/data-config.yaml", paths$data_config)
  .og_copy_template("project/config/packages.yaml", paths$packages_config)
  .og_copy_template("project/README.md", paths$readme)

  # Optional example data.
  n_input <- 0L
  if (isTRUE(example)) {
    written <- .og_write_example_data(paths$input, overwrite = overwrite)
    n_input <- length(written)
  }

  # Copy the built site SPA if it is present in the package (it may not exist
  # until the site is built during integration — guard on file.exists).
  site_index <- .og_inst_file("site/index.html")
  if (nzchar(site_index) && file.exists(site_index)) {
    file.copy(site_index, paths$index_html, overwrite = TRUE)
  }

  message(
    "Initialized open.gismo project at:\n  ", paths$root, "\n",
    "  ", n_workflows, " workflows snapshotted, ",
    if (isTRUE(example)) paste0(n_input, " example input files written.") else
      "input/ is empty \u2014 add your Raw_*.csv files.", "\n",
    "Next: og_validate(\"", paths$root, "\")"
  )
  invisible(project_dir)
}

#' Copy a packaged template into place, erroring clearly if it is missing.
#' @keywords internal
.og_copy_template <- function(rel_path, dest) {
  from <- .og_inst_file(rel_path)
  if (!nzchar(from) || !file.exists(from)) {
    stop(
      "Packaged template not found: ", rel_path,
      " (open.gismo installation may be incomplete).",
      call. = FALSE
    )
  }
  dir.create(dirname(dest), showWarnings = FALSE, recursive = TRUE)
  file.copy(from, dest, overwrite = TRUE)
  invisible(dest)
}
