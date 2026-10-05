/*
 * Placing distributed loads: choosing the body, the span, the magnitude and the direction.
 */

import enggDrawingState from "../core/model/drawing-state.js";
import enggLoadProfile from "../features/analysis/load-profile.js";
import { renderCurrentDrawing } from "./canvas-render.js";
import { drawingState } from "./editor-state.js";
import { renderProperties } from "./feature-panel.js";
import { distanceToSegment, isRectangleLike, objectPoints } from "./hit-testing.js";
import { cancelInteraction } from "./selection.js";
import { staticsAttachedStyle, staticsBodyAtPoint } from "./statics-attachment.js";
import { setToolMessage } from "./toolbar-render.js";

/*
 * THE DISTRIBUTED LOAD, AS ONE CONTINUOUS FEATURE
 *
 * A distributed load is not a row of Point Forces. It is one
 * object with a body, a single direction for the whole of it,
 * and a handful of magnitude-defining points. Everything the
 * student does during construction feeds those three things,
 * and the row of arrows is the renderer sampling the result.
 *
 * The workflow is therefore:
 *
 *   1. Click a body. If the click lands on nothing, the tool
 *      falls back to the Line-style two-click span, so a load
 *      can be drawn across empty space exactly as a line can.
 *   2. Move to set the first force: its position along the body
 *      comes from where the cursor is over the body, and its
 *      magnitude and direction come from the offset of the
 *      cursor from that position. This is the ordinary Point
 *      Force interaction, so there is no dialog to open.
 *   3. Click to commit that first force. From here on the
 *      direction is fixed: moving the cursor only changes the
 *      magnitude, and the cursor's position along the body says
 *      where that magnitude applies.
 *   4. Click to add further defining points, then press Enter.
 *
 * Every one of those steps is graphical, in the same rhythm as
 * drawing a polyline.
 */

/*
 * How far a click must be from a body to count as "not on the
 * body" and so begin a span selection instead.
 */
const DISTRIBUTED_LOAD_BODY_PICK_TOLERANCE_PX = 8;

/*
 * The ends of a body, in the order a load runs along them.
 *
 * Anything the drawing supports as a body is accepted: a Line, a
 * Truss member set, a Beam, a Cable, a Shaft, a rigid body, or
 * any other geometry with a span. Nothing here restricts the
 * load to lines, because a load acts on whatever is loaded.
 */
function distributedLoadBodySpan(
    body
) {
    if (!body) {
        return null;
    }

    const geometry = body.geometry;

    if (!geometry) {
        return null;
    }

    /*
     * A Truss the student built is a set of members. Loading a
     * truss means loading one of its members, so the member the
     * cursor is on is the body.
     */
    if (
        Array.isArray(geometry.members) &&
        geometry.members.length
    ) {
        return {
            start: geometry.members[0].start,
            end: geometry.members[0].end,
            body: null
        };
    }

    if (
        geometry.start &&
        geometry.end &&
        Number.isFinite(geometry.start.x) &&
        Number.isFinite(geometry.end.x)
    ) {
        return {
            start: geometry.start,
            end: geometry.end,
            body: null
        };
    }

    /*
     * A rigid body has no span, so the chord across it is used:
     * a load laid across the diagonal of a body is the one
     * region a point on the body always identifies.
     */
    if (isRectangleLike(body)) {
        const corners =
            objectPoints(body);

        if (corners.length >= 2) {
            return {
                start: corners[0],
                end: corners[corners.length - 1],
                body: null
            };
        }
    }

    if (geometry.position) {
        return {
            start: geometry.position,
            end: geometry.position,
            body: null
        };
    }

    return null;
}

/*
 * The member of a Truss that a point lies on, so a load placed
 * on a truss follows the member it was drawn on rather than an
 * arbitrary one.
 */
