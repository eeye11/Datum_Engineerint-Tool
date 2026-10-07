/*
 * What a click on the canvas does.
 */

import enggDrawingState from "../core/model/drawing-state.js";
import enggDimensions from "../core/scale/dimensions.js";
import enggQuantities from "../core/units/quantities.js";
import enggDimensionEdit from "../features/dimensions/dimension-edit.js";
import enggDimensionEditor from "../features/dimensions/dimension-editor.js";
import enggDimensionModel from "../features/dimensions/dimension-model.js";
import enggNoteEditor from "../ui/editors/note-editor.js";
import enggAnnotationModel from "../features/annotations/annotation-model.js";
import { commitAnalysisAxis } from "./analysis-tools.js";
import { handleAnnotationClick, isAnnotationTool } from "./annotation-tool.js";
import { renderCurrentDrawing } from "./canvas-render.js";
import { pickColourFromFeature } from "./colour-picker.js";
import { isConstructionTool, shouldClickSelectExistingObject } from "./construction-tools.js";
import { handleDimensionClick } from "./dimension-placement.js";
import { isDimensionTool } from "./dimension-tool.js";
import { drawingState, editorState } from "./editor-state.js";
import { renderProperties } from "./feature-panel.js";
import { add2DCoordinateSystem, beginOrCompleteGeometry } from "./geometry-creation.js";
import { objectAtPoint } from "./hit-testing.js";
import { handleModifyClick } from "./modify-tools.js";
import { resolvePointerEvent } from "./pointer.js";
import { canvasPointFromEvent } from "./tool-activation.js";
import { setToolMessage } from "./toolbar-render.js";

