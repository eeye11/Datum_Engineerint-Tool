# Datum — Architecture

Where things live, and why. Read this before hunting for a file.

The guiding rule is **ownership**: a file lives where the thing it *is*
lives. Shared machinery is separated from the tools that use it, and
tools are grouped the way the toolbar groups them, so the folder tree
mirrors the application a user sees.

---

## The shape of the tree

```
js/
├── app/            the drawing controller and its toolbar
├── core/           shared machinery: geometry, units, model, snap, …
├── features/       persistent data models (dimensions, annotations, analysis)
├── rendering/      drawing to the SVG canvas
├── tools/          one folder per toolbar command
├── ui/             panels, editors, popups
├── sheets/         sheets and their tabs
├── file/           save, load, export, crash recovery
└── references/     the written-solution reference system
```

The order is also the **dependency order**. Nothing in `core/` knows
about `tools/`; nothing in `features/` knows about `ui/`.

```
core  ←  features  ←  tools  ←  ui
                ↑
            rendering
```

`rendering/` reads model and core data and draws it. It never owns state.
`app/drawing.js` sits on top and wires everything together.

---

## Where each system lives

### Shared core — `js/core/`

| Concern | File |
| --- | --- |
| Geometry mathematics (distances, spans, anchors) | `core/geometry/measurement-core.js` |
| Shape-specific geometry (rectangles, rigid bodies) | `core/geometry/feature-geometry.js` |
| Body frames: local axes and attachment points | `core/geometry/body-frames.js` |
| Quantity and unit formatting | `core/units/quantities.js` |
| The sheet's **Universal Length Scale** | `core/scale/dimensions.js` |
| The scale-calibration dialog | `core/scale/scale-calibration.js` |
| Document state, history, feature collections | `core/model/drawing-state.js` |
| Snapping and H/V inference | `core/snapping/object-snap.js` |
| Clipboard and deletion | `core/selection/` |

### Features — `js/features/`

Persistent data models. A feature answers *"what is this object and what
does it store?"*

