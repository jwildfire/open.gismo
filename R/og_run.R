# og_run.R — run the full local pipeline inside a project folder.
#
# Generalizes the demo branch's runWorkflows.R: four workr phases
# (mappings -> metrics -> reporting -> report modules) run from the project's
# snapshotted workflows/, with the GroupID standardization seam executed as a
# real workflow step between metrics and reporting. Outputs land in the
# demo-branch-compatible output/ layout, and the payload files the site and
# app consume (_index.json, status.json, manifest.csv, reports.json) are
# regenerated at the end of every run.

# Canonical phase order. `steps` must be a prefix of this vector because each
# phase consumes the previous phase's in-memory results.
.OG_RUN_STEPS <- c("mappings", "metrics", "reporting", "reports")

#' Run the open.gismo pipeline in a local project folder
#'
#' Executes the proven four-phase gsm pipeline against the project created by
#' [og_init()]:
#'
#' 1. **mappings** — raw input CSVs -> standardized `Mapped_*` domains
#'    (`workflows/1_mappings`).
#' 2. **metrics** — mapped domains -> per-metric analysis results
#'    (`workflows/2_metrics`), followed by the [StandardizeResults()]
#'    workflow step that coerces `GroupID` to character.
#' 3. **reporting** — analysis results -> the reporting data model
#'    (`workflows/3_reporting`).
#' 4. **reports** — reporting model -> interactive KRI report HTML files plus
#'    static chart PNGs (`workflows/4_modules`).
#'
#' Each phase loads its workflows with [workr::MakeWorkflowList()] and runs
#' them with [workr::RunWorkflows()]. Results are written to
#' `output/{phase}/...` in the demo-branch layout, and the payload files
#' consumed by the bundled site and [og_app()] (`_index.json`, `status.json`,
#' `manifest.csv`, `output/4_modules/reports.json`) are regenerated after the
#' run. If the packaged site page is available, it is copied to the project
#' root as `index.html`.
#'
#' Because later phases consume earlier phases' in-memory results, `steps`
#' must be a prefix of `c("mappings", "metrics", "reporting", "reports")`
#' (e.g. `c("mappings", "metrics")` is valid; `"reporting"` alone is not).
#'
#' @param project_dir Character. Path to a project folder created by
#'   [og_init()].
#' @param steps Character vector. Which pipeline phases to run, in order;
#'   must be a prefix of `c("mappings", "metrics", "reporting", "reports")`.
#'   Default: all four.
#' @param quiet Logical. Suppress workr's per-step logging and og_run's
#'   progress messages? Default `FALSE`.
#' @param open Logical. Open the project site (`index.html`) — or, if the
#'   site page is absent, the first rendered KRI report — in the browser when
#'   the run finishes? Default `FALSE`.
#'
#' @return Invisibly, a list with:
#'   * `project_dir` — normalized project root.
#'   * `steps` — the phases that ran.
#'   * `timings` — named numeric, wall-clock seconds per phase (plus
#'     `payload` and `total`).
#'   * `counts` — named integer: mapped domains, analyzed metrics, reporting
#'     objects, rendered reports, static charts (and static chart failures).
#'   * `reports` — the reports.json payload (list with `reports` and
#'     `static_charts`), when the reports phase ran.
#' @seealso [og_init()] to scaffold the project, [og_validate()] to check
#'   inputs first, [og_view()] to serve the results, [og_app()] for the
#'   interactive shell.
#' @export
#'
#' @examples
#' \dontrun{
#' og_init("~/my-study", example = TRUE)
#' og_validate("~/my-study")
#' og_run("~/my-study", open = TRUE)
#' }
og_run <- function(
  project_dir,
  steps = c("mappings", "metrics", "reporting", "reports"),
  quiet = FALSE,
  open = FALSE
) {
  paths <- og_project_paths(project_dir)
  .og_check_run_preconditions(paths, steps)
  steps <- .og_check_run_steps(steps)
  .og_attach_pipeline_packages(steps)

  say <- function(...) if (!isTRUE(quiet)) message(...)
  run_phase <- function(expr) {
    if (isTRUE(quiet)) suppressMessages(suppressWarnings(expr)) else expr
  }

  timings <- c()
  counts <- c()
  t_start <- Sys.time()
  tick <- function(label, since) {
    elapsed <- as.numeric(difftime(Sys.time(), since, units = "secs"))
    timings[[label]] <<- round(elapsed, 2)
    say(sprintf("  ... %s done in %.1fs", label, elapsed))
  }

  # --- Load raw input data (per data-config, plus any extra input/*.csv) ---
  say("Loading input data ...")
  t0 <- Sys.time()
  lRaw <- .og_load_input(paths, quiet = quiet)
  counts[["input_domains"]] <- length(lRaw)
  tick("input", t0)

  mapped <- NULL
  analyzed <- NULL
  reporting <- NULL
  metrics_wf <- NULL
  reports_payload <- NULL

  # --- Phase 1: mappings ---
  if ("mappings" %in% steps) {
    say("Phase 1/4: mappings ...")
    t0 <- Sys.time()
    mappings_wf <- workr::MakeWorkflowList(
      strPath = file.path(paths$workflows, "1_mappings")
    )
    mapped <- run_phase(workr::RunWorkflows(mappings_wf, lRaw))
    .og_clean_phase_dir(paths, "1_mappings")
    .og_save_phase_outputs(mapped, "1_mappings", paths, prefix = "Mapped_")
    counts[["mapped"]] <- length(mapped)
    tick("mappings", t0)
  }

  # --- Phase 2: metrics (+ GroupID standardization seam) ---
  if ("metrics" %in% steps) {
    say("Phase 2/4: metrics ...")
    t0 <- Sys.time()
    metrics_wf <- workr::MakeWorkflowList(
      strPath = file.path(paths$workflows, "2_metrics")
    )
    n_all <- length(metrics_wf)
    metrics_wf <- .og_filter_active(metrics_wf)
    if (length(metrics_wf) < n_all && !quiet) {
      say(sprintf(
        "Skipping %d inactive metric(s) (meta Active: false)",
        n_all - length(metrics_wf)
      ))
    }
    analyzed <- run_phase(
      workr::RunWorkflows(metrics_wf, c(mapped, list(lWorkflows = metrics_wf)))
    )
    analyzed <- run_phase(.og_standardize_analyzed(analyzed))
    .og_clean_phase_dir(paths, "2_metrics")
    .og_save_metric_outputs(analyzed, paths)
    counts[["analyzed"]] <- length(analyzed)
    tick("metrics", t0)
  }

  # --- Phase 3: reporting ---
  if ("reporting" %in% steps) {
    say("Phase 3/4: reporting ...")
    t0 <- Sys.time()
    reporting_wf <- workr::MakeWorkflowList(
      strPath = file.path(paths$workflows, "3_reporting")
    )
    reporting <- run_phase(
      workr::RunWorkflows(reporting_wf, c(mapped, list(
        lAnalyzed = analyzed,
        lWorkflows = metrics_wf,
        dSnapshotDate = Sys.Date(),
        Reporting_Results_Longitudinal = NULL
      )))
    )
    .og_clean_phase_dir(paths, "3_reporting")
    .og_save_phase_outputs(reporting, "3_reporting", paths, prefix = "Reporting_")
    counts[["reporting"]] <- length(reporting)
    tick("reporting", t0)
  }

  # --- Phase 4: report modules + static charts ---
  if ("reports" %in% steps) {
    say("Phase 4/4: reports ...")
    t0 <- Sys.time()
    module_wf <- workr::MakeWorkflowList(
      strPath = file.path(paths$workflows, "4_modules")
    )
    # Report modules write kri_report_*.html into the working directory;
    # run the phase from the project root so they land inside the project.
    old_wd <- setwd(paths$root)
    on.exit(setwd(old_wd), add = TRUE)
    lReports <- run_phase(workr::RunWorkflows(module_wf, reporting))
    setwd(old_wd)
    # Clean only AFTER RunWorkflows succeeds (mirroring phases 1-3), so a failed
    # rerun keeps the previous run's reports/reports.json instead of wiping them
    # with no replacement. Modules write their HTML to the project root, not
    # output/4_modules, so nothing needs the directory pre-cleaned.
    .og_clean_phase_dir(paths, "4_modules")
    n_moved <- .og_move_report_html(paths)
    counts[["reports"]] <- n_moved
    tick("reports", t0)

    say("Rendering static charts ...")
    t0 <- Sys.time()
    static <- .og_render_static_charts(reporting, paths, quiet = quiet)
    counts[["static_charts"]] <- static$saved
    counts[["static_failures"]] <- static$failed
    tick("static_charts", t0)
  }

  # --- Payload files (site + app contract) ---
  say("Writing payload files ...")
  t0 <- Sys.time()
  og_write_status_json(paths$root) # also writes _index.json
  og_write_manifest(paths$root)
  reports_payload <- og_write_reports_json(paths$root)
  .og_copy_site_page(paths)
  tick("payload", t0)

  timings[["total"]] <- round(
    as.numeric(difftime(Sys.time(), t_start, units = "secs")),
    2
  )
  say(sprintf("og_run() complete in %.1fs", timings[["total"]]))

  if (isTRUE(open)) {
    .og_open_result(paths, reports_payload)
  }

  invisible(list(
    project_dir = paths$root,
    steps = steps,
    timings = unlist(timings),
    counts = unlist(counts),
    reports = reports_payload
  ))
}

