/*
 * ========================================================
 * CREATING A FEATURE BY PRESS, HOLD, DRAG AND RELEASE
 * ========================================================
 *
 * A construction tool used to take its points one CLICK at a time:
 *
 *     click first point
 *       -> move
 *       -> click second point
 *       -> committed
 *
 * That is two deliberate presses for one gesture. The student has
 * already said where the feature begins when they press the button, and
 * they have already said where it ends when they let go, so the second
 * press carries no information the release does not.
 *
 * So an applicable tool now takes its two cursor-defined points from
 * ONE press:
 *
 *     mousedown at the first point
 *       -> hold, drag: the preview follows the cursor continuously
 *       -> mouseup: the feature is committed at the released point
 *
 * ---------------------------------------------------------------------------
 * THIS WRAPS THE EXISTING PIPELINE; IT DOES NOT REIMPLEMENT IT
 * ---------------------------------------------------------------------------
 *
 * The whole point of this module is that it adds a LIFETIME and nothing
 * else. Everything that already worked - the snapping, the inference, the
 * live preview, the geometry each tool builds, the size popup, the single
 * undo entry - is reached through exactly the same entry point the click
 * used, `beginOrCompleteGeometry`:
 *
 *     pointerdown  ->  begin    (the phase that waited for a first click)
 *     pointermove  ->  (the existing mousemove already redraws the preview)
 *     pointerup    ->  complete (the phase that waited for a second click)
 *
 * So a Line is still built by the Line factory, a Circle by the Circle
 * factory, and a snapped point is still the resolver's own answer on the
 * frame of the release. No geometry, no data model and no snapping rule
 * is touched here.
 *
 * ---------------------------------------------------------------------------
 * WHICH TOOLS, AND WHY NOT ALL OF THEM
 * ---------------------------------------------------------------------------
 *
 * A tool takes part only when its feature is genuinely defined by the
 * first point and the point under the cursor. That is true of a Line, a
 * Rectangle, a Circle, a Triangle's second corner, the two-point half of
 * a Polygon and an Arc, a Point Force, and every Statics span - a Beam,
 * a Cable, a Shaft, a Connection, a Reference Line.
 *
 * It is NOT true of the tools that take a FLOW of points - a polyline,
 * a truss, a varying load - where each point is a separate decision and
 * a release has no single meaning. Those keep their click workflow.
 *
 * Nor is it true of the single-click placement tools - a support, a
 * moment, a point, a coordinate system - which have no second point to
 * take from a release at all.
 *
 * ---------------------------------------------------------------------------
 * THE TRAILING CLICK IS SWALLOWED
 * ---------------------------------------------------------------------------
 *
 * A pointer interaction in a browser also fires a `click` on release.
 * Left alone it would arrive at `handleCanvasClick` and be read as a
 * second point - starting a fresh construction at the released position,
 * which is the "click, move, click" behaviour this replaces, still
 * running underneath the drag. So a drag that began and ended on the
 * canvas marks the click as consumed, and the click handler honours that
 * mark exactly once.
 */
import { isAnnotationTool } from "./annotation-tool.js";
import { isDimensionTool } from "./dimension-tool.js";
import { drawingState, editorState } from "./editor-state.js";
import { beginOrCompleteGeometry } from "./geometry-creation.js";
import { canvasPointFromEvent } from "./tool-activation.js";
import { objectAtPoint } from "./hit-testing.js";
import { resolvePointerEvent } from "./pointer.js";
import { STATICS_PLACEMENT_TOOLS, STATICS_SPAN_TOOLS } from "./statics-tools.js";

/*
 * The Geometry tools whose feature is a start point and an end point.
 *
 * A Triangle and a Polygon take one more point after this one, so the
 * drag supplies their FIRST span and the tool's own remaining steps
 * carry the rest - the multi-point workflow is preserved, one gesture at
 * a time.
 */
const DRAG_GEOMETRY_TOOLS = [
    "line",
    "rectangle",
    "circle",
    "triangle",
    "polygon",
    "arc"
];

/*
 * Tools that take a FLOW of points rather than one start and one end.
 *
 * Named explicitly, so "this tool is not a drag tool" is a statement
 * somebody made rather than something a future reader has to infer from
 * a list of exceptions.
 */
const PROGRESSIVE_TOOLS = [
    "polyline",
    "truss"
];

