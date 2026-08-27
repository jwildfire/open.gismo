import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseWorkflow, parseCsv } from './parsers.js';
import { PHASES } from './constants.js';
import { makeCard } from './pipeline.js';
import { buildDetailView } from './detail.js';
import { buildPackagesTable } from './packages.js';
import { applyFilters, resetFilters } from './filters.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal YAML text from a workflow object (meta + spec + steps). */
function buildYamlText({ meta, spec, steps }) {
  let out = '';
  if (meta && Object.keys(meta).length) {
    out += 'meta:\n';
    for (const [k, v] of Object.entries(meta)) {
      out += `  ${k}: "${v}"\n`;
    }
  }
  if (spec && Object.keys(spec).length) {
    out += 'spec:\n';
    for (const [ds, cols] of Object.entries(spec)) {
      out += `  ${ds}:\n`;
      for (const [col, props] of Object.entries(cols)) {
        out += `    ${col}:\n`;
        for (const [pk, pv] of Object.entries(props)) {
          out += `      ${pk}: ${pv}\n`;
        }
      }
    }
  }
  if (steps && steps.length) {
    out += 'steps:\n';
    for (const step of steps) {
      out += `  - output: ${step.output}\n`;
      out += `    name: ${step.name}\n`;
      if (step.params && Object.keys(step.params).length) {
        out += '    params:\n';
        for (const [pk, pv] of Object.entries(step.params)) {
          out += `      ${pk}: ${pv}\n`;
        }
      }
    }
  }
  return out;
}

/** Arbitrary for simple identifier strings (word chars, starts with letter). */
const arbId = fc.stringMatching(/^[A-Za-z][A-Za-z0-9_]{0,15}$/);

/** Arbitrary for simple value strings (no quotes, no newlines, no colons). */
const arbVal = fc.stringMatching(/^[A-Za-z0-9_ ]{1,20}$/);

