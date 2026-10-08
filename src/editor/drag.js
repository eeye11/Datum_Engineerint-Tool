/*
 * Dragging a feature or one of its handles.
 */

import enggDrawingState from "../core/model/drawing-state.js";
import enggAnnotate from "../features/annotations/annotate-model.js";
import { renderCurrentDrawing } from "./canvas-render.js";
import { objectsByIds } from "./clipboard-commands.js";
import { COORDINATE_SYSTEM_TYPE } from "./constants.js";
import { drawingCanvas } from "./dom.js";
import { drawingState, editorState } from "./editor-state.js";
import { renderProperties } from "./feature-panel.js";
import { handleAtPoint, isConstructionInProgress, moveObjectAndChildren, rectangleCorners } from "./handles.js";
import { isRectangleLike, objectAtPoint } from "./hit-testing.js";
import { resolvePointerEvent, updateInteractionFeedback } from "./pointer.js";
import { applyRigidBodyHandle, applyStaticsManipulation, isStaticsFeature, moveTrussJoint } from "./statics-attachment.js";
import { canvasPointFromEvent } from "./tool-activation.js";
import { setToolMessage } from "./toolbar-render.js";

export function beginManipulationDrag(
    event
) {
    if (
        event.button !== 0 ||
        event.shiftKey
    ) {
        return false;
    }

    /*
     * A running Modify session owns the pointer, so
     * direct manipulation stays out of its way.
     */
    if (editorState.modifySession) {
        return false;
    }

    /*
     * A construction already UNDER WAY owns the pointer: its
     * first point is down and its second is expected, so the
     * click belongs to it.
     *
     * A tool that is merely ARMED is different. Choosing the
     * Circle tool does not begin a circle; the circle begins on
     * the first click. Until then there is nothing in progress,
     * and a press on a selected feature is a request to move
     * that feature, not to start drawing.
     *
     * Direct manipulation therefore has to win here, or picking
     * a creation tool silently breaks every handle the drawing
     * already has: the press is taken as the tool's first point
     * and the feature is never moved.
     */
    if (isConstructionInProgress()) {
        return false;
    }

    const point =
        canvasPointFromEvent(
            event,
            false
        );

    const hit =
        handleAtPoint(
            point
        );

    /*
     * A LOCKED FEATURE DOES NOT MOVE.
     *
     * Locking is about SPATIAL manipulation and nothing else: a locked feature
     * is still selectable, still inspectable, still listed in the tree, and its
     * properties are still editable through the panel - the lock stops it being
     * dragged, which is what makes it a way to protect a finished part of a
     * drawing while working around it.
     *
     * The check is made here, at the ONE place every manipulation drag begins,
     * rather than in each handle's own branch. A handle added next month is
     * therefore covered without anyone remembering to check.
     */
    const locked =
        (hit && hit.object && hit.object.locked) ||
        (() => {
            const under = objectAtPoint(point);

            return under && under.locked ? under : null;
        })();

    if (locked) {
        setToolMessage(
            `${locked.name || "This feature"} is locked. Unlock it to move it.`
        );

        return false;
    }

    if (hit) {
        /*
         * originals is keyed by object id so the commit
         * path can restore any drag shape uniformly.
         */
        editorState.manipulationDrag = {
            pointerId: event.pointerId,
            object: hit.object,
            kind: hit.handle.kind,

            moved: false,
            start: { ...point },

            /*
             * The WHOLE object is snapshotted, not just its geometry.
             *
             * A drag can move more than a shape: an annotation moves by
             * its placement, a dimension by its offset, and neither of
             * those lives in `geometry`. Snapshotting geometry alone
             * left those changes outside the undo entry, so moving an
             * annotation could not be undone - the one action the
             * student performs most on a label, and the one the
             * specification singles out.
             *
             * Cloning the whole object is the same cost as cloning its
             * geometry and is correct for every feature type, present
             * and future, whatever part of them the drag happens to
             * touch.
             */
            originals: {
                [hit.object.id]:
                    JSON.parse(
                        JSON.stringify(
                            hit.object
                        )
                    )
            }
        };

        drawingCanvas.setPointerCapture(
            event.pointerId
        );

        return true;
    }

    /*
     * ========================================================
     * A DIMENSION IS MOVED BY PRESSING ITS NUMBER
     * ========================================================
     *
     * A coordinate dimension is a thin line with a number on it, and the
     * number is what the student aims at. Pressing it and dragging moves the
     * dimension, with no selecting click first - the press both selects and
     * begins the move.
     *
     * This is claimed for a DIMENSION ONLY, and only when the press is on the
     * dimension itself. Every other feature keeps the rule below, where a
     * press on a selected feature is armed as a possible body drag: claiming
     * that unconditionally is what once stopped a Statics tool receiving its
     * own click.
     *
     * It is armed, not performed: the drag becomes a move only when the
     * pointer actually travels, so a press that stays put is still a click -
     * which selects the dimension, exactly as a click on it always did.
     */
    const overlay =
        objectAtPoint(
            point
        );

    if (
        overlay?.type === "dimension" ||
        overlay?.type === "annotate"
    ) {
        /*
         * ARMED, NOT CLAIMED.
         *
         * The pointer is NOT captured here, and the dimension is not yet
         * moved. A press that stays put must remain an ordinary click - and,
         * when it is the first of a pair, must leave the browser free to fire
         * the `dblclick` that opens the value editor. Capturing the pointer on
         * the press is what stopped that: the capture redirected the second
         * click, so the editor could never be opened by double-clicking the
         * number.
         *
         * The move begins on the first `pointermove` that actually travels,
         * in `updateManipulationDrag`, which is where the drag is promoted.
         *
         * AN ANNOTATE FEATURE IS ARMED THE SAME WAY. A note, a leader or a
         * table is dragged to reposition it, which is an offset move like a
         * dimension's - the press arms it and the first real movement starts
         * it, so a press that stays put is still a click that selects.
         */
        editorState.manipulationDrag = {
            pointerId: event.pointerId,
            object: overlay,
            kind: "annotation-offset",
            moved: false,
            pending: true,
            start: { ...point },
            originals: {
                [overlay.id]:
                    JSON.parse(
                        JSON.stringify(
                            overlay
                        )
                    )
            }
        };

        return true;
    }

    /*
     * Dragging the body of a selected object translates the
     * whole selection.
     *
     * This only claims the press when the object is ALREADY
     * selected. A press on a selected feature is ambiguous: it
     * is equally a click that a drawing tool may want, since the
     * feature the user has just drawn stays selected and its
     * next click is very often at or near it.
     *
     * Claiming it unconditionally meant that choosing a tool
     * and clicking to use it did nothing whenever the thing
     * under the cursor happened to be selected, and a Statics
     * tool asking for a body could never receive its own click.
     *
     * A drag is distinguished from a click by MOVEMENT, and
     * movement is judged once the pointer has actually travelled
     * in updateManipulationDrag. So the drag is armed here, and
     * only becomes a manipulation if the pointer moves; a press
     * that stays put is left for the tool.
     */
    const object = overlay;

    if (
        object &&
        drawingState.selection
            .selectedObjectIds
            .includes(
                object.id
            )
    ) {
        editorState.manipulationDrag = {
            pointerId: event.pointerId,
            object,
            kind: "body",
            moved: false,
            start: { ...point },
            originals: Object.fromEntries(
                objectsByIds(
                    drawingState.selection
                        .selectedObjectIds
                ).map(
                    item => [
                        item.id,
                        JSON.parse(
                            JSON.stringify(
                                item.geometry
                            )
                        )
                    ]
                )
            )
        };

        drawingCanvas.setPointerCapture(
            event.pointerId
        );

        return true;
    }

    return false;
}

