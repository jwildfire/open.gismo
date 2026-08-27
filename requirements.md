# Requirements Document

## Introduction

open.gismo is an end-to-end analytics platform for running R workflows using the {workr} package. The platform has four modular components — Database, Analytics Engine, Web Front-end, and Config — that work together to provide a fully open-source pipeline for executing, storing, and visualizing analytical workflows. The default implementation uses GitHub as the backbone: repos and releases for storage, GitHub Actions for compute, GitHub Pages for the front-end, and YAML files in repos for configuration.

## Glossary

- **Platform**: The open.gismo system comprising all four components (Database, Analytics Engine, Web Front-end, Config)
- **Database_Component**: The storage layer that persists raw data, analytics outputs (data and reports), workflow metadata, and serves data to the Web Front-end. Default implementation uses GitHub repos and release artifacts.
- **Analytics_Engine**: The compute layer that executes R workflows via {workr}, reading input data from and writing output data to the Database_Component. Default implementation uses GitHub Actions.
- **Web_Frontend**: The user-facing interface that visualizes {workr} pipeline summaries, including input/output data, code, logs, and packages. Default implementation uses GitHub Pages.
- **Config_Component**: The collection of YAML workflow files and configuration files that define how workflows are structured, parameterized, and executed.
- **Workflow**: A single {workr} YAML specification containing `meta` and `steps` sections, defining a sequence of function calls with parameterized inputs and outputs.
- **Workflow_Step**: A single function call within a Workflow, defined by a function name, output name, and parameter mappings.
- **Pipeline**: An ordered collection of Workflows organized into phases (e.g., Mappings, Metrics, Reporting, Modules).
- **Phase**: A logical grouping of Workflows within a Pipeline (e.g., Phase 1: Mappings, Phase 2: Metrics).
- **Package_Snapshot**: A reproducible point-in-time capture of all R package versions (manifest.csv, rproject.toml) and their associated workflow YAML files, used to define a reproducible R environment.
- **Project_Snapshot**: A versioned capture of the database artifacts (data frames, reports, logs) produced by a {workr} Pipeline run for a given set of input data and Workflow YAMLs. A Project may contain multiple Project_Snapshots representing different versions of input data.
- **Snapshot_Branch**: An orphan Git branch (e.g., `ss-dev`, `ss-demo`) that stores Package_Snapshot artifacts (manifest.csv, rproject.toml, workflow files).
- **Project**: A GitHub repository configured with workflow YAML files, config files, and GitHub Actions to run a specific set of analytics Pipelines.
- **lConfig**: A configuration list object passed to `workr::RunWorkflow` containing `LoadData` and `SaveData` hook functions for database integration.
- **Manifest**: A CSV file (`manifest.csv`) listing all R packages with their org, name, version, repository URL, download URL, and commit SHA.
- **Workflow_Explorer**: The Web_Frontend application that displays Pipeline summaries, Workflow details, and package information.
- **YAML_Parser**: The component within the Web_Frontend that parses {workr} YAML files to extract metadata, specs, and steps for display.
- **Agent_Instructions**: A comprehensive development guide (AGENTS.md) that describes the multi-language, multi-component architecture of the Platform and provides component-specific development workflows, testing instructions, and interface contracts for AI coding agents and human developers.
- **AI_Skills**: A collection of generic, tool-agnostic structured markdown files that provide step-by-step instructions for common Platform development tasks, designed to be followed by any AI coding assistant.

## Requirements

### Requirement 1: GitHub Database — Data Storage

**User Story:** As an analyst, I want raw data and analytics outputs stored in GitHub repositories, so that I have version-controlled, accessible storage without external infrastructure.

#### Acceptance Criteria

1. THE Database_Component SHALL store raw input data as files committed to GitHub repositories or as GitHub release artifacts.
2. THE Database_Component SHALL store analytics output data (data frames, reports) as files committed to GitHub repositories or as GitHub release artifacts.
3. THE Database_Component SHALL store Workflow metadata (logs, execution status) alongside output data in the same GitHub repository.
4. WHEN the Analytics_Engine writes output data, THE Database_Component SHALL persist the data to the configured GitHub repository location.
5. WHEN the Web_Frontend requests data, THE Database_Component SHALL serve data from the GitHub repository via the GitHub API or raw file URLs.
6. THE Database_Component SHALL organize stored data by Project, Project_Snapshot, and Pipeline Phase.

