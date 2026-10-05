/*
 * Completing geometry: polygons, points, and coordinate systems.
 */

import { trussJoints } from "../core/geometry/feature-handles.js";
import enggDrawingState from "../core/model/drawing-state.js";
import enggAnalysisDependencies from "../features/analysis/analysis-dependencies.js";
import { analysisSourceBody, selectedStaticsFeatures } from "./analysis-tools.js";
import { renderCurrentDrawing } from "./canvas-render.js";
import { COORDINATE_SYSTEM_LENGTH, COORDINATE_SYSTEM_TYPE, staticsForceLineWidth } from "./constants.js";
import { arcThroughThreePoints, distance, rectangleGeometry, resolveCentrepointArc } from "./construction-geometry.js";
import { beginCreationDimensioning, commitCreatedFeature } from "./creation-sizing.js";
import { drawingState } from "./editor-state.js";
import { renderProperties } from "./feature-panel.js";
import { objectAtPoint } from "./hit-testing.js";
import { LOAD_BUILD_PHASES, beginDistributedLoadConstruction, continueDistributedLoadBuild, distributedLoadPointOnBody, distributedLoadRegionMidpoint, isVaryingLoadTool, startDistributedLoadBuild, takeDistributedLoadDirection, takeDistributedLoadEnd, takeDistributedLoadStart } from "./load-tool.js";
import { commitMomentPlacement } from "./preview.js";
import { beginStaticsAttachment, continueStaticsAttachment, staticsBodyAtPoint } from "./statics-attachment.js";
import { createStaticsFeature } from "./statics-creation.js";
import { STATICS_CHILD_TOOLS, STATICS_PLACEMENT_TOOLS, STATICS_SPAN_TOOLS, isBodyAttachedTool, isFreeMomentTool, staticsAttachmentId, staticsInstruction, staticsSpanInstruction } from "./statics-tools.js";
import { isArcTool, openPolygonSidesPrompt, referenceArcOptions } from "./tool-menus.js";
import { setToolMessage } from "./toolbar-render.js";
import { TRUSS_STAGES, continueTrussConstruction } from "./truss-tool.js";
import { attachableStaticsType } from "../core/model/feature-types.js";

/*
 * Build the polygon definition for the active
 * creation mode.
 *
 * Both modes resolve to the same stored model:
 * centre, radius, sides and rotation. Only the way
 * those are derived from the interaction differs,
 * so there is a single authoritative geometry.
 */
export function polygonFromCursor(
    interaction,
    point
) {
    if (
        interaction.polygonMode ===
        "sides"
    ) {
        return polygonFromTwoPoints(
            interaction,
            point
        );
    }

    return polygonFromCentre(
        interaction,
        point
    );
}

/*
 * By Centre: the first click is the centre, and the
 * cursor sets both the radius and the rotation.
 */
function polygonFromCentre(
    interaction,
    point
) {
    const center =
        interaction.points[0];

    if (!center) {
        return null;
    }

    const radius =
        distance(
            center,
            point
        );

    if (
        radius <=
        1e-9
    ) {
        return null;
    }

    return {
        center: {
            ...center
        },

        radius,

        sides:
            polygonSideCount(
                interaction
            ),

        rotation:
            Math.atan2(
                point.y - center.y,
                point.x - center.x
            )
    };
}

/*
 * By Sides: the two clicked points define the first
 * side of the polygon. The centre is the circumcentre
 * of the regular polygon whose first edge runs from
 * the first point to the second, and the rotation is
 * taken from that edge.
 */
function polygonFromTwoPoints(
    interaction,
    point
) {
    const first =
        interaction.points[0];

    if (!first) {
        return null;
    }

    const sideLength =
        distance(
            first,
            point
        );

    if (
        sideLength <=
        1e-9
    ) {
        return null;
    }

    const sides =
        polygonSideCount(
            interaction
        );

    const rotation =
        Math.atan2(
            point.y - first.y,
            point.x - first.x
        );

    /*
     * Circumradius of a regular polygon for a given
     * edge length: R = s / (2 sin(pi / n)).
     *
     * The centre sits at the apothem from the midpoint
     * of the edge, on the inward side.
     */
    const apothem =
        sideLength /
        (
            2 *
            Math.tan(
                Math.PI /
                    sides
            )
        );

    const radius =
        sideLength /
        (
            2 *
            Math.sin(
                Math.PI /
                    sides
            )
        );

    const midpoint = {
        x: (first.x + point.x) / 2,
        y: (first.y + point.y) / 2
    };

    const inward =
        rotation +
        Math.PI / 2;

    return {
        center: {
            x:
                midpoint.x +
                Math.cos(inward) *
                    apothem,

            y:
                midpoint.y +
                Math.sin(inward) *
                    apothem
        },

        radius,

        sides,

        /*
         * The stored rotation places vertex 0 at the
         * first clicked point, so the committed shape
         * starts exactly where the user clicked.
         */
        rotation:
            rotation -
            Math.PI / 2 -
            Math.PI /
                sides
    };
}

