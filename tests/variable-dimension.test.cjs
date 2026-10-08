/*
 * ========================================================
 * VARIABLE DIMENSION: THE SAME SELECTION, A DIFFERENT ANSWER
 * ========================================================
 *
 * The requirement is a SIBLING relationship, not a second system:
 *
 *     Smart Dimension     geometry -> place -> MEASURED value
 *     Variable Dimension  geometry -> place -> the STUDENT'S value
 *
 * So the two must agree about WHAT is being dimensioned - one line is a length,
 * two non-parallel lines are an angle - and differ only in where the answered
 * value comes from.
 *
 * The defects this pins:
 *
 *   1. A Variable Dimension used to commit IMMEDIATELY on placement, with a
 *      default symbol `x`, and never asked. A student got a feature stating a
 *      name they had not chosen.
 *
 *   2. The panel READ `geometry.symbol` and the setter WROTE `geometry.symbol`,
 *      while the model stores the symbol ON the feature (`variable.symbol`).
 *      So the student's own symbol was invisible in the panel, and an edit
 *      appeared to do nothing.
 *
 *   3. The symbol was not reduced to a number anywhere it should not be, but
 *      nothing proved it - so `L/2` surviving verbatim is asserted here.
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

const state = require(modulePath("drawing-state.js")).default;
const inference = require(modulePath("dimension-inference.js"));
const variable = require(modulePath("variable-dimension.js")).default;

/* ============================================================
 * THE SELECTION LOGIC IS THE SAME ONE
 * ============================================================ */

console.log("\n  the SAME inference decides both tools' dimension type\n");

{
  const F = state.geometryFactories;

  const lineA = F.line({ x: 0, y: 0 }, { x: 100, y: 0 });
  const lineB = F.line({ x: 0, y: 0 }, { x: 70, y: 70 });

  const lineRef = (object) => ({
    kind: "line",
    featureId: object.id,
    anchor: "start",
    endAnchor: "end",
    object,
  });

  const pair = inference.inferDimensionDescriptor(
    lineRef(lineA),
    lineRef(lineB),
  );

  check(
    "two non-parallel lines infer an ANGLE",
    pair?.dimensionType === "angular",
    JSON.stringify(pair?.dimensionType),
  );

  const single = inference.inferDimensionDescriptor(lineRef(lineA), null);

  check(
    "one line infers a LENGTH",
    single && ["horizontal", "vertical", "aligned", "linear"].includes(
      single.dimensionType,
    ),
    JSON.stringify(single?.dimensionType),
  );
}

/* ============================================================
 * NO AUTOMATIC ANSWER
 * ============================================================ */

console.log("\n  the value is the STUDENT'S, and is stored verbatim\n");

{
  const F = state.geometryFactories;

  [
    "L",
    "x",
    "θ",
    "25",
    "L/2",
    "2*L",
    "3*x + 5",
    "(L + W)/2",
  ].forEach((text) => {
    const object = F["variable-dimension"]({
      refs: [{ kind: "between", featureId: "line-1", anchor: "start" }],
      placement: { x: 10, y: 10 },
      symbol: text,
    });

    check(
      `"${text}" is stored exactly as entered`,
      object.symbol === text,
      `stored ${JSON.stringify(object.symbol)}`,
    );

    check(
      `and "${text}" displays as itself, not a number`,
      variable.variableText(object) === text,
      `displays ${JSON.stringify(variable.variableText(object))}`,
    );
  });
}

console.log("\n  and it is NOT replaced by a measurement\n");

