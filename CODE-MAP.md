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

Two shared toolkits sit inside `core/` and are worth knowing before writing a
helper of your own — see §14:

```
core/geometry/points.js   distance, distanceToSegment, unitVector, midpoint, …
core/util/clone.js        deepClone, deepCloneAll
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
| **Annotate** — notes, labels, leaders, arrows, symbols, tolerances, tables | `src/features/annotations/annotate-model.js` (data) + `src/editor/annotate-creation.js` (interaction) |
| Which tools the **Annotate** section shows, and their categories | `src/editor/tools.js` (`annotateToolGroups`) |
| **Angular dimensioning** — which of the four sectors is dimensioned | `src/features/dimensions/dimension-model.js` (`angleSectorLegs`) |
| Point/segment maths (distance, nearest point on a segment) | `src/core/geometry/points.js` |
| Deep-copying any value | `src/core/util/clone.js` (`deepClone`) |
| The top-bar / Tools / Features **Hide** controls | `src/editor/workspace-layout.js` + `.drawing-*` rules in `src/styles/editor.css` |
| The responsive breakpoints and icon-only modes | `src/styles/editor.css` (the `@media` blocks near the end) |

---

## 2. Core — the model (`src/core/`)

| File | Owns |
|---|---|
| `model/drawing-state.js` | The document: `objects`, `selection`, `interaction`, camera. **All geometry factories** (`.geometryFactories.force`, `.load`, `.varying-load`, `.beam`, …), `addObject`, `commitDrawingChange`, `snapshotDrawing`, `selectObject`. |
| `model/feature-types.js` | Which types are bodies/connections/supports (`STATICS_BODY_TYPES`, `isSupportType`, …). |
| `geometry/feature-geometry.js` | Shape maths: corners, centres, `definingPoints`, `translateObject`. |
| `geometry/points.js` | **The point/segment primitives**, shared: `distance`, `distanceToSegment`, `unitVector`, `segmentDirection`, `midpoint`, `closestPointOnSegment`. Pure, no DOM — used by the model, the renderer, snapping and tests. |
| `geometry/measurement-core.js` | Anchors a dimension/annotation can attach to (`resolveAnchor`, `twoPointSpan`). |
| `scale/dimensions.js` | **World Scale** — calibration, `isCalibrated`, `readScale`. |
| `units/quantities.js` | Unit tables (`LENGTH_UNITS`, `LENGTH_UNITS[...].mm`). |
| `snapping/object-snap.js` | The one resolver: `resolveConstructionPoint` (snap + H/V inference). |
| `util/clone.js` | **The deep copy**: `deepClone`, `deepCloneAll`. Replaces `JSON.parse(JSON.stringify(x))` written out by hand, and answers the `undefined` case that once made saving a drawing with an annotation fail. |
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
| `dimension-model.js` | `createDimension`, `measurementFor`, `formatMeasurement`, **`graphicsFor`** (line/arc/**textAnchor** the renderer and the drag read), `dimensionDirection`. **`angleSectorLegs`** is the one place the ANGULAR SECTOR is decided — see §11. |
| `dimension-editor.js` | The dimension **value** dialog (`drawing-dimension-dialog`). |
| `smart-dimension.js` | The Smart Dimension tool's reference selection. |
| `creation-dimension.js` | The shared creation popup (one or two values + unit). Enter handling lives here. |
| `creation-dimensioning.js` | `planFor` — which fields a newly created feature asks for. |
| `dimension-edit.js` | Applying a typed value back onto geometry through World Scale. |

### annotations/
| File | Owns |
|---|---|
| `annotation-model.js` | Derived magnitude labels: `derivedAnnotations`, `textFor`, `annotationTextBounds`, `annotationAnchor`, `moveDerivedAnnotation`, `resetDerivedAnnotation`. Also `loadText`/`profileText` (which read the load unit). |
| `annotate-model.js` | **The Annotate features.** `ANNOTATE_KINDS` (note, label, leader, callout, arrow, symbol, tolerance, table), `createAnnotate`, `textOf`, `isGeometricKind`, `translateAnnotation`, `boundsOf`, plus `SYMBOL_LIBRARY` and `TOLERANCE_MODES`. These are ONE feature type (`annotate`) with a `kind`, so selection/move/undo/save/panel are shared. |

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
| `annotate-creation.js` | **The Annotate interaction layer.** `isAnnotateTool`, `handleAnnotateClick`, `beginAnnotateAnchor`, `completeAnnotateAt`, `commitAnnotate`, `isEditableAnnotate`. Point-placed kinds take one click; geometric kinds (leader, callout, arrow) take both click-move-click and drag. |
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
hit-testing.js     objectAtPoint, pickDerivedMagnitude, pickDimensionOrAnnotation, hitTestAnnotateTarget
annotate-creation.js  the Annotate tools' own small state machines (point placement, anchor→end)
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

**COORDINATES: `toScreen` / `fromScreen`, AND THE SCALE IS FIXED FOR THE SESSION.**

`makeScale(range, elements, options)` is the ONE projection, used by every
axis, every element and every gesture — so what is drawn and what is read
cannot disagree. Its vertical extent comes from `chooseUnitHeight` and is
**chosen once, when the editor opens** (`let scale = makeScale(...)` in `open`),
then REUSED for every `redraw`. It used to be re-derived from the current
elements each frame, so dragging a point upward rescaled the graph beneath the
cursor and the geometry appeared to run away from the mouse. `options.yRange`
(the diagram's own extent, from `openSketchEditorFor`) anchors it; an empty
sketch still gets a real y-axis.

**Axes and ticks.** `drawGraph` always draws BOTH axes — x at y = 0, y pinned to
the plot's left edge — plus a mark and a VALUE at every body station (in the
reserved `LABEL_BAND`) and five y values in the left `Y_LABEL_MARGIN`. An empty
sketch is still a graph.

**TWO CREATION IDIOMS, ONE GESTURE MODEL.** `pointerdown` decides ONCE what the
gesture is, from what is under the pointer:

```
a handle of the selected element   -> move that point
an element                         -> move the whole element
empty space, with a draw tool      -> draw
```

Drawing then takes either idiom, told apart by travel past 4px:

```
press / drag / release                  the drag gave the second point
press / release, move, click            the second click gives it
```

`commitLine` / `commitCurve` are the only commit paths, so both idioms produce
identical geometry. `justFinished` swallows the browser's trailing click after a
drag, so one gesture cannot become two elements.

**THERE IS NO Y-VALUE POPUP.** The cursor is the ordinate in both axes;
`askForYValue` and its fallback are **deleted**, and two tests assert the
absence. Exact values are still editable, through the handles and the panel.

**Snapping** is `snapPoint(point, { scale, stations, elements, excludeId })`,
which returns the snapped point **and what it snapped to**, in priority order:

1. another element's **endpoint** (both axes exact — `endpoint`),
2. a **body station's x** with the cursor's y (vertical alignment — `station`).

The tolerance is a few SCREEN pixels, converted per axis (`snapTolerances`), so
the magnet feels the same at any scale and is never a wall. `snapXToStations` is
kept as a thin wrapper for the older call sites.

**Direct manipulation.** `selectedElementPoints(element)` is the ONE list of an
element's editable points, used by both the handles drawn and the hit test that
finds them: a line's two ends; a `curve3`'s Start, **Bend** and End; a legacy
curve's every point. A whole-feature drag and a point drag both apply their
delta from the **ORIGINAL** element stashed at the press (`applyWholeMove` /
`applyPointMove`), so a long drag cannot accumulate rounding and the shape is
preserved exactly.

**Body-element ticks.** `drawGraph(..., { stations })` draws a tick per
body-element station; stations come from `analysis-dependencies.sourceStations`
via the diagram's live `referencePositions`, so they are **derived** and follow
the body. The three diagrams share ALL of this — only `diagramType`, the axis
unit and the title differ.

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

- **Add an Annotate kind (note, label, leader, …)**
  1. Add it to `ANNOTATE_KINDS` in `features/annotations/annotate-model.js` —
     `geometric: true` if it is a start-and-end mark (so it takes both the
     click and the drag), `targeted: true` if it attaches to a feature.
  2. Add a tool to a category in `tools.js → annotateToolGroups`. The tool id
     IS the kind id, and `ANNOTATE_TOOL_KINDS` is derived from the model, so
     the two cannot drift.
  3. Draw it in `rendering/renderer.js → appendAnnotateEntity`, and give it
     panel rows in `feature-panel-markup.js` (the `object.type === "annotate"`
     branch).
  Interaction, selection, moving, undo and save are already handled.

- **Change how an angle is measured or drawn**
  `features/dimensions/dimension-model.js → angleSectorLegs` is the ONE place
  the sector is chosen; both the value and the arc are built from it, so they
  cannot disagree. The SPAN each reference measures is `spanOfReference`, which
  resolves a reference's own edge anchors — needed for two sides of one
  triangle. See §12 and §12a.

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

Tests that pin the behaviour described in §11–§14, worth reading as worked
examples:

| Test | Pins |
|---|---|
| `dimension-angle-sector.test.cjs` | the angular sector: cursor choice, right angle, reversed endpoints, rotation, the vertex case (§12) |
| `dimension-subgeometry-angle.test.cjs` | two EDGES of one triangle: all three vertex angles, sum 180, reversed endpoints, a side's length, parallel edges of one rectangle (§12a) |
| `dimension-same-feature-angle.test.cjs` | the same requirement through the committed dimension and the inference |
| `annotate-toolset.test.cjs` | the Annotate categories and that no command hides behind a submenu (§11) |
| `deep-clone.test.cjs` | `deepClone`, including the `undefined` case that broke saving (§14) |
| `variable-dimension.test.cjs` | Variable Dimension: the shared inference, expressions stored verbatim, the prompt order (§12) |
| `box-selection.test.cjs` | box selection: crossing vs containment, the graph's INK over its raw values, point-placed Statics (§16) |
| `enggdraw-round-trip.test.cjs` | the whole `.enggdraw` format: every feature kind and relationship through save → text → load (§15) |
| `statics-value-prompt-and-support.test.cjs` | a typed answer (number / Unknown / symbol), unit-control widths, the fixed support's wall and hatch (§17) |
| `dual-creation.test.cjs`, `statics-dual-creation.test.cjs` | click-move-click AND click-drag for every creation tool |
| `responsive-layout.test.cjs` | the toolbar/section-bar one-row rule, panels never hidden, breakpoints descending (§13) |

---

## 10. Load units in one line

`kN/m` and `N/mm` are the **same physical value**. The unit lives on the load
geometry (`geometry.loadUnit`), read by `load-profile.loadUnit` and used by the
annotation (`loadText`/`profileText`), the Features panel
(`statics-panel.js` → `data-property="loadUnit"`), and the popups. Changing it
changes the label only — never the stored magnitude.

---

## 11. The Annotate system

**One feature type, eight kinds.** Everything under Annotate is a feature of
`type: "annotate"` with an `annotateKind` — `note`, `label`, `leader`,
`callout`, `arrow`, `symbol`, `tolerance`, `table`. They share a kind because
they are the same SHAPE of thing (content + placement + optional target +
style), so selection, moving, undo, save and the panel are written once rather
than eight times.

**Where the data lives** — all of it on the feature, so it serialises with no
special case:

```
id, name            identity ("Note 1", "Leader 2", …)
annotateKind        which of the eight
 text              the content (a symbol/tolerance render from fields instead)
