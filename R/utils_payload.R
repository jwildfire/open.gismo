# utils_payload.R — writers for the project payload files that the static site
# and the app consume: _index.json, status.json, manifest.csv, reports.json.
#
# These are R ports of the payload generation in the demo branch's
# build-site.sh (steps 2 and 3), plus the reports.json contract added for the
# local-first prototype. All writers are filesystem-driven and idempotent:
# they look at what is actually on disk under the project folder and can be
# re-run at any time. og_run() calls them after the pipeline phases complete.

# ---------------------------------------------------------------------------
# _index.json
# ---------------------------------------------------------------------------

#' Write a project's _index.json
#'
#' Writes a JSON array of the project's workflow YAML files (paths relative to
#' the project root, sorted), mirroring build-site.sh's `_index.json`
#' generation. The site uses this file to discover workflows.
#'
#' @param project_dir Character. Path to the project folder.
#'
#' @return Character vector of the relative YAML paths, invisibly.
#' @keywords internal
og_write_index_json <- function(project_dir) {
  paths <- og_project_paths(project_dir)
  rel <- character(0)
  if (dir.exists(paths$workflows)) {
    rel <- list.files(
      paths$workflows,
      pattern = "\\.ya?ml$",
      recursive = TRUE
    )
    rel <- sort(file.path("workflows", rel))
  }
  json <- jsonlite::toJSON(rel)
  writeLines(json, paths$index_json)
  invisible(rel)
}

# ---------------------------------------------------------------------------
# status.json
# ---------------------------------------------------------------------------

# Phase directory -> default workflow type, as in build-site.sh.
.OG_PHASE_TYPE_MAP <- c(
  "1_mappings" = "Mapped",
  "2_metrics" = "Analysis",
  "3_reporting" = "Reporting",
  "4_modules" = "Module"
)

#' Write a project's status.json from workflow YAMLs + output/ contents
#'
#' R port of build-site.sh's status.json generator, with the same
#' file-presence semantics: a workflow step counts as `completed` when its
#' output CSV exists under `output/{phase}/{workflow_id}/`; module workflows
#' also count HTML reports; workflows with no files on disk are `not_run`.
#' The top-level `pipeline_status` is derived from the per-workflow entries:
#' `"completed"` when every workflow completed, `"partial"` when some did, and
#' `"not_run"` when none did (so a partial run does not claim to be complete).
#'
#' @param project_dir Character. Path to the project folder.
#'
#' @return The status list (as written), invisibly.
#' @keywords internal
og_write_status_json <- function(project_dir) {
  paths <- og_project_paths(project_dir)
  rel_yaml <- og_write_index_json(project_dir)

  workflows <- list()
  for (yaml_rel in rel_yaml) {
    entry <- tryCatch(
      .og_status_entry(paths$root, yaml_rel),
      error = function(e) NULL
    )
    if (!is.null(entry)) {
      workflows[[entry$key]] <- entry$value
    }
  }

  # Derive the top-level status from the per-workflow entries rather than
  # hardcoding "completed": a partial run (e.g. og_run(steps = "mappings"))
  # must not claim the whole pipeline finished. Each entry's status is either
  # "completed" or "not_run" (see .og_status_entry).
  wf_statuses <- vapply(
    workflows,
    function(w) w$status %||% "not_run",
    character(1)
  )
  pipeline_status <- if (length(wf_statuses) == 0L) {
    "not_run"
  } else if (all(wf_statuses == "completed")) {
    "completed"
  } else if (any(wf_statuses == "completed")) {
    "partial"
  } else {
    "not_run"
  }

  status <- list(
    pipeline_status = pipeline_status,
    workflows = workflows
  )
  json <- jsonlite::toJSON(status, auto_unbox = TRUE, pretty = TRUE, null = "null")
  writeLines(json, paths$status_json)
  invisible(status)
}

