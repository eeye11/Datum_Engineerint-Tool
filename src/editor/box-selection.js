/*
 * Box selection: which features a selection rectangle touches.
 */

import enggFeatureGeometry from "../core/geometry/feature-geometry.js";
import enggDrawingState from "../core/model/drawing-state.js";
import enggLoadProfile from "../features/analysis/load-profile.js";
import { COORDINATE_SYSTEM_LENGTH } from "./constants.js";
import { distance } from "./construction-geometry.js";
import { drawingState } from "./editor-state.js";
import { isRectangleLike, objectPoints } from "./hit-testing.js";

function pointInsideSelection(
    point,
    selectionBox
) {
    return (
        point.x >=
            selectionBox.minX &&

        point.x <=
            selectionBox.maxX &&

        point.y >=
            selectionBox.minY &&

        point.y <=
            selectionBox.maxY
    );
}

function segmentsIntersect(
    firstStart,
    firstEnd,
    secondStart,
    secondEnd
) {
    const cross = (
        a,
        b,
        c
    ) =>
        (
            b.x -
            a.x
        ) *
        (
            c.y -
            a.y
        ) -
        (
            b.y -
            a.y
        ) *
        (
            c.x -
            a.x
        );

    const onSegment = (
        a,
        point,
        b
    ) =>
        point.x >=
            Math.min(
                a.x,
                b.x
            ) -
            1e-9 &&

        point.x <=
            Math.max(
                a.x,
                b.x
            ) +
            1e-9 &&

        point.y >=
            Math.min(
                a.y,
                b.y
            ) -
            1e-9 &&

        point.y <=
            Math.max(
                a.y,
                b.y
            ) +
            1e-9;

    const c1 =
        cross(
            firstStart,
            firstEnd,
            secondStart
        );

    const c2 =
        cross(
            firstStart,
            firstEnd,
            secondEnd
        );

    const c3 =
        cross(
            secondStart,
            secondEnd,
            firstStart
        );

    const c4 =
        cross(
            secondStart,
            secondEnd,
            firstEnd
        );

    const s1 =
        Math.abs(c1) < 1e-9
            ? 0
            : c1 > 0
                ? 1
                : -1;

    const s2 =
        Math.abs(c2) < 1e-9
            ? 0
            : c2 > 0
                ? 1
                : -1;

    const s3 =
        Math.abs(c3) < 1e-9
            ? 0
            : c3 > 0
                ? 1
                : -1;

    const s4 =
        Math.abs(c4) < 1e-9
            ? 0
            : c4 > 0
                ? 1
                : -1;

    if (
        s1 !== 0 &&
        s2 !== 0 &&
        s1 !== s2 &&
        s3 !== 0 &&
        s4 !== 0 &&
        s3 !== s4
    ) {
        return true;
    }

    if (
        s1 === 0 &&
        onSegment(
            firstStart,
            secondStart,
            firstEnd
        )
    ) {
        return true;
    }

    if (
        s2 === 0 &&
        onSegment(
            firstStart,
            secondEnd,
            firstEnd
        )
    ) {
        return true;
    }

    if (
        s3 === 0 &&
        onSegment(
            secondStart,
            firstStart,
            secondEnd
        )
    ) {
        return true;
    }

    if (
        s4 === 0 &&
        onSegment(
            secondStart,
            firstEnd,
            secondEnd
        )
    ) {
        return true;
    }

    return false;
}

function selectionRectangleEdges(
    selectionBox
) {
    const topLeft = {
        x:
            selectionBox.minX,

        y:
            selectionBox.maxY
    };

    const topRight = {
        x:
            selectionBox.maxX,

        y:
            selectionBox.maxY
    };

    const bottomRight = {
        x:
            selectionBox.maxX,

        y:
            selectionBox.minY
    };

    const bottomLeft = {
        x:
            selectionBox.minX,

        y:
            selectionBox.minY
    };

    return [
        [
            topLeft,
            topRight
        ],

        [
            topRight,
            bottomRight
        ],

        [
            bottomRight,
            bottomLeft
        ],

        [
            bottomLeft,
            topLeft
        ]
    ];
}

