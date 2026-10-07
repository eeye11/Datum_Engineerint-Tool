/*
 * Pointer events on the canvas, and closing menus on outside clicks.
 */

import enggDrawingState from "../core/model/drawing-state.js";
import { isIdleForEditing } from "./annotation-tool.js";
import { beginCreationDrag, finishCreationDrag } from "./creation-drag.js";
import { handleCanvasClick, openDimensionEditorFor, openNoteEditorFor, syncSelectionInteraction } from "./canvas-click.js";
import { renderCurrentDrawing } from "./canvas-render.js";
import { pickColourFromFeature } from "./colour-picker.js";
import { isConstructionTool } from "./construction-tools.js";
import { drawingCanvas, drawingCoordinates, drawingProperties } from "./dom.js";
import { beginManipulationDrag, finishManipulationDrag, updateManipulationDrag } from "./drag.js";
import { drawingState, editorState } from "./editor-state.js";
import { objectAtPoint } from "./hit-testing.js";
import { updateDrawingCoordinates } from "./pointer.js";
import { beginAnnotationDrag, beginSelectionDrag, cancelInteraction, finishPolyline, finishSelectionDrag, updateSelectionDrag } from "./selection.js";
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
                     * A DIMENSION OPENS ON A DIRECT DOUBLE-CLICK.
                     *
                     * Double-clicking the number IS the request to change it,
                     * so a dimension needs no prior selection: the gesture is
                     * unambiguous, and requiring a selecting click first would
                     * put the value one step further away than it needs to be.
                     *
                     * THIS DOES NOT MOVE THE DIMENSION. Opening the editor only
                     * reports the value; only a press-and-drag changes where
                     * the number sits.
                     */
                    if (pointed?.type === "dimension") {
                        event.preventDefault();
                        event.stopPropagation();

                        openDimensionEditorFor(pointed);

                        return;
                    }

                    /*
                     * ANNOTATION STILL NEEDS ITS SELECTING CLICK FIRST.
                     *
                     * A note is placed and then written into, and almost
                     * every interaction with one is a click or a drag to move
                     * it - so an UNSELECTED one only selects on the first of
                     * the pair, and the second double-click opens the editor.
                     * That is the distinction which keeps a stray click from
                     * opening a dialog nobody asked for.
                     */
                    if (
                        pointed?.type === "annotation" &&
                        !drawingState.selection
                            .selectedObjectIds.includes(
                                pointed.id
                            )
                    ) {
                        /*
                         * Deliberately NOT stopping the event. The click that
                         * selected the annotation has done its job, and letting
                         * the first click of the pair stand as an ordinary
                         * selection is what makes the second one meaningful.
                         */
                        return;
                    }

                    if (pointed?.type === "annotation") {
                        event.preventDefault();
                        event.stopPropagation();

                        /*
                         * The annotation's editor is the note editor.
                         * openNoteEditorFor refuses a GENERATED annotation,
                         * whose text is not writable, and returns false for one
                         * - the double-click is then swallowed rather than
                         * reinterpreted, which is the honest outcome for a
                         * thing that cannot be opened.
                         */
                        openNoteEditorFor(pointed);

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

                /*
                 * A MAGNITUDE LABEL IS GRABBED BY ITS OWN TEXT.
                 *
                 * The text of "500 N" is a direct-manipulation target: a
                 * press on it SELECTS the label and BEGINS moving it in one
                 * gesture. This is tried before a creation tool's own press, so
                 * dragging a number never starts a new feature through it; a
                 * press that is not on a label falls straight through.
                 */
                if (
                    beginAnnotationDrag(
                        event
                    )
                ) {
                    return;
                }

                /*
                 * A CREATION IS STARTED BY THE PRESS.
                 *
                 * For a tool that takes its two points from one gesture,
                 * the press IS the first point - so the feature begins
                 * here, the pointer move updates its preview through the
                 * existing pipeline, and the release commits it. Attempted
                 * before direct manipulation and selection because a
                 * creation tool's press is its own input, not a selection;
                 * a press that lands on an existing feature is left to
                 * those handlers by the tool question itself.
                 */
                if (
                    beginCreationDrag(
                        event
                    )
                ) {
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
                /*
                 * A DRAG-TO-CREATE KEEPS ITS PREVIEW LIVE.
                 *
                 * The ordinary `mousemove` listener already redraws the
                 * construction preview, but that is a MOUSE event - a pen or
                 * a touch pointer produces `pointermove` without it. Driving
                 * the same update from here means the preview follows every
                 * kind of pointer, and it is the same function the mouse
                 * path calls, so the two cannot describe different geometry.
                 */
                if (editorState.creationDrag) {
                    updateDrawingCoordinates(
                        event
                    );

                    return;
                }

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
                /*
                 * A DRAG-TO-CREATE ENDS AT THE RELEASE.
                 *
                 * The final cursor position is the second point, so the
                 * feature is committed here rather than waiting for a
                 * second click. Tried first, because the gesture belongs
                 * to the creation and must not be reinterpreted as the
                 * end of a selection or manipulation drag.
                 */
                if (
                    finishCreationDrag(
                        event
                    )
                ) {
                    /*
                     * The browser will fire a `click` for this same
                     * release. It is a consequence of the gesture that has
                     * just committed a feature, not a new first point, so
                     * it is marked consumed and the click handler drops it
                     * instead of starting a second construction.
                     */
                    editorState.creationDragConsumedClick =
                        true;

                    return;
                }

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
                /*
                 * THE MIDDLE BUTTON PANS, WHATEVER TOOL IS ARMED.
                 *
                 * This is the navigation an engineering CAD user already has in
                 * their hands: press the wheel, move, release. It has to work
                 * WITHOUT selecting the Pan tool first, because the whole point
                 * of it is that looking around never interrupts what you are
                 * doing - and it must not steal the tool's own click, so the
                 * event is stopped only for the button that pans.
                 *
                 * The LEFT button keeps its meaning: it belongs to the armed
                 * tool, and to Pan only when Pan is the armed tool.
                 */
                const middle = event.button === 1;

                const panning =
                    middle ||
                    drawingState.activeTool === "pan";

                if (!panning) {
                    return;
                }

                /*
                 * The browser's own middle-click behaviours - autoscroll on
                 * Windows, paste on Linux - are suppressed, because the middle
                 * button is being used for something here.
                 */
                if (middle) {
                    event.preventDefault();
                }

                drawingCanvas.setPointerCapture(
                    event.pointerId
                );

                editorState.panSession = {
                    x: event.clientX,
                    y: event.clientY,

                    /*
                     * Remembered so the release can tell a middle-drag pan
                     * from a Pan-tool pan: a middle click must not leave the
                     * Pan tool armed afterwards.
                     */
                    middle
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
