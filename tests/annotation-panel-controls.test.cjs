/*
 * ========================================================
 * ARE THE ANNOTATION CONTROLS CONNECTED TO ANYTHING?
 * ========================================================
 *
 * A switch that is not wired is worse than no switch. It looks like a control,
 * it sits under a heading that promises something, and clicking it does
 * nothing - so the student concludes the feature cannot show its magnitude,
 * which is a false conclusion about an engineering object.
 *
 * That is the specific risk here: the annotation model has supported
 * per-feature magnitude boxes all along, the panel now offers the switches,
 * and the only thing standing between them is that both halves actually read
 * the same field and write it back through the same channel.
 *
 * Three things have to line up, and each is checked below:
 *
 *   1. THE SECTION IS OFFERED ONLY WHERE IT MEANS SOMETHING. A beam has no
 *      magnitude to annotate, so it gets no ANNOTATION heading. Rendering one
 *      over nothing is the empty-section defect in a new place.
 *   2. THE CHECKBOX REFLECTS WHAT THE RENDERER WILL DO. Read through the
 *      model's predicate, not by inspecting the display state directly, or the
 *      panel and the sheet disagree whenever they are asked different
 *      questions.
 *   3. THE CLICK IS WRITTEN BACK AS A BOOLEAN AND AS ONE HISTORY ACTION. A
 *      string "false" written back reads as truthy next time and leaves the
 *      switch permanently on.
 */

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const { controllerSource, loadModule, locate, modulePath, sourceDir } = require("./helpers/source-path.cjs");
const dir = path.join(
  __dirname,
  "..",
  "src",
);

const code = controllerSource();

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
});

global.window = dom.window;
global.document = dom.window.document;

loadModule("property-panel.js");

const panels = global.window.enggPropertyPanel;

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

const section = (startMarker, endMarker) => {
  const start = code.indexOf(startMarker);

  if (start < 0) {
    return "";
  }

  const end = code.indexOf(endMarker, start + startMarker.length);

  return code.slice(start, end < 0 ? undefined : end);
};

console.log("\n  THE SECTION IS BUILT FROM THE SHARED MODULE\n");

const builder = section(
  "function annotationSectionMarkup(",
  "const MAGNITUDE_BEARING_TYPES",
);

check(
  "the annotation section exists",
  builder.length > 0,
);

