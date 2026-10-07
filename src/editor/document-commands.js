/*
 * New, Open, Save, Save As, Print and export, and crash recovery.
 */

import enggDrawingState from "../core/model/drawing-state.js";
import enggErrorLog from "../app/error-log.js";
import enggDrawingExport from "../file/document-export.js";
import enggDocumentFile from "../file/document-file.js";
import enggRecovery from "../file/document-recovery.js";
import enggFileSave from "../file/file-save.js";
import enggRecentFiles from "../file/recent-files.js";
import enggTemplates from "../file/templates.js";
import enggDrawingReference from "../references/drawing-reference.js";
import enggSheets from "../sheets/sheets.js";
import enggOpenPopup from "../ui/open-popup.js";
import enggUi from "../ui/ui.js";
import { renderCurrentDrawing } from "./canvas-render.js";
import { drawingState, editorState } from "./editor-state.js";
import { renderProperties } from "./feature-panel.js";
import { activeSheet, loadSheetIntoEditor, notifyReferences, refreshSheetTabs, sheetById, syncActiveSheet, syncWorkspaceSettingToggles } from "./sheet-controller.js";
import { setToolMessage } from "./toolbar-render.js";
import { renderedBounds, isFittableObject, renderableBoundsOf } from "./viewport.js";
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

    refreshDocumentTitle();

    /*
     * A new document belongs to no file. Forgetting the handle is
     * what guarantees the first Save asks where the file should go
     * rather than quietly overwriting whatever was open before.
     */
    enggFileSave.forgetFileHandle();

    /*
     * A BLANK NEW DOCUMENT HAS NO UNSAVED CHANGES.
     *
     * New replaces the document with an empty one. There is nothing on it for
     * the user to have changed, so it is not dirty - and it must not be, or a
     * student who presses New and then immediately presses Open is asked about
     * unsaved work they never made. Marking it dirty also meant every fresh
     * session began "unsaved", so the very first Open always interrupted.
     *
     * The document still has no file, which is a separate fact from being
     * unsaved: the next Save asks for a name because there is no name yet, not
     * because there is something to lose.
     */
    markDocumentClean();

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
 * Whether the document is being LOADED right now.
 *
 * Loading a file reconstructs sheets, features and relationships through
 * exactly the same code paths a person's edits use - a collection is
 * replaced, a sheet is created, an object is pushed. Several of those paths
 * report "the document changed", because when a PERSON causes them that is
 * true. During a load it is not: the document is being MADE to match a file,
 * not edited.
 *
 * Without this flag the last thing a load did was often to mark the
 * document dirty, so a file that had just been opened was treated as having
 * unsaved changes - and the next Open or New then interrupted the user with
 * a prompt about work they had not done. The flag makes document restoration
 * distinguishable from a user edit, which is the distinction the dirty
 * state is supposed to represent.
 */
let documentLoading = false;

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
    /*
     * A LOAD IS NOT AN EDIT.
     *
     * While a file is being reconstructed, the state-update code that
     * normally means "the user changed something" runs as a side effect of
     * building the document. Marking the document dirty here would mean an
     * opened file arrived already unsaved, which is precisely the false
     * prompt this state exists to prevent. A load clears the flag at the
     * end, so nothing is lost by ignoring these notifications.
     */
    if (documentLoading) {
        return;
    }

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

/*
 * Exposed for tests and the recovery prompt: the document's unsaved state and
 * whether a load is currently in progress. These are read-only views of the
 * one flag the editor owns; nothing outside this module may set it.
 */
export function documentHasUnsavedChanges() {
    return documentIsDirty();
}

export function documentIsLoading() {
    return documentLoading;
}

/*
 * Begin and end a document load.
 *
 * Between these two calls every state update is treated as reconstruction
 * rather than as a user edit, so nothing marks the document dirty. The pair
 * is deliberately narrow: only the code that puts a file into the editor
 * uses it, and it always closes with the document clean.
 */
function beginDocumentLoad() {
    documentLoading = true;
}

function endDocumentLoad() {
    documentLoading = false;

    markDocumentClean();
}

function documentFile() {
    return documentFileName;
}

/*
 * Show the current document's file name in the window title.
 *
 * The window's title is the one place a web application's current document is
 * named, and keeping it in step is what lets a student tell at a glance which
 * drawing is open. A document that has never been saved is named "Untitled",
 * matching the file it does not yet have.
 */
