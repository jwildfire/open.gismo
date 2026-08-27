# utils_project.R — shared helpers for local-first open.gismo projects
#
# Small utilities used by og_init(), og_validate(), and og_run() to locate the
# pieces of a project folder, read/write its YAML config, and snapshot the
# canonical demo-proven workflow set out of the installed gsm packages.

# ---------------------------------------------------------------------------
# Canonical workflow set
#
# The installed gsm packages ship MORE workflows than the demo-proven pipeline
# uses (e.g. gsm.mapping also ships AntiCancer, Baseline, Death, ...). The
# local-first prototype snapshots exactly the set that the demo branch runs
# end-to-end. This list is derived from
#   git ls-tree -r origin/demo --name-only | grep '^workflows/'
# and is hard-coded here as the single source of truth so og_init() copies a
# reproducible, verified set regardless of which extra workflows happen to be
# installed.
# ---------------------------------------------------------------------------

# Phase subdirectories of a project's `workflows/` folder, in run order.
.OG_PHASES <- c("1_mappings", "2_metrics", "3_reporting", "4_modules")

# Canonical demo-proven workflow IDs per phase.
.OG_WORKFLOW_SET <- list(
  "1_mappings" = c(
    "AE", "COUNTRY", "DATACHG", "DATAENT", "ENROLL", "LB", "PD", "QUERY",
    "SDRGCOMP", "SITE", "STUDCOMP", "STUDY", "SUBJ"
  ),
  "2_metrics" = c(
    sprintf("cou%04d", 1:12),
    sprintf("kri%04d", 1:12),
    "srs0001"
  ),
  "3_reporting" = c("Bounds", "Groups", "Metrics", "Results"),
  "4_modules" = c("report_kri_country", "report_kri_site")
)

# Where each phase's workflow YAMLs are snapshotted from (installed package +
# subdirectory under that package's `inst/`).
.OG_WORKFLOW_SOURCES <- list(
  "1_mappings" = list(package = "gsm.mapping", subdir = "workflow/1_mappings"),
  "2_metrics" = list(package = "gsm.kri", subdir = "workflow/2_metrics"),
  "3_reporting" = list(package = "gsm.reporting", subdir = "workflow/3_reporting"),
  "4_modules" = list(package = "gsm.kri", subdir = "workflow/4_modules")
)

# ---------------------------------------------------------------------------
# Path resolution
# ---------------------------------------------------------------------------

#' Standard paths inside a local-first project folder
#'
#' Returns the canonical locations of every part of an open.gismo project
#' folder so callers never hard-code path fragments. All paths are absolute
#' (the root is normalized; sub-paths are built from it) but the folder need
#' not exist yet — this is pure path arithmetic.
#'
#' @param project_dir Character. Path to the project folder (created by
#'   [og_init()]).
#'
#' @return A named list with elements `root`, `config`, `study_config`,
#'   `data_config`, `packages_config`, `workflows`, `input`, `output`,
#'   `readme`, `index_html`, `manifest`, `index_json`, and `status_json`.
#' @export
#'
#' @examples
#' paths <- og_project_paths(tempfile("study"))
#' basename(paths$data_config)
og_project_paths <- function(project_dir) {
  if (!is.character(project_dir) || length(project_dir) != 1L || is.na(project_dir)) {
    stop("`project_dir` must be a single, non-missing file path.", call. = FALSE)
  }
  root <- normalizePath(project_dir, winslash = "/", mustWork = FALSE)
  config <- file.path(root, "config")
  list(
    root = root,
    config = config,
    study_config = file.path(config, "study-config.yaml"),
    data_config = file.path(config, "data-config.yaml"),
    packages_config = file.path(config, "packages.yaml"),
    workflows = file.path(root, "workflows"),
    input = file.path(root, "input"),
    output = file.path(root, "output"),
    history = file.path(root, "history"),
    readme = file.path(root, "README.md"),
    index_html = file.path(root, "index.html"),
    manifest = file.path(root, "manifest.csv"),
    index_json = file.path(root, "_index.json"),
    status_json = file.path(root, "status.json")
  )
}

# ---------------------------------------------------------------------------
# YAML wrappers (guarded so a missing {yaml} fails with a clear message)
# ---------------------------------------------------------------------------

#' Error clearly if the {yaml} package is unavailable
#' @keywords internal
.og_require_yaml <- function() {
  if (!requireNamespace("yaml", quietly = TRUE)) {
    stop(
      "The 'yaml' package is required to read and write open.gismo project ",
      "configuration. Install it with install.packages(\"yaml\").",
      call. = FALSE
    )
  }
  invisible(TRUE)
}

