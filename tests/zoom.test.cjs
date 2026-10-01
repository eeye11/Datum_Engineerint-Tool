/*
 * The zoom sanitiser, tested directly.
 *
 * Zoom is the one number in the application that every path can change
 * - the buttons, the wheel, the typed field, Fit, and the viewport a
 * sheet is restored with - and all of them are meant to agree. The
 * agreement is worth a test of its own, because it failed once in a way
 * nothing else noticed: the sanitiser rounded the stored FACTOR instead
 * of the displayed percentage, which quietly made every zoom between
 * 25% and 500% unreachable and made the zoom buttons do nothing at all.
 */
global.window = {};
require("../js/engineering-drawing/drawing-state.js");
const state = global.window.enggDrawingState;

let pass = 0;
let fail = 0;
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    fail += 1;
    console.log(
      `  FAIL ${name}\n       expected ${JSON.stringify(expected)}` +
        `\n       actual   ${JSON.stringify(actual)}`
    );
  }
};

const document_ = () => state.createDrawingState();
const zoomTo = (factor) => {
  const s = document_();
  state.setCameraZoom(s, factor);
  return s.camera.zoom;
};

console.log("\nWhole percentages");
check("100% stays 100%", zoomTo(1), 1);
check("150% stays 150%", zoomTo(1.5), 1.5);
check("50% stays 50%", zoomTo(0.5), 0.5);
check("200% stays 200%", zoomTo(2), 2);
check("80% stays 80%", zoomTo(0.8), 0.8);
check("125% stays 125%", zoomTo(1.25), 1.25);

console.log("\nEvery step is reachable");
/*
 * The whole reason the defect was invisible: 150% is a value a person
 * types and a percentage a button displays, and it must be the zoom.
 */
const stepped = [];
for (let percent = 25; percent <= 500; percent += 10) {
  stepped.push(zoomTo(percent / 100));
}
check(
  "no step collapses onto another",
  new Set(stepped.map((v) => Math.round(v * 100))).size,
  stepped.length
);
check("and they arrive exactly", zoomTo(1.3), 1.3);

console.log("\nNo floating point artefacts");
check("100.0000001%", zoomTo(1.00000001), 1);
check("149.999999%", zoomTo(1.49999999), 1.5);
check("199.9999998%", zoomTo(1.99999998), 2);
check(
  "and none are what is displayed",
  Math.round(zoomTo(1.00000001) * 100),
  100
);

console.log("\nClamping");
check("below 25% is clamped", zoomTo(0.01), 0.25);
check("above 500% is clamped", zoomTo(99), 5);
check("exactly 25% is allowed", zoomTo(0.25), 0.25);
check("exactly 500% is allowed", zoomTo(5), 5);

console.log("\nNonsense");
check("undefined falls back to 100%", zoomTo(undefined), 1);
check("not a number falls back to 100%", zoomTo("wide"), 1);
check("NaN falls back to 100%", zoomTo(NaN), 1);

/*
 * Zero and a negative zoom are not nonsense, they are out of range:
 * they clamp to the nearest allowed zoom rather than to the default.
 * A zoom of zero would collapse the drawing to a point, and a negative
 * one would mirror it, so both are pulled to the smallest zoom anyone
 * can actually work at.
 */
check("zero clamps to the minimum", zoomTo(0), 0.25);
check("negative clamps to the minimum", zoomTo(-3), 0.25);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
