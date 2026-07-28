# og_app.R — a deliberately THIN Shiny/bslib shell over the project folder.
#
# Design contract: the app owns NO hidden state. Every action round-trips files
# in the project folder — og_init() scaffolds it, fileInput copies CSVs into
# input/, the settings editor rewrites metric YAMLs, Run calls og_run(), and the
# Reports tab serves what og_run() wrote. The package works fully without this
# file: shiny and bslib are Suggests, and og_app() errors cleanly if they are
# absent. Nothing else in the package depends on og_app().

# Internal: read an og_validate() result to find run-blocking domains. Gates
# solely on og_validate()'s two blocking statuses — "error" (a missing required
# column) and "missing" (an absent input file) — never on the free-text
# `problems` message. Substring-matching problems wrongly blocked warning-level
# domains whose column names or messages merely contained "miss"/"fail" (e.g.
# a "missed_doses" column), while headless og_run() ran them fine; warnings are
# the forgiveness layer and must not gate the app's Run button.
og_validation_failures <- function(validation) {
  if (is.null(validation) || !is.data.frame(validation) || nrow(validation) == 0L) {
    return(character(0))
  }
  status <- tolower(as.character(validation$status %||% rep("", nrow(validation))))
  is_fail <- status %in% c("error", "missing")
  domains <- as.character(validation$domain %||% seq_len(nrow(validation)))
  unique(domains[is_fail])
}

# Internal: register the project folder as a Shiny resource path so the Reports
# tab can iframe files under it. Safe to call repeatedly; no-op without shiny.
og_add_resource <- function(project_dir) {
  if (is.null(project_dir) || !nzchar(project_dir) || !dir.exists(project_dir)) {
    return(invisible(FALSE))
  }
  if (!requireNamespace("shiny", quietly = TRUE)) {
    return(invisible(FALSE))
  }
  tryCatch(
    {
      shiny::addResourcePath("og_project", normalizePath(project_dir))
      invisible(TRUE)
    },
    error = function(e) invisible(FALSE)
  )
}

#' Launch the thin open.gismo project app
#'
#' Opens a small Shiny/bslib application that drives an open.gismo project
#' folder through the local-first lifecycle: load data, validate it, customise
#' metric settings, run the pipeline, and view the resulting reports. It is a
#' deliberately **thin** shell — it holds no hidden state. Every button reads or
#' writes files in the project folder, so the same results are reachable from
#' the headless functions ([og_init()], [og_validate()], [og_run()],
#' [og_view()]) and vice versa.
#'
#' The four panels are:
#' \describe{
#'   \item{Project}{Point at (or create) a project folder, drop in `Raw_*.csv`
#'     input files, and see per-domain validation.}
#'   \item{Settings}{Toggle each metric's `Active` flag and edit its `Threshold`
#'     and `GroupLevel`, plus an advanced raw-YAML editor. Edits are written to
#'     the metric workflow YAMLs and take effect on the next run.}
#'   \item{Run}{Validate as a gate, then run the pipeline with a progress bar and
#'     a timing/report-count summary.}
#'   \item{Reports}{Browse the interactive reports and static chart exports that
#'     the last run wrote.}
#' }
#'
#' This function requires the \pkg{shiny} and \pkg{bslib} packages (listed under
#' Suggests); it errors with a clear message if either is missing.
#'
#' @param project_dir Character or `NULL`. Optional path to an existing project
#'   folder to open on launch. When `NULL`, the Project panel starts empty and
#'   you point it at (or create) a folder interactively.
#' @param launch.browser Logical. Passed to [shiny::runApp()]; when `TRUE`
#'   (default) the app opens in a browser.
#'
#' @return This function is called for its side effect (running the app) and
#'   does not return until the app is closed.
#'
#' @examples
#' \dontrun{
#' og_init("~/my-study", example = TRUE)
#' og_app("~/my-study")
#' }
#'
#' @seealso [og_init()], [og_validate()], [og_run()], [og_view()]
#' @export
og_app <- function(project_dir = NULL, launch.browser = TRUE) {
  for (pkg in c("shiny", "bslib")) {
    if (!requireNamespace(pkg, quietly = TRUE)) {
      stop(
        sprintf(
          "og_app() requires the '%s' package. Install it with install.packages('%s').",
          pkg,
          pkg
        ),
        call. = FALSE
      )
    }
  }

  ui <- og_app_ui(project_dir)
  server <- og_app_server(project_dir)
  app <- shiny::shinyApp(ui = ui, server = server)
  shiny::runApp(app, launch.browser = launch.browser)
}

