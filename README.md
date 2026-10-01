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
js/engineering-drawing/         canonical application modules (one file per system)
backend/server.js               express static server + TikZ render endpoint
tests/                          automated tests (node:test)
tools/                          development QA and probe scripts (not shipped)
tools/qa/                       browser-driven verification scripts
tools/tikz-probes/              early TikZ integration probes
```

## Module map

| Concern | Module |
| --- | --- |
| Tools & toolbar | `tools.js`, `toolbar.js`, `ui.js` |
| Geometry / statics state | `drawing-state.js`, `feature-geometry.js`, `body-frames.js` |
| Drawing & rendering | `drawing.js`, `renderer.js`, `drawing-delete.js` |
| Snapping & selection | `object-snap.js`, `clipboard.js` |
| Dimensions & annotations | `dimensions.js`, `dimension-model.js`, `dimension-editor.js`, `smart-dimension.js`, `annotation-model.js`, `measurement-core.js` |
| Analysis | `analysis-dependencies.js`, `load-profile.js`, `rotational-arrow.js` |
| Sheets | `sheets.js`, `sheet-tabs.js`, `scale-calibration.js` |
| File / save / load / export | `document-file.js`, `file-save.js`, `document-export.js`, `document-recovery.js` |
| Written solution | `written-references.js`, `drawing-reference.js` |

## Notes

- There is no build step. The browser loads the sources directly.
- `tools/` scripts are development aids. The browser-driven ones under
  `tools/qa/` need a Playwright-compatible driver and a static server
  (`node tools/static-server.cjs <repo-root>`); they are not part of the app.
- Analysis philosophy: EnggDraw does not compute SFD/BMD/AFD values or infer a
  student's solution — those diagrams are drawn as ordinary geometry. See
  `tests/analysis-rows.test.cjs` for the current state of each analysis row.