function distributedLoadTrussMemberAt(
    point
) {
    const tolerance =
        DISTRIBUTED_LOAD_BODY_PICK_TOLERANCE_PX /
        Math.max(
            enggDrawingState
                .BASE_PIXELS_PER_UNIT *
                (drawingState.camera.zoom || 1),
            1e-6
        );

    for (const object of drawingState.objects) {
        if (
            object.type !== "truss" ||
            !Array.isArray(object.geometry?.members)
        ) {
            continue;
        }

        const member =
            object.geometry.members.find(
                candidate =>
                    distanceToSegment(
                        point,
                        candidate.start,
                        candidate.end
                    ) <= tolerance
            );

        if (member) {
            return { object, member };
        }
    }

    return null;
}

/*
 * The geometry a distributed load can be applied to.
 *
 * A load acts on whatever is loaded, so the eligible bodies are
 * not only the dedicated Statics ones. Anything the drawing
 * supports as a body is accepted: a Line, a Truss member, a
 * Beam, a Cable, a Shaft, a rigid body, or any other geometry
 * with a span. Restricting a load to lines would rule out most
 * of the structures a load is actually drawn on.
 */
function distributedLoadSpanBodyAt(
    point
) {
    const tolerance =
        DISTRIBUTED_LOAD_BODY_PICK_TOLERANCE_PX /
        Math.max(
            enggDrawingState
                .BASE_PIXELS_PER_UNIT *
                (drawingState.camera.zoom || 1),
            1e-6
        );

    /*
     * The bodies are searched newest first, so a load attaches to
     * the most recently drawn one when two overlap, which is what
     * a click on the topmost feature would do.
     */
    for (
        let index = drawingState.objects.length - 1;
        index >= 0;
        index -= 1
    ) {
        const object =
            drawingState.objects[index];

        const span =
            distributedLoadBodySpan(object);

        if (!span) {
            continue;
        }

        if (
            distanceToSegment(
                point,
                span.start,
                span.end
            ) <= tolerance
        ) {
            return object;
        }
    }

    return null;
}

/*
 * Whether the active tool is the VARYING distributed load, which
 * is the one built from a profile of magnitude points. The plain
 * Distributed Load is the constant one.
 *
 * The two are told apart by the active tool rather than by two
 * separate copies of the construction, so the body selection,
 * the span fallback and the snapping they share stay genuinely
 * shared.
 *
 * A tool id may be passed to ask about that tool specifically.
 * The click router needs to recognise the varying load by id,
 * because a tool that is not a construction tool must still be
 * admitted through this one check; leaving it to read the active
 * tool there would make the answer depend on what happened to be
 * selected rather than on the tool being tested.
 */
export function isVaryingLoadTool(toolId) {
    const id =
        toolId === undefined
            ? drawingState.activeTool
            : toolId;

    return id === "varying-distributed-load";
}

/*
 * The interaction phases in which a load is being defined, split
 * into the two stages the tools share.
 *
 * Both stages need to know what "square" means for the tool, so
 * the recognition is named once here rather than spelled out at
 * each call site: the span stage traces the loaded region, and
 * the build stage draws the forces that act on it.
 */
export function isLoadSpanPhase(interaction) {
    return (
        interaction?.phase ===
            "distributed-load-span"
    );
}

export function isLoadBuildPhase(interaction) {
    return (
        LOAD_BUILD_PHASES.has(
            interaction?.phase
        )
    );
}

/*
 * Begin a distributed load.
 *
 * Both load tools start the same way, because both load a BODY
 * first:
 *
 *   - a click on an existing body loads that body;
 *   - a click in empty space has no body to act on, so the tool
 *     falls back to the Line-style two-click span, using exactly
 *     the snapping and inference a Line uses.
 *
 * They diverge from there. A Varying Distributed Load is built up
 * from a sequence of magnitude points; a Distributed Load is a
 * single magnitude across the whole span, so it finishes as soon
 * as that magnitude is given.
 */