### Requirement 2: GitHub Database — lConfig Hooks

**User Story:** As a developer, I want custom LoadData and SaveData hooks for GitHub-based storage, so that {workr} workflows can seamlessly read from and write to GitHub repos.

#### Acceptance Criteria

1. THE Database_Component SHALL provide an `lConfig$LoadData` function that accepts three parameters: `lWorkflow`, `lConfig`, and `lData`.
2. WHEN `lConfig$LoadData` is called, THE Database_Component SHALL retrieve data specified in `lWorkflow$spec` from the configured GitHub repository.
3. THE Database_Component SHALL provide an `lConfig$SaveData` function that accepts two parameters: `lWorkflow` and `lConfig`.
4. WHEN `lConfig$SaveData` is called, THE Database_Component SHALL persist `lWorkflow$lResult` and any additional output data to the configured GitHub repository.
5. IF the GitHub API returns an error during LoadData, THEN THE Database_Component SHALL log the error with the repository path and HTTP status code.
6. IF the GitHub API returns an error during SaveData, THEN THE Database_Component SHALL log the error and retain the data in the local workflow object for retry.

### Requirement 3: Analytics Engine — GitHub Actions Workflow Execution

**User Story:** As an analyst, I want GitHub Actions to execute my {workr} pipelines automatically, so that I can run analytics without managing compute infrastructure.

#### Acceptance Criteria

1. THE Analytics_Engine SHALL execute {workr} Pipelines by calling `workr::RunWorkflows` within a GitHub Actions job.
2. THE Analytics_Engine SHALL install R and all required R packages as specified in the Package_Snapshot Manifest before executing Workflows.
3. THE Analytics_Engine SHALL pass the GitHub-specific `lConfig` object (with LoadData and SaveData hooks) to `workr::RunWorkflow`.
4. WHEN a GitHub Actions workflow is triggered, THE Analytics_Engine SHALL load Workflow YAML files from the Config_Component using `workr::MakeWorkflowList`.
5. WHEN all Workflows in a Pipeline complete, THE Analytics_Engine SHALL commit output artifacts to the designated Project_Snapshot within the Snapshot_Branch.
6. IF a Workflow_Step fails during execution, THEN THE Analytics_Engine SHALL log the error, record the failure status, and continue to the next independent Workflow.

### Requirement 4: Analytics Engine — Package Snapshot Management

**User Story:** As a developer, I want automated package snapshots that capture reproducible R environments, so that every pipeline run uses a known set of package versions.

#### Acceptance Criteria

1. THE Analytics_Engine SHALL create Package_Snapshots by calling `workr::pkgSnapshot` with a list of GitHub-hosted R package references.
2. WHEN a Package_Snapshot is created, THE Analytics_Engine SHALL generate a `manifest.csv` containing org, package name, version, repository URL, download URL, and commit SHA for each package.
3. WHEN a Package_Snapshot is created, THE Analytics_Engine SHALL generate an `rproject.toml` file compatible with the rv package manager.
4. WHEN a Package_Snapshot is created, THE Analytics_Engine SHALL pull workflow YAML files from each package's `inst/workflow` directory.
5. THE Analytics_Engine SHALL store Package_Snapshot artifacts (manifest.csv, rproject.toml, workflows/) on the designated Snapshot_Branch.
6. THE Analytics_Engine SHALL support initializing a new Snapshot_Branch from a `packages.yaml` configuration file via the `init-snapshot` GitHub Actions workflow.
7. THE Analytics_Engine SHALL support nightly automated Package_Snapshots via a scheduled GitHub Actions workflow.
8. WHEN a package reference includes a tag or SHA (e.g., `org/repo@v1.0`), THE Analytics_Engine SHALL resolve that exact version.
9. WHEN a package reference omits a tag and a branch is specified, THE Analytics_Engine SHALL resolve the package from the specified branch HEAD.
10. WHEN a package reference omits a tag and a date is specified, THE Analytics_Engine SHALL resolve the latest release on or before that date.

