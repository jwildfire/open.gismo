# Tests for GitHub Actions workflow YAML files
# RED phase: these tests should all fail because the YAML files don't exist yet.
#
# Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6,
#            4.1–4.10, 13.2, 13.3, 13.4, 13.5, 13.6
#
# Strategy: Parse each YAML workflow file with yaml::read_yaml() and verify
# structure, required inputs, R setup steps, and workr function calls.

# ---------------------------------------------------------------------------
# Helper: path to workflow files
# ---------------------------------------------------------------------------
# When running via testthat::test_path(), go up two levels from tests/testthat/.
workflows_dir <- file.path(
  testthat::test_path(),
  "..",
  "..",
  ".github",
  "workflows"
)
if (!dir.exists(workflows_dir)) {
  # Fallback: try from system.file (installed package context)
  workflows_dir <- file.path(
    system.file(package = "open.gismo"),
    "..",
    ".github",
    "workflows"
  )
}

# Skip all tests in this file if workflows dir is not available
# (e.g., during R CMD check where .github/ is not in the installed package)
if (!dir.exists(workflows_dir)) {
  testthat::skip(
    "GitHub Actions workflow files not available (not in source tree)"
  )
}

# Helper to read a workflow YAML
read_workflow <- function(filename) {
  path <- file.path(workflows_dir, filename)
  if (!file.exists(path)) {
    stop(paste("Workflow file not found:", path))
  }
  yaml::read_yaml(path)
}

# Helper to extract all 'run' step contents from a workflow
get_run_steps <- function(wf) {
  runs <- character(0)
  jobs <- wf[["jobs"]]
  for (job_name in names(jobs)) {
    steps <- jobs[[job_name]][["steps"]]
    if (is.list(steps)) {
      for (step in steps) {
        if (!is.null(step[["run"]])) {
          runs <- c(runs, step[["run"]])
        }
      }
    }
  }
  runs
}

# Helper to extract all steps from all jobs in a workflow
get_job_steps <- function(wf) {
  steps_out <- list()
  jobs <- wf[["jobs"]]
  for (job_name in names(jobs)) {
    steps <- jobs[[job_name]][["steps"]]
    if (is.list(steps)) {
      steps_out <- c(steps_out, steps)
    }
  }
  steps_out
}

# Helper to check if any run step contains a pattern
has_run_pattern <- function(wf, pattern) {
  runs <- get_run_steps(wf)
  any(grepl(pattern, runs))
}

# Helper to check if any step uses a specific action
has_action <- function(wf, action_pattern) {
  jobs <- wf[["jobs"]]
  for (job_name in names(jobs)) {
    steps <- jobs[[job_name]][["steps"]]
    if (is.list(steps)) {
      for (step in steps) {
        if (!is.null(step[["uses"]]) && grepl(action_pattern, step[["uses"]])) {
          return(TRUE)
        }
      }
    }
  }
  FALSE
}


# ===========================================================================
# run-pipeline.yaml
# ===========================================================================

test_that("run-pipeline.yaml exists and is valid YAML", {
  wf <- read_workflow("run-pipeline.yaml")
  expect_true(is.list(wf))
})

test_that("run-pipeline.yaml has required trigger inputs", {
  wf <- read_workflow("run-pipeline.yaml")
  # Should be a reusable workflow (workflow_call) or workflow_dispatch

  triggers <- wf[["on"]]
  expect_true(!is.null(triggers), info = "'on' trigger section is required")

  # Check for inputs (either workflow_call or workflow_dispatch)
  inputs <- NULL
  if (!is.null(triggers[["workflow_call"]])) {
    inputs <- triggers[["workflow_call"]][["inputs"]]
  } else if (!is.null(triggers[["workflow_dispatch"]])) {
    inputs <- triggers[["workflow_dispatch"]][["inputs"]]
  }
  expect_true(!is.null(inputs), info = "Workflow must define inputs")

  input_names <- names(inputs)
  expect_true(
    "repo" %in% input_names || "snapshot_branch" %in% input_names,
    info = "Must have repo or snapshot_branch input"
  )
})

test_that("run-pipeline.yaml has jobs section", {
  wf <- read_workflow("run-pipeline.yaml")
  expect_true(!is.null(wf[["jobs"]]))
  expect_true(length(wf[["jobs"]]) >= 1)
})

test_that("run-pipeline.yaml has R setup step", {
  wf <- read_workflow("run-pipeline.yaml")
  expect_true(
    has_action(wf, "r-lib/actions/setup-r"),
    info = "Must use r-lib/actions/setup-r for R installation"
  )
})

