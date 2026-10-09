/*
 * ========================================================
 * BEAM-LENGTH SCALING: WHAT ACTUALLY EXISTS
 * ========================================================
 *
 * The report was "I cannot find an option to scale beam lengths independently of
 * Vector Scale". The audit answer is that NO SUCH CONTROL EXISTS, and that is
 * the DESIGN rather than a missing feature - but it is worth writing down
 * because the absence is easy to mistake for a gap.
 *
 * THERE ARE TWO SCALES IN DAETUM, and only two:
 *
 *   THE UNIVERSAL LENGTH SCALE  (per sheet, `state.scale`)
 *     Says what a stored drawing unit is WORTH in real units. It is what turns
 *     a stored span into "3000 mm" in the Features panel and on a dimension.
 *     It does NOT change how large anything is drawn.
 *
 *   THE VECTOR DISPLAY SCALE    (per sheet, `state.statics.vectorScale`)
 *     Says how large a FORCE or LOAD ARROW is drawn. It changes no magnitude
 *     and no geometry.
 *
 * A BEAM'S DRAWN LENGTH IS NEITHER OF THOSE. It is its stored world length,
 * projected to the screen by the camera:
 *
 *     drawn pixels = world units x BASE_PIXELS_PER_UNIT x camera.zoom
 *
 * with `BASE_PIXELS_PER_UNIT` a constant. So a beam is drawn at its own size,
 * and the two scales above are independent of it and of each other - which is
 * exactly the separation the report asks for.
 *
 * CHANGING A BEAM'S ENGINEERING LENGTH is a different act again: it edits the
 * geometry (the Length field, or an associative dimension). That is a change to
 * the THING, not to how it is displayed - which is why it is not called a scale.
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

for (const name of [
  "quantities.js",
  "dimensions.js",
  "measurement-core.js",
  "annotation-model.js",
  "load-profile.js",
  "body-frames.js",
  "feature-geometry.js",
  "drawing-state.js",
]) {
  require(modulePath(name));
}

const state = require(modulePath("drawing-state.js")).default;
const scale = require(modulePath("dimensions.js")).default;
const profile = require(modulePath("load-profile.js")).default;

const F = state.geometryFactories;

console.log("\n  a beam's drawn size comes from world units and the CAMERA\n");

{
  const st = state.createDrawingState();

  const beam = F.beam({ x: 0, y: 0 }, { x: 240, y: 0 });
  state.addObject(st, beam);

  /* The projection every feature is drawn through. */
  const bounds = { width: 800, height: 600 };

  const screenStart = state.engineeringToScreen(
    beam.geometry.start,
    bounds,
    st,
  );
  const screenEnd = state.engineeringToScreen(beam.geometry.end, bounds, st);

  const drawnPixels = Math.abs(screenEnd.x - screenStart.x);

  check(
    "a 240-unit beam is drawn at 240 x BASE_PIXELS_PER_UNIT",
    Math.abs(drawnPixels - 240 * state.BASE_PIXELS_PER_UNIT) < 1e-9,
    `drew ${drawnPixels}px, expected ${240 * state.BASE_PIXELS_PER_UNIT}`,
  );

  check(
    "BASE_PIXELS_PER_UNIT is a fixed constant",
    state.BASE_PIXELS_PER_UNIT === 2.4,
    String(state.BASE_PIXELS_PER_UNIT),
  );
}

console.log("\n  the LENGTH SCALE changes the reported size, not the drawn one\n");

{
  const before = state.createDrawingState();
  const after = state.createDrawingState();

  const make = (st) => {
    const beam = F.beam({ x: 0, y: 0 }, { x: 240, y: 0 });
    state.addObject(st, beam);
    return beam;
  };

  const a = make(before);
  const b = make(after);

  const bounds = { width: 800, height: 600 };

  /* Calibrate ONE of them differently: 1 unit = 1 mm vs 1 unit = 10 mm. */
  scale.calibrate(before, 240, 240, "mm");
  scale.calibrate(after, 240, 2400, "mm");

  const drawnA = Math.abs(
    state.engineeringToScreen(a.geometry.end, bounds, before).x -
      state.engineeringToScreen(a.geometry.start, bounds, before).x,
  );

  const drawnB = Math.abs(
    state.engineeringToScreen(b.geometry.end, bounds, after).x -
      state.engineeringToScreen(b.geometry.start, bounds, after).x,
  );

  check(
    "two sheets calibrated ten-fold differently draw the beam the SAME size",
    Math.abs(drawnA - drawnB) < 1e-9,
    `${drawnA}px vs ${drawnB}px`,
  );

  /* But they REPORT it differently, which is the whole job of the scale. */
  const reportedA = scale.toEngineering(before, 240).value;
  const reportedB = scale.toEngineering(after, 240).value;

  check(
    "while the REPORTED length follows the scale",
    Math.abs(reportedA - 240) < 1e-9 && Math.abs(reportedB - 2400) < 1e-9,
    `${reportedA} vs ${reportedB}`,
  );
}

