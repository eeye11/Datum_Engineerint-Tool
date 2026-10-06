/*
 * Pointer events on the canvas, and closing menus on outside clicks.
 */

import enggDrawingState from "../core/model/drawing-state.js";
import { isIdleForEditing } from "./annotation-tool.js";
import { handleCanvasClick, openDimensionEditorFor, openNoteEditorFor, syncSelectionInteraction } from "./canvas-click.js";
import { renderCurrentDrawing } from "./canvas-render.js";
import { pickColourFromFeature } from "./colour-picker.js";
import { isConstructionTool } from "./construction-tools.js";
import { drawingCanvas, drawingCoordinates, drawingProperties } from "./dom.js";
import { beginManipulationDrag, finishManipulationDrag, updateManipulationDrag } from "./drag.js";
import { drawingState, editorState } from "./editor-state.js";
import { objectAtPoint } from "./hit-testing.js";
import { updateDrawingCoordinates } from "./pointer.js";
import { beginSelectionDrag, cancelInteraction, finishPolyline, finishSelectionDrag, updateSelectionDrag } from "./selection.js";
import { canvasPointFromEvent } from "./tool-activation.js";
import { closeCoordinateSystemMenu } from "./tool-menus.js";
import { setToolMessage } from "./toolbar-render.js";
import { finishTrussConstruction } from "./truss-tool.js";
import { zoomAtCanvasPoint } from "./viewport.js";

/*
 * Wire this part of the editor to the page. Called once, at start-up,
 * by editor/index.js.
 */
