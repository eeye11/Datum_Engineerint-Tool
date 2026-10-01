/* Engineering drawing body frames - the local geometry every attachment reads. */
/*
 * A support is attached to a BODY at a point on its centreline, and is
 * drawn on the OUTSIDE of that body. Both halves of that sentence
 * need the body's own local geometry, and both were previously taken
 * from the attachment point itself - which is why a support had to be
 * dropped on the bottom edge of a beam to come out underneath it, and
 * why a support on a rotated beam hung off at a screen-fixed angle.
 *
 * So the local frame is worked out once, here, and everything that
 * attaches to a body reads it:
 *
 *   centreline   the member's own line, from its start to its end
 *   tangent      the direction the member runs
 *   normal       the direction across it - the two possible SIDES
 *   side         which of those two is outside, by engineering
 *                convention
 *   positionOn   how far along the member a point sits
 *
 * This is presentation and attachment geometry, not engineering
 * arithmetic. It knows nothing about what a support IS; it only knows
 * the shape of the thing the support is attached to, which is why the
 * same frame serves a moment, a connection and a load as well.
 */
(function () {
    "use strict";

    /*
     * The half-width of a body drawn as a real member, in WORLD units.
     *
     * A beam is drawn with a depth, and its centreline is the middle of
     * that depth - so a support attached to the centreline sits half a
     * depth inside the member, and the symbol has to start from the
     * member's face rather than from the centreline itself.
     *
     * The value is the drawing's own convention, and it is stated here
     * rather than in each of the several places that used to guess a
     * number: two features that disagree about how deep a beam is draw
     * their support in slightly different places, which is exactly the
     * sort of fault that is dismissed as a rounding error.
     */
    const DEFAULT_MEMBER_HALF_DEPTH = 3;

    /*
     * THE LOCAL FRAME OF A BODY, or null if it has no usable span.
     *
     * A beam, truss, cable, shaft or rigid body all have two ends, and
     * those two ends define the frame. A feature without a span has no
     * centreline to attach to, and the caller is told so rather than
     * being handed a guess.
     */
    function frameOf(object) {
        if (!object || !object.geometry) {
            return null;
        }

        const geometry = object.geometry;

        const start = firstDefined(
            geometry.start,
            geometry.position
        );

        const end = geometry.end;

        if (
            !isPoint(start) ||
            !isPoint(end)
        ) {
            return null;
        }

        const dx = end.x - start.x;
        const dy = end.y - start.y;

        const length = Math.hypot(dx, dy);

        if (length <= 1e-9) {
            return null;
        }

        const tangent = {
            x: dx / length,
            y: dy / length
        };

        /*
         * The normal, and the SIGN THAT PUTS "BELOW" IN THE RIGHT
         * PLACE.
         *
         * World y grows UPWARD, and the normal is taken
         * anticlockwise from the tangent, so for a member running left
         * to right the normal points to NEGATIVE y - which is DOWN.
         * That is the correct normal, and it is also why the side has
         * to be chosen by the normal's own sign rather than by a
         * coordinate: for this member the normal is already the side a
         * support belongs on, and negating it would put the symbol
         * above the beam.
         *
         * So the default side is whichever direction actually points
         * down the screen, and it is read from the SIGN rather than
         * from y growing downward - because it does not. Getting this
         * backwards draws every support on the wrong side of its
         * member, which is exactly the fault this whole change exists
         * to remove, so the reasoning is written out rather than
         * abbreviated.
         */
        const normal = {
            x: -tangent.y,
            y: tangent.x
        };

        /*
         * The normal in SCREEN terms, where y grows downward. This is
         * the same vector with its vertical part flipped, and it is
         * what "up" and "down" mean to somebody reading the drawing.
         */
        const screenNormal = {
            x: normal.x,
            y: -normal.y
        };

        return {
            start: { x: start.x, y: start.y },
            end: { x: end.x, y: end.y },
            length,
            tangent,
            normal,
            screenNormal,

            /*
             * How wide the member is drawn, so a support can start at
             * its face rather than at its middle.
             */
            halfDepth: halfDepthOf(object)
        };
    }

    function isPoint(value) {
        return Boolean(
            value &&
            Number.isFinite(value.x) &&
            Number.isFinite(value.y)
        );
    }

    function firstDefined(...values) {
        return values.find(
            value => value !== undefined && value !== null
        );
    }

    function halfDepthOf(object) {
        const geometry = object.geometry || {};

        const depth = Number(geometry.depth);

        if (Number.isFinite(depth) && depth > 0) {
            return depth / 2;
        }

        return DEFAULT_MEMBER_HALF_DEPTH;
    }

    /*
     * WHERE A BODY'S CENTRELINE IS, for snapping.
     *
     * A whole segment rather than a point, because a centreline is a
     * line: a support is placed by clicking anywhere along it, and a
     * candidate that existed only at the member's ends would make
     * putting a support at midspan - the most common thing anyone does
     * with a support - impossible without two clicks.
     */
    function centrelineOf(object) {
        const frame = frameOf(object);

        if (!frame) {
            return null;
        }

        return {
            start: frame.start,
            end: frame.end
        };
    }

    /*
     * WHICH SIDE IS OUTSIDE.
     *
     * Down the screen, for a member that runs left to right or right
     * to left - which is what a student means by "underneath", and is
     * the convention every statics drawing in existence uses for a
     * support.
     *
     * The test is on the normal's own sign rather than on a Y
     * coordinate, which is what makes it correct for a member that is
     * not horizontal: for one drawn at an angle, "down the screen"
     * resolves to whichever of the two sides faces downward, and the
     * support ends up genuinely outside the member instead of off at a
     * fixed screen offset that may well be inside it.
     */
    function defaultSide(
        frame,
        flipped
    ) {
        if (!frame) {
            return 1;
        }

        /*
         * World y grows upward and the normal points to negative y for
         * a level member, so the side that points DOWN THE SCREEN is
         * the normal's own sign - and for a member running right to
         * left that is the negative, because its normal points the
         * other way.
         *
         * Taking the sign rather than testing `y > 0` is what makes
         * this work for a member at any angle: the question is never
         * "does this direction have a positive y" but "which of the
         * two sides faces downward", and for a steep member one side
         * faces down and the other faces up regardless of the sign of
         * either component.
         */
        const side =
            frame.normal.y < 0 ? 1 : -1;

        return flipped ? -side : side;
    }

    /*
     * A POINT ALONG THE MEMBER, as a distance from its start.
     *
     * The distance along the member rather than a world coordinate,
     * and that is the difference between an attachment that follows
     * the body and one that floats. Resize the beam and a stored world
     * x lands in a different place on it; a stored distance from the
     * start does not, and the support is still where the student put
     * it.
     */
    function positionOn(
        frame,
        point
    ) {
        if (!frame || !isPoint(point)) {
            return 0;
        }

        return (
            (point.x - frame.start.x) * frame.tangent.x +
            (point.y - frame.start.y) * frame.tangent.y
        );
    }

    /*
     * THE WORLD POINT A DISTANCE ALONG THE MEMBER IS AT.
     *
     * The inverse of `positionOn`, and the reason the two are kept
     * together: an attachment stored as a distance is only meaningful
     * if it can always be turned back into a point on whatever the
     * member looks like now.
     */
    function pointAt(
        frame,
        distanceAlong
    ) {
        if (!frame) {
            return null;
        }

        return {
            x: frame.start.x + frame.tangent.x * distanceAlong,
            y: frame.start.y + frame.tangent.y * distanceAlong
        };
    }

    /*
     * WHERE A SUPPORT IS DRAWN, given where it is attached.
     *
     * The two are separate on purpose, and this function is the only
     * place the separation is realised. `attachment` is the point on
     * the centreline that the student clicked and that the snap
     * indicator sits on; `render` is the point the symbol is actually
     * drawn at, which is out past the member's face.
     *
     * Faking this - snapping to the outside edge and drawing an
     * indicator on the centreline - is what this exists to prevent. The
     * two positions are different numbers stored in different places,
     * and the symbol is genuinely attached to the centreline.
     */
    function supportPlacement(
        parent,
        attachment,
        flipped
    ) {
        const frame = frameOf(parent);

        if (!frame || !isPoint(attachment)) {
            return null;
        }

        const side = defaultSide(frame, flipped);

        /*
         * The offset from the centreline out to the member's own face,
         * and a little beyond it so the symbol sits clear of the drawn
         * body rather than starting inside it.
         */
        const standoff =
            frame.halfDepth +
            SUPPORT_CLEARANCE;

        return {
            attachment: { x: attachment.x, y: attachment.y },
            render: {
                x: attachment.x + frame.normal.x * side * standoff,
                y: attachment.y + frame.normal.y * side * standoff
            },
            side,
            distance: positionOn(frame, attachment),
            frame
        };
    }

    /*
     * How far clear of the member's face a support is drawn.
     *
     * A symbol drawn starting exactly on the face overlaps the body it
     * is supporting, and at a glance reads as though it were partly
     * inside it - which is the one thing a support must not look like.
     */
    const SUPPORT_CLEARANCE = 2;

    /*
     * The angle a support's symbol is drawn at, in radians, measured in
     * SCREEN space.
     *
     * Derived from the member's own normal, so a support on a rotated
     * body is rotated with it. This is what stops a rotated beam from
     * carrying a support that hangs straight down while the beam runs
     * diagonally - the symbol and the member have to agree about which
     * way is out.
     *
     * The symbol is drawn pointing AWAY from the member, so the angle
     * is the direction of the outward normal rather than the member's
     * own direction.
     */
    function supportAngle(
        frame,
        flipped
    ) {
        if (!frame) {
            return 0;
        }

        const side = defaultSide(frame, flipped);

        /*
         * Screen y grows downward, so the outward direction's angle is
         * measured with y negated: a normal pointing up the screen is
         * -90 degrees, not 90, and getting this backwards draws every
         * support into its own body.
         */
        return Math.atan2(
            -frame.normal.y * side,
            frame.normal.x * side
        );
    }

    window.enggBodyFrames = {
        DEFAULT_MEMBER_HALF_DEPTH,
        SUPPORT_CLEARANCE,
        frameOf,
        centrelineOf,
        defaultSide,
        positionOn,
        pointAt,
        supportPlacement,
        supportAngle
    };
})();
