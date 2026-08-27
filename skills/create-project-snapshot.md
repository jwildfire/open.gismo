# Skill: Create a New Project Snapshot

## Preconditions

- The study repo has at least one Package Snapshot branch (e.g., `ss-dev`).
- Input data files (CSVs) are prepared and ready to upload.
- The `.github/workflows/create-snapshot.yaml` workflow is configured.
- A `config/data-config.yaml` maps data domains to storage paths.

## Step-by-Step Instructions

1. Prepare input data files matching the domains in `data-config.yaml`.
   Each domain should have a corresponding CSV file (e.g., `Raw_AE.csv`).

2. Trigger the "Create Snapshot" workflow:
   - Go to Actions → "Create Snapshot" → "Run workflow".
   - Provide inputs:
     - **data_branch**: Branch for storing snapshots (e.g., `data`).
     - **input_data_version**: A label (e.g., "2025-Q1 data cut").
     - **package_snapshot**: The `ss-*` branch to reference (e.g., `ss-dev`).

3. The workflow will:
   - Call `create_project_snapshot()` to allocate the next `ps-NNN` ID.
   - Create `metadata.json` with snapshot_id, timestamp, input_data_version, and package_snapshot.
   - Upload input data files to `<snapshot_id>/input/`.
   - Update `snapshots.json` index on the data branch.

4. After creation, run a pipeline against the new snapshot:
   - Trigger the "Run Pipeline" workflow with the new snapshot ID.
   - Output artifacts will be stored under `<snapshot_id>/output/`.

5. Verify the snapshot on the data branch:
   - `snapshots.json` includes the new snapshot entry.
   - `<snapshot_id>/metadata.json` has correct fields.
   - `<snapshot_id>/input/` contains the uploaded data files.

## Expected Outputs

- A new `ps-NNN` directory on the data branch.
- `metadata.json` with snapshot_id, created_at, input_data_version, package_snapshot.
- Input data files stored under `<snapshot_id>/input/`.
- Updated `snapshots.json` with the new snapshot entry.

## Verification Criteria

- `snapshots.json` lists the new snapshot with a unique, sequential ID.
- `metadata.json` contains all required fields with valid values.
- Input CSV files are accessible at `<snapshot_id>/input/<domain>.csv`.
- The snapshot ID follows the `ps-NNN` pattern (e.g., `ps-001`, `ps-002`).
- Running a pipeline against the snapshot produces `status.json` and output artifacts.