### Requirement 5: Config — Workflow YAML Structure

**User Story:** As an analyst, I want a standardized YAML format for defining workflows, so that I can declaratively specify analytics pipelines without writing boilerplate R code.

#### Acceptance Criteria

1. THE Config_Component SHALL define each Workflow as a YAML file containing a `meta` section and a `steps` section.
2. THE Config_Component SHALL require each `meta` section to include a `Type` field and an `ID` field.
3. THE Config_Component SHALL define each Workflow_Step with a `name` (function to call), `output` (result variable name), and `params` (named parameter mappings).
4. THE Config_Component SHALL support an optional `spec` section that defines required input data domains and their column specifications.
5. THE Config_Component SHALL support an optional `Priority` field in the `meta` section to control Workflow execution order.
6. WHEN a YAML file name does not match the `meta$ID` value, THE Config_Component SHALL log a warning.
7. THE Config_Component SHALL organize Workflow YAML files into phase-based directory structures (e.g., `1_mappings/`, `2_metrics/`, `3_reporting/`).

### Requirement 6: Config — Project Configuration

**User Story:** As a developer, I want a standardized project configuration structure, so that I can set up new analytics projects consistently.

#### Acceptance Criteria

1. THE Config_Component SHALL define project-level configuration in a `packages.yaml` file listing all required R package references.
2. THE Config_Component SHALL support a `data-config.yaml` file that maps data domain names to storage locations.
3. THE Config_Component SHALL support a `study-config.yaml` file containing project metadata (study ID, study name, study title) and a list of workflow images to execute.
4. THE Config_Component SHALL support organizing Workflows into a `workflow/` directory with phase-based subdirectories.
5. THE Config_Component SHALL support a `modules/` directory for output modules, each containing its own config, steps, and spec files.

### Requirement 7: Config — YAML Parsing and Pretty-Printing

**User Story:** As a developer, I want reliable YAML parsing and formatting for workflow files, so that configuration can be read, modified, and written back without data loss.

#### Acceptance Criteria

1. THE YAML_Parser SHALL parse Workflow YAML files into structured objects containing `meta`, `spec`, and `steps` sections.
2. THE YAML_Parser SHALL extract all key-value pairs from the `meta` section.
3. THE YAML_Parser SHALL extract nested `spec` definitions including dataset names, column names, and column properties (type, required).
4. THE YAML_Parser SHALL extract each Workflow_Step's `name`, `output`, and `params` fields.
5. THE YAML_Parser SHALL format structured Workflow objects back into valid YAML text.
6. FOR ALL valid Workflow YAML files, parsing then pretty-printing then parsing SHALL produce an equivalent structured object (round-trip property).

### Requirement 8: Web Front-end — Project List View

**User Story:** As a user, I want to see a list of available projects (snapshot branches), so that I can select which analytics pipeline to explore.

#### Acceptance Criteria

1. WHEN the Workflow_Explorer loads, THE Web_Frontend SHALL fetch the list of available Snapshot_Branches from `data/branches.json`.
2. THE Web_Frontend SHALL display Snapshot_Branches in a dropdown selector, sorted with priority branches (dev, main, prod) listed first.
3. WHEN the user selects a Snapshot_Branch, THE Web_Frontend SHALL load and display the Workflows, packages, and available Project_Snapshots for that branch.
4. IF the branch list fails to load, THEN THE Web_Frontend SHALL display an error message indicating the failure reason.

### Requirement 9: Web Front-end — Pipeline Summary View

**User Story:** As a user, I want to see a visual summary of all workflows in a pipeline organized by phase, so that I can understand the overall analytics flow.

#### Acceptance Criteria

