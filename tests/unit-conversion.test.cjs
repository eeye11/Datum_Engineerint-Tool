/*
 * ========================================================
 * CHANGING A UNIT IS A CONVERSION, NOT A RELABEL
 * ========================================================
 *
 * The requirement: `250 N` read in kN is `0.25 kN`. The physical quantity does
 * not move; only how it is written does.
 *
 * THE MECHANISM, which is what makes that exact rather than approximate:
 *
 *   THE STORED VALUE IS ALWAYS IN THE BASE UNIT. A force is stored in N, a
 *   moment in N·m. The unit beside it says how to WRITE that number, so
 *   changing the unit changes no stored value at all - and cannot, which is
 *   why a unit cannot drift by being toggled back and forth.
 *
 *   THE CONVERSION HAPPENS AT THE EDGES: base -> display for reading, and
 *   display -> base for a typed number. Both go through
 *   `quantities.convertValue`, so there is one arithmetic path.
 */

const { JSDOM } = require("jsdom");

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

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://datum.test/",
});

global.window = dom.window;
global.document = dom.window.document;
global.Element = dom.window.Element;

const quantities = require(modulePath("quantities.js")).default;
const state = require(modulePath("drawing-state.js")).default;
const profile = require(modulePath("load-profile.js")).default;

/* ============================================================
 * THE CONVERSION ITSELF
 * ============================================================ */

console.log("\n  the value converts; the quantity does not move\n");

{
  const { convertValue } = quantities;

  check(
    "250 N read in kN is 0.25",
    convertValue(250, "force", "N", "kN") === 0.25,
    String(convertValue(250, "force", "N", "kN")),
  );

  check(
    "and 0.25 kN read back in N is 250",
    convertValue(0.25, "force", "kN", "N") === 250,
    String(convertValue(0.25, "force", "kN", "N")),
  );

  check(
    "1000 mm read in m is 1",
    convertValue(1000, "length", "mm", "m") === 1,
  );

  check(
    "1000 N·m read in kN·m is 1",
    convertValue(1000, "moment", "N·m", "kN·m") === 1,
  );

  check(
    "lbf converts through its own factor",
    Math.abs(convertValue(1, "force", "lbf", "N") - 4.4482216152605) < 1e-12,
  );
}

console.log("\n  a round trip loses nothing\n");

{
  const { convertValue } = quantities;

  check(
    "N -> kN -> N is the same number",
    Math.abs(
      convertValue(convertValue(250, "force", "N", "kN"), "force", "kN", "N") -
        250,
    ) < 1e-9,
    "a unit toggled back and forth must not drift",
  );

  check(
    "and a moment survives the same round trip",
    Math.abs(
      convertValue(
        convertValue(5, "moment", "N·m", "kN·m"),
        "moment",
        "kN·m",
        "N·m",
      ) - 5,
    ) < 1e-9,
  );
}

console.log("\n  a CROSS-QUANTITY conversion is refused, not guessed\n");

{
  const { convertValue, conversionFactor } = quantities;

  check(
    "a length is not a force",
    conversionFactor("force", "mm") === null,
    "offering force units for a length is how a panel lies about a number",
  );

  check(
    "an unknown unit converts to nothing rather than through a factor of 1",
    conversionFactor("force", "furlongs") === null,
  );

  check(
    "and converting an unknown unit leaves the value alone",
    convertValue(250, "force", "N", "furlongs") === 250,
    "the caller gets its number back rather than a silently corrupted one",
  );
}

console.log("\n  the three value states survive a unit change\n");

{
  const { convertValue } = quantities;

  /*
   * An Unknown has no number to convert, and a symbol has none either. Both
   * must come back untouched rather than as a converted zero.
   */
  check(
    "converting a non-number returns it unchanged, not zero",
    convertValue(undefined, "force", "N", "kN") === undefined,
    "Unknown must not become 0 by being converted",
  );

  check(
    "and null the same",
    convertValue(null, "force", "N", "kN") === null,
  );
}

/* ============================================================
 * WHICH UNITS A QUANTITY MAY BE STATED IN
 * ============================================================ */

console.log("\n  only the units that belong to the quantity\n");

{
  const { unitsFor } = quantities;

  check(
    "a force offers force units",
    unitsFor("force").includes("N") && unitsFor("force").includes("kN"),
  );

  check(
    "and a MOMENT unit is not among them",
    !unitsFor("force").includes("kN·m"),
    "a moment unit on a force control is a category error",
  );

  check(
    "a moment offers moment units",
    unitsFor("moment").includes("N·m") &&
      unitsFor("moment").includes("kN·m"),
  );

  check(
    "a length offers length units",
    ["mm", "cm", "m"].every((u) => unitsFor("length").includes(u)),
  );

  check(
    "and an unknown quantity offers nothing rather than everything",
    unitsFor("nonsense").length === 0,
  );
}

/* ============================================================
 * THE STORED VALUE IS IN THE BASE UNIT
 * ============================================================ */

console.log("\n  a force's stored magnitude is always in N\n");

{
  const st = state.createDrawingState();
  const F = state.geometryFactories;

  const force = F.force({ x: 0, y: 0 }, { x: 100, y: 0 });

  state.addObject(st, force);

  /* Written as 250 N. */
  profile.setForceVector(force.geometry, 250, 0);

  check(
    "the magnitude is stored in N",
    force.geometry.magnitude === 250,
    String(force.geometry.magnitude),
  );

  /* Switching the unit must NOT touch the stored magnitude. */
  profile.setForceUnit(force.geometry, "kN");

  check(
    "changing the unit leaves the stored magnitude alone",
    force.geometry.magnitude === 250,
    "the number is the base-unit value; the unit only says how to write it",
  );

  check(
    "and the unit is recorded",
    profile.forceUnit(force.geometry) === "kN",
  );

  /*
   * WHICH IS THE WHOLE TRICK: reading 250 base units in kN gives 0.25, so the
   * panel shows 0.25 kN while the model holds 250 N. The force never moved.
   */
  check(
    "so reading it in kN gives 0.25",
    quantities.convertValue(250, "force", "N", "kN") === 0.25,
  );

  check(
    "and reading it in N gives 250 again",
    quantities.convertValue(250, "force", "N", "N") === 250,
    "toggling the unit back restores the display exactly",
  );
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
