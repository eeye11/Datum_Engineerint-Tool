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

    function setLoadDirection(geometry, degrees) {
      geometry.direction = finite(degrees, DEFAULT_LOAD_DIRECTION);
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

    function unitVector(degrees) {
        const radians = finite(degrees) * Math.PI / 180;

        return {
            x: Math.cos(radians),
            y: Math.sin(radians)
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
   * The sense is chosen once, from the load's own direction, and is
   * then fixed: a downward load draws its lines below the body, and
   * reversing that load keeps them below the body, because "below"
   * is a property of the drawing and "down" is a property of the
   * force. They are separate questions and are answered separately.
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

    const direction = unitVector(loadDirection(geometry));

    /*
     * Orient the normal so it agrees with the force direction. This
     * is a one-time sense, taken from the direction the load was
     * built with: a reversal changes only the arrowhead and so
     * leaves this agreement - and therefore the drawn line - alone.
     */
    const agrees =
      normal.x * direction.x + normal.y * direction.y >= 0;

    return agrees
      ? normal
      : { x: -normal.x, y: -normal.y };
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

        const end =
            geometry?.end ||
            {
                x: start.x + vector.x * magnitude,
                y: start.y + vector.y * magnitude
            };

        const fx = finite(end.x) - finite(start.x);
        const fy = finite(end.y) - finite(start.y);

        return {
            x: finite(start.x),
            y: finite(start.y),
            fx,
            fy,
            magnitude: Math.hypot(fx, fy),
            angle: Math.atan2(fy, fx) * 180 / Math.PI
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

        return setForceVector(
            geometry,
            vector.magnitude,
            vector.angle + 180
        );
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
     * THE ORDER IS DERIVED, NOT TYPED, so that adding a value later cannot
     * put it back out of sequence. An earlier version listed the entries
     * literally and relied on them being written in the right order, which
     * is a thing that stops being true the moment someone adds a decade.
     */
    const VECTOR_SCALE_VALUES = [
        0.001,
        0.01,
        0.1,
        1,
        10,
        100,
        1000
    ];

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
     * The widest range a custom scale may take.
     *
     * A scale is a length multiplier, so it has to be positive - a
     * negative one would draw every arrow backwards. The ceiling is not
     * about taste: it stops a mistyped entry such as 1e9 from producing an
     * arrow that swallows the whole sheet, and a floor stops 0 collapsing
     * every vector to a dot. Beyond them the value is refused and the
     * default is used, because an arrow that cannot be seen or read is
     * worse than one drawn at true length.
     */
    const MIN_VECTOR_SCALE = 0.0001;
    const MAX_VECTOR_SCALE = 10000;

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
    function drawnForceEnd(state, geometry) {
        const vector = forceVector(geometry);

        const scale = vectorScaleFor(state);

        return {
            x: vector.x + vector.fx * scale,
            y: vector.y + vector.fy * scale
        };
    }

    /*
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

        const length = Math.hypot(
            point.x - vector.x,
            point.y - vector.y
        );

        const scale = vectorScaleFor(state);

        if (length <= 1e-9 || scale <= 1e-9) {
            return {
                magnitude: vector.magnitude,
                angle: vector.angle
            };
        }

        const radians = Math.atan2(
            point.y - vector.y,
            point.x - vector.x
        );

        return {
            magnitude: length / scale,
            angle: radians * 180 / Math.PI
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
        forceVector,
        forceVectorFromDrawnPoint,
        fractionAlong,
        isLoadReversed,
        loadBodyNormal,
        loadDirection,
        loadInterval,
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