export function handleCanvasClick(
    event
) {
    /*
     * The colour eyedropper is a one-shot mode: the next
     * click reads a feature's stored colour instead of
     * doing anything else with the click.
     */
    if (editorState.eyedropperActive) {
        event.preventDefault();

        pickColourFromFeature(
            event
        );

        return;
    }

    /*
     * A running Modify session owns the click. It is
     * checked before the selection-suppression flag so a
     * staged workflow is never swallowed by a leftover
     * selection drag.
     */
    if (
        editorState.modifySession &&
        handleModifyClick(
            resolvePointerEvent(
                event
            ),
            canvasPointFromEvent(
                event,
                false
            ),
            event.shiftKey
        )
    ) {
        editorState.selectionClickSuppressed =
            false;

        return;
    }

    if (
        editorState.selectionClickSuppressed
    ) {
        editorState.selectionClickSuppressed =
            false;

        return;
    }

    /*
     * THE CLICK AFTER A DRAG-TO-CREATE GESTURE.
     *
     * A held drag that created a feature also fires a `click` on release.
     * That click is part of the gesture that has already committed the
     * feature, not a new first point - so it is dropped here, once, and
     * the tool stays armed for the next feature. Without this the release
     * would be read twice and the student would find themselves starting
     * a second shape at the point they had just released.
     */
    if (
        editorState.creationDragConsumedClick
    ) {
        editorState.creationDragConsumedClick =
            false;

        return;
    }

    /*
     * Resolve the exact click position again.
     *
     * This is important because relying on the
     * previous mousemove resolution can cause a
     * click to use a stale unsnapped point.
     */
    const resolution =
        resolvePointerEvent(
            event
        );

    if (
        drawingState.activeTool ===
        "coordinate-system-2d"
    ) {
        add2DCoordinateSystem(
            resolution.effectiveConstructionPoint
        );

        return;
    }

    if (
        !drawingState.activeTool
    ) {
        return;
    }

    /*
     * A running Modify session owns the click, so its
     * staged workflow is not interrupted by ordinary
     * tool handling.
     */
    if (
        editorState.modifySession &&
        handleModifyClick(
            resolution,
            canvasPointFromEvent(
                event,
                false
            )
        )
    ) {
        return;
    }

    /*
     * THE DIMENSION TOOLS, BEFORE THE CONSTRUCTION PIPELINE.
     *
     * A dimension tool IS a construction tool - it needs the same
     * snapping and inference as everything else, which is why it is
     * listed in `isConstructionTool`. But it does not share the
     * construction CLICK pipeline: it collects references until Enter
     * rather than taking points until a shape is complete.
     *
     * Sending it to `beginOrCompleteGeometry` therefore consumed every
     * click and built nothing. The dimension check is first so a click
     * reaches the tool's own handler, which is still fed by the same
     * snapping resolution computed above.
     */
    if (
        isDimensionTool(
            drawingState.activeTool
        )
    ) {
        handleDimensionClick(
            resolution,
            event
        );

        return;
    }

    if (
        isConstructionTool(
            drawingState.activeTool
        )
    ) {
        beginOrCompleteGeometry(
            resolution
        );

        return;
    }

    /*
     * The annotation tool. Checked after the dimension tools because it
     * behaves the same way - arm, then place - and differs only in what it is
     * labelling.

     */
    if (
        isAnnotationTool(
            drawingState.activeTool
        )
    ) {
        handleAnnotationClick(
            resolution,
            event
        );

        return;
    }

    /*
     * UNIVERSAL SELECTION.
     *
     * This is the one rule that makes Select mean the same thing
     * everywhere: clicking a feature that ALREADY EXISTS selects it,
     * whichever tool is currently active.
     *
     * Before this, selecting an existing object was only possible
     * with the Select tool active. A student with Beam selected who
     * clicked an existing Point Force did not select the force - the
     * Beam tool consumed the click and started a new beam through
     * it. Selecting therefore became a mode the student had to be
     * IN, and switching to it and back for every edit was pure
     * friction.
     *
     * WHERE IT SITS IN THE ORDER, AND WHY
     * -----------------------------------
     * Placement is the design; it is a priority order and not a set
     * of tool exceptions:
     *
     *   1. an active editing interaction  - Modify, handled above
     *   2. the tool's own meaning for a click on existing geometry -
     *      construction, dimensions, annotations
     *   3. a CONSTRUCTION that is mid-flight and needs this click as
     *      one of ITS points
     *   4. an existing object under the pointer
     *   5. the tool's own handling of empty space
     *
     * Step 2 is why this block sits BELOW the dimension and annotation
     * tools rather than above them, and getting that wrong is the
     * mistake this ordering exists to prevent.
     *
     * A dimension and an annotation are not placed on empty canvas.
     * They are MEASURED and LABELLED, and the whole point of them is
     * that they attach to something already on the sheet: clicking a
     * beam with the Dimension tool means "measure that beam", and
     * clicking a force with the Annotation tool means "write on that
     * force". Intercepting those clicks to select the beam instead
     * would quietly remove the tools' entire reason for being - the
     * student could not dimension anything without switching to Select
     * first, which is the very problem this change removes,
     * reintroduced one level down.
     *
     * Steps 3 and 4 are the universal part. A running construction is
     * exempt - a half-built Beam is waiting for its second point, and
     * taking the click for a selection would strand it - and the
     * exemption is asked of the interaction state rather than of a
     * list of tools, so no tool can be forgotten.
     *
     * Step 4 uses the same hit test Select uses, which already knows
     * about dimensions, annotations, analysis objects and every
     * statics symbol. So no tool needs to know how to be selectable
     * and no category needs its own rule: a tool that was never
     * thought about when this was written still gets it.
     */
    /*
     * THE ANALYSIS AXIS PLACEMENT, BEFORE ANY SELECTION.
     *
     * The comment below used to describe this branch as sitting ahead of
     * the construction tools and the selection test, and it was written
     * with the reasoning in full: a click on an existing feature during a
     * placement is a PLACEMENT click, not a selection, because the
     * student is being asked where the diagram goes and the only thing
     * that answers that is where the pointer is.
     *
     * The code said the opposite. The selection test ran first, so a click
     * on the beam was taken as a selection and returned before this branch
     * was ever reached - the diagram stayed unplaced and the tool stayed
     * armed, which is the one outcome that comment calls a half-finished
     * sheet.
     *
     * So the order is what the comment always claimed. A running analysis
     * placement owns the pointer, and that is decided by the interaction
     * phase rather than by what happens to be under it.
     */
    if (
        drawingState.interaction.phase ===
            "analysis-axis"
    ) {
        /*
         * WHICH STAGE THIS CLICK IS.
         *
         * The placement is two clicks: the first names the body the
         * diagram belongs to, the second puts it where the student wants
         * it. Whether THIS click is the second one is decided by whether a
         * source was already chosen when it arrived - read BEFORE the
         * first stage runs, because that stage sets the source and would
         * otherwise make both clicks look like the committing one.
         */
        const hadSource =
            Boolean(
                drawingState.interaction.sourceId
            );

        if (hadSource) {
            commitAnalysisAxis();

            return;
        }

        /*
         * No source yet, so this click NAMES the body. That is the first
         * stage of the placement and it is handled by the ordinary
         * construction entry point, which already owns the "click a body
         * to act on" rule every body-attached Statics tool uses.
         *
         * It is deliberately NOT called once a source exists. A
         * construction entry point is for BUILDING something, and with a
         * source already chosen this click commits a placement rather than
         * starting a new one - running both would leave a stray span armed
         * behind the diagram.
         */
        beginOrCompleteGeometry(
            resolvePointerEvent(event)
        );

        return;
    }

    if (
        shouldClickSelectExistingObject(
            event
        )
    ) {
        selectFromCanvasClick(
            event
        );

        return;
    }

    if (
        drawingState.activeTool ===
        "select"
    ) {
        selectFromCanvasClick(
            event
        );
    }
}