/*
 * The distributed-load tools, whose SPAN is a start and an end like a Line's.
 *
 * Their construction continues past the span - a constant load is then sized
 * by one cursor vector, a varying load by a sequence of profile points - so
 * only the SPAN step is a drag. The rest keeps its own interaction, which is
 * why these tools are handled by name rather than by a blanket rule.
 */
const LOAD_SPAN_TOOLS = [
    "distributed-load",
    "varying-distributed-load"
];

/*
 * The phases a RELEASE completes.
 *
 * These are the phases that already hold an anchor and are waiting for the
 * point under the cursor - which is exactly what the release supplies. A
 * phase that is not here is not a span waiting for a point: a Polygon waiting
 * for its side count is waiting for a typed answer, and a load's VECTOR and
 * BUILD steps walk through their own construction.
 */
const DRAG_CONTINUE_PHASES = [
    "first-point",
    "statics-span",
    "polygon-centre",
    "polygon-first",

    /*
     * The arc's phases, one per point it is still waiting for.
     *
     * A centrepoint arc takes centre, start, end; a three-point arc takes
     * three points on the curve. Each of those steps is a point under the
     * cursor, so each is finished by a release - and every one of them is
     * listed, because a phase left off this list would strand the arc
     * half-built after the student let go of it.
     */
    "arc-centre",
    "arc-sweep",
    "arc-first",
    "arc-second",

    /*
     * A LOAD'S SPAN, once it holds its first end.
     *
     * `distributed-load-span` is a span traced in empty space, where the
     * press set the start; `distributed-load-end` is the same on a body, one
     * gesture later. In both, the release supplies the second end.
     */
    "distributed-load-span",
    "distributed-load-end"
];

/*
 * The phases a PRESS supplies a point to.
 *
 * A load dropped on a body first answers "which body?" (one gesture), then
 * waits in `distributed-load-start` for the loaded region's first end. There
 * is no anchor yet, so the press IS that end - the same role the first of the
 * old two clicks played - and the release supplies the second.
 */
const DRAG_PRESS_POINT_PHASES = [
    "distributed-load-start"
];

/*
 * Whether the active tool creates its feature by press-drag-release.
 *
 * Asked of the TOOL, and only of the tool. Whether the current press is
 * one of these tools' creations is then decided from the interaction
 * state, so a press that lands on an existing feature with such a tool
 * armed still belongs to the ordinary selection path.
 */
export function isDragCreationTool(
    toolId
) {
    if (!toolId) {
        return false;
    }

    /*
     * A dimension, an annotation and an analysis diagram are not
     * two-point shapes: they collect references or name a body. They go
     * through the construction pipeline for its SNAPPING, which is why
     * they are construction tools at all, but their completion is their
     * own affair and a drag would take it away from them.
     */
    if (
        isDimensionTool(toolId) ||
        isAnnotationTool(toolId) ||
        toolId === "analysis"
    ) {
        return false;
    }

    /*
     * The progressive tools keep their own click-driven construction.
     */
    if (PROGRESSIVE_TOOLS.includes(toolId)) {
        return false;
    }

    /*
     * BOTH DISTRIBUTED LOADS TAKE THEIR SPAN FROM A DRAG.
     *
     * The span is a start and an end, exactly as a Line's is, so it is one
     * gesture. Their later steps - the magnitude/direction vector, the profile
     * points - are their own and are left alone by this module.
     */
    if (LOAD_SPAN_TOOLS.includes(toolId)) {
        return true;
    }

    /*
     * A single-click placement tool has no second point to take from a
     * release: a support, a particle or a reference point is placed where
     * the press landed. A Moment is NOT in this table (it is placed in
     * free space by a click), so it is excluded by name below.
     */
    if (
        STATICS_PLACEMENT_TOOLS[toolId] ||
        toolId === "moment" ||
        toolId === "point" ||
        toolId === "coordinate-system-2d"
    ) {
        return false;
    }

    /*
     * A Statics span - a Beam, a Cable, a Shaft, a Connection, a
     * Reference Line, a Point Force - IS a two-point creation, so it
     * takes part. Asked of the span table because that table is the
     * authoritative statement of which Statics tools span two points.
     */
    if (STATICS_SPAN_TOOLS[toolId]) {
        return true;
    }

    return DRAG_GEOMETRY_TOOLS.includes(toolId);
}

/*
 * Whether a press at this point would SELECT something rather than
 * begin a new feature.
 *
 * The same rule the click pipeline applies, asked the same way: with a
 * creation tool armed, a press on an existing feature selects it. It is
 * answered from the RAW pointer position, before any snapping has pulled
 * the cursor to a nearby feature that the student did not aim at.
 */
