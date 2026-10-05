
const path = require("path");

const { loadModule, locate, modulePath, sourceDir } = require("./helpers/source-path.cjs");
/*
 * DOES AN EQUATION MEAN WHAT IT SAYS?
 *
 * The Plot mode draws a curve from what the student typed, which makes the
 * parser the one place where a silent misreading becomes a wrong answer
 * drawn confidently. "4x - x^2" is the classic: a parser that gets the
 * precedence wrong draws a straight line, or a parabola, and there is
 * nothing on the drawing to say it is not the right one.
 *
 * So this checks the VALUES, not merely that something was returned.
 */

global.window = {};

loadModule("diagram-equations.js");

const eq = global.window.enggDiagramEquations;

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

const value = (text, x) => {
  const fn = eq.equationFor(text);
  return fn ? fn(x) : "rejected";
};

const near = (a, b) =>
  typeof a === "number" && Math.abs(a - b) < 1e-9;

console.log("\n  an equation is read correctly\n");

/* Constants, and the three shapes a beam diagram actually takes. */
check("a constant is constant", value("10", 3) === 10);

check("a linear term", value("10 - 5x", 2) === 0);
check("a linear term, elsewhere", value("10 - 5x", 0) === 10);

/*
 * The precedence case. 4x - x^2 is a parabola, and x^2 must bind to the x
 * only - a parser that reads it as (4x - x)^2 gives a different curve
 * entirely, and one that drops the ^ gives a straight line. Both look
 * plausible on a diagram.
 */
check("x^2 binds to the x alone", near(value("4x - x^2", 2), 4));
check("x^2, at the origin", near(value("4x - x^2", 0), 0));
check("x^2, at x = 4", near(value("4x - x^2", 4), 0));
check("a cubic term", near(value("x^3 / 6", 3), 4.5));

check("a bracketed factor", near(value("2(3x - 1)", 2), 10));
check("nested brackets", near(value("(x + 1)(x - 1)", 3), 8));
check("a leading minus", near(value("-x + 4", 1), 3));
check("a unary minus on a power", near(value("2^-1", 0), 0.5));
check("division", near(value("x / 2", 7), 3.5));

/*
 * The quantity is a label. A student writes the answer the way it appears
 * in a textbook, and stripping the prefix is what stops "V(x) = 10" from
 * being rejected as an unknown function.
 */
check("a quantity prefix is ignored", value("V(x) = 10", 0) === 10);
check("a quantity prefix with an equation", near(value("M(x) = 2x", 3), 6));

/*
 * Rejection. Every one of these must come back as null rather than a
 * number, because a number would be drawn as though it were the answer.
 */
const rejected = [
  ["an empty equation", ""],
  ["a trailing operator", "10 +"],
  ["a trailing plus and term", "10 + "],
  ["an unknown function", "sin(x)"],
  ["an unknown constant", "pi"],
  ["a letter that is not x", "y + 1"],
  ["an unbalanced bracket", "(x + 1"],
  ["a stray bracket", "x)"],
  ["a doubled decimal point", "1.2.3"],
  ["division by zero", "x / 0"],
  ["trailing junk", "10 20"]
];

rejected.forEach(([name, text]) => {
  check(
    `${name} is refused, not guessed`,
    value(text, 1) === "rejected" || value(text, 1) === null,
    `gave ${JSON.stringify(value(text, 1))}`
  );
});

/*
 * A rejected equation must not come back as a function that then returns
 * NaN, which would sample into a curve full of holes.
 */
check(
  "a refused equation has no function at all",
  eq.equationFor("sin(x)") === null
);

console.log("\n  a diagram is a list of segments\n");

/* Ranges are read the way a student means them, not refused. */
const swapped = eq.normaliseSegment({ from: 5, to: 2 }, 0);
check("a backwards range is read forwards", swapped.from === 2 && swapped.to === 5);

const unnumbered = eq.normaliseSegment({ from: 0, to: 4, equation: "10" }, 0);
check("a range is kept as typed", unnumbered.from === 0 && unnumbered.to === 4);
check("a bad range is refused", eq.normaliseSegment({ from: "a", to: 2 }, 0) === null);

/*
 * THE RANGE CHECK, against the body. A plot that runs past the end of the
 * beam describes a member that does not exist, and drawing it unclipped
 * would put a confident, wrong diagram on the page.
 */
const range = { from: 0, to: 5 };

check(
  "segments matching the body are valid",
  eq.validateSegments(
    [
      { from: 0, to: 2, equation: "10" },
      { from: 2, to: 5, equation: "10 - 5x" }
    ],
    range
  ).valid
);

check(
  "a segment past the end of the body is reported",
  !eq.validateSegments([{ from: 0, to: 9, equation: "10" }], range)
    .valid
);

check(
  "a gap between segments is reported",
  !eq.validateSegments(
    [
      { from: 0, to: 2, equation: "10" },
      { from: 3, to: 5, equation: "0" }
    ],
    range
  ).valid
);

check(
  "overlapping segments are reported",
  !eq.validateSegments(
    [
      { from: 0, to: 3, equation: "10" },
      { from: 2, to: 5, equation: "0" }
    ],
    range
  ).valid
);

check(
  "a diagram that stops short is reported",
  !eq.validateSegments([{ from: 0, to: 3, equation: "10" }], range)
    .valid
);

check(
  "no segments at all is reported",
  !eq.validateSegments([], range).valid
);

check(
  "no source body is reported rather than assumed",
  !eq.validateSegments([{ from: 0, to: 5, equation: "10" }], null)
    .valid
);

console.log("\n  a discontinuity is not smoothed away\n");

/*
 * THE POINT OF RETURNING A LIST. A point force makes the shear jump, and
 * the two segments either side of the jump have different values at the
 * same distance. Joining them into one path would draw a line THROUGH the
 * jump, asserting a value where there is none.
 *
 * So: two separate polylines, and a gap at the join.
 */
const jump = [
  { from: 0, to: 2, equation: "10" },
  { from: 2, to: 5, equation: "-5" }
];

const curves = eq.sampleSegments(jump);

check("a jump gives two curves, not one", curves.length === 2,
  `got ${curves.length}`);

const first = curves[0];
const second = curves[1];

check(
  "the first curve ends at the jump, still high",
  near(first[first.length - 1].value, 10)
);
check(
  "the second curve starts at the jump, low",
  near(second[0].value, -5)
);
check(
  "nothing is drawn between the two ends",
  near(first[first.length - 1].x, 2) &&
    near(second[0].x, 2) &&
    first[first.length - 1].value !== second[0].value
);

check(
  "an unparseable segment is skipped rather than drawn",
  eq.sampleSegments([{ from: 0, to: 5, equation: "sin(x)" }])
    .length === 0
);

check(
  "a zero-width segment is skipped rather than looping",
  eq.sampleSegments([{ from: 2, to: 2, equation: "10" }]).length === 0
);

console.log("\n  the scale comes from the equations, not the drawing\n");

/*
 * The vertical scale has to come from the largest value in the diagram.
 * It must not come from the renderer, the frame or the beam - those are
 * pixels, and a diagram scaled in pixels is a diagram that changes when
 * the student pans.
 */
check(
  "the peak is the largest magnitude in the diagram",
  eq.peakMagnitude([
    { from: 0, to: 2, equation: "10" },
    { from: 2, to: 5, equation: "-25" }
  ]) === 25
);

check(
  "an empty diagram has no peak",
  eq.peakMagnitude([]) === 0
);

console.log(
  `\n  ${pass} passed, ${fail} failed\n`
);

if (fail) {
  process.exitCode = 1;
}