/*
 * APPLY A SELECTION CLICK.
 *
 * Extracted from the Select tool's branch of handleCanvasClick so
 * that the same selection rules - Shift to extend, a second click to
 * open a dimension's editor, a click on nothing to clear - are
 * applied whether the click arrived with Select active or with
 * another tool active and the click being read as a selection.
 *
 * It is deliberately ONE function rather than two similar ones. The
 * behaviour that matters here is not subtle: Shift adds and removes,
 * clicking empty space deselects, clicking a selected dimension twice
 * opens its editor. Duplicating that list for a second entry point
 * would guarantee the two drifted, and a student who learned that
 * Shift works with Select would find it did nothing with Beam.
 *
 * Returns true when the click was consumed as a selection, so the
 * caller knows whether the tool that was active also got a turn.
 */
function selectFromCanvasClick(
    event
) {
    /*
     * Selection uses the actual pointer position, never a snapped
     * construction point. A student clicking the thing they can see
     * means that pixel, not the nearest vertex to it.
     */
    const rawPoint =
        canvasPointFromEvent(
            event,
            false
        );

    const object =
        objectAtPoint(
            rawPoint
        );

    const selectedIds =
        drawingState.selection
            .selectedObjectIds;

    /*
     * Shift extends the selection: clicking an
     * unselected feature adds it, clicking an already
     * selected feature removes it. Without Shift the
     * click replaces the selection as before.
     */
    if (event.shiftKey) {
        if (object) {
            const selected =
                drawingState.selection
                    .selectedObjectIds;

            enggDrawingState.selectObjects(
                drawingState,
                selected.includes(
                    object.id
                )
                    ? selected.filter(
                        id =>
                            id !==
                            object.id
                    )
                    : [
                        ...selected,
                        object.id
                    ]
            );
        }
    } else if (object) {
        /*
         * Clicking a feature that is already the one the
         * list has picked opens its editing page. It is the
         * same deliberate second step as clicking a tree row
         * twice, and it uses the same flag so the two cannot
         * disagree about what counts as a repeat.
         */
        const pickedAlready =
            editorState.featurePanelView === "tree" &&
            editorState.featureTreePickedId === object.id;

        enggDrawingState.selectObject(
            drawingState,
            object.id
        );

        if (pickedAlready) {
            editorState.featurePanelView = "edit";
            editorState.featureTreePickedId = null;
        } else {
            editorState.featureTreePickedId = object.id;
        }

        /*
         * CLICKING A SELECTED DIMENSION AGAIN OPENS ITS EDITOR.
         *
         * A second click on the object already picked is the
         * application's existing "open this thing" gesture -
         * clicking a tree row twice does the same - so a dimension
         * uses it too. That puts the editor one click from the
         * dimension itself rather than in a panel the student has
         * to go and find, which is the point: the thing being
         * edited and the thing being clicked are the same thing.
         *
         * Only for a dimension, and only once it is already the
         * selection: the first click still selects, so a dimension
         * can still be picked among several overlapping features.
         */
        if (
            !pickedAlready &&
            object.type === "dimension" &&
            editorState.featureTreePickedId === object.id
        ) {
            editorState.featureTreePickedId = null;

            openDimensionEditorFor(object);

            return true;
        }
    } else {
        enggDrawingState.clearSelection(
            drawingState
        );
    }

    renderProperties();
    renderCurrentDrawing();

    return true;
}

