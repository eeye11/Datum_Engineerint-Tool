/*
 * Selection, cancelling, and finishing a construction.
 */

import enggDrawingState from "../core/model/drawing-state.js";
import enggScaleCalibration from "../core/scale/scale-calibration.js";
import enggCreationDimension from "../features/dimensions/creation-dimension.js";
import enggDimensionEditor from "../features/dimensions/dimension-editor.js";
import enggPlotEditor from "../ui/editors/plot-editor.js";
import { commitAnalysisAxis } from "./analysis-tools.js";
import { objectIntersectsSelection } from "./box-selection.js";
import { syncSelectionInteraction } from "./canvas-click.js";
import { renderCurrentDrawing } from "./canvas-render.js";
import { objectsByIds } from "./clipboard-commands.js";
import { distance } from "./construction-geometry.js";
import { commitDimensionSelection } from "./dimension-placement.js";
import { isDimensionTool } from "./dimension-tool.js";
import { drawingCanvas } from "./dom.js";
import { drawingState, editorState } from "./editor-state.js";
import { renderProperties } from "./feature-panel.js";
import { currentEngineeringMetadata } from "./geometry-creation.js";
import { cancelManipulationDrag, isConstructionInProgress } from "./handles.js";
import { objectAtPoint, pickDerivedMagnitude } from "./hit-testing.js";
import { finishDistributedLoadConstruction, isLoadBuildPhase } from "./load-tool.js";
import { cancelModifySession } from "./modify-tools.js";
import { commitMomentPlacement } from "./preview.js";
import { canvasPointFromEvent } from "./tool-activation.js";
import { activeCategory, closeCoordinateSystemMenu, closePolygonSidesPrompt } from "./tool-menus.js";
import { renderEngineeringTools, setToolMessage } from "./toolbar-render.js";
import { finishTrussConstruction } from "./truss-tool.js";
import { clearGlobalToolHighlight } from "./workspace-controls.js";

export function beginSelectionDrag(
    event
) {
    if (
        drawingState.activeTool !==
            "select" ||
        event.button !== 0
    ) {
        return;
    }

    const point =
        canvasPointFromEvent(
            event
        );

    if (
        objectAtPoint(
            point
        )
    ) {
        /*
         * ========================================================
         * A DRAG THAT STARTS ON A MAGNITUDE BOX
         * ========================================================
         *
         * The box is not a feature, so it is not in `selectedObjectIds` and
         * moving the selection would move the FORCE instead - which is how a
         * student trying to shift a label ends up shifting a load.
         *
         * What is recorded is the SOURCE feature, where the box naturally
         * falls, and how far the pointer has travelled. Nothing is written
         * until the drag ends: the offset is applied to a copy on every
         * frame so the box follows the cursor live, and committed once on
         * release, which is what makes the whole drag one undo step rather
         * than one per frame.
         */
        const picked =
            pickDerivedMagnitude(
                point
            );

        if (picked) {
            const source =
                drawingState.objects.find(
                    candidate =>
                        candidate.id ===
                        picked.sourceFeatureId
                );

            editorState.selectionDrag = {
                pointerId:
                    event.pointerId,
                start: point,
                current: point,
                moved: false,
                box: null,

                /*
                 * The magnitude being moved, kept apart from `box` so the
                 * marquee code does not try to draw one.
                 */
                derived: {
                    sourceFeatureId:
                        picked.sourceFeatureId,
                    natural:
                        picked.annotation
                            .placement,
                    offsetX: 0,
                    offsetY: 0
                }
            };

            drawingCanvas.setPointerCapture(
                event.pointerId
            );

            return;
        }

        return;
    }

    editorState.selectionClickSuppressed =
        false;

    editorState.selectionDrag = {
        pointerId:
            event.pointerId,

        start:
            point,

        current:
            point,

        moved:
            false,

        box: {
            start:
                point,

            end:
                point,

            minX:
                point.x,

            maxX:
                point.x,

            minY:
                point.y,

            maxY:
                point.y
        }
    };

    drawingCanvas.setPointerCapture(
        event.pointerId
    );

    syncSelectionInteraction();
}