1. WHEN a Snapshot_Branch is selected, THE Web_Frontend SHALL fetch the workflow index from `data/{branch}/_index.json`.
2. THE Web_Frontend SHALL group Workflows by Phase based on directory prefix (e.g., `0_` for Config, `1_` for Mappings, `2_` for Metrics).
3. THE Web_Frontend SHALL display each Phase as a labeled column with a count of contained Workflows.
4. THE Web_Frontend SHALL display each Workflow as a card showing its ID, description, priority, group level, and analysis type.
5. THE Web_Frontend SHALL connect Phases with directional arrows indicating data flow order.
6. THE Web_Frontend SHALL display summary statistics showing the total count of Workflows per Phase.
7. THE Web_Frontend SHALL support a compact view mode that shows only Workflow IDs without metadata tags.
8. THE Web_Frontend SHALL support filtering Workflows by group level (e.g., Site, Country, Study, Subject).
9. THE Web_Frontend SHALL support searching Workflows by ID, description, name, abbreviation, or group level.

### Requirement 10: Web Front-end — Workflow Detail View

**User Story:** As a user, I want to view the details of a specific workflow including its metadata, input spec, and step-by-step execution plan, so that I can understand exactly what each workflow does.

#### Acceptance Criteria

1. WHEN the user clicks the info button on a Workflow card, THE Web_Frontend SHALL open a modal dialog displaying the Workflow details.
2. THE Web_Frontend SHALL display the Workflow metadata section showing all key-value pairs from the `meta` section.
3. THE Web_Frontend SHALL display the input spec section showing required datasets, column names, and column properties.
4. THE Web_Frontend SHALL display the steps section showing each Workflow_Step's function name, output name, and parameters in execution order.
5. THE Web_Frontend SHALL connect Workflow_Steps with directional arrows indicating data flow between steps.
6. THE Web_Frontend SHALL provide a toggle to switch between the parsed detail view and the raw YAML text.
7. WHEN the user clicks outside the modal or presses Escape, THE Web_Frontend SHALL close the detail modal.

### Requirement 11: Web Front-end — Package Manifest View

**User Story:** As a user, I want to see the list of R packages and their versions used in a package snapshot, so that I can verify the reproducibility of the analytics environment.

#### Acceptance Criteria

1. WHEN a Snapshot_Branch is selected, THE Web_Frontend SHALL fetch the package manifest from `data/{branch}/manifest.csv`.
2. THE Web_Frontend SHALL display the manifest as a table with columns: Package, Version, Repository, and SHA.
3. THE Web_Frontend SHALL link each package name to its GitHub repository URL.
4. THE Web_Frontend SHALL link each SHA to the specific commit on GitHub.
5. WHEN a Package_Snapshot date file exists (`_snapshot_date.txt`), THE Web_Frontend SHALL display the Package_Snapshot date above the package table.
6. IF no manifest.csv exists for the selected branch, THEN THE Web_Frontend SHALL display a message indicating no manifest is available.

### Requirement 12: Web Front-end — CSV Parsing

**User Story:** As a developer, I want reliable CSV parsing for manifest files, so that package data can be correctly loaded and displayed.

#### Acceptance Criteria

1. THE YAML_Parser SHALL parse CSV text into an array of row objects with headers as keys.
2. THE YAML_Parser SHALL handle quoted field values by stripping surrounding double quotes.
3. THE YAML_Parser SHALL return an empty array when the CSV contains fewer than two lines.
4. FOR ALL valid manifest CSV files, parsing SHALL produce one row object per data line with field values matching the original CSV content.

### Requirement 13: Web Front-end — Static Site Build and Deployment

**User Story:** As a developer, I want the front-end to be built as a static site and deployed to GitHub Pages, so that it requires no server infrastructure.

#### Acceptance Criteria

1. THE Web_Frontend SHALL be built using Vite as a single-file HTML application using the vite-plugin-singlefile plugin.
2. WHEN the site is prepared for publishing, THE Analytics_Engine SHALL deploy the prebuilt static site directly from the `demo` branch root.
3. BEFORE deployment, THE Analytics_Engine SHALL validate that the `demo` branch contains the required site artifacts, including `index.html`, `_index.json`, `workflows/`, `output/`, and `manifest.csv`.
4. THE `demo` branch SHALL be treated as the canonical public demo payload for GitHub Pages publication.
5. THE Analytics_Engine SHALL deploy the built site to GitHub Pages using the GitHub Pages artifact API.
6. THE Analytics_Engine SHALL trigger site deployment on pushes to the `demo` branch and by manual dispatch.

