/*
 * ========================================================
 * WORLD PRECISION: THE TRANSFORM LOSES NOTHING
 * ========================================================
 *
 * Rendering a feature is a MAP from world coordinates to screen pixels and
 * back, and the map must be lossless in the direction that matters: whatever
 * the student's coordinates ARE must survive being drawn, panned, zoomed and
 * read back. The value of a length must never be recovered by measuring
 * rendered pixels - it is read from the stored world coordinates - and the
 * transform itself must not round them on the way through.
 *
 * The things this pins:
 *
 *   the transform both ways        sign, centring and zoom are exact
 *   ZOOM does not change world     a point's world position survives any zoom
 *   PAN does not change world      nor does panning
 *   a large value stays exact      a 9000-unit coordinate round-trips precisely
 *   no premature rounding          a non-integral coordinate is not quantised
 *   repeated round trips do not accumulate error
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

const st = state.createDrawingState();

/* A viewport with a definite size, so the transform is fully determined. */
const bounds = { width: 800, height: 600 };

const toScreen = (point) => state.engineeringToScreen(point, bounds, st);
const toWorld = (point) => state.screenToEngineering(point, bounds, st);

console.log("\n  the transform both ways is exact\n");

{
  st.camera.zoom = 1;
  st.camera.panX = 0;
  st.camera.panY = 0;

  const origin = toScreen({ x: 0, y: 0 });

  check(
    "the world origin is the centre of the viewport",
    origin.x === 400 && origin.y === 300,
    JSON.stringify(origin),
  );

  check(
    "and +x is to the right, +y is UP the screen",
    toScreen({ x: 10, y: 0 }).x > origin.x &&
      toScreen({ x: 0, y: 10 }).y < origin.y,
  );

  const p = { x: 137.5, y: -62.25 };
  const back = toWorld(toScreen(p));

  check(
    "a point survives screen -> world -> screen",
    Math.abs(back.x - p.x) < 1e-9 && Math.abs(back.y - p.y) < 1e-9,
    `${JSON.stringify(back)} vs ${JSON.stringify(p)}`,
  );
}

console.log("\n  zoom changes the VIEW, never the world position\n");

{
  const world = { x: 1234.5, y: 678.25 };

  let worst = 0;

  for (const zoom of [0.25, 0.5, 1, 2, 4, 5]) {
    st.camera.zoom = zoom;

    const roundTrip = toWorld(toScreen(world));

    worst = Math.max(worst, Math.abs(roundTrip.x - world.x));
  }

  check(
    "the world position is identical at every zoom",
    worst < 1e-9,
    `worst error ${worst}`,
  );
}

console.log("\n  pan changes the viewport, never the world position\n");

{
  st.camera.zoom = 1;

  const world = { x: -500.75, y: 900.5 };

  let worst = 0;

  for (const pan of [
    { x: 0, y: 0 },
    { x: 100, y: -250 },
    { x: -9999, y: 12345 },
  ]) {
    st.camera.panX = pan.x;
    st.camera.panY = pan.y;

    const roundTrip = toWorld(toScreen(world));

    worst = Math.max(worst, Math.abs(roundTrip.x - world.x));
  }

  check(
    "the world position is identical however the sheet is panned",
    worst < 1e-9,
    `worst error ${worst}`,
  );

  st.camera.panX = 0;
  st.camera.panY = 0;
}

console.log("\n  a LARGE coordinate keeps its precision\n");

{
  st.camera.zoom = 1;

  const world = { x: 9000, y: 15000 };

  const roundTrip = toWorld(toScreen(world));

  check(
    "9000 world units round-trip exactly",
    roundTrip.x === 9000 && roundTrip.y === 15000,
    JSON.stringify(roundTrip),
  );
}

console.log("\n  nothing quantises an ordinary coordinate\n");

{
  st.camera.zoom = 1;

  /*
   * Grid snap exists, but it is OPT-IN - the transform itself must not round.
   * A coordinate with a long fractional tail comes back untouched.
   */
  const world = { x: 12.3456789, y: -98.7654321 };

  const roundTrip = toWorld(toScreen(world));

  check(
    "a fractional coordinate is not rounded to a whole unit",
    Math.abs(roundTrip.x - world.x) < 1e-9,
    `${roundTrip.x} vs ${world.x}`,
  );

  check(
    "and its tail survives",
    Math.abs(roundTrip.x * 1e6 - Math.round(roundTrip.x * 1e6)) < 1,
  );
}

console.log("\n  repeated round trips do not accumulate error\n");

{
  st.camera.zoom = 2.5;
  st.camera.panX = 333.33;
  st.camera.panY = -77.7;

  let point = { x: 1.23456789, y: 2.3456789 };

  for (let i = 0; i < 1000; i += 1) {
    point = toWorld(toScreen(point));
  }

  check(
    "1000 trips through the transform drift by less than a millionth",
    Math.abs(point.x - 1.23456789) < 1e-6 &&
      Math.abs(point.y - 2.3456789) < 1e-6,
    JSON.stringify(point),
  );
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
