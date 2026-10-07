# Datum — Programmer's Code Map

Where things live, and which file owns which behaviour. Start here when you
need to change something and don't yet know which module is responsible.

The layout is one sentence: **`core` is the model, `features` is the
engineering, `editor` is the interaction, `rendering`/`ui` is the presentation,
`styles` is the look.**

```
src/
  core/        the document model and the maths        (no UI, no DOM)
  features/    one folder per engineering domain       (analysis, dimensions, annotations)
  editor/      the tool/interaction layer              (clicks, drags, panels, tools)
  rendering/   the canvas renderer
  ui/          dialogs and the shared property panel
  styles/      CSS
  app/ file/   wiring, save/load, documents
  references/ solution/ sheets/ api/ assets/
```

---

## 1. Where do I look for…?

| I want to change… | Go to |
|---|---|
| How a feature is stored (geometry fields) | `src/core/model/drawing-state.js` |
| What a tool is called in the panel | `src/editor/feature-panel-markup.js` (`displayLabel` map) |
| The Features tab structure/content | `src/editor/feature-panel-markup.js` + `src/editor/statics-panel.js` |
| The shared panel row/section primitives | `src/ui/feature-panel/property-panel.js` |
| What a click on the canvas does | `src/editor/canvas-click.js` (routed from `canvas-events.js`) |
| Pointer down/move/up wiring | `src/editor/canvas-events.js` |
| Dragging a feature/handle | `src/editor/drag.js` |
| Marquee selection, annotation drag start | `src/editor/selection.js` |
| Snapping and inference | `src/core/snapping/object-snap.js` (+ `src/editor/pointer.js`) |
| Hit testing (what is under the cursor) | `src/editor/hit-testing.js` |
| Creating geometry from clicks | `src/editor/geometry-creation.js` |
| The creation-size popup (Beam length, etc.) | `src/editor/creation-sizing.js` → `src/features/dimensions/creation-dimension.js` |
| Undo/redo and document changes | `src/core/model/drawing-state.js` (`commitDrawingChange`) |
| How something is drawn on the canvas | `src/rendering/renderer.js` |
| What fits on screen / Fit | `src/editor/viewport.js` |
| The bottom-bar tool message | `src/editor/toolbar-render.js` (`setToolMessage`) |

---

## 2. Core — the model (`src/core/`)

| File | Owns |
|---|---|
| `model/drawing-state.js` | The document: `objects`, `selection`, `interaction`, camera. **All geometry factories** (`.geometryFactories.force`, `.load`, `.varying-load`, `.beam`, …), `addObject`, `commitDrawingChange`, `snapshotDrawing`, `selectObject`. |
| `model/feature-types.js` | Which types are bodies/connections/supports (`STATICS_BODY_TYPES`, `isSupportType`, …). |
| `geometry/feature-geometry.js` | Shape maths: corners, centres, `definingPoints`, `translateObject`. |
| `geometry/measurement-core.js` | Anchors a dimension/annotation can attach to (`resolveAnchor`, `twoPointSpan`). |
| `scale/dimensions.js` | **World Scale** — calibration, `isCalibrated`, `readScale`. |
| `units/quantities.js` | Unit tables (`LENGTH_UNITS`, `LENGTH_UNITS[...].mm`). |
| `snapping/object-snap.js` | The one resolver: `resolveConstructionPoint` (snap + H/V inference). |
| `selection/*` | Selection helpers used by box selection. |

**Key idea:** a feature is a plain object `{ id, type, name, geometry, style,
engineering, … }`. Moving a feature changes `geometry`; the type decides which
fields it has. There is no per-type class.

### Geometry factory signatures (in `drawing-state.js`)

```
force(start, end, options)          // end is the arrow tip
forceFromMagnitude(position, magnitude, angleDegrees, options)
load(start, end, intensity, options)            // uniform distributed load
varying-load(start, end, startIntensity, endIntensity, options)
beam / cable / shaft / truss / rigid-body / point / line / circle / arc / …
```

---

## 3. Features — the engineering (`src/features/`)

### analysis/
| File | Owns |
|---|---|
| `load-profile.js` | The **one** force/load vector module: `unitVector`, `setForceVector`, `forceVector`, `drawnForceEnd`/`drawnForceTail`/`drawnForceAxis`, `forceGeometry`, `vectorScale`/`vectorScaleFor`, `profilePoints`, `arrowSamples`, `loadDirection`, `loadNormalSide`, **load units** (`loadUnit`, `setLoadUnit`, `readLoadValue`, `LOAD_UNITS`). |
| `analysis-dependencies.js` | Links a diagram to its source body: `spanOf`, **`sourceStations`** (body-element x-locations — this is what the Sketch ticks read), `referencePositions`. |
| `diagram-equations.js` | Plot-mode expressions for BMD/SFD/AFD, `titleFor`. |
| `rotational-arrow.js` | The moment's curved-arrow maths. |

