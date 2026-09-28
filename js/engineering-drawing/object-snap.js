/* Engineering drawing object snapping and geometric inference. */
(function () {
    const SNAP_TOLERANCE_PX = 12;
    const INFERENCE_TOLERANCE_DEGREES = 7;
    const INFERENCE_DIRECTION_HYSTERESIS_PX = 1;

    const SNAP_PRIORITY = {
        endpoint: 1,
        intersection: 2,
        center: 3,
        midpoint: 4,
        quadrant: 5,
        pointOnEntity: 6
    };

    const CONSTRUCTION_TYPES = new Set([
        "point",
        "line",
        "polyline",
        "rectangle",
        "circle",
        "arc"
    ]);

    function point(x, y) {
        return {
            x,
            y
        };
    }

    function distance(first, second) {
        return Math.hypot(
            second.x - first.x,
            second.y - first.y
        );
    }

    function addCandidate(
        candidates,
        type,
        objectId,
        candidatePoint
    ) {
        if (
            !candidatePoint ||
            !Number.isFinite(candidatePoint.x) ||
            !Number.isFinite(candidatePoint.y)
        ) {
            return;
        }

        candidates.push({
            type,
            objectId,
            point: {
                x: candidatePoint.x,
                y: candidatePoint.y
            },
            priority:
                SNAP_PRIORITY[type]
        });
    }

    function getTolerancePx(state) {
        const configured =
            Number(
                state?.objectSnap?.tolerancePx
            );

        if (
            Number.isFinite(configured) &&
            configured > 0
        ) {
            return configured;
        }

        return SNAP_TOLERANCE_PX;
    }

    function getInferenceTolerancePx(state) {
        const configured =
            Number(
                state?.objectSnap?.inferenceTolerancePx
            );

        if (
            Number.isFinite(configured) &&
            configured > 0
        ) {
            return configured;
        }

        return 8;
    }

    function normalizeAngle(angle) {
        const twoPi =
            Math.PI * 2;

        return (
            (
                angle %
                twoPi
            ) +
            twoPi
        ) %
        twoPi;
    }

    function angleOnDirectedArc(
        angle,
        startAngle,
        endAngle,
        sweep
    ) {
        const twoPi =
            Math.PI * 2;

        const current =
            normalizeAngle(angle);

        const start =
            normalizeAngle(startAngle);

        const direction =
            sweep === -1
                ? -1
                : 1;

        let travelled;
        const rawTotal = direction > 0
            ? endAngle - startAngle
            : startAngle - endAngle;

        if (rawTotal >= twoPi - 1e-9) {
            return true;
        }

        let total;

        if (direction > 0) {
            travelled =
                normalizeAngle(
                    current - start
                );

            total = normalizeAngle(rawTotal);
        } else {
            travelled =
                normalizeAngle(
                    start - current
                );

            total = normalizeAngle(rawTotal);
        }

        if (
            total <
            1e-9
        ) {
            return true;
        }

        return (
            travelled <=
            total + 1e-9
        );
    }

    function getArcSweep(
        geometry
    ) {
        if (
            geometry.sweep === -1
        ) {
            return -1;
        }

        if (
            geometry.sweep === 1
        ) {
            return 1;
        }

        return geometry.endAngle >=
            geometry.startAngle
            ? 1
            : -1;
    }

    function rectangleCorners(
        geometry
    ) {
        const left =
            geometry.position.x;

        const right =
            geometry.position.x +
            geometry.width;

        const bottom =
            geometry.position.y;

        const top =
            bottom +
            geometry.height;

        const rotation =
            (
                Number(
                    geometry.rotation
                ) || 0
            ) *
            Math.PI /
            180;

        const center = {
            x:
                (
                    left +
                    right
                ) / 2,

            y:
                (
                    top +
                    bottom
                ) / 2
        };

        const localCorners = [
            {
                x: left,
                y: top
            },
            {
                x: right,
                y: top
            },
            {
                x: right,
                y: bottom
            },
            {
                x: left,
                y: bottom
            }
        ];

        if (
            Math.abs(rotation) <
            1e-12
        ) {
            return localCorners;
        }

        const cosine =
            Math.cos(rotation);

        const sine =
            Math.sin(rotation);

        return localCorners.map(
            corner => {
                const dx =
                    corner.x -
                    center.x;

                const dy =
                    corner.y -
                    center.y;

                return {
                    x:
                        center.x +
                        dx * cosine -
                        dy * sine,

                    y:
                        center.y +
                        dx * sine +
                        dy * cosine
                };
            }
        );
    }

    function rectangleSegments(
        geometry
    ) {
        const corners =
            rectangleCorners(
                geometry
            );

        return [
            [
                corners[0],
                corners[1]
            ],
            [
                corners[1],
                corners[2]
            ],
            [
                corners[2],
                corners[3]
            ],
            [
                corners[3],
                corners[0]
            ]
        ];
    }

    function segmentCandidates(
        candidates,
        objectId,
        start,
        end
    ) {
        addCandidate(
            candidates,
            "endpoint",
            objectId,
            start
        );

        addCandidate(
            candidates,
            "endpoint",
            objectId,
            end
        );

        addCandidate(
            candidates,
            "midpoint",
            objectId,
            {
                x:
                    (
                        start.x +
                        end.x
                    ) / 2,

                y:
                    (
                        start.y +
                        end.y
                    ) / 2
            }
        );
    }

    /*
     * The four arm end points of a coordinate system.
     *
     * Kept local to the snap module so snapping can use
     * the axis extents without reaching into the drawing
     * controller.
     */
    function coordinateSystemArmEnds(
        geometry
    ) {
        const origin =
            geometry?.origin;

        if (!origin) {
            return [];
        }

        const fallback =
            Number.isFinite(Number(geometry.axisLength)) &&
            Number(geometry.axisLength) > 0
                ? Number(geometry.axisLength)
                : 25;

        const read = value =>
            Number.isFinite(Number(value)) && Number(value) > 0
                ? Number(value)
                : fallback;

        return [
            {
                x: origin.x + read(geometry.xPositiveLength),
                y: origin.y
            },
            {
                x: origin.x - read(geometry.xNegativeLength),
                y: origin.y
            },
            {
                x: origin.x,
                y: origin.y + read(geometry.yPositiveLength)
            },
            {
                x: origin.x,
                y: origin.y - read(geometry.yNegativeLength)
            }
        ];
    }

    /*
     * Statics bodies that span two points. A Beam, Truss,
     * Cable and Shaft all run from a start to an end, so
     * the snap system treats them as the spans they are.
     */
    const SLENDER_STATICS_BODIES = [
        "beam",
        "truss",
        "cable",
        "shaft"
    ];

    /*
     * Statics bodies defined by a single location rather
     * than a span.
     */
    const LOCATED_STATICS_BODIES = [
        "particle",
        "rigid-body"
    ];

    /*
     * The centre of a Rigid Body.
     *
     * Its geometry stores the top-left corner plus a size,
     * so the centre is derived rather than stored, keeping
     * one source of truth for the shape.
     */
    function rigidBodyCentre(
        geometry
    ) {
        if (
            !geometry ||
            !Number.isFinite(geometry.position?.x) ||
            !Number.isFinite(geometry.width)
        ) {
            return null;
        }

        return {
            x:
                geometry.position.x +
                geometry.width / 2,

            y:
                geometry.position.y -
                geometry.height / 2
        };
    }

    function addObjectCandidates(
        candidates,
        object
    ) {
        if (
            !object ||
            !object.geometry
        ) {
            return;
        }

        const geometry =
            object.geometry;

        if (object.type === "point") {
            addCandidate(
                candidates,
                "endpoint",
                object.id,
                geometry.position || geometry.point || geometry
            );
            return;
        }

        if (
            object.type ===
            "coordinate-system-2d"
        ) {
            /*
             * The origin plus each arm end are snap
             * references, so the axis lines and their
             * extents stay usable for inference and
             * origin snapping without extra hidden
             * geometry.
             */
            addCandidate(
                candidates,
                "endpoint",
                object.id,
                geometry.origin
            );

            coordinateSystemArmEnds(
                geometry
            ).forEach(
                end =>
                    addCandidate(
                        candidates,
                        "endpoint",
                        object.id,
                        end
                    )
            );

            return;
        }

        if (
            object.type ===
            "line"
        ) {
            segmentCandidates(
                candidates,
                object.id,
                geometry.start,
                geometry.end
            );

            return;
        }

        /*
         * A slender Statics body is a real line to the snap
         * system: its endpoints and its midpoint are the
         * places a force or a support is usually attached.
         * Registering the same candidate kinds a Line
         * publishes is what lets a snapped Point Force
         * recognise the body it landed on, rather than
         * needing an attachment system of its own.
         */
        /*
         * A Truss the student built snaps on its own joints, so
         * a new feature can attach to a joint rather than to an
         * arbitrary point along a member. It uses the shared
         * candidate list, so it gets the same snapping and the
         * same priority as every other geometry.
         */
        if (
            object.type === "truss" &&
            Array.isArray(geometry.members) &&
            geometry.members.length
        ) {
            const seen = [];

            geometry.members.forEach((member) => {
                [member.start, member.end].forEach((point) => {
                    const known = seen.find(
                        (existing) =>
                            Math.hypot(
                                existing.x - point.x,
                                existing.y - point.y
                            ) < 1e-6
                    );

                    if (known) {
                        return;
                    }

                    seen.push({ x: point.x, y: point.y });

                    addCandidate(
                        candidates,
                        "endpoint",
                        object.id,
                        point
                    );
                });
            });

            return;
        }

        if (
            SLENDER_STATICS_BODIES.includes(
                object.type
            )
        ) {
            segmentCandidates(
                candidates,
                object.id,
                geometry.start,
                geometry.end
            );

            return;
        }

        /*
         * A Particle and a Rigid Body are located bodies
         * rather than spans, so only their centre is
         * published.
         */
        if (
            LOCATED_STATICS_BODIES.includes(
                object.type
            )
        ) {
            const centre =
                object.type === "particle"
                    ? geometry.position ||
                        geometry.point ||
                        geometry
                    : rigidBodyCentre(geometry);

            if (centre) {
                addCandidate(
                    candidates,
                    "center",
                    object.id,
                    centre
                );
            }

            return;
        }

        if (
            object.type ===
            "polyline"
        ) {
            if (
                !Array.isArray(
                    geometry.points
                )
            ) {
                return;
            }

            geometry.points.forEach(
                (
                    current,
                    index
                ) => {
                    addCandidate(
                        candidates,
                        "endpoint",
                        object.id,
                        current
                    );

                    if (
                        index > 0
                    ) {
                        const previous =
                            geometry.points[
                                index - 1
                            ];

                        addCandidate(
                            candidates,
                            "midpoint",
                            object.id,
                            {
                                x:
                                    (
                                        previous.x +
                                        current.x
                                    ) / 2,

                                y:
                                    (
                                        previous.y +
                                        current.y
                                    ) / 2
                            }
                        );
                    }
                }
            );

            return;
        }

        if (
            object.type ===
            "polygon"
        ) {
            /*
             * Vertices come from the shared polygon
             * definition, so snapping always agrees with
             * what is rendered.
             */
            const vertices =
                enggDrawingState.polygonVertices(
                    geometry
                );

            addCandidate(
                candidates,
                "center",
                object.id,
                geometry.center
            );

            vertices.forEach(
                vertex =>
                    addCandidate(
                        candidates,
                        "endpoint",
                        object.id,
                        vertex
                    )
            );

            vertices.forEach(
                (
                    vertex,
                    index
                ) => {
                    const next =
                        vertices[
                            (
                                index + 1
                            ) %
                            vertices.length
                        ];

                    if (!next) {
                        return;
                    }

                    addCandidate(
                        candidates,
                        "midpoint",
                        object.id,
                        {
                            x:
                                (
                                    vertex.x +
                                    next.x
                                ) / 2,

                            y:
                                (
                                    vertex.y +
                                    next.y
                                ) / 2
                        }
                    );
                }
            );

            return;
        }

        if (
            object.type ===
            "triangle"
        ) {
            if (
                !Array.isArray(
                    geometry.points
                )
            ) {
                return;
            }

            const corners =
                geometry.points.filter(
                    Boolean
                );

            corners.forEach(
                corner =>
                    addCandidate(
                        candidates,
                        "endpoint",
                        object.id,
                        corner
                    )
            );

            /*
             * The triangle is closed, so the final
             * side runs from the last corner back to
             * the first.
             */
            corners.forEach(
                (
                    corner,
                    index
                ) => {
                    const next =
                        corners[
                            (
                                index + 1
                            ) %
                            corners.length
                        ];

                    if (!next) {
                        return;
                    }

                    addCandidate(
                        candidates,
                        "midpoint",
                        object.id,
                        {
                            x:
                                (
                                    corner.x +
                                    next.x
                                ) / 2,

                            y:
                                (
                                    corner.y +
                                    next.y
                                ) / 2
                        }
                    );
                }
            );

            return;
        }

        if (
            object.type ===
            "rectangle"
        ) {
            rectangleSegments(
                geometry
            ).forEach(
                segment =>
                    segmentCandidates(
                        candidates,
                        object.id,
                        segment[0],
                        segment[1]
                    )
            );

            return;
        }

        if (
            object.type ===
            "circle"
        ) {
            addCandidate(
                candidates,
                "center",
                object.id,
                geometry.center
            );

            const quadrantAngles = [
                0,
                Math.PI / 2,
                Math.PI,
                Math.PI * 1.5
            ];

            quadrantAngles.forEach(
                angle => {
                    addCandidate(
                        candidates,
                        "quadrant",
                        object.id,
                        {
                            x:
                                geometry.center.x +
                                Math.cos(angle) *
                                    geometry.radius,

                            y:
                                geometry.center.y +
                                Math.sin(angle) *
                                    geometry.radius
                        }
                    );
                }
            );

            return;
        }

        if (
            object.type ===
            "arc"
        ) {
            const start = {
                x:
                    geometry.center.x +
                    Math.cos(
                        geometry.startAngle
                    ) *
                    geometry.radius,

                y:
                    geometry.center.y +
                    Math.sin(
                        geometry.startAngle
                    ) *
                    geometry.radius
            };

            const end = {
                x:
                    geometry.center.x +
                    Math.cos(
                        geometry.endAngle
                    ) *
                    geometry.radius,

                y:
                    geometry.center.y +
                    Math.sin(
                        geometry.endAngle
                    ) *
                    geometry.radius
            };

            addCandidate(
                candidates,
                "endpoint",
                object.id,
                start
            );

            addCandidate(
                candidates,
                "endpoint",
                object.id,
                end
            );

            addCandidate(
                candidates,
                "center",
                object.id,
                geometry.center
            );

            const quadrantAngles = [
                0,
                Math.PI / 2,
                Math.PI,
                Math.PI * 1.5
            ];

            const sweep =
                getArcSweep(
                    geometry
                );

            quadrantAngles.forEach(
                angle => {
                    if (
                        !angleOnDirectedArc(
                            angle,
                            geometry.startAngle,
                            geometry.endAngle,
                            sweep
                        )
                    ) {
                        return;
                    }

                    addCandidate(
                        candidates,
                        "quadrant",
                        object.id,
                        {
                            x:
                                geometry.center.x +
                                Math.cos(angle) *
                                    geometry.radius,

                            y:
                                geometry.center.y +
                                Math.sin(angle) *
                                    geometry.radius
                        }
                    );
                }
            );
        }
    }

    function objectSegments(
        object
    ) {
        if (
            !object ||
            !object.geometry
        ) {
            return [];
        }

        if (
            object.type ===
            "line"
        ) {
            return [
                [
                    object.geometry.start,
                    object.geometry.end
                ]
            ];
        }

        if (
            object.type ===
            "polyline"
        ) {
            const points =
                object.geometry.points;

            if (
                !Array.isArray(points) ||
                points.length < 2
            ) {
                return [];
            }

            const segments = [];

            for (
                let index = 1;
                index < points.length;
                index += 1
            ) {
                segments.push([
                    points[index - 1],
                    points[index]
                ]);
            }

            return segments;
        }

        if (
            object.type ===
            "rectangle"
        ) {
            return rectangleSegments(
                object.geometry
            );
        }

        if (
            object.type ===
            "triangle"
        ) {
            const points =
                (
                    object.geometry.points ||
                    []
                ).filter(
                    Boolean
                );

            if (
                points.length < 3
            ) {
                return [];
            }

            const segments = [];

            points.forEach(
                (
                    point,
                    index
                ) => {
                    segments.push([
                        point,
                        points[
                            (
                                index + 1
                            ) %
                            points.length
                        ]
                    ]);
                }
            );

            return segments;
        }

        if (
            object.type ===
            "polygon"
        ) {
            const vertices =
                enggDrawingState.polygonVertices(
                    object.geometry
                );

            if (
                vertices.length < 3
            ) {
                return [];
            }

            return vertices.map(
                (
                    vertex,
                    index
                ) => [
                    vertex,
                    vertices[
                        (
                            index + 1
                        ) %
                        vertices.length
                    ]
                ]
            );
        }

        return [];
    }

    function lineIntersection(
        firstStart,
        firstEnd,
        secondStart,
        secondEnd
    ) {
        const denominator =
            (
                firstStart.x -
                firstEnd.x
            ) *
            (
                secondStart.y -
                secondEnd.y
            ) -
            (
                firstStart.y -
                firstEnd.y
            ) *
            (
                secondStart.x -
                secondEnd.x
            );

        if (
            Math.abs(
                denominator
            ) <
            1e-9
        ) {
            return null;
        }

        const firstCross =
            firstStart.x *
                firstEnd.y -
            firstStart.y *
                firstEnd.x;

        const secondCross =
            secondStart.x *
                secondEnd.y -
            secondStart.y *
                secondEnd.x;

        const x =
            (
                firstCross *
                    (
                        secondStart.x -
                        secondEnd.x
                    ) -

                (
                    firstStart.x -
                    firstEnd.x
                ) *
                    secondCross
            ) /
            denominator;

        const y =
            (
                firstCross *
                    (
                        secondStart.y -
                        secondEnd.y
                    ) -

                (
                    firstStart.y -
                    firstEnd.y
                ) *
                    secondCross
            ) /
            denominator;

        const within =
            (
                start,
                end,
                value
            ) =>
                value >=
                    Math.min(
                        start,
                        end
                    ) -
                    1e-9 &&
                value <=
                    Math.max(
                        start,
                        end
                    ) +
                    1e-9;

        if (
            !within(
                firstStart.x,
                firstEnd.x,
                x
            ) ||
            !within(
                firstStart.y,
                firstEnd.y,
                y
            ) ||
            !within(
                secondStart.x,
                secondEnd.x,
                x
            ) ||
            !within(
                secondStart.y,
                secondEnd.y,
                y
            )
        ) {
            return null;
        }

        return {
            x,
            y
        };
    }

    function curveGeometryForObject(object) {
        if (
            !object?.geometry
        ) {
            return null;
        }

        if (
            object.type === "circle" ||
            object.type === "arc"
        ) {
            const geometry =
                object.geometry;

            if (
                !geometry.center ||
                !Number.isFinite(geometry.radius) ||
                geometry.radius <= 0
            ) {
                return null;
            }

            return {
                type: object.type,
                center: geometry.center,
                radius: geometry.radius,
                startAngle: geometry.startAngle,
                endAngle: geometry.endAngle,
                sweep: geometry.sweep
            };
        }

        return null;
    }

    function pointOnCurve(point, curve) {
        if (curve.type === "circle") {
            return true;
        }

        const angle =
            Math.atan2(
                point.y - curve.center.y,
                point.x - curve.center.x
            );

        return angleOnDirectedArc(
            angle,
            curve.startAngle,
            curve.endAngle,
            getArcSweep(curve)
        );
    }

    function segmentCurveIntersections(
        start,
        end,
        curve
    ) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const fx = start.x - curve.center.x;
        const fy = start.y - curve.center.y;

        const a = dx * dx + dy * dy;

        if (a < 1e-12) {
            return [];
        }

        const b = 2 * (fx * dx + fy * dy);
        const c =
            fx * fx +
            fy * fy -
            curve.radius * curve.radius;

        const discriminant =
            b * b -
            4 * a * c;

        if (discriminant < -1e-9) {
            return [];
        }

        const root =
            Math.sqrt(
                Math.max(0, discriminant)
            );

        const ratios = [
            (-b - root) / (2 * a),
            (-b + root) / (2 * a)
        ];

        const intersections = [];

        ratios.forEach(ratio => {
            if (
                ratio < -1e-9 ||
                ratio > 1 + 1e-9
            ) {
                return;
            }

            const point = {
                x: start.x + ratio * dx,
                y: start.y + ratio * dy
            };

            if (pointOnCurve(point, curve)) {
                intersections.push(point);
            }
        });

        return intersections;
    }

    function curveCurveIntersections(
        first,
        second
    ) {
        const dx =
            second.center.x - first.center.x;

        const dy =
            second.center.y - first.center.y;

        const centerDistance =
            Math.hypot(dx, dy);

        if (
            centerDistance < 1e-12 ||
            centerDistance > first.radius + second.radius + 1e-9 ||
            centerDistance < Math.abs(first.radius - second.radius) - 1e-9
        ) {
            return [];
        }

        const along =
            (
                first.radius * first.radius -
                second.radius * second.radius +
                centerDistance * centerDistance
            ) / (2 * centerDistance);

        const heightSquared =
            first.radius * first.radius -
            along * along;

        if (heightSquared < -1e-9) {
            return [];
        }

        const height =
            Math.sqrt(
                Math.max(0, heightSquared)
            );

        const base = {
            x: first.center.x + along * dx / centerDistance,
            y: first.center.y + along * dy / centerDistance
        };

        const offsetX =
            -dy * height / centerDistance;

        const offsetY =
            dx * height / centerDistance;

        const intersections = [
            {
                x: base.x + offsetX,
                y: base.y + offsetY
            },
            {
                x: base.x - offsetX,
                y: base.y - offsetY
            }
        ];

        return intersections.filter(
            (point, index) =>
                pointOnCurve(point, first) &&
                pointOnCurve(point, second) &&
                (
                    index === 0 ||
                    distance(point, intersections[0]) > 1e-9
                )
        );
    }

    function objectIntersectionPoints(
        first,
        second
    ) {
        const firstSegments =
            objectSegments(first);

        const secondSegments =
            objectSegments(second);

        const firstCurve =
            curveGeometryForObject(first);

        const secondCurve =
            curveGeometryForObject(second);

        const intersections = [];

        firstSegments.forEach(firstSegment => {
            secondSegments.forEach(secondSegment => {
                const point =
                    lineIntersection(
                        firstSegment[0],
                        firstSegment[1],
                        secondSegment[0],
                        secondSegment[1]
                    );

                if (point) {
                    intersections.push(point);
                }
            });

            if (secondCurve) {
                intersections.push(
                    ...segmentCurveIntersections(
                        firstSegment[0],
                        firstSegment[1],
                        secondCurve
                    )
                );
            }
        });

        secondSegments.forEach(secondSegment => {
            if (firstCurve) {
                intersections.push(
                    ...segmentCurveIntersections(
                        secondSegment[0],
                        secondSegment[1],
                        firstCurve
                    )
                );
            }
        });

        if (firstCurve && secondCurve) {
            intersections.push(
                ...curveCurveIntersections(
                    firstCurve,
                    secondCurve
                )
            );
        }

        return intersections.filter(
            (point, index) =>
                intersections.findIndex(
                    other =>
                        distance(point, other) <= 1e-8
                ) === index
        );
    }

    function addIntersections(
        candidates,
        objects
    ) {
        for (
            let firstIndex = 0;
            firstIndex <
            objects.length;
            firstIndex += 1
        ) {
            const first =
                objects[firstIndex];

            const firstHasGeometry =
                objectSegments(first).length > 0 ||
                Boolean(curveGeometryForObject(first));

            if (
                !firstHasGeometry
            ) {
                continue;
            }

            for (
                let secondIndex =
                    firstIndex + 1;
                secondIndex <
                objects.length;
                secondIndex += 1
            ) {
                const second =
                    objects[
                        secondIndex
                    ];

                const secondHasGeometry =
                    objectSegments(second).length > 0 ||
                    Boolean(curveGeometryForObject(second));

                if (
                    !secondHasGeometry
                ) {
                    continue;
                }

                objectIntersectionPoints(
                    first,
                    second
                ).forEach(
                    intersection =>
                        addCandidate(
                            candidates,
                            "intersection",
                            `${first.id}:${second.id}`,
                            intersection
                        )
                );
            }
        }
    }

    function closestPointOnSegment(
        target,
        start,
        end
    ) {
        const dx =
            end.x -
            start.x;

        const dy =
            end.y -
            start.y;

        const lengthSquared =
            dx * dx +
            dy * dy;

        if (
            lengthSquared <
            1e-12
        ) {
            return {
                ...start
            };
        }

        const ratio =
            Math.max(
                0,
                Math.min(
                    1,
                    (
                        (
                            target.x -
                            start.x
                        ) *
                        dx +

                        (
                            target.y -
                            start.y
                        ) *
                        dy
                    ) /
                    lengthSquared
                )
            );

        return {
            x:
                start.x +
                ratio * dx,

            y:
                start.y +
                ratio * dy
        };
    }

    function closestPointOnArc(
        target,
        geometry
    ) {
        const dx =
            target.x -
            geometry.center.x;

        const dy =
            target.y -
            geometry.center.y;

        const angle =
            Math.atan2(
                dy,
                dx
            );

        const sweep =
            getArcSweep(
                geometry
            );

        if (
            !angleOnDirectedArc(
                angle,
                geometry.startAngle,
                geometry.endAngle,
                sweep
            )
        ) {
            const start = {
                x:
                    geometry.center.x +
                    Math.cos(
                        geometry.startAngle
                    ) *
                    geometry.radius,

                y:
                    geometry.center.y +
                    Math.sin(
                        geometry.startAngle
                    ) *
                    geometry.radius
            };

            const end = {
                x:
                    geometry.center.x +
                    Math.cos(
                        geometry.endAngle
                    ) *
                    geometry.radius,

                y:
                    geometry.center.y +
                    Math.sin(
                        geometry.endAngle
                    ) *
                    geometry.radius
            };

            const startDistance =
                distance(
                    target,
                    start
                );

            const endDistance =
                distance(
                    target,
                    end
                );

            return startDistance <=
                endDistance
                ? start
                : end;
        }

        return {
            x:
                geometry.center.x +
                Math.cos(angle) *
                    geometry.radius,

            y:
                geometry.center.y +
                Math.sin(angle) *
                    geometry.radius
        };
    }

    function closestPointOnObject(
        rawPoint,
        object
    ) {
        if (
            !object ||
            !object.geometry
        ) {
            return null;
        }

        if (
            object.type ===
            "coordinate-system-2d"
        ) {
            return {
                ...object.geometry.origin
            };
        }

        if (
            object.type ===
            "line"
        ) {
            return closestPointOnSegment(
                rawPoint,
                object.geometry.start,
                object.geometry.end
            );
        }

        if (
            object.type ===
            "polyline"
        ) {
            const segments =
                objectSegments(
                    object
                );

            if (
                !segments.length
            ) {
                return null;
            }

            let closest = null;
            let closestDistance =
                Infinity;

            segments.forEach(
                segment => {
                    const candidate =
                        closestPointOnSegment(
                            rawPoint,
                            segment[0],
                            segment[1]
                        );

                    const candidateDistance =
                        distance(
                            rawPoint,
                            candidate
                        );

                    if (
                        candidateDistance <
                        closestDistance
                    ) {
                        closest =
                            candidate;

                        closestDistance =
                            candidateDistance;
                    }
                }
            );

            return closest;
        }

        if (
            object.type ===
            "rectangle"
        ) {
            const segments =
                rectangleSegments(
                    object.geometry
                );

            let closest = null;
            let closestDistance =
                Infinity;

            segments.forEach(
                segment => {
                    const candidate =
                        closestPointOnSegment(
                            rawPoint,
                            segment[0],
                            segment[1]
                        );

                    const candidateDistance =
                        distance(
                            rawPoint,
                            candidate
                        );

                    if (
                        candidateDistance <
                        closestDistance
                    ) {
                        closest =
                            candidate;

                        closestDistance =
                            candidateDistance;
                    }
                }
            );

            return closest;
        }

        if (
            object.type ===
            "circle"
        ) {
            const dx =
                rawPoint.x -
                object.geometry.center.x;

            const dy =
                rawPoint.y -
                object.geometry.center.y;

            const length =
                Math.hypot(
                    dx,
                    dy
                );

            if (
                length <
                1e-12
            ) {
                return {
                    x:
                        object.geometry.center.x +
                        object.geometry.radius,

                    y:
                        object.geometry.center.y
                };
            }

            return {
                x:
                    object.geometry.center.x +
                    (
                        dx /
                        length
                    ) *
                    object.geometry.radius,

                y:
                    object.geometry.center.y +
                    (
                        dy /
                        length
                    ) *
                    object.geometry.radius
            };
        }

        if (
            object.type ===
            "arc"
        ) {
            return closestPointOnArc(
                rawPoint,
                object.geometry
            );
        }

        return null;
    }

    function screenPoint(
        engineeringPoint,
        bounds,
        state
    ) {
        return enggDrawingState.engineeringToScreen(
            engineeringPoint,
            {
                width:
                    bounds.width,

                height:
                    bounds.height
            },
            state
        );
    }

    function screenDistance(
        first,
        second,
        bounds,
        state
    ) {
        const firstScreen =
            screenPoint(
                first,
                bounds,
                state
            );

        const secondScreen =
            screenPoint(
                second,
                bounds,
                state
            );

        return Math.hypot(
            secondScreen.x -
                firstScreen.x,

            secondScreen.y -
                firstScreen.y
        );
    }

    function buildSnapCandidates(
        state
    ) {
        const candidates = [];

        state.objects.forEach(
            object => {
                addObjectCandidates(
                    candidates,
                    object
                );
            }
        );

        addIntersections(
            candidates,
            state.objects
        );

        return candidates;
    }

    function findInferenceCandidate(
        rawPoint,
        state,
        bounds,
        options = {},
        availableReferences = null
    ) {
        if (
            !state?.objectSnap?.enabled ||
            !Array.isArray(state.objects)
        ) {
            return null;
        }

        const tolerancePx =
            getInferenceTolerancePx(
                state
            );

        const pointerScreen =
            screenPoint(
                rawPoint,
                bounds,
                state
            );

        const references =
            availableReferences ||
            buildSnapCandidates(
                state
            );

        /*
         * Selected geometry also acts as reference
         * geometry, so a point being placed can align
         * with the feature the user is working on.
         *
         * This reuses the same candidate builder, so
         * the reference points are the existing
         * construction points (endpoints, midpoints,
         * centres, quadrants) of the selection.
         */
        const selectedIds =
            state.selection
                ?.selectedObjectIds ||
            [];

        if (selectedIds.length) {
            state.objects.forEach(
                object => {
                    if (
                        !selectedIds.includes(
                            object.id
                        )
                    ) {
                        return;
                    }

                    addObjectCandidates(
                        references,
                        object
                    );
                }
            );
        }

        if (
            options.lineStart &&
            Number.isFinite(options.lineStart.x) &&
            Number.isFinite(options.lineStart.y)
        ) {
            references.push({
                type: "endpoint",
                objectId: "construction-start",
                point: {
                    ...options.lineStart
                },
                priority: SNAP_PRIORITY.endpoint
            });
        }

        /*
         * Tools that anchor on more than one earlier point
         * (the triangle's third corner aligns with both
         * previously placed corners) pass those points here.
         * Each becomes an H/V reference through the same
         * pipeline, so no tool needs its own inference.
         */
        (
            Array.isArray(options.inferenceReferences)
                ? options.inferenceReferences
                : []
        ).forEach(
            (
                reference,
                index
            ) => {
                if (
                    !reference ||
                    !Number.isFinite(reference.x) ||
                    !Number.isFinite(reference.y)
                ) {
                    return;
                }

                references.push({
                    type: "endpoint",
                    objectId:
                        `construction-reference-${index}`,
                    point: {
                        ...reference
                    },
                    priority: SNAP_PRIORITY.endpoint
                });
            }
        );

        const candidates = {
            horizontal: [],
            vertical: []
        };

        references.forEach(
            reference => {
                const referenceScreen =
                    screenPoint(
                        reference.point,
                        bounds,
                        state
                    );

                const horizontalDistancePx =
                    Math.abs(
                        pointerScreen.y -
                        referenceScreen.y
                    );

                if (
                    horizontalDistancePx <=
                    tolerancePx
                ) {
                    candidates.horizontal.push({
                        type: "horizontal",
                        referencePoint: {
                            ...reference.point
                        },
                        point: {
                            x: rawPoint.x,
                            y: reference.point.y
                        },
                        distancePx:
                            horizontalDistancePx,
                        distanceToReferencePx:
                            Math.hypot(
                                pointerScreen.x -
                                    referenceScreen.x,
                                horizontalDistancePx
                            ),
                        priority:
                            reference.priority ?? 99,
                        objectId:
                            reference.objectId ?? ""
                    });
                }

                const verticalDistancePx =
                    Math.abs(
                        pointerScreen.x -
                        referenceScreen.x
                    );

                if (
                    verticalDistancePx <=
                    tolerancePx
                ) {
                    candidates.vertical.push({
                        type: "vertical",
                        referencePoint: {
                            ...reference.point
                        },
                        point: {
                            x: reference.point.x,
                            y: rawPoint.y
                        },
                        distancePx:
                            verticalDistancePx,
                        distanceToReferencePx:
                            Math.hypot(
                                verticalDistancePx,
                                pointerScreen.y -
                                    referenceScreen.y
                            ),
                        priority:
                            reference.priority ?? 99,
                        objectId:
                            reference.objectId ?? ""
                    });
                }
            }
        );

        const compareCandidates =
            (first, second) => {
                if (
                    Math.abs(
                        first.distancePx -
                        second.distancePx
                    ) > 1e-6
                ) {
                    return (
                        first.distancePx -
                        second.distancePx
                    );
                }

                if (
                    Math.abs(
                        first.distanceToReferencePx -
                        second.distanceToReferencePx
                    ) > 1e-6
                ) {
                    return (
                        first.distanceToReferencePx -
                        second.distanceToReferencePx
                    );
                }

                if (
                    first.priority !==
                    second.priority
                ) {
                    return (
                        first.priority -
                        second.priority
                    );
                }

                const firstObjectId =
                    String(first.objectId);

                const secondObjectId =
                    String(second.objectId);

                if (
                    firstObjectId !== secondObjectId
                ) {
                    return firstObjectId < secondObjectId
                        ? -1
                        : 1;
                }

                return (
                    first.referencePoint.x -
                        second.referencePoint.x ||
                    first.referencePoint.y -
                        second.referencePoint.y
                );
            };

        candidates.horizontal.sort(
            compareCandidates
        );

        candidates.vertical.sort(
            compareCandidates
        );

        const horizontal =
            candidates.horizontal[0] ||
            null;

        const vertical =
            candidates.vertical[0] ||
            null;

        if (!horizontal) {
            return vertical;
        }

        if (!vertical) {
            return horizontal;
        }

        /*
         * Both constraints are valid, so they can be
         * applied together: X is taken from the
         * vertical reference and Y from the horizontal
         * one.
         *
         * The combined point must also be close to the
         * cursor, otherwise two unrelated references
         * (for example one object's top edge and a far
         * away object's left edge) would invent a
         * corner the user is nowhere near. When the
         * crossing is out of reach, the nearer
         * single-axis constraint is used instead.
         */
        const combinedPoint = {
            x: vertical.referencePoint.x,
            y: horizontal.referencePoint.y
        };

        const combinedDistancePx =
            Math.hypot(
                screenPoint(
                    combinedPoint,
                    bounds,
                    state
                ).x -
                    pointerScreen.x,
                screenPoint(
                    combinedPoint,
                    bounds,
                    state
                ).y -
                    pointerScreen.y
            );

        if (
            combinedDistancePx >
            tolerancePx
        ) {
            return horizontal.distancePx <=
                vertical.distancePx
                ? horizontal
                : vertical;
        }

        return {
            type: "horizontal-vertical",

            /*
             * Keep both reference points so the guide
             * lines and the status text can describe
             * each axis separately.
             */
            referencePoint: {
                x: vertical.referencePoint.x,
                y: horizontal.referencePoint.y
            },

            horizontalReferencePoint: {
                ...horizontal.referencePoint
            },

            verticalReferencePoint: {
                ...vertical.referencePoint
            },

            point: combinedPoint,

            distancePx:
                Math.hypot(
                    horizontal.distancePx,
                    vertical.distancePx
                ),

            horizontalDistancePx:
                horizontal.distancePx,

            verticalDistancePx:
                vertical.distancePx,

            priority:
                Math.min(
                    horizontal.priority,
                    vertical.priority
                ),

            objectId:
                horizontal.objectId ||
                vertical.objectId
        };
    }

    function findSnapCandidate(
        rawPoint,
        state,
        bounds,
        availableCandidates = null
    ) {
        if (
            !state ||
            !state.objectSnap ||
            !state.objectSnap.enabled ||
            !Array.isArray(
                state.objects
            ) ||
            !state.objects.length
        ) {
            return null;
        }

        const tolerancePx =
            getTolerancePx(
                state
            );

        const rawScreenPoint =
            screenPoint(
                rawPoint,
                bounds,
                state
            );

        const candidates =
            availableCandidates ||
            buildSnapCandidates(
                state
            );

        const nearby = [];

        candidates.forEach(
            candidate => {
                const candidateScreen =
                    screenPoint(
                        candidate.point,
                        bounds,
                        state
                    );

                const dx =
                    candidateScreen.x -
                    rawScreenPoint.x;

                const dy =
                    candidateScreen.y -
                    rawScreenPoint.y;

                const candidateDistance =
                    Math.hypot(
                        dx,
                        dy
                    );

                if (
                    candidateDistance <=
                    tolerancePx
                ) {
                    nearby.push({
                        ...candidate,

                        screenPoint:
                            candidateScreen,

                        distance:
                            candidateDistance
                    });
                }
            }
        );

        state.objects.forEach(
            object => {
                if (
                    !CONSTRUCTION_TYPES.has(
                        object.type
                    ) &&
                    object.type !==
                        "coordinate-system-2d"
                ) {
                    return;
                }

                const closest =
                    closestPointOnObject(
                        rawPoint,
                        object
                    );

                if (
                    !closest
                ) {
                    return;
                }

                const candidateScreen =
                    screenPoint(
                        closest,
                        bounds,
                        state
                    );

                const candidateDistance =
                    Math.hypot(
                        candidateScreen.x -
                            rawScreenPoint.x,

                        candidateScreen.y -
                            rawScreenPoint.y
                    );

                if (
                    candidateDistance <=
                    tolerancePx
                ) {
                    nearby.push({
                        type:
                            "pointOnEntity",

                        objectId:
                            object.id,

                        point: {
                            ...closest
                        },

                        priority:
                            SNAP_PRIORITY.pointOnEntity,

                        screenPoint:
                            candidateScreen,

                        distance:
                            candidateDistance
                    });
                }
            }
        );

        if (
            !nearby.length
        ) {
            return null;
        }

        nearby.sort(
            (
                first,
                second
            ) => {
                if (
                    Math.abs(
                        first.distance -
                        second.distance
                    ) <
                    0.5
                ) {
                    return (
                        first.priority -
                        second.priority
                    );
                }

                return (
                    first.distance -
                    second.distance
                );
            }
        );

        return nearby[0];
    }

    function inferLinePoint(
        startPoint,
        targetPoint
    ) {
        if (
            !startPoint ||
            !targetPoint
        ) {
            return {
                point:
                    targetPoint,
                type:
                    null
            };
        }

        const dx =
            targetPoint.x -
            startPoint.x;

        const dy =
            targetPoint.y -
            startPoint.y;

        if (
            Math.hypot(
                dx,
                dy
            ) <
            1e-9
        ) {
            return {
                point:
                    targetPoint,
                type:
                    null
            };
        }

        const angle =
            Math.atan2(
                dy,
                dx
            ) *
            180 /
            Math.PI;

        const horizontal =
            Math.min(
                Math.abs(angle),
                Math.abs(
                    Math.abs(angle) -
                    180
                )
            ) <=
            INFERENCE_TOLERANCE_DEGREES;

        const vertical =
            Math.abs(
                Math.abs(angle) -
                90
            ) <=
            INFERENCE_TOLERANCE_DEGREES;

        if (
            horizontal
        ) {
            return {
                point: {
                    x:
                        targetPoint.x,

                    y:
                        startPoint.y
                },

                type:
                    "Horizontal"
            };
        }

        if (
            vertical
        ) {
            return {
                point: {
                    x:
                        startPoint.x,

                    y:
                        targetPoint.y
                },

                type:
                    "Vertical"
            };
        }

        return {
            point:
                targetPoint,

            type:
                null
        };
    }

    function resolveConstructionPoint(
        rawPoint,
        state,
        bounds,
        options = {}
    ) {
        const candidates =
            Array.isArray(state?.objects)
                ? buildSnapCandidates(state)
                : [];

        const snapCandidate =
            findSnapCandidate(
                rawPoint,
                state,
                bounds,
                candidates
            );

        let effectivePoint;

        let snappedPoint =
            null;

        let inferredPoint =
            null;

        let inference =
            null;

        if (
            snapCandidate
        ) {
            snappedPoint = {
                ...snapCandidate.point
            };

            effectivePoint = {
                ...snapCandidate.point
            };
        } else {
            inference =
                findInferenceCandidate(
                    rawPoint,
                    state,
                    bounds,
                    options,
                    candidates
                );

            if (inference) {
                inferredPoint = {
                    ...inference.point
                };

                effectivePoint = {
                    ...inference.point
                };
            } else {
                effectivePoint =
                    state.snap.enabled
                        ? {
                            x:
                                enggDrawingState.snapCoordinate(
                                    rawPoint.x,
                                    state
                                ),

                            y:
                                enggDrawingState.snapCoordinate(
                                    rawPoint.y,
                                    state
                                )
                        }
                        : {
                            ...rawPoint
                        };
            }
        }

        return {
            rawPointerPoint: {
                ...rawPoint
            },

            snappedPoint,

            inferredPoint,

            effectiveConstructionPoint:
                effectivePoint,

            snapCandidate,

            hoveredEntity:
                snapCandidate?.objectId ||
                null,

            inference
        };
    }

    window.enggDrawingSnap = {
        SNAP_TOLERANCE_PX,
        INFERENCE_TOLERANCE_DEGREES,
        buildSnapCandidates,
        findInferenceCandidate,
        findSnapCandidate,
        inferLinePoint,
        resolveConstructionPoint,
        closestPointOnObject,
        screenDistance
    };
})();
