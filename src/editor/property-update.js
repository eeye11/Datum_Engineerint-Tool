/*
 * Applying an edited property to a feature.
 */

import enggDimensions from "../core/scale/dimensions.js";
import enggLoadProfile from "../features/analysis/load-profile.js";
import { COORDINATE_SYSTEM_TYPE } from "./constants.js";
import { drawingState } from "./editor-state.js";
import { moveRigidBodyTo, resizeRigidBody, setRigidBodyRadius } from "./property-inputs.js";
import { isLoadGeometry, pointAtStation, relativeParentOf } from "./relative-coordinates.js";
import { applyTriangleSidesAndAngles } from "./triangle-editing.js";

export function updateFeatureProperty(object, key, value) {
    const g = object.geometry;
    const fixed = name => Boolean(object.constraints?.[name]);
    const positive = value > 0;

    /*
     * A RELATIVE coordinate is an offset from the parent the
     * feature is drawn under, and is answered here for every type
     * at once rather than inside each type's own block.
     *
     * Writing it moves the CHILD by the given offset from where
     * the parent is now, and touches nothing about the parent. The
     * stored geometry is still absolute - the parent may be
     * dragged, loaded, or re-parented later, and the absolute
     * position has to survive all of that - so the local value is
     * translated through the parent's live origin rather than
     * stored. That is what makes the relationship hold: drag the
     * parent and the child follows it, and the offset shown in the
     * panel is still the same offset.
     */
    const relative = /^relative\.([xy])$/.exec(key);

    /*
     * THE LENGTH OF A STRAIGHT BODY IS EDITABLE.
     *
     * Length is presented in the panel as a number, and until now it was
     * read-only because it is DERIVED from the two ends - so a reader
     * was right to treat it as a measurement of the member rather than
     * something to type into.
     *
     * It is a real property now, and it has to be applied to the GEOMETRY
     * rather than to the number on screen. Setting the stored value and
     * redrawing would change the label and nothing else, leaving a beam
     * that still spans the old distance but claims a new one - which is
     * exactly the kind of contradiction that makes every downstream
     * number wrong, because the spans, the support positions and the
     * analysis all read the ends.
     *
     * THE START IS THE ANCHOR. The far end is moved along the member's
     * existing direction until it sits the requested distance from the
     * start, so the member's orientation is preserved and the body grows
     * or shrinks about the end the student placed first. That is the
     * same anchor the panel's other relative edits use, and it means a
     * body resized this way stays put where it was pinned.
     *
     * A zero-length request is refused: it would collapse the member to a
     * point, which is not a body and cannot carry a load or be snapped
     * to. The near-zero floor keeps the direction well defined instead.
     */
    if (key === "length" && positive && g.start && g.end) {
        if (fixed("length")) return false;

        const dx = g.end.x - g.start.x;
        const dy = g.end.y - g.start.y;
        const current = Math.hypot(dx, dy);

        /*
         * A body with no direction yet - two ends on the same point -
         * cannot be stretched, because there is nothing to stretch
         * along. Editing the start or the end gives it a direction
         * first.
         */
        if (current <= 1e-6) {
            return false;
        }

        /*
         * THE PANEL SPEAKS MILLIMETRES; THE GEOMETRY WORKS IN WORLD UNITS.
         *
         * The Features panel shows Length as a physical size and the
         * creation popup asks for one, so a student typing 750 means
         * 750 mm. That has to become world units before the end is
         * moved, or the beam grows to 750 world units and is then
         * reported back as several metres - the same number meaning
         * two different lengths depending on who is reading it.
         *
         * This is the SAME conversion the creation popup uses, which
         * is what keeps the two routes from disagreeing about what a
         * millimetre is.
         */
        const world = enggDimensions?.fromEngineering
            ? enggDimensions.fromEngineering(
                drawingState,
                value,
                'mm'
            )
            : value;

        g.end = {
            x: g.start.x + (dx / current) * world,
            y: g.start.y + (dy / current) * world
        };

        /*
         * Nothing to do about the attachments.
         *
         * They used to be stored as an absolute distance along the
         * member, which meant a resize had to walk every child and
         * rescale it by hand. An attachment is now stored as the
         * FRACTION of the member it sits at, so the far end moving is
         * all it takes: half of a longer member is still half of it, and
         * every support, connection and load on the member is carried
         * along by its own stored value.
         *
         * Leaving it out is what makes the rule single: there is one
         * representation, so a resize cannot need a special case and a
         * drag cannot disagree with it.
         */
        return true;
    }

    if (relative) {
        if (fixed(key)) return false;

        const parent = object.parentId
            ? drawingState.objects.find(
                  (candidate) =>
                      candidate.id === object.parentId
              )
            : null;

        if (!parent) {
            return false;
        }

        const origin =
            parent.geometry?.start ||
            parent.geometry?.position ||
            parent.geometry?.origin;

        if (!origin) {
            return false;
        }

        const axis = relative[1];

        /*
         * A RELATIVE NUMBER IS WRITTEN IN MILLIMETRES.
         *
         * The reader above prints the offset through mmOf, so the
         * panel shows engineering units. Writing it straight into the
         * geometry treats those millimetres as world units, which on
         * any calibrated sheet lands the child at a completely
         * different place than the number just read - the row stops
         * being the same measurement it is supposed to be editable.
         *
         * Converting here with the sheet's own scale is what makes
         * Relative To a live measurement in both directions: what the
         * panel prints is exactly what the panel accepts.
         */
        const worldValue = enggDimensions?.fromEngineering
            ? enggDimensions.fromEngineering(
                  drawingState,
                  value,
                  'mm'
              )
            : value;

        /*
         * The same places the panel reads as this feature's
         * anchor, written together: a force is positioned by its
         * application point, a support by its position, a load by
         * the start of the span it acts on. Moving only the start
         * of a load would leave its far end behind and shorten the
         * loaded region, so all of a feature's span is carried
         * across by the same amount.
         */
        if (g.start && g.end) {
            const shiftX =
                axis === "x"
                    ? worldValue - (g.start.x - origin.x)
                    : 0;

            const shiftY =
                axis === "y"
                    ? worldValue - (g.start.y - origin.y)
                    : 0;

            [g.start, g.end].forEach((point) => {
                point.x += shiftX;
                point.y += shiftY;
            });

            if (g.position) {
                g.position = { ...g.start };
            }

            return true;
        }

        if (g.position) {
            if (axis === "x") {
                g.position.x = origin.x + worldValue;
            } else {
                g.position.y = origin.y + worldValue;
            }

            if (g.start) {
                g.start = { ...g.position };
            }

            return true;
        }

        return false;
    }

    if (object.type === 'triangle') {
        /*
         * Point coordinates are the source of truth in
         * Points mode; sides and angles rebuild the
         * points in Sides & Angles mode.
         */
        const pointMatch =
            /^points\.(\d)\.([xy])$/.exec(key);

        if (pointMatch) {
            const index =
                Number(pointMatch[1]);

            const axis =
                pointMatch[2];

            if (
                fixed(`points.${index}`) ||
                !g.points?.[index]
            ) {
                return false;
            }

            g.points[index][axis] =
                value;

            return true;
        }

        if (
            key.startsWith('side') ||
            key.startsWith('angle')
        ) {
            return applyTriangleSidesAndAngles(
                object,
                key,
                value
            );
        }

        return false;
    }

    if (key.startsWith('points.')) {
        const [, index, axis] = key.split('.');
        if (fixed(`points.${index}`) || !g.points?.[index]) return false;
        g.points[index][axis] = value;
        return true;
    }

    if (object.type === 'line') {
        const start = g.start;
        const end = g.end;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        if (key.startsWith('start.') || key.startsWith('end.')) {
            const [pointKey, axis] = key.split('.');
            if (fixed(pointKey) || (fixed('start') && fixed('end'))) return false;
            const point = g[pointKey];
            const otherKey = pointKey === 'start' ? 'end' : 'start';
            const other = g[otherKey];
            const next = { ...point, [axis]: value };
            if (fixed('length') || fixed('angle')) {
                if (fixed(otherKey)) {
                    // A single coordinate cannot be changed independently when
                    // the opposite endpoint and a dimension are both fixed.
                    return false;
                }
                const sign = pointKey === 'start' ? 1 : -1;
                const proposedAngle = Math.atan2(
                    (next.y - other.y) * -sign,
                    (next.x - other.x) * -sign
                );
                const direction = fixed('angle') ? angle : proposedAngle;
                const extent = fixed('length') ? length :
                    Math.hypot(next.x - other.x, next.y - other.y);
                point[axis] = value;
                other.x = next.x + sign * extent * Math.cos(direction);
                other.y = next.y + sign * extent * Math.sin(direction);
            } else {
                point[axis] = value;
            }
            return true;
        }
        if (key === 'length' && positive && !fixed('length')) {
            if (fixed('end') && fixed('start')) return false;

            /*
             * THE PANEL SPEAKS MILLIMETRES, THE GEOMETRY WORKS IN
             * WORLD UNITS.
             *
             * The Features panel shows Length as a physical size, so
             * a student typing 500 there means 500 mm. The end is
             * moved to that distance from the anchor, which means
             * the value has to become world units first - otherwise
             * "500" would silently become a beam of 500 world units
             * and then be reported back as something over a metre.
             *
             * The conversion is the SAME one the creation popup uses,
             * which is what keeps the two routes from disagreeing: a
             * length typed at creation and the same length typed in
             * the panel move the beam by the same amount.
             */
            const world = enggDimensions?.fromEngineering
                ? enggDimensions.fromEngineering(
                    drawingState,
                    value,
                    'mm'
                )
                : value;

            const target = fixed('end') ? start : end;
            const anchor = fixed('end') ? end : start;
            const direction = fixed('end') ? angle + Math.PI : angle;
            target.x = anchor.x + world * Math.cos(direction);
            target.y = anchor.y + world * Math.sin(direction);
            return true;
        }
        if (key === 'angle' && !fixed('angle')) {
            if (fixed('start') && fixed('end')) return false;
            const radians = value * Math.PI / 180;
            if (fixed('end')) {
                start.x = end.x - length * Math.cos(radians);
                start.y = end.y - length * Math.sin(radians);
            } else {
                end.x = start.x + length * Math.cos(radians);
                end.y = start.y + length * Math.sin(radians);
            }
            return true;
        }
        return false;
    }

    if (object.type === "force") {
        /*
         * A Point Force is one vector, and the panel offers it two
         * ways: as a magnitude and a direction, or as the two
         * components it is made of. Each edit is therefore
         * applied to the CURRENT vector and then written back
         * through the one function that updates every
         * representation of it at once.
         *
         * Doing it this way is what makes the two views
         * interchangeable: typing a magnitude and switching to
         * components shows the components that magnitude implies,
         * and typing a component and switching back shows the
         * magnitude and angle those components imply.
         */
        if (
            key === 'start.x' ||
            key === 'start.y'
        ) {
            if (fixed('start') || !g.start) return false;

            const axis = key.split('.')[1];

            g.start[axis] = value;
            g.position = {
                x: g.start.x,
                y: g.start.y
            };

            return true;
        }

        const vector =
            enggLoadProfile.forceVector(g);

        if (key === 'magnitude') {
            if (fixed('magnitude')) return false;
            enggLoadProfile.setForceVector(
                g,
                value,
                vector.angle
            );
            return true;
        }

        if (key === 'angle') {
            if (fixed('angle')) return false;
            enggLoadProfile.setForceVector(
                g,
                vector.magnitude,
                value
            );
            return true;
        }

        if (key === 'forceX' || key === 'forceY') {
            if (fixed(key)) return false;

            enggLoadProfile.setForceVector(
                g,
                Math.hypot(
                    key === 'forceX' ? value : vector.fx,
                    key === 'forceY' ? value : vector.fy
                ),
                Math.atan2(
                    key === 'forceY' ? value : vector.fy,
                    key === 'forceX' ? value : vector.fx
                ) * 180 / Math.PI
            );

            return true;
        }

        return false;
    }

    if (object.type === "load") {
        /*
         * A Distributed Load is one continuous load, and each of
         * its properties is a parameter of that load rather than
         * a separate thing to be edited.
         *
         * The direction is one value shared by every arrow, which
         * is what keeps the field parallel. The interval is a
         * sampling parameter, not a list of forces: changing it
         * changes how finely the same continuous load is drawn.
         * The defining points are the shape of the profile, and a
         * position is stored as a fraction along the body so
         * moving or resizing the body carries the profile with it.
         */
        if (
            key === 'start.x' ||
            key === 'start.y' ||
            key === 'end.x' ||
            key === 'end.y'
        ) {
            if (fixed(key)) return false;

            const [pointKey, axis] = key.split('.');

            g[pointKey][axis] = value;

            return true;
        }

        if (key === 'direction') {
            if (fixed('direction')) return false;
            enggLoadProfile.setLoadDirection(g, value);
            return true;
        }

        if (key === 'interval') {
            if (fixed('interval')) return false;
            enggLoadProfile.setLoadInterval(g, value);
            return true;
        }

        if (key === 'intensity') {
            if (fixed('intensity')) return false;

            /*
             * Intensity is the mean of the profile, so writing it
             * scales the whole load uniformly rather than
             * overwriting a single arrow's length.
             */
            const points =
                enggLoadProfile.profilePoints(g);

            const peak =
                enggLoadProfile.peakMagnitude(g);

            if (peak <= 0) {
                return false;
            }

            enggLoadProfile.setProfilePoints(
                g,
                points.map(point => ({
                    t: point.t,
                    magnitude: point.magnitude * value / peak
                }))
            );

            return true;
        }

        const loadPoint =
            /^loadPoint\.(\d+)\.(magnitude|t)$/.exec(key);

        if (loadPoint) {
            const index =
                Number(loadPoint[1]);

            const field =
                loadPoint[2];

            if (fixed(key)) return false;

            const points =
                enggLoadProfile.profilePoints(g);

            if (!points[index]) {
                return false;
            }

            if (field === 'magnitude') {
                points[index].magnitude =
                    Math.max(0, value);
            } else {
                /*
                 * A position of 100 is the far end of the body,
                 * so a value typed as a percentage is divided
                 * back down to the fraction the model stores. It is
                 * clamped rather than rejected, because a point
                 * dragged just past the end belongs at the end.
                 */
                const moved = Math.max(
                    0,
                    Math.min(1, value / 100)
                );

                points[index].t = moved;
            }

            /*
             * A point dragged onto its neighbour describes two
             * magnitudes at one location, which the profile
             * supports and the renderer draws. Nothing is merged
             * away here, because a magnitude the user can still
             * see listed must not vanish from the drawing.
             */
            enggLoadProfile.setProfilePoints(
                g,
                points
            );

            return true;
        }

        return false;
    }

    if (
        object.type === "varying-load"
    ) {
        if (
            key === 'direction'
        ) {
            if (fixed('direction')) return false;
            enggLoadProfile.setLoadDirection(g, value);
            return true;
        }

        if (key === 'interval') {
            if (fixed('interval')) return false;
            enggLoadProfile.setLoadInterval(g, value);
            return true;
        }

        if (key === 'startIntensity' || key === 'endIntensity') {
            if (fixed(key)) return false;
            g[key] = Math.max(0, value);
            return true;
        }
    }

    if (
        object.type === "support" ||
        object.type === "body" ||
        object.type === "particle" ||
        object.type === "moment" ||
        object.type === "couple" ||
        object.type === "load" ||
        object.type === "varying-load" ||
        object.type === "pin-support" ||
        object.type === "roller-support" ||
        object.type === "fixed-support" ||
        object.type === "smooth-support" ||
        object.type === "pin-connection" ||
        object.type === "fixed-connection" ||
        object.type === "slider-connection" ||
        object.type === "connection"
    ) {
        /*
         * Statics features edit through the same property
         * pipeline as geometry, so snapping, constraints
         * and undo all behave identically.
         */
        if (key.startsWith('position.')) {
            if (fixed('position')) return false;
            g.position[key.split('.')[1]] = value;
            return true;
        }

        if (
            key === 'start.x' || key === 'start.y' ||
            key === 'end.x' || key === 'end.y'
        ) {
            const [pointKey, axis] = key.split('.');

            if (fixed(pointKey)) return false;

            /*
             * ========================================================
             * A LOAD'S X IS A STATION, NOT A COORDINATE
             * ========================================================
             *
             * The panel shows a load's two stations as Start and End, and
             * the two are the same numbers as `start.x` and `end.x` - so
             * the key has to mean the same thing here as it does there.
             *
             * Writing the raw x would be right for a horizontal beam and
             * wrong for every other one: on a vertical member every station
             * reads as zero, so the field would look broken and the load
             * would move across the sheet rather than along the beam. The
             * value is therefore converted from a station into a world
             * point ON THE PARENT'S AXIS, which is where a station means
             * what it says.
             *
             * THE Y IS NOT WRITTEN AT ALL.
             *
             * It used to be writable, and it was the load's outline height
             * - stored independently of the body and of the direction.
             * That independence is what let a reversed load keep its
             * outline on the side it started: the arrows turned over and
             * the outline stayed, and no field anywhere recorded which side
             * the outline was meant to be on. Deriving the height from the
             * body and the direction removes the disagreement by removing
             * the second answer.
             */
            if (axis === "y" && isLoadGeometry(object)) {
                return false;
            }

            if (axis === "x") {
                const parent =
                    relativeParentOf(object);

                if (parent) {
                    const placed =
                        pointAtStation(
                            parent,
                            value
                        );

                    if (!placed) {
                        return false;
                    }

                    g[pointKey].x = placed.x;
                    g[pointKey].y = placed.y;

                    return true;
                }
            }

            g[pointKey][axis] = value;

            return true;
        }

        /*
         * ========================================================
         * A CHILD'S `relative.x` IS ITS STATION
         * ========================================================
         *
         * The panel shows a force, a moment or a support as a distance
         * along the body, and "Along Body" writes `relative.x`. It used to
         * write an OFFSET from the parent's start, in x and y, so the same
         * field meant two different things depending on which feature was
         * selected - which is not a property, it is a coincidence.
         *
         * A station is one number measured along the parent's own axis, and
         * it is the only figure a child of a body has. It is also what the
         * panel reads, so the round trip - shown, edited, redrawn - ends
         * where it started.
         *
         * A CHILD WITH NO PARENT KEEPS ITS ABSOLUTE POSITION.
         *
         * A force placed on empty canvas is a legitimate thing to draw, and
         * it has no axis to be measured along; refusing the edit would take
         * away a control the panel still shows.
         */
        if (
            key === "relative.x" ||
            key === "relative.y"
        ) {
            if (fixed("relative")) return false;

            if (key === "relative.y") {
                /*
                 * Never writable. The height of a child comes from the
                 * body's own normal and the force's direction; a field here
                 * would be a third answer to the same question.
                 */
                return false;
            }

            const parent =
                            relativeParentOf(object);

                        /*
                         * A STATION IS A LENGTH, SO IT IS WRITTEN IN MILLIMETRES.
                         *
                         * "Along Body" is printed through mmOf, like every other
                         * physical row on the panel, but pointAtStation projects onto
                         * the parent's axis in WORLD units. Passing millimetres
                         * straight in put the child at a distance the number never
                         * described, and the fault is invisible on an uncalibrated
                         * sheet - which is where a student meets it first.
                         *
                         * Converted here for the same reason as the relative-offset
                         * branch above: one conversion, so what the panel shows is
                         * what the panel accepts.
                         */
                        const station =
                            enggDimensions?.fromEngineering
                                ? enggDimensions.fromEngineering(
                                    drawingState,
                                    value,
                                    'mm'
                                )
                                : value;

                        const placed = parent
                            ? pointAtStation(parent, station)
                            : null;

            if (parent && !placed) {
                return false;
            }

            const target =
                g.position || g.start;

            if (!target) {
                return false;
            }

            if (parent) {
                target.x = placed.x;
                target.y = placed.y;
            } else {
                target.x = value;
            }

            /*
             * A FORCE CARRIES ITS TAIL AND ITS HEAD, and moving the tail
             * must move the head with it at the same length and direction.
             * Writing the tail alone would stretch the arrow as though the
             * magnitude had changed, which is a different edit entirely.
             */
            if (
                object.type === "force" &&
                g.end &&
                Number.isFinite(g.end.x) &&
                g.start
            ) {
                const dx = g.end.x - g.start.x;
                const dy = g.end.y - g.start.y;

                g.end.x = target.x + dx;
                g.end.y = target.y + dy;
            }

            if (g.position && g.start) {
                g.position.x = target.x;
                g.position.y = target.y;
            }

            return true;
        }

        if (
            key === 'magnitude' ||
            key === 'angle' ||
            key === 'separation' ||
            key === 'intensity' ||
            key === 'orientation' ||
            key === 'reaction'
        ) {
            if (fixed(key)) return false;
            if (!Number.isFinite(value)) return false;
            g[key] = value;
            return true;
        }

        return false;
    }

    if (object.type === 'rigid-body') {
        /*
         * A rigid body is one body whose outline can change, so
         * its properties are written through the shape-aware
         * keys the panel shows. Writing a centre moves the body
         * whole, and writing a size changes the current shape
         * rather than replacing the body.
         */
        if (key.startsWith('rigidCentre.')) {
            if (fixed('rigidCentre')) return false;
            moveRigidBodyTo(object, key.split('.')[1], value);
            return true;
        }

        if (key === 'rigidWidth' || key === 'rigidHeight') {
            if (fixed(key) || !positive) return false;

            /*
             * MILLIMETRES IN, WORLD UNITS STORED - the same contract
             * every other length in the panel works to, so a body
             * sized in the creation popup and one sized in its own
             * properties come out the same size.
             */
            const millimetres = enggDimensions?.fromEngineering
                ? enggDimensions.fromEngineering(drawingState, value, 'mm')
                : value;

            resizeRigidBody(object, key === 'rigidWidth' ? 'width' : 'height', millimetres);
            return true;
        }

        if (key === 'rigidRadius') {
            if (fixed(key) || !positive) return false;

            /*
             * MILLIMETRES IN, WORLD UNITS STORED - as for every other
             * length the panel edits.
             */
            const millimetres = enggDimensions?.fromEngineering
                ? enggDimensions.fromEngineering(drawingState, value, 'mm')
                : value;

            setRigidBodyRadius(object, millimetres);
            return true;
        }

        if (key === 'rigidSides') {
            if (fixed(key)) return false;
            const sides = Math.round(value);
            if (!Number.isFinite(sides) || sides < 3) return false;
            g.sides = sides;
            return true;
        }

        if (key === 'rigidRotation') {
            if (fixed(key)) return false;
            if (!Number.isFinite(value)) return false;
            g.rotation = value;
            return true;
        }

        if (key.startsWith('points.')) {
            const [, index, axis] = key.split('.');
            if (fixed(`points.${index}`) || !g.points?.[index]) return false;
            g.points[index][axis] = value;
            return true;
        }

        return false;
    }

    if (
        object.type === 'beam' ||
        object.type === 'truss' ||
        object.type === 'cable' ||
        object.type === 'shaft'
    ) {
        /*
         * Slender members edit through their endpoints, plus
         * whichever property belongs to their own role.
         */
        if (
            key === 'start.x' || key === 'start.y' ||
            key === 'end.x' || key === 'end.y'
        ) {
            const [pointKey, axis] = key.split('.');
            if (fixed(pointKey)) return false;
            g[pointKey][axis] = value;
            return true;
        }

        if (
            key === 'depth' ||
            key === 'panels' ||
            key === 'tension' ||
            key === 'diameter' ||
            key === 'torque' ||
            key === 'startIntensity' ||
            key === 'endIntensity'
        ) {
            if (fixed(key)) return false;
            if (!Number.isFinite(value)) return false;
            g[key] = value;
            return true;
        }

        return false;
    }

    if (object.type === 'point') {
        if (fixed('position')) return false;
        const target = g.position || g.point || g;
        const [part, axis] = key.split('.');
        if (part !== 'position') return false;
        target[axis] = value;
        return true;
    }

    if (object.type === 'circle' || object.type === 'arc') {
        if (key.startsWith('center.')) {
            if (fixed('center')) return false;
            g.center[key.split('.')[1]] = value;
            return true;
        }
        if ((key === 'radius' || key === 'diameter') && positive && !fixed(key) && !fixed(key === 'radius' ? 'diameter' : 'radius')) {
            /*
             * MILLIMETRES IN, WORLD UNITS STORED - the same contract
             * the span and rectangle setters use, and the same
             * conversion the creation popup applies. A Diameter is
             * halved on the way in, after the conversion, so "50 mm"
             * becomes a radius of 25 mm whether it was typed in the
             * panel or in the creation popup.
             */
            const millimetres = enggDimensions?.fromEngineering
                ? enggDimensions.fromEngineering(drawingState, value, 'mm')
                : value;

            g.radius =
                key === 'radius'
                    ? millimetres
                    : millimetres / 2;

            return true;
        }
        if (object.type === 'arc') {
            if (fixed(key)) return false;
            if (key === 'startAngle' || key === 'endAngle') {
                if (fixed('includedAngle')) return false;
                g[key] = value * Math.PI / 180;
                g.sweep = g.endAngle - g.startAngle;
                return true;
            }
            if (key === 'includedAngle') {
                if (fixed('endAngle')) return false;
                g.sweep = value * Math.PI / 180;
                g.endAngle = g.startAngle + g.sweep;
                return true;
            }
        }
        return false;
    }

    if (object.type === 'rectangle') {
        if (key.startsWith('centre.')) {
            if (fixed('centre')) return false;
            const axis = key.split('.')[1];
            g.position[axis] = axis === 'x' ? value - g.width / 2 : value + g.height / 2;
            return true;
        }
        if ((key === 'width' || key === 'height') && positive && !fixed(key)) {
            /*
             * The panel shows these as MILLIMETRES and the geometry
             * stores WORLD UNITS, so the value crosses the document
             * scale on the way in. This is the same conversion the
             * creation popup applies, which is what makes a Width
             * typed at creation and a Width typed in the panel produce
             * the same rectangle.
             */
            g[key] = enggDimensions?.fromEngineering
                ? enggDimensions.fromEngineering(
                    drawingState,
                    value,
                    'mm'
                )
                : value;
            return true;
        }
        if (key === 'rotation' && !fixed(key)) {
            g.rotation = value;
            return true;
        }
        return false;
    }

    if (object.type === 'polygon') {
        /*
         * Every edit writes to the polygon's defining
         * parameters. The vertices are derived from
         * these, so there is no second copy to keep in
         * sync.
         */
        if (key.startsWith('center.')) {
            if (fixed('center')) return false;
            g.center[key.split('.')[1]] = value;
            return true;
        }
        if (key === 'sides') {
            if (fixed('sides')) return false;
            const sides = Math.round(value);
            if (!Number.isFinite(sides) || sides < 3) return false;
            g.sides = sides;
            return true;
        }
        if (key === 'radius') {
            if (fixed('radius') || !positive) return false;

            /*
             * MILLIMETRES IN, WORLD UNITS STORED - as for every other
             * length in the panel.
             */
            g.radius = enggDimensions?.fromEngineering
                ? enggDimensions.fromEngineering(drawingState, value, 'mm')
                : value;

            return true;
        }
        if (key === 'rotation') {
            if (fixed('rotation')) return false;
            g.rotation = value * Math.PI / 180;
            return true;
        }
        return false;
    }

    if (
        object.type ===
            "reference-axis-x-positive" ||
        object.type ===
            "reference-axis-x-negative" ||
        object.type ===
            "reference-axis-y-positive" ||
        object.type ===
            "reference-axis-y-negative"
    ) {
        /*
         * Each axis edits only its own geometry, so a
         * change to one never moves the other three.
         */
        if (key.startsWith('origin.')) {
            if (fixed('origin')) return false;
            g.origin[key.split('.')[1]] = value;
            return true;
        }
        if (key === 'axisLength') {
            if (fixed('axisLength') || !positive) return false;

            /*
             * MILLIMETRES IN, WORLD UNITS STORED.
             *
             * The panel captions this field with a unit and enters
             * millimetres, and the geometry is in world units - so
             * writing `value` straight through stores a number that
             * means nothing, and an axis typed as 100 mm becomes 100
             * world units long instead of the length the student asked
             * for.
             *
             * This is the SAME conversion every other length setter
             * and the creation popup use. A length that is correct
             * through one route and wrong through another is worse
             * than one that is consistently wrong, because there is
             * then no single place to look for the mistake.
             */
            g.axisLength = enggDimensions?.fromEngineering
                ? enggDimensions.fromEngineering(drawingState, value, 'mm')
                : value;

            return true;
        }
        return false;
    }

    if (object.type === COORDINATE_SYSTEM_TYPE) {
        /*
         * One feature, four independent extensions.
         * Writing one length never touches the others.
         */
        if (key.startsWith('origin.')) {
            if (fixed('origin')) return false;
            g.origin[key.split('.')[1]] = value;
            return true;
        }

        if (
            [
                'xPositiveLength',
                'xNegativeLength',
                'yPositiveLength',
                'yNegativeLength',
                'xAxisLength',
                'yAxisLength',
                'axisLength'
            ].includes(key)
        ) {
            if (fixed(key) || !positive) return false;

            /*
             * MILLIMETRES IN, WORLD UNITS STORED - as for every other
             * length the panel edits, and for the same reason: a raw
             * write would make a 50 mm axis 50 world units long.
             */
            g[key] = enggDimensions?.fromEngineering
                ? enggDimensions.fromEngineering(drawingState, value, 'mm')
                : value;

            return true;
        }
    }
    return false;
}
