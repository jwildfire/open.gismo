# Vendored: `gsm.viz` — `groupOverview`

This directory holds a **verbatim** copy of the `groupOverview` widget source from
the `gsm.viz` JavaScript library, the same widget that renders the site/country
overview table inside a `gsm.kri` report.

| | |
|---|---|
| Upstream repo | `Gilead-BioStats/rbm-viz` (npm package name `gsm.viz`) |
| Version | 2.4.0 |
| Commit | `1f9b123880b0021cd1133bc8e70a078f19fc937a` (2026-06-26) |
| Vendored on | 2026-07-28 |
| License | ISC (Gilead Sciences) |

## Why vendored rather than installed

The integration ladder was walked in order:

1. **npm registry** — `npm view gsm.viz` returns `404 Not Found`. The package is
   not published to the public registry; the upstream README instructs a
   `git+https://…` install instead.
2. **`npm pack` / `file:` install from a local clone** — works locally, but the
   tarball is **13 MB** (448 files: the 1 MB IIFE bundle, its 1.9 MB source map,
   and the full `examples/` data set). Committing that to `open.gismo` for a
   single table is not a trade worth making, and a bare `git+ssh` dependency
   would break `npm ci` in CI, which has no credentials for the upstream org.
3. **Vendor** — this directory: the 49-file `groupOverview` import closure,
   **71 KB of source**, copied byte-for-byte with the upstream directory layout
   preserved so a re-sync is a straight copy.

## What is here

The transitive import closure of `src/groupOverview.js`, rebased `src/…` → this
directory:

- `groupOverview.js` and `groupOverview/**` — the widget
  (`deriveGroupMetrics` → `defineColumns` → `makeTable`)
- `util/**` — the helpers it calls (`coalesce`, `colorScheme`,
  `structureGroupMetadata`, tooltip label formatters, `titleCase`)
- `data/checkInput*` + `data/schema/*.json` — upstream input validation

Deliberately **not** vendored: the Chart.js-based widgets (`barChart`,
`timeSeries`, `scatterPlot`, `sparkline`, `bars`, `facetBars`) and `src/main.js`,
which registers Chart.js at module load. `groupOverview` needs none of it — its
only runtime dependency is `d3` (`select`, `ascending`, `descending`, `group`,
`rollup`, `color`, `format`, and `interpolate` from `d3-interpolate`), declared
in `site/package.json`. Importing `groupOverview.js` directly rather than
`main.js` keeps ~1 MB of chart machinery out of the single-file bundle.

## Local additions

Two files in this directory are **ours**, not upstream:

- `PROVENANCE.md` — this file
- `group-overview.css` — the table styling, adapted from upstream
  `examples/groupOverview.css` onto the open.gismo espresso tokens (upstream
  ships its example CSS outside the bundle, so some stylesheet was always going
  to be needed)

Everything else is unmodified upstream source. **Do not hand-edit it** — the
open.gismo-side adaptation lives in `site/src/kritable.js`, which shapes the
snapshot's reporting layer into the inputs the widget expects.

## Re-syncing

```sh
# from a clone of Gilead-BioStats/rbm-viz at the desired ref
python3 - <<'EOF'
import os, re, shutil
seen, stack = set(), ['src/groupOverview.js']
resolve = lambda p: next((c for c in (p, p + '.js', os.path.join(p, 'index.js'))
                          if os.path.isfile(c)), None)
while stack:
    f = resolve(os.path.normpath(stack.pop()))
    if not f or f in seen: continue
    seen.add(f)
    if f.endswith('.json'): continue
    for m in re.finditer(r"""from\s+['"](\.[^'"]+)['"]""", open(f).read()):
        stack.append(os.path.join(os.path.dirname(f), m.group(1)))
for f in seen:
    out = os.path.join(DEST, os.path.relpath(f, 'src'))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    shutil.copyfile(f, out)
EOF
```

Then run `npm test` in `site/` — `kritable.test.js` exercises the adapter against
the widget and will fail loudly if the upstream input contract moved.
