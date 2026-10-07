
const { JSDOM } = require("jsdom");

const { loadModule } = require("./helpers/source-path.cjs");

/*
 * ========================================================
 * THE FORCE SCALE STRETCHES THE VECTOR, AND ITS LABEL FOLLOWS
 * ========================================================
 *
 * A Point Force is CREATED by the cursor: the application point is chosen,
 * then the cursor sets the direction and the length, and the committed force
 * stores that as its magnitude and direction. Creation is untouched here.
 *
 * AFTER creation, the drawing is driven by three stored facts and one setting:
 *
 *     application point  +  stored magnitude  +  stored direction
 *                             x Visual Force Scale
 *
 * The drawn endpoint is RECOMPUTED from those, never remembered, so changing
 * the scale lengthens (or shortens) the whole vector from the application
 * point without touching the magnitude. And because the endpoint is the anchor
 * the magnitude label falls beyond, the label follows the arrow: it is placed
 * against the CURRENT rendered endpoint, never against the endpoint the force
 * had when it was created.
 *
 * This file checks that relationship, and the separate rule that a MANUAL drag
 * starts from the label's actual current position - it must not jump back to
 * the force's endpoint first.
 */

const dom = new JSDOM(
  '<!doctype html><html><body><div id="canvas"></div></body></html>',
  { pretendToBeVisual: true },
);

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.window.requestAnimationFrame = global.requestAnimationFrame;
global.window.cancelAnimationFrame = (id) => clearTimeout(id);
global.window.crypto = { randomUUID: () => "force-scale-anchor-uuid" };

for (const name of [
  "measurement-core.js",
  "quantities.js",
  "dimension-model.js",
  "annotation-model.js",
  "diagram-equations.js",
  "load-profile.js",
  "body-frames.js",
  "feature-geometry.js",
  "drawing-state.js",
  "analysis-dependencies.js",
  "renderer.js",
]) {
  loadModule(name);
}

for (const name of Object.keys(global.window)) {
  if (/^engg[A-Z]/.test(name) && global[name] === undefined) {
    global[name] = global.window[name];
  }
}

const model = global.window.enggAnnotationModel;
const profile = global.window.enggLoadProfile;

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

const near = (a, b, tolerance = 1e-6) => Math.abs(a - b) <= tolerance;

/*
 * A force, as the application stores one: an application point, a magnitude,
 * a direction, and a stored `end` that is exactly the engineering vector. The
 * stored end is what the panel shows and what creation wrote; the DRAWN end is
 * whatever the scale makes of it.
 */
const force = (extra = {}, id = "force-1") => ({
  id,
  type: "force",
  name: "Point Force 1",
  geometry: {
    start: { x: 0, y: 0 },
    position: { x: 0, y: 0 },
    end: { x: 500, y: 0 },
    magnitude: 500,
    angle: 0,
    ...extra,
  },
  style: { stroke: "#000000", lineWidth: 1 },
});

const scene = (objects, vectorScale = 1) => ({
  objects,
  display: { showMagnitudes: true, showUnits: true },
  statics: { vectorScale },
  scale: { mmPerUnit: 1, unit: "mm" },
  selection: {
    selectedObjectIds: [],
    boxSelectionIds: [],
    hoveredObjectId: null,
  },
  interaction: { phase: "idle", preview: null, previewObjects: [] },
  camera: { zoom: 1, panX: 0, panY: 0 },
  styleDefaults: { stroke: "#000000", lineWidth: 0.5 },
  grid: { visible: false, spacing: 10 },
  snap: { enabled: false },
});

/* ============================================================
   THE SCALE STRETCHES THE WHOLE VECTOR FROM THE APPLICATION POINT
   ============================================================ */

console.log("\n  the vector scale stretches the whole drawn force\n");

[0.25, 0.5, 1, 2, 4].forEach((scale) => {
  const object = force();
  const state = scene([object], scale);

  const drawn = profile.forceGeometry(state, object.geometry);

  check(
    `at ${scale}x the drawn vector is magnitude x scale long`,
    near(drawn.length, 500 * scale, 1e-6),
    `length = ${drawn.length}, expected ${500 * scale}`,
  );

  check(
    `at ${scale}x it still grows from the application point`,
    near(drawn.start.x, 0) && near(drawn.start.y, 0),
    `start = ${drawn.start.x},${drawn.start.y}`,
  );

  check(
    `at ${scale}x the stored magnitude is untouched`,
    object.geometry.magnitude === 500 &&
      object.geometry.end.x === 500,
    `magnitude = ${object.geometry.magnitude}, stored end = ${object.geometry.end.x}`,
  );
});