/*
 * OPEN THE DIMENSION EDITOR FOR A DIMENSION.
 *
 * Reads everything the dialog shows FROM THE DIMENSION, so the editor
 * is never a second source of truth about what a dimension says - it
 * is a view of the model, plus the two kinds of change the model
 * permits.
 *
 * THE TWO KINDS OF CHANGE
 *
 *   DISPLAY   precision and whether units are shown. Belongs to this
 *             one dimension and touches nothing else. Recorded on the
 *             dimension's own style, so it travels with the dimension
 *             when the file is saved.
 *
 *   CALIBRATION
 *             a real-world length, which means the DRAWING is a
 *             different size than assumed. That is a change to the
 *             document, not to the dimension, and it is applied through
 *             the one scale every dimension reads. So it updates all
 *             of them, which is correct: they all measure the same
 *             drawing.
 *
 * Neither path can invent a number. There is no code path from this
 * dialog to "set this dimension's value", because the model has no
 * such field to set and there must never be one.
 *
 * ASSOCIATION IS NEVER TOUCHED
 * ----------------------------
 * Neither path writes `sourceRefs`, `dimensionType` or the geometry
 * they point at. A dimension that was measuring Line 004 before the
 * edit is measuring Line 004 after it, and will go on following it
 * when the line moves.
 */
export function openDimensionEditorFor(object) {
    const measurement =
        enggDimensionModel.measurementFor(
            object,
            drawingState
        );

    const measuredText =
        enggDimensionModel.formatMeasurement(
            object,
            drawingState
        );

    const sourceId = dimensionSourceFeatureId(
        object
    );

    const source =
        sourceId
            ? drawingState.objects.find(
                (candidate) =>
                    candidate.id === sourceId
            )
            : null;

    /*
     * The drawing length, for the calibration field.
     *
     * Stated in DRAWING UNITS, because that is what the student is
     * being asked to confirm. "this line is 41 units long and the real
     * length is 125 mm" is a true sentence; "this line is 41 mm" is
     * not, and would invite the student to edit the wrong number.
     */
    const drawingLength =
        measurement
            ? `${Number(measurement.value).toFixed(2)} drawing units`
            : "";

    /*
     * WHETHER A TYPED VALUE MAY MOVE THE GEOMETRY.
     *
     * On a sheet with a scale, a dimension is an instruction: make the
     * geometry this size, through that scale. On an UNCALIBRATED sheet there
     * is nothing to convert through - the first length DEFINES the scale - so
     * the value calibrates instead and the geometry is left alone. That is
     * the one case where the two acts differ, and it is decided here, once,
     * rather than being guessed at in the dialog.
     */
    const calibrated =
        enggDimensions.isCalibrated(drawingState);

    const resizable =
        calibrated &&
        enggDimensionEdit.dimensionEditable(
            object,
            drawingState
        );

    enggDimensionEditor.open({
        dimensionType: object.dimensionType,
        measuredText,
        drawingLength,
        editable: resizable,
        unit:
            enggDimensions.readScale(
                drawingState
            )?.unit || "mm",
        precision: object.style?.precision ?? 2,
        sourceName: source
            ? source.name || source.type
            : "unknown source",

        onApply: (changes) => {
            const previousObjects =
                enggDrawingState.snapshotDrawing(
                    drawingState
                );

            if (changes.precision !== undefined) {
                object.style = {
                    ...(object.style || {}),
                    precision: changes.precision
                };
            }

            /*
             * A NEW PHYSICAL SIZE: THE GEOMETRY MOVES.
             *
             * The typed value is normalised to millimetres with the unit the
             * student chose, then handed to the one property setter - which
             * performs the single conversion into world units through the
             * sheet's World Scale. Nothing is converted here, so the value
             * cannot cross the scale twice.
             *
             * This is deliberately NOT reachable on an uncalibrated sheet:
             * the dialog does not offer the field until a scale exists.
             */
            let resized = null;

            if (changes.resize) {
                const millimetres =
                    changes.resize.value *
                    (enggQuantities?.LENGTH_UNITS?.[
                        changes.resize.unit
                    ]?.mm ?? 1);

                resized = enggDimensionEdit.applyDimensionValue(
                    object,
                    drawingState,
                    millimetres
                );
            }

            /*
             * A CALIBRATION, not an edit to this dimension.
             *
             * Applied to the document, so every dimension on the sheet
             * is restated against the new scale - which is the point of
             * a calibration. The geometry is not touched: a student who
             * discovers the drawing was the wrong size wants the
             * NUMBERS right, not the shape changed under them.
             */
            if (changes.calibration && measurement) {
                enggDimensions.calibrate(
                    drawingState,
                    measurement.value,
                    changes.calibration.realValue,
                    changes.calibration.unit
                );
            }

            enggDrawingState.commitDrawingChange(
                drawingState,
                previousObjects
            );

            /*
             * Left SELECTED.
             *
             * The dimension did not move and its source did not move,
             * so after an edit it is still the thing the student was
             * working on, and they may well want to nudge it along.
             */
            enggDrawingState.selectObject(
                drawingState,
                object.id
            );

            setToolMessage(
                resized?.ok
                    ? "Size updated - the geometry now matches"
                    : changes.calibration
                        ? "Scale updated - every dimension on this sheet now uses it"
                        : "Dimension display updated"
            );

            renderProperties();
            renderCurrentDrawing();
        },

        onCancel: () => {
            setToolMessage(
                "Dimension edit cancelled"
            );

            renderCurrentDrawing();
        }
    });
}