check(
  "and is composed from the shared toggle, not hand-written",
  /panels\.toggle\(\{/.test(builder),
  "a hand-written checkbox will drift from every other switch in Datum",
);

check(
  "it is a section, so it can be omitted when empty",
  /panels\.section\(\s*"ANNOTATION"/.test(builder),
);

check(
  "and it renders nothing at all without the shared module",
  /if\s*\(\s*!panels\s*\)/.test(builder),
  "a fallback copy of these controls would drift from this one",
);

console.log("\n  AND ONLY FOR FEATURES THAT HAVE A MAGNITUDE\n");

check(
  "membership is asked of a list, not guessed per panel",
  /types\.has\(object\.type\)/.test(builder),
  "'does this feature have a magnitude' has to be answered once, consistently",
);

check(
  "a feature outside the list renders no section",
  builder.includes("return \"\";") &&
    !/if\s*\([\s\S]{0,200}types[\s\S]{0,200}\}\)\s*\{\s*rows\.push/.test(
      builder,
    ),
);

/*
 * The list is NOT written in the panel code. It is read from the annotation
 * model's own kind table, because that table is already the authority on which
 * feature types carry something worth annotating.
 *
 * That is not tidiness. The first version of this named "distributed-load"
 * and "applied-moment" while Datum's features are called "load" and
 * "moment" - so the section was offered to no feature at all, while looking
 * entirely plausible.
 */
const typeList = section(
  "const MAGNITUDE_BEARING_TYPES",
  "The Arc Radius row",
);

check(
  "the type list is read from the annotation model, not written here",
  /enggAnnotationModel/.test(typeList) &&
    /annotatableTypes\(\)/.test(typeList),
  "a second list of feature types is a second answer to a question the model already answers",
);

check(
  "and an absent model offers the section to nothing rather than guessing",
  /return new Set\(\);/.test(typeList),
  "with no model to ask, a guessed list would offer switches for features that cannot have one",
);

/*
 * And the set it produces has to be the real one. Read from the model rather
 * than from the panel source, because the panel's correctness depends on
 * this being right, not on it having been written down again.
 */
loadModule("annotation-model.js");

const annotatable = global.window.enggAnnotationModel
  .annotatableTypes();

[
  "force",
  "load",
  "varying-load",
  "moment",
  "couple",
  "resultant",
  "force-components",
  "pin-support",
  "roller-support",
  "fixed-support",
  "smooth-support",
].forEach(type => {
  check(
    `${type} is a feature that can carry an annotation`,
    annotatable.has(type),
    `${type} carries a value but is not in the model's kind table`,
  );
});

[
  "beam",
  "circle",
  "line",
  "analysis-diagram",
].forEach(type => {
  check(
    `${type} has nothing to annotate`,
    !annotatable.has(type),
    `${type} would be given a Show Magnitude switch that does nothing`,
  );
});

console.log("\n  THE CHECKBOX ASKS THE MODEL, NOT THE DISPLAY STATE\n");

check(
  "the shown state is read through the model's predicate",
  /magnitudeShownFor\(object,\s*state\)/.test(builder),
  "reading display.showMagnitudes directly would ignore the per-feature setting",
);

check(
  "and is not read straight off the feature's own field",
  !/on:\s*display\.showMagnitude\b/.test(builder),
  "the panel is reading the preference rather than asking whether a box shows",
);

console.log("\n  AND IT IS OFFERED WHERE IT APPLIES\n");

/*
 * Located by relative position rather than by one big slice: the Point Force
 * block ends where the moment branch begins, and the annotation call has to
 * be inside it. A marker that spans too far would find the call in a
 * neighbouring panel and pass regardless.
 */
const forcePanel = code.slice(
  code.indexOf("data-force-reverse-direction"),
  code.indexOf('} else if (object.type === "moment")'),
);

check(
  "the Point Force panel shows it",
  /annotationSectionMarkup\(\s*object,\s*MAGNITUDE_BEARING_TYPES\s*\)/.test(
    forcePanel,
  ),
  "the force is the commonest magnitude-bearing feature and has no switch",
);

check(
  "the load panel shows it",
  /annotationSectionMarkup\(\s*object,\s*MAGNITUDE_BEARING_TYPES\s*\)/.test(
    code,
  ),
  "a load carries an intensity and has no switch",
);

console.log("\n  AND A CLICK IS WRITTEN BACK PROPERLY\n");

const binding = section(
  "[data-feature-show-magnitude]",
  "THE UNIT SWITCH IS SHEET-WIDE",
);

check(
  "the magnitude switch is bound",
  binding.includes("addEventListener") &&
    binding.includes("change"),
  "the checkbox is not connected to anything",
);

check(
  "it writes a real boolean, not the checkbox's string",
  /showMagnitude:\s*input\.checked\s*===\s*true/.test(binding),
  'a stored "false" reads as truthy next time and leaves the switch stuck on',
);

check(
  "it writes onto the feature, where the model looks",
  /object\.annotationDisplay\s*=/.test(binding),
  "the preference is not stored where magnitudeShownFor reads it",
);

check(
  "and it preserves any sibling settings",
  /\.\.\.\(object\.annotationDisplay\s*\|\|\s*\{\}\)/.test(binding),
  "writing one setting is discarding the others on that holder",
);

check(
  "one click is one history action",
  /snapshotDrawing/.test(binding) &&
    /commitDrawingChange/.test(binding),
  "a switch that cannot be undone is a switch a student will not trust",
);

/*
 * The comment in the source explains WHY the panel is deliberately not
 * re-rendered here, and that comment mentions renderProperties() - so the
 * markup check has to ignore prose and look at whether the call is actually
 * made as a statement.
 *
 * The slice stops at the next handler - the property fields - because
 * the unit switch that used to follow the magnitude switch and bound
 * this block no longer exists.
 */
const magnitudeHandler = binding.slice(
  binding.lastIndexOf("input.addEventListener"),
  binding.indexOf("drawingProperties.querySelectorAll('[data-property]')"),
);

check(
  "the switch is not re-rendered under the pointer",
  !/^\s*renderProperties\(\);/m.test(magnitudeHandler),
  "rebuilding the panel mid-click can swallow the click and make the switch feel stuck",
);

check(
  "but the sheet is redrawn, which is what actually changed",
  /renderCurrentDrawing\(\)/.test(binding),
  "the checkbox moved but the sheet did not, so the switch appears inert",
);

console.log("\n  AND UNITS ARE NOT A CHOICE\n");

/*
 * THERE IS NO UNIT SWITCH ANY MORE.
 *
 * It used to be offered per feature, on the reasoning that the
 * annotation model might hide units. It never could - `unitSuffix`
 * takes the flag and ignores it - so the switch was a control that
 * changed nothing, which is worse than no control at all: it implied
 * a choice that did not exist.
 *
 * A magnitude without its unit is not the same quantity as one with
 * it. "100" and "100 N" are different statements, and on a diagram
 * where a force, a load intensity and a moment all sit side by side,
 * a reader who saw bare numbers would have no way to tell them apart.
 */
check(
  "no unit switch is rendered on any feature panel",
  !code.includes('label: "Show Unit"') &&
    !code.includes("data-feature-show-unit"),
  "a Show Unit toggle is still being built",
);

check(
  "and none is left wired up to do something",
  !/data-feature-show-unit[\s\S]{0,400}addEventListener/.test(code),
  "a dead handler for a removed control is still in the source",
);

console.log("\n  the shared module can actually build what is asked of it\n");

check(
  "one toggle and a heading render",
  panels
    .section("ANNOTATION", [
      panels.toggle({
        label: "Show Magnitude",
        attribute: "data-feature-show-magnitude",
        on: true,
      }),
    ])
    .includes("ANNOTATION"),
);

console.log(
  `\n${pass} passed, ${fail} failed`,
);

if (fail > 0) {
  process.exitCode = 1;
}
