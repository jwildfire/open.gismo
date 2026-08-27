# Skill: Implement a New lConfig Hook (LoadData/SaveData Pair)

## Preconditions

- The open.gismo R package is set up with `R/`, `tests/testthat/`, and `NAMESPACE`.
- You understand the target storage backend (e.g., S3, local filesystem, database).
- The `workr` package is available (provides `RunWorkflow` which calls the hooks).

## Step-by-Step Instructions

1. Create a factory function file (e.g., `R/my_lConfig.R`) that returns a list with:
   ```r
   my_lConfig <- function(connection_params, ...) {
     list(
       LoadData = my_LoadData,
       SaveData = my_SaveData,
       # ... storage-specific config fields
     )
   }
   ```

2. Create `R/my_LoadData.R` implementing the LoadData interface:
   ```r
   my_LoadData <- function(lWorkflow, lConfig, lData) {
     # Read lWorkflow$spec to determine required domains
     # Fetch each domain from the storage backend
     # Parse into data.frames and add to lData
     # Return lData
   }
   ```

3. Create `R/my_SaveData.R` implementing the SaveData interface:
   ```r
   my_SaveData <- function(lWorkflow, lConfig) {
     # Extract lWorkflow$lResult (output artifacts)
     # Serialize and persist to the storage backend
     # Record execution status
   }
   ```

4. Write tests in `tests/testthat/test-my_lConfig.R`:
   - Test that the factory returns a list with `LoadData` and `SaveData` functions.
   - Test LoadData with mocked storage responses.
   - Test SaveData with mocked storage writes.
   - Test error handling (connection failures, missing data).

5. Add roxygen2 documentation and run `devtools::document()`.

6. Run `devtools::test()` to verify all tests pass.

## Expected Outputs

- Three R files: factory (`my_lConfig.R`), `my_LoadData.R`, `my_SaveData.R`.
- A test file with unit tests covering success and error paths.
- Updated NAMESPACE with exported factory function.

## Verification Criteria

- `devtools::test()` passes with no failures.
- `devtools::check()` produces no errors or warnings.
- The factory function returns a list compatible with `workr::RunWorkflow`.
- LoadData signature: `function(lWorkflow, lConfig, lData)`.
- SaveData signature: `function(lWorkflow, lConfig)`.
- Error handling logs informative messages and does not crash the pipeline.
