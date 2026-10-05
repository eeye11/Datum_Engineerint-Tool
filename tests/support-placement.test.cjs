
const { JSDOM } = require("jsdom");

const path = require("path");

const { loadModule, locate, modulePath, sourceDir } = require("./helpers/source-path.cjs");
/*
 * ========================================================
 * DOES A SUPPORT LAND WHERE IT WAS PLACED?
 * ========================================================
 *
 * Placing a support at the middle of a beam drew it at one end. That was
 * reported as "supports jump to the end when selected/placed", and it is
 * worth being precise about the cause, because the obvious suspects are all
 * innocent:
 *
 *   - the placement path used the cursor's point correctly;
 *   - the snap resolved the body correctly;
 *   - the renderer recomputes the drawn position from the attachment on
 *     every frame, which is right and is not the bug.
 *
 * The bug was that a support carries TWO positions. It stores the
 * `position` it was created at, and it stores an `attachment` - a distance
 * along the parent body - and the renderer PREFERS the attachment:
 *
 *     const attachmentPoint = frame
 *         ? attachmentPoint(frame, geometry.attachment)
 *         : null;
 *
 * All four support factories seeded that attachment with a constant:
 *
 *     attachment: { distance: 0 }
 *
 * so every support resolved to fraction 0 of the member - its start - no
 * matter where the cursor was. The click was recorded correctly and then
 * discarded in favour of a value written at construction time, and nothing
 * anywhere could see the disagreement because the renderer never looks at
 * the stored position when a parent exists.
 *
 * The fix is that the attachment is seeded FROM the position the tool
 * passed in. This checks that the two no longer disagree, and that the
 * support's drawn place follows the click.
 */


const projectRoot = path.join(__dirname, "..");

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

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
});

global.window = dom.window;
global.document = dom.window.document;

for (const name of [
  "body-frames.js",
  "drawing-state.js",
]) {
  try {
    loadModule(name);
  } catch (error) {
    console.log(`  (could not load ${name}: ${error.message})`);
  }
}

for (const name of ["enggDrawingState", "enggBodyFrames"]) {
  if (global.window[name]) {
    global[name] = global.window[name];
  }
}

const S = global.window.enggDrawingState;
const frames = global.window.enggBodyFrames;

const near = (a, b, tolerance = 1e-6) =>
  Math.abs(a - b) < tolerance;

/* A level 100 mm beam running left to right. */
const beam = {
  id: "beam-1",
  type: "beam",
  geometry: {
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
    length: 100,
    depth: 20
  }
};

const frame = frames.frameOf(beam);

const SUPPORT_TYPES = [
  "pin-support",
  "roller-support",
  "fixed-support",
  "smooth-support"
];

console.log("\n  a support's attachment agrees with where it was put\n");

/*
 * THE MIDPOINT, which is the case that matters: a roller under the middle
 * of a simply supported beam is the commonest thing a student draws, and
 * it is the one that was reported as jumping.
 */
const middle = { x: 50, y: 0 };

SUPPORT_TYPES.forEach(type => {
  const support = S.geometryFactories[type](middle);

  const resolved = frames.attachmentPoint(
    frame,
    support.geometry.attachment,
  );

  check(
    `a ${type} placed at the midpoint resolves there`,
    resolved &&
      near(resolved.x, middle.x) &&
      near(resolved.y, middle.y),
    resolved
      ? `resolved to (${resolved.x}, ${resolved.y}), placed at (${middle.x}, ${middle.y})`
      : "no attachment resolved at all",
  );
});

console.log("\n  and at three quarters along, not at one end\n");

[
  ["a quarter along", { x: 25, y: 0 }],
  ["three quarters along", { x: 75, y: 0 }],
  ["at the far end", { x: 100, y: 0 }]
].forEach(([what, point]) => {
  const support = S.geometryFactories["pin-support"](point);

  const resolved = frames.attachmentPoint(
    frame,
    support.geometry.attachment,
  );

  check(
    `a pin support ${what} stays there`,
    resolved && near(resolved.x, point.x),
    resolved
      ? `placed at x=${point.x}, resolved to x=${resolved.x}`
      : "nothing resolved",
  );
});