# Internal: build the bslib::page_navbar UI. Separated from og_app() so the UI
# object can be constructed (and smoke-tested) without running the app.
og_app_ui <- function(project_dir = NULL) {
  start_dir <- if (is.null(project_dir)) "" else project_dir

  panel_project <- bslib::nav_panel(
    title = "Project",
    bslib::layout_sidebar(
      sidebar = bslib::sidebar(
        width = 340,
        shiny::textInput(
          "project_dir",
          "Project folder",
          value = start_dir,
          placeholder = "/path/to/my-study"
        ),
        shiny::actionButton("set_project", "Use this project", class = "btn-primary"),
        shiny::hr(),
        shiny::actionButton("create_example", "Create example project"),
        shiny::helpText(
          "Creates a self-contained project with example data in the folder above."
        ),
        shiny::hr(),
        shiny::fileInput(
          "csv_upload",
          "Add input CSVs (Raw_*.csv)",
          multiple = TRUE,
          accept = ".csv"
        ),
        shiny::actionButton("revalidate", "Re-validate")
      ),
      shiny::h4("Status"),
      shiny::verbatimTextOutput("project_status"),
      shiny::h4("Validation"),
      shiny::tableOutput("validation_table")
    )
  )

  panel_settings <- bslib::nav_panel(
    title = "Settings",
    bslib::layout_sidebar(
      sidebar = bslib::sidebar(
        width = 340,
        shiny::selectInput("metric_sel", "Metric", choices = character(0)),
        shiny::checkboxInput("metric_active", "Active", value = TRUE),
        shiny::textInput("metric_threshold", "Threshold (comma-separated)"),
        shiny::selectInput(
          "metric_group",
          "Group level",
          choices = c("Site", "Country"),
          selected = "Site"
        ),
        shiny::actionButton("save_metric", "Save settings", class = "btn-primary"),
        shiny::helpText("Changes take effect on the next Run.")
      ),
      shiny::verbatimTextOutput("settings_status"),
      bslib::accordion(
        open = FALSE,
        bslib::accordion_panel(
          title = "Advanced: raw YAML editor",
          shiny::textAreaInput(
            "raw_yaml",
            label = NULL,
            width = "100%",
            height = "360px"
          ),
          shiny::actionButton("save_raw", "Save raw YAML")
        )
      )
    )
  )

  panel_run <- bslib::nav_panel(
    title = "Run",
    shiny::actionButton("run_pipeline", "Run pipeline", class = "btn-primary"),
    shiny::helpText("Validates the inputs, then runs mappings -> metrics -> reporting -> reports."),
    shiny::hr(),
    shiny::verbatimTextOutput("run_log")
  )

  panel_reports <- bslib::nav_panel(
    title = "Reports",
    shiny::selectInput("report_sel", "Interactive report", choices = character(0)),
    shiny::uiOutput("report_frame"),
    shiny::hr(),
    shiny::h4("Static charts"),
    shiny::uiOutput("static_strip")
  )

  bslib::page_navbar(
    title = "open.gismo",
    id = "og_nav",
    panel_project,
    panel_settings,
    panel_run,
    panel_reports
  )
}

