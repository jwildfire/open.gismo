# Tests for example project structure
# Validates: Requirements 24.1, 24.2, 24.3, 24.5

# Resolve the example project path — works both in installed and dev contexts
pkg_root <- system.file(package = "open.gismo")
if (pkg_root == "" || !dir.exists(file.path(pkg_root, "examples"))) {
  pkg_root <- file.path(testthat::test_path(), "..", "..")
}

# In installed package, inst/ contents are at the package root;
# in dev context, they are under inst/
example_dir <- file.path(pkg_root, "inst", "examples", "demo-study")
if (!dir.exists(example_dir)) {
  example_dir <- file.path(pkg_root, "examples", "demo-study")
}

# ---------------------------------------------------------------------------
# Directory structure tests (Requirement 24.1, 24.3)
# ---------------------------------------------------------------------------

test_that("example project directory exists", {
  expect_true(
    dir.exists(example_dir),
    label = "inst/examples/demo-study/ directory should exist"
  )
})

test_that("example project contains workflow/ directory with YAML files", {
  skip_if_not(
    dir.exists(example_dir),
    "demo-study directory does not exist yet"
  )
  workflow_dir <- file.path(example_dir, "workflow")
  expect_true(
    dir.exists(workflow_dir),
    label = "demo-study should contain a workflow/ directory"
  )
  yaml_files <- list.files(workflow_dir, pattern = "\\.yaml$", recursive = TRUE)
  expect_gt(
    length(yaml_files),
    0,
    label = "workflow/ directory should contain at least one YAML file"
  )
})

test_that("example project workflow directory has phase-based subdirectories", {
  skip_if_not(
    dir.exists(example_dir),
    "demo-study directory does not exist yet"
  )
  workflow_dir <- file.path(example_dir, "workflow")
  skip_if_not(
    dir.exists(workflow_dir),
    "workflow/ directory does not exist yet"
  )
  subdirs <- list.dirs(workflow_dir, recursive = FALSE, full.names = FALSE)
  # Expect at least one phase subdirectory matching the N_ pattern
  phase_dirs <- grep("^\\d+_", subdirs, value = TRUE)
  expect_gt(
    length(phase_dirs),
    0,
    label = "workflow/ should have phase-based subdirectories (e.g., 1_mappings/)"
  )
})

# ---------------------------------------------------------------------------
# Config file tests (Requirement 24.1)
# ---------------------------------------------------------------------------

test_that("example project contains config/packages.yaml", {
  skip_if_not(
    dir.exists(example_dir),
    "demo-study directory does not exist yet"
  )
  expect_true(
    file.exists(file.path(example_dir, "config", "packages.yaml")),
    label = "demo-study should contain config/packages.yaml"
  )
})

test_that("example project contains config/data-config.yaml", {
  skip_if_not(
    dir.exists(example_dir),
    "demo-study directory does not exist yet"
  )
  expect_true(
    file.exists(file.path(example_dir, "config", "data-config.yaml")),
    label = "demo-study should contain config/data-config.yaml"
  )
})

test_that("example project contains config/study-config.yaml", {
  skip_if_not(
    dir.exists(example_dir),
    "demo-study directory does not exist yet"
  )
  expect_true(
    file.exists(file.path(example_dir, "config", "study-config.yaml")),
    label = "demo-study should contain config/study-config.yaml"
  )
})

# ---------------------------------------------------------------------------
# Sample input data tests (Requirement 24.1)
# ---------------------------------------------------------------------------

test_that("example project contains input/ directory with CSV files", {
  skip_if_not(
    dir.exists(example_dir),
    "demo-study directory does not exist yet"
  )
  input_dir <- file.path(example_dir, "input")
  expect_true(
    dir.exists(input_dir),
    label = "demo-study should contain an input/ directory"
  )
  csv_files <- list.files(input_dir, pattern = "\\.csv$", recursive = TRUE)
  expect_gt(
    length(csv_files),
    0,
    label = "input/ directory should contain at least one CSV file"
  )
})

# ---------------------------------------------------------------------------
# Config file parseability tests (Requirement 24.1)
# ---------------------------------------------------------------------------

test_that("packages.yaml is valid YAML", {
  skip_if_not(
    dir.exists(example_dir),
    "demo-study directory does not exist yet"
  )
  pkg_yaml_path <- file.path(example_dir, "config", "packages.yaml")
  skip_if_not(file.exists(pkg_yaml_path), "packages.yaml does not exist yet")
  parsed <- yaml::read_yaml(pkg_yaml_path)
  expect_type(parsed, "list")
})