console.log("\n  Vector Scale changes ARROWS, never a beam\n");

{
  const st = state.createDrawingState();

  const beam = F.beam({ x: 0, y: 0 }, { x: 240, y: 0 });
  const force = F.forceFromMagnitude({ x: 0, y: 0 }, 100, 0, {});

  state.addObject(st, beam);
  state.addObject(st, force);

  const bounds = { width: 800, height: 600 };

  const beamDrawn = () =>
    Math.abs(
      state.engineeringToScreen(beam.geometry.end, bounds, st).x -
        state.engineeringToScreen(beam.geometry.start, bounds, st).x,
    );

  const beforeBeam = beamDrawn();

  st.statics = { ...(st.statics || {}), vectorScale: 4 };

  check(
    "turning Vector Scale up to 4x does NOT resize the beam",
    Math.abs(beamDrawn() - beforeBeam) < 1e-9,
    `${beamDrawn()}px vs ${beforeBeam}px`,
  );

  check(
    "and it does not change a force's MAGNITUDE either",
    force.geometry.magnitude === 100,
    String(force.geometry.magnitude),
  );

  /* The arrow's drawn length IS what it changes. */
  const axis1 = profile.drawnForceAxis(st, force.geometry);

  const len1 = Math.hypot(axis1.head.x - axis1.tail.x, axis1.head.y - axis1.tail.y);

  st.statics.vectorScale = 8;

  const axis2 = profile.drawnForceAxis(st, force.geometry);

  const len2 = Math.hypot(axis2.head.x - axis2.tail.x, axis2.head.y - axis2.tail.y);

  check(
    "but the ARROW is drawn twice as long",
    Math.abs(len2 / len1 - 2) < 1e-9,
    `${len1} -> ${len2}`,
  );
}

console.log("\n  changing a beam's ENGINEERING length is a geometry edit\n");

{
  /*
   * THE LIVE EDITOR STATE, not a private one.
   *
   * `updateFeatureProperty` converts millimetres to world units through the
   * EDITOR's sheet - the one the panel and the popup both write to - so a test
   * that hands it a different drawing would be measuring the conversion against
   * an uncalibrated sheet and reading back a number ten times too large. That is
   * a property of the harness, not of the app.
   */
  const editorState = require(modulePath("editor-state.js"));
  const st = editorState.drawingState;

  st.objects = [];
  st.scale = null;

  const beam = F.beam({ x: 0, y: 0 }, { x: 240, y: 0 });
  state.addObject(st, beam);

  /* 1 world unit = 10 mm, so a 240-unit beam is really 2400 mm. */
  scale.calibrate(st, 240, 2400, "mm");

  const update = require(modulePath("property-update.js"));

  /* Type 4800 mm: twice the beam, so it should become 480 world units. */
  const applied = update.updateFeatureProperty(beam, "length", 4800);

  check("the Length edit is accepted", applied === true);

  const drawnWorld = Math.hypot(
    beam.geometry.end.x - beam.geometry.start.x,
    beam.geometry.end.y - beam.geometry.start.y,
  );

  check(
    "and it changed the GEOMETRY - 4800 mm became 480 world units",
    Math.abs(drawnWorld - 480) < 1e-9,
    `world length = ${drawnWorld}`,
  );

  check(
    "which then REPORTS back as the value that was typed",
    Math.abs(scale.toEngineering(st, drawnWorld).value - 4800) < 1e-9,
    String(scale.toEngineering(st, drawnWorld).value),
  );

  /*
   * AND THE VECTOR SCALE IS UNTOUCHED BY ANY OF IT.
   */
  st.statics = { ...(st.statics || {}), vectorScale: 2 };

  update.updateFeatureProperty(beam, "length", 1000);

  check(
    "resizing a beam leaves the VECTOR scale alone",
    st.statics.vectorScale === 2,
    String(st.statics.vectorScale),
  );
}

console.log("\n  the two scales are stored apart, so they cannot interfere\n");

{
  const st = state.createDrawingState();

  check(
    "the length scale lives on `state.scale`",
    st.scale === null || typeof st.scale === "object",
  );

  check(
    "and the vector scale on `state.statics`",
    "vectorScale" in (st.statics || {}) ||
      typeof st.statics === "object",
  );

  check(
    "reading one cannot alter the other",
    (() => {
      const probe = state.createDrawingState();

      probe.statics = { ...(probe.statics || {}), vectorScale: 10 };
      scale.calibrate(probe, 100, 5000, "mm");

      return (
        probe.statics.vectorScale === 10 &&
        Math.abs(probe.scale.mmPerUnit - 50) < 1e-9
      );
    })(),
  );
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