# Internal: build the server function. Separated from og_app() for testability.
og_app_server <- function(project_dir = NULL) {
  function(input, output, session) {
    rv_project <- shiny::reactiveVal(
      if (is.null(project_dir)) "" else project_dir
    )
    # Bumped to force validation/settings/report refreshes after writes.
    rv_refresh <- shiny::reactiveVal(0L)

    active_dir <- function() {
      d <- rv_project()
      if (is.null(d) || !nzchar(d)) NULL else d
    }

    if (!is.null(project_dir) && dir.exists(project_dir)) {
      og_add_resource(project_dir)
    }

    # --- Project panel --------------------------------------------------------

    shiny::observeEvent(input$set_project, {
      rv_project(input$project_dir)
      og_add_resource(input$project_dir)
      rv_refresh(rv_refresh() + 1L)
    })

    shiny::observeEvent(input$create_example, {
      dir <- input$project_dir
      if (is.null(dir) || !nzchar(dir)) {
        shiny::showNotification(
          "Enter a project folder path first.",
          type = "warning"
        )
        return(invisible())
      }
      shiny::withProgress(message = "Creating example project", value = 0.5, {
        tryCatch(
          {
            og_init(dir, example = TRUE, overwrite = FALSE)
            rv_project(dir)
            og_add_resource(dir)
            rv_refresh(rv_refresh() + 1L)
            shiny::showNotification("Example project created.", type = "message")
          },
          error = function(e) {
            shiny::showNotification(
              paste("og_init() failed:", conditionMessage(e)),
              type = "error",
              duration = NULL
            )
          }
        )
      })
    })

    shiny::observeEvent(input$csv_upload, {
      dir <- active_dir()
      if (is.null(dir)) {
        shiny::showNotification("Set a project folder first.", type = "warning")
        return(invisible())
      }
      up <- input$csv_upload
      input_dir <- file.path(dir, "input")
      if (!dir.exists(input_dir)) {
        dir.create(input_dir, recursive = TRUE, showWarnings = FALSE)
      }
      copied <- character(0)
      skipped <- character(0)
      for (i in seq_len(nrow(up))) {
        name <- up$name[i]
        # Name validation: only accept Raw_*.csv, no path traversal.
        if (grepl("^Raw_[A-Za-z0-9]+\\.csv$", basename(name))) {
          file.copy(
            up$datapath[i],
            file.path(input_dir, basename(name)),
            overwrite = TRUE
          )
          copied <- c(copied, basename(name))
        } else {
          skipped <- c(skipped, name)
        }
      }
      rv_refresh(rv_refresh() + 1L)
      msg <- character(0)
      if (length(copied)) {
        msg <- c(msg, paste("Added:", paste(copied, collapse = ", ")))
      }
      if (length(skipped)) {
        msg <- c(
          msg,
          paste(
            "Skipped (name must match Raw_*.csv):",
            paste(skipped, collapse = ", ")
          )
        )
      }
      shiny::showNotification(
        paste(msg, collapse = "\n"),
        type = if (length(skipped)) "warning" else "message"
      )
    })

    validation_result <- shiny::reactive({
      rv_refresh()
      input$revalidate
      dir <- active_dir()
      if (is.null(dir) || !dir.exists(dir)) {
        return(NULL)
      }
      tryCatch(og_validate(dir), error = function(e) {
        shiny::showNotification(
          paste("og_validate() failed:", conditionMessage(e)),
          type = "error"
        )
        NULL
      })
    })

    output$project_status <- shiny::renderText({
      dir <- active_dir()
      if (is.null(dir)) {
        return("No project folder set. Enter a path and click 'Use this project'.")
      }
      if (!dir.exists(dir)) {
        return(paste0("Folder does not exist yet: ", dir,
          "\nClick 'Create example project' to scaffold it."))
      }
      input_dir <- file.path(dir, "input")
      csvs <- if (dir.exists(input_dir)) {
        list.files(input_dir, pattern = "\\.csv$")
      } else {
        character(0)
      }
      v <- validation_result()
      fails <- og_validation_failures(v)
      lines <- c(
        paste("Project:", dir),
        paste("Input CSVs:", if (length(csvs)) paste(csvs, collapse = ", ") else "(none)"),
        if (is.null(v)) {
          "Validation: not run"
        } else if (length(fails)) {
          paste("Validation: PROBLEMS in", paste(fails, collapse = ", "))
        } else {
          "Validation: all domains OK"
        }
      )
      paste(lines, collapse = "\n")
    })

    output$validation_table <- shiny::renderTable({
      v <- validation_result()
      if (is.null(v)) {
        return(data.frame(message = "No validation yet. Set a project and add input CSVs."))
      }
      as.data.frame(v)
    })

    # --- Settings panel -------------------------------------------------------

    metric_settings <- shiny::reactive({
      rv_refresh()
      input$save_metric
      input$save_raw
      dir <- active_dir()
      if (is.null(dir)) {
        return(og_empty_metric_settings())
      }
      tryCatch(og_metric_settings(dir), error = function(e) og_empty_metric_settings())
    })

    shiny::observe({
      ms <- metric_settings()
      choices <- ms$metric
      shiny::updateSelectInput(session, "metric_sel", choices = choices)
    })

    shiny::observeEvent(input$metric_sel, {
      ms <- metric_settings()
      row <- ms[ms$metric == input$metric_sel, , drop = FALSE]
      if (nrow(row) == 0L) {
        return(invisible())
      }
      shiny::updateCheckboxInput(session, "metric_active", value = isTRUE(row$Active[1]))
      thr <- row$Threshold[1]
      shiny::updateTextInput(
        session,
        "metric_threshold",
        value = if (is.na(thr)) "" else thr
      )
      gl <- row$GroupLevel[1]
      # Show the metric's actual level even when it is neither Site nor Country
      # (e.g. a qtl metric's "Study"), so the widget never misrepresents a level
      # it can't otherwise offer. The write-side guard in og_settings_changes()
      # still keeps such a level from being clobbered.
      gl_choices <- unique(c("Site", "Country", if (!is.na(gl)) gl))
      shiny::updateSelectInput(
        session,
        "metric_group",
        choices = gl_choices,
        selected = if (is.na(gl)) "Site" else gl
      )
      raw <- tryCatch(
        og_metric_yaml_text(active_dir(), input$metric_sel),
        error = function(e) NULL
      )
      shiny::updateTextAreaInput(session, "raw_yaml", value = raw %||% "")
    })

    shiny::observeEvent(input$save_metric, {
      dir <- active_dir()
      if (is.null(dir) || !nzchar(input$metric_sel)) {
        return(invisible())
      }
      ms <- metric_settings()
      current <- ms[ms$metric == input$metric_sel, , drop = FALSE]
      # Write back only the fields the user actually changed, so Save never
      # rewrites or injects meta keys the metric didn't have (and can't corrupt
      # a non-Site/Country GroupLevel the Site/Country selector can't represent).
      changes <- og_settings_changes(
        current,
        list(
          Active = isTRUE(input$metric_active),
          Threshold = input$metric_threshold,
          GroupLevel = input$metric_group
        )
      )
      if (length(changes) == 0L) {
        shiny::showNotification(
          paste0("No changes to save for ", input$metric_sel, "."),
          type = "message"
        )
        return(invisible())
      }
      tryCatch(
        {
          og_metric_settings_update(dir, input$metric_sel, changes)
          shiny::showNotification(
            paste0("Saved settings for ", input$metric_sel, " (re-run to apply)."),
            type = "message"
          )
        },
        error = function(e) {
          shiny::showNotification(
            paste("Save failed:", conditionMessage(e)),
            type = "error"
          )
        }
      )
    })

    shiny::observeEvent(input$save_raw, {
      dir <- active_dir()
      if (is.null(dir) || !nzchar(input$metric_sel)) {
        return(invisible())
      }
      tryCatch(
        {
          og_metric_yaml_write(dir, input$metric_sel, input$raw_yaml)
          shiny::showNotification(
            paste0("Saved raw YAML for ", input$metric_sel, "."),
            type = "message"
          )
        },
        error = function(e) {
          shiny::showNotification(
            paste("Invalid YAML, not saved:", conditionMessage(e)),
            type = "error",
            duration = NULL
          )
        }
      )
    })

    output$settings_status <- shiny::renderText({
      ms <- metric_settings()
      if (nrow(ms) == 0L) {
        return("No metrics found. Create or open a project first.")
      }
      sprintf(
        "%d metrics (%d active). Edits are written to workflows/2_metrics/*.yaml.",
        nrow(ms),
        sum(ms$Active)
      )
    })

    # --- Run panel ------------------------------------------------------------

    run_log <- shiny::reactiveVal("Not run yet.")
    output$run_log <- shiny::renderText(run_log())

    shiny::observeEvent(input$run_pipeline, {
      dir <- active_dir()
      if (is.null(dir) || !dir.exists(dir)) {
        run_log("Set an existing project folder first.")
        return(invisible())
      }
      v <- tryCatch(og_validate(dir), error = function(e) NULL)
      fails <- og_validation_failures(v)
      if (length(fails)) {
        run_log(paste0(
          "Aborted: validation failed for domain(s): ",
          paste(fails, collapse = ", "),
          "\nFix the input CSVs on the Project tab and try again."
        ))
        shiny::showNotification("Validation gate failed.", type = "error")
        return(invisible())
      }
      shiny::withProgress(message = "Running pipeline", value = 0.1, {
        res <- tryCatch(
          {
            og_run(dir, quiet = TRUE, open = FALSE)
          },
          error = function(e) {
            run_log(paste("og_run() failed:", conditionMessage(e)))
            shiny::showNotification("Pipeline run failed.", type = "error")
            NULL
          }
        )
        shiny::setProgress(value = 1)
        if (!is.null(res)) {
          og_add_resource(dir)
          rv_refresh(rv_refresh() + 1L)
          reports <- og_read_reports(dir)
          n_reports <- if (is.null(reports)) 0L else length(reports$reports)
          n_static <- if (is.null(reports)) 0L else length(reports$static_charts)
          run_log(paste(
            c(
              "Run complete.",
              og_format_run_summary(res),
              sprintf("Interactive reports: %d", n_reports),
              sprintf("Static charts: %d", n_static)
            ),
            collapse = "\n"
          ))
          shiny::showNotification("Pipeline run complete.", type = "message")
        }
      })
    })

    # --- Reports panel --------------------------------------------------------

    reports_data <- shiny::reactive({
      rv_refresh()
      dir <- active_dir()
      if (is.null(dir)) {
        return(NULL)
      }
      og_read_reports(dir)
    })

    shiny::observe({
      rd <- reports_data()
      choices <- if (is.null(rd) || length(rd$reports) == 0L) {
        character(0)
      } else {
        titles <- vapply(
          rd$reports,
          function(r) r$title %||% r$id %||% "report",
          character(1)
        )
        ids <- vapply(rd$reports, function(r) r$id %||% "", character(1))
        stats::setNames(ids, titles)
      }
      shiny::updateSelectInput(session, "report_sel", choices = choices)
    })

    output$report_frame <- shiny::renderUI({
      rd <- reports_data()
      if (is.null(rd) || length(rd$reports) == 0L) {
        return(shiny::helpText("No reports generated yet - run the pipeline on the Run tab."))
      }
      sel <- input$report_sel
      ids <- vapply(rd$reports, function(r) r$id %||% "", character(1))
      idx <- match(sel, ids)
      if (is.na(idx)) {
        idx <- 1L
      }
      entry <- rd$reports[[idx]]
      src <- paste0("og_project/", entry$html)
      shiny::tags$iframe(
        src = src,
        title = entry$title %||% entry$id %||% "report",
        width = "100%",
        height = "720px",
        style = "border: 1px solid #ccc;"
      )
    })

    output$static_strip <- shiny::renderUI({
      rd <- reports_data()
      if (is.null(rd) || length(rd$static_charts) == 0L) {
        return(shiny::helpText("No static charts yet."))
      }
      imgs <- lapply(rd$static_charts, function(sc) {
        src <- paste0("og_project/", sc$png)
        shiny::tags$a(
          href = src,
          target = "_blank",
          shiny::tags$img(
            src = src,
            title = sc$title %||% sc$metric %||% "",
            style = "height: 140px; margin: 4px; border: 1px solid #ddd;"
          )
        )
      })
      shiny::div(style = "display: flex; flex-wrap: wrap;", imgs)
    })
  }
}