/*
 * OPEN THE NOTE EDITOR FOR A WRITTEN ANNOTATION.
 *
 * A Note is the student's own words, so double-clicking it (or double-
 * clicking its entry in the Features tree) opens the note editor here,
 * the same "open this thing" gesture the dimension uses.
 *
 * A GENERATED annotation is refused one: its text is a reading of the
 * feature it describes and the next redraw would overwrite anything
 * typed, so there is deliberately no path from here to the editor for
 * one. The guard is the model's own `isGenerated`, so a new generated
 * kind is refused automatically rather than by remembering to list it.
 */
export function openNoteEditorFor(object) {
    if (
        object?.type !== "annotation" ||
        enggAnnotationModel.isGenerated(object.annotationKind)
    ) {
        return false;
    }

    enggNoteEditor?.open({
        text: object.text || "",

        onApply: (text) => {
            const previousObjects = enggDrawingState.snapshotDrawing(
                drawingState
            );

            object.text = text;

            enggDrawingState.commitDrawingChange(
                drawingState,
                previousObjects
            );

            setToolMessage("Note updated");

            renderProperties();
            renderCurrentDrawing();
        },

        onCancel: () => {
            setToolMessage("Note edit cancelled");

            renderCurrentDrawing();
        }
    });

    return true;
}

/*
 * The feature a dimension measures, whichever of its references names
 * one.
 *
 * A dimension's references may name two features (a pair measurement)
 * or one (a single feature, referenced twice). Both are resolved the
 * same way: the first reference that names a feature on this drawing.
 */
function dimensionSourceFeatureId(object) {
    const refs =
        object.sourceRefs || [];

    for (const ref of refs) {
        if (
            ref?.featureId &&
            drawingState.objects.some(
                (candidate) =>
                    candidate.id === ref.featureId
            )
        ) {
            return ref.featureId;
        }
    }

    return null;
}

export function syncSelectionInteraction() {
    if (
        !drawingState.interaction
    ) {
        return;
    }

    if (editorState.selectionDrag) {
        drawingState.interaction.selectionStart =
            editorState.selectionDrag.start;

        drawingState.interaction.selectionCurrent =
            editorState.selectionDrag.current;

        drawingState.interaction.selectionBox =
            editorState.selectionDrag.box;

        drawingState.interaction.selectionDragging =
            editorState.selectionDrag.moved;
    } else {
        drawingState.interaction.selectionStart =
            null;

        drawingState.interaction.selectionCurrent =
            null;

        drawingState.interaction.selectionBox =
            null;

        drawingState.interaction.selectionDragging =
            false;
    }
}
