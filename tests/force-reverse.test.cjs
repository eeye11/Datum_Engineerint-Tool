
const path = require("path");

const { loadModule, locate, modulePath, sourceDir } = require("./helpers/source-path.cjs");
/*
 * REVERSING A POINT FORCE - model guard.
 *
 * The Switch Direction control on the Point Force panel turns a push into
 * a pull by changing which way the arrow points. That is ALL it changes.
 *
 * THE APPLICATION POINT MUST NOT MOVE. It is where the force acts, and a
 * change of sense is not a change of place: the same load, drawn the other
 * way round, is still acting at the same spot. A reversal that slid the
 * application point would be a different load at a different location.
 *
 * The magnitude is carried through unchanged and stays positive. It is a
 * physical magnitude, not a signed quantity - the sense of the force
 * lives in the direction, which is why this is a half turn rather than a
 * negation.
 *
 * These checks are on the model rather than on the panel because the
 * panel only calls it. What matters - that the application point holds
 * still and the magnitude holds still - has to be true wherever the
 * reversal is triggered from.
 */


global.window = {
    crypto: {
        randomUUID: () => "force-reverse-uuid"
    }
};

loadModule("load-profile.js");

const profile = global.window.enggLoadProfile;

let pass = 0;
let fail = 0;

const check = (name, ok, detail) => {
    if (ok) {
        pass++;
        console.log(`  ok   ${name}`);
    } else {
        fail++;
        console.log(
            `  FAIL ${name}${detail ? `\n       ${detail}` : ""}`
        );
    }
};

console.log("\n  point force reversal\n");

const near = (a, b, tolerance = 1e-6) =>
    Math.abs(a - b) <= tolerance;

const sample = () => ({
    start: { x: 120, y: -40 },
    position: { x: 120, y: -40 },
    end: { x: 160, y: -40 },
    magnitude: 40,
    angle: 0
});

/*
 * Diagonal, so that reversing cannot accidentally pass by only swapping
 * an x component: the vector is not axis-aligned.
 */
const diagonal = () => ({
    start: { x: 50, y: 20 },
    position: { x: 50, y: 20 },
    end: { x: 80, y: 80 },
    magnitude: Math.hypot(30, 60),
    angle: Math.atan2(60, 30) * 180 / Math.PI
});

[
    ["axis-aligned", sample],
    ["diagonal", diagonal]
].forEach(([label, build]) => {
    const geometry = build();

    const before = profile.forceVector(geometry);

    profile.reverseForceDirection(geometry);

    const after = profile.forceVector(geometry);

    check(
        `${label}: the application point does not move`,
        near(after.x, before.x) && near(after.y, before.y),
        `${before.x},${before.y} -> ${after.x},${after.y}`
    );

    check(
        `${label}: the stored start is untouched`,
        near(geometry.start.x, before.x, 1e-6) &&
            near(geometry.start.y, before.y, 1e-6) &&
            near(geometry.position.x, before.x, 1e-6) &&
            near(geometry.position.y, before.y, 1e-6),
        `start = ${geometry.start.x},${geometry.start.y}`
    );

    check(
        `${label}: magnitude is unchanged`,
        near(after.magnitude, before.magnitude, 1e-6),
        `${before.magnitude} -> ${after.magnitude}`
    );

    check(
        `${label}: magnitude stays positive`,
        after.magnitude > 0,
        `magnitude = ${after.magnitude}`
    );

    check(
        `${label}: stored magnitude field stays positive`,
        geometry.magnitude > 0,
        `geometry.magnitude = ${geometry.magnitude}`
    );

    check(
        `${label}: direction turns through a half turn`,
        near(
            Math.abs(after.angle - before.angle),
            180,
            1e-6
        ),
        `angle ${before.angle} -> ${after.angle}`
    );

    check(
        `${label}: the vector is the exact negation`,
        near(after.fx, -before.fx, 1e-6) &&
            near(after.fy, -before.fy, 1e-6),
        `(${before.fx},${before.fy}) -> (${after.fx},${after.fy})`
    );

    check(
        `${label}: the arrowhead sits the same distance the other side`,
        near(
            after.x + after.fx - before.x,
            -before.fx,
            1e-6
        ) && near(
            after.y + after.fy - before.y,
            -before.fy,
            1e-6
        ),
        `tip offset was (${before.fx},${before.fy}), ` +
            `now (${after.x + after.fx - before.x},${after.y + after.fy - before.y})`
    );

    check(
        `${label}: reversing twice restores the original`,
        (() => {
            profile.reverseForceDirection(geometry);
            const round = profile.forceVector(geometry);

            return near(round.x, before.x, 1e-6) &&
                near(round.y, before.y, 1e-6) &&
                near(round.fx, before.fx, 1e-6) &&
                near(round.fy, before.fy, 1e-6);
        })(),
        "two reversals did not return to the starting force"
    );
});

/*
 * A force with no stored end is derived from its magnitude, and must
 * still reverse rather than throw.
 */
const derived = () => ({
    start: { x: 10, y: 10 },
    position: { x: 10, y: 10 },
    magnitude: 25,
    angle: 90
});

const derivedGeometry = derived();

let threw = null;

try {
    profile.reverseForceDirection(derivedGeometry);
} catch (error) {
    threw = error;
}

check(
    "a force with no stored end reverses without throwing",
    threw === null,
    threw ? String(threw.message) : ""
);

if (!threw) {
    const vector = profile.forceVector(derivedGeometry);

    /*
     * A half turn from 90 degrees is -90, which is 270 in the positive
     * direction. The angle is normalised before comparing, because which
     * of the two equivalent readings comes back is only a matter of
     * representation and not of direction.
     */
    const normalised =
        ((vector.angle % 360) + 360) % 360;

    check(
        "a derived force reverses to the opposite direction",
        near(normalised, 270, 1e-6),
        `angle = ${vector.angle} (normalised ${normalised}), expected 270`
    );

    check(
        "a derived force keeps its magnitude",
        near(vector.magnitude, 25, 1e-6),
        `magnitude = ${vector.magnitude}`
    );

    check(
        "a derived force keeps its application point",
        near(vector.x, 10, 1e-6) && near(vector.y, 10, 1e-6),
        `application point = ${vector.x},${vector.y}`
    );
}

console.log(
    `\n  ${pass} passed, ${fail} failed\n`
);

if (fail) {
    process.exitCode = 1;
}
