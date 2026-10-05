/*
 * Confirms the outline test actually catches the bug it claims to.
 *
 * The fix is one line - the envelope follows `drawn.far` unconditionally
 * instead of choosing between `drawn.application` and `drawn.far` on
 * `reversed`. A test that passes both before and after such a change is
 * measuring nothing, so the old line is put back and the test run again.
 *
 * Run from the project root:  node tools/verify-load-outline-fix.cjs
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const projectRoot = path.join(__dirname, "..");
const rendererPath = path.join(
  projectRoot,
  "js",
  "engineering-drawing",
  "renderer.js",
);

const original = fs.readFileSync(rendererPath, "utf8");

/* The fixed form, located by its opening line and its return. */
const buggyForm = `                ...samples.map(sample => {
                    const drawn = forceEndpoints(
                        toScreen(sample.base),
                        direction,
                        distributedLoadArrowLength(
                            sample.magnitude,
                            scale,
                            vectorScaleOf(state)
                        ),
                        normal
                    );

                    const tip = reversed
                        ? drawn.application
                        : drawn.far;

                    return \`\${tip.x},\${tip.y}\`;
                }),\n`;

/* The fixed block, located by its two ends. */
const startMarker = "...samples.map(sample => {";
const endMarker = "}),";

const start = original.indexOf(startMarker);

const end =
  original.indexOf(
    endMarker,
    original.indexOf("normal\n                    );", start),
  ) + endMarker.length;

if (start < 0 || end <= start) {
  console.log("could not find the envelope block");
  process.exit(1);
}

const patched = original.slice(0, start) + buggyForm + original.slice(end);

fs.writeFileSync(rendererPath, patched);

const run = () => {
  try {
    return execFileSync(
      process.execPath,
      [path.join(projectRoot, "tests", "load-outline.test.cjs")],
      { encoding: "utf8" },
    );
  } catch (error) {
    return error.stdout || "";
  } finally {
    fs.writeFileSync(rendererPath, original);
  }
};

const withBug = run();

console.log("\n  WITH THE OLD LINE PUT BACK:\n");

console.log(
  withBug
    .split("\n")
    .filter((line) => /FAIL|passed,/.test(line))
    .map((line) => "    " + line.trim())
    .join("\n"),
);

const afterFix = execFileSync(
  process.execPath,
  [path.join(projectRoot, "tests", "load-outline.test.cjs")],
  { encoding: "utf8" },
);

console.log("\n  RESTORED:\n");

console.log(
  afterFix
    .split("\n")
    .filter((line) => /FAIL|passed,/.test(line))
    .map((line) => "    " + line.trim())
    .join("\n"),
);

const caught = /FAIL/.test(withBug);

console.log(
  "\n  " +
    (caught
      ? "The test DOES catch it - it fails with the old line.\n"
      : "THE TEST DOES NOT CATCH IT, and proves nothing.\n"),
);
