# Round-trip acceptance test for the filesystem lConfig twin.
#
# This is the acceptance bar for A1: a real workflow, driven by
# workr::RunWorkflow, must load its input CSV through fs_LoadData and write its
# output CSV + status.json through fs_SaveData, entirely on the local
# filesystem — proving the workr lConfig LoadData/SaveData seam is a genuinely
# swappable backend (the filesystem twin of the GitHub backbone).
#
# It uses a trivial `name: "="` step (pass-through assignment), the same step
# pattern the demo branch uses for its identity mappings.

fs_roundtrip_make_project <- function(root) {
  dir.create(file.path(root, "input"), recursive = TRUE, showWarnings = FALSE)
  root
}

test_that("fs_lConfig round-trips a workflow through workr::RunWorkflow", {
  skip_if_not_installed("workr")
  skip_if_not_installed("withr")
  skip_if_not_installed("jsonlite")

  root <- fs_roundtrip_make_project(withr::local_tempdir())
  raw <- data.frame(
    subjid = c("S1", "S2", "S3"),
    val = c(1L, 2L, 3L),
    stringsAsFactors = FALSE
  )
  write.csv(raw, file.path(root, "input", "Raw_Foo.csv"), row.names = FALSE)

  lConfig <- fs_lConfig(root, data_config = list(Raw_Foo = "input/Raw_Foo.csv"))

  wf <- list(
    meta = list(Type = "Mapped", ID = "Foo"),
    spec = list(Raw_Foo = list()),
    steps = list(
      list(
        output = "Mapped_Foo",
        name = "=",
        params = list(lhs = "Mapped_Foo", rhs = "Raw_Foo")
      )
    )
  )

  result <- suppressMessages(
    workr::RunWorkflow(lWorkflow = wf, lConfig = lConfig)
  )

  # The workflow result is the loaded data, proving LoadData ran on disk.
  expect_s3_class(result, "data.frame")
  expect_equal(result, raw)

  # SaveData wrote the output CSV under the demo-branch layout.
  out_csv <- file.path(root, "output", "1_mappings", "Foo", "Mapped_Foo.csv")
  expect_true(file.exists(out_csv))
  roundtripped <- read.csv(out_csv, stringsAsFactors = FALSE)
  expect_equal(roundtripped, raw)

  # status.json records the workflow.
  status <- jsonlite::fromJSON(
    file.path(root, "status.json"),
    simplifyVector = FALSE
  )
  expect_true("Mapped_Foo" %in% names(status$workflows))
  expect_equal(status$workflows$Mapped_Foo$status, "completed")
})

test_that("fs_lConfig round-trip merges status.json across two workflows", {
  skip_if_not_installed("workr")
  skip_if_not_installed("withr")
  skip_if_not_installed("jsonlite")

  root <- fs_roundtrip_make_project(withr::local_tempdir())
  write.csv(
    data.frame(subjid = c("S1", "S2"), val = c(1L, 2L)),
    file.path(root, "input", "Raw_Foo.csv"),
    row.names = FALSE
  )
  write.csv(
    data.frame(invid = c("A", "B"), n = c(10L, 20L)),
    file.path(root, "input", "Raw_Bar.csv"),
    row.names = FALSE
  )

  # Second config uses the default input/{domain}.csv convention (NULL config).
  lConfig1 <- fs_lConfig(root, data_config = list(Raw_Foo = "input/Raw_Foo.csv"))
  lConfig2 <- fs_lConfig(root)

  wf1 <- list(
    meta = list(Type = "Mapped", ID = "Foo"),
    spec = list(Raw_Foo = list()),
    steps = list(list(
      output = "Mapped_Foo",
      name = "=",
      params = list(lhs = "Mapped_Foo", rhs = "Raw_Foo")
    ))
  )
  wf2 <- list(
    meta = list(Type = "Analysis", ID = "bar"),
    spec = list(Raw_Bar = list()),
    steps = list(list(
      output = "Analysis_bar",
      name = "=",
      params = list(lhs = "Analysis_bar", rhs = "Raw_Bar")
    ))
  )

  suppressMessages(workr::RunWorkflow(lWorkflow = wf1, lConfig = lConfig1))
  suppressMessages(workr::RunWorkflow(lWorkflow = wf2, lConfig = lConfig2))

  # Both outputs exist in their respective phase directories.
  expect_true(file.exists(
    file.path(root, "output", "1_mappings", "Foo", "Mapped_Foo.csv")
  ))
  expect_true(file.exists(
    file.path(root, "output", "2_metrics", "bar", "Analysis_bar.csv")
  ))

  # status.json holds BOTH workflows — the second save did not clobber the first.
  status <- jsonlite::fromJSON(
    file.path(root, "status.json"),
    simplifyVector = FALSE
  )
  expect_true(all(
    c("Mapped_Foo", "Analysis_bar") %in% names(status$workflows)
  ))
})