# ---------------------------------------------------------------------------
# Precondition + argument checks
# ---------------------------------------------------------------------------

#' Validate that a project folder is runnable
#' @keywords internal
.og_check_run_preconditions <- function(paths, steps) {
  if (!dir.exists(paths$root)) {
    stop(
      "Project folder not found: ", paths$root,
      "\nCreate one with og_init().",
      call. = FALSE
    )
  }
  if (!dir.exists(paths$workflows)) {
    stop(
      "No workflows/ directory in ", paths$root,
      " - is this an open.gismo project? Create one with og_init().",
      call. = FALSE
    )
  }
  for (pkg in c("workr", "yaml")) {
    if (!requireNamespace(pkg, quietly = TRUE)) {
      stop(
        "Package '", pkg, "' is required by og_run(). ",
        "Install it and try again.",
        call. = FALSE
      )
    }
  }
  invisible(TRUE)
}

#' Attach the gsm packages the requested phases need
#'
#' Workflow YAML steps reference some functions unqualified (e.g.
#' `Analyze_NormalApprox` from gsm.kri), which workr resolves through the
#' search path — the demo pipeline script `library()`s the gsm packages
#' before running for exactly this reason. This helper does the same for
#' og_run(): it attaches gsm.core, gsm.mapping, gsm.kri, and gsm.reporting
#' (as required by the requested `steps`), erroring with an actionable
#' message when one is not installed.
#' @keywords internal
.og_attach_pipeline_packages <- function(steps) {
  needed <- c("gsm.core", "gsm.mapping")
  if (any(c("metrics", "reports") %in% steps)) {
    needed <- c(needed, "gsm.kri")
  }
  if ("reporting" %in% steps) {
    needed <- c(needed, "gsm.reporting")
  }
  missing <- needed[!vapply(
    needed, requireNamespace, logical(1),
    quietly = TRUE
  )]
  if (length(missing) > 0L) {
    stop(
      "og_run() needs these packages installed: ",
      paste(missing, collapse = ", "),
      ". Install them with pak::pak(c(",
      paste0('"Gilead-BioStats/', missing, '"', collapse = ", "),
      ")).",
      call. = FALSE
    )
  }
  for (pkg in needed) {
    if (!paste0("package:", pkg) %in% search()) {
      suppressPackageStartupMessages(
        library(pkg, character.only = TRUE, quietly = TRUE)
      )
    }
  }
  invisible(needed)
}