### Requirement 14: Platform — Modularity and Swappability

**User Story:** As a developer, I want each platform component to be independently swappable, so that I can replace GitHub with alternative technologies (e.g., Supabase, AWS S3, Vercel) without rewriting the entire system.

#### Acceptance Criteria

1. THE Platform SHALL decouple the Database_Component from the Analytics_Engine through the `lConfig` hook interface (`LoadData` and `SaveData` functions).
2. THE Platform SHALL decouple the Analytics_Engine from the Config_Component by reading Workflow definitions from YAML files via `workr::MakeWorkflowList`.
3. THE Platform SHALL decouple the Web_Frontend from the Database_Component by reading pre-built static data files (JSON, CSV, YAML) rather than querying a live database.
4. THE Platform SHALL decouple the Web_Frontend from the Analytics_Engine by consuming only the output artifacts (workflow files, manifests) without direct API calls to the engine.
5. THE Platform SHALL document the interface contract for each component boundary, specifying the expected input/output formats.

### Requirement 15: Analytics Engine — Workflow Step Parameter Resolution

**User Story:** As an analyst, I want workflow step parameters to be automatically resolved from metadata, data, or spec objects, so that I can write concise YAML without manual data wiring.

#### Acceptance Criteria

1. WHEN a step parameter value equals "lMeta", THE Analytics_Engine SHALL pass the full `lMeta` object to the function.
2. WHEN a step parameter value equals "lData", THE Analytics_Engine SHALL pass the full `lData` object to the function.
3. WHEN a step parameter value equals "lSpec", THE Analytics_Engine SHALL pass the full `lSpec` object to the function.
4. WHEN a step parameter value matches a key in `lMeta`, THE Analytics_Engine SHALL pass the corresponding `lMeta` property to the function.
5. WHEN a step parameter value matches a key in `lData`, THE Analytics_Engine SHALL pass the corresponding `lData` property to the function.
6. WHEN a step parameter value does not match any known object, THE Analytics_Engine SHALL pass the value as a literal string.
7. WHEN a step parameter value is a vector, THE Analytics_Engine SHALL pass the vector directly without resolution.
8. THE Analytics_Engine SHALL resolve parameters in priority order: lMeta literal → lData literal → lSpec literal → lMeta key → lData key → string passthrough.

### Requirement 16: Analytics Engine — Workflow Chaining

**User Story:** As an analyst, I want outputs from earlier workflows to be available as inputs to later workflows, so that I can build multi-stage pipelines where each phase builds on the previous.

#### Acceptance Criteria

1. WHEN `workr::RunWorkflows` executes multiple Workflows, THE Analytics_Engine SHALL pass the accumulated results from completed Workflows as additional input data to subsequent Workflows.
2. THE Analytics_Engine SHALL name each Workflow result using the `meta$Type` and `meta$ID` fields concatenated with an underscore.
3. WHEN a Workflow_Step produces output with the same name as existing input data, THE Analytics_Engine SHALL overwrite the existing data and log a warning.
4. THE Analytics_Engine SHALL execute Workflows in the order they are provided in the `lWorkflows` list, respecting the `Priority` field for sorting.

### Requirement 17: Analytics Engine — Data Spec Validation

**User Story:** As an analyst, I want input data validated against the workflow spec before execution, so that I catch data issues early rather than during step execution.

#### Acceptance Criteria

1. WHEN a Workflow contains a `spec` section, THE Analytics_Engine SHALL validate that required columns exist in the corresponding input data domains.
2. IF a required column is missing from an input data domain, THEN THE Analytics_Engine SHALL stop execution and report the missing column name and domain.
3. WHEN a Workflow does not contain a `spec` section, THE Analytics_Engine SHALL proceed without validation and log that no spec was found.

### Requirement 18: Database — Project Snapshot Management