test_that("data-config.yaml is valid YAML with domains", {
  skip_if_not(
    dir.exists(example_dir),
    "demo-study directory does not exist yet"
  )
  dc_path <- file.path(example_dir, "config", "data-config.yaml")
  skip_if_not(file.exists(dc_path), "data-config.yaml does not exist yet")
  parsed <- yaml::read_yaml(dc_path)
  expect_type(parsed, "list")
  expect_true(
    "domains" %in% names(parsed),
    label = "data-config.yaml should have a 'domains' key"
  )
  expect_gt(
    length(parsed$domains),
    0,
    label = "data-config.yaml should define at least one domain"
  )
})

test_that("study-config.yaml is valid YAML with project metadata", {
  skip_if_not(
    dir.exists(example_dir),
    "demo-study directory does not exist yet"
  )
  sc_path <- file.path(example_dir, "config", "study-config.yaml")
  skip_if_not(file.exists(sc_path), "study-config.yaml does not exist yet")
  parsed <- yaml::read_yaml(sc_path)
  expect_type(parsed, "list")
  # Should contain study metadata fields
  expect_true(
    any(c("StudyID", "StudyName", "StudyTitle") %in% names(parsed)),
    label = "study-config.yaml should contain project metadata (StudyID, StudyName, or StudyTitle)"
  )
})

# ---------------------------------------------------------------------------
# Workflow YAML parseability tests (Requirement 24.2)
# ---------------------------------------------------------------------------

test_that("example workflow YAMLs are parseable by yaml::read_yaml", {
  skip_if_not(
    dir.exists(example_dir),
    "demo-study directory does not exist yet"
  )
  workflow_dir <- file.path(example_dir, "workflow")
  skip_if_not(
    dir.exists(workflow_dir),
    "workflow/ directory does not exist yet"
  )
  yaml_files <- list.files(
    workflow_dir,
    pattern = "\\.yaml$",
    recursive = TRUE,
    full.names = TRUE
  )
  skip_if(length(yaml_files) == 0, "No workflow YAML files found")
  for (yf in yaml_files) {
    parsed <- yaml::read_yaml(yf)
    expect_type(parsed, "list")
    # Each workflow should have meta and steps sections
    expect_true(
      "meta" %in% names(parsed),
      label = paste(basename(yf), "should have a 'meta' section")
    )
    expect_true(
      "steps" %in% names(parsed),
      label = paste(basename(yf), "should have a 'steps' section")
    )
  }
})

test_that("example workflows are parseable by workr::MakeWorkflowList", {
  skip_if_not(
    dir.exists(example_dir),
    "demo-study directory does not exist yet"
  )
  skip_if_not_installed("workr")
  workflow_dir <- file.path(example_dir, "workflow")
  skip_if_not(
    dir.exists(workflow_dir),
    "workflow/ directory does not exist yet"
  )
  yaml_files <- list.files(workflow_dir, pattern = "\\.yaml$", recursive = TRUE)
  skip_if(length(yaml_files) == 0, "No workflow YAML files found")
  # MakeWorkflowList discovers all YAMLs recursively when strNames is NULL
  lWorkflows <- workr::MakeWorkflowList(
    strPath = workflow_dir
  )
  expect_type(lWorkflows, "list")
  expect_gt(
    length(lWorkflows),
    0,
    label = "MakeWorkflowList should return workflows"
  )
})

# ---------------------------------------------------------------------------
# Data-config domain coverage tests (Requirement 24.5)
# ---------------------------------------------------------------------------

test_that("data-config.yaml maps all domains referenced in workflow specs", {
  skip_if_not(
    dir.exists(example_dir),
    "demo-study directory does not exist yet"
  )
  dc_path <- file.path(example_dir, "config", "data-config.yaml")
  skip_if_not(file.exists(dc_path), "data-config.yaml does not exist yet")
  workflow_dir <- file.path(example_dir, "workflow")
  skip_if_not(
    dir.exists(workflow_dir),
    "workflow/ directory does not exist yet"
  )

  # Parse data-config to get defined domains
  data_config <- yaml::read_yaml(dc_path)
  defined_domains <- names(data_config$domains)

  # Collect all domains referenced in workflow spec sections
  yaml_files <- list.files(
    workflow_dir,
    pattern = "\\.yaml$",
    recursive = TRUE,
    full.names = TRUE
  )
  skip_if(length(yaml_files) == 0, "No workflow YAML files found")

  spec_domains <- character(0)
  for (yf in yaml_files) {
    parsed <- yaml::read_yaml(yf)
    if ("spec" %in% names(parsed) && is.list(parsed$spec)) {
      spec_domains <- c(spec_domains, names(parsed$spec))
    }
  }
  spec_domains <- unique(spec_domains)

  skip_if(
    length(spec_domains) == 0,
    "No spec domains found in workflow YAMLs"
  )

  # Every domain referenced in a workflow spec should be in data-config
  missing_domains <- setdiff(spec_domains, defined_domains)
  expect_true(
    length(missing_domains) == 0,
    label = paste(
      "All spec domains should be mapped in data-config.yaml. Missing:",
      paste(missing_domains, collapse = ", ")
    )
  )
})
