/*
 * The continuous distributed load, and the shared definition
 * of a force vector.
 *
 * A Distributed Load is ONE feature. What the student places
 * while drawing it are a small number of magnitude-defining
 * points; the row of arrows is the renderer sampling the
 * continuous profile between them. That is why the profile
 * lives here rather than in the renderer: the Features panel,
 * the handles, the fit bounds and the drawing all read the
 * same numbers, so editing a magnitude in the panel moves
 * the arrows instead of rebuilding the feature.
 *
 * A Point Force is the same idea at a single point, so its
 * magnitude/direction <-> component conversions live here too
 * and there is exactly one set of vector rules in the
 * application.
 */
(function (root) {
    "use strict";

    /*
     * A load is stored with a direction as a unit vector in
     * degrees plus its own profile points. A load created
     * before that (or by a file written by an older build) has
     * only start/end/intensity, so those are read as a
     * degenerate profile with a downward direction and are
     * migrated by the caller's first write.
     */
    const DEFAULT_LOAD_DIRECTION = -90;

    const MIN_LOAD_INTERVAL = 0.5;
    const MAX_LOAD_INTERVAL = 500;
    const DEFAULT_LOAD_INTERVAL = 20;
    const MAX_LOAD_ARROWS = 200;

    function finite(value, fallback = 0) {
        const number = Number(value);

        return Number.isFinite(number) ? number : fallback;
    }

    function clampInterval(value) {
        const number = Number(value);

        if (!Number.isFinite(number)) {
            return DEFAULT_LOAD_INTERVAL;
        }

        return Math.min(
            MAX_LOAD_INTERVAL,
            Math.max(MIN_LOAD_INTERVAL, Math.abs(number))
        );
    }

    /*
     * The defining points of a load, as a plain list of
     * { t, magnitude } sorted along the body.
     *
     * The student's points are stored on the body rather than
     * as absolute world positions, so moving or resizing the
     * body carries the profile with it instead of detaching
     * it.
     */
    function profilePoints(geometry) {
        if (!geometry) {
            return [];
        }

        const stored = Array.isArray(geometry.points)
            ? geometry.points
            : [];

        if (stored.length) {
            return stored
                .filter(point => point && Number.isFinite(point.t))
                .map(point => ({
                    t: finite(point.t),
                    magnitude: Math.max(0, finite(point.magnitude))
                }))
                .sort((a, b) => a.t - b.t);
        }

        /*
         * A load with no profile of its own is the original
         * uniform one: the same intensity everywhere along
         * the body. Reading it this way means an old file
         * still draws and still fits without a migration step.
         */
        return [
            { t: 0, magnitude: Math.max(0, finite(geometry.intensity)) },
            { t: 1, magnitude: Math.max(0, finite(geometry.intensity)) }
        ];
    }

    /*
     * Write a profile back onto the geometry, keeping the
     * derived uniform intensity in step so anything that
     * still reads `intensity` sees the mean of the profile.
     */
    function setProfilePoints(geometry, points) {
        const ordered = (points || [])
            .filter(point => point && Number.isFinite(point.t))
            .map(point => ({
                t: finite(point.t),
                magnitude: Math.max(0, finite(point.magnitude))
            }))
            .sort((a, b) => a.t - b.t);

        geometry.points = ordered;

        const mean =
            ordered.length
                ? ordered.reduce(
                    (sum, point) => sum + point.magnitude,
                    0
                ) / ordered.length
                : 0;

        geometry.intensity = mean;

        return ordered;
    }

    /*
     * The direction of a load, in degrees, measured the same
     * way the rest of the drawing measures: counterclockwise
     * from +X in world coordinates, which is what atan2
     * already returns.
     *
     * The default is straight down, which is how a load that
     * carries no explicit direction has always been drawn.
     */
    function loadDirection(geometry) {
        if (
            geometry &&
            Number.isFinite(Number(geometry.direction)) &&
            geometry.direction !== null &&
            geometry.direction !== ""
        ) {
            return finite(geometry.direction, DEFAULT_LOAD_DIRECTION);
        }

        return DEFAULT_LOAD_DIRECTION;
    }

    /*
     * THE SIDE A LOAD IS DRAWN ON, PINNED THE FIRST TIME IT IS KNOWN.
     *
     * Typing a direction is not a reversal - it is the student saying which
     * way the load acts from the outset - so the side is settled the first
     * time it can be, and never revisited. After that the field is read
     * back and ignored, because by then the load exists and its side is
     * part of it.
     *
     * WITHOUT THIS, TYPING A DIRECTION MOVED THE LOAD TO THE OTHER SIDE.
     * The drawn force lines are placed along the span's outward normal, and
     * the sense of that normal was being taken from the direction itself.
     * So setting a direction to the opposite sign moved the outline as
     * well as the arrows - which is a different load, not the same load
     * pointing the other way.
     *
     * A load that has been reversed by the Reverse control keeps the side
     * it was made with, because a reversal explicitly does not move it:
     * `reverseLoadDirection` touches one boolean and nothing here.
     */
    function setLoadDirection(geometry, degrees) {
      geometry.direction = finite(degrees, DEFAULT_LOAD_DIRECTION);

      const side = Number(geometry?.normalSide);

      if (side !== 1 && side !== -1) {
        geometry.normalSide =
          loadNormalSide(geometry);
      }

      return geometry.direction;
    }

    /*
     * Turn a load's force vectors around, by exactly 180 degrees.
     *
     * This is deliberately the smallest possible statement about a
     * reversal: the DIRECTION is negated and nothing else is
     * touched. It is the whole reason the reversal is a function on
     * the model rather than something a caller assembles.
     *
     * What must NOT change, and what would change if a reversal were
     * expressed as a change of span or of end order:
     *
     *   - the loaded span. The span still runs A to B, and the
     *     region the load acts on is the same region.
     *   - the start and end points themselves. A load that
     *     reversed its span would move every force to the other
     *     side of the body, which is a different load.
     *   - every profile point's position and magnitude. The
     *     magnitude profile is the SHAPE of the load; reversing
     *     the direction does not reshape it, so a triangular
     *     profile stays triangular with its peak where it was.
     *   - the object itself. The load is not rebuilt, so its id,
     *     its name, its parent, its style and its place in the
     *     undo history all survive, and copy/paste, mirroring and
     *     saving carry the reversal with the feature.
     *
     * Only the arrowheads move to the far end of each force vector.
     * Applying it twice is therefore a no-op rather than a
     * quarter turn, which is what a user pressing the control
     * twice expects.
     */
    function reverseLoadDirection(geometry) {
      if (!geometry) {
        return DEFAULT_LOAD_DIRECTION;
      }

      /*
       * Reversal is recorded as its OWN flag, not by negating the
       * direction angle.
       *
       * The direction is the LINE OF ACTION - which way the force
       * acts through the body - and it is a real engineering quantity
       * that the Features panel shows and the user types. The flag is
       * a purely visual fact: which end of the drawn line carries the
       * arrowhead. Keeping them apart is what guarantees the two
       * cannot be confused, because nothing in the reversal can reach
       * the geometry: it touches one boolean.
       *
       * Deriving the head from the angle instead would mean the drawn
       * line was `application + direction x length`, so flipping the
       * angle swings the far endpoint to the other side of the body.
       * The line would then genuinely move, which is exactly the
       * transformation a reversal must never perform.
       *
       * IT TOUCHES NOTHING ELSE. `normalSide` in particular: the side the
       * force lines are drawn on is pinned when the load's direction is
       * first set, and a reversal is not that. Reading the side back from
       * the direction here is what made the force lines jump to the other
       * side of the member while the span stayed put - the outline
       * appearing to swap ends with the arrows.
       */
      geometry.reversed = !geometry.reversed;

      return geometry.reversed;
    }

    /*
     * Whether a load is currently drawn with its arrowheads reversed.
     */
    function isLoadReversed(geometry) {
      return Boolean(geometry?.reversed);
    }

    function loadInterval(geometry) {
        return clampInterval(geometry?.interval);
    }

    function setLoadInterval(geometry, value) {
        geometry.interval = clampInterval(value);
        return geometry.interval;
    }

    /*
 * ZERO A COMPONENT THAT IS ONLY ARITHMETICALLY NON-ZERO.
 *
 * `Math.sin(180 * PI / 180)` is 1.2e-14, not 0, and a force pointing exactly
 * west is therefore stored with a sliver of north in it. The sliver is far
 * too small to see, but it is not zero, and anything that asks which WAY a
 * vector points - a screen direction's sign, a component written as "0 N" -
 * answers "up and to the left" for a force that is straight left.
 *
 * A value within a thousandth of zero IS the axis, for the drawing's
 * purposes: a force that is a thousandth of a degree off horizontal is
 * horizontal as far as a reader is concerned, and rounding it away costs
 * nothing. Rounding EVERY component to a fixed number of places, which is the
 * obvious alternative, does cost: a force at 37 degrees is stored accurately
 * and drawn accurately, and rounding its direction cost four digits - enough
 * that a student grabbing the head and letting go found the angle had
 * drifted.
 */
function zeroIfAxis(value) {
    return Math.abs(value) < 1e-3 ? 0 : value;
}

function unitVector(degrees) {
        const radians = finite(degrees) * Math.PI / 180;

        /*
         * THE COMPONENTS ARE CLEANED; THE ANGLE IS RETURNED AS GIVEN.
         *
         * The components are what a direction is read from - a screen
         * direction's sign, a "Fx = 0 N" label - so they go through
         * `zeroIfAxis`. The angle is what the panel shows and what a drag
         * writes back, so it is returned exactly as it came in: rounding it
         * cost four digits on a 37-degree force and bought nothing, since the
         * direction no longer comes from it.
         *
         * It is carried alongside rather than recomputed, because
         * `atan2` of the cleaned components would answer 0 for a force at 270
         * degrees - correct for the drawing, and wrong for the number the
         * student typed.
         */
        return {
            x: zeroIfAxis(Math.cos(radians)),
            y: zeroIfAxis(Math.sin(radians)),
            angle: finite(degrees),
        };
    }

    /*
     * The magnitude of the profile at a fraction t along the
     * body.
     *
     * The profile is piecewise linear between the points the
     * student placed, and held flat outside them, so the shape
     * the student described is the shape that is drawn. A load
     * with a single defining point is uniform at that value.
     */
    function magnitudeAt(geometry, t) {
        const points = profilePoints(geometry);

        if (!points.length) {
            return 0;
        }

        const ratio = Math.max(0, Math.min(1, finite(t)));

        if (points.length === 1) {
            return points[0].magnitude;
        }

        if (ratio <= points[0].t) {
            return points[0].magnitude;
        }

        const last = points[points.length - 1];

        if (ratio >= last.t) {
            return last.magnitude;
        }

        for (let index = 1; index < points.length; index += 1) {
            const previous = points[index - 1];
            const next = points[index];

            if (ratio > next.t) {
                continue;
            }

            const span = next.t - previous.t;

            if (Math.abs(span) < 1e-9) {
                return next.magnitude;
            }

            const mix = (ratio - previous.t) / span;

            return (
                previous.magnitude +
                (next.magnitude - previous.magnitude) * mix
            );
        }

        return last.magnitude;
    }

    /*
     * The peak magnitude of a profile, used to scale arrow
     * length so the shape reads clearly at any overall size.
     */
    function peakMagnitude(geometry) {
        return profilePoints(geometry).reduce(
            (peak, point) => Math.max(peak, point.magnitude),
            0
        );
    }

    /*
     * The world position of a fraction t along the loaded
     * span.
     */
      /*
       * The body's OUTWARD normal, in world units.
       *
       * A distributed load is applied across a span, and the span's own
       * outward normal is what tells the renderer which side of the body
       * the force lines are drawn on. It is derived from the SPAN and
       * never from the force direction, which is what allows the force
       * direction to change without the drawn line moving.
       *
       * The sense is chosen ONCE, from the direction the load was BUILT
       * with, and then fixed. A downward load draws its lines below the
       * body, and reversing that load keeps them below the body, because
       * "below" is a property of the drawing and "down" is a property of
       * the force. They are separate questions and are answered
       * separately.
       *
       * ========================================================
       * WHY THE SENSE IS TAKEN FROM THE DIRECTION IT WAS BUILT
       * WITH, AND NOT THE CURRENT ONE
       * ========================================================
       *
       * This used to orient the normal against `loadDirection(geometry)`
       * - the CURRENT direction. That is the same function the reverse
       * control writes, so reversing a load re-derived this normal against
       * the reversed direction, flipped it, and moved the whole field of
       * force lines to the other side of the member.
       *
       * The comment above claimed the opposite: that "a reversal changes
       * only the arrowhead and so leaves this agreement - and therefore the
       * drawn line - alone". It did not leave it alone. `reversed` is a
       * flag, not a rotation of the stored angle, so the two disagreeed
       * and the comment described the intended behaviour while the code did
       * the opposite.
       *
       * WHICH SENSE A LOAD IS DRAWN ON IS A FACT ABOUT THE REGION, not a
       * consequence of which way it currently pushes. The region is where
       * the load acts; reversing the force does not move the region. So the
       * side is recorded when the load is created - as the sign of the
       * normal along the span, which is one bit - and read back unchanged
       * afterwards.
       *
       * A file saved before this field existed has no side recorded, so the
       * current direction is the best available answer: it produces the
       * drawing that file was making, rather than an arbitrary choice of
       * side. That is a fallback for reading old drawings, not the rule.
       */
    function loadBodyNormal(geometry) {
      const start = geometry?.start;
      const end = geometry?.end;

      if (!start || !end) {
        return null;
      }

      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.hypot(dx, dy);

      if (length < 1e-9) {
        return null;
      }

      // A normal to the span, one of the two handednesses.
      const normal = { x: -dy / length, y: dx / length };

      /*
       * The side the load is drawn on, recorded once at creation. ±1 is the
       * sign to flip the computed normal by; anything else is not a side.
       */
      const side = Number(geometry?.normalSide);

      if (side === 1 || side === -1) {
        return side === 1
          ? normal
          : { x: -normal.x, y: -normal.y };
      }

      // An older drawing: fall back to the direction it was last using.
      const direction = unitVector(loadDirection(geometry));

      const agrees =
        normal.x * direction.x + normal.y * direction.y >= 0;

      return agrees
        ? normal
        : { x: -normal.x, y: -normal.y };
    }

    /*
     * THE SIDE A LOAD IS DRAWN ON.
     *
     * The sign that takes the span's own normal to the side the load acts
     * from. It is recorded once, when the load is created, and read back
     * unchanged for the rest of the load's life - so reversing a load
     * reverses its arrows and nothing else.
     *
     * IT IS COMPUTED FROM THE DIRECTION, NEVER ASKED FOR. There is no field
     * on a load saying which side it is on, because a side the student can
     * set is a side the student can set to the wrong value; and it is
     * derived rather than stored as an offset, because the height of a load
     * is a consequence of where it acts, not a free choice.
     *
     * Returns 1 when the span's normal already agrees with the load's
     * direction and -1 when it has to be flipped.
     */
    function loadNormalSide(geometry) {
      const side = Number(geometry?.normalSide);

      if (side === 1 || side === -1) {
        return side;
      }

      const start = geometry?.start;
      const end = geometry?.end;

      if (!start || !end) {
        return 1;
      }

      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.hypot(dx, dy);

      if (length < 1e-9) {
        return 1;
      }

      const normal = { x: -dy / length, y: dx / length };
      const direction = unitVector(loadDirection(geometry));

      return (
        normal.x * direction.x + normal.y * direction.y >= 0
      )
        ? 1
        : -1;
    }

  function pointAlong(geometry, t) {
        const start = geometry?.start;
        const end = geometry?.end;

        if (!start || !end) {
            return null;
        }

        const ratio = Math.max(0, Math.min(1, finite(t)));

        return {
            x: start.x + (end.x - start.x) * ratio,
            y: start.y + (end.y - start.y) * ratio
        };
    }

    /*
     * The world point that corresponds to a point the student
     * clicked, expressed as a fraction along the body.
     *
     * Positions are projected onto the span rather than
     * read from x alone, so the same projection works for a
     * body at any angle. It is the reason a load on an
     * angled member still follows that member.
     */
    function fractionAlong(geometry, point) {
        const start = geometry?.start;
        const end = geometry?.end;

        if (!start || !end || !point) {
            return 0;
        }

        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const lengthSquared = dx * dx + dy * dy;

        if (lengthSquared < 1e-12) {
            return 0;
        }

        return Math.max(
            0,
            Math.min(
                1,
                ((point.x - start.x) * dx +
                    (point.y - start.y) * dy) /
                    lengthSquared
            )
        );
    }

    /*
     * Every arrow the renderer will draw, as
     * { t, magnitude, base, defined }.
     *
     * A defined point is AUTHORITATIVE and always gets its own
     * arrow. The interval only ever fills in BETWEEN defined
     * points.
     *
     * This ordering is the whole point of the function, and it is
     * the reverse of the obvious implementation. Sampling the span
     * at equal intervals and then reading the profile at each
     * sample is simpler to write, and it is wrong: a user who
     * places a point at 37% of the span has said something
     * specific about the load at 37%, and a sample grid of
     * 0, 0.2, 0.4... simply has no arrow there. The drawn profile
     * then smooths across the gap and the user's point becomes an
     * invisible guess about a magnitude that is not drawn
     * anywhere.
     *
     * So the defined points are laid down first, and the interval
     * subdivides the gaps between them. A defined point never
     * moves to suit the interval: it is where the user put it, and
     * the arrows either side of it are the ones that give way.
     */
    function arrowSamples(geometry) {
        const start = geometry?.start;
        const end = geometry?.end;

        if (!start || !end) {
            return [];
        }

        const span =
            Math.hypot(end.x - start.x, end.y - start.y);

        if (span < 1e-9) {
            return [];
        }

        const interval = loadInterval(geometry);

        const defined = profilePoints(geometry);

        /*
         * A load with no profile of its own is uniform, and
         * profilePoints already reports that as defined points at
         * the two ends, so the subdivisions below fill the whole
         * span at the interval. The plain Distributed Load
         * therefore renders exactly as it always did.
         */
        if (!defined.length) {
            return [];
        }

        const sample = t => ({
            t: Math.max(0, Math.min(1, t)),
            magnitude: magnitudeAt(geometry, t),
            base: pointAlong(geometry, t),
            defined: false
        });

        const definedSample = point => ({
            t: point.t,
            magnitude: point.magnitude,
            base: pointAlong(geometry, point.t),
            defined: true
        });

        /*
         * Where a defined point sits, rounded. Two positions that
         * agree to this many places are the same place on the
         * body, and an automatic arrow must not be drawn on top
         * of a user's own.
         */
        const key = t => Math.round(t * 1e6) / 1e6;

        /*
         * Defined points are kept as they are, duplicates and
         * all, because each one is a magnitude the user asked for
         * and therefore owes them an arrow. Two points moved onto
         * the same place describe two magnitudes at one location,
         * which is a real (if unusual) state; drawing both is
         * faithful to it, whereas folding them into one would
         * silently drop a magnitude the user can still see listed
         * in the Features panel.
         */
        const samples = defined.map(definedSample);

        /*
         * Only the automatic arrows are de-duplicated, and only
         * against the defined points. This is the set of places
         * already occupied, so a subdivision landing on one of
         * them yields to the user's arrow instead of replacing it.
         */
        const occupied = new Set(defined.map(point => key(point.t)));

        const place = t => {
            const id = key(t);

            if (occupied.has(id)) {
                return;
            }

            occupied.add(id);

            samples.push(sample(t));
        };

        /*
         * Subdivide each gap between adjacent defined points.
         *
         * Each gap is divided on its own rather than as part of one
         * grid across the whole span, which is what lets the arrows
         * either side of an off-grid defined point be spaced for
         * that gap instead of being pulled onto a global grid that
         * does not include the point.
         */
        for (let index = 1; index < defined.length; index += 1) {
            const from = defined[index - 1].t;
            const to = defined[index].t;

            const gap = to - from;

            if (gap <= 1e-9) {
                continue;
            }

            const gapLength = gap * span;

            const steps = Math.max(
                1,
                Math.min(
                    MAX_LOAD_ARROWS,
                    Math.round(gapLength / interval)
                )
            );

            for (let step = 1; step < steps; step += 1) {
                place(from + (gap * step) / steps);
            }
        }

        /*
         * Ordered along the body, so the renderer draws them in
         * the direction of the load and the profile outline is
         * built from a monotonic list.
         *
         * A stable sort is used so that defined points sharing a
         * position keep their order, which leaves the sequence
         * deterministic rather than dependent on the engine.
         */
        return samples.sort(
            (first, second) => first.t - second.t
        );
    }

    /*
     * The point on the body a defining point belongs at.
     * Editing a point's position writes its world position
     * back and re-derives the fraction, so dragging a point
     * and typing its position do the same thing.
     */
    function profilePointPositions(geometry) {
        return profilePoints(geometry).map(point => ({
            ...point,
            position: pointAlong(geometry, point.t)
        }));
    }

    /*
     * Recompute the body from a moved point and the direction.
     *
     * Both representations of a force describe the same
     * vector, so writing one has to write the other. This is
     * the single place that does it, which is why the panel
     * and a drag can never leave the two disagreeing.
     */
    function setForceVector(geometry, magnitude, directionDegrees) {
        const magnitudeValue = Math.max(0, finite(magnitude));
        const direction = finite(directionDegrees);
        const vector = unitVector(direction);

        const start = geometry.start ||
            geometry.position || { x: 0, y: 0 };

        geometry.start = {
            x: finite(start.x),
            y: finite(start.y)
        };

        geometry.position = {
            x: geometry.start.x,
            y: geometry.start.y
        };

        geometry.magnitude = magnitudeValue;
        geometry.angle = direction;

        geometry.end = {
            x: geometry.start.x + vector.x * magnitudeValue,
            y: geometry.start.y + vector.y * magnitudeValue
        };

        /*
         * THE COMPONENTS ARE REWRITTEN TOO, OR THEY BECOME A SECOND TRUTH.
         *
         * A force may be described either as a magnitude and an angle or as
         * its X and Y components, and `forceVector` gives the COMPONENTS the
         * precedence - deliberately, because a student who has just typed Fx
         * and Fy means those whatever the angle field still says.
         *
         * That precedence is what made a reversal come out wrong. This
         * function rewrote `angle` and `end` and left `forceX`/`forceY`
         * pointing the old way, so the object was left holding two
         * contradictory descriptions of one force: the angle said the
         * opposite of the components, and which one a reader believed
         * decided whether the arrow appeared to turn around at all.
         *
         * Pressing "reverse direction" on a force whose components had ever
         * been typed therefore flipped the geometry and not the force - the
         * arrow head moved to the other end of an unchanged vector, which is
         * exactly the "it flips how it is drawn" report.
         *
         * So every representation is written from the one vector here, which
         * is the whole reason this function exists. A component edit goes
         * through `setForceVector` too (see the Features panel), so the two
         * views stay interchangeable in both directions.
         */
        geometry.forceX = vector.x * magnitudeValue;
        geometry.forceY = vector.y * magnitudeValue;

        return geometry;
    }

    /*
     * The same force as components.
     *
     * Fx and Fy are the world projections, and they are what
     * the drawing already stores as the two points of the
     * arrow, so no third representation is invented.
     */
    function forceVector(geometry) {
        const start =
            geometry?.start ||
            geometry?.position ||
            { x: 0, y: 0 };

        /*
         * The stored tip when there is one, and otherwise the vector
         * rebuilt from the stored magnitude AND angle.
         *
         * The angle used to be ignored here, so a force with no stored
         * tip was read as pointing along +x whatever its angle said. The
         * two representations therefore disagreed: a force carrying
         * `angle: 90` reported a direction of 0.
         *
         * Both are written together by setForceVector, so this only
         * arises on hand-authored or older geometry - but it matters
         * because reverseForceDirection reads the direction through this
         * function. A force with no tip would have been turned through a
         * half turn from the wrong starting angle.
         */
        const magnitude = finite(geometry?.magnitude);

        const vector =
            unitVector(finite(geometry?.angle));

        /*
         * THE DIRECTION IS THE STORED ANGLE, NOT THE SPAN.
         *
         * The SPAN - `start` to `end` - is where the force is DRAWN. The direction is
         * which way it PUSHES. They are separate questions, and they have to be read
         * separately: reversing a force turns the second without moving the first, so
         * a force between x=100 and x=150 pushes left rather than right.
         *
         * Deriving the direction from the span - as this did - made the two the same
         * fact, and then a reversal could only move the drawing to express itself,
         * which is how pressing "reverse direction" threw the arrow across to the
         * other side of the application point.
         *
         * The magnitude is still read from the span, because that is the length the
         * arrow is drawn at, and the drawn length is what a student sees and grabs.
         * It is not the magnitude: a force drawn at the shared display scale is a
         * different length from the force it describes.
         */
        const fx = vector.x * magnitude;
        const fy = vector.y * magnitude;

        return {
            x: finite(start.x),
            y: finite(start.y),
            fx,
            fy,
            magnitude,
            angle: finite(geometry?.angle)
        };
        }

    /*
     * The same force, pointing the other way.
     *
     * This is what turns a push into a pull. The arrow stops pointing
     * away from where the force acts and points towards it instead, and
     * the two are the same load read the other way round.
     *
     * THE APPLICATION POINT DOES NOT MOVE. It is where the force acts,
     * and that is the one thing a change of sense must not touch: a
     * force reversed in place is the same force acting at the same
     * place, only drawn the other way round. Sliding the application
     * point would make it a different load at a different location
     * rather than the same load seen from the other side.
     *
     * The vector is therefore mirrored through the application point,
     * which puts the tip at the same distance on the opposite side.
     * Nothing is re-drawn elsewhere, no length is changed, and the
     * segment is simply read in the opposite direction.
     *
     * THE MAGNITUDE is carried through unchanged and stays positive. It
     * is a physical magnitude, not a signed quantity - the sense of the
     * force lives in the direction, which is why this is a rotation by
     * 180 degrees rather than a negation.
     *
     * Written through setForceVector so the application point, the
     * stored magnitude, the stored angle and the drawn tip are all
     * rewritten together by the one function that already owns that
     * relationship, and no field can be left disagreeing with another.
     */
    function reverseForceDirection(geometry) {
        if (!geometry) {
            return geometry;
        }

        const vector = forceVector(geometry);

        /*
         * THE SPAN STAYS AND THE SENSE OF IT CHANGES.
         *
         * The application point and the tip are where the student put them
         * and they are not the thing being reversed. Rotating the stored angle
         * AND rewriting `end` from it - which this did, because it called
         * `setForceVector` - moved the tip across the application point to
         * the opposite side: a force drawn between x=100 and x=150 became one
         * drawn between x=50 and x=100. The same length, and a different
         * piece of the drawing.
         *
         * The length was even right, which is why it was hard to see. What
         * moved was WHERE the arrow lay, and for a force attached to a member
         * that is the whole difference between pressing on the beam from
         * outside and pressing on the empty space beside it.
         *
         * A Distributed Load already works this way - reversing it keeps the
         * span and moves only the arrowheads - and the two tools should not
         * disagree about what reversing means.
         *
         * So the ENGINEERING VECTOR is reversed and the stored span is left
         * exactly where it was. The renderer draws the arrow along the span in
         * the direction the vector now points, which is the only part that
         * needs to know which way the force acts.
         *
         * THE MAGNITUDE is carried through unchanged and stays positive. It
         * is a physical magnitude, not a signed quantity - the sense of the
         * force lives in the direction, which is why this is a rotation by
         * 180 degrees rather than a negation.
         */
        const radians = ((vector.angle + 180) * Math.PI) / 180;

        geometry.angle = vector.angle + 180;
        geometry.forceX = Math.cos(radians) * vector.magnitude;
        geometry.forceY = Math.sin(radians) * vector.magnitude;

        /*
         * `position` MIRRORS `start` and is read by some of the panel and by
         * the components' origin, so it follows the same value. Neither is
         * moved - only brought back into step with the point it mirrors.
         */
        if (geometry.start) {
            geometry.position = {
                x: geometry.start.x,
                y: geometry.start.y
            };
        }

        return geometry;
    }

    /*
     * THE VECTOR SCALE.
     *
     * One shared, presentational multiplier for every Statics arrow. It
     * decides how BIG the arrows are drawn and nothing else.
     *
     * The offered values are DECADES, not fractions. An engineering arrow
     * has to survive forces that differ by orders of magnitude - a 5 N
     * reaction beside a 50 kN load - and a scale that only ever doubled
     * could not put both of them on one readable sheet. Halving is not
     * much use for that either, so the steps are powers of ten in each
     * direction, with 1 as the middle: the true length, and the value
     * every sheet starts at, so opening an older document changes
     * nothing about how it looks.
     *
     * They are listed in INCREASING ORDER.
     *
     * They used to be listed shrinking-first then growing - "too big,
     * smaller" down to a thousandth, then "too small, larger" up to a
     * thousand times. That is the order a user reaches for them in, and
     * it was the wrong thing to optimise for: a scale control read top to
     * bottom should read small to large the way every other quantity on
     * a sheet does, and a list that jumps 1, 0.1, 0.01, 0.001, 10 makes
     * the user hunt for the one they want and cannot tell at a glance
     * which side of 1 it is on.
     *
     * THE LIST IS THE DECADES, BOTH WAYS, AROUND ONE, PLUS THE
     * SPECIFICATION'S PRACTICAL MULTIPLIERS.
     *
     * The decades cover the wide range an engineering sheet needs - a 5 N
     * reaction beside a 50 kN load - and the half/double steps
     * (0.25x, 0.5x, 2x, 4x) are the ones a student reaches for when an
     * arrow is merely a little too big or a little too small. Offering
     * only the decades forces a jump of ten when a factor of two was
     * wanted; offering only the halves cannot span the range. Both are
     * offered, deduplicated and in increasing order, so the control reads
     * small to large and every named value is present.
     */
    const SPEC_VECTOR_SCALE_VALUES = [0.25, 0.5, 1, 2, 4];

    const VECTOR_SCALE_VALUES = [
        ...new Set([
            ...Array.from(
                { length: 7 },
                (_, index) => 10 ** (index - 3)
            ),
            ...SPEC_VECTOR_SCALE_VALUES
        ])
    ].sort((a, b) => a - b);

    const VECTOR_SCALE_OPTIONS = [
        ...VECTOR_SCALE_VALUES
    ]
        .sort((a, b) => a - b)
        .map(value => ({
            value,
            label: `${value}×`
        }));

    const DEFAULT_VECTOR_SCALE = 1;

    /*
     * The sentinel the panel offers for "let me type my own".
     *
     * It is not a scale. It is the value the dropdown holds while the
     * custom field is showing, chosen so it can never be mistaken for a
     * real one - a negative number is not a length multiplier.
     */
    const CUSTOM_VECTOR_SCALE = "custom";

    /*
     * The outermost decades are as far as the list goes; a custom scale may
     * still sit outside them, since 0.001× and 1000× are where the list stops
     * being useful rather than where a scale stops being legal.
     */
    const MIN_VECTOR_SCALE = 0.0001;
    const MAX_VECTOR_SCALE = 100000;

    /*
     * Read the shared scale off the drawing state.
     *
     * A CUSTOM scale is a real scale, not a special case: the panel
     * offers the decades for speed and a typed value for everything else,
     * and both store the same number in the same place. That is why a
     * custom value is accepted here on the same terms as a listed one -
     * the alternative, letting the list decide what is real, would mean
     * the dropdown had to be told which values it did not know about.
     *
     * What is refused is anything that is not a usable LENGTH
     * multiplier: not a number, not positive, or outside the range a
     * drawing can show. Those fall back to the default rather than being
     * trusted, because this value decides how large an arrow is drawn and
     * a corrupt one must not produce an invisible arrow or one that
     * swallows the sheet.
     */
    function vectorScaleFor(state) {
        const value = Number(state?.statics?.vectorScale);

        if (!Number.isFinite(value)) {
            return DEFAULT_VECTOR_SCALE;
        }

        if (
            value < MIN_VECTOR_SCALE ||
            value > MAX_VECTOR_SCALE
        ) {
            return DEFAULT_VECTOR_SCALE;
        }

        return value;
    }

    /*
     * The length to DRAW a magnitude at, which is the engineering
     * magnitude multiplied by the shared display scale.
     *
     * These are deliberately two separate numbers. The magnitude is the
     * force; this is how long its arrow happens to be. Every caller that
     * needs an arrow length goes through here, so no caller can
     * accidentally scale one, skip another, or scale the stored value
     * instead of the drawn one.
     */
    function vectorScale(state, magnitude) {
        return (
            Math.abs(Number(magnitude) || 0) *
            vectorScaleFor(state)
        );
    }

    /*
     * WHERE A FORCE'S ARROWHEAD IS DRAWN.
     *
     * A force's stored `end` is its ENGINEERING vector - it sits exactly
     * magnitude away from the application point, because that is the
     * force. The arrow, however, is drawn at the shared display scale, so
     * at 4x the arrowhead is four times further out than the stored end.
     *
     * That gap matters because the end is also a handle. A handle drawn
     * at the stored end while the arrow runs past it leaves a dot
     * floating in the middle of its own arrow, and grabbing that dot
     * would shorten the force by three quarters of what the user can see.
     *
     * So anything that needs to know where the force LOOKS like it ends
     * asks here, rather than reading `geometry.end` and drawing at a
     * different place from the renderer.
     */
    /*
     * ============================================================
     * THE LINE A FORCE IS DRAWN ALONG, AT THE DISPLAY SCALE.
     * ============================================================
     *
     * The span is the line; the vector says which of its two ends carries the
     * head. So the drawn arrow is the span, and the two questions a caller has
     * are answered together here rather than independently by two functions
     * that could disagree about which end is which.
     *
     * THE SCALE STRETCHES THE LINE FROM THE POINT THE FORCE ACTS AT.
     *
     * It has to be multiplied in somewhere, or the Vector Scale is a control
     * that does nothing - and it was, for exactly this reason: with the tip
     * taken straight from the span's end there was no length left for it to
     * scale. Growing the line outward from `start` rather than from its middle
     * keeps the force attached to the member it acts on, and - the part that
     * matters - it is the SAME growth either way round, so reversing the force
     * still cannot move the line:
     *
     *     forward:   start ---> grown end
     *     reversed:  start <--- grown end
     *
     * `headAtGrownEnd` is which of those two is being drawn. It is decided by
     * the vector projected onto the line's own direction, whose SIGN is
     * meaningful whichever way round the span happens to be stored.
     *
     * A VECTOR THAT DISAGREES WITH ITS SPAN still goes by the vector: the
     * projection's sign says which end it points at, and the vector is the
     * engineering value. A force pushing square across the line it is drawn on
     * has no end to point at, so the line's own direction decides instead -
     * any other choice would claim something about the force that nothing
     * supports.
     *
     * NO USABLE SPAN - and a zero-length one, which is the same thing - leaves
     * no line to stretch, so the arrow runs from the point the force acts at
     * along the vector at `magnitude x scale`, which is what it has always
     * done.
     */
    function drawnForceAxis(state, geometry) {
        const vector = forceVector(geometry);

        const start = {
            x: finite(geometry?.start?.x),
            y: finite(geometry?.start?.y),
        };

        const stored =
            geometry?.end &&
            Number.isFinite(geometry.end.x) &&
            Number.isFinite(geometry.end.y)
                ? {
                      x: Number(geometry.end.x),
                      y: Number(geometry.end.y),
                  }
                : null;

        const magnitude = Math.abs(vector.magnitude);

        const scaled = (reach) => {
            const radians = (vector.angle * Math.PI) / 180;

            return {
                x:
                    start.x +
                    zeroIfAxis(Math.cos(radians)) * reach,
                y:
                    start.y +
                    zeroIfAxis(Math.sin(radians)) * reach,
            };
        };

        const spanLength = stored
            ? Math.hypot(stored.x - start.x, stored.y - start.y)
            : 0;

        if (!(spanLength > 1e-9) || !(magnitude > 1e-9)) {
            return {
                tail: start,
                head: stored && !(magnitude > 1e-9) ? stored : scaled(
                    vectorScale(state, vector.magnitude)
                ),
            };
        }

        const reach = spanLength * vectorScaleFor(state);

        const grown = {
            x: start.x + ((stored.x - start.x) / spanLength) * reach,
            y: start.y + ((stored.y - start.y) / spanLength) * reach,
        };

        const along =
            ((stored.x - start.x) / spanLength) * (vector.fx / magnitude) +
            ((stored.y - start.y) / spanLength) * (vector.fy / magnitude);

        const headAtGrownEnd = along > -1e-9;

        return {
            tail: headAtGrownEnd ? start : grown,
            head: headAtGrownEnd ? grown : start,
        };
    }

    /*
     * ============================================================
     * The ENGINEERING force a drawn point describes.
     *
     * The inverse of `drawnForceEnd`, and what a drag of the arrowhead
     * goes through. The point grabbed is on a scaled drawing, so the
     * scale has to come back off before the value is stored - otherwise
     * dragging the head to where it currently sits would silently
     * quarter the force at a 4x display scale.
     */
    function forceVectorFromDrawnPoint(state, geometry, point) {
        const vector = forceVector(geometry);

        /*
         * THE DRAG IS TAKEN BACK OFF THE DISPLAY SCALE.
         *
         * The drawn line is the span at `vectorScale`, so a drag of it is a
         * drag of something longer than the stored geometry by that factor.
         * Storing the drawn distance unconverted is what makes a force grow
         * every time it is grabbed, and the scale is a DRAWING setting, so the
         * conversion has to happen here rather than being left to the user.
         */
        const tail = drawnForceTail(state, geometry);

        const length = Math.hypot(
            point.x - tail.x,
            point.y - tail.y
        );

        const scale = vectorScaleFor(state);

        if (length <= 1e-9 || scale <= 1e-9) {
            return {
                magnitude: vector.magnitude,
                angle: vector.angle
            };
        }

        const radians = Math.atan2(
            point.y - tail.y,
            point.x - tail.x
        );

        return {
            magnitude: length / scale,
            angle: radians * 180 / Math.PI
        };
    }

    /*
     * ============================================================
     * THE OTHER END OF THE SAME LINE. WHERE THE SHAFT COMES FROM.
     * ============================================================
     *
     * `drawnForceEnd` answers where the ARROWHEAD is; this answers where the
     * tail of the shaft is, which is the other end of the same span. Together
     * they draw the line the student put there, with the head on one end or
     * the other - the way a Distributed Load's arrowheads move when it is
     * reversed while its outline stays put.
     *
     * Asking for the two separately is what stops a reversal from appearing to
     * move the arrow: the shaft is the whole span either way, so only the head
     * changes side. With the tail pinned to the application point the shaft
     * would instead reach from the application point to whichever end carries
     * the head, and a reversal would visibly relocate the drawing.
     */
    function drawnForceTail(state, geometry) {
        return drawnForceAxis(state, geometry).tail;
    }

    /*
     * ============================================================
     * WHERE THE ARROWHEAD IS.
     * ============================================================
     *
     * One of the two ends of the drawn line; `drawnForceTail` is the other.
     * Both are read out of the one `drawnForceAxis` result rather than each
     * deciding independently, because a pair that disagreed about which end was
     * which is precisely the fault this was rewritten to remove - and a shaft
     * whose tail was on the wrong side of its own head is a line drawn
     * backwards.
     */
    function drawnForceEnd(state, geometry) {
        return drawnForceAxis(state, geometry).head;
    }

    /*
     * THE UNIT A STATION IS MEASURED IN
     * ========================================================
     *
     * A station on a beam can be read as millimetres or as metres, and the
     * two are the same number in different clothes. Which one to show is
     * the student's decision - a 500 mm beam is written either way, and
     * nobody should be told - but the panel has to commit to one and say
     * which, because a bare number beside a beam is a number whose scale
     * the student has to guess from the drawing.
     *
     * IT FOLLOWS THE SHEET, which is drawn in millimetres.
     *
     * That is the one answer that is never wrong: a millimetre is a
     * millimetre whatever the member is. The alternative - inferring
     * metres from the size of a body - would print "5 m" beside a
     * 5000-unit member and be right only by coincidence, which is the same
     * class of bug as the four coordinates this replaced.
     */
    function loadStationUnit() {
        return "mm";
    }

    /*
   * ========================================================
   * IS A POINT ON A LOAD?
   * ========================================================
   *
   * A Distributed Load is one feature and it is drawn as a FIELD: a row of
   * arrows standing off the body, closed by an envelope. Almost all of that
   * ink is nowhere near the two points the model stores, so the ordinary
   * "near the start or near the end" test misses it - and a load whose
   * arrows cannot be clicked is a load the Select tool cannot reach.
   *
   * THREE PLACES ARE HIT, because three things are drawn:
   *
   *   1. THE ARROWS. Each is a shaft from a base on the body out to its tip,
   *      so a click anywhere on a shaft is a click on that arrow.
   *   2. THE ENVELOPE. The polygon joining the tips and closing along the
   *      body - the outline the load is read by. Clicking inside it means
   *      aiming at the load.
   *   3. THE BODY LINE ITSELF, between the two ends.
   *
   * (2) is the one that was missing, and it is the one a student aims at:
   * the outline is the biggest and most obvious part of a uniform load, and
   * clicking the middle of it selected whatever was behind.
   *
   * THE ARROW LENGTH IS TAKEN FROM THE SAME NUMBERS THE RENDERER USES, so
   * what is clickable is exactly what is visible - at any zoom, and at any
   * Vector Scale. A hit test that guesses its own arrow length is a hit test
   * that does not match the drawing, and the mismatch is invisible until
   * somebody zooms in.
   */
  function loadContainsPoint(
    geometry,
    point,
    tolerance,
    pixelsPerUnit,
    vectorScale
  ) {
    const start = geometry?.start;
    const end = geometry?.end;

    if (
      !start ||
      !end ||
      !Number.isFinite(start.x) ||
      !Number.isFinite(end.x) ||
      !point ||
      !Number.isFinite(point.x)
    ) {
      return false;
    }

    const samples = arrowSamples(geometry);

    if (!samples.length) {
      return false;
    }

    const peak = peakMagnitude(geometry);

    if (peak <= 0) {
      return false;
    }

    /*
     * The same normal the renderer places the arrows along, and so the same
     * side of the body they are drawn on. Falling back to the force
     * direction is what the renderer does for a degenerate span, and a hit
     * test has to agree with it even there.
     */
    const away =
      loadBodyNormal(geometry) ||
      unitVector(loadDirection(geometry));

    const reach =
      Math.max(
        peak * Math.max(pixelsPerUnit, 1e-6) * vectorScale,
        2
      );

    /* 1. The arrows. */
    for (const sample of samples) {
      const tip = {
        x: sample.base.x + away.x * reach,
        y: sample.base.y + away.y * reach
      };

      if (
        distanceToSegment(point, sample.base, tip) <=
          tolerance
      ) {
        return true;
      }
    }

    /*
     * THE ENVELOPE, BUILT ONCE.
     *
     * Out along the tips, then back along the body.
     *
     * THE TWO HALVES MUST BE THE TWO ENDS OF THE SAME ARROWS, in reverse
     * order - the tip of the last arrow joins the base of the last arrow.
     * Building the closing half from a second, separately reversed list
     * produces a bow-tie rather than a region, and a bow-tie fills in the
     * wrong places: which is how a hit test ends up accepting points in the
     * corners of the drawing and rejecting the middle of the load.
     */
    const tips = samples.map(sample => ({
      x: sample.base.x + away.x * reach,
      y: sample.base.y + away.y * reach
    }));

    const bases = samples
      .slice()
      .reverse()
      .map(sample => ({
        x: sample.base.x,
        y: sample.base.y
      }));

    const envelope = [...tips, ...bases];

    /* 2. Inside the envelope. */
    if (pointInPolygon(point, envelope)) {
      return true;
    }

    /*
     * 2b. ON THE OUTLINE ITSELF.
     *
     * The envelope is drawn as a stroked polygon, so it has a visible edge -
     * and a student aiming at the boundary of a load aims at that edge, not
     * at the interior. A point just outside the region but within the
     * tolerance of it is therefore on the load.
     *
     * This is not a fudge factor. Without it the hit region has a hard edge
     * exactly where the ink is, so clicking a fraction of a pixel off the
     * outline selects the beam behind it: the tolerance would apply to
     * everything else on screen and to nothing here.
     *
     * It also covers the gap between two arrows. The arrows stand at the
     * sample interval, so the envelope between them is visible but no
     * individual shaft reaches it, and a click there belongs to the load.
     */
    if (
      envelope.some(
        (vertex, index) =>
          distanceToSegment(
            point,
            vertex,
            envelope[(index + 1) % envelope.length]
          ) <= tolerance
      )
    ) {
      return true;
    }

    /*
     * 3. The body line itself, which is the edge of that region and is
     * drawn whether or not there are any arrows.
     */
    return (
      distanceToSegment(point, start, end) <=
      tolerance
    );
  }

  function distanceToSegment(point, from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;

    const lengthSquared = dx * dx + dy * dy;

    if (!(lengthSquared > 1e-12)) {
      return Math.hypot(
        point.x - from.x,
        point.y - from.y
      );
    }

    const t = Math.max(
      0,
      Math.min(
        1,
        ((point.x - from.x) * dx +
          (point.y - from.y) * dy) /
          lengthSquared
      )
    );

    return Math.hypot(
      point.x - (from.x + t * dx),
      point.y - (from.y + t * dy)
    );
  }

  /*
   * Standard crossing test. Boundary behaviour is left to the tolerance
   * tests above and below - a point exactly on the edge is close enough to
   * the outline either way, so the tie-break here would not change what the
   * student gets.
   */
  function pointInPolygon(point, polygon) {
    let inside = false;

    for (
      let i = 0, j = polygon.length - 1;
      i < polygon.length;
      j = i++
    ) {
      const a = polygon[i];
      const b = polygon[j];

      const straddles =
        a.y > point.y !== b.y > point.y;

      if (
        straddles &&
        point.x <
          ((b.x - a.x) * (point.y - a.y)) /
            (b.y - a.y) +
            a.x
      ) {
        inside = !inside;
      }
    }

    return inside;
  }

  /*
   * ========================================================
   * A VARYING LOAD'S PROFILE, AS THE DRAWS IT
   * ========================================================
   *
   * A varying load stores an intensity at each end; the renderer draws it by
   * sampling a profile built from them. That conversion was written out
   * again at every place that needed the profile - the fit bounds, and the
   * hit test - and each copy was a chance for the two to disagree about how
   * long a 0-to-20 taper is.
   *
   * So it is built here, once, and read by everything. A caller that wants
   * the drawn shape of either kind of load asks for it here rather than
   * knowing how either is stored.
   *
   * A UNIFORM LOAD IS ITSELF A PROFILE - two equal points - so both kinds
   * come back in the same shape and a caller does not branch on the type.
   */
  function drawnProfile(geometry) {
    if (!geometry) {
      return null;
    }

    if (geometry.points) {
      return geometry;
    }

    if (
      geometry.startIntensity === undefined &&
      geometry.endIntensity === undefined
    ) {
      return null;
    }

    return {
      start: geometry.start,
      end: geometry.end,
      direction: geometry.direction,
      interval: geometry.interval,
      points: [
        {
          t: 0,
          magnitude: Math.max(
            0,
            Math.abs(Number(geometry.startIntensity) || 0)
          )
        },
        {
          t: 1,
          magnitude: Math.max(
            0,
            Math.abs(Number(geometry.endIntensity) || 0)
          )
        }
      ]
    };
  }

  root.enggLoadProfile = {
        DEFAULT_LOAD_DIRECTION,
        DEFAULT_LOAD_INTERVAL,
        CUSTOM_VECTOR_SCALE,
        MAX_VECTOR_SCALE,
        MIN_VECTOR_SCALE,
        VECTOR_SCALE_OPTIONS,
        arrowSamples,
        clampInterval,
        drawnForceEnd,
        drawnForceTail,
        drawnForceAxis,
        drawnProfile,
        forceVector,
        forceVectorFromDrawnPoint,
        fractionAlong,
        isLoadReversed,
        loadBodyNormal,
        loadDirection,
        loadInterval,
        loadContainsPoint,
        loadNormalSide,
        loadStationUnit,
        magnitudeAt,
        peakMagnitude,
        pointAlong,
        profilePointPositions,
        profilePoints,
        reverseForceDirection,
        reverseLoadDirection,
        setForceVector,
        setLoadDirection,
        setLoadInterval,
        setProfilePoints,
        unitVector,
        vectorScale,
        vectorScaleFor
    };
})(window);