export function beginDistributedLoadConstruction(
    resolution
) {
    const point =
        resolution.effectiveConstructionPoint;

    if (!point) {
        return;
    }

    const trussHit =
        distributedLoadTrussMemberAt(
            point
        );

    if (trussHit) {
        startDistributedLoadBuild({
            start: trussHit.member.start,
            end: trussHit.member.end,
            parentId: trussHit.object.id
        });

        return;
    }

    const body =
        staticsBodyAtPoint(point) ||
        distributedLoadSpanBodyAt(point);

    const span =
        distributedLoadBodySpan(body);

    if (span) {
        /*
         * ========================================================
         * SELECTING A BODY IS ONE DECISION, NOT FOUR
         * ========================================================
         *
         * This handed the body's own endpoints to the constant load as its
         * START and END, so the moment a member was clicked it acquired a
         * load across its entire length - before the student had been asked
         * where the load acts, how strong it is, or which way it pushes.
         *
         * The body is all this click decides. The constant load takes only
         * the body's id and asks for the region next.
         *
         * The VARYING load keeps its old behaviour here, because building a
         * profile genuinely does start from the span the student traced -
         * that is what tracing it means.
         */
        if (isVaryingLoadTool()) {
            startDistributedLoadBuild(
                span,
                body?.id
            );
        } else {
            startConstantLoadBuild(
                body?.id
            );
        }

        return;
    }

    /*
     * Nothing under the cursor, so there is no body to load. The
     * two-click span takes over, anchored here, and the load's
     * body is the region the student traces.
     */
    enggDrawingState.setInteraction(
        drawingState,
        {
            ...resolution,

            phase:
                "distributed-load-span",

            startPoint: point,

            currentPoint: point,

            points: [point],

            parentId: undefined
        }
    );

    setToolMessage(
        "Specify the end of the loaded span"
    );

    renderCurrentDrawing();
}

/*
 * Move from choosing the body into drawing the load on it.
 */
/*
 * ========================================================
 * THE FOUR PHASES OF A DISTRIBUTED LOAD
 * ========================================================
 *
 * One set, used by the click handler and by the status line, so the step the
 * tool THINKS it is on and the step it is DISPLAYED as cannot come apart.
 */
export const LOAD_BUILD_PHASES = new Set([
    "distributed-load-start",
    "distributed-load-end",
    "distributed-load-magnitude",
    "distributed-load-direction",
]);

/*
 * WHAT EACH STEP SAYS IT IS WAITING FOR.
 *
 * One line per phase, in one place, so the instruction cannot describe a
 * different step from the one the tool is actually in - which is how a tool
 * ends up asking for a direction while it is waiting for a point.
 */
const LOAD_BUILD_INSTRUCTIONS = {
    "distributed-load-start":
        "Specify start point",
    "distributed-load-end":
        "Specify end point",
    "distributed-load-magnitude":
        "Specify load magnitude",
    "distributed-load-direction":
        "Specify load direction",
};

export function loadBuildInstruction(
    phase
) {
    return (
        LOAD_BUILD_INSTRUCTIONS[phase] ||
        "Specify start point"
    );
}

/*
 * The midpoint of the loaded region, in world space.
 *
 * Used as the origin for DIRECTION selection. It is a temporary origin and
 * is never stored: pointing somewhere else changes which way the arrows
 * face, and must not move the load along the body.
 */
export function distributedLoadRegionMidpoint() {
    const start =
        drawingState.interaction
            .loadStart;

    const end =
        drawingState.interaction
            .loadEnd;

    if (!start || !end) {
        return null;
    }

    return {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2,
    };
}

/*
 * IS THIS POINT ON THE BODY THE LOAD IS ALREADY ATTACHED TO?
 *
 * The second click has to be on the same member as the first. A click on a
 * different one is a different load, and switching silently would leave a
 * load on the body the student thought they had abandoned.
 */
