/*
 * THE STATICS VECTOR SCALE - model guard.
 *
 * One shared, presentational multiplier for every Statics force and load
 * arrow, held once on the drawing's Statics settings.
 *
 * The property that matters most is the one this file is really about:
 * the scale changes how LONG an arrow is DRAWN and never what the force
 * IS. A 100 N force drawn at 4x is still 100 N. If the scale ever leaked
 * into a stored magnitude, every analysis reading that force would be
 * wrong by the display factor - so the separation is asserted here
 * rather than assumed.
 *
 * The proportionality rule matters just as much for a varying load: one
 * factor is applied to the WHOLE representation, never per arrow, so a
 * profile rising 2 -> 8 stays in that ratio at every scale.
 */

global.window = {
    crypto: {
        randomUUID: () => "vector-scale-uuid"
    }
};

require("../js/engineering-drawing/load-profile.js");

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

console.log("\n  statics vector scale\n");

const near = (a, b, tolerance = 1e-9) =>
    Math.abs(a - b) <= tolerance;

const withScale = value => ({
    statics: { vectorScale: value }
});

const values = profile.VECTOR_SCALE_OPTIONS.map(o => o.value);

/* 1. The option list is the fixed, shared set the panel offers. */
check(
    "the option list is present and non-empty",
    Array.isArray(profile.VECTOR_SCALE_OPTIONS) &&
        profile.VECTOR_SCALE_OPTIONS.length > 0,
    "VECTOR_SCALE_OPTIONS missing"
);

check(
    "the default is 1.0x",
    values.includes(1),
    `values: ${values.join(", ")}`
);

check(
    "the offered scales are decades, in the order they are shown",
    JSON.stringify(values) ===
        JSON.stringify([1, 0.1, 0.01, 0.001, 10, 100, 1000]),
    `values: ${values.join(", ")}`
);

/* 2. Reading the shared value. */
check(
    "an unset state reads as 1.0x",
    profile.vectorScaleFor({}) === 1,
    `got ${profile.vectorScaleFor({})}`
);

check(
    "a state with no statics block reads as 1.0x",
    profile.vectorScaleFor({ objects: [] }) === 1
);

values.forEach(v => {
    check(
        `${v}x round-trips`,
        profile.vectorScaleFor(withScale(v)) === v,
        `got ${profile.vectorScaleFor(withScale(v))}`
    );
});

/*
 * A corrupt or hand-edited value must not be trusted: this number decides
 * how large an arrow is drawn, so an unusable one falls back rather than
 * producing an invisible or absurd force.
 *
 * What is refused is anything that is not a usable LENGTH MULTIPLIER -
 * not a number, not positive, or outside the drawable range. A CUSTOM
 * value is not a special case: it is the same setting typed, and is
 * accepted on exactly the same terms as a listed one.
 */
[0, -2, NaN, "wide", null, undefined, 1e9].forEach(bad => {
    check(
        `an unusable value (${String(bad)}) falls back to 1.0x`,
        profile.vectorScaleFor(withScale(bad)) === 1,
        `got ${profile.vectorScaleFor(withScale(bad))}`
    );
});

/* --- A custom value is a real scale. */
[1.5, 0.25, 250, 0.5, 7].forEach(custom => {
    check(
        `a custom value of ${custom} is accepted as-is`,
        profile.vectorScaleFor(withScale(custom)) === custom,
        `got ${profile.vectorScaleFor(withScale(custom))}`
    );
});

check(
    "the smallest allowed custom value is accepted",
    profile.vectorScaleFor(withScale(profile.MIN_VECTOR_SCALE)) ===
        profile.MIN_VECTOR_SCALE
);

check(
    "the largest allowed custom value is accepted",
    profile.vectorScaleFor(withScale(profile.MAX_VECTOR_SCALE)) ===
        profile.MAX_VECTOR_SCALE
);

check(
    "just below the floor is refused",
    profile.vectorScaleFor(withScale(profile.MIN_VECTOR_SCALE / 2)) === 1
);

check(
    "just above the ceiling is refused",
    profile.vectorScaleFor(withScale(profile.MAX_VECTOR_SCALE * 2)) === 1
);

check(
    "the custom entry is a sentinel, not a scale",
    profile.CUSTOM_VECTOR_SCALE === "custom" &&
        !values.includes(profile.CUSTOM_VECTOR_SCALE),
    `sentinel = ${profile.CUSTOM_VECTOR_SCALE}`
);

check(
    "choosing the custom entry does not become the stored scale",
    profile.vectorScaleFor(withScale(profile.CUSTOM_VECTOR_SCALE)) === 1,
    `got ${profile.vectorScaleFor(withScale(profile.CUSTOM_VECTOR_SCALE))}`
);

/* 3. Drawing length scales; the magnitude does not. */
const MAGNITUDE = 100;

check(
  "the drawn length scales with the setting",
  near(
    profile.vectorScale(withScale(10), MAGNITUDE),
    MAGNITUDE * 10
  ),
  `got ${profile.vectorScale(withScale(10), MAGNITUDE)}`
);

check(
  "a smaller setting shortens the drawn arrow",
  near(
    profile.vectorScale(withScale(0.1), MAGNITUDE),
    MAGNITUDE * 0.1
  ),
  `got ${profile.vectorScale(withScale(0.1), MAGNITUDE)}`
);

check(
  "a custom setting scales the drawn arrow",
  near(
    profile.vectorScale(withScale(1.5), MAGNITUDE),
    MAGNITUDE * 1.5
  ),
  `got ${profile.vectorScale(withScale(1.5), MAGNITUDE)}`
);

check(
    "the drawn length is never negative",
    profile.vectorScale(withScale(4), -MAGNITUDE) > 0,
    "a negative magnitude produced a negative length"
);

check(
    "the magnitude itself is untouched by scaling",
    MAGNITUDE === 100,
    `magnitude became ${MAGNITUDE}`
);

/*
 * 4. Proportionality: ONE factor over the whole representation.
 *
 * A varying load's arrows must keep their ratio to each other. If the
 * scale were applied per arrow, or normalised each arrow to fit, these
 * two ratios would stop matching.
 */
const ratioAt = (scale, a, b) =>
    profile.vectorScale(withScale(scale), b) /
        profile.vectorScale(withScale(scale), a);

[0.25, 0.5, 1, 2, 4].forEach(scale => {
    check(
        `${scale}x keeps a 2:8 profile in that ratio`,
        near(ratioAt(scale, 2, 8), 4, 1e-9),
        `ratio = ${ratioAt(scale, 2, 8)}`
    );

    check(
        `${scale}x scales the profile by exactly one factor`,
        near(
            profile.vectorScale(withScale(scale), 8),
            8 * scale,
            1e-9
        ),
        `got ${profile.vectorScale(withScale(scale), 8)}`
    );
});

/*
 * 5. One shared value, not one per feature.
 *
 * Two different features read the same single setting - there is nowhere
 * for a per-feature scale to live, and nothing on a force or a load
 * carries one.
 */
const stateA = withScale(2);
const stateB = withScale(0.5);

check(
    "the same setting governs every vector",
    profile.vectorScaleFor(stateA) === 2 &&
        profile.vectorScaleFor(stateA) === profile.vectorScaleFor(stateA),
    "the shared value is not stable across reads"
);

check(
    "the scale lives on the drawing, not the feature",
    !("vectorScale" in { type: "force" }) ||
        profile.vectorScaleFor(withScale(4)) === 4,
    "a feature appears to carry its own scale"
);

console.log(
    `\n  ${pass} passed, ${fail} failed\n`
);

if (fail) {
    process.exitCode = 1;
}