targetFeatureId     the feature a label/leader/callout/tolerance is about
geometry.position   where a point-placed kind sits (world units)
 geometry.start/end the two ends of a geometric kind (world units)
 geometry.symbolId, geometry.toleranceMode/Values, geometry.rows/columns/cells
style               fontSize, stroke, arrowhead, leaderStyle
```

**Two interaction shapes, decided by the kind:**

- **Point-placed** (note, label, symbol, tolerance, table) — one click.
- **Geometric** (leader, callout, arrow) — a start and an end, so BOTH
  click-move-click and click-drag, through the same classification the geometry
  tools use (`creation-drag.js`).

**The toolset** (`tools.js → annotateToolGroups`) is category headings with the
tools listed directly under them — **categories, not submenus**:

```
Selection · Dimensions · Text · Leaders · Markup · Symbols & Tolerances · Tables
```

Tool id === kind id, and `ANNOTATE_TOOL_KINDS` is derived from the model's own
`ANNOTATE_KINDS`, so a kind cannot end up with no tool.

**Rendering** is `renderer.js → appendAnnotateEntity`, one function for all
eight kinds. **Hit testing** is `hit-testing.js → annotateContainsPoint` (text
box, plus the line for a leader/arrow and the grid for a table). **Moving** is
`drag.js` (`annotation-offset`, world-space delta from the ORIGINAL geometry,
so the mark never jumps). **Panel rows** are the `object.type === "annotate"`
branch in `feature-panel-markup.js`, and **property writes** are the same-named
branch in `property-update.js`.

The LEGACY `annotation` type (derived magnitude labels) is unchanged and lives
in `annotation-model.js`; both file under the **Annotate** group in the tree.

---

## 12. Angular dimensioning, and why it works the way it does

### The references may be EDGES of one feature

**"Two lines" does not mean "two features".** A triangle is ONE feature with
three edges, and any two of its edges are valid references for an angle — as
are two sides of a rectangle or a polygon, or two independent lines.

A reference therefore names a **sub-geometry**:

```
{ kind: "line", featureId: <triangle id>,
  anchor: "segment0Start", endAnchor: "segment0End" }
