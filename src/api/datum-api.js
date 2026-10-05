/*
 * ============================================================
 * THE DATUM INTEGRATION API
 * ============================================================
 *
 * This is the one supported way for other tools - the OCR pipeline, the
 * autograder, a course platform - to work with Datum. Everything else in
 * src/ is internal and may change without notice; this module is versioned
 * (API_VERSION) and documented in docs/INTEGRATION.md.
 *
 * WHAT DATUM HOLDS
 * ----------------
 * A student's submission has two halves:
 *
 *   - the WRITTEN SOLUTION, a LaTeX source (typically produced by the OCR
 *     tool from the handwritten page and corrected by the student), and
 *   - the DRAWINGS, one per sheet of the Datum document.
 *
 * The written solution places a drawing with a reference token,
 * [DRAWING_REFERENCE:<sheetId>]. The token names a sheet, not a picture,
 * so the figure always shows the sheet's current contents.
 *
 * WHAT THE API OFFERS
 * -------------------
 *   getDocument()               the whole document, as a .enggdraw file object
 *   loadDocument(file)          replace the document with a .enggdraw file
 *   listSheets()                [{ id, name }] in document order
 *   renderSheetSvg(id, options) one sheet drawn as standalone SVG markup
 *   getSolution()               the LaTeX source and the references in it
 *   setSolution(latex)          replace the LaTeX source and re-render
 *   on(event, listener)         "documentchange" | "solutionchange"
 *
 * Every result is plain, JSON-safe data, so the same calls work in the
 * page (window.datum) and across an iframe (src/api/embed-bridge.js).
 */
import enggDocumentFile from "../file/document-file.js";
import enggDrawingReference from "../references/drawing-reference.js";
import { enggDrawingSheets } from "../editor/index.js";
import { loadDrawing } from "../editor/document-commands.js";
import { render as renderSolution } from "../solution/written-references.js";
import { onDatumEvent } from "./events.js";

/*
 * The API's own version. It changes only when a call is removed or its
 * result changes shape; new calls do not change it.
 */
export const API_VERSION = 1;

function solutionSource() {
    return document.getElementById("writingCode");
}

/* The whole document, exactly as Save would write it. */
function getDocument() {
    return JSON.parse(JSON.stringify(
        enggDocumentFile.createDocument(enggDrawingSheets.serializeDocumentBody())
    ));
}

/*
 * Replace the document with a .enggdraw file: the parsed object, or its
 * JSON text. Older file versions are migrated; a file that is not a Datum
 * document is refused and the current document is left as it was.
 */
function loadDocument(file) {
    let parsed = file;

    if (typeof file === "string") {
        try {
            parsed = JSON.parse(file);
        } catch {
            return { ok: false, failure: enggDocumentFile.Failure.NOT_JSON, detail: "The text is not JSON." };
        }
    }

    const checked = enggDocumentFile.readDocument(parsed);

    if (!checked.ok) {
        return { ok: false, failure: checked.failure, detail: checked.detail };
    }

    return loadDrawing(parsed) === false
        ? { ok: false, detail: "The document could not be loaded." }
        : { ok: true };
}

function listSheets() {
    return enggDrawingSheets.all().map(sheet => ({ id: sheet.id, name: sheet.name }));
}

/*
 * One sheet drawn as standalone SVG markup, fitted to its contents - the
 * same rendering the written solution and the image export use.
 *
 * options: { width, height, caption } (all optional)
 * result:  { ok: true, svg, width, height }
 *        | { ok: false, reason: "missing-sheet" | "unmeasured" | "empty" | ... }
 */
function renderSheetSvg(sheetId, options = {}) {
    const rendered = enggDrawingSheets.renderReference(sheetId, options);

    if (!rendered || !rendered.ok || !rendered.svg) {
        return { ok: false, reason: rendered?.reason || (rendered?.empty ? "empty" : "not-rendered"), sheetId };
    }

    return {
        ok: true,
        sheetId,
        // XMLSerializer writes a standalone SVG document, namespace included.
        svg: new XMLSerializer().serializeToString(rendered.svg),
        width: rendered.bounds?.width ?? null,
        height: rendered.bounds?.height ?? null
    };
}

/* The written solution's LaTeX source, and the drawings it references. */
function getSolution() {
    const latex = solutionSource()?.value || "";

    return {
        latex,
        references: enggDrawingReference.parseReferences(latex).map(reference => ({
            sheetId: reference.sheetId,
            sheetName: enggDrawingSheets.sheetById(reference.sheetId)?.name ?? null
        }))
    };
}

/* Replace the written solution's LaTeX source, and render it. */
function setSolution(latex) {
    const source = solutionSource();

    if (!source) {
        return { ok: false, detail: "The written solution is not on this page." };
    }

    source.value = String(latex ?? "");
    renderSolution();

    return { ok: true };
}

/*
 * Subscribe to a change. Returns a function that unsubscribes.
 *
 *   "documentchange"   a drawing, sheet or document setting changed
 *   "solutionchange"   the LaTeX source was edited
 */
function on(event, listener) {
    return onDatumEvent(event, listener);
}

export function createDatumApi() {
    return Object.freeze({
        API_VERSION,
        documentVersion: enggDocumentFile.CURRENT_VERSION,
        getDocument,
        loadDocument,
        listSheets,
        renderSheetSvg,
        getSolution,
        setSolution,
        on
    });
}