# Internal: turn og_run()'s returned list into a few human-readable lines. Kept
# tolerant of whatever shape og_run() returns (it is another agent's contract).
og_format_run_summary <- function(res) {
  if (is.null(res) || !is.list(res)) {
    return(character(0))
  }
  lines <- character(0)
  if (!is.null(res$timings)) {
    tv <- res$timings
    if (is.list(tv) || length(tv) > 1L) {
      parts <- vapply(
        seq_along(tv),
        function(i) {
          nm <- names(tv)[i]
          sprintf("%s: %s", if (is.null(nm)) i else nm, format(tv[[i]]))
        },
        character(1)
      )
      lines <- c(lines, paste("Timings:", paste(parts, collapse = "; ")))
    } else {
      lines <- c(lines, paste("Elapsed:", format(tv)))
    }
  } else if (!is.null(res$elapsed)) {
    lines <- c(lines, paste("Elapsed:", format(res$elapsed)))
  }
  if (!is.null(res$counts) && is.list(res$counts)) {
    parts <- vapply(
      seq_along(res$counts),
      function(i) sprintf("%s=%s", names(res$counts)[i], res$counts[[i]]),
      character(1)
    )
    lines <- c(lines, paste("Counts:", paste(parts, collapse = ", ")))
  }
  lines
}