**User Story:** As an analyst, I want to create multiple project snapshots for different versions of input data, so that I can track and compare analytics outputs across data versions while retaining access to previous results.

#### Acceptance Criteria

1. THE Database_Component SHALL support multiple Project_Snapshots per Project, each representing a distinct version of input data and the resulting output artifacts.
2. THE Database_Component SHALL assign each Project_Snapshot a unique, ordered identifier that reflects its creation sequence within the Project.
3. WHEN a new Project_Snapshot is created, THE Database_Component SHALL record the input data version, creation timestamp, and the Package_Snapshot used for execution.
4. WHEN a new Project_Snapshot is created, THE Database_Component SHALL store all output artifacts (data frames, reports, logs) produced by the Pipeline run within that Project_Snapshot.
5. THE Database_Component SHALL organize Project_Snapshot artifacts by Pipeline Phase within each Project_Snapshot.
6. WHEN a Pipeline executes within a newer Project_Snapshot, THE Analytics_Engine SHALL make data from all previous Project_Snapshots in the same Project accessible as input data.
7. WHEN a data key exists in both a previous Project_Snapshot and the current Project_Snapshot, THE Analytics_Engine SHALL use the current Project_Snapshot data, giving precedence to the most recent version.
8. THE Database_Component SHALL support listing all Project_Snapshots for a given Project, including their identifiers, creation timestamps, and input data versions.
9. IF a referenced previous Project_Snapshot is unavailable, THEN THE Database_Component SHALL log an error specifying the missing Project_Snapshot identifier and continue execution with available data only.

### Requirement 19: Analytics Engine — Database Read/Write via Save/Load Hooks

**User Story:** As a developer, I want the Analytics Engine to perform all data I/O through the lConfig save/load hook interface during workflow execution, so that the engine remains decoupled from any specific storage implementation.

#### Acceptance Criteria

1. WHEN the Analytics_Engine executes a Workflow, THE Analytics_Engine SHALL read all input data exclusively through the `lConfig$LoadData` hook function provided to `workr::RunWorkflow`.
2. WHEN the Analytics_Engine completes a Workflow_Step that produces output, THE Analytics_Engine SHALL write all output data exclusively through the `lConfig$SaveData` hook function provided to `workr::RunWorkflow`.
3. THE Analytics_Engine SHALL pass the current `lWorkflow` object (including `spec` and `lResult`) to the `lConfig$LoadData` and `lConfig$SaveData` hooks so that hooks can determine which data to load or where to persist results.
4. THE Analytics_Engine SHALL pass the current `lConfig` object to the `lConfig$LoadData` and `lConfig$SaveData` hooks so that hooks can access storage configuration (e.g., repository path, branch, credentials).
5. THE Analytics_Engine SHALL NOT perform direct file system reads or writes for Workflow input/output data outside of the `lConfig$LoadData` and `lConfig$SaveData` hooks.
6. IF `lConfig$LoadData` is not defined, THEN THE Analytics_Engine SHALL log a warning and fall back to the default `workr::RunWorkflow` data loading behavior.
7. IF `lConfig$SaveData` is not defined, THEN THE Analytics_Engine SHALL log a warning and fall back to the default `workr::RunWorkflow` data saving behavior.
8. IF `lConfig$LoadData` returns an error, THEN THE Analytics_Engine SHALL stop execution of the current Workflow and record the error with the data domain name and hook failure details.
9. IF `lConfig$SaveData` returns an error, THEN THE Analytics_Engine SHALL log the error with the Workflow ID and output name, and retain the data in the `lWorkflow$lResult` object for retry.

### Requirement 20: Web Front-end — Workflow Step Execution Status

**User Story:** As a user, I want to see the current execution status of each workflow step within a selected Project_Snapshot, so that I can quickly identify which steps completed, which failed, and which have not yet run.

#### Acceptance Criteria

