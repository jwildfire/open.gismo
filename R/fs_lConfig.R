# fs_lConfig.R — Factory function for filesystem-backed lConfig
#
# Creates an lConfig object compatible with workr::RunWorkflow that uses the
# local filesystem (a self-contained project folder) as the storage backend
# via fs_LoadData and fs_SaveData hooks. This is the local-first twin of
# gh_lConfig: same workr lConfig contract, different backend, proving the
# LoadData/SaveData seam is a genuinely swappable backend.

#' Create a filesystem-backed lConfig object for workr::RunWorkflow
#'
#' Returns an `lConfig` object whose `LoadData`/`SaveData` hooks read input
#' CSVs from and write output CSVs to a local project folder, mirroring
#' [gh_lConfig()] but using the filesystem instead of GitHub. Pass the result
#' as the `lConfig` argument to [workr::RunWorkflow()] /
#' [workr::RunWorkflows()].
#'
#' `data_config` maps workflow spec domains (e.g. `Raw_AE`) to input file
#' paths. Paths may be absolute or relative to `project_dir`. When a domain is
#' absent from `data_config`, [fs_LoadData()] falls back to the convention
#' `input/{domain}.csv` under `project_dir`.
#'
#' The `LoadData`/`SaveData` closures satisfy the workr provider contract
#' (formals `(lWorkflow, lConfig, lData)` and `(lWorkflow, lConfig)`), so they
#' can also be registered by name with workr:
#'
#' ```r
#' workr::register_load_provider("fs", fs_LoadData)
#' workr::register_save_provider("fs", fs_SaveData)
#' ```
#'
#' After registration, a config could reference the hooks by the string
#' `"fs"`. `fs_lConfig()` itself returns the functions directly (like
#' [gh_lConfig()]), so no registration is required for normal use.
#'
#' @param project_dir Character. Path to the project folder (created by
#'   [og_init()]); root for `input/`, `output/`, and `status.json`.
#' @param data_config List or NULL. Parsed `data-config.yaml` mapping domains
#'   to input paths. `NULL` (the default) uses the `input/{domain}.csv`
#'   convention for every domain.
#'
#' @return A list with `project_dir`, `data_config`, and `LoadData` /
#'   `SaveData` functions conforming to the workr lConfig interface.
#' @seealso [gh_lConfig()] for the GitHub-backed twin.
#' @export
#' @examples
#' \dontrun{
#' lConfig <- fs_lConfig("~/my-study")
#' workr::RunWorkflow(lWorkflow = wf, lConfig = lConfig)
#' }
fs_lConfig <- function(project_dir, data_config = NULL) {
  list(
    project_dir = project_dir,
    data_config = data_config,
    LoadData = fs_LoadData,
    SaveData = fs_SaveData
  )
}
