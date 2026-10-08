/*
 * ========================================================
 * THE ANGULAR SECTOR: WHICH OF THE FOUR IS DIMENSIONED
 * ========================================================
 *
 * Two crossing lines make FOUR angular regions - 35, 145, 35, 145 for a
 * 35-degree pair - and the specification requires that the CURSOR chooses
 * which one is dimensioned, not the order the endpoints happened to be saved
 * in.
 *
 * `angleSectorLegs` is the one function that answers this, and both the
 * measured value and the drawn arc are built from its output - so a test of
 * it is a test of both. It is pure geometry, so it runs directly here without
 * a browser or a canvas.
 *
 * The two properties that matter:
 *
 *   1. The sector follows the CURSOR. A placement in the narrow region gives
 *      the acute angle; one in the wide region gives the supplementary one.
 *
 *   2. The sector does NOT follow the ENDPOINT ORDER. Storing a line the
 *      other way round is the same physical line, so the same placement must
 *      give the same answer.
 */

const { modulePath } = require("./helpers/source-path.cjs");

let pass = 0;
let fail = 0;

const check = (name, ok, detail) => {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`);
  }
};

/*
 * The function is lifted out of the model and run against a small context.
 * It reaches for `normalise`, `legDirection`, `negate`, `signedSweep`,
 * `directionBetween` and `rotateToward`, which are extracted alongside it -
 * the same dependency closure the module itself uses, so the test exercises
 * the real implementation rather than a restatement of it.
 */
const fs = require("fs");

const source = fs.readFileSync(modulePath("dimension-model.js"), "utf8");

function extract(name) {
  const start = source.indexOf(`function ${name}(`);

  if (start < 0) {
    return "";
  }

  const open = source.indexOf("{", start);
  let depth = 0;
  let end = open;

  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  return source.slice(start, end);
}

const pieces = [
  "normalise",
  "legDirection",
  "negate",
  "atan2Angle",
  "anglesOf",
  "angleSectorLegs",
]
  .map(extract)
  .filter(Boolean);

check(
  "the sector function and its helpers were recovered",
  pieces.length === 6,
  `recovered ${pieces.length} of 6`,
);

const vm = require("vm");

const sandbox = { console };
vm.createContext(sandbox);

vm.runInContext(
  pieces.join("\n") +
    "\nthis.angleSectorLegs = angleSectorLegs;" +
    "\nthis.included = function (a, b) {" +
    "  const dot = a.x * b.x + a.y * b.y;" +
    "  const det = a.x * b.y - a.y * b.x;" +
    "  return Math.abs(Math.atan2(det, dot) * 180 / Math.PI);" +
    "};",
  sandbox,
);

const angleSectorLegs = sandbox.angleSectorLegs;
const angleBetween = sandbox.included;

const vertex = { x: 0, y: 0 };

/* Line A along +X; line B at 35 degrees above it, both from the vertex. */
const deg = (d) => (d * Math.PI) / 180;

const spanA = { start: { x: 0, y: 0 }, end: { x: 200, y: 0 } };

const bEnd = {
  x: 200 * Math.cos(deg(35)),
  y: 200 * Math.sin(deg(35)),
};

const spanB = { start: { x: 0, y: 0 }, end: bEnd };

/* The value the model would report for a placement, to one decimal place. */
function valueAt(placement, second = spanB) {
  const legs = angleSectorLegs(vertex, spanA, second, placement);

  if (!legs) {
    return null;
  }

  return Math.round(angleBetween(legs.a, legs.b) * 10) / 10;
}

console.log("\n  the cursor chooses between the acute and obtuse sector\n");

check(
  "a placement between the axes gives the ACUTE angle",
  valueAt({ x: 120, y: 30 }) === 35,
  `got ${valueAt({ x: 120, y: 30 })}`,
);

check(
  "a placement below the first axis gives the SUPPLEMENTARY angle",
  valueAt({ x: 120, y: -30 }) === 145,
  `got ${valueAt({ x: 120, y: -30 })}`,
);

check(
  "a placement beyond the vertex, on the +Y side, is the OTHER wide sector",
  valueAt({ x: -120, y: 30 }) === 145,
  `got ${valueAt({ x: -120, y: 30 })}`,
);

check(
  "and beyond the vertex on the -Y side is acute again",
  valueAt({ x: -120, y: -30 }) === 35,
  `got ${valueAt({ x: -120, y: -30 })}`,
);

console.log("\n  a 90-degree pair reads 90 in every sector\n");

{
  const rightSpan = {
    start: { x: 0, y: 0 },
    end: { x: 0, y: 200 },
  };

  const rightValue = (placement) => {
    const legs = angleSectorLegs(vertex, spanA, rightSpan, placement);

    return legs ? Math.round(angleBetween(legs.a, legs.b) * 10) / 10 : null;
  };

  check(
    "right angles read 90 whatever sector the cursor is in",
    [0, 90, 180, 270].every((d) => {
      const r = 90;
      return (
        rightValue({
          x: 120 * Math.cos(deg(d)),
          y: 120 * Math.sin(deg(d)),
        }) === r
      );
    }),
  );
}

console.log("\n  REVERSING A LINE DOES NOT CHANGE THE ANSWER\n");

{
  /*
   * The same PHYSICAL line, stored the other way round. Every one of the four
   * sectors must read exactly as it did before, because the line it describes
   * is the same line.
   */
  const reversedSpanB = {
    start: bEnd,
    end: { x: 0, y: 0 },
  };

  const placements = [
    { x: 120, y: 30 },
    { x: 120, y: -30 },
    { x: -120, y: 30 },
    { x: -120, y: -30 },
  ];

  check(
    "every sector reads the same with the second line reversed",
    placements.every((p) => valueAt(p, reversedSpanB) === valueAt(p)),
    placements
      .map((p) => `${valueAt(p)} -> ${valueAt(p, reversedSpanB)}`)
      .join(", "),
  );

  const reversedSpanA = {
    start: { x: 200, y: 0 },
    end: { x: 0, y: 0 },
  };

  check(
    "and with the FIRST line reversed as well",
    placements.every((p) => {
      const legs = angleSectorLegs(vertex, reversedSpanA, reversedSpanB, p);

      const value = legs
        ? Math.round(angleBetween(legs.a, legs.b) * 10) / 10
        : null;

      return value === valueAt(p);
    }),
  );
}

console.log("\n  ROTATION DOES NOT CHANGE THE ANSWER\n");

{
  const rot = (p, t) => ({
    x: p.x * Math.cos(t) - p.y * Math.sin(t),
    y: p.x * Math.sin(t) + p.y * Math.cos(t),
  });

  const placements = [
    { x: 120, y: 30 },
    { x: 120, y: -30 },
  ];

  check(
    "rotating the whole geometry leaves every sector unchanged",
    placements.every((p) => {
      const t = deg(40);

      const legs = angleSectorLegs(
        vertex,
        { start: rot(spanA.start, t), end: rot(spanA.end, t) },
        { start: rot(spanB.start, t), end: rot(spanB.end, t) },
        rot(p, t),
      );

      const value = legs
        ? Math.round(angleBetween(legs.a, legs.b) * 10) / 10
        : null;

      return value === valueAt(p);
    }),
  );
}

console.log("\n  a placement with no direction is refused, not guessed\n");

check(
  "a placement exactly ON the vertex returns nothing",
  angleSectorLegs(vertex, spanA, spanB, { x: 0, y: 0 }) === null,
);

check(
  "and no placement at all returns nothing",
  angleSectorLegs(vertex, spanA, spanB, null) === null,
);

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
