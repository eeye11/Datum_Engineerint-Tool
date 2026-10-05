/*
 * BROWSER-AUTOMATION HANDLES.
 *
 * Browser tests (tests/e2e) and the QA scripts (tools/qa) drive the
 * running page and need to read its state: the document model, the sheets,
 * the export pipeline. Before the move to ES modules every module was a
 * window global, so they simply read window.enggDrawing and friends. These
 * handles keep exactly those names available for that tooling.
 *
 * This is not an integration API. Code that embeds Datum or exchanges
 * documents with it should use src/api/ instead, which is versioned and
 * documented; these names may change whenever the internals do.
 */
import enggDocumentFile from "../file/document-file.js";
import enggDrawingExport from "../file/document-export.js";
import enggDrawingReference from "../references/drawing-reference.js";
import enggDrawingRenderer from "../rendering/renderer.js";
import enggDrawingState from "../core/model/drawing-state.js";
import enggSheets from "../sheets/sheets.js";
import enggWrittenReferences from "../solution/written-references.js";
import { enggDrawing, enggDrawingSheets } from "../editor/drawing.js";

export function installAutomationHooks(target = window) {
    Object.assign(target, {
        enggDocumentFile,
        enggDrawing,
        enggDrawingExport,
        enggDrawingReference,
        enggDrawingRenderer,
        enggDrawingSheets,
        enggDrawingState,
        enggSheets,
        enggWrittenReferences
    });
}
