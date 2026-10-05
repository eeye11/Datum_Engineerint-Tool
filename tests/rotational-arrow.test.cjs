
const path = require("path");

const { loadModule, locate, modulePath, sourceDir } = require("./helpers/source-path.cjs");
/*
 * THE ROTATIONAL ARROW PATH - regression guard.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Both Moment tools - Applied Moment and Couple Moment - armed
 * correctly, created their features, put them in the Features panel,
 * and drew NOTHING on the canvas.
 *
 * The curve is emitted as an SVG arc command, whose syntax is:
 *
 *     A rx ry x-axis-rotation large-arc-flag sweep-flag x y
 *
 * The x-axis-rotation parameter was missing. The large-arc flag
 * therefore landed in the rotation slot and the sweep flag landed in
 * the large-arc slot, so the browser rejected every path and drew
 * nothing. Both flags were correct values - they were simply in the
 * wrong places.
 *
 * This is the failure a unit test catches and a code review misses: the
 * function returns a plausible-looking string, every flag is the right
 * value on its own, and the result is only invalid once a real renderer
 * parses it. So the check here PARSES the emitted path the way a browser
 * would, rather than matching it against a golden string.
 */


global.window = {
    crypto: {
        randomUUID: () => "rotational-arrow-uuid"
    }
};

loadModule("rotational-arrow.js");

const arrow = global.window.enggDrawingRotationalArrow;

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

console.log("\n  rotational arrow path\n");

check(
    "the module exposes the arc builder",
    typeof arrow?.arcPath === "function" &&
        typeof arrow?.arcFor === "function",
    `exports: ${Object.keys(arrow || {}).join(", ")}`
);

/*
 * Parse an "M ... A ..." command and pull out the arc parameters.
 *
 * Returns null when the command cannot be read as a well-formed arc at
 * all - which is exactly the condition that made the browser discard the
 * path.
 */
function parseArc(d) {
    const match =
        /^\s*M\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+A\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([01])\s+([01])\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s*$/
            .exec(d || "");

    if (!match) {
        return null;
    }

    return {
        start: { x: Number(match[1]), y: Number(match[2]) },
        rx: Number(match[3]),
        ry: Number(match[4]),
        rotation: Number(match[5]),
        largeArc: Number(match[6]),
        sweep: Number(match[7]),
        end: { x: Number(match[8]), y: Number(match[9]) }
    };
}

const centre = { x: 100, y: 100 };

/*
 * Both senses of turn. The rotation parameter is positional, so a broken
 * one corrupts the flags identically either way and both must be checked.
 */
[true, false].forEach(clockwise => {
    const label = clockwise ? "clockwise" : "anticlockwise";

    const arc = arrow.arcFor(
        centre,
        clockwise,
        16
    );

    const d = arrow.arcPath(arc);

    const parsed = parseArc(d);

    check(
        `${label}: path parses as a well-formed SVG arc`,
        parsed !== null,
        `d = ${d}`
    );

    if (parsed) {
        check(
            `${label}: rotation parameter is 0`,
            parsed.rotation === 0,
            `rotation = ${parsed.rotation}`
        );

        check(
            `${label}: large-arc flag is 1 (the sweep is 300 degrees)`,
            parsed.largeArc === 1,
            `largeArc = ${parsed.largeArc}`
        );

        check(
            `${label}: sweep flag matches the direction`,
            parsed.sweep === (clockwise ? 1 : 0),
            `sweep = ${parsed.sweep}, expected ${clockwise ? 1 : 0}`
        );

        check(
            `${label}: radius is emitted as the rx/ry pair`,
            parsed.rx === arc.radius && parsed.ry === arc.radius,
            `rx/ry = ${parsed.rx}/${parsed.ry}, radius = ${arc.radius}`
        );

        check(
            `${label}: the path starts where the arc starts`,
            parsed.start.x === arc.start.x &&
                parsed.start.y === arc.start.y,
            `path ${parsed.start.x},${parsed.start.y} ` +
                `vs arc ${arc.start.x},${arc.start.y}`
        );

        check(
            `${label}: the path ends at the arc tip`,
            parsed.end.x === arc.tip.x &&
                parsed.end.y === arc.tip.y,
            `path ${parsed.end.x},${parsed.end.y} ` +
                `vs tip ${arc.tip.x},${arc.tip.y}`
        );
    }
});

/*
 * The regression itself, stated directly: the OLD three-number form put
 * the flags in the wrong slots and is what this file exists to catch.
 */
const wrongShape = parseArc(
    "M 100 116 A 16 16 1 0 84 116"
);

check(
    "the old malformed shape is rejected by the parser",
    wrongShape === null,
    `parsed as ${JSON.stringify(wrongShape)}`
);

console.log(
    `\n  ${pass} passed, ${fail} failed\n`
);

if (fail) {
    process.exitCode = 1;
}
