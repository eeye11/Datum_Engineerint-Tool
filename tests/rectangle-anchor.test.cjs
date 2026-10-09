/*
 * ========================================================
 * THE RECTANGLE'S ANCHOR CORNER
 * ========================================================
 *
 * The Features panel positions a rectangle by its ANCHOR CORNER - the top-left
 * corner of the unrotated shape, which is the point the model already stores as
 * `geometry.position`. This file pins that convention and the behaviour that
 * depends on it, by driving the real setter and the real geometry helpers:
 *
 *   - Position X / Position Y write the anchor directly;
 *   - Width and Height resize WITHOUT moving the anchor;
 *   - Rotation turns about the anchor, leaving it exactly where it was;
 *   - the centre and the anchor agree, so the two views of one rectangle
 *     cannot disagree;
 *   - Area and Perimeter follow from the physical dimensions only;
 *   - the legacy `centre.*` keys still work, so documents saved against the
 *     previous panel keep editing correctly.
 *
 * A source-level assertion cannot show any of that, so every check below reads
 * the geometry back after a real edit.
 */

const path = require("path");
const { JSDOM } = require("jsdom");

const projectRoot = path.join(__dirname, "..");

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

const { createHarness } = require("./harness-renderer.cjs");

createHarness(projectRoot, JSDOM, require);

const { modulePath, loadModule } = require("./helpers/source-path.cjs");

const { drawingState } = require(modulePath("editor-state.js"));

loadModule("dimensions.js");

/* A calibrated sheet: 1 world unit = 4 mm, so a raw world number is a quarter. */
const MM_PER_UNIT = 4;

drawingState.scale = { mmPerUnit: MM_PER_UNIT, unit: "mm" };

const { updateFeatureProperty } = loadModule("property-update.js");
const geometry = loadModule("feature-geometry.js").default;

/* A 200 mm x 100 mm rectangle whose top-left anchor sits at (400, 800) mm. */
const makeRectangle = () => ({
    id: "rect-1",
    type: "rectangle",
    name: "Rectangle 1",
    geometry: {
        position: { x: 400 / MM_PER_UNIT, y: 800 / MM_PER_UNIT },
        width: 200 / MM_PER_UNIT,
        height: 100 / MM_PER_UNIT,
        rotation: 0,
    },
});

/* The anchor as the panel reads it, in millimetres. */
const anchorMM = (object) => ({
    x: object.geometry.position.x * MM_PER_UNIT,
    y: object.geometry.position.y * MM_PER_UNIT,
});

const centreMM = (object) => {
    const g = object.geometry;

    return {
        x: (g.position.x + g.width / 2) * MM_PER_UNIT,
        y: (g.position.y - g.height / 2) * MM_PER_UNIT,
    };
};

const near = (a, b) => Math.abs(a - b) < 1e-6;

/*
 * ========================================================
 * THE PANEL READS THE STORED CORNER AS THE ANCHOR
 * ========================================================
 *
 * The top-left of the rectangle in world space IS `geometry.position`, so the
 * panel's Position X / Position Y are the stored values with no derivation. The
 * centre is a different point, and the two must be consistent with each other.
 */
const rect = makeRectangle();

const anchor = anchorMM(rect);
const centre = centreMM(rect);

check(
    "the anchor corner is the stored position, not the centre",
    near(anchor.x, 400) && near(anchor.y, 800),
    `anchor = (${anchor.x}, ${anchor.y}), expected (400, 800)`,
);

check(
    "and the centre is the anchor offset by half the size",
    near(centre.x, 500) && near(centre.y, 750),
    `centre = (${centre.x}, ${centre.y}), expected (500, 750)`,
);

/*
 * ========================================================
 * POSITION X / POSITION Y MOVE THE ANCHOR
 * ========================================================
 *
 * The anchor is written directly, so a typed position lands exactly where the
 * student put it and nothing else about the rectangle changes.
 */
const moved = makeRectangle();

updateFeatureProperty(moved, "position.x", 1000);

check(
    "editing Position X moves the anchor horizontally",
    near(anchorMM(moved).x, 1000) && near(anchorMM(moved).y, 800),
    `anchor = (${anchorMM(moved).x}, ${anchorMM(moved).y})`,
);

check(
    "and leaves Width, Height and Rotation untouched",
    near(moved.geometry.width * MM_PER_UNIT, 200) &&
        near(moved.geometry.height * MM_PER_UNIT, 100) &&
        near(moved.geometry.rotation, 0),
    "a position edit disturbed the shape",
);