export function distributedLoadPointOnBody(
    point
) {
    const sourceId =
        drawingState.interaction
            .loadSourceId;

    if (!sourceId) {
        /*
         * With no body - the load was drawn in empty space rather than
         * attached - anywhere on the sheet is acceptable, because there is
         * no second member to land on.
         */
        return true;
    }

    const body =
        drawingState.objects.find(
            candidate =>
                candidate.id === sourceId
        );

    if (!body) {
        return true;
    }

    const tolerance =
        8 / Math.max(
            drawingState.camera.zoom,
            0.25
        );

    const start =
        body.geometry?.start;
    const end =
        body.geometry?.end;

    if (
        !start ||
        !end
    ) {
        return false;
    }

    return (
        enggLoadProfile.fractionAlong(
            { start, end },
            point
        ) >= -0.001 &&
        enggLoadProfile.fractionAlong(
            { start, end },
            point
        ) <= 1.001
    );
}

/*
 * THE DIRECTION THE POINTER IS CURRENTLY AIMING, or null when it is not
 * being chosen.
 *
 * World-space, from the pointer's direction about the midpoint of the
 * selected region - the same origin the commit uses, so what is previewed
 * and what is stored are the same reading of the same pointer. A click on
 * the origin aims nowhere and reports nothing rather than a zero vector.
 */
export function loadDirectionUnderPointer() {
    if (
        drawingState.interaction.phase !==
            "distributed-load-direction"
    ) {
        return null;
    }

    const origin =
        distributedLoadRegionMidpoint();

    const cursor =
        drawingState.interaction
            .currentPoint ||
        drawingState.interaction
            .effectiveConstructionPoint;

    if (!origin || !cursor) {
        return null;
    }

    const dx = cursor.x - origin.x;
    const dy = cursor.y - origin.y;

    const length = Math.hypot(dx, dy);

    if (length < 1e-6) {
        return null;
    }

    /*
     * THE SAME SHAPE AS COMMITTED, so the preview and the feature store one
     * kind of direction. A preview in degrees and a feature in a unit vector
     * would look the same until the first edit, and then disagree.
     */
    return {
        dx: dx / length,
        dy: dy / length,
    };
}

