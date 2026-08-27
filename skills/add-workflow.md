# Skill: Add a New Workflow YAML

## Preconditions

- A study repo exists with a `workflow/` directory organized by phase (e.g., `1_mappings/`, `2_metrics/`).
- The R function(s) referenced in the workflow steps are available in an installed package.
- You know the workflow Type, ID, and which phase it belongs to.

## Step-by-Step Instructions

1. Determine the phase directory for the workflow (e.g., `workflow/2_metrics/`).

2. Create a new YAML file named after the workflow ID (e.g., `kri0002.yaml`).

3. Add the `meta` section with required fields:
   ```yaml
   meta:
     Type: Metric
     ID: kri0002
     Description: "Description of the workflow"
     Priority: 2
     GroupLevel: Site
   ```

4. (Optional) Add a `spec` section defining required input data domains and columns:
   ```yaml
   spec:
     DomainName:
       ColumnName:
         type: character
         required: true
   ```

5. Add the `steps` section with one or more steps:
   ```yaml
   steps:
     - output: OutputName
       name: package::FunctionName
       params:
         dfInput: DomainName
         lMeta: lMeta
   ```

6. Validate the YAML by loading it:
   ```r
   workr::MakeWorkflowList(strPath = "workflow", strNames = "kri0002")
   ```

7. If the workflow references new input domains, update `config/data-config.yaml` to map those domains to storage paths.

## Expected Outputs

- A new YAML file at `workflow/<phase>/<ID>.yaml`.
- The file is parseable by `workr::MakeWorkflowList()` without errors.
- All referenced input domains are mapped in `data-config.yaml`.

## Verification Criteria

- `workr::MakeWorkflowList()` loads the workflow without errors.
- The `meta$ID` matches the filename (without extension).
- All step function references resolve to installed packages.
- If a `spec` is defined, all listed domains exist in `data-config.yaml`.
