/*
 * Shared feature geometry.
 *
 * This is the one place that knows how many points a
 * feature is made of and where they are. Move, rotate and
 * handle placement all read it, so a point can never be
 * transformed for one of them and missed by another. That
 * is the class of bug where a rectangle's corners fly
 * apart or a truss joint drifts away from its members.
 *
 * Nothing here knows about Statics: the same registry
 * describes a rectangle, a truss and a Point Force, which
 * is what keeps them on one shared system.
 */
(function (root) {
    "use strict";

    /*
     * The centre of a feature, in world coordinates.
     *
     * Every point of a coherent feature averages to the
     * same value, so the centre is derived from the actual
     * geometry rather than stored. It can therefore never
     * go stale after an edit or a transform.
     */
    function centerOf(
        geometry,
        type
    ) {
        const points =
            definingPoints(
                geometry,
                type
            );

        if (!points.length) {
            return null;
        }

        return {
            x:
                points.reduce(
                    (total, point) =>
                        total + point.x,
                    0
                ) / points.length,

            y:
                points.reduce(
                    (total, point) =>
                        total + point.y,
                    0
                ) / points.length
        };
    }

    /*
     * Every point that defines a feature's shape.
     *
     * A shape built from a centre, a size and a rotation
     * (a Rectangle or a Rigid Body) is expanded into its
     * corners here, so the transform layer always moves
     * concrete points and never has to special-case a
     * parameterised shape. The corners are recomputed from
     * the current rotation on every call, so a handle can
     * never be placed from a stale angle.
     */
    function definingPoints(
        geometry,
        type
    ) {
        const g = geometry || {};

        const point = value =>
            value &&
            Number.isFinite(value.x) &&
            Number.isFinite(value.y)
                ? value
                : null;

        const valid = list =>
            list.filter(point);

        /*
         * Rectangle-like shapes store a top-left corner, a
         * size and a rotation. Their four real corners are
         * what must move together, so they are expanded
         * rather than approximated by the corner plus a
         * size.
         */
        if (type === "rectangle") {
            return valid(
                rectangleCorners(g)
            );
        }

        /*
         * A rigid body may be a circle, a triangle or a polygon
         * instead of a rectangle. Resolving it through the shape
         * it currently has means the transform layer, the
         * renderer and the handles all follow a change of shape
         * without any of them needing a case for it.
         */
        if (type === "rigid-body") {
            const shape = rigidBodyShape(g);

            return shape === "rectangle"
                ? valid(
                      rectangleCorners(g)
                  )
                : valid(
                      definingPoints(
                          g,
                          shape
                      )
                  );
        }

        if (type === "polygon") {
            return valid(
                root.enggDrawingState
                    .polygonVertices(g)
            );
        }

        if (type === "circle") {
            const centre =
                point(g.center);

            if (!centre) {
                return [];
            }

            /*
             * A circle is rotationally symmetric, so its
             * defining points are a pair on the diameter.
             * Rotating it about its own centre is therefore
             * a no-op, which is the correct result.
             */
            return [
                {
                    x:
                        centre.x -
                        g.radius,

                    y: centre.y
                },

                {
                    x:
                        centre.x +
                        g.radius,

                    y: centre.y
                }
            ];
        }

        if (type === "arc") {
            const centre =
                point(g.center);

            if (!centre) {
                return [];
            }

            /*
             * An arc stores angles rather than a start and
             * an end point, so its two ends are resolved
             * from the current angles. They follow the
             * rotation with the centre, which is what stops
             * the ends separating from the arc.
             */
            return valid([
                {
                    x:
                        centre.x +
                        g.radius *
                            Math.cos(g.startAngle),

                    y:
                        centre.y +
                        g.radius *
                            Math.sin(g.startAngle)
                },

                {
                    x:
                        centre.x +
                        g.radius *
                            Math.cos(g.endAngle),

                    y:
                        centre.y +
                        g.radius *
                            Math.sin(g.endAngle)
                }
            ]);
        }

        if (type === "point") {
            return valid([
                g.position || g.point || g
            ]);
        }

        if (type === "particle") {
            return valid([
                g.position
            ]);
        }

        /*
         * Every span-defined feature: the structural
         * members, the loads, the connections and the Point
         * Force. A force is a vector from its application
         * point to its end, so both ends must move together
         * or the arrow stops being the force it describes.
         */
        if (
            type === "line" ||
            type === "beam" ||
            type === "truss" ||
            type === "cable" ||
            type === "shaft" ||
            type === "load" ||
            type === "varying-load" ||
            type === "force" ||
            type === "connection" ||
            type === "pin-connection" ||
            type === "fixed-connection" ||
            type === "slider-connection"
        ) {
            return valid([
                g.start,
                g.end
            ]);
        }

        if (
            type === "moment" ||
            type === "couple"
        ) {
            /*
             * A moment turns about its application point; a
             * couple is two forces whose lines of action
             * stay parallel, so its two arrow heads are the
             * points that define it.
             */
            return valid([
                g.position,
                coupleArrowPoint(g, 0),
                coupleArrowPoint(g, 1)
            ]);
        }

        if (
            type === "pin-support" ||
            type === "roller-support" ||
            type === "fixed-support" ||
            type === "smooth-support"
        ) {
            return valid([
                g.position
            ]);
        }

        /*
         * Anything else that stores an explicit point list
         * (a Triangle or a Polyline) moves each of its
         * points, which is what keeps a triangle's vertices
         * together.
         */
        if (Array.isArray(g.points)) {
            return valid(g.points);
        }

        return [];
    }

    /*
     * One arrow head of a Couple.
     *
     * The two arrows are opposite and equal, so a single
     * point is enough to describe where the feature is; it
     * is derived from the stored position and separation
     * rather than held as a second copy of the shape.
     */
    function coupleArrowPoint(
        g,
        index
    ) {
        if (!g.position) {
            return null;
        }

        const half =
            (Number(g.separation) || 0) / 2;

        return {
            x: g.position.x,

            y:
                g.position.y +
                (index === 0 ? half : -half)
        };
    }

    /*
     * The four corners of a rectangle-like shape, honouring
     * its current rotation. The position is the top-left
     * corner and the height extends downward in world
     * space.
     */
    function rectangleCorners(
        g
    ) {
        if (
            !g ||
            !Number.isFinite(g.position?.x) ||
            !Number.isFinite(g.position?.y) ||
            !Number.isFinite(g.width) ||
            !Number.isFinite(g.height)
        ) {
            return [];
        }

        const centre = {
            x: g.position.x + g.width / 2,
            y: g.position.y - g.height / 2
        };

        const angle =
            ((Number(g.rotation) || 0) *
                Math.PI) /
            180;

        const cos =
            Math.cos(angle);

        const sin =
            Math.sin(angle);

        return [
            [-g.width / 2, g.height / 2],
            [g.width / 2, g.height / 2],
            [g.width / 2, -g.height / 2],
            [-g.width / 2, -g.height / 2]
        ].map(([dx, dy]) => ({
            x:
                centre.x +
                dx * cos -
                dy * sin,

            y:
                centre.y +
                dx * sin +
                dy * cos
        }));
    }

    /*
     * A rectangle-like shape written back from its centre and
     * an absolute rotation.
     *
     * Rotation keeps a rectangle valid because the stored
     * rotation and the stored corner are derived from the
     * same rotation. The size never changes, so the shape
     * cannot drift out of being a rectangle however many
     * times it is turned.
     */
    function setRectangleFromCentre(
        g,
        centre,
        degrees
    ) {
        g.position = {
            x: centre.x - g.width / 2,
            y: centre.y + g.height / 2
        };

        g.rotation =
            ((degrees % 360) + 360) % 360;
    }

    /*
     * Rotate every defining point of a feature about a
     * pivot, by the same transform.
     *
     * P' = R(P - pivot) + pivot
     *
     * The point list is resolved before anything is written,
     * so a feature whose rotation changes how its own points
     * are derived (a Rectangle, a Polygon) still rotates all
     * of its corners together.
     */
    function rotateObjectAbout(
        object,
        pivot,
        radians
    ) {
        const g = object.geometry;

        if (
            !g ||
            !pivot
        ) {
            return;
        }

        const type =
            object.type;

        const cos =
            Math.cos(radians);

        const sin =
            Math.sin(radians);

        const turn = point => {
            const dx =
                point.x - pivot.x;

            const dy =
                point.y - pivot.y;

            point.x =
                pivot.x +
                dx * cos -
                dy * sin;

            point.y =
                pivot.y +
                dx * sin +
                dy * cos;
        };

        /*
         * A shape stored as a centre, a size and an angle
         * rotates by turning its centre and accumulating
         * its angle. Its corners are never stored, so there
         * is no second copy of them to fall out of step.
         */
        if (type === "rectangle") {
            const centre = {
                x: g.position.x + g.width / 2,
                y: g.position.y - g.height / 2
            };

            turn(centre);

            const currentDegrees =
                ((Number(g.rotation) || 0) %
                    360 +
                    360) %
                360;

            setRectangleFromCentre(
                g,
                centre,
                currentDegrees +
                    (radians * 180) / Math.PI
            );

            return;
        }

        if (type === "rigid-body") {
            /*
             * A rigid body rotates according to the shape it
             * currently has. A shape with its own angle stores
             * the turn; a shape made of points has every one of
             * those points turned together about the same pivot,
             * so no vertex can be left behind.
             */
            rotateRigidBody(
                g,
                pivot,
                radians,
                turn
            );

            return;
        }

        if (type === "polygon") {
            turn(g.center);

            g.rotation =
                (Number(g.rotation) || 0) +
                radians;

            return;
        }

        if (type === "arc") {
            turn(g.center);

            g.startAngle += radians;
            g.endAngle += radians;

            return;
        }

        /*
         * A truss the student built is defined by its own
         * members, so every member turns with the same pivot
         * and the same angle. The span end points that the
         * selection box and the rotation handle use follow the
         * outer joints, so a rotated truss stays one structure
         * rather than splitting into lines.
         */
        if (type === "truss" && Array.isArray(g.members)) {
            g.members.forEach((member) => {
                turn(member.start);
                turn(member.end);
            });

            if (g.start) turn(g.start);
            if (g.end) turn(g.end);

            return;
        }

        /*
         * Every other feature is a set of concrete points,
         * so rotating the resolved list moves all of them
         * with the same pivot and the same angle. This is
         * the shared path that fixes vertices, joints,
         * endpoints and symbols separating from their
         * features.
         */
        definingPoints(
            g,
            type
        ).forEach(turn);
    }

    /*
     * Rotate a rigid body in whichever form its current shape
     * is stored.
     *
     * The angle-based shapes accumulate their rotation; the
     * point-based ones have every point transformed together.
     * Both keep the same pivot, so a change of shape can never
     * leave part of the body behind.
     */
    function rotateRigidBody(g, pivot, radians, turn) {
        const shape = rigidBodyShape(g);

        if (shape === "rectangle") {
            const centre = {
                x: g.position.x + g.width / 2,
                y: g.position.y - g.height / 2
            };

            turn(centre);

            setRectangleFromCentre(
                g,
                centre,
                (Number(g.rotation) || 0) + (radians * 180) / Math.PI
            );

            return;
        }

        if (shape === "circle") {
            /*
             * A circle is rotationally symmetric, so a turn
             * leaves it looking identical. The stored angle is
             * still advanced so the Features panel reports it.
             */
            if (g.center) {
                turn(g.center);
            }

            g.rotation = (Number(g.rotation) || 0) + radians;

            return;
        }

        if (shape === "polygon") {
            if (g.center) {
                turn(g.center);
            }

            g.rotation = (Number(g.rotation) || 0) + radians;

            return;
        }

        (g.points || []).filter(Boolean).forEach(turn);
    }

    /*
     * Move every defining point of a feature by a delta.
     *
     * As with rotation, a parameterised shape moves by its
     * stored anchor, and a point-defined shape moves each
     * of its points, so no part is ever left behind.
     */
    function translateObject(
        object,
        deltaX,
        deltaY
    ) {
        const g = object.geometry;

        if (!g) {
            return;
        }

        if (
            object.type ===
                "rectangle" ||
            object.type ===
                "rigid-body"
        ) {
            /*
             * A rigid body is moved by whatever anchor its
             * current shape stores, so a body that has become a
             * circle or a triangle still moves as one piece.
             */
            moveAnchor(
                g,
                object.type,
                deltaX,
                deltaY
            );

            return;
        }

        if (
            object.type === "circle" ||
            object.type === "arc" ||
            object.type === "polygon"
        ) {
            if (!g.center) {
                return;
            }

            g.center.x += deltaX;
            g.center.y += deltaY;
            return;
        }

        if (type === "truss" && Array.isArray(g.members)) {
            g.members.forEach((member) => {
                member.start.x += deltaX;
                member.start.y += deltaY;
                member.end.x += deltaX;
                member.end.y += deltaY;
            });

            if (g.start) {
                g.start.x += deltaX;
                g.start.y += deltaY;
            }

            if (g.end) {
                g.end.x += deltaX;
                g.end.y += deltaY;
            }

            return;
        }

        definingPoints(
            g,
            object.type
        ).forEach(point => {
            point.x += deltaX;
            point.y += deltaY;
        });
    }

    /*
     * Move a shape by whichever single anchor it stores.
     *
     * A rigid body can hold a corner, a centre or a list of
     * points depending on its shape, so moving it through one
     * helper is what keeps every shape translating as a single
     * coherent body rather than only the rectangle one.
     */
    function moveAnchor(
        g,
        type,
        deltaX,
        deltaY
    ) {
        if (
            type !== "rigid-body" ||
            rigidBodyShape(g) === "rectangle"
        ) {
            g.position.x += deltaX;
            g.position.y += deltaY;
            return;
        }

        if (g.center) {
            g.center.x += deltaX;
            g.center.y += deltaY;
            return;
        }

        if (Array.isArray(g.points)) {
            g.points.forEach(point => {
                point.x += deltaX;
                point.y += deltaY;
            });
        }
    }

    /*
     * The shapes a Rigid Body can take.
     *
     * A rigid body is one body, and these are the outlines it
     * can have. Changing the shape rewrites the same body
     * rather than replacing it, so its identity, its name and
     * its attachments all survive the change.
     */
    const RIGID_BODY_SHAPES = [
      "rectangle",
      "circle",
      "triangle",
      "polygon"
    ];

    /*
     * The shape a rigid body currently has.
     *
     * A body created before shapes existed has no stored shape
     * and is a rectangle, which is the shape it was drawn as.
     */
    function rigidBodyShape(geometry) {
      const shape = geometry?.shape;
      return RIGID_BODY_SHAPES.includes(shape) ? shape : "rectangle";
    }

    /*
     * The centre of a rigid body, whatever shape it has.
     *
     * Each shape keeps a centre, so reading it through one helper
     * means a change of shape does not make the body jump.
     */
    function rigidBodyCenter(geometry) {
      if (!geometry) return null;

      if (rigidBodyShape(geometry) === "polygon") {
        return geometry.center || null;
      }

      if (rigidBodyShape(geometry) === "circle") {
        return geometry.center || null;
      }

      if (rigidBodyShape(geometry) === "triangle") {
        return triangleCenter(geometry.points) || geometry.position || null;
      }

      return {
        x: geometry.position.x + geometry.width / 2,
        y: geometry.position.y - geometry.height / 2
      };
    }

    /*
     * The centre of a triangle from its three points.
     */
    function triangleCenter(points) {
      const valid = (points || []).filter(
        (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)
      );

      if (valid.length < 3) return null;

      return {
        x: (valid[0].x + valid[1].x + valid[2].x) / 3,
        y: (valid[0].y + valid[1].y + valid[2].y) / 3
      };
    }

    /*
     * Three points for a triangle of the given size, centred.
     *
     * A body that changes shape into a triangle needs real points,
     * because a triangle has no width and height to fall back on.
     * They are derived from the centre and the current size so the
     * body keeps the place and the rough extent it already had.
     */
    function trianglePointsFor(centre, width, height) {
      const w = (Number(width) || 50) / 2;
      const h = (Number(height) || 50) / 2;

      return [
        { x: centre.x, y: centre.y + h },
        { x: centre.x - w, y: centre.y - h },
        { x: centre.x + w, y: centre.y - h }
      ];
    }

    root.enggFeatureGeometry = {
      RIGID_BODY_SHAPES,
      centerOf,
      coupleArrowPoint,
      definingPoints,
      rectangleCorners,
      rigidBodyCenter,
      rigidBodyShape,
      rotateObjectAbout,
      setRectangleFromCentre,
      translateObject,
      triangleCenter,
      trianglePointsFor
    };
})(window);