```

`hit-testing → objectAtPoint` reports the FEATURE; the EDGE comes from
`dimension-inference.js → compositeSegmentReference`, which finds the segment
nearest the click and names its two ends (`segment{i}Start/End`). That is
requirement §20 — a specific reference, not merely the parent feature.

**TWO THINGS MUST BOTH HOLD for that to measure anything**, and both were
broken:

1. `normaliseReferences` (in `dimension-model.js`) **dropped `endAnchor`**, so
a stored dimension could not name its edge. It preserves it now.
2. `measureAngle` / `angularGraphics` resolved each reference through the
FEATURE's span — `twoPointSpan(triangle)`, which describes the TRIANGLE, not
the side clicked — so both sides resolved to the same span and the angle was
zero or about the wrong lines. They now use **`spanOfReference`**, which
resolves the reference's own anchors first and derives the partner anchor
(`segment3Start` ⇄ `segment3End`) when only one is stored, for dimensions
saved before the fix. The feature span remains the fallback for a whole-body
reference (a Line, a Beam, a Cable, a Shaft).

**Shared vertex wins; otherwise the mathematical intersection.** `nearestVertex`
takes the closest pair of ends of the two resolved spans — so two sides of a
triangle meet at the corner the student sees, not at the parent's centre or a
bounding-box middle. Two edges that do not touch use their line intersection,
as two independent lines do.

**Parallel edges are a DISTANCE, not a zero angle.** `inferDimensionDescriptor`
tests the cross product of the two unit directions and falls to a
perpendicular distance, so two opposite sides of a rectangle never draw an arc.

### The three decisions

Two lines crossing make **four** angular regions, in two values. For a 35°
pair: `35° 145° 35° 145°`. Three separate things decide the final dimension,
and they are deliberately kept apart:

| | decided by | where |
|---|---|---|
| **the angle value** | the world-space geometry | `measureAngle` |
| **which of the four sectors** | the cursor (the dimension's placement) | `angleSectorLegs` |
| **the arc radius** | the cursor's distance from the vertex | `angularGraphics` |

**`angleSectorLegs` is the single decision point.** Both the measured value
(`measureAngle`) and the drawn arc (`angularGraphics`) are built from its two
legs, so a label reading 35° can never sit over an arc drawn through 145°.

**The sector is chosen by SORTING the four boundary rays by angle**, then
pairing each with the next — which divides the circle into exactly the four
regions in order. The earlier version listed the pairs in a FIXED order, which
is only the order around the circle for some arrangements of the two axes; when
it was not, a dimension inside a triangle's 90° corner measured the 143° region
outside it. Sorting removed every assumption about how the two axes relate.

**The sector is derived from `dimension.placement`, not stored beside it.**
Placement is already world-space and already survives zoom, pan, Fit, save and
reload — so there is one piece of state to keep in step with the geometry, not
two.

**Endpoint order cannot change the answer.** A line has an AXIS, not an arrow:
the same physical line stored end-to-start must read the same angle. The legs
are built from the vertex outward (`legDirection`), never from a raw
`end - start`, so reversing a line changes nothing — the cursor still chooses
acute or obtuse.

### TWO EDGES OF ONE FEATURE (triangles, rectangles, polygons)

**"Two lines" does not mean "two features".** A triangle is ONE feature with
three EDGES, and any two of its sides must be valid angular references. A
reference names the EDGE, not the feature:

```
Triangle  ->  { kind: "line", featureId: tri, anchor: "segment1Start",
                endAnchor: "segment1End" }