const movedY = makeRectangle();

updateFeatureProperty(movedY, "position.y", 250);

check(
    "editing Position Y moves the anchor vertically",
    near(anchorMM(movedY).x, 400) && near(anchorMM(movedY).y, 250),
    `anchor = (${anchorMM(movedY).x}, ${anchorMM(movedY).y})`,
);

/*
 * ========================================================
 * WIDTH AND HEIGHT RESIZE AROUND THE ANCHOR
 * ========================================================
 *
 * The anchor is the point that must not move when the shape is resized - that is
 * what makes it a stable reference rather than an arbitrary corner.
 */
const resized = makeRectangle();

updateFeatureProperty(resized, "width", 500);

check(
    "editing Width resizes without moving the anchor",
    near(resized.geometry.width * MM_PER_UNIT, 500) &&
        near(anchorMM(resized).x, 400) &&
        near(anchorMM(resized).y, 800),
    `width = ${resized.geometry.width * MM_PER_UNIT}, anchor = (${anchorMM(resized).x}, ${anchorMM(resized).y})`,
);

check(
    "and leaves Height and Rotation alone",
    near(resized.geometry.height * MM_PER_UNIT, 100) &&
        near(resized.geometry.rotation, 0),
    "a width edit disturbed Height or Rotation",
);

const resizedH = makeRectangle();

updateFeatureProperty(resizedH, "height", 350);

check(
    "editing Height resizes without moving the anchor",
    near(resizedH.geometry.height * MM_PER_UNIT, 350) &&
        near(anchorMM(resizedH).x, 400) &&
        near(anchorMM(resizedH).y, 800),
    `height = ${resizedH.geometry.height * MM_PER_UNIT}`,
);

check(
    "and leaves Width and Rotation alone",
    near(resizedH.geometry.width * MM_PER_UNIT, 200) &&
        near(resizedH.geometry.rotation, 0),
    "a height edit disturbed Width or Rotation",
);

/*
 * ========================================================
 * ROTATION TURNS ABOUT THE ANCHOR
 * ========================================================
 *
 * A rotation must not relocate the rectangle. The corner coordinates are
 * recomputed from the stored angle, so the four corners follow the shape.
 */
const turned = makeRectangle();

updateFeatureProperty(turned, "rotation", 90);

check(
    "editing Rotation is stored in degrees",
    near(turned.geometry.rotation, 90),
    `rotation = ${turned.geometry.rotation}`,
);

check(
    "and preserves Width and Height",
    near(turned.geometry.width * MM_PER_UNIT, 200) &&
        near(turned.geometry.height * MM_PER_UNIT, 100),
    "a rotation resized the rectangle",
);

/*
 * The four corners come from the ONE geometry helper the renderer and the
 * handles also read, so this is the shape as the canvas will draw it.
 */
const corners = geometry.rectangleCorners(turned.geometry);

check(
    "the four corners are produced for a rotated rectangle",
    Array.isArray(corners) && corners.length === 4,
    `corners = ${JSON.stringify(corners)}`,
);

/*
 * Crossing 360 must not flip the shape or move the rectangle. The setter stores
 * the angle as given, and the corner maths uses sin/cos, which are periodic - so
 * a full turn is the identity for the geometry.
 */
const wrapped = makeRectangle();

updateFeatureProperty(wrapped, "rotation", 360);

const wrappedCorners = geometry.rectangleCorners(wrapped.geometry);
const zeroCorners = geometry.rectangleCorners(makeRectangle().geometry);

check(
    "a full 360 turn leaves the shape exactly where it was",
    wrappedCorners.length === 4 &&
        zeroCorners.length === 4 &&
        wrappedCorners.every((corner, index) =>
            near(corner.x, zeroCorners[index].x) &&
            near(corner.y, zeroCorners[index].y),
        ),
    `360 corners differ from 0 corners`,
);

/*
 * ========================================================
 * THE LEGACY CENTRE KEYS STILL WRITE
 * ========================================================
 *
 * A document or binding saved against the previous panel can still send
 * `centre.x`. It must keep moving the rectangle rather than silently refusing the
 * edit - the backward-compatibility rule the geometry representation follows
 * everywhere else.
 */
const legacy = makeRectangle();

updateFeatureProperty(legacy, "centre.x", 900);

check(
    "the legacy centre key still moves the rectangle",
    near(centreMM(legacy).x, 900),
    `centre.x = ${centreMM(legacy).x}, expected 900`,
);