1. WHEN the user selects a Project_Snapshot, THE Web_Frontend SHALL fetch the execution status for each Workflow_Step from the Project_Snapshot metadata.
2. THE Web_Frontend SHALL display each Workflow_Step with a status indicator showing one of: completed, failed, or not_run.
3. THE Web_Frontend SHALL use distinct visual indicators (e.g., color or icon) for each status so that users can differentiate step states at a glance.
4. WHEN a Workflow_Step has a status of failed, THE Web_Frontend SHALL display the associated error message alongside the status indicator.
5. THE Web_Frontend SHALL display Workflow_Step statuses in execution order within each Workflow.
6. WHEN the execution status data is unavailable for a Project_Snapshot, THE Web_Frontend SHALL display all Workflow_Steps with a status of not_run.
7. THE Web_Frontend SHALL display an aggregate status summary per Workflow showing the count of completed, failed, and not_run steps.

### Requirement 21: Web Front-end — Step Input/Output Artifact Viewer

**User Story:** As a user, I want to view the input and output artifacts for completed and failed workflow steps, so that I can inspect what data went into a step and what was produced (or partially produced before failure).

#### Acceptance Criteria

1. WHEN the user selects a completed or failed Workflow_Step within a Project_Snapshot, THE Web_Frontend SHALL display the list of input artifacts consumed by that step.
2. WHEN the user selects a completed or failed Workflow_Step within a Project_Snapshot, THE Web_Frontend SHALL display the list of output artifacts produced by that step.
3. THE Web_Frontend SHALL display each artifact with its name, data domain, and a preview of the data content (e.g., first rows of a data frame).
4. WHEN a Workflow_Step has a status of failed, THE Web_Frontend SHALL display any partial output artifacts that were produced before the failure occurred.
5. WHEN the user clicks on an artifact, THE Web_Frontend SHALL display the full artifact data in a scrollable table view.
6. WHEN a Workflow_Step has a status of not_run, THE Web_Frontend SHALL disable the artifact viewer and display a message indicating no artifacts are available.
7. IF an artifact file fails to load, THEN THE Web_Frontend SHALL display an error message specifying the artifact name and the failure reason.

### Requirement 22: Web Front-end — Execution Logs Viewer

**User Story:** As a user, I want to view execution logs for each workflow and workflow step within a pipeline run, so that I can diagnose failures, review timing, and inspect stdout/stderr output.

#### Acceptance Criteria

1. WHEN the user selects a Workflow within a Project_Snapshot, THE Web_Frontend SHALL fetch and display the execution log for that Workflow.
2. WHEN the user selects a Workflow_Step within a Project_Snapshot, THE Web_Frontend SHALL fetch and display the execution log for that specific Workflow_Step.
3. THE Web_Frontend SHALL display log entries containing stdout output, stderr output, execution timing (start time, end time, duration), and error details when present.
4. THE Web_Frontend SHALL display log entries in chronological order within each Workflow or Workflow_Step.
5. THE Web_Frontend SHALL visually distinguish stdout output from stderr output using distinct styling (e.g., color or background).
6. WHEN a Workflow_Step has a status of failed, THE Web_Frontend SHALL highlight the error details section within the log viewer.
7. WHEN a Workflow_Step has a status of not_run, THE Web_Frontend SHALL display a message indicating no logs are available for that step.
8. IF the execution log file fails to load, THEN THE Web_Frontend SHALL display an error message specifying the Workflow or Workflow_Step name and the failure reason.

### Requirement 23: Web Front-end — Project Snapshot Selector

**User Story:** As a user, I want to select and switch between Project_Snapshots within a branch, so that I can compare analytics outputs across different versions of input data.

#### Acceptance Criteria

1. WHEN the user selects a Snapshot_Branch, THE Web_Frontend SHALL fetch and display the list of available Project_Snapshots for that branch.
2. THE Web_Frontend SHALL display each Project_Snapshot with its unique identifier, creation timestamp, and input data version.
3. THE Web_Frontend SHALL sort Project_Snapshots in reverse chronological order, with the most recent snapshot displayed first.
4. WHEN the user selects a Project_Snapshot, THE Web_Frontend SHALL load and display the Workflow execution statuses, artifacts, and logs associated with that Project_Snapshot.
5. THE Web_Frontend SHALL visually indicate which Project_Snapshot is currently selected.
6. WHEN a Snapshot_Branch contains only one Project_Snapshot, THE Web_Frontend SHALL auto-select that Project_Snapshot and display its data.
7. IF the Project_Snapshot list fails to load, THEN THE Web_Frontend SHALL display an error message indicating the failure reason.

