# Tests for og_validate() — the input-data "forgiveness layer".

# Required columns for the AE mapping's Raw_AE spec (from gsm.mapping AE.yaml).
ae_cols <- c(
  "studyid", "subjid", "aeser", "aest_dt", "aeen_dt", "mdrpt_nsv",
  "mdrsoc_nsv", "aetoxgr", "aeongo", "aerel", "mincreated_dts"
)

# Write a minimal, valid Raw_AE CSV (aetoxgr is spec type integer).
write_ae <- function(input_dir, aetoxgr = c(1L, 2L), drop = character(0)) {
  df <- data.frame(
    studyid = "S1", subjid = c("001", "002"), aeser = "N",
    aest_dt = "2020-01-01", aeen_dt = "2020-01-05",
    mdrpt_nsv = "term", mdrsoc_nsv = "soc", aetoxgr = aetoxgr,
    aeongo = "N", aerel = "Y", mincreated_dts = "2020-01-01T00:00:00",
    stringsAsFactors = FALSE
  )
  df <- df[, setdiff(names(df), drop), drop = FALSE]
  utils::write.csv(df, file.path(input_dir, "Raw_AE.csv"), row.names = FALSE)
}

make_project <- function() {
  proj <- withr::local_tempdir(.local_envir = parent.frame())
  suppressMessages(og_init(proj, example = FALSE))
  proj
}

# ---------------------------------------------------------------------------
# Contract shape
# ---------------------------------------------------------------------------

test_that("og_validate returns the contract data.frame with class og_validation", {
  proj <- make_project()
  res <- og_validate(proj)
  expect_s3_class(res, "og_validation")
  expect_s3_class(res, "data.frame")
  expect_equal(
    names(res),
    c("domain", "file", "status", "n_rows", "n_cols", "problems")
  )
  # Every input domain the mappings reference should appear, and only Raw_*.
  expect_true(all(grepl("^Raw_", res$domain)))
  expect_true("Raw_AE" %in% res$domain)
  expect_true("Raw_SITE" %in% res$domain)
  # COUNTRY mapping has no raw input, so no Raw_COUNTRY row.
  expect_false("Raw_COUNTRY" %in% res$domain)
})

# ---------------------------------------------------------------------------
# Status detection
# ---------------------------------------------------------------------------

test_that("og_validate reports a present, well-formed file as ok", {
  proj <- make_project()
  write_ae(og_project_paths(proj)$input)
  res <- og_validate(proj)
  ae <- res[res$domain == "Raw_AE", ]
  expect_equal(ae$status, "ok")
  expect_equal(ae$n_rows, 2L)
  expect_equal(ae$n_cols, length(ae_cols))
  expect_equal(ae$problems, "")
})

test_that("og_validate names a missing required column and flags it as error", {
  proj <- make_project()
  # Drop 'subjid' — a required Raw_AE column.
  write_ae(og_project_paths(proj)$input, drop = "subjid")
  res <- og_validate(proj)
  ae <- res[res$domain == "Raw_AE", ]
  expect_equal(ae$status, "error")
  expect_match(ae$problems, "subjid")
  expect_match(ae$problems, "missing column")
})

test_that("og_validate reports an absent file as missing", {
  proj <- make_project()
  # No input files written at all.
  res <- og_validate(proj)
  ae <- res[res$domain == "Raw_AE", ]
  expect_equal(ae$status, "missing")
  expect_match(ae$problems, "not found")
  expect_true(is.na(ae$n_rows))
})

test_that("og_validate ignores the gsm.core '_all' sentinel, not a missing column", {
  proj <- make_project()
  # A user-authored mapping using gsm.core's documented '_all' wildcard marker
  # (Raw_VISIT: _all: required: true). '_all' is a spec directive, not a real
  # input column, so it must not surface as "missing column: _all".
  mapping_dir <- file.path(proj, "workflows", "1_mappings")
  writeLines(
    c(
      "meta:",
      "  Type: Mapped",
      "  ID: VISIT",
      "spec:",
      "  Raw_VISIT:",
      "    _all:",
      "      required: true",
      "    subjid:",
      "      type: character",
      "steps:",
      "  - output: Mapped_VISIT",
      "    name: =",
      "    params:",
      "      lhs: Mapped_VISIT",
      "      rhs: Raw_VISIT"
    ),
    file.path(mapping_dir, "VISIT.yaml")
  )
  utils::write.csv(
    data.frame(subjid = c("001", "002"), stringsAsFactors = FALSE),
    file.path(og_project_paths(proj)$input, "Raw_VISIT.csv"),
    row.names = FALSE
  )

  res <- og_validate(proj)
  visit <- res[res$domain == "Raw_VISIT", ]
  expect_equal(nrow(visit), 1L)
  expect_equal(visit$status, "ok")
  expect_false(grepl("_all", visit$problems))
})

test_that("og_validate warns (not errors) on an uncoercible numeric column", {
  proj <- make_project()
  # aetoxgr spec type is integer; supply a non-integer value.
  write_ae(og_project_paths(proj)$input, aetoxgr = c("severe", "mild"))
  res <- og_validate(proj)
  ae <- res[res$domain == "Raw_AE", ]
  expect_equal(ae$status, "warning")
  expect_match(ae$problems, "aetoxgr")
  expect_match(ae$problems, "integer")
})

# ---------------------------------------------------------------------------
# print method
# ---------------------------------------------------------------------------

test_that("print.og_validation renders without error and mentions the fix", {
  proj <- make_project()
  write_ae(og_project_paths(proj)$input, drop = "subjid")
  res <- og_validate(proj)
  # Call the method directly so the test is deterministic regardless of when
  # the NAMESPACE gains its S3method(print, og_validation) entry (the
  # integrator regenerates it with document()); real autoprint dispatch is
  # exercised in the integrated package.
  out <- capture.output(print.og_validation(res))
  txt <- paste(out, collapse = "\n")
  expect_match(txt, "Raw_AE")
  expect_match(txt, "Fix these before og_run", fixed = TRUE)
  # print returns its input invisibly.
  expect_identical(withVisible(print.og_validation(res))$visible, FALSE)
})

# ---------------------------------------------------------------------------
# data-config flattening
# ---------------------------------------------------------------------------

test_that("og_read_data_config returns a flat domain -> path map", {
  proj <- make_project()
  cfg <- og_read_data_config(proj)
  expect_type(cfg, "list")
  expect_equal(cfg[["Raw_AE"]], "input/Raw_AE.csv")
})

test_that("og_read_data_config unwraps the nested demo form", {
  proj <- withr::local_tempdir()
  dir.create(file.path(proj, "config"), recursive = TRUE)
  writeLines(
    c("domains:", "  Raw_AE:", "    path: input/custom_AE.csv"),
    file.path(proj, "config", "data-config.yaml")
  )
  cfg <- og_read_data_config(proj)
  expect_equal(cfg[["Raw_AE"]], "input/custom_AE.csv")
})