export function updateSelectionDrag(
    event
) {
    if (
        !editorState.selectionDrag ||
        editorState.selectionDrag.pointerId !==
            event.pointerId
    ) {
        return;
    }

    const point =
        canvasPointFromEvent(
            event
        );

    const start =
        editorState.selectionDrag.start;

    const moved =
        distance(
            start,
            point
        ) > 1;

    editorState.selectionDrag.current =
        point;

    editorState.selectionDrag.moved =
        moved;

    /*
     * A MAGNITUDE DRAG: the offset follows the pointer, and only the offset.
     *
     * The value itself is still derived, so the box cannot be dragged into
     * disagreeing with the force it belongs to - moving it changes where the
     * number is, never what it says.
     */
    if (editorState.selectionDrag.derived) {
        editorState.selectionDrag.derived.offsetX =
            point.x - start.x;

        editorState.selectionDrag.derived.offsetY =
            point.y - start.y;

        const source =
            objectsByIds([
                editorState.selectionDrag.derived
                    .sourceFeatureId,
            ])[0];

        if (source) {
            source.geometry =
                source.geometry || {};

            source.geometry.magnitudeOffset = {
                x: editorState.selectionDrag.derived.offsetX,
                y: editorState.selectionDrag.derived.offsetY
            };

            renderCurrentDrawing();
        }

        return;
    }

    editorState.selectionDrag.box = {
        start,

        end:
            point,

        minX:
            Math.min(
                start.x,
                point.x
            ),

        maxX:
            Math.max(
                start.x,
                point.x
            ),

        minY:
            Math.min(
                start.y,
                point.y
            ),

        maxY:
            Math.max(
                start.y,
                point.y
            )
    };

    editorState.selectionClickSuppressed =
        editorState.selectionClickSuppressed ||
        moved;

    syncSelectionInteraction();

    if (moved) {
        setToolMessage(
            "Select components"
        );

        drawingState.selection
            .boxSelectionIds =
            drawingState.objects
                .filter(
                    object =>
                        objectIntersectsSelection(
                            object,
                            editorState.selectionDrag.box
                        )
                )
                .map(
                    object =>
                        object.id
                );

        renderProperties();
        renderCurrentDrawing();
    }
}

export function finishSelectionDrag(
    event
) {
    if (
        !editorState.selectionDrag ||
        editorState.selectionDrag.pointerId !==
            event.pointerId
    ) {
        return;
    }

    const currentSelection =
        editorState.selectionDrag;

    /*
     * ========================================================
     * A MOVED MAGNITUDE IS ONE UNDO STEP
     * ========================================================
     *
     * The offset was written to the feature on every frame of the drag, so
     * that the box follows the cursor. Undo is about ACTIONS, and "moved the
     * label" is one of them - recording a history entry per frame would fill
     * the Undo list with the intermediate positions of a single drag.
     *
     * So the state from BEFORE the drag is taken here, the drag is
     * committed against it, and the whole movement is one entry. A click
     * that did not move the box commits nothing at all.
     *
     * This is the same arrangement `commitMove` uses for the selection, and
     * deliberately so - a dragged label and a dragged beam are the same kind
     * of act to the student.
     */
    if (currentSelection.derived) {
        if (currentSelection.moved) {
            const previous =
                enggDrawingState
                    .snapshotDrawing(
                        drawingState
                    );

            /*
             * The offset is already on the feature from the move handler;
             * this records it as a change worth undoing.
             */
            enggDrawingState
                .commitDrawingChange(
                    drawingState,
                    previous
                );

            setToolMessage(
                "Moved the magnitude"
            );
        } else {
            /*
             * A click with no movement: the box goes back where it
             * naturally falls, so a nudge that was abandoned does not leave
             * the label a pixel out of place forever.
             */
            const source =
                objectsByIds([
                    currentSelection.derived
                        .sourceFeatureId,
                ])[0];

            if (source?.geometry) {
                source.geometry.magnitudeOffset =
                    null;
            }

            setToolMessage(
                "Ready"
            );
        }

        editorState.selectionDrag =
            null;

        syncSelectionInteraction();

        renderProperties();
        renderCurrentDrawing();

        if (
            drawingCanvas.hasPointerCapture(
                event.pointerId
            )
        ) {
            drawingCanvas.releasePointerCapture(
                event.pointerId
            );
        }

        return;
    }

    if (
        currentSelection.moved
    ) {
        const ids =
            drawingState.objects
                .filter(
                    object =>
                        objectIntersectsSelection(
                            object,
                            currentSelection.box
                        )
                )
                .map(
                    object =>
                        object.id
                );

        enggDrawingState.selectObjects(
            drawingState,
            ids
        );
    }

    drawingState.selection
        .boxSelectionIds = [];

    if (
        drawingCanvas.hasPointerCapture(
            event.pointerId
        )
    ) {
        drawingCanvas.releasePointerCapture(
            event.pointerId
        );
    }

    editorState.selectionDrag =
        null;

    syncSelectionInteraction();

    setToolMessage(
        "Ready"
    );

    renderProperties();
    renderCurrentDrawing();
}