function pressSelectsExistingObject(
    event
) {
    const raw =
        canvasPointFromEvent(
            event,
            false
        );

    if (!raw) {
        return false;
    }

    return Boolean(
        objectAtPoint(raw)
    );
}

/*
 * Begin (or continue) a creation from a press.
 *
 * Returns true when the press belongs to the drag workflow, so the caller
 * leaves it alone and lets the pointerup commit the next point.
 *
 * THREE CASES, decided by the phase the press arrives in:
 *
 *   IDLE: the press STARTS the feature. The press is the first point, so
 *   the existing construction entry point is called here, exactly as the
 *   first click used to be.
 *
 *   A "CONTINUE" PHASE: the construction already holds its anchor - a
 *   Triangle's first corner, an Arc's centre, a load's span start - and is
 *   waiting for the point under the cursor. Nothing is called on the press:
 *   the release supplies that point, and the fixed anchor is left exactly
 *   where the earlier gesture put it.
 *
 *   A "PRESS TAKES A POINT" PHASE: the tool is waiting for the FIRST end of
 *   a span that only a body selection preceded (`distributed-load-start`).
 *   There is no anchor yet, so the press itself is that end - the entry point
 *   is called here, exactly as the first of the two clicks used to be.
 */
export function beginCreationDrag(
    event
) {
    if (
        editorState.creationDrag ||
        !isDragCreationTool(
            drawingState.activeTool
        )
    ) {
        return false;
    }

    const phase =
        drawingState.interaction.phase;

    const idle =
        phase === "idle";

    const continues =
        DRAG_CONTINUE_PHASES.includes(phase);

    const takesPoint =
        DRAG_PRESS_POINT_PHASES.includes(phase);

    /*
     * A press that is neither the start of a feature nor the next point of
     * one belongs to whatever else is running - a load being built, a
     * truss, a dimension - and is left to that.
     */
    if (
        !idle &&
        !continues &&
        !takesPoint
    ) {
        return false;
    }

    /*
     * A press on an existing feature selects it instead, exactly as a
     * click would - so the drag must not begin a feature through it. Only
     * asked when STARTING: an anchor already placed is the student's own
     * geometry, and the next point of their own construction may well land
     * on it.
     */
    if (
        idle &&
        pressSelectsExistingObject(event)
    ) {
        return false;
    }

    /*
     * START, or take this span's first end. Both are "the press is a point",
     * so both run the existing construction entry point and then arm a
     * session for the release to finish.
     */
    if (idle || takesPoint) {
        beginOrCompleteGeometry(
            resolvePointerEvent(event)
        );

        /*
         * The construction is only a DRAG if the press actually started
         * one. A tool that routed itself elsewhere - or whose first point
         * could not be resolved - leaves nothing in a phase this drag can
         * complete, and arming a session for it would make the release
         * swallow a click for no reason.
         */
        if (
            !DRAG_CONTINUE_PHASES.includes(
                drawingState.interaction.phase
            )
        ) {
            return false;
        }
    }

    editorState.creationDrag = {
        pointerId: event.pointerId
    };

    return true;
}

/*
 * Complete a creation on release.
 *
 * The final cursor position is the second point, resolved through the
 * same snapping pipeline a click would have used - so a snap to an
 * endpoint is committed exactly as it was previewed.
 *
 * Returns true when this release ends a creation this drag owned, so the
 * trailing click is swallowed rather than read as a new first point.
 */
export function finishCreationDrag(
    event
) {
    const session =
        editorState.creationDrag;

    if (!session) {
        return false;
    }

    editorState.creationDrag = null;

    /*
     * THE FINAL POINT AT THE RELEASE.
     *
     * The pointer has been moving, so the interaction already holds the
     * latest previewed point - but that point was resolved on the last
     * move event, and the release itself is the frame the student aimed
     * at. So it is resolved again, from this event, exactly as the click
     * handler resolves a click, and for the same reason: the second point
     * must never be a stale snap.
     */
    if (
        DRAG_CONTINUE_PHASES.includes(
            drawingState.interaction.phase
        )
    ) {
        beginOrCompleteGeometry(
            resolvePointerEvent(event)
        );
    }

    /*
     * The release ends the gesture whether or not the phase was still
     * completable - it may have been cancelled mid-drag - so the click is
     * consumed either way.
     */
    return true;
}