function segmentIntersectsSelection(
    start,
    end,
    selectionBox
) {
    if (
        pointInsideSelection(
            start,
            selectionBox
        ) ||
        pointInsideSelection(
            end,
            selectionBox
        )
    ) {
        return true;
    }

    return selectionRectangleEdges(
        selectionBox
    ).some(
        ([edgeStart, edgeEnd]) =>
            segmentsIntersect(
                start,
                end,
                edgeStart,
                edgeEnd
            )
    );
}

function polylineIntersectsSelection(
    points,
    selectionBox
) {
    if (
        !Array.isArray(points) ||
        points.length === 0
    ) {
        return false;
    }

    if (
        points.some(
            point =>
                pointInsideSelection(
                    point,
                    selectionBox
                )
        )
    ) {
        return true;
    }

    for (
        let index = 1;
        index < points.length;
        index += 1
    ) {
        if (
            segmentIntersectsSelection(
                points[index - 1],
                points[index],
                selectionBox
            )
        ) {
            return true;
        }
    }

    return false;
}

function distanceToSelectionRectangle(
    point,
    selectionBox
) {
    const dx =
        Math.max(
            selectionBox.minX -
                point.x,

            0,

            point.x -
                selectionBox.maxX
        );

    const dy =
        Math.max(
            selectionBox.minY -
                point.y,

            0,

            point.y -
                selectionBox.maxY
        );

    return Math.hypot(
        dx,
        dy
    );
}

function circleIntersectsSelection(
    circle,
    selectionBox
) {
    const center =
        circle.center;

    const radius =
        Math.abs(
            circle.radius
        );

    if (
        pointInsideSelection(
            center,
            selectionBox
        )
    ) {
        return true;
    }

    return (
        distanceToSelectionRectangle(
            center,
            selectionBox
        ) <=
        radius
    );
}

/*
 * Whether a closed outline crosses the rectangle.
 *
 * The same test as for an open polyline, with the first point
 * repeated at the end so the closing side is included.
 */
function polygonIntersectsSelection(
    points,
    selectionBox
) {
    if (
        !points ||
        points.length < 3
    ) {
        return false;
    }

    return polylineIntersectsSelection(
        [
            ...points,
            points[0]
        ],
        selectionBox
    );
}

/*
 * Whether the whole selection rectangle lies inside a circle.
 *
 * This is the other direction of a circle intersection, and it
 * matters because a circle that swallows the rectangle has no
 * part of its own outline inside it. Without it, a circle
 * bigger than the whole drawing area could never be selected.
 */
function rectangleInsideCircle(
    circle,
    selectionBox
) {
    const corners = [
        {
            x: selectionBox.minX,
            y: selectionBox.minY
        },
        {
            x: selectionBox.maxX,
            y: selectionBox.minY
        },
        {
            x: selectionBox.maxX,
            y: selectionBox.maxY
        },
        {
            x: selectionBox.minX,
            y: selectionBox.maxY
        }
    ];

    return corners.every(
        corner =>
            distance(
                corner,
                circle.center
            ) <=
            Math.abs(circle.radius)
    );
}

/*
 * The feature types drawn as a single straight span between
 * two points.
 *
 * They share one selection test and one way of reporting their
 * ends, so they are identified by one predicate rather than by
 * repeating the same list at every call site.
 */
const SPAN_SHAPED_TYPES = [
    "line",
    "beam",
    "cable",
    "shaft",
    "pin-connection",
    "fixed-connection",
    "slider-connection",
    "connection",
    "truss"
];

function isSpanShapedType(
    type
) {
    return SPAN_SHAPED_TYPES.includes(
        type
    );
}