#' Validate the `steps` argument (must be a prefix of the phase order)
#' @keywords internal
.og_check_run_steps <- function(steps) {
  if (!is.character(steps) || length(steps) == 0L) {
    stop("`steps` must be a non-empty character vector.", call. = FALSE)
  }
  bad <- setdiff(steps, .OG_RUN_STEPS)
  if (length(bad) > 0L) {
    stop(
      "Unknown steps: ", paste(bad, collapse = ", "),
      ". Valid steps: ", paste(.OG_RUN_STEPS, collapse = ", "), ".",
      call. = FALSE
    )
  }
  steps <- .OG_RUN_STEPS[.OG_RUN_STEPS %in% steps]
  if (!identical(steps, .OG_RUN_STEPS[seq_along(steps)])) {
    stop(
      "`steps` must be a prefix of c(\"",
      paste(.OG_RUN_STEPS, collapse = "\", \""),
      "\") because each phase consumes the previous phase's results.",
      call. = FALSE
    )
  }
  steps
}

# ---------------------------------------------------------------------------
# Input loading
# ---------------------------------------------------------------------------

#' Read the project's raw input data.frames
#'
#' Reads every domain listed in `config/data-config.yaml` (resolving paths
#' with the same rules as [fs_LoadData()]), then any additional `input/*.csv`
#' files not covered by the config — the same net effect as the demo's
#' read-all-input loop, but honoring custom paths from data-config.
#' @keywords internal
.og_load_input <- function(paths, quiet = FALSE) {
  cfg <- og_read_data_config(paths$root)
  lConfig <- list(project_dir = paths$root, data_config = cfg)
  lRaw <- list()

  for (domain in names(cfg)) {
    full_path <- fs_resolve_input_path(domain, lConfig)
    if (!file.exists(full_path)) {
      warning(
        sprintf(
          "og_run: input file for domain '%s' not found at '%s', skipping.",
          domain, full_path
        ),
        call. = FALSE
      )
      next
    }
    lRaw[[domain]] <- utils::read.csv(full_path, stringsAsFactors = FALSE)
  }

  extra <- if (dir.exists(paths$input)) {
    list.files(paths$input, pattern = "\\.csv$", full.names = TRUE)
  } else {
    character(0)
  }
  for (f in extra) {
    domain <- tools::file_path_sans_ext(basename(f))
    if (!domain %in% names(lRaw)) {
      lRaw[[domain]] <- utils::read.csv(f, stringsAsFactors = FALSE)
    }
  }

  if (length(lRaw) == 0L) {
    stop(
      "No input data found in ", paths$input,
      " (or via config/data-config.yaml). ",
      "Add Raw_*.csv files or run og_init(example = TRUE).",
      call. = FALSE
    )
  }
  lRaw
}

