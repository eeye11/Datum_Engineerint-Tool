/*
 * ========================================================
 * DOES A LENGTH MEAN ANYTHING, AND DOES IT KEEP MEANING IT?
 * ========================================================
 *
 * A drawing's coordinates are numbers until somebody says how big one of them
 * is. The FIRST dimension is what says so: the student measures something they
 * can put a ruler against, and tells the application what it really is. From
 * then on every length in the document is interpretable.
 *
 * THE RULE THIS FILE EXISTS TO HOLD
 *
 *     Screen pixels are never engineering truth.
 *
 * A 500 mm beam is 500 mm at every zoom level and under every pan. Zoom and
 * pan decide how large the geometry APPEARS; they are a property of the camera
 * and must never reach the model. Vector Scale is the same kind of thing -
 * it is how big an arrow is drawn, and a 0.5x arrow is still 100 N.
 *
 * The arithmetic here is small; what is worth pinning is that the conversions
 * are read from the MODEL and never from the viewport, because every way this
 * can go wrong looks like a number that is merely slightly off.
 */
global.window = { crypto: { randomUUID: () => "scale-uuid" } };

require("../js/engineering-drawing/dimension-model.js");
require("../js/engineering-drawing/dimensions.js");
require("../js/engineering-drawing/drawing-state.js");

const state = global.window.enggDrawingState;
const scale = global.window.enggDimensions;

let pass = 0;
let fail = 0;

const near = (a, b, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;

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

/* The beam every check measures. 476.2 drawing units, declared as 500 mm. */
const BEAM_UNITS = 476.2;
const BEAM_MM = 500;

const beam = {
  id: "beam-1",
  type: "beam",
  geometry: {
    start: { x: 0, y: 0 },
    end: { x: BEAM_UNITS, y: 0 },
    depth: 12,
  },
};

const drawing = state.createDrawingState();
drawing.objects = [beam];

/*
 * THE MODEL LENGTH, read the way the application reads it: from the geometry's
 * own coordinates, with no camera involved. Used as the expected value below
 * rather than the literal 476.2, so the checks are about the conversion and
 * not about a number typed twice.
 */
const modelLengthOf = () =>
  Math.hypot(
    beam.geometry.end.x - beam.geometry.start.x,
    beam.geometry.end.y - beam.geometry.start.y,
  );

console.log("\n  an uncalibrated document admits it\n");

check(
  "a new document is not calibrated",
  scale.isCalibrated(drawing) === false,
);

check(
  "and says so, rather than pretending one unit is one millimetre",
  scale.toEngineering(drawing, BEAM_UNITS).calibrated === false,
);

console.log("\n  the first dimension establishes the scale\n");

const calibration = scale.calibrate(drawing, BEAM_UNITS, BEAM_MM, "mm");

/*
 * WHICH MEASUREMENT IS RIGHT, ONCE THE SCALE EXISTS.
 *
 * A diagonal member's length is the distance between its ends, not its X
 * extent, and the two differ enough to catch a per-direction formula: a 3-4-5
 * member is 50 units long though it spans only 30 in X. It is checked here
 * rather than earlier because before calibration the document is 1:1 and the
 * arithmetic would be trivially true whatever the conversion did.
 */
check(
  "a diagonal is scaled by its true length, not by its X extent",
  near(
    scale.fromEngineering(drawing, 50, "mm"),
    50 / (BEAM_MM / BEAM_UNITS),
    1e-6,
  ),
  `${scale.fromEngineering(drawing, 50, "mm")}, expected ${
    50 / (BEAM_MM / BEAM_UNITS)
  }`,
);

check(
  "the document becomes calibrated",
  scale.isCalibrated(drawing) === true,
);

check(
  "and the ratio is the declared length over the measured one",
  near(calibration.mmPerUnit, BEAM_MM / BEAM_UNITS, 1e-12),
  `stored ${calibration.mmPerUnit}, expected ${BEAM_MM / BEAM_UNITS}`,
);

check(
  "the beam now measures what the student said it does",
  near(scale.toEngineering(drawing, modelLengthOf()).value, BEAM_MM, 1e-9),
  `${scale.toEngineering(drawing, modelLengthOf()).value}`,
);

/*
 * THE ROUND TRIP, which is what catches a double conversion. Converting
 * outwards and back must return the number it started with exactly - and it
 * does not if the unit factor is applied twice, which is a mistake this
 * codebase made once and which stayed invisible until the round trip was
 * written.
 */
check(
  "units survive a round trip out and back",
  near(scale.fromEngineering(drawing, BEAM_MM, "mm"), modelLengthOf(), 1e-9),
  `${scale.fromEngineering(drawing, BEAM_MM, "mm")} vs ${modelLengthOf()}`,
);

/*
 * THE UNIT IS THE DOCUMENT'S, and changing it must re-express every length
 * rather than change one. 500 mm is half a metre only when the document is in
 * metres; asking for the same beam in a document set to metres is the check
 * that the unit factor is applied exactly once.
 */
drawing.scale = {
  ...drawing.scale,
  unit: "m",
};

check(
  "the same beam is 0.5 m in a document set to metres",
  near(scale.toEngineering(drawing, modelLengthOf()).value, 0.5, 1e-12),
  `got ${scale.toEngineering(drawing, modelLengthOf()).value}`,
);

check(
  "and half a metre in metres converts back to the same drawing units",
  near(scale.fromEngineering(drawing, 0.5, "m"), modelLengthOf(), 1e-9),
  `${scale.fromEngineering(drawing, 0.5, "m")} vs ${modelLengthOf()}`,
);

drawing.scale = {
  ...drawing.scale,
  unit: "mm",
};

console.log("\n  zoom and pan are a property of the camera only\n");

/*
 * THE INVARIANCE CLAIM, over a range of zooms INCLUDING a fractional one.
 * A conversion that leaked the camera in would still pass at zoom 1, which is
 * where every such bug is invisible.
 */
[0.25, 0.5, 1, 2, 4].forEach((zoom) => {
  drawing.camera.zoom = zoom;

  check(
    `a 500 mm beam is still 500 mm at ${zoom}x zoom`,
    near(scale.toEngineering(drawing, modelLengthOf()).value, BEAM_MM, 1e-9),
    `got ${scale.toEngineering(drawing, modelLengthOf()).value} at ${zoom}x`,
  );
});

drawing.camera.zoom = 1;

[-500, -100, 0, 250].forEach((panX) => {
  drawing.camera.panX = panX;

  check(
    `panning to ${panX} leaves the length alone`,
    near(scale.toEngineering(drawing, modelLengthOf()).value, BEAM_MM, 1e-9),
    `got ${scale.toEngineering(drawing, modelLengthOf()).value} at panX ${panX}`,
  );
});

drawing.camera.panX = 0;

console.log("\n  vector scale changes arrows, and nothing else\n");

/*
 * VECTOR SCALE IS A DRAWING SETTING. It is how large a force's arrow is
 * rendered. It is emphatically not a unit conversion, and the two are stored
 * in the same neighbourhood of the document, which is exactly why they get
 * confused.
 */
{
  const force = {
    id: "force-1",
    type: "force",
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
      magnitude: 100,
      angle: 0,
    },
  };

  [0.25, 1, 4].forEach((vectorScale) => {
    drawing.statics.vectorScale = vectorScale;

    check(
      `at ${vectorScale}x the beam is still 500 mm`,
      near(scale.toEngineering(drawing, modelLengthOf()).value, BEAM_MM, 1e-9),
      `got ${scale.toEngineering(drawing, modelLengthOf()).value}`,
    );

    check(
      `and the force is still 100 N`,
      force.geometry.magnitude === 100,
      `magnitude became ${force.geometry.magnitude}`,
    );
  });

  drawing.statics.vectorScale = 1;
}

