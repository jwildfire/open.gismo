# og_view.R — serve a project folder locally and open it in the browser.
#
# The project's index.html is a single-page app that fetches payload files
# (status.json, _index.json, output/...) over HTTP, so it must be served, not
# opened as a file://. httpuv::runStaticServer does the serving.

#' Serve a project folder locally and open the site in a browser
#'
#' Starts a static file server (via [httpuv::runStaticServer()]) rooted at the
#' project folder and opens `http://127.0.0.1:{port}` in the default browser.
#' The bundled site page (`index.html`) fetches the project's payload files
#' over HTTP, which is why the folder needs a server rather than a `file://`
#' open.
#'
#' The server runs in the background of the current R session: the function
#' returns (invisibly) the server handle so you can keep working. Stop it with
#' `httpuv::stopServer(server)` or `httpuv::stopAllServers()`; it also stops
#' when the R session ends.
#'
#' @param project_dir Character. Path to a project folder created by
#'   [og_init()] (and typically populated by [og_run()]).
#' @param port Integer or NULL. Port to serve on; `NULL` (default) picks a
#'   random free port.
#'
#' @return Invisibly, a list with `url`, `port`, and `server` (the
#'   [httpuv::runStaticServer()] handle).
#' @seealso [og_run()] to generate the content being served.
#' @export
#'
#' @examples
#' \dontrun{
#' viewer <- og_view("~/my-study")
#' viewer$url
#' httpuv::stopServer(viewer$server)
#' }
og_view <- function(project_dir, port = NULL) {
  paths <- og_project_paths(project_dir)
  if (!dir.exists(paths$root)) {
    stop(
      "Project folder not found: ", paths$root,
      "\nCreate one with og_init().",
      call. = FALSE
    )
  }
  if (!requireNamespace("httpuv", quietly = TRUE)) {
    stop(
      "The 'httpuv' package is required by og_view(). ",
      "Install it with install.packages(\"httpuv\").",
      call. = FALSE
    )
  }
  if (is.null(port)) {
    port <- httpuv::randomPort()
  }
  port <- as.integer(port)

  server <- httpuv::runStaticServer(
    dir = paths$root,
    host = "127.0.0.1",
    port = port,
    background = TRUE,
    browse = FALSE
  )
  url <- sprintf("http://127.0.0.1:%d", port)
  message("Serving ", paths$root)
  message("  ", url)
  message("Stop with httpuv::stopServer() on the returned handle, or httpuv::stopAllServers().")
  utils::browseURL(url)

  invisible(list(url = url, port = port, server = server))
}