/*
 * Live-update geometry while a manipulation drag is in
 * progress, resolving the cursor through the existing
 * snap/inference pipeline.
 */
export function updateManipulationDrag(
    event
) {
    if (
        !editorState.manipulationDrag ||
        editorState.manipulationDrag.pointerId !==
            event.pointerId
    ) {
        return;
    }

    const resolution =
        resolvePointerEvent(
            event
        );

    /*
     * A DIMENSION FOLLOWS THE CURSOR EXACTLY.
     *
     * Every other manipulation writes a VALUE that snapping may legitimately
     * constrain - an endpoint lands on a joint, a body sits on a grid line.
     * A dimension's drag writes a DRAWING position: it says where the number
     * is printed, not what the number measures. Snapping it would pull the
     * text onto whatever geometry happened to be near, so a small drag could
     * jump the label somewhere the student never pointed - and the further
     * they dragged, the more the label would wander from the cursor.
     *
     * So a dimension is moved from the RAW pointer, and the drag offset keeps
     * the text exactly where it was grabbed.
     */
    const draggingDimension =
        editorState.manipulationDrag.object
            ?.type === "dimension";

    /*
     * AN ANNOTATE FEATURE ALSO FOLLOWS THE CURSOR EXACTLY.
     *
     * Its placement is where the mark is printed, not a measurement, so
     * snapping it would pull the words onto whatever geometry happened to
     * be near. Moved from the raw pointer, with the grab offset preserved,
     * so the mark never jumps under the cursor.
     */
    const draggingAnnotate =
        editorState.manipulationDrag.object
            ?.type === "annotate";

    const point =
        draggingDimension || draggingAnnotate
            ? resolution.rawPointerPoint ||
              resolution.effectiveConstructionPoint
            : resolution.effectiveConstructionPoint;

    if (!point) {
        return;
    }

    /*
     * THE DRAG BEGINS ON THE FIRST REAL MOVEMENT.
     *
     * A dimension press arrives here as a PENDING drag - armed on the press
     * but not yet a move, so that a press which stays put can still be a click
     * or the first half of a double-click. The first move that actually
     * travels promotes it: the pointer is captured, the dimension is selected,
     * and from here on it is a live drag.
     */
    if (editorState.manipulationDrag.pending) {
        editorState.manipulationDrag.pending =
            false;

        enggDrawingState.selectObject(
            drawingState,
            editorState.manipulationDrag.object.id
        );

        try {
            drawingCanvas.setPointerCapture(
                event.pointerId
            );
        } catch (error) {
            /*
             * A pointer already released cannot be captured, which is
             * harmless: the drag simply does not continue.
             */
        }
    }

    editorState.manipulationDrag.moved =
        true;

    applyManipulation(
        editorState.manipulationDrag,
        point
    );

    updateInteractionFeedback(
        resolution
    );

    renderCurrentDrawing();
}

