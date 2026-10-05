/*
 * Datum - standalone application entry point.
 *
 * index.html loads this one module; everything else is reached through
 * imports. Most modules only define things, but a few wire themselves to
 * the page when they load (the toolbar, the sheet tabs, the drawing
 * controller, the written solution), so they are imported here in the same
 * order the page used to list its <script> tags. That keeps their start-up
 * side effects in the order the application was built and tested with.
 */
import "./app/tabs.js";
import "./editor/tools.js";
import "./sheets/sheets.js";
import "./ui/ui.js";
import "./core/geometry/measurement-core.js";
import "./core/units/quantities.js";
import "./ui/feature-panel/property-panel.js";
import "./features/dimensions/dimension-model.js";
import "./features/annotations/annotation-model.js";
import "./features/dimensions/smart-dimension.js";
import "./core/model/drawing-state.js";
import "./file/document-file.js";
import "./file/file-save.js";
import "./file/document-export.js";
import "./file/document-recovery.js";
import "./core/scale/dimensions.js";
import "./core/scale/scale-calibration.js";
import "./core/geometry/feature-geometry.js";
import "./features/dimensions/creation-dimension.js";
import "./features/dimensions/creation-dimensioning.js";
import "./features/dimensions/dimension-editor.js";
import "./features/analysis/load-profile.js";
import "./core/selection/clipboard.js";
import "./features/analysis/rotational-arrow.js";
import "./core/geometry/body-frames.js";
import "./features/analysis/analysis-dependencies.js";
import "./features/analysis/diagram-equations.js";
import "./ui/editors/plot-editor.js";
import "./ui/editors/sketch-editor.js";
import "./core/geometry/feature-handles.js";
import "./rendering/renderer.js";
import "./core/snapping/object-snap.js";
import "./references/drawing-reference.js";
import "./sheets/sheet-tabs.js";
import "./editor/index.js";
import "./editor/toolbar.js";
import "./solution/written-references.js";
import "./solution/writing-tab.js";
import { installAutomationHooks } from "./app/automation-hooks.js";
import { createDatumApi } from "./api/datum-api.js";
import { installEmbedBridge } from "./api/embed-bridge.js";

installAutomationHooks();

/*
 * The integration API (docs/INTEGRATION.md): window.datum for scripts in
 * this page, and the postMessage bridge for a page that embeds this one
 * (active only when the embedding origin is named in the URL).
 */
const datum = createDatumApi();

window.datum = datum;
installEmbedBridge(datum);
