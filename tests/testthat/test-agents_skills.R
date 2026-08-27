# Tests for AGENTS.md and skills/*.md files
# Validates: Requirements 25.1, 25.2, 25.3, 25.4, 25.5, 25.6, 26.1, 26.8, 26.9

pkg_root <- system.file(package = "open.gismo")
# Fallback for dev/test context where package isn't installed
if (pkg_root == "" || !file.exists(file.path(pkg_root, "AGENTS.md"))) {
  pkg_root <- file.path(testthat::test_path(), "..", "..")
}

agents_path <- file.path(pkg_root, "AGENTS.md")
skills_dir <- file.path(pkg_root, "skills")

# Skip all tests in this file if AGENTS.md and skills/ are not available
# (e.g., during R CMD check where these files are not in the installed package)
if (!file.exists(agents_path) && !dir.exists(skills_dir)) {
  testthat::skip("AGENTS.md and skills/ not available (not in source tree)")
}

# Expected skills files per requirements 26.2-26.7
expected_skills <- c(
  "add-workflow.md",
  "add-lconfig-hook.md",
  "add-frontend-view.md",
  "run-pipeline.md",
  "create-package-snapshot.md",
  "create-project-snapshot.md"
)

# Tool-specific product names that should NOT appear in skills files (Req 26.8)
tool_specific_terms <- c(
  "Copilot",
  "GitHub Copilot",
  "Cursor",
  "Kiro",
  "ChatGPT",
  "Claude",
  "Cody",
  "Tabnine",
  "Windsurf",
  "Devin"
)

# ---------------------------------------------------------------------------
# AGENTS.md tests (Requirement 25)
# ---------------------------------------------------------------------------

test_that("AGENTS.md exists at package root", {
  expect_true(file.exists(agents_path))
})

test_that("AGENTS.md contains architecture overview section", {
  skip_if_not(file.exists(agents_path), "AGENTS.md does not exist yet")
  content <- tolower(readLines(agents_path, warn = FALSE))
  content_text <- paste(content, collapse = "\n")
  expect_true(
    grepl("architecture", content_text) && grepl("overview", content_text),
    label = "AGENTS.md should contain an architecture overview section"
  )
})

test_that("AGENTS.md contains component development workflows section", {
  skip_if_not(file.exists(agents_path), "AGENTS.md does not exist yet")
  content <- tolower(paste(
    readLines(agents_path, warn = FALSE),
    collapse = "\n"
  ))
  # Should cover: adding workflow YAML, modifying front-end, updating Actions, implementing lConfig hook
  expect_true(
    grepl("development workflow", content) ||
      grepl("component.+workflow", content),
    label = "AGENTS.md should contain component development workflows"
  )
})

test_that("AGENTS.md contains testing instructions section", {
  skip_if_not(file.exists(agents_path), "AGENTS.md does not exist yet")
  content <- tolower(paste(
    readLines(agents_path, warn = FALSE),
    collapse = "\n"
  ))
  expect_true(
    grepl("testing", content) && grepl("instruction", content),
    label = "AGENTS.md should contain testing instructions"
  )
})

test_that("AGENTS.md contains PR/review workflow section", {
  skip_if_not(file.exists(agents_path), "AGENTS.md does not exist yet")
  content <- tolower(paste(
    readLines(agents_path, warn = FALSE),
    collapse = "\n"
  ))
  expect_true(
    (grepl("pull request", content) || grepl("\\bpr\\b", content)) &&
      grepl("review", content),
    label = "AGENTS.md should contain PR/review workflow"
  )
})

test_that("AGENTS.md contains interface contracts section", {
  skip_if_not(file.exists(agents_path), "AGENTS.md does not exist yet")
  content <- tolower(paste(
    readLines(agents_path, warn = FALSE),
    collapse = "\n"
  ))
  expect_true(
    grepl("interface", content) && grepl("contract", content),
    label = "AGENTS.md should contain interface contracts"
  )
})

