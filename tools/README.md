# Developer tools

Nothing here ships with the application.

## `audit/` — engineering audits

System-wide checks of the Statics model run against the real modules in
jsdom (`statics-harness.cjs`): loads, vectors, dependencies, persistence,
selection, degenerate geometry, the renderer's arrows.

```bash
node tools/audit/audit-full-scene.cjs
```

All pass except `audit-loads.cjs` and `audit-vectors.cjs`, which were
already failing on `main` before the restructure (their expectations
predate later changes to load and vector geometry) and need updating by
someone who owns those features.

## `qa/` — browser QA scripts

Scenario scripts written against a Playwright `page`
(`export default async function run(page)`), from feature work on specific
tools. They read the page through the `window.engg*` automation handles
(`src/app/automation-hooks.js`). For whole-application checks, prefer the
golden-master scenario in `tests/e2e/`.

## `refactor/` — analysis and codemods

| Script                  | What it does                                                        |
| ----------------------- | ------------------------------------------------------------------- |
| `import-cycles.mjs`     | Lists import cycles in `src/`. Run it when you add imports.          |
| `strict-audit.mjs`      | Finds code whose meaning changes in a strict ES module.              |
| `analyze-controller.mjs`| Maps a file's top-level declarations, references and mutable state.  |
| `smoke.mjs`             | Loads the page in Chrome, draws a line, reports any error.           |
| `to-esm.mjs`            | The codemod that turned the classic scripts into ES modules.         |
| `split-controller.mjs`  | The codemod that split the 39,000-line controller into `src/editor/`.|
| `move-to-src.sh`        | The renames that created `src/`.                                     |

The last three were run once, during the restructure, and are kept as the
record of exactly how it was done.