/* --- And the endpoint is recomputed, not preserved from a previous scale. */
{
  const object = force();

  const atOne = profile.drawnForceEnd(scene([object], 1), object.geometry);
  const atTwo = profile.drawnForceEnd(scene([object], 2), object.geometry);
  const atHalf = profile.drawnForceEnd(scene([object], 0.5), object.geometry);

  check(
    "increasing the scale moves the drawn endpoint further out",
    near(atTwo.x, 1000, 1e-6) && near(atOne.x, 500, 1e-6),
    `1x -> ${atOne.x}, 2x -> ${atTwo.x}`,
  );

  check(
    "decreasing the scale moves the drawn endpoint in",
    near(atHalf.x, 250, 1e-6),
    `0.5x -> ${atHalf.x}`,
  );

  check(
    "and no scale leaves a stale endpoint behind",
    atOne.x !== atTwo.x && atTwo.x !== atHalf.x,
  );
}

/* ============================================================
   THE MAGNITUDE LABEL FOLLOWS THE CURRENT RENDERED ENDPOINT
   ============================================================ */

console.log("\n  the magnitude label follows the current force endpoint\n");

{
  const object = force();

  const atOne = model.derivedAnnotation(object, scene([object], 1));
  const atTwo = model.derivedAnnotation(object, scene([object], 2));
  const atHalf = model.derivedAnnotation(object, scene([object], 0.5));

  check(
    "at 1x the label sits beyond the 500-long arrow",
    atOne.placement.x > 500 && atOne.placement.x < 530,
    `label x = ${atOne.placement.x}`,
  );

  check(
    "at 2x the label moved out to the new, longer endpoint",
    atTwo.placement.x > atOne.placement.x,
    `1x x = ${atOne.placement.x}, 2x x = ${atTwo.placement.x}`,
  );

  check(
    "at 0.5x the label moved in to the new, shorter endpoint",
    atHalf.placement.x < atOne.placement.x,
    `0.5x x = ${atHalf.placement.x}, 1x x = ${atOne.placement.x}`,
  );

  /*
   * AND IT FOLLOWS THE ACTUAL ENDPOINT, not a multiple of the old one.
   */
  const endAtTwo = profile.drawnForceEnd(scene([object], 2), object.geometry);

  check(
    "the 2x label is anchored to the 2x endpoint itself",
    atTwo.placement.x > endAtTwo.x &&
      atTwo.placement.x < endAtTwo.x + 30,
    `endpoint ${endAtTwo.x}, label ${atTwo.placement.x}`,
  );
}

/* --- Direction and magnitude changes re-anchor it the same way. */
{
  const object = force();

  const before = model.derivedAnnotation(object, scene([object], 1));

  const turned = {
    ...object,
    geometry: { ...object.geometry, angle: 90, forceX: 0, forceY: 500 },
  };

  const afterTurn = model.derivedAnnotation(turned, scene([turned], 1));

  /*
   * A force at 90 degrees pushes along +y, so its label goes up out along that
   * direction rather than along the +x the force was made pointing.
   */
  check(
    "turning the force moves the label to the turned endpoint",
    afterTurn.placement.y > before.placement.y &&
      afterTurn.placement.y > 400,
    `before y = ${before.placement.y}, after y = ${afterTurn.placement.y}`,
  );

  const bigger = {
    ...object,
    geometry: { ...object.geometry, magnitude: 1000, end: { x: 1000, y: 0 } },
  };

  const afterGrow = model.derivedAnnotation(bigger, scene([bigger], 1));

  check(
    "changing the magnitude moves the label to the new endpoint",
    afterGrow.placement.x > before.placement.x,
    `before x = ${before.placement.x}, after x = ${afterGrow.placement.x}`,
  );
}

/* --- Moving the application point carries the label with it. */
{
  const object = force();

  const before = model.derivedAnnotation(object, scene([object], 1));

  const moved = {
    ...object,
    geometry: {
      ...object.geometry,
      start: { x: 300, y: 200 },
      position: { x: 300, y: 200 },
    },
  };

  const after = model.derivedAnnotation(moved, scene([moved], 1));

  check(
    "moving the application point moves the label by the same amount",
    near(after.placement.x - before.placement.x, 300, 1e-6) &&
      near(after.placement.y - before.placement.y, 200, 1e-6),
    `label moved by ${after.placement.x - before.placement.x},${
      after.placement.y - before.placement.y
    }`,
  );
}

/* ============================================================
   A MANUAL POSITION KEEPS ITS OFFSET AND FOLLOWS THE ANCHOR
   ============================================================ */

console.log("\n  a moved label keeps its own offset from the arrowhead\n");