```

The names come from `compositeSegmentReference` (`dimension-inference.js`) and
`measurement-core.resolveAnchor` resolves each to its real world point. Three
things have to hold, and each was a defect at some point:

1. **`normaliseReferences` must KEEP `endAnchor`.** It dropped it, so a stored
   dimension carried only the two `Start` anchors and could not find the second
   end of either edge. **This is the one that broke the whole angle path.**
2. **The measurement resolves the REFERENCE's span, not the feature's** —
   `spanOfReference` in `dimension-model.js`. `twoPointSpan(triangle)` is the
   triangle's overall extent (or null), so using it made two sides of ONE
   triangle the SAME span. It also derives the partner anchor
   (`segment1Start` → `segment1End`) so a dimension saved without one resolves.
3. **The sector test must not assume how the two axes are oriented.**
   `angleSectorLegs` sorts the four boundary rays by angle and takes
   consecutive pairs; a fixed order matched the wrong sector for some pairs.

Which measurement two references imply is the INFERENCE's decision
(`inferDimensionDescriptor`): non-parallel lines → **angle**, parallel lines →
**perpendicular distance**, two points → **distance**. It compares the
references' ANCHORS (`sameLineReference`), never their feature ids, so two
edges of one rectangle are correctly two different lines.

### The click flow

```
click 1  -> armSingleMeasurement   LENGTH preview, still accepting a 2nd ref
click 2  -> inferDimensionDescriptor:
              non-parallel -> angular   (preview switches at once)
              parallel     -> distance