/*
 * The side count belongs to the tool, not to the
 * geometry, so the creation modes share one value.
 */
export function polygonSideCount(
    interaction
) {
    const sides =
        Math.round(
            Number(
                interaction.polygonSides
            )
        );

    return (
        Number.isFinite(sides) &&
        sides >= 3
            ? sides
            : 6
    );
}

export function currentEngineeringMetadata() {
    return {
        plane: "XY"
    };
}

/*
 * The point a truss's next point aligns against.
 *
 * While a member is being drawn that is the member's own start.
 * Between members there is no member in progress, and the point
 * that matters is the structure itself: a new member is almost
 * always dropped from a joint of the truss that is already there,
 * and it is that joint the next point should be compared
 * against.
 *
 * The NEAREST joint is used rather than the last one placed. A
 * student tracing round a panel ends each member at a different
 * corner, so the most recently placed joint is often on the
 * opposite side, and aligning to it would put horizontal and
 * vertical inference in the wrong place exactly when it is
 * wanted.
 */
export function trussInferenceAnchor(
    interaction
) {
    if (
        interaction.trussInProgress
    ) {
        return interaction.trussInProgress;
    }

    const members =
        interaction.trussMembers || [];

    if (!members.length) {
        return interaction.startPoint || null;
    }

    const joints = trussJoints(members);

    /*
     * The joint nearest the cursor, so the alignment reference
     * is whichever one the student is actually working from.
     * The point is the last thing written by the move handler,
     * so it is current.
     */
    const cursor =
        interaction.currentPoint ||
        interaction.rawPointerPoint;

    if (!cursor) {
        return members[
            members.length - 1
        ].end;
    }

    let nearest = null;
    let nearestDistance = Infinity;

    joints.forEach(joint => {
        const distance = Math.hypot(
            joint.x - cursor.x,
            joint.y - cursor.y
        );

        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = joint;
        }
    });

    return nearest ||
        members[members.length - 1].end;
}