#' Read a YAML file into an R list
#'
#' Thin wrapper over [yaml::read_yaml()] that gives a clear error when the file
#' is missing or {yaml} is not installed.
#'
#' @param path Character. Path to a `.yaml` file.
#'
#' @return The parsed YAML as an R list.
#' @export
og_read_yaml <- function(path) {
  .og_require_yaml()
  if (!file.exists(path)) {
    stop("YAML file not found: ", path, call. = FALSE)
  }
  yaml::read_yaml(path)
}

#' Write an R object to a YAML file
#'
#' Thin wrapper over [yaml::write_yaml()] that creates the parent directory if
#' needed and gives a clear error when {yaml} is not installed.
#'
#' @param x An R object to serialize.
#' @param path Character. Destination `.yaml` path.
#'
#' @return `path`, invisibly.
#' @export
og_write_yaml <- function(x, path) {
  .og_require_yaml()
  dir.create(dirname(path), showWarnings = FALSE, recursive = TRUE)
  yaml::write_yaml(x, path)
  invisible(path)
}

#' Read a project's data-config.yaml into a flat domain -> path map
#'
#' The local-first `data-config.yaml` maps each input data domain to the CSV
#' file that supplies it, relative to the project root, e.g.
#' `Raw_AE: input/Raw_AE.csv`. This reader returns that mapping as a flat named
#' list so callers can look up a path directly with `cfg[[domain]]`.
#'
#' For resilience it also accepts the older nested form used by the GitHub demo
#' (a top-level `domains:` key whose values are either path strings or lists
#' with a `path:` field) and flattens it to the same shape.
#'
#' @param project_dir Character. Path to the project folder.
#'
#' @return A named list mapping domain name to a path string (relative to the
#'   project root). Empty list if no data-config.yaml is present.
#' @export
og_read_data_config <- function(project_dir) {
  paths <- og_project_paths(project_dir)
  if (!file.exists(paths$data_config)) {
    return(list())
  }
  cfg <- og_read_yaml(paths$data_config)
  if (is.null(cfg) || length(cfg) == 0L) {
    return(list())
  }
  # Unwrap the nested demo form: domains: { Raw_AE: {path: ...} }
  if (!is.null(cfg$domains)) {
    cfg <- cfg$domains
  }
  # Flatten any list-valued entries down to their `path` field.
  flat <- lapply(cfg, function(v) {
    if (is.list(v)) {
      if (!is.null(v$path)) as.character(v$path) else NA_character_
    } else {
      as.character(v)
    }
  })
  flat[!vapply(flat, function(v) length(v) == 0L || is.na(v[1]), logical(1))]
}

#' Resolve the input CSV path for a data domain
#'
#' Uses the data-config mapping when present, otherwise falls back to the
#' convention `input/{domain}.csv`. Returns the path relative to the project
#' root (as stored in data-config) unless `absolute = TRUE`.
#'
#' @param domain Character. Data domain name (e.g. `"Raw_AE"`).
#' @param data_config Named list from [og_read_data_config()].
#' @param project_dir Character. Project root, used when `absolute = TRUE`.
#' @param absolute Logical. Return an absolute path? Default `FALSE`.
#'
#' @return A single path string.
#' @keywords internal
.og_domain_path <- function(domain, data_config, project_dir = NULL, absolute = FALSE) {
  rel <- data_config[[domain]]
  if (is.null(rel) || is.na(rel) || !nzchar(rel)) {
    rel <- file.path("input", paste0(domain, ".csv"))
  }
  if (isTRUE(absolute) && !is.null(project_dir)) {
    return(file.path(og_project_paths(project_dir)$root, rel))
  }
  rel
}

# ---------------------------------------------------------------------------
# Packaged template / asset resolution (works under devtools::load_all too)
# ---------------------------------------------------------------------------

#' Locate a file shipped in open.gismo's inst/ directory
#'
#' Resolves via [system.file()] first (works once installed and under
#' `devtools::load_all()`), then falls back to searching upward from the
#' package source for an `inst/{rel_path}` during development before install.
#'
#' @param rel_path Character. Path relative to the package's `inst/` directory,
#'   e.g. `"project/config/study-config.yaml"`.
#'
#' @return An existing file path, or `""` if not found.
#' @keywords internal
.og_inst_file <- function(rel_path) {
  hit <- system.file(rel_path, package = "open.gismo")
  if (nzchar(hit) && file.exists(hit)) {
    return(hit)
  }
  # Dev fallback: walk up from likely roots looking for inst/{rel_path}.
  candidates <- unique(c(
    getwd(),
    system.file(package = "open.gismo"),
    dirname(system.file(package = "open.gismo"))
  ))
  for (base in candidates) {
    if (!nzchar(base)) next
    dir <- base
    for (i in seq_len(5L)) {
      cand <- file.path(dir, "inst", rel_path)
      if (file.exists(cand)) {
        return(normalizePath(cand, winslash = "/", mustWork = FALSE))
      }
      parent <- dirname(dir)
      if (identical(parent, dir)) break
      dir <- parent
    }
  }
  ""
}