function refreshDocumentTitle() {
    document.title = documentFileName
        ? `${documentFileName} - Datum`
        : "Untitled - Datum";
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
 * Run an action, having first offered to save unsaved changes.
 *
 * Anything that replaces or abandons the current document - New, Open,
 * closing - has to ask before throwing work away. The three answers are the
 * conventional ones, and Cancel does nothing at all, which is the only safe
 * default: a user who is interrupted must never find their drawing replaced
 * because they pressed a key.
 *
 * The prompt is only shown when there is something to lose, so the ordinary
 * case of working in a new drawing - or of opening a file right after saving -
 * is never interrupted.
 *
 *   Save First        save the current drawing, then run the action. If the
 *                     save is cancelled or fails, the action does NOT run.
 *   Discard Changes   throw away the unsaved edits, then run the action. No
 *                     file is deleted: what is discarded is the in-memory
 *                     document's unsaved state, not anything on disk.
 *   Cancel            close the dialog and do nothing.
 *
 * Returns a promise resolving to whether the action ran. A caller that needs
 * to know - a test, or a second step that depends on it - can await it; the
 * menu can ignore it.
 */
function confirmDiscardUnsavedChanges(action) {
    if (!documentIsDirty()) {
        action();

        return Promise.resolve(true);
    }

    const file =
        documentFile() || "this drawing";

    /*
     * Asked with the application's own dialog rather than the browser's, for
     * the same reason the save panel is native: this is an interaction with
     * the person using the application, and it should look like the
     * application. It also means the three distinct answers can be laid out
     * as the three distinct choices they are.
     */
    return enggUi
        .choiceDialog(
            `${file} has unsaved changes.\n\n` +
            "Save before continuing?",
            {
                title: "Unsaved changes",

                buttons: [
                    {
                        id: "save",
                        label: "Save First",
                        primary: true
                    },
                    {
                        id: "discard",
                        label: "Discard Changes"
                    },
                    {
                        id: "cancel",
                        label: "Cancel",
                        dismiss: true
                    }
                ]
            }
        )
        .then(async (choice) => {
            if (choice === "cancel" || !choice) {
                return false;
            }

            if (choice === "save") {
                /*
                 * Saved before leaving, and only then does the action run.
                 * Cancelling the save panel therefore cancels the whole
                 * operation rather than abandoning the drawing: nothing is
                 * lost either way, and the student keeps what they were
                 * working on.
                 */
                const saved =
                    await saveDrawing();

                if (!saved) {
                    return false;
                }
            } else {
                /*
                 * DISCARD MEANS THE UNSAVED EDITS ARE GONE.
                 *
                 * The user has said the changes made since the last save are
                 * not wanted. The in-memory document is therefore marked clean
                 * BEFORE the action runs, so the decision is recorded once and
                 * is not asked about again - a destructive operation that is
                 * guarded must not raise the same prompt a second time.
                 *
                 * Only the in-memory dirty state is discarded. No file is
                 * deleted, and the saved .enggdraw on disk is untouched.
                 */
                markDocumentClean();
            }

            action();

            return true;
        });
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
/*
 * Every point an export of the CURRENT sheet is fitted to.
 *
 * Callable with a set of features and a zoom, so anything measuring a STORED or
 * non-active sheet - a thumbnail, a template card, a written-solution figure -
 * asks the same question through the same code. With no arguments it measures
 * the open sheet at the editor's own zoom, which is what Fit and Print want.
 */
function drawnBoundsPoints(objects, zoom) {
    return renderedPointsForObjects(
        objects || drawingState.objects,
        zoom
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
 * Print and Fit are the same question about the same drawing: what is
 * on the sheet, and how big is it? So Print does not carry its own
 * answer. It asks the same bounds calculation Fit uses - the fittable
 * features of the active sheet, measured as DRAWN rather than as
 * stored - and fits them with the SAME shared fit engine
 * (`fitBoundsIntoViewport`) rather than a private one, so the two
 * can never disagree about what the drawing contains or how it is
 * framed. Whatever Fit would show, Print prints.
 *
 * The fitted drawing is then rendered clean by the shared export
 * pipeline - no panels, no cursor, no selection handles, no snap
 * markers, no unfinished preview - and handed to the browser's own
 * print dialog as an SVG page. SVG rather than a raster image is what
 * keeps the print independent of zoom, window size and device pixel
 * ratio: the page is described in its own coordinates and scaled by
 * the printer.
 *
 * Nothing about the editor is changed: the camera, selection,
 * interaction and undo history are exactly as they were afterwards.
 */
function printDrawing() {
    /*
     * The same features Fit Whole Page would act on: every visible
     * object on the ACTIVE SHEET. Hidden features are excluded by the
     * same predicate Fit uses, so a feature the student has turned off
     * does not silently reappear on paper - and a sheet whose features
     * are all hidden is answered as the empty sheet it effectively is,
     * rather than printing nothing or failing.
     */
    const fittableObjects =
        drawingState.objects.filter(
            isFittableObject
        );

    if (
        !fittableObjects.length
    ) {
        setToolMessage(
            drawingState.objects.length
                ? "Every feature on this sheet is hidden, so there is nothing to print"
                : "There is nothing to print"
        );

        return;
    }

    /*
     * THE BOUNDS FIT WOULD USE.
     *
     * `renderableBoundsOf` is the Fit module's own measurement of the
     * features' drawn extent, and `fitBoundsIntoViewport` is the shared
     * fit engine both Fit and the exports already go through. Print
     * asks them rather than measuring anything itself, so it cannot
     * crop what Fit shows, or include what Fit does not.
     */
    const bounds =
        renderableBoundsOf(fittableObjects);

    const camera =
        enggDrawingExport.fitBoundsIntoViewport(
            bounds,
            enggDrawingExport.PRINT_PAGE_PX
        );

    if (!camera) {
        setToolMessage(
            "Nothing to print on this sheet"
        );

        return;
    }

    /*
     * The padded world rectangle that corresponds to that fit, which
     * is what the clean renderer needs to lay out the page. The margin
     * ratio is the fit engine's own, so the whitespace printed is the
     * whitespace a Fit would leave - the drawing inset from the page
     * edge, not touching it and not lost in the middle.
     */
    const padded =
        enggDrawingExport.paddedBounds(
            [
                {
                    x: bounds.minX,
                    y: bounds.minY
                },
                {
                    x: bounds.maxX,
                    y: bounds.maxY
                }
            ],
            enggDrawingExport.PRINT_PAGE_PX.width,
            enggDrawingExport.PRINT_PAGE_PX.height
        );

    if (!padded) {
        return;
    }

    /*
     * The clean render sets the camera itself from the padded bounds
     * and restores the editor's camera afterwards, so no separate
     * camera bookkeeping is needed here.
     */
    const svg =
        enggDrawingExport.renderClean(
            drawingState,
            padded
        );

    /*
     * A null here means the render genuinely failed - reported as
     * such rather than showing an empty page and calling it printed.
     */
    if (!svg) {
        setToolMessage(
            "The drawing could not be prepared for printing"
        );

        return;
    }

    /*
     * PRINT IN PLACE, NOT IN A SECOND WINDOW.
     *
     * The rendered drawing is added to THIS document, and a print-only
     * stylesheet hides everything except it for the duration of the
     * print pass. The browser's print dialog therefore describes a page
     * containing the drawing alone, while the user stays in the editor
     * they were working in - no pop-up, no second window, and no popup
     * permission to ask for.
     *
     * The host carries the print rule inline rather than relying on the
     * app's CSS, so the behaviour does not depend on which stylesheets
     * happen to be loaded.
     */
    const PRINT_HOST_ID = "drawing-print-host";

    const previousHost =
        document.getElementById(PRINT_HOST_ID);

    if (previousHost) {
        previousHost.remove();
    }

    const host = document.createElement("div");

    host.id = PRINT_HOST_ID;

    host.appendChild(svg);

    document.body.appendChild(host);

    const style = document.createElement("style");

    style.id = "drawing-print-style";

    style.textContent = `
        @media print {
            body > *:not(#${PRINT_HOST_ID}) {
                display: none !important;
            }

            #${PRINT_HOST_ID} {
                display: block !important;
                margin: 0;
                padding: 0;
            }

            #${PRINT_HOST_ID} svg {
                width: 100%;
                height: auto;
            }

            @page {
                margin: 10mm;
            }
        }
    `;

    document.head.appendChild(style);

    /*
     * The print pass is transient. Whether the user prints or cancels,
     * the editor returns to exactly what it was: the host and the print
     * stylesheet are removed once printing has finished, and a safety
     * timeout catches browsers that do not fire `afterprint`.
     */
    const cleanup = () => {
        host.remove();
        style.remove();
    };

    window.addEventListener(
        "afterprint",
        cleanup,
        { once: true }
    );

    setTimeout(cleanup, 60000);

    window.print();

    setToolMessage(
        "Prepared the fitted drawing for printing"
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

    /*
     * A WRITE THAT FAILED IS NOT A SAVE.
     *
     * `file-save` reports a failed write as `{ error, detail }` rather than
     * throwing, so the distinction between "nothing to write back to" (null),
     * "written" (a name) and "the disk refused" (an error) is made here.
     *
     * The document is left DIRTY and its name unchanged, because neither is
     * true yet - and the user is told, in the one place they are looking, that
     * their work is still open. Claiming a save that did not happen is the
     * single most damaging thing this function could do.
     */
    if (saved && saved.error) {
        setToolMessage(saved.error);

        window.alert(saved.error);

        if (typeof console !== "undefined" && console.error) {
            console.error("[Datum] Save failed", saved.detail);
        }

        return false;
    }

    if (!saved) {
        /*
         * Nowhere to save back to. Save As is not a lesser thing
         * here - it is the only thing that can happen - so it is run
         * rather than reported. Its own result is returned, so a caller
         * that needs to know whether the document was actually written -
         * the Save First choice in the unsaved-changes prompt - is not
         * misled into continuing after a cancelled panel.
         */
        return await saveDrawingAs();
    }

    documentFileName = saved;

    markDocumentClean();

    refreshDocumentTitle();

    setToolMessage(`Saved ${saved}`);

    return true;
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
        return false;
    }

    if (result.error) {
        /*
         * A real failure - an empty drawing, or a render that could not
         * produce pixels. Reported honestly, and the document keeps its
         * old name and path so a retry goes to the same place.
         */
        setToolMessage(result.error);

        return false;
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

        refreshDocumentTitle();

        /*
         * A SAVED FILE IS A RECENT FILE.
         *
         * Save As writes the document to a new name, so that name should be
         * selectable from the Open launcher next time. The stored copy is the
         * document body exactly as it was written, which is what makes the
         * entry reopenable in every browser - the same reference Save, Save As,
         * Import and Recent all share.
         */
        enggRecentFiles.remember({
            name: result.name,
            handle: enggFileSave.currentFileHandle(),
            document: serializeDocumentBody(),
            preview: renderDocumentPreview(serializeDocumentBody())
        });

        setToolMessage(`Saved ${result.name}`);

        return true;
    }

    setToolMessage(`Saved ${result.name}`);

    return true;
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
     * FROM HERE UNTIL THE END OF THIS FUNCTION THE DOCUMENT IS BEING
     * RESTORED, NOT EDITED.
     *
     * Replacing the collection, loading a sheet, rebuilding features and
     * resolving relationships all reach code that, when the user causes it,
     * means "the document changed". During a load none of it is an edit, so
     * every such notification is ignored and the document is left clean at
     * the end. This is what stops an opened file from being treated as having
     * unsaved changes the moment it arrives.
     */
    /*
     * Apply the validated document. The reconstruction is wrapped so the
     * "loading" state is always closed, however it ends.
     */
    try {
        applyLoadedDocument(data, fileName, previous, result);
    } finally {
        /*
         * THE LOAD ALWAYS ENDS, EVEN IF IT THREW.
         *
         * An exception during reconstruction must not leave the editor in the
         * loading state, where every later edit would be silently ignored and
         * the document could never be saved. The flag is closed and the
         * document marked clean here, so a failed load is still a defined
         * state.
         */
        endDocumentLoad();
    }

    return data;
}

/*
 * Put a validated document into the editor: its settings, its sheets, its
 * features and its relationships, then render it.
 *
 * Called with the document already validated, and always between
 * beginDocumentLoad and endDocumentLoad - which is what makes the whole of
 * this reconstruction, rather than a set of user edits, and is why none of it
 * marks the document dirty at the end.
 */
function applyLoadedDocument(data, fileName, previous, result) {
    /*
     * The document's own settings, not just its features. Units and
     * calibration travel with the drawing because a length in a file
     * means nothing without them.
     *
     * Applied to the state, not to the collection: these are settings
     * of the whole document - the unit every length on every sheet is
     * in - rather than of any one drawing.
     */
    beginDocumentLoad();

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
     * An opened document is clean: it matches the file it came from. A
     * migrated file is also clean, because what was written and what is now
     * open describe the same drawing.
     */
    if (fileName) {
        documentFileName =
            enggDocumentFile.withExtension(
                fileName
            );
    }

    refreshDocumentTitle();

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
}

/*
 * Choose a .enggdraw file from the laptop and open it.
 *
 * This is IMPORT: the one action in the Open launcher that uses the operating
 * system's file panel. The file is read and validated before anything is
 * applied, so a file that cannot be opened leaves the current drawing
 * untouched - see loadDrawing, which is where that guarantee is made.
 *
 * Cancelling the panel is not an event the page is told about, so the returned
 * promise resolves either when the file has been handled or when the panel was
 * dismissed without one; either way the current document is unchanged until a
 * file actually arrives and loads.
 */
export function importDrawingFile() {
    return new Promise((resolve) => {
        const input =
            document.createElement("input");

        input.type = "file";
        input.accept = `.${enggDocumentFile.EXTENSION},${enggDocumentFile.MEDIA_TYPE},application/json`;

        /*
         * Cancelling raises `cancel` in every browser that fires it, and no
         * event at all in the others. Both are handled: nothing is applied, and
         * the launcher the user came from has already closed, so cancelling
         * simply returns them to the drawing they had.
         */
        input.addEventListener("cancel", () => resolve(false));

        input.addEventListener("change", () => {
            const file =
                input.files && input.files[0];

            if (!file) {
                resolve(false);

                return;
            }

            openChosenFile(file).then(resolve);

            input.value = "";
        });

        input.click();
    });
}

/*
 * Read one chosen File and open it.
 *
 * Resolves true only when a drawing was installed. The file is read as text
 * and handed to applyOpenedText, which is the ONE place a file's contents
 * become a document - importing, opening a recent and recovering all reach it
 * rather than each growing a copy of the parse.
 */
function openChosenFile(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();

        reader.addEventListener("load", () => {
            resolve(applyOpenedText(String(reader.result), file.name, file));
        });

        reader.addEventListener("error", () => {
            setToolMessage(
                "That file could not be read. It may be damaged."
            );

            window.alert(
                "That file could not be read. It may be damaged, or it may " +
                "not be an EnggDraw drawing."
            );

            resolve(false);
        });

        reader.readAsText(file);
    });
}

/*
 * Parse one file's text and apply it.
 *
 * Returns true only when a drawing was actually installed. A file that cannot
 * be parsed is reported and changes nothing, so a damaged file leaves the
 * drawing the user already has exactly as it was.
 *
 * `file` is optional: it carries the size and last-modified time that identify
 * the file in the recents list. Recovery passes text without one, and the
 * entry is keyed on the name alone in that case.
 */
function applyOpenedText(text, name, file) {
    let parsed;

    try {
        parsed = JSON.parse(text);
    } catch (error) {
        setToolMessage(
            "That file could not be read. It may be damaged, " +
            "or it may not be an EnggDraw drawing."
        );

        window.alert(
            "That file could not be read. It may be damaged, or it may not " +
            "be an EnggDraw drawing."
        );

        return false;
    }

    const opened = loadDrawing(parsed, name);

    /*
     * ONLY A FILE THAT ACTUALLY OPENED IS REMEMBERED.
     *
     * A recents entry is a promise that the drawing can be opened again, so a
     * file that failed to load is not added: an entry that cannot be opened is
     * worse than no entry at all. `loadDrawing` returns the reconstructed
     * document on success and false on failure, so the document stored with
     * the entry is exactly what is now open.
     */
    if (opened) {
        enggRecentFiles.remember({
            name,
            file,
            document: opened,

            /*
             * A PICTURE OF THE DRAWING, taken from the document that was just
             * loaded. It is made by the same renderer the canvas uses and
             * changes nothing about the document, so a recents list can show
             * what a file looks like without opening it.
             */
            preview: renderDocumentPreview(opened)
        });
    }

    return Boolean(opened);
}

/*
 * Open the drawing behind a recent entry.
 *
 * Preferred order:
 *
 *   1. A stored file handle. Where the browser gave one - File System Access
 *      on Chrome and Edge - the CURRENT file is read from disk, so the recent
 *      reflects the user's latest saved version rather than a stale copy.
 *   2. The stored document. Without a handle there is no way to reopen a file
 *      by path, so the copy kept with the entry is opened through the same
 *      loader. This is what makes Recents work in every browser.
 *
 * A handle whose permission has been revoked, or whose file has been moved or
 * deleted, is reported and the entry is marked missing - the list stays usable
 * and the other files still open.
 */
async function openRecentFile(entry) {
    const handle = enggRecentFiles.handleFor(entry.key);

    if (handle) {
        try {
            const file = await handle.getFile();

            const opened = await openChosenFile(file);

            if (opened) {
                return true;
            }
        } catch (error) {
            /*
             * The file is gone, or access was refused. This is the normal case
             * for a recently used file on a drive that is no longer attached,
             * so it is reported rather than thrown.
             */
            enggRecentFiles.markMissing(entry.key);

            setToolMessage(
                `${entry.fileName} could not be opened. It may have been ` +
                "moved, renamed or deleted."
            );

            window.alert(
                `File not found:\n\n${entry.fileName}\n\n` +
                "It may have been moved, renamed or deleted. " +
                "Import it again to reopen it."
            );

            return false;
        }
    }

    const document = enggRecentFiles.documentFor(entry.key);

    if (document) {
        /*
         * The stored copy goes through the ordinary loader, wrapped in the
         * ordinary envelope, so a recent is opened exactly as a file is -
         * validated, migrated and reconstructed the same way.
         */
        const opened = loadDrawing(
            enggDocumentFile.createDocument(document),
            entry.fileName
        );

        if (opened) {
            enggRecentFiles.remember({
                name: entry.fileName,
                document: opened
            });

            return true;
        }

        return false;
    }

    /*
     * Neither a handle nor a stored copy. The entry can still be listed, but
     * it cannot be reopened, so the user is told to import it rather than left
     * with a button that does nothing.
     */
    enggRecentFiles.markMissing(entry.key);

    setToolMessage(
        `${entry.fileName} has to be imported again to be reopened.`
    );

    return false;
}

/*
 * Start a new document from a template.
 *
 * A template is a document body, so it is loaded through the same loader a file
 * uses and is editable, saveable and reopenable from the moment it appears. It
 * has no file, so it is untitled and NOT dirty - there is nothing on it for the
 * user to have changed yet.
 */
function openTemplate(templateId) {
    const body = enggTemplates.copyDocumentFor(templateId);

    if (!body) {
        setToolMessage("That template is not available.");

        return false;
    }

    const template = enggTemplates
        .list()
        .find((entry) => entry.id === templateId);

    const loaded = loadDrawing(
        enggDocumentFile.createDocument(body),
        null
    );

    if (!loaded) {
        return false;
    }

    /*
     * A template is a NEW document, not a file. It belongs to no file, so a
     * later Save asks where to put it - and it is clean, because nothing on it
     * has been changed.
     */
    documentFileName = null;

    enggFileSave.forgetFileHandle();

    markDocumentClean();

    refreshDocumentTitle();

    setToolMessage(
        template ? `New drawing from ${template.name}` : "New drawing"
    );

    return true;
}

/*
 * Choose a .enggdraw and add it to the template library.
 *
 * The file is READ AND VALIDATED by the same loader an Open uses, so a template
 * can only ever be created from a document Datum could actually open - there is
 * no second parser, and a corrupt file is refused with the same reason an Open
 * would give.
 *
 * THE CURRENT DRAWING IS NOT TOUCHED, and is not guarded: adding a template is
 * not a document operation, so there is no unsaved-changes question and the
 * drawing stays exactly as it is.
 */
async function addTemplateFromFile() {
    const chosen = await readFileAsText();

    if (!chosen) {
        /* The panel was cancelled, or cancelled because there was no file. */
        return false;
    }

    let parsed;

    try {
        parsed = JSON.parse(chosen.text);
    } catch (error) {
        reportFileProblem(
            "That file could not be read. It may be damaged, or it may not " +
            "be an EnggDraw drawing."
        );

        return false;
    }

    /*
     * Validated the same way an Open validates, and against a THROWAWAY copy of
     * the reader so the current document is never involved. `readDocument`
     * neither throws nor mutates anything, which is what makes it safe to call
     * merely to ask "is this usable?".
     */
    const result = enggDocumentFile.readDocument(parsed);

    if (!result.ok) {
        reportFileProblem(result.detail);

        return false;
    }

    /*
     * The source file's name, offered as the default template name. The file
     * name travels with the text as an object, because a FileReader result is a
     * primitive string and cannot carry it.
     */
    const suggested =
        String(chosen.fileName || "")
            .replace(/\.enggdraw$/i, "")
            .trim() || "New Template";

    const name = await askForTemplateName(suggested);

    if (!name) {
        /* Cancelled at the name step. No template is created. */
        return false;
    }

    const preview = renderDocumentPreview(result.document);

    const id = enggTemplates.addTemplate({
        name,
        document: result.document,
        preview
    });

    if (!id) {
        setToolMessage("That template could not be saved.");

        return false;
    }

    setToolMessage(`Added ${name} to templates`);

    return true;
}

/*
 * Ask the user for a template's name.
 *
 * The source file's name is offered as the starting point, because it is very
 * often what the user would type anyway - but it is only a default, and the
 * name they give is what is stored. Returns null when cancelled, which the
 * caller treats as "no template was made" rather than as an error.
 */
function askForTemplateName(suggested) {
    return enggUi
        .promptDialog(
            "Give this template a name. It is only a label; the drawing it " +
            "was made from is not changed.",
            {
                title: "Add Template",
                fields: [
                    {
                        name: "name",
                        label: "Template Name",
                        value: suggested,
                        placeholder: "Statics Setup",
                        maxLength: 80
                    }
                ],
                confirm: "Add Template",
                cancel: "Cancel",
                onConfirm: (entered) =>
                    (entered.name || "").trim() ? entered : false
            }
        )
        .then((entered) =>
            entered ? String(entered.name).trim() : null
        );
}

/*
 * Rename a stored template.
 *
 * The display name only. The template's document and id are untouched, and the
 * `.enggdraw` it was made from is not referenced at all.
 */
async function renameTemplate(id) {
    const existing = enggTemplates
        .list()
        .find((entry) => entry.id === id);

    if (!existing) {
        return false;
    }

    const name = await askForTemplateName(existing.name);

    if (!name) {
        return false;
    }

    enggTemplates.renameTemplate(id, name);

    setToolMessage(`Renamed to ${name}`);

    return true;
}

/*
 * Read a chosen .enggdraw as text.
 *
 * Returns null when the panel was dismissed, which is the ordinary way to
 * change your mind and is not an error. The reader is the one place a file's
 * TEXT comes from, so every route into the application - import, open, recent,
 * template - shares it.
 */
function readFileAsText() {
    return new Promise((resolve) => {
        const input = document.createElement("input");

        input.type = "file";

        /*
         * THE NATIVE TYPE, NAMED AS THE FORMAT. The software is Datum; the
         * drawing format is EnggDraw, and `.enggdraw` is its extension.
         */
        input.accept = `.${enggDocumentFile.EXTENSION},${enggDocumentFile.MEDIA_TYPE},application/json`;

        input.addEventListener("cancel", () => resolve(null));

        input.addEventListener("change", () => {
            const file = input.files && input.files[0];

            if (!file) {
                resolve(null);

                return;
            }

            const reader = new FileReader();

            reader.addEventListener("load", () => {
                /*
                 * THE NAME TRAVELS WITH THE TEXT.
                 *
                 * A FileReader result is a primitive string, and a property
                 * cannot be attached to one - in module (strict) code the
                 * assignment THROWS, which would leave this promise unresolved
                 * forever and the caller waiting for a file that never arrives.
                 * So the two are returned together, as an object.
                 */
                resolve({
                    text: String(reader.result),
                    fileName: file.name
                });
            });

            reader.addEventListener("error", () => resolve(null));

            reader.readAsText(file);

            input.value = "";
        });

        input.click();
    });
}

/*
 * Tell the user a chosen file could not be used.
 *
 * Reported in both places the user is already looking: the status line for the
 * detail, and a dialog so a failure cannot pass unnoticed. A silent refusal is
 * the failure mode this exists to prevent - the user would otherwise believe a
 * template had been added when none had.
 */
function reportFileProblem(detail) {
    const message =
        detail ||
        "That file could not be used. It may not be an EnggDraw drawing.";

    setToolMessage(message);

    window.alert(message);
}

/*
 * A small SVG picture of a stored document.
 *
 * READ-ONLY with respect to the document: the drawing is rendered into its own
 * SVG by the same export pipeline the canvas and the PNG export use, and nothing
 * about the document - positions, World Scale, annotations, dirty state, feature
 * order - is touched. A preview that failed is simply not shown, so a rendering
 * problem can never stop a template from being created, or a file from being
 * opened.
 *
 * Used for BOTH a template's card and a recent file's thumbnail, because both
 * are the same question: what does this stored drawing look like?
 */
/*
 * A small SVG picture of a stored document.
 *
 * A THIN WRAPPER over the shared fitted render, which is where the drawing
 * bounds, the sheet's World Scale and the neutral camera are decided. Keeping
 * the decision there - and not here - is what makes a Recent thumbnail, a
 * template card and a written-solution figure the same picture of the same
 * drawing.
 *
 * READ-ONLY throughout: the render works from a state built out of the stored
 * document, so nothing about the open document - its zoom, its selection, its
 * dirty state, its undo history - is read or touched. A preview that could not
 * be produced is simply not shown.
 */
function renderDocumentPreview(document) {
    try {
        const image = enggDrawingExport.renderFittedDocument(document, {
            width: 160
        });

        if (!image || !image.svg) {
            return null;
        }

        return new XMLSerializer().serializeToString(image.svg);
    } catch (error) {
        enggErrorLog.reportError("render document preview", error, {});

        return null;
    }
}

/*
 * The Open launcher: Templates, Recent files, and Import.
 *
 * File -> Open shows this rather than the operating system's file panel. The
 * unsaved-changes question is asked FIRST, so that by the time the launcher
 * appears the user has already decided what happens to the drawing they are
 * leaving - and a choice inside the launcher cannot silently replace work.
 *
 * The launcher reports a choice; every choice is then carried out here, so the
 * popup itself contains no file handling and cannot become a second way into
 * the application.
 */
export async function openDrawing() {
    /*
     * THE LAUNCHER IS SHOWN FIRST, AND THE GUARD IS ASKED AFTERWARDS.
     *
     * The launcher is a list of ways to START, and two of its three sections -
     * browsing templates and adding one - do not replace the drawing at all.
     * Asking about unsaved changes before the user has even chosen would be a
     * prompt about nothing, and it would make "+ Add Template" (which only
     * copies a file into the library) look like it was about to discard work.
     *
     * So the question is put to each choice that would actually REPLACE the
     * document - opening a template, a recent, or an import - and to none of the
     * choices that would not.
     */
    const choice = await enggOpenPopup.openOpenPopup();

    if (!choice || choice.action === "cancel") {
        return false;
    }

    if (choice.action === "template") {
        return confirmDiscardUnsavedChanges(
            () => openTemplate(choice.id)
        );
    }

    if (choice.action === "recent") {
        return confirmDiscardUnsavedChanges(
            () => openRecentFile(choice.entry)
        );
    }

    if (choice.action === "import") {
        return confirmDiscardUnsavedChanges(
            () => importDrawingFile()
        );
    }

    if (choice.action === "add-template") {
        /*
         * ADDING A TEMPLATE DOES NOT REPLACE THE DRAWING.
         *
         * The user is copying a file into the template library, not opening
         * it - the current document stays exactly as it is. So there is
         * deliberately NO unsaved-changes guard here: asking about unsaved work
         * would suggest the drawing is about to be replaced, which it is not.
         */
        return addTemplateFromFile();
    }

    if (choice.action === "rename-template") {
        return renameTemplate(choice.id);
    }

    return false;
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
 *
 * THE TWO CHOICES ARE NAMED FOR WHAT THEY DO.
 *
 * "Recover" and "Discard Recovery" are unambiguous, where a yes/no prompt
 * leaves the user guessing which button keeps the work. The application's own
 * dialog is used for the same reason the unsaved-changes prompt uses it: this
 * is a question about the user's own drawing, and it should look and behave
 * like the rest of Datum.
 *
 * RECOVERED WORK IS UNSAVED WORK.
 *
 * The recovery copy exists precisely because a save did not happen, so the
 * restored document is marked DIRTY. It is deliberately not treated as clean:
 * a document that claimed to be saved would make the next Open or New discard
 * the very work the recovery was for. The user can then Save or Save As
 * normally, which is the only correct way for it to become saved.
 */
export async function offerRecoveryIfAvailable() {
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
            ? `Last edited ${record.when}.`
            : "";

    const choice = await enggUi.choiceDialog(
        "Datum found unsaved work from a previous session " +
            `(${features}).\n\n${when}`.trim() +
            "\n\nRecover it?",
        {
            title: "Recovered drawing available",
            buttons: [
                { id: "recover", label: "Recover", primary: true },
                {
                    id: "discard",
                    label: "Discard Recovery",
                    dismiss: true
                }
            ]
        }
    );

    if (choice !== "recover") {
        /*
         * Declining removes the copy, so the same question is not asked on
         * every visit. Nothing is lost by this beyond the recovery copy itself,
         * which the user has just said they do not want.
         */
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

    const loaded = loadDrawing(
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

    if (!loaded) {
        return false;
    }

    /*
     * The recovered document contains work that was never saved, so it is
     * dirty - and the recovery copy is discarded, because it has now been
     * delivered into the editor rather than left behind as a second copy that
     * would be offered again next time.
     */
    markDocumentDirty();

    enggRecovery.discard();

    setToolMessage(
        `Recovered ${documentFile() || "unsaved work"} from the previous session`
    );

    return true;
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

    installWorkProtection();
}

/*
 * ========================================================
 * PROTECTING WORK THAT HAS NOT BEEN SAVED
 * ========================================================
 *
 * The recovery copy already exists: a committed edit schedules a write.
 * Scheduling on every edit is not by itself enough, though, because it depends
 * on an edit happening to be the last thing before a failure. Two additions
 * close that gap:
 *
 *   1. A WARNING BEFORE LEAVING. A page reload or a closed tab with unsaved
 *      work should ask first. The browser's own prompt is the only mechanism a
 *      page has for this, so it is used - and it is a SECOND line of defence,
 *      not the first: the recovery copy below is what actually preserves the
 *      drawing, since a user can always dismiss a prompt.
 *
 *   2. A PERIODIC SNAPSHOT. A safety net for the failures a change listener
 *      cannot see: a tab that is about to be discarded, a long idle stretch, a
 *      crash that happens with no edit in flight. It is a timer rather than a
 *      write on every frame, so drawing stays smooth, and it writes only while
 *      there is something unsaved to protect.
 */
function installWorkProtection() {
    const UNSAVED_MESSAGE =
        "This drawing has unsaved changes. Save it before leaving?";

    /*
     * Ask before leaving with unsaved work.
     *
     * A page cannot show its own dialog here - the browser shows a generic
     * one and ignores any message text - so the wording is set for the
     * browsers that still show it, and no return value is relied on.
     */
    window.addEventListener("beforeunload", (event) => {
        if (!documentIsDirty()) {
            return undefined;
        }

        event.preventDefault();
        event.returnValue = UNSAVED_MESSAGE;

        return UNSAVED_MESSAGE;
    });

    /*
     * A snapshot on a timer, in addition to the one each edit schedules.
     *
     * Thirty seconds is short enough that very little work is ever at risk and
     * long enough that serialising a large drawing costs nothing noticeable.
     */
    window.setInterval(() => {
        if (!documentIsDirty() || documentLoading) {
            return;
        }

        try {
            enggRecovery.schedule(
                serializeDocumentBody(),
                documentFileName
            );
        } catch (error) {
            /*
             * A snapshot that fails must not interrupt the session. Reported,
             * because a recovery copy that is silently never written is exactly
             * the failure this is here to prevent, and the user would otherwise
             * only discover it after a crash.
             */
            if (typeof console !== "undefined" && console.warn) {
                console.warn(
                    "[Datum] A recovery snapshot could not be taken.",
                    error
                );
            }
        }
    }, RECOVERY_SNAPSHOT_MS);
}

/*
 * How often a recovery snapshot is taken while there is unsaved work.
 */
const RECOVERY_SNAPSHOT_MS = 30000;