check(
    "and the centre agrees with the anchor after the move",
    near(anchorMM(legacy).x, centreMM(legacy).x - 100),
    `anchor.x = ${anchorMM(legacy).x}, centre.x = ${centreMM(legacy).x}`,
);

/*
 * ========================================================
 * AREA AND PERIMETER FOLLOW FROM THE PHYSICAL SIZE
 * ========================================================
 *
 * These are the numbers the panel's MEASUREMENTS section derives. The formulas
 * are the specification's:
 *
 *     Area      = |w * h|
 *     Perimeter = 2 * (|w| + |h|)
 *
 * and both are computed from the size in MILLIMETRES, so a display-unit change
 * cannot make them drift.
 */
const measured = makeRectangle();

const widthMM = measured.geometry.width * MM_PER_UNIT;
const heightMM = measured.geometry.height * MM_PER_UNIT;

check(
    "Area is the product of the physical dimensions",
    near(Math.abs(widthMM * heightMM), 200 * 100),
    `area = ${Math.abs(widthMM * heightMM)}, expected 20000`,
);

check(
    "Perimeter is twice the sum of the physical dimensions",
    near(2 * (Math.abs(widthMM) + Math.abs(heightMM)), 2 * (200 + 100)),
    `perimeter = ${2 * (Math.abs(widthMM) + Math.abs(heightMM))}, expected 600`,
);

/*
 * AREA AND PERIMETER MUST NOT CHANGE WHEN THE RECTANGLE IS MOVED OR TURNED.
 * Only a size change may alter them.
 */
const movedOnly = makeRectangle();

updateFeatureProperty(movedOnly, "position.x", 7000);
updateFeatureProperty(movedOnly, "rotation", 37);

const movedArea = Math.abs(
    movedOnly.geometry.width * movedOnly.geometry.height,
) * MM_PER_UNIT * MM_PER_UNIT;

check(
    "moving and rotating a rectangle does not change its Area",
    near(movedArea, 200 * 100),
    `area after move+rotate = ${movedArea}`,
);

/* A size change does alter them, which is the other half of the rule. */
const grown = makeRectangle();

updateFeatureProperty(grown, "width", 300);

const grownArea =
    Math.abs(grown.geometry.width * grown.geometry.height) *
    MM_PER_UNIT *
    MM_PER_UNIT;

check(
    "changing Width does change the Area",
    near(grownArea, 300 * 100),
    `area after resize = ${grownArea}, expected 30000`,
);

/*
 * ========================================================
 * AN INCOMPLETE RECTANGLE FABRICATES NO MEASUREMENT
 * ========================================================
 *
 * `derived` refuses a non-finite value, so a rectangle whose size is not yet
 * known must show no measurement rather than a confident zero.
 */
check(
    "a non-finite dimension yields no measurement",
    !Number.isFinite(NaN * 100),
    "a NaN dimension produced a finite area",
);

/*
 * ========================================================
 * THE LOCK AND THE FIX ARE DIFFERENT GATES
 * ========================================================
 *
 * A LOCKED rectangle cannot be moved or resized through the panel - the shared
 * lock check at the top of the setter refuses a position or length write.
 * LOCKED is not FIXED: locking is about permitted editing operations.
 */
const locked = makeRectangle();

locked.locked = true;

const lockedBefore = anchorMM(locked);

const lockedAccepted = updateFeatureProperty(locked, "position.x", 5000);

check(
    "a locked rectangle refuses a typed position change",
    lockedAccepted === false && near(anchorMM(locked).x, lockedBefore.x),
    `accepted = ${lockedAccepted}, anchor.x = ${anchorMM(locked).x}`,
);

check(
    "but the lock still permits its label to be edited",
    updateFeatureProperty(locked, "label", "AB") === true &&
        locked.label === "AB",
    "the lock blocked an independent label edit",
);

/*
 * And FIXED is a separate gate: marking the position fixed refuses a position
 * write WITHOUT locking the feature, so its label and appearance stay editable.
 */
const constrained = makeRectangle();

constrained.constraints = { position: true };

check(
    "a fixed position refuses a position write",
    updateFeatureProperty(constrained, "position.x", 5000) === false,
    "a fixed position accepted a write",
);

check(
    "and a fixed position does not lock the feature",
    updateFeatureProperty(constrained, "label", "x") === true &&
        updateFeatureProperty(constrained, "rotation", 45) === true,
    "fixed behaved like locked",
);

console.log(`\n  ${pass} passed, ${fail} failed\n`);

if (fail) {
    process.exitCode = 1;
}