console.log("\n  the two positions on the feature cannot disagree\n");

/*
 * THE PROPERTY THAT ACTUALLY MATTERS. The renderer uses the attachment and
 * ignores the position whenever a parent exists, so the only test that
 * counts is whether the two agree - not whether each is individually
 * plausible.
 */
SUPPORT_TYPES.forEach(type => {
  const point = { x: 62.5, y: 0 };
  const support = S.geometryFactories[type](point);

  const fromAttachment = frames.attachmentPoint(
    frame,
    support.geometry.attachment,
  );

  const stored = support.geometry.position;

  check(
    `a ${type}'s stored position and its attachment are the same point`,
    near(stored.x, fromAttachment.x) &&
      near(stored.y, fromAttachment.y),
    `position (${stored.x}, ${stored.y}) vs attachment (${fromAttachment.x}, ${fromAttachment.y})`,
  );
});

console.log("\n  it follows the member when the member moves\n");

/*
 * THE POINT OF STORING AN ATTACHMENT AT ALL. It is not to fix the drawing
 * in one place; it is so that a support keeps its relationship to the beam
 * when the beam is moved, rotated or resized. A support pinned by its
 * attachment still moves with its parent after the fix.
 */
const moved = {
  ...beam,
  geometry: {
    ...beam.geometry,
    start: { x: 500, y: 300 },
    end: { x: 600, y: 300 }
  }
};

const movedFrame = frames.frameOf(moved);

const travelling = S.geometryFactories["pin-support"](middle);

const afterMove = frames.attachmentPoint(
  movedFrame,
  travelling.geometry.attachment,
);

check(
  "a support on a moved beam is drawn on the moved beam",
  near(afterMove.x, 550) && near(afterMove.y, 300),
  `resolved to (${afterMove.x}, ${afterMove.y}), expected (550, 300)`,
);

console.log("\n  it follows a rotated member too\n");

/*
 * The distance is measured ALONG the member, so a beam turned through 90
 * degrees reports the same station - and the support stays where it was
 * put rather than sliding off the end. This is what would break if the
 * attachment were stored as a raw x offset.
 */
const upright = {
  ...beam,
  geometry: {
    ...beam.geometry,
    start: { x: 0, y: 0 },
    end: { x: 0, y: 100 }
  }
};

const uprightFrame = frames.frameOf(upright);

const onUpright = frames.attachmentPoint(
  uprightFrame,
  travelling.geometry.attachment,
);

check(
  "a support halfway along a vertical beam is halfway up it",
  near(onUpright.x, 0) && near(onUpright.y, 50),
  `resolved to (${onUpright.x}, ${onUpright.y}), expected (0, 50)`,
);

console.log("\n  an attachment the caller worked out is left alone\n");

/*
 * The placement path DOES know the body frame, so it sets the attachment
 * itself. Seeding must not overwrite that: it is a default for the callers
 * that have not worked one out, not an authority over the ones that have.
 */
const workedOut = {
  fraction: 0.25,
  unit: "fraction"
};

const support = S.geometryFactories["pin-support"](middle);

support.geometry.attachment = workedOut;

const kept = frames.attachmentPoint(frame, support.geometry.attachment);

check(
  "a fraction attachment is honoured exactly",
  kept && near(kept.x, 25) && near(kept.y, 0),
  `resolved to (${kept?.x}, ${kept?.y}), expected (25, 0)`,
);

console.log("\n  a support with no position still starts at the beginning\n");

const homeless = S.geometryFactories["pin-support"]();

const fallback = frames.attachmentPoint(
  frame,
  homeless.geometry.attachment,
);

check(
  "and it does not throw",
  fallback !== null,
);

check(
  "and it resolves to the start, which is the only thing left",
  near(fallback.x, 0),
  `resolved to x=${fallback.x}`,
);

console.log(
  `\n${pass} passed, ${fail} failed\n`,
);

if (fail) {
  process.exitCode = 1;
}