test_that("run-pipeline.yaml installs R packages from manifest", {
  wf <- read_workflow("run-pipeline.yaml")
  runs <- get_run_steps(wf)
  # Should reference manifest or package installation
  has_pkg_install <- any(grepl(
    "install|manifest|pak|renv|pkgSnapshot",
    runs,
    ignore.case = TRUE
  ))
  expect_true(has_pkg_install, info = "Must install R packages from manifest")
})

test_that("run-pipeline.yaml calls gh_lConfig", {
  wf <- read_workflow("run-pipeline.yaml")
  expect_true(
    has_run_pattern(wf, "gh_lConfig"),
    info = "Must call gh_lConfig to build lConfig object"
  )
})

test_that("run-pipeline.yaml calls MakeWorkflowList", {
  wf <- read_workflow("run-pipeline.yaml")
  expect_true(
    has_run_pattern(wf, "MakeWorkflowList"),
    info = "Must call workr::MakeWorkflowList to load workflows"
  )
})

test_that("run-pipeline.yaml calls RunWorkflows", {
  wf <- read_workflow("run-pipeline.yaml")
  expect_true(
    has_run_pattern(wf, "RunWorkflows"),
    info = "Must call workr::RunWorkflows to execute pipeline"
  )
})

test_that("run-pipeline.yaml calls gh_lConfig, MakeWorkflowList, RunWorkflows in correct order", {
  wf <- read_workflow("run-pipeline.yaml")
  runs <- get_run_steps(wf)
  all_runs <- paste(runs, collapse = "\n")

  pos_lconfig <- regexpr("gh_lConfig", all_runs)
  pos_makewf <- regexpr("MakeWorkflowList", all_runs)
  pos_runwf <- regexpr("RunWorkflows", all_runs)

  expect_true(pos_lconfig > 0, info = "gh_lConfig must appear in run steps")
  expect_true(
    pos_makewf > 0,
    info = "MakeWorkflowList must appear in run steps"
  )
  expect_true(pos_runwf > 0, info = "RunWorkflows must appear in run steps")

  # gh_lConfig before MakeWorkflowList before RunWorkflows
  expect_true(
    pos_lconfig < pos_makewf,
    info = "gh_lConfig must be called before MakeWorkflowList"
  )
  expect_true(
    pos_makewf < pos_runwf,
    info = "MakeWorkflowList must be called before RunWorkflows"
  )
})

test_that("run-pipeline.yaml has checkout step", {
  wf <- read_workflow("run-pipeline.yaml")
  expect_true(
    has_action(wf, "actions/checkout"),
    info = "Must checkout the repository"
  )
})

test_that("run-pipeline.yaml commits output artifacts", {
  wf <- read_workflow("run-pipeline.yaml")
  runs <- get_run_steps(wf)
  has_commit <- any(grepl(
    "git commit|git push|status\\.json|log\\.json",
    runs,
    ignore.case = TRUE
  ))
  expect_true(
    has_commit,
    info = "Must commit output artifacts (status.json, log.json, etc.)"
  )
})


# ===========================================================================
# create-snapshot.yaml
# ===========================================================================

test_that("create-snapshot.yaml exists and is valid YAML", {
  wf <- read_workflow("create-snapshot.yaml")
  expect_true(is.list(wf))
})

test_that("create-snapshot.yaml has required trigger inputs", {
  wf <- read_workflow("create-snapshot.yaml")
  triggers <- wf[["on"]]
  expect_true(!is.null(triggers))

  inputs <- NULL
  if (!is.null(triggers[["workflow_call"]])) {
    inputs <- triggers[["workflow_call"]][["inputs"]]
  } else if (!is.null(triggers[["workflow_dispatch"]])) {
    inputs <- triggers[["workflow_dispatch"]][["inputs"]]
  }
  expect_true(!is.null(inputs), info = "Must define inputs")

  input_names <- names(inputs)
  # Should have inputs for data_branch or input_data_version or package_snapshot
  expect_true(
    any(
      c("data_branch", "input_data_version", "package_snapshot") %in%
        input_names
    ),
    info = "Must have data_branch, input_data_version, or package_snapshot input"
  )
})

test_that("create-snapshot.yaml has jobs section", {
  wf <- read_workflow("create-snapshot.yaml")
  expect_true(!is.null(wf[["jobs"]]))
  expect_true(length(wf[["jobs"]]) >= 1)
})

test_that("create-snapshot.yaml has R setup step", {
  wf <- read_workflow("create-snapshot.yaml")
  expect_true(
    has_action(wf, "r-lib/actions/setup-r"),
    info = "Must use r-lib/actions/setup-r for R installation"
  )
})

test_that("create-snapshot.yaml calls create_project_snapshot", {
  wf <- read_workflow("create-snapshot.yaml")
  expect_true(
    has_run_pattern(wf, "create_project_snapshot"),
    info = "Must call create_project_snapshot to allocate snapshot ID"
  )
})