# ---------------------------------------------------------------------------
# The GroupID standardization seam (a real workflow step)
# ---------------------------------------------------------------------------

#' Locate the packaged standardize workflow directory
#'
#' Resolves `workflows/standardize/` from the installed package via
#' [system.file()], falling back to the development `inst/` tree (via
#' `.og_inst_file()`) before the package is installed.
#' @keywords internal
.og_standardize_wf_dir <- function() {
  hit <- system.file("workflows", "standardize", package = "open.gismo")
  if (nzchar(hit) && dir.exists(hit)) {
    return(hit)
  }
  yaml_hit <- .og_inst_file(file.path("workflows", "standardize", "standardize.yaml"))
  if (nzchar(yaml_hit)) {
    return(dirname(yaml_hit))
  }
  ""
}

#' Run the StandardizeResults workflow step over analyzed metric results
#'
#' Executes `inst/workflows/standardize/standardize.yaml` via
#' [workr::MakeWorkflowList()] + [workr::RunWorkflows()], so the GroupID
#' coercion between the metrics and reporting phases is an auditable pipeline
#' step. Falls back to calling [StandardizeResults()] directly if the packaged
#' workflow YAML cannot be located.
#' @keywords internal
.og_standardize_analyzed <- function(analyzed) {
  wf_dir <- .og_standardize_wf_dir()
  if (!nzchar(wf_dir)) {
    warning(
      "Packaged standardize workflow not found; ",
      "calling StandardizeResults() directly.",
      call. = FALSE
    )
    return(StandardizeResults(analyzed))
  }
  std_wf <- workr::MakeWorkflowList(strPath = wf_dir)
  out <- tryCatch(
    workr::RunWorkflows(std_wf, list(lAnalyzed = analyzed)),
    error = function(e) {
      # Before the package is installed with a regenerated NAMESPACE,
      # workr cannot resolve `open.gismo::StandardizeResults` from the YAML
      # (getExportedValue consults the checked-in NAMESPACE). Fall back to
      # the direct call so development runs still standardize correctly.
      warning(
        "Standardize workflow step failed (",
        conditionMessage(e),
        "); calling StandardizeResults() directly.",
        call. = FALSE
      )
      list(standardize = StandardizeResults(analyzed))
    }
  )
  # Single workflow -> single result: the standardized lAnalyzed list.
  out[[1]]
}

# ---------------------------------------------------------------------------
# Output saving (demo-branch layout)
# ---------------------------------------------------------------------------