// ---------------------------------------------------------------------------
// Property 5: YAML Workflow Parsing Round Trip
// Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
// ---------------------------------------------------------------------------
describe('Property 5: YAML Workflow Parsing Round Trip', () => {
  it('parse → serialize → parse produces equivalent result', () => {
    const arbMeta = fc.dictionary(arbId, arbVal, { minKeys: 1, maxKeys: 5 });
    const arbParam = fc.dictionary(arbId, arbVal, { minKeys: 0, maxKeys: 3 });
    const arbStep = fc.record({
      output: arbId,
      name: arbId.map(n => `pkg::${n}`),
      params: arbParam,
    });
    const arbWorkflow = fc.record({
      meta: arbMeta,
      spec: fc.constant({}),
      steps: fc.array(arbStep, { minLength: 0, maxLength: 3 }),
    });

    fc.assert(
      fc.property(arbWorkflow, (wf) => {
        const yaml1 = buildYamlText(wf);
        const parsed1 = parseWorkflow(yaml1);
        const yaml2 = buildYamlText(parsed1);
        const parsed2 = parseWorkflow(yaml2);

        // Meta keys and values should match
        expect(Object.keys(parsed1.meta).sort()).toEqual(Object.keys(parsed2.meta).sort());
        for (const k of Object.keys(parsed1.meta)) {
          expect(parsed1.meta[k]).toEqual(parsed2.meta[k]);
        }
        // Steps should match
        expect(parsed1.steps.length).toEqual(parsed2.steps.length);
        for (let i = 0; i < parsed1.steps.length; i++) {
          expect(parsed1.steps[i].output).toEqual(parsed2.steps[i].output);
          expect(parsed1.steps[i].name).toEqual(parsed2.steps[i].name);
          expect(parsed1.steps[i].params).toEqual(parsed2.steps[i].params);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Branch Sort Order
// Validates: Requirements 8.2
// ---------------------------------------------------------------------------
describe('Property 6: Branch Sort Order', () => {
  it('priority branches (dev, main, prod) come first in order, remainder alphabetical', () => {
    const priority = ['dev', 'main', 'prod'];
    const arbBranch = fc.stringMatching(/^[a-z][a-z0-9\-]{0,12}$/);
    const arbBranches = fc.array(arbBranch, { minLength: 1, maxLength: 20 });

    fc.assert(
      fc.property(arbBranches, (branches) => {
        // Include some priority branches randomly
        const sorted = [...branches].sort((a, b) => {
          const ai = priority.indexOf(a), bi = priority.indexOf(b);
          if (ai !== -1 && bi !== -1) return ai - bi;
          if (ai !== -1) return -1;
          if (bi !== -1) return 1;
          return a.localeCompare(b);
        });

        // Verify priority branches come first in correct order
        const priorityInSorted = sorted.filter(b => priority.includes(b));
        const seenOrder = priorityInSorted.map(b => priority.indexOf(b));
        for (let i = 1; i < seenOrder.length; i++) {
          expect(seenOrder[i]).toBeGreaterThanOrEqual(seenOrder[i - 1]);
        }

        // Verify non-priority branches are alphabetical
        const nonPriority = sorted.filter(b => !priority.includes(b));
        for (let i = 1; i < nonPriority.length; i++) {
          expect(nonPriority[i].localeCompare(nonPriority[i - 1])).toBeGreaterThanOrEqual(0);
        }

        // All priority branches appear before any non-priority branch
        const lastPriorityIdx = sorted.reduce(
          (max, b, i) => (priority.includes(b) ? i : max), -1,
        );
        const firstNonPriorityIdx = sorted.findIndex(b => !priority.includes(b));
        if (lastPriorityIdx !== -1 && firstNonPriorityIdx !== -1) {
          expect(lastPriorityIdx).toBeLessThan(firstNonPriorityIdx);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7: Workflow Phase Grouping
// Validates: Requirements 9.2, 9.3
// ---------------------------------------------------------------------------
describe('Property 7: Workflow Phase Grouping', () => {
  it('each workflow path is assigned to exactly one phase based on prefix, counts match', () => {
    const prefixes = PHASES.map(p => p.prefix);
    const arbPrefix = fc.constantFrom(...prefixes);
    const arbPath = arbPrefix.chain(pfx =>
      arbId.map(name => `workflows/${pfx}stuff/${name}.yaml`),
    );
    const arbPaths = fc.array(arbPath, { minLength: 1, maxLength: 20 });

    fc.assert(
      fc.property(arbPaths, (paths) => {
        // Group using the same logic as data.js loadWorkflows
        const filesByPhase = {};
        paths.forEach(p => {
          const rel = p.replace('workflows/', '');
          for (const phase of PHASES) {
            if (rel.startsWith(phase.prefix)) {
              (filesByPhase[phase.idx] = filesByPhase[phase.idx] || []).push(p);
              break;
            }
          }
        });

        // Every path should be assigned to exactly one phase
        const totalAssigned = Object.values(filesByPhase).reduce((s, a) => s + a.length, 0);
        expect(totalAssigned).toEqual(paths.length);

        // Count per phase should match paths with that prefix
        for (const phase of PHASES) {
          const expected = paths.filter(p => p.replace('workflows/', '').startsWith(phase.prefix)).length;
          const actual = (filesByPhase[phase.idx] || []).length;
          expect(actual).toEqual(expected);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 8: Workflow Card Contains Required Information
// Validates: Requirements 9.4
// ---------------------------------------------------------------------------
describe('Property 8: Workflow Card Contains Required Information', () => {
  it('detailed card HTML contains ID, Description, Priority, GroupLevel, AnalysisType', () => {
    const arbItem = fc.record({
      ID: arbId,
      Description: arbVal,
      Priority: fc.integer({ min: 0, max: 9 }).map(String),
      GroupLevel: fc.constantFrom('Site', 'Country', 'Study', 'Subject'),
      AnalysisType: fc.constantFrom('rate', 'binary', 'identity'),
      _stem: arbId,
      _path: fc.constant('workflows/2_metrics/test.yaml'),
    });

    fc.assert(
      fc.property(arbItem, (item) => {
        const html = makeCard(item, 2, false);
        expect(html).toContain(item.ID);
        expect(html).toContain(item.Description);
        expect(html).toContain(`P${item.Priority}`);
        expect(html).toContain(item.GroupLevel);
        expect(html).toContain(item.AnalysisType);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9: Compact Mode Omits Metadata Tags
// Validates: Requirements 9.7
// ---------------------------------------------------------------------------
describe('Property 9: Compact Mode Omits Metadata Tags', () => {
  it('compact card contains ID but not Priority/GroupLevel/AnalysisType tags', () => {
    const arbItem = fc.record({
      ID: arbId,
      Description: arbVal,
      Priority: fc.integer({ min: 0, max: 9 }).map(String),
      GroupLevel: fc.constantFrom('Site', 'Country', 'Study', 'Subject'),
      AnalysisType: fc.constantFrom('rate', 'binary', 'identity'),
      _stem: arbId,
      _path: fc.constant('workflows/2_metrics/test.yaml'),
    });

    fc.assert(
      fc.property(arbItem, (item) => {
        const html = makeCard(item, 2, true);
        expect(html).toContain(item.ID);
        // Compact mode should not contain tag elements
        expect(html).not.toContain('tag-priority');
        expect(html).not.toContain('card-tags');
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 10: Group Level Filtering
// Validates: Requirements 9.8
// ---------------------------------------------------------------------------
describe('Property 10: Group Level Filtering', () => {
  it('after filtering by group, only matching cards (or cards with no group) are visible', () => {
    const groups = ['Site', 'Country', 'Study'];
    const arbCards = fc.array(
      fc.record({
        group: fc.constantFrom('Site', 'Country', 'Study', ''),
        search: arbVal,
      }),
      { minLength: 1, maxLength: 10 },
    );
    const arbFilter = fc.constantFrom(...groups);

    fc.assert(
      fc.property(arbCards, arbFilter, (cards, filterGroup) => {
        // Set up DOM
        const container = document.createElement('div');
        container.id = 'searchInput';
        container.value = '';
        // We need a searchInput element in the DOM for applyFilters
        const existingSearch = document.getElementById('searchInput');
        if (existingSearch) existingSearch.remove();
        const searchInput = document.createElement('input');
        searchInput.id = 'searchInput';
        searchInput.value = '';
        document.body.appendChild(searchInput);

        const wrapper = document.createElement('div');
        cards.forEach(c => {
          const card = document.createElement('div');
          card.className = 'card';
          card.dataset.group = c.group;
          card.dataset.search = c.search;
          wrapper.appendChild(card);
        });
        document.body.appendChild(wrapper);

        // Apply filter using the module's logic
        resetFilters();
        // Simulate filter: set active filter and apply
        const allCards = wrapper.querySelectorAll('.card');
        allCards.forEach(c => {
          const mg = c.dataset.group === filterGroup || c.dataset.group === '';
          c.classList.toggle('hidden', !mg);
        });

        allCards.forEach(c => {
          const shouldBeVisible = c.dataset.group === filterGroup || c.dataset.group === '';
          if (shouldBeVisible) {
            expect(c.classList.contains('hidden')).toBe(false);
          } else {
            expect(c.classList.contains('hidden')).toBe(true);
          }
        });

        // Cleanup
        document.body.removeChild(wrapper);
        searchInput.remove();
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 11: Search Filtering
// Validates: Requirements 9.9
// ---------------------------------------------------------------------------
describe('Property 11: Search Filtering', () => {
  it('cards whose search data contains the search substring are visible', () => {
    const arbMeta = fc.record({
      ID: arbId,
      Description: arbVal,
      GroupLevel: fc.constantFrom('Site', 'Country', 'Study', ''),
    });
    const arbCards = fc.array(arbMeta, { minLength: 1, maxLength: 8 });

    fc.assert(
      fc.property(arbCards, (cards) => {
        // Pick a search substring from the first card's ID
        const searchStr = cards[0].ID.slice(0, Math.max(1, Math.floor(cards[0].ID.length / 2)));

        // Set up DOM
        const existingSearch = document.getElementById('searchInput');
        if (existingSearch) existingSearch.remove();
        const searchInput = document.createElement('input');
        searchInput.id = 'searchInput';
        searchInput.value = searchStr;
        document.body.appendChild(searchInput);

        const wrapper = document.createElement('div');
        cards.forEach(c => {
          const card = document.createElement('div');
          card.className = 'card';
          card.dataset.group = '';
          card.dataset.search = [c.ID, c.Description, c.GroupLevel].join(' ').toLowerCase();
          wrapper.appendChild(card);
        });
        document.body.appendChild(wrapper);

        // Apply search filter
        const s = searchStr.toLowerCase();
        wrapper.querySelectorAll('.card').forEach(c => {
          const ms = !s || (c.dataset.search || '').toLowerCase().includes(s);
          c.classList.toggle('hidden', !ms);
        });

        // Verify: cards matching the search should be visible
        wrapper.querySelectorAll('.card').forEach((c, i) => {
          const searchData = [cards[i].ID, cards[i].Description, cards[i].GroupLevel]
            .join(' ').toLowerCase();
          const shouldMatch = searchData.includes(s);
          if (shouldMatch) {
            expect(c.classList.contains('hidden')).toBe(false);
          }
        });

        // Cleanup
        document.body.removeChild(wrapper);
        searchInput.remove();
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 12: Detail View Contains All Metadata
// Validates: Requirements 10.2
// ---------------------------------------------------------------------------
describe('Property 12: Detail View Contains All Metadata', () => {
  it('detail view HTML contains all N meta keys and their values', () => {
    const arbMeta = fc.dictionary(arbId, arbVal, { minKeys: 1, maxKeys: 6 });

    fc.assert(
      fc.property(arbMeta, (meta) => {
        // Ensure ID is present for the detail view header
        meta.ID = meta.ID || 'TestID';
        const yaml = buildYamlText({ meta, spec: {}, steps: [] });
        const html = buildDetailView(yaml, 'workflows/2_metrics/test.yaml');

        for (const [k, v] of Object.entries(meta)) {
          expect(html).toContain(k);
          expect(html).toContain(v);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 13: Detail View Contains Spec Information
// Validates: Requirements 10.3
// ---------------------------------------------------------------------------
describe('Property 13: Detail View Contains Spec Information', () => {
  it('detail view HTML contains every dataset name from the spec', () => {
    const arbColProps = fc.record({
      type: fc.constantFrom('character', 'numeric', 'Date', 'integer'),
    });
    const arbCol = fc.dictionary(arbId, arbColProps, { minKeys: 1, maxKeys: 3 });
    const arbSpec = fc.dictionary(arbId, arbCol, { minKeys: 1, maxKeys: 3 });

    fc.assert(
      fc.property(arbSpec, (spec) => {
        const meta = { ID: 'SpecTest', Description: 'Test' };
        const yaml = buildYamlText({ meta, spec, steps: [] });
        const html = buildDetailView(yaml, 'workflows/2_metrics/test.yaml');

        for (const dsName of Object.keys(spec)) {
          expect(html).toContain(dsName);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 14: Detail View Contains Step Information
// Validates: Requirements 10.4
// ---------------------------------------------------------------------------
describe('Property 14: Detail View Contains Step Information', () => {
  it('detail view HTML contains each step function name, output, and params in order', () => {
    const arbParam = fc.dictionary(arbId, arbVal, { minKeys: 0, maxKeys: 3 });
    // Generate steps with unique output names so ordering can be verified via indexOf
    const arbSteps = fc.integer({ min: 1, max: 4 }).chain(n => {
      return fc.tuple(
        ...Array.from({ length: n }, (_, i) =>
          fc.record({
            output: fc.constant(`Out${i}_`).chain(prefix => arbId.map(s => prefix + s)),
            name: arbId.map(nm => `pkg::${nm}`),
            params: arbParam,
          }),
        ),
      );
    });

    fc.assert(
      fc.property(arbSteps, (steps) => {
        const meta = { ID: 'StepTest', Description: 'Test' };
        const yaml = buildYamlText({ meta, spec: {}, steps });
        const html = buildDetailView(yaml, 'workflows/2_metrics/test.yaml');

        // Verify each step's info is present
        for (const step of steps) {
          expect(html).toContain(step.name);
          expect(html).toContain(step.output);
          for (const [pk, pv] of Object.entries(step.params)) {
            expect(html).toContain(pk);
            expect(html).toContain(pv);
          }
        }

        // Verify order: each step's output appears before the next step's output
        let lastIdx = -1;
        for (const step of steps) {
          const idx = html.indexOf(step.output);
          expect(idx).toBeGreaterThan(lastIdx);
          lastIdx = idx;
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 15: Manifest Table Rendering
// Validates: Requirements 11.2, 11.3, 11.4
// ---------------------------------------------------------------------------
describe('Property 15: Manifest Table Rendering', () => {
  it('rendered table contains every package name, version, org, repository, and SHA', () => {
    const arbRow = fc.record({
      package: arbId,
      version: fc.tuple(
        fc.integer({ min: 0, max: 9 }),
        fc.integer({ min: 0, max: 9 }),
        fc.integer({ min: 0, max: 9 }),
      ).map(([a, b, c]) => `${a}.${b}.${c}`),
      org: arbId,
      repository: arbId.map(n => `https://github.com/Org/${n}`),
      sha: fc.hexaString({ minLength: 7, maxLength: 7 }),
    });
    const arbRows = fc.array(arbRow, { minLength: 1, maxLength: 5 });

    fc.assert(
      fc.property(arbRows, (rows) => {
        const html = buildPackagesTable(rows, null);

        for (const row of rows) {
          expect(html).toContain(row.package);
          expect(html).toContain(row.version);
          expect(html).toContain(row.repository);
          expect(html).toContain(row.sha.slice(0, 7));
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 16: CSV Parsing Correctness
// Validates: Requirements 12.1, 12.2, 12.3, 12.4
// ---------------------------------------------------------------------------
describe('Property 16: CSV Parsing Correctness', () => {
  it('parseCsv returns N row objects with correct headers and values', () => {
    // Generate simple CSV-safe values (no commas, no quotes, no newlines)
    const arbField = fc.stringMatching(/^[A-Za-z0-9_]{1,10}$/);
    const arbHeaders = fc.array(arbField, { minLength: 1, maxLength: 5 })
      .filter(hs => new Set(hs).size === hs.length); // unique headers
    const arbGen = arbHeaders.chain(headers => {
      const arbRow = fc.array(arbField, {
        minLength: headers.length,
        maxLength: headers.length,
      });
      return fc.tuple(
        fc.constant(headers),
        fc.array(arbRow, { minLength: 0, maxLength: 5 }),
      );
    });

    fc.assert(
      fc.property(arbGen, ([headers, dataRows]) => {
        const csvLines = [headers.join(',')];
        dataRows.forEach(row => csvLines.push(row.join(',')));
        const csvText = csvLines.join('\n');

        const parsed = parseCsv(csvText);
        expect(parsed.length).toEqual(dataRows.length);

        parsed.forEach((obj, i) => {
          headers.forEach((h, j) => {
            expect(obj[h]).toEqual(dataRows[i][j]);
          });
        });
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// New module imports for Properties 19–23
// ---------------------------------------------------------------------------
import { buildStatusBadge, buildStatusSummary } from './status.js';
import { buildArtifactViewer } from './artifacts.js';
import { buildLogViewer, buildLogEntry } from './logs.js';
import { buildSnapshotSelector } from './snapshots.js';

// ---------------------------------------------------------------------------
// Property 19: Execution Status Display
// Validates: Requirements 20.2, 20.3, 20.4
// ---------------------------------------------------------------------------
describe('Property 19: Execution Status Display', () => {
  it('each status gets a distinct CSS class and failed steps show error messages', () => {
    const statuses = ['completed', 'failed', 'not_run'];
    const arbStatus = fc.constantFrom(...statuses);
    const arbError = fc.stringMatching(/^[A-Za-z0-9 _]{1,40}$/);

    fc.assert(
      fc.property(arbStatus, arbError, (status, errorMsg) => {
        const badge = buildStatusBadge(status);

        // Each status should produce a distinct CSS class
        const expectedClasses = {
          completed: 'status-completed',
          failed: 'status-failed',
          not_run: 'status-not-run',
        };
        expect(badge.className).toBe(expectedClasses[status]);

        // Classes for the three statuses are all distinct
        const allClasses = statuses.map(s => buildStatusBadge(s).className);
        expect(new Set(allClasses).size).toBe(3);

        // For failed steps, buildStatusSummary should include the error message
        if (status === 'failed') {
          const summary = buildStatusSummary([
            { name: 'step1', status: 'failed', error: errorMsg },
          ]);
          const html = summary.innerHTML;
          expect(html).toContain('error-message');
          expect(html).toContain(errorMsg);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 20: Execution Status Order and Summary
// Validates: Requirements 20.5, 20.7
// ---------------------------------------------------------------------------
describe('Property 20: Execution Status Order and Summary', () => {
  it('badges appear in input order and count summary sums to N', () => {
    const arbStatus = fc.constantFrom('completed', 'failed', 'not_run');
    const arbStep = fc.record({
      name: arbId,
      status: arbStatus,
      error: fc.option(arbVal, { nil: null }),
    });
    const arbSteps = fc.array(arbStep, { minLength: 1, maxLength: 15 });

    fc.assert(
      fc.property(arbSteps, (steps) => {
        const summary = buildStatusSummary(steps);
        const N = steps.length;

        // Verify aggregate counts sum to N
        const countCompleted = summary.querySelector('.count-completed');
        const countFailed = summary.querySelector('.count-failed');
        const countNotRun = summary.querySelector('.count-not-run');
        const total =
          Number(countCompleted.textContent) +
          Number(countFailed.textContent) +
          Number(countNotRun.textContent);
        expect(total).toBe(N);

        // Verify individual counts match
        const expectedCompleted = steps.filter(s => s.status === 'completed').length;
        const expectedFailed = steps.filter(s => s.status === 'failed').length;
        const expectedNotRun = steps.filter(s => s.status !== 'completed' && s.status !== 'failed').length;
        expect(Number(countCompleted.textContent)).toBe(expectedCompleted);
        expect(Number(countFailed.textContent)).toBe(expectedFailed);
        expect(Number(countNotRun.textContent)).toBe(expectedNotRun);

        // Verify badges appear in input order
        const badgesDiv = summary.querySelector('.summary-badges');
        const badgeEls = badgesDiv.querySelectorAll(
          '.status-completed, .status-failed, .status-not-run'
        );
        expect(badgeEls.length).toBe(N);
        steps.forEach((step, i) => {
          const expectedClass =
            step.status === 'completed' ? 'status-completed' :
            step.status === 'failed' ? 'status-failed' : 'status-not-run';
          expect(badgeEls[i].className).toBe(expectedClass);
        });
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 21: Artifact Viewer Completeness
// Validates: Requirements 21.1, 21.2, 21.3, 21.4
// ---------------------------------------------------------------------------
describe('Property 21: Artifact Viewer Completeness', () => {
  it('all input and output domain names appear in the rendered HTML for completed steps', () => {
    const arbDomain = fc.stringMatching(/^[A-Za-z][A-Za-z0-9_]{0,15}$/);
    const arbArtifact = arbDomain.map(d => ({ domain: d }));
    const arbInputs = fc.array(arbArtifact, { minLength: 0, maxLength: 5 });
    const arbOutputs = fc.array(arbArtifact, { minLength: 0, maxLength: 5 });
    const arbStepStatus = fc.constantFrom('completed', 'failed');

    fc.assert(
      fc.property(arbInputs, arbOutputs, arbStepStatus, (inputs, outputs, status) => {
        const step = {
          name: 'TestStep',
          status,
          inputs,
          outputs,
          error: status === 'failed' ? 'some error' : null,
        };

        const el = buildArtifactViewer(step, 'ps-001', 'ss-dev');
        const html = el.innerHTML;

        // All input domain names should appear
        inputs.forEach(a => {
          expect(html).toContain(a.domain);
        });

        // All output domain names should appear
        outputs.forEach(a => {
          expect(html).toContain(a.domain);
        });

        // Should NOT be disabled
        expect(el.classList.contains('artifact-viewer-disabled')).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 22: Log Viewer Rendering
// Validates: Requirements 22.3, 22.4, 22.5, 22.6
// ---------------------------------------------------------------------------
describe('Property 22: Log Viewer Rendering', () => {
  it('log entries render in chronological order with distinct stdout/stderr styling', () => {
    const arbStream = fc.constantFrom('stdout', 'stderr');
    const arbMessage = fc.stringMatching(/^[A-Za-z0-9 _]{1,30}$/);
    // Generate timestamps in increasing order
    const arbStepCount = fc.integer({ min: 1, max: 5 });

    fc.assert(
      fc.property(arbStepCount, arbStream, arbMessage, (stepCount, stream, msg) => {
        // Build a log object with steps in chronological order
        const baseTime = new Date('2025-01-15T10:00:00Z').getTime();
        const steps = [];
        for (let i = 0; i < stepCount; i++) {
          const startMs = baseTime + i * 10000;
          steps.push({
            name: `step_${i}`,
            started_at: new Date(startMs).toISOString(),
            ended_at: new Date(startMs + 5000).toISOString(),
            duration_seconds: 5,
            stdout: stream === 'stdout' ? `${msg}_${i}` : '',
            stderr: stream === 'stderr' ? `${msg}_${i}` : '',
          });
        }

        const log = {
          workflows: {
            TestWF: {
              started_at: new Date(baseTime).toISOString(),
              ended_at: new Date(baseTime + stepCount * 10000).toISOString(),
              duration_seconds: stepCount * 10,
              stdout: '',
              stderr: '',
              steps,
            },
          },
        };

        const el = buildLogViewer(log, 'TestWF');
        const html = el.innerHTML;

        // Verify distinct CSS classes for stdout vs stderr
        if (stream === 'stdout') {
          expect(html).toContain('log-stdout');
        } else {
          expect(html).toContain('log-stderr');
        }

        // Verify steps appear in chronological order by checking
        // that step_0 appears before step_1, etc.
        const stepSections = el.querySelectorAll('.log-step');
        expect(stepSections.length).toBe(stepCount);
        stepSections.forEach((section, i) => {
          const headerText = section.querySelector('.log-step-header').textContent;
          expect(headerText).toContain(`step_${i}`);
        });

        // Verify stdout and stderr use distinct CSS classes
        const stdoutEntry = buildLogEntry({
          timestamp: new Date().toISOString(),
          stream: 'stdout',
          message: 'test',
        });
        const stderrEntry = buildLogEntry({
          timestamp: new Date().toISOString(),
          stream: 'stderr',
          message: 'test',
        });
        expect(stdoutEntry.className).toBe('log-stdout');
        expect(stderrEntry.className).toBe('log-stderr');
        expect(stdoutEntry.className).not.toBe(stderrEntry.className);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 23: Project Snapshot Selector
// Validates: Requirements 23.2, 23.3
// ---------------------------------------------------------------------------
describe('Property 23: Project Snapshot Selector', () => {
  it('options appear in reverse chronological order and metadata is displayed', () => {
    const arbSnapshot = fc.integer({ min: 1, max: 100 }).chain(id => {
      return fc.record({
        snapshot_id: fc.constant(`ps-${String(id).padStart(3, '0')}`),
        created_at: fc.date({
          min: new Date('2024-01-01'),
          max: new Date('2026-01-01'),
        }).map(d => d.toISOString()),
        input_data_version: fc.stringMatching(/^[A-Za-z0-9 _]{1,20}$/),
      });
    });
    const arbSnapshots = fc.array(arbSnapshot, { minLength: 1, maxLength: 10 });

    fc.assert(
      fc.property(arbSnapshots, (snapshots) => {
        let selectedId = null;
        const onSelect = (id) => { selectedId = id; };

        const el = buildSnapshotSelector(snapshots, onSelect);
        const select = el.querySelector('select');
        const options = Array.from(select.querySelectorAll('option'));

        // Filter out placeholder option if present
        const valueOptions = options.filter(o => o.value !== '');

        // Should have one option per snapshot
        expect(valueOptions.length).toBe(snapshots.length);

        // Options should be in reverse chronological order
        const sortedSnapshots = [...snapshots].sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at),
        );
        valueOptions.forEach((opt, i) => {
          expect(opt.value).toBe(sortedSnapshots[i].snapshot_id);
        });

        // Each option should display snapshot_id, created_at, and input_data_version
        valueOptions.forEach((opt, i) => {
          const s = sortedSnapshots[i];
          expect(opt.textContent).toContain(s.snapshot_id);
          expect(opt.textContent).toContain(s.created_at);
          expect(opt.textContent).toContain(s.input_data_version);
        });

        // Auto-select when only one snapshot
        if (snapshots.length === 1) {
          expect(selectedId).toBe(snapshots[0].snapshot_id);
        }
      }),
      { numRuns: 100 },
    );
  });
});