#' Build one status.json workflow entry from a workflow YAML + output dir
#' @param root Character. Project root.
#' @param yaml_rel Character. YAML path relative to the root
#'   (e.g. `workflows/1_mappings/AE.yaml`).
#' @return List with `key` and `value`, or NULL when unparseable.
#' @keywords internal
.og_status_entry <- function(root, yaml_rel) {
  wf <- og_read_yaml(file.path(root, yaml_rel))
  parts <- strsplit(yaml_rel, "/", fixed = TRUE)[[1]]
  phase <- if (length(parts) >= 2) parts[2] else ""
  stem <- sub("\\.ya?ml$", "", basename(yaml_rel))

  wf_type <- wf$meta$Type %||% unname(.OG_PHASE_TYPE_MAP[phase]) %||% "Unknown"
  if (is.na(wf_type)) wf_type <- "Unknown"
  wf_id <- wf$meta$ID %||% stem
  key <- paste0(wf_type, "_", wf_id)

  # Steps declared in the YAML; mappings with a bare `=` step still list it.
  steps <- lapply(wf$steps, function(s) {
    list(name = s$name %||% "", output = s$output %||% "")
  })
  if (length(steps) == 0L) {
    steps <- list(list(name = "=", output = key))
  }

  wf_dir <- file.path(root, "output", phase, wf_id)
  dir_files <- if (dir.exists(wf_dir)) list.files(wf_dir) else character(0)
  wf_completed <- any(grepl("\\.(csv|html)$", dir_files))

  step_statuses <- list()
  for (s in steps) {
    csv_file <- paste0(s$output, ".csv")
    if (csv_file %in% dir_files) {
      step_statuses[[length(step_statuses) + 1L]] <- list(
        name = s$name, output = s$output, status = "completed", error = NULL
      )
    }
  }

  # Modules: list HTML reports as completed outputs.
  if (identical(phase, "4_modules")) {
    for (f in dir_files[grepl("\\.html$", dir_files)]) {
      step_statuses[[length(step_statuses) + 1L]] <- list(
        name = "html_report",
        output = sub("\\.html$", "", f),
        status = "completed",
        error = NULL
      )
    }
  }

  if (length(step_statuses) == 0L && !wf_completed) {
    step_statuses[[1L]] <- list(
      name = steps[[1]]$name,
      output = steps[[1]]$output,
      status = "not_run",
      error = NULL
    )
  }

  all_completed <- wf_completed &&
    all(vapply(step_statuses, function(s) identical(s$status, "completed"), logical(1)))

  list(
    key = key,
    value = list(
      workflow_id = wf_id,
      workflow_type = wf_type,
      phase = phase,
      status = if (all_completed) "completed" else "not_run",
      steps = step_statuses
    )
  )
}

# ---------------------------------------------------------------------------
# manifest.csv
# ---------------------------------------------------------------------------

# Packages recorded in a project's manifest.csv, in order.
.OG_MANIFEST_PACKAGES <- c(
  "gsm.core", "gsm.mapping", "gsm.kri", "gsm.reporting", "workr", "open.gismo"
)

#' Write a project's manifest.csv of installed pipeline package versions
#'
#' Records `org,package,version,repository,url,sha` for the packages that
#' produced the payload (gsm.core/mapping/kri/reporting, workr, open.gismo).
#' Versions come from the installed library via [utils::packageVersion()];
#' `url` and `sha` are left blank (a local run is not pinned to GitHub
#' archives the way the Actions lane is). Packages that are not installed are
#' listed with an empty version rather than dropped.
#'
#' @param project_dir Character. Path to the project folder.
#'
#' @return The manifest data.frame, invisibly.
#' @keywords internal
og_write_manifest <- function(project_dir) {
  paths <- og_project_paths(project_dir)
  pkgs <- .OG_MANIFEST_PACKAGES
  versions <- vapply(
    pkgs,
    function(p) {
      tryCatch(as.character(utils::packageVersion(p)), error = function(e) "")
    },
    character(1)
  )
  manifest <- data.frame(
    org = "Gilead-BioStats",
    package = pkgs,
    version = versions,
    repository = paste0("https://github.com/Gilead-BioStats/", pkgs),
    url = "",
    sha = "",
    stringsAsFactors = FALSE
  )
  utils::write.csv(manifest, paths$manifest, row.names = FALSE)
  invisible(manifest)
}

# ---------------------------------------------------------------------------
# reports.json
# ---------------------------------------------------------------------------

