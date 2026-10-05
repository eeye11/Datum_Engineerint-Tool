/*
 * New, Open, Save, Save As, Print and export, and crash recovery.
 */

import enggDrawingState from "../core/model/drawing-state.js";
import enggDrawingExport from "../file/document-export.js";
import enggDocumentFile from "../file/document-file.js";
import enggRecovery from "../file/document-recovery.js";
import enggFileSave from "../file/file-save.js";
import enggDrawingReference from "../references/drawing-reference.js";
import enggSheets from "../sheets/sheets.js";
import enggUi from "../ui/ui.js";
import { renderCurrentDrawing } from "./canvas-render.js";
import { drawingState, editorState } from "./editor-state.js";
import { renderProperties } from "./feature-panel.js";
import { activeSheet, loadSheetIntoEditor, notifyReferences, refreshSheetTabs, sheetById, syncActiveSheet, syncWorkspaceSettingToggles } from "./sheet-controller.js";
import { setToolMessage } from "./toolbar-render.js";
import { renderedBounds } from "./viewport.js";
import { emitDatumEvent } from "../api/events.js";

/*
 * File commands operate on the whole drawing, reusing
 * the existing serialisation and history systems.
 */
export const drawingFileNew =
    document.getElementById("drawingFileNew");

export const drawingFileOpen =
    document.getElementById("drawingFileOpen");

export const drawingFileSave =
    document.getElementById("drawingFileSave");

