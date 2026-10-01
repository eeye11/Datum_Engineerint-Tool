/* Checks the shared rotational arrow's geometry. */
const fs = require("fs");

const src = fs.readFileSync(
    "js/engineering-drawing/rotational-arrow.js",
    "utf8"
);

const window = {};
new Function("window", src)(window);

const R = window.enggDrawingRotationalArrow;

let failed = 0;

function check(ok, label, detail) {
    if (!ok) {
        failed += 1;
    }
    console.log(
        "  " + (ok ? "pass" : "FAIL") + "  " + label +
        (detail && !ok ? " :: " + detail : "")
    );
}

const C = { x: 100, y: 100 };

console.log("\nDefault direction is anticlockwise\n");

check(
    R.DEFAULT_ARC_RADIUS_PX === 16,
    "a new symbol has a sensible default radius"
);

const ccw = R.arcFor(C, false);
const cw = R.arcFor(C, true);

console.log("\nThe curve, the gap and the head\n");

check(
    Math.abs(ccw.sweepExtent - (300 * Math.PI / 180)) < 1e-9,
    "the sweep spans a substantial part of the circle",
    String(ccw.sweepExtent)
);

check(
    (2 * Math.PI) - ccw.sweepExtent >
        Math.atan2(1, 0) * 0 + (30 * Math.PI / 180) - 1e-9,
    "an opening is left for the head rather than a closed ring"
);

const headDist = Math.hypot(
    ccw.tip.x - ccw.start.x,
    ccw.tip.y - ccw.start.y
);

check(
    headDist > 1,
    "the head sits on the end of the curve",
    String(headDist)
);

/*
 * The head must be TANGENT: the radius to the head and the direction
 * the head points must be perpendicular. A head aimed at the centre
 * would read as a force, which is the specific failure being avoided.
 */
const radial = {
    x: ccw.tip.x - C.x,
    y: ccw.tip.y - C.y
};

const dot =
    radial.x * ccw.tangent.x +
    radial.y * ccw.tangent.y;

check(
    Math.abs(dot) < 1e-9,
    "the head is tangent to the arc, not aimed at the centre",
    "dot = " + dot
);

const head = R.headPoints(ccw, 7);

check(
    head.length === 3,
    "the head is a closed triangle"
);

check(
    Math.hypot(
        head[0].x - ccw.tip.x,
        head[0].y - ccw.tip.y
    ) < 1e-9,
    "the head's tip is exactly the curve's end"
);

/*
 * The two WINGS of the head are the same distance from the tip, so
 * the triangle is symmetric about the direction the head points. That
 * is the property that makes it read as an arrowhead rather than as a
 * wedge leaning to one side.
 */
const wingOne = Math.hypot(
    head[1].x - head[0].x,
    head[1].y - head[0].y
);

const wingTwo = Math.hypot(
    head[2].x - head[0].x,
    head[2].y - head[0].y
);

check(
    Math.abs(wingOne - wingTwo) < 1e-9,
    "the head is symmetric about its own axis",
    wingOne + " vs " + wingTwo
);

console.log("\nThe head scales with the line\n");

const thin = R.headPoints(ccw, 4);
const heavy = R.headPoints(ccw, 16);

const reach = points =>
    Math.hypot(
        points[1].x - points[0].x,
        points[1].y - points[0].y
    );

check(
    reach(heavy) > reach(thin),
    "a heavier line gets a larger head"
);

console.log("\nReverse changes direction and nothing else\n");

check(
    ccw.center.x === cw.center.x &&
        ccw.center.y === cw.center.y,
    "the centre is identical"
);

check(
    ccw.radius === cw.radius,
    "the radius is identical"
);

check(
    ccw.sweepFlag !== cw.sweepFlag,
    "the sweep runs the other way"
);

check(
    Math.hypot(
        ccw.tip.x - cw.tip.x,
        ccw.tip.y - cw.tip.y
    ) > 1,
    "the head moves to the other end of the opening"
);

/*
 * The strongest statement of "reversal is not a reflection": a
 * reflection would map the symbol onto the other side of the
 * application point. Reversing must leave every drawn point on the
 * SAME circle about the SAME centre - it changes which way round the
 * ink runs, not where the symbol is.
 */
const onCircle = arc =>
    Math.abs(
        Math.hypot(
            arc.tip.x - arc.center.x,
            arc.tip.y - arc.center.y
        ) - arc.radius
    ) < 1e-9;

check(
    onCircle(ccw) && onCircle(cw),
    "both directions stay on the same circle about the same point"
);

console.log("\nRadius is presentation, not magnitude\n");

const narrow = R.arcFor(C, false, 10);
const wide = R.arcFor(C, false, 40);

check(
    wide.radius > narrow.radius,
    "the radius can be changed for readability"
);

check(
    wide.center.x === narrow.center.x &&
        wide.center.y === narrow.center.y,
    "changing the radius never moves the application point"
);

check(
    R.clampArcRadius(0) === R.DEFAULT_ARC_RADIUS_PX,
    "a nonsensical radius falls back to the default"
);

check(
    R.clampArcRadius(9999) === R.MAX_ARC_RADIUS_PX,
    "an absurd radius is capped"
);