export function arcSelectionPoints(
    geometry
) {
    const twoPi =
        Math.PI * 2;

    const normalize =
        value =>
            (
                (
                    value %
                    twoPi
                ) +
                twoPi
            ) %
            twoPi;

    const start =
        geometry.startAngle;

    const end =
        geometry.endAngle;

    const direction =
        geometry.sweep === -1
            ? -1
            : geometry.sweep === 1
                ? 1
                : (
                    end >= start
                        ? 1
                        : -1
                );

    let sweep =
        direction > 0
            ? normalize(
                end -
                start
            )
            : -normalize(
                end -
                start
            );

    if (
        Math.abs(sweep) <
        1e-9
    ) {
        sweep =
            twoPi;
    }

    const segmentCount =
        Math.max(
            32,
            Math.ceil(
                Math.abs(sweep) /
                (
                    Math.PI /
                    72
                )
            )
        );

    const points = [];

    for (
        let index = 0;
        index <=
            segmentCount;
        index += 1
    ) {
        const angle =
            start +
            sweep *
                (
                    index /
                    segmentCount
                );

        points.push({
            x:
                geometry.center.x +
                Math.cos(angle) *
                    geometry.radius,

            y:
                geometry.center.y +
                Math.sin(angle) *
                    geometry.radius
        });
    }

    return points;
}

function arcIntersectsSelection(
    geometry,
    selectionBox
) {
    return polylineIntersectsSelection(
        arcSelectionPoints(
            geometry
        ),
        selectionBox
    );
}

function coordinateSystemIntersectsSelection(
    geometry,
    selectionBox
) {
    const origin =
        geometry.origin;

    const axisLength =
        geometry.axisLength ??
        geometry.xAxisLength ??
        COORDINATE_SYSTEM_LENGTH;

    const xPositiveEnd = {
        x:
            origin.x +
            axisLength,

        y:
            origin.y
    };

    const xNegativeEnd = {
        x:
            origin.x -
            axisLength,

        y:
            origin.y
    };

    const yPositiveEnd = {
        x:
            origin.x,

        y:
            origin.y +
            axisLength
    };

    const yNegativeEnd = {
        x:
            origin.x,

        y:
            origin.y -
            axisLength
    };

    return (
        pointInsideSelection(
            origin,
            selectionBox
        ) ||

        segmentIntersectsSelection(
            origin,
            xPositiveEnd,
            selectionBox
        ) ||

        segmentIntersectsSelection(
            origin,
            xNegativeEnd,
            selectionBox
        ) ||

        segmentIntersectsSelection(
            origin,
            yPositiveEnd,
            selectionBox
        ) ||

        segmentIntersectsSelection(
            origin,
            yNegativeEnd,
            selectionBox
        )
    );
}