#' Save top-level data.frame results to output/{phase}/{ID}/{name}.csv
#'
#' Used for the mappings phase (`Mapped_*` data.frames) and the reporting
#' phase (`Reporting_*` data.frames): each data.frame result is written to
#' `output/{phase}/{ID}/{full_name}.csv` where `ID` strips `prefix` from the
#' result name — the demo's save layout.
#' @keywords internal
.og_save_phase_outputs <- function(results, phase, paths, prefix) {
  for (nm in names(results)) {
    df <- results[[nm]]
    if (!is.data.frame(df)) next
    id <- sub(paste0("^", prefix), "", nm)
    out_dir <- file.path(paths$output, phase, id)
    dir.create(out_dir, showWarnings = FALSE, recursive = TRUE)
    utils::write.csv(df, file.path(out_dir, paste0(nm, ".csv")), row.names = FALSE)
  }
  invisible(NULL)
}

#' Save analyzed metric results to output/2_metrics/{id}/{step_output}.csv
#' @keywords internal
.og_save_metric_outputs <- function(analyzed, paths) {
  for (nm in names(analyzed)) {
    id <- sub("^Analysis_", "", nm)
    out_dir <- file.path(paths$output, "2_metrics", id)
    dir.create(out_dir, showWarnings = FALSE, recursive = TRUE)
    entry <- analyzed[[nm]]
    if (is.data.frame(entry)) {
      utils::write.csv(entry, file.path(out_dir, paste0(nm, ".csv")), row.names = FALSE)
      next
    }
    for (sub_nm in names(entry)) {
      if (is.data.frame(entry[[sub_nm]])) {
        utils::write.csv(
          entry[[sub_nm]],
          file.path(out_dir, paste0(sub_nm, ".csv")),
          row.names = FALSE
        )
      }
    }
  }
  invisible(NULL)
}

#' Move rendered kri_report_*.html files into output/4_modules/{module}/
#'
#' Report modules render into the working directory (the project root during
#' the reports phase). This mirrors the demo's move logic: filenames
#' containing `_Site_` go to `report_kri_site/`, all others to
#' `report_kri_country/`.
#' @keywords internal
.og_move_report_html <- function(paths) {
  files <- list.files(paths$root, pattern = "^kri_report.*\\.html$")
  for (f in files) {
    level <- if (grepl("_Site_", f)) "report_kri_site" else "report_kri_country"
    out_dir <- file.path(paths$output, "4_modules", level)
    dir.create(out_dir, showWarnings = FALSE, recursive = TRUE)
    file.rename(file.path(paths$root, f), file.path(out_dir, f))
  }
  length(files)
}

# ---------------------------------------------------------------------------
# Static chart export
# ---------------------------------------------------------------------------

#' Render one static PNG per metric from the reporting layer
#'
#' For each metric in `Reporting_Metrics`, renders a static ggplot with
#' gsm.kri's static renderers — [gsm.kri::Visualize_Scatter()] on the
#' metric's results and bounds, falling back to [gsm.kri::Visualize_Score()]
#' when the scatter is unavailable (e.g. metrics with no bounds) — and saves
#' it to `output/4_modules/static/{metric_id}.png`. (In current gsm.kri,
#' `Visualize_Metric()` returns interactive htmlwidgets, so the static export
#' uses the ggplot renderers directly.) Individual failures are counted and
#' skipped, never fatal.
#' @keywords internal
.og_render_static_charts <- function(reporting, paths, quiet = FALSE) {
  dfMetrics <- reporting$Reporting_Metrics
  dfResults <- reporting$Reporting_Results
  if (
    !is.data.frame(dfMetrics) || nrow(dfMetrics) == 0L ||
      !is.data.frame(dfResults) ||
      !requireNamespace("gsm.kri", quietly = TRUE) ||
      !requireNamespace("ggplot2", quietly = TRUE)
  ) {
    return(list(saved = 0L, failed = 0L))
  }

  static_dir <- file.path(paths$output, "4_modules", "static")
  dir.create(static_dir, showWarnings = FALSE, recursive = TRUE)

  dfBounds <- reporting$Reporting_Bounds
  saved <- 0L
  failed <- 0L
  for (i in seq_len(nrow(dfMetrics))) {
    metric_id <- dfMetrics$MetricID[i]
    ok <- tryCatch(
      {
        plot <- .og_static_metric_plot(
          dfResults[dfResults$MetricID == metric_id, , drop = FALSE],
          if (is.data.frame(dfBounds)) {
            dfBounds[dfBounds$MetricID == metric_id, , drop = FALSE]
          },
          threshold = dfMetrics$Threshold[i]
        )
        if (is.null(plot)) {
          FALSE
        } else {
          short_id <- sub("^Analysis_", "", metric_id)
          suppressMessages(ggplot2::ggsave(
            filename = file.path(static_dir, paste0(short_id, ".png")),
            plot = plot,
            width = 8,
            height = 5,
            dpi = 120
          ))
          TRUE
        }
      },
      error = function(e) FALSE
    )
    if (isTRUE(ok)) saved <- saved + 1L else failed <- failed + 1L
  }

  if (!isTRUE(quiet) && failed > 0L) {
    message(sprintf(
      "  ... static charts: %d saved, %d skipped (no renderable chart or error)",
      saved, failed
    ))
  }
  list(saved = saved, failed = failed)
}

