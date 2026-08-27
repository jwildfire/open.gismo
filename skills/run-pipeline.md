# Skill: Trigger and Debug a GitHub Actions Pipeline

## Preconditions

- The study repo has `.github/workflows/run-pipeline.yaml` configured.
- A Package Snapshot branch (e.g., `ss-dev`) exists with a valid `manifest.csv`.
- A `config/data-config.yaml` exists mapping input data domains to paths.
- You have write access to the repository and a valid GitHub token.

## Step-by-Step Instructions

1. Navigate to the repository on GitHub → Actions tab.

2. Select the "Run Pipeline" workflow from the left sidebar.

3. Click "Run workflow" and fill in the required inputs:
   - **snapshot_branch**: The `ss-*` branch to use (e.g., `ss-dev`).
   - **snapshot_id**: An existing Project Snapshot ID (e.g., `ps-001`) or `new` to create one.
   - **input_data_version**: A label describing the input data (required if creating a new snapshot).

4. Click "Run workflow" to trigger the pipeline.

5. Monitor the run in the Actions tab. The pipeline will:
   - Install R and packages from the snapshot manifest.
   - Load workflow YAMLs via `workr::MakeWorkflowList()`.
   - Execute workflows via `workr::RunWorkflows()` with GitHub lConfig hooks.
   - Commit output artifacts and status to the data branch.

6. If the run fails, check the logs:
   - Expand the failed step in the Actions log viewer.
   - Look for R error messages in the "Run pipeline" step.
   - Check `status.json` on the data branch for per-step failure details.

7. Common issues and fixes:
   - **Package install failure**: Verify `manifest.csv` has correct URLs and SHAs.
   - **LoadData error**: Check `data-config.yaml` domain mappings and input file paths.
   - **Step function error**: Check the R function exists in the installed package version.

## Expected Outputs

- A completed (or partially completed) pipeline run visible in the Actions tab.
- Output artifacts committed to the data branch under the Project Snapshot directory.
- A `status.json` file recording per-workflow, per-step execution status.
- A `log.json` file with stdout/stderr and timing for each workflow.

## Verification Criteria

- The Actions run completes (green check) or shows which step failed (red X).
- `status.json` on the data branch reflects the correct status for each step.
- Output CSV artifacts exist under `<snapshot_id>/output/<phase>/`.
- The front-end site (if rebuilt) displays the new snapshot and its status.
