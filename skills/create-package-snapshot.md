# Skill: Create or Update a Package Snapshot

## Preconditions

- The study repo has a `config/packages.yaml` listing R package references.
- The `.github/workflows/init-snapshot.yaml` workflow is configured.
- You have write access to the repository.
- Package references use the format `org/repo`, `org/repo@tag`, or `org/repo@branch`.

## Step-by-Step Instructions

1. Review or update `config/packages.yaml` with the desired package list:
   ```yaml
   packages:
     - Gilead-BioStats/gsm.core@v2.2.0
     - Gilead-BioStats/gsm.mapping
     - Gilead-BioStats/workr@main
   ```

2. To create a new snapshot branch, trigger the "Init Snapshot" workflow:
   - Go to Actions → "Init Snapshot" → "Run workflow".
   - Provide the branch name (e.g., `ss-dev`) and optionally a date for version pinning.

3. The workflow will:
   - Call `workr::pkgSnapshot()` with the package list.
   - Generate `manifest.csv` (org, package, version, repository, url, sha).
   - Generate `rproject.toml` for the rv package manager.
   - Pull workflow YAMLs from each package's `inst/workflow/` directory.
   - Commit all artifacts to the specified `ss-*` branch.

4. To update an existing snapshot, re-run the workflow on the same branch name.
   The branch will be updated with the latest resolved package versions.

5. Verify the snapshot by checking the `ss-*` branch contents:
   - `manifest.csv` lists all packages with correct versions.
   - `workflows/` contains YAML files from all packages.
   - `rproject.toml` is present and valid.

## Expected Outputs

- An orphan `ss-*` branch containing `manifest.csv`, `rproject.toml`, and `workflows/`.
- Each package resolved to a specific version, SHA, and download URL.
- Workflow YAMLs collected from all packages' `inst/workflow/` directories.

## Verification Criteria

- The `ss-*` branch exists and contains `manifest.csv`.
- `manifest.csv` has one row per package with non-empty version and sha columns.
- `rproject.toml` is present and parseable.
- `workflows/` directory contains YAML files organized by phase.
- Running `workr::MakeWorkflowList()` against the workflows succeeds.
