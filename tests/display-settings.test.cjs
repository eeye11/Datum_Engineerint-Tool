
const { JSDOM } = require("jsdom");

const path = require("path");

const { locate, modulePath, sourceDir } = require("./helpers/source-path.cjs");
/*
 * ========================================================
 * ARE THE THREE DISPLAY SETTINGS INDEPENDENT?
 * ========================================================
 *
 * Show Magnitudes, Show Units and Show Dimensions are three different
 * questions, and the whole point of making them three controls is that
 * they can be answered differently:
 *
 *     Magnitudes ON, Units OFF, Dimensions OFF
 *
 *     -> F = 100, M = 25, w = 5, and no dimensions
 *
 *     Magnitudes OFF, Units ON, Dimensions ON
 *
 *     -> dimensions with their units, and no force annotations
 *
 * Each was implemented by making the unit part of a display decision
 * rather than part of the string, because a unit written into the text at
 * every call site cannot be taken off again without rewriting all of them.
 * So the values are built as a NUMBER and a separate unit, and one place
 * decides whether the unit is printed.
 *
 * That makes independence the thing most worth checking: a change that
 * turned one of them off by setting another is exactly the kind of coupling
 * that is invisible until someone wants the combination.
 */


const projectRoot = path.join(__dirname, "..");

let pass = 0;
let fail = 0;

const check = (name, ok, detail) => {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(
      `  FAIL ${name}${detail ? `\n       ${detail}` : ""}`,
    );
  }
};

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
});

global.window = dom.window;
global.document = dom.window.document;

require(
  locate("annotation-model.js",
  ),
);

const model = global.window.enggAnnotationModel;

const near = (a, b) => Math.abs(a - b) < 1e-9;

/*
 * A force of 100 N, and a label about it. This is the smallest object
 * that can carry a unit, which is the whole question.
 */
const force = {
  id: "f1",
  type: "force",
  name: "Point Force 1",
  geometry: {
    start: { x: 0, y: 0 },
    angle: 30,
    magnitude: 100,
    unit: "N",
  },
};

const label = {
  id: "a1",
  type: "annotation",
  sourceFeatureId: "f1",
  annotationKind: "force-value",
  textMode: "generated",
  placement: { x: 0, y: 0 },
};

const stateWith = display => ({
  objects: [force, label],
  display: display || {},
});

const textFor = display =>
  model.textFor(label, stateWith(display));

/*
 * The number and the unit, matched separately.
 *
 * `formatNumber` renders one decimal place, so the value in the text is
 * "100.0" rather than "100". A regex written as `/100\s*N/` therefore
 * fails on a label that is perfectly correct, which is a confusing way to
 * fail - so the figure is matched loosely and the unit exactly.
 */
const hasNumber = text => /\b100(?:\.0+)?\b/.test(text || "");

const hasUnit = text => /\bN\b/.test(text || "");

console.log("\n  the unit is part of the value\n");

/*
 * A VISIBLE QUANTITY ALWAYS CARRIES ITS UNIT.
 *
 * This used to read the other way round - that `showUnits: false` removed the
 * "N" from "100 N" - on the reasonable-sounding grounds that a drawing
 * carrying both a 100 N force and a 100 mm span may want to read either.
 *
 * But a bare 100 beside another 100 of a different physical quantity is
 * ambiguous, and the unit is not a weaker presentation of the same fact: it
 * is what makes the number mean one particular thing. Printing "100" and
 * asking the reader to remember which of the sheet's quantities it was is
 * worse than noisy, and it is the reader who pays for the setting.
 *
 * So the flag no longer decides anything. What remains of it is accepted, so
 * a drawing saved with it still reads back, and what it can no longer do is
 * produce a magnitude that cannot be understood.
 */
check(
  "with units on, the force states its unit",
  hasUnit(textFor({ showUnits: true })),
  `read: ${JSON.stringify(textFor({ showUnits: true }))}`,
);

check(
  "and with it off, it still does - the flag no longer decides",
  hasUnit(textFor({ showUnits: false })),
  `read: ${JSON.stringify(textFor({ showUnits: false }))}`,
);

check(
  "and the NUMBER is identical either way",
  hasNumber(textFor({ showUnits: true })) &&
    hasNumber(textFor({ showUnits: false })),
  `read: ${JSON.stringify(textFor({ showUnits: false }))}`,
);

check(
  "and neither is marked approximate",
  !String(textFor({ showUnits: true })).includes("~") &&
    !String(textFor({ showUnits: false })).includes("~"),
  `read: ${JSON.stringify(textFor({ showUnits: false }))}`,
);

console.log("\n  an absent setting means on\n");