export function newDrawing() {
    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    drawingState.objects = [];

    /*
     * New is a new DOCUMENT, not a new sheet. The old document's
     * sheets are gone with it - keeping them would mean pressing New
     * silently copied every drawing the student had made into a fresh
     * untitled file, which is not what New means anywhere else.
     *
     * One blank sheet, with its own id, and it is active.
     */
    editorState.sheetCollection =
        enggSheets.createCollection();

    loadSheetIntoEditor(
        activeSheet()
    );

    enggDrawingState.clearSelection(
        drawingState
    );

    enggDrawingState.clearInteraction(
        drawingState
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previous
    );

    refreshSheetTabs();

    notifyReferences();

    /*
     * A new drawing has never been saved, so it has no file yet. The
     * next Save therefore asks for a name rather than quietly
     * overwriting whatever the previous drawing was called.
     */
    documentFileName = null;

    /*
     * A new document belongs to no file. Forgetting the handle is
     * what guarantees the first Save asks where the file should go
     * rather than quietly overwriting whatever was open before.
     */
    enggFileSave.forgetFileHandle();

    markDocumentDirty();

    setToolMessage(
        "New drawing"
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * The name of the file this document was last saved to, or null if
 * it has never been.
 *
 * A browser cannot write to a path the user did not choose, so Save
 * always produces a download. Remembering the name is what lets a
 * second Save do the obvious thing - offer the same file again -
 * rather than silently inventing "drawing.enggdraw" again, and it is
 * also what the dirty indicator and the unsaved-changes prompt
 * compare against.
 */
let documentFileName = null;

/*
 * Whether the document has changed since it was last saved.
 *
 * Tracked as a flag rather than inferred, because the things that
 * count as "the user changed something" - a moved handle, an edited
 * magnitude, a reversed load - go through many code paths, and each
 * of them marking the flag is the only way to be sure none is
 * missed.
 */
let documentDirty = false;

/*
 * Mark the document as having unsaved changes.
 *
 * Called from the one place every committed edit passes through, so
 * adding a feature, dragging a handle, typing a value, reversing a
 * load or editing a distribution point all count without each of
 * them having to remember.
 *
 * A recovery copy is scheduled at the same time. It is written after
 * a short pause rather than immediately, so a drag that mutates
 * geometry on every pointermove costs one write at the end of it
 * rather than one per frame.
 */
export function markDocumentDirty() {
    documentDirty = true;

    /*
     * The active sheet is written back here, not only when the user
     * switches away from it.
     *
     * Every committed edit in the application arrives at this one
     * function, so this is the only place that can be certain the
     * sheet holding the features is current. Doing it at the switch
     * instead would mean the sheet, the recovery copy and the dirty
     * flag were three views of the drawing that only agreed
     * sometimes - and a browser reload between an edit and a switch
     * would recover a drawing missing its most recent change.
     */
    syncActiveSheet();

    enggRecovery.schedule(
        serializeDocumentBody(),
        documentFileName
    );

    /*
     * A figure is rendered from the sheet, so an edit to the sheet is
     * a reason for any figure of it to be looked at again. Told from
     * here rather than from each edit path, for the same reason the
     * dirty flag is.
     */
    notifyReferences();

    emitDatumEvent("documentchange");
}

/*
 * Note that the document matches what is on disk.
 *
 * This also drops the recovery copy, because a saved document is
 * not lost work - leaving it behind would greet the user with a
 * "recovery" of something they already have.
 */
function markDocumentClean() {
    documentDirty = false;

    enggRecovery.discard();
}

function documentIsDirty() {
    return documentDirty;
}

function documentFile() {
    return documentFileName;
}

/*
 * The serialised document body, exactly as the state model holds it.
 *
 * This is the whole document: units, calibration, camera, every
 * object's real type, geometry, style, parent and parameters. The
 * format module wraps it; nothing here decides what the file is
 * called or how it is versioned.
 */
export function serializeDocumentBody() {
    /*
     * The editor holds the ACTIVE sheet, so it is written back before
     * the document is read. Saving is therefore exactly as accurate as
     * switching: whatever the user can see is what goes to the file,
     * and the sheet they were last looking at is the one that was
     * still being edited when they pressed Save.
     */
    syncActiveSheet();

    const body = JSON.parse(
        enggDrawingState.serializeDrawing(
            drawingState
        )
    );

    return {
        ...body,
        sheets: enggSheets.serializeCollection(
            editorState.sheetCollection
        ).sheets,
        activeSheetId: editorState.sheetCollection.activeSheetId
    };
}

/*
 * Hand the file to the browser as a download.
 *
 * The File System Access API is used when it is available, because
 * that is the only route that lets Save write back to the same file
 * the user already chose. Where it is not available the download
 * route is used, which always works and is what most browsers will
 * do.
 */
function downloadDocumentFile(name) {
    const fileName =
        enggDocumentFile.withExtension(
            name || documentFileName || "drawing"
        );

    const payload =
        enggDocumentFile.createDocument(
            serializeDocumentBody()
        );

    const blob =
        new Blob(
            [JSON.stringify(payload, null, 2)],
            { type: enggDocumentFile.MEDIA_TYPE }
        );

    const url =
        URL.createObjectURL(blob);

    const link =
        document.createElement("a");

    link.href = url;
    link.download = fileName;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    return fileName;
}

/*
 * Save the drawing to a .enggdraw file.
 *
 * With no file name yet, this asks for one. Once the document has
 * been saved, Save reuses that name, so the common case - open,
 * change, save - does the expected thing without a dialog.
 */
/*
 * Run an action, having first offered to save unsaved changes.
 *
 * Anything that replaces or abandons the current document - New,
 * Open, closing - has to ask before throwing work away. The three
 * answers are the conventional ones, and Cancel does nothing at
 * all, which is the only safe default: a user who is interrupted
 * must never find their drawing replaced because they pressed a key.
 *
 * The prompt is only shown when there is something to lose, so the
 * ordinary case of working in a new drawing is never interrupted.
 */
function confirmDiscardUnsavedChanges(action) {
    if (!documentIsDirty()) {
        action();

        return true;
    }

    const file =
        documentFile() || "this drawing";

    /*
     * Asked with the application's own dialog rather than the
     * browser's, for the same reason the save panel is native: this
     * is an interaction with the person using the application, and it
     * should look like the application. It also means the three
     * answers can be laid out properly rather than as a system
     * dialog's fixed buttons.
     */
    enggUi
        .confirmDialog(
            `${file} has unsaved changes.\n\n` +
            "Save before continuing?",
            {
                title: "Unsaved changes",
                confirm: "Save",
                cancel: "Don't Save"
            }
        )
        .then(async (saveFirst) => {
            if (!saveFirst) {
                return;
            }

            /*
             * Saved before leaving, and only then does the action run.
             * Cancelling the save panel therefore cancels the whole
             * operation rather than abandoning the drawing: nothing
             * is lost either way, and the student keeps what they
             * were working on.
             */
            const saved =
                await saveDrawing();

            if (saved) {
                action();
            }
        });

    /*
     * False because the action has NOT run yet - it runs when the
     * answer arrives. Open and New check this before doing anything
     * that would otherwise replace the drawing immediately.
     */
    return false;
}

/*
 * ========================================================
 * SAVING AS AN IMAGE
 * ========================================================
 *
 * There is no separate Export workflow. A student who wants a
 * PNG chooses Save As and picks the PNG type in the system panel;
 * the drawing is then rendered by the SAME renderer that draws the
 * canvas, and the bytes go straight into the file the panel named.
 *
 * That is why there is one image producer here and no export menu:
 * the format is decided once, by the Save As pipeline, and the
 * rendering is decided once, by this function.
 *
 * What the image contains is the DRAWING and only the drawing - the
 * renderer builds it from the model, not from a screenshot of the
 * editor, so no panel, cursor, snap marker, selection highlight or
 * half-finished preview can reach it. Selections are suppressed
 * because the export renders from a state whose selection is empty.
 */

/*
 * Every point the drawing is actually drawn through, across all of
 * its features.
 *
 * This is what an export is fitted to. It is the union of each
 * feature's RENDERED extent - force arrowheads, load arrows and
 * profiles, dimension text - rather than its stored geometry, so
 * nothing that is drawn can fall outside the image.
 */
function drawnBoundsPoints() {
    return renderedPointsForObjects(
        drawingState.objects
    );
}

/*
 * Every point a set of features is actually drawn through.
 *
 * The same measurement, for any set of features rather than only the
 * ones the editor has loaded. That is what lets a Drawing Reference
 * measure a sheet nobody is looking at: it asks for the rendered
 * extent of THAT sheet's features and gets the same answer an export
 * of it would give, because it is the same code doing the measuring.
 *
 * The zoom is the caller's to choose. The editor passes its own, so
 * the arrows of a load stand off its body by the size the user can
 * actually see. A reference passes nothing, because a reference
 * computes its own fit afterwards and wants the drawing's shape rather
 * than the size of whatever happens to be on screen.
 */
export function renderedPointsForObjects(objects, measuredAtZoom) {
    const points = [];

    /*
     * No camera is touched. The measurement scale is now a parameter
     * of renderedBounds, so a figure can be measured at zoom 1 for a
     * sheet the student happens to be looking at at 400% - without
     * borrowing, and having to put back, the editor's camera. That is
     * what makes the measurement independent rather than merely
     * self-restoring.
     */
    (objects || []).forEach((object) => {
        renderedBounds(
            object,
            measuredAtZoom
        ).forEach((point) => points.push(point));
    });

    return points;
}

/*
 * The document's name without its extension, which is what an image is
 * named after.
 *
 * An image of "Report.enggdraw" is "Report.png", not
 * "Report.enggdraw.png" - the image is a different kind of file of the
 * same drawing, not a second project file.
 */
function exportBaseName() {
    const current =
        documentFile() || "drawing";

    const suffix =
        `.${enggDocumentFile.EXTENSION}`;

    return current.toLowerCase().endsWith(
        suffix.toLowerCase()
    )
        ? current.slice(0, -suffix.length)
        : current;
}

/*
 * RENDER THE ACTIVE SHEET AS AN IMAGE, AS A BLOB.
 *
 * This is the one image producer in the application. Save As calls it
 * when the student picks PNG or JPG in the system panel; nothing else
 * renders an image, so a PNG and a JPG of the same drawing cannot
 * differ in what they show - only in how the finished pixels are
 * encoded.
 *
 * The drawing is rebuilt from the MODEL by the same renderer the canvas
 * uses, not captured from the screen. That is what guarantees the image
 * is a clean engineering snip: the renderer draws committed geometry and
 * the students' own content, and there is no code path by which a
 * toolbar, a Feature panel, a cursor, a snap label, a selection
 * highlight or an unfinished preview could be included.
 *
 * The bounds come from what is DRAWN - arrowheads, load profiles,
 * dimension text - rather than from stored geometry, so nothing that
 * reaches past its stored extent is cropped.
 *
 * Resolves to null when there is nothing to render, or the raster step
 * fails, so the caller reports an honest failure instead of writing an
 * empty file. Nothing about the document is touched either way.
 */
function renderSheetImageBlob(formatId) {
    return new Promise((resolve) => {
        if (!drawingState.objects.length) {
            resolve(null);
            return;
        }

        const jpg = formatId === "jpg";

        const image =
            enggDrawingExport.renderImage(
                drawingState,
                drawnBoundsPoints(),
                {
                    width: enggDrawingExport.DEFAULT_OUTPUT_PX,

                    /*
                     * JPG has no transparency, so it is laid down on
                     * white. PNG is left transparent outside the
                     * drawing, which is the more useful of the two for
                     * a line drawing.
                     */
                    background: jpg ? "#ffffff" : null
                }
            );

        if (!image) {
            resolve(null);
            return;
        }

        /*
         * The SVG the render produced is the source of the raster, so
         * the image is the same drawing rather than a second rendering
         * of it that might differ.
         */
        const dataUrl =
            new XMLSerializer()
                .serializeToString(image.svg);

        const encoded =
            `data:image/svg+xml;charset=utf-8,${encodeURIComponent(dataUrl)}`;

        const raster =
            new Image();

        raster.onload = () => {
            image.context.drawImage(
                raster,
                0,
                0,
                image.canvas.width,
                image.canvas.height
            );

            image.canvas.toBlob(
                (blob) => resolve(blob || null),
                jpg ? "image/jpeg" : "image/png",

                /*
                 * A quality that keeps dimension text and graph axes
                 * readable. High enough for engineering use, not so
                 * high that a large sheet becomes an enormous file.
                 */
                0.92
            );
        };

        raster.onerror = () => resolve(null);

        raster.src = encoded;
    });
}

/*
 * Print the drawing.
 *
 * Print uses the same clean render as the image exports, for the
 * same reasons: the printed page must contain the DRAWING, not a
 * photograph of the application. The browser's own print dialog is
 * then given an image that has already been fitted to the drawing's
 * bounds, so what comes out cannot be cropped by the current zoom
 * or by the size of the editor window.
 */
function printDrawing() {
    if (
        !drawingState.objects.length
    ) {
        setToolMessage(
            "There is nothing to print"
        );

        return;
    }

    const image =
        enggDrawingExport.renderImage(
            drawingState,
            drawnBoundsPoints(),
            {
                width: enggDrawingExport.DEFAULT_OUTPUT_PX,
                background: "#ffffff"
            }
        );

    if (!image) {
        return;
    }

    const dataUrl =
        image.canvas.toDataURL(
            "image/png"
        );

    /*
     * A window holding only the rendered drawing. It is opened with
     * no toolbars or chrome, and its document is the image, so the
     * system print dialog describes a page containing the drawing
     * alone. The editor is untouched behind it and the window
     * closes itself once printing is done.
     */
    const printWindow =
        window.open("", "_blank");

    if (!printWindow) {
        setToolMessage(
            "Allow pop-ups to print the drawing"
        );

        return;
    }

    printWindow.document.write(
        `<!DOCTYPE html><html><head><title>Print</title>` +
        `<style>` +
        `html,body{margin:0;padding:0;background:#fff;}` +
        `img{display:block;width:100%;height:auto;}` +
        `@page{margin:10mm;}` +
        `</style></head><body>` +
        `<img src="${dataUrl}" alt="Drawing">` +
        `</body></html>`
    );

    printWindow.document.close();

    /*
     * The image has to be laid out before print is called, or the
     * page is still empty when the dialog reads it.
     */
    printWindow.addEventListener("load", () => {
        printWindow.focus();
        printWindow.print();
    });

    setToolMessage(
        "Prepared the drawing for printing"
    );
}

/*
 * Save the drawing.
 *
 * Where the browser gave us a handle to a file, this writes straight
 * back to it: no panel, no name, and no way for the document to end up
 * in two places. Where it has not - a document that has never been
 * saved, or a browser without the handle API - the Save As flow runs
 * instead, because there is nothing to write back to.
 */
export async function saveDrawing() {
    const saved =
        await enggFileSave.save(
            serializeDocumentBody()
        );

    if (!saved) {
        /*
         * Nowhere to save back to. Save As is not a lesser thing
         * here - it is the only thing that can happen - so it is run
         * rather than reported.
         */
        await saveDrawingAs();

        return;
    }

    documentFileName = saved;

    markDocumentClean();

    setToolMessage(`Saved ${saved}`);
}

/*
 * Save to a chosen name, location and format.
 *
 * The name, the folder and the FORMAT are the user's to choose, and the
 * panel that offers them is the operating system's own, so this behaves
 * the way saving from any other application does.
 *
 * The document's identity changes only once a DOCUMENT file has actually
 * been written. Saving a PNG does not make the document "be" a PNG, so
 * an image save leaves the document's name and handle exactly as they
 * were - cancelling the panel, or a disk that refuses, likewise leaves
 * the document as it was.
 *
 * SAVING IS NOT AN EDIT. Nothing here touches the undo history: the
 * document is written, not changed, so there is nothing to undo and no
 * entry is added.
 */
async function saveDrawingAs() {
    const result =
        await enggFileSave.saveAs(
            serializeDocumentBody(),
            suggestedFileName(),
            {
                /*
                 * The image producer, handed in rather than reached for.
                 * file-save writes the bytes; this is what makes them,
                 * from the same renderer the canvas uses. It is called
                 * only when the chosen format is an image.
                 */
                renderImage: renderSheetImageBlob
            }
        );

    /* Cancelled. Nothing happened, so nothing is reported or changed. */
    if (!result) {
        return;
    }

    if (result.error) {
        /*
         * A real failure - an empty drawing, or a render that could not
         * produce pixels. Reported honestly, and the document keeps its
         * old name and path so a retry goes to the same place.
         */
        setToolMessage(result.error);

        return;
    }

    /*
     * ONLY A DOCUMENT SAVE ADOPTS THE NAME.
     *
     * An image is a copy of the drawing, not the document itself, so
     * the document keeps its own file name and stays marked clean -
     * saving a picture is a completed action, not an unsaved edit.
     */
    if (!result.image) {
        documentFileName = result.name;

        markDocumentClean();

        setToolMessage(`Saved ${result.name}`);

        return;
    }

    setToolMessage(`Saved ${result.name}`);
}

/*
 * The name offered by the save panel.
 *
 * The current file's own name when the document has one, so that Save
 * As starts where the document already lives rather than at a generic
 * default. Saving a correction should suggest the file being
 * corrected, not "drawing".
 */
function suggestedFileName() {
    return enggDocumentFile.withExtension(
        documentFileName || "drawing"
    );
}

/*
 * Open a .enggdraw file.
 *
 * Reading is separated from applying on purpose. The format module
 * decides whether a file can be opened and, if so, what it should
 * become; only once it has answered both does anything here touch
 * the live document. That is what makes a bad file harmless: a
 * file that is not a drawing, or is from a newer build, or is
 * corrupt, is refused BEFORE the open document has been touched, so
 * the drawing the user already has is still there afterwards.
 *
 * Loading then goes through the same state model as a drawing built
 * in this session, so every feature comes back as its real type with
 * its real parameters, and the Feature Tree, Features panel, snapping
 * and manipulation all work on it without any special handling.
 */
export function loadDrawing(
    payload,
    fileName
) {
    const result =
        enggDocumentFile.readDocument(
            payload
        );

    if (!result.ok) {
        /*
         * The reason is shown rather than a generic failure,
         * because the user's next action depends entirely on which
         * of these it is: a wrong file needs choosing again, an old
         * one needs a different tool, and a future one needs a newer
         * EnggDraw.
         */
        setToolMessage(
            result.detail
        );

        window.alert(
            result.detail
        );

        return false;
    }

    const data = result.document;

    if (
        !Array.isArray(data.objects) &&
        !Array.isArray(data.sheets)
    ) {
        const detail =
            "The file is an EnggDraw drawing but " +
            "contains no features.";

        setToolMessage(detail);
        window.alert(detail);

        return false;
    }

    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    /*
     * The document's own settings, not just its features. Units and
     * calibration travel with the drawing because a length in a file
     * means nothing without them.
     *
     * Applied to the state, not to the collection: these are settings
     * of the whole document - the unit every length on every sheet is
     * in - rather than of any one drawing.
     */
    enggDrawingState.restoreDocument(
        drawingState,
        data
    );

    /*
     * The sheets. This REPLACES the collection rather than merging
     * into it, because opening a file is opening a document: whatever
     * was open before is not part of this one. The format module has
     * already repaired the list - a file always arrives with at least
     * one sheet and with unique ids - so what is loaded here can be
     * trusted without further checking.
     */
    editorState.sheetCollection =
        enggSheets.createCollection({
            sheets: data.sheets,
            activeSheetId: data.activeSheetId
        });

    /*
     * The sheet the user was last on goes into the editor, and it is
     * that sheet - not the document - that decides what the editor
     * shows: its features, its camera, its grid, its snapping.
     *
     * Reopening a file therefore puts the student back exactly where
     * they were, at the zoom they were working at, with the grid in
     * the state they had set on that particular sheet.
     */
    loadSheetIntoEditor(activeSheet());

    /*
     * MAKE THE ANALYSIS OBJECTS TRUE AGAIN, RATHER THAN TRUSTING
     * WHAT WAS SAVED.
     *
     * The dependencies are saved - which source each object reads
     * from - but the geometry derived FROM them is not, and must not
     * be: a saved components arrow is a snapshot of what a force
     * looked like once, and reloading it blindly would show a drawing
     * whose analysis objects quietly describe forces that have since
     * been edited. So the associations are restored from the file and
     * the values are recomputed from the sources as they are now.
     *
     * This is the difference between an analysis object being a
     * reading and being a copy, and it is why opening a file cannot
     * produce a diagram that disagrees with the beam above it.
     */
    enggDrawingState.refreshAnalysisObjects(
        drawingState
    );

    syncWorkspaceSettingToggles();

    enggDrawingState.commitDrawingChange(
        drawingState,
        previous
    );

    /*
     * An opened document is clean: it matches the file it came from.
     * A migrated file is also clean, because what was written and
     * what is now open describe the same drawing.
     */
    if (fileName) {
        documentFileName =
            enggDocumentFile.withExtension(
                fileName
            );
    }

    markDocumentClean();

    refreshSheetTabs();

    notifyReferences();

    setToolMessage(
        result.migratedFrom &&
        result.migratedFrom !==
            enggDocumentFile.CURRENT_VERSION
            ? `Opened ${documentFileName || "drawing"} (upgraded from version ${result.migratedFrom})`
            : `Opened ${documentFileName || "drawing"}`
    );

    renderProperties();
    renderCurrentDrawing();

    return true;
}

/*
 * Choose a .enggdraw file and open it.
 *
 * The file is read and validated before anything is applied, so a
 * file that cannot be opened leaves the current drawing untouched -
 * see loadDrawing, which is where that guarantee is made.
 */
export function openDrawing() {
    const input =
        document.createElement("input");

    input.type = "file";
    input.accept = `.${enggDocumentFile.EXTENSION},${enggDocumentFile.MEDIA_TYPE},application/json`;

    input.addEventListener("change", () => {
        const file =
            input.files && input.files[0];

        if (!file) {
            return;
        }

        /*
         * Opening replaces the current drawing, so it asks
         * about unsaved changes first - before the file is even
         * read, so a file that then turns out to be unreadable
         * has cost the user nothing.
         */
        if (
            !confirmDiscardUnsavedChanges(
                () => {}
            )
        ) {
            input.value = "";

            return;
        }

        /*
         * Opened through showOpenFilePicker where the browser has it.
         *
         * The picker returns a handle as well as the file, and the
         * handle is kept: it is how a later Save writes back to the
         * file that was opened rather than producing a copy. The
         * input-element route below is the fallback for browsers
         * without it, and there a handle genuinely does not exist, so
         * Save falls back to asking - which is the honest behaviour
         * rather than a hidden failure.
         */
        if (
            typeof window.showOpenFilePicker ===
            "function"
        ) {
            window
                .showOpenFilePicker({
                    /*
                     * The same file types Save As offers, so what can be
                     * opened and what can be saved are one list. It is
                     * the array the module returns - not wrapped again,
                     * which would hand the picker a nested list it
                     * cannot read.
                     */
                    types: enggFileSave.fileTypes(),
                    multiple: false
                })
                .then(async (handles) => {
                    const handle = handles[0];

                    if (!handle) {
                        return;
                    }

                    const opened =
                        await handle.getFile();

                    const text =
                        await opened.text();

                    let parsed = null;

                    try {
                        parsed =
                            JSON.parse(text);
                    } catch (error) {
                        setToolMessage(
                            "That file could not be " +
                            "read. It may be damaged, " +
                            "or it may not be an " +
                            "EnggDraw drawing."
                        );

                        return;
                    }

                    if (
                        loadDrawing(
                            parsed,
                            opened.name
                        )
                    ) {
                        enggFileSave.setFileHandle(
                            handle
                        );
                    }
                })
                .catch(() => {
                    /*
                     * Cancelled. The current drawing is untouched,
                     * which is what closing a panel should mean.
                     */
                });

            return;
        }

        const reader =
            new FileReader();

        reader.addEventListener("load", () => {
            let parsed = null;

            try {
                parsed = JSON.parse(
                    String(reader.result)
                );
            } catch (error) {
                const detail =
                    "That file could not be read. " +
                    "It may be damaged, or it may not " +
                    "be an EnggDraw drawing.";

                setToolMessage(detail);
                window.alert(detail);

                return;
            }

            loadDrawing(parsed, file.name);
        });

        reader.readAsText(file);
    });

    input.click();
}

/*
 * The File menu's actions, in one place.
 *
 * The menu and the keyboard shortcuts both go through this table, so
 * a command cannot exist on the menu and behave differently from the
 * same key. It also means adding a file command is a single entry
 * rather than a button and a handler that have to be kept in step.
 */
export const FILE_ACTIONS = {
  new() {
    /*
     * Both the menu and the shortcut go through the unsaved-changes
     * guard, so New always offers to save first.
     */
    confirmDiscardUnsavedChanges(newDrawing);
  },
  open() {
    openDrawing();
  },
  save() {
    saveDrawing();
  },
  "save-as"() {
    saveDrawingAs();
  },
  print() {
    printDrawing();
  }
};

/*
 * Offer the user a recovery copy, if there is one worth offering.
 *
 * Asked once, when the drawing workspace opens, and only when there
 * is genuinely something to rescue. Declining discards it, so a
 * user who does not want it is not asked again next time - and, just
 * as importantly, a stale copy of a drawing they have since finished
 * does not reappear as a warning weeks later.
 */
export function offerRecoveryIfAvailable() {
    const record =
        enggRecovery.describe();

    if (!record) {
        return false;
    }

    const features =
        record.features === 1
            ? "1 feature"
            : `${record.features} features`;

    const when =
        record.when
            ? `\n\nLast edited ${record.when}`
            : "";

    const answer = window.confirm(
        "EnggDraw found unsaved work from a previous " +
        `session (${features})${when}.\n\n` +
        "Recover it?"
    );

    if (!answer) {
        enggRecovery.discard();

        return false;
    }

    /*
     * Recovery goes through the same loader as opening a file, so
     * what comes back is a real document rather than a special
     * half-restored state.
     */
    const stored = enggRecovery.read();

    if (!stored) {
        return false;
    }

    return loadDrawing(
        {
            /*
             * The stored copy is already a document body. It is
             * wrapped in the same envelope a file carries and read
             * back through the same loader, so a recovered drawing
             * is version-checked and migrated exactly as an opened
             * file would be - there is no second, less careful path
             * for recovered work.
             */
            format: "enggdraw",
            version: enggDocumentFile.CURRENT_VERSION,
            document: stored.document
        },
        stored.fileName || undefined
    );
}

/*
 * Wire this part of the editor to the page. Called once, at start-up,
 * by editor/index.js.
 */
export function installDocumentCommands() {
    /*
     * Tell the state model that the controller owns the document's file
     * and dirty state, so it can report every committed edit.
     */
    enggDrawingState.setDocumentChangedHandler(
        markDocumentDirty
    );

    /*
     * Tell the export module what the editor draws.
     *
     * The editor is the only place that knows how far a force's
     * arrowhead reaches past its stored end, or how far a load's arrows
     * stand off its body, so it supplies that to the export. Registering
     * it once here means every export - PNG, JPG, SVG, Print - is fitted
     * to the same extent the editor draws, and none of them can crop a
     * feature the editor itself shows.
     */
    enggDrawingExport.setBoundsProvider(
        drawnBoundsPoints
    );

    /*
     * Teach the reference system where sheets are and how a feature is
     * measured.
     *
     * Registered here, beside the bounds provider above, because this is
     * the only place that holds both. The reference module itself knows
     * nothing about the document model - it is handed a way to find a
     * sheet and a way to measure it - which is what keeps it reusable and
     * keeps the written solution from having to understand drawings.
     */
    enggDrawingReference.configure({
        getSheet: sheetById,

        /*
         * Measured at zoom 1, explicitly.
         *
         * A figure is a statement about the DRAWING, not about the view,
         * so it must not change size when the student zooms in on a
         * detail in the editor. Saying so here rather than leaving it to
         * whatever the camera happens to be is what makes that true.
         */
        getRenderedPoints: (objects) =>
            renderedPointsForObjects(objects, 1)
    });
}
