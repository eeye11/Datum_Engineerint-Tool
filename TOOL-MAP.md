# Datum — Tool Map

Every toolbar command, and where its code lives.

Because Datum's tools share one interaction layer, a tool is **not** a
file. A tool is a set of places, and this map lists them all:

| Place              | What lives there                                       |
| ------------------ | ------------------------------------------------------ |
| **Registration**   | `js/app/tools.js` — the id, label and icon             |
| **Activation**     | `activateTool` in `js/app/drawing.js`                  |
| **Click handling** | the tool's handler in `js/app/drawing.js`              |
| **Preview**        | the preview branch for the tool in `js/app/drawing.js` |
| **Model**          | `js/core/model/drawing-state.js` (`geometryFactories`) |
| **Rendering**      | `js/rendering/renderer.js`                             |
| **Panel**          | the feature-panel section in `js/app/drawing.js`       |

Line numbers are deliberately omitted — they move. **Search the file for
the tool id** (e.g. `"point-force"`) and you will land on every site.

---

## General tools

| Tool   | Id       | Registration   | Creation / handling                         | Model              | Rendering     |
| ------ | -------- | -------------- | ------------------------------------------- | ------------------ | ------------- |
| Select | `select` | `app/tools.js` | `beginSelectionDrag`, `finishSelectionDrag` | —                  | —             |
| Pan    | `pan`    | `app/tools.js` | view handlers                               | —                  | —             |
| Zoom   | `zoom`   | `app/tools.js` | view handlers                               | —                  | —             |
| Fit    | `fit`    | `app/tools.js` | `renderableBoundsOf`, `applyFittedCamera`   | —                  | —             |
| Move   | `move`   | `app/tools.js` | modify session                              | `drawing-state.js` | `renderer.js` |
| Rotate | `rotate` | `app/tools.js` | modify session, `rotateObject`              | `drawing-state.js` | `renderer.js` |
| Mirror | `mirror` | `app/tools.js` | modify session, `mirrorObjectAcrossLine`    | `drawing-state.js` | `renderer.js` |
| Trim   | `trim`   | `app/tools.js` | `trimObjectToBoundary`                      | `drawing-state.js` | `renderer.js` |
| Extend | `extend` | `app/tools.js` | `extendObjectToBoundary`                    | `drawing-state.js` | `renderer.js` |

---

## Geometry tools

| Tool         | Id             | Creation                    | Model              | Rendering     |
| ------------ | -------------- | --------------------------- | ------------------ | ------------- |
| Line         | `line`         | `beginOrCompleteGeometry`   | `drawing-state.js` | `renderer.js` |
| Polyline     | `polyline`     | polyline stages             | `drawing-state.js` | `renderer.js` |
| Triangle     | `triangle`     | polygon stages              | `drawing-state.js` | `renderer.js` |
| Polygon      | `polygon`      | `polygonFromCursor`         | `drawing-state.js` | `renderer.js` |
| Circle       | `circle`       | `beginOrCompleteGeometry`   | `drawing-state.js` | `renderer.js` |
| Arc          | `arc`          | `isArcTool` stages          | `drawing-state.js` | `renderer.js` |
| Rectangle    | `rectangle`    | `beginOrCompleteGeometry`   | `drawing-state.js` | `renderer.js` |
| Construction | `construction` | as Line, construction style | `drawing-state.js` | `renderer.js` |

Geometry **mathematics** (spans, anchors, intersections) is shared:
`js/core/geometry/measurement-core.js`.

---

## Reference tools

| Tool              | Id                  | Creation                | Notes                       |
| ----------------- | ------------------- | ----------------------- | --------------------------- |
| Coordinate System | `coordinate-system` | `add2DCoordinateSystem` | also `coordinate-system-2d` |
| Reference Point   | `reference-point`   | single-click placement  |                             |
| Reference Line    | `reference-line`    | as Line                 | asks **Length** on creation |
| Reference Arc     | `reference-arc`     | as Arc (3 points)       | asks **Radius** on creation |