### Requirement 24: Platform — Example Projects and Demo Data

**User Story:** As a developer, I want bundled example projects and demo data, so that I can validate the platform end-to-end and use them as documentation for new users.

#### Acceptance Criteria

1. THE Platform SHALL include at least one example Project containing Workflow YAML files, configuration files, and sample input data sufficient to execute a complete Pipeline.
2. THE Platform SHALL ensure each example Project exercises all four components: Database_Component, Analytics_Engine, Web_Frontend, and Config_Component.
3. THE Platform SHALL maintain example Projects in a version-controlled location within the repository (e.g., `inst/workflows` or a dedicated examples directory).
4. WHEN the Analytics_Engine executes an example Project Pipeline, THE Analytics_Engine SHALL produce output artifacts that the Web_Frontend can display without modification.
5. THE Platform SHALL include documentation for each example Project describing its purpose, the Workflows it contains, and the expected output.
6. THE Platform SHALL use example Projects as integration test targets to validate that all four components interact correctly.
7. WHEN a new platform release is prepared, THE Platform SHALL verify that all example Projects execute successfully against the current codebase.

### Requirement 25: Platform — Agent Development Instructions

**User Story:** As a developer, I want comprehensive agent development instructions covering the multi-language, multi-component nature of the platform, so that AI coding agents and human developers can understand the architecture and make changes safely across component boundaries.

#### Acceptance Criteria

1. THE Platform SHALL include an Agent_Instructions document (AGENTS.md) that describes the architecture and development workflows for all platform components: R packages, GitHub Actions YAML, JavaScript/Vite front-end, and config YAMLs.
2. THE Agent_Instructions SHALL include component-specific development workflows: how to add a new Workflow YAML, how to modify the Web_Frontend, how to update GitHub Actions, and how to implement a new lConfig hook.
3. THE Agent_Instructions SHALL include testing instructions per component: R (testthat/devtools), JavaScript (vitest/jest), and GitHub Actions (manual testing).
4. THE Agent_Instructions SHALL include a PR and review workflow describing branch strategy, commit conventions, and review expectations.
5. THE Agent_Instructions SHALL include an architecture overview describing each component's responsibilities and boundaries.
6. THE Agent_Instructions SHALL include interface contracts between components specifying the expected input/output formats at each boundary, so that agents respect boundaries when making changes.

### Requirement 26: Platform — AI Agent Skills for Common Tasks

**User Story:** As a developer, I want a set of generic, tool-agnostic AI agent skill definitions for common development tasks, so that any AI coding assistant can follow structured step-by-step instructions to perform platform development tasks correctly.

#### Acceptance Criteria

1. THE Platform SHALL include AI_Skills as structured markdown files with step-by-step instructions that any AI coding assistant can follow.
2. THE Platform SHALL include an AI_Skills file for "Add Workflow" that provides a guided process for creating a new Workflow YAML with proper meta, steps, and spec structure.
3. THE Platform SHALL include an AI_Skills file for "Add lConfig Hook" that provides a guided process for implementing a new database backend (LoadData/SaveData pair).
4. THE Platform SHALL include an AI_Skills file for "Add Front-end View" that provides a guided process for adding a new view or component to the Vite site.
5. THE Platform SHALL include an AI_Skills file for "Run Pipeline" that provides instructions for triggering and debugging a GitHub Actions pipeline run.
6. THE Platform SHALL include an AI_Skills file for "Create Package Snapshot" that provides a guided process for creating or updating a Package_Snapshot.
7. THE Platform SHALL include an AI_Skills file for "Create Project Snapshot" that provides a guided process for creating a new Project_Snapshot with input data.
8. THE AI_Skills files SHALL use tool-agnostic language and SHALL NOT reference any specific AI coding assistant product.
9. EACH AI_Skills file SHALL include preconditions, step-by-step instructions, expected outputs, and verification criteria.