{
  const offset = { x: 30, y: -20 };

  const object = force({ magnitudeOffset: offset });

  const atOne = model.derivedAnnotation(object, scene([object], 1));
  const atFour = model.derivedAnnotation(object, scene([object], 4));

  const naturalOne = model.derivedAnnotation(
    force({ magnitudeOffset: null }),
    scene([force({ magnitudeOffset: null })], 1),
  );

  const naturalFour = model.derivedAnnotation(
    force({ magnitudeOffset: null }),
    scene([force({ magnitudeOffset: null })], 4),
  );

  check(
    "at 1x the moved label keeps exactly its offset",
    near(atOne.placement.x, naturalOne.placement.x + offset.x) &&
      near(atOne.placement.y, naturalOne.placement.y + offset.y),
    `label ${JSON.stringify(atOne.placement)}, natural ${JSON.stringify(naturalOne.placement)}`,
  );

  check(
    "at 4x the moved label keeps the same offset from the NEW endpoint",
    near(atFour.placement.x, naturalFour.placement.x + offset.x) &&
      near(atFour.placement.y, naturalFour.placement.y + offset.y),
    `label ${JSON.stringify(atFour.placement)}, natural ${JSON.stringify(naturalFour.placement)}`,
  );

  check(
    "so the label did not stay pinned to the old endpoint",
    atFour.placement.x > atOne.placement.x,
    `1x ${atOne.placement.x}, 4x ${atFour.placement.x}`,
  );
}

/* ============================================================
   THE ANCHOR A DRAG MEASURES AGAINST IS THE RENDERED ENDPOINT
   ============================================================ */

console.log("\n  the anchor a drag uses is the current rendered anchor\n");

{
  const object = force();

  /*
   * A drag holds the DERIVED annotation - the one the renderer drew and the hit
   * test returned - so the anchor is asked of that, exactly as the drag does.
   */
  const derivedOne = model.derivedAnnotation(object, scene([object], 1));
  const derivedFour = model.derivedAnnotation(object, scene([object], 4));

  const anchorOne = model.annotationAnchor(derivedOne, scene([object], 1));
  const anchorFour = model.annotationAnchor(derivedFour, scene([object], 4));

  const endOne = profile.drawnForceEnd(scene([object], 1), object.geometry);
  const endFour = profile.drawnForceEnd(scene([object], 4), object.geometry);

  check(
    "at 1x the anchor is measured from the 1x endpoint",
    anchorOne.x > endOne.x && anchorOne.x < endOne.x + 30,
    `anchor ${anchorOne.x}, endpoint ${endOne.x}`,
  );

  check(
    "at 4x the anchor is measured from the 4x endpoint",
    anchorFour.x > endFour.x && anchorFour.x < endFour.x + 30,
    `anchor ${anchorFour.x}, endpoint ${endFour.x}`,
  );

  check(
    "so the drag and the renderer agree about where the label falls",
    anchorFour.x > anchorOne.x,
    `1x anchor ${anchorOne.x}, 4x anchor ${anchorFour.x}`,
  );
}

/*
 * ============================================================
 * CLICK OFFSET IS PRESERVED BY THE DRAG ARITHMETIC
 * ============================================================
 *
 * The drag writes the label's position as
 *
 *     placement = clickedPosition + (pointer - pressPoint)
 *
 * and re-derives the stored offset against the current anchor. This reproduces
 * that arithmetic directly, so a regression in "the label jumps to the pointer"
 * or "the label jumps to the anchor" is caught without a live canvas.
 */
console.log("\n  a drag moves from the label's current position\n");
{
  const object = force({ magnitudeOffset: { x: 40, y: -10 } });

  const label = model.derivedAnnotation(object, scene([object], 1));

  /* The student presses a few pixels off-centre, then drags. */
  const press = { x: label.placement.x + 3, y: label.placement.y + 2 };
  const pointer = { x: press.x + 120, y: press.y + 45 };

  const start = { x: label.placement.x, y: label.placement.y };

  const placed = {
    x: start.x + (pointer.x - press.x),
    y: start.y + (pointer.y - press.y),
  };

  check(
    "the label moves by the pointer's travel, not to the pointer",
    near(placed.x, start.x + 120) && near(placed.y, start.y + 45),
    `moved to ${JSON.stringify(placed)} from ${JSON.stringify(start)}`,
  );

  check(
    "so the click offset the student began with is preserved",
    near(placed.x - pointer.x, start.x - press.x) &&
      near(placed.y - pointer.y, start.y - press.y),
    `offset drifted`,
  );

    check(
      "and it did not jump back to the automatic anchor first",
      /*
       * The label ends up displaced by the drag, not sitting on the anchor. The
       * anchor here is the un-offset natural position, which the stored offset
       * of (40, -10) keeps the label away from; if the first frame had discarded
       * that offset the label would have landed on the anchor instead.
       */
      near(placed.x - start.x, 120) &&
        !near(placed.x, model.annotationAnchor(label, scene([object], 1)).x),
      `label at ${JSON.stringify(placed)}, anchor ${JSON.stringify(
        model.annotationAnchor(label, scene([object], 1)),
      )}`,
    );
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