| Concern | File |
| --- | --- |
| Dimension data, measurement, rendering geometry | `features/dimensions/dimension-model.js` |
| Choosing what to measure (Smart Dimension's judgement) | `features/dimensions/smart-dimension.js` |
| Creation-time sizing (the "Beam Length" popup) | `features/dimensions/creation-dimensioning.js` |
| The dimension value editor | `features/dimensions/dimension-editor.js` |
| Magnitude annotations | `features/annotations/annotation-model.js` |
| Parent/child dependency resolution | `features/analysis/analysis-dependencies.js` |
| Analysis diagram equations | `features/analysis/diagram-equations.js` |
| Distributed-load profiles | `features/analysis/load-profile.js` |
| Moment arc geometry | `features/analysis/rotational-arrow.js` |

### Rendering — `js/rendering/`

`renderer.js` draws every feature to the SVG canvas. It owns no model
state; it reads the document and draws it. The shared **vector arrow**
implementation (used by forces, loads, resultants and analysis) lives in
the same file, so there is one arrow renderer rather than one per
feature.

### UI — `js/ui/`

| Concern | File |
| --- | --- |
| Shared panel vocabulary (section, toggle, scalar, readOnly) | `ui/feature-panel/property-panel.js` |
| The Sketch editor (analysis diagrams) | `ui/editors/sketch-editor.js` |
| The Plot editor (analysis expressions) | `ui/editors/plot-editor.js` |

### Sheets — `js/sheets/`

| Concern | File |
| --- | --- |
| Sheet collection, per-sheet content and scale | `sheets/sheets.js` |
| Sheet tab strip | `sheets/sheet-tabs.js` |

### File — `js/file/`

| Concern | File |
| --- | --- |
| Document serialisation | `file/document-file.js` |
| Save / Save As | `file/file-save.js` |
| Image and SVG export | `file/document-export.js` |
| Crash recovery | `file/document-recovery.js` |

### App — `js/app/`

| Concern | File |
| --- | --- |
| **The drawing controller** — tools, interaction, panels, commands | `app/drawing.js` |
| Tool icons and the category → tool table | `app/tools.js` |
| Toolbar category buttons | `app/toolbar.js` |
| Shared UI helpers (confirm dialogs) | `app/ui.js` |

---

## `app/drawing.js` — the controller

This is the largest file in the project, and deliberately so: it is the
**single interaction layer**. Every tool's click handling, the selection
and drag lifecycle, the Feature Panel contents and the command
implementations share one closure and 23 module-level variables. That
sharing is what makes it one file rather than fifteen.

It is organised into labelled sections, in this order:

| Section | What it covers |
| --- | --- |
| Sheets | creating, switching, deleting, reordering |
| References | the written-solution link system |
| Arc tools | three-point arc construction |
| Creation dimensioning | the sizing popup workflow |
| Dimension tools | reference selection, inference, placement |
| Distributed loads | body selection, span, direction |
| Feature panels | every feature's panel contents |
| Magnitude boxes | the movable annotation boxes |
| Direct manipulation | drag lifecycle, handles, commits |
| Fit | viewport fitting |
| Deletion | dependency-aware removal |
| Image export | PNG/JPG/SVG output |

**To find a function:** search the file for its name. Section banners
(`/* ===== NAME ===== */`) mark the boundaries.

---

## The sheet's Universal Length Scale

The single most important cross-cutting concept.

A drawing's coordinates are numbers until something says how big they
are. That something is the **Universal Length Scale**, and **it belongs
to the sheet**, not the document:

```
Document
├── Sheet 1  →  its own Universal Length Scale
├── Sheet 2  →  its own Universal Length Scale
└── Sheet 3  →  its own Universal Length Scale
```

- Implemented in `core/scale/dimensions.js` (`readScale`, `calibrate`,
  `toEngineering`, `fromEngineering`).
- Stored on the sheet (`sheets/sheets.js`), loaded into the editor on
  switch, written back when leaving.
- Established by the **first valid physical length** on a sheet.
- **Reset when the sheet is emptied** of length-bearing geometry
  (`core/model/drawing-state.js`, `resetScaleIfSheetIsEmpty`).

Do not confuse it with the **Universal Vector Display Scale**, which only
changes how large a force arrow is *drawn* and never affects a magnitude.

---

## Units and quantities

`core/units/quantities.js` is the **only** place a number becomes text.

- A visible quantity **always** carries its unit. There is no Show Unit
  control, globally or per feature.
- No approximation mark (`~`) is ever printed.
- `formatMagnitude(value, quantityType)` is the shared entry point.

No feature parses or formats `"500 mm"` on its own.

---

## Snapping

`core/snapping/object-snap.js` serves **every** tool — geometry, Statics,
dimensions and analysis all use it. There is no second snap engine.

- 5 px snap tolerance.
- 7° horizontal/vertical inference band.
- A snap candidate is cleared immediately when the cursor leaves
  tolerance.

---

## Dependencies

Parent/child relationships (a load follows its beam; deleting a beam
removes its load) are resolved in
`features/analysis/analysis-dependencies.js` and applied during deletion
in `app/drawing.js`.

When a parent moves, rotates, resizes or is deleted, the rules live
there — not scattered through feature files.

---

## History

Undo/redo is `core/model/drawing-state.js`:
`snapshotDrawing` captures a document snapshot, `commitDrawingChange`
pushes it. One user action is one entry; a drag records one entry for the
whole gesture, taken from the state *before* it began.

---

## Tests and developer tooling

```
tests/        automated tests (node --test)
tests/helpers/source-path.cjs   resolves a module by NAME
tools/audit/  system-wide engineering audits
tools/qa/     browser-driven verification
tools/dev/    one-off diagnostics
tools/tikz-probes/  LaTeX rendering probes
```

**Tests never hard-code a source path.** They ask
`tests/helpers/source-path.cjs`:

```js
const { locate } = require("./helpers/source-path.cjs");
require(locate("quantities.js"));
```

`locate` finds the module wherever it lives in `js/`, so moving a file
does not break 88 tests.

---

## Adding a feature

1. **Data** → `js/features/<area>/`
2. **Geometry maths** → `js/core/geometry/` (if shared)
3. **Rendering** → `js/rendering/renderer.js`
4. **Panel** → the feature-panel section of `js/app/drawing.js`
5. **Tool + registration** → `js/app/drawing.js` and `js/app/tools.js`
6. **Load order** → add the `<script>` to `index.html`
7. **Tests** → `tests/`, loading modules through `locate()`
