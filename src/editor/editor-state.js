/*
 * The editor's state: the document model, and the UI state shared between editor modules.
 */

import enggDrawingState from "../core/model/drawing-state.js";
import enggDrawingSnap from "../core/snapping/object-snap.js";
import enggSheets from "../sheets/sheets.js";

export const drawingState = enggDrawingState.createDrawingState();

export const drawingSnap = enggDrawingSnap;

/*
 * UI state shared between editor modules.
 *
 * These were module-level variables of the single controller file. An
 * imported binding cannot be reassigned, so state that more than one
 * module changes lives on this one object instead.
 */
export const editorState = {
    /*
     * ========================================================
     * SHEETS
     * ========================================================
     */
    
    /*
     * The document's sheets.
     *
     * The editor has exactly ONE live drawing state, and it is always the
     * ACTIVE sheet. Switching sheets does not move geometry about and does
     * not ask the renderer to filter: it puts whatever is in the editor
     * back onto the sheet it came from, and loads the next sheet into the
     * editor.
     *
     * That is a deliberate choice over the alternative - making every
     * feature, every snap candidate and every hit-test aware of sheets. The
     * alternative would mean threading a sheet filter through thousands of
     * lines that have no business knowing, and the filter would have to be
     * remembered correctly in each one. Loading one sheet at a time means
     * the guarantee is structural instead of remembered: an inactive sheet
     * has no features in the editor at all, so it cannot be selected,
     * snapped to, dragged, or moved by a tool that was still armed. It
     * also means the Features panel, box selection and object snapping
     * need no sheet awareness whatsoever.
     */
    sheetCollection: enggSheets.createCollection(),

    coordinateSystemMenu: null,

    coordinateSystemMenuAnchor: null,

    polygonSidesPrompt: null,

    selectionClickSuppressed: false,

    selectionDrag: null,

    panSession: null,

    /*
     * The pending expiry of a held snap guideline.
     *
     * A guideline is kept up briefly after the cursor leaves its
     * region so it does not flicker off with every small movement.
     * The pointer moving again would eventually clear it on its
     * own, but a cursor that stops moving just outside a region
     * would leave the guide up forever, so the hold is given a
     * deadline of its own.
     *
     * Only ever one timer: a new one replaces the old rather than
     * accumulating, so holding a guide steady does not queue up
     * dozens of redraws.
     */
    guidelineHoldTimer: null,

    drawingZoom: drawingState.camera.zoom * 100,

    /*
     * THE STATICS DISPLAY SECTION.
     *
     * A single Vector Scale control, drawn above whichever Statics feature
     * is being edited. It appears once - never inside an individual force or
     * load - because it is a property of the Statics environment and not of
     * any feature on the sheet.
     *
     * Only features that are actually drawn as arrows have one: a Point
     * Force, a Resultant, and the two distributed loads. A beam has no arrow
     * to size, so nothing is offered for it and the panel is unchanged.
     */
    /*
     * Whether the CUSTOM box is showing.
     *
     * This is view state, not part of the drawing, and it has to exist
     * separately because the panel is rebuilt from scratch every time it is
     * rendered. Without it, choosing "Custom…" would re-render the panel from
     * the stored scale - which is a listed value - and the dropdown would
     * snap straight back to it, so the custom box could never be opened at
     * all.
     *
     * It is cleared as soon as a scale is chosen or applied, so it never
     * outlives the reason it was opened.
     */
    staticsCustomScaleOpen: false,

    /*
     * Active direct-manipulation drag.
     *
     * Holds which handle (or body) of which object is being
     * dragged, plus the original geometry so the edit can be
     * applied as a delta from a stable starting point.
     */
    manipulationDrag: null,

    featurePanelView: "tree",

    /*
     * Whether the feature currently shown by the tree has already
     * been picked in this same view.
     *
     * A feature is selected the moment it is created, so "is it
     * selected?" is true from the start and cannot by itself mean the
     * user has picked it on purpose. This flag records that a click
     * actually landed on the selected row, so the NEXT one is the
     * deliberate repeat that opens the editor.
     *
     * It is cleared whenever the selection changes to something
     * different, or when the view leaves the tree, so it can never
     * carry over into an unrelated feature.
     */
    featureTreePickedId: null,

    /*
     * Global toolbar tools.
     *
     * Modify tools act on the selected geometry using the
     * existing selection and history systems. View tools
     * only move the camera, so they never touch geometry.
     */
    /*
     * Active Modify session.
     *
     * A session holds the workflow the user is part way
     * through, so a Modify tool can span several clicks
     * (base point, pivot, mirror axis) and can be
     * cancelled cleanly at any stage.
     */
    modifySession: null,

    /*
     * THE CLIPBOARD
     *
     * Copy takes the current selection, paste creates it again as new
     * features, and cut does the two in order. They work through the
     * ordinary selection and the ordinary add path, so a pasted
     * feature is numbered, selectable and editable exactly as a
     * drawn one is, and every one of them is a single undoable
     * change.
     */
    drawingClipboard: null,

    eyedropperActive: false,

    /*
     * Global toolbar tools.
     *
     * Modify tools operate on the selected geometry;
     * View tools change only the camera. Both reuse the
     * existing selection, snapping and camera systems.
     */
    
    /*
     * The id of the global toolbar tool currently running,
     * so its button can stay visibly highlighted and be
     * cleared the moment the tool ends.
     */
    activeGlobalTool: null
};
