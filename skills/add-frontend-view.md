# Skill: Add a New Front-end View

## Preconditions

- The `site/` directory contains the Vite SPA with `src/`, `tests/`, and `package.json`.
- Node.js and npm are installed; `npm install` has been run in `site/`.
- You understand which data the new view will display and where it comes from.

## Step-by-Step Instructions

1. Create a new module file in `site/src/` (e.g., `src/myview.js`):
   ```javascript
   export function buildMyView(data) {
     const container = document.createElement("div");
     container.className = "my-view";
     // Render data into DOM elements
     return container;
   }
   ```

2. If the view needs new data, add a fetch function to `src/data.js`:
   ```javascript
   export async function loadMyData(branch) {
     const res = await fetch(`data/${branch}/mydata.json`);
     if (!res.ok) throw new Error("Failed to load my data");
     return res.json();
   }
   ```

3. Import and integrate the view in `src/main.js`:
   ```javascript
   import { buildMyView } from "./myview.js";
   // Call buildMyView() at the appropriate point in the render flow
   ```

4. Add CSS styles to `style.css` for the new view's classes.

5. Write tests in `site/tests/myview.test.js`:
   - Test that `buildMyView` returns a DOM element with expected structure.
   - Test rendering with empty data, typical data, and edge cases.
   - Add fast-check property tests for data-driven rendering.

6. Run tests: `npx vitest --run` from `site/`.

7. Build the site: `npm run build` from `site/`.

## Expected Outputs

- A new JS module in `site/src/` with exported build/render functions.
- Updated `main.js` importing and using the new module.
- A test file in `site/tests/` with unit and property-based tests.
- CSS styles for the new view.

## Verification Criteria

- `npx vitest --run` passes with no failures.
- `npm run build` succeeds without errors.
- The new view renders correctly in a browser with sample data.
- All exported functions are tested with at least one unit test.
- DOM elements use semantic HTML and descriptive class names.
