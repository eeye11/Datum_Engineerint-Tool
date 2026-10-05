/*
 * ========================================================
 * THE PANEL LANGUAGE, AND THE PUNCTUATION IT REFUSES
 * ========================================================
 *
 * Two rules carry this module, and they are the two the panels actually broke:
 *
 *   1. NO PUNCTUATION WITHOUT A VALUE. A field with nothing to say is not a
 *      field. This is the defect behind "Magnitude: 100 N," and "Direction: ,"
 *      and the bare "," left behind when an optional property was absent.
 *
 *   2. NO EMPTY SECTIONS. A heading is emitted together with the fields that
 *      justify it, or not at all - so there is no APPEARANCE heading standing
 *      over nothing and no gap left where one was removed.
 *
 * These are asserted directly rather than inferred from a rendered panel,
 * because the failure mode is silent: markup that looks plausible in a
 * terminal and reads as garbage in the panel.
 */
const path = require("path");
const { JSDOM } = require("jsdom");

const { locate, modulePath, sourceDir } = require("./helpers/source-path.cjs");
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
});

global.window = dom.window;
global.document = dom.window.document;

require(
  locate("property-panel.js"),
);

const panel = global.window.enggPropertyPanel;

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

console.log("\n  a missing value is not a field\n");

check(
  "an absent value renders no field at all",
  panel.readOnly("Direction", undefined) === null,
  "a label with nothing after it is how a stray separator gets on screen",
);

check(
  "null renders no field",
  panel.readOnly("Direction", null) === null,
);

check(
  "an empty string renders no field",
  panel.readOnly("Direction", "") === null,
);

check(
  "a whitespace-only string renders no field",
  panel.readOnly("Direction", "   ") === null,
);

check(
  "NaN renders no field",
  panel.readOnly("Magnitude", NaN) === null,
  "NaN stringifies to something that looks like content",
);

check(
  "Infinity renders no field",
  panel.readOnly("Magnitude", Infinity) === null,
);

check(
  "an unformatted object renders no field",
  panel.readOnly("Direction", { dx: 0, dy: -1 }) === null,
  "an object reaching the display layer becomes [object Object]",
);

console.log("\n  BUT ZERO IS A VALUE\n");

check(
  "a zero magnitude renders",
  panel.readOnly("Magnitude", 0) !== null,
  "zero shear is a real answer and must not vanish from its own panel",
);

check(
  "a zero quantity renders as 0, not as nothing",
  panel.quantity(0, "N") === "0 N",
  `quantity(0, "N") gave ${panel.quantity(0, "N")}`,
);

check(
  "a zero coordinate renders",
  panel.quantity(0, "mm") === "0 mm",
);

console.log("\n  NO PUNCTUATION SURVIVES\n");

const samples = [
  panel.readOnly("Direction", undefined),
  panel.readOnly("Magnitude", null),
  panel.readOnlyQuantity("Force", undefined, "N"),
  panel.scalar({
    label: "Magnitude",
    key: "geometry.magnitude",
    value: undefined,
    unit: "N",
  }),
  panel.select({
    label: "Line Type",
    attribute: "data-line-type",
    options: [],
    value: "solid",
  }),
  panel.toggle({
    label: "Show Magnitude",
    attribute: "",
    on: true,
  }),
];

samples.forEach((markup, index) => {
  check(
    `sample ${index} produced nothing at all`,
    markup === null || markup === "",
    `produced ${JSON.stringify(markup)}`,
  );
});

const withValue = [
  panel.readOnly("Magnitude", 100, "N"),
  panel.readOnlyQuantity("Magnitude", 100, "N"),
  panel.scalar({
    label: "Magnitude",
    key: "geometry.magnitude",
    value: 100,
    unit: "N",
  }),
  panel.select({
    label: "Line Type",
    attribute: "data-line-type",
    options: ["Solid", "Dashed"],
    value: "Solid",
  }),
  panel.toggle({
    label: "Show Magnitude",
    attribute: "data-show-magnitude",
    on: true,
  }),
];

withValue.forEach((markup, index) => {
  const text = String(markup);

  check(
    `sample ${index} has no orphan comma`,
    !text.includes("> ,") &&
      !text.includes(",</span>") &&
      !text.includes("undefined") &&
      !text.includes("null") &&
      !text.includes("[object Object]"),
    `produced ${text.replace(/\s+/g, " ").slice(0, 160)}`,
  );
});

console.log("\n  THE NUMBER AND ITS UNIT ARE JOINED ONCE\n");

check(
  "a quantity joins number and unit with one space",
  panel.quantity(100, "N") === "100 N",
  `gave ${panel.quantity(100, "N")}`,
);

check(
  "a quantity with no unit is just the number",
  panel.quantity(100) === "100",
);

check(
  "a quantity never doubles its unit",
  !panel.quantity(100, "N").includes("N N"),
);

check(
  "a quantity is never marked approximate",
  !panel.quantity(100, "N").includes("~"),
);