{
  const st = state.createDrawingState();
  const F = state.geometryFactories;

  /* A line that is physically 100 long. */
  const line = F.line({ x: 0, y: 0 }, { x: 100, y: 0 });
  state.addObject(st, line);

  const object = F["variable-dimension"]({
    refs: [
      { kind: "between", featureId: line.id, anchor: "start" },
      { kind: "between", featureId: line.id, anchor: "end" },
    ],
    placement: { x: 50, y: -20 },
    symbol: "L",
  });

  check(
    "a variable on a 100-long line still says L",
    variable.variableText(object) === "L",
    `says ${JSON.stringify(variable.variableText(object))}`,
  );

  check(
    "and it carries no measured value of its own",
    object.value === undefined && object.measurement === undefined,
    `value=${object.value} measurement=${object.measurement}`,
  );
}

/* ============================================================
 * THE PANEL FIELD AND THE FEATURE AGREE
 * ============================================================ */

console.log("\n  the panel reads and writes WHERE THE MODEL KEEPS IT\n");

{
  const markup = require("fs").readFileSync(
    modulePath("feature-panel-markup.js"),
    "utf8",
  );

  const update = require("fs").readFileSync(
    modulePath("property-update.js"),
    "utf8",
  );

  check(
    "the panel reads the symbol off the FEATURE",
    /textField\("Variable", "symbol", object\.symbol/.test(markup),
    "reading geometry.symbol showed nothing, because that is a different object",
  );

  check(
    "and the setter writes it to the FEATURE",
    /object\.symbol = String\(value \?\? ''\)/.test(update),
    "writing geometry.symbol changed something nothing reads",
  );
}

/* ============================================================
 * THE PROMPT COMES AFTER THE GEOMETRY
 * ============================================================ */

console.log("\n  the prompt is asked AFTER geometry selection, via the SHARED popup\n");

{
  const tool = require("fs").readFileSync(
    modulePath("dimension-tool.js"),
    "utf8",
  );

  check(
    "a Variable Dimension opens a prompt instead of committing",
    /activeTool ===\s*\n\s*"variable-dimension"[\s\S]{0,200}openVariablePrompt\(/.test(
      tool,
    ),
    "committing without asking puts a name the student never chose on the sheet",
  );

  check(
    "and it is asked BEFORE the calibration gate, because a variable measures nothing",
    (() => {
      const variableAt = tool.indexOf('"variable-dimension"');
      const calibrationAt = tool.indexOf("isCalibrated");

      return variableAt > 0 && calibrationAt > 0 && variableAt < calibrationAt;
    })(),
    "a variable must not be the tool that sets the drawing's scale",
  );

  check(
    "and the prompt is the EXISTING shared value popup",
    /openLoadValuePopup\(\{/.test(tool) &&
      /from "\.\.\/ui\/editors\/load-value-popup\.js"/.test(tool),
    "a bespoke dialog would be a second thing to learn for the same act",
  );

  check(
    "opened in expression mode, so a symbol or expression is accepted",
    /expression: true/.test(tool),
  );

  check(
    "nothing is created until the answer arrives",
    (() => {
      const at = tool.indexOf("function openVariablePrompt(");
      const body = tool.slice(at, at + 2000);

      /* The factory call is inside onConfirm, not before the popup opens. */
      const popupAt = body.indexOf("openLoadValuePopup({");
      const factoryAt = body.indexOf('"variable-dimension"');

      return popupAt >= 0 && factoryAt > popupAt;
    })(),
  );
}

/* ============================================================
 * THE EXPRESSION OPTION IS OPT-IN
 * ============================================================ */

console.log("\n  and existing numeric popups are untouched\n");

{
  const popup = require("fs").readFileSync(
    modulePath("load-value-popup.js"),
    "utf8",
  );

  check(
    "expression mode is a flag, off by default",
    /expression = false/.test(popup),
    "a load magnitude and a force must still require a number",
  );

  check(
    "the numeric reading is still the default path",
    /const read = enggLoadProfile\.readLoadValue\(/.test(popup),
  );

  check(
    "and the unit control is only skipped IN EXPRESSION MODE",
    /expression\s*\n\s*\? ""\s*\n\s*: `<select/.test(popup),
    "an unknown quantity has no unit until the student gives it one",
  );
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