export function installCanvasEvents() {
    if (
        drawingCanvas
    ) {
        drawingCanvas.addEventListener(
            "mousemove",
            updateDrawingCoordinates
        );

        drawingCanvas.addEventListener(
            "click",
            handleCanvasClick
        );

        drawingCanvas.addEventListener(
            "dblclick",
            event => {
                /*
                 * A DIMENSION OR ANNOTATION EDITS ITSELF.
                 *
                 * Checked FIRST, and ahead of every other double-click
                 * rule, for two reasons.
                 *
                 * It is the right behaviour: a double-click is the
                 * application's "open this" gesture, and a dimension's
                 * editor should be reachable by double-clicking the
                 * dimension itself rather than by hunting through the
                 * Features panel.
                 *
                 * And it is a guard. Double-clicks on the canvas were
                 * reaching tool-specific rules - finishing a polyline,
                 * finishing a truss - and a dimension under the cursor
                 * could draw one of those in instead of doing what was
                 * asked. Routing dimensions to their own handler, and
                 * stopping the event there, means no later rule can
                 * reinterpret a double-click that landed on one.
                 *
                 * Only while nothing is being constructed: a double-click
                 * during a live construction belongs to that construction.
                 */
                if (
                    event.detail > 1 &&
                    isIdleForEditing()
                ) {
                    const pointed =
                        objectAtPoint(
                            canvasPointFromEvent(
                                event,
                                false
                            )
                        );

                    /*
                     * A DIMENSION OR ANNOTATION MUST ALREADY BE SELECTED.
                     *
                     * Selecting it and editing it are two different
                     * acts, and the second one has to be asked for
                     * separately. A dimension is a thing you place
                     * and then push around the drawing until it sits
                     * somewhere legible, so almost every interaction
                     * with one is a click, a click-drag, or a
                     * double-click that was really two slow clicks.
                     *
                     * Opening the editor from any of those would make
                     * the drawing unusable: the student could not
                     * select a dimension, could not nudge it into
                     * position, and could not click near it without a
                     * dialog appearing. So the editor needs the one
                     * gesture that cannot be confused with any of
                     * them - a double-click on something already
                     * selected.
                     *
                     * Being already selected is also the honest
                     * signal. It says the student has finished
                     * placing this dimension and is now working ON
                     * it, rather than still putting it there.
                     *
                     * THE GUARD NAMES ANNOTATIONS TOO. It used to
                     * name dimensions only, so a double-click on an
                     * unselected annotation fell through to the
                     * branch below - which stopped the event and
                     * opened no editor, leaving an empty note with
                     * no way to write in it. An annotation is placed
                     * and then written into, and the same two-act
                     * distinction applies, so a click on an
                     * UNSELECTED one only selects it and the second
                     * double-click opens the editor.
                     */
                    if (
                        (pointed?.type === "dimension" ||
                         pointed?.type === "annotation") &&
                        !drawingState.selection
                            .selectedObjectIds.includes(
                                pointed.id
                            )
                    ) {
                        /*
                         * Deliberately NOT stopping the event. The
                         * click that selected the dimension has
                         * done its job, and letting the first click
                         * of the pair stand as an ordinary selection
                         * is what makes the second one meaningful.
                         */
                        return;
                    }

                    if (
                        pointed?.type === "dimension" ||
                        pointed?.type === "annotation"
                    ) {
                        event.preventDefault();
                        event.stopPropagation();

                        /*
                         * The annotation's editor is the note editor.
                         * openNoteEditorFor refuses a GENERATED
                         * annotation, whose text is not writable, and
                         * returns false for one - the double-click is
                         * then swallowed rather than reinterpreted,
                         * which is the honest outcome for a thing that
                         * cannot be opened.
                         */
                        if (pointed.type === "dimension") {
                            openDimensionEditorFor(pointed);
                        } else {
                            openNoteEditorFor(pointed);
                        }

                        return;
                    }
                }

                if (
                    drawingState.activeTool ===
                        "polyline"
                ) {
                    event.preventDefault();

                    finishPolyline();
                    return;
                }

                /*
                 * A truss is finished by double-clicking, which is
                 * the only explicit "I am done" a progressive
                 * construction needs. The click that precedes it has
                 * already placed the last member, so by the time the
                 * double-click arrives there is nothing left to
                 * discard.
                 */
                if (
                    drawingState.activeTool ===
                        "truss" &&
                    drawingState.interaction
                        .phase ===
                        "truss-construct"
                ) {
                    event.preventDefault();

                    finishTrussConstruction();
                    return;
                }

                /*
                 * The Distributed Load is also finished explicitly,
                 * and with Enter rather than a double-click, because a
                 * double-click is two more points along the body. The
                 * guard is here as well so a stray double-click
                 * during construction never commits a half-drawn
                 * load.
                 */
                if (
                    drawingState.interaction
                        .phase ===
                        "distributed-load-build" &&
                    !drawingState.interaction
                        .distributedLoadHasProfile
                ) {
                    return;
                }
            }
        );

        /*
         * Direct manipulation takes priority over box
         * selection: a press on a handle or on the body of a
         * selected object starts a geometry drag, otherwise
         * the press falls through to box selection.
         */
        drawingCanvas.addEventListener(
            "pointerdown",
            event => {
                /*
                 * An armed eyedropper pre-empts every other
                 * canvas interaction, so it works no matter
                 * which tool happens to be active.
                 */
                if (editorState.eyedropperActive) {
                    event.preventDefault();
                    event.stopPropagation();

                    pickColourFromFeature(
                        event
                    );

                    return;
                }

                if (
                    beginManipulationDrag(
                        event
                    )
                ) {
                    return;
                }

                beginSelectionDrag(
                    event
                );
            }
        );

        drawingCanvas.addEventListener(
            "pointermove",
            event => {
                if (editorState.manipulationDrag) {
                    updateManipulationDrag(
                        event
                    );

                    return;
                }

                updateSelectionDrag(
                    event
                );
            }
        );

        drawingCanvas.addEventListener(
            "pointerup",
            event => {
                if (editorState.manipulationDrag) {
                    finishManipulationDrag(
                        event
                    );

                    return;
                }

                finishSelectionDrag(
                    event
                );
            }
        );

        drawingCanvas.addEventListener(
            "wheel",
            event => {
                event.preventDefault();

                zoomAtCanvasPoint(
                    drawingState.camera.zoom *
                        (
                            event.deltaY < 0
                                ? 1.1
                                : 0.9
                        ),
                    event
                );
            },
            {
                passive: false
            }
        );

        drawingCanvas.addEventListener(
            "pointerdown",
            event => {
                if (
                    drawingState.activeTool !==
                    "pan"
                ) {
                    return;
                }

                drawingCanvas.setPointerCapture(
                    event.pointerId
                );

                editorState.panSession = {
                    x:
                        event.clientX,

                    y:
                        event.clientY
                };

                setToolMessage(
                    "Pan view"
                );
            }
        );

        drawingCanvas.addEventListener(
            "pointermove",
            event => {
                if (!editorState.panSession) {
                    return;
                }

                const deltaX =
                    event.clientX -
                    editorState.panSession.x;

                const deltaY =
                    event.clientY -
                    editorState.panSession.y;

                const scale =
                    enggDrawingState.BASE_PIXELS_PER_UNIT *
                    drawingState.camera.zoom;

                enggDrawingState.panCamera(
                    drawingState,

                    drawingState.camera.panX -
                        deltaX /
                        scale,

                    drawingState.camera.panY +
                        deltaY /
                        scale
                );

                editorState.panSession = {
                    x:
                        event.clientX,

                    y:
                        event.clientY
                };

                renderCurrentDrawing();
            }
        );

        drawingCanvas.addEventListener(
            "pointerup",
            event => {
                /*
                 * This handler only manages panning. It must
                 * not overwrite the status message when no pan
                 * was in progress, otherwise a completed drag
                 * or Modify step would be replaced by a stale
                 * instruction.
                 */
                if (!editorState.panSession) {
                    return;
                }

                if (
                    drawingCanvas.hasPointerCapture(
                        event.pointerId
                    )
                ) {
                    drawingCanvas.releasePointerCapture(
                        event.pointerId
                    );
                }

                editorState.panSession = null;

                setToolMessage(
                    drawingState.activeTool ===
                        "coordinate-system-2d"
                        ? "Specify origin"

                        : drawingState.activeTool ===
                            "line"
                            ? "Specify line start point"

                        : "Ready"
                );
            }
        );

        drawingCanvas.addEventListener(
            "mouseleave",
            () => {
                drawingCoordinates.textContent =
                    "X: 0.0 Y: 0.0 mm";

                enggDrawingState.setInteraction(
                    drawingState,
                    {
                        snapCandidate:
                            null,

                        inference:
                            null
                    }
                );

                syncSelectionInteraction();

                renderCurrentDrawing();
            }
        );
    }

    document.addEventListener(
        "pointerdown",
        event => {
            if (
                !editorState.coordinateSystemMenu
            ) {
                return;
            }

            const clickedMenu =
                editorState.coordinateSystemMenu.contains(
                    event.target
                );

            const clickedAnchor =
                editorState.coordinateSystemMenuAnchor?.contains(
                    event.target
                );

            if (
                !clickedMenu &&
                !clickedAnchor
            ) {
                closeCoordinateSystemMenu();
            }
        }
    );

    window.addEventListener(
        "resize",
        closeCoordinateSystemMenu
    );

    /*
     * Clicking anywhere outside the drawing canvas cancels
     * the active tool.
     *
     * The click still reaches its own target, so the user
     * can click another toolbar button and have that tool
     * activate normally; this only guarantees the previous
     * tool does not stay running behind it.
     */
    document.addEventListener(
        "pointerdown",
        event => {
            /*
             * Nothing to do when no tool is running.
             */
            if (
                !editorState.modifySession &&
                !editorState.activeGlobalTool &&
                !isConstructionTool(
                    drawingState.activeTool
                )
            ) {
                return;
            }

            const target =
                event.target;

            /*
             * Clicks on the canvas are the tool's own input,
             * so they are left alone.
             */
            if (
                drawingCanvas.contains(
                    target
                )
            ) {
                return;
            }

            /*
             * Clicks on a toolbar or panel button are handled
             * by that button, which activates its own tool and
             * cancels this one.
             */
            if (
                target.closest &&
                target.closest("button")
            ) {
                return;
            }

            /*
             * Clicks inside the Features panel or a popup are
             * part of the operation, not a cancellation.
             */
            if (
                drawingProperties.contains(
                    target
                ) ||
                target.closest?.(
                    ".drawing-polygon-prompt"
                )
            ) {
                return;
            }

            cancelInteraction();
        }
    );

    window.addEventListener(
        "scroll",
        closeCoordinateSystemMenu,
        true
    );
}
