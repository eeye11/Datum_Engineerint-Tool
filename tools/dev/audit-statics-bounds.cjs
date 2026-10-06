/* Audit: does the shared drawable-bounds system know every Statics type? */
const { modulePath } = require("../../tests/helpers/source-path.cjs");

global.window = { crypto: { randomUUID: () => "audit-uuid" } };
require(modulePath("drawing-state.js"));
require(modulePath("dimensions.js"));
require(modulePath("measurement-core.js"));
require(modulePath("feature-geometry.js"));
require(modulePath("load-profile.js"));
require(modulePath("body-frames.js"));
require(modulePath("analysis-dependencies.js"));
require(modulePath("diagram-equations.js"));
require(modulePath("dimension-model.js"));
require(modulePath("annotation-model.js"));
require(modulePath("drawing-bounds.js"));

const bounds = global.window.enggDrawingBounds;
const state = global.window.enggDrawingState;
const f = state.geometryFactories;

const drawing = state.createDrawingState();

const make = {
  particle: () => f.particle({ x: 0, y: 0 }),
  "rigid-body": () => f["rigid-body"]({ x: 0, y: 0 }, 60, 30),
  beam: () => f.beam({ x: 0, y: 0 }, { x: 400, y: 0 }),
  truss: () => f.truss({ x: 0, y: 0 }, { x: 400, y: 0 }),
  cable: () => f.cable({ x: 0, y: 0 }, { x: 400, y: 0 }),
  shaft: () => f.shaft({ x: 0, y: 0 }, { x: 400, y: 0 }),
  force: () => f.force({ x: 0, y: 0 }, { x: 100, y: 0 }),
  load: () => f.load({ x: 0, y: 0 }, { x: 300, y: 0 }, 5),
  "varying-load": () =>
    f["varying-load"]({ x: 0, y: 0 }, { x: 300, y: 0 }, 5, 1),
  moment: () => f.moment({ x: 0, y: 0 }, 100, "CW"),
  couple: () => f.couple({ x: 0, y: 0 }, 100, 0, "CW"),
  "pin-support": () => f["pin-support"]({ x: 0, y: 0 }),
  "roller-support": () => f["roller-support"]({ x: 0, y: 0 }),
  "fixed-support": () => f["fixed-support"]({ x: 0, y: 0 }),
  "smooth-support": () => f["smooth-support"]({ x: 0, y: 0 }),
  "pin-connection": () => f["pin-connection"]({ x: 0, y: 0 }, { x: 60, y: 0 }),
  "fixed-connection": () =>
    f["fixed-connection"]({ x: 0, y: 0 }, { x: 60, y: 0 }),
  "slider-connection": () =>
    f["slider-connection"]({ x: 0, y: 0 }, { x: 60, y: 0 }),
  resultant: () => f.resultant({ x: 0, y: 0 }, { x: 30, y: 40 }),
  "force-components": () =>
    f["force-components"]({ x: 0, y: 0 }, { x: 0, y: -30 }),
  "coordinate-system-2d": () => f.coordinateSystem2D({ x: 0, y: 0 }),
};

const context = {
  state: drawing,
  zoom: 1,
  pixelsPerUnit: 40,
  dimensionFontSize: 12,
};

for (const [label, mk] of Object.entries(make)) {
  const object = mk();
  const b = bounds.getDrawableBounds(object, context);
  const stored = JSON.stringify(object.geometry);
  console.log(
    `${label.padEnd(20)} type=${String(object.type).padEnd(20)} valid=${Boolean(b && b.valid)} ${b && b.valid ? `[${b.minX.toFixed(1)},${b.minY.toFixed(1)} .. ${b.maxX.toFixed(1)},${b.maxY.toFixed(1)}]` : ""}`,
  );
}

/* The real diagram type the app creates. */
const diag = state.geometryFactories["shear-force-diagram"](
  { x: 0, y: 0 },
  { x: 400, y: 0 },
  {},
);
const db = bounds.getDrawableBounds(diag, context);
console.log(
  `\ndiagram type=${diag.type} valid=${Boolean(db && db.valid)} ${db ? `minY=${db.minY}` : ""}`,
);