#' Build one metric's static ggplot: scatter first, score as fallback
#' @keywords internal
.og_static_metric_plot <- function(dfResults, dfBounds, threshold = NULL) {
  if (!is.data.frame(dfResults) || nrow(dfResults) == 0L) {
    return(NULL)
  }
  plot <- tryCatch(
    suppressMessages(suppressWarnings(
      gsm.kri::Visualize_Scatter(dfResults = dfResults, dfBounds = dfBounds)
    )),
    error = function(e) NULL
  )
  if (inherits(plot, "ggplot")) {
    return(plot)
  }
  vThreshold <- NULL
  if (
    !is.null(threshold) && length(threshold) == 1L &&
      !is.na(threshold) && nzchar(threshold) &&
      requireNamespace("gsm.core", quietly = TRUE)
  ) {
    vThreshold <- tryCatch(
      suppressMessages(suppressWarnings(gsm.core::ParseThreshold(threshold))),
      error = function(e) NULL
    )
  }
  plot <- tryCatch(
    suppressMessages(suppressWarnings(
      gsm.kri::Visualize_Score(dfResults = dfResults, vThreshold = vThreshold)
    )),
    error = function(e) NULL
  )
  if (inherits(plot, "ggplot")) plot else NULL
}

# ---------------------------------------------------------------------------
# Site page + open behavior
# ---------------------------------------------------------------------------

#' Copy the packaged site SPA to the project root as index.html (if bundled)
#' @keywords internal
.og_copy_site_page <- function(paths) {
  site_page <- .og_inst_file(file.path("site", "index.html"))
  if (nzchar(site_page) && file.exists(site_page)) {
    file.copy(site_page, paths$index_html, overwrite = TRUE)
  }
  invisible(NULL)
}

#' Open the run's result in the browser (site page, else first KRI report)
#' @keywords internal
.og_open_result <- function(paths, reports_payload) {
  target <- NULL
  if (file.exists(paths$index_html)) {
    # The SPA fetches its payload over HTTP; serve the folder rather than
    # opening the file directly so those fetches work.
    return(og_view(paths$root))
  }
  if (!is.null(reports_payload) && length(reports_payload$reports) > 0L) {
    target <- file.path(paths$root, reports_payload$reports[[1]]$html)
  }
  if (!is.null(target) && file.exists(target)) {
    utils::browseURL(target)
  }
  invisible(NULL)
}

#' Drop workflows whose meta `Active` flag is `FALSE`
#'
#' Metric YAMLs have no `Active` key by default and are treated as active,
#' matching the `wf$Active %||% TRUE` convention in `activation_status.R`.
#' `og_metric_settings_update()` writes `meta$Active: false` to deactivate a
#' metric from the settings UI; this filter makes that flag effective in
#' [og_run()].
#' @keywords internal
.og_filter_active <- function(lWorkflows) {
  keep <- vapply(
    lWorkflows,
    function(wf) !isFALSE(wf$meta$Active),
    logical(1)
  )
  lWorkflows[keep]
}

#' Reset one phase's output directory so a run's outputs reflect that run
#'
#' Each og_run() phase fully regenerates its own outputs, so stale artifacts
#' from earlier runs (e.g. a since-deactivated metric's CSVs or PNG) must not
#' survive. Phases that are skipped via `steps` keep their previous outputs.
#' @keywords internal
.og_clean_phase_dir <- function(paths, phase) {
  dir <- file.path(paths$output, phase)
  unlink(dir, recursive = TRUE)
  dir.create(dir, recursive = TRUE, showWarnings = FALSE)
  invisible(dir)
}