export function objectIntersectsSelection(
    object,
    selectionBox
) {
    if (
        !object ||
        !object.geometry ||
        !selectionBox
    ) {
        return false;
    }

    const geometry = object.geometry;

    /*
     * A rigid body, and a rectangle, are areas rather than
     * outlines: a rectangle drawn wholly inside a large rigid
     * body is a meaningful selection, so the closed outline is
     * tested as an area first and its edges are the fallback.
     */
    if (isRectangleLike(object)) {
        const corners =
            objectPoints(object);

        if (
            corners.some(
                corner =>
                    pointInsideSelection(
                        corner,
                        selectionBox
                    )
            )
        ) {
            return true;
        }
    }

    /*
     * A Point Force is a vector, so it is intersected along its
     * whole drawn length. The arrow head sits inside the span
     * of that vector, so the shaft is enough to catch a click
     * anywhere on the arrow.
     */
    if (object.type === "force") {
        return (
            (geometry.start &&
                geometry.end &&
                segmentIntersectsSelection(
                    geometry.start,
                    geometry.end,
                    selectionBox
                )) ||

            (geometry.start &&
                pointInsideSelection(
                    geometry.start,
                    selectionBox
                ))
        );
    }

    /*
     * A distributed load is one feature whatever the number of
     * arrows it draws, so the body it loads is what is tested:
     * selecting part of a load's field selects the whole load.
     */
    if (
        object.type === "load" ||
        object.type === "varying-load"
    ) {
        return (
            (geometry.start &&
                geometry.end &&
                segmentIntersectsSelection(
                    geometry.start,
                    geometry.end,
                    selectionBox
                )) ||
            distributedLoadArrowsIntersect(
                geometry,
                selectionBox
            )
        );
    }

    /*
     * A Truss the student built is drawn as its own members, so
     * any member meeting the rectangle selects the one Truss.
     * That is the point of keeping it as one object rather than
     * as a set of lines.
     */
    if (
        object.type === "truss" &&
        Array.isArray(geometry.members) &&
        geometry.members.length
    ) {
        return geometry.members.some(
            member =>
                segmentIntersectsSelection(
                    member.start,
                    member.end,
                    selectionBox
                )
        );
    }

    /*
     * A span-shaped Statics body: a Beam, Cable or Shaft, a
     * Connection, and a Varying Distributed Load. Each is a real
     * line to the selection test.
     */
    if (
        geometry.start &&
        geometry.end &&
        isSpanShapedType(object.type)
    ) {
        return segmentIntersectsSelection(
            geometry.start,
            geometry.end,
            selectionBox
        );
    }

    /*
     * A Point has no extent, so it is selected when it is in
     * the rectangle.
     */
    if (object.type === "point") {
        return pointInsideSelection(
            geometry.position ||
                geometry.point ||
                geometry,
            selectionBox
        );
    }

    /*
     * The shapes whose drawn outline is what is tested. The
     * closed loops are built with the first point repeated so
     * the closing side is included, exactly as they are drawn.
     */
    if (object.type === "rectangle") {
        const corners =
            objectPoints(object);

        if (
            polygonIntersectsSelection(
                corners,
                selectionBox
            )
        ) {
            return true;
        }

        return corners.some(
            corner =>
                pointInsideSelection(
                    corner,
                    selectionBox
                )
        );
    }

    if (object.type === "polygon") {
        const points =
            enggDrawingState.polygonVertices(
                geometry
            );

        if (points.length < 3) {
            return false;
        }

        if (
            polygonIntersectsSelection(
                points,
                selectionBox
            )
        ) {
            return true;
        }

        return points.some(
            point =>
                pointInsideSelection(
                    point,
                    selectionBox
                )
        );
    }

    if (object.type === "triangle") {
        const points =
            (geometry.points || []).filter(
                Boolean
            );

        if (points.length < 3) {
            return false;
        }

        if (
            polygonIntersectsSelection(
                points,
                selectionBox
            )
        ) {
            return true;
        }

        return points.some(
            point =>
                pointInsideSelection(
                    point,
                    selectionBox
                )
        );
    }

    if (object.type === "circle") {
        if (
            circleIntersectsSelection(
                geometry,
                selectionBox
            )
        ) {
            return true;
        }

        /*
         * A circle that swallows the whole rectangle counts
         * too: the rectangle is inside the circle, which is a
         * real intersection even though no part of the circle
         * itself is inside it.
         */
        return (
            pointInsideSelection(
                geometry.center,
                selectionBox
            ) ||
            rectangleInsideCircle(
                geometry,
                selectionBox
            )
        );
    }

    if (object.type === "arc") {
        return arcIntersectsSelection(
            geometry,
            selectionBox
        );
    }

    /*
     * A rigid body of any other shape: a circle or a polygon.
     * The outline is tested, and so is containment the other
     * way round, so a small selection inside a big body
     * still finds it.
     */
    if (object.type === "rigid-body") {
        const shape =
            enggFeatureGeometry.rigidBodyShape(
                geometry
            );

        const outline =
            enggFeatureGeometry.definingPoints(
                geometry,
                shape
            );

        if (
            polylineIntersectsSelection(
                [
                    ...outline,
                    outline[0]
                ],
                selectionBox
            )
        ) {
            return true;
        }

        return outline.some(
            point =>
                pointInsideSelection(
                    point,
                    selectionBox
                )
        );
    }

    /*
     * AN ANALYSIS OBJECT IS ONE THING, BOX-SELECTED AS ONE THING.
     *
     * A Force Components and a Resultant were reaching the fallback below,
     * which asks whether any point they are drawn through lies inside the
     * rectangle. A vector drawn horizontally passes through two points and
     * a great many positions between them, so a box drawn around a
     * resultant's middle - which is where a student naturally drags from -
     * found nothing at all, and the feature could be clicked but not swept
     * up.
     *
     * They are tested on their VECTORS, the same way a Point Force is
     * tested on its arrow, and deliberately not on the source force's
     * shared arrow for the reason given in `analysisObjectHit`: that ink
     * belongs to the force, and a box drawn over it should take the force.
     */
    if (
        object.type === "force-components" ||
        object.type === "resultant"
    ) {
        const vectors =
            object.type === "force-components"
                ? [
                      geometry.horizontal,
                      geometry.vertical
                  ]
                : [
                      geometry.start && geometry.end
                          ? {
                                start: geometry.start,
                                end: geometry.end
                            }
                          : null
                  ];

        return vectors
            .filter(Boolean)
            .some(
                vector =>
                    segmentIntersectsSelection(
                        vector.start,
                        vector.end,
                        selectionBox
                    )
            );
    }

    /*
     * Anything else: it is selected if any of the points the
     * object is drawn through is in the rectangle. That is the
     * same generous test the Feature Tree relies on, and it is
     * what keeps a feature with no special case from becoming
     * unselectable.
     */
    return objectPoints(
        object
    ).some(
        point =>
            pointInsideSelection(
                point,
                selectionBox
            )
    );
}