A Reference Arc is a **true Arc** with construction styling — same
geometry, same snapping, same dimension behaviour. Its creation
definition is in `features/dimensions/creation-dimensioning.js`.

---

## Dimension tools

| Tool            | Id                | Notes                                 |
| --------------- | ----------------- | ------------------------------------- |
| Dimension       | `dimension`       | select references → **Enter** → place |
| Smart Dimension | `smart-dimension` | same engine; infers the measurement   |

**Shared system — one implementation:**

| Concern                                 | File                                           |
| --------------------------------------- | ---------------------------------------------- |
| Dimension data + measurement + geometry | `features/dimensions/dimension-model.js`       |
| Which measurement a selection means     | `features/dimensions/smart-dimension.js`       |
| Reference selection and placement       | `app/drawing.js`                               |
| Creation-time sizing popup              | `features/dimensions/creation-dimensioning.js` |
| Value editor                            | `features/dimensions/dimension-editor.js`      |
| Unit formatting                         | `core/units/quantities.js`                     |

**What a selection measures** (single click → **Enter**):

| Selection                                       | Result                      |
| ----------------------------------------------- | --------------------------- |
| Line, Beam, Truss, Cable, Shaft, Reference Line | Length                      |
| Circle                                          | Diameter                    |
| Arc, Reference Arc                              | Radius                      |
| Point + Point                                   | Distance                    |
| Line + Line                                     | Angle (parallel → distance) |
| Point + Line                                    | Perpendicular distance      |

---

## Statics tools

| Tool                                  | Id               | Creation                       | Model                                   | Rendering                     |
| ------------------------------------- | ---------------- | ------------------------------ | --------------------------------------- | ----------------------------- |
| Particle                              | `particle`       | single click                   | `drawing-state.js`                      | `renderer.js`                 |
| Rigid Body                            | `rigid-body`     | single click + shape           | `core/geometry/feature-geometry.js`     | `renderer.js`                 |
| Beam                                  | `beam`           | two clicks + **Length**        | `drawing-state.js`                      | `renderer.js`                 |
| Truss                                 | `truss`          | staged construction            | `drawing-state.js`                      | `renderer.js`                 |
| Cable                                 | `cable`          | two clicks + **Length**        | `drawing-state.js`                      | `renderer.js`                 |
| Shaft                                 | `shaft`          | two clicks + **Length**        | `drawing-state.js`                      | `renderer.js`                 |
| Point Force                           | `point-force`    | placement + vector drag        | `drawing-state.js`                      | `renderer.js` (shared vector) |
| Distributed Load                      | `load`           | body → start → end → magnitude | `features/analysis/load-profile.js`     | `renderer.js`                 |
| Varying Distributed Load              | `load` (varying) | as load, with profile points   | `features/analysis/load-profile.js`     | `renderer.js`                 |
| Applied Moment                        | `moment`         | body or free space             | `features/analysis/rotational-arrow.js` | `renderer.js`                 |
| Couple                                | `couple`         | single click                   | `features/analysis/rotational-arrow.js` | `renderer.js`                 |
| Pin / Roller / Fixed / Smooth Support | `support`        | attach to body                 | `drawing-state.js`                      | `renderer.js`                 |
| Pin / Fixed / Slider Connection       | `connection`     | attach to body                 | `drawing-state.js`                      | `renderer.js`                 |

**Length editing for Beam/Cable/Truss/Shaft** is one shared handler:
search `app/drawing.js` for `key === "length"`. It converts mm → world
units through `core/scale/dimensions.js` and moves the far end along the
member's own direction.

**Attachments** (supports, loads, moments) are stored as a **fraction
along their parent** — `core/geometry/body-frames.js`. That is why they
survive a resize.

---

## Derived Statics / Analysis tools

| Tool             | Id                       | Kind    | Values come from           |
| ---------------- | ------------------------ | ------- | -------------------------- |
| Resultant        | `resultant`              | derived | summed source forces       |
| Force Components | `force-components`       | derived | one source force           |
| SFD              | `shear-force-diagram`    | diagram | student's plot expressions |
| BMD              | `bending-moment-diagram` | diagram | student's plot expressions |
| AFD              | `axial-force-diagram`    | diagram | student's plot expressions |