### dimensions/
| File | Owns |
|---|---|
| `dimension-model.js` | `createDimension`, `measurementFor`, `formatMeasurement`, **`graphicsFor`** (line/arc/**textAnchor** the renderer and the drag read), `dimensionDirection`. |
| `dimension-editor.js` | The dimension **value** dialog (`drawing-dimension-dialog`). |
| `smart-dimension.js` | The Smart Dimension tool's reference selection. |
| `creation-dimension.js` | The shared creation popup (one or two values + unit). Enter handling lives here. |
| `creation-dimensioning.js` | `planFor` — which fields a newly created feature asks for. |
| `dimension-edit.js` | Applying a typed value back onto geometry through World Scale. |

### annotations/
| File | Owns |
|---|---|
| `annotation-model.js` | Derived magnitude labels: `derivedAnnotations`, `textFor`, `annotationTextBounds`, `annotationAnchor`, `moveDerivedAnnotation`, `resetDerivedAnnotation`. Also `loadText`/`profileText` (which read the load unit). |

---

## 4. Editor — the interaction layer (`src/editor/`)

### Tools and routing
| File | Owns |
|---|---|
| `tools.js`, `toolbar.js`, `toolbar-render.js`, `toolbar-wiring.js` | The toolbar and tool buttons. `setToolMessage` is the **bottom bar**. |
| `tool-activation.js` | Arming a tool; `canvasPointFromEvent` (screen → world). |
| `tool-menus.js` | Submenus (Bodies, Loads, Supports, …), `isArcTool`, polygon prompt. |
| `statics-tools.js` | Statics tool tables: `STATICS_CHILD_TOOLS`, `STATICS_SPAN_TOOLS`, `STATICS_PLACEMENT_TOOLS`, `STATICS_BODY_ATTACHED_TOOLS`, instructions. |
| `construction-tools.js` | `isConstructionTool`, `shouldClickSelectExistingObject`. |
| `dimension-tool.js`, `annotation-tool.js` | `isDimensionTool`, `isAnnotationTool` (used by the drag router). |

### Interaction flow
```
canvas-events.js   pointer/mouse/dblclick listeners (the entry point)
   ├─ selection.js        marquee, annotation drag, cancelInteraction
   ├─ drag.js             manipulation drags (handles, body, dimension move)
   ├─ creation-drag.js    click-drag creation (Line, spans, loads) + trailing-click swallow
   └─ canvas-click.js     what a CLICK does → geometry-creation.js / dimension / annotation
pointer.js         snapping resolution + the bottom-bar feedback text
preview.js         live previews for every tool
hit-testing.js     objectAtPoint, pickDerivedMagnitude, pickDimensionOrAnnotation
handles.js         handleAtPoint, manipulationHandles (where grab handles sit)
keyboard-shortcuts.js  Enter/Escape/Delete → finishActiveConstruction, cancelInteraction
```

### Loads specifically
| File | Owns |
|---|---|
| `load-tool.js` | The whole distributed-load construction: body pick, span, magnitude/direction, the varying profile, `distributedLoadDraft`, and the magnitude popup calls. |
| `analysis-tools.js` | Opening a BMD/SFD/AFD diagram and placing it. |

### Statics
| File | Owns |
|---|---|
| `statics-creation.js` | `createStaticsFeature` (single-click placements). |
| `statics-attachment.js` | Attaching a feature to a body; `applyStaticsManipulation` (dragging a handle writes the real field). |
| `statics-panel.js` | The load/support/moment **Features panel rows**, including the load magnitude + unit selector. |

### Panels
| File | Owns |
|---|---|
| `feature-panel.js` | `renderProperties` — decides *what the Features tab shows*. |
| `feature-panel-markup.js` | The per-type panel body; `featureHeaderMarkup`, `section`, `labelRow`, the `displayLabel` map. |
| `feature-tree.js` | The component tree, `renderLoadBuildPanel`, `openSketchEditorFor`, `openPlotEditorFor`. |
| `property-update.js` | The ONE property setter — writes any panel field onto the model (`intensity`, `loadUnit`, `magnitude`, …). |
| `property-binding.js`, `property-inputs.js` | Binding the DOM controls and the numeric steppers. |
| `style-controls.js`, `appearance-panel.js` | Line type/width appearance controls. |

---

## 5. UI — dialogs (`src/ui/`)

| File | Owns |
|---|---|
| `editors/load-value-popup.js` | **The load/force magnitude popup.** `openLoadValuePopup({ title, label, value, unit, units, onOpen, onConfirm, onPreview, onCancel })`. Units are passed in (`["N"]` for a force, default kN/m·N/mm for a load). Enter confirms from **any** control (number or unit). |
| `editors/plot-editor.js` | The Plot (equations) editor. |
| `editors/sketch-editor.js` | **The Sketch (BMD/SFD/AFD) editor.** See §7. |
| `editors/note-editor.js` | The written-note editor. |
| `feature-panel/property-panel.js` | Shared panel primitives: `row`, `section`, `toggle`, `header`, `nameField`, `SECTION_ORDER`. |

---

## 6. Rendering and styles

| File | Owns |
|---|---|
| `rendering/renderer.js` | Draws every feature to SVG. Forces: `appendForceArrow` + `drawnForceEnd`. Loads: the arrow field. Annotations: `appendDerivedMagnitude` and the **annotation selection box** (`renderSelectionHandles`). |
| `styles/editor.css` | The Features panel grid (`.drawing-property-grid`), the sketch editor (`.sketch-editor*`), the popups (`.drawing-creation-dimension`), and the workspace columns (`grid-template-columns: 202px … 236px`). |
| `editor/viewport.js` | Fit/zoom, and `annotationBoundsPoints` (fit bounds read derived annotations, not the editor box). |

---

## 7. The Sketch editor (BMD / SFD / AFD)

`src/ui/editors/sketch-editor.js`, opened from
`src/editor/feature-tree.js → openSketchEditorFor`.

**Element kinds**
| Kind | Shape | Fields |
|---|---|---|
| `line` | straight segment | `start`, `end` |
| `curve3` | **one smooth curve** | `start`, `bend`, `end` |
| `curve` | legacy many-point curve | `points[]` |

**`curve3` is the flexible curve tool.** Start and End are the ends; **Bend
is a control point** (drawn as a quadratic's control, so it is pulled toward,
not passed through). The same element gives increasing, decreasing, peak,
trough, concave-up and concave-down shapes — there is deliberately no
per-shape tool. Built by `buildThreePointCurve(id, start, bend, end)`.

**Drawing is press-drag-release.** `pointerdown` fixes the point, `pointermove`
puts the cursor's point under the pointer (a line keeps its start; a curve
keeps its already-committed Start/Bend), `pointerup` commits. On commit the
**Y-value popup** (`askForYValue` / `askForY`) asks for the exact ordinate in
the diagram's unit (`options.yUnit`). Enter confirms from any control; Escape
abandons.

**Body-element ticks and snapping.** `drawGraph(..., { stations })` draws a
tick per body-element station; `snapXToStations` pulls a nearby x onto a tick
within `SNAP_TOLERANCE_PX` (a magnet, **not** a wall — points between ticks
stay placeable). Stations come from `analysis-dependencies.sourceStations(body)`
via the diagram's live `referencePositions`, passed in by `openSketchEditorFor`
(along with `yUnit` from `renderer.ANALYSIS_DIAGRAM_AXES`). They are
**derived**, so they follow the body — nothing to rebuild.

**Layout.** Graph area first and full width (`.sketch-editor-graph-area`),
tools lower-left, elements/properties lower-right (`.sketch-editor-lower`).

**No plot-area highlight.** The tinted rectangle over the plot area is gone
for every diagram (plot and sketch); the axes and the curve say where the plot
is. See the `const highlighted = false` in `renderer.js`.

---

## 8. Common jobs (recipes)

- **Add a new feature type**
  1. Factory in `core/model/drawing-state.js`.
  2. Panel body in `feature-panel-markup.js` (+ a `displayLabel` entry).
  3. Renderer branch in `rendering/renderer.js`.
  4. A tool in `tools.js` / `tool-menus.js`, and a creation path in
     `geometry-creation.js` or `statics-creation.js`.

- **Change what a panel field writes**
  Edit `property-update.js` (the single setter) — the panel markup only names
  the key.

- **Make something respond to the cursor during creation**
  Add a preview branch in `preview.js`; the commit lives in
  `geometry-creation.js`.

- **Change snapping behaviour**
  `core/snapping/object-snap.js` (candidates and tolerance) and the
  `inferenceReferences` assembled in `editor/pointer.js`.

- **Open a value popup**
  `openLoadValuePopup({ title, label, value, unit, units, onConfirm })` for a
  number+unit; `creation-dimension.open(...)` (via `creation-sizing.js`) for a
  creation size.

- **Where an annotation/dimension's grab point sits**
  `editor/handles.js → manipulationHandles` (dimension → `graphics.textAnchor`;
  derived label → `pickDerivedMagnitude` in `hit-testing.js`).

---

## 9. Tests and QA

- **Unit/integration:** `tests/*.test.cjs`, run with `npm run test`
  (`node --test tests/*.test.cjs`). Load modules with the harness helpers in
  `tests/helpers/source-path.cjs`; render with `tests/harness-renderer.cjs`.
- **Lint:** `npm run lint`.
- **Browser QA:** `tools/qa/*.mjs` run through the `browser-automation` skill:
  `node <skill>/browser.mjs http://localhost:5173/ --script ./tools/qa/<file>.mjs`.
  `tools/qa/qa-helpers.mjs` gives `category()`, `tool()`, `sub()`, `press()`,
  `move()`, `at()`, `msg()`, `panel()`, `allObjects()`.

Useful test files to copy from: `tests/sketch-editor.test.cjs` (rendering +
DOM), `tests/load-value-popup.test.cjs` (popup keys), `tests/dimension-drag-edit.test.cjs`
(model round-trips).

---

## 10. Load units in one line

`kN/m` and `N/mm` are the **same physical value**. The unit lives on the load
geometry (`geometry.loadUnit`), read by `load-profile.loadUnit` and used by the
annotation (`loadText`/`profileText`), the Features panel
(`statics-panel.js` → `data-property="loadUnit"`), and the popups. Changing it
changes the label only — never the stored magnitude.