export function cancelInteraction() {
    if (
        editorState.selectionDrag
    ) {
        if (
            drawingCanvas.hasPointerCapture(
                editorState.selectionDrag.pointerId
            )
        ) {
            drawingCanvas.releasePointerCapture(
                editorState.selectionDrag.pointerId
            );
        }

        editorState.selectionDrag =
            null;
    }

    /*
     * Any transient creation popup goes with the
     * cancelled operation.
     */
    closePolygonSidesPrompt();
    closeCoordinateSystemMenu();

    /*
     * So does a held guideline. It belongs to the construction
     * that raised it, and its timer must not outlive it - a
     * pending redraw would otherwise fire over whatever the
     * student has started next.
     */
    if (editorState.guidelineHoldTimer) {
        clearTimeout(editorState.guidelineHoldTimer);
        editorState.guidelineHoldTimer = null;
    }

    drawingState.interaction.guideline = null;

    /*
     * So does the scale calibration dialog.
     *
     * Closing it here rather than only from its own fields means it
     * cannot be stranded: a modal that survived a tool switch or an
     * Escape aimed at the canvas would look like the application had
     * stopped responding. Nothing is created and no scale is set,
     * which is exactly what abandoning the question should mean.
     */
    enggScaleCalibration?.close();
    enggDimensionEditor?.close();

    /*
     * So does the Plot Editor. It previews onto the sheet, so leaving it
     * open across a tool switch would leave half-typed equations drawn on
     * the drawing with nothing on screen to account for them.
     */
    enggPlotEditor?.close();

    /*
     * A running Modify session is part of the
     * unfinished operation, so it is abandoned too.
     */
    cancelModifySession();

    /*
     * An in-flight manipulation drag has already moved
     * real geometry, so it must be rolled back rather
     * than merely abandoned.
     */
    cancelManipulationDrag();

    /*
     * The active tool highlight always goes with the
     * cancelled operation.
     */
    clearGlobalToolHighlight();

    enggDrawingState.clearInteraction(
        drawingState
    );

    drawingState.selection
        .boxSelectionIds = [];

    drawingState.selection
        .hoveredObjectId = null;

    drawingState.selection
        .selectedObjectIds = [];

    /*
     * Cancelling always returns to Select, so the user
     * is never left inside a half-finished tool.
     */
    enggDrawingState.setActiveTool(
        drawingState,
        "select"
    );

    setToolMessage(
        "Select geometry"
    );

    renderEngineeringTools(
        activeCategory()
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * Complete whatever construction is running, if it can be
 * completed.
 *
 * Returns true when something was actually finished, so the
 * caller knows whether Enter did anything.
 *
 * The question each construction has to answer is "is this
 * complete enough to commit?", not "do I exist?". A truss with
 * a single member is not a truss, a polyline with one point is
 * not a polyline, and a load with no distribution point on it
 * measures nothing. Committing any of those would put something
 * on the drawing that the student did not draw, so those are
 * left running and Enter is a no-op for them.
 */
export function finishActiveConstruction() {
    const interaction =
        drawingState.interaction;

    /*
     * SMART DIMENSION REFERENCE SELECTION. Enter is the commit point:
     * it means "use what I picked" rather than "pick one more".
     *
     * It is checked BEFORE the phase test because the dimension tool
     * records its stage in `dimensionStage`, not in `phase` - so
     * `isConstructionInProgress` is false while references are being
     * collected, and a check that relied on it would never fire.
     */
    if (
        isDimensionTool(drawingState.activeTool) &&
        interaction?.dimensionStage === "selecting"
    ) {
        return commitDimensionSelection();
    }

    if (
        !interaction ||
        !isConstructionInProgress()
    ) {
        return false;
    }

    const phase = interaction.phase;

    /*
     * THE ANALYSIS AXIS, PLACED.
     *
     * Enter means "done" for anything being built, and an axis waiting
     * to be placed is a thing being built. So it is finished here, by
     * the same rule that finishes a truss or a polyline, rather than
     * by a special case at the keyboard handler - which is what makes
     * Escape, the status line and the preview agree that the axis is
     * a live construction.
     *
     * It commits at the height the student chose, which is the same
     * position the preview was showing, because both are read from
     * `placementY`.
     */
    if (phase === "analysis-axis") {
        return commitAnalysisAxis();
    }

    /*
     * A MOMENT BEING SIZED: Enter commits it.
     *
     * The same rule as everything else being built - Enter means
     * "this is finished" - so a student who has the radius they want
     * does not have to find somewhere to click.
     */
    if (phase === "moment-radius") {
        return commitMomentPlacement();
    }

    if (phase === "truss-construct") {
        const members =
            interaction.trussMembers || [];

        /*
         * One member is a line, not a truss. Requiring two
         * matches what a click would do, so Enter and a
         * finishing click agree about when the structure is
         * real.
         */
        if (members.length < 2) {
            setToolMessage(
                "A truss needs at least two members"
            );

            return false;
        }

        finishTrussConstruction();
        return true;
    }

    if (isLoadBuildPhase(interaction)) {
        /*
         * Only the VARYING load can be finished with Enter.
         *
         * The constant load's steps are click-driven - start, end, direction
         * - and Enter has nothing to finish: magnitude is typed in the
         * panel and the direction is chosen on the canvas. Enter used to
         * commit a constant load straight from the build phase, which is
         * what created one with a defaulted direction the student never
         * chose.
         */
        const points =
            interaction
                .distributedLoadPoints ||
            [];

        if (!points.length) {
            return false;
        }

        finishDistributedLoadConstruction();

        return true;
    }

    /*
     * A polyline is identified by its TOOL rather than by a
     * phase of its own: it has no stage after the first point,
     * it simply accumulates points until the student says
     * they have had enough. finishPolyline makes that same
     * judgement, so this only decides whether to ask.
     */
    if (
        drawingState.activeTool ===
            "polyline"
    ) {
        const points =
            interaction.points || [];

        if (points.length < 2) {
            return false;
        }

        finishPolyline();
        return true;
    }

    return false;
}

/*
 * Clear the selection when something is selected and nothing
 * is being built.
 *
 * This is the second half of "Enter means done". A feature
 * stays selected after it is created, so the drawing very often
 * opens a moment with something highlighted that the student
 * has already finished with. Enter then says so.
 *
 * It deliberately does NOT check whether the feature was
 * "just" created. Anything selected counts, because the
 * gesture is the same either way and the outcome is the same:
 * the feature is left exactly as it is and the selection goes
 * away. Restricting it to a short window would make the key
 * work once and then do nothing, which reads as a broken
 * shortcut rather than a deliberate one.
 */
export function deselectIfJustCreated() {
    if (
        isConstructionInProgress()
    ) {
        return false;
    }

    /*
     * A dialog owns the keyboard while it is open. Enter
     * belongs to the dialog's own confirm and cancel.
     */
    if (
        enggScaleCalibration?.isOpen?.() ||
        enggDimensionEditor?.isOpen?.() ||
        enggPlotEditor?.isOpen?.() ||
        enggCreationDimension?.isOpen?.()
    ) {
        return false;
    }

    if (
        !drawingState.selection
            .selectedObjectIds.length
    ) {
        return false;
    }

    enggDrawingState.clearSelection(
        drawingState
    );

    editorState.featureTreePickedId = null;

    renderProperties();
    renderCurrentDrawing();

    return true;
}

export function finishPolyline() {
    const points =
        drawingState.interaction.points;

    if (
        drawingState.activeTool !==
            "polyline" ||
        points.length < 2
    ) {
        return;
    }

    const previousObjects =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    enggDrawingState.addObject(
        drawingState,

        enggDrawingState.geometryFactories.polyline(
            [
                ...points
            ],

            {
                style: {
                    ...drawingState.styleDefaults
                },

                engineering:
                    currentEngineeringMetadata()
            }
        )
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previousObjects
    );

    enggDrawingState.clearInteraction(
        drawingState
    );

    setToolMessage(
        "Ready"
    );

    renderProperties();
    renderCurrentDrawing();
}