/*
 * A DRAWING SAVED BEFORE THESE EXISTED has no `display` field at all. If
 * that read as "off", opening an old sheet would silently strip every unit
 * and every magnitude off it - a silent change to engineering content,
 * caused by adding a preference.
 */
check(
  "a state with no display settings keeps its units",
  hasUnit(textFor(undefined)),
  `read: ${JSON.stringify(textFor(undefined))}`,
);

check(
  "and an empty display object does too",
  hasUnit(textFor({})),
  `read: ${JSON.stringify(textFor({}))}`,
);

console.log("\n  there are exactly TWO display settings, and units is not one\n");

/*
 * UNITS ARE NOT A SETTING.
 *
 * This used to read the other way round - three independent flags, one
 * of them deciding whether a magnitude printed its unit - and the whole
 * point of the block was that "show magnitudes without units" was
 * expressible. It is not, and must not be: a unit is what the number
 * MEANS, so a magnitude drawn without one is a different and ambiguous
 * statement rather than a plainer rendering of the same one. On a
 * drawing carrying a 250 mm dimension beside a 250 N force, a bare
 * "250" tells the reader nothing.
 *
 * So the reader returns the two settings that remain - whether
 * MAGNITUDES are shown, and whether DIMENSIONS are - and it does not
 * report a units flag at all. A file saved while the control existed
 * still carries the field; it is simply not read.
 */
const displayCode = model.displaySettingsOf;

check(
  "the model reads the display settings",
  Boolean(displayCode),
  "the settings reader is what the toggles are bound to",
);

const settings = displayCode({
  display: {
    showUnits: false,
    showMagnitudes: true,
    showDimensions: false,
  },
});

check(
  "a saved showUnits field is not read back as a setting",
  !("showUnits" in settings),
  JSON.stringify(settings),
);

check(
  "magnitudes and dimensions are read, and are independent",
  settings.showMagnitudes === true &&
    settings.showDimensions === false,
  JSON.stringify(settings),
);

check(
  "and a units flag cannot turn the magnitude off",
  model.displaySettingsOf({
    display: { showUnits: false },
  }).showMagnitudes === true,
  "the setting that asks for magnitudes is not the unit flag",
);

/*
 * AND THE UNIT IS PRINTED EITHER WAY, which is the visible consequence of
 * the flag no longer existing. The two states differ in whether a
 * magnitude is drawn at all, never in whether it carries its unit.
 */
check(
  "a unit flag cannot strip the unit from a magnitude",
  hasUnit(
    model.textFor(
      {
        id: "a1",
        type: "annotation",
        sourceFeatureId: "f1",
        annotationKind: "force-value",
        textMode: "generated",
        placement: { x: 0, y: 0 },
      },
      stateWith({ showUnits: false }),
    ),
  ),
  "a saved showUnits:false must not produce a unitless magnitude",
);

check(
  "and the magnitude is still there",
  hasNumber(
    model.textFor(
      {
        id: "a1",
        type: "annotation",
        sourceFeatureId: "f1",
        annotationKind: "force-value",
        textMode: "generated",
        placement: { x: 0, y: 0 },
      },
      stateWith({ showUnits: false }),
    ),
  ),
);

console.log("\n  one unit, printed once\n");

/*
 * The failure this guards against is `F = 100 N N`: a unit added by the
 * value builder and again by whatever is displaying it. The unit is
 * assembled in exactly one place, so it can only be printed once - and the
 * check is that no number carries two.
 */
const stated = textFor({ showUnits: true }) || "";

check(
  "no number carries a doubled unit",
  !/\d\s*(N|N·m|kN\/m|N m|N·m|N)\s*\1/.test(stated),
  `read: ${JSON.stringify(stated)}`,
);

check(
  "there is exactly one N in the statement",
  (stated.match(/\bN\b/g) || []).length === 1,
  `read: ${JSON.stringify(stated)}`,
);

console.log("\n  the value stored is a number, not a formatted string\n");

/*
 * THE VALUE IS THE DATA. `geometry.magnitude` is 100, not "100 N", and
 * formatting belongs to the display layer. A stored string cannot be
 * converted, cannot be summed by a resultant, and makes "hide the unit"
 * impossible without parsing it back apart.
 */
check(
  "the stored magnitude is a number",
  typeof force.geometry.magnitude === "number" &&
    near(force.geometry.magnitude, 100),
);

check(
  "and the unit is a separate field",
  force.geometry.unit === "N",
  `stored as: ${JSON.stringify(force.geometry.magnitude)}`,
);

console.log(
  `\n${pass} passed, ${fail} failed\n`,
);

if (fail) {
  process.exitCode = 1;
}