export function beginOrCompleteGeometry(
    resolution
) {
    const interaction =
        drawingState.interaction;

    const point =
        resolution.effectiveConstructionPoint;

    if (!point) {
        return;
    }

    /*
     * STAGE ONE OF A DIAGRAM: NAME THE BODY.
     *
     * The diagram tools are armed with no source - the student is asked
     * for the body they belong to rather than required to have selected
     * one first. So the first click answers that question, and the second
     * places the diagram.
     *
     * This is the same two-stage shape as a support or a load: tool, then
     * body, then placement. What makes it worth handling here is that the
     * stage is decided by whether a source is ALREADY on the interaction,
     * so a student who had a beam selected before pressing SFD gets the
     * single-click version and is never asked twice.
     *
     * The body is found by the ordinary hit test and kept by its real
     * feature id. It is never the nearest line, an index or a name, so a
     * diagram cannot end up attached to the wrong member.
     */
    if (
        interaction.phase === "analysis-axis" &&
        !interaction.sourceId
    ) {
        /*
         * THE BODY COMES FROM THE SHARED SNAP, NOT FROM A HIT TEST ALONE.
         *
         * A member is a thin thing, and a hit test that has to land inside
         * a drawn outline is a poor way to ask "which beam is that?". The
         * snap candidates already publish every body's centreline as a
         * span, so the question is asked of them - the same candidates a
         * support, a load or a connection is attached through. That is
         * also what makes the diagram behave like the rest of Statics: the
         * student aims at the beam, the same way they always do, and the
         * same tolerance decides what counts as close enough.
         *
         * The candidate is resolved to the object it names and stored by
         * its real feature id, so nothing downstream depends on where the
         * pointer happened to be.
         */
        const snappedId =
            staticsAttachmentId(
                resolution.snapCandidate
            );

        const body =
            analysisSourceBody(
                snappedId
                    ? [
                          drawingState.objects.find(
                              candidate =>
                                  candidate.id ===
                                  snappedId
                          )
                      ].filter(Boolean)
                    : [objectAtPoint(point)]
            ) ||
            analysisSourceBody(
                selectedStaticsFeatures()
            );

        if (!body) {
            setToolMessage(
                "Click the Beam, Truss or member the diagram belongs to"
            );

            renderCurrentDrawing();

            return;
        }

        const span =
            enggAnalysisDependencies.spanOf(body);

        if (!span) {
            setToolMessage(
                "That feature has no span to measure a diagram against"
            );

            return;
        }

        enggDrawingState.setInteraction(
            drawingState,
            {
                ...interaction,

                sourceId: body.id,

                /*
                 * The suggested starting height, measured from the body
                 * that was just chosen rather than from whatever happened
                 * to be selected.
                 */
                placementY:
                    span.start.y +
                    enggAnalysisDependencies
                        .DEFAULT_ANALYSIS_OFFSET
            }
        );

        setToolMessage(
            "Move the pointer up or down to position the diagram, then click to place it"
        );

        renderCurrentDrawing();

        return;
    }

    if (
        interaction.phase ===
        "idle"
    ) {
        /*
         * A Point is defined by a single click, so it is
         * created and committed immediately.
         */
        if (
            drawingState.activeTool ===
            "point"
        ) {
            createPointFeature(
                point
            );

            return;
        }

        /*
         * A Truss is built progressively rather than in two
         * clicks. The first click both starts the construction
         * and anchors the base, so the student does not lose a
         * click to a step that places nothing.
         */
        if (
            drawingState.activeTool ===
                "truss"
        ) {
            enggDrawingState.setInteraction(
                drawingState,
                {
                    phase: "truss-construct",
                    startPoint: point,
                    currentPoint: point,
                    trussStage: 0,
                    trussMembers: [],
                    trussOutline: [],
                    trussInProgress: point,

                    /*
                     * Published from the first click, so the very
                     * first member already snaps to the drawing
                     * it is being added to.
                     */
                    snapGeometry: [
                        {
                            start: point,
                            end: point
                        }
                    ],

                    snapQuarterSnap: true,
                    snapToolId: "truss"
                }
            );

            setToolMessage(
                TRUSS_STAGES[0].followUp
            );

            renderCurrentDrawing();
            return;
        }

        /*
         * A body-attached Statics tool works on a body, not
         * on free space. It first takes its target body, then
         * places itself along that body, so the feature it
         * creates always belongs to something.
         *
         * This runs before the single-click placement path,
         * because a support or a moment placed this way must
         * not be committed before its body is known.
         */
        if (
            isBodyAttachedTool(
                drawingState.activeTool
            ) &&
            !drawingState.interaction
                .staticsTarget
        ) {
            /*
             * Both distributed loads are body-attached, but they
             * bring their own construction with them: they have
             * to be told which body they load, then walk the
             * student through their own definition. So they are
             * routed to that rather than to the generic
             * attachment path.
             */
            if (
                drawingState.activeTool ===
                    "distributed-load" ||
                isVaryingLoadTool()
            ) {
                beginDistributedLoadConstruction(
                    resolution
                );

                return;
            }

            /*
             * A Moment is a free-standing action on a point, not
             * something that only means anything against a body:
             * an applied couple can be drawn anywhere, and in
             * statics that is the common case - moments are applied
             * at joints and at points in free space as often as
             * anywhere else.
             *
             * So a click in empty space places one there, rather
             * than refusing and asking for a body that may not
             * exist. A click ON a body still goes through the
             * attachment path, so the moment is parented to the
             * body it was drawn on and the Features panel can show
             * it relative to that body.
             */
            if (
                isFreeMomentTool() &&
                !staticsBodyAtPoint(point)
            ) {
                createStaticsFeature(
                    drawingState.activeTool,
                    point
                );

                return;
            }

            beginStaticsAttachment(
                resolution
            );

            return;
        }

        /*
         * Statics features are also placed with a single
         * click, so they commit immediately and open their
         * Features panel.
         */
        if (
            STATICS_PLACEMENT_TOOLS[
                drawingState.activeTool
            ]
        ) {
            createStaticsFeature(
                drawingState.activeTool,
                point,
                staticsAttachmentId(
                    resolution.snapCandidate
                )
            );

            return;
        }

        /*
         * A span tool anchors on the first click and sets
         * its extent on the second, so each one names its own
         * endpoint instead of borrowing the load wording.
         *
         * The anchor's snap decides the eventual parent, so
         * it is captured here while the snap candidate is
         * still in hand.
         */
        if (
            STATICS_SPAN_TOOLS[
                drawingState.activeTool
            ]
        ) {
            enggDrawingState.setInteraction(
                drawingState,
                {
                    ...resolution,

                    phase:
                        "statics-span",

                    startPoint:
                        point,

                    currentPoint:
                        point,

                    parentId:
                        staticsAttachmentId(
                            resolution.snapCandidate
                        ),

                    points: [
                        point
                    ]
                }
            );

            setToolMessage(
                staticsSpanInstruction(
                    drawingState.activeTool
                )
            );

            renderCurrentDrawing();
            return;
        }

        if (
            drawingState.activeTool ===
            "polygon"
        ) {
            /*
             * By Centre starts with the centre; By Sides
             * starts with the first end of the first
             * edge. Both then take one more canvas point
             * before the side count is chosen.
             */
            const bySides =
                interaction.polygonMode ===
                "sides";

            enggDrawingState.setInteraction(
                drawingState,
                {
                    ...resolution,

                    phase:
                        bySides
                            ? "polygon-first"
                            : "polygon-centre",

                    startPoint:
                        point,

                    currentPoint:
                        point,

                    points: [
                        point
                    ]
                }
            );

            setToolMessage(
                bySides
                    ? "Specify second point"
                    : "Specify polygon radius"
            );

            renderCurrentDrawing();
            return;
        }

        if (
            isArcTool()
        ) {
            const threePoint =
                interaction.arcMode ===
                "three-point";

            enggDrawingState.setInteraction(
                drawingState,
                {
                    ...resolution,

                    phase:
                        threePoint
                            ? "arc-first"
                            : "arc-centre",

                    startPoint:
                        point,

                    currentPoint:
                        point,

                    points: [
                        point
                    ]
                }
            );

            setToolMessage(
                threePoint
                    ? "Specify point on arc"
                    : "Specify arc start point"
            );
        } else {
            enggDrawingState.setInteraction(
                drawingState,
                {
                    ...resolution,

                    phase:
                        "first-point",

                    startPoint:
                        point,

                    currentPoint:
                        point,

                    points: [
                        point
                    ]
                }
            );

            setToolMessage(
                drawingState.activeTool ===
                    "polyline"
                    ? "Specify next point"

                    : drawingState.activeTool ===
                        "circle"
                        ? "Specify radius"

                    : drawingState.activeTool ===
                        "rectangle"
                        ? "Specify opposite corner"

                    : drawingState.activeTool ===
                        "line"
                        ? "Specify line endpoint"

                    : drawingState.activeTool ===
                        "triangle"
                        ? "Specify second point"

                    : "Specify second point"
            );
        }

        renderCurrentDrawing();
        return;
    }

    if (
        drawingState.activeTool ===
        "polyline"
    ) {
        interaction.points.push(
            point
        );

        interaction.startPoint =
            point;

        interaction.currentPoint =
            point;

        setToolMessage(
            "Click next point or double-click to finish"
        );

        renderCurrentDrawing();
        return;
    }

    if (
        drawingState.activeTool ===
            "triangle" &&
        interaction.points.length < 2
    ) {
        /*
         * Triangle collects its three corner points
         * before creating a single feature. Once the
         * second point is down, the third click falls
         * through to the creation code below so the
         * whole triangle is built in one step.
         */
        interaction.points.push(
            point
        );

        interaction.currentPoint =
            point;

        interaction.startPoint =
            interaction.points[0];

        setToolMessage(
            interaction.points.length < 2
                ? "Specify second point"
                : "Specify third point"
        );

        renderCurrentDrawing();
        return;
    }

    if (
        drawingState.activeTool ===
        "triangle"
    ) {
        /*
         * Third point: complete the triangle from the
         * two stored points plus this one.
         */
        interaction.points.push(
            point
        );

        interaction.currentPoint =
            point;
    }

    if (
        drawingState.activeTool ===
            "polygon" &&
        (
            interaction.phase ===
                "polygon-centre" ||
            interaction.phase ===
                "polygon-first"
        )
    ) {
        /*
         * Second canvas point is placed, then the side
         * count is chosen before anything is created.
         * The polygon stays in preview until the count
         * is confirmed.
         */
        interaction.points.push(
            point
        );

        interaction.currentPoint =
            point;

        interaction.phase =
            "polygon-sides";

        openPolygonSidesPrompt(
            interaction
        );

        renderCurrentDrawing();
        return;
    }

    /*
     * A MOMENT BEING SIZED, ON A CLICK.
     *
     * This is where the commit belongs, and where it used to be missing.
     * It lived in the pointer-MOVE handler, which is worse than leaving
     * it out: a student moving the pointer along a beam to choose where
     * the moment goes would have the moment commit under the cursor
     * without a click, and by the time they clicked - the very thing the
     * status line told them to do - the phase had already been consumed
     * and the click did nothing.
     *
     * Enter masked it, because the Enter route is a separate path to the
     * same commit. So the tool appeared to work for anyone who noticed
     * Enter, and did nothing at all for everyone following the
     * instruction on screen.
     *
     * The application point is still the FIRST click's point, not this
     * one: the pointer has been sizing the arc, and a moment drawn around
     * wherever the pointer happened to be would be a different moment
     * from the one the student chose.
     *
     * Guarded on the PHASE as well as the tool, so it cannot fire twice
     * for one moment: the commit clears the interaction, and a second
     * click then finds no phase to match.
     */
    if (
        isBodyAttachedTool(
            drawingState.activeTool
        ) &&
        drawingState.interaction.phase ===
            "moment-radius"
    ) {
        commitMomentPlacement();

        return;
    }

    /*
     * A body-attached feature takes one or more points on
     * its body and is created only once it has all of them,
     * so nothing is committed on this click.
     *
     * Guarded by the tool as well as the phase: a truss under
     * construction is a different operation that lives in the
     * same interaction and must not be swallowed here.
     */
    if (
        isBodyAttachedTool(
            drawingState.activeTool
        ) &&
        drawingState.interaction.phase ===
            "statics-attach"
    ) {
        continueStaticsAttachment(
            resolution
        );

        return;
    } else if (
        drawingState.interaction.phase ===
            "truss-construct"
    ) {
        /*
         * A truss is built one member at a time using the
         * ordinary line interaction, so a click places the next
         * point of a member rather than creating a feature.
         */
        continueTrussConstruction(
            resolution
        );

        return;
    } else if (
        LOAD_BUILD_PHASES.has(
            drawingState.interaction.phase
        )
    ) {
        /*
         * ========================================================
         * ONE CLICK, ONE STEP
         * ========================================================
         *
         * This used to take a constant load's entire construction in a
         * single click: the magnitude came out of how far the pointer was
         * from the body and the direction out of which way it was pointing,
         * so the student chose neither - the tool decided both and showed
         * them afterwards.
         *
         * Now each click does exactly one thing, and the phase says which.
         * A click that is not yet the step the tool is waiting for changes
         * nothing, so a stray click cannot commit a load or skip a step.
         */
        const phase =
            drawingState.interaction.phase;

        if (
            phase ===
            "distributed-load-start"
        ) {
            takeDistributedLoadStart(
                point
            );

            return;
        }

        if (
            phase ===
            "distributed-load-end"
        ) {
            /*
             * THE SECOND CLICK IS AGAINST THE SAME BODY.
             *
             * A click on a different member is not the end of this load -
             * it is the start of a load on that member, and switching
             * silently would leave a load on the first body that the
             * student thought they had abandoned.
             */
            if (
                !distributedLoadPointOnBody(
                    point
                )
            ) {
                setToolMessage(
                    "Specify end point on the same body"
                );

                renderProperties();

                return;
            }

            takeDistributedLoadEnd(point);

            return;
        }

        if (
            phase ===
            "distributed-load-magnitude"
        ) {
            setToolMessage(
                "Specify load magnitude"
            );

            renderProperties();

            return;
        }

        if (
            phase ===
            "distributed-load-direction"
        ) {
            /*
             * The direction is taken from the pointer's direction about
             * the MIDPOINT of the loaded region - a temporary origin, so
             * that the choice is about direction and cannot move the load.
             */
            takeDistributedLoadDirection(
                distributedLoadRegionMidpoint(),
                point
            );

            return;
        }

        return;
    } else if (
        drawingState.interaction.phase ===
            "distributed-load-build"
    ) {
        /*
         * A varying distributed load takes one magnitude-defining point
         * per click and is finished with Enter, so the click never
         * commits anything on its own. Its phase is not one of the
         * uniform load's steps (LOAD_BUILD_PHASES), so it has its own
         * branch: folded into theirs, this call could never be reached.
         */
        continueDistributedLoadBuild(
            resolution
        );

        return;
    } else if (
        drawingState.interaction.phase ===
            "distributed-load-span"
    ) {
        /*
         * The load was started in empty space, so the two-click
         * Line-style span is completed first. The load's
         * construction proper only starts once the region it
         * loads is known.
         */
        const spanEnd = {
            x: point.x,
            y: point.y
        };

        const span = {
            start: interaction.points[0],
            end: spanEnd
        };

        if (isVaryingLoadTool()) {
            startDistributedLoadBuild(span);
        } else {
            /*
             * TRACED IN EMPTY SPACE. There is no body, so the two clicks
             * ARE the loaded region - the student is drawing the interval
             * itself rather than choosing it on a member.
             */
            enggDrawingState.setInteraction(
                drawingState,
                {
                    ...resolution,
                    phase: "distributed-load-start",
                    loadSourceId: null,
                    loadStart: {
                        ...interaction.points[0],
                    },
                    loadEnd: null,
                    loadDirection: null,
                    loadMagnitude: 0
                }
            );

            setToolMessage(
                "Specify end point"
            );

            renderProperties();
            renderCurrentDrawing();
        }

        return;
    } else if (
        STATICS_SPAN_TOOLS[
            drawingState.activeTool
        ] &&
        interaction.phase ===
            "statics-span"
    ) {
        /*
         * A Reference Line reuses the ordinary line
         * geometry, distinguished only by its statics
         * metadata, so it never becomes a second line
         * primitive.
         */
        const isReferenceLine =
            drawingState.activeTool ===
            "reference-line";

        /*
         * The feature type the active tool creates. It is
         * resolved before it is used, because the attachment
         * below depends on it.
         */
        const type =
            STATICS_CHILD_TOOLS[
                drawingState.activeTool
            ]?.type;

        const style = {
            style: {
                ...drawingState.styleDefaults,

                /*
                 * A Point Force is a symbol rather than an
                 * outline, so it starts heavier than the general
                 * line weight. The same choice is made in
                 * staticsAttachedStyle for the attached path, so
                 * a force dropped on a body and one drawn in free
                 * space are equally heavy.
                 */
                lineWidth:
                    staticsForceLineWidth(
                        drawingState.activeTool
                    ),

                /*
                 * A reference line is construction geometry, so
                 * it starts in the construction line type. It is
                 * a style the student can change afterwards like
                 * any other, and the geometry underneath is a
                 * plain line, so it keeps every Line control.
                 */
                lineType:
                    isReferenceLine
                        ? "construction"
                        : drawingState.styleDefaults.lineType
            },

            engineering: {
                plane: "XY",
                discipline: "statics",

                staticsType:
                    drawingState.activeTool
            },

            /*
             * A Reference Line is named for its statics role
             * rather than its underlying geometry, so it
             * reads as such in the Feature Tree.
             */
            name:
                isReferenceLine
                    ? "Reference Line"
                    : undefined,

            /*
             * The first click's snap is what establishes
             * attachment. If the application point snapped
             * onto an existing engineering body, the new
             * feature is recorded as that body's child, so
             * the Feature Tree shows Beam 1 > Point Force 1
             * instead of two unrelated rows. It reuses the
             * existing snap result; no separate attachment
             * system is involved.
             */
            parentId:
                attachableStaticsType(type) &&
                interaction.parentId
                    ? interaction.parentId
                    : undefined
        };

        const start = {
            ...interaction.points[0]
        };

        const end = {
            x: point.x,
            y: point.y
        };

        /*
         * Dispatch on the feature type, so each span tool
         * builds its own coherent feature with the right
         * arguments. Most take two points, but a distributed
         * load takes an intensity between them and a varying
         * load takes an intensity at each end.
         */
        let object = null;

        if (type === "load") {
            object =
                enggDrawingState.geometryFactories.load(
                    start,
                    end,
                    10,
                    style
                );
        } else if (type === "varying-load") {
            object =
                enggDrawingState.geometryFactories[
                    "varying-load"
                ](
                    start,
                    end,
                    0,
                    10,
                    style
                );
        } else if (
            typeof enggDrawingState.geometryFactories[
                type
            ] === "function"
        ) {
            object =
                enggDrawingState.geometryFactories[
                    type
                ](
                    start,
                    end,
                    style
                );
        }

        if (!object) {
            setToolMessage(
                "That tool could not be created"
            );

            return;
        }

        /*
         * THE INTERACTION IS RELEASED BEFORE THE SIZE IS ASKED FOR.
         *
         * The span is complete, so the tool has no more points to
         * take. The member is not added yet - it is committed by
         * `commitCreatedFeature` once its size is known, so the
         * creation and its dimension are one undoable action and a
         * cancelled dimension leaves nothing behind.
         */
        enggDrawingState.clearInteraction(
            drawingState
        );

        /*
         * THE DOCUMENT AS IT STANDS BEFORE THE SIZE IS APPLIED.
         *
         * Taken here, after the span is complete but before any value
         * has been written, so "before" means the document the student
         * was looking at when they answered the popup.
         *
         * That matters because answering it can CALIBRATE the drawing.
         * A snapshot taken afterwards would already carry the new scale,
         * and Undo would remove the member while leaving its calibration
         * behind.
         */
        const previousObjects =
            enggDrawingState.snapshotDrawing(
                drawingState
            );

        beginCreationDimensioning(
            object,
            previousObjects,
            () => {
                commitCreatedFeature(
                    object,
                    true,
                    previousObjects
                );

                setToolMessage(
                    staticsInstruction(
                        drawingState.activeTool
                    )
                );

                renderProperties();
                renderCurrentDrawing();
            }
        );

        return;
    }

    if (
        isArcTool() &&
        interaction.phase ===
            "arc-centre"
    ) {
        interaction.points.push(
            point
        );

        interaction.currentPoint =
            point;

        interaction.phase =
            "arc-sweep";

        interaction.preview =
            null;

        setToolMessage(
            "Specify arc endpoint"
        );

        renderCurrentDrawing();
        return;
    }

    if (
        isArcTool() &&
        interaction.phase ===
            "arc-first"
    ) {
        interaction.points.push(
            point
        );

        interaction.currentPoint =
            point;

        interaction.phase =
            "arc-second";

        interaction.preview =
            null;

        setToolMessage(
            "Specify third point"
        );

        renderCurrentDrawing();
        return;
    }

    const first =
        interaction.startPoint;

    let object = null;

    if (
        drawingState.activeTool ===
        "line"
    ) {
        object =
            enggDrawingState.geometryFactories.line(
                first,
                point,
                {
                    style: {
                        ...drawingState.styleDefaults
                    },

                    engineering:
                        currentEngineeringMetadata()
                }
            );
    } else if (
        drawingState.activeTool ===
        "circle"
    ) {
        object =
            enggDrawingState.geometryFactories.circle(
                first,

                distance(
                    first,
                    point
                ),

                {
                    style: {
                        ...drawingState.styleDefaults
                    },

                    engineering:
                        currentEngineeringMetadata()
                }
            );
    } else if (
        drawingState.activeTool ===
        "rectangle"
    ) {
        const rectangle =
            rectangleGeometry(
                first,
                point
            );

        object =
            enggDrawingState.geometryFactories.rectangle(
                rectangle.position,
                rectangle.width,
                rectangle.height,
                rectangle.rotation,
                {
                    style: {
                        ...drawingState.styleDefaults
                    },

                    engineering:
                        currentEngineeringMetadata()
                }
            );
    } else if (
        drawingState.activeTool ===
        "polyline"
    ) {
        object =
            enggDrawingState.geometryFactories.polyline(
                [
                    ...interaction.points
                ],

                {
                    style: {
                        ...drawingState.styleDefaults
                    },

                    engineering:
                        currentEngineeringMetadata()
                }
            );
    } else if (
        drawingState.activeTool ===
            "triangle" &&
        interaction.points.length >= 3
    ) {
        /*
         * One Triangle feature built from the three
         * placed points, closed back to the first.
         */
        object =
            enggDrawingState.geometryFactories.triangle(
                [
                    ...interaction.points
                ],

                {
                    style: {
                        ...drawingState.styleDefaults
                    },

                    engineering:
                        currentEngineeringMetadata()
                }
            );
    } else if (
        isArcTool() &&
        interaction.phase ===
            "arc-sweep" &&
        interaction.points.length >= 2
    ) {
        /*
         * Centrepoint arc: centre, start point and
         * endpoint are all placed, so the arc is
         * fully determined.
         *
         * This uses the same calculation as the
         * preview, with the same unwrapped cursor
         * angle, so the stored geometry matches what
         * the user just saw.
         */
        const arcGeometry =
            resolveCentrepointArc(
                interaction,
                point
            );

        if (arcGeometry) {
            object =
                enggDrawingState.geometryFactories.arc(
                    arcGeometry.center,

                    arcGeometry.radius,

                    arcGeometry.startAngle,

                    arcGeometry.endAngle,

                    referenceArcOptions()
                );

            if (
                object &&
                object.geometry
            ) {
                object.geometry.sweep =
                    arcGeometry.sweep;
            }
        } else {
            setToolMessage(
                "Start and endpoint must differ from the centre"
            );

            return;
        }
    } else if (
        isArcTool() &&
        interaction.phase ===
            "arc-second" &&
        interaction.points.length >= 2
    ) {
        /*
         * 3-point arc: the arc is the circumcircle
         * through the three placed points.
         */
        const arcGeometry =
            arcThroughThreePoints(
                interaction.points[0],
                interaction.points[1],
                point
            );

        if (arcGeometry) {
            object =
                enggDrawingState.geometryFactories.arc(
                    arcGeometry.center,

                    arcGeometry.radius,

                    arcGeometry.startAngle,

                    arcGeometry.endAngle,

                    referenceArcOptions()
                );

            if (
                object &&
                object.geometry
            ) {
                object.geometry.sweep =
                    arcGeometry.sweep;
            }
        } else {
            setToolMessage(
                "Points are collinear"
            );

            return;
        }
    }

    if (object) {
        /*
         * THE INTERACTION IS RELEASED BEFORE THE SIZE IS ASKED FOR.
         *
         * The geometry is complete, so the tool has no more points
         * to take - and leaving it mid-construction while a popup
         * is open would let a stray click add another point behind
         * the popup. The feature itself is not added yet: it is
         * committed by `commitCreatedFeature` once its size is
         * known, as one undoable action.
         */
        enggDrawingState.clearInteraction(
            drawingState
        );

        /*
         * THE DOCUMENT AS IT STANDS BEFORE THE SIZE IS APPLIED.
         *
         * Taken after the geometry is complete and before any value is
         * written, so "before" means the document the student was
         * looking at when they answered the popup.
         *
         * Answering it can CALIBRATE the drawing, so a snapshot taken
         * afterwards would already carry the new scale - and Undo
         * would remove the feature while leaving that scale behind,
         * with nothing left for it to give meaning to.
         */
        const previousObjects =
            enggDrawingState.snapshotDrawing(
                drawingState
            );

        beginCreationDimensioning(
            object,
            previousObjects,
            () => {
                commitCreatedFeature(
                    object,
                    true,
                    previousObjects
                );

                setToolMessage("Ready");

                renderProperties();
                renderCurrentDrawing();
            }
        );

        return;
    }

    enggDrawingState.clearInteraction(
        drawingState
    );

    setToolMessage(
        "Ready"
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * Create a Point feature and select it, so its
 * Features panel opens straight away.
 */
function createPointFeature(
    point
) {
    const previousObjects =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    const object =
        enggDrawingState.geometryFactories.point(
            {
                x: point.x,
                y: point.y
            },
            {
                style: {
                    ...drawingState.styleDefaults
                },

                engineering:
                    currentEngineeringMetadata()
            }
        );

    enggDrawingState.addObject(
        drawingState,
        object
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previousObjects
    );

    enggDrawingState.clearInteraction(
        drawingState
    );

    enggDrawingState.selectObject(
        drawingState,
        object.id
    );

    setToolMessage(
        "Specify point"
    );

    renderProperties();
    renderCurrentDrawing();
}

/*
 * The coordinate system is ONE feature.
 *
 * It has a single shared origin and four independently
 * adjustable axis extensions: +X, -X, +Y and -Y. All
 * four lengths live on this one object, so it stays a
 * single entry in the Feature Tree while each side can
 * still be extended on its own.
 */
export function add2DCoordinateSystem(
    origin
) {
    const previousObjects =
        enggDrawingState.snapshotDrawing(
            drawingState
        );

    const coordinateSystem =
        enggDrawingState.createGeometryObject(
            COORDINATE_SYSTEM_TYPE,
            {
                origin: {
                    x: origin.x,
                    y: origin.y
                },

                xPositiveLength:
                    COORDINATE_SYSTEM_LENGTH,

                xNegativeLength:
                    COORDINATE_SYSTEM_LENGTH,

                yPositiveLength:
                    COORDINATE_SYSTEM_LENGTH,

                yNegativeLength:
                    COORDINATE_SYSTEM_LENGTH
            },
            {
                name:
                    "Coordinate System",

                style: {
                    stroke: "#000000",
                    fill: "none",
                    lineWidth: 0.75,
                    lineType: "solid",
                    opacity: 1
                },

                metadata: {
                    reference: true,
                    coordinateSystem: "2d"
                },

                engineering: {
                    plane: "XY"
                }
            }
        );

    enggDrawingState.addObject(
        drawingState,
        coordinateSystem
    );

    enggDrawingState.commitDrawingChange(
        drawingState,
        previousObjects
    );

    enggDrawingState.clearSelection(
        drawingState
    );

    setToolMessage(
        "Specify origin"
    );

    renderProperties();
    renderCurrentDrawing();
}
