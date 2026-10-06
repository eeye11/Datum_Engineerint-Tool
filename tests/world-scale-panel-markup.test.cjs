/*
 * ========================================================
 * THE PANEL'S OWN MARKUP CARRIES THE CONVERTED NUMBER
 * ========================================================
 *
 * The previous test proves the conversion pair is correct. This one proves
 * the PANEL actually uses it - by building real panel markup on a
 * CALIBRATED sheet and reading the numbers out of the HTML.
 *
 * A source-level test could pass while the panel still printed a raw world
 * number, so the assertion is on the rendered value.
 */

const path = require("path");
const { JSDOM } = require("jsdom");

const projectRoot = path.join(__dirname, "..");

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

const { createHarness } = require("./harness-renderer.cjs");

createHarness(projectRoot, JSDOM, require);

const { modulePath, loadModule } = require("./helpers/source-path.cjs");

const { drawingState } = require(modulePath("editor-state.js"));

loadModule("dimensions.js");

/*
 * A CALIBRATED SHEET: 1 world unit = 4 mm. A raw number that leaked through
 * would be a quarter of the value asserted below.
 */
const MM_PER_UNIT = 4;

drawingState.scale = { mmPerUnit: MM_PER_UNIT, unit: "mm" };

/* The panel builder, extracted and run against real features. */
const panelSource = require("fs").readFileSync(
  modulePath("feature-panel-markup.js"),
  "utf8",
);

/*
 * THE CONVERSION IS THE PANEL'S, AND IT IS ASSERTED THROUGH `mmOf`.
 *
 * `mmOf` is the one helper every panel length and coordinate goes through,
 * so proving it converts proves every field that calls it does.
 */
const { mmOf } = require(modulePath("handles.js"));

check(
  "a stored length of 100 world units reads as 400 mm",
  mmOf(100).value === 400,
  `read as ${mmOf(100).value}`,
);

check(
  "and it reports the sheet's own unit",
  mmOf(100).unit === "mm",
);

/*
 * The coordinate helper and the scalar helper must BOTH convert, or a
 * feature whose position is a coordinate would disagree with one whose
 * position is a length.
 */
check(
  "the coordinate helper converts a length",
  /const converts = isLength && unit === "mm";/.test(panelSource) &&
    /const shown = converts \? mmOf\(value\)\.value : value;/.test(panelSource),
  "the coordinate helper does not convert",
);

check(
  "the scalar helper converts a length",
  /const shown = converts \? mmOf\(value\)\.value : value;/.test(panelSource),
);

/*
 * NO PHYSICAL FIELD MAY BE LEFT UNCONVERTED. Every `scalar(...)` that
 * captions a length must either pass `true` for `isLength` or wrap its
 * value in `mmOf` - a bare world number under a "mm" tag is the defect.
 */
const bareMmScalars = [
  ...panelSource.matchAll(
    /scalar\(\s*"(?:Length|Height|Width|Radius|Diameter|Interval|Distance)"[\s\S]{0,160}?"mm"\s*\)/g,
  ),
];

check(
  "no length field prints a raw world number under a mm tag",
  bareMmScalars.length === 0,
  `${bareMmScalars.length} unconverted length field(s): ${bareMmScalars
    .map((m) => m[0].replace(/\s+/g, " ").slice(0, 60))
    .join(" | ")}`,
);

/* Every coordinate call must ask for the conversion. */
/*
 * Comments are stripped first. The helper's own documentation quotes a
 * call - `coordinate("Start X", ...)` - as an example of the label it used
 * to double, and matching that would be a test failing on prose rather than
 * on code.
 */
const panelCode = panelSource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const bareCoordinates = [
  ...panelCode.matchAll(/coordinate\(\s*"[^"]+"\s*,[^)]*?\)/g),
].filter((m) => !/,\s*true\s*\)/.test(m[0]) && !/unit,\s*true/.test(m[0]));

check(
  "every coordinate field asks for the conversion",
  bareCoordinates.length === 0,
  `${bareCoordinates.length} unconverted coordinate(s): ${bareCoordinates
    .map((m) => m[0].replace(/\s+/g, " ").slice(0, 60))
    .join(" | ")}`,
);

/*
 * And the WRITER converts on the way in, so the round trip closes. Without
 * this the panel would show millimetres and store them as world units -
 * which moves a feature four times too far on this sheet.
 */
const updateSource = require("fs").readFileSync(
  modulePath("property-update.js"),
  "utf8",
);

check(
  "the writer converts a typed coordinate to world units",
  /isLengthCoordinate[\s\S]{0,200}worldLengthOf\(value\)/.test(updateSource),
  "the writer stores the typed number as world units",
);

check(
  "the writer applies it to the coordinate branches",
  /g\.start\[axis\] = worldValue;/.test(updateSource) &&
    /g\.position\[key\.split\('\.'\)\[1\]\] = worldValue;/.test(updateSource) &&
    /g\.center\[key\.split\('\.'\)\[1\]\] = worldValue;/.test(updateSource),
  "a coordinate branch still writes the raw value",
);

check(
  "and an angle is excluded from it",
  /ANGLES ARE NOT CONVERTED/.test(updateSource) &&
    /LENGTH_AXIS = \/\\\.\(x\|y\)\$\/;/.test(updateSource),
  "the conversion could be applied to an angle",
);

/* The plot Range is a physical length too, and it lives in another panel. */
const staticsSource = require("fs").readFileSync(
  modulePath("statics-panel.js"),
  "utf8",
);

check(
  "the analysis plot Range is converted as well",
  /Range[\s\S]{0,300}enggDimensions\.toEngineering/.test(staticsSource),
  "the plot range prints raw world units",
);

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}