export function finishManipulationDrag(
    event
) {
    if (
        !editorState.manipulationDrag ||
        editorState.manipulationDrag.pointerId !==
            event.pointerId
    ) {
        return;
    }

    const drag =
        editorState.manipulationDrag;

    editorState.manipulationDrag =
        null;

    if (
        drawingCanvas.hasPointerCapture(
            event.pointerId
        )
    ) {
        drawingCanvas.releasePointerCapture(
            event.pointerId
        );
    }

    if (!drag.moved) {
        /*
         * The pointer never travelled, so this was a CLICK on a
         * feature rather than a drag of it.
         *
         * The press was armed as a possible drag, but a drag is
         * defined by movement and there was none. The click is
         * therefore handed back to the tool that was waiting for
         * it, which is what lets a Statics tool ask for the body
         * it loads and receive a click on the very feature the
         * student has just drawn.
         *
         * The suppression flag is what stops a real drag from
         * also placing a point, so it is cleared for a press that
         * turned out not to be a drag.
         */
        editorState.selectionClickSuppressed =
            false;

        /*
         * A PRESS ON A DIMENSION THAT DID NOT MOVE IS A CLICK, so it selects
         * the dimension. The double-click path then opens the value editor
         * with the dimension already selected, and a single click leaves it
         * selected with its handles shown - which is what a click on a
         * dimension has always meant.
         */
        if (drag.object?.type === "dimension") {
            enggDrawingState.selectObject(
                drawingState,
                drag.object.id
            );

            renderProperties();
            renderCurrentDrawing();
        }

        return;
    }

    /*
     * The geometry changed live during the drag, so the
     * history entry has to record the geometry as it was
     * BEFORE the drag. drag.originals holds exactly that,
     * so the current objects are restored to their
     * originals, that pre-drag state is pushed onto the
     * undo stack, and the dragged result is then put back.
     */
    const dragged =
        JSON.parse(
            JSON.stringify(
                drawingState.objects
            )
        );

    const originalObjects =
        drawingState.objects.map(
            object =>
                drag.originals[object.id]
                    ? {
                        /*
                         * The pre-drag OBJECT, not just its geometry -
                         * an annotation's move lives in its placement,
                         * and an undo entry holding only geometry would
                         * leave the moved label where it was.
                         *
                         * id and style stay live, as when cancelling.
                         */
                        ...JSON.parse(
                            JSON.stringify(
                                drag.originals[
                                    object.id
                                ]
                            )
                        ),
                        id: object.id,
                        style: object.style
                    }
                    : object
        );

    enggDrawingState.commitDrawingChange(
        drawingState,
        originalObjects
    );

    drawingState.objects =
        dragged;

    renderProperties();
    renderCurrentDrawing();
}

/*
 * Apply the drag to the real feature data.
 */