test_that("create-snapshot.yaml commits snapshots.json", {
  wf <- read_workflow("create-snapshot.yaml")
  runs <- get_run_steps(wf)
  has_snapshots_commit <- any(grepl("snapshots\\.json", runs))
  expect_true(has_snapshots_commit, info = "Must commit snapshots.json update")
})

test_that("create-snapshot.yaml has checkout step", {
  wf <- read_workflow("create-snapshot.yaml")
  expect_true(
    has_action(wf, "actions/checkout"),
    info = "Must checkout the repository"
  )
})

# ===========================================================================
# init-snapshot.yaml
# ===========================================================================

test_that("init-snapshot.yaml exists and is valid YAML", {
  wf <- read_workflow("init-snapshot.yaml")
  expect_true(is.list(wf))
})

test_that("init-snapshot.yaml has jobs section", {
  wf <- read_workflow("init-snapshot.yaml")
  expect_true(!is.null(wf[["jobs"]]))
  expect_true(length(wf[["jobs"]]) >= 1)
})

test_that("init-snapshot.yaml has R setup step", {
  wf <- read_workflow("init-snapshot.yaml")
  expect_true(
    has_action(wf, "r-lib/actions/setup-r"),
    info = "Must use r-lib/actions/setup-r for R installation"
  )
})

test_that("init-snapshot.yaml calls pkgSnapshot", {
  wf <- read_workflow("init-snapshot.yaml")
  expect_true(
    has_run_pattern(wf, "pkgSnapshot"),
    info = "Must call workr::pkgSnapshot to initialize package snapshot"
  )
})


# ===========================================================================
# build-site.yaml
# ===========================================================================

test_that("build-site.yaml exists and is valid YAML", {
  wf <- read_workflow("build-site.yaml")
  expect_true(is.list(wf))
})

test_that("build-site.yaml has jobs section", {
  wf <- read_workflow("build-site.yaml")
  expect_true(!is.null(wf[["jobs"]]))
  expect_true(length(wf[["jobs"]]) >= 1)
})

test_that("build-site.yaml triggers on pushes to demo", {
  wf <- read_workflow("build-site.yaml")
  push_branches <- wf[["on"]][["push"]][["branches"]]
  expect_true(
    "demo" %in% push_branches,
    info = "Must trigger on pushes to the demo branch"
  )
})

test_that("build-site.yaml checks out the demo branch explicitly", {
  wf <- read_workflow("build-site.yaml")
  steps <- get_job_steps(wf)
  checkout_steps <- Filter(
    function(step) identical(step[["uses"]], "actions/checkout@v4"),
    steps
  )
  expect_true(
    length(checkout_steps) >= 1,
    info = "Must use actions/checkout@v4"
  )
  refs <- vapply(
    checkout_steps,
    function(step) {
      with <- step[["with"]]
      if (is.null(with) || is.null(with[["ref"]])) "" else with[["ref"]]
    },
    character(1)
  )
  expect_true(
    any(refs == "demo"),
    info = "Must check out the demo branch for deployment"
  )
})

test_that("build-site.yaml validates required demo site artifacts", {
  wf <- read_workflow("build-site.yaml")
  runs <- get_run_steps(wf)
  has_index_check <- any(grepl("test -f index\\.html", runs)) &&
    any(grepl("test -f _index\\.json", runs)) &&
    any(grepl("test -d workflows", runs)) &&
    any(grepl("test -d output", runs)) &&
    any(grepl("test -f manifest\\.csv", runs))
  expect_true(
    has_index_check,
    info = "Must validate the built site and required data artifacts on demo"
  )
})

test_that("build-site.yaml deploys to GitHub Pages", {
  wf <- read_workflow("build-site.yaml")
  # Check for GitHub Pages deployment action or manual deploy
  has_pages_deploy <- has_action(wf, "actions/deploy-pages") ||
    has_action(wf, "actions/upload-pages-artifact") ||
    has_run_pattern(wf, "gh-pages|github-pages|deploy")
  expect_true(has_pages_deploy, info = "Must deploy to GitHub Pages")
})

test_that("build-site.yaml uploads the demo branch root", {
  wf <- read_workflow("build-site.yaml")
  steps <- get_job_steps(wf)
  upload_steps <- Filter(
    function(step) {
      identical(step[["uses"]], "actions/upload-pages-artifact@v3")
    },
    steps
  )
  expect_true(length(upload_steps) >= 1, info = "Must upload a Pages artifact")
  paths <- vapply(
    upload_steps,
    function(step) {
      with <- step[["with"]]
      if (is.null(with) || is.null(with[["path"]])) "" else with[["path"]]
    },
    character(1)
  )
  expect_true(
    any(paths == "."),
    info = "Must upload the demo branch root for deployment"
  )
})