| Concern                                   | File                                         |
| ----------------------------------------- | -------------------------------------------- |
| Derived value resolution and live updates | `features/analysis/analysis-dependencies.js` |
| Diagram expressions                       | `features/analysis/diagram-equations.js`     |
| Sketch editor                             | `ui/editors/sketch-editor.js`                |
| Plot editor                               | `ui/editors/plot-editor.js`                  |

Resultant and Force Components are **derived and read-only**: they update
from their source forces and cannot be edited into disagreeing with them.

---

## Annotation tools

| Concern                                        | File                                        |
| ---------------------------------------------- | ------------------------------------------- |
| Annotation model (text, placement, visibility) | `features/annotations/annotation-model.js`  |
| Magnitude boxes drawn on the canvas            | `app/drawing.js` (`appendDerivedMagnitude`) |
| Magnitude box hit-testing                      | `app/drawing.js` (`pickDerivedMagnitude`)   |
| Magnitude box dragging                         | `app/drawing.js` (`beginSelectionDrag`)     |
| Annotation rendering                           | `rendering/renderer.js`                     |

A magnitude annotation is a **drawing-space object linked to its source**:
it stores `sourceFeatureId`, position and visibility, never a copy of the
magnitude. It is independently selectable and draggable.

Formatting: magnitude + unit only. **Never an angle** — the arrow
communicates direction.

---

## Cross-cutting systems

| System                   | File                                 | Used by                                 |
| ------------------------ | ------------------------------------ | --------------------------------------- |
| Snapping + H/V inference | `core/snapping/object-snap.js`       | every tool                              |
| Unit formatting          | `core/units/quantities.js`           | dimensions, panels, annotations, popups |
| Universal Length Scale   | `core/scale/dimensions.js`           | every length                            |
| Document state + history | `core/model/drawing-state.js`        | everything                              |
| Shared vector arrow      | `rendering/renderer.js`              | forces, loads, resultants, analysis     |
| Shared panel controls    | `ui/feature-panel/property-panel.js` | every Feature Panel                     |
| Attachment frames        | `core/geometry/body-frames.js`       | supports, loads, moments                |

---

## Common questions

| Question                             | Answer                                                            |
| ------------------------------------ | ----------------------------------------------------------------- |
| Where is Beam creation?              | `js/app/tools.js` (registration) + `beam` in `js/app/drawing.js`  |
| Where is Beam's model?               | `js/core/model/drawing-state.js` (`geometryFactories.beam`)       |
| Where is Beam rendered?              | `js/rendering/renderer.js`                                        |
| Where is Beam's Feature Panel?       | the feature-panel section of `js/app/drawing.js`                  |
| Where is Beam's Length editing?      | search `key === "length"` in `js/app/drawing.js`                  |
| Where is Smart Dimension?            | `js/features/dimensions/smart-dimension.js` + `js/app/drawing.js` |
| Where is dimension measurement?      | `js/features/dimensions/dimension-model.js`                       |
| Where is the Universal Length Scale? | `js/core/scale/dimensions.js`                                     |
| Where is the per-sheet scale state?  | `js/sheets/sheets.js`                                             |
| Where is snapping?                   | `js/core/snapping/object-snap.js`                                 |
| Where is direct manipulation?        | `js/app/drawing.js` (drag lifecycle)                              |
| Where are magnitude annotations?     | `js/features/annotations/annotation-model.js`                     |
| Where is the vector renderer?        | `js/rendering/renderer.js`                                        |
| Where is save/load?                  | `js/file/`                                                        |
| Where are the sheets?                | `js/sheets/`                                                      |
| Where is the Analysis Editor?        | `js/ui/editors/`                                                  |
| Where is the Feature Panel?          | `js/ui/feature-panel/property-panel.js` + `js/app/drawing.js`     |