export function startDistributedLoadBuild(
    span,
    parentId
) {
    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    enggDrawingState.clearInteraction(
        drawingState
    );

    enggDrawingState.setInteraction(
        drawingState,
        {
            phase:
                "distributed-load-build",

            distributedLoadStart: {
                ...span.start
            },

            distributedLoadEnd: {
                ...span.end
            },

            distributedLoadDirection: null,

            distributedLoadPoints: [],

            distributedLoadHasProfile: false,

            parentId
        }
    );

    setToolMessage(
        "Move to set the first force direction and magnitude, then click"
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * The distributed load the interaction currently describes.
 *
 * It is built fresh from the interaction on every preview and
 * every commit, so the construction state and the stored
 * feature can never describe different loads.
 */
export function distributedLoadDraft(
    interaction,
    cursor
) {
    const start =
        interaction?.distributedLoadStart;

    const end =
        interaction?.distributedLoadEnd;

    if (!start || !end) {
        return null;
    }

    const points = [
        ...(interaction
            .distributedLoadPoints ||
            [])
    ];

    let direction =
        interaction
            .distributedLoadDirection;

    /*
     * The first force is read straight off the cursor: the
     * projection of the cursor onto the body is where the load
     * acts, and the offset from there to the cursor is the force
     * vector itself. That is the same click-move-click
     * construction a Point Force uses, so the student is
     * already used to it.
     */
    if (direction === null && cursor) {
        const t =
            enggLoadProfile.fractionAlong(
                { start, end },
                cursor
            );

        const base =
            enggLoadProfile.pointAlong(
                { start, end },
                t
            );

        const dx = cursor.x - base.x;
        const dy = cursor.y - base.y;

        if (Math.hypot(dx, dy) > 1e-9) {
            direction =
                Math.atan2(dy, dx) *
                180 /
                Math.PI;
        }
    }

    const resolved =
        direction === null
            ? enggLoadProfile
                .DEFAULT_LOAD_DIRECTION
            : direction;

    const vector =
        enggLoadProfile.unitVector(
            resolved
        );

    /*
     * Once the direction is established, the magnitude at a
     * point is the cursor's offset MEASURED ALONG that
     * direction. Measuring along the force rather than radially
     * is what makes the arrows grow as the cursor is pulled
     * further out along the load, and it keeps the student
     * working in the one direction they chose at the start.
     */
    const magnitudeAt = point => {
        if (!cursor) {
            return 0;
        }

        const base =
            enggLoadProfile.pointAlong(
                { start, end },
                point
            );

        const dx = cursor.x - base.x;
        const dy = cursor.y - base.y;

        return Math.max(
            0,
            dx * vector.x + dy * vector.y
        );
    };

    /*
     * The live point follows the cursor along the body, so the
     * student sees the shape of the load growing as they move
     * before committing to it.
     */
    if (cursor) {
        const t =
            enggLoadProfile.fractionAlong(
                { start, end },
                cursor
            );

        const magnitude =
            magnitudeAt(t);

        const existing =
            points.findIndex(
                point =>
                    Math.abs(point.t - t) < 1e-6
            );

        if (existing >= 0) {
            points[existing] = {
                t,
                magnitude
            };
        } else {
            points.push({
                t,
                magnitude
            });
        }
    }

    const draft = {
        start,
        end,
        direction: resolved,
        points
    };

    return draft;
}

/*
 * The world positions of a load's distribution points, for the
 * shared snap system.
 *
 * A VARYING DISTRIBUTED LOAD is defined by placing forces one at
 * a time, and each one is a real, visible arrow at a real place
 * on the body. So the point the student has already placed is
 * something they will naturally want to line the NEXT one up
 * against - two forces at the same height read as "the same
 * magnitude", and getting there by eye is what the cursor is for.
 *
 * The profile stores each point as a FRACTION along the body
 * plus a magnitude, because that is what makes the profile
 * independent of the body's own geometry. Turning those back
 * into world positions is what the snap system needs, and doing
 * it here rather than storing world coordinates keeps the two
 * from ever disagreeing: a body that moved carries its profile
 * with it, and the published points move with it.
 *
 * Each is published as a zero-length segment, so the existing
 * system treats them as the points they are - endpoints to snap
 * to, and alignment references - with no new snap type and no
 * special case for loads.
 */
function distributedLoadSnapGeometry(
    interaction
) {
    const start =
        interaction
            ?.distributedLoadStart;
    const end =
        interaction
            ?.distributedLoadEnd;

    if (!start || !end) {
        return [];
    }

    return (
        interaction
            .distributedLoadPoints ||
        []
    ).map(point => {
        const along =
            enggLoadProfile.pointAlong(
                { start, end },
                point.t
            );

        if (!along) {
            return null;
        }

        /*
         * The force's own TAIL, not its tip: that is the point
         * on the body where the load acts, and it is the point
         * that stays meaningful as the magnitude changes.
         */
        return {
            start: along,
            end: along
        };
    }).filter(Boolean);
}

/*
 * Commit one point of the load's magnitude profile.
 */
export function continueDistributedLoadBuild(
    resolution
) {
    const point =
        resolution.effectiveConstructionPoint;

    if (!point) {
        return;
    }

    const interaction =
        drawingState.interaction;

    const draft =
        distributedLoadDraft(
            interaction,
            point
        );

    if (!draft) {
        return;
    }

    const hasProfile =
        Boolean(
            interaction
                .distributedLoadHasProfile
        ) ||
        draft.points.length > 0;

    enggDrawingState.setInteraction(
        drawingState,
        {
            ...resolution,

            phase:
                "distributed-load-build",

            distributedLoadStart: {
                ...draft.start
            },

            distributedLoadEnd: {
                ...draft.end
            },

            distributedLoadDirection:
                draft.direction,

            distributedLoadPoints:
                draft.points,

            distributedLoadHasProfile:
                hasProfile,

            /*
             * Every point placed so far is published to the
             * snap system at the moment it is placed, not when
             * the load is finished.
             *
             * This is what makes a Varying Distributed Load
             * snap to itself. The student defines Force 1, then
             * moves to place Force 2, and the natural thing is
             * to put Force 2 at the same height as Force 1 -
             * that is how "the same magnitude again" is actually
             * drawn. Without the point being a snap target the
             * only way to express that is by eye, and a force
             * placed a few pixels off reads as a different
             * magnitude rather than an equal one.
             *
             * Registering here rather than at the end is the
             * whole point: a load is an open sequence, and its
             * earlier points are real for as long as the tool
             * is running.
             */
            snapGeometry:
                distributedLoadSnapGeometry(
                    {
                        distributedLoadStart:
                            draft.start,

                        distributedLoadEnd:
                            draft.end,

                        distributedLoadPoints:
                            draft.points
                    }
                ),

            parentId:
                interaction.parentId
        }
    );

    setToolMessage(
        interaction
            .distributedLoadHasProfile
            ? "Click to add another point, Enter to finish"
            : "Click to add another point, Enter to finish"
    );

    renderCurrentDrawing();
}

/*
 * A DISTRIBUTED LOAD WITH A CONSTANT MAGNITUDE
 *
 * A Distributed Load is the simple one: one body, one
 * magnitude, one direction, spread evenly across the whole
 * selected span. There is no profile to trace and no sequence of
 * points to place. It is defined by a single force drawn off the
 * body, and everything else follows from that.
 *
 * The magnitude and the direction both come from where the
 * cursor is. The point on the body under the cursor is where the
 * magnitude is read from, and the offset from that point to the
 * cursor is the force vector itself, so it is exactly the
 * click-move-click construction a Point Force already uses and
 * there is no dialog anywhere in it.
 *
 * The offset is measured along the load's own direction and is
 * never clamped, so pulling the cursor further out genuinely
 * makes the load heavier and the drawn arrows longer.
 */
function startConstantLoadBuild(
    parentId
) {
    /*
     * ========================================================
     * STEP 1 OF 5: THE BODY, AND NOTHING ELSE
     * ========================================================
     *
     * This used to be handed the body's own start and end and store them as
     * the load's, which is why selecting a beam immediately produced a load
     * across its entire length: the span had been decided before the student
     * had been asked anything.
     *
     * Selecting a body is ONE decision - "this load acts on that member" -
     * and it establishes one thing. The region comes next, from two more
     * clicks, because where a load acts and how much of the member it acts
     * on are different questions and a student will rarely want the answer
     * to the second to be the whole member.
     */
    enggDrawingState.setInteraction(
        drawingState,
        {
            phase:
                "distributed-load-start",

            loadSourceId:
                parentId,

            /*
             * Null, not the body's endpoints. The loaded region does not
             * exist until the student puts it on the sheet.
             */
            loadStart: null,
            loadEnd: null,
            loadDirection: null,
            loadMagnitude: 0
        }
    );

    setToolMessage(
        "Specify start point"
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * ========================================================
 * THE REST OF THE CONSTRUCTION
 * ========================================================
 *
 * One function per step, so each is a single thing and the phase change
 * carries the student forward rather than leaving them guessing.
 */

/* STEP 2: the start of the loaded region, snapped to the body. */
export function takeDistributedLoadStart(
    point
) {
    enggDrawingState.setInteraction(
        drawingState,
        {
            ...drawingState.interaction,
            phase: "distributed-load-end",
            loadStart: { ...point },
        }
    );

    setToolMessage(
        "Specify end point"
    );

    renderProperties();
    renderCurrentDrawing();
}

/* STEP 3: the end of the region. Never another body. */
export function takeDistributedLoadEnd(
    point
) {
    enggDrawingState.setInteraction(
        drawingState,
        {
            ...drawingState.interaction,
            phase: "distributed-load-magnitude",
            loadEnd: { ...point },
        }
    );

    setToolMessage(
        "Specify load magnitude"
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * STEP 4: the magnitude, which arrives as an ENGINEERING VALUE.
 *
 * Typed, rather than dragged, because an intensity is not a distance and
 * inferring it from how far the pointer has moved would make it depend on
 * the zoom. It is validated before the tool moves on, so a half-typed or
 * impossible value cannot become a load.
 */
export function takeDistributedLoadMagnitude(
    raw
) {
    const value = Number(raw);

    if (
        !Number.isFinite(value) ||
        value <= 0
    ) {
        setToolMessage(
            "Specify load magnitude - enter a value above zero in N/m"
        );

        renderProperties();

        return false;
    }

    enggDrawingState.setInteraction(
        drawingState,
        {
            ...drawingState.interaction,
            phase:
                "distributed-load-direction",
            loadMagnitude:
                value,
        }
    );

    setToolMessage(
        "Specify load direction"
    );

    renderProperties();
    renderCurrentDrawing();

    return true;
}

/*
 * STEP 5: the direction, chosen ON THE CANVAS.
 *
 * This is the step the old instruction merely NAMED. There was no
 * interaction behind it: the direction came out of wherever the cursor was,
 * and one click did magnitude and direction at once without the student
 * choosing either.
 *
 * It is now a real vector, taken from the pointer's direction relative to
 * the MIDPOINT of the loaded region - a temporary origin that makes the
 * choice about direction rather than about position, because the region is
 * already fixed and pointing somewhere else must not move it.
 *
 * WORLD-SPACE, NOT SCREEN-SPACE. The cursor is turned through the same
 * world-to-screen transform the drawing uses, so the stored direction is
 * the direction the student pointed at, and it survives zooming, panning and
 * the view being resized.
 */
export function takeDistributedLoadDirection(
    origin,
    point
) {
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;

    /*
     * A CLICK ON THE ORIGIN IS NOT A DIRECTION. Committing {0, 0} would
     * produce a load with no direction, which is not a load - and it would
     * look committed, which is worse than asking again.
     */
    if (
        Math.hypot(dx, dy) < 1e-6
    ) {
        setToolMessage(
            "Specify load direction - point away from the load first"
        );

        return false;
    }

    /*
     * UNIT LENGTH. The magnitude is the load intensity and the direction is
     * only which way the arrows point; storing the two together would let
     * the drag distance leak into the engineering value.
     */
    const length = Math.hypot(dx, dy);

    const direction = {
        dx: dx / length,
        dy: dy / length,
    };

    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    const created =
        commitConstantLoad(direction);

    if (!created) {
        setToolMessage(
            "Specify load direction - the loaded region is not usable"
        );

        return false;
    }

    enggDrawingState.commitDrawingChange(
        drawingState,
        previous
    );

    cancelInteraction();

    setToolMessage(
        "Distributed load created"
    );

    renderProperties();
    renderCurrentDrawing();

    return true;
}

/*
 * The constant load the interaction currently describes.
 */
/*
 * ========================================================
 * THE LOAD THE INTERACTION CURRENTLY DESCRIBES
 * ========================================================
 *
 * Built fresh from the interaction on every preview and every commit, so
 * what is drawn while the student works and what is stored when they finish
 * cannot describe different loads - they come from the same numbers.
 *
 * It returns null until there is enough to draw. That is the whole point of
 * the sequence: with a body but no region there is nothing yet, and drawing
 * a full-body load here is what the workflow existed to prevent.
 */
export function constantLoadDraft(
    interaction,
    cursor
) {
    const start = interaction?.loadStart;
    const end = interaction?.loadEnd;

    if (!start || !end) {
        return null;
    }

    return {
        start,
        end,
        direction:
            interaction.loadDirection ?? null,
        magnitude: Math.max(
            0,
            Number(
                interaction.loadMagnitude
            ) || 0
        )
    };
}

/*
 * ========================================================
 * COMMIT, ONCE ALL FIVE THINGS ARE KNOWN
 * ========================================================
 *
 * Refuses anything incomplete, rather than filling in a default - because a
 * load created with a guessed direction or a guessed region is a load the
 * student did not ask for and has to go and find again.
 *
 * THE DIRECTION IS A UNIT VECTOR, stored on the feature as one. The
 * renderer, Switch Direction and the analysis all read this single field,
 * so they cannot disagree about which way the load points - which is how
 * "the arrows point down but the panel says up" happens.
 */
function commitConstantLoad(
    direction
) {
    const interaction =
        drawingState.interaction;

    const draft =
        constantLoadDraft(
            interaction,
            null
        );

    if (!draft) {
        return null;
    }

    if (
        !Number.isFinite(draft.magnitude) ||
        draft.magnitude <= 0
    ) {
        return null;
    }

    if (!direction) {
        return null;
    }

    /*
     * A LOAD WITH NO LENGTH IS NOT A LOAD. Zero-length regions arise from a
     * double click at one point, and committing one would put a feature on
     * the sheet that draws nothing and cannot be seen to delete.
     */
    if (
        Math.hypot(
            draft.end.x - draft.start.x,
            draft.end.y - draft.start.y
        ) < 1e-9
    ) {
        return null;
    }

    const object =
        enggDrawingState.geometryFactories.load(
            draft.start,
            draft.end,
            draft.magnitude,
            staticsAttachedStyle(
                drawingState.activeTool,
                interaction.staticsTarget
            )
        );

    object.geometry.direction =
        direction;

    if (interaction.loadSourceId) {
        object.parentId =
            interaction.loadSourceId;
    }

    enggDrawingState.addObject(
        drawingState,
        object
    );

    enggDrawingState.selectObject(
        drawingState,
        object.id
    );

    return object;
}

/*
 * Commit the constant load and create the feature.
 *
 * The result is one Distributed Load: a body, a single
 * magnitude and a single direction shared by every arrow drawn
 * across it. The even field of arrows is what the renderer
 * samples from those three values.
 */
/*
 * Create the one Varying Distributed Load feature.
 *
 * The whole construction becomes a single object: the body it
 * acts on, the direction every one of its arrows shares, and the
 * defining points of its profile. The arrows are derived from
 * those, so the load can be edited afterwards as one thing
 * rather than as a crowd of separate forces.
 */
export function finishDistributedLoadConstruction() {
    const interaction =
        drawingState.interaction;

    const draft =
        distributedLoadDraft(
            interaction,
            null
        );

    if (!draft) {
        return;
    }

    if (
        !draft.points.length
    ) {
        setToolMessage(
            "Set at least one magnitude point before finishing"
        );

        return;
    }

    const previous =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    const toolId =
        drawingState.activeTool;

    const peak =
        draft.points.reduce(
            (max, point) =>
                Math.max(
                    max,
                    point.magnitude
                ),
            0
        );

    const object =
        enggDrawingState.geometryFactories.load(
            draft.start,
            draft.end,
            peak,
            staticsAttachedStyle(
                toolId,
                drawingState.interaction
                    .staticsTarget
            )
        );

    object.geometry.direction =
        draft.direction;

    object.geometry.points =
        draft.points;

    object.geometry.intensity =
        draft.points.reduce(
            (sum, point) =>
                sum + point.magnitude,
            0
        ) / draft.points.length;

    if (
        interaction.parentId
    ) {
        object.parentId =
            interaction.parentId;
    }

    enggDrawingState.addObject(
        drawingState,
        object
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previous
    );

    enggDrawingState.clearInteraction(
        drawingState
    );

    enggDrawingState.selectObject(
        drawingState,
        object.id
    );

    setToolMessage(
        "Distributed load created"
    );

    renderProperties();
    renderCurrentDrawing();
}