# ---------------------------------------------------------------------------
# Skills directory and file existence tests (Requirement 26)
# ---------------------------------------------------------------------------

test_that("skills/ directory exists", {
  expect_true(dir.exists(skills_dir))
})

test_that("all expected skills files exist", {
  skip_if_not(dir.exists(skills_dir), "skills/ directory does not exist yet")
  for (skill_file in expected_skills) {
    expect_true(
      file.exists(file.path(skills_dir, skill_file)),
      label = paste0("skills/", skill_file, " should exist")
    )
  }
})

# ---------------------------------------------------------------------------
# Skills file required sections tests (Requirement 26.9)
# ---------------------------------------------------------------------------

test_that("each skills file contains preconditions section", {
  skip_if_not(dir.exists(skills_dir), "skills/ directory does not exist yet")
  for (skill_file in expected_skills) {
    fpath <- file.path(skills_dir, skill_file)
    skip_if_not(file.exists(fpath), paste0(skill_file, " does not exist yet"))
    content <- tolower(paste(readLines(fpath, warn = FALSE), collapse = "\n"))
    expect_true(
      grepl("precondition", content),
      label = paste0(skill_file, " should contain a preconditions section")
    )
  }
})

test_that("each skills file contains step-by-step instructions section", {
  skip_if_not(dir.exists(skills_dir), "skills/ directory does not exist yet")
  for (skill_file in expected_skills) {
    fpath <- file.path(skills_dir, skill_file)
    skip_if_not(file.exists(fpath), paste0(skill_file, " does not exist yet"))
    content <- tolower(paste(readLines(fpath, warn = FALSE), collapse = "\n"))
    expect_true(
      grepl("step-by-step", content) ||
        grepl("step.by.step", content) ||
        grepl("instructions", content) ||
        grepl("## steps", content),
      label = paste0(skill_file, " should contain step-by-step instructions")
    )
  }
})

test_that("each skills file contains expected outputs section", {
  skip_if_not(dir.exists(skills_dir), "skills/ directory does not exist yet")
  for (skill_file in expected_skills) {
    fpath <- file.path(skills_dir, skill_file)
    skip_if_not(file.exists(fpath), paste0(skill_file, " does not exist yet"))
    content <- tolower(paste(readLines(fpath, warn = FALSE), collapse = "\n"))
    expect_true(
      grepl("expected output", content) || grepl("expected result", content),
      label = paste0(skill_file, " should contain expected outputs section")
    )
  }
})

test_that("each skills file contains verification criteria section", {
  skip_if_not(dir.exists(skills_dir), "skills/ directory does not exist yet")
  for (skill_file in expected_skills) {
    fpath <- file.path(skills_dir, skill_file)
    skip_if_not(file.exists(fpath), paste0(skill_file, " does not exist yet"))
    content <- tolower(paste(readLines(fpath, warn = FALSE), collapse = "\n"))
    expect_true(
      grepl("verification", content) || grepl("verify", content),
      label = paste0(
        skill_file,
        " should contain verification criteria section"
      )
    )
  }
})

# ---------------------------------------------------------------------------
# Tool-agnostic language tests (Requirement 26.8)
# ---------------------------------------------------------------------------

test_that("skills files use tool-agnostic language (no product-specific references)", {
  skip_if_not(dir.exists(skills_dir), "skills/ directory does not exist yet")
  for (skill_file in expected_skills) {
    fpath <- file.path(skills_dir, skill_file)
    skip_if_not(file.exists(fpath), paste0(skill_file, " does not exist yet"))
    content <- paste(readLines(fpath, warn = FALSE), collapse = "\n")
    for (term in tool_specific_terms) {
      expect_false(
        grepl(term, content, ignore.case = TRUE),
        label = paste0(
          skill_file,
          " should not reference '",
          term,
          "' — use generic terms like 'AI assistant' instead"
        )
      )
    }
  }
})