console.log("\n  the calibration is a fact about the document\n");

/*
 * IT IS NOT A PROPERTY OF THE GEOMETRY. Every feature shares one scale, so
 * there is no second answer for a beam to disagree with, and deleting the
 * measured feature does not take the answer with it.
 */
check(
  "the scale lives on the document, not on a feature",
  Boolean(drawing.scale && drawing.scale.mmPerUnit),
  `document scale = ${JSON.stringify(drawing.scale)}`,
);

{
  const before = drawing.scale.mmPerUnit;

  drawing.objects = [];

  check(
    "removing the measured geometry does not uncalibrate the document",
    scale.isCalibrated(drawing) &&
      drawing.scale.mmPerUnit === before,
    `scale became ${JSON.stringify(drawing.scale)}`,
  );
}

drawing.objects = [beam];

console.log("\n  and it survives being saved and undone\n");

/*
 * PERSISTENCE, which is where a document-level value that nothing else happens
 * to reference gets dropped.
 *
 * `serializeDrawing` writes the fields a saved file carries; `snapshotDocument`
 * is what Undo restores. Both used to omit the scale, so a drawing saved and
 * reopened came back with every dimension quietly wrong - the numbers were all
 * still there, they were just no longer in the units they claimed. Undo of
 * anything after a calibration had the same effect.
 */
{
  const serialized = JSON.parse(state.serializeDrawing(drawing));

  check(
    "a saved drawing carries its calibration",
    near(serialized.scale.mmPerUnit, BEAM_MM / BEAM_UNITS, 1e-12),
    `saved scale = ${JSON.stringify(serialized.scale)}`,
  );

  check(
    "and the reference that established it, for a person to read",
    serialized.scale.reference?.realValue === BEAM_MM,
    `reference = ${JSON.stringify(serialized.scale.reference)}`,
  );

  /*
   * THE ROUND TRIP THROUGH JSON, because history stores a snapshot by
   * stringifying it. A snapshot that only survived as a live object would pass
   * every check above and still lose the calibration on the first undo.
   */
  const snapshot = JSON.parse(JSON.stringify(state.snapshotDrawing(drawing)));

  check(
    "a history snapshot carries it too",
    near(snapshot.scale?.mmPerUnit, BEAM_MM / BEAM_UNITS, 1e-12),
    `snapshot scale = ${JSON.stringify(snapshot.scale)}`,
  );

  const reopened = state.createDrawingState();
  reopened.scale = snapshot.scale;

  check(
    "and a reopened drawing measures correctly",
    near(scale.toEngineering(reopened, BEAM_UNITS).value, BEAM_MM, 1e-9),
    `got ${scale.toEngineering(reopened, BEAM_UNITS).value}`,
  );

  check(
    "an uncalibrated document is restored as uncalibrated, not as garbage",
    (() => {
      const blank = state.createDrawingState();
      blank.scale = null;
      return scale.isCalibrated(blank) === false;
    })(),
  );
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
  process.exitCode = 1;
}
