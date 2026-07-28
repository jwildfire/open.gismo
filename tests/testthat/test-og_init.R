# Tests for og_init() and the project-path / template helpers.

# ---------------------------------------------------------------------------
# og_project_paths
# ---------------------------------------------------------------------------

test_that("og_project_paths returns the expected structure", {
  paths <- og_project_paths(file.path(tempdir(), "study-x"))
  expect_type(paths, "list")
  expect_true(all(c(
    "root", "config", "study_config", "data_config", "packages_config",
    "workflows", "input", "output", "readme", "index_html",
    "manifest", "index_json", "status_json"
  ) %in% names(paths)))
  expect_equal(basename(paths$study_config), "study-config.yaml")
  expect_equal(basename(paths$data_config), "data-config.yaml")
  expect_equal(basename(paths$workflows), "workflows")
})

test_that("og_project_paths rejects bad input", {
  expect_error(og_project_paths(c("a", "b")), "single")
  expect_error(og_project_paths(NA_character_), "single")
})

# ---------------------------------------------------------------------------
# og_init — fast path (example = FALSE, no gsm.core needed)
# ---------------------------------------------------------------------------

test_that("og_init scaffolds the full folder layout (example = FALSE)", {
  proj <- withr::local_tempdir()
  res <- suppressMessages(og_init(proj, example = FALSE))
  expect_equal(res, proj)

  paths <- og_project_paths(proj)
  expect_true(dir.exists(paths$config))
  expect_true(dir.exists(paths$input))
  expect_true(dir.exists(paths$output))
  for (phase in c("1_mappings", "2_metrics", "3_reporting", "4_modules")) {
    expect_true(dir.exists(file.path(paths$workflows, phase)))
  }

  # Config + README templates copied.
  expect_true(file.exists(paths$study_config))
  expect_true(file.exists(paths$data_config))
  expect_true(file.exists(paths$packages_config))
  expect_true(file.exists(paths$readme))

  # example = FALSE leaves input/ empty.
  expect_equal(length(list.files(paths$input)), 0L)
})

test_that("og_init snapshots exactly the canonical workflow set", {
  proj <- withr::local_tempdir()
  suppressMessages(og_init(proj, example = FALSE))
  wf <- og_project_paths(proj)$workflows

  count_yaml <- function(phase) {
    length(list.files(file.path(wf, phase), pattern = "\\.yaml$"))
  }
  expect_equal(count_yaml("1_mappings"), 13L)
  expect_equal(count_yaml("2_metrics"), 25L)
  expect_equal(count_yaml("3_reporting"), 4L)
  expect_equal(count_yaml("4_modules"), 2L)

  # Spot-check specific IDs are present and installed-package extras are not.
  expect_true(file.exists(file.path(wf, "1_mappings", "AE.yaml")))
  expect_true(file.exists(file.path(wf, "2_metrics", "srs0001.yaml")))
  expect_true(file.exists(file.path(wf, "4_modules", "report_kri_site.yaml")))
  expect_false(file.exists(file.path(wf, "1_mappings", "Death.yaml")))
  expect_false(file.exists(file.path(wf, "2_metrics", "kri0013.yaml")))
})

test_that("og_init refuses to clobber an existing project without overwrite", {
  proj <- withr::local_tempdir()
  suppressMessages(og_init(proj, example = FALSE))
  expect_error(og_init(proj, example = FALSE), "already exists")
  # overwrite = TRUE reinitializes cleanly.
  expect_silent(suppressMessages(og_init(proj, example = FALSE, overwrite = TRUE)))
})

test_that("og_init validates project_dir", {
  expect_error(og_init(123), "single")
  expect_error(og_init(c("a", "b")), "single")
})

# ---------------------------------------------------------------------------
# Example data (mirrors demo initData.R) — small 2-domain fast path
# ---------------------------------------------------------------------------

test_that("example data writes renamed columns per the demo's initData.R", {
  skip_if_not_installed("gsm.core")
  input_dir <- withr::local_tempdir()
  written <- .og_write_example_data(
    input_dir,
    domains = c("Raw_SUBJ", "Raw_SITE"),
    overwrite = TRUE
  )
  expect_length(written, 2L)
  site_csv <- file.path(input_dir, "Raw_SITE.csv")
  subj_csv <- file.path(input_dir, "Raw_SUBJ.csv")
  expect_true(file.exists(site_csv))
  expect_true(file.exists(subj_csv))

  site <- utils::read.csv(site_csv, stringsAsFactors = FALSE, check.names = FALSE)
  # SITE mapping renames pi_number -> invid, protocol -> studyid.
  expect_true("invid" %in% names(site))
  expect_true("studyid" %in% names(site))
  expect_false("pi_number" %in% names(site))
})

test_that("example data does not clobber user files unless overwrite = TRUE", {
  skip_if_not_installed("gsm.core")
  input_dir <- withr::local_tempdir()
  user_file <- file.path(input_dir, "Raw_SUBJ.csv")
  writeLines("sentinel", user_file)

  # overwrite = FALSE keeps the user's file.
  .og_write_example_data(input_dir, domains = "Raw_SUBJ", overwrite = FALSE)
  expect_equal(readLines(user_file)[1], "sentinel")

  # overwrite = TRUE replaces it.
  .og_write_example_data(input_dir, domains = "Raw_SUBJ", overwrite = TRUE)
  expect_false(identical(readLines(user_file)[1], "sentinel"))
})

test_that(".og_cap_rows_per_group keeps the first N per group", {
  df <- data.frame(
    g = c("a", "a", "a", "b", "b"),
    o = c(3, 1, 2, 2, 1),
    stringsAsFactors = FALSE
  )
  capped <- .og_cap_rows_per_group(df, "g", "o", max_rows = 2L)
  expect_equal(nrow(capped), 4L) # 2 from a, 2 from b
  # Within group a, ordered by o, the kept rows are o = 1, 2 (not 3).
  a_rows <- capped[capped$g == "a", ]
  expect_setequal(a_rows$o, c(1, 2))
})