/*
 * Whether any part of a distributed load's arrow field meets
 * the rectangle.
 *
 * The arrows stand off the body in the load's own direction, so
 * a rectangle can catch an arrow while missing the body line
 * entirely. The arrows are rendering, not features, so what is
 * tested here is the same field the renderer draws.
 */
function distributedLoadArrowsIntersect(
    geometry,
    selectionBox
) {
    if (
        !geometry ||
        typeof enggLoadProfile ===
            "undefined"
    ) {
        return false;
    }

    const samples =
        enggLoadProfile.arrowSamples(
            geometry
        );

    if (!samples.length) {
        return false;
    }

    const peak =
        enggLoadProfile.peakMagnitude(
            geometry
        );

    if (peak <= 0) {
        return false;
    }

    const direction =
        enggLoadProfile.unitVector(
            enggLoadProfile.loadDirection(
                geometry
            )
        );

    /*
     * The same screen length a drawn arrow reaches, so the
     * test region matches the ink on the canvas at any zoom.
     */
    const reach =
        distributedLoadArrowScreenLength(
            peak,
            enggDrawingState
                .BASE_PIXELS_PER_UNIT *
                (drawingState?.camera?.zoom || 1)
        );

    return samples.some(sample => {
        const tip = {
            x:
                sample.base.x +
                direction.x * reach,
            y:
                sample.base.y +
                direction.y * reach
        };

        return segmentIntersectsSelection(
            sample.base,
            tip,
            selectionBox
        );
    });
}

/*
 * The screen length a distributed load's longest arrow is
 * drawn at.
 *
 * The renderer and the selection test both read it, which is
 * what keeps "what you can select" and "what you can see" the
 * same set of pixels.
 *
 * It follows the arrow's own rule: the magnitude in world units
 * converted at the current zoom. It used to be a fixed ceiling,
 * which meant that once a load was large enough to hit that
 * ceiling the selection test and the fit bounds both stopped
 * growing with the drawing, and a heavier load became impossible
 * to select in the part of its field that had grown past it.
 */
export function distributedLoadArrowScreenLength(
    magnitude,
    scale
) {
    const world = Math.max(
        Math.abs(Number(magnitude) || 0),
        0
    );

    if (world <= 0) {
        return 0;
    }

    return world * Math.max(scale, 1e-6);
}
