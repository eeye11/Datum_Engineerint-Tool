/*
 * Loads the measurement, dimension, annotation and smart-dimension
 * modules, in the order their dependencies require.
 *
 * ORDER MATTERS HERE
 * ------------------
 * drawing-state now creates dimensions and annotations through these
 * models, so they must EXIST by the time it is used - though not by
 * the time it is parsed, which is why it reaches for them by name
 * rather than capturing them.
 *
 * The order among themselves is the reverse of what a reader might
 * expect, and deliberately so:
 *
 *     measurement-core   knows what features can be MEASURED
 *     dimension-model    measures geometry, so it needs the above
 *     annotation-model   reads feature values, so it needs the above
 *     smart-dimension    chooses what to measure, so it needs all three
 *
 * Each is written to tolerate the others being absent at load time
 * and to ask for them when used, so the ordering is a convenience
 * rather than a trap - but it is still the order that makes the whole
 * thing work on first paint.
 */
const fs = require("fs");

const path = "index.html";
let source = fs.readFileSync(path, "utf8");

const CRLF = source.includes("\r\n");

const marker =
  '<script src="js/engineering-drawing/drawing-state.js"></script>';

if (!source.includes(marker)) {
  console.log("drawing-state script tag not found");
  process.exit(1);
}

if (source.includes("measurement-core.js")) {
  console.log("already wired");
  process.exit(0);
}

const eol = (text) => (CRLF ? text.replace(/\n/g, "\r\n") : text);

const addition = [
  '    <script src="js/engineering-drawing/measurement-core.js"></script>',
  '    <script src="js/engineering-drawing/dimension-model.js"></script>',
  '    <script src="js/engineering-drawing/annotation-model.js"></script>',
  '    <script src="js/engineering-drawing/smart-dimension.js"></script>',
].join("\n");

const replacement = [
  "    <!--",
  "        Measurement, dimension, annotation and smart dimension.",
  "",
  "        Loaded before drawing-state CREATES anything, though not",
  "        before it parses: the factories reach for these by name, so",
  "        a module that is read too early simply is not found until it",
  "        is used. The order among them is the reverse of the reading",
  "        order - measurement first because it knows what a feature can",
  "        be measured as, and the models that need that judgement next.",
  "    -->",
  addition,
  marker,
].join("\n");

source = source.replace(marker, eol(replacement));

fs.writeFileSync(path, source);

console.log(`wired 4 modules (index.html is ${CRLF ? "CRLF" : "LF"})`);