#' Write a project's reports.json (interactive reports + static charts)
#'
#' Scans `output/4_modules/` for rendered interactive KRI reports
#' (`report_kri_site/`, `report_kri_country/`) and static chart PNGs
#' (`static/`), and writes the `reports.json` payload consumed by the site's
#' Reports tab and by `og_app()`. Titles come from the project's workflow
#' YAML metadata when available (`4_modules/{id}.yaml` `meta.Name` for
#' reports; `2_metrics/{metric}.yaml` `meta.Metric` for charts).
#'
#' @param project_dir Character. Path to the project folder.
#'
#' @return The reports list (as written), invisibly.
#' @keywords internal
og_write_reports_json <- function(project_dir) {
  paths <- og_project_paths(project_dir)
  modules_dir <- file.path(paths$output, "4_modules")

  reports <- list()
  for (id in .og_module_ids(paths$root)) {
    report_dir <- file.path(modules_dir, id)
    htmls <- if (dir.exists(report_dir)) {
      sort(list.files(report_dir, pattern = "\\.html$"))
    } else {
      character(0)
    }
    group_level <- .og_module_group_level(id)
    title <- .og_module_title(paths$root, id, group_level)
    for (f in htmls) {
      reports[[length(reports) + 1L]] <- list(
        id = id,
        title = title,
        html = paste("output/4_modules", id, f, sep = "/"),
        group_level = group_level
      )
    }
  }

  static_dir <- file.path(modules_dir, "static")
  pngs <- if (dir.exists(static_dir)) {
    sort(list.files(static_dir, pattern = "\\.png$"))
  } else {
    character(0)
  }
  static_charts <- lapply(pngs, function(f) {
    metric <- sub("\\.png$", "", f)
    list(
      metric = metric,
      title = .og_metric_title(paths$root, metric),
      png = paste("output/4_modules/static", f, sep = "/")
    )
  })

  payload <- list(reports = reports, static_charts = static_charts)
  json <- jsonlite::toJSON(payload, auto_unbox = TRUE, pretty = TRUE, null = "null")
  dir.create(modules_dir, showWarnings = FALSE, recursive = TRUE)
  writeLines(json, file.path(modules_dir, "reports.json"))
  invisible(payload)
}

#' The report modules this project defines
#'
#' Read from `workflows/4_modules/*.yaml` rather than hard-coded, so a study
#' that snapshots another package's report module — gsm.qtl's QTL report, say —
#' gets it listed in `reports.json` without a change here. Falls back to the two
#' gsm.kri reports when the project has no module workflows to read.
#' @keywords internal
.og_module_ids <- function(root) {
  dir <- file.path(root, "workflows", "4_modules")
  yamls <- if (dir.exists(dir)) {
    sort(list.files(dir, pattern = "\\.ya?ml$", full.names = TRUE))
  } else {
    character(0)
  }
  ids <- vapply(
    yamls,
    function(f) {
      meta <- tryCatch(og_read_yaml(f)$meta, error = function(e) NULL)
      id <- meta$ID %||% tools::file_path_sans_ext(basename(f))
      as.character(id)[1]
    },
    character(1),
    USE.NAMES = FALSE
  )
  ids <- unique(ids[nzchar(ids)])
  if (!length(ids)) c("report_kri_site", "report_kri_country") else ids
}

#' The group level a report module reports at
#'
#' Named for the level, not defaulted to it: a study-level module (the QTLs)
#' would otherwise be labelled a site report because "site" is absent from its
#' name.
#' @keywords internal
.og_module_group_level <- function(id) {
  if (grepl("country", id, ignore.case = TRUE)) return("Country")
  if (grepl("site", id, ignore.case = TRUE)) return("Site")
  "Study"
}

#' Human-readable title for a report module, from its workflow YAML meta
#' @keywords internal
.og_module_title <- function(root, id, group_level) {
  yaml_path <- file.path(root, "workflows", "4_modules", paste0(id, ".yaml"))
  if (file.exists(yaml_path)) {
    meta <- tryCatch(og_read_yaml(yaml_path)$meta, error = function(e) NULL)
    if (!is.null(meta$Name) && nzchar(meta$Name)) {
      return(meta$Name)
    }
  }
  paste0(group_level, " KRI Report (interactive)")
}

#' Human-readable title for a metric, from its workflow YAML meta
#' @keywords internal
.og_metric_title <- function(root, metric_id) {
  yaml_path <- file.path(root, "workflows", "2_metrics", paste0(metric_id, ".yaml"))
  if (file.exists(yaml_path)) {
    meta <- tryCatch(og_read_yaml(yaml_path)$meta, error = function(e) NULL)
    if (!is.null(meta$Metric) && nzchar(meta$Metric)) {
      return(meta$Metric)
    }
  }
  metric_id
}
