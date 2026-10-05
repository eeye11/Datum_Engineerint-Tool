# EnggDraw / EnggWrite

An engineering-drawing and statics tool: draw geometry and statics features,
dimension them, annotate them, organise them on sheets, and write the worked
solution alongside the figure.

## Running

```bash
npm install
npm start          # serves the app on http://localhost:3000
```

`index.html` is the entry point. It loads `css/style.css`,
`css/engineering-drawing.css` and the modules in `js/engineering-drawing/`
as plain `<script>` tags, in dependency order.

## Tests

```bash
npm test           # node --test tests/*.test.cjs
```

The suite covers dimensions, annotation models, smart dimensions, sheets,
document save/load round-trips, crash recovery, drawing references,
measurement core, zoom, undo/drag, and the feature/analysis matrix.
`tests/diag-kinds.cjs` is a small diagnostic printer rather than a test file.

## Layout

```
index.html                      application entry point
css/                            stylesheets
js/script.js                    page bootstrap

js/app/                         drawing controller, toolbar, tool registry
js/core/                        shared machinery: geometry, units, scale,
                                  model state, snapping, selection
js/features/                    persistent data models (dimensions,
                                  annotations, analysis)
js/rendering/                   drawing the document to the SVG canvas
js/ui/                          feature panels, editors, popups
js/sheets/                      sheets and their tabs
js/file/                        save, load, export, crash recovery
js/references/                  the written-solution reference system

backend/server.js               express static server + TikZ render endpoint
tests/                          automated tests (node:test)
tools/audit/                    system-wide engineering audits
tools/qa/                       browser-driven verification scripts
tools/dev/                      one-off diagnostics
tools/tikz-probes/              early TikZ integration probes
```

## Where to look first

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — what lives where, and why.
  Read this before hunting for a file.
- **[TOOL-MAP.md](TOOL-MAP.md)** — every toolbar command, and the places
  its code lives.

Sources are grouped by **ownership**, not by the order they were written:
shared machinery is separated from the tools that use it, and the folder
tree mirrors the toolbar a user sees.

## Module map

| Concern | Where |
| --- | --- |
| Tools & toolbar | `app/tools.js`, `app/toolbar.js`, `app/ui.js` |
| Drawing controller | `app/drawing.js` |
| Geometry / statics state | `core/model/drawing-state.js`, `core/geometry/` |
| Drawing & rendering | `rendering/renderer.js` |
| Snapping & selection | `core/snapping/object-snap.js`, `core/selection/` |
| Units & quantities | `core/units/quantities.js` |
| Sheet Universal Length Scale | `core/scale/dimensions.js` |
| Dimensions & annotations | `features/dimensions/`, `features/annotations/` |
| Analysis | `features/analysis/`, `ui/editors/` |
| Sheets | `sheets/sheets.js`, `sheets/sheet-tabs.js` |
| File / save / load / export | `file/` |
| Written solution | `references/` |

## Notes

- There is no build step. The browser loads the sources directly.
- `tools/` scripts are development aids, not part of the app. `tools/audit/`
  holds the engineering audits (`node tools/audit/<name>.cjs`);
  `tools/dev/` holds one-off diagnostics; the browser-driven scripts under
  `tools/qa/` need a Playwright-compatible driver and a static server
  (`node tools/static-server.cjs <repo-root>`).
- Tests locate source modules **by name**, never by path, through
  `tests/helpers/source-path.cjs` — so moving a file does not break them.
- Analysis philosophy: EnggDraw does not compute SFD/BMD/AFD values or infer a
  student's solution — those diagrams are drawn as ordinary geometry. See
  `tests/analysis-rows.test.cjs` for the current state of each analysis row.