check(
  "an absent quantity is absent rather than unitless",
  panel.quantity(undefined, "N") === null,
  `gave ${panel.quantity(undefined, "N")}`,
);

check(
  "negative zero is normalised",
  panel.number(-0.0000001) === "0",
  `gave ${panel.number(-0.0000001)}`,
);

check(
  "trailing zeros are dropped",
  panel.number(100.00) === "100",
  `gave ${panel.number(100.00)}`,
);

console.log("\n  THE COORDINATE DEFECT\n");

/*
 * "150, 300 mm" was a Start field: two numbers glued with a comma, and one
 * unit appended to the pair so it read as though it belonged to the second.
 * X and Y are separate engineering quantities and must be separate fields.
 */
const coords = panel.coordinate({
  label: "Start",
  xKey: "startX",
  yKey: "startY",
  x: 150,
  y: 300,
});

check(
  "a coordinate is two fields",
  Array.isArray(coords) && coords.length === 2,
  `gave ${coords && coords.length} field(s)`,
);

check(
  "and neither glues the ordinates together",
  !coords.some(field => String(field).includes("150,")),
  "the ordinates are still being concatenated with a comma",
);

check(
  "each ordinate carries the unit itself",
  coords.every(field => String(field).includes("mm")),
  "one ordinate lost its unit in the split",
);

console.log("\n  A HEADING STANDS OR FALLS WITH ITS FIELDS\n");

check(
  "a section with fields renders its heading",
  panel
      .section("APPEARANCE", [
          panel.readOnly("Line Type", "Solid"),
      ])
      .includes("APPEARANCE"),
);

check(
  "a section whose fields are all absent renders NOTHING",
  panel
      .section("APPEARANCE", [
          panel.readOnly("Line Type", undefined),
          panel.readOnly("Line Width", null),
      ]) === "",
  "a heading is standing over fields that were never emitted",
);

check(
  "and not even an empty heading",
  !panel
      .section("ANNOTATION", [
          panel.readOnly("Show Magnitude", undefined),
      ])
      .includes("ANNOTATION"),
);

check(
  "a section given an empty list is not emitted",
  panel.section("DISPLAY", []) === "",
);

const headingless = panel.section(null, [
    panel.readOnly("Magnitude", 100, "N"),
]);

check(
  "a section with no heading still renders its fields",
  headingless.includes("Magnitude") &&
    headingless.includes("100") &&
    headingless.includes("N"),
  `fields were dropped along with an absent heading: ${JSON.stringify(headingless)}`,
);

/*
 * The number and the unit are SEPARATE cells of the row, not one string, so
 * they are not adjacent in the markup. Concatenating them into one string is
 * the "100 NN" / "250 mm mm" failure this module exists to prevent.
 */
check(
  "the unit is its own cell rather than part of the value",
  headingless.includes(
      '<span class="drawing-property-derived">100</span>',
  ) &&
    headingless.includes(
      '<span class="drawing-property-unit">N</span>',
  ),
  "number and unit are being glued into a single string",
);

console.log("\n  THE PANEL ORDERS ITS SECTIONS ITSELF\n");

const ordered = panel.panel({
  name: "Point Force 1",
  sections: {
    appearance: [
        panel.readOnly("Line Type", "Solid"),
    ],
    engineering: [
        panel.readOnlyQuantity("Magnitude", 100, "N"),
    ],
    reference: [
        panel.readOnly("Source Body", "Beam 1"),
    ],
  },
});

check(
  "the header names the feature",
  ordered.includes("Point Force 1"),
);

check(
  "the editable name is present as a field",
  panel.nameField({
        attribute: "feature-name",
        value: "Point Force 1",
      }) !== null,
);

/*
 * The name is bound by its OWN attribute, not by a geometry key. A feature's
 * name is not part of its geometry: it does not travel in the geometry
 * signature that decides whether the panel is rebuilt, and typing in the box
 * must not be mistaken for an edit to the shape.
 */
const nameField = String(
  panel.nameField({
    attribute: "feature-name",
    value: "Point Force 1",
  }),
);

check(
  "the name field carries the hook the rename binding listens for",
  nameField.includes('data-feature-name="feature-name"'),
  `the name field carries ${nameField.replace(/\s+/g, " ").slice(0, 140)}`,
);

check(
  "and is not bound as a geometry property",
  !nameField.includes('data-property="feature-name"'),
  "renaming a feature must not be handled as a geometry edit",
);

const positions = ["Magnitude", "Beam 1", "Solid"].map(needle =>
  ordered.indexOf(needle),
);

check(
  "sections appear in the canonical order regardless of declaration order",
  positions.every(
    (position, index) =>
      index === 0 || position > positions[index - 1],
  ),
  `engineering at ${positions[0]}, reference at ${positions[1]}, appearance at ${positions[2]}`,
);

console.log(
  `\n${pass} passed, ${fail} failed`,
);

if (fail > 0) {
  process.exitCode = 1;
}