function applyManipulation(
    drag,
    point
) {
    const object =
        drag.object;

    const g =
        object.geometry;

    /*
     * AN ANNOTATION MOVES BY ITS PLACEMENT, and nothing else.
     *
     * The whole point of an annotation is that it can be put anywhere
     * while staying attached to its feature: moving it changes where the
     * words sit and must not touch the feature, the link, or the text.
     * So only `placement` is written.
     *
     * `placementMode` becomes "manual" because the student has now
     * chosen this position themselves, and from here on it is theirs to
     * keep - the annotation will not snap back when the feature is
     * edited later, which is what stops a moved label being dragged
     * somewhere useless every time a value changes.
     *
     * The leader is not touched. It belongs to the annotation and
     * redraws itself from the new position, so moving the box moves the
     * leader with it rather than leaving it pointing at nothing.
     */
    if (object.type === "annotation") {
        if (
            !point ||
            !Number.isFinite(point.x) ||
            !Number.isFinite(point.y)
        ) {
            return false;
        }

        object.placement = {
            x: point.x,
            y: point.y
        };

        object.placementMode = "manual";

        return true;
    }

    /*
     * AN ANNOTATE FEATURE MOVES BY A WORLD-SPACE DELTA.
     *
     * The delta is taken from the ORIGINAL geometry, not applied
     * cumulatively to the live one, so the mark cannot drift by accumulating
     * rounding, and the grab offset is preserved exactly: the point under the
     * cursor when the drag began stays under the cursor all the way - the
     * mark never jumps first (spec 61).
     *
     * A point-placed mark moves its position; a leader, a callout or an arrow
     * moves BOTH ends by the same delta, so it keeps its shape and length and
     * simply relocates. That is one function in the model, so the two cannot
     * disagree about what "move" means.
     */
    if (object.type === "annotate") {
        if (
            !point ||
            !Number.isFinite(point.x) ||
            !Number.isFinite(point.y)
        ) {
            return false;
        }

        const original =
            drag.originals?.[object.id];

        const start = drag.start;

        if (!original || !start) {
            return false;
        }

        const deltaX = point.x - start.x;
        const deltaY = point.y - start.y;

        /*
         * Rebuild from the ORIGINAL every frame, so the newest delta is
         * applied to the shape as it was, and the annotation lands exactly
         * delta away from where it started.
         */
        object.geometry = JSON.parse(
            JSON.stringify(original.geometry)
        );

        enggAnnotate.translateAnnotation(
            object,
            deltaX,
            deltaY
        );

        return true;
    }

    /*
     * A DIMENSION MOVES BY ITS OFFSET.
     *
     * A dimension states a measurement of something else, and its
     * placement is the offset between the two. Dragging moves that
     * offset; it does not re-measure, and it does not take the offset
     * from the pointer, because the distance between the geometry and
     * the dimension line is the whole of what the student chose when
     * they placed it.
     */
    if (object.type === "dimension") {
        const start =
            drag.start;

        const placement =
            object.placement;

        if (
            !start ||
            !placement ||
            !Number.isFinite(placement.x) ||
            !Number.isFinite(placement.y)
        ) {
            return false;
        }

        object.placement = {
            x: placement.x + (point.x - start.x),
            y: placement.y + (point.y - start.y)
        };

        return true;
    }

    if (drag.kind === "body") {
        const deltaX =
            point.x -
            drag.start.x;

        const deltaY =
            point.y -
            drag.start.y;

        /*
         * A body carries its attached Statics features with
         * it. They are restored to their pre-drag geometry
         * and then translated by the same delta as the body,
         * so a load or a support cannot be left behind at
         * stale world coordinates while the body it acts on
         * moves away.
         */
        const originals =
            drag.originals;

        moveObjectAndChildren(
            object,
            deltaX,
            deltaY,
            originals
        );

        return;
    }

    const original =
        drag.originals;

    if (object.type === "point") {
        const target =
            g.position || g.point || g;

        target.x = point.x;
        target.y = point.y;
        return;
    }

    if (object.type === "line") {
        if (drag.kind === "start") {
            g.start = { x: point.x, y: point.y };
        } else {
            g.end = { x: point.x, y: point.y };
        }

        return;
    }

    if (object.type === "circle") {
        if (drag.kind === "center") {
            g.center = { x: point.x, y: point.y };
        } else {
            g.radius = Math.max(
                Math.hypot(
                    point.x - g.center.x,
                    point.y - g.center.y
                ),
                1e-6
            );
        }

        return;
    }

    if (object.type === "arc") {
        if (drag.kind === "center") {
            g.center = { x: point.x, y: point.y };
            return;
        }

        /*
         * Dragging an endpoint keeps the centre and the
         * other endpoint, and re-derives radius and the
         * swept angle so the arc stays coherent.
         */
        const fixedAngle =
            drag.kind === "startAngle"
                ? g.endAngle
                : g.startAngle;

        const angle =
            Math.atan2(
                point.y - g.center.y,
                point.x - g.center.x
            );

        g.radius = Math.max(
            Math.hypot(
                point.x - g.center.x,
                point.y - g.center.y
            ),
            1e-6
        );

        if (drag.kind === "startAngle") {
            g.startAngle = angle;
        } else {
            g.endAngle = angle;
        }

        const sweep =
            g.endAngle -
            g.startAngle;

        if (g.sweep !== undefined) {
            g.sweep =
                sweep === 0
                    ? g.sweep
                    : Math.sign(sweep) *
                        Math.abs(g.sweep);
        }

        void fixedAngle;
        return;
    }

    /*
     * A truss joint.
     *
     * Moving a joint moves every member that meets it, so the
     * structure stays connected instead of one member pulling
     * away from the rest.
     */
    const jointMatch =
        /^truss-joint(\d)$/.exec(drag.kind);

    if (jointMatch) {
        moveTrussJoint(
            object,
            Number(jointMatch[1]),
            point
        );

        return;
    }

    /*
     * RIGID BODY HANDLES
     *
     * Each handle writes the same defining value the Features
     * panel writes for the body's current shape, so dragging
     * and typing are the same action and cannot disagree.
     */
    if (drag.kind.startsWith("rigid-")) {
        applyRigidBodyHandle(
            object,
            drag,
            point
        );

        return;
    }

    if (isRectangleLike(object)) {
        /*
         * Resize by moving one corner while the opposite
         * corner stays put. A fixed width or height is
         * respected by keeping that dimension unchanged.
         */
        const index =
            Number(
                drag.kind.replace("corner", "")
            );

        const corners =
            rectangleCorners(
                original
            );

        const opposite =
            corners[(index + 2) % 4];

        const minX =
            Math.min(opposite.x, point.x);

        const maxX =
            Math.max(opposite.x, point.x);

        const minY =
            Math.min(opposite.y, point.y);

        const maxY =
            Math.max(opposite.y, point.y);

        g.width = maxX - minX;
        g.height = maxY - minY;
        g.position = {
            x: minX,
            y: maxY
        };
        g.rotation = 0;
        return;
    }

    /*
     * Statics features are edited through their own
     * engineering data, so a handle moves the quantity the
     * handle stands for rather than a generic vertex. Each
     * case writes to the authoritative field, which is the
     * same value the Features panel edits, so the two can
     * never disagree.
     */
    if (isStaticsFeature(object)) {
        applyStaticsManipulation(
            object,
            drag,
            point
        );

        return;
    }

    if (object.type === COORDINATE_SYSTEM_TYPE) {
        /*
         * Dragging an arm end changes only that side's
         * length. The origin and the other three arms are
         * left exactly as they were.
         */
        if (drag.kind === "origin") {
            g.origin = { x: point.x, y: point.y };
            return;
        }

        const lengths = {
            xPositive: "xPositiveLength",
            xNegative: "xNegativeLength",
            yPositive: "yPositiveLength",
            yNegative: "yNegativeLength"
        };

        const key =
            lengths[drag.kind];

        if (!key) {
            return;
        }

        const measured =
            drag.kind.startsWith("x")
                ? Math.abs(point.x - g.origin.x)
                : Math.abs(point.y - g.origin.y);

        g[key] = Math.max(measured, 1e-6);

        return;
    }

    if (
        object.type === "triangle" ||
        object.type === "polygon" ||
        Array.isArray(g.points)
    ) {
        const index =
            Number(
                drag.kind.replace("vertex", "")
            );

        if (object.type === "polygon") {
            /*
             * A polygon is defined by centre, radius and
             * rotation, so dragging a vertex re-derives
             * those rather than storing loose points.
             */
            g.radius = Math.max(
                Math.hypot(
                    point.x - g.center.x,
                    point.y - g.center.y
                ),
                1e-6
            );

            const sides =
                Math.max(
                    3,
                    Math.round(
                        Number(g.sides) || 3
                    )
                );

            g.rotation =
                Math.atan2(
                    point.y - g.center.y,
                    point.x - g.center.x
                ) -
                (index * 2 * Math.PI) / sides;

            return;
        }

        if (Array.isArray(g.points) && g.points[index]) {
            g.points[index].x = point.x;
            g.points[index].y = point.y;
        }
    }
}