move     -> cursor picks the sector and the radius
click    -> commit               (one undo entry)
```

No Enter, no popup, no mode: `dimension-placement.js → handleDimensionClick`.

### Guarantees, and the tests that cover them

`tests/dimension-angle-sector.test.cjs`:

- acute / obtuse chosen by the cursor;
- a right angle reads 90 in all four sectors;
- reversing either line's endpoints changes no sector;
- rotating the whole geometry changes no sector;
- a placement ON the vertex chooses nothing (rather than a spurious sector).

`tests/dimension-subgeometry-angle.test.cjs` and
`tests/dimension-same-feature-angle.test.cjs`:

- two EDGES of one triangle are valid references (§4, §6);
- the angle at **every** vertex, from the two edges meeting there (§5, §14, §15);
- the three angles of a triangle sum to 180 (§14);
- a side measured alone is that side's length, not the feature's extent;
- reversed edge endpoints change nothing (§12);
- parallel edges of one rectangle give a distance, not a zero angle (§19).

### Variable Dimension is Smart Dimension's SIBLING

```
Smart Dimension     geometry -> place -> MEASURED value
Variable Dimension  geometry -> place -> the STUDENT'S value
```

**The selection, the inference and the placement are the SAME code.**
`isDimensionTool` covers both, so both go through
`dimension-placement.js → handleDimensionClick` and
`dimension-inference.js` — one line infers a length, two non-parallel lines an
angle, two parallel lines a distance. Only the ANSWER differs.

**The prompt comes LAST, and it is the shared popup.** `commitDimension` opens
`openLoadValuePopup({ expression: true })` — the same component a Length and a
Force use — *after* the geometry is chosen and the dimension placed. Nothing is
created until the student answers, so cancelling leaves the drawing untouched.

**A variable is asked for BEFORE the calibration gate**, and that ordering
matters: a variable measures nothing, so it has no length to declare. Behind
the gate it became the tool that SETS the sheet's scale, and on an uncalibrated
sheet the calibration dialog swallowed the placement click.

**The value is stored verbatim.** `object.symbol` holds `θ`, `L/2`, `3*x + 5`
and `25` alike — never evaluated, never replaced by the measured geometry. The
feature carries the inferred `dimensionType` too, so a variable is drawn by the
dimension machinery rather than being a differently-shaped thing.

**Where the symbol lives:** on the FEATURE (`variable.symbol`), which is where
the renderer, the hit test and `variableText` read it. The panel used to read
`geometry.symbol` and the setter used to write it — a place nothing reads — so
the student's own symbol was invisible and an edit appeared to do nothing. Both
now use the feature.

**`expression: true` is opt-in.** A load magnitude and a force still require a
number and still show the unit control; only a Variable Dimension accepts words
and hides the unit. `tests/load-value-popup.test.cjs` pins the numeric path.

Covered by `tests/variable-dimension.test.cjs` (29 checks): the shared
inference, every expression form stored and displayed verbatim, no auto-value
on a measured line, the panel/setter agreement, the prompt order, and the
opt-in flag.

---

## 13. Layout, the three Hide controls, and responsive behaviour

Three INDEPENDENT visibility controls — none implies anything about the others:

| Control | Hides | Where |
|---|---|---|
| **Top-bar Hide** | the drawing's two top bars (global tool bar + tool-type bar) | the button sits at the right of the **style strip** (the Thickness row), which is the one row that never hides and never scrolls sideways; the restore control is the slim `Show Top Bar` strip on the canvas's top edge |
| **Tools Hide** | the Tools panel | its own arrow, on the left rail |
| **Features Hide** | the Features panel | its own arrow, on the right rail |

It does **not** hide the Datum header, the document name, or the Written
Solution / Engineering Drawing tabs. State lives on `editorState.topBarHidden`
(session only, never saved) and the CSS class `body.datum-topbar-hidden` is the
one place "hidden" is defined.

**The workspace is a 6-row grid**, and the rows are matched to their children
by POSITION. Hiding a row means setting its track to `0` and leaving the list
SIX long — re-stating a shorter list re-assigns every remaining row to the
wrong child and collapses the canvas. See the note above
`body.datum-topbar-hidden .drawing-workspace` in `styles/editor.css`.

**Responsive rules** (all in `styles/editor.css`):

- the top toolbar and the tool-type bar are `nowrap` + `overflow-x: auto` —
  ONE row that scrolls, never a wrapped second line;
- panels go full → narrower → compact → **icon-only**, and are NEVER
  `display: none`d by width;
- the style strip **wraps** (its grid row is `auto`, not a fixed 28px), and
  every control is `flex: 0 0 auto` with its own width, so nothing overlaps;
- the page never scrolls sideways because a panel is open.

---

## 14. Shared primitives (do not re-implement these)

| Primitive | Module |
|---|---|
| `distance`, `distanceToSegment`, `closestPointOnSegment`, `unitVector`, `segmentDirection`, `midpoint` | `core/geometry/points.js` |
| `deepClone`, `deepCloneAll` | `core/util/clone.js` |

The point maths used to be written out in `hit-testing`, `construction-geometry`,
`object-snap` and the sketch editor — four copies of one clamp, and four
chances for a hit test and a snap to disagree. Both modules are pure (no DOM,
no model) and may be imported from anywhere, including tests.

---

## 15. The `.enggdraw` file format

**Full audit:** `docs/ENGGDRAW-FORMAT-AUDIT.md` — schema, per-feature coverage,
and the round-trip result.

| Layer | Module | Owns |
|---|---|---|
| The envelope | `file/document-file.js` | `format`/`version`, `createDocument`, `readDocument`, `MIGRATIONS`, `normalize`, `withExtension` |
| The body | `core/model/drawing-state.js → serializeDrawing` / `cloneFeatureForSave` | what a feature is when written |
| The sheets | `sheets/sheets.js → serializeCollection` | the whole sheet, spread |
| Atomic write | `file/file-save.js` | writes through a `FileSystemFileHandle` writable — a failed write cannot replace a good file |
| Recents / previews | `file/recent-files.js`, `file/templates.js` | **`localStorage`, never inside the document** |

**Three rules that keep it complete:**

1. **A sheet is spread whole** (`{ ...deepClone(sheet) }`), so a new sheet field
   is saved by construction.
2. **A feature is cloned field-by-field from its own keys**
   (`cloneFeatureForSave`), so a new feature field is saved by construction.
   It used to be a hand-written allow-list of sub-objects — a list to forget.
3. **References are stable string ids**, never array indexes: `parentId`,
   `sourceRefs[].featureId` (+ `anchor`/`endAnchor` for a sub-edge),
   `engineering.sourceFeatureId`, `targetFeatureId`. Sub-geometry uses NAMED
   anchors (`segment0Start`), so a dimension across two edges of one triangle
   reopens pointing at the same two edges.

**A version bump must bring a migration.** `CURRENT_VERSION` and `MIGRATIONS`
are paired; `migrate` refuses when the step for `CURRENT_VERSION - 1` is absent,
so the mistake fails on the first load rather than silently discarding features.

**Not in the file, by design:** cursor/hover/selection/snap/preview/drag state,
open dialogs, DOM state, render caches, absolute filesystem paths, and the
recent-files registry. A preview image is a cache in `localStorage`; the
document model is always sufficient to redraw.

**The test that proves it:** `tests/enggdraw-round-trip.test.cjs` builds a
document with every feature kind and relationship shape, writes it to **text**,
reads it back through the real reader and migration, and compares the models
field by field — 29 checks, all passing.

---

## 16. What a typed value MEANS, and the fixed support

### One reader for every value prompt

Every Statics tool that asks for a value after placement asks the SAME question
through the SAME popup (`ui/editors/load-value-popup.js`), so the answer must
mean the same thing everywhere. `readStaticsValue(text, unit)` is the one
reader, and it recognises the three states the model already has:

| Typed | Means | Stored as |
|---|---|---|
| `250`, `-3.25` | a magnitude | `geometry.magnitude` (+ `geometry.unit`) |
| **empty** | **Unknown** | `unknownValues.magnitude = true` |
| `F₁`, `M`, `2*M` | the student's own symbol | `magnitudeLabel` |

`applyStaticsValue(object, answer)` writes all three and **clears the others**,
so a force cannot end up showing a number beside an Unknown mark.

**Empty is an answer, not a mistake.** It used to be refused by the popup and
read as zero by the callers — both wrong statements. **A symbol is never turned
into zero** either: the old callers did `Math.max(0, Number(value) || 0)`, which
silently replaced `F₁` with 0.

`expression: true` is the ONE difference a Variable Dimension needs (§12); a
load magnitude and a force still require a number and still show the unit
control.

### The trap: `addObject` may store a COPY

`addObject` renames a feature by spreading it (`{ ...object, name }`) when the
caller asked for a specific name, and pushed **that copy**. So a caller holding
the object it passed in held something **not in the document** — every later
write to it changed nothing on the sheet. It returns the stored object now, and
callers use what it returns.

This is worth knowing before writing to a feature after adding it: **use the
returned object**, not the one you passed.

### The fixed support

A fixed end is where the member STOPS, so its wall line sits **at the attachment
point** — `supportPlacement(..., { fixed: true })` uses zero clearance where
every other support stands off by `SUPPORT_CLEARANCE`. The hatch strokes run
along `out` (the direction the symbol's ground faces, i.e. away from the body),
so they are always **behind the wall from the body's side**. The symbol rotates
with the member's own frame, so a vertical body gets a horizontal wall.

`tests/statics-value-prompt-and-support.test.cjs` covers the three value states,
the unit-control widths, and the fixed support's placement and hatching.