check(
    R.clampArcRadius(2) === R.MIN_ARC_RADIUS_PX,
    "a radius too small to hold a head is raised"
);

console.log("\nForgiving hit testing\n");

/* On the curve, in the middle of the sweep. */
const midAngle =
    ccw.startAngle - ccw.sweepExtent / 2;

const onCurve = {
    x: C.x + Math.cos(midAngle) * ccw.radius,
    y: C.y + Math.sin(midAngle) * ccw.radius
};

check(
    R.arcContainsPoint(ccw, onCurve, 4),
    "a point exactly on the curve is a hit"
);

check(
    R.arcContainsPoint(
        ccw,
        {
            x: onCurve.x + 3,
            y: onCurve.y
        },
        4
    ),
    "a few pixels away is still a hit"
);

check(
    !R.arcContainsPoint(
        ccw,
        {
            x: onCurve.x + 40,
            y: onCurve.y
        },
        4
    ),
    "far off the curve is not a hit"
);

/*
 * The gap has no ink, so the far side of the circle must not be a
 * hit. This is what stops a moment on a beam from swallowing clicks
 * aimed at the beam.
 *
 * The opening is whatever the sweep does not reach: the short arc
 * running from the START in the direction the sweep does NOT go. For
 * an anticlockwise symbol the sweep decreases in angle, so the gap is
 * the short arc INCREASING from the start angle. Its middle is derived
 * from the start and the gap's own width rather than guessed, so the
 * test stays true whichever way round the symbol is facing.
 */
const turn = Math.PI * 2;

const wrap = value =>
    ((value % turn) + turn) % turn;

const inGapAngle =
    wrap(
        ccw.startAngle +
            (turn - ccw.sweepExtent) / 2
    );

const inGap = {
    x: C.x + Math.cos(inGapAngle) * ccw.radius,
    y: C.y + Math.sin(inGapAngle) * ccw.radius
};

check(
    !R.arcContainsPoint(ccw, inGap, 4),
    "the open part of the circle is not a hit"
);

check(
    R.arcContainsPoint(ccw, ccw.tip, 4),
    "the arrowhead itself is a hit"
);

check(
    !R.arcContainsPoint(
        ccw,
        { x: C.x, y: C.y },
        4
    ),
    "the bare centre is not a hit, so the body underneath stays clickable"
);

console.log("\nThe drawn path traces the sweep that is stored\n");

/*
 * The bug this guards against.
 *
 * An SVG arc command chooses between the two arcs that join the same
 * two points using its large-arc flag, and with that flag unset it
 * always draws the SHORT one. Since the sweep is 300 degrees and the
 * gap is 60, an unset flag silently draws the gap: a small stray arc
 * with the arrowhead floating away from it, while every stored angle
 * still describes a 300 degree sweep.
 *
 * So the path is parsed back and the arc it actually describes is
 * recovered from its flags, rather than trusting the string to mean
 * what the geometry says.
 *
 * The command is
 *
 *     A rx ry x-axis-rotation large-arc-flag sweep-flag x y
 *
 * and the ROTATION is part of the command - it is not optional. Parsing
 * only two flags after the radius pair reads the rotation as the
 * large-arc flag and slides everything one place along, which describes
 * an arc the drawing never asked for.
 *
 * That is not hypothetical: the path was emitted without the rotation
 * for a while, every flag was individually correct, and the browser
 * rejected the result - so both moment tools created their features and
 * drew nothing at all. The rotation is read and asserted below so the
 * command cannot lose that parameter again.
 */
function describedSweep(path) {
    const parsed = path.match(
        /A\s+[-\d.e+]+\s+[-\d.e+]+\s+([-\d.e+]+)\s+([01])\s+([01])\s/
    );

    const rotation = Number(parsed[1]);
    const large = parsed[2] === "1";
    const clockwise = parsed[3] === "1";

    return {
        rotation,
        large,
        clockwise,

        /*
         * SVG takes the arc that spans MORE than half a turn when the
         * large flag is set, and LESS than half when it is clear.
         */
        extent: large
            ? 300
            : 60
    };
}

    [
        ["anticlockwise", ccw],
        ["clockwise", cw]
    ].forEach(([label, arc]) => {
        const described =
            describedSweep(R.arcPath(arc));

    check(
        described.rotation === 0,
        label + ": the path states its rotation, rather than letting " +
            "the flags slide into the wrong slots",
        String(described.rotation)
    );

    check(
        described.large === true,
        label + ": the path asks for the long arc, not the gap"
    );

    check(
        Math.abs(
            described.extent -
                (arc.sweepExtent * 180 / Math.PI)
        ) < 1e-9,
        label + ": the path sweeps the same " +
            Math.round(arc.sweepExtent * 180 / Math.PI) +
            " degrees the geometry says",
        described.extent + " degrees"
    );

    check(
        described.clockwise === (arc.sweepFlag === 1),
        label + ": the path runs the way the symbol says"
    );
});

console.log(
    "\n" + (failed === 0
        ? "all checks passed"
        : failed + " check(s) failed")
);

process.exit(failed === 0 ? 0 : 